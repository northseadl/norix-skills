# 环境变量：env / imports / exports

## env：定义环境变量

```yaml
env:
  NODE_ENV: production
  BRANCH: "{{ .CNB_BRANCH }}"
```

要点：

- value 支持 string / int / bool。
- 支持模板变量替换：`{{ .CNB_BRANCH }}`、`{{ .CNB_BUILD_NUMBER }}` 等。

## 变量名约束（避免踩坑）

- 变量名必须匹配：`[A-Za-z_][A-Za-z0-9_]*`
- 不能以数字开头
- `CNB_` 前缀保留，建议不要自定义

## imports：从其他仓库导入 env

导入语义与权限/白名单见 `references/file-reference.md`。

```yaml
imports:
  - from: org/private-config
    branch: main
    path: .cnb/env/common.yml
```

## exports：从 job 输出“动态环境变量”

在 job 内写入 `/tmp/exports`，下一步可引用：

```sh
echo 'IMAGE_TAG=v1.2.3' >> /tmp/exports
```

格式要求（按行解析）：

- `KEY=VALUE`
- 或 `KEY="VALUE"`

