# 构建环境（docker）与资源（runner）

## docker：三种方式（三选一）

同一个 pipeline 的 `docker` 只允许三选一：

- `docker.image`：直接指定镜像（最常用）
- `docker.build`：用仓库里的 Dockerfile 构建镜像后作为环境
- `docker.devcontainer`：使用 devcontainer 作为环境

### `docker.image`

```yaml
docker:
  image: cnbcool/default:node
```

### `docker.build`

常见字段（按需使用）：

- `dockerfile`：默认 `Dockerfile`
- `context`：默认 `.`
- `buildArgs`：构建参数（会影响缓存/版本计算）
- `versionBy`：决定“镜像版本”如何计算（例如是否忽略 buildArgs）

### `docker.devcontainer`

常见字段（按需使用）：

- `devcontainer`：devcontainer 配置文件路径
- `workspaceFolder`：工作目录（默认 `/workspace`）

## docker.volumes：缓存与跨 stage 数据传递

```yaml
docker:
  image: cnbcool/default:node
  volumes:
    cache: /cache
```

语义要点：

- volumes 用于缓存（如依赖缓存、编译产物）与跨 stage 共享文件。
- CNB 使用 copy-on-write：每个 stage 开始会复制上一 stage 的卷快照；stage 结束会生成新的快照。
- 如果你的 Dockerfile 声明了 `VOLUME`，该目录也会在插件任务里共享（适合插件复用缓存/产物）。

## runner：资源与调度

```yaml
runner:
  cpus: 8
  mem: 8g
  disk: 50
  tags:
    - run:docker
```

要点：

- `cpus`：影响可用计算资源，通常也是调度的重要依据
- `mem`：支持 `g/m` 单位
- `disk`：单位是 GB
- `tags`：用于选择特定构建节点（例如需要 Docker socket 的节点）

## git：克隆策略

```yaml
git:
  depth: 1
  submodules: false
  options:
    - "--single-branch"
```

要点：

- `depth: 0` 表示全量克隆
- 需要 submodule 时显式打开

## services：启动依赖服务（MySQL/Redis 等）

```yaml
services:
  - name: mysql
    image: mysql:8
    ports: [3306]
    env:
      MYSQL_ROOT_PASSWORD: root
```

语义要点：

- runner 会启动 service 容器并等待 `ports` 就绪，再开始 jobs。
- 会注入环境变量：
  - `CNB_SERVICES`：形如 `mysql=host:3306;redis=host:6379`
  - `CNB_SERVICE_<NAME>_HOST` / `CNB_SERVICE_<NAME>_PORT`

