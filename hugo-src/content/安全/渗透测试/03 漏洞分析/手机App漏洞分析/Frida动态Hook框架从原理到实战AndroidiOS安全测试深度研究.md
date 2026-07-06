---
title: "Frida 动态 Hook 框架从原理到实战：Android/iOS 安全测试深度研究"
date: 2026-07-06T20:00:00+08:00
draft: false
tags: ["Frida", "动态插桩", "Android安全", "iOS安全", "Hook", "Objection", "安全测试"]
categories: ["漏洞分析"]
---

# Frida 动态 Hook 框架从原理到实战：Android/iOS 安全测试深度研究

## 0x01 引言：为什么 Frida 是移动安全测试的核心工具

在移动应用安全评估中，静态分析让我们理解应用的代码逻辑和潜在漏洞，但真正验证漏洞的可利用性、提取敏感信息、绕过安全机制，离不开动态分析。而 Frida——这个由 Ole André Vadla Ravnås 创建的开源动态插桩框架——已经成为移动安全测试领域事实上的标准工具。

Frida 之所以如此重要，是因为它解决了移动安全测试中最核心的难题：**如何在应用运行时拦截、检查和修改其行为**。无论是绕过 SSL Pinning 截获加密流量，还是 Hook Root 检测函数绕过安全机制，或是提取运行时内存中的加密密钥，Frida 都提供了简洁而强大的 JavaScript API 来实现这些操作。

本篇文章将从 Frida 的架构原理出发，深入浅出地覆盖以下内容：

- Frida 的核心架构：frida-server vs frida-gadget、frida-tools 工具集、frida-core 内部机制
- JavaScript API 全面剖析：Java.perform、Interceptor、NativeFunction、Memory、Process、Module
- 脚本模式与最佳实践：方法重载、构造函数 Hook、字段修改、返回值操纵
- 常见安全测试脚本：SSL Pinning 绕过、Root 检测绕过、模拟器检测绕过、完整性校验绕过
- 高级特性：Stalker 指令级跟踪、CodeShare、Gadget 注入、Objection 框架
- iOS 平台使用：越狱/非越狱方案、Objective-C 运行时 Hook、iOS SSL Bypass
- 真实案例分析：微信 MMTLS 协议逆向、TLS 密钥提取、生物认证绕过
- 反 Frida 检测与绕过：端口检测、进程扫描、Inline Hook 检测、Java.perform 检测
- Frida vs Xposed/LSPosed 对比分析

---

## 0x02 Frida 架构深度分析

### 2.1 整体架构概览

Frida 是一个跨平台的动态 instrumentation 工具包，其核心架构由以下几个关键层次组成：

```
┌─────────────────────────────────────────────┐
│              frida-tools (CLI)               │
│  frida, frida-ps, frida-trace,              │
│  frida-ls-devices, frida-discover,          │
│  frida-kill, frida-apk                      │
├─────────────────────────────────────────────┤
│         Language Bindings (Python/Node)      │
├─────────────────────────────────────────────┤
│               frida-core                     │
│    (Session管理、脚本生命周期、IPC通信)         │
├─────────────────────────────────────────────┤
│               frida-gum                      │
│  (Instrumentation Engine: Interceptor,       │
│   Stalker, Memory, MemoryAccessMonitor)      │
├─────────────────────────────────────────────┤
│         frida-java-bridge / objc-bridge      │
│    (Java/Objective-C/Swift 运行时桥接)        │
└─────────────────────────────────────────────┘
```

**核心组件说明：**

| 组件 | 功能 |
|------|------|
| **frida-core** | 核心引擎，负责进程注入、IPC 通信、会话管理和脚本生命周期管理 |
| **frida-gum** | 底层 instrumentation 引擎，提供 Interceptor（内联 Hook）、Stalker（代码跟踪）、Memory 操作等 |
| **frida-java-bridge** | Java 运行时桥接，允许在 Android 上 Hook Java 方法、调用 Java API |
| **frida-objc-bridge** | Objective-C/Swift 运行时桥接，用于 iOS/macOS 平台 |
| **frida-tools** | 命令行工具集 |

### 2.2 frida-server vs frida-gadget

这是 Frida 最核心的两种部署模式选择：

#### frida-server（有 Root/越狱 环境）

```
主机 (Python/JS) ←──USB/网络──→ 目标设备 frida-server (daemon)
                                    │
                                    ├── ptrace attach → 注入 agent
                                    ├── pipe/unix socket 通信
                                    └── 需要 root/jailbreak
```

- 工作在 **Injected 模式**：通过 `ptrace` 附加到目标进程，注入 `frida-agent`
- 通信方式：通过 TCP（默认端口 27042）或 USB 隧道
- 优点：无需修改目标 APK/IPA，动态附加和分离灵活
- 缺点：需要 root/越狱权限

**部署命令：**
```bash
# 下载对应架构的 frida-server
wget https://github.com/frida/frida/releases/download/16.2.1/frida-server-16.2.1-android-arm64.xz
xz -d frida-server-16.2.1-android-arm64.xz

# 推送到设备
adb push frida-server-16.2.1-android-arm64 /data/local/tmp/frida-server
adb shell chmod 755 /data/local/tmp/frida-server

# 启动（建议重命名以规避检测）
adb shell su -c "/data/local/tmp/frida-server &"

# 验证连接
frida-ps -U
```

#### frida-gadget（无 Root/非越狱环境）

```
目标 APK
  ├── lib/arm64-v8a/libfrida-gadget.so  ←── 嵌入的 gadget
  ├── lib/arm64-v8a/libnative.so        ←── 修改 DT_NEEDED
  └── 应用启动时自动加载 gadget → 监听端口等待连接
```

- 工作在 **Embedded 模式**：将 Frida 作为共享库嵌入到 APK/IPA 中
- 通信方式：gadget 作为监听端，主机通过 TCP 连接
- 优点：无需 root，可以在任何 Android/iOS 设备上运行
- 缺点：需要重新打包和签名应用

**Frida Gadget 注入方法：**

方法一：通过 LIEF 注入到原生库（APK 包含 .so 文件时）
```python
import lief

# 解析目标原生库
libnative = lief.parse("target/lib/arm64-v8a/libnative.so")
# 添加 frida-gadget 作为依赖
libnative.add_library("libfrida-gadget.so")
libnative.write("target/lib/arm64-v8a/libnative.so")
```

方法二：通过 objection patchapk（推荐）
```bash
# 一行命令完成补丁
objection patchapk -s target.apk --network-security-config --enable-debug

# 安装补丁后的 APK
adb install -r target.objection.apk
```

### 2.3 frida-tools 命令行工具详解

**frida-ps - 进程列表工具：**
```bash
frida-ps -U                    # 列出 USB 设备上运行的所有进程
frida-ps -Uai                  # 列出已安装的应用（含包名）
frida-ps -R                    # 远程连接
frida-ps -D emulator-5554      # 指定设备
```

**frida-trace - 自动跟踪工具：**
```bash
# 跟踪所有以 "open" 开头的函数
frida-trace -U -i "open*" -f com.example.app

# 跟踪 libc.so 中的特定函数
frida-trace -U -I "libc.so" -f com.example.app

# 跟踪 Java 方法
frida-trace -U -j "com.example.app.MainClass*" -f com.example.app

# 生成处理脚本（会在 __handlers__ 目录下生成模板）
frida-trace -U -i "strcmp" -f com.example.app
```

`frida-trace` 会自动为每个被跟踪的函数在 `__handlers__/<libname>/<funcname>.js` 中生成 handler 模板，你可以在运行时修改这些 JS 文件，Frida 会自动重载。

**frida-ls-devices - 列出设备：**
```bash
$ frida-ls-devices
Id                     Type    Name
local                  local   Local System
emulator-5554          usb     Android Emulator
1234567890abcdef       usb     Real Android Device
```

### 2.4 frida-core 内部机制

frida-core 是 Frida 的核心基础设施，负责：

1. **进程注入**：通过 `ptrace`（Linux）或 `task_for_pid`（macOS）注入 agent
2. **IPC 传输层**：使用 `pipe`（本地）或 `TCP socket`（远程）通信
3. **会话管理**：`Session` 对象管理脚本的创建、加载、销毁
4. **脚本生命周期**：脚本的编译、注入、执行、回收

**关键通信协议：**
- 默认监听端口：`27042`（控制通道）
- 次要端口：`27043`（数据通道）
- 可通过 `-l 0.0.0.0:12345` 自定义端口

### 2.5 frida-java-bridge 工作原理

frida-java-bridge 是连接 JavaScript 和 Java 运行时的桥梁，其工作流程：

```
JS (Java.use) ─→ ClassFactory ─→ JNI env ─→ ART/Dalvik
                   │
                   ├── 反射获取类信息
                   ├── 生成 JavaScript Wrapper
                   ├── 通过 ART 的 JNI 函数表修改方法入口
                   └── 线程局部递归检测（避免无限循环）
```

**Java Bridge 的局限：**
- Windows 上的 JVM DebugSymbol 支持不完善
- 需要 JVM 编译时带有 debug symbols（如 Adoptium 版本）
- Java 8 的部分函数可能缺失导致 bridge 无法正常工作
- 推荐使用 Java 11+ 的 Adoptium/Temurin JDK

---

## 0x03 JavaScript API 深入剖析

### 3.1 Java API - Android Java 运行时交互

#### Java.perform() - 运行时入口

确保当前线程已附加到 Java VM，并在安全上下文中执行回调：

```javascript
// 标准用法
Java.perform(function() {
    console.log("已附加到 Java 运行时");
    // 在此执行所有 Java 相关操作
});

// 在 Interceptor 回调中需要使用 Java.performNow()（同步版本）
Interceptor.attach(targetAddr, {
    onEnter: function(args) {
        Java.performNow(function() {
            // 在这里使用 Java API
        });
    }
});
```

#### Java.use() - 获取类包装器

获取 Java 类的 JavaScript 包装器，返回的 `wrapper` 是一个函数对象：

```javascript
var String = Java.use("java.lang.String");
var OkHttpClient = Java.use("okhttp3.OkHttpClient");
var ActivityThread = Java.use("android.app.ActivityThread");

// 调用静态方法
var currentApp = ActivityThread.currentApplication();
var ctx = currentApp.getApplicationContext();

// 调用实例方法（需先创建实例）
var str = String.$new("Hello Frida");
console.log(str.toString());
```

#### Java.choose() - 在堆中搜索活动实例

在 Java 堆中搜索指定类的已实例化对象，对每个找到的对象执行回调：

```javascript
Java.choose("com.example.app.CryptoManager", {
    onMatch: function(instance) {
        console.log("找到 CryptoManager 实例:", instance);
        // 直接操作该实例
        var key = instance.getSecretKey();
        console.log("密钥:", key);
    },
    onComplete: function() {
        console.log("搜索完成");
    }
});
```

### 3.2 Interceptor API - 函数拦截核心

#### Interceptor.attach() - 附加拦截器

```javascript
Interceptor.attach(targetAddress, {
    onEnter: function(args) {
        // 函数被调用时执行
        // args - 参数数组（NativePointer 对象）
        console.log("参数:", args[0], args[1]);
        
        // 可通过 this 对象在 onEnter/onLeave 间传递数据
        this.startTime = Date.now();
    },
    onLeave: function(retval) {
        // 函数即将返回时执行
        // retval - 返回值（可修改）
        var elapsed = Date.now() - this.startTime;
        console.log("执行耗时:", elapsed, "ms");
        
        // 修改返回值
        retval.replace(0);  // 将返回值替换为 0
    }
});
```

**关键能力：**
- 在 `onEnter` 中检查和修改函数参数
- 在 `onLeave` 中检查和修改返回值
- 通过 `this` 上下文在回调间传递数据
- 可获取堆栈回溯：`Thread.backtrace(this.context, Backtracer.ACCURATE)`

#### Interceptor.replace() - 完全替换函数

用自定义实现完全替换目标函数：

```javascript
// 替换 C 函数
var openPtr = Module.findExportByName("libc.so", "open");
var openCallback = new NativeCallback(function(pathPtr, flags) {
    var path = Memory.readUtf8String(pathPtr);
    console.log("open() 被调用:", path);
    
    if (path.includes("sensitive_file")) {
        console.log("阻止访问敏感文件");
        return -1;
    }
    
    // 调用原始函数
    var openImpl = new NativeFunction(openPtr, "int", ["pointer", "int"]);
    return openImpl(pathPtr, flags);
}, "int", ["pointer", "int"]);

Interceptor.replace(openPtr, openCallback);
```

### 3.3 Memory API - 内存操作

```javascript
// 读取不同类型的数据
var addr = ptr("0x12345678");
addr.readPointer();          // 读取指针
addr.readS8();               // 读取有符号 8 位
addr.readU32();              // 读取无符号 32 位
addr.readByteArray(16);      // 读取字节数组
addr.readUtf8String();       // 读取 UTF-8 字符串

// hexdump 展示内存
console.log(hexdump(addr, {
    offset: 0,
    length: 64,
    header: true,
    ansi: true
}));

// 写入内存
addr.writePointer(ptr("0x87654321"));
addr.writeS32(42);
addr.writeByteArray([0x48, 0x65, 0x6C]);
addr.writeUtf8String("Hello Frida");

// 内存分配
var buf = Memory.alloc(1024);
var str = Memory.allocUtf8String("test");

// 内存扫描
var results = Memory.scanSync(binBase, binSize, "46 52 49 44 41 20 ?? ?? ?? ?? ?? 21");
results.forEach(function(match) {
    console.log("匹配地址:", match.address, "大小:", match.size);
});
```

### 3.4 Process API - 进程信息

```javascript
// 基本进程信息
Process.id;                     // 进程 PID
Process.arch;                   // 架构: "arm64", "ia32" 等
Process.platform;               // 平台: "linux", "darwin" 等
Process.pointerSize;            // 指针大小: 4 或 8

// 枚举模块
var modules = Process.enumerateModules();
modules.forEach(function(m) {
    console.log(m.name, m.base, m.size, m.path);
});

// 设置异常处理
Process.setExceptionHandler(function(details) {
    console.log("异常:", details.message);
    console.log("地址:", details.address);
    console.log("类型:", details.type);
    return true;
});
```

### 3.5 Module API - 模块操作

```javascript
// 通过名称获取模块
var libc = Process.getModuleByName("libc.so");
console.log("libc 基址:", libc.base, "大小:", libc.size);

// 获取导出函数地址
var openAddr = Module.findExportByName("libc.so", "open");

// 枚举导出
var exports = libc.enumerateExports();
exports.forEach(function(e) {
    if (e.type === "function" && e.name.indexOf("encrypt") !== -1) {
        console.log("找到加密函数:", e.name, "at", e.address);
    }
});

// 枚举内存范围
var ranges = libc.enumerateRanges("r--");

// 通过地址查找模块
var module = Module.findBaseAddress("libc.so");
```

---

## 0x04 Frida 脚本模式与最佳实践

### 4.1 Java 方法重载处理

Java 支持方法重载（同名不同参数），Frida 通过 `.overload()` 方法精确指定要 Hook 的重载版本：

```javascript
var TargetClass = Java.use("com.example.TargetClass");

// 无参数重载
TargetClass.method.overload().implementation = function() {
    console.log("无参 method 被调用");
    return this.method();
};

// 带整数参数的重载
TargetClass.method.overload("int").implementation = function(x) {
    console.log("method(int) 被调用:", x);
    return this.method(x);
};

// 带字符串参数的重载
TargetClass.method.overload("java.lang.String").implementation = function(s) {
    console.log("method(String) 被调用:", s);
    var result = this.method(s);
    console.log("返回值:", result);
    return result;
};

// 枚举所有重载
var overloads = TargetClass.method.overloads;
console.log("重载数量:", overloads.length);
```

**最佳实践：** 如果不知道方法签名，可以先运行应用触发方法调用，观察日志中的错误信息，Frida 会提示可用的重载签名。

### 4.2 构造函数 Hook

Java 构造函数在 Frida 中用特殊的 `$init` 表示：

```javascript
var MyClass = Java.use("com.example.MyClass");

// Hook 无参构造函数
MyClass.$init.overload().implementation = function() {
    console.log("MyClass() 构造函数被调用");
    this.$init();  // 必须调用原始构造函数
    
    // 之后可以修改字段
    this.fieldName.value = "修改后的值";
};

// Hook 带参构造函数
MyClass.$init.overload("java.lang.String", "int").implementation = function(str, num) {
    console.log("MyClass(String, int) 构造函数, 参数:", str, num);
    this.$init(str, num);
    
    // 修改字段
    this.secretKey.value = "bypassed_key";
};
```

**重要注意点：**
- `$init` 的含义是"初始化"，实例在进入 `$init` 前已经被分配
- `$new` 用于在 JS 中**创建**新实例，而不是 Hook 构造函数
- 必须调用 `this.$init()` 来执行原始初始化逻辑
- 构造函数没有返回值，因此不要尝试修改 `retval`

### 4.3 字段修改

```javascript
var TargetClass = Java.use("com.example.TargetClass");

// Hook 方法并修改实例字段
TargetClass.someMethod.implementation = function() {
    console.log("字段 secret 的当前值:", this.secretKey.value);
    
    // 修改字段值
    this.secretKey.value = "new_secret";
    this.isAuthenticated.value = true;
    this.counter.value = 999;
    
    return this.someMethod();
};

// 修改静态字段
var StaticField = Java.use("com.example.Config");
StaticField.API_ENDPOINT.value = "http://attacker.com/";
StaticField.DEBUG_MODE.value = true;
```

### 4.4 返回值操纵

```javascript
// 方法一：修改 retval
TargetClass.checkPassword.implementation = function(password) {
    var result = this.checkPassword(password);
    console.log("密码验证结果:", result);
    return true;  // 始终返回 true（绕过验证）
};

// 方法二：使用 retval.replace（Interceptor 模式）
Interceptor.attach(targetAddr, {
    onLeave: function(retval) {
        console.log("原始返回值:", retval);
        retval.replace(ptr(1));  // 替换为 1（true）
    }
});

// 方法三：完全绕过原方法
TargetClass.verifyPayment.implementation = function() {
    console.log("绕过支付验证");
    return true;  // 直接返回成功
};
```

### 4.5 自动 Hook 所有方法

```javascript
function traceClass(className) {
    var hook = Java.use(className);
    var methods = hook.class.getDeclaredMethods();
    
    methods.forEach(function(method) {
        var methodName = method.getName();
        var overloads = hook[methodName].overloads;
        
        overloads.forEach(function(overload) {
            overload.implementation = function() {
                console.log(`[${className}] ${methodName} 被调用`);
                
                // 打印参数
                for (var i = 0; i < arguments.length; i++) {
                    console.log(`  参数${i}: ${arguments[i]}`);
                }
                
                // 获取结果
                var retval = this[methodName].apply(this, arguments);
                console.log(`  返回值: ${retval}`);
                return retval;
            };
        });
    });
}

// 自动跟踪整个类
traceClass("com.example.app.CryptoHelper");
```

---

## 0x05 常见安全测试脚本

### 5.1 SSL Pinning 绕过

SSL Pinning（证书绑定）是最常见的安全机制，Frida 可以通过多种方式绕过：

#### 方案一：Hook TrustManager（最通用方案）

```javascript
// 通用 SSL Pinning 绕过 - 适用于 OkHttp、Retrofit 等
Java.perform(function() {
    // 方法 1: 替换 TrustManager
    var TrustManagerImpl = Java.use("com.android.org.conscrypt.TrustManagerImpl");
    
    TrustManagerImpl.verifyChain.implementation = function(chain, authType, host, clientAuth, ocspData, tlsSctData) {
        console.log("TrustManagerImpl.verifyChain bypassed for:", host);
        return chain;  // 直接返回原始链，不验证
    };
    
    TrustManagerImpl.checkTrustedRecursive.implementation = function() {
        console.log("TrustManagerImpl.checkTrustedRecursive bypassed");
        return null;  // 跳过验证
    };
    
    // 方法 2: 替换 SSLContext.init
    var SSLContext = Java.use("javax.net.ssl.SSLContext");
    SSLContext.init.overload("[Ljavax.net.ssl.KeyManager;", "[Ljavax.net.ssl.TrustManager;", "java.security.SecureRandom").implementation = function(keyManagers, trustManagers, secureRandom) {
        console.log("SSLContext.init intercepted");
        
        var TrustManager = Java.use("javax.net.ssl.X509TrustManager");
        
        var customTrustManager = Java.registerClass({
            name: "com.example.CustomTrustManager",
            implements: [TrustManager],
            methods: {
                checkClientTrusted: function(chain, authType) {},
                checkServerTrusted: function(chain, authType) {},
                getAcceptedIssuers: function() { return []; }
            }
        });
        
        this.init(keyManagers, [customTrustManager.$new()], secureRandom);
    };
});
```

#### 方案二：Hook OkHttp 的 CertificatePinner

```javascript
// 针对 OkHttp 的 CertificatePinner
Java.perform(function() {
    var CertificatePinner = Java.use("okhttp3.CertificatePinner");
    
    CertificatePinner.check.overload("java.lang.String", "java.util.List").implementation = function(hostname, peerCertificates) {
        console.log("CertificatePinner.check bypassed for:", hostname);
        return;  // 不抛出异常
    };
    
    CertificatePinner.pin.implementation = function(peerCertificates) {
        console.log("CertificatePinner.pin bypassed");
        return;  // 跳过 pin 检查
    };
});
```

### 5.2 Root 检测绕过

```javascript
Java.perform(function() {
    // 绕过 File.exists 检测 root 文件
    var File = Java.use("java.io.File");
    File.exists.implementation = function() {
        var path = this.getAbsolutePath();
        var rootPaths = [
            "/sbin/su", "/system/bin/su", "/system/xbin/su",
            "/data/local/xbin/su", "/data/local/bin/su",
            "/system/sd/xbin/su", "/system/bin/failsafe/su",
            "/data/local/su", "/su/bin/su"
        ];
        
        if (rootPaths.indexOf(path) !== -1) {
            console.log("Root 检测绕过:", path);
            return false;
        }
        return this.exists();
    };
    
    // 绕过 Runtime.exec 执行 su 检查
    var Runtime = Java.use("java.lang.Runtime");
    Runtime.exec.overload("[Ljava.lang.String;").implementation = function(cmdArray) {
        var cmd = cmdArray.join(" ");
        if (cmd.indexOf("su") !== -1 || cmd.indexOf("busybox") !== -1) {
            console.log("Root 命令拦截:", cmd);
            return null;
        }
        return this.exec(cmdArray);
    };
    
    // 绕过 Build.TAGS 检测（test-keys）
    var Build = Java.use("android.os.Build");
    Build.TAGS.value = "release-keys";
    
    // 绕过 PackageManager 检测 root 应用
    var PackageManager = Java.use("android.app.ApplicationPackageManager");
    PackageManager.getPackageInfo.overload("java.lang.String", "int").implementation = function(packageName, flags) {
        var suspicious = ["eu.chainfire.supersu", "com.topjohnwu.magisk",
                         "com.noshufou.android.su", "com.thirdparty.superuser"];
        if (suspicious.indexOf(packageName) !== -1) {
            throw new Error("Package not found: " + packageName);
        }
        return this.getPackageInfo(packageName, flags);
    };
});
```

### 5.3 模拟器检测绕过

```javascript
Java.perform(function() {
    // 伪装 Build 属性
    var Build = Java.use("android.os.Build");
    Build.DEVICE.value = "sailfish";
    Build.MODEL.value = "Pixel XL";
    Build.MANUFACTURER.value = "Google";
    Build.BRAND.value = "google";
    Build.HARDWARE.value = "sailfish";
    Build.PRODUCT.value = "sailfish";
    Build.FINGERPRINT.value = "google/sailfish/sailfish:10/QP1A.190711.020/5745566:user/release-keys";
    
    // 绕过电话信息检测
    var TelephonyManager = Java.use("android.telephony.TelephonyManager");
    TelephonyManager.getDeviceId.implementation = function() {
        return "358240051111110";
    };
    TelephonyManager.getSimOperatorName.implementation = function() {
        return "China Mobile";
    };
    TelephonyManager.getNetworkOperatorName.implementation = function() {
        return "China Mobile";
    };
    TelephonyManager.getLine1Number.implementation = function() {
        return "+8613800138000";
    };
    
    // 绕过 Settings.Secure 检测
    var SettingsSecure = Java.use("android.provider.Settings$Secure");
    SettingsSecure.getString.implementation = function(contentResolver, name) {
        if (name === "android_id") {
            return "dead000beef";
        }
        return this.getString(contentResolver, name);
    };
});
```

### 5.4 调试器检测绕过

```javascript
Java.perform(function() {
    // 绕过 isDebuggerConnected
    var Debug = Java.use("android.os.Debug");
    Debug.isDebuggerConnected.implementation = function() {
        return false;
    };
    
    // 绕过等待调试器
    Debug.waitForDebugger.implementation = function() {
        return;
    };
    
    // 绕过 TimerTask 定时检测
    var Timer = Java.use("java.util.Timer");
    Timer.schedule.overload("java.util.TimerTask", "long").implementation = function(task, delay) {
        console.log("TimerTask 被拦截:", delay + "ms");
    };
});
```

---

## 0x06 Frida 高级特性

### 6.1 Frida Stalker - 指令级代码跟踪

Stalker 是 Frida 最强大的功能之一——一个基于**动态代码重编译**的代码跟踪引擎。

#### 与传统调试跟踪的对比

| 技术 | 机制 | 性能损耗 |
|------|------|---------|
| 传统断点 (ptrace) | 内核模式中断 → 用户模式回调 | 极高（上下文切换） |
| Stalker | 动态代码重编译 + 缓存 | 低（仅在首次编译时有开销） |

#### 基本原理

Stalker 将原始机器码重编译为经过 instrumentation 的新代码块，这些代码块被缓存在内存中。当目标线程执行时，实际上执行的是经过插桩的重编译代码。

```
原始代码流：
  [block A] → [block B] → [block C] → ...

Stalker 处理后的代码流：
  [instr. block A] → [instr. block B] → [instr. block C] → ...
  每次执行前会被缓存（trust threshold）
```

#### JavaScript API 用法

```javascript
// 基本用法 - 跟踪当前线程
Stalker.follow(threadId, {
    events: {
        call: true,     // 跟踪 CALL 指令
        ret: false,     // 跟踪 RET 指令
        exec: false,    // 跟踪所有指令（性能警告）
        block: false,   // 跟踪基本块执行
        compile: false  // 跟踪编译事件
    },
    onReceive: function(events) {
        var count = events.length;
        for (var i = 0; i < count; i++) {
            var eventType = events[i].type;
            var address = events[i].address;
        }
    },
    onCallSummary: function(summary) {
        for (var address in summary) {
            var count = summary[address];
            console.log("调用了", address, count, "次");
        }
    }
});

// 停止跟踪
Stalker.unfollow(threadId);
Stalker.garbageCollect();
```

#### Stalker 高级用法 - Transformer 回调

```javascript
// 使用 transform 回调实时修改代码
Stalker.follow(threadId, {
    transform: function(iterator) {
        var instruction = iterator.next();
        do {
            if (instruction.mnemonic === 'svc') {
                console.log("发现系统调用指令:", instruction.address);
                iterator.putCallout(function(context) {
                    console.log("SVC 执行:", context);
                });
            }
            
            if (instruction.address.equals(targetAddr)) {
                iterator.skip();
            } else {
                iterator.keep();
            }
            
            instruction = iterator.next();
        } while (instruction !== null);
    }
});
```

### 6.2 Frida CodeShare

Frida CodeShare 是一个社区驱动的脚本分享平台（`codeshare.frida.re`），允许安全研究人员共享和复用 Frida 脚本。

**使用方式：**
```bash
# 直接运行 CodeShare 上的脚本
frida --codeshare Q0120S/universal-root-detection-and-ssl-pinning-bypass -f com.example.app

# 在 REPL 中加载
frida -U -f com.example.app
# 然后在控制台中:
%load codeshare Q0120S/universal-root-detection-and-ssl-pinning-bypass
```

**推荐 CodeShare 脚本：**
- `Q0120S/universal-root-detection-and-ssl-pinning-bypass` - 通用 Root + SSL 绕过
- `pcipolloni/universal-android-ssl-pinning-bypass-with-frida` - SSL Pinning 绕过
- `dzonerzy/fridaandroidscript` - 多功能 Android Hook 工具集
- `liangxiaoyi1024/ios-jailbreak-detection-bypass` - iOS 越狱检测绕过

### 6.3 Frida-Gadget 注入 APK 的完整流程

以下是手动向 APK 注入 Frida-Gadget 的完整步骤：

```bash
# 步骤 1: 下载 frida-gadget
wget https://github.com/frida/frida/releases/download/16.2.1/frida-gadget-16.2.1-android-arm64.so.xz
xz -d frida-gadget-16.2.1-android-arm64.so.xz

# 步骤 2: 反编译 APK
apktool d -rs target.apk -o target_dir

# 步骤 3: 复制 gadget 到 lib 目录
cp frida-gadget-16.2.1-android-arm64.so target_dir/lib/arm64-v8a/libfrida-gadget.so

# 步骤 4: 使用 LIEF 注入 DT_NEEDED（如果 APK 有原生库）
cat > inject.py << 'EOF'
import lief
lib = lief.parse("target_dir/lib/arm64-v8a/libnative.so")
lib.add_library("libfrida-gadget.so")
lib.write("target_dir/lib/arm64-v8a/libnative.so")
EOF
python3 inject.py

# 步骤 5: 创建 Gadget 配置文件
cat > target_dir/lib/arm64-v8a/libfrida-gadget.config << 'EOF'
{
  "interaction": {
    "type": "listen",
    "address": "127.0.0.1:27042"
  }
}
EOF

# 步骤 6: 重新打包
apktool b target_dir -o target-patched.apk

# 步骤 7: 生成签名密钥并对齐签名
keytool -genkey -v -keystore my.keystore -alias mykey -keyalg RSA -keysize 2048 -validity 10000
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -keystore my.keystore target-patched.apk mykey
zipalign -p -f 4 target-patched.apk target-final.apk

# 步骤 8: 安装
adb install target-final.apk

# 步骤 9: 连接
frida -U Gadget -l script.js
```

---

## 0x07 Objection 框架

Objection 是 SensePost 开发的基于 Frida 的运行时移动探索工具包，将常用的 Frida 功能封装为易于使用的 CLI 命令。

### 7.1 安装与基本使用

```bash
pip3 install objection

# 连接到运行中的应用
objection -g com.example.app explore

# 或使用包名自动 spawn
objection -g com.example.app explore --startup-command "android sslpinning disable"
```

### 7.2 patchapk - APK 补丁

Objection 最强大的功能之一——一键将 Frida-Gadget 注入 APK：

```bash
# 基本用法
objection patchapk -s target.apk

# 常用参数组合
objection patchapk -s target.apk \
    --network-security-config \    # 启用网络安全配置
    --enable-debug \               # 启用调试模式
    --use-aapt2 \                  # 使用 aapt2
    -a arm64                       # 指定架构

# 安装补丁后的 APK
adb install -r target.objection.apk

# 启动并连接
objection -n Gadget explore
```

### 7.3 explore 模式命令

**Android 环境命令：**
```
android keystore list                      # 列出 KeyStore 中的密钥
android root disable                       # 绕过 Root 检测
android sslpinning disable                 # 绕过 SSL Pinning
android hooking list classes               # 列出已加载的类
android hooking list class_methods <class>  # 列出类的方法
android hooking watch class <class>         # 跟踪类的所有方法
android ui screenshot                       # 截屏
android ui FLAG_SECURE disable              # 绕过屏幕截图保护
android sharedpreferences load              # 加载 SharedPreferences
```

**iOS 环境命令：**
```
ios jailbreak disable                  # 绕过越狱检测
ios sslpinning disable                 # 绕过 SSL Pinning
ios info plist                         # 查看 Info.plist
ios hooking list classes               # 列出类
ios hooking watch class <class>        # 跟踪类方法
ios keychain dump                      # 导出 Keychain 内容
ios nsuserdefaults load                # 加载 UserDefaults
```

### 7.4 内存搜索与操作

```bash
# 搜索内存中的字符串
android memory search "password"
android memory search "api_key" --string

# 转储内存区域
android memory dump <base_address> <output_file>
```

### 7.5 文件系统操作

```bash
# 列出文件
ls /data/data/com.example.app/

# 下载文件
file download /data/data/com.example.app/databases/app.db

# 上传文件
file upload ./payload.dex /data/local/tmp/
```

### 7.6 Objection vs 原生 Frida 的工作流对比

| 任务 | 原生 Frida | Objection |
|------|-----------|-----------|
| SSL Pinning 绕过 | 编写 20-50 行 JS 脚本 | `android sslpinning disable` |
| 列出所有类 | 需要 `Java.enumerateLoadedClasses` | `android hooking list classes` |
| 跟踪类方法 | 需要遍历所有方法并设置 hook | `android hooking watch class <class>` |
| 非 Root 设备使用 | 手动注入 Gadget | `patchapk` 一键完成 |
| 内存搜索 | 编写 Memory.scan 逻辑 | `android memory search` |
| 自定义需求 | 完全灵活 | 受限于命令集 |
| 易用性 | 需要 JS 编程经验 | 开箱即用 |

---

## 0x08 Frida for iOS

### 8.1 iOS 环境搭建

#### 越狱设备方案

通过 Cydia 安装 frida-server：

```bash
# 在 Cydia 中添加源: https://build.frida.re
# 搜索并安装 Frida

# 或直接使用 deb
wget https://build.frida.re/frida/debs/frida_16.2.1_iphoneos-arm64.deb
dpkg -i frida_16.2.1_iphoneos-arm64.deb

# 启动 frida-server
frida-server &

# 验证
frida-ps -U
```

#### 非越狱设备方案

使用 Frida-Gadget 注入 IPA：

```bash
# 使用 objection 自动注入
objection patchipa -s target.ipa --signing-identity "iPhone Developer: XXXXXXX"

# 使用 ios-deploy 安装
ios-deploy -b target.objection.ipa
```

### 8.2 Objective-C 运行时 Hook

```javascript
if (ObjC.available) {
    console.log("Objective-C 运行时可用");
    
    // 获取类列表
    for (var className in ObjC.classes) {
        if (className.toLowerCase().indexOf("jailbreak") !== -1) {
            console.log("找到相关类:", className);
        }
    }
    
    // 选择特定类
    var hook = ObjC.classes.ViewController;
    
    // Hook 实例方法
    var method = hook["- isJailbroken"];
    if (method) {
        Interceptor.attach(method.implementation, {
            onEnter: function(args) {
                console.log("isJailbroken 被调用");
            },
            onLeave: function(retval) {
                console.log("原始返回值:", retval);
                retval.replace(0);  // 返回 NO
            }
        });
    }
    
    // Hook 类方法
    var clsMethod = hook["+ sharedInstance"];
    Interceptor.attach(clsMethod.implementation, {
        onLeave: function(retval) {
            console.log("sharedInstance 返回:", retval);
        }
    });
    
    // 调用 Objective-C 方法
    var NSFileManager = ObjC.classes.NSFileManager;
    var fm = NSFileManager.defaultManager();
    var files = fm.contentsOfDirectoryAtPath_error_("/var/mobile", NULL);
    console.log("目录内容:", files);
}
```

### 8.3 iOS 越狱检测绕过

```javascript
if (ObjC.available) {
    var NSFileManager = ObjC.classes.NSFileManager;
    var fm = NSFileManager.defaultManager();
    
    var jailbreakFiles = [
        "/Applications/Cydia.app",
        "/bin/bash",
        "/etc/apt",
        "/usr/sbin/frida-server",
        "/var/lib/cydia"
    ];
    
    // Hook fileExistsAtPath
    var origImpl = fm["- fileExistsAtPath:"].implementation;
    Interceptor.attach(origImpl, {
        onEnter: function(args) {
            var path = ObjC.Object(args[2]);
            if (path !== null) {
                var pathStr = path.toString();
                if (jailbreakFiles.indexOf(pathStr) !== -1) {
                    console.log("越狱文件检测:", pathStr);
                    this.shouldBypass = true;
                }
            }
        },
        onLeave: function(retval) {
            if (this.shouldBypass) {
                retval.replace(0);
            }
        }
    });
    
    // Hook stat64 系统调用
    var stat64 = Module.findExportByName("libSystem.B.dylib", "stat64");
    Interceptor.attach(stat64, {
        onEnter: function(args) {
            var path = Memory.readUtf8String(args[0]);
            if (jailbreakFiles.indexOf(path) !== -1) {
                console.log("stat64 拦截:", path);
                this.bypass = true;
            }
        },
        onLeave: function(retval) {
            if (this.bypass) {
                retval.replace(-1);
            }
        }
    });
}
```

### 8.4 iOS SSL Pinning 绕过

```javascript
if (ObjC.available) {
    // Hook URLSession:didReceiveChallenge
    var hook = ObjC.classes.ViewController;
    var method = hook["- URLSession:didReceiveChallenge:completionHandler:"];
    if (method) {
        Interceptor.attach(method.implementation, {
            onEnter: function(args) {
                var block = new ObjC.Block(args[4]);
                block.implementation = function(disposition, credential) {
                    block.original(0, null);
                };
                console.log("URLSession challenge bypassed");
            }
        });
    }
    
    // Hook AFNetworking
    var AFSecurityPolicy = ObjC.classes.AFSecurityPolicy;
    if (AFSecurityPolicy) {
        var validateMethod = AFSecurityPolicy["- validateServerTrust:forDomain:"];
        Interceptor.attach(validateMethod.implementation, {
            onLeave: function(retval) {
                retval.replace(1);
            }
        });
    }
}
```

---

## 0x09 真实世界案例分析

### 9.1 微信 MMTLS 协议逆向

Citizen Lab 在 2023-2024 年发布的微信安全分析报告中，Frida 起到了核心作用。

**背景：** 微信使用自定义的 MMTLS（MicroMessenger TLS）加密协议，这是一种基于 TLS 1.3 草案修改的自定义协议。标准的 MITM 代理无法捕获其加密流量。

**Frida 的关键应用：**

```javascript
// 1. 定位加密入口点
Java.perform(function() {
    var MMTLSHandler = Java.use("com.tencent.mm.protocal.MMTLSHandler");
    
    MMTLSHandler.handleHandshakeMessage.implementation = function(msg) {
        console.log("MMTLS 握手消息:", msg);
        return this.handleHandshakeMessage(msg);
    };
    
    // 2. 在加密前拦截明文数据
    var MMTLSEncoder = Java.use("com.tencent.mm.protocal.MMTLSEncoder");
    MMTLSEncoder.encode.implementation = function(data, key) {
        console.log("MMTLS 编码前数据:", bytesToHex(data));
        return this.encode(data, key);
    };
});
```

**Frida 脚本释放的开源工具：**
Citizen Lab 开源了用于解密微信流量的 Frida 工具集（GitHub: citizenlab/wechat-security-report），包括 Key logging 脚本和流量解密工具。

### 9.2 提取 TLS 密钥并解密网络流量

```javascript
// 使用 Frida hook BoringSSL 的 SSL_read/SSL_write
function hookSSL() {
    // Hook SSL_read 获取明文
    var SSL_read = Module.findExportByName("libssl.so", "SSL_read");
    Interceptor.attach(SSL_read, {
        onLeave: function(retval) {
            var bytesRead = retval.toInt32();
            if (bytesRead > 0) {
                var data = this.context.r1;  // ARM64 参数寄存器
                console.log("SSL_read 明文:", hexdump(data, {length: bytesRead}));
            }
        }
    });
    
    // Hook SSL_write 获取明文
    var SSL_write = Module.findExportByName("libssl.so", "SSL_write");
    Interceptor.attach(SSL_write, {
        onEnter: function(args) {
            var dataPtr = args[1];
            var dataLen = args[2].toInt32();
            console.log("SSL_write 明文:", hexdump(dataPtr, {length: dataLen}));
        }
    });
}
```

**使用 friTap 自动化 TLS 解密：**
friTap 是一个基于 Frida 的工具，可自动 hook 多种 SSL/TLS 库：

```bash
# 安装
pip3 install fritap

# 使用 friTap 自动解密
fritap -m rw -f com.example.app -k sslkeylog.txt

# 将生成的 sslkeylog.txt 导入 Wireshark
# Edit → Preferences → TLS → (Pre)-Master-Secret log filename
```

### 9.3 绕过生物识别认证

```javascript
Java.perform(function() {
    // 绕过指纹认证
    var BiometricManager = Java.use("android.hardware.biometrics.BiometricManager");
    BiometricManager.canAuthenticate.implementation = function() {
        return 0;  // BIOMETRIC_SUCCESS
    };
    
    // 绕过指纹对话框（直接返回成功）
    var BiometricPrompt = Java.use("android.hardware.biometrics.BiometricPrompt");
    BiometricPrompt.authenticate.overload(
        "android.hardware.biometrics.BiometricPrompt$CryptoObject",
        "android.os.CancellationSignal",
        "java.util.concurrent.Executor",
        "android.hardware.biometrics.BiometricPrompt$AuthenticationCallback"
    ).implementation = function(crypto, cancel, executor, callback) {
        console.log("绕过 BiometricPrompt.authenticate");
        callback.onAuthenticationSucceeded(
            Java.use("android.hardware.biometrics.BiometricPrompt$AuthenticationResult").$new()
        );
    };
    
    // 绕过设备锁屏认证
    var KeyguardManager = Java.use("android.app.KeyguardManager");
    KeyguardManager.isKeyguardSecure.implementation = function() {
        return false;
    };
    KeyguardManager.isDeviceLocked.implementation = function() {
        return false;
    };
    KeyguardManager.isDeviceSecure.implementation = function() {
        return false;
    };
});
```

---

## 0x0A 反 Frida 检测与绕过技术

### 10.1 Frida 检测方法分类

| 检测类型 | 检测方式 | 绕过难度 |
|---------|---------|---------|
| 端口检测 | 检查 27042/27043 端口占用 | 低 |
| 进程/文件检测 | 扫描 frida-server 进程名、frida-agent 文件 | 低 |
| 内存扫描 | 搜索内存中的 frida 相关字符串 | 中 |
| D-Bus 协议检测 | 尝试连接 D-Bus 会话 | 中 |
| 函数 Hook 检测 | 检查函数前缀的跳转指令 | 高 |
| 线程检测 | 枚举线程栈中的 Frida 特征 | 高 |
| 行为分析 | 检测 ptrace、性能异常 | 高 |

### 10.2 端口检测与绕过

**检测代码示例（C++）：**
```cpp
extern "C" JNIEXPORT void JNICALL
Java_com_example_app_AntiFrida_checkPorts(JNIEnv* env, jobject) {
    std::ifstream netstat("/proc/net/tcp");
    std::string line;
    while (std::getline(netstat, line)) {
        if (line.find("0100007F:A269") != std::string::npos) {
            exit(0);
        }
    }
}
```

**绕过方法：**
```bash
# 修改 frida-server 的默认端口
adb shell /data/local/tmp/fs_helper -l 0.0.0.0:27044 &

# 同时将主机端口转发到新的端口
adb forward tcp:27044 tcp:27042

# 使用更具迷惑性的文件名
adb mv /data/local/tmp/frida-server /data/local/tmp/.surfaceflinger
```

**或者 hook connect 系统调用绕过端口检测：**
```javascript
var connectPtr = Module.findExportByName("libc.so", "connect");
Interceptor.attach(connectPtr, {
    onEnter: function(args) {
        var sockAddr = args[1];
        if (sockAddr !== null) {
            var family = sockAddr.readU16();
            if (family === 2) {
                var port = (sockAddr.readU8(2) << 8) | sockAddr.readU8(3);
                var ip = sockAddr.readU32(4);
                if (port === 27042 || port === 27043) {
                    console.log("端口检测绕过:", port);
                    sockAddr.writeU16(2, 0xFFFF);
                }
            }
        }
    }
});
```

### 10.3 进程/文件扫描与绕过

**绕过方法：**
```javascript
Java.perform(function() {
    var BufferedReader = Java.use("java.io.BufferedReader");
    var FileInputStream = Java.use("java.io.FileInputStream");
    
    // Hook FileInputStream 读取 /proc/self/maps
    FileInputStream.$init.overload("java.io.File").implementation = function(file) {
        var path = file.getAbsolutePath();
        if (path.indexOf("maps") !== -1 || path.indexOf("status") !== -1) {
            console.log("进程信息读取:", path);
        }
        return this.$init(file);
    };
    
    // 可以进一步 hook readLine 来过滤 frida 关键字
    BufferedReader.readLine.implementation = function() {
        var line = this.readLine();
        if (line !== null && line.indexOf("frida") !== -1) {
            console.log("过滤 Frida 痕迹:", line);
            return this.readLine();
        }
        return line;
    };
});
```

### 10.4 反检测绕过的最佳实践

1. **重命名 frida-server**：改为系统服务名如 `adbd`、`servicemanager`
2. **修改默认端口**：使用 `-l` 参数绑定到非标准端口
3. **使用 Unix socket 通信**：在 frida-gadget 配置中使用 `unix:talk`
4. **隐藏特征内存**：使用 Frida 的 `--runtime=v8` 减少 GLib 特征
5. **分阶段注入**：先注入简单脚本绕过检测，再进行主要操作
6. **使用定制编译的 Frida**：从源码编译，修改特征字符串

---

## 0x0B Frida 替代方案对比分析

### 11.1 Xposed / LSPosed 框架

**Xposed（传统方案）：**
- 原理：替换 Android 的 Zygote 进程，在应用启动前注入代码
- 只能在 Java 层 Hook（无法 Hook 原生代码）
- 需要刷入系统分区（修改 boot.img）
- 修改后需要重启生效
- 仅支持 Android 8.x 及以下

**LSPosed（现代方案）：**
- 原理：作为 Magisk 模块运行，利用 Riru/Zygisk 机制注入
- 无系统分区修改（systemless）
- 支持 Android 8 ~ 14
- 基于 LSPlant 的 ART Hook 框架
- 支持模块按应用隔离

### 11.2 Frida vs Xposed/LSPosed 深度对比

| 维度 | Frida | Xposed / LSPosed |
|------|-------|-----------------|
| 安装复杂度 | 低 - 只需推送一个二进制文件 | 高 - 需要刷入模块/系统修改 |
| 是否需要重启 | 不需要 | 需要 |
| Hook 生效时机 | 运行时动态附加或 spawn | 应用进程创建时自动注入 |
| Java Hook | 支持 | 支持 |
| 原生代码 Hook | 支持（C/C++） | 不支持 |
| iOS 支持 | 支持 | 不支持 |
| 跨平台 | Android/iOS/Windows/macOS/Linux | 仅 Android |
| 持久性 | 会话级别 | 持久化 |
| 隐蔽性 | 较低 | 较高 |
| 脚本语言 | JavaScript | Java |
| 调试体验 | 交互式 REPL | 冷启动 |

### 11.3 场景化选型建议

```
需要快速迭代、探索性分析？
  └─→ 使用 Frida（即时注入、交互式调试）

需要长期稳定的防检测 Hook？
  └─→ 使用 LSPosed（系统级注入、更隐蔽）

需要分析 iOS 应用？
  └─→ 使用 Frida（唯一跨平台方案）

需要 Hook 原生/NDK 代码？
  └─→ 使用 Frida（Xposed 无法处理 native 代码）

对隐蔽性有极高要求？
  └─→ LSPosed + 定制编译 Frida（多层检测绕过）

需要自动化测试/持续集成？
  └─→ Frida Python Binding（可编程、可集成）
```

### 11.4 工具生态

| 工具 | 平台 | 类型 | 与 Frida 的关系 |
|------|------|------|----------------|
| **r2frida** | Android/iOS | 逆向集成 | 将 Frida 集成到 radare2 |
| **Objection** | Android/iOS | 安全测试 | 基于 Frida 的上层框架 |
| **friTap** | Android/iOS | TLS 解密 | 基于 Frida |
| **AppMon** | Android | 监控框架 | 基于 Frida |
| **Needle** | iOS | 安全测试 | 基于 Frida |
| **Inspeckage** | Android | 动态分析 | Xposed 模块 |
| **FridaCodeShare** | 跨平台 | 脚本市场 | Frida 社区生态 |

---

## 0x0C 总结

Frida 作为移动安全测试领域最核心的动态插桩工具，其价值体现在以下几个方面：

1. **交互性**：可以在 REPL 中即时修改脚本，无需重启应用
2. **跨平台**：一套 API 覆盖 Android/iOS/Windows/macOS/Linux
3. **原生代码支持**：可以 Hook C/C++ 函数，这是 Xposed 无法做到的
4. **工具生态**：Objection、friTap、r2frida 等丰富的上层工具
5. **脚本复用**：CodeShare 平台提供大量可直接使用的脚本
6. **Python 绑定**：可以编写自动化测试脚本，集成到 CI/CD
7. **非 Root 支持**：通过 Frida-Gadget 可以在未 Root 设备上使用
8. **Stalker 引擎**：Frida 独有的指令级代码跟踪能力

掌握 Frida 的核心是理解它的架构原理和 JavaScript API 的使用模式。从简单的 Hook 脚本到复杂的 Stalker 跟踪，从 Java 层到 Native 层，从 Android 到 iOS，Frida 提供了一整套完整的动态分析能力。同时，随着应用安全防护技术的不断进化，Frida 本身也在持续更新以应对新的挑战。

---

## 参考资料

1. Frida 官方文档 - https://frida.re/docs/
2. Frida JavaScript API - https://frida.re/docs/javascript-api/
3. Frida CodeShare - https://codeshare.frida.re/
4. Frida GitHub - https://github.com/frida/frida
5. Objection GitHub - https://github.com/sensepost/objection
6. LSPosed GitHub - https://github.com/LSPosed/LSPosed
7. OWASP MASTG Frida 教程 - https://mas.owasp.org/MASTG/tools/android/MASTG-TOOL-0001/
8. Citizen Lab WeChat 安全报告 - https://citizenlab.ca/
9. friTap GitHub - https://github.com/fkie-cad/friTap
10. HackTricks Frida 教程 - https://book.hacktricks.wiki/en/mobile-apps-pentesting/android-app-pentesting/frida-tutorial.html
11. 8kSec Advanced Frida 系列 - https://8ksec.io/
12. Learn Frida - https://learnfrida.info/
