---
title: "DLL劫持与搜索顺序劫持取证分析"
date: 2026-06-24T14:00:00+08:00
draft: false
weight: 380
description: "围绕 DLL 劫持攻击的完整技术体系，深入分析 DLL 搜索顺序劫持、KnownDLLs 绕过、COM 劫持、导出转发劫持、Phantom DLL、DLL 侧加载等技术的原理、取证特征和检测方法。"
categories: ["应急响应", "取证分析"]
tags: ["DLL劫持", "搜索顺序", "KnownDLLs", "COM劫持", "导出转发", "PhantomDLL", "DLL侧加载", "T1574"]
---

# DLL劫持与搜索顺序劫持取证分析

DLL 劫持是 Windows 平台上最古老、最持久、也最具隐蔽性的代码执行技术之一。其本质并非某个单一漏洞，而是 Windows 动态链接库加载机制在设计层面上的"可预测性"被攻击者利用。当一个进程调用 `LoadLibrary()` 时，操作系统必须按照预定义的规则在文件系统中定位目标 DLL——这个定位过程就是攻击面。攻击者不需要修改目标程序的二进制文件，不需要触碰 PE 导入表，只需要在正确的路径放置一个精心构造的 DLL，就能让合法进程"自愿"加载并执行恶意代码。

在 MITRE ATT&CK 框架中，DLL 劫持被归类为 T1574（Hijack Execution Flow），其下包含多个子技术：T1574.001（DLL Search Order Hijacking）、T1574.002（DLL Side-Loading）、T1574.015（COM Hijacking）等。这些技术在 APT 攻击、勒索软件、后门植入中被反复使用，且因其"不修改合法文件"的特性，在取证分析中往往需要更精细的检测手段才能发现。

已有文章 `Windows注册表取证深度分析与入侵痕迹识别`、`启动项检查结果异常判断与入侵关联分析`、`可疑进程树与父子进程异常取证分析` 等分别覆盖了注册表取证、进程分析等执行流劫持的关联领域。本文聚焦 DLL 劫持的完整技术体系：**从 DLL 加载机制的底层原理出发，逐一分析各类 DLL 劫持技术的攻击实现、取证特征和检测方法，最终构建一套从事件日志到内存取证的多层次检测框架。**

---

## 0x01 DLL 加载机制基础

### 1. DLL 搜索顺序

当 Windows 进程通过 `LoadLibrary()` 或隐式链接请求加载一个 DLL 时，操作系统必须按照确定的规则在文件系统中定位该 DLL 的物理路径。这个定位过程遵循一套预定义的搜索顺序，理解这个顺序是理解所有 DLL 劫持技术的前提。

**标准搜索顺序（SafeDllSearchMode 禁用时）：**

```
1. 应用程序所在目录（Application Directory）
2. 当前目录（Current Directory）
3. Windows 系统目录（%SystemRoot%\System32）
4. Windows 16位系统目录（%SystemRoot%\System）
5. Windows 目录（%SystemRoot%）
6. PATH 环境变量中列出的目录
```

**SafeDllSearchMode 启用时的搜索顺序：**

```
1. 应用程序所在目录（Application Directory）
2. Windows 系统目录（%SystemRoot%\System32）
3. Windows 16位系统目录（%SystemRoot%\System）
4. Windows 目录（%SystemRoot%）
5. 当前目录（Current Directory）
6. PATH 环境变量中列出的目录
```

关键区别在于：SafeDllSearchMode 将当前目录从第 2 位移到第 5 位。这个变化的意义在于——当用户从网络共享或可移动介质运行程序时，当前目录可能包含攻击者控制的 DLL。将当前目录后移，降低了这种攻击面的优先级。

SafeDllSearchMode 的注册表控制键：

```
HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Session Manager
    SafeDllSearchMode = 1（DWORD）
```

在 Windows XP SP2 及之后的版本中，SafeDllSearchMode 默认启用。但在某些服务器应用或特殊配置下，该值可能被修改为 0，从而将当前目录提升为第 2 优先级。

### 2. KnownDLLs 注册表键

KnownDLLs 是 Windows 对关键系统 DLL 的一种优化机制。被列入 KnownDLLs 的 DLL 在加载时会直接从注册表中指定的路径加载，跳过标准的搜索顺序。这意味着即使攻击者在应用程序目录放置了一个同名的恶意 DLL，只要目标 DLL 在 KnownDLLs 列表中，恶意 DLL 就不会被加载。

KnownDLLs 注册表键：

```
HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Session Manager\KnownDLLs
```

默认的 KnownDLLs 条目（部分）：

```
advapi32     = advapi32.dll
kernel32     = kernel32.dll
ntdll        = ntdll.dll
user32       = user32.dll
ws2_32       = ws2_32.dll
ole32        = ole32.dll
shell32      = shell32.dll
shlwapi      = shlwapi.dll
rpcrt4       = rpcrt4.dll
```

KnownDLLs 的取证意义：

- 如果攻击者试图劫持 KnownDLLs 中的 DLL，标准搜索顺序劫持不会成功
- 但攻击者可以修改 KnownDLLs 注册表键本身，将某个系统 DLL 的映射路径指向恶意 DLL
- 修改 KnownDLLs 需要 SYSTEM 权限，因此这种攻击方式的门槛较高
- 在取证分析中，KnownDLLs 键值的完整性检查是系统基线审计的重要组成部分

KnownDLLs 篡改的检测：

```powershell
$knownDllsPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\KnownDLLs"
$knownDlls = Get-ItemProperty -Path $knownDllsPath
$knownDlls.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object {
    $dllName = $_.Value
    $expectedPath = "C:\Windows\System32\$dllName"
    $actualPath = Join-Path "C:\Windows\System32" $dllName
    if (Test-Path $actualPath) {
        $hash = (Get-FileHash -Path $actualPath -Algorithm SHA256).Hash
        [PSCustomObject]@{
            Name = $_.Name
            DLL = $dllName
            Path = $actualPath
            SHA256 = $hash
        }
    }
}
```

### 3. DLL 重定向机制

除了搜索顺序和 KnownDLLs，Windows 还提供了多种 DLL 重定向机制，这些机制本身是合法的功能特性，但也可以被攻击者利用：

**App Paths 注册表键：**

```
HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\<application.exe>
    (Default) = C:\Path\To\Application.exe
    Path = C:\Custom\DLL\Directory
```

当一个应用程序在 App Paths 中注册了自定义的 `Path` 值时，该应用程序加载 DLL 时会优先搜索 `Path` 指定的目录，而不是应用程序所在目录。攻击者可以修改 App Paths 的 `Path` 值，将 DLL 搜索重定向到攻击者控制的目录。

**IFEO（Image File Execution Options）：**

```
HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\<application.exe>
    Debugger = C:\Path\To\Debugger.exe
```

IFEO 的 `Debugger` 值会在目标应用程序启动时，先启动 `Debugger` 指定的程序，并将目标应用程序的路径作为命令行参数传递。虽然 IFEO 主要用于调试器附加，但攻击者可以利用它来劫持应用程序的执行流。在 DLL 劫持的上下文中，IFEO 可以用于在合法进程启动前注入恶意 DLL。

**SET_dll_directory 和 AddDllDirectory：**

从 Windows 7 开始，微软引入了 `AddDllDirectory()` 和 `RemoveDllDirectory()` API，允许应用程序动态添加 DLL 搜索目录。这些动态添加的目录在搜索顺序中位于 KnownDLLs 之后、应用程序目录之前。攻击者如果能控制应用程序调用这些 API 的参数，就可以实现 DLL 搜索路径的劫持。

### 4. DLL 预加载与延迟加载

**DLL 预加载（Preloading）：**

当一个进程启动时，Windows 加载器会在进程初始化阶段解析 PE 文件的导入表，并加载所有隐式链接的 DLL。这个加载过程遵循标准的搜索顺序。如果攻击者在搜索路径的高优先级位置放置了与导入表中 DLL 同名的恶意 DLL，就会在进程启动时被优先加载。

**延迟加载（Delay Loading）：**

延迟加载是一种优化技术，允许应用程序将某些 DLL 的加载推迟到首次调用该 DLL 中的函数时。延迟加载通过 `delayimp.h` 和链接器的 `/DELAYLOAD` 选项实现。延迟加载的 DLL 在首次被调用时才触发 `LoadLibrary()` 调用，此时使用的搜索顺序与标准搜索顺序相同。

延迟加载的取证意义：延迟加载的 DLL 在进程启动时不会出现在模块列表中，只有在首次调用时才会被加载。这意味着基于进程启动时的模块快照检测可能错过延迟加载的恶意 DLL。

---

## 0x02 DLL 搜索顺序劫持（T1574.001）

### 1. 攻击原理

DLL 搜索顺序劫持是最直接的 DLL 劫持形式。其核心原理是：攻击者利用 Windows 的 DLL 搜索顺序，在搜索路径的高优先级位置放置一个与目标 DLL 同名的恶意 DLL。当合法应用程序尝试加载该 DLL 时，会优先找到并加载攻击者放置的恶意版本。

攻击成功的关键条件：

- 目标应用程序加载的 DLL 不存在于应用程序目录（触发搜索机制）
- 目标 DLL 不在 KnownDLLs 列表中
- 攻击者能够在搜索路径的高优先级位置写入文件
- 目标应用程序没有使用完全限定路径加载 DLL

### 2. 攻击实现

**步骤一：识别目标 DLL**

使用 Process Monitor 监控目标应用程序的 DLL 加载行为，筛选 `NAME NOT FOUND` 结果，找到应用程序尝试加载但不存在的 DLL：

```
过滤器配置：
- Operation: CreateFile
- Result: NAME NOT FOUND
- Path: ends with .dll
```

假设发现 `legitimate_app.exe` 尝试加载 `helper.dll` 但在应用程序目录中未找到。

**步骤二：创建恶意 DLL**

```c
#include <windows.h>

BOOL WINAPI DllMain(HINSTANCE hinstDLL, DWORD fdwReason, LPVOID lpvReserved) {
    switch (fdwReason) {
        case DLL_PROCESS_ATTACH:
            WinExec("cmd.exe /c powershell -enc <base64_payload>", SW_HIDE);
            break;
    }
    return TRUE;
}
```

**步骤三：放置恶意 DLL**

将编译好的恶意 DLL 放置在应用程序目录中：

```
C:\Program Files\TargetApp\helper.dll
```

当 `legitimate_app.exe` 下次启动时，它会从应用程序目录加载恶意的 `helper.dll`，而不是从原始预期路径加载合法版本。

### 3. 取证特征

DLL 搜索顺序劫持在系统中留下的取证痕迹主要集中在以下几个方面：

**异常 DLL 加载路径：** 合法的系统 DLL 或第三方库从非标准路径加载。例如，一个通常位于 `C:\Program Files\VendorApp\` 的 DLL 从 `C:\Users\Public\` 或 `C:\Temp\` 加载。

**DLL 哈希不匹配：** 如果已知合法 DLL 的哈希基线，从异常路径加载的 DLL 的哈希值与基线不匹配是一个强指示器。

**DLL 签名缺失：** 从非标准路径加载的 DLL 通常没有合法的数字签名，或者签名验证失败。

**文件时间戳异常：** 恶意 DLL 的文件创建时间通常与应用程序的安装时间不一致，且可能晚于应用程序的最后修改时间。

### 4. 检测方法

**Sysmon Event ID 7（DLL 加载）：**

```xml
<Event>
  <System>
    <Provider Name="Microsoft-Windows-Sysmon" Guid="{5770385f-c22a-43e0-bf4c-06f5698ffbd9}" />
    <EventID>7</EventID>
    <Version>3</Version>
    <Level>4</Level>
    <Task>7</Task>
    <Opcode>0</Opcode>
    <Keywords>0x8000000000000000</Keywords>
    <TimeCreated SystemTime="2026-06-20T08:15:32.456789100Z" />
    <Channel>Microsoft-Windows-Sysmon/Operational</Channel>
    <Computer>WORKSTATION-01</Computer>
  </System>
  <EventData>
    <Data Name="RuleName">DLL Hijack Detection</Data>
    <Data Name="UtcTime">2026-06-20 08:15:32.456</Data>
    <Data Name="ProcessGuid">{a1b2c3d4-e5f6-7890-abcd-ef1234567890}</Data>
    <Data Name="ProcessId">4872</Data>
    <Data Name="Image">C:\Program Files\TargetApp\legitimate_app.exe</Data>
    <Data Name="ImageLoaded">C:\Program Files\TargetApp\helper.dll</Data>
    <Data Name="FileVersion">-</Data>
    <Data Name="Description">-</Data>
    <Data Name="Product">-</Data>
    <Data Name="Company">-</Data>
    <Data Name="OriginalFileName">-</Data>
    <Data Name="Hashes">SHA256=E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855</Data>
    <Data Name="Signed">false</Data>
    <Data Name="SignatureStatus">Unavailable</Data>
  </EventData>
</Event>
```

**Process Monitor 检测：**

使用 Process Monitor 设置以下过滤器来检测可疑的 DLL 加载：

```
过滤器：
- Path contains ".dll" AND Result is "SUCCESS" AND Path contains "C:\Users\"
- Path contains ".dll" AND Result is "SUCCESS" AND Path contains "C:\Temp\"
- Path contains ".dll" AND Result is "SUCCESS" AND Path contains "C:\ProgramData\"
```

---

## 0x03 Phantom DLL 劫持（T1574.001）

### 1. 攻击原理

Phantom DLL 劫持是 DLL 搜索顺序劫持的一个特殊变体。其攻击原理基于一个常见现象：许多应用程序在运行时会尝试加载一些 DLL，但这些 DLL 在系统中并不存在（可能是可选组件、已移除的依赖、或条件编译的遗留）。应用程序在加载失败后会继续正常运行，不会报错。

攻击者利用这一现象，创建一个与"幻影 DLL"同名的恶意 DLL，并将其放置在应用程序可以找到的搜索路径中。当应用程序再次运行时，它会成功加载这个恶意 DLL，而不会像之前那样"安静地失败"。

Phantom DLL 与普通搜索顺序劫持的区别：

- 普通劫持：目标 DLL 原本存在于某个搜索路径中，攻击者用恶意版本替换或在更高优先级路径放置副本
- Phantom 劫持：目标 DLL 原本不存在于任何搜索路径中，应用程序一直在"空搜索"，攻击者创建了该 DLL 的第一个实例

### 2. 攻击实现

**步骤一：识别 Phantom DLL**

使用 Process Monitor 监控目标应用程序，筛选出 `NAME NOT FOUND` 的 DLL 加载尝试：

```powershell
$procmonLog = Import-Csv "C:\temp\procmon_export.csv"
$phantomDlls = $procmonLog | Where-Object {
    $_.Operation -eq "CreateFile" -and
    $_.Result -eq "NAME NOT FOUND" -and
    $_.Path -match "\.dll$"
} | Select-Object -Property Path -Unique

$phantomDlls | ForEach-Object {
    Write-Host "Phantom DLL candidate: $($_.Path)"
}
```

**步骤二：选择目标 Phantom DLL**

选择标准：

- 应用程序每次启动都会尝试加载（不是条件加载）
- DLL 名称不具有特殊性（不会引起用户怀疑）
- 加载失败后应用程序仍正常运行

**步骤三：创建并放置恶意 DLL**

```c
#include <windows.h>

#pragma comment(linker, "/EXPORT:InitHelper=_InitHelperImpl")

BOOL WINAPI DllMain(HINSTANCE hinstDLL, DWORD fdwReason, LPVOID lpvReserved) {
    switch (fdwReason) {
        case DLL_PROCESS_ATTACH: {
            HANDLE hThread = CreateThread(NULL, 0, PayloadThread, NULL, 0, NULL);
            CloseHandle(hThread);
            break;
        }
    }
    return TRUE;
}

DWORD WINAPI PayloadThread(LPVOID lpParam) {
    Sleep(5000);
    STARTUPINFOA si = { sizeof(STARTUPINFOA) };
    PROCESS_INFORMATION pi;
    CreateProcessA(NULL, "cmd.exe /c powershell -ep bypass -enc <payload>",
                   NULL, NULL, TRUE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi);
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    return 0;
}
```

### 3. 取证特征

Phantom DLL 劫持的取证特征与普通搜索顺序劫持有显著区别：

**DLL 从非标准路径加载：** 恶意 DLL 从应用程序目录、临时目录或用户目录加载，而不是从系统目录或已知的软件安装目录加载。

**DLL 未签名：** 原始 DLL 不存在意味着没有合法版本可供签名比对。恶意 DLL 通常没有数字签名。

**缺少历史加载记录：** 在事件日志中，该 DLL 名称此前从未出现在成功加载的记录中。这是一个关键的区分特征——如果某个 DLL 是合法组件，它应该在之前的某次运行中被成功加载过。

**DLL 的文件元数据缺失：** 合法 DLL 通常包含版本信息（FileVersion、ProductVersion、CompanyName 等），Phantom DLL 的恶意替代通常缺少这些元数据。

### 4. 检测方法

**Sysmon Event ID 7 分析：**

关注以下字段的组合：

- `ImageLoaded` 路径不在预期的系统目录或应用程序安装目录
- `Signed` 为 `false`
- `Description`、`Product`、`Company` 字段为空
- `FileVersion` 为 `-` 或空

**Process Monitor 的 NAME NOT FOUND 分析：**

```powershell
$baseline = Import-Csv "C:\temp\baseline_procmon.csv"
$current = Import-Csv "C:\temp\current_procmon.csv"

$newlyResolved = foreach ($entry in ($current | Where-Object {
    $_.Operation -eq "CreateFile" -and $_.Result -eq "SUCCESS" -and $_.Path -match "\.dll$"
})) {
    $wasNotFound = ($baseline | Where-Object {
        $_.Path -eq $entry.Path -and $_.Result -eq "NAME NOT FOUND"
    })
    if ($wasNotFound) { $entry }
}

$newlyResolved | Format-Table Path, ProcessName -AutoSize
```

这个脚本的逻辑是：对比基线采集和当前采集的 Process Monitor 数据，找出那些在基线中是 `NAME NOT FOUND`、但在当前采集中变为 `SUCCESS` 的 DLL 加载。这些就是新被"解析"的 Phantom DLL，是高度可疑的指标。

---

## 0x04 DLL 侧加载（T1574.002）

### 1. 攻击原理

DLL 侧加载（DLL Side-Loading）是一种利用合法签名应用程序加载恶意 DLL 的技术。与直接替换或创建恶意 DLL 不同，侧加载利用的是：某些合法应用程序在设计上允许从特定位置加载 DLL，或者应用程序本身存在加载非预期 DLL 的行为。

侧加载的核心优势在于：被利用的合法应用程序通常具有有效的数字签名，安全产品可能基于签名信任该进程的行为，从而让恶意 DLL 的加载绕过检测。

侧加载与搜索顺序劫持的区别：

- 搜索顺序劫持：攻击者将恶意 DLL 放在搜索路径的高优先级位置
- 侧加载：攻击者将恶意 DLL 放在合法应用程序"能够"加载的位置，利用的是应用程序自身的加载逻辑，而非搜索顺序的缺陷

### 2. 攻击实现

**典型场景：签名应用的可写目录**

许多应用程序在安装时会在自身目录下创建可写的子目录，或者在运行时将文件解压到可写位置。攻击者可以利用这些位置放置恶意 DLL：

```
C:\Program Files\SignedApp\updates\
C:\Program Files\SignedApp\plugins\
C:\Program Files\SignedApp\temp\
```

**步骤一：识别可侧加载的签名应用**

```powershell
$signedApps = Get-ChildItem "C:\Program Files" -Recurse -Filter "*.exe" | ForEach-Object {
    $sig = Get-AuthenticodeSignature $_.FullName
    if ($sig.Status -eq "Valid") {
        [PSCustomObject]@{
            Path = $_.FullName
            Signer = $sig.SignerCertificate.Subject
            WritableDirs = (Get-ChildItem $_.DirectoryName -Directory | Where-Object {
                (Get-Acl $_.FullName).Access | Where-Object {
                    $_.IdentityReference -match "Users|Everyone" -and
                    $_.FileSystemRights -match "Write"
                }
            }).FullName
        }
    }
}
$signedApps | Where-Object { $_.WritableDirs.Count -gt 0 } | Format-List
```

**步骤二：确定目标 DLL 名称**

分析签名应用的导入表，找出从非系统目录加载的 DLL：

```powershell
$pe = [System.Reflection.Assembly]::LoadFile("C:\Program Files\SignedApp\app.exe")
$imports = [PeParser]::GetImports("C:\Program Files\SignedApp\app.exe")
$imports | Where-Object { $_.Path -notmatch "System32|SysWOW64" } | Format-Table
```

**步骤三：放置恶意 DLL**

将编译好的恶意 DLL 放置在签名应用的可写子目录中，使其在应用启动时被加载。

### 3. 取证特征

**签名应用的异常 DLL 加载：** 一个受信任的签名应用程序加载了一个来自非标准路径的 DLL。这是侧加载最核心的取证特征。

**DLL 来源不可信：** 被加载的 DLL 没有数字签名，或者签名不受信任，或者签名与宿主应用的签名者不一致。

**DLL 位于可写目录：** 被加载的 DLL 位于应用程序目录下的可写子目录中，或者位于临时目录、用户目录等低完整性级别的位置。

**宿主应用行为异常：** 签名应用在加载恶意 DLL 后执行了超出其正常功能范围的操作，如网络连接、进程创建、文件加密等。

### 4. 检测方法

**签名验证与 DLL 路径交叉分析：**

```powershell
$dllEvents = Get-WinEvent -FilterHashtable @{
    LogName = "Microsoft-Windows-Sysmon/Operational"
    Id = 7
} -MaxEvents 5000

foreach ($event in $dllEvents) {
    $xml = [xml]$event.ToXml()
    $image = ($xml.Event.EventData.Data | Where-Object { $_.Name -eq "Image" }).'#text'
    $imageLoaded = ($xml.Event.EventData.Data | Where-Object { $_.Name -eq "ImageLoaded" }).'#text'
    $signed = ($xml.Event.EventData.Data | Where-Object { $_.Name -eq "Signed" }).'#text'

    $hostSig = Get-AuthenticodeSignature $image -ErrorAction SilentlyContinue
    $dllSig = Get-AuthenticodeSignature $imageLoaded -ErrorAction SilentlyContinue

    if ($hostSig.Status -eq "Valid" -and $dllSig.Status -ne "Valid") {
        [PSCustomObject]@{
            Time = $event.TimeCreated
            HostProcess = $image
            HostSigner = $hostSig.SignerCertificate.Subject
            LoadedDLL = $imageLoaded
            DLLSigned = $signed
            Alert = "Signed app loaded unsigned DLL"
        }
    }
}
```

---

## 0x05 COM 劫持（T1574.015）

### 1. 攻击原理

COM（Component Object Model）是 Windows 的核心组件架构，允许不同进程间的代码复用和通信。每个 COM 对象通过一个唯一的 CLSID（Class Identifier，GUID 格式）标识，并在注册表中注册其服务器位置。COM 劫持的本质是修改注册表中 COM 对象的配置，使其指向攻击者控制的 DLL 或可执行文件。

COM 对象的注册表位置有两个层级：

```
系统级（需要管理员权限）：
HKEY_LOCAL_MACHINE\SOFTWARE\Classes\CLSID\{CLSID}\

用户级（仅需当前用户权限）：
HKEY_CURRENT_USER\SOFTWARE\Classes\CLSID\{CLSID}\
```

用户级 COM 劫持是攻击者的首选，因为不需要管理员权限。当系统和用户级存在相同的 CLSID 时，用户级优先。

### 2. InprocServer32 劫持

InprocServer32 是最常见的 COM 劫持目标。它指定一个 DLL 作为 COM 对象的进程内服务器：

```
HKCU\SOFTWARE\Classes\CLSID\{target-clsid}\InprocServer32
    (Default) = C:\Path\To\Malicious.dll
    ThreadingModel = Apartment
```

当任何进程尝试创建该 CLSID 的 COM 对象时，COM 运行时会加载攻击者指定的 DLL，并调用其 `DllGetClassObject` 导出函数。

攻击示例——劫持一个常用的 COM 对象：

```powershell
$clsid = "{00000000-0000-0000-0000-000000000000}"
$regPath = "HKCU:\SOFTWARE\Classes\CLSID\$clsid\InprocServer32"
New-Item -Path $regPath -Force
Set-ItemProperty -Path $regPath -Name "(Default)" -Value "C:\Temp\malicious.dll"
Set-ItemProperty -Path $regPath -Name "ThreadingModel" -Value "Apartment"
```

### 3. LocalServer32 劫持

LocalServer32 指定一个可执行文件作为 COM 对象的本地服务器（运行在独立进程中）：

```
HKCU\SOFTWARE\Classes\CLSID\{target-clsid}\LocalServer32
    (Default) = "C:\Path\To\Malicious.exe" -embedding
```

与 InprocServer32 不同，LocalServer32 劫持不会将恶意代码注入到调用者进程中，而是启动一个独立进程。这种方式的隐蔽性较低，但可以实现更复杂的攻击逻辑。

### 4. TreatAs 劫持

TreatAs 是一种间接 COM 劫持技术。它不直接修改目标 CLSID 的服务器配置，而是告诉 COM 运行时将一个 CLSID 视为另一个 CLSID：

```
HKCU\SOFTWARE\Classes\CLSID\{original-clsid}\TreatAs
    (Default) = {malicious-clsid}
```

当进程请求创建 `{original-clsid}` 的 COM 对象时，COM 运行时会将其重定向到 `{malicious-clsid}`，后者指向攻击者控制的服务器。

TreatAs 劫持的优势：

- 不修改原始 CLSID 的 InprocServer32 或 LocalServer32，降低了被简单注册表扫描发现的概率
- 可以复用已有的 COM 对象注册，只需要添加一个 TreatAs 键

### 5. 取证特征

**注册表修改痕迹：** COM 劫持必然涉及注册表的修改。在用户级劫持的情况下，修改的是 `HKCU\SOFTWARE\Classes\CLSID\` 下的键值。

**COM 对象指向异常路径：** InprocServer32 或 LocalServer32 的值指向非标准路径，如临时目录、用户目录、可移动介质等。

**TreatAs 键的异常出现：** 在正常系统中，TreatAs 键的出现频率较低。任何新增的 TreatAs 键都值得深入调查。

**COM 对象创建事件：** 如果启用了 COM 审计（通过注册表 `HKLM\SOFTWARE\Microsoft\Ole\ActivationSecurity` 或 ETW 提供程序），可以捕获 COM 对象的创建事件。

### 6. 检测方法

**注册表监控：**

```powershell
$monitoredPaths = @(
    "HKCU:\SOFTWARE\Classes\CLSID",
    "HKLM:\SOFTWARE\Classes\CLSID"
)

foreach ($path in $monitoredPaths) {
    $baseline = Get-ChildItem $path -ErrorAction SilentlyContinue | ForEach-Object {
        $_.PSChildName
    }
    Set-Content "C:\temp\com_baseline_$(Split-Path $path -Leaf).txt" $baseline
}
```

**COM 对象审计脚本：**

```powershell
$suspiciousClsids = Get-ChildItem "HKCU:\SOFTWARE\Classes\CLSID" -ErrorAction SilentlyContinue

foreach ($clsid in $suspiciousClsids) {
    $inproc = Get-ItemProperty "$($clsid.PSPath)\InprocServer32" -ErrorAction SilentlyContinue
    $local = Get-ItemProperty "$($clsid.PSPath)\LocalServer32" -ErrorAction SilentlyContinue
    $treatAs = Get-ItemProperty "$($clsid.PSPath)\TreatAs" -ErrorAction SilentlyContinue

    if ($inproc) {
        $dllPath = $inproc.'(default)'
        if ($dllPath -and ($dllPath -match "Temp|Users|Downloads|AppData" -or -not (Test-Path $dllPath))) {
            [PSCustomObject]@{
                CLSID = $clsid.PSChildName
                Type = "InprocServer32"
                Target = $dllPath
                Exists = Test-Path $dllPath
                Suspicious = $true
            }
        }
    }

    if ($treatAs) {
        [PSCustomObject]@{
            CLSID = $clsid.PSChildName
            Type = "TreatAs"
            Target = $treatAs.'(default)'
            Exists = $null
            Suspicious = $true
        }
    }
}
```

---

## 0x06 导出转发劫持

### 1. 攻击原理

DLL 导出转发（Export Forwarding）是 Windows PE 格式的一项特性，允许一个 DLL 的导出函数将调用转发到另一个 DLL 的导出函数。这种机制在 Windows 系统中被广泛使用，例如 `api-ms-win-*.dll`（API Set 转发）和 `ext-ms-win-*.dll`。

导出转发的格式为：

```
TargetDLL.TargetFunction
```

例如，`NTDLL.RtlAllocateHeap` 表示将调用转发到 `NTDLL.dll` 的 `RtlAllocateHeap` 函数。

攻击者可以利用导出转发机制创建一种特殊的恶意 DLL：该 DLL 的所有导出函数都是转发到合法 DLL 的，但在 DLL 加载时（`DllMain`）执行恶意代码。这种方式的优势在于：

- 恶意 DLL 的行为与合法 DLL 完全一致（所有导出函数都正确转发）
- 宿主应用程序不会因为缺少导出函数而崩溃
- 恶意代码在 DLL 加载时就已经执行，不需要等待导出函数被调用

### 2. 攻击实现

**创建转发导出的恶意 DLL：**

```c
#include <windows.h>

BOOL WINAPI DllMain(HINSTANCE hinstDLL, DWORD fdwReason, LPVOID lpvReserved) {
    switch (fdwReason) {
        case DLL_PROCESS_ATTACH: {
            char cmdLine[512];
            wsprintfA(cmdLine, "cmd.exe /c echo compromised > C:\\Temp\\dll_hijack_proof.txt");
            STARTUPINFOA si = { sizeof(STARTUPINFOA) };
            PROCESS_INFORMATION pi;
            CreateProcessA(NULL, cmdLine, NULL, NULL, FALSE,
                           CREATE_NO_WINDOW, NULL, NULL, &si, &pi);
            CloseHandle(pi.hProcess);
            CloseHandle(pi.hThread);
            break;
        }
    }
    return TRUE;
}
```

导出定义文件（.def）：

```
LIBRARY VERSION.dll
EXPORTS
    GetFileVersionInfoA = C:\Windows\System32\VERSION.dll.GetFileVersionInfoA
    GetFileVersionInfoSizeA = C:\Windows\System32\VERSION.dll.GetFileVersionInfoSizeA
    VerInstallFileA = C:\Windows\System32\VERSION.dll.VerInstallFileA
    VerQueryValueA = C:\Windows\System32\VERSION.dll.VerQueryValueA
```

编译后，恶意 `VERSION.dll` 的所有导出函数都会转发到系统目录下的合法 `VERSION.dll`，宿主应用程序无法感知差异。

### 3. 取证特征

**导出函数指向异常路径：** 正常 DLL 的导出转发通常指向系统目录下的其他 DLL。如果导出转发指向非标准路径，是可疑指标。

**DLL 位于非标准路径：** 转发劫持的恶意 DLL 通常位于应用程序目录或临时目录，而不是系统目录。

**DLL 签名缺失或无效：** 系统 DLL 通常具有 Microsoft 的数字签名，恶意替代 DLL 没有有效签名。

**PE 导出表异常：** 使用 PE 分析工具检查 DLL 的导出表，如果发现大量导出函数使用转发格式且指向绝对路径（而非系统 DLL 的常规转发模式），需要深入调查。

### 4. 检测方法

**DLL 导出分析：**

```powershell
function Analyze-DllExports {
    param([string]$DllPath)

    $bytes = [System.IO.File]::ReadAllBytes($DllPath)
    $peOffset = [BitConverter]::ToInt32($bytes, 0x3C)
    $exportDirRVA = [BitConverter]::ToInt32($bytes, $peOffset + 0x78)

    if ($exportDirRVA -eq 0) {
        Write-Host "No export table found"
        return
    }

    Write-Host "Export directory RVA: 0x$($exportDirRVA.ToString('X8'))"
    Write-Host "Analyzing export forwarding entries..."

    $sections = Parse-SectionHeaders $bytes $peOffset
    foreach ($export in (Parse-ExportTable $bytes $exportDirRVA $sections)) {
        if ($export.ForwarderRVA -ne 0) {
            $forwarderName = Read-StringAtRVA $bytes $export.ForwarderRVA $sections
            if ($forwarderName -match "^[A-Z]:\\") {
                Write-Host "[ALERT] Absolute path forward: $($export.Name) -> $forwarderName" -ForegroundColor Red
            } else {
                Write-Host "[INFO] Standard forward: $($export.Name) -> $forwarderName"
            }
        }
    }
}
```

---

## 0x07 DLL 劫持的取证分析

### 1. Sysmon Event ID 7 分析

Sysmon Event ID 7 是 DLL 劫持取证分析的核心数据源。每个 DLL 加载事件都会记录以下关键字段：

| 字段 | 取证价值 |
|------|---------|
| Image | 加载 DLL 的进程路径，用于判断宿主进程是否合法 |
| ImageLoaded | DLL 的实际加载路径，是判断劫持的核心依据 |
| Hashes | DLL 的哈希值，用于与已知合法 DLL 基线比对 |
| Signed | DLL 是否有数字签名 |
| SignatureStatus | 签名验证状态 |
| Description / Product / Company | DLL 的元数据，缺失时是可疑指标 |
| OriginalFileName | DLL 的原始文件名，与实际文件名不一致时是可疑指标 |

**Sysmon 配置优化（捕获更多 DLL 加载事件）：**

```xml
<Sysmon schemaversion="4.90">
  <EventFiltering>
    <RuleGroup name="DLLLoadMonitoring" groupRelation="or">
      <ImageLoad onmatch="exclude">
        <Image condition="is">C:\Windows\System32\svchost.exe</Image>
        <ImageLoaded condition="begin with">C:\Windows\System32\</ImageLoaded>
        <Signature condition="is">Microsoft Windows</Signature>
      </ImageLoad>
    </RuleGroup>
  </EventFiltering>
</Sysmon>
```

**Event ID 7 深度分析脚本：**

```powershell
$dllEvents = Get-WinEvent -FilterHashtable @{
    LogName = "Microsoft-Windows-Sysmon/Operational"
    Id = 7
} -MaxEvents 10000

$results = foreach ($event in $dllEvents) {
    $xml = [xml]$event.ToXml()
    $data = $xml.Event.EventData.Data
    $image = ($data | Where-Object { $_.Name -eq "Image" }).'#text'
    $imageLoaded = ($data | Where-Object { $_.Name -eq "ImageLoaded" }).'#text'
    $signed = ($data | Where-Object { $_.Name -eq "Signed" }).'#text'
    $sigStatus = ($data | Where-Object { $_.Name -eq "SignatureStatus" }).'#text'
    $hashes = ($data | Where-Object { $_.Name -eq "Hashes" }).'#text'
    $description = ($data | Where-Object { $_.Name -eq "Description" }).'#text'
    $originalFileName = ($data | Where-Object { $_.Name -eq "OriginalFileName" }).'#text'

    $riskScore = 0
    $alerts = @()

    if ($signed -eq "false") { $riskScore += 30; $alerts += "Unsigned DLL" }
    if ($imageLoaded -match "C:\\Users\\|C:\\Temp\\|C:\\ProgramData\\") {
        $riskScore += 25; $alerts += "Non-standard path"
    }
    if (-not $description -or $description -eq "-") { $riskScore += 15; $alerts += "No description" }
    if ($originalFileName -and $originalFileName -ne "-") {
        $loadedFileName = Split-Path $imageLoaded -Leaf
        if ($originalFileName -ne $loadedFileName) {
            $riskScore += 20; $alerts += "FileName mismatch"
        }
    }

    if ($riskScore -ge 40) {
        [PSCustomObject]@{
            Time = $event.TimeCreated
            Process = Split-Path $image -Leaf
            DLL = $imageLoaded
            RiskScore = $riskScore
            Alerts = ($alerts -join "; ")
            Hash = $hashes
        }
    }
}

$results | Sort-Object RiskScore -Descending | Format-Table -AutoSize
```

### 2. Process Monitor 分析

Process Monitor（ProcMon）是 DLL 劫持分析中最强大的实时工具。它可以捕获文件系统的每一次访问尝试，包括失败的 DLL 加载尝试（`NAME NOT FOUND`），这是识别 Phantom DLL 和搜索顺序劫持目标的关键。

**ProcMon 过滤器配置（DLL 劫持检测）：**

```
1. Operation is CreateFile → Include
2. Path ends with .dll → Include
3. Path contains \Windows\ → Exclude
4. Path contains \WinSxS\ → Exclude
5. Result is NAME NOT FOUND → Highlight Red
6. Result is SUCCESS AND Path contains \Users\ → Highlight Yellow
```

**ProcMon 数据导出与分析：**

```powershell
$csv = Import-Csv "C:\temp\procmon_dll_analysis.csv"

$failedLoads = $csv | Where-Object {
    $_.Operation -eq "CreateFile" -and
    $_.Result -eq "NAME NOT FOUND" -and
    $_.Path -match "\.dll$"
} | Group-Object { Split-Path $_.Path -Leaf } | Sort-Object Count -Descending

Write-Host "=== Top 20 Missing DLLs ==="
$failedLoads | Select-Object -First 20 | ForEach-Object {
    Write-Host "$($_.Count) attempts: $($_.Name)"
}

$successFromTemp = $csv | Where-Object {
    $_.Operation -eq "CreateFile" -and
    $_.Result -eq "SUCCESS" -and
    $_.Path -match "\.dll$" -and
    $_.Path -match "C:\\Temp|C:\\Users\\.*\\AppData\\Local\\Temp"
}

Write-Host "`n=== DLLs Loaded from Temp ==="
$successFromTemp | ForEach-Object {
    Write-Host "$($_.ProcessName) loaded $($_.Path)" -ForegroundColor Yellow
}
```

### 3. 内存取证

当 DLL 劫持的恶意 DLL 已经被加载到进程内存中，但文件系统上的证据已被清除时，内存取证成为最后的分析手段。

**Volatility ldrmodules 插件：**

```
volatility -f memory.dmp ldrmodules --pid=4872
```

`ldrmodules` 输出中的关键列：

- `InLoad`：DLL 是否在进程的 PEB.Ldr 加载列表模块中
- `InInit`：DLL 是否在初始化列表中
- `InMem`：DLL 是否在内存映射中
- `MappedPath`：DLL 的文件路径

异常指标：

- `MappedPath` 指向非标准路径
- `InLoad` 为 True 但 `MappedPath` 为空（可能是反射式 DLL 注入）
- DLL 名称与预期不符

**Volatility dlllist 插件：**

```
volatility -f memory.dmp dlllist --pid=4872
```

`dlllist` 提供了更详细的 DLL 信息，包括加载基址、大小、路径和加载时间。

**malfind 插件检测注入的 DLL：**

```
volatility -f memory.dmp malfind --pid=4872
```

### 4. 文件哈希比对

建立合法 DLL 的哈希基线是检测 DLL 劫持的基础：

```powershell
$systemDlls = Get-ChildItem "C:\Windows\System32\*.dll" | ForEach-Object {
    [PSCustomObject]@{
        Name = $_.Name
        Path = $_.FullName
        SHA256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
        Size = $_.Length
        LastWriteTime = $_.LastWriteTime
        Signed = (Get-AuthenticodeSignature $_.FullName).Status -eq "Valid"
    }
}
$systemDlls | Export-Csv "C:\temp\system_dll_baseline.csv" -NoTypeInformation
```

在事件响应中，将可疑 DLL 的哈希与基线比对：

```powershell
$suspiciousDlls = Import-Csv "C:\temp\suspicious_dlls.csv"
$baseline = Import-Csv "C:\temp\system_dll_baseline.csv"

foreach ($dll in $suspiciousDlls) {
    $match = $baseline | Where-Object { $_.Name -eq (Split-Path $dll.Path -Leaf) }
    if ($match) {
        if ($dll.SHA256 -ne $match.SHA256) {
            Write-Host "[ALERT] Hash mismatch: $($dll.Path)" -ForegroundColor Red
            Write-Host "  Expected: $($match.SHA256)"
            Write-Host "  Actual:   $($dll.SHA256)"
        }
    } else {
        Write-Host "[INFO] No baseline for: $($dll.Path)" -ForegroundColor Yellow
    }
}
```

### 5. 签名验证

```powershell
function Verify-DllSignature {
    param([string]$DllPath)

    $sig = Get-AuthenticodeSignature $DllPath
    $result = [PSCustomObject]@{
        Path = $DllPath
        Status = $sig.Status.ToString()
        Signer = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { "N/A" }
        Issuer = if ($sig.SignerCertificate) { $sig.SignerCertificate.Issuer } else { "N/A" }
        Timestamp = if ($sig.TimeStamperCertificate) { $sig.TimeStamperCertificate } else { "N/A" }
    }

    if ($sig.Status -ne "Valid") {
        $result | Add-Member -NotePropertyName "Alert" -NotePropertyValue "Invalid or missing signature"
    }

    if ($sig.SignerCertificate) {
        $chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
        $chain.Build($sig.SignerCertificate.Certificate) | Out-Null
        $result | Add-Member -NotePropertyName "ChainLength" -NotePropertyValue $chain.ChainElements.Count
    }

    $result
}
```

---

## 0x08 证据强度分层

在 DLL 劫持的取证分析中，单一指标通常不足以确认攻击行为。需要将多个指标组合，按照证据强度进行分层判断。

### 1. 确认恶意（Confirmation Level）

以下证据组合可以确认 DLL 劫持攻击：

- DLL 从非标准路径加载 + DLL 包含恶意 payload（如反弹 shell、键盘记录器）+ 网络连接指向 C2 服务器
- DLL 加载后创建了恶意子进程（如 PowerShell 下载器、 Mimikatz）
- DLL 的导出函数中包含明显的恶意行为（如修改注册表持久化、注入其他进程）
- DLL 文件中包含攻击者工具的特征字符串或代码签名

确认级别的证据通常来自：

- 恶意 DLL 的逆向分析
- 内存取证中发现的恶意代码
- 网络流量中捕获的 C2 通信
- 终端检测与响应（EDR）的告警

### 2. 高度可疑（High Suspicion Level）

以下证据组合表明高度可疑的 DLL 劫持：

- DLL 从临时目录或用户目录加载 + DLL 未签名 + DLL 元数据缺失
- 签名应用加载了来自非标准路径的未签名 DLL
- DLL 的文件名与系统 DLL 同名但路径不同
- 注册表中出现异常的 COM 对象配置（InprocServer32 指向非标准路径）
- DLL 的 OriginalFileName 与实际文件名不匹配

高度可疑级别的响应：

- 立即隔离可疑 DLL 文件
- 对宿主进程进行完整的内存转储
- 收集宿主进程的完整事件日志时间线
- 对可疑 DLL 进行逆向分析

### 3. 需要关注（Attention Level）

以下证据需要进一步关注但不一定表示攻击：

- DLL 从非标准路径加载但 DLL 有有效签名
- DLL 加载失败（NAME NOT FOUND）但应用程序正常运行
- 注册表中的 COM 对象配置与默认值略有不同
- PATH 环境变量中包含非标准目录

关注级别的响应：

- 记录到调查日志中
- 与系统基线进行比对
- 持续监控相关进程和文件的变化
- 确认是否为合法软件的安装或更新导致

**综合评分模型：**

```powershell
function Get-DllHijackRiskScore {
    param(
        [string]$DllPath,
        [string]$HostProcess,
        [bool]$IsSigned,
        [string]$SignatureStatus,
        [string]$Description,
        [string]$OriginalFileName
    )

    $score = 0
    $factors = @()

    $suspiciousPaths = @("C:\Temp", "C:\Users\*\AppData\Local\Temp", "C:\ProgramData", "C:\Users\Public")
    foreach ($pattern in $suspiciousPaths) {
        if ($DllPath -like $pattern) {
            $score += 30
            $factors += "Suspicious path (+30)"
            break
        }
    }

    if (-not $IsSigned) { $score += 25; $factors += "Unsigned (+25)" }
    if ($SignatureStatus -eq "NotSigned") { $score += 5; $factors += "Not signed at all (+5)" }
    if (-not $Description -or $Description -eq "-") { $score += 10; $factors += "No description (+10)" }

    $dllFileName = Split-Path $DllPath -Leaf
    if ($OriginalFileName -and $OriginalFileName -ne "-" -and $OriginalFileName -ne $dllFileName) {
        $score += 20
        $factors += "Filename mismatch (+20)"
    }

    $systemDllNames = @("ntdll.dll", "kernel32.dll", "user32.dll", "advapi32.dll", "ws2_32.dll", "wininet.dll")
    if ($dllFileName -in $systemDllNames -and $DllPath -notlike "C:\Windows\*") {
        $score += 40
        $factors += "System DLL name from non-system path (+40)"
    }

    $level = switch ($score) {
        { $_ -ge 70 } { "CONFIRMED MALICIOUS" }
        { $_ -ge 50 } { "HIGH SUSPICION" }
        { $_ -ge 30 } { "ATTENTION" }
        default { "LOW RISK" }
    }

    [PSCustomObject]@{
        DllPath = $DllPath
        HostProcess = $HostProcess
        Score = $score
        Level = $level
        Factors = ($factors -join "; ")
    }
}
```

---

## 0x09 公开案例中的 DLL 劫持

### 1. 案例一：APT28 — DLL 侧加载

APT28（Fancy Bear / Sofacy）是俄罗斯军事情报机构 GRU 下属的高级持续性威胁组织。该组织在多次攻击行动中使用了 DLL 侧加载技术。

**攻击链描述：**

APT28 利用合法的安全软件（如某些杀毒软件的更新程序）作为侧加载载体。攻击者将恶意 DLL 放置在安全软件的可写子目录中。当安全软件的更新程序运行时，它加载了恶意 DLL，由于更新程序具有有效的数字签名，安全产品的行为监控组件没有对其产生告警。

恶意 DLL 被加载后，通过 `DllMain` 中的代码释放并执行第二阶段的植入体（通常是 Sofacy 家族的 X-Agent 或 X-Tunnel 后门）。

**取证关键点：**

- 安全软件更新程序的 Sysmon Event ID 7 中出现了来自非标准路径的 DLL 加载记录
- 被加载的 DLL 没有数字签名，与安全软件自身的签名形成对比
- DLL 加载后数秒内，出现了新的网络连接和子进程创建事件
- 恶意 DLL 的 PE 元数据中包含了伪造的版本信息，试图模仿合法组件

**时间线还原：**

```
2025-03-15 09:23:01 - 安全软件更新程序启动（正常行为）
2025-03-15 09:23:01 - 加载恶意 DLL（Event ID 7，路径异常）
2025-03-15 09:23:02 - DllMain 执行，释放 payload 到 %TEMP%
2025-03-15 09:23:03 - 创建 PowerShell 子进程（Event ID 1）
2025-03-15 09:23:05 - PowerShell 建立 outbound 连接到 C2（Event ID 3）
2025-03-15 09:23:06 - C2 返回命令，开始横向移动
```

### 2. 案例二：Carbanak — DLL 搜索顺序劫持

Carbanak（Anunak）是一个以金融利益为目的的网络犯罪组织，主要攻击银行和金融机构。该组织在入侵银行内网后，使用 DLL 搜索顺序劫持来实现持久化和权限提升。

**攻击链描述：**

Carbanak 在获得银行工作站的初始访问权限后，发现银行使用的一个内部业务应用程序在启动时会尝试加载一个不存在的 DLL（Phantom DLL）。攻击者创建了一个与该 Phantom DLL 同名的恶意 DLL，并将其放置在应用程序目录中。

该恶意 DLL 在 `DllMain` 中建立了一个反向连接，连接到攻击者在银行内网中控制的 C2 服务器。通过这种方式，每次业务应用程序启动时，恶意 DLL 都会被自动加载，实现了无需修改启动项或创建新服务的持久化。

**取证关键点：**

- 应用程序目录中出现了一个新的 DLL 文件，其创建时间晚于应用程序的安装时间
- DLL 没有数字签名，PE 元数据为空
- Sysmon Event ID 7 显示该 DLL 从应用程序目录加载，但不在应用程序的原始安装文件中
- DLL 加载后建立了到内网异常 IP 的网络连接
- 网络连接的目标端口为 443，但协议不是 HTTPS

### 3. 案例三：Lazarus — Phantom DLL 劫持

Lazarus Group（Hidden Cobra / Guardians of Peace）是朝鲜下属的网络攻击组织，以破坏性攻击和金融盗窃闻名。在某些攻击行动中，Lazarus 使用了 Phantom DLL 劫持技术。

**攻击链描述：**

Lazarus 针对目标企业的特定业务应用程序进行了详细的逆向分析，识别出应用程序在启动时尝试加载的一个可选组件 DLL。该 DLL 在标准安装中不存在，但应用程序每次启动都会尝试加载它。

攻击者创建了一个精心构造的恶意 DLL，该 DLL 不仅实现了预期的导出函数接口（确保应用程序不会因为接口不匹配而崩溃），还在 `DllMain` 中实现了一个完整的后门功能，包括文件传输、命令执行、屏幕截图等。

**取证关键点：**

- 恶意 DLL 实现了完整的导出函数接口，应用程序的行为与加载合法组件时一致
- DLL 从应用程序目录加载，但文件哈希与任何已知合法软件不匹配
- DLL 的 PE 导出表中包含了与目标应用程序预期接口完全匹配的函数名
- 内存取证显示 DLL 在加载后创建了隐藏线程，执行周期性的 C2 通信
- C2 通信使用了自定义的加密协议，流量特征与正常业务流量不同

---

## 0x10 DLL 劫持检测自动化与狩猎

### 1. PowerShell 检测脚本

以下脚本实现了自动化的 DLL 劫持检测，综合了多种检测方法：

```powershell
function Invoke-DllHijackHunt {
    [CmdletBinding()]
    param(
        [string]$OutputPath = "C:\temp\dll_hijack_report.csv",
        [int]$MaxEvents = 50000,
        [switch]$IncludeLowRisk
    )

    $results = [System.Collections.ArrayList]::new()

    $dllEvents = Get-WinEvent -FilterHashtable @{
        LogName = "Microsoft-Windows-Sysmon/Operational"
        Id = 7
    } -MaxEvents $MaxEvents -ErrorAction SilentlyContinue

    $systemPaths = @(
        "C:\Windows\System32",
        "C:\Windows\SysWOW64",
        "C:\Windows\WinSxS",
        "C:\Windows\assembly"
    )

    foreach ($event in $dllEvents) {
        $xml = [xml]$event.ToXml()
        $data = $xml.Event.EventData.Data
        $image = ($data | Where-Object { $_.Name -eq "Image" }).'#text'
        $imageLoaded = ($data | Where-Object { $_.Name -eq "ImageLoaded" }).'#text'
        $signed = ($data | Where-Object { $_.Name -eq "Signed" }).'#text'
        $sigStatus = ($data | Where-Object { $_.Name -eq "SignatureStatus" }).'#text'
        $hashes = ($data | Where-Object { $_.Name -eq "Hashes" }).'#text'
        $description = ($data | Where-Object { $_.Name -eq "Description" }).'#text'
        $product = ($data | Where-Object { $_.Name -eq "Product" }).'#text'
        $company = ($data | Where-Object { $_.Name -eq "Company" }).'#text'
        $originalFileName = ($data | Where-Object { $_.Name -eq "OriginalFileName" }).'#text'

        $score = 0
        $alerts = [System.Collections.ArrayList]::new()

        $isSystemPath = $false
        foreach ($sp in $systemPaths) {
            if ($imageLoaded -like "$sp\*") { $isSystemPath = $true; break }
        }

        if (-not $isSystemPath) {
            $score += 15
            $alerts.Add("Non-system path") | Out-Null
        }

        if ($signed -eq "false") {
            $score += 25
            $alerts.Add("Unsigned DLL") | Out-Null
        }

        if ($sigStatus -eq "Expired") {
            $score += 20
            $alerts.Add("Expired signature") | Out-Null
        }

        if (-not $description -or $description -eq "-") {
            $score += 10
            $alerts.Add("No description metadata") | Out-Null
        }

        if (-not $company -or $company -eq "-") {
            $score += 5
            $alerts.Add("No company metadata") | Out-Null
        }

        $dllFileName = Split-Path $imageLoaded -Leaf
        if ($originalFileName -and $originalFileName -ne "-" -and $originalFileName -ne $dllFileName) {
            $score += 20
            $alerts.Add("OriginalFileName mismatch: $originalFileName vs $dllFileName") | Out-Null
        }

        $systemDllNames = @("ntdll.dll","kernel32.dll","user32.dll","advapi32.dll","shell32.dll",
                            "ole32.dll","ws2_32.dll","wininet.dll","crypt32.dll","secur32.dll")
        if ($dllFileName.ToLower() -in $systemDllNames -and -not $isSystemPath) {
            $score += 40
            $alerts.Add("System DLL name from non-system path") | Out-Null
        }

        if ($imageLoaded -match "AppData\\Local\\Temp|C:\\Temp|C:\\Users\\Public") {
            $score += 20
            $alerts.Add("Loaded from temp/public directory") | Out-Null
        }

        $level = switch ($score) {
            { $_ -ge 70 } { "CRITICAL" }
            { $_ -ge 50 } { "HIGH" }
            { $_ -ge 30 } { "MEDIUM" }
            { $_ -ge 15 } { "LOW" }
            default { "INFO" }
        }

        if ($IncludeLowRisk -or $score -ge 30) {
            $results.Add([PSCustomObject]@{
                Time = $event.TimeCreated.ToString("yyyy-MM-dd HH:mm:ss")
                HostProcess = $image
                DLLLoaded = $imageLoaded
                Score = $score
                Level = $level
                Alerts = ($alerts -join "; ")
                Signed = $signed
                Hashes = $hashes
                Description = $description
                Product = $product
                Company = $company
            }) | Out-Null
        }
    }

    $sorted = $results | Sort-Object Score -Descending
    $sorted | Export-Csv $OutputPath -NoTypeInformation -Encoding UTF8

    Write-Host "`n=== DLL Hijack Hunt Summary ===" -ForegroundColor Cyan
    Write-Host "Total events analyzed: $($dllEvents.Count)"
    Write-Host "Suspicious findings: $($sorted.Count)"
    Write-Host ""

    $critical = ($sorted | Where-Object { $_.Level -eq "CRITICAL" }).Count
    $high = ($sorted | Where-Object { $_.Level -eq "HIGH" }).Count
    $medium = ($sorted | Where-Object { $_.Level -eq "MEDIUM" }).Count

    Write-Host "CRITICAL: $critical" -ForegroundColor Red
    Write-Host "HIGH:     $high" -ForegroundColor Yellow
    Write-Host "MEDIUM:   $medium" -ForegroundColor DarkYellow
    Write-Host ""
    Write-Host "Report saved to: $OutputPath"

    return $sorted
}
```

### 2. 事件日志狩猎查询

**Windows 事件日志 SQL 查询（适用于支持 SQL 查询的 SIEM）：**

```sql
SELECT
    TIMESTAMP AS event_time,
    Computer,
    EventData.Image AS host_process,
    EventData.ImageLoaded AS dll_path,
    EventData.Hashes AS dll_hash,
    EventData.Signed AS dll_signed,
    EventData.SignatureStatus AS sig_status,
    EventData.Description AS dll_description,
    EventData.Company AS dll_company,
    EventData.OriginalFileName AS original_name
FROM
    sysmon_events
WHERE
    EventID = 7
    AND (
        EventData.Signed = 'false'
        OR EventData.ImageLoaded LIKE '%\Users\%\AppData\Local\Temp\%'
        OR EventData.ImageLoaded LIKE '%\Temp\%'
        OR EventData.ImageLoaded LIKE '%\Users\Public\%'
        OR EventData.ImageLoaded LIKE '%\ProgramData\%'
    )
    AND EventData.ImageLoaded NOT LIKE '%\Windows\WinSxS\%'
ORDER BY
    event_time DESC
```

**跨事件关联查询（DLL 加载后进程创建）：**

```sql
SELECT
    t1.event_time AS dll_load_time,
    t1.Computer,
    t1.EventData.Image AS host_process,
    t1.EventData.ImageLoaded AS suspicious_dll,
    t2.event_time AS child_process_time,
    t2.EventData.CommandLine AS child_command,
    DATEDIFF(second, t1.event_time, t2.event_time) AS time_delta_seconds
FROM
    sysmon_events t1
JOIN
    sysmon_events t2
ON
    t1.EventData.ProcessGuid = t2.EventData.ParentProcessGuid
WHERE
    t1.EventID = 7
    AND t2.EventID = 1
    AND t1.EventData.Signed = 'false'
    AND t1.EventData.ImageLoaded NOT LIKE '%\Windows\%'
    AND DATEDIFF(second, t1.event_time, t2.event_time) BETWEEN 0 AND 60
ORDER BY
    t1.event_time DESC
```

### 3. Sigma 检测规则

**规则一：DLL 搜索顺序劫持检测**

```yaml
title: DLL Search Order Hijacking - Suspicious DLL Load
id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
status: experimental
description: 检测从非标准路径加载的未签名 DLL，可能是 DLL 搜索顺序劫持
author: Security Team
date: 2026/06/24
references:
    - https://attack.mitre.org/techniques/T1574/001/
tags:
    - attack.defense_evasion
    - attack.persistence
    - attack.t1574.001
logsource:
    product: windows
    service: sysmon
detection:
    selection:
        EventID: 7
        Signed: 'false'
    filter_system_paths:
        ImageLoaded|startswith:
            - 'C:\Windows\System32\'
            - 'C:\Windows\SysWOW64\'
            - 'C:\Windows\WinSxS\'
            - 'C:\Windows\assembly\'
    filter_signed_apps:
        SignatureStatus: 'Valid'
    filter_known_vendors:
        ImageLoaded|contains:
            - '\Program Files\'
            - '\Program Files (x86)\'
    condition: selection and not 1 of filter_*
fields:
    - Image
    - ImageLoaded
    - Hashes
    - Description
    - Product
    - Company
falsepositive:
    - 合法应用程序从非标准路径加载自定义 DLL
    - 开发环境中的调试 DLL
level: medium
```

**规则二：COM 劫持检测**

```yaml
title: COM Object Hijacking - Suspicious Registry Modification
id: b2c3d4e5-f6a7-8901-bcde-f12345678901
status: experimental
description: 检测用户级 COM 对象注册表的异常修改，可能是 COM 劫持
author: Security Team
date: 2026/06/24
references:
    - https://attack.mitre.org/techniques/T1574/015/
tags:
    - attack.persistence
    - attack.privilege_escalation
    - attack.t1574.015
logsource:
    product: windows
    service: sysmon
detection:
    selection_registry:
        EventID: 13
        TargetObject|contains: '\SOFTWARE\Classes\CLSID\'
    selection_values:
        TargetObject|contains:
            - '\InprocServer32\'
            - '\LocalServer32\'
            - '\TreatAs\'
    filter_system:
        TargetObject|contains:
            - 'HKLM\'
    filter_known_apps:
        Image|startswith:
            - 'C:\Windows\System32\'
            - 'C:\Windows\SysWOW64\'
    condition: (selection_registry and selection_values) and not 1 of filter_*
fields:
    - Image
    - TargetObject
    - Details
falsepositive:
    - 合法应用程序安装时注册 COM 组件
    - 用户级应用程序的正常 COM 注册
level: high
```

**规则三：DLL 侧加载检测**

```yaml
title: DLL Side-Loading - Signed Binary Loads Unsigned DLL
id: c3d4e5f6-a7b8-9012-cdef-123456789012
status: experimental
description: 检测签名应用程序加载未签名 DLL 的行为，可能是 DLL 侧加载
author: Security Team
date: 2026/06/24
references:
    - https://attack.mitre.org/techniques/T1574/002/
tags:
    - attack.defense_evasion
    - attack.t1574.002
logsource:
    product: windows
    service: sysmon
detection:
    selection_dll_load:
        EventID: 7
        Signed: 'false'
    filter_system_dlls:
        ImageLoaded|startswith:
            - 'C:\Windows\System32\'
            - 'C:\Windows\SysWOW64\'
            - 'C:\Windows\WinSxS\'
    filter_temp_known:
        ImageLoaded|contains: '\WinSxS\'
    condition: selection_dll_load and not 1 of filter_*
fields:
    - Image
    - ImageLoaded
    - Hashes
    - Description
falsepositive:
    - 应用程序加载自身目录中的自定义插件
    - 开发工具加载开发环境 DLL
level: medium
```

**规则四：Phantom DLL 劫持检测**

```yaml
title: Phantom DLL Hijacking - Previously Missing DLL Now Loaded
id: d4e5f6a7-b8c9-0123-defa-234567890123
status: experimental
description: 检测之前加载失败但现在成功加载的 DLL，可能是 Phantom DLL 劫持
author: Security Team
date: 2026/06/24
references:
    - https://attack.mitre.org/techniques/T1574/001/
tags:
    - attack.persistence
    - attack.privilege_escalation
    - attack.t1574.001
logsource:
    product: windows
    service: sysmon
detection:
    selection:
        EventID: 7
        Signed: 'false'
        Description: '-'
        Company: '-'
        Product: '-'
    filter_system:
        ImageLoaded|startswith:
            - 'C:\Windows\'
    filter_program_files:
        ImageLoaded|startswith:
            - 'C:\Program Files\'
            - 'C:\Program Files (x86)\'
    condition: selection and not 1 of filter_*
fields:
    - Image
    - ImageLoaded
    - Hashes
falsepositive:
    - 新安装的应用程序首次加载其自定义 DLL
    - 应用程序更新后引入的新 DLL
level: high
```

---

## 0x11 参考资料

1. Microsoft. "Dynamic-Link Library Search Order." Microsoft Docs. https://learn.microsoft.com/en-us/windows/win32/dlls/dynamic-link-library-search-order

2. MITRE ATT&CK. "T1574: Hijack Execution Flow." https://attack.mitre.org/techniques/T1574/

3. FireEye. "DLL Side-Loading: A Thorn in the Side of Application Whitelisting." FireEye Blog.

4. CrowdStrike. "DLL Search Order Hijacking." CrowdStrike Intelligence Reports.

5. Elastic Security Labs. "DLL Side-Loading: Still a Thorn for Application Control." Elastic Blog, 2023.

6. SpecterOps. "EdgeTMP: DLL Hijacking via COM." SpecterOps Research, https://posts.specterops.io/

7. Akamai. "Com Hijacking: The Old Way Still Works." Akamai Security Research.

8. MITRE ATT&CK. "T1574.001: DLL Search Order Hijacking." https://attack.mitre.org/techniques/T1574/001/

9. MITRE ATT&CK. "T1574.002: DLL Side-Loading." https://attack.mitre.org/techniques/T1574/002/

10. MITRE ATT&CK. "T1574.015: Component Object Model Hijacking." https://attack.mitre.org/techniques/T1574/015/

11. Pentestlab. "DLL Hijacking via Export Forwarding." https://pentestlab.blog/

12. SecureLink. "Phantom DLL Hijacking." SecureLink Research Blog.

13. Sysinternals. "Process Monitor v3.96." https://learn.microsoft.com/en-us/sysinternals/downloads/procmon

14. Volatility Foundation. "Volatility 3 Framework Plugins." https://github.com/volatilityfoundation/volatility3