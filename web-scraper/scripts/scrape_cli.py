#!/usr/bin/env python3
"""
scrape_cli.py — Unified CLI entry point for web-scraper.

Supports: discover, fetch, openapi commands.
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

from engine import (
    batch_fetch, discover, fetch_browser, fetch_http,
    merge_results, save_markdown,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="scrape",
        description="Web Scraper — Scrape, analyze & extract content from any website",
    )
    sub = parser.add_subparsers(dest="command")

    # -- discover --
    p_disc = sub.add_parser("discover", help="Analyze site structure and list links")
    p_disc.add_argument("url", help="URL to analyze")
    p_disc.add_argument("--deep", action="store_true",
                        help="Follow links to discover more pages")
    p_disc.add_argument("--max-pages", type=int, default=200)
    p_disc.add_argument("--max-depth", type=int, default=3)
    p_disc.add_argument("--wait", type=int, default=2000)
    p_disc.add_argument("--json", action="store_true", dest="json_output")
    p_disc.add_argument("--links-only", action="store_true")
    p_disc.add_argument("--sitemap", action="store_true")
    p_disc.add_argument("--engine", choices=["auto", "http", "cdp"], default="auto")

    # -- fetch --
    p_fetch = sub.add_parser("fetch", help="Fetch page(s) and convert to Markdown")
    p_fetch.add_argument("url", nargs="?", help="URL to fetch")
    p_fetch.add_argument("--auto", action="store_true",
                         help="Auto-discover pages then fetch all")
    p_fetch.add_argument("--from-file", type=str, help="Read URLs from file")
    p_fetch.add_argument("-o", "--output", type=str, help="Output directory or file")
    p_fetch.add_argument("--merge", action="store_true",
                         help="Merge all pages into single file")
    p_fetch.add_argument("--max-pages", type=int, default=50)
    p_fetch.add_argument("--max-lines", type=int, default=0)
    p_fetch.add_argument("--wait", type=int, default=2000)
    p_fetch.add_argument("--summary-only", action="store_true")
    p_fetch.add_argument("--json", action="store_true", dest="json_output")
    p_fetch.add_argument("--engine", choices=["auto", "http", "cdp"], default="auto")
    p_fetch.add_argument("--raw", action="store_true",
                         help="Output full page (skip content filtering)")
    p_fetch.add_argument("--selector", type=str, default=None,
                         help="CSS selector for content area (precision extraction)")

    # -- openapi --
    p_api = sub.add_parser("openapi", help="Extract OpenAPI/Swagger spec as Markdown")
    p_api.add_argument("url", help="Spec URL or Swagger UI page")
    p_api.add_argument("-o", "--output", type=str)

    return parser


# ---------------------------------------------------------------------------
# OpenAPI spec → Markdown converter
# ---------------------------------------------------------------------------

def openapi_to_markdown(spec: dict) -> str:
    """Convert OpenAPI/Swagger JSON to readable Markdown."""
    lines: list[str] = []
    info = spec.get("info", {})

    lines.append(f"# {info.get('title', 'API Documentation')}")
    if info.get("version"):
        lines.append(f"\n**Version**: {info['version']}")
    if info.get("description"):
        lines.append(f"\n{info['description']}")
    lines.append("")

    # Servers
    for srv in spec.get("servers", []):
        lines.append(f"- `{srv.get('url', '')}` — {srv.get('description', '')}")

    # Paths
    paths = spec.get("paths", {})
    if paths:
        lines.append("\n## Endpoints\n")
        for path, methods in paths.items():
            for method, details in methods.items():
                if method not in ("get", "post", "put", "delete", "patch", "options", "head"):
                    continue
                flag = " ⚠️ DEPRECATED" if details.get("deprecated") else ""
                lines.append(f"### `{method.upper()}` {path}{flag}\n")
                if details.get("summary"):
                    lines.append(f"**{details['summary']}**\n")
                if details.get("description"):
                    lines.append(f"{details['description']}\n")

                # Parameters
                params = details.get("parameters", [])
                if params:
                    lines.append("| Name | In | Type | Required | Description |")
                    lines.append("|------|-----|------|----------|-------------|")
                    for p in params:
                        schema = p.get("schema", {})
                        req = "✅" if p.get("required") else ""
                        lines.append(
                            f"| `{p.get('name', '')}` | {p.get('in', '')} "
                            f"| {schema.get('type', '')} | {req} | {p.get('description', '')} |"
                        )
                    lines.append("")

                # Responses
                responses = details.get("responses", {})
                if responses:
                    lines.append("**Responses:**\n")
                    for code, resp in responses.items():
                        lines.append(f"- `{code}`: {resp.get('description', '')}")
                    lines.append("")

    # Schemas
    components = spec.get("components", spec.get("definitions", {}))
    schemas = components.get("schemas", {}) if isinstance(components, dict) else {}
    if schemas:
        lines.append("\n## Schemas\n")
        for name, schema in schemas.items():
            lines.append(f"### {name}\n")
            if schema.get("description"):
                lines.append(f"{schema['description']}\n")
            props = schema.get("properties", {})
            required = schema.get("required", [])
            if props:
                lines.append("| Field | Type | Required | Description |")
                lines.append("|-------|------|----------|-------------|")
                for pname, pschema in props.items():
                    ptype = pschema.get("type", "")
                    if pschema.get("$ref"):
                        ptype = pschema["$ref"].split("/")[-1]
                    if pschema.get("items"):
                        item = pschema["items"]
                        item_type = item.get("$ref", "").split("/")[-1] or item.get("type", "")
                        ptype = f"array[{item_type}]"
                    req = "✅" if pname in required else ""
                    lines.append(
                        f"| `{pname}` | {ptype} | {req} | {pschema.get('description', '')} |"
                    )
                lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Command handlers
# ---------------------------------------------------------------------------

async def cmd_discover(args):
    links = await discover(args.url, max_pages=args.max_pages, engine=args.engine)

    if args.json_output:
        output = {
            "url": args.url,
            "links": links,
            "totalLinks": len(links),
        }
        print(json.dumps(output, indent=2, ensure_ascii=False))
        return

    if args.links_only:
        for link in links:
            print(link["href"])
        return

    if args.sitemap:
        # Build tree
        tree: dict = {}
        for link in links:
            parts = Path(link["href"]).parts
            node = tree
            for p in parts:
                node = node.setdefault(p, {})
        _print_tree(tree)
        return

    # Full report
    print(f"\n{'='*60}")
    print(f"Site Analysis: {args.url}")
    print(f"{'='*60}")
    print(f"Links: {len(links)}")
    print(f"\nTop links:")
    for link in links[:20]:
        text = f" — {link['text'][:60]}" if link.get("text") else ""
        print(f"  {link['href']}{text}")
    if len(links) > 20:
        print(f"  ... and {len(links) - 20} more")


def _print_tree(node: dict, prefix: str = ""):
    keys = sorted(node.keys())
    for i, key in enumerate(keys):
        is_last = i == len(keys) - 1
        print(f"{prefix}{'└── ' if is_last else '├── '}{key}")
        if node[key]:
            _print_tree(node[key], f"{prefix}{'    ' if is_last else '│   '}")


async def cmd_fetch(args):
    # Collect URLs
    urls: list[str] = []
    if args.from_file:
        content = Path(args.from_file).read_text(encoding="utf-8")
        urls = [line.strip() for line in content.splitlines()
                if line.strip() and not line.startswith("#")]
    elif args.url:
        if args.auto:
            # Auto-discover then fetch
            print(f"🔍 Auto-discovering pages from: {args.url}", file=sys.stderr)
            links = await discover(args.url, max_pages=args.max_pages)
            urls = [link["href"] for link in links]
            print(f"📋 Found {len(urls)} pages to fetch", file=sys.stderr)
        else:
            urls = [args.url]
    else:
        print("ERROR: Provide a URL or --from-file", file=sys.stderr)
        sys.exit(1)

    if not urls:
        print("No URLs to fetch.", file=sys.stderr)
        return

    # Determine output path
    output_dir = None
    if args.output:
        if args.output.endswith("/") or (not args.merge and len(urls) > 1):
            output_dir = args.output
        # If merge, output is a file path

    # Fetch
    results = await batch_fetch(
        urls,
        output_dir=output_dir,
        engine=args.engine,
        merge=args.merge,
        wait_ms=args.wait,
        raw=args.raw,
        selector=args.selector,
    )

    # Apply max-lines
    if args.max_lines > 0:
        for r in results:
            if r.get("markdown"):
                lines = r["markdown"].split("\n")
                if len(lines) > args.max_lines:
                    r["markdown"] = "\n".join(lines[:args.max_lines]) + \
                                    f"\n\n... (truncated at {args.max_lines} lines)"
                    r["chars"] = len(r["markdown"])

    # Output
    if args.json_output:
        output = []
        for r in results:
            entry = {
                "url": r["url"],
                "title": r.get("title", ""),
                "chars": r.get("chars", 0),
                "tokens_est": r.get("chars", 0) // 4,
                "error": r.get("error"),
            }
            if not args.summary_only:
                entry["markdown"] = r.get("markdown", "")
            output.append(entry)
        print(json.dumps(output, indent=2, ensure_ascii=False))

    elif args.merge or (args.output and not args.output.endswith("/")):
        merged = merge_results(results)
        if args.output:
            Path(args.output).parent.mkdir(parents=True, exist_ok=True)
            Path(args.output).write_text(merged, encoding="utf-8")
            print(f"✅ Merged {len(results)} pages → {args.output} ({len(merged)} chars)",
                  file=sys.stderr)
        else:
            print(merged)

    elif output_dir:
        saved = sum(1 for r in results if r.get("markdown"))
        print(f"✅ Saved {saved} pages → {output_dir}/", file=sys.stderr)

    else:
        # Print to stdout
        if args.summary_only:
            for r in results:
                err = f" | ERROR: {r['error']}" if r.get("error") else ""
                print(f"{r['url']} | {r.get('title', '')} | "
                      f"{r.get('chars', 0)} chars | ~{r.get('chars', 0)//4} tokens{err}")
        else:
            for r in results:
                if r.get("markdown"):
                    print(r["markdown"])
                elif r.get("error"):
                    print(f"ERROR: {r['url']}: {r['error']}", file=sys.stderr)


async def cmd_openapi(args):
    import httpx as _httpx

    print(f"🔍 Looking for OpenAPI spec at {args.url}...", file=sys.stderr)

    spec = None
    # Step 1: Try direct JSON fetch
    try:
        async with _httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            resp = await client.get(args.url, headers={"Accept": "application/json"})
            if resp.status_code == 200:
                data = resp.json()
                if data.get("openapi") or data.get("swagger") or data.get("paths"):
                    spec = data
    except Exception:
        pass

    # Step 2: Browser-based discovery
    if not spec:
        print("  Not a direct spec URL. Launching browser to discover...", file=sys.stderr)
        try:
            from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
            browser_conf = BrowserConfig(headless=True)
            run_conf = CrawlerRunConfig(cache_mode=CacheMode.BYPASS)

            async with AsyncWebCrawler(config=browser_conf) as crawler:
                result = await crawler.arun(args.url, config=run_conf)
                if result.success and result.links:
                    for link in result.links.get("external", []) + result.links.get("internal", []):
                        href = link.get("href", "")
                        if any(p in href for p in ("swagger", "openapi", "api-docs")) and \
                           href.endswith((".json", ".yaml", ".yml")):
                            try:
                                async with _httpx.AsyncClient(timeout=10) as c:
                                    r = await c.get(href)
                                    d = r.json()
                                    if d.get("openapi") or d.get("swagger") or d.get("paths"):
                                        spec = d
                                        break
                            except Exception:
                                continue
        except Exception as exc:
            print(f"  Browser error: {exc}", file=sys.stderr)

    if not spec:
        print("❌ No OpenAPI/Swagger spec found. Try providing the direct spec URL.",
              file=sys.stderr)
        sys.exit(1)

    markdown = openapi_to_markdown(spec)

    if args.output:
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        Path(args.output).write_text(markdown, encoding="utf-8")
        print(f"✅ Saved OpenAPI docs to {args.output}", file=sys.stderr)
    else:
        print(markdown)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    if args.command == "discover":
        asyncio.run(cmd_discover(args))
    elif args.command == "fetch":
        asyncio.run(cmd_fetch(args))
    elif args.command == "openapi":
        asyncio.run(cmd_openapi(args))


if __name__ == "__main__":
    main()
