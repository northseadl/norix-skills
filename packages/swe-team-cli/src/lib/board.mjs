// Board — shared task board for work distribution and progress tracking
// The structured backbone of the workshop. All agents can read, agents update their own scope.
//
// Three concerns:
//   1. Task Registry — what work exists, who owns it, dependencies
//   2. Progress — each worker's self-reported completion
//   3. Global View — full picture readable by all agents
//
// Persistence: single JSON file, atomically written on every mutation.

import { existsSync } from "node:fs";
import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonAtomic } from "./atomic.mjs";
import { Mutex } from "./mutex.mjs";

function emptyBoard(runId, goal) {
    return {
        runId,
        goal: goal || "",
        phase: "initializing",  // initializing → planning → executing → inspecting → completed
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        agents: {},   // keyed by agent name → { role, status, worktreeRel, branch, threadId, ... }
        tasks: [],    // ordered list of tasks
        merges: [],   // merge history
    };
}

function emptyTask(id, title, assignee) {
    return {
        id,
        title,
        assignee: assignee || null,   // agent name
        status: "pending",            // pending → active → done → merged | blocked
        progress: 0,                  // 0-100, self-reported by worker
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notes: "",                    // free-form notes from the assignee
        summary: "",                  // compressed summary after completion (for context handoff)
    };
}

export class Board {
    #path;
    #data;
    #lock;

    constructor(workshopDir) {
        this.#path = join(workshopDir, "board.json");
        this.#data = null;
        this.#lock = new Mutex();
    }

    // ─── Lifecycle ───

    async init(runId, goal) {
        if (existsSync(this.#path)) {
            this.#data = JSON.parse(await readFile(this.#path, "utf-8"));
        } else {
            this.#data = emptyBoard(runId, goal);
            await this.#persist();
        }
        return this.#data;
    }

    async reload() {
        if (existsSync(this.#path)) {
            this.#data = JSON.parse(await readFile(this.#path, "utf-8"));
        }
        return this.#data;
    }

    get data() { return this.#data; }

    async #persist() {
        this.#data.updatedAt = new Date().toISOString();
        await writeJsonAtomic(this.#path, this.#data);
    }

    // ─── Agent Registry ───

    async registerAgent(name, info) {
        return this.#lock.run(async () => {
            this.#data.agents[name] = {
                role: info.role,           // "leader" | "worker" | "inspector"
                status: "idle",            // idle | running | done | blocked
                worktreeRel: info.worktreeRel || null,
                branch: info.branch || null,
                threadId: null,
                currentTaskId: null,       // sequential: only one task at a time
                completedTasks: [],        // list of {id, title, summary} for context compression
                lastSeen: new Date().toISOString(),
                ...info,
            };
            await this.#persist();
        });
    }

    async updateAgent(name, updates) {
        return this.#lock.run(async () => {
            if (!this.#data.agents[name]) return;
            Object.assign(this.#data.agents[name], updates, {
                lastSeen: new Date().toISOString(),
            });
            await this.#persist();
        });
    }

    getAgent(name) {
        return this.#data.agents[name] || null;
    }

    getAgentsByRole(role) {
        return Object.entries(this.#data.agents)
            .filter(([, a]) => a.role === role)
            .map(([name, a]) => ({ name, ...a }));
    }

    getIdleWorkers() {
        return Object.entries(this.#data.agents)
            .filter(([, a]) => a.role === "worker" && a.status === "idle")
            .map(([name, a]) => ({ name, ...a }));
    }

    // ─── Task Management ───

    async addTask(title, assignee = null) {
        return this.#lock.run(async () => {
            const maxId = this.#data.tasks.reduce((m, t) => Math.max(m, t.id), 0);
            const task = emptyTask(maxId + 1, title, assignee);
            this.#data.tasks.push(task);
            await this.#persist();
            return task;
        });
    }

    async updateTask(taskId, updates) {
        return this.#lock.run(async () => {
            const task = this.#data.tasks.find((t) => t.id === taskId);
            if (!task) return null;
            Object.assign(task, updates, { updatedAt: new Date().toISOString() });
            await this.#persist();
            return task;
        });
    }

    getTask(taskId) {
        return this.#data.tasks.find((t) => t.id === taskId) || null;
    }

    getTasksForAgent(agentName) {
        return this.#data.tasks.filter((t) => t.assignee === agentName);
    }

    // Get the next pending task for an agent (sequential: one at a time)
    getNextPendingTask(agentName) {
        return this.#data.tasks.find(
            (t) => t.assignee === agentName && t.status === "pending",
        ) || null;
    }

    // Get the agent's current active task
    getCurrentTask(agentName) {
        const agent = this.#data.agents[agentName];
        if (!agent?.currentTaskId) return null;
        return this.getTask(agent.currentTaskId);
    }

    // Ensure a worker has exactly one active task before entering a fresh session.
    async ensureCurrentTask(agentName) {
        return this.#lock.run(async () => {
            const agent = this.#data.agents[agentName];
            if (!agent) return null;

            if (agent.currentTaskId) {
                const current = this.getTask(agent.currentTaskId);
                if (current) return current;
                agent.currentTaskId = null;
            }

            const nextTask = this.#data.tasks.find(
                (t) => t.assignee === agentName && t.status === "pending",
            );
            if (!nextTask) return null;

            agent.currentTaskId = nextTask.id;
            nextTask.status = "active";
            nextTask.updatedAt = new Date().toISOString();

            await this.#persist();
            return nextTask;
        });
    }

    // Complete current task and record compressed summary for context handoff
    async completeCurrentTask(agentName, expectedTaskId, summary = "") {
        return this.#lock.run(async () => {
            const agent = this.#data.agents[agentName];
            if (!agent?.currentTaskId) return null;
            if (agent.currentTaskId !== expectedTaskId) return null;

            const task = this.getTask(expectedTaskId);
            if (!task) return null;
            if (task.assignee !== agentName) return null;

            task.status = "done";
            task.progress = 100;
            task.summary = summary;
            task.updatedAt = new Date().toISOString();

            if (!agent.completedTasks) agent.completedTasks = [];
            agent.completedTasks.push({
                id: task.id,
                title: task.title,
                summary: summary.slice(0, 500),
            });

            agent.currentTaskId = null;
            agent.threadId = null;

            await this.#persist();
            return task;
        });
    }

    async startTask(agentName, taskId) {
        return this.#lock.run(async () => {
            const agent = this.#data.agents[agentName];
            const task = this.getTask(taskId);
            if (!agent || !task) return null;
            if (task.assignee !== agentName) return null;
            if (agent.currentTaskId && agent.currentTaskId !== taskId) return null;
            if (task.status === "done" || task.status === "merged") return null;

            agent.currentTaskId = taskId;
            task.status = "active";
            task.updatedAt = new Date().toISOString();

            await this.#persist();
            return task;
        });
    }

    // ─── Phase ───

    async setPhase(phase) {
        return this.#lock.run(async () => {
            this.#data.phase = phase;
            await this.#persist();
        });
    }

    // ─── Merge History ───

    async recordMerge(agentName, result) {
        return this.#lock.run(async () => {
            this.#data.merges.push({
                agent: agentName,
                ts: new Date().toISOString(),
                success: result.success,
                conflicted: result.conflicted || false,
                message: result.message || "",
            });
            await this.#persist();
        });
    }

    // ─── Snapshot for Agent Consumption ───

    toBoardView() {
        const lines = [];
        lines.push(`# 工作面板`);
        lines.push(`阶段: ${this.#data.phase} | 更新: ${this.#data.updatedAt}`);
        lines.push("");

        if (this.#data.goal) {
            lines.push(`## 目标`);
            lines.push(this.#data.goal);
            lines.push("");
        }

        lines.push(`## 团队`);
        for (const [name, a] of Object.entries(this.#data.agents)) {
            const taskCount = this.#data.tasks.filter((t) => t.assignee === name).length;
            lines.push(`- ${name} [${a.role}] ${a.status} (${taskCount} tasks)`);
        }
        lines.push("");

        lines.push(`## 任务`);
        if (this.#data.tasks.length === 0) {
            lines.push("（尚无任务）");
        }
        for (const t of this.#data.tasks) {
            const icon = t.status === "done" ? "✅" :
                t.status === "active" ? "🔵" :
                    t.status === "merged" ? "🟢" :
                        t.status === "blocked" ? "🔴" : "⬜";
            const assignee = t.assignee || "未分配";
            const progress = t.status === "active" ? ` ${t.progress}%` : "";
            lines.push(`${icon} #${t.id} ${t.title} → ${assignee}${progress} [${t.status}]`);
        }

        return lines.join("\n");
    }

    toJSON() {
        return this.#data;
    }
}
