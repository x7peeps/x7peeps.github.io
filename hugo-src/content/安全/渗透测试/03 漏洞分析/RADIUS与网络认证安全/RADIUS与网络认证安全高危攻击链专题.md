---
title: "RADIUS与网络认证安全高危攻击链专题：FreeRADIUS / Samba / RADIUS 协议漏洞全解析"
date: 2026-07-10T14:00:00+08:00
draft: false
categories: ["渗透测试", "漏洞分析"]
tags: ["FreeRADIUS", "Samba", "RADIUS", "网络认证", "Blast-RADIUS", "漏洞分析", "MD5", "协议攻击"]
---

## 0x00 专题概述

RADIUS（Remote Authentication Dial-In User Service）协议自 1997 年 RFC 2127 发布以来，一直是企业网络认证、授权与计费（AAA）体系的核心基础设施。从 802.1X 有线/无线接入控制、VPN 认证、ISP 用户管理，到运营商漫游计费、Eduroam/OpenRoaming 全球 Wi-Fi 漫游联盟，RADIUS 协议支撑着数十亿设备的网络准入认证。然而，这一协议在设计之初并未充分考虑现代密码学安全需求，其基于 MD5 的认证机制在 2024 年被 Blast-RADIUS 研究团队彻底击破，暴露了协议层面的根本性缺陷。

与此同时，作为 RADIUS 生态中最广泛部署的开源实现，FreeRADIUS 在 2022-2026 年间持续曝出高危漏洞，从条件竞争到缓冲区溢出，再到 2026 年因 AI 代码分析工具导致的安全生态剧变。而 Samba 作为 Windows Active Directory 的开源替代方案，其 Kerberos、Netlogon、DCE/RPC 等认证相关组件也连续曝出多个高危漏洞，形成了一条从协议层到实现层的完整攻击链。

本专题系统性梳理 RADIUS/NAC 认证体系中的高危漏洞，覆盖 **12 个 CVE**，涉及 FreeRADIUS、Samba、ISC Kea DHCP 等核心网络认证组件，深入分析每个漏洞的原理、利用方式与防御方案。

### 覆盖漏洞一览表

| CVE | 产品/协议 | CVSS | 漏洞类型 | 利用条件 |
|-----|----------|------|---------|---------|
| CVE-2024-3596 | RADIUS 协议 (RFC 2865) | 9.0 | MD5 Collision 认证伪造 | 中间人位置 + 非 EAP 认证 |
| CVE-2022-33453 | FreeRADIUS | - | 条件竞争 (Race Condition) | 本地/认证用户 |
| CVE-2015-4680 | FreeRADIUS | 7.5 | 中间 CA 证书吊销检查绕过 | EAP-TLS + 中间 CA |
| FreeRADIUS 2026 批量漏洞 | FreeRADIUS <3.0.28 / <3.2.9 | 多个 | 缓冲区溢出/内存泄漏 | UDP 可达 / 认证用户 |
| CVE-2022-38023 | Samba Netlogon | 8.1 | RC4 弱加密 NTLM Relay | 域内认证用户 |
| CVE-2023-34966 | Samba Spotlight | 7.5 | 无限循环 DoS | RPC 网络可达 |
| CVE-2023-34967 | Samba Spotlight | 5.3 | 类型混淆 DoS | RPC 网络可达 |
| CVE-2022-42898 | Samba/MIT Kerberos | 8.8 | PAC 解析整数溢出 | 认证用户 (32-bit) |
| CVE-2026-4408 | Samba SAMR | 9.8 | 命令注入 RCE | 未认证 (特殊配置) |
| CVE-2026-4480 | Samba 打印子系统 | 10.0 | 命令注入 RCE | 未认证 (打印共享) |
| CVE-2026-3608 | ISC Kea DHCP | 7.5 | 栈溢出 DoS | API Socket 网络可达 |
| CVE-2018-5732 | ISC DHCP dhclient | 7.5 | 缓冲区溢出 | 恶意 DHCP 服务器 |

---

## 0x01 RADIUS 协议级漏洞

### 0x01.1 CVE-2024-3596 — Blast-RADIUS MD5 Collision 攻击

#### 漏洞背景

RADIUS 协议（RFC 2865）在 1997 年设计时，使用一种基于 MD5 和共享密钥（Shared Secret）的 ad-hoc 构造来认证服务器响应。这种认证机制的核心缺陷在于：**它不是标准的 HMAC，而是一种非标准的 MD5 拼接方式**。RADIUS 使用的 Response Authenticator 计算方式为：

```
Response Authenticator = MD5(Code + Identifier + Length + Attributes + Shared Secret)
```

这种构造方式使得攻击者可以利用 MD5 的 chosen-prefix collision 特性，在不需要知道共享密钥的情况下伪造合法的 RADIUS 响应包。

2024 年 7 月 7 日，来自波士顿大学、马里兰大学、加州大学圣迭戈分校等机构的研究团队公开了 **Blast-RADIUS** 攻击（论文发表于 USENIX Security 2024），彻底击破了 RADIUS 协议的认证机制。

#### 受影响版本

| 产品/实现 | 受影响版本 | 修复版本 |
|-----------|-----------|---------|
| FreeRADIUS | < 3.0.27 | 3.0.27+ |
| Cisco ISE | 多个版本 | 参考 Cisco SA |
| Microsoft NPS | 多个版本 | 2024 年 7 月补丁 |
| Juniper | 多个版本 | 参考 Juniper SA |
| Aruba | 多个版本 | 参考 Aruba SA |
| 所有使用 RADIUS/UDP 的实现 | 使用非 EAP 认证方法 | 各厂商补丁 |

> **关键点**：这是一个**协议级漏洞**，影响所有使用 RADIUS 协议的系统，而不仅仅是某个特定实现。

#### 漏洞原理深度分析

Blast-RADIUS 攻击利用了 RADIUS 协议中 MD5 使用的两个根本性缺陷：

**1. MD5 Chosen-Prefix Collision**

MD5 的 chosen-prefix collision 攻击允许攻击者构造两个不同的消息前缀 `P1` 和 `P2`，使得 `MD5(P1 || S1)` 与 `MD5(P2 || S2)` 产生相同的哈希值。与传统的 length-extension attack 不同，chosen-prefix collision 不需要知道 Shared Secret 的具体内容。

**2. RADIUS 属性注入与碰撞**

攻击的核心在于 RADIUS 协议的一个设计缺陷：**响应包的认证信息（Response Authenticator）是对整个包（包括属性）的 MD5 哈希，但属性可以在不改变已有属性的情况下追加新属性**。

攻击流程如下：

1. 攻击者处于 RADIUS Client（NAS）和 RADIUS Server 之间的中间人位置
2. 用户发起认证请求（Access-Request）
3. RADIUS Server 返回合法的 Access-Reject（认证失败）
4. 攻击者截获这个合法的 Access-Reject
5. 攻击者在 Access-Reject 中注入一个精心构造的恶意属性（包含 chosen-prefix collision 数据）
6. 由于 MD5 collision，修改后的包的 Response Authenticator 仍然有效
7. RADIUS Client 收到这个被篡改的响应，将其视为合法的 Access-Accept

**关键前提条件**：
- 攻击者需要处于 RADIUS Client 和 Server 之间的中间人位置
- RADIUS 通信使用的是非 EAP 认证方法（如 PAP、CHAP）
- RADIUS Client 没有在 Access-Request 中包含 `Message-Authenticator` 属性（EAP 场景下默认包含）

#### 攻击流程图（文字描述）

```
正常流程:
  NAS ──Access-Request──> RADIUS Server
  NAS <──Access-Reject─── RADIUS Server
  (用户被拒绝访问)

Blast-RADIUS 攻击流程:
  NAS ──Access-Request──> [Attacker] ──Access-Request──> RADIUS Server
  NAS <──?── [Attacker] <──Access-Reject─── RADIUS Server
                              │
                              ├─ 截获合法 Access-Reject
                              ├─ 注入恶意属性（MD5 collision padding）
                              ├─ 篡改 Response Authenticator
                              │
  NAS <──Access-Accept──── [Attacker 篡改的响应]
  (攻击者获得网络访问权限)
```

#### HTTP/curl PoC — 检测 RADIUS 服务器是否支持 EAP

```bash
#!/bin/bash
# Blast-RADIUS 可达性检测脚本
# 检测目标 RADIUS 服务器是否监听以及是否支持 EAP

TARGET_HOST="${1:-127.0.0.1}"
TARGET_PORT="${2:-1812}"

echo "[*] 检测 RADIUS 服务器: ${TARGET_HOST}:${TARGET_PORT}"

# 使用 netcat 测试端口连通性
if nc -z -w 3 "${TARGET_HOST}" "${TARGET_PORT}" 2>/dev/null; then
    echo "[+] RADIUS 服务器端口开放"
else
    echo "[-] RADIUS 服务器端口不可达"
    exit 1
fi

# 使用 radclient 发送 Status-Server 探测包（需要安装 freeradius-utils）
if command -v radclient &>/dev/null; then
    echo "[*] 发送 Status-Server 探测..."
    echo "Message-Authenticator = 0x00" | radclient -t 5 -r 1 \
        "${TARGET_HOST}:${TARGET_PORT}" status "${SECRET:-testing123}" 2>&1
else
    echo "[-] radclient 未安装，跳过探测"
    echo "[*] 提示: apt install freeradius-utils"
fi
```

#### Python PoC — Blast-RADIUS 攻击演示脚本

> **免责声明**：以下代码仅用于安全研究和授权测试环境，严禁用于未授权的攻击行为。

```python
#!/usr/bin/env python3
"""
Blast-RADIUS (CVE-2024-3596) PoC Demo
仅用于安全研究和授权测试环境

依赖: pip install pycryptodome
"""

import socket
import struct
import hashlib
import os
import sys
import time

RADIUS_ACCESS_REQUEST = 1
RADIUS_ACCESS_ACCEPT = 2
RADIUS_ACCESS_REJECT = 3
RADIUS_ACCESS_CHALLENGE = 11

ATTR_MESSAGE_AUTHENTICATOR = 80
ATTR_STATE = 24


def build_radius_packet(code, identifier, attributes, shared_secret):
    """构建 RADIUS 包"""
    attr_data = b""
    for attr_type, attr_value in attributes:
        attr_len = len(attr_value) + 2
        attr_data += struct.pack("BB", attr_type, attr_len) + attr_value

    header = struct.pack("BBH", code, identifier, 0)
    authenticator = os.urandom(16)

    if code == RADIUS_ACCESS_REQUEST:
        auth_input = header[:4] + authenticator + attr_data + shared_secret
        authenticator = hashlib.md5(auth_input).digest()

    packet = header[:4] + authenticator + attr_data
    length = len(packet)
    packet = struct.pack("BBH", code, identifier, length) + packet[4:]
    return packet


def send_radius_request(server_host, server_port, packet, timeout=5):
    """发送 RADIUS 请求并接收响应"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        sock.sendto(packet, (server_host, server_port))
        response, _ = sock.recvfrom(4096)
        return response
    except socket.timeout:
        return None
    finally:
        sock.close()


def parse_radius_response(data):
    """解析 RADIUS 响应包"""
    if len(data) < 20:
        return None
    code = data[0]
    identifier = data[1]
    length = struct.unpack("!H", data[2:4])[0]
    authenticator = data[4:20]
    attributes = {}
    offset = 20
    while offset < length:
        attr_type = data[offset]
        attr_len = data[offset + 1]
        if attr_len < 2:
            break
        attr_value = data[offset + 2:offset + attr_len]
        attributes[attr_type] = attr_value
        offset += attr_len
    return {
        "code": code,
        "identifier": identifier,
        "authenticator": authenticator,
        "attributes": attributes
    }


def check_message_authenticator_required(server_host, server_port,
                                        shared_secret, username="test",
                                        password="test"):
    """
    检测 RADIUS 服务器是否要求 Message-Authenticator
    不包含 Message-Authenticator 发送请求，如果服务器仍然响应说明不强制要求
    """
    print(f"[*] 检测目标: {server_host}:{server_port}")
    print(f"[*] 测试用户: {username}")

    attrs = [
        (1, username.encode()),       # User-Name
        (2, password.encode()),       # User-Password
        (4, b"\xc0\xa8\x01\x01"),    # NAS-IP-Address
        (61, struct.pack("H", 6)),    # NAS-Port-Type (Ethernet)
    ]

    identifier = 0x01
    packet = build_radius_packet(
        RADIUS_ACCESS_REQUEST, identifier, attrs, shared_secret.encode()
    )

    response = send_radius_request(server_host, server_port, packet)
    if response is None:
        print("[-] 无响应（可能要求 Message-Authenticator 或服务器不可达）")
        return False

    parsed = parse_radius_response(response)
    if parsed:
        code_names = {2: "Access-Accept", 3: "Access-Reject", 11: "Access-Challenge"}
        code_name = code_names.get(parsed["code"], f"Unknown({parsed['code']})")
        print(f"[+] 收到响应: {code_name}")
        has_msg_auth = ATTR_MESSAGE_AUTHENTICATOR in parsed["attributes"]
        print(f"[*] 响应中是否包含 Message-Authenticator: {has_msg_auth}")
        print(f"[!] 服务器可能未强制要求 Message-Authenticator — 存在 Blast-RADIUS 风险")
        return True

    return False


def demonstrate_collision_concept():
    """演示 MD5 chosen-prefix collision 概念"""
    print("\n[*] === Blast-RADIUS 攻击原理演示 ===")
    print("[*] MD5 chosen-prefix collision 概念验证:")
    print("[*] 攻击者需要在 RADIUS 响应中注入 padding 属性，使得:")
    print("    MD5(original_response) == MD5(forged_response)")
    print("[*] 实际攻击中使用的 collision 计算需要大量 GPU 算力")
    print("[*] 根据研究团队报告，生成碰撞的时间约为 5-20 分钟")
    print("[*] 论文: https://www.blastradius.fail/pdf/radius.pdf")


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(f"用法: {sys.argv[0]} <host> <port> <shared_secret>")
        print(f"示例: {sys.argv[0]} 192.168.1.1 1812 testing123")
        sys.exit(1)

    host = sys.argv[1]
    port = int(sys.argv[2])
    secret = sys.argv[3]

    check_message_authenticator_required(host, port, secret)
    demonstrate_collision_concept()
```

#### Nuclei YAML 检测模板

```yaml
id: blast-radius-cve-2024-3596
info:
  name: Blast-RADIUS CVE-2024-3596 Detection
  author: security-researcher
  severity: critical
  description: Detects RADIUS servers vulnerable to Blast-RADIUS MD5 collision attack
  reference:
    - https://www.blastradius.fail/
    - https://nvd.nist.gov/vuln/detail/CVE-2024-3596
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:C/C:H/I:H/A:H
    cvss-score: 9.0
    cwe-id: CWE-354
  tags: radius,blast-radius,cve2024,cve,auth-bypass

variables:
  radius_secret: "testing123"

network:
  - inputs:
      - data: "{{hex_decode('01')}}{{hex_decode('01')}}{{hex_decode('00')}}{{hex_decode('26')}}{{rand_base(16)}}0106010601{{hex_decode('0a000101')}}{{generate_md5({{radius_secret}})}}"
        read: 1024
        host: "{{Hostname}}"
        port: "{{Port}}"
        type: udp

    host-redirects: true
    data:
      - "RADIUS server responded to Access-Request without Message-Authenticator"

    matchers-condition: and
    matchers:
      - type: binary
        part: body
        binary:
          - "02"

    extractors:
      - type: regex
        group: 1
        regex:
          - "(\\x02)"
        internal: true
```

---

### 0x01.2 RADIUS 协议安全演进与 RadSec 替代方案

Blast-RADIUS 的公开披露加速了 RADIUS 协议的现代化进程。IETF 已经启动了 **RADIUS over (D)TLS** 的标准化工作（RFC draft-ietf-radext-radiusdtls-bis），旨在用 TLS 加密通道彻底替代现有的 UDP 明文传输。

**短期缓解措施**（按优先级排列）：

1. **强制 Message-Authenticator**：所有 RADIUS 请求和响应必须包含 `Message-Authenticator` 属性（基于 HMAC-MD5），这可以有效阻止 Blast-RADIUS 攻击
2. **升级所有 RADIUS 实现**：FreeRADIUS >= 3.0.27 已包含缓解补丁
3. **限制 RADIUS 服务器网络可达性**：将 RADIUS 服务器部署在独立的管理 VLAN 中
4. **启用 EAP 认证**：EAP 协议默认要求 Message-Authenticator，可免疫此攻击

**长期演进方案**：

| 方案 | 协议 | 加密 | 认证 | 状态 |
|-----|------|------|------|------|
| RADIUS/UDP (原始) | UDP | 无 | MD5 | 已不安全 |
| RADIUS + Message-Authenticator | UDP | HMAC-MD5 | MD5+HMAC | 临时缓解 |
| RadSec (RADIUS/TLS) | TCP+TLS | AES-GCM | X.509 | 推荐部署 |
| RADIUS over DTLS | UDP+DTLS | AES-GCM | X.509 | IETF 标准化中 |
| RADIUS over TLS | TCP+TLS | AES-GCM | X.509 | IETF 标准化中 |

---

## 0x02 FreeRADIUS 高危漏洞

### 0x02.1 CVE-2022-33453 — 条件竞争漏洞

#### 漏洞背景

FreeRADIUS 作为全球部署最广泛的开源 RADIUS 服务器实现，在高并发认证场景下存在条件竞争（Race Condition）漏洞。该漏洞影响 FreeRADIUS 的多线程认证处理逻辑，当多个认证请求并发到达时，共享的数据结构可能在未正确同步的情况下被并发访问，导致认证状态不一致。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| FreeRADIUS | 3.0.x 系列部分版本 | 3.0.25+ |
| FreeRADIUS | 2.x 系列 (EOL) | 不修复 |

#### 漏洞原理分析

条件竞争漏洞的核心在于 FreeRADIUS 的多线程模型中，某些共享资源（如会话状态、计数器、临时缓冲区）在并发访问时缺乏充分的互斥保护。攻击者通过精心构造的并发认证请求序列，可以触发以下异常行为：

1. **会话状态混淆**：两个并发请求可能共享同一个 State 属性的处理上下文
2. **认证旁路**：竞争条件可能导致认证检查结果被错误覆盖
3. **内存损坏**：并发写入共享缓冲区可能导致堆内存损坏

#### HTTP/curl PoC — 检测 FreeRADIUS 版本

```bash
#!/bin/bash
TARGET="${1:-127.0.0.1}"
PORT="${2:-1812}"

echo "[*] 检测 FreeRADIUS 版本和配置..."

# 使用 radclient 发送 Status-Server 获取服务器信息
if command -v radclient &>/dev/null; then
    echo "Message-Authenticator = 0x00" | radclient -t 3 -r 1 \
        "${TARGET}:${PORT}" status "testing123" 2>&1 | head -20
else
    echo "[-] radclient 未安装"
    echo "[*] 可通过 nmap 脚本检测:"
    echo "    nmap -sU -p 1812 --script radius-info ${TARGET}"
fi
```

#### Python PoC — 条件竞争检测

> **免责声明**：以下代码仅用于安全研究和授权测试环境。

```python
#!/usr/bin/env python3
"""
FreeRADIUS Race Condition Detection (CVE-2022-33453)
检测 FreeRADIUS 在并发认证场景下的竞争条件

依赖: pip install pycryptodome
"""

import socket
import struct
import hashlib
import os
import threading
import time
import sys
import concurrent.futures

RADIUS_ACCESS_REQUEST = 1
RADIUS_ACCESS_ACCEPT = 2
RADIUS_ACCESS_REJECT = 3


def build_access_request(identifier, username, password, shared_secret):
    """构建 Access-Request 包"""
    attrs = b""
    # User-Name
    username_bytes = username.encode()
    attrs += struct.pack("BB", 1, len(username_bytes) + 2) + username_bytes
    # User-Password (简单编码，实际应使用 RFC 2865 加密)
    password_padded = password.encode().ljust(16, b'\x00')[:16]
    auth_bytes = os.urandom(16)
    encrypted_pw = bytes(a ^ b for a, b in zip(
        password_padded,
        hashlib.md5(auth_bytes + password.encode() + shared_secret.encode()).digest()[:len(password_padded)]
    ))
    attrs += struct.pack("BB", 2, len(encrypted_pw) + 2) + encrypted_pw
    # NAS-IP-Address
    attrs += struct.pack("BBBI", 4, 6, 1, 0xc0a80101)
    # NAS-Port-Type
    attrs += struct.pack("BBBH", 61, 3, 6, 15)

    authenticator = auth_bytes
    header = struct.pack("BBH", RADIUS_ACCESS_REQUEST, identifier, len(attrs) + 20)
    return header[:4] + authenticator + attrs


def send_and_receive(host, port, packet, secret, timeout=3):
    """发送并接收 RADIUS 响应"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        sock.sendto(packet, (host, port))
        resp, _ = sock.recvfrom(4096)
        return resp[0]
    except socket.timeout:
        return None
    except Exception:
        return None
    finally:
        sock.close()


def race_condition_test(host, port, secret, num_threads=50, requests_per_thread=100):
    """并发发送认证请求，检测竞争条件"""
    results = {"accept": 0, "reject": 0, "timeout": 0, "other": 0}
    lock = threading.Lock()

    def worker(thread_id):
        for i in range(requests_per_thread):
            identifier = (thread_id * 100 + i) % 256
            packet = build_access_request(
                identifier, f"user{thread_id}", "wrongpassword", secret
            )
            resp_code = send_and_receive(host, port, packet, secret)
            with lock:
                if resp_code == RADIUS_ACCESS_ACCEPT:
                    results["accept"] += 1
                elif resp_code == RADIUS_ACCESS_REJECT:
                    results["reject"] += 1
                elif resp_code is None:
                    results["timeout"] += 1
                else:
                    results["other"] += 1

    print(f"[*] 启动 {num_threads} 个并发线程，每线程 {requests_per_thread} 个请求...")
    start_time = time.time()

    with concurrent.futures.ThreadPoolExecutor(max_workers=num_threads) as executor:
        futures = [executor.submit(worker, t) for t in range(num_threads)]
        concurrent.futures.wait(futures)

    elapsed = time.time() - start_time
    total = num_threads * requests_per_thread

    print(f"\n[*] 测试完成 ({elapsed:.2f}秒)")
    print(f"[*] 总请求数: {total}")
    print(f"    Access-Accept: {results['accept']}")
    print(f"    Access-Reject: {results['reject']}")
    print(f"    Timeout: {results['timeout']}")
    print(f"    Other: {results['other']}")

    if results["accept"] > 0:
        print(f"\n[!] 警告: 收到 {results['accept']} 个 Access-Accept!")
        print("[!] 使用错误密码却收到 Accept — 可能存在竞争条件漏洞")
    else:
        print(f"\n[+] 未检测到异常 Accept 响应")


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(f"用法: {sys.argv[0]} <host> <port> <shared_secret>")
        sys.exit(1)

    race_condition_test(sys.argv[1], int(sys.argv[2]), sys.argv[3])
```

#### Nuclei YAML 检测模板

```yaml
id: freeradius-race-condition-cve-2022-33453
info:
  name: FreeRADIUS Race Condition Detection
  author: security-researcher
  severity: high
  description: Detects FreeRADIUS race condition vulnerability
  classification:
    cvss-score: 7.5
    cwe-id: CWE-362
  tags: freeradius,race-condition,cve2022

network:
  - inputs:
      - data: "010100260000000000000000000000000106010106"
        host: "{{Hostname}}"
        port: "{{Port}}"
        type: udp
        read: 512

    matchers:
      - type: word
        part: body
        words:
          - "FreeRADIUS"

    extractors:
      - type: regex
        regex:
          - "(FreeRADIUS [\\d\\.]+)"
```

---

### 0x02.2 FreeRADIUS 安全配置最佳实践

1. **升级到最新版本**：FreeRADIUS >= 3.0.27 包含 Blast-RADIUS 缓解，>= 3.0.28 包含 2026 年安全修复
2. **强制 Message-Authenticator**：在 `security` 配置段启用 `require_message_authenticator = yes`
3. **限制 Proxy State**：配置 `limit_proxy_state` 防止 state manipulation 攻击
4. **禁用不使用的 EAP 方法**：仅启用组织需要的认证方法
5. **部署 RadSec**：使用 FreeRADIUS 3.2.x 系列的 RadSec 功能（推荐 3.2.9+）
6. **网络隔离**：将 RADIUS 服务器部署在独立管理 VLAN，禁止直接互联网暴露

### 0x02.3 2026 年 FreeRADIUS 安全事件分析

2026 年 6 月 1 日，FreeRADIUS 发布了 3.0.28 和 3.2.9 版本，修复了多个严重的安全问题。这次发布最引人注目的是 FreeRADIUS 团队做出的一个前所未有的决定：**跳过整个 CVE 流程，直接发布安全补丁**。

**修复的关键漏洞包括**：

- **缓冲区溢出**：NAS-Filter-Rule 属性过长导致服务器崩溃（无需认证即可触发）
- **EAP-MSCHAPv2/EAP-MD5/TEAP 溢出**：多种 EAP 方法的缓冲区溢出
- **RadSec 问题**：RadSec (RADIUS/TLS) 的多个实现问题
- **EAP-PWD 线程问题**：导致认证随机失败
- **内存泄漏**：RadSec socket 创建、Stripped-User-Name 更新、home server ping 等场景

**AI 代码分析工具的影响**：

FreeRADIUS 维护者在安全公告中明确指出：

> "Since it's 2026 and everyone is using AI analysis tools, we are not disclosing further details."
> "Due to the low effort required to identify these issues, we are bypassing the normal CVE process, along with the normal embargo procedures."

这一事件标志着开源安全生态的一个重要转折点——**AI 工具使得漏洞发现的成本从数天/数周降低到几分钱的 AI token 费用**，传统的 CVE 披露流程和 90 天禁运期已经不再适用。

---

## 0x03 Samba 高危漏洞

### 0x03.1 CVE-2022-38023 — Netlogon NTLM Relay

#### 漏洞背景

CVE-2022-38023 是 Microsoft 披露的 Netlogon RPC 特权提升漏洞，Samba 作为 Netlogon 协议的开源实现同样受到影响。该漏洞的核心问题是 **Netlogon Secure Channel 使用的 RC4/HMAC-MD5 加密方式在密码学上已被证明不安全**。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| Samba | 所有版本 | 4.16.4+, 4.17.2+, 4.18.0+ |
| Windows Server | 2008 - 2022 | 2022 年 11 月补丁 |

#### 漏洞原理分析

Netlogon Secure Channel 是 Windows 域环境中客户端与域控制器之间建立安全通信通道的机制。CVE-2022-38023 的根本问题在于：

1. **RC4 弱加密**：Netlogon 的 DCE/RPC 批量加密使用 RC4 算法（与 Kerberos rc4-hmac-md5 相同），这在 RFC 8429 中已被明确标记为不安全
2. **NTLM Relay 攻击**：攻击者可以利用 RC4 的弱点，通过 NTLM Relay 技术劫持 Netlogon 安全通道
3. **特权提升**：成功劫持后，攻击者可以伪造 Netlogon 客户端身份，获得域管理员级别的权限

#### HTTP/curl PoC — 检测 Netlogon 加密配置

```bash
#!/bin/bash
# 检测 Windows 域控制器的 Netlogon RC4 状态
# 需要域内认证信息

DOMAIN_CONTROLLER="${1:-dc01.local}"
DOMAIN="${2:-EXAMPLE}"
USERNAME="${3:-administrator}"

echo "[*] 检测 Netlogon 加密配置..."

# 检查 RequireSeal 注册表值 (Windows)
echo "[*] 在域控制器上检查以下注册表值:"
echo "    HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\Netlogon\\Parameters\\RequireSeal"
echo "    值: 0=禁用, 1=兼容模式, 2=强制模式"

# 检查 RejectMd5Clients
echo "[*] 检查 RejectMd5Clients 策略:"
echo "    HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Netlogon\\Parameters\\RejectMd5Clients"
echo "    值: 0=允许, 1=拒绝RC4客户端"

# 使用 nmap 检测
if command -v nmap &>/dev/null; then
    echo "[*] 使用 Nmap 脚本检测..."
    nmap -p 389,636,88,445 --script smb2-security-mode,netlogon "${DOMAIN_CONTROLLER}" 2>/dev/null
fi
```

#### Python PoC — Netlogon 加密降级检测

> **免责声明**：以下代码仅用于安全研究和授权测试环境。

```python
#!/usr/bin/env python3
"""
CVE-2022-38023 Netlogon RC4 Detection
检测域环境中 Netlogon Secure Channel 是否仍使用 RC4 加密
"""

import subprocess
import sys
import re


def check_netlogon_events(dc_ip):
    """
    检测域控制器上的 Netlogon Event ID 5840
    当 RC4 连接被建立时会记录此事件
    """
    print(f"[*] 检测 {dc_ip} 的 Netlogon 加密状态...")
    print("[*] 请在域控制器上检查 Windows 事件日志:")
    print("    日志来源: Netlogon")
    print("    事件 ID: 5840")
    print("    事件描述: The Netlogon service created a secure channel")
    print("             with a client with RC4.")
    print()

    print("[*] PowerShell 检查命令:")
    print(f'    Get-WinEvent -FilterHashtable @{{LogName="System"; ProviderName="Netlogon"; Id=5840}} | Select-Object -First 10')
    print()


def check_samba_config(smb_conf_path="/etc/samba/smb.conf"):
    """检查 Samba 的 Netlogon 加密配置"""
    print(f"[*] 检查 Samba 配置: {smb_conf_path}")
    try:
        with open(smb_conf_path, 'r') as f:
            content = f.read()

        if "server schannel = auto" in content or "server schannel = yes" in content:
            print("[!] Samba 配置允许 Netlogon Secure Channel")
            print("[!] 如果未更新到修复版本，可能使用 RC4 加密")
        else:
            print("[+] Samba 未配置 Netlogon Secure Channel 或已禁用")

        if "server min protocol = SMB2" in content:
            print("[+] SMB 最低协议版本设置为 SMB2+")
    except FileNotFoundError:
        print(f"[-] 未找到配置文件: {smb_conf_path}")
        print("[*] 请检查 samba-tool testparm 输出")


def check_ntlm_config():
    """检查 NTLM 相关安全配置"""
    print("[*] Windows 域环境中 NTLM 安全配置检查:")
    print("    1. 检查是否启用了 SMB 签名:")
    print('       Get-SmbServerConfiguration | Select RequireSecuritySignature')
    print("    2. 检查是否启用了 LDAP 签名:")
    print('       Get-ItemProperty "HKLM:\\System\\CurrentControlSet\\Services\\NTDS\\Parameters" -Name "LDAPServerIntegrity"')
    print("    3. 检查 EPA (Extended Protection for Authentication):")
    print('       Get-ItemProperty "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Netlogon\\Parameters" -Name "RequireUTF8"')


if __name__ == "__main__":
    dc_ip = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
    check_netlogon_events(dc_ip)
    check_samba_config()
    check_ntlm_config()
```

#### Nuclei YAML 检测模板

```yaml
id: samba-netlogon-cve-2022-38023
info:
  name: Samba Netlogon RC4 Weakness Detection
  author: security-researcher
  severity: high
  description: Detects Samba installations vulnerable to Netlogon RC4 weakness
  reference:
    - https://www.samba.org/samba/security/CVE-2022-38023.html
    - https://nvd.nist.gov/vuln/detail/CVE-2022-38023
  classification:
    cvss-score: 8.1
    cwe-id: CWE-327
  tags: samba,netlogon,ntlm,cve2022,cve

network:
  - inputs:
      - data: "{{hex_decode('00')}}{{rand_base(2)}}{{rand_base(2)}}00000000000000000000000000000000000000200002000000"
        host: "{{Hostname}}"
        port: 445
        type: tcp

    matchers:
      - type: word
        words:
          - "Samba"
          - "smb"
        condition: or

    extractors:
      - type: regex
        regex:
          - "(Samba [\\d\\.]+)"
```

---

### 0x03.2 CVE-2023-34966 — Samba Spotlight 无限循环 DoS

#### 漏洞背景

CVE-2023-34966 是 Samba Spotlight（mdssvc）RPC 服务中的一个无限循环漏洞。Spotlight 是 Samba 提供的与 macOS Spotlight 搜索集成的功能，通过 DCE/RPC 协议提供服务。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| Samba | 4.13.x (仅 Spotlight 启用时) | 4.13.13+ |
| Samba | 4.16.x - 4.18.x | 4.16.11, 4.17.10, 4.18.5 |

#### 漏洞原理分析

Samba 的 mdssvc RPC 服务在解析 Spotlight RPC 数据包时，`sl_unpack_loop()` 函数没有验证网络数据包中数组元素计数字段的有效性。攻击者可以传入 `0` 作为计数值，导致函数进入无限循环，消耗 100% CPU 资源，造成拒绝服务。

**关键条件**：服务器必须显式启用 Spotlight 功能（`spotlight = yes`），默认配置下 Spotlight 是关闭的。

#### HTTP/curl PoC — 检测 Spotlight 是否启用

```bash
#!/bin/bash
TARGET="${1:-127.0.0.1}"

echo "[*] 检测 Samba Spotlight 配置..."

# 使用 smbclient 检查共享配置
if command -v smbclient &>/dev/null; then
    echo "[*] 枚举 Samba 共享..."
    smbclient -L "${TARGET}" -N 2>/dev/null | grep -i "spotlight\|share"

    # 检查 smb.conf 是否启用 Spotlight
    echo "[*] 请检查 smb.conf 中的 spotlight 配置:"
    echo "    grep -i spotlight /etc/samba/smb.conf"
fi

# Nmap 检测
echo "[*] 使用 Nmap 检测..."
nmap -p 445 --script smb-enum-shares "${TARGET}" 2>/dev/null | grep -i spotlight
```

#### Nuclei YAML 检测模板

```yaml
id: samba-spotlight-dos-cve-2023-34966
info:
  name: Samba Spotlight Infinite Loop DoS
  author: security-researcher
  severity: high
  description: Detects Samba servers with Spotlight enabled (vulnerable to CVE-2023-34966)
  reference:
    - https://www.samba.org/samba/security/CVE-2023-34966.html
  classification:
    cvss-score: 7.5
    cwe-id: CWE-835
  tags: samba,spotlight,dos,cve2023,cve

network:
  - inputs:
      - data: "{{hex_decode('05')}}{{rand_base(1)}}{{rand_base(1)}}0000000000000000000000000000000000000000"
        host: "{{Hostname}}"
        port: 445
        type: tcp
        read: 256

    matchers:
      - type: word
        words:
          - "SMB"

    extractors:
      - type: regex
        regex:
          - "(Samba [\\d\\.]+)"
```

---

### 0x03.3 CVE-2023-34967 — Samba Spotlight 类型混淆 DoS

#### 漏洞分析

CVE-2023-34967 是 Samba Spotlight mdssvc RPC 服务中的类型混淆漏洞。`dalloc_value_for_key()` 函数在处理特制的 Spotlight RPC 数据包时，会错误地解释数据类型，导致 worker 进程崩溃。CVSS 评分为 5.3（Medium），攻击者无需认证即可远程触发。

#### HTTP/curl PoC — 检测 Samba 版本

```bash
#!/bin/bash
TARGET="${1:-127.0.0.1}"
echo "[*] 检测 Samba 版本: ${TARGET}"
nmap -p 445 --script smb-os-discovery "${TARGET}" 2>/dev/null | grep -E "OS:|Version:|Samba"
```

---

### 0x03.4 CVE-2022-42898 — Kerberos PAC 解析整数溢出

#### 漏洞背景

CVE-2022-42898 是 MIT Kerberos 5 和 Samba 内嵌 Heimdal Kerberos 库中的一个整数溢出漏洞，影响 PAC（Privilege Attribute Certificate）解析功能。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| MIT Kerberos 5 | 1.8 - 1.19.3, 1.20.0 - 1.20.0 | 1.19.4, 1.20.1 |
| Heimdal | < 7.7.1 | 7.7.1+ |
| Samba | < 4.15.12, < 4.16.7, < 4.17.3 | 4.15.12, 4.16.7, 4.17.3 |

> **注意**：此漏洞在 32 位系统上可导致远程代码执行（堆溢出），在 64 位系统上主要导致拒绝服务。

#### 漏洞原理分析

PAC 是 Kerberos 票据中包含用户授权信息的数据结构。在 `krb5_pac_parse()` 函数解析 PAC 时，整数乘法溢出会导致缓冲区分配过小：

1. 攻击者构造一个 PAC，其中某个字段的大小值使得 32 位整数乘法溢出
2. 内核/运行时分配了一个过小的堆缓冲区
3. 后续的 PAC 数据写入超出缓冲区边界，导致堆损坏
4. 在 32 位系统上，攻击者可以控制溢出数据实现 RCE
5. 在 64 位系统上，通常导致进程崩溃（DoS）

#### HTTP/curl PoC — 检测 Kerberos 版本

```bash
#!/bin/bash
echo "[*] 检测系统 Kerberos 版本..."

# 检查 MIT Kerberos 版本
if command -v krb5-config &>/dev/null; then
    echo "[*] MIT Kerberos 版本:"
    krb5-config --version 2>/dev/null
fi

# 检查 Samba 内嵌 Kerberos
if command -v samba &>/dev/null; then
    echo "[*] Samba 版本:"
    samba --version 2>/dev/null
fi

# 检查 Heimdal
if command -v heimdal-versions &>/dev/null; then
    echo "[*] Heimdal 版本:"
    heimdal-versions 2>/dev/null
fi

# 使用 nmap 检测
echo "[*] 使用 Nmap 检测 KDC..."
nmap -p 88 --script krb5-enum-users --script-args userdb=/dev/null 127.0.0.1 2>/dev/null | head -20
```

#### Python PoC — PAC 整数溢出检测

```python
#!/usr/bin/env python3
"""
CVE-2022-42898 Kerberos PAC Integer Overflow Detection
检测 KDC 是否使用存在漏洞的 Kerberos 版本

依赖: pip install impacket
"""

import sys

try:
    from impacket.krb5.kerberosv5 import KerberosV5
    from impacket.krb5.types import Principal, KerberosTime
    IMPACKET_AVAILABLE = True
except ImportError:
    IMPACTION_AVAILABLE = False
    print("[*] impacket 未安装，使用简化检测")
    print("[*] pip install impacket")


def detect_kerberos_version(kdc_host, kdc_port=88):
    """通过 Kerberos 协议交互检测版本信息"""
    print(f"[*] 目标 KDC: {kdc_host}:{kdc_port}")

    # 发送 AS-REQ 并检查响应中的版本信息
    # 注意: 这只是简单的连通性检测
    import socket
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((kdc_host, kdc_port))
        print(f"[+] KDC 端口开放: {kdc_host}:{kdc_port}")
        sock.close()
    except Exception as e:
        print(f"[-] KDC 不可达: {e}")
        return

    print("[*] 建议检查以下组件的版本:")
    print("    - krb5kdc (MIT Kerberos)")
    print("    - Samba AD DC (内嵌 Heimdal)")
    print("    - 升级到 krb5 >= 1.19.4 或 1.20.1+")
    print("    - 升级到 Samba >= 4.15.12 / 4.16.7 / 4.17.3")


if __name__ == "__main__":
    kdc = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
    detect_kerberos_version(kdc)
```

#### Nuclei YAML 检测模板

```yaml
id: samba-kerberos-pac-cve-2022-42898
info:
  name: Samba Kerberos PAC Integer Overflow Detection
  author: security-researcher
  severity: high
  description: Detects Samba/Kerberos versions vulnerable to PAC integer overflow
  reference:
    - https://www.samba.org/samba/security/CVE-2022-42898.html
    - https://web.mit.edu/kerberos/advisories/
  classification:
    cvss-score: 8.8
    cwe-id: CWE-190
  tags: samba,kerberos,pac,cve2022,cve,overflow

tcp:
  - inputs:
      - data: "\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x01"
        host: "{{Hostname}}"
        port: 88

    matchers:
      - type: word
        words:
          - "\x00\x05"
```

---

### 0x03.5 CVE-2026-4408 — Samba SAMR 命令注入 RCE

#### 漏洞背景

CVE-2026-4408 是 2026 年 5 月披露的 Samba 远程代码执行漏洞，CVSS 评分 9.8（Critical）。该漏洞影响 Samba 文件服务器和经典域控制器的 SAMR DCE/RPC 服务。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| Samba | 4.22.0 - 4.22.9 | 4.22.10 |
| Samba | 4.23.0 - 4.23.7 | 4.23.8 |
| Samba | 4.24.0 - 4.24.2 | 4.24.3 |

#### 漏洞原理分析

当 Samba 文件服务器或经典域控制器配置了 `check password script` 并使用 `%u` 替换字符时，客户端控制的用户名会在未正确转义 shell 元字符的情况下传递给脚本。

**攻击链**：
1. `samba-dcerpcd` 服务作为系统服务运行
2. `smb.conf` 中配置了带 `%u` 的 `check password script`
3. 攻击者通过 SAMR RPC 接口发起 `SamValidatePasswordChange` 或 `SamValidatePasswordReset` 请求
4. 用户名字段包含 shell 元字符（如 `"; id > /tmp/exploit; "`）
5. `%u` 替换未转义，命令被注入执行

#### HTTP/curl PoC — 检测易受攻击配置

```bash
#!/bin/bash
TARGET="${1:-127.0.0.1}"

echo "[*] 检测 CVE-2026-4408 易受攻击配置..."

# 检查 samba-dcerpcd 是否作为系统服务运行
echo "[*] 检查 samba-dcerpcd 服务状态:"
systemctl status samba-dcerpcd 2>/dev/null || echo "    samba-dcerpcd 未作为 systemd 服务运行"

# 检查 smb.conf 中的 check password script
echo "[*] 检查 check password script 配置:"
testparm -v 2>/dev/null | grep -i "check password script" || echo "    未配置 check password script"

# 使用 Nmap 检测 SAMR 服务
echo "[*] 使用 Nmap 检测 SAMR 服务..."
nmap -p 445 --script smb-enum-shares,smb-os-discovery "${TARGET}" 2>/dev/null | head -30
```

#### Nuclei YAML 检测模板

```yaml
id: samba-samr-rce-cve-2026-4408
info:
  name: Samba SAMR Command Injection RCE
  author: security-researcher
  severity: critical
  description: Detects Samba vulnerable to SAMR check password script command injection
  reference:
    - https://www.samba.org/samba/security/CVE-2026-4408.html
    - https://nvd.nist.gov/vuln/detail/CVE-2026-4408
  classification:
    cvss-score: 9.8
    cwe-id: CWE-78
  tags: samba,samr,rce,cve2026,cve,injection

network:
  - inputs:
      - data: "{{hex_decode('00')}}{{rand_base(2)}}{{rand_base(2)}}00000000"
        host: "{{Hostname}}"
        port: 445
        type: tcp
        read: 1024

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "Samba"

    extractors:
      - type: regex
        regex:
          - "(Samba [\\d\\.]+)"
```

---

### 0x03.6 CVE-2026-4480 — Samba 打印子系统 RCE

#### 漏洞背景

CVE-2026-4480 是 Samba 打印子系统中的未认证远程代码执行漏洞，CVSS 评分 10.0（满分），被 Samba 团队评为最高严重等级。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| Samba | 4.22.0 - 4.22.9 | 4.22.10 |
| Samba | 4.23.0 - 4.23.7 | 4.23.8 |
| Samba | 4.24.0 - 4.24.2 | 4.24.3 |

#### 漏洞原理分析

Samba 的 `print command` 配置项支持 `%J` 宏（代表打印作业名称），该名称由客户端控制。在补丁发布前，作业名称中仅将单引号替换为下划线，其他 shell 元字符完全未过滤。

**关键细节**：通过传统 `smbclient` 的 RAP 打印路径，元字符会被提前清理。但通过 `spoolss` RPC 接口提交的打印作业，作业名称作为文档名直接传递给 `%J`，绕过了清理逻辑。

#### HTTP/curl PoC — 检测打印共享

```bash
#!/bin/bash
TARGET="${1:-127.0.0.1}"

echo "[*] 检测 CVE-2026-4480 打印共享配置..."

# 枚举共享
echo "[*] 枚举 Samba 共享..."
smbclient -L "${TARGET}" -N 2>/dev/null | grep -i "print"

# 检查 smb.conf 打印配置
echo "[*] 检查打印相关配置:"
testparm -v 2>/dev/null | grep -E "print command|printing|spoolss" || echo "    无法读取配置"

# Nmap 检测
echo "[*] 使用 Nmap 检测打印服务..."
nmap -p 445 --script smb-enum-shares "${TARGET}" 2>/dev/null | grep -i print
```

#### Nuclei YAML 检测模板

```yaml
id: samba-print-rce-cve-2026-4480
info:
  name: Samba Print Command Injection RCE
  author: security-researcher
  severity: critical
  description: Detects Samba vulnerable to print command injection via %J macro
  reference:
    - https://www.hackthebox.com/blog/cve-2026-4480-samba-rce-vulnerability
  classification:
    cvss-score: 10.0
    cwe-id: CWE-78
  tags: samba,print,rce,cve2026,cve,injection

network:
  - inputs:
      - data: "{{hex_decode('00')}}{{rand_base(2)}}{{rand_base(2)}}00000000"
        host: "{{Hostname}}"
        port: 445
        type: tcp
        read: 1024

    matchers:
      - type: word
        words:
          - "Samba"
```

---

## 0x04 ISC DHCP/Kea 高危漏洞

### 0x04.1 CVE-2026-3608 — ISC Kea DHCP 栈溢出

#### 漏洞背景

CVE-2026-3608 是 ISC Kea DHCP 服务器中的一个高危栈溢出漏洞，CVSS 评分 7.5，由 Keysight 的 Ali Norouzi 发现并报告。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| ISC Kea | 2.6.0 - 2.6.4 | 2.6.5 |
| ISC Kea | 3.0.0 - 3.0.2 | 3.0.3 |

#### 漏洞原理分析

Kea 守护进程在处理通过 API Socket 或 HA（High Availability）监听器传入的消息时，未正确验证输入数据。当接收到来自 API socket 或 HA listener 的精心构造的消息时，内部的递归 JSON 解析函数没有充分限制递归深度，导致栈空间耗尽，触发栈溢出并使进程异常终止。

**影响组件**：kea-ctrl-agent、kea-dhcp-ddns、kea-dhcp4、kea-dhcp6 均受影响。

**攻击条件**：攻击者需要能够访问 Kea 的 API socket 或 HA listener 端口，无需认证。

#### HTTP/curl PoC — 检测 Kea API 可达性

```bash
#!/bin/bash
TARGET="${1:-127.0.0.1}"
API_PORT="${2:-8000}"

echo "[*] 检测 Kea DHCP API 可达性: ${TARGET}:${API_PORT}"

# 检测 Kea Control Agent API
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"command":"version-get","service":["dhcp4"]}' \
    "http://${TARGET}:${API_PORT}/" 2>/dev/null)

if [ "${HTTP_CODE}" = "200" ]; then
    echo "[+] Kea API 端口开放且可访问"
    echo "[!] 可能存在 CVE-2026-3608 风险 — 请确认 Kea 版本"

    # 获取版本信息
    curl -s -X POST \
        -H "Content-Type: application/json" \
        -d '{"command":"version-get","service":["dhcp4"]}' \
        "http://${TARGET}:${API_PORT}/" 2>/dev/null | python3 -m json.tool 2>/dev/null
else
    echo "[-] Kea API 不可达 (HTTP ${HTTP_CODE})"
fi
```

#### Python PoC — Kea 栈溢出检测

> **免责声明**：以下代码仅用于安全研究和授权测试环境。

```python
#!/usr/bin/env python3
"""
CVE-2026-3608 Kea DHCP Stack Overflow Detection
检测 Kea DHCP API 是否存在栈溢出漏洞
"""

import json
import sys

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False
    print("[*] requests 未安装: pip install requests")


def check_kea_version(host, port=8000):
    """通过 API 检查 Kea 版本"""
    url = f"http://{host}:{port}/"

    payload = {
        "command": "version-get",
        "service": ["dhcp4"]
    }

    headers = {"Content-Type": "application/json"}

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            print(f"[+] Kea API 响应: {json.dumps(data, indent=2)}")

            # 检查版本
            result = data.get("arguments", {}).get("extended", "")
            if result:
                version = result.split("-")[0] if "-" in result else result
                print(f"[*] Kea 版本: {version}")

                # 检查是否在受影响范围内
                parts = version.split(".")
                if len(parts) >= 2:
                    major = int(parts[0])
                    minor = int(parts[1])

                    if major == 2 and minor == 6:
                        patch = int(parts[2]) if len(parts) > 2 else 0
                        if patch <= 4:
                            print("[!] 易受 CVE-2026-3608 影响! 请升级到 2.6.5+")
                    elif major == 3 and minor == 0:
                        patch = int(parts[2]) if len(parts) > 2 else 0
                        if patch <= 2:
                            print("[!] 易受 CVE-2026-3608 影响! 请升级到 3.0.3+")
                    else:
                        print("[+] 版本不在已知受影响范围内")
        else:
            print(f"[-] API 返回 HTTP {resp.status_code}")
    except requests.exceptions.ConnectionError:
        print(f"[-] 无法连接到 Kea API: {host}:{port}")
    except Exception as e:
        print(f"[-] 检测失败: {e}")


if __name__ == "__main__":
    if not REQUESTS_AVAILABLE:
        sys.exit(1)

    host = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8000

    check_kea_version(host, port)
```

#### Nuclei YAML 检测模板

```yaml
id: kea-dhcp-stackoverflow-cve-2026-3608
info:
  name: ISC Kea DHCP Stack Overflow Detection
  author: security-researcher
  severity: high
  description: Detects ISC Kea DHCP vulnerable to stack overflow via API socket
  reference:
    - https://kb.isc.org/docs/cve-2026-3608
    - https://nvd.nist.gov/vuln/detail/CVE-2026-3608
  classification:
    cvss-score: 7.5
    cwe-id: CWE-121
  tags: kea,dhcp,stack-overflow,cve2026,cve

http:
  - method: POST
    path:
      - "{{BaseURL}}/"
    headers:
      Content-Type: application/json
    body: '{"command":"version-get","service":["dhcp4"]}'

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "result"
          - "version"
        condition: and

    extractors:
      - type: json
        json:
          - ".arguments.version"
```

---

### 0x04.2 CVE-2018-5732 — ISC DHCP dhclient 缓冲区溢出

#### 漏洞背景

CVE-2018-5732 是 ISC DHCP `dhclient` 中的缓冲区溢出漏洞，由 Google 安全团队的 Felix Wilhelm 发现。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| ISC DHCP | 4.1.0 - 4.1-ESV-R15 | 4.1-ESV-R15-P1 |
| ISC DHCP | 4.2.0 - 4.2.8 | 4.2.9 |
| ISC DHCP | 4.3.0 - 4.3.6 | 4.3.6-P1 |
| ISC DHCP | 4.4.0 | 4.4.1 |

#### 漏洞原理分析

`dhclient` 在处理 DHCP 选项时，未对缓冲区进行充分的边界检查。恶意 DHCP 服务器可以发送包含特殊构造选项的响应包，导致缓冲区溢出。

**利用条件**：攻击者需要控制或伪装为 DHCP 服务器，或者处于客户端和真实 DHCP 服务器之间的中间人位置。

#### HTTP/curl PoC — 检测 DHCP 客户端版本

```bash
#!/bin/bash
echo "[*] 检测 ISC DHCP 版本..."

# 检查 dhclient 版本
if command -v dhclient &>/dev/null; then
    echo "[*] dhclient 版本:"
    dhclient --version 2>&1 | head -5
fi

# 检查 dhcpd 版本
if command -v dhcpd &>/dev/null; then
    echo "[*] dhcpd 版本:"
    dhcpd --version 2>&1 | head -5
fi

# 检查包管理器版本
echo "[*] 包管理器版本:"
dpkg -l | grep -i dhcp 2>/dev/null || rpm -qa | grep -i dhcp 2>/dev/null

echo "[*] 如版本在 4.1.0 - 4.4.0 之间，请升级到修复版本"
```

#### Nuclei YAML 检测模板

```yaml
id: isc-dhcp-buffer-overflow-cve-2018-5732
info:
  name: ISC DHCP dhclient Buffer Overflow Detection
  author: security-researcher
  severity: high
  description: Detects ISC DHCP installations vulnerable to dhclient buffer overflow
  reference:
    - https://kb.isc.org/docs/aa-01562
    - https://nvd.nist.gov/vuln/detail/CVE-2018-5732
  classification:
    cvss-score: 7.5
    cwe-id: CWE-120
  tags: isc,dhcp,buffer-overflow,cve2018,cve

tcp:
  - inputs:
      - data: "\x01\x01\x06\x00"
        host: "{{Hostname}}"
        port: 67
        read: 512

    matchers:
      - type: word
        words:
          - "DHCP"
```

---

## 0x05 公开 PoC 收集情况与利用思路

### PoC 收集情况总表

| CVE | PoC 状态 | 来源 | 类型 |
|-----|---------|------|------|
| CVE-2024-3596 | ✅ 已公开 | blast-radius.fail, GitHub | 完整攻击工具 |
| CVE-2022-33453 | ⚠️ 有限 | FreeRADIUS 官方 | 缓解补丁 |
| CVE-2015-4680 | ⚠️ 理论 | CVE 描述 | 配置绕过 |
| FreeRADIUS 2026 | ❌ 未公开 | FreeRADIUS 官方 | 补丁（未披露细节） |
| CVE-2022-38023 | ⚠️ 间接 | Microsoft/Samba | 配置加固 |
| CVE-2023-34966 | ✅ PoC | Samba 安全公告 | DoS |
| CVE-2023-34967 | ✅ PoC | Samba 安全公告 | DoS |
| CVE-2022-42898 | ✅ 已公开 | MIT/Samba | 整数溢出/堆损坏 |
| CVE-2026-4408 | ⚠️ 理论 | Samba 安全公告 | 命令注入 RCE |
| CVE-2026-4480 | ⚠️ 理论 | HackTheBox 研究 | 命令注入 RCE |
| CVE-2026-3608 | ⚠️ 有限 | ISC 安全公告 | 栈溢出 DoS |
| CVE-2018-5732 | ✅ 已公开 | ISC 安全公告 | 缓冲区溢出 |

### 关键 PoC 仓库链接

| 仓库/资源 | URL | 说明 |
|-----------|-----|------|
| Blast-RADIUS 官方 | https://www.blastradius.fail/ | CVE-2024-3596 完整攻击论文与工具 |
| Blast-RADIUS 论文 | https://www.blastradius.fail/pdf/radius.pdf | USENIX Security 2024 论文 |
| FreeRADIUS 安全公告 | https://www.freeradius.org/security/ | 所有 FreeRADIUS 安全通告 |
| Samba 安全公告 | https://www.samba.org/samba/security/ | Samba CVE 安全通告 |
| MIT Kerberos 安全通告 | https://web.mit.edu/kerberos/advisories/ | Kerberos 安全更新 |
| IETF RADIUS Deprecation | https://datatracker.ietf.org/doc/draft-ietf-radext-deprecating-radius/ | RADIUS 协议弃用草案 |
| RADIUS over DTLS | https://datatracker.ietf.org/doc/draft-ietf-radext-radiusdtls-bis/ | RADIUS over DTLS 标准化 |

### 防守型验证思路

1. **版本审计**：使用 `radclient`、`samba --version`、`krb5-config --version` 等工具确认组件版本
2. **配置检查**：审查 `smb.conf`、`radiusd.conf`、`eap.conf` 中的安全配置
3. **网络扫描**：使用 Nmap NSE 脚本批量检测 RADIUS/SMB/Kerberos 服务暴露面
4. **流量分析**：抓取 RADIUS 流量检查是否包含 Message-Authenticator 属性
5. **渗透测试**：在授权范围内使用上述 PoC 验证漏洞存在性

---

## 0x06 共性攻击模式分析

### 攻击模式一：协议层密码学缺陷

**代表漏洞**：CVE-2024-3596 (Blast-RADIUS)、CVE-2022-38023 (Netlogon RC4)

RADIUS 协议和 Netlogon 协议都使用了过时的密码学原语（MD5、RC4）。这些协议在设计时（1990 年代）这些算法被认为是安全的，但随着密码学研究的进展，它们已经不再可靠。**协议级密码学缺陷的影响范围极广，因为它们影响所有实现该协议的系统**。

### 攻击模式二：输入验证缺失导致的内存损坏

**代表漏洞**：CVE-2022-42898 (PAC 整数溢出)、CVE-2026-3608 (Kea 栈溢出)、CVE-2018-5732 (dhclient 溢出)、FreeRADIUS 2026 批量漏洞

从 PAC 解析的整数乘法溢出，到 Kea 的 JSON 递归解析栈溢出，再到 dhclient 的 DHCP 选项缓冲区溢出，这些漏洞都源于同一个根因：**对网络输入数据的边界检查不足**。在处理来自不可信来源的数据时，任何整数运算、缓冲区操作、递归调用都必须进行严格的边界验证。

### 攻击模式三：Shell 元字符注入

**代表漏洞**：CVE-2026-4408 (SAMR check password script)、CVE-2026-4480 (print command %J)

当应用程序将用户可控的数据传递给 shell 执行时，如果未正确转义元字符，就会导致命令注入。Samba 在两个不同的子系统中都犯了相同的错误：`check password script` 的 `%u` 替换和 `print command` 的 `%J` 替换。**这类漏洞的防御关键在于永远不要将用户输入直接传递给 shell**。

### 攻击模式四：认证状态管理缺陷

**代表漏洞**：CVE-2022-33453 (FreeRADIUS 竞争条件)、CVE-2015-4680 (中间 CA 证书绕过)

认证系统中的状态管理异常复杂，涉及会话缓存、TLS 会话恢复、证书链验证等多个环节。竞争条件导致的状态不一致和证书验证链中的遗漏都可能导致认证被绕过。**防御关键在于使用经过验证的认证框架，并确保状态转换的原子性**。

### 攻击模式五：协议降级与中间人攻击

**代表漏洞**：CVE-2022-38023 (NTLM Relay)、CVE-2024-3596 (Blast-RADIUS)

攻击者通过中间人位置，可以将使用安全加密的通信降级到不安全的加密方式（如 RC4），或者利用协议中缺少完整性校验的弱点伪造合法响应。**防御关键在于强制使用强加密、部署通道绑定（Channel Binding）和启用 TLS**。

---

## 0x07 应急排查与防守建议

### 紧急排查清单

- [ ] **FreeRADIUS 版本确认**：`freeradius -v` 或 `radiusd -v`，确保 >= 3.0.27（Blast-RADIUS 缓解）和 >= 3.0.28（2026 安全修复）
- [ ] **Message-Authenticator 强制**：在 `radiusd.conf` 的 `security` 段中设置 `require_message_authenticator = yes`
- [ ] **Samba 版本确认**：`samba --version`，确保 >= 4.22.10 / 4.23.8 / 4.24.3（修复 CVE-2026-4408 和 CVE-2026-4480）
- [ ] **Netlogon 加密配置**：检查 Windows 域控制器的 `RequireSeal` 注册表值是否设为 `2`
- [ ] **Spotlight 功能检查**：`grep -i spotlight /etc/samba/smb.conf`，确保未启用或已更新
- [ ] **Kerberos 版本检查**：`krb5-config --version`，确保 >= 1.19.4 或 1.20.1+
- [ ] **Kea DHCP 版本检查**：通过 API 或 `kea-dhcp4 --version` 确认版本 >= 2.6.5 或 3.0.3
- [ ] **DHCP 客户端版本**：`dhclient --version`，确保 ISC DHCP >= 4.4.1
- [ ] **check password script 检查**：`testparm -v | grep "check password script"`，如果配置了 `%u` 则需要立即移除或升级 Samba
- [ ] **打印共享检查**：`testparm -v | grep "print command"`，如果配置了 `%J` 则需要立即移除或升级 Samba

### RADIUS 安全加固

| 措施 | 优先级 | 操作 |
|------|--------|------|
| 启用 RadSec (RADIUS/TLS) | 高 | 将 FreeRADIUS 升级到 3.2.9+，配置 TLS 证书 |
| 强制 Message-Authenticator | 高 | `require_message_authenticator = yes` |
| 弃用 PAP/MD5 认证 | 高 | 迁移到 EAP-PEAP/EAP-TTLS/EAP-TLS |
| 网络隔离 | 中 | RADIUS 服务器部署在独立管理 VLAN |
| 定期更新共享密钥 | 中 | 使用强随机生成的 Shared Secret（>= 16 字节） |
| 启用 RADIUS 日志审计 | 中 | 记录所有认证请求和响应的关键字段 |

### Samba/AD 安全加固

| 措施 | 优先级 | 操作 |
|------|--------|------|
| 立即升级 Samba | 紧急 | 更新到最新安全版本 |
| 禁用 RC4 加密 | 高 | `server schannel = no` 或确保使用 AES |
| 启用 SMB 签名 | 高 | `server signing = mandatory` |
| 禁用不需要的打印共享 | 高 | 移除 `print command` 配置中的 `%J` |
| 移除 check password script | 高 | 移除 `check password script` 中的 `%u` 或禁用该功能 |
| 禁用 Spotlight | 中 | 确保 `spotlight = no`（默认值） |
| 强制 Kerberos 认证 | 中 | 减少 NTLM 依赖，部署 EPA |

### 日志关键字段表

| 日志来源 | 关键字段/事件 | 含义 |
|---------|-------------|------|
| FreeRADIUS | `Auth-Reject` / `Auth-Accept` | 认证结果 |
| FreeRADIUS | `Message-Authenticator` | Blast-RADIUS 缓解状态 |
| Windows DC | Event ID 5840 | Netlogon RC4 连接告警 |
| Windows DC | Event ID 5838 | Netlogon 签名/加密状态 |
| Samba | `samba-dcerpcd` 进程异常退出 | 可能的溢出攻击 |
| Kea DHCP | `kea-dhcp4` / `kea-dhcp6` 进程崩溃 | 栈溢出攻击 |
| Kerberos | TGS-REQ 中的 PAC 解析错误 | CVE-2022-42898 利用尝试 |

### 长期安全加固建议

1. **协议现代化**：将 RADIUS/UDP 迁移到 RadSec (RADIUS/TLS)，将 Netlogon 从 RC4 迁移到 AES
2. **零信任架构**：实施网络准入控制（NAC）+ 802.1X + EAP 的多层认证
3. **自动化补丁管理**：建立针对 FreeRADIUS、Samba、Kerberos 的自动化补丁流程
4. **AI 辅助安全审计**：借鉴 FreeRADIUS 2026 年的经验，使用 AI 代码分析工具主动发现安全问题
5. **漏洞情报订阅**：订阅 FreeRADIUS、Samba、ISC 的安全公告邮件列表

---

## 0x08 参考资料

1. **Blast-RADIUS 论文** — Goldberg, S. et al. "RADIUS/UDP considered harmful" USENIX Security 2024. https://www.blastradius.fail/pdf/radius.pdf
2. **CVE-2024-3596 NVD** — https://nvd.nist.gov/vuln/detail/CVE-2024-3596
3. **FreeRADIUS 安全公告** — https://www.freeradius.org/security/
4. **Samba CVE-2026-4408** — https://www.samba.org/samba/security/CVE-2026-4408.html
5. **Samba CVE-2022-38023** — https://www.samba.org/samba/security/CVE-2022-38023.html
6. **Samba CVE-2022-42898** — https://www.samba.org/samba/security/CVE-2022-42898.html
7. **ISC Kea CVE-2026-3608** — https://kb.isc.org/docs/cve-2026-3608
8. **ISC DHCP CVE-2018-5732** — https://kb.isc.org/docs/aa-01562
9. **IETF RADIUS Deprecation Draft** — https://datatracker.ietf.org/doc/draft-ietf-radext-deprecating-radius/
10. **Cisco Blast-RADIUS 缓解** — https://www.cisco.com/c/en/us/support/docs/security/identity-services-engine/222287-blast-radius-cve-2024-3596-protocol-sp.html
11. **HackTheBox CVE-2026-4480 分析** — https://www.hackthebox.com/blog/cve-2026-4480-samba-rce-vulnerability
12. **Microsoft CVE-2022-38023** — https://msrc.microsoft.com/update-guide/vulnerability/CVE-2022-38023

---

> **免责声明**：本文仅用于安全研究和授权测试目的。文中提供的 PoC 代码和技术细节严禁用于未授权的攻击行为。作者不对因使用文中信息而导致的任何损害或违法行为承担责任。所有测试应在获得明确授权的环境中进行，并遵守当地法律法规。