# Sho — development task runner
# Usage: just <command>

default:
    @just --list

# ── Docker ─────────────────────────────────────────────────────────────────────

# Start all services (postgres + api + web)
up:
    docker compose up -d

# Stop all services
down:
    docker compose down

# View logs (all services, or pass service name: just logs sho-api)
logs service="":
    docker compose logs -f {{service}}

# Rebuild and restart all services
rebuild:
    docker compose up -d --build

# Remove all containers and volumes (destroys database)
reset:
    docker compose down -v

# ── Database ────────────────────────────────────────────────────────────────────

# Open a psql session against the local dev database
db:
    psql postgres://sho:sho_dev_password@localhost:15432/sho

# ── API (Go) ────────────────────────────────────────────────────────────────────

# Run the API server locally (requires postgres running)
api:
    cd sho-api && go run ./cmd/server

# Run all Go tests
test:
    cd sho-api && go test ./... -v -count=1

# Run Go tests (short, no integration)
test-unit:
    cd sho-api && go test ./internal/policy/... -v

# Build the Go binary
build-api:
    cd sho-api && go build -o server ./cmd/server

# Tidy Go modules
tidy:
    cd sho-api && go mod tidy

# ── Web (Next.js) ───────────────────────────────────────────────────────────────

# Run Next.js dev server
web:
    cd sho-web && npm run dev

# Build Next.js for production
build-web:
    cd sho-web && npm run build

# Lint the web project
lint:
    cd sho-web && npm run lint

# ── Dev shortcut ────────────────────────────────────────────────────────────────

# Start postgres via Docker, then run API and Web locally in parallel
dev:
    docker compose up -d postgres
    @echo "Waiting for postgres..."
    @sleep 2
    @echo "Starting API on :15080 and Web on :3000"
    cd sho-api && go run ./cmd/server & cd sho-web && npm run dev
