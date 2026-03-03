# 场景蓝图: 电商购物 Agent

> 从商品咨询到下单支付的全流程 Agent 架构
> 参考: 通义千问 × 淘宝闪购、ACT 协议

## 用户旅程

```
发现 → 咨询 → 比较 → 下单 → 支付 → 跟踪 → 售后
```

## 架构

```
用户输入
   │
   ▼
[意图分类 LLM] ──────────────────────────────────────
   │                                                  │
   ├─ 商品搜索 ──→ ① CREX → 商品搜索 API             │
   ├─ 价格咨询 ──→ ① CREX → 商品详情 API             │
   ├─ 商品推荐 ──→ ③ FC → 推荐引擎 + LLM 理由生成    │
   ├─ 商品比较 ──→ ⑤ ReAct → 多维度分析              │
   ├─ 下单购买 ──→ ② Slot → 收集地址/规格 → ④ WF    │
   ├─ 文案生成 ──→ ③ FC → LLM 内容生成               │
   ├─ 订单查询 ──→ ① CREX → 订单 API                 │
   ├─ 退款售后 ──→ ④ Workflow → 审批流                │
   └─ 复杂问题 ──→ ⑧ Handoff → 人工客服              │
                                                      │
[MCP Layer] ← 商品/订单/支付/物流/CRM MCP Servers ────┘
```

## 模式选型

| 场景 | 模式 | 延迟目标 | 说明 |
|------|------|---------|------|
| 商品搜索/FAQ | ① CREX | < 500ms | 固定意图 + API 查询 |
| 价格/库存查询 | ① CREX | < 1s | 确定性数据查询 |
| 智能推荐 | ③ FC + LLM | < 2s | 推荐引擎 + LLM 生成理由 |
| 多商品比较 | ⑤ ReAct | 3-10s | 多维度分析，异步返回 |
| 下单 | ② Slot → ④ WF | < 2s/轮 | 收集信息 → 创建订单 → 支付 |
| 商品文案 | ③ FC | 2-5s | LLM 生成，工具获取商品数据 |
| 营销文案 | ⑤ ReAct | 5-15s | 多步骤：分析竞品 → 生成 → 优化 |
| 退款/售后 | ④ Workflow | 1-5s | 条件检查 → 审批 → 执行 |
| 投诉/复杂问题 | ⑧ Handoff | 即时 | 升级到人工 |

## "一句话下单"全流程

```
用户: "买一箱农夫山泉送到公司"

Step 1 — 意图分类 (LLM, 200ms)
  → intent: order.create
  → params: { product: "农夫山泉", quantity: "一箱", address_hint: "公司" }

Step 2 — Slot 检查
  → product: "农夫山泉" ✓ (搜索匹配到 SKU)
  → quantity: "一箱" ✓ (归一化: 24瓶)
  → address: "公司" → 从用户地址簿匹配 ✓
  → payment: null → 使用默认支付方式 ✓
  → 所有 slot 已填充

Step 3 — Workflow 执行
  → 检查库存 ✓
  → 计算运费 ✓
  → 应用优惠券（自动选择最优）
  → 生成订单预览

Step 4 — 确认
  → Response: {
      type: "card",
      content: { product: "农夫山泉 550ml×24", price: "¥29.9", shipping: "免运费" },
      actions: [
        { label: "确认下单", action: "confirm", target: "order_confirm" },
        { label: "修改地址", action: "navigate", target: "/address" }
      ]
    }

Step 5 — 用户确认 → 支付
  → Handoff to 支付 Agent (支付宝/微信支付)
  → 返回支付结果
```

## 商品咨询与文案生成

### 商品咨询 (CREX + FC)
```
用户: "这款相机支持4K吗？电池续航怎样？"

→ Intent: product.consult
→ FC: query_product_specs(productId, fields=["video", "battery"])
→ LLM: 基于规格数据生成自然语言回答
→ Response: "支持4K 60fps录制，电池续航约2小时连续录制..."
```

### 文案生成 (FC + LLM)
```
用户: "帮我给这款产品写一段小红书种草文案"

→ Intent: content.generate
→ FC: get_product_details(productId) → 获取商品信息
→ FC: get_competitor_content(category) → 竞品文案参考
→ LLM: 基于商品信息 + 竞品分析生成文案
→ Response: { type: "text", content: "🌟 姐妹们！这款..." }
```

## MCP 集成

```
商品 MCP Server → search_products, get_details, get_reviews
订单 MCP Server → create_order, query_order, cancel_order
支付 MCP Server → create_payment, query_payment, apply_coupon
物流 MCP Server → query_logistics, estimate_delivery
CRM  MCP Server → get_user_profile, get_address_book, get_preferences
```
