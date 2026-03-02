# 缓存：volumes 与跨节点缓存（docker:cache）

## 1) volumes：同一构建节点内缓存（首选）

思路：把依赖缓存与编译缓存放到 `docker.volumes` 指向的目录中，并在脚本里显式使用它。

```yaml
docker:
  image: cnbcool/default:node
  volumes:
    cache: /cache
stages:
  - jobs:
      - name: test
        script:
          - export NPM_CONFIG_CACHE=/cache/npm
          - npm ci
```

关键点：

- 挂载路径要稳定（路径变了就相当于换了缓存）。
- CNB 对 volumes 使用 copy-on-write：stage 开始复制上一 stage 的卷快照，stage 结束生成新快照。

## 2) pipeline cache：多节点并行下的“共享卷”思路

当 pipeline 分发到多个节点并行执行时，可以把多个缓存目录统一放到同一个卷（例如 `/cache/node`、`/cache/code`），并在不同 jobs 里各取所需。

## 3) 跨节点缓存：docker cache 镜像 + `docker:cache`

当你需要“不同构建节点之间”共享缓存时（例如构建会被调度到不同机器），可以考虑：

- 配置一个用于存放缓存内容的 Docker 镜像（作为 cache carrier）
- 在流水线里加入内置任务 `docker:cache`，完成缓存的 pull/push

注意：跨节点缓存通常需要额外的 registry 权限与合理的 cache key 设计；优先把 volumes 用对、把目录放对，再考虑跨节点缓存。

