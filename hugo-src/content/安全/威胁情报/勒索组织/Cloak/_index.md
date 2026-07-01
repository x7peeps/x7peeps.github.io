---
title: "Cloak"
weight: 21
---

**报告编号**: TIR-2026-0701-021 | **分类等级**: TLP:AMBER | **发布日期**: 2026年7月1日 | **情报来源**: 多源交叉验证（OSINT + Halcyon Q2-2025 + Ransom.live + RansomLook + Trend Micro + CrowdStrike + Zscaler + Picus Security）

---

## 一、执行摘要

**Cloak** 是2024年中期崛起的新型勒索软件组织，以其**凭证驱动的初始访问策略**和**极高的赎金支付率**著称。该组织主要通过 **Russian Market 等地下市场**购买信息窃取器（Lumma/Aurora/Redline）收集的合法凭证入侵目标网络，而非依赖传统漏洞利用或钓鱼攻击。

<!--more-->

截至2026年初，Cloak 已攻击 **30个国家、162+个受害者**，赎金支付率高达 **91%–96%**，表明其谈判与施压策略极为有效。2025年，该组织攻击目标已从欧洲中小企业**扩展至政府机构和关键基础设施**。Cloak 采用**双重勒索**模式（数据加密 + 数据泄露威胁），使用 **AES + RSA** 混合加密方案。

### 关键发现

| 维度 | 关键指标 |
|------|----------|
| **组织规模** | 162+ 受害者，30个国家 |
| **首要目标** | 欧洲中小企业 → 政府机构/关键基础设施（2025年扩展） |
| **加密方式** | AES + RSA 混合加密 |
| **首要入口** | 凭证购买（Russian Market + 信息窃取器日志） |
| **商业模式** | 双重勒索（加密 + 数据泄露威胁） |
| **赎金支付率** | 91%–96%（极高） |
| **解密可能性** | **不存在**（无公开解密工具） |
| **当前状态** | **活跃**（Contender Q2-2025） |

### 威胁等级评估

| 评估维度 | 等级 | 说明 |
|----------|------|------|
| **技术能力** | 🟠 高 | AES+RSA 混合加密、凭证驱动攻击 |
| **运营成熟度** | 🔴 极高 | 91-96%支付率表明谈判策略极为有效 |
| **攻击规模** | 🟠 高 | 162+受害者，30个国家 |
| **目标针对性** | 🔴 极高 | 从中小企业扩展至政府/关键基础设施 |
| **数据泄露风险** | 🔴 极高 | 双重勒索模式 |

---

## 二、威胁行为者画像

### 2.1 组织标识

| 属性 | 值 |
|------|-----|
| **官方名称** | Cloak |
| **组织类型** | 独立运营（非 RaaS） |
| **活跃周期** | 2024年中 – 至今 |
| **地理归属** | 未确认（俄语地区推断） |
| **攻击目标** | 全球（欧洲为主，后扩展） |
| **动机** | 经济利益 |

### 2.2 核心攻击策略

```
┌──────────────────────────────────────────────────────┐
│           Cloak 凭证驱动攻击模型                       │
├──────────────────────────────────────────────────────┤
│                                                        │
│  传统勒索组织：                                        │
│  漏洞利用 / 钓鱼邮件 → 初始访问                        │
│                                                        │
│  Cloak 模式：                                          │
│  信息窃取器（Lumma/Aurora/Redline）                    │
│         ↓                                              │
│  Russian Market 等地下市场购买合法凭证                 │
│         ↓                                              │
│  直接使用合法凭证登录目标网络                           │
│         ↓                                              │
│  绕过传统终端防护（无恶意文件执行）                     │
│                                                        │
│  优势：                                                │
│  ├── 无恶意文件，端点检测失效                          │
│  ├── 合法凭证，行为类似正常用户                        │
│  ├── 无需漏洞利用，降低攻击复杂度                      │
│  └── 高成功率，高支付率                                │
│                                                        │
└──────────────────────────────────────────────────────┘
```

---

## 三、归因分析

### 3.1 地理归属

| 证据类型 | 详情 | 置信度 |
|----------|------|--------|
| **地下市场** | Russian Market 等俄语地下市场购买凭证 | 中-高 |
| **目标选择** | 早期主要 targeting 欧洲 | 中 |
| **工具链** | 信息窃取器生态（Lumma/Aurora/Redline） | 中 |

---

## 四、技术能力评估

### 4.1 加密方案

| 属性 | 值 |
|------|-----|
| **对称加密** | AES |
| **非对称加密** | RSA |
| **加密模式** | AES + RSA 混合加密 |
| **文件扩展名** | 自定义扩展名 |
| **勒索信** | 自定义勒索信 |

---

## 五、攻击链分析

### 5.1 初始访问

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **凭证购买** | T1588.001 | Russian Market 等地下市场购买信息窃取器日志 |
| **合法凭证** | T1078 | 直接使用合法凭证登录（VPN/RDP/邮件） |
| **信息窃取器** | T1588 | Lumma/Aurora/Redline 窃取的凭证 |

### 5.2 执行与持久化

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **合法登录** | T1078 | 无恶意文件执行，直接使用合法凭证 |
| **计划任务** | T1053 | 持久化 |
| **注册表启动键** | T1547.001 | 持久化 |

### 5.3 凭证窃取

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **Mimikatz** | T1003.001 | LSASS 凭证提取（横向移动） |
| **凭证转储** | T1003 | 注册表/SAM 转储 |

### 5.4 横向移动

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **RDP** | T1021.001 | 远程桌面 |
| **SMB** | T1021.002 | Windows 管理共享 |
| **PsExec** | T1570 | 远程执行 |

### 5.5 数据外传

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **Rclone** | T1567.002 | 云存储外传 |
| **Mega** | T1567.002 | Mega 云存储 |

### 5.6 防御规避与影响

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **合法凭证** | T1078 | 无恶意文件，绕过端点检测 |
| **删除卷影副本** | T1490 | 阻止恢复 |
| **数据加密** | T1486 | AES + RSA 混合加密 |
| **数据泄露威胁** | T1486 | 双重勒索施压 |

---

## 六、受害者分析

### 6.1 规模与地理分布

| 指标 | 值 |
|------|-----|
| **确认受害者** | 162+ |
| **覆盖国家** | 30个 |
| **首要地区** | 欧洲（早期） → 全球（2025年扩展） |

### 6.2 行业分布

| 行业 | 优先级 | 说明 |
|------|--------|------|
| **政府机构** | 🔴 极高 | 2025年扩展目标 |
| **关键基础设施** | 🔴 极高 | 2025年扩展目标 |
| **中小企业** | 🟠 高 | 早期主要目标（欧洲） |
| **制造业** | 🟠 高 | |
| **金融服务** | 🟡 中 | |

---

## 七、运营模式分析

### 7.1 赎金经济

| 指标 | 值 |
|------|-----|
| **赎金支付率** | 91%–96%（极高） |
| **支付方式** | 加密货币 |
| **谈判策略** | 高效施压，高支付率表明谈判团队专业 |

### 7.2 高支付率分析

Cloak 的 91-96% 支付率远高于行业平均水平，原因可能包括：

1. **精准目标选择**：选择支付能力强的组织
2. **高效施压策略**：数据泄露威胁 + 谈判技巧
3. **凭证驱动攻击**：深入网络，掌握更多敏感数据
4. **专业谈判团队**：经验丰富的谈判人员

---

## 八、IOC 完整列表

### 8.1 网络指标

| 类型 | 值 | 说明 |
|------|-----|------|
| **工具** | Lumma Stealer | 信息窃取器 |
| **工具** | Aurora Stealer | 信息窃取器 |
| **工具** | Redline Stealer | 信息窃取器 |
| **工具** | Mimikatz | 凭证窃取 |
| **工具** | Rclone / Mega | 数据外传 |
| **市场** | Russian Market | 凭证交易市场 |

### 8.2 攻击工具链

```
Lumma/Aurora/Redline 信息窃取器
    ↓
Russian Market 等地下市场出售合法凭证
    ↓
Cloak 购买凭证
    ↓
直接使用合法凭证登录目标网络（VPN/RDP/邮件）
    ↓
无恶意文件执行，绕过端点检测
    ↓
Mimikatz 凭证转储（横向移动）
    ↓
RDP / SMB / PsExec（横向移动）
    ↓
Rclone / Mega（数据外传）
    ↓
Cloak 载荷（AES + RSA 混合加密 + 数据泄露威胁）
```

---

## 九、检测规则

### 9.1 Sigma 规则

#### 规则 1：Cloak 异常登录检测

```yaml
title: Cloak - Anomalous Login from Purchased Credentials
id: cl001-anomalous-login
status: experimental
description: 检测来自信息窃取器泄露凭证的异常登录行为
logsource:
  category: authentication
  product: windows
detection:
  selection:
    EventID: 4624
    LogonType: 10  # RDP
    AuthenticationPackageName: NTLM
  filter:
    IpAddress|startswith:
      - '10.'
      - '172.16.'
      - '192.168.'
  condition: selection and not filter
level: high
tags:
  - attack.initial_access
  - attack.t1078
```

#### 规则 2：Cloak 卷影副本删除

```yaml
title: Cloak - Volume Shadow Copy Deletion
id: cl002-vss-deletion
status: experimental
description: 检测 Cloak 删除卷影副本的行为
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    CommandLine|contains|all:
      - 'vssadmin'
      - 'delete'
      - 'shadows'
  condition: selection
level: high
tags:
  - attack.defense_evasion
  - attack.t1490
```

#### 规则 3：Cloak 数据外传检测

```yaml
title: Cloak - Data Exfiltration via Rclone
id: cl003-rclone-exfil
status: experimental
description: 检测使用 Rclone 进行数据外传的行为
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|endswith: '\rclone.exe'
    CommandLine|contains:
      - 'copy'
      - 'sync'
  condition: selection
level: high
tags:
  - attack.exfiltration
  - attack.t1567.002
```

### 9.2 YARA 规则

```yara
rule Cloak_Ransomware {
    meta:
        description = "检测 Cloak 勒索软件载荷"
        author = "Threat Intelligence Team"
        date = "2026-07-01"
        reference = "Cloak credential-driven ransomware"
    strings:
        $s1 = "Cloak" ascii
        $s2 = "vssadmin delete shadows" ascii
        $s3 = "rclone" ascii
        $hex1 = { 48 89 5C 24 08 48 89 6C 24 10 48 89 74 24 18 }
    condition:
        2 of ($s*) and $hex1
}
```

---

## 十、风险评估矩阵

| 风险维度 | 评分 | 说明 |
|----------|------|------|
| **加密强度** | 7/10 | AES + RSA 混合，标准强度 |
| **传播能力** | 7/10 | 凭证驱动，依赖地下市场 |
| **规避能力** | 9/10 | 无恶意文件，合法凭证，绕过端点检测 |
| **数据泄露威胁** | 9/10 | 双重勒索 + 高支付率 |
| **谈判能力** | 10/10 | 91-96% 支付率，行业领先 |
| **综合风险** | **🟠 高** | 凭证驱动 + 极高支付率 + 政府/关键基础设施目标 |

---

## 十一、缓解建议

### 11.1 即时行动

1. **凭证审计**：检查是否存在已知泄露凭证
2. **MFA 强制**：所有远程访问启用多因素认证
3. **异常登录监控**：检测来自未知地理位置的登录

### 11.2 短期加固

1. **凭证轮换**：定期轮换所有凭证
2. **网络分段**：隔离关键资产
3. **备份验证**：离线/不可变备份

### 11.3 长期策略

1. **零信任架构**：基于身份的持续验证
2. **信息窃取器监控**：监控 Lumma/Aurora/Redline 活动
3. **地下市场情报**：监控 Russian Market 等市场的凭证交易

### 11.4 解密恢复路径

| 维度 | 详情 |
|------|------|
| **解密器状态** | **无公开解密工具** |
| **加密强度** | AES + RSA，标准强度 |
| **建议** | 优先从备份恢复；联系执法部门 |

---

## 十二、核心建议

1. **凭证驱动威胁**：Cloak 证明合法凭证泄露是比漏洞利用更严重的威胁，组织需加强凭证保护
2. **极高支付率**：91-96% 支付率表明 Cloak 谈判策略极为有效，防御者需提前制定勒索应对策略
3. **端点检测失效**：无恶意文件执行使传统端点防护失效，需依赖行为分析和身份检测
4. **目标升级**：从中小企业扩展至政府/关键基础设施，威胁等级上升
5. **信息窃取器生态**：Lumma/Aurora/Redline 等信息窃取器是 Cloak 的上游威胁，需监控其活动

---

## 十三、附录

### 附录 A：信息来源

| 编号 | 来源 | 日期 |
|------|------|------|
| [1] | Halcyon: Q2-2025 Ransomware Power Rankings | 2025 |
| [2] | Ransom.live: Cloak Group Intelligence | 持续更新 |
| [3] | RansomLook: Cloak Statistics | 持续更新 |
| [4] | Trend Micro: Cloak Analysis | 2025 |
| [5] | CrowdStrike: Cloak Threat Profile | 2025 |
| [6] | Zscaler: Credential-Driven Ransomware | 2025 |
| [7] | Picus Security: Cloak TTPs | 2025 |

### 附录 B：术语表

| 术语 | 定义 |
|------|------|
| **信息窃取器** | 窃取浏览器保存凭证、Cookie 等敏感信息的恶意软件 |
| **Russian Market** | 俄语地下市场，交易 stolen credentials |
| **凭证驱动攻击** | 使用合法凭证而非漏洞利用进行初始访问 |
| **双重勒索** | 数据加密 + 数据泄露威胁的组合勒索模式 |

### 附录 C：追踪计划

| 维度 | 说明 |
|------|------|
| **组织状态** | 活跃（Contender Q2-2025） |
| **目标演化** | 监控从中小企业向大型组织/政府的扩展 |
| **支付率** | 关注支付率变化趋势 |
| **解密工具** | 关注是否有公开解密工具发布 |
