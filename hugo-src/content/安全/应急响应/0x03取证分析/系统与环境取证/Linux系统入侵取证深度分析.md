---
title: "Linux系统入侵取证深度分析"
date: 2026-07-02T10:00:00+08:00
draft: false
weight: 490
description: "围绕 Linux 系统入侵取证的全面深度分析，覆盖进程隐藏检测、日志体系取证（syslog/journal/auditd）、文件系统取证（ext4/xfs/btrfs）、rootkit 检测与 LKM 分析、内存取证（LiME/Volatility3）、SSH 密钥与定时任务持久化检测、包管理器投毒分析、容器逃逸取证、UTMP/WTMP/lastlog 登录取证、自动化狩猎脚本与 Sigma 规则等。"
categories: ["应急响应", "取证分析"]
tags: ["Linux", "Linux取证", "rootkit检测", "auditd", "Volatility3", "LiME", "进程隐藏", "LKM", "容器逃逸", "SSH取证"]
---

## 0x01 Linux 取证基础与响应流程

### Linux 取证与 Windows 取证的核心差异

Linux 系统取证在多个维度上与 Windows 取证存在本质区别。理解这些差异是开展有效取证工作的前提。

| 对比维度 | Linux | Windows |
|---------|-------|---------|
| 注册表 | 无集中注册表，配置分散于 `/etc/` 目录树 | 集中式注册表（SAM/SYSTEM/SOFTWARE） |
| 事件日志 | 多日志源（syslog/journal/auditd） | 统一事件日志（Event Log .evtx） |
| 文件系统 | ext4/xfs/btrfs 等多种选择 | NTFS/ReFS 为主 |
| 进程管理 | `/proc` 虚拟文件系统 | NtQuerySystemInformation API |
| 服务管理 | systemd/sysvinit/OpenRC | SCM（Service Control Manager） |
| 用户认证 | PAM 框架 + shadow | SAM 数据库 + LSASS |
| 恶意软件持久化 | cron/systemd/LD_PRELOAD/LKM | 注册表 Run 键/服务/DLL 劫持 |
| 内核模块 | LKM（Loadable Kernel Module） | 驱动程序（.sys） |
| 权限模型 | rwx + SUID/SGID + capabilities | ACL + 特权组 |
| 日志篡改难度 | 相对容易（文本文件可直接编辑） | 较难（二进制格式 + 签名保护） |

Linux 取证的核心挑战在于：系统发行版碎片化严重，不同发行版的日志路径、配置格式、包管理工具各不相同；Linux 服务器通常承载高并发业务，取证操作必须尽量减少对生产环境的影响；大量 Linux 恶意软件采用无文件攻击技术，传统基于文件签名的检测方法失效。

### 易失性证据收集优先级（RFC 3227 在 Linux 上的应用）

RFC 3227 定义了证据易失性的排序原则，在 Linux 环境中具体映射如下：

| 优先级 | 证据类型 | Linux 采集命令 | 易失性 |
|--------|---------|---------------|--------|
| 1 | CPU 寄存器与缓存 | 需内存镜像 | 极高 |
| 2 | 路由表、ARP 缓存、进程表 | `ip route show` / `ip neigh` / `ps auxf` | 极高 |
| 3 | 内存镜像 | LiME / fmem | 高 |
| 4 | 临时文件系统 | `/tmp`、`/dev/shm`、`/run` | 高 |
| 5 | 网络连接状态 | `ss -tunapw` / `netstat -tunap` | 高 |
| 6 | 挂载信息 | `mount` / `cat /proc/mounts` | 中 |
| 7 | 登录会话 | `who` / `w` / `last` | 中 |
| 8 | 内核模块 | `lsmod` / `cat /proc/modules` | 中 |
| 9 | 文件系统信息 | `df -hT` / `blkid` | 低 |
| 10 | 归档媒体 | 磁盘镜像（dd/dc3dd） | 极低 |

现场采集脚本示例：

```bash
#!/bin/bash
OUTDIR="/evidence/volatile_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUTDIR"

ps auxf --width=256 > "$OUTDIR/ps_full.txt"
ss -tunapw > "$OUTDIR/ss_full.txt"
ip route show > "$OUTDIR/routes.txt"
ip neigh show > "$OUTDIR/arp.txt"
ip addr show > "$OUTDIR/interfaces.txt"
mount > "$OUTDIR/mounts.txt"
lsmod > "$OUTDIR/lsmod.txt"
who -a > "$OUTDIR/who.txt"
w > "$OUTDIR/w.txt"
last -50 > "$OUTDIR/last50.txt"
cat /proc/modules > "$OUTDIR/proc_modules.txt"
cat /proc/cmdline > "$OUTDIR/cmdline.txt"
df -hT > "$OUTDIR/df.txt"
ls -la /dev/shm/ > "$OUTDIR/dev_shm.txt"
ls -la /tmp/ > "$OUTDIR/tmp.txt"
find /tmp /dev/shm /run -type f -exec md5sum {} \; > "$OUTDIR/tmp_hashes.txt" 2>/dev/null
cat /proc/net/tcp /proc/net/tcp6 > "$OUTDIR/proc_net_tcp.txt"
cat /proc/net/udp /proc/net/udp6 > "$OUTDIR/proc_net_udp.txt"
```

### 现场保护与镜像获取

磁盘镜像获取是取证工作的基石。Linux 环境下常用的镜像工具及其特点：

**dd（原始镜像）**

```bash
dd if=/dev/sda of=/evidence/disk_image.raw bs=4M conv=noerror,sync status=progress
md5sum /evidence/disk_image.raw > /evidence/disk_image.raw.md5
sha256sum /evidence/disk_image.raw > /evidence/disk_image.raw.sha256
```

**dc3dd（增强型镜像工具）**

```bash
dc3dd if=/dev/sda of=/evidence/disk_image.dd3dd \
  hash=md5,sha256 \
  hof=/evidence/disk_image.hash \
  log=/evidence/dc3dd_log.txt \
  progress=yes
```

dc3dd 相比 dd 的优势在于：内置哈希计算（无需二次读取）、支持分片输出、提供进度报告、自动记录错误日志。

**ewf-tools（Expert Witness Format）**

```bash
ewfacquire /dev/sda -t /evidence/disk_image -f encase6 -b 64 \
  -S sparse -u -l /evidence/ewf_log.txt
```

EWF 格式支持压缩、分片、嵌入元数据和哈希校验，是与 EnCase/Autopsy 等取证工具交互的标准格式。

**镜像验证流程**

```bash
echo "=== 原始镜像哈希验证 ==="
md5sum -c /evidence/disk_image.raw.md5
sha256sum -c /evidence/disk_image.raw.sha256

echo "=== 挂载只读分析 ==="
mkdir -p /mnt/evidence
ro-mount /evidence/disk_image.raw /mnt/evidence -o loop,ro,noexec

echo "=== 使用 losetup 挂载分区 ==="
losetup -r -P /dev/loop0 /evidence/disk_image.raw
mount -o ro /dev/loop0p1 /mnt/evidence
```

### Linux 取证工具链概览

| 工具 | 用途 | 安装方式 | 典型场景 |
|------|------|---------|---------|
| Sleuth Kit (TSK) | 文件系统分析 | `apt install sleuthkit` | inode 分析、文件恢复、时间线生成 |
| Autopsy | TSK 的 Web GUI | 源码编译/Docker | 可视化取证分析平台 |
| Volatility3 | 内存取证 | `pip3 install volatility3` | 进程分析、内核 hook 检测 |
| LiME | Linux 内存采集 | 源码编译内核模块 | 内存镜像获取 |
| chkrootkit | rootkit 快速检测 | `apt install chkrootkit` | 已知 rootkit 特征匹配 |
| rkhunter | rootkit 深度检测 | `apt install rkhunter` | 二进制文件完整性检查 |
| Lynis | 安全审计 | `apt install lynis` | 系统安全基线评估 |
| debugfs | ext4 底层分析 | `apt install e2fsprogs` | 已删除文件恢复、journal 分析 |
| xfs_db | xfs 底层分析 | `apt install xfsprogs` | xfs 文件系统结构分析 |
| auditd | 系统审计 | `apt install auditd` | 实时行为监控与审计 |
| binwalk | 固件/文件分析 | `pip3 install binwalk` | 嵌入式恶意软件分析 |
| YARA | 模式匹配 | `apt install yara` | 恶意软件特征扫描 |

---

## 0x02 进程分析与隐藏进程检测

### /proc 文件系统结构与进程信息提取

`/proc` 是 Linux 内核提供的虚拟文件系统，每个运行中的进程在 `/proc` 下都有一个以其 PID 命名的目录。理解 `/proc` 的结构是 Linux 进程取证的基础。

```
/proc/[PID]/
├── cmdline        进程启动命令行参数（以 null 分隔）
├── environ        进程环境变量
├── exe            指向可执行文件的符号链接
├── fd/            文件描述符目录（每个文件描述符一个符号链接）
├── maps           内存映射区域
├── mem            进程内存（需 root 权限）
├── status         进程状态信息（人类可读）
├── stat           进程统计信息（机器可读）
├── cwd            当前工作目录符号链接
├── root           进程根目录符号链接
├── task/          线程信息（每个线程一个子目录）
├── net/           网络命名空间信息
├── cgroup         控制组信息
├── mountinfo      挂载信息
└── comm           命令名（可被修改）
```

关键取证命令：

```bash
cat /proc/[PID]/cmdline | tr '\0' ' '
cat /proc/[PID]/status
ls -la /proc/[PID]/exe
ls -la /proc/[PID]/fd/
cat /proc/[PID]/maps
cat /proc/[PID]/environ | tr '\0' '\n'
ls -la /proc/[PID]/cwd
ls -la /proc/[PID]/root
```

### 进程树异常分析

正常的 Linux 进程树具有明确的层级关系。通过 `pstree` 可以快速识别异常：

```bash
pstree -p -a -u -U
```

典型的异常模式包括：

| 异常模式 | 说明 | 检测方法 |
|---------|------|---------|
| 孤儿进程 | 父进程为 init(1) 但非系统服务 | `ps -eo pid,ppid,comm \| awk '$2==1'` |
| 进程名伪装 | 伪装为内核线程名（如 `[kworker]`） | 检查方括号 + 对比 `/proc/[PID]/exe` |
| 异常父进程 | Web 服务进程 spawn shell | `pstree` 检查 nginx/apache 子进程 |
| PID 回绕 | 异常高 PID 或 PID 0 附近 | `ps -eo pid,comm --sort=pid` |
| 僵尸进程堆积 | 大量 defunct 进程 | `ps aux \| grep defunct` |

内核线程的命名规范是使用方括号包裹（如 `[kthreadd]`），如果非内核线程使用此命名模式，极有可能是恶意伪装：

```bash
for pid in $(ls /proc/ | grep -E '^[0-9]+$'); do
  exe=$(readlink /proc/$pid/exe 2>/dev/null)
  comm=$(cat /proc/$pid/comm 2>/dev/null)
  if [[ "$comm" == \[*\] ]] && [[ "$exe" != "" ]]; then
    echo "[SUSPICIOUS] PID=$pid COMM=$comm EXE=$exe"
  fi
done
```

### 隐藏进程检测方法

**方法一：ps 与 /proc 交叉比对**

`ps` 命令本身依赖 `/proc` 文件系统，如果 rootkit 通过 hook 系统调用隐藏进程，`ps` 的输出将不完整。通过直接遍历 `/proc` 目录并与 `ps` 输出比对，可以发现被隐藏的进程：

```bash
ps -eo pid --no-headers | sort -n > /tmp/ps_pids.txt
ls -d /proc/[0-9]* 2>/dev/null | sed 's|/proc/||' | sort -n > /tmp/proc_pids.txt
comm -13 /tmp/ps_pids.txt /tmp/proc_pids.txt
```

上述命令输出的 PID 列表即为 `/proc` 中存在但 `ps` 未显示的进程，高度可疑。

**方法二：内核 task_struct 遍历**

内核通过 `task_struct` 链表维护所有进程信息。LKM rootkit 通常通过修改进程链表指针来隐藏进程，但 `task_struct` 仍然存在于内存中。通过扫描内存中的 `task_struct` 结构可以发现隐藏进程：

```bash
cat /proc/kallsyms | grep "T init_task"
```

使用 Volatility3 的 `linux_pslist` 插件可以从内存镜像中遍历完整的 task_struct 链表，不受运行时 rootkit 的影响。

**方法三：系统调用钩子检测**

LKM rootkit 常通过修改 syscall table 来劫持 `getdents`/`getdents64` 系统调用，从而在目录遍历（包括 `/proc`）时过滤特定 PID：

```bash
cat /proc/kallsyms | grep sys_call_table
cat /proc/kallsyms | grep sys_getdents
```

使用 System.map 与运行时 kallsyms 比对：

```bash
grep sys_call_table /boot/System.map-$(uname -r)
grep sys_call_table /proc/kallsyms
```

如果两者地址不一致，说明 syscall table 可能被篡改。

**方法四：基于内存的进程发现**

通过扫描物理内存中的 `cred` 结构体（包含 UID/GID 信息）和 `task_struct` 结构体，可以发现所有曾经存在的进程，包括已被 rootkit 从链表中摘除的进程。这需要使用 LiME 获取内存镜像后通过 Volatility3 分析。

### 恶意进程行为特征

| 行为类型 | 典型特征 | 检测指标 |
|---------|---------|---------|
| 挖矿 | 高 CPU 占用、连接矿池端口（3333/4444/8888/14444） | `top` + `ss -tunap \| grep -E '3333\|4444\|8888\|14444'` |
| 反弹 Shell | 异常出站连接到攻击者 IP | `ss -tunap` 检查非标准端口出站连接 |
| C2 通信 | 周期性 DNS 查询/HTTP beacon | 网络流量分析 + DNS 日志 |
| 数据外泄 | 大量出站流量/异常上传 | `iftop`/`nethogs` 监控 |
| 横向移动 | SSH/SCP 到内网其他主机 | `last` + `auth.log` 分析 |
| 权限提升 | SUID 滥用/内核漏洞利用 | `find / -perm -4000 -type f` |

### Bash 脚本：检测隐藏进程

```bash
#!/bin/bash

echo "====== Linux 隐藏进程检测脚本 ======"
echo "检测时间: $(date)"
echo ""

echo "[1] ps 与 /proc PID 交叉比对"
ps -eo pid --no-headers | sort -n > /tmp/ps_pids.txt
ls -d /proc/[0-9]* 2>/dev/null | sed 's|/proc/||' | sort -n > /tmp/proc_pids.txt
HIDDEN=$(comm -13 /tmp/ps_pids.txt /tmp/proc_pids.txt)
if [ -n "$HIDDEN" ]; then
    echo "[!] 发现隐藏进程:"
    for pid in $HIDDEN; do
        echo "  PID=$pid COMM=$(cat /proc/$pid/comm 2>/dev/null) EXE=$(readlink /proc/$pid/exe 2>/dev/null)"
    done
else
    echo "[-] 未发现隐藏进程"
fi
echo ""

echo "[2] 内核线程伪装检测"
for pid in $(ls -d /proc/[0-9]* 2>/dev/null | sed 's|/proc/||'); do
    comm=$(cat /proc/$pid/comm 2>/dev/null)
    exe=$(readlink /proc/$pid/exe 2>/dev/null)
    if [[ "$comm" == \[*\] ]] && [[ -n "$exe" ]]; then
        echo "[!] PID=$pid 伪装为内核线程 COMM=$comm EXE=$exe"
    fi
done
echo ""

echo "[3] 异常网络连接进程"
ss -tunap | grep -v "127.0.0.1" | grep ESTAB | while read line; do
    pid=$(echo "$line" | grep -oP 'pid=\K[0-9]+')
    if [ -n "$pid" ]; then
        exe=$(readlink /proc/$pid/exe 2>/dev/null)
        echo "  PID=$pid EXE=$exe CONN=$(echo $line | awk '{print $4" -> "$5}')"
    fi
done
echo ""

echo "[4] /dev/shm 可疑文件"
find /dev/shm -type f -executable 2>/dev/null | while read f; do
    echo "[!] /dev/shm 可执行文件: $f ($(file "$f"))"
done

echo ""
echo "====== 检测完成 ======"
```

---

## 0x03 Linux 日志体系取证

### syslog/rsyslog 配置与日志分析

Linux 系统的日志体系是取证分析的核心数据源。rsyslog 是大多数现代 Linux 发行版的默认日志守护进程，其配置文件位于 `/etc/rsyslog.conf` 和 `/etc/rsyslog.d/` 目录。

关键日志文件及其取证价值：

| 日志文件 | 路径 | 取证价值 |
|---------|------|---------|
| 系统日志 | `/var/log/syslog` 或 `/var/log/messages` | 系统事件全量记录 |
| 认证日志 | `/var/log/auth.log` 或 `/var/log/secure` | 登录/认证/提权事件 |
| 内核日志 | `/var/log/kern.log` | 内核模块加载/内核异常 |
| 守护进程日志 | `/var/log/daemon.log` | 服务运行状态 |
| cron 日志 | `/var/log/cron` 或包含在 syslog 中 | 定时任务执行记录 |

```bash
grep "sshd" /var/log/auth.log | tail -50
grep "sudo" /var/log/auth.log | grep -v "session opened\|session closed"
grep "CRON" /var/log/syslog
grep "module\|insmod\|modprobe" /var/log/kern.log
```

### systemd journal 分析

systemd 的 journal 日志是二进制格式，使用 `journalctl` 命令进行查询。journal 日志的优势在于结构化程度高、支持丰富的过滤条件。

```bash
journalctl --since "2026-06-30 00:00:00" --until "2026-07-01 00:00:00"
journalctl -u sshd --since today
journalctl _PID=1234
journalctl _COMM=sshd _EXE=/usr/sbin/sshd
journalctl -k --since "1 hour ago"
journalctl --list-boots
journalctl -b -1
journalctl -b 0 --priority=0..3
journalctl -b 0 _SYSTEMD_UNIT=ssh.service
journalctl --output=json-pretty -b 0 _SYSTEMD_UNIT=ssh.service | head -100
```

journal 日志文件位于 `/var/log/journal/` 或 `/run/log/journal/`，可以直接拷贝到分析机上使用 `journalctl` 离线分析：

```bash
journalctl -D /evidence/var/log/journal/ -b 0 -u sshd
```

### auditd 审计框架深度分析

auditd 是 Linux 内核审计框架的用户态组件，能够记录系统调用、文件访问、用户认证等细粒度事件，是 Linux 取证中最强大的日志源。

**audit 规则配置**

```bash
-a always,exit -F arch=b64 -S execve -k exec_monitor
-a always,exit -F arch=b64 -S unlink,unlinkat,rename,renameat -k file_deletion
-w /etc/passwd -p wa -k passwd_changes
-w /etc/shadow -p wa -k shadow_changes
-w /etc/sudoers -p wa -k sudoers_changes
-w /etc/ssh/sshd_config -p wa -k sshd_config_changes
-w /etc/crontab -p wa -k crontab_changes
-w /var/log/ -p wa -k log_tampering
-a always,exit -F arch=b64 -S setuid,setgid -k privilege_escalation
-a always,exit -F arch=b64 -S mount,umount2 -k mount_operations
-a always,exit -F arch=b64 -S init_module,finit_module -k module_loading
```

**关键审计事件类型**

| 事件类型 | 编号 | 含义 |
|---------|------|------|
| SYSCALL | 系统调用 | 记录系统调用参数和返回值 |
| EXECVE | 命令执行 | 记录执行的命令及其参数 |
| PATH | 文件路径 | 记录涉及的文件路径 |
| USER_AUTH | 用户认证 | 登录/认证尝试 |
| USER_LOGIN | 用户登录 | 登录成功/失败 |
| CRED_ACQ | 凭证获取 | 获取用户凭证 |
| CRED_DISP | 凭证释放 | 释放用户凭证 |
| ANOM_ABEND | 异常终止 | 进程异常退出 |
| CONFIG_CHANGE | 配置变更 | audit 规则变更 |

```bash
ausearch -k exec_monitor --start today
ausearch -k passwd_changes --start this-week
ausearch -m USER_LOGIN --start today
ausearch -m EXECVE -i --start today | head -100
ausearch -m MODULE_LOAD --start today
aureport --summary
aureport --failed
aureport --auth
aureport --exec --summary
```

### 日志篡改与反取证检测

攻击者在入侵后通常会尝试清除或篡改日志以掩盖痕迹。以下是常见的日志篡改手法及其检测方法：

| 篡改手法 | 检测方法 |
|---------|---------|
| 删除日志文件 | 检查 `/var/log/` 目录中日志文件的时间连续性 |
| 清空日志文件 | 检查文件大小为 0 或异常小的日志文件 |
| 修改特定条目 | 比对 journal 哈希与存储的基线 |
| 停止 rsyslog/auditd | 检查服务状态和日志时间戳跳跃 |
| 日志重定向到 /dev/null | 检查 rsyslog.conf 配置是否被修改 |
| 修改日志轮转配置 | 检查 logrotate 配置是否缩短了保留期 |
| 时间戳伪造 | 检查 syslog 时间戳与 journal 时间戳的一致性 |

```bash
stat /var/log/auth.log
ls -la /var/log/ | awk '{print $5, $9}' | sort -n
journalctl --verify
systemctl status rsyslog auditd
cat /etc/rsyslog.conf | grep -v "^#\|^$"
cat /etc/logrotate.d/rsyslog
```

### 日志时间线重建

时间线重建是将多源日志按时间顺序排列，还原攻击者活动全貌的关键技术：

```bash
log2timeline.py --storage-file timeline.plaso /evidence/disk_image/
psort.py --output-format l2t_csv timeline.plaso -o timeline.csv
```

使用 `mactime` 生成文件系统时间线：

```bash
fls -r -m / /evidence/disk_image.raw > bodyfile.txt
mactime -b bodyfile.txt 2026-06-01 > timeline_mactime.csv
```

### Bash 脚本：日志异常检测

```bash
#!/bin/bash

echo "====== 日志异常检测 ======"
echo ""

echo "[1] 日志文件完整性检查"
for logfile in /var/log/auth.log /var/log/syslog /var/log/kern.log; do
    if [ -f "$logfile" ]; then
        size=$(stat -c%s "$logfile" 2>/dev/null)
        mtime=$(stat -c%y "$logfile" 2>/dev/null)
        if [ "$size" -eq 0 ] 2>/dev/null; then
            echo "[!] $logfile 文件大小为 0（可能被清空）"
        else
            echo "[-] $logfile 大小=${size} 修改时间=${mtime}"
        fi
    else
        echo "[!] $logfile 不存在（可能被删除）"
    fi
done
echo ""

echo "[2] 日志时间跳跃检测"
if [ -f /var/log/auth.log ]; then
    prev_ts=""
    while IFS= read -r line; do
        ts=$(echo "$line" | awk '{print $1, $2, $3}')
        if [ -n "$prev_ts" ]; then
            prev_epoch=$(date -d "$prev_ts" +%s 2>/dev/null)
            curr_epoch=$(date -d "$ts" +%s 2>/dev/null)
            if [ -n "$prev_epoch" ] && [ -n "$curr_epoch" ]; then
                diff=$((curr_epoch - prev_epoch))
                if [ "$diff" -gt 86400 ] || [ "$diff" -lt -3600 ]; then
                    echo "[!] 时间跳跃: $prev_ts -> $ts (差值: ${diff}s)"
                fi
            fi
        fi
        prev_ts="$ts"
    done < <(tail -500 /var/log/auth.log)
fi
echo ""

echo "[3] auditd 状态检查"
systemctl is-active auditd 2>/dev/null || echo "[!] auditd 未运行"
augenrules --status 2>/dev/null
auditctl -l 2>/dev/null | head -20
echo ""

echo "[4] journal 完整性"
journalctl --verify 2>&1 | grep -v "PASS\|OK" | head -10
echo ""

echo "[5] 认证失败统计"
grep -c "Failed password" /var/log/auth.log 2>/dev/null
grep "Failed password" /var/log/auth.log 2>/dev/null | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn | head -10
```

---

## 0x04 文件系统取证（ext4/xfs/btrfs）

### ext4 文件系统结构与取证价值

ext4 是 Linux 最常用的文件系统，其结构设计对取证分析具有重要价值：

| 结构组件 | 取证价值 |
|---------|---------|
| Superblock | 文件系统元信息（创建时间、挂载次数、块大小） |
| Block Group | 数据组织单元，包含 inode table 和 data blocks |
| Inode | 文件元数据（权限/所有者/时间戳/数据块指针） |
| Inode Table | inode 的连续存储区域 |
| Journal (jbd2) | 事务日志，可用于恢复已删除操作 |
| Extent Tree | 文件数据块映射关系 |
| Directory Entry | 目录项（包含文件名和 inode 号） |

```bash
dumpe2fs /dev/sda1 2>/dev/null | head -50
dumpe2fs /dev/sda1 2>/dev/null | grep -i "created\|mount count\|last mounted"
debugfs -R "stat <inode_number>" /dev/sda1
debugfs -R "ls -l <inode_number>" /dev/sda1
debugfs -R "logdump -a" /dev/sda1
```

### xfs 文件系统特点与取证方法

xfs 是高性能日志文件系统，常用于大容量存储场景：

```bash
xfs_info /dev/sda1
xfs_db -c "sb 0" -c "p" /dev/sda1
xfs_db -c "inode <inode_number>" -c "p" /dev/sda1
xfs_logrecover -n /dev/sda1
```

### btrfs 快照与 COW 取证

btrfs 的写时复制（COW）特性和快照功能为取证提供了独特价值：即使文件被修改或删除，旧版本数据可能仍然存在于快照中。

```bash
btrfs subvolume list /
btrfs subvolume show /
btrfs inspect-internal inode /path/to/file
btrfs filesystem show
```

### 文件时间戳分析

Linux 文件系统维护四种时间戳，每种都有不同的取证意义：

| 时间戳 | 缩写 | 含义 | 取证意义 |
|--------|------|------|---------|
| Access Time | atime | 最后访问时间 | 文件是否被读取（注意 noatime 挂载选项） |
| Modify Time | mtime | 最后修改时间 | 文件内容最后变更时间 |
| Change Time | ctime | 最后状态变更时间 | 元数据（权限/所有者）最后变更时间 |
| Birth Time | crtime/btime | 创建时间 | 文件创建时间（仅 ext4/xfs 支持） |

```bash
stat /etc/passwd
debugfs -R "stat <$(stat -c %i /etc/passwd)>" /dev/sda1 | grep crtime
xfs_db -c "inode $(stat -c %i /etc/passwd)" -c "p" /dev/sda1 | grep -i "crtime\|mtime\|atime\|ctime"
```

时间戳篡改检测（timestomping）：当 mtime 早于 crtime 时，说明 mtime 可能被伪造。当 atime 早于系统安装时间时，说明 atime 可能被伪造。

### ext4 日志（jbd2）分析与已删除文件恢复

ext4 的 jbd2 日志层记录了文件系统的事务操作，可以用于恢复已删除的文件或分析攻击者的文件操作：

```bash
debugfs -R "logdump -a" /dev/sda1 > jbd2_dump.txt
debugfs -R "logdump -b <block_number>" /dev/sda1
debugfs -R "ls -d /path/to/deleted/dir" /dev/sda1
debugfs -R "dump <inode_number> /recovery/output_file" /dev/sda1
```

使用 Sleuth Kit 恢复已删除文件：

```bash
fls -r -d /dev/sda1 | grep "(deleted)"
icat /dev/sda1 <inode_number> > recovered_file
blkls /dev/sda1 > unallocated_space.raw
strings unallocated_space.raw | grep -i "password\|key\|token"
```

### 文件类型识别与 magic number 验证

攻击者经常通过修改文件扩展名来伪装恶意文件。通过检查文件头的 magic number 可以识别真实文件类型：

```bash
file /tmp/suspicious_file
xxd /tmp/suspicious_file | head -5
xxd -l 32 /tmp/suspicious_file
```

常见 magic number：

| Magic Number | 文件类型 |
|-------------|---------|
| `7f 45 4c 46` | ELF 可执行文件 |
| `23 21 2f 62` | Shell 脚本（#!/b） |
| `50 4b 03 04` | ZIP/JAR/DOCX |
| `1f 8b 08` | gzip 压缩文件 |
| `89 50 4e 47` | PNG 图片 |
| `ca fe ba be` | Java class 文件 |
| `7f 45 4c 46` | 共享库 (.so) |

### 特殊文件取证

| 文件类型 | 取证关注点 | 检测命令 |
|---------|-----------|---------|
| 符号链接 | 指向恶意目标的链接 | `find / -type l -exec ls -la {} \;` |
| 硬链接 | 绕过权限限制的隐藏副本 | `find / -samefile /etc/passwd` |
| 设备文件 | 伪造的设备节点 | `find / -type b -o -type c` |
| Named Pipe | 进程间通信通道（可能被用于数据外泄） | `find / -type p` |
| Socket | 本地进程通信 | `find / -type s` |

---

## 0x05 Rootkit 检测与 LKM 恶意软件分析

### Linux rootkit 分类

| 类型 | 实现方式 | 检测难度 | 典型代表 |
|------|---------|---------|---------|
| LKM Rootkit | 内核模块，hook syscall/ftrace | 高 | Reptile, Suterusu, Diamorphine |
| 用户态 Rootkit | 替换系统二进制或 LD_PRELOAD | 中 | Azazel, libpcap hack |
| Firmware Rootkit | 修改 BIOS/UEFI/网卡固件 | 极高 | LoJax, MoonBounce |
| Bootkit | 修改 GRUB/引导扇区 | 高 | FinSpy bootloader |
| eBPF Rootkit | 利用 eBPF 程序 hook 内核函数 | 高 | BPFDoor |

### 知名 rootkit 工具包特征

**Reptile**

| 特征 | 说明 |
|------|------|
| 隐藏方式 | LKM，hook syscall + ftrace |
| 隐藏机制 | 通过 magic keyword 隐藏文件/进程/网络 |
| 后门 | 支持 TCP/UDP/HTTP 反向 Shell |
| 检测线索 | `/lib/ld-linux.so` 被替换、`/lib/kmod.ko` 文件 |

**Suterusu**

| 特征 | 说明 |
|------|------|
| 架构 | 支持 x86/x64 ARM |
| 隐藏 | hook sys_getdents64 隐藏文件/进程 |
| 后门 | 通过 iptables 规则匹配特定 SYN 包触发 |
| 检测线索 | syscall table 中 getdents64 被替换 |

**Diamorphine**

| 特征 | 说明 |
|------|------|
| 隐藏 | 通过 magic string 触发隐藏 |
| 提权 | 任何用户可通过 magic string 获取 root |
| 检测线索 | 内核模块列表中不可见但 kallsyms 中存在 |

### LKM rootkit 检测技术

**内核模块列表交叉验证**

```bash
lsmod > /tmp/lsmod_output.txt
cat /proc/modules > /tmp/proc_modules.txt
diff <(awk '{print $1}' /tmp/lsmod_output.txt | sort) <(awk '{print $1}' /tmp/proc_modules.txt | sort)
```

如果 `/proc/modules` 中存在 `lsmod` 未显示的模块，或者反之，说明可能存在 rootkit。

**syscall table 完整性检查**

```bash
cat /proc/kallsyms | grep "sys_call_table"
cat /proc/kallsyms | grep " T sys_getdents64"
cat /proc/kallsyms | grep " T sys_getdents"
```

使用 System.map 对比：

```bash
grep sys_call_table /boot/System.map-$(uname -r)
grep sys_call_table /proc/kallsyms
```

**IDT/GDT 异常检测**

```bash
cat /proc/kallsyms | grep " idt_table"
cat /proc/kallsyms | grep " first_cpu_"
sidt_output=$(cat /proc/kallsyms | grep "idt")
```

**内核 hook 检测（ftrace/kprobe）**

```bash
cat /sys/kernel/debug/tracing/enabled
cat /sys/kernel/debug/tracing/available_filter_functions | wc -l
cat /sys/kernel/debug/tracing/set_ftrace_filter
cat /sys/kernel/debug/kprobes/list
```

### 用户态 rootkit 检测

```bash
echo $LD_PRELOAD
cat /etc/ld.so.preload 2>/dev/null
cat /etc/ld.so.conf /etc/ld.so.conf.d/*.conf 2>/dev/null
ldd /bin/ls | grep -v "libc\|ld-linux"
strace -f /bin/ls 2>&1 | grep -i "open\|read\|write" | head -30
```

### 内核完整性验证

```bash
grep "T " /proc/kallsyms | sort > /tmp/runtime_symbols.txt
nm /boot/vmlinux-$(uname -r) 2>/dev/null | grep " T " | sort > /tmp/boot_symbols.txt
diff /tmp/runtime_symbols.txt /tmp/boot_symbols.txt | head -50
```

### Bash 脚本：rootkit 快速检测

```bash
#!/bin/bash

echo "====== Rootkit 快速检测 ======"
echo ""

echo "[1] 内核模块交叉验证"
lsmod_pids=$(awk '{print $1}' <(lsmod) | sort -u)
proc_pids=$(awk '{print $1}' /proc/modules | sort -u)
diff_result=$(diff <(echo "$lsmod_pids") <(echo "$proc_pids"))
if [ -n "$diff_result" ]; then
    echo "[!] lsmod 与 /proc/modules 不一致:"
    echo "$diff_result"
fi
echo ""

echo "[2] LD_PRELOAD 检查"
if [ -f /etc/ld.so.preload ]; then
    echo "[!] /etc/ld.so.preload 存在:"
    cat /etc/ld.so.preload
fi
env_preload=$(env | grep LD_PRELOAD)
if [ -n "$env_preload" ]; then
    echo "[!] LD_PRELOAD 环境变量: $env_preload"
fi
echo ""

echo "[3] 可疑内核模块"
find /lib/modules/$(uname -r) -name "*.ko" -newer /boot/vmlinuz-$(uname -r) 2>/dev/null | while read mod; do
    echo "[!] 可疑模块: $mod (修改时间晚于内核)"
done
echo ""

echo "[4] ftrace hook 检测"
if [ -f /sys/kernel/debug/tracing/set_ftrace_filter ]; then
    filters=$(cat /sys/kernel/debug/tracing/set_ftrace_filter 2>/dev/null | wc -l)
    if [ "$filters" -gt 0 ]; then
        echo "[!] ftrace 过滤器非空 ($filters 条):"
        cat /sys/kernel/debug/tracing/set_ftrace_filter 2>/dev/null
    fi
fi
echo ""

echo "[5] 已知 rootkit 文件检测"
rootkit_files=(
    "/lib/kmod.ko"
    "/etc/ld.so.preload"
    "/usr/lib/libhk0.so"
    "/dev/.blkfn"
)
for f in "${rootkit_files[@]}"; do
    if [ -f "$f" ]; then
        echo "[!] 已知 rootkit 文件: $f"
    fi
done
echo ""

echo "[6] SUID/SGID 异常检测"
find / -perm -4000 -type f 2>/dev/null | while read f; do
    echo "  SUID: $f"
done
find / -perm -2000 -type f 2>/dev/null | while read f; do
    echo "  SGID: $f"
done
echo ""

echo "====== 检测完成 ======"
```

---

## 0x06 Linux 内存取证

### LiME (Linux Memory Extractor) 使用与最佳实践

LiME 是 Linux 环境下最常用的内存采集工具，以内核模块形式运行，支持 raw、padded 和 lime 三种输出格式。

```bash
git clone https://github.com/504ensicsLabs/LiME
cd LiME/src
make
insmod lime-$(uname -r).ko "path=/evidence/memdump.lime format=lime"
```

LiME 参数说明：

| 参数 | 说明 |
|------|------|
| `path` | 输出路径（支持本地文件/TCP 输出） |
| `format` | 输出格式：raw/padded/lime |
| `dio` | 直接 I/O 模式（减少内存占用） |
| `timeout` | 网络输出超时时间 |
| `max_fileops` | 最大文件操作次数 |

TCP 远程采集（减少对目标系统的影响）：

```bash
insmod lime-$(uname -r).ko "path=tcp:4444 format=lime"
nc attacker_ip 4444 > memdump.lime
```

### 内存镜像格式分析

| 格式 | 特点 | Volatility3 兼容性 |
|------|------|-------------------|
| raw | 原始内存转储，无头部信息 | 需要额外指定参数 |
| padded | raw + 零填充不可读区域 | 支持 |
| lime | LiME 专用格式，包含段头部信息 | 原生支持（推荐） |

### Volatility3 Linux 插件体系

```bash
vol -f /evidence/memdump.lime linux.pslist
vol -f /evidence/memdump.lime linux.psaux
vol -f /evidence/memdump.lime linux.pstree
vol -f /evidence/memdump.lime linux.check_syscall
vol -f /evidence/memdump.lime linux.check_idt
vol -f /evidence/memdump.lime linux.malfind
vol -f /evidence/memdump.lime linux.proc_maps
vol -f /evidence/memdump.lime linux.kernel_open_files
vol -f /evidence/memdump.lime linux.elfs
vol -f /evidence/memdump.lime linux.envars
vol -f /evidence/memdump.lime linux.tty_check
vol -f /evidence/memdump.lime linux.check_modules
vol -f /evidence/memdump.lime linux.lsmod
vol -f /evidence/memdump.lime linux.vmaregexscan --regex "password|secret|token"
```

核心插件取证价值：

| 插件 | 功能 | 取证场景 |
|------|------|---------|
| linux_pslist | 遍历 task_struct 链表 | 发现隐藏进程 |
| linux_psaux | 进程命令行参数 | 识别恶意命令 |
| linux_pstree | 进程树关系 | 异常父子关系检测 |
| linux_check_syscall | syscall table 完整性 | 检测 syscall hook |
| linux_check_idt | IDT 完整性检查 | 检测中断 hook |
| linux_malfind | 可疑内存区域 | 检测代码注入 |
| linux_proc_maps | 进程内存映射 | 异常映射检测 |
| linux_check_modules | 内核模块验证 | 检测隐藏模块 |

### 无文件恶意代码内存检测

无文件恶意代码不写入磁盘，仅在内存中运行。检测方法：

```bash
vol -f memdump.lime linux.malfind
vol -f memdump.lime linux.vadyarascan --yara-rules /rules/linux_malware.yar
vol -f memdump.lime linux.vmaregexscan --regex "bash\s+-i\s+>&\s+/dev/tcp"
vol -f memdump.lime linux.vmaregexscan --regex "eval\(base64_decode"
```

### 内核态 vs 用户态内存分析

| 分析维度 | 内核态 | 用户态 |
|---------|--------|--------|
| 地址范围 | 高地址空间（通常 > 0xFFFF800000000000） | 低地址空间 |
| 分析目标 | 内核代码/模块/syscall table | 进程堆/栈/共享库 |
| 检测重点 | LKM rootkit/syscall hook | 代码注入/shellcode |
| 工具 | linux_check_syscall/linux_check_modules | linux_malfind/linux_proc_maps |

---

## 0x07 SSH 密钥与远程访问取证

### SSH 密钥体系取证

SSH 密钥是 Linux 远程访问的核心认证机制，也是攻击者建立持久化的首选目标。

| 文件 | 路径 | 取证价值 |
|------|------|---------|
| authorized_keys | `~/.ssh/authorized_keys` | 已授权公钥列表（攻击者可能注入） |
| known_hosts | `~/.ssh/known_hosts` | 已连接主机记录 |
| id_rsa / id_ed25519 | `~/.ssh/id_*` | 私钥文件（可能被窃取） |
| config | `~/.ssh/config` | SSH 客户端配置（可能包含后门配置） |
| sshd_config | `/etc/ssh/sshd_config` | SSH 服务端配置 |

```bash
find / -name "authorized_keys" -type f 2>/dev/null
find / -name "id_rsa" -o -name "id_ed25519" -o -name "id_ecdsa" 2>/dev/null
cat /etc/ssh/sshd_config | grep -v "^#\|^$"
```

### SSH 配置篡改检测

攻击者可能修改 `sshd_config` 以建立后门：

```bash
grep -i "permitrootlogin\|passwordauthentication\|pubkeyauthentication\|authorizedkeysfile\|port\|listenaddress\|allowusers\|allowgroups\|match\|forcecommand\|x11forwarding" /etc/ssh/sshd_config
```

常见篡改手法：

| 篡改内容 | 风险 | 检测方式 |
|---------|------|---------|
| 修改 AuthorizedKeysFile 路径 | 使用非标准位置的密钥 | 对比默认配置 |
| 开启 PermitRootLogin | 允许 root 直接登录 | 检查是否设为 yes |
| 添加 Match 块后门 | 特定用户/IP 使用特殊配置 | 检查 Match 块内容 |
| 修改端口 | 在非标准端口监听 | 检查 Port 配置 |
| 设置 ForceCommand | 限制用户只能执行特定命令 | 检查 ForceCommand 配置 |

### SSH 日志分析

```bash
grep "sshd" /var/log/auth.log | grep -E "Accepted|Failed|Invalid|error|break-in"
grep "sshd" /var/log/auth.log | grep "Accepted" | awk '{print $9, $11}' | sort | uniq -c | sort -rn
grep "sshd" /var/log/auth.log | grep "Failed" | awk '{print $NF}' | sort | uniq -c | sort -rn | head -20
grep "sshd" /var/log/auth.log | grep "Invalid user" | awk '{print $8}' | sort | uniq -c | sort -rn | head -20
```

### SSH 隧道检测

```bash
ss -tunap | grep ssh
netstat -tunap | grep ":22\|ssh"
ps aux | grep "ssh.*-[LRD]\|ssh.*tunnel\|ssh.*forward"
grep -r "LocalForward\|RemoteForward\|DynamicForward" /etc/ssh/ ~/.ssh/ 2>/dev/null
```

### SSH 密钥注入攻击检测

```bash
find / -name "authorized_keys" -type f -exec stat -c "%U:%G %n %y" {} \; 2>/dev/null
find / -name "authorized_keys" -type f -exec wc -l {} \; 2>/dev/null
find / -name "authorized_keys" -type f -exec md5sum {} \; 2>/dev/null
```

### 其他远程访问工具取证

```bash
tmux list-sessions 2>/dev/null
screen -ls 2>/dev/null
ps aux | grep -E "vnc\|novnc\|x11vnc\|tigervnc"
ps aux | grep -E "rdesktop\|xfreerdp\|xrdp"
ls -la /tmp/.X11-unix/
```

### Bash 脚本：SSH 异常检测

```bash
#!/bin/bash

echo "====== SSH 异常检测 ======"
echo ""

echo "[1] authorized_keys 全面扫描"
find / -name "authorized_keys" -type f 2>/dev/null | while read f; do
    owner=$(stat -c "%U" "$f")
    count=$(wc -l < "$f")
    mtime=$(stat -c "%y" "$f")
    echo "  文件: $f | 所有者: $owner | 密钥数: $count | 修改时间: $mtime"
done
echo ""

echo "[2] sshd_config 异常配置"
grep -i "permitrootlogin yes\|passwordauthentication yes\|permitemptylogin yes" /etc/ssh/sshd_config 2>/dev/null
grep -i "Match\|ForceCommand\|AuthorizedKeysFile" /etc/ssh/sshd_config 2>/dev/null | grep -v "^#"
echo ""

echo "[3] SSH 隧道检测"
ps aux | grep -E "ssh.*-[LRD]" | grep -v grep
ss -tunap | grep -E "ssh|:22" | grep -v "sshd"
echo ""

echo "[4] SSH 暴力破解检测"
grep "Failed password" /var/log/auth.log 2>/dev/null | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn | head -10
echo ""

echo "[5] 异常 SSH 连接"
grep "Accepted" /var/log/auth.log 2>/dev/null | awk '{print $1, $2, $3, $9, $11}' | sort | uniq -c | sort -rn | head -20
echo ""

echo "[6] 非标准 SSH 密钥文件"
find / -name "*.pub" -not -path "*/proc/*" -not -path "*/sys/*" 2>/dev/null | while read f; do
    echo "  $f"
done
echo ""

echo "====== 检测完成 ======"
```

---

## 0x08 持久化机制取证

### cron/at 定时任务分析

定时任务是最常见的持久化手段，攻击者通过 cron 实现恶意代码的周期性执行。

| 位置 | 路径 | 说明 |
|------|------|------|
| 系统 crontab | `/etc/crontab` | 系统级定时任务 |
| cron.d 目录 | `/etc/cron.d/` | 额外的系统级任务文件 |
| cron.daily/hourly | `/etc/cron.daily/` `/etc/cron.hourly/` | 周期性执行目录 |
| 用户 crontab | `/var/spool/cron/crontabs/` | 各用户的 crontab |
| at 任务 | `/var/spool/at/` | 一次性定时任务 |

```bash
cat /etc/crontab
ls -la /etc/cron.d/
ls -la /etc/cron.daily/ /etc/cron.hourly/ /etc/cron.weekly/ /etc/cron.monthly/
for user in $(cut -f1 -d: /etc/passwd); do echo "=== $user ==="; crontab -u "$user" -l 2>/dev/null; done
ls -la /var/spool/cron/crontabs/
cat /var/spool/cron/crontabs/* 2>/dev/null
```

### systemd service/timer 持久化检测

```bash
systemctl list-timers --all
systemctl list-unit-files --type=service | grep enabled
find /etc/systemd/system/ /usr/lib/systemd/system/ /run/systemd/system/ -name "*.service" -newer /etc/hostname 2>/dev/null
find /etc/systemd/system/ /usr/lib/systemd/system/ -name "*.timer" 2>/dev/null
```

检查可疑 service 文件：

```bash
grep -rl "ExecStart\|ExecStartPre\|ExecStartPost" /etc/systemd/system/ 2>/dev/null | while read f; do
    exec_line=$(grep "ExecStart" "$f" | head -1)
    echo "$f: $exec_line"
done
```

### Shell 启动脚本篡改

```bash
for f in /etc/profile /etc/bash.bashrc /etc/profile.d/*.sh; do
    [ -f "$f" ] && echo "=== $f ===" && tail -5 "$f"
done
for user in $(cut -f1 -d: /etc/passwd); do
    home=$(getent passwd "$user" | cut -d: -f6)
    for rc in .bashrc .bash_profile .profile .zshrc .cshrc; do
        [ -f "$home/$rc" ] && echo "=== $user: $home/$rc ===" && tail -5 "$home/$rc"
    done
done
```

### PAM 模块后门检测

```bash
cat /etc/pam.d/common-auth
cat /etc/pam.d/common-password
cat /etc/pam.d/sshd
cat /etc/pam.d/system-auth 2>/dev/null
find /lib/x86_64-linux-gnu/security/ /lib64/security/ -name "pam_*.so" -newer /etc/pam.d/ 2>/dev/null
```

### ld.so.conf 与 LD_PRELOAD 劫持

```bash
cat /etc/ld.so.preload 2>/dev/null
cat /etc/ld.so.conf
cat /etc/ld.so.conf.d/*.conf 2>/dev/null
ldconfig -p | head -30
```

### 包管理器投毒分析

```bash
cat /etc/apt/sources.list
ls /etc/apt/sources.list.d/
cat /etc/apt/sources.list.d/*
cat /etc/yum.repos.d/*.repo 2>/dev/null
dpkg -l | tail -30
rpm -qa --last | head -30
```

DKMS 模块注入检测：

```bash
ls -la /var/lib/dkms/
dkms status 2>/dev/null
find /usr/src/ -name "dkms.conf" 2>/dev/null
```

### 内核命令行参数篡改

```bash
cat /proc/cmdline
cat /boot/grub/grub.cfg 2>/dev/null | grep -E "linux\s|linux16\s|linuxefi"
cat /boot/grub2/grub.cfg 2>/dev/null | grep -E "linux\s|linux16\s|linuxefi"
```

### Bash 脚本：持久化全面扫描

```bash
#!/bin/bash

echo "====== 持久化全面扫描 ======"
echo ""

echo "[1] cron 任务扫描"
echo "--- /etc/crontab ---"
cat /etc/crontab 2>/dev/null | grep -v "^#\|^$"
echo "--- /etc/cron.d/ ---"
ls -la /etc/cron.d/ 2>/dev/null
echo "--- 用户 crontab ---"
for user in $(cut -f1 -d: /etc/passwd); do
    ct=$(crontab -u "$user" -l 2>/dev/null)
    if [ -n "$ct" ]; then
        echo "  [$user] $ct"
    fi
done
echo ""

echo "[2] systemd 持久化检测"
systemctl list-unit-files --type=service --state=enabled 2>/dev/null | grep -v "systemd\|dbus\|ssh\|cron\|network\|getty"
systemctl list-timers --all 2>/dev/null | head -20
echo ""

echo "[3] 启动脚本检测"
for f in /etc/profile /etc/bash.bashrc /etc/profile.d/*.sh; do
    [ -f "$f" ] && grep -l "curl\|wget\|nc\|bash -i\|python\|perl\|ruby" "$f" 2>/dev/null
done
echo ""

echo "[4] PAM 后门检测"
grep "pam_" /etc/pam.d/common-auth /etc/pam.d/common-password 2>/dev/null | grep -v "^#\|pam_unix\|pam_deny\|pam_permit\|pam_env\|pam_succeed_if\|pam_cap\|pam_systemd"
echo ""

echo "[5] LD_PRELOAD 劫持检测"
[ -f /etc/ld.so.preload ] && echo "[!] /etc/ld.so.preload:" && cat /etc/ld.so.preload
env | grep LD_PRELOAD && echo "[!] LD_PRELOAD 环境变量已设置"
echo ""

echo "[6] 包管理器异常"
apt-key list 2>/dev/null | grep -E "uid|pub" | head -20
cat /etc/apt/sources.list 2>/dev/null | grep -v "^#\|^$"
echo ""

echo "[7] 内核命令行"
cat /proc/cmdline
echo ""

echo "====== 扫描完成 ======"
```

---

## 0x09 登录记录与用户活动取证

### UTMP/WTMP/lastlog 文件结构与分析

Linux 系统使用三个关键文件记录用户登录信息：

| 文件 | 路径 | 内容 | 格式 |
|------|------|------|------|
| utmp | `/var/run/utmp` | 当前登录用户 | 二进制 |
| wtmp | `/var/log/wtmp` | 历史登录记录 | 二进制（追加写入） |
| lastlog | `/var/log/lastlog` | 每个用户最后登录 | 二进制（固定长度记录） |
| btmp | `/var/log/btmp` | 失败登录尝试 | 二进制 |

```bash
last -f /var/log/wtmp -a -i
last -f /var/log/wtmp | grep -v "reboot\|shutdown"
lastb -a -i
lastlog
lastlog -u root
lastlog -t 7
```

### 登录异常检测

```bash
last | awk '{print $1, $3}' | sort | uniq -c | sort -rn | head -20
last | grep "pts/" | awk '{print $1, $3, $9}' | sort | uniq -c | sort -rn
lastb | awk '{print $1, $3}' | sort | uniq -c | sort -rn | head -20
```

异常模式识别：

| 异常类型 | 检测方法 |
|---------|---------|
| 非工作时间登录 | 分析 last 输出的时间列 |
| 异常来源 IP | 分析 last 输出的 IP 列 |
| 高频暴力破解 | 分析 btmp 中的失败记录 |
| 影子账户 | 对比 `/etc/passwd` 与 lastlog 记录 |
| UID 0 账户 | `awk -F: '$3==0{print}' /etc/passwd` |

### sudo 日志分析

```bash
grep "sudo" /var/log/auth.log | grep -v "session opened\|session closed\|pam_unix"
grep "COMMAND=" /var/log/auth.log
grep "sudo" /var/log/auth.log | awk '{print $1, $2, $3, $6, $8}' | head -50
```

### 用户枚举与影子账户检测

```bash
awk -F: '$3==0 {print "UID 0 账户: "$1}' /etc/passwd
awk -F: '$2!="x" && $2!="*" && $2!="!" {print "可疑密码字段: "$1" -> "$2}' /etc/passwd
cat /etc/shadow | awk -F: '$2!="" && $2!="*" && $2!="!" {print "可登录账户: "$1}'
awk -F: '$7=="" {print "无过期策略: "$1}' /etc/shadow
getent passwd | awk -F: '$3>=1000 && $3<65534 {print $1, $3, $6, $7}'
```

### Python 脚本：WTMP 解析与异常登录检测

```python
#!/usr/bin/env python3
import struct
import socket
import sys
from datetime import datetime

WTMP_FILE = "/var/log/wtmp"
WTMP_FORMAT = "hi32s4s32s256shhiii4i20x"
WTMP_SIZE = struct.calcsize(WTMP_FORMAT)

USER_LOGIN = 7
USER_LOGOUT = 8

def parse_wtmp(filepath):
    records = []
    with open(filepath, "rb") as f:
        while True:
            data = f.read(WTMPT_SIZE)
            if len(data) < WTMPT_SIZE:
                break
            fields = struct.unpack(WTMPT_FORMAT, data)
            ut_type = fields[0]
            ut_pid = fields[1]
            ut_line = fields[2].rstrip(b'\x00').decode('utf-8', errors='ignore')
            ut_id = fields[3].rstrip(b'\x00').decode('utf-8', errors='ignore')
            ut_user = fields[4].rstrip(b'\x00').decode('utf-8', errors='ignore')
            ut_host = fields[5].rstrip(b'\x00').decode('utf-8', errors='ignore')
            ut_tv_sec = fields[7]
            timestamp = datetime.fromtimestamp(ut_tv_sec)
            records.append({
                "type": ut_type,
                "user": ut_user,
                "host": ut_host,
                "line": ut_line,
                "timestamp": timestamp
            })
    return records

def detect_anomalies(records):
    login_hours = {}
    login_sources = {}
    for r in records:
        if r["type"] == USER_LOGIN and r["user"]:
            hour = r["timestamp"].hour
            login_hours.setdefault(r["user"], []).append(hour)
            login_sources.setdefault(r["user"], set()).add(r["host"])

    print("=== 非工作时间登录检测 (22:00-06:00) ===")
    for user, hours in login_hours.items():
        off_hours = [h for h in hours if h >= 22 or h < 6]
        if off_hours:
            print(f"  [!] {user}: {len(off_hours)} 次非工作时间登录")
            print(f"      时间分布: {sorted(set(off_hours))}")

    print("\n=== 多来源 IP 登录检测 ===")
    for user, sources in login_sources.items():
        if len(sources) > 3:
            print(f"  [!] {user}: 来自 {len(sources)} 个不同来源")
            for s in sorted(sources):
                print(f"      {s}")

if __name__ == "__main__":
    wtmp_path = sys.argv[1] if len(sys.argv) > 1 else WTMPT_FILE
    records = parse_wtmp(wtmp_path)
    print(f"共解析 {len(records)} 条记录\n")
    detect_anomalies(records)
```

---

## 0x0A 容器逃逸取证

### 容器逃逸攻击向量回顾

| 逃逸方式 | 原理 | 前提条件 |
|---------|------|---------|
| 特权容器 | 使用 `--privileged` 运行，拥有完整设备访问权限 | 容器以特权模式启动 |
| 挂载逃逸 | 挂载宿主机文件系统 | 容器具有 CAP_SYS_ADMIN |
| 内核漏洞 | 利用内核漏洞（如 CVE-2024-1086）突破命名空间 | 存在可利用的内核漏洞 |
| Docker Socket | 挂载 `/var/run/docker.sock`，直接控制 Docker daemon | Socket 被挂载到容器内 |
| procfs 逃逸 | 通过 `/proc` 文件系统访问宿主机 | 不安全的 /proc 挂载 |
| cgroup 释放代理 | 利用 cgroup notify_on_release 机制 | 容器具有 CAP_SYS_ADMIN |

### 逃逸痕迹识别

**宿主机进程列表异常**

```bash
ps auxf | grep -v "\[" | head -50
cat /proc/1/cgroup
cat /proc/1/mountinfo | head -30
```

**挂载点异常**

```bash
cat /proc/1/mountinfo | grep -E "overlay|docker|containerd"
mount | grep -E "ext4|xfs" | grep -v "overlay"
findmnt --target /host
```

**cgroup 配置异常**

```bash
cat /proc/1/cgroup
cat /sys/fs/cgroup/*/notify_on_release 2>/dev/null
cat /sys/fs/cgroup/*/release_agent 2>/dev/null
```

**seccomp/AppArmor 策略被修改**

```bash
grep Seccomp /proc/1/status
cat /proc/1/status | grep -E "Cap|Seccomp"
aa-status 2>/dev/null
```

### 容器运行时日志分析

```bash
journalctl -u docker --since "24 hours ago"
journalctl -u containerd --since "24 hours ago"
journalctl -u cri-o --since "24 hours ago"
cat /var/log/containers/*.log | tail -100
docker events --since 24h
```

### 恶意镜像检测

```bash
docker history <image_id>
docker inspect <image_id>
docker save <image_id> -o image.tar
mkdir /tmp/image_analysis && tar xf image.tar -C /tmp/image_analysis
cat /tmp/image_analysis/manifest.json
for layer in $(cat /tmp/image_analysis/manifest.json | python3 -c "import json,sys; [print(l) for l in json.load(sys.stdin)[0]['Layers']]"); do
    echo "=== $layer ==="
    tar tf /tmp/image_analysis/$layer 2>/dev/null | head -20
done
```

### 容器网络取证

```bash
docker network ls
docker network inspect <network_name>
iptables -t nat -L -n -v
iptables -t filter -L -n -v
ip link show | grep veth
brctl show 2>/dev/null
```

---

## 0x0B 证据强度分层与案例关联

### 证据强度分类

| 强度等级 | 分类 | 示例 | 处置建议 |
|---------|------|------|---------|
| 确认恶意 | 直接证据 | 已知恶意软件哈希匹配、rootkit 模块、C2 通信记录 | 立即隔离、深度取证 |
| 高度可疑 | 强关联证据 | 异常 cron 任务指向外部 IP、authorized_keys 中出现未知密钥 | 优先调查、收集更多证据 |
| 需要关注 | 弱关联证据 | 非工作时间登录、异常端口开放 | 持续监控、关联分析 |
| 信息性 | 背景信息 | 系统配置基线偏离、软件版本过旧 | 记录存档、纳入基线 |

### Linux 入侵 IOC 汇总

| IOC 类型 | 示例 | 检测方法 |
|---------|------|---------|
| 文件哈希 | 已知恶意 ELF 的 SHA256 | YARA 扫描 / hash 比对 |
| 网络指标 | C2 服务器 IP/域名 | 网络日志关联 / DNS 查询分析 |
| 进程特征 | 异常进程名/命令行 | ps 分析 / auditd 日志 |
| 持久化指标 | 异常 cron/systemd 条目 | 持久化扫描脚本 |
| 用户行为 | 异常 sudo 命令序列 | auth.log 分析 |
| 内核指标 | 异常内核模块/syscall hook | lsmod 交叉验证 / Volatility3 |

### 多源证据关联方法

关联分析的核心是将来自不同证据源的数据通过时间、实体（进程/用户/文件）和网络连接进行交叉引用：

```
时间关联: auth.log 登录成功 -> auditd EXECVE 命令执行 -> syslog 服务异常
进程关联: ps 异常进程 -> /proc/PID/fd 打开的文件 -> /proc/PID/net 网络连接
用户关联: last 登录记录 -> sudo 日志 -> .bash_history 命令历史
文件关联: 新创建文件 -> crontab 引用 -> 网络连接目标
```

### 时间线构建最佳实践

1. 以 auditd 日志为主时间轴（精度最高）
2. 补充 syslog/journal 事件
3. 叠加文件系统时间戳（mtime/ctime/atime）
4. 标注网络事件（连接建立/断开时间）
5. 使用 plaso/log2timeline 统一时间线格式
6. 标注证据强度等级

---

## 0x0C 自动化检测与狩猎

### Sigma 规则（Linux 系统审计日志相关）

```yaml
title: Linux Suspicious Process Execution via Auditd
id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
status: experimental
description: 检测通过 auditd 日志发现的可疑进程执行
author: Security Team
date: 2026/07/02
logsource:
    product: linux
    service: auditd
detection:
    selection_execve:
        type: "EXECVE"
    selection_suspicious_commands:
        a0|contains:
            - "bash -i"
            - "/dev/tcp"
            - "/dev/udp"
            - "nc -e"
            - "ncat -e"
            - "python -c"
            - "perl -e"
            - "ruby -e"
            - "wget http"
            - "curl http"
            - "base64"
            - "chmod 777"
            - "insmod"
            - "modprobe"
    condition: selection_execve and selection_suspicious_commands
level: high
tags:
    - attack.execution
    - attack.t1059
```

```yaml
title: Linux Kernel Module Loading Detection
id: b2c3d4e5-f6a7-8901-bcde-f12345678901
status: experimental
description: 检测 Linux 内核模块加载行为
author: Security Team
date: 2026/07/02
logsource:
    product: linux
    service: auditd
detection:
    selection:
        type: "SYSCALL"
        syscall: "init_module"
    filter_known_modules:
        exe|startswith:
            - "/usr/lib/modules/"
            - "/lib/modules/"
    condition: selection and not filter_known_modules
level: critical
tags:
    - attack.persistence
    - attack.t1547.006
```

```yaml
title: Linux Privilege Escalation via SUID
id: c3d4e5f6-a7b8-9012-cdef-123456789012
status: experimental
description: 检测 SUID/SGID 位设置行为
author: Security Team
date: 2026/07/02
logsource:
    product: linux
    service: auditd
detection:
    selection:
        type: "SYSCALL"
        syscall: "chmod"
        a1|endswith: "4000"
    filter_standard:
        exe|startswith:
            - "/usr/bin/"
            - "/usr/sbin/"
    condition: selection and not filter_standard
level: high
tags:
    - attack.privilege_escalation
    - attack.t1548.001
```

```yaml
title: Linux SSH Authorized Keys Modification
id: d4e5f6a7-b8c9-0123-defa-234567890123
status: experimental
description: 检测 SSH authorized_keys 文件修改
author: Security Team
date: 2026/07/02
logsource:
    product: linux
    service: auditd
detection:
    selection:
        type: "PATH"
        name|contains: "authorized_keys"
    condition: selection
level: high
tags:
    - attack.persistence
    - attack.t1098.004
```

```yaml
title: Linux Log Tampering Detection
id: e5f6a7b8-c9d0-1234-efab-345678901234
status: experimental
description: 检测日志文件篡改行为
author: Security Team
date: 2026/07/02
logsource:
    product: linux
    service: auditd
detection:
    selection_write:
        type: "SYSCALL"
        syscall: "unlink"
    selection_target:
        dir|startswith: "/var/log/"
    condition: selection_write and selection_target
level: critical
tags:
    - attack.defense_evasion
    - attack.t1070.002
```

### Bash 自动化狩猎脚本集

```bash
#!/bin/bash

echo "====== Linux 威胁狩猎综合脚本 ======"
echo "执行时间: $(date)"
echo "主机名: $(hostname)"
echo ""

echo "[1] 反弹 Shell 检测"
grep -rP "bash\s+-i\s+>&\s+/dev/tcp\|/dev/tcp/\|/dev/udp/" /proc/*/cmdline 2>/dev/null | while read match; do
    pid=$(echo "$match" | cut -d: -f1 | cut -d/ -f3)
    echo "[!] PID=$pid 疑似反弹 Shell: $(cat /proc/$pid/cmdline 2>/dev/null | tr '\0' ' ')"
done
echo ""

echo "[2] 挖矿指标检测"
ss -tunap | grep -E ":3333|:4443|:4444|:5555|:8888|:9999|:14444|:45700" | while read line; do
    echo "[!] 可疑矿池连接: $line"
done
ps aux | grep -iE "xmrig|minerd|cpuminer|ethminer|stratum" | grep -v grep
echo ""

echo "[3] 异常 SUID 文件"
KNOWN_SUID="/usr/bin/sudo /usr/bin/passwd /usr/bin/chsh /usr/bin/chfn /usr/bin/newgrp /usr/bin/gpasswd /usr/bin/su /usr/bin/mount /usr/bin/umount /usr/bin/pkexec"
find / -perm -4000 -type f 2>/dev/null | while read f; do
    if ! echo "$KNOWN_SUID" | grep -q "$f"; then
        echo "[!] 非标准 SUID: $f ($(stat -c '%U:%G %A' "$f"))"
    fi
done
echo ""

echo "[4] 异常 cron 任务"
find /etc/cron* /var/spool/cron -type f 2>/dev/null | while read f; do
    if grep -qE "curl|wget|bash -c|python -c|perl -e|nc |ncat " "$f" 2>/dev/null; then
        echo "[!] 可疑 cron 文件: $f"
        cat "$f" | grep -v "^#\|^$"
    fi
done
echo ""

echo "[5] 异常网络连接"
ss -tunap | grep ESTAB | grep -v "127.0.0.1\|::1" | while read line; do
    pid=$(echo "$line" | grep -oP 'pid=\K[0-9]+')
    if [ -n "$pid" ]; then
        exe=$(readlink /proc/$pid/exe 2>/dev/null)
        if echo "$exe" | grep -qE "nc|ncat|socat|curl|wget|python|perl|ruby|php"; then
            echo "[!] 可疑连接 PID=$pid EXE=$exe LINE=$line"
        fi
    fi
done
echo ""

echo "[6] /tmp 和 /dev/shm 可疑文件"
find /tmp /dev/shm -type f \( -name "*.sh" -o -name "*.py" -o -name "*.pl" -o -executable \) 2>/dev/null | while read f; do
    echo "[!] 可疑文件: $f ($(file "$f"))"
done
echo ""

echo "[7] 异常用户账户"
awk -F: '$3==0 && $1!="root" {print "[!] 非 root UID0 账户: "$1}' /etc/passwd
awk -F: '$2!~/^[x*!]$/ && $2!="" {print "[!] 可疑密码条目: "$1}' /etc/passwd
echo ""

echo "[8] 最近修改的系统文件"
find /etc /usr/bin /usr/sbin /bin /sbin -mtime -7 -type f 2>/dev/null | head -30
echo ""

echo "====== 狩猎完成 ======"
```

### YARA 规则（Linux 恶意软件特征）

```yara
rule Linux_ReverseShell_ELF {
    meta:
        description = "检测包含反弹 Shell 特征的 ELF 文件"
        author = "Security Team"
        date = "2026-07-02"
    strings:
        $bash_tcp = "bash -i >& /dev/tcp/" ascii
        $bash_udp = "bash -i >& /dev/udp/" ascii
        $nc_reverse = "nc -e /bin/sh" ascii wide
        $python_reverse = "socket.socket" ascii
        $python_bind = "socket.bind" ascii
        $perl_reverse = "IO::Socket::INET" ascii
        $mknod = "mknod /tmp/" ascii
        $elf_magic = { 7F 45 4C 46 }
    condition:
        $elf_magic at 0 and any of ($bash_tcp, $bash_udp, $nc_reverse, $python_reverse, $perl_reverse, $mknod)
}

rule Linux_CryptoMiner_Indicators {
    meta:
        description = "检测加密货币挖矿软件特征"
        author = "Security Team"
        date = "2026-07-02"
    strings:
        $stratum = "stratum+tcp://" ascii wide
        $xmrig = "xmrig" ascii wide nocase
        $minerd = "minerd" ascii wide nocase
        $cpuminer = "cpuminer" ascii wide nocase
        $pool_addr = /pool\.[a-z]+\.(com|net|org)/ ascii
        $wallet = /[13][a-km-zA-HJ-NP-Z1-9]{25,34}/ ascii
        $hash_algo = "cryptonight" ascii wide nocase
        $hash_algo2 = "randomx" ascii wide nocase
        $hash_algo3 = "ethash" ascii wide nocase
    condition:
        any of ($stratum, $xmrig, $minerd, $cpuminer) or ($pool_addr and any of ($hash_algo, $hash_algo2, $hash_algo3))
}

rule Linux_LKM_Rootkit_Pattern {
    meta:
        description = "检测 LKM rootkit 常见模式"
        author = "Security Team"
        date = "2026-07-02"
    strings:
        $syscall_table = "sys_call_table" ascii
        $orig_getdents = "orig_getdents" ascii
        $orig_getdents64 = "orig_getdents64" ascii
        $hide_pid = "hide_pid" ascii
        $hide_file = "hide_file" ascii
        $magic_string = "magic_string" ascii
        $module_init = "module_init" ascii
        $cleanup_module = "cleanup_module" ascii
        $kprobe = "register_kprobe" ascii
        $ftrace = "ftrace_set_filter" ascii
        $proc_root = "proc_root" ascii
    condition:
        4 of them
}

rule Linux_Webshell_PHP {
    meta:
        description = "检测 PHP Webshell 特征"
        author = "Security Team"
        date = "2026-07-02"
    strings:
        $eval_base64 = /eval\s*\(\s*base64_decode/ ascii
        $eval_gzinflate = /eval\s*\(\s*gzinflate/ ascii
        $system_cmd = /system\s*\(\s*\$_(GET|POST|REQUEST|COOKIE)/ ascii
        $passthru = /passthru\s*\(\s*\$_(GET|POST|REQUEST)/ ascii
        $shell_exec = /shell_exec\s*\(\s*\$_(GET|POST|REQUEST)/ ascii
        $assert_php7 = /assert\s*\(\s*\$_(GET|POST|REQUEST)/ ascii
        $preg_replace_e = /preg_replace\s*\(.*\/e/ ascii
    condition:
        any of them
}
```

### 与 SIEM 集成方案

| SIEM 平台 | 日志采集方式 | 解析规则 | 告警联动 |
|-----------|-------------|---------|---------|
| Elastic Stack | Filebeat + auditd module | Ingest Pipeline | Elastic Security 规则 |
| Splunk | Splunk Universal Forwarder | props.conf/transforms.conf | Splunk ES 关联分析 |
| Wazuh | Wazuh Agent + ossec.conf | decoder.xml + rules.xml | Wazuh 内置规则 |
| QRadar | syslog forwarding + DSM | 自定义 DSM | QRadar 规则引擎 |
| OpenSearch | Fluentd/Vector + auditd | Index Template | OpenSearch Alerting |

Filebeat auditd 模块配置示例：

```yaml
filebeat.inputs:
- type: auditd
  enabled: true
  audit.rules: |
    -a always,exit -F arch=b64 -S execve -k exec_monitor
    -w /etc/passwd -p wa -k passwd_changes
    -w /etc/shadow -p wa -k shadow_changes
    -w /etc/ssh/sshd_config -p wa -k sshd_config

output.elasticsearch:
  hosts: ["https://elasticsearch:9200"]
  index: "auditd-%{+yyyy.MM.dd}"
```

---

## 0x0D 公开案例分析

### 案例一：APT29（Cozy Bear）Linux 工具集分析

**攻击背景**

APT29 是俄罗斯情报机构关联的高级持续性威胁组织，在针对政府和关键基础设施的攻击中使用了定制化的 Linux 工具集。2022 年 CERT-EU 发布的报告中详细披露了 APT29 在 Linux 系统上使用的工具和技术。

**攻击链还原**

```
初始访问 -> Web 应用漏洞利用 -> Webshell 植入 -> 权限提升 -> 横向移动 -> 数据外泄
```

| 阶段 | 技术 | 工具/方法 |
|------|------|----------|
| 初始访问 | 利用 Exchange 漏洞（CVE-2020/2021） | ProxyShell/ProxyLogon |
| 植入 | 部署 Webshell | China Chopper 变体 |
| 权限提升 | SUID 滥用 + 内核漏洞 | DirtyCow (CVE-2016-5195) |
| 持久化 | SSH 密钥注入 + cron 任务 | authorized_keys 写入 |
| 横向移动 | WMI + SSH + PsExec | 内网凭据传递 |
| 数据外泄 | 加密通道 + DNS 隧道 | 自建 C2 基础设施 |

**取证发现**

1. 在 `/var/www/html/` 目录发现伪装为正常 PHP 文件的 Webshell
2. `/root/.ssh/authorized_keys` 中被注入攻击者公钥
3. 发现自定义 LKM 模块用于隐藏特定进程和网络连接
4. `/etc/cron.d/` 中出现异常的定时任务，定期连接外部 C2
5. 系统日志中存在时间跳跃，表明攻击者尝试清除日志

**IOC**

| 类型 | 值 |
|------|-----|
| 文件哈希 (SHA256) | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| C2 域名 | `update-service.example.com` |
| C2 IP | `185.XX.XX.XX` |
| 恶意文件路径 | `/usr/local/bin/.hidden_backdoor` |
| LKM 模块名 | `netfilter_hook.ko` |

**经验教训**

1. 定期审计 `authorized_keys` 文件，建立基线并监控变更
2. 部署 auditd 规则监控内核模块加载行为
3. 对 Web 应用目录进行完整性校验
4. 日志集中化存储，防止本地篡改
5. 使用 Volatility3 进行内存分析以检测无文件恶意代码

### 案例二：Lazarus Group Linux 挖矿攻击

**攻击背景**

Lazarus Group 是朝鲜关联的威胁组织，以经济利益驱动的攻击闻名。2023-2024 年间，该组织在 Linux 服务器上大规模部署加密货币挖矿软件，通过供应链攻击和漏洞利用实现初始访问。

**攻击链还原**

```
供应链投毒 -> 恶意 Docker 镜像 -> 容器内挖矿 -> 容器逃逸 -> 宿主机持久化
```

| 阶段 | 技术 | 工具/方法 |
|------|------|----------|
| 初始访问 | 投毒的 Docker 镜像（含后门） | 恶意 base image |
| 部署 | 容器内运行 XMRig 挖矿 | Dockerfile 中嵌入挖矿二进制 |
| 逃逸 | 特权容器 + 挂载宿主机 | `--privileged` + hostPath 挂载 |
| 持久化 | systemd service + cron | 宿主机级别持久化 |
| 隐蔽 | 进程名伪装 + 日志清除 | 伪装为 `[kworker]` 内核线程 |

**取证发现**

1. Docker 镜像历史命令中发现 `wget` 下载挖矿二进制
2. 宿主机 `/etc/systemd/system/` 出现可疑的 service 文件
3. 多个进程伪装为内核线程（方括号命名但 exe 指向 `/tmp` 目录）
4. `/var/log/auth.log` 中存在大段时间空白
5. iptables 规则中出现异常的端口转发规则

**IOC**

| 类型 | 值 |
|------|-----|
| 恶意镜像 | `registry.example.com/base/ubuntu:20.04-modified` |
| 挖矿二进制 | `/tmp/.X11-unix/xmrig` |
| 矿池地址 | `pool.hashvault.pro:443` |
| 钱包地址 | `48edfHu7je9MoX9FUmo62XzFc4Gpo9e...` |
| 持久化 service | `/etc/systemd/system/sys-health.service` |
| 伪装进程名 | `[kworker/0:1]`（实际 exe 为 `/tmp/.X11-unix/xmrig`） |

**经验教训**

1. 严格审查 Docker 镜像来源，使用镜像签名验证
2. 避免使用 `--privileged` 模式运行容器
3. 部署容器运行时安全监控（Falco/Tetragon）
4. 监控 `/proc` 中方括号命名但 exe 指向 `/tmp` 的进程
5. 对宿主机和容器的 systemd service 进行基线对比

### 案例三：BPFDoor eBPF 后门分析

**攻击背景**

BPFDoor 是一种利用 eBPF（extended Berkeley Packet Filter）技术的高级后门程序，最早由 SafeBreah 在 2022 年披露。该后门被发现在中国、俄罗斯、伊朗等国的政府和电信组织中被部署，利用 eBPF 程序在内核层面实现隐蔽的通信和控制功能。

**攻击链还原**

```
漏洞利用 -> 植入 BPFDoor -> eBPF 程序加载 -> 被动嗅探 + 主动 Shell -> 数据窃取
```

| 阶段 | 技术 | 工具/方法 |
|------|------|----------|
| 初始访问 | 利用已知漏洞或弱口令 | 多种入口点 |
| 部署 | 植入 eBPF 程序 | bpf() 系统调用 |
| 隐蔽 | eBPF 程序不显示为内核模块 | 绕过 lsmod 检测 |
| 通信 | 被动嗅探 ICMP/UDP 包 | 特定 magic bytes 触发 |
| 控制 | 主动 Shell 功能 | 通过嗅探到的连接反向连接 |

**取证发现**

1. 系统中存在异常的 eBPF 程序（通过 `bpftool prog list` 发现）
2. 没有对应的 LKM 模块（lsmod 无异常）
3. 网络层面存在异常的 ICMP 包处理模式
4. `/proc/*/fd` 中发现指向 bpf 文件描述符的进程
5. 内存取证发现 eBPF 程序的字节码

**IOC**

| 类型 | 值 |
|------|-----|
| eBPF 程序类型 | `BPF_PROG_TYPE_SOCKET_FILTER` |
| 触发协议 | ICMP + 自定义 UDP |
| Magic Bytes | 特定 4 字节序列 |
| 文件路径 | 内存中驻留，无持久化文件 |
| 检测命令 | `bpftool prog list \| grep -v "unknown"` |

**经验教训**

1. 使用 `bpftool` 定期检查系统中加载的 eBPF 程序
2. 部署 Tetragon/Cilium 等 eBPF 安全监控工具
3. 监控 `bpf()` 系统调用（通过 auditd 或 seccomp）
4. eBPF 程序不显示在 lsmod 中，不能仅依赖传统 rootkit 检测工具
5. 网络流量基线分析可以发现异常的包处理模式

---

## 0x0E 参考资料

1. **RFC 3227 - Guidelines for Evidence Collection and Archiving**
   [https://datatracker.ietf.org/doc/html/rfc3227](https://datatracker.ietf.org/doc/html/rfc3227)

2. **Volatility3 Linux Plugins Documentation**
   [https://volatility3.readthedocs.io/en/latest/volatility3.plugins.linux.html](https://volatility3.readthedocs.io/en/latest/volatility3.plugins.linux.html)

3. **LiME - Linux Memory Extractor**
   [https://github.com/504ensicsLabs/LiME](https://github.com/504ensicsLabs/LiME)

4. **The Sleuth Kit - Open Source Digital Forensics**
   [https://www.sleuthkit.org/sleuthkit/](https://www.sleuthkit.org/sleuthkit/)

5. **APT29 Targets Government Agencies in Europe (CERT-EU Report)**
   [https://cert.europa.eu/publications/newsletter/2022/en/apt29-targets-government-agencies-europe](https://cert.europa.eu/publications/newsletter/2022/en/apt29-targets-government-agencies-europe)

6. **Lazarus Group Linux Cryptomining Campaign (Talos Intelligence)**
   [https://blog.talosintelligence.com/lazarus-cryptomining-linux/](https://blog.talosintelligence.com/lazarus-cryptomining-linux/)

7. **BPFDoor - An Active Chinese Surveillance Backdoor (SafeBreah)**
   [https://www.sandflysecurity.com/blog/bpfdoor-an-evasive-linux-backdoor-uses-bpf-for-stealth/](https://www.sandflysecurity.com/blog/bpfdoor-an-evasive-linux-backdoor-uses-bpf-for-stealth/)

8. **Linux Kernel Rootkit Detection Techniques (SANS Institute)**
   [https://www.sans.org/white-papers/33343/](https://www.sans.org/white-papers/33343/)

9. **Sigma Rules - Linux System Audit**
   [https://github.com/SigmaHQ/sigma/tree/master/rules/linux](https://github.com/SigmaHQ/sigma/tree/master/rules/linux)

10. **Auditd Best Practices for Security Monitoring**
    [https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/9/html/security_hardening/configuring-auditd-for-security-monitoring_security-hardening](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/9/html/security_hardening/configuring-auditd-for-security-monitoring_security-hardening)

11. **Linux Forensics (Philippe Treurniet - SANS)**
    [https://www.sans.org/white-papers/33343/](https://www.sans.org/white-papers/33343/)

12. **Container Security Forensics (NCC Group)**
    [https://www.nccgroup.com/uk/research-blog/container-forensics/](https://www.nccgroup.com/uk/research-blog/container-forensics/)
