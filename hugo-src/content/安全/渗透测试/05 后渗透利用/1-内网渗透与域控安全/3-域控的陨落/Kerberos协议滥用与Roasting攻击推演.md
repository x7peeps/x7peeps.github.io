---
title: "域控的陨落：Active Directory认证协议滥用(Kerberoasting/AS-REP)"
date: 2026-06-11T15:00:00+08:00
draft: false
weight: 3
---

# 域控的陨落：Active Directory认证协议滥用(Kerberoasting/AS-REP)

在大型企业网络中，**Active Directory（活动目录，简称 AD 域）** 是整个内网的心脏。它掌管着所有用户、计算机和服务的信任关系。拿下了域控（Domain Controller, DC），就等于拿到了整个企业的“玉玺”。

而 AD 域的核心认证机制，是古老且复杂的 **Kerberos 协议**。
Kerberos 的设计初衷是为了在不安全的网络中证明身份，但它为了性能而做出的一些妥协（如离线加密票据），恰恰成为了攻击者滥用的绝佳攻击面。

本文将剥开 Kerberos 协议的三头犬外衣，推演在不需要域管权限的情况下，如何仅仅凭借一个普通的域内普通用户账号，对域控发起致命的 **Kerberoasting** 和 **AS-REP Roasting** 攻击。

---

## 1. Kerberos 协议极简推演：三头犬的运作逻辑

要理解协议滥用，必须先搞懂正常流程。Kerberos 认证主要分为三个阶段（六个数据包）：

1.  **AS 阶段 (Authentication Service)**：证明“我是我”。
    *   `AS-REQ`：客户端用自己的密码 Hash 加密一个时间戳，发送给域控（KDC）。
    *   `AS-REP`：KDC 解密成功，证明用户身份合法，返回一张 **TGT（黄金入场券）**，TGT 是用 `krbtgt` 账号的 Hash 加密的。
2.  **TGS 阶段 (Ticket Granting Service)**：申请访问某个服务的门票。
    *   `TGS-REQ`：客户端拿着 TGT，向 KDC 申请访问某个特定服务（如 SQL Server，即 SPN）的票据。
    *   `TGS-REP`：KDC 验证 TGT 无误后，生成一张 **ST（服务票据，Silver Ticket）** 返回给客户端。**注意：这张 ST 是用该目标服务账号的 Hash 加密的。**
3.  **AP 阶段 (Application Request)**：访问服务。
    *   `AP-REQ`：客户端拿着 ST，直接去访问目标服务器。目标服务器用自己的 Hash 解密 ST，验证通过则放行。

---

## 2. Kerberoasting 攻击：合法地“白嫖”加密票据

**Kerberoasting** 是目前内网渗透中最经典、最容易得手的高级攻击手法。它发生在上述的 **TGS 阶段**。

### 2.1 攻击逻辑推演
在 AD 域中，服务（如 MSSQL、Exchange）通常绑定在一个域账号上运行，这个绑定关系被称为 **SPN（Service Principal Name）**。

回顾 TGS 阶段的漏洞点：
KDC 在返回 `TGS-REP` 时，给客户端的 ST（服务票据）是**用运行该服务的账号的 NTLM Hash 加密的**。
而且，**KDC 从来不验证客户端是否有权限访问该服务**，只要客户端有合法的 TGT（任何一个普通域用户都有），KDC 就会毫无保留地把这张加密的 ST 扔给客户端。

**攻击者的剧本：**
1.  **侦察**：攻击者利用普通的域用户账号，查询域内所有注册了 SPN 的高价值服务账号（通常这些账号权限很高，甚至属于 Domain Admins 组）。
2.  **索取票据**：攻击者向 KDC 发送 `TGS-REQ`，申请访问这些 SPN 的服务票据（ST）。
3.  **离线爆破**：拿到 ST 后，攻击者**不去访问服务**，而是将 ST 导出到本地。因为 ST 是用服务账号的密码 Hash 加密的，攻击者可以使用 Hashcat 或 John the Ripper 等工具，在自己性能强劲的显卡阵列上进行离线字典爆破。

### 2.2 实战命令解析
```powershell
# 1. 使用 Rubeus 或 PowerShell 脚本查询 SPN 并申请 TGS 票据
# 这里的票据会以特定的 Hashcat 格式（如 $krb5tgs$23$*）导出
Invoke-Kerberoast -OutputFormat Hashcat

# 2. 将导出的 hashes.txt 放到攻击者的物理机上，使用 Hashcat 离线爆破
hashcat -m 13100 -a 0 hashes.txt password_dict.txt
```
**致命威胁**：由于爆破是在攻击者的机器上离线进行的，受害者内网中不会产生任何“密码错误”或“账号锁定”的日志，极度隐蔽。

---

## 3. AS-REP Roasting 攻击：利用错误配置的降维打击

**AS-REP Roasting** 发生在 Kerberos 认证的第一步：**AS 阶段**。

### 3.1 攻击逻辑推演
正常情况下，客户端在发送 `AS-REQ` 时，必须带上用自己密码 Hash 加密的时间戳（这叫预认证，Pre-Authentication）。KDC 验证通过后，才会返回 `AS-REP`。

然而，在 Active Directory 的账号属性中，有一个极其危险的选项：**“Do not require Kerberos preauthentication”（不需要 Kerberos 预身份验证）**。
如果管理员为了兼容某些老旧应用，或者错误地勾选了这个选项，灾难就降临了。

**攻击者的剧本：**
1.  **侦察**：攻击者查询域内所有勾选了“不需要预认证”属性的用户。
2.  **空手套白狼**：攻击者不需要这些用户的密码，直接向 KDC 发送一个伪造的、没有时间戳的 `AS-REQ` 请求，声称自己就是这些用户。
3.  **离线爆破**：因为不需要预认证，KDC 会直接返回 `AS-REP` 数据包。这个包里面包含了一段**使用该用户密码 Hash 加密的数据**。攻击者将其导出，再次进行离线字典爆破，直接还原出该用户的明文密码。

### 3.2 实战命令解析
```bash
# 使用 Impacket 脚本寻找无需预认证的用户并导出 AS-REP Hash
GetNPUsers.py -dc-ip 192.168.1.10 target.local/ -usersfile users.txt -format hashcat -outputfile hashes.txt

# 使用 Hashcat 离线爆破 (模块 18200)
hashcat -m 18200 -a 0 hashes.txt password_dict.txt
```

---

## 4. 防御与监控策略

Kerberoasting 和 AS-REP Roasting 的本质是**利用了密码学中的弱密码风险（容易被字典爆破）和协议设计的机制**。

1.  **高强度密码策略（治本）**：
    无论是服务账号（SPN）还是普通用户账号，只要密码长度超过 25 位且足够复杂，攻击者即使拿到了加密票据，算到宇宙毁灭也无法离线爆破出明文。这是防御此类攻击最核心的手段。
2.  **定期清理与审计配置**：
    *   严格排查 AD 中哪些账号勾选了 `DONT_REQ_PREAUTH`（不需要预认证），除非绝对必要，否则一律取消。
    *   严格限制哪些账号可以注册 SPN。
3.  **监控与蜜罐（Honeytoken）**：
    *   监控 Event ID 4769（请求 Kerberos 服务票据）。如果一个普通用户在短时间内向大量不同的 SPN 疯狂请求票据，极大可能正在进行 Kerberoasting。
    *   设置“蜜罐账号”：创建一个虚假的、权限极低但名字很诱人（如 `svc_sql_admin`）的账号并注册 SPN。一旦监控到有任何人请求这个 SPN 的票据，立刻触发最高级别安全告警。

理解了 Kerberos 协议的滥用机制，你就能在复杂的 AD 域中，精准地找到那些隐藏在合法流量背后的致命破绽。
