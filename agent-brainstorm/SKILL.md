---
name: agent-brainstorm
metadata:
  version: 0.0.8
  short-description: Multi-agent brainstorming with async opinion collision
description: 'Multi-agent brainstorming: async opinion collision with expert personas.
  Mixed Codex/Claude Code engine.

  '
---

# Agent 头脑风暴技能 — 异步观点碰撞空间

## 核心概念

你负责编排一场**多 Agent 头脑风暴**。不同于任务编排（每个 Agent 独立执行任务），
头脑风暴的 Agent 通过一个**共享讨论空间**异步交换观点、质疑与建设性辩论，最终收敛到高质量方案。

支持两种 Agent 引擎：
- **Codex SDK** (`openai-codex-sdk`) — OpenAI Codex 代理
- **Claude Agent SDK** (`claude-agent-sdk`) — Anthropic Claude Code 代理

**架构**:

```
你 (Orchestrator)
  │
  ├── 启动 Brainstorm Engine (HTTP Server + Web 面板)
  │     └── 讨论空间 API: 供 Agent 发表/阅读/回应观点
  │
  ├── 派发 N 个 Agent (每个可独立选择 Codex 或 Claude Code 引擎)
  │     └── 每个 Agent 通过 discuss.py CLI 与讨论空间交互
  │
  └── 讨论结束后生成 synthesis.md 综合报告
```

**与 agent-task-orchestration 的区别**:

| 维度 | 任务编排 | 头脑风暴 |
|:---|:---|:---|
| Agent 关系 | 独立执行，互不通信 | 共享空间，互相响应 |
| 成功标准 | 每个任务通过测试 | 讨论收敛到共识 |
| 产出物 | 代码文件 | 方案文档 (synthesis.md) |
| 节奏控制 | DAG 拓扑排序 | 异步自治 + 收敛检测 |
| Agent 引擎 | Codex 专用 | Codex 或 Claude Code |

## Fan-out / Fan-in（观点发散 → 综合收敛）

- **Fan-out**：每个 Agent 独立阅读代码/资料，先产出“立场明确 + 有证据”的首轮观点（opinion）。
- **碰撞**：通过 `challenge/build/respond` 机制让观点互相校正，而不是并列堆叠。
- **Fan-in**：由 Orchestrator 生成 `synthesis.md`，把共识/分歧/决策点收敛成一个可执行结论。

## 前置条件

运行需要 **Python ≥3.10** 和至少一个引擎已认证。

**推荐路径**: `uv run` 自动处理 SDK 依赖（通过 PEP 723 inline metadata），无需手动安装。

若 `uv` 不可用:
```bash
# 安装 uv
curl -LsSf https://astral.sh/uv/install.sh | sh
# 或用 pip 手动安装 SDK
pip install openai-codex-sdk claude-agent-sdk
```

**引擎认证** (至少完成一个):
- **Claude**: 在终端运行 `claude` 完成交互登录，或 `export ANTHROPIC_API_KEY='sk-ant-...'`
- **Codex**: 运行 `codex login`，或 `export OPENAI_API_KEY='sk-...'`

## 工具

```bash
# 使用 uv 自动安装依赖并运行（推荐）
uv run <SKILLS_DIR>/agent-brainstorm/scripts/brainstorm.py <session-file> [options]

# 或直接运行（需先完成 pip install）
python3 <SKILLS_DIR>/agent-brainstorm/scripts/brainstorm.py <session-file> [options]

# 使用 Claude Code 引擎
python3 scripts/brainstorm.py <session-file> --engine claude [options]

# 查看历史
python3 scripts/brainstorm.py --list --cwd <project-dir>

# 查看状态
python3 scripts/brainstorm.py --status --cwd <project-dir>

# 清理
python3 scripts/brainstorm.py --clean --cwd <project-dir>
```

## 工作流

### Phase 1: 理解需求 & 设计讨论

理解用户想讨论什么。关键问题:

1. **议题是什么**？技术选型？架构设计？产品方向？
2. **需要哪些视角**？架构师、安全专家、产品经理？
3. **有什么约束**？技术栈限制、时间限制、预算限制？
4. **代码上下文**？哪些代码/文档与讨论相关？

### Phase 2: 创建 Session 配置

创建 JSON 配置文件（建议放在 `.brainstorm/` 或项目根目录下的临时文件）:

```json
{
  "topic": {
    "title": "NightOwl 事件调度架构选型",
    "context": "我们正在构建一个 24/7 AI 代理系统……",
    "goals": ["选择最适合的事件调度模型"],
    "constraints": ["必须使用嵌入式 SQLite"]
  },
  "agents": [
    {
      "id": "architect",
      "name": "系统架构师",
      "expertise": "系统设计、事件驱动架构",
      "engine": "claude"
    },
    {
      "id": "reliability",
      "name": "可靠性工程师",
      "expertise": "容错设计、重试策略"
    },
    {
      "id": "devil",
      "name": "魔鬼代言人",
      "expertise": "寻找方案漏洞",
      "engine": "codex"
    }
  ],
  "config": {
    "codebase_paths": ["packages/daemon/src/"]
  }
}
```

**引擎选择规则**:
- 每个 agent 可通过 `"engine": "codex"` 或 `"engine": "claude"` 指定引擎
- 未指定则继承 CLI 的 `--engine` 参数（默认 codex）
- 支持混合模式：同一场讨论中不同 agent 使用不同引擎
- **引擎降级**：若指定引擎不可用，自动切换所有受影响 Agent 到可用引擎（而非阻断）

**Agent 数量建议**: 3-5 个。太少缺乏碰撞，太多产生噪声。

**角色设计关键**:
- 每个角色代表一个**独立视角**，避免重叠
- 至少包含一个"挑战者"角色（如 `devil`），专门找漏洞
- 角色的 `expertise` 字段要具体，引导 Agent 的分析方向

常用角色参考: 阅读 [references/agent-protocol.md](references/agent-protocol.md)

### Phase 3: 启动讨论

```bash
uv run <SKILLS_DIR>/agent-brainstorm/scripts/brainstorm.py \
  .brainstorm/session.json \
  --cwd <project-dir> \
  --approval-mode full-auto \
  --timeout 30 \
  --port 8899
```

**参数说明**:

| 参数 | 默认 | 说明 |
|:---|:---|:---|
| `--cwd` | 当前目录 | Agent 的工作目录（项目根目录） |
| `--port` | 随机 | 讨论服务端口 |
| `--timeout` | 30 | 最大讨论时间（分钟） |
| `--engine` | codex | 默认 Agent 引擎，每个 agent 可在 JSON 中通过 `engine` 字段覆盖 |
| `--approval-mode` | full-auto | Agent 执行策略 |
| `--no-open` | false | 不自动打开浏览器面板 |
| `--dry-run` | false | 预览不执行 |

启动后:
1. Engine 开启 HTTP 讨论服务 + Web 面板
2. 生成 `discuss.py` 工具到 `.brainstorm/`
3. 按需加载 SDK（仅加载实际使用的引擎）
4. 并行派发所有 Agent（每个 Agent 使用其指定的引擎）
5. Agent 自主阅读代码、发表观点、回应他人、投票收敛

### Phase 4: 监控讨论

讨论启动后，你可以:

1. **查看 Web 面板**: 浏览器中实时查看讨论进展
2. **查询状态**:
   ```bash
   python3 scripts/brainstorm.py --status --cwd <project-dir>
   ```
3. **等待自然收敛**: 当超过半数 Agent 投票 conclude，讨论自动进入 synthesizing 阶段
4. **超时兜底**: 到达 timeout 后自动结束

### Phase 5: 交付报告

讨论结束后，Engine 自动生成 `.brainstorm/<session-id>/synthesis.md`，包含:

- 各 Agent 的核心观点
- 提出的方案
- 总结投票
- 完整讨论日志

**向用户汇报时**:
1. 阅读 `synthesis.md`
2. 提炼出关键共识和分歧
3. 给出你作为 Orchestrator 的最终建议
4. 如果有未解决的分歧，明确列出供用户决策

## 讨论空间机制

### Agent 如何交互

每个 Agent 通过 `discuss.py` CLI 工具参与讨论:

```bash
python3 .brainstorm/discuss.py <agent_id> <command> [args...]
```

命令:
- `topic` — 查看议题和当前状态
- `posts` — 查看所有已发表观点
- `new` — 只查看新观点
- `post <content>` — 发表意见
- `respond <post_id> <content>` — 回应某个观点
- `propose <content>` — 提出方案
- `agree <post_id>` — 同意
- `challenge <post_id> <reason>` — 质疑
- `build <post_id> <addition>` — 扩展
- `conclude <summary>` — 投票结束
- `status` — 查看收敛状态

### 收敛检测

Discussion Space 自动追踪讨论阶段:

```
exploring  → 所有 Agent 至少发布 1 个 opinion
debating   → 回应数 ≥ Agent 数 且 agree > challenge
converging → 过半 Agent 投 conclude 票
concluded  → 所有 Agent 完成或超时
```

### 异步时间差处理

核心设计: Agent 不需要同步。每个 Agent 按自己的节奏:

1. 花时间阅读代码（可能 2-5 分钟）
2. 发表深度观点
3. 检查他人观点并回应
4. 循环直到满意

先完成的 Agent 的观点自动进入讨论空间，后到的 Agent 能看到所有前序观点。
这种异步模式比同步更好——允许每个 Agent 充分思考。

## 安全阀

| 阀 | 值 | 触发后 |
|:---|:---|:---|
| 全局超时 | `--timeout` (默认 30min) | 强制 concluded |
| SIGINT 保护 | 3 次 Ctrl+C | 讨论中 Ctrl+C 被拦截，3 次强制退出（保存状态） |
| 引擎降级 | 自动 | 一个引擎不可用时自动切换到另一可用引擎 |
| Agent session 上限 | SDK 内部控制 | Agent 自然结束 |
| 最终产出 | synthesis.md | 即使讨论不完美也有记录 |

## 故障诊断

| 症状 | 原因 | 解决 |
|:---|:---|:---|
| `command not found: uv` | uv 未安装 | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| `ModuleNotFoundError` | SDK 未安装且非 uv 路径 | `pip install openai-codex-sdk claude-agent-sdk` |
| `Preflight failed` | CLI 未安装或未认证 | 见"前置条件"完成认证 |
| Agent 长时间 0 posts | 模型不兼容标准工具集 | 确认 Claude Code 使用官方模型（非第三方代理模型） |
| `API Error 400` | Agent 使用了不存在的工具 | 同上，模型兼容性问题 |
| SIGINT 被拦截 | 讨论中 Ctrl+C 保护 | 连按 3 次 Ctrl+C 强制退出 |
| 引擎降级日志 | 指定引擎不可用 | 正常行为，已自动切换 |

## 参考文档

| 文档 | 用途 | 何时读取 |
|:---|:---|:---|
| [agent-protocol.md](references/agent-protocol.md) | Agent 角色设计 + 讨论协议 | 设计 Agent 角色时 |

## 输出约定

- **思考/规划/报告**: 中文
- **代码/命令/文件名**: English
- **Session 配置**: JSON (中英混合)
- **Agent prompt**: 中文为主 (让 Agent 更自然地思考)
