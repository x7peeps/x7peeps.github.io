# 漏洞分析专题文章第五批 Spec

## Why
知识库已覆盖 23 个产品线（135+ CVE），但消息队列与流处理平台、监控与可观测性平台、API 网关与服务网格三大高价值领域尚未覆盖。这些产品在现代分布式架构中广泛部署，一旦失陷可导致消息投毒、监控数据泄露、流量劫持等严重后果。

## What Changes
- 新建「消息队列与流处理平台」目录，撰写专题文章覆盖 Apache ActiveMQ / RabbitMQ / Apache Kafka / RocketMQ 高危漏洞
- 新建「监控与可观测性平台」目录，撰写专题文章覆盖 Grafana / Prometheus / ELK Stack 高危漏洞
- 新建「API 网关与服务网格」目录，撰写专题文章覆盖 Kong / Apache APISIX / Istio / Envoy 高危漏洞
- 更新 `常见高危RCE产品线清单.md` 覆盖状态
- 验证 Hugo 构建通过

## Impact
- Affected specs: 无（新增内容）
- Affected code: `hugo-src/content/安全/渗透测试/03 漏洞分析/` 下新增 3 个目录 + 3 篇专题文章 + 3 个 `_index.md`

## ADDED Requirements

### Requirement: 消息队列与流处理平台高危攻击链专题
系统 SHALL 提供一篇完整的消息队列与流处理平台高危漏洞专题文章，覆盖以下 CVE：
- CVE-2023-46604（Apache ActiveMQ ClassPathXmlApplicationContext RCE）
- CVE-2022-22969 / CVE-2022-22970（Spring Cloud Function SpEL 注入，影响消息队列场景）
- RabbitMQ 未授权访问 + 管理接口漏洞
- Apache Kafka 相关安全漏洞
- Apache RocketMQ 相关安全漏洞

文章 SHALL 包含完整 PoC 收集情况表格、HTTP PoC、Nuclei YAML 模板、Python 自动化脚本、共性攻击模式分析、防守建议、排查清单。

#### Scenario: 文章完成
- **WHEN** 专题文章写入 `hugo-src/content/安全/渗透测试/03 漏洞分析/消息队列与流处理平台/`
- **THEN** 文章字数 ≥ 8000 字符，包含 ≥ 6 个 CVE，Hugo 构建通过

### Requirement: 监控与可观测性平台高危攻击链专题
系统 SHALL 提供一篇完整的监控与可观测性平台高危漏洞专题文章，覆盖以下 CVE：
- CVE-2023-3428（Grafana 认证绕过相关）
- CVE-2023-4456 / CVE-2023-4821（Grafana Angular 模板 XSS）
- CVE-2024-9264（Grafana 路径穿越）
- Prometheus 相关安全漏洞
- ELK Stack（Elasticsearch / Kibana / Logstash）相关高危漏洞

文章 SHALL 包含完整 PoC 收集情况表格、HTTP PoC、Nuclei YAML 模板、Python 自动化脚本、共性攻击模式分析、防守建议、排查清单。

#### Scenario: 文章完成
- **WHEN** 专题文章写入 `hugo-src/content/安全/渗透测试/03 漏洞分析/监控与可观测性平台/`
- **THEN** 文章字数 ≥ 8000 字符，包含 ≥ 5 个 CVE，Hugo 构建通过

### Requirement: API 网关与服务网格高危攻击链专题
系统 SHALL 提供一篇完整的 API 网关与服务网格高危漏洞专题文章，覆盖以下 CVE：
- CVE-2022-21290 / CVE-2021-42724（Kong 认证绕过）
- CVE-2022-21289（Kong 请求注入）
- CVE-2022-27134（Apache APISIX 认证绕过）
- CVE-2023-25611 / CVE-2023-27524（Apache APISIX 默认密钥 / RCE）
- Istio / Envoy 相关安全漏洞

文章 SHALL 包含完整 PoC 收集情况表格、HTTP PoC、Nuclei YAML 模板、Python 自动化脚本、共性攻击模式分析、防守建议、排查清单。

#### Scenario: 文章完成
- **WHEN** 专题文章写入 `hugo-src/content/安全/渗透测试/03 漏洞分析/API 网关与服务网格/`
- **THEN** 文章字数 ≥ 8000 字符，包含 ≥ 6 个 CVE，Hugo 构建通过

### Requirement: 覆盖清单更新
系统 SHALL 更新 `常见高危RCE产品线清单.md` 的覆盖状态表格，反映新增的 3 个产品线。

#### Scenario: 清单更新
- **WHEN** 3 篇专题文章全部完成
- **THEN** 清单中新增消息队列与流处理平台、监控与可观测性平台、API 网关与服务网格三行

### Requirement: Hugo 构建验证
系统 SHALL 在所有文章写入后运行 `hugo --gc --minify` 验证构建通过。

#### Scenario: 构建通过
- **WHEN** 运行 `hugo --gc --minify`
- **THEN** 构建成功，无错误，页面数 ≥ 2850

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
