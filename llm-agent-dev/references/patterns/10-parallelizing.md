# 模式 ⑩ Parallelizing (并行工作流)

> 同一任务的多个子任务并发执行，大幅减少端到端延迟
> 延迟 max(子任务) · 可预测性 ★★★★☆ · 适合可独立并行的子任务

## 核心理念

将一个请求拆成 N 个独立子任务，并发执行后合并结果。
总延迟 = max(子任务延迟)，而非 sum(子任务延迟)。

两种变体:
1. **Sectioning** — 不同子任务做不同事情（分工）
2. **Voting** — 多个子任务做同一件事，投票取最优（冗余）

## 适用场景

### Sectioning (分工)
- 多维度分析（同时分析情感/主题/实体）
- 多数据源查询（同时查订单/商品/物流）
- 多格式生成（同时生成摘要/标题/标签）

### Voting (投票)
- 意图分类置信度增强（3 个模型投票）
- 内容安全检测（多检测器并行）
- 翻译质量（多翻译取最优）

## 实现

```typescript
// Sectioning — 不同 prompt 不同任务
async function parallelSection(
  input: string,
  sections: { id: string; prompt: string; model?: string }[],
): Promise<Record<string, string>> {
  const results = await Promise.all(
    sections.map(async (section) => {
      const response = await llm.chat({
        model: section.model ?? 'gpt-4o-mini',
        messages: [{ role: 'user', content: `${section.prompt}\n\n输入: ${input}` }],
        temperature: 0,
      });
      return [section.id, response.content] as const;
    }),
  );
  return Object.fromEntries(results);
}

// Voting — 同一 prompt 多次执行
async function parallelVote<T>(
  input: string,
  prompt: string,
  models: string[],
  aggregator: (results: string[]) => T,
): Promise<T> {
  const results = await Promise.all(
    models.map(async (model) => {
      const response = await llm.chat({
        model,
        messages: [{ role: 'user', content: `${prompt}\n\n${input}` }],
        temperature: 0,
      });
      return response.content;
    }),
  );
  return aggregator(results);
}
```

## 示例: 商品描述多维生成

```typescript
const productDescription = await parallelSection(productData, [
  { id: 'title', prompt: '生成一句吸引人的商品标题 (≤20字)' },
  { id: 'highlights', prompt: '提取 3-5 个卖点，每个 ≤15字' },
  { id: 'description', prompt: '写一段 100-200 字的商品描述' },
  { id: 'tags', prompt: '生成 5 个 SEO 标签，JSON数组格式' },
]);

// 总延迟 ≈ 单次 LLM 调用，而非 4 倍
```

## 示例: 意图分类投票

```typescript
const classificationResult = await parallelVote(
  userInput,
  intentClassificationPrompt,
  ['gpt-4o-mini', 'claude-haiku', 'qwen-turbo'],
  (results) => {
    const parsed = results.map(r => JSON.parse(r));
    // 多数投票
    const intentCounts = new Map<string, number>();
    for (const r of parsed) {
      intentCounts.set(r.intent, (intentCounts.get(r.intent) ?? 0) + 1);
    }
    // 返回得票最多的意图
    return [...intentCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  },
);
```

## 注意事项

- 子任务必须**真正独立**，不能有数据依赖
- 并发数受 API rate limit 约束，需要限流器
- Voting 模式的成本 = N 倍，仅用于高价值决策
- 失败处理: 使用 `Promise.allSettled` 容忍部分失败
