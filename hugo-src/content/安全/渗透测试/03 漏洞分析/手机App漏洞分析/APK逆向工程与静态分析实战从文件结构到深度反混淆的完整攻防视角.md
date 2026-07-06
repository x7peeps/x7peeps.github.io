---
title: "APK 逆向工程与静态分析实战：从文件结构到深度反混淆的完整攻防视角"
date: 2026-07-06T22:00:00+08:00
draft: false
tags: ["APK逆向", "静态分析", "Android安全", "Jadx", "Apktool", "Smali"]
categories: ["漏洞分析"]
---

# APK 逆向工程与静态分析实战：从文件结构到深度反混淆的完整攻防视角

## 0x00 引言

移动应用安全评估中，静态分析（Static Analysis）是最基础也最关键的环节。与动态分析不同，静态分析在不执行目标应用的情况下，通过对 APK 文件的拆解、反编译和代码审查来发现安全漏洞、硬编码密钥、不安全的组件暴露以及隐藏的逻辑后门。本文将从一个 APK 文件的原始二进制结构出发，沿"拆解→反编译→分析→定位→修改"这条主线，完整覆盖 Android 逆向工程的十个核心知识领域——每一部分都包含具体的工具命令、参数释义和实战技巧。

---

## 0x01 APK 文件结构深度剖析

### 1.1 从 Zip 到 APK：容器结构与核心组件

APK（Android Package Kit）本质上是 Zip 格式的归档文件，可直接将后缀名改为 `.zip` 后用任意解压工具打开。其核心目录结构如下：

```
app.apk
├── AndroidManifest.xml      # 二进制 XML，描述组件、权限、版本等
├── classes.dex              # Dalvik 字节码（主 DEX）
├── classes2.dex             # 多 DEX 文件（方法数超 65536 时出现）
├── classes3.dex             # 更多 DEX 文件
├── resources.arsc           # 编译后的资源索引表
├── res/                     # 未打包进 resources.arsc 的资源
│   ├── layout/              # 布局文件（二进制 XML）
│   ├── drawable/            # 图片资源
│   ├── values/              # 字符串、颜色、样式等
│   └── ...
├── lib/                     # Native 库（ELF 格式 .so 文件）
│   ├── armeabi-v7a/
│   ├── arm64-v8a/
│   ├── x86/
│   └── x86_64/
├── assets/                  # 原始资源文件（不会被编译）
├── META-INF/                # 签名与元信息
│   ├── MANIFEST.MF          # 文件摘要列表
│   ├── CERT.RSA             # 签名证书（公钥 + 签名）
│   └── CERT.SF              # 签名字节码文件
└── kotlin/                  # Kotlin 元数据（Kotlin 项目特有）
```

### 1.2 AndroidManifest.xml：二进制 XML 格式

APK 内的 AndroidManifest.xml 不是纯文本，而是经过 `AAPT2`（Android Asset Packaging Tool 2）编译的 **AXML（Android Binary XML）** 格式。其内部基于 Chunk 结构：

- `RES_XML_TYPE` Chunk：文件头，包含命名空间和字符串池
- `RES_XML_START_ELEMENT` Chunk：元素开始标签，包含属性值
- `RES_XML_END_ELEMENT` Chunk：元素结束标签
- `RES_XML_CDATA` Chunk：文本内容

关键特性：资源引用被编码为十六进制 ID（如 `@7F040001`），需通过 `resources.arsc` 解析为实际字符串。直接使用文本编辑器查看只会看到二进制乱码。

使用 `Androguard` 命令行可以解码：

```bash
# 解码 AndroidManifest.xml
androguard axml app.apk

# 解码 resources.arsc 中的字符串
androguard arsc app.apk --type string

# 根据 ID 查询资源
androguard arsc app.apk --id 7F040001
```

### 1.3 DEX 文件格式：Dalvik 可执行文件

`classes.dex` 是 Android 应用的执行代码。DEX 格式设计为紧凑型字节码，针对移动设备的内存和处理器进行了优化。其结构包含：

- **DEX Header**：Magic Number（`dex\n035\0`）、校验和、SHA-1 签名、文件大小、各表偏移
- **String IDs**：所有字符串常量池
- **Type IDs**：所有类型引用
- **Proto IDs**：方法原型（参数和返回值类型）
- **Field IDs**：字段引用
- **Method IDs**：方法引用
- **Class Defs**：类定义（包含访问标志、父类、接口列表、注解、代码偏移）
- **Data Section**：实际的字节码指令数据

多 DEX 机制：当应用方法数超过单个 DEX 文件的 65536 限制后，Android 构建工具会将字节码分配到多个 DEX 文件中（`classes.dex`、`classes2.dex`、`classes3.dex`...），通过 MultiDex 库在运行时进行加载。

### 1.4 resources.arsc：资源表

`resources.arsc` 是一个编译后的资源索引表，以 Chunk 为基本单位：

- **RES_TABLE_TYPE**：根 Chunk，包含包名和资源 ID 起始值
- **RES_TABLE_PACKAGE_TYPE**：包级资源表，包含资源类型字符串池和资源名称字符串池
- **RES_TABLE_TYPE_SPEC_TYPE**：资源类型规范，定义每种资源的配置变体
- **RES_TABLE_TYPE_TYPE**：特定配置下的实际资源条目

`Androguard` 的 AXMLPrinter 和 `AAPT2` 可以解析 ARSC：

```bash
# AAPT2 转储资源表
aapt2 dump resources app.apk

# 列出所有资源类型
androguard arsc app.apk --list-types
```

### 1.5 APK 签名体系

META-INF 目录包含了 APK 的签名信息，涉及三个核心文件：

- **MANIFEST.MF**：逐文件列举 APK 中每个文件的 SHA-256 摘要
- **CERT.SF**：对 MANIFEST.MF 的签名版本和摘要
- **CERT.RSA**：包含开发者公钥证书和使用私钥对 CERT.SF 的签名

Android 支持多种签名方案：

| 方案 | 引入版本 | 机制 | 特点 |
|------|----------|------|------|
| v1（JAR 签名） | Android 1.0 | 对 MANIFEST.MF 中的条目逐个签名 | 不保护 Zip 条目之外的区域 |
| v2 | Android 7.0 | 对整个 APK 的文件内容进行签名（将签名块插入 Zip 注释前） | 验证速度更快，完整性更强 |
| v3 | Android 9.0 | 在 v2 基础上支持密钥轮换（Key Rotation） | 允许在应用更新时更换签名密钥 |
| v4 | Android 11.0 | 增量更新签名 | 配合 APK In APK 和增量文件使用 |

**校验命令：**

```bash
# apksigner 验证
apksigner verify --verbose app.apk

# 查看证书信息
keytool -printcert -jarfile app.apk
```

---

## 0x02 反编译工具链全析

### 2.1 Jadx：当前最主流的 DEX→Java 反编译器

[Jadx](https://github.com/skylot/jadx)（GitHub 48K+ Stars）是目前社区公认的 Android 反编译器标杆。它直接将 DEX 字节码反编译为可读的 Java 源码，无需像传统工作流那样先执行 dex2jar 转换。

**安装与基本使用：**

```bash
# 图形界面模式
jadx-gui app.apk

# CLI 批量处理
jadx -d output_dir app.apk

# 带 ProGuard 映射文件的去混淆
jadx --deobf --deobf-mappings mapping.txt -d output_dir app.apk

# 导出为 Gradle 项目格式
jadx --export-gradle -d output_dir app.apk
```

**CLI 实用参数：**

| 参数 | 说明 |
|------|------|
| `-d, --output-dir` | 指定输出目录 |
| `-j, --threads-count` | 反编译线程数（默认为 CPU 核心数） |
| `--show-bad-code` | 即使代码看起来不正确也显示 |
| `--no-imports` | 不在输出中生成 import 语句 |
| `--deobf` | 激活去混淆（重命名混淆后的类/方法/字段名） |
| `--escape-unicode` | 用 Unicode 转义序列输出非 ASCII 字符 |
| `--resource-decode` | 解码资源文件 |
| `--fs-case-sensitive` | 文件系统大小写敏感模式 |

**Jadx 的核心优势：**

- 出色的 Java 8+ 特性支持：Lambda 表达式、Try-with-resources、Stream API 等
- 多线程引擎，处理大型 APK 速度快
- 与 dex2jar+JD-GUI 传统工作流相比：Jadx 直接解码 DEX，避免了 dex2jar 的转换错误

**Jadx 与 Apktool 的定位区别：** Jadx 解决的是"把字节码变回人能读的 Java 代码"，而 Apktool 解决的是"把二进制资源变回原始 XML + Smali 汇编"。两者互补而非替代。典型工作流是：Jadx 看 Java 逻辑寻找漏洞点，Apktool 修改 Smali 后重打包。

### 2.2 Apktool：核心资源解码与 Smali 工具

[Apktool](https://ibotpeaches.github.io/Apktool/) 是 Android 逆向工程的基础设施，负责将 APK 解码为 Smali 汇编和可读的 XML 资源文件。

```bash
# 解码 APK（默认行为：解码资源 + 反编译 DEX 为 Smali）
apktool d app.apk -o output_dir

# 仅解码资源，不解码 DEX（节省大量时间，关注资源分析时很有用）
apktool d -r app.apk -o output_dir

# 不解码资源文件（保持二进制，当资源解码出错时使用）
apktool d -s app.apk -o output_dir

# 仅反编译 DEX 为 Smali（不涉及资源解码）
apktool d -f app.apk -o output_dir

# 使用特定框架文件
apktool d -p framework_dir app.apk -o output_dir

# 匹配原始文件名的解码（防止 Smali 文件名冲突）
apktool d --match-original app.apk
```

**解码后的目录结构：**

```
output_dir/
├── AndroidManifest.xml          # 解码后的纯文本 XML
├── apktool.yml                  # Apktool 版本及重编译所需元数据
├── original/                    # 原 APK 的 META-INF 备份
├── res/                         # 解码后的资源文件
│   ├── layout/                  # 布局 XML（已恢复为可读格式）
│   ├── values/strings.xml       # 字符串资源
│   └── ...
├── smali/                       # classes.dex 对应的 Smali 代码
├── smali_classes2/              # classes2.dex 对应的 Smali 代码
└── unknown/                     # 未知/不被识别的文件
```

### 2.3 GDA：国产全能反编译器

[GDA](https://github.com/charles2gan/GDA-android-reversing-Tool) 是由国内安全研究者开发的 Android 反编译器，支持 Dalvik 字节码分析、自动化漏洞扫描、恶意行为检测等。其特色包括：

- 内置 Dalvik 字节码解释器（可直接模拟执行 Smali）
- 反混淆引擎（自动处理控制流平坦化）
- APK 加固检测和一键脱壳能力
- 原生支持 DEX、APK、JAR、CLASS 多种格式
- Python 脚本接口用于批量分析

### 2.4 dex2jar + CFR/Procyon：传统工作流

在 Jadx 普及之前，"dex2jar + Java 反编译器"是标准方案：

```bash
# 步骤1：DEX → JAR
d2j-dex2jar app.apk -o app.jar

# 步骤2：使用 CFR 反编译 JAR
java -jar cfr.jar app.jar --outputdir output_dir

# 使用 Procyon 反编译
java -jar procyon-decompiler.jar app.jar -o output_dir
```

CFR（Java 8+ 支持好）和 Procyon（对控制流还原优秀）在某些场景下（如 Jadx 处理异常时的补充验证）仍然有用。学术研究表明，Jadx 在反编译成功率上显著高于 CFR 和 Procyon。

### 2.5 Bytecode Viewer：多功能聚合工具

[Bytecode Viewer](https://bytecodeviewer.com/) 是一个集成了六种反编译器（JD-Core、Procyon、CFR、Fernflower、Krakatau、JADX-Core）的逆向工作台：

- 可同时查看多个反编译器的输出，对比分析
- 内置十六进制编辑器和字节码编辑器
- Smali/Baksmali 集成，可直接编辑 APK
- 恶意代码扫描插件

---

## 0x03 静态分析实战工作流

### 3.1 Manifest 分析清单

对 AndroidManifest.xml 进行系统性的安全检查是静态分析的起点。以下是需要逐一核对的核心安全属性：

```xml
<!-- 重点关注的安全属性 -->
<manifest>
    <!-- 1. debuggable 标志：生产环境应关闭 -->
    <application android:debuggable="false" ...>

    <!-- 2. allowBackup：控制是否允许 adb backup -->
    <application android:allowBackup="false" ...>

    <!-- 3. fullBackupContent：指定备份规则 -->
    <application android:fullBackupContent="false" ...>

    <!-- 4. networkSecurityConfig：网络安全配置 -->
    <application android:networkSecurityConfig="@xml/network_security_config" ...>
</manifest>
```

**分析检查点：**

1. **权限过度声明（Over-Permission）**：检查 `uses-permission`，识别不必要的敏感权限（如 `READ_CONTACTS`、`ACCESS_FINE_LOCATION`、`RECORD_AUDIO`、`CAMERA` 等与核心功能无关的权限）
2. **导出组件（Exported Components）**：`Activity`、`Service`、`BroadcastReceiver`、`ContentProvider` 若设置 `android:exported="true"` 或包含 `<intent-filter>` 均被视为可被外部应用调用
3. **`android:debuggable="true"`**：允许任何进程附加调试器，可被用于运行时篡改
4. **`android:allowBackup="true"`**：允许通过 ADB Backup 提取应用私有数据
5. **任务劫持（Task Affinity）**：检查 `android:taskAffinity` 和 `android:allowTaskReparenting` 配置是否允许界面劫持

### 3.2 硬编码密钥与敏感信息搜索

搜索敏感信息是静态分析中最容易产生成果的环节。以下是一套系统性的正则搜索策略：

**API 密钥 / Token 模式：**
```
[A-Za-z0-9_-]{20,40}         # 通用 API Key
AIza[0-9A-Za-z_-]{35}        # Google API Key
sk-[A-Za-z0-9]{32,}          # OpenAI / 通用 Secret Key
ghp_[A-Za-z0-9]{36}          # GitHub Personal Access Token
AKIA[0-9A-Z]{16}              # AWS Access Key ID
```

**URL 与网络端点：**
```
https?://[^/]+\.(firebaseio|appspot)\.com   # Firebase
https?://[^/]+\.s3\.amazonaws\.com           # S3 Bucket
https?://[^/]+\.cloudfront\.net               # CloudFront
https?://[^/]+\.execute-api\.[^/]+\.amazonaws\.com  # API Gateway
wss?://[^\s"']+                               # WebSocket 端点
```

**加密相关：**
```
[a-fA-F0-9]{32,64}               # MD5/SHA1/SHA256 哈希
(?:AES|DES|RSA|RC4|Blowfish)     # 弱加密算法引用
public\s+static\s+final\s+String\s+.*KEY  # Java 硬编码密钥模式
```

**使用 jadx-gui 搜索建议：**
- 利用 jadx-gui 的全局文本搜索（快捷键 `Ctrl+Shift+F` 或 `Cmd+Shift+F`）
- 浏览 `Resources -> strings.xml` 检查所有已定义的字符串常量
- 在反编译的 Java 源码中搜索 `"http"`、`"password"`、`"secret"`、`"token"`、`"api"` 等关键词
- 检查 `BuildConfig.java` 和 `R.string` 类中的常量引用

### 3.3 APKLeaks 自动化扫描

[APKLeaks](https://github.com/dwisiswant0/apkleaks) 是一个开源的 APK 敏感信息自动扫描工具：

```bash
# 基本用法
apkleaks -f app.apk

# 输出到文件
apkleaks -f app.apk -o output.txt

# 自定义正则规则
apkleaks -f app.apk -p custom_patterns.json
```

### 3.4 MobSF 自动化分析

[MobSF（Mobile Security Framework）](https://github.com/MobSF/Mobile-Security-Framework-MobSF) 是集静态分析和动态分析于一体的移动安全框架：

```bash
# 启动 MobSF Web 服务
docker run -p 8000:8000 opensecurity/mobile-security-framework-mobsf

# 或本地安装
python3 manage.py runserver 0.0.0.0:8000
```

通过 Web UI 上传 APK 后，MobSF 自动生成报告，涵盖：
- Manifest 分析（权限映射、导出组件标记、deeplink 检测）
- 代码分析（危险 API 调用检测、WebView 漏洞、文件读写风险）
- 硬编码密钥扫描
- 第三方库漏洞识别
- 证书和传输安全分析

---

## 0x04 代码混淆与反混淆技术

### 4.1 ProGuard / R8：Android 内置混淆方案

ProGuard 是 Android Studio 内置的开源代码混淆、压缩和优化工具。在 Android Gradle 插件 3.4.0 之后，Google 使用 R8 作为默认替代。

**ProGuard 工作流程（四阶段）：**

1. **Shrink（压缩）**：检测并移除未使用的类和成员
2. **Optimize（优化）**：内联方法、简化表达式、移除冗余代码
3. **Obfuscate（混淆）**：将类名、方法名、字段名重命名为无意义的短名称（如 `a.a()`）
4. **Preverify（预校验）**：为 JVM 添加预校验信息（Android 上通常不需要）

**R8 相对 ProGuard 的改进：**
- 更激情的代码缩减和内联优化
- 更好的 Kotlin 支持（处理 Lambda、协程等）
- 编译时间更短（将 ProGuard 的"Java 字节码级"处理提升到"DEX 字节码级"）

**识别 ProGuard/R8 混淆的特征：**
- 类名变为 `a`、`b`、`c` 等单字母或 `aa`、`ab` 等双字母
- 方法名完全失去语义信息
- `R.java` 中的资源 ID 字段被内联为常量
- 出现大量 `$` 分隔的内部类（如 `MainActivity$1`、`MainActivity$2`）

**对抗 ProGuard/R8 混淆的方法：**

使用 ProGuard 的 Mapping 文件还原名称。Mapping 文件包含原始名称到混淆后名称的映射关系，以下命令可以逆向还原：

```bash
# Jadx 加载 mapping 文件进行去混淆
jadx --deobf --deobf-mappings mapping.txt -d output app.apk

# retrace 工具还原栈追踪
java -jar proguard.jar retrace mapping.txt obfuscated_stacktrace.txt
```

### 4.2 DexGuard：商业级 Android 加固

DexGuard 是 GuardSquare 推出的商业 Android 混淆器，除了 ProGuard 的所有功能外，还提供：
- **控制流混淆（Control Flow Obfuscation）**：在代码中插入无害的"垃圾代码"和无关的分支，打乱原有的控制流结构
- **字符串加密**：将所有字符串常量加密存储，运行时动态解密
- **反射调用封装**：将直接的方法调用替换为 Java 反射调用，混淆调用关系
- **资源名称混淆**：重命名资源文件，使其失去语义信息
- **DEX 文件分割与加密**：将字节码分割并加密，在运行时解密

**识别 DexGuard：**
- Classes 中出现大量 `switch` 或 `if-else` 分支（控制流平坦化）
- 字符串常量被替换为二进制数据 + 解密调用
- 类中大量反射 API 调用（`Class.forName()`、`Method.invoke()`）
- 出现 `GuardSquare` 或 `DexGuard` 相关字符串

### 4.3 DashO：PreEmptive 商业混淆

DashO 提供了更深层次的保护机制：
- **重命名混淆（Renaming Obfuscation）**：类/方法/字段名变为无意义的 Unicode 字符
- **字符串加密**：类似 DexGuard 的运行时解密策略
- **API 隐藏**：将 Android Framework API 调用进一步封装
- **完整性检查**：运行时计算 APK 签名哈希，检测是否被篡改

**识别 DashO：**
- 类名包含 Unicode 扩展字符或看起来像乱码的 ASCII 组合
- 运行时会弹出"App has been tampered"之类的警告（完整性检查触发）

### 4.4 OLLVM：原生代码混淆

[OLLVM（Obfuscator-LLVM）](https://github.com/obfuscator-llvm/obfuscator) 是基于 LLVM 编译基础设施的代码混淆工具，作用于 `lib/` 目录下的 `.so` 文件：

**三种核心混淆技术：**

1. **指令替换（Instruction Substitution - InsSub）**：
   将标准运算指令替换为一系列等价但更复杂的指令序列。例如：
   ```
   // 原始：a = b + c
   // 混淆后：a = b ^ c; a += 2 * (b & c); a += (b ^ c) & something
   ```

2. **虚假控制流（Bogus Control Flow - BCF）**：
   在基本块前插入不可达的条件判断和垃圾代码块，增加反编译器的分析难度

3. **控制流平坦化（Control Flow Flattening - CFF）**：
   将函数原有的控制流图完全打平为一个主分发器（Dispatcher）加多个基本块的结构，每个基本块通过状态变量跳转。这是最强大的 OLLVM 技术。

**OLLVM 的反混淆思路：**
- 使用符号执行引擎（如 Angr）分析控制流依赖关系，消除不可达路径和虚假分支
- 通过数据流分析识别 Dispatcher 结构和状态变量，恢复原始控制流图
- 工具：deobf-llvm、DiANa（自动化 Android 原生代码反混淆系统）

### 4.5 字符串加密的反混淆实战

无论 DexGuard、DashO 还是自定义加固方案，字符串加密都是最常见的混淆手法。反混淆的基本流程：

```bash
# 1. 使用 Jadx 定位字符串解密函数
# 搜索包含 byte[] 类型参数且返回 String 的方法

# 2. 提取加密后的字节码
# 在 Jadx 中定位加密后的字节数组和调用解密函数的位置

# 3. 使用 Frida Hook 运行时解密
frida -U -l decrypt_strings.js com.target.app

# 4. 或静态还原：编写 Python 脚本模拟解密逻辑
python3 emulate_decrypt.py encrypted_strings.bin key
```

---

## 0x05 Smali 修补：修改、重编译与重签名

### 5.1 Smali 语法速览

Smali 是 Dalvik 字节码的汇编形式，由 `baksmali`（Apktool 内部集成）从 DEX 文件反汇编生成。了解 Smali 语法是进行代码修补的基础：

**基本指令结构：**
```smali
# 方法定义
.method public static hello(Landroid/content/Context;)V
    .registers 3                # 声明寄存器数量（3 个）
    .prologue                   # 方法开始

    # 打印日志
    const-string v0, "Hello from Smali!"
    invoke-static {v0}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I

    return-void
.end method
```

**核心操作码速查表：**

| 指令 | 说明 | 示例 |
|------|------|------|
| `const v0, 1` | 将整数 1 存入 v0 | 设置常量值 |
| `const-string v0, "text"` | 将字符串存到 v0 | 加载字符串 |
| `const/4 v0, 0x1` | 4 位常量优化指令 | 赋值 true/false |
| `move v0, v1` | v1 → v0 | 寄存器间传值 |
| `if-eqz v0, :cond_0` | v0 == 0 跳转 | 条件判断 |
| `if-nez v0, :cond_0` | v0 != 0 跳转 | 条件判断 |
| `goto :label` | 无条件跳转 | 跳转 |
| `invoke-static {...}, Lclass;->method` | 调用静态方法 | 方法调用 |
| `invoke-virtual {...}, Lclass;->method` | 调用虚方法 | 方法调用 |
| `invoke-direct {...}, Lclass;->method` | 调用直接方法 (<init>) | 构造函数调用 |
| `sget-object v0, Lclass;->field:Ltype` | 获取静态对象字段 | 读取字段 |
| `sput-object v0, Lclass;->field:Ltype` | 设置静态对象字段 | 写入字段 |
| `iget-object v0, v1, Lclass;->field:Ltype` | 获取实例字段 | 读取实例字段 |
| `return-void` | void 返回 | 无返回值返回 |
| `return v0` | 返回 v0 的值 | 有返回值返回 |

**类型描述符：**
```
V  → void
Z  → boolean
B  → byte
S  → short
C  → char
I  → int
J  → long (64 位，占 2 个寄存器)
F  → float
D  → double (64 位，占 2 个寄存器)
Lpackage/name/ObjectName; → 对象
[I → int 数组
[[Ljava/lang/String; → 二维 String 数组
```

### 5.2 典型修补场景

**场景一：绕过 Root 检测**

原始 Smali（方法返回 `true` 表示检测到 Root）：
```smali
.method public isRooted()Z
    .registers 2
    .prologue
    const/4 v0, 0x1      # return true
    return v0
.end method
```

修改为始终返回 `false`：
```smali
.method public isRooted()Z
    .registers 2
    .prologue
    const/4 v0, 0x0      # return false
    return v0
.end method
```

**场景二：绕过 SSL Pinning**

定位到证书固定检查的 Smali 方法，将抛出异常的代码路径跳转到正常路径，或者直接移除 `checkPinning()` 调用。

**场景三：修改许可验证**

定位到 License 检查方法，将有条件跳转（`if-nez`）改为无条件跳转（`goto`），或直接修改返回值寄存器。

### 5.3 重编译与重签名流程

```bash
# 第1步：解码 APK
apktool d target.apk -o target_decoded

# 第2步：修改 Smali 代码
vim target_decoded/smali/com/example/app/MainActivity.smali

# 第3步：重编译
apktool b target_decoded -o target_repackaged.apk

# 第4步：创建签名密钥（仅第一次需要）
keytool -genkey -v -keystore mykey.jks -keyalg RSA -keysize 2048 \
        -validity 10000 -alias myalias

# 第5步：使用 apksigner 签名（推荐，支持 v1+v2+v3）
zipalign -v -p 4 target_repackaged.apk target_aligned.apk
apksigner sign --ks mykey.jks --ks-pass pass:yourpassword \
        --out target_signed.apk target_aligned.apk

# 第6步：验证签名
apksigner verify --verbose target_signed.apk

# 第7步：安装
adb install target_signed.apk
```

**关于 jarsigner 与 apksigner 的区别：**

- `jarsigner`：JDK 自带工具，仅支持 v1 签名方案，签名顺序为 `sign → zipalign`
- `apksigner`：Android SDK Build Tools 提供，支持 v1/v2/v3/v4 全部方案，签名顺序为 `zipalign → sign`
- `uber-apk-signer`：社区工具，自动处理签名流程，支持所有签名方案

**关于 v1/v2 兼容性：** 如果仅使用 jarsigner 进行 v1 签名，在 Android 11+ 上安装时会触发签名方案过低的警告。建议始终使用 apksigner 同时签署 v1 + v2 方案。

**Apktool 编译失败常见问题与解决方案：**

| 问题 | 解决方案 |
|------|----------|
| `brut.androlib.err.UndefinedResObject` | 安装框架文件: `apktool if framework-res.apk` |
| 资源解码失败 | 使用 `-r` 参数跳过资源解码 |
| 9-patch 图片损坏 | 检查 `res/drawable` 下的 `.9.png` 文件格式 |
| aapt 版本不兼容 | 确保系统 PATH 中的 aapt2 版本与 Apktool 兼容 |

---

## 0x06 AndroidManifest.xml 漏洞分析

### 6.1 导出组件攻击面

当组件设置 `android:exported="true"` 或声明了 `<intent-filter>` 时（Android 12 之前只要有 intent-filter 就默认为 exported），外部应用即可通过 Intent 直接调用该组件。

**Activity 劫持：**
```xml
<!-- 高风险：任意外部应用可启动此 Activity -->
<activity
    android:name=".WebViewActivity"
    android:exported="true">
    <intent-filter>
        <action android:name="com.example.OPEN_URL" />
        <category android:name="android.intent.category.DEFAULT" />
    </intent-filter>
</activity>
```

攻击利用：
```bash
# 使用 adb 启动导出的 Activity
adb shell am start -n com.target.app/.WebViewActivity \
    -d "file:///data/data/com.target.app/databases/secret.db"
```

**Service 滥用：**
```xml
<service android:name=".DataSyncService" android:exported="true" />
```

攻击者可能通过绑定并发送恶意 Intent 触发 Service 中的敏感操作（如数据上传、文件读写）。

**BroadcastReceiver 数据泄露：**
```xml
<receiver android:name=".SmsReceiver" android:exported="true">
    <intent-filter>
        <action android:name="android.provider.Telephony.SMS_RECEIVED" />
    </intent-filter>
</receiver>
```

通过发送伪造的广播可触发接收器中的敏感逻辑，或通过有序广播拦截/篡改数据。

**ContentProvider 数据泄露：**
```xml
<provider
    android:name=".UserDataProvider"
    android:authorities="com.target.user_provider"
    android:exported="true" />
```

利用：
```bash
adb shell content query --uri content://com.target.user_provider/users
```

### 6.2 自定义权限缺陷

自定义权限如果设计不当可能导致权限升级攻击：

```xml
<!-- 危险模式：protectionLevel 过低 -->
<permission
    android:name="com.target.permission.WRITE_DATA"
    android:protectionLevel="normal" />  <!-- 任何应用均可申请 -->

<!-- 建议：至少使用 signature 级别 -->
<permission
    android:name="com.target.permission.WRITE_DATA"
    android:protectionLevel="signature" />  <!-- 仅相同签名的应用可申请 -->
```

`protectionLevel` 安全等级：
- `normal`：默认授予，无风险
- `dangerous`：运行时询问用户授权
- `signature`：仅当请求应用与声明应用使用相同证书签名时才授予
- `signatureOrSystem`：系统应用或相同签名应用可获取

### 6.3 Deep Link / URL Scheme 劫持

Deep Link 如果声明不当，可能被恶意应用劫持，实现钓鱼攻击：

```xml
<activity android:name=".LoginActivity" android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <!-- 存在被劫持风险的自定义 Scheme -->
        <data android:scheme="myapp" android:host="login" />
    </intent-filter>
</activity>
```

攻击者可以在手机上安装一个也声明了 `myapp://login` 的应用，当用户点击链接时，系统会弹出选择器——若用户误选恶意应用，凭证将被窃取。

**安全建议：**
- 使用 HTTPS Deep Link（`<data android:scheme="https" android:host="myapp.com" />`）
- Android App Links 验证（`autoVerify="true"` + 服务器部署 Digital Asset Links JSON 文件）
- 避免使用自定义 URL Scheme 处理敏感操作（如支付回调、密码重置）

### 6.4 网络安全配置分析

`res/xml/network_security_config.xml` 控制应用的网络安全策略：

```xml
<!-- 不安全配置示例 -->
<network-security-config>
    <base-config cleartextTrafficPermitted="true" />  <!-- 允许 HTTP -->
    <debug-overrides>
        <trust-anchors>
            <certificates src="user" />  <!-- 信任用户安装的证书 -->
        </trust-anchors>
    </debug-overrides>
</network-security-config>
```

检查要点：
- `cleartextTrafficPermitted="true"`：允许明文 HTTP 流量，容易被中间人攻击
- `certificates src="user"`：信任用户安装的证书（在 debug 模式下可接受，但不应出现在 release 构建中）
- `domain-config` 是否过于宽泛

---

## 0x07 资源文件深度分析

### 7.1 strings.xml：被低估的信息源

`res/values/strings.xml` 是逆向分析中信息量最大的资源文件之一。即使代码经过 ProGuard 混淆，字符串资源仍然保持明文：

```xml
<resources>
    <!-- 常见的硬编码端点 -->
    <string name="api_base_url">https://api.target.com/v1</string>
    <string name="ws_endpoint">wss://realtime.target.com/chat</string>
    
    <!-- 硬编码密钥（常见违规） -->
    <string name="encryption_key">aHR0cHM6Ly93d3cueDd</string>
    
    <!-- Firebase URL -->
    <string name="firebase_url">https://target-app.firebaseio.com</string>
    <string name="firebase_db_url">https://target-db-default-rtdb.firebaseio.com</string>
    
    <!-- 第三方服务凭证 -->
    <string name="aws_access_key">AKIAXXXXXXXXXXXX</string>
    <string name="bugsnag_api_key">xxxxxxxxxxxxxxxxxxxxxxxx</string>
    
    <!-- AppCenter / 遥测端点 -->
    <string name="appcenter_secret">xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</string>
</resources>
```

### 7.2 Firebase 数据库配置分析

Firebase Realtime Database 和 Firestore 如果配置不当，是常见的高危信息泄露源：

```bash
# 检测到 Firebase URL 后，尝试未授权访问
# 检查数据库是否开放公共读权限
curl https://target-app.firebaseio.com/.json

# 检查 Firestore
curl https://firestore.googleapis.com/v1/projects/target-app/databases/(default)/documents
```

### 7.3 AWS / 云服务凭证识别

在资源文件和代码中搜索 AWS 相关模式：

```
# AWS Access Key (20 位字母数字)
AKIA[0-9A-Z]{16}

# AWS Secret Key
[0-9a-zA-Z/+]{40}

# 检查 S3 Bucket 权限
curl -X GET https://target-bucket.s3.amazonaws.com/
```

### 7.4 Layout 文件与逻辑关联

布局文件（`res/layout/*.xml`）虽然是 UI 定义，但能揭示大量有价值的信息：

- **隐藏的 Debug 界面**：某些应用在 `AndroidManifest.xml` 中未注册的调试 Activity 可能在 layout 中有对应的布局文件
- **管理后台入口**：某些应用包含隐藏的管理功能，通过特定的 `View ID` 或 `String` 引用可以定位
- **已弃用但仍存在的功能入口**：通过布局文件中未被删除的按钮/菜单项可以发现隐藏功能

---

## 0x08 Native 库分析（ELF / JNI）

### 8.1 定位 Native 函数

Android 应用的 Native 代码存放在 `lib/<ABI>/` 目录下，格式为 ELF（Executable and Linkable Format）。JNI 函数有两种注册方式：

**1. 动态注册（RegisterNatives）：**
```java
// Java 端
static {
    System.loadLibrary("native-lib");
}
private static native String stringFromJNI();
```

Native 函数名称遵循 JNI 命名约定：`Java_<包名>_<类名>_<方法名>`：
```bash
# 查看导出的 JNI 函数
readelf -s libnative-lib.so | grep Java_

# 或使用 strings 搜索动态注册的函数名
strings libnative-lib.so | grep "RegisterNatives"
```

**2. 静态注册（RegisterNatives 调用）：**
Native 代码在 `JNI_OnLoad()` 中调用 `RegisterNatives()` 手动注册函数指针。这种方式可以规避命名规则，增加逆向难度。

### 8.2 Ghidra 分析 Native 库

[Ghidra](https://ghidra-sre.org/) 是 NSA 开源的反编译框架，对 Android .so 文件的分析能力与 IDA Pro 相当：

**Ghidra 中的 JNI 类型加载：**

1. 下载 JNI 数据类型存档文件 `jni_all.gdt`
2. 在 Ghidra 的 Data Type Manager 中点击右键 → "Open File Archive" → 选择 `jni_all.gdt`
3. 在反编译窗口中，将 JNI 函数的第一个参数（`JNIEnv*`）重新类型化为 `JNIEnv *`
4. Ghidra 会自动识别并显示调用的 JNI 函数名称（如 `FindClass`、`GetMethodID`、`CallObjectMethod`）

**关键分析技巧：**

```bash
# 使用 readelf 检查 ELF 结构
readelf -h libnative-lib.so        # ELF 头
readelf -s libnative-lib.so        # 符号表
readelf -r libnative-lib.so        # 重定位表
readelf -d libnative-lib.so        # 动态段信息

# 使用 objdump 反汇编特定函数
arm-linux-androideabi-objdump -d libnative-lib.so | grep -A 50 "<Java_xxx>"

# 使用 strings 提取所有可打印字符串
strings libnative-lib.so | grep -iE "(http|secret|key|password|token|api)"
```

### 8.3 Native 加固与反分析

- **UPX 加壳**：检测 ELF 文件头是否被修改，使用 `upx -d` 尝试脱壳
- **符号剥离**：`strip` 后的 `.so` 文件函数名变为地址偏移，但仍可通过 Ghidra 的自动分析恢复
- **OLLVM 混淆**：如前所述，控制流平坦化是主要障碍，需结合符号执行对抗
- **反调试**：检查 `.init` 和 `.init_array` 段的函数是否包含 `ptrace(PTRACE_TRACEME)` 调用

---

## 0x09 Android App Bundle (AAB) 与替代格式

### 9.1 AAB 格式结构

自 2021 年 8 月起，Google Play 要求新应用以 AAB（Android App Bundle）格式发布。AAB 不是可直接安装的文件，而是 Google Play 用来生成优化 APK 的发布格式：

```
bundle.aab/
├── base/                        # 基础模块
│   ├── dex/                     # DEX 文件（与 APK 不同，放在独立目录）
│   │   ├── classes.dex
│   │   └── classes2.dex
│   ├── res/                     # 资源文件
│   ├── lib/                     # Native 库
│   │   ├── arm64-v8a/
│   │   └── armeabi-v7a/
│   ├── assets/
│   ├── manifest/
│   │   └── AndroidManifest.xml  # 独立于二进制 XML 的纯文本格式
│   └── root/                    # 移动到 APK 根目录的文件
├── feature1/                    # 功能模块（按需下载）
├── asset_pack_1/                # 资源包（游戏等大型资源）
├── BundleConfig.pb              # Protobuf 格式的 Bundle 配置
├── native.pb                    # Native 库元数据
└── resources.pb                 # 资源元数据
```

### 9.2 AAB 逆向分析方法

由于 AAB 并非直接的可安装格式，逆向 AAB 需要额外步骤：

```bash
# 方法1：使用 bundletool 生成通用 APK
bundletool build-apks --bundle=bundle.aab --output=app.apks \
    --mode=universal --ks=mykey.jks --ks-pass=pass:password

# 解压生成的 .apks 文件（也是 Zip 格式）
unzip app.apks -d app_apks
# 在 app_apks/ 中找到 universal.apk，这就是通用 APK

# 方法2：Jadx 直接打开 base 目录中的 DEX
jadx bundle.aab/base/dex/classes.dex

# 方法3：Jadx 支持直接打开 AAB 文件（v1.4.0+ 支持）
jadx-gui bundle.aab
```

### 9.3 Split APK 机制

AAB 的核心价值在于 Split APK——Google Play 根据设备配置（ABI、屏幕密度、语言）生成仅包含所需资源的 APK 切片：

```
split_output/
├── base.apk                    # 基础 APK（必须）
├── split_config.arm64_v8a.apk  # ARM64 架构配置
├── split_config.hdpi.apk       # 屏幕密度配置
├── split_config.zh.apk         # 中文字体/资源
└── ...
```

**逆向分析 Split APK：** 将 base.apk 和所有相关的 split_config*.apk 一起传递给 Jadx：

```bash
# 同时打开 base APK 和所有 Split APK
jadx-gui base.apk split_config.arm64_v8a.apk split_config.hdpi.apk

# 或批量
jadx -d output_dir base.apk split_config.*.apk
```

### 9.4 OBB 文件

OBB（Opaque Binary Blob）是 Google Play 用于扩展 APK 大小的附属文件（主 APK 最大 100MB，OBB 最大 2GB），常用于游戏资源包。

```bash
# OBB 存储路径
/sdcard/Android/obb/<package-name>/
├── main.1.com.example.game.obb    # 主资源包
└── patch.1.com.example.game.obb   # 补丁资源包

# 分析 OBB 文件（本质是 Zip 格式）
file main.1.com.example.game.obb   # 输出: Zip archive
unzip -l main.1.com.example.game.obb
```

### 9.5 XAPK 格式

XAPK 是第三方商店（如 APKPure、APKMirror）自定义的包装格式，将 APK + OBB 打包在一个 Zip 文件中：

```bash
# 解压 XAPK
unzip app.xapk -d app_extracted

# 典型内容
ls app_extracted/
# base.apk  config.arm64_v8a.apk  Android/obb/  manifest.json

# 安装
adb install-multiple -r app_extracted/*.apk
adb push app_extracted/Android/obb/ /sdcard/Android/obb/
```

---

## 0x0A 工具深度实战

### 10.1 Jadx-GUI 高级使用技巧

**代码浏览技巧：**

1. **跨引用搜索（Cross References）**：在方法/字段上右键 → "Find Usage"（快捷键 `Ctrl+Alt+F` / `Cmd+Alt+F`），快速定位所有调用点
2. **类型层级查看**：选中类名 → `Ctrl+H`，查看继承关系
3. **反编译脱敏模式**：`View → Show Raw Dalvik Bytecode`，同时查看 Smali 和 Java 源代码的对应关系
4. **跳过反编译失败的方法**：配置 `--show-bad-code` 避免反编译器崩溃导致整个类不可见
5. **资源浏览器**：左侧 `Resources` 面板直接查看解码后的 `strings.xml`、`AndroidManifest.xml` 等

**去混淆配置：**

在 `jadx-gui` 中通过 `File → Preferences → Deobfuscation` 可以配置：
- 最小字符串长度过滤
- 重命名混淆的类和包名
- 使用 ProGuard mapping 文件还原名称（`File → Load ProGuard Mapping`）

**搜索功能：**

- 全局搜索：`Ctrl+Shift+F`（按字符串、类型、方法名搜索）
- 搜索类：`Ctrl+N` / `Cmd+O`
- 搜索符号（方法/字段）：`Ctrl+Alt+Shift+N` / `Cmd+Alt+O`
- 正则表达式搜索：勾选搜索面板中的 `Regex` 选项

**批量反编译脚本：**

```bash
# 批量处理多个 APK
for apk in *.apk; do
    jadx -d "${apk%.*}_src" --deobf --show-bad-code "$apk"
done

# 输出为 Gradle 项目，方便在 Android Studio 中进一步分析
jadx --export-gradle -d project_dir app
```

### 10.2 Apktool 高级选项

**框架文件管理：**

当 Apktool 在解码某些系统级 APK 或经过 AAPT2 编译的 APK 时，可能需要安装对应的 Android 框架文件：

```bash
# 安装框架文件
apktool if framework-res.apk

# 查看已安装的框架
apktool if --list

# 指定框架路径
apktool d -p ~/.local/share/apktool/framework app.apk

# 清除框架缓存
rm -rf ~/.local/share/apktool/framework/
```

**高级解码选项：**

```bash
# 强制解码（即使目录已存在）
apktool d -f app.apk -o output

# 仅解码 Dex，不处理资源（应对资源未编译的已知 bug）
apktool d -s app.apk -o output

# 合并多个 DEX 文件到一个 Smali 目录
apktool d --match-original app.apk

# 保留调试信息（默认不保留）
apktool d --keep-broken-res app.apk

# 仅解码 DEX 文件
apktool d -d app.apk -o output_smali
```

**高级重编译选项：**

```bash
# 使用自定义 aapt2 路径
apktool b --aapt2 /path/to/aapt2 output -o rebuilt.apk

# 复制原始签名文件（仅用于调试，不可用于发布）
apktool b --copy-original output -o rebuilt.apk

# 输出为未签名 APK
apktool b output -o unsigned.apk

# 指定 API 级别（控制编译时的 target API）
apktool b --api 34 output -o rebuilt.apk

# 显示编译详细日志
apktool b --verbose output -o rebuilt.apk
```

### 10.3 Android Studio APK Analyzer

Android Studio 内置的 APK Analyzer 提供了直观的 APK 大小和内容分析功能：

**启动方式：**
- 将 APK 直接拖入 Android Studio 编辑窗口
- `Build → Analyze APK` 菜单
- 命令行方式：`apkanalyzer apk summary app.apk`

**核心功能：**

1. **File Size View**：按文件类型统计 APK 各部分的原始大小和下载大小占比（Raw File Size vs Download Size），快速定位体积异常
2. **DEX 文件分析**：
   - 查看 DEX 文件中的包、类和方法树状结构
   - 根据引用数排序方法：找出使用最多的方法
   - 加载 ProGuard Mapping 反混淆类名
   - 查看方法的字节码（Bytecode）和查找引用（Find Usages）
3. **AndroidManifest.xml 对比**：
   - 查看构建过程中的 Manifest 合并结果
   - 识别来自不同 AAR 库的 Manifest 片段
4. **Resource 查看器**：
   - 查看 strings.xml 的不同语言配置值
   - 预览图片资源
   - 分析 9-patch 图片
5. **APK 对比**：两个 APK 并列对比大小差异，方便识别构建变化

**命令行动态分析：**

```bash
# APK 摘要信息
apkanalyzer apk summary app.apk

# 文件大小分布
apkanalyzer apk file-size app.apk

# DEX 类和方法计数
apkanalyzer dex classes app.apk
apkanalyzer dex method-count app.apk

# 清单信息
apkanalyzer manifest application-id app.apk
apkanalyzer manifest version-name app.apk
apkanalyzer manifest min-sdk app.apk
```

### 10.4 Smalidea：IntelliJ/Android Studio Smali 调试插件

Smalidea 是 IntelliJ IDEA / Android Studio 的 Smali 语言插件，支持在 Smali 代码级别设置断点、单步执行和变量查看——这是逆向工程中"动态分析"部分的利器。

**安装步骤：**

1. 从 Bitbucket 下载页面下载 smalidea.zip（当前版本：0.06）
2. `File → Settings → Plugins → Install Plugin from Disk`，选择下载的 zip 文件
3. 重启 IDE

**完整调试配置流程：**

```bash
# 第1步：解码 APK（确保 AndroidManifest.xml 中 debuggable=true）
apktool d target.apk -o target_src
# 如果原始 debuggable=false，在解码后的 AndroidManifest.xml 中手动修改为 true

# 第2步：重编译并签名
apktool b target_src -o target_debug.apk
# 创建调试密钥
keytool -genkey -v -keystore debug.keystore -alias debug -keyalg RSA \
        -keysize 2048 -validity 10000 -storepass android -keypass android
# 签名
zipalign -v -p 4 target_debug.apk target_aligned.apk
apksigner sign --ks debug.keystore --ks-pass pass:android \
        --out target_signed.apk target_aligned.apk

# 第3步：安装到设备
adb install target_signed.apk

# 第4步：在设备上以调试模式启动应用
adb shell am start -D -n com.target.app/.MainActivity
```

**在 IDE 中配置远程调试：**

1. 在 IntelliJ IDEA 中以源代码根目录方式打开 `target_src` 目录
2. `Run → Edit Configurations → + → Remote JVM Debug`
3. 设置端口为 `8700`（与 DDMS 默认调试端口一致）
4. 在 Smali 文件中设置断点
5. 启动 DDMS（`tools/monitor`），选择目标进程
6. 在 IDE 中开始调试（`Run → Debug 'Remote'`）

**Smalidea 的核心价值：**

- 在逆向分析中，Jadx 反编译的 Java 代码可能由于混淆而无法完全还原逻辑，Smali 级别的调试可以精确定位到字节码指令的执行路径
- 支持表达式求值：在调试时可以直接调用 Java 方法，如 `java.lang.System.currentTimeMillis()`
- 寄存器值监控：实时查看 Dalvik 寄存器的值变化
- 条件断点：设置寄存器满足特定条件时才中断，提高分析效率

---

## 0x0B 总结与扩展阅读

APK 逆向工程与静态分析是一个从"触觉"到"直觉"的过程——一开始你只能看到二进制乱码和混淆符号，但随着工具链的熟练使用和对 Android 系统机制的深入理解，你可以越来越快地定位到关键代码路径。

**从静态分析到动态分析的衔接：**

静态分析完成后，典型的下一个阶段是动态分析，包括：
1. **Frida Hook**：在运行时拦截和修改方法的参数、返回值和行为
2. **Objection**：基于 Frida 的运行时探索工具，一键绕过 SSL Pinning、Root 检测
3. **mitmproxy / Burp Suite**：HTTPS 流量截获与分析
4. **Xposed / LSPosed**：框架级别的 Hook 能力

**建议阅读资源：**
- OWASP MASTG (Mobile Security Testing Guide)：移动安全测试的黄金标准，涵盖 Android 和 iOS
- HackTricks - Android App Pentesting：持续更新的渗透测试知识库
- Android App Reverse Engineering 101：Maddie Stone 的经典入门教程，含实战练习
- Jeb Decompiler / IDA Pro：商业工具，在 Native 代码分析和大型 APK 分析上有显著优势

**自动化分析工具生态：**

| 工具 | 类型 | 适用场景 |
|------|------|----------|
| MobSF | 自动化分析框架 | 快速生成综合安全报告 |
| APKLeaks | 密钥泄露检测 | 自动化搜索硬编码凭证 |
| Androguard | Python 分析库 | 自定义批量分析脚本 |
| QARK | 自动化漏洞扫描 | 检测 OWASP Top 10 移动漏洞 |
| APKLab | VS Code 插件 | 集成 Apktool/Jadx/uber-apk-signer 的工作台 |

无论是黑盒渗透测试、恶意软件分析还是应用加固评估，扎实的静态分析能力是每一个移动安全从业者的基本功。本文覆盖的技术栈和实战技巧涵盖了从"刚拿到一个 APK"到"完成全面安全评估"的完整路径，希望为你后续的深入实践提供坚实的参考基础。

---

## 参考资料

1. Jadx GitHub Repository - https://github.com/skylot/jadx
2. Apktool Official Documentation - https://ibotpeaches.github.io/Apktool/
3. GDA Android Reversing Tool - https://github.com/charles2gan/GDA-android-reversing-Tool
4. OWASP Mobile Security Testing Guide - https://mas.owasp.org/MASTG/
5. MobSF Mobile Security Framework - https://github.com/MobSF/Mobile-Security-Framework-MobSF
6. APKLeaks - https://github.com/dwisiswant0/apkleaks
7. Android App Reverse Engineering 101 - https://www.ragingrock.com/AndroidAppRE/
8. HackTricks Android Pentesting - https://hacktricks.wiki/en/mobile-pentesting/android-app-pentesting/
9. APKLab VS Code Extension - https://github.com/doronz88/APKLab
10. Smalidea - https://bitbucket.org/JesusFreke/smali/downloads/
11. OLLVM GitHub Repository - https://github.com/obfuscator-llvm/obfuscator
12. Ghidra Reverse Engineering Framework - https://ghidra-sre.org/