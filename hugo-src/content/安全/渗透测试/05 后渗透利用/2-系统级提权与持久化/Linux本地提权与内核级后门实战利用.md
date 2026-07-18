---
date: 2024-11-10T05:08:03+08:00
title: "Linux本地提权与内核级后门实战利用"
weight: 20
---

# Linux本地提权与内核级后门实战利用

在红队渗透测试中，一旦通过 Web 漏洞（如文件上传或命令执行）获得了目标 Linux 服务器的初始访问权限，通常得到的是低权限用户（如 `www-data` 或 `nobody`）。为了进一步窃取系统密码、安装 Rootkit 或进行内网横向移动，**本地提权（Local Privilege Escalation, LPE）** 是不可逾越的关键步骤。

本文将深度解析 Linux 环境下的高级提权路径，并探讨基于 eBPF 等现代内核机制的高级后门驻留技术。

---

## 1. 经典配置缺陷与提权利用

Linux 系统的权限控制高度依赖于文件权限和属主。运维人员的微小配置失误，往往是提权的捷径。

### 1.1 SUID/SGID 滥用
**SUID (Set owner User ID)** 允许用户以文件所有者（通常是 root）的权限执行该文件。
*   **信息收集**：使用 `find / -perm -u=s -type f 2>/dev/null` 寻找系统中的 SUID 程序。
*   **滥用 GTFOBins**：如果发现 `find`, `vim`, `bash`, `nmap` 等常见工具被赋予了 SUID 权限，可以直接利用它们越权执行命令。例如，若 `find` 具有 SUID：
    ```bash
    find . -exec /bin/sh -p \; -quit
    ```
    即可弹出一个具有 Root 权限的 Shell（`-p` 参数用于保持 SUID 权限，防止 Bash 自动降权）。

### 1.2 sudoers 配置错误
`/etc/sudoers` 文件定义了哪些用户可以以 root 身份执行哪些命令。
*   **通配符漏洞**：如果配置了 `www-data ALL=(root) NOPASSWD: /bin/tar *`，攻击者可以利用 `tar` 的 `--checkpoint-action` 参数执行任意命令：
    ```bash
    touch /tmp/--checkpoint=1
    touch /tmp/--checkpoint-action=exec=sh
    sudo tar -cf archive.tar *
    ```
*   **LD_PRELOAD 劫持**：如果 `sudoers` 中保留了 `env_keep+=LD_PRELOAD`，红队可编译一个恶意的 `.so` 库，并在执行 sudo 命令时预加载它，通过重写 `_init()` 函数在 root 环境下执行反弹 Shell 代码。

### 1.3 计划任务 (Cron Jobs) 劫持
系统或 Root 用户可能会设置定时任务执行某些脚本。
*   **弱权限脚本**：如果定时任务调用的脚本文件（如 `/opt/backup.sh`）对所有用户可写（`chmod 777`），直接将反弹 Shell 代码追加到该文件中，等待 Root 定时执行即可。
*   **通配符注入**：如果计划任务中有 `tar -czf /backup/backup.tar.gz *`，可参照 sudo 提权中的通配符注入方式实现 RCE。

---

## 2. Linux 内核漏洞提权 (Kernel Exploits)

当配置检查无果时，直接攻击 Linux 内核漏洞是简单粗暴的提权方式。

### 2.1 脏牛 (Dirty COW - CVE-2016-5195)
Linux 内存子系统的写时复制（Copy-on-Write）机制存在条件竞争漏洞。
攻击者可以通过不断触发写时复制，打破只读内存映射的保护，直接向具有 Root 权限的只读文件（如 `/etc/passwd`）中写入数据。
**实战操作**：直接使用 C 语言编写的 Dirty COW Exploit 覆盖 `/etc/passwd` 中的 root 密码字段，或直接注入一个 SUID shell 到 `/usr/bin/passwd`。

### 2.2 脏管 (Dirty Pipe - CVE-2022-0847)
比 Dirty COW 更容易利用、稳定性更高的内核漏洞。它利用了管道（Pipe）缓冲区结构中未初始化的标志位，允许覆盖任意只读文件的数据缓存。
**实战操作**：
1. 找到一个具有 SUID 权限的文件（如 `/usr/bin/su`）。
2. 使用 Dirty Pipe 漏洞，将 ELF 文件开头的指令覆盖为一段直接调用 `/bin/sh` 的 Shellcode。
3. 执行被篡改的 `/usr/bin/su`，瞬间获得 Root 权限。

### 2.3 PwnKit (CVE-2021-4034)
存在于 `polkit` 的 `pkexec` 组件中的内存越界读取漏洞。由于 `pkexec` 默认随各大发行版安装且具备 SUID 权限，红队只需利用环境变量注入，迫使 `pkexec` 加载恶意的共享库，即可稳定、无文件地获得 Root 权限。

---

## 3. 高级 Linux 后门与驻留机制

拿到 Root 权限只是内网渗透的开始。为了抵御蓝队的应急响应排查，红队需要植入高度隐蔽的后门。

### 3.1 动态链接库劫持 (LD_PRELOAD / /etc/ld.so.preload)
Linux 下绝大多数命令（如 `ls`, `netstat`, `ps`）都依赖于 Glibc 等动态链接库。
*   红队编写一个覆盖了核心 API（如 `readdir`, `fopen`, `pcap_open`）的恶意 `.so` 文件。
*   将其路径写入 `/etc/ld.so.preload`（全局预加载）。
*   **效果**：当管理员执行 `ls` 时，系统会优先调用恶意 `.so` 中的 `readdir`，恶意代码在将结果返回给终端前，自动将包含红队后门文件的名称过滤掉，实现完美隐身。

### 3.2 PAM (可插拔认证模块) 后门
`/etc/pam.d/` 目录下的配置文件控制着 Linux 的登录认证（如 SSH, su）。
红队可以修改或替换系统的 `pam_unix.so` 模块：
1.  **记录密码**：拦截所有通过 SSH 登录的明文密码，写入隐藏文件中，供红队后续横向移动使用。
2.  **万能密码**：在认证逻辑中加入判断，如果输入的密码等于红队硬编码的“万能密码”（如 `hacker123`），则直接返回 `PAM_SUCCESS`，允许登录，且不留下任何登录失败日志。

### 3.3 eBPF：云原生时代的幽灵 Rootkit
**eBPF (Extended Berkeley Packet Filter)** 是 Linux 内核中的一项革命性技术，允许在沙箱中运行安全的代码来扩展内核功能（如监控、网络路由）。
然而，eBPF 也成为了现代最高级 Rootkit 的温床。
*   **流量隐藏与劫持**：eBPF 可以在网卡驱动层（XDP）或 Socket 层拦截网络包。红队编写的 eBPF 探针可以在 C2 流量到达操作系统的 TCP/IP 协议栈之前将其劫持并隐藏，导致 `tcpdump` 或 `netstat` 完全抓不到任何异常连接。
*   **系统调用拦截**：使用 eBPF 的 Kprobes 机制挂钩系统调用（Syscalls），动态篡改 `execve`、`read` 的返回结果，实现进程隐藏、文件隐藏以及逃避 EDR 监控。

---

## 4. 总结

从早期的 SUID 滥用到近年的 Dirty Pipe，再到代表着未来攻防趋势的 eBPF Rootkit，Linux 本地提权与权限维持的演进，本质上是一场对操作系统底层资源的控制权争夺战。
在实战中，红队不仅要精通各类提权 Exploit 的编译与利用，更要深刻理解 Linux 内核态与用户态的边界，才能在防守严密的服务器中如入无人之境，如影随形。