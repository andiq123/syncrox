// Package ws handles WebSocket upgrades and relays frames between peers in a room.
// It does not store or persist any message or file content. Optimized for large
// file transfers (100GB+): stream-one-message-at-a-time relay, buffer pool to
// avoid allocations, and backpressure so memory stays bounded on low-RAM hosts.
package ws

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
	"sync/atomic"

	"github.com/gorilla/websocket"

	"github.com/syncrox/syncrox/internal/hub"
	"github.com/syncrox/syncrox/internal/protocol"
)

const (
	// RelayBufferSize is the size of one relay buffer. Must fit binary chunk:
	// 512KB payload + transferId + index (~768KB).
	RelayBufferSize = 768 * 1024
	// SendQueueCap is the number of messages buffered per peer. Memory per peer
	// is at most SendQueueCap * RelayBufferSize (e.g. 16 * 768KB = 12MB).
	SendQueueCap = 16
)

var defaultUpgrader = websocket.Upgrader{
	ReadBufferSize:  RelayBufferSize,
	WriteBufferSize: RelayBufferSize,
}

type Handler struct {
	Hub                 *hub.Hub
	Upgrader            websocket.Upgrader
	AllowOrigins        []string
	DefaultSessionCode  string
	peerIDGen           atomic.Uint64
	bufPool             sync.Pool
}

func NewHandler(h *hub.Hub, allowOrigins []string, defaultSessionCode string) *Handler {
	u := defaultUpgrader
	u.CheckOrigin = func(r *http.Request) bool {
		if len(allowOrigins) == 0 {
			return true
		}
		origin := r.Header.Get("Origin")
		for _, o := range allowOrigins {
			if o == origin {
				return true
			}
		}
		return false
	}
	return &Handler{
		Hub:                h,
		Upgrader:           u,
		AllowOrigins:       allowOrigins,
		DefaultSessionCode: defaultSessionCode,
		bufPool: sync.Pool{
			New: func() any { return make([]byte, RelayBufferSize) },
		},
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	slog.Info("ws connection attempt", "remote", r.RemoteAddr, "code", r.URL.Query().Get("code"))
	code := r.URL.Query().Get("code")
	if code == "" || !hub.ValidateRoomCode(code) {
		http.Error(w, "invalid or missing room code", http.StatusBadRequest)
		return
	}

	if h.Hub.GetRoom(code) == nil {
		if code == h.DefaultSessionCode {
			h.Hub.CreateRoom(code)
		} else {
			http.Error(w, "room not found", http.StatusNotFound)
			return
		}
	}

	slog.Info("ws upgrading", "remote", r.RemoteAddr)
	conn, err := h.Upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("websocket upgrade failed", "err", err, "remote", r.RemoteAddr)
		return
	}
	defer conn.Close()

	peerID := h.nextPeerID()
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	peer := &hub.Peer{
		ID:   peerID,
		Send: make(chan []byte, SendQueueCap),
		Ctx:  ctx,
	}

	room, err := h.Hub.JoinRoom(r.Context(), code, peer)
	if err != nil {
		slog.Warn("join room failed", "code", code, "peer", peerID, "err", err)
		writeError(conn, err.Error())
		return
	}
	defer h.Hub.LeaveRoom(code, peerID)

	slog.Info("peer joined", "room", code, "peer", peerID)

	if err := writeJoined(conn, code); err != nil {
		slog.Warn("write joined failed", "err", err, "peer", peerID)
		return
	}

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		h.writePump(ctx, conn, peer)
	}()

	h.readPump(ctx, conn, room, peer)
	cancel()
	close(peer.Send)
	wg.Wait()
}

func (h *Handler) nextPeerID() string {
	n := h.peerIDGen.Add(1)
	return strconvUint64(n)
}

func strconvUint64(n uint64) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

func (h *Handler) readPump(ctx context.Context, conn *websocket.Conn, room *hub.Room, peer *hub.Peer) {
	defer conn.Close()
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		messageType, raw, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				return
			}
			slog.Debug("read message failed", "err", err)
			return
		}
		relay := h.copyForRelay(messageType, raw)
		if relay == nil {
			continue
		}
		room.Broadcast(peer.ID, relay)
	}
}

// copyForRelay stores messageType in the first byte and raw in the rest. Caller must returnToPool.
func (h *Handler) copyForRelay(messageType int, raw []byte) []byte {
	if 1+len(raw) > RelayBufferSize {
		slog.Debug("relay message too large, dropped", "len", len(raw), "max", RelayBufferSize-1)
		return nil
	}
	buf := h.bufPool.Get().([]byte)
	buf[0] = byte(messageType)
	n := copy(buf[1:], raw)
	return buf[:1+n]
}

func (h *Handler) writePump(ctx context.Context, conn *websocket.Conn, peer *hub.Peer) {
	for {
		select {
		case <-ctx.Done():
			return
		case data, ok := <-peer.Send:
			if !ok {
				return
			}
			messageType := int(data[0])
			payload := data[1:]
			if err := conn.WriteMessage(messageType, payload); err != nil {
				slog.Debug("write message failed", "err", err)
				h.returnToPool(data)
				return
			}
			h.returnToPool(data)
		}
	}
}

func (h *Handler) returnToPool(b []byte) {
	if cap(b) >= RelayBufferSize {
		h.bufPool.Put(b[:cap(b)])
	}
}

func writeError(conn *websocket.Conn, msg string) {
	body, _ := protocol.EncodeEnvelope(&protocol.Envelope{
		Type:    protocol.TypeError,
		Payload: protocol.ErrorPayload{Message: msg},
	})
	_ = conn.WriteMessage(websocket.TextMessage, body)
}

func writeJoined(conn *websocket.Conn, code string) error {
	body, err := protocol.EncodeEnvelope(&protocol.Envelope{
		Type:    protocol.TypeJoined,
		Payload: protocol.JoinedPayload{Code: code},
	})
	if err != nil {
		return err
	}
	return conn.WriteMessage(websocket.TextMessage, body)
}
