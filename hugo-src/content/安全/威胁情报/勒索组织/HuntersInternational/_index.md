---
title: "Hunters International"
weight: 18
---

**报告编号**: TIR-2026-0701-018 | **分类等级**: TLP:AMBER | **发布日期**: 2026年7月1日 | **情报来源**: 多源交叉验证（OSINT + CISA/FBI + Europol + NCC Group + CrowdStrike + Mandiant + Trend Micro + Darktrace + The DFIR Report）

---

## 一、执行摘要

**Hunters International** 是2023年初 Hive 被执法瓦解后迅速崛起的勒索软件组织，被广泛认为是 Hive 的**直系继承者**。代码重合率 **≥60%**，共享基础设施、谈判流程和加密方案。该组织采用 **Rust 编写**的勒索软件，使用 **ChaCha20-Poly1305 + RSA OAEP** 混合加密，支持 Windows/Linux/ESXi 跨平台加密。

<!--more-->

截至2025年，Hunters International 已确认 **307+ 受害者**，包括中国工商银行伦敦分行（6.6TB 数据泄露）、Tata Technologies、US Marshals Service 等高价值目标。2025年7月，该组织宣布**"关闭"**并转向 **World Leaks** 纯数据窃取模式，但安全社区评估认为这更可能是品牌重塑而非真正退出。

### 关键发现

| 维度 | 关键指标 |
|------|----------|
| **组织规模** | 307+ 受害者 |
| **首要目标** | 全球（美/英/欧/亚为主） |
| **加密方式** | ChaCha20-Poly1305 + RSA OAEP（Rust 编写） |
| **代码来源** | Hive 继承（≥60%代码重合） |
| **商业模式** | RaaS（附属机构模式） |
| **关联组织** | Hive（前身）、World Leaks（后继） |
| **重大事件** | 中国工商银行伦敦分行（6.6TB）、US Marshals Service |
| **解密可能性** | **不存在**（无公开解密工具） |
| **当前状态** | **疑似转型**（2025.07 "关闭"，转向 World Leaks） |

### 威胁等级评估

| 评估维度 | 等级 | 说明 |
|----------|------|------|
| **技术能力** | 🔴 极高 | Rust 编写、ChaCha20-Poly1305、跨平台、SharpRhino RAT |
| **运营成熟度** | 🔴 极高 | 继承 Hive 基础设施和谈判流程 |
| **攻击规模** | 🔴 极高 | 307+ 受害者，高价值目标 |
| **目标针对性** | 🔴 极高 | 金融/政府/制造/科技重点目标 |
| **数据泄露风险** | 🔴 极高 | 双重勒索 + World Leaks 纯数据模式 |

---

## 二、威胁行为者画像

### 2.1 组织标识

| 属性 | 值 |
|------|-----|
| **官方名称** | Hunters International |
| **别名** | Hive 继承者 |
| **组织类型** | RaaS |
| **活跃周期** | 2023年初 – 2025.07（"关闭"） |
| **代码来源** | Hive 代码库（≥60%重合） |
| **地理归属** | 俄语地区（推断） |
| **攻击目标** | 全球 |
| **动机** | 经济利益 |

### 2.2 与 Hive 的继承关系

```
┌──────────────────────────────────────────────────────┐
│           Hive → Hunters International 继承链          │
├──────────────────────────────────────────────────────┤
│                                                        │
│  Hive（2021-2023.01）                                 │
│  ├── 2023.01 FBI 秘密渗透瓦解                          │
│  ├── 获取 300+ 解密密钥                                │
│  │                                                      │
│  └──→ Hunters International（2023年初出现）            │
│       ├── ≥60% 代码重合                                │
│       ├── 继承 Hive 基础设施和谈判流程                  │
│       ├── Rust 重写加密器                              │
│       ├── ChaCha20-Poly1305 + RSA OAEP                │
│       │                                                │
│       └──→ World Leaks（2025.07 转型）                │
│            纯数据窃取模式，放弃加密                    │
│                                                        │
└──────────────────────────────────────────────────────┘
```

---

## 三、归因分析

### 3.1 地理归属

| 证据类型 | 详情 | 置信度 |
|----------|------|--------|
| **Hive 继承** | 代码/基础设施/谈判流程来自 Hive（俄语地区） | 高 |
| **目标选择** | 排除 CIS 国家 | 中-高 |
| **工具链** | SharpRhino RAT 与俄语地区工具链一致 | 中 |

---

## 四、技术能力评估

### 4.1 加密方案

| 属性 | 值 |
|------|-----|
| **编程语言** | Rust |
| **对称加密** | ChaCha20-Poly1305 |
| **非对称加密** | RSA OAEP |
| **多平台** | Windows / Linux / ESXi |
| **文件扩展名** | `.hunters` / 自定义扩展名 |
| **勒索信** | v6 后取消勒索信（策略变更） |

### 4.2 技术演化

| 阶段 | 特征 |
|------|------|
| **早期** | 继承 Hive 加密方案，标准双重勒索 |
| **中期** | Rust 重写，ChaCha20-Poly1305 + RSA OAEP |
| **v6+** | 取消勒索信，减少执法取证线索 |
| **末期** | 转向 World Leaks 纯数据模式 |

---

## 五、攻击链分析

### 5.1 初始访问

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **漏洞利用** | T1190 | CVE-2024-55591（FortiOS）、CVE-2020-14644（WebLogic） |
| **钓鱼邮件** | T1566 | 社会工程 |
| **IAB 购买** | T1650 | 初始访问经纪人 |

### 5.2 执行与持久化

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **SharpRhino RAT** | T1071 | 自定义远程访问木马 |
| **计划任务** | T1053 | 持久化 |
| **服务创建** | T1543 | 伪装合法服务 |

### 5.3 凭证窃取

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **Mimikatz** | T1003.001 | LSASS 凭证提取 |
| **DCSync** | T1003.006 | 域控制器同步 |

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
| **Rust 二进制** | T1027 | 逆向分析难度极大 |
| **删除卷影副本** | T1490 | 阻止恢复 |
| **数据加密** | T1486 | ChaCha20-Poly1305 + RSA OAEP |
| **取消勒索信** | T1491 | v6 后减少取证线索 |

---

## 六、受害者分析

### 6.1 规模与地理分布

| 指标 | 值 |
|------|-----|
| **确认受害者** | 307+ |
| **首要国家** | 美国、英国、欧洲 |
| **其他目标** | 亚洲（含中国工商银行伦敦分行） |

### 6.2 行业分布

| 行业 | 优先级 | 说明 |
|------|--------|------|
| **金融** | 🔴 极高 | 中国工商银行伦敦分行（6.6TB） |
| **政府** | 🔴 极高 | US Marshals Service |
| **制造** | 🔴 高 | Tata Technologies |
| **科技** | 🟠 高 | IT 服务商 |
| **医疗** | 🟠 高 | 医疗机构 |

### 6.3 重大攻击事件

| 时间 | 受害者 | 影响 |
|------|--------|------|
| 2024 | 中国工商银行伦敦分行 | 6.6TB 数据泄露，运营中断 |
| 2024 | Tata Technologies | 工程数据泄露 |
| 2024 | US Marshals Service | 美国政府机构遭攻击 |

---

## 七、RaaS 运营模式分析

### 7.1 组织架构

| 要素 | 详情 |
|------|------|
| **分成比例** | 继承 Hive 模式 |
| **基础设施** | 继承 Hive 谈判门户和泄露站 |
| **加密工具** | Rust 重写，跨平台 |
| **后继模式** | World Leaks（纯数据窃取） |

---

## 八、IOC 完整列表

### 8.1 网络指标

| 类型 | 值 | 说明 |
|------|-----|------|
| **扩展名** | `.hunters` | 加密文件扩展名 |
| **工具** | SharpRhino RAT | 自定义远程访问木马 |
| **工具** | Mimikatz | 凭证窃取 |
| **工具** | Rclone / Mega | 数据外传 |

### 8.2 被利用漏洞

| CVE | 影响组件 | 说明 |
|-----|----------|------|
| CVE-2024-55591 | FortiOS | Fortinet VPN 漏洞 |
| CVE-2020-14644 | WebLogic | Oracle WebLogic RCE |

### 8.3 攻击工具链

```
漏洞利用（FortiOS/WebLogic）/ 钓鱼 / IAB 购买
    ↓
SharpRhino RAT（持久化 C2）
    ↓
Mimikatz / DCSync（凭证窃取）
    ↓
RDP / SMB / PsExec（横向移动）
    ↓
Rclone / Mega（数据外传）
    ↓
Hunters International 载荷（Rust ChaCha20-Poly1305 + RSA OAEP 加密）
    ↓
World Leaks（纯数据窃取模式，2025.07后）
```

---

## 九、检测规则

### 9.1 Sigma 规则

#### 规则 1：Hunters International 卷影副本删除

```yaml
title: Hunters International - Volume Shadow Copy Deletion
id: hi001-vss-deletion
status: experimental
description: 检测 Hunters International 删除卷影副本的行为
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

#### 规则 2：SharpRhino RAT 检测

```yaml
title: Hunters International - SharpRhino RAT Detection
id: hi002-sharprhino
status: experimental
description: 检测 SharpRhino RAT 的异常行为
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    ParentImage|endswith: '\services.exe'
    CommandLine|contains: 'SharpRhino'
  condition: selection
level: critical
tags:
  - attack.execution
  - attack.t1059
```

#### 规则 3：FortiOS 漏洞利用检测

```yaml
title: Hunters International - FortiOS CVE-2024-55591 Exploitation
id: hi003-fortios
status: experimental
description: 检测 FortiOS CVE-2024-55591 漏洞利用行为
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    ParentImage|endswith: '\fortisslvpn.exe'
    Image|endswith:
      - '\cmd.exe'
      - '\powershell.exe'
  condition: selection
level: critical
tags:
  - attack.initial_access
  - attack.t1190
```

### 9.2 YARA 规则

```yara
rule Hunters_International_Ransomware {
    meta:
        description = "检测 Hunters International 勒索软件载荷"
        author = "Threat Intelligence Team"
        date = "2026-07-01"
        reference = "Hive successor"
    strings:
        $s1 = ".hunters" ascii
        $s2 = "Hunters International" ascii
        $s3 = "SharpRhino" ascii
        $s4 = "vssadmin delete shadows" ascii
        $s5 = "ChaCha20" ascii
        $hex1 = { 48 89 5C 24 08 48 89 6C 24 10 48 89 74 24 18 }
    condition:
        3 of ($s*) and $hex1
}
```

---

## 十、风险评估矩阵

| 风险维度 | 评分 | 说明 |
|----------|------|------|
| **加密强度** | 9/10 | Rust + ChaCha20-Poly1305 + RSA OAEP |
| **传播能力** | 8/10 | 继承 Hive 基础设施和附属网络 |
| **规避能力** | 9/10 | Rust 二进制、取消勒索信、v6 策略变更 |
| **数据泄露威胁** | 9/10 | 双重勒索 + World Leaks 纯数据模式 |
| **漏洞利用能力** | 8/10 | FortiOS/WebLogic 多 CVE |
| **基础设施韧性** | 8/10 | Hive 继承 + World Leaks 转型 |
| **综合风险** | **🔴 极高** | Hive 继承 + Rust 重写 + 307+受害者 + World Leaks 转型 |

---

## 十一、缓解建议

### 11.1 即时行动

1. **FortiOS 修补**：立即修复 CVE-2024-55591
2. **WebLogic 修补**：修复 CVE-2020-14644
3. **监控 `.hunters` 扩展名**：EDR 配置批量重命名检测
4. **SharpRhino 检测**：监控异常服务创建和 RAT 行为

### 11.2 短期加固

1. **强制 MFA**：所有远程访问
2. **网络分段**：隔离关键资产
3. **备份验证**：离线/不可变备份

### 11.3 长期策略

1. **零信任架构**
2. **威胁狩猎**：针对 Hive/Hunters TTPs
3. **World Leaks 监控**：关注纯数据窃取模式演化

### 11.4 解密恢复路径

| 维度 | 详情 |
|------|------|
| **解密器状态** | **无公开解密工具** |
| **加密强度** | ChaCha20-Poly1305 + RSA OAEP，密码学强度极高 |
| **建议** | 优先从备份恢复；联系执法部门 |

---

## 十二、核心建议

1. **Hive 继承者威胁**：Hunters International 证明执法打击不一定能消除威胁，组织可通过品牌重塑延续
2. **Rust 重写趋势**：Rust 编写的勒索软件逆向分析难度极大，防御者需依赖行为检测
3. **World Leaks 转型**：从加密转向纯数据窃取是趋势，防御重点需转向 DLP
4. **高价值目标**：中国工商银行伦敦分行、US Marshals Service 等案例表明 Hunters 具备攻击顶级目标的能力
5. **"关闭"可能是伪装**：2025.07 "关闭"声明更可能是品牌重塑而非真正退出

---

## 十三、附录

### 附录 A：信息来源

| 编号 | 来源 | 日期 |
|------|------|------|
| [1] | NCC Group: Hunters International Analysis | 2023-2024 |
| [2] | CrowdStrike: Hive Successor Tracking | 2023 |
| [3] | Trend Micro: Hunters International TTPs | 2024 |
| [4] | Darktrace: ICBC London Attack | 2024 |
| [5] | The DFIR Report: Hunters Case Study | 2024 |
| [6] | Europol: Hive Takedown Follow-up | 2023 |
| [7] | Mandiant: World Leaks Transition | 2025 |

### 附录 B：术语表

| 术语 | 定义 |
|------|------|
| **SharpRhino** | Hunters International 使用的自定义 RAT |
| **World Leaks** | Hunters "关闭"后转向的纯数据窃取模式 |
| **ChaCha20-Poly1305** | 现代 AEAD 加密算法 |
| **RSA OAEP** | RSA 最优非对称加密填充 |

### 附录 C：追踪计划

| 维度 | 说明 |
|------|------|
| **组织状态** | 疑似转型 World Leaks |
| **World Leaks** | 监控纯数据窃取模式演化 |
| **Hive 关联** | 关注更多 Hive 继承者出现 |
| **解密工具** | 关注是否有公开解密工具发布 |
