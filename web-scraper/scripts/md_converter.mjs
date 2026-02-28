/**
 * md_converter.mjs — HTML to Markdown converter.
 *
 * Wraps Turndown + GFM plugin (the only npm dependency).
 * Provides clean, LLM-optimized Markdown output.
 */

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

/**
 * Convert HTML string to clean Markdown.
 * @param {string} html - Raw HTML content
 * @param {object} opts
 * @param {boolean} [opts.includeLinks=true] - Keep hyperlinks
 * @param {boolean} [opts.includeImages=false] - Keep images
 * @returns {string} Clean Markdown
 */
export function htmlToMarkdown(html, opts = {}) {
    const td = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-',
        emDelimiter: '*',
    });

    // Enable GFM (tables, strikethrough, task lists)
    td.use(gfm);

    // Remove script/style/noscript tags
    td.remove(['script', 'style', 'noscript', 'svg', 'iframe']);

    // Optionally strip images
    if (!opts.includeImages) {
        td.addRule('removeImages', {
            filter: 'img',
            replacement: () => '',
        });
    }

    let markdown = td.turndown(html);

    // Post-processing: clean up common noise
    markdown = markdown
        // Collapse multiple blank lines
        .replace(/\n{3,}/g, '\n\n')
        // Remove zero-width chars
        .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
        // Trim trailing whitespace on lines
        .replace(/[ \t]+$/gm, '')
        .trim();

    return markdown;
}

export default htmlToMarkdown;
