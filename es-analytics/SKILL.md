---
name: es-analytics
metadata:
  version: 0.1.3
description: 'Elasticsearch / SLS 只读数据分析：索引探索、mapping、聚合统计、日志搜索、时间序列、多 Profile。

  '
---

# ES 数据分析技能

## 零依赖

仅使用 Python 3 标准库（`urllib` + `json`），不需要安装任何第三方包。

## 配置

### 添加连接

```bash
./es config add <profile-name> \
  --url <ES基础URL> \
  --user <用户名/AccessID> \
  --password <密码/AccessSecret> \
  [--default-index <默认索引名>] \
  [--sls]  \
  --test
```

`--sls` 标记该连接为阿里云 SLS ES 兼容端点。SLS 端点有以下行为差异，技能会自动处理：
- **默认只查最近 24h**：所有查询自动注入全时间范围 `range` 条件（除非用户已指定）
- **嵌套字段无法聚合**：`terms` 等聚合作用于未建索引的嵌套字段会报 `sls_field_index_not_configed`
- **`_source` 过滤不可靠**：部分嵌套字段在 `_source` 过滤后丢失

凭据存储在 `~/.agents/data/es-analytics/profiles.json`（权限 `0600`），支持多 Profile。

### 管理连接

```bash
./es config list                    # 列出所有 profile
./es config use <profile-name>      # 切换默认 profile
./es config test [profile-name]     # 测试连接
./es config remove <profile-name>   # 删除 profile
```

## 脚本

### query — ES 查询（只读）

```bash
./es query '{"size":10,"query":{"match_all":{}}}'
./es query -i my-index '{"size":5,"sort":[{"@timestamp":"desc"}]}'
./es query -p prod -i logs '{"query":{"match":{"level":"ERROR"}}}'
./es query --format csv '{"size":50,"query":{"term":{"status":"200"}}}'
```

选项：`-p` profile / `-i` 索引 / `--format table|csv|json` / `--full-range`（SLS 自动全时间范围）

### indices — 索引列表

```bash
./es indices                        # 列出所有索引
./es indices -p prod                # 指定 profile
./es indices --filter "chat*"       # 过滤索引名
```

### mapping — 查看索引 Mapping

```bash
./es mapping my-index               # 查看字段定义
./es mapping my-index -p prod       # 指定 profile
```

### count — 文档计数

```bash
./es count my-index                             # 总数
./es count my-index '{"query":{"match":{"level":"ERROR"}}}'   # 按条件计数
./es count my-index --full-range                # SLS 全时间范围计数
```

### extract — 全量去重提取（search_after 分页）

```bash
./es extract my-index --field auth_id                              # 提取去重字段
./es extract my-index --field auth_id --filter '{"match":{"auth_type":"user"}}'
./es extract my-index --field auth_id --full-range -o /tmp/uids.csv
```

高效分页提取指定字段的唯一值，自动 search_after，适合大数据量去重场景。

### sample — 采样数据

```bash
./es sample my-index                # 最新 5 条数据，展示字段结构
./es sample my-index -n 10 -p prod  # 指定数量和 profile
```

## SLS ES 兼容层注意事项

技能已内建以下保护机制：
1. SLS profile 的查询自动注入 `range` 条件覆盖全时间范围（可通过 `--no-full-range` 禁用）
2. 当聚合收到 `sls_field_index_not_configed` 错误时，自动降级为 search_after 分页 + Python 侧聚合
3. 不依赖 `_source` 过滤功能

## 安全策略

- **只读**: 拦截 DELETE / PUT（非 _search） / POST（非 _search/_count/_mapping）
- **行数限制**: query 默认添加 `size: 200`
- **凭据安全**: 配置文件权限 `0600`，密码不出现在命令行输出

## 模块架构

```
es (Bash CLI 入口)
│
├── config    → config.py     多 Profile 连接管理 (add/list/use/test/remove)
├── query     → query.py      ES 只读查询 (table/csv/json 输出)
├── indices   → indices.py    索引列表
├── mapping   → mapping.py    Mapping 查看
├── count     → count.py      文档计数
├── extract   → extract.py    全量去重提取 (search_after)
└── sample    → sample.py     采样数据
               ↓
            es_core.py         核心引擎 (HTTP 连接 + 安全 + 输出格式化)
               ↓
         ~/.agents/data/es-analytics/
           └── profiles.json   连接配置
```
