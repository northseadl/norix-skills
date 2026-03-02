# 文件引用：include / imports / 权限校验

CNB 支持通过文件引用把配置拆分成多个文件，或从其他仓库导入共享配置。

## 引用路径写法

支持以下形式：

- 绝对路径：以 `/` 开头
- 相对路径：相对当前配置文件
- URL：远程文件

## include：拆分 `.cnb.yml`

`include` 会把外部 YAML 合并到当前文件，常用于把 `.cnb.yml` 拆成：

- `.cnb.yml`：入口
- `.cnb/pipeline.yml`：流水线
- `.cnb/env/common.yml`：公共 env

示例：

```yaml
include:
  - .cnb/pipeline.yml
```

合并行为要点：

- 如果 include 的内容是 **list**：会拼接到当前 list
- 如果 include 的内容是 **map**：会合并到当前 map

## imports：从其他仓库导入

```yaml
imports:
  - from: org/private-config
    branch: main
    path: .cnb/env/common.yml
```

适用场景：

- 多仓库共享一套构建变量、构建脚本片段、或统一的 env 配置

## 权限与白名单（跨源/私有仓库尤其重要）

当引用的仓库不是“当前仓库同源”时，CNB 会做权限校验。常见白名单字段包括：

- `allow_slugs`：允许引用的仓库列表
- `allow_events`：允许引用的事件
- `allow_branches`：允许引用的分支
- `allow_images`：允许引用的 Docker 镜像

遇到 include/imports 报权限/不允许访问时，优先按此方向排查。

