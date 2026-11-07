#!/usr/bin/env bash
# Installs 똑딱작업실 (HangulAIWorkbench) on macOS from the latest GitHub release.
# Written to be run by an AI agent on the user's behalf (see INSTALL.md), and safe to
# run again: it replaces the app, keeps the user's documents and settings.
#
#   curl -fsSL https://raw.githubusercontent.com/ARTHONG1/ttokttak-workspace/main/scripts/install/install-mac.sh | bash
#
# Options (environment):
#   TTOKTTAK_VERSION=v0.14.0   install that release instead of the latest
#   TTOKTTAK_NO_AGENTS=1        skip registering the MCP server and skill with coding agents
#   TTOKTTAK_NO_DESKTOP=1       skip the Desktop shortcut
#   TTOKTTAK_APP_DIR=<folder>   install there instead of /Applications (~/Applications when not writable)
#
# The last line printed is one JSON object after "TTOKTTAK_INSTALL_RESULT ", for the agent.
set -euo pipefail

REPO="ARTHONG1/ttokttak-workspace"
APP_NAME="HangulAIWorkbench"
SHORTCUT_NAME="똑딱작업실"
STEP="start"
APP_PATH=""
VERSION=""
SHORTCUT=""
AGENTS="skipped"
WORK=""

say() { printf '[똑딱작업실] %s\n' "$*" >&2; }
json_str() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
result() {
  printf 'TTOKTTAK_INSTALL_RESULT {"ok":%s,"step":"%s","version":"%s","app":"%s","desktop":"%s","agents":"%s","message":"%s"}\n' \
    "$1" "$STEP" "$(json_str "$VERSION")" "$(json_str "$APP_PATH")" "$(json_str "$SHORTCUT")" "$(json_str "$AGENTS")" "$(json_str "$2")"
}
fail() {
  say "실패: $1"
  result false "$1"
  exit 1
}
cleanup() {
  if [ -n "$WORK" ] && [ -d "$WORK" ]; then
    if mount | grep -q "$WORK/mnt"; then hdiutil detach -quiet "$WORK/mnt" || true; fi
    rm -rf "$WORK"
  fi
}
trap cleanup EXIT

[ "$(uname -s)" = "Darwin" ] || fail "macOS가 아닙니다. Windows에서는 install-windows.ps1을 쓰세요."
for tool in curl hdiutil shasum base64 ditto; do
  command -v "$tool" >/dev/null 2>&1 || fail "필요한 명령어가 없습니다: $tool"
done

STEP="pick"
case "$(uname -m)" in
  arm64) ARCH="arm64" ;;
  x86_64) ARCH="x64" ;;
  *) fail "지원하지 않는 CPU입니다: $(uname -m)" ;;
esac
if [ -n "${TTOKTTAK_VERSION:-}" ]; then
  API="https://api.github.com/repos/$REPO/releases/tags/$TTOKTTAK_VERSION"
else
  API="https://api.github.com/repos/$REPO/releases/latest"
fi
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ttokttak.XXXXXX")"
say "릴리스 정보를 확인합니다"
curl -fsSL -H 'Accept: application/vnd.github+json' "$API" -o "$WORK/release.json" ||
  fail "릴리스를 찾지 못했습니다($API). 아직 공개된 설치 파일이 없을 수 있습니다."
VERSION="$(/usr/bin/plutil -extract tag_name raw -o - "$WORK/release.json" 2>/dev/null ||
  sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' "$WORK/release.json" | head -1)"
[ -n "$VERSION" ] || fail "릴리스 버전을 읽지 못했습니다."
url_of() { grep -o '"browser_download_url": *"[^"]*"' "$WORK/release.json" | sed 's/.*"\(https[^"]*\)"/\1/' | grep -E "$1" | head -1; }
DMG_URL="$(url_of "/$APP_NAME-[0-9][^/]*-$ARCH\\.dmg$")"
if [ -z "$DMG_URL" ] && [ -z "${TTOKTTAK_VERSION:-}" ]; then
  # A release may ship only some platforms (v0.16.2: Apple Silicon only, with
  # the built-in AI model). Fall back to the newest stable release that has a
  # dmg for this CPU.
  say "$VERSION 릴리스에 $ARCH용 설치 파일이 없어, 이 Mac에 맞는 가장 최근 버전을 찾습니다"
  curl -fsSL -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/$REPO/releases?per_page=30" -o "$WORK/releases.json" ||
    fail "릴리스 목록을 받지 못했습니다."
  /usr/bin/osascript -l JavaScript - "$WORK/releases.json" "^$APP_NAME-[0-9][^/]*-$ARCH\\.dmg$" >"$WORK/release.json" <<'JXA' || fail "$ARCH용 dmg가 있는 릴리스를 찾지 못했습니다."
function run(argv) {
  const text = $.NSString.stringWithContentsOfFileEncodingError(argv[0], $.NSUTF8StringEncoding, null).js
  const pattern = new RegExp(argv[1])
  const found = JSON.parse(text).find(
    (r) => !r.draft && !r.prerelease && r.assets.some((a) => pattern.test(a.name)),
  )
  if (!found) throw new Error('no matching release')
  return JSON.stringify(found, null, 1)
}
JXA
  VERSION="$(sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' "$WORK/release.json" | head -1)"
  DMG_URL="$(url_of "/$APP_NAME-[0-9][^/]*-$ARCH\\.dmg$")"
fi
FEED_URL="$(url_of '/latest-mac\.yml$')"
[ -n "$DMG_URL" ] || fail "$VERSION 릴리스에 $ARCH용 dmg가 없습니다."
DMG="$WORK/$(basename "$DMG_URL")"

STEP="download"
say "$(basename "$DMG") 내려받는 중"
curl -fL --retry 3 --progress-bar "$DMG_URL" -o "$DMG" || fail "설치 파일을 내려받지 못했습니다."

STEP="verify"
if [ -n "$FEED_URL" ]; then
  curl -fsSL "$FEED_URL" -o "$WORK/latest-mac.yml" || fail "확인용 파일(latest-mac.yml)을 받지 못했습니다."
  NAME="$(basename "$DMG")"
  WANT="$(awk -v n="$NAME" '$0 ~ "url: *"n"$" {getline; sub(/^ *sha512: */, ""); print; exit}' "$WORK/latest-mac.yml")"
  [ -n "$WANT" ] || fail "latest-mac.yml에 $NAME의 sha512가 없습니다."
  GOT="$(shasum -a 512 "$DMG" | awk '{print $1}' | xxd -r -p | base64)"
  [ "$GOT" = "$WANT" ] || fail "내려받은 파일의 sha512가 릴리스와 다릅니다. 설치하지 않습니다."
  say "파일 확인 완료(sha512)"
else
  say "경고: latest-mac.yml이 없어 sha512를 확인하지 못했습니다"
fi

STEP="install"
mkdir -p "$WORK/mnt"
hdiutil attach -nobrowse -readonly -quiet -mountpoint "$WORK/mnt" "$DMG" || fail "dmg를 열지 못했습니다."
SRC="$WORK/mnt/$APP_NAME.app"
[ -d "$SRC" ] || fail "dmg 안에 $APP_NAME.app이 없습니다."
if pgrep -x "$APP_NAME" >/dev/null 2>&1; then
  say "실행 중인 앱을 닫습니다"
  osascript -e "quit app \"$APP_NAME\"" >/dev/null 2>&1 || true
  sleep 3
fi
DEST_DIR="${TTOKTTAK_APP_DIR:-/Applications}"
mkdir -p "$DEST_DIR" 2>/dev/null || true
if [ ! -w "$DEST_DIR" ]; then DEST_DIR="$HOME/Applications"; mkdir -p "$DEST_DIR"; fi
APP_PATH="$DEST_DIR/$APP_NAME.app"
if [ -d "$APP_PATH" ]; then rm -rf "$APP_PATH"; fi
ditto "$SRC" "$APP_PATH" || fail "$DEST_DIR에 앱을 복사하지 못했습니다."
hdiutil detach -quiet "$WORK/mnt" || true
# not notarized yet: without this the first launch is blocked by Gatekeeper
xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null || true
say "설치 완료: $APP_PATH"

STEP="desktop"
if [ -z "${TTOKTTAK_NO_DESKTOP:-}" ]; then
  DESK="$HOME/Desktop"
  mkdir -p "$DESK"
  SHORTCUT="$DESK/$SHORTCUT_NAME"
  if [ -e "$SHORTCUT" ] || [ -L "$SHORTCUT" ]; then rm -f "$SHORTCUT"; fi
  if ! osascript -e "tell application \"Finder\" to set a to make alias file to POSIX file \"$APP_PATH\" at POSIX file \"$DESK\"" \
       -e "tell application \"Finder\" to set name of a to \"$SHORTCUT_NAME\"" >/dev/null 2>&1; then
    ln -s "$APP_PATH" "$SHORTCUT"
  fi
  say "바탕화면 바로 가기: $SHORTCUT"
fi

STEP="cli"
CLI="$APP_PATH/Contents/Resources/cli/ttokttak"
[ -x "$CLI" ] || fail "앱 안의 명령어를 찾지 못했습니다: $CLI"
"$CLI" install-cli >&2 || say "경고: ttokttak을 PATH에 연결하지 못했습니다. 앱 안의 경로로 계속합니다"

STEP="agents"
if [ -z "${TTOKTTAK_NO_AGENTS:-}" ]; then
  if "$CLI" mcp install all >&2 && "$CLI" skill install all >&2; then
    AGENTS="registered"
  else
    AGENTS="partial"
    say "경고: 일부 에이전트에 등록하지 못했습니다. ttokttak mcp list으로 확인하세요"
  fi
fi

STEP="done"
say "끝났습니다. 바탕화면의 '$SHORTCUT_NAME'로 여세요. 등록한 AI 에이전트는 다시 시작해야 새 도구가 보입니다."
result true "installed"
