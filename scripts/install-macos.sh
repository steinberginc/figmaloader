#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

npm install
sudo node desktop/patch-figma-loader.js patch "$@"
