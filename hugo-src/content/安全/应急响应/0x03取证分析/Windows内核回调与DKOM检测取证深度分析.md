---
title: "Windows内核回调与DKOM检测取证深度分析"
date: 2026-07-13T11:00:00+08:00
draft: false
weight: 810
description: "深度剖析Windows内核回调机制与DKOM攻击取证检测方法，涵盖PsSetCreateProcessNotifyRoutine等内核通知例程枚举、DKOM链表篡改检测、驱动签名策略绕过取证、Minifilter微过滤驱动分析、内核对象完整性验证，结合Turla与Equation Group Rootkit案例还原内核级攻击链"
categories: ["应急响应", "取证分析"]
tags: ["DKOM", "内核取证", "Rootkit检测", "Windows内核", "Kernel Callbacks", "Minifilter", "Driver Verifier", "Volatility", "Turla", "MITRE ATT&CK"]
---

Windows内核是操作系统安全模型的最底层信任锚点，一旦攻击者获得内核级代码执行权限，便可绕过几乎所有的用户态安全机制。内核回调（Kernel Callback）机制本是Windows为安全产品和系统组件提供的合法监控接口，然而高级威胁行为者（APT）频繁利用这些机制实施进程监控、文件过滤、注册表拦截和对象操作拦截，同时通过DKOM（Direct Kernel Object Manipulation）技术篡改内核数据结构以隐藏恶意活动痕迹。从Turla组织的Snake Rootkit到Equation Group的DoublePulsar内核后门，内核级攻防对抗已持续数十年且不断升级。本文从蓝队取证实战视角出发，系统梳理Windows内核回调机制的安全含义、DKOM攻击的技术原理与检测方法、驱动签名策略绕过取证、Minifilter微过滤驱动分析、内核对象完整性验证，并通过自动化检测脚本和真实APT案例还原内核级攻击的完整取证流程，为应急响应人员提供一套可操作的内核取证方法论。

---

## 0x01 技术基础与Windows内核取证概述

### 1.1 Windows内核架构概览

Windows操作系统采用分层架构设计，用户态（User Mode）与内核态（Kernel Mode）通过系统调用边界（System Call Boundary）严格隔离。内核态运行在Ring 0特权级，拥有对硬件和内存的完全访问权限。Windows内核的核心组件包括：

| 组件 | 二进制文件 | 核心功能 | 取证关注点 |
|------|-----------|---------|-----------|
| Executive（执行体） | ntoskrnl.exe | 进程管理、内存管理、I/O管理、对象管理 | 回调注册表、对象头篡改 |
| Kernel（内核） | hal.dll | 中断调度、异常处理、线程调度 | IDT/SSDT修改检测 |
| Device Drivers | *.sys | 设备驱动程序 | 驱动加载、隐藏、签名绕过 |
| Win32k | win32k.sys | 图形子系统、窗口管理 | Win32k回调钩子 |
| Object Manager | ntoskrnl.exe | 内核对象生命周期管理 | 对象类型篡改、Token替换 |
| Security Reference Monitor | ntoskrnl.exe | 访问令牌验证、权限检查 | Token对象操纵 |

内核态代码通过一套精心设计的回调机制向系统组件和安全产品提供事件通知能力。这些回调函数（Callback Routines）是内核通知例程的核心组成部分，被EDR/HIPS产品广泛用于实时监控系统行为。然而，攻击者同样可以注册恶意回调或通过DKOM技术破坏合法回调的执行链。

### 1.2 内核对象模型

Windows内核通过统一的对象管理器（Object Manager）管理所有内核资源。每个内核对象由对象头（OBJECT_HEADER）和对象体（Object Body）组成。对象头包含引用计数、安全描述符、类型索引等元数据，对象体则存储具体的数据结构。

| 对象类型 | 对应结构体 | 攻击向量 | MITRE ATT&CK |
|---------|-----------|---------|-------------|
| Process | EPROCESS | DKOM脱链隐藏进程、Token替换提权 | T1055、T1134 |
| Thread | ETHREAD | 隐藏线程、注入检测规避 | T1055.003 |
| Driver | DRIVER_OBJECT | 驱动隐藏、IRP钩子 | T1014 |
| Device | DEVICE_OBJECT | 设备隐藏、通信拦截 | T1574 |
| File | FILE_OBJECT | 文件访问过滤 | T1564 |
| Token | TOKEN | 权限提升、令牌操纵 | T1134.001 |
| Section | SECTION_OBJECT | 内存映射文件隐藏 | T1027 |
| Key (Registry) | KEY_OBJECT | 注册表操作拦截 | T1112 |

OBJECT_HEADER的结构在不同Windows版本中有所差异。以Windows 10/11为例：

```python
dt('nt!_OBJECT_HEADER')
# +0x000 PointerCount      : Int4B
# +0x004 HandleCount      : Int4B
# +0x008 NextToFree       : Ptr64 Void
# +0x008 Lock             : Int8B
# +0x010 TypeIndex        : UChar
# +0x011 TraceFlags       : UChar
# +0x012 InfoMask         : UChar
# +0x013 Flags            : UChar
# +0x014 ObjectCreateInfo : Ptr64 _EX_OBJECT_CREATE_TYPE
# +0x018 QuotaBlockCharged : Ptr64 Void
# +0x01a SecurityDescriptor : Ptr64 Void
# +0x01c Body             : _QUAD
```

### 1.3 内核取证与用户态取证的核心差异

内核取证与传统的用户态取证在数据来源、分析方法和工具链上存在本质差异：

| 维度 | 用户态取证 | 内核取证 |
|------|-----------|---------|
| 数据来源 | 进程内存、注册表、文件系统、日志 | 内核内存转储、物理内存镜像 |
| 分析对象 | DLL/EXE、配置文件、日志文件 | EPROCESS/ETHREAD链表、回调表、驱动对象 |
| 工具链 | Process Monitor、Autoruns、Process Explorer | WinDbg、Volatility、Driver Verifier |
| 隐蔽检测 | 文件hash、注册表键值 | 链表一致性校验、回调函数指针验证 |
| 攻击技术 | DLL注入、进程 Hollowing | DKOM脱链、SSDT钩子、IRP Hook |
| 防御机制 | ASLR、DEP、CFG | DSE、HVCI、VBS、Secure Boot |
| 取证时机 | 实时监控或事后分析 | 通常需要内存转储或内核调试 |
| 证据完整性 | 文件系统快照可保全 | 内核状态易被实时篡改 |

### 1.4 内核取证工具链

| 工具 | 类型 | 核心能力 | 适用场景 |
|------|------|---------|---------|
| WinDbg | 内核调试器 | 内核符号解析、数据结构遍历、断点调试 | 实时内核分析、内存转储离线分析 |
| Volatility 3 | 内存取证框架 | EPROCESS枚举、回调表遍历、驱动检测 | 内存转储批量分析 |
| Driver Verifier | 驱动验证工具 | IRP监控、内存池分配检测、死锁检测 | 驱动行为分析、恶意驱动检测 |
| Process Monitor | 用户态监控 | 文件/注册表/网络/进程活动监控 | 行为关联分析 |
| Autoruns | 启动项枚举 | 驱动服务、启动项、Shell扩展枚举 | 启动项审计 |
| KPCR Dumper | 内核数据采集 | KPCR/IDT/GDT/SSDT数据提取 | 内核结构完整性检查 |
| GRR Rapid Response | 远程取证 | 内核模块枚举、驱动服务检查 | 远程主机批量取证 |

```powershell
Get-WmiObject Win32_SystemDriver | Select-Object Name, PathName, State, StartMode | Format-Table -AutoSize
```

```powershell
driverquery /v /fo list
```

```powershell
Get-ChildItem "HKLM:\SYSTEM\CurrentControlSet\Services" | ForEach-Object { $props = Get-ItemProperty $_.PSPath; [PSCustomObject]@{ Name = $_.PSChildName; Type = $props.Type; Start = $props.Start; ImagePath = $props.ImagePath } } | Where-Object { $_.Type -eq 1 } | Format-Table -AutoSize
```

---

## 0x02 内核回调机制与通知例程取证

### 2.1 回调机制总览

Windows内核提供了一系列注册/注销API，允许驱动程序订阅特定类型的系统事件。这些通知例程在事件发生时被内核自动调用，构成了内核级事件监控的基础架构。

| 回调API | 通知事件 | 典型用途 | 注册者数量限制 |
|---------|---------|---------|-------------|
| PsSetCreateProcessNotifyRoutine | 进程创建/退出/EPROCESS删除 | EDR进程监控 | 无硬性限制（PspNotifyLimit=64） |
| PsSetCreateThreadNotifyRoutine | 线程创建/退出 | 线程注入检测 | 无硬性限制 |
| PsSetLoadImageNotifyRoutine | 映像加载（EXE/DLL/SYS） | 模块加载监控 | 无硬性限制 |
| CmRegisterCallback | 注册表操作（创建/删除/查询/设置） | HIPS注册表保护 | 无硬性限制 |
| ObRegisterCallbacks | 对象操作（进程/线程句柄操作） | EDR句柄保护 | 无硬性限制 |
| IoRegisterFsRegistrationChange | 文件系统注册/注销 | 文件系统过滤驱动 | 无硬性限制 |
| IoRegisterDeviceInterfaceNotification | 设备接口变更 | USB设备监控 | 无硬性限制 |
| SeRegisterLogonSessionTerminatedRoutine | 登录会话终止 | 会话管理 | 无硬性限制 |

攻击者利用恶意回调可以实现：进程创建拦截（阻止安全进程启动）、线程操作监控（检测分析行为）、映像加载过滤（阻止安全DLL注入）、注册表操作拦截（阻止安全键值写入）、句柄操作过滤（保护恶意进程句柄不被关闭）。

### 2.2 PsSetCreateProcessNotifyRoutine

`PsSetCreateProcessNotifyRoutine` 是最常用的内核回调之一，当进程创建、退出或EPROCESS结构体被删除时触发通知。EDR产品通过注册此回调来监控进程创建行为。

**回调函数原型：**

```c
void CallbackRoutine(
    _Inout_ PEPROCESS Process,
    _In_ HANDLE ProcessId,
    _Inout_opt_ PPS_CREATE_NOTIFY_INFO CreateInfo
);
```

**枚举方法（WinDbg）：**

```windbg
!process 0 0
```

```windbg
dd nt!PspCreateProcessNotifyRoutineCount L1
```

```windbg
dq nt!PspCreateProcessNotifyRoutine L<count>
```

```windbg
!drvobj \Driver\YourDriver 2
```

**枚举方法（Volatility 3）：**

```bash
vol -f memory.dmp windows.callbacks
```

**恶意回调检测要点：**

| 检测维度 | 正常特征 | 异常特征 |
|---------|---------|---------|
| 回调函数地址 | 位于已加载驱动模块的地址空间内 | 指向未映射区域或非驱动模块地址 |
| 注册模块 | 已知安全产品驱动（如CrowdStrike、Carbon Black） | 未知模块或已卸载驱动的悬空指针 |
| 回调顺序 | 按注册顺序依次执行 | 异常的回调执行顺序 |
| 回调数量 | 合理数量（通常<20） | 异常大量的回调注册 |

### 2.3 PsSetCreateThreadNotifyRoutine

线程通知回调在线程创建或删除时被调用。攻击者可以通过注册此回调来监控安全工具的线程活动，或检测分析人员何时启动调试器附加到恶意进程。

```windbg
dq nt!PspCreateThreadNotifyRoutine L<count>
```

```windbg
!thread -1 <tid>
```

**取证分析要点：** 检查所有已注册的线程通知回调函数指针，验证每个指针是否指向有效的已加载驱动模块代码段。使用 `lm` 命令列出所有已加载模块，交叉验证回调函数地址是否在合法模块的地址范围内。

```windbg
lm m *
```

```windbg
!vad <address> /p
```

### 2.4 PsSetLoadImageNotifyRoutine

映像加载通知回调在EXE、DLL或驱动模块被映射到内存空间时触发。该回调可用于监控模块加载行为，但也被Rootkit用于拦截安全DLL的加载以实施DLL搜索顺序劫持。

```c
typedef struct _PS_SET_LOAD_IMAGE_NOTIFY_ROUTINE {
    PSTR FullImageName;
    HANDLE ProcessId;
    PIMAGE_INFO ImageInfo;
} PS_SET_LOAD_IMAGE_NOTIFY_ROUTINE;
```

**枚举方法：**

```windbg
dq nt!PspLoadImageNotifyRoutine L<count>
```

```windbg
!imgreloc ntoskrnl.exe
```

```powershell
Get-WinEvent -LogName "Microsoft-Windows-Sysmon/Operational" | Where-Object { $_.Id -eq 7 } | Select-Object -First 20 | Format-List TimeCreated, Message
```

**映像加载回调的取证价值：** 映像加载回调记录了系统中所有可执行模块的加载历史。通过分析回调注册表可以发现Rootkit是否拦截了特定模块的加载——例如阻止 `MsMpEng.exe`（Windows Defender进程）加载安全相关的DLL。

### 2.5 CmRegisterCallback / CmRegisterCallbackEx

注册表通知回调在注册表操作（创建键、删除键、查询键值、设置键值）时被调用。HIPS和EDR产品利用此回调保护关键注册表键值不被恶意修改。

```windbg
dq nt!CmpCallBackCount L1
```

```windbg
dq nt!CmpCallBackVector L<count>
```

| 操作类型 | REG_NOTIFY_CLASS | 取证关联 |
|---------|-----------------|---------|
| RegNtDeleteKey | RegNtPreDeleteKey / RegNtPostDeleteKey | 检测注册表键删除行为 |
| RegNtSetValueKey | RegNtPreSetValueKey / RegNtPostSetValueKey | 检测键值修改 |
| RegNtQueryValueKey | RegNtPreQueryValueKey | 检测信息收集行为 |
| RegNtRenameKey | RegNtPreRenameKey | 检测键重命名规避 |
| RegNtEnumerateKey | RegNtPreEnumerateKey | 检测枚举过滤（隐藏注册表键） |

### 2.6 ObRegisterCallbacks

对象操作回调在进程或线程的句柄被创建、复制或关闭时触发。EDR产品使用此回调来保护自身进程的句柄不被恶意进程打开（句柄保护），阻止攻击者通过 `OpenProcess` 获取安全进程的句柄以注入DLL或终止进程。

```windbg
dq nt!ObpCallbackListHead L<count>
```

```windbg
!obj \Callback\*
```

**回调结构体分析：**

| 回调类型 | 操作 | MITRE ATT&CK | 取证关注 |
|---------|------|-------------|---------|
| PreOperation | 句柄创建/复制前 | T1562.001（Impair Defenses） | 检查是否阻止安全进程句柄访问 |
| PostOperation | 句柄操作完成后 | — | 检查返回状态是否被篡改 |

### 2.7 IoRegisterFsRegistrationChange

文件系统注册变更回调在新文件系统驱动注册或注销时被调用。文件系统过滤驱动（如Minifilter）通过此回调接入文件系统过滤链。Rootkit可能利用此机制安装恶意的文件系统过滤驱动以隐藏文件或目录。

```windbg
dq nt!FsNotificationListHead L<count>
```

```windbg
!filters
```

```powershell
fltmc instances
```

```powershell
fltmc filters
```

### 2.8 回调注册表完整性校验

在取证分析中，必须对所有已注册的回调进行完整性校验，确保每个回调函数指针指向有效的、已签名的驱动代码段。以下是校验流程：

```windbg
.foreach (addr { dq nt!PspCreateProcessNotifyRoutine L<count> }) { lm m addr }
```

```python
import volatility3.framework
from volatility3.framework import interfaces, symbols
from volatility3.framework.layers import intel

def enumerate_callbacks(context, config):
    layer_name = context.config['Intel32e.layer_name']
    kernel_symbol_space = context.config['Intel32e.symbol_files']

    ntoskrnl = context.modules[kernel_symbol_space]

    psp_create_process_notify_routine = ntoskrnl.get_symbol("nt!PspCreateProcessNotifyRoutine")
    psp_create_process_notify_routine_count = ntoskrnl.get_symbol("nt!PspCreateProcessNotifyRoutineCount")

    layer = context.layers[layer_name]

    count = layer.read(psp_create_process_notify_routine.address, 4)
    count_value = int.from_bytes(count, byteorder='little')

    callbacks = []
    for i in range(count_value):
        entry_addr = psp_create_process_notify_routine.address + (i * 8)
        entry_data = layer.read(entry_addr, 8)
        callback_addr = int.from_bytes(entry_data, byteorder='little')
        callback_addr &= ~0xF
        callbacks.append(callback_addr)

    return callbacks
```

---

## 0x03 DKOM技术原理与链表篡改检测

### 3.1 DKOM基本原理

DKOM（Direct Kernel Object Manipulation，直接内核对象操纵）是一种高级Rootkit技术，通过直接修改内核内存中的数据结构来隐藏进程、线程、驱动模块、网络连接和其他系统资源。与传统的钩子（Hook）技术不同，DKOM不修改任何代码路径，而是操纵数据——通过断开双向链表中的节点来实现隐藏，这种方式更难被检测。

DKOM的核心操作包括：

| 操作类型 | 目标数据结构 | 攻击效果 | 检测难度 |
|---------|------------|---------|---------|
| 进程脱链 | EPROCESS ActiveProcessLinks | 隐藏进程（任务管理器不可见） | 中（需对比多种枚举方式） |
| 线程脱链 | ETHREAD ThreadListHead | 隐藏线程 | 高（需遍历进程线程链表） |
| 驱动脱链 | DRIVER_OBJECT DriverList | 隐藏已加载驱动 | 高（需对比注册表与内存） |
| 网络连接脱链 | TCPEXTENSION/UDPEXTENSION | 隐藏网络连接 | 中（需对比活跃连接与端口） |
| 注册表键脱链 | KEY_OBJECT | 隐藏注册表键 | 高（需原始注册表hive分析） |
| 对象类型替换 | OBJECT_TYPE | 修改对象行为 | 极高（需深度内核分析） |

### 3.2 EPROCESS/ETHREAD链表脱链检测

Windows内核通过双向链表管理所有活动进程。`PsActiveProcessHead` 是进程链表的头节点，每个EPROCESS结构体中的 `ActiveProcessLinks` 字段指向下一個进程。DKOM通过修改链表指针将恶意进程从活动进程链表中断开，从而对用户态工具隐藏该进程。

**正常的进程链表结构：**

```
PsActiveProcessHead → [EPROCESS_P1] → [EPROCESS_P2] → [EPROCESS_MALICIOUS] → [EPROCESS_P3] → PsActiveProcessHead
```

**DKOM脱链后的链表：**

```
PsActiveProcessHead → [EPROCESS_P1] → [EPROCESS_P2] → [EPROCESS_P3] → PsActiveProcessHead
                                          ↓
                                    [EPROCESS_MALICIOUS] (不在链表中，但内存结构完整)
```

**WinDbg检测方法：**

```windbg
!process 0 0
```

```windbg
!process 0 1
```

```windbg
!process <malicious_pid> 0
```

```windbg
dt nt!_EPROCESS ActiveProcessLinks
```

```windbg
dq PsActiveProcessHead
```

```windbg
.foreach (entry { dq PsActiveProcessHead L<count> }) { !process entry }
```

**Volatility 3 检测方法：**

```bash
vol -f memory.dmp windows.pslist
vol -f memory.dmp windows.pstree
vol -f memory.dmp windows.psscan
```

`pslist` 基于 `ActiveProcessLinks` 链表枚举进程，`psscan` 基于EPROCESS对象特征扫描内存。如果某个进程在 `psscan` 中出现但在 `pslist` 中不存在，则高度怀疑是DKOM脱链。

```python
import volatility3.framework
from volatility3.framework import interfaces
from volatility3.plugins.windows import pslist, psscan

def detect_dkom(context, config):
    pslist_plugin = pslist.PsList(context, config)
    psscan_plugin = psscan.PsScan(context, config)

    pslist_pids = set()
    for proc in pslist_plugin.list_processes():
        pslist_pids.add(proc.UniqueProcessId)

    psscan_pids = set()
    for proc in psscan_plugin.list_processes():
        psscan_pids.add(proc.UniqueProcessId)

    hidden_pids = psscan_pids - pslist_pids

    if hidden_pids:
        print(f"[DKOM ALERT] Hidden PIDs detected: {hidden_pids}")
        for pid in hidden_pids:
            for proc in psscan_plugin.list_processes():
                if proc.UniqueProcessId == pid:
                    print(f"  PID: {pid}, Name: {proc.ImageFileName}, CreateTime: {proc.CreateTime}")

    return hidden_pids
```

### 3.3 驱动对象链表篡改检测

攻击者还可以通过DKOM从驱动对象链表中移除恶意驱动的DRIVER_OBJECT，使其对 `lm`、`sc query` 和 `fltmc` 等命令不可见。

```windbg
lm m *
```

```windbg
!drvobj \Driver\* 2
```

```windbg
dq nt!PsDriverDriverList L<count>
```

**驱动隐藏的多源对比检测：**

| 枚举方式 | 数据来源 | 局限性 |
|---------|---------|--------|
| `lm m *` / Driver Verifier | 内核PsLoadedModuleList链表 | 可被DKOM脱链 |
| 注册表 `HKLM\SYSTEM\CurrentControlSet\Services` | 注册表配置单元 | 仅反映服务配置，不反映实际加载状态 |
| WinDbg `!drvobj` | DRIVER_OBJECT遍历 | 取决于遍历算法 |
| Volatility `driverscan` | 内存特征扫描 | 需要有效的驱动特征签名 |
| 原始物理内存扫描 | 字节模式匹配 | 误报率高 |

### 3.4 内核内存转储分析

内核内存转储是DKOM检测的核心数据来源。通过获取物理内存转储（使用WinPmem、DumpIt等工具）或内核崩溃转储（BSOD），分析人员可以离线检查内核数据结构的完整性。

```powershell
DumpIt.exe /OUTPUT memory.raw /NOKERNEL
```

```bash
sudo python3 volatility3/vol.py -f /dev/mem --profile=Win10x64_19041 windows.pslist
```

```bash
sudo python3 volatility3/vol.py -f /dev/mem --profile=Win10x64_19041 windows.netscan
```

**内核内存转储分析流程：**

| 步骤 | 操作 | 工具 | 关注点 |
|------|------|------|--------|
| 1 | 获取物理内存转储 | WinPmem / DumpIt | 确保采集完整性 |
| 2 | 加载内核符号 | WinDbg / Volatility | 匹配正确的OS版本 |
| 3 | 枚举所有进程 | pslist + psscan | 对比结果查找隐藏进程 |
| 4 | 枚举所有驱动 | driverscan + lm | 对比结果查找隐藏驱动 |
| 5 | 枚举网络连接 | netscan | 检查隐藏的网络连接 |
| 6 | 枚举回调注册表 | callbacks | 检查恶意回调注册 |
| 7 | 扫描内核池 | poolscanner | 检查隐藏的池分配 |
| 8 | 分析内核栈 | threads | 检查内核线程异常 |

### 3.5 增强型DKOM检测技术

传统DKOM检测依赖链表遍历，但高级攻击者可以实施更隐蔽的DKOM变种：

| DKOM变种 | 技术描述 | 检测方法 |
|---------|---------|---------|
| 对象池标记篡改 | 修改Pool Tag以隐藏分配 | 内核池扫描 |
| EPROCESS字段覆写 | 修改ImageFileName等字段 | EPROCESS完整性校验 |
| 类型索引混淆 | 篡改OBJECT_HEADER.TypeIndex | 对象类型枚举一致性检查 |
| 句柄表注入 | 在合法进程句柄表中注入恶意句柄 | 句柄表遍历 |
| 全局回调指针修改 | 覆写回调函数指针 | 回调函数地址验证 |
| 时间戳篡改 | 修改CreateTime/ExitTime | 多源时间线交叉对比 |

---

## 0x04 驱动签名策略绕过与加载取证

### 4.1 Driver Signature Enforcement（DSE）机制

Driver Signature Enforcement（驱动签名强制）是Windows Vista x64及后续版本引入的安全机制，要求所有内核模式驱动必须经过微软的数字签名才能加载。DSE通过代码完整性（Code Integrity）子系统实施，是防止未签名驱动加载的关键防线。

| DSE状态 | 注册表值 | 安全级别 | MITRE ATT&CK |
|---------|---------|---------|-------------|
| 完全启用（Enabled） | CI!g_CiOptions = 0x6 | 最高（仅允许WHQL签名驱动） | — |
| 测试签名模式 | CI!g_CiOptions = 0x1 | 低（允许测试签名驱动） | T1542.001 |
| 禁用 | CI!g_CiOptions = 0x0 | 无（允许任意驱动加载） | T1014 |
| 静默启用 | CI!g_CiOptions = 0x8 | 高（静默拒绝未签名驱动） | — |

### 4.2 DSE绕过技术

攻击者通过多种技术绕过驱动签名强制：

| 绕过技术 | 原理 | 检测方法 | MITRE ATT&CK |
|---------|------|---------|-------------|
| 漏洞驱动利用 | 利用已签名但存在漏洞的驱动执行内核代码 | Sysmon DriverLoad事件 | T1068 |
| Hypervisor级绕过 | 通过虚拟化层禁用CI检查 | VBS/HVCI配置审计 | T1068 |
| WinPEKit / TDL4 | Bootkit级别绕过 | MBR/VBR完整性检查 | T1014 |
| 测试签名模式 | 启用bcdedit /set testsigning on | bcdedit检查 | T1542.001 |
| UEFI Rootkit | 修改UEFI固件绕过Secure Boot | UEFI固件审计 | T1542.001 |
| Bring Your Own Vulnerable Driver (BYOVD) | 加载已签名的漏洞驱动后利用 | 已知漏洞驱动列表 | T1068 |

### 4.3 BYOVD漏洞驱动利用取证

BYOVD（Bring Your Own Vulnerable Driver）是近年来最流行的内核代码执行技术之一。攻击者加载一个具有合法签名但存在内核漏洞的驱动程序，然后利用该漏洞在内核中执行任意代码。

**常见被利用的漏洞驱动：**

| 驱动名称 | 漏洞CVE | 利用效果 | 攻击案例 |
|---------|---------|---------|---------|
| RTCore64.sys (MSI Afterburner) | CVE-2019-15702 | 内核读写原语 | BlackByte勒索软件 |
| gdrv.sys (GIGABYTE) | CVE-2018-19320 | 内核任意地址读写 | 数个APT组织 |
| PROCEXP.sys (Process Explorer) | CVE-2021-43220 | 内核任意代码执行 | 多个攻击活动 |
| Avast anti-rootkit driver | CVE-2024-30871 | 任意内核内存读写 | Avast修复通告 |
| DBUtil_2_3.sys (Dell) | CVE-2021-21551 | 内核任意内存操作 | AvosLocker勒索软件 |
| Winchester.sys | CVE-2021-37714 | 内核任意内存操作 | LockBit 3.0 |
| DSEnabler.sys | — | DSE禁用 | 黑产工具集 |

**驱动加载检测（Sysmon）：**

```xml
<Sysmon schemaversion="4.90">
  <EventFiltering>
    <DriverLoad onmatch="include">
      <Rule groupRelation="or">
        <Hash condition="is not">SHA256:KNOWN_GOOD_HASH</Hash>
        <Signed condition="is">false</Signed>
      </Rule>
    </DriverLoad>
  </EventFiltering>
</Sysmon>
```

```powershell
Get-WinEvent -LogName "Microsoft-Windows-Sysmon/Operational" | Where-Object { $_.Id -eq 6 } | Select-Object -First 30 | Format-List TimeCreated, Message
```

### 4.4 WDAC/Device Guard 绕过取证

Windows Defender Application Control (WDAC) 和 Device Guard 提供了比DSE更强的驱动加载控制——基于策略的白名单机制，只有明确允许的驱动才能加载。WDAC绕过通常需要先获取内核执行权限或利用策略配置缺陷。

| WDAC模式 | 控制范围 | 绕过难度 | 取证关注 |
|---------|---------|---------|---------|
| Audit模式 | 仅记录不阻止 | N/A（无阻止） | WDAC审计日志 |
| Enforce模式 | 阻止未授权代码 | 高 | 策略文件完整性 |
| HVCI模式 | 硬件强制代码完整性 | 极高 | VBS/HVCI配置 |

```powershell
Get-CimInstance -ClassName MSFT_WDACSIPolicy -Namespace root\Microsoft\Windows\DeviceGuard
```

```powershell
Get-ComputerInfo | Select-Object DeviceGuard*, HyperVisorPlatformSecurity*
```

### 4.5 驱动加载日志分析

Windows系统在驱动加载时会产生多种日志记录，是驱动取证的核心数据来源：

| 日志来源 | 事件ID | 内容 | 分析工具 |
|---------|--------|------|---------|
| Sysmon | Event ID 6 | 驱动加载、哈希、签名状态 | Splunk/ELK |
| Security | Event ID 6 | 内核驱动加载 | Windows Event Log |
| System | Event ID 7045 | 新服务安装 | Windows Event Log |
| CodeIntegrity | Event ID 3001/3002 | 代码完整性验证 | Windows Event Log |
| SetupAPI | setupapi.dev.log | 设备驱动安装日志 | 文件分析 |

```powershell
Get-WinEvent -LogName "Microsoft-Windows-CodeIntegrity/Operational" | Where-Object { $_.Id -in @(3001, 3002, 3004, 3010) } | Select-Object -First 20 | Format-List TimeCreated, Id, Message
```

---

## 0x05 Minifilter与文件系统微过滤取证

### 5.1 Minifilter架构概述

Minifilter（微过滤驱动）是Windows文件系统过滤驱动的推荐架构（自Windows Vista起），用于替代传统的Legacy过滤驱动。Minifilter通过FltRegisterFilter注册到I/O管理器的过滤管理器（Filter Manager，fltMgr.sys），在文件系统I/O路径的特定Altitude层级上执行文件操作拦截。

Minifilter的典型应用场景包括：防病毒实时文件扫描、数据防泄漏（DLP）文件访问控制、文件加密/压缩过滤、审计日志记录。然而，恶意Minifilter也被Rootkit用于隐藏文件和目录、拦截文件操作、窃取文件内容。

### 5.2 Altitude层级分析

每个Minifilter通过Altitude编号确定其在过滤链中的位置。Altitude值越大，越靠近用户态应用层；值越小，越靠近文件系统驱动层。

| Altitude范围 | 驱动类型 | 示例 | 取证关注 |
|-------------|---------|------|---------|
| 400000 - 499999 | FsFilter（防病毒） | Avast、Kaspersky | 高优先级过滤 |
| 320000 - 329999 | 反恶意软件 | Malwarebytes | 恶意软件检测 |
| 260000 - 269999 | 内容扫描 | Sophos | 文件内容检查 |
| 140000 - 149999 | 系统监控 | Process Monitor | I/O监控 |
| 130000 - 139999 | 策略执行 | — | 策略过滤 |
| 100000 - 109999 | 可靠性 | — | 可靠性保障 |
| 最底层 | 筛选器 | — | 最早拦截 |

**列举所有已注册Minifilter：**

```powershell
fltmc instances
```

```powershell
fltmc filters
```

```powershell
fltmc volumes
```

```powershell
Get-WmiObject Win32_SystemDriver | Where-Object { $_.PathName -like "*fltMgr*" }
```

**WinDbg分析：**

```windbg
!filter
```

```windbg
!filters
```

```windbg
dt nt!_FLTMGR_GLOBALS
```

### 5.3 恶意Minifilter检测

恶意Minifilter的检测需要从多个维度进行分析：

| 检测维度 | 方法 | 工具 |
|---------|------|------|
| Altitude合法性 | 检查Altitude是否在已知范围内 | fltmc、注册表 |
| 驱动签名状态 | 验证驱动数字签名 | sigcheck、Get-AuthenticodeSignature |
| 回调函数注册 | 分析注册的IRP/MJ回调 | WinDbg !drvobj |
| 文件操作行为 | 监控实际文件操作过滤行为 | Process Monitor |
| 注册表持久化 | 检查HKLM\SYSTEM\CurrentControlSet\Control\Class\{4D36E967...} | 注册表分析 |
| 内存中的Minifilter结构 | 遍历FLT_GLOBAL列表 | Volatility/WinDbg |

**恶意Minifilter特征：**

| 特征 | 合法Minifilter | 恶意Minifilter |
|------|---------------|---------------|
| 签名状态 | 有效WHQL/EV签名 | 无签名或自签名 |
| Altitude分配 | 在标准Altitude范围内 | 使用非标准Altitude |
| 回调完整性 | 注册所有必要回调 | 仅注册少量回调用于隐藏 |
| 驱动服务配置 | 标准启动类型 | 手动启动或隐藏服务 |
| 卸载行为 | 正常卸载 | 无法卸载或卸载后重新注册 |

### 5.4 文件操作过滤链分析

Minifilter通过注册Pre/Post回调函数拦截IRP（I/O Request Packet）操作。攻击者可以通过以下方式利用Minifilter：

| 利用方式 | 目标 | 技术细节 |
|---------|------|---------|
| 文件隐藏 | IRP_MJ_DIRECTORY_CONTROL | 在查询目录结果中过滤特定文件名 |
| 文件内容窃取 | IRP_MJ_READ/IRP_MJ_WRITE | 拦截文件读写操作并复制内容 |
| 文件访问拒绝 | IRP_MJ_CREATE | 拒绝对特定文件的打开请求 |
| 文件替换 | IRP_MJ_WRITE | 将文件写入重定向到其他位置 |
| 加密隐藏 | IRP_MJ_READ | 实时解密加密文件内容 |

```windbg
!drvobj \Driver\YourMinifilter 2
```

```windbg
dt nt!_FLT_OPERATION_REGISTRATION
```

```python
import volatility3.framework
from volatility3.framework.objects import Pointer, Object
from volatility3.framework.symbols import intel

def enumerate_minifilters(context, config):
    layer_name = config['Intel32e.layer_name']
    ntoskrnl = context.modules['ntkrnlmp.pdb']

    flt_globals_addr = ntoskrnl.get_symbol("nt!FltMgrGlobals")

    layer = context.layers[layer_name]

    flt_globals = layer.read(flt_globals_addr, 0x100)

    print("[*] Enumerating Minifilter instances from memory...")
    print("[*] Use 'fltmc instances' for user-space enumeration comparison")
```

### 5.5 FltRegisterFilter取证要点

`FltRegisterFilter` 是Minifilter的注册入口函数。取证分析中需要重点关注：

| 取证要素 | 分析方法 | 关注点 |
|---------|---------|--------|
| 过滤器注册信息 | WinDbg断点或回调枚举 | FLT_REGISTRATION结构体内容 |
| 操作回调表 | 分析FLT_OPERATION_REGISTRATION | 哪些IRP被拦截 |
| 上下文分配 | FLT_CONTEXT注册信息 | 是否分配了异常的上下文缓冲区 |
| 卸载例程 | FilterUnload回调 | 是否注册了有效的卸载例程 |
| 版本兼容性 | FLT_OPERATION_REGISTRATION_VERSION | 是否使用过时的API版本 |

---

## 0x06 内核对象完整性验证与检测

### 6.1 Object Manager目录遍历

Windows内核的Object Manager维护了一个层次化的命名空间（Object Namespace），用于管理系统中的所有内核对象。通过枚举Object Manager目录，可以发现隐藏的设备对象、符号链接和其他内核对象。

```windbg
!obj \Device
```

```windbg
!obj \Driver
```

```windbg
!obj \ObjectTypes
```

```windbg
!obj \GLOBAL??
```

```powershell
Get-WmiObject Win32_Device
```

**Object Manager目录结构与取证关注：**

| 目录路径 | 内容 | 取证关注 |
|---------|------|---------|
| `\Device\` | 设备对象 | 隐藏设备、恶意设备 |
| `\Driver\` | 驱动对象 | 隐藏驱动、恶意驱动 |
| `\ObjectTypes\` | 对象类型定义 | 类型索引篡改 |
| `\GLOBAL??` | DOS设备符号链接 | 设备重定向 |
| `\Sessions\` | 会话命名空间 | 会话隔离逃逸 |
| `\BaseNamedObjects\` | 命名对象 | 恶意命名对象 |
| `\Callback\` | 回调对象 | 恶意回调注册 |

### 6.2 内核对象类型枚举

每个内核对象都有一个关联的类型对象（OBJECT_TYPE），定义了该类型对象的大小、方法和操作表。攻击者可能通过替换或修改类型对象来改变内核对象的行为。

```windbg
dt nt!_OBJECT_TYPE
```

```windbg
!object \ObjectTypes
```

```windbg
dt nt!_OBJECT_TYPE_INITIALIZER
```

**对象类型完整性校验：**

| 校验维度 | 方法 | 异常指标 |
|---------|------|---------|
| 类型数量 | 枚举\ObjectTypes下所有类型 | 出现未知类型 |
| 对象大小 | 对比OBJECT_TYPE.ObjectSize | 大小不匹配 |
| 方法表 | 检查ObjectTypeInitializer | 方法指针被替换 |
| 类型索引 | 检查OBJECT_HEADER.TypeIndex | 索引指向错误类型 |

### 6.3 Token对象篡改检测

Access Token是Windows安全模型的核心组件，决定了进程和线程的权限。攻击者通过DKOM篡改Token对象实现权限提升——将恶意进程的Token替换为SYSTEM进程的Token。

```windbg
!token -n
```

```windbg
!token <address>
```

```windbg
dt nt!_TOKEN
```

```windbg
.process /p <system_pid>
```

```windbg
dt nt!_EPROCESS Token
```

**Token篡改检测方法：**

| 检测方法 | 描述 | 可靠性 |
|---------|------|--------|
| Token值对比 | 比较不同进程的Token指针值 | 高 |
| Token SID验证 | 检查Token中的用户SID是否匹配进程预期 | 高 |
| Token引用计数 | 检查Token对象的引用计数是否异常 | 中 |
| 进程-Token映射 | 遍历所有进程验证Token归属 | 高 |
| Privileges检查 | 检查Token的特权列表是否异常 | 中 |

```python
import volatility3.framework
from volatility3.plugins.windows import pslist, tokens

def detect_token_tampering(context, config):
    pslist_plugin = pslist.PsList(context, config)
    tokens_plugin = tokens.Tokens(context, config)

    token_refs = {}
    for proc in pslist_plugin.list_processes():
        token = proc.Token
        token_addr = token.vol.offset

        if token_addr in token_refs:
            token_refs[token_addr].append(proc.UniqueProcessId)
        else:
            token_refs[token_addr] = [proc.UniqueProcessId]

    suspicious = {}
    for token_addr, pids in token_refs.items():
        if len(pids) > 1:
            token_obj = context.object(
                "nt!_TOKEN",
                layer_name=config['Intel32e.layer_name'],
                offset=token_addr
            )
            user_sid = token_obj.UserAndGroups.dereference()
            suspicious[token_addr] = {
                "pids": pids,
                "user": str(token_obj.User),
                "elevation": token_obj.Elevation
            }

    return suspicious
```

### 6.4 内核回调注册表完整性验证

所有内核回调的注册信息存储在内核全局变量中。通过定期检查这些全局变量，可以发现异常的回调注册或回调函数指针被篡改。

```windbg
.foreach (callback { dq nt!PspCreateProcessNotifyRoutine L<callback_count> }) { lm m callback }
```

```windbg
.foreach (callback { dq nt!PspLoadImageNotifyRoutine L<callback_count> }) { lm m callback }
```

```windbg
.foreach (callback { dq nt!PspCreateThreadNotifyRoutine L<callback_count> }) { lm m callback }
```

**回调完整性校验表：**

| 回调类型 | 全局变量名 | 校验方法 | 异常判定 |
|---------|-----------|---------|---------|
| 进程创建 | PspCreateProcessNotifyRoutine | 函数指针→模块归属 | 指针指向未加载模块区域 |
| 线程创建 | PspCreateThreadNotifyRoutine | 函数指针→模块归属 | 同上 |
| 映像加载 | PspLoadImageNotifyRoutine | 函数指针→模块归属 | 同上 |
| 注册表操作 | CmpCallbackVector | 函数指针→模块归属 | 同上 |
| 对象操作 | ObpCallbackListHead | 函数指针→模块归属 | 同上 |
| 文件系统 | FsNotificationListHead | 驱动对象关联 | 未识别的过滤驱动 |

### 6.5 IOAPIC/MSR异常检测

高级Rootkit可能通过修改I/O APIC（高级可编程中断控制器）重定向表项或Model-Specific Registers（MSR）来拦截系统调用或实现隐秘的监控通道。

```windbg
!ioapic
```

```windbg
rdmsr 0x1d9
```

```windbg
rdmsr 0xc0000080
```

| 检测目标 | 正常值 | 异常值 | 检测方法 |
|---------|--------|--------|---------|
| SYSENTER_CS (MSR 0x174) | 0x0000000000000008 | 被重定向到恶意代码段 | rdmsr比较 |
| SYSENTER_EIP (MSR 0x176) | 指向KiSystemCall64 | 指向非ntoskrnl地址 | rdmsr + lm交叉验证 |
| SYSENTER_ESP (MSR 0x175) | 合理的内核栈地址 | 异常地址 | rdmsr检查 |
| IA32_EFER (MSR 0xC0000080) | 正常SCE/LME/LMA位 | 异常标志位 | rdmsr位域分析 |
| IOAPIC重定向表 | 合理的中断目标CPU | 被重定向到异常CPU | !ioapic逐项检查 |

---

## 0x07 证据强度分层与案例关联

### 7.1 证据分层框架

在内核取证分析中，不同类型的证据具有不同的可信度和证明力。建立证据分层框架有助于分析人员对发现进行分级评估：

| 证据级别 | 标记 | 定义 | 典型证据类型 |
|---------|------|------|------------|
| Level 1 | 🔴 确认恶意 | 有明确恶意意图和行为的直接证据 | DKOM脱链的进程在其他枚举方式中不可见+该进程具有已知恶意hash |
| Level 2 | 🟡 高度可疑 | 强烈暗示恶意活动但需进一步验证 | 未签名驱动加载+回调函数指针指向非已知驱动区域 |
| Level 3 | 🟢 需要关注 | 可能为正常行为但需结合上下文判断 | 新注册的内核回调但注册者为已知安全产品驱动 |

### 7.2 DKOM检测证据分层

| 证据发现 | 证据级别 | 说明 | 后续动作 |
|---------|---------|------|---------|
| psscan发现隐藏进程，该进程文件hash匹配已知恶意样本 | 🔴 确认恶意 | 确认DKOM隐藏+恶意代码=内核级恶意活动 | 立即隔离、全盘取证 |
| ActiveProcessLinks链表不一致，但隐藏进程为合法系统进程 | 🟡 高度可疑 | 可能是合法进程或高级DKOM伪装 | 深度分析进程Token、网络连接、文件句柄 |
| 驱动加载列表与注册表服务列表不完全匹配 | 🟡 高度可疑 | 可能是驱动DKOM或正常的动态加载 | 检查缺失驱动的签名和功能 |
| 多个回调注册表存在，但回调函数均指向已知安全产品 | 🟢 需要关注 | 正常的安全产品注册行为 | 记录并定期审计 |
| 对象类型数量与已知类型数量有微小差异 | 🟢 需要关注 | 可能是OS更新或恶意类型注入 | 对比标准基线 |

### 7.3 驱动签名绕过证据分层

| 证据发现 | 证据级别 | 说明 | 后续动作 |
|---------|---------|------|---------|
| Sysmon记录到未签名驱动加载+该驱动hash匹配已知漏洞驱动 | 🔴 确认恶意 | BYOVD攻击确认 | 分析漏洞利用链、提取内存镜像 |
| CodeIntegrity事件记录签名验证失败但驱动仍被加载 | 🔴 确认恶意 | DSE被绕过 | 检查CI!g_CiOptions值 |
| 测试签名模式被启用 | 🟡 高度可疑 | 可能用于加载未签名驱动 | 检查最近安装的测试签名驱动 |
| 已知安全驱动加载，但Altitude配置异常 | 🟢 需要关注 | 配置问题或兼容性调整 | 验证配置意图 |
| 驱动签名有效但证书即将过期 | 🟢 需要关注 | 正常的证书生命周期管理 | 记录并提醒更新 |

### 7.4 Minifilter证据分层

| 证据发现 | 证据级别 | 说明 | 后续动作 |
|---------|---------|------|---------|
| 非已知的Minifilter注册+Altitude在140000-149999范围+无有效签名 | 🔴 确认恶意 | 可能是文件隐藏Rootkit | 禁用并提取驱动样本 |
| Minifilter注册信息中回调函数不完整 | 🟡 高度可疑 | 部分功能可能被隐藏 | 深度分析驱动代码 |
| 已知AV产品的Minifilter但Altitude与其他AV产品冲突 | 🟡 高度可疑 | 可能是恶意驱动伪装为AV产品 | 验证驱动签名和路径 |
| Minifilter服务为手动启动模式 | 🟢 需要关注 | 可能是残留的调试配置 | 检查安装历史 |

### 7.5 Token篡改证据分层

| 证据发现 | 证据级别 | 说明 | 后续动作 |
|---------|---------|------|---------|
| 普通用户进程的Token指向SYSTEM Token | 🔴 确认恶意 | 权限提升的直接证据 | 追溯Token替换方法 |
| 多个进程共享异常的Token引用计数 | 🟡 高度可疑 | 可能存在Token操纵 | 分析Token创建来源 |
| Token中的PrivilegeList包含SeDebugPrivilege但进程非调试工具 | 🟢 需要关注 | 可能是合法的调试工具配置 | 验证进程身份和功能 |

---

## 0x08 自动化检测与狩猎

### 8.1 Sigma检测规则

```yaml
title: Suspicious Kernel Callback Registration
id: 7a4b8c2d-1e3f-4a5b-9c6d-2f8e7a1b3c5d
status: experimental
description: Detects suspicious kernel callback registrations that may indicate rootkit activity
references:
  - https://attack.mitre.org/techniques/T1014/
  - https://attack.mitre.org/techniques/T1055/
author: x7peeps
date: 2026/07/13
modified: 2026/07/13
tags:
  - attack.defense_evasion
  - attack.persistence
  - attack.privilege_escalation
  - attack.t1014
  - attack.t1055
logsource:
  product: windows
  service: sysmon
detection:
  selection_driver_load:
    EventID: 6
    Signed: "false"
  selection_driver_load_unsigned_detail:
    EventID: 6
    SignatureStatus: "Unsigned"
  selection_service_install:
    EventID: 7045
    ServiceType: "kernel mode driver"
  selection_code_integrity:
    EventID: 3001
  condition: selection_driver_load | selection_service_install | selection_code_integrity
falsepositives:
  - Legitimate driver updates from vendor
  - Custom in-house drivers during development
level: high
```

```yaml
title: Potential DKOM Process Hiding
id: 9f3e2d1c-4b5a-8e7f-0a1b-2c3d4e5f6a7b
status: experimental
description: Detects potential DKOM-based process hiding by comparing multiple process enumeration methods
references:
  - https://attack.mitre.org/techniques/T1014/
author: x7peeps
date: 2026/07/13
tags:
  - attack.defense_evasion
  - attack.t1014
logsource:
  product: windows
  service: sysmon
detection:
  selection_process_create:
    EventID: 1
  selection_driver_load:
    EventID: 6
    Signed: "false"
  selection_network_connection:
    EventID: 3
  condition: selection_driver_load and selection_network_connection
falsepositives:
  - Network monitoring tools with kernel drivers
level: critical
```

### 8.2 PowerShell检测脚本

```powershell
function Get-KernelCallbackAudit {
    [CmdletBinding()]
    param()

    $results = @()

    Write-Host "[*] Enumerating kernel modules via DriverQuery..." -ForegroundColor Cyan
    $drivers = driverquery /v /fo csv | ConvertFrom-Csv
    Write-Host "[+] Found $($drivers.Count) loaded drivers" -ForegroundColor Green

    Write-Host "[*] Enumerating driver services from registry..." -ForegroundColor Cyan
    $servicePath = "HKLM:\SYSTEM\CurrentControlSet\Services"
    $driverServices = Get-ChildItem $servicePath | Where-Object {
        (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).Type -eq 1
    }
    Write-Host "[+] Found $($driverServices.Count) driver services" -ForegroundColor Green

    Write-Host "[*] Checking for unsigned drivers..." -ForegroundColor Cyan
    foreach ($driver in $drivers) {
        $driverPath = $driver.'Module Path'
        if (Test-Path $driverPath) {
            $sig = Get-AuthenticodeSignature $driverPath
            if ($sig.Status -ne "Valid") {
                $results += [PSCustomObject]@{
                    Driver    = $driver.Module
                    Path      = $driverPath
                    Status    = $sig.Status
                    Signer    = $sig.SignerCertificate.Subject
                    Threat    = "UNSIGNED_DRIVER"
                    Severity  = "HIGH"
                }
                Write-Host "[!] UNSIGNED: $($driver.Module) at $driverPath" -ForegroundColor Red
            }
        }
    }

    Write-Host "[*] Checking for driver discrepancies..." -ForegroundColor Cyan
    $loadedDrivers = $drivers | ForEach-Object { $_.Module -replace "\.sys$", "" }
    $serviceNames = $driverServices | ForEach-Object { $_.PSChildName }

    $missingFromLoad = $serviceNames | Where-Object { $_ -notin $loadedDrivers }
    foreach ($missing in $missingFromLoad) {
        $svcProps = Get-ItemProperty "$servicePath\$missing" -ErrorAction SilentlyContinue
        if ($svcProps.Start -eq 0) {
            $results += [PSCustomObject]@{
                Driver    = $missing
                Path      = $svcProps.ImagePath
                Status    = "ServiceExists_NotLoaded"
                Signer    = "N/A"
                Threat    = "DKOM_SUSPECT"
                Severity  = "MEDIUM"
            }
            Write-Host "[?] $missing exists as service but not in loaded modules" -ForegroundColor Yellow
        }
    }

    Write-Host "`n[*] Checking Sysmon driver load events..." -ForegroundColor Cyan
    try {
        $sysmonEvents = Get-WinEvent -LogName "Microsoft-Windows-Sysmon/Operational" -MaxEvents 200 -ErrorAction SilentlyContinue |
            Where-Object { $_.Id -eq 6 }
        foreach ($event in $sysmonEvents) {
            $xml = [xml]$event.ToXml()
            $signed = $xml.Event.EventData.Data | Where-Object { $_.Name -eq "Signed" }
            $driverLoaded = $xml.Event.EventData.Data | Where-Object { $_.Name -eq "ImageLoaded" }
            if ($signed -and $signed."#text" -eq "false") {
                $results += [PSCustomObject]@{
                    Driver    = [System.IO.Path]::GetFileName($driverLoaded."#text")
                    Path      = $driverLoaded."#text"
                    Status    = "SysmonReportedUnsigned"
                    Signer    = "N/A"
                    Threat    = "SYSMON_UNSIGNED"
                    Severity  = "HIGH"
                }
                Write-Host "[!] Sysmon: Unsigned driver loaded: $($driverLoaded."#text")" -ForegroundColor Red
            }
        }
    } catch {
        Write-Host "[-] Sysmon not available or access denied" -ForegroundColor Yellow
    }

    Write-Host "`n[*] Checking Minifilter instances..." -ForegroundColor Cyan
    try {
        $minifilters = fltmc instances 2>$null
        Write-Host $minifilters -ForegroundColor Gray
    } catch {
        Write-Host "[-] fltmc not available" -ForegroundColor Yellow
    }

    Write-Host "`n[*] Checking for test signing mode..." -ForegroundColor Cyan
    $bcd = bcdedit /enum {current} 2>$null
    if ($bcd -match "testsigning\s+Yes") {
        $results += [PSCustomObject]@{
            Driver    = "SYSTEM"
            Path      = "bcdedit"
            Status    = "TestSigningEnabled"
            Signer    = "N/A"
            Threat    = "DSE_BYPASS"
            Severity  = "CRITICAL"
        }
        Write-Host "[!!!] TEST SIGNING MODE IS ENABLED!" -ForegroundColor Red
    }

    if ($results.Count -gt 0) {
        Write-Host "`n[*] Generating report..." -ForegroundColor Cyan
        $results | Format-Table -AutoSize
        $results | Export-Csv -Path "kernel_audit_$(Get-Date -Format 'yyyyMMdd_HHmmss').csv" -NoTypeInformation
        Write-Host "[+] Report saved" -ForegroundColor Green
    } else {
        Write-Host "`n[+] No suspicious kernel findings detected" -ForegroundColor Green
    }

    return $results
}

Get-KernelCallbackAudit
```

### 8.3 Bash检测脚本（Linux端远程分析）

```bash
#!/usr/bin/env bash

set -euo pipefail

OUTPUT_DIR="kernel_forensics_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUTPUT_DIR"

echo "[*] Windows Kernel Forensics Remote Collector"
echo "[*] Output directory: $OUTPUT_DIR"

collect_driver_info() {
    echo "[*] Collecting driver information..."

    powershell.exe -Command "driverquery /v /fo csv" > "$OUTPUT_DIR/drivers.csv"

    powershell.exe -Command "
        Get-WmiObject Win32_SystemDriver |
        Select-Object Name, DisplayName, PathName, State, StartMode, ServiceType |
        ConvertTo-Csv -NoTypeInformation
    " > "$OUTPUT_DIR/system_drivers.csv"

    powershell.exe -Command "
        Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Services' |
        ForEach-Object {
            \$props = Get-ItemProperty \$_.PSPath -ErrorAction SilentlyContinue
            if (\$props.Type -eq 1) {
                [PSCustomObject]@{
                    Name = \$_.PSChildName
                    ImagePath = \$props.ImagePath
                    Start = \$props.Start
                    Group = \$props.Group
                }
            }
        } | ConvertTo-Csv -NoTypeInformation
    " > "$OUTPUT_DIR/driver_services.csv"

    echo "[+] Driver information collected"
}

collect_minifilter_info() {
    echo "[*] Collecting Minifilter information..."

    powershell.exe -Command "fltmc instances" > "$OUTPUT_DIR/minifilter_instances.txt"
    powershell.exe -Command "fltmc filters" > "$OUTPUT_DIR/minifilter_filters.txt"
    powershell.exe -Command "fltmc volumes" > "$OUTPUT_DIR/minifilter_volumes.txt"

    echo "[+] Minifilter information collected"
}

collect_signature_audit() {
    echo "[*] Auditing driver signatures..."

    powershell.exe -Command "
        \$drivers = driverquery /fo csv | ConvertFrom-Csv
        foreach (\$d in \$drivers) {
            \$path = \$d.'Module Path'
            if (Test-Path \$path) {
                \$sig = Get-AuthenticodeSignature \$path -ErrorAction SilentlyContinue
                [PSCustomObject]@{
                    Driver = \$d.Module
                    Path = \$path
                    Status = \$sig.Status
                    Signer = if (\$sig.SignerCertificate) { \$sig.SignerCertificate.Subject } else { 'N/A' }
                }
            }
        } | ConvertTo-Csv -NoTypeInformation
    " > "$OUTPUT_DIR/signature_audit.csv"

    echo "[+] Signature audit completed"
}

collect_event_logs() {
    echo "[*] Collecting kernel-related event logs..."

    powershell.exe -Command "
        Get-WinEvent -LogName 'Microsoft-Windows-Sysmon/Operational' -MaxEvents 500 -ErrorAction SilentlyContinue |
        Where-Object { \$_.Id -in @(6, 7, 22) } |
        Select-Object TimeCreated, Id, LevelDisplayName, Message |
        Format-List
    " > "$OUTPUT_DIR/sysmon_events.txt"

    powershell.exe -Command "
        Get-WinEvent -LogName 'Microsoft-Windows-CodeIntegrity/Operational' -MaxEvents 200 -ErrorAction SilentlyContinue |
        Select-Object TimeCreated, Id, Message |
        Format-List
    " > "$OUTPUT_DIR/codeintegrity_events.txt"

    powershell.exe -Command "
        Get-WinEvent -LogName System -MaxEvents 1000 -ErrorAction SilentlyContinue |
        Where-Object { \$_.Id -eq 7045 } |
        Select-Object TimeCreated, Message |
        Format-List
    " > "$OUTPUT_DIR/service_install_events.txt"

    echo "[+] Event logs collected"
}

collect_bcdedit_info() {
    echo "[*] Checking boot configuration..."

    powershell.exe -Command "bcdedit /enum all" > "$OUTPUT_DIR/bcdedit_all.txt"
    powershell.exe -Command "bcdedit /enum {current}" > "$OUTPUT_DIR/bcdedit_current.txt"

    echo "[+] Boot configuration collected"
}

compare_driver_sources() {
    echo "[*] Comparing driver sources for DKOM detection..."

    powershell.exe -Command "
        \$loaded = (driverquery /fo csv | ConvertFrom-Csv).'Module Name' | Sort-Object
        \$services = Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Services' |
            Where-Object { (Get-ItemProperty \$_.PSPath -ErrorAction SilentlyContinue).Type -eq 1 } |
            ForEach-Object { \$_.PSChildName -replace '\.sys\$','' } | Sort-Object

        Write-Host '=== Loaded but not in services ==='
        \$loaded | Where-Object { \$_ -notin \$services }

        Write-Host '=== In services but not loaded ==='
        \$services | Where-Object { \$_ -notin \$loaded }
    " > "$OUTPUT_DIR/driver_comparison.txt"

    echo "[+] Driver source comparison completed"
}

main() {
    collect_driver_info
    collect_minifilter_info
    collect_signature_audit
    collect_event_logs
    collect_bcdedit_info
    compare_driver_sources

    echo "[*] Packing results..."
    tar -czf "${OUTPUT_DIR}.tar.gz" "$OUTPUT_DIR"
    echo "[+] Results packaged: ${OUTPUT_DIR}.tar.gz"
    echo "[+] Collection complete"
}

main "$@"
```

### 8.4 Python内核回调分析脚本

```python
import struct
import sys
import json
from datetime import datetime

class KernelCallbackAnalyzer:

    CALLBACK_TYPES = {
        "PspCreateProcessNotifyRoutine": "Process Creation",
        "PspCreateThreadNotifyRoutine": "Thread Creation",
        "PspLoadImageNotifyRoutine": "Image Load",
        "CmpCallbackVector": "Registry Operation",
        "ObpCallbackListHead": "Object Operation",
        "FsNotificationListHead": "Filesystem Registration"
    }

    KNOWN_DRIVERS = {
        "ntoskrnl.exe": "Windows Kernel",
        "hal.dll": "Hardware Abstraction Layer",
        "fltmgr.sys": "Filter Manager",
        "CI.dll": "Code Integrity",
        "mssecex.sys": "Microsoft Security",
        "wdboot.sys": "Windows Defender Boot",
        "WdFilter.sys": "Windows Defender Filter",
    }

    def __init__(self, memory_dump_path):
        self.memory_dump_path = memory_dump_path
        self.findings = []
        self.timestamps = []

    def analyze_callback_registry(self, callback_table, callback_count, callback_type):
        print(f"[*] Analyzing {callback_type} ({callback_count} registered callbacks)...")

        results = {
            "type": callback_type,
            "count": callback_count,
            "callbacks": [],
            "anomalies": []
        }

        for i in range(callback_count):
            entry_addr = callback_table + (i * 8)
            raw_data = self.read_memory(entry_addr, 8)
            if raw_data is None:
                results["anomalies"].append({
                    "address": hex(entry_addr),
                    "type": "READ_ERROR",
                    "severity": "HIGH"
                })
                continue

            callback_addr = struct.unpack("<Q", raw_data)[0]
            callback_addr &= ~0xF

            module_name = self.resolve_module(callback_addr)
            is_known = module_name in self.KNOWN_DRIVERS

            callback_info = {
                "index": i,
                "address": hex(callback_addr),
                "module": module_name,
                "known": is_known
            }
            results["callbacks"].append(callback_info)

            if not is_known:
                results["anomalies"].append({
                    "address": hex(callback_addr),
                    "type": "UNKNOWN_MODULE",
                    "severity": "HIGH",
                    "detail": f"Callback points to unknown module at {hex(callback_addr)}"
                })

        return results

    def read_memory(self, address, size):
        try:
            with open(self.memory_dump_path, 'rb') as f:
                f.seek(address)
                return f.read(size)
        except (IOError, OSError):
            return None

    def resolve_module(self, address):
        module_bases = {
            0xfffff80000000000: "ntoskrnl.exe",
            0xfffff80040000000: "hal.dll",
            0xfffff80041000000: "fltmgr.sys",
        }
        for base, name in module_bases.items():
            if base <= address < base + 0x01000000:
                return name
        return "UNKNOWN"

    def generate_report(self):
        report = {
            "analysis_time": datetime.now().isoformat(),
            "memory_dump": self.memory_dump_path,
            "findings": self.findings,
            "summary": {
                "total_anomalies": sum(len(f.get("anomalies", [])) for f in self.findings),
                "total_callbacks": sum(f.get("count", 0) for f in self.findings)
            }
        }
        return json.dumps(report, indent=2)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <memory_dump_path>")
        sys.exit(1)

    analyzer = KernelCallbackAnalyzer(sys.argv[1])
    print(f"[*] Memory dump: {sys.argv[1]}")
    print(f"[*] Use WinDbg or Volatility 3 to extract callback addresses first")
    print(f"[*] Example: vol -f {sys.argv[1]} windows.callbacks")
```

---

## 0x09 公开案例分析

### 9.1 Turla Snake Rootkit

Turla（又名 Snake、Uroburos、Waterbug）是被认为与俄罗斯联邦安全局（FSB）关联的高级APT组织，活跃时间超过20年。Snake是其最具标志性的内核级Rootkit工具，在全球多个国家级网络间谍活动中被广泛使用。

**攻击链描述：**

Turla Snake的攻击链呈现多层级纵深部署的特征。初始入侵通常通过钓鱼邮件或供应链攻击获得用户态立足点，随后通过Exploit Kit或内核漏洞（如CVE-2013-5065影响的Dxgkrnl.sys漏洞）提升至内核级别。一旦获取内核执行权限，Snake Rootkit通过以下步骤建立持久化和隐蔽通信：

| 阶段 | 技术手段 | MITRE ATT&CK |
|------|---------|-------------|
| 初始访问 | 钓鱼邮件 / 水坑攻击 | T1566.001 / T1189 |
| 权限提升 | Dxgkrnl.sys内核漏洞利用 | T1068 |
| 内核植入 | DKOM驱动加载、链表脱链 | T1014 / T1542.001 |
| 隐蔽通信 | HTTP/HTTPS + 自定义协议隧道 | T1572 |
| 横向移动 | Kerberos票据伪造 + Pass-the-Hash | T1550.002 / T1550.003 |
| 数据窃取 | DNS隧道 + 加密归档外传 | T1048.003 / T1074.002 |

**取证发现：**

Snake Rootkit的取证分析揭示了多层内核级隐蔽技术的叠加使用。分析人员在内存转储中发现了以下关键特征：

| 取证发现 | 技术细节 | 取证方法 |
|---------|---------|---------|
| EPROCESS链表篡改 | 恶意进程从ActiveProcessLinks脱链 | Volatility psscan vs pslist对比 |
| 驱动对象隐藏 | Snake驱动从PsLoadedModuleList脱链 | 驱动加载列表与注册表服务对比 |
| 内核回调滥用 | 注册PsSetCreateProcessNotifyRoutine回调 | 回调表遍历+函数指针验证 |
| 网络连接隐藏 | 自定义协议绕过TCPEXTENSION枚举 | 原始TCP连接状态表扫描 |
| Minifilter过滤 | 安装文件系统过滤驱动隐藏恶意文件 | fltmc + Altitude分析 |

**IOC（指标）：**

| IOC类型 | 具体内容 |
|---------|---------|
| 驱动文件 | `c:\windows\system32\drivers\iprip.sys`（伪装为合法驱动） |
| 注册表键 | `HKLM\SYSTEM\CurrentControlSet\Services\iprip` |
| 网络协议 | 自定义HTTP隧道协议，使用特定Cookie格式进行C2通信 |
| DNS查询 | 特定子域名模式（如 `<base32编码>.<C2域名>`） |
| 文件路径 | `%APPDATA%\Microsoft\<random>\` 下的加密配置文件 |
| 内存特征 | EPROCESS对象中特定的DKOM篡改痕迹 |

**经验教训：**

Snake Rootkit案例表明，国家级APT组织能够在内核级别建立近乎不可检测的持久化基础设施。防御方需要从以下方面加强能力：部署支持内核回调枚举的EDR产品并定期验证回调表完整性、实施WDAC/HVCI策略阻止未授权驱动加载、建立基于内存取证的定期巡检机制以检测DKOM行为、对网络流量进行深度协议分析以发现自定义隧道协议。

### 9.2 Equation Group DoublePulsar与Shadow Broker工具集

Equation Group（方程式组织）被广泛认为与美国国家安全局（NSA）的TAO（Tailored Access Operations）部门关联，其使用的工具集在2016-2017年被Shadow Broker组织公开泄露。DoublePulsar是其中最具代表性的内核级后门之一。

**攻击链描述：**

DoublePulsar采用内核级注入技术，通过SMB（Server Message Block）和RDP（Remote Desktop Protocol）协议的漏洞进行植入。与传统用户态后门不同，DoublePulsar直接在Windows内核空间中执行代码，利用Windows内核的内存管理机制实现隐蔽驻留。

| 阶段 | 技术手段 | MITRE ATT&CK |
|------|---------|-------------|
| 边界突破 | EternalBlue（SMB漏洞CVE-2017-0144） | T1203 |
| 内核植入 | DoublePulsar内核后门注入 | T1068 / T1014 |
| 内核驻留 | SMB回调函数劫持 | T1542.001 |
| 权限提升 | 内核级内存操作 | T1068 |
| 横向移动 | EternalRomance/EternalSynergy | T1210 |
| 后门维持 | 双协议后门（SMB + RDP） | T1505.003 |

**取证发现：**

DoublePulsar的取证分析需要深入SMB协议实现和内核驱动层面：

| 取证发现 | 技术细节 | 取证方法 |
|---------|---------|---------|
| SMB回调劫持 | `srv2.sys`（SMB服务驱动）中的IRP处理函数被篡改 | WinDbg分析srv2.sys数据段 |
| 内核内存注入 | 双重注入技术：先注入Shellcode到内核内存 | 内核内存转储分析 |
| 隐蔽通信 | 使用SMB Trans2请求中的特殊操作码进行C2通信 | 网络流量分析 |
| 回调表修改 | 篡改SMB驱动的Dispatch Table | 驱动对象IRP_MJ_FUNCTION表对比 |
| 进程隐藏 | 注入的用户进程通过DKOM从进程列表隐藏 | Volatility内存取证 |

**IOC（指标）：**

| IOC类型 | 具体内容 |
|---------|---------|
| 网络特征 | SMB Trans2请求中 `Setup` 字段值为 `0xE44` 或 `0xEBB` |
| 网络特征 | RDP请求中特定的 `Channel Defined Virtual Channel` 值 |
| 内存特征 | `srv2.sys` 中被修改的 `PerProcessorDispatchTable` |
| 文件特征 | 无文件落地（纯内存驻留） |
| 日志特征 | `Microsoft-Windows-SmbServer/Operational` 中的异常连接日志 |
| 内核特征 | `srv2.sys` 数据段中的异常指针 |

**经验教训：**

Equation Group工具集的泄露揭示了国家级内核级攻击工具的真实能力。关键教训包括：SMB和RDP等核心协议的内核驱动是高价值攻击目标，需要重点防护和监控；DoublePulsar等内核后门的无文件特性要求检测能力必须延伸到内核级别；基于网络流量的特征检测（如SMB操作码异常）是检测此类后门的有效手段；及时修补已知内核漏洞是阻止此类攻击的最有效防线。

### 9.3 案例对比分析

| 对比维度 | Turla Snake | Equation Group DoublePulsar |
|---------|-------------|--------------------------|
| 归属 | 俄罗斯FSB（疑似） | 美国NSA TAO（疑似） |
| 活跃时间 | 2003年至今 | 2001-2017年（泄露后暴露） |
| 攻击级别 | 内核Rootkit + 用户态组件 | 纯内核级后门 |
| 植入方式 | 内核漏洞利用 | 协议漏洞利用（SMB/RDP） |
| 持久化 | DKOM + 驱动服务 | 内核内存驻留（无文件） |
| 隐蔽通信 | 自定义隧道 + DNS | SMB/RDP协议复用 |
| 影响范围 | 多国政府和军事机构 | 全球关键基础设施 |
| 取证难度 | 极高（多层DKOM） | 极高（纯内核内存驻留） |

---

## 0x0A 参考资料

1. Microsoft. "Windows Kernel-Mode Drivers". https://learn.microsoft.com/en-us/windows-hardware/drivers/kernel/
2. Microsoft. "ObRegisterCallbacks routine". https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/wdm/nc-wdm-pregister_callbacks
3. Microsoft. "PsSetCreateProcessNotifyRoutine function". https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntddi/nf-ntddi-pssetcreateprocessnotifyroutine
4. Microsoft. "FltRegisterFilter function". https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/fltkernel/nf-fltkernel-fltregisterfilter
5. Microsoft. "Driver Signature Enforcement". https://learn.microsoft.com/en-us/windows-hardware/drivers/install/driver-signing
6. Microsoft. "Windows Defender Application Control (WDAC)". https://learn.microsoft.com/en-us/windows/security/operating-system-security/device-security/windows-defender-application-control/wdac
7. Gavrielyushchenko, A. "Direct Kernel Object Manipulation (DKOM) Detection". https://www.coresecurity.com/blog/direct-kernel-object-manipulation-dkom
8. Ligh, M. et al. "The Art of Memory Forensics: Detecting Malware and Threats in Windows, Linux, and Mac Memory". Wiley, 2014.
9. Krasnovsky, A. "Hunting for Rootkits with Volatility". https://www.volatilityfoundation.org/
10. SentinelOne. "Turla Group: From Snake to Kopiluwak". https://www.sentinelone.com/labs/turla-group-snake-to-kopiluwak/
11. CountUpon Security. "DoublePulsar: Detection and Analysis". https://countuponsecurity.com/2017/04/24/doublepulsar-detection-and-analysis/
12. Microsoft. "Protecting Windows Rootkits: Secure Boot and Measured Boot". https://learn.microsoft.com/en-us/windows/security/operating-system-security/device-security/secure-the-windows-10-operating-system
13. CrowdStrike. "BYOVD: Bring Your Own Vulnerable Driver". https://www.crowdstrike.com/blog/ bring-your-own-vulnerable-driver-beyondvd/
14. Microsoft. "Minifilter Design and Development Guide". https://learn.microsoft.com/en-us/windows-hardware/drivers/ifs/filter-manager-concepts
15. Google Project Zero. "Analysis of the Turla Group's Rootkit". https://googleprojectzero.blogspot.com/