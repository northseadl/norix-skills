# Trinity 协议 — 三层委托架构参考

## 概述

Trinity Architecture 将编排职责分为三个上下文隔离层，每层只消费自己决策所需的信息密度。

```
Strategist (战略者)     上下文预算: ≤100 tokens/轮询
     │
     │── signal + digest.txt (文件通道)
     ▼
Lieutenant (dispatch.mjs) 上下文预算: ≤20K tokens/批次
     │
     │── SDK Session (Codex/Claude)
     ▼
Builder(s) (构建者)     上下文预算: 无限制 (独立 Agent)
```

## 角色定义

### Strategist (战略者)

**身份**: 你 (Antigravity/Claude/用户代理) — 具备产品思维和架构判断力的决策者。

**职责**:
- 需求分析 → Task Spec 拆解
- 委派 Lieutenant (dispatch.mjs) 执行批次
- 通过 signal/digest 文件低成本监控
- 验收交付物 → 决策下一步

**禁止**:
- ❌ 直接读 state.json 或 events 数组
- ❌ 通过 command_status 读 dispatch 终端输出
- ❌ 轮询间隔 < 30s

### Lieutenant (执行官)

**身份**: dispatch.mjs — 带有自动重试和 checkpoint 恢复能力的编排引擎。

**职责**:
- DAG 调度和并发管理
- 限流/超时自动重试 (指数退避, ≤3次)
- 每 5s 写 checkpoint (进程崩溃可恢复)
- 生成 signal/digest/status 三级报告文件
- 通过 HTTP API 服务 Dashboard

**自动处理 (无需 Strategist 介入)**:
- 限流 429 → 指数退避重试
- 网络超时 → 自动重试
- 单任务失败 → 跳过下游, 记录 checkpoint

**需要上报 Strategist**:
- 重试耗尽 (3/3) → signal: `ATTENTION`
- 全部失败 → signal: `FATAL`
- 批次完成/失败 → signal: `COMPLETED` / `FAILED`

### Builder (构建者)

**身份**: Codex Agent 或 Claude Code — 执行原子任务的专业 Agent。

**职责**:
- 根据 Task Spec 执行代码变更
- 本地验证 (构建/测试)
- 产出交付物

**约束**:
- 不感知其他 Builder 的存在
- 不做架构决策 (只执行)
- 通过 DAG 依赖 + 文件 Artifact 与其他 Builder 间接协调

## Signal 文件协议

### signal (≤1 行, ~20 tokens)

```
RUNNING 3/5 57%                              # 正常运行中
RUNNING 3/5 57% active=2                     # 有 2 个任务正在执行
ATTENTION T2 failed:rate_limit retry:2/3     # 某任务在重试
COMPLETED 5/5 100% elapsed=12m              # 全部完成
FAILED 3/5 ok 2 failed elapsed=15m          # 部分失败
FATAL all_failed check:digest.txt           # 全部失败
```

### digest.txt (≤5 行, ~80 tokens)

```
batch=1 | ✓T1(38s) ✓T2(1m) | 2/2 done
batch=2 | ✓T3(22s) ✗T4(rate_limit,r3) ▶T5(running) | 1/3 done
tokens: in=1.2M out=42K
next: T4 need retry or skip
```

### 信息分层成本

| 文件 | 消耗 | 读者 | 何时读 |
|:---|:---|:---|:---|
| signal | ~20 tokens | Strategist | 每次轮询 (30-60s) |
| digest.txt | ~80 tokens | Strategist | 仅在 signal 非 RUNNING 时 |
| status.txt | ~500 tokens | Lieutenant/Debug | 需要详细信息时 |
| summary.json | ~2K tokens | Strategist | 批次完成后一次性读取 |

## Strategist 轮询行为

```
1. cat signal
   ├─ RUNNING     → sleep 60s → 回到 1
   ├─ COMPLETED   → cat digest.txt → EVALUATING
   ├─ ATTENTION   → cat digest.txt → 评估是否需要介入
   ├─ FAILED      → cat digest.txt → 决策: 重试/跳过/上报
   └─ FATAL       → cat digest.txt → 报告用户
```

## 恢复操作

```bash
# 恢复最近一次运行，重试所有失败任务
node dispatch.mjs ./tasks/ --resume --retry-failed

# 恢复指定运行，只重试特定任务
node dispatch.mjs ./tasks/ --resume 20260228-231500 --retry T2,T5

# 查看历史运行 (标记 [resumable] 表示可恢复)
node dispatch.mjs ./tasks/ --list
```

## 与之前协议的变化

| 方面 | v1 | v2 |
|:---|:---|:---|
| 状态获取 | status.txt (~500 tok) | signal (~20 tok) + digest (~80 tok) |
| 错误处理 | 单次失败即终止 | 指数退避重试 ≤3次 |
| 进程崩溃 | 完全丢失进度 | checkpoint.json 恢复 |
| CLI 恢复 | 不支持 | --resume [RUN-ID] |
| 角色命名 | Orchestrator/Executor | Strategist/Lieutenant/Builder |
