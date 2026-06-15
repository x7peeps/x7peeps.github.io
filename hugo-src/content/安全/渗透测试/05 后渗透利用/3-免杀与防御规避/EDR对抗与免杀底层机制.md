---
title: "暗影随行：EDR对抗与免杀艺术(Bypass AV/AMSI)"
date: 2026-06-11T22:00:00+08:00
draft: false
weight: 10
---

# 暗影随行：EDR对抗与免杀艺术(Bypass AV/AMSI)

在十年前，杀毒软件（AV）主要依靠“特征码”和“黑名单”来查杀木马。那时候的免杀（Bypass）往往只需要加个壳（Packer）或者把特征字符串混淆一下就能轻松过关。

但在现代企业内网中，我们面对的是武装到牙齿的 **EDR（终端检测与响应系统）**。EDR 不再只看文件长什么样，而是像幽灵一样盯着程序在内存中的每一个动作：**它调用了什么系统 API？它向哪块内存注入了代码？它的线程在执行什么逻辑？**

本文将摒弃低级的字符串混淆，直击 Windows 操作系统的内核边缘，推演现代 EDR 的动态查杀机制，并探讨高级红队是如何利用 Direct Syscalls、反射式 DLL 注入以及 AMSI 盲化等技术，在 EDR 的眼皮底下跳舞的。

---

## 1. 现代 EDR 的“天眼”：API Hooking

要知道怎么免杀，必须先知道 EDR 是怎么“看”到你的恶意行为的。

当我们在 C/C++ 中调用 `VirtualAllocEx`（在目标进程申请内存）和 `WriteProcessMemory`（向目标进程写入 Shellcode）时，这些函数实际上是由 `kernel32.dll` 提供的。而 `kernel32.dll` 最终会调用更底层的 `ntdll.dll` 中的 `NtAllocateVirtualMemory`。

**EDR 的 Hook 机制推演：**
1.  EDR 软件在系统启动时，会将自己的动态链接库（DLL）强行注入到所有用户态进程的内存空间中。
2.  EDR 找到 `ntdll.dll` 中诸如 `NtAllocateVirtualMemory` 这样的敏感函数，将其开头的前几个字节机器码，强行修改为一个 `JMP`（跳转）指令。
3.  **结果**：当攻击者的木马调用这个 API 时，程序执行流会被那个 `JMP` 强行拐带到 EDR 的分析引擎中。EDR 仔细检查传入的参数（申请了多大内存？是不是 RXW 权限？），如果发现异常，立刻弹窗拦截并终止进程。

---

## 2. 撕裂天眼：Direct Syscalls (直接系统调用)

既然 EDR 在用户态的 `ntdll.dll` 里布下了天罗地网（Hook），那我们就**不走这条路了**。

### 2.1 Syscall 的本质
`ntdll.dll` 中的函数，实际上只做了一件事：把系统调用号（Syscall Number，比如 0x18）放入 `eax` 寄存器，然后执行一条特殊的汇编指令 `syscall`。
这条指令会让 CPU 的执行特权级从 Ring 3（用户态）瞬间切换到 Ring 0（内核态），由操作系统内核去完成真正的内存分配。

### 2.2 Direct Syscalls 攻击推演
攻击者不再调用 `kernel32.dll` 或 `ntdll.dll`。
而是直接在自己的木马代码中，嵌入纯汇编代码：

```assembly
; 以 NtAllocateVirtualMemory 为例
mov r10, rcx
mov eax, 0x18  ; 将系统调用号放入 eax
syscall        ; 直接陷入内核！
ret
```

**防守盲区**：因为攻击者直接在自己的代码里执行了 `syscall` 陷入内核，完全绕过了内存中被 EDR 篡改（Hook）过的 `ntdll.dll`。EDR 在用户态的监控瞬间变成了瞎子。

---

## 3. 内存中的幽灵：Reflective DLL Injection (反射式注入)

传统的后门木马是一个完整的 `.exe` 或 `.dll` 文件，落盘时极易被静态查杀，使用 `LoadLibrary` API 加载时也会触发文件系统过滤驱动的报警。

**反射式 DLL 注入（Reflective DLL Injection）** 是一种完全不需要文件落地的顶级内存加载技术。它是 Cobalt Strike 等高级 C2 工具的核心基石。

### 3.1 底层加载逻辑推演
普通的 DLL 是由 Windows 的 `PE Loader` 负责解析、分配内存并加载的。
反射式注入的核心是：**木马自带一个微型的、完全用代码实现的 PE Loader。**

1.  攻击者利用漏洞（如反序列化），将恶意 DLL 的二进制数据以字节流的形式直接打入目标进程的内存中。
2.  攻击者通过一小段启动代码（Bootstrap），把执行流引向 DLL 内部自带的那个 `ReflectiveLoader` 函数。
3.  `ReflectiveLoader` 开始在内存中“自我孵化”：
    *   解析自身的 PE 头。
    *   在内存中重新分配空间，把自己的各个段（Text, Data）搬运到正确的位置。
    *   修复导入表（IAT），处理重定位（Relocation）。
    *   最后，调用自己的 `DllMain`，恶意逻辑开始执行。

**致命隐蔽性**：由于没有调用系统的 `LoadLibrary`，这个 DLL 在操作系统的进程模块列表（PEB，进程环境块）中是**完全隐形**的。传统的杀软在遍历进程加载的模块时，根本看不见它的存在。

---

## 4. 盲化微软的守护神：AMSI Bypass

在后渗透中，攻击者极其依赖 PowerShell 或 C# (VBScript) 来执行无文件攻击。但微软在 Windows 10 引入了 **AMSI (Antimalware Scan Interface，反恶意软件扫描接口)**。

当你执行一段经过严重混淆的 PowerShell 脚本时，无论你怎么混淆，在脚本最终被解释器（如 `powershell.exe`）执行前，都会被解密成明文。
AMSI 的厉害之处在于，它会在这个**最终解密的瞬间**，将明文脚本内容拦截下来，发送给底层的杀毒软件（如 Windows Defender）进行扫描。

### 4.1 内存 Patch 盲化 AMSI
AMSI 的核心检查函数位于 `amsi.dll` 中的 `AmsiScanBuffer`。

**攻击推演 (Memory Patching)：**
1.  攻击者在执行恶意 PowerShell 脚本**之前**，先执行一小段前置脚本。
2.  这段前置脚本通过反射机制或 API 调用，找到当前进程内存中加载的 `amsi.dll`。
3.  定位到 `AmsiScanBuffer` 函数的入口地址。
4.  修改内存权限为可写（RWX），并**强行将该函数开头的几个字节修改为 `ret` 指令（机器码 `C3`）**，或者修改为永远返回错误码（如 `80070057`）。

**终局：**
当后续真正的恶意脚本开始执行时，PowerShell 依然会忠实地调用 `AmsiScanBuffer`。但由于这个函数已经被我们在内存中“阉割”了，它一被调用就立刻 `ret` 返回，并且告诉系统“扫描通过，没有威胁”。
至此，AMSI 彻底变成了形同虚设的摆设。

---

## 5. 免杀的终局

在 EDR 时代，免杀已经从简单的“躲避文件特征”，进化成了与操作系统底层机制（内存布局、系统调用、事件追踪 ETW）的全面战争。

高级红队不仅要精通 C/C++ 与汇编，更要比 EDR 厂商更懂操作系统的内核调度。而防守方（蓝队）也正在从用户态的 API Hooking，逐步向更深邃的内核层（如 ETW-Ti、内核驱动回调）演进。在这场没有硝烟的暗影随行中，对底层原理的敬畏与探索，才是制胜的唯一法则。
