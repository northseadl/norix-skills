# Agent Task Orchestration

> 基于 [Codex SDK](https://www.npmjs.com/package/@openai/codex-sdk) + [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) 的监督式多 Agent 任务编排技能。
> 采用 Trinity Architecture (Strategist / Lieutenant / Builder) 三层委托架构。

## 能力矩阵

| 阶段 | 能力 | 状态 |
|:---|:---|:---|
| **Analyze** | 读取项目上下文，生成需求分析摘要 | ✅ |
| **Decompose** | 按粒度规则拆解为 Task Spec (T*.md) | ✅ |
| **Dispatch** | DAG 调度 + 并行执行 + 实时 Dashboard | ✅ |
| **Retry** | 限流/超时自动指数退避重试 (≤3次) | ✅ |
| **Checkpoint** | 进程崩溃后从断点恢复 | ✅ |
| **Resume** | `--resume` 跳过已完成任务继续执行 | ✅ |
| **Signal Protocol** | 三级信息分层 (signal/digest/status) | ✅ |
| **Supervise** | 实时 Dashboard (SSE) + Token 追踪 | ✅ |
| **Accept** | 验收 + 结构化报告 (summary.json) | ✅ |

## 快速开始

```bash
# 安装依赖
cd agent-task-orchestration && npm install

# 预览执行计划
node scripts/dispatch.mjs ./tasks/ --dry-run

# 并行调度，全自动模式
node scripts/dispatch.mjs ./tasks/ --parallel --approval-mode full-auto --no-open

# 查看 signal (Strategist 首选, ~20 tokens)
cat ./tasks/.dispatch-logs/{runId}/signal

# 查看 digest (~80 tokens)
cat ./tasks/.dispatch-logs/{runId}/digest.txt

# 恢复失败运行
node scripts/dispatch.mjs ./tasks/ --resume --retry-failed
```

详细 Agent 指令见 [SKILL.md](./SKILL.md)。

## 架构 — Trinity (三层委托)

```
Strategist (你/AI Agent)          上下文: ≤100 tokens/轮询
  ├─ 需求分析 → 任务拆解 → 验收决策
  ├─ 通过 signal/digest 监控 (文件通道, 抗崩溃)
  │
  ▼
Lieutenant (dispatch.mjs)         可恢复 Job, 非守护进程
  ├─ DAG 调度 + 并发管理
  ├─ 限流/超时自动重试 (指数退避)
  ├─ 每 5s 写 checkpoint (崩溃可恢复)
  ├─ 生成 signal/digest/status 三级报告
  │
  ▼
Builder(s) (Codex/Claude Agent)   独立 Session, 互不通信
  ├─ 执行原子任务 + 代码交付
  └─ 通过 DAG 依赖 + 文件 Artifact 协调
```

### 模块结构

```
agent-task-orchestration/
├── SKILL.md                     Strategist 五阶段工作流指令
├── README.md                    人类文档 (本文件)
├── package.json                 Node.js 依赖
├── scripts/
│   ├── dispatch.mjs             CLI 入口 (瘦, ~310 行)
│   ├── lib/
│   │   ├── store.mjs            StateStore + Checkpoint 持久化
│   │   ├── dag.mjs              DAG 拓扑排序 + 依赖解析
│   │   ├── engines.mjs          Codex/Claude SDK 适配器 + 重试
│   │   ├── retry.mjs            指数退避 + jitter 重试策略
│   │   ├── server.mjs           HTTP + SSE 服务 (分层 API)
│   │   ├── reporter.mjs         signal/digest/status 报告生成
│   │   └── logger.mjs           时间戳日志
│   └── dashboard.html           实时监控面板
├── references/
│   ├── trinity-protocol.md      三层委托协议完整规格
│   ├── task-decomposition.md    任务拆解方法论
│   ├── codex-patterns.md        Codex CLI/SDK 行为模式
│   └── quality-gate.md          质量门禁模板
└── examples/
    └── feature-task-spec.md     Task Spec 示例
```

## Signal 协议 — 信息分层

| 文件 | 消耗 | 读者 | 何时读 |
|:---|:---|:---|:---|
| `signal` | ~20 tokens | Strategist | 每次轮询 |
| `digest.txt` | ~80 tokens | Strategist | signal 非 RUNNING 时 |
| `status.txt` | ~500 tokens | Debug | 需详细信息时 |
| `summary.json` | ~2K tokens | Strategist | 批次完成后 |

**Signal 格式**:
```
RUNNING 3/5 57%                       # 正常
ATTENTION T2 failed:rate_limit        # 需关注
COMPLETED 5/5 100% elapsed=12m       # 完成
FATAL all_failed check:digest.txt    # 致命
```

## HTTP API (分层)

| 端点 | 消耗 | 适用 |
|:---|:---|:---|
| `GET /api/signal` | ~20 tokens | Strategist |
| `GET /api/digest` | ~80 tokens | Strategist |
| `GET /api/status` | ~500 tokens | Lieutenant |
| `GET /api/task/:id` | ~200 tokens | Lieutenant |
| `GET /api/state` | unlimited | Dashboard |
| `GET /api/events` | SSE stream | Dashboard |

## CLI 参考

```
用法: node dispatch.mjs <task-dir> [选项]

执行:
  --dry-run               预览执行计划
  --parallel              并行执行无依赖任务
  --approval-mode MODE    suggest|auto-edit|full-auto (默认: suggest)
  --engine ENGINE         默认引擎: codex|claude (默认: codex)
  --concurrency N         最大并行数 (默认: 4)
  --cwd DIR               Agent 工作目录
  --port PORT             Dashboard 端口 (默认: 随机)
  --no-open               不自动打开浏览器

恢复:
  --resume [RUN-ID]       从 checkpoint 恢复 (默认: 最近)
  --retry-failed          恢复时重试所有失败任务
  --retry T2,T5           恢复时只重试指定任务

监督:
  --status [RUN-ID]       查询运行状态

管理:
  --list                  列出历史运行 (标记 [resumable])
  --clean [N]             清理历史
```

## 恢复机制

任务失败时，Lieutenant 自动执行:
1. **识别错误类型**: 限流/超时/网络 → 标记为可重试
2. **指数退避**: 5s → 10s → 20s (+ jitter)
3. **重试上限**: 3 次后标记失败, 写入 checkpoint
4. **恢复**: `--resume --retry-failed` 从 checkpoint 继续

```bash
# 失败后输出会提示:
# Resume:  node dispatch.mjs ./tasks/ --resume --retry-failed
#   or:    node dispatch.mjs ./tasks/ --resume --retry T2,T5
```

## 设计决策

| 决策 | 理由 |
|:---|:---|
| 三层委托 (Trinity) | 上下文隔离: 每层只消费自己决策所需的信息密度 |
| 可恢复 Job (非守护进程) | 开发机场景天然临时, 守护进程增加运维负担 |
| Signal 文件 (非 API) 为 Strategist 主通道 | 进程崩溃后文件还在, API 没了 |
| 指数退避重试 | 限流是最频繁的失败场景, 不值得人工介入 |
| DAG + Artifact 协调 (非 Chat) | O(n) 复杂度, SDK 不支持 mid-session 注入 |
| Checkpoint 原子写入 | 先写 .tmp 再 rename, 防止崩溃导致数据损坏 |
| SSE (非 WebSocket) | 单向事件流够用, 实现更简单 |
