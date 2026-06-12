---
title: "迷雾追踪：资产测绘与CDN真实IP绕过底层逻辑"
date: 2026-06-11T21:00:00+08:00
draft: false
weight: 10
---

# 迷雾追踪：资产测绘与CDN真实IP绕过底层逻辑

在真实的红蓝对抗中，渗透测试的第一步永远是**信息收集（Reconnaissance）**。
现代企业为了防御 DDoS 攻击和隐藏核心资产，往往会将 Web 服务隐藏在 CDN（内容分发网络，如 Cloudflare, 阿里云 DCDN）或高防 IP 的迷雾之下。

当你 `ping www.target.com` 时，得到的往往只是 CDN 边缘节点的 IP。如果你对着 CDN 节点狂轰滥炸，不仅徒劳无功，还会立刻触发防守方的态势感知告警。

本文将摒弃简单的工具介绍，直击网络协议的底层，推演如何利用 DNS 历史、SSL/TLS 证书机制以及空间测绘引擎，穿透 CDN 的迷雾，揪出隐藏在背后的真实源站 IP。

---

## 1. 空间测绘引擎：网络空间的上帝视角

传统的端口扫描（如 Nmap）是主动的，极易被防火墙拦截。而**网络空间测绘引擎**（如 FOFA, Shodan, ZoomEye）则是被动的，它们在全球部署了成千上万的扫描节点，日夜不停地抓取互联网上每一个 IP 的响应特征。

### 1.1 测绘引擎的底层逻辑
当测绘引擎向一个 IP 发起 HTTP 请求时，它不仅记录状态码，还会提取：
*   **Header 特征**：如 `Server: nginx/1.18.0`、特殊的 `X-Powered-By`。
*   **Body 特征**：提取 HTML 中的 `<title>`、特定的 JS 文件哈希（如 Vue/React 打包后的 hash chunk）。
*   **Icon 特征**：计算网站 `favicon.ico` 的 Mmh3 Hash 值。

### 1.2 组合查询刺透 CDN
假设目标网站 `www.target.com` 使用了 CDN。虽然域名解析到了 CDN，但**源站的服务器很可能也暴露在公网上（只是没有绑定域名）**。

**攻击推演：**
1.  **获取特征**：我们访问 CDN 上的合法网站，提取其 `favicon.ico` 的 Hash，或者 HTML 源码中一段极其特殊的版权声明（如 `© 2026 Target Corp All Rights Reserved. V2.1.4`）。
2.  **引擎反查**：在 FOFA 中输入语法 `icon_hash="123456789"` 或 `body="© 2026 Target Corp All Rights Reserved. V2.1.4"`。
3.  **结果**：FOFA 会返回所有匹配该特征的 IP。由于源站 IP 在公网上也能被测绘引擎扫描到，它很可能就赫然列在搜索结果中。

---

## 2. 证书的背叛：Subject Alternative Name (SAN)

在 HTTPS 时代，SSL/TLS 证书成为了寻找真实 IP 最锋利的武器。

### 2.1 证书透明度 (Certificate Transparency, CT)
为了防止 CA（证书颁发机构）滥发证书，谷歌等公司推动了 CT 机制：**世界上每一张合法颁发的 TLS 证书，都必须公开记录在 CT 日志服务器上**。

*   **攻击利用**：通过查询 CT 日志（如 `crt.sh`），攻击者输入 `target.com`，可以瞬间获得该域名下**所有的子域名**（如 `dev.target.com`, `api.target.com`）。很多时候，主站套了 CDN，但测试站或 API 站为了省钱没有套 CDN，直接暴露了真实 C 段 IP。

### 2.2 测绘引擎 + 证书反查
即使找到了源站 IP 段，如何确认哪个 IP 是真正的源站？

*   **底层逻辑**：源站服务器虽然配置了 CDN，但它为了能和 CDN 节点建立 HTTPS 连接，**源站服务器上通常也会部署目标域名的 TLS 证书**。
*   **测绘语法**：在 FOFA/Censys 中直接搜索证书序列号或 SAN 字段：
    `cert="www.target.com"`
*   **结果**：测绘引擎会返回所有在 443 端口上挂载了 `www.target.com` 证书的 IP。CDN 节点会有成百上千个，但那些**所属 ASN 是某云厂商（如阿里云 ECS、腾讯云）或某地 IDC 机房**的 IP，几乎 100% 是真实源站。

---

## 3. 协议的破绽：主动探测与邮件外发

如果被动测绘找不到，我们就必须利用业务逻辑的破绽，诱骗源站**主动**向我们发起连接。

### 3.1 邮件头 (Email Header) 泄露
如果目标网站有注册、找回密码功能，它必然会发送邮件。
*   **推演**：我们在目标网站点击“发送验证码”，然后在我们的邮箱里查看收到的邮件的**原始邮件头 (Raw Header)**。
*   **原理**：在邮件路由的过程中，SMTP 协议的 `Received:` 字段会诚实地记录邮件是由哪个 IP 发出的。如果目标网站使用的是与 Web 同一台服务器或同网段的自建邮件服务（如 Postfix/Sendmail），真实 IP 将直接暴露。

### 3.2 SSRF 与反向连接诱导
利用目标网站的功能逻辑，诱导它向攻击者控制的服务器发起请求。
*   **远程图片抓取**：如果目标网站有“通过 URL 上传头像”的功能，输入 `http://vps_ip/test.jpg`。此时，发起 HTTP GET 请求的，必然是绕过了 CDN 的真实源站。
*   **XML/RSS 订阅**：利用 XML 外部实体（XXE）或 RSS 订阅功能，迫使源站解析外部链接。

### 3.3 历史 DNS 解析记录
CDN 往往是网站做大之后才接入的。
*   **原理**：通过查询 DNS 历史解析记录库（如 SecurityTrails, ViewDNS），查看该域名在接入 CDN 之前（如 2年前）绑定的 A 记录 IP。
*   **验证**：很多企业在接入 CDN 后，并不会更换原有的服务器 IP。拿到历史 IP 后，修改本地的 `hosts` 文件，强行将域名解析到该 IP 并访问。如果网站正常响应，说明真实 IP 仍未更换。

---

## 4. 终极验证：绕过 SNI 阻断

有时候，我们通过上述方法找到了一个疑似源站的 IP，但当我们直接在浏览器输入 `https://IP` 时，却返回了 403 Forbidden 或 SSL 握手失败。

这是因为现代 Web 服务器配置了 **SNI（Server Name Indication）** 严格校验，或者 CDN 厂商在源站设置了白名单（只允许 CDN 节点的 IP 访问）。

**验证手法：构造虚假的 SNI 与 Host 头**
使用 `curl` 命令行工具，在 TLS 握手阶段强行指定 SNI，并在 HTTP 层面指定 Host：
```bash
# --resolve 强制将域名解析到指定的疑似真实 IP
# 这样在 TLS 握手时，SNI 依然是 target.com，HTTP Header 里的 Host 也是 target.com
curl -v https://www.target.com --resolve www.target.com:443:8.8.8.8
```
如果返回了正常的页面内容，恭喜你，CDN 的迷雾已被彻底驱散，你拿到了直通核心的入场券。
