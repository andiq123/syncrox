package hub

import (
	"crypto/rand"
	"fmt"
)

const codeLen = 6
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

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
	for _, c := range code {
		if !containsRune(codeAlphabet, c) {
			return false
		}
	}
	return true
}

func containsRune(s string, r rune) bool {
	for _, c := range s {
		if c == r {
			return true
		}
	}
	return false
}
