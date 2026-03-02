# 手动触发：web_trigger（按钮/参数/选择目标构建）

## 1) 配置文件

手动触发按钮配置文件固定为：`.cnb/web_trigger.yml`

注意：该文件 **不支持** `include` 与 `imports`。

## 2) 分支与按钮

`branches` 下每一项用正则 `branch` 匹配分支，并声明 `buttons`：

```yaml
branches:
  - name: development
    branch: "develop"
    buttons:
      - id: deploy
        name: "部署"
        desc: "部署到测试环境"
        env:
          APP_NAME: "{{ .INPUT_APP_NAME }}"
        inputs:
          - id: app_name
            name: "应用名"
            type: string
            required: true
```

要点：

- button 的触发事件为：`web_trigger_<id>`（如 `web_trigger_deploy`）。
- inputs 通过 `{{ .INPUT_<ID> }}` 引用（ID 通常会转成大写并用下划线连接）。

## 3) `.cnb.yml` 中接事件

```yaml
main:
  web_trigger_deploy:
    - stages:
        - jobs:
            - script:
                - echo "deploy"
```

## 4) 高级：选择目标构建（targets）

按钮支持让用户选择“要部署的目标构建”（例如选择某个分支最近一次构建结果）。配置 `targets` 后，触发时会自动注入一组环境变量：

- `CNB_TRIGGER_TARGET_BUILD_ID`
- `CNB_TRIGGER_TARGET_BUILD_NUMBER`
- `CNB_TRIGGER_TARGET_BRANCH`
- `CNB_TRIGGER_TARGET_EVENT`
- `CNB_TRIGGER_TARGET_COMMIT_ID`
- `CNB_TRIGGER_TARGET_COMMIT_MESSAGE`
- `CNB_TRIGGER_TARGET_COMMIT_AUTHOR`

当用户提出“部署某次构建/选择构建号/选择目标分支产物”这类需求时，优先考虑 targets。

