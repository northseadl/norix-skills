# 模式 ⑧ Handoff / Agent 委托

> Agent 间的任务委托和转交，支持专业化分工和人工升级
> 延迟取决于委托链 · 可预测性 ★★★☆☆ · OpenAI Agents SDK 核心原语

## 背景

Handoff 是 OpenAI Agents SDK (Swarm 的生产版) 的核心原语之一。
它允许一个 Agent 将对话或任务"转交"给另一个更专业的 Agent，
或升级到人工处理。这是构建生产级多 Agent 系统的基础模式。

## 适用场景

- 客服系统中不同专业领域的转接（销售→技术→退款）
- Agent 能力边界明确，需要委托给专家
- 人工升级（HITL）作为 Handoff 的特例
- 渐进式复杂度：简单 Agent 处理不了时委托给复杂 Agent

## 核心概念

```typescript
// Handoff 定义
interface Handoff {
  target: Agent;               // 目标 Agent
  condition?: string;          // 触发条件
  contextTransfer: 'full' | 'summary' | 'selective';
  onHandoff?: (context: AgentContext) => void;
}

// Agent 可以声明自己的 handoff 列表
interface Agent {
  id: string;
  name: string;
  instructions: string;
  tools: ToolDefinition[];
  handoffs: Handoff[];         // 可委托给哪些 Agent
}
```

## 实现

### Agent-to-Agent Handoff

```typescript
class HandoffableAgent implements SkillHandler {
  id: string;
  name: string;
  private llm: LLMClient;
  private tools: ToolDefinition[];
  private handoffs: Map<string, HandoffableAgent>;

  async execute(params: Record<string, any>, context: AgentContext): Promise<SkillResponse> {
    const response = await this.llm.chat({
      model: 'haiku',
      messages: this.buildMessages(params, context),
      tools: [
        ...this.tools,
        // 将 handoff 目标暴露为特殊 "tool"
        ...this.handoffsAsTools(),
      ],
    });

    // 检查是否触发 handoff
    if (response.tool_calls?.some(tc => tc.function.name.startsWith('handoff_to_'))) {
      const handoffCall = response.tool_calls.find(tc => tc.function.name.startsWith('handoff_to_'))!;
      const targetId = handoffCall.function.name.replace('handoff_to_', '');
      const target = this.handoffs.get(targetId);

      if (target) {
        // 转移上下文并委托
        const transferredContext = this.transferContext(context, handoffCall);
        return target.execute(params, transferredContext);
      }
    }

    return this.formatResponse(response);
  }

  private handoffsAsTools(): ToolDefinition[] {
    return [...this.handoffs.entries()].map(([id, agent]) => ({
      name: `handoff_to_${id}`,
      description: `将对话转交给 ${agent.name}。当前对话超出你的能力范围时使用。`,
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: '转交原因' },
          summary: { type: 'string', description: '对话摘要' },
        },
        required: ['reason'],
      },
    }));
  }
}
```

### Agent-to-Human Handoff (HITL)

```typescript
const humanHandoff: Handoff = {
  target: humanAgent,
  condition: 'confidence < 0.5 || sentiment === "negative" || topic === "complaint"',
  contextTransfer: 'full',
  onHandoff: async (context) => {
    // 通知人工客服
    await notifyHumanAgent({
      sessionId: context.sessionId,
      userId: context.userId,
      summary: context.conversationSummary,
      priority: context.sentiment === 'negative' ? 'high' : 'normal',
    });
  },
};
```

## 委托拓扑

### 线性委托链
```
用户 → 前台 Agent → 专家 Agent → 执行完返回
```

### 星型委托
```
           ┌→ 销售 Agent
用户 → 路由 Agent ─→ 技术 Agent
           └→ 退款 Agent
```

### 渐进式升级
```
用户 → 简单 Agent (CREX)
         │ 处理不了
         ▼
       中级 Agent (FC + Slot)
         │ 仍处理不了
         ▼
       高级 Agent (ReAct)
         │ 仍处理不了
         ▼
       人工客服 (HITL)
```

## 与 Router-Expert 的区别

| 维度 | Router-Expert (⑥) | Handoff (⑧) |
|------|-------------------|-------------|
| 决策者 | 路由层（外部分类器） | Agent 自身（LLM 判断） |
| 时机 | 对话开始时路由 | 对话中间随时转交 |
| 可逆性 | 不可逆（选定专家后固定） | 可逆（目标可以再 handoff 回来） |
| 上下文 | 分割 | 可选择性转移 |

## ACT 协议 (Agentic Commerce Trust)

阿里 2026.01 推出的 ACT 协议是 Handoff 在电商场景的标准化：

```
用户: "帮我点个外卖"
  → 通义千问 Agent
    → Handoff to 饿了么 MCP Server (餐厅发现+菜品)
    → Handoff to 支付宝 Agent (优惠券+支付)
    → 结果聚合返回用户
```

Agent-to-Agent 之间通过标准协议建立信任，互相委托子任务。
