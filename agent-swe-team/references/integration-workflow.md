# Integration Workflow

> Progressive merge, integration branch, worktree management, and conflict resolution.

## Integration Branch Model

### Overview

```
                    main (production)
                      │
                      ├─── integration/<runId>  ← shared truth for this run
                      │       │
                      │       ├── merge ← team/<runId>/frontend-1  (after ticket DONE)
                      │       ├── merge ← team/<runId>/frontend-2  (after ticket DONE)
                      │       └── merge ← team/<runId>/backend     (after ticket DONE)
                      │
                      └── (final merge when team COMPLETED)
```

**Key difference from v1**: Worktrees are NOT static snapshots of `baseSha`.
They are **living branches that track the integration branch**.

### Initialization

```bash
node scripts/team.mjs init --cwd <PROJECT_DIR> \
  --roles architect,frontend:3,qa,reviewer
```

Init creates:
1. `integration/<runId>` branch from current HEAD
2. Role branches: `team/<runId>/frontend-1`, etc. from `integration/<runId>`
3. Role worktrees: `.agent-team/worktrees/<runId>/frontend-1/`, etc.

### Progressive Merge Flow

When a role completes a ticket (`TEAM_STATUS=DONE`):

```
Step 1: Hub validates role changes
  - git diff --stat team/<runId>/frontend-1...integration/<runId>
  - Check for conflicts (dry-run merge)

Step 2: Auto-merge (fast-forward or merge commit)
  git checkout integration/<runId>
  git merge --no-ff team/<runId>/frontend-1 -m "merge: 007 frontend-1"

Step 3: Propagate to downstream worktrees
  For each other active role worktree:
    git -C <worktree> fetch origin
    git -C <worktree> rebase integration/<runId>

Step 4: Resolve dependency waiters
  For each ticket in waiting queue:
    if all depends_on tickets are DONE:
      move to ready queue → assign to available role
```

### Conflict Handling

| Scenario | Strategy |
|:---|:---|
| Clean merge | Auto-merge + auto-rebase downstream |
| Textual conflict | Signal `MERGE_CONFLICT` → Leader resolves |
| Rebase conflict | Reset worktree to integration HEAD → re-apply local changes |
| Divergent architectures | Signal → Leader decides which approach wins |

### Worktree Lifecycle

```
CREATE:  init → for each role
UPDATE:  after each merge to integration → rebase
SUSPEND: role IDLE for >10min → worktree remains, no resources
CLEAN:   team.mjs clean → remove all worktrees + branches
```

## Sandbox Compatibility

Git worktree mode stores metadata in `.git/worktrees/<name>/`.
SDK sandboxes may restrict writes outside the worktree directory.

### Codex SDK

```javascript
// Applied when creating Codex sessions for role worktrees
{
  sandboxMode: "workspace-write",
  workingDirectory: worktreePath  // MUST be the worktree, not repo root
}
```

Ensure `.git/worktrees/<role>/` is within the writable scope.
If sandbox blocks `.git` writes, use `--sandbox-mode workspace-write`
with the entire repo root as workspace.

### Claude SDK

```javascript
{
  cwd: worktreePath,
  permissionMode: "bypassPermissions"  // full-auto mode
}
```

Claude Code agent uses the worktree as its working directory.
No known issues with `.git/worktrees/` access.

## Commit Conventions

Roles MUST use these commit prefixes:

| Prefix | When |
|:---|:---|
| `feat:` | New feature implementation |
| `fix:` | Bug fix (including review-loop fixes) |
| `refactor:` | Code restructuring without behavior change |
| `test:` | Adding or updating tests |
| `docs:` | Documentation changes |
| `chore:` | Build/tooling changes |

Commits include ticket ID: `feat(007): create Expo app skeleton with router`

## Final Merge to Main

When team reaches COMPLETED state:

```bash
# Leader executes:
git checkout main
git merge integration/<runId> --no-ff -m "feat: RN migration sprint 1"

# Verify:
pnpm build && pnpm test && pnpm lint

# Clean up:
node scripts/team.mjs clean --cwd <PROJECT_DIR> --force
```

The `clean` command:
1. Removes all worktrees
2. Deletes team branches (`team/<runId>/*`)
3. Deletes integration branch (`integration/<runId>`)
4. Archives run data to `.agent-team/archive/<runId>/`
