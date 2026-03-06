"""
engine.py — Tiered scraping engine: L0 (HTTP) → L1 (crawl4ai browser).

L0: Pure HTTP via httpx + selectolax + markdownify. Zero browser overhead.
L1: Full browser rendering via crawl4ai (Playwright). For SPAs and anti-bot sites.
"""

import asyncio
import re
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from markdownify import markdownify
from selectolax.parser import HTMLParser

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

# ---------------------------------------------------------------------------
# L0: Pure‑HTTP helpers
# ---------------------------------------------------------------------------

def needs_browser(html: str) -> bool:
    """Heuristic: does the HTML look like it needs JS rendering?"""
    if len(html) < 2000:
        return True

    tree = HTMLParser(html)
    text = tree.body.text(strip=True) if tree.body else ""

    # SPA shells
    spa_signals = ['id="app"', 'id="root"', 'id="__next"', "Loading..."]
    if len(text) < 500 and any(s in html for s in spa_signals):
        return True

    # Anti‑bot / captcha pages
    anti_bot = ["captcha", "verify", "验证码", "challenge"]
    lower = html.lower()
    if any(k in lower for k in anti_bot):
        return True

    return False


def _strip_boilerplate(tree: HTMLParser) -> str:
    """Remove nav/header/footer/sidebar, return body HTML."""
    for sel in ["nav", "header", "footer", ".sidebar", ".menu", ".toc",
                "[role='navigation']", "[role='banner']"]:
        for node in tree.css(sel):
            node.decompose()
    return tree.body.html if tree.body else ""


async def fetch_http(url: str, client: httpx.AsyncClient | None = None) -> dict:
    """L0: pure HTTP fetch → Markdown. Returns dict with 'markdown' or 'needs_browser'."""
    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(follow_redirects=True, timeout=10,
                                   headers={"User-Agent": UA})
    try:
        resp = await client.get(url)
    except Exception as exc:
        return {"url": url, "error": str(exc), "needs_browser": True}
    finally:
        if owns_client:
            await client.aclose()

    if needs_browser(resp.text):
        return {"url": url, "needs_browser": True}

    tree = HTMLParser(resp.text)

    # Title
    title_node = tree.css_first("title")
    title = title_node.text(strip=True) if title_node else ""

    content_html = _strip_boilerplate(tree)
    md = markdownify(content_html, heading_style="ATX", strip=["img", "script", "style"])
    # Clean up
    md = re.sub(r"\n{3,}", "\n\n", md).strip()

    return {
        "url": url,
        "title": title,
        "markdown": md,
        "chars": len(md),
        "needs_browser": False,
        "error": None,
    }


# ---------------------------------------------------------------------------
# L1: crawl4ai browser engine
# ---------------------------------------------------------------------------

async def fetch_browser(urls: list[str], output_dir: str | None = None,
                        merge: bool = False, wait_ms: int = 2000,
                        raw: bool = False,
                        selector: str | None = None,
                        js_code: str | list[str] | None = None,
                        wait_for: str | None = None,
                        scan_full_page: bool = False,
                        delay_after_js: float = 0.1) -> list[dict]:
    """L1: crawl4ai browser rendering with content filtering.

    Args:
        js_code: JavaScript to execute before content extraction.
        wait_for: CSS selector to wait for before extraction.
        scan_full_page: Scroll through entire page to trigger lazy loading.
        delay_after_js: Seconds to wait after JS execution before extraction.
    """
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
    from crawl4ai.content_filter_strategy import PruningContentFilter
    from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator

    browser_conf = BrowserConfig(
        headless=True,
        text_mode=True,
        light_mode=True,
    )

    # When selector is given, extract only that container (no heuristic needed)
    # Otherwise, use PruningContentFilter to strip boilerplate
    use_filter = not raw and not selector
    md_gen = DefaultMarkdownGenerator(
        content_filter=PruningContentFilter() if use_filter else None,
    )
    run_conf = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        stream=True,
        wait_until="networkidle",
        page_timeout=max(wait_ms * 5, 30000),
        markdown_generator=md_gen,
        css_selector=selector,
        js_code=js_code,
        wait_for=wait_for,
        scan_full_page=scan_full_page,
        delay_before_return_html=delay_after_js,
    )

    results = []
    async with AsyncWebCrawler(config=browser_conf) as crawler:
        async for result in await crawler.arun_many(urls, config=run_conf):
            title = ""
            md = ""
            err = None
            if result.success and result.markdown:
                if selector or raw:
                    md = result.markdown.raw_markdown or ""
                else:
                    md = result.markdown.fit_markdown or result.markdown.raw_markdown or ""
                title = (result.metadata or {}).get("title", "")
                print(f"  ✅ [{len(results)+1}/{len(urls)}] {result.url} ({len(md)} chars)",
                      file=sys.stderr)
            elif result.success:
                print(f"  ⚠️ [{len(results)+1}/{len(urls)}] {result.url}: no content",
                      file=sys.stderr)
            else:
                err = result.error_message
                print(f"  ❌ [{len(results)+1}/{len(urls)}] {result.url}: {err}",
                      file=sys.stderr)

            entry = {
                "url": result.url,
                "title": title,
                "markdown": md,
                "chars": len(md),
                "error": err,
            }
            results.append(entry)

            if output_dir and not merge and md:
                save_markdown(entry, output_dir)

    return results


async def exec_js(url: str, js_code: str | list[str],
                  wait_ms: int = 3000,
                  session_id: str | None = None,
                  js_only: bool = False) -> dict:
    """Execute JavaScript on a page and return the result.

    Unlike fetch_browser, this returns the JS execution result directly,
    not the page markdown. Useful for extracting data from page state,
    interacting with SPAs, or reading dynamic content.

    Args:
        url: Page URL to navigate to (ignored if js_only=True with existing session).
        js_code: JavaScript to execute. Use 'return X' to get a value back.
        wait_ms: Wait time for page load.
        session_id: Reuse browser session for multi-step interactions.
        js_only: Skip navigation, execute JS on existing session page.
    """
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

    browser_conf = BrowserConfig(headless=True)
    run_conf = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        wait_until="networkidle",
        page_timeout=max(wait_ms * 3, 15000),
        js_code=js_code,
        js_only=js_only,
        session_id=session_id,
        delay_before_return_html=1.0,
    )

    async with AsyncWebCrawler(config=browser_conf) as crawler:
        result = await crawler.arun(url, config=run_conf)
        return {
            "url": url,
            "success": result.success,
            "title": (result.metadata or {}).get("title", "") if result.success else "",
            "html_length": len(result.html or "") if result.success else 0,
            "markdown_length": len(result.markdown.raw_markdown or "") if result.success and result.markdown else 0,
            "console": getattr(result, "console_messages", []) or [],
            "error": result.error_message if not result.success else None,
        }


# ---------------------------------------------------------------------------
# Smart Discovery
# ---------------------------------------------------------------------------

async def try_sitemap(url: str) -> list[dict]:
    """Level 1: Try fetching sitemap.xml."""
    parsed = urlparse(url)
    sitemap_url = f"{parsed.scheme}://{parsed.netloc}/sitemap.xml"
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10,
                                     headers={"User-Agent": UA}) as client:
            resp = await client.get(sitemap_url)
        if resp.status_code != 200 or "<urlset" not in resp.text.lower():
            return []
        # Parse simple sitemap
        locs = re.findall(r"<loc>(.*?)</loc>", resp.text, re.IGNORECASE)
        return [{"href": loc.strip(), "text": ""} for loc in locs]
    except Exception:
        return []


async def extract_nav_from_html(url: str) -> list[dict]:
    """Level 2: Extract navigation links from raw HTML (zero browser)."""
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10,
                                     headers={"User-Agent": UA}) as client:
            resp = await client.get(url)
    except Exception:
        return []

    if len(resp.text) < 1000:
        return []

    tree = HTMLParser(resp.text)
    origin = f"{resp.url.scheme}://{resp.url.host}"
    links: dict[str, str] = {}

    nav_selectors = [
        "nav a[href]", ".sidebar a[href]", ".menu a[href]",
        ".toc a[href]", "[role=navigation] a[href]",
        ".docs-sidebar a[href]", ".api-sidebar a[href]",
    ]
    for selector in nav_selectors:
        for node in tree.css(selector):
            href = node.attributes.get("href", "")
            text = node.text(strip=True)
            if href and not href.startswith(("#", "javascript:")):
                absolute = urljoin(str(resp.url), href).split("#")[0]
                if absolute.startswith(origin):
                    links[absolute] = text

    # Fallback: all <a> tags
    if len(links) < 10:
        for node in tree.css("a[href]"):
            href = node.attributes.get("href", "")
            text = node.text(strip=True)
            if href and not href.startswith(("#", "javascript:", "mailto:")):
                absolute = urljoin(str(resp.url), href).split("#")[0]
                absolute = re.sub(r"\?.*$", "", absolute)  # strip query
                if absolute.startswith(origin) and not re.search(
                    r"\.(png|jpg|gif|svg|css|js|woff|ico|pdf|zip)$", absolute, re.I
                ):
                    links[absolute] = text

    return [{"href": k, "text": v} for k, v in links.items()]


async def crawl4ai_deep_discover(url: str, max_pages: int = 200) -> list[dict]:
    """Level 3: crawl4ai deep crawl (browser-based BFS)."""
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

    browser_conf = BrowserConfig(headless=True, text_mode=True, light_mode=True)
    run_conf = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        wait_until="networkidle",
    )

    visited = set()
    queue = [url]
    results: list[dict] = []

    async with AsyncWebCrawler(config=browser_conf) as crawler:
        while queue and len(visited) < max_pages:
            batch = []
            while queue and len(batch) < 5:
                u = queue.pop(0)
                if u not in visited:
                    visited.add(u)
                    batch.append(u)

            if not batch:
                break

            crawl_results = await crawler.arun_many(batch, config=run_conf)
            for r in crawl_results:
                if not r.success:
                    continue
                results.append({"href": r.url, "text": (r.metadata or {}).get("title", "")})
                # Extract links from the page
                if r.links and "internal" in r.links:
                    for link in r.links["internal"]:
                        href = link.get("href", "").split("#")[0]
                        if href and href not in visited:
                            queue.append(href)

            print(f"  🕷️ Discovered {len(visited)} pages...", file=sys.stderr)

    return results


async def discover(url: str, max_pages: int = 200, engine: str = "auto") -> list[dict]:
    """Three-tier site discovery strategy."""

    if engine == "cdp":
        print("⚠️ Forced browser-based deep crawl...", file=sys.stderr)
        return await crawl4ai_deep_discover(url, max_pages)

    # Level 1: sitemap.xml
    links = await try_sitemap(url)
    if links and len(links) > 10:
        print(f"✅ sitemap.xml: {len(links)} URLs", file=sys.stderr)
        return links[:max_pages]

    # Level 2: nav DOM extraction (pure HTTP)
    links = await extract_nav_from_html(url)
    if links and len(links) > 10:
        print(f"✅ Nav extraction: {len(links)} URLs", file=sys.stderr)
        return links[:max_pages]

    # Level 3: crawl4ai deep crawl
    print("⚠️ Falling back to browser-based deep crawl...", file=sys.stderr)
    return await crawl4ai_deep_discover(url, max_pages)


# ---------------------------------------------------------------------------
# Combined engine: auto-routing
# ---------------------------------------------------------------------------

async def batch_fetch(urls: list[str], output_dir: str | None = None,
                      engine: str = "auto", merge: bool = False,
                      wait_ms: int = 2000, raw: bool = False,
                      selector: str | None = None,
                      js_code: str | list[str] | None = None,
                      wait_for: str | None = None,
                      scan_full_page: bool = False,
                      delay_after_js: float = 0.1) -> list[dict]:
    """Smart batch fetch: HTTP-first probe → browser fallback."""

    # If JS interaction is requested, force browser engine
    if js_code or wait_for or scan_full_page:
        engine = "cdp"

    browser_kwargs = dict(
        js_code=js_code, wait_for=wait_for,
        scan_full_page=scan_full_page, delay_after_js=delay_after_js,
    )

    if engine == "cdp":
        return await fetch_browser(
            urls, output_dir, merge, wait_ms,
            raw=raw, selector=selector, **browser_kwargs,
        )

    if engine == "http":
        async with httpx.AsyncClient(follow_redirects=True, timeout=10,
                                     headers={"User-Agent": UA}) as client:
            sem = asyncio.Semaphore(20)

            async def _fetch(u: str) -> dict:
                async with sem:
                    return await fetch_http(u, client)

            results = await asyncio.gather(*[_fetch(u) for u in urls])
            for r in results:
                if r.get("markdown") and output_dir and not merge:
                    save_markdown(r, output_dir)
            return list(results)

    # Auto mode: HTTP probe → split → browser fallback
    print("📡 Probing URLs with HTTP...", file=sys.stderr)
    http_ok: list[dict] = []
    need_browser: list[str] = []

    async with httpx.AsyncClient(follow_redirects=True, timeout=10,
                                 headers={"User-Agent": UA}) as client:
        sem = asyncio.Semaphore(20)

        async def probe(u: str):
            async with sem:
                result = await fetch_http(u, client)
                if result.get("needs_browser"):
                    need_browser.append(u)
                else:
                    http_ok.append(result)

        await asyncio.gather(*[probe(u) for u in urls])

    print(f"📊 HTTP OK: {len(http_ok)}, Need browser: {len(need_browser)}",
          file=sys.stderr)

    if output_dir and not merge:
        for r in http_ok:
            if r.get("markdown"):
                save_markdown(r, output_dir)

    browser_results = []
    if need_browser:
        browser_results = await fetch_browser(
            need_browser, output_dir, merge, wait_ms,
            raw=raw, selector=selector, **browser_kwargs,
        )

    return http_ok + browser_results


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

def _safe_filename(text: str, max_len: int = 80) -> str:
    """Convert arbitrary text to a filesystem-safe filename."""
    # Remove common suffixes like " - 文档 - 企业微信开发者中心"
    text = re.split(r"\s*[-|–—]\s*(?:文档|文件|Docs?)\b", text)[0].strip()
    # Replace unsafe chars
    safe = re.sub(r"[^\w\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff-]", "_", text)
    safe = re.sub(r"_+", "_", safe).strip("_")
    return (safe or "untitled")[:max_len]


def _url_to_slug(url: str, max_len: int = 80) -> str:
    """Fallback: convert URL path to a filename slug."""
    path = urlparse(url).path
    slug = re.sub(r"[^a-zA-Z0-9]", "_", path).strip("_")
    slug = re.sub(r"_+", "_", slug)
    return (slug or "index")[:max_len]


def save_markdown(entry: dict, output_dir: str):
    """Save a single result as a markdown file. Uses page title for naming."""
    if not entry.get("markdown"):
        return
    title = entry.get("title", "").strip()
    filename = _safe_filename(title) if title else _url_to_slug(entry["url"])
    filepath = Path(output_dir) / f"{filename}.md"
    filepath.parent.mkdir(parents=True, exist_ok=True)
    content = f"# {title or entry['url']}\n\n> Source: {entry['url']}\n\n{entry['markdown']}"
    filepath.write_text(content, encoding="utf-8")


def merge_results(results: list[dict]) -> str:
    """Merge multiple results into a single markdown string."""
    parts = []
    for r in results:
        if r.get("markdown"):
            parts.append(
                f"# {r.get('title', r['url'])}\n\n> Source: {r['url']}\n\n{r['markdown']}"
            )
    return "\n\n---\n\n".join(parts)
