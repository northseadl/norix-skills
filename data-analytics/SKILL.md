---
name: data-analytics
metadata:
  version: 0.1.0
description: '统一的数据分析核心机制，涵盖 AnalyticDB (ADB) for MySQL 与 ES/SLS。当用户要求查日志、排查线上错误、统计数据、分析趋势、提取 UID 或探索数据源表结构时，**必须且立即**触发此技能，即使未明确指定查询语言。支持多维聚合与安全护栏。'
---

# 数据分析技能 (Data Analytics)

包含 AnalyticDB (ADB) for MySQL 数据分析与 Elasticsearch / SLS 数据分析两个子模块。

## 1. ADB for MySQL 数据分析 (`./adb`)

仅依赖 `pymysql`（纯 Python MySQL 驱动），无需本地 `mysql` 客户端。安装依赖：`pip install pymysql`

### 配置与管理连接
- 添加：`./adb config add <profile-name> --host <地址> --user <用户> --password <密码> --database <数据库> --test`
- 管理：`./adb config list` | `./adb config use <profile-name>` | `./adb config test [profile-name]` | `./adb config remove <profile-name>`
- *凭据存储在 `~/.adb-mysql/profiles.json`（权限 `0600`）*

### 主要功能
- `query`: SQL 查询（只读）
  - `./adb query "SELECT * FROM users LIMIT 10"`
  - 选项：`-p` profile / `-d` 数据库 / `-f` SQL 文件 / `--format table|csv|json`
- `analyze`: 数据分析（带预制的交叉验证流程）
  - `./adb analyze -t orders -c` (计数)
  - `./adb analyze -t orders -g status -a "SUM(amount)"` (聚合)
  - `./adb analyze -t orders --time-col created_at --start-date 2024-01-01` (时间序列)
- `schema`: Schema 文档生成
  - `./adb schema mydb` 为所有表生成 Markdown 文档，Agent 首次分析前必备操作。

### 安全边界
- 正则拦截所有 DML/DDL 变更操作，强制自动 `LIMIT 200`。

---

## 2. Elasticsearch / SLS 只读分析 (`./es`)

纯零依赖，仅使用 Python 3 标准库（`urllib` + `json`）。

### 配置与管理连接
- 添加：`./es config add <profile> --url <基础URL> --user <用户> --password <密码> [--sls] --test`
  - `--sls` 专门处理阿里云 SLS ES 兼容层的特殊约定（自动范围注入、嵌套字段降级）。
- 管理：`./es config list` | `./es config use <profile>` | `./es config test [profile]`

### 主要功能
- `query`: ES 查询（只读）
  - `./es query '{"size":10,"query":{"match_all":{}}}'`
  - 选项：`-p` profile / `-i` 索引 / `--format table|csv|json` / `--full-range`
- `indices`: 列出所有/匹配条件索引 (`./es indices -p prod --filter "chat*"`)
- `mapping`: 查看字段定义 (`./es mapping my-index`)
- `count`: 文档分类计数 (`./es count my-index '{"query":{"match":{"level":"ERROR"}}}'`)
- `extract`: 高效全量去重提取（自动 search_after，适合大量 ID 提取）
  - `./es extract my-index --field auth_id`
- `sample`: 数据结构快查探针 (`./es sample my-index`)

### 安全边界
- 拦截 PUT/POST 的非查询端点操作，配置文件高敏加密 (`0600`)。
