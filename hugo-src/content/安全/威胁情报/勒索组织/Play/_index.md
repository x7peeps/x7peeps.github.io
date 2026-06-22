---
title: "Play"
weight: 8
---

**报告编号**: TIR-2026-0622-008 | **分类等级**: TLP:AMBER | **发布日期**: 2026年6月22日 | **情报来源**: 多源交叉验证（OSINT + CISA/FBI/ASD ACSC 联合公告 + 厂商报告）

---

## 一、执行摘要

**Play**（又称 Playcrypt、Balloonfly、Safeplay）是2022年6月以来持续活跃的勒索软件即服务（RaaS）组织，采用封闭式附属模式运营。截至2025年5月，FBI 已确认约 **900 个组织** 遭受攻击，成为2024年全球第四大活跃勒索组织。该组织与 Conti 生态系统存在技术关联，与 Hive 和 Nokoyawa 勒索软件在战术层面有显著重叠。

<!--more-->

Play 勒索组织的核心特征在于其**间歇性加密方案**（基于文件大小的分块加密）和**独特的自研工具链**（Grixba 信息窃取器、AlphaVSS 卷影副本管理工具）。该组织自2023年12月首次被 CISA 发布联合公告以来，持续扩展其漏洞利用能力，2025年已新增利用 SimpleHelp（CVE-2024-57727）和 Windows 零日漏洞（CVE-2025-29824）。

### 关键发现

| 维度 | 关键指标 |
|------|----------|
| **组织规模** | 900+ 受害者（截至2025.05，FBI 确认） |
| **加密方式** | 间歇性加密（ChaCha20，基于文件大小分块） |
| **首要入口** | FortiOS/Exchange 漏洞利用 + 受损凭证 + SimpleHelp |
| **商业模式** | 封闭式 RaaS（"保证交易保密性"） |
| **关联组织** | Hive、Nokoyawa（战术重叠），Conti/Quantum（基础设施重叠） |
| **多平台支持** | Windows、Linux、VMware ESXi |
| **自研工具** | Grixba（信息窃取/网络扫描）、AlphaVSS（卷影副本） |
| **MITRE ATT&CK** | G1040 |
| **解密可能性** | **不存在**（截至2026年6月无公开解密工具） |

### 威胁等级评估

| 评估维度 | 等级 | 说明 |
|----------|------|------|
| **技术能力** | 🟠 高 | 间歇性加密、自研工具、多漏洞利用链 |
| **运营成熟度** | 🟠 高 | 封闭式 RaaS，持续稳定运营 3 年+ |
| **攻击规模** | 🔴 极高 | 900+ 受害者，2024年全球第四活跃 |
| **目标针对性** | 🟠 高 | 关键基础设施、制造业、政府、IT |
| **数据泄露风险** | 🔴 极高 | 双重勒索 + 电话威胁 + 泄露站倒计时 |

---

## 二、威胁行为者画像

### 2.1 组织标识

| 属性 | 值 |
|------|-----|
| **官方名称** | Play / Playcrypt |
| **别名** | Balloonfly、Safeplay、Play Ransomware Group |
| **MITRE ATT&CK** | G1040（组织）、S1162（软件） |
| **组织类型** | 封闭式 RaaS |
| **活跃周期** | 2022年6月至今 |
| **主要语言** | 英语（泄露站/勒索信） |
| **地理归属** | 俄语地区（高置信度） |
| **攻击目标** | 全球（北美、南美、欧洲、大洋洲） |
| **动机** | 经济利益 |

### 2.2 组织演化时间线

```
2022.06    Play 首次被发现
           使用间歇性加密方案
           目标：FortiOS 和 MS Exchange 漏洞利用
    ↓
2022.12    FortiGuard Labs 发布首次分析报告
           确认 .PLAY 文件扩展名和间歇性加密特征
    ↓
2023.04    首次在澳大利亚发现攻击活动
    ↓
2023.10    FBI 确认约 300 个受影响实体
           利用 ProxyNotShell（CVE-2022-41040/41082）
    ↓
2023.12    CISA/FBI/ASD ACSC 发布联合公告 AA23-352A
           首次官方公开 Play 勒索组织 TTPs
    ↓
2024       成为全球第四大活跃勒索组织
           攻击范围扩展至 ESXi/Linux 平台
           开发自研工具 Grixba 和 AlphaVSS
    ↓
2025.01    利用 SimpleHelp CVE-2024-57727 进行攻击
           与初始访问经纪人合作扩大攻击面
    ↓
2025.04    利用 Windows 零日漏洞 CVE-2025-29824
           （CISA 2025年4月补丁修复）
    ↓
2025.06    CISA 更新联合公告（2025.06.04）
           FBI 确认约 900 个受影响实体
           新增 TTPs 和 IOC
    ↓
2025-26    持续活跃，利用多个新漏洞
           包括 CVE-2025-31324、CVE-2025-61882 等
```

---

## 三、归因分析

### 3.1 地理归属

| 指标 | 评估 |
|------|------|
| **语言分析** | 英语对外沟通，推断俄语内部沟通 |
| **CIS 豁免** | 前苏联国家未出现在泄露站受害者列表 |
| **基础设施** | 使用俄语地区托管基础设施 |
| **关联分析** | 与 Conti/Quantum 生态系统共享 Cobalt Strike 水印 ID |
| **置信度** | **高** — 俄语地区运营 |

### 3.2 组织结构与关联

```
Play 核心团队
├── 恶意软件开发
│   ├── Playcrypt 加密器（Windows/Linux/ESXi）
│   ├── Grixba（自研信息窃取器/网络扫描器）
│   └── AlphaVSS（VSS 管理工具，开源修改）
├── 基础设施运营
│   ├── 泄露站（"Play News" 倒计时页面）
│   ├── C2 服务器
│   └── SystemBC (Coroxy) 代理
├── 封闭式附属网络
│   └── 仅邀请制，"保证交易保密性"
└── 初始访问经纪人（IAB）合作
    └── 合作利用 SimpleHelp 等漏洞
```

### 3.3 Conti 生态系统关联

Play 勒索组织与 Conti 生态系统存在多项技术关联：

| 关联指标 | 详情 |
|----------|------|
| **Cobalt Strike 水印** | 使用水印 ID 206546002，与 Emotet/SVCReady 用于 Quantum 勒索活动的相同 |
| **Quantum 基础设施重叠** | 部分 C2 基础设施与 Quantum 勒索软件共享 |
| **战术重叠** | 与 Hive 和 Nokoyawa 勒索软件在战术层面有显著重叠 |
| **Hive 关联** | 可能存在运营者人员交叉 |

---

## 四、技术能力评估

### 4.1 核心能力矩阵

| 能力维度 | 等级 | 详情 |
|----------|------|------|
| **漏洞利用** | 🔴 极高 | 24+ CVE，含零日漏洞（CVE-2025-29824） |
| **加密技术** | 🟠 高 | 间歇性加密（ChaCha20），大幅提高加密速度 |
| **信息窃取** | 🟠 高 | 自研 Grixba 工具，全面域环境侦察 |
| **防御规避** | 🟠 高 | GMER/IOBit/PowerTool 禁用安全工具 |
| **跨平台** | 🟠 高 | Windows、Linux、VMware ESXi |
| **持续运营** | 🔴 极高 | 3年+稳定运营，持续更新 TTPs |

### 4.2 漏洞利用武器库

| CVE 编号 | 软件 | CVSS | 类型 | 利用时间 |
|----------|------|------|------|----------|
| **CVE-2025-29824** | Windows | 高 | 零日漏洞 | 2025.04 |
| **CVE-2024-57727** | SimpleHelp | 高 | 路径遍历 | 2025.01 |
| **CVE-2023-4966** | Citrix Bleed | 9.4 | 信息泄露 | 2023-24 |
| **CVE-2022-41040** | MS Exchange | 8.8 | ProxyNotShell SSRF | 2022-至今 |
| **CVE-2022-41082** | MS Exchange | 8.8 | ProxyNotShell RCE | 2022-至今 |
| **CVE-2018-13379** | FortiOS | 9.8 | 路径遍历 | 2022-至今 |
| **CVE-2020-12812** | FortiOS | 9.8 | 认证绕过 | 2022-至今 |
| **CVE-2024-40766** | FortiOS | 9.8 | RCE | 2024 |
| **CVE-2024-21762** | FortiOS | 9.8 | RCE | 2024 |
| **CVE-2024-55591** | FortiOS | 9.8 | 认证绕过 | 2025 |
| **CVE-2021-40539** | ManageEngine | 9.8 | 认证绕过 | 2022 |
| **CVE-2024-37085** | VMware ESXi | 6.5 | 认证绕过 | 2024 |
| **CVE-2025-31324** | Ivanti Connect | 10.0 | RCE | 2025 |
| **CVE-2025-61882** | Oracle EBS | 9.8 | RCE | 2025 |

### 4.3 间歇性加密方案

Play 勒索软件采用独特的**间歇性加密**（Intermittent Encryption）方案，大幅提升加密速度：

```
文件大小计算
    ↓
块大小 = 0x100000 (1MB)
    ↓
┌─────────────────────────────────────────┐
│  文件大小 ≤ 2,000,000 字节              │
│  → 加密前半部分                          │
├─────────────────────────────────────────┤
│  文件大小 > 2,000,000 字节              │
│  → 分为 4 个块，每个块加密前 50% 数据    │
│  → 跳过中间未加密区域                    │
└─────────────────────────────────────────┘
    ↓
加密算法：ChaCha20
密钥管理：每文件唯一对称密钥 + RSA 公钥加密
```

**优势**：相比全文件加密，间歇性加密速度提升 3-5 倍，同时保持足够的破坏性。

---

## 五、攻击链分析

### 5.1 攻击链概览

```
┌─────────────────────────────────────────────────────────────┐
│  阶段1：初始访问                                              │
│  · FortiOS 漏洞利用（CVE-2018-13379、CVE-2020-12812）         │
│  · MS Exchange ProxyNotShell（CVE-2022-41040/41082）          │
│  · SimpleHelp 路径遍历（CVE-2024-57727）                       │
│  · 受损凭证 + RDP 暴露                                       │
│  · Windows 零日（CVE-2025-29824）                             │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  阶段2：侦察与发现                                            │
│  · AdFind：Active Directory 枚举                             │
│  · Grixba：域用户/计算机扫描、安全软件检测                     │
│  · BloodHound：攻击路径分析                                  │
│  · Nltest：域信任关系枚举                                    │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  阶段3：防御规避                                              │
│  · GMER/IOBit/PowerTool：禁用 EDR/AV                        │
│  · Wevtutil：清除 Windows 事件日志                           │
│  · Cobalt Strike：商业渗透框架                               │
│  · SystemBC (Coroxy)：SOCKS 代理后门                        │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  阶段4：凭证访问与权限提升                                     │
│  · Mimikatz：LSASS 内存凭证转储                              │
│  · WinPEAS：本地权限提升检查                                 │
│  · Nekto/PriviCMD：远程权限提升                              │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  阶段5：横向移动                                              │
│  · PsExec：远程命令执行                                      │
│  · Plink：SSH 隧道                                           │
│  · WinSCP：文件传输                                          │
│  · Empire：后渗透框架                                        │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  阶段6：数据窃取与备份删除                                     │
│  · AlphaVSS：卷影副本管理/删除                               │
│  · 自定义 VSS 复制工具                                       │
│  · WinRAR：数据压缩                                          │
│  · 通过加密通道外传数据                                       │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  阶段7：加密与勒索                                            │
│  · Playcrypt 间歇性加密（ChaCha20）                          │
│  · .PLAY 文件扩展名（早期）/ 随机扩展名（新版）               │
│  · ReadMe.txt 勒索信（含联系方式）                            │
│  · 泄露站"Play News"倒计时                                   │
│  · 电话威胁受害者高管                                         │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 MITRE ATT&CK 映射

| 战术 | 技术 | 技术ID | Play 实现 |
|------|------|--------|-----------|
| **初始访问** | 利用面向公众的应用漏洞 | T1190 | FortiOS/Exchange/SimpleHelp 漏洞利用 |
| **初始访问** | 受损的有效账户 | T1078 | RDP/VPN 凭证滥用 |
| **初始访问** | 外部远程服务 | T1133 | 暴露的 RDP/VPN 服务器 |
| **发现** | 系统网络配置发现 | T1016 | AdFind、Grixba 域枚举 |
| **发现** | 安全软件发现 | T1518.001 | Grixba 扫描 AV/EDR/备份工具 |
| **防御规避** | 禁用或修改工具 | T1562.001 | GMER、IOBit、PowerTool |
| **防御规避** | 清除 Windows 事件日志 | T1070.001 | Wevtutil |
| **凭证访问** | OS 凭证转储 | T1003 | Mimikatz（LSASS） |
| **横向移动** | 远程服务 | T1021 | PsExec、WinRM |
| **横向移动** | SSH 隧道 | T1021.004 | Plink |
| **影响** | 数据加密 | T1486 | Playcrypt（ChaCha20 间歇性加密） |
| **影响** | 卷影副本删除 | T1490 | AlphaVSS、自定义 VSS 工具 |

---

## 六、受害者分析

### 6.1 受害者规模与趋势

| 时间 | 受害者数 | 关键事件 |
|------|---------|----------|
| 2022.06-12 | ~10+ | 初始活动期 |
| 2023 | ~300（FBI 确认） | CISA 联合公告发布 |
| 2024 | ~600+ | 成为全球第四活跃组织 |
| 2025.05 | **~900**（FBI 确认） | 持续增长，利用新漏洞 |
| 2026（至今） | 持续增长 | 继续利用多个新漏洞 |

### 6.2 行业分布

| 行业 | 优先级 | 说明 |
|------|--------|------|
| **关键基础设施** | 🔴 高 | 基础设施提供商、公用事业 |
| **制造业** | 🔴 高 | 工业制造、供应链企业 |
| **政府** | 🟠 中高 | 地方/联邦政府机构 |
| **IT/科技** | 🟠 中高 | MSP、SaaS 提供商 |
| **法律** | 🟡 中 | 律师事务所 |
| **房地产** | 🟡 中 | 房地产开发商 |
| **建筑** | 🟡 中 | 建筑公司 |
| **医疗** | 🟡 中 | 医疗机构（9 起确认） |
| **零售** | 🟡 中 | 零售企业 |
| **媒体** | 🟡 中 | 媒体公司 |
| **交通** | 🟡 中 | 交通运营商 |

### 6.3 地理分布

| 地区 | 占比 | 说明 |
|------|------|------|
| **北美** | ~45% | 美国为主要目标 |
| **南美** | ~20% | 巴西、阿根廷等 |
| **欧洲** | ~25% | 德国、英国等 |
| **大洋洲** | ~5% | 澳大利亚 |
| **其他** | ~5% | 亚洲、非洲 |

### 6.4 重大攻击事件

| 时间 | 事件 | 影响 |
|------|------|------|
| 2022.12 | 攻击阿根廷国家通信管理局 ENACOM | 阿根廷电信服务中断 |
| 2023 | 攻击 Rackspace | 邮件服务严重中断 |
| 2023 | 攻击哥斯达黎加多家机构 | 政府服务中断 |
| 2024 | 大规模利用 Citrix Bleed | 多个关键基础设施受影响 |
| 2025.01 | SimpleHelp 漏洞利用 | 多个美国实体被入侵 |
| 2025.04 | 利用 Windows 零日 CVE-2025-29824 | 高优先级攻击活动 |

---

## 七、自研工具链分析

### 7.1 Grixba（信息窃取器/网络扫描器）

Grixba 是 Play 勒索组织开发的专用工具，集信息窃取和网络扫描于一体：

| 功能 | 详情 |
|------|------|
| **域枚举** | 扫描域用户、计算机、组策略 |
| **安全软件检测** | 检测 AV、EDR、备份工具 |
| **扫描方式** | WMI、WinRM、Remote Registry |
| **数据外传** | 将枚举结果加密存储用于后续攻击 |
| **用途** | 攻击前侦察 + 识别高价值目标 |

### 7.2 AlphaVSS（卷影副本管理）

AlphaVSS 是基于开源项目的修改版本，用于管理 Windows 卷影副本：

| 功能 | 详情 |
|------|------|
| **来源** | 开源 AlphaVSS 项目修改版 |
| **功能** | 创建、列举、删除卷影副本 |
| **用途** | 加密前删除卷影副本，阻断恢复路径 |
| **替代方案** | 也使用 `vssadmin delete shadows /all /quiet` |

---

## 八、IOC 完整列表

### 8.1 勒索信特征

| 指标 | 值 |
|------|-----|
| **文件名** | `ReadMe.txt` |
| **放置位置** | 每个被加密文件夹 + 根目录 |
| **联系方式** | `@gmx.de` 或 `@web.de` 邮箱地址 |
| **泄露站** | Tor 网络 "Play News" 页面（含倒计时） |

### 8.2 文件扩展名

| 版本 | 扩展名 |
|------|--------|
| **早期版本** | `.PLAY` |
| **新版本** | 随机生成的 4-5 位字母数字扩展名 |

### 8.3 行为指标

| 指标 | 说明 |
|------|------|
| **间歇性加密** | 每 1MB 块仅加密前 50% |
| **VSS 删除** | 加密前删除所有卷影副本 |
| **安全工具禁用** | 使用 GMER/IOBit/PowerTool 禁用 EDR |
| **日志清除** | 使用 Wevtutil 清除事件日志 |
| **Grixba 扫描** | 域环境全面侦察 |

### 8.4 网络指标

| 指标 | 说明 |
|------|------|
| **Cobalt Strike C2** | 使用水印 ID 206546002 |
| **SystemBC 代理** | Coroxy 变种，SOCKS 代理后门 |
| **数据外传** | WinSCP/SFTP 加密通道 |

---

## 九、检测规则

### 9.1 Sigma 规则

**规则1：Grixba 信息窃取器检测**

```yaml
title: Play Ransomware Grixba Info Stealer Execution
id: a]play-grixba-001
status: experimental
description: 检测 Play 勒索组织自研 Grixba 工具的执行行为
author: Threat Intelligence Team
date: 2026/06/22
tags:
    - attack.discovery
    - attack.t1016
    - attack.t1518.001
logsource:
    category: process_creation
    product: windows
detection:
    selection:
        Image|endswith:
            - '\grixba.exe'
            - '\grixba.dll'
    condition: selection
level: high
```

**规则2：AlphaVSS 卷影副本删除检测**

```yaml
title: Play Ransomware AlphaVSS Shadow Copy Deletion
id: a]play-alphavss-002
status: experimental
description: 检测 Play 勒索组织使用 AlphaVSS 删除卷影副本
author: Threat Intelligence Team
date: 2026/06/22
tags:
    - attack.impact
    - attack.t1490
logsource:
    category: process_creation
    product: windows
detection:
    selection_vssadmin:
        Image|endswith: '\vssadmin.exe'
        CommandLine|contains:
            - 'delete shadows'
            - 'delete shadowcopy'
    selection_alphavss:
        Image|endswith: '\alphavss.exe'
    selection_wevtutil:
        Image|endswith: '\wevtutil.exe'
        CommandLine|contains:
            - 'cl Security'
            - 'cl System'
            - 'cl Application'
    condition: selection_vssadmin or selection_alphavss or selection_wevtutil
level: critical
```

**规则3：间歇性加密特征检测**

```yaml
title: Play Ransomware Intermittent Encryption Pattern
id: a]play-intermittent-003
status: experimental
description: 检测 Play 勒索软件间歇性加密行为特征
author: Threat Intelligence Team
date: 2026/06/22
tags:
    - attack.impact
    - attack.t1486
logsource:
    category: file_rename
    product: windows
detection:
    selection:
        TargetFilename|endswith:
            - '.PLAY'
    condition: selection
level: high
```

### 9.2 YARA 规则

**规则1：Playcrypt 加密器检测**

```yara
rule Playcrypt_Detect {
    meta:
        description = "Detects Playcrypt ransomware used by Play group"
        author = "Threat Intelligence Team"
        date = "2026-06-22"
        reference = "CISA AA23-352A"
        tlp = "AMBER"
    strings:
        $s1 = "ReadMe.txt" ascii
        $s2 = ".PLAY" ascii
        $s3 = "vssadmin delete shadows" ascii
        $s4 = "YOUR FILES ARE ENCRYPTED" ascii
        $s5 = "Play News" ascii
        $hex1 = { 48 8B 05 ?? ?? ?? ?? 48 89 44 24 ?? E8 }
    condition:
        3 of ($s*) or ($hex1 and any of ($s*))
}
```

---

## 十、风险评估矩阵

### 10.1 综合风险评分

| 维度 | 评分(1-10) | 说明 |
|------|-----------|------|
| **技术能力** | 8 | 间歇性加密、自研工具、零日利用 |
| **运营成熟度** | 8 | 3年+稳定运营，封闭式 RaaS |
| **攻击规模** | 9 | 900+ 受害者，全球第四活跃 |
| **财务影响** | 8 | 数千万美元级别 |
| **目标范围** | 8 | 13+ 行业，6大洲 |
| **反检测能力** | 7 | 自研工具 + LOLBINS |
| **适应能力** | 9 | 持续更新漏洞利用和 TTPs |
| **抗执法能力** | 7 | 封闭式模式降低暴露风险 |
| **综合评分** | **8.0/10** | **高威胁** |

---

## 十一、缓解建议

### 11.1 紧急措施（24小时内）

| 优先级 | 措施 | 说明 |
|--------|------|------|
| **P0** | 修补 CVE-2025-29824 | Windows 零日漏洞，已在 2025年4月补丁修复 |
| **P0** | 修补 SimpleHelp CVE-2024-57727 | 路径遍历漏洞，更新至最新版本 |
| **P0** | 审计 FortiOS/Exchange | 确保 CVE-2018-13379、ProxyNotShell 等已修补 |
| **P1** | 启用 MFA | 所有 VPN、RDP、邮件系统强制 MFA |

### 11.2 短期措施（1周内）

| 优先级 | 措施 | 说明 |
|--------|------|------|
| **P1** | 部署 EDR 行为检测 | 监控 Grixba/AlphaVSS 等自研工具行为 |
| **P1** | 监控间歇性加密 | 检测大量文件在短时间内被部分加密 |
| **P2** | 网络分段 | 隔离关键资产，限制横向移动 |
| **P2** | 卷影副本保护 | 确保卷影副本不可被远程删除 |

### 11.3 长期措施（1-3个月）

| 优先级 | 措施 | 说明 |
|--------|------|------|
| **P1** | 零信任架构 | 实施最小权限原则 |
| **P2** | 3-2-1 备份策略 | 至少一份离线不可变备份 |
| **P2** | 事件响应演练 | 针对 Play 勒索软件特征进行模拟 |

---

## 十二、核心建议

### 对企业管理层

1. **封闭式模式意味着更难渗透** — Play 采用邀请制附属，但一旦入侵成功，其封闭性意味着赎金谈判更加困难
2. **900+ 受害者说明持续威胁** — 该组织稳定运营 3 年+，不会很快消失
3. **间歇性加密使检测更难** — 传统"加密文件数量"检测可能遗漏间歇性加密

### 对安全运营团队

1. **重点检测 Grixba** — 这是 Play 勒索组织的标志性自研工具
2. **监控 VSS 删除操作** — AlphaVSS 和 vssadmin delete 是加密前的关键指标
3. **关注 Cobalt Strike 水印 206546002** — 与 Conti/Quantum 生态系统关联
4. **SimpleHelp 补丁优先级最高** — 2025年最新攻击向量

---

## 附录

### 附录A：参考资料

| 来源 | 文档 | 日期 |
|------|------|------|
| **CISA/FBI/ASD ACSC** | AA23-352A: #StopRansomware: Play Ransomware（更新版） | 2025.06 |
| **MITRE ATT&CK** | Group G1040: Play | 持续更新 |
| **FortiGuard Labs** | Ransomware Roundup – Play | 2022.12 |
| **Picus Security** | Play Ransomware Analysis | 2025.06 |
| **AttackIQ** | Updated Response to CISA Advisory AA23-352A | 2025.06 |
| **Breachsense** | State of Ransomware 2025 | 2026.01 |
| **Google/Mandiant** | Ransomware TTPs in a Shifting Threat Landscape | 2026.03 |

### 附录B：术语表

| 术语 | 定义 |
|------|------|
| **间歇性加密** | 仅加密文件的部分块（如每块前 50%），大幅提升加密速度 |
| **Grixba** | Play 勒索组织自研的信息窃取器和网络扫描工具 |
| **AlphaVSS** | Play 勒索组织使用的卷影副本管理工具（开源修改版） |
| **封闭式 RaaS** | 仅邀请制附属，不公开招募 |
| **SystemBC** | 用于建立 SOCKS 代理的后门程序 |

### 附录C：追踪计划

| 追踪项 | 频率 | 说明 |
|--------|------|------|
| 泄露站更新 | 每日 | 监控 "Play News" 新受害者 |
| 新漏洞利用 | 实时 | 关注新 CVE 武器化 |
| 工具链更新 | 每月 | 跟踪 Grixba/AlphaVSS 演化 |
| 附属活动 | 每季度 | 分析附属成员变化 |

---

> **免责声明**：本报告基于公开威胁情报来源编制，仅供安全研究与防御参考。报告中的 MITRE ATT&CK® 技术标识基于 MITRE ATT&CK for Enterprise v15。
