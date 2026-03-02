# 场景蓝图: 点餐/外卖 Agent

> 从选餐到支付取餐的全流程 Agent 架构
> 参考: 通义千问 × 饿了么、肯德基 AI 点餐 Agent "小K"

## 用户旅程

```
"想吃什么" → 餐厅推荐 → 菜品选择 → 定制 → 下单 → 支付 → 配送跟踪
```

## 架构

```
用户输入（文字/语音）
   │
   ▼
[意图分类 LLM]
   │
   ├─ 推荐餐厅  ──→ ③ FC → 位置+偏好+评分 → 推荐引擎
   ├─ 浏览菜单  ──→ ① CREX → 餐厅菜单 API
   ├─ 营养咨询  ──→ ③ FC → 营养数据 + LLM 建议
   ├─ 点餐下单  ──→ ② Slot → 收集菜品/口味/地址 → ④ WF
   ├─ 订单状态  ──→ ① CREX → 配送追踪 API
   ├─ 修改/取消 ──→ ④ Workflow → 条件检查 → 执行
   └─ 投诉     ──→ ⑧ Handoff → 人工客服
```

## "一句话订外卖"

```
用户: "帮我点个黄焖鸡，送到公司"

Step 1 — 意图分类 (200ms)
  → intent: food.order
  → params: { dish: "黄焖鸡", address_hint: "公司" }

Step 2 — Slot 填充 + 智能补全
  → dish: "黄焖鸡" → 搜索附近餐厅匹配 → 找到 3 家
  → restaurant: null → 自动选择评分最高+距离最近
  → spice_level: null → 查用户历史偏好 → "中辣"
  → address: "公司" → 匹配地址簿 → "XX路XX号"
  → 缺失 slot: 无（全部智能补全）

Step 3 — 优惠计算 (Handoff to 支付 Agent)
  → 可用优惠券: 满20减5
  → 预估价格: ¥22（原价¥27）

Step 4 — 确认
  → Response: {
      type: "card",
      content: {
        restaurant: "老王黄焖鸡 (距离1.2km)",
        items: ["黄焖鸡米饭 中辣 ×1"],
        price: "¥22 (已减¥5)",
        delivery: "预计30分钟送达"
      },
      actions: [
        { label: "确认下单", action: "confirm" },
        { label: "换一家", action: "retry" },
        { label: "加菜", action: "continue" }
      ]
    }
```

## 车载语音点餐 (肯德基 "小K" 模式)

```
用户 (车载语音): "到最近的肯德基，来个汉堡套餐"

Step 1 — 语音识别 → 文字
Step 2 — 意图: food.order + nav.restaurant
Step 3 — 并行执行:
  ├─ 导航: 查找最近 KFC → 设置导航
  └─ 点餐: Slot 填充
       → menu_item: "汉堡套餐" → 匹配 "香辣鸡腿堡套餐 ¥32"
       → drink: null → 追问 "套餐饮料要可乐还是雪碧？"
       → 用户: "可乐"
       → 全部填充 → 创建订单 → 到店时取餐码已准备好

Response: "已为您导航到最近的肯德基(2.1公里)，
          香辣鸡腿堡套餐+可乐已下单，取餐码 A023"
```

## 多 Agent 协作 (ACT 协议)

```
通义千问 App Agent
   │
   ├─ MCP: 餐厅发现服务 → 搜索餐厅和菜品
   ├─ Handoff: 饿了么 Agent → 下单和配送
   ├─ Handoff: 支付宝 Agent → 优惠券选择 + 支付
   └─ 结果聚合 → 返回用户

ACT 协议确保:
  - Agent 间的信任验证
  - 数据隐私保护（地址等敏感信息加密传输）
  - 交易原子性（要么全部成功，要么全部回滚）
```
