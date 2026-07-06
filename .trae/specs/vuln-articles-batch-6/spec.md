# 漏洞分析专题文章第六批 Spec

## Why
知识库已覆盖 26 个产品线（155+ CVE），但云原生存储与配置中心、网络代理与负载均衡、版本控制与代码托管三大高价值领域尚未覆盖。这些产品在现代基础设施中广泛部署，一旦失陷可导致对象存储接管、集群配置泄露、源代码窃取等严重后果。

## What Changes
- 新建「云原生存储与配置中心」目录，撰写专题文章覆盖 MinIO / etcd / Consul / Nacos 高危漏洞
- 新建「网络代理与负载均衡」目录，撰写专题文章覆盖 Nginx / HAProxy / Traefik 高危漏洞
- 新建「版本控制与代码托管」目录，撰写专题文章覆盖 Gitea / Gogs 高危漏洞
- 更新 `常见高危RCE产品线清单.md` 覆盖状态
- 验证 Hugo 构建通过

## Impact
- Affected specs: 无（新增内容）
- Affected code: `hugo-src/content/安全/渗透测试/03 漏洞分析/` 下新增 3 个目录 + 3 篇专题文章 + 3 个 `_index.md`

## ADDED Requirements

### Requirement: 云原生存储与配置中心高危攻击链专题
系统 SHALL 提供一篇完整的云原生存储与配置中心高危漏洞专题文章，覆盖以下 CVE：
- CVE-2023-28432（MinIO 信息泄露 → 管理员接管）
- CVE-2023-28433（MinIO 权限提升）
- CVE-2023-28431（MinIO 未授权访问）
- etcd 未授权访问（2379 端口）
- HashiCorp Consul 未授权访问 / RCE
- Alibaba Nacos 认证绕过 / RCE（CVE-2021-29441 等）

文章 SHALL 包含完整 PoC 收集情况表格、HTTP PoC、Nuclei YAML 模板、Python 自动化脚本、共性攻击模式分析、防守建议、排查清单。

#### Scenario: 文章完成
- **WHEN** 专题文章写入 `hugo-src/content/安全/渗透测试/03 漏洞分析/云原生存储与配置中心/`
- **THEN** 文章字数 ≥ 8000 字符，包含 ≥ 6 个 CVE，Hugo 构建通过

### Requirement: 网络代理与负载均衡高危攻击链专题
系统 SHALL 提供一篇完整的网络代理与负载均衡高危漏洞专题文章，覆盖以下 CVE：
- CVE-2023-44487（HTTP/2 Rapid Reset，影响 Nginx/HAProxy/Envoy）
- CVE-2022-41741 / CVE-2022-41742（Nginx 请求走私）
- CVE-2023-25693（HAProxy HTTP 请求走私）
- CVE-2024-24576（Traefik / Rust stdlib 命令注入）
- CVE-2023-46747（F5 BIG-IP 请求走私，已有专题但可交叉引用）
- Nginx 路径穿越 / 配置错误

文章 SHALL 包含完整 PoC 收集情况表格、HTTP PoC、Nuclei YAML 模板、Python 自动化脚本、共性攻击模式分析、防守建议、排查清单。

#### Scenario: 文章完成
- **WHEN** 专题文章写入 `hugo-src/content/安全/渗透测试/03 漏洞分析/网络代理与负载均衡/`
- **THEN** 文章字数 ≥ 8000 字符，包含 ≥ 5 个 CVE，Hugo 构建通过

### Requirement: 版本控制与代码托管高危攻击链专题
系统 SHALL 提供一篇完整的版本控制与代码托管高危漏洞专题文章，覆盖以下 CVE：
- CVE-2023-28715（Gitea 路径穿越）
- CVE-2022-34844（Gitea 认证绕过）
- CVE-2023-49559（Gitea 路径穿越）
- Gogs 未授权访问 / 路径穿越
- CVE-2023-7028（Gitea/Gogs 密码重置漏洞）
- 其他代码托管平台高危漏洞

文章 SHALL 包含完整 PoC 收集情况表格、HTTP PoC、Nuclei YAML 模板、Python 自动化脚本、共性攻击模式分析、防守建议、排查清单。

#### Scenario: 文章完成
- **WHEN** 专题文章写入 `hugo-src/content/安全/渗透测试/03 漏洞分析/版本控制与代码托管/`
- **THEN** 文章字数 ≥ 8000 字符，包含 ≥ 5 个 CVE，Hugo 构建通过

### Requirement: 覆盖清单更新
系统 SHALL 更新 `常见高危RCE产品线清单.md` 的覆盖状态表格，反映新增的 3 个产品线。

#### Scenario: 清单更新
- **WHEN** 3 篇专题文章全部完成
- **THEN** 清单中新增云原生存储与配置中心、网络代理与负载均衡、版本控制与代码托管三行

### Requirement: Hugo 构建验证
系统 SHALL 在所有文章写入后运行 `hugo --gc --minify` 验证构建通过。

#### Scenario: 构建通过
- **WHEN** 运行 `hugo --gc --minify`
- **THEN** 构建成功，无错误，页面数 ≥ 2900

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
