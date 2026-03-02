export function buildAssignPrompt({
    role,
    roleTemplate,
    ticketMarkdown,
    runMeta,
    worktreePathAbs,
    branch,
    baseSha,
    approvalMode,
}) {
    return `# Agent Team Dev — Role Assignment

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
${ticketMarkdown}

## Output requirement (strict)
- Include a \`## Report\` section with: Ticket, Role, Branch, Worktree, Commits, Tests, Notes, Questions.
- End your final message with exactly one line: \`TEAM_STATUS=...\` where ... is one of:
  - DONE
  - BLOCKED
  - NEEDS_REVIEW
  - FAILED

If you are blocked, propose 2-3 concrete options and ask the Leader to choose, then output \`TEAM_STATUS=BLOCKED\`.
`;
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
}) {
    return `# Agent Team Dev — Leader Reply

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
${leaderText}

## Output requirement (strict)
- Update your \`## Report\` (commits/tests/notes/questions).
- End your final message with exactly one line: \`TEAM_STATUS=...\` where ... is one of:
  - DONE
  - BLOCKED
  - NEEDS_REVIEW
  - FAILED
`;
}

