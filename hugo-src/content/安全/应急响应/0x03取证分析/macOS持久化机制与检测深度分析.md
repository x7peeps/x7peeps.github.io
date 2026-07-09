---
title: "macOS持久化机制与检测深度分析"
date: 2026-07-09T11:00:00+08:00
draft: false
weight: 660
description: "系统剖析macOS平台特有的持久化机制，涵盖LaunchDaemon与LaunchAgent全家桶、LoginItem与SMAppService、Profiles配置管理与MDM持久化、TCC数据库权限持久化、Gatekeeper绕过与ad-hoc签名、内核扩展与System Extension、crontab与at持久化，结合Santa/osquery/EndpointSecurity框架提供自动化检测方案"
categories: ["应急响应", "取证分析"]
tags: ["macOS", "LaunchDaemon", "LaunchAgent", "TCC", "Gatekeeper", "SMAppService", "Profiles", "Santa", "osquery", "MITRE ATT&CK"]
---

macOS 平台在企业环境中的占比逐年攀升，安全研究社区对 macOS 恶意软件的关注度也随之达到历史新高。与 Windows 平台上注册表 Run Key、WMI 事件订阅、Scheduled Tasks 等经典持久化向量不同，macOS 拥有一套完全独立的持久化基础设施——LaunchDaemon/LaunchAgent 体系、SMAppService API、Profiles 配置管理、TCC 权限数据库、Gatekeeper 信任链、System Extension 框架等。这些机制设计精良，权限边界清晰，但也正因为复杂度高，安全审计人员往往难以在应急响应的高压环境下快速识别全部持久化痕迹。

本文从蓝队取证视角出发，系统性地剖析 macOS 平台上已知的全部持久化机制，为每一种技术标注 MITRE ATT&CK 技术编号，给出具体的取证检查命令与检测脚本，并通过证据强度三级分类（🔴确认恶意 / 🟡高度可疑 / 🟢需要关注）帮助应急响应人员快速判断威胁等级。文中涵盖的案例均来自近年来公开披露的真实 macOS 恶意软件家族，包括 XCSSET、MacStealer、MacMa、OSX.FlashBack 等。

## 0x01 技术基础与 macOS 持久化概述

### macOS 安全架构全景

macOS 的安全架构以纵深防御（Defense in Depth）为核心设计理念，自内核层到用户态构建了多层安全机制：

| 安全机制 | 所在层级 | 核心功能 | 对持久化的影响 |
|---------|---------|---------|--------------|
| SIP (System Integrity Protection) | 内核 | 保护系统文件和进程不被修改 | 限制 /System、/usr（部分）、/bin、/sbin 的写入 |
| AMFI (Apple Mobile File Integrity) | 内核 | 强制代码签名验证 | 未签名二进制无法在受保护路径执行 |
| Gatekeeper | 用户态 | 应用来源验证与公证检查 | 未经公证的应用触发弹窗或阻止执行 |
| TCC | 用户态 | 隐私权限管理（屏幕录制、文件访问等） | TCC.db 被篡改可获取持久化权限 |
| XProtect | 用户态 | 内置恶意软件签名检测 | 基于签名的恶意软件检测 |
| Notarization | 云服务 | Apple 云端公证验证 | 未公证应用在 macOS 10.15+ 默认阻止 |
| System Extension | 用户态 | 替代内核扩展的安全框架 | 管理网络/端点安全扩展的注册与加载 |

### 持久化向量分类体系

macOS 持久化机制可按照其操作系统层级划分为以下几大类：

| 分类 | 对应 MITRE ATT&CK | 代表技术 | 权限要求 |
|------|-------------------|---------|---------|
| 启动代理/守护进程 | T1543.001 / T1543.004 | LaunchDaemon / LaunchAgent | root(系统级) / 用户级 |
| 登录项 | T1547.001 | LoginItem / SMAppService | 用户级 |
| 配置管理 | T1543.003 / T1556 | Profiles / MDM | root / 管理员 |
| 权限篡改 | T1546.014 | TCC.db 篡改 | root |
| 代码签名绕过 | T1553.001 / T1553.004 | Gatekeeper 绕过 / ad-hoc 签名 | 用户级 |
| 内核扩展 | T1547.006 | KEXT / System Extension | root |
| 定时任务 | T1053.003 | cron / at / launchctl timer | root / 用户级 |
| 环境变量 | T1574.006 | DYLD_INSERT_LIBRARIES | 用户级 |

### macOS 与 Windows/Linux 持久化对比

| 维度 | macOS | Windows | Linux |
|------|-------|---------|-------|
| 主要持久化载体 | plist → launchd | 注册表 Run Key | systemd unit / cron |
| 配置格式 | XML plist | 注册表二进制 | INI / TOML / YAML |
| 权限隔离 | 沙箱 + SIP + AMFI | Token + DEP + UAC | SELinux / AppArmor |
| 日志审计 | unified log (log show) | Event Log | journald / syslog |
| 代码签名 | codesign + Notarization | Authenticode + SmartScreen | GPG 签名 (弱) |
| 启动顺序 | launchd → LaunchDaemons → LaunchAgents | wininit → services → Run keys | init → systemd → cron |
| 检测工具 | osquery / Santa / EndpointSecurity | Sysmon / Autoruns | auditd / auditbeat |

### 取证检查清单

macOS 持久化取证应系统性地检查以下位置和文件：

```bash
ls -la /Library/LaunchDaemons/
ls -la /Library/LaunchAgents/
ls -la ~/Library/LaunchAgents/
ls -la /System/Library/LaunchDaemons/
ls -la /System/Library/LaunchAgents/
ls -la /Library/Preferences/
profiles list -type configuration
sqlite3 /Library/Application\ Support/com.apple.TCC/TCC.db "SELECT client,service,auth_value FROM access;"
spctl --status
csrutil status
kextstat | grep -v com.apple
crontab -l
atq
ls -la ~/Library/Application\ Support/com.apple.loginitems/
```


## 0x02 LaunchDaemon/LaunchAgent 持久化机制

### 技术背景

launchd 是 macOS 的 init 系统和服务管理框架，自 macOS 10.4 Tiger 起取代传统的 startup items 成为系统启动和进程管理的核心。攻击者对 launchd 体系的滥用是 macOS 平台最常见的持久化手段，对应 MITRE ATT&CK 技术 T1543.001（Launch Agent）和 T1543.004（Launch Daemon）。

### 系统级 vs 用户级

macOS 的 launchd 按照权限和作用域分为四个层级：

| 类型 | 路径 | 权限 | 运行时机 | MITRE ATT&CK |
|------|------|------|---------|-------------|
| System-wide Daemon | /Library/LaunchDaemons/ | root | 开机即启动，无需用户登录 | T1543.004 |
| System-wide Agent | /Library/LaunchAgents/ | 当前用户 | 用户登录后启动 | T1543.001 |
| User Agent | ~/Library/LaunchAgents/ | 当前用户 | 用户登录后启动 | T1543.001 |
| Apple System | /System/Library/LaunchDaemons/ | root | SIP 保护，无法篡改 | — |
| Apple Agent | /System/Library/LaunchAgents/ | 当前用户 | SIP 保护 | — |

攻击者通常优先选择 `/Library/LaunchDaemons/`（系统级持久化，需 root 权限）和 `~/Library/LaunchAgents/`（用户级持久化，无需提升权限）这两个位置。

### plist 格式深度解析

每个 LaunchDaemon/LaunchAgent 由一个 Property List (plist) 文件定义。恶意 plist 的关键字段分析如下：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.apple.updates</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Library/Application Support/.hidden/backdoor</string>
        <string>--daemon</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/.updates.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/.updates.err</string>
    <key>WorkingDirectory</key>
    <string>/Library/Application Support/.hidden</string>
</dict>
</plist>
```

**取证关注字段：**

| 字段 | 功能 | 恶意利用方式 |
|------|------|-------------|
| Label | 服务标识 | 伪装为合法名称（如 com.apple.xxx） |
| ProgramArguments | 执行的命令与参数 | 指向恶意二进制或脚本 |
| RunAtLoad | 加载后立即执行 | 确保开机自动运行 |
| KeepAlive | 进程退出后自动重启 | 持续保活，对抗 kill |
| StartInterval | 定时执行（秒） | 周期性执行恶意任务 |
| StartCalendarInterval | 日历时间触发 | 定时触发 |
| WatchPaths | 监控路径变化触发 | 文件变化触发执行 |
| EnvironmentVariables | 环境变量设置 | 注入 DYLD_INSERT_LIBRARIES |
| StandardOutPath | 标准输出重定向 | 隐藏输出到隐蔽位置 |

### 加载与卸载操作

```bash
launchctl load /Library/LaunchDaemons/com.malicious.plist
launchctl unload /Library/LaunchDaemons/com.malicious.plist
launchctl start com.malicious
launchctl stop com.malicious
launchctl list | grep -i suspicious
launchctl print system/com.malicious
launchctl print gui/$(id -u)/com.malicious
```

从 macOS 10.10+ 起，launchctl 引入了新的子命令语法：

```bash
launchctl bootstrap system/ /Library/LaunchDaemons/com.malicious.plist
launchctl bootout system/com.malicious
launchctl enable system/com.malicious
launchctl disable system/com.malicious
launchctl kickstart -k system/com.malicious
```

### 取证检查要点

```bash
echo "=== System Daemons ===" && ls -la /Library/LaunchDaemons/ && echo ""
echo "=== System Agents ===" && ls -la /Library/LaunchAgents/ && echo ""
echo "=== User Agents ===" && ls -la ~/Library/LaunchAgents/ && echo ""
echo "=== Loaded Services ===" && launchctl list 2>/dev/null | head -50
echo "=== Suspicious Labels ===" && launchctl list 2>/dev/null | grep -iE "(update|service|helper|agent|daemon)" | grep -v com.apple
```

**对比 Apple 合法 plist：**

```bash
plutil -p /Library/LaunchDaemons/com.apple.alf.agent.plist 2>/dev/null
diff <(plutil -p /Library/LaunchDaemons/com.apple.alf.agent.plist) \
     <(plutil -p /Library/LaunchDaemons/com.suspicious.plist)
```


## 0x03 LoginItem 与 SMAppService 持久化

### 传统 LoginItem 机制

LoginItem 是 macOS 上历史最悠久的用户级持久化机制之一，对应 MITRE ATT&CK T1547.001（Boot or Logon Autostart Execution: Registry Run Keys / Startup Folder）。传统 LoginItem 通过以下方式注册：

```bash
osascript -e 'tell application "System Events" to make login item at end with properties {path:"/Applications/Malicious.app", hidden:false}'
```

检查已注册的 LoginItem：

```bash
osascript -e 'tell application "System Events" to get the name of every login item'
ls -la ~/Library/Application\ Support/com.apple.loginitems/
plutil -p ~/Library/Preferences/com.apple.loginitems.plist 2>/dev/null
```

在 macOS Ventura 及更新版本中，LoginItem 的底层实现已迁移到 SMAppService 框架，旧的 `com.apple.loginitems.plist` 可能不再存在。

### SMAppService API 持久化

SMAppService 是 Apple 在 macOS 13 (Ventura) 引入的服务管理框架，旨在统一取代传统的 launchd plist 手动管理和旧版 LoginItem API。攻击者利用 SMAppService 注册持久化的关键 API 调用：

```swift
import ServiceManagement

func registerMaliciousService() {
    let service = SMAppService.loginItem(identifier: "com.malicious.helper")
    do {
        try service.register()
    } catch {
        print("Registration failed: \(error)")
    }
}
```

SMAppService 支持三种注册类型：

| 类型 | API | 权限要求 | 持久化效果 |
|------|-----|---------|-----------|
| loginItem(identifier:) | 用户级登录项 | 普通用户 | 用户登录时启动 |
| daemon(plistName:) | 系统级守护进程 | root | 系统启动时启动 |
| agent(plistName:) | 系统级代理 | root | 用户登录时启动 |

```bash
sfltool dumpbtm 2>/dev/null
ls -la /private/var/db/com.apple.backgroundtaskmanagement/
plutil -p /private/var/db/com.apple.backgroundtaskmanagement/*.plist 2>/dev/null
```

### 隐式 LoginItem（BackgroundItems）

macOS 的 Background Item（后台任务）机制允许应用在安装时自动注册后台运行权限，无需用户明确同意。这被多个恶意软件家族利用：

```bash
sfltool dumpbtm | grep -i "BundleIdentifier"
ls -la /private/var/db/com.apple.backgroundtaskmanagement/BackgroundItems-v4.btm
```

**取证检测方法：**

```bash
sfltool resetbtm 2>/dev/null
log show --predicate 'eventMessage contains "SMAppService"' --last 7d --style compact
log show --predicate 'process == "btmd"' --last 24h
```


## 0x04 Profiles 配置管理与 MDM 持久化

### .mobileconfig 安装机制

macOS 的 Profiles（描述文件）系统允许通过 `.mobileconfig` XML 文件向系统注入配置，包括 Wi-Fi、VPN、证书、约束策略等。攻击者可通过恶意描述文件实现持久化和权限控制，对应 MITRE ATT&CK T1556（Modify Authentication Process）。

恶意 .mobileconfig 的结构：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>PayloadType</key>
            <string>com.apple.loginwindow</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>PayloadIdentifier</key>
            <string>com.malicious.loginwindow</string>
            <key>com.apple.loginwindow.DisablePassword_autofill</key>
            <true/>
        </dict>
    </array>
    <key>PayloadDisplayName</key>
    <string>Enterprise Security Update</string>
    <key>PayloadIdentifier</key>
    <string>com.malicious.profile</string>
    <key>PayloadOrganization</key>
    <string>Apple Inc.</string>
    <key>PayloadRemovalDisallowed</key>
    <true/>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>12345678-1234-1234-1234-123456789012</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
</dict>
</plist>
```

### MDM 持久化

通过 MDM（Mobile Device Management）可以远程推送配置描述文件和管理命令。合法的 MDM 安装通常通过 Apple Business Manager 或设备注册程序（DEP/ABM）完成，但攻击者可通过以下方式建立 MDM 持久化：

```bash
profiles show -type configuration
profiles list -type all
profiles list -output stdout-xml
```

**检查 MDM 管理状态：**

```bash
profiles status -type enrollment
profiles show -type enrollment
defaults read /Library/Preferences/com.apple.MCX 2>/dev/null
```

### 恶意 Profile 检测

```bash
profiles list -type configuration -output stdout-xml | \
    plutil -p - 2>/dev/null

profiles show -type configuration 2>&1 | \
    grep -A5 "PayloadIdentifier\|PayloadDisplayName\|PayloadOrganization"
```

**可疑特征判断：**

| 特征 | 风险等级 | 说明 |
|------|---------|------|
| PayloadRemovalDisallowed = true | 🔴 | 禁止用户删除 |
| PayloadOrganization 伪装为 Apple | 🔴 | 冒充合法组织 |
| 禁用安全功能的 payload | 🔴 | 如关闭 SIP、Gatekeeper |
| VPN payload 指向外部服务器 | 🟡 | 可能用于流量劫持 |
| 证书 payload 安装根证书 | 🟡 | 可用于中间人攻击 |
| 合法企业管理配置 | 🟢 | 需与 IT 确认 |


## 0x05 TCC 数据库与权限持久化

### TCC 机制概述

TCC（Transparency, Consent, Control）是 macOS 的隐私权限管理框架，控制应用对敏感资源（屏幕录制、摄像头、麦克风、文件系统、辅助功能等）的访问。TCC 权限数据存储在 SQLite 数据库 TCC.db 中，对应 MITRE ATT&CK T1546.014（Event Triggered Execution: Accessibility Settings）。

**TCC.db 存储位置：**

| 位置 | 作用域 | 权限要求 |
|------|-------|---------|
| ~/Library/Application Support/com.apple.TCC/TCC.db | 用户级 | 普通用户 |
| /Library/Application Support/com.apple.TCC/TCC.db | 系统级 | root |

### TCC.db 篡改

攻击者获取 root 权限后，可直接修改 TCC.db 为恶意应用授予敏感权限：

```bash
sqlite3 /Library/Application\ Support/com.apple.TCC/TCC.db \
    "INSERT INTO access (client,service,auth_value,auth_reason,auth_version,indirect_object_identifier_type,indirect_object_identifier,flags,system_version) \
    VALUES ('/Library/Application Support/.malicious/app','kTCCServiceAccessibility',2,0,1,0,'UNUSED',0,'23.0.0');"
```

**检查 TCC 数据库中的异常授权：**

```bash
sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db \
    "SELECT client, service, auth_value, auth_reason FROM access WHERE auth_value=2 ORDER BY client;"

sqlite3 /Library/Application\ Support/com.apple.TCC/TCC.db \
    "SELECT client, service, auth_value FROM access WHERE auth_value=2 AND client NOT LIKE '%com.apple%';"
```

### Full Disk Access 滥用

Full Disk Access 是 macOS 中最高级别的文件系统访问权限。获得此权限的应用可以绕过 TCC 保护，访问所有用户文件：

```bash
sqlite3 "/Library/Application Support/com.apple.TCC/TCC.db" \
    "SELECT client, service, auth_value FROM access WHERE service='kTCCServiceSystemPolicyAllFiles';"

sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db \
    "SELECT client, service, auth_value FROM access WHERE service='kTCCServiceSystemPolicyAllFiles';"
```

### Accessibility 权限滥用

辅助功能权限允许应用控制其他应用的 UI，是信息窃取和键盘记录的理想载体：

```bash
sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db \
    "SELECT client, service, auth_value FROM access WHERE service='kTCCServiceAccessibility';"
```

**TCC 权限对照表：**

| TCC Service | 功能 | 风险 |
|------------|------|------|
| kTCCServiceAccessibility | 辅助功能控制 | 键盘记录、屏幕操作 |
| kTCCServiceSystemPolicyAllFiles | 完全磁盘访问 | 绕过所有文件保护 |
| kTCCServiceScreenCapture | 屏幕录制 | 远程监控 |
| kTCCServiceCamera | 摄像头 | 视频窃取 |
| kTCCServiceMicrophone | 麦克风 | 音频窃取 |
| kTCCServiceSystemPolicyDocumentsFolder | 文档文件夹访问 | 数据窃取 |
| kTCCServiceSystemPolicyDesktopFolder | 桌面文件夹访问 | 数据窃取 |
| kTCCServiceSystemPolicyDownloadsFolder | 下载文件夹访问 | 数据窃取 |
| kTCCServicePostEvent | 输入监听 | 键盘记录 |
| kTCCServiceListenEvent | 事件监听 | 键盘记录 |
| kTCCServiceDeveloperTool | 开发者工具 | 调试器注入 |

### TCC 保护机制与绕过

macOS Ventura 引入了更强的 TCC 保护，阻止直接数据库修改：

```bash
tccutil reset Accessibility
tccutil reset ScreenCapture
log show --predicate 'subsystem == "com.apple.TCC"' --last 24h
log show --predicate 'eventMessage contains "TCC"' --last 1h --style compact
```

**TCC 篡改检测：**

```bash
for db in ~/Library/Application\ Support/com.apple.TCC/TCC.db \
          /Library/Application\ Support/com.apple.TCC/TCC.db; do
    if [ -f "$db" ]; then
        echo "Checking: $db"
        stat -f "%Sm %Su" "$db"
        sqlite3 "$db" "SELECT client, service, auth_value FROM access WHERE auth_value=2;" 2>/dev/null
    fi
done
```


## 0x06 Gatekeeper 绕过与代码签名伪造

### Gatekeeper 信任模型

Gatekeeper 是 macOS 的应用执行控制机制，负责验证应用的来源和完整性。其信任链如下：

```mermaid
graph LR
    A[开发者证书] --> B[Apple Notarization]
    B --> C[Stapled Ticket]
    C --> D[Gatekeeper 验证]
    D --> E[应用执行]
```

| 信任级别 | 说明 | Gatekeeper 行为 |
|---------|------|----------------|
| Apple 签名 + 公证 | Apple 官方应用 | 直接执行 |
| 开发者签名 + 公证 | 第三方已公证应用 | 直接执行 |
| 开发者签名，未公证 | 自签名应用 | 弹窗警告 |
| ad-hoc 签名 | 本地签名 | 弹窗警告 |
| 无签名 | 未签名应用 | 默认阻止 |

对应 MITRE ATT&CK T1553.001（Subvert Trust Controls: Gatekeeper Bypass）。

### ad-hoc 签名伪造

ad-hoc 签名是最简单的代码签名伪造方式，不需要开发者证书：

```bash
codesign --force --deep --sign - /Applications/Suspicious.app
codesign -dv --verbose=4 /Applications/Suspicious.app
spctl --assess --verbose /Applications/Suspicious.app
```

**Gatekeeper 检查命令：**

```bash
spctl --status
spctl --assess --type execute --verbose /path/to/binary
spctl --assess --type execute --verbose --ignore-cache /path/to/binary
```

### xattr 移除绕过

macOS 使用扩展属性（extended attributes）标记下载来源，Gatekeeper 通过 `com.apple.quarantine` 属性判断是否需要验证：

```bash
xattr -l /Applications/Downloaded.app
xattr -p com.apple.quarantine /Applications/Downloaded.app
xattr -d com.apple.quarantine /Applications/Downloaded.app
xattr -cr /Applications/Downloaded.app
```

**取证检查：**

```bash
find /Applications -name "*.app" -exec xattr -l {} \; 2>/dev/null | grep -B5 "com.apple.quarantine"
find ~/Downloads -type f -exec xattr -l {} \; 2>/dev/null | head -50
```

### notarization 绕过技术

从 macOS 10.15 (Catalina) 起，未经过 Apple Notarization 的应用默认被阻止。绕过方法包括：

| 绕过技术 | 命令 | 风险等级 |
|---------|------|---------|
| spctl 禁用 | `sudo spctl --master-disable` | 🔴 系统级全局禁用 |
| 个案豁免 | `sudo spctl --add --label "Approved" /path/to/app` | 🟡 针对性豁免 |
| xattr 移除 | `xattr -d com.apple.quarantine /path/to/app` | 🟡 移除隔离标记 |
| 嵌入签名 | 利用已签名框架加载未签名 payload | 🟡 进程注入 |

```bash
spctl --master-disable
spctl --master-enable
spctl --list --type execute 2>/dev/null | head -20
```

**Gatekeeper 状态检测：**

```bash
csrutil status
spctl --status
log show --predicate 'process == "syspolicyd"' --last 24h --style compact | \
    grep -i "reject\|deny\|block" | head -20
```


## 0x07 内核扩展与 System Extension 持久化

### KEXT 加载机制

内核扩展（Kernel Extension，KEXT）是 macOS 最底层的代码执行机制，对应 MITRE ATT&CK T1547.006（Kernel Modules and Extensions）。KEXT 以 root 权限运行在内核空间，具有完全的系统控制能力。

```bash
kextstat | grep -v com.apple
kextstat -l | grep -v "com.apple"
systemextensionsctl list 2>/dev/null
```

**KEXT 加载位置：**

| 路径 | 说明 |
|------|------|
| /Library/Extensions/ | 第三方 KEXT |
| /System/Library/Extensions/ | Apple 系统 KEXT (SIP 保护) |
| /Library/Application Support/KEXT/ | 第三方 KEXT 备选 |

```bash
ls -la /Library/Extensions/
kmutil log show --filter subsystem == "com.apple.kext" 2>/dev/null | head -30
kmutil dumpstate 2>/dev/null | head -50
```

### System Extension 框架

从 macOS 10.15 (Catalina) 起，Apple 推出 System Extension 框架以取代 KEXT。System Extension 运行在用户态，具有更强的安全隔离：

| 扩展类型 | 框架 | 功能 | 代表产品 |
|---------|------|------|---------|
| Network Extension | NEFilterProvider | 网络过滤 | 防火墙、DLP |
| Endpoint Security | EndpointSecurity | 进程监控 | EDR、AV |
| DriverKit Extension | DriverKit | 设备驱动 | 外设驱动 |

```bash
systemextensionsctl list 2>/dev/null
systemextensionsctl uninstall <team-id> <extension-id>
log show --predicate 'subsystem == "com.apple.system-extension"' --last 7d
```

### DriverKit 持久化

DriverKit 是 Apple 推出的用户态驱动框架，用于替代内核驱动。恶意 DriverKit 扩展的检测：

```bash
systemextensionsctl list 2>&1
log show --predicate 'subsystem == "com.apple.DriverKit"' --last 7d
ls -la /Library/SystemExtensions/
```

**内核扩展检测对比：**

| 检测维度 | KEXT | System Extension | DriverKit |
|---------|------|-------------------|-----------|
| 运行层级 | 内核态 | 用户态 | 用户态 |
| 权限范围 | 内核级 | 受限 | 受限 |
| SIP 保护 | 强（10.13+） | 需用户授权 | 需用户授权 |
| 检测命令 | kextstat | systemextensionsctl | systemextensionsctl |
| 日志来源 | kernel | unified log | unified log |
| 恶意利用难度 | 高 | 中 | 中 |


## 0x08 crontab/launchctl/定时任务持久化

### cron 持久化

macOS 保留了传统的 cron 定时任务机制，对应 MITRE ATT&CK T1053.003（Scheduled Task/Job: Cron）。

**crontab 持久化：**

```bash
crontab -l
crontab -e
echo "*/5 * * * * /Library/Application Support/.hidden/backdoor.sh" | crontab -
```

**系统级 cron 检查：**

```bash
ls -la /var/at/tabs/
cat /var/at/tabs/*
cat /etc/crontab
ls -la /etc/cron.*
```

### at 持久化

`at` 命令用于一次性定时执行任务，对应 MITRE ATT&CK T1053.002（Scheduled Task/Job: At）：

```bash
atq
atrm 1
echo "/Library/Application Support/.hidden/payload.sh" | at now + 5 minutes
```

### periodic 持久化

macOS 的 periodic 系统用于定期执行维护任务：

```bash
ls -la /etc/periodic/
ls -la /etc/periodic/daily/
ls -la /etc/periodic/weekly/
ls -la /etc/periodic/monthly/
cat /etc/periodic/daily/*
```

### launchctl timer 持久化

launchd 的定时执行功能可作为 cron 的替代方案：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.apple.periodic.maintenance</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Library/Application Support/.hidden/payload</string>
    </array>
    <key>StartInterval</key>
    <integer>3600</integer>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
```

**定时任务持久化对比：**

| 机制 | 文件位置 | 权限 | 隐蔽性 | 检测方法 |
|------|---------|------|-------|---------|
| crontab | /var/at/tabs/ | root/用户 | 低 | `crontab -l` |
| at | /var/at/jobs/ | root | 低 | `atq` |
| periodic | /etc/periodic/ | root | 中 | 检查目录 |
| launchd timer | plist 文件 | root/用户 | 中 | `launchctl list` |
| SMAppService | 系统框架 | 用户/系统 | 高 | `sfltool dumpbtm` |

**全面定时任务扫描：**

```bash
echo "=== User crontab ===" && crontab -l 2>/dev/null
echo "=== System crontab ===" && cat /etc/crontab 2>/dev/null
echo "=== at jobs ===" && atq 2>/dev/null
echo "=== periodic ===" && find /etc/periodic -type f -exec ls -la {} \;
echo "=== launchd timers ===" && launchctl list 2>/dev/null | grep -v "com.apple"
echo "=== login items ===" && osascript -e 'tell application "System Events" to get name of every login item' 2>/dev/null
```


## 0x09 证据强度分层与案例关联

### 三级证据分类标准

在 macOS 持久化取证分析中，根据证据的恶意确定性将发现分为三个层级：

| 等级 | 含义 | 判断标准 | 响应时效 |
|------|------|---------|---------|
| 🔴 确认恶意 | 有明确恶意意图的证据 | 已知恶意软件特征、无可解释的权限请求 | 立即响应 |
| 🟡 高度可疑 | 强烈暗示恶意但需进一步验证 | 异常路径、伪装名称、未授权安装 | 24小时内 |
| 🟢 需要关注 | 可能正常但需结合上下文判断 | 合法应用的异常配置、旧版本残留 | 计划审计 |

### LaunchDaemon/LaunchAgent 证据强度

| 发现 | 等级 | 判定依据 |
|------|------|---------|
| plist 指向 /tmp/、/dev/shm/ 等临时目录的可执行文件 | 🔴 | 恶意软件典型落脚点 |
| Label 伪装为 com.apple.xxx 但非 Apple 官方 | 🔴 | 明确的欺骗意图 |
| ProgramArguments 包含 base64 解码管道 | 🔴 | 经典混淆执行手法 |
| plist 指向 ~/Library/ 中未识别的二进制 | 🟡 | 需进一步分析二进制 |
| KeepAlive=true 且二进制无签名 | 🟡 | 持续保活 + 无签名 = 可疑 |
| 合法应用的标准 plist 配置 | 🟢 | 需与厂商文档交叉验证 |

### TCC 权限证据强度

| 发现 | 等级 | 判定依据 |
|------|------|---------|
| 非 Apple 进程获得 Full Disk Access | 🔴 | 极高权限，需立即审计 |
| 已卸载应用仍保留在 TCC.db 中 | 🟡 | 可能是残留或篡改 |
| /Library 级别 TCC.db 被修改 | 🔴 | 需 root 权限，高度可疑 |
| 开发者工具获得 Accessibility 权限 | 🟡 | 功能合理但需审查 |

### Profiles 证据强度

| 发现 | 等级 | 判定依据 |
|------|------|---------|
| 无法删除的描述文件（PayloadRemovalDisallowed=true） | 🔴 | 强制驻留意图 |
| 伪装为 Apple 组织的 MDM 注册 | 🔴 | 冒充合法管理 |
| VPN profile 指向非常规 IP/域名 | 🟡 | 可能用于 C2 通信 |
| 证书 profile 安装了自签名根 CA | 🟡 | 中间人攻击前置 |

### 其他持久化证据强度

| 发现 | 等级 | 判定依据 |
|------|------|---------|
| DYLD_INSERT_LIBRARIES 环境变量指向未知 dylib | 🔴 | 经典库注入手法 |
| Gatekeeper 被全局禁用（spctl --master-disable） | 🔴 | 安全控制移除 |
| 第三方 KEXT 已加载 | 🟡 | 需确认 KEXT 来源 |
| /etc/periodic/ 中出现非标准脚本 | 🟡 | 可能用于定时执行 |
| ad-hoc 签名的后台应用 | 🟡 | 无正式签名 + 后台运行 |
| loginitems.db 中出现未识别条目 | 🟡 | SMAppService 持久化 |
| SIP 状态为 disabled | 🔴 | 系统完整性保护被禁用 |


## 0x0A 自动化检测与狩猎

### osquery SQL 检测规则

osquery 是 Facebook 开源的跨平台系统检测工具，支持 SQL 语法查询操作系统状态。以下规则覆盖 macOS 持久化的关键检测点：

**LaunchDaemon 异常检测：**

```sql
SELECT path, name, username, groupname, mode, atime, mtime, ctime,
       CASE
           WHEN path LIKE '/Library/LaunchDaemons/%' THEN 'system_daemon'
           WHEN path LIKE '/Library/LaunchAgents/%' THEN 'system_agent'
           WHEN path LIKE '%/Library/LaunchAgents/%' THEN 'user_agent'
           ELSE 'unknown'
       END as persistence_type
FROM file
WHERE (path LIKE '/Library/LaunchDaemons/%'
    OR path LIKE '/Library/LaunchAgents/%'
    OR path LIKE '%/Library/LaunchAgents/%')
  AND path NOT LIKE '/System/Library/%'
  AND name LIKE '%.plist'
ORDER BY mtime DESC;
```

**已加载内核扩展检测：**

```sql
SELECT kext_path, kext_id, kext_version, kext_daemon
FROM kernel_extensions
WHERE kext_path NOT LIKE '%com.apple.%'
  AND kext_path NOT LIKE '%/System/Library/%';
```

**cron 任务检测：**

```sql
SELECT username, event, command, minutes, hours, day_of_month, month, day_of_week
FROM crontab;
```

**System Extension 检测：**

```sql
SELECT identifier, name, version, path, category
FROM system_extensions
WHERE identifier NOT LIKE 'com.apple.%';
```

**TCC 权限异常检测：**

```sql
SELECT client, service, auth_value,
       CASE auth_value
           WHEN 0 THEN 'denied'
           WHEN 1 THEN 'not_determined'
           WHEN 2 THEN 'allowed'
       END as status
FROM access
WHERE auth_value = 2
  AND client NOT LIKE 'com.apple.%'
  AND client NOT LIKE '%/usr/libexec/%';
```

### Bash 自动化狩猎脚本

```bash
#!/bin/bash
echo "=========================================="
echo "  macOS Persistence Hunter v1.0"
echo "=========================================="

echo "[*] Checking LaunchDaemons..."
ls -la /Library/LaunchDaemons/ 2>/dev/null | grep -v "^total"

echo "[*] Checking LaunchAgents..."
ls -la /Library/LaunchAgents/ 2>/dev/null | grep -v "^total"
ls -la ~/Library/LaunchAgents/ 2>/dev/null | grep -v "^total"

echo "[*] Checking loaded services for persistence..."
launchctl list 2>/dev/null | grep -v "com.apple" | grep -v "^\s*$"

echo "[*] Checking SIP status..."
csrutil status 2>/dev/null

echo "[*] Checking Gatekeeper status..."
spctl --status 2>/dev/null

echo "[*] Checking for ad-hoc signed binaries in applications..."
find /Applications -name "*.app" -exec sh -c '
    for app; do
        sig=$(codesign -dv "$app" 2>&1 | grep "Signature=")
        if echo "$sig" | grep -q "adhoc"; then
            echo "[!] Ad-hoc signed: $app"
        fi
    done
' sh {} + 2>/dev/null

echo "[*] Checking TCC.db for non-Apple Full Disk Access..."
sqlite3 "/Library/Application Support/com.apple.TCC/TCC.db" \
    "SELECT client, service, auth_value FROM access WHERE auth_value=2 AND service='kTCCServiceSystemPolicyAllFiles' AND client NOT LIKE 'com.apple.%';" 2>/dev/null

echo "[*] Checking for suspicious cron entries..."
crontab -l 2>/dev/null | grep -v "^#" | grep -v "^$"
cat /etc/crontab 2>/dev/null | grep -v "^#" | grep -v "^$"

echo "[*] Checking periodic scripts..."
find /etc/periodic -type f ! -name "README" 2>/dev/null

echo "[*] Checking System Extensions..."
systemextensionsctl list 2>/dev/null | grep -v "com.apple"

echo "[*] Checking KEXTs..."
kextstat 2>/dev/null | grep -v "com.apple"

echo "[*] Checking login items..."
osascript -e 'tell application "System Events" to get name of every login item' 2>/dev/null

echo "[*] Checking DYLD_INSERT_LIBRARIES..."
defaults read .GlobalPreferences 2>/dev/null | grep -i "dyld"
env | grep -i "dyld"
launchctl print system/ 2>/dev/null | grep -i "DYLD"

echo "[*] Checking Profiles..."
profiles list -type configuration 2>/dev/null

echo "[*] Checking BTM (Background Task Management)..."
sfltool dumpbtm 2>/dev/null | head -50

echo ""
echo "=========================================="
echo "  Scan complete. Review findings above."
echo "=========================================="
```

### Python 自动化检测脚本

```python
#!/usr/bin/env python3
import os
import subprocess
import sqlite3
import plistlib
import json
from pathlib import Path

class MacPersistenceScanner:
    def __init__(self):
        self.findings = []
        self.persistence_paths = {
            "system_daemon": "/Library/LaunchDaemons/",
            "system_agent": "/Library/LaunchAgents/",
            "user_agent": str(Path.home() / "Library/LaunchAgents/"),
        }

    def scan_launchd(self):
        results = []
        for ptype, path in self.persistence_paths.items():
            if not os.path.exists(path):
                continue
            for f in os.listdir(path):
                if not f.endswith(".plist"):
                    continue
                full_path = os.path.join(path, f)
                try:
                    with open(full_path, "rb") as fp:
                        plist_data = plistlib.load(fp)
                    label = plist_data.get("Label", "unknown")
                    program = plist_data.get("ProgramArguments", [])
                    run_at_load = plist_data.get("RunAtLoad", False)
                    keep_alive = plist_data.get("KeepAlive", False)
                    risk = "low"
                    if any(t in full_path for t in ["/tmp/", "/dev/"]):
                        risk = "critical"
                    elif keep_alive and not any(app in label for app in ["com.apple."]):
                        risk = "high"
                    elif program and not any(app in program[0] if program else "" for app in ["/usr/", "/bin/", "/sbin/", "/System/"]):
                        risk = "medium"
                    results.append({
                        "type": ptype,
                        "path": full_path,
                        "label": label,
                        "program": program,
                        "RunAtLoad": run_at_load,
                        "KeepAlive": keep_alive,
                        "risk": risk,
                    })
                except Exception as e:
                    results.append({"type": ptype, "path": full_path, "error": str(e)})
        return results

    def scan_tcc(self):
        results = []
        db_paths = [
            "/Library/Application Support/com.apple.TCC/TCC.db",
            str(Path.home() / "Library/Application Support/com.apple.TCC/TCC.db"),
        ]
        high_risk_services = [
            "kTCCServiceSystemPolicyAllFiles",
            "kTCCServiceAccessibility",
            "kTCCServiceScreenCapture",
        ]
        for db_path in db_paths:
            if not os.path.exists(db_path):
                continue
            try:
                conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT client, service, auth_value FROM access WHERE auth_value=2"
                )
                for client, service, auth_value in cursor.fetchall():
                    is_apple = "com.apple" in client or "/usr/libexec/" in client
                    risk = "normal" if is_apple else "high"
                    if service in high_risk_services and not is_apple:
                        risk = "critical"
                    results.append({
                        "db": db_path,
                        "client": client,
                        "service": service,
                        "risk": risk,
                    })
                conn.close()
            except Exception as e:
                results.append({"db": db_path, "error": str(e)})
        return results

    def scan_gatekeeper(self):
        results = []
        try:
            output = subprocess.check_output(
                ["spctl", "--status"], text=True, stderr=subprocess.DEVNULL
            ).strip()
            if "assessments disabled" in output.lower():
                results.append({"check": "gatekeeper", "status": "disabled", "risk": "critical"})
            else:
                results.append({"check": "gatekeeper", "status": "enabled", "risk": "normal"})
        except Exception:
            results.append({"check": "gatekeeper", "status": "unknown"})
        try:
            output = subprocess.check_output(
                ["csrutil", "status"], text=True, stderr=subprocess.DEVNULL
            ).strip()
            if "disabled" in output.lower():
                results.append({"check": "sip", "status": "disabled", "risk": "critical"})
            else:
                results.append({"check": "sip", "status": "enabled", "risk": "normal"})
        except Exception:
            results.append({"check": "sip", "status": "unknown"})
        return results

    def scan_cron(self):
        results = []
        try:
            output = subprocess.check_output(["crontab", "-l"], text=True, stderr=subprocess.DEVNULL)
            for line in output.strip().split("\n"):
                line = line.strip()
                if line and not line.startswith("#"):
                    risk = "high" if "/tmp/" in line or "/dev/" in line else "medium"
                    results.append({"type": "user_cron", "entry": line, "risk": risk})
        except Exception:
            pass
        try:
            with open("/etc/crontab", "r") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#"):
                        results.append({"type": "system_cron", "entry": line, "risk": "high"})
        except Exception:
            pass
        return results

    def scan_kexts(self):
        results = []
        try:
            output = subprocess.check_output(
                ["kextstat"], text=True, stderr=subprocess.DEVNULL
            )
            for line in output.strip().split("\n"):
                if "com.apple" not in line and "index" not in line:
                    results.append({"type": "third_party_kext", "entry": line.strip(), "risk": "medium"})
        except Exception:
            pass
        return results

    def scan_profiles(self):
        results = []
        try:
            output = subprocess.check_output(
                ["profiles", "list", "-type", "configuration"],
                text=True,
                stderr=subprocess.DEVNULL,
            )
            for line in output.strip().split("\n"):
                if "Identifier:" in line or "Name:" in line:
                    is_apple = "com.apple" in line.lower()
                    risk = "normal" if is_apple else "medium"
                    results.append({"type": "profile", "entry": line.strip(), "risk": risk})
        except Exception:
            pass
        return results

    def run_full_scan(self):
        report = {
            "launchd": self.scan_launchd(),
            "tcc": self.scan_tcc(),
            "gatekeeper": self.scan_gatekeeper(),
            "cron": self.scan_cron(),
            "kexts": self.scan_kexts(),
            "profiles": self.scan_profiles(),
        }
        return report

    def print_report(self, report):
        risk_emoji = {"critical": "🔴", "high": "🟡", "medium": "🟡", "low": "🟢", "normal": "🟢"}
        print("=" * 60)
        print("  macOS Persistence Scan Report")
        print("=" * 60)
        for category, findings in report.items():
            print(f"\n--- {category.upper()} ---")
            if not findings:
                print("  No findings.")
                continue
            for finding in findings:
                risk = finding.get("risk", "normal")
                emoji = risk_emoji.get(risk, "⚪")
                if "error" in finding:
                    print(f"  ⚪ {finding.get('path', finding.get('db', 'unknown'))}: {finding['error']}")
                else:
                    label = finding.get("label", finding.get("client", finding.get("entry", finding.get("status", "unknown"))))
                    path_info = finding.get("path", finding.get("db", ""))
                    print(f"  {emoji} [{risk.upper()}] {label}")
                    if path_info:
                        print(f"       Path: {path_info}")
                    if "program" in finding and finding["program"]:
                        print(f"       Program: {' '.join(finding['program'])}")

if __name__ == "__main__":
    scanner = MacPersistenceScanner()
    report = scanner.run_full_scan()
    scanner.print_report(report)
    json_path = "/tmp/mac_persistence_scan.json"
    with open(json_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\n[*] JSON report saved to: {json_path}")
```

### Santa 规则示例

Santa 是 Google 开源的 macOS 二进制白名单/黑名单控制系统，可作为 Gatekeeper 的增强：

```bash
sudo santactl rule list
sudo santactl rule add --path /Library/Application Support/.hidden/backdoor --decision block --reason "Detected during incident response"
sudo santactl rule add --path /Applications/Suspicious.app --decision block --reason "Ad-hoc signed, unknown origin"
```

**Santa 检测配置：**

```bash
defaults read com.google.santa 2>/dev/null
cat /var/db/santa/rules.db 2>/dev/null
log show --predicate 'subsystem == "com.google.santa"' --last 24h | \
    grep -i "block\|deny" | head -20
```


## 0x0B 公开案例分析

### 案例一：XCSSET 供应链持久化攻击

**背景：**
XCSSET 是一种针对 macOS 开发者的供应链攻击恶意软件，于 2021 年由 Trend Micro 首次披露。该恶意软件通过感染 Xcode 项目的构建脚本（`Run Script` Build Phases）实现持久化和传播，影响了大量 iOS/macOS 开发者。

**攻击链描述：**

1. **初始投递**：通过恶意 Xcode 项目仓库（或 Git submodule 投毒）传播，开发者克隆项目后在 Xcode 构建时触发
2. **持久化建立**：
   - 注入恶意代码到 Xcode 项目的 Build Phases → Run Script 中，每次构建自动执行
   - 创建 LaunchAgent 实现用户级持久化
   - 利用 TCC 权限请求屏幕录制和辅助功能权限
3. **横向移动与数据窃取**：
   - 窃取浏览器 Cookie 和密码（Safari、Chrome）
   - 窃取加密货币钱包数据
   - 窃取 iMessage 数据
4. **高级能力**：
   - 利用 0day 漏洞绕过 Gatekeeper
   - 通过 TCC.db 篡改获取权限
   - 向其他 Xcode 项目注入恶意构建脚本

**取证发现：**

```bash
# 检查 LaunchAgent
ls -la ~/Library/LaunchAgents/
cat ~/Library/LaunchAgents/com.apple.xcs.listener.plist

# 检查 Xcode 项目文件
grep -r "Run Script" ~/Library/Developer/Xcode/DerivedData/
find ~ -name "*.xcodeproj" -exec grep -l "malicious_script" {} \;

# 检查 TCC 权限
sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db \
    "SELECT client, service FROM access WHERE auth_value=2;"
```

**IOC：**

| 指标 | 值 |
|------|-----|
| LaunchAgent | com.apple.xcs.listener.plist |
| LaunchAgent Label | com.apple.xcs.helper |
| 恶意脚本特征 | `osascript -e 'tell application "Terminal"'` |
| 域名 | `dohot[.]xyz`、`hoxx[.]xyz` |
| 文件特征 | 嵌入 base64 编码的 AppleScript payload |

**经验教训：**
- 供应链攻击绕过了传统恶意软件检测，因为恶意代码来自开发者信任的构建流程
- macOS 开发者应审计所有 Xcode 项目的 Run Script Build Phases
- 构建环境应与生产环境隔离，使用 CI/CD 白名单机制

### 案例二：MacStealer 信息窃取器

**背景：**
MacStealer 于 2023 年被 Uptycs 安全团队发现，是一种用 Rust 编写的 macOS 信息窃取恶意软件。该恶意软件通过虚假的 DMG 安装包传播，针对 macOS Ventura (13.x) 及更新版本，采用 Gatekeeper 绕过技术实现执行。

**攻击链描述：**

1. **初始投递**：通过伪造的加密货币或 VPN 应用 DMG 文件传播，伪装为合法应用安装器
2. **Gatekeeper 绕过**：
   - 应用使用 ad-hoc 签名
   - 安装提示移除 `com.apple.quarantine` xattr
   - 或利用已签名的父进程加载未签名 payload
3. **持久化建立**：
   - 注册 LaunchAgent 实现自动启动
   - 请求 Accessibility 权限实现键盘记录
   - 请求 Full Disk Access 实现文件窃取
4. **数据窃取**：
   - 窃取 Chrome、Firefox、Safari 浏览器密码和 Cookie
   - 窃取 MetaMask 等加密货币钱包文件
   - 窃取 iCloud Keychain 数据
   - 捕获屏幕截图
5. **C2 通信**：通过 HTTP POST 将窃取数据发送至 C2 服务器

**取证发现：**

```bash
# 检查 LaunchAgent
ls -la ~/Library/LaunchAgents/
cat ~/Library/LaunchAgents/com.apple.xcs.helper.plist 2>/dev/null

# 检查 DMG 挂载历史
log show --predicate 'eventMessage contains "hdiutil"' --last 30d

# 检查浏览器数据访问
sqlite3 ~/Library/Application\ Support/Google/Chrome/Default/Cookies \
    "SELECT count(*) FROM cookies;" 2>/dev/null

# 检查 xattr 移除记录
log show --predicate 'eventMessage contains "xattr"' --last 7d
```

**IOC：**

| 指标 | 值 |
|------|-----|
| LaunchAgent | com.apple.xcs.helper.plist、com.apple.update.plist |
| 恶意二进制路径 | ~/Library/Application Support/.DS_Store/ |
| C2 域名 | `stealer[.]monster`、`api.stealer[.]monster` |
| 浏览器窃取路径 | ~/Library/Application Support/{Chrome,Firefox,Safari}/ |
| 钱包文件 | ~/Library/Application Support/MetaMask/ |
| 文件特征 | Mach-O 64-bit x86_64，ad-hoc 签名 |

**经验教训：**
- ad-hoc 签名的 DMG 应触发组织级安全策略阻断
- 禁止用户自行绕过 Gatekeeper（通过 MDM 策略禁止 `spctl --master-disable`）
- 浏览器密码和加密货币钱包文件是 macOS 信息窃取器的首要目标

### 案例三：OSX.FlashBack (Flashback) 后门

**背景：**
OSX.FlashBack 于 2012 年爆发，是 macOS 历史上感染规模最大的恶意软件之一，据估计感染了超过 60 万台 Mac。该恶意软件利用 Java 漏洞（CVE-2012-0507）进行水坑攻击传播。

**攻击链描述：**

1. **初始投递**：通过水坑网站植入 Java Applet exploit，利用 Java 序列化漏洞执行 shellcode
2. **持久化建立**：
   - 通过 DYLD_INSERT_LIBRARIES 注入到系统进程中
   - 创建 /Library/LaunchDaemons/ 下的 plist 实现系统级持久化
   - 修改 /etc/launchd.conf 添加启动参数
3. **C2 通信**：通过 HTTP 与 C2 服务器通信，获取搜索引擎注入规则和窃取数据
4. **信息窃取**：截获搜索引擎查询，注入推广链接

**取证发现：**

```bash
# 检查 DYLD 注入
defaults read .GlobalPreferences 2>/dev/null | grep -i dyld
launchctl print system/ 2>/dev/null | grep -i "DYLD"

# 检查 /etc/launchd.conf（已废弃但可残留）
cat /etc/launchd.conf 2>/dev/null

# 检查异常 LaunchDaemon
ls -la /Library/LaunchDaemons/
plutil -p /Library/LaunchDaemons/com.java.update.plist 2>/dev/null

# 检查系统库注入
file /usr/lib/libcurl.3.dylib 2>/dev/null
md5 /usr/lib/libcurl.3.dylib 2>/dev/null
```

**IOC：**

| 指标 | 值 |
|------|-----|
| LaunchDaemon | com.java.update.plist |
| 注入库 | /usr/lib/libcurl.3.dylib (被替换) |
| 配置文件 | /etc/launchd.conf |
| C2 域名 | 多个快闪域名，如 `microsotf[.]com` |
| 文件特征 | 64-bit Mach-O，UPX 压缩 |

**经验教训：**
- DYLD_INSERT_LIBRARIES 是 macOS 特有的持久化和注入机制，Windows/Linux 上无直接对应
- /etc/launchd.conf 虽已在新版 macOS 中废弃，但旧系统或遗留配置中仍然存在
- 及时更新 Java 等运行时环境是防止水坑攻击的关键


## 0x0C 参考资料

1. **Apple Developer Documentation: Launch Agents and Daemons**
   https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html

2. **Apple Platform Security Guide: System Extension**
   https://support.apple.com/guide/security/system-extensions-sec37e874971/web

3. **MITRE ATT&CK: macOS Persistence**
   https://attack.mitre.org/techniques/enterprise/#persistence

4. **MITRE ATT&CK: T1543.001 - Launch Agent**
   https://attack.mitre.org/techniques/T1543/001/

5. **MITRE ATT&CK: T1543.004 - Launch Daemon**
   https://attack.mitre.org/techniques/T1543/004/

6. **MITRE ATT&CK: T1546.014 - Accessibility Settings**
   https://attack.mitre.org/techniques/T1546/014/

7. **MITRE ATT&CK: T1553.001 - Gatekeeper Bypass**
   https://attack.mitre.org/techniques/T1553/001/

8. **Trend Micro: XCSSET Malware Analysis**
   https://www.trendmicro.com/en_us/research/21/l/xcsset-malware.html

9. **Uptycs: MacStealer macOS Info-Stealer Analysis**
   https://www.uptycs.com/blog/macstealer-macos-info-stealer

10. **Objective-See: macOS Security Overview**
    https://objective-see.org/macos.html

11. **osquery Schema Documentation**
    https://osquery.io/schema

12. **Santa - Binary Authorization System for macOS**
    https://github.com/google/santa

13. **Apple: About System Extensions**
    https://support.apple.com/en-us/102471

14. **SentinelOne: macOS Persistence Mechanisms Deep Dive**
    https://www.sentinelone.com/blog/macos-persistence-mechanisms/