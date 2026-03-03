---
name: adb-mysql
version: 0.1.1
description: |
  阿里云 AnalyticDB (ADB) for MySQL 数据分析技能。
  通过 pymysql 连接 ADB 实例（或 DMS 代理），提供只读数据分析能力。
  多维数据分析（计数/聚合/时间序列）带交叉验证，自动生成 Schema 文档，多 Profile 管理。
  安全策略：只读模式，自动限制返回 200 条，禁止所有写入操作。依赖：pip install pymysql.
---

# ADB 数据分析技能

## 安装

```bash
pip install pymysql
```

仅依赖 `pymysql`（纯 Python MySQL 驱动），无需本地 `mysql` 客户端。

## 配置

### 添加连接

```bash
./adb config add <profile-name> \
  --host <DMS代理地址或ADB实例地址> \
  --user <AccessID或用户名> \
  --password <AccessSecret或密码> \
  --database <数据库名> \
  --test
```

凭据存储在 `~/.adb-mysql/profiles.json`（权限 `0600`），支持多 Profile。

### 管理连接

```bash
./adb config list                    # 列出所有 profile
./adb config use <profile-name>      # 切换默认 profile
./adb config test [profile-name]     # 测试连接
./adb config remove <profile-name>   # 删除 profile
```

## 脚本

### query — SQL 查询（只读）

```bash
./adb query "SELECT * FROM users LIMIT 10"
./adb query -d mydb "SELECT COUNT(*) FROM orders"
./adb query -f report.sql --format csv
./adb query -p staging "SELECT 1"          # 指定 profile
```

选项：`-p` profile / `-d` 数据库 / `-f` SQL 文件 / `--format table|csv|json`

### analyze — 数据分析（带交叉验证）

```bash
./adb analyze -t orders -c                                    # 计数分析
./adb analyze -t orders -g status -a "SUM(amount)"            # 聚合分析
./adb analyze -t orders --time-col created_at \
  --start-date 2024-01-01 --end-date 2024-02-01               # 时间序列
```

每次分析自动执行交叉验证：总行数 → 随机样本 → 数值统计 → 时间范围。

### schema — Schema 文档生成

```bash
./adb schema mydb                    # 生成到 ~/.adb-mysql/schema/mydb/
./adb schema mydb -o ./docs/schema   # 自定义输出目录
```

为所有表生成 Markdown 文档（字段定义、索引、ADB 分布键、查询示例）+ 索引文件。

**Agent 工作流**: 首次分析某数据库前，先运行 `./adb schema` 生成文档到 `~/.adb-mysql/schema/`，后续分析时读取作为上下文。

## 安全策略

- **只读**: 正则拦截 INSERT / UPDATE / DELETE / DROP / CREATE / ALTER / TRUNCATE 等写入操作
- **行数限制**: 自动添加 `LIMIT 200`，超出自动截断
- **性能警告**: 检测 SELECT * / 缺少 WHERE / JOIN 无 ON 条件
- **凭据安全**: 配置文件权限 `0600`，密码不出现在命令行参数

## 模块架构

```
adb (Bash CLI 入口)
│
├── config   → config.py    多 Profile 连接管理 (add/list/use/test/remove)
├── query    → query.py     SQL 只读查询 (table/csv/json 输出)
├── analyze  → analyze.py   多维分析 + 交叉验证
└── schema   → schema.py    Schema 文档生成 (Markdown)
               ↓
            adb_core.py      核心引擎 (pymysql 连接 + SQL 安全 + 输出格式化)
               ↓
         ~/.adb-mysql/
           ├── profiles.json  连接配置
           └── schema/        Schema 文档输出
```