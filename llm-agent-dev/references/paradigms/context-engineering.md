# 上下文工程 (Context Engineering)

> 从 Prompt Engineering 进化到 Context Engineering — 管理 Agent 全生命周期的上下文状态

## 核心概念

Context Engineering = 在 LLM 推理期间，策划和维护整个上下文状态的策略。
不仅是写好一个 System Prompt，而是管理:
- **System Instructions** — 身份、规则、约束
- **Tool Definitions** — 可用工具的描述和 schema
- **External Data** — RAG 检索结果、数据库查询结果
- **Conversation History** — 多轮对话记忆
- **Working Memory** — 当前任务的中间状态

## Context Budget（上下文预算管理）

```
┌────────────────────────────── Context Window ──────────────────────────────┐
│                                                                            │
│  [System Prompt]  [Tool Defs]  [RAG Context]  [History]  [User Input]     │
│     ~2000 tok      ~1500 tok    ~3000 tok      ~5000 tok   ~500 tok       │
│                                                                            │
│  预算分配原则:                                                              │
│  1. System Prompt: ≤ 15% — 精练、高密度                                    │
│  2. Tool Defs: ≤ 10% — 仅注入当前场景需要的工具                            │
│  3. RAG Context: ≤ 25% — 按相关性排序，截断低分结果                         │
│  4. History: ≤ 40% — FIFO 滑窗 + 摘要压缩                                 │
│  5. User Input + Output: ≤ 10%                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

## System Prompt 设计原则

### 结构模板

```
[身份定义] — 你是谁，能力边界
[行为规则] — 必须做什么，禁止做什么
[输出格式] — 输出的结构约束
[候选集] — 可用意图/工具/选项列表
[示例] — 2-3 个 Few-shot 范例
```

### 原则

1. **身份明确**: "你是 X 领域的专家" 比 "你是一个 AI 助手" 效果好 10x
2. **规则用编号**: 规则越多越要编号，LLM 对编号列表的遵从度更高
3. **正面表述**: "只回复 JSON" 优于 "不要回复自由文本"
4. **示例 > 描述**: 1 个好示例 > 100 字的规则描述
5. **临界信息放前/后**: 利用首因/近因效应，关键约束放 prompt 开头或末尾
6. **动态注入**: 候选意图列表根据用户身份/场景动态生成，避免全量注入

## History 管理策略

### 滑窗 + 摘要

```typescript
interface HistoryManager {
  maxTurns: number;          // 保留最近 N 轮原始对话
  summaryModel: string;      // 摘要用的轻量模型
  summaryTrigger: number;    // 超过 N 轮触发摘要

  manage(history: Message[]): Message[] {
    if (history.length <= this.maxTurns * 2) {
      return history; // 未超限，原样返回
    }

    // 对早期对话生成摘要
    const earlyMessages = history.slice(0, -this.maxTurns * 2);
    const summary = await this.summarize(earlyMessages);

    // 摘要 + 最近 N 轮
    return [
      { role: 'system', content: `[对话摘要] ${summary}` },
      ...history.slice(-this.maxTurns * 2),
    ];
  }
}
```

### 结构化记忆 vs 原始对话

| 方式 | 优点 | 缺点 | 适用 |
|------|------|------|------|
| 原始对话 | 信息完整 | 消耗 token | 短对话 |
| 摘要压缩 | 节省 token | 可能丢失细节 | 长对话 |
| 结构化 Slot | 精准 + 低 token | 需要预定义 | Slot 填充 |
| 外部存储 + RAG | 无限长度 | 检索延迟 | 跨会话记忆 |

## Tool Context 优化

### 动态工具注入

不要一次性注入所有工具。根据意图预分类结果，只注入相关工具:

```typescript
function getToolsForIntent(intent: string): ToolDefinition[] {
  const toolGroups: Record<string, string[]> = {
    'order.*': ['query_order', 'cancel_order', 'track_shipping'],
    'product.*': ['search_products', 'get_product_detail', 'compare_products'],
    'booking.*': ['create_booking', 'query_booking', 'cancel_booking'],
  };

  for (const [pattern, tools] of Object.entries(toolGroups)) {
    if (new RegExp(pattern.replace('*', '.*')).test(intent)) {
      return tools.map(t => toolRegistry.get(t));
    }
  }
  return []; // 无匹配则不注入工具
}
```

### Tool 描述的 Prompt Engineering

工具描述是给 LLM 看的，需要像文档一样精心撰写:

```typescript
// ❌ Bad
{ name: 'search', description: '搜索' }

// ✅ Good
{
  name: 'search_products',
  description: '在商品数据库中搜索产品。返回匹配商品的列表，包含名称、价格、库存。' +
    '当用户提到商品名、品类、价格范围时使用此工具。' +
    '不要用于查询订单或用户信息。',
  parameters: {
    keyword: { type: 'string', description: '搜索关键词，可以是商品名或品类名' },
    maxResults: { type: 'number', description: '最大返回数量，默认 5，最大 20' },
  },
}
```

## RAG Context 注入

### 相关性过滤

```typescript
// 只注入相关性 > 阈值的检索结果
function filterRAGResults(results: RAGResult[], threshold: number = 0.7): string {
  return results
    .filter(r => r.score >= threshold)
    .slice(0, 5) // 最多 5 条
    .map(r => `[${r.source}] ${r.content}`)
    .join('\n\n');
}
```

### Context Window 溢出防护

```typescript
function enforceContextBudget(parts: ContextPart[], maxTokens: number): ContextPart[] {
  const priorities = ['system', 'user', 'tools', 'rag', 'history'];
  let remaining = maxTokens;

  return parts
    .sort((a, b) => priorities.indexOf(a.type) - priorities.indexOf(b.type))
    .map(part => {
      const allocated = Math.min(part.tokens, remaining);
      remaining -= allocated;
      return { ...part, content: truncateToTokens(part.content, allocated) };
    });
}
```
