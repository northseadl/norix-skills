# 常用配方（按需拷贝并改名）

## 1) 跳过构建（commit message）

提交信息包含以下标记会跳过构建：

- `skip-cnb`：跳过整个构建
- `skip-cnb: <stageName>`：跳过指定 stage
- `skip-cnb: <jobName>`：跳过指定 job

## 2) Docker build & push

```yaml
main:
  push:
    - docker:
        image: cnbcool/default:docker
        volumes:
          docker: /var/run/docker.sock
      stages:
        - name: build-and-push
          jobs:
            - name: build-and-push
              env:
                IMAGE: registry.example.com/demo/demo:{{ .CNB_BUILD_NUMBER }}
              script:
                - docker build -t $IMAGE .
                - docker push $IMAGE
```

## 3) Monorepo 按需构建（ifModify）

用 `ifModify` 做变更路径过滤，只在相关目录变更时执行：

```yaml
main:
  push:
    - name: build-foo
      ifModify:
        - pkg/foo/**
      stages:
        - jobs:
            - script:
                - make -C pkg/foo build
```

## 4) 超时策略（概念）

超时一般分为两层：

- pipeline：整条流水线允许的最大执行时间
- job：单个任务允许的最大执行时间

当用户反馈“构建经常跑满超时”时，先确认是 pipeline 级还是 job 级超时，再做资源（runner）与拆分（stage/job）优化。

## 5) 权限说明（快速判断）

- 触发构建：通常要求仓库达到一定权限（如开发者及以上）
- 查看日志：公开仓库一般任何人可看；私有仓库通常需要协作者权限

