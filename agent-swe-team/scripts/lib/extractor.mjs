// Artifact Extractor — parse structured sections from role reports

/**
 * Extract a markdown section by heading (## Heading).
 * Returns the section body or null if not found.
 */
export function extractSection(text, heading) {
    if (!text) return null;
    const pattern = new RegExp(
        `^##\\s+${escapeRegex(heading)}\\s*$`,
        "mi",
    );
    const match = pattern.exec(text);
    if (!match) return null;

    const startIdx = match.index + match[0].length;
    // Find next ## heading or end of text
    const nextHeading = text.slice(startIdx).search(/^##\s+/m);
    const endIdx = nextHeading === -1 ? text.length : startIdx + nextHeading;
    const body = text.slice(startIdx, endIdx).trim();
    return body || null;
}

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract all structured artifacts from a role's report text.
 * Returns an array of { type, role, ticketId, content } objects.
 */
export function extractArtifacts(reportText, role, ticketId) {
    if (!reportText) return [];
    const artifacts = [];

    const contracts = extractSection(reportText, "Contracts");
    if (contracts) {
        artifacts.push({ type: "contracts", role, ticketId, content: contracts });
    }

    const apiSurface = extractSection(reportText, "API Surface");
    if (apiSurface) {
        artifacts.push({ type: "api_surface", role, ticketId, content: apiSurface });
    }

    const decisions = extractSection(reportText, "Decisions");
    if (decisions) {
        artifacts.push({ type: "decisions", role, ticketId, content: decisions });
    }

    const findings = extractSection(reportText, "Findings");
    if (findings) {
        artifacts.push({ type: "findings", role, ticketId, content: findings });
        const parsed = parseFindingsBySeverity(findings);
        for (const f of parsed) {
            artifacts.push({ type: "finding_item", ...f, role, ticketId });
        }
    }

    const breakingChanges = extractSection(reportText, "Breaking Changes");
    if (breakingChanges) {
        artifacts.push({ type: "breaking_changes", role, ticketId, content: breakingChanges });
    }

    return artifacts;
}

/**
 * Parse findings section into structured items with severity.
 * Expected format:
 *   - 🔴 MUST_FIX: ...
 *   - 🟡 SHOULD_FIX: ...
 *   - 🟢 OPTIONAL: ...
 */
export function parseFindingsBySeverity(findingsText) {
    if (!findingsText) return [];
    const items = [];
    const lines = findingsText.split("\n");

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("-")) continue;

        let severity = null;
        let content = trimmed.slice(1).trim();

        if (/🔴|MUST_FIX/i.test(content)) {
            severity = "MUST_FIX";
            content = content.replace(/🔴\s*/g, "").replace(/MUST_FIX:?\s*/i, "").trim();
        } else if (/🟡|SHOULD_FIX/i.test(content)) {
            severity = "SHOULD_FIX";
            content = content.replace(/🟡\s*/g, "").replace(/SHOULD_FIX:?\s*/i, "").trim();
        } else if (/🟢|OPTIONAL/i.test(content)) {
            severity = "OPTIONAL";
            content = content.replace(/🟢\s*/g, "").replace(/OPTIONAL:?\s*/i, "").trim();
        }
        if (!severity) continue;

        // Try to extract affected_role and file
        const roleMatch = content.match(/affected_role:\s*(\w+)/i);
        const fileMatch = content.match(/file:\s*(\S+)/i);

        items.push({
            severity,
            description: content,
            affectedRole: roleMatch?.[1] || null,
            file: fileMatch?.[1] || null,
        });
    }
    return items;
}

/**
 * Generate a one-line changelog entry from a role completion.
 */
export function generateChangelogEntry(role, ticketId, reportText) {
    // Extract the Notes section for summary
    const notes = extractSection(reportText, "Notes") || extractSection(reportText, "Report");
    const summary = notes
        ? notes.split("\n").filter(Boolean).slice(0, 2).join("; ").slice(0, 120)
        : "(no summary)";
    return { role, ticketId, summary, timestamp: new Date().toISOString() };
}
