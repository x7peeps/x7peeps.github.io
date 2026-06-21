---
title: "hosts文件检查结果与DNS劫持及内网重定向判断分析"
date: 2026-06-17T04:00:00+08:00
draft: false
weight: 200
description: "围绕 0x02 hosts文件检查取证结果，分析如何从hosts文件内容中判断DNS劫持、内网重定向、安全软件屏蔽等攻击行为。"
categories: ["应急响应", "取证分析"]
tags: ["hosts文件", "DNS劫持", "内网重定向", "安全软件屏蔽", "Pharming", "DNS重定向"]
---

# hosts文件检查结果与DNS劫持及内网重定向判断分析

`0x02电子取证/hosts文件检查` 给出了 Windows 下 `type hosts` 和 Linux 下 `cat /etc/hosts` 的基础取证入口。到了 `0x03取证分析`，真正要解决的不是"怎么查看 hosts 文件"，而是：

- hosts 文件中的条目是否属于正常配置
- 是否存在 DNS 劫持或内网重定向的恶意条目
- 恶意条目的目的是什么（钓鱼、屏蔽、横向移动）
- 如何从 hosts 文件修改时间判断篡改时间窗

hosts 文件是操作系统中最古老的 DNS 解析机制之一。它在 DNS 查询之前生效，优先级高于 DNS 服务器。这意味着攻击者可以通过修改 hosts 文件，在不触碰 DNS 服务器的情况下实现本地 DNS 劫持。这种攻击方式隐蔽、持久、无需网络层权限，是攻击者常用的防御规避手段。

---

## 0x01 hosts 文件的基础语义

### 1. hosts 文件的解析优先级

操作系统在进行域名解析时，遵循以下优先级：

1. **hosts 文件**（本地静态映射）
2. **DNS 缓存**（本地缓存的 DNS 查询结果）
3. **DNS 服务器**（配置的递归/权威 DNS）

这意味着 hosts 文件中的条目会覆盖 DNS 服务器的解析结果。如果 hosts 文件中存在 `www.bank.com 192.168.1.100`，那么用户访问 `www.bank.com` 时会被重定向到 `192.168.1.100`，而不是真实的银行服务器。

### 2. hosts 文件的默认内容

**Windows 默认 hosts 文件**：

```
# Copyright (c) 1993-2009 Microsoft Corp.
#
# This is a sample HOSTS file used by Microsoft TCP/IP for Windows.
#
# localhost name resolution is handled within DNS itself.
#	127.0.0.1       localhost
#	::1             localhost
```

**Linux 默认 hosts 文件**：

```
127.0.0.1   localhost localhost.localdomain localhost4 localhost4.localdomain4
::1         localhost localhost.localdomain localhost6 localhost6.localdomain6
```

正常情况下，hosts 文件只包含 `localhost` 的映射。如果发现其他条目，需要判断其来源和目的。

### 3. hosts 文件的位置和权限

| 操作系统 | 文件路径 | 默认权限 |
| --- | --- | --- |
| Windows | `C:\Windows\System32\drivers\etc\hosts` | 管理员可写 |
| Linux | `/etc/hosts` | root 可写 |
| macOS | `/etc/hosts`（符号链接到 `/private/etc/hosts`） | root 可写 |

由于 hosts 文件需要管理员/root 权限才能修改，攻击者必须先获得提权才能篡改该文件。因此，hosts 文件被篡改本身就是一个强攻击指标。

---

## 0x02 hosts 文件恶意条目的分类

### 1. DNS 劫持/钓鱼重定向

攻击者将合法域名映射到攻击者控制的 IP 地址，用于钓鱼或凭据窃取。

**典型恶意条目**：

```
# 将银行网站重定向到钓鱼服务器
203.0.113.50    www.icbc.com.cn
203.0.113.50    www.boc.cn
203.0.113.50    www.cmbchina.com

# 将邮箱服务重定向到钓鱼服务器
203.0.113.51    mail.qq.com
203.0.113.51    mail.163.com
```

**判断要点**：

- IP 地址是否属于已知恶意 IP（通过威胁情报平台查询）
- 域名是否为高价值目标（银行、邮箱、社交、企业门户）
- 条目是否注释掉了原有的正确映射

**结论强度**：

- 如果 IP 被多个情报平台标记为恶意 → 强结论：DNS 劫持成立
- 如果 IP 属于云服务商（AWS/Azure）→ 中等结论：需进一步分析
- 如果 IP 为内网地址 → 可能是横向移动或内部钓鱼

### 2. 安全软件/更新服务器屏蔽

攻击者将安全软件或系统更新的域名映射到 `127.0.0.1` 或 `0.0.0.0`，使其无法访问。

**典型恶意条目**：

```
# 屏蔽 Windows 更新
127.0.0.1    update.microsoft.com
127.0.0.1    windowsupdate.com
127.0.0.1    download.windowsupdate.com

# 屏蔽安全软件
127.0.0.1    update.nai.com
127.0.0.1    update.symantec.com
127.0.0.1    definitions.defender.microsoft.com

# 屏蔽杀毒软件云端查询
0.0.0.0      cloud.kaspersky.com
0.0.0.0      threatintelligence.sophos.com
```

**判断要点**：

- 被屏蔽的域名是否属于安全软件、系统更新、威胁情报服务
- 映射目标是否为 `127.0.0.1`、`0.0.0.0` 或无效 IP
- 条目数量是否异常（正常 hosts 文件通常不超过 10 行）

**结论强度**：

- 如果屏蔽了多个安全软件域名 → 强结论：防御规避行为
- 如果只屏蔽了 1-2 个域名 → 中等结论：可能是用户手动屏蔽

### 3. 内网重定向/横向移动

攻击者将内网域名映射到攻击者控制的内部服务器，用于横向移动或中间人攻击。

**典型恶意条目**：

```
# 将域控映射到攻击者控制的服务器
10.0.0.100    dc01.corp.local
10.0.0.100    dc02.corp.local

# 将文件服务器映射到攻击者控制的服务器
10.0.0.101    fileserver.corp.local

# 将邮件服务器映射到攻击者控制的服务器
10.0.0.102    exchange.corp.local
```

**判断要点**：

- 映射的 IP 是否为内网地址
- 映射的 IP 是否与真实服务器 IP 不一致
- 映射的域名是否为关键基础设施（域控、文件服务器、邮件服务器）

**结论强度**：

- 如果映射 IP 与真实 IP 不一致 → 强结论：内网重定向
- 如果映射 IP 为攻击者控制的跳板机 → 强结论：横向移动
- 如果无法确认真实 IP → 中等结论：需进一步调查

### 4. 广告屏蔽/隐私保护

用户或安全软件可能将广告域名映射到 `127.0.0.1` 或 `0.0.0.0`，用于屏蔽广告。

**典型条目**：

```
# 广告屏蔽
127.0.0.1    ads.doubleclick.net
127.0.0.1    adserver.adtech.com
0.0.0.0      tracking.google.com
0.0.0.0      analytics.facebook.com
```

**判断要点**：

- 被屏蔽的域名是否属于广告、追踪、分析服务
- 条目是否来自已知的广告屏蔽列表（如 StevenBlack/hosts）
- 是否同时屏蔽了安全软件或系统更新域名

**结论强度**：

- 如果只屏蔽了广告域名 → 低结论：可能是用户主动配置
- 如果同时屏蔽了安全软件域名 → 中等结论：需进一步分析

---

## 0x03 hosts 文件篡改的检测方法

### 1. 文件时间戳分析

通过 `stat` 命令检查 hosts 文件的修改时间：

**Windows**：

```powershell
Get-Item "C:\Windows\System32\drivers\etc\hosts" | Select-Object CreationTime, LastWriteTime, LastAccessTime
```

**Linux**：

```bash
stat /etc/hosts
```

**判断要点**：

- 修改时间是否与入侵时间窗吻合
- 修改时间是否在非工作时间（凌晨、周末）
- 修改时间是否与系统更新、安全软件安装时间不一致

### 2. 文件哈希对比

计算 hosts 文件的哈希值，与已知良好的基线对比：

```powershell
Get-FileHash "C:\Windows\System32\drivers\etc\hosts" -Algorithm SHA256
```

如果企业环境中有配置管理工具（如 SCCM、Ansible），可以通过基线对比发现 hosts 文件被篡改。

### 3. 内容分析

逐行分析 hosts 文件内容，识别异常条目：

**Windows**：

```powershell
Get-Content "C:\Windows\System32\drivers\etc\hosts" | Where-Object { $_ -notmatch "^#|^$" }
```

**Linux**：

```bash
grep -v "^#" /etc/hosts | grep -v "^$"
```

**判断要点**：

- 是否有非 `localhost` 的条目
- 条目中的 IP 地址是否为已知恶意 IP
- 条目中的域名是否为高价值目标
- 条目是否屏蔽了安全软件或系统更新

### 4. 注册表/系统配置检查

检查系统是否配置了 hosts 文件的替代路径：

**Windows**：

```cmd
reg query "HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" /v DataBasePath
```

正常情况下，`DataBasePath` 应指向 `%SystemRoot%\System32\drivers\etc`。如果被修改，说明攻击者可能将 hosts 文件移动到其他位置。

---

## 0x04 hosts 文件篡改的取证价值

### 1. 作为攻击指标（IOA）

hosts 文件被篡改本身就是一个强攻击指标：

- 正常用户很少手动修改 hosts 文件
- 安全软件修改 hosts 文件通常有日志记录
- 攻击者修改 hosts 文件通常是隐蔽的、无记录的

### 2. 作为持久化手段

hosts 文件的修改具有持久化效果：

- 重启后仍然生效
- 不受 DNS 缓存清除影响
- 不受网络配置变化影响

即使攻击者被清除，hosts 文件的修改可能仍然存在。

### 3. 作为防御规避手段

攻击者通过修改 hosts 文件可以实现：

- **屏蔽安全软件更新**：阻止杀毒软件获取最新病毒库
- **屏蔽系统更新**：阻止 Windows 获取安全补丁
- **屏蔽威胁情报查询**：阻止安全软件查询云端威胁情报
- **重定向 DNS 查询**：将用户重定向到钓鱼网站

---

## 0x05 三个最容易误判的边界

### 1. hosts 文件有条目不等于被攻击

某些合法场景下 hosts 文件会有额外条目：

- 开发人员本地测试环境配置
- 广告屏蔽软件（如 AdGuard、SwitchHosts）
- 企业安全策略强制配置
- 开发工具（如 Docker、Vagrant）自动配置

需要结合条目内容、来源、时间综合判断。

### 2. 屏蔽安全软件不等于恶意

某些用户可能手动屏蔽安全软件更新域名，原因包括：

- 安全软件更新导致系统不稳定
- 网络带宽限制
- 测试环境需求

但如果屏蔽行为发生在入侵时间窗内，且与其他攻击动作关联，则恶意概率显著上升。

### 3. 内网 IP 映射不等于横向移动

某些企业环境可能通过 hosts 文件配置内网域名映射，原因包括：

- 内部 DNS 服务器不可用
- 开发测试环境配置
- 遗留系统兼容

需要确认映射 IP 是否与真实服务器 IP 一致，如果不一致则横向移动概率上升。

---

## 0x06 公开资料与分析借鉴

### 1. Malwarebytes: Hijack.HostFile

Malwarebytes 的威胁检测报告说明了 hosts 文件劫持的检测方法：

- hosts 文件是 DNS 解析的第一步，可以劫持互联网流量
- 攻击者通过修改 hosts 文件将用户重定向到恶意网站
- Malwarebytes 可以检测并移除 Hijack.HostFile

最值得借鉴的一点是：**hosts 文件劫持是一种本地 DNS 重定向攻击，不需要网络层权限，只需要本地管理员权限。**

公开来源：

- Malwarebytes: [Hijack.HostFile](https://www.malwarebytes.com/blog/detections/hijack-hostfile)

### 2. Catchpoint: DNS Hijacking

Catchpoint 的 DNS 劫持文章详细说明了 Sea Turtle 攻击案例：

- 攻击者通过修改 DNS 记录重定向流量
- DNSpionage 恶意软件拦截 DNS 流量
- 检测方法：监控 DNS 活动异常、流量突然下降

最值得借鉴的一点是：**DNS 劫持可以通过多种方式实现，包括修改 DNS 服务器记录、修改路由器配置、修改本地 hosts 文件。**

公开来源：

- Catchpoint: [DNS Hijacking](https://www.catchpoint.com/dns-monitoring/dns-hijacking)

### 3. Palo Alto Networks: What Is DNS Hijacking

Palo Alto Networks 的 DNS 劫持文章说明了检测方法：

- 自动化定期收集端点 DNS 配置，与已知良好基线对比
- 检查本地 DNS 设置是否有未授权更改
- 审查解析器日志和 DNS 查询路径

最值得借鉴的一点是：**在小型环境中，检测通常发生在用户端。注意加载缓慢的页面、弹出窗口、不熟悉的重定向。**

公开来源：

- Palo Alto Networks: [What Is DNS Hijacking](https://www.paloaltonetworks.com/cyberpedia/what-is-dns-hijacking)

### 4. Abnormal AI: What Is DNS Spoofing

Abnormal AI 的 DNS 欺骗文章说明了 hosts 文件操纵的攻击方式：

- 通过 hosts 文件操纵实现 Pharming
- 恶意软件修改本地 hosts 文件覆盖 DNS 解析
- 将特定域名重定向到攻击者 IP，无需触碰 DNS 基础设施

最值得借鉴的一点是：**hosts 文件操纵是一种本地 DNS 劫持方式，可以完全绕过 DNS 服务器，直接在端点层面实现重定向。**

公开来源：

- Abnormal AI: [What Is DNS Spoofing](https://abnormal.ai/glossary/dns-spoofing)

---

## 0x07 建议的交付结构

hosts 文件检查结果建议整理为如下表格：

| 检查项 | 检查结果 | 异常判断 | 结论强度 | 建议 |
| --- | --- | --- | --- | --- |
| 文件时间戳 | 修改时间 02:14:15 | 与入侵时间窗吻合 | 强 | 检查修改来源 |
| 文件内容 | 发现 `203.0.113.50 www.icbc.com.cn` | DNS 劫持 | 强 | 查询 IP 威胁情报 |
| 文件内容 | 发现 `127.0.0.1 update.microsoft.com` | 安全软件屏蔽 | 中 | 检查是否为攻击者行为 |
| 文件内容 | 发现 `10.0.0.100 dc01.corp.local` | 内网重定向 | 中 | 确认真实 DC IP |
| 文件哈希 | 与基线不一致 | 文件被篡改 | 强 | 恢复原始文件 |
| 注册表配置 | `DataBasePath` 指向默认路径 | 正常 | 低 | — |

---

## 0x08 和其他分析篇怎样联动

本文最适合和以下专题联动：

- `系统日志检查结果证据强度分层与事件链构建分析`：提供日志层面的时间线关联
- `安全策略检查结果与防护绕过及策略篡改判断分析`：提供防御规避的整体分析框架
- `异常端口检查结果与进程关联及外联目标判断分析`：提供网络层的行为分析

本文的定位是聚焦 `0x02` hosts 文件检查中"DNS 劫持"和"内网重定向"这两个维度，而不是覆盖整个 DNS 取证领域。

---

## 0x09 总结

hosts 文件分析的关键，不是"列出所有条目"，而是：

- 判断条目是否属于正常配置
- 识别 DNS 劫持、安全软件屏蔽、内网重定向等恶意行为
- 通过文件时间戳判断篡改时间窗
- 从条目内容中读出攻击者的意图

当你能从 hosts 文件的条目中读出 DNS 劫持信号、防御规避意图、横向移动路径时，`0x02` 里的"hosts 文件检查"才真正升级为 `0x03` 的"hosts 文件检查结果与 DNS 劫持及内网重定向判断分析"。
