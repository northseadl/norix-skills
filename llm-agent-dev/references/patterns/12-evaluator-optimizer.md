# 模式 ⑫ Evaluator-Optimizer (评估-优化循环)

> 一个 LLM 生成输出，另一个评估并反馈，循环迭代直到达标
> 延迟 5-30s · 可预测性 ★★★★☆ · 适合需要高质量输出的生成任务

## 核心理念

双 LLM 协作: Generator 负责产出，Evaluator 负责打分和反馈。
循环直到 Evaluator 满意或达到最大迭代次数。

```
┌─────────────────────────────────────────────┐
│                                              │
│  Input → [Generator] → Output V1             │
│               ↑            │                  │
│               │            ▼                  │
│          ┌────┴────┐  [Evaluator]             │
│          │Feedback │       │                  │
│          │+ Score  │  Pass? ─── Yes → Final   │
│          └─────────┘       │                  │
│                       No ──┘                  │
│                   (max N iterations)          │
│                                              │
└─────────────────────────────────────────────┘
```

## 与 Pillar III 收敛迭代的关系

**本模式是单次请求内的微循环**:
- Evaluator-Optimizer 是在一次用户请求中，Generator 和 Evaluator 快速迭代
- Pillar III 收敛迭代是跨多个版本/配置的宏观优化

两者可叠加: Pillar III 可以用多个 Evaluator-Optimizer 配置做 A/B 测试。

## 适用场景

- 文案 / 营销内容生成（质量要求高）
- 代码生成 + 自动审查
- 摘要/翻译质量迭代
- 结构化数据提取（Schema 合规性检查）
- SQL 生成 + 语法/逻辑验证

## 实现

```typescript
interface EvalResult {
  passed: boolean;
  score: number;         // 0-5
  feedback: string;      // 具体改进建议
  issues: string[];      // 问题列表
}

interface EvalOptConfig {
  generatorModel: string;
  evaluatorModel: string;    // 推荐用更强的模型评估
  maxIterations: number;     // 建议 2-4
  passThreshold: number;     // 分数阈值 (如 4.0)
  evaluationCriteria: string; // 评估标准
}

class EvaluatorOptimizer {
  constructor(private config: EvalOptConfig) {}

  async run(input: string): Promise<{ output: string; iterations: number; finalScore: number }> {
    let currentOutput = '';
    let feedback = '';
    let iterations = 0;

    for (let i = 0; i < this.config.maxIterations; i++) {
      iterations++;

      // Generate (含反馈上下文)
      currentOutput = await this.generate(input, currentOutput, feedback);

      // Evaluate
      const evalResult = await this.evaluate(input, currentOutput);

      if (evalResult.passed) {
        return { output: currentOutput, iterations, finalScore: evalResult.score };
      }

      feedback = evalResult.feedback;
    }

    // 达到最大迭代 — 返回最后版本
    return { output: currentOutput, iterations, finalScore: -1 };
  }

  private async generate(
    originalInput: string,
    previousOutput: string,
    feedback: string,
  ): Promise<string> {
    const messages: Message[] = [
      { role: 'user', content: originalInput },
    ];

    if (previousOutput && feedback) {
      messages.push({
        role: 'assistant',
        content: previousOutput,
      });
      messages.push({
        role: 'user',
        content: `评审反馈:\n${feedback}\n\n请根据反馈改进输出。`,
      });
    }

    const response = await llm.chat({
      model: this.config.generatorModel,
      messages,
      temperature: 0.3,  // 稍有创造性
    });

    return response.content;
  }

  private async evaluate(input: string, output: string): Promise<EvalResult> {
    const response = await llm.chat({
      model: this.config.evaluatorModel,
      messages: [{
        role: 'user',
        content: `你是质量评审专家。评估以下输出是否满足标准。

## 原始需求
${input}

## 当前输出
${output}

## 评估标准
${this.config.evaluationCriteria}

## 输出格式 (仅 JSON)
{
  "score": 4.5,
  "passed": true,
  "feedback": "整体质量好，但可以改进...",
  "issues": ["问题1", "问题2"]
}`,
      }],
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    const result = JSON.parse(response.content);
    result.passed = result.score >= this.config.passThreshold;
    return result;
  }
}
```

## 示例: 营销文案迭代

```typescript
const copywriter = new EvaluatorOptimizer({
  generatorModel: 'gpt-4o',
  evaluatorModel: 'claude-sonnet-4-20250514',
  maxIterations: 3,
  passThreshold: 4.0,
  evaluationCriteria: `
    1. 情感吸引力 (1-5): 是否让人产生购买欲?
    2. 信息完整度 (1-5): 是否包含关键卖点?
    3. 品牌一致性 (1-5): 是否符合品牌调性?
    4. 行动号召 (1-5): 是否有清晰的 CTA?
    5. 合规性 (1-5): 是否避免虚假宣传?
    总分 = 平均分。通过阈值 = 4.0。
  `,
});

const result = await copywriter.run('为新款运动鞋写一段小红书种草文案');
// → 经过 2-3 轮迭代，输出高质量文案
```

## 成本控制

- 第一轮用低成本模型快速产出草稿
- Evaluator 始终用强模型（质量审查不能省）
- 设置严格的 maxIterations 上限（建议 ≤ 4）
- 大多数请求应在 2 轮内收敛（如果不能，说明 prompt 设计有问题）
