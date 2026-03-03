# 模式 ① CREX 规则路由 (Rule Router)

> 最基础的 Agent 循环：Classify → Route → Execute → Respond
> 延迟 50-500ms · 可预测性 ★★★★★ · 适合意图可枚举的确定性场景

## 适用场景

- FAQ / 常见问题回答
- 订单/预约查询
- 页面导航/功能引导
- 简单客服（固定话术回复）

## 不适用信号

- 意图数量 > 100 且持续增长 → 考虑 ③ Function Calling
- 需要多轮信息收集 → 切换到 ② Slot 填充
- 需要动态推理 → 升级到 ⑤ ReAct

## 架构

```
用户输入 → [LLM 意图分类] → [技能路由表] → [技能执行] → 结构化反馈
   ↑                                                    │
   └────────────────── followUp ─────────────────────────┘
```

### Step 1: Classify — LLM-Native 意图分类

以轻量 LLM 为核心分类引擎：

```
Layer 0: Guardrail 规则   → 安全拦截（敏感词/注入攻击）
Layer 1: 缓存命中 (0ms)    → 高频意图的 LLM 结果缓存
Layer 2: 轻量 LLM (100-500ms) → 核心引擎（Haiku/Mini/Qwen-Turbo）
Layer 3: 强模型 Fallback (1-3s) → 仅极端模糊场景
```

#### IntentResult 协议

```typescript
interface IntentResult {
  intent: string;                // "booking.query"
  confidence: number;            // 0-1
  params: Record<string, any>;   // LLM 提取的结构化参数
  rawInput: string;
}
```

#### LLM 分类实现要点

1. **IntentSchema 注册表**: 所有意图（ID + 描述 + 示例 + 参数定义）编入 System Prompt
2. **Structured Output**: JSON Schema 约束输出格式，temperature=0
3. **缓存加速**: 高频结果缓存 5 分钟，省 30-50% LLM 调用
4. **规则短路**: ≤ 20 条极高频精确匹配用正则直达（见 `intent-patterns.md`）

#### Go 实现

```go
// Classifier: LLM-Native with caching and shortcuts
type Classifier struct {
    llmClient    llm.Client
    model        string           // "haiku" / "gpt-4o-mini" / "qwen-turbo"
    systemPrompt string           // compiled from IntentSchema
    shortcuts    []ShortcutRule   // high-frequency regex bypasses
    cache        sync.Map
    cacheTTL     time.Duration
}

func (c *Classifier) Classify(ctx context.Context, input string) model.IntentResult {
    input = strings.TrimSpace(input)

    // Layer 0: Shortcut (optional)
    if r := c.shortcutMatch(input); r != nil { return *r }

    // Layer 1: Cache
    if r, ok := c.cacheGet(input); ok { return r }

    // Layer 2: LLM
    result := c.llmClassify(ctx, input)
    c.cacheSet(input, result)
    return result
}
```

完整 Go 实现见 `skill-templates.md` §意图分类器

#### TypeScript 实现

```typescript
class LLMClassifier {
  constructor(
    private client: LLMClient,
    private model: string,
    private schema: IntentSchema,
  ) {}

  async classify(input: string): Promise<IntentResult> {
    // Cache check (omitted for brevity)
    const resp = await this.client.chat({
      model: this.model,
      messages: [
        { role: 'system', content: this.schema.toSystemPrompt() },
        { role: 'user', content: input },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    });
    return JSON.parse(resp.content);
  }
}
```

### Step 2: Route — 技能路由

纯确定性映射表，零逻辑：

```typescript
class SkillRegistry {
  private skills = new Map<string, SkillHandler>();
  register(intent: string, handler: SkillHandler) { this.skills.set(intent, handler); }
  resolve(intent: string): SkillHandler | null { return this.skills.get(intent) ?? null; }
}

interface SkillHandler {
  id: string;
  name: string;
  execute(params: Record<string, any>, context: AgentContext): Promise<SkillResponse>;
}
```

### Step 3: Execute — 确定性执行

params + context → 数据操作 → SkillResponse。**不含 LLM**（若需 LLM 增强见模式 C）。

```typescript
const orderQuerySkill: SkillHandler = {
  id: 'order.query', name: '订单查询',
  async execute(params, context) {
    const orders = await orderService.query({ userId: context.userId, keyword: params.keyword });
    return orders.length === 0
      ? { type: 'empty', content: '未找到订单',
          actions: [{ label: '全部订单', action: 'navigate', target: '/orders' }],
          followUp: '可以提供订单号精确查找' }
      : { type: 'list', content: orders.map(formatCard), actions: [], followUp: null };
  }
};
```

### Step 4: Respond — 结构化反馈

统一 SkillResponse 协议，详见 `feedback-protocol.md`。

### LLM 增强执行 (模式 C 变体)

当技能需要生成个性化内容时，在确定性数据查询基础上叠加轻量 LLM：

```typescript
const smartRecommendSkill: SkillHandler = {
  id: 'product.recommend', name: '智能推荐',
  async execute(params, context) {
    const products = await productService.topByCategory(params.category, 5);
    const reasons = await llm.chat({
      model: 'haiku',
      messages: [{ role: 'user',
        content: `为以下商品各写一句推荐理由: ${JSON.stringify(products)}` }],
    });
    return { type: 'list', content: mergeReasons(products, reasons), actions: [], followUp: null };
  }
};
```

## 技能组合 (Pipeline)

串联多个 SkillHandler，前一个输出为后一个的附加输入参数：

```typescript
class SkillPipeline implements SkillHandler {
  constructor(public id: string, public name: string, private steps: SkillHandler[]) {}

  async execute(params: Record<string, any>, context: AgentContext): Promise<SkillResponse> {
    let currentParams = params;
    let lastResponse: SkillResponse | null = null;
    for (const step of this.steps) {
      lastResponse = await step.execute(currentParams, context);
      if (lastResponse.type === 'error' || lastResponse.type === 'empty') return lastResponse;
      currentParams = { ...currentParams, _prevResult: lastResponse.content };
    }
    return lastResponse!;
  }
}
```

## AgentContext

```typescript
interface AgentContext {
  userId: string;
  sessionId: string;
  platform: string;            // 'weapp' | 'h5' | 'web' | 'api'
  history: IntentResult[];     // 最近 N 条意图（结构化追踪，非 LLM 记忆）
  extras: Record<string, any>;
}
```

## 后端集成

### Go 目录结构

```
server/app/agent/
├── handler/chat.go          # POST /api/agent/chat
├── service/
│   ├── classifier.go        # LLM-Native 分类器
│   ├── router.go            # 技能路由
│   └── executor.go          # CREX 编排
├── skill/                   # 技能实现
└── eval/                    # 评估测试
```

### API

```go
type ChatRequest struct {
    Message   string `json:"message" binding:"required"`
    SessionID string `json:"sessionId"`
}
type ChatResponse = model.SkillResponse
```

完整的 Go / TypeScript 实现模板见 `skill-templates.md`。
