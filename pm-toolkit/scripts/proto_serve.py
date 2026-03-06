#!/usr/bin/env python3
"""PM Toolkit — Prototype Preview Server

Serves Agent-generated HTML pages with a preview shell.

  GET  /              → preview shell (prototype.html)
  GET  /api/pages     → list .html files in directory
  GET  /page/<name>   → serve raw HTML file (for iframe)
  DELETE /api/page/<name> → delete a page

Usage: python3 proto_serve.py --dir <prototype-dir> [--port 9877]
"""

import argparse
import json
import re
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

NAME_RE = re.compile(r"^[a-zA-Z0-9_-]+$")
SCRIPT_DIR = Path(__file__).resolve().parent


def parse_args():
    p = argparse.ArgumentParser(description="PM Toolkit Prototype Preview Server")
    p.add_argument("--dir", required=True, help="Directory containing prototype HTML files")
    p.add_argument("--port", type=int, default=9877, help="Server port (default: 9877)")
    return p.parse_args()


def list_pages(proto_dir: Path) -> list[dict]:
    pages = []
    for f in sorted(proto_dir.iterdir()):
        if f.is_file() and f.suffix == ".html":
            name = f.stem
            mtime = f.stat().st_mtime * 1000
            pages.append({"name": name, "file": f.name, "mtime": mtime})
    return pages


class ProtoHandler(BaseHTTPRequestHandler):
    shell_html: str = ""
    proto_dir: Path = Path()

    def log_message(self, format, *args):
        pass

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,DELETE,OPTIONS")
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
            self._send_text(200, self.shell_html, "text/html; charset=utf-8")
            return

        if path == "/api/pages":
            self._send_json(200, {"pages": list_pages(self.proto_dir), "dir": str(self.proto_dir)})
            return

        m = re.match(r"^/page/([a-zA-Z0-9_-]+)$", path)
        if m:
            html_file = self.proto_dir / f"{m.group(1)}.html"
            if not html_file.exists():
                self._send_text(404, "Not found")
                return
            self._send_text(200, html_file.read_text(encoding="utf-8"), "text/html; charset=utf-8")
            return

        self._send_text(404, "Not found")

    def do_DELETE(self):
        path = self.path.split("?")[0]
        m = re.match(r"^/api/page/([a-zA-Z0-9_-]+)$", path)
        if m:
            name = m.group(1)
            if not NAME_RE.match(name):
                self._send_text(400, "Invalid name")
                return
            html_file = self.proto_dir / f"{name}.html"
            try:
                if html_file.exists():
                    html_file.unlink()
                self._send_json(200, {"ok": True})
            except Exception as e:
                self._send_text(500, str(e))
            return

        self._send_text(404, "Not found")


def main():
    args = parse_args()
    proto_dir = Path(args.dir).resolve()
    proto_dir.mkdir(parents=True, exist_ok=True)

    shell_path = SCRIPT_DIR / "prototype.html"
    shell_html = shell_path.read_text(encoding="utf-8") if shell_path.exists() else "<h1>prototype.html not found</h1>"

    ProtoHandler.shell_html = shell_html
    ProtoHandler.proto_dir = proto_dir

    server = HTTPServer(("", args.port), ProtoHandler)
    pages = list_pages(proto_dir)
    print(f"\nPrototype Preview")
    print(f"  Dir:   {proto_dir}")
    print(f"  URL:   http://localhost:{args.port}")
    print(f"  Pages: {len(pages)}\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == "__main__":
    main()
