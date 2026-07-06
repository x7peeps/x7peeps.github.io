# 漏洞分析专题文章第九批 Spec

## Why
知识库已覆盖 35 个产品线（230+ CVE），但无线网络基础设施、视频监控与物理安全、终端管理与 MDM 三大高价值领域尚未覆盖。这些设备在企业中广泛部署，一旦失陷可导致无线流量劫持、物理区域入侵、全域终端控制等严重后果。

## What Changes
- 新建「无线网络基础设施」目录，撰写专题文章覆盖 Cisco WLC / Aruba / Ruckus / Ubiquiti 高危漏洞
- 新建「视频监控与物理安全」目录，撰写专题文章覆盖 Hikvision / Dahua / Axis / Milestone 高危漏洞
- 新建「终端管理与 MDM」目录，撰写专题文章覆盖 Microsoft Intune / Jamf / Workspace ONE / MobileIron 高危漏洞
- 更新 `常见高危RCE产品线清单.md` 覆盖状态
- 验证 Hugo 构建通过

## Impact
- Affected specs: 无（新增内容）
- Affected code: `hugo-src/content/安全/渗透测试/03 漏洞分析/` 下新增 3 个目录 + 3 篇专题文章 + 3 个 `_index.md`

## ADDED Requirements

### Requirement: 无线网络基础设施高危攻击链专题
系统 SHALL 提供一篇完整的无线网络基础设施高危漏洞专题文章，覆盖以下 CVE：
- CVE-2023-20114 / CVE-2023-20129 / CVE-2023-20192（Cisco WLC 命令注入 / XSS / DoS）
- Aruba AOS / AOS-W 高危漏洞
- Ruckus / Ubiquiti 高危漏洞

文章 SHALL 包含完整 PoC 收集情况表格、HTTP PoC、Nuclei YAML 模板、Python 自动化脚本、共性攻击模式分析、防守建议、排查清单。

#### Scenario: 文章完成
- **WHEN** 专题文章写入 `hugo-src/content/安全/渗透测试/03 漏洞分析/无线网络基础设施/`
- **THEN** 文章字数 ≥ 8000 字符，包含 ≥ 6 个 CVE，Hugo 构建通过

### Requirement: 视频监控与物理安全高危攻击链专题
系统 SHALL 提供一篇完整的视频监控与物理安全系统高危漏洞专题文章，覆盖以下 CVE：
- Hikvision 系列高危漏洞（CVE-2021-36260 等）
- Dahua 系列高危漏洞（认证绕过 / RCE）
- Axis / Milestone / Genetec 高危漏洞

文章 SHALL 包含完整 PoC 收集情况表格、HTTP PoC、Nuclei YAML 模板、Python 自动化脚本、共性攻击模式分析、防守建议、排查清单。

#### Scenario: 文章完成
- **WHEN** 专题文章写入 `hugo-src/content/安全/渗透测试/03 漏洞分析/视频监控与物理安全/`
- **THEN** 文章字数 ≥ 8000 字符，包含 ≥ 6 个 CVE，Hugo 构建通过

### Requirement: 终端管理与 MDM 高危攻击链专题
系统 SHALL 提供一篇完整的终端管理与 MDM 系统高危漏洞专题文章，覆盖以下 CVE：
- Microsoft Intune / SCCM 高危漏洞
- Jamf Pro 高危漏洞（CVE-2024-27296 等）
- VMware Workspace ONE / MobileIron 高危漏洞

文章 SHALL 包含完整 PoC 收集情况表格、HTTP PoC、Nuclei YAML 模板、Python 自动化脚本、共性攻击模式分析、防守建议、排查清单。

#### Scenario: 文章完成
- **WHEN** 专题文章写入 `hugo-src/content/安全/渗透测试/03 漏洞分析/终端管理与MDM/`
- **THEN** 文章字数 ≥ 8000 字符，包含 ≥ 6 个 CVE，Hugo 构建通过

### Requirement: 覆盖清单更新
系统 SHALL 更新 `常见高危RCE产品线清单.md` 的覆盖状态表格，反映新增的 3 个产品线。

#### Scenario: 清单更新
- **WHEN** 3 篇专题文章全部完成
- **THEN** 清单中新增无线网络基础设施、视频监控与物理安全、终端管理与 MDM 三行

### Requirement: Hugo 构建验证
系统 SHALL 在所有文章写入后运行 `hugo --gc --minify` 验证构建通过。

#### Scenario: 构建通过
- **WHEN** 运行 `hugo --gc --minify`
- **THEN** 构建成功，无错误，页面数 ≥ 4000

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
