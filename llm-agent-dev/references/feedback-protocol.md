# 反馈协议完整规格 (Feedback Protocol Specification)

> SkillResponse 协议详细规格、前端渲染组件设计指南、响应式交互模式

## 目录

1. [协议规格](#协议规格)
2. [内容类型详解](#内容类型详解)
3. [前端渲染组件](#前端渲染组件)
4. [交互模式](#交互模式)
5. [错误处理与降级](#错误处理与降级)
6. [性能优化](#性能优化)

---

## 协议规格

### SkillResponse 完整类型定义

```typescript
interface SkillResponse {
  /**
   * 内容类型，决定前端使用哪个渲染组件
   * text:  纯文本回复
   * list:  列表（订单/商品/课程等）
   * card:  详情卡片（单个实体的详细信息）
   * form:  表单（需要用户补充信息时）
   * empty: 空状态（无结果，附带引导）
   * error: 错误状态（系统异常，附带重试）
   */
  type: 'text' | 'list' | 'card' | 'form' | 'empty' | 'error';

  /**
   * 主体内容，类型随 type 变化:
   * text  → string
   * list  → ListItem[]
   * card  → CardData
   * form  → FormSchema
   * empty → string (提示文案)
   * error → string (错误描述)
   */
  content: string | ListItem[] | CardData | FormSchema;

  /**
   * 操作按钮，最多 3 个
   * 设计原则: 减少用户决策负担，最重要的操作放第一个
   */
  actions: ActionButton[];

  /**
   * 跟随提示，引导下一轮对话
   * null 表示本轮对话可以自然结束
   * 非 null 时前端可作为 placeholder 显示在输入框中
   */
  followUp: string | null;

  /** 元数据，仅用于调试和埋点 */
  meta?: ResponseMeta;
}
```

### 子类型定义

```typescript
interface ListItem {
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  statusColor?: 'green' | 'orange' | 'red' | 'gray';
  imageUrl?: string;
  extra?: Record<string, string>; // 键值对额外信息
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
  submitIntent: string; // 提交后触发的意图
}

interface FormField {
  name: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'radio';
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[]; // for select/radio
  validation?: {
    pattern?: string;
    message?: string;
    min?: number;
    max?: number;
  };
}

interface ActionButton {
  /** 按钮文案，建议 2-6 个字 */
  label: string;
  
  /**
   * 操作类型:
   * navigate → 跳转页面 (target = 页面路径)
   * copy     → 复制文本 (target = 要复制的内容)
   * call     → 拨打电话 (target = 电话号码)
   * confirm  → 确认操作 (target = 操作 ID)
   * retry    → 重试上一次操作 (target = 原始输入)
   */
  action: 'navigate' | 'copy' | 'call' | 'confirm' | 'retry';
  target: string;
}

interface ResponseMeta {
  intent: string;
  confidence: number;
  latencyMs: number;
  skillId: string;
}
```

---

## 内容类型详解

### Text — 纯文本

最简单的响应类型，适用于 FAQ、简短回复、系统通知。

```json
{
  "type": "text",
  "content": "您的订单已成功提交，预计 30 分钟内确认",
  "actions": [
    { "label": "查看订单", "action": "navigate", "target": "/pages/orders/detail?id=123" }
  ],
  "followUp": null
}
```

### List — 列表

适用于展示多条记录（订单列表、商品搜索结果等）。

```json
{
  "type": "list",
  "content": [
    {
      "id": "order-001",
      "title": "精修写真套餐",
      "subtitle": "2026-03-15 14:00",
      "status": "待确认",
      "statusColor": "orange",
      "imageUrl": "/images/packages/portrait.jpg"
    },
    {
      "id": "order-002",
      "title": "情侣摄影套餐",
      "subtitle": "2026-03-20 10:00",
      "status": "已确认",
      "statusColor": "green"
    }
  ],
  "actions": [
    { "label": "查看更多", "action": "navigate", "target": "/pages/orders/list" }
  ],
  "followUp": "您可以说订单号来查看详情"
}
```

### Card — 详情卡片

适用于展示单个实体的详细信息。

```json
{
  "type": "card",
  "content": {
    "title": "精修写真套餐",
    "imageUrl": "/images/packages/portrait.jpg",
    "fields": [
      { "label": "价格", "value": "¥1,299" },
      { "label": "时长", "value": "2 小时" },
      { "label": "包含", "value": "30 张精修照片" },
      { "label": "可用时间", "value": "周一至周五 9:00-18:00" }
    ],
    "tags": ["热门", "限时优惠"],
    "description": "专业影棚拍摄，含妆造服务"
  },
  "actions": [
    { "label": "立即预约", "action": "navigate", "target": "/pages/booking/create?packageId=pkg-001" },
    { "label": "分享给朋友", "action": "copy", "target": "https://mini.app/pkg/001" }
  ],
  "followUp": "您想预约这个套餐吗？"
}
```

### Form — 表单收集

当技能需要更多信息才能执行时，返回表单让用户补充。

```json
{
  "type": "form",
  "content": {
    "title": "预约信息",
    "description": "请填写以下信息完成预约",
    "fields": [
      {
        "name": "date",
        "type": "date",
        "label": "预约日期",
        "required": true
      },
      {
        "name": "timeSlot",
        "type": "select",
        "label": "时间段",
        "required": true,
        "options": [
          { "label": "上午 9:00-12:00", "value": "morning" },
          { "label": "下午 13:00-17:00", "value": "afternoon" }
        ]
      },
      {
        "name": "notes",
        "type": "textarea",
        "label": "备注",
        "placeholder": "如有特殊需求请在此说明"
      }
    ],
    "submitLabel": "确认预约",
    "submitIntent": "booking.create"
  },
  "actions": [],
  "followUp": null
}
```

表单提交后，前端将表单数据作为参数直接发送到 agent/chat：

```json
{
  "message": "__form_submit__",
  "sessionId": "sess-123",
  "formData": {
    "intent": "booking.create",
    "date": "2026-03-20",
    "timeSlot": "afternoon",
    "notes": ""
  }
}
```

### Empty — 空状态

查无结果时的友好提示。

```json
{
  "type": "empty",
  "content": "未找到相关订单",
  "actions": [
    { "label": "查看全部订单", "action": "navigate", "target": "/pages/orders/list" },
    { "label": "联系客服", "action": "call", "target": "400-123-4567" }
  ],
  "followUp": "您可以提供订单号让我精确查找"
}
```

### Error — 错误状态

```json
{
  "type": "error",
  "content": "系统繁忙，请稍后再试",
  "actions": [
    { "label": "重试", "action": "retry", "target": "查一下我的订单" }
  ],
  "followUp": null
}
```

---

## 前端渲染组件

### 组件映射表

| Response Type | Taro + Vue 组件 | 原生小程序组件 |
|--------------|----------------|---------------|
| text | `<AgentTextBubble>` | `agent-text-bubble` |
| list | `<AgentListCard>` | `agent-list-card` |
| card | `<AgentDetailCard>` | `agent-detail-card` |
| form | `<AgentForm>` | `agent-form` |
| empty | `<AgentEmptyState>` | `agent-empty-state` |
| error | `<AgentErrorState>` | `agent-error-state` |

### 渲染器入口（Taro + Vue）

```vue
<!-- components/AgentMessage.vue -->
<script setup lang="ts">
import type { SkillResponse } from '@/types/agent';

const props = defineProps<{
  response: SkillResponse;
}>();

const emit = defineEmits<{
  action: [button: ActionButton];
}>();
</script>

<template>
  <view class="agent-message">
    <!-- 根据 type 动态渲染 -->
    <AgentTextBubble v-if="response.type === 'text'" :content="response.content" />
    <AgentListCard v-else-if="response.type === 'list'" :items="response.content" />
    <AgentDetailCard v-else-if="response.type === 'card'" :data="response.content" />
    <AgentForm v-else-if="response.type === 'form'" :schema="response.content" />
    <AgentEmptyState v-else-if="response.type === 'empty'" :message="response.content" />
    <AgentErrorState v-else-if="response.type === 'error'" :message="response.content" />

    <!-- 操作按钮（统一渲染） -->
    <view v-if="response.actions?.length" class="agent-actions">
      <view
        v-for="(btn, i) in response.actions"
        :key="i"
        class="agent-action-btn"
        @tap="emit('action', btn)"
      >
        {{ btn.label }}
      </view>
    </view>

    <!-- 跟随提示 -->
    <view v-if="response.followUp" class="agent-followup">
      {{ response.followUp }}
    </view>
  </view>
</template>
```

### 操作处理器

```typescript
// composables/useAgentAction.ts

import Taro from '@tarojs/taro';

export function useAgentAction() {
  function handleAction(button: ActionButton) {
    switch (button.action) {
      case 'navigate':
        Taro.navigateTo({ url: button.target });
        break;

      case 'copy':
        Taro.setClipboardData({ data: button.target });
        break;

      case 'call':
        Taro.makePhoneCall({ phoneNumber: button.target });
        break;

      case 'confirm':
        // 发送确认请求到 agent
        sendMessage(`__confirm__:${button.target}`);
        break;

      case 'retry':
        // 重新发送原始消息
        sendMessage(button.target);
        break;
    }
  }

  return { handleAction };
}
```

---

## 交互模式

### 快捷回复 (Quick Replies)

当 `followUp` 非 null 时，前端可展示快捷回复按钮：

```typescript
// 从 followUp 中提取可能的快捷回复
function extractQuickReplies(followUp: string): string[] {
  // 模式1: "您可以试试：A、B、C"
  const match = followUp.match(/(?:试试|可以)[：:]\s*(.+)/);
  if (match) {
    return match[1].split(/[、,，]/).map(s => s.trim());
  }
  // 模式2: 直接作为 placeholder
  return [];
}
```

### 对话历史展示

```typescript
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;          // user 消息的原始文本
  response?: SkillResponse; // assistant 消息的结构化响应
  timestamp: number;
}
```

用户消息渲染为文本气泡，助手消息通过 `AgentMessage` 组件渲染。

### Loading 状态

```vue
<!-- 骨架屏 loading，而非全屏 spinner -->
<view v-if="isLoading" class="agent-loading">
  <view class="skeleton-bubble">
    <view class="skeleton-line" style="width: 60%"></view>
    <view class="skeleton-line" style="width: 80%"></view>
    <view class="skeleton-line" style="width: 40%"></view>
  </view>
</view>
```

---

## 错误处理与降级

### 前端错误处理

```typescript
// 网络错误 → 显示 error 类型响应
// 超时 → 显示 error + retry 按钮
// 解析错误 → 显示通用错误信息

async function safeSendMessage(message: string): Promise<SkillResponse> {
  try {
    const response = await api.chat({ message, sessionId });
    return response;
  } catch (e: unknown) {
    const errorMessage = e instanceof Error && e.message.includes('timeout')
      ? '请求超时，请稍后重试'
      : '网络异常，请检查网络连接';

    return {
      type: 'error',
      content: errorMessage,
      actions: [{ label: '重试', action: 'retry', target: message }],
      followUp: null,
    };
  }
}
```

### 后端降级策略

```
技能执行失败
  → 记录日志 + 返回 error 类型响应
  → 不暴露技术细节给用户

意图分类器全部未命中
  → 返回 text 类型 + 预设的通用回复
  → followUp 引导用户重新表达

后端服务不可用
  → 前端本地兜底：展示预缓存的 FAQ 列表
```

---

## 性能优化

### 前端优化

1. **消息虚拟列表**: 对话超过 50 条时使用虚拟滚动
2. **响应预缓存**: 高频意图的响应缓存在本地 Storage (TTL 5min)
3. **骨架屏**: 使用 CSS 骨架屏而非 loading spinner，减少感知延迟
4. **图片懒加载**: List/Card 中的图片使用 lazy-load

### 后端优化

1. **意图规则编译**: 正则表达式在启动时编译，运行时直接匹配
2. **Session 缓存**: AgentContext 缓存在 Redis，避免每次重建
3. **技能结果缓存**: FAQ 等不变内容的响应缓存 5-30 分钟
4. **连接池复用**: 数据库查询使用连接池，避免每次创建连接

### 延迟预算分配

```
总预算: ≤ 2000ms (P95)

意图分类:   50ms  (Layer 1)  / 200ms  (Layer 2)  / 1500ms (Layer 3)
技能路由:   1ms   (Map lookup)
技能执行:   500ms (含数据库查询)
网络传输:   200ms (小程序 → 后端 → 小程序)
前端渲染:   100ms (组件挂载 + 数据绑定)
```

Layer 3 (LLM) 的 1500ms 会导致总延迟接近 2s 上限，所以要尽量通过 Layer 1/2 覆盖高频意图。
