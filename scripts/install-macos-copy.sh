#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

TARGET_APP="${FIGMA_LOADER_TARGET_APP:-$HOME/Applications/Figma Blue Loader.app}"

if [[ -e "$TARGET_APP" ]]; then
  echo "Target app already exists: $TARGET_APP"
  echo "Delete it first, or set FIGMA_LOADER_TARGET_APP to another path."
  exit 1
fi

mkdir -p "$(dirname "$TARGET_APP")"
ditto /Applications/Figma.app "$TARGET_APP"
npm install
node desktop/patch-figma-loader.js patch --app "$TARGET_APP" "$@"

echo
echo "Patched copy created at:"
echo "  $TARGET_APP"
echo
echo "Open it with:"
echo "  open \"$TARGET_APP\""
