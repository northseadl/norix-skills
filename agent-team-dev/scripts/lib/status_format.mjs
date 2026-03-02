export function formatWorktreeSummary(git) {
    if (!git) return "";
    const head = git.headSha ? String(git.headSha).slice(0, 10) : "?";
    const ahead = git.aheadCount ?? "?";
    const dirty = git.dirty ? "1" : "0";
    return `head=${head} ahead=${ahead} dirty=${dirty}`.trim();
}

