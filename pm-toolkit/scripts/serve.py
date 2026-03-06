#!/usr/bin/env python3
"""PM Toolkit — Single-file preview server

Serves panel.html and provides read/write API for ONE Mermaid file.

  GET  /              → panel HTML
  GET  /api/read      → { source, mtime }
  POST /api/write     → body: { source } → saves to file

Usage: python3 serve.py --file <path.mmd> [--port 9876]
"""

import argparse
import json
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

MAX_BODY_BYTES = 1024 * 1024
SCRIPT_DIR = Path(__file__).resolve().parent


def parse_args():
    p = argparse.ArgumentParser(description="PM Toolkit Mermaid Preview Server")
    p.add_argument("--file", required=True, help="Path to .mmd file")
    p.add_argument("--port", type=int, default=9876, help="Server port (default: 9876)")
    return p.parse_args()


class PreviewHandler(BaseHTTPRequestHandler):
    panel_html: str = ""
    target_file: Path = Path()
    target_name: str = ""

    def log_message(self, format, *args):
        pass  # silence default logging

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")

    def _send_json(self, code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _send_text(self, code: int, text: str, content_type: str = "text/plain; charset=utf-8"):
        body = text.encode()
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]

        if path in ("/", "/index.html"):
            self._send_text(200, self.panel_html, "text/html; charset=utf-8")
            return

        if path == "/api/read":
            try:
                source = self.target_file.read_text(encoding="utf-8")
                mtime = self.target_file.stat().st_mtime * 1000
                self._send_json(200, {"file": self.target_name, "source": source, "mtime": mtime})
            except Exception as e:
                self._send_text(500, str(e))
            return

        self._send_text(404, "Not found")

    def do_POST(self):
        path = self.path.split("?")[0]

        if path == "/api/write":
            length = int(self.headers.get("Content-Length", 0))
            if length > MAX_BODY_BYTES:
                self._send_text(413, "Payload too large")
                return
            raw = self.rfile.read(length)
            try:
                data = json.loads(raw)
            except (json.JSONDecodeError, ValueError):
                self._send_text(400, "Invalid JSON")
                return
            source = data.get("source")
            if not isinstance(source, str):
                self._send_text(400, "Invalid source")
                return
            try:
                self.target_file.write_text(source, encoding="utf-8")
                mtime = self.target_file.stat().st_mtime * 1000
                self._send_json(200, {"ok": True, "file": self.target_name, "mtime": mtime})
            except Exception as e:
                self._send_text(500, str(e))
            return

        self._send_text(404, "Not found")


def main():
    args = parse_args()
    target = Path(args.file).resolve()
    if not target.exists():
        print(f"文件不存在: {target}", file=sys.stderr)
        sys.exit(1)

    panel_path = SCRIPT_DIR / "panel.html"
    panel_html = panel_path.read_text(encoding="utf-8") if panel_path.exists() else "<h1>panel.html not found</h1>"

    PreviewHandler.panel_html = panel_html
    PreviewHandler.target_file = target
    PreviewHandler.target_name = target.name

    server = HTTPServer(("", args.port), PreviewHandler)
    print(f"\n🎨 PM Toolkit Preview")
    print(f"   文件: {target}")
    print(f"   地址: http://localhost:{args.port}")
    print(f"   渲染: Mermaid.js (CDN, 浏览器端)\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋")
        server.server_close()


if __name__ == "__main__":
    main()
