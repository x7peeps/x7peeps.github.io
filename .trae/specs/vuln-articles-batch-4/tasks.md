# Tasks

- [x] Task 1: 研究容器与编排平台高危漏洞
  - [x] SubTask 1.1: 研究 runc / containerd / Docker Engine 高危 CVE（CVE-2024-21626、CVE-2023-28810/28811、CVE-2024-41110）
  - [x] SubTask 1.2: 研究 Kubernetes API Server / kubelet 高危 CVE（CVE-2022-0185、CVE-2023-5528、CVE-2024-3177）
  - [x] SubTask 1.3: 整理受影响版本、修复版本、CVSS 评分、PoC 可用性

- [x] Task 2: 撰写容器与编排平台高危攻击链专题文章
  - [x] SubTask 2.1: 创建 `hugo-src/content/安全/渗透测试/03 漏洞分析/容器与编排平台/_index.md`
  - [x] SubTask 2.2: 撰写专题文章，覆盖 ≥ 6 个 CVE，包含完整 PoC 代码、Nuclei 模板、Python 脚本
  - [x] SubTask 2.3: 验证文章字数 ≥ 8000 字符

- [x] Task 3: 研究身份与密钥管理产品高危漏洞
  - [x] SubTask 3.1: 研究 Keycloak 高危 CVE（CVE-2023-3428、CVE-2024-9941、CVE-2024-10912）
  - [x] SubTask 3.2: 研究 HashiCorp Vault 高危 CVE（CVE-2023-33201、CVE-2023-21211、CVE-2024-28183）
  - [x] SubTask 3.3: 整理受影响版本、修复版本、CVSS 评分、PoC 可用性

- [x] Task 4: 撰写身份与密钥管理高危攻击链专题文章
  - [x] SubTask 4.1: 创建 `hugo-src/content/安全/渗透测试/03 漏洞分析/身份与密钥管理/_index.md`
  - [x] SubTask 4.2: 撰写专题文章，覆盖 ≥ 5 个 CVE，包含完整 PoC 代码、Nuclei 模板、Python 脚本
  - [x] SubTask 4.3: 验证文章字数 ≥ 8000 字符

- [x] Task 5: 研究数据库系统高危漏洞
  - [x] SubTask 5.1: 研究 MySQL Server 高危 CVE（CVE-2023-21980、CVE-2023-21977、CVE-2023-22084、CVE-2024-21008）
  - [x] SubTask 5.2: 研究 Redis / MongoDB / PostgreSQL 高危 CVE（CVE-2022-24735、CVE-2023-37480、PostgreSQL 提权）
  - [x] SubTask 5.3: 整理受影响版本、修复版本、CVSS 评分、PoC 可用性

- [x] Task 6: 撰写数据库系统高危攻击链专题文章
  - [x] SubTask 6.1: 创建 `hugo-src/content/安全/渗透测试/03 漏洞分析/数据库系统/_index.md`
  - [x] SubTask 6.2: 撰写专题文章，覆盖 ≥ 6 个 CVE，包含完整 PoC 代码、Nuclei 模板、Python 脚本
  - [x] SubTask 6.3: 验证文章字数 ≥ 8000 字符

- [x] Task 7: 更新覆盖清单
  - [x] SubTask 7.1: 更新 `常见高危RCE产品线清单.md` 覆盖状态表格，新增容器与编排平台、身份与密钥管理、数据库系统三行

- [x] Task 8: Hugo 构建验证
  - [x] SubTask 8.1: 运行 `hugo --gc --minify` 验证构建通过，页面数 ≥ 2750

# Task Dependencies
- [Task 1] 无依赖，可立即执行
- [Task 2] depends on [Task 1]
- [Task 3] 无依赖，可与 Task 1 并行
- [Task 4] depends on [Task 3]
- [Task 5] 无依赖，可与 Task 1/3 并行
- [Task 6] depends on [Task 5]
- [Task 7] depends on [Task 2, Task 4, Task 6]
- [Task 8] depends on [Task 7]
