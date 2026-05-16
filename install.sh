#!/usr/bin/env sh
# Asyncat installer — Linux & macOS
# Usage: curl -fsSL https://asyncat.com/install.sh | sh
#        or: bash install.sh  (from inside the cloned repo)
set -e

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info() { printf "%b\n" "${CYAN}[asyncat]${NC} $*"; }
ok()   { printf "%b\n" "${GREEN}[asyncat]${NC} ✓ $*"; }
warn() { printf "%b\n" "${YELLOW}[asyncat]${NC} ⚠ $*"; }
die()  { printf "%b\n" "${RED}[asyncat]${NC} ✗ $*" >&2; exit 1; }

INSTALL_DIR="${ASYNCAT_INSTALL_DIR:-$HOME/.asyncat}"
BIN_DIR="$HOME/.local/bin"
REPO_URL="https://github.com/asyncat-oss/asyncat-oss.git"
AUTO_SYSTEM_DEPS="${ASYNCAT_INSTALL_SYSTEM_DEPS:-0}"

echo ""
echo "    /\_____/\ "
echo "   /  o   o  \    asyncat  open-source AI workspace"
echo "  ( ==  ^  == )   ─────────────────────────────────"
echo "   )         (    https://asyncat.com"
echo ""

detect_pkg_manager() {
  if command -v brew >/dev/null 2>&1; then echo brew; return; fi
  if command -v apt-get >/dev/null 2>&1; then echo apt; return; fi
  if command -v dnf >/dev/null 2>&1; then echo dnf; return; fi
  if command -v pacman >/dev/null 2>&1; then echo pacman; return; fi
  if command -v zypper >/dev/null 2>&1; then echo zypper; return; fi
  if command -v apk >/dev/null 2>&1; then echo apk; return; fi
  echo none
}

install_system_packages() {
  packages="$1"
  [ -n "$packages" ] || return 0
  pm="$(detect_pkg_manager)"
  case "$pm" in
    brew)   brew install $packages ;;
    apt)    sudo apt-get update && sudo apt-get install -y $packages ;;
    dnf)    sudo dnf install -y $packages ;;
    pacman) sudo pacman -S --needed $packages ;;
    zypper) sudo zypper install -y $packages ;;
    apk)    sudo apk add $packages ;;
    *)      return 1 ;;
  esac
}

system_install_hint() {
  pm="$(detect_pkg_manager)"
  case "$pm" in
    brew)   echo "brew install git node python@3.12 unzip ffmpeg cmake ninja whisper-cpp" ;;
    apt)    echo "sudo apt-get update && sudo apt-get install -y git python3 python3-venv python3-pip unzip tar ffmpeg build-essential cmake ninja-build" ;;
    dnf)    echo "sudo dnf install -y git nodejs npm python3 python3-pip unzip tar ffmpeg gcc-c++ make cmake ninja-build" ;;
    pacman) echo "sudo pacman -S --needed git nodejs npm python python-pip unzip tar ffmpeg base-devel cmake ninja" ;;
    zypper) echo "sudo zypper install -y git nodejs20 npm20 python3 python3-pip unzip tar ffmpeg gcc-c++ make cmake ninja" ;;
    apk)    echo "sudo apk add git nodejs npm python3 py3-pip unzip tar ffmpeg build-base cmake ninja" ;;
    *)      echo "Install Node.js 20+, npm, git, Python 3.10+ with venv/pip, unzip/tar, ffmpeg, and C++ build tools using your OS package manager." ;;
  esac
}

check_optional_system_deps() {
  missing=""
  command -v python3 >/dev/null 2>&1 || command -v python >/dev/null 2>&1 || missing="$missing python"
  command -v ffmpeg >/dev/null 2>&1 || missing="$missing ffmpeg"
  command -v unzip >/dev/null 2>&1 || missing="$missing unzip"
  command -v tar >/dev/null 2>&1 || missing="$missing tar"
  command -v g++ >/dev/null 2>&1 || command -v clang++ >/dev/null 2>&1 || command -v c++ >/dev/null 2>&1 || missing="$missing compiler"
  if [ -n "$missing" ]; then
    warn "Optional local-runtime tools missing:$missing"
    warn "Install hint: $(system_install_hint)"
    warn "To let this installer try OS packages, rerun with ASYNCAT_INSTALL_SYSTEM_DEPS=1"
  else
    ok "Optional local-runtime tools detected"
  fi
}

if [ "$AUTO_SYSTEM_DEPS" = "1" ]; then
  info "Installing system dependencies with $(detect_pkg_manager)..."
  case "$(detect_pkg_manager)" in
    brew)   install_system_packages "git node python@3.12 unzip ffmpeg cmake ninja whisper-cpp" || warn "System package install failed; continuing with checks." ;;
    apt)    install_system_packages "git python3 python3-venv python3-pip unzip tar ffmpeg build-essential cmake ninja-build" || warn "System package install failed; continuing with checks." ;;
    dnf)    install_system_packages "git nodejs npm python3 python3-pip unzip tar ffmpeg gcc-c++ make cmake ninja-build" || warn "System package install failed; continuing with checks." ;;
    pacman) install_system_packages "git nodejs npm python python-pip unzip tar ffmpeg base-devel cmake ninja" || warn "System package install failed; continuing with checks." ;;
    zypper) install_system_packages "git nodejs20 npm20 python3 python3-pip unzip tar ffmpeg gcc-c++ make cmake ninja" || warn "System package install failed; continuing with checks." ;;
    apk)    install_system_packages "git nodejs npm python3 py3-pip unzip tar ffmpeg build-base cmake ninja" || warn "System package install failed; continuing with checks." ;;
    none)   warn "No supported package manager detected. $(system_install_hint)" ;;
  esac
fi

# ── 1. Node.js v20+ ───────────────────────────────────────────────────────────
info "Checking Node.js..."
command -v node >/dev/null 2>&1 || die "Node.js not found. Install from https://nodejs.org (v20+ required), or install via your OS package manager."
NODE_VER=$(node -e "process.stdout.write(process.version)")
NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
[ "$NODE_MAJOR" -ge 20 ] || die "Node.js v20+ required. You have $NODE_VER — upgrade at https://nodejs.org or with a current package manager."
ok "Node.js $NODE_VER"

# ── 2. git ────────────────────────────────────────────────────────────────────
command -v git >/dev/null 2>&1 || die "git not found. Install git and try again. Hint: $(system_install_hint)"
check_optional_system_deps

# ── 3. Clone or update ────────────────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Updating existing install at $INSTALL_DIR..."
  git -C "$INSTALL_DIR" pull --ff-only || warn "Could not pull latest — continuing with existing version."
else
  # If running from inside an already-cloned repo, install in-place
  SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)" || SCRIPT_DIR=""
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
(cd "$INSTALL_DIR" && node "$INSTALL_DIR/cat" install --skip-packages --local-engine) \
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

  case "$SHELL_RC" in
    *fish*) IS_FISH_RC=1 ;;
    *) IS_FISH_RC=0 ;;
  esac
  if grep -q "fish_add_path" "$SHELL_RC" 2>/dev/null || [ "$IS_FISH_RC" = "1" ]; then
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
PWA_ICONS="pwa-72x72.png pwa-96x96.png pwa-128x128.png pwa-144x144.png pwa-152x152.png pwa-192x192.png pwa-384x384.png pwa-512x512.png"

# Linux icon directories (hicolor follows freedesktop spec)
HICOLOR_BASE="$HOME/.local/share/icons/hicolor"
for icon in $PWA_ICONS; do
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
UNAME_S="$(uname -s 2>/dev/null || echo unknown)"
if [ "$UNAME_S" = "Darwin" ]; then
  mkdir -p "$HOME/Library/Caches/asyncat-icons"
  for icon in $PWA_ICONS; do
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

CYAN='\\033[0;36m'; GREEN='\\033[0;32m'; YELLOW='\\033[1;33m'; NC='\\033[0m'
info() { echo -e "\${CYAN}[asyncat]\${NC} \$*"; }
ok()   { echo -e "\${GREEN}[asyncat]\${NC} ✓ \$*"; }
warn() { echo -e "\${YELLOW}[asyncat]\${NC} ⚠ \$*"; }

INSTALL_DIR="${ASYNCAT_INSTALL_DIR:-__ASYNCAT_INSTALL_DIR__}"
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
  # Serve the built frontend with Vite preview when a production build exists.
  if [ -d "$NEKO_DIST" ]; then
    (cd "$INSTALL_DIR/neko" && npm run preview -- --host 127.0.0.1 --port $NEKO_PORT &>/dev/null) &
  else
    # Fallback: use neko's dev server
    (cd "$INSTALL_DIR/neko" && npm run dev -- --host 127.0.0.1 --port $NEKO_PORT &>/dev/null) &
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
sed -i.bak "s#__ASYNCAT_INSTALL_DIR__#$INSTALL_DIR#g" "$LAUNCHER" && rm -f "$LAUNCHER.bak"
chmod +x "$LAUNCHER"

# macOS: create .app bundle with proper icon
if [ "$UNAME_S" = "Darwin" ]; then
  APP_DIR="$HOME/Applications/Asyncat.app"
  MACOS_DIR="$APP_DIR/Contents/MacOS"
  RESOURCES_DIR="$APP_DIR/Contents/Resources"
  mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

  # Copy launcher script
  cp "$LAUNCHER" "$MACOS_DIR/asyncat-launcher"
  chmod +x "$MACOS_DIR/asyncat-launcher"

  # Copy all icons to Resources
  for icon in $PWA_ICONS; do
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
elif [ "$UNAME_S" = "Linux" ]; then
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
printf "%b\n" "${GREEN}  ✓  asyncat installed!${NC}"
echo ""
echo "  For humans (UI app):"
printf "%b\n" "    Click ${CYAN}Asyncat${NC} in your app menu / Launchpad / launcher"
echo ""
echo "  For terminal users:"
printf "%b\n" "    ${CYAN}asyncat${NC}              start and open the web app"
printf "%b\n" "    ${CYAN}asyncat start${NC}        start and open the web app"
printf "%b\n" "    ${CYAN}asyncat tui${NC}          open the interactive CLI REPL"
printf "%b\n" "    ${CYAN}asyncat-ui${NC}           launch the web app window"
printf "%b\n" "    ${CYAN}asyncat --help${NC}       see all commands"
echo ""
echo "  Uninstall:"
printf "%b\n" "    ${CYAN}asyncat uninstall${NC}    remove launchers and show data cleanup"
echo ""
