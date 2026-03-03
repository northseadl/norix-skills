// Review Loop Manager — parse reviewer findings, auto-create fix tickets, manage re-review cycles

import { log } from "./logger.mjs";

const MAX_REVIEW_LOOPS = 3;

/**
 * Analyze reviewer findings and determine next actions.
 * @param {Array} findingItems - Parsed finding items from extractor
 * @param {number} currentLoopCount - How many review loops have occurred
 * @returns {{ action: string, fixTickets: Array, escalate: boolean }}
 *   action: "approve" | "fix_and_re_review" | "escalate"
 */
export function analyzeFindings(findingItems, currentLoopCount) {
    if (!findingItems || findingItems.length === 0) {
        return { action: "approve", fixTickets: [], escalate: false };
    }

    const mustFix = findingItems.filter((f) => f.severity === "MUST_FIX");
    const shouldFix = findingItems.filter((f) => f.severity === "SHOULD_FIX");

    // If exceeded max loops, escalate regardless
    if (currentLoopCount >= MAX_REVIEW_LOOPS) {
        log("WARN", `Review loop limit reached (${MAX_REVIEW_LOOPS}). Escalating to Leader.`);
        return {
            action: "escalate",
            fixTickets: [],
            escalate: true,
            reason: `After ${currentLoopCount} review rounds, ${mustFix.length} MUST_FIX items remain. Leader intervention required.`,
        };
    }

    // No must-fix items → approve (should-fix are informational)
    if (mustFix.length === 0) {
        return { action: "approve", fixTickets: [], escalate: false };
    }

    // Group MUST_FIX items by affected role
    const byRole = {};
    for (const f of mustFix) {
        const role = f.affectedRole || "backend"; // Default to backend if unspecified
        if (!byRole[role]) byRole[role] = [];
        byRole[role].push(f);
    }

    const fixTickets = Object.entries(byRole).map(([role, items]) => ({
        role,
        findings: items,
        ticketContent: generateFixTicketContent(role, items, currentLoopCount + 1),
    }));

    return {
        action: "fix_and_re_review",
        fixTickets,
        escalate: false,
    };
}

/**
 * Generate a fix ticket markdown for a role based on reviewer findings.
 */
function generateFixTicketContent(role, items, round) {
    const lines = [
        `# Fix: Review Round ${round} — ${role}`,
        "",
        "## Context",
        `The reviewer found ${items.length} issue(s) that must be fixed before merge.`,
        "",
        "## Scope",
        "- In-scope: Fix the specific issues listed below",
        "- Out-of-scope: Do NOT make unrelated changes",
        "",
        "## Findings to Fix",
        "",
    ];

    for (const item of items) {
        const file = item.file ? ` (${item.file})` : "";
        lines.push(`- 🔴 ${item.description}${file}`);
    }

    lines.push("");
    lines.push("## Acceptance");
    lines.push("- [ ] All listed issues are resolved");
    lines.push("- [ ] No new regressions introduced");
    lines.push("- [ ] Existing tests still pass");

    return lines.join("\n");
}

/**
 * Check if findings contain items that need to be fed back to a specific role.
 * Used by Prompt Enricher to inject findings into fix ticket assignments.
 */
export function findingsForRole(findingItems, role) {
    if (!findingItems || findingItems.length === 0) return [];
    return findingItems.filter(
        (f) => f.severity === "MUST_FIX" && (f.affectedRole === role || !f.affectedRole),
    );
}
