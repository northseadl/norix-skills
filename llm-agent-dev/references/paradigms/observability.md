# 可观测性 (Observability)

> Agent 系统的日志、追踪、监控与成本管理

## 三维可观测性

```
┌──────────────────────────────────────────────────────────────┐
│               Agent 可观测性金三角                             │
│                                                              │
│            ┌───────────┐                                     │
│            │  Tracing  │  端到端请求追踪                      │
│            │  追踪     │  每步延迟 + 工具调用 + LLM 调用      │
│           ┌┴───────────┴┐                                    │
│           │   Metrics   │  指标聚合                           │
│           │   指标      │  准确率/延迟/成本/错误率             │
│          ┌┴─────────────┴┐                                   │
│          │    Logging    │  结构化日志                        │
│          │    日志       │  意图/参数/结果/异常                │
│          └───────────────┘                                   │
└──────────────────────────────────────────────────────────────┘
```

## Tracing — 请求级追踪

### Span 层次

```
[root] agent.handleMessage (total: 1250ms)
  ├── [span] classifier.classify (320ms)
  │   ├── [span] cache.lookup (2ms) → miss
  │   └── [span] llm.chat (315ms)
  │       ├── model: gpt-4o-mini
  │       ├── input_tokens: 450
  │       └── output_tokens: 85
  ├── [span] router.resolve (1ms)
  ├── [span] skill.execute (920ms)
  │   ├── [span] db.query (45ms)
  │   └── [span] llm.chat (870ms)  // LLM 增强
  └── [span] response.build (5ms)
```

### 实现

```typescript
interface TraceSpan {
  traceId: string;          // 整个请求的追踪 ID
  spanId: string;           // 当前 span ID
  parentSpanId: string;     // 父 span ID
  operation: string;         // 操作名
  startTime: number;
  duration: number;
  attributes: {
    'llm.model'?: string;
    'llm.input_tokens'?: number;
    'llm.output_tokens'?: number;
    'llm.cost_usd'?: number;
    'agent.intent'?: string;
    'agent.confidence'?: number;
    'agent.skill_id'?: string;
    'error'?: string;
  };
}
```

## Metrics — 聚合指标

### 核心仪表盘

| 指标 | SLO | 报警阈值 |
|------|-----|---------|
| 意图准确率 | ≥ 95% | < 90% |
| P50 延迟 | ≤ 500ms | > 800ms |
| P95 延迟 | ≤ 2000ms | > 3000ms |
| 错误率 | ≤ 1% | > 3% |
| 自助率 (containment) | ≥ 80% | < 70% |
| 人工升级率 | ≤ 10% | > 20% |
| 日 LLM 成本 | ≤ $20 | > $50 |

### Token 消耗追踪

```typescript
interface TokenUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;     // prompt cache 命中
  costUSD: number;
  timestamp: Date;
}

// 每日汇总
interface DailyTokenReport {
  date: string;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  cacheHitRate: number;
  totalCostUSD: number;
  costByModel: Record<string, number>;
  costByIntent: Record<string, number>;  // 哪个意图最贵
}
```

## Logging — 结构化日志

### 日志 Schema

```typescript
interface AgentLog {
  level: 'info' | 'warn' | 'error';
  timestamp: string;
  traceId: string;
  userId: string;
  sessionId: string;

  // 请求信息
  input: string;
  inputLength: number;

  // 分类结果
  intent: string;
  confidence: number;
  classifierLayer: 'shortcut' | 'cache' | 'llm';

  // 执行结果
  skillId: string;
  responseType: string;
  latencyMs: number;

  // 异常信息
  error?: string;
  guardrailTriggered?: string;
  escalated?: boolean;
}
```

## 生产监控告警

```yaml
# 告警规则示例
alerts:
  - name: accuracy_drop
    condition: intent_accuracy < 0.90 for 5min
    severity: critical
    action: page_oncall

  - name: latency_spike
    condition: p95_latency > 3000ms for 3min
    severity: warning
    action: notify_channel

  - name: cost_spike
    condition: daily_cost > $50
    severity: warning
    action: notify_admin

  - name: error_rate
    condition: error_rate > 5% for 2min
    severity: critical
    action: auto_rollback
```
