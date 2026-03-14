# Norix Skill 开发规范 v1

> 本文档是 norix-skills 仓库中所有技能的工程标准。
> 新技能必须遵循此规范；现有技能更新时必须向此标准对齐。

## 1. 目录结构

```
skill-name/                    # kebab-case，必须与 SKILL.md name 字段一致
├── SKILL.md                   # 必需 — Agent 入口点
├── scripts/                   # 必需 — 所有可执行脚本
│   ├── credential_store.py    # 如需凭据 — 从 scripts/credential_store.py 复制
│   └── ...
├── references/                # 可选 — 按需加载的文档上下文
└── agents/
    └── openai.yaml            # 推荐 — UI 展示元数据
```

### 命名规则
- 目录名: `kebab-case`，禁止下划线
- Python 文件: `snake_case.py`
- 入口脚本: 同技能名或功能名（如 `./adb`, `./feishu`）

## 2. SKILL.md 与渐进式加载

### 上下文加载机制

```
Layer 1 (始终加载): name + description → Agent 判断是否触发
Layer 2 (按需加载): SKILL.md body      → 仅在技能触发后加载
```

**description 是所有技能共享的上下文公共资源。** 14 个技能的 description 同时驻留在上下文中。
每多一个 word 都在消耗其他技能和用户对话的空间。

### Frontmatter 规范

```yaml
---
name: skill-name                          # 必需，= 目录名
description: |                            # 必需，≤ 60 words / ≤ 500 chars
  ES/SLS 只读数据分析：索引探索、聚合统计、日志搜索、mapping 文档、多 Profile。
metadata:
  version: 0.1.0                          # 必需，pre-commit hook 强制 patch 递增
---
```

### description 写作原则

| 规则 | 说明 |
|:-----|:-----|
| **≤ 60 words** | 硬限制。超过则压缩 |
| **禁止 `Triggers:` 独立行** | 触发语义必须自然内嵌到描述散文中 |
| **核心能力优先** | 一句话说清"这个技能做什么" |
| **关键词自然出现** | 用户可能搜索的词融入描述文字 |
| **禁止功能穷举** | 详细功能列表属于 body（Layer 2） |

**反例**（浪费 35% token）:
```yaml
description: |
  ES/SLS read-only analytics.
  Triggers: "ES查询", "日志搜索", "SLS查询", "ES聚合", "Elasticsearch", "查日志".
```

**正例**（触发词自然内嵌）:
```yaml
description: ES/SLS 只读数据分析：索引探索、聚合统计、日志搜索、mapping 文档、多 Profile。
```

## 3. 技能隔离性

### 核心原则: 每个技能目录必须完全自洽

- **零跨目录导入**: 禁止 `sys.path.insert(0, "../../scripts")` 等上溯导入
- **共享模块**: 通过物理复制到各技能 `scripts/` 目录（source of truth 在仓库根 `scripts/`）
- **零外部依赖优先**: 使用 Python 3 stdlib；必须依赖时用 PEP 723 inline metadata 声明

```python
# 正确: 从本地 scripts/ 目录导入
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
from credential_store import CredentialStore

# 错误: 跨目录导入 — 破坏隔离性
sys.path.insert(0, os.path.join(__file__, "..", "..", "scripts"))
```

### 自洽验证
```bash
# 每个技能必须通过的测试
cd skill-name/scripts && python3 -c "from credential_store import CredentialStore"
```

## 4. 凭据安全 — NX1 Protocol

涉及密码、API Key、OAuth Token 的技能必须使用 `credential_store.py`。

### NX1 协议规范

```
加密格式: NX1$<base64(salt[16] + hmac_tag[32] + ciphertext[N])>

密钥派生:
  seed        = read(~/.agents/.machine-seed)  # 首次由平台 HWID 初始化，此后不变
  fingerprint = SHA256(seed + ":" + username + ":norix-skills")
  master_key  = PBKDF2-SHA256(fingerprint, "norix-skills-vault-v1", 200000, 32)

加密:
  salt       = random(16)
  keystream  = PBKDF2-SHA256(master_key, salt, 1, len(plaintext))
  ciphertext = XOR(plaintext, keystream)
  tag        = HMAC-SHA256(master_key, salt || ciphertext)
```

### 集成模式

```python
# 1. 保存凭据时: 提取敏感字段到加密 vault
_VAULT_SENTINEL = "***vault***"
_cred_store = CredentialStore("skill-name", CONFIG_DIR)

password = get_password_from_user()
_cred_store.set("profile:name", password)
profile["password"] = _VAULT_SENTINEL  # JSON 中仅存 sentinel

# 2. 使用凭据时: 从 vault 解密
def _resolve_password(profile_name, profile):
    pw = profile.get("password", "")
    if pw == _VAULT_SENTINEL or not pw:
        vault_pw = _cred_store.get(f"profile:{profile_name}")
        if vault_pw:
            return vault_pw
    return pw
```

### 安全属性
- 磁盘从不出现明文密码
- HMAC-SHA256 防篡改
- 每次加密随机 salt → 语义安全
- chmod 600/700 文件权限双重保护

## 5. 数据目录

```
~/.agents/data/<skill-name>/     # 全局凭证和持久配置
    profiles.json                # 连接配置（密码已替换为 sentinel）
    .vault.json                  # NX1 加密的凭据 vault
    schema/                      # 按需缓存的元数据
```

- 全局数据统一在 `~/.agents/data/<skill-name>/`
- 目录权限: `0o700` | 文件权限: `0o600`
- 项目级数据保持在 `cwd`

## 6. 只读安全策略 (数据分析类技能)

```python
# SQL: 正则白名单 + 黑名单双重验证
_WRITE_PATTERNS = re.compile(r"INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE", re.I)
_READONLY_WHITELIST = re.compile(r"SHOW|DESCRIBE|DESC|EXPLAIN", re.I)

# ES: 方法白名单 (GET/HEAD) + POST 仅允许 _search/_count
_SAFE_POST_PATHS = re.compile(r"(_search|_count|_msearch|_mapping)$")
```

## 7. Web 面板规范

- **纯静态**: HTML + CSS + JS，零构建工具
- **服务端**: Python stdlib `http.server` 子类
- **存储**: `localStorage` 仅用于非敏感 UI 偏好（如主题）
- **CDN 引用**: 使用 ESM 模块 (`import()`)，不依赖 Node.js

## 8. Pre-commit 检查

Git hook 自动执行：
1. `metadata.version` 必须递增（patch 级以上）
2. SKILL.md frontmatter 必须可解析
3. `name` 必须与目录名一致

## 9. 全局同步

```bash
python3 scripts/sync_global_skills.py --target all --force

# 同步方式:
# Antigravity → rsync 全量物理复制
# Codex → SKILL.md 物化 + 其他 symlink
```

同步后每个技能（含 credential_store.py）在全局目录完全可用。

## 10. 依赖预检 (Preflight)

涉及外部 SDK 或 CLI 工具的技能，必须在执行前完成三层依赖预检。

### 三层检查链

```
Layer 1: Python SDK  → 可导入？ → 否 → 自动 uv/pip install
Layer 2: CLI Binary  → PATH 可发现？ → 否 → 提示安装命令
Layer 3: 认证       → CLI login > config > env var (CI only)
```

### 认证优先级

| 引擎 | 推荐方式 | 凭据位置 | 最低优先级 (headless/CI) |
|:-----|:---------|:---------|:------------------------|
| **Codex** | `codex login` | `~/.codex/auth.json` + OS Keychain | `OPENAI_API_KEY` env |
| **Claude** | `claude` (交互登录) | `~/.claude/` + macOS Keychain | `ANTHROPIC_API_KEY` env |

> **禁止在文档中推荐 `export` 作为首选认证方式。** 环境变量只用于无法交互登录的场景（CI/CD、headless server）。

### 实现规范

```python
# 1. 自动安装: uv 优先，pip 兜底
def _try_install_package(package: str) -> bool:
    for cmd, name in [
        (["uv", "pip", "install", "--quiet", package], "uv"),
        ([sys.executable, "-m", "pip", "install", "--quiet", package], "pip"),
    ]:
        # ... try subprocess.run ...

# 2. 预检结果 → 结构化 actions 列表 → 自动解决 → 剩余 blockers 报告
actions = _preflight_check(engine_info)   # 检查
blockers = _preflight_resolve(actions)    # 自动修复 + 收集不可修复项
if blockers:
    # 编号列出所有阻塞项，告诉用户解决后重新运行
    fatal("Preflight failed — resolve the above issues to continue.")
```

### 关键原则

| 原则 | 说明 |
|:-----|:-----|
| **SDK 名 ≠ 导入名** | PyPI 包名与 Python import 名可能不同（如 `openai-codex-sdk` → `import openai_codex_sdk`），必须用真实导入名验证 |
| **自动修复优先** | SDK 缺失时先尝试自动安装，只有安装失败才报错 |
| **消息可执行** | 错误消息必须包含**可直接复制执行的命令**，而非泛泛描述 |
| **按需检查** | 仅检查实际使用的引擎（如用户只选 claude，不检查 codex 依赖） |

## 11. 用户意图保真 (Intent Fidelity)

### 核心禁令: 禁止静默降级

当用户指定了技术路径（如选择 `codex` 引擎），技能**严禁**：
- 静默切换到其他路径（如自动 fallback 到 `claude`）
- 绕开失败路径用补丁思维拼凑替代方案
- 在用户不知情的情况下改变执行语义

### 正确做法

```
用户选择路径 → 检测到阻塞 → 引导用户解决阻塞 → 用户解决后重新运行
                              ↑
                        帮用户配好环境，而非偷偷换路
```

### 适用场景

| 场景 | ❌ 错误 | ✅ 正确 |
|:-----|:--------|:--------|
| Codex SDK 缺失 | 静默切换所有 agent 到 claude | 自动安装 SDK，安装失败则告知 |
| CLI 未安装 | 跳过依赖 CLI 的功能 | 提示安装命令，阻断执行 |
| API Key 缺失 | 用 mock 数据继续 | 提示 export 语法，等用户配置 |
| 引擎初始化失败 | 降级为 dry-run | 报告具体错误 + 修复命令 |
