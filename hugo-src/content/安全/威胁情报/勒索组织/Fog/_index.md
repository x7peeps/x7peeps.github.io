---
title: "Fog"
weight: 20
---

**报告编号**: TIR-2026-0701-020 | **分类等级**: TLP:AMBER | **发布日期**: 2026年7月1日 | **情报来源**: 多源交叉验证（OSINT + Arctic Wolf + Trend Micro + Cyble + Picus Security + Darktrace + BlackFog + SecurityWeek）

---

## 一、执行摘要

**Fog** 是2024年5月首次出现的新型勒索软件即服务（RaaS）组织，以其**多阶段感染链**、**APT 级间谍工具**和**非典型的政治宣传内容**著称。该组织早期主要 targeting 美国高等教育机构，随后快速扩展至金融、制造、科技、医疗等多个关键行业。

<!--more-->

截至2025年3月，Fog 在 TOR 泄露站点上已声称超过 **100 名受害者**，其中仅2025年2月就高达53名受害者。Trend Micro 自2024年6月以来已检测到 **173 次**与该组织相关的勒索软件活动。该组织最显著的非典型特征是攻击链中嵌入了大量**政治内容**（DOGE 关联主题），以及部署合法员工监控软件 **Syteca** 进行屏幕录制和键盘记录。2025年3月后，该组织公开活动趋于沉寂，可能已解散或品牌重塑。

### 关键发现

| 维度 | 关键指标 |
|------|----------|
| **组织规模** | 100+ 受害者（173次检测活动） |
| **首要目标** | 美国（高等教育为主），后扩展至金融/制造/科技 |
| **加密方式** | AES + RSA 混合加密 |
| **文件扩展名** | `.FOG` / `.Fog` / `.FLOCKED` |
| **勒索信** | `readme.txt` / `RANSOMNOTE.txt`（DOGE 主题） |
| **支付方式** | Monero（门罗币）匿名支付 |
| **技术创新** | Syteca 屏幕录制、GC2/Adaptix C2、DOGE 政治宣传 |
| **被利用漏洞** | CVE-2024-40766（SonicWall）、CVE-2024-40711（Veeam，CVSS 9.8）、CVE-2020-1472（Zerologon） |
| **解密可能性** | **不存在**（无公开解密工具） |
| **当前状态** | **疑似沉寂**（2025.03后公开活动趋于沉寂） |

### 威胁等级评估

| 评估维度 | 等级 | 说明 |
|----------|------|------|
| **技术能力** | 🔴 极高 | APT 级间谍工具、BYOVD、多 C2 框架、政治宣传 |
| **运营成熟度** | 🔴 高 | RaaS 生态、多工具链、反沙箱检测 |
| **攻击规模** | 🟠 高 | 100+ 受害者，173次检测 |
| **目标针对性** | 🟠 高 | 教育→金融→制造多行业扩展 |
| **数据泄露风险** | 🔴 极高 | 双重勒索 + Syteca 屏幕录制 + Mega 云存储外传 |

---

## 二、威胁行为者画像

### 2.1 组织标识

| 属性 | 值 |
|------|-----|
| **官方名称** | Fog |
| **组织类型** | RaaS |
| **活跃周期** | 2024年5月 – 2025.03（疑似沉寂） |
| **地理归属** | 未确认 |
| **攻击目标** | 美国为主，后扩展全球 |
| **动机** | 经济利益 + 政治宣传（非典型） |

### 2.2 非典型特征

Fog 最显著的非典型特征是攻击链中嵌入了大量**政治内容**：

- `stage1.ps1` 脚本中包含政治评论文字
- 脚本执行时自动打开政治主题 YouTube 视频
- 2025年3-4月 `RANSOMNOTE.txt` 大量引用美国"政府效率部"（DOGE）内容
- 勒索信要求受害者"列出上周工作完成的五项要点"（模仿 DOGE 邮件）
- 提供"免费解密"选项，条件是受害者将恶意软件传播给他人

---

## 三、归因分析

### 3.1 地理归属

| 证据类型 | 详情 | 置信度 |
|----------|------|--------|
| **目标选择** | 早期主要 targeting 美国高等教育 | 中 |
| **政治内容** | DOGE 关联主题暗示对美国政治的关注 | 低-中 |
| **工具链** | 多开源工具组合，无明确地理归属 | 低 |

---

## 四、技术能力评估

### 4.1 加密方案

| 属性 | 值 |
|------|-----|
| **对称加密** | AES |
| **非对称加密** | RSA |
| **文件扩展名** | `.FOG` / `.Fog` / `.FLOCKED` |
| **勒索信** | `readme.txt` / `RANSOMNOTE.txt` |
| **支付方式** | Monero（门罗币）QR 码支付 |

### 4.2 C2 工具矩阵

| 工具 | 功能 | 类型 |
|------|------|------|
| **GC2** | Google Sheets/SharePoint C2 | 开源后渗透 |
| **Adaptix C2** | 类 Cobalt Strike 信标 | 开源对抗仿真 |
| **Stowaway** | 多跳代理隧道 | 开源代理 |
| **Sliver C2** | 开源 C2 框架 | 开源 C2 |
| **AnyDesk** | 合法远程桌面 | 合法工具滥用 |
| **Syteca** | 员工监控（屏幕录制/键盘记录） | 合法监控软件 |

---

## 五、攻击链分析

### 5.1 初始访问

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **钓鱼邮件** | T1566 | `Pay Adjustment.zip` 含恶意 LNK 文件 |
| **漏洞利用** | T1190 | CVE-2024-40766（SonicWall）、CVE-2024-40711（Veeam 9.8）、CVE-2020-1472（Zerologon 10.0） |
| **IAB 购买** | T1078 | VPN 凭证购买 |

### 5.2 执行与权限提升

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **PowerShell** | T1059.001 | 多阶段脚本（`-WindowStyle Hidden`） |
| **BYOVD** | T1068 | ktool.exe + iQVW64.sys（Intel 驱动漏洞） |
| **硬编码密钥** | — | `fd6c57fa3852aec8` 触发提权 |

### 5.3 凭证窃取与横向移动

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **Pass-the-Hash** | T1550.002 | 横向移动 |
| **BloodHound** | T1087 | AD 枚举 |
| **PsExec/SMBExec** | T1021 | 远程执行 |
| **Kerberos 滥用** | T1558 | noPac/Pachine 攻击 |

### 5.4 间谍活动与数据窃取

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **Syteca 屏幕录制** | T1113 | 合法监控软件录制所有屏幕/键盘 |
| **7-zip 压缩** | T1560 | 敏感目录压缩 |
| **FreeFileSync/MegaSync** | T1567 | 数据传输至 Mega 云存储 |
| **lootsubmit.ps1** | T1082 | 自动收集系统信息回传 |
| **trackerjacker.ps1** | T1016 | Wigle Wi-Fi API 物理位置查询 |

### 5.5 防御规避与影响

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **反沙箱检测** | T1497 | CPU 计数/内存大小/MAC 前缀/注册表标记/时序检查 |
| **隐藏窗口** | T1059 | `-WindowStyle Hidden -NoProfile` |
| **伪装服务** | T1543 | `SecurityHealthIron` 伪装安全服务 |
| **进程看门狗** | T1543 | 监控 GC2 进程，被终止则自动重启 |
| **删除卷影副本** | T1490 | `vssadmin delete shadows` |
| **数据加密** | T1486 | AES + RSA 混合加密 |

---

## 六、受害者分析

### 6.1 规模与地理分布

| 指标 | 值 |
|------|-----|
| **确认受害者** | 100+（泄露站） |
| **检测活动** | 173次（Trend Micro） |
| **首要国家** | 美国 |
| **峰值月份** | 2025年2月（53名受害者） |

### 6.2 行业分布

| 行业 | 优先级 | 说明 |
|------|--------|------|
| **高等教育** | 🔴 极高 | 早期主要目标（约70%） |
| **金融** | 🔴 高 | 2024年末开始 targeting |
| **科技** | 🟠 高 | |
| **制造** | 🟠 高 | |
| **交通** | 🟡 中 | |
| **医疗** | 🟡 中 | |

---

## 七、RaaS 生态分析

### 7.1 工具库

| 工具类别 | 具体工具 |
|---------|---------|
| **C2 框架** | Sliver C2、GC2、Adaptix C2 |
| **凭证窃取** | DonPAPI、Impacket（DPAPI） |
| **AD 攻击** | Certipy、Zer0dump、Kerberos 脚本 |
| **VPN 攻击** | SonicWall VPN 凭据扫描器 |
| **远程访问** | AnyDesk 安装器 |
| **网络工具** | Powercat、Proxychains |
| **监控软件** | Syteca（Ekran） |
| **数据同步** | FreeFileSync、MegaSync |

---

## 八、IOC 完整列表

### 8.1 网络指标

| 类型 | 值 | 说明 |
|------|-----|------|
| **扩展名** | `.FOG` / `.Fog` / `.FLOCKED` | 加密文件扩展名 |
| **文件** | `readme.txt` / `RANSOMNOTE.txt` | 勒索信 |
| **文件** | `dbgLog.sys` | 日志文件 |
| **文件** | `Pay Adjustment.zip` | 钓鱼压缩文件 |
| **文件** | `iQVW64.sys` | BYOVD 漏洞驱动 |
| **密钥** | `fd6c57fa3852aec8` | 硬编码提权密钥 |
| **服务名** | `SecurityHealthIron` | 伪装持久化服务 |
| **C2** | `hilarious-trifle-d9182e.netlify.app` | 载荷分发 |
| **TOR** | `xql562evsy7njcsngacphc2erzjfecwotdkobn3m4uxu2gtqh26newid.onion` | 泄露站 |

### 8.2 文件哈希

| 文件名 | SHA-256 |
|--------|---------|
| lootsubmit.ps1 | `44b7eebf7a26d466f9c7ad4ddb058503f7066aded180ab6d5162197c47780293` |
| trackerjacker.ps1 | `3d2cbef9be0c48c61a18f0e1dc78501ddabfd7a7663b21c4fcc9c39d48708e91` |
| ktool.exe | `100cbf5578cfd03950c8606c6131a85635a8278696d3d64ecb629fa09af449e9` |

### 8.3 被利用漏洞

| CVE | 影响组件 | CVSS | 说明 |
|-----|----------|------|------|
| CVE-2024-40766 | SonicWall SSL-VPN | — | 访问控制漏洞 |
| CVE-2024-40711 | Veeam Backup & Replication | 9.8 | 严重 RCE |
| CVE-2020-1472 | Windows Netlogon | 10.0 | Zerologon |
| CVE-2021-42278 | Kerberos | — | SAM 名称滥用 |
| CVE-2021-42287 | Kerberos | — | PAC 验证滥用 |
| CVE-2015-2291 | Intel Ethernet 驱动 | — | BYOVD 提权 |

### 8.4 攻击工具链

```
钓鱼（Pay Adjustment.zip → LNK → PowerShell）/ 漏洞利用（SonicWall/Veeam）/ IAB
    ↓
stage1.ps1（隐藏窗口下载执行）
    ↓
ktool.exe + iQVW64.sys（BYOVD 提权至 SYSTEM）
    ↓
GC2 / Adaptix / Sliver C2（多框架持久化）
    ↓
Syteca 屏幕录制 + BloodHound AD 枚举
    ↓
Pass-the-Hash / PsExec / SMBExec（横向移动）
    ↓
DonPAPI / Impacket / Certipy（凭证窃取）
    ↓
7-zip 压缩 → FreeFileSync/MegaSync → Mega 云存储外传
    ↓
lootsubmit.ps1 / trackerjacker.ps1（系统信息回传）
    ↓
vssadmin 删除卷影副本
    ↓
Fog 载荷（AES + RSA 加密 → .FOG/.FLOCKED + Monero 支付）
```

---

## 九、检测规则

### 9.1 Sigma 规则

#### 规则 1：Fog BYOVD 提权

```yaml
title: Fog Ransomware - BYOVD Privilege Escalation via iQVW64
id: fog001-byovd
status: experimental
description: 检测 Fog 使用 ktool.exe + iQVW64.sys 进行 BYOVD 提权
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|endswith: '\ktool.exe'
  condition: selection
level: critical
tags:
  - attack.privilege_escalation
  - attack.t1068
```

#### 规则 2：Fog 伪装持久化服务

```yaml
title: Fog Ransomware - Fake Security Service Creation
id: fog002-fake-service
status: experimental
description: 检测 Fog 创建伪装为安全服务的持久化服务
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    CommandLine|contains|all:
      - 'sc create'
      - 'SecurityHealthIron'
  condition: selection
level: critical
tags:
  - attack.persistence
  - attack.t1543
```

#### 规则 3：Fog 钓鱼 PowerShell 执行

```yaml
title: Fog Ransomware - Phishing PowerShell Download Cradle
id: fog003-phishing-ps
status: experimental
description: 检测 Fog 钓鱼邮件触发的 PowerShell 下载执行行为
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    CommandLine|contains|all:
      - 'powershell'
      - 'WindowStyle Hidden'
      - 'NoProfile'
      - 'netlify.app'
      - 'IEX'
  condition: selection
level: critical
tags:
  - attack.execution
  - attack.t1059.001
```

### 9.2 YARA 规则

```yara
rule Fog_Ransomware {
    meta:
        description = "检测 Fog 勒索软件载荷"
        author = "Threat Intelligence Team"
        date = "2026-07-01"
        reference = "Fog ransomware with DOGE political content"
    strings:
        $s1 = ".FOG" ascii
        $s2 = ".FLOCKED" ascii
        $s3 = "readme.txt" ascii
        $s4 = "RANSOMNOTE.txt" ascii
        $s5 = "SecurityHealthIron" ascii
        $s6 = "ktool.exe" ascii
        $s7 = "iQVW64.sys" ascii
        $hex1 = { 48 89 5C 24 08 48 89 6C 24 10 48 89 74 24 18 }
    condition:
        3 of ($s*) and $hex1
}
```

---

## 十、风险评估矩阵

| 风险维度 | 评分 | 说明 |
|----------|------|------|
| **加密强度** | 7/10 | AES + RSA 混合，标准强度 |
| **传播能力** | 7/10 | RaaS 模式，多工具链 |
| **规避能力** | 9/10 | BYOVD + 反沙箱 + 伪装服务 + 进程看门狗 |
| **数据泄露威胁** | 10/10 | Syteca 屏幕录制 + 多重外传渠道 |
| **间谍能力** | 9/10 | APT 级工具（Syteca/GC2/Adaptix） |
| **政治动机** | 7/10 | DOGE 关联内容，非典型混合动机 |
| **综合风险** | **🟠 高**（可能沉寂） | APT 级间谍工具 + 政治宣传 + 100+受害者 |

---

## 十一、缓解建议

### 11.1 即时行动

1. **SonicWall 修补**：修复 CVE-2024-40766
2. **Veeam 修补**：修复 CVE-2024-40711（CVSS 9.8）
3. **BYOVD 防护**：阻止 `iQVW64.sys` 加载
4. **监控 Netlify 域名**：检测 `netlify.app` 异常 PowerShell 下载

### 11.2 短期加固

1. **强制 MFA**：所有 VPN/远程访问
2. **监控 Syteca**：检测合法监控软件异常安装
3. **PowerShell 日志**：启用脚本块日志（Event ID 4104）

### 11.3 长期策略

1. **零信任架构**
2. **身份威胁检测**：Pass-the-Hash/Kerberos 滥用检测
3. **漏洞驱动管理**：已知漏洞驱动清单和阻止

### 11.4 解密恢复路径

| 维度 | 详情 |
|------|------|
| **解密器状态** | **无公开解密工具** |
| **加密强度** | AES + RSA，标准强度 |
| **建议** | 优先从备份恢复；联系执法部门 |

---

## 十二、核心建议

1. **APT 级间谍工具**：Fog 部署 Syteca 屏幕录制表明攻击者不仅勒索还进行情报收集，防御需同时考虑间谍和勒索双重威胁
2. **政治宣传非典型**：DOGE 关联内容使 Fog 区别于纯经济动机组织，可能暗示混合动机或仿冒
3. **BYOVD 持续威胁**：ktool.exe + iQVW64.sys 组合获取 SYSTEM 权限，组织需实施驱动白名单
4. **多 C2 框架**：同时使用 GC2/Adaptix/Sliver/Stowaway 四个 C2 框架，增加检测难度
5. **沉寂≠消亡**：2025.03后沉寂可能为品牌重塑，工具集和战术可能被继任实体沿用

---

## 十三、附录

### 附录 A：信息来源

| 编号 | 来源 | 日期 |
|------|------|------|
| [1] | Arctic Wolf: Fog Ransomware Discovery | 2024.05 |
| [2] | Trend Micro: Fog Ransomware Detection | 2024-2025 |
| [3] | Cyble: Fog RaaS Ecosystem | 2025 |
| [4] | Picus Security: Fog Analysis | 2025 |
| [5] | Darktrace: Fog Attack Chain | 2025 |
| [6] | BlackFog: Fog DOGE Connection | 2025 |
| [7] | SecurityWeek: Fog Financial Targeting | 2025 |

### 附录 B：术语表

| 术语 | 定义 |
|------|------|
| **Syteca** | 合法员工监控软件（前身为 Ekran），被 Fog 滥用于屏幕录制 |
| **GC2** | 利用 Google Sheets/SharePoint 作为 C2 通道的开源工具 |
| **BYOVD** | 自带易受攻击驱动程序获取内核权限 |
| **DOGE** | 美国"政府效率部"，Fog 勒索信中引用的政治主题 |
| **Monero** | 匿名加密货币，Fog 使用 QR 码引导支付 |

### 附录 C：追踪计划

| 维度 | 说明 |
|------|------|
| **组织状态** | 疑似沉寂（2025.03后） |
| **品牌重塑** | 关注 Fog 以新名称重新出现 |
| **工具扩散** | 监控 Fog 工具集被其他组织采用 |
| **政治动机** | 关注混合动机勒索组织趋势 |
| **解密工具** | 关注是否有公开解密工具发布 |
