#!/usr/bin/env sh
# Asyncat uninstaller — Linux & macOS
set -e

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info() { printf "%b\n" "${CYAN}[asyncat]${NC} $*"; }
ok()   { printf "%b\n" "${GREEN}[asyncat]${NC} ✓ $*"; }
warn() { printf "%b\n" "${YELLOW}[asyncat]${NC} ⚠ $*"; }

echo ""
echo "    /\_____/\ "
echo "   /  o   o  \    asyncat  goodbye! 🎬"
echo "  ( ==  ^  == )   ─────────────────────────────────"
echo "   )         ("
echo ""

BIN_DIR="$HOME/.local/bin"
INSTALL_DIR="${ASYNCAT_INSTALL_DIR:-$HOME/.asyncat}"
PURGE=0
if [ "${1:-}" = "--purge" ] || [ "${1:-}" = "--all" ]; then
  PURGE=1
fi

# ── Stop services ──────────────────────────────────────────────────────────
info "Stopping services..."

UNAME_S="$(uname -s 2>/dev/null || echo unknown)"

if command -v lsof >/dev/null 2>&1; then
  for port in 8716 8717 8765 8766; do
    pids="$(lsof -ti :"$port" 2>/dev/null || true)"
    if [ -n "$pids" ]; then
      echo "$pids" | xargs kill 2>/dev/null || true
    fi
  done
else
  pkill -f "$INSTALL_DIR/den/src/index.js" 2>/dev/null || true
  pkill -f "$INSTALL_DIR/neko/node_modules/.bin/vite" 2>/dev/null || true
  pkill -f "mlx_lm.server" 2>/dev/null || true
  pkill -f "llama-server.*8765" 2>/dev/null || true
fi

# Wait a moment for processes to clean up
sleep 1

# ── Remove CLI command ─────────────────────────────────────────────────────
if [ -f "$BIN_DIR/asyncat" ]; then
  rm -f "$BIN_DIR/asyncat"
  ok "Removed asyncat command"
fi

# ── Remove launcher ────────────────────────────────────────────────────────
if [ -f "$BIN_DIR/asyncat-ui" ]; then
  rm -f "$BIN_DIR/asyncat-ui"
  ok "Removed app launcher"
fi

# ── macOS: Remove .app bundle ─────────────────────────────────────────────
if [ "$UNAME_S" = "Darwin" ]; then
  if [ -d "$HOME/Applications/Asyncat.app" ]; then
    rm -rf "$HOME/Applications/Asyncat.app"
    ok "Removed ~/Applications/Asyncat.app"
  fi
  
  # Clean up icon cache
  if [ -d "$HOME/Library/Caches/asyncat-icons" ]; then
    rm -rf "$HOME/Library/Caches/asyncat-icons"
    ok "Removed icon cache"
  fi
fi

# ── Linux: Remove .desktop and ALL icons ───────────────────────────────────────
if [ "$UNAME_S" = "Linux" ]; then
  if [ -f "$HOME/.local/share/applications/asyncat.desktop" ]; then
    rm -f "$HOME/.local/share/applications/asyncat.desktop"
    ok "Removed desktop entry"
    update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
  fi
  
  # Remove all icon sizes from hicolor
  HICOLOR_BASE="$HOME/.local/share/icons/hicolor"
  SIZES="72x72 96x96 128x128 144x144 152x152 192x192 384x384 512x512"
  for size in $SIZES; do
    if [ -f "$HICOLOR_BASE/${size}/apps/asyncat.png" ]; then
      rm -f "$HICOLOR_BASE/${size}/apps/asyncat.png"
    fi
  done
  ok "Removed icons from hicolor"
  
  # Remove main icons
  if [ -f "$HOME/.local/share/icons/asyncat.png" ]; then
    rm -f "$HOME/.local/share/icons/asyncat.png"
  fi
  if [ -f "$HOME/.local/share/icons/asyncat.svg" ]; then
    rm -f "$HOME/.local/share/icons/asyncat.svg"
  fi
  
  # Update icon cache
  gtk-update-icon-cache "$HICOLOR_BASE" 2>/dev/null || true
fi

# ── npm global wrapper ─────────────────────────────────────────────────────
if command -v npm >/dev/null 2>&1; then
  npm uninstall -g @asyncat/asyncat >/dev/null 2>&1 || true
fi

# ── Optional full data cleanup ─────────────────────────────────────────────
if [ "$PURGE" = "1" ]; then
  if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
    ok "Removed installation/data directory: $INSTALL_DIR"
  fi
fi

# ── Done ───────────────────────────────────────────────────────────────────
echo ""
printf "%b\n" "${GREEN}  ✓  asyncat uninstalled!${NC}"
echo ""
if [ "$PURGE" != "1" ]; then
  echo "  Your local data was kept:"
  printf "%b\n" "    ${CYAN}$INSTALL_DIR${NC}"
  echo ""
  echo "  Full cleanup:"
  printf "%b\n" "    ${CYAN}asyncat uninstall --purge${NC}"
  printf "%b\n" "    ${CYAN}bash uninstall.sh --purge${NC}"
fi
echo ""
echo "    /\_____/\"
echo "   /  ~   ~  \"
echo "  ( ==  x  == )"
echo "   )   bye   ("
echo "  (           )"
echo " ( (  )   (  ) )"
echo "(__(__)___(__)__)"
echo ""
echo "  it was great having you. come back soon! 💜"
echo ""
