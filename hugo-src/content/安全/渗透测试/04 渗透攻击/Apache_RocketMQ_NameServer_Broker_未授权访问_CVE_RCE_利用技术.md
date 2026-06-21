---
title: "Apache RocketMQ NameServer Broker 未授权访问 CVE RCE 利用技术"
date: 2025-06-21T00:00:00+08:00
draft: false
weight: 109
description: "深入分析 Apache RocketMQ 的 NameServer/Broker 未授权访问、CVE-2023-33246 RCE、CVE-2023-37582 反序列化、RocketMQ Dashboard 利用、Fastjson 反序列化链、消息队列 C2 通道滥用、ACL 绕过等完整攻击面，覆盖历史 CVE 漏洞链及蓝队检测与应急响应"
categories: ["安全","渗透测试"]
tags: ["RocketMQ","NameServer","Broker","未授权访问","CVE-2023-33246","CVE-2023-37582","Fastjson","反序列化","消息队列","C2通道","ACL绕过"]
---

## 0x00 攻击面总览

Apache RocketMQ 是阿里开源的高吞吐分布式消息队列中间件，广泛用于电商、金融、物流等核心业务场景的消息解耦与异步处理。RocketMQ 的攻击面涵盖协议层、管理层、消息层多个维度：

| 攻击面 | 默认端口 | 风险等级 | 说明 |
|--------|---------|---------|------|
| NameServer | 9876 | **严重** | 未授权访问，路由劫持，配置篡改 |
| Broker | 10911/10909 | **严重** | 未授权消息读写，CVE-2023-33246 RCE |
| RocketMQ Dashboard | 8080 | **高危** | Groovy 脚本执行，SSRF，未授权操作 |
| Fastjson 反序列化 | 10911 | **严重** | 消息体/协议头触发 Gadget 链 |
| Consumer/Producer | 应用层 | **高危** | 消息注入，反序列化，JNDI 注入 |
| ACL 认证 | 全端口 | **中-高危** | 默认凭据，签名绕过，权限提升 |
| VIP Channel | 10909 | **中危** | Broker VIP 通道未授权 |

RocketMQ 的核心安全问题在于：Remoting 协议默认不启用认证、NameServer 和 Broker 端口直接暴露、以及消息序列化/反序列化过程中的安全隐患。

## 0x01 服务识别与版本探测

### 1.1 端口扫描与指纹识别

```bash
nmap -sV -p 9876,10911,10909,8080 --script=banner <target>

# NameServer 端口探测 (Remoting 协议)
echo -ne '\x00\x00\x00\x01' | nc -w3 TARGET 9876 | xxd

# Broker 端口探测
echo -ne '\x00\x00\x00\x01' | nc -w3 TARGET 10911 | xxd
```

### 1.2 RocketMQ 协议探测

```python
import socket
import struct
import json

def detect_rocketmq(host, port=9876):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((host, port))

    # RocketMQ Remoting 协议请求格式:
    # 4字节长度 + JSON header + body
    header = {
        "code": 101,  # GET_ROUTEINFO_BY_TOPIC
        "language": "JAVA",
        "version": 396,
        "opaque": 1,
        "flag": 0,
        "serializeTypeCurrentRPC": "JSON"
    }

    header_json = json.dumps(header).encode()
    body =