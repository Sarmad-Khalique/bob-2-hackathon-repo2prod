#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# reset-demo-fixture.sh
# Copies the golden-demo fixture to a controlled demo workspace,
# tears down any existing Compose stack and volumes for that project,
# generates a fresh .env, and commits the clean state.
#
# Usage:
#   ./scripts/reset-demo-fixture.sh
#
# Override destination:
#   REPO2PROD_DEMO_DIR=/path/to/dir ./scripts/reset-demo-fixture.sh
# ============================================================

# --------------- 1. Paths ---------------
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/test-fixtures/golden-demo"
DEMO_DIR="${REPO2PROD_DEMO_DIR:-$HOME/repo2prod-demos/golden-demo}"

# --------------- 2. Safety: validate DEMO_DIR ---------------
if [ -z "$DEMO_DIR" ]; then
    echo "ERROR: DEMO_DIR is empty. Aborting." >&2
    exit 1
fi
if [ "$DEMO_DIR" = "/" ]; then
    echo "ERROR: DEMO_DIR is '/' — refusing to operate on root." >&2
    exit 1
fi
if [ "$DEMO_DIR" = "$HOME" ]; then
    echo "ERROR: DEMO_DIR is HOME directory — refusing." >&2
    exit 1
fi
# Ensure DEMO_DIR is not inside REPO_ROOT
case "$DEMO_DIR" in
    "$REPO_ROOT"*)
        echo "ERROR: DEMO_DIR ('$DEMO_DIR') is inside REPO_ROOT ('$REPO_ROOT'). Aborting." >&2
        exit 1
        ;;
esac

# --------------- 3. Compose project name ---------------
DEMO_BASENAME="$(basename "$DEMO_DIR")"
# Lowercase using tr (BSD-safe; no ${var,,})
DEMO_BASENAME_LOWER="$(printf '%s' "$DEMO_BASENAME" | tr '[:upper:]' '[:lower:]')"
# Replace every character outside [a-z0-9-] with '-'
DEMO_BASENAME_SAFE="$(printf '%s' "$DEMO_BASENAME_LOWER" | tr -cs 'a-z0-9-' '-')"
# Trim trailing hyphens that tr may produce at end
DEMO_BASENAME_SAFE="${DEMO_BASENAME_SAFE%-}"
PROJECT="repo2prod-${DEMO_BASENAME_SAFE}"
echo "Compose project name: $PROJECT"

# --------------- 4. Preconditions ---------------
# Docker daemon
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running. Start Docker and retry." >&2
    exit 1
fi

# docker compose
if ! docker compose version > /dev/null 2>&1; then
    echo "ERROR: 'docker compose' (v2) is required but not found." >&2
    exit 1
fi

# git
if ! command -v git > /dev/null 2>&1; then
    echo "ERROR: git is required but not found." >&2
    exit 1
fi

# rsync
if ! command -v rsync > /dev/null 2>&1; then
    echo "ERROR: rsync is required but not found." >&2
    exit 1
fi

# openssl
if ! command -v openssl > /dev/null 2>&1; then
    echo "ERROR: openssl is required but not found." >&2
    exit 1
fi

# --------------- 5. Tear down existing DEMO_DIR ---------------
if [ -d "$DEMO_DIR" ]; then
    MARKER="$DEMO_DIR/.git/repo2prod-demo-marker"
    if [ ! -f "$MARKER" ]; then
        echo "ERROR: Refusing to delete '$DEMO_DIR': not a Repo2Prod demo workspace (marker missing)." >&2
        exit 1
    fi

    echo "Stopping existing Compose stack for project '$PROJECT'..."
    (cd "$DEMO_DIR" && docker compose -p "$PROJECT" down -v --remove-orphans 2>&1 || true)

    echo "Removing existing demo directory..."
    rm -rf "$DEMO_DIR"
fi

# --------------- 6. Remove leftover volumes for this project only ---------------
echo "Checking for leftover Docker volumes for project '$PROJECT'..."
OLD_VOLS="$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT")"
if [ -n "$OLD_VOLS" ]; then
    echo "Removing leftover volumes:"
    for vol in $OLD_VOLS; do
        echo "  Removing volume: $vol"
        docker volume rm "$vol"
    done
else
    echo "No leftover volumes found."
fi

# --------------- 7. Copy fixture to DEMO_DIR ---------------
echo "Creating demo directory: $DEMO_DIR"
mkdir -p "$(dirname "$DEMO_DIR")"

rsync -a \
    --exclude="FIXTURE_NOTES.md" \
    --exclude="__pycache__/" \
    --exclude="*.pyc" \
    --exclude=".env" \
    "$SRC/" "$DEMO_DIR/"

echo "Fixture copied."

# --------------- 8. Generate .env ---------------
echo "Generating .env with fresh secrets..."
(
    umask 077
    cat > "$DEMO_DIR/.env" <<EOF
SECRET_KEY=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
EOF
)
echo ".env generated (values not shown)."

# --------------- 9. Initialise git, commit, verify .env is untracked, place marker ---------------
echo "Initialising git repository..."
(
    cd "$DEMO_DIR"
    git init -q
    git add -A
    git -c user.name="Inventory Dev" \
        -c user.email="dev@example.invalid" \
        commit -q -m "Initial commit"

    # Safety: .env must not be tracked
    TRACKED_ENV="$(git ls-files .env)"
    if [ -n "$TRACKED_ENV" ]; then
        echo "ERROR: .env was committed to git. Aborting — remove .env from .gitignore and retry." >&2
        exit 1
    fi

    touch .git/repo2prod-demo-marker
)
echo "Git repository initialised. .env is untracked (as expected)."

# --------------- 10. Done ---------------
echo ""
echo "=================================================="
echo "Demo workspace ready."
echo "  Directory  : $DEMO_DIR"
echo "  Project    : $PROJECT"
echo ""
echo "Next: open $DEMO_DIR in IBM Bob"
echo "=================================================="
