package hub

import (
	"context"
	"sync"
)

type Peer struct {
	ID   string
	Name string
	Send chan []byte
	Ctx  context.Context
}

type PeerInfo struct {
	ID   string `json:"peer_id"`
	Name string `json:"name"`
}

const MaxPeersPerRoom = 5

type Room struct {
	Code  string
	Peers map[string]*Peer
	mu    sync.RWMutex
}

type CopyFn func(data []byte) []byte

func (r *Room) Broadcast(excludeID string, data []byte, copyFn CopyFn) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for id, p := range r.Peers {
		if id == excludeID {
			continue
		}
		payload := data
		if copyFn != nil {
			payload = copyFn(data)
		}
		select {
		case p.Send <- payload:
		case <-p.Ctx.Done():
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

func (r *Room) PeerInfos(excludeID string) []PeerInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]PeerInfo, 0, len(r.Peers))
	for id, p := range r.Peers {
		if id == excludeID {
			continue
		}
		out = append(out, PeerInfo{ID: id, Name: p.Name})
	}
	return out
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
