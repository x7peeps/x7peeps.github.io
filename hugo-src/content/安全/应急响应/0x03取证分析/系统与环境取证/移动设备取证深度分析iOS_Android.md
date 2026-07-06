---
title: "移动设备取证深度分析（iOS/Android）"
date: 2026-07-02T14:00:00+08:00
draft: false
weight: 520
description: "围绕移动设备取证的全面深度分析，覆盖 iOS 文件系统与备份取证、Android 文件系统与分区取证、App 数据存储分析、SQLite 数据库提取、位置信息取证、通信记录分析、云同步数据取证、移动恶意软件分析、越狱/Root 检测、自动化取证工具链等。"
categories: ["应急响应", "取证分析"]
tags: ["iOS", "Android", "移动取证", "SQLite", "App分析", "位置取证", "通信取证", "越狱检测", "Root检测", "移动恶意软件"]
---

# 移动设备取证深度分析（iOS/Android）

## 0x01 移动设备取证基础与方法论

### 1.1 移动设备取证与 PC 取证的核心差异

移动设备取证与传统 PC 取证在技术路径、法律框架和操作流程上存在本质区别。以下从六个维度进行对比分析：

| 对比维度 | PC 取证 | 移动设备取证 |
|---------|---------|-------------|
| 文件系统访问 | 直接块级访问，支持 raw 镜像 | 受限于安全沙箱，通常只能通过逻辑接口访问 |
| 加密机制 | BitLocker/FileVault 全盘加密 | 硬件级加密 + Secure Enclave/TEE + 文件级加密 |
| 提取方式 | 硬盘拆卸/镜像克隆 | 逻辑提取（API）/物理提取（芯片级）/备份提取 |
| 易失性数据 | RAM/网络连接/运行进程 | 除上述外还包括 GPS 状态/基站信息/传感器数据 |
| 操作系统碎片化 | Windows/Linux/macOS 三大体系 | iOS 版本有限但 Android 碎片化严重（数千种设备配置） |
| 法律合规 | 搜查令通常覆盖设备本身 | 涉及云端数据时需额外法律授权（跨境数据调取） |

移动设备的核心挑战在于：设备始终处于加密状态，且加密密钥与硬件绑定，无法像 PC 那样通过拆卸存储介质进行离线分析。即便是关机状态，现代移动设备的存储芯片内容也是密文，只有在设备解锁后密钥才会被加载到安全硬件中。

### 1.2 移动设备取证分类

移动设备取证按照提取深度可分为四个层级：

**层级一：逻辑提取（Logical Extraction）**

通过设备提供的标准接口（USB/WiFi）使用 API 调用获取数据。这是最常见的取证方式，不需要绕过设备安全机制。

```bash
ideviceinfo -u <UDID>
adb shell dumpsys <service>
```

逻辑提取可获取的数据包括：通讯录、短信、通话记录、照片、视频、已安装的 App 列表、部分 App 数据等。

**层级二：文件系统提取（File System Extraction）**

绕过应用层沙箱限制，直接访问设备的文件系统。在 iOS 上通常需要越狱或利用漏洞；在 Android 上需要 Root 权限或通过 ADB 的 backup 机制。

```bash
adb pull /data/data/com.tencent.mm/ ./wechat_data/
```

**层级三：物理提取（Physical Extraction）**

通过芯片拆卸（Chip-off）或 ISP（In-System Programming）方式直接读取 NAND Flash 芯片内容。这是最深层的提取方式，可以获取已删除数据和隐藏分区内容，但成本高昂且具有破坏性。

**层级四：应用级提取（Application-Level Extraction）**

针对特定 App 的数据库、缓存和配置文件进行深度解析。这种方式需要深入了解各 App 的内部数据存储结构。

### 1.3 易失性证据优先级

根据 RFC 3227 的指南顺序，结合移动设备的特殊性，易失性证据的优先级排列如下：

| 优先级 | 数据类型 | 易失性 | 提取方式 |
|-------|---------|--------|---------|
| 1 | 运行中的进程与服务 | 极高 | `adb shell ps` / iOS 进程列表 |
| 2 | 网络连接状态 | 极高 | `adb shell netstat` / `lsof -i` |
| 3 | 当前 GPS 坐标与基站信息 | 高 | 定位服务 API / 基站查询 |
| 4 | RAM 内容 | 高 | 需要 Root/越狱 |
| 5 | 已解锁的加密卷密钥 | 高 | 设备解锁状态下提取 |
| 6 | 临时文件与缓存 | 中 | 文件系统级提取 |
| 7 | 用户数据（通讯录/消息等） | 低 | 逻辑提取即可 |

**关键原则**：在获取移动设备时，首先确保设备保持开机和解锁状态（如果已经解锁），然后立即进行易失性数据的提取。如果设备处于锁定状态，不要尝试猜测密码，因为多次错误输入可能触发设备擦除机制。

### 1.4 取证工具链概览

| 工具 | 类型 | 平台 | 功能 |
|------|------|------|------|
| Cellebrite UFED | 商业 | iOS/Android | 全层级数据提取，支持物理提取 |
| Magnet AXIOM | 商业 | iOS/Android | 数据解析与关联分析 |
| libimobiledevice | 开源 | iOS | 跨平台 iOS 设备通信库 |
| pymobiledevice3 | 开源 | iOS | Python 实现的 iOS 设备通信 |
| adb (Android Debug Bridge) | 官方 | Android | Android 设备调试与数据提取 |
| Andriller | 开源 | Android | Android 数据提取与解密 |
| SANToku | 开源 | Android | Android 取证分析 Linux 发行版 |
| MobSF | 开源 | Android/iOS | 移动应用静态/动态分析 |

```bash
libimobiledevice 工具集安装与使用：
brew install libimobiledevice
idevice_id -l
ideviceinfo -k ProductType
idevicebackup2 backup ./backup_dir/
```

### 1.5 法律合规与隐私保护挑战

移动设备取证面临的法律挑战远超传统 PC 取证：

- **跨境数据问题**：iCloud 数据可能存储在不同国家的服务器上，涉及跨境数据调取的法律程序
- **生物识别解锁**：指纹/面部识别解锁的法律强制性在不同司法管辖区存在差异
- **App 隐私政策**：提取第三方 App 数据可能涉及该 App 的隐私政策约束
- **云端数据授权**：设备搜查令是否覆盖关联的云账户数据，在各国法律中存在不同解释

### 1.6 设备获取与保全最佳实践

```
设备获取流程：
1. 拍照记录设备当前状态（屏幕内容/连接状态）
2. 启用飞行模式或放入法拉第袋（Faraday Bag）隔离信号
3. 记录设备型号/序列号/IMEI
4. 如设备已解锁，保持解锁状态并立即提取易失性数据
5. 如设备已锁定，不要尝试解锁，保持当前电源状态
6. 连接充电器防止电量耗尽
7. 建立完整的证据链记录（Chain of Custody）
```

法拉第袋的选择标准：屏蔽效能 ≥ 60dB（覆盖 800MHz-6GHz 频段），确保覆盖 5G NR（n41/n78/n257 频段）、WiFi 6E（6GHz）和蓝牙 5.3 的所有频段。

---

## 0x02 iOS 文件系统与备份取证

### 2.1 iOS 安全架构

iOS 的安全架构建立在硬件级加密基础之上，核心组件包括：

**Secure Enclave Processor（SEP）**

SEP 是 Apple 自研的安全协处理器，独立于主 SoC 运行。它负责：
- 生成和存储设备的 UID（Unique ID）密钥
- 处理生物识别数据（Touch ID / Face ID）
- 管理 Data Protection 密钥层级
- 执行密码验证和速率限制

SEP 拥有独立的启动链（Boot Chain），与主处理器的启动过程完全隔离。即使主处理器被完全攻破，SEP 中的密钥仍然安全。

**Data Protection Class（数据保护类别）**

iOS 将文件按照不同的保护级别进行分类，每个级别对应不同的密钥层级：

| 保护类别 | 密钥可用性 | 典型应用场景 |
|---------|-----------|-------------|
| Complete Protection (NSFileProtectionComplete) | 设备解锁后可用 | 消息数据库、通讯录 |
| Complete Unless Open (NSFileProtectionCompleteUnlessOpen) | 可保持文件句柄打开 | 正在录制的音频/视频 |
| Complete Until First User Authentication (NSFileProtectionCompleteUntilFirstUserAuthentication) | 首次解锁后可用直到重启 | 大多数 App 数据 |
| Protection None (NSFileProtectionNone) | 始终可用 | 系统基础数据 |

```
加密密钥层级：
UID (硬件唯一密钥，不可导出)
  └── Class Key (每个保护类别一个)
       └── Per-file Key (每个文件一个)
            └── 文件内容加密
```

### 2.2 iOS 文件系统结构

iOS 的文件系统基于 APFS（Apple File System），关键目录结构如下：

```
/
├── private/
│   └── var/
│       ├── mobile/
│       │   ├── Library/
│       │   │   ├── AddressBook/          (通讯录数据库)
│       │   │   ├── CallHistoryDB/        (通话记录)
│       │   │   ├── SMS/                  (短信数据库)
│       │   │   ├── Safari/               (Safari 浏览数据)
│       │   │   ├── Cookies/              (Cookie 存储)
│       │   │   ├── Caches/               (应用缓存)
│       │   │   └── Application Support/  (应用支持文件)
│       │   ├── Documents/                (用户文档)
│       │   └── Containers/
│       │       └── Bundle/               (App 容器)
│       │           └── Application/      (各 App 沙箱目录)
│       ├── db/                           (系统数据库)
│       ├── logs/                         (系统日志)
│       └── tmp/                          (临时文件)
├── System/
│   └── Library/                          (系统框架和资源)
└── usr/
    └── bin/                              (系统命令)
```

关键取证文件路径：

```bash
通讯录数据库：
/private/var/mobile/Library/AddressBook/AddressBook.sqlitedb

短信数据库：
/private/var/mobile/Library/SMS/sms.db

通话记录：
/private/var/mobile/Library/CallHistoryDB/CallHistory.storedata

Safari 历史记录：
/private/var/mobile/Library/Safari/History.db

位置缓存：
/private/var/mobile/Library/Caches/locationd/

WiFi 网络记录：
/private/var/mobile/Library/SystemConfiguration/com.apple.wifi.plist
```

### 2.3 iTunes/Finder 备份格式分析

iOS 备份是通过 iTunes（macOS Mojave 及之前）或 Finder（macOS Catalina 及之后）创建的设备数据快照。

**备份文件结构**

```
Backup Directory/
├── Manifest.db          (SQLite 数据库，记录所有备份文件的元数据)
├── Manifest.plist       (备份配置信息，包含设备信息和加密状态)
├── Status.plist         (备份状态信息)
├── Info.plist           (设备信息摘要)
└── xx/                  (SHA1 哈希命名的目录)
    └── xxxxxxxxxxxx     (实际备份文件，以域-相对路径的 SHA1 命名)
```

**Manifest.db 结构分析**

```sql
SELECT * FROM Files LIMIT 10;

字段说明：
- fileID: 文件的 SHA1 哈希（域-相对路径）
- domain: 文件所属域（如 AppDomain-com.tencent.mm）
- relativePath: 相对于域的相对路径
- flags: 文件类型标志
- file: BLOB 类型，存储实际文件内容
```

```bash
使用 SQLite 查询备份中的特定文件：
sqlite3 Manifest.db "SELECT fileID, domain, relativePath FROM Files WHERE relativePath LIKE '%sms.db%';"
```

**备份解密流程**

未加密备份可以直接读取文件内容。加密备份的解密过程如下：

```
加密备份密钥派生流程：
用户密码
  └── PBKDF2 (iterations from Manifest.plist)
       └── Backup Key
            └── AES-128-CBC 解密 Manifest.plist 中的 Class Keys
                 └── 各 Data Protection Class 的密钥
                      └── 解密各文件的 Per-file Key
                           └── 解密文件内容
```

```python
import hashlib
import plistlib

def derive_backup_key(password, manifest_plist_path):
    with open(manifest_plist, 'rb') as f:
        manifest = plistlib.load(f)
    
    backup_key = manifest['BackupKeyBag']['KEY']
    salt = manifest['BackupKeyBag']['SALT']
    iterations = manifest['BackupKeyBag']['ITER']
    
    derived_key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt,
        iterations
    )
    return derived_key
```

**加密备份破解挑战**

iOS 加密备份使用 PBKDF2 进行密钥派生，默认迭代次数在 iOS 10+ 中为 10,000,000 次。这意味着暴力破解的速度极其缓慢。在实际取证中，如果无法获取密码，通常需要依赖 Cellebrite 等商业工具利用硬件加速或漏洞进行提取。

### 2.4 Keychain 数据提取

iOS Keychain 存储了应用和系统保存的敏感凭据，包括密码、证书、加密密钥等。

```
Keychain 数据库位置：
/private/var/Keychains/keychain-2.db

Keychain 表结构：
- genp: 通用密码（Generic Password）
- inet: 互联网密码（Internet Password）
- certs: 证书
- keys: 密钥
```

Keychain 条目包含以下关键字段：

| 字段 | 说明 |
|------|------|
| svce | 服务名称 |
| acct | 账户名 |
| pwd | 密码（加密存储） |
| agrp | App Group 标识 |
| v_Data | 加密的密码数据 |

```bash
使用 security 命令导出 Keychain（需要越狱或 Root）：
security dump-keychain -d > keychain_dump.txt
```

### 2.5 系统日志分析

iOS 使用 oslog（Unified Logging System）替代了传统的 syslog。日志数据对于重建设备使用历史至关重要。

```
日志存储位置：
/private/var/db/diagnostics/     (诊断日志)
/private/var/db/uuidtext/        (UUID 映射文本)
/private/var/log/                (传统日志)
```

```bash
提取和分析 iOS 日志：
idevicesyslog -u <UDID> > syslog_capture.txt
```

关键日志分析点：
- 网络连接事件（WiFi 连接/断开、VPN 状态变化）
- App 启动和崩溃记录
- 位置服务使用情况
- 蓝牙设备连接记录
- 系统安全事件（解锁/锁定/密码输入）

### 2.6 越狱检测与影响分析

越狱（Jailbreak）会显著改变 iOS 的安全状态，影响取证数据的完整性和可信度。

**越狱检测方法**

```bash
文件系统检查：
ls /Applications/Cydia.app
ls /bin/bash
ls /usr/sbin/sshd
ls /usr/bin/ssh
ls /private/var/lib/apt/
ls /private/var/lib/cydia/
ls /Library/MobileSubstrate/MobileSubstrate.dylib

进程检查：
ps aux | grep -i cydia
ps aux | grep -i substrate
ps aux | grep -i frida
```

**越狱对取证的影响**

| 影响维度 | 具体影响 |
|---------|---------|
| 数据完整性 | 越狱工具可能修改系统文件，影响哈希校验 |
| 安全状态 | Data Protection 可能被绕过 |
| 恶意软件风险 | 越狱设备更容易被植入恶意软件 |
| 证据可信度 | 需要证明取证操作未修改原始数据 |

---

## 0x03 Android 文件系统与分区取证

### 3.1 Android 分区结构

Android 设备使用多个分区来组织存储，理解分区结构是取证工作的基础：

| 分区 | 挂载点 | 文件系统 | 内容说明 |
|------|--------|---------|---------|
| boot | /boot | raw | 内核和 ramdisk |
| system | /system | ext4/erofs | Android 系统文件 |
| vendor | /vendor | ext4/erofs | 硬件相关库和二进制 |
| data | /data | ext4/f2fs | 用户数据和 App 数据 |
| cache | /cache | ext4 | 系统缓存 |
| recovery | /recovery | raw | 恢复模式镜像 |
| misc | /misc | raw | 杂项信息（启动模式等） |
| persist | /persist | ext4 | 传感器校准等持久化数据 |
| modem | /firmware | raw | 基带固件 |
| userdata | /data | ext4/f2fs | 用户数据（部分设备与 data 合并） |

```bash
查看 Android 分区信息：
adb shell cat /proc/partitions
adb shell ls -la /dev/block/bootdevice/by-name/
adb shell df -h
```

### 3.2 ext4/f2fs 文件系统取证

**ext4 文件系统**

ext4 是 Android 早期版本中广泛使用的文件系统。取证关键点：

```
ext4 取证特征：
- Journal（日志）：ext4 使用 JBD2 日志，可以恢复最近的文件操作
- Inode 信息：文件创建时间（crtime）、修改时间（mtime）、访问时间（atime）、状态变更时间（ctime）
- 已删除文件：通过 unallocated inode 和数据块可能恢复已删除文件
- 碎片化模式：f2fs 的 GC 机制使得数据恢复更加困难
```

```bash
使用 debugfs 分析 ext4 镜像：
debugfs -R "ls -d /data/data/com.tencent.mm" extracted_data.img
debugfs -R "cat /data/data/com.tencent.mm/databases/EnMicroMsg.db" extracted_data.img
```

**f2fs（Flash-Friendly File System）**

f2fs 是专为 NAND Flash 设计的日志文件系统，从 Android 4.4 开始引入。

```
f2fs 取证挑战：
- 激进的垃圾回收（GC）机制会快速覆写已删除数据
- 日志结构使得传统的数据恢复方法效果有限
- 需要专门工具进行 f2fs 日志分析
```

```bash
使用 fsck.f2fs 检查文件系统完整性：
fsck.f2fs -a /dev/block/sda
```

### 3.3 /data 分区关键目录结构

```
/data/
├── data/
│   └── <package_name>/           (各 App 的数据目录)
│       ├── databases/            (SQLite 数据库)
│       ├── shared_prefs/         (SharedPreferences XML)
│       ├── files/                (应用文件)
│       ├── cache/                (应用缓存)
│       └── code_cache/           (代码缓存)
├── system/
│   └── ce/                       (Credential Encrypted 数据)
│       └── <user_id>/
│           └── <package_name>/
├── system_ce/                    (系统 CE 数据)
├── misc/
│   ├── de/                       (Device Encrypted 数据)
│   └── profiles/                 (多用户配置)
├── app/                          (已安装 App 的 APK)
├── dalvik-cache/                 (DEX 优化缓存)
├── system/                       (系统配置数据)
├── media/                        (媒体文件)
│   └── 0/                        (主用户的外部存储)
│       ├── DCIM/                 (相机照片)
│       ├── Download/             (下载文件)
│       ├── Android/
│       │   ├── data/             (App 外部数据)
│       │   └── media/            (App 媒体文件)
│       └── WhatsApp/             (WhatsApp 数据)
└── vendor/                       (厂商自定义数据)
```

### 3.4 Android 数据保护机制

**全盘加密（FDE - Full Disk Encryption）**

Android 5.0-5.1 引入，使用单一密钥加密整个 data 分区：

```
FDE 架构：
用户密码/PIN
  └── scrypt KDF
       └── Master Key (存储在 TEE 中)
            └── dm-crypt 加密 data 分区
```

FDE 的缺陷在于：设备一旦解锁，整个 data 分区即可访问，无法对单个文件实施细粒度的访问控制。

**文件级加密（FBE - File Based Encryption）**

Android 7.0+ 引入，每个文件使用独立的密钥加密：

```
FBE 架构：
Master Key (TEE 保护)
  └── Per-file Key
       └── 文件内容

两种存储类型：
- CE (Credential Encrypted): 用户认证后可访问
- DE (Device Encrypted): 设备启动后即可访问（无需用户认证）
```

```bash
检查加密状态：
adb shell getprop ro.crypto.state
adb shell getprop ro.crypto.type       (0=FDE, 1=FBE)
adb shell getprop ro.crypto.fde.algorithm
```

### 3.5 Recovery 模式与 Fastboot 取证

**Recovery 模式**

Recovery 模式提供了一个有限的 Linux 环境，可以用于备份和恢复操作。

```bash
进入 Recovery 模式后的可用操作：
- 应用 OTA 更新
- 清除 cache 分区
- 执行 factory reset
- 通过 ADB sideload 推送更新包

取证价值：
- recovery 日志可能包含设备操作历史
- /cache/recovery/ 目录下的日志文件
```

**Fastboot 模式**

Fastboot 是底层的刷机协议，允许直接与 bootloader 交互。

```bash
Fastboot 取证命令：
fastboot getvar all                    (获取设备所有变量信息)
fastboot oem dump-charger              (充电状态信息)
fastboot oem dump-factory              (出厂信息)
fastboot getvar serialno               (序列号)
fastboot getvar unlock_ability         (解锁状态)
```

### 3.6 SELinux 策略对取证的影响

SELinux（Security-Enhanced Linux）在 Android 4.3 引入，从 Android 5.0 开始强制执行（Enforcing）。

```bash
检查 SELinux 状态：
adb shell getenforce
adb shell dmesg | grep -i "avc: denied"
adb shell cat /sys/fs/selinux/enforce
```

SELinux 对取证的影响：

| 影响 | 说明 |
|------|------|
| 进程隔离 | 即使 Root 权限也可能被 SELinux 策略阻止访问某些文件 |
| 文件标签 | 每个文件都有安全上下文标签，影响访问控制 |
| 取证工具限制 | 取证工具需要正确的 SELinux 上下文才能正常工作 |
| 日志价值 | AVC denied 日志可以揭示未授权的访问尝试 |

```bash
临时禁用 SELinux（需要 Root）：
adb shell setenforce 0
```

### 3.7 Android 版本安全变化

| 版本 | 关键安全变化 | 取证影响 |
|------|------------|---------|
| Android 8.0 | 项目 Treble 分离 vendor 分区 | 增加了 vendor 分区取证点 |
| Android 9.0 | 强制 FBE，移除 FDE 支持 | 文件级加密成为标配 |
| Android 10 | 强制 FBE，Scoped Storage | App 数据访问进一步受限 |
| Android 11 | Scoped Storage 增强 | 外部存储访问受限 |
| Android 12 | 蓝牙/相机/麦克风权限细分 | 权限使用记录更加精细 |
| Android 13 | 照片/视频/音频权限分离 | 媒体文件访问需要逐项授权 |
| Android 14 | 部分照片访问/后台启动限制 | 进一步限制 App 行为 |

### 3.8 Root 检测与影响分析

Root 会从根本上改变 Android 的安全模型，影响取证数据的完整性。

**常见 Root 方法**

| 方法 | 工具 | 特点 |
|------|------|------|
| Systemless Root | Magisk | 不修改 /system 分区，通过 boot image 补丁实现 |
| 传统 Root | SuperSU (已停止维护) | 直接修改 /system 分区 |
| Kernel Root | KernelSU | 内核级别实现，更难检测 |
| 模拟器 Root | Android Emulator | 开发环境默认具有 Root |

```bash
Root 痕迹检测：
adb shell which su
adb shell find / -name "su" -type f 2>/dev/null
adb shell ls -la /system/xbin/su
adb shell ls -la /system/bin/su
adb shell ls -la /sbin/su
adb shell pm list packages | grep -i magisk
adb shell ls -la /data/adb/magisk/
```

---

## 0x04 App 数据存储与 SQLite 取证

### 4.1 iOS App 沙箱结构

每个 iOS App 运行在独立的沙箱环境中，其目录结构如下：

```
App Sandbox:
├── AppName.app/              (App Bundle，只读)
├── Documents/                (用户生成的数据，iTunes 可见)
├── Library/
│   ├── Application Support/  (应用支持文件)
│   ├── Caches/               (可重新生成的缓存数据)
│   ├── Preferences/          (偏好设置 plist 文件)
│   ├── Cookies/              (HTTP Cookie)
│   └── Logs/                 (应用日志)
├── tmp/                      (临时文件，系统可能随时清理)
└── SystemData/               (系统数据，iOS 15+)
```

### 4.2 Android App 数据目录

```
Android App 数据目录：
/data/data/<package_name>/
├── databases/                (SQLite 数据库)
├── shared_prefs/             (SharedPreferences XML 文件)
├── files/                    (应用内部文件)
├── cache/                    (应用缓存)
├── code_cache/               (Dex 代码缓存)
└── lib/                      (Native 库)

外部存储：
/sdcard/Android/data/<package_name>/
/sdcard/Android/media/<package_name>/
```

```bash
提取 Android App 数据：
adb backup -f app_backup.ab com.tencent.mm
adb backup -f app_backup.ab -noapk com.whatsapp

转换 AB 格式为 TAR：
dd if=app_backup.ab bs=24 skip=1 | python3 -c "
import zlib, sys
sys.stdout.buffer.write(zlib.decompress(sys.stdin.buffer.read()))
" > app_backup.tar
```

### 4.3 SQLite 数据库取证核心技术

SQLite 是移动设备上最广泛使用的数据存储格式，几乎所有 App 的核心数据都存储在 SQLite 数据库中。

**WAL（Write-Ahead Logging）文件分析**

WAL 是 SQLite 的日志文件，记录了尚未写入主数据库的变更。WAL 文件在取证中极其重要，因为它可能包含已删除但尚未被清理的数据。

```
WAL 文件结构：
- 主数据库文件：chat.db
- WAL 文件：chat.db-wal
- 共享内存文件：chat.db-shm

WAL 帧格式：
- 帧头（24 字节）：页码、数据库大小、校验和
- 帧数据：完整的数据库页内容
```

```python
import sqlite3
import os

def analyze_wal(db_path):
    wal_path = db_path + '-wal'
    if os.path.exists(wal_path):
        wal_size = os.path.getsize(wal_path)
        print(f"WAL 文件大小: {wal_size} bytes")
        
        with open(wal_path, 'rb') as f:
            header = f.read(32)
            magic = int.from_bytes(header[:4], 'big')
            version = int.from_bytes(header[4:8], 'big')
            page_size = int.from_bytes(header[8:12], 'big')
            print(f"WAL Magic: 0x{magic:08x}")
            print(f"版本: {version}")
            print(f"页大小: {page_size}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    print(f"数据库表: {[t[0] for t in tables]}")
    conn.close()

analyze_wal('/path/to/chat.db')
```

**已删除记录恢复**

SQLite 删除记录时，只是将对应页面的空间标记为可用，实际数据可能仍然存在：

```python
import re

def recover_deleted_records(db_path):
    with open(db_path, 'rb') as f:
        content = f.read()
    
    freed_pattern = rb'\x00[\x00-\xff]{2,}?\x00'
    matches = re.findall(rb'[\x20-\x7e]{10,}', content)
    
    recovered = []
    for match in matches:
        try:
            text = match.decode('utf-8', errors='ignore')
            if len(text) > 10 and any(c.isalpha() for c in text):
                recovered.append(text)
        except:
            pass
    
    return recovered

deleted_data = recover_deleted_records('/path/to/chat.db')
for item in deleted_data[:20]:
    print(f"恢复数据: {item}")
```

**数据库碎片分析**

SQLite 的 free page 和 free block 中可能包含历史数据：

```sql
分析 SQLite 碎片：
PRAGMA freelist_count;
PRAGMA page_count;
PRAGMA page_size;

提取空闲页面：
SELECT count(*) FROM pragma_freelist_count;
```

```python
def extract_free_pages(db_path):
    with open(db_path, 'rb') as f:
        page_size = 1024
        f.seek(16)
        page_size = int.from_bytes(f.read(2), 'big')
        if page_size == 1:
            page_size = 65536
        
        f.seek(0)
        content = f.read()
        
        free_pages = []
        for i in range(0, len(content), page_size):
            page = content[i:i+page_size]
            if page[0] == 0x00 and page[1] == 0x00:
                free_pages.append(page)
    
    return free_pages
```

**时间戳解析**

移动设备上存在多种时间戳格式，正确解析是时间线重建的关键：

| 时间戳类型 | 基准时间 | 单位 | 示例 |
|-----------|---------|------|------|
| Unix Timestamp | 1970-01-01 00:00:00 UTC | 秒 | 1700000000 |
| Unix ms | 1970-01-01 00:00:00 UTC | 毫秒 | 1700000000000 |
| WebKit/Chrome | 1601-01-01 00:00:00 UTC | 微秒 | 13340000000000000 |
| CoreData/Mac Absolute | 2001-01-01 00:00:00 UTC | 秒 | 700000000 |
| Android SystemClock | 1970-01-01 00:00:00 UTC | 毫秒 | 1700000000000 |

```python
from datetime import datetime, timedelta

def convert_timestamp(value, ts_type='unix'):
    if ts_type == 'unix':
        return datetime.utcfromtimestamp(value)
    elif ts_type == 'unix_ms':
        return datetime.utcfromtimestamp(value / 1000)
    elif ts_type == 'webkit':
        epoch = datetime(1601, 1, 1)
        return epoch + timedelta(microseconds=value)
    elif ts_type == 'coredata':
        epoch = datetime(2001, 1, 1)
        return epoch + timedelta(seconds=value)
    elif ts_type == 'android':
        return datetime.utcfromtimestamp(value / 1000)
```

### 4.4 关键 App 数据库分析

**微信（WeChat）**

微信是取证中最常遇到的 App 之一，其数据存储结构复杂且具有加密保护。

```
微信数据库文件：
EnMicroMsg.db        (主消息数据库，SQLCipher 加密)
WXFileDB.db          (文件数据库)
WxFileIndex2.db      (文件索引)
MicroMsg.db          (联系人/群组信息)
Sns.db               (朋友圈数据)
```

```
微信数据库加密：
- 加密算法：SQLCipher (AES-256-CBC)
- 密钥派生：IMEI + UIN → MD5 → 前 7 位作为密钥
- 页大小：1024 字节
- KDF 迭代：256,000 次

获取密钥的方法：
1. 从内存中提取（需要 Root）
2. 从 libxlog 或 mmkv 配置文件中提取
3. 通过 Xposed 模块 Hook 获取
```

```bash
使用 sqlcipher 解密微信数据库：
sqlcipher EnMicroMsg.db
PRAGMA key = 'abcdef1';
PRAGMA cipher_page_size = 1024;
PRAGMA kdf_iter = 256000;
PRAGMA cipher_hmac_algorithm = HMAC_SHA1;
PRAGMA cipher_kdf_algorithm = PBKDF2_HMAC_SHA1;
.tables
```

**WhatsApp**

```
WhatsApp 数据库文件：
msgstore.db          (消息数据库，SQLCipher 加密)
wa.db                (主数据库)
axolotl.db           (加密密钥)

WhatsApp 加密：
- 加密算法：SQLCipher (AES-256-GCM)
- 密钥存储在 /data/data/com.whatsapp/files/key
- 备份文件（.crypt14/.crypt15）可从 Google Drive 获取
```

**Telegram**

```
Telegram 数据库文件：
cache4.db            (主缓存数据库)
Telegram 特点：
- 默认不存储消息在本地（Secret Chat 除外）
- 普通聊天的本地缓存包含部分消息
- 数据库使用自定义加密方案
- 媒体文件存储在独立的缓存目录
```

```bash
Telegram 缓存数据库分析：
sqlite3 cache4.db
SELECT * FROM messages ORDER BY date DESC LIMIT 20;
SELECT * FROM chats WHERE uid > 0;
```

**支付宝/银行 App**

```
支付宝关键数据：
com.eg.android.AlipayGphone/
├── databases/
│   ├── alipay.db        (主数据库)
│   └── setting.db       (设置数据)
└── shared_prefs/
    └── alipay_setting.xml

银行 App 特点：
- 大多数银行 App 使用 Root Detection 防止在 Root 设备上运行
- 敏感数据通常通过安全键盘输入
- 交易记录可能仅存储在服务器端
- 本地缓存可能包含交易摘要和账户信息
```

### 4.5 沙箱外数据存储分析

```
Android 沙箱外存储位置：
/sdcard/                          (共享存储)
/sdcard/DCIM/                     (相机照片和视频)
/sdcard/Download/                 (下载文件)
/sdcard/Documents/                (文档)
/sdcard/Android/data/             (App 外部数据目录)
/sdcard/Android/media/            (App 媒体目录)

取证价值：
- 社交 App 的媒体缓存（图片/视频/语音）
- 下载的文件和文档
- App 的外部数据库和缓存
- 缩略图缓存（.thumbnails 目录）
```

```python
import os
import sqlite3

def extract_app_data_summary(device_path):
    data_dirs = [
        os.path.join(device_path, 'data/data/'),
        os.path.join(device_path, 'sdcard/Android/data/'),
    ]
    
    results = {}
    for data_dir in data_dirs:
        if os.path.exists(data_dir):
            for pkg in os.listdir(data_dir):
                pkg_path = os.path.join(data_dir, pkg)
                db_files = []
                for root, dirs, files in os.walk(pkg_path):
                    for f in files:
                        if f.endswith('.db') or f.endswith('.sqlite'):
                            db_files.append(os.path.join(root, f))
                if db_files:
                    results[pkg] = db_files
    
    return results
```

---

## 0x05 位置信息取证

### 5.1 GPS 数据提取与分析

移动设备的 GPS 模块产生的位置数据是最直接的地理证据。

```
iOS 位置数据位置：
/private/var/mobile/Library/Caches/locationd/
/private/var/mobile/Library/Caches/com.apple.maps/
/private/var/mobile/Library/Preferences/com.apple.locationd.plist

Android 位置数据位置：
/data/data/com.google.android.gms/databases/
/data/data/com.google.android.apps.maps/databases/
/data/misc/gnss/
```

```python
import sqlite3
from datetime import datetime

def extract_ios_location_history(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT timestamp, latitude, longitude, altitude, 
                   speed, course, horizontal_accuracy
            FROM Location
            ORDER BY timestamp DESC
            LIMIT 100
        """)
        
        locations = cursor.fetchall()
        for loc in locations:
            ts = datetime.utcfromtimestamp(loc[0] + 978307200)
            print(f"{ts} | Lat: {loc[1]:.6f} | Lon: {loc[2]:.6f} | "
                  f"Alt: {loc[3]:.1f}m | Speed: {loc[4]:.1f}m/s")
    except Exception as e:
        print(f"查询失败: {e}")
    
    conn.close()
```

### 5.2 基站定位数据

基站定位提供了比 GPS 更广泛（但精度较低）的位置信息，即使 GPS 被关闭也会记录。

```
基站定位参数：
- MCC (Mobile Country Code): 移动国家代码（中国: 460）
- MNC (Mobile Network Code): 移动网络代码
- LAC (Location Area Code): 位置区域代码
- CID (Cell ID): 基站编号
- TAC (Tracking Area Code): 4G/LTE 跟踪区域代码
- ECI (E-UTRAN Cell Identity): 4G 小区标识

中国运营商 MNC：
- 46000/46002/46007: 中国移动
- 46001/46006/46009: 中国联通
- 46003/46005/46011: 中国电信
- 46015: 中国广电
```

```bash
Android 基站信息提取：
adb shell dumpsys telephony.registry | grep -E "mCellInfoLte|mCellInfoNr"
adb shell dumpsys phone | grep -E "CellInfo|LAC|CID|MCC|MNC"
```

```python
def decode_cell_location(mcc, mnc, lac, cid):
    operators = {
        '46000': '中国移动', '46002': '中国移动', '46007': '中国移动',
        '46001': '中国联通', '46006': '中国联通', '46009': '中国联通',
        '46003': '中国电信', '46005': '中国电信', '46011': '中国电信',
    }
    mnc_str = f"{mcc}{mnc:02d}"
    operator = operators.get(mnc_str, f'未知运营商 ({mnc_str})')
    return {
        'operator': operator,
        'lac': lac,
        'cid': cid,
        'coverage_radius': '500m-5km (城市) / 5km-35km (农村)'
    }
```

### 5.3 WiFi 定位数据

WiFi 定位通过扫描周围 WiFi 热点的 BSSID（MAC 地址）和信号强度来确定位置。

```
iOS WiFi 数据：
/private/var/mobile/Library/SystemConfiguration/com.apple.wifi.plist
/private/var/preferences/SystemConfiguration/com.apple.wifi.plist

Android WiFi 数据：
/data/misc/wifi/
/data/data/com.google.android.gms/databases/
```

```python
import plistlib
import json

def extract_wifi_networks(plist_path):
    with open(plist_path, 'rb') as f:
        plist = plistlib.load(f)
    
    known_networks = []
    if 'List of known networks' in plist:
        for network in plist['List of known networks']:
            ssid = network.get('SSID_STR', 'Unknown')
            bssid = network.get('BSSID', 'Unknown')
            last_join = network.get('lastJoined', 'Unknown')
            known_networks.append({
                'ssid': ssid,
                'bssid': bssid,
                'last_joined': str(last_join)
            })
    
    return known_networks
```

### 5.4 地图应用历史

**Apple Maps**

```
Apple Maps 数据位置：
/private/var/mobile/Library/Maps/
/private/var/mobile/Containers/Data/Application/

关键数据库：
- GeodUserActions.db: 用户操作记录
- LocalCache.db: 本地缓存
- MapsSync.db: 同步数据
```

**Google Maps**

```
Google Maps 数据位置：
/data/data/com.google.android.apps.maps/databases/
/data/data/com.google.android.apps.maps/files/

关键数据库：
- history.db: 搜索和导航历史
- gmm-myplaces.db: 地点标记
- maps.db: 地图缓存
```

```bash
提取 Google Maps 搜索历史：
adb pull /data/data/com.google.android.apps.maps/databases/history.db
sqlite3 history.db
SELECT * FROM search_history ORDER BY timestamp DESC;
```

### 5.5 EXIF 地理标签分析

照片的 EXIF 数据中可能包含拍摄时的 GPS 坐标。

```python
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS

def extract_gps_from_image(image_path):
    image = Image.open(image_path)
    exif_data = image._getexif()
    
    if not exif_data:
        return None
    
    gps_info = {}
    for tag_id, value in exif_data.items():
        tag = TAGS.get(tag_id, tag_id)
        if tag == 'GPSInfo':
            for gps_tag_id, gps_value in value.items():
                gps_tag = GPSTAGS.get(gps_tag_id, gps_tag_id)
                gps_info[gps_tag] = gps_value
    
    if 'GPSLatitude' in gps_info and 'GPSLongitude' in gps_info:
        lat = _convert_gps_coords(gps_info['GPSLatitude'], gps_info['GPSLatitudeRef'])
        lon = _convert_gps_coords(gps_info['GPSLongitude'], gps_info['GPSLongitudeRef'])
        return {'latitude': lat, 'longitude': lon, 'full_gps': gps_info}
    
    return None

def _convert_gps_coords(coords, ref):
    degrees = coords[0]
    minutes = coords[1]
    seconds = coords[2]
    decimal = degrees + minutes/60 + seconds/3600
    if ref in ('S', 'W'):
        decimal = -decimal
    return decimal
```

### 5.6 位置时间线重建

```python
from datetime import datetime
import json

class LocationTimeline:
    def __init__(self):
        self.events = []
    
    def add_gps_event(self, timestamp, lat, lon, accuracy, source='GPS'):
        self.events.append({
            'timestamp': timestamp,
            'lat': lat,
            'lon': lon,
            'accuracy': accuracy,
            'source': source,
            'type': 'gps_fix'
        })
    
    def add_cell_event(self, timestamp, mcc, mnc, lac, cid):
        self.events.append({
            'timestamp': timestamp,
            'mcc': mcc,
            'mnc': mnc,
            'lac': lac,
            'cid': cid,
            'source': 'CellTower',
            'type': 'cell_connection'
        })
    
    def add_wifi_event(self, timestamp, bssid, ssid, rssi):
        self.events.append({
            'timestamp': timestamp,
            'bssid': bssid,
            'ssid': ssid,
            'rssi': rssi,
            'source': 'WiFi',
            'type': 'wifi_scan'
        })
    
    def generate_timeline(self, start_time=None, end_time=None):
        filtered = self.events
        if start_time:
            filtered = [e for e in filtered if e['timestamp'] >= start_time]
        if end_time:
            filtered = [e for e in filtered if e['timestamp'] <= end_time]
        
        filtered.sort(key=lambda x: x['timestamp'])
        return filtered
    
    def export_geojson(self, output_path):
        features = []
        for event in self.events:
            if 'lat' in event and 'lon' in event:
                feature = {
                    'type': 'Feature',
                    'geometry': {
                        'type': 'Point',
                        'coordinates': [event['lon'], event['lat']]
                    },
                    'properties': {
                        'timestamp': str(event['timestamp']),
                        'source': event['source'],
                        'type': event['type']
                    }
                }
                features.append(feature)
        
        geojson = {'type': 'FeatureCollection', 'features': features}
        with open(output_path, 'w') as f:
            json.dump(geojson, f, indent=2)
```

### 5.7 位置欺骗检测

GPS Spoofing 是攻击者常用的反取证手段，检测方法包括：

```
GPS Spoofing 检测指标：
1. 位置跳变：短时间内出现不合理的位置变化
2. 精度异常：GPS 精度值异常稳定或异常精确
3. 卫星数量：可见卫星数量与实际天空状况不符
4. 速度不一致：GPS 报告的速度与加速度传感器数据不匹配
5. 多源不一致：GPS 位置与基站/WiFi 定位结果差异过大
```

```python
from math import radians, sin, cos, sqrt, atan2

def detect_gps_anomaly(lat1, lon1, lat2, lon2, time_diff):
    R = 6371000
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    distance = R * c
    
    if time_diff > 0:
        speed = distance / time_diff
    else:
        speed = float('inf')
    
    anomalies = []
    if speed > 340:
        anomalies.append(f"速度异常: {speed:.1f} m/s (超过音速)")
    if distance > 100000 and time_diff < 3600:
        anomalies.append(f"距离异常: {distance/1000:.1f} km in {time_diff/60:.1f} min")
    
    return anomalies
```

---

## 0x06 通信记录取证

### 6.1 通话记录分析

通话详单（CDR - Call Detail Records）是通信取证的基础数据。

```
iOS 通话记录数据库：
/private/var/mobile/Library/CallHistoryDB/CallHistory.storedata

Android 通话记录：
content://call_log/calls
/data/data/com.android.providers.contacts/databases/calllog.db
```

```bash
提取 Android 通话记录：
adb shell content query --uri content://call_log/calls --projection "number:date:duration:type:name"
```

```sql
分析 iOS 通话记录：
SELECT ZADDRESS as phone_number,
       datetime(ZDATE + 978307200, 'unixepoch') as call_time,
       ZDURATION as duration_sec,
       ZORIGINATED as direction,
       ZDEVICE_ID as device_id
FROM ZCALLRECORD
ORDER BY ZDATE DESC;
```

### 6.2 SMS/MMS 数据存储与恢复

```
iOS 短信数据库：
/private/var/mobile/Library/SMS/sms.db

关键表结构：
- message: 消息内容（text, date, is_from_me）
- handle: 联系人标识（id, userid, country）
- chat: 会话信息
- chat_message_join: 消息与会话的关联
- attachment: 附件信息

Android 短信数据库：
/data/data/com.android.providers.telephony/databases/mmssms.db
/data/data/com.android.providers.telephony/databases/telephony.db
```

```sql
iOS 短信完整查询：
SELECT 
    datetime(message.date + 978307200, 'unixepoch') as msg_time,
    handle.id as contact,
    message.text as content,
    message.is_from_me as sent_by_me,
    attachment.filename as attachment_path
FROM message
LEFT JOIN handle ON message.handle_id = handle.ROWID
LEFT JOIN attachment ON message.ROWID = attachment.message_id
ORDER BY message.date DESC;
```

### 6.3 iMessage 取证

iMessage 使用 Apple 的端到端加密协议，消息内容在传输过程中加密，但在设备本地以明文形式存储在数据库中。

```
iMessage 数据位置：
/private/var/mobile/Library/Messages/
├── chat.db              (主消息数据库)
├── Attachments/         (附件文件)
│   ├── <chat_id>/
│   │   ├── image.jpg
│   │   └── video.mov
└── Stash/               (临时存储)

chat.db 关键表：
- message: 消息内容
- handle: 发送者/接收者标识
- chat: 会话
- chat_handle_join: 参与者关联
- message_attachment_join: 附件关联
```

```sql
iMessage 完整提取查询：
SELECT 
    datetime(message.date + 978307200, 'unixepoch') as msg_time,
    handle.id as iMessage_id,
    message.text,
    CASE message.is_from_me 
        WHEN 1 THEN 'Sent' 
        ELSE 'Received' 
    END as direction,
    message.cache_has_attachments,
    attachment.mime_type,
    attachment.filename
FROM message
LEFT JOIN handle ON message.handle_id = handle.ROWID
LEFT JOIN message_attachment_join ON message.ROWID = message_attachment_join.message_id
LEFT JOIN attachment ON message_attachment_join.attachment_id = attachment.ROWID
WHERE message.is_audio_message = 0
ORDER BY message.date DESC;
```

### 6.4 即时通讯 App 取证

**微信聊天记录提取**

```
微信消息数据库结构：
EnMicroMsg.db 中的 MSG 表：
- msgSvrId: 服务器消息 ID
- type: 消息类型（1=文本, 3=图片, 34=语音, 43=视频, 47=表情, 48=位置, 49=链接）
- talker: 聊天对象（wxid）
- content: 消息内容
- createTime: 创建时间（Unix 秒）
- imgPath: 媒体文件路径
```

```sql
微信消息提取：
SELECT 
    datetime(createTime, 'unixepoch', 'localtime') as msg_time,
    talker,
    content,
    CASE type
        WHEN 1 THEN '文本'
        WHEN 3 THEN '图片'
        WHEN 34 THEN '语音'
        WHEN 43 THEN '视频'
        WHEN 47 THEN '表情'
        WHEN 48 THEN '位置'
        WHEN 49 THEN '链接/文件'
        ELSE '其他(' || type || ')'
    END as msg_type
FROM MSG
ORDER BY createTime DESC;
```

**Telegram 本地缓存分析**

```
Telegram 缓存数据库：
cache4.db 中的关键表：
- messages: 消息缓存
- users: 用户信息
- chats: 群组/频道信息
- dialogs: 对话列表

注意：Telegram 的普通聊天在本地只保留有限缓存
Secret Chat 的消息端到端加密，本地存储也经过加密
```

**WhatsApp 消息提取**

```
WhatsApp 消息数据库：
msgstore.db 中的 message 表：
- key_remote_jid: 聊天标识
- data: 消息文本
- timestamp: 消息时间戳（毫秒）
- media_wa_type: 媒体类型
- thumb_image: 缩略图
- quoted_row_id: 引用消息 ID
```

```sql
WhatsApp 消息提取：
SELECT 
    datetime(timestamp/1000, 'unixepoch') as msg_time,
    key_remote_jid,
    data,
    CASE media_wa_type
        WHEN 0 THEN '文本'
        WHEN 1 THEN '图片'
        WHEN 2 THEN '音频'
        WHEN 3 THEN '视频'
        WHEN 5 THEN '位置'
        WHEN 9 THEN '文档'
        ELSE '其他'
    END as media_type,
    remote_resource
FROM message
ORDER BY timestamp DESC;
```

### 6.5 社交媒体 App 数据提取

```
常见社交媒体 App 数据位置：

微博 (com.weibo.intl / com.sina.weibo):
- /data/data/com.sina.weibo/databases/
- 本地缓存包含浏览历史、搜索记录

抖音 (com.ss.android.ugc.aweme):
- /data/data/com.ss.android.ugc.aweme/databases/
- 本地缓存包含观看历史、搜索记录、评论数据

Instagram (com.instagram.android):
- /data/data/com.instagram.android/databases/
- 本地缓存包含 Direct Messages

Twitter/X (com.twitter.android):
- /data/data/com.twitter.android/databases/
- 本地缓存包含推文和 DM
```

### 6.6 通信模式分析

```python
from collections import Counter, defaultdict
from datetime import datetime

class CommunicationAnalyzer:
    def __init__(self):
        self.records = []
    
    def add_record(self, timestamp, contact, direction, msg_type, duration=0):
        self.records.append({
            'timestamp': timestamp,
            'contact': contact,
            'direction': direction,
            'msg_type': msg_type,
            'duration': duration
        })
    
    def contact_frequency(self):
        counter = Counter(r['contact'] for r in self.records)
        return counter.most_common(20)
    
    def time_distribution(self):
        hours = Counter()
        for r in self.records:
            if isinstance(r['timestamp'], datetime):
                hours[r['timestamp'].hour] += 1
        return dict(sorted(hours.items()))
    
    def communication_pattern(self, contact):
        contact_records = [r for r in self.records if r['contact'] == contact]
        return {
            'total_count': len(contact_records),
            'sent_count': sum(1 for r in contact_records if r['direction'] == 'out'),
            'received_count': sum(1 for r in contact_records if r['direction'] == 'in'),
            'avg_daily': len(contact_records) / max(1, self._days_span()),
            'first_contact': min(r['timestamp'] for r in contact_records) if contact_records else None,
            'last_contact': max(r['timestamp'] for r in contact_records) if contact_records else None,
        }
    
    def _days_span(self):
        if not self.records:
            return 1
        timestamps = [r['timestamp'] for r in self.records if isinstance(r['timestamp'], datetime)]
        if len(timestamps) < 2:
            return 1
        return max(1, (max(timestamps) - min(timestamps)).days)
```

### 6.7 已删除消息恢复技术

```
已删除消息恢复方法：

1. SQLite WAL 文件分析
   - 检查 -wal 文件中是否包含已删除消息的残留

2. 数据库碎片扫描
   - 扫描 SQLite free page 中的残留数据

3. 文件系统未分配空间
   - 对 ext4/f2fs 的 unallocated blocks 进行字符串搜索

4. App 缓存分析
   - 检查 App 的 cache 目录中是否有消息内容的缓存副本

5. 通知日志
   - 系统的通知数据库可能记录了消息的预览内容

6. 第三方备份
   - 检查 iCloud/Google 备份中是否包含消息数据
```

---

## 0x07 云同步数据取证

### 7.1 iCloud 数据取证

**iCloud 备份内容分析**

iCloud 备份包含设备上大部分数据的副本，但不包括：
- 已从 iCloud 同步的数据（通讯录、照片等）
- Apple Pay 信息和设置
- Face ID/Touch ID 设置
- App Store 应用本身

```
iCloud 备份包含的数据：
- App 数据（沙箱内的 Documents 和 Library 数据）
- 设备设置
- 主屏幕布局
- iMessage/短信/彩信
- 通话记录（iOS 11+）
- 健康数据
- HomeKit 数据
- 视觉语音信箱
```

```bash
使用 pymobiledevice3 分析 iCloud 备份：
pip install pymobiledevice3

python3 -c "
from pymobiledevice3.services.mobilebackup2 import Mobilebackup2Service
service = Mobilebackup2Service()
service.list()
"
```

**iCloud Drive 文件同步**

```
iCloud Drive 本地缓存：
iOS: /private/var/mobile/Library/Mobile Documents/
macOS: ~/Library/Mobile Documents/com~apple~CloudDocs/

关键文件：
- .icloud 文件：占位符文件，实际内容存储在云端
- 元数据：包含文件创建/修改时间、文件大小、版本信息
```

**iCloud Keychain**

iCloud Keychain 同步了设备上保存的密码、信用卡信息和安全笔记。

```
iCloud Keychain 数据：
- 同步的密码（网站和 App）
- 信用卡信息
- 安全笔记（Secure Notes）
- 两步验证密钥

取证方法：
1. 从设备本地 Keychain 提取
2. 通过 iCloud 账户访问（需要法律授权）
3. 使用商业工具（如 Elcomsoft Phone Breaker）
```

### 7.2 Google 账户数据取证

**Google 备份与恢复**

```
Google 备份包含的数据：
- App 数据（通过 Google One 备份）
- 设备设置
- WiFi 密码
- 通话记录
- 短信（部分设备）
- 联系人

备份数据获取：
1. 从设备本地提取 Google 备份缓存
2. 通过 Google Takeout 导出（需要账户访问权限）
3. 通过法律程序向 Google 请求数据
```

```bash
提取 Android 设备上的 Google 账户信息：
adb shell dumpsys account | grep -A5 "Account {"
adb shell content query --uri content://com.google.android.gsf.gservices --where "name=\'android_id\'"
```

**Google Photos 元数据**

```
Google Photos 本地数据：
/data/data/com.google.android.apps.photos/
├── databases/
│   ├── photos.db
│   └── local_media.db
└── cache/

元数据包含：
- 原始拍摄时间和位置
- 编辑历史
- 分享记录
- 相册组织结构
```

**Google 账户活动日志**

```
Google 账户活动数据来源：
- myaccount.google.com/security: 安全事件
- myactivity.google.com: 活动历史
- google.com/maps/timeline: 位置时间线
- gmail.com: 邮件活动

取证方法：
1. Google Takeout 导出完整数据
2. Google 执法请求（Law Enforcement Response）
3. 设备本地 Google 服务缓存
```

### 7.3 第三方云同步

```
常见第三方云同步 App 数据位置：

Dropbox:
/data/data/com.dropbox.android/
- 本地缓存包含同步文件的元数据
- 缩略图缓存

OneDrive:
/data/data/com.microsoft.skydrive/
- 离线文件缓存
- 同步历史

百度网盘:
/data/data/com.baidu.netdisk/
- 下载文件缓存
- 上传队列数据
- 分享记录
```

### 7.4 云端 vs 本地数据差异分析

| 数据类型 | 本地存在 | 云端存在 | 差异说明 |
|---------|---------|---------|---------|
| 已删除消息 | 可能残留 | 通常已删除 | 本地 SQLite 碎片可能恢复 |
| 照片/视频 | 原始文件 | 压缩版本（部分服务） | 本地 EXIF 更完整 |
| 通讯录 | 完整数据 | 同步版本 | 云端可能包含多设备合并数据 |
| App 数据 | 当前状态 | 备份时间点 | 时间差异可能导致数据不一致 |
| 通话记录 | 设备存储 | 运营商记录 | 云端可能包含更长时间范围 |

### 7.5 多设备同步冲突取证

```
同步冲突场景：
1. 同一联系人：不同设备修改了不同字段
2. 同一文件：不同设备同时编辑
3. 消息时间线：跨设备消息的时间排序
4. 位置数据：不同设备的位置记录合并

取证方法：
- 比较各设备上的数据版本
- 分析同步时间戳和版本号
- 检查冲突解决日志
- 重建数据变更的完整时间线
```

---

## 0x08 移动恶意软件分析

### 8.1 iOS 恶意软件特征

**企业证书签名滥用**

```
企业证书滥用检测：
1. 检查已安装的描述文件：
   设置 → 通用 → VPN与设备管理

2. 通过命令行检查：
   security find-identity -v -p codesigning
   
3. 检查企业证书签名的 App：
   - 非 App Store 来源
   - 证书颁发者为企业实体
   - 可能包含恶意功能
```

**侧载应用检测**

```bash
iOS 侧载检测方法：
1. 检查非标准 App 安装路径
2. 验证 App 的代码签名
3. 检查描述文件（Profile）
4. 分析 App 的 entitlements

使用 ideviceinstaller 列出已安装 App：
ideviceinstaller -l -o json
```

**描述文件恶意配置**

```
恶意描述文件特征：
- 安装 CA 根证书（用于中间人攻击）
- 配置 VPN（用于流量劫持）
- 设置 Exchange ActiveSync（用于数据回传）
- 配置 WiFi（用于网络劫持）

检测方法：
1. 列出已安装描述文件
2. 检查 CA 证书存储中的非标准证书
3. 检查 VPN 配置
```

**Pegasus 间谍软件特征**

Pegasus 是由 NSO Group 开发的高级间谍软件，其技术特征包括：

```
Pegasus 检测指标（IOC）：
1. 异常进程：
   - 名称伪装的系统进程
   - 高 CPU 使用率的未知进程
   
2. 网络指标：
   - 与已知 C2 服务器的通信
   - 异常的 DNS 查询模式
   - 非标准端口的 HTTPS 连接

3. 文件系统指标：
   - /private/var/mobile/Library/Preferences/ 中的异常 plist
   - 非标准的 LaunchDaemon/LaunchAgent
   - 异常的 Keychain 条目

4. 利用链特征：
   - FORCEDENTRY: iMessage 零点击利用（CVE-2021-30860）
   - BLASTPASS: iMessage 图像渲染利用
   - KISMET: WiFi 零点击利用
```

### 8.2 Android 恶意软件特征

**权限滥用分析**

```bash
Android 权限审计：
adb shell dumpsys package <package_name> | grep "permission"
adb shell pm list permissions -g -d
adb shell appops get <package_name>

关键危险权限：
- READ_SMS / RECEIVE_SMS: 短信读取
- READ_CONTACTS: 通讯录读取
- RECORD_AUDIO: 录音
- CAMERA: 相机访问
- ACCESS_FINE_LOCATION: 精确定位
- BIND_ACCESSIBILITY_SERVICE: 无障碍服务
- DEVICE_ADMIN: 设备管理器
- SYSTEM_ALERT_WINDOW: 悬浮窗
```

**侧载 APK 分析**

```bash
APK 静态分析：
jadx -d output_dir/ malware.apk
apktool d malware.apk

检查 APK 关键信息：
aapt dump badging malware.apk
unzip -l malware.apk

检查 APK 签名：
apksigner verify --print-certs malware.apk
jarsigner -verify -verbose -certs malware.apk
```

```python
import zipfile
import hashlib

def analyze_apk(apk_path):
    with zipfile.ZipFile(apk_path, 'r') as zf:
        file_list = zf.namelist()
        
        suspicious = []
        for f in file_list:
            if f.endswith('.so') and 'lib/' not in f:
                suspicious.append(f"Native 库异常位置: {f}")
            if f.endswith('.jar') or f.endswith('.dex'):
                if 'classes' not in f and 'lib/' not in f:
                    suspicious.append(f"异常 DEX/JAR: {f}")
            if 'assets/' in f and f.endswith(('.js', '.lua', '.py')):
                suspicious.append(f"脚本文件: {f}")
        
        manifest = zf.read('AndroidManifest.xml')
        
        sha256 = hashlib.sha256(open(apk_path, 'rb').read()).hexdigest()
        
        return {
            'file_count': len(file_list),
            'sha256': sha256,
            'suspicious_files': suspicious,
            'file_list': file_list[:50]
        }
```

**无障碍服务滥用**

```
无障碍服务（Accessibility Service）滥用是 Android 银行木马的常见手法：

攻击流程：
1. 诱导用户启用恶意 App 的无障碍服务
2. 通过无障碍服务监控屏幕内容
3. 读取其他 App 的界面文本（包括银行密码）
4. 自动执行点击操作（自动转账）

检测方法：
adb shell settings get secure enabled_accessibility_services
adb shell dumpsys accessibility

异常特征：
- 非系统 App 请求无障碍服务权限
- 无障碍服务配置中包含大量包名监控
- 服务具有 performGlobalAction 能力
```

**键盘记录/截屏/录音**

```
Android 恶意软件数据采集方式：

键盘记录：
- 无障碍服务 Hook（AccessibilityNodeInfo）
- InputMethodService 替换
- Xposed 框架 Hook

截屏：
- MediaProjection API 滥用
- SurfaceFlinger 直接访问（需要 Root）
- 无障碍服务截屏

录音：
- MediaRecorder / AudioRecord API
- 需要 RECORD_AUDIO 权限
- 后台录音检测
```

### 8.3 移动 APT 组织与工具

| APT 组织 | 主要工具 | 目标平台 | 特征 |
|---------|---------|---------|------|
| NSO Group | Pegasus | iOS/Android | 零点击漏洞利用，国家级客户 |
| Candiru | DevilsEye | iOS/Android | 与 NSO 类似的商业间谍软件 |
| Cytome | Cytome | iOS | 企业监控工具，被滥用于间谍活动 |
| Dark Caracal | FinFisher | Android | 针对中东地区的监控 |
| Lazarus Group | 多种 | Android | 朝鲜关联，侧重金融窃取 |
| APT-C-36 | 多种 | Android | 针对南亚地区的移动攻击 |

### 8.4 动态分析沙箱

```bash
MobSF (Mobile Security Framework) 部署：
docker run -it --rm -p 8000:8000 opensecurity/mobile-security-framework-mobsf

MobSF 分析功能：
- 静态分析：代码审计、权限分析、硬编码密钥检测
- 动态分析：运行时行为监控、API 调用追踪
- 恶意软件检测：基于规则和 ML 的检测
```

```bash
Cuckoo-Droid 部署：
git clone https://github.com/idanr18/Cuckoo-Droid.git
cd Cuckoo-Droid
python3 install.py

Cuckoo-Droid 分析流程：
1. 提交 APK 样本
2. 在 Android 模拟器中运行
3. 监控网络流量、文件操作、API 调用
4. 生成行为报告
```

### 8.5 YARA 规则：移动恶意软件特征

```yara
rule Android_Banking_Trojan_Generic {
    meta:
        description = "检测 Android 银行木马通用特征"
        author = "Security Research"
        date = "2026-07"
    
    strings:
        $overlay = {50 4B 03 04}
        $s1 = "android.accessibilityservice.AccessibilityService" ascii
        $s2 = "performGlobalAction" ascii
        $s3 = "TYPE_WINDOW_STATE_CHANGED" ascii
        $s4 = "getWindows" ascii
        $s5 = "AccessibilityNodeInfo" ascii
        $s6 = "android.permission.READ_SMS" ascii
        $s7 = "android.permission.RECEIVE_SMS" ascii
        $s8 = "android.app.admin.DeviceAdminReceiver" ascii
        $url1 = /https?:\/\/[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/
        $url2 = /\.onion\b/
    
    condition:
        $overlay and 3 of ($s*) and ($url1 or $url2)
}

rule iOS_Jailbreak_Detection_Bypass {
    meta:
        description = "检测越狱检测绕过工具特征"
        author = "Security Research"
        date = "2026-07"
    
    strings:
        $s1 = "/Applications/Cydia.app" ascii
        $s2 = "/Library/MobileSubstrate" ascii
        $s3 = "cydia://package/" ascii
        $s4 = "RVPBridgeExtension" ascii
        $s5 = "FLEXLoader" ascii
        $hook1 = "MSHookMessageEx" ascii
        $hook2 = "MSHookFunction" ascii
        $hook3 = "_objc_msgForward" ascii
    
    condition:
        3 of them
}
```

---

## 0x09 越狱/Root 检测与设备完整性

### 9.1 iOS 越狱检测方法

越狱会破坏 iOS 的沙箱安全模型，使取证人员能够访问完整的文件系统。但同时也意味着设备可能已被恶意软件感染。

**文件系统检查法**

```bash
常见越狱痕迹文件检测：
ls /Applications/Cydia.app
ls /Applications/Sileo.app
ls /Applications/Zebra.app
ls /bin/bash
ls /bin/sh
ls /usr/sbin/sshd
ls /usr/bin/ssh
ls /usr/libexec/sftp-server
ls /private/var/lib/apt/
ls /private/var/lib/cydia/
ls /private/var/cache/apt/
ls /private/var/stash/
ls /Library/MobileSubstrate/MobileSubstrate.dylib
ls /Library/MobileSubstrate/DynamicLibs/
ls /usr/lib/TweakInject/
ls /private/var/lib/dpkg/info
```

**进程列表检查**

```bash
检查越狱相关进程：
ps aux | grep -i cydia
ps aux | grep -i substrate
ps aux | grep -i substitute
ps aux | grep -i electra
ps aux | grep -i undecimus
ps aux | grep -i frida
ps aux | grep -i cycript
ps aux | grep -i sileo
ps aux | grep -i zebra
```

**动态库注入检测**

```bash
检查 DYLD_INSERT_LIBRARIES 环境变量：
echo $DYLD_INSERT_LIBRARIES

检查已加载的动态库：
DYLD_PRINT_LIBRARIES=1 /path/to/app

检查 Tweak 注入：
ls /Library/MobileSubstrate/DynamicLibs/*.dylib
ls /usr/lib/TweakInject/*.dylib
```

**系统调用完整性验证**

```python
import ctypes
import os

def check_syscall_integrity():
    suspicious = []
    
    fork_check = os.fork()
    if fork_check == 0:
        os._exit(0)
    
    if os.access('/bin/bash', os.F_OK):
        suspicious.append("/bin/bash exists")
    if os.access('/usr/sbin/sshd', os.F_OK):
        suspicious.append("sshd exists")
    
    try:
        with open('/etc/apt/sources.list', 'r') as f:
            suspicious.append("APT sources.list found")
    except FileNotFoundError:
        pass
    
    try:
        result = os.system('which dpkg')
        if result == 0:
            suspicious.append("dpkg found")
    except:
        pass
    
    return suspicious
```

### 9.2 Android Root 检测方法

**su 二进制文件检测**

```bash
全面搜索 su 二进制文件：
adb shell find / -name "su" -type f 2>/dev/null
adb shell find / -name "su" -type l 2>/dev/null
adb shell which su
adb shell ls -la /system/xbin/su
adb shell ls -la /system/bin/su
adb shell ls -la /sbin/su
adb shell ls -la /system/sd/xbin/su
adb shell ls -la /system/bin/failsafe/su
adb shell ls -la /data/local/xbin/su
adb shell ls -la /data/local/bin/su
```

**Magisk 检测**

```bash
Magisk 痕迹检测：
adb shell ls -la /data/adb/magisk/
adb shell ls -la /data/adb/modules/
adb shell ls -la /sbin/.magisk/
adb shell cat /proc/mounts | grep magisk
adb shell cat /proc/mounts | grep tmpfs
adb shell ps -A | grep -i magisk

检查 MagiskHide/Zygisk 状态：
adb shell magisk --denylist status
adb shell cat /data/adb/magisk/util_functions.sh | grep ZYGISK
```

**KernelSU 检测**

```bash
KernelSU 痕迹检测：
adb shell ls -la /data/adb/ksu/
adb shell cat /proc/mounts | grep ksu
adb shell ls -la /data/adb/modules/
adb shell ps -A | grep -i ksu
```

**SELinux 状态检查**

```bash
检查 SELinux 状态：
adb shell getenforce
adb shell cat /sys/fs/selinux/enforce
adb shell dmesg | grep -i selinux

正常设备应显示 Enforcing
如果显示 Permissive 或 Disabled，设备可能被 Root
```

**系统分区完整性**

```bash
验证系统分区完整性：
adb shell dmctl list
adb shell getprop ro.build.fingerprint
adb shell getprop ro.boot.verifiedbootstate
adb shell getprop ro.debuggable
adb shell getprop ro.secure

ro.debuggable 应为 0
ro.secure 应为 1
ro.boot.verifiedbootstate 应为 green
```

### 9.3 设备完整性评估框架

```python
import subprocess
import json

class DeviceIntegrityChecker:
    def __init__(self, platform='android'):
        self.platform = platform
        self.findings = []
    
    def check_android_root(self):
        checks = [
            ('su_binary', 'which su'),
            ('magisk_dir', 'ls /data/adb/magisk/'),
            ('magisk_modules', 'ls /data/adb/modules/'),
            ('selinux_status', 'getenforce'),
            ('debuggable', 'getprop ro.debuggable'),
            ('secure', 'getprop ro.secure'),
            ('boot_state', 'getprop ro.boot.verifiedbootstate'),
            ('custom_rom', 'getprop ro.build.tags'),
        ]
        
        for name, cmd in checks:
            try:
                result = subprocess.run(
                    ['adb', 'shell', cmd],
                    capture_output=True, text=True, timeout=10
                )
                self.findings.append({
                    'check': name,
                    'output': result.stdout.strip(),
                    'status': self._evaluate_android_check(name, result.stdout.strip())
                })
            except Exception as e:
                self.findings.append({
                    'check': name,
                    'error': str(e),
                    'status': 'unknown'
                })
        
        return self.findings
    
    def check_ios_jailbreak(self):
        paths_to_check = [
            '/Applications/Cydia.app',
            '/Applications/Sileo.app',
            '/bin/bash',
            '/usr/sbin/sshd',
            '/usr/libexec/sftp-server',
            '/private/var/lib/apt/',
            '/private/var/lib/cydia/',
            '/Library/MobileSubstrate/MobileSubstrate.dylib',
        ]
        
        for path in paths_to_check:
            try:
                result = subprocess.run(
                    ['ideviceinstaller', '-l'],
                    capture_output=True, text=True, timeout=10
                )
                self.findings.append({
                    'path': path,
                    'exists': 'not found' not in result.stderr.lower()
                })
            except Exception as e:
                self.findings.append({
                    'path': path,
                    'error': str(e)
                })
        
        return self.findings
    
    def _evaluate_android_check(self, name, output):
        risk_map = {
            'su_binary': lambda o: 'compromised' if o and 'not found' not in o else 'clean',
            'magisk_dir': lambda o: 'compromised' if o and 'No such' not in o else 'clean',
            'selinux_status': lambda o: 'compromised' if o != 'Enforcing' else 'clean',
            'debuggable': lambda o: 'compromised' if o == '1' else 'clean',
            'secure': lambda o: 'compromised' if o == '0' else 'clean',
            'boot_state': lambda o: 'compromised' if o != 'green' else 'clean',
        }
        evaluator = risk_map.get(name, lambda o: 'unknown')
        return evaluator(output)
    
    def generate_report(self):
        report = {
            'platform': self.platform,
            'total_checks': len(self.findings),
            'compromised': sum(1 for f in self.findings if f.get('status') == 'compromised'),
            'clean': sum(1 for f in self.findings if f.get('status') == 'clean'),
            'unknown': sum(1 for f in self.findings if f.get('status') == 'unknown'),
            'findings': self.findings
        }
        return json.dumps(report, indent=2)
```

### 9.4 反取证技术检测

攻击者可能使用隐藏 Root/越狱状态的技术，取证人员需要检测这些反取证手段：

| 反取证技术 | 检测方法 |
|-----------|---------|
| MagiskHide / DenyList | 检查 `/data/adb/magisk/.denylist` |
| Shamiko 模块 | 检查 Magisk 模块列表中的 Shamiko |
| Hide My Applist | 检查已安装应用列表中的 Xposed 模块 |
| 内核级隐藏 | 对比 `/proc` 进程列表与 `ps` 输出 |
| SELinux 伪装 | 检查 `/sys/fs/selinux/enforce` 与实际策略是否一致 |
| 文件路径混淆 | 搜索常见越狱文件的变体名称 |

```bash
检测隐藏 Root 的高级方法：
对比进程列表差异：
adb shell ps -A > /tmp/ps_all.txt
adb shell ls /proc/ | grep -E '^[0-9]+$' > /tmp/proc_pids.txt
diff /tmp/ps_all.txt /tmp/proc_pids.txt

检查挂载点异常：
adb shell cat /proc/mounts | grep -E "magisk|ksu|tmpfs|su"
adb shell mount | grep -E "rw.*system|rw.*vendor"
```

---

## 0x0A 证据强度分层与 IOC 提取

### 10.1 移动设备证据强度分类

在移动设备取证中，证据的可靠性和证明力存在差异。以下是证据强度的三级分类体系：

| 强度等级 | 分类 | 证据类型 | 法庭采信度 |
|---------|------|---------|-----------|
| Level 3 | 确认恶意 | 恶意代码样本、C2 通信日志、加密密钥 | 高 |
| Level 2 | 高度可疑 | 异常权限组合、可疑网络连接、隐藏文件 | 中-高 |
| Level 1 | 需要关注 | 异常行为模式、配置变更、时间线异常 | 中 |

**Level 3 - 确认恶意（Confirmed Malicious）**

```
证据类型：
- 已确认的恶意 APK/IPA 文件（含已知恶意签名）
- C2 服务器的网络通信日志（含加密流量解密结果）
- 恶意加密密钥和证书
- 数据外传的完整日志（含目标地址和传输内容）
- 利用漏洞的攻击载荷（exploit payload）
- 键盘记录/截屏/录音的实际数据文件
```

**Level 2 - 高度可疑（Highly Suspicious）**

```
证据类型：
- 请求过多权限的 App（尤其是非正常 App 类型）
- 与已知恶意域名/IP 的网络连接
- 隐藏或伪装的进程和文件
- 异常的 Root/越狱状态
- 非官方渠道安装的应用
- 异常的证书或签名
```

**Level 1 - 需要关注（Needs Attention）**

```
证据类型：
- 异常的电池消耗模式
- 异常的网络流量模式
- 设备性能异常下降
- 异常的弹出广告或重定向
- 未知的描述文件或配置
- 不寻常的系统日志条目
```

### 10.2 移动设备 IOC 类型

```
IOC 分类：

1. App 级别 IOC：
   - 恶意包名（如 com.bank.fakeapp）
   - 异常签名证书指纹
   - 异常的 App 权限组合
   - 非官方应用商店来源

2. 网络级别 IOC：
   - C2 域名和 IP 地址
   - 异常 DNS 查询模式
   - 异常的 TLS 证书指纹
   - 异常的 User-Agent 字符串

3. 文件系统级别 IOC：
   - 异常的持久化文件路径
   - 异常的启动项/LaunchDaemon
   - 异常的 Keychain/Keystore 条目
   - 异常的 Native 库文件

4. 行为级别 IOC：
   - 异常的 API 调用模式
   - 异常的进程创建行为
   - 异常的文件系统操作
   - 异常的网络通信模式
```

```python
import json
import hashlib

class MobileIOCExtractor:
    def __init__(self):
        self.iocs = {
            'malicious_packages': [],
            'suspicious_domains': [],
            'suspicious_ips': [],
            'certificate_fingerprints': [],
            'file_hashes': [],
            'suspicious_urls': [],
            'behavioral_indicators': []
        }
    
    def extract_from_apk(self, apk_path, package_name, permissions, cert_sha256):
        self.iocs['malicious_packages'].append({
            'package_name': package_name,
            'file_hash': hashlib.sha256(open(apk_path, 'rb').read()).hexdigest(),
            'permissions': permissions,
            'cert_fingerprint': cert_sha256
        })
    
    def extract_from_network_logs(self, network_logs):
        for log in network_logs:
            if 'dst_domain' in log:
                self.iocs['suspicious_domains'].append(log['dst_domain'])
            if 'dst_ip' in log:
                self.iocs['suspicious_ips'].append(log['dst_ip'])
            if 'url' in log:
                self.iocs['suspicious_urls'].append(log['url'])
    
    def extract_from_filesystem(self, suspicious_files):
        for f in suspicious_files:
            file_hash = hashlib.sha256(open(f['path'], 'rb').read()).hexdigest()
            self.iocs['file_hashes'].append({
                'path': f['path'],
                'sha256': file_hash,
                'size': f.get('size', 0)
            })
    
    def export_iocs(self, output_path):
        with open(output_path, 'w') as f:
            json.dump(self.iocs, f, indent=2)
        return output_path
```

### 10.3 多源证据关联

移动设备取证需要将多个数据源进行关联，以构建完整的攻击图景：

```
证据关联矩阵：

设备端数据          云端数据              网络数据
─────────────────────────────────────────────────
App 安装记录    ←→  App Store 下载记录  ←→  下载来源 URL
消息内容        ←→  云端消息备份        ←→  消息传输日志
位置数据        ←→  地图服务历史        ←→  基站连接记录
通话记录        ←→  运营商 CDR         ←→  VoIP 流量
浏览器历史      ←→  云同步书签          ←→  DNS 查询日志
文件操作        ←→  云盘同步记录        ←→  文件传输日志
```

```python
from datetime import datetime, timedelta

class EvidenceCorrelator:
    def __init__(self):
        self.device_events = []
        self.cloud_events = []
        self.network_events = []
    
    def add_device_event(self, timestamp, event_type, source, details):
        self.device_events.append({
            'timestamp': timestamp,
            'type': event_type,
            'source': 'device',
            'details': details
        })
    
    def add_cloud_event(self, timestamp, event_type, source, details):
        self.cloud_events.append({
            'timestamp': timestamp,
            'type': event_type,
            'source': 'cloud',
            'details': details
        })
    
    def add_network_event(self, timestamp, event_type, source, details):
        self.network_events.append({
            'timestamp': timestamp,
            'type': event_type,
            'source': 'network',
            'details': details
        })
    
    def correlate_by_time_window(self, window_minutes=5):
        all_events = self.device_events + self.cloud_events + self.network_events
        all_events.sort(key=lambda x: x['timestamp'])
        
        correlated_groups = []
        current_group = []
        
        for event in all_events:
            if not current_group:
                current_group.append(event)
            else:
                time_diff = (event['timestamp'] - current_group[0]['timestamp']).total_seconds()
                if time_diff <= window_minutes * 60:
                    current_group.append(event)
                else:
                    if len(set(e['source'] for e in current_group)) > 1:
                        correlated_groups.append(current_group)
                    current_group = [event]
        
        if len(set(e['source'] for e in current_group)) > 1:
            correlated_groups.append(current_group)
        
        return correlated_groups
```

### 10.4 时间线构建最佳实践

```
时间线构建原则：

1. 统一时间基准
   - 所有时间戳转换为 UTC
   - 注意不同时区和夏令时的影响
   - 处理不同时间戳格式（Unix/WebKit/CoreData）

2. 多源交叉验证
   - 设备日志与网络日志交叉验证
   - 本地时间与服务器时间对比
   - 检查时间戳一致性

3. 事件关联
   - 按时间窗口关联相关事件
   - 识别因果关系
   - 标注证据强度等级

4. 可视化呈现
   - 使用甘特图展示事件序列
   - 标注关键时间节点
   - 区分不同证据来源
```

### 10.5 证据链完整性保证

```
证据链（Chain of Custody）要求：

1. 获取阶段
   - 记录获取时间、地点、人员
   - 拍照/录像记录设备状态
   - 记录设备 IMEI/序列号
   - 使用法拉第袋隔离信号

2. 传输阶段
   - 记录每次设备转移
   - 保持设备开机/关机状态一致
   - 使用防篡改包装

3. 存储阶段
   - 存储在安全的证据室
   - 记录访问日志
   - 定期验证完整性

4. 分析阶段
   - 使用写保护器进行数据提取
   - 计算并记录所有文件的哈希值
   - 在副本上进行分析
   - 记录所有分析操作步骤

5. 报告阶段
   - 记录使用的工具和方法
   - 记录分析人员的资质
   - 提供可复现的步骤
   - 标注证据强度等级
```

---

## 0x0B 自动化检测与取证工具

### 11.1 Python 自动化取证脚本集

```python
#!/usr/bin/env python3
"""
移动设备取证自动化框架
支持 iOS 和 Android 设备的自动化数据提取和分析
"""

import os
import sys
import json
import sqlite3
import hashlib
import subprocess
from datetime import datetime
from pathlib import Path

class MobileForensicsToolkit:
    def __init__(self, output_dir='./forensics_output'):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.evidence_log = []
    
    def log_evidence(self, action, details, status='success'):
        entry = {
            'timestamp': datetime.utcnow().isoformat(),
            'action': action,
            'details': details,
            'status': status
        }
        self.evidence_log.append(entry)
        print(f"[{entry['timestamp']}] {action}: {details}")
    
    def hash_file(self, file_path):
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return sha256.hexdigest()
    
    def extract_android_data(self, device_serial=None):
        adb_cmd = ['adb']
        if device_serial:
            adb_cmd.extend(['-s', device_serial])
        
        results = {}
        
        try:
            result = subprocess.run(
                adb_cmd + ['shell', 'getprop', 'ro.build.display.id'],
                capture_output=True, text=True, timeout=10
            )
            results['build_id'] = result.stdout.strip()
            
            result = subprocess.run(
                adb_cmd + ['shell', 'getprop', 'ro.product.model'],
                capture_output=True, text=True, timeout=10
            )
            results['model'] = result.stdout.strip()
            
            result = subprocess.run(
                adb_cmd + ['shell', 'getprop', 'ro.build.version.release'],
                capture_output=True, text=True, timeout=10
            )
            results['android_version'] = result.stdout.strip()
            
            result = subprocess.run(
                adb_cmd + ['shell', 'pm', 'list', 'packages', '-3'],
                capture_output=True, text=True, timeout=30
            )
            results['user_apps'] = [
                line.replace('package:', '') 
                for line in result.stdout.strip().split('\n') 
                if line.strip()
            ]
            
            self.log_evidence('android_extraction', f'Extracted data from {results.get("model", "unknown")}')
            
        except Exception as e:
            self.log_evidence('android_extraction', str(e), status='error')
        
        return results
    
    def extract_ios_data(self, udid=None):
        idevice_cmd = ['ideviceinfo']
        if udid:
            idevice_cmd.extend(['-u', udid])
        
        results = {}
        
        try:
            result = subprocess.run(
                idevice_cmd,
                capture_output=True, text=True, timeout=10
            )
            for line in result.stdout.strip().split('\n'):
                if ': ' in line:
                    key, value = line.split(': ', 1)
                    results[key.strip()] = value.strip()
            
            self.log_evidence('ios_extraction', f'Extracted data from {results.get("ProductType", "unknown")}')
            
        except Exception as e:
            self.log_evidence('ios_extraction', str(e), status='error')
        
        return results
    
    def analyze_sqlite_databases(self, db_directory):
        db_path = Path(db_directory)
        results = {}
        
        for db_file in db_path.rglob('*.db'):
            try:
                file_hash = self.hash_file(str(db_file))
                conn = sqlite3.connect(str(db_file))
                cursor = conn.cursor()
                
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
                tables = [row[0] for row in cursor.fetchall()]
                
                table_info = {}
                for table in tables:
                    cursor.execute(f"SELECT COUNT(*) FROM [{table}];")
                    count = cursor.fetchone()[0]
                    table_info[table] = count
                
                conn.close()
                
                results[str(db_file)] = {
                    'hash': file_hash,
                    'size': db_file.stat().st_size,
                    'tables': table_info
                }
                
            except Exception as e:
                results[str(db_file)] = {'error': str(e)}
        
        return results
    
    def generate_report(self):
        report = {
            'extraction_time': datetime.utcnow().isoformat(),
            'output_directory': str(self.output_dir),
            'evidence_log': self.evidence_log,
        }
        
        report_path = self.output_dir / 'forensics_report.json'
        with open(report_path, 'w') as f:
            json.dump(report, f, indent=2)
        
        return report_path
```

### 11.2 iOS 取证工具

```bash
libimobiledevice 工具集：

安装：
brew install libimobiledevice

设备信息获取：
ideviceinfo -u <UDID>
ideviceinfo -k ProductType
ideviceinfo -k ProductVersion
ideviceinfo -k SerialNumber
ideviceinfo -k WiFiAddress

备份操作：
idevicebackup2 backup ./backup_dir/
idevicebackup2 backup --password <password> ./encrypted_backup/
idevicebackup2 restore ./backup_dir/
idevicebackup2 info ./backup_dir/

应用管理：
ideviceinstaller -l
ideviceinstaller -i app.ipa
ideviceinstaller -u <bundle_id>

日志获取：
idevicesyslog -u <UDID> > syslog.log
idevicesyslog -u <UDID> --process <process_name>

截图：
idevicescreenshot screenshot.png

文件提取（需要越狱）：
idevicecrashreport -e ./crash_logs/
```

```bash
pymobiledevice3 使用：

安装：
pip install pymobiledevice3

常用命令：
pymobiledevice3 diagnostics info
pymobiledevice3 apps list
pymobiledevice3 syslog
pymobiledevice3 mounter auto-mount
pymobiledevice3 backup2 backup ./backup/
pymobiledevice3 backup2 unback ./backup/
```

### 11.3 Android 取证工具

```bash
ADB 高级取证命令：

设备信息：
adb shell getprop
adb shell dumpsys battery
adb shell dumpsys wifi
adb shell dumpsys connectivity

数据提取：
adb pull /data/data/<package>/ ./extracted/
adb pull /sdcard/ ./sdcard/
adb backup -all -f full_backup.ab
adb backup -f app_data.ab -noapk com.target.app

进程和网络：
adb shell ps -A
adb shell netstat -tlnp
adb shell dumpsys netstats
adb shell cat /proc/net/tcp

日志获取：
adb logcat -d > logcat.txt
adb logcat -d -b all > full_logcat.txt
adb shell dmesg > dmesg.txt
```

```bash
Andriller 使用：
git clone https://github.com/den4uk/andriller.git
cd andriller
pip install -r requirements.txt
python andriller.py

功能：
- 自动 ADB 连接和设备检测
- 通讯录、短信、通话记录提取
- WhatsApp/微信等 App 数据解析
- 自动生成 HTML 报告
```

```bash
SANToku 取证发行版：
git clone https://github.com/SANToku/SANToku
cd SANToku

包含工具：
- ADB 和 Fastboot
- Autopsy/Sleuth Kit
- Volatility（内存取证）
- APKTool / JADX
- SQLite 分析工具
- 网络流量分析工具
```

### 11.4 SQLite 分析自动化

```python
#!/usr/bin/env python3
"""
SQLite 数据库自动化分析工具
支持批量提取、解析和报告生成
"""

import sqlite3
import os
import json
import re
from pathlib import Path
from datetime import datetime

class SQLiteForensicAnalyzer:
    def __init__(self, db_path):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self.results = {}
    
    def get_schema(self):
        cursor = self.conn.cursor()
        cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='table';")
        schema = {}
        for row in cursor.fetchall():
            schema[row['name']] = row['sql']
        self.results['schema'] = schema
        return schema
    
    def get_all_data(self):
        schema = self.get_schema()
        data = {}
        for table_name in schema:
            try:
                cursor = self.conn.cursor()
                cursor.execute(f"SELECT * FROM [{table_name}] LIMIT 1000;")
                rows = cursor.fetchall()
                data[table_name] = [dict(row) for row in rows]
            except Exception as e:
                data[table_name] = {'error': str(e)}
        self.results['data'] = data
        return data
    
    def search_deleted_records(self):
        with open(self.db_path, 'rb') as f:
            content = f.read()
        
        strings = re.findall(rb'[\x20-\x7e]{8,}', content)
        decoded = [s.decode('ascii', errors='ignore') for s in strings]
        
        self.results['potential_deleted'] = decoded
        return decoded
    
    def analyze_timestamps(self):
        timestamps = []
        schema = self.get_schema()
        
        for table_name in schema:
            try:
                cursor = self.conn.cursor()
                cursor.execute(f"PRAGMA table_info([{table_name}]);")
                columns = cursor.fetchall()
                
                for col in columns:
                    col_name = col['name'].lower()
                    if any(kw in col_name for kw in ['time', 'date', 'created', 'modified', 'updated']):
                        cursor.execute(f"SELECT [{col['name']}] FROM [{table_name}] WHERE [{col['name']}] IS NOT NULL LIMIT 100;")
                        values = cursor.fetchall()
                        for val in values:
                            if val[0]:
                                timestamps.append({
                                    'table': table_name,
                                    'column': col['name'],
                                    'value': val[0]
                                })
            except:
                pass
        
        self.results['timestamps'] = timestamps
        return timestamps
    
    def export_report(self, output_path):
        report = {
            'db_path': self.db_path,
            'analysis_time': datetime.utcnow().isoformat(),
            'results': self.results
        }
        
        with open(output_path, 'w') as f:
            json.dump(report, f, indent=2, default=str)
        
        return output_path
    
    def close(self):
        self.conn.close()
```

### 11.5 批量 App 数据提取框架

```python
#!/usr/bin/env python3
"""
批量 App 数据提取框架
自动识别和提取常见 App 的取证数据
"""

import os
import json
import sqlite3
from pathlib import Path

APP_PROFILES = {
    'com.tencent.mm': {
        'name': 'WeChat',
        'databases': ['EnMicroMsg.db', 'MicroMsg.db', 'Sns.db', 'WXFileDB.db'],
        'key_dirs': ['files', 'cache', 'shared_prefs'],
        'encryption': 'sqlcipher'
    },
    'com.whatsapp': {
        'name': 'WhatsApp',
        'databases': ['msgstore.db', 'wa.db', 'axolotl.db'],
        'key_dirs': ['files', 'cache', 'media'],
        'encryption': 'sqlcipher'
    },
    'org.telegram.messenger': {
        'name': 'Telegram',
        'databases': ['cache4.db', 'tgnet.db'],
        'key_dirs': ['cache', 'files'],
        'encryption': 'custom'
    },
    'com.instagram.android': {
        'name': 'Instagram',
        'databases': ['direct.db', 'feed.db'],
        'key_dirs': ['cache', 'files'],
        'encryption': None
    },
    'com.twitter.android': {
        'name': 'Twitter/X',
        'databases': ['twitter.db'],
        'key_dirs': ['cache', 'files'],
        'encryption': None
    }
}

class BatchAppExtractor:
    def __init__(self, data_root, output_dir='./app_extraction'):
        self.data_root = Path(data_root)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    def scan_installed_apps(self):
        apps_dir = self.data_root / 'data' / 'data'
        installed = []
        
        if apps_dir.exists():
            for pkg_dir in apps_dir.iterdir():
                if pkg_dir.is_dir():
                    profile = APP_PROFILES.get(pkg_dir.name)
                    installed.append({
                        'package': pkg_dir.name,
                        'path': str(pkg_dir),
                        'known_app': profile is not None,
                        'app_name': profile['name'] if profile else 'Unknown'
                    })
        
        return installed
    
    def extract_app_data(self, package_name):
        profile = APP_PROFILES.get(package_name)
        if not profile:
            return {'error': f'No profile for {package_name}'}
        
        app_dir = self.data_root / 'data' / 'data' / package_name
        result = {
            'package': package_name,
            'app_name': profile['name'],
            'databases': [],
            'files': [],
            'encryption': profile.get('encryption')
        }
        
        db_dir = app_dir / 'databases'
        if db_dir.exists():
            for db_file in db_dir.iterdir():
                if db_file.suffix in ('.db', '.sqlite'):
                    try:
                        conn = sqlite3.connect(str(db_file))
                        cursor = conn.cursor()
                        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
                        tables = [row[0] for row in cursor.fetchall()]
                        conn.close()
                        
                        result['databases'].append({
                            'name': db_file.name,
                            'size': db_file.stat().st_size,
                            'tables': tables
                        })
                    except Exception as e:
                        result['databases'].append({
                            'name': db_file.name,
                            'error': str(e)
                        })
        
        for key_dir in profile['key_dirs']:
            dir_path = app_dir / key_dir
            if dir_path.exists():
                for f in dir_path.rglob('*'):
                    if f.is_file():
                        result['files'].append({
                            'path': str(f.relative_to(app_dir)),
                            'size': f.stat().st_size
                        })
        
        return result
    
    def extract_all(self):
        installed = self.scan_installed_apps()
        results = []
        
        for app in installed:
            if app['known_app']:
                extraction = self.extract_app_data(app['package'])
                results.append(extraction)
        
        report_path = self.output_dir / 'extraction_report.json'
        with open(report_path, 'w') as f:
            json.dump(results, f, indent=2)
        
        return results
```

### 11.6 与 SIEM 集成方案

```python
#!/usr/bin/env python3
"""
移动设备取证数据与 SIEM 集成
支持将取证数据导出为 SIEM 可消费的格式
"""

import json
import csv
from datetime import datetime

class SIEMExporter:
    def __init__(self):
        self.events = []
    
    def add_forensic_event(self, event_type, source, details, severity='medium'):
        event = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'event_type': f'mobile_forensics_{event_type}',
            'source': source,
            'severity': severity,
            'details': details,
            'tags': ['mobile_forensics', source]
        }
        self.events.append(event)
    
    def export_json(self, output_path):
        with open(output_path, 'w') as f:
            for event in self.events:
                f.write(json.dumps(event) + '\n')
        return output_path
    
    def export_csv(self, output_path):
        if not self.events:
            return
        
        fieldnames = ['timestamp', 'event_type', 'source', 'severity', 'details', 'tags']
        with open(output_path, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for event in self.events:
                row = event.copy()
                row['tags'] = '|'.join(row['tags'])
                row['details'] = json.dumps(row['details'])
                writer.writerow(row)
        return output_path
    
    def export_syslog(self, output_path):
        with open(output_path, 'w') as f:
            for event in self.events:
                priority = {'low': 14, 'medium': 12, 'high': 10, 'critical': 9}
                pri = priority.get(event['severity'], 12)
                timestamp = event['timestamp']
                hostname = 'mobile_forensics'
                msg = f"{event['event_type']}: {json.dumps(event['details'])}"
                syslog_line = f"<{pri}>{timestamp} {hostname} {msg}\n"
                f.write(syslog_line)
        return output_path
```

---

## 0x0C 公开案例分析

### 12.1 案例一：NSO Group Pegasus 间谍软件分析

**背景**

Pegasus 是由以色列 NSO Group 开发的商业间谍软件，被多国政府用于监控记者、活动人士和政治异见者。2016 年首次被 Citizen Lab 公开披露，此后持续演化。

**攻击链分析**

```
Pegasus 攻击链（以 iOS 为例）：

阶段 1 - 初始入侵：
├── 鱼叉式钓鱼（早期版本）
│   └── 发送包含漏洞利用链接的 SMS/WhatsApp
├── iMessage 零点击攻击（FORCEDENTRY, 2021）
│   └── 通过 iMessage 发送恶意 PDF 渲染载荷
│   └── 无需用户交互
└── WiFi 零点击攻击（KISMET, 2024）
    └── 通过 WiFi 协议栈漏洞实现远程代码执行

阶段 2 - 权限提升：
├── 内核漏洞利用（如 IOKit 漏洞）
├── 沙箱逃逸
└── 获取 Root 权限

阶段 3 - 持久化：
├── 安装持久化组件
├── 修改系统启动流程
└── 隐藏自身进程和文件

阶段 4 - 数据窃取：
├── 加密通信：读取所有消息（包括加密 App）
├── 位置追踪：GPS + 基站 + WiFi
├── 通话录音：拦截 VoIP 和传统通话
├── 相机/麦克风：实时拍照和录音
├── 键盘记录：记录所有输入
└── 文件窃取：访问照片、文档等
```

**取证发现**

```
Citizen Lab 和 Amnesty Tech 的关键取证发现：

1. 文件系统痕迹：
   - 非标准的 LaunchDaemon 和 LaunchAgent
   - 异常的 /private/var/ 子目录
   - 伪装成系统文件的恶意二进制

2. 网络痕迹：
   - 与 NSO 基础设施的 HTTPS 通信
   - 使用域名前置（Domain Fronting）技术
   - 自定义加密协议

3. 进程痕迹：
   - 伪装成系统服务的恶意进程
   - 异常的 CPU 和内存使用
   - 被注入的系统进程

4. 利用痕迹：
   - FORCEDENTRY: 异常的 iMessage 附件处理
   - 异常的 CoreAnimation 渲染行为
   - JIT 编译相关的内存异常
```

**IOC（Indicators of Compromise）**

```
网络 IOC：
- 域名：多个与 NSO 关联的域名（如 acc-in.com, apple.news 前置域名）
- IP：NSO 基础设施 IP 范围
- 证书指纹：特定的 TLS 证书

文件系统 IOC：
- 特定路径下的异常文件
- 异常的 plist 配置文件
- 非标准的动态库

行为 IOC：
- iMessage 零点击利用的异常行为
- 异常的进程注入模式
- 异常的相机/麦克风访问模式
```

**经验教训**

```
1. 零点击攻击的威胁：
   - 无需用户交互即可入侵
   - 传统安全意识培训无法防范
   - 需要技术层面的防护措施

2. 供应链安全的复杂性：
   - 商业间谍软件的扩散
   - 零日漏洞的武器化
   - 防御方面临的不对称挑战

3. 取证挑战：
   - 高级反取证技术
   - 加密通信增加分析难度
   - 需要专业的移动取证能力

4. 防护建议：
   - 保持设备系统更新
   - 启用 Lockdown Mode（iOS 16+）
   - 监控异常网络行为
   - 使用 MDM 解决方案
```

### 12.2 案例二：Android 银行木马家族分析

**背景**

Android 银行木马是最常见的移动恶意软件类型之一。以 Ernes、Anatsa（原 GriftHorse）、Xenomorph 等家族为代表，这些木马通过 Google Play 商店或第三方渠道传播，专门窃取用户的银行凭据和资金。

**攻击链分析**

```
Android 银行木马典型攻击链：

阶段 1 - 传播与安装：
├── Google Play 商店伪装（合法 App 外壳）
├── 第三方应用商店
├── 钓鱼网站直接下载 APK
└── 社交媒体传播

阶段 2 - 权限获取：
├── 请求无障碍服务权限（核心）
├── 请求设备管理器权限
├── 请求悬浮窗权限
├── 请求短信读取权限
└── 请求通讯录权限

阶段 3 - 配置更新：
├── 连接 C2 服务器获取配置
├── 下载目标银行 App 列表
├── 获取钓鱼页面模板
└── 更新攻击策略

阶段 4 - 攻击执行：
├── Overlay 攻击：在银行 App 上覆盖伪造界面
├── 键盘记录：记录用户输入
├── 截屏：捕获敏感信息
├── SMS 拦截：读取验证码
├── 转账自动化：利用无障碍服务自动操作
└── 数据回传：将窃取的数据发送到 C2
```

**取证发现**

```
典型取证发现：

1. App 分析：
   - 伪装成工具类 App（清理工具、PDF 阅读器、二维码扫描器）
   - 首次运行正常，后续从 C2 下载恶意模块
   - AndroidManifest.xml 中声明过多权限
   - 包含大量银行 App 的包名列表

2. 文件系统：
   - /data/data/<malware_package>/files/config.json（C2 配置）
   - /data/data/<malware_package>/files/overlay/（钓鱼页面）
   - /data/data/<malware_package>/databases/keylog.db（键盘记录）
   - /sdcard/Download/ 中的伪装 APK

3. 网络证据：
   - C2 通信使用 HTTPS + 自定义协议
   - 域名通常使用 DGA（域名生成算法）
   - 数据回传使用 POST 请求
   - 配置更新使用 JSON 格式

4. 行为证据：
   - 无障碍服务被启用
   - 异常的悬浮窗活动
   - 频繁的截屏操作
   - 后台短信读取
```

**IOC**

```
Ernes 家族 IOC：
- 包名模式：com.ern.* (多变体)
- C2 域名模式：*.xyz, *.top, *.club
- 特征字符串："com.ernes.config", "overlay_service"
- 证书指纹：自签名证书

Anatsa/GriftHorse 家族 IOC：
- 包名：com.cleaner.security（伪装）
- C2 通信协议：自定义 HTTP 协议
- 特征文件：/data/data/com.cleaner.security/files/grifthorse.dat
- 目标银行列表：超过 370 个银行 App

Xenomorph 家族 IOC：
- 基于 Cerberus 源码
- 特征字符串："xeno_config", "inject_service"
- 支持 Overlay 和 Keylogger 两种攻击模式
- 使用 AccessibilityService 进行自动转账
```

**经验教训**

```
1. 供应链安全：
   - Google Play 审核存在绕过可能
   - 延迟加载恶意代码逃避静态检测
   - 需要动态行为分析

2. 权限管理：
   - 无障碍服务是最大的安全风险点
   - 用户安全意识不足
   - 需要系统层面的权限管控

3. 检测挑战：
   - 多态和混淆技术
   - DGA 域名增加封堵难度
   - 需要行为检测而非仅签名检测

4. 防护建议：
   - 仅从官方商店下载 App
   - 谨慎授予无障碍服务权限
   - 使用移动安全软件
   - 定期检查已启用的无障碍服务
   - 银行 App 应实现反 Overlay 检测
```

---

## 0x0D 参考资料

1. **NIST SP 800-101 Revision 1** - Guidelines on Mobile Device Forensics
   [https://csrc.nist.gov/publications/detail/sp/800-101/rev-1/final](https://csrc.nist.gov/publications/detail/sp/800-101/rev-1/final)

2. **Citizen Lab** - Pegasus Research and Analysis
   [https://citizenlab.ca/tag/pegasus/](https://citizenlab.ca/tag/pegasus/)

3. **libimobiledevice** - Open Source iOS Device Communication Library
   [https://libimobiledevice.org/](https://libimobiledevice.org/)

4. **Android Open Source Project** - Security Architecture
   [https://source.android.com/docs/security](https://source.android.com/docs/security)

5. **OWASP Mobile Security Testing Guide**
   [https://owasp.org/www-project-mobile-security-testing-guide/](https://owasp.org/www-project-mobile-security-testing-guide/)

6. **Mobile Security Framework (MobSF)**
   [https://mobsf.github.io/docs/](https://mobsf.github.io/docs/)

7. **SQLite Forensic Analysis** - Digital Forensics Research
   [https://www.sans.org/blog/sqlite-forensics/](https://www.sans.org/blog/sqlite-forensics/)

8. **ENFSI Best Practice Guide** - Mobile Device Examination
   [https://enfsi.eu/page/160](https://enfsi.eu/page/160)

9. **Amnesty Tech** - Mobile Threats Research
   [https://www.amnesty.org/en/latest/tech/](https://www.amnesty.org/en/latest/tech/)

10. **Google Android Security** - Android Security and Privacy Report
    [https://source.android.com/docs/security/overview](https://source.android.com/docs/security/overview)

11. **Apple Platform Security**
    [https://support.apple.com/guide/security/welcome/web](https://support.apple.com/guide/security/welcome/web)

12. **RFC 3227** - Guidelines for Evidence Collection and Archiving
    [https://datatracker.ietf.org/doc/html/rfc3227](https://datatracker.ietf.org/doc/html/rfc3227)