package hub

import (
	"crypto/rand"
	"fmt"
	"strings"
)

const (
	codeLen      = 6
	codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
)

func GenerateRoomCode() (string, error) {
	b := make([]byte, codeLen)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate room code: %w", err)
	}
	for i := range b {
		b[i] = codeAlphabet[int(b[i])%len(codeAlphabet)]
	}
	return string(b), nil
}

func ValidateRoomCode(code string) bool {
	if len(code) != codeLen {
		return false
	}
	for _, r := range code {
		if !strings.ContainsRune(codeAlphabet, r) {
			return false
		}
	}
	return true
}
