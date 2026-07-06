---
title: "Windows事件日志狩猎与横向移动溯源"
date: 2026-06-11T12:00:00+08:00
draft: false
weight: 10
description: "深入解析Windows EVTX日志机制，结合Sysmon探讨如何从海量日志中精准狩猎横向移动（PtH、PsExec、WMI）与权限维持痕迹。"
categories: ["应急响应", "取证分析"]
tags: ["Windows", "EVTX", "Sysmon", "横向移动", "威胁狩猎", "蓝队实战"]
---

# Windows事件日志狩猎与横向移动溯源

在企业级应急响应中，攻击者往往会清理工具、删除文件甚至销毁内存，但**Windows事件日志（EVTX）**作为系统底层活动的记录仪，往往能留下攻击者无法完全抹除的“蛛丝马迹”。特别是在内网横向移动阶段，每一条被窃取的哈希、每一次远程执行的命令，都会在日志中激起涟漪。

本文将深入探讨如何利用原生 Windows 安全日志与 Sysmon，精准追踪和狩猎高级威胁。

---

## 0x01 Windows 日志与 Sysmon 基础

Windows 默认的日志体系（Security、System、Application）虽然能记录登录和进程状态，但对于高级攻击的可见性存在盲区（例如：具体的网络连接、命令行参数）。

### 1. 核心 Security 日志 ID (原生)
蓝队必须烂熟于心的几个核心原生 Event ID：
- **4624**：账户成功登录。
- **4625**：账户登录失败（暴力破解监控）。
- **4688**：新进程创建（需开启“审核进程创建”并记录命令行参数）。
- **4768**：请求 Kerberos TGT（用于检测 AS-REP Roasting）。
- **4769**：请求 Kerberos TGS（用于检测 Kerberoasting）。
- **7045**：系统中安装了新服务（System 日志，极度危险，常用于 PsExec/木马驻留）。

### 2. Sysmon 补全视野
Sysmon (System Monitor) 是微软 Sysinternals 套件中的神兵利器，它将进程创建、网络连接、文件创建等行为以极其细致的颗粒度记录到 `Microsoft-Windows-Sysmon/Operational` 中。
- **Event ID 1**：进程创建（包含完整的 ParentProcessId、CommandLine、Hash）。
- **Event ID 3**：网络连接（精确定位 C2 回连）。
- **Event ID 8**：创建远程线程（监控进程注入 / 内存马）。
- **Event ID 10**：进程访问（监控 LSASS 内存读取，检测 Mimikatz）。

---

## 0x02 横向移动的日志狩猎实战

攻击者在获取内网立足点后，必然会向高价值目标（如域控）进行横向移动。以下是几种经典横向移动手段的日志特征。

### 1. 哈希传递 (Pass-the-Hash, PtH)
PtH 允许攻击者在不知道明文密码的情况下，使用 NTLM Hash 认证。

**狩猎特征（原生 Security 日志）：**
- 寻找 **Event ID 4624**（登录成功）。
- **Logon Type (登录类型)**：通常为 **3**（网络登录）或 **9**（NewCredentials，通常是 Mimikatz/Invoke-TheHash 注入凭据时的类型）。
- **Authentication Package**：NTLM。
- **KeyLength**：0（在使用 PtH 时，由于没有真实的密码去计算会话密钥，KeyLength 往往为 0）。

### 2. PsExec / SMBExec 远程执行
PsExec 的底层原理是通过 SMB 写入服务可执行文件到 `ADMIN$`，并通过 RPC 调用服务控制管理器（SCM）启动该服务。

**狩猎特征：**
- **System 日志 - Event ID 7045**（服务创建）：攻击者会创建一个随机名称（或默认的 `PSEXESVC`）的服务。
- **Security 日志 - Event ID 5140 / 5145**：访问网络共享，重点关注对 `IPC$` 和 `ADMIN$` 的访问。
- **Sysmon - Event ID 1**：如果攻击者执行了命令，会看到由 `services.exe` 或 `PSEXESVC.exe` 派生出的子进程（如 `cmd.exe`）。

### 3. WMI 远程横向移动
WMI (Windows Management Instrumentation) 是一种无文件（Fileless）横向移动的极佳方式，常被 `WMIExec.py` 或 PowerShell 滥用。

**狩猎特征：**
- **Security 日志 - Event ID 4688**：进程创建。注意观察父进程。WMI 远程执行的命令，其父进程必然是 **`WmiPrvSE.exe`**（WMI Provider Host）。
- **命令特征**：`WMIExec.py` 默认会将输出重定向到 `ADMIN$` 下的随机时间戳文件中，如 `cmd.exe /Q /c [命令] 1> \\127.0.0.1\ADMIN$\__1681234567.123 2>&1`。
- **Sysmon - Event ID 1**：监控 `WmiPrvSE.exe` 生成的异常子进程（`cmd.exe`, `powershell.exe`）。

---

## 0x03 权限维持与后门追踪

攻击者在拿下系统后，为了确保持久化，往往会植入后门。事件日志同样能捕捉到这些行为。

### 1. 计划任务后门 (Scheduled Tasks)
**狩猎特征：**
- **Security 日志 - Event ID 4698**：创建计划任务。
- 重点审查任务的 `Command` 字段，寻找可疑的 PowerShell 编码命令（`-enc`）或未知二进制文件路径。

### 2. WMI 事件订阅 (高级持久化)
WMI 事件订阅是高级 APT 组织常用的无文件驻留手段，通过绑定 `EventFilter`（触发条件，如开机）和 `EventConsumer`（执行动作，如执行 VBS/Powershell 载荷）。

**狩猎特征：**
- **Sysmon - Event ID 19, 20, 21**：分别对应 WMI Filter、Consumer 和 Binding 的创建。
- 这三个日志是蓝队捕获 WMI 驻留的“黄金标准”，必须在 SIEM/SOC 中配置强告警。

---

## 0x04 总结：构建防御纵深

日志不仅是事后取证的“废墟足迹”，更是实时防御的“雷达”。
1. **基础配置**：务必通过 GPO 开启“审核进程创建”并记录命令行参数（Command Line Auditing）。
2. **部署 Sysmon**：使用如 SwiftOnSecurity 等成熟的配置模板，覆盖关键的系统 API 调用。
3. **集中化聚合**：将日志转发到 ELK / Splunk 等 SIEM 平台，建立关联规则（如 `4624 (Type 3) -> 7045 -> 4688 (cmd.exe)` 的攻击链条告警）。

在对抗的博弈中，攻击者可以篡改工具，但极难在不触发其他告警的情况下，完美地从系统底层抽离所有日志痕迹。掌握 EVTX，就是掌握了追踪攻击者幽灵的锁链。
