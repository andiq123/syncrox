package protocol

const (
	TypeJoin          = "join"
	TypeJoined        = "joined"
	TypePeerJoined    = "peer_joined"
	TypeError         = "error"
	TypeText          = "text"
	TypeComposing     = "composing"
	TypeFileStart     = "file_start"
	TypeFileChunk     = "file_chunk"
	TypeFileEnd       = "file_end"
	TypeServerClosing = "server_closing"
)

const DefaultChunkSize = 512 * 1024

type Envelope struct {
	Type    string `json:"type"`
	Payload any    `json:"payload,omitempty"`
}

type JoinPayload struct {
	Code string `json:"code"`
}

type JoinedPayload struct {
	Code  string     `json:"code"`
	Name  string     `json:"name"`
	Peers []PeerInfo `json:"peers,omitempty"`
}

type PeerInfo struct {
	ID   string `json:"peer_id"`
	Name string `json:"name"`
}

type PeerJoinedPayload struct {
	PeerID string `json:"peer_id"`
	Name   string `json:"name"`
}

type ErrorPayload struct {
	Message string `json:"message"`
}

type TextPayload struct {
	Body string `json:"body"`
}

type ComposingPayload struct {
	Active bool `json:"active"`
}

type FileStartPayload struct {
	TransferID string `json:"transfer_id"`
	Name       string `json:"name"`
	Size       int64  `json:"size"`
	MimeType   string `json:"mime_type,omitempty"`
}

type FileChunkPayload struct {
	TransferID string `json:"transfer_id"`
	Index      int    `json:"index"`
	Data       string `json:"data"`
}

type FileEndPayload struct {
	TransferID string `json:"transfer_id"`
}
