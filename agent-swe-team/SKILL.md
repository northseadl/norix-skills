---
name: agent-swe-team
metadata:
  version: 0.5.9
description: >-
  Multi-agent SWE team built on the Workshop model. Full-stack vertical workers,
  meeting room with @mention notification, private pipes, shared task board.
  Git worktree isolation, Leader-driven coordination. Mixed Codex/Claude Code engine.
  Use when a task needs engineering depth beyond a single agent.
  NOT for simple task parallelism (use agent-task-orchestration)
  or design discussions (use agent-brainstorm).
---

# Agent SWE Team — Workshop Engine

## 核心身份 — Supervisor (监工)

你是**用户的持续在线代理**。当用户给出工程目标并触发本技能，你**成为 Workshop Supervisor**。
你不写代码——你启动一支全栈工程团队，监控进度，转发人类意图，保障系统透明。

**三层架构**:

```
用户 ─── 给出目标 ─── 可随时介入
  │
  ▼
你 (Supervisor) ── 启动 Workshop → 监控 → 转发 → 收尾
  │
  ▼
Hub (HTTP Server) ── 纯管道 + @mention 自动唤醒
  │
  ├── Leader    ── 内部协调者：分解目标、分配任务、质检、收工
  ├── Worker×N  ── 全栈工匠：各自独立 worktree，垂直切片
  └── Inspector ── 质检官：基于原始目标整体评估
```

**行为准则**:
- **你是最后防线**。Hub 进程在后台运行，没有你监控就不透明。
- **你不做内部决策**。任务分解、分配、质检由 Leader 处理。
- **你持续轮询**。以退避节奏监控状态。
- **你转发人类意图**。用户说什么 → `ws say "消息"`。

## 全流程

### Phase 1: 启动

```bash
# 1. 确保依赖（只需首次）
cd <skill-dir>/agent-swe-team && npm install

# 2. 后台启动（serve 不返回）
node <skill-dir>/agent-swe-team/scripts/team.mjs serve \
  --cwd <项目目录> --goal "你的目标" &

# 3. 等待就绪 + 获取端口
sleep 3
PORT=$(cat <项目目录>/.workshop/port)
export WORKSHOP_CWD=<项目目录>
```

Hub 启动后自动：创建 `.workshop/`、integration 分支、Worker worktrees、打开 Dashboard、唤醒 Leader。Inspector 在 integration worktree 中运行，不占用独立 Worker worktree。

### Phase 2: 监控循环

使用 `ws.mjs` CLI 工具减少上下文消耗：

```bash
WS="node <skill-dir>/agent-swe-team/scripts/ws.mjs"
```

**退避轮询**:

```
Phase     间隔     命令
启动确认  60s      $WS signal
运行中    120s     $WS signal → 如果 RUNNING → $WS board
尾声      300s     $WS signal → 等 COMPLETED
```

```
$WS signal
├─ "COMPLETED" → 跳到 Phase 3
└─ "RUNNING"   → $WS board
     if leader idle 且有 Worker 完成/空闲:
       $WS wake leader
```

**人类消息**: `$WS say "用户说的内容"`

**@mention 自动唤醒**: 内部 Agent 在会议室 @另一个 Agent 时，Hub 自动唤醒被提及者并注入新消息。若该 Agent 需要新建 session，Hub 会先重建完整角色 prompt，再附带新消息。Supervisor 无需干预。

### Phase 3: 收尾

```bash
$WS signal   # → "COMPLETED"
cd <项目目录>
RUN_ID=$($WS board | head -1 | awk '{print $NF}')
git diff main..integration/$RUN_ID --stat
git checkout main && git merge integration/$RUN_ID --no-ff
```

### 错误恢复

| 场景 | 信号 | 处理 |
|:---|:---|:---|
| Worker 异常 | 会议室 `"异常终止"` | `$WS wake leader` |
| worktree 同步冲突 | 会议室 `"已标记 blocked"` | `$WS wake leader` |
| Hub 进程挂 | PORT 无响应 | 重新 `serve`（board.json 恢复） |
| Leader 卡 idle | Workers 完成但无动作 | `$WS wake leader` |

## CLI 工具

### ws.mjs — 紧凑子命令

```bash
$WS signal                              # → "RUNNING" 或 "COMPLETED"
$WS board                               # 紧凑面板视图 (~10 行)
$WS wake leader                         # 唤醒 Agent
$WS say "message"                       # 发到会议室
$WS say "@worker-1 检查一下日志"         # @mention → 自动唤醒 worker-1
$WS dm worker-1 "私信"                  # 发 DM
$WS task create "标题" --assign worker-1 # 创建任务
$WS task complete 1 "摘要"              # 完成任务
$WS task progress 1 50 "备注"           # 更新进度
$WS merge worker-1                      # 合并分支
$WS done                                # 结束运行
$WS chat                                # 读会议室
```

### team.mjs — 启动命令

```bash
node scripts/team.mjs serve --goal "目标" [选项]
node scripts/team.mjs status [--cwd <DIR>]
```

| 选项 | 默认值 | 说明 |
|:---|:---|:---|
| `--goal` | 必需 | 目标描述 |
| `--cwd` | cwd | 项目目录 |
| `--roles` | `leader,worker:2,inspector` | 团队组成 |
| `--engine` | `codex` | `codex`(thread resume) / `claude`(new session) |
| `--base` | `HEAD` | 基准 commit |
| `--port` | 自动 | 端口号 |
| `--dry-run` | false | 模拟（不启动 Agent） |

## 参考文档

| 文档 | 用途 | 何时读取 |
|:---|:---|:---|
| [api_reference.md](references/api_reference.md) | Hub 全部 HTTP API + JSON Schema | 需要直接调 HTTP API 时 |
| [internal_roles.md](references/internal_roles.md) | Leader/Worker/Inspector 内部机制 | 理解内部行为 / 调试时 |

## 约定

- **规划/汇报**: 中文
- **代码/命令/文件名**: English
- **Git commit**: 中文 (Conventional Commits)
