// Meeting Room — group chat with @mention notification semantics
//
// Core behavior:
//   - All messages are public in the meeting room (append-only JSONL)
//   - @agent-name in content → Hub detects mention → auto-wakes agent with all new messages
//   - Without @mention → agent must explicitly pull via readNew()
//   - Each agent has a read cursor (seq position)
//   - DM pipes remain for truly private 1:1 communication

import { existsSync } from "node:fs";
import { readFile, appendFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { writeTextAtomic } from "./atomic.mjs";
import { Mutex } from "./mutex.mjs";

// ─── Message Format ───

function makeMessage(from, content, { channel = "meeting", to = null } = {}) {
    const mentions = parseMentions(content);
    return {
        seq: 0,            // set by MeetingRoom.post()
        ts: new Date().toISOString(),
        from,
        to,                // null = meeting (public), string = DM
        channel,           // "meeting" | "pipe"
        mentions,          // ["worker-1", "leader", ...]
        content,
    };
}

/**
 * Parse @mentions from content.
 * Matches: @leader, @worker-1, @inspector, @all
 */
function parseMentions(content) {
    if (!content) return [];
    const matches = content.match(/@([\w-]+)/g);
    if (!matches) return [];
    return [...new Set(matches.map((m) => m.slice(1)))];
}

// ─── Meeting Room ───

export class MeetingRoom {
    #dir;           // .workshop/ directory
    #path;          // .workshop/meeting.jsonl
    #cursors;       // Map<agent, seq> — where each agent last read
    #seq;           // current global sequence number
    #onMention;     // callback: (agentName, messages) => void
    #lock;          // Mutex for write serialization

    constructor(workshopDir) {
        this.#dir = workshopDir;
        this.#path = join(workshopDir, "meeting.jsonl");
        this.#cursors = new Map();
        this.#seq = 0;
        this.#onMention = null;
        this.#lock = new Mutex();
    }

    /** Register callback for @mention events. Hub sets this. */
    set onMention(fn) { this.#onMention = fn; }

    async init() {
        await mkdir(this.#dir, { recursive: true });
        await mkdir(join(this.#dir, "pipes"), { recursive: true });
        if (!existsSync(this.#path)) {
            await writeTextAtomic(this.#path, "");
        }
        // Recover seq from existing messages
        const all = await this.readAll();
        this.#seq = all.length;
    }

    /** Post a message to the meeting room. Returns the message with seq. */
    async post(from, content) {
        return this.#lock.run(async () => {
            const msg = makeMessage(from, content, { channel: "meeting" });
            msg.seq = this.#seq++;
            const line = JSON.stringify(msg) + "\n";
            await appendFile(this.#path, line, "utf-8");

            // Fire @mention callbacks (outside lock would be better but simplicity wins)
            if (msg.mentions.length > 0 && this.#onMention) {
                const expandedMentions = msg.mentions.includes("all")
                    ? ["__all__"]
                    : msg.mentions;
                for (const target of expandedMentions) {
                    if (target === from) continue;
                    const newMsgs = await this.readAll();
                    const cursor = this.#cursors.get(target) || 0;
                    const unread = newMsgs.slice(cursor);
                    this.#cursors.set(target, newMsgs.length);
                    this.#onMention(target, unread, msg);
                }
            }

            return msg;
        });
    }

    /** Post a Hub system event (factual, not a decision). */
    async postEvent(content) {
        return this.post("hub", content);
    }

    /** Read all meeting room messages. */
    async readAll() {
        if (!existsSync(this.#path)) return [];
        const raw = await readFile(this.#path, "utf-8");
        return raw.trim().split("\n").filter(Boolean).map((line) => {
            try { return JSON.parse(line); } catch { return null; }
        }).filter(Boolean);
    }

    /** Read new messages since agent's cursor. Advances cursor. */
    async readNew(agent) {
        const all = await this.readAll();
        const cursor = this.#cursors.get(agent) || 0;
        const newMsgs = all.slice(cursor);
        this.#cursors.set(agent, all.length);
        return newMsgs;
    }

    /** Peek new messages without advancing cursor. */
    async peekNew(agent) {
        const all = await this.readAll();
        const cursor = this.#cursors.get(agent) || 0;
        return all.slice(cursor);
    }

    /** Mark all current messages as read for agent. */
    async markRead(agent) {
        const all = await this.readAll();
        this.#cursors.set(agent, all.length);
    }

    /** Get count of unread messages for agent. */
    async unreadCount(agent) {
        const all = await this.readAll();
        const cursor = this.#cursors.get(agent) || 0;
        return Math.max(0, all.length - cursor);
    }

    /** Get current message count. */
    async messageCount() {
        const all = await this.readAll();
        return all.length;
    }

    // ─── Private Pipes (DM) ───

    #pipePath(a, b) {
        const [x, y] = [a, b].sort();
        return join(this.#dir, "pipes", `${x}__${y}.jsonl`);
    }

    async sendDM(from, to, content) {
        const msg = makeMessage(from, content, { channel: "pipe", to });
        const path = this.#pipePath(from, to);
        await mkdir(dirname(path), { recursive: true });
        await appendFile(path, JSON.stringify(msg) + "\n", "utf-8");
        return msg;
    }

    async readDMs(agentA, agentB) {
        const path = this.#pipePath(agentA, agentB);
        if (!existsSync(path)) return [];
        const raw = await readFile(path, "utf-8");
        return raw.trim().split("\n").filter(Boolean).map((line) => {
            try { return JSON.parse(line); } catch { return null; }
        }).filter(Boolean);
    }

    async readNewDMs(agent, peer) {
        const key = `dm:${agent}:${peer}`;
        const all = await this.readDMs(agent, peer);
        const cursor = this.#cursors.get(key) || 0;
        const newMsgs = all.slice(cursor);
        this.#cursors.set(key, all.length);
        return newMsgs;
    }

    // ─── Message Formatting ───

    /** Format messages for injection into an agent's session prompt. */
    wrapMessages(messages, { label = "会议室" } = {}) {
        if (!messages || messages.length === 0) return null;
        const lines = messages.map((m) => {
            const time = m.ts ? m.ts.split("T")[1]?.slice(0, 8) || "" : "";
            const prefix = m.channel === "pipe" ? "[私信] " : "";
            const mentionTag = m.mentions?.length > 0
                ? ` [→ ${m.mentions.map((n) => "@" + n).join(" ")}]`
                : "";
            return `${prefix}${m.from} (${time})${mentionTag}: ${m.content}`;
        });
        return `[${label} · ${messages.length} 条新消息]\n\n${lines.join("\n")}`;
    }
}
