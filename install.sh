#!/usr/bin/env bash
# Asyncat installer — Linux & macOS
# Usage: curl -fsSL https://your-host/install.sh | sh
#        or: bash install.sh  (if you already have the repo)
set -e

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${CYAN}[asyncat]${NC} $*"; }
ok()    { echo -e "${GREEN}[asyncat]${NC} ✓ $*"; }
warn()  { echo -e "${YELLOW}[asyncat]${NC} ⚠ $*"; }
die()   { echo -e "${RED}[asyncat]${NC} ✗ $*" >&2; exit 1; }

INSTALL_DIR="${ASYNCAT_INSTALL_DIR:-$HOME/.asyncat}"
BIN_DIR="$HOME/.local/bin"

echo ""
echo "  🐱  Asyncat Installer"
echo "  ───────────────────────────────"
echo ""

# ── 1. Check Node.js ──────────────────────────────────────────────────────────
info "Checking Node.js..."
if ! command -v node &>/dev/null; then
  die "Node.js is not installed. Install it from https://nodejs.org (v18 or newer required)."
fi
NODE_VERSION=$(node -e "process.stdout.write(process.version)")
NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 18 ]; then
  die "Node.js v18+ required. You have $NODE_VERSION. Upgrade at https://nodejs.org"
fi
ok "Node.js $NODE_VERSION"

# ── 2. Clone or update the repo ───────────────────────────────────────────────
REPO_URL="https://github.com/yourusername/asyncat-oss.git"   # TODO: set real URL

if [ -d "$INSTALL_DIR/.git" ]; then
  info "Updating existing install at $INSTALL_DIR ..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  # If running from inside the repo (already cloned), use current dir
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
  if [ -f "$SCRIPT_DIR/package.json" ] && grep -q '"asyncat"' "$SCRIPT_DIR/package.json" 2>/dev/null; then
    info "Running from local repo — installing in place at $SCRIPT_DIR"
    INSTALL_DIR="$SCRIPT_DIR"
  else
    info "Cloning Asyncat to $INSTALL_DIR ..."
    git clone "$REPO_URL" "$INSTALL_DIR" || die "Could not clone repo. Check your internet connection."
  fi
fi
ok "Source at $INSTALL_DIR"

# ── 3. Install dependencies ───────────────────────────────────────────────────
info "Installing backend dependencies..."
(cd "$INSTALL_DIR/den"  && npm install --silent) && ok "Backend deps installed"

info "Installing frontend dependencies..."
(cd "$INSTALL_DIR/neko" && npm install --silent) && ok "Frontend deps installed"

# ── 4. First-run setup ────────────────────────────────────────────────────────
# Create .env if missing
DEN_ENV="$INSTALL_DIR/den/.env"
if [ ! -f "$DEN_ENV" ]; then
  info "Creating default .env ..."
  cat > "$DEN_ENV" <<'EOF'
PORT=3000
NODE_ENV=development
JWT_SECRET=changeme_use_a_long_random_string
LLAMA_SERVER_PORT=8765
# Optional: set custom llama-server binary path
# LLAMA_BINARY_PATH=/path/to/llama-server
EOF
  warn ".env created at $DEN_ENV — edit JWT_SECRET before running in production!"
fi

# ── 5. Create launcher script ─────────────────────────────────────────────────
mkdir -p "$BIN_DIR"
LAUNCHER="$BIN_DIR/asyncat"

cat > "$LAUNCHER" <<SCRIPT
#!/usr/bin/env bash
# Asyncat launcher — starts den + neko concurrently
ASYNCAT_DIR="$INSTALL_DIR"

# Check if already running
if lsof -ti:3000 &>/dev/null; then
  echo "Asyncat is already running → http://localhost:5173"
  open "http://localhost:5173" 2>/dev/null || xdg-open "http://localhost:5173" 2>/dev/null || true
  exit 0
fi

echo "🐱 Starting Asyncat..."
echo "   Backend → http://localhost:3000"
echo "   Frontend → http://localhost:5173"
echo "   Press Ctrl+C to stop."
echo ""

trap 'kill %1 %2 2>/dev/null; echo "Asyncat stopped."; exit' INT TERM

# Start den (backend)
(cd "\$ASYNCAT_DIR/den" && npm run dev 2>&1 | sed 's/^/[den] /') &

# Give den 2 seconds to initialise, then start neko (frontend)
sleep 2
(cd "\$ASYNCAT_DIR/neko" && npm run dev 2>&1 | sed 's/^/[neko] /') &

# Open browser after a moment
sleep 3
open "http://localhost:5173" 2>/dev/null || xdg-open "http://localhost:5173" 2>/dev/null || true

wait
SCRIPT

chmod +x "$LAUNCHER"
ok "Launcher created at $LAUNCHER"

# ── 6. Add ~/.local/bin to PATH (if needed) ───────────────────────────────────
SHELL_RC=""
case "$SHELL" in
  */zsh)  SHELL_RC="$HOME/.zshrc" ;;
  */fish) SHELL_RC="$HOME/.config/fish/config.fish" ;;
  *)      SHELL_RC="$HOME/.bashrc" ;;
esac

if ! echo "$PATH" | grep -q "$BIN_DIR"; then
  echo "" >> "$SHELL_RC"
  echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$SHELL_RC"
  warn "Added $BIN_DIR to PATH in $SHELL_RC — restart your terminal or run: source $SHELL_RC"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}  ✓ Asyncat installed successfully!${NC}"
echo ""
echo "  Run it anytime with:"
echo -e "    ${CYAN}asyncat${NC}"
echo ""
echo "  Or start manually:"
echo -e "    cd $INSTALL_DIR && npm run dev"
echo ""
