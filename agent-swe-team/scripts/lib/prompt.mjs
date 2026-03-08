// Prompt builder with Three-Layer Cognitive Model injection
// Layer 1: Goal (Why) — team goal + progress
// Layer 2: Plan (What) — ticket DAG + dependencies + status
// Layer 3: Environment (Context) — team context + discussions + codemap

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
  goalContext,
  discussionContext,
  knowledgePacks,
}) {
  const sections = [];

  sections.push(`# Agent SWE Team — Role Assignment

You are the **${role}** in a self-governing software engineering team.

## Hard constraints
- Work ONLY inside this git worktree directory: ${worktreePathAbs}
- Do NOT edit files outside this directory.
- Use git commits on branch: ${branch}
- Integration branch to track: integration/${runMeta?.runId || "unknown"}
- Follow the role protocol and output format below.
- You are AUTONOMOUS. If blocked by a dependency, find alternative work first.

## Role protocol (read and follow)
${roleTemplate}`);

  // ── Layer 1: Goal (Why) ──
  if (goalContext?.goal || goalContext?.progress) {
    sections.push(`## Layer 1 — Team Goal (Why you exist)

> ${goalContext.goal || "No goal defined"}

### Progress
${goalContext.progress || "No progress data yet."}`);
  }

  // ── Layer 2: Plan (What) ──
  sections.push(`## Layer 2 — Your Ticket (What to do)
${ticketMarkdown}`);

  if (goalContext?.dagStatus) {
    sections.push(`### Ticket DAG (dependency landscape)
${goalContext.dagStatus}`);
  }

  // ── Layer 3: Environment (Context) ──
  const envBlocks = [];

  if (teamContext?.decisions?.length > 0) {
    envBlocks.push(`### Team Decisions
> Follow these decisions.

${teamContext.decisions.map((d) =>
      `- **${d.role}** asked: ${d.question}\n  **Decision**: ${d.answer}`
    ).join("\n")}`);
  }

  if (teamContext?.contracts?.length > 0) {
    envBlocks.push(`### Team Contracts (from other roles)
> Implement against these interfaces.

${teamContext.contracts.map((c) =>
      `#### From ${c.role} (ticket ${c.ticketId})\n${truncate(c.content, 1500)}`
    ).join("\n\n")}`);
  }

  if (discussionContext) {
    envBlocks.push(`### Active Discussions
> Read and respond to relevant threads. Use \`## Discussion\` section in your report.

${truncate(discussionContext, 1500)}`);
  }

  if (teamContext?.changelog && teamContext.changelog.length > 0) {
    envBlocks.push(`### Recent Changes
${typeof teamContext.changelog === "string"
        ? teamContext.changelog.split("\n").slice(-5).join("\n")
        : teamContext.changelog.slice(-5).map((e) =>
          `- **${e.role}** (${e.ticketId}): ${e.summary}`
        ).join("\n")}`);
  }

  if (teamContext?.findings?.length > 0) {
    envBlocks.push(`### Review Findings (fix these)
> The reviewer found these issues. Fix them.

${teamContext.findings.map((f) =>
      `- 🔴 ${f.description}${f.file ? ` (${f.file})` : ""}`
    ).join("\n")}`);
  }

  if (envBlocks.length > 0) {
    sections.push(`## Layer 3 — Environment (Context)\n\n${envBlocks.join("\n\n")}`);
  }

  // ── Knowledge Packs ──
  if (knowledgePacks && knowledgePacks.length > 0) {
    sections.push(`## Specialist Knowledge
> Authoritative knowledge for your role. Apply these standards.

${knowledgePacks.map((k) => truncate(k, 2000)).join("\n---\n")}`);
  }

  // ── Output Requirements ──
  sections.push(`## Output requirement (strict)
- Include a \`## Report\` section with: Ticket, Role, Branch, Worktree, Commits, Tests, Notes, Questions.
- If your work produces interfaces or type definitions, include a \`## Contracts\` section.
- If your work changes API endpoints, include a \`## API Surface\` section.
- If you made key design decisions, include a \`## Decisions\` section.
- If you want to communicate with other roles, include a \`## Discussion\` section.
- If you find the plan has a defect, include a \`## Plan Revision\` section.
- End your final message with exactly one line: \`TEAM_STATUS=...\` where ... is one of:
  - DONE — work complete, ready for merge
  - BLOCKED — cannot proceed (classify: dependency or decision, provide options)
  - NEEDS_REVIEW — work done but wants review before merge
  - FAILED — unrecoverable error

### If blocked by a missing dependency
Do NOT just stop. First:
1. Identify what you CAN do without the dependency (types, tests, mocks, docs)
2. Do that work and report it
3. Then report BLOCKED with what remains`);

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
  goalContext,
  discussionContext,
}) {
  const sections = [];

  sections.push(`# Agent SWE Team — Leader Reply

You are the **${role}** in a self-governing software engineering team.

## Hard constraints
- Work ONLY inside this git worktree directory: ${worktreePathAbs}
- Do NOT edit files outside this directory.
- Use git commits on branch: ${branch}

## Role protocol (read and follow)
${roleTemplate}

## Ticket (source of truth)
${ticketMarkdown}

## Leader decision / reply
${leaderText}`);

  // Goal awareness for context
  if (goalContext?.goal) {
    sections.push(`## Team Goal
> ${goalContext.goal}

Progress: ${goalContext.progress || "unknown"}`);
  }

  // Inject team context for awareness
  if (teamContext?.decisions?.length > 0) {
    sections.push(`## Team Decisions (for awareness)
${teamContext.decisions.slice(-5).map((d) =>
      `- **${d.role}**: ${d.question} → **${d.answer}**`
    ).join("\n")}`);
  }

  if (discussionContext) {
    sections.push(`## Active Discussions
${truncate(discussionContext, 800)}`);
  }

  sections.push(`## Output requirement (strict)
- Update your \`## Report\` (commits/tests/notes/questions).
- If your work produces interfaces, include a \`## Contracts\` section.
- Use \`## Discussion\` section to respond to team threads.
- End your final message with exactly one line: \`TEAM_STATUS=...\` where ... is one of:
  - DONE
  - BLOCKED
  - NEEDS_REVIEW
  - FAILED`);

  return sections.join("\n\n");
}
