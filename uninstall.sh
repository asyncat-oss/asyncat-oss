#!/usr/bin/env bash
# Asyncat uninstaller — Linux & macOS
set -e

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info() { echo -e "${CYAN}[asyncat]${NC} $*"; }
ok()   { echo -e "${GREEN}[asyncat]${NC} ✓ $*"; }
warn() { echo -e "${YELLOW}[asyncat]${NC} ⚠ $*"; }

echo ""
echo "    /\_____/\ "
echo "   /  o   o  \    asyncat  goodbye! 🎬"
echo "  ( ==  ^  == )   ─────────────────────────────────"
echo "   )         ("
echo ""

BIN_DIR="$HOME/.local/bin"
INSTALL_DIR="${ASYNCAT_INSTALL_DIR:-$HOME/.asyncat}"

# ── Stop services ──────────────────────────────────────────────────────────
info "Stopping services..."
# Kill any running asyncat processes
pkill -f "asyncat" 2>/dev/null || true
pkill -f "node.*den" 2>/dev/null || true
pkill -f "node.*neko" 2>/dev/null || true
pkill -f "serve.*8716\|serve.*8717" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

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
if [[ "$OSTYPE" == "darwin"* ]]; then
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
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
  if [ -f "$HOME/.local/share/applications/asyncat.desktop" ]; then
    rm -f "$HOME/.local/share/applications/asyncat.desktop"
    ok "Removed desktop entry"
    update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
  fi
  
  # Remove all icon sizes from hicolor
  HICOLOR_BASE="$HOME/.local/share/icons/hicolor"
  SIZES=("72x72" "96x96" "128x128" "144x144" "152x152" "192x192" "384x384" "512x512")
  for size in "${SIZES[@]}"; do
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

# ── Done ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}  ✓  asyncat uninstalled!${NC}"
echo ""
echo "  Leftover files (optional cleanup):"
echo -e "    ${CYAN}rm -rf $INSTALL_DIR${NC}         # remove installation directory"
echo -e "    ${CYAN}rm -rf $HOME/.asyncat${NC}       # remove data, config, database"
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