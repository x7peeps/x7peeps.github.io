# 漏洞分析专题文章第四批 Spec

## Why
知识库已覆盖 20 个产品线（115+ CVE），但容器与编排平台、身份与密钥管理、数据库系统三大高价值领域尚未覆盖。这些产品在现代企业基础设施中广泛部署，一旦失陷可导致容器逃逸、身份接管、数据泄露等严重后果。

## What Changes
- 新建「容器与编排平台」目录，撰写专题文章覆盖 Docker / Kubernetes / containerd / runc 高危漏洞
- 新建「身份与密钥管理」目录，撰写专题文章覆盖 Keycloak / HashiCorp Vault 高危漏洞
- 新建「数据库系统」目录，撰写专题文章覆盖 MySQL / PostgreSQL / Redis / MongoDB 高危漏洞
- 更新 `常见高危RCE产品线清单.md` 覆盖状态
- 验证 Hugo 构建通过

## Impact
- Affected specs: 无（新增内容）
- Affected code: `hugo-src/content/安全/渗透测试/03 漏洞分析/` 下新增 3 个目录 + 3 篇专题文章 + 3 个 `_index.md`

## ADDED Requirements

### Requirement: 容器与编排平台高危攻击链专题
系统 SHALL 提供一篇完整的容器与编排平台高危漏洞专题文章，覆盖以下 CVE：
- CVE-2024-21626（runc 容器逃逸）
- CVE-2022-0185（Kubernetes 特权提升）
- CVE-2023-5528（Kubernetes 卷挂载 RCE）
- CVE-2024-3177（Kubernetes 挂载命名空间逃逸）
- CVE-2023-28810 / CVE-2023-28811（containerd 挂载逃逸）
- CVE-2024-41110（Docker Engine AuthZ 插件 RCE）

文章 SHALL 包含完整 PoC 收集情况表格、HTTP PoC、Nuclei YAML 模板、Python 自动化脚本、共性攻击模式分析、防守建议、排查清单。

#### Scenario: 文章完成
- **WHEN** 专题文章写入 `hugo-src/content/安全/渗透测试/03 漏洞分析/容器与编排平台/`
- **THEN** 文章字数 ≥ 8000 字符，包含 ≥ 6 个 CVE，Hugo 构建通过

### Requirement: 身份与密钥管理高危攻击链专题
系统 SHALL 提供一篇完整的身份与密钥管理产品高危漏洞专题文章，覆盖以下 CVE：
- CVE-2023-3428（Keycloak 认证绕过）
- CVE-2024-9941 / CVE-2024-10912（Keycloak 认证绕过链）
- CVE-2023-33201（HashiCorp Vault 密钥共享绕过）
- CVE-2023-21211（HashiCorp Vault 身份提升）
- CVE-2024-28183（HashiCorp Vault OIDC 认证绕过）

文章 SHALL 包含完整 PoC 收集情况表格、HTTP PoC、Nuclei YAML 模板、Python 自动化脚本、共性攻击模式分析、防守建议、排查清单。

#### Scenario: 文章完成
- **WHEN** 专题文章写入 `hugo-src/content/安全/渗透测试/03 漏洞分析/身份与密钥管理/`
- **THEN** 文章字数 ≥ 8000 字符，包含 ≥ 5 个 CVE，Hugo 构建通过

### Requirement: 数据库系统高危攻击链专题
系统 SHALL 提供一篇完整的数据库系统高危漏洞专题文章，覆盖以下 CVE：
- CVE-2023-21980 / CVE-2023-21977（MySQL Server RCE）
- CVE-2023-22084（Oracle MySQL 缓冲区溢出）
- CVE-2024-21008（MySQL Server 优化器 RCE）
- Redis Lua 沙箱逃逸 / CVE-2022-24735（Redis Lua 沙箱逃逸）
- CVE-2023-37480（MongoDB 任意文件读取）
- PostgreSQL 提权 / 命令执行漏洞

文章 SHALL 包含完整 PoC 收集情况表格、HTTP PoC、Nuclei YAML 模板、Python 自动化脚本、共性攻击模式分析、防守建议、排查清单。

#### Scenario: 文章完成
- **WHEN** 专题文章写入 `hugo-src/content/安全/渗透测试/03 漏洞分析/数据库系统/`
- **THEN** 文章字数 ≥ 8000 字符，包含 ≥ 6 个 CVE，Hugo 构建通过

### Requirement: 覆盖清单更新
系统 SHALL 更新 `常见高危RCE产品线清单.md` 的覆盖状态表格，反映新增的 3 个产品线。

#### Scenario: 清单更新
- **WHEN** 3 篇专题文章全部完成
- **THEN** 清单中新增容器与编排平台、身份与密钥管理、数据库系统三行

### Requirement: Hugo 构建验证
系统 SHALL 在所有文章写入后运行 `hugo --gc --minify` 验证构建通过。

#### Scenario: 构建通过
- **WHEN** 运行 `hugo --gc --minify`
- **THEN** 构建成功，无错误，页面数 ≥ 2750

## 写作规范
所有文章遵循统一结构：
- 漏洞原理
- 漏洞详情（受影响版本/修复版本表格）
- PoC 与验证思路（HTTP PoC + Python 脚本 + Nuclei YAML）
- PoC 收集情况总表
- 共性攻击模式
- 应急排查与日志痕迹
- 修复与缓解建议
- 参考资料
