---
title: "用户态内核态钩子与API劫持痕迹分析"
date: 2026-06-16T01:10:00+08:00
draft: false
weight: 200
description: "围绕用户态 API Hook、AMSI/ETW Patch、IAT/Inline Hook、进程注入与内核回调可见性，分析蓝队如何从主机证据识别劫持与规避行为。"
categories: ["应急响应", "取证分析"]
tags: ["API Hook", "AMSI", "ETW", "r77", "进程注入", "防御绕过"]
---

# 用户态内核态钩子与API劫持痕迹分析

钩子、Patch、Inline Hook、IAT 劫持这些词，在恶意代码分析里很常见，但到了应急现场，经常会被误解成“必须逆向样本才能分析”。实际上，蓝队在取证中并不一定要第一时间证明某个字节是否被改写，而是可以先回答更现实的问题：

- 有没有迹象表明攻击者在绕过 EDR 的用户态 Hook？
- 有没有迹象表明 PowerShell 的 AMSI / ETW 被 Patch？
- 有没有异常进程访问、异常调用栈、异常内存权限切换？
- 有没有合法进程被当成注入宿主？

这篇文章的重点，就是把“逆向里的 Hook 概念”翻译成“现场可排查的主机证据”。

---

## 0x01 先区分几种常见情况

### 1. 用户态 Hook

常见于：

- API Inline Hook
- IAT Hook
- `ntdll.dll`、`kernel32.dll`、`amsi.dll` 被修改

目的通常是：

- 隐藏恶意行为
- 绕过 EDR/AV
- 拦截系统调用或安全扫描

### 2. AMSI / ETW Patch

这是近几年最实用、最常见的对抗手法之一。

目的通常是：

- 让 PowerShell 或脚本宿主不再触发扫描
- 让 ETW 相关记录失真或缺失

### 3. 进程注入与无后备内存执行

本质上未必都是“Hook”，但常常和 Hook/Unhook 同时出现，例如：

- Process Hollowing
- Remote Thread
- Direct Syscall
- Unhooked NTDLL 后再注入

---

## 0x02 公开案例一：r77 rootkit 的 API Unhook + Process Hollowing

Elastic Security Labs 在 `r77 rootkit` 分析中明确指出：

- `r77` 是开源用户态 rootkit
- 会 Hook 关键 Windows API 来隐藏其他组件
- 其 stager 会先“完全 unhook” `NTDLL.dll` 和 `KERNEL32.dll`
- 再通过 PPID Spoofing 和 Process Hollowing 把服务模块注入合法进程
- 同时还会 Patch `AmsiScanBuffer` 绕过 AMSI

这个案例几乎把蓝队现场最关心的几种问题都串起来了：

- 为什么看起来是合法进程在跑
- 为什么某些脚本没被 AMSI 拦住
- 为什么 EDR 的用户态可见性突然下降

公开来源：

- Elastic Security Labs: [Elastic Security Labs steps through the r77 rootkit](https://www.elastic.co/security-labs/elastic-security-labs-steps-through-the-r77-rootkit)

---

## 0x03 公开案例二：PIKABOT 使用 Direct Syscall 绕过用户态 Hook

Elastic 在 2024 年的 PIKABOT 分析里指出：

- 其新版本使用来自无后备内存的 syscall
- 进程创建调用栈中缺少正常的 `KernelBase!CreateProcessInternalW` 和 `ntdll!NtCreateUserProcess`
- 目标是绕过 EDR 的用户态 Hook

这个案例特别适合蓝队，因为它告诉我们：

- 即使抓不到样本源码
- 只要调用栈“不像正常程序”
- 就已经是非常强的取证线索

公开来源：

- Elastic Security Labs: [PIKABOT, I choose you!](https://www.elastic.co/security-labs/pikabot-i-choose-you)

---

## 0x04 公开案例三：AMSI / ETW Patch 已经是公开流行手法

Unit 42 在 2025 年的异常样本分析里，提到某些样本会：

- Patch `AMSI`
- Patch `ETW`
- 在执行 .NET 载荷前先完成这些绕过动作

同时 Elastic 在 `Doubling Down` 文章里也明确把：

- `AMSI`
- `ETW`
- `VirtualProtect`
- `WriteProcessMemory`

这些 API 和 DLL 作为重点检测对象。

公开来源：

- Unit 42: [Off the Beaten Path: Recent Unusual Malware](https://unit42.paloaltonetworks.com/unusual-malware/)
- Elastic Security Labs: [Doubling Down: Detecting In-Memory Threats with Kernel ETW Call Stacks](https://www.elastic.co/security-labs/doubling-down-etw-callstacks)

---

## 0x05 现场最值得关注的主机迹象

### 1. 合法进程突然访问高价值目标进程

例如：

- 某个用户目录中的可执行文件访问 `lsass.exe`
- 某个刚落地的程序访问浏览器进程
- 某个 Office 子进程访问安全产品进程

### 2. 内存权限切换异常

重点模式：

- `VirtualAlloc`
- `VirtualProtect`
- `WriteProcessMemory`
- `SetThreadContext`
- `QueueUserAPC`

### 3. AMSI / ETW 相关模块被异常处理

重点对象：

- `amsi.dll`
- `ntdll.dll`
- `kernel32.dll`
- `wldp.dll`

### 4. 调用栈异常

例如：

- 从 `UNKNOWN` 或无后备内存起跳
- 缺少正常 Win32 层调用
- 直接落到 Native API / Syscall 层

---

## 0x06 Windows 现场排查命令

### 1. 用 Sysmon 查进程访问与内存操作

如果现场已经启用了 Sysmon，优先看：

- Event ID 10：Process Access
- Event ID 7：Image Load
- Event ID 8：CreateRemoteThread

```powershell
$start=(Get-Date).AddDays(-3)
Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Sysmon/Operational'; Id=10; StartTime=$start} |
  Where-Object {
    $_.Message -match 'lsass\.exe|chrome\.exe|msedge\.exe|MsMpEng\.exe|SenseIR\.exe'
  } |
  Select-Object TimeCreated, Message
```

### 2. 查可能的 AMSI Patch 或相关 DLL 落地

```powershell
Get-ChildItem C:\ -Recurse -Force -ErrorAction SilentlyContinue |
  Where-Object {$_.Name -ieq 'amsi.dll'} |
  Select-Object FullName, Length, LastWriteTime

Get-ChildItem "$env:TEMP","C:\ProgramData","$env:APPDATA" -Recurse -Force -ErrorAction SilentlyContinue |
  Where-Object {$_.Name -match 'amsi|ntdll|kernel32|wldp'} |
  Select-Object FullName, LastWriteTime, Length
```

### 3. 查 PowerShell 与脚本宿主异常启动链

```powershell
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4688; StartTime=$start} |
  Where-Object {
    $_.Message -match 'powershell\.exe|pwsh\.exe|wscript\.exe|cscript\.exe|mshta\.exe'
  } |
  Select-Object TimeCreated, Message
```

### 4. 查最近相关可疑命令

```powershell
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4688; StartTime=$start} |
  Where-Object {
    $_.Message -match 'AmsiScanBuffer|amsi|etw|VirtualProtect|WriteProcessMemory|comsvcs|rundll32'
  } |
  Select-Object TimeCreated, Message
```

---

## 0x07 能落地的辅助判断方法

### 1. 不会调试器，也能先看“访问模式”

即使你暂时不做内存逆向，只要看到：

- 某进程访问 `lsass.exe`
- 接着落地了 `.dmp`
- 或立刻建立横向登录

就已经足以说明它和凭据抓取强相关。

### 2. 不会反汇编，也能先看“调用链异常”

如果出现：

- Office / 浏览器 / 脚本宿主
- 拉起异常可执行文件
- 再触发 `WriteProcessMemory` / 远程线程 / Hollowing

那就是非常明确的恶意执行链。

### 3. 不会做 ETW Patch 细节验证，也能看“结果失真”

如果你发现：

- 明明有 PowerShell 执行
- 但 Script Block 记录极少
- 或脚本执行与日志覆盖程度不匹配

就应考虑 AMSI / ETW 被绕过。

---

## 0x08 一条可执行的现场流程

当你怀疑主机存在 Hook / Patch / 注入类规避行为时，建议按下面顺序落地：

1. 先看 `4688` 和 Sysmon 事件，找可疑脚本宿主和注入宿主
2. 再看 Event ID 10 的目标进程是否指向 `lsass/browser/安全产品`
3. 再查近期是否落地了可疑 `amsi.dll`、伪装 DLL、加载器
4. 再把进程访问、文件落地、外联和持久化时间窗串起来
5. 必要时再把样本移交内存分析或逆向

这能把“疑似内存绕过”先缩成足够可操作的调查结果。

---

## 0x09 三个常见误区

### 1. 以为 Hook 只能靠逆向才能看

逆向当然重要，但现场先看事件、调用对象、落地物和进程链，已经能把问题缩小很多。

### 2. 只看 AMSI，不看注入与宿主

很多规避行为是组合拳：先 Unhook，再注入，再 Patch，再跑载荷。

### 3. 只看样本，不看“它影响了谁”

真正重要的是：

- 它注入了哪个进程
- 它绕过了哪些防护
- 它之后干了什么

---

## 0x0A 建议的交付结构

这类事件适合整理为如下表格：

| 时间 | 证据源 | 事件 | 关联对象 | 结论 |
| --- | --- | --- | --- | --- |
| 10:02:11 | Sysmon 10 | 异常进程访问 | `lsass.exe` | 疑似凭据抓取前置 |
| 10:02:35 | 4688 / Sysmon 1 | 脚本宿主拉起异常进程 | `powershell -> dllhost` | 宿主链异常 |
| 10:03:04 | 文件落地 | 出现异常 `amsi.dll` / 加载器 | 用户目录 | 存在 AMSI 绕过迹象 |
| 10:03:40 | 网络 / 持久化 | 后续外联与任务创建 | 公网节点 / 任务 | 规避后继续执行攻击 |

---

## 0x0B 总结

`钩子检查` 到 `0x03` 阶段，不应该停留在“系统里可能有 Hook”这种抽象结论，而是应尽量把它翻译成可操作的取证问题：

- 谁在改用户态可见性
- 谁在访问高价值进程
- 谁在绕过 AMSI / ETW
- 谁在利用合法进程做注入宿主

当这些问题被回答清楚时，即使你还没做深度逆向，也已经能把一次“看不见的规避行为”变成一条可交付的现场攻击链。
