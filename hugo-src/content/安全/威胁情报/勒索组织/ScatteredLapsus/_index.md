---
title: "Scattered Lapsus$ Hunters"
weight: 23
---

**报告编号**: TIR-2026-0701-023 | **分类等级**: TLP:AMBER | **发布日期**: 2026年7月1日 | **情报来源**: 多源交叉验证（OSINT + SOCRadar 2025 Top 10 + Microsoft + CrowdStrike + SentinelOne + Darktrace + The DFIR Report + Halcyon Q2-2025）

---

## 一、执行摘要

**Scattered Lapsus$ Hunters**（又称 SL Hunters、Octo Tempest 联盟）是2025年SOCRadar评选的**全球第1大勒索威胁**，由 **Scattered Spider**（Octo Tempest）+ **LAPSUS$** + **ShinyHunters** 三大组织组成的**情境性联盟**。该联盟并非正式合并，而是基于共同目标和互补能力的**松散协作网络**，以**纯社会工程攻击**和**身份为中心**的攻击策略著称。

<!--more-->

该联盟最显著的成就是对 **Jaguar Land Rover (JLR)** 的攻击——造成 **£19亿（约$24亿）** 经济损失，是 **G7 经济体中有记录以来经济损失最严重的网络攻击**。2025年4-6月，该联盟联合 **DragonForce** 对英国多家知名零售商（哈罗德百货、玛莎百货、合作社）发动高调攻击。2026年初，该联盟以**更结构化的运营模式**重新活跃。

### 关键发现

| 维度 | 关键指标 |
|------|----------|
| **组织规模** | 三大组织联盟（Scattered Spider + LAPSUS$ + ShinyHunters） |
| **排名** | SOCRadar 2025 全球第1大勒索威胁 |
| **首要目标** | 大型企业（零售/汽车/科技/金融） |
| **攻击策略** | **纯社会工程**（无恶意软件、无漏洞利用） |
| **核心能力** | 身份为中心、SaaS/Salesforce 环境入侵 |
| **重大事件** | JLR £19亿损失（G7最严重网络攻击）、英国零售攻击 |
| **关联组织** | DragonForce（初始访问合作）、The Com（松散关联） |
| **自研工具** | ShinySp1d3r（RaaS 勒索工具） |
| **解密可能性** | **不存在**（无公开解密工具） |
| **当前状态** | **活跃**（2026年初重新活跃） |

### 威胁等级评估

| 评估维度 | 等级 | 说明 |
|----------|------|------|
| **技术能力** | 🔴 极高 | 纯社会工程、SaaS 入侵、ShinySp1d3r 自研工具 |
| **运营成熟度** | 🔴 极高 | 三大组织联盟、情境性协作、结构化运营 |
| **攻击规模** | 🔴 极高 | JLR £19亿损失、英国零售高调攻击 |
| **目标针对性** | 🔴 极高 | 全球顶级品牌（Harrods/M&S/Co-op/JLR） |
| **数据泄露风险** | 🔴 极高 | 纯数据勒索 + SaaS 环境深度入侵 |

---

## 二、威胁行为者画像

### 2.1 组织标识

| 属性 | 值 |
|------|-----|
| **官方名称** | Scattered Lapsus$ Hunters（SL Hunters） |
| **别名** | Octo Tempest（Microsoft）、Scattered Spider + LAPSUS$ + ShinyHunters 联盟 |
| **组织类型** | 情境性联盟（非正式合并） |
| **活跃周期** | 2025年 – 至今（2026年初重新活跃） |
| **地理归属** | 多国（英国/美国/巴西/东欧成员） |
| **攻击目标** | 全球大型企业 |
| **动机** | 经济利益 + 声誉 |

### 2.2 三大组成组织

```
┌──────────────────────────────────────────────────────┐
│       Scattered Lapsus$ Hunters 联盟结构              │
├──────────────────────────────────────────────────────┤
│                                                        │
│  ┌─────────────────┐  ┌─────────────────┐            │
│  │ Scattered Spider │  │   LAPSUS$       │            │
│  │（Octo Tempest）   │  │（2022年活跃）   │            │
│  │ 社会工程专家      │  │ 内部人员招募    │            │
│  │ SaaS/Salesforce  │  │ 电信/科技重点    │            │
│  └────────┬────────┘  └────────┬────────┘            │
│           │                     │                      │
│           └──────────┬──────────┘                      │
│                      │                                  │
│              ┌───────┴───────┐                         │
│              │ ShinyHunters  │                         │
│              │（数据窃取专家）│                         │
│              │ 大规模数据外泄│                         │
│              └───────────────┘                         │
│                                                        │
│  联盟特征：                                            │
│  ├── 非正式合并，情境性协作                            │
│  ├── 能力互补：社会工程 + 内部人员 + 数据窃取          │
│  ├── 共同目标：高价值大型企业                          │
│  └── 松散结构，成员可独立行动                          │
│                                                        │
└──────────────────────────────────────────────────────┘
```

---

## 三、归因分析

### 3.1 地理归属

| 证据类型 | 详情 | 置信度 |
|----------|------|--------|
| **Scattered Spider** | 英语母语，美国/英国成员 | 高 |
| **LAPSUS$** | 巴西/英国青少年成员（2022年逮捕） | 高 |
| **ShinyHunters** | 多国成员，俄语地区关联 | 中-高 |
| **The Com** | 松散关联的威胁行为者集体 | 中 |

---

## 四、技术能力评估

### 4.1 纯社会工程攻击

```
┌──────────────────────────────────────────────────────┐
│       Scattered Lapsus$ Hunters 攻击策略              │
├──────────────────────────────────────────────────────┤
│                                                        │
│  传统勒索组织：                                        │
│  恶意软件 / 漏洞利用 → 初始访问                        │
│                                                        │
│  SL Hunters 模式：                                     │
│  纯社会工程（无恶意软件、无漏洞利用）                   │
│         ↓                                              │
│  1. 电话/邮件冒充 IT 支持 / 高管                       │
│         ↓                                              │
│  2. 诱导员工重置凭证 / 安装远程工具                     │
│         ↓                                              │
│         ↓                                              │
│  4. 横向移动至 SaaS 环境（Salesforce/Office 365）      │
│         ↓                                              │
│  5. 数据窃取 + 勒索                                    │
│                                                        │
│  核心优势：                                            │
│  ├── 无恶意文件，端点检测完全失效                      │
│  ├── 无漏洞利用，补丁管理无效                          │
│  ├── 合法凭证，行为类似正常用户                        │
│  └── SaaS 环境深度入侵，传统网络分段无效               │
│                                                        │
└──────────────────────────────────────────────────────┘
```

### 4.2 ShinySp1d3r 自研工具

| 属性 | 值 |
|------|-----|
| **工具名称** | ShinySp1d3r |
| **类型** | 自研 RaaS 勒索工具 |
| **功能** | 数据加密 + 泄露管理 |
| **意义** | 从纯数据勒索向加密勒索的能力跃升 |

---

## 五、攻击链分析

### 5.1 初始访问

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **电话社会工程** | T1566.004 | 冒充 IT 支持/高管电话 |
| **凭证重置** | T1566 | 诱导员工重置凭证 |
| **远程工具安装** | T1219 | 诱导安装 AnyDesk/ScreenConnect |
| **内部人员** | T1078 | LAPSUS$ 招募内部人员 |

### 5.2 执行与持久化

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **合法凭证** | T1078 | 直接使用合法凭证登录 |
| **SaaS 环境** | T1078 | Salesforce/Office 365 深度入侵 |
| **合法工具** | T1219 | AnyDesk/ScreenConnect 远程访问 |

### 5.3 凭证窃取

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **社会工程** | T1566 | 电话/邮件诱导凭证重置 |
| **会话劫持** | T1528 | 窃取活跃会话令牌 |
| **内部人员** | T1078 | 内部人员提供凭证 |

### 5.4 横向移动

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **SaaS 横向** | T1078 | Salesforce/Office 365 环境横向 |
| **API 滥用** | T1106 | SaaS API 横向移动 |
| **SSO 滥用** | T1528 | 单点登录令牌滥用 |

### 5.5 数据外传

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **SaaS 导出** | T1537 | SaaS 环境数据导出 |
| **API 外传** | T1048 | SaaS API 数据外传 |
| **云存储** | T1567 | 云存储外传 |

### 5.6 防御规避与影响

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **无恶意软件** | T1078 | 纯社会工程，端点检测失效 |
| **合法凭证** | T1078 | 行为类似正常用户 |
| **SaaS 环境** | T1078 | 传统网络分段无效 |
| **数据加密** | T1486 | ShinySp1d3r 加密工具 |
| **数据泄露** | T1486 | 双重勒索施压 |

---

## 六、受害者分析

### 6.1 重大攻击事件

| 时间 | 受害者 | 影响 |
|------|--------|------|
| 2025.04-06 | Harrods / M&S / Co-op（英国零售） | 联合 DragonForce 高调攻击 |
| 2025 | Jaguar Land Rover (JLR) | **£19亿损失**（G7最严重网络攻击） |
| 2026初 | 多家大型企业 | 更结构化运营模式重新活跃 |

### 6.2 行业分布

| 行业 | 优先级 | 说明 |
|------|--------|------|
| **零售** | 🔴 极高 | Harrods/M&S/Co-op |
| **汽车** | 🔴 极高 | JLR（£19亿损失） |
| **科技** | 🔴 高 | SaaS/云服务提供商 |
| **电信** | 🔴 高 | LAPSUS$ 传统目标 |
| **金融** | 🟠 高 | 金融机构 |
| **游戏** | 🟠 高 | 游戏公司 |

---

## 七、联盟运营模式分析

### 7.1 能力互补

| 组织 | 核心能力 | 贡献 |
|------|----------|------|
| **Scattered Spider** | 社会工程、SaaS 入侵 | 初始访问、身份入侵 |
| **LAPSUS$** | 内部人员招募 | 内部凭证、深度访问 |
| **ShinyHunters** | 大规模数据窃取 | 数据外泄、泄露管理 |

### 7.2 与 DragonForce 合作

```
┌──────────────────────────────────────────────────────┐
│       SL Hunters + DragonForce 合作模式               │
├──────────────────────────────────────────────────────┤
│                                                        │
│  Scattered Lapsus$ Hunters：                           │
│  ├── 纯社会工程获取初始访问                            │
│  ├── 身份为中心入侵 SaaS 环境                          │
│  └── 提供合法凭证和深度访问                            │
│                                                        │
│  DragonForce：                                         │
│  ├── 部署勒索软件载荷                                  │
│  ├── 加密和数据泄露管理                                │
│  └── 谈判和赎金收取                                    │
│                                                        │
│  合作案例：                                            │
│  └── 2025.04-06 英国零售攻击（Harrods/M&S/Co-op）     │
│                                                        │
└──────────────────────────────────────────────────────┘
```

---

## 八、IOC 完整列表

### 8.1 网络指标

| 类型 | 值 | 说明 |
|------|-----|------|
| **工具** | ShinySp1d3r | 自研 RaaS 勒索工具 |
| **工具** | AnyDesk / ScreenConnect | 合法远程工具滥用 |
| **平台** | Salesforce / Office 365 | SaaS 环境入侵 |
| **策略** | 纯社会工程 | 无恶意软件、无漏洞利用 |

### 8.2 行为指标

- 异常凭证重置请求
- 非工作时间 SaaS 环境登录
- 异常 API 调用模式
- SaaS 数据批量导出
- 远程工具（AnyDesk/ScreenConnect）异常安装

### 8.3 攻击工具链

```
电话/邮件社会工程（冒充 IT/高管）
    ↓
诱导凭证重置 / 远程工具安装
    ↓
合法凭证登录（SaaS/Office 365/Salesforce）
    ↓
SaaS 环境横向移动（API/SSO 滥用）
    ↓
ShinyHunters 数据窃取（SaaS 导出/API 外传）
    ↓
DragonForce 部署勒索软件（联合攻击）
    ↓
ShinySp1d3r 加密 + 数据泄露威胁
```

---

## 九、检测规则

### 9.1 Sigma 规则

#### 规则 1：异常凭证重置

```yaml
title: SL Hunters - Anomalous Password Reset
id: slh001-password-reset
status: experimental
description: 检测异常凭证重置行为（可能的社会工程攻击）
logsource:
  category: authentication
  product: windows
detection:
  selection:
    EventID: 4724  # 密码重置尝试
  timeframe: 5m
  condition: selection | count() > 3
level: high
tags:
  - attack.credential_access
  - attack.t1566
```

#### 规则 2：SaaS 异常登录

```yaml
title: SL Hunters - Anomalous SaaS Login
id: slh002-saas-login
status: experimental
description: 检测 SaaS 环境异常登录行为
logsource:
  category: authentication
  product: office365
detection:
  selection:
    ResultType: 0  # 成功登录
    Location|contains:  # 异常地理位置
      - 'Unknown'
  condition: selection
level: high
tags:
  - attack.initial_access
  - attack.t1078
```

#### 规则 3：远程工具异常安装

```yaml
title: SL Hunters - Remote Tool Installation
id: slh003-remote-tool
status: experimental
description: 检测远程管理工具异常安装
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|endswith:
      - '\AnyDesk.exe'
      - '\ScreenConnect.exe'
  filter:
    ParentImage|endswith:
      - '\msiexec.exe'
      - '\setup.exe'
  condition: selection and not filter
level: high
tags:
  - attack.execution
  - attack.t1219
```

### 9.2 YARA 规则

```yara
rule ShinySp1d3r_Ransomware {
    meta:
        description = "检测 ShinySp1d3r 勒索工具"
        author = "Threat Intelligence Team"
        date = "2026-07-01"
        reference = "Scattered Lapsus$ Hunters"
    strings:
        $s1 = "ShinySp1d3r" ascii
        $s2 = "ShinyHunters" ascii
        $s3 = "vssadmin delete shadows" ascii
        $hex1 = { 48 89 5C 24 08 48 89 6C 24 10 48 89 74 24 18 }
    condition:
        2 of ($s*) and $hex1
}
```

---

## 十、风险评估矩阵

| 风险维度 | 评分 | 说明 |
|----------|------|------|
| **技术能力** | 10/10 | 纯社会工程 + SaaS 入侵 + 自研工具 |
| **传播能力** | 9/10 | 三大组织联盟，能力互补 |
| **规避能力** | 10/10 | 无恶意软件、无漏洞利用、合法凭证 |
| **数据泄露威胁** | 10/10 | SaaS 深度入侵 + 大规模数据窃取 |
| **目标价值** | 10/10 | JLR £19亿、Harrods/M&S/Co-op |
| **综合风险** | **🔴 极高** | SOCRadar 2025 #1 + G7最严重网络攻击 |

---

## 十一、缓解建议

### 11.1 即时行动

1. **社会工程防护**：培训员工识别冒充 IT/高管的电话/邮件
2. **凭证重置验证**：实施二次验证流程
3. **远程工具审计**：审计 AnyDesk/ScreenConnect 安装

### 11.2 短期加固

1. **强制 MFA**：所有 SaaS 环境（Salesforce/Office 365）
2. **会话管理**：限制会话令牌生命周期
3. **SaaS 监控**：监控异常 API 调用和数据导出

### 11.3 长期策略

1. **零信任架构**：基于身份的持续验证
2. **身份安全**：部署身份威胁检测
3. **安全意识**：定期社会工程演练

### 11.4 解密恢复路径

| 维度 | 详情 |
|------|------|
| **解密器状态** | **无公开解密工具** |
| **攻击特点** | 纯社会工程，SaaS 环境深度入侵 |
| **建议** | 优先从备份恢复；联系执法部门 |

---

## 十二、核心建议

1. **社会工程是最大威胁**：SL Hunters 证明纯社会工程（无恶意软件、无漏洞利用）可以攻破全球顶级企业
2. **身份为中心**：攻击核心是身份入侵，传统端点防护和补丁管理完全无效
3. **SaaS 环境风险**：Salesforce/Office 365 等 SaaS 环境成为主要攻击面
4. **JLR 案例警示**：£19亿损失证明社会工程攻击的经济影响可超过传统漏洞利用
5. **联盟威胁**：三大组织联盟的能力互补使威胁更加复杂，防御需全面覆盖

---

## 十三、附录

### 附录 A：信息来源

| 编号 | 来源 | 日期 |
|------|------|------|
| [1] | SOCRadar: Top 10 Ransomware Groups 2025 | 2026.01 |
| [2] | Microsoft: Octo Tempest Analysis | 2025 |
| [3] | CrowdStrike: Scattered Spider TTPs | 2025 |
| [4] | SentinelOne: SL Hunters Research | 2025 |
| [5] | Darktrace: JLR Attack Analysis | 2025 |
| [6] | The DFIR Report: UK Retail Attacks | 2025 |
| [7] | Halcyon: Q2-2025 Power Rankings | 2025 |

### 附录 B：术语表

| 术语 | 定义 |
|------|------|
| **Scattered Spider** | 社会工程专家，Microsoft 追踪代号 Octo Tempest |
| **LAPSUS$** | 2022年活跃的勒索组织，以内部人员招募著称 |
| **ShinyHunters** | 大规模数据窃取专家 |
| **ShinySp1d3r** | SL Hunters 自研 RaaS 勒索工具 |
| **情境性联盟** | 非正式合并，基于共同目标的松散协作 |

### 附录 C：追踪计划

| 维度 | 说明 |
|------|------|
| **组织状态** | 活跃（2026年初重新活跃） |
| **联盟演化** | 监控三大组织协作深化 |
| **DragonForce 合作** | 关注联合攻击趋势 |
| **SaaS 威胁** | 监控 SaaS 环境入侵趋势 |
| **解密工具** | 关注是否有公开解密工具发布 |
