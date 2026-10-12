#!/usr/bin/env python3
"""Serve the built PWA locally with no third-party Python dependencies."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import mimetypes
import webbrowser
import sys

root = Path(__file__).resolve().parents[1] / 'dist'
if not (root / 'index.html').is_file():
    sys.exit('The built app is missing. Run npm ci and npm run build first.')
mimetypes.add_type('application/wasm', '.wasm')
mimetypes.add_type('application/manifest+json', '.webmanifest')

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(root), **kwargs)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()
    def log_message(self, *_args):
        pass  # Do not log sensitive query strings or filenames.

try:
    server = ThreadingHTTPServer(('127.0.0.1', 4173), Handler)
except OSError:
    sys.exit('Port 4173 is busy. If PropertyOS is already open, reuse that window. Keep this port to retain access to your browser database.')
print('PropertyOS: http://127.0.0.1:4173')
print('Keep this launcher running for initial loading. The installed PWA also works offline.')
webbrowser.open('http://127.0.0.1:4173')
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
