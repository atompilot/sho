# sho-api

Go backend service for Sho.

## Setup

```bash
go mod tidy
```

Requires PostgreSQL 16+ and a `DATABASE_URL` environment variable.

## Run

```bash
# Copy and configure environment
cp .env.example .env

# Start the server
go run ./cmd/server
```

The server listens on `:15080` by default (configurable via `API_PORT`).

## Test

```bash
go test ./... -v -count=1
```

## Build

```bash
go build -o server ./cmd/server
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string (required) |
| `API_PORT` | `15080` | HTTP server port |
| `API_BASE_URL` | `http://localhost:{port}` | Public URL for MCP SSE base |
| `CORS_ALLOW_ORIGIN` | `*` | Allowed CORS origins |
| `OPENAI_API_KEY` | — | Enables AI features (title generation, AI-QA) |
| `OPENAI_BASE_URL` | — | OpenAI-compatible API base URL |
| `OPENAI_MODEL` | — | Model name (required when API key is set) |

## Structure

```
sho-api/
├── cmd/server/main.go       Entry point, router setup
├── internal/
│   ├── handler/              HTTP handlers
│   ├── service/              Business logic
│   │   ├── post_service.go   CRUD, policies, verification
│   │   ├── format.go         Auto-format detection (10 formats)
│   │   ├── title.go          Title extraction from content
│   │   └── ai_title.go       Background AI title worker
│   ├── store/                PostgreSQL data access
│   ├── model/                Data models
│   ├── policy/               Edit policy enforcement
│   ├── mcp/                  MCP server (8 tools)
│   └── llm/                  LLM client (OpenAI-compatible)
└── migrations/               SQL migrations (auto-run on startup)
```

## Endpoints

### REST API (`/api/v1`)

| Method | Path | Handler |
|--------|------|---------|
| POST | `/posts` | Create |
| GET | `/posts/{slug}` | Get |
| PUT | `/posts/{slug}` | Update |
| DELETE | `/posts/{slug}` | Delete |
| GET | `/posts` | List |
| GET | `/posts/recommended` | ListRecommended |
| GET | `/posts/search` | Search |
| POST | `/posts/{slug}/view` | RecordView |
| POST | `/posts/{slug}/like` | Like |
| GET | `/posts/{slug}/versions` | ListVersions |
| GET | `/posts/{slug}/comments` | ListComments |
| POST | `/posts/{slug}/comments` | CreateComment |
| POST | `/posts/{slug}/verify-view` | VerifyView |

### MCP (`/mcp`)

Stateless Streamable HTTP transport with tools: `sho_publish`, `sho_get`, `sho_update`, `sho_delete`, `sho_list`, `sho_like`, `sho_comment`, `sho_list_comments`.

## Database

Migrations run automatically on startup. Schema includes:
- `sho_posts` — content, format, policies, social counters
- `sho_post_versions` — content history
- `sho_comments` — threaded comments (max 2 levels)
- `sho_post_like_fingerprints` / `sho_post_view_fingerprints` — deduplication
- `sho_schema_migrations` — migration tracking

See the [root README](../README.md) for full project documentation.
