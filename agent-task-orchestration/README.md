# Codex Task Orchestration Skill

> 🚧 **开发中 (WIP)** — API 和行为可能随时变更

基于 [Codex SDK](https://www.npmjs.com/package/@openai/codex-sdk) 的监督式多 Agent 任务编排技能 — 将需求拆解为原子任务，并行派发给 Codex Agent 执行，实时 Dashboard 监控全过程。

## 能力矩阵

| 阶段 | 能力 | 状态 |
|:---|:---|:---|
| **Analyze** | 读取项目上下文，生成需求分析摘要 | ✅ |
| **Decompose** | 按粒度规则拆解为 Task Spec (T*.md) | ✅ |
| **Dispatch** | 本地编排服务 + DAG 调度 + 并行执行 | ✅ |
| **Supervise** | 实时 Dashboard (SSE) + Token 追踪 | ✅ |
| **Supervision Loop** | Agent 轻量轮询 (`status.txt` / `--status`) | ✅ |
| **Accept** | 验收 + 结构化报告 (summary.json) | ✅ |
| 质量门禁集成 | 自动构建/Lint/测试检查 | 🚧 规划中 |
| CI/CD 集成 | GitHub Actions / GitLab CI 触发 | 🚧 规划中 |

## 快速开始

```bash
# 安装依赖
cd agent-task-orchestration && npm install

# 预览执行计划（不实际调度）
node scripts/dispatch.mjs ./tasks/ --dry-run

# 并行调度，全自动模式（Agent 推荐: --no-open）
node scripts/dispatch.mjs ./tasks/ --parallel --concurrency 5 --approval-mode full-auto --no-open

# 轻量查询运行状态（≤15 行输出）
node scripts/dispatch.mjs ./tasks/ --status

# 或直接 cat（零开销，Agent 首选）
cat ./tasks/.dispatch-logs/{runId}/status.txt
```

详细 Agent 指令见 [SKILL.md](./SKILL.md)。

## 架构

```
agent-task-orchestration/
├── SKILL.md                Agent 入口 — 五阶段工作流详细指令
├── README.md               人类文档 (本文件)
├── package.json            Node.js 依赖 (@openai/codex-sdk)
├── scripts/
│   ├── dispatch.mjs        核心引擎 — CLI 解析 / DAG 调度 / SDK 桥接 / HTTP 服务
│   └── dashboard.html      实时监控面板 — SSE 事件流 / DAG 可视化 / Token 追踪
├── references/
│   ├── task-decomposition.md   任务拆解方法论
│   ├── codex-patterns.md       Codex CLI/SDK 行为模式
│   └── quality-gate.md         质量门禁模板
└── examples/
    └── feature-task-spec.md    Task Spec 示例
```

### 执行流程

```
Task Dir (T*.md) → loadTasks → topologicalBatches (DAG)
                                    ↓
                              startServer (HTTP + SSE)
                                    ↓
                   ┌─── runParallel / runSequential ───┐
                   │  dispatchTask → Codex SDK Thread  │
                   │  events → SSE → Dashboard         │
                   └───────────────────────────────────┘
                                    ↓
                             writeSummary → summary.json
                             keepAlive → Ctrl+C graceful shutdown
```

### Dashboard 能力

- **实时 DAG 依赖图** — SVG 渲染，状态着色 (pending/running/success/failed) + 动画边
- **Agent 事件流** — 命令执行、文件变更、推理过程实时推送
- **Token 用量追踪** — input / cached / output 分项统计
- **任务进度条** — 整体完成率 + 单任务耗时
- **运行隔离** — 每次执行独立 `{runId}/` 目录，`--list` / `--clean` 管理

### Codex SDK 模式映射

| CLI 模式 | SDK approvalPolicy | 适用场景 |
|:---|:---|:---|
| `suggest` | `on-request` | 功能实现、修改现有代码 |
| `auto-edit` | `on-failure` | 创建新模块、脚手架 |
| `full-auto` | `never` | 新文件创建、格式化、文档、审计 |

## CLI 参考

```
用法: node dispatch.mjs <task-dir> [选项]

选项:
  --dry-run               预览执行计划，不实际调度
  --parallel              并行执行无依赖的任务
  --approval-mode MODE    suggest | auto-edit | full-auto (默认: suggest)
  --concurrency N         最大并行 Codex 会话数 (默认: 4)
  --cwd DIR               Codex Agent 的工作目录
  --port PORT             Dashboard 端口 (默认: 随机)
  --no-open               不自动打开浏览器

监督:
  --status [RUN-ID]       查询运行状态 (默认: 最近一次)

管理:
  --list                  列出所有历史运行记录
  --clean [N]             清理历史记录 (保留最近 N 条)
```

## Agent 监督循环

设计目标：Agent 作为**监督者和触发者**，通过轻量轮询持续追踪进度，避免上下文爆炸。

### 状态获取方式

| 方式 | 命令 | 成本 | 适用 |
|:---|:---|:---|:---|
| `cat status.txt` | `cat {dir}/.dispatch-logs/{runId}/status.txt` | 零 | **Agent 首选** |
| `--status` | `node dispatch.mjs {dir} --status` | ~200ms | 无 runId 时 |
| HTTP | `curl localhost:{port}/api/state` | 低 | CI/Dashboard |

### status.txt 输出格式

```
run=20260226-160428 phase=running elapsed=3m12s
T1 ✅ success  38s    542K/13K
T2 🔄 running  2m10s
T3 ✅ success  22s    380K/9K
T4 🔄 running  1m55s
progress=2/4 (50%)
dashboard=http://localhost:58697
```

### 三级 Fallback

```
--status 查询
  ├─ ① port 文件存在 → HTTP GET /api/state (实时)
  ├─ ② status.txt 存在 → cat (5s 刷新间隔)
  └─ ③ state.json 存在 → 解析重建 (完成后)
```

### 关键规则

- ❌ 禁止通过 `command_status` 读 dispatch 终端输出（上下文爆炸）
- ❌ 禁止读 `state.json` 中的 `events` 数组（每任务数百条）
- ✅ 只读 `status.txt` 或 `--status` 的 compact 输出
- ✅ 完成后可读 `summary.json`（不含事件流）

## Task Spec 格式

任务文件命名: `T{序号}-{描述}.md`

```markdown
## T1 · 任务名称

- **Agent**: codex-1
- **范围**: 涉及的文件/模块
- **输入**: 前置条件
- **交付物**: 输出文件列表
- **验收**:
  - [ ] 可验证的条件
- **依赖**: 无 / ← T{N} 完成
- **预估**: S/M/L

### Instructions
[给 Codex Agent 的详细指令]
```

依赖关系通过内容中的 `← T{N}` 标记自动提取。

## 设计决策

| 决策 | 理由 |
|:---|:---|
| Node.js + ESM | Codex SDK 原生 JS，零语言桥接开销 |
| SSE 而非 WebSocket | 单向事件流足够，实现更简单 |
| DAG 拓扑排序 by batch | 同批次任务全部并行，跨批次严格串行 |
| 运行隔离 (`{runId}/`) | 避免多次运行日志混杂，支持回溯 |
| `status.txt` 实时文件 | Agent 零成本 `cat` 轮询，无需启动 Node.js |
| `port` 文件 + 3 级 fallback | `--status` 自动选择最优数据源 |
| keepAlive 机制 | 任务完成后保持 Dashboard 存活供回看 |
| summary.json 结构化报告 | 便于 CI 集成和后续分析 |

## 已知限制

- **Codex SDK 版本**: 依赖 `@openai/codex-sdk ^0.105.0`，SDK 尚处于早期阶段
- **沙箱模式**: 当前固定 `workspace-write`，未支持 `network-restricted`
- **错误恢复**: 任务失败后仅跳过下游，不支持自动重试
- **Token 限制**: 未实现单任务 token 上限控制

## 路线图

- [x] Agent 监督循环 (`status.txt` + `--status`)
- [ ] 质量门禁自动化 (构建/Lint/测试 检查点)
- [ ] 任务失败自动重试 (可配置次数)
- [ ] CI 集成模式 (`--ci` 禁用 Dashboard + 退出码)
- [ ] 多项目工作区支持 (不同任务指向不同 cwd)
- [ ] Dashboard 历史回放 (从 state.json 重建视图)
