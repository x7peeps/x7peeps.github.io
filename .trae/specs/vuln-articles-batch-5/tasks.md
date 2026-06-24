# Tasks

- [ ] Task 1: 研究消息队列与流处理平台高危漏洞
  - [ ] SubTask 1.1: 研究 Apache ActiveMQ 高危 CVE（CVE-2023-46604 ClassPathXml RCE、CVE-2023-46605 信息泄露）
  - [ ] SubTask 1.2: 研究 RabbitMQ / Apache Kafka / Apache RocketMQ 高危 CVE
  - [ ] SubTask 1.3: 整理受影响版本、修复版本、CVSS 评分、PoC 可用性

- [ ] Task 2: 撰写消息队列与流处理平台高危攻击链专题文章
  - [ ] SubTask 2.1: 创建 `hugo-src/content/安全/渗透测试/03 漏洞分析/消息队列与流处理平台/_index.md`
  - [ ] SubTask 2.2: 撰写专题文章，覆盖 ≥ 6 个 CVE，包含完整 PoC 代码、Nuclei 模板、Python 脚本
  - [ ] SubTask 2.3: 验证文章字数 ≥ 8000 字符

- [ ] Task 3: 研究监控与可观测性平台高危漏洞
  - [ ] SubTask 3.1: 研究 Grafana 高危 CVE（CVE-2023-4456 / CVE-2023-4821 Angular XSS、CVE-2024-9264 路径穿越）
  - [ ] SubTask 3.2: 研究 Prometheus / ELK Stack 高危 CVE
  - [ ] SubTask 3.3: 整理受影响版本、修复版本、CVSS 评分、PoC 可用性

- [ ] Task 4: 撰写监控与可观测性平台高危攻击链专题文章
  - [ ] SubTask 4.1: 创建 `hugo-src/content/安全/渗透测试/03 漏洞分析/监控与可观测性平台/_index.md`
  - [ ] SubTask 4.2: 撰写专题文章，覆盖 ≥ 5 个 CVE，包含完整 PoC 代码、Nuclei 模板、Python 脚本
  - [ ] SubTask 4.3: 验证文章字数 ≥ 8000 字符

- [ ] Task 5: 研究 API 网关与服务网格高危漏洞
  - [ ] SubTask 5.1: 研究 Kong 高危 CVE（CVE-2022-21290 认证绕过、CVE-2022-21289 请求注入）
  - [ ] SubTask 5.2: 研究 Apache APISIX / Istio / Envoy 高危 CVE
  - [ ] SubTask 5.3: 整理受影响版本、修复版本、CVSS 评分、PoC 可用性

- [ ] Task 6: 撰写 API 网关与服务网格高危攻击链专题文章
  - [ ] SubTask 6.1: 创建 `hugo-src/content/安全/渗透测试/03 漏洞分析/API 网关与服务网格/_index.md`
  - [ ] SubTask 6.2: 撰写专题文章，覆盖 ≥ 6 个 CVE，包含完整 PoC 代码、Nuclei 模板、Python 脚本
  - [ ] SubTask 6.3: 验证文章字数 ≥ 8000 字符

- [ ] Task 7: 更新覆盖清单
  - [ ] SubTask 7.1: 更新 `常见高危RCE产品线清单.md` 覆盖状态表格，新增消息队列与流处理平台、监控与可观测性平台、API 网关与服务网格三行

- [ ] Task 8: Hugo 构建验证
  - [ ] SubTask 8.1: 运行 `hugo --gc --minify` 验证构建通过，页面数 ≥ 2850

# Task Dependencies
- [Task 1] 无依赖，可立即执行
- [Task 2] depends on [Task 1]
- [Task 3] 无依赖，可与 Task 1 并行
- [Task 4] depends on [Task 3]
- [Task 5] 无依赖，可与 Task 1/3 并行
- [Task 6] depends on [Task 5]
- [Task 7] depends on [Task 2, Task 4, Task 6]
- [Task 8] depends on [Task 7]
