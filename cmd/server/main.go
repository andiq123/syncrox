package main

import (
	"context"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/syncrox/syncrox/internal/hub"
	"github.com/syncrox/syncrox/internal/serve"
	"github.com/syncrox/syncrox/internal/static"
	"github.com/syncrox/syncrox/internal/ws"
)


func main() {
	logger := slog.Default()
	port := os.Getenv("PORT")
	if port == "" {
		port = "5090"
	}
	h := hub.New()
	const defaultSessionCode = "DEFAULT"
	wsHandler := ws.NewHandler(h, nil, defaultSessionCode)

	mux := http.NewServeMux()

	var healthOK = []byte("ok")
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write(healthOK)
	})

	mux.Handle("GET /ws", wsHandler)

	staticRoot, err := fs.Sub(static.FS, "files")
	if err != nil {
		logger.Error("static fs sub", "err", err)
		os.Exit(1)
	}
	mux.Handle("/", serve.SPA(http.FS(staticRoot)))

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      corsMiddleware(nil, mux),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	go func() {
		logger.Info("server listening", "port", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server error", "err", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("shutdown error", "err", err)
	}
	logger.Info("server stopped")
}

func corsMiddleware(origins []string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if len(origins) == 0 {
			if origin != "" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			}
		} else {
			for _, o := range origins {
				if o == origin {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					break
				}
			}
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
