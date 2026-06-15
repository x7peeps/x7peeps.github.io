---
title: "macOS红队实战：TCC绕过与持久化机制"
weight: 30
---

# macOS红队实战：TCC绕过与持久化机制

在现代企业环境中，尤其是科技和互联网公司，macOS 往往是开发人员和高管的标配设备。这意味着，拿下 macOS 终端往往等同于拿到了直接通往生产环境源码或企业核心资产的钥匙。

然而，苹果通过引入 SIP（系统完整性保护）、TCC（透明度、同意和控制）以及 Endpoint Security 等机制，将 macOS 打造得坚如磐石。本文将探讨在 macOS 环境下的后渗透高级技术，包括权限提升、沙盒逃逸与隐蔽持久化。

---

## 1. 突破 TCC (Transparency, Consent, and Control)

**TCC** 是 macOS 中管理应用访问敏感数据（如摄像头、麦克风、桌面、文档目录、完全磁盘访问权限 FDA）的核心机制。即使红队拿到了 Root 权限，如果没有绕过 TCC，依然无法读取受保护的文件。

### 1.1 TCC 数据库操纵 (FDA 滥用)
TCC 的授权策略存储在 SQLite 数据库中：
*   用户级：`~/Library/Application Support/com.apple.TCC/TCC.db`
*   系统级：`/Library/Application Support/com.apple.TCC/TCC.db`

如果红队获取的 Shell 恰好来自于一个已经拥有 **FDA (Full Disk Access)** 权限的程序（例如通过 SSH 登录，且终端应用被授予了 FDA，或者拿下了系统管理软件 MDM 的执行权限），红队就可以直接通过 SQL 语句修改 TCC.db，将自己的恶意载荷加入白名单。
```bash
sqlite3 /Library/Application\ Support/com.apple.TCC/TCC.db "INSERT INTO access VALUES('kTCCServiceMicrophone','com.hacker.evil',0,2,2,1,NULL,NULL,0,'UNUSED',NULL,0,16384);"
```

### 1.2 注入拥有 TCC 权限的应用
如果无法直接修改数据库，可以寻找系统中**已经拥有目标权限（如屏幕录制、麦克风）的合法应用**，并通过代码注入或环境变量劫持，强迫该合法应用替我们执行恶意动作。
*   **Dylib 劫持/注入**：macOS 下的动态库为 `.dylib`。如果一个拥有 FDA 权限的应用程序（未启用 Hardened Runtime 或开启了特定的 Entitlements）存在 Dylib 劫持漏洞，红队可以构造一个恶意的 Dylib 放入加载路径，应用程序启动时便会带上它的高权限执行恶意代码。
*   **AppleScript / OSA 滥用**：通过 `osascript` 控制具有权限的系统组件（如 Finder 或 System Events）来弹出钓鱼弹窗或读取文件。

---

## 2. macOS 本地提权与凭证窃取

在 macOS 上，直接的内核提权漏洞（如曾经的 `CVE-2021-30869` Sudo 提权）非常抢手。但在实战中，利用配置缺陷或钓鱼获取凭证更为稳定。

### 2.1 伪造授权认证弹窗 (Phishing)
由于 macOS 用户习惯了在执行安装或修改系统设置时输入密码，利用 AppleScript 弹出一个逼真的认证框，是获取明文密码最简单直接的方式。
```bash
osascript -e 'Tell application "System Events" to display dialog "System Update requires your password to continue:" default answer "" with hidden answer with title "Software Update"'
```
获取到密码后，即可通过 `sudo` 执行提权操作。

### 2.2 凭证存储：Keychain 提取
macOS 的 Keychain (钥匙串) 存储了用户的 Wi-Fi 密码、网站保存的密码、甚至 SSH 密钥。
*   如果红队已经通过上述方式拿到了用户的明文密码，可以使用 `security` 命令直接解锁 Keychain：
    ```bash
    security unlock-keychain -p "user_password" ~/Library/Keychains/login.keychain-db
    security dump-keychain -d ~/Library/Keychains/login.keychain-db
    ```
*   **高级提取 (Chainsaw)**：使用开源工具 Chainsaw 或类似脚本，在拥有 Root 权限的情况下，结合系统 API 批量提取加密凭证。

---

## 3. 高级持久化与隐蔽机制 (Persistence)

在 macOS 上维持权限，除了传统的向 `.bash_profile` 写入反弹 Shell，还有更多深入系统架构的驻留方式。

### 3.1 LaunchDaemons 与 LaunchAgents
这是 macOS 最标准的开机启动与守护进程管理机制，类似于 Linux 的 Systemd。
*   **LaunchAgents**：存储在 `~/Library/LaunchAgents`（用户级）或 `/Library/LaunchAgents`（系统级）。当用户登录时执行。
*   **LaunchDaemons**：存储在 `/Library/LaunchDaemons`。在系统启动时以 Root 权限在后台静默执行。

**实战构造**：
红队可以编写一个伪装成苹果系统服务的 `.plist` 配置文件（如 `com.apple.softwareupdate.plist`），指定 `ProgramArguments` 为恶意二进制文件的路径，并设置 `RunAtLoad` 和 `KeepAlive` 为 true，确保后门被杀后自动重启。
```bash
# 加载后门
launchctl load -w /Library/LaunchDaemons/com.apple.softwareupdate.plist
```

### 3.2 文件夹监控后门 (Folder Actions)
macOS 支持对特定文件夹的动作绑定（Folder Actions）。当某个文件夹发生变化（如有新文件放入）时，自动触发一段 AppleScript 或 Automator 工作流。
红队可以将后门绑定到用户常用的文件夹（如 `~/Downloads`）。用户只要下载了文件，就会无感触发 C2 的回连机制。

### 3.3 登录项劫持 (Login Items)
通过修改用户的登录项配置，使后门在用户每次打开电脑时启动。
对于高级隐蔽，红队不会直接添加恶意程序，而是利用**应用程序的包结构（App Bundle）**：修改某个合法常用软件（如微信、Chrome）内部的 `Info.plist` 或直接替换其内部的执行文件入口，将控制流劫持到后门，最后再调用回原程序，实现完美的“寄生”。

---

## 4. 总结

macOS 渗透测试是红队技术中相对小众但含金量极高的领域。
从应对严格的 TCC 授权沙盒，到利用 LaunchDaemons 实现系统级持久化，再到精妙的 AppleScript 钓鱼，macOS 红队实战要求攻击者不仅要精通 Unix/BSD 的底层机制，还要对苹果独有的 Mach-O 二进制格式、XNU 内核以及 Objective-C/Swift 运行生态有深入的理解。在高级对抗中，谁能更好地融入“苹果生态”，谁就能在蓝队的 EDR 雷达下隐匿于无形。