# Standards 分区索引

字段：`node_id | problem | use_when | file_path | output_type | next`

| node_id | problem | use_when | file_path | output_type | next |
| --- | --- | --- | --- | --- | --- |
| STD-7D | 七维质量定义 | 需要定义“优秀前端”边界时 | references/standards/quality-seven-dimensions.md | QualityDimensions | STD-SCORE |
| STD-SCORE | 评分与阻断规则 | 需要发布判定或质量打分时 | references/standards/scoring-model.md | ScoringModel | STD-INT |
| STD-VIS | 视觉一致性契约 | 需要约束视觉系统一致性时 | references/standards/visual-consistency-contract.md | VisualContract | STD-INT |
| STD-INT | 交互一致性契约 | 需要约束状态与交互一致性时 | references/standards/interaction-consistency-contract.md | InteractionContract | - |
