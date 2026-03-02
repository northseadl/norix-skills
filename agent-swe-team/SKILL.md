---
name: agent-swe-team
version: 0.1.1
description: |
  Build large software tasks with a role-based "SWE team" model: one Leader agent (you, the primary user interface)
  dispatches tickets to multiple role-based sub-agents (architect/backend/frontend/qa/reviewer) through a
  local Hub service. Each role works in an isolated git worktree and communicates via a structured
  TEAM_STATUS protocol with a BLOCKED→Reply decision loop.

  Hub acts as an intelligent broker: it extracts structured artifacts (contracts, API surfaces, decisions)
  from role outputs, populates a shared Team Blackboard, and injects relevant team context into
  downstream roles' prompts — enabling cross-role awareness without direct inter-agent communication.

  Supports dual engine: Codex SDK and Claude Agent SDK (--engine codex|claude).
  Supports declarative workflow engine with auto-trigger phases and review loops.

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

## 协作架构

```
User ─── requirement ──→ Leader (你)
                           ├── 定义 workflow + tickets
                           ▼
    ┌────────────────── Hub (智能中枢) ──────────────────┐
    │  Workflow Engine    Prompt Enricher   Blackboard   │
    │  (phase 自动触发)   (上下文注入)      (共享知识)    │
    │  Review Loop       Artifact Extractor             │
    │  (审查→修复循环)    (制品提取)                      │
    └───────────────────────┬────────────────────────────┘
                ┌───────────┼───────────┐
                ▼           ▼           ▼
          architect      backend     frontend ── qa ── reviewer
          (worktree)    (worktree)   (worktree)
```

**Hub 不是 dumb queue，而是智能信息路由器**:
- 角色完成后，Hub **自动提取** `## Contracts`、`## API Surface`、`## Decisions` 等结构化制品
- 提取的制品写入 **Team Blackboard**（共享知识目录）
- 下游角色启动时，Hub **自动注入** 相关制品到其 prompt 中
- 每次 BLOCKED→Reply 的决策**自动归档**到 Blackboard

## 与其他技能的区别

| 维度 | agent-task-orchestration | agent-brainstorm | **agent-swe-team** |
|:---|:---|:---|:---|
| Agent 身份 | 无身份 Builder | 有视角的讨论者 | **有角色认同的工程师** |
| 上下文传递 | 无（task 独立） | 共享讨论空间 | **Blackboard 自动路由制品** |
| 核心特性 | DAG 拓扑调度 | 观点碰撞收敛 | **BLOCKED→Reply + Review Loop** |
| 代码隔离 | 共享工作区 | 无代码产出 | **git worktree 角色隔离** |
| 迭代能力 | retry 失败 | 多轮讨论 | **Reviewer findings → fix → re-review** |

## Quick Start

```bash
# 安装依赖
cd <SKILLS_DIR>/agent-swe-team && npm install

# 初始化 run（创建 worktrees）
node scripts/team.mjs init --cwd <PROJECT_DIR>

# 创建 workflow（可选，启用自动 phase 触发）
node scripts/team.mjs workflow create --cwd <PROJECT_DIR> --template fullstack

# 启动 Hub（dashboard + 队列 worker）
node scripts/team.mjs --engine codex serve --cwd <PROJECT_DIR> --approval-mode full-auto

# 创建 + 分配 ticket
node scripts/team.mjs ticket new --cwd <PROJECT_DIR> --title "Implement OAuth login"
node scripts/team.mjs assign --cwd <PROJECT_DIR> --role backend <TICKET_PATH>

# 角色 BLOCKED 时 Reply
node scripts/team.mjs reply --cwd <PROJECT_DIR> --role backend --text "Use PKCE flow."

# 查看状态
node scripts/team.mjs status --cwd <PROJECT_DIR>
node scripts/team.mjs workflow status --cwd <PROJECT_DIR>
```

**引擎选择**:
- `--engine codex` (默认): 使用 Codex SDK，支持 thread resume（BLOCKED→Reply 在同一 thread 中继续）
- `--engine claude`: 使用 Claude Agent SDK，BLOCKED→Reply 通过新 session + 完整上下文实现

**Workflow 模板**:
- `fullstack`: design → implement(parallel) → verify → review
- `backend-only`: implement(backend) → verify → review
- `frontend-only`: implement(frontend) → verify
- `hotfix`: fix → verify

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

| 需求类型 | 推荐 workflow 模板 | 说明 |
|:---|:---|:---|
| 新功能（全栈） | `fullstack` | design → implement(parallel) → verify → review |
| 纯后端变更 | `backend-only` | implement → verify → review |
| 纯前端变更 | `frontend-only` | implement → verify |
| 重构/架构调整 | `fullstack` | 含 architect + reviewer |
| Bug 修复 | `hotfix` | fix → verify |

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

### Phase 3: 初始化 + Workflow + 启动 Hub

```bash
# 初始化 run 和角色 worktrees
node scripts/team.mjs init --cwd <PROJECT_DIR> --roles architect,backend,frontend,qa,reviewer

# 创建 workflow（Hub 将根据 phase 依赖自动调度）
node scripts/team.mjs workflow create --cwd <PROJECT_DIR> --template fullstack

# 启动 Hub
node scripts/team.mjs --engine codex serve --cwd <PROJECT_DIR> --approval-mode full-auto --no-open
```

### Phase 4: 分配 Tickets

```bash
# 按角色分配
node scripts/team.mjs assign --cwd <PROJECT_DIR> --role architect <TICKET_PATH>
```

**有 workflow 时的分配策略**:
- Workflow engine 在 architect DONE 后**自动标记 implement phase 为 ready**
- Leader 只需 assign implement phase 的 tickets（backend/frontend）
- 当 implement 全部 DONE 后，Hub 自动标记 verify phase ready
- **Leader 仍需为每个 ready phase 创建并 assign tickets**

**无 workflow 时的分配策略**:
- **有依赖的 ticket**: 先 assign 前置 ticket，等其 DONE 后再 assign 后续 ticket
- **无依赖的 ticket**: 可同时 assign 给多个角色并行执行

### Phase 5: 监控与决策循环

> **核心原则**: Leader 的上下文是最稀缺的资源。用轻量信号驱动决策，不要轮询重量级日志。

**状态获取（按推荐优先级）**:

| 方式 | 命令 | 成本 | 适用场景 |
|:---|:---|:---|:---|
| **cat signal** | `cat <CWD>/.agent-team/runs/<runId>/signal` | ~20 tokens | **Leader 首选** |
| **cat digest** | `cat <CWD>/.agent-team/runs/<runId>/digest.txt` | ~80 tokens | signal 变化时 |
| **team-digest** | `cat <CWD>/.agent-team/runs/<runId>/blackboard/team-digest.md` | ~100 tokens | 了解团队知识状态 |
| **workflow status** | `node scripts/team.mjs workflow status --cwd <CWD>` | ~80 tokens | 查看 phase 进度 |
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

**上下文保护规则**:
- ❌ **禁止** 通过 `command_status` 读取 serve 进程的终端输出
- ❌ **禁止** 读取 `state.json` 中的 `events` 数组
- ✅ **首选** `signal` 文件
- ✅ **次选** `digest.txt` / `team-digest.md`

### Phase 6: BLOCKED 决策协议

**当检测到角色 BLOCKED 时**:

1. 读取该角色的 digest/report，理解 blocker 内容
2. 角色会提供 2-3 个选项
3. **以 Leader 身份做决策**（不转发给用户，除非涉及产品方向）

**决策自动归档**: 每次 reply 的内容会被 Hub 自动写入 Blackboard 的 `decisions.jsonl`，后续角色能看到已有决策。

**Reply 命令**:

```bash
node scripts/team.mjs reply --cwd <PROJECT_DIR> --role backend --text "Use PKCE flow. Store tokens in Keychain."
```

### Phase 7: Blackboard 与跨角色感知

角色完成后，Hub 自动执行：
1. **Artifact Extraction**: 从 report 中提取 `## Contracts`、`## API Surface`、`## Decisions` 段
2. **Blackboard Write**: 制品写入 `blackboard/contracts/`，决策追加到 `decisions.jsonl`
3. **Changelog**: 变更摘要追加到 `changelog.md`
4. **Team Digest**: 重新生成 `team-digest.md`

下游角色启动时，Hub 自动注入：

| 角色 | 注入内容 |
|:---|:---|
| backend | architect 的 contracts + 相关 decisions |
| frontend | architect 的 contracts + backend 的 API surface |
| qa | 所有实现角色的 changelog + contracts |
| reviewer | changelog + contracts + decisions（全量） |

**Token 预算**: 团队上下文注入总量 ≤ 4500 tokens（约占总窗口 5-10%），超出自动截断最旧条目。

### Phase 8: Review Loop (自动审查循环)

当 reviewer 提交包含 `## Findings` 的报告时：

```
Reviewer DONE
  │
  ├─ 全部 🟢 OPTIONAL → workflow 标记完成
  ├─ 存在 🟡 SHOULD_FIX → Log 通知 Leader 决定是否修复
  └─ 存在 🔴 MUST_FIX → Hub 自动创建 fix ticket 给对应角色
       │
       ▼
     角色收到 fix ticket（含 findings 作为上下文）
     角色修复 → DONE → Hub 自动重新 assign reviewer
       │
       ▼
     Reviewer 复查 → 循环直到没有 MUST_FIX（最多 3 轮）
```

### Phase 9: 集成与清理

**当所有角色 DONE 或 workflow COMPLETED 时**:

```bash
# 检查每个角色分支的变更
git diff main...team/<runId>/backend --stat

# 合并到集成分支
git checkout -b integration/<runId>
git merge team/<runId>/architect
git merge team/<runId>/backend
git merge team/<runId>/frontend

# 质量门禁（从 AGENTS.md 获取构建/测试命令）
```

```bash
# 清理
node scripts/team.mjs clean --cwd <PROJECT_DIR> --force
```

## Blackboard 目录结构

```
.agent-team/runs/<runId>/blackboard/
├── contracts/               # Hub 自动提取的角色制品
│   ├── 001-architect-contracts.md
│   └── 002-backend-api_surface.md
├── decisions.jsonl          # BLOCKED→Reply 决策流水日志
├── changelog.md             # 角色完成摘要
└── team-digest.md           # 自动生成的团队状态概览
```

## Safety Rules

1. `.agent-team/` 目录不得提交到项目 repo。手动添加: `echo ".agent-team/" >> <PROJECT_DIR>/.gitignore`
2. 不要在 tickets/prompts 中硬编码凭据
3. 角色只能在自己的 worktree 目录内编辑文件
4. Hub 在 worktree dirty 时拒绝执行新 ticket
5. Review loop 最多 3 轮，超过自动升级给 Leader

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
