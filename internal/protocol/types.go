// Package protocol defines the WebSocket message envelope and payload types
// used between client and server. The server relays messages as opaque frames;
// chunk size is a client-side choice and must fit within the server's relay buffer.
package protocol

const (
	TypeJoin           = "join"
	TypeJoined         = "joined"
	TypeError          = "error"
	TypeText           = "text"
	TypeFileStart      = "file_start"
	TypeFileChunk      = "file_chunk"
	TypeFileEnd        = "file_end"
	TypeServerClosing  = "server_closing"
)

// DefaultChunkSize is the default file chunk size (512KB). Binary protocol;
// relay buffer must fit chunk + small header (~768KB).
const DefaultChunkSize = 512 * 1024

type Envelope struct {
	Type    string `json:"type"`
	Payload any    `json:"payload,omitempty"`
}

type JoinPayload struct {
	Code string `json:"code"`
}

type JoinedPayload struct {
	Code string `json:"code"`
}

type ErrorPayload struct {
	Message string `json:"message"`
}

type TextPayload struct {
	Body string `json:"body"`
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
