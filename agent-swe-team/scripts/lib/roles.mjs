import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Extract the base role type from an instance name.
 * "backend-1" → "backend", "backend-2" → "backend", "architect" → "architect"
 */
export function getRoleType(roleInstance) {
    const match = roleInstance.match(/^(.+)-\d+$/);
    return match ? match[1] : roleInstance;
}

/**
 * Load role template for a given role.
 * Extracts the role section from the consolidated role-system.md reference,
 * falling back to inline minimal templates if the reference file is missing.
 */
export async function loadRoleTemplate(role) {
    const baseRole = getRoleType(role);
    const roleSystemPath = join(__dirname, "..", "..", "references", "role-system.md");

    if (existsSync(roleSystemPath)) {
        const content = await readFile(roleSystemPath, "utf-8");
        // Extract the section for this role (### roleName ... until next ### or ##)
        const sectionPattern = new RegExp(
            `### ${baseRole}\\b[\\s\\S]*?(?=###\\s|## [^#]|$)`,
            "i",
        );
        const match = content.match(sectionPattern);
        if (match) {
            return match[0].trim();
        }
    }

    // Fallback: inline minimal templates
    return INLINE_TEMPLATES[baseRole] || INLINE_TEMPLATES._default;
}

/**
 * Load knowledge packs for a role from configured paths.
 * @param {string} cwd - Project root
 * @param {string} role
 * @param {string[]} knowledgePaths - Paths relative to cwd or skill root
 * @returns {string[]} - Loaded knowledge content
 */
export async function loadKnowledgePacks(cwd, role, knowledgePaths) {
    if (!knowledgePaths || knowledgePaths.length === 0) return [];

    const packs = [];
    for (const kp of knowledgePaths) {
        // Try relative to cwd first, then as absolute
        const resolved = kp.startsWith("/") ? kp : join(cwd, kp);
        if (!existsSync(resolved)) continue;
        try {
            const content = await readFile(resolved, "utf-8");
            // Truncate to 3000 chars per pack to manage context budget
            packs.push(content.length > 3000 ? content.slice(0, 3000) + "\n...(truncated)" : content);
        } catch {
            // Skip unreadable files
        }
    }
    return packs;
}

// Minimal inline templates as fallback when role-system.md is missing
const INLINE_TEMPLATES = {
    architect: `### architect
Scope: design decisions, interfaces, module boundaries.
Produce: ## Contracts, ## Decisions sections.
Do NOT implement large features — only stubs, types, and interface contracts.`,

    backend: `### backend
Scope: server-side logic, APIs, database, business rules.
Consume architect contracts. Produce: ## Contracts, ## API Surface.
Run build + tests before reporting DONE.`,

    frontend: `### frontend
Scope: UI implementation, interactions, component composition.
Follow existing design system and component patterns.
Produce: ## Contracts for shared component interfaces.`,

    qa: `### qa
Scope: verification, regression testing, edge cases.
Run type checks, builds, and tests incrementally.
Produce: ## Findings (🔴 MUST_FIX, 🟡 SHOULD_FIX, 🟢 OPTIONAL).`,

    reviewer: `### reviewer
Scope: code review, correctness, risk surfacing.
Inspect diffs, identify issues, suggest fixes.
Produce: ## Findings (🔴 MUST_FIX, 🟡 SHOULD_FIX, 🟢 OPTIONAL).
May apply small safe fixes directly.`,

    _default: `### role
Follow your ticket instructions precisely.
Include a ## Report section with commits, tests, notes, questions.
End with TEAM_STATUS=DONE|BLOCKED|NEEDS_REVIEW|FAILED.`,
};
