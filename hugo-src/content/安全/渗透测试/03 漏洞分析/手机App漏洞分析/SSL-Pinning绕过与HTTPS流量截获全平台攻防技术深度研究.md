---
title: "SSL Pinning 绕过与 HTTPS 流量截获：Android/iOS 全平台攻防技术深度研究"
date: 2026-07-06T18:00:00+08:00
draft: false
tags: ["SSL Pinning", "Frida", "Xposed", "Objection", "证书固定", "流量劫持", "Android安全", "iOS安全"]
categories: ["漏洞分析"]
---

# SSL Pinning 绕过与 HTTPS 流量截获：Android/iOS 全平台攻防技术深度研究

## 0x01 引言：为什么 SSL Pinning 是移动安全测试的第一道门槛

在进行移动应用安全评估时，拦截并分析应用程序的网络流量几乎是所有测试工作的起点。无论是寻找 API 端点中的业务逻辑漏洞、检测敏感数据泄露，还是逆向分析通信协议，都需要先将 HTTPS 流量引入 Burp Suite 或 mitmproxy 等中间人代理工具。

然而，现代移动应用普遍部署了 **SSL Pinning（证书固定）** 机制，使得传统代理方式完全失效。即使我们在设备上安装了代理的 CA 证书，应用在 TLS 握手阶段会将服务器返回的证书与硬编码在应用内部的证书或公钥进行比对，一旦发现不匹配就立即断开连接。这意味着：**仅仅是安装 CA 证书，远不足以完成流量劫持**。

本篇文章将从 SSL Pinning 的基本原理出发，系统性地覆盖以下内容：

- Certificate Pinning 与 Public Key Pinning 的技术区别
- Android 和 iOS 平台的各种 pinning 实现方式
- 从 Frida 通用脚本到 Xposed 模块、Objection 自动化绕过、Flutter/React Native 框架特定的 bypass 技巧
- 代理工具（Burp Suite、mitmproxy、BetterCap）的深度配置
- 运行时插桩绕过 Native 层 pinning 与 Certificate Transparency 等高阶技术
- 真实案例研究：银行 App、社交媒体 App 的流量劫持实战
- 检测与防御手段：RASP、反 Hook、证书锁定等

---

## 0x02 SSL Pinning 技术基础

### 2.1 标准 TLS 握手与信任模型

在标准的 HTTPS 通信中，客户端（移动应用）通过以下步骤验证服务器身份：

1. 客户端向服务器发起 TLS 握手请求
2. 服务器返回其 SSL 证书（包含公钥、颁发者、有效期等信息）
3. 客户端检查该证书是否由设备信任的证书颁发机构（CA）签署
4. 如果证书链可追溯至受信任的根 CA，则连接建立成功

攻击者只要将自签名 CA 证书安装到设备的信任存储中，就可以使用 Burp Suite 等代理工具为任意域名签发证书，从而实现对流量的中间人劫持。

### 2.2 SSL Pinning 的核心原理

SSL Pinning 在上述标准流程的基础上增加了一层额外的验证：**应用在编译时将预期的服务端证书或公钥硬编码到自身中，在运行时将服务器实际返回的证书与硬编码的值进行比对**。

#### Certificate Pinning（证书固定）

应用直接存储服务器的完整证书文件（通常是 .cer 或 .pem 格式），在 TLS 握手完成后，将服务器证书与本地存储的证书进行字节级比对。

```java
// Android 端 Certificate Pinning 示例 - OkHttp
CertificatePinner certificatePinner = new CertificatePinner.Builder()
    .add("api.example.com", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
    .build();

OkHttpClient client = new OkHttpClient.Builder()
    .certificatePinner(certificatePinner)
    .build();
```

#### Public Key Pinning（公钥固定）

应用只存储服务器证书的公钥或其 SHA-256 哈希值。这种方法比证书固定更灵活，因为当证书续期时，只要公钥不变就无需更新应用。

#### SPKI Pinning

对 Subject Public Key Info（SPKI）进行哈希处理，这是 OWASP 推荐的方式，因为它提取的是证书中最稳定的部分。

### 2.3 两种 Pinning 方式的比较

| 特性 | Certificate Pinning | Public Key Pinning |
|------|---------------------|-------------------|
| 更新频率 | 证书到期后必须更新 App | 公钥不变则无需更新 |
| 安全性 | 字节级对比，精确但脆弱 | 仅对比公钥，略有弹性 |
| 实现复杂度 | 简单 | 中等 |
| 推荐度 | 低 | 高（OWASP 推荐） |

---

## 0x03 Android 平台 SSL Pinning 实现方式

### 3.1 Network Security Config（Android 7+ 官方方式）

Android 7.0（API 24）引入了 Network Security Config 机制，允许开发者通过 XML 配置文件声明式地定义证书固定策略。

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config>
        <domain includeSubdomains="true">example.com</domain>
        <pin-set expiration="2026-12-31">
            <pin digest="SHA-256">7HIpactkIAq2Y49orFOOQeD4M5jDg5V0iJfE1QhKd4o=</pin>
            <!-- 备份 pin -->
            <pin digest="SHA-256">RwG35gE5eB1hYqM2WxNzfF3gA7sD9jK4lV0pQ8rTc6s=</pin>
        </pin-set>
    </domain-config>
</network-security-config>
```

在 AndroidManifest.xml 中引用该配置：

```xml
<application
    android:networkSecurityConfig="@xml/network_security_config"
    ...>
```

**关键绕过点**：如果设备已 root，攻击者可以直接修改 `res/xml/network_security_config.xml` 文件，删除 pin-set 配置，然后重新打包签名应用。

### 3.2 TrustManager 自定义（Java/Kotlin 层）

开发者可以通过实现自定义的 X509TrustManager 来绕过系统默认的证书验证逻辑。

```java
// 自定义 TrustManager - 这是安全测试中最常 hook 的目标
TrustManager[] trustAllCerts = new TrustManager[]{
    new X509TrustManager() {
        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType) {}
        
        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType) {}
        
        @Override
        public X509Certificate[] getAcceptedIssuers() {
            return new X509Certificate[0];
        }
    }
};

SSLContext sc = SSLContext.getInstance("TLS");
sc.init(null, trustAllCerts, new SecureRandom());
HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());
```

### 3.3 OkHttp / Retrofit 的 CertificatePinner

OkHttp 是 Android 平台最流行的 HTTP 客户端库，它提供了内置的 CertificatePinner 类：

```java
OkHttpClient client = new OkHttpClient.Builder()
    .certificatePinner(
        new CertificatePinner.Builder()
            .add("api.example.com", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
            .build()
    )
    .build();
```

**Frida Hook 点**：`okhttp3.CertificatePinner.check()` 方法是 OkHttp 3.x 中的核心验证函数。

### 3.4 WebView 的证书处理

Android WebView 使用系统的默认信任链，但如果应用对 WebView 中的连接进行了自定义证书校验，则需要单独处理：

```java
WebViewClient webViewClient = new WebViewClient() {
    @Override
    public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
        // 某些应用可能直接调用 handler.proceed() 忽略错误
        // 或者进行自定义的证书校验
        handler.proceed(); // 跳过 SSL 错误
    }
};
```

---

## 0x04 iOS 平台 SSL Pinning 实现方式

### 4.1 App Transport Security（ATS）

iOS 9 引入的 ATS 是 Apple 强制推行的安全策略，要求所有网络连接使用 HTTPS：

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSExceptionDomains</key>
    <dict>
        <key>example.com</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSTemporaryExceptionAllowsInsecureHTTPLoads</key>
            <false/>
        </dict>
    </dict>
</dict>
```

**绕过方式**：在越狱设备上，可以通过修改 Info.plist 将 `NSAllowsArbitraryLoads` 设为 `true`。

### 4.2 NSURLAuthenticationChallenge / URLSession Delegate

iOS 开发中最常用的 pinning 方式是通过 URLSession 的 delegate 方法：

```swift
func urlSession(_ session: URLSession, 
                didReceive challenge: URLAuthenticationChallenge,
                completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    
    guard let serverTrust = challenge.protectionSpace.serverTrust else {
        completionHandler(.cancelAuthenticationChallenge, nil)
        return
    }
    
    // 获取服务器证书
    if let serverCertificate = SecTrustGetCertificateAtIndex(serverTrust, 0) {
        let serverCertData = SecCertificateCopyData(serverCertificate) as Data
        // 与本地硬编码的证书数据比较
        if serverCertData == pinnedCertData {
            completionHandler(.useCredential, URLCredential(trust: serverTrust))
        } else {
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }
}
```

### 4.3 TrustKit 库

TrustKit 是 iOS 上最流行的第三方 SSL pinning 库，提供了声明式的配置方式：

```objc
[TrustKit initSharedInstanceWithConfiguration:@{
    kTSKSwizzleNetworkDelegates: @YES,
    kTSKPinnedDomains: @{
        @"api.example.com": @{
            kTSKEnforcePinning: @YES,
            kTSKPublicKeyHashes: @[
                @"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
                @"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=",
            ],
        },
    },
}];
```

**Frida Hook 点**：`-[TSKPinningValidator evaluateTrust:forHostname:]`

### 4.4 Alamofire 框架的 Pinning

Alamofire 是 Swift 生态中最流行的网络库，它提供了 ServerTrustManager 和 ServerTrustPolicy 来实现 pinning。

---

## 0x05 环境搭建：从零构建移动安全测试实验室

### 5.1 Android 测试环境

#### 必备工具清单

- 一台已解锁 Bootloader 并 Root 的 Android 设备（推荐 Pixel 系列或 OnePlus）
- Magisk（系统级 Root 方案）
- ADB（Android Debug Bridge）
- Frida + Frida-Tools
- Burp Suite 或 mitmproxy

#### Frida Server 部署步骤

```bash
# 检查设备架构
adb shell getprop ro.product.cpu.abi

# 下载对应架构的 Frida Server
wget https://github.com/frida/frida/releases/download/16.5.9/frida-server-16.5.9-android-arm64.xz
xz -d frida-server-16.5.9-android-arm64.xz

# 推送到设备
adb push frida-server-16.5.9-android-arm64 /data/local/tmp/frida-server
adb shell chmod 755 /data/local/tmp/frida-server

# 启动 Frida Server
adb shell su -c "/data/local/tmp/frida-server &"

# 验证连接
frida-ps -U
```

#### 代理配置

```bash
# 通过 iptables 将所有流量转发到 Burp Suite（透明代理模式）
adb shell su -c "iptables -t nat -A OUTPUT -p tcp --dport 80 -j REDIRECT --to-port 8080"
adb shell su -c "iptables -t nat -A OUTPUT -p tcp --dport 443 -j REDIRECT --to-port 8080"

# 如果应用不遵守系统代理，可以使用 ProxyDroid（需 Root）
# ProxyDroid 通过 iptables 强制转发所有 TCP 流量到指定代理
```

### 5.2 iOS 测试环境

#### 必备工具清单

- 一台已越狱的 iOS 设备（推荐 iPhone 6s~iPhone X，支持 checkra1n / Dopamine）
- Frida（通过 Cydia/Sileo 从 build.frida.re 源安装）
- OpenSSH + iproxy（USB 通道 SSH）
- Burp Suite 或 mitmproxy

#### Frida 安装与验证

```bash
# 在 Cydia 中添加源
# https://build.frida.re
# 搜索并安装 Frida

# 主机端安装
pip3 install frida-tools objection

# 验证连接（通过 USB）
frida-ps -U -ai

# USB 端口转发
iproxy 2222 22

# SSH 连接
ssh -p 2222 root@127.0.0.1
# 默认密码: alpine
```

#### iOS 代理配置

由于 iOS 不允许修改系统级代理设置，常见的做法是：
1. 在 Wi-Fi 设置中配置 HTTP 代理
2. 使用 VPN 方式（如 ProxyDroid for iOS 或 mitmproxy 的