import { execSync } from "node:child_process";
import { log } from "./logger.mjs";

/**
 * Validate environment before dispatch to surface preventable failures early.
 * @param {object} config
 * @returns {Array<{level: "warn"|"fatal", msg: string}>}
 */
export function preflight(config) {
    const issues = [];

    // Git workspace check
    try {
        const status = execSync("git status --porcelain", {
            cwd: config.cwd,
            encoding: "utf-8",
            timeout: 5000,
        }).trim();
        if (status) {
            const count = status.split("\\n").length;
            issues.push({
                level: "warn",
                msg: `Working directory has ${count} uncommitted change(s). Builder output will mix with existing changes.`,
            });
        }
        // Log current branch for context
        const branch = execSync("git branch --show-current", {
            cwd: config.cwd,
            encoding: "utf-8",
            timeout: 5000,
        }).trim();
        if (branch) log("INFO", `Git branch: ${branch}`);
    } catch {
        // Not a git repo or git not available — skip
    }

    // removed misguided API key checks since auth is handled by the respective CLIs

    return issues;
}
