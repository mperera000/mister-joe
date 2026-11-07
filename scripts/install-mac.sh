#!/usr/bin/env bash
# Install a freshly built Mister Joe into /Applications.
#
# macOS ties the Accessibility grant to the app's code signature. An unsigned
# build gets a new signature every time it changes, which leaves a dead
# "Mister Joe" row in System Settings: the switch looks on, but it belongs to
# the old build. When the build changed, this clears that row so you can switch
# Joe on again for the new one. (Approach borrowed from Momito's install.sh.)
set -euo pipefail

BUNDLE_ID="app.misterjoe.desktop"
SRC="${1:-src-tauri/target/release/bundle/macos/Mister Joe.app}"
DEST="/Applications/Mister Joe.app"

[ -d "$SRC" ] || { echo "No app at $SRC. Run: npm run tauri build -- --bundles app"; exit 1; }

cdhash() { codesign -dvvv "$1" 2>&1 | awk -F= '/^CDHash=/{print $2}'; }

# Sign the whole bundle (not just the binary) so the signature names Joe.
codesign --force --deep --sign - "$SRC"

NEW=$(cdhash "$SRC")
OLD=""
[ -d "$DEST" ] && OLD=$(cdhash "$DEST")

if [ "$NEW" = "$OLD" ]; then
  echo "Mister Joe is already up to date."
  exit 0
fi

osascript -e 'quit app "Mister Joe"' >/dev/null 2>&1 || true
sleep 1
rm -rf "$DEST"
ditto "$SRC" "$DEST"

if [ -n "$OLD" ]; then
  tccutil reset Accessibility "$BUNDLE_ID" >/dev/null 2>&1 || true
  echo "The app changed, so its old Accessibility switch was cleared."
fi
echo "Installed. Opening Mister Joe: switch it on when macOS asks for Accessibility."
open "$DEST"
