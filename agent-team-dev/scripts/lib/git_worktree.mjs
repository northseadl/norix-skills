import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

export async function createRoleWorktrees({ cwd, runId, baseSha, roles, worktreeRootAbs, dryRun }) {
    await ensureGitRepo(cwd);
    await mkdir(worktreeRootAbs, { recursive: true });

    const results = {};
    for (const role of roles) {
        const branch = `team/${runId}/${role}`;
        const wtPath = join(worktreeRootAbs, role);
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

export function resolvePathUnderCwd(cwd, maybeRel) {
    const abs = resolve(cwd, maybeRel);
    return abs;
}

