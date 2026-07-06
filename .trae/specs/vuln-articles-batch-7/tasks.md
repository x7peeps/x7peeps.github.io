# Tasks

- [x] Task 1: 研究低代码与无代码平台高危漏洞
  - [x] SubTask 1.1: 研究 Appsmith 高危 CVE（CVE-2023-3428 认证绕过、CVE-2023-36844 RCE）
  - [x] SubTask 1.2: 研究 NocoDB / ToolJet 高危漏洞
  - [x] SubTask 1.3: 整理受影响版本、修复版本、CVSS 评分、PoC 可用性

- [x] Task 2: 撰写低代码与无代码平台高危攻击链专题文章
  - [x] SubTask 2.1: 创建 `hugo-src/content/安全/渗透测试/03 漏洞分析/低代码与无代码平台/_index.md`
  - [x] SubTask 2.2: 撰写专题文章，覆盖 ≥ 5 个 CVE，包含完整 PoC 代码、Nuclei 模板、Python 脚本
  - [x] SubTask 2.3: 验证文章字数 ≥ 8000 字符

- [x] Task 3: 研究工作流与自动化引擎高危漏洞
  - [x] SubTask 3.1: 研究 Apache Airflow 高危 CVE（CVE-2023-22814 / CVE-2023-22815 RCE）
  - [x] SubTask 3.2: 研究 n8n / Camunda 高危漏洞
  - [x] SubTask 3.3: 整理受影响版本、修复版本、CVSS 评分、PoC 可用性

- [x] Task 4: 撰写工作流与自动化引擎高危攻击链专题文章
  - [x] SubTask 4.1: 创建 `hugo-src/content/安全/渗透测试/03 漏洞分析/工作流与自动化引擎/_index.md`
  - [x] SubTask 4.2: 撰写专题文章，覆盖 ≥ 5 个 CVE，包含完整 PoC 代码、Nuclei 模板、Python 脚本
  - [x] SubTask 4.3: 验证文章字数 ≥ 8000 字符

- [x] Task 5: 研究日志与 SIEM 平台高危漏洞
  - [x] SubTask 5.1: 研究 Graylog 高危漏洞（未授权访问 / RCE）
  - [x] SubTask 5.2: 研究 Wazuh / Security Onion 高危漏洞
  - [x] SubTask 5.3: 整理受影响版本、修复版本、CVSS 评分、PoC 可用性

- [x] Task 6: 撰写日志与 SIEM 平台高危攻击链专题文章
  - [x] SubTask 6.1: 创建 `hugo-src/content/安全/渗透测试/03 漏洞分析/日志与 SIEM 平台/_index.md`
  - [x] SubTask 6.2: 撰写专题文章，覆盖 ≥ 5 个 CVE，包含完整 PoC 代码、Nuclei 模板、Python 脚本
  - [x] SubTask 6.3: 验证文章字数 ≥ 8000 字符

- [x] Task 7: 更新覆盖清单
  - [x] SubTask 7.1: 更新 `常见高危RCE产品线清单.md` 覆盖状态表格，新增低代码与无代码平台、工作流与自动化引擎、日志与 SIEM 平台三行

- [x] Task 8: Hugo 构建验证
  - [x] SubTask 8.1: 运行 `hugo --gc --minify` 验证构建通过，页面数 ≥ 3750

# Task Dependencies
- [Task 1] 无依赖，可立即执行
- [Task 2] depends on [Task 1]
- [Task 3] 无依赖，可与 Task 1 并行
- [Task 4] depends on [Task 3]
- [Task 5] 无依赖，可与 Task 1/3 并行
- [Task 6] depends on [Task 5]
- [Task 7] depends on [Task 2, Task 4, Task 6]
- [Task 8] depends on [Task 7]
