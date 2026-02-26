# 全局索引

字段：`node_id | problem | use_when | file_path | output_type | next`

| node_id | problem | use_when | file_path | output_type | next |
| --- | --- | --- | --- | --- | --- |
| IDX-S | 质量基线、评分、一致性契约 | 需要定义质量标准或评审标准时 | references/index/INDEX-standards.md | StandardsPack | IDX-PB |
| IDX-PB | 模式执行与框架交付路径 | 需要 Explore/Production 或 React/Vue 路由时 | references/index/INDEX-playbooks.md | PlaybookPack | IDX-PT |
| IDX-PTN | 页面/交互/状态模式选型 | 需要方案模式与反随机控制时 | references/index/INDEX-patterns.md | PatternPack | IDX-T |
| IDX-T | 输出模板映射 | 需要结构化交付文档时 | references/index/INDEX-templates.md | TemplatePack | - |

## 加载策略

1. 首次只读本文件 + 1 个分区索引
2. 二次最多读 2 个节点
3. 歧义时最多追加 1 个 `next`
