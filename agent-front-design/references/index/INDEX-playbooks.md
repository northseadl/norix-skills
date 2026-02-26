# Playbooks 分区索引

字段：`node_id | problem | use_when | file_path | output_type | next`

| node_id | problem | use_when | file_path | output_type | next |
| --- | --- | --- | --- | --- | --- |
| PB-EXP | Explore 模式执行 | 需求模糊、需要方案发散时 | references/playbooks/explore-mode-playbook.md | ExplorePlan | PB-PROD |
| PB-PROD | Production 模式执行 | 用户要求最终交付或上线评审时 | references/playbooks/production-mode-playbook.md | ProductionPlan | PB-R/PB-V |
| PB-R | React 交付路径 | 技术栈为 React 时 | references/playbooks/react-handoff-playbook.md | ReactHandoff | IDX-T |
| PB-V | Vue 交付路径 | 技术栈为 Vue 时 | references/playbooks/vue-handoff-playbook.md | VueHandoff | IDX-T |
