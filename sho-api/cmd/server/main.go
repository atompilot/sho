package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/atompilot/sho-api/internal/handler"
	"github.com/atompilot/sho-api/internal/llm"
	shoMCP "github.com/atompilot/sho-api/internal/mcp"
	"github.com/atompilot/sho-api/internal/service"
	"github.com/atompilot/sho-api/internal/store"
	"github.com/atompilot/sho-api/internal/webhook"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is required")
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
	webhookStore := store.NewWebhookStore(pool)
	channelStore := store.NewChannelStore(pool)
	masterPassword := os.Getenv("MASTER_PASSWORD")
	postSvc := service.NewPostService(postStore, masterPassword)
	postSvc.SetChannelStore(channelStore)

	var llmChatter service.LLMChatter

	var llmClient *llm.Client
	var chatHandler *handler.ChatHandler
	if apiKey := os.Getenv("OPENAI_API_KEY"); apiKey != "" {
		baseURL := os.Getenv("OPENAI_BASE_URL")
		model := os.Getenv("OPENAI_MODEL")
		if model == "" {
			log.Fatal("OPENAI_MODEL is required when OPENAI_API_KEY is set")
		}
		llmClient = llm.NewClient(apiKey, baseURL, model)
		llmChatter = llmClient
		chatHandler = handler.NewChatHandler(llmClient)
		log.Printf("LLM enabled: model=%s base=%s", model, baseURL)
	}

	// Start AI title worker if LLM is available.
	if llmClient != nil {
		worker := service.NewAITitleWorker(postStore, llmClient, 30*time.Second)
		go worker.Run(ctx)
	}

	webhookDisp := webhook.NewDispatcher(webhookStore)
	go webhookDisp.Run(ctx)

	postHandler := handler.NewPostHandler(postSvc, llmChatter, webhookDisp, webhookStore, masterPassword)

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
		r.Post("/posts/{slug}/share", postHandler.Share)
		r.Get("/posts/{slug}/versions", postHandler.ListVersions)
		r.Get("/posts/{slug}/comments", postHandler.ListComments)
		r.Post("/posts/{slug}/comments", postHandler.CreateComment)
		r.Post("/posts/{slug}/verify-view", postHandler.VerifyView)
		r.Get("/posts/by-agent/{agent_id}", postHandler.ListByAgent)
		r.Post("/auth/verify-master", postHandler.VerifyMasterPassword)

		// Channels
		channelHandler := handler.NewChannelHandler(channelStore)
		r.Post("/channels", channelHandler.Create)
		r.Get("/channels/{name}", channelHandler.Get)
		r.Get("/channels/{name}/posts", channelHandler.ListPosts)
		r.Get("/channels/{name}/feed.json", channelHandler.Feed)

		if chatHandler != nil {
			r.Post("/chat", chatHandler.Chat)
		}
	})

	port := os.Getenv("API_PORT")
	if port == "" {
		port = "15080"
	}

	// Mount MCP server at /mcp (stateless StreamableHTTP transport)
	mcpSrv := shoMCP.NewMCPServer(postSvc, llmChatter, webhookStore, channelStore)
	mcpHTTP := shoMCP.HTTPServer(mcpSrv)
	r.Handle("/mcp", mcpHTTP)

	srv := &http.Server{Addr: ":" + port, Handler: r}

	go func() {
		<-ctx.Done()
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer shutdownCancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Printf("http shutdown: %v", err)
		}
	}()

	log.Printf("sho-api listening on :%s (REST /api/v1, MCP /mcp)", port)
	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("http server: %v", err)
	}
	log.Println("sho-api stopped")
}

func corsMiddleware(next http.Handler) http.Handler {
	raw := os.Getenv("CORS_ALLOW_ORIGIN")
	if raw == "" {
		raw = "*"
	}
	origins := strings.Split(raw, ",")
	for i := range origins {
		origins[i] = strings.TrimSpace(origins[i])
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowed := origins[0]
		if len(origins) > 1 && origin != "" {
			for _, o := range origins {
				if o == origin {
					allowed = o
					break
				}
			}
		}
		w.Header().Set("Access-Control-Allow-Origin", allowed)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
