# One command to build frontend (into internal/static/files) and Go.
# Usage: make build

.PHONY: build build-pi run
build:
	cd web && npm run build
	go build ./...

run: build
	go run ./cmd/server

# Optimized binary for Raspberry Pi (linux/arm64, aarch64). Single file with frontend embedded.
# Copy to Pi: scp syncrox andiq@rasp:~/
BINARY_PI := syncrox
build-pi: build
	GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o $(BINARY_PI) ./cmd/server