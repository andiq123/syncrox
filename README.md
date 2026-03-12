# syncroX

A minimal sync server that lets two clients (e.g. macOS and Windows) connect through a website to transfer files and text messages. Built with a Go WebSocket backend and a React frontend. Everyone who opens the app joins the same session—no codes to create or enter.

## Features

- **Single session**: Open the app on two devices (or two browser tabs). They connect to one shared room automatically.
- **Text**: Send and receive plain text messages in real time.
- **Files**: Send and receive files of any size; large files are sent in chunks with progress (optimized for 100GB+ with bounded memory).

## Quick start

### Development

1. **Start the Go server** (API + WebSocket, serves built frontend if present):

   ```bash
   go run ./cmd/server
   ```

   Listens on `http://localhost:5090` by default. Set `PORT` to change it.

   For live reload on Go changes, use [Air](https://github.com/air-verse/air):

   ```bash
   go install github.com/air-verse/air@latest
   air
   ```

2. **Start the React dev server** (with hot reload and proxy to the Go server):

   ```bash
   cd web && npm install && npm run dev
   ```

   Open `http://localhost:5173`. Vite proxies `/api` and `/ws` to the Go server on port 5090.

3. **Use two clients**: Open the app in two browser tabs (or two devices on the same network). Both connect to the same session automatically and can send messages and files to each other.

### Production

1. **Build the frontend** into the Go embed directory:

   ```bash
   cd web && npm run build
   ```

   Output goes to `internal/static/files`.

2. **Build and run the server**:

   ```bash
   go build -o syncrox ./cmd/server
   ./syncrox
   ```

   The binary serves the React app and the API on one port (default `5090`). Set `PORT` if needed.

   Or use the Makefile: `make build` then `make run`. For Raspberry Pi (linux/arm64): `make build-pi`, then copy the `syncrox` binary to the Pi.

## Project layout

```
syncroX/
├── cmd/server/          # Go server entrypoint
├── internal/
│   ├── hub/             # Room registry, peer broadcast
│   ├── protocol/        # WebSocket message types and codec
│   ├── serve/           # SPA static file serving
│   ├── static/          # Embedded frontend (web build output)
│   └── ws/              # WebSocket upgrade and client loop
├── web/                 # React (Vite + TypeScript) app
│   ├── src/
│   └── package.json
├── go.mod
├── Makefile
└── README.md
```

## API

- `GET /api/health` — Health check. Returns `200` with body `ok`.
- `GET /api/session` — Returns the current session info, e.g. `{ "code": "..." }`. Used by the frontend to connect; no user-facing codes.
- `GET /ws?code=...` — WebSocket upgrade. Client passes the session code from `/api/session`. Only two peers per room.

## Requirements

- Go 1.22+
- Node.js 18+ (for building the web app)
