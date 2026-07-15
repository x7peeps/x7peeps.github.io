---
title: "SSH与远程终端访问安全高危攻击链专题：OpenSSH / Dropbear 漏洞全解析"
date: 2026-07-10T14:00:00+08:00
draft: false
categories: ["渗透测试", "漏洞分析"]
tags: ["OpenSSH", "Dropbear", "SSH", "远程终端", "RCE", "认证绕过", "漏洞分析", "Terrapin", "regreSSHion"]
---

> **免责声明**：本文仅用于安全研究与授权渗透测试目的。所有 PoC 代码和攻击手法均应在合法授权范围内使用。未经授权对目标系统进行攻击属于违法行为。作者不对因使用本文内容造成的任何直接或间接损害承担责任。

## 0x00 专题概述

### SSH 协议在企业安全架构中的核心地位

SSH（Secure Shell）是现代企业 IT 基础设施中最关键的远程访问协议之一。从云服务器运维、CI/CD 自动化部署到数据库管理、网络设备配置，SSH 承载着企业内部几乎所有的加密远程管理流量。据统计，互联网上超过 **1500 万台服务器**运行着 OpenSSH，而嵌入式设备（路由器、IoT、NAS）则大量部署轻量级的 Dropbear SSH。

近年来，SSH 相关组件已成为 APT 组织和漏洞猎人的高价值目标：

- **regreSSHion（CVE-2024-6387）**：2024 年 7 月，Qualys 发现 OpenSSH 服务器中的回归漏洞，可实现未认证远程代码执行，影响全球超 600 万台暴露在互联网上的服务器
- **Terrapin Attack（CVE-2023-48795）**：首个可利用的 SSH 协议前缀截断攻击，影响几乎所有主流 SSH 实现
- **ssh-agent RCE（CVE-2023-38408）**：CVSS 9.8，通过 agent forwarding 实现远程代码执行
- **Dropbear Unix Socket 提权（CVE-2025-14282）**：CVSS 9.8，影响数十万台路由器和 IoT 设备

### 本文 CVE 覆盖范围

| CVE 编号 | 产品 | CVSS | 漏洞类型 | 利用条件 |
|----------|------|------|----------|----------|
| CVE-2024-6387 | OpenSSH | 8.1 | 竞态条件 RCE | 未认证，需多次连接 |
| CVE-2023-48795 | OpenSSH/Dropbear | 5.9 | 前缀截断攻击 | MitM 位置 |
| CVE-2023-38408 | OpenSSH | 9.8 | ssh-agent RCE | Agent Forwarding |
| CVE-2023-51385 | OpenSSH | 6.5 | OS 命令注入 | 恶意 Hostname |
| CVE-2025-26465 | OpenSSH | 6.8 | MitM 认证绕过 | VerifyHostKeyDNS |
| CVE-2025-26466 | OpenSSH | 5.9 | 预认证 DoS | 网络访问 |
| CVE-2026-60002 | OpenSSH | 7.7 | Use-After-Free | 恶意服务器 |
| CVE-2021-41617 | OpenSSH | 7.0 | 权限提升 | 特定配置 |
| CVE-2021-28041 | OpenSSH | 7.0 | Double Free | Agent Forwarding |
| CVE-2020-14145 | OpenSSH | 5.9 | 信息泄露 | MitM 位置 |
| CVE-2025-14282 | Dropbear | 9.8 | Unix Socket 提权 | 已认证用户 |
| CVE-2025-47203 | Dropbear | 4.5 | 命令注入 | 本地/脚本 |
| CVE-2023-48795 | Dropbear | 5.9 | Terrapin 攻击 | MitM 位置 |
| CVE-2021-36369 | Dropbear | 7.5 | 认证绕过 | 恶意服务器 |
| CVE-2020-36254 | Dropbear | 8.1 | SCP 文件覆盖 | 恶意服务器 |

---

## 0x01 OpenSSH 高危漏洞

### 0x01.1 CVE-2024-6387 — regreSSHion 竞态条件 RCE

#### 漏洞背景

CVE-2024-6387，被命名为 **regreSSHion**，由 Qualys 威胁研究团队于 2024 年 7 月 1 日披露。这是一个极其特殊的安全回归（Security Regression）——它重引入了 2006 年 CVE-2006-5051 的修复漏洞。

历史脉络：
- **2006年**：Mark Dowd 发现 OpenSSH 的 SIGALRM 信号处理程序中存在竞态条件（CVE-2006-5051）
- **2006年**：修复通过在 `sigdie()` 函数中添加 `#ifdef DO_LOG_SAFE_IN_SIGHAND` 宏实现
- **2020年10月**：OpenSSH 8.5p1 重构日志基础设施时，**不慎删除了该宏**
- **2024年7月**：Qualys 重新发现此漏洞，并证明可在 glibc Linux 系统上实现远程 root 代码执行

该漏洞被 CISA 收录进 Known Exploited Vulnerabilities (KEV) 目录。

#### 受影响版本

| 版本分支 | 受影响版本 | 修复版本 |
|----------|-----------|---------|
| OpenSSH（回归） | 8.5p1 ≤ version < 9.8p1 | 9.8p1 |
| OpenSSH（原始） | < 4.4p1（未修补 CVE-2006-5051） | 4.4p1+ |
| Debian/Ubuntu | 各发行版回溯补丁版本 | 见发行版公告 |
| CentOS/RHEL | 7/8/9 系列受影响 | 见 RHSA 公告 |

#### 漏洞原理分析

漏洞发生在 OpenSSH 服务器（sshd）处理 `LoginGraceTime` 超时的信号处理路径上：

1. 当客户端未在 `LoginGraceTime`（默认 120 秒）内完成认证时，sshd 会触发 `SIGALRM` 信号
2. `SIGALRM` handler 调用 `sigdie()` 函数，该函数内部调用了 `syslog()` 等**非异步信号安全**（non-async-signal-safe）的函数
3. `syslog()` 在 glibc 中可能触发 `malloc()` / `free()` 等堆管理操作
4. 攻击者通过精确控制连接时序，在堆管理函数执行的**关键时刻**中断执行流
5. 利用堆损坏（heap corruption）实现任意代码执行

利用难点在于：
- 需要精确命中 ~1ms 的竞态窗口
- 平均需约 **10,000 次尝试**才能赢得竞态
- 在 ASLR 保护下，完整利用需要 **6-8 小时**
- 仅影响 glibc-based Linux 系统的 32 位架构（64 位理论上可行但更难）

#### HTTP/curl PoC

```bash
#!/bin/bash
# CVE-2024-6387 受影响版本检测脚本
TARGET="${1:-localhost}"
PORT="${2:-22}"

BANNER=$(echo "" | timeout 5 curl -s "telnet://${TARGET}:${PORT}" 2>/dev/null)
if echo "$BANNER" | grep -qE "SSH-2.0-OpenSSH_(8\.[5-9]|9\.[0-7])"; then
    echo "[!] ${TARGET}:${PORT} 可能受 CVE-2024-6387 影响: $BANNER"
else
    echo "[*] ${TARGET}:${PORT} Banner: $BANNER"
    echo "[*] 无法确认是否受影响，建议使用 ssh -V 进一步验证"
fi
```

#### Python PoC 脚本

```python
import socket
import sys
import time

def detect_openssh_version(target, port=22, timeout=5):
    """检测目标 OpenSSH 版本，判断是否受 CVE-2024-6387 影响"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((target, port))

        banner = sock.recv(1024).decode('utf-8', errors='ignore').strip()
        sock.close()

        print(f"[*] SSH Banner: {banner}")

        if "OpenSSH" not in banner:
            print("[*] 目标不是 OpenSSH 服务器")
            return banner, False

        version_str = banner.split("OpenSSH_")[1].split("p")[0]
        parts = version_str.split(".")
        major, minor = int(parts[0]), int(parts[1])

        vulnerable = False
        if major == 8 and minor >= 5:
            vulnerable = True
        elif major == 9 and minor <= 7:
            vulnerable = True

        if vulnerable:
            print(f"[!] 目标可能受 CVE-2024-6387 (regreSSHion) 影响!")
            print(f"    OpenSSH {version_str} 在 8.5p1 - 9.7p1 受影响范围")
            print(f"    需要 glibc-based Linux + 32位架构才能完整利用")
        else:
            print(f"[*] OpenSSH {version_str} 不在受影响范围内")

        return banner, vulnerable

    except socket.timeout:
        print(f"[!] 连接超时")
        return None, False
    except ConnectionRefusedError:
        print(f"[!] 连接被拒绝")
        return None, False
    except Exception as e:
        print(f"[!] 错误: {e}")
        return None, False

def test_login_grace_race(target, port=22, attempts=3):
    """测试 LoginGraceTime 竞态条件窗口（仅检测，不利用）"""
    print(f"\n[*] 测试 LoginGraceTime 竞态窗口 ({attempts} 次)...")

    for i in range(attempts):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2)
            sock.connect((target, port))

            sock.send(b"SSH-2.0-TestClient\r\n")
            time.sleep(0.001)
            sock.close()

            print(f"    [{i+1}/{attempts}] 连接并快速关闭")
        except:
            print(f"    [{i+1}/{attempts}] 连接异常")

    print("[*] 竞态测试完成，检查服务端日志确认是否存在异常")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target> [port]")
        print(f"示例: {sys.argv[0]} 192.168.1.100 22")
        sys.exit(1)

    target = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 22

    banner, vulnerable = detect_openssh_version(target, port)

    if vulnerable:
        test_login_grace_race(target, port)
```

#### Nuclei YAML 模板

```yaml
id: openssh-cve-2024-6387
info:
  name: OpenSSH regreSSHion Race Condition - CVE-2024-6387
  author: x7peeps
  severity: high
  description: |
    OpenSSH 8.5p1 至 9.7p1 版本存在 SIGALRM 信号处理竞态条件，
    未认证远程攻击者可在 glibc Linux 系统上触发远程代码执行。
    此漏洞是 CVE-2006-5051 的安全回归。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2024-6387
    - https://blog.qualys.com/vulnerabilities-threat-research/2024/07/01/regresshion
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 8.1
    cwe-id: CWE-362
  metadata:
    max-request: 1
  tags: openssh,cve2024,cve,rce,race-condition,regresshion

tcp:
  - inputs:
      - data: "SSH-2.0-TestClient\r\n"
        read: 1024
    host:
      - "{{Hostname}}"
    port: 22

    matchers:
      - type: word
        words:
          - "OpenSSH_8.5"
          - "OpenSSH_8.6"
          - "OpenSSH_8.7"
          - "OpenSSH_8.8"
          - "OpenSSH_8.9"
          - "OpenSSH_9.0"
          - "OpenSSH_9.1"
          - "OpenSSH_9.2"
          - "OpenSSH_9.3"
          - "OpenSSH_9.4"
          - "OpenSSH_9.5"
          - "OpenSSH_9.6"
          - "OpenSSH_9.7"
        condition: or

    extractors:
      - type: regex
        regex:
          - 'SSH-2.0-OpenSSH_[0-9.]+p[0-9]+'
```

---

### 0x01.2 CVE-2023-48795 — Terrapin 前缀截断攻击

#### 漏洞背景

Terrapin Attack 由 Ruhr-Universität Bochum 的安全研究团队于 2023 年 12 月披露，是**首个可实际利用的 SSH 协议前缀截断攻击**。该漏洞存在于 SSH 二进制协议的握手阶段，通过操纵序列号（sequence numbers），攻击者可在不触发 MAC 校验失败的情况下删除握手初期的消息。

该漏洞在 Black Hat USA 2024、USENIX Security 2024 和 Real World Crypto 2024 上发表。

#### 受影响版本

| 实现 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| OpenSSH | < 9.6p1 | 9.6p1 |
| Dropbear | ≤ 2022.83 | 2022.84 |
| PuTTY | < 0.80 | 0.80 |
| libssh | < 0.10.6 | 0.10.6 |
| libssh2 | ≤ 1.11.0 | 1.11.1 |
| AsyncSSH | < 2.14.2 | 2.14.2 |
| Paramiko | < 3.4.0 | 3.4.0 |
| WinSCP | < 6.2.2 | 6.2.2 |

> 注：此漏洞影响的是 SSH **协议本身**，而非单一实现，因此受影响的软件极其广泛。

#### 漏洞原理分析

SSH 协议握手过程中，客户端和服务器交换算法协商消息。攻击流程：

1. 攻击者处于 MitM 位置，拦截并修改 SSH 握手流量
2. 利用 `chacha20-poly1305@openssh.com` 加密模式或 CBC + Encrypt-then-MAC 模式的**序列号特性**
3. 在密钥交换完成后，注入一个 **ignored packet**（`SSH2_MSG_IGNORE`）来偏移序列号
4. 截断关键的 `SSH2_MSG_EXT_INFO` 消息（RFC 8308 扩展协商）
5. 客户端无法检测到消息被删除（MAC 校验通过）
6. **安全降级效果**：
   - 禁用 OpenSSH 9.5 引入的击键时序混淆（keystroke timing obfuscation）
   - 可能禁用更强的签名算法（降级到 SHA-1）
   - 对 AsyncSSH 实现可实现未授权登录

#### HTTP/curl PoC

```bash
# 使用官方 Terrapin Scanner 检测（Go 语言）
# 下载: https://github.com/RUB-NDS/Terrapin-Scanner/releases/latest
./terrapin-scanner scan --host <TARGET_IP> --port 22

# 或通过 SSH 手动检查是否支持 kex-strict
ssh -vv -o StrictHostKeyChecking=no <TARGET_IP> 2>&1 | grep -i "kex-strict"
# 如果输出包含 "kex-strict-s-v00@openssh.com"，则服务器已修补
```

#### Python PoC 脚本

```python
import socket
import struct

def detect_terrapin_vulnerability(target, port=22):
    """检测目标是否易受 Terrapin 攻击"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10)
        sock.connect((target, port))

        banner = sock.recv(1024).decode('utf-8', errors='ignore').strip()
        print(f"[*] SSH Banner: {banner}")

        if "OpenSSH" in banner:
            version = banner.split("OpenSSH_")[1]
            print(f"[*] OpenSSH 版本: {version}")

            major = int(version.split(".")[0])
            minor = int(version.split("p")[0].split(".")[-1])

            if major < 9 or (major == 9 and minor < 6):
                print("[!] 可能受 CVE-2023-48795 (Terrapin) 影响")
                print("[!] 检查是否支持 Strict Key Exchange:")
                print("    在服务器响应中查找 kex-strict-s-v00@openssh.com")
                print("[!] 建议禁用 chacha20-poly1305 和 -etm MAC 作为临时缓解")
            else:
                print("[*] 版本较新，但建议确认 kex-strict 支持")

        sock.close()
        return banner

    except Exception as e:
        print(f"[!] 检测失败: {e}")
        return None

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target> [port]")
        sys.exit(1)

    target = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 22
    detect_terrapin_vulnerability(target, port)
```

#### Nuclei YAML 模板

```yaml
id: openssh-cve-2023-48795-terrapin
info:
  name: SSH Terrapin Prefix Truncation - CVE-2023-48795
  author: x7peeps
  severity: medium
  description: |
    SSH 协议 Terrapin 前缀截断攻击，通过序列号操纵可删除
    握手阶段消息而不触发 MAC 失败，导致安全特性降级。
  reference:
    - https://terrapin-attack.com/
    - https://nvd.nist.gov/vuln/detail/CVE-2023-48795
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:H/A:N
    cvss-score: 5.9
    cwe-id: CWE-354
  tags: ssh,terrapin,cve2023,cve,protocol-truncation

tcp:
  - inputs:
      - data: "SSH-2.0-TestClient\r\n"
        read: 1024
    host:
      - "{{Hostname}}"
    port: 22

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "OpenSSH"

      - type: word
        negative: true
        words:
          - "kex-strict-s-v00"

    extractors:
      - type: regex
        regex:
          - 'SSH-2.0-OpenSSH_[0-9.]+p[0-9]+'
```

---

### 0x01.3 CVE-2023-38408 — ssh-agent 远程代码执行

#### 漏洞背景

CVE-2023-38408 由 Qualys 于 2023 年 7 月 19 日披露，CVSS 评分 9.8（Critical）。该漏洞存在于 OpenSSH 的 ssh-agent PKCS#11 功能中，由于不充分的搜索路径信任，当用户将 agent 转发到攻击者控制的服务器时，可实现远程代码执行。这是 CVE-2016-10009 的不完整修复。

#### 受影响版本

| 版本分支 | 受影响版本 | 修复版本 |
|----------|-----------|---------|
| OpenSSH | < 9.3p2 | 9.3p2 |
| Fedora | 37, 38 | 更新补丁 |
| Debian | 各版本 | DSA 更新 |
| macOS | 旧版本 | HT213940 |

#### 漏洞原理分析

1. 用户通过 `ssh -A` 或 `ForwardAgent yes` 将 agent 转发到远程服务器
2. 攻击者控制远程 SSH 服务器后，通过转发的 agent socket 发送 `SSH_AGENTC_ADD_SMARTCARD_KEY` 消息
3. 该消息指示 agent 调用 `dlopen()` 加载指定路径的共享库
4. 修补前的代码仅限制绝对路径，但允许通过 `/usr/lib` 等动态链接器搜索路径加载任意库
5. 攻击者可反复加载/卸载 `/usr/lib` 中的特定库，操纵 ssh-agent 的内存布局
6. 通过 gadget chain 达到 `system()` 或等效执行原语

#### HTTP/curl PoC

```bash
# 检测系统是否启用了 agent forwarding 配置
grep -r "ForwardAgent\|ForwardAgent" /etc/ssh/ssh_config ~/.ssh/config 2>/dev/null

# 检查 ssh-agent 是否使用了 PKCS#11
ssh-agent -l 2>/dev/null || echo "未运行 ssh-agent 或无 PKCS#11 令牌"
```

#### Python PoC 脚本

```python
import os
import subprocess

def check_agent_forwarding_risk():
    """检测 CVE-2023-38408 相关的 ssh-agent 配置风险"""
    print("[*] CVE-2023-38408 - ssh-agent 远程代码执行风险检测")
    print("=" * 55)

    # 检测 OpenSSH 版本
    try:
        result = subprocess.run(['ssh', '-V'], capture_output=True, text=True)
        version = result.stderr.strip()
        print(f"[*] OpenSSH 版本: {version}")

        if "OpenSSH" in version:
            ver_str = version.split("_")[1]
            parts = ver_str.split("p")[0].split(".")
            major, minor = int(parts[0]), int(parts[1])
            patch = int(ver_str.split("p")[1]) if "p" in ver_str else 0

            if major < 9 or (major == 9 and minor < 3) or (major == 9 and minor == 3 and patch < 2):
                print("[!] 版本受 CVE-2023-38408 影响!")
            else:
                print("[*] 版本已修复")
    except FileNotFoundError:
        print("[!] 未找到 ssh 命令")

    # 检测 Agent Forwarding 配置
    print("\n[*] 检查 Agent Forwarding 配置...")
    ssh_config = os.path.expanduser("~/.ssh/config")
    if os.path.exists(ssh_config):
        with open(ssh_config, 'r') as f:
            content = f.read()
            if "ForwardAgent yes" in content.lower():
                print("[!] ~/.ssh/config 中启用了 ForwardAgent!")
                print("    建议：仅在必要时启用，且避免转发到不受信任的主机")

    # 检测环境变量
    auth_sock = os.environ.get('SSH_AUTH_SOCK', '')
    if auth_sock:
        print(f"[*] SSH_AUTH_SOCK: {auth_sock}")

    print("\n[*] 缓解建议:")
    print("    1. 升级到 OpenSSH 9.3p2 或更高版本")
    print("    2. 启动 ssh-agent 时使用空 PKCS#11 允许列表: ssh-agent -P ''")
    print("    3. 避免将 agent 转发到不受信任的主机")

if __name__ == "__main__":
    check_agent_forwarding_risk()
```

#### Nuclei YAML 模板

```yaml
id: openssh-cve-2023-38408
info:
  name: OpenSSH ssh-agent PKCS#11 RCE - CVE-2023-38408
  author: x7peeps
  severity: critical
  description: |
    OpenSSH ssh-agent 的 PKCS#11 功能存在不充分的搜索路径信任，
    当 agent 被转发到攻击者控制的系统时，可加载任意共享库实现 RCE。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2023-38408
    - https://blog.qualys.com/vulnerabilities-threat-research/2023/07/19/cve-2023-38408
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cwe-id: CWE-428
  tags: openssh,cve2023,cve,ssh-agent,pkcs11,rce

tcp:
  - inputs:
      - data: "SSH-2.0-TestClient\r\n"
        read: 1024
    host:
      - "{{Hostname}}"
    port: 22

    matchers:
      - type: word
        words:
          - "OpenSSH"
          - "9.2"
          - "9.1"
          - "9.0"
          - "8.9"
          - "8.8"
        condition: and

    extractors:
      - type: regex
        regex:
          - 'SSH-2.0-OpenSSH_[0-9.]+p[0-9]+'
```

---

### 0x01.4 CVE-2023-51385 — OS 命令注入

#### 漏洞背景

OpenSSH 9.6 之前的版本中，当用户名或主机名包含 shell 元字符（如 `|`、`'`、`"`），且该名称被 `ProxyCommand`、`LocalCommand` 或 `match exec` 中的 `%h`、`%u` 转换令牌引用时，可能导致 OS 命令注入。

典型攻击场景：不受信任的 Git 仓库的 submodule 中包含 shell 元字符的用户名或主机名，当用户执行递归更新时触发。

#### 受影响版本

| 版本分支 | 受影响版本 | 修复版本 |
|----------|-----------|---------|
| OpenSSH | < 9.6p1 | 9.6p1 |
| macOS | 旧版本 | HT214084 |

#### 漏洞原理分析

`ProxyCommand` 配置指令中的 `%u`（用户名）和 `%h`（主机名）转换令牌在 shell 上下文中展开时，未对输入进行转义。如果攻击者控制了主机名（例如通过恶意 DNS 响应或 `.gitmodules` 文件），可以注入 shell 命令：

```
ProxyCommand ssh -W %h:%p %r@` malicious_command `
```

#### HTTP/curl PoC

```bash
# 检查 SSH 配置中是否存在不安全的 ProxyCommand 使用
grep -n "ProxyCommand\|LocalCommand\|Match exec" /etc/ssh/ssh_config ~/.ssh/config 2>/dev/null
```

#### Python PoC 脚本

```python
import subprocess
import os

def check_proxycommand_injection_risk():
    """检测 ProxyCommand 命令注入风险"""
    print("[*] CVE-2023-51385 - OS 命令注入风险检测")
    print("=" * 50)

    configs = [
        '/etc/ssh/ssh_config',
        os.path.expanduser('~/.ssh/config')
    ]

    for config_path in configs:
        if not os.path.exists(config_path):
            continue

        print(f"\n[*] 检查 {config_path}...")
        with open(config_path, 'r') as f:
            for line_no, line in enumerate(f, 1):
                line = line.strip()
                if line.startswith('#'):
                    continue
                if 'ProxyCommand' in line or 'LocalCommand' in line:
                    if '%h' in line or '%u' in line:
                        print(f"  [!] 行 {line_no}: {line}")
                        print("      含有 %h/%u 转换令牌，需检查主机名是否来自可信来源")

    print("\n[*] 缓解建议:")
    print("    1. 升级到 OpenSSH 9.6p1 或更高版本")
    print("    2. 确保 ProxyCommand 中引用的主机名来自可信来源")
    print("    3. 避免在不受信任的仓库中递归克隆 submodules")

if __name__ == "__main__":
    check_proxycommand_injection_risk()
```

#### Nuclei YAML 模板

```yaml
id: openssh-cve-2023-51385
info:
  name: OpenSSH ProxyCommand OS Command Injection - CVE-2023-51385
  author: x7peeps
  severity: medium
  description: |
    OpenSSH 9.6 之前版本中，当用户名或主机名包含 shell 元字符时，
    ProxyCommand/LocalCommand 中的 %h/%u 转换可能导致命令注入。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2023-51385
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N
    cvss-score: 6.5
    cwe-id: CWE-78
  tags: openssh,cve2023,cve,command-injection,proxycommand

tcp:
  - inputs:
      - data: "SSH-2.0-TestClient\r\n"
        read: 1024
    host:
      - "{{Hostname}}"
    port: 22

    matchers:
      - type: word
        words:
          - "OpenSSH"
        negative: false

    matchers-condition: and

    extractors:
      - type: regex
        regex:
          - 'SSH-2.0-OpenSSH_[0-9.]+p[0-9]+'
```

---

### 0x01.5 CVE-2025-26465 — MitM 认证绕过

#### 漏洞背景

2025 年 2 月 18 日，Qualys TRU 发现当 OpenSSH 客户端启用 `VerifyHostKeyDNS` 选项时，中间人攻击者可绕过主机密钥验证。该漏洞自 2014 年 12 月引入（OpenSSH 6.8p1 前），FreeBSD 在 2013-2023 年间默认启用此选项。

#### 受影响版本

| 版本分支 | 受影响版本 | 修复版本 |
|----------|-----------|---------|
| OpenSSH | 6.8p1 ≤ version ≤ 9.9p1 | 9.9p2 |

#### 漏洞原理分析

1. 攻击者执行 MitM 攻击，同时耗尽客户端内存
2. `verify_host_key_callback()` 中的 `verify_host_key()` 返回非 `-1` 的错误码时，被错误当作成功
3. 通过触发 `SSH_ERR_ALLOC_FAIL`（内存耗尽），操纵验证结果
4. 客户端接受攻击者的伪造主机密钥，无需任何用户交互

#### HTTP/curl PoC

```bash
# 检查 OpenSSH 版本
ssh -V 2>&1

# 检查 VerifyHostKeyDNS 配置
grep -r "VerifyHostKeyDNS" /etc/ssh/ssh_config ~/.ssh/config 2>/dev/null
# 默认值为 "no"，如果设置为 "yes" 或 "ask" 则存在风险
```

#### Python PoC 脚本

```python
import subprocess
import os

def check_verifyhostkeydns_risk():
    """检测 CVE-2025-26465 MitM 认证绕过风险"""
    print("[*] CVE-2025-26465 - VerifyHostKeyDNS MitM 绕过检测")
    print("=" * 55)

    try:
        result = subprocess.run(['ssh', '-V'], capture_output=True, text=True)
        version = result.stderr.strip()
        print(f"[*] SSH 版本: {version}")
    except:
        print("[!] 无法获取 SSH 版本")
        return

    configs = ['/etc/ssh/ssh_config', os.path.expanduser('~/.ssh/config')]
    vulnerable = False

    for config_path in configs:
        if not os.path.exists(config_path):
            continue
        with open(config_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line.startswith('#'):
                    continue
                if 'VerifyHostKeyDNS' in line and ('yes' in line.lower() or 'ask' in line.lower()):
                    print(f"[!] {config_path} 中启用 VerifyHostKeyDNS: {line}")
                    vulnerable = True

    if not vulnerable:
        print("[*] VerifyHostKeyDNS 未启用（默认 no），风险较低")
    else:
        print("[!] 存在 CVE-2025-26465 风险，建议禁用 VerifyHostKeyDNS")

if __name__ == "__main__":
    check_verifyhostkeydns_risk()
```

#### Nuclei YAML 模板

```yaml
id: openssh-cve-2025-26465
info:
  name: OpenSSH VerifyHostKeyDNS MitM Bypass - CVE-2025-26465
  author: x7peeps
  severity: medium
  description: |
    当 OpenSSH 客户端启用 VerifyHostKeyDNS 时，MitM 攻击者可
    绕过主机密钥验证，接受伪造的服务器密钥。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2025-26465
    - https://blog.qualys.com/vulnerabilities-threat-research/2025/02/18
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:N
    cvss-score: 6.8
    cwe-id: CWE-390
  tags: openssh,cve2025,cve,mitm,verifyhostkeydns,auth-bypass

tcp:
  - inputs:
      - data: "SSH-2.0-TestClient\r\n"
        read: 1024
    host:
      - "{{Hostname}}"
    port: 22

    matchers:
      - type: word
        words:
          - "OpenSSH"

    extractors:
      - type: regex
        regex:
          - 'SSH-2.0-OpenSSH_[0-9.]+p[0-9]+'
```

---

### 0x01.6 CVE-2025-26466 — 预认证 DoS

#### 漏洞背景

与 CVE-2025-26465 同日披露，CVE-2025-26466 允许攻击者在认证前通过大量 `SSH2_MSG_PING` 消息触发 OpenSSH 客户端和服务器的内存与 CPU 耗尽。

#### 受影响版本

| 版本分支 | 受影响版本 | 修复版本 |
|----------|-----------|---------|
| OpenSSH | 9.5p1 ≤ version ≤ 9.9p1 | 9.9p2 |

#### 漏洞原理分析

1. 攻击者持续发送 `SSH2_MSG_PING` 包
2. 服务器为每个 PING 分配 `SSH2_MSG_PONG` 响应并存储在内存队列中
3. 密钥交换完成前，队列中的响应不会被释放
4. **内存耗尽**：队列无限增长直到 OOM
5. **CPU 耗尽**：密钥交换完成后，O(n²) 复杂度的缓冲区重分配导致 CPU 飙升

#### HTTP/curl PoC

```bash
# 服务端缓解配置
# 在 /etc/ssh/sshd_config 中添加/修改：
# LoginGraceTime 60
# MaxStartups 10:30:60
# PerSourcePenalties 1:authfail:5,2:authfail:3
```

#### Python PoC 脚本

```python
import socket
import time

def test_ping_flood_dos(target, port=22, packet_count=100):
    """CVE-2025-26466 - 预认证 DoS 检测（仅发送少量测试包）"""
    print(f"[*] CVE-2025-26466 - 预认证 DoS 检测")
    print(f"[*] 目标: {target}:{port}")
    print(f"[!] 注意: 仅发送 {packet_count} 个测试包")

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((target, port))

        banner = sock.recv(1024)
        print(f"[*] Banner: {banner.decode('utf-8', errors='ignore').strip()}")

        sock.send(b"SSH-2.0-TestClient\r\n")

        for i in range(packet_count):
            try:
                pingo = b'\x00' * 32
                sock.send(pingo)
            except:
                break

        print(f"[*] 发送了 {i+1} 个测试消息")
        print("[*] 检查目标内存使用情况以确认是否存在内存增长")
        sock.close()

    except Exception as e:
        print(f"[!] 检测出错: {e}")

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target> [port] [count]")
        sys.exit(1)
    target = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 22
    count = int(sys.argv[3]) if len(sys.argv) > 3 else 100
    test_ping_flood_dos(target, port, count)
```

#### Nuclei YAML 模板

```yaml
id: openssh-cve-2025-26466
info:
  name: OpenSSH Pre-Auth DoS via Ping Flood - CVE-2025-26466
  author: x7peeps
  severity: medium
  description: |
    OpenSSH 9.5p1 至 9.9p1 存在预认证 DoS 漏洞，通过发送
    SSH2_MSG_PING 消息可耗尽服务器内存和 CPU。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2025-26466
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:H
    cvss-score: 5.9
    cwe-id: CWE-400
  tags: openssh,cve2025,cve,dos,memory-exhaustion

tcp:
  - inputs:
      - data: "SSH-2.0-TestClient\r\n"
        read: 1024
    host:
      - "{{Hostname}}"
    port: 22

    matchers:
      - type: word
        words:
          - "OpenSSH_9.5"
          - "OpenSSH_9.6"
          - "OpenSSH_9.7"
          - "OpenSSH_9.8"
          - "OpenSSH_9.9"
        condition: or

    extractors:
      - type: regex
        regex:
          - 'SSH-2.0-OpenSSH_[0-9.]+p[0-9]+'
```

---

### 0x01.7 CVE-2026-60002 — ssh 客户端 Use-After-Free

#### 漏洞背景

2026 年 7 月 6 日，OpenSSH 10.4p1 发布，修复了客户端侧的 Use-After-Free 漏洞（CVSS 7.7）。当恶意或被入侵的服务器在密钥重新交换过程中更改其主机密钥时触发。仅影响 `ssh` 客户端，`sshd` 不受影响。

#### 受影响版本

| 版本分支 | 受影响版本 | 修复版本 |
|----------|-----------|---------|
| OpenSSH | < 10.4 (10.4p1) | 10.4p1 |

#### 漏洞原理分析

1. 客户端与服务器建立 SSH 会话后，服务器发起密钥重新交换（key re-exchange）
2. 在重交换过程中，服务器发送了与原始主机密钥不同的新密钥
3. 客户端处理此密钥变更时，释放了旧密钥对象但仍在后续代码中引用
4. 释放的内存可能被重新分配并覆盖，导致 UAF
5. 恶意服务器可利用此漏洞导致客户端崩溃或潜在的任意代码执行

#### HTTP/curl PoC

```bash
# 检测客户端版本
ssh -V 2>&1

# 如果版本低于 10.4p1，存在风险
# 特别注意: CI/CD 管道、跳板机、Ansible 等自动化工具中的 SSH 客户端
```

#### Python PoC 脚本

```python
import subprocess

def check_openssh_client_version():
    """检测 OpenSSH 客户端版本是否受 CVE-2026-60002 影响"""
    print("[*] CVE-2026-60002 - OpenSSH 客户端 UAF 检测")
    print("=" * 50)

    try:
        result = subprocess.run(['ssh', '-V'], capture_output=True, text=True)
        version = result.stderr.strip()
        print(f"[*] SSH 客户端: {version}")

        if "OpenSSH" in version:
            ver_str = version.split("_")[1]
            parts = ver_str.split("p")
            ver_num = parts[0]
            ver_parts = ver_num.split(".")

            if len(ver_parts) >= 2:
                major = int(ver_parts[0])
                minor = int(ver_parts[1])

                if major < 10 or (major == 10 and minor == 0):
                    print("[!] 客户端受 CVE-2026-60002 影响!")
                    print("    此漏洞为客户端侧 UAF，恶意服务器可在密钥重交换时触发")
                    print("    影响: ssh, scp, sftp 及所有使用 SSH 客户端的自动化工具")
                else:
                    print("[*] 客户端版本已修复")
    except FileNotFoundError:
        print("[!] 未找到 ssh 命令")

    print("\n[*] 高风险场景:")
    print("    - 跳板机/堡垒机的出站 SSH 连接")
    print("    - CI/CD 管道中通过 SSH 拉取代码或部署")
    print("    - Ansible/Fabric 等配置管理工具")

if __name__ == "__main__":
    check_openssh_client_version()
```

#### Nuclei YAML 模板

```yaml
id: openssh-cve-2026-60002
info:
  name: OpenSSH Client Use-After-Free - CVE-2026-60002
  author: x7peeps
  severity: high
  description: |
    OpenSSH 10.4 之前的客户端存在 UAF 漏洞，当恶意服务器在
    密钥重交换时更改主机密钥，可导致客户端崩溃或 RCE。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2026-60002
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:L
    cvss-score: 7.7
    cwe-id: CWE-416
  tags: openssh,cve2026,cve,uaf,client

tcp:
  - inputs:
      - data: "SSH-2.0-TestClient\r\n"
        read: 1024
    host:
      - "{{Hostname}}"
    port: 22

    matchers:
      - type: word
        words:
          - "OpenSSH"

    extractors:
      - type: regex
        regex:
          - 'SSH-2.0-OpenSSH_[0-9.]+p?[0-9]*'
```

---

### 0x01.8 CVE-2021-41617 — AuthorizedKeysCommand 权限提升

#### 漏洞背景

当 OpenSSH 6.2 至 8.x（8.8 之前）使用非默认配置（`AuthorizedKeysCommand`/`AuthorizedPrincipalsCommand` 配合 `AuthorizedKeysCommandUser`/`AuthorizedPrincipalsCommandUser` 以非 root 用户运行）时，辅助程序可能以 sshd 进程的补充组权限运行，导致权限提升。

#### 受影响版本

| 版本分支 | 受影响版本 | 修复版本 |
|----------|-----------|---------|
| OpenSSH | 6.2 ≤ version < 8.8 | 8.8 |

#### 漏洞原理分析

sshd 在调用 `AuthorizedKeysCommand` 时未正确初始化补充组（supplemental groups）。当配置指定以非 root 用户运行命令时，该命令可能继承 sshd 进程的组成员关系，获得不应有的特权。

#### HTTP/curl PoC

```bash
# 检查 sshd 配置中的相关指令
grep -n "AuthorizedKeysCommand\|AuthorizedPrincipalsCommand\|AuthorizedKeysCommandUser" /etc/ssh/sshd_config
```

#### Python PoC 脚本

```python
def check_authorizedkeyscommand_risk():
    """检测 CVE-2021-41617 权限提升风险"""
    print("[*] CVE-2021-41617 - AuthorizedKeysCommand 权限提升检测")

    try:
        with open('/etc/ssh/sshd_config', 'r') as f:
            config = f.read()

        has_akc = 'AuthorizedKeysCommand' in config
        has_apc = 'AuthorizedPrincipalsCommand' in config

        if has_akc or has_apc:
            print("[!] 检测到 AuthorizedKeysCommand/PrincipalsCommand 配置")
            print("    确认是否使用了对应的 User 指令以非 root 运行")
            print("    如果是，此系统可能受 CVE-2021-41617 影响")
        else:
            print("[*] 未检测到相关配置，风险较低")
    except FileNotFoundError:
        print("[!] 未找到 /etc/ssh/sshd_config")

if __name__ == "__main__":
    check_authorizedkeyscommand_risk()
```

#### Nuclei YAML 模板

```yaml
id: openssh-cve-2021-41617
info:
  name: OpenSSH AuthorizedKeysCommand Privilege Escalation - CVE-2021-41617
  author: x7peeps
  severity: high
  description: |
    当使用非默认的 AuthorizedKeysCommand/PrincipalsCommand 配置时，
    辅助程序可能以 sshd 进程的补充组权限运行，导致权限提升。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2021-41617
  classification:
    cvss-metrics: CVSS:3.1/AV:L/AC:H/PR:L/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 7.0
    cwe-id: CWE-269
  tags: openssh,cve2021,cve,privilege-escalation,authorizedkeyscommand

http:
  - raw:
      - |
        GET / HTTP/1.1
        Host: {{Hostname}}

    matchers:
      - type: word
        words:
          - "SSH"
          - "OpenSSH"
        condition: or
```

---

### 0x01.9 CVE-2021-28041 — ssh-agent Double Free

#### 漏洞背景

CVE-2021-28041 是 OpenSSH 8.5 之前版本中 ssh-agent 的双重释放（double free）漏洞。在特定场景下（如 agent socket 不受约束的访问、转发到攻击者控制的主机），可能导致内存损坏和代码执行。

#### 受影响版本

| 版本分支 | 受影响版本 | 修复版本 |
|----------|-----------|---------|
| OpenSSH | 8.2 ≤ version < 8.5 | 8.5 |

#### 漏洞原理分析

ssh-agent 在处理 agent 协议消息时，存在同一内存指针被两次 `free()` 的情况。在现代操作系统上，agent socket 访问限制和 malloc 实现的 double-free 检测提供了额外防护，但在旧系统或 agent forwarding 到不受信任主机时风险增加。

#### HTTP/curl PoC

```bash
# 检测 ssh-agent socket 权限
ls -la $SSH_AUTH_SOCK 2>/dev/null
# 确认 socket 文件权限是否限制为当前用户
```

#### Python PoC 脚本

```python
import os
import stat

def check_agent_socket_permissions():
    """检测 CVE-2021-28041 相关的 agent socket 权限风险"""
    print("[*] CVE-2021-28041 - ssh-agent Double Free 风险检测")

    auth_sock = os.environ.get('SSH_AUTH_SOCK', '')
    if not auth_sock:
        print("[*] 未设置 SSH_AUTH_SOCK，ssh-agent 未运行")
        return

    print(f"[*] SSH_AUTH_SOCK: {auth_sock}")

    if os.path.exists(auth_sock):
        stat_info = os.stat(auth_sock)
        mode = stat.S_IMODE(stat_info.st_mode)
        print(f"[*] Socket 权限: {oct(mode)}")

        if mode & stat.S_IWOTH:
            print("[!] Socket 对其他用户可写！存在高风险")
        elif mode & stat.S_IROTH:
            print("[!] Socket 对其他用户可读，建议收紧权限")
        else:
            print("[*] Socket 权限正常")
    else:
        print("[!] Socket 文件不存在")

if __name__ == "__main__":
    check_agent_socket_permissions()
```

#### Nuclei YAML 模板

```yaml
id: openssh-cve-2021-28041
info:
  name: OpenSSH ssh-agent Double Free - CVE-2021-28041
  author: x7peeps
  severity: high
  description: |
    OpenSSH 8.5 之前的 ssh-agent 存在 double free 漏洞，
    在 agent socket 不受约束或转发到攻击者主机时可利用。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2021-28041
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:H/PR:L/UI:R/S:U/C:H/I:H/A:H
    cvss-score: 7.0
    cwe-id: CWE-415
  tags: openssh,cve2021,cve,ssh-agent,double-free

tcp:
  - inputs:
      - data: "SSH-2.0-TestClient\r\n"
        read: 1024
    host:
      - "{{Hostname}}"
    port: 22

    matchers:
      - type: word
        words:
          - "OpenSSH"
    extractors:
      - type: regex
        regex:
          - 'SSH-2.0-OpenSSH_[0-9.]+p?[0-9]*'
```

---

### 0x01.10 CVE-2020-14145 — 算法协商信息泄露

#### 漏洞背景

OpenSSH 5.7 至 8.4（部分报告称 8.5/8.6 也受影响）的客户端在算法协商阶段存在可观测差异（Observable Discrepancy）。攻击者可通过观察算法偏好顺序推断客户端是否已缓存目标服务器的主机密钥，从而精准定位首次连接尝试进行 MitM 攻击。

#### 受影响版本

| 版本分支 | 受影响版本 | 修复版本 |
|----------|-----------|---------|
| OpenSSH | 5.7 ≤ version ≤ 8.4 | 8.4p1+（部分修复） |

#### 漏洞原理分析

RFC 4253 要求客户端按偏好顺序提议算法。OpenSSH 客户端在已知主机密钥时会重新排序算法以匹配已缓存的密钥类型，而首次连接时使用默认顺序。这种可观测差异让攻击者可区分首次连接和已知连接——首次连接缺少主机密钥保护，MitM 成功率更高。

#### HTTP/curl PoC

```bash
# 此漏洞需要通过 SSH 协议观察算法协商
# 可使用 ssh-audit 工具检测
# pip install ssh-audit
ssh-audit <TARGET_IP>:22
```

#### Python PoC 脚本

```python
def check_algorithm_negotiation_risk():
    """检测 CVE-2020-14145 信息泄露风险"""
    print("[*] CVE-2020-14145 - 算法协商信息泄露检测")
    print("=" * 50)
    print("[*] 此漏洞为客户端侧信息泄露")
    print("[*] 攻击者通过观察算法偏好推断首次连接状态")
    print()
    print("[*] 缓解建议:")
    print("    1. 确保 known_hosts 文件包含所有常用服务器的主机密钥")
    print("    2. 使用 UpdateHostkeys yes 让服务器主动更新密钥")
    print("    3. 考虑部署 SSHFP DNS 记录配合 VerifyHostKeyDNS")
    print("    4. 注意: OpenSSH 上游认为禁用自动排序会降低整体安全性")

if __name__ == "__main__":
    check_algorithm_negotiation_risk()
```

#### Nuclei YAML 模板

```yaml
id: openssh-cve-2020-14145
info:
  name: OpenSSH Algorithm Negotiation Info Leak - CVE-2020-14145
  author: x7peeps
  severity: medium
  description: |
    OpenSSH 客户端在算法协商中存在可观测差异，可泄露
    客户端是否缓存了服务器主机密钥，辅助 MitM 攻击。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2020-14145
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N
    cvss-score: 5.9
    cwe-id: CWE-200
  tags: openssh,cve2020,cve,information-disclosure,mitm

tcp:
  - inputs:
      - data: "SSH-2.0-TestClient\r\n"
        read: 1024
    host:
      - "{{Hostname}}"
    port: 22

    matchers:
      - type: word
        words:
          - "OpenSSH"
    extractors:
      - type: regex
        regex:
          - 'SSH-2.0-OpenSSH_[0-9.]+p?[0-9]*'
```

---

## 0x02 Dropbear 高危漏洞

### 0x02.1 CVE-2025-14282 — Unix Socket 提权

#### 漏洞背景

2025 年 12 月 16 日，Dropbear 2025.89 修复了一个 CVSS 9.8 的严重权限提升漏洞。在多用户模式下，Dropbear 在认证用户后处理 Unix socket 转发请求时仍保持 root 权限，导致任何已认证用户可以 root 身份连接任意 Unix domain socket。

此漏洞影响路由器（OpenWRT）、IoT 设备和 NAS 等大量嵌入式设备。

#### 受影响版本

| 版本分支 | 受影响版本 | 修复版本 |
|----------|-----------|---------|
| Dropbear | 2024.84 ≤ version ≤ 2025.88 | 2025.89 |

#### 漏洞原理分析

1. Dropbear 在处理用户请求的 socket 转发时，进程仍以 root 权限运行
2. Unix domain socket 通常依赖 `SO_PEERCRED` 验证连接方身份
3. 由于转发连接来自 root 进程，peer credential 检查看到的是 root 而非实际 SSH 用户
4. 攻击者可连接 Docker socket (`/var/run/docker.sock`)、D-Bus 等敏感 socket 执行 root 操作

#### HTTP/curl PoC

```bash
# 检测 Dropbear 版本
dropbear -V 2>&1 || strings /usr/sbin/dropbear | grep "dropbear_"

# 检查是否可通过 SSH 转发 Unix socket
# 需要有效的 SSH 认证
ssh -L /tmp/test.sock:/var/run/docker.sock user@target 2>/dev/null && \
    echo "[!] 可能受 CVE-2025-14282 影响"
```

#### Python PoC 脚本

```python
import subprocess
import os

def check_dropbear_version():
    """检测 Dropbear 版本和 CVE-2025-14282 风险"""
    print("[*] CVE-2025-14282 - Dropbear Unix Socket 提权检测")
    print("=" * 55)

    try:
        result = subprocess.run(
            ['strings', '/usr/sbin/dropbear'],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.split('\n'):
            if 'dropbear_' in line:
                print(f"[*] Dropbear 标识: {line.strip()}")
                if 'dropbear_2024' in line or 'dropbear_2025.0' in line:
                    print("[!] 可能受 CVE-2025-14282 影响!")
                break
    except:
        print("[!] 无法检测 Dropbear 版本")

    print("\n[*] 受影响的典型设备:")
    print("    - OpenWRT 路由器（默认使用 Dropbear）")
    print("    - IoT 设备和 NAS")
    print("    - 嵌入式 Linux 系统")

    print("\n[*] 缓解措施:")
    print("    1. 升级到 Dropbear 2025.89 或更高版本")
    print("    2. 临时禁用: dropbear -j（同时禁用 TCP 转发）")
    print("    3. 源码编译: #define DROPBEAR_SVR_LOCALSTREAMFWD 0")

if __name__ == "__main__":
    check_dropbear_version()
```

#### Nuclei YAML 模板

```yaml
id: dropbear-cve-2025-14282
info:
  name: Dropbear Unix Socket Privilege Escalation - CVE-2025-14282
  author: x7peeps
  severity: critical
  description: |
    Dropbear 2024.84 至 2025.88 存在 Unix socket 转发提权漏洞，
    任何已认证用户可通过 SO_PEERCRED 绕过以 root 身份连接敏感 socket。
  reference:
    - https://www.openwall.com/lists/oss-security/2025/12/16/2
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cwe-id: CWE-266
  tags: dropbear,cve2025,cve,privilege-escalation,unix-socket

tcp:
  - inputs:
      - data: "SSH-2.0-TestClient\r\n"
        read: 1024
    host:
      - "{{Hostname}}"
    port: 22

    matchers:
      - type: word
        words:
          - "dropbear"
          - "Dropbear"
        condition: or

    extractors:
      - type: regex
        regex:
          - 'SSH-2.0-dropbear_[0-9]+'
```

---

### 0x02.2 CVE-2025-47203 — dbclient 命令注入

#### 漏洞背景

Dropbear 2025.88 之前的 dbclient 组件存在命令注入漏洞。由于在处理主机名参数时使用 shell，攻击者可通过包含 shell 元字符的主机名注入任意命令。

#### 受影响版本

| 版本分支 | 受影响版本 | 修复版本 |
|----------|-----------|---------|
| Dropbear | < 2025.88 | 2025.88 |

#### 漏洞原理分析

`cli-main.c` 中的代码将用户提供的主机名数据传递给 shell 处理，未进行适当的转义或验证。当主机名包含反引号、分号或命令替换语法时，shell 会将嵌入的命令作为指令执行。

#### HTTP/curl PoC

```bash
# 此漏洞需要本地访问或脚本调用
# 检查使用 dbclient 的自动化脚本
grep -rn "dbclient" /etc/ /usr/local/bin/ /opt/ 2>/dev/null | head -20
```

#### Python PoC 脚本

```python
def check_dbclient_injection_risk():
    """检测 CVE-2025-47203 dbclient 命令注入风险"""
    print("[*] CVE-2025-47203 - Dropbear dbclient 命令注入检测")
    print("=" * 55)

    import os
    import subprocess

    # 检查系统是否安装了 Dropbear 的 dbclient
    try:
        result = subprocess.run(['which', 'dbclient'], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"[!] 检测到 dbclient: {result.stdout.strip()}")
            print("    确认版本是否 < 2025.88")
        else:
            print("[*] 未检测到 dbclient")
    except:
        print("[*] 无法检测 dbclient")

    print("\n[*] 此漏洞影响使用 dbclient 的脚本和自动化工具")
    print("[*] 缓解措施:")
    print("    1. 升级到 Dropbear 2025.88 或更高版本")
    print("    2. 审计所有调用 dbclient 的脚本，确保主机名参数来自可信来源")
    print("    3. 实施严格的输入验证")

if __name__ == "__main__":
    check_dbclient_injection_risk()
```

#### Nuclei YAML 模板

```yaml
id: dropbear-cve-2025-47203
info:
  name: Dropbear dbclient Command Injection - CVE-2025-47203
  author: x7peeps
  severity: moderate
  description: |
    Dropbear 2025.88 之前的 dbclient 通过 shell 处理主机名参数，
    允许攻击者通过恶意主机名注入任意命令。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2025-47203
  classification:
    cvss-metrics: CVSS:3.1/AV:L/AC:H/PR:N/UI:N/S:C/C:L/I:L/A:N
    cvss-score: 4.5
    cwe-id: CWE-78
  tags: dropbear,cve2025,cve,command-injection,dbclient

tcp:
  - inputs:
      - data: "SSH-2.0-TestClient\r\n"
        read: 1024
    host:
      - "{{Hostname}}"
    port: 22

    matchers:
      - type: word
        words:
          - "dropbear"
        condition: or

    extractors:
      - type: regex
        regex:
          - 'SSH-2.0-dropbear_[0-9]+'
```

---

### 0x02.3 CVE-2021-36369 — 认证方法绕过

#### 漏洞背景

Dropbear 2020.81 及之前版本的客户端 SSH 代码中，认证方法检查不符合 RFC 标准，导致恶意 SSH 服务器可以修改登录过程。此攻击可绕过 FIDO2 令牌或 SSH-Askpass 等额外安全措施，并滥用转发的 agent 在不知情的情况下登录其他服务器。

#### 受影响版本

| 版本分支 | 受影响版本 | 修复版本 |
|----------|-----------|---------|
| Dropbear | ≤ 2020.81 | 2022.82 |

#### 漏洞原理分析

Dropbear 客户端未按 RFC 4252 正确验证服务器返回的认证方法列表。恶意服务器可发送特定的认证方法响应，绕过 FIDO2 等强认证机制，强制客户端使用 agent forwarding 认证到另一台服务器。

#### HTTP/curl PoC

```bash
# 此漏洞需要恶意 SSH 服务器配合
# 检测 Dropbear 版本
dropbear -V 2>&1
```

#### Python PoC 脚本

```python
def check_dropbear_auth_bypass():
    """检测 CVE-2021-36369 认证绕过风险"""
    print("[*] CVE-2021-36369 - Dropbear 认证方法绕过检测")
    print("=" * 55)
    print("[*] 影响: Dropbear ≤ 2020.81")
    print("[*] 修复: Dropbear 2022.82")
    print()
    print("[*] 风险场景:")
    print("    - 使用 Dropbear 客户端连接不受信任的 SSH 服务器")
    print("    - 被恶意服务器滥用转发的 agent 进行横向移动")

if __name__ == "__main__":
    check_dropbear_auth_bypass()
```

#### Nuclei YAML 模板

```yaml
id: dropbear-cve-2021-36369
info:
  name: Dropbear Authentication Method Bypass - CVE-2021-36369
  author: x7peeps
  severity: high
  description: |
    Dropbear 2020.81 及之前版本客户端认证方法检查不符合 RFC 标准，
    恶意服务器可绕过 FIDO2 等安全措施并滥用 agent forwarding。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2021-36369
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N
    cvss-score: 7.5
    cwe-id: CWE-287
  tags: dropbear,cve2021,cve,auth-bypass

tcp:
  - inputs:
      - data: "SSH-2.0-TestClient\r\n"
        read: 1024
    host:
      - "{{Hostname}}"
    port: 22
    matchers:
      - type: word
        words:
          - "dropbear"
    extractors:
      - type: regex
        regex:
          - 'SSH-2.0-dropbear_[0-9]+'
```

---

### 0x02.4 CVE-2020-36254 — SCP 文件覆盖

#### 漏洞背景

Dropbear 2020.79 之前版本的 `scp.c` 在处理 SCP 协议传输时，错误处理文件名为 `.` 或空字符串的情况，可能导致任意文件覆盖。这是 CVE-2018-20685 的相关问题。

#### 受影响版本

| 版本分支 | 受影响版本 | 修复版本 |
|----------|-----------|---------|
| Dropbear | < 2020.79 | 2020.79 |

#### 漏洞原理分析

SCP 协议中，服务器向客户端发送文件元数据后传输文件内容。当文件名为 `.` 或空字符串时，Dropbear 的 SCP 实现未正确验证和拒绝这些特殊文件名，导致恶意服务器可操纵文件操作，在客户端系统上写入文件到非预期位置。

#### HTTP/curl PoC

```bash
# 此漏洞需要恶意 SCP 服务器配合
# 检测 Dropbear 版本以确认风险
dropbear -V 2>&1
```

#### Python PoC 脚本

```python
def check_scp_file_overwrite_risk():
    """检测 CVE-2020-36254 SCP 文件覆盖风险"""
    print("[*] CVE-2020-36254 - Dropbear SCP 文件覆盖检测")
    print("=" * 50)
    print("[*] 影响: Dropbear < 2020.79")
    print("[*] 漏洞: scp.c 错误处理 . 或空文件名")
    print("[*] 风险: 连接恶意 SCP 服务器时可被覆盖任意文件")
    print()
    print("[*] 缓解建议:")
    print("    1. 升级到 Dropbear 2020.79 或更高版本")
    print("    2. 避免使用 SCP 连接不受信任的服务器")
    print("    3. 考虑使用 SFTP 替代 SCP")

if __name__ == "__main__":
    check_scp_file_overwrite_risk()
```

#### Nuclei YAML 模板

```yaml
id: dropbear-cve-2020-36254
info:
  name: Dropbear SCP Filename File Overwrite - CVE-2020-36254
  author: x7peeps
  severity: high
  description: |
    Dropbear 2020.79 之前的 scp.c 错误处理 . 或空文件名，
    可能导致连接恶意服务器时文件被覆盖。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2020-36254
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 8.1
    cwe-id: CWE-20
  tags: dropbear,cve2020,cve,scp,file-overwrite

tcp:
  - inputs:
      - data: "SSH-2.0-TestClient\r\n"
        read: 1024
    host:
      - "{{Hostname}}"
    port: 22
    matchers:
      - type: word
        words:
          - "dropbear"
    extractors:
      - type: regex
        regex:
          - 'SSH-2.0-dropbear_[0-9]+'
```

---

## 0x03 公开 PoC 收集情况与利用思路

### PoC 收集情况总表

| CVE 编号 | PoC 状态 | PoC 类型 | 公开仓库 |
|----------|----------|----------|----------|
| CVE-2024-6387 | ✅ 已公开 | C/Python 检测 + 利用 | [github.com/zgzhang/cve-2024-6387-poc](https://github.com/zgzhang/cve-2024-6387-poc) |
| CVE-2023-48795 | ✅ 已公开 | Go Scanner + 概念验证 | [github.com/RUB-NDS/Terrapin-Scanner](https://github.com/RUB-NDS/Terrapin-Scanner) |
| CVE-2023-38408 | ✅ 已公开 | Qualys 技术报告 | [blog.qualys.com](https://blog.qualys.com/vulnerabilities-threat-research/2023/07/19/cve-2023-38408) |
| CVE-2023-51385 | ✅ 已公开 | 概念验证 | [github.com/vin01/poc-proxycommand-vulnerable](https://github.com/vin01/poc-proxycommand-vulnerable) |
| CVE-2025-26465 | ⚠️ 技术描述 | Qualys 分析 | [blog.qualys.com](https://blog.qualys.com/vulnerabilities-threat-research/2025/02/18) |
| CVE-2025-26466 | ⚠️ 技术描述 | 概念验证 | [blog.qualys.com](https://blog.qualys.com/vulnerabilities-threat-research/2025/02/18) |
| CVE-2026-60002 | ⚠️ 技术描述 | OpenSSH 补丁分析 | [openssh.org](https://www.openssh.org/releasenotes.html#10.4p1) |
| CVE-2021-41617 | ⚠️ 配置检测 | 配置审计脚本 | - |
| CVE-2021-28041 | ⚠️ 理论分析 | 原理文档 | [openssh.com/txt/release-8.5](https://www.openssh.com/txt/release-8.5) |
| CVE-2020-14145 | ✅ 已公开 | ssh-mitm 工具集成 | [github.com/ssh-mitm](https://github.com/ssh-mitm) |
| CVE-2025-14282 | ✅ 已公开 | PoC + Shodan 查询 | OpenWRT 论坛 + Medium |
| CVE-2025-47203 | ⚠️ 原理描述 | 源码分析 | [github.com/mkj/dropbear](https://github.com/mkj/dropbear) |
| CVE-2021-36369 | ⚠️ 理论分析 | PR #128 | [github.com/mkj/dropbear/pull/128](https://github.com/mkj/dropbear/pull/128) |
| CVE-2020-36254 | ⚠️ 理论分析 | 源码修复 | [commit 8f8a3df](https://github.com/mkj/dropbear/commit/8f8a3dff705fad774a10864a2e3dbcfa9779ceff) |

### 防守型验证思路

1. **版本指纹识别**：通过 SSH Banner 提取产品和版本号，与受影响版本矩阵匹配
2. **配置审计**：检查 `sshd_config` / `ssh_config` 中的高危配置项（ForwardAgent、VerifyHostKeyDNS、ProxyCommand 等）
3. **协议特性检测**：通过握手阶段的消息分析判断是否支持 kex-strict 等安全扩展
4. **被动流量分析**：在 IDS/IPS 中部署 SSH 协议特征检测规则

---

## 0x04 共性攻击模式分析

### 攻击模式 1：协议降级攻击（Protocol Downgrade）

**代表漏洞**：CVE-2023-48795（Terrapin）、CVE-2020-14145

攻击者通过操纵 SSH 握手过程中的消息或利用协议设计缺陷，将安全连接降级到较弱的加密算法或禁用安全特性。Terrapin 通过前缀截断删除 `EXT_INFO` 消息禁用击键混淆，CVE-2020-14145 通过算法偏好差异泄露首次连接状态。

**防御要点**：实施 Strict Key Exchange、禁用弱密码套件、使用 crypto-policies 统一管理。

### 攻击模式 2：竞态条件利用（Race Condition）

**代表漏洞**：CVE-2024-6387（regreSSHion）

信号处理程序中的竞态条件是最经典的内存安全漏洞类型之一。在异步信号处理上下文中调用非 async-signal-safe 函数，导致堆管理器状态不一致。regreSSHion 证明了即使是 18 年前修复过的漏洞也可能在代码重构中回归。

**防御要点**：升级到最新版本、降低 `LoginGraceTime`、限制 `MaxStartups`。

### 攻击模式 3：转发滥用攻击（Agent/Socket Forwarding Abuse）

**代表漏洞**：CVE-2023-38408、CVE-2021-28041、CVE-2025-14282

SSH Agent Forwarding 和 Socket Forwarding 是便利性与安全性的经典矛盾点。当 agent 或 socket 被转发到攻击者控制的环境时，攻击者可以滥用信任关系执行未授权操作——从加载恶意共享库到以 root 身份连接敏感 Unix socket。

**防御要点**：最小化 Agent Forwarding 使用、使用 `ssh-agent -P ''` 限制 PKCS#11、禁用不必要的 Unix Socket Forwarding。

### 攻击模式 4：输入验证缺失（Missing Input Validation）

**代表漏洞**：CVE-2023-51385、CVE-2025-47203、CVE-2020-36254

从 ProxyCommand 的 `%h/%u` 命令注入到 dbclient 的主机名注入，再到 SCP 的特殊文件名处理，都是经典的输入验证缺失问题。Shell 元字符在未经转义的情况下被传递给 shell 解释器，导致命令注入。

**防御要点**：对所有外部输入进行严格的白名单验证、避免将用户输入直接传递给 shell、使用参数化替代命令拼接。

### 攻击模式 5：错误处理不当（Improper Error Handling）

**代表漏洞**：CVE-2025-26465、CVE-2025-26466

CVE-2025-26465 中 `verify_host_key_callback()` 将非 `-1` 的错误码错误地当作成功处理，导致验证被绕过。CVE-2025-26466 中 PING/PONG 消息在密钥交换完成前不释放，且处理逻辑存在 O(n²) 复杂度问题。两者都源于对异常路径的处理不完善。

**防御要点**：审查所有错误处理路径、确保错误码语义一致、对资源消耗设置上限。

---

## 0x05 应急排查与防守建议

### 紧急排查清单

```bash
# 1. 检查 OpenSSH 版本
ssh -V 2>&1
# 确认版本号是否在受影响范围内

# 2. 检查 Dropbear 版本（嵌入式设备）
dropbear -V 2>&1 || strings /usr/sbin/dropbear | grep -i dropbear

# 3. 检查 SSH 服务状态和配置
systemctl status sshd
cat /etc/ssh/sshd_config | grep -E "LoginGraceTime|MaxStartups|PermitRootLogin|ForwardAgent|AuthorizedKeysCommand"

# 4. 检查 ssh-agent 相关配置
grep -r "ForwardAgent" /etc/ssh/ ~/.ssh/ 2>/dev/null
grep -r "VerifyHostKeyDNS" /etc/ssh/ ~/.ssh/ 2>/dev/null
grep -r "ProxyCommand\|LocalCommand" /etc/ssh/ ~/.ssh/ 2>/dev/null

# 5. 检查 SSH 连接日志
journalctl -u sshd --since "24 hours ago" | grep -iE "fail|error|invalid|refused"

# 6. 检查是否有异常 SSH 进程
ps aux | grep -E "ssh-agent|sshd" | grep -v grep

# 7. 检查 agent socket 权限
ls -la $SSH_AUTH_SOCK 2>/dev/null
```

### OpenSSH 配置加固最佳实践

```bash
# /etc/ssh/sshd_config 推荐加固配置

# 协议版本
Protocol 2

# 登录超时（降低 regreSSHion 利用窗口）
LoginGraceTime 60
MaxStartups 10:30:60

# 禁用密码认证（仅允许密钥认证）
PasswordAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes

# 禁用不安全的转发
AllowAgentForwarding no
AllowTcpForwarding no
X11Forwarding no
PermitTunnel no
DisableForwarding yes

# 使用强加密算法（防范 Terrapin）
Ciphers aes256-gcm@openssh.com,chacha20-poly1305@openssh.com,aes256-ctr
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com
KexAlgorithms sntrup761x25519-sha512@openssh.com,curve25519-sha256

# 限制认证尝试
MaxAuthTries 3
PerSourcePenalties 1:authfail:5,2:authfail:3

# 禁用不安全的选项
PermitUserEnvironment no
PermitEmptyPasswords no
IgnoreRhosts yes

# 启用日志级别
LogLevel VERBOSE
```

### 日志关键字段表

| 日志字段 | 含义 | 关注的 CVE |
|----------|------|-----------|
| `Connection closed by authenticating user` | 认证超时断连 | CVE-2024-6387 |
| `signal_handler received at` | 信号处理异常 | CVE-2024-6387 |
| `kex: algorithm mismatch` | 密钥交换异常 | CVE-2023-48795 |
| `agent key listed for` | Agent 转发操作 | CVE-2023-38408 |
| `Too many connections` | 连接数超限 | CVE-2025-26466 |
| `Authentication refused` | 认证拒绝 | CVE-2025-26465 |
| `Failed host key verification` | 主机密钥验证失败 | CVE-2025-26465 |
| `User session closed` | 会话关闭 | CVE-2026-60002 |

### 长期安全加固建议

1. **补丁管理**：建立 SSH 组件的定期补丁更新机制，优先处理 Critical 和 High 级别漏洞
2. **最小权限原则**：禁用不必要的 Agent/Socket Forwarding、Tunnel 和 X11 转发
3. **网络分段**：SSH 管理端口不应直接暴露在互联网上，使用 VPN 或跳板机架构
4. **密钥管理**：定期轮换主机密钥和用户密钥，使用 Ed25519 替代 RSA
5. **监控告警**：对 SSH 异常登录、大量认证失败、异常连接模式建立实时告警
6. **配置标准化**：使用 Ansible/Salt 等工具统一下发 SSH 配置，避免配置漂移
7. **入侵检测**：部署 ssh-audit 工具定期审计 SSH 服务的安全配置
8. **应急响应**：制定 SSH 相关漏洞的应急响应流程，确保补丁可在 24 小时内部署

---

## 0x06 参考资料

1. [Qualys regreSSHion 技术报告 (CVE-2024-6387)](https://blog.qualys.com/vulnerabilities-threat-research/2024/07/01/regresshion-remote-unauthenticated-code-execution-vulnerability-in-openssh-server)
2. [Terrapin Attack 官方网站](https://terrapin-attack.com/)
3. [Qualys CVE-2023-38408 ssh-agent RCE 技术报告](https://blog.qualys.com/vulnerabilities-threat-research/2023/07/19/cve-2023-38408-remote-code-execution-in-opensshs-forwarded-ssh-agent)
4. [Qualys CVE-2025-26465/26466 技术报告](https://blog.qualys.com/vulnerabilities-threat-research/2025/02/18/qualys-tru-discovers-two-vulnerabilities-in-openssh-cve-2025-26465-cve-2025-26466)
5. [OpenSSH 9.6 发布说明 (CVE-2023-51385)](https://www.openssh.com/txt/release-9.6)
6. [OpenSSH 10.4p1 发布说明 (CVE-2026-60002)](https://www.openssh.org/releasenotes.html#10.4p1)
7. [Dropbear 2025.89 安全公告 (CVE-2025-14282)](https://www.openwall.com/lists/oss-security/2025/12/16/2)
8. [OpenWRT Dropbear CVE-2025-14282 安全公告](https://forum.openwrt.org/t/security-advisory-2025-12-16-1-dropbear-privilege-escalation-via-unix-domain-socket-forwarding-cve-2025-14282/244222)
9. [Akamai regreSSHion 指南](https://www.akamai.com/blog/security-research/openssh-vulnerability-regression-what-to-know-and-do)
10. [JFrog Terrapin Attack 技术分析](https://jfrog.com/blog/ssh-protocol-flaw-terrapin-attack-cve-2023-48795-all-you-need-to-know/)
11. [Red Hat CVE-2023-48795 缓解指南](https://access.redhat.com/security/cve/cve-2023-48795)
12. [OpenSSH CVE-2020-14145 修复分析](https://access.redhat.com/articles/6128631)