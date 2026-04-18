#!/usr/bin/env bash
# Asyncat installer — Linux & macOS
# Usage: curl -fsSL https://asyncat.com/install.sh | sh
#        or: bash install.sh  (from inside the cloned repo)
set -e

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info() { echo -e "${CYAN}[asyncat]${NC} $*"; }
ok()   { echo -e "${GREEN}[asyncat]${NC} ✓ $*"; }
warn() { echo -e "${YELLOW}[asyncat]${NC} ⚠ $*"; }
die()  { echo -e "${RED}[asyncat]${NC} ✗ $*" >&2; exit 1; }

INSTALL_DIR="${ASYNCAT_INSTALL_DIR:-$HOME/.asyncat}"
BIN_DIR="$HOME/.local/bin"
REPO_URL="https://github.com/asyncat-oss/asyncat-oss.git"

echo ""
echo "    /\\_____/\\ "
echo "   /  o   o  \\    asyncat  open-source AI workspace"
echo "  ( ==  ^  == )   ─────────────────────────────────"
echo "   )         (    https://asyncat.com"
echo ""

# ── 1. Node.js v20+ ───────────────────────────────────────────────────────────
info "Checking Node.js..."
command -v node &>/dev/null || die "Node.js not found. Install from https://nodejs.org (v20+ required)"
NODE_VER=$(node -e "process.stdout.write(process.version)")
NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
[ "$NODE_MAJOR" -ge 20 ] || die "Node.js v20+ required. You have $NODE_VER — upgrade at https://nodejs.org"
ok "Node.js $NODE_VER"

# ── 2. git ────────────────────────────────────────────────────────────────────
command -v git &>/dev/null || die "git not found. Install git and try again."

# ── 3. Clone or update ────────────────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Updating existing install at $INSTALL_DIR..."
  git -C "$INSTALL_DIR" pull --ff-only || warn "Could not pull latest — continuing with existing version."
else
  # If running from inside an already-cloned repo, install in-place
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)" || SCRIPT_DIR=""
  if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/package.json" ] && \
     grep -q '"asyncat-oss"' "$SCRIPT_DIR/package.json" 2>/dev/null; then
    info "Running from local repo — using $SCRIPT_DIR"
    INSTALL_DIR="$SCRIPT_DIR"
  else
    info "Cloning asyncat to $INSTALL_DIR..."
    git clone --depth=1 "$REPO_URL" "$INSTALL_DIR" \
      || die "Clone failed. Check your internet connection or try: git clone $REPO_URL"
  fi
fi
ok "Source at $INSTALL_DIR"

# ── 4. Install all deps (one workspace install from root) ─────────────────────
info "Installing dependencies..."
(cd "$INSTALL_DIR" && npm install --silent) && ok "Dependencies installed"

# ── 5. First-run .env setup ───────────────────────────────────────────────────
DEN_ENV="$INSTALL_DIR/den/.env"
NEKO_ENV="$INSTALL_DIR/neko/.env"
if [ ! -f "$DEN_ENV" ] && [ -f "$INSTALL_DIR/den/.env.example" ]; then
  cp "$INSTALL_DIR/den/.env.example" "$DEN_ENV"
  warn "Created den/.env — edit JWT_SECRET before running in production!"
fi
if [ ! -f "$NEKO_ENV" ] && [ -f "$INSTALL_DIR/neko/.env.example" ]; then
  cp "$INSTALL_DIR/neko/.env.example" "$NEKO_ENV"
fi

# ── 6. Wire up the asyncat command ────────────────────────────────────────────
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/asyncat" <<SCRIPT
#!/usr/bin/env bash
exec node "$INSTALL_DIR/cat" "\$@"
SCRIPT
chmod +x "$BIN_DIR/asyncat"
ok "Command ready: asyncat"

# ── 7. Add ~/.local/bin to PATH if needed ─────────────────────────────────────
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$BIN_DIR"; then
  # Detect shell config file
  if [ -n "$ZSH_VERSION" ] || [ "$(basename "$SHELL")" = "zsh" ]; then
    SHELL_RC="$HOME/.zshrc"
  elif [ -f "$HOME/.config/fish/config.fish" ]; then
    SHELL_RC="$HOME/.config/fish/config.fish"
  else
    SHELL_RC="$HOME/.bashrc"
  fi

  if grep -q "fish_add_path" "$SHELL_RC" 2>/dev/null || [[ "$SHELL_RC" == *fish* ]]; then
    echo "fish_add_path $BIN_DIR" >> "$SHELL_RC"
  else
    printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "$SHELL_RC"
  fi
  warn "Added $BIN_DIR to PATH in $(basename "$SHELL_RC")"
  warn "Restart your terminal or run: source $SHELL_RC"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}  ✓  asyncat installed!${NC}"
echo ""
echo "  Run it anytime:"
echo -e "    ${CYAN}asyncat${NC}              open the interactive CLI"
echo -e "    ${CYAN}asyncat start${NC}        start backend + frontend directly"
echo -e "    ${CYAN}asyncat install${NC}      set up .env and check llama.cpp"
echo -e "    ${CYAN}asyncat --help${NC}       see all commands"
echo ""
echo "  First time? Run:  asyncat install"
echo ""
