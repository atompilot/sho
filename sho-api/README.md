# sho-api

Sho 的 Go 后端服务。/ Go backend service for Sho.

## Setup / 安装

```bash
go mod tidy
```

Requires PostgreSQL 16+ and a `DATABASE_URL` environment variable.

需要 PostgreSQL 16+ 和 `DATABASE_URL` 环境变量。

## Run / 运行

```bash
# Copy and configure environment
cp .env.example .env

# Start the server
go run ./cmd/server
```

The server listens on `:15080` by default (configurable via `API_PORT`).

## Test / 测试

```bash
go test ./... -v -count=1
```

## Build / 构建

```bash
go build -o server ./cmd/server
```

## Environment / 环境变量

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string (required) |
| `API_PORT` | `15080` | HTTP server port |
| `API_BASE_URL` | `http://localhost:{port}` | Public URL for MCP SSE base |
| `CORS_ALLOW_ORIGIN` | `*` | Allowed CORS origins |
| `OPENAI_API_KEY` | — | Enables AI features (title generation, AI-QA) |
| `OPENAI_BASE_URL` | — | OpenAI-compatible API base URL |
| `OPENAI_MODEL` | — | Model name (required when API key is set) |

## Structure / 结构

```
sho-api/
├── cmd/server/main.go       Entry point, router setup / 入口与路由
├── internal/
│   ├── handler/              HTTP handlers / HTTP 处理器
│   ├── service/              Business logic / 业务逻辑
│   │   ├── post_service.go   CRUD, policies, verification
│   │   ├── format.go         Auto-format detection (11 formats)
│   │   ├── title.go          Title extraction from content
│   │   └── ai_title.go       Background AI title worker
│   ├── store/                PostgreSQL data access / 数据访问层
│   ├── model/                Data models / 数据模型
│   ├── policy/               Edit policy enforcement / 编辑策略
│   ├── mcp/                  MCP server (5 tools) / MCP 服务
│   └── llm/                  LLM client (OpenAI-compatible) / LLM 客户端
└── migrations/               SQL migrations (auto-run on startup) / 数据库迁移
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

### MCP (`/mcp/sse`)

SSE transport with 5 tools: `sho_publish`, `sho_get`, `sho_update`, `sho_delete`, `sho_list`.

## Database

Migrations run automatically on startup. Schema includes:
- `posts` — content, format, policies, social counters
- `post_versions` — content history
- `comments` — threaded comments (max 2 levels)
- `like_fingerprints` / `view_fingerprints` — deduplication

See the [root README](../README.md) for full project documentation.
