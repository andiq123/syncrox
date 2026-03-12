// Package hub manages rooms and peers in memory only. No messages or file
// content are stored; when the last peer leaves a room it is removed.
// Broadcast blocks on send (backpressure) so slow receivers throttle senders;
// peer context is used to avoid blocking on disconnected peers.
package hub

import (
	"context"
	"sync"
)

// Peer is a single connection in a room. Send receives relayed messages.
// Ctx is cancelled when the peer disconnects so Broadcast can stop sending.
type Peer struct {
	ID   string
	Send chan []byte
	Ctx  context.Context
}

const MaxPeersPerRoom = 5

// Room holds up to MaxPeersPerRoom peers. Access to Peers is guarded by mu.
type Room struct {
	Code  string
	Peers map[string]*Peer
	mu    sync.RWMutex
}

// Broadcast sends data to every peer except excludeID. It blocks until the
// message is sent or the peer's context is done (backpressure, no drops).
func (r *Room) Broadcast(excludeID string, data []byte) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for id, p := range r.Peers {
		if id == excludeID {
			continue
		}
		select {
		case p.Send <- data:
		case <-p.Ctx.Done():
			// Peer disconnected; skip instead of blocking forever
		}
	}
}

func (r *Room) Add(p *Peer) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.Peers) >= MaxPeersPerRoom {
		return false
	}
	r.Peers[p.ID] = p
	return true
}

func (r *Room) Remove(peerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.Peers, peerID)
}

func (r *Room) PeerCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.Peers)
}

type Hub struct {
	rooms map[string]*Room
	mu    sync.RWMutex
}

func New() *Hub {
	return &Hub{
		rooms: make(map[string]*Room),
	}
}

var ErrRoomFull = errRoomFull{}

type errRoomFull struct{}

func (errRoomFull) Error() string {
	return "room is full"
}

var ErrRoomNotFound = errRoomNotFound{}

type errRoomNotFound struct{}

func (errRoomNotFound) Error() string {
	return "room not found"
}

func (h *Hub) CreateRoom(code string) (*Room, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, exists := h.rooms[code]; exists {
		return nil, false
	}
	r := &Room{
		Code:  code,
		Peers: make(map[string]*Peer),
	}
	h.rooms[code] = r
	return r, true
}

func (h *Hub) GetRoom(code string) *Room {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.rooms[code]
}

func (h *Hub) JoinRoom(ctx context.Context, code string, p *Peer) (*Room, error) {
	h.mu.Lock()
	r, ok := h.rooms[code]
	if !ok {
		h.mu.Unlock()
		return nil, ErrRoomNotFound
	}
	h.mu.Unlock()

	if !r.Add(p) {
		return nil, ErrRoomFull
	}
	return r, nil
}

func (h *Hub) LeaveRoom(code string, peerID string) {
	h.mu.Lock()
	r := h.rooms[code]
	if r != nil {
		r.Remove(peerID)
		if r.PeerCount() == 0 {
			delete(h.rooms, code)
		}
	}
	h.mu.Unlock()
}

func (h *Hub) RoomExists(code string) bool {
	h.mu.RLock()
	_, ok := h.rooms[code]
	h.mu.RUnlock()
	return ok
}
