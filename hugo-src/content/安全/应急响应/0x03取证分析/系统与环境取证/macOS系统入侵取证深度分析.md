---
title: "macOS系统入侵取证深度分析"
date: 2026-07-02T15:00:00+08:00
draft: false
weight: 530
description: "围绕 macOS 系统入侵取证的全面深度分析，覆盖 macOS 日志体系（unified log/ASL）、Gatekeeper 绕过检测、LaunchAgent/LaunchDaemon 持久化、SIP 状态分析、XProtect/AMC 绕过取证、Keychain 取证、扩展属性与资源分支、APFS 文件系统取证、MDM 配置分析、macOS 恶意软件家族特征、自动化检测与狩猎脚本等。"
categories: ["应急响应", "取证分析"]
tags: ["macOS", "macOS取证", "Gatekeeper", "SIP", "XProtect", "Keychain", "APFS", "LaunchAgent", "MDM", "macOS恶意软件"]
---

## 0x01 macOS 安全架构与取证基础

### macOS 安全模型概述

macOS 采用多层纵深防御架构，核心安全机制包括：

| 机制 | 功能 | 取证价值 |
|------|------|----------|
| SIP (System Integrity Protection) | 内核级系统文件保护 | 篡改检测 |
| Gatekeeper | 应用来源验证与执行控制 | 绕过检测 |
| XProtect | 内置恶意软件检测 | 绕过分析 |
| TCC (Transparency, Consent, Control) | 隐私权限管理 | 权限滥用追踪 |
| AMFI (Apple Mobile File Integrity) | 代码签名强制 | 签名绕过检测 |
| FileVault | 全盘加密 | 数据保护 |
| KTRR (Kernel Trust Cache) | 内核完整性保护 | 内核篡改检测 |

### macOS 与 Windows/Linux 取证差异

| 差异点 | macOS | Windows | Linux |
|--------|-------|---------|-------|
| 文件系统 | APFS/HFS+ | NTFS | ext4/XFS |
| 注册表 | plist 配置文件 | 集中式注册表 | 分散配置文件 |
| 日志系统 | unified log | Event Log | syslog/journald |
| 持久化位置 | LaunchAgents/Daemons | 注册表/服务 | cron/systemd |
| 权限管理 | sudo/sudoers | UAC | sudo/sudoers |
| 执行控制 | Gatekeeper/SIP | SmartScreen/DEP | SELinux/AppArmor |

### 易失性证据收集优先级

macOS 系统易失性证据收集应遵循以下优先级：

1. **内存镜像**（最高优先级）
   - 进程列表、网络连接、加载模块
   - 工具：`mac_robber`、`OSXPMem`

2. **系统状态**
   - 运行进程：`ps auxwww`
   - 网络连接：`netstat -anv` 或 `lsof -i`
   - 加载的内核扩展：`kextstat`
   - 挂载点：`mount`

3. **用户活动**
   - 登录会话：`who`、`w`
   - 最近命令：`history`
   - 剪贴板内容

4. **网络状态**
   - ARP 缓存：`arp -a`
   - DNS 缓存：`dscacheutil -cachedump -entries`
   - 防火墙状态：`/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate`

5. **日志数据**
   - unified log：`log show`
   - 系统日志：`/var/log/system.log`

### 取证工具链

**macOS 专用工具：**

```bash
log show --predicate 'process == "syslogd"' --last 1h
plutil -p /Library/LaunchDaemons/com.apple.plist
spctl --assess --verbose /Applications/Suspicious.app
codesign -dv --verbose=4 /Applications/App.app
xattr -l /path/to/file
```

**通用取证工具：**

| 工具 | 用途 | 平台 |
|------|------|------|
| Volatility | 内存取证 | 跨平台 |
| Autopsy/SleuthKit | 磁盘取证 | 跨平台 |
| osquery | 端点查询 | 跨平台 |
| FSEvents Parser | 文件系统事件 | macOS |
| Knockknock | 持久化检测 | macOS |
| BlockBlock | 持久化监控 | macOS |
| LuLu | 防火墙/网络监控 | macOS |

### APFS vs HFS+ 对取证的影响

| 特性 | APFS | HFS+ |
|------|------|------|
| 快照 | 原生支持 | 不支持 |
| 克隆 | 文件级克隆 | 不支持 |
| 加密 | 文件级加密 | 仅全盘加密 |
| 时间戳 | 纳秒精度 | 秒精度 |
| 空间共享 | 支持 | 不支持 |
| 取证价值 | 快照可恢复历史状态 | 需依赖文件系统日志 |

### 现场保全与镜像获取

**磁盘镜像获取：**

```bash
dd if=/dev/disk0 of=/path/to/image.dd bs=4m
hdiutil create -format UDZO -source /dev/disk0 -target /path/to/image.dmg
```

**APFS 快照提取：**

```bash
tmutil listlocalsnapshots /
mount_apfs -s com.apple.TimeMachine.2024-01-01-000000 /dev/disk1s1 /mnt/snapshot
```

---

## 0x02 macOS 日志体系取证

### Unified Logging System 深度分析

macOS 10.12+ 引入 unified logging 系统，取代传统 syslog，统一管理系统日志、内核日志、应用日志。

**日志存储位置：**

| 路径 | 内容 |
|------|------|
| `/var/db/diagnostics/` | 诊断日志（主日志） |
| `/var/db/uuidtext/` | 文本引用（格式化字符串） |
| `/var/db/diagnostics/signposts/` | 活动追踪数据 |

**log show 命令高级查询：**

```bash
log show --predicate 'process == "syslogd"' --last 24h
log show --predicate 'eventMessage contains "login"' --style syslog
log show --predicate 'processImagePath contains "sudo"' --last 1h
log show --predicate 'senderImagePath contains "Gatekeeper"' --last 7d
log show --predicate 'subsystem == "com.apple.launchservices"' --last 2h
```

**日志级别与类型：**

| 级别 | 说明 | 取证价值 |
|------|------|----------|
| Default | 默认级别 | 常规事件 |
| Info | 信息性 | 详细追踪 |
| Debug | 调试信息 | 开发调试 |
| Error | 错误 | 异常检测 |
| Fault | 严重错误 | 系统故障 |

**活动追踪（os-signpost）：**

```bash
log show --predicate 'eventMessage contains "signpost"' --style ndjson
log show --predicate 'subsystem == "com.apple.signpost"' --last 1h
```

**日志关联与时间线重建：**

```bash
log show --predicate 'process == "loginwindow" OR process == "sudo" OR process == "sshd"' --last 24h --style syslog > login_timeline.log
```

### Apple System Log (ASL) 历史日志

macOS 10.12 之前的系统使用 ASL，日志存储在 `/var/log/asl/`：

```bash
ls -l /var/log/asl/
```

历史日志文件：
- `/var/log/system.log`
- `/var/log/secure.log`（需要 root 权限）
- `/var/log/install.log`
- `/var/log/launchd.log`

### WindowServer 日志分析

WindowServer 负责图形渲染，日志可检测屏幕捕获行为：

```bash
log show --predicate 'process == "WindowServer"' --last 1h | grep -i "capture"
```

### 安装日志分析

`/var/log/install.log` 记录软件安装历史：

```bash
cat /var/log/install.log | grep -E "Installed|Removed"
```

关键字段：
- `Installed "com.apple.pkg.*"` - 系统组件安装
- `Installed "com.vendor.pkg.*"` - 第三方软件
- 时间戳与安装来源

### 日志篡改与反取证检测

**日志缺失检测：**

```bash
log show --last 24h | awk '{print $1, $2}' | sort | uniq -c
```

异常模式：
- 特定时间段日志缺失
- 日志级别异常（大量 Debug/Fault）
- 进程日志突然中断

**日志文件完整性验证：**

```bash
ls -l /var/db/diagnostics/
stat /var/log/system.log
```

### Bash 脚本：macOS 日志异常检测

```bash
#!/bin/bash

echo "=== macOS 日志异常检测 ==="

echo "[*] 检查最近 24 小时的登录事件"
log show --predicate 'process == "loginwindow" OR process == "sudo"' --last 24h --style syslog | grep -E "login|logout|sudo"

echo "[*] 检查 Gatekeeper 相关事件"
log show --predicate 'senderImagePath contains "Gatekeeper"' --last 7d | grep -E "bypass|override|disable"

echo "[*] 检查 SIP 相关事件"
log show --predicate 'eventMessage contains "SIP"' --last 7d

echo "[*] 检查 XProtect 事件"
log show --predicate 'process == "syslogd" AND eventMessage contains "XProtect"' --last 7d

echo "[*] 检查异常日志缺失"
log show --last 24h --style ndjson | jq -r '.time' | cut -d'T' -f1 | sort | uniq -c | awk '$1 < 10 {print "警告: " $2 " 日志数量异常少"}'

echo "[*] 检查安装事件"
grep -E "Installed|Removed" /var/log/install.log | tail -20

echo "[*] 检查 SSH 登录"
log show --predicate 'process == "sshd"' --last 24h | grep -E "Accepted|Failed"
```

---

## 0x03 持久化机制取证

### LaunchAgents/LaunchDaemons 分析

**目录位置：**

| 路径 | 作用域 | 权限 |
|------|--------|------|
| `/System/Library/LaunchAgents/` | 系统级用户代理 | root |
| `/Library/LaunchAgents/` | 全局用户代理 | root |
| `~/Library/LaunchAgents/` | 当前用户代理 | 用户 |
| `/System/Library/LaunchDaemons/` | 系统级守护进程 | root |
| `/Library/LaunchDaemons/` | 全局守护进程 | root |

**plist 结构分析：**

```bash
plutil -p /Library/LaunchDaemons/com.suspicious.plist
```

关键键值：
- `ProgramArguments` - 执行的命令/程序
- `RunAtLoad` - 加载时立即运行
- `KeepAlive` - 保持运行
- `StartInterval` - 定期执行
- `StartCalendarInterval` - 定时执行
- `Program` - 可执行文件路径

**异常 LaunchAgent 检测：**

```bash
for plist in /Library/LaunchAgents/*.plist ~/Library/LaunchAgents/*.plist; do
  echo "=== $plist ==="
  plutil -p "$plist" | grep -E "ProgramArguments|RunAtLoad|KeepAlive"
done
```

### Login Items 分析

Login Items 存储在用户配置数据库中：

```bash
osascript -e 'tell application "System Events" to get the name of every login item'
```

数据库位置：
- `~/Library/Application Support/com.apple.backgroundtaskmanagementagent/`

### cron/periodic 任务

**cron 任务：**

```bash
crontab -l
ls -l /var/spool/cron/crontabs/
cat /etc/crontab
```

**periodic 任务：**

```bash
ls -l /etc/periodic/
cat /etc/periodic/daily/*
```

### 登录钩子

登录钩子存储在默认配置中：

```bash
defaults read com.apple.loginwindow LoginHook
defaults read com.apple.loginwindow LogoutHook
```

### PAM 模块持久化

PAM 配置文件位于 `/etc/pam.d/`：

```bash
ls -l /etc/pam.d/
cat /etc/pam.d/sshd
cat /etc/pam.d/sudo
```

检测异常模块：
```bash
grep -r "sharedlib" /etc/pam.d/
```

### 内核扩展与系统扩展

**内核扩展（kext）：**

```bash
kextstat | grep -v com.apple
```

**系统扩展（macOS 10.15+）：**

```bash
systemextensionsctl list
```

### 环境变量持久化

检查 shell 配置文件：

```bash
cat ~/.bash_profile
cat ~/.zshrc
cat ~/.profile
grep -r "export" ~/.*rc ~/.*profile 2>/dev/null
```

### Bash 脚本：macOS 持久化全面扫描

```bash
#!/bin/bash

echo "=== macOS 持久化全面扫描 ==="

echo "[*] LaunchAgents/LaunchDaemons 扫描"
for dir in /Library/LaunchAgents ~/Library/LaunchAgents /Library/LaunchDaemons; do
  if [ -d "$dir" ]; then
    echo "目录: $dir"
    for plist in "$dir"/*.plist; do
      if [ -f "$plist" ]; then
        prog=$(plutil -p "$plist" | grep ProgramArguments | head -1)
        if [ ! -z "$prog" ]; then
          echo "  $(basename $plist): $prog"
        fi
      fi
    done
  fi
done

echo "[*] Login Items 检查"
osascript -e 'tell application "System Events" to get the name of every login item' 2>/dev/null

echo "[*] cron 任务检查"
crontab -l 2>/dev/null

echo "[*] 登录钩子检查"
defaults read com.apple.loginwindow LoginHook 2>/dev/null
defaults read com.apple.loginwindow LogoutHook 2>/dev/null

echo "[*] 内核扩展检查"
kextstat | grep -v com.apple | awk '{print $6}'

echo "[*] 系统扩展检查"
systemextensionsctl list 2>/dev/null

echo "[*] 环境变量检查"
for file in ~/.bash_profile ~/.zshrc ~/.profile; do
  if [ -f "$file" ]; then
    echo "文件: $file"
    grep "export" "$file" | grep -v "^#"
  fi
done

echo "[*] PAM 模块检查"
grep -r "optional\|required" /etc/pam.d/ | grep -v "com.apple"

echo "[*] 异常 plist 检测（非 Apple 签名）"
for plist in /Library/LaunchAgents/*.plist /Library/LaunchDaemons/*.plist; do
  if [ -f "$plist" ]; then
    if ! codesign -v "$plist" 2>/dev/null; then
      echo "未签名: $plist"
    fi
  fi
done
```

---

## 0x04 Gatekeeper 与代码签名绕过取证

### Gatekeeper 工作原理

Gatekeeper 在 macOS 10.7.5+ 引入，验证应用来源：

**验证流程：**
1. 检查代码签名有效性
2. 验证开发者证书
3. 检查公证状态（macOS 10.15+）
4. 检查隔离属性

### Gatekeeper 绕过技术分析

**隔离属性移除：**

```bash
xattr -d com.apple.quarantine /Applications/Suspicious.app
xattr -cr /Applications/Suspicious.app
```

取证检测：
```bash
xattr -l /Applications/Suspicious.app
```

**公证滥用：**

攻击者使用合法开发者账号签名并通过公证：
```bash
spctl --assess --verbose /Applications/App.app
```

**命令行工具绕过：**

```bash
spctl --master-disable
```

检测状态：
```bash
spctl --status
```

### 代码签名验证

**签名有效性检查：**

```bash
codesign -dv --verbose=4 /Applications/App.app
codesign --verify --deep --strict /Applications/App.app
```

**团队标识符分析：**

```bash
codesign -dv /Applications/App.app 2>&1 | grep TeamIdentifier
```

**证书吊销检查：**

```bash
codesign -d --extract-cert /Applications/App.app
openssl x509 -in cert.pem -noout -dates
```

### 恶意应用分发渠道

| 渠道 | 风险等级 | 检测难度 |
|------|----------|----------|
| Mac App Store | 低 | 低 |
| 公证应用 | 中 | 中 |
| 自签名应用 | 高 | 高 |
| 破解应用 | 极高 | 高 |

### Bash 脚本：Gatekeeper 状态与签名异常检测

```bash
#!/bin/bash

echo "=== Gatekeeper 与签名异常检测 ==="

echo "[*] Gatekeeper 状态"
spctl --status

echo "[*] 检查隔离属性"
find /Applications -maxdepth 2 -name "*.app" -exec sh -c 'xattr -l "$1" 2>/dev/null | grep -q "com.apple.quarantine" || echo "无隔离属性: $1"' _ {} \;

echo "[*] 检查应用签名"
for app in /Applications/*.app; do
  if [ -d "$app" ]; then
    if ! codesign -v "$app" 2>/dev/null; then
      echo "签名无效: $app"
    else
      team=$(codesign -dv "$app" 2>&1 | grep TeamIdentifier | cut -d= -f2)
      if [ "$team" = "not set" ]; then
        echo "Ad-hoc 签名: $app"
      fi
    fi
  fi
done

echo "[*] 检查最近修改的应用"
find /Applications -maxdepth 2 -name "*.app" -mtime -7 -exec ls -ld {} \;

echo "[*] 检查公证状态"
for app in /Applications/*.app; do
  if [ -d "$app" ]; then
    result=$(spctl --assess --verbose "$app" 2>&1)
    if echo "$result" | grep -q "rejected"; then
      echo "公证失败: $app"
    fi
  fi
done
```

---

## 0x05 SIP 与系统完整性保护取证

### SIP 技术原理

SIP (System Integrity Protection) 在 macOS 10.11+ 引入，通过内核级保护限制 root 用户权限。

**保护机制：**
- 系统文件保护（`/System`、`/usr`、`/bin`、`/sbin`）
- 进程保护（系统进程不可附加）
- 内核扩展白名单
- NVRAM 保护

### SIP 状态检查与篡改检测

**检查 SIP 状态：**

```bash
csrutil status
```

**详细 SIP 配置：**

```bash
csrutil status
csrutil authenticated-root status
```

**NVRAM 变量分析：**

```bash
nvram -p | grep -i sip
nvram -p | grep csr
```

### Recovery OS 安全分析

Recovery OS 用于修改 SIP 设置：

```bash
nvram -p | grep "recovery"
```

检测 Recovery OS 启动：
```bash
log show --predicate 'eventMessage contains "Recovery"' --last 7d
```

### SIP 绕过尝试的取证痕迹

**常见绕过尝试：**

1. 修改受保护目录
2. 加载未签名内核扩展
3. 附加到系统进程

**检测痕迹：**

```bash
log show --predicate 'eventMessage contains "SIP" OR eventMessage contains "csrutil"' --last 7d
```

### AMFI 分析

AMFI (Apple Mobile File Integrity) 强制执行代码签名：

```bash
log show --predicate 'process == "amfid"' --last 1h
```

### Bash 脚本：SIP 完整性验证

```bash
#!/bin/bash

echo "=== SIP 完整性验证 ==="

echo "[*] SIP 状态"
csrutil status

echo "[*] SIP 配置详情"
csrutil status | grep -E "System Integrity|Kext|Debug|FS|NVram"

echo "[*] NVRAM SIP 变量"
nvram -p | grep -i "csr\|sip"

echo "[*] 检查系统文件完整性"
diskutil apfs listSnapshots /

echo "[*] 检查内核扩展"
kextstat | grep -v com.apple | awk '{print $6, $7}'

echo "[*] 检查 AMFI 日志"
log show --predicate 'process == "amfid"' --last 1h | grep -E "deny|reject|invalid"

echo "[*] 检查 Recovery OS 启动记录"
log show --predicate 'eventMessage contains "Recovery"' --last 7d | head -10

echo "[*] 检查系统目录修改"
find /System -mtime -1 -type f 2>/dev/null | head -20
```

---

## 0x06 XProtect 与恶意软件检测绕过取证

### XProtect 工作原理

XProtect 是 macOS 内置的恶意软件检测系统：

**组件：**
- XProtect 签名数据库
- XProtect Remediator (XRT)
- MRT (Malware Removal Tool，已弃用)

**签名数据库位置：**

```bash
ls -l /Library/Apple/System/Library/CoreServices/XProtect.bundle/
ls -l /Library/Apple/System/Library/CoreServices/XProtectRemediator*
```

### XProtect 绕过检测

**检测方法：**

```bash
log show --predicate 'process == "syslogd" AND eventMessage contains "XProtect"' --last 7d
```

**检查 XProtect 更新：**

```bash
softwareupdate --history | grep XProtect
```

### macOS 已知恶意软件家族特征

| 家族 | 类型 | 特征 |
|------|------|------|
| Silver Sparrow | 后门 | M1 原生支持、自更新 |
| XLoader/Keydnap | 银行木马 | 键盘记录、凭据窃取 |
| Shlayer | 广告软件 | 伪装 Adobe Flash 更新 |
| Pirrit/CreativeUpdate | 广告软件 | 中间人攻击、广告注入 |
| BlueNoroff | 银行木马 | Lazarus 组织、金融目标 |

**Silver Sparrow 特征：**

```bash
find / -name "agent.*" -path "*/Library/Application Support/*" 2>/dev/null
```

**XLoader 特征：**

```bash
find / -name "*.js" -path "*/Library/LaunchAgents/*" 2>/dev/null
```

### YARA 规则：macOS 恶意软件特征

```yara
rule macOS_SilverSparrow {
    meta:
        description = "Silver Sparrow macOS 后门"
        author = "Security Team"
    strings:
        $s1 = "Library/Application Support/agent"
        $s2 = "updates.sh"
        $s3 = "version.txt"
    condition:
        all of them
}

rule macOS_XLoader {
    meta:
        description = "XLoader macOS 银行木马"
        author = "Security Team"
    strings:
        $s1 = "Library/LaunchAgents/com.apple.*.plist"
        $s2 = "keychain"
        $s3 = "safari"
    condition:
        all of them
}
```

---

## 0x07 Keychain 与凭据取证

### Keychain 架构

**Keychain 类型：**

| 类型 | 路径 | 用途 |
|------|------|------|
| login.keychain | `~/Library/Keychains/login.keychain-db` | 用户凭据 |
| System.keychain | `/Library/Keychains/System.keychain` | 系统凭据 |
| LocalItems | `~/Library/Keychains/` | iCloud 钥匙串 |

### Keychain 数据提取

**使用 security 命令：**

```bash
security dump-keychain ~/Library/Keychains/login.keychain-db
security find-generic-password -s "ServiceName" ~/Library/Keychains/login.keychain-db
security find-internet-password -s "example.com" ~/Library/Keychains/login.keychain-db
```

**提取 Wi-Fi 密码：**

```bash
security find-generic-password -ga "WiFi-Name" /Library/Preferences/SystemConfiguration/com.apple.airport.preferences.plist
```

### 凭据访问异常检测

**检测 Keychain 访问：**

```bash
log show --predicate 'process == "securityd" OR eventMessage contains "keychain"' --last 1h
```

**检查 Keychain 锁定状态：**

```bash
security show-keychain-info ~/Library/Keychains/login.keychain-db
```

### 凭据转储攻击痕迹

**常见工具：**
- `keychaindump`
- `chainbreaker`

**检测痕迹：**

```bash
log show --predicate 'eventMessage contains "keychain" AND (eventMessage contains "unlock" OR eventMessage contains "access")' --last 24h
```

### Bash 脚本：Keychain 异常访问检测

```bash
#!/bin/bash

echo "=== Keychain 异常访问检测 ==="

echo "[*] Keychain 文件列表"
ls -l ~/Library/Keychains/

echo "[*] Keychain 锁定状态"
security show-keychain-info ~/Library/Keychains/login.keychain-db 2>/dev/null

echo "[*] 检查 Keychain 访问日志"
log show --predicate 'process == "securityd"' --last 1h | grep -E "access|unlock|error"

echo "[*] 检查 Wi-Fi 密码提取"
log show --predicate 'eventMessage contains "AirPort" AND eventMessage contains "password"' --last 24h

echo "[*] 检查 Safari 自动填充数据"
ls -l ~/Library/Safari/
defaults read ~/Library/Safari/SecureBookmarks.plist 2>/dev/null | head -20

echo "[*] 检查 Keychain 修改时间"
stat ~/Library/Keychains/login.keychain-db
```

---

## 0x08 APFS 文件系统取证

### APFS 架构

**核心组件：**
- Container（容器）
- Volume（卷）
- Space（空间）
- Snapshot（快照）
- Clone（克隆）

### APFS 特性对取证的影响

**快照取证价值：**

```bash
tmutil listlocalsnapshots /
mount_apfs -s com.apple.TimeMachine.2024-01-01 /dev/disk1s1 /mnt/snapshot
```

**克隆与空间共享：**

克隆文件共享数据块，修改不影响原始文件：

```bash
cp -c original.txt clone.txt
```

### 文件级加密

```bash
diskutil apfs list
```

### 扩展属性取证

**查看扩展属性：**

```bash
xattr -l /path/to/file
```

**常见属性：**
- `com.apple.quarantine` - 隔离属性
- `com.apple.metadata:kMDItemWhereFroms` - 下载来源
- `com.apple.FinderInfo` - Finder 信息

### 资源分支

资源分支存储在扩展属性中：

```bash
xattr -p com.apple.ResourceFork /path/to/file | xxd
```

### TCC 数据库分析

TCC 数据库记录隐私权限授予：

```bash
sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db "SELECT * FROM access;"
```

关键字段：
- `service` - 权限类型（kTCCServiceCamera、kTCCServiceMicrophone 等）
- `client` - 申请权限的应用
- `allowed` - 是否允许

### Bash 脚本：APFS 取证数据提取

```bash
#!/bin/bash

echo "=== APFS 取证数据提取 ==="

echo "[*] APFS 容器信息"
diskutil apfs list

echo "[*] APFS 快照列表"
tmutil listlocalsnapshots /

echo "[*] 扩展属性检查"
for file in /Applications/*.app; do
  attrs=$(xattr -l "$file" 2>/dev/null)
  if [ ! -z "$attrs" ]; then
    echo "文件: $file"
    echo "$attrs"
  fi
done

echo "[*] 隔离属性检查"
find /Applications -maxdepth 2 -exec xattr -l {} \; 2>/dev/null | grep -A2 "com.apple.quarantine"

echo "[*] TCC 数据库分析"
sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db "SELECT service, client, allowed FROM access WHERE allowed = 1;"

echo "[*] 文件时间戳分析"
stat -f "%N: Created=%SB Modified=%Sm" /Applications/*.app 2>/dev/null | head -20

echo "[*] 已删除文件恢复检查"
ls -l /.Spotlight-V100/ 2>/dev/null
```

---

## 0x09 MDM 与设备管理取证

### MDM 架构

MDM (Mobile Device Management) 用于企业设备管理：

**配置文件位置：**

```bash
ls -l /Library/Managed\ Preferences/
ls -l /var/db/ConfigurationProfiles/
```

### MDM 配置文件检测

**检查 MDM 配置：**

```bash
profiles list -verbose
profiles show -all
```

**检查设备注册类型：**

```bash
system_profiler SPConfigurationProfileDataType
```

### 异常 MDM 配置检测

**检测异常 MDM 服务器：**

```bash
profiles list | grep -E "URL|ServerURL"
```

**检查 MDM 命令历史：**

```bash
log show --predicate 'process == "mdmclient"' --last 24h
```

### MDM 平台日志

**Jamf：**

```bash
ls -l /Library/Application\ Support/Jamf/
cat /Library/Application\ Support/Jamf/Logs/Jamf.log
```

**Kandji：**

```bash
ls -l /Library/Application\ Support/Kandji/
```

### Bash 脚本：MDM 配置审计

```bash
#!/bin/bash

echo "=== MDM 配置审计 ==="

echo "[*] MDM 配置文件列表"
profiles list -verbose

echo "[*] 设备注册类型"
system_profiler SPConfigurationProfileDataType | grep -E "Type|URL"

echo "[*] MDM 服务器信息"
profiles list | grep -E "ServerURL|CheckInURL"

echo "[*] MDM 命令历史"
log show --predicate 'process == "mdmclient"' --last 24h | grep -E "Install|Remove|Configure"

echo "[*] 检查托管偏好"
ls -l /Library/Managed\ Preferences/

echo "[*] 检查配置描述文件"
ls -l /var/db/ConfigurationProfiles/Settings/

echo "[*] 检查 MDM 守护进程"
launchctl list | grep mdm
```

---

## 0x0A 网络与远程访问取证

### macOS 防火墙配置

**检查防火墙状态：**

```bash
/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate
/usr/libexec/ApplicationFirewall/socketfilterfw --listapps
```

**防火墙日志：**

```bash
log show --predicate 'process == "socketfilterfw"' --last 1h
```

### 远程管理分析

**ARD (Apple Remote Desktop)：**

```bash
system_profiler SPConfigurationProfileDataType | grep -i "remote"
defaults read /Library/Preferences/com.apple.RemoteManagement
```

**SSH 远程访问：**

```bash
systemsetup -getremotelogin
log show --predicate 'process == "sshd"' --last 24h | grep -E "Accepted|Failed"
```

### VPN 配置与连接日志

**VPN 配置：**

```bash
scutil --nc list
networksetup -listallnetworkservices
```

**VPN 连接日志：**

```bash
log show --predicate 'process == "nesessionmanager"' --last 24h
```

### 代理配置分析

**PAC 文件：**

```bash
networksetup -getautoproxyurl Wi-Fi
```

**代理配置：**

```bash
networksetup -getwebproxy Wi-Fi
networksetup -getsecurewebproxy Wi-Fi
networksetup -getsocksfirewallproxy Wi-Fi
```

### 网络流量取证

**nettop：**

```bash
nettop -P -k state,interface,rx_delt,rx_rate,tx_delt,tx_rate
```

**netstat：**

```bash
netstat -anv | grep ESTABLISHED
```

**tcpdump：**

```bash
tcpdump -i en0 -w capture.pcap
```

### Bash 脚本：网络异常检测

```bash
#!/bin/bash

echo "=== 网络异常检测 ==="

echo "[*] 防火墙状态"
/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

echo "[*] 防火墙应用列表"
/usr/libexec/ApplicationFirewall/socketfilterfw --listapps | grep -E "Allow|Deny"

echo "[*] 远程管理状态"
systemsetup -getremotelogin

echo "[*] SSH 登录历史"
log show --predicate 'process == "sshd"' --last 24h | grep -E "Accepted|Failed" | tail -20

echo "[*] VPN 连接状态"
scutil --nc list

echo "[*] 代理配置"
networksetup -getautoproxyurl Wi-Fi
networksetup -getwebproxy Wi-Fi

echo "[*] 活跃网络连接"
netstat -anv | grep ESTABLISHED | awk '{print $1, $5, $9}'

echo "[*] 异常端口监听"
lsof -i -P | grep LISTEN | grep -v "com.apple"

echo "[*] DNS 查询缓存"
dscacheutil -cachedump -entries 2>/dev/null | head -20
```

---

## 0x0B 证据强度分层与案例关联

### macOS 证据强度分类

**确认恶意（高置信度）：**

| 证据类型 | 示例 | 强度 |
|----------|------|------|
| 已知恶意软件签名 | XProtect 检测 | 确认 |
| 恶意内核扩展加载 | 未签名 kext | 确认 |
| 凭据转储工具 | keychaindump 执行 | 确认 |
| C2 通信 | 已知恶意 IP/域名 | 确认 |

**高度可疑（中置信度）：**

| 证据类型 | 示例 | 强度 |
|----------|------|------|
| SIP 禁用 | csrutil disable | 高度可疑 |
| Gatekeeper 绕过 | 隔离属性移除 | 高度可疑 |
| 异常 LaunchAgent | 未签名 plist | 高度可疑 |
| 异常 TCC 权限 | 未知应用获取摄像头 | 高度可疑 |

**需要关注（低置信度）：**

| 证据类型 | 示例 | 强度 |
|----------|------|------|
| 异常登录时间 | 凌晨 3 点登录 | 需要关注 |
| 新安装应用 | 未公证应用 | 需要关注 |
| 环境变量修改 | PATH 修改 | 需要关注 |

### macOS 入侵 IOC 汇总

**文件 IOC：**

```
/Library/LaunchDaemons/com.suspicious.plist
~/Library/LaunchAgents/com.malware.plist
/Library/Application Support/malware/
/tmp/.hidden_payload
```

**网络 IOC：**

```
185.x.x.x:443 (C2)
malicious-domain.com
updates.suspicious-service.com
```

**行为 IOC：**

```
csrutil disable
xattr -d com.apple.quarantine
codesign --force --sign - /path/to/binary
```

### 多源证据关联方法

**时间线关联：**

1. 统一日志时间戳
2. 关联文件系统事件
3. 关联网络事件
4. 关联进程事件

**证据链构建：**

```
初始访问 → 执行 → 持久化 → 权限提升 → 凭据访问 → 发现 → 横向移动 → 数据外传
```

### 时间线构建最佳实践

**使用 log 命令构建时间线：**

```bash
log show --last 24h --style ndjson | jq -c '{time: .time, process: .process, message: .eventMessage}' > timeline.json
```

**使用 plutil 分析 plist：**

```bash
plutil -p /Library/LaunchDaemons/com.suspicious.plist | grep -E "ProgramArguments|RunAtLoad"
```

---

## 0x0C 自动化检测与狩猎

### Sigma 规则（macOS 相关）

```yaml
title: macOS SIP 禁用检测
id: 1a2b3c4d-5e6f-7g8h-9i0j
status: experimental
description: 检测 SIP 被禁用的情况
author: Security Team
date: 2024/01/01
logsource:
  product: macos
  category: system
detection:
  selection:
    EventID: 1
    CommandLine|contains: 'csrutil disable'
  condition: selection
level: high
tags:
  - attack.defense_evasion
  - attack.t1553.001
```

```yaml
title: macOS Gatekeeper 绕过检测
id: 2b3c4d5e-6f7g-8h9i-0j1k
status: experimental
description: 检测隔离属性被移除
author: Security Team
date: 2024/01/01
logsource:
  product: macos
  category: system
detection:
  selection:
    CommandLine|contains: 'xattr -d com.apple.quarantine'
  condition: selection
level: medium
tags:
  - attack.defense_evasion
  - attack.t1553.001
```

### Bash/zsh 自动化狩猎脚本集

```bash
#!/bin/bash

echo "=== macOS 安全狩猎脚本 ==="

echo "[*] 1. 检查异常 LaunchAgent/LaunchDaemon"
for plist in /Library/LaunchAgents/*.plist ~/Library/LaunchAgents/*.plist /Library/LaunchDaemons/*.plist; do
  if [ -f "$plist" ]; then
    if ! codesign -v "$plist" 2>/dev/null; then
      echo "[!] 未签名 plist: $plist"
      plutil -p "$plist" | grep ProgramArguments
    fi
  fi
done

echo "[*] 2. 检查 SIP 状态"
if csrutil status | grep -q "disabled"; then
  echo "[!] SIP 已禁用"
fi

echo "[*] 3. 检查 Gatekeeper 状态"
if spctl --status | grep -q "disabled"; then
  echo "[!] Gatekeeper 已禁用"
fi

echo "[*] 4. 检查内核扩展"
kexts=$(kextstat | grep -v com.apple | wc -l)
if [ "$kexts" -gt 0 ]; then
  echo "[!] 发现非 Apple 内核扩展:"
  kextstat | grep -v com.apple
fi

echo "[*] 5. 检查异常端口"
lsof -i -P | grep LISTEN | grep -v "com.apple" | while read line; do
  echo "[!] $line"
done

echo "[*] 6. 检查 SSH 登录失败"
failed=$(log show --predicate 'process == "sshd"' --last 24h | grep -c "Failed")
if [ "$failed" -gt 10 ]; then
  echo "[!] SSH 登录失败次数过多: $failed"
fi

echo "[*] 7. 检查异常 TCC 权限"
sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db "SELECT client FROM access WHERE allowed = 1 AND client NOT LIKE 'com.apple.%';"

echo "[*] 8. 检查最近安装的应用"
find /Applications -maxdepth 2 -name "*.app" -mtime -7 -exec ls -ld {} \;

echo "[*] 9. 检查环境变量异常"
if echo "$PATH" | grep -q "/tmp\|/var/tmp"; then
  echo "[!] PATH 包含可疑目录"
fi

echo "[*] 10. 检查防火墙状态"
if ! /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate | grep -q "enabled"; then
  echo "[!] 防火墙已禁用"
fi
```

### YARA 规则（macOS 恶意软件）

```yara
rule macOS_Persistence_LaunchAgent {
    meta:
        description = "检测可疑 LaunchAgent"
        author = "Security Team"
    strings:
        $plist = "<?xml"
        $runatload = "RunAtLoad"
        $keepalive = "KeepAlive"
        $suspicious_path = "/tmp/" nocase
        $suspicious_path2 = "/var/tmp/" nocase
    condition:
        $plist and ($runatload or $keepalive) and ($suspicious_path or $suspicious_path2)
}

rule macOS_Quarantine_Removal {
    meta:
        description = "检测隔离属性移除"
        author = "Security Team"
    strings:
        $cmd1 = "xattr -d com.apple.quarantine"
        $cmd2 = "xattr -cr"
    condition:
        $cmd1 or $cmd2
}
```

### osquery 查询集

```sql
SELECT name, path, program_arguments, run_at_load FROM launchd WHERE path NOT LIKE '/System/%';
SELECT filename, path, source FROM etc_services WHERE port > 1024;
SELECT pid, name, path, cmdline FROM processes WHERE path NOT LIKE '/System/%' AND path NOT LIKE '/usr/%';
SELECT user, host, port, type FROM listening_ports WHERE address != '127.0.0.1';
SELECT path, md5, sha256 FROM file WHERE path LIKE '/Applications/%';
```

### 与 SIEM 集成方案

**日志转发配置：**

```bash
/usr/bin/log stream --style ndjson | /usr/local/bin/forward_to_siem
```

**osquery 配置：**

```ini
[packs]
macos_security = /usr/local/share/osquery/packs/macos_security.conf
```

---

## 0x0D 公开案例分析

### 案例 1：Silver Sparrow macOS 恶意软件

**攻击链：**

1. **初始访问**：通过破解软件分发
2. **执行**：用户运行破解应用
3. **持久化**：创建 LaunchAgent
4. **命令与控制**：连接 C2 服务器

**取证发现：**

```bash
/Library/Application Support/agent/agent.sh
~/Library/LaunchAgents/com.apple.xptask.plist
```

**IOC：**

```
文件：
- /Library/Application Support/agent/agent.sh
- ~/Library/LaunchAgents/com.apple.xptask.plist

网络：
- updates.silver-sparrow.com
- 185.x.x.x:443

行为：
- 创建 LaunchAgent
- 定期连接 C2
- 自更新机制
```

**经验教训：**

1. 检测未签名的 LaunchAgent
2. 监控 `/Library/Application Support/` 异常目录
3. 分析网络通信模式

### 案例 2：XLoader 跨平台银行木马

**攻击链：**

1. **初始访问**：恶意邮件附件
2. **执行**：用户打开 DMG 文件
3. **持久化**：创建 LaunchAgent
4. **凭据窃取**：键盘记录、浏览器数据窃取

**取证发现：**

```bash
~/Library/LaunchAgents/com.apple.flashplayer.plist
/Library/Application Support/FlashPlayer/
```

**IOC：**

```
文件：
- ~/Library/LaunchAgents/com.apple.flashplayer.plist
- /Library/Application Support/FlashPlayer/

网络：
- flashplayer-update.com
- cdn.flashplayer-update.net

行为：
- 键盘记录
- 浏览器凭据窃取
- 屏幕截图
```

**经验教训：**

1. 检测伪装成系统组件的 LaunchAgent
2. 监控浏览器数据访问
3. 分析键盘记录行为

---

## 0x0E 参考资料

1. Apple Inc. (2024). "Mac 安全概述". https://support.apple.com/zh-cn/HT208328

2. Richalloway. (2023). "macOS 取证指南". https://www.sans.org/blog/macos-forensics/

3. SentinelOne. (2023). "Silver Sparrow: 新 macOS 恶意软件分析". https://www.sentinelone.com/blog/silver-sparrow-malware/

4. Objective-See. (2024). "macOS 安全工具". https://objective-see.org/products.html

5. Jamf. (2024). "macOS MDM 配置指南". https://www.jamf.com/resources/

6. MITRE ATT&CK. (2024). "macOS 攻击技术". https://attack.mitre.org/matrices/enterprise/macos/

7. Volatility Foundation. (2024). "macOS 内存取证". https://www.volatilityfoundation.org/

8. Apple Inc. (2024). "macOS 安全配置指南". https://support.apple.com/guide/security/

9. CrowdStrike. (2023). "XLoader 银行木马分析". https://www.crowdstrike.com/blog/xloader-malware/

10. Sophos. (2023). "Shlayer macOS 恶意软件". https://www.sophos.com/blog/shlayer-macos-malware/

---

**本文系统性地介绍了 macOS 系统入侵取证的各个方面，从安全架构到具体检测技术，为安全研究人员提供了完整的 macOS 取证分析框架。实际应用中应结合具体场景灵活运用这些技术和工具。**
