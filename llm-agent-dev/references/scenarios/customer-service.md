# 场景蓝图: 智能客服 Agent

> 从简单 FAQ 到复杂投诉处理的全层级客服架构
> 覆盖: 售前咨询、售后支持、投诉升级、情感安抚

## 渐进式升级架构

```
用户输入
   │
   ▼
[Tier 1: CREX 即时响应] ← 80% 问题在此解决
   │ 处理不了
   ▼
[Tier 2: FC + Slot 专业处理] ← 15% 问题
   │ 处理不了
   ▼
[Tier 3: ReAct 深度分析] ← 4% 问题
   │ 处理不了 / 负面情绪 / 投诉
   ▼
[Tier 4: Handoff 人工客服] ← 1% 问题
```

## 各层级模式选型

### Tier 1: CREX (80% 覆盖率)

| 意图 | 处理方式 | 延迟 |
|------|---------|------|
| 营业时间/地址 | 静态知识库查询 | < 200ms |
| 退换货政策 | FAQ 模板回复 | < 200ms |
| 订单查询 | API 调用 | < 500ms |
| 物流追踪 | API 调用 | < 500ms |
| 常见操作指引 | 预设步骤引导 | < 200ms |

### Tier 2: FC + Slot (15% 覆盖率)

| 意图 | 处理方式 | 延迟 |
|------|---------|------|
| 退款申请 | Slot 收集信息 → Workflow 审批 | 1-3s/轮 |
| 地址修改 | Slot 收集新地址 → API 更新 | 1-2s |
| 商品对比咨询 | FC 查询多商品 → LLM 对比 | 2-3s |
| 个性化推荐 | FC 查用户画像 → 推荐引擎 | 1-2s |

### Tier 3: ReAct (4% 覆盖率)

| 意图 | 处理方式 | 延迟 |
|------|---------|------|
| 复杂问题排查 | 多步推理 + 多工具调用 | 5-15s |
| 跨系统问题 | 查询多个系统汇总 | 5-10s |
| 个性化方案 | 分析用户历史 → 定制方案 | 5-10s |

### Tier 4: Handoff (1% 覆盖率)

自动升级触发条件:
- 意图置信度 < 0.4
- 检测到负面情绪 (愤怒/失望)
- 连续 3 次未成功解决
- 用户主动要求人工
- 涉及退款金额 > 阈值
- 法律/合规相关问题

## 情感感知

```typescript
interface SentimentGuardrail {
  async check(input: string, context: AgentContext): Promise<SentimentResult> {
    const sentiment = await llm.classify(input, ['positive', 'neutral', 'negative', 'angry']);

    if (sentiment === 'angry') {
      // 切换到安抚话术 + 高优先级 Handoff
      return { action: 'escalate', priority: 'urgent', tone: 'empathetic' };
    }
    if (sentiment === 'negative') {
      // 调整回复语气为更同理心
      return { action: 'adjust_tone', tone: 'empathetic' };
    }
    return { action: 'continue' };
  }
}
```

## MCP 工具集

```
客户 MCP → get_profile, get_order_history, get_preferences
订单 MCP → query_order, modify_order, cancel_order
物流 MCP → track_delivery, estimate_arrival
售后 MCP → create_ticket, check_warranty, process_refund
知识 MCP → search_faq, search_policies, search_articles
```
