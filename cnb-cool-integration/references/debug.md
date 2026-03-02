# 调试：login debug

当你需要“进入构建节点环境排查问题”时，可以在 `.cnb.yml` 中加入 login debug 配置，并添加一个“停留”stage。

```yaml
login:
  stageName: login
stages:
  - name: test
    jobs:
      - script:
          - go test ./...
  - name: login
    jobs:
      - name: login
        script:
          - sleep 3600
```

要点：

- `login.stageName` 指定用于登录调试的 stage 名。
- `sleep` 让节点保持一段时间，便于你登录后观察文件、环境变量、网络连通性等。

