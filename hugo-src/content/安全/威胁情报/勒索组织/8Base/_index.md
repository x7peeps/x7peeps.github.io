---
title: "8Base"
weight: 19
---

**报告编号**: TIR-2026-0701-019 | **分类等级**: TLP:AMBER | **发布日期**: 2026年7月1日 | **情报来源**: 多源交叉验证（OSINT + Europol Operation PHOBOS AETOR + US DoJ + HHS/HC3 + VMware Carbon Black + Trend Micro + Check Point + Vectra AI + Eye Security）

---

## 一、执行摘要

**8Base** 是2022年3月崛起的勒索软件组织，以**双重勒索**模式运营，利用泄露的 **Phobos 勒索软件构建工具**（v2.9.1）发起攻击，加密文件追加 `.8base` 扩展名。该组织在2023年夏季活动量急剧攀升，三个月内声称131个受害者，与 Cl0p、LockBit 并列为2023年7月全部已记录网络攻击的48%的制造者。累计公布受害者超过 **455 个**，涉及全球超过1,000个实体，非法获利约 **1,600 万美元**。

<!--more-->

2025年2月，在国际执法行动 **"Operation PHOBOS AETOR"** 中，4名8Base组织领导层成员（俄罗斯国籍）在泰国普吉岛被捕，暗网数据泄露网站及27台关联服务器被查封。该组织与 **RansomHouse** 存在高度关联（勒索信匹配度99%），作为 **Phobos "Affiliate 2803"** 运作。

### 关键发现

| 维度 | 关键指标 |
|------|----------|
| **组织规模** | 455+ 受害者，1,000+ 关联实体 |
| **首要目标** | 美国（36%）、巴西（15%）、英国（10%） |
| **加密方式** | AES-256-CBC（Phobos 变体） |
| **代码来源** | Phobos v2.9.1 泄露构建工具 |
| **商业模式** | Phobos 附属（Affiliate 2803） |
| **关联组织** | Phobos（上游 RaaS）、RansomHouse（99%勒索信匹配） |
| **执法行动** | Operation PHOBOS AETOR（2025.02，4人逮捕） |
| **赎金收入** | ~$1,600万 |
| **解密可能性** | **部分存在**（Phobos 解密工具覆盖部分变体） |
| **当前状态** | **受重创**（核心成员被捕，基础设施查封） |

### 威胁等级评估

| 评估维度 | 等级 | 说明 |
|----------|------|------|
| **技术能力** | 🟠 高 | Phobos 变体、SmokeLoader、SystemBC |
| **运营成熟度** | 🟠 高 | 双重勒索、数据外泄 + 加密 |
| **攻击规模** | 🔴 极高 | 455+ 受害者，$1,600万收入 |
| **目标针对性** | 🟠 高 | 中小企业为主，无差别行业 |
| **数据泄露风险** | 🔴 极高 | 双重勒索 + Mega.nz 外传 |

---

## 二、威胁行为者画像

### 2.1 组织标识

| 属性 | 值 |
|------|-----|
| **官方名称** | 8Base（EightBase） |
| **组织类型** | Phobos 附属（Affiliate 2803） |
| **活跃周期** | 2022年3月 – 2025.02（执法打击） |
| **代码来源** | Phobos v2.9.1 泄露构建工具 |
| **地理归属** | 俄罗斯（2025执法确认） |
| **攻击目标** | 全球（美/巴西/英为主） |
| **动机** | 经济利益 |

### 2.2 关联组织

```
┌──────────────────────────────────────────────────────┐
│           8Base 关联组织网络                            │
├──────────────────────────────────────────────────────┤
│                                                        │
│  Phobos RaaS（上游提供者）                             │
│  ├── 提供加密工具和基础设施                            │
│  ├── 8Base 为 "Affiliate 2803"                        │
│  │                                                      │
│  └──→ 8Base（2022.03-2025.02）                        │
│       ├── 修改 Phobos 构建工具                         │
│       ├── .8base 扩展名                                │
│       ├── 自定义勒索信                                 │
│       │                                                │
│       └── RansomHouse（99%勒索信匹配）                 │
│            措辞逐字复制，可能共用开发者                  │
│                                                        │
└──────────────────────────────────────────────────────┘
```

---

## 三、归因分析

### 3.1 地理归属

| 证据类型 | 详情 | 置信度 |
|----------|------|--------|
| **执法确认** | 2025.02 逮捕4名俄罗斯国籍成员 | 极高 |
| **排除规则** | 未发现针对 CIS 国家的攻击 | 高 |
| **DoJ 起诉书** | 明确归因于俄罗斯国籍人员 | 极高 |

---

## 四、技术能力评估

### 4.1 加密方案

| 属性 | 值 |
|------|-----|
| **加密算法** | AES-256-CBC |
| **代码来源** | Phobos v2.9.1 修改版 |
| **文件扩展名** | `.8base` |
| **勒索信** | 自定义勒索信 |

---

## 五、攻击链分析

### 5.1 初始访问

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **钓鱼邮件** | T1566.001 | 主要入侵向量 |
| **IAB 购买** | T1199 | 暗网购买已攻陷网络 |
| **漏洞利用** | T1190 | 未修补软件漏洞 |

### 5.2 执行与持久化

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **SmokeLoader** | T1027 | 初始混淆与载荷加载 |
| **SystemBC** | T1090 | 代理/RAT C2 通信 |
| **defoff.bat** | T1562.001 | 禁用 Windows Defender（KILLAV） |
| **注册表/启动文件夹** | T1547 | 持久化 |

### 5.3 凭证窃取

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **Mimikatz** | T1003.001 | LSASS 凭证提取 |
| **SAM 转储** | T1003.002 | 注册表配置单元转储 |

### 5.4 横向移动

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **SSL VPN** | T1133 | 利用窃取的服务账户凭证 |
| **虚拟桌面** | T1021 | Windows 虚拟桌面横向 |
| **多IP同时操作** | T1021 | 至少2个独立IP同时活动 |

### 5.5 数据外传

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **WinRAR** | T1560 | 压缩数据 |
| **Mega.nz** | T1567.002 | 云存储外传 |

### 5.6 防御规避与影响

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **关闭防火墙** | T1562.004 | `netsh advfirewall set currentprofile state off` |
| **WMIC 白名单** | T1562.001 | 通过 WMIC 添加恶意软件路径至白名单 |
| **删除卷影副本** | T1490 | `vssadmin.exe delete shadows /all /quiet` |
| **数据加密** | T1486 | AES-256-CBC |
| **备份定位** | T1490 | 扫描 TCP/9392（Veeam 端口）定位并破坏备份 |

---

## 六、受害者分析

### 6.1 规模与地理分布

| 指标 | 值 |
|------|-----|
| **确认受害者** | 455+（泄露站查封前） |
| **关联实体** | 1,000+ |
| **首要国家** | 美国（36%）、巴西（15%）、英国（10%） |
| **企业规模** | 小型230、中型55、大型12 |

### 6.2 行业分布

| 行业 | 优先级 | 说明 |
|------|--------|------|
| **制造业** | 🔴 首要 | 受攻击最多 |
| **商业服务** | 🔴 高 | |
| **金融** | 🟠 高 | |
| **IT** | 🟠 高 | |
| **建筑/工程** | 🟠 高 | |
| **医疗** | 🟠 高 | 2023.10 攻击美国医疗机构引发 HHS 关注 |

### 6.3 重大攻击事件

| 时间 | 受害者 | 影响 |
|------|--------|------|
| 2023.03 | 联合国开发计划署（UNDP） | 数据泄露 |
| 2023.10 | 美国医疗机构 | 引发 HHS/HC3 通告 |
| 2024.05 | Nidec Instruments | 服务器加密，运营中断 |
| 2024.10 | 大众汽车（Volkswagen） | 数据泄露 |
| 2024.12 | 里耶卡港（克罗地亚） | 关键基础设施 |

---

## 七、Operation PHOBOS AETOR 执法行动

### 7.1 行动概要

| 属性 | 值 |
|------|-----|
| **行动名称** | Operation PHOBOS AETOR |
| **执行日期** | 2025年2月10日 |
| **协调机构** | Europol + Eurojust |
| **参与国家** | 14国（英/美/德/比利时/捷克/法/日/罗马尼亚/西班牙/瑞士/泰/芬兰等） |
| **逮捕人数** | 4人（俄罗斯国籍，泰国普吉岛） |
| **查封服务器** | 27台（累计100+台中断） |
| **泄露站** | 暗网数据泄露网站被查封 |

### 7.2 被捕人员

| 嫌疑人 | 国籍 | 年龄 | 指控 |
|--------|------|------|------|
| Roman Berezhnoy | 俄罗斯 | 33 | 11项罪名（电信欺诈/计算机欺诈/勒索等） |
| Egor Nikolaevich Glebov | 俄罗斯 | 39 | 同上 |
| 另外2人 | 俄罗斯 | 未公开 | 同案 |

---

## 八、IOC 完整列表

### 8.1 网络指标

| 类型 | 值 | 说明 |
|------|-----|------|
| **扩展名** | `.8base` | 加密文件扩展名 |
| **工具** | SmokeLoader | 初始混淆加载器 |
| **工具** | SystemBC | 代理/RAT |
| **工具** | defoff.bat (KILLAV) | 禁用 Defender |
| **工具** | Mimikatz | 凭证窃取 |
| **工具** | WinRAR / Mega.nz | 数据外传 |

### 8.2 命令行指标

```
netsh advfirewall set currentprofile state off
vssadmin.exe delete shadows /all /quiet
wmic shadowcopy delete
```

### 8.3 网络指标

| 类型 | 值 | 说明 |
|------|-----|------|
| **泄露站** | `basemmnnqwxevlymli5bs36o5ynti55xojzvn246spahniugwkff2pad[.]onion` | 已被查封 |
| **Telegram** | `https://t[.]me/eightbase` | 公开频道 |

### 8.4 攻击工具链

```
钓鱼邮件 / IAB 购买
    ↓
SmokeLoader（解包加载）
    ↓
SystemBC（C2 通道）
    ↓
defoff.bat（禁用安全软件）
    ↓
Mimikatz / SAM 转储（凭证窃取）
    ↓
SSL VPN / 虚拟桌面（横向移动）
    ↓
端口扫描定位备份系统（TCP/9392 Veeam）
    ↓
WinRAR 压缩 → Mega.nz 外传
    ↓
AES-256-CBC 加密 → .8base 扩展名
    ↓
删除卷影副本 + 禁用恢复
```

---

## 九、检测规则

### 9.1 Sigma 规则

#### 规则 1：8Base defoff.bat 执行

```yaml
title: 8Base - defoff.bat Windows Defender Disabling
id: 8b001-defoff
status: experimental
description: 检测 8Base 使用 defoff.bat 禁用 Windows Defender
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    CommandLine|contains:
      - 'defoff.bat'
      - 'netsh advfirewall set currentprofile state off'
  condition: selection
level: critical
tags:
  - attack.defense_evasion
  - attack.t1562.001
```

#### 规则 2：8Base Veeam 端口扫描

```yaml
title: 8Base - Veeam Backup Port Scanning
id: 8b002-veeam-scan
status: experimental
description: 检测对 Veeam 备份端口（TCP/9392）的扫描行为
logsource:
  category: network_connection
  product: windows
detection:
  selection:
    DestinationPort: 9392
    Initiated: 'true'
  condition: selection
level: high
tags:
  - attack.discovery
  - attack.t1046
```

#### 规则 3：8Base 卷影副本删除

```yaml
title: 8Base - Volume Shadow Copy Deletion
id: 8b003-vss-deletion
status: experimental
description: 检测 8Base 删除卷影副本的行为
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

### 9.2 YARA 规则

```yara
rule 8Base_Ransomware {
    meta:
        description = "检测 8Base 勒索软件载荷"
        author = "Threat Intelligence Team"
        date = "2026-07-01"
        reference = "Phobos Affiliate 2803"
    strings:
        $s1 = ".8base" ascii
        $s2 = "8Base" ascii
        $s3 = "defoff.bat" ascii
        $s4 = "vssadmin delete shadows" ascii
        $s5 = "SmokeLoader" ascii
        $hex1 = { 48 89 5C 24 08 48 89 6C 24 10 48 89 74 24 18 }
    condition:
        3 of ($s*) and $hex1
}
```

---

## 十、风险评估矩阵

| 风险维度 | 评分 | 说明 |
|----------|------|------|
| **加密强度** | 7/10 | AES-256-CBC（Phobos 标准），部分变体已有解密工具 |
| **传播能力** | 6/10 | Phobos 附属，受执法打击后能力下降 |
| **规避能力** | 7/10 | SmokeLoader + SystemBC + WMIC 白名单 |
| **数据泄露威胁** | 8/10 | 双重勒索 + Mega.nz 外传 |
| **执法风险** | 9/10 | 核心成员被捕，基础设施查封 |
| **重组可能性** | 6/10 | Phobos 生态仍在运作，可能重组 |
| **综合风险** | **🟠 高**（下降中） | 执法打击后受重创，但 Phobos 生态仍在 |

---

## 十一、缓解建议

### 11.1 即时行动

1. **排查 IOC**：检查 `.8base` 扩展名和 defoff.bat 执行痕迹
2. **钓鱼防护**：加强邮件网关过滤
3. **MFA**：所有 VPN/远程访问强制启用

### 11.2 短期加固

1. **Veeam 保护**：监控 TCP/9392 异常扫描
2. **网络分段**：隔离备份系统
3. **备份验证**：离线/不可变备份

### 11.3 长期策略

1. **Phobos 生态监控**：关注其他 Phobos 附属动态
2. **安全意识**：定期钓鱼演练

### 11.4 解密恢复路径

| 维度 | 详情 |
|------|------|
| **解密器状态** | **部分存在**（Phobos 解密工具覆盖部分变体） |
| **加密强度** | AES-256-CBC，标准强度 |
| **建议** | 检查 No More Ransom 项目是否有适用解密工具 |

---

## 十二、核心建议

1. **执法打击有效**：Operation PHOBOS AETOR 证明国际执法合作能有效打击勒索组织
2. **Phobos 生态持续威胁**：8Base 仅是 Phobos 众多附属之一，其他附属仍活跃
3. **中小企业优先防护**：8Base 核心策略是攻击安全预算不足的中小企业
4. **备份系统成为目标**：扫描 Veeam 端口定位并破坏备份是标准操作
5. **RansomHouse 关联**：99%勒索信匹配表明可能存在共用开发者或代码泄露

---

## 十三、附录

### 附录 A：信息来源

| 编号 | 来源 | 日期 |
|------|------|------|
| [1] | Europol: Operation PHOBOS AETOR | 2025.02 |
| [2] | US DoJ: 8Base Indictment | 2025.02 |
| [3] | HHS/HC3: 8Base Analyst Note | 2023.11 |
| [4] | VMware Carbon Black: 8Base/RansomHouse Analysis | 2023.06 |
| [5] | Trend Micro: 8Base Activity Surge | 2024.04 |
| [6] | Check Point: 8Base Threat Profile | 2024 |
| [7] | Vectra AI: 8Base Attack Chain | 2024 |
| [8] | Eye Security: 8Base IR Report | 2025.03 |

### 附录 B：术语表

| 术语 | 定义 |
|------|------|
| **Phobos** | 上游 RaaS 勒索软件提供者 |
| **Affiliate 2803** | 8Base 在 Phobos 生态中的附属编号 |
| **SmokeLoader** | 初始混淆加载器 |
| **SystemBC** | 代理/RAT 工具 |
| **Operation PHOBOS AETOR** | 2025.02 国际执法打击行动 |

### 附录 C：追踪计划

| 维度 | 说明 |
|------|------|
| **组织状态** | 受重创（核心成员被捕） |
| **Phobos 生态** | 监控其他 Phobos 附属动态 |
| **重组风险** | 关注 8Base 成员是否重组或加入其他组织 |
| **解密工具** | 关注 No More Ransom 项目更新 |
