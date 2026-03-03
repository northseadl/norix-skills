# 模式 ⑤ ReAct Agent (推理-行动循环)

> LLM 在 Thought → Action → Observation 循环中自主推理和执行
> 延迟 3-15s · 可预测性 ★★☆☆☆ · 适合开放式复杂任务

## 适用场景

- 研究调查（"帮我比较这三款套餐的性价比"）
- 代码生成和调试
- 数据分析（"分析最近一个月的销售趋势"）
- 自由式问答（知识库检索 + 综合推理）

## 不适用信号

- 延迟 < 3s 的硬需求 → ① CREX 或 ② Slot
- 流程固定，无需推理 → ④ Workflow
- 需要前端实时渲染 → ①② + 异步 ReAct

## 核心循环

```
Thought: 我需要查询这三款套餐的详细信息
Action:  tool=query_products, args={ids: ["A", "B", "C"]}
Observation: [{name: "套餐A", price: 299, ...}, ...]

Thought: 现在我需要从多个维度进行比较分析
Action:  tool=analyze, args={products: [...], dimensions: ["价格", "内容", "评分"]}
Observation: {comparison_table: [...]}

Thought: 我已经有了完整对比，可以生成推荐了
Action:  tool=finish, args={result: "综合分析结果..."}
```

## 实现

```typescript
interface ReActConfig {
  model: string;           // 推荐用较强模型: "sonnet", "gpt-4o"
  tools: ToolDefinition[];
  maxIterations: number;   // 防无限循环: 建议 5-10
  systemPrompt: string;
}

class ReActAgent {
  constructor(private config: ReActConfig) {}

  async run(input: string, context: AgentContext): Promise<SkillResponse> {
    const messages: Message[] = [
      { role: 'system', content: this.config.systemPrompt },
      { role: 'user', content: input },
    ];

    for (let i = 0; i < this.config.maxIterations; i++) {
      const response = await llm.chat({
        model: this.config.model,
        messages,
        tools: this.config.tools,
      });

      // LLM 决定结束
      if (!response.tool_calls?.length) {
        return { type: 'text', content: response.content, actions: [], followUp: null };
      }

      // 执行工具
      for (const call of response.tool_calls) {
        const result = await this.executeTool(call, context);
        messages.push({ role: 'assistant', content: '', tool_calls: [call] });
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }

    return { type: 'error', content: '推理超过最大步数限制', actions: [], followUp: null };
  }
}
```

## 与轻量模式的混合

ReAct 延迟高，通常不直接面向用户。推荐模式：

```
用户输入 → CREX 路由 ─── 简单意图 ──→ 确定性执行 (< 1s)
                      │
                      └── 复杂意图 ──→ 返回 "正在分析中..."
                                        │
                                        └──→ [后台 ReAct Agent]
                                              │
                                              └──→ 完成后推送结果
```

```typescript
const complexAnalysisSkill: SkillHandler = {
  id: 'analysis.complex', name: '深度分析',
  async execute(params, context) {
    // 异步触发 ReAct
    await taskQueue.enqueue('react_analysis', { params, context });

    return {
      type: 'text',
      content: '正在为您深度分析，完成后会通过消息通知您',
      actions: [{ label: '查看进度', action: 'navigate', target: '/tasks/latest' }],
      followUp: null,
    };
  }
};
```
