# 场景蓝图: 编程助手 Agent

> 代码生成、调试、解释的 Agent 架构
> 参考: Cursor, GitHub Copilot, Aider, Claude Code

## 用户旅程

```
提问 → 理解上下文 → 检索代码 → 推理 → 生成/修改 → 验证 → 交付
```

## 架构

```
用户输入 (自然语言 + 代码上下文)
   │
   ▼
[意图分类 LLM]
   │
   ├─ 代码解释 ──→ ⑨ Prompt Chain → 读代码 → 分析 → 解释
   ├─ 代码生成 ──→ ⑫ Eval-Optimizer → 生成 → 测试验证 → 迭代
   ├─ Bug 调试 ──→ ⑤ ReAct → 假设 → 定位 → 修复 → 验证
   ├─ 代码审查 ──→ ⑩ Parallelizing → 安全/性能/风格并行检查
   ├─ 重构建议 ──→ ⑪ Orchestrator → 分析依赖 → 规划步骤 → 执行
   └─ 文档生成 ──→ ⑨ Prompt Chain → 读代码 → 提取接口 → 生成文档
```

## 模式选型

| 场景 | 模式 | 延迟 | 说明 |
|------|------|------|------|
| 代码补全 | ③ FC | < 1s | 编辑器内联补全 |
| 代码解释 | ⑨ Chain | 2-5s | 分段解释 |
| 代码生成 | ⑫ Eval-Opt | 5-20s | 生成+测试循环 |
| Bug 调试 | ⑤ ReAct | 5-30s | 推理→定位→修复 |
| 代码审查 | ⑩ Parallel | 3-10s | 多维度并行检查 |
| 重构 | ⑪ Orch-Worker | 10-60s | 动态拆分步骤 |

## 工具集

```
代码搜索 → search_codebase(query, scope)
文件读取 → read_file(path, lines?)
文件写入 → write_file(path, content)
执行命令 → run_command(cmd, cwd)
测试运行 → run_tests(scope?)
LSP 查询 → find_references(symbol), go_to_definition(symbol)
Git 操作 → git_diff(), git_log(n), git_blame(file)
```

## 关键设计要点

1. **上下文窗口管理**: 代码上下文极其消耗 token，必须精准检索
2. **沙箱执行**: 所有代码执行必须在隔离环境中
3. **增量修改**: 编辑已有文件时使用 diff 而非全文替换
4. **验证闭环**: 每次修改后自动运行相关测试
