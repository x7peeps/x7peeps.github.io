---
title: "幽灵漫步：Windows横向移动机制与哈希传递实战"
date: 2026-06-11T14:00:00+08:00
draft: false
weight: 2
---

# 幽灵漫步：Windows横向移动机制(WMI/PsExec/WinRM)与哈希传递实战

在撕裂边界、建立起稳固的内网隧道后，攻击者的视角正式切入企业内网。
面对内网中成百上千台 Windows 主机，寻找高价值目标（如域控、核心数据库）的过程被称为**横向移动（Lateral Movement）**。

横向移动的最高境界是“**Living off the Land（靠山吃山，就地取材）**”。这意味着攻击者不再上传恶意的后门木马，而是直接滥用 Windows 操作系统原生自带的管理工具和协议。

---

## 1. 认证的前提：凭证窃取与 Pass-the-Hash (PtH)

要在 Windows 网络中漫游，首先需要“门票”。这往往是在拿下一台跳板机后，通过内存抓取获得的。

### 1.1 内存中的宝藏：LSASS 进程
Windows 的本地安全认证子系统服务（LSASS.exe）负责处理用户的登录策略。当用户登录系统后，LSASS 会在内存中缓存用户的凭证（明文密码、NTLM Hash、Kerberos 票据）。

*   **Mimikatz 抓取**：攻击者在获得本地 Administrator 权限后，使用 Mimikatz 工具注入 LSASS 进程内存，导出凭证。
    ```bash
    # 导出内存中的明文密码（Windows 8.1 / 2012 R2 之前默认开启 Wdigest）
    mimikatz # sekurlsa::wdigest
    # 导出 NTLM Hash
    mimikatz # sekurlsa::logonpasswords
    ```

### 1.2 哈希传递攻击 (Pass-the-Hash, PtH)
如果系统修补了 Wdigest，内存中不再缓存明文密码，我们只能抓到一串 NTLM Hash。**但这就够了。**
在 Windows NTLM 认证协议的底层交互中，客户端实际上是用用户的 NTLM Hash 去加密 Server 发来的 Challenge（挑战码）。
因此，**攻击者根本不需要知道明文密码，只要拥有 NTLM Hash，就可以直接伪造认证过程**。

```bash
# 使用 Mimikatz 执行 PtH，这会弹出一个拥有特定权限的隐藏 CMD 窗口
mimikatz # sekurlsa::pth /user:Administrator /domain:target.local /ntlm:8846f7eaee8fb117ad06bdd830b7586c
```

---

## 2. 官方的后门：Windows 原生横向机制推演

获得了凭证（明文或 Hash）后，我们如何控制另一台机器执行命令？

### 2.1 SMB 协议与 PsExec 机制
SMB（Server Message Block，端口 445）是 Windows 文件共享的基础。
微软官方出品的系统管理工具包 Sysinternals 中，有一个著名的工具：**PsExec**。

*   **PsExec 的底层执行逻辑**：
    1.  通过 SMB 协议（445端口）认证并连接到目标机器的 `IPC$`（进程间通信）隐藏共享。
    2.  将一个名为 `PSEXESVC.exe` 的服务程序上传到目标机器的 `ADMIN$` 共享目录（通常对应 `C:\Windows`）。
    3.  通过 MSRPC（微软远程过程调用）远程调用服务控制管理器（SCM），注册并启动该服务。
    4.  该服务以 `SYSTEM` 最高权限在目标机上运行，并通过命名管道（Named Pipes）将标准输入/输出流回传给攻击者。
*   **优缺点**：权限极高（SYSTEM），但由于会产生文件落地（`PSEXESVC.exe`）和明显的 Event Log 服务启动日志，在现代 EDR（终端检测与响应）面前极易暴露。

### 2.2 WMI：无文件横向的艺术
WMI（Windows Management Instrumentation）是微软为了方便管理员远程管理计算机而设计的核心接口。它默认开放，且**不需要文件落地**。

*   **底层协议**：WMI 依赖 DCOM（分布式组件对象模型，端口 135），但在建立连接后，会随机协商一个高位端口进行数据传输。
*   **攻击推演 (WMIExec)**：
    攻击者利用 WMI 提供的 `Win32_Process` 类的 `Create` 方法，直接在目标机器的内存中拉起一个新进程。
    ```bash
    # 在 Kali 下使用 Impacket 工具包执行 WMI 横向
    wmiexec.py -hashes :8846f7eaee8fb117ad06bdd830b7586c Administrator@192.168.1.100 "whoami"
    ```
*   **回显机制**：因为 WMI 默认是异步执行且无回显的，攻击工具（如 WMIExec）的底层逻辑通常是将命令输出重定向到一个临时文件（如 `C:\Windows\Temp\xxx.txt`），然后再通过 SMB 协议把文件读回来并删除。
*   **隐蔽性**：WMI 不会产生新的服务安装日志，一切都在内存中交由 `WmiPrvSE.exe` 进程代为执行，极度隐蔽。

### 2.3 WinRM：Windows 的 SSH
WinRM（Windows Remote Management）是微软对 WS-Management 协议的实现，相当于 Windows 版本的 SSH。
*   **底层协议**：基于 HTTP（端口 5985）或 HTTPS（端口 5986）的 SOAP 请求。
*   **实战应用**：在较新的 Windows Server（2012 以上）通常默认开启。如果拥有凭证，可以使用 PowerShell 直接远程进入目标机的交互式 Shell。
    ```powershell
    Enter-PSSession -ComputerName 192.168.1.100 -Credential $cred
    ```

---

## 3. 防御横向移动：切断幽灵的漫步路线

横向移动之所以能够大规模成功，往往是因为企业内部网络的扁平化以及本地管理员密码的复用。

**阻断横向移动的核心防御架构：**
1.  **LAPS (Local Administrator Password Solution)**：
    微软官方提供的解决方案。它强制域内每台机器定期随机生成一个完全不同的本地 Administrator 密码，并将其加密存储在域控的 AD 属性中。这直接打破了“拿下一台机器的本地管理员 Hash，就能 Pass-the-Hash 控制全网”的死局。
2.  **网络微隔离 (Micro-segmentation)**：
    在交换机或主机防火墙层面，严格限制工作站与工作站之间的横向 445、135、5985 端口互通。工作站只应与服务器通信，而不应相互通信。
3.  **限制凭证缓存**：
    全面禁用 Wdigest，开启 Windows Defender Credential Guard，利用基于硬件的虚拟化技术（VBS）将 LSASS 进程隔离在一个受保护的容器中，彻底阻断 Mimikatz 的内存读取。

理解了这些底层机制，你就会明白：**内网渗透从来不是比拼谁的漏洞库多，而是比拼谁对 Windows 操作系统底层的运行逻辑理解得更深。**
