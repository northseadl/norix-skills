# 场景蓝图: 内容/文案生成 Agent

> AI 驱动的内容创作全流程：商品文案、营销素材、社交媒体、SEO
> 覆盖: 结构化文案、创意生成、多渠道适配

## 架构

```
用户需求（文字/模板选择）
   │
   ▼
[意图分类]
   │
   ├─ 商品描述   ──→ ③ FC: 获取商品数据 → LLM 生成
   ├─ 营销文案   ──→ ⑤ ReAct: 分析 → 生成 → 优化
   ├─ 社交媒体   ──→ ③ FC: 获取素材 → LLM 适配平台
   ├─ SEO 内容   ──→ ⑤ ReAct: 关键词分析 → 生成 → 检查
   ├─ 批量生成   ──→ ④ Workflow: 并行生成 → 质量审查
   └─ 修改润色   ──→ ③ FC: LLM 直接编辑
```

## 商品描述文案

```
用户: "给这款蓝牙耳机写个详情页文案"

→ FC: get_product(id) → { name, specs, features, reviews_summary }
→ FC: get_competitor_content(category="蓝牙耳机") → 竞品文案参考
→ LLM 生成 (System Prompt 包含品牌调性和文案规范):
  {
    title: "沉浸式好声音，40小时超长续航",
    highlights: ["主动降噪", "蓝牙5.3", "IPX5防水"],
    description: "...",
    selling_points: ["..."],
  }
→ Response: { type: "card", content: structured_copy }
```

## 营销文案 (ReAct)

```
用户: "写一个七夕促销活动方案"

Think: 需要了解品牌定位和历史促销数据
Action: get_brand_guidelines() → 品牌规范
Action: get_past_promotions(event="七夕") → 历史活动数据

Think: 需要分析竞品的七夕营销
Action: search_competitor_campaigns("七夕 2026") → 竞品活动

Think: 现在可以生成方案了
Action: generate_campaign({
  theme: "七夕", brand: guidelines, competitors: analysis,
  channels: ["小红书", "抖音", "微信公众号"]
})

→ 输出包含: 主题、slogan、各渠道文案、时间线、预算建议
```

## 多渠道适配

同一内容自动适配不同平台调性：

```typescript
const channelAdapters = {
  '小红书': { tone: '种草分享', maxLength: 1000, features: ['emoji', 'hashtag'] },
  '抖音': { tone: '短平快', maxLength: 200, features: ['hook_first_3s'] },
  '微信公众号': { tone: '深度专业', maxLength: 3000, features: ['structured'] },
  '淘宝详情页': { tone: '卖点突出', maxLength: 5000, features: ['bullet_points', 'specs'] },
};
```

## 质量控制

```typescript
// 文案生成后的自动质量检查
interface ContentQualityCheck {
  plagiarism: boolean;       // 查重
  brandCompliance: boolean;  // 品牌规范合规
  legalCompliance: boolean;  // 法律合规（禁用"最"等绝对化用语）
  seoScore: number;          // SEO 评分
  readability: number;       // 可读性评分
}
```
