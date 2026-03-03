# 记忆架构 (Memory Architecture)

> Agent 的短期记忆、长期记忆和知识检索架构设计

## 三层记忆模型

```
┌─────────────────────────────────────────────────────┐
│                Agent 记忆架构                         │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ Working      │  │ Session      │  │ Long-term │ │
│  │ Memory       │  │ Memory       │  │ Memory    │ │
│  │              │  │              │  │           │ │
│  │ 当前对话轮次  │  │ 当前会话状态  │  │ 跨会话    │ │
│  │ Slot 状态    │  │ History      │  │ 用户画像  │ │
│  │ 中间推理     │  │ Context      │  │ 知识库    │ │
│  │              │  │              │  │           │ │
│  │ 存储: 内存   │  │ 存储: Redis  │  │ 存储: DB  │ │
│  │ TTL: 请求级  │  │ TTL: 小时级  │  │ TTL: 持久 │ │
│  └──────────────┘  └──────────────┘  └───────────┘ │
└─────────────────────────────────────────────────────┘
```

## Working Memory

当前请求内的状态，用于 Slot 填充、ReAct 推理链等。

```typescript
interface WorkingMemory {
  currentIntent: IntentResult;
  slots: Record<string, any>;
  reasoningChain: string[];      // ReAct 的 thought 序列
  toolCallResults: ToolResult[];  // 工具调用结果
  pendingActions: string[];       // 未完成的动作
}
```

## Session Memory

同一会话内的多轮对话上下文。

```typescript
interface SessionMemory {
  sessionId: string;
  userId: string;
  history: Message[];           // 原始对话历史
  summarizedHistory: string;    // 压缩后的历史摘要
  activeSlots: Record<string, any>; // 跨轮保持的 slot
  turnCount: number;
  createdAt: Date;
  lastActiveAt: Date;
}
```

### 管理策略

| 策略 | 实现 | 适用 |
|------|------|------|
| FIFO 滑窗 | 保留最近 N 轮 | 简单客服 |
| 摘要压缩 | 早期对话 → LLM 摘要 | 长对话 |
| 结构化提取 | 提取 key-value → 丢弃原文 | Slot 密集型 |
| 全量 + 截断 | 全部保留，超限时截断最早的 | 对完整性要求高的 |

## Long-term Memory

### 用户画像 (Persistent Profile)

```typescript
interface UserProfile {
  userId: string;
  name: string;
  level: string;          // VIP, SVIP, normal
  preferences: string[];  // 偏好品类
  recentIntents: { intent: string; count: number }[]; // 高频意图
  totalOrders: number;
  totalSpend: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  notes: string[];        // 人工标注的备注
}
```

### Agentic RAG (检索增强 Agent)

当 Agent 需要外部知识时，将 RAG 作为一个工具:

```typescript
const ragTool: ToolDefinition = {
  name: 'search_knowledge',
  description: '在知识库中搜索相关信息。用于回答产品规格、政策、FAQ 等问题。',
  parameters: {
    query: { type: 'string', description: '搜索查询' },
    category: {
      type: 'string', 
      description: '知识库类别',
      enum: ['product', 'policy', 'faq', 'tutorial'],
    },
  },
};

// Agent 自主决定何时检索
// 而非每次都自动检索 — 避免不必要的延迟和 token 消耗
```

### 记忆更新策略

```
用户对话结束
     │
     ▼
[会话摘要] → 提取关键信息 → 更新 UserProfile
     │
     ├── 新偏好? → 更新 preferences
     ├── 高频意图? → 更新 recentIntents
     ├── 情感变化? → 更新 sentiment
     └── 重要信息? → 添加 notes
```
