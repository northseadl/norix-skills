# 性能评估与优化 (Performance Benchmarking & Optimization)

> Agent 系统的延迟剖析、模型基线测试与极致速度优化策略

## 两层评估体系

```
┌──────────────────────────────────────────────────────────────┐
│              Agent 性能评估金字塔                               │
│                                                              │
│              ┌────────────┐                                  │
│              │  Layer 2   │  Agent 管道延迟剖析               │
│              │  Pipeline  │  每环节 P50/P95/P99              │
│             ┌┴────────────┴┐                                 │
│             │   Layer 1    │  模型性能基线                    │
│             │   Baseline   │  TTFT + TPS + 上下文/缓存影响    │
│             └──────────────┘                                 │
└──────────────────────────────────────────────────────────────┘
```

---

## Layer 1: 模型性能基线

> 在标准环境下测量模型裸性能，建立比较基准

### 1.1 核心指标

| 指标 | 全称 | 定义 | 测量方法 |
|------|------|------|---------|
| **TTFT** | Time to First Token | 从请求发出到收到第一个 token 的时间 | 流式响应首 chunk 时间戳 - 请求发出时间戳 |
| **TPS** | Tokens Per Second | 平均 token 生成速率 | (total_output_tokens - 1) / (last_token_time - first_token_time) |
| **E2E Latency** | End-to-End | 从请求到完整响应 | response_received - request_sent |
| **TPOT** | Time Per Output Token | 每 token 平均生成时间 | 1 / TPS |

### 1.2 基线测试矩阵

```typescript
interface BaselineBenchmark {
  // 测试维度
  dimensions: {
    model: string[];           // 候选模型列表
    contextLength: number[];   // [500, 2000, 8000, 32000, 128000]
    outputLength: number[];    // [50, 200, 500, 1000]
    cacheMode: ('cold' | 'warm' | 'prompt_cache')[];
    concurrency: number[];     // [1, 5, 10, 20]
  };

  // 每组测试重复次数（统计显著性）
  runsPerConfig: number;       // 建议 ≥ 5

  // 测试 prompt 标准化
  standardPrompts: {
    classification: string;    // 意图分类任务 (短输出)
    generation: string;        // 内容生成任务 (长输出)
    reasoning: string;         // 推理任务 (中等输出)
  };
}
```

### 1.3 缓存影响测试

```
冷启动 (Cold):
  首次请求，无任何缓存
  → 测量: TTFT_cold, TPS_cold

热启动 (Warm):
  连接已建立，TCP/TLS 复用
  → 测量: TTFT_warm, TPS_warm
  → 预期: TTFT 降低 30-50%

Prompt Cache (厂商级):
  System Prompt 被厂商缓存
  → 测量: TTFT_cached, TPS_cached, input_cost_cached
  → 预期: TTFT 降低 50-80%, 成本降低 50-90%
  → 适用: OpenAI/Anthropic/DeepSeek 的 prompt caching
```

### 1.4 上下文长度影响

```
测试: 在 context_length = [500, 2000, 8000, 32K, 128K] 下测量

预期趋势:
  TTFT:  随 context 增长线性/亚线性增长
  TPS:   通常不受 input length 影响（受 output length 影响）
  Cost:  随 context 线性增长

关键发现:
  • 找到 TTFT 陡增的拐点（通常在 32K-64K）
  • 评估 Prompt Cache 在大 context 下的收益
  • 为 Context Budget 策略提供数据依据
```

### 1.5 基线测试脚本

```typescript
// benchmark/baseline.ts

interface BenchmarkResult {
  model: string;
  contextLength: number;
  outputLength: number;
  cacheMode: string;
  concurrency: number;

  // 延迟指标 (ms)
  ttft: { p50: number; p95: number; p99: number; mean: number };
  tps: { p50: number; p95: number; p99: number; mean: number };
  e2eLatency: { p50: number; p95: number; p99: number; mean: number };

  // 成本指标
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUSD: number;

  // 元信息
  timestamp: string;
  region: string;
  runs: number;
}

async function runBaseline(config: BaselineBenchmark): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];

  for (const model of config.dimensions.model) {
    for (const ctxLen of config.dimensions.contextLength) {
      for (const outLen of config.dimensions.outputLength) {
        for (const cache of config.dimensions.cacheMode) {
          for (const conc of config.dimensions.concurrency) {
            const measurements: RawMeasurement[] = [];

            for (let i = 0; i < config.runsPerConfig; i++) {
              const m = await measureSingleCall({
                model,
                contextLength: ctxLen,
                maxOutputTokens: outLen,
                cacheMode: cache,
                streaming: true,
              });
              measurements.push(m);
            }

            results.push(aggregateToPercentiles(measurements, {
              model, contextLength: ctxLen, outputLength: outLen,
              cacheMode: cache, concurrency: conc,
            }));
          }
        }
      }
    }
  }

  return results;
}

async function measureSingleCall(params: CallParams): Promise<RawMeasurement> {
  const requestTime = performance.now();
  let firstTokenTime: number | null = null;
  let lastTokenTime: number | null = null;
  let totalTokens = 0;

  const stream = await llm.chatStream({
    model: params.model,
    messages: buildMessages(params.contextLength),
    maxTokens: params.maxOutputTokens,
    temperature: 0,
    stream: true,
  });

  for await (const chunk of stream) {
    if (!firstTokenTime) firstTokenTime = performance.now();
    lastTokenTime = performance.now();
    totalTokens += countTokens(chunk.content);
  }

  return {
    ttft: firstTokenTime! - requestTime,
    totalDuration: lastTokenTime! - requestTime,
    generationDuration: lastTokenTime! - firstTokenTime!,
    outputTokens: totalTokens,
    tps: totalTokens > 1
      ? (totalTokens - 1) / ((lastTokenTime! - firstTokenTime!) / 1000)
      : 0,
    inputTokens: params.contextLength,
  };
}
```

### 1.6 基线报告格式

```
## 模型基线报告: {date}

### TTFT (Time to First Token)

| Model | 500 ctx | 2K ctx | 8K ctx | 32K ctx | Cache ON |
|-------|---------|--------|--------|---------|----------|
| GPT-4o-mini | 180ms | 220ms | 350ms | 680ms | 95ms |
| Claude Haiku | 150ms | 200ms | 310ms | 590ms | 80ms |
| Qwen-Turbo | 120ms | 160ms | 280ms | 520ms | N/A |
| DeepSeek V3 | 200ms | 250ms | 400ms | 750ms | 110ms |

### TPS (Tokens Per Second)

| Model | Short Output | Medium Output | Long Output |
|-------|-------------|--------------|------------|
| GPT-4o-mini | 85 | 82 | 78 |
| Claude Haiku | 95 | 90 | 85 |
| Qwen-Turbo | 110 | 105 | 98 |

### 结论
- 最低 TTFT: {model} @ {value}ms (cached)
- 最高 TPS: {model} @ {value} tok/s
- 推荐生产模型: {model} (综合 TTFT + TPS + 成本)
```

---

## Layer 2: Agent 管道延迟剖析

> 将 Agent 请求拆解到每个环节，测量并优化端到端延迟

### 2.1 管道阶段模型

```
用户请求 ─────────────────────────────────────────── 响应返回
    │                                                    │
    ▼                                                    │
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│网络传输│→│输入安全│→│意图分类│→│技能路由│→│技能执行│→│输出安全│→ │
│      │ │检查   │ │      │ │      │ │      │ │检查   │  │
│ T_net│ │T_guard│ │T_cls │ │T_route│ │T_exec│ │T_out │  │
└──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘  │
                                                         │
E2E = T_net_in + T_guard + T_cls + T_route + T_exec + T_out + T_net_out
```

### 2.2 逐环节基准

| 环节 | 预算 | 优化杠杆 | 测量方法 |
|------|------|---------|---------|
| **T_net** (网络) | ≤ 100ms | CDN/边缘部署 | ping/traceroute |
| **T_guard** (输入安全) | ≤ 5ms | 正则预编译 | 函数计时 |
| **T_cls: 缓存命中** | ≤ 2ms | 缓存预热 | 函数计时 |
| **T_cls: 规则短路** | ≤ 1ms | 规则优化 | 函数计时 |
| **T_cls: LLM 调用** | ≤ 500ms | 模型选择/Prompt Cache | 流式 TTFT |
| **T_route** (路由) | ≤ 1ms | Map.get() | 函数计时 |
| **T_exec: 数据查询** | ≤ 200ms | 索引/连接池 | DB 耗时 |
| **T_exec: LLM 增强** | ≤ 1000ms | 模型/并行 | 流式 TTFT |
| **T_out** (输出安全) | ≤ 3ms | 正则预编译 | 函数计时 |

**总预算: ≤ 2000ms (P95)**

### 2.3 管道 Profiler 实现

```typescript
class PipelineProfiler {
  private spans: Map<string, { start: number; end?: number }> = new Map();

  startSpan(name: string) {
    this.spans.set(name, { start: performance.now() });
  }

  endSpan(name: string) {
    const span = this.spans.get(name);
    if (span) span.end = performance.now();
  }

  getReport(): PipelineReport {
    const stages: StageMetric[] = [];
    let total = 0;

    for (const [name, span] of this.spans) {
      const duration = (span.end ?? performance.now()) - span.start;
      stages.push({ name, durationMs: Math.round(duration) });
      total += duration;
    }

    return {
      totalMs: Math.round(total),
      stages,
      bottleneck: stages.reduce((a, b) => a.durationMs > b.durationMs ? a : b),
      budgetStatus: total <= 2000 ? 'PASS' : 'FAIL',
    };
  }
}

// 使用
async function handleMessageWithProfiling(message: string, ctx: AgentContext) {
  const profiler = new PipelineProfiler();

  profiler.startSpan('input_guard');
  const guardResult = inputGuard.check(message);
  profiler.endSpan('input_guard');

  profiler.startSpan('classify');
  const intent = await classifier.classify(message);
  profiler.endSpan('classify');

  profiler.startSpan('route');
  const handler = router.resolve(intent.intent);
  profiler.endSpan('route');

  profiler.startSpan('execute');
  const response = await handler.execute(intent.params, ctx);
  profiler.endSpan('execute');

  profiler.startSpan('output_guard');
  const sanitized = outputGuard.sanitize(response);
  profiler.endSpan('output_guard');

  // 记录 profiler 结果到日志
  const report = profiler.getReport();
  log.info('pipeline_profile', report);

  return sanitized;
}
```

### 2.4 管道 Profiling 报告

```
## Agent 管道延迟报告

### P95 延迟分布 (N=1000 requests)

| 环节 | P50 | P95 | P99 | 预算 | 状态 |
|------|-----|-----|-----|------|------|
| input_guard | 1ms | 2ms | 3ms | 5ms | ✅ |
| classify (cache hit 35%) | 2ms | 3ms | 5ms | 2ms | ✅ |
| classify (shortcut 15%) | 0ms | 1ms | 1ms | 1ms | ✅ |
| classify (LLM 50%) | 280ms | 450ms | 620ms | 500ms | ✅ |
| route | 0ms | 0ms | 1ms | 1ms | ✅ |
| execute (data_query) | 35ms | 120ms | 280ms | 200ms | ✅ |
| execute (llm_enhance) | 650ms | 1100ms | 1500ms | 1000ms | ⚠ |
| output_guard | 1ms | 2ms | 3ms | 3ms | ✅ |
| **E2E** | **520ms** | **1680ms** | **2410ms** | **2000ms** | ⚠ |

### 瓶颈分析
- 主要瓶颈: execute.llm_enhance (占 65% 延迟)
- 优化建议: 考虑流式返回 / 切换到更快模型 / 预生成缓存
```

---

## 极致速度优化策略

### 策略 1: 分层缓存

```
L0: 正则短路          → 0ms   (Top 10 高频意图)
L1: 精确缓存命中      → 1ms   (近 5 分钟相同输入)
L2: 模糊缓存命中      → 2ms   (编辑距离 < 3 的输入)
L3: Prompt Cache      → 减少 50-80% TTFT
L4: 结果缓存          → FAQ 等不变内容，缓存完整响应
```

### 策略 2: 流式响应

```typescript
// 不等待完整响应，流式逐步返回
async function* streamResponse(message: string): AsyncGenerator<ResponseChunk> {
  // 1. 分类完成后立即返回 skeleton
  yield { type: 'skeleton', intent: intent.intent };

  // 2. 数据查询完成后返回结构化数据
  yield { type: 'data', content: queryResult };

  // 3. LLM 增强部分流式返回
  for await (const chunk of llm.stream()) {
    yield { type: 'text_delta', content: chunk };
  }
}
```

### 策略 3: 预测性预取

```typescript
// 基于意图历史预测下一个意图，提前加载数据
class PredictivePreloader {
  private transitionMatrix: Map<string, Map<string, number>>;

  predictNext(currentIntent: string): string | null {
    const transitions = this.transitionMatrix.get(currentIntent);
    if (!transitions) return null;
    // 返回概率最高的下一个意图
    return [...transitions.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  async preload(predictedIntent: string) {
    // 在后台预加载数据
    const handler = router.resolve(predictedIntent);
    if (handler?.preloadable) {
      await handler.preload();
    }
  }
}
```

### 策略 4: 模型选择金字塔

```
速度优先:
  意图分类: Qwen-Turbo (TTFT ~120ms, TPS ~110)
  参数提取: 同上 (单次调用同时完成)
  LLM增强: Claude Haiku (TPS ~95)
  评估: Claude Sonnet (离线，不影响延迟)

质量优先:
  意图分类: GPT-4o-mini (TTFT ~180ms, 准确率更高)
  LLM增强: GPT-4o (质量最高)
  评估: Claude Sonnet + GPT-4o 交叉

混合模式:
  简单意图: 规则短路 (0ms)
  中等意图: Qwen-Turbo (120ms)
  复杂意图: GPT-4o-mini (180ms)
  → 根据意图复杂度动态选模型
```

### 策略 5: 并行化非阻塞环节

```typescript
// 输入安全检查和缓存查询可以并行
const [guardResult, cacheResult] = await Promise.all([
  inputGuard.check(message),
  cache.lookup(message),
]);

// 如果缓存命中，直接返回（跳过 LLM 调用和安全检查并行完成了）
if (cacheResult) return cacheResult;
if (!guardResult.safe) return blockedResponse;

// LLM 分类和数据预取可以并行
const [intent, preloadedData] = await Promise.all([
  classifier.classify(message),
  predictivePreloader.preloadIfConfident(message),
]);
```

### 策略 6: 连接池与复用

```typescript
// HTTP 连接复用（避免 TCP/TLS 握手开销）
const httpAgent = new Agent({
  keepAlive: true,
  maxSockets: 20,
  keepAliveMsecs: 30000,
});

// 数据库连接池
const dbPool = {
  maxConnections: 25,
  idleTimeoutMs: 30000,
  connectionTimeoutMs: 5000,
};
```

---

## 性能回归测试

### CI 集成

```yaml
# 每次部署前运行性能回归
performance-test:
  steps:
    - name: Run Pipeline Benchmark
      run: npx ts-node benchmark/pipeline.ts --runs 100
      env:
        BENCHMARK_MODE: true

    - name: Compare with Baseline
      run: npx ts-node benchmark/compare.ts \
        --current results/current.json \
        --baseline results/baseline.json \
        --max-regression 10%
      # 任何环节 P95 回退 > 10% → 阻断部署
```

### 性能 SLO

```typescript
interface PerformanceSLO {
  e2e: {
    p50: 500;      // ms
    p95: 2000;     // ms
    p99: 3000;     // ms
  };
  ttft: {
    p50: 200;      // ms
    p95: 500;      // ms
  };
  cacheHitRate: 0.30;     // ≥ 30%
  shortcutHitRate: 0.15;  // ≥ 15%

  // 回归保护
  maxRegressionPercent: 10; // 任何指标回退不超过 10%
}
```
