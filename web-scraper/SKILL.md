---
name: web-scraper
metadata:
  version: 0.0.5
description: 'Web scraper with SPA/JavaScript rendering. Two-tier engine (HTTP → Playwright
  browser).

  Smart discovery, batch fetch, stealth mode, OpenAPI extraction.

  Use when read_url_content fails or SPA rendering needed.

  '
---

# Web Scraper

> `./scrape <command> [options]` — Run `./scrape help` for full option reference.

## Content Precision Levels

The `fetch` command outputs filtered content by default. Three precision levels:

| Level | Flag | Behavior | When to use |
|-------|------|----------|-------------|
| **Default** | *(none)* | PruningContentFilter removes boilerplate | Most scenarios — good enough |
| **Precision** | `--selector ".css"` | Extract only the matched container | Production-quality docs, zero noise |
| **Raw** | `--raw` | Full page, no filtering | Debugging, page structure analysis |

Precision workflow: fetch a sample page → inspect remaining noise → identify content container via CSS selector → re-fetch all pages with `--selector`.

## Engine Architecture

```
L0: Pure HTTP (httpx + selectolax + markdownify)
    fetch → strip boilerplate → markdownify → clean content

L1: Browser (crawl4ai + Playwright, networkidle wait)
    fetch → PruningContentFilter → fit_markdown → clean content
    Handles: SPAs, anti-bot, JS-rendered content

Auto mode: L0 probe → detect SPA/empty → fallback to L1

Smart Discovery (3-tier):
    1. sitemap.xml → 2. Nav DOM extraction → 3. Browser deep crawl
```

## Workflow Patterns

### Single page fetch

```bash
# Auto-detects if browser needed
./scrape fetch https://open.feishu.cn/document/server-docs/im-v1/message/create

# Force browser for known SPA sites
./scrape fetch https://developer.work.weixin.qq.com/document/path/90664 --engine cdp

# Precision extraction with CSS selector
./scrape fetch https://developer.work.weixin.qq.com/document/path/90196 --engine cdp --selector ".ep-doc-area"
```

### Batch-download documentation

```bash
./scrape fetch https://docs.example.com --auto -o /tmp/docs/
./scrape fetch --from-file urls.txt -o /tmp/docs/
./scrape fetch --from-file urls.txt --merge -o /tmp/docs/all.md
```

Files are automatically named by page title (e.g., `读取成员.md`, `Getting_Started.md`).

### Build organized local documentation

1. **Discover** site structure: `./scrape discover <url> --json` → get URLs + titles
2. **Filter** relevant URLs (Agent selects subset based on user's needs)
3. **Write** filtered URLs to a file
4. **Fetch** to output directory: `./scrape fetch --from-file urls.txt -o /path/to/docs/`
5. **Organize** (Agent moves/renames files into logical folder structure)

### Analyze site structure

```bash
./scrape discover https://docs.example.com
./scrape discover https://docs.example.com --engine cdp --deep --max-pages 100
```

### Extract OpenAPI specs

```bash
./scrape openapi https://api.example.com/v3/api-docs -o /tmp/api.md
./scrape openapi https://api.example.com/swagger-ui/ -o /tmp/api.md
```

## Key Options

| Option | Commands | Description |
|--------|----------|-------------|
| `--engine MODE` | discover, fetch | `auto` (default), `http` (L0 only), `cdp` (L1 only) |
| `--selector CSS` | fetch | CSS selector for content area (precision mode) |
| `--raw` | fetch | Output full page (skip content filtering) |
| `--auto` | fetch | Auto-discover pages then fetch all |
| `--from-file FILE` | fetch | Read URLs from file (one per line) |
| `-o PATH` | fetch, openapi | Output directory or file path |
| `--merge` | fetch | Merge all pages into single markdown |
| `--json` | discover, fetch | Machine-readable JSON output |
| `--summary-only` | fetch | Only show URL, title, char count |
| `--max-pages N` | discover, fetch | Limit pages (discover: 200, fetch: 50) |
| `--deep` | discover | Follow links for browser-based BFS crawl |

## Requirements

- **uv**: `curl -LsSf https://astral.sh/uv/install.sh | sh`
- Dependencies and Playwright Chromium auto-installed on first run
