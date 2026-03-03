# 收敛迭代协议 (Convergence Iteration Protocol)

> 通过多版本并行测试 + LLM-as-Judge 评估实现 Agent 配置的自动择优收敛

## 核心概念

收敛迭代解决的问题: **在多个候选设计中，如何科学、高效地选出最优版本？**

```
传统方式: 人工逐个测试 → 主观判断 → 偏差大 + 效率低
收敛迭代: 并发自动测试 → LLM 客观评分 → 数据驱动决策
```

## 适用场景

| 场景 | 候选维度 | 示例 |
|------|---------|------|
| **Prompt 优化** | System Prompt 变体 | 3 种不同风格的意图分类 prompt |
| **模型选择** | LLM 模型 | GPT-4o-mini vs Claude Haiku vs Qwen-Turbo |
| **模式择优** | 架构模式 | CREX vs Function Calling |
| **参数调优** | temperature/top_p | 温度 0 vs 0.1 vs 0.3 |
| **Few-shot 优化** | 示例选择 | 3 个 vs 5 个 vs 7 个示例 |
| **安全策略** | Guardrail 配置 | 严格模式 vs 宽松模式 |

## 完整工作流

```
Phase 1: 定义竞争空间
     │
     ▼
Phase 2: 生成候选版本 (可手动或 Meta-Prompting 自动生成)
     │
     ▼
Phase 3: 并发测试 (Agent 自主调 LLM API → 逐版本评估)
     │
     ▼
Phase 4: 收集评分
     │
     ▼
Phase 5: 跨版本比较 (LLM-as-Judge)
     │
     ├── 明确胜出 → 选择最优 → Phase 7
     ├── 差异不显著 → 选成本/延迟更优的 → Phase 7
     └── 全部不达标 → 诊断 → Phase 6
     │
Phase 6: 生成新候选 → 回到 Phase 3 (最多 N 轮)
     │
Phase 7: 固化最优版本 → 更新 baseline → 输出报告
```

### Phase 1: 竞争空间定义

```typescript
interface CompetitionSpace {
  name: string;              // "意图分类 Prompt 优化"
  dimensions: string[];       // ["prompt", "model", "temperature"]
  evalDataset: string;        // "eval/dataset.json"
  maxIterations: number;      // 3-5
  
  scoring: {
    dimensions: {
      name: string;
      weight: number;        // 0-1, 权重之和 = 1
      threshold: number;     // 最低通过线
      direction: 'higher_better' | 'lower_better';
    }[];
  };
}
```

### Phase 2: 候选版本生成

**手动方式**: 人工编写 2-5 个候选配置/prompt

**自动方式 (Meta-Prompting)**:
```
分析以下 Agent 系统的当前配置及其评估结果。
生成 3 个改进版本的候选配置。

当前配置:
{current_config}

评估结果:
{evaluation_scores}

低分案例:
{failed_cases}

要求:
1. 每个候选版本聚焦改进一个问题域
2. 保持配置兼容性（不改变输出格式）
3. 说明每个版本的改进假设
```

### Phase 3: 并发测试 Task Spec

为每个候选版本生成一个 Task Spec:

```markdown
## T{N} · V{M} 收敛测试

- **Engine**: codex (或 claude — 推荐用高智能模型做评估)
- **范围**: 对版本 V{M} 运行完整评估
- **输入**:
  - 版本配置: `convergence/candidates/v{M}/config.json`
  - 评估数据集: `eval/dataset.json`
  - Agent 代码: 当前工作区
- **执行步骤**:
  1. 加载 V{M} 配置（替换 System Prompt / 模型 / 参数）
  2. 对每条 eval case 运行 Agent
  3. 执行 Layer 1 断言（意图+参数匹配）
  4. 执行 Layer 2 LLM-as-Judge 评分
  5. 计算加权总分
- **交付物**: `convergence/results/v{M}-scores.json`
- **输出 Schema**:
  ```json
  {
    "versionId": "V1",
    "timestamp": "2026-03-02T15:00:00Z",
    "summary": {
      "totalCases": 50,
      "layer1": {
        "intentAccuracy": 0.96,
        "paramAccuracy": 0.91,
        "formatValidity": 1.0,
        "p95Latency": 1850
      },
      "layer2": {
        "avgOverall": 4.3,
        "avgRelevance": 4.5,
        "avgSafety": 4.8,
        "avgActionQuality": 4.1
      },
      "weightedScore": 0.87
    },
    "failedCases": [
      { "id": "ec-001", "reason": "意图误分类为 order.query" }
    ]
  }
  ```
- **验收**:
  - [ ] 所有 eval case 有评分
  - [ ] 输出 JSON 格式合规
  - [ ] 包含 failedCases 明细
```

### Phase 4-5: 评分收集与比较

使用 LLM-as-Judge 进行跨版本比较:

```
你是 Agent 系统评估专家。比较以下 {N} 个版本的测试结果，选出最优版本。

## 版本评分汇总

| 版本 | 意图准确率 | 参数提取 | 回复质量 | 安全性 | P95延迟 | 加权总分 |
|------|-----------|---------|---------|--------|---------|---------|
{{#each versions}}
| {{this.id}} | {{this.intentAccuracy}} | {{this.paramAccuracy}} | {{this.avgOverall}} | {{this.avgSafety}} | {{this.p95Latency}}ms | {{this.weightedScore}} |
{{/each}}

## 评判规则

1. **一票否决**: 安全性 < 4.5 或意图准确率 < 93% → 自动淘汰
2. **加权总分**: 意图(0.30) + 参数(0.15) + 回复(0.25) + 安全(0.15) + 延迟(0.15)
3. **平局处理**: 总分差 < 3% → 选延迟/成本更低的版本
4. **改进空间**: 分析最优版本的弱项，建议下一轮优化方向

## 输出（仅 JSON）
{
  "winner": "V{id}",
  "confidence": 0.85,
  "reasoning": "...",
  "eliminated": [{ "id": "V2", "reason": "安全性 4.2 低于阈值" }],
  "improvements": ["V1 在退款意图的边界情况仍有改进空间"],
  "shouldContinue": false,
  "nextAction": "deploy"
}
```

### Phase 6: 诊断与新候选生成

当所有版本都不达标时:

```
所有候选版本均未达标。分析失败模式并生成改进方向。

## 各版本共同弱项

{{common_failures}}

## 根因分析请求

1. 这些失败模式的共同根因是什么？
2. 是 prompt 设计问题、数据不足问题、还是架构模式选择问题？
3. 给出 2-3 个新的改进方向，每个方向足以生成一个新候选版本
```

### Phase 7: 固化与报告

```typescript
interface ConvergenceReport {
  // 元信息
  name: string;
  startedAt: string;
  completedAt: string;
  totalIterations: number;
  
  // 结果
  winner: {
    versionId: string;
    config: any;
    scores: VersionScores;
  };
  
  // 对比
  allVersions: {
    versionId: string;
    scores: VersionScores;
    status: 'winner' | 'eliminated' | 'inferior';
    eliminationReason?: string;
  }[];
  
  // 洞察
  insights: string[];
  remainingImprovements: string[];
  
  // 基线更新
  baselineUpdated: boolean;
  previousBaseline?: VersionScores;
}
```

## Agent 自主执行

> **自洽原则**: Agent 直接调 LLM API 执行版本测试和评估，不依赖外部技能。

```typescript
// Agent 自主执行收敛测试
async function runConvergenceTest(
  candidates: CandidateConfig[],
  evalDataset: EvalCase[],
) {
  // 逐版本运行评估
  const results = await Promise.all(
    candidates.map(async (candidate) => {
      const scores = await evaluateVersion(candidate, evalDataset);
      return { versionId: candidate.id, scores };
    }),
  );

  // LLM-as-Judge 跨版本比较
  const comparison = await llm.chat({
    model: 'claude-sonnet-4-20250514',  // 强模型做评估
    messages: [{
      role: 'user',
      content: buildComparisonPrompt(results),
    }],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  return JSON.parse(comparison.content);
}

async function evaluateVersion(
  candidate: CandidateConfig,
  dataset: EvalCase[],
): Promise<VersionScores> {
  let correct = 0;
  const judgeScores: number[] = [];

  for (const evalCase of dataset) {
    // 运行 Agent (使用候选版本配置)
    const result = await runAgentWithConfig(candidate, evalCase.input);

    // Layer 1: 确定性断言
    if (result.intent === evalCase.expected.intent) correct++;

    // Layer 2: LLM-as-Judge
    const score = await judgeResponse(evalCase, result);
    judgeScores.push(score);
  }

  return {
    intentAccuracy: correct / dataset.length,
    avgJudgeScore: mean(judgeScores),
    // ... 其他维度
  };
}
```

## 最佳实践

1. **每轮不超过 5 个候选**: 太多会浪费 token
2. **共享同一数据集**: 确保版本间可比性
3. **固定随机种子**: temperature=0 保证可复现
4. **保留所有中间结果**: 供后续分析
5. **设定最大迭代数**: 防止无限循环（建议 3-5 轮）
6. **用强模型评估**: Evaluator 模型应 ≥ 被评估模型的智能水平
