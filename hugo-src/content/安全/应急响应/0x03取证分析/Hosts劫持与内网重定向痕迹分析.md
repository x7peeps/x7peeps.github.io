---
title: "Hosts劫持与内网重定向痕迹分析"
date: 2026-06-16T09:00:00+08:00
draft: false
weight: 230
description: "围绕 Windows hosts、Linux /etc/hosts、本地回环映射、登录页重定向与内网域名伪解析，分析攻击者如何利用 Hosts 劫持实现钓鱼、拦截、横向与内网控制。"
categories: ["应急响应", "取证分析"]
tags: ["Hosts", "DNS劫持", "重定向", "内网取证", "本地解析", "钓鱼落地"]
---

# Hosts劫持与内网重定向痕迹分析

相比 DNS 服务器投毒、网关劫持、代理劫持，`Hosts` 修改是一种非常“土”但仍然有效的手法。它不需要控制网络设备，也不需要修改上游 DNS，只要在本机加几行映射，就足以让：

- 合法域名指向攻击者控制地址
- 内网域名指向错误主机
- 安全厂商、更新站点、认证门户被重定向
- 用户以为自己访问的是正常站点，实际上已经被送去钓鱼页或本地回环服务

因此，`hosts文件检查` 在 `0x03` 阶段真正要做的，不是“打开文件看几眼”，而是判断：**这些映射是否改变了攻击链的方向，是否参与了钓鱼、横向、认证拦截或流量引流。**

---

## 0x01 公开案例与现实场景

### 1. 常见恶意软件与重定向类行为

多家安全厂商和微软长期都把 `Hosts` 修改视为高风险主机行为，原因很简单：

- 恶意软件常用它阻断安全更新
- 银行木马常用它把用户导向伪造登录页
- 广告软件常用它做站点重定向
- 横向阶段也可用它把内部域名指向攻击者准备的假服务

公开的检测与安全产品文档里，`hosts` 被归为高风险可疑改动，本质上正是因为这类改动通常不属于正常办公行为。

### 2. 这类案例为什么适合写进取证章节

因为 `Hosts` 劫持的价值不在“这文件被改了”，而在于：

1. 哪个域名被改写
2. 改写后指向了哪里
3. 指向地址上跑的是什么服务
4. 用户或系统随后是否真的访问了这个域名

只要这四件事串起来，`Hosts` 文件就能直接进入攻击链主证据。

---

## 0x02 Hosts 劫持最常见的三类目的

### 1. 钓鱼与认证拦截

典型表现：

- 邮箱、OA、VPN、SSO 域名被改到外部钓鱼地址
- 用户本机访问看起来仍是原域名
- 浏览器却落到了假登录页

### 2. 安全更新与查杀阻断

典型表现：

- 安全软件、系统更新、下载站域名被映射到 `127.0.0.1`
- 相关更新程序报错、无法连接
- 同时主机上存在样本、矿工、后门

### 3. 内网引流与横向辅助

典型表现：

- 内部管理域名被改到攻击者控制的跳板或假服务
- 特定服务器名称被指向错误 IP
- 本机对某些“熟悉域名”的访问实际上已被本地改道

---

## 0x03 现场应先回答什么

建议围绕四个问题展开：

1. **被改的是哪些域名？**
   是外网域名、更新域名，还是内部业务域名。
2. **它们被指向哪里？**
   `127.0.0.1`、内网其他主机、未知公网地址，还是本地代理。
3. **谁改的？**
   是管理员操作、脚本、恶意程序、安装器还是运维工具。
4. **改完之后发生了什么？**
   是否出现浏览器访问、凭据提交、下载执行、更新失败或认证异常。

---

## 0x04 Windows 现场排查命令

### 1. 直接查看 hosts 文件

```powershell
Get-Content C:\Windows\System32\drivers\etc\hosts
```

### 2. 重点找异常映射

```powershell
Select-String -Path C:\Windows\System32\drivers\etc\hosts -Pattern '127\.0\.0\.1|0\.0\.0\.0|::1|vpn|mail|update|defender|security|microsoft|login|sso|github'
```

### 3. 看 hosts 最近修改时间

```powershell
Get-Item C:\Windows\System32\drivers\etc\hosts | Select-Object FullName, CreationTime, LastWriteTime, Length
```

### 4. 查近期谁可能改了它

```powershell
$start=(Get-Date).AddDays(-3)
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4688; StartTime=$start} |
  Where-Object {
    $_.Message -match 'notepad\.exe|cmd\.exe|powershell\.exe|wscript\.exe|cscript\.exe|mshta\.exe'
  } |
  Select-Object TimeCreated, Message
```

如果现场有 Sysmon，也应看：

- Event ID 11：文件创建
- Event ID 2：文件时间修改

### 5. 立刻验证当前解析结果

```powershell
Resolve-DnsName login.example.com
nslookup login.example.com
ping login.example.com
```

如果 `Resolve-DnsName` 解析结果和 `hosts` 文件中一致，且与正常资产不符，说明本机流量已被本地劫持。

---

## 0x05 Linux 现场排查命令

### 1. 查看 `/etc/hosts`

```bash
cat /etc/hosts
```

### 2. 查近期改动与关键域名

```bash
grep -nE '127\.0\.0\.1|0\.0\.0\.0|mail|vpn|sso|login|update|repo|security|github' /etc/hosts
stat /etc/hosts
```

### 3. 验证解析

```bash
getent hosts login.example.com
host login.example.com
dig login.example.com
```

### 4. 查是谁动了它

```bash
grep -RInE '/etc/hosts|echo .*hosts|tee .*hosts' /root/.bash_history /home/*/.bash_history 2>/dev/null
ausearch -f /etc/hosts 2>/dev/null
```

---

## 0x06 一条可执行的分析流程

建议现场按下面顺序跑：

1. 先看 `hosts` 内容和修改时间
2. 再列出所有敏感域名映射
3. 再用 `nslookup/getent/Resolve-DnsName` 验证解析实际落点
4. 再看浏览器历史、认证日志、下载记录是否在修改后访问过这些域名
5. 最后判断这次改动是为了钓鱼、屏蔽更新，还是内网引流

---

## 0x07 如何区分误配和恶意行为

### 1. 看域名类型

如果被改的是：

- 安全更新
- 杀软
- 登录入口
- VPN / SSO

恶意概率通常高于业务自定义域名。

### 2. 看指向地址

如果指向：

- `127.0.0.1`
- `0.0.0.0`
- 异常公网 IP
- 与业务无关的内网主机

风险通常更高。

### 3. 看后续动作

只要改动后紧接着出现：

- 登录失败
- 凭据提交
- 浏览器下载
- 安全更新失效

那就不再是单纯配置问题。

---

## 0x08 恢复与保全建议

### 1. 先备份

```powershell
Copy-Item C:\Windows\System32\drivers\etc\hosts C:\Temp\hosts.bak
```

```bash
cp /etc/hosts /tmp/hosts.bak
```

### 2. 再恢复默认解析

恢复时至少保留：

- `127.0.0.1 localhost`
- `::1 localhost`

然后删除可疑行，再重新验证解析结果。

### 3. 不要只修 hosts

如果 `hosts` 被恶意修改，往往说明：

- 主机已被控
- 或者脚本、安装器、WebShell 曾在本机执行

因此修完后还要继续追：

- 是谁改的
- 为什么改
- 改完之后带来了什么攻击行为

---

## 0x09 三个常见误区

### 1. 看到 hosts 只有一两行就忽略

很多成功的重定向根本不需要改很多行，只要改对一个关键域名就够了。

### 2. 只检查 DNS，不检查本地解析

上游 DNS 完全正常，并不代表本机没被劫持。

### 3. 只把它当“配置问题”

真实攻击里，`hosts` 通常不是孤立问题，而是凭据窃取、更新阻断或内网引流的一环。

---

## 0x0A 建议的交付结构

Hosts 劫持事件适合整理为如下表格：

| 时间 | 证据源 | 事件 | 关联对象 | 结论 |
| --- | --- | --- | --- | --- |
| 09:01:11 | 文件时间 | `hosts` 被修改 | 本机 | 存在本地解析变更 |
| 09:02:03 | hosts 内容 | `vpn.example.com -> 127.0.0.1` | 关键登录域名 | 疑似认证拦截或阻断 |
| 09:05:18 | 浏览器历史 | 访问目标域名 | 用户会话 | 修改后被实际访问 |
| 09:06:02 | 日志/进程 | PowerShell/脚本执行 | 本机 | 改动与攻击链闭环 |

---

## 0x0B 总结

`Hosts` 劫持之所以值得单独写进 `0x03取证分析`，是因为它足够简单，也足够容易被忽略。攻击者不必控制整张网络，只要改动一个本地文件，就能把用户、程序和安全更新导向完全不同的地方。

因此，`hosts文件检查` 从 `0x02` 升级到 `0x03` 后，重点不应只是“有没有被改”，而是要继续回答：

- 改了哪些关键域名
- 指向了哪里
- 谁在什么时候改的
- 这些改动是否真正改变了攻击链方向

只要这些问题回答清楚，一份几行字的 `hosts` 文件，同样可以成为非常强的主证据。
