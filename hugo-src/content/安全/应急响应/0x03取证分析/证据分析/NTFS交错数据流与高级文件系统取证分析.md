---
title: "NTFS交错数据流与高级文件系统取证分析"
date: 2026-06-26T10:00:00+08:00
draft: false
weight: 430
description: "围绕 NTFS 文件系统高级特性的取证分析，深入分析交错数据流（ADS）原理与攻击、NTFS 元数据取证（$MFT/$I30/$LogFile/$UsnJrnl）、ADS 隐藏与检测、数据恢复、文件系统级 Rootkit 取证等技术。"
categories: ["应急响应", "取证分析"]
tags: ["NTFS", "ADS", "交错数据流", "$MFT", "$I30", "文件系统取证", "隐藏数据", "数据恢复"]
---

# NTFS交错数据流与高级文件系统取证分析

NTFS（New Technology File System）是 Windows 操作系统的核心文件系统，它不仅负责存储和管理文件数据，还通过一系列复杂的元数据结构记录着文件系统中的每一个操作。攻击者在入侵过程中，往往会利用 NTFS 的高级特性（如交错数据流、元数据操纵、文件系统过滤器驱动）来隐藏恶意代码、存储窃取的数据、甚至实现持久化驻留。这些技术一旦被滥用，将对应急响应和取证分析造成极大的挑战。

已有文章 `文件系统时间戳取证与Timestomp检测分析` 覆盖了 NTFS 时间戳的双层架构与 Timestomp 检测方法，`反取证技术综合分析与检测方法` 覆盖了 ADS 在反取证中的初步应用。本文换一个角度：**以 NTFS 文件系统的底层架构为起点，深入分析交错数据流（ADS）的原理与攻击手法、NTFS 元数据取证（$MFT/$I30/$LogFile/$UsnJrnl）的完整技术栈、ADS 的检测与取证方法、文件系统级 Rootkit 的取证分析，以及基于这些技术的自动化检测与威胁狩猎方案。**

---

## 0x01 NTFS 文件系统基础

### 1. NTFS 架构概述

NTFS 采用 B+ 树结构组织文件系统元数据，其核心架构由卷引导扇区（Volume Boot Record, VBR）和一组系统文件组成。

**BPB（BIOS Parameter Block）**

BPB 位于卷引导扇区偏移 0x0B 处，包含文件系统的关键参数：

| 字段 | 偏移 | 大小 | 说明 |
|------|------|------|------|
| BytesPerSector | 0x0B | 2 | 每扇区字节数（通常为 512） |
| SectorsPerCluster | 0x0D | 1 | 每簇扇区数 |
| ReservedSectors | 0x0E | 2 | 保留扇区数 |
| TotalSectors | 0x18 | 8 | 卷总扇区数 |
| MftClusterNumber | 0x20 | 8 | $MFT 起始簇号 |
| MftMirrorClusterNumber | 0x28 | 8 | $MFT 镜像起始簇号 |
| ClustersPerFileRecord | 0x30 | 4 | 文件记录占用簇数 |
| ClustersPerIndexBuffer | 0x34 | 4 | 索引缓冲区占用簇数 |
| VolumeSerialNumber | 0x38 | 8 | 卷序列号 |
| Checksum | 0x40 | 4 | BPB 校验和 |

**卷元数据文件**

NTFS 将文件系统元数据存储为特殊文件（以 `$` 开头），这些文件在常规文件浏览中不可见：

| 文件名 | 功能 |
|--------|------|
| $MFT | 主文件表，存储所有文件记录 |
| $MFTMirr | $MFT 的前几个记录的备份 |
| $LogFile | 事务日志文件，用于恢复 |
| $Volume | 卷信息（卷标、版本、状态） |
| $AttrDef | 属性定义表 |
| $Root | 根目录 |
| $Bitmap | 簇分配位图 |
| $Boot | 卷引导扇区 |
| $BadClus | 坏簇列表 |

### 2. 主文件表（$MFT）结构

$MFT 是 NTFS 的核心，每一个文件和目录在 $MFT 中都有至少一个记录（File Record）。$MFT 本身也是一个文件，由 $Bitmap 管理其簇分配。

$MFT 记录的大小由 BPB 中的 `ClustersPerFileRecord` 决定，通常为 1024 字节（2 个 512 字节扇区或 1 个 1024 字节簇）。每个记录由以下部分组成：

- **文件记录头**（偏移 0x00-0x2B）：包含签名（FILE）、更新序列号、$MFT 记录号、序列号等
- **属性列表**（偏移 0x30 起）：包含该文件的所有属性

### 3. 文件记录（File Record）结构

```
文件记录头（42 字节）：
├── 签名：FILE（4 字节）
├── 更新序列偏移（2 字节）
├── 更新序列大小（2 字节）
├── 日志序列号 LSN（8 字节）
├── 序列号（2 字节）
├── 硬链接计数（2 字节）
├── 第一个属性偏移（2 字节）
├── 标志（2 字节）：已使用 / 目录 / 空闲
├── 实际大小（4 字节）
├── 分配大小（4 字节）
├── 基本记录 ID（4 字节）
├── 下一个属性 ID（2 字节）
└── 更新序列（2 + 2×N 字节）

属性结构：
├── 属性类型（4 字节）
├── 属性大小（4 字节）
├── 非驻留标志（1 字节）
└── 属性内容（可变）
```

### 4. 属性类型

NTFS 通过属性（Attribute）来描述文件的各种元数据和数据。关键属性类型包括：

| 属性类型 | 名称 | 说明 |
|----------|------|------|
| 0x10 | $STANDARD_INFORMATION | 标准信息：MACE 时间戳、文件属性、安全描述符 ID |
| 0x20 | $ATTRIBUTE_LIST | 属性列表：当属性过多时使用 |
| 0x30 | $FILE_NAME | 文件名属性：文件名、MACE 时间戳、父目录引用 |
| 0x40 | $OBJECT_ID | 对象 ID（分布式链接跟踪） |
| 0x50 | $SECURITY_DESCRIPTOR | 安全描述符 |
| 0x60 | $VOLUME_NAME | 卷名 |
| 0x70 | $VOLUME_INFORMATION | 卷信息 |
| 0x80 | $DATA | 数据属性：文件内容或 ADS 数据 |
| 0x90 | $INDEX_ROOT | 索引根：B+ 树的根节点 |
| 0xA0 | $INDEX_ALLOCATION | 索引分配：B+ 树的子节点 |
| 0xB0 | $BITMAP | 位图：索引分配的使用情况 |
| 0xC0 | $REPARSE_POINT | 重分析点（符号链接、挂载点） |
| 0xD0 | $EA_INFORMATION | 扩展属性信息 |
| 0xE0 | $EA | 扩展属性 |
| 0x100 | $LOGGED_UTILITY_STREAM | EFS 加密流 |

**$STANDARD_INFORMATION（$SI）与 $FILE_NAME（$FN）的区别**

$SI 包含四个 MACE 时间戳，可通过用户级 Windows API（`SetFileTime`）修改。$FN 包含文件名和自己的 MACE 时间戳，由内核维护，不能通过标准 API 修改。这种双层结构是 Timestomp 检测的基础。

### 5. NTFS 日志机制（$LogFile）

$LogFile（也称为 NTFS Log File）记录文件系统元数据的修改操作，用于在系统崩溃后恢复文件系统的一致性。

$LogFile 由两部分组成：
- **日志记录区域**（Log Record Area）：存储实际的日志记录
- **重启区域**（Restart Area）：存储日志恢复所需的信息

每个日志记录包含：
- **日志记录头**：LSN（日志序列号）、当前 LSN、客户端 ID、记录类型
- **客户端数据**：实际的元数据修改操作

$LogFile 的主要作用：
- 系统崩溃后恢复 $MFT 的一致性
- 恢复目录索引的完整性
- 恢复安全描述符的一致性

---

## 0x02 交错数据流（ADS）原理

### 1. ADS 的定义和工作机制

交错数据流（Alternate Data Streams, ADS）是 NTFS 文件系统的一项原生特性，允许一个文件或目录关联多个独立的数据流。每个 NTFS 对象至少有一个未命名的默认数据流（Unnamed Data Stream），存储文件的主要内容。ADS 则是附加的命名数据流，可以存储任意类型的数据。

ADS 的工作机制：
- 每个 MFT 记录可以包含多个 `$DATA`（0x80）属性
- 每个 `$DATA` 属性可以有不同的名称
- 未命名的 `$DATA` 属性存储文件的主要内容
- 命名的 `$DATA` 属性存储 ADS 数据
- ADS 数据在普通文件浏览中不可见

**ADS 的创建语法**

```cmd
type payload.exe > C:\Temp\clean.txt:ads_name.exe
```

```powershell
Set-Content -Path "C:\Temp\clean.txt" -Value "hidden data" -Stream "secret.txt"
```

```powershell
Add-Content -Path "C:\Temp\clean.txt" -Value "more data" -Stream "secret.txt"
```

**ADS 的读取语法**

```cmd
type C:\Temp\clean.txt:ads_name.exe
```

```powershell
Get-Content -Path "C:\Temp\clean.txt" -Stream "secret.txt"
```

### 2. ADS 的命名规则

ADS 的命名遵循以下规则：
- 名称长度限制为 255 个字符（NTFS 规范限制）
- 名称不能包含反斜杠 `\`
- 名称区分大小写
- 未命名流的名称为空字符串
- 可以使用数字、字母、特殊字符
- 常见的合法 ADS 名称格式：`Zone.Identifier`、`MacFinder`

### 3. ADS 与文件系统的关系

ADS 数据在文件系统中的存储方式：
- 小型 ADS 数据（约 700 字节以内）直接存储在 MFT 记录的属性中（驻留属性）
- 大型 ADS 数据存储在磁盘的独立簇中（非驻留属性），通过数据运行（Data Run）引用
- ADS 数据占用磁盘空间，计入文件大小
- ADS 数据会被备份工具复制（如果备份工具支持）

**关键认知**：ADS 数据虽然存储在 NTFS 中，但 Windows 资源管理器默认不会显示 ADS 的存在。`dir` 命令默认也不会列出 ADS。这是 ADS 被滥用的根本原因。

### 4. ADS 在 Windows 中的使用场景

**Zone.Identifier**

当用户从网络下载文件时，Windows 的 Mark of the Web（MOTW）机制会创建一个名为 `Zone.Identifier` 的 ADS，记录文件的来源区域：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ZoneId>3</ZoneId>
```

Zone ID 含义：
- 0：本地计算机
- 1：本地内网
- 2：可信站点
- 3：Internet
- 4：受限站点

**MacFinder**

macOS 系统在 NTFS 卷上创建文件时，会附加一个 `com.apple.FinderInfo` ADS，存储 macOS 特有的元数据。这在跨平台取证中经常造成混淆。

**EFS 加密**

加密文件系统（EFS）使用 `$LOGGED_UTILITY_STREAM`（0x100）属性存储加密元数据，这与 ADS 在概念上类似但使用不同的属性类型。

---

## 0x03 ADS 攻击与隐藏技术

### 1. 使用 ADS 隐藏恶意代码

攻击者将可执行文件或脚本存储在合法文件的 ADS 中，通过 `wmic` 或 `powershell` 从 ADS 中直接执行：

**方法一：wmic 执行**

```cmd
wmic process call create "C:\Windows\System32\cmd.exe /c type C:\Temp\clean.txt:payload.exe > %TEMP%\temp.exe && %TEMP%\temp.exe"
```

**方法二：PowerShell 执行**

```powershell
$bytes = [System.IO.File]::ReadAllBytes("C:\Temp\clean.txt:payload.exe")
[System.IO.File]::WriteAllBytes("$env:TEMP\temp.exe", $bytes)
Start-Process "$env:TEMP\temp.exe"
```

**方法三：PowerShell Invoke-Item**

```powershell
$adsPath = "C:\Temp\clean.txt:payload.exe"
Start-Process -FilePath "powershell.exe" -ArgumentList "-c Get-Item -Path '$adsPath' | Invoke-Item"
```

取证特征：
- 文件资源管理器和常规 `dir` 命令无法看到 ADS
- 事件日志 Event ID 4663（对象访问审计）可能记录 ADS 操作
- Prefetch 中可能出现相关程序的执行记录
- ADS 数据写入时会更新父文件的 $MFT 记录时间戳

### 2. 使用 ADS 存储窃取数据

攻击者将窃取的数据存储在 ADS 中，待后续提取：

**方法一：直接写入**

```cmd
type C:\Users\victim\Documents\confidential.docx > C:\Temp\report.xlsx:confidential.docx
```

**方法二：PowerShell 编码写入**

```powershell
$data = Get-Content -Path "C:\Users\victim\Documents\confidential.docx" -Encoding Byte
Set-Content -Path "C:\Temp\report.xlsx" -Value $data -Stream "confidential.docx" -Encoding Byte
```

**方法三：分块写入**

```powershell
$data = Get-Content -Path "C:\Users\victim\Documents\large_file.bin" -Encoding Byte -ReadCount 0
$chunkSize = 1024
for ($i = 0; $i -lt $data.Length; $i += $chunkSize) {
    $chunk = $data[$i..([Math]::Min($i + $chunkSize - 1, $data.Length - 1))]
    Add-Content -Path "C:\Temp\ innocent.log" -Value $chunk -Stream "exfil_$([Math]::Floor($i/$chunkSize))" -Encoding Byte
}
```

取证特征：
- 文件大小异常：文件的磁盘占用远大于资源管理器显示的大小
- $MFT 记录中出现多个 `$DATA` 属性
- 文件创建时间与最后修改时间差异巨大
- $UsnJrnl 中可能出现异常的 DATA_OVERWRITE 事件

### 3. 使用 ADS 实现持久化

攻击者将后门代码存储在 ADS 中，通过计划任务或 WMI 事件订阅定期执行：

**计划任务持久化**

```cmd
schtasks /create /tn "SystemUpdate" /tr "powershell.exe -c \"$bytes = [IO.File]::ReadAllBytes('C:\Windows\System32\clean.txt:backdoor.ps1'); IEX ([Text.Encoding]::UTF8.GetString($bytes))\"" /sc hourly /mo 1
```

**WMI 事件订阅持久化**

```powershell
$filterArgs = @{
    EventNamespace = 'root\cimv2'
    Name = 'ADSBackdoorFilter'
    Query = "SELECT * FROM __InstanceModificationEvent WITHIN 60 WHERE TargetInstance ISA 'Win32_LocalTime' AND TargetInstance.Second = 0"
    QueryLanguage = 'WQL'
}
$filter = Set-WmiInstance -Namespace root\subscription -Class __EventFilter -Arguments $filterArgs

$consumerArgs = @{
    Name = 'ADSBackdoorConsumer'
    CommandLineTemplate = "powershell.exe -c `$bytes = [IO.File]::ReadAllBytes('C:\Windows\System32\clean.txt:backdoor.ps1'); IEX ([Text.Encoding]::UTF8.GetString(`$bytes))"
}
$consumer = Set-WmiInstance -Namespace root\subscription -Class CommandLineEventConsumer -Arguments $consumerArgs

$bindingArgs = @{
    Filter = $filter
    Consumer = $consumer
}
Set-WmiInstance -Namespace root\subscription -Class __FilterToConsumerBinding -Arguments $bindingArgs
```

### 4. ADS 与 PowerShell 脚本攻击

攻击者将 PowerShell 脚本存储在 ADS 中，通过 `Invoke-Expression` 直接执行：

```powershell
Invoke-Expression (Get-Content -Path "C:\Windows\System32\notepad.exe:script.ps1" -Raw)
```

更隐蔽的变体：

```powershell
$content = [System.IO.StreamReader]::new("C:\Windows\System32\notepad.exe:encoded.ps1").ReadToEnd()
$decoded = [System.Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($content))
Invoke-Expression $decoded
```

### 5. 使用 ADS 隐藏命令历史

攻击者将命令历史存储在 ADS 中，避免被 `Get-History` 或 PowerShell 日志捕获：

```powershell
$history = Get-History | Out-String
$history | Out-File -FilePath "C:\Windows\System32\cmd.exe:history.txt"
```

```powershell
Clear-History
```

### 6. 取证特征

**Event ID 4663（对象访问审计）**

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Security-Auditing" Guid="{54849625-5478-4994-A5BA-3E3B0328C30D}"/>
    <EventID>4663</EventID>
    <Version>1</Version>
    <Level>0</Level>
    <Task>12800</Task>
    <Opcode>0</Opcode>
    <Keywords>0x8020000000000000</Keywords>
    <TimeCreated SystemTime="2026-06-25T08:30:00.123456789Z"/>
    <EventRecordID>12345</EventRecordID>
    <Channel>Security</Channel>
    <Computer>WORKSTATION01</Computer>
  </System>
  <EventData>
    <Data Name="SubjectUserSid">S-1-5-21-1234567890-1234567890-1234567890-1001</Data>
    <Data Name="SubjectUserName">attacker</Data>
    <Data Name="SubjectDomainName">CORP</Data>
    <Data Name="SubjectLogonId">0x3E7</Data>
    <Data Name="ObjectType">File</Data>
    <Data Name="ObjectName">C:\Temp\clean.txt</Data>
    <Data Name="AccessList">%%4417</Data>
    <Data Name="AccessMask">0x2</Data>
    <Data Name="ProcessName">C:\Windows\System32\cmd.exe</Data>
    <Data Name="ResourceAttributes">Stream Name: :payload.exe</Data>
  </EventData>
</Event>
```

注意 `ResourceAttributes` 字段中的 `Stream Name: :payload.exe`，这明确标识了 ADS 操作。

**文件系统操作日志**

- $UsnJrnl 中的 DATA_OVERWRITE 事件可能显示对非默认数据流的写入
- $LogFile 中的事务记录可以还原 ADS 的创建和修改操作
- Sysmon Event ID 15（FileCreateStreamHash）记录 ADS 的创建

### 7. 检测方法

```powershell
Get-ChildItem -Path "C:\Temp" -Recurse -Force | ForEach-Object {
    $streams = Get-Item $_.FullName -Stream * -ErrorAction SilentlyContinue
    foreach ($stream in $streams) {
        if ($stream.Stream -ne ':$DATA') {
            [PSCustomObject]@{
                Path = $_.FullName
                Stream = $stream.Stream
                Size = $stream.Length
            }
        }
    }
}
```

---

## 0x04 NTFS 元数据取证 — $MFT 分析

### 1. $MFT 的结构和解析方法

$MFT 是 NTFS 文件系统中最重要的取证数据源，它记录了卷上所有文件和目录的元数据。每个文件在 $MFT 中至少占一个 1024 字节的记录。

**$MFT 记录头解析**

```python
import struct

def parse_mft_record(record_data):
    if record_data[:4] != b'FILE':
        return None
    
    result = {}
    result['signature'] = record_data[:4].decode('ascii')
    result['update_seq_offset'] = struct.unpack_from('<H', record_data, 4)[0]
    result['update_seq_size'] = struct.unpack_from('<H', record_data, 6)[0]
    result['lsn'] = struct.unpack_from('<Q', record_data, 8)[0]
    result['sequence_number'] = struct.unpack_from('<H', record_data, 16)[0]
    result['hard_link_count'] = struct.unpack_from('<H', record_data, 18)[0]
    result['first_attr_offset'] = struct.unpack_from('<H', record_data, 20)[0]
    result['flags'] = struct.unpack_from('<H', record_data, 22)[0]
    result['real_size'] = struct.unpack_from('<I', record_data, 24)[0]
    result['allocated_size'] = struct.unpack_from('<I', record_data, 28)[0]
    result['base_record'] = struct.unpack_from('<I', record_data, 32)[0]
    result['next_attr_id'] = struct.unpack_from('<H', record_data, 36)[0]
    
    result['is_dir'] = bool(result['flags'] & 0x02)
    result['is_active'] = bool(result['flags'] & 0x01)
    
    return result

def parse_attribute(attr_data):
    attr = {}
    attr['type'] = struct.unpack_from('<I', attr_data, 0)[0]
    attr['length'] = struct.unpack_from('<I', attr_data, 4)[0]
    attr['non_resident'] = struct.unpack_from('B', attr_data, 8)[0]
    attr['name_length'] = struct.unpack_from('B', attr_data, 9)[0]
    attr['name_offset'] = struct.unpack_from('<H', attr_data, 10)[0]
    attr['flags'] = struct.unpack_from('<H', attr_data, 12)[0]
    attr['attribute_id'] = struct.unpack_from('<H', attr_data, 14)[0]
    
    return attr
```

### 2. 文件恢复技术

从 $MFT 中恢复已删除文件是取证分析中最常用的技术之一。当文件被删除时，NTFS 只修改 $MFT 记录的标志位（将"已使用"标记为"空闲"），但文件数据和 $MFT 记录本身并不会立即被覆盖。

**恢复流程**

```bash
python3 analyzeMFT.py -f /path/to/evidence/mft.raw -o recovered_mft.csv --body recovered_mft.body
```

分析 CSV 输出中的关键字段：
- `MFT Entry`：$MFT 记录号
- `Sequence Number`：序列号（删除后递增，用于检测记录是否被重用）
- `Parent Entry`：父目录记录号
- `Filename`：文件名
- `SICreateTime` / `FNCreateTime`：创建时间
- `SIModifyTime` / `FNModifyTime`：修改时间
- `Size`：文件大小
- `Data Runs`：数据运行（磁盘位置）

**恢复条件**

- $MFT 记录标志位为空闲（已删除）
- $MFT 记录尚未被新文件重用
- 数据运行引用的簇尚未被覆盖
- 文件名信息完整（$FN 属性未被清除）

**恢复成功率评估**

| 情况 | 恢复成功率 |
|------|-----------|
| 删除后未进行大量写入操作 | 高（>90%） |
| 删除后进行了中等写入操作 | 中（50-90%） |
| 删除后进行了大量写入操作 | 低（<50%） |
| 使用 SDelete 等工具安全删除 | 极低（仅能恢复文件名） |

### 3. 时间戳分析

$SI 和 $FN 时间戳的差异分析是 Timestomp 检测的核心技术。

**正常文件的双层时间戳**

```
文件名：report.docx
$SI-Created:  2026-06-15 10:30:00.1234567
$FN-Created:  2026-06-15 10:30:00.1234567
$SI-Modified: 2026-06-20 14:22:00.9876543
$FN-Modified: 2026-06-20 14:22:00.9876543
→ 一致，未被篡改
```

**Timestomp 后的时间戳**

```
文件名：report.docx
$SI-Created:  2020-01-01 00:00:00.0000000
$FN-Created:  2026-06-15 10:30:00.1234567
$SI-Modified: 2020-01-01 00:00:00.0000000
$FN-Modified: 2026-06-20 14:22:00.9876543
→ $SI 被篡改，$FN 保持原值
```

**使用 analyzeMFT 进行批量检测**

```python
import csv

def detect_timestomping(mft_csv_path):
    suspicious = []
    with open(mft_csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            si_created = row.get('SICreateTime', '')
            fn_created = row.get('FNCreateTime', '')
            si_modified = row.get('SIModifyTime', '')
            fn_modified = row.get('FNModifyTime', '')
            
            if si_created != fn_created or si_modified != fn_modified:
                suspicious.append({
                    'mft_entry': row.get('MFT Entry'),
                    'filename': row.get('Filename'),
                    'si_created': si_created,
                    'fn_created': fn_created,
                    'si_modified': si_modified,
                    'fn_modified': fn_modified,
                    'reason': 'SI/FN timestamp mismatch'
                })
            
            if si_created and si_created.startswith('2020-01-01 00:00:00'):
                suspicious.append({
                    'mft_entry': row.get('MFT Entry'),
                    'filename': row.get('Filename'),
                    'si_created': si_created,
                    'reason': 'Zero timestamp detected'
                })
    
    return suspicious
```

### 4. $MFT 中的文件属性解析

解析 $MFT 中的 `$DATA` 属性可以检测 ADS 的存在。一个文件如果包含多个 `$DATA` 属性（一个未命名，一个或多个命名），则说明存在 ADS。

**检测 ADS 的 $MFT 解析**

```python
def detect_ads_in_mft(record_data):
    ads_list = []
    offset = struct.unpack_from('<H', record_data, 20)[0]
    
    while offset < len(record_data):
        attr_type = struct.unpack_from('<I', record_data, offset)[0]
        if attr_type == 0xFFFFFFFF:
            break
        
        attr_length = struct.unpack_from('<I', record_data, offset + 4)[0]
        name_length = struct.unpack_from('B', record_data, offset + 9)[0]
        name_offset = struct.unpack_from('<H', record_data, offset + 10)[0]
        
        if attr_type == 0x80 and name_length > 0:
            attr_name = record_data[offset + name_offset:offset + name_offset + name_length * 2].decode('utf-16-le')
            non_resident = struct.unpack_from('B', record_data, offset + 8)[0]
            if non_resident:
                data_runs_offset = struct.unpack_from('<H', record_data, offset + 32)[0]
                ads_list.append({
                    'name': attr_name,
                    'offset': offset,
                    'data_runs_offset': data_runs_offset
                })
        
        offset += attr_length
    
    return ads_list
```

### 5. 使用工具解析 $MFT

**analyzeMFT**

```bash
python3 analyzeMFT.py -f /path/to/evidence/mft.raw -o output.csv --body output.body
```

关键参数：
- `-f`：$MFT 文件路径
- `-o`：输出 CSV 文件
- `--body`：输出 body 格式（用于 timeline 工具）
- `-e`：指定编码
- `-b`：输出扇区信息

**MFTExplorer**

MFTExplorer 是一个 Windows GUI 工具，可以直接打开原始磁盘或磁盘镜像，解析并展示 $MFT 记录的详细信息，包括：
- 所有属性的十六进制和解释视图
- 数据运行的可视化
- 时间戳对比
- ADS 检测

---

## 0x05 NTFS 元数据取证 — $I30 与目录索引

### 1. $I30 目录索引结构

$I30 是 NTFS 用于目录遍历的索引结构，它存储在目录的 `$INDEX_ROOT`（0x90）和 `$INDEX_ALLOCATION`（0xA0）属性中。

$I30 索引条目的结构：

```
索引条目头：
├── MFT 记录号（4 字节）
├── 索引条目大小（2 字节）
├── 文件名属性大小（2 字节）
├── 索引标志（1 字节）：0x01 = 子节点存在
├── 保留（1 字节）
└── 父目录引用（8 字节）

文件名属性内容：
├── 父目录引用（6 字节）
├── 时间戳（8 字节 × 4）
├── 文件属性（4 字节）
├── 文件名大小（1 字节）
├── 文件名命名空间（1 字节）：0=POSIX, 1=Win32, 2=DOS, 3=Win32+DOS
└── 文件名（可变）
```

### 2. 目录遍历记录分析

$I30 记录按文件名排序存储在 B+ 树中，用于加速目录遍历。每个条目包含文件名和对应的 MFT 记录号，这是目录到文件的引用。

**分析要点**

- 检查 $I30 中的文件名是否与 $MFT 中的一致
- 检查 $I30 中的 MFT 记录号是否指向有效记录
- 检查 $I30 的索引条目数是否与实际文件数一致

### 3. 文件删除后 $I30 残留分析

当文件被删除时，NTFS 会：
1. 标记 $MFT 记录为空闲
2. 从父目录的 $I30 索引中移除对应条目
3. 但 $I30 的索引条目数据可能仍然残留在磁盘上

**残留条目恢复**

```python
import struct

def recover_i30_entries(index_allocation_data):
    entries = []
    offset = 0x18
    
    while offset < len(index_allocation_data):
        entry_signature = index_allocation_data[offset:offset+4]
        if entry_signature == b'INDX':
            entries_offset = struct.unpack_from('<H', index_allocation_data, offset + 24)[0]
            entries_end = struct.unpack_from('<I', index_allocation_data, offset + 28)[0]
            parse_i30_entries(index_allocation_data, offset + entries_offset, entries_end, entries)
        
        offset += 4096
    
    return entries

def parse_i30_entries(data, start, end, entries):
    offset = start
    while offset < end:
        mft_ref = struct.unpack_from('<I', data, offset)[0] & 0xFFFFFFFFFFFF
        entry_size = struct.unpack_from('<H', data, offset + 4)[0]
        filename_size = struct.unpack_from('<H', data, offset + 8)[0]
        
        if entry_size == 0:
            break
        
        filename_ns = data[offset + 13]
        filename_bytes = data[offset + 14:offset + 14 + filename_size]
        try:
            filename = filename_bytes.decode('utf-16-le')
        except:
            filename = '<decode_error>'
        
        entries.append({
            'mft_ref': mft_ref,
            'filename': filename,
            'namespace': filename_ns,
            'entry_size': entry_size,
            'filename_size': filename_size
        })
        
        offset += entry_size
```

### 4. 使用 $I30 恢复文件名和路径

$I30 残留是恢复已删除文件名的最可靠数据源之一。即使 $MFT 记录已被重用，$I30 残留可能仍然保留原始的文件名信息。

**恢复策略**

```bash
python3 i30parse.py -f /path/to/evidence/image.raw -d /path/to/output/
```

或使用 Autopsy 的 Directory Analyzer 模块：
1. 加载磁盘镜像
2. 导航到可疑目录
3. 查看"Deleted Files"选项卡
4. 检查 $I30 残留条目

### 5. $I30 与 $MFT 的关联分析

将 $I30 残留条目与 $MFT 记录进行交叉比对，可以重建完整的文件系统时间线：

```python
def cross_reference_i30_mft(i30_entries, mft_records):
    results = []
    for entry in i30_entries:
        mft_ref = entry['mft_ref']
        if mft_ref in mft_records:
            mft_rec = mft_records[mft_ref]
            results.append({
                'filename_i30': entry['filename'],
                'filename_mft': mft_rec.get('filename'),
                'mft_ref': mft_ref,
                'mft_active': mft_rec.get('is_active'),
                'si_created': mft_rec.get('si_created'),
                'fn_created': mft_rec.get('fn_created'),
                'discrepancy': entry['filename'] != mft_rec.get('filename')
            })
        else:
            results.append({
                'filename_i30': entry['filename'],
                'mft_ref': mft_ref,
                'mft_active': False,
                'note': 'MFT record not found or reused'
            })
    return results
```

---

## 0x06 NTFS 元数据取证 — $LogFile 与日志分析

### 1. $LogFile 的结构和作用

$LogFile 是 NTFS 的事务日志文件，记录文件系统元数据的修改操作。它的主要作用是在系统崩溃后恢复文件系统的一致性。

$LogFile 的大小由格式化时的参数决定，默认为 65536 个簇（约 64MB），可以通过 `format /L` 增大到 128MB 或更大。

**$LogFile 的双重日志区域**

NTFS 使用两个日志区域实现"乒乓"切换：
- **区域 A**（Client Log Area A）
- **区域 B**（Client Log Area B）

当一个区域写满后，NTFS 会切换到另一个区域，同时在重启区域中记录当前使用的区域。

### 2. 事务日志恢复技术

$LogFile 中的每条日志记录包含一个 LSN（Log Sequence Number），标识记录的唯一顺序。LSN 由以下部分组成：

```
LSN = 区域号(4位) | 区域偏移(8位) | 序列号(4位)
```

**日志记录类型**

| 记录类型 | 说明 |
|----------|------|
| 0x00 | 忽略 |
| 0x01 | Prepare (Do) |
| 0x02 | Commit (Redo) |
| 0x03 | Undo |
| 0x04 | CommitDone |
| 0x05 | Forget |

### 3. 使用 $LogFile 还原文件操作

通过解析 $LogFile，可以还原以下类型的文件操作：

- **文件创建**：在 $MFT 中分配新记录
- **文件删除**：将 $MFT 记录标记为空闲
- **文件重命名**：修改 $FN 属性
- **数据写入**：更新 $DATA 属性的数据运行
- **目录修改**：更新 $I30 索引
- **权限修改**：更新安全描述符

```python
def parse_logfile(logfile_data):
    restart_area_offset = 0x30
    client_array_offset = struct.unpack_from('<I', logfile_data, restart_area_offset)[0]
    client_array = struct.unpack_from('<I', logfile_data, restart_area_offset + 4)[0]
    
    records = []
    offset = 0x4000
    
    while offset < len(logfile_data) - 4:
        record_type = struct.unpack_from('<H', logfile_data, offset)[0]
        if record_type == 0:
            break
        
        redo_length = struct.unpack_from('<H', logfile_data, offset + 2)[0]
        undo_length = struct.unpack_from('<H', logfile_data, offset + 4)[0]
        client_data_length = struct.unpack_from('<H', logfile_data, offset + 6)[0]
        client_id = struct.unpack_from('<I', logfile_data, offset + 8)[0]
        target_attribute = struct.unpack_from('<I', logfile_data, offset + 12)[0]
        lsn = struct.unpack_from('<Q', logfile_data, offset + 16)[0]
        
        records.append({
            'lsn': lsn,
            'type': record_type,
            'redo_length': redo_length,
            'undo_length': undo_length,
            'client_id': client_id,
            'offset': offset
        })
        
        if client_data_length > 0:
            offset += client_data_length
        else:
            offset += 4
    
    return records
```

### 4. 磁盘修复日志分析

当使用 `chkdsk` 修复 NTFS 卷时，会生成修复日志。分析这些日志可以发现：

- 文件系统不一致的类型和位置
- 修复操作的具体内容
- 被删除的文件或目录
- 被修复的损坏记录

```cmd
chkdsk C: /v /x > C:\Temp\chkdsk_output.txt 2>&1
```

### 5. 事件还原方法

综合使用 $LogFile、$MFT 和 $UsnJrnl，可以构建完整的文件系统事件时间线：

```python
def build_event_timeline(logfile_records, usnjrnl_records, mft_records):
    timeline = []
    
    for record in logfile_records:
        event = {
            'source': 'LogFile',
            'lsn': record['lsn'],
            'type': record['type'],
            'description': describe_logfile_operation(record, mft_records)
        }
        timeline.append(event)
    
    for record in usnjrnl_records:
        event = {
            'source': 'UsnJrnl',
            'usn': record['usn'],
            'timestamp': record['timestamp'],
            'type': record['reason'],
            'filename': record['filename'],
            'description': record['reason']
        }
        timeline.append(event)
    
    timeline.sort(key=lambda x: x.get('lsn', x.get('usn', 0)))
    return timeline
```

---

## 0x07 NTFS 元数据取证 — $UsnJrnl 变更日志

### 1. USN 变更日志的结构和作用

USN（Update Sequence Number）变更日志（$UsnJrnl）是 NTFS 提供的文件变更记录机制，它记录了卷上每个文件的修改操作。USN 变更日志存储在 `$Extend\$UsnJrnl` 文件中，包含两个数据流：
- **$J**：实际的变更日志数据
- **$Max**：最大 USN 值和日志大小限制

### 2. 变更记录类型

USN 变更记录类型（USN Reason Codes）：

| 代码 | 名称 | 说明 |
|------|------|------|
| 0x00000001 | USN_REASON_DATA_OVERWRITE | 数据覆写 |
| 0x00000002 | USN_REASON_DATA_EXTEND | 数据扩展 |
| 0x00000004 | USN_REASON_NAMED_DATA_OVERWRITE | 命名数据流覆写 |
| 0x00000008 | USN_REASON_NAMED_DATA_EXTEND | 命名数据流扩展 |
| 0x00000010 | USN_REASON_FILE_CREATE | 文件创建 |
| 0x00000020 | USN_REASON_FILE_DELETE | 文件删除 |
| 0x00000040 | USN_REASON_EA_CHANGE | 扩展属性变更 |
| 0x00000080 | USN_REASON_SECURITY_CHANGE | 安全描述符变更 |
| 0x00000100 | USN_REASON_RENAME_OLD_NAME | 重命名（旧名） |
| 0x00000200 | USN_REASON_RENAME_NEW_NAME | 重命名（新名） |
| 0x00000400 | USN_REASON_INDEXABLE_CHANGE | 索引标志变更 |
| 0x00000800 | USN_REASON_HARD_LINK_CHANGE | 硬链接变更 |
| 0x00001000 | USN_REASON_COMPRESSION_CHANGE | 压缩变更 |
| 0x00002000 | USN_REASON_ENCRYPTION_CHANGE | 加密变更 |
| 0x00004000 | USN_REASON_REPARSE_POINT_CHANGE | 重分析点变更 |
| 0x00008000 | USN_REASON_STREAM_CHANGE | 数据流变更 |
| 0x00010000 | USN_REASON_TRANSACTED_CHANGE | 事务化变更 |
| 0x00020000 | USN_REASON_INTEGRITY_CHANGE | 完整性变更 |
| 0x80000000 | USN_REASON_CLOSE | 文件关闭 |

### 3. 使用 $UsnJrnl 还原攻击时间线

**解析 USN 记录**

```python
import struct
from datetime import datetime, timedelta

def parse_usnjrnl_record(data, offset):
    record = {}
    record['length'] = struct.unpack_from('<I', data, offset)[0]
    record['major_version'] = struct.unpack_from('<H', data, offset + 4)[0]
    record['minor_version'] = struct.unpack_from('<H', data, offset + 6)[0]
    record['mft_ref'] = struct.unpack_from('<Q', data, offset + 8)[0]
    record['mft_parent_ref'] = struct.unpack_from('<Q', data, offset + 16)[0]
    record['usn'] = struct.unpack_from('<q', data, offset + 24)[0]
    
    timestamp_raw = struct.unpack_from('<q', data, offset + 32)[0]
    record['timestamp'] = datetime(1601, 1, 1) + timedelta(microseconds=timestamp_raw // 10)
    
    record['reason'] = struct.unpack_from('<I', data, offset + 40)[0]
    record['source_info'] = struct.unpack_from('<I', data, offset + 44)[0]
    record['security_id'] = struct.unpack_from('<I', data, offset + 48)[0]
    record['file_attributes'] = struct.unpack_from('<I', data, offset + 52)[0]
    record['filename_length'] = struct.unpack_from('<H', data, offset + 56)[0]
    record['filename_offset'] = struct.unpack_from('<H', data, offset + 58)[0]
    
    filename_start = offset + record['filename_offset']
    filename_end = filename_start + record['filename_length']
    record['filename'] = data[filename_start:filename_end].decode('utf-16-le')
    
    return record

def analyze_usnjrnl(data):
    offset = 0
    records = []
    
    while offset < len(data) - 60:
        entry_length = struct.unpack_from('<I', data, offset)[0]
        if entry_length <= 60 or entry_length > 65536:
            offset += 8
            continue
        
        try:
            record = parse_usnjrnl_record(data, offset)
            if record['filename']:
                records.append(record)
        except:
            pass
        
        offset += entry_length
    
    return records
```

**攻击时间线还原**

```python
def build_attack_timeline(usnjrnl_records):
    attack_events = []
    
    for record in usnjrnl_records:
        reasons = []
        if record['reason'] & 0x00000010:
            reasons.append('FILE_CREATE')
        if record['reason'] & 0x00000020:
            reasons.append('FILE_DELETE')
        if record['reason'] & 0x00000001:
            reasons.append('DATA_OVERWRITE')
        if record['reason'] & 0x00000004:
            reasons.append('ADS_OVERWRITE')
        if record['reason'] & 0x00000100:
            reasons.append('RENAME_OLD')
        if record['reason'] & 0x00000200:
            reasons.append('RENAME_NEW')
        
        if not reasons:
            continue
        
        severity = 'normal'
        filename = record['filename'].lower()
        if any(ext in filename for ext in ['.exe', '.dll', '.ps1', '.bat', '.cmd', '.vbs', '.js']):
            severity = 'high'
        if 'ADS_OVERWRITE' in reasons:
            severity = 'critical'
        
        attack_events.append({
            'timestamp': record['timestamp'],
            'filename': record['filename'],
            'reasons': reasons,
            'usn': record['usn'],
            'severity': severity
        })
    
    attack_events.sort(key=lambda x: x['timestamp'])
    return attack_events
```

### 4. 变更日志的保留策略和清理检测

**默认保留策略**

- Windows 默认启用 USN 变更日志
- 日志大小限制由 NTFS 自动管理（通常为 $MFT 大小的 1/32）
- 当日志达到大小限制时，NTFS 会自动丢弃最旧的记录
- 攻击者可以通过 `fsutil usn deletejournal` 手动删除日志

**清理检测**

```powershell
fsutil usn queryjournal C:
```

输出示例：
```
Usn 计算机 : 265780
有效日期: 43200
Max 值 : 4096
Max 大小 (MB) : 100
```

如果 `Usn 计算机` 值突然增大或 `Max 值` 异常，说明日志可能被清理并重新创建。

**检测方法**

```sql
SELECT TimeCreated, EventID, Message
FROM SecurityEvents
WHERE EventID = 4663
  AND Message LIKE '%UsnJrnl%'
  AND Message LIKE '%delete%'
ORDER BY TimeCreated DESC
```

---

## 0x08 ADS 检测与取证方法

### 1. 使用命令行检测 ADS

**dir 命令**

```cmd
dir /r C:\Temp\
```

输出中包含 ADS 的行格式：
```
12345              clean.txt
    56789:payload.exe:$DATA
```

`:payload.exe:$DATA` 表示文件 `clean.txt` 中有一个名为 `payload.exe` 的 ADS。

**PowerShell Get-Item**

```powershell
Get-Item "C:\Temp\clean.txt" -Stream *
```

输出：
```
   Stream          Length
   ------          ------
   :$DATA              123
   payload.exe       56789
```

**PowerShell Get-ChildItem**

```powershell
Get-ChildItem -Path "C:\Temp" -Recurse -Force | Get-Item -Stream * -ErrorAction SilentlyContinue | Where-Object { $_.Stream -ne ':$DATA' }
```

### 2. 使用 PowerShell 扫描 ADS

**全盘 ADS 扫描脚本**

```powershell
function Scan-ADS {
    param([string]$Path = "C:\")
    
    $results = @()
    $items = Get-ChildItem -Path $Path -Recurse -Force -ErrorAction SilentlyContinue
    
    foreach ($item in $items) {
        $streams = Get-Item -Path $item.FullName -Stream * -ErrorAction SilentlyContinue
        foreach ($stream in $streams) {
            if ($stream.Stream -ne ':$DATA') {
                $results += [PSCustomObject]@{
                    FullName = $item.FullName
                    StreamName = $stream.Stream
                    StreamLength = $stream.Length
                    FileSize = $item.Length
                    CreationTime = $item.CreationTime
                    LastWriteTime = $item.LastWriteTime
                    Attributes = $item.Attributes
                }
            }
        }
    }
    
    return $results
}

$adsResults = Scan-ADS -Path "C:\"
$adsResults | Export-Csv -Path "C:\Temp\ads_scan_results.csv" -NoTypeInformation -Encoding UTF8
$adsResults | Format-Table -AutoSize
```

**可疑 ADS 模式检测**

```powershell
function Detect-SuspiciousADS {
    param([string]$Path = "C:\")
    
    $suspiciousExtensions = @('.exe', '.dll', '.ps1', '.bat', '.cmd', '.vbs', '.js', '.wsf', '.hta')
    $suspiciousPatterns = @('payload', 'backdoor', 'shell', 'meterpreter', 'cobalt', 'beacon')
    
    $items = Get-ChildItem -Path $Path -Recurse -Force -ErrorAction SilentlyContinue
    
    foreach ($item in $items) {
        $streams = Get-Item -Path $item.FullName -Stream * -ErrorAction SilentlyContinue
        foreach ($stream in $streams) {
            if ($stream.Stream -ne ':$DATA') {
                $isSuspicious = $false
                $reasons = @()
                
                foreach ($ext in $suspiciousExtensions) {
                    if ($stream.Stream -like "*$ext") {
                        $isSuspicious = $true
                        $reasons += "Executable extension: $ext"
                    }
                }
                
                foreach ($pattern in $suspiciousPatterns) {
                    if ($stream.Stream -like "*$pattern*") {
                        $isSuspicious = $true
                        $reasons += "Suspicious pattern: $pattern"
                    }
                }
                
                if ($stream.Length -gt 1MB) {
                    $isSuspicious = $true
                    $reasons += "Large ADS size: $($stream.Length) bytes"
                }
                
                if ($isSuspicious) {
                    [PSCustomObject]@{
                        Path = $item.FullName
                        Stream = $stream.Stream
                        Size = $stream.Length
                        Reasons = $reasons -join '; '
                        CreationTime = $item.CreationTime
                    }
                }
            }
        }
    }
}
```

### 3. 使用 Sysmon 监控 ADS 操作

**Sysmon 配置（Event ID 15 - FileCreateStreamHash）**

```xml
<Sysmon schemaversion="4.90">
    <EventFiltering>
        <FileCreateStreamHash onmatch="include">
            <TargetFilename condition="contains">:</TargetFilename>
        </FileCreateStreamHash>
    </EventFiltering>
</Sysmon>
```

**Sysmon Event ID 15 示例**

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Sysmon" Guid="{5770385f-c22a-43a0-b007-398e9342f074}"/>
    <EventID>15</EventID>
    <Version>2</Version>
    <Level>4</Level>
    <Task>15</Task>
    <Opcode>0</Opcode>
    <Keywords>0x8000000000000000</Keywords>
    <TimeCreated SystemTime="2026-06-25T08:30:00.123456789Z"/>
    <EventRecordID>5678</EventRecordID>
    <Channel>Microsoft-Windows-Sysmon/Operational</Channel>
    <Computer>WORKSTATION01</Computer>
    <Security/>
  </System>
  <EventData>
    <Data Name="RuleName">ads_detection</Data>
    <Data Name="UtcTime">2026-06-25 08:30:00.123</Data>
    <Data Name="ProcessGuid">{12345678-abcd-1234-abcd-123456789abc}</Data>
    <Data Name="ProcessId">4567</Data>
    <Data Name="User">CORP\attacker</Data>
    <Data Name="Image">C:\Windows\System32\cmd.exe</Data>
    <Data Name="TargetFilename">C:\Temp\clean.txt</Data>
    <Data Name="StreamName">:payload.exe</Data>
    <Data Name="StreamIsDirectory">false</Data>
    <Data Name="StreamFileIdentifier">Stream associated with $DATA.</Data>
    <Data Name="Hash">SHA256=a1b2c3d4e5f6...</Data>
  </EventData>
</Event>
```

### 4. 使用 SIGCheck 检测异常 ADS

```cmd
sigcheck.exe -s -v C:\Temp\clean.txt
```

SIGCheck 可以列出文件的所有数据流及其哈希值，用于检测隐藏的 ADS。

**批量检测**

```cmd
sigcheck.exe -s -accepteula -nobanner C:\ > C:\Temp\sigcheck_results.txt
```

### 5. 取证工具链

**Arsenal Image Mounter**

Arsenal Image Mounter 是一个高级磁盘镜像挂载工具，支持：
- 挂载原始磁盘镜像和各种格式（E01、VMDK、VHD 等）
- 只读挂载，保证证据完整性
- 支持 NTFS ADS 的完整访问
- PowerShell API 支持自动化

```powershell
Import-Module ArsenalImageMounter
Mount-DiskImage -ImagePath "C:\Evidence\disk_image.E01" -Access ReadOnly
```

**FTK Imager**

FTK Imager 支持：
- 磁盘镜像的创建和浏览
- $MFT 的原始导出
- 文件系统浏览（包括 ADS）
- 哈希验证

**Autopsy**

Autopsy 支持：
- 自动化 $MFT 解析
- $I30 索引残留恢复
- $UsnJrnl 解析
- 时间线分析
- 关键词搜索
- ADS 检测

---

## 0x09 文件系统级 Rootkit 取证

### 1. NTFS Rootkit 的实现原理

文件系统级 Rootkit 通过修改 NTFS 的核心数据结构或拦截文件系统操作来隐藏恶意文件和目录。这些 Rootkit 的实现方式包括：

- **元数据修改**：直接修改 $MFT 记录，将恶意文件的标志位设为"空闲"或修改其文件名
- **过滤器驱动**：安装文件系统过滤器驱动，在文件系统操作返回结果前过滤掉恶意文件
- **目录遍历拦截**：拦截目录遍历操作，从返回结果中移除恶意文件的条目

### 2. 目录遍历 Rootkit

目录遍历 Rootkit 通过拦截 `IRP_MJ_DIRECTORY_CONTROL` 请求来隐藏文件：

```c
NTSTATUS HookDirectoryControl(PDEVICE_OBJECT DeviceObject, PIRP Irp) {
    NTSTATUS status = OriginalDirectoryControl(DeviceObject, Irp);
    
    if (NT_SUCCESS(status)) {
        FilterDirectoryEntries(Irp, HiddenFiles, HiddenFilesCount);
    }
    
    return status;
}
```

取证特征：
- 常规文件浏览工具无法看到被隐藏的文件
- 但直接读取磁盘扇区可以看到完整的 $MFT 记录
- $MFT 的记录数与目录遍历结果不一致
- 被隐藏文件的 $MFT 记录标志位可能正常（未被删除）

### 3. 文件系统过滤器驱动 Rootkit

文件系统过滤器驱动（File System Filter Driver）在 I/O 请求到达文件系统驱动之前拦截请求。恶意过滤器驱动可以：

- 过滤特定文件的打开请求
- 隐藏文件的读取结果
- 修改文件读取的返回数据
- 隐藏进程的文件操作

```cmd
fltmc filters
```

```cmd
fltmc instances
```

取证特征：
- 注册的过滤器驱动列表中出现未知驱动
- 过滤器驱动的路径指向临时目录或非标准位置
- 使用 `dumpflt` 工具可以列出所有文件系统过滤器

### 4. 元数据 Rootkit

元数据 Rootkit 直接修改 $MFT、$I30 等核心元数据结构：

**修改 $MFT 记录**

```c
void HideFileInMft(PVOID MftRecord) {
    USHORT Flags = *(USHORT*)((PUCHAR)MftRecord + 0x16);
    Flags &= ~0x01;
    *(USHORT*)((PUCHAR)MftRecord + 0x16) = Flags;
}
```

**修改 $I30 索引**

```c
void HideFileInI30(PVOID IndexEntry) {
    USHORT EntryLength = *(USHORT*)((PUCHAR)IndexEntry + 4);
    USHORT NextEntryOffset = *(USHORT*)((PUCHAR)IndexEntry + 8);
    *(USHORT*)((PUCHAR)IndexEntry + 4) = NextEntryOffset;
}
```

### 5. 取证检测方法

**磁盘直接读取**

使用磁盘编辑器（如 HxD、WinHex）直接读取磁盘扇区，绕过文件系统驱动：

```bash
dd if=/dev/sda of=/tmp/evidence.raw bs=512 count=1024
```

通过直接读取磁盘，可以看到：
- 未被过滤器驱动过滤的 $MFT 记录
- 未被目录遍历 Rootkit 隐藏的 $I30 条目
- 被元数据 Rootkit 修改的原始数据

**签名比对**

对磁盘镜像进行签名比对，检测恶意代码：

```bash
yara -r /path/to/rules/ /path/to/evidence/disk_image.raw
```

```bash
volatility -f evidence.raw --profile=Win10x64 malfind
```

**交叉验证**

将多种检测方法的结果进行交叉验证：

```python
def cross_validate(mft_entries, directory_listings, yara_matches, volatility_results):
    discrepancies = []
    
    mft_files = set(entry['filename'] for entry in mft_entries if entry['is_active'])
    dir_files = set(filename for listing in directory_listings for filename in listing['files'])
    
    hidden_from_dir = mft_files - dir_files
    if hidden_from_dir:
        discrepancies.append({
            'type': 'Hidden from directory listing',
            'files': hidden_from_dir,
            'severity': 'critical'
        })
    
    mft_hidden = dir_files - mft_files
    if mft_hidden:
        discrepancies.append({
            'type': 'Ghost files in directory',
            'files': mft_hidden,
            'severity': 'high'
        })
    
    for match in yara_matches:
        discrepancies.append({
            'type': 'YARA signature match',
            'file': match['file'],
            'rule': match['rule'],
            'severity': 'critical'
        })
    
    return discrepancies
```

---

## 0x10 证据强度分层

在 NTFS 取证分析中，不同类型的证据具有不同的可信度和证明力。根据证据的可靠性和确定性，可以分为三个层级：

### 确认恶意（Confirmation Level）

以下证据可以直接确认恶意行为：

| 证据类型 | 说明 |
|----------|------|
| ADS 中存储可执行文件 | $MFT 中出现多个 `$DATA` 属性，且 ADS 名称包含可执行扩展名 |
| Sysmon Event ID 15 | 记录了 ADS 创建操作，包含创建进程和 ADS 哈希 |
| Event ID 4663 + Stream Name | 安全日志明确记录了 ADS 访问操作 |
| $MFT $SI/$FN 时间戳严重不一致 | 多个文件的 $SI 时间戳被设置为相同异常值 |
| $UsnJrnl ADS 相关变更 | DATA_OVERWRITE 事件指向非默认数据流 |
| 文件系统过滤器驱动列表异常 | 出现未知或可疑的过滤器驱动 |
| 磁盘直接读取发现隐藏 $MFT 记录 | 绕过文件系统驱动后发现被隐藏的恶意文件 |

### 高度可疑（High Suspicion Level）

以下证据具有高度可疑性，需要进一步调查：

| 证据类型 | 说明 |
|----------|------|
| ADS 名称包含可执行扩展名 | 但无法确认 ADS 内容是否为恶意代码 |
| $I30 残留与 $MFT 不一致 | 文件名或 MFT 引用不匹配 |
| $UsnJrnl 异常变更模式 | 短时间内大量 ADS 创建/删除操作 |
| $LogFile 异常事务记录 | 大量元数据修改操作集中出现 |
| 文件大小与磁盘占用差异 | 文件的磁盘占用远大于报告大小 |
| chkdsk 发现文件系统不一致 | 可能是元数据 Rootkit 的痕迹 |

### 需要关注（Attention Level）

以下证据需要关注，但单独不能作为恶意行为的证据：

| 证据类型 | 说明 |
|----------|------|
| Zone.Identifier ADS | 合法的文件下载标记 |
| com.apple.FinderInfo ADS | 合法的 macOS 元数据 |
| 普通 ADS（非可执行扩展名） | 可能是合法应用程序使用 |
| $MFT 序列号异常 | 可能是正常文件操作的结果 |
| $UsnJrnl 正常变更记录 | 需要结合上下文判断 |

---

## 0x11 公开案例中的 ADS/NTFS 取证

### 案例一：APT29 — ADS 隐藏持久化后门

**攻击背景**

APT29（也称为 Cozy Bear、The Dukes）是俄罗斯对外情报局（SVR）关联的高级持续性威胁组织。在多个公开报告中，APT29 使用 ADS 技术隐藏持久化后门。

**技术手法**

APT29 在 SolarWinds 供应链攻击中使用了 ADS 技术：
- 将后门代码存储在合法系统文件的 ADS 中
- 通过 `wmic process call create` 从 ADS 中执行
- 使用 `bitsadmin` 工具从远程服务器下载额外载荷到 ADS
- 利用 `mshta.exe` 执行存储在 ADS 中的 HTML 应用程序

**取证特征**

- $MFT 中出现系统目录文件的多个 `$DATA` 属性
- $UsnJrnl 中出现 `wmic.exe` 和 `bitsadmin.exe` 相关的 ADS 操作
- Event ID 4663 显示对系统文件的非标准访问
- Prefetch 中出现 `wmic.exe` 和 `bitsadmin.exe` 的执行记录

**检测方法**

```powershell
Get-ChildItem -Path "C:\Windows\System32" -Recurse -Force | Get-Item -Stream * -ErrorAction SilentlyContinue | Where-Object { $_.Stream -ne ':$DATA' -and $_.Length -gt 0 } | Select-Object FileName, Stream, Length, @{N='ParentPath';E={$_.Path}}
```

### 案例二：Turla — ADS 数据外泄

**攻击背景**

Turla（也称为 Snake、Uroburos、Waterbug）是俄罗斯联邦安全局（FSB）关联的 APT 组织，以其高级的文件系统操纵技术著称。

**技术手法**

Turla 在多个攻击活动中使用 ADS 进行数据外泄：
- 将窃取的敏感数据分割存储在多个 ADS 中
- 使用合法系统文件（如 `notepad.exe`、`explorer.exe`）作为 ADS 宿主
- 通过 DNS 隧道将 ADS 中的数据外泄
- 使用 `certutil.exe` 从 ADS 中读取数据并 Base64 编码传输

**取证特征**

- 大量系统文件的磁盘占用异常（远大于文件大小）
- $UsnJrnl 中出现 `certutil.exe` 相关的文件操作
- DNS 查询日志中出现大量异常的 TXT 记录查询
- $MFT 中系统文件出现异常的 ADS 属性

**检测方法**

```powershell
Get-ChildItem -Path "C:\Windows\System32\*.exe" -Force | ForEach-Object {
    $ads = Get-Item -Path $_.FullName -Stream * -ErrorAction SilentlyContinue
    $totalStreamSize = ($ads | Where-Object { $_.Stream -ne ':$DATA' } | Measure-Object -Property Length -Sum).Sum
    $fileSize = $_.Length
    if ($totalStreamSize -gt 0) {
        [PSCustomObject]@{
            File = $_.Name
            MainSize = $fileSize
            ADSCount = ($ads | Where-Object { $_.Stream -ne ':$DATA' }).Count
            TotalADSSize = $totalStreamSize
        }
    }
}
```

### 案例三：Dridex — ADS 逃避检测

**攻击背景**

Dridex 是一种银行业木马，通过恶意邮件传播。攻击者使用 ADS 技术逃避 AV/EDR 检测。

**技术手法**

Dridex 使用 ADS 的方式：
- 将恶意 PowerShell 脚本存储在 `.txt` 文件的 ADS 中
- 通过 `powershell.exe -Command "Get-Content ... -Stream ... | IEX"` 执行
- 使用 Windows Script Host（wscript.exe）执行存储在 ADS 中的 VBScript
- 定期更换 ADS 名称以逃避基于名称的检测规则

**取证特征**

- 大量 `.txt` 文件的 $MFT 记录中出现异常的 `$DATA` 属性
- `powershell.exe` 和 `wscript.exe` 的命令行参数中包含 `Stream` 关键字
- Event ID 4104（Script Block Logging）记录了从 ADS 读取并执行的内容
- $UsnJrnl 中出现大量文本文件的 DATA_OVERWRITE 事件

**检测方法**

```powershell
Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-PowerShell/Operational'; Id=4104} -ErrorAction SilentlyContinue | Where-Object { $_.Message -match 'Stream|Get-Content.*-Stream|Set-Content.*-Stream' } | Select-Object TimeCreated, Message | Format-List
```

---

## 0x12 NTFS 取证检测自动化与狩猎

### 1. PowerShell 检测脚本

**ADS 全盘扫描与报告生成**

```powershell
function Invoke-ADSHunt {
    param(
        [string[]]$TargetPaths = @("C:\Windows", "C:\Users", "C:\Temp"),
        [string]$OutputPath = "C:\Forensics\ADS_Report"
    )
    
    if (-not (Test-Path $OutputPath)) {
        New-Item -Path $OutputPath -ItemType Directory -Force
    }
    
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $reportFile = Join-Path $OutputPath "ADS_Report_$timestamp.csv"
    
    $suspiciousExts = @('.exe', '.dll', '.ps1', '.bat', '.cmd', '.vbs', '.js', '.wsf', '.hta', '.scr', '.com')
    $results = @()
    
    foreach ($targetPath in $TargetPaths) {
        if (-not (Test-Path $targetPath)) { continue }
        
        Write-Host "[*] Scanning: $targetPath" -ForegroundColor Yellow
        
        $items = Get-ChildItem -Path $targetPath -Recurse -Force -ErrorAction SilentlyContinue | 
                 Where-Object { -not $_.PSIsContainer }
        
        $total = $items.Count
        $current = 0
        
        foreach ($item in $items) {
            $current++
            if ($current % 1000 -eq 0) {
                Write-Host "  [*] Progress: $current / $total" -ForegroundColor DarkGray
            }
            
            try {
                $streams = Get-Item -Path $item.FullName -Stream * -ErrorAction Stop
                foreach ($stream in $streams) {
                    if ($stream.Stream -ne ':$DATA') {
                        $riskLevel = 'Low'
                        $riskReasons = @()
                        
                        foreach ($ext in $suspiciousExts) {
                            if ($stream.Stream -match [regex]::Escape($ext)) {
                                $riskLevel = 'High'
                                $riskReasons += "Executable extension: $ext"
                            }
                        }
                        
                        if ($stream.Length -gt 1MB) {
                            $riskLevel = 'High'
                            $riskReasons += "Large size: $($stream.Length) bytes"
                        }
                        
                        if ($item.FullName -match 'System32|SysWOW64') {
                            if ($riskLevel -eq 'Low') {
                                $riskLevel = 'Medium'
                                $riskReasons += "Located in system directory"
                            }
                        }
                        
                        $results += [PSCustomObject]@{
                            Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
                            FilePath = $item.FullName
                            StreamName = $stream.Stream
                            StreamSize = $stream.Length
                            MainFileSize = $item.Length
                            CreationTime = $item.CreationTime
                            LastWriteTime = $item.LastWriteTime
                            RiskLevel = $riskLevel
                            RiskReasons = $riskReasons -join '; '
                        }
                    }
                }
            } catch {
                continue
            }
        }
    }
    
    $results | Export-Csv -Path $reportFile -NoTypeInformation -Encoding UTF8
    
    $highRisk = $results | Where-Object { $_.RiskLevel -eq 'High' }
    $mediumRisk = $results | Where-Object { $_.RiskLevel -eq 'Medium' }
    
    Write-Host "`n[+] ADS Scan Complete" -ForegroundColor Green
    Write-Host "    Total ADS found: $($results.Count)" -ForegroundColor White
    Write-Host "    High risk: $($highRisk.Count)" -ForegroundColor Red
    Write-Host "    Medium risk: $($mediumRisk.Count)" -ForegroundColor Yellow
    Write-Host "    Report saved to: $reportFile" -ForegroundColor Cyan
    
    return $results
}
```

**$MFT 时间戳异常检测**

```powershell
function Detect-TimestampAnomalies {
    param(
        [string]$MFTCsvPath,
        [string]$OutputPath = "C:\Forensics\Timestamp_Anomalies"
    )
    
    if (-not (Test-Path $OutputPath)) {
        New-Item -Path $OutputPath -ItemType Directory -Force
    }
    
    $mftData = Import-Csv -Path $MFTCsvPath -Encoding UTF8
    $anomalies = @()
    
    foreach ($entry in $mftData) {
        $siCreated = [datetime]::Parse($entry.SICreateTime)
        $fnCreated = [datetime]::Parse($entry.FNCreateTime)
        $siModified = [datetime]::Parse($entry.SIModifyTime)
        $fnModified = [datetime]::Parse($entry.FNModifyTime)
        
        if ($siCreated -ne $fnCreated) {
            $anomalies += [PSCustomObject]@{
                Type = 'SI/FN Created Mismatch'
                Filename = $entry.Filename
                MFTEntry = $entry.'MFT Entry'
                SICreated = $siCreated
                FNCreated = $fnCreated
                Difference = $siCreated - $fnCreated
            }
        }
        
        if ($siModified -ne $fnModified) {
            $anomalies += [PSCustomObject]@{
                Type = 'SI/FN Modified Mismatch'
                Filename = $entry.Filename
                MFTEntry = $entry.'MFT Entry'
                SIModified = $siModified
                FNModified = $fnModified
                Difference = $siModified - $fnModified
            }
        }
        
        $epochStart = [datetime]"1970-01-01"
        if ($siCreated -lt $epochStart -or $siCreated -eq [datetime]"2020-01-01 00:00:00") {
            $anomalies += [PSCustomObject]@{
                Type = 'Zero/Epoch Timestamp'
                Filename = $entry.Filename
                MFTEntry = $entry.'MFT Entry'
                SICreated = $siCreated
                FNCreated = $fnCreated
                Difference = 'N/A'
            }
        }
    }
    
    $anomalyReport = Join-Path $OutputPath "Timestamp_Anomalies_$(Get-Date -Format 'yyyyMMdd_HHmmss').csv"
    $anomalies | Export-Csv -Path $anomalyReport -NoTypeInformation -Encoding UTF8
    
    Write-Host "[+] Timestamp anomaly detection complete" -ForegroundColor Green
    Write-Host "    Anomalies found: $($anomalies.Count)" -ForegroundColor Yellow
    Write-Host "    Report: $anomalyReport" -ForegroundColor Cyan
    
    return $anomalies
}
```

### 2. 事件日志狩猎查询（SQL/KQL）

**SQL（Windows Event Forwarding / WEC）**

```sql
-- 检测 ADS 创建操作（Sysmon Event ID 15）
SELECT
    TimeCreated AS EventTime,
    Computer,
    EXTRACTDATA(Data, 'Image') AS ProcessImage,
    EXTRACTDATA(Data, 'TargetFilename') AS TargetFile,
    EXTRACTDATA(Data, 'StreamName') AS ADSName,
    EXTRACTDATA(Data, 'Hash') AS FileHash
FROM MicrosoftWindowsSysmonOperational
WHERE EventID = 15
  AND EXTRACTDATA(Data, 'StreamName') NOT LIKE ':$DATA'
  AND EXTRACTDATA(Data, 'StreamName') NOT LIKE 'Zone.Identifier'
  AND EXTRACTDATA(Data, 'StreamName') NOT LIKE 'com.apple.*'
ORDER BY TimeCreated DESC
```

```sql
-- 检测 ADS 相关文件操作（Security Event ID 4663）
SELECT
    TimeCreated AS EventTime,
    Computer,
    EXTRACTDATA(Data, 'SubjectUserName') AS Username,
    EXTRACTDATA(Data, 'ObjectName') AS ObjectName,
    EXTRACTDATA(Data, 'ResourceAttributes') AS ResourceAttributes,
    EXTRACTDATA(Data, 'ProcessName') AS ProcessName
FROM SecurityEvent
WHERE EventID = 4663
  AND EXTRACTDATA(Data, 'ResourceAttributes') LIKE '%Stream Name%'
ORDER BY TimeCreated DESC
```

**KQL（Microsoft Sentinel / Defender for Endpoint）**

```kql
// 检测 ADS 创建操作
DeviceFileEvents
| where Timestamp > ago(7d)
| where ActionType == "FileCreatedStream"
| where AdditionalFields !contains ":$DATA"
| where AdditionalFields !contains "Zone.Identifier"
| where AdditionalFields !contains "com.apple"
| project Timestamp, DeviceName, InitiatingProcessFileName, 
          InitiatingProcessCommandLine, FileName, 
          FolderPath, AdditionalFields
| order by Timestamp desc
```

```kql
// 检测可疑的 PowerShell ADS 操作
DeviceProcessEvents
| where Timestamp > ago(7d)
| where ProcessCommandLine has_any ("Get-Content", "Set-Content", "Add-Content")
| where ProcessCommandLine has "-Stream"
| project Timestamp, DeviceName, FileName, ProcessCommandLine,
          InitiatingProcessFileName, InitiatingProcessCommandLine
| order by Timestamp desc
```

### 3. Sigma 检测规则

**规则一：ADS 可执行文件创建检测**

```yaml
title: NTFS ADS Executable Creation
id: 8a7c3d2e-4f1a-4b5c-9d8e-1a2b3c4d5e6f
status: stable
description: 检测通过 PowerShell 或 cmd 创建带有可执行扩展名的 ADS 操作
references:
  - https://attack.mitre.org/techniques/T1564/004/
author: Security Analyst
date: 2026/06/26
tags:
  - attack.defense_evasion
  - attack.t1564.004
logsource:
  category: process_creation
  product: windows
detection:
  selection_cmd_ads:
    Image|endswith:
      - '\cmd.exe'
    CommandLine|contains|all:
      - '>'
      - ':'
  selection_powershell_ads:
    Image|endswith:
      - '\powershell.exe'
      - '\pwsh.exe'
    CommandLine|contains|all:
      - '-Stream'
  selection_powershell_content:
    Image|endswith:
      - '\powershell.exe'
      - '\pwsh.exe'
    CommandLine|contains|all:
      - 'Stream'
      - 'Set-Content'
  condition: selection_cmd_ads or selection_powershell_ads or selection_powershell_content
falsepositives:
  - 合法的 Zone.Identifier 操作
  - 合法的 macOS 兼容性操作
level: high
```

**规则二：wmic ADS 执行检测**

```yaml
title: WMI Process Create from ADS
id: b8d9e0f1-2a3b-4c5d-6e7f-8a9b0c1d2e3f
status: stable
description: 检测通过 wmic 从 ADS 中执行可执行文件
references:
  - https://attack.mitre.org/techniques/T1218/
author: Security Analyst
date: 2026/06/26
tags:
  - attack.execution
  - attack.t1218
logsource:
  category: process_creation
  product: windows
detection:
  selection_wmic_create:
    Image|endswith:
      - '\wmic.exe'
    CommandLine|contains|all:
      - 'process'
      - 'call'
      - 'create'
  selection_wmic_ads_path:
    Image|endswith:
      - '\wmic.exe'
    CommandLine|re: ':[^:\\]+\.((exe|dll|ps1|bat|cmd|vbs|js))'
  condition: selection_wmic_create and selection_wmic_ads_path
falsepositives:
  - 合法的 WMI 远程管理操作
level: critical
```

**规则三：$MFT 时间戳篡改检测**

```yaml
title: NTFS MFT Timestamp Manipulation
id: c1d2e3f4-5a6b-7c8d-9e0f-1a2b3c4d5e6f
status: stable
description: 检测可能的 MFT 时间戳篡改操作（Timestomp）
references:
  - https://attack.mitre.org/techniques/T1070/006/
author: Security Analyst
date: 2026/06/26
tags:
  - attack.defense_evasion
  - attack.t1070.006
logsource:
  category: process_creation
  product: windows
detection:
  selection_timestomp_tool:
    Image|endswith:
      - '\timestomp.exe'
      - '\ntimestomp.exe'
    CommandLine|contains:
      - '-z'
      - '-m'
      - '-a'
      - '-c'
      - '-e'
  selection_powershell_timestomp:
    Image|endswith:
      - '\powershell.exe'
      - '\pwsh.exe'
    CommandLine|contains|all:
      - 'CreationTime'
      - '='
    CommandLine|contains|any:
      - '2000-01-01'
      - '1970-01-01'
      - '2020-01-01'
  selection_meterpreter_timestomp:
    Image|endswith:
      - '\rundll32.exe'
    CommandLine|contains|all:
      - 'invoke'
      - 'timestomp'
  condition: selection_timestomp_tool or selection_powershell_timestomp or selection_meterpreter_timestomp
falsepositives:
  - 合法的时间戳同步操作
level: high
```

**规则四：Sysmon ADS 可疑创建检测**

```yaml
title: Sysmon Suspicious ADS Creation
id: d4e5f6a7-8b9c-0d1e-2f3a-4b5c6d7e8f9a
status: stable
description: 检测 Sysmon Event ID 15 中可疑的 ADS 创建操作
references:
  - https://attack.mitre.org/techniques/T1564/004/
author: Security Analyst
date: 2026/06/26
tags:
  - attack.defense_evasion
  - attack.t1564.004
logsource:
  product: windows
  service: sysmon
detection:
  selection_stream_create:
    EventID: 15
  filter_legitimate_streams:
    TargetFilename|endswith:
      - 'Zone.Identifier'
      - 'com.apple.FinderInfo'
      - 'com.apple.Metadata:_kMDItemUserTags'
      - 'Ole10Native'
      - 'Package.txt'
    StreamName|endswith:
      - ':$DATA'
  filter_browser_downloads:
    Image|endswith:
      - '\msedge.exe'
      - '\chrome.exe'
      - '\firefox.exe'
      - '\iexplore.exe'
  condition: selection_stream_create and not filter_legitimate_streams and not filter_browser_downloads
falsepositives:
  - 某些合法应用程序使用 ADS
level: medium
```

**规则五：日志清理检测**

```yaml
title: NTFS Journal Clear Operation
id: e5f6a7b8-9c0d-1e2f-3a4b-5c6d7e8f9a0b
status: stable
description: 检测 USN 日志或 NTFS 日志的清理操作
references:
  - https://attack.mitre.org/techniques/T1070/
author: Security Analyst
date: 2026/06/26
tags:
  - attack.defense_evasion
  - attack.t1070
logsource:
  category: process_creation
  product: windows
detection:
  selection_fsutil_journal:
    Image|endswith:
      - '\fsutil.exe'
    CommandLine|contains|all:
      - 'usn'
      - 'deletejournal'
  selection_fsutil_logfile:
    Image|endswith:
      - '\fsutil.exe'
    CommandLine|contains|all:
      - 'usn'
      - 'readjournal'
  selection_wevtutil_clear:
    Image|endswith:
      - '\wevtutil.exe'
    CommandLine|contains|any:
      - 'clear-log'
      - 'cl '
  condition: selection_fsutil_journal or selection_wevtutil_clear
falsepositives:
  - 合法的磁盘维护操作
  - 系统管理员清理日志
level: high
```

---

## 0x13 参考资料

1. Microsoft. "NTFS File System Structure." Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/fileio/ntfs-technical-reference
2. Microsoft. "Alternate Data Streams." Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/fileio/alternate-data-streams
3. SANS Institute. "Forensic Analysis of NTFS Alternate Data Streams." SANS Digital Forensics. https://www.sans.org/white-papers/forensic-analysis-ntfs-alternate-data-streams/
4. Chad Tilbury. "NTFS Alternate Data Streams and Forensics." SANS DFIR Summit 2020. https://www.youtube.com/watch?v=NTsKOx0dKQo
5. Andreas Schuster. "NTFS LogFile: The Untapped Source for Forensic Analysis." Digital Investigation. https://doi.org/10.1016/j.diin.2004.09.002
6. Joachim Metz. "NTFS File System Analysis." The Sleuth Kit. https://www.sleuthkit.org/sleuthkit/docs/tsk-chs/node5.html
7. Harlan Carvey. "Windows Registry Forensics." Elsevier Digital Forensics Library. https://www.elsevier.com/books/windows-registry-forensics/harlan-carvey/978-0-12-804591-7
8. Didier Stevens. "NTFS Alternate Data Streams." Didier Stevens Suite. https://blog.didierstevens.com/2010/01/04/alternate-data-streams/
9. MITRE ATT&CK. "Hide Artifacts: NTFS File Attributes." https://attack.mitre.org/techniques/T1564/004/
10. MITRE ATT&CK. "Indicator Removal: Timestomp." https://attack.mitre.org/techniques/T1070/006/
11. Microsoft. "Windows Security Event 4663." Microsoft Learn. https://learn.microsoft.com/en-us/windows/security/threat-protection/auditing/event-4663
12. Sysmon. "Sysmon Event ID 15 - FileCreateStreamHash." Microsoft Sysinternals. https://learn.microsoft.com/en-us/sysinternals/downloads/sysmon
13. Autopsy. "NTFS Analysis Module." Basis Technology. https://www.autopsy.com/features/ntfs-analysis/
14. Eric Zimmerman. "MFTExplorer and AnalyzeMFT." https://ericzimmerman.github.io/
15. Volatility Foundation. "Volatility Memory Forensics Framework." https://www.volatilityfoundation.org/
