# 模式 ⑥ Router-Expert (路由-专家型)

> 轻量路由层分领域，每个领域委托给专家子系统
> 延迟 500-3000ms · 可预测性 ★★★☆☆ · 适合多领域综合平台

## 适用场景

- 综合服务平台（同时覆盖客服、营销、技术支持）
- 多业务线聚合（电商 + 物流 + 金融）
- 不同领域需要不同 LLM 配置（专用 System Prompt / 模型）

## 不适用信号

- 单一领域 → ① CREX 足够
- 领域间需要深度协作 → ⑦ Multi-Agent

## 与 CREX 的关系

CREX 的路由+执行可视为 Router-Expert 的轻量化实现。
**升级路径**: 当单一 SkillHandler 无法满足某个领域的复杂度时，
将其升级为一个完整的专家子系统（含自己的分类器、路由器、技能集）。

## 实现

```typescript
interface ExpertConfig {
  domain: string;                // "customer_service", "sales", "tech_support"
  model: string;                 // 专家用的 LLM 模型
  systemPrompt: string;          // 专用 System Prompt
  subRouter?: SkillRegistry;     // 可选：专家内部的子路由
  handler: (input: string, context: AgentContext) => Promise<SkillResponse>;
}

class DomainExpertRouter {
  private router: LLMClassifier;  // 轻量路由器（按领域分类）
  private experts: Map<string, ExpertConfig>;

  constructor(routerModel: string, experts: ExpertConfig[]) {
    this.router = new LLMClassifier(routerModel, this.buildDomainSchema(experts));
    this.experts = new Map(experts.map(e => [e.domain, e]));
  }

  async handle(input: string, context: AgentContext): Promise<SkillResponse> {
    // 1. 轻量路由层：判断属于哪个领域
    const domain = await this.router.classifyDomain(input);

    // 2. 委托给领域专家
    const expert = this.experts.get(domain.intent);
    if (expert) {
      return expert.handler(input, context);
    }

    // 3. 通用回退
    return { type: 'text', content: '请问您需要哪方面的帮助？',
      actions: [...this.experts.values()].map(e => ({
        label: e.domain, action: 'confirm', target: e.domain,
      })),
      followUp: null };
  }
}
```

### 使用示例

```typescript
const router = new DomainExpertRouter('haiku', [
  {
    domain: 'customer_service',
    model: 'haiku',
    systemPrompt: '你是客服专家...',
    handler: customerServiceCREX.handle,  // 内部用 CREX
  },
  {
    domain: 'sales',
    model: 'haiku',
    systemPrompt: '你是销售顾问...',
    handler: salesCREX.handle,            // 内部用 CREX + Slot
  },
  {
    domain: 'tech_support',
    model: 'sonnet',                      // 技术支持用更强模型
    systemPrompt: '你是技术支持工程师...',
    handler: techReActAgent.handle,       // 内部用 ReAct
  },
]);
```

## 架构图

```
用户输入
   │
   ▼
[Domain Router] ── 轻量 LLM 判断领域
   │
   ├─ 客服 ──→ [CREX 子系统] ── FAQ + 订单查询
   ├─ 销售 ──→ [CREX + Slot 子系统] ── 推荐 + 下单
   ├─ 技术 ──→ [ReAct 子系统] ── 问题排查
   └─ 未知 ──→ 展示领域选择菜单
```

每个领域专家可以是不同的 Agent 模式组合——这就是 Router-Expert 的灵活性。
