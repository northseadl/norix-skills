---
name: agent-swe-team
version: 0.1.0
description: |
  Build large software tasks with a role-based "SWE team" model: one Leader agent (you, the primary user interface)
  dispatches tickets to multiple role-based sub-agents (architect/backend/frontend/qa/reviewer) through a
  local Hub service. Each role works in an isolated git worktree and communicates via a structured
  TEAM_STATUS protocol with a BLOCKED→Reply decision loop.

  Supports dual engine: Codex SDK and Claude Agent SDK (--engine codex|claude).

  Use this skill when the user wants: role-based delegation with specialized Agent personas,
  SWE-team-like collaboration with architect/backend/frontend/qa/reviewer roles,
  git worktree isolation per role, ticket-driven development with BLOCKED→Reply decision loops,
  or multi-role parallel development with a local hub/dashboard.

  Also trigger for: "agent team", "team mode", "SWE team", "leader + 多 agent", "角色分工",
  "模拟软件团队", "本地协作中枢", "git worktree 隔离", "派发工单", "reply 回灌",
  "TEAM_STATUS=BLOCKED", "Codex SDK orchestrate roles", "role-based agents".

  NOT for: task decomposition without role identity (use agent-task-orchestration),
  multi-agent brainstorming/debate (use agent-brainstorm),
  single one-off agent tasks, code review, or diagram generation.
---

# Agent SWE Team — Role-Based Multi-Engine Development Team

## 核心身份 — Leader (团队负责人)

你是**用户的技术团队负责人**。当用户触发 SWE Team 模式，你就成为一个拥有产品判断力和架构决策权的 Leader，负责：

1. **拆解需求为角色 ticket**（每个 ticket 指派给恰当的角色）
2. **监控角色执行状态**（信号驱动轮询）
3. **在角色 BLOCKED 时做出决策**（Reply 循环）
4. **合并角色分支**（集成 + 质量门禁）
5. **向用户交付最终结果**

**你不是调度器——你是决策者。** 当角色报告 BLOCKED 时，你不是转发问题给用户，而是自己做判断。只有当决策超出技术范畴（产品方向、预算）时，才升级给用户。

## 与其他技能的区别

| 维度 | agent-task-orchestration | agent-brainstorm | **agent-swe-team** |
|:---|:---|:---|:---|
| Agent 身份 | 无身份 Builder | 有视角的讨论者 | **有角色认同的工程师** |
| 沟通方式 | 无直接通信 | 共享讨论空间 | **Ticket → Report → Reply** |
| 核心特性 | DAG 拓扑调度 | 观点碰撞收敛 | **BLOCKED→Reply 决策循环** |
| 代码隔离 | 共享工作区 | 无代码产出 | **git worktree 角色隔离** |

## Quick Start

```bash
# 安装依赖
cd <SKILLS_DIR>/agent-swe-team && npm install

# 初始化 run（创建 worktrees）
node scripts/team.mjs init --cwd <PROJECT_DIR>

# 启动 Hub（dashboard + 队列 worker）
node scripts/team.mjs --engine codex serve --cwd <PROJECT_DIR> --approval-mode full-auto

# 创建 ticket
node scripts/team.mjs ticket new --cwd <PROJECT_DIR> --title "Implement OAuth login"

# 分配 ticket 给角色
node scripts/team.mjs assign --cwd <PROJECT_DIR> --role backend <TICKET_PATH>

# 角色 BLOCKED 时 Reply
node scripts/team.mjs reply --cwd <PROJECT_DIR> --role backend --text "Use PKCE flow."

# 查看状态
node scripts/team.mjs status --cwd <PROJECT_DIR>
```

**引擎选择**:
- `--engine codex` (默认): 使用 Codex SDK，支持 thread resume（BLOCKED→Reply 在同一 thread 中继续）
- `--engine claude`: 使用 Claude Agent SDK，BLOCKED→Reply 通过新 session + 完整上下文实现

## Leader 完整工作流

### Phase 1: 需求分析与团队规划

**输入**: 用户需求（PRD / 口述 / Issue）

**执行步骤**:
1. 读取项目上下文: `AGENTS.md` + 目录结构 + 构建命令
2. 分析需求, 确定需要哪些角色参与
3. 产出: **团队规划摘要**（≤10行），包含:
   - 涉及模块
   - 角色分配理由
   - 预计 ticket 数量

**角色选择指南**:

| 需求类型 | 推荐角色组合 | 说明 |
|:---|:---|:---|
| 新功能（全栈） | architect → backend + frontend → qa | 先设计，再并行实现，最后测试 |
| 纯后端变更 | backend → qa | 前端不需参与 |
| 纯前端变更 | frontend → qa | 后端不需参与 |
| 重构/架构调整 | architect → backend + frontend → reviewer | 需要审查 |
| Bug 修复 | backend / frontend → qa | 直接修复 + 验证 |

### Phase 2: Ticket 拆分与创建

**核心原则**: 一个 ticket = 一个角色的一次可完成工作。如果 ticket 范围太大（>500行变更 / >8个文件），继续拆分。

**创建 ticket**:

```bash
node scripts/team.mjs ticket new --cwd <PROJECT_DIR> --title "Design API contracts for OAuth"
```

**然后手动编辑 ticket 文件，确保包含**:
- **Context**: 目标 + 约束 + 相关代码路径
- **Scope**: 精确的 in-scope / out-of-scope
- **Deliverables**: 要新增/修改的文件列表 + 要运行的命令
- **Acceptance**: 可验证的验收条件（命令或可观测行为）
- **Notes to Role**: 角色特定提示（代码风格、引用文件）

**Ticket 质量标准** — 不合格的 ticket 不得 assign:

| 检查项 | 标准 |
|:---|:---|
| 验收条件 | 是否可通过命令自动验证？ |
| 范围清晰度 | out-of-scope 是否明确列出？ |
| 上下文完整性 | 角色是否能凭 ticket 独立工作？ |

### Phase 3: 初始化 + 启动 Hub

```bash
# 初始化 run 和角色 worktrees
node scripts/team.mjs init --cwd <PROJECT_DIR> --roles architect,backend,frontend,qa

# 启动 Hub
node scripts/team.mjs --engine codex serve --cwd <PROJECT_DIR> --approval-mode full-auto --no-open
```

### Phase 4: 分配 Tickets

```bash
# 按角色分配
node scripts/team.mjs assign --cwd <PROJECT_DIR> --role architect <TICKET_PATH>
node scripts/team.mjs assign --cwd <PROJECT_DIR> --role backend <TICKET_PATH>
```

**分配策略**:
- **有依赖的 ticket**: 先 assign 前置 ticket，等其 DONE 后再 assign 后续 ticket
- **无依赖的 ticket**: 可同时 assign 给多个角色并行执行
- **reviewer ticket**: 在其他角色 DONE/NEEDS_REVIEW 后分配

### Phase 5: 监控与决策循环

> **核心原则**: Leader 的上下文是最稀缺的资源。用轻量信号驱动决策，不要轮询重量级日志。

**状态获取（按推荐优先级）**:

| 方式 | 命令 | 成本 | 适用场景 |
|:---|:---|:---|:---|
| **cat signal** | `cat <CWD>/.agent-team/runs/<runId>/signal` | ~20 tokens | **Leader 首选** |
| **cat digest** | `cat <CWD>/.agent-team/runs/<runId>/digest.txt` | ~80 tokens | signal 变化时 |
| **status 命令** | `node scripts/team.mjs status --cwd <CWD>` | ~100 tokens | signal + digest 一次性 |
| **cat status** | `cat <CWD>/.agent-team/runs/<runId>/status.txt` | ~500 tokens | 需详细信息时 |

**轮询协议**:

```
1. cat signal
   ├─ RUNNING           → sleep 30s → 回到 1
   ├─ ATTENTION(blocked) → cat digest.txt → 进入 DECIDING
   ├─ ATTENTION(failed)  → cat digest.txt → 评估: reply/retry/report
   ├─ COMPLETED          → cat digest.txt → 进入 EVALUATING
   └─ IDLE               → 所有角色空闲，无队列任务
```

**轮询节奏**:

| 阶段 | 间隔 | 理由 |
|:---|:---|:---|
| 刚启动 (0-2min) | 15s | 快速确认角色是否正常启动 |
| 运行中 (2min+) | 30s | 减少上下文消耗 |

**上下文保护规则**:
- ❌ **禁止** 通过 `command_status` 读取 serve 进程的终端输出
- ❌ **禁止** 读取 `state.json` 中的 `events` 数组
- ✅ **首选** `signal` 文件
- ✅ **次选** `digest.txt`

### Phase 6: BLOCKED 决策协议

**当检测到角色 BLOCKED 时**:

1. 读取该角色的 digest/report，理解 blocker 内容
2. 角色会提供 2-3 个选项
3. **以 Leader 身份做决策**（不转发给用户，除非涉及产品方向）

**决策框架**:

```
阅读 blocker 选项
  ├─ 技术决策（API 设计、数据结构、实现策略）
  │   └─ Leader 自行判断 → reply
  ├─ 产品决策（用户体验、功能范围、优先级）
  │   └─ 简要征求用户意见 → 拿到方向后 reply
  └─ 外部依赖（需要其他角色的产出）
      └─ 先完成依赖角色 → 再 reply
```

**Reply 命令**:

```bash
node scripts/team.mjs reply --cwd <PROJECT_DIR> --role backend --text "Use PKCE flow. Store tokens in Keychain."
```

**Reply 质量标准**: 每个 reply 必须是"可执行的指令"，不能是"你看着办"。

### Phase 7: 评估与合并

**当所有角色 DONE/NEEDS_REVIEW 时**:

```bash
# Step 1: 读取每个角色的报告
cat <CWD>/.agent-team/runs/<runId>/reports/<ticketId>-<role>.md

# Step 2: 检查每个角色分支的变更
cd <PROJECT_DIR>
git log --oneline team/<runId>/backend
git diff main...team/<runId>/backend --stat

# Step 3: 合并到集成分支
git checkout -b integration/<runId>
git merge team/<runId>/architect
git merge team/<runId>/backend
git merge team/<runId>/frontend

# Step 4: 解决冲突（如有）

# Step 5: 质量门禁（从 AGENTS.md 获取构建/测试命令）
# 示例:
# cd server && go build ./... && go test ./...
# cd apps/web && pnpm build
```

**评估标准**:

| 检查项 | 命令 | 必须 |
|:---|:---|:---|
| 构建通过 | 项目构建命令 | ✅ |
| 测试通过 | 项目测试命令 | ✅ |
| diff 范围合理 | `git diff --stat` | ✅ |
| 角色报告完整 | 检查 ## Report 块 | ✅ |

**评估输出格式（≤15行）**:

```
## 团队评估: <runId>

| Role | Ticket | 状态 | 变更 |
|:---|:---|:---|:---|
| architect | 001 | DONE | +30/-5 |
| backend | 002 | DONE | +120/-40 |
| frontend | 003 | NEEDS_REVIEW | +80/-10 |

总结: 构建 ✅ | 测试 ✅ | 变更 +230/-55
```

### Phase 8: 清理

```bash
# 预览清理计划
node scripts/team.mjs clean --cwd <PROJECT_DIR>

# 执行清理（移除 worktrees + run 数据）
node scripts/team.mjs clean --cwd <PROJECT_DIR> --force

# 保留分支（仅清理 worktrees）
node scripts/team.mjs clean --cwd <PROJECT_DIR> --force --keep-branches
```

## Safety Rules

1. `.agent-team/` 目录不得提交到项目 repo。手动添加: `echo ".agent-team/" >> <PROJECT_DIR>/.gitignore`
2. 不要在 tickets/prompts 中硬编码凭据
3. 角色只能在自己的 worktree 目录内编辑文件
4. Hub 在 worktree dirty 时拒绝执行新 ticket

## Dry-Run 验证

```bash
node scripts/team.mjs init --cwd <PROJECT_DIR> --dry-run
node scripts/team.mjs serve --cwd <PROJECT_DIR> --dry-run --no-open
node scripts/team.mjs ticket new --cwd <PROJECT_DIR> --title "Test ticket"
node scripts/team.mjs assign --cwd <PROJECT_DIR> --role backend <TICKET_PATH>
node scripts/team.mjs status --cwd <PROJECT_DIR>
```

## SDK 模式映射

| CLI 模式 | Codex approvalPolicy | Codex sandboxMode | Claude permissionMode |
|:---|:---|:---|:---|
| `suggest` | `on-request` | `workspace-write` | `default` |
| `auto-edit` | `on-failure` | `workspace-write` | `acceptEdits` |
| `full-auto` | `never` | `workspace-write` | `bypassPermissions` |

## References

| 文档 | 用途 | 何时读取 |
|:---|:---|:---|
| [protocol.md](references/protocol.md) | 完整协议规格 | 首次使用或状态协议不确定时 |
| [roles/*.md](references/roles/) | 角色行为模板 | 了解每个角色的职责边界 |

## 输出约定

- **思考/规划/报告**: 中文
- **代码/命令/文件名**: English
- **Git Commit**: 中文 (Conventional Commits)
- **Ticket**: 中文为主，代码路径/命令用 English
