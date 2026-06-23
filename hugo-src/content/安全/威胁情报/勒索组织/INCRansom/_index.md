---
title: "INC Ransom"
weight: 11
---

**报告编号**: TIR-2026-0623-011 | **分类等级**: TLP:AMBER | **发布日期**: 2026年6月23日 | **情报来源**: 多源交叉验证（OSINT + MITRE ATT&CK G1032/S1139 + Acronis TRU + Unit 42 / Palo Alto Networks + Trend Micro + Halcyon + SOCRadar + Blackpoint Cyber + Cybereason + Huntress + Secureworks）

---

## 一、执行摘要

**INC Ransom** 是2023年7月独立崛起的勒索软件即服务（RaaS）组织，不同于大多数从既有组织分裂而来的勒索团伙，INC Ransom 以**原创形态**出现并迅速扩展为2025-2026年全球最活跃的勒索威胁之一。截至2026年中，该组织已攻击超过 **800 个受害者**，其中 **65% 以上为美国组织**，重点打击法律、制造、建筑、科技和医疗卫生行业。

<!--more-->

INC Ransom 的核心特征在于其**无道德底线的攻击策略**——与声称不攻击医疗、教育和政府的传统勒索组织不同，INC Ransom 系统性地攻击这些关键领域，包括 NHS Scotland（3TB 数据泄露威胁）、Ascension Health、McLaren Health Care、City of Hope 癌症医院等。2024年5月，其完整源代码（含 Windows 和 Linux/ESXi 版本）以 **30 万美元**在暗网论坛出售，直接催生了 **Lynx** 和 **Sinobi** 两个衍生勒索软件家族。最新变体已完成 **Rust 语言重写**，大幅提升跨平台开发效率和逆向分析难度。

### 关键发现

| 维度 | 关键指标 |
|------|----------|
| **组织规模** | 800+ 受害者（截至2026年中），2024年162个，2025年300+ |
| **首要目标** | 美国（65%+），英国、加拿大、澳大利亚、法国、德国 |
| **加密方式** | AES-128-CTR + Curve25519（Rust 重写）；部分加密（快速/中速模式） |
| **首要入口** | GootLoader（Storm-0494 SEO 投毒）→ Supper 后门 → 横向移动 |
| **商业模式** | RaaS（附属70-80% / 核心20-30%分成） |
| **关联组织** | GOLD IONIC（MITRE）、Vanilla Tempest/DEV-0832（附属）、Storm-0494（IAB） |
| **衍生家族** | Lynx（70%函数相似度）、Sinobi |
| **MITRE ATT&CK** | G1032（组织）/ S1139（软件） |
| **解密可能性** | **不存在**（无公开解密工具） |
| **当前状态** | **活跃**（2026年持续添加受害者） |

### 威胁等级评估

| 评估维度 | 等级 | 说明 |
|----------|------|------|
| **技术能力** | 🔴 极高 | Rust 重写、部分加密、多平台变体、Veeam 凭证窃取工具 |
| **运营成熟度** | 🔴 极高 | RaaS 模式、双重勒索、"打电话给律师"谈判策略 |
| **攻击规模** | 🔴 极高 | 800+ 受害者，2025年 Top 10 最活跃勒索组织 |
| **目标针对性** | 🔴 极高 | 无禁区——医疗、教育、政府、关键基础设施均被攻击 |
| **数据泄露风险** | 🔴 极高 | 双重勒索 + TOR/clearnet 双泄露站 |

---

## 二、威胁行为者画像

### 2.1 组织标识

| 属性 | 值 |
|------|-----|
| **官方名称** | INC Ransom |
| **别名** | GOLD IONIC（MITRE ATT&CK / Secureworks）、Water Anito（Trend Micro，早期追踪） |
| **MITRE ATT&CK** | G1032（组织）/ S1139（INC Ransomware 软件） |
| **组织类型** | RaaS（核心团队 + 附属机构） |
| **活跃周期** | 2023年7月 – 至今 |
| **主要语言** | 英语（勒索信/谈判）、俄语（内部通信，RAMP 论坛招募） |
| **地理归属** | 俄语地区（高置信度）；CIS 目标排除规则 |
| **攻击目标** | 全球（美国65%+，英、加、澳、法、德） |
| **动机** | 经济利益 |

### 2.2 组织演化时间线

```
2023.07    INC Ransom 首次被发现
           独立出现，非从既有组织分裂
           以"安全服务"包装勒索行为
    ↓
2023.09    泄露站公布12个受害者
           2个月内快速增长
    ↓
2023.11    利用 CVE-2023-3519（Citrix NetScaler）获取初始访问
           攻击 Yamaha Motor Philippines 等知名企业
           Trend Micro 追踪为 Water Anito
    ↓
2023.12    Linux 版本发布
           12月达到124次攻击尝试峰值（Trend Micro）
    ↓
2024.03    Windows 变体更新
           源码在暗网论坛以 $300,000 出售（用户 salfetka）
           salfetka 关联 Nokoyawa/JSWORM/Nefilim/Karma/Nemty
    ↓
2024.05    Ascension Health 遭攻击（美国最大非营利医疗系统之一）
           NHS Scotland 3TB 数据泄露威胁
    ↓
2024.07    Lynx 勒索软件出现（70%+ 函数相似度）
           Unit 42 确认 Lynx 为 INC 源码衍生
           McLaren Health Care 遭攻击
    ↓
2024.08    Vanilla Tempest（Vice Society）采用 INC 作为主要载荷
           Storm-0494 提供 GootLoader 初始访问
    ↓
2024.Q4    City of Hope 癌症医院遭攻击（80万+患者受影响）
           Sinobi 勒索软件出现（另一源码衍生）
    ↓
2025       成为 Top 10 最活跃勒索组织
           300+ 受害者被添加至泄露站
           Rust 重写变体出现
    ↓
2026       800+ 受害者（Acronis TRU 统计）
           持续活跃，法律/制造/建筑/科技/医疗为首要行业
```

---

## 三、归因分析

### 3.1 地理归属

| 证据类型 | 详情 | 置信度 |
|----------|------|--------|
| **语言分析** | 勒索信和谈判使用英语；内部通信使用俄语 | 高 |
| **论坛招募** | 在 RAMP（Russian Anonymous Market Place）招募附属 | 高 |
| **排除规则** | 不攻击 CIS（独联体）国家目标 | 高 |
| **基础设施** | TOR + clearnet 双基础设施 | 中 |
| **关联人物** | salfetka（源码出售者）关联多个俄语勒索软件家族 | 中-高 |

### 3.2 关联组织网络

```
┌──────────────────────────────────────────────────────┐
│           INC Ransom 关联组织网络                      │
├──────────────────────────────────────────────────────┤
│                                                        │
│  ┌─────────────────┐                                  │
│  │ INC Ransom 核心  │ G1032 / GOLD IONIC              │
│  │ （RaaS 提供者）   │                                 │
│  └────────┬────────┘                                  │
│           │                                            │
│           ├──→ Vanilla Tempest（DEV-0832 / Vice Society）│
│           │    附属机构，2024.08采用 INC 载荷            │
│           │    此前使用 BlackCat/Rhysida/Quantum Locker  │
│           │                                            │
│           ├──→ Storm-0494（IAB 合作伙伴）               │
│           │    提供 GootLoader 初始访问                  │
│           │                                            │
│           ├──→ Lynx 勒索软件（源码衍生）                │
│           │    70%+ 函数相似度，2024.07出现              │
│           │    Water Lalawag（Trend Micro 追踪）        │
│           │                                            │
│           └──→ Sinobi 勒索软件（源码衍生）              │
│                另一源码购买者创建                        │
│                                                        │
└──────────────────────────────────────────────────────┘
```

### 3.3 关键人物

| 人物/代号 | 角色 | 状态 |
|-----------|------|------|
| **salfetka** | 源码出售者 | 关联 Nokoyawa/JSWORM/Nefilim/Karma/Nemty |
| **rinc / farnetwork** | salfetka 关联别名 | 活跃 |
| **GOLD IONIC** | Secureworks/MITRE 追踪的操作者 | 未公开 |

---

## 四、技术能力评估

### 4.1 加密方案演化

#### 早期变体（2023.07 – 2024）

| 属性 | 值 |
|------|-----|
| **编程语言** | C++ |
| **对称加密** | AES-128-CTR |
| **加密模式** | 部分加密（快速模式：加密1MB跳过更大字节；中速模式：加密1MB跳过更小字节） |
| **多线程** | 支持多线程加速加密 |
| **文件扩展名** | `.inc` / 自定义扩展名 |

#### 最新变体（2025 – 至今）

| 属性 | 值 |
|------|-----|
| **编程语言** | **Rust**（Windows + Linux/ESXi 均重写） |
| **对称加密** | AES（具体模式未公开） |
| **非对称加密** | Curve25519 |
| **部分加密** | 保留，可配置 |
| **跨平台** | 统一 Rust 代码库，Windows + Linux + ESXi |
| **优势** | 内存安全、逆向分析难度极大、跨平台开发效率提升 |

### 4.2 部分加密技术

```
┌──────────────────────────────────────────────────────┐
│           INC Ransom 部分加密机制                      │
├──────────────────────────────────────────────────────┤
│                                                        │
│  快速加密模式：                                        │
│  [████░░░░░░░░░░░░░░░░████░░░░░░░░░░░░░░░░]          │
│  加密 1,000,000 字节 → 跳过大块数据 → 继续加密        │
│                                                        │
│  中速加密模式：                                        │
│  [████░░████░░████░░████░░████░░████░░████]           │
│  加密 1,000,000 字节 → 跳过较小间隔 → 继续加密        │
│                                                        │
│  技术细节：                                            │
│  ├── AES-128-CTR 对称加密                             │
│  ├── 多线程并行处理                                    │
│  ├── 命令行参数指定加密路径                             │
│  └── 可配置加密强度                                    │
│                                                        │
└──────────────────────────────────────────────────────┘
```

### 4.3 双重勒索机制

```
┌─────────────────────────────────────────────────┐
│         INC Ransom 双重勒索模型                   │
├─────────────────────────────────────────────────┤
│                                                   │
│  第一阶段：数据窃取                               │
│  ├── 7-Zip 归档敏感数据                          │
│  ├── MEGA / MEGAcmd 云存储外传                   │
│  └── 数据泄露站准备                              │
│                                                   │
│  第二阶段：文件加密                               │
│  ├── 部分加密（快速/中速模式）                    │
│  ├── 终止安全进程（ProcTerminator）               │
│  ├── 删除卷影副本                                │
│  └── 壁纸替换为勒索信                            │
│                                                   │
│  第三阶段：勒索谈判                               │
│  ├── TOR 门户登录（唯一用户ID）                   │
│  ├── Clearnet 泄露站公开施压                      │
│  ├── "打电话给律师"选项（法律/监管压力）          │
│  └── 加密货币支付                                │
│                                                   │
│  第四阶段：数据泄露（如未支付）                    │
│  └── 数据发布至公开泄露站                        │
│                                                   │
└─────────────────────────────────────────────────┘
```

---

## 五、攻击链分析

### 5.1 初始访问

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **GootLoader** | T1566.001 / T1195.002 | Storm-0494 通过 SEO 投毒分发，移交控制权 |
| **钓鱼邮件** | T1566.001 | 鱼叉式钓鱼（早期攻击中使用） |
| **公开漏洞利用** | T1190 | CVE-2023-3519（Citrix NetScaler）、Citrix ADC/Gateway |
| **凭证购买** | T1588.001 | 从 IAB 购买有效凭证 |
| **密码喷洒** | T1110.003 | 针对远程服务的密码喷洒攻击 |

### 5.2 执行与持久化

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **Supper 后门** | T1071 | GootLoader 移交后部署，建立持久 C2 |
| **cmd.exe** | T1059.003 | 命令行启动恶意载荷 |
| **注册表启动键** | T1547.001 | Registry Run Keys 持久化 |
| **DLL 侧加载** | T1574.002 | 合法应用加载恶意 DLL |
| **进程注入** | T1055 | 向合法进程注入恶意代码 |

### 5.3 横向移动与发现

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **RDP** | T1021.001 | 远程桌面协议横向移动 |
| **PsExec** | T1570 | 远程执行勒索二进制文件 |
| **AnyDesk / TightVNC** | T1021 | 合法远程工具滥用 |
| **WMIC** | T1047 | Windows Management Instrumentation Provider Host 部署载荷 |
| **NetScan / Advanced IP Scanner** | T1046 | 网络资产枚举 |
| **域账户发现** | T1087.002 | 扫描域管理员账户 |
| **隐藏驱动器发现** | T1680 | 发现并挂载隐藏驱动器进行加密 |

### 5.4 凭证访问

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **Veeam 凭证转储** | T1003 | 修改版工具提取 Veeam Backup 凭证（支持新版 salted DPAPI） |
| **Mimikatz** | T1003.001 | LSASS 内存凭证提取 |

### 5.5 数据外传

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **7-Zip / WinRAR** | T1560.001 | 归档收集的数据 |
| **MEGA / MEGAcmd** | T1537 / T1567.002 | 云存储数据外传 |
| **数据暂存** | T1074 | 在受感染主机上暂存数据 |

### 5.6 防御规避与影响

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **ProcTerminator** | T1562.001 | 终止安全进程（特别针对 Trend Micro） |
| **ProcessHacker** | T1562.001 | 终止 AV/EDR 进程 |
| **删除卷影副本** | T1490 | 删除卷影副本备份 |
| **壁纸替换** | T1491.001 | 替换桌面壁纸显示勒索信 |
| **Base64 解码** | T1140 | CryptStringToBinaryA 解码内嵌勒索信 |
| **部分加密** | T1486 | AES-128-CTR 部分加密 + 多线程 |
| **打印机轰炸** | T1491 | Lynx 变体可在连接打印机上打印勒索信 |

---

## 六、受害者分析

### 6.1 规模与地理分布

| 指标 | 值 |
|------|-----|
| **确认受害者** | 800+（Acronis TRU，截至2026年中） |
| **2024年受害者** | 162（Blackpoint Cyber） |
| **2025年受害者** | 300+（Blackpoint Cyber） |
| **首要国家** | 美国（65%+） |
| **其他目标** | 英国、加拿大、澳大利亚、法国、德国 |

### 6.2 行业分布

| 行业 | 优先级 | 典型案例 |
|------|--------|----------|
| **法律服务** | 🔴 首要 | 律师事务所、法律机构（2026年最高频目标） |
| **制造业** | 🔴 首要 | 制造企业、工业设施 |
| **建筑工程** | 🔴 高 | 建筑公司、工程服务商 |
| **科技** | 🔴 高 | IT 服务商、软件公司 |
| **医疗卫生** | 🔴 极高 | Ascension Health、McLaren Health Care、City of Hope、NHS Scotland |
| **教育** | 🔴 高 | 学校、大学、培训机构 |
| **政府** | 🟠 高 | 市政府、公共机构（无禁区策略） |
| **金融服务** | 🟡 中 | 银行、保险公司 |

### 6.3 重大攻击事件

| 时间 | 受害者 | 影响 |
|------|--------|------|
| 2023.11 | Yamaha Motor Philippines | 37GB 数据泄露（员工信息、备份文件、企业销售数据） |
| 2024.03 | NHS Scotland | 3TB 数据泄露威胁 |
| 2024.05 | Ascension Health | 美国最大非营利医疗系统之一遭攻击 |
| 2024.08 | McLaren Health Care | 密歇根非营利医疗系统运营中断 |
| 2024.Q4 | City of Hope | 癌症医院运营商遭攻击，80万+患者受影响 |
| 2024.12 | Menominee Tribal Clinic | 威斯康星州诊所服务中断 |
| 2025.01 | Boldon James（英国） | 数据安全公司遭攻击，500GB 数据泄露 |
| 2025.01 | City of Beloit | 威斯康星州市政运营中断 |
| 2025.01 | Heart to Heart Hospice | 医疗 providers 敏感患者数据泄露 |

---

## 七、RaaS 运营模式分析

### 7.1 组织架构

```
┌──────────────────────────────────────────────────────┐
│              INC Ransom RaaS 架构                     │
├──────────────────────────────────────────────────────┤
│                                                        │
│  ┌──────────────────┐                                │
│  │ 核心开发团队       │ 编写/维护勒索软件              │
│  │（GOLD IONIC）      │ 管理泄露站和谈判平台           │
│  │ 20-30% 分成       │ 提供技术支持和操作指导          │
│  └────────┬─────────┘                                │
│           │                                            │
│           ├──→ 附属机构（70-80% 分成）                 │
│           │    ├── Vanilla Tempest（Vice Society）     │
│           │    ├── 独立附属（通过 RAMP 招募）          │
│           │    └── LockBit/BlackCat 流离附属           │
│           │                                            │
│           ├──→ Storm-0494（IAB 合作伙伴）              │
│           │    提供 GootLoader 初始访问                 │
│           │                                            │
│           └──→ 衍生家族                                │
│                ├── Lynx（源码购买者）                   │
│                └── Sinobi（源码购买者）                 │
│                                                        │
└──────────────────────────────────────────────────────┘
```

### 7.2 谈判策略创新

INC Ransom 在勒索谈判中引入了独特的**法律/监管压力策略**：

- **"打电话给律师"选项**：将赎金要求重新包装为监管罚款和诉讼风险
- **双重泄露站**：
  - TOR 门户（需登录，作为沟通渠道）
  - Clearnet 公开站（展示泄露数据，公开施压）
- **道德伪装**：声称攻击是"安全服务"，通过揭示漏洞"改善"受害者安全态势

### 7.3 洗钱路径

赎金以**加密货币**收取，通过以下路径清洗：
```
受害者支付 → 加密货币钱包 → 多层混币/跨链转换 → 场外交易（OTC） → 法币提取
```

---

## 八、IOC 完整列表

### 8.1 网络指标

| 类型 | 值 | 说明 |
|------|-----|------|
| **域名** | `zendesklt[.]com` | Vanilla Tempest C2 |
| **域名** | `zen-sso[.]com` | 仿冒 SSO 域名 |
| **域名** | `www.truecorphr[.]net` | 仿冒 HR 域名 |
| **域名** | `walmartworkspace[.]com` | 仿冒企业域名 |
| **域名** | `vz-hr[.]com` | 仿冒 HR 域名 |
| **域名** | `usinfo1[.]net` | C2 域名 |
| **域名** | `temp[.]sh` | 临时托管域名 |
| **IP** | `216.128.128.163` | C2 服务器 |
| **IP** | `195.35.10.222` | C2 服务器 |
| **IP** | `162.33.178.245` | C2 服务器 |
| **IP** | `149.28.80.155` | C2 服务器 |
| **IP** | `149.28.66.216` | C2 服务器 |
| **IP** | `104.207.153.50` | C2 服务器 |
| **文件** | `.inc` | INC 加密文件扩展名 |
| **文件** | `.lynx` | Lynx 衍生变体扩展名 |
| **工具** | GootLoader | 初始访问下载器（SEO 投毒） |
| **工具** | Supper | 后门 C2 工具 |
| **工具** | HackTool.ProcTerminator | 安全进程终止工具 |
| **工具** | HackTool.PS1.VeeamCreds | Veeam 凭证窃取脚本 |
| **工具** | NetScan / Advanced IP Scanner | 网络扫描工具 |
| **工具** | MEGA / MEGAcmd | 数据外传工具 |
| **工具** | AnyDesk / TightVNC | 合法远程工具滥用 |

### 8.2 被利用漏洞

| CVE | 影响组件 | CVSS | 说明 |
|-----|----------|------|------|
| CVE-2023-3519 | Citrix NetScaler ADC / Gateway | 7.5 | 认证绕过，用于初始访问 |

### 8.3 攻击工具链

```
Storm-0494: GootLoader（SEO 投毒 → 下载器）
    ↓
移交控制权 → Vanilla Tempest / 附属机构
    ↓
Supper 后门（C2 通道建立）
    ↓
AnyDesk / TightVNC（远程管理）
    ↓
Mimikatz / VeeamCreds（凭证窃取）
    ↓
NetScan / Advanced IP Scanner（网络发现）
    ↓
PsExec / WMIC / RDP（横向移动）
    ↓
7-Zip + MEGA（数据外传）
    ↓
INC Ransom 载荷（部分加密 + 壁纸替换 + 勒索信）
```

---

## 九、检测规则

### 9.1 Sigma 规则

#### 规则 1：INC Ransom 卷影副本删除

```yaml
title: INC Ransom - Volume Shadow Copy Deletion
id: a7b8c9d0-e1f2-3456-ghij-567890123456
status: experimental
description: 检测 INC Ransom 勒索软件删除卷影副本的行为
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

#### 规则 2：ProcTerminator 安全进程终止

```yaml
title: INC Ransom - ProcTerminator Security Process Termination
id: b8c9d0e1-f2a3-4567-hijk-678901234567
status: experimental
description: 检测使用 ProcTerminator 终止安全软件进程的行为
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|contains:
      - 'ProcTerminator'
      - 'ProcessHacker'
    CommandLine|contains:
      - 'TrendMicro'
      - 'mbam'
      - 'avp'
      - 'MsMpEng'
  condition: selection
level: critical
tags:
  - attack.defense_evasion
  - attack.t1562.001
```

#### 规则 3：Veeam 凭证窃取

```yaml
title: INC Ransom - Veeam Credential Dumping
id: c9d0e1f2-a3b4-5678-ijkl-789012345678
status: experimental
description: 检测从 Veeam Backup 管理器提取凭证的行为
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    CommandLine|contains:
      - 'VeeamCreds'
      - 'Veeam.Backup'
      - 'DecryptPassword'
  condition: selection
level: critical
tags:
  - attack.credential_access
  - attack.t1003
```

### 9.2 YARA 规则

```yara
rule INC_Ransom_Ransomware {
    meta:
        description = "检测 INC Ransom 勒索软件载荷"
        author = "Threat Intelligence Team"
        date = "2026-06-23"
        reference = "MITRE ATT&CK G1032 / S1139"
    strings:
        $s1 = ".inc" ascii
        $s2 = "ProcTerminator" ascii
        $s3 = "VeeamCreds" ascii
        $s4 = "vssadmin delete shadows" ascii
        $s5 = "CryptStringToBinaryA" ascii
        $s6 = "MEGAcmd" ascii
        $hex1 = { 48 89 5C 24 08 48 89 6C 24 10 48 89 74 24 18 }
    condition:
        3 of ($s*) and $hex1
}
```

---

## 十、风险评估矩阵

| 风险维度 | 评分 | 说明 |
|----------|------|------|
| **加密强度** | 9/10 | Rust 重写 + AES + Curve25519，逆向分析极难 |
| **传播能力** | 8/10 | RaaS 模式 + GootLoader IAB + LockBit/BlackCat 流离附属 |
| **规避能力** | 9/10 | Rust 二进制、部分加密、ProcTerminator、DLL 侧加载 |
| **数据泄露威胁** | 9/10 | 双重泄露站（TOR + Clearnet）+ "打电话给律师"策略 |
| **基础设施韧性** | 8/10 | 源码分散出售后衍生家族持续活跃 |
| **恢复可能性** | 8/10 | 独立出现、持续招募、无单一打击点 |
| **综合风险** | **🔴 极高** | 2025-2026年最活跃勒索组织之一，无道德底线 |

---

## 十二、缓解建议

### 12.1 即时行动

1. **检查 IOC**：对照第八节 IOC 列表扫描环境，特别关注仿冒 HR/SSO 域名
2. **GootLoader 检测**：部署针对 SEO 投毒下载器的检测规则
3. **Citrix 修补**：立即修复 CVE-2023-3519（NetScaler ADC/Gateway）
4. **Veeam 安全**：审计 Veeam Backup 凭证存储，启用额外保护

### 12.2 短期加固

1. **强制 MFA**：所有远程访问（RDP/VPN）启用多因素认证
2. **网络分段**：隔离关键资产（备份系统、域控制器、Veeam 服务器）
3. **限制远程工具**：审计并限制 AnyDesk/TightVNC 等远程桌面工具使用
4. **备份验证**：确认离线/不可变备份的完整性和可恢复性

### 12.3 长期策略

1. **零信任架构**：实施网络分段和最小权限原则
2. **供应链安全**：监控 GootLoader 等 SEO 投毒工具链
3. **威胁狩猎**：定期针对 INC Ransom TTPs 进行主动狩猎
4. **RaaS 生态监控**：关注 Lynx/Sinobi 等衍生家族动态

### 12.4 解密恢复路径

| 维度 | 详情 |
|------|------|
| **解密器状态** | **无公开解密工具** |
| **加密强度** | AES-128-CTR + Curve25519（Rust 实现），密码学强度极高 |
| **部分加密** | 理论上部分加密文件可能通过文件恢复工具还原部分数据 |
| **建议** | 优先从备份恢复；联系 FBI IC3（ic3.gov）报告事件；咨询专业数据恢复服务 |

> **注意**：INC Ransom 持续活跃且无道德底线。如遭遇攻击，应立即联系 FBI 当地外勤站，不建议直接支付赎金。

---

## 十三、核心建议

1. **无底线威胁**：INC Ransom 打破了勒索组织的"道德准则"——不攻击医疗、教育和政府的非正式规则。所有行业均需将其视为最高优先级威胁
2. **源码扩散效应**：$300K 源码出售催生了 Lynx 和 Sinobi，证明勒索软件源码商业化正在加速威胁生态的碎片化和多样化
3. **GootLoader 供应链**：Storm-0494 通过 SEO 投毒提供初始访问的分工模式，使 INC 无需自行处理高风险的初始入侵阶段
4. **Rust 重写趋势**：INC 的 Rust 重写代表了勒索软件工程的最新方向——内存安全、跨平台统一、逆向难度极大，防御者需更新检测能力
5. **Veeam 成为目标**：INC 开发了专门针对 Veeam Backup 新版 salted DPAPI 加密的凭证窃取工具，备份系统本身成为攻击目标

---

## 附录

### 附录 A：信息来源

| 编号 | 来源 | 日期 |
|------|------|------|
| [1] | MITRE ATT&CK: G1032 - INC Ransom | 2024.06 创建，2024.10 更新 |
| [2] | MITRE ATT&CK: S1139 - INC Ransomware | 2024.06 创建，2024.10 更新 |
| [3] | Acronis TRU: Evolution of INC Ransomware | 2026.06.17 |
| [4] | Unit 42: Lynx Ransomware - A Rebranding of INC | 2024.10.10 |
| [5] | Trend Micro: Ransomware Spotlight - INC | 2024.10.29 |
| [6] | Halcyon: INC Ransom Threat Group Profile | 2025.09.29 |
| [7] | SOCRadar: Top 10 Ransomware Groups of 2025 | 2026.01.06 |
| [8] | Blackpoint Cyber: INC Ransom Threat Profile | 2025 |
| [9] | Secureworks: GOLD IONIC Deploys INC Ransomware | 2024 |
| [10] | Huntress: Investigating INC Ransom Group Activity | 2023.08.11 |
| [11] | Cybereason: Threat Alert - INC Ransomware | 2023.11.20 |
| [12] | Breached Company: INC Ransom Analysis | 2025.11.23 |
| [13] | Anvilogic: Vanilla Tempest Ransomware Techniques | 2024.09.26 |

### 附录 B：术语表

| 术语 | 定义 |
|------|------|
| **RaaS** | Ransomware-as-a-Service，勒索软件即服务 |
| **IAB** | Initial Access Broker，初始访问经纪人 |
| **GootLoader** | 通过 SEO 投毒分发的初始访问下载器 |
| **GOLD IONIC** | Secureworks/MITRE 对 INC Ransom 操作者的追踪代号 |
| **Vanilla Tempest** | Microsoft 追踪代号（原 DEV-0832 / Vice Society），INC 附属机构 |
| **Storm-0494** | Microsoft 追踪的 IAB，提供 GootLoader 初始访问 |
| **部分加密** | 仅加密文件部分内容（可配置百分比/间隔），加速加密过程 |
| **ProcTerminator** | 用于终止安全软件进程的黑客工具 |
| **双重勒索** | 数据加密 + 数据泄露威胁的组合勒索模式 |

### 附录 C：追踪计划

| 维度 | 说明 |
|------|------|
| **组织状态** | 活跃（2026年持续添加受害者） |
| **衍生家族** | 监控 Lynx、Sinobi 及其他源码衍生变体 |
| **附属动态** | 关注 Vanilla Tempest 及其他附属机构载荷切换 |
| **TTPs 监控** | Rust 变体检测、Veeam 凭证窃取工具演化 |
| **源码扩散** | 监控更多基于 INC 源码的新勒索软件家族 |
| **解密工具** | 关注是否有公开解密工具发布 |
