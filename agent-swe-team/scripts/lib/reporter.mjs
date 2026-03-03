import { formatWorktreeSummary } from "./status_format.mjs";

function formatElapsed(ms) {
    if (!ms || ms < 0) return "—";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m < 60) return r ? `${m}m${r}s` : `${m}m`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm ? `${h}h${rm}m` : `${h}h`;
}

function countTickets(state) {
    const tickets = Object.values(state.tickets || {});
    const done = tickets.filter((t) => t.status === "done" || t.status === "needs_review").length;
    const blocked = tickets.filter((t) => t.status === "blocked").length;
    const failed = tickets.filter((t) => t.status === "failed").length;
    const total = tickets.length;
    return { total, done, blocked, failed };
}

export function generateSignal(state) {
    const roles = Object.values(state.roles || {});
    const { total, done, blocked, failed } = countTickets(state);
    const createdAt = state.createdAt ? new Date(state.createdAt).getTime() : Date.now();
    const elapsed = formatElapsed(Date.now() - createdAt);

    const attention = roles.find((r) => r.status === "attention");
    if (attention) {
        const reason = attention.lastError || (attention.git?.dirty ? "dirty_worktree" : "attention");
        return `ATTENTION role=${attention.role} reason=${String(reason).slice(0, 40)} elapsed=${elapsed}`;
    }

    const blockedRole = roles.find((r) => r.status === "blocked");
    if (blockedRole) {
        const tid = blockedRole.current?.ticketId || "?";
        return `ATTENTION role=${blockedRole.role} blocked ticket=${tid} elapsed=${elapsed}`;
    }

    const active = roles.filter((r) => r.status === "running").length;
    if (active > 0) {
        return `RUNNING active=${active}/${roles.length} tickets_done=${done}/${total} failed=${failed} elapsed=${elapsed}`;
    }

    return `IDLE tickets_done=${done}/${total} blocked=${blocked} failed=${failed} elapsed=${elapsed}`;
}

export function generateDigest(state, roleOrder = []) {
    const roles = state.roles || {};
    const order = roleOrder.length > 0 ? roleOrder : Object.keys(roles).sort();
    const lines = [];
    for (const role of order.slice(0, 10)) {
        const r = roles[role];
        if (!r) continue;
        const status = String(r.status || "idle").toUpperCase();
        const tid = r.current?.ticketId ? ` ticket=${r.current.ticketId}` : "";
        const ts = r.current?.teamStatus ? ` status=${r.current.teamStatus}` : "";
        const q = typeof r.queueDepth === "number" ? ` q=${r.queueDepth}` : "";
        lines.push(`${role}: ${status}${tid}${ts}${q}`.trim());
    }
    return lines.join("\n");
}
export function generateStatus(state, meta) {
    const roles = Object.values(state.roles || {});
    const tickets = Object.values(state.tickets || {});
    const { total, done, blocked, failed } = countTickets(state);
    const createdAt = state.createdAt ? new Date(state.createdAt).getTime() : Date.now();
    const elapsed = formatElapsed(Date.now() - createdAt);

    const lines = [];
    lines.push(`run=${state.runId} phase=${state.phase} elapsed=${elapsed}`);
    if (meta) {
        lines.push(`baseRef=${meta.baseRef} baseSha=${meta.baseSha}`);
        lines.push(`worktreeRoot=${meta.worktreeRootRel}`);
    }
    if (state.dashboard?.url) lines.push(`dashboard=${state.dashboard.url}`);
    lines.push(`tickets: total=${total} done=${done} blocked=${blocked} failed=${failed}`);
    lines.push("");

    lines.push("roles:");
    for (const r of roles) {
        const cur = r.current?.ticketId ? ` ticket=${r.current.ticketId}` : "";
        const ts = r.current?.teamStatus ? ` team_status=${r.current.teamStatus}` : "";
        const dirty = r.git?.dirty ? " dirty=1" : "";
        lines.push(`- ${r.role}: ${r.status}${cur}${ts}${dirty}`);
        if (r.git) lines.push(`  git: ${formatWorktreeSummary(r.git)}`);
        if (r.lastError) lines.push(`  error: ${String(r.lastError).slice(0, 160)}`);
    }
    lines.push("");

    if (tickets.length > 0) {
        lines.push("tickets:");
        for (const t of tickets.sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
            const title = t.title ? ` ${t.title}` : "";
            lines.push(`- ${t.id} [${t.role}] ${t.status}${title}`.trim());
            if (t.reportPath) lines.push(`  report: ${t.reportPath}`);
        }
        lines.push("");
    }

    return lines.join("\n");
}

