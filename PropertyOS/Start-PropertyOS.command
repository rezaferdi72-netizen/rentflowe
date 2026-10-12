#!/bin/bash
set -e
cd -- "$(dirname -- "$0")"
if command -v python3 >/dev/null 2>&1; then
  exec python3 scripts/launch-local.py
elif command -v node >/dev/null 2>&1; then
  open http://127.0.0.1:4173
  exec node scripts/serve.mjs
else
  echo 'Install Python 3 or Node.js to use this browser launcher, or build/install the native Mac app. See README.md.'
  read -r -p 'Press Return to close.'
fi
