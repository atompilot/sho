package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/atompilot/sho-api/internal/handler"
	shoMCP "github.com/atompilot/sho-api/internal/mcp"
	"github.com/atompilot/sho-api/internal/service"
	"github.com/atompilot/sho-api/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func main() {
	ctx := context.Background()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://sho:sho_dev_password@localhost:5433/sho?sslmode=disable"
	}

	pool, err := store.NewPool(ctx, dbURL)
	if err != nil {
		log.Fatalf("connect db: %v", err)
	}
	defer pool.Close()

	postStore := store.NewPostStore(pool)
	postSvc := service.NewPostService(postStore)
	postHandler := handler.NewPostHandler(postSvc)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/posts", postHandler.Create)
		r.Get("/posts/{slug}", postHandler.Get)
		r.Put("/posts/{slug}", postHandler.Update)
		r.Delete("/posts/{slug}", postHandler.Delete)
		r.Get("/posts", postHandler.List)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Mount MCP server at /mcp (HTTP SSE transport)
	baseURL := os.Getenv("BASE_URL")
	if baseURL == "" {
		baseURL = fmt.Sprintf("http://localhost:%s", port)
	}
	mcpSrv := shoMCP.NewMCPServer(postSvc)
	sseServer := shoMCP.SSEServer(mcpSrv, baseURL)
	r.Get("/mcp/sse", sseServer.SSEHandler().ServeHTTP)
	r.Post("/mcp/message", sseServer.MessageHandler().ServeHTTP)

	log.Printf("sho-api listening on :%s (REST /api/v1, MCP /mcp)", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
