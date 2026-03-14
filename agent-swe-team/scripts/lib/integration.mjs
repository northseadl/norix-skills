// Progressive Integration — auto-merge completed work, rebase downstream worktrees

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve as pathResolve } from "node:path";
import { log } from "./logger.mjs";

const exec = promisify(execFile);
const GIT = "git";

// ─── Integration Branch ───

/**
 * Create the integration branch from current HEAD or a specific sha.
 * @param {string} cwd - Repository root
 * @param {string} runId
 * @param {string} [baseSha] - Defaults to HEAD
 */
export async function createIntegrationBranch(cwd, runId, baseSha) {
    const branchName = `integration/${runId}`;
    const base = baseSha || "HEAD";
    await git(cwd, ["branch", branchName, base]);
    log("INFO", `Created integration branch: ${branchName} from ${base}`);
    return branchName;
}

/**
 * Get the integration branch name for a run.
 */
export function integrationBranchName(runId) {
    return `integration/${runId}`;
}

// ─── Integration Worktree ───

/**
 * Create a dedicated worktree for the integration branch.
 * All merge operations happen here instead of touching the main working tree.
 * @param {string} cwd - Repository root
 * @param {string} runId
 * @param {string} worktreeRootAbs - Root directory for worktrees
 * @returns {string} Absolute path to the integration worktree
 */
export async function createIntegrationWorktree(cwd, runId, worktreeRootAbs) {
    const intBranch = integrationBranchName(runId);
    const intWorktreePath = pathResolve(worktreeRootAbs, "__integration__");
    await exec(GIT, ["worktree", "add", intWorktreePath, intBranch], { cwd });
    log("INFO", `Integration worktree: ${intWorktreePath}`);
    return intWorktreePath;
}

/**
 * Remove the integration worktree (cleanup).
 */
export async function removeIntegrationWorktree(cwd, worktreePath) {
    try {
        await exec(GIT, ["worktree", "remove", worktreePath, "--force"], { cwd });
    } catch { /* best effort */ }
}

// ─── Progressive Merge ───

/**
 * Merge a role's branch into the integration branch.
 * Uses a dedicated integration worktree — never touches the main working tree.
 * @param {string} integrationWorktreePath - Path to the integration worktree
 * @param {string} runId
 * @param {string} role
 * @param {string} roleBranch - e.g. "team/20260307/frontend-1"
 * @returns {{ success: boolean, conflicted: boolean, message: string }}
 */
export async function mergeRoleToIntegration(integrationWorktreePath, runId, role, roleBranch) {
    const intBranch = integrationBranchName(runId);

    try {
        await git(integrationWorktreePath, [
            "merge", "--no-ff", roleBranch,
            "-m", `merge: ${role} ticket completed`,
        ]);
        log("INFO", `Merged ${roleBranch} → ${intBranch}`);
        return { success: true, conflicted: false, message: "Merged successfully" };
    } catch (mergeErr) {
        // Check if it's a conflict
        try {
            const { stdout: status } = await git(integrationWorktreePath, ["status", "--porcelain"]);
            if (status.includes("UU") || status.includes("AA")) {
                await git(integrationWorktreePath, ["merge", "--abort"]);
                log("WARN", `Merge conflict: ${roleBranch} → ${intBranch}`);
                return { success: false, conflicted: true, message: mergeErr.message };
            }
        } catch { /* status check failed */ }
        // Non-conflict merge failure — abort if in progress and rethrow
        try { await git(integrationWorktreePath, ["merge", "--abort"]); } catch { /* ignore */ }
        throw mergeErr;
    }
}

/**
 * Check if a merge would be clean (dry-run).
 */
export async function canMergeCleanly(cwd, runId, roleBranch) {
    const intBranch = integrationBranchName(runId);
    try {
        // Use merge-tree for conflict detection without touching worktree
        const { stdout } = await git(cwd, [
            "merge-tree", "--write-tree",
            intBranch, roleBranch,
        ]);
        return !stdout.includes("CONFLICT");
    } catch {
        return false;
    }
}

// ─── Worktree Rebase ───

/**
 * Rebase a role's worktree onto the latest integration branch.
 * @param {string} worktreePath - Absolute path to the role's worktree
 * @param {string} runId
 * @returns {{ success: boolean, message: string }}
 */
export async function rebaseWorktreeOnIntegration(worktreePath, runId) {
    const intBranch = integrationBranchName(runId);

    try {
        // Fetch latest
        await git(worktreePath, ["fetch", "."]);

        // Attempt rebase
        await git(worktreePath, ["rebase", intBranch]);
        log("INFO", `Rebased worktree ${worktreePath} onto ${intBranch}`);
        return { success: true, message: "Rebased successfully" };
    } catch (err) {
        // If rebase fails, abort and reset to integration HEAD
        try {
            await git(worktreePath, ["rebase", "--abort"]);
        } catch { /* ignore */ }

        try {
            await git(worktreePath, ["reset", "--hard", intBranch]);
            log("WARN", `Rebase failed for ${worktreePath}, reset to ${intBranch}`);
            return { success: true, message: "Reset to integration HEAD (rebase conflict)" };
        } catch (resetErr) {
            log("ERROR", `Failed to reset worktree ${worktreePath}: ${resetErr.message}`);
            return { success: false, message: resetErr.message };
        }
    }
}

/**
 * Propagate integration branch changes to all active role worktrees.
 * @param {string} cwd
 * @param {string} runId
 * @param {object} state - TeamStore state
 * @param {string} excludeRole - Role that just merged (skip rebase for it)
 */
export async function propagateToAllWorktrees(cwd, runId, state, excludeRole) {
    const roles = state.roles || {};
    const results = [];

    for (const [role, roleState] of Object.entries(roles)) {
        if (role === excludeRole) continue;
        if (!roleState.worktreeRel) continue;
        // Only rebase active roles (running/idle/blocked)
        if (roleState.status === "done") continue;

        const worktreePath = pathResolve(cwd, roleState.worktreeRel);
        const result = await rebaseWorktreeOnIntegration(worktreePath, runId);
        results.push({ role, ...result });
    }

    return results;
}

// ─── Integration Branch Info ───

/**
 * Get the latest commit on the integration branch.
 */
export async function getIntegrationHead(cwd, runId) {
    const intBranch = integrationBranchName(runId);
    try {
        const { stdout } = await git(cwd, ["rev-parse", intBranch]);
        return stdout.trim();
    } catch {
        return null;
    }
}

/**
 * Get recent commits on the integration branch (for reviewer/QA monitoring).
 */
export async function getIntegrationLog(cwd, runId, { maxCount = 10 } = {}) {
    const intBranch = integrationBranchName(runId);
    try {
        const { stdout } = await git(cwd, [
            "log", intBranch,
            `--max-count=${maxCount}`,
            "--oneline", "--no-decorate",
        ]);
        return stdout.trim().split("\n").filter(Boolean);
    } catch {
        return [];
    }
}

// ─── Git Helper ───

async function git(cwd, args) {
    try {
        return await exec(GIT, args, {
            cwd,
            maxBuffer: 10 * 1024 * 1024,
            env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        });
    } catch (err) {
        err.message = `git ${args.join(" ")}: ${err.stderr || err.message}`;
        throw err;
    }
}
