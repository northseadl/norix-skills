# 状态反馈模式库

## 必备状态

1. `loading`
2. `empty`
3. `error`
4. `success`
5. `permission`

## 输出表规范

每个核心页面都需提供：

| state | trigger | user_feedback | recovery_action |
| --- | --- | --- | --- |
| loading | ... | ... | ... |
| empty | ... | ... | ... |
| error | ... | ... | ... |
| success | ... | ... | ... |
| permission | ... | ... | ... |

## 质量要求

1. 错误态必须给恢复动作
2. 权限态必须给下一步指引
3. success 不得抢占用户流程
