# 漏洞分析专题文章第七批 Spec

## Why
知识库已覆盖 29 个产品线（175+ CVE），但低代码/无代码平台、工作流与自动化引擎、日志与 SIEM 平台三大高价值领域尚未覆盖。这些产品在现代企业中广泛使用，一旦失陷可导致业务逻辑篡改、工作流劫持、安全监控绕过等严重后果。

## What Changes
- 新建「低代码与无代码平台」目录，撰写专题文章覆盖 Appsmith / NocoDB / ToolJet 高危漏洞
- 新建「工作流与自动化引擎」目录，撰写专题文章覆盖 Apache Airflow / n8n / Camunda 高危漏洞
- 新建「日志与 SIEM 平台」目录，撰写专题文章覆盖 Graylog / Wazuh / Security Onion 高危漏洞
- 更新 `常见高危RCE产品线清单.md` 覆盖状态
- 验证 Hugo 构建通过

## Impact
- Affected specs: 无（新增内容）
- Affected code: `hugo-src/content/安全/渗透测试/03 漏洞分析/` 下新增 3 个目录 + 3 篇专题文章 + 3 个 `_index.md`

## ADDED Requirements

### Requirement: 低代码与无代码平台高危攻击链专题
系统 SHALL 提供一篇完整的低代码与无代码平台高危漏洞专题文章，覆盖以下 CVE：
- CVE-2023-3428（Appsmith 认证绕过）
- CVE-2023-36844（Appsmith RCE）
- NocoDB 未授权访问 / RCE
- ToolJet 相关高危漏洞
- 其他低代码平台高危漏洞

文章 SHALL 包含完整 PoC 收集情况表格、HTTP PoC、Nuclei YAML 模板、Python 自动化脚本、共性攻击模式分析、防守建议、排查清单。

#### Scenario: 文章完成
- **WHEN** 专题文章写入 `hugo-src/content/安全/渗透测试/03 漏洞分析/低代码与无代码平台/`
- **THEN** 文章字数 ≥ 8000 字符，包含 ≥ 5 个 CVE，Hugo 构建通过

### Requirement: 工作流与自动化引擎高危攻击链专题
系统 SHALL 提供一篇完整的工作流与自动化引擎高危漏洞专题文章，覆盖以下 CVE：
- CVE-2023-22814 / CVE-2023-22815（Apache Airflow RCE）
- CVE-2023-3428（Airflow 认证绕过）
- n8n 未授权访问 / RCE
- Camunda 相关高危漏洞
- 其他工作流引擎高危漏洞

文章 SHALL 包含完整 PoC 收集情况表格、HTTP PoC、Nuclei YAML 模板、Python 自动化脚本、共性攻击模式分析、防守建议、排查清单。

#### Scenario: 文章完成
- **WHEN** 专题文章写入 `hugo-src/content/安全/渗透测试/03 漏洞分析/工作流与自动化引擎/`
- **THEN** 文章字数 ≥ 8000 字符，包含 ≥ 5 个 CVE，Hugo 构建通过

### Requirement: 日志与 SIEM 平台高危攻击链专题
系统 SHALL 提供一篇完整的日志与 SIEM 平台高危漏洞专题文章，覆盖以下 CVE：
- Graylog 未授权访问 / RCE
- Wazuh 认证绕过 / RCE
- Security Onion 相关高危漏洞
- 其他日志/SIEM 平台高危漏洞

文章 SHALL 包含完整 PoC 收集情况表格、HTTP PoC、Nuclei YAML 模板、Python 自动化脚本、共性攻击模式分析、防守建议、排查清单。

#### Scenario: 文章完成
- **WHEN** 专题文章写入 `hugo-src/content/安全/渗透测试/03 漏洞分析/日志与 SIEM 平台/`
- **THEN** 文章字数 ≥ 8000 字符，包含 ≥ 5 个 CVE，Hugo 构建通过

### Requirement: 覆盖清单更新
系统 SHALL 更新 `常见高危RCE产品线清单.md` 的覆盖状态表格，反映新增的 3 个产品线。

#### Scenario: 清单更新
- **WHEN** 3 篇专题文章全部完成
- **THEN** 清单中新增低代码与无代码平台、工作流与自动化引擎、日志与 SIEM 平台三行

### Requirement: Hugo 构建验证
系统 SHALL 在所有文章写入后运行 `hugo --gc --minify` 验证构建通过。

#### Scenario: 构建通过
- **WHEN** 运行 `hugo --gc --minify`
- **THEN** 构建成功，无错误，页面数 ≥ 3750

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
