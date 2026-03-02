# 意图模式集与分类策略 (Intent Patterns & Classification)

> LLM-Native 意图体系下的意图定义、参数提取、规则短路和消歧策略

## 目录

1. [IntentSchema 设计](#intentschema-设计)
2. [通用意图模板](#通用意图模板)
3. [行业垂直意图](#行业垂直意图)
4. [参数提取器](#参数提取器)
5. [规则短路模式](#规则短路模式)
6. [多意图消歧](#多意图消歧)
7. [意图配置化管理](#意图配置化管理)

---

## IntentSchema 设计

LLM-Native 模式下，意图定义不再是正则表达式，而是**语义化的意图注册表**，
作为 System Prompt 的一部分传给轻量 LLM。

### 核心结构

```typescript
interface IntentSchema {
  intents: IntentDefinition[];
}

interface IntentDefinition {
  id: string;               // 意图唯一标识: "booking.query"
  description: string;       // 自然语言描述（给 LLM 理解用）
  examples: string[];        // 2-5 个用户输入示例
  params: ParamDefinition[]; // 需要 LLM 提取的参数
  priority: number;          // 消歧优先级（越高越优先）
}

interface ParamDefinition {
  name: string;              // 参数名: "orderId"
  type: 'string' | 'date' | 'number' | 'enum';
  description: string;       // 给 LLM 的描述: "用户提到的订单号"
  required: boolean;
  enumValues?: string[];     // type=enum 时的可选值
}
```

### 设计原则

1. **description 决定质量**: LLM 靠 description 理解意图语义，务必精准
2. **examples 是正向锚点**: 提供典型用户表达，帮助 LLM 建立模式识别
3. **params 驱动结构化输出**: 明确告诉 LLM 应该提取什么参数
4. **数量控制**: 单次请求中意图数量建议 ≤ 30，超过则按领域分组路由

---

## 通用意图模板

几乎所有小程序助手都需要的基础意图：

```json
{
  "intents": [
    {
      "id": "nav.home",
      "description": "用户想回到首页或主页",
      "examples": ["回首页", "回到主页", "回到开始"],
      "params": [],
      "priority": 1
    },
    {
      "id": "nav.page",
      "description": "用户想跳转到某个具体页面",
      "examples": ["打开订单页", "去个人中心", "跳转到设置"],
      "params": [
        { "name": "targetPage", "type": "string", "description": "目标页面名称", "required": true }
      ],
      "priority": 1
    },
    {
      "id": "help.general",
      "description": "用户请求帮助或功能说明",
      "examples": ["帮助", "怎么用", "使用说明", "有什么功能"],
      "params": [],
      "priority": 0
    },
    {
      "id": "help.contact",
      "description": "用户想联系人工客服或转人工",
      "examples": ["联系客服", "转人工", "我要投诉"],
      "params": [],
      "priority": 10
    },
    {
      "id": "user.profile",
      "description": "用户查看或修改个人信息",
      "examples": ["我的信息", "修改名字", "改电话号码"],
      "params": [
        { "name": "field", "type": "enum", "description": "要修改的字段",
          "required": false, "enumValues": ["name", "phone", "avatar", "address"] }
      ],
      "priority": 1
    },
    {
      "id": "greeting",
      "description": "用户打招呼或闲聊",
      "examples": ["你好", "在吗", "嗨"],
      "params": [],
      "priority": 0
    }
  ]
}
```

---

## 行业垂直意图

### 电商/零售

```json
[
  {
    "id": "product.search",
    "description": "用户搜索商品或查找特定产品",
    "examples": ["搜一下耳机", "有没有红色裙子", "找个便宜的手机壳"],
    "params": [
      { "name": "keyword", "type": "string", "description": "搜索关键词", "required": true },
      { "name": "priceRange", "type": "string", "description": "价格范围如'100以下'", "required": false }
    ]
  },
  {
    "id": "product.price",
    "description": "用户询问某商品或服务的价格",
    "examples": ["这个多少钱", "精修套餐价格", "怎么收费"],
    "params": [
      { "name": "productHint", "type": "string", "description": "商品或服务名称", "required": false }
    ]
  },
  {
    "id": "product.recommend",
    "description": "用户请求商品推荐",
    "examples": ["有什么推荐", "哪个套餐好", "帮我选一个"],
    "params": [
      { "name": "category", "type": "string", "description": "偏好品类", "required": false },
      { "name": "budget", "type": "string", "description": "预算", "required": false }
    ]
  },
  {
    "id": "cart.view",
    "description": "用户查看购物车",
    "examples": ["看看购物车", "我加了什么", "待结算"],
    "params": []
  },
  {
    "id": "order.query",
    "description": "用户查询订单状态或物流信息",
    "examples": ["我的订单", "订单号ABC123状态", "发货了没", "查物流"],
    "params": [
      { "name": "orderId", "type": "string", "description": "订单号", "required": false },
      { "name": "queryType", "type": "enum", "description": "查询类型",
        "required": false, "enumValues": ["status", "logistics"] }
    ]
  },
  {
    "id": "order.refund",
    "description": "用户申请退款、退货或售后",
    "examples": ["退款", "退货", "不想要了", "质量有问题"],
    "params": [
      { "name": "orderId", "type": "string", "description": "订单号", "required": false },
      { "name": "reason", "type": "enum", "description": "退款原因",
        "required": false, "enumValues": ["quality", "no_need", "wrong_item", "other"] }
    ]
  }
]
```

### 预约/服务类

```json
[
  {
    "id": "booking.create",
    "description": "用户想创建新预约",
    "examples": ["我想预约拍照", "约个时间", "可以预约下周三吗"],
    "params": [
      { "name": "serviceHint", "type": "string", "description": "服务类型", "required": false },
      { "name": "dateHint", "type": "string", "description": "日期信息", "required": false }
    ]
  },
  {
    "id": "booking.query",
    "description": "用户查询已有预约",
    "examples": ["我的预约", "查一下预约", "预约状态"],
    "params": []
  },
  {
    "id": "booking.cancel",
    "description": "用户取消或改期预约",
    "examples": ["取消预约", "不去了", "改个时间"],
    "params": [
      { "name": "action", "type": "enum", "description": "操作类型",
        "required": true, "enumValues": ["cancel", "reschedule"] }
    ]
  },
  {
    "id": "booking.available",
    "description": "用户查询可预约的时间段",
    "examples": ["什么时候有空", "还有位置吗", "看看时间表"],
    "params": [
      { "name": "dateHint", "type": "string", "description": "日期信息", "required": false }
    ]
  }
]
```

### 内容/教育类

```json
[
  {
    "id": "content.search",
    "description": "用户搜索文章、课程或教程",
    "examples": ["搜一下摄影教程", "有没有修图课程", "怎么学PS"],
    "params": [
      { "name": "keyword", "type": "string", "description": "搜索关键词", "required": true }
    ]
  },
  {
    "id": "content.recommend",
    "description": "用户请求内容推荐",
    "examples": ["推荐点课程", "有什么好文章", "最新的教程"],
    "params": [
      { "name": "category", "type": "string", "description": "内容类别", "required": false }
    ]
  },
  {
    "id": "content.progress",
    "description": "用户查看学习进度",
    "examples": ["学习进度", "学到哪了", "继续学"],
    "params": []
  }
]
```

---

## 参数提取器

LLM-Native 模式下参数主要由 LLM 从自然语言中提取。
以下提取器用于**后处理校验和归一化** LLM 输出的参数值。

### 日期归一化

```typescript
// 将 LLM 提取的非标准日期归一化为 ISO 格式
function normalizeDate(raw: string): string | null {
  // 相对日期
  const relativeMap: Record<string, number> = {
    '今天': 0, '明天': 1, '后天': 2, '大后天': 3
  };
  for (const [word, offset] of Object.entries(relativeMap)) {
    if (raw.includes(word)) {
      const d = new Date(); d.setDate(d.getDate() + offset);
      return d.toISOString().split('T')[0];
    }
  }

  // 星期
  const weekMatch = raw.match(/周([一二三四五六日天])/);
  if (weekMatch) {
    const map: Record<string, number> = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':0,'天':0 };
    const target = map[weekMatch[1]];
    const today = new Date();
    const diff = (target - today.getDay() + 7) % 7 || 7;
    today.setDate(today.getDate() + diff);
    return today.toISOString().split('T')[0];
  }

  // 绝对日期 (X月X日, X/X)
  const absMatch = raw.match(/(\d{1,2})[月/\-.·](\d{1,2})[日号]?/);
  if (absMatch) {
    const y = new Date().getFullYear();
    return `${y}-${absMatch[1].padStart(2, '0')}-${absMatch[2].padStart(2, '0')}`;
  }

  return null;
}
```

### 数量归一化

```typescript
function normalizeQuantity(raw: string): number | null {
  const cnMap: Record<string, number> = {
    '一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10
  };
  const cnMatch = raw.match(/([一二两三四五六七八九十]+)\s*[个位份张]/);
  if (cnMatch) return cnMap[cnMatch[1]] ?? null;

  const numMatch = raw.match(/(\d+)\s*[个位份张]?/);
  if (numMatch) return parseInt(numMatch[1], 10);

  return null;
}
```

### 参数校验流水线

```typescript
// LLM 提取参数 → 归一化 → 校验 → 最终参数
function processParams(
  rawParams: Record<string, any>,
  paramDefs: ParamDefinition[]
): { valid: Record<string, any>; missing: string[] } {
  const valid: Record<string, any> = {};
  const missing: string[] = [];

  for (const def of paramDefs) {
    const raw = rawParams[def.name];
    if (raw == null || raw === '') {
      if (def.required) missing.push(def.name);
      continue;
    }

    // 类型归一化
    switch (def.type) {
      case 'date': valid[def.name] = normalizeDate(String(raw)) ?? raw; break;
      case 'number': valid[def.name] = normalizeQuantity(String(raw)) ?? raw; break;
      case 'enum':
        valid[def.name] = def.enumValues?.includes(raw) ? raw : null;
        if (!valid[def.name] && def.required) missing.push(def.name);
        break;
      default: valid[def.name] = raw;
    }
  }

  return { valid, missing };
}
```

---

## 规则短路模式

在 LLM-Native 体系中，规则的角色是**高频精确匹配的缓存加速层**，
而非主力分类器。仅用于以下场景：

### 适用条件

1. **极高频**: 该意图占总请求量 > 10%
2. **无歧义**: 输入模式唯一映射到该意图
3. **省成本**: 每次短路省一次 LLM 调用

### 短路规则注册

```typescript
interface ShortcutRule {
  intent: string;
  pattern: RegExp;
  extractor?: (input: string) => Record<string, any>;
}

const SHORTCUTS: ShortcutRule[] = [
  // 仅保留最高频、最确定的匹配  
  { intent: 'order.query', pattern: /^查?订单/ },
  { intent: 'booking.query', pattern: /^我的预约/ },
  { intent: 'help.contact', pattern: /^转?人工/ },
  { intent: 'nav.home', pattern: /^回?首页/ },
  { intent: 'cart.view', pattern: /^购物车/ },
];

function shortcutMatch(input: string): IntentResult | null {
  for (const rule of SHORTCUTS) {
    if (rule.pattern.test(input)) {
      return {
        intent: rule.intent,
        confidence: 1.0,
        params: rule.extractor?.(input) ?? {},
        rawInput: input,
      };
    }
  }
  return null;
}
```

**关键**: 短路规则数量建议 ≤ 20 条。超过 20 条说明在重复造 LLM 的轮子。

---

## 多意图消歧

### 场景

用户输入可能包含多个意图："帮我查一下订单，顺便推荐点新品"

### LLM 消歧方案

在 System Prompt 中增加消歧指令：

```
当用户输入包含多个意图时：
1. 选择最主要的意图作为 intent
2. 将次要意图放入 params._pendingIntents 数组
3. 判断标准：动作词最先出现的为主意图
```

LLM 输出示例：
```json
{
  "intent": "order.query",
  "confidence": 0.9,
  "params": {
    "_pendingIntents": ["product.recommend"]
  }
}
```

### 前端处理

主意图执行完毕后，通过 `followUp` 引导用户进入次要意图：

```typescript
// 后端在 SkillResponse 中拼接 followUp
if (params._pendingIntents?.length) {
  response.followUp = `还需要我帮您${describeIntent(params._pendingIntents[0])}吗？`;
}
```

---

## 意图配置化管理

Phase 2+ 将意图从代码移到可配置存储，运营可编辑：

### 数据模型

```go
type IntentConfig struct {
    ID          uint   `gorm:"primaryKey"`
    IntentID    string `gorm:"uniqueIndex;not null;comment:意图标识符"`
    Description string `gorm:"not null;comment:意图描述"`
    Examples    string `gorm:"type:jsonb;comment:示例输入数组"`
    Params      string `gorm:"type:jsonb;comment:参数定义数组"`
    Priority    int    `gorm:"default:0"`
    Enabled     bool   `gorm:"default:true"`
    UpdatedAt   time.Time
}
```

### 热加载

```go
// 每 5 分钟或 Redis pub/sub 触发从数据库刷新意图配置
// 重新编译 IntentSchema 并更新 System Prompt 缓存
func (c *LLMClassifier) ReloadSchema() error {
    configs, err := c.store.ListEnabled()
    if err != nil { return err }
    c.schema.Store(buildIntentSchema(configs))
    c.promptCache.Clear() // 清理 System Prompt 缓存
    return nil
}
```
