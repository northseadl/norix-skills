import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Resolve the .git path for a worktree (may be a gitdir file pointing elsewhere).
 */
function gitPath(worktreeAbs) {
    const dotGit = join(worktreeAbs, ".git");
    if (!existsSync(dotGit)) return null;
    try {
        const content = readFileSync(dotGit, "utf-8").trim();
        if (content.startsWith("gitdir: ")) {
            return content.slice("gitdir: ".length);
        }
    } catch { /* ignore */ }
    return dotGit;
}

/**
 * Append a pattern to the worktree's info/exclude to keep it git-neutral.
 */
export async function appendWorktreeExcludePattern(worktreeAbs, pattern) {
    const gp = gitPath(worktreeAbs);
    if (!gp) return;
    const excludePath = join(gp, "info", "exclude");
    await mkdir(join(gp, "info"), { recursive: true });
    if (existsSync(excludePath)) {
        const content = await readFile(excludePath, "utf-8");
        if (content.includes(pattern)) return;
    }
    await appendFile(excludePath, `\n${pattern}\n`, "utf-8");
}

async function git(cwd, args, { allowFailure } = {}) {
    try {
        const { stdout } = await execFileAsync("git", args, { cwd });
        return String(stdout || "").trim();
    } catch (err) {
        if (allowFailure) return null;
        const msg = err?.stderr ? String(err.stderr).trim() : err.message;
        throw new Error(`git ${args.join(" ")} failed: ${msg}`);
    }
}

export async function ensureGitRepo(cwd) {
    const out = await git(cwd, ["rev-parse", "--is-inside-work-tree"], { allowFailure: true });
    if (out !== "true") throw new Error(`${cwd} is not a git repository`);
}

export async function revParse(cwd, ref) {
    const out = await git(cwd, ["rev-parse", ref]);
    return out.split("\n")[0].trim();
}

/**
 * Sanitize agent name for use in git branch names and filesystem paths.
 * CJK names → safe ASCII slug via encodeURIComponent.
 */
function safeBranchName(name) {
    // If already ASCII-safe, use as-is
    if (/^[\w-]+$/.test(name)) return name;
    return encodeURIComponent(name);
}

export async function createRoleWorktrees({ cwd, runId, baseSha, roles, worktreeRootAbs, dryRun }) {
    await ensureGitRepo(cwd);
    await mkdir(worktreeRootAbs, { recursive: true });

    const results = {};
    for (const role of roles) {
        const safeName = safeBranchName(role);
        const branch = `team/${runId}/${safeName}`;
        const wtPath = join(worktreeRootAbs, safeName);
        results[role] = { branch, worktreePath: wtPath };
        if (dryRun) continue;

        if (existsSync(wtPath)) {
            throw new Error(`worktree path already exists: ${wtPath}`);
        }
        await git(cwd, ["worktree", "add", "-b", branch, wtPath, baseSha]);
    }
    return results;
}

export async function removeRoleWorktrees({ cwd, runId, roles, worktreeRootAbs, keepBranches, force, dryRun }) {
    await ensureGitRepo(cwd);
    const planned = [];

    for (const role of roles) {
        const branch = `team/${runId}/${role}`;
        const wtPath = join(worktreeRootAbs, role);
        planned.push({ role, branch, worktreePath: wtPath });
    }

    if (!force) return { planned, executed: false };
    if (dryRun) return { planned, executed: true };

    for (const p of planned) {
        await git(cwd, ["worktree", "remove", p.worktreePath, "--force"], { allowFailure: true });
        if (!keepBranches) {
            await git(cwd, ["branch", "-D", p.branch], { allowFailure: true });
        }
    }

    return { planned, executed: true };
}

export async function getWorktreeStatus({ worktreePathAbs, baseSha }) {
    if (!existsSync(worktreePathAbs)) {
        return {
            headSha: null,
            aheadCount: null,
            dirty: null,
            porcelain: null,
        };
    }
    const headSha = await git(worktreePathAbs, ["rev-parse", "HEAD"], { allowFailure: true });
    const aheadRaw = await git(worktreePathAbs, ["rev-list", "--count", `${baseSha}..HEAD`], {
        allowFailure: true,
    });
    const porcelain = await git(worktreePathAbs, ["status", "--porcelain"], { allowFailure: true });
    const aheadCount = aheadRaw ? parseInt(aheadRaw, 10) : null;
    return {
        headSha: headSha || null,
        aheadCount: Number.isNaN(aheadCount) ? null : aheadCount,
        dirty: porcelain ? porcelain.length > 0 : false,
        porcelain: porcelain || "",
    };
}

export async function isWorktreeClean(worktreePathAbs) {
    const porcelain = await git(worktreePathAbs, ["status", "--porcelain"], { allowFailure: true });
    return !porcelain || porcelain.trim().length === 0;
}

/**
 * Auto-recover a dirty worktree: stash uncommitted changes, then clean untracked files.
 * @returns {{ recovered: boolean, method: string, error?: string }}
 */
export async function autoCleanWorktree(worktreePathAbs, stashMessage = "auto-stash") {
    try {
        await git(worktreePathAbs, ["stash", "--include-untracked", "--message", stashMessage]);
        return { recovered: true, method: "stash" };
    } catch {
        // stash may fail with "nothing to stash" if only untracked files exist
        try {
            await git(worktreePathAbs, ["checkout", "--", "."]);
            await git(worktreePathAbs, ["clean", "-fd"]);
            return { recovered: true, method: "checkout+clean" };
        } catch (cleanErr) {
            return { recovered: false, method: "none", error: cleanErr.message };
        }
    }
}

export function resolvePathUnderCwd(cwd, maybeRel) {
    const abs = resolve(cwd, maybeRel);
    return abs;
}

