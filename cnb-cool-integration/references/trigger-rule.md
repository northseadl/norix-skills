# 触发规则：分支与事件

## 分支匹配（branch）

- 分支名使用 **glob**（而不是正则）匹配：
  - `main`
  - `feature/*`
  - `release/**`
- 特殊分支 `$`：当前分支不匹配任何 glob 时，使用 `$` 的配置作为兜底。
- 同一个分支名可能同时匹配多个 glob：这些 glob 下的 pipelines 会 **并发** 运行。

## 事件（event）

常用事件示例（按需要选择）：

- `push`：推送触发
- `pull_request` / `pull_request.update` / `pull_request.target`：PR 相关
- `commit.add`：向已有分支继续追加提交（会注入 `CNB_NEW_COMMITS_COUNT`）
- `branch.create` / `branch.delete`：分支创建/删除
- `web_trigger_<button-id>`：手动触发按钮（见 `references/web-trigger.md`）
- `api_trigger`：API 触发（如果你在用）
- `schedule`：定时触发（如果你在用）

## 推荐写法（复用 pipeline）

用 YAML 锚点与 merge 复用 pipeline 配置，避免重复：

```yaml
.base: &base
  docker:
    image: cnbcool/default:node
  stages:
    - jobs:
        - script:
            - node -v

main:
  push:
    - <<: *base
```

