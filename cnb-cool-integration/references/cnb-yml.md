# `.cnb.yml`：结构与写法

## 文件位置

- 配置文件必须放在仓库根目录：`.cnb.yml`
- 可以通过 `include` 拆分配置（见 `references/file-reference.md`）

## 两种顶层写法

### 1) 分支 → 事件 → pipelines（推荐）

```yaml
main:
  push:
    - stages:
        - jobs:
            - script:
                - echo "hello"
```

### 2) 直接列出 pipelines（适合复用与批量生成）

```yaml
- branch: main
  event: push
  stages:
    - jobs:
        - script:
            - echo "hello"
```

## 并发与复用规则（务必说明给用户）

- 同一 `branch/event` 下定义多个 pipeline：**并发执行**，且共享同一个构建环境与 runner。
- pipeline 内 stages：**默认串行**（前一个 stage 结束后才会开始下一个）。
- stage 内 jobs：**默认并发**。

## 配置精简（减少层级）

CNB 支持用更短的写法减少 YAML 层级（例如用 YAML merge、stage/job 的简写）。当你要把配置写得更短时，先看 `references/recipes.md` 中的精简示例，避免误用导致语义变化。

## IDE Schema（强烈建议）

在 VS Code / JetBrains 里为 `.cnb.yml` 绑定 JSON Schema，可显著减少拼写错误：

- Schema：`https://docs.cnb.cool/conf-schema-zh.json`

