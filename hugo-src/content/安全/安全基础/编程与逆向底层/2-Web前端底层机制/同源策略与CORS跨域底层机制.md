---
date: 2024-11-04T19:44:06+08:00
title: "Web前端终极防线：同源策略(SOP)与跨域(CORS)底层剖析"
weight: 20
---

# Web前端终极防线：同源策略(SOP)与跨域(CORS)底层剖析

试想一个极其恐怖的场景：
你在浏览器的一个标签页登录了网银（`bank.com`），接着又在另一个标签页打开了一个恶意网站（`evil.com`）。如果恶意网站中的 JavaScript 能够随意向 `bank.com` 发送一个转账请求，或者直接读取你网银页面的余额，那整个 Web 世界将在一天之内崩塌。

为了阻止这种灾难，浏览器引入了 Web 安全领域最核心、最基础、也是最严厉的防御机制：**同源策略（SOP, Same-Origin Policy）**。
然而，随着前后端分离架构的普及，严格的 SOP 又阻碍了正常的业务通信。于是，**CORS（跨域资源共享）** 应运而生。

本文将作为整个《安全基础》系列的收官之作，带你深度解剖 SOP 的围墙，以及 CORS 是如何在这堵墙上“开后门”，并由此引发 CSRF 与跨域漏洞的。

---

## 1. 铁壁铜墙：同源策略 (SOP) 的底层逻辑

**“同源”的定义极其苛刻**：如果两个 URL 的 **协议 (Protocol)**、**域名 (Domain)** 和 **端口 (Port)** 有任何一个不一致，它们就属于**跨域（不同源）**。

| URL 1 | URL 2 | 是否同源 | 原因 |
| :--- | :--- | :--- | :--- |
| `http://a.com/1.html` | `http://a.com/2.html` | **同源** | 协议、域名、端口(默认80)全部一致 |
| `http://a.com` | `https://a.com` | **跨域** | 协议不同 (http vs https) |
| `http://a.com` | `http://www.a.com` | **跨域** | 域名不同 (主域名 vs 子域名) |
| `http://a.com` | `http://a.com:8080` | **跨域** | 端口不同 |

### 1.1 SOP 究竟限制了什么？
同源策略像一个沙盒，将不同源的网页严格隔离。它主要限制了三大核心行为：
1. **DOM 隔离**：`evil.com` 的 JS 绝对无法获取 `bank.com` 的 DOM 节点。
2. **数据隔离**：`evil.com` 绝对无法读取属于 `bank.com` 的 Cookie、LocalStorage 或 IndexedDB。
3. **网络请求隔离**：`evil.com` 的 JS 使用 `fetch` 或 `XMLHttpRequest` 向 `bank.com` 发起 AJAX 请求时，**浏览器会拦截响应结果**。

> **⚠️ 核心误区纠正：SOP 拦截的是“响应”，而不是“请求”！**
> 很多人以为跨域时，请求根本发不出去。**这是错的！**
> 当恶意网站向网银发起跨域的 POST 请求时，**请求确实发到了网银服务器，网银服务器也确实处理了转账逻辑，并返回了 HTTP 200 OK！**
> 只是浏览器在收到网银的响应后，发现不满足同源策略，**直接把响应结果给丢弃了**，不让恶意网站的 JS 代码读取到响应内容（报错 `CORS error`）。
> 
> **这就是为什么 SOP 挡不住 CSRF（跨站请求伪造）攻击！** 因为 CSRF 只需要请求发出去并被执行即可，根本不在乎能不能读取响应。

---

## 2. 突破封锁的后门：CORS (跨域资源共享)

前后端分离时代，前端部署在 `www.a.com`，而后端 API 部署在 `api.a.com`。由于子域名不同，它们产生了跨域。前端发起的 AJAX 请求会被浏览器的 SOP 无情拦截。

为了让正常的业务能够跨域通信，W3C 制定了 **CORS（Cross-Origin Resource Sharing）** 标准。**CORS 的本质，就是服务器通过 HTTP 响应头，告诉浏览器：“我允许这个跨域请求读取我的数据。”**

### 2.1 简单请求与 CORS 响应头
如果是一个“简单请求”（如普通的 GET，或 `Content-Type` 为 `application/x-www-form-urlencoded` 的 POST），浏览器会直接发出去，并在请求头中带上 `Origin` 字段，声明自己的来源：
```http
GET /api/data HTTP/1.1
Host: api.bank.com
Origin: http://www.a.com
```

服务器收到后，如果决定允许 `www.a.com` 访问，就在响应头中加上 `Access-Control-Allow-Origin`：
```http
HTTP/1.1 200 OK
Access-Control-Allow-Origin: http://www.a.com
# 如果需要允许前端携带 Cookie 跨域，还必须加上这句：
Access-Control-Allow-Credentials: true
```
浏览器看到这个响应头与当前的源匹配，就会把数据放行给前端 JS。

### 2.2 复杂请求与预检 (Preflight)
如果前端发起了一个“复杂请求”（比如带了自定义 Header，或者发送了 `application/json` 格式的数据），这种请求如果直接发给服务器，可能会造成破坏。

浏览器会极其谨慎地**先偷偷发一个 OPTIONS 请求（预检请求）**去问服务器：
```http
OPTIONS /api/data HTTP/1.1
Host: api.bank.com
Origin: http://www.a.com
Access-Control-Request-Method: POST
Access-Control-Request-Headers: X-Custom-Token, Content-Type
```
如果服务器同意，才会返回绿灯：
```http
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: http://www.a.com
Access-Control-Allow-Methods: POST, GET, OPTIONS
Access-Control-Allow-Headers: X-Custom-Token, Content-Type
Access-Control-Max-Age: 86400  # 告诉浏览器，这个绿灯在 24 小时内有效，不用每次都问了
```
浏览器收到绿灯后，才会真正发出那个包含 JSON 数据的 POST 请求。

---

## 3. CORS 配置失误引发的安全灾难

CORS 是一把双刃剑，如果后端工程师为了图省事，配置了错误的 CORS 策略，将导致比 XSS 更严重的敏感数据泄露。

### 3.1 万恶之源：反射 Origin
很多开发者为了让所有子域名（甚至所有合作方）都能跨域调用 API，会在后端写出如下愚蠢的代码：
```java
// 伪代码：直接读取请求的 Origin 头，原封不动地反射回去
String origin = request.getHeader("Origin");
response.setHeader("Access-Control-Allow-Origin", origin);
response.setHeader("Access-Control-Allow-Credentials", "true");
```

**黑客如何利用？**
黑客构造一个恶意网站 `http://evil.com`，诱导受害者访问。
恶意网站中的 JS 发起跨域 AJAX 请求读取受害者的个人信息。
```javascript
fetch("http://api.bank.com/user_info", { credentials: 'include' })
```
由于后端的“反射 Origin”逻辑，后端会乖乖地返回：
`Access-Control-Allow-Origin: http://evil.com`
浏览器一看，哇，银行服务器竟然允许 `evil.com` 读取数据！于是痛快地放行。黑客兵不血刃地窃取了受害者的所有私密信息。

### 3.2 Null 源信任漏洞
在某些特殊情况下（如本地打开 HTML 文件，或者在 `<iframe>` 中指定了 `sandbox` 属性），浏览器发送的 `Origin` 头会变成字符串 `"null"`。
如果后端错误地配置了 `Access-Control-Allow-Origin: null`，黑客只需在自己的网站上嵌套一个沙盒 iframe 发起攻击，就能完美绕过跨域限制。

---

## 4. 总结与防御最佳实践

*   **SOP (同源策略)** 是 Web 安全的地基，它防止了恶意的跨域数据读取。
*   **CORS** 是为了业务妥协的后门，它通过 HTTP Header 实现了可控的跨域放行。
*   **SOP 防不住 CSRF**：因为 SOP 拦截的是响应，而不是请求。要防范 CSRF，必须依赖于 Anti-CSRF Token 或 Cookie 的 `SameSite` 属性。

**CORS 安全配置铁律**：
1. **绝对禁止**使用通配符 `Access-Control-Allow-Origin: *` 与 `Allow-Credentials: true` 混用（现代浏览器也已经从底层封杀了这种组合）。
2. **绝对禁止**盲目反射请求的 Origin。必须在后端维护一个严格的**白名单列表（List）**，通过正则或精确匹配，确认来源合法后，再返回对应的 Origin。
3. 不要信任 `Origin: null`。

> **终章寄语**：
> 从底层物理 MAC 地址的跳动，到 TCP/IP 协议栈的状态流转；
> 从密码学 AES/RSA 的数学博弈，到 Windows/Linux 操作系统内核的权限分割；
> 最后，我们回到了这绚丽的 Web 前端，拆解了 DOM 与 SOP 围墙。
> 
> 信息安全没有魔法，只有一层层堆叠的底层机制，以及在这些机制缝隙中寻找破绽的对抗艺术。愿这份《安全基础》硬核指南，能成为你探索网安深水区的坚实基石！