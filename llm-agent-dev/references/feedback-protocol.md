# 反馈协议规格 (Feedback Protocol Specification)

> Agent 与前端之间的结构化响应协议，定义所有交互契约

## SkillResponse 协议

```typescript
interface SkillResponse {
  /**
   * 内容类型，决定前端渲染组件
   * text:  纯文本回复
   * list:  列表（订单/商品/课程等）
   * card:  详情卡片（单个实体）
   * form:  表单（需用户补充信息）
   * empty: 空状态（无结果 + 引导）
   * error: 错误状态（异常 + 重试）
   */
  type: 'text' | 'list' | 'card' | 'form' | 'empty' | 'error';

  /**
   * 主体内容，类型随 type 变化:
   * text/empty/error → string
   * list → ListItem[]
   * card → CardData
   * form → FormSchema
   */
  content: string | ListItem[] | CardData | FormSchema;

  /** 操作按钮，最多 3 个。最重要的操作放第一个 */
  actions: ActionButton[];

  /** 跟随提示，引导下一轮对话。null = 本轮可自然结束 */
  followUp: string | null;

  /** 元数据，用于调试和埋点 */
  meta?: ResponseMeta;
}
```

## 子类型定义

```typescript
interface ActionButton {
  label: string;               // "查看订单"
  action: 'navigate' | 'copy' | 'call' | 'confirm' | 'submit';
  target: string;              // URL / 内容 / 电话号码
}

interface ListItem {
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  statusColor?: 'green' | 'orange' | 'red' | 'gray';
  imageUrl?: string;
  extra?: Record<string, string>;
}

interface CardData {
  title: string;
  imageUrl?: string;
  fields: { label: string; value: string }[];
  description?: string;
  tags?: string[];
}

interface FormSchema {
  title: string;
  description?: string;
  fields: FormField[];
  submitLabel: string;
  submitIntent: string;        // 提交后触发的意图
}

interface FormField {
  name: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'radio';
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  validation?: { pattern?: string; message?: string };
}

interface ResponseMeta {
  intent: string;
  confidence: number;
  latencyMs: number;
  skillId: string;
}
```

---

## 内容类型示例

### Text

```json
{
  "type": "text",
  "content": "您的订单已成功提交，预计 30 分钟内确认",
  "actions": [{ "label": "查看订单", "action": "navigate", "target": "/orders/123" }],
  "followUp": null
}
```

### List

```json
{
  "type": "list",
  "content": [
    { "id": "o1", "title": "精修写真套餐", "status": "待确认", "statusColor": "orange" },
    { "id": "o2", "title": "证件照", "status": "已完成", "statusColor": "green" }
  ],
  "actions": [{ "label": "查看更多", "action": "navigate", "target": "/orders" }],
  "followUp": "您可以说订单号来查看详情"
}
```

### Card

```json
{
  "type": "card",
  "content": {
    "title": "精修写真套餐",
    "fields": [{ "label": "价格", "value": "¥1,299" }, { "label": "时长", "value": "2小时" }],
    "tags": ["热门", "好评"]
  },
  "actions": [{ "label": "立即预约", "action": "confirm", "target": "booking.create" }],
  "followUp": "您想预约这个套餐吗？"
}
```

### Form

```json
{
  "type": "form",
  "content": {
    "title": "预约信息",
    "fields": [
      { "name": "date", "type": "date", "label": "预约日期", "required": true },
      { "name": "time", "type": "select", "label": "时段", "options": [
        { "label": "上午 9:00-12:00", "value": "morning" },
        { "label": "下午 14:00-17:00", "value": "afternoon" }
      ]}
    ],
    "submitLabel": "确认预约",
    "submitIntent": "booking.create"
  },
  "actions": [],
  "followUp": null
}
```

### Empty & Error

```json
{ "type": "empty", "content": "未找到相关订单",
  "actions": [{ "label": "联系客服", "action": "call", "target": "400-123-4567" }],
  "followUp": "您可以换个关键词再试试" }

{ "type": "error", "content": "系统繁忙，请稍后再试",
  "actions": [{ "label": "重试", "action": "confirm", "target": "retry" }],
  "followUp": null }
```

---

## 前端渲染契约

### 组件映射

| Response Type | 组件名 | 渲染逻辑 |
|--------------|--------|---------|
| text | `AgentTextBubble` | 渲染 Markdown 文本 |
| list | `AgentListCard` | 遍历 items 渲染列表 |
| card | `AgentDetailCard` | 渲染字段 + 标签 + 图片 |
| form | `AgentForm` | 渲染表单 + 验证 + 提交 |
| empty | `AgentEmptyState` | 渲染空状态插画 + 引导 |
| error | `AgentErrorState` | 渲染错误信息 + 重试 |

### 渲染器入口

```typescript
// 根据 type 动态选择组件
function renderAgentMessage(response: SkillResponse) {
  const componentMap = {
    text: AgentTextBubble,
    list: AgentListCard,
    card: AgentDetailCard,
    form: AgentForm,
    empty: AgentEmptyState,
    error: AgentErrorState,
  };
  return componentMap[response.type];
}
```

### Action 处理

```typescript
function handleAction(button: ActionButton) {
  switch (button.action) {
    case 'navigate': router.push(button.target); break;
    case 'copy':     clipboard.write(button.target); toast('已复制'); break;
    case 'call':     window.open(`tel:${button.target}`); break;
    case 'confirm':  sendToAgent(button.target); break;
    case 'submit':   submitForm(button.target); break;
  }
}
```

---

## 错误处理与降级

```
技能执行失败
  → 返回 error 类型 + 通用错误信息（不暴露技术细节）

意图分类全部未命中
  → 返回 text + 通用回复 + followUp 引导重新表达

后端服务不可用
  → 前端本地兜底: 展示预缓存的 FAQ 列表
```

---

## 性能预算

```
意图分类:   50ms  (缓存命中)  / 200ms  (规则短路)  / 500ms (LLM)
技能路由:   1ms   (Map lookup)
技能执行:   500ms (含数据库查询)
网络传输:   200ms (客户端 → 后端 → 客户端)
前端渲染:   100ms (组件挂载 + 数据绑定)
```

P95 总预算: **≤ 2000ms**。LLM 调用是主要瓶颈，通过缓存和规则短路覆盖高频意图。
