/**
 * cdp_client.mjs — Zero-dependency CDP (Chrome DevTools Protocol) client.
 *
 * Uses system-installed Chrome + Node.js built-in WebSocket.
 * No Playwright, no Puppeteer, no browser downloads.
 *
 * Why:
 *   - Minimal footprint: reuses the user's existing Chrome installation
 *   - No 150MB Chromium download per environment
 *   - Direct CDP WebSocket = fastest possible browser control
 *   - Node.js 22 has built-in WebSocket support
 */

import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import { existsSync } from 'fs';

// --- Chrome binary detection ---

const CHROME_PATHS = [
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
];

function findChrome() {
    // Allow explicit override via env
    if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
        return process.env.CHROME_PATH;
    }
    for (const p of CHROME_PATHS) {
        if (existsSync(p)) return p;
    }
    return null;
}

// --- CDP WebSocket helpers ---

let _msgId = 0;

function cdpSend(ws, method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = ++_msgId;
        const timeout = setTimeout(() => {
            ws.removeEventListener('message', handler);
            reject(new Error(`CDP timeout: ${method} (id=${id})`));
        }, 30000);

        const handler = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.id === id) {
                clearTimeout(timeout);
                ws.removeEventListener('message', handler);
                if (msg.error) reject(new Error(`CDP error: ${msg.error.message}`));
                else resolve(msg.result);
            }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

function cdpWaitForEvent(ws, eventName, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            ws.removeEventListener('message', handler);
            reject(new Error(`CDP event timeout: ${eventName}`));
        }, timeoutMs);

        const handler = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.method === eventName) {
                clearTimeout(timeout);
                ws.removeEventListener('message', handler);
                resolve(msg.params);
            }
        };
        ws.addEventListener('message', handler);
    });
}

// --- Core CDP Browser class ---

export class CDPBrowser {
    constructor() {
        this._chrome = null;
        this._ws = null;
        this._port = 0;
    }

    /**
     * Launch Chrome headless with CDP enabled.
     * @param {object} opts
     * @param {number} [opts.port=9222] - CDP debugging port
     * @param {number} [opts.startupWaitMs=1500] - Wait time for Chrome startup
     */
    async launch(opts = {}) {
        const port = opts.port || 9222 + Math.floor(Math.random() * 1000);
        const chromePath = findChrome();
        if (!chromePath) {
            throw new Error(
                'Chrome/Chromium not found. Install Google Chrome or set CHROME_PATH env var.\n' +
                'Searched paths:\n' + CHROME_PATHS.map(p => `  - ${p}`).join('\n')
            );
        }

        this._port = port;
        this._chrome = spawn(chromePath, [
            `--remote-debugging-port=${port}`,
            '--headless=new',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-extensions',
            '--disable-background-networking',
            `--user-data-dir=/tmp/cdp-scraper-${port}`,
        ], { stdio: 'ignore' });

        this._chrome.on('error', (err) => {
            throw new Error(`Failed to launch Chrome: ${err.message}`);
        });

        await sleep(opts.startupWaitMs || 1500);
        return this;
    }

    /**
     * Create a new tab and return a CDPPage.
     */
    async newPage() {
        // Chrome 145+ requires PUT method
        let target;
        try {
            target = await fetch(`http://127.0.0.1:${this._port}/json/new`, { method: 'PUT' })
                .then(r => r.json());
        } catch {
            // Fallback for older Chrome versions
            const targets = await fetch(`http://127.0.0.1:${this._port}/json/list`)
                .then(r => r.json());
            target = targets[0];
        }

        if (!target?.webSocketDebuggerUrl) {
            throw new Error('Could not get CDP WebSocket URL. Is Chrome running?');
        }

        const ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
            ws.addEventListener('open', resolve);
            ws.addEventListener('error', reject);
        });

        return new CDPPage(ws, this);
    }

    /**
     * Kill the Chrome process.
     */
    async close() {
        if (this._chrome) {
            this._chrome.kill('SIGTERM');
            this._chrome = null;
        }
    }
}

// --- CDP Page class ---

export class CDPPage {
    constructor(ws, browser) {
        this._ws = ws;
        this._browser = browser;
    }

    /**
     * Navigate to a URL and wait for load.
     * @param {string} url
     * @param {object} opts
     * @param {number} [opts.waitAfterLoad=2000] - Extra wait for SPA rendering (ms)
     * @param {number} [opts.timeout=30000] - Navigation timeout (ms)
     */
    async goto(url, opts = {}) {
        await cdpSend(this._ws, 'Page.enable');

        const loadPromise = cdpWaitForEvent(this._ws, 'Page.loadEventFired', opts.timeout || 30000);
        await cdpSend(this._ws, 'Page.navigate', { url });
        await loadPromise;

        // Extra wait for SPA JS rendering
        await sleep(opts.waitAfterLoad ?? 2000);
    }

    /**
     * Evaluate JavaScript in the page context.
     * @param {string} expression
     * @returns {*} The result value
     */
    async evaluate(expression) {
        const { result } = await cdpSend(this._ws, 'Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
        });
        if (result.subtype === 'error') {
            throw new Error(`Page evaluate error: ${result.description}`);
        }
        return result.value;
    }

    /**
     * Get the page title.
     */
    async title() {
        return this.evaluate('document.title');
    }

    /**
     * Get the current URL (after any redirects).
     */
    async url() {
        return this.evaluate('window.location.href');
    }

    /**
     * Extract the main content HTML using smart heuristics.
     * Tries common content selectors, falls back to <body>.
     */
    async extractContentHTML() {
        return this.evaluate(`
      (() => {
        const selectors = [
          'article', 'main', '[role="main"]',
          '.doc-content', '.markdown-body', '.content-body',
          '.documentation', '.docs-content', '.page-content',
          '#content', '#main-content', '.main-content',
          '.prose', '.entry-content', '.post-content',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && el.innerHTML.length > 500) return el.innerHTML;
        }
        // Fallback: body, but strip nav/header/footer/sidebar
        const clone = document.body.cloneNode(true);
        for (const sel of ['nav', 'header', 'footer', '.sidebar', '.nav', '.menu', '.toc']) {
          clone.querySelectorAll(sel).forEach(el => el.remove());
        }
        return clone.innerHTML;
      })()
    `);
    }

    /**
     * Extract all links on the page.
     * @param {object} opts
     * @param {string} [opts.baseUrl] - Filter links to same origin
     * @returns {Array<{href: string, text: string}>}
     */
    async extractLinks(opts = {}) {
        const links = await this.evaluate(`
      (() => {
        const results = [];
        const seen = new Set();
        document.querySelectorAll('a[href]').forEach(a => {
          const href = a.href;
          const text = (a.textContent || '').trim().slice(0, 200);
          if (href && !seen.has(href) && !href.startsWith('javascript:') && !href.startsWith('#')) {
            seen.add(href);
            results.push({ href, text });
          }
        });
        return results;
      })()
    `);

        if (opts.baseUrl) {
            const origin = new URL(opts.baseUrl).origin;
            return links.filter(l => {
                try { return new URL(l.href).origin === origin; }
                catch { return false; }
            });
        }
        return links;
    }

    /**
     * Close this tab's WebSocket connection.
     */
    async close() {
        if (this._ws) {
            this._ws.close();
            this._ws = null;
        }
    }
}

export default CDPBrowser;
