package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/atompilot/sho-api/internal/handler"
	"github.com/atompilot/sho-api/internal/llm"
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
		dbURL = "postgres://sho:sho_dev_password@localhost:15432/sho?sslmode=disable"
	}

	pool, err := store.NewPool(ctx, dbURL)
	if err != nil {
		log.Fatalf("connect db: %v", err)
	}
	defer pool.Close()

	// Run database migrations on startup
	conn, err := pool.Acquire(ctx)
	if err != nil {
		log.Fatalf("acquire conn for migration: %v", err)
	}
	if err := store.RunMigrations(ctx, conn.Conn()); err != nil {
		log.Fatalf("migration failed: %v", err)
	}
	conn.Release()

	postStore := store.NewPostStore(pool)
	postSvc := service.NewPostService(postStore)
	postHandler := handler.NewPostHandler(postSvc)

	var chatHandler *handler.ChatHandler
	if arkKey := os.Getenv("ARK_API_KEY"); arkKey != "" {
		arkBaseURL := os.Getenv("ARK_BASE_URL")
		if arkBaseURL == "" {
			arkBaseURL = "https://ark.cn-beijing.volces.com/api/v3"
		}
		arkModel := os.Getenv("ARK_MODEL")
		if arkModel == "" {
			arkModel = "doubao-seed-2-0-lite-260215"
		}
		llmClient := llm.NewClient(arkKey, arkBaseURL, arkModel)
		chatHandler = handler.NewChatHandler(llmClient)
		log.Printf("LLM enabled: model=%s base=%s", arkModel, arkBaseURL)
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/posts", postHandler.Create)
		r.Get("/posts/search", postHandler.Search)
		r.Get("/posts/recommended", postHandler.ListRecommended)
		r.Get("/posts/{slug}", postHandler.Get)
		r.Put("/posts/{slug}", postHandler.Update)
		r.Delete("/posts/{slug}", postHandler.Delete)
		r.Get("/posts", postHandler.List)
		r.Post("/posts/{slug}/view", postHandler.RecordView)
		r.Post("/posts/{slug}/like", postHandler.Like)
		r.Get("/posts/{slug}/comments", postHandler.ListComments)
		r.Post("/posts/{slug}/comments", postHandler.CreateComment)

		if chatHandler != nil {
			r.Post("/chat", chatHandler.Chat)
		}
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "15080"
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
	allowedOrigin := os.Getenv("CORS_ALLOW_ORIGIN")
	if allowedOrigin == "" {
		allowedOrigin = "*"
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
