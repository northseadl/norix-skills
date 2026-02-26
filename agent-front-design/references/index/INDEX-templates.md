# Templates 分区索引

字段：`node_id | problem | use_when | file_path | output_type | next`

| node_id | problem | use_when | file_path | output_type | next |
| --- | --- | --- | --- | --- | --- |
| T-DGS | 目标定义模板 | 需要定义目标与边界时 | references/templates/design-goal-spec-template.md | DesignGoalSpec | T-UX |
| T-UX | 体验架构模板 | 需要定义 IA 与用户流时 | references/templates/ux-architecture-spec-template.md | UXArchitectureSpec | T-UI |
| T-UI | UI 蓝图模板 | 需要定义组件与视觉契约时 | references/templates/ui-blueprint-spec-template.md | UIBlueprintSpec | T-ENG |
| T-ENG | 工程交接模板 | 需要输出实现导向规格时 | references/templates/engineering-handoff-template.md | EngineeringHandoffSpec | T-Q |
| T-Q | 质量门禁模板 | 需要输出评分与阻断时 | references/templates/quality-gate-report-template.md | QualityGateReport | T-R |
| T-R | 发布决策模板 | 需要输出发布结论与风险时 | references/templates/release-decision-template.md | ReleaseDecision | - |
