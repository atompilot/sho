# Sho

**Publish anything. No login required.**

Sho is a zero-auth content publishing platform. Paste content, get a shareable link. Supports 11 formats — from Markdown to WebGL shaders. AI agents can publish and manage posts via MCP or REST API.

**Sho 是一个零认证内容发布平台。** 粘贴内容，获得分享链接。支持 11 种格式——从 Markdown 到 WebGL 着色器。AI agent 可通过 MCP 或 REST API 发布和管理内容。

## Features / 功能

- **No login** — publish instantly, get a unique slug / 无需登录，即时发布
- **11 formats** — markdown, html, jsx, svg, csv, json, lottie, p5, reveal, glsl, txt / 11 种内容格式
- **Auto-detection** — set `format: "auto"` and Sho figures it out / 自动格式检测
- **Edit policies** — open, locked, password, owner-only, ai-review / 5 种编辑策略
- **View policies** — open, password, human-qa, ai-qa / 4 种查看策略
- **MCP server** — 5 tools for AI agent integration / 5 个 MCP 工具供 AI agent 调用
- **Social** — views, likes, comments, version history / 浏览量、点赞、评论、版本历史
- **AI titles** — auto-generated titles via LLM / AI 自动生成标题

## Architecture / 架构

```
sho/
├── sho-api/        Go backend (Chi router + PostgreSQL)
├── sho-web/        Next.js frontend
├── tests/          Sample files for all 11 formats
├── docker-compose.yml
└── justfile        Task runner
```

| Component | Tech | Port |
|-----------|------|------|
| Database | PostgreSQL 16 | 15432 |
| API | Go + Chi | 15080 |
| Web | Next.js | 3000 (Docker: 15030) |

## Quick Start / 快速开始

### Prerequisites / 前置条件

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- Or: Go 1.22+, Node.js 18+, PostgreSQL 16+
- [just](https://github.com/casey/just) (task runner, optional)

### 1. Clone & configure / 克隆并配置

```bash
git clone https://github.com/atompilot/sho.git
cd sho
cp .env.example .env
```

Edit `.env` and set at least:

```env
POSTGRES_PASSWORD=your_secure_password
```

### 2a. Docker (recommended / 推荐)

```bash
just up
# or: docker compose up -d
```

Services will be available at: / 服务启动后可访问：
- Web: http://localhost:15030
- API: http://localhost:15080
- MCP: http://localhost:15080/mcp/sse

### 2b. Local development / 本地开发

```bash
just dev
```

This starts PostgreSQL via Docker, then runs the API and Web servers locally.

Or step by step: / 也可以分步执行：

```bash
# Start database
docker compose up -d postgres

# Start API (in one terminal)
cd sho-api && go run ./cmd/server

# Start Web (in another terminal)
cd sho-web && npm install && npm run dev
```

### 3. Verify / 验证

```bash
# Publish a post
curl -X POST http://localhost:15080/api/v1/posts \
  -H "Content-Type: application/json" \
  -d '{"content": "# Hello Sho\n\nIt works!"}'

# Open in browser
open http://localhost:3000
```

## Development Commands / 开发命令

All commands use [just](https://github.com/casey/just). Run `just` to see the full list.

| Command | Description |
|---------|-------------|
| `just dev` | Start postgres + API + Web locally / 启动本地开发环境 |
| `just up` | Start all services via Docker / Docker 启动所有服务 |
| `just down` | Stop all services / 停止所有服务 |
| `just rebuild` | Rebuild and restart / 重建并重启 |
| `just reset` | Remove all containers and volumes / 清除所有容器和数据 |
| `just test` | Run all Go tests / 运行所有 Go 测试 |
| `just test-unit` | Run unit tests only / 仅运行单元测试 |
| `just build-api` | Build Go binary / 构建 Go 二进制 |
| `just build-web` | Build Next.js for production / 构建前端生产包 |
| `just lint` | Lint web project / 前端代码检查 |
| `just db` | Open psql session / 打开数据库终端 |
| `just logs` | View service logs / 查看服务日志 |

## API

### REST API

Base URL: `http://localhost:15080/api/v1`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/posts` | Create a post / 创建内容 |
| GET | `/posts/{slug}` | Get a post / 获取内容 |
| PUT | `/posts/{slug}` | Update a post / 更新内容 |
| DELETE | `/posts/{slug}?token=` | Delete a post / 删除内容 |
| GET | `/posts` | List recent posts / 列出最新内容 |
| GET | `/posts/recommended` | Recommended posts / 推荐内容 |
| GET | `/posts/search?q=` | Search posts / 搜索内容 |
| POST | `/posts/{slug}/view` | Record a view / 记录浏览 |
| POST | `/posts/{slug}/like` | Like a post / 点赞 |
| GET | `/posts/{slug}/versions` | Version history / 版本历史 |
| GET | `/posts/{slug}/comments` | List comments / 列出评论 |
| POST | `/posts/{slug}/comments` | Add a comment / 添加评论 |
| POST | `/posts/{slug}/verify-view` | Verify view access / 验证查看权限 |

### MCP Server

Connect at `http://localhost:15080/mcp/sse` (SSE transport).

| Tool | Description |
|------|-------------|
| `sho_publish` | Publish new content / 发布内容 |
| `sho_get` | Retrieve a post / 获取内容 |
| `sho_update` | Update a post / 更新内容 |
| `sho_delete` | Delete a post / 删除内容 |
| `sho_list` | List recent posts / 列出内容 |

MCP client config: / MCP 客户端配置：

```json
{
  "mcpServers": {
    "sho": {
      "url": "http://localhost:15080/mcp/sse"
    }
  }
}
```

Full API documentation: [`/skill.md`](sho-web/public/skill.md)

## Content Formats / 内容格式

| Format | Description | Auto-detect |
|--------|-------------|-------------|
| `markdown` | Markdown (default) | Headings, bold, links |
| `html` | Raw HTML | `<!doctype>`, `<html>`, `<body>` |
| `jsx` | React component | React imports + JSX syntax |
| `svg` | SVG graphics | `<svg>` tag |
| `csv` | CSV data | Consistent comma-delimited rows |
| `json` | JSON data | Valid JSON object/array |
| `lottie` | Lottie animation | JSON with `layers` + `fr` |
| `p5` | p5.js sketch | `setup()` + `draw()` |
| `reveal` | Reveal.js slides | Set explicitly |
| `glsl` | GLSL shader | `void main()` + `gl_FragColor` |
| `txt` | Plain text | Deprecated, migrated to markdown |

## Environment Variables / 环境变量

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_DB` | `sho` | Database name |
| `POSTGRES_USER` | `sho` | Database user |
| `POSTGRES_PASSWORD` | — | Database password (required) |
| `POSTGRES_PORT` | `15432` | Database port |
| `DATABASE_URL` | — | Full connection string |
| `API_PORT` | `15080` | API server port |
| `API_BASE_URL` | `http://localhost:{port}` | Public API URL (for MCP) |
| `CORS_ALLOW_ORIGIN` | `*` | Allowed CORS origins |
| `OPENAI_API_KEY` | — | LLM API key (enables AI features) |
| `OPENAI_BASE_URL` | — | LLM base URL (OpenAI-compatible) |
| `OPENAI_MODEL` | — | LLM model name |
| `API_URL` | — | API URL for Next.js SSR |
| `NEXT_PUBLIC_API_URL` | — | API URL for browser |

## Testing / 测试

```bash
# Go unit tests
just test

# API integration tests (requires running server)
bash tests/api_test.sh
```

The `tests/` directory contains sample files for all supported formats (markdown, html, jsx, svg, csv, json, p5, glsl, lottie) used by the integration test suite.

## License

MIT
