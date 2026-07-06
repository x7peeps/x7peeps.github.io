---
title: "凭据攻击链与Kerberos攻击取证分析"
date: 2026-06-25T18:00:00+08:00
draft: false
weight: 420
description: "围绕 Kerberos 协议攻击和凭据攻击链的完整技术体系，深入分析 Pass-the-Hash、Pass-the-Ticket、Kerberoasting、AS-REP Roasting、Golden/Silver Ticket、DCSync 等攻击的原理、取证特征和检测方法。"
categories: ["应急响应", "取证分析"]
tags: ["Kerberos", "Pass-the-Hash", "Pass-the-Ticket", "Kerberoasting", "GoldenTicket", "DCSync", "T1550", "T1558"]
---

# 凭据攻击链与Kerberos攻击取证分析

在 Windows 域环境的攻击场景中，凭据是攻击者最核心的"货币"。从初始访问到域控沦陷，攻击者始终在围绕凭据展开博弈——获取凭据、复用凭据、伪造凭据、窃取凭据。Kerberos 作为现代 Active Directory 域环境的默认认证协议，既是企业安全的基石，也是攻击者重点关注的攻击面。

已有文章 `Windows认证机制与攻击链取证分析` 覆盖了 NTLM/Kerberos 认证协议的基础攻击检测，`凭据抓取与认证材料取证分析` 覆盖了凭据获取的来源与方法。本文从不同的视角切入：**围绕凭据攻击链的完整生命周期，系统性地剖析 Kerberos 协议的每一种攻击手段在事件日志中的取证指纹，并通过多攻击技术的交叉关联构建完整的取证分析框架，最终提供可落地的自动化检测方案。**

---

## 0x01 Kerberos 协议基础

### 1.1 认证流程

Kerberos 协议采用票据（Ticket）机制实现认证，避免了密码在网络上的直接传输。整个认证流程分为三个阶段，涉及五种核心消息：

```
阶段一：认证服务阶段（AS Exchange）
┌────────┐                          ┌────────┐
│  客户端  │ ──── AS-REQ ──────────→ │  KDC   │
│        │ ←──── AS-REP ──────────  │  (AS)  │
└────────┘                          └────────┘
  客户端发送预认证数据（时间戳）        KDC 验证后返回 TGT

阶段二：票据授予阶段（TGS Exchange）
┌────────┐                          ┌────────┐
│  客户端  │ ──── TGS-REQ ────────→ │  KDC   │
│        │ ←──── TGS-REP ────────  │  (TGS) │
└────────┘                          └────────┘
  客户端发送 TGT + 目标 SPN          KDC 返回服务票据

阶段三：客户端/服务阶段（AP Exchange）
┌────────┐                          ┌────────┐
│  客户端  │ ──── AP-REQ ──────────→ │ 服务端  │
│        │ ←──── AP-REP ──────────  │        │
└────────┘                          └────────┘
  客户端发送服务票据                  服务端验证票据并授权访问
```

每种消息的详细作用：

| 消息类型 | 方向 | 内容 | 作用 |
| --- | --- | --- | --- |
| AS-REQ | 客户端 → KDC | 用户名、时间戳（用用户密钥加密）、请求的 TGT 生命周期 | 客户端向认证服务证明自己的身份 |
| AS-REP | KDC → 客户端 | TGT（用 KRBTGT 哈希加密）、会话密钥（用用户密钥加密） | 客户端获得 TGT，可用于后续服务票据申请 |
| TGS-REQ | 客户端 → KDC | TGT、Authenticator（用会话密钥加密）、目标 SPN | 客户端向票据授予服务请求特定服务的票据 |
| TGS-REP | KDC → 客户端 | 服务票据（用服务账户哈希加密）、新会话密钥（用 TGT 会话密钥加密） | 客户端获得服务票据，可用于访问目标服务 |
| AP-REQ | 客户端 → 服务端 | 服务票据、Authenticator（用新会话密钥加密） | 客户端向服务端证明自己有权访问该服务 |

### 1.2 关键组件

**KDC（Key Distribution Center，密钥分发中心）**

KDC 是 Kerberos 体系的核心，部署在域控制器上，包含两个子服务：

- **AS（Authentication Service）**：负责验证客户端身份，签发 TGT
- **TGS（Ticket Granting Service）**：负责根据 TGT 签发服务票据

**Service Principal（服务主体）**

每个网络服务（如 HTTP、MSSQL、CIFS）在 AD 中注册一个 SPN（Service Principal Name）。SPN 将服务实例与一个域用户账户（服务账户）绑定，KDC 使用该服务账户的密码哈希加密服务票据。

**KRBTGT 账户**

KRBTGT 是一个内置的域用户账户，其密码哈希用于加密和签名所有 TGT。攻击者一旦获取 KRBTGT 哈希，就可以伪造任意 TGT（Golden Ticket 攻击）。

### 1.3 票据结构

**TGT（Ticket Granting Ticket）**

TGT 是 KDC 签发给客户端的"身份凭证"，主要包含：

- 客户端名称和域名
- 客户端 SID
- 票据有效期（起止时间）
- 会话密钥
- PAC（特权属性证书）
- 加密部分：用 KRBTGT 的哈希加密，客户端无法解密

TGT 默认有效期为 10 小时，最长可续期到 7 天（取决于域策略）。

**Service Ticket（服务票据）**

Service Ticket 是 KDC 签发给客户端的"服务访问凭证"，主要包含：

- 客户端名称和域名
- 目标服务的 SPN
- 票据有效期
- PAC
- 加密部分：用目标服务账户的密码哈希加密

Service Ticket 默认有效期为 10 小时（但实际受委派策略限制，通常为 5 分钟）。

### 1.4 PAC（特权属性证书）的作用

PAC 是 Kerberos 票据中的一个关键扩展，包含用户的授权信息：

| 字段 | 作用 |
| --- | --- |
| User ID | 用户的 SID |
| Group IDs | 用户所属的安全组 SID 列表 |
| Privileges | 用户拥有的特权（如 SeDebugPrivilege） |
| Resource Groups | 资源组信息 |
| Signature | PAC 完整性签名（用服务账户密钥或 KRBTGT 密钥签名） |

PAC 的安全意义：

- 服务端通过 PAC 判断用户是否有权限访问资源
- PAC 签名防止票据内容被篡改
- 攻击者伪造 PAC 可以提升权限（如在 Golden Ticket 中伪造管理员组 membership）
- Windows Server 2016+ 引入了 PAC 验证（PAC Validation），服务端会向 KDC 验证 PAC 的有效性

### 1.5 NTLM 哈希在 Kerberos 中的角色

NTLM 哈希（即用户密码的 MD4 哈希）在 Kerberos 中扮演两个关键角色：

1. **客户端预认证**：客户端使用 NTLM 哈希派生的密钥加密时间戳，KDC 用存储的 NTLM 哈希解密验证
2. **票据加密**：服务票据用服务账户的 NTLM 哈希加密，服务端用自身 NTLM 哈希解密

这意味着：**获取了用户的 NTLM 哈希就等于获取了该用户在 Kerberos 体系中的全部认证能力**。这是 Pass-the-Hash、Golden Ticket、Silver Ticket 等攻击能够成立的根本原因。

---

## 0x02 Pass-the-Hash 攻击（T1550.002）

### 2.1 攻击原理

Pass-the-Hash（PtH）攻击利用 NTLM 认证的核心缺陷：攻击者不需要知道用户的明文密码，只需要 NTLM 哈希（16 字节的 MD4 值）就可以完成 NTLM 认证。

```
正常 NTLM 认证流程：
  用户 ──密码明文→ LSASS ──NTLM哈希→ Challenge加密 ──响应→ 服务器

PtH 攻击流程：
  攻击者 ──NTLM哈希直接注入→ Challenge加密 ──响应→ 服务器
         （跳过密码输入环节，哈希直接从 LSASS 提取）
```

PtH 攻击的核心前提是 Windows 的 NTLM 认证协议设计：NTLM 哈希本身就是认证的"等价凭证"（Equivalent Identity），而非密码的衍生验证值。

### 2.2 攻击实现

**Mimikatz**

```powershell
sekurlsa::logonpasswords
sekurlsa::pth /user:Administrator /domain:corp.local /ntlm:fc528... /run:powershell.exe
```

**Invoke-TheHash**

```powershell
Invoke-SMBExec -Target 10.0.1.10 -Username Administrator -Hash fc528... -Command "whoami" -Domain corp.local
Invoke-WMIExec -Target 10.0.1.10 -Username Administrator -Hash fc528... -Command "whoami" -Domain corp.local
```

**CrackMapExec / NetExec**

```bash
netexec smb 10.0.1.10 -u Administrator -H fc528... -x "whoami"
netexec winrm 10.0.1.10 -u Administrator -H fc528... -x "whoami"
```

### 2.3 取证特征

**Event ID 4624（成功登录）— NTLM Logon Type 3**

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Security-Auditing" Guid="{54849625-5478-4994-a5ba-3e3b0328c30d}" />
    <EventID>4624</EventID>
    <Version>2</Version>
    <Level>0</Level>
    <Task>12544</Task>
    <Opcode>0</Opcode>
    <Keywords>0x8020000000000000</Keywords>
    <TimeCreated SystemTime="2026-06-25T09:30:15.1234567Z" />
    <Channel>Security</Channel>
    <Computer>DC01.corp.local</Computer>
  </System>
  <EventData>
    <Data Name="SubjectUserSid">S-1-0-0</Data>
    <Data Name="SubjectUserName">-</Data>
    <Data Name="SubjectDomainName">-</Data>
    <Data Name="SubjectLogonId">0x0</Data>
    <Data Name="TargetUserSid">S-1-5-21-1234567890-1234567890-1234567890-500</Data>
    <Data Name="TargetUserName">Administrator</Data>
    <Data Name="TargetDomainName">CORP</Data>
    <Data Name="TargetLogonId">0x3e7</Data>
    <Data Name="LogonType">3</Data>
    <Data Name="LogonProcessName">NtLmSsp</Data>
    <Data Name="AuthPackageName">NTLM</Data>
    <Data Name="WorkstationName"></Data>
    <Data Name="LogonGuid">{00000000-0000-0000-0000-000000000000}</Data>
    <Data Name="TransmittedServices">-</Data>
    <Data Name="LmPackageName">NTLM V2</Data>
    <Data Name="KeyLength">128</Data>
    <Data Name="ProcessId">0x0</Data>
    <Data Name="ProcessName"></Data>
    <Data Name="IpAddress">10.0.1.50</Data>
    <Data Name="IpPort">49826</Data>
    <Data name="ImpersonationLevel">%%1936</Data>
    <Data Name="RestrictedAdminMode">-</Data>
    <Data Name="TargetOutboundUserName">-</Data>
    <Data Name="TargetOutboundDomainName">-</Data>
    <Data Name="VirtualAccount">%%1843</Data>
    <Data Name="TargetLinkedLogonId">0x0</Data>
    <Data Name="ElevatedToken">%%1843</Data>
  </EventData>
</Event>
```

PtH 关键取证指标：

| 指标 | 值 | 含义 |
| --- | --- | --- |
| LogonType | 3（Network） | 网络登录，非交互式 |
| AuthPackageName | NTLM | 使用 NTLM 认证而非 Kerberos |
| WorkstationName | 空值 | PtH 工具通常不填充工作站名 |
| IpAddress | 远程 IP | 攻击来源 IP |
| LmPackageName | NTLM V2 | NTLMv2 响应 |
| SubjectUserSid | S-1-0-0 | 匿名，因为这是网络认证 |

**Event ID 4648（使用显式凭据登录）**

```xml
<Event>
  <System>
    <EventID>4648</EventID>
    <Channel>Security</Channel>
  </System>
  <EventData>
    <Data Name="SubjectUserSid">S-1-5-21-...-1008</Data>
    <Data Name="SubjectUserName">alice</Data>
    <Data Name="SubjectDomainName">CORP</Data>
    <Data Name="TargetUserName">Administrator</Data>
    <Data Name="TargetDomainName">CORP</Data>
    <Data Name="TargetServerName">DC01.corp.local</Data>
    <Data Name="ProcessId">0x1a2b</Data>
    <Data Name="ProcessName">C:\Windows\System32\cmd.exe</Data>
    <Data Name="IpAddress">10.0.1.50</Data>
    <Data Name="IpPort">0</Data>
  </EventData>
</Event>
```

4648 事件表明攻击者在已登录的会话中，使用显式凭据（如 `runas` 或 PtH 工具）进行二次认证。当 4648 事件中的目标账户为高权限账户（如 Administrator），且来源进程为可疑命令行工具时，应当视为 PtH 攻击的辅助证据。

### 2.4 检测方法

**NTLM 认证审计**

启用 NTLM 认证审计策略，记录所有 NTLM 认证请求：

```
策略路径：Computer Configuration > Windows Settings > Security Settings >
          Local Policies > Security Options >
          Network security: Restrict NTLM: NTLM authentication in this domain
```

设置为 "Enable auditing for all accounts" 后，系统会产生 Event ID 8001（允许）和 8004（拒绝）事件。

**异常登录源 IP 检测**

```sql
SELECT TargetUserName, IpAddress, COUNT(*) AS login_count,
       MIN(TimeCreated) AS first_seen, MAX(TimeCreated) AS last_seen
FROM SecurityEvent
WHERE EventID = 4624
  AND LogonType = 3
  AND AuthenticationPackageName = 'NTLM'
  AND TimeCreated > DATEADD(HOUR, -24, GETDATE())
GROUP BY TargetUserName, IpAddress
HAVING COUNT(*) > 10
ORDER BY login_count DESC
```

**NTLM 中继检测**

启用 Extended Protection for Authentication（EPA）和 Channel Binding Token（CBT），可以检测 NTLM 中继攻击。配置后，NTLM 认证请求中会包含绑定信息，中间人无法正确转发。

---

## 0x03 Pass-the-Ticket 攻击（T1550.003）

### 3.1 攻击原理

Pass-the-Ticket（PtT）攻击利用 Kerberos 票据的可传递性：攻击者窃取有效的 TGT 或 Service Ticket 后，将其注入到自己的 Kerberos 会话中，从而冒充票据所属用户访问域资源。

```
PtT 攻击流程：
1. 攻击者从 LSASS 内存中提取 Kerberos 票据（TGT 或 TGS）
2. 将票据注入到攻击者控制的会话中
3. 使用注入的票据向目标服务进行 Kerberos 认证
4. 服务端验证票据（签名有效、未过期），允许访问

与 PtH 的区别：
- PtH 使用 NTLM 哈希，在 NTLM 认证通道中使用
- PtT 使用 Kerberos 票据，在 Kerberos 认证通道中使用
- PtT 可以利用 PAC 中的授权信息，可能获得比原始用户更高的权限
```

### 3.2 攻击实现

**Mimikatz Pass-the-Ticket**

```powershell
mimikatz # kerberos::ptt ticket.kirbi
```

从 LSASS 内存中导出所有 Kerberos 票据：

```powershell
mimikatz # sekurlsa::tickets /export
```

**Rubeus Pass-the-Ticket**

```powershell
# 从文件注入票据
Rubeus.exe ptt /ticket:ticket.kirbi

# 从 Base64 注入
Rubeus.exe ptt /ticket:<base64_encoded_ticket>

# 使用 TGT 请求服务票据并注入
Rubeus.exe asktgt /user:Administrator /rc4:fc528... /ptt

# 使用 TGT 请求特定服务票据
Rubeus.exe s4u /user:svc_sql /rc4:... /msdsspn:MSSQLSvc/sql01.corp.local /ptt
```

### 3.3 Pass-the-Ticket 与 Pass-the-Hash 的区别

| 特性 | Pass-the-Hash | Pass-the-Ticket |
| --- | --- | --- |
| 使用的认证材料 | NTLM 哈希（16 字节） | Kerberos 票据（kirbi 格式） |
| 认证协议 | NTLM | Kerberos |
| 经过 KDC | 是（NTLM 验证需要 DC 参与） | 否（票据自验证） |
| 产生的日志 | 4624 + AuthPackageName=NTLM | 4624 + AuthPackageName=Kerberos |
| 持续时间 | 无时间限制（哈希不变即可用） | 受票据有效期限制（TGT 默认 10 小时） |
| 权限范围 | 继承原始用户的 NTLM 权限 | 继承 PAC 中的授权信息 |
| 可传递性 | 仅限 NTLM 认证的服务 | 可跨多个服务传递 TGT |
| 检测难度 | 中等（NTLM 日志较完整） | 较高（Kerberos 日志关联复杂） |

### 3.4 取证特征

**Event ID 4768/4769 异常模式**

正常 Kerberos 认证流程中，4768（TGT 请求）和 4769（TGS 请求）是成对出现的。PtT 攻击的特征是：

- 使用已有的 TGT（不再产生 4768 事件）
- 直接使用 TGS 访问服务（产生 4769 但无前置 4768）

**票据过期时间异常**

PtT 注入的票据可能已经接近过期或已过期。如果 4624 事件中 Kerberos 认证成功，但对应 TGS 的生命周期明显偏短，说明使用的是接近过期的票据。

**Event ID 4769 中 TicketEncryptionType 的一致性**

```xml
<Event>
  <System>
    <EventID>4769</EventID>
    <Channel>Security</Channel>
  </System>
  <EventData>
    <Data Name="TargetUserName">Administrator@CORP.LOCAL</Data>
    <Data Name="ServiceName">CIFS/DC01.corp.local</Data>
    <Data Name="ServiceSid">S-1-5-21-...-496</Data>
    <Data Name="TicketEncryptionType">0x12</Data>
    <Data Name="TicketOptions">0x40810000</Data>
    <Data Name="Status">0x0</Data>
    <Data Name="IpAddress">10.0.1.50</Data>
  </EventData>
</Event>
```

### 3.5 检测方法

**票据生命周期追踪**

追踪从 TGT 签发到 TGS 使用的时间差。如果 TGS 使用时间远超正常的 TGT 有效期（如 TGT 签发后 15 小时才使用），说明可能是票据被持久化后延迟使用：

```sql
SELECT tgt.TargetUserName, tgt.TimeCreated AS tgt_time,
       tgs.TimeCreated AS tgs_time,
       DATEDIFF(MINUTE, tgt.TimeCreated, tgs.TimeCreated) AS diff_minutes
FROM SecurityEvent tgs
INNER JOIN SecurityEvent tgt
  ON tgs.TargetUserName = tgt.TargetUserName
  AND tgt.EventID = 4768
  AND tgs.EventID = 4769
WHERE tgs.TimeCreated > tgt.TimeCreated
  AND DATEDIFF(MINUTE, tgt.TimeCreated, tgs.TimeCreated) > 600
ORDER BY diff_minutes DESC
```

**源 IP 关联分析**

PtT 攻击通常来自非预期的源 IP。将 4768/4769 事件中的 IpAddress 与正常登录基线对比：

```sql
SELECT TargetUserName, IpAddress, COUNT(*) AS request_count
FROM SecurityEvent
WHERE EventID IN (4768, 4769)
  AND TimeCreated > DATEADD(DAY, -1, GETDATE())
GROUP BY TargetUserName, IpAddress
HAVING TargetUserName NOT IN (
  SELECT TargetUserName FROM SecurityEvent
  WHERE EventID = 4624
    AND LogonType = 2
    AND IpAddress = '127.0.0.1'
  GROUP BY TargetUserName
)
ORDER BY TargetUserName
```

---

## 0x04 Kerberoasting 攻击（T1558.003）

### 4.1 攻击原理

Kerberoasting 是一种离线密码破解攻击，利用 Kerberos 协议的设计特点：任何域用户都可以向 KDC 请求任意 SPN 对应的服务票据，且该票据使用目标服务账户的密码哈希加密。

```
Kerberoasting 攻击流程：
1. 域用户枚举 AD 中所有注册了 SPN 的服务账户
2. 向 KDC 为每个 SPN 请求服务票据（TGS）
3. KDC 返回用服务账户 NTLM 哈希加密的 TGS
4. 攻击者将 TGS 导出为离线文件
5. 使用 hashcat 或 John the Ripper 离线破解 TGS 中的服务账户密码
6. 获取服务账户明文密码后，使用合法凭据访问目标服务
```

关键认知：Kerberoasting **不需要任何特殊权限**。任何已认证的域用户都有权请求 TGS。攻击的成功完全取决于服务账户密码的强度。

### 4.2 攻击实现

**Rubeus Kerberoasting**

```powershell
# 请求所有 SPN 的服务票据
Rubeus.exe kerberoast /outfile:hashes.txt

# 指定特定 SPN
Rubeus.exe kerberoast /user:svc_sql /outfile:hash.txt

# 使用 AES 加密方式请求（绕过某些检测）
Rubeus.exe kerberoast /enctype:aes256 /outfile:hashes.txt

# 使用 RC4 加密方式请求（更容易破解）
Rubeus.exe kerberoast /enctype:rc4 /outfile:hashes.txt
```

**Impacket GetUserSPNs.py**

```bash
# 枚举 SPN
GetUserSPNs.py corp.local/administrator:password -dc-ip 10.0.1.1 -request

# 使用哈希认证
GetUserSPNs.py corp.local/administrator -hashes aad3b...:fc528... -dc-ip 10.0.1.1 -request

# 请求特定用户的服务票据
GetUserSPNs.py corp.local/administrator:password -dc-ip 10.0.1.1 -request-user svc_sql
```

**PowerShell Invoke-Kerberoast**

```powershell
Import-Module .\Invoke-Kerberoast.ps1
Invoke-Kerberoast -OutputFormat Hashcat | Out-File -Encoding ASCII hashes.txt
```

### 4.3 取证特征

**Event ID 4769 — RC4 加密票据请求**

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Security-Auditing" Guid="{54849625-5478-4994-a5ba-3e3b0328c30d}" />
    <EventID>4769</EventID>
    <Version>0</Version>
    <Level>0</Level>
    <Task>14336</Task>
    <Opcode>0</Opcode>
    <Keywords>0x8020000000000000</Keywords>
    <TimeCreated SystemTime="2026-06-25T10:15:32.9876543Z" />
    <Channel>Security</Channel>
    <Computer>DC01.corp.local</Computer>
  </System>
  <EventData>
    <Data Name="TargetUserName">alice@CORP.LOCAL</Data>
    <Data Name="TargetDomainName">CORP.LOCAL</Data>
    <Data Name="TargetSid">S-1-5-21-1234567890-1234567890-1234567890-1105</Data>
    <Data Name="ServiceName">MSSQLSvc/sql01.corp.local:1433</Data>
    <Data Name="ServiceSid">S-1-5-21-1234567890-1234567890-1234567890-1234</Data>
    <Data Name="TicketEncryptionType">0x17</Data>
    <Data Name="TicketOptions">0x40810000</Data>
    <Data Name="Status">0x0</Data>
    <Data Name="TicketOptions">0x40810000</Data>
    <Data Name="TransmittedServices">-</Data>
    <Data Name="IpAddress">::ffff:10.0.1.50</Data>
    <Data Name="IpPort">54321</Data>
  </EventData>
</Event>
```

Kerberoasting 关键取证指标：

| 指标 | 值 | 含义 |
| --- | --- | --- |
| TicketEncryptionType | 0x17（RC4-HMAC） | RC4 加密，更容易离线破解 |
| TicketOptions | 0x40810000 | 请求可转发票据（Forwardable + Renewable） |
| 单用户多 SPN 请求 | 短时间内同一用户请求多个不同 SPN | 批量请求服务票据 |
| Status | 0x0 | 认证成功，票据签发正常 |

### 4.4 检测方法

**批量 TGS 请求检测**

```sql
SELECT TargetUserName, COUNT(DISTINCT ServiceName) AS spn_count,
       MIN(TimeCreated) AS first_request, MAX(TimeCreated) AS last_request,
       DATEDIFF(SECOND, MIN(TimeCreated), MAX(TimeCreated)) AS duration_seconds
FROM SecurityEvent
WHERE EventID = 4769
  AND TimeCreated > DATEADD(HOUR, -1, GETDATE())
GROUP BY TargetUserName
HAVING COUNT(DISTINCT ServiceName) >= 5
ORDER BY spn_count DESC
```

**RC4 降级检测**

如果域环境已配置为使用 AES-256 加密，RC4 票据请求是异常行为：

```kql
SecurityEvent
| where EventID == 4769
| where TicketEncryptionType == "0x17"
| summarize RC4Count = count(), TotalCount = count() by TargetUserName, bin(TimeCreated, 5m)
| where RC4Count > 3
| project TimeCreated, TargetUserName, RC4Count, TotalCount
| order by TimeCreated desc
```

**SPN 审计**

定期审计域中的 SPN 注册情况，识别可疑的服务账户：

```powershell
Get-ADUser -Filter { ServicePrincipalName -ne "$null" } -Properties ServicePrincipalName, PasswordLastSet, MemberOf |
  Select-Object Name, SamAccountName, ServicePrincipalName, PasswordLastSet,
    @{N='PasswordAge';E={(Get-Date) - $_.PasswordLastSet}} |
  Sort-Object PasswordAge -Descending
```

---

## 0x05 AS-REP Roasting 攻击（T1558.004）

### 5.1 攻击原理

AS-REP Roasting 攻击利用 Active Directory 中禁用了预认证（Pre-authentication）的账户。正常情况下，Kerberos AS-REQ 要求客户端用密码哈希加密时间戳作为预认证数据（PA-DATA），防止离线破解。但某些账户被配置为"不需要 Kerberos 预认证"（DONT_REQUIRE_PREAUTH），攻击者可以：

```
AS-REP Roasting 攻击流程：
1. 枚举 AD 中设置了 DONT_REQUIRE_PREAUTH 标志的用户
2. 为每个用户发送 AS-REQ（不带预认证数据）
3. KDC 返回 AS-REP，其中包含用用户 NTLM 哈希加密的部分
4. 攻击者将 AS-REP 导出为离线格式
5. 使用 hashcat（-m 18200）或 John the Ripper 离线破解
6. 获取用户明文密码
```

与 Kerberoasting 的区别：

| 特性 | Kerberoasting | AS-REP Roasting |
| --- | --- | --- |
| 攻击目标 | 有 SPN 的服务账户 | 禁用预认证的用户账户 |
| 权限要求 | 任何域用户 | 任何域用户 |
| 请求的票据 | TGS（服务票据） | AS-REP（TGT 响应） |
| Event ID | 4769 | 4768 |
| 加密部分 | 服务票据中服务账户哈希加密的部分 | TGT 响应中用户哈希加密的部分 |
| 受影响账户比例 | 较多（许多 SPN 服务账户） | 较少（通常只有少数账户禁用预认证） |

### 5.2 攻击实现

**Rubeus AS-REP Roasting**

```powershell
# 枚举所有可 Roast 的账户并导出哈希
Rubeus.exe asreproast /outfile:asrep_hashes.txt

# 指定特定用户
Rubeus.exe asreproast /user:svc_backup /outfile:hash.txt

# 使用 AES 加密方式
Rubeus.exe asreproast /enctype:aes256 /outfile:asrep_aes.txt
```

**Impacket GetNPUsers.py**

```bash
# 使用用户名列表枚举
GetNPUsers.py corp.local/ -usersfile users.txt -dc-ip 10.0.1.1 -no-pass -outfile asrep.txt

# 使用域管理员凭据枚举所有可 Roast 账户
GetNPUsers.py corp.local/administrator:password -dc-ip 10.0.1.1 -request -outputfile asrep_all.txt

# 使用哈希认证
GetNPUsers.py corp.local/ -usersfile users.txt -dc-ip 10.0.1.1 -hashes aad3b...:fc528... -no-pass
```

### 5.3 取证特征

**Event ID 4768 — 无预认证请求**

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Security-Auditing" Guid="{54849625-5478-4994-a5ba-3e3b0328c30d}" />
    <EventID>4768</EventID>
    <Version>0</Version>
    <Level>0</Level>
    <Task>14336</Task>
    <Opcode>0</Opcode>
    <Keywords>0x8020000000000000</Keywords>
    <TimeCreated SystemTime="2026-06-25T10:20:45.1234567Z" />
    <Channel>Security</Channel>
    <Computer>DC01.corp.local</Computer>
  </System>
  <EventData>
    <Data Name="TargetUserName">svc_backup</Data>
    <Data Name="TargetDomainName">CORP.LOCAL</Data>
    <Data Name="TargetSid">S-1-5-21-1234567890-1234567890-1234567890-1234</Data>
    <Data Name="ServiceName">krbtgt/CORP.LOCAL</Data>
    <Data Name="TicketEncryptionType">0x0</Data>
    <Data Name="TicketOptions">0x40810000</Data>
    <Data Name="Status">0x0</Data>
    <Data Name="PreAuthType">0</Data>
    <Data Name="IpAddress">::ffff:10.0.1.50</Data>
    <Data Name="IpPort">54322</Data>
  </EventData>
</Event>
```

AS-REP Roasting 关键取证指标：

| 指标 | 值 | 含义 |
| --- | --- | --- |
| TicketEncryptionType | 0x0（无加密） | 预认证被禁用 |
| PreAuthType | 0 | 无预认证数据 |
| ServiceName | krbtgt/DOMAIN | 请求的是 TGT |
| Status | 0x0 | KDC 正常响应（返回了加密的 AS-REP） |

### 5.4 检测方法

**预认证禁用账户审计**

定期审计设置了 DONT_REQUIRE_PREAUTH 的账户：

```powershell
Get-ADUser -Filter { DoesNotRequirePreAuth -eq $true } -Properties DoesNotRequirePreAuth, PasswordLastSet, Enabled |
  Select-Object Name, SamAccountName, Enabled, PasswordLastSet,
    @{N='PasswordAgeDays';E={((Get-Date) - $_.PasswordLastSet).Days}} |
  Sort-Object PasswordAgeDays -Descending
```

**无预认证 TGT 请求检测**

```sql
SELECT TargetUserName, IpAddress, TimeCreated, TicketEncryptionType, PreAuthType
FROM SecurityEvent
WHERE EventID = 4768
  AND PreAuthType = 0
  AND Status = '0x0'
  AND TimeCreated > DATEADD(DAY, -7, GETDATE())
ORDER BY TimeCreated DESC
```

**批量无预认证请求检测**

攻击者可能对所有禁用预认证的账户发起请求，短时间内产生大量 Event ID 4768（PreAuthType=0）事件：

```kql
SecurityEvent
| where EventID == 4768
| where PreAuthType == "0" or PreAuthType == ""
| summarize RequestCount = count(), DistinctUsers = dcount(TargetUserName) by IpAddress, bin(TimeCreated, 5m)
| where RequestCount > 5
| project TimeCreated, IpAddress, RequestCount, DistinctUsers
| order by TimeCreated desc
```

---

## 0x06 Golden Ticket 攻击（T1558.001）

### 6.1 攻击原理

Golden Ticket 是 Kerberos 攻击体系中最具破坏力的攻击技术。攻击者获取 KRBTGT 账户的 NTLM 哈希后，可以伪造任意用户的 TGT，且该 TGT 会被域内所有服务信任。

```
Golden Ticket 攻击流程：
1. 攻击者获取 KRBTGT 账户的 NTLM 哈希
   （通过 DCSync、域控内存转储、NTDS.dit 提取等）
2. 使用 KRBTGT 哈希伪造 TGT：
   - 指定任意用户名（如 Administrator）
   - 伪造 PAC（包含 Domain Admins 组 membership）
   - 设置极长的有效期（如 10 年）
3. 使用伪造的 TGT 向 KDC 请求服务票据
4. KDC 验证 TGT 签名（KRBTGT 哈希匹配），签发服务票据
5. 攻击者使用服务票据访问域内任意资源
```

Golden Ticket 的威力在于：**KRBTGT 哈希是整个域 Kerberos 体系的根信任锚点**。拥有它就等于拥有了签发任何身份凭证的能力。

### 6.2 攻击实现

**Mimikatz Golden Ticket**

```powershell
mimikatz # kerberos::golden /user:Administrator /domain:corp.local /sid:S-1-5-21-1234567890-1234567890-1234567890 /krbtgt:fc528... /ptt
```

关键参数说明：

| 参数 | 作用 |
| --- | --- |
| /user | 指定伪造的用户名（可以是任意不存在的用户名） |
| /domain | 域 FQDN |
| /sid | 域 SID（必须与真实域 SID 匹配） |
| /krbtgt | KRBTGT 账户的 NTLM 哈希 |
| /ptt | 直接注入当前会话 |
| /ticket | 导出为 .kirbi 文件 |
| /id | 伪造的用户 RID（默认 500，即 Administrator） |
| /groups | 伪造的组 SID 列表（默认包含 512, 513, 518, 519, 520） |
| /ptt | 注入票据到当前会话 |
| /startoffset | 票据起始偏移时间 |
| /endin | 票据有效时长（分钟） |
| /renewmax | 最大续期时长（分钟） |

**使用 Rubeus 刷新 Golden Ticket**

```powershell
Rubeus.exe triage
Rubeus.exe ticketdump
```

### 6.3 攻击范围和持久性

Golden Ticket 的持久性取决于 KRBTGT 密码是否被重置：

| 场景 | 持续时间 | 说明 |
| --- | --- | --- |
| KRBTGT 未重置 | 永久 | 票据伪造持续有效 |
| KRBTGT 重置一次 | 仍有效 | Windows 历史兼容性保留旧密码 |
| KRBTGT 重置两次（间隔 >12 小时） | 失效 | 旧 KRBTGT 哈希完全失效 |

Golden Ticket 的攻击范围：

- 可以伪造任何用户身份（包括不存在的用户）
- 可以伪造任何组 membership（包括 Domain Admins）
- 可以访问域内任何启用 Kerberos 认证的服务
- 可以绕过大多数访问控制机制（除了 PAC 验证和证书认证）

### 6.4 取证特征

**特征一：4769 事件无对应 4768 事件**

正常 Kerberos 认证中，4768（TGT 请求）必须在 4769（TGS 请求）之前出现。Golden Ticket 使用伪造的 TGT，不经过 KDC 的 AS 阶段，因此只有 4769 没有 4768：

```sql
SELECT tgs.TimeCreated AS tgs_time, tgs.TargetUserName, tgs.ServiceName,
       tgs.IpAddress, tgs.TicketEncryptionType
FROM SecurityEvent tgs
WHERE tgs.EventID = 4769
  AND NOT EXISTS (
    SELECT 1 FROM SecurityEvent tgt
    WHERE tgt.EventID = 4768
      AND tgt.TargetUserName = tgs.TargetUserName
      AND tgt.TimeCreated BETWEEN DATEADD(HOUR, -10, tgs.TimeCreated) AND tgs.TimeCreated
  )
  AND tgs.TargetUserName NOT LIKE '%$'
ORDER BY tgs.TimeCreated DESC
```

**特征二：票据生命周期异常**

Golden Ticket 默认设置极长的票据有效期（Mimikatz 默认为 10 年）。正常 TGT 有效期为 10 小时，如果 4768 事件中 TicketLifetime 超过 10 小时，应当视为高度可疑。

**特征三：RC4 加密降级**

Golden Ticket 工具默认使用 RC4 加密。在配置为 AES 的域环境中，突然出现 RC4 加密的 TGT 请求应当告警。

**特征四：异常用户身份**

Golden Ticket 可以伪造任意用户名。以下情况应当关注：

- 4769 事件中的用户名在 AD 中不存在
- 4769 事件中的用户名与 PAC 中的 SID 不匹配
- 4769 事件中的组 membership 包含不属于该用户的高权限组

### 6.5 检测方法

**TGT 溯源**

对每条 4769 事件追溯其对应的 4768 事件。如果找不到 4768 事件，且该用户的 TGT 有效时间超过 10 小时，应当标记为 Golden Ticket 嫌疑。

**KRBTGT 重置检测**

监控 KRBTGT 密码重置事件，确保重置操作发生两次且间隔超过 12 小时：

```powershell
Get-WinEvent -FilterHashtable @{
    LogName = 'Security'
    ID = 4726
} -MaxEvents 100 | Where-Object {
    $_.Properties[0].Value -match 'krbtgt'
} | Select-Object TimeCreated, @{N='TargetUser';E={$_.Properties[0].Value}}, @{N='Operator';E={$_.Properties[4].Value}}
```

---

## 0x07 Silver Ticket 攻击（T1558.002）

### 7.1 攻击原理

Silver Ticket 与 Golden Ticket 的原理类似，但伪造的对象不同：Golden Ticket 伪造的是 TGT，Silver Ticket 伪造的是 Service Ticket。

```
Silver Ticket 攻击流程：
1. 攻击者获取目标服务账户的 NTLM 哈希
   （通过 Kerberoasting 破解、凭据转储等）
2. 使用服务账户哈希伪造 Service Ticket：
   - 指定任意用户名
   - 伪造 PAC（包含目标服务的授权信息）
   - 直接设置为服务票据格式
3. 将伪造的 Service Ticket 注入到本地会话
4. 使用服务票据直接访问目标服务（不经过 KDC）
```

Silver Ticket 的关键优势是完全不与 KDC 交互，因此域控上不会产生任何 Kerberos 日志事件。

### 7.2 攻击实现

**Mimikatz Silver Ticket**

```powershell
mimikatz # kerberos::golden /user:Administrator /domain:corp.local /sid:S-1-5-21-1234567890-1234567890-1234567890 /target:sql01.corp.local /service:MSSQLSvc /rc4:<service_account_ntlm_hash> /ptt
```

Silver Ticket 的关键参数：

| 参数 | 作用 |
| --- | --- |
| /target | 目标服务主机名 |
| /service | 目标服务的 SPN 前缀（如 MSSQLSvc、CIFS、HTTP） |
| /rc4 | 目标服务账户的 NTLM 哈希 |
| /user | 伪造的用户名（可以是任意用户） |
| /ptt | 注入当前会话 |

### 7.3 Silver Ticket 与 Golden Ticket 的区别

| 特性 | Golden Ticket | Silver Ticket |
| --- | --- | --- |
| 伪造的票据类型 | TGT（票据授予票据） | Service Ticket（服务票据） |
| 需要的哈希 | KRBTGT 账户哈希 | 目标服务账户哈希 |
| 交互 KDC | 是（TGT 会被 KDC 验证） | 否（完全本地验证） |
| 域控日志 | 有 4769（请求 TGS） | 无任何 Kerberos 事件 |
| 攻击范围 | 整个域的所有 Kerberos 服务 | 仅特定服务（受 SPN 限制） |
| 检测难度 | 中等（可通过 4768-4769 关联检测） | 高（仅在目标系统上有日志） |
| 持续性 | 取决于 KRBTGT 重置周期 | 取决于服务账户密码重置 |
| PAC 验证 | KDC 会验证 PAC | 服务端可能不验证 PAC |

### 7.4 取证特征

**特征一：4624 事件无对应 4769 事件**

正常 Kerberos 认证中，4624（成功登录）之前应有 4769（TGS 请求）。Silver Ticket 不经过 KDC，因此域控上无 4769 事件。但在目标服务主机上可能有 4624 事件。

**特征二：PAC 异常**

Silver Ticket 伪造的 PAC 可能存在异常：

- PAC 中的用户 SID 与 4624 事件中的 SID 不匹配
- PAC 中的组 membership 异常（如普通用户被赋予 Domain Admins 权限）
- PAC 签名使用的密钥与预期不符

**特征三：票据生命周期异常**

Silver Ticket 通常设置极长的有效期。

### 7.5 检测方法

**服务端日志分析**

在目标服务主机上，分析 4624 事件中的 Kerberos 认证记录，检查是否存在异常：

```sql
SELECT TimeCreated, TargetUserName, IpAddress, LogonProcessName, AuthenticationPackageName
FROM SecurityEvent
WHERE EventID = 4624
  AND AuthenticationPackageName = 'Kerberos'
  AND LogonType = 3
  AND TimeCreated > DATEADD(DAY, -1, GETDATE())
  AND IpAddress NOT IN (SELECT IpAddress FROM KnownManagementServers)
ORDER BY TimeCreated DESC
```

**PAC 验证启用**

Windows Server 2012 R2+ 支持 PAC 验证（PAC Validation），服务端会向 KDC 验证 PAC 的有效性。启用此功能可以有效检测 Silver Ticket：

```powershell
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Kdc" -Name "ValidateKDCProxyKerberos" -Value 1
```

---

## 0x08 DCSync 攻击（T1003.006）

### 8.1 攻击原理

DCSync 攻击利用 Active Directory 的多主复制（Multi-master Replication）机制。正常情况下，域控制器之间通过 DRS（Directory Replication Service）协议同步数据。DCSync 攻击模拟域控向目标 DC 发送复制请求，获取任意用户的密码哈希。

```
DCSync 攻击流程：
1. 攻击者获取具有 DS-Replication 权限的账户
   （域管理员、Enterprise Admins、或被赋予该权限的任意账户）
2. 使用 Mimikatz 或 Impacket 模拟域控身份
3. 向目标 DC 发送 DRS GETNCCHANGES 请求
4. 目标 DC 返回请求的用户凭据哈希
5. 攻击者获取 NTLM 哈希、明文密码（如果可逆加密）、Kerberos 密钥等
```

### 8.2 攻击实现

**Mimikatz DCSync**

```powershell
mimikatz # lsadump::dcsync /user:krbtgt /domain:corp.local
mimikatz # lsadump::dcsync /user:CORP\Administrator /domain:corp.local
mimikatz # lsadump::dcsync /user:CORP\krbtgt /domain:corp.local /csv
```

**Impacket secretsdump.py**

```bash
# 使用域管理员凭据
secretsdump.py corp.local/administrator:password@10.0.1.1

# 使用哈希认证
secretsdump.py corp.local/administrator@10.0.1.1 -hashes aad3b...:fc528...

# 仅 DCSync 特定用户
secretsdump.py corp.local/administrator:password@10.0.1.1 -just-dc-user krbtgt
```

### 8.3 攻击权限要求

DCSync 攻击需要以下 AD 权限之一：

| 权限 | GUID | 说明 |
| --- | --- | --- |
| DS-Replication-Get-Changes | {1131f6aa-9c07-11d1-f79f-00c04fc2dcd2} | 允许获取目录更改 |
| DS-Replication-Get-Changes-All | {1131f6ad-9c07-11d1-f79f-00c04fc2dcd2} | 允许获取所有目录更改 |
| DS-Replication-Get-Changes-In-Filtered-Set | {89e95b76-444d-4c62-991a-0facbeda640c} | 允许获取筛选集更改 |

默认情况下，只有以下账户拥有这些权限：

- Domain Admins 组
- Enterprise Admins 组
- 域控制器计算机账户（DC$）
- krbtgt 账户（仅自身的复制权限）

攻击者可以通过修改 ACL 为任意账户添加这些权限。

### 8.4 取证特征

**Event ID 4662（目录服务访问）**

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Security-Auditing" Guid="{54849625-5478-4994-a5ba-3e3b0328c30d}" />
    <EventID>4662</EventID>
    <Version>0</Version>
    <Level>0</Level>
    <Task>12600</Task>
    <Opcode>0</Opcode>
    <Keywords>0x8020000000000000</Keywords>
    <TimeCreated SystemTime="2026-06-25T11:05:12.4567890Z" />
    <Channel>Security</Channel>
    <Computer>DC01.corp.local</Computer>
  </System>
  <EventData>
    <Data Name="SubjectUserSid">S-1-5-21-1234567890-1234567890-1234567890-500</Data>
    <Data Name="SubjectUserName">Administrator</Data>
    <Data Name="SubjectDomainName">CORP</Data>
    <Data Name="SubjectLogonId">0x3e7</Data>
    <Data Name="ObjectName">DC=corp,DC=local</Data>
    <Data Name="ObjectGuid">{1131f6aa-9c07-11d1-f79f-00c04fc2dcd2}</Data>
    <Data Name="Properties">{1131f6aa-9c07-11d1-f79f-00c04fc2dcd2}
{19195a5b-6da0-11d0-afd3-00c04fd930c9}</Data>
    <Data Name="AccessMask">0x100</Data>
    <Data Name="HandleId">0x0</Data>
    <Data Name="ResourceAttributes"></Data>
  </EventData>
</Event>
```

**Event ID 4624（成功登录）— Logon Type 3**

DCSync 通常伴随 Logon Type 3 的 NTLM 或 Kerberos 登录事件：

```xml
<Event>
  <System>
    <EventID>4624</EventID>
    <Channel>Security</Channel>
  </System>
  <EventData>
    <Data Name="LogonType">3</Data>
    <Data Name="TargetUserName">Administrator</Data>
    <Data Name="TargetDomainName">CORP</Data>
    <Data Name="IpAddress">10.0.1.50</Data>
    <Data Name="AuthenticationPackageName">NTLM</Data>
    <Data Name="WorkstationName"></Data>
  </EventData>
</Event>
```

DCSync 关键取证指标：

| 指标 | Event ID | 含义 |
| --- | --- | --- |
| DS-Replication-Get-Changes | 4662 | 访问 GUID {1131f6aa-...} |
| DS-Replication-Get-Changes-All | 4662 | 访问 GUID {1131f6ad-...} |
| 访问 krbtgt 账户 | 4662 | 对象名包含 krbtgt |
| 非 DC 来源 | 4624 | 来源 IP 不是已知 DC |
| 访问 NTDS 服务对象 | 4662 | CN=NTDS,CN=... |

### 8.5 检测方法

**DC 复制监控**

监控所有 DRS 复制请求，标记非 DC 来源：

```sql
SELECT TimeCreated, SubjectUserName, SubjectDomainName, IpAddress,
       ObjectName, Properties, AccessMask
FROM SecurityEvent
WHERE EventID = 4662
  AND (Properties LIKE '%1131f6aa%' OR Properties LIKE '%1131f6ad%')
  AND TimeCreated > DATEADD(DAY, -1, GETDATE())
ORDER BY TimeCreated DESC
```

**非 DC 复制请求告警**

```kql
SecurityEvent
| where EventID == 4662
| where Properties has_any ("1131f6aa-9c07-11d1-f79f-00c04fc2dcd2", "1131f6ad-9c07-11d1-f79f-00c04fc2dcd2")
| where SubjectUserName !endswith "$"
| join kind=leftanti (
    Heartbeat
    | where ComputerType == "Domain Controller"
    | distinct Computer
) on Computer
| project TimeCreated, SubjectUserName, SubjectDomainName, ObjectName, Properties, Computer
| order by TimeCreated desc
```

**krbtgt 访问监控**

任何非 DC 进程访问 krbtgt 账户都应立即告警：

```powershell
Get-WinEvent -FilterHashtable @{
    LogName = 'Security'
    ID = 4662
} -MaxEvents 1000 | Where-Object {
    $_.Properties[5].Value -match 'krbtgt'
} | Select-Object TimeCreated, @{N='Subject';E={$_.Properties[1].Value}},
    @{N='Object';E={$_.Properties[5].Value}}, @{N='GUID';E={$_.Properties[7].Value}}
```

---

## 0x09 凭据攻击链的取证分析方法

### 9.1 事件日志综合分析框架

凭据攻击链的取证分析需要系统性地收集和关联多种事件日志。以下是完整的分析框架：

**日志来源清单**

| 日志来源 | 关键 Event ID | 分析目标 |
| --- | --- | --- |
| DC Security 日志 | 4624, 4625, 4634, 4648, 4672, 4768, 4769, 4776, 4662, 4626 | 认证事件、票据请求、目录服务访问 |
| 目标主机 Security 日志 | 4624, 4625, 4672, 4688 | 本地登录、权限、进程创建 |
| DC PowerShell 日志 | 4103, 4104 | PowerShell 远程执行 |
| Sysmon 日志 | 1, 3, 10, 11 | 进程创建、网络连接、进程访问、原始命令行 |

**分析流程**

```
步骤一：确定攻击时间窗口
  - 从初始入侵事件（如 WebShell、钓鱼邮件）确定起始时间
  - 从响应时间（如应急响应启动）确定终止时间
  - 在时间窗口内收集所有相关日志

步骤二：识别凭据获取事件
  - Event ID 4688 + 进程命令行包含 mimikatz/secretsdump/Invoke-Mimikatz
  - Event ID 4662 + Properties 包含复制 GUID（DCSync）
  - Event ID 4769 + TicketEncryptionType = 0x17 且单用户多 SPN（Kerberoasting）
  - Event ID 4768 + PreAuthType = 0（AS-REP Roasting）

步骤三：追踪凭据复用事件
  - Event ID 4624 + LogonType = 3 + AuthPackageName = NTLM（PtH）
  - Event ID 4624 + AuthPackageName = Kerberos 且无对应 4769（PtT/Silver Ticket）
  - Event ID 4648（显式凭据登录）

步骤四：评估持久化状态
  - 4769 事件无对应 4768（Golden Ticket）
  - krbtgt 账户访问记录（DCSync → Golden Ticket 链路）
  - 服务账户密码变更频率
```

### 9.2 票据生命周期追踪

票据生命周期分析是检测高级 Kerberos 攻击的核心技术。追踪每一张票据从签发到使用的完整链路：

```sql
WITH TicketChain AS (
  SELECT
    tgt.TargetUserName,
    tgt.TimeCreated AS tgt_issued,
    tgt.IpAddress AS tgt_ip,
    tgt.TicketEncryptionType AS tgt_enc_type,
    tgt.TicketLifetime AS tgt_lifetime,
    tgs.TimeCreated AS tgs_used,
    tgs.ServiceName,
    tgs.IpAddress AS tgs_ip,
    tgs.TicketEncryptionType AS tgs_enc_type,
    DATEDIFF(SECOND, tgt.TimeCreated, tgs.TimeCreated) AS seconds_between
  FROM SecurityEvent tgt
  INNER JOIN SecurityEvent tgs
    ON tgt.TargetUserName = tgs.TargetUserName
    AND tgs.EventID = 4769
    AND tgt.EventID = 4768
    AND tgs.TimeCreated BETWEEN tgt.TimeCreated AND DATEADD(HOUR, 10, tgt.TimeCreated)
)
SELECT * FROM TicketChain
WHERE tgt_enc_type != tgs_enc_type
   OR seconds_between > 36000
   OR tgt_lifetime > 36000
ORDER BY tgt_issued DESC
```

### 9.3 登录源 IP 追踪

建立每个用户的正常登录源 IP 基线，检测异常来源：

```sql
WITH NormalBaseline AS (
  SELECT TargetUserName, IpAddress,
         COUNT(*) AS normal_count
  FROM SecurityEvent
  WHERE EventID = 4624
    AND TimeCreated BETWEEN DATEADD(DAY, -30, GETDATE()) AND DATEADD(DAY, -7, GETDATE())
  GROUP BY TargetUserName, IpAddress
),
RecentLogins AS (
  SELECT TargetUserName, IpAddress, TimeCreated, AuthenticationPackageName, LogonType
  FROM SecurityEvent
  WHERE EventID = 4624
    AND TimeCreated > DATEADD(DAY, -7, GETDATE())
)
SELECT r.TargetUserName, r.IpAddress, r.TimeCreated,
       r.AuthenticationPackageName, r.LogonType
FROM RecentLogins r
LEFT JOIN NormalBaseline b
  ON r.TargetUserName = b.TargetUserName AND r.IpAddress = b.IpAddress
WHERE b.normal_count IS NULL
  AND r.IpAddress != '127.0.0.1'
  AND r.IpAddress != '::1'
ORDER BY r.TimeCreated DESC
```

### 9.4 票据加密类型分析

Kerberos 支持多种加密类型，加密类型的选择本身就可以作为攻击检测的信号：

| 加密类型代号 | 算法 | 安全性 | 说明 |
| --- | --- | --- | --- |
| 0x0 | 无加密 | 极弱 | AS-REP Roasting 指标 |
| 0x1 | DES-CBC-CRC | 弱 | 已淘汰 |
| 0x3 | DES-CBC-MD5 | 弱 | 已淘汰 |
| 0x11 | RC4-HMAC | 中 | Kerberoasting/Golden Ticket 默认 |
| 0x12 | AES-128 | 强 | 推荐 |
| 0x13 | AES-256 | 强 | 推荐 |

加密类型降级检测：

```kql
SecurityEvent
| where EventID in (4768, 4769)
| where TicketEncryptionType in ("0x17", "0x11", "0x1")
| summarize WeakCount = count() by TargetUserName, TicketEncryptionType, bin(TimeCreated, 1h)
| where WeakCount > 3
| order by TimeCreated desc
```

### 9.5 时间线关联分析

将不同类型的事件按时间线排列，构建完整的攻击时间线：

```
时间线构建示例：

T+0:00:00  Event 4688  — mimikatz.exe 进程创建（凭据获取起点）
T+0:01:00  Event 4662  — DCSync 复制 krbtgt（KRBTGT 哈希获取）
T+0:02:00  Event 4688  — kerberos::golden 命令执行（Golden Ticket 创建）
T+0:03:00  Event 4769  — TGS 请求 CIFS/DC01（使用伪造 TGT）
           ⚠ 注意：无对应的 Event 4768
T+0:03:01  Event 4624  — Logon Type 3, Kerberos, DC01（横向到域控）
T+0:05:00  Event 4688  — lsass.exe 进程访问（域控凭据获取）
T+0:06:00  Event 4624  — 多台主机出现 Administrator Kerberos 登录
           ⚠ 所有登录无对应 4768（Golden Ticket 持续使用）
```

---

## 0x10 证据强度分层

### 10.1 确认恶意（Confirmation Level）

以下证据足以确认 Kerberos 攻击的存在：

| 攻击类型 | 确认条件 | 证据来源 |
| --- | --- | --- |
| Pass-the-Hash | 4624 LogonType=3 + NTLM + 空 WorkstationName + 已知管理员账户 + 非预期 IP | DC Security 日志 |
| Kerberoasting | 单用户在 5 分钟内请求 ≥10 个不同 SPN 的 TGS + TicketEncryptionType=0x17 | DC Security 日志 |
| AS-REP Roasting | 短时间内多个 PreAuthType=0 的 4768 事件来自同一 IP | DC Security 日志 |
| Golden Ticket | 4769 事件无对应 4768 事件 + 票据生命周期 >10 小时 | DC Security 日志 |
| Silver Ticket | 4624 Kerberos 认证无对应 4769 + PAC 中组 membership 异常 | 目标主机 Security 日志 |
| DCSync | 4662 Properties 包含复制 GUID + 来源非 DC + 访问 krbtgt 或高价值账户 | DC Security 日志 |

### 10.2 高度可疑（High Suspicion Level）

以下证据应当视为高度可疑，需要进一步调查：

| 指标 | 说明 |
| --- | --- |
| RC4 加密降级 | 域环境配置 AES，出现 RC4 加密的 TGT/TGS 请求 |
| 票据生命周期异常 | TGT TicketLifetime > 36000（10 小时） |
| 管理员账户异常登录 | 4624 显示管理员账户从异常 IP 以 LogonType 3 登录 |
| 敏感 AD 对象访问 | 4662 显示对 AdminSDHolder、krbtgt、DC 对象的非预期访问 |
| SPN 异常注册 | 新注册的 SPN 绑定到非预期的服务账户 |
| Kerberos 会话异常 | 4624 + AuthPackageName=Kerberos + WorkstationName 与 IP 不匹配 |

### 10.3 需要关注（Attention Level）

以下证据需要关注但不足以单独判定攻击：

| 指标 | 说明 |
| --- | --- |
| LogonType 3 + NTLM | 正常网络共享访问也产生此事件，需要结合上下文判断 |
| 单用户请求多个 TGS | 正常应用也可能请求多个 SPN，需要看时间分布 |
| 管理员账户从已知管理站登录 | 虽然来源可信，但仍需确认操作的合法性 |
| 预认证禁用账户存在 | 可能是遗留配置，不一定正在被利用 |
| 服务账户密码过期 | 密码策略未覆盖服务账户，需要审计但不一定是攻击 |

---

## 0x11 公开案例中的 Kerberos 攻击

### 案例一：APT29 — Kerberoasting + DCSync

**背景**：APT29（又名 Cozy Bear、The Dukes）是俄罗斯对外情报局（SVR）的网络间谍组织，长期针对政府机构和企业发起高级持续性威胁攻击。

**攻击链路**：

```
初始访问 → 域内凭据获取 → Kerberoasting → 服务账户密码破解
→ 横向移动到关键系统 → DCSync 获取 KRBTGT 哈希
→ Golden Ticket 持久化 → 长期隐蔽访问
```

**取证发现**：

- 调查人员在 DC Security 日志中发现单个用户在 10 分钟内请求了 47 个不同 SPN 的 TGS，全部使用 RC4 加密
- 4769 事件的 TicketOptions 均为 0x40810000（Forwardable + Renewable），表明使用了 Kerberoasting 工具
- 后续发现 4662 事件中存在非 DC 来源的复制请求，访问了 krbtgt 账户
- 最终在 4769 事件中发现无对应 4768 的 TGS 请求，确认 Golden Ticket 的存在

**取证启示**：

- Kerberoasting 是 APT 组织获取服务账户凭据的常用手段
- DCSync + Golden Ticket 组合提供了近乎完美的持久化能力
- 检测 Kerberoasting 的关键是建立 TGS 请求频率基线
- 发现 DCSync 后必须立即检查是否存在 Golden Ticket

### 案例二：Cobalt Strike — Pass-the-Hash 横向移动

**背景**：Cobalt Strike 是红队和攻击者广泛使用的商业渗透测试/攻击框架，其 Beacon 模块内置了 Pass-the-Hash 横向移动功能。

**攻击链路**：

```
初始 WebShell → Cobalt Strike Beacon 部署 → 内存凭据提取
→ PtH 横向移动到域成员主机 → 多跳 PtH → 域控沦陷
```

**取证发现**：

- 在多台主机上发现 4624 事件：LogonType=3 + NTLM + 空 WorkstationName + Administrator 账户
- 所有事件的来源 IP 为 10.0.1.50（被控工作站），但目标账户是域管理员
- 4648 事件显示 cmd.exe 进程作为 4648 的来源进程，命令行包含 `runas /user:Administrator`
- 进一步分析发现父进程为 rundll32.exe，关联到 Cobalt Strike 的 shellcode loader
- 时间线分析显示攻击者在 30 分钟内通过 4 跳横向移动到达域控

**取证启示**：

- PtH 的关键指纹是 NTLM + LogonType 3 + 空 WorkstationName
- 多台主机在短时间内出现相同的管理员账户 LogonType 3 登录是典型的横向移动模式
- 结合进程创建事件可以追溯攻击工具链
- NTLM 认证审计策略可以显著提高 PtH 的检测率

### 案例三：APT10 — Golden Ticket 持久化

**背景**：APT10（又名 Stone Panda、MenuPass）是与中国有关的 APT 组织，长期针对日本、欧洲和北美的企业和政府机构。

**攻击链路**：

```
供应链投毒 → 域内横向移动 → 域控凭据获取
→ KRBTGT 哈希提取 → Golden Ticket 伪造
→ KRBTGT 密码未重置 → Golden Ticket 持续有效超过 6 个月
```

**取证发现**：

- 调查人员在 DC 日志中发现 4769 事件中的用户名 "Administrator" 没有对应的 4768 事件
- 进一步分析发现所有 Golden Ticket 事件的 TicketEncryptionType 为 0x17（RC4），而域环境配置为 AES-256
- 票据中的 PAC 显示该 "Administrator" 属于 Domain Admins 组，但 AD 中该用户的组 membership 不包含 Domain Admins
- KRBTGT 账户的 Last Password Change 时间在攻击发生前 3 年，从未被重置

**取证启示**：

- Golden Ticket 的检测核心是 4768-4769 事件关联分析
- 加密类型降级是 Golden Ticket 的强信号
- PAC 内容与 AD 记录的交叉验证可以发现伪造的授权信息
- 定期重置 KRBTGT 密码（至少每 180 天一次）是防御 Golden Ticket 的关键措施

---

## 0x12 Kerberos 攻击检测自动化与狩猎

### 12.1 PowerShell 检测脚本

**Kerberos 攻击综合检测脚本**

```powershell
function Invoke-KerberosAttackHunt {
    param(
        [string]$DomainController = $env:LOGONSERVER.TrimStart('\'),
        [int]$HoursBack = 24
    )

    $StartTime = (Get-Date).AddHours(-$HoursBack)

    Write-Host "[*] Kerberos Attack Hunting on $DomainController" -ForegroundColor Cyan

    $PtHEvents = Get-WinEvent -ComputerName $DomainController -FilterHashtable @{
        LogName = 'Security'; ID = 4624
    } -MaxEvents 5000 | Where-Object {
        $_.TimeCreated -gt $StartTime -and
        $_.Properties[8].Value -eq 3 -and
        $_.Properties[10].Value -eq 'NTLM' -and
        $_.Properties[19].Value -eq ''
    } | Select-Object TimeCreated, @{N='TargetUser';E={$_.Properties[5].Value}},
        @{N='IpAddress';E={$_.Properties[18].Value}}

    if ($PtHEvents) {
        Write-Host "`n[!] Pass-the-Hash suspects:" -ForegroundColor Red
        $PtHEvents | Format-Table -AutoSize
    }

    $KerberoastEvents = Get-WinEvent -ComputerName $DomainController -FilterHashtable @{
        LogName = 'Security'; ID = 4769
    } -MaxEvents 10000 | Where-Object {
        $_.TimeCreated -gt $StartTime -and
        $_.Properties[8].Value -eq '0x17'
    } | Group-Object { "$($_.Properties[0].Value)_$(($_.TimeCreated - $StartTime).TotalMinutes)" } |
        Where-Object { $_.Count -ge 5 }

    if ($KerberoastEvents) {
        Write-Host "`n[!] Kerberoasting suspects:" -ForegroundColor Red
        $KerberoastEvents | ForEach-Object {
            [PSCustomObject]@{
                User = $_.Group[0].Properties[0].Value
                SPNCount = $_.Count
                TimeWindow = "$([math]::Round($_.Group[-1].TimeCreated.Subtract($_.Group[0].TimeCreated).TotalMinutes, 1)) min"
            }
        } | Format-Table -AutoSize
    }

    $GoldenTicketEvents = Get-WinEvent -ComputerName $DomainController -FilterHashtable @{
        LogName = 'Security'; ID = 4769
    } -MaxEvents 10000 | Where-Object {
        $_.TimeCreated -gt $StartTime
    }

    $TGTEvents = Get-WinEvent -ComputerName $DomainController -FilterHashtable @{
        LogName = 'Security'; ID = 4768
    } -MaxEvents 10000 | Where-Object {
        $_.TimeCreated -gt $StartTime
    }

    $GoldenSuspects = $GoldenTicketEvents | Where-Object {
        $userName = $_.Properties[0].Value
        $tgsTime = $_.TimeCreated
        -not ($TGTEvents | Where-Object {
            $_.Properties[0].Value -eq $userName -and
            $_.TimeCreated -gt $tgsTime.AddHours(-10) -and
            $_.TimeCreated -lt $tgsTime
        })
    } | Select-Object TimeCreated, @{N='User';E={$_.Properties[0].Value}},
        @{N='Service';E={$_.Properties[2].Value}}, @{N='EncType';E={$_.Properties[7].Value}}

    if ($GoldenSuspects) {
        Write-Host "`n[!] Golden Ticket suspects (no matching TGT):" -ForegroundColor Red
        $GoldenSuspects | Format-Table -AutoSize
    }

    $DCSyncEvents = Get-WinEvent -ComputerName $DomainController -FilterHashtable @{
        LogName = 'Security'; ID = 4662
    } -MaxEvents 5000 | Where-Object {
        $_.TimeCreated -gt $StartTime -and
        ($_.Properties[7].Value -match '1131f6aa' -or $_.Properties[7].Value -match '1131f6ad')
    }

    if ($DCSyncEvents) {
        Write-Host "`n[!] DCSync suspects:" -ForegroundColor Red
        $DCSyncEvents | Select-Object TimeCreated, @{N='Subject';E={$_.Properties[1].Value}},
            @{N='Object';E={$_.Properties[5].Value}} | Format-Table -AutoSize
    }
}

Invoke-KerberosAttackHunt -HoursBack 48
```

### 12.2 事件日志狩猎查询

**KQL 查询 — 批量 Kerberoasting 检测**

```kql
SecurityEvent
| where EventID == 4769
| where TimeCreated > ago(24h)
| where TicketEncryptionType == "0x17"
| extend UserSPNKey = strcat(TargetUserName, "_", ServiceName)
| summarize
    SPNCount = dcount(ServiceName),
    TicketCount = count(),
    FirstRequest = min(TimeCreated),
    LastRequest = max(TimeCreated),
    SourceIPs = make_set(IpAddress)
    by TargetUserName, bin(TimeCreated, 10m)
| where SPNCount >= 5
| extend DurationMinutes = datetime_diff('minute', LastRequest, FirstRequest)
| project TimeCreated, TargetUserName, SPNCount, TicketCount,
    DurationMinutes, SourceIPs, FirstRequest, LastRequest
| order by SPNCount desc
```

**KQL 查询 — Golden Ticket 检测**

```kql
let TGS_Requests = SecurityEvent
| where EventID == 4769
| where TimeCreated > ago(24h)
| extend TGS_Time = TimeCreated, TGS_User = TargetUserName,
    TGS_Service = ServiceName, TGS_EncType = TicketEncryptionType,
    TGS_IP = IpAddress;
let TGT_Requests = SecurityEvent
| where EventID == 4768
| where TimeCreated > ago(25h)
| extend TGT_Time = TimeCreated, TGT_User = TargetUserName;
TGS_Requests
| join kind=leftanti TGT_Requests
    on $left.TGS_User == $right.TGT_User
    and $right.TGT_Time between ($left.TGS_Time - 10h) .. $left.TGS_Time
| where TGS_User !endswith "$"
| project TGS_Time, TGS_User, TGS_Service, TGS_EncType, TGS_IP
| order by TGS_Time desc
```

**SQL 查询 — DCSync 检测**

```sql
SELECT
  e.TimeCreated,
  e.SubjectUserName,
  e.SubjectDomainName,
  e.ObjectName,
  e.Properties,
  e.IpAddress
FROM SecurityEvent e
WHERE e.EventID = 4662
  AND (e.Properties LIKE '%1131f6aa-9c07-11d1-f79f-00c04fc2dcd2%'
    OR e.Properties LIKE '%1131f6ad-9c07-11d1-f79f-00c04fc2dcd2%')
  AND e.TimeCreated > DATEADD(DAY, -1, GETDATE())
  AND e.SubjectUserName NOT LIKE '%$'
  AND e.IpAddress NOT IN (
    SELECT IPAddress FROM DomainControllerIPs
  )
ORDER BY e.TimeCreated DESC
```

### 12.3 Sigma 检测规则

**规则一：Kerberoasting 检测**

```yaml
title: Kerberoasting Activity Detection
id: d3f4e5a6-b7c8-9d0e-f1a2-b3c4d5e6f7a8
status: stable
description: Detects potential Kerberoasting activity based on multiple TGS requests with RC4 encryption from a single user within a short time window
references:
  - https://attack.mitre.org/techniques/T1558/003/
author: Security Analyst
date: 2026/06/25
tags:
  - attack.credential_access
  - attack.t1558.003
logsource:
  product: windows
  service: security
detection:
  selection_rc4:
    EventID: 4769
    TicketEncryptionType: '0x17'
  filter_legitimate:
    SubjectUserName|endswith: '$'
  condition: selection_rc4 and not filter_legitimate
  timeframe: 5m
  count(ServiceName) by TargetUserName > 4
level: high
falsepositives:
  - Legacy applications using RC4
  - Service accounts with specific compatibility requirements
```

**规则二：AS-REP Roasting 检测**

```yaml
title: AS-REP Roasting Activity Detection
id: e4f5a6b7-c8d9-0e1f-a2b3-c4d5e6f7a8b9
status: stable
description: Detects potential AS-REP Roasting based on Kerberos TGT requests without pre-authentication
references:
  - https://attack.mitre.org/techniques/T1558/004/
author: Security Analyst
date: 2026/06/25
tags:
  - attack.credential_access
  - attack.t1558.004
logsource:
  product: windows
  service: security
detection:
  selection:
    EventID: 4768
    TicketEncryptionType: '0x0'
    Status: '0x0'
  filter_computer:
    TargetUserName|endswith: '$'
  condition: selection and not filter_computer
level: medium
falsepositives:
  - Accounts configured to not require pre-authentication for legacy compatibility
```

**规则三：Golden Ticket 检测**

```yaml
title: Golden Ticket Suspicious Activity
id: f5a6b7c8-d9e0-1f2a-b3c4-d5e6f7a8b9c0
status: stable
description: Detects potential Golden Ticket usage by identifying TGS requests without corresponding TGT requests
references:
  - https://attack.mitre.org/techniques/T1558/001/
author: Security Analyst
date: 2026/06/25
tags:
  - attack.credential_access
  - attack.t1558.001
logsource:
  product: windows
  service: security
detection:
  selection_tgs:
    EventID: 4769
  filter_computer:
    TargetUserName|endswith: '$'
  selection_long_lifetime:
    EventID: 4768
    TicketLifetime|gt: '36000'
  filter_computer_gt:
    TargetUserName|endswith: '$'
  condition: (selection_tgs and not filter_computer) or (selection_long_lifetime and not filter_computer_gt)
level: critical
falsepositives:
  - Extremely rare in legitimate environments
  - May occur during Kerberos realm trusts configuration
```

**规则四：DCSync 攻击检测**

```yaml
title: DCSync Attack Detection
id: a6b7c8d9-e0f1-2a3b-c4d5-e6f7a8b9c0d1
status: stable
description: Detects potential DCSync attack by monitoring directory replication requests from non-DC sources
references:
  - https://attack.mitre.org/techniques/T1003/006/
author: Security Analyst
date: 2026/06/25
tags:
  - attack.credential_access
  - attack.t1003.006
logsource:
  product: windows
  service: security
detection:
  selection_replication_get:
    EventID: 4662
    Properties|contains:
      - '1131f6aa-9c07-11d1-f79f-00c04fc2dcd2'
      - '1131f6ad-9c07-11d1-f79f-00c04fc2dcd2'
  filter_dc_accounts:
    SubjectUserName|endswith: '$'
  condition: selection_replication_get and not filter_dc_accounts
level: critical
falsepositives:
  - Legitimate administrative tools performing directory replication
  - Backup solutions that require replication permissions
```

**规则五：Silver Ticket 检测**

```yaml
title: Silver Ticket Suspicious Activity
id: b7c8d9e0-f1a2-3b4c-d5e6-f7a8b9c0d1e2
status: stable
description: Detects potential Silver Ticket usage by identifying Kerberos logon events without corresponding TGS requests on the DC
references:
  - https://attack.mitre.org/techniques/T1558/002/
author: Security Analyst
date: 2026/06/25
tags:
  - attack.credential_access
  - attack.t1558.002
logsource:
  product: windows
  service: security
detection:
  selection_logon:
    EventID: 4624
    LogonType: 3
    AuthenticationPackageName: 'Kerberos'
  selection_no_tgs:
    EventID: 4769
  filter:
    TargetUserName|endswith: '$'
  condition: selection_logon and not filter
  timeframe: 5m
  count(EventID) by TargetUserName < 1
level: high
falsepositives:
  - Cached Kerberos tickets from previous TGS requests
  - Inter-realm trust authentication
```

**规则六：RC4 加密降级检测**

```yaml
title: Kerberos RC4 Encryption Downgrade
id: c8d9e0f1-a2b3-4c5d-e6f7-a8b9c0d1e2f3
status: stable
description: Detects use of RC4 encryption in Kerberos authentication which may indicate an attack attempting to downgrade encryption
references:
  - https://attack.mitre.org/techniques/T1558/
author: Security Analyst
date: 2026/06/25
tags:
  - attack.credential_access
  - attack.t1558
logsource:
  product: windows
  service: security
detection:
  selection_tgs:
    EventID: 4769
    TicketEncryptionType: '0x17'
  selection_tgt:
    EventID: 4768
    TicketEncryptionType: '0x17'
  filter:
    TargetUserName|endswith: '$'
  condition: (selection_tgs or selection_tgt) and not filter
level: medium
falsepositives:
  - Legacy service accounts requiring RC4
  - Cross-domain trust authentication with legacy domains
```

---

## 0x13 参考资料

1. Sean Metcalf (ADSecurity.org): [Detecting Forged Kerberos Ticket (Golden Ticket & Silver Ticket) Use in Active Directory](https://adsecurity.org/?p=1515)
2. Sean Metcalf: [Detecting Kerberoasting Activity](https://adsecurity.org/?p=3458)
3. MITRE ATT&CK: [T1550 — Use Alternate Authentication Material](https://attack.mitre.org/techniques/T1550/)
4. MITRE ATT&CK: [T1558 — Steal or Forge Kerberos Tickets](https://attack.mitre.org/techniques/T1558/)
5. MITRE ATT&CK: [T1003.006 — DCSync](https://attack.mitre.org/techniques/T1003/006/)
6. HackTricks: [Kerberos Attacks](https://book.hacktricks.xyz/windows-hardening/active-directory-methodology/kerberos-attacks)
7. Rapid7: [Kerberoasting Without Mimikatz](https://www.rapid7.com/blog/post/2016/08/26/kerberoasting-without-mimikatz/)
8. SpecterOps: [Kerberoasting Revisited](https://posts.specterops.io/kerberoasting-revisited-d434351bd4d1)
9. Microsoft: [Mitigating Kerberos Golden Ticket and Other Attacks](https://docs.microsoft.com/en-us/windows/security/threat-protection/active-directory/mitigating-kerberos-golden-ticket-and-other-attacks)
10. CyberArk: [Kerberos Attacks - Golden Ticket, Silver Ticket, and More](https://www.cyberark.com/resources/blog/kerberos-attacks)
11. Trimarc Security: [Detecting Kerberoasting with Windows Event Auditing](https://trimarcsecurity.com/post/2018/05/06/trimarc-research-detecting-kerberoasting-activity-with-windows-event-auditing)
12. 3001: [Detection of Kerberos-based Attacks Using Event Log Analysis](https://www.3001.cz/wp-content/uploads/2020/09/Detection-of-Kerberos-based-Attacks.pdf)
