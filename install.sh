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
echo "    /\_____/\ "
echo "   /  o   o  \    asyncat  open-source AI workspace"
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

# ── 5. Build the frontend for production ──────────────────────────────────────
info "Building frontend..."
(cd "$INSTALL_DIR" && npm run build -w neko) && ok "Frontend built"

# ── 6. First-run .env setup ───────────────────────────────────────────────────
DEN_ENV="$INSTALL_DIR/den/.env"
NEKO_ENV="$INSTALL_DIR/neko/.env"
if [ ! -f "$DEN_ENV" ] && [ -f "$INSTALL_DIR/den/.env.example" ]; then
  cp "$INSTALL_DIR/den/.env.example" "$DEN_ENV"
  warn "Created den/.env — edit JWT_SECRET before running in production!"
fi
if [ ! -f "$NEKO_ENV" ] && [ -f "$INSTALL_DIR/neko/.env.example" ]; then
  cp "$INSTALL_DIR/neko/.env.example" "$NEKO_ENV"
fi

# ── 7. Wire up the asyncat command ────────────────────────────────────────────
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/asyncat" <<SCRIPT
#!/usr/bin/env bash
exec node "$INSTALL_DIR/cat" "\$@"
SCRIPT
chmod +x "$BIN_DIR/asyncat"
ok "Command ready: asyncat"

# ── 8. Finish first-run setup automatically ──────────────────────────────────
info "Finishing first-run setup..."
(cd "$INSTALL_DIR" && node "$INSTALL_DIR/cat" install --skip-packages --skip-local-engine) \
  && ok "First-run setup complete"

# ── 9. Add ~/.local/bin to PATH if needed ─────────────────────────────────────
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

# ── 10. Copy all PWA icons to system locations ────────────────────────────────
info "Installing icons..."

# Icon source directory
ICON_SRC_DIR="$INSTALL_DIR/neko/public"

# All PWA icon sizes
PWA_ICONS=(
  "pwa-72x72.png"
  "pwa-96x96.png"
  "pwa-128x128.png"
  "pwa-144x144.png"
  "pwa-152x152.png"
  "pwa-192x192.png"
  "pwa-384x384.png"
  "pwa-512x512.png"
)

# Linux icon directories (hicolor follows freedesktop spec)
HICOLOR_BASE="$HOME/.local/share/icons/hicolor"
for icon in "${PWA_ICONS[@]}"; do
  size=$(echo "$icon" | sed 's/pwa-\([0-9]*\)x[0-9]*\.png/\1/')
  dest_dir="$HICOLOR_BASE/${size}x${size}/apps"
  mkdir -p "$dest_dir"
  if [ -f "$ICON_SRC_DIR/$icon" ]; then
    cp "$ICON_SRC_DIR/$icon" "$dest_dir/asyncat.png"
  fi
done

# Also copy main icon for general use
if [ -f "$ICON_SRC_DIR/pwa-192x192.png" ]; then
  cp "$ICON_SRC_DIR/pwa-192x192.png" "$HOME/.local/share/icons/asyncat.png"
fi

# Copy cat.svg as well
if [ -f "$ICON_SRC_DIR/cat.svg" ]; then
  cp "$ICON_SRC_DIR/cat.svg" "$HOME/.local/share/icons/asyncat.svg"
fi

# macOS: copy to system icon cache location
if [[ "$OSTYPE" == "darwin"* ]]; then
  mkdir -p "$HOME/Library/Caches/asyncat-icons"
  for icon in "${PWA_ICONS[@]}"; do
    if [ -f "$ICON_SRC_DIR/$icon" ]; then
      cp "$ICON_SRC_DIR/$icon" "$HOME/Library/Caches/asyncat-icons/$icon"
    fi
  done
fi

ok "Icons installed"

# ── 11. Desktop launcher (for humans) ─────────────────────────────────────────
LAUNCHER="$BIN_DIR/asyncat-ui"
STATIC_SERVER="$INSTALL_DIR/neko/dist"

cat > "$LAUNCHER" <<'LAUNCHER_SCRIPT'
#!/usr/bin/env bash
# asyncat-ui — start services + open as native app window

INSTALL_DIR="${ASYNCAT_INSTALL_DIR:-$HOME/.asyncat}"
BIN_DIR="$HOME/.local/bin"
NEKO_DIST="$INSTALL_DIR/neko/dist"
DEN_PORT=8716
NEKO_PORT=8717

# Check if den is already running
if ! curl -s "http://localhost:$DEN_PORT/health" &>/dev/null 2>&1; then
  info "Starting backend..."
  (cd "$INSTALL_DIR" && node den/src/index.js &>/dev/null) &
  # Wait for den to start
  for i in $(seq 1 30); do
    curl -s "http://localhost:$DEN_PORT/health" &>/dev/null 2>&1 && break
    sleep 0.5
  done
fi

# Check if frontend is already running
if ! curl -s "http://localhost:$NEKO_PORT" &>/dev/null 2>&1; then
  info "Starting frontend..."
  # Serve the built frontend using a simple static server
  if [ -d "$NEKO_DIST" ]; then
    (cd "$NEKO_DIST" && npx --yes serve -l $NEKO_PORT &>/dev/null) &
  else
    # Fallback: use neko's dev server
    (cd "$INSTALL_DIR/neko" && npx vite --port $NEKO_PORT &>/dev/null) &
  fi
  # Wait for frontend to start
  for i in $(seq 1 30); do
    curl -s "http://localhost:$NEKO_PORT" &>/dev/null 2>&1 && break
    sleep 0.5
  done
fi

PLATFORM="$(uname -s)"
URL="http://localhost:$NEKO_PORT"

if [ "$PLATFORM" = "Darwin" ]; then
  # Try to use the app bundle first if it exists
  if [ -d "$HOME/Applications/Asyncat.app" ]; then
    open "$HOME/Applications/Asyncat.app"
    exit 0
  fi
  # Otherwise open in browser
  for B in "Google Chrome" "Microsoft Edge" "Chromium" "Arc" "Brave Browser"; do
    [ -d "/Applications/$B.app" ] && { open -na "$B" --args --app="$URL"; exit 0; }
  done
  open "$URL"
else
  # Linux
  for CMD in google-chrome chromium-browser chromium microsoft-edge-stable brave-browser arc; do
    command -v "$CMD" &>/dev/null && { "$CMD" --app="$URL" &>/dev/null; exit 0; }
  done
  xdg-open "$URL"
fi
LAUNCHER_SCRIPT
chmod +x "$LAUNCHER"

# macOS: create .app bundle with proper icon
if [[ "$OSTYPE" == "darwin"* ]]; then
  APP_DIR="$HOME/Applications/Asyncat.app"
  MACOS_DIR="$APP_DIR/Contents/MacOS"
  RESOURCES_DIR="$APP_DIR/Contents/Resources"
  mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

  # Copy launcher script
  cp "$LAUNCHER" "$MACOS_DIR/asyncat-launcher"
  chmod +x "$MACOS_DIR/asyncat-launcher"

  # Copy all icons to Resources
  for icon in "${PWA_ICONS[@]}"; do
    if [ -f "$ICON_SRC_DIR/$icon" ]; then
      cp "$ICON_SRC_DIR/$icon" "$RESOURCES_DIR/$icon"
    fi
  done
  if [ -f "$ICON_SRC_DIR/cat.svg" ]; then
    cp "$ICON_SRC_DIR/cat.svg" "$RESOURCES_DIR/cat.svg"
  fi

  # Create Info.plist with icon reference
  cat > "$APP_DIR/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>asyncat-launcher</string>
  <key>CFBundleIconFile</key>
  <string>asyncat</string>
  <key>CFBundleIconFiles</key>
  <array>
    <string>pwa-512x512.png</string>
    <string>pwa-192x192.png</string>
    <string>pwa-128x128.png</string>
    <string>pwa-96x96.png</string>
  </array>
  <key>CFBundleIdentifier</key>
  <string>com.asyncat.app</string>
  <key>CFBundleName</key>
  <string>Asyncat</string>
  <key>CFBundleDisplayName</key>
  <string>Asyncat</string>
  <key>CFBundleVersion</key>
  <string>1.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.15</string>
  <key>LSApplicationCategoryType</key>
  <string>public.app-category.productivity</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

  # Create proper icns from png if possible, otherwise just use png
  if [ -f "$ICON_SRC_DIR/pwa-512x512.png" ]; then
    # macOS will use the largest png as fallback icon
    cp "$ICON_SRC_DIR/pwa-512x512.png" "$RESOURCES_DIR/AppIcon.png"
  fi

  ok "App created at ~/Applications/Asyncat.app — shows in Spotlight + Launchpad"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  DESK_DIR="$HOME/.local/share/applications"
  mkdir -p "$DESK_DIR"

  # Create proper .desktop file with icon
  cat > "$DESK_DIR/asyncat.desktop" <<DESKTOP
[Desktop Entry]
Name=Asyncat
Comment=Open-source AI workspace
Exec=$BIN_DIR/asyncat-ui
Icon=asyncat
Type=Application
Categories=Development;Utility;Office;
StartupNotify=true
Terminal=false
DESKTOP

  update-desktop-database "$DESK_DIR" 2>/dev/null || true
  gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
  ok "App shortcut created — search 'Asyncat' in your app launcher"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}  ✓  asyncat installed!${NC}"
echo ""
echo "  For humans (UI app):"
echo -e "    Click ${CYAN}Asyncat${NC} in your app menu / Launchpad / launcher"
echo ""
echo "  For terminal users:"
echo -e "    ${CYAN}asyncat${NC}              open the interactive CLI REPL"
echo -e "    ${CYAN}asyncat start${NC}        start backend only"
echo -e "    ${CYAN}asyncat-ui${NC}           launch the web app"
echo -e "    ${CYAN}asyncat --help${NC}       see all commands"
echo ""
echo "  Optional local AI engine:"
echo -e "    ${CYAN}asyncat install --local-engine${NC}"
echo ""
