# Patterns 分区索引

字段：`node_id | problem | use_when | file_path | output_type | next`

| node_id | problem | use_when | file_path | output_type | next |
| --- | --- | --- | --- | --- | --- |
| PTN-PAGE | 页面结构选型 | 需要确定页面骨架时 | references/patterns/page-structure-patterns.md | PagePatternSet | PTN-INT |
| PTN-INT | 交互模式选型 | 需要确定核心交互机制时 | references/patterns/interaction-patterns.md | InteractionPatternSet | PTN-STATE |
| PTN-STATE | 状态反馈策略 | 需要补全状态闭环时 | references/patterns/state-feedback-patterns.md | StatePatternSet | PTN-ANTI |
| PTN-ANTI | 反随机化约束 | 需要控制方案漂移时 | references/patterns/anti-randomization-patterns.md | AntiRandomizationRules | IDX-T |
