# 模式 ③ Function Calling

> LLM 根据用户输入生成结构化函数调用，系统执行并返回结果
> 延迟 500-2000ms · 可预测性 ★★★★☆ · 适合工具调用密集场景

## 适用场景

- 计算器、单位换算
- 数据查询（"查一下最近一周的销售额"）
- API 调用委托（天气/汇率/运费等外部服务）
- 灵活工具调用（意图无法穷举但工具集有限）

## 不适用信号

- 意图可穷举且执行路径固定 → ① CREX（更快更省）
- 需要多步骤串联多个工具 → ⑤ ReAct
- 工具执行有审批要求 → ④ Workflow

## 与 CREX 的关系

Function Calling 可作为 CREX 的 **Layer 3 高级分类模式**——
当规则和缓存都失败时，让 LLM 从工具列表中选择要调用的函数。

也可以独立使用：直接让 LLM 决定调用哪个函数（不经过 CREX 的意图路由）。

## 实现

### 工具定义

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

const tools: ToolDefinition[] = [
  {
    name: 'query_order',
    description: '查询用户的订单信息',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: '订单号，可选' },
        status: { type: 'string', description: '订单状态筛选', enum: ['pending', 'shipped', 'completed'] },
      },
      required: [],
    },
  },
  {
    name: 'calculate_shipping',
    description: '计算运费',
    parameters: {
      type: 'object',
      properties: {
        destination: { type: 'string', description: '目的地城市' },
        weight: { type: 'number', description: '重量(kg)' },
      },
      required: ['destination', 'weight'],
    },
  },
];
```

### 调用流程

```typescript
async function handleWithFunctionCalling(
  input: string,
  context: AgentContext,
  toolExecutors: Map<string, (args: any, ctx: AgentContext) => Promise<any>>
): Promise<SkillResponse> {

  // 1. LLM 决定调用哪个函数
  const response = await llm.chat({
    model: 'haiku',    // 轻量模型足够
    messages: [
      { role: 'system', content: 'You are a helpful assistant. Use tools when needed.' },
      { role: 'user', content: input },
    ],
    tools,
    tool_choice: 'auto',
  });

  // 2. 无工具调用 → 直接返回文本
  if (!response.tool_calls?.length) {
    return { type: 'text', content: response.content, actions: [], followUp: null };
  }

  // 3. 执行工具调用
  const call = response.tool_calls[0];
  const executor = toolExecutors.get(call.function.name);
  if (!executor) {
    return { type: 'error', content: `未知工具: ${call.function.name}`, actions: [], followUp: null };
  }

  const args = JSON.parse(call.function.arguments);
  const result = await executor(args, context);

  // 4. 将结果格式化为 SkillResponse
  return formatToolResult(call.function.name, result);
}
```

### 关键约束 (Structured Output)

```typescript
// 使用 strict mode 防止 LLM 幻觉字段
const response = await llm.chat({
  tools,
  tool_choice: 'auto',
  // OpenAI strict mode — 确保参数严格匹配 schema
  // Claude: 自动严格匹配
});
```

**注意事项**:
- 工具列表建议 5-15 个，太多会降低选择准确率
- 每个工具的 description 要精准，这是 LLM 选择的主要依据
- required 参数缺失时 LLM 可能会编造值 → 需做后校验

## 与 CREX 混合使用

```typescript
class HybridClassifier {
  async classify(input: string): Promise<IntentResult> {
    // 优先走 CREX（快速+免费）
    const crexResult = await this.crexClassifier.classify(input);
    if (crexResult.confidence > 0.8) return crexResult;

    // CREX 不确定时退到 Function Calling
    return this.functionCallingClassifier.classify(input);
  }
}
```
