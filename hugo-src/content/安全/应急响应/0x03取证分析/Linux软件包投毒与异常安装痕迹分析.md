---
title: "Linux软件包投毒与异常安装痕迹分析"
date: 2026-06-16T10:00:00+08:00
draft: false
weight: 250
description: "围绕 apt、yum、dnf、rpm、dpkg、本地仓库与伪装系统包，分析攻击者如何借软件包安装落地后门、维持持久化，并给出 Linux 主机现场排查命令。"
categories: ["应急响应", "取证分析"]
tags: ["Linux", "apt", "yum", "rpm", "dpkg", "软件包", "供应链", "持久化"]
---

# Linux软件包投毒与异常安装痕迹分析

Linux 主机里，很多人习惯把恶意样本理解成：

- `/tmp` 里的 ELF
- `cron` 里的脚本
- `systemd` 里的假服务

但真实攻击者并不总是这么“裸奔”。如果他们能控制安装链、仓库配置、本地包文件或运维脚本，就完全可以把后门伪装成：

- 一个正常安装的软件包
- 一个看起来合法的更新
- 一个依赖项
- 一个带 `postinst` / `postinstall` 脚本的本地安装文件

这也是为什么 `linux软件包管理器文件检查` 到 `0x03` 阶段，不应该只看“装了哪些包”，而要继续判断：**这些包是不是正常来源、安装脚本干了什么、安装之后系统里新增了什么可疑持久化。**

---

## 0x01 公开案例一：Airstalk 供应链攻击中的 PowerShell/.NET 恶意组件

虽然这是 Windows 侧供应链事件，但 Unit 42 关于 `Airstalk` 的公开分析很适合作为软件包投毒思路的参考：

- 攻击者把恶意组件夹带进供应链分发路径
- 用户侧看到的是“更新 / 软件分发”
- 实际安装后会建立隐蔽 C2

这个案例对于 Linux 软件包章节的意义在于：**分发链一旦被利用，恶意代码看起来就像“正常安装结果”。**

公开来源：

- Unit 42: [Suspected Nation-State Threat Actor Uses New Airstalk Malware in a Supply Chain Attack](https://unit42.paloaltonetworks.com/new-windows-based-malware-family-airstalk/)

---

## 0x02 公开案例二：Iptables Backdoor 伪装系统服务与启动项

Unit 42 早年披露的 Linux `Iptables Backdoor` 非常适合作为 Linux 包/系统组件伪装案例：

- 样本会安装到 `/usr/bin/btdaemon`
- 创建 `/etc/init.d/bluetoothdaemon`
- 伪装成系统服务启动

这类案例提醒我们，Linux 恶意样本非常喜欢伪装成“系统组件”或“看起来像系统安装出来的文件”。虽然不一定通过 `apt` 或 `rpm` 分发，但在现场取证时，它和异常安装包的排查逻辑高度相似：

- 看文件名像不像系统包内容
- 看启动脚本是不是伪造
- 看安装时间与服务创建时间是否闭环

公开来源：

- Unit 42: [Iptables Backdoor: Even Linux Is At Risk of Intrusion](https://unit42.paloaltonetworks.com/iptables-backdoor-even-linux-risk-intrusion/)

---

## 0x03 这类事件最常见的三种落地方式

### 1. 直接安装恶意本地包

例如：

- `dpkg -i xxx.deb`
- `rpm -ivh xxx.rpm`

风险点在于：

- 包来源不明
- 包签名不可信
- 包内脚本会执行额外命令

### 2. 仓库配置被污染

例如：

- 新增了陌生源
- 源地址被替换
- GPG key 被替换

这类问题的危险更大，因为它意味着后续“正常更新”都可能继续带毒。

### 3. 运维脚本假借包管理器落地

例如：

- 脚本先下载 `.deb/.rpm`
- 再调用 `dpkg/rpm/apt/yum`
- 安装完立刻创建服务、计划任务、代理隧道

这类场景在应急现场很常见，因为攻击者知道管理员看到“安装软件”时警觉性较低。

---

## 0x04 现场应先回答什么

建议优先回答四个问题：

1. **最近装了什么包？**
   尤其是时间窗内的新包、本地包、非官方仓库包。
2. **包从哪里来？**
   官方仓库、本地文件、第三方源、下载脚本，还是被污染的内部镜像。
3. **安装脚本做了什么？**
   是否额外写了服务、计划任务、文件、密钥、代理配置。
4. **安装后系统新增了什么？**
   新服务、新二进制、新配置、新连接、新用户。

---

## 0x05 Debian / Ubuntu 现场排查命令

### 1. 查最近安装过的包

```bash
grep " install " /var/log/dpkg.log*
zgrep " install " /var/log/dpkg.log.*.gz 2>/dev/null
```

### 2. 查 apt 历史

```bash
cat /var/log/apt/history.log
zcat /var/log/apt/history.log.*.gz 2>/dev/null
cat /var/log/apt/term.log
```

### 3. 查本地安装痕迹

```bash
grep -RInE 'dpkg -i|apt install ./|apt-get install ./|wget .*\.deb|curl .*\.deb' /root/.bash_history /home/*/.bash_history 2>/dev/null
find /tmp /var/tmp /home /root -type f -name "*.deb" -mtime -7 -ls 2>/dev/null
```

### 4. 查仓库配置和 key

```bash
cat /etc/apt/sources.list
find /etc/apt/sources.list.d -type f -maxdepth 1 -print -exec cat {} \;
apt-key list 2>/dev/null
ls -al /etc/apt/trusted.gpg.d/
```

### 5. 查包里装了什么文件

```bash
dpkg -L <package-name>
dpkg -s <package-name>
```

---

## 0x06 RHEL / CentOS / Rocky / Alma 现场排查命令

### 1. 查最近安装事务

```bash
yum history
dnf history
rpm -qa --last | head -n 50
```

### 2. 查本地安装与来源

```bash
grep -RInE 'rpm -ivh|yum install|dnf install|curl .*\.rpm|wget .*\.rpm' /root/.bash_history /home/*/.bash_history 2>/dev/null
find /tmp /var/tmp /home /root -type f -name "*.rpm" -mtime -7 -ls 2>/dev/null
```

### 3. 查仓库配置

```bash
find /etc/yum.repos.d -type f -maxdepth 1 -print -exec cat {} \;
rpm -qi gpg-pubkey
```

### 4. 查包安装的文件

```bash
rpm -ql <package-name>
rpm -qi <package-name>
rpm -V <package-name>
```

---

## 0x07 安装后最该继续追的几类痕迹

### 1. systemd / init / cron

```bash
systemctl list-unit-files --type=service
find /etc/systemd/system /usr/lib/systemd/system -type f -mtime -7 -ls 2>/dev/null
grep -RInE 'ExecStart|Restart|WantedBy' /etc/systemd/system /usr/lib/systemd/system 2>/dev/null
grep -RInE 'cron|@reboot|bash -c|curl|wget' /etc/cron* /var/spool/cron 2>/dev/null
```

### 2. 新落地的二进制与配置

```bash
find /usr/bin /usr/sbin /usr/local/bin /opt -type f -mtime -7 -ls 2>/dev/null
find /etc /opt /usr/lib/systemd/system -type f -mtime -7 -ls 2>/dev/null
```

### 3. 后续连接与行为

```bash
ss -antlp
journalctl --since "3 days ago" | egrep 'install|rpm|dnf|yum|apt|dpkg|systemd|service'
```

---

## 0x08 一条现场可执行的分析流程

建议按下面顺序做：

1. 先根据告警或时间窗锁定最近安装历史
2. 再确认是官方仓库安装、本地文件安装，还是第三方源安装
3. 再看包安装前后是否新增了服务、任务、配置和可执行文件
4. 再把这些新增项和网络连接、外联、持久化串起来
5. 最后确认仓库配置和密钥是否被污染，避免“清掉样本但保留污染源”

---

## 0x09 如何区分正常升级与恶意安装

### 1. 看来源

如果来源是：

- 官方仓库
- 企业内部镜像
- 变更记录明确

通常可信度更高。

如果来源是：

- `/tmp` 本地包
- 用户目录下载包
- 不熟悉的第三方源
- 临时添加的 repo

风险显著上升。

### 2. 看安装后行为

正常安装通常不会在数分钟内同时出现：

- 新服务
- 新计划任务
- 异常外联
- 代理隧道
- 凭据抓取

如果这些都出现了，安装行为大概率只是攻击链的一环。

### 3. 看包内容和命名

很多恶意包会：

- 使用看起来很系统化的名字
- 伪装成驱动、蓝牙、日志、监控或更新组件

这和前面写过的 `环境变量劫持`、`进程树伪装`、`IFEO` 在思路上是一致的。

---

## 0x0A 保全与处置建议

### 1. 先保全安装记录

```bash
cp /var/log/dpkg.log /tmp/dpkg.log.bak 2>/dev/null
cp /var/log/apt/history.log /tmp/apt.history.bak 2>/dev/null
yum history > /tmp/yum.history.txt 2>/dev/null
dnf history > /tmp/dnf.history.txt 2>/dev/null
```

### 2. 再导出仓库配置

```bash
tar czf /tmp/pkg-repo-config.tar.gz /etc/apt /etc/yum.repos.d /etc/dnf 2>/dev/null
```

### 3. 清理前先确认污染源

如果只是卸载恶意包，但不清理：

- 第三方恶意仓库
- 被替换的 GPG key
- 安装脚本中的持久化

那么主机很可能在下一次更新时再次被写回。

---

## 0x0B 三个常见误区

### 1. 只查 `/tmp`，不查包管理日志

有些恶意组件落地得很“正规”，单靠文件路径看不出来，必须回到安装历史。

### 2. 只删文件，不查仓库源

如果源被污染，删除当前文件意义有限。

### 3. 把“安装行为”默认视作管理员正常动作

在很多事件里，攻击者正是利用这种心理，把后门伪装成更新或依赖。

---

## 0x0C 建议的交付结构

这类事件适合整理为如下表格：

| 时间 | 证据源 | 事件 | 关联对象 | 结论 |
| --- | --- | --- | --- | --- |
| 01:11:22 | apt/yum 历史 | 安装本地包 | `agent-update.deb` | 存在异常安装 |
| 01:12:05 | 仓库配置 / 历史命令 | 来自第三方源或本地下载 | `/tmp/agent-update.deb` | 来源可疑 |
| 01:13:40 | systemd / 文件时间 | 新建服务与二进制 | `/usr/bin/btdaemon` | 安装后建立持久化 |
| 01:15:18 | 网络日志 | 对外连接 | 公网节点 | 包安装后立即上线 |

---

## 0x0D 总结

`linux软件包管理器文件检查` 到 `0x03` 阶段，真正有价值的不是列出“系统里有哪些包”，而是回答：

- 最近装了什么
- 从哪来的
- 装完新增了什么
- 这些变化是否已经参与了后门、持久化或外联

当你把包管理历史、仓库配置、安装脚本、副产物文件和后续行为连起来时，一次“看似正常的软件安装”就能被还原成非常清晰的入侵链条。
