---
title: "Windows认证机制与攻击链取证分析"
date: 2026-06-23T09:00:00+08:00
draft: false
weight: 300
description: "围绕 Windows 认证机制（NTLM、Kerberos）的攻击与取证，分析 Pass-the-Hash、Kerberoasting、Golden/Silver Ticket、DCSync 等攻击技术在事件日志中的取证特征，以及如何通过事件关联构建完整的认证攻击链。"
categories: ["应急响应", "取证分析"]
tags: ["NTLM", "Kerberos", "Pass-the-Hash", "Kerberoasting", "Golden Ticket", "Silver Ticket", "DCSync", "Event ID 4624", "4768", "4769"]
---

# Windows认证机制与攻击链取证分析

Windows 域环境中的认证机制是攻击者横向移动和权限提升的核心目标。NTLM 和 Kerberos 是两种主要的认证协议，每种协议都有特定的攻击面。理解这些攻击技术的原理和取证特征，是应急响应中还原攻击链的关键。

已有文章 `内网横向移动全链路取证分析与证据拼接` 覆盖了横向移动的整体分析框架，`凭据抓取与认证材料取证分析` 覆盖了凭据获取的方法。本文换一个角度：**不讨论凭据获取的工具和技术，而是聚焦于认证协议本身的攻击与取证，深入分析 NTLM/Kerberos 协议的攻击面、各种认证攻击在事件日志中的取证特征、以及如何通过事件关联检测高级认证攻击（如 Golden Ticket、Silver Ticket、DCSync）。**

---

## 0x01 Windows 认证协议基础

### 1. NTLM 认证流程

NTLM（NT LAN Manager）是 Windows 的旧版认证协议，基于挑战-响应机制：

```
1. 客户端发送用户名（Negotiate）
2. 服务器返回 16 字节随机挑战（Challenge）
3. 客户端使用密码哈希加密挑战，返回响应（Authenticate）
4. 服务器验证响应
```

NTLM 的安全缺陷：
- 密码哈希直接用于认证（Pass-the-Hash 攻击的基础）
- 没有双向认证（客户端无法验证服务器身份）
- 挑战-响应可被中间人攻击
- 不支持委派（Delegation）

### 2. Kerberos 认证流程

Kerberos 是现代 Windows 域环境的默认认证协议，基于票据（Ticket）机制：

```
1. 用户向 KDC（密钥分发中心）请求 TGT（票据授予票据）
   - AS-REQ: 用户发送预认证数据（时间戳加密）
   - AS-REP: KDC 返回 TGT（由 KRBTGT 账户加密）

2. 用户使用 TGT 请求服务票据（TGS）
   - TGS-REQ: 用户发送 TGT 和服务 SPN
   - TGS-REP: KDC 返回服务票据（由服务账户加密）

3. 用户使用服务票据访问服务
   - AP-REQ: 用户发送服务票据
   - AP-REP: 服务验证票据并允许访问
```

Kerberos 的安全优势：
- 双向认证（客户端和服务器互相验证）
- 票据有时效性（默认 TGT 10 小时，TGS 5 分钟）
- 支持委派（Constrained Delegation）
- 密码不直接传输

### 3. 认证类型与 Event ID 4624

Event ID 4624（成功登录）是认证取证的核心事件。Logon Type 字段揭示了认证方式：

| Logon Type | 名称 | 说明 | 取证意义 |
|-----------|------|------|---------|
| 2 | Interactive | 本地登录（键盘/屏幕） | 物理访问或 RDP 会话 |
| 3 | Network | 网络登录（SMB、WMI） | 远程文件访问、PsExec |
| 4 | Batch | 批处理登录（计划任务） | 计划任务执行 |
| 5 | Service | 服务启动 | 服务账户登录 |
| 7 | Unlock | 解锁工作站 | 用户返回 |
| 8 | NetworkCleartext | 明文网络登录 | IIS 基本认证 |
| 9 | NewCredentials | 新凭据 | runas /netonly |
| 10 | RemoteInteractive | 远程交互（RDP） | 远程桌面连接 |
| 11 | CachedInteractive | 缓存交互 | 使用缓存凭据登录 |

关键认知：Logon Type 3（Network）是最常见的横向移动指标。当攻击者使用 PsExec、WMI 或 SMB 访问远程系统时，会产生 Logon Type 3 事件。

---

## 0x02 Pass-the-Hash 攻击取证

### 1. Pass-the-Hash 原理

Pass-the-Hash（PtH）攻击利用 NTLM 的安全缺陷：攻击者不需要知道用户的明文密码，只需要用户的 NTLM 哈希就可以进行认证。

攻击流程：
1. 攻击者从 LSASS 内存中提取用户的 NTLM 哈希（使用 Mimikatz）
2. 攻击者使用 NTLM 哈希直接进行网络认证（不需要明文密码）
3. 目标系统验证 NTLM 哈希并允许访问

### 2. PtH 的事件日志特征

**Event ID 4624（成功登录）**

```xml
<Event>
  <System>
    <EventID>4624</EventID>
    <Channel>Security</Channel>
  </System>
  <EventData>
    <Data Name="LogonType">3</Data>
    <Data Name="TargetUserName">Administrator</Data>
    <Data Name="WorkstationName"></Data>
    <Data Name="IpAddress">10.0.1.50</Data>
    <Data Name="AuthenticationPackageName">NTLM</Data>
    <Data Name="LmPackageName">-</Data>
    <Data Name="KeyLength">0</Data>
  </EventData>
</Event>
```

PtH 的关键指标：
- `LogonType` = 3（Network）
- `AuthenticationPackageName` = NTLM
- `LmPackageName` = -（NTLM v2）
- `KeyLength` = 0（表示没有使用会话密钥）
- `WorkstationName` 为空（PtH 工具通常不发送工作站名称）

**Event ID 4672（特殊权限登录）**

```xml
<Event>
  <System>
    <EventID>4672</EventID>
    <Channel>Security</Channel>
  </System>
  <EventData>
    <Data Name="TargetUserName">Administrator</Data>
    <Data Name="Privileges">SeDebugPrivilege
SeBackupPrivilege
SeRestorePrivilege
SeTakeOwnershipPrivilege</Data>
  </EventData>
</Event>
```

如果 4624 事件显示 Logon Type 3 + NTLM 认证，且 4672 事件显示管理员权限，说明攻击者可能使用了 PtH 进行横向移动。

### 3. PtH 的关联分析

将以下事件关联：

```
时间线示例：

2026-06-15 10:30:00  Event ID 4688 (Security) — 进程创建
                     父进程: cmd.exe
                     新进程: mimikatz.exe
                     命令行: mimikatz.exe "sekurlsa::logonpasswords" "exit"
                     → 攻击者提取 NTLM 哈希

2026-06-15 10:31:00  Event ID 4624 (Security) — 成功登录
                     Logon Type: 3
                     目标用户: Administrator
                     认证包: NTLM
                     来源 IP: 10.0.1.50
                     → 攻击者使用 PtH 登录远程系统

2026-06-15 10:31:05  Event ID 4672 (Security) — 特殊权限登录
                     目标用户: Administrator
                     权限: SeDebugPrivilege, SeBackupPrivilege
                     → 攻击者获得管理员权限

2026-06-15 10:32:00  Event ID 4688 (Security) — 进程创建
                     父进程: svchost.exe
                     新进程: cmd.exe
                     → 攻击者在远程系统上执行命令
```

---

## 0x03 Kerberoasting 攻击取证

### 1. Kerberoasting 原理

Kerberoasting 攻击利用 Kerberos 的服务票据机制：

1. 攻击者查询 Active Directory，找到所有具有 SPN（服务主体名称）的服务账户
2. 攻击者向 KDC 请求这些服务账户的服务票据（TGS）
3. KDC 返回由服务账户密码哈希加密的 TGS
4. 攻击者离线破解 TGS，获取服务账户的明文密码

关键认知：Kerberoasting 不需要特殊权限。任何域用户都可以请求服务票据。攻击的关键在于服务账户的密码强度——如果密码弱，攻击者可以快速破解。

### 2. Kerberoasting 的事件日志特征

**Event ID 4769（Kerberos 服务票据请求）**

```xml
<Event>
  <System>
    <EventID>4769</EventID>
    <Channel>Security</Channel>
  </System>
  <EventData>
    <Data Name="TargetUserName">svc_sql@DOMAIN.LOCAL</Data>
    <Data Name="ServiceName">MSSQLSvc/sql01.domain.local:1433</Data>
    <Data Name="ServiceSid">S-1-5-21-1234567890-1234567890-1234567890-1001</Data>
    <Data Name="IpAddress">::ffff:10.0.1.50</Data>
    <Data Name="Status">0x0</Data>
    <Data Name="TicketEncryptionType">0x17</Data>
    <Data Name="TicketOptions">0x40810000</Data>
  </EventData>
</Event>
```

Kerberoasting 的关键指标：
- `TicketEncryptionType` = 0x17（RC4-HMAC）或 0x12（AES256）
- 单个用户短时间内请求多个不同服务账户的 TGS
- `TicketOptions` = 0x40810000（表示请求可转发票据）

### 3. Kerberoasting 的检测策略

**策略一：TGS 请求频率检测**

```sql
-- 检测单个用户短时间内请求多个 TGS
SELECT TargetUserName, COUNT(DISTINCT ServiceName) as service_count,
       MIN(TimeCreated) as first_request, MAX(TimeCreated) as last_request
FROM SecurityEvents
WHERE EventID = 4769
  AND TimeCreated > CURRENT_TIMESTAMP - INTERVAL '1' HOUR
GROUP BY TargetUserName
HAVING COUNT(DISTINCT ServiceName) > 5
ORDER BY service_count DESC
```

**策略二：RC4 加密检测**

如果域环境已经配置为使用 AES 加密，突然出现 RC4 加密的 TGS 请求应当被视为可疑：

```sql
-- 检测 RC4 加密的 TGS 请求
SELECT TimeCreated, TargetUserName, ServiceName, TicketEncryptionType
FROM SecurityEvents
WHERE EventID = 4769
  AND TicketEncryptionType = 0x17
ORDER BY TimeCreated DESC
```

**策略三：可转发票据检测**

Kerberoasting 工具通常请求可转发（forwardable）票据。检测 `TicketOptions` 中的可转发标志：

```sql
-- 检测请求可转发票据的 TGS 请求
SELECT TimeCreated, TargetUserName, ServiceName, TicketOptions
FROM SecurityEvents
WHERE EventID = 4769
  AND TicketOptions LIKE '%4081%'
ORDER BY TimeCreated DESC
```

---

## 0x04 Golden Ticket 攻击取证

### 1. Golden Ticket 原理

Golden Ticket 是最强大的 Kerberos 攻击。攻击者通过获取 KRBTGT 账户的密码哈希，可以伪造任意用户的 TGT：

1. 攻击者获取 KRBTGT 账户的 NTLM 哈希（通过 DCSync 或域控内存转储）
2. 攻击者使用 Mimikatz 伪造 TGT，指定任意用户名和组 membership
3. 攻击者使用伪造的 TGT 请求服务票据
4. 攻击者使用服务票据访问任意域资源

关键认知：Golden Ticket 不经过 KDC，因此不会在域控上产生 4768（TGT 请求）事件。这是检测 Golden Ticket 的核心线索。

### 2. Golden Ticket 的事件日志特征

**特征一：4769 事件没有对应的 4768 事件**

正常情况下，用户请求服务票据（4769）之前，必须先请求 TGT（4768）。如果 4769 事件没有对应的 4768 事件，说明 TGT 可能是伪造的。

```sql
-- 检测没有对应 TGT 请求的 TGS 请求
SELECT tgs.TimeCreated, tgs.TargetUserName, tgs.ServiceName, tgs.IpAddress
FROM SecurityEvents tgs
WHERE tgs.EventID = 4769
  AND NOT EXISTS (
    SELECT 1 FROM SecurityEvents tgt
    WHERE tgt.EventID = 4768
      AND tgt.TargetUserName = tgs.TargetUserName
      AND tgt.TimeCreated BETWEEN tgs.TimeCreated - INTERVAL '10 HOURS' AND tgs.TimeCreated
  )
ORDER BY tgs.TimeCreated DESC
```

**特征二：票据生命周期异常**

Golden Ticket 通常设置很长的生命周期（如 10 年），而正常的 TGT 生命周期为 10 小时。

```sql
-- 检测生命周期异常的 TGT
SELECT TimeCreated, TargetUserName, TicketLifetime
FROM SecurityEvents
WHERE EventID = 4768
  AND TicketLifetime > 36000  -- 10 hours in seconds
ORDER BY TicketLifetime DESC
```

**特征三：加密类型降级**

Golden Ticket 工具默认使用 RC4 加密。如果域环境配置为 AES，突然出现 RC4 加密的 TGT 请求应当被视为可疑。

```sql
-- 检测 RC4 加密的 TGT 请求
SELECT TimeCreated, TargetUserName, TicketEncryptionType
FROM SecurityEvents
WHERE EventID = 4768
  AND TicketEncryptionType = 0x17  -- RC4
ORDER BY TimeCreated DESC
```

**特征四：不存在的用户或 SID 异常**

Golden Ticket 可以伪造任意用户名。如果 4769 事件中的用户名在 Active Directory 中不存在，或者 SID 与用户名不匹配，说明 TGT 可能是伪造的。

### 3. Golden Ticket 的关联分析

```
时间线示例：

2026-06-15 10:00:00  Event ID 4662 (Security) — 目录服务访问
                     对象: CN=krbtgt,CN=Users,DC=domain,DC=local
                     访问类型: 读取属性
                     → 攻击者执行 DCSync 获取 KRBTGT 哈希

2026-06-15 10:05:00  Event ID 4688 (Security) — 进程创建
                     父进程: cmd.exe
                     新进程: mimikatz.exe
                     命令行: mimikatz.exe "kerberos::golden /user:Administrator /domain:domain.local /sid:S-1-5-21-... /krbtgt:... /ptt"
                     → 攻击者伪造 Golden Ticket

2026-06-15 10:06:00  Event ID 4769 (Security) — Kerberos 服务票据请求
                     目标用户: Administrator
                     服务名称: CIFS/dc01.domain.local
                     → 攻击者使用伪造的 TGT 请求服务票据
                     注意：没有对应的 4768 事件！

2026-06-15 10:06:05  Event ID 4624 (Security) — 成功登录
                     Logon Type: 3
                     目标用户: Administrator
                     认证包: Kerberos
                     → 攻击者使用伪造的服务票据登录域控
```

---

## 0x05 Silver Ticket 攻击取证

### 1. Silver Ticket 原理

Silver Ticket 与 Golden Ticket 类似，但伪造的是服务票据（TGS）而不是 TGT：

1. 攻击者获取服务账户的 NTLM 哈希（通过 Kerberoasting 或凭据转储）
2. 攻击者使用 Mimikatz 伪造服务票据，指定任意用户名
3. 攻击者直接使用伪造的服务票据访问服务

关键认知：Silver Ticket 完全不经过 KDC，因此不会在域控上产生任何 Kerberos 事件（4768 或 4769）。检测 Silver Ticket 的唯一线索是目标系统上的 4624 事件。

### 2. Silver Ticket 的事件日志特征

**特征一：4624 事件没有对应的 4769 事件**

正常情况下，Kerberos 认证会产生 4769（TGS 请求）和 4624（成功登录）两个事件。如果 4624 事件显示 Kerberos 认证，但没有对应的 4769 事件，说明服务票据可能是伪造的。

```sql
-- 检测没有对应 TGS 请求的 Kerberos 登录
SELECT logon.TimeCreated, logon.TargetUserName, logon.IpAddress
FROM SecurityEvents logon
WHERE logon.EventID = 4624
  AND logon.AuthenticationPackageName = 'Kerberos'
  AND NOT EXISTS (
    SELECT 1 FROM SecurityEvents tgs
    WHERE tgs.EventID = 4769
      AND tgs.TargetUserName = logon.TargetUserName
      AND tgs.TimeCreated BETWEEN logon.TimeCreated - INTERVAL '5 MINUTES' AND logon.TimeCreated
  )
ORDER BY logon.TimeCreated DESC
```

**特征二：票据生命周期异常**

Silver Ticket 通常设置很长的生命周期（如 10 年）。

**特征三：加密类型降级**

Silver Ticket 工具默认使用 RC4 加密。

---

## 0x06 DCSync 攻击取证

### 1. DCSync 原理

DCSync 攻击利用 Active Directory 的复制协议，模拟域控从其他域控同步数据：

1. 攻击者获取域管理员权限
2. 攻击者使用 Mimikatz 模拟域控，向目标域控发送复制请求
3. 目标域控返回所有用户账户的密码哈希（包括 KRBTGT）

### 2. DCSync 的事件日志特征

**Event ID 4662（目录服务访问）**

```xml
<Event>
  <System>
    <EventID>4662</EventID>
    <Channel>Security</Channel>
  </System>
  <EventData>
    <Data Name="TargetUserName">DOMAIN\krbtgt</Data>
    <Data Name="Properties">
      {1131f6aa-9c07-11d1-f79f-00c04fc2dcd2}
      {19195a5b-6da0-11d0-afd3-00c04fd930c9}
    </Data>
    <Data Name="AccessMask">0x100</Data>
  </EventData>
</Event>
```

DCSync 的关键指标：
- 访问 `krbtgt` 账户
- 访问 GUID `{1131f6aa-9c07-11d1-f79f-00c04fc2dcd2}`（DS-Replication-Get-Changes）
- 访问 GUID `{19195a5b-6da0-11d0-afd3-00c04fd930c9}`（DS-Replication-Sync-From-Full-Sync）
- 来源不是已知的域控

### 3. DCSync 的检测策略

**策略一：非域控的复制请求**

```sql
-- 检测非域控的复制请求
SELECT TimeCreated, TargetUserName, IpAddress, Properties
FROM SecurityEvents
WHERE EventID = 4662
  AND Properties LIKE '%1131f6aa%'
  AND IpAddress NOT IN (SELECT IpAddress FROM DomainControllers)
ORDER BY TimeCreated DESC
```

**策略二：krbtgt 账户访问**

```sql
-- 检测 krbtgt 账户的异常访问
SELECT TimeCreated, TargetUserName, SubjectUserName, IpAddress
FROM SecurityEvents
WHERE EventID = 4662
  AND TargetUserName LIKE '%krbtgt%'
  AND SubjectUserName NOT LIKE '%$'  -- 排除计算机账户
ORDER BY TimeCreated DESC
```

---

## 0x07 证据强度分层

### 1. 确认攻击（Confirmation Level）

以下条件满足任意一项即可确认认证攻击：

- 4624 事件显示 Logon Type 3 + NTLM 认证 + 空 WorkstationName（PtH 指标）
- 4769 事件显示单个用户短时间内请求多个不同服务账户的 TGS（Kerberoasting 指标）
- 4769 事件没有对应的 4768 事件（Golden Ticket 指标）
- 4624 事件显示 Kerberos 认证但没有对应的 4769 事件（Silver Ticket 指标）
- 4662 事件显示非域控访问 krbtgt 账户（DCSync 指标）

### 2. 高度可疑（High Suspicion Level）

以下条件满足任意一项应当视为高度可疑：

- 4768 或 4769 事件显示 RC4 加密（而域环境配置为 AES）
- 4768 事件显示票据生命周期超过 10 小时
- 4624 事件显示管理员账户从异常 IP 地址登录
- 4662 事件显示对敏感 AD 对象（如 AdminSDHolder、krbtgt）的访问

### 3. 需要关注（Attention Level）

以下条件需要关注，但不足以单独判定攻击：

- 4624 事件显示 Logon Type 3 + NTLM 认证，但 WorkstationName 不为空
- 4769 事件显示单个用户请求多个 TGS，但时间间隔较长
- 4624 事件显示管理员账户从已知管理站登录

---

## 0x08 公开案例中的认证攻击取证

### 案例一：NotPetya — DCSync 与 Golden Ticket

2017 年的 NotPetya 攻击中，攻击者在获取域管理员权限后，使用 DCSync 获取了 KRBTGT 账户的哈希，然后使用 Golden Ticket 在域内持久化。

检测方法：调查人员通过分析 4662 事件发现了对 krbtgt 账户的异常访问，进而识别出 DCSync 攻击。通过分析 4769 事件发现没有对应的 4768 事件，进而识别出 Golden Ticket。

取证启示：DCSync 和 Golden Ticket 通常一起使用。检测到 DCSync 后，应当立即检查是否存在 Golden Ticket。

### 案例二：SolarWinds — Kerberoasting 与横向移动

在 SolarWinds 供应链攻击中，攻击者使用 Kerberoasting 获取了服务账户的密码，然后使用这些凭据进行横向移动。

检测方法：调查人员通过分析 4769 事件发现单个用户短时间内请求了多个不同服务账户的 TGS，进而识别出 Kerberoasting 攻击。

取证启示：Kerberoasting 是横向移动的前奏。检测到 Kerberoasting 后，应当立即检查后续的 4624 事件，识别攻击者的横向移动路径。

### 案例三：APT29 — Silver Ticket 持久化

APT29 在获取服务账户哈希后，使用 Silver Ticket 在关键服务上持久化。

检测方法：调查人员通过分析 4624 事件发现 Kerberos 认证但没有对应的 4769 事件，进而识别出 Silver Ticket。

取证启示：Silver Ticket 不经过 KDC，因此不会在域控上产生事件。检测 Silver Ticket 的唯一线索是目标系统上的 4624 事件。

---

## 0x09 参考资料

- Sean Metcalf (ADSecurity.org): [Detecting Forged Kerberos Ticket (Golden Ticket & Silver Ticket) Use in Active Directory](https://adsecurity.org/?p=1515)
- Sean Metcalf: [Detecting Kerberoasting Activity](https://adsecurity.org/?p=3458)
- Hacking Dream: [Windows Event Log Analysis — Investigating Kerberos & AD Attacks](https://www.hackingdream.net/2026/02/windows-event-log-analysis-investigating-kerberos-ad-attacks.html)
- Windows Active Directory: [How to detect Golden Ticket attacks](https://www.windows-active-directory.com/how-to-detect-golden-ticket-attacks.html)
- CYCO: [Golden & Silver Ticket Attacks Explained](https://www.cyco.ca/blog/golden-and-silver-ticket-attacks)
- Noah: [Offensive Kerberos Techniques for Detection Engineering](https://medium.com/@noah_h/offensive-kerberos-techniques-for-detection-engineering-16a81483f676)
- CyberEngage: [Tracking Kerberos & NTLM Authentication Failures and Investigation](https://medium.com/@cyberengage.org/tracking-kerberos-ntlm-authentication-failures-and-investigation-67512861a65a)
- Rakshit: [Understanding Kerberoasting: From Theory to Detection](https://medium.com/@rakshit68/understanding-kerberoasting-from-theory-to-detection-9e622c996aa9)
- HackTricks: [Silver Ticket](https://hacktricks.wiki/en/windows-hardening/active-directory-methodology/silver-ticket.html)
- MITRE ATT&CK: [T1558 — Steal or Forge Kerberos Tickets](https://attack.mitre.org/techniques/T1558/)
- MITRE ATT&CK: [T1558.003 — Kerberoasting](https://attack.mitre.org/techniques/T1558/003/)
- MITRE ATT&CK: [T1558.001 — Golden Ticket](https://attack.mitre.org/techniques/T1558/001/)
