// Prompt builder with Team Context Injection (Prompt Enricher)

function truncate(text, maxLen) {
  if (!text || text.length <= maxLen) return text || "";
  return text.slice(0, maxLen) + "\n...(truncated)";
}

export function buildAssignPrompt({
  role,
  roleTemplate,
  ticketMarkdown,
  runMeta,
  worktreePathAbs,
  branch,
  baseSha,
  approvalMode,
  teamContext,
}) {
  const sections = [];

  sections.push(`# Agent SWE Team — Role Assignment

You are the **${role}** role in a software engineering team.

## Hard constraints
- Work ONLY inside this git worktree directory: ${worktreePathAbs}
- Do NOT edit files outside this directory.
- Use git commits on branch: ${branch}
- Base commit for diff/ahead count: ${baseSha}
- Follow the role protocol and output format below.

## Role protocol (read and follow)
${roleTemplate}

## Ticket (source of truth)
${ticketMarkdown}`);

  // ── Team Context Injection ──
  if (teamContext) {
    const contextBlocks = [];

    if (teamContext.decisions && teamContext.decisions.length > 0) {
      contextBlocks.push(`### Team Decisions
> These decisions were made by the Leader during this run. Follow them.

${teamContext.decisions.map((d) =>
        `- **${d.role}** asked: ${d.question}\n  **Decision**: ${d.answer}`
      ).join("\n")}`);
    }

    if (teamContext.contracts && teamContext.contracts.length > 0) {
      contextBlocks.push(`### Team Contracts (from other roles)
> These interfaces/contracts were produced by other roles. Implement against them.

${teamContext.contracts.map((c) =>
        `#### From ${c.role} (ticket ${c.ticketId})\n${truncate(c.content, 1500)}`
      ).join("\n\n")}`);
    }

    if (teamContext.changelog && teamContext.changelog.length > 0) {
      contextBlocks.push(`### Team Changelog
${typeof teamContext.changelog === "string"
          ? teamContext.changelog.split("\n").slice(-5).join("\n")
          : teamContext.changelog.slice(-5).map((e) =>
            `- **${e.role}** (${e.ticketId}): ${e.summary}`
          ).join("\n")}`);
    }

    if (teamContext.findings && teamContext.findings.length > 0) {
      contextBlocks.push(`### Review Findings (fix these)
> The reviewer found these issues in your previous work. Fix them.

${teamContext.findings.map((f) =>
        `- 🔴 ${f.description}${f.file ? ` (${f.file})` : ""}`
      ).join("\n")}`);
    }

    if (contextBlocks.length > 0) {
      sections.push(`## Team Context (read-only, for awareness)\n\n${contextBlocks.join("\n\n")}`);
    }
  }

  sections.push(`## Output requirement (strict)
- Include a \`## Report\` section with: Ticket, Role, Branch, Worktree, Commits, Tests, Notes, Questions.
- If your work produces interfaces or type definitions, include a \`## Contracts\` section.
- If your work changes API endpoints, include a \`## API Surface\` section.
- If you made key design decisions, include a \`## Decisions\` section.
- End your final message with exactly one line: \`TEAM_STATUS=...\` where ... is one of:
  - DONE
  - BLOCKED
  - NEEDS_REVIEW
  - FAILED

If you are blocked, propose 2-3 concrete options and ask the Leader to choose, then output \`TEAM_STATUS=BLOCKED\`.`);

  return sections.join("\n\n");
}

export function buildReplyPrompt({
  role,
  roleTemplate,
  leaderText,
  ticketMarkdown,
  runMeta,
  worktreePathAbs,
  branch,
  baseSha,
  teamContext,
}) {
  const sections = [];

  sections.push(`# Agent SWE Team — Leader Reply

You are the **${role}** role in a software engineering team.

## Hard constraints
- Work ONLY inside this git worktree directory: ${worktreePathAbs}
- Do NOT edit files outside this directory.
- Use git commits on branch: ${branch}
- Base commit for diff/ahead count: ${baseSha}

## Role protocol (read and follow)
${roleTemplate}

## Ticket (source of truth)
${ticketMarkdown}

## Leader decision / reply
${leaderText}`);

  // Inject team context if available (for awareness during reply)
  if (teamContext?.decisions?.length > 0) {
    sections.push(`## Team Decisions (for awareness)
${teamContext.decisions.slice(-5).map((d) =>
      `- **${d.role}**: ${d.question} → **${d.answer}**`
    ).join("\n")}`);
  }

  sections.push(`## Output requirement (strict)
- Update your \`## Report\` (commits/tests/notes/questions).
- If your work produces interfaces, include a \`## Contracts\` section.
- End your final message with exactly one line: \`TEAM_STATUS=...\` where ... is one of:
  - DONE
  - BLOCKED
  - NEEDS_REVIEW
  - FAILED`);

  return sections.join("\n\n");
}
