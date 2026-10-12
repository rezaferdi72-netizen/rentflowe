#!/bin/bash
set -e
cd -- "$(dirname -- "$0")"
if ! command -v cargo >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
  echo 'Install Node.js, Rust and Xcode build tools first. See docs/BUILD_AND_INSTALL.md.'
  read -r -p 'Press Return to close.'
  exit 1
fi
npm ci
npm test
npm run desktop:build
echo 'Build complete. The app and DMG are in src-tauri/target/release/bundle/.'
open src-tauri/target/release/bundle
