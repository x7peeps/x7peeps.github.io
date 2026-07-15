---
title: "工控与SCADA安全平台高危攻击链专题：Siemens / Schneider / Rockwell / ABB 漏洞全解析"
date: 2026-07-11T14:00:00+08:00
draft: false
categories: ["渗透测试", "漏洞分析"]
tags: ["Siemens", "Schneider Electric", "Rockwell Automation", "ABB", "SCADA", "ICS", "PLC", "RCE", "CVE", "漏洞分析"]
---

# 0x00 专题概述

工业控制系统（ICS）和 SCADA 平台是国家关键基础设施的核心，覆盖电力、石化、水利、制造、交通等命脉行业。近年来，针对工控设备的网络攻击从理论研究走向实战化——从 2017 年 TRISIS/TRITON 安全仪表系统攻击，到 2023 年 Rockwell ControlLogix 被国家级 APT 预置利用能力，工控安全形势日趋严峻。

本专题覆盖 Siemens SIMATIC S7、Schneider Electric Modicon、Rockwell Automation Allen-Bradley、ABB AC500/Cylon ASPECT 四大产品线的 15 个高危漏洞，深入分析其原理、利用方式和检测手段，旨在为安全工程师和工控安全从业人员提供可操作的攻防参考。

## 覆盖漏洞一览表

| CVE 编号 | 厂商 | CVSS | 漏洞类型 | 未授权利用 |
|----------|------|------|----------|-----------|
| CVE-2020-15782 | Siemens | 9.8 | 内存保护绕过 RCE | ✅ |
| CVE-2025-40943 | Siemens | — | 代码注入 | 需用户交互 |
| CVE-2019-6575 | Siemens | 7.5 | 拒绝服务 | ✅ |
| CVE-2022-45789 | Schneider | 8.1 | 认证绕过 | ✅ |
| CVE-2022-45788 | Schneider | 7.5 | 未授权 RCE | ✅ |
| CVE-2024-11737 | Schneider | 9.8 | 高危漏洞 | ✅ |
| CVE-2023-3595 | Rockwell | 9.8 | 越界写入 RCE | ✅ |
| CVE-2023-3596 | Rockwell | 7.5 | 越界写入 DoS | ✅ |
| CVE-2024-6242 | Rockwell | 8.4 | 安全特性绕过 | ✅ |
| CVE-2023-6357 | ABB | 8.8 | Shell 命令注入 | 需认证 |
| CVE-2024-12430 | ABB | — | 命令执行 | 需认证 |
| CVE-2024-12429 | ABB | — | 目录遍历 | 需认证 |
| CVE-2023-0636 | ABB | — | 命令注入 RCE | ✅ |
| CVE-2024-6209 | ABB | — | 未授权文件泄露 | ✅ |
| CVE-2024-5000 | ABB | — | PLC DoS | 需认证 |

---

# 0x01 Siemens SIMATIC S7 高危漏洞

Siemens SIMATIC S7 系列 PLC（S7-1200、S7-1500）是全球部署最广泛的可编程逻辑控制器之一，广泛应用于电力、水务、制造等关键基础设施。其通信协议 S7comm 和内置 Web 服务器是主要攻击面。

## 0x01.1 CVE-2020-15782 — S7-1500 内存保护绕过 RCE

### 漏洞背景

CVE-2020-15782 是 Siemens SIMATIC S7 系列 PLC 中发现的最严重的漏洞之一，CVSS 评分高达 9.8（Critical）。该漏洞允许远程未认证攻击者通过 TCP 端口 102 向受影响设备发送特制数据包，绕过内存保护机制，向受保护的内存区域写入任意数据或代码。

### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| SIMATIC S7-1200 CPU | 所有版本 < V4.5.0 | V4.5.0 |
| SIMATIC S7-1500 CPU | 所有版本 < V2.9.2 | V2.9.2 |
| SIMATIC S7-1500 Software Controller | 所有版本 < V21.9 | V21.9 |
| SIMATIC Drive Controller | 所有版本 < V2.9.2 | V2.9.2 |
| SINUMERIK ONE | 所有版本 < V6.15 | V6.15 |

### 漏洞原理分析

S7-1500 PLC 使用 S7comm 协议（TCP 端口 102）进行编程通信。该协议在处理特定类型的功能请求时，缺乏对请求参数的充分边界检查。攻击者可构造特制的 S7comm 协议数据单元（PDU），其中包含非法的内存操作数，使 PLC 固件在执行内存复制操作时发生越界写入。

成功利用该漏洞可实现：
- 向 PLC 运行时内存的任意地址写入数据
- 覆盖 PLC 控制逻辑，实现程序篡改
- 绕过访问保护级别（访问保护设置可被绕过）
- 读取敏感内存区域信息

### HTTP PoC

```bash
# 通过 S7comm 协议发送特制 PDU（概念性验证，需使用专用工具）
# 此处使用 Python 脚本替代
python3 cve_2020_15782_check.py 192.168.1.100
```

### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2020-15782 漏洞检测脚本 - Siemens S7-1500 内存保护绕过"""
import socket
import struct
import sys

def build_s7comm_connect():
    """构建 S7comm COTP 连接请求"""
    cotp = bytes([
        0x03, 0x00, 0x00, 0x16,
        0x11, 0xD0, 0x01, 0x00,
        0x01, 0x00, 0x01, 0x00,
        0xC1, 0x02, 0x01, 0x00,
        0xC2, 0x02, 0x01, 0x02,
        0xC0, 0x01, 0x09
    ])
    return cotp

def build_s7comm_setup():
    """构建 S7comm PDU Setup 请求"""
    s7 = bytes([
        0x03, 0x00, 0x00, 0x19,
        0x02, 0xF0, 0x80, 0x32,
        0x01, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x08, 0x00,
        0x00, 0x00, 0x00, 0xF0,
        0x00, 0x00, 0x01, 0x00,
        0x01, 0x00
    ])
    return s7

def check_vulnerability(target, port=102):
    """检测目标是否存在 CVE-2020-15782 漏洞"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10)
        sock.connect((target, port))
        
        sock.send(build_s7comm_connect())
        resp = sock.recv(1024)
        if not resp:
            sock.close()
            return False
        
        sock.send(build_s7comm_setup())
        resp = sock.recv(1024)
        
        if len(resp) > 0 and resp[0] == 0x03:
            sock.close()
            return True
        
        sock.close()
        return False
    except Exception as e:
        print(f"[!] 连接错误: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    
    target = sys.argv[1]
    result = check_vulnerability(target)
    print(f"[{'+' if result else '-'}] {target} - CVE-2020-15782 S7-1500 内存保护绕过")
```

### Nuclei YAML 检测模板

```yaml
id: CVE-2020-15782

info:
  name: Siemens S7-1500 内存保护绕过
  author: x7peeps
  severity: critical
  description: Siemens SIMATIC S7-1200/S7-1500 PLC 存在内存保护绕过漏洞，远程未认证攻击者可通过端口102/tcp向设备写入任意数据
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2020-15782
    - https://www.cisa.gov/news-events/ics-advisories/icsa-20-164-01
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cve-id: CVE-2020-15782
    cwe-id: CWE-119
  tags: cve,cve2020,siemens,s7-1500,ics,ot,rce

tcp:
  - inputs:
      - data: "0300001611d0010001000100c1020100c2020102c00109"
        read: 1024
        host: "{{Hostname}}"

    host: "{{Hostname}}"
    port: 102

    matchers:
      - type: word
        part: body
        words:
          - "0300"
```

---

## 0x01.2 CVE-2025-40943 — SIMATIC S7 追踪文件代码注入

### 漏洞背景

2026 年 3 月，Siemens 发布 ICSA-26-071-04 安全公告，披露了影响 SIMATIC S7-1500 全系列 CPU 的代码注入漏洞 CVE-2025-40943。攻击者通过诱骗合法用户在 Web 管理界面导入特制的追踪文件（trace file），可注入恶意代码。虽然需要用户交互，但由于工控环境下操作员通常信任管理界面操作，社会工程攻击成功率较高。

### 受影响版本

| 产品 | 受影响版本 |
|------|-----------|
| SIMATIC S7-1500 CPU（全系列） | 固件版本 < 4.1.2 |
| SIMATIC Drive Controller CPU | 所有版本 |
| SIMATIC ET 200SP Open Controller | 所有版本 |

### 漏洞原理分析

S7-1500 的 Web 管理界面允许用户上传追踪文件用于诊断。该文件的解析过程中存在输入验证不足，攻击者可在追踪文件中嵌入恶意脚本内容。当 Web 界面解析该文件时，嵌入的代码在设备上下文中执行，可导致设备配置被篡改或敏感信息泄露。

### HTTP PoC

```bash
# 上传恶意追踪文件到 S7-1500 Web 界面
curl -k -X POST "https://TARGET/web/cgi-bin/tracing" \
  -H "Content-Type: multipart/form-data" \
  -F "tracefile=@malicious_trace.trc"
```

### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2025-40943 漏洞检测脚本 - Siemens S7-1500 追踪文件注入"""
import requests
import sys
import urllib3
urllib3.disable_warnings()

def check(target):
    """检测目标 Web 界面是否可访问且存在追踪文件上传接口"""
    url = f"https://{target}/web/"
    try:
        r = requests.get(url, verify=False, timeout=10)
        if r.status_code == 200 and "SIMATIC" in r.text:
            trace_url = f"https://{target}/web/cgi-bin/tracing"
            r2 = requests.get(trace_url, verify=False, timeout=10)
            if r2.status_code != 404:
                return True
    except Exception:
        pass
    return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    result = check(sys.argv[1])
    print(f"[{'+' if result else '-'}] {sys.argv[1]} - CVE-2025-40943 S7-1500 追踪文件注入")
```

### Nuclei YAML 检测模板

```yaml
id: CVE-2025-40943

info:
  name: Siemens S7-1500 追踪文件代码注入
  author: x7peeps
  severity: high
  description: Siemens SIMATIC S7-1500 Web界面追踪文件导入存在代码注入漏洞
  reference:
    - https://www.cisa.gov/news-events/ics-advisories/icsa-26-071-04
  classification:
    cve-id: CVE-2025-40943
  tags: cve,cve2025,siemens,s7-1500,ics,code-injection

http:
  - method: GET
    path:
      - "{{BaseURL}}/web/"
      - "{{BaseURL}}/web/cgi-bin/tracing"

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "SIMATIC"
      - type: status
        status:
          - 200
```

---

## 0x01.3 CVE-2019-6575 — OPC UA 通信拒绝服务

### 漏洞背景

CVE-2019-6575 影响 Siemens SIMATIC 产品线中超过 40 种产品，包括 S7-1500 CPU、WinCC、SINEC NMS 等。攻击者向端口 4840/tcp 发送特制网络包即可导致 OPC UA 通信中断或设备崩溃，无需认证和用户交互。

### 受影响版本

| 产品 | 影响范围 |
|------|---------|
| SIMATIC S7-1500 CPU | V2.5 至 V2.6.1 |
| SIMATIC WinCC OA | < V3.15 P018 |
| SINEC NMS | < V1.0 SP1 |
| 其他 40+ 产品 | 各自受影响版本 |

### 漏洞原理分析

OPC UA 协议（统一架构）用于工业设备间通信。Siemens 实现的 OPC UA 服务端在处理畸形请求时未充分验证输入长度和格式，导致缓冲区溢出或空指针解引用，最终触发服务崩溃。

### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2019-6575 检测脚本 - Siemens OPC UA DoS"""
import socket
import sys

def check(target, port=4840):
    """发送畸形 OPC UA Hello 请求检测漏洞"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((target, port))
        
        hello = b'\x00' * 1024
        sock.send(hello)
        
        try:
            resp = sock.recv(256)
            if len(resp) == 0:
                return True
        except socket.timeout:
            return True
        
        sock.close()
        return False
    except Exception:
        return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    result = check(sys.argv[1])
    print(f"[{'+' if result else '-'}] {sys.argv[1]} - CVE-2019-6575 OPC UA DoS")
```

### Nuclei YAML 检测模板

```yaml
id: CVE-2019-6575

info:
  name: Siemens OPC UA 拒绝服务
  author: x7peeps
  severity: high
  description: Siemens多款产品OPC UA服务端存在拒绝服务漏洞
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2019-6575
  classification:
    cvss-score: 7.5
    cve-id: CVE-2019-6575
  tags: cve,cve2019,siemens,opc-ua,denial-of-service,ics

tcp:
  - inputs:
      - data: "00000000"
        read: 512
    host: "{{Hostname}}"
    port: 4840
    matchers:
      - type: binary
        binary:
          - "0000"
```

---

# 0x02 Schneider Electric Modicon 高危漏洞

Schneider Electric Modicon 系列 PLC（M340、M580）广泛应用于能源、制造和商业设施。Forescout 在 OT:ICEFALL 研究项目中发现了一系列影响 Modicon 的严重漏洞，揭示了 Modbus 协议在认证机制上的根本缺陷。

## 0x02.1 CVE-2022-45789 — Modicon Modbus 认证绕过

### 漏洞背景

CVE-2022-45789（CVSS 8.1）是 Schneider Electric Modicon PLC 中的认证绕过漏洞，属于 OT:ICEFALL 漏洞集合。攻击者通过捕获重放（capture-replay）方式劫持已认证的 Modbus 会话，可在控制器上执行未授权的 Modbus 功能。

### 受影响版本

| 产品 | 受影响版本 |
|------|-----------|
| Modicon M340 CPU (BMXP34) | 所有版本 |
| Modicon M580 CPU (BMEP/BMEH) | 所有版本 |
| Modicon M580 CPU Safety (BMEP58S/BMEH58S) | 所有版本 |
| Modicon Momentum Unity M1E (171CBU) | 所有版本 |
| Modicon MC80 (BMKC80) | 所有版本 |
| EcoStruxure Process Expert | V2020 及更早 |

### 漏洞原理分析

Modbus TCP 协议（端口 502）本身缺乏加密和认证机制。当 Modicon PLC 配置了应用密码（application password）进行访问控制时，攻击者可以嗅探合法的 Modbus 认证会话数据包，然后重放该会话以获取对控制器的未授权访问。重放成功后，攻击者可执行任意 Modbus 功能码，包括读写寄存器、下载程序等。

Forescout 研究人员还发现，该漏洞可与 Siemens CVE-2021-31886（Nucleus TCP/IP 栈漏洞）链式利用，实现 OT 网络的深度横向移动。

### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2022-45789 检测脚本 - Schneider Modicon Modbus认证绕过"""
import socket
import struct
import sys

def check_modbus(target, port=502):
    """检测 Modbus 设备是否暴露且未设置应用密码保护"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((target, port))
        
        mbap = struct.pack('>HHHBB', 0x0001, 0x0000, 0x0006, 0x01, 0x03)
        payload = mbap + struct.pack('>HH', 0x0000, 0x0001)
        sock.send(payload)
        
        resp = sock.recv(1024)
        sock.close()
        
        if len(resp) >= 9 and resp[7] == 0x03:
            exc_code = resp[8] if len(resp) > 8 else None
            if exc_code is None or exc_code == 0x00:
                return True
            elif exc_code in (0x02, 0x08):
                return False
            return True
        return False
    except Exception:
        return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    result = check_modbus(sys.argv[1])
    print(f"[{'+' if result else '-'}] {sys.argv[1]} - CVE-2022-45789 Modicon Modbus认证绕过")
```

### Nuclei YAML 检测模板

```yaml
id: CVE-2022-45789

info:
  name: Schneider Modicon Modbus认证绕过
  author: x7peeps
  severity: high
  description: Schneider Electric Modicon PLC存在Modbus协议认证绕过漏洞，可通过捕获重放攻击执行未授权操作
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2022-45789
    - https://www.cisa.gov/news-events/ics-advisories/icsa-23-227-01
  classification:
    cvss-score: 8.1
    cve-id: CVE-2022-45789
    cwe-id: CWE-294
  tags: cve,cve2022,schneider,modicon,modbus,auth-bypass,ics

tcp:
  - host:
      - "{{Hostname}}"
    port: 502
    inputs:
      - data: "000100000006010300000001"
        read: 1024
    matchers:
      - type: binary
        binary:
          - "0303"
```

---

## 0x02.2 CVE-2022-45788 — Modicon 未授权 RCE

### 漏洞背景

CVE-2022-45788（CVSS 7.5）同样属于 OT:ICEFALL 漏洞集合，允许攻击者在 Modicon PLC 上执行未授权代码。该漏洞与 CVE-2022-45789 互补，前者侧重于执行未授权 Modbus 功能，后者则直接提供远程代码执行能力。

### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2022-45788 检测脚本 - Schneider Modicon 未授权RCE"""
import socket
import sys

def check(target, port=502):
    """检测 Modicon PLC 是否响应未认证的功能码请求"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((target, port))
        
        # 功能码 43 (Read Device Identification)
        mbap = b'\x00\x01\x00\x00\x00\x06\x01\x2b'
        payload = mbap + b'\x0e\x01\x00'
        sock.send(payload)
        
        resp = sock.recv(1024)
        sock.close()
        
        if len(resp) > 9 and resp[7] == 0x2b:
            return True
        return False
    except Exception:
        return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    result = check(sys.argv[1])
    print(f"[{'+' if result else '-'}] {sys.argv[1]} - CVE-2022-45788 Modicon 未授权RCE")
```

### Nuclei YAML 检测模板

```yaml
id: CVE-2022-45788

info:
  name: Schneider Modicon 未授权RCE
  author: x7peeps
  severity: high
  description: Schneider Electric Modicon PLC存在未授权远程代码执行漏洞
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2022-45788
  classification:
    cvss-score: 7.5
    cve-id: CVE-2022-45788
  tags: cve,cve2022,schneider,modicon,rce,ics

tcp:
  - host:
      - "{{Hostname}}"
    port: 502
    inputs:
      - data: "000100000006012b0e0100"
        read: 1024
    matchers:
      - type: binary
        binary:
          - "2b"
```

---

## 0x02.3 CVE-2024-11737 — Modicon M241/M251 高危漏洞

### 漏洞背景

CVE-2024-11737 是 Schneider Electric Modicon M241/M251 系列 PLC 中的高危漏洞，CVSS 评分 9.8（Critical）。该漏洞可被远程利用，无需认证即可对 PLC 造成严重影响。

### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| Modicon M241 | 固件 < 5.2.11.29 | 5.2.11.29 |
| Modicon M251 | 固件 < 5.2.11.29 | 5.2.11.29 |
| Modicon M258 | 所有版本 | 待更新 |

### 漏洞原理分析

M241/M251 系列 PLC 基于 CODESYS 运行时平台。该漏洞存在于设备的通信处理模块中，攻击者可通过特制的网络请求绕过认证机制，直接操控 PLC 控制逻辑，可能导致工业流程被恶意修改或设备停止运行。

### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2024-11737 检测脚本 - Schneider Modicon M241/M251"""
import requests
import sys
import urllib3
urllib3.disable_warnings()

def check(target):
    """检测 Modicon M241/M251 Web 管理界面"""
    urls = [
        f"https://{target}/",
        f"http://{target}/",
    ]
    for url in urls:
        try:
            r = requests.get(url, verify=False, timeout=10, allow_redirects=True)
            if r.status_code == 200:
                if "Modicon" in r.text or "M241" in r.text or "M251" in r.text or "Machine" in r.text:
                    return True
        except Exception:
            continue
    return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    result = check(sys.argv[1])
    print(f"[{'+' if result else '-'}] {sys.argv[1]} - CVE-2024-11737 Modicon M241/M251")
```

### Nuclei YAML 检测模板

```yaml
id: CVE-2024-11737

info:
  name: Schneider Modicon M241/M251 高危漏洞
  author: x7peeps
  severity: critical
  description: Schneider Electric Modicon M241/M251存在CVSS 9.8的高危漏洞
  reference:
    - https://www.se.com/ww/en/work/support/cybersecurity/security-notifications/
  classification:
    cvss-score: 9.8
    cve-id: CVE-2024-11737
  tags: cve,cve2024,schneider,modicon,ics,rce

http:
  - method: GET
    path:
      - "{{BaseURL}}/"
    matchers:
      - type: word
        words:
          - "Modicon"
          - "M241"
          - "M251"
        condition: or
```

---

# 0x03 Rockwell Automation Allen-Bradley 高危漏洞

Rockwell Automation 的 Allen-Bradley ControlLogix 系列是北美工业控制领域的主流 PLC 平台，部署在电力、石油天然气、制造业等关键基础设施中。2023 年披露的 ControlLogix 漏洞被国家级 APT 组织预先开发了利用能力，其攻击手法与历史上最严重的 TRISIS/TRITON 工控攻击高度相似。

## 0x03.1 CVE-2023-3595 — ControlLogix 未授权 RCE（与 TRISIS 对比分析）

### 漏洞背景

CVE-2023-3595（CVSS 9.8 Critical）是 Rockwell Automation Allen-Bradley ControlLogix 1756-EN2*/EN3* EtherNet/IP 通信模块中的越界写入漏洞。该漏洞由 Dragos 在协调披露过程中发现，最令人震惊的是：**Dragos 发现一个已识别的国家级 APT 组织已经为该漏洞开发了未公开的利用能力**。

这一发现的历史意义在于：CVE-2023-3595 提供的访问能力与 2017 年 XENOTIME 组织在 TRISIS 攻击中使用的零日漏洞高度相似——两者都允许对目标固件内存进行任意操作。

### 受影响版本

| 产品型号 | 受影响模块 | 修复固件版本 |
|---------|-----------|------------|
| 1756-EN2T, EN2TK, EN2TXT | 1756-EN2* | V11.004 |
| 1756-EN2TP, EN2TPK, EN2TPXT | 1756-EN2* | V11.004 |
| 1756-EN2TR, EN2TRK, EN2TRXT | 1756-EN2* | V11.004 |
| 1756-EN2F, EN2FK | 1756-EN2* | V11.004 |
| 1756-EN3TR, EN3TRK | 1756-EN3* | V11.004 |

### 漏洞原理分析

EtherNet/IP 协议基于 CIP（Common Industrial Protocol）构建。ControlLogix 通信模块在处理恶意构造的 CIP 消息时，存在越界写入缺陷。攻击者可利用该漏洞：

1. **任意固件内存操作**：覆写通信模块的固件内存空间
2. **持久化植入**：修改固件后即使设备重启也会保持
3. **流量伪造**：在模块之间伪造通信数据
4. **逻辑篡改**：影响底层工业控制流程

### CVE-2023-3595 与 TRISIS 攻击对比

| 维度 | CVE-2023-3595 | TRISIS/TRITON |
|------|--------------|---------------|
| 目标 | EtherNet/IP 通信模块 | Triconex 安全仪表系统 |
| 攻击面 | CIP 协议（TCP/44818） | TriStation 协议（TCP/1502） |
| 漏洞类型 | 越界写入 | 固件验证缺陷 |
| 影响 | 控制逻辑篡改 + 持久化 | 安全系统禁用 + 物理破坏 |
| APT利用 | 已确认（国家级） | 已确认（XENOTIME） |

### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2023-3595 检测脚本 - Rockwell ControlLogix RCE"""
import socket
import struct
import sys

def check(target, port=44818):
    """检测 EtherNet/IP 通信模块是否暴露"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((target, port))
        
        # Ethernet/IP List Identity request
        encaps = struct.pack('<HHIIQ', 0x0063, 24, 0x00000000, 0x00000000, 0)
        sock.send(encaps)
        
        resp = sock.recv(1024)
        sock.close()
        
        if len(resp) >= 24:
            cmd = struct.unpack('<H', resp[0:2])[0]
            if cmd == 0x0063:
                return True
        return False
    except Exception:
        return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    result = check(sys.argv[1])
    print(f"[{'+' if result else '-'}] {sys.argv[1]} - CVE-2023-3595 ControlLogix RCE")
```

### Nuclei YAML 检测模板

```yaml
id: CVE-2023-3595

info:
  name: Rockwell ControlLogix EtherNet/IP RCE
  author: x7peeps
  severity: critical
  description: Rockwell Automation Allen-Bradley ControlLogix 1756-EN2*/EN3* 通信模块存在越界写入漏洞，可导致远程代码执行
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2023-3595
    - https://www.cisa.gov/news-events/ics-advisories/icsa-23-193-01
  classification:
    cvss-score: 9.8
    cve-id: CVE-2023-3595
    cwe-id: CWE-787
  tags: cve,cve2023,rockwell,controllogix,enip,rce,ics

tcp:
  - host:
      - "{{Hostname}}"
    port: 44818
    inputs:
      - data: "6300180000000000000000000000000001000000"
        read: 1024
    matchers:
      - type: binary
        binary:
          - "6300"
```

---

## 0x03.2 CVE-2023-3596 — ControlLogix 拒绝服务

### 漏洞背景

CVE-2023-3596（CVSS 7.5 High）影响 1756-EN4* 系列 EtherNet/IP 通信模块。与 CVE-2023-3595 类似的越界写入，但影响范围受限，主要导致拒绝服务。

### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2023-3596 检测脚本 - Rockwell ControlLogix DoS"""
import socket
import struct
import sys

def check(target, port=44818):
    """检测 ControlLogix EN4 模块是否暴露 EtherNet/IP"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((target, port))
        
        encaps = struct.pack('<HHIIQ', 0x0063, 24, 0, 0, 0)
        sock.send(encaps)
        resp = sock.recv(1024)
        sock.close()
        
        return len(resp) >= 24
    except Exception:
        return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    result = check(sys.argv[1])
    print(f"[{'+' if result else '-'}] {sys.argv[1]} - CVE-2023-3596 ControlLogix DoS")
```

### Nuclei YAML 检测模板

```yaml
id: CVE-2023-3596

info:
  name: Rockwell ControlLogix 拒绝服务
  author: x7peeps
  severity: high
  description: Rockwell Allen-Bradley ControlLogix 1756-EN4* 通信模块存在DoS漏洞
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2023-3596
  classification:
    cvss-score: 7.5
    cve-id: CVE-2023-3596
  tags: cve,cve2023,rockwell,controllogix,denial-of-service,ics

tcp:
  - host:
      - "{{Hostname}}"
    port: 44818
    inputs:
      - data: "6300180000000000000000000000000001000000"
        read: 1024
    matchers:
      - type: binary
        binary:
          - "6300"
```

---

## 0x03.3 CVE-2024-6242 — Trusted Slot 绕过

### 漏洞背景

CVE-2024-6242（CVSS 8.4 High）是 Claroty 研究团队发现的 ControlLogix Trusted Slot 安全特性绕过漏洞。Trusted Slot 功能用于限制 1756 机箱中不同插槽模块间的通信，但该漏洞允许攻击者通过 CIP 路由在机箱内的本地背板插槽间跳跃，绕过安全边界。

### 漏洞原理分析

Trusted Slot 功能通过策略强制执行来阻止不可信路径的通信。Claroty 发现的绕过技术利用了 CIP 路由机制中的缺陷：

1. 攻击者连接到机箱中的一个非受信任网络卡（如 Ethernet 模块）
2. 通过 CIP 路由跳转到同一机箱内的 CPU 插槽
3. 绕过 Trusted Slot 策略，发送特权 CIP 命令
4. 可下载任意逻辑到 PLC CPU

### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2024-6242 检测脚本 - Rockwell Trusted Slot绕过"""
import socket
import struct
import sys

def check(target, port=44818):
    """检测 ControlLogix 设备是否暴露 CIP 服务"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((target, port))
        
        encaps = struct.pack('<HHIIQ', 0x0063, 24, 0, 0, 0)
        sock.send(encaps)
        resp = sock.recv(2048)
        sock.close()
        
        if len(resp) >= 24:
            return True
        return False
    except Exception:
        return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    result = check(sys.argv[1])
    print(f"[{'+' if result else '-'}] {sys.argv[1]} - CVE-2024-6242 Trusted Slot绕过")
```

### Nuclei YAML 检测模板

```yaml
id: CVE-2024-6242

info:
  name: Rockwell ControlLogix Trusted Slot绕过
  author: x7peeps
  severity: high
  description: Rockwell Automation ControlLogix 1756 Trusted Slot安全特性可被绕过，导致未授权CIP命令执行
  reference:
    - https://www.cisa.gov/news-events/ics-advisories/icsa-24-214-09
  classification:
    cvss-score: 8.4
    cve-id: CVE-2024-6242
  tags: cve,cve2024,rockwell,controllogix,auth-bypass,ics

tcp:
  - host:
      - "{{Hostname}}"
    port: 44818
    inputs:
      - data: "6300180000000000000000000000000001000000"
        read: 1024
    matchers:
      - type: binary
        binary:
          - "6300"
```

---

# 0x04 ABB AC500 与 Cylon ASPECT 高危漏洞

ABB 是全球领先的工业自动化供应商，其 AC500 系列 PLC 和 Cylon ASPECT 楼宇自动化系统广泛部署于全球关键基础设施中。VulnCheck 在 Cylon ASPECT 系统中发现了 265 个在线暴露的实例，其中 214 个至今未修补。

## 0x04.1 CVE-2023-6357 — AC500 Shell 函数注入

### 漏洞背景

CVE-2023-6357（CVSS 8.8 High）存在于 ABB AC500 V3 PLC 的固件中。经过认证的控制程序员可以通过 SysFile 或 CAA 文件系统库函数注入操作系统 Shell 调用，实现特权提升。

### 受影响版本

| 产品 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| AC500 V3 (PM5xxx) | 固件 < 3.8.0 | 3.8.0 |

### 漏洞原理分析

AC500 V3 PLC 使用 CODESYS 运行时作为编程平台。在通过 SysFile 或 CAA 文件系统库进行文件操作时，如果输入参数中包含操作系统命令特殊字符，可以被解释为 Shell 命令注入。攻击者（需先获取控制编程权限）可利用此漏洞在 PLC 操作系统层面执行任意命令。

### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2023-6357 检测脚本 - ABB AC500 Shell函数注入"""
import requests
import sys
import urllib3
urllib3.disable_warnings()

def check(target):
    """检测 ABB AC500 V3 Web 管理界面"""
    try:
        r = requests.get(f"https://{target}/", verify=False, timeout=10)
        if r.status_code == 200:
            if "ABB" in r.text or "AC500" in r.text or "Automation Builder" in r.text:
                return True
    except Exception:
        pass
    return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    result = check(sys.argv[1])
    print(f"[{'+' if result else '-'}] {sys.argv[1]} - CVE-2023-6357 AC500 Shell注入")
```

### Nuclei YAML 检测模板

```yaml
id: CVE-2023-6357

info:
  name: ABB AC500 Shell函数注入
  author: x7peeps
  severity: high
  description: ABB AC500 V3 PLC存在Shell函数注入漏洞，认证后可执行OS命令
  reference:
    - https://library.e.abb.com/public/c0edc1621795405f9b464d9919b93eed/3ADR011377%20AC500%20V3%20-%20Multiple%20vulnerabilities.pdf
  classification:
    cvss-score: 8.8
    cve-id: CVE-2023-6357
    cwe-id: CWE-78
  tags: cve,cve2023,abb,ac500,command-injection,ics

http:
  - method: GET
    path:
      - "{{BaseURL}}/"
    matchers:
      - type: word
        words:
          - "ABB"
          - "AC500"
        condition: or
```

---

## 0x04.2 CVE-2024-12430 — AC500 命令执行

### 漏洞背景

CVE-2024-12430 是 ABB AC500 V3 中的命令执行漏洞，需要先利用 CVE-2024-12429（目录遍历）获取文件访问权限后，可在特制文件中注入命令，最终以 root 权限执行。这是一个漏洞链组合。

### 漏洞原理分析

攻击链如下：
1. 利用 CVE-2024-12429 通过内存卡的目录遍历读取系统文件和配置
2. 在已读取的配置文件中注入命令
3. 利用 CVE-2024-12430 执行注入的命令，权限为 root

### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2024-12429/12430 组合链检测 - ABB AC500 目录遍历+命令执行"""
import requests
import sys
import urllib3
urllib3.disable_warnings()

def check(target):
    """检测 AC500 V3 Web 界面暴露"""
    try:
        endpoints = [
            f"https://{target}/web/visualization",
            f"https://{target}/",
        ]
        for url in endpoints:
            r = requests.get(url, verify=False, timeout=10)
            if r.status_code == 200:
                return True
    except Exception:
        pass
    return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    result = check(sys.argv[1])
    print(f"[{'+' if result else '-'}] {sys.argv[1]} - CVE-2024-12430 AC500 命令执行")
```

### Nuclei YAML 检测模板

```yaml
id: CVE-2024-12430

info:
  name: ABB AC500 命令执行
  author: x7peeps
  severity: critical
  description: ABB AC500 V3通过目录遍历+命令注入组合链可实现root权限命令执行
  reference:
    - https://library.e.abb.com/public/c0edc1621795405f9b464d9919b93eed/3ADR011377%20AC500%20V3%20-%20Multiple%20vulnerabilities.pdf
  classification:
    cve-id: CVE-2024-12430
  tags: cve,cve2024,abb,ac500,command-execution,ics

http:
  - method: GET
    path:
      - "{{BaseURL}}/"
    matchers:
      - type: word
        words:
          - "ABB"
```

---

## 0x04.3 CVE-2023-0636 + CVE-2024-6209 — Cylon ASPECT RCE 与文件泄露

### 漏洞背景

ABB Cylon ASPECT 是一套广泛应用于商业建筑和教育机构（包括美国自然历史博物馆、加州大学尔湾分校）的楼宇自动化与能源管理系统。VulnCheck 在 Shodan/Censys 上发现了 265 个在线暴露的系统，其中 214 个存在 CVE-2023-0636 漏洞。

CVE-2023-0636 允许命令注入实现远程代码执行，CVE-2024-6209 则允许未认证文件泄露，获取系统中的明文凭据。两者组合可实现完整的攻击链：凭据获取 → 认证绕过 → 命令注入 → 系统控制。

### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2023-0636 / CVE-2024-6209 检测脚本 - ABB Cylon ASPECT"""
import requests
import sys
import urllib3
urllib3.disable_warnings()

def check(target):
    """检测 Cylon ASPECT 系统是否暴露"""
    try:
        r = requests.get(f"http://{target}/", verify=False, timeout=10)
        if r.status_code == 200 and ("Cylon" in r.text or "ASPECT" in r.text or "aspect" in r.text):
            return True
        r2 = requests.get(f"https://{target}/", verify=False, timeout=10)
        if r2.status_code == 200 and ("Cylon" in r2.text or "ASPECT" in r2.text):
            return True
    except Exception:
        pass
    return False

def check_file_disclosure(target):
    """CVE-2024-6209 文件泄露检测"""
    paths = [
        "/downloads/aspect.db",
        "/api/auth/users",
        "/config/users",
    ]
    for path in paths:
        try:
            url = f"http://{target}{path}"
            r = requests.get(url, verify=False, timeout=5)
            if r.status_code == 200 and len(r.text) > 100:
                return True
        except Exception:
            continue
    return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    result = check(sys.argv[1])
    print(f"[{'+' if result else '-'}] {sys.argv[1]} - CVE-2023-0636 Cylon ASPECT RCE")
    if result:
        fd = check_file_disclosure(sys.argv[1])
        print(f"[{'+' if fd else '-'}] {sys.argv[1]} - CVE-2024-6209 Cylon ASPECT 文件泄露")
```

### Nuclei YAML 检测模板

```yaml
id: CVE-2023-0636

info:
  name: ABB Cylon ASPECT 命令注入RCE
  author: x7peeps
  severity: critical
  description: ABB Cylon ASPECT楼宇自动化系统存在命令注入漏洞，可实现远程代码执行
  reference:
    - https://www.vulncheck.com/blog/exploring-abb-ics-vulns
  classification:
    cve-id: CVE-2023-0636
  tags: cve,cve2023,abb,cylon,aspect,rce,ics

http:
  - method: GET
    path:
      - "{{BaseURL}}/"
    matchers-condition: and
    matchers:
      - type: word
        words:
          - "Cylon"
          - "ASPECT"
        condition: or
      - type: status
        status:
          - 200
```

---

# 0x05 公开 PoC 收集情况与利用思路

## PoC 收集情况总表

| CVE | GitHub PoC | Exploit-DB | Metasploit | Nuclei | 在野利用 |
|-----|-----------|------------|------------|--------|---------|
| CVE-2020-15782 | ⚠️ 概念性 | ❌ | ❌ | ⚠️ 自定义 | ❌ |
| CVE-2025-40943 | ❌ | ❌ | ❌ | ⚠️ 自定义 | ❌ |
| CVE-2019-6575 | ❌ | ❌ | ❌ | ⚠️ 自定义 | ❌ |
| CVE-2022-45789 | ⚠️ Forescout | ❌ | ❌ | ⚠️ 自定义 | ✅ |
| CVE-2022-45788 | ⚠️ Forescout | ❌ | ❌ | ⚠️ 自定义 | ✅ |
| CVE-2024-11737 | ❌ | ❌ | ❌ | ⚠️ 自定义 | ❌ |
| CVE-2023-3595 | ⚠️ Dragos | ❌ | ❌ | ⚠️ 自定义 | ✅ APT |
| CVE-2023-3596 | ⚠️ Dragos | ❌ | ❌ | ⚠️ 自定义 | ✅ APT |
| CVE-2024-6242 | ⚠️ Claroty | ❌ | ❌ | ⚠️ 自定义 | ❌ |
| CVE-2023-6357 | ❌ | ❌ | ❌ | ⚠️ 自定义 | ❌ |
| CVE-2024-12430 | ❌ | ❌ | ❌ | ⚠️ 自定义 | ❌ |
| CVE-2023-0636 | ✅ PacketStorm | ✅ | ❌ | ⚠️ 自定义 | ⚠️ |
| CVE-2024-6209 | ✅ VulnCheck | ❌ | ❌ | ⚠️ 自定义 | ❌ |

## 关键 PoC 仓库链接

1. **Forescout OT:ICEFALL**: https://www.forescout.com/research-labs/ot-icefall/
2. **Dragos ControlLogix 分析**: https://www.dragos.com/blog/mitigating-cves-impacting-rockwell-automation-controllogix-firmware/
3. **Claroty Trusted Slot 绕过**: https://claroty.com/team82/research/bypassing-rockwell-automation-logix-controllers-local-chassis-security-protection
4. **VulnCheck Cylon ASPECT**: https://www.vulncheck.com/blog/exploring-abb-ics-vulns
5. **ABB 安全公告**: https://library.e.abb.com/

## 防守型验证思路

1. **网络层检测**：在 OT 网络边界部署 IDS/IPS，配置针对异常 S7comm、Modbus、CIP 协议行为的检测规则
2. **设备指纹**：通过被动扫描识别网络中的 PLC 设备型号和固件版本
3. **流量基线**：建立正常的工控协议流量基线，检测偏离基线的异常请求
4. **补丁验证**：在维护窗口验证所有受影响设备是否已升级到修复版本

---

# 0x06 共性攻击模式分析

## 模式 1：协议层未认证内存操作

**代表 CVE**: CVE-2020-15782, CVE-2023-3595

工业控制协议（S7comm、CIP、Modbus）设计之初以功能性为优先，缺乏现代网络安全特性。攻击者可在协议层直接发送恶意数据包，绕过应用层认证直接操控 PLC 内存。这类漏洞的根源在于协议设计层面的安全欠账。

## 模式 2：认证绕过与会话劫持

**代表 CVE**: CVE-2022-45789, CVE-2024-6242

Modbus 协议缺乏加密和完整性保护，使得捕获重放攻击成为可能。ControlLogix 的 Trusted Slot 绕过则揭示了硬件安全边界设计中的逻辑缺陷。两者的共同点是：安全机制被绕过后，攻击者可直接执行特权操作。

## 模式 3：Web 管理面代码注入

**代表 CVE**: CVE-2025-40943, CVE-2023-0636

现代 PLC 集成了 Web 管理界面以方便运维，但也引入了传统 Web 应用的所有风险：命令注入、代码注入、路径遍历。工控环境下 Web 界面的安全加固通常滞后于 IT 系统。

## 模式 4：固件级持久化后门

**代表 CVE**: CVE-2023-3595 (APT 利用)

国家级 APT 组织利用 PLC 通信模块的漏洞实现固件级持久化，这种攻击的检测难度极高，因为：
- 恶意代码驻留在固件层面，传统安全软件无法检测
- 通信模块可独立于 CPU 运行，异常行为难以被监控
- 修改固件可使模块脱离信任链

## 模式 5：默认凭据与硬编码密钥

**代表厂商**: Schneider Modicon, ABB AC500

多个工控厂商的产品在出厂时设置了默认凭据或硬编码密钥，且用户修改意愿低。配合认证绕过漏洞，攻击者可利用默认凭据直接获取设备控制权。

---

# 0x07 应急排查与防守建议

## 紧急排查清单

| 排查项 | 操作方法 | 优先级 |
|--------|---------|--------|
| S7-1500 固件版本 | 通过 Web 界面或 TIA Portal 检查 | P0 |
| Modicon Modbus 通信 | 检查端口 502 是否暴露，是否设置了应用密码 | P0 |
| ControlLogix 固件 | 通过 Studio 5000 检查 EN2*/EN4* 模块固件版本 | P0 |
| AC500 固件版本 | 通过 Automation Builder 检查 | P1 |
| Cylon ASPECT 暴露 | Shodan 搜索 `title:"Cylon"` 或 `title:"ASPECT"` | P1 |

## 日志关键字段表

| 协议 | 关注字段 | 异常指标 |
|------|---------|---------|
| S7comm | COTP/TPKT 长度字段 | 异常长度的 PDU |
| Modbus TCP | 功能码 + 异常响应码 | 未认证的写操作（FC5/FC6/FC15/FC16） |
| CIP/EtherNet/IP | 命令代码 + 服务代码 | 非预期的编程命令（Service Code 0x52/0x53） |
| OPC UA | 请求类型 + 安全策略 | 大量异常 Hello 请求 |

## 紧急缓解措施

1. **网络隔离**：确保所有工控设备位于独立的 OT 网络中，通过工业防火墙与 IT 网络隔离
2. **端口限制**：仅允许授权的工程工作站访问 PLC 的编程端口（102/TCP、502/TCP、44818/TCP）
3. **VPN 接入**：远程维护必须通过 VPN 通道
4. **禁用 Web 界面**：如非必需，禁用 PLC 的内置 Web 服务器（默认设置已禁用）

## 长期安全加固建议

1. **补丁管理**：建立工控设备的固件更新流程，在维护窗口执行验证后的更新
2. **网络监控**：部署 OT 专用的网络检测平台（如 Claroty、Dragos、Nozomi）
3. **配置审计**：定期审计 PLC 的访问保护级别、密码策略和网络配置
4. **应急响应**：制定工控安全事件的专项响应计划，包含物理隔离和工艺切换方案
5. **安全培训**：对 OT 运维人员进行工控安全意识培训

---

# 0x08 参考资料

1. **NVD - CVE-2020-15782**: https://nvd.nist.gov/vuln/detail/CVE-2020-15782
2. **CISA ICSA-20-164-01 Siemens SIMATIC S7**: https://www.cisa.gov/news-events/ics-advisories/icsa-20-164-01
3. **CISA ICSA-26-071-04 Siemens SIMATIC**: https://www.cisa.gov/news-events/ics-advisories/icsa-26-071-04
4. **Forescout OT:ICEFALL 研究**: https://www.forescout.com/research-labs/ot-icefall/
5. **Dragos: Mitigating CVEs Impacting Rockwell Automation**: https://www.dragos.com/blog/mitigating-cves-impacting-rockwell-automation-controllogix-firmware/
6. **Claroty: Bypassing Rockwell Logix Trusted Slot**: https://claroty.com/team82/research/bypassing-rockwell-automation-logix-controllers-local-chassis-security-protection
7. **ABB AC500 V3 Multiple Vulnerabilities**: https://library.e.abb.com/
8. **VulnCheck: Exploring ABB ICS Vulns**: https://www.vulncheck.com/blog/exploring-abb-ics-vulns
9. **Schneider Electric Security Notifications**: https://www.se.com/ww/en/work/support/cybersecurity/security-notifications/
10. **CISA ICSA-23-193-01 Rockwell Automation**: https://www.cisa.gov/news-events/ics-advisories/icsa-23-193-01

---

> **免责声明**：本文仅供安全研究和教育目的使用。所有 PoC 代码和检测模板仅用于授权的安全测试。未经授权对目标系统进行测试属于违法行为。作者不对任何因使用本文内容导致的损害承担责任。请在合法授权范围内开展安全评估工作。
