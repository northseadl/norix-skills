# 评估闭环与双模型策略 (Eval Loop & Dual-Model Strategy)

> 强模型评估 + 轻量模型执行 + 数据驱动迭代

## 双模型策略

**核心理念**: 用强模型保障质量，用轻量模型控制成本。

```
┌──────────────────────────────────────────────────────────────┐
│                   双模型策略 (Dual-Model)                      │
│                                                              │
│  ┌────────────────┐          ┌────────────────┐              │
│  │  强模型 (Judge) │          │ 轻量模型 (Exec) │              │
│  │  Claude Sonnet  │          │  Claude Haiku   │              │
│  │  GPT-4o         │  评估    │  GPT-4o-mini    │  生产执行    │
│  │  DeepSeek V3    │ ──────▶  │  Qwen-Turbo     │ ──────▶     │
│  │                 │  质量门  │  DeepSeek-Lite  │  真实用户    │
│  └────────────────┘          └────────────────┘              │
│         ↑                            │                       │
│         └────── 生产日志采样 ─────────┘                       │
└──────────────────────────────────────────────────────────────┘
```

### 模型选型矩阵

| 角色 | 推荐模型 | 延迟 | 成本/1M tokens | 使用场景 |
|------|---------|------|---------------|---------|
| **评估 (Judge)** | Claude Sonnet 4 | 2-5s | ~$3 | 离线评估、CI 回归 |
| **评估 (Judge)** | GPT-4o | 2-5s | ~$2.5 | 交叉验证 |
| **评估 (Judge)** | DeepSeek V3 | 1-3s | ~$0.5 | 高频评估降本 |
| **生产 (Exec)** | Claude Haiku | 200-500ms | ~$0.25 | 意图分类 + 轻量生成 |
| **生产 (Exec)** | GPT-4o-mini | 200-500ms | ~$0.15 | 意图分类 + 参数提取 |
| **生产 (Exec)** | Qwen-Turbo | 100-300ms | ~$0.1 | 国内低延迟首选 |

### 选型原则

1. **评估模型**: 选智能天花板最高的，延迟和成本不敏感（离线跑）
2. **执行模型**: 选延迟最低 + 成本最低的，在评估分数达标的前提下选最便宜的
3. **交叉验证**: 评估时用至少 2 个不同厂商的强模型，避免单一模型偏见
4. **降级路径**: 生产模型不可用时，自动切换到备用模型（先降级再降级到规则兜底）

---

## 评估数据集

### EvalCase 格式

```typescript
interface EvalCase {
  id: string;                   // 唯一标识
  input: string;                // 用户输入
  category: string;             // "happy_path" | "edge_case" | "adversarial" | "regression"

  expected: {
    intent: string;             // 期望意图
    params?: Record<string, any>;
    responseType?: string;
  };

  qualityDimensions?: {
    relevance: number;          // 期望最低分 (1-5)
    helpfulness: number;
    safety: number;
  };

  history?: { role: string; content: string }[];
  source: 'manual' | 'production_failure' | 'synthetic';
}
```

### 数据集组织

```
eval/
├── dataset.json               # 主数据集
├── categories/
│   ├── happy_path.json         # 正常路径 (60%)
│   ├── edge_cases.json         # 边界情况 (20%)
│   ├── adversarial.json        # 对抗测试 (10%)
│   └── regression.json         # 回归案例 (10%, 来自生产故障)
└── baselines/
    └── latest.json             # 基线分数快照
```

---

## 三层评估金字塔

```
                  ┌──────┐
                  │Layer3│  端到端多轮对话质量评估
                  │ LLM  │
                 ┌┴──────┴┐
                 │ Layer2 │  LLM-as-Judge 单轮回复评分
                 │  LLM   │
                ┌┴────────┴┐
                │  Layer1  │  确定性断言 (意图 + 参数 + 格式 + 延迟)
                │  Assert  │
                └──────────┘
```

### Layer 1: 确定性断言（0 成本，100% 自动化）

```typescript
function assertLayer1(evalCase: EvalCase, actual: AgentResponse): Layer1Result {
  return {
    intentMatch: actual.meta.intent === evalCase.expected.intent,
    paramsMatch: deepEqual(actual.meta.params, evalCase.expected.params),
    responseTypeMatch: actual.type === evalCase.expected.responseType,
    latencyOk: actual.meta.latencyMs < 2000,
    formatValid: validateSkillResponse(actual),
  };
}
```

### Layer 2: LLM-as-Judge 单轮评分

用强模型对每条回复进行 5 维评分:

```typescript
async function judgeLayer2(
  evalCase: EvalCase, actual: AgentResponse,
  judgeModel: string = 'claude-sonnet-4-20250514',
): Promise<Layer2Result> {
  const prompt = buildJudgePrompt(evalCase, actual);
  const judgment = await llm.chat({
    model: judgeModel,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0,
  });
  return JSON.parse(judgment.content);
}
```

### Layer 3: 端到端多轮对话评估

```typescript
interface ConversationEval {
  scenario: string;
  turns: { user: string; expectedBehavior: string }[];
  overallCriteria: string;
}
```

---

## LLM-as-Judge 评估 Prompt

```
你是一个 AI 助手质量评估专家。请评估以下 Agent 系统的回复质量。

## 用户输入
{{userInput}}

## 助手回复
类型: {{response.type}}
内容: {{response.content}}
操作按钮: {{response.actions}}

## 评估维度（每项 1-5 分）

1. **意图准确性** (intent_accuracy): 是否正确理解用户意图？
2. **参数提取** (param_extraction): 是否正确提取关键信息？
3. **回复相关性** (relevance): 回复是否与问题直接相关？
4. **行动合理性** (action_quality): 操作按钮是否合理有用？
5. **安全性** (safety): 回复是否安全合规？

## 输出格式（仅 JSON）
{
  "intent_accuracy": 5,
  "param_extraction": 4,
  "relevance": 5,
  "action_quality": 4,
  "safety": 5,
  "overall": 4.6,
  "issues": ["参数 orderId 未提取到"],
  "suggestions": ["增加订单号模糊匹配规则"]
}
```

### 交叉验证

```typescript
async function crossValidate(evalCase: EvalCase, actual: AgentResponse) {
  const judges = ['claude-sonnet-4-20250514', 'gpt-4o'];
  const results = await Promise.all(judges.map(m => judgeLayer2(evalCase, actual, m)));
  const avgScores = averageScores(results);
  // 两个模型分数差 > 1.5 → 标记需人工审查
  const divergent = findDivergentDimensions(results, 1.5);
  return { avgScores, divergent };
}
```

---

## 质量门禁

```typescript
interface QualityGate {
  layer1: {
    intentAccuracy: 0.95;      // ≥ 95%
    paramAccuracy: 0.90;       // ≥ 90%
    formatValidity: 1.0;       // 100%
    p95Latency: 2000;          // ≤ 2s
  };
  layer2: {
    avgOverall: 4.0;           // ≥ 4.0/5.0
    minSafety: 4.5;            // ≥ 4.5
    regressionDelta: -0.1;     // 与基线相比下降不超过 0.1
  };
}
```

### CI 集成

```yaml
agent-eval:
  triggers:
    - push to: [dev, main]
    - paths: ['server/app/agent/**', 'eval/**']
  steps:
    - name: Layer 1 (Assert)
      run: npx ts-node eval/layer1.ts  # 每次 push，0 成本
    - name: Layer 2 (LLM-as-Judge)
      run: npx ts-node eval/layer2.ts  # 仅 PR merge 到 main
      env: { JUDGE_MODEL: claude-sonnet-4-20250514 }
    - name: Compare with Baseline
      run: npx ts-node eval/compare.ts --baseline eval/baselines/latest.json
```

---

## 持续改进飞轮

```
┌─────────┐    ┌──────────┐    ┌─────────┐    ┌────────┐
│ 1.采样   │───▶│ 2.评估   │───▶│ 3.诊断  │───▶│ 4.改进 │
│ 生产日志 │    │ LLM Judge│    │ 根因分析│    │ 规则/  │
│ 失败案例 │    │ 交叉验证 │    │ 模式聚类│    │ Prompt │
└─────────┘    └──────────┘    └─────────┘    └────────┘
     ▲                                            │
     └────────────── 扩充 EvalDataset ─────────────┘
```

### 采样策略

```typescript
const SAMPLING_STRATEGY = {
  randomSample: 50,           // 每天随机采样 50 条
  lowConfidence: 'all',       // 置信度 < 0.7 全部采样
  unknownIntent: 'all',       // unknown 意图全部采样
  userRetry: 'all',           // 用户重试全部采样
  escalated: 'all',           // 升级人工全部采样
};
```

### 诊断 → 改进 → 回归

1. 低分案例聚类 → 找到共性问题
2. 失败案例写入 `eval/categories/regression.json`
3. 修复 System Prompt / 意图定义 / 技能逻辑
4. CI 跑全量回归 → 确认不引入新问题 → 更新基线

---

## 成本控制

假设日均 10,000 次用户交互:

| 模型角色 | 模型 | 日调用量 | 日成本 |
|---------|------|---------|--------|
| 生产分类 | Haiku/Mini | ~7,000 (30%缓存) | ~$0.32 |
| 日评估 | Sonnet | ~150 (采样) | ~$0.36 |
| **月总计** | | | **~$20** |

优化杠杆: 缓存(↓30-50%) · Batch API(↓50%) · Prompt 压缩 · 模型降级
