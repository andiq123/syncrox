package protocol

import (
	"encoding/json"
	"fmt"
)

func DecodeEnvelope(raw []byte) (*Envelope, error) {
	var e Envelope
	if err := json.Unmarshal(raw, &e); err != nil {
		return nil, fmt.Errorf("decode envelope: %w", err)
	}
	return &e, nil
}

func EncodeEnvelope(e *Envelope) ([]byte, error) {
	return json.Marshal(e)
}
