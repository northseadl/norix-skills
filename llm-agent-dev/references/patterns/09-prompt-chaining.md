# 模式 ⑨ Prompt Chaining (链式工作流)

> 将复杂任务分解为固定序列的多个 LLM 调用，每步输出作为下一步输入
> 延迟 1-5s · 可预测性 ★★★★★ · 适合可清晰分解的任务

## 核心理念

Prompt Chaining 是最简单的复合模式 — 将一个大任务拆成 2-5 个小步骤，
每步使用不同的 prompt，前一步的输出自动注入后一步的上下文。

关键区别:
- 与 ReAct 不同: 步骤是**预定义**的，不由 LLM 动态决定
- 与 Workflow Agent 不同: 无条件分支，纯线性
- 与 Function Calling 不同: 每步都可能调用 LLM，不仅是工具

## 适用场景

- 内容生成流水线（研究 → 大纲 → 草稿 → 润色）
- 数据处理（提取 → 分类 → 汇总 → 格式化）
- 代码生成（需求分析 → 架构设计 → 代码 → 测试）
- 翻译流水线（翻译 → 校对 → 本地化）

## 不适用信号

- 步骤需要条件分支 → ④ Workflow Agent
- 步骤数量不固定 → ⑤ ReAct
- 只需要一步 → ①③ 直接路由

## 实现

```typescript
interface ChainStep {
  id: string;
  promptTemplate: string;    // 使用 {{prev}} 引用上一步输出
  model?: string;            // 可选，不同步骤用不同模型
  maxTokens?: number;
  validator?: (output: string) => boolean;  // 步骤间质量门
}

class PromptChain {
  constructor(private steps: ChainStep[], private defaultModel: string) {}

  async run(initialInput: string): Promise<string> {
    let currentOutput = initialInput;

    for (const step of this.steps) {
      const prompt = step.promptTemplate.replace('{{prev}}', currentOutput);
      const response = await llm.chat({
        model: step.model ?? this.defaultModel,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: step.maxTokens,
        temperature: 0,
      });

      currentOutput = response.content;

      // 步骤间质量门 — 不合格则中断
      if (step.validator && !step.validator(currentOutput)) {
        throw new Error(`Chain step ${step.id} failed validation`);
      }
    }

    return currentOutput;
  }
}
```

## 示例: 产品评论分析链

```typescript
const reviewAnalysisChain = new PromptChain([
  {
    id: 'extract',
    promptTemplate: '从以下评论中提取关键观点，按正面/负面分类:\n\n{{prev}}',
    model: 'gpt-4o-mini',
  },
  {
    id: 'categorize',
    promptTemplate: '将以下观点归类到产品质量/物流/客服/价格维度:\n\n{{prev}}',
  },
  {
    id: 'summarize',
    promptTemplate: '基于以下分类分析，生成一份 ≤200 字的评论摘要报告:\n\n{{prev}}',
    validator: (output) => output.length <= 500,
  },
], 'gpt-4o-mini');
```

## 与 Gate 机制

在步骤之间插入 Gate（质量门），控制是否继续:

```
Step 1 → [Gate: 输出长度 > 50?] → Step 2 → [Gate: JSON 合法?] → Step 3
              ↓ 不通过
         [重试 or 中断]
```

## 成本优化

- 早期步骤（提取/分类）用低成本模型
- 最终步骤（生成/创作）用高质量模型
- 步骤间缓存中间结果
