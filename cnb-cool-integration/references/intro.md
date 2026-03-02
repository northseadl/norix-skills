# 概览：cnb.cool 云原生构建

本 Skill 面向 cnb.cool 的云原生构建能力（以下简称 CNB Build）。核心特点是用声明式的 `.cnb.yml` 描述构建流程，并以 Docker 作为构建运行时。

## 关键概念（最重要的 3 句话）

- `.cnb.yml`：仓库根目录的构建配置文件，用 YAML 声明触发条件与流水线。
- 执行模型：同一分支/事件下的 **pipeline 并发**；pipeline 内 **stage 串行**；stage 内 **job 并发**。
- 构建运行时：每条 pipeline 运行在一个 Docker 容器环境中，可通过 `docker.image` / `docker.build` / `docker.devcontainer` 指定。

## 快速示例（最小可跑）

```yaml
main:
  push:
    - docker:
        image: cnbcool/default:node
      stages:
        - jobs:
            - name: test
              script:
                - node -v
                - npm -v
```

## 能力点速览

- **触发规则**：按分支（glob）与事件（push / pull_request / web_trigger_* 等）触发。
- **缓存与共享**：通过 `docker.volumes` 提供目录缓存与跨 stage 数据传递（copy-on-write）。
- **插件机制**：支持用 Docker 镜像作为插件运行 job（适合封装可复用任务）。
- **资源控制**：`runner.cpus/mem/disk/tags` 控制构建节点资源与调度。
- **调试能力**：支持 login debug 方式“留住”构建节点用于排查。

需要更完整的参数与语义时，优先打开官方文档的「配置文件 / 语法手册 / 触发规则 / 环境变量 / 缓存 / 手动触发 / 登录调试」章节。

