---
title: "BianLian"
weight: 16
---

**报告编号**: TIR-2026-0624-016 | **分类等级**: TLP:AMBER | **发布日期**: 2026年6月24日 | **情报来源**: 多源交叉验证（OSINT + CISA/FBI/ACSC AA23-136A + Unit 42 / Palo Alto Networks + Picus Security + Arctic Wolf + AttackIQ + Huntress + GuidePoint Security）

---

## 一、执行摘要

**BianLian**（"变脸"拼音）是2022年6月崛起的勒索软件与数据勒索组织，很可能总部位于**俄罗斯**，拥有多名俄罗斯关联附属成员。该组织最显著的特征是其**从双重勒索向纯数据外泄勒索的战略转型**——2023年1月主要转向数据窃取勒索，2024年1月完全放弃加密，成为"不加密、只窃取"模式的代表性组织。

<!--more-->

截至2025年3月，BianLian 在暗网泄露站点上已声称超过 **553 个受害者**，主要分布在美国（155+）、加拿大（14+）、印度（12+）、澳大利亚（6+）和英国（4+）。2024年，BianLian 以 **169 次泄露站发布**位列 Rapid7 统计的年度 Top 10 勒索组织第10位。该组织重点攻击**医疗保健、制造业、商业服务、金融及交通运输**等关键行业。2025年4月，BianLian 被确认利用 **SAP NetWeaver 零日漏洞**（CVE-2025-31324，CVSS 10.0）进行攻击。

### 关键发现

| 维度 | 关键指标 |
|------|----------|
| **组织规模** | 553+ 受害者（泄露站公布） |
| **首要目标** | 美国（155+），加拿大（14+），印度（12+），澳大利亚（6+） |
| **加密方式** | AES-256-CBC + RSA-2048（2024年1月前使用）；2024年1月后**完全放弃加密** |
| **首要入口** | 被盗 RDP 凭证、ProxyShell（CVE-2021-34473/34523/31207）、SAP 零日（CVE-2025-31324） |
| **商业模式** | 独立运营（非 RaaS），俄罗斯关联附属成员 |
| **关联组织** | Makop（共享工具链） |
| **CISA 通告** | AA23-136A（2023.05 发布，2024.11 更新） |
| **勒索方式** | 纯数据外泄勒索 + 打印机勒索信 + 威胁电话 + USPS 实体勒索信 |
| **解密可能性** | **部分存在**（Avast 2023年发布免费解密工具，覆盖2024年前加密文件） |
| **当前状态** | **活跃**（2025-2026年持续攻击） |

### 威胁等级评估

| 评估维度 | 等级 | 说明 |
|----------|------|------|
| **技术能力** | 🟠 高 | Go 语言编写、零日漏洞利用（SAP CVE-2025-31324）、Ngrok/Rsocks 反向代理 |
| **运营成熟度** | 🔴 极高 | 三阶段运营模式演化、纯数据勒索创新、实体勒索信 |
| **攻击规模** | 🔴 极高 | 553+ 受害者，2024年 Top 10 勒索组织 |
| **目标针对性** | 🔴 极高 | 医疗保健重点目标（2024年前3最活跃医疗勒索组织） |
| **数据泄露风险** | 🔴 极高 | 纯数据外泄模式，FTP/Rclone/Mega 多渠道外传 |

---

## 二、威胁行为者画像

### 2.1 组织标识

| 属性 | 值 |
|------|-----|
| **官方名称** | BianLian |
| **别名** | "变脸"（拼音直译） |
| **组织类型** | 独立运营（非 RaaS），俄罗斯关联附属成员 |
| **活跃周期** | 2022年6月 – 至今 |
| **主要语言** | 英语（勒索信/谈判）、俄语（内部通信） |
| **地理归属** | 俄罗斯（高置信度）；CIS 目标排除 |
| **攻击目标** | 全球（美国为主要目标） |
| **动机** | 经济利益 |

### 2.2 运营模式三阶段演化

```
2022.06    BianLian 首次出现
           Go 语言编写，AES-256 + RSA-2048 混合加密
           .bianlian 扩展名
    ↓
2022.06 – 2023.01  【第一阶段：双重勒索】
           加密系统 + 数据外泄威胁
           攻击美国关键基础设施
    ↓
2023.01 – 2024.01  【第二阶段：主要转向数据外泄】
           Avast 发布免费解密工具后
           加密能力被削弱，转向数据窃取为主
    ↓
2024.01 – 至今     【第三阶段：纯数据外泄勒索】
           完全放弃加密
           仅通过窃取并威胁公开数据进行勒索
           打印机勒索信 + 威胁电话 + USPS 实体信
    ↓
2024.11    CISA/FBI/ACSC 更新联合通告 AA23-136A
    ↓
2025.02    USPS 实体勒索信活动（美国医疗高管）
           多数收信组织未遭实际入侵——恐吓诈骗
    ↓
2025.04    利用 SAP CVE-2025-31324 零日漏洞
```

---

## 三、归因分析

### 3.1 地理归属

| 证据类型 | 详情 | 置信度 |
|----------|------|--------|
| **语言分析** | 选择外语名称"变脸"以混淆归因 | 高 |
| **组织位置** | 很可能基于俄罗斯，俄罗斯关联附属成员 | 高 |
| **CISA/FBI 评估** | AA23-136A 明确归因于俄罗斯 | 高 |
| **排除规则** | 不攻击 CIS 国家 | 中-高 |

### 3.2 关联组织

```
┌──────────────────────────────────────────────────────┐
│           BianLian 关联组织网络                        │
├──────────────────────────────────────────────────────┤
│                                                        │
│  ┌─────────────────┐                                  │
│  │ BianLian 核心    │ 俄罗斯关联                       │
│  │（独立运营）       │ 数据勒索 + 加密（2024年前）      │
│  └────────┬────────┘                                  │
│           │                                            │
│           └──→ Makop 勒索组织                          │
│                共享 .NET 工具（文件枚举/数据外泄）      │
│                TTPs 高度相似                            │
│                可能存在合作关系或共用开发者              │
│                                                        │
└──────────────────────────────────────────────────────┘
```

---

## 四、技术能力评估

### 4.1 加密方案（2024年1月前）

| 属性 | 值 |
|------|-----|
| **编程语言** | Go |
| **对称加密** | AES-256-CBC |
| **非对称加密** | RSA-2048 |
| **文件扩展名** | `.bianlian` |
| **勒索信** | `Look at this instruction.txt` |

### 4.2 纯数据勒索模式（2024年1月后）

```
┌──────────────────────────────────────────────────────┐
│        BianLian 纯数据外泄勒索模型                     │
├──────────────────────────────────────────────────────┤
│                                                        │
│  第一阶段：数据窃取                                    │
│  ├── FTP / Rclone / Mega 多渠道外传                   │
│  ├── system.exe 枚举注册表/文件/剪贴板                │
│  └── PowerShell 压缩/加密数据                         │
│                                                        │
│  第二阶段：多重施压                                    │
│  ├── 暗网泄露站公开数据                               │
│  ├── 网络打印机打印勒索信                              │
│  ├── 威胁电话拨打受害者高管                            │
│  └── USPS 实体勒索信（2025年2月起）                    │
│                                                        │
│  关键区别：                                            │
│  ├── 不加密任何文件                                    │
│  ├── 传统加密检测完全失效                              │
│  ├── 防御重点转向数据外泄检测                          │
│  └── 赎金范围：$150K - $500K（比特币支付）             │
│                                                        │
└──────────────────────────────────────────────────────┘
```

---

## 五、攻击链分析

### 5.1 初始访问

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **被盗 RDP 凭证** | T1078 / T1133 | 通过 IAB 获取有效凭证 |
| **ProxyShell** | T1190 | CVE-2021-34473/34523/31207 攻击 Exchange |
| **SAP 零日** | T1190 | CVE-2025-31324（NetWeaver，CVSS 10.0） |
| **钓鱼攻击** | T1566 | 鱼叉式钓鱼获取凭证 |
| **Infostealer 凭证** | T1588 | 信息窃取恶意软件窃取的 VPN/RDP 凭证 |

### 5.2 执行与持久化

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **自定义 Go 后门** | T1587.001 | 为每个受害者定制编写 |
| **PowerShell** | T1059.001 | 禁用 AMSI、发现任务、数据压缩 |
| **计划任务** | T1053.005 | 维持持久化访问 |
| **RMM 工具** | T1219 | TeamViewer/AnyDesk/Atera/Splashtop |
| **Web Shell** | T1505.003 | 部署于 Exchange 服务器 |
| **后门账户** | T1136 | 域管理员 + Azure AD 后门账户 |

### 5.3 权限提升

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **CVE-2022-37969** | T1068 | Windows 10/11 权限提升 |
| **CVE-2020-1472** | T1068 | Netlogon Zerologon 域控攻击 |

### 5.4 凭证窃取

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **LSASS 转储** | T1003.001 | Mimikatz 凭证提取 |
| **NTDS.dit** | T1003.003 | Active Directory 数据库提取 |
| **SAM 提取** | T1003.002 | 安全账户管理器凭证 |
| **SessionGopher** | T1552.004 | 远程访问工具会话信息提取 |
| **Impacket** | T1003 | secretsdump.py 远程凭证提取 |

### 5.5 横向移动

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **RDP** | T1021.001 | 远程桌面横向移动 |
| **SMB** | T1021.002 | Type 3 网络登录 SMB 连接 |
| **PsExec** | T1570 | 远程执行 |

### 5.6 数据外传

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **FTP** | T1048 | 文件传输协议外传 |
| **Rclone** | T1537 | 云存储数据外传 |
| **Mega** | T1567.002 | Mega 云存储外传 |

### 5.7 防御规避

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **Ngrok/Rsocks** | T1090/T1090.002 | 反向代理隐藏 C2 |
| **UPX 加壳** | T1027.002 | 二进制文件混淆 |
| **伪装命名** | T1036.004 | 重命名为合法 Windows 服务/安全产品 |
| **AMSI 禁用** | T1562.001 | PowerShell 禁用反恶意软件扫描 |

---

## 六、受害者分析

### 6.1 规模与地理分布

| 指标 | 值 |
|------|-----|
| **确认受害者** | 553+（泄露站公布） |
| **首要国家** | 美国（155+） |
| **其他目标** | 加拿大（14+）、印度（12+）、澳大利亚（6+）、英国（4+） |

### 6.2 行业分布

| 行业 | 优先级 | 说明 |
|------|--------|------|
| **医疗保健** | 🔴 极高 | 2024年前3最活跃医疗勒索组织（仅次于 LockBit/RansomHub） |
| **制造业** | 🔴 高 | 制造企业 |
| **商业服务** | 🔴 高 | 专业服务、物业管理 |
| **金融服务** | 🟠 高 | 金融机构 |
| **交通运输** | 🟠 高 | 运输/物流公司 |

### 6.3 重大攻击事件

| 时间 | 受害者 | 影响 |
|------|--------|------|
| 2023.01 | 加州医院 | 1.7TB 数据泄露（患者/员工个人信息） |
| 2024.09 | Boston Children's Health Physicians | 纽约儿科网络，患者记录/HR/财务数据泄露 |
| 2025.02 | 美国医疗高管（USPS 实体信） | 恐吓诈骗，多数收信组织未遭实际入侵 |
| 2025.04 | SAP 系统（全球） | CVE-2025-31324 零日漏洞利用 |

---

## 七、运营模式分析

### 7.1 勒索经济

| 指标 | 值 |
|------|-----|
| **赎金范围** | $150K - $500K（USPS 实体信） |
| **支付方式** | 比特币 |
| **谈判渠道** | Tor 泄露站 + 电子邮件（onionmail.org） |
| **施压手段** | 数据泄露 + 打印机勒索信 + 威胁电话 + USPS 实体信 |

### 7.2 战略转型分析

BianLian 从加密型勒索向纯数据勒索的转型是网络犯罪领域的重要趋势：

| 维度 | 加密型勒索（2022-2023） | 纯数据勒索（2024-至今） |
|------|----------------------|----------------------|
| **加密** | AES-256 + RSA-2048 | 不加密 |
| **检测难度** | 中（加密行为可检测） | 高（类似正常数据外泄） |
| **防御重点** | 端点防护 + 备份恢复 | 数据外泄检测 + DLP |
| **恢复难度** | 低（有解密工具） | 高（数据已泄露无法撤回） |
| **收入模式** | 加密恢复 + 数据泄露 | 纯数据泄露威胁 |

---

## 八、IOC 完整列表

### 8.1 文件特征

| 类型 | 值 | 说明 |
|------|-----|------|
| **路径** | `C:\ProgramData\<8位随机>\encryptor.exe` | 加密工具 |
| **路径** | `C:\ProgramData\<8位随机>\system.exe` | 数据收集工具 |
| **路径** | `C:\ProgramData\<8位随机>\sliver.bat` | 凭证转储脚本 |
| **路径** | `C:\ProgramData\rclone\*` | Rclone 外传工具 |
| **路径** | `C:\temp\*` / `C:\temp2\*` | 数据暂存目录 |
| **文件** | `Look at this instruction.txt` | 勒索信 |
| **扩展名** | `.bianlian` | 加密文件扩展名（2024年前） |

### 8.2 网络指标

| 类型 | 值 | 说明 |
|------|-----|------|
| **IP** | `88.212.241.105:993` | C2 服务器 |
| **IP** | `91.245.255.27:8443` | C2 服务器 |
| **IP** | `162.33.179.99:1433` | C2 服务器 |
| **IP** | `151.236.16.144:64250` | C2 服务器 |
| **IP** | `172.96.137.108:80` | C2 服务器 |
| **IP** | `31.220.80.82:8081` | C2 服务器 |
| **IP** | `5.255.106.12:3389` | C2 服务器 |
| **IP** | `85.235.151.5:8080` | C2 服务器 |
| **邮箱** | `deepmind@onionmail.org` | 联系邮箱 |
| **邮箱** | `swikipedia@onionmail.org` | 联系邮箱 |

### 8.3 被利用漏洞

| CVE | 影响组件 | CVSS | 说明 |
|-----|----------|------|------|
| CVE-2021-34473 | Microsoft Exchange | 9.8 | ProxyShell 初始访问 |
| CVE-2021-34523 | Microsoft Exchange | 9.8 | ProxyShell 初始访问 |
| CVE-2021-31207 | Microsoft Exchange | 9.8 | ProxyShell 初始访问 |
| CVE-2020-1472 | Windows Netlogon | 10.0 | Zerologon 域控攻击 |
| CVE-2022-37969 | Windows 10/11 | 7.8 | 权限提升 |
| CVE-2025-31324 | SAP NetWeaver | 10.0 | 零日 RCE |

### 8.4 攻击工具链

```
被盗 RDP 凭证 / ProxyShell / SAP 零日 / 钓鱼
    ↓
自定义 Go 后门（受害者定制）
    ↓
RMM 工具（TeamViewer/AnyDesk/Atera）+ Web Shell
    ↓
LSASS 转储 / NTDS.dit / SessionGopher / Impacket（凭证窃取）
    ↓
CVE-2022-37969 / Zerologon（权限提升）
    ↓
Advanced IP Scanner / SoftPerfect / PingCastle（网络发现）
    ↓
RDP / SMB / PsExec（横向移动）
    ↓
FTP / Rclone / Mega（数据外传）
    ↓
纯数据勒索：泄露站 + 打印机 + 威胁电话 + USPS 实体信
```

---

## 九、检测规则

### 9.1 Sigma 规则

#### 规则 1：BianLian 可疑文件路径

```yaml
title: BianLian - Suspicious File Creation in ProgramData
id: a1b2c3d4-e5f6-7890-abcd-bianlian001
status: experimental
description: 检测 BianLian 勒索软件在 ProgramData 目录创建可疑文件的行为
logsource:
  category: file_event
  product: windows
detection:
  selection:
    TargetFilename|contains:
      - '\ProgramData\'
    TargetFilename|endswith:
      - '\encryptor.exe'
      - '\system.exe'
      - '\sliver.bat'
  condition: selection
level: critical
tags:
  - attack.execution
  - attack.t1059
```

#### 规则 2：BianLian 反向代理工具

```yaml
title: BianLian - Ngrok/Rsocks Reverse Proxy Usage
id: a1b2c3d4-e5f6-7890-abcd-bianlian002
status: experimental
description: 检测 BianLian 使用 Ngrok 或修改版 Rsocks 反向代理工具
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|endswith:
      - '\ngrok.exe'
      - '\rsocks.exe'
  condition: selection
level: high
tags:
  - attack.command_and_control
  - attack.t1090
```

#### 规则 3：BianLian LSASS 凭证转储

```yaml
title: BianLian - LSASS Memory Access
id: a1b2c3d4-e5f6-7890-abcd-bianlian003
status: experimental
description: 检测 BianLian 从 LSASS 进程内存提取凭证的行为
logsource:
  category: process_access
  product: windows
detection:
  selection:
    TargetImage|endswith: '\lsass.exe'
    GrantedAccess|contains:
      - '0x1010'
      - '0x1410'
      - '0x1438'
  condition: selection
level: critical
tags:
  - attack.credential_access
  - attack.t1003.001
```

### 9.2 YARA 规则

```yara
rule BianLian_Ransomware {
    meta:
        description = "检测 BianLian 勒索软件载荷"
        author = "Threat Intelligence Team"
        date = "2026-06-24"
        reference = "CISA/FBI/ACSC AA23-136A"
    strings:
        $s1 = ".bianlian" ascii
        $s2 = "Look at this instruction.txt" ascii
        $s3 = "encryptor.exe" ascii
        $s4 = "system.exe" ascii
        $s5 = "sliver.bat" ascii
        $s6 = "BianLian" ascii
        $hex1 = { 48 89 5C 24 08 48 89 6C 24 10 48 89 74 24 18 }
    condition:
        3 of ($s*) and $hex1
}
```

---

## 十、风险评估矩阵

| 风险维度 | 评分 | 说明 |
|----------|------|------|
| **加密强度** | 6/10 | AES-256 + RSA-2048（2024年前），已有解密工具 |
| **传播能力** | 7/10 | 独立运营 + 俄罗斯附属网络 |
| **规避能力** | 8/10 | 纯数据勒索模式、Ngrok/Rsocks、UPX 加壳 |
| **数据泄露威胁** | 10/10 | 纯数据外泄模式，多渠道施压 |
| **漏洞利用能力** | 9/10 | SAP 零日（CVE-2025-31324）、ProxyShell、Zerologon |
| **基础设施韧性** | 7/10 | 分布式附属网络，多泄露站轮换 |
| **综合风险** | **🔴 极高** | 纯数据勒索 + 零日漏洞 + 医疗重点目标 |

---

## 十一、缓解建议

### 11.1 即时行动

1. **检查 IOC**：对照第八节 IOC 列表扫描环境
2. **RDP 安全**：严格限制 RDP 使用，强制 MFA
3. **Exchange 修补**：修复 ProxyShell 漏洞（CVE-2021-34473/34523/31207）
4. **SAP 修补**：修复 CVE-2025-31324（SAP NetWeaver）

### 11.2 短期加固

1. **数据外泄检测**：部署 DLP 解决方案，监控 FTP/Rclone/Mega 外传行为
2. **RMM 审计**：审计 TeamViewer/AnyDesk/Atera 等远程管理工具
3. **PowerShell 限制**：限制使用并启用脚本块日志记录
4. **凭证保护**：监控 LSASS 访问，部署 Credential Guard

### 11.3 长期策略

1. **零信任架构**：实施基于身份的微分段
2. **网络分段**：限制 SMB 横向移动路径
3. **威胁狩猎**：基于本报告 IOCs 和 TTPs 进行主动狩猎
4. **数据分类**：实施敏感数据分类和加密存储

### 11.4 解密恢复路径

| 维度 | 详情 |
|------|------|
| **解密器状态** | **部分存在**（Avast 2023年发布免费解密工具，覆盖2024年前加密文件） |
| **2024年后** | 纯数据勒索模式，无加密行为，无需解密 |
| **数据泄露** | 已泄露数据无法撤回，需关注身份保护和信用监控 |
| **建议** | 2024年前加密文件可使用 Avast 解密工具恢复；2024年后重点关注数据泄露影响评估 |

---

## 十二、核心建议

1. **纯数据勒索防御**：BianLian 完全放弃加密的模式使传统端点防护失效，防御重点必须转向数据外泄检测（DLP）和网络流量监控
2. **零日漏洞威胁**：SAP CVE-2025-31324（CVSS 10.0）的利用证明 BianLian 具备零日武器化能力，关键应用需建立快速补丁响应机制
3. **RDP 是首要入口**：被盗 RDP 凭证是 BianLian 最常见的初始访问方式，MFA 和凭证轮换是首要防御措施
4. **医疗行业优先防护**：BianLian 是2024年针对医疗行业第3活跃的勒索组织，医疗机构需优先加固
5. **实体勒索信识别**：USPS 实体勒索信可能是恐吓诈骗（多数收信组织未遭实际入侵），需验证后再响应

---

## 十三、附录

### 附录 A：信息来源

| 编号 | 来源 | 日期 |
|------|------|------|
| [1] | CISA/FBI/ACSC: AA23-136A - BianLian Ransomware Group | 2023.05 / 2024.11 更新 |
| [2] | Unit 42: Threat Assessment - BianLian | 2024.01 |
| [3] | Picus Security: BianLian's Shape-Shifting Tactics | 2024.12 |
| [4] | Arctic Wolf: BianLian Physical Mail Extortion | 2025.03 |
| [5] | Onapsis: CVE-2025-31324 SAP Zero-Day | 2025.04 |
| [6] | AttackIQ: Updated Response to AA23-136A | 2025.01 |
| [7] | Huntress: BianLian Threat Actor Profile | 2024 |
| [8] | GuidePoint Security: BianLian Healthcare Targeting | 2024 |
| [9] | Rapid7: 2024 Ransomware Landscape | 2025.01 |
| [10] | RansomLook: BianLian Group Intelligence | 持续更新 |

### 附录 B：术语表

| 术语 | 定义 |
|------|------|
| **纯数据勒索** | 不加密文件，仅通过窃取并威胁公开数据进行勒索 |
| **ProxyShell** | Microsoft Exchange 漏洞利用链（CVE-2021-34473/34523/31207） |
| **Zerologon** | CVE-2020-1472，Windows Netlogon 权限提升漏洞 |
| **SessionGopher** | 提取远程访问工具保存会话信息的工具 |
| **Ngrok** | 合法反向代理工具，被 BianLian 滥用于 C2 隐藏 |
| **Rsocks** | SOCKS5 代理工具，被修改后用于网络隧道 |

### 附录 C：追踪计划

| 维度 | 说明 |
|------|------|
| **组织状态** | 活跃（2026年持续攻击） |
| **纯数据模式** | 监控更多组织效仿 BianLian 放弃加密的趋势 |
| **零日漏洞** | 关注 BianLian 对新 CVE 的武器化能力 |
| **医疗威胁** | 持续监控 BianLian 对医疗行业的攻击 |
| **USPS 诈骗** | 跟踪实体勒索信活动的演变 |
| **解密工具** | 关注 Avast 解密工具的覆盖范围更新 |
