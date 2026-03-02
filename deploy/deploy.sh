#!/usr/bin/env bash
set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────
SERVER_HOST="${DEPLOY_HOST:-root@splaz.cn}"
SERVER_PATH="${DEPLOY_PATH:-/opt/sho}"
COMPOSE_FILE="docker-compose.prod.yml"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[deploy]${NC} $*"; }
ok()   { echo -e "${GREEN}[  ok  ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ warn ]${NC} $*"; }
err()  { echo -e "${RED}[error ]${NC} $*" >&2; }

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

One-click deploy Sho platform to production server.

Options:
  --sync-only     Only sync files, don't build or restart
  --build-only    Only build images (assumes files already synced)
  --restart-only  Only restart services
  --no-cache      Build Docker images without cache
  --caddy-build   Rebuild Caddy binary with alidns plugin
  -h, --help      Show this help

Environment variables:
  DEPLOY_HOST     Server SSH target (default: root@splaz.cn)
  DEPLOY_PATH     Server deploy path (default: /opt/sho)

Examples:
  ./deploy/deploy.sh                # Full deploy
  ./deploy/deploy.sh --no-cache     # Full deploy with fresh build
  ./deploy/deploy.sh --sync-only    # Just sync files
  ./deploy/deploy.sh --caddy-build  # Rebuild Caddy binary + full deploy
EOF
    exit 0
}

# ─── Parse arguments ─────────────────────────────────────────────
SYNC=true
BUILD=true
RESTART=true
NO_CACHE=""
CADDY_BUILD=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --sync-only)    BUILD=false; RESTART=false ;;
        --build-only)   SYNC=false; RESTART=false ;;
        --restart-only) SYNC=false; BUILD=false ;;
        --no-cache)     NO_CACHE="--no-cache" ;;
        --caddy-build)  CADDY_BUILD=true ;;
        -h|--help)      usage ;;
        *) err "Unknown option: $1"; usage ;;
    esac
    shift
done

# ─── Pre-flight checks ──────────────────────────────────────────
log "Pre-flight checks..."

if ! command -v rsync &>/dev/null; then
    err "rsync is not installed. Install it with: brew install rsync"
    exit 1
fi

if ! ssh -o ConnectTimeout=5 "$SERVER_HOST" "echo ok" &>/dev/null; then
    err "Cannot connect to $SERVER_HOST"
    exit 1
fi
ok "SSH connection to $SERVER_HOST"

# Check .env exists on server
if ! ssh "$SERVER_HOST" "test -f ${SERVER_PATH}/.env"; then
    warn "No .env file found at ${SERVER_PATH}/.env"
    warn "Copy deploy/.env.prod.example to server and configure it first:"
    warn "  scp deploy/.env.prod.example ${SERVER_HOST}:${SERVER_PATH}/.env"
    exit 1
fi
ok ".env file exists on server"

# ─── Step 1: Sync files ─────────────────────────────────────────
if $SYNC; then
    log "Syncing project files to ${SERVER_HOST}:${SERVER_PATH}/ ..."

    rsync -azP --delete \
        --exclude='.git' \
        --exclude='node_modules' \
        --exclude='.next' \
        --exclude='.env' \
        --exclude='.env.local' \
        --exclude='.env.*.local' \
        --exclude='.DS_Store' \
        --exclude='deploy/caddy' \
        "$PROJECT_DIR/" "${SERVER_HOST}:${SERVER_PATH}/"

    ok "Files synced"
fi

# ─── Step 2: Build Caddy binary (if needed) ─────────────────────
if $BUILD; then
    # Check if caddy binary exists on server
    CADDY_EXISTS=$(ssh "$SERVER_HOST" "test -f ${SERVER_PATH}/deploy/caddy && echo yes || echo no")

    if $CADDY_BUILD || [[ "$CADDY_EXISTS" == "no" ]]; then
        log "Building Caddy binary with alidns plugin (this may take a few minutes)..."
        ssh "$SERVER_HOST" "docker run --rm \
            -e GOPROXY=https://goproxy.cn,direct \
            -v ${SERVER_PATH}/deploy:/output \
            caddy:builder sh -c \
            'xcaddy build --with github.com/caddy-dns/alidns --output /output/caddy'"
        ok "Caddy binary built"
    else
        ok "Caddy binary already exists (use --caddy-build to rebuild)"
    fi
fi

# ─── Step 3: Build Docker images ────────────────────────────────
if $BUILD; then
    log "Building Docker images on server..."
    ssh "$SERVER_HOST" "cd ${SERVER_PATH} && \
        docker compose -f ${COMPOSE_FILE} build ${NO_CACHE}"
    ok "Docker images built"
fi

# ─── Step 4: Restart services ───────────────────────────────────
if $RESTART; then
    log "Restarting services..."
    ssh "$SERVER_HOST" "cd ${SERVER_PATH} && \
        docker compose -f ${COMPOSE_FILE} up -d"
    ok "Services started"

    # Wait for health checks
    log "Waiting for services to be healthy..."
    sleep 5

    # Check container status
    log "Container status:"
    ssh "$SERVER_HOST" "cd ${SERVER_PATH} && \
        docker compose -f ${COMPOSE_FILE} ps"

    # Verify API is responding
    log "Verifying API..."
    if ssh "$SERVER_HOST" "curl -sf http://localhost:15080/api/v1/posts > /dev/null 2>&1"; then
        ok "API is responding"
    else
        warn "API not responding yet (may still be starting)"
    fi

    # Verify Web is responding
    log "Verifying Web..."
    if ssh "$SERVER_HOST" "curl -sf http://localhost:3000 > /dev/null 2>&1"; then
        ok "Web is responding"
    else
        warn "Web not responding yet (may still be starting)"
    fi
fi

# ─── Done ────────────────────────────────────────────────────────
echo ""
ok "Deploy complete!"
log "Access: https://sho.splaz.cn"
log "API:    https://sho.splaz.cn/api/v1/posts"
log "MCP:    https://sho.splaz.cn/mcp"
