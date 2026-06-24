---
title: "Medusa"
weight: 14
---

**报告编号**: TIR-2026-0624-014 | **分类等级**: TLP:AMBER | **发布日期**: 2026年6月24日 | **情报来源**: 多源交叉验证（OSINT + CISA/FBI AA25-071A + MITRE ATT&CK G1051 + Symantec/Carbon Black + Darktrace + Check Point + Armis Labs + Huntress + SecurityScorecard + Unit 42）

---

## 一、执行摘要

**Medusa** 是2021年6月首次被识别的勒索软件即服务（RaaS）组织，追踪代号为 **Storm-1175**（Microsoft）、**Spearwing**（Symantec）、**G1051**（MITRE ATT&CK）。该组织在2022年底至2023年初从封闭式运营转型为 RaaS 模式后，通过招募附属机构大幅扩展了攻击规模。截至2026年1月，已有超过 **500 个组织**成为 Medusa 的受害者，遍布全球 **45 个以上国家和地区**。

<!--more-->

Medusa 的核心特征在于其**三重勒索模式**（数据加密 + 数据泄露威胁 + DDoS/客户联络施压）、对**合法 RMM 工具的大规模滥用**（SimpleHelp、AnyDesk、MeshAgent、ConnectWise），以及**国家级行为者的介入**——2025年末至2026年初，朝鲜 **Lazarus 组织**（Stonefly/Andariel 子组织）被发现使用 Medusa 勒索软件攻击美国医疗保健部门。2025年3月12日，CISA 和 FBI 联合发布专项安全通告 AA25-071A。

### 关键发现

| 维度 | 关键指标 |
|------|----------|
| **组织规模** | 500+ 受害者，45+ 国家和地区 |
| **首要目标** | 美国、加拿大、澳大利亚、德国、意大利、英国 |
| **加密方式** | AES + RSA 混合加密；`.MEDUSA` 扩展名 |
| **首要入口** | IAB 购买（$100-$100万）、CVE 利用（ConnectWise/Fortinet/Exchange）、钓鱼 |
| **商业模式** | RaaS（核心控制谈判 + 附属执行攻击） |
| **关联组织** | Storm-1175、Spearwing、Frozen Spider、UNC7885、Lazarus（Stonefly/Andariel） |
| **谈判平台** | MedusaChat（TOR 门户） |
| **赎金范围** | $10万 - $1,500万，平均约 $26万 |
| **解密可能性** | **不存在**（无公开解密工具） |
| **当前状态** | **活跃**（2026年持续攻击，朝鲜 Lazarus 介入） |

### 威胁等级评估

| 评估维度 | 等级 | 说明 |
|----------|------|------|
| **技术能力** | 🔴 极高 | 多平台变体（Windows/Linux/ESXi）、BYOVD、RMM 工具滥用 |
| **运营成熟度** | 🔴 极高 | RaaS 模式、MedusaChat 谈判平台、三重勒索 |
| **攻击规模** | 🔴 极高 | 500+ 受害者，45+ 国家，CISA/FBI 联合通告 |
| **目标针对性** | 🔴 极高 | 医疗、教育、金融、政府——无差别攻击 |
| **数据泄露风险** | 🔴 极高 | 三重勒索 + DDoS + 客户联络施压 |

---

## 二、威胁行为者画像

### 2.1 组织标识

| 属性 | 值 |
|------|-----|
| **官方名称** | Medusa |
| **别名** | Storm-1175（Microsoft）、Spearwing（Symantec）、G1051（MITRE ATT&CK） |
| **组织类型** | RaaS（核心控制谈判 + 附属执行攻击） |
| **活跃周期** | 2021年6月 – 至今（RaaS 模式：2022年底至今） |
| **主要语言** | 英语（勒索信/谈判）、俄语（内部通信，RAMP 论坛） |
| **地理归属** | 俄语地区（高置信度）；CIS 目标排除规则 |
| **攻击目标** | 全球（美国为主要目标） |
| **动机** | 经济利益 |

### 2.2 组织演化时间线

```
2021.06    Medusa 勒索软件首次被识别
           封闭式运营，所有攻击由同一团队执行
    ↓
2022.Q4    转型为 RaaS 模式
           开始招募附属机构
           攻击规模大幅扩展
    ↓
2023       利用 CVE-2023-48788（Fortinet EMS）
           CVE-2021-34473（Exchange ProxyShell）
           大规模攻击活动展开
    ↓
2024       利用 CVE-2024-1709（ConnectWise ScreenConnect）
           CVE-2025-10035（Fortra GoAnywhere MFT）
           500+ 受害者，45+ 国家
    ↓
2025.03.12 CISA/FBI 联合发布 AA25-071A 安全通告
           成为 Top 10 最活跃勒索组织
    ↓
2025.Q4    朝鲜 Lazarus（Stonefly/Andariel）介入
           使用 Medusa 攻击美国医疗保健部门
    ↓
2026       500+ 受害者
           RMM 工具滥用趋势加剧（SimpleHelp C2 持续20天+）
           2026 世界杯安全威胁上升
```

---

## 三、归因分析

### 3.1 地理归属

| 证据类型 | 详情 | 置信度 |
|----------|------|--------|
| **语言分析** | 攻击脚本使用西里尔字母 | 高 |
| **论坛活动** | 在 RAMP（俄语暗网论坛）活跃 | 高 |
| **俚语特征** | 使用俄罗斯犯罪亚文化特有俚语 | 高 |
| **排除规则** | 不攻击 CIS（独联体）国家目标 | 高 |
| **CISA/FBI 评估** | AA25-071A 归因于俄语地区行为者 | 高 |

### 3.2 关联组织网络

```
┌──────────────────────────────────────────────────────┐
│           Medusa 关联组织网络                          │
├──────────────────────────────────────────────────────┤
│                                                        │
│  ┌─────────────────┐                                  │
│  │ Medusa 核心      │ Storm-1175 / G1051              │
│  │（RaaS 提供者）    │ 控制谈判、开发加密工具           │
│  └────────┬────────┘                                  │
│           │                                            │
│           ├──→ 附属机构                                │
│           │    ├── IAB 网络（$100-$100万/次）          │
│           │    └── 暗网招募（RAMP 论坛）               │
│           │                                            │
│           ├──→ Frozen Spider（大型猎物狩猎组织）       │
│           │    关联合作                                 │
│           │                                            │
│           ├──→ UNC7885（网络犯罪组织）                 │
│           │    合作关系                                 │
│           │                                            │
│           └──→ Lazarus / Stonefly / Andariel（朝鲜）   │
│                2025年末起使用 Medusa 载荷              │
│                针对美国医疗保健部门                     │
│                                                        │
└──────────────────────────────────────────────────────┘
```

### 3.3 朝鲜 Lazarus 介入

2025年末至2026年初，朝鲜国家支持的 Lazarus 组织被发现使用 Medusa 勒索软件：

| 属性 | 详情 |
|------|------|
| **子组织** | Stonefly / Andariel |
| **攻击目标** | 美国医疗保健部门 |
| **攻击时间** | 2025年11月至今 |
| **受害数量** | 至少4家美国医疗和非营利组织 |
| **工具集** | Comebacker（后门）、Blindingcan（RAT）、ChromeStealer、Mimikatz、Infohook |
| **平均赎金** | 约26万美元 |

---

## 四、技术能力评估

### 4.1 加密方案

| 属性 | 值 |
|------|-----|
| **对称加密** | AES |
| **非对称加密** | RSA |
| **加密模式** | AES + RSA 混合加密 |
| **多平台** | Windows（gaze.exe）+ Linux ARM + Linux x86-64 |
| **文件扩展名** | `.MEDUSA` |
| **勒索信** | `!!!READ_ME_MEDUSA!!!.txt` |
| **核心载荷** | `gaze.exe`（Windows） |

### 4.2 三重勒索机制

```
┌─────────────────────────────────────────────────┐
│         Medusa 三重勒索模型                       │
├─────────────────────────────────────────────────┤
│                                                   │
│  第一层：数据加密                                 │
│  ├── AES + RSA 混合加密                           │
│  ├── .MEDUSA 扩展名                               │
│  ├── 终止安全服务和备份进程                        │
│  └── 删除卷影副本                                 │
│                                                   │
│  第二层：数据泄露威胁                              │
│  ├── Rclone 外传至 Medusa C2                      │
│  ├── MedusaChat 谈判平台                          │
│  └── 威胁公开泄露被盗数据                         │
│                                                   │
│  第三层：额外施压                                  │
│  ├── 对受害者公共基础设施发动 DDoS 攻击           │
│  ├── 联系受害者客户施加商业压力                    │
│  └── 媒体公开羞辱                                 │
│                                                   │
└─────────────────────────────────────────────────┘
```

### 4.3 RMM 工具滥用

Medusa 大规模滥用合法远程监控和管理（RMM）工具，模糊了恶意活动与正常管理的边界：

| 工具 | 用途 | 检测难度 |
|------|------|----------|
| **SimpleHelp** | 持久化 C2（持续20天+）、横向移动、数据窃取 | 极高 |
| **AnyDesk** | 远程桌面访问 | 高 |
| **MeshAgent** | 远程管理 | 极高 |
| **ConnectWise** | 远程监控和管理 | 高 |

---

## 五、攻击链分析

### 5.1 初始访问

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **IAB 购买** | T1650 | 从初始访问经纪人购买（$100-$100万） |
| **漏洞利用** | T1190 | CVE-2024-1709（ConnectWise）、CVE-2023-48788（Fortinet EMS）、CVE-2021-34473（ProxyShell） |
| **钓鱼攻击** | T1566 | 鱼叉式钓鱼邮件窃取凭证 |
| **外部远程服务** | T1133 | 使用被盗 RDP 凭证 |

### 5.2 执行与持久化

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **RMM 工具** | T1219 | SimpleHelp/AnyDesk/MeshAgent/ConnectWise 持久化 |
| **计划任务** | T1053 | 恶意计划任务（命名 svhost），每15分钟重新执行 |
| **注册表启动键** | T1547.001 | HKLM Run 键自启动 |
| **后门账户** | T1136 | 创建本地后门账户 |
| **UAC 绕过** | T1548.002 | cmstp.exe + COM 接口 |

### 5.3 横向移动与发现

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **RDP** | T1021.001 | 远程桌面协议横向移动 |
| **VNC** | T1021.005 | 虚拟网络计算 |
| **PsExec** | T1570 | 远程执行工具 |
| **PDQ Deploy** | T1570 | 合法软件部署工具滥用 |
| **Mimikatz** | T1003.001 | LSASS 内存凭证提取 |
| **Advanced IP Scanner** | T1046 | 网络资产枚举 |
| **SoftPerfect** | T1046 | 网络扫描 |

### 5.4 数据外传

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **Rclone** | T1567.002 | 外传至 Medusa C2 服务器 |
| **RoboCopy** | T1074 | 数据暂存和转移 |
| **filemail.com** | T1048 | 文件托管服务传输载荷 |

### 5.5 防御规避与影响

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **BYOVD** | T1068 | 自带易受攻击驱动程序终止安全进程 |
| **KillAV 工具** | T1562.001 | 终止 EDR/杀毒进程 |
| **PowerShell 混淆** | T1027 | Base64 编码命令执行 |
| **进程伪装** | T1036.005 | 匹配合法系统进程名称 |
| **删除卷影副本** | T1490 | wmic shadowcopy delete |
| **gaze.exe 载荷** | T1486 | 终止安全服务 + 加密文件 + 投放勒索信 |

---

## 六、受害者分析

### 6.1 规模与地理分布

| 指标 | 值 |
|------|-----|
| **确认受害者** | 500+（截至2026年1月） |
| **覆盖国家** | 45+ 个国家和地区 |
| **首要国家** | 美国、加拿大、澳大利亚 |
| **其他目标** | 德国、意大利、英国 |

### 6.2 行业分布

| 行业 | 优先级 | 典型案例 |
|------|--------|----------|
| **医疗保健** | 🔴 极高 | 美国医院、心理健康非营利组织、自闭症儿童教育机构 |
| **教育** | 🔴 高 | 明尼阿波利斯公立学区 |
| **金融服务** | 🟠 高 | Toyota Financial Services |
| **制造业** | 🟠 高 | 制造企业 |
| **政府机构** | 🟠 高 | 市政机构 |
| **法律服务** | 🟡 中 | 律师事务所 |
| **保险** | 🟡 中 | 保险公司 |

### 6.3 重大攻击事件

| 时间 | 受害者 | 影响 |
|------|--------|------|
| 2024 | Toyota Financial Services | 金融服务遭攻击 |
| 2024 | 明尼阿波利斯公立学区 | 教育系统遭攻击 |
| 2025.11+ | 美国医疗保健部门 | 朝鲜 Lazarus 使用 Medusa 攻击，至少4家组织 |
| 2025 | 心理健康非营利组织 | 敏感数据泄露 |
| 2026 | 自闭症儿童教育机构 | 特殊教育机构遭攻击 |

---

## 七、RaaS 运营模式分析

### 7.1 组织架构

```
┌──────────────────────────────────────────────────────┐
│              Medusa RaaS 架构                         │
├──────────────────────────────────────────────────────┤
│                                                        │
│  ┌──────────────────┐                                │
│  │ 核心开发团队       │ 开发加密工具                   │
│  │（Storm-1175）      │ 集中控制赎金谈判               │
│  │ 控制谈判           │ 管理 MedusaChat 平台           │
│  └────────┬─────────┘                                │
│           │                                            │
│           ├──→ 附属机构                                │
│           │    ├── IAB 网络（$100-$100万/次）          │
│           │    └── RAMP 论坛招募                       │
│           │                                            │
│           ├──→ Frozen Spider（合作）                   │
│           │                                            │
│           ├──→ UNC7885（合作）                         │
│           │                                            │
│           └──→ Lazarus / Stonefly（朝鲜，使用载荷）    │
│                                                        │
└──────────────────────────────────────────────────────┘
```

### 7.2 赎金经济

| 指标 | 值 |
|------|-----|
| **赎金范围** | $10万 - $1,500万 |
| **平均赎金** | 约 $26万 |
| **IAB 报酬** | $100 - $100万 |
| **支付方式** | 加密货币 |
| **谈判平台** | MedusaChat（TOR 门户） |

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
| **邮箱** | `press@medusaf6afzwflcz6v4zcjkusy5fuplatbm42zn7h34oawz445z7yd.onion` | 媒体/公开施压 |
| **邮箱** | `negotiations@medusaf6afzwflcz6v4zcjkusy5fuplatbm42zn7h34oawz445z7yd.onion` | 赎金谈判 |
| **邮箱** | `mediaboy666@proton.me` | 媒体联系 |
| **邮箱** | `databas3@proton.me` | 数据相关 |
| **IP** | `213.183.63[.]41` | SimpleHelp C2 服务器 |
| **文件** | `.MEDUSA` | 加密文件扩展名 |
| **文件** | `!!!READ_ME_MEDUSA!!!.txt` | 勒索信 |
| **文件** | `gaze.exe` | 核心载荷（Windows） |
| **文件** | `svhost`（计划任务名） | 恶意计划任务 |

### 8.2 文件哈希

| 类型 | 哈希值 | 描述 |
|------|--------|------|
| SHA256 | `806801c32d84340e9853e5401f0632711e42454c1044006938d5d0255d4723b6` | Windows 打包器/加载器 |
| SHA256 | `78b92ccd64cbd6602a8e6d258d88378332994c78d1b680179a117736028cfff5` | Linux ARM 二进制 |
| SHA256 | `7f263d43bc91a0023aaf19f118961dee4456a1493847c36c347c1b1a94d65f7a` | Linux x86-64 二进制 |
| SHA256 | `f0c6059287ae18278a532228b8551573376921334ecfd067435af55456d3f4dc` | Linux ELF 二进制 |
| SHA256 | `51980fd54305081f339d2f40317ff76a62eb28239d6d66f8410f10b41069de72` | Linux ELF 二进制 |

### 8.3 被利用漏洞

| CVE | 影响组件 | 说明 |
|-----|----------|------|
| CVE-2024-1709 | ConnectWise ScreenConnect | RMM 认证绕过 |
| CVE-2023-48788 | Fortinet EMS | SQL 注入 |
| CVE-2021-34473 | Microsoft Exchange | ProxyShell |
| CVE-2025-10035 | Fortra GoAnywhere MFT | License Servlet 漏洞 |
| CVE-2024-57726/27/28 | SimpleHelp | 远程支持软件漏洞 |

### 8.4 攻击工具链

```
IAB 购买 / 漏洞利用 / 钓鱼 / 被盗 RDP 凭证
    ↓
SimpleHelp / AnyDesk / MeshAgent（RMM 持久化）
    ↓
恶意计划任务 svhost（每15分钟重新执行）
    ↓
Mimikatz / LSASS 转储（凭证窃取）
    ↓
Advanced IP Scanner / SoftPerfect（网络发现）
    ↓
RDP / VNC / PsExec / PDQ Deploy（横向移动）
    ↓
Rclone + RoboCopy（数据外传）
    ↓
gaze.exe（终止安全服务 + AES+RSA 加密 + 勒索信）
    ↓
三重勒索：加密 + 数据泄露 + DDoS/客户联络
```

---

## 九、检测规则

### 9.1 Sigma 规则

#### 规则 1：Medusa gaze.exe 载荷执行

```yaml
title: Medusa Ransomware - gaze.exe Payload Execution
id: a1b2c3d4-e5f6-7890-abcd-123456789abc
status: experimental
description: 检测 Medusa 勒索软件核心载荷 gaze.exe 的执行
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|endswith: '\gaze.exe'
  condition: selection
level: critical
tags:
  - attack.impact
  - attack.t1486
```

#### 规则 2：Medusa 恶意计划任务

```yaml
title: Medusa Ransomware - Malicious Scheduled Task svhost
id: b2c3d4e5-f6a7-8901-bcde-234567890bcd
status: experimental
description: 检测 Medusa 勒索软件创建名为 svhost 的恶意计划任务
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    CommandLine|contains|all:
      - 'schtasks'
      - 'svhost'
  condition: selection
level: critical
tags:
  - attack.persistence
  - attack.t1053
```

#### 规则 3：Medusa BYOVD 驱动程序加载

```yaml
title: Medusa Ransomware - BYOVD Vulnerable Driver Loading
id: c3d4e5f6-a7b8-9012-cdef-345678901cde
status: experimental
description: 检测 Medusa 勒索软件使用 BYOVD 技术加载易受攻击驱动程序终止安全进程
logsource:
  category: driver_load
  product: windows
detection:
  selection:
    ImageLoaded|contains:
      - 'dbutil'
      - 'rtcore64'
      - 'gdrv'
    CommandLine|contains:
      - 'KillAV'
  condition: selection
level: critical
tags:
  - attack.defense_evasion
  - attack.t1068
```

### 9.2 YARA 规则

```yara
rule Medusa_Ransomware {
    meta:
        description = "检测 Medusa 勒索软件载荷"
        author = "Threat Intelligence Team"
        date = "2026-06-24"
        reference = "CISA/FBI AA25-071A / MITRE ATT&CK G1051"
    strings:
        $s1 = "!!!READ_ME_MEDUSA!!!.txt" ascii
        $s2 = ".MEDUSA" ascii
        $s3 = "gaze.exe" ascii
        $s4 = "medusaf6afzwflcz6v4zcjkusy5fuplatbm42zn7h34oawz445z7yd.onion" ascii
        $s5 = "svhost" ascii
        $s6 = "wmic shadowcopy delete" ascii
        $hex1 = { 48 89 5C 24 08 48 89 6C 24 10 48 89 74 24 18 }
    condition:
        3 of ($s*) and $hex1
}
```

---

## 十、风险评估矩阵

| 风险维度 | 评分 | 说明 |
|----------|------|------|
| **加密强度** | 8/10 | AES + RSA 混合加密，多平台变体 |
| **传播能力** | 8/10 | RaaS 模式 + IAB 网络 + Lazarus 使用 |
| **规避能力** | 8/10 | RMM 工具滥用（20天+不被发现）、BYOVD、进程伪装 |
| **数据泄露威胁** | 10/10 | 三重勒索 + DDoS + 客户联络施压 |
| **国家级关联** | 9/10 | 朝鲜 Lazarus 介入，地缘政治与经济动机交织 |
| **基础设施韧性** | 8/10 | 分布式附属网络，无单一打击点 |
| **综合风险** | **🔴 极高** | CISA/FBI 联合通告 + Lazarus 介入 + 三重勒索 |

---

## 十一、缓解建议

### 11.1 即时行动

1. **检查 IOC**：对照第八节 IOC 列表扫描环境，特别关注 `.MEDUSA` 扩展名和 `gaze.exe`
2. **RMM 审计**：全面审计 SimpleHelp、AnyDesk、MeshAgent、ConnectWise 的安装和外部连接
3. **CVE 修补**：立即修复 CVE-2024-1709（ConnectWise）、CVE-2023-48788（Fortinet EMS）等
4. **BYOVD 防护**：监控易受攻击驱动程序的加载行为

### 11.2 短期加固

1. **强制 MFA**：所有远程访问（RDP/VPN）启用多因素认证
2. **网络分段**：隔离关键资产（备份系统、域控制器）
3. **限制远程工具**：审计并限制未经授权的 RMM 工具使用
4. **备份验证**：确认离线/不可变备份的完整性和可恢复性

### 11.3 长期策略

1. **零信任架构**：实施基于身份的微分段和持续验证
2. **驱动程序白名单**：实施驱动程序签名验证和白名单策略
3. **威胁狩猎**：基于本报告 IOCs 和 TTPs 进行主动威胁狩猎
4. **事件响应计划**：制定并定期演练勒索软件事件响应流程

### 11.4 解密恢复路径

| 维度 | 详情 |
|------|------|
| **解密器状态** | **无公开解密工具** |
| **加密强度** | AES + RSA 混合加密，密码学强度极高 |
| **建议** | 优先从备份恢复；联系 FBI IC3（ic3.gov）报告事件 |

> **注意**：Medusa 与朝鲜 Lazarus 组织的关联使威胁性质从纯经济犯罪升级为地缘政治威胁。如遭遇攻击，应立即联系 CISA 和 FBI。

---

## 十二、核心建议

1. **RMM 工具治理**：Medusa 通过合法 RMM 工具维持 C2 连接长达20天以上，组织必须建立 RMM 工具的全面审计和监控机制
2. **三重勒索防御**：Medusa 的三重施压（加密 + 泄露 + DDoS/客户联络）使不支付赎金的代价极高，需提前制定应对策略
3. **Lazarus 介入**：朝鲜国家级行为者使用 Medusa 载荷将经济动机攻击与地缘政治目标交织，防御者需同时考虑两种威胁模型
4. **BYOVD 威胁**：Medusa 使用自带易受攻击驱动程序技术终止安全软件，组织需实施驱动程序白名单策略
5. **2026 世界杯威胁**：随着2026年世界杯临近，Medusa 对体育、媒体和关键基础设施的威胁预计将进一步上升

---

## 十三、附录

### 附录 A：信息来源

| 编号 | 来源 | 日期 |
|------|------|------|
| [1] | CISA/FBI/MS-ISAC: #StopRansomware: Medusa, AA25-071A | 2025.03.12 |
| [2] | Darktrace: Under Medusa's Gaze - RMM Abuse | 2026.01.08 |
| [3] | Check Point: Medusa Ransomware Group - A Rising Threat | 2025 |
| [4] | Symantec/Carbon Black: North Korean Lazarus Group Working With Medusa | 2026.02.24 |
| [5] | Armis Labs: Breaking Down Medusa Ransomware | 2025.03.14 |
| [6] | Huntress: Medusa Threat Actor Profile | 2025 |
| [7] | MITRE ATT&CK: G1051 - Medusa Group | v18 |
| [8] | SecurityScorecard: A Deep Dive into Medusa Ransomware | 2024.01 |
| [9] | Unit 42: Medusa Ransomware Escalation | 2025 |
| [10] | SOCRadar: Top 10 Ransomware Groups of 2025 | 2026.01 |

### 附录 B：术语表

| 术语 | 定义 |
|------|------|
| **RaaS** | Ransomware-as-a-Service，勒索软件即服务 |
| **IAB** | Initial Access Broker，初始访问经纪人 |
| **RMM** | Remote Monitoring and Management，远程监控和管理 |
| **BYOVD** | Bring Your Own Vulnerable Driver，自带易受攻击驱动程序 |
| **MedusaChat** | Medusa 的 TOR 赎金谈判平台 |
| **三重勒索** | 数据加密 + 数据泄露 + DDoS/客户联络的组合施压模式 |
| **Storm-1175** | Microsoft 对 Medusa 的追踪代号 |
| **G1051** | MITRE ATT&CK 对 Medusa 组织的编号 |

### 附录 C：追踪计划

| 维度 | 说明 |
|------|------|
| **组织状态** | 活跃（2026年持续攻击） |
| **Lazarus 关联** | 监控朝鲜行为者对 Medusa 载荷的持续使用 |
| **RMM 滥用** | 关注 SimpleHelp/AnyDesk 等工具的新型滥用模式 |
| **TTPs 监控** | BYOVD 技术演化、三重勒索策略升级 |
| **世界杯威胁** | 监控对体育/媒体/关键基础设施的攻击趋势 |
| **解密工具** | 关注是否有公开解密工具发布 |
