// DAG — topological sort, dependency resolution, and task parsing

import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { log } from "./logger.mjs";

/**
 * Extract task numeric ID from filename (e.g. "T3-setup.md" → 3).
 * @param {string} filename
 * @returns {number|null}
 */
export function extractId(filename) {
    const m = basename(filename).match(/^T(\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

/**
 * Extract dependency IDs from task content (e.g. "← T1, T2" → [1, 2]).
 * @param {string} content
 * @returns {number[]}
 */
export function extractDeps(content) {
    const line = content.split("\n").find((l) => l.includes("← T"));
    if (!line) return [];
    return [...line.matchAll(/T(\d+)/g)].map((m) => parseInt(m[1], 10));
}

/**
 * Extract per-task engine override from content.
 * @param {string} content
 * @returns {string|null}
 */
export function extractEngine(content) {
    const m = content.match(
        /^\s*[-*]?\s*\*{0,2}engine\*{0,2}\s*[:：]\s*(codex|claude)/im,
    );
    return m ? m[1].toLowerCase() : null;
}

/**
 * Extract task size estimate from content (S/M/L).
 * @param {string} content
 * @returns {"S"|"M"|"L"}
 */
export function extractEstimate(content) {
    const m = content.match(/\*{0,2}预估\*{0,2}\s*[:：]\s*(S|M|L)/i);
    return m ? m[1].toUpperCase() : "M";
}

/**
 * Load and parse task spec files from a directory.
 * @param {string} taskDir
 * @param {string} defaultEngine
 * @returns {Promise<Array<{id: number, file: string, filePath: string, content: string, deps: number[], engine: string}>>}
 */
export async function loadTasks(taskDir, defaultEngine) {
    const entries = await readdir(taskDir);
    const files = entries.filter((f) => /^T\d+.*\.md$/.test(f)).sort();
    const tasks = [];
    for (const file of files) {
        const filePath = join(taskDir, file);
        const content = await readFile(filePath, "utf-8");
        const id = extractId(file);
        if (id === null) {
            log("WARN", `Skipping unparseable file: ${file}`);
            continue;
        }
        const engine = extractEngine(content) || defaultEngine;
        tasks.push({ id, file, filePath, content, deps: extractDeps(content), engine });
    }
    return tasks;
}

/**
 * Produce topological batches from tasks — each batch can run in parallel.
 * @param {Array<{id: number, deps: number[]}>} tasks
 * @returns {number[][]}
 */
export function topologicalBatches(tasks) {
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const completed = new Set();
    const remaining = new Set(tasks.map((t) => t.id));

    // Pre-satisfy deps that reference non-existent tasks
    for (const task of tasks) {
        for (const dep of task.deps) {
            if (!taskMap.has(dep)) {
                log("WARN", `T${task.id} depends on non-existent T${dep} — treated as satisfied`);
                completed.add(dep);
            }
        }
    }

    const batches = [];
    while (remaining.size > 0) {
        const batch = [];
        for (const id of remaining) {
            if (taskMap.get(id).deps.every((d) => completed.has(d))) batch.push(id);
        }
        if (batch.length === 0) {
            throw new Error(
                `Deadlock: ${[...remaining].map((id) => `T${id}`).join(", ")} have circular dependencies`,
            );
        }
        batches.push(batch);
        for (const id of batch) {
            completed.add(id);
            remaining.delete(id);
        }
    }
    return batches;
}

/**
 * Build directed edge list from task dependencies.
 * @param {Array<{id: number, deps: number[]}>} tasks
 * @returns {Array<[number, number]>}
 */
export function buildEdges(tasks) {
    const edges = [];
    for (const task of tasks) {
        for (const dep of task.deps) edges.push([dep, task.id]);
    }
    return edges;
}

/**
 * Resolve which SDK engines are needed for a task set.
 * @param {Array<{engine: string}>} tasks
 */
export function resolveEngines(tasks) {
    const codexCount = tasks.filter((t) => t.engine === "codex").length;
    const claudeCount = tasks.filter((t) => t.engine === "claude").length;
    return { needsCodex: codexCount > 0, needsClaude: claudeCount > 0, codexCount, claudeCount };
}
