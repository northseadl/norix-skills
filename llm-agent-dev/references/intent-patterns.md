# 意图模式与分类策略 (Intent Patterns & Classification)

> IntentSchema 设计、行业垂直意图模板、参数归一化与消歧策略

## IntentSchema 设计

LLM-Native 模式下，意图定义是**语义化注册表**，作为 System Prompt 传给 LLM:

```typescript
interface IntentSchema {
  intents: IntentDefinition[];
}

interface IntentDefinition {
  id: string;               // "booking.query"
  description: string;       // 自然语言描述（给 LLM 理解用）
  examples: string[];        // 2-5 个用户输入示例
  params: ParamDefinition[];
  priority: number;          // 消歧优先级
}

interface ParamDefinition {
  name: string;              // "orderId"
  type: 'string' | 'date' | 'number' | 'enum';
  description: string;       // "用户提到的订单号"
  required: boolean;
  enumValues?: string[];
}
```

### 设计原则

1. **description 决定质量**: LLM 靠 description 理解意图语义，务必精准
2. **examples 是正向锚点**: 提供典型用户表达，帮助 LLM 建立模式识别
3. **params 驱动结构化输出**: 明确告诉 LLM 应该提取什么参数
4. **数量控制**: 单次请求中意图 ≤ 30，超过则按领域分组路由

---

## 通用意图模板

几乎所有 Agent 系统都需要的基础意图:

```json
{
  "intents": [
    { "id": "nav.home", "description": "用户想回到首页", "examples": ["回首页", "回到主页"], "params": [] },
    { "id": "nav.page", "description": "用户想导航到特定页面", "examples": ["去订单页", "打开设置"],
      "params": [{ "name": "page", "type": "string", "description": "目标页面", "required": true }] },
    { "id": "help.faq", "description": "用户询问常见问题", "examples": ["怎么退款", "营业时间"], "params": [] },
    { "id": "help.contact", "description": "用户要联系人工客服", "examples": ["转人工", "找客服"], "params": [] },
    { "id": "user.profile", "description": "用户查看或修改个人信息", "examples": ["看看我的信息", "改手机号"],
      "params": [{ "name": "field", "type": "enum", "description": "要修改的字段", "required": false,
                   "enumValues": ["name", "phone", "avatar", "address"] }] },
    { "id": "greeting", "description": "用户打招呼或闲聊", "examples": ["你好", "在吗"], "params": [] }
  ]
}
```

---

## 行业垂直意图

### 电商/零售

| 意图 ID | 描述 | 关键参数 |
|---------|------|---------|
| `product.search` | 搜索商品 | keyword, category, priceRange |
| `cart.view` | 查看购物车 | — |
| `order.query` | 查询订单 | orderId, status |
| `order.refund` | 申请退款 | orderId, reason |

### 预约/服务

| 意图 ID | 描述 | 关键参数 |
|---------|------|---------|
| `booking.create` | 创建预约 | date, timeSlot, serviceType |
| `booking.query` | 查询预约 | bookingId |
| `booking.cancel` | 取消预约 | bookingId, reason |
| `availability.check` | 查看可用时间 | dateHint |

### 内容/教育

| 意图 ID | 描述 | 关键参数 |
|---------|------|---------|
| `content.search` | 搜索内容 | keyword, contentType |
| `course.enroll` | 报名课程 | courseId |
| `progress.check` | 查看学习进度 | courseId |

---

## 参数归一化

LLM 提取的参数需要**后处理校验和归一化**:

### 日期归一化

```typescript
function normalizeDate(raw: string): string | null {
  const relativeMap: Record<string, number> = {
    '今天': 0, '明天': 1, '后天': 2, '大后天': 3,
  };
  for (const [word, offset] of Object.entries(relativeMap)) {
    if (raw.includes(word)) {
      const d = new Date(); d.setDate(d.getDate() + offset);
      return d.toISOString().split('T')[0];
    }
  }
  // "下周三" → 计算实际日期
  const weekdayMatch = raw.match(/下周([一二三四五六日天])/);
  if (weekdayMatch) { /* 计算下周几的日期 */ }
  return null;
}
```

### 参数校验

```typescript
function validateParams(
  params: Record<string, any>,
  schema: ParamDefinition[],
): { valid: Record<string, any>; missing: string[] } {
  const valid: Record<string, any> = {};
  const missing: string[] = [];

  for (const def of schema) {
    const raw = params[def.name];
    if (raw == null && def.required) { missing.push(def.name); continue; }
    if (raw == null) continue;

    switch (def.type) {
      case 'date':   valid[def.name] = normalizeDate(String(raw)); break;
      case 'number': valid[def.name] = parseFloat(String(raw)) || null; break;
      case 'enum':   valid[def.name] = def.enumValues?.includes(raw) ? raw : null; break;
      default:       valid[def.name] = raw;
    }
  }
  return { valid, missing };
}
```

---

## 规则短路模式

规则在 LLM-Native 体系中是**高频精确匹配的缓存加速层**，非主力分类器。

### 适用条件

1. **极高频**: 占总请求量 > 10%
2. **无歧义**: 输入模式唯一映射到该意图
3. **数量 ≤ 20 条**: 超过说明在重复造 LLM 的轮子

```typescript
const SHORTCUTS: ShortcutRule[] = [
  { intent: 'order.query',   pattern: /^查?订单/ },
  { intent: 'booking.query', pattern: /^我的预约/ },
  { intent: 'help.contact',  pattern: /^转?人工/ },
  { intent: 'nav.home',      pattern: /^回?首页/ },
];
```

---

## 多意图消歧

用户输入可能包含多个意图: "查一下订单，顺便推荐点新品"

### System Prompt 消歧指令

```
当用户输入包含多个意图时：
1. 选择最主要的意图作为 intent
2. 将次要意图放入 params._pendingIntents 数组
3. 判断标准：动作词最先出现的为主意图
```

LLM 输出:
```json
{ "intent": "order.query", "params": { "_pendingIntents": ["product.recommend"] } }
```

主意图执行完毕后通过 `followUp` 引导进入次要意图:
```typescript
if (params._pendingIntents?.length) {
  response.followUp = `还需要我帮您${describeIntent(params._pendingIntents[0])}吗？`;
}
```
