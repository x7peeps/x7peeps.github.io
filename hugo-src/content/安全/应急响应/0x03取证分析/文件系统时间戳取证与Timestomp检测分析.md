---
title: "文件系统时间戳取证与Timestomp检测分析"
date: 2026-06-22T18:00:00+08:00
draft: false
weight: 280
description: "围绕 NTFS 文件系统的 MACE 时间戳、$SI 与 $FN 属性差异、USN Journal、$LogFile，分析攻击者如何进行 Timestomp 反取证，以及如何从多个 Artifacts 中检测时间戳篡改。"
categories: ["应急响应", "取证分析"]
tags: ["NTFS", "时间戳", "Timestomp", "MACE", "MFT", "USN Journal", "LogFile", "反取证"]
---

# 文件系统时间戳取证与Timestomp检测分析

在应急响应中，时间线分析是还原攻击者行为链的核心方法。而时间线分析的基础，是文件系统的 MACE 时间戳。如果时间戳被篡改，整个时间线的可信度就会崩塌。

已有文章 `重点文件时间线检查结果与攻击者操作节律分析` 覆盖了文件时间线的基础分析方法，`时间偏移与时钟篡改对事件时间线分析的影响` 覆盖了系统时钟层面的时间问题。本文换一个角度：**聚焦于文件级别的时间戳篡改（Timestomp），深入分析 NTFS 的双层时间戳机制（$SI 与 $FN）、各种 Timestomp 工具的技术原理与检测盲区、以及如何从 USN Journal、$LogFile、Prefetch、事件日志等多个 Artifacts 中检测时间戳篡改。**

Timestomp 是 MITRE ATT&CK 中的 T1070.006（Indicator Removal: Timestomp），被多个 APT 组织广泛使用。APT29（IRON HEMLOCK）在部署后门时进行了 Timestomp；APT32（TIN WOODLAWN）篡改了计划任务 XML 文件的创建时间；APT38（NICKEL GLADSTONE）修改文件时间以匹配系统上的其他文件；Lazarus（NICKEL ACADEMY）将 calc.exe 的时间戳复制到恶意载荷上。Cobalt Strike 的 `timestomp` 命令和 Metasploit 的 `timestomp` 模块是最常用的攻击工具。

---

## 0x01 NTFS 时间戳的双层架构

### 1. MACE 时间戳

NTFS 为每个文件和目录维护四个时间戳，合称 MACE（也称为 MACB）：

| 时间戳 | 含义 | 说明 |
|--------|------|------|
| M（Modified） | 最后修改时间 | 文件内容最后一次被修改的时间 |
| A（Accessed） | 最后访问时间 | 文件最后一次被读取的时间 |
| C（Changed/Created） | 最后变更时间 | MFT 记录最后一次被修改的时间 |
| E（Birth/Creation） | 创建时间 | 文件创建的时间 |

关键认知：MACE 时间戳不是单一值，而是存储在两个不同的 MFT 属性中——$STANDARD_INFORMATION（$SI）和 $FILE_NAME（$FN）。这两个属性中的时间戳在正常情况下应该一致，但在 Timestomp 后会出现不一致。

### 2. $STANDARD_INFORMATION（$SI）与 $FILE_NAME（$FN）的区别

**$STANDARD_INFORMATION（$SI）**

$SI 是 MFT 记录中的第一个属性，包含文件的基本元数据：MACE 时间戳、文件属性标志（只读、隐藏、系统等）、安全描述符 ID。

$SI 时间戳可以通过 Windows API（`SetFileTime`）在用户级别修改。这意味着任何具有文件写入权限的进程都可以修改 $SI 时间戳。

**$FILE_NAME（$FN）**

$FN 包含文件名和对应的 MACE 时间戳。一个文件可能有多个 $FN 属性（如果文件有长文件名和短文件名）。

$FN 时间戳由 Windows 内核维护，不能通过标准的 Windows API 修改。在正常情况下，$FN 时间戳反映了文件操作的真实时间。

### 3. $SI 与 $FN 时间戳不一致的检测原理

Timestomp 检测的核心原理：**如果 $SI 时间戳与 $FN 时间戳不一致，说明文件可能被 Timestomp。**

```
正常文件：
  $SI-M: 2026-06-15 10:30:00.1234567
  $FN-M: 2026-06-15 10:30:00.1234567
  → 一致，未被篡改

Timestomp 文件：
  $SI-M: 2020-01-01 00:00:00.0000000
  $FN-M: 2026-06-15 10:30:00.1234567
  → 不一致，$SI 被篡改
```

关键限制：这个检测方法有两个已知的绕过方式：

- **绕过一**：在旧版 Windows（无 Patch Guard）上，攻击者可以使用内核级 API（`NtSetInformationFile`）直接修改 $FN 时间戳
- **绕过二**：攻击者先 Timestomp $SI，然后重命名或移动文件。Windows 会将 $SI 的时间戳复制到 $FN，使两者重新一致

---

## 0x02 Timestomp 工具的技术原理与检测特征

### 1. Timestomp（Meterpreter/Cobalt Strike）

Timestomp 是 Metasploit 和 Cobalt Strike 中最常用的时间戳篡改工具。它通过 Windows API `SetFileTime` 修改 $SI 时间戳。

```cmd
meterpreter > timestomp C:\Temp\malware.exe -z
```

`-z` 标志将所有四个 MACE 时间戳设置为同一值。

检测特征：
- $SI 时间戳被修改，$FN 时间戳保持原始值
- 纳秒精度为 `.0000000`（Metasploit 的默认行为）
- 所有四个时间戳完全相同（使用 `-z` 标志时）

关键限制：Metasploit 的 Timestomp 只修改 $SI，不修改 $FN。因此，通过比对 $SI 和 $FN 可以检测。

### 2. nTimestomp（nTimetools）

nTimestomp 是 Benjamin Lim 开发的高级 Timestomp 工具，支持纳秒精度。

```cmd
nTimestomp.exe -f C:\Temp\malware.exe -M "2020-01-01 00:00:00.1234567" -A "2020-01-01 00:00:00.1234567" -C "2020-01-01 00:00:00.1234567" -B "2020-01-01 00:00:00.1234567"
```

检测特征：
- $SI 时间戳被修改，$FN 时间戳保持原始值
- 纳秒精度可以设置为任意值（绕过了"纳秒为 0 即为 Timestomp"的简单检测）
- 通过比对 $SI 和 $FN 仍然可以检测

### 3. SetMACE

SetMACE 是一个可以直接修改 $FN 时间戳的工具（在旧版 Windows 上）。它使用内核级 API `NtSetInformationFile` 和 `NtQueryInformationFile`。

检测特征：
- $SI 和 $FN 时间戳都被修改
- 在旧版 Windows（XP/2003）上有效，在 Windows 10/11 上由于 Patch Guard 保护无法使用
- 需要通过 USN Journal 或 $LogFile 检测

### 4. PowerShell 时间戳修改

攻击者可以使用 PowerShell 修改文件时间戳：

```powershell
$file = Get-Item "C:\Temp\malware.exe"
$file.CreationTime = "2020-01-01 00:00:00"
$file.LastAccessTime = "2020-01-01 00:00:00"
$file.LastWriteTime = "2020-01-01 00:00:00"
```

检测特征：
- 只修改 $SI 时间戳，$FN 保持原始值
- 纳秒精度为 `.0000000`
- PowerShell 的 Script Block Logging（Event ID 4104）会记录完整的命令内容

### 5. 文件重命名/移动绕过

攻击者先 Timestomp $SI，然后重命名或移动文件。Windows 在重命名/移动时会将 $SI 时间戳复制到 $FN：

```
步骤1: Timestomp $SI
  $SI-M: 2020-01-01 00:00:00.0000000
  $FN-M: 2026-06-15 10:30:00.1234567
  → 不一致

步骤2: 重命名文件（malware.exe → svchost.exe）
  $SI-M: 2020-01-01 00:00:00.0000000
  $FN-M: 2020-01-01 00:00:00.0000000
  → 一致（但都是伪造的）
```

检测方法：通过 USN Journal 检测。USN Journal 会记录文件的重命名操作。如果 USN Journal 中显示文件在某个时间被重命名，但 $FN 时间戳早于该重命名时间，说明时间戳被伪造。

---

## 0x03 NTFS 时间规则（Windows Time Rules）

### 1. 基本时间规则

NTFS 文件操作对 MACE 时间戳的影响遵循以下规则（适用于 Windows 10/11）：

| 操作 | M | A | C | E |
|------|---|---|---|---|
| 创建文件 | - | - | ✓ | ✓ |
| 修改文件内容 | ✓ | - | ✓ | - |
| 读取文件内容 | - | ✓ | - | - |
| 修改文件属性 | - | - | ✓ | - |
| 重命名文件 | - | - | ✓ | - |
| 移动文件（同卷） | - | - | ✓ | - |
| 移动文件（跨卷） | ✓ | ✓ | ✓ | ✓（新值） |
| 删除文件 | - | - | - | - |
| 复制文件（同卷） | - | - | - | - |
| 复制文件（跨卷） | ✓ | ✓ | ✓ | ✓（新值） |

关键认知：
- 跨卷复制/移动会创建新的文件记录，所有时间戳都是新值
- 同卷复制只创建硬链接，不改变时间戳
- 重命名只改变 C（Changed）时间戳

### 2. 应用程序特定的时间偏差

Galhuber 和 Luh 的研究（ARES 2021）发现，某些应用程序会导致时间戳行为偏离操作系统规则：

- **Microsoft Office**：Word/Excel 在保存文档时的时间戳行为与标准文件操作不同。Office 使用临时文件和原子替换机制，导致 MACE 时间戳的模式与直接文件修改不同
- **PDF 编辑器**：某些 PDF 编辑器的保存行为会导致 A（Accessed）时间戳不更新
- **图片编辑器**：某些图片编辑器在保存时会同时更新 M 和 C，但不更新 A

取证启示：在分析时间线时，不能简单地套用操作系统级别的时间规则。需要结合文件类型和可能的应用程序，考虑应用程序特定的时间偏差。

---

## 0x04 基于 USN Journal 的 Timestomp 检测

### 1. USN Journal 基础

USN Journal（Update Sequence Number Journal）是 NTFS 的变更日志，记录了卷上所有文件和目录的创建、修改、删除、重命名等操作。

USN Journal 位于 `$Extend/$UsnJrnl`，默认情况下在所有 NTFS 卷上启用。

关键特性：
- USN Journal 记录了文件操作的时间戳（由内核生成，不可被用户级工具修改）
- USN Journal 通常保留 30-40 小时的记录（远多于 $LogFile 的 2-3 小时）
- USN Journal 记录是循环覆盖的，旧记录会被新记录覆盖

### 2. USN Journal 记录格式

每条 USN Journal 记录包含：

```
USN Journal Entry:
  Record Length:    80 bytes
  Major Version:    2
  Minor Version:    0
  File Reference:   562949953421312 (MFT Record Number)
  Parent FRN:       562949953421313
  USN:              12345678
  Timestamp:        2026-06-15 10:30:00.1234567 (UTC)
  Reason:           USN_REASON_FILE_CREATE (0x00000001)
  Source Info:       USN_SOURCE_DATA_MANAGEMENT (0x00000001)
  Security ID:      12345
  File Attributes:  0x20 (Archive)
  Full Path:        \Temp\malware.exe
```

关键取证字段：
- **Timestamp**：操作发生的时间（内核生成，不可被 Timestomp 修改）
- **Reason**：操作类型（创建、修改、删除、重命名等）
- **File Reference**：MFT 记录号，用于关联 MFT 条目

### 3. USN Journal 检测方法

**方法一：时间戳不一致检测**

将 USN Journal 中记录的操作时间与 MFT 中的 $SI 时间戳进行比对：

```
USN Journal 记录：
  文件: C:\Temp\malware.exe
  操作: USN_REASON_FILE_CREATE
  时间: 2026-06-15 10:30:00.1234567

MFT $SI 时间戳：
  $SI-E (Creation): 2020-01-01 00:00:00.0000000

→ 不一致：USN Journal 显示文件在 2026-06-15 创建，但 $SI-E 显示 2020-01-01
→ 结论：$SI 时间戳被篡改
```

**方法二：重命名操作检测**

如果文件被重命名（Timestomp 绕过技术），USN Journal 会记录重命名操作：

```
USN Journal 记录：
  文件: C:\Temp\malware.exe
  操作: USN_REASON_RENAME_OLD_NAME
  时间: 2026-06-15 10:35:00.0000000

  文件: C:\Temp\svchost.exe
  操作: USN_REASON_RENAME_NEW_NAME
  时间: 2026-06-15 10:35:00.0000000

MFT $FN 时间戳：
  $FN-E (Creation): 2020-01-01 00:00:00.0000000

→ 不一致：USN Journal 显示文件在 2026-06-15 被重命名，但 $FN-E 显示 2020-01-01
→ 结论：文件被重命名以绕过 $SI/$FN 比对检测
```

**方法三：BASIC_INFO_CHANGE 事件检测**

USN Journal 中的 `USN_REASON_BASIC_INFO_CHANGE`（0x00008000）表示文件的基本信息（包括时间戳）被修改：

```
USN Journal 记录：
  文件: C:\Temp\malware.exe
  操作: USN_REASON_BASIC_INFO_CHANGE
  时间: 2026-06-15 10:32:00.0000000

→ 该记录表明文件的基本信息（时间戳）在 2026-06-15 10:32 被修改
→ 如果 $SI 时间戳显示为 2020-01-01，说明时间戳在 10:32 被篡改为 2020-01-01
```

### 4. USN Journal 的提取与分析

```cmd
fsutil usn readjournal C: csv > usn_journal.csv
```

或使用取证工具：
- **MFT Explorer**（Magnet Forensics）：可视化解析 USN Journal
- **EZTools USNJrnl**：Eric Zimmerman 的命令行 USN Journal 解析工具
- **Autopsy**：开源取证平台，支持 USN Journal 解析

---

## 0x05 基于 $LogFile 的 Timestomp 检测

### 1. $LogFile 基础

$LogFile 是 NTFS 的事务日志，用于保证文件系统操作的原子性。与 USN Journal 不同，$LogFile 记录的是底层文件系统操作（而非文件级别的操作）。

$LogFile 的关键特性：
- 通常只保留 2-3 小时的记录（远少于 USN Journal）
- 记录了 MFT 记录的修改操作
- 可以被用于恢复被删除的 MFT 条目

### 2. $LogFile 检测方法

**方法一：$SI-C 比对**

将 $LogFile 中记录的文件创建事件的 $SI-C 与 MFT 中的 $SI-C 进行比对：

```
$LogFile 记录：
  文件: C:\Temp\malware.exe
  操作: 文件创建
  $SI-C: 2026-06-15 10:30:00.1234567

MFT $SI-C：
  $SI-C: 2020-01-01 00:00:00.0000000

→ 不一致：$LogFile 显示创建时间为 2026-06-15，但 MFT 显示 2020-01-01
→ 结论：$SI-C 被篡改
```

**方法二：事务重放**

$LogFile 中的事务可以被重放，以恢复文件系统在某个时间点的状态。通过重放事务，可以重建文件操作的历史时间线。

### 3. $LogFile 的局限性

- 只保留 2-3 小时的记录，对于长期潜伏的攻击可能不够
- $LogFile 的解析比 USN Journal 更复杂
- 某些 Timestomp 操作可能不会产生 $LogFile 记录（如果操作发生在 $LogFile 记录被覆盖之后）

---

## 0x06 基于 Prefetch 和事件日志的辅助检测

### 1. Prefetch 检测 Timestomp 工具执行

Prefetch 文件记录了可执行文件的执行历史。如果攻击者使用了 Timestomp 工具（如 `timestomp.exe`、`nTimestomp.exe`），Prefetch 中会保留该工具的执行记录。

```
Prefetch 文件: TIMESTOMP.EXE-ABCDEF12.prefetch
  执行次数: 3
  最后执行时间: 2026-06-15 10:31:00
  执行路径: C:\Tools\timestomp.exe
```

取证分析要点：
- 检查 Prefetch 中是否存在已知 Timestomp 工具的执行记录
- 将 Timestomp 工具的执行时间与可疑文件的时间戳进行比对
- 如果 Timestomp 工具在 10:31 执行，而某个可疑文件的时间戳被设置为 2020-01-01，说明该文件可能被 Timestomp

### 2. 事件日志辅助检测

**PowerShell Script Block Logging（Event ID 4104）**

如果攻击者使用 PowerShell 修改时间戳，Script Block Logging 会记录完整的命令内容：

```xml
<Event>
  <EventID>4104</EventID>
  <EventData>
    <Data Name="ScriptBlockText">
      $file = Get-Item "C:\Temp\malware.exe"
      $file.CreationTime = "2020-01-01 00:00:00"
      $file.LastAccessTime = "2020-01-01 00:00:00"
      $file.LastWriteTime = "2020-01-01 00:00:00"
    </Data>
  </EventData>
</Event>
```

**Sysmon 注册表监控**

Sysmon 可以监控文件时间戳的修改操作。通过配置 Sysmon 监控 `SetFileTime` API 调用，可以实时检测 Timestomp 行为。

**进程创建事件（Event ID 4688）**

如果 Timestomp 工具作为独立进程执行，Event ID 4688 会记录进程创建事件：

```
Event ID 4688:
  新进程: C:\Tools\timestomp.exe
  命令行: timestomp.exe -f C:\Temp\malware.exe -z
  父进程: cmd.exe
  用户: DESKTOP-ABC123\Administrator
```

### 3. LNK 文件辅助检测

LNK 文件（快捷方式）记录了目标文件的时间戳。如果目标文件被 Timestomp，LNK 文件中的时间戳可能与目标文件的当前时间戳不一致：

```
LNK 文件: C:\Users\Administrator\Recent\malware.lnk
  目标文件时间戳（LNK 中记录的）: 2026-06-15 10:30:00
  目标文件当前 $SI-M: 2020-01-01 00:00:00

→ 不一致：LNK 记录的时间戳与目标文件当前时间戳不匹配
→ 结论：目标文件可能被 Timestomp
```

---

## 0x07 公开案例中的 Timestomp 检测

### 案例一：APT29（IRON HEMLOCK）— 后门 Timestomp

APT29 在部署后门时进行了 Timestomp，将后门文件的时间戳修改为与系统文件一致，以规避基于时间线的检测。

检测方法：调查人员通过比对 $SI 和 $FN 时间戳发现了不一致，进而识别出被 Timestomp 的后门文件。

取证启示：$SI/$FN 比对是最基础但最有效的 Timestomp 检测方法。即使攻击者使用了高级工具，只要 $FN 没有被修改，这个方法就有效。

### 案例二：APT32（TIN WOODLAWN）— 计划任务 XML Timestomp

APT32 在创建计划任务后，修改了计划任务 XML 文件的创建时间，使其看起来像是在系统安装时创建的。

检测方法：调查人员通过分析 USN Journal 中的 `USN_REASON_FILE_CREATE` 事件，发现 XML 文件的实际创建时间晚于其 $SI 创建时间。

取证启示：USN Journal 是检测 Timestomp 的最可靠方法之一，因为它记录了文件操作的内核级时间戳，不可被用户级工具修改。

### 案例三：Lazarus（NICKEL ACADEMY）— calc.exe 时间戳复制

Lazarus 将 `calc.exe` 的时间戳复制到恶意载荷上，使恶意文件看起来像是合法的系统文件。

检测方法：调查人员发现恶意文件的 $SI 时间戳与 `calc.exe` 完全一致（精确到秒），这在正常情况下是不可能的。进一步分析 USN Journal 发现恶意文件的实际创建时间远晚于 `calc.exe`。

取证启示：如果多个不相关的文件具有完全相同的时间戳（精确到秒），应当怀疑 Timestomp。正常的文件操作不可能产生完全相同的时间戳。

---

## 0x08 证据强度分层

### 1. 确认 Timestomp（Confirmation Level）

以下条件满足任意一项即可确认文件被 Timestomp：

- $SI 时间戳与 $FN 时间戳不一致（排除重命名绕过的情况）
- USN Journal 中的操作时间与 $SI 时间戳不一致
- $LogFile 中的事务时间与 $SI 时间戳不一致
- Prefetch 中存在 Timestomp 工具的执行记录，且执行时间与可疑文件的时间戳变更时间吻合
- PowerShell Script Block Logging 中记录了时间戳修改命令

### 2. 高度可疑（High Suspicion Level）

以下条件满足任意一项应当视为高度可疑：

- $SI 时间戳的纳秒精度为 `.0000000`（自动化工具的特征）
- 多个不相关的文件具有完全相同的时间戳（精确到秒）
- 文件的时间戳早于操作系统安装时间
- 文件的时间戳与同目录下其他文件的时间戳模式明显不同
- LNK 文件中的目标文件时间戳与目标文件当前时间戳不一致

### 3. 需要关注（Attention Level）

以下条件需要关注，但不足以单独判定 Timestomp：

- $SI 和 $FN 时间戳一致但纳秒精度为 `.0000000`（可能是重命名绕过的结果）
- 文件时间戳看起来正常，但文件内容与时间戳不匹配（如一个"2020 年创建"的文件包含了 2025 年的 API 调用）
- 文件时间戳与 PE 编译时间戳不一致

---

## 0x09 Timestomp 检测工具链

### 1. MFT 分析工具

| 工具 | 用途 | 特点 |
|------|------|------|
| MFT Explorer | MFT 解析 | Magnet Forensics，可视化 $SI/$FN 比对 |
| EZTools MFTECmd | MFT 解析 | Eric Zimmerman，命令行工具 |
| AnalyzeMFT | MFT 解析 | Python 开源工具，支持 $SI/$FN 比对 |

### 2. USN Journal 分析工具

| 工具 | 用途 | 特点 |
|------|------|------|
| EZTools USNJrnl | USN Journal 解析 | Eric Zimmerman，命令行工具 |
| USN Journal Viewer | USN Journal 可视化 | 第三方工具 |
| Autopsy | 综合取证平台 | 开源，支持 USN Journal 解析 |

### 3. 综合取证工具

| 工具 | 用途 | 特点 |
|------|------|------|
| Magnet AXIOM | 综合取证分析 | 支持 MFT、USN Journal、$LogFile 综合分析 |
| X-Ways Forensics | 综合取证分析 | 支持时间线分析和 Timestomp 检测 |
| Volatility | 内存取证 | 支持从内存中提取 MFT 和 USN Journal |

---

## 0x10 参考资料

- ScienceDirect: [Artifacts for Detecting Timestamp Manipulation in NTFS on Windows 10](https://www.sciencedirect.com/science/article/pii/S2666281720300159)
- ACM ARES '21: [Time for Truth: Forensic Analysis of NTFS Timestamps](https://dl.acm.org/doi/10.1145/3465481.3470016)
- IEEE Access 2024: [Forensic Detection of Timestamp Manipulation for Digital Forensic Investigation](https://www.researchgate.net/publication/380284178_Forensic_Detection_of_Timestamp_Manipulation_for_Digital_Forensic_Investigation)
- Inversecos: [Defence Evasion Technique: Timestomping Detection – NTFS Forensics](https://www.inversecos.com/2022/04/defence-evasion-technique-timestomping.html)
- Medium: [NTFS File Timestamps: Window Forensics, Timestomping, and Detection](https://honeyknows.medium.com/ntfs-file-timestamps-window-forensics-timestomping-and-detection-742d3de55d11)
- ScienceDirect 2025: [A practical approach to detecting file timestamp manipulation for digital forensic investigation](https://www.sciencedirect.com/science/article/abs/pii/S0957417425022493)
- MITRE ATT&CK: [T1070.006 — Indicator Removal: Timestomp](https://attack.mitre.org/techniques/T1070/006/)
- GitHub: [nTimetools — Timestomper and Timestamp checker with nanosecond accuracy](https://github.com/limbenjamin/nTimetools)
