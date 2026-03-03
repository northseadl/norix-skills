---
name: web-scraper
version: 0.0.2
description: |
  Web scraper and content extractor with full SPA/JavaScript rendering support.
  Converts any web page — including React, Vue, Angular SPAs — to clean, LLM-optimized Markdown.
  Core capabilities: render JavaScript-driven pages, detect doc frameworks (Docusaurus/VuePress/GitBook/MkDocs),
  discover navigation links, deep-crawl sites, extract OpenAPI/Swagger specs, batch-fetch and merge pages.
  Use when read_url_content returns empty/broken content, or for web scraping, site crawling,
  HTML-to-markdown conversion, documentation site downloading, OpenAPI extraction, SPA content reading,
  sitemap building. Triggers: "抓取网页", "网页爬取", "文档站抓取", "SPA页面", "Swagger文档".
---


# Web Scraper

> Unified CLI: `./scrape <command> [options]`
> Engine: System Chrome + CDP — zero browser downloads, full SPA rendering

## When to Use This Skill

Agent's `read_url_content` works well for simple static HTML pages, but **fails completely** on:
- **SPA pages** (React, Vue, Angular — content loaded via JavaScript)
- **Modern doc sites** (Docusaurus, VuePress, VitePress, GitBook, etc.)
- **API portals** (Feishu Open Platform, Swagger UI, Redoc)

This skill fills those gaps through **real browser rendering** — launching a headless Chrome instance via CDP, waiting for JavaScript to execute, then extracting the rendered DOM as clean Markdown.

### ✅ Use This Skill For

- Scraping **any** web page (static or SPA) and converting to clean Markdown
- Discovering all pages/links on a website automatically
- Extracting OpenAPI/Swagger specs from Swagger UI or Redoc pages
- Batch-downloading an entire documentation site as Markdown
- Building a sitemap/directory tree of any website
- Detecting which framework a site uses (Docusaurus, VuePress, etc.)

### ❌ Don't Use This Skill For

- Pages requiring authentication (login walls)
- Downloading binary files (images, PDFs)
- Simple static pages where `read_url_content` already works fine

## Workflow Patterns

### Pattern 1: Analyze Unknown Website

```bash
# Step 1: Discover framework and structure
./scrape discover https://docs.example.com

# Step 2: If many pages, deep crawl
./scrape discover https://docs.example.com --deep --max-pages 100
```

### Pattern 2: Fetch SPA Content

When `read_url_content` returns empty or incomplete content:

```bash
# Single SPA page → stdout as markdown
./scrape fetch https://open.feishu.cn/document/server-docs/im-v1/message/create

# Save to file
./scrape fetch https://open.feishu.cn/document/server-docs/im-v1/message/create -o /tmp/api.md
```

### Pattern 3: Batch-Download Full Website

```bash
# Auto-discover all pages and merge into one file
./scrape fetch https://docs.example.com --auto --merge -o /tmp/docs/all-docs.md

# Or save as individual files
./scrape fetch https://docs.example.com --auto -o /tmp/docs/
```

### Pattern 4: Selective Page Fetch

```bash
# From a file (one URL per line)
./scrape fetch --from-file /tmp/urls.txt -o /tmp/docs/ --merge
```

### Pattern 5: Extract API Documentation

```bash
# Direct spec URL
./scrape openapi https://api.example.com/v3/api-docs -o /tmp/api-docs.md

# From Swagger UI page (auto-discovers spec URL)
./scrape openapi https://api.example.com/swagger-ui/ -o /tmp/api-docs.md
```

## Command Reference

### `discover` — Analyze Site Structure

```bash
./scrape discover <url> [options]
```

| Option | Description |
|--------|-------------|
| `--links-only` | Only list discovered navigation links |
| `--framework-only` | Only detect the site framework |
| `--sitemap` | Build a directory tree of the site |
| `--deep` | Follow links to discover more pages |
| `--max-pages N` | Max pages to crawl (default: 50) |
| `--max-depth N` | Max crawl depth (default: 3) |
| `--wait MS` | Wait for SPA rendering in ms (default: 2000) |
| `--json` | Output as JSON (for programmatic use) |

### `fetch` — Fetch & Convert Pages

```bash
./scrape fetch <url> [options]
```

| Option | Description |
|--------|-------------|
| `--auto` | Auto-discover pages then fetch all |
| `--from-file FILE` | Read URLs from file (one per line) |
| `-o, --output PATH` | Output directory or file path |
| `--merge` | Merge all pages into single markdown file |
| `--max-lines N` | Max lines per page (0 = unlimited) |
| `--max-pages N` | Max pages in auto mode (default: 50) |
| `--wait MS` | Wait for SPA rendering in ms (default: 2000) |
| `--summary-only` | Only show fetch summary |
| `--json` | Output results as JSON |

### `openapi` — Extract OpenAPI Specs

```bash
./scrape openapi <url> [-o FILE]
```

Accepts either a direct spec URL (`.json`/`.yaml`) or a Swagger UI / Redoc page URL.

## Output Format

All output is optimized for LLM consumption:
- **Markdown tables** (parameter tables, schemas) via GFM plugin
- **Fenced code blocks** for code examples
- **Clean headings** for navigation and grep-ability
- **Token estimates** in summaries to help Agent decide how much to read

## Architecture

```
scrape (Bash CLI entry point)
│
├── discover  → discover.mjs    Site analysis + deep crawl (CDP)
├── fetch     → fetch.mjs       Page fetching + markdown conversion (CDP)
└── openapi   → openapi.mjs     OpenAPI spec discovery + conversion (CDP)
                    ↓
    cdp_client.mjs     Zero-dep CDP client (WebSocket to system Chrome)
    md_converter.mjs   HTML→Markdown (Turndown + GFM)
```

## Requirements

- **Node.js 18+** (for CDP engine and built-in WebSocket)
- **Google Chrome** or Chromium (uses your existing installation, no downloads)

## Dependencies

| Package | Size | Purpose |
|---------|------|---------|
| `turndown` | ~50KB | HTML to Markdown conversion |
| `turndown-plugin-gfm` | ~5KB | Table + strikethrough support |
| **Total** | **~55KB** | *No browser binaries, no heavy frameworks* |
