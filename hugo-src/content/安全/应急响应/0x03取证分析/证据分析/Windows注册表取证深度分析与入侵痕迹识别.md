---
title: "Windows注册表取证深度分析与入侵痕迹识别"
date: 2026-06-22T14:00:00+08:00
draft: false
weight: 270
description: "围绕 Windows 注册表的 Hive 结构、事务日志、关键取证 Artifacts，分析攻击者如何利用注册表实现持久化、执行、用户活动追踪，以及如何从注册表中恢复被删除的证据。"
categories: ["应急响应", "取证分析"]
tags: ["注册表", "NTUSER.DAT", "ShimCache", "AmCache", "BAM", "UserAssist", "ShellBags", "事务日志", "持久化"]
---

# Windows注册表取证深度分析与入侵痕迹识别

Windows 注册表是操作系统中信息密度最高的单一数据源。它不仅存储系统配置和用户偏好，更是一个隐式的行为历史记录——记录了哪些程序被执行过、哪些文件被打开过、哪些设备被连接过、哪些网络被访问过。在应急响应中，注册表取证往往是还原攻击者行为链的关键环节。

已有文章 `启动项检查结果异常判断与入侵关联分析`、`映像劫持检查结果与IFEO及Winlogon持久化判断分析`、`服务信息检查结果与ImagePath及ServiceDLL驻留分析`、`环境变量劫持与执行链污染分析` 等分别覆盖了注册表中特定位置的取证分析。本文换一个角度：**不逐个讨论某个注册表键，而是从注册表的整体架构出发，分析 Hive 结构、事务日志、已删除键恢复、跨 Hive 关联分析等系统性取证方法，以及如何从注册表中构建完整的攻击者行为时间线。**

---

## 0x01 注册表的架构基础与取证数据源

### 1. Hive 文件体系

Windows 注册表由多个 Hive 文件组成，每个 Hive 文件是一个独立的二进制数据库。在取证分析中，理解 Hive 文件的物理位置和逻辑映射关系是基础：

**系统级 Hive（C:\Windows\System32\config\）**

| Hive 文件 | 逻辑映射 | 取证价值 |
|-----------|---------|---------|
| SAM | HKLM\SAM | 本地用户账户、组成员关系、最后登录时间 |
| SECURITY | HKLM\SECURITY | 安全策略、审计策略、安全标识符 |
| SYSTEM | HKLM\SYSTEM | 硬件配置、服务配置、USB 历史、时区、ShimCache、BAM/DAM |
| SOFTWARE | HKLM\SOFTWARE | 已安装软件、Run/RunOnce 启动项、计划任务缓存 |
| DEFAULT | HKU\.DEFAULT | 默认用户配置 |

**用户级 Hive（C:\Users\<username>\）**

| Hive 文件 | 逻辑映射 | 取证价值 |
|-----------|---------|---------|
| NTUSER.DAT | HKCU | 用户活动记录的核心：RecentDocs、UserAssist、ShellBags、TypedPaths、RunMRU |
| UsrClass.dat | HKCU\Software\Classes | 文件关联、ShellBags 补充数据、COM 类注册 |

关键认知：系统级 Hive 记录的是机器范围的活动（所有用户共享），用户级 Hive 记录的是特定用户的活动。在归因分析中，区分一个操作是系统级还是用户级，是判断"谁做了什么"的基础。

### 2. 事务日志与已删除证据恢复

Windows 注册表使用事务日志机制保证数据一致性。每个 Hive 文件可能伴随 `.LOG1` 和 `.LOG2` 两个事务日志文件：

```
C:\Windows\System32\config\SYSTEM
C:\Windows\System32\config\SYSTEM.LOG1
C:\Windows\System32\config\SYSTEM.LOG2

C:\Users\Administrator\NTUSER.DAT
C:\Users\Administrator\NTUSER.DAT.LOG1
C:\Users\Administrator\NTUSER.DAT.LOG2
```

事务日志的工作机制：当注册表被修改时，Windows 首先将变更写入事务日志（"脏页"），然后再同步到主 Hive 文件。如果系统在同步过程中崩溃，重启时 Windows 会重放事务日志以恢复一致性。

取证价值：事务日志是恢复"已删除"证据的关键。如果攻击者删除了一个持久化键（例如恶意的 Run 条目），然后系统立即被扣押或崩溃，该键的创建和删除记录可能只存在于事务日志中。Elcomsoft 的研究表明，通过解析事务日志，取证人员可以重建注册表的历史状态，恢复从主 Hive 视图中"消失"的数据。

关键限制：事务日志是一致性机制，不是历史日志。它不保证所有历史变更都能恢复。日志重放的成功率取决于工具、系统状态和时序。

### 3. Last Write Time 时间戳

注册表中的每个键（Key）都维护一个 Last Write Time 时间戳，记录该键或其值最后一次被修改的时间。这个时间戳是注册表取证中构建时间线的基础。

取证要点：
- Last Write Time 记录的是键级别的修改时间，不是值级别的时间
- 修改键下的值会更新键的 Last Write Time
- 添加或删除子键会更新父键的 Last Write Time
- 读取键不会更新 Last Write Time

在时间线分析中，Last Write Time 可以与文件系统时间戳（MACE）、事件日志时间戳进行交叉比对，构建更精确的攻击时间线。

---

## 0x02 持久化机制的注册表取证

### 1. Run/RunOnce 键

Run 和 RunOnce 是最经典的注册表持久化位置：

```
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce
HKCU\Software\Microsoft\Windows\CurrentVersion\Run
HKCU\Software\Microsoft\Windows\CurrentVersion\RunOnce
```

取证分析要点：

- 检查每个值的名称和数据，注意名称伪装（如 `svchost`、`WindowsUpdate`）
- 检查数据中的路径是否指向可疑目录（`C:\Users\Public\`、`C:\Windows\Temp\`、`%APPDATA%`）
- 检查数据中是否包含命令行参数（`-WindowStyle hidden`、`-ep bypass`）
- 对比 HKLM 和 HKCU 的 Run 键：HKLM 中的条目对所有用户生效，HKCU 只对当前用户生效
- 检查值的 Last Write Time 是否与已知入侵时间窗口吻合

攻击者的常见伪装策略：
- 将恶意条目插入已有的合法 Run 键中，混在合法条目之间
- 使用与合法软件相似的值名称
- 在值数据中使用环境变量（`%APPDATA%\malware.exe`）以规避基于路径的检测

### 2. 服务注册表键

```
HKLM\SYSTEM\CurrentControlSet\Services\<ServiceName>
```

关键值：
- `ImagePath`：服务的可执行文件路径
- `Start`：启动类型（2=自动，3=手动，4=禁用）
- `ServiceDll`：DLL 类型服务的 DLL 路径
- `DisplayName`：服务显示名称
- `Description`：服务描述

取证分析要点：
- 检查 `ImagePath` 是否指向非标准路径
- 检查 `ServiceDll` 是否指向未签名的 DLL
- 对比 `DisplayName` 和 `Description` 是否与已知的合法服务匹配
- 检查服务的 Last Write Time 是否与入侵时间窗口吻合
- 注意 DLL 劫持：攻击者不修改 `ServiceDll`，而是在 DLL 搜索路径中放置同名恶意 DLL

### 3. IFEO（映像劫持）

```
HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\<ProcessName>
```

关键值：
- `Debugger`：当目标进程启动时，先执行 Debugger 指定的程序
- `GlobalFlag` 和 `SilentProcessExit`：用于进程退出时执行指定程序

取证分析要点：
- 检查所有 IFEO 子键，注意是否有非标准的 Debugger 值
- IFEO 劫持不会在事件日志中产生进程创建事件（因为是由系统触发的）
- 攻击者可能使用 IFEO 劫持安全软件进程（如 `MsMpEng.exe`），使其启动时执行恶意代码

### 4. 计划任务注册表缓存

```
HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\TaskCache\Tree\<TaskName>
HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\TaskCache\Tasks\{GUID}
```

如前文 `计划任务检查结果与持久化意图及隐藏任务检测分析` 所述，SD 值的删除是隐藏计划任务的关键技术。在注册表取证中，需要直接检查 `TaskCache\Tasks\{GUID}` 子键，而不是仅依赖 `schtasks /query` 的输出。

### 5. Winlogon 通知包

```
HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon
```

关键值：
- `Userinit`：用户登录时执行的程序（正常值为 `userinit.exe`）
- `Shell`：系统 Shell（正常值为 `explorer.exe`）
- `Notify`：登录/注销/启动时执行的 DLL

取证分析要点：
- 检查 `Userinit` 是否被追加了恶意程序（如 `userinit.exe,C:\Temp\malware.exe`）
- 检查 `Shell` 是否被替换为非标准值
- 检查 `Notify` 子键中是否有未签名的 DLL

### 6. 环境变量劫持

```
HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment
HKCU\Environment
```

关键值：
- `Path`：系统/用户 PATH 环境变量
- `ComSpec`：命令解释器路径
- `PATHEXT`：可执行文件扩展名

取证分析要点：
- 检查 `Path` 中是否被插入了攻击者可控的目录
- 检查 `ComSpec` 是否被修改为指向恶意程序
- 检查 `PATHEXT` 中是否被插入了新的扩展名（如 `.bat` 被移到最前面）

---

## 0x03 执行证据的注册表取证

### 1. UserAssist

UserAssist 是 NTUSER.DAT 中最有价值的执行证据之一。它记录了用户通过 GUI 启动的程序：

```
NTUSER.DAT\Software\Microsoft\Windows\CurrentVersion\Explorer\UserAssist\{GUID}\Count
```

每个条目的值名称使用 ROT-13 编码，需要解码后才能阅读。解码后的格式为：

```
UEME_RUNPATH:C:\Program Files\Internet Explorer\iexplore.exe
```

每个条目包含以下数据：
- 会话计数：程序被启动的次数
- 上次执行时间：最后一次执行的时间戳（FILETIME 格式）
- 焦点时间和焦点次数：程序获得焦点的时间和次数

取证分析要点：
- UserAssist 只记录通过 GUI 启动的程序，不记录通过命令行或计划任务启动的程序
- 如果攻击者使用命令行执行恶意程序，UserAssist 中不会有记录
- 如果攻击者双击了一个恶意文件，UserAssist 会记录该文件的完整路径
- 将 UserAssist 的时间戳与事件日志中的进程创建事件进行交叉比对

### 2. ShimCache（Application Compatibility Cache）

```
HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\AppCompatCache
```

ShimCache 是 Windows 用于确保旧版应用程序兼容性的缓存。从取证角度看，它记录了系统上存在过的可执行文件的信息：

- 文件路径
- 文件大小
- 最后修改时间
- 执行标志（Windows 10 83 格式中包含）

取证分析要点：
- ShimCache 条目在文件被删除后仍然存在——这是其最大的取证价值
- 即使攻击者删除了恶意可执行文件，ShimCache 仍然保留了该文件曾经存在于系统上的证据
- 关键限制：ShimCache 条目不等于执行证明。它只确认文件曾经存在于系统上并被 Shim 引擎扫描过
- 在 Windows 10 的 83 字节格式中，包含一个执行标志位，但该标志位的含义仍有争议——它可能表示"文件被评估为需要兼容性修复"，而不一定是"文件被执行"
- ShimCache 最多保留约 1024 个条目（Windows 10），旧条目会被新条目覆盖

### 3. AmCache

```
C:\Windows\AppCompat\Programs\Amcache.hve
```

AmCache 是 Windows 8 引入的兼容性缓存，比 ShimCache 提供更丰富的执行证据：

- 文件路径
- SHA-1 哈希值（AmCache 是唯一提供文件哈希的注册表取证 Artifacts）
- 安装时间
- 执行时间
- 文件大小
- 签名信息
- 发布者名称

取证分析要点：
- AmCache 的 SHA-1 哈希是取证分析的黄金标准——即使文件被删除或重命名，哈希值仍然可以标识文件
- 一个从 `mimikatz.exe` 重命名为 `notepad.exe` 的文件，在 AmCache 中仍然保留原始的 SHA-1 哈希
- Amcache.hve 是一个独立的 Hive 文件，不在 HKLM 的标准 Hive 中，需要单独提取
- AmCache 中的条目在文件被删除后仍然存在

### 4. BAM（Background Activity Moderator）和 DAM（Desktop Activity Moderator）

```
HKLM\SYSTEM\CurrentControlSet\Services\bam\UserSettings\{SID}
HKLM\SYSTEM\CurrentControlSet\Services\dam\UserSettings\{SID}
```

BAM 和 DAM 是 Windows 10 引入的电源管理功能，用于控制后台应用的资源使用。从取证角度看，它们记录了最近执行的程序：

- 键名称是用户的 SID
- 值名称是可执行文件的完整路径
- 值的 Last Write Time 是程序最后一次执行的时间

取证分析要点：
- BAM/DAM 记录了通过命令行启动的程序，这是 UserAssist 不覆盖的
- BAM/DAM 的时间戳精度较高，适合构建精确的执行时间线
- BAM 在 Windows 10 1809 及更高版本中可用
- DAM 在 Windows 10 的早期版本中可用
- BAM/DAM 只保留最近的执行记录（通常几天到几周）

### 5. 执行证据的交叉验证

单一的执行证据 Artifacts 通常不足以证明程序被执行。建议采用以下交叉验证策略：

| 证据来源 | 证明能力 | 局限性 |
|---------|---------|--------|
| UserAssist | 通过 GUI 执行的证明 | 不记录命令行执行 |
| ShimCache | 文件曾经存在的证明 | 不证明执行 |
| AmCache | 文件曾经存在 + SHA-1 哈希 | 执行证明有争议 |
| BAM/DAM | 执行的证明（含时间戳） | 只保留最近记录 |
| Prefetch | 执行的证明（含运行次数） | 可能被禁用 |
| SRUM | 网络使用量的证明 | 不直接证明执行 |

最佳实践：将多个 Artifacts 交叉比对。如果一个恶意文件同时出现在 ShimCache、AmCache 和 BAM 中，且时间戳一致，那么执行证据的强度就非常高。

---

## 0x04 用户活动的注册表取证

### 1. RecentDocs（最近打开的文件）

```
NTUSER.DAT\Software\Microsoft\Windows\CurrentVersion\Explorer\RecentDocs
```

RecentDocs 记录了用户最近打开的文件。每个条目包含文件名和完整路径。子键按文件扩展名分类（如 `.docx`、`.xlsx`、`.pdf`）。

取证分析要点：
- RecentDocs 可以揭示攻击者访问过哪些敏感文件
- 如果攻击者通过 GUI 打开了一个机密文档，RecentDocs 会记录该文件的完整路径
- 即使文件被删除，RecentDocs 中的记录仍然存在
- 检查 RecentDocs 的时间戳（通过键的 Last Write Time）可以确定文件访问的大致时间

### 2. ShellBags

```
NTUSER.DAT\Software\Microsoft\Windows\Shell\BagMRU
NTUSER.DAT\Software\Microsoft\Windows\Shell\Bags
UsrClass.dat\Local Settings\Software\Microsoft\Windows\Shell\Bags
```

ShellBags 记录了用户打开过的文件夹的视图设置（图标大小、排列方式等）。从取证角度看，ShellBags 可以揭示用户浏览过哪些目录——即使这些目录已经被删除。

取证分析要点：
- ShellBags 可以揭示攻击者浏览过哪些目录
- 如果攻击者打开了一个包含敏感文件的目录，ShellBags 会记录该目录的路径
- ShellBags 可以揭示 USB 设备上的目录结构
- 使用 Eric Zimmerman 的 ShellBag Explorer 可以更清晰地解析 ShellBags 数据

### 3. TypedPaths（地址栏输入历史）

```
NTUSER.DAT\Software\Microsoft\Windows\CurrentVersion\Explorer\TypedPaths
```

TypedPaths 记录了用户在 Windows 资源管理器地址栏中输入的路径。

取证分析要点：
- 可以揭示攻击者手动导航到哪些目录
- 如果攻击者在地址栏中输入了 `\\DC\C$\`，TypedPaths 会记录该路径
- 与 RecentDocs 和 ShellBags 交叉比对，可以构建更完整的用户活动图景

### 4. WordWheelQuery（搜索历史）

```
NTUSER.DAT\Software\Microsoft\Windows\CurrentVersion\Explorer\WordWheelQuery
```

WordWheelQuery 记录了用户在 Windows 搜索框中输入的搜索关键词。

取证分析要点：
- 可以揭示攻击者搜索过哪些文件
- 如果攻击者搜索了"密码"、"凭据"、"密钥"等关键词，WordWheelQuery 会记录这些搜索
- 搜索行为本身可以揭示攻击者的意图

### 5. RunMRU（运行对话框历史）

```
NTUSER.DAT\Software\Microsoft\Windows\CurrentVersion\Explorer\RunMRU
```

RunMRU 记录了用户通过"运行"对话框（Win+R）执行的命令。

取证分析要点：
- 可以揭示攻击者通过"运行"对话框执行了哪些命令
- 如果攻击者输入了 `cmd`、`powershell`、`mstsc` 等命令，RunMRU 会记录
- 每个条目包含命令文本和执行时间

### 6. OpenSaveDialog（打开/保存对话框历史）

```
NTUSER.DAT\Software\Microsoft\Windows\CurrentVersion\Explorer\ComDlg32\OpenSavePidlMRU
NTUSER.DAT\Software\Microsoft\Windows\CurrentVersion\Explorer\ComDlg32\LastVisitedPidlMRU
```

这些键记录了用户在打开/保存文件对话框中浏览过的目录和文件名。

取证分析要点：
- 可以揭示攻击者保存过哪些文件到哪些位置
- 如果攻击者通过浏览器下载了一个恶意文件并保存，OpenSaveDialog 会记录该文件名和保存位置
- LastVisitedPidlMRU 记录了用户最后访问的目录

---

## 0x05 网络与设备的注册表取证

### 1. 网络连接历史

```
HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\NetworkList\Profiles
HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\NetworkList\Signatures\Unmanaged
```

NetworkList 记录了系统连接过的所有网络，包括：
- 网络名称（SSID）
- 网络类型（有线/无线）
- 首次连接和最后连接时间
- 默认网关 MAC 地址

取证分析要点：
- 可以揭示系统曾经连接到哪些网络
- 默认网关 MAC 地址可以用于定位物理位置
- 如果攻击者通过 VPN 或远程桌面连接了系统，NetworkList 可能记录了相关网络信息

### 2. USB 设备连接历史

```
HKLM\SYSTEM\MountedDevices
HKLM\SYSTEM\CurrentControlSet\Enum\USBSTOR
HKLM\SYSTEM\CurrentControlSet\Enum\USB
HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\MountPoints2
```

USBSTOR 记录了所有曾经连接过的 USB 存储设备：
- 设备名称
- 设备序列号
- 首次连接时间
- 最后连接时间

MountPoints2 记录了所有挂载过的驱动器盘符，包括 USB 设备和网络共享。

取证分析要点：
- 在内部威胁调查中，USB 设备历史可以揭示攻击者是否使用 USB 设备拷贝了敏感数据
- 设备序列号可以用于追踪特定的 USB 设备
- 将 USB 连接时间与文件访问时间交叉比对，可以确定数据外泄的时间窗口

### 3. RDP 连接历史

```
NTUSER.DAT\Software\Microsoft\Terminal Server Client\Servers
```

这个键记录了用户通过远程桌面连接过的所有服务器：
- 服务器地址
- 用户名
- 最后连接时间

取证分析要点：
- 可以揭示攻击者通过 RDP 连接了哪些系统
- 在横向移动调查中，RDP 历史是关键的证据来源
- 与事件日志中的 Event ID 4624（类型 10 远程交互登录）交叉比对

---

## 0x06 安全相关 Hive 的取证分析

### 1. SAM Hive

```
HKLM\SAM\SAM\Domains\Account\Users
```

SAM 存储了本地用户账户的信息：
- 用户名和 SID
- 密码哈希（NTLM）
- 最后登录时间
- 账户创建时间
- 组成员关系

取证分析要点：
- SAM 中的密码哈希可以用于离线密码破解
- 检查是否存在影子账户（以 `$` 结尾的隐藏管理员账户）
- 检查最后登录时间是否与已知入侵时间窗口吻合

### 2. SECURITY Hive

```
HKLM\SECURITY
```

SECURITY Hive 存储了安全策略和审计策略。在取证分析中，主要关注：
- 审计策略是否被修改（攻击者可能禁用审计以减少日志记录）
- 安全描述符是否被修改
- LSA Secrets 中是否存储了可解密的凭据

### 3. 已删除注册表键的恢复

注册表已删除键的恢复是高级取证技术的核心。以下是主要的恢复方法：

**方法一：事务日志恢复**

如前文所述，通过分析 `.LOG1` 和 `.LOG2` 文件，可以恢复被删除的键值。使用工具（如 Registry Explorer）可以同时加载主 Hive 和事务日志，重建注册表的最完整状态。

**方法二：卷影拷贝对比**

如果系统存在卷影拷贝（Volume Shadow Copy），可以对比不同时间点的注册表 Hive 文件，发现被删除的键值。

```cmd
vssadmin list shadows
```

**方法三：注册表 Hive  carving**

在磁盘镜像中，即使注册表文件已被覆盖，仍可能通过文件 carving 技术从磁盘扇区中恢复旧的 Hive 数据。

**方法四：内存取证**

如果内存镜像可用，可以从内存中提取注册表的运行时状态。内存中的注册表视图是最完整的——包含了所有已加载的 Hive 数据，包括可能已从磁盘上删除但仍保留在内存中的键值。

---

## 0x07 注册表取证中的反取证技术

### 1. 注册表键值伪装

攻击者将恶意注册表值伪装成合法的系统配置：

- 使用与合法值相似的值名称（如 `svchost` 而非 `svchost.exe`）
- 在合法值列表中插入恶意值（混在合法条目之间）
- 使用环境变量隐藏真实路径（`%TEMP%\malware.exe`）

对抗方法：
- 将所有 Run 值中的路径解析为绝对路径
- 检查每个路径对应的文件是否存在数字签名
- 将值名称与 Microsoft 官方文档中的合法值列表进行比对

### 2. 时间戳篡改（Timestomp）

攻击者修改注册表键的 Last Write Time，使其看起来像是在合法时间创建的。

对抗方法：
- 将注册表时间戳与事件日志时间戳进行交叉比对
- 检查时间戳的一致性（如果一个服务的 Last Write Time 早于系统安装时间，说明时间戳被篡改）
- 使用事务日志中的时间戳（事务日志的时间戳更难被篡改）

### 3. 注册表键删除

攻击者在完成持久化后删除注册表键，以消除痕迹。

对抗方法：
- 检查事务日志中是否保留了被删除键的记录
- 检查卷影拷贝中的旧版 Hive 文件
- 使用内存取证提取运行时注册表状态
- 部署 Sysmon 监控注册表修改操作

### 4. 直接内存操作

高级攻击者（如 rootkit）直接在内存中修改注册表视图，不写入磁盘。这种技术使得磁盘上的注册表 Hive 看起来正常，但运行中的系统行为已经被修改。

对抗方法：
- 使用内存取证工具（如 Volatility）提取内存中的注册表状态
- 将内存中的注册表状态与磁盘上的 Hive 文件进行对比
- 如果内存和磁盘的注册表状态不一致，说明可能存在 rootkit

---

## 0x08 公开案例中的注册表取证

### 案例一：SolarWinds SUNBURST — 注册表持久化

在 SolarWinds 供应链攻击中，SUNBURST 后门在注册表中创建了以下持久化机制：

- 修改了 SolarWinds Orion 服务的 `ImagePath`，将恶意 DLL 注入到合法服务的执行链中
- 在注册表中创建了自定义的 COM 对象注册，用于进程注入

取证启示：这个案例展示了攻击者如何利用合法服务的注册表配置来实现隐蔽持久化。在取证分析中，不仅要检查 Run/RunOnce 键，还要检查服务注册表和 COM 对象注册。

### 案例二：NotPetya — 注册表 MBR 覆盖

NotPetya 勒索软件通过修改注册表中的 MBR（主引导记录）来实现系统级持久化：

```
HKLM\SYSTEM\CurrentControlSet\Services\disk\Enum
```

NotPetya 将恶意代码写入 MBR，使得即使重新安装操作系统，恶意代码仍然存在。

取证启示：这个案例展示了注册表取证需要覆盖系统底层配置。在高级攻击中，注册表不仅是持久化的目标，还可能被用于系统级破坏。

### 案例三：Emotet — 多位置注册表持久化

Emotet 恶意软件使用多个注册表位置实现冗余持久化：

- Run 键：`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
- IFEO：`HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options`
- 计划任务注册表缓存

当其中一个持久化机制被清除时，Emotet 会通过其他机制重新创建。

取证启示：这个案例证明了全面注册表检查的必要性。在清除恶意软件时，必须检查所有可能的注册表持久化位置，否则恶意软件会通过冗余机制恢复。

---

## 0x09 证据强度分层

### 1. 确认恶意（Confirmation Level）

以下条件满足任意一项即可确认注册表条目恶意：

- Run/RunOnce 值指向用户可写目录中的未签名可执行文件
- 服务 `ImagePath` 指向非标准路径且文件无数字签名
- IFEO `Debugger` 值指向非调试器程序
- `Userinit` 或 `Shell` 值被追加了非标准程序
- AmCache 中的 SHA-1 哈希与已知恶意软件匹配
- SAM 中存在以 `$` 结尾的影子管理员账户

### 2. 高度可疑（High Suspicion Level）

以下条件满足任意一项应当视为高度可疑：

- 注册表值的 Last Write Time 与已知入侵时间窗口吻合
- Run 值使用了环境变量隐藏真实路径
- 服务的 `ServiceDll` 指向未签名的 DLL
- ShellBags 中出现了指向可疑目录的记录
- USB 设备连接时间与数据外泄时间窗口吻合
- TypedPaths 中出现了攻击者常用的路径（如 `\\DC\C$\`）

### 3. 需要关注（Attention Level）

以下条件需要关注，但不足以单独判定恶意：

- 注册表值指向已签名的合法系统工具，但命令行参数需要进一步分析
- UserAssist 中出现了不常见的程序执行记录
- RecentDocs 中出现了敏感文件的访问记录，但可能是合法操作
- NetworkList 中出现了不常见的网络连接记录

---

## 0x10 注册表取证工具链

### 1. 离线分析工具

| 工具 | 用途 | 特点 |
|------|------|------|
| Registry Explorer | Hive 文件浏览和分析 | 支持事务日志重放、书签、插件 |
| RegRipper | 自动化注册表解析 | 内置 100+ 解析插件，支持 Kroll_Batch |
| RECmd | 命令行注册表解析 | Eric Zimmerman 工具集，支持批量解析 |
| ShimCacheParser | ShimCache 解析 | Mandiant 开发，支持多种 Windows 版本 |
| AmcacheParser | AmCache 解析 | Eric Zimmerman 工具集 |
| ShellBag Explorer | ShellBags 解析 | Eric Zimmerman 工具集 |

### 2. 在线分析工具

| 工具 | 用途 | 特点 |
|------|------|------|
| Autoruns | 启动项分析 | 微软 Sysinternals，支持数字签名验证 |
| Sysmon | 注册表修改监控 | 实时监控注册表创建、修改、删除 |
| Process Monitor | 进程级注册表操作监控 | 实时记录所有注册表操作 |

### 3. 内存取证工具

| 工具 | 用途 | 特点 |
|------|------|------|
| Volatility | 内存镜像分析 | 支持注册表 Hive 提取和分析 |
| Rekall | 内存镜像分析 | Google 开发，支持多种操作系统 |

---

## 0x11 参考资料

- Elcomsoft: [Investigating Windows Registry](https://blog.elcomsoft.com/2026/02/investigating-windows-registry/)
- Hackers Arise: [Digital Forensics: Registry Analysis for Beginners](https://hackers-arise.com/digital-forensics-registry-analysis-for-beginners-part-1-hives-logs-and-acquisition/)
- Security Matrix: [Windows Registry Forensics: System vs. User Hives](https://securitymatrixblogs.substack.com/p/windows-registry-forensics-system)
- Cyber Triage: [Windows Registry Forensics 2026](https://www.cybertriage.com/blog/windows-registry-forensics-2026/)
- Bit by Bit Forensics: [Windows Registry Forensics: An Introduction to Key Artifacts](https://bitbybitforensics.io/introduction-to-windows-registry-forensics/)
- Google Cloud Threat Intelligence: [Digging up the past: Windows Registry forensics revisited](https://cloud.google.com/blog/topics/threat-intelligence/digging-up-the-past-windows-registry-forensics-revisited)
- 腾讯云: [数字取证高级技术：Windows注册表取证与用户行为分析实战指南](https://cloud.tencent.com/developer/article/2589181)
- Mohammed AlHumaid: [Windows Forensics Analysis V1.0](https://mohammedalhumaid.com/wp-content/uploads/2022/01/windows-forensics-analysis-v-1.0-4.pdf)
