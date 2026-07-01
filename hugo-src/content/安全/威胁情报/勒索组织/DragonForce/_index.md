---
title: "DragonForce"
weight: 15
---

**报告编号**: TIR-2026-0701-015 | **分类等级**: TLP:AMBER | **发布日期**: 2026年7月1日 | **情报来源**: 多源交叉验证（OSINT + Trend Micro + Symantec/Broadcom + Group-IB + SentinelOne + Darktrace + Cybereason + S2W TALON + The DFIR Report + Halcyon Q2-2025）

---

## 一、执行摘要

**DragonForce**（Trend Micro 追踪代号：**Water Tambanakua**，Symantec 追踪代号：**Hackledorb**）是2023年8月崛起的高危勒索软件即服务（RaaS）组织，已从最初的 LockBit 3.0 克隆体演化为基于 **Conti V3 代码库**的高度定制化勒索平台。2025年正式转型为勒索软件**"卡特尔"（Cartel）**，允许附属机构创建自有品牌，成为当前全球最具技术能力的勒索组织之一。

<!--more-->

截至2026年6月，DragonForce 已累计确认 **579 个受害者**，攻击覆盖制造业、零售、医疗、建筑、IT 等关键行业。该组织最显著的技术创新是**首个滥用 Microsoft Teams TURN 中继基础设施**进行 C2 通信的恶意软件（Backdoor.Turn），以及大规模使用 **BYOVD（自带脆弱驱动）**技术获取内核级权限终止安全进程。2025年4-6月，联合 **Scattered Spider** 对英国多家知名零售商（哈罗德百货、玛莎百货、合作社）发动高调攻击。

### 关键发现

| 维度 | 关键指标 |
|------|----------|
| **组织规模** | 579+ 受害者 |
| **首要目标** | 美国、英国、德国、澳大利亚、意大利 |
| **加密方式** | ChaCha8 + AES 混合加密；多平台（Win/Linux/ESXi/BSD/NAS） |
| **代码基础** | LockBit 3.0（早期）→ Conti V3（当前主要变体） |
| **商业模式** | 卡特尔模式（80/20分成，白标服务，数据分析服务） |
| **关联组织** | Scattered Spider、BlackLock、RansomHub、Play、LockBit |
| **技术创新** | Backdoor.Turn（首个 Teams TURN 中继 C2）、BYOVD 多驱动利用 |
| **解密可能性** | **不存在**（无公开解密工具） |
| **当前状态** | **活跃**（2026年持续攻击，Frontrunner Q2-2025） |

### 威胁等级评估

| 评估维度 | 等级 | 说明 |
|----------|------|------|
| **技术能力** | 🔴 极高 | 双代码库、BYOVD 多驱动、Backdoor.Turn、多平台加密 |
| **运营成熟度** | 🔴 极高 | 卡特尔模式、白标服务、数据分析服务、PETABYTES 级存储 |
| **攻击规模** | 🔴 极高 | 579+ 受害者，英国零售高调攻击 |
| **目标针对性** | 🔴 极高 | 年收入 ≥ $1500万组织为主要目标 |
| **数据泄露风险** | 🔴 极高 | 双重勒索 + SSH/FTP 外传至俄罗斯基础设施 |

---

## 二、威胁行为者画像

### 2.1 组织标识

| 属性 | 值 |
|------|-----|
| **官方名称** | DragonForce |
| **别名** | Water Tambanakua（Trend Micro）、Hackledorb（Symantec） |
| **组织类型** | 卡特尔模式 RaaS |
| **活跃周期** | 2023年8月 – 至今 |
| **主要语言** | 英语（勒索信/谈判）、俄语（内部通信） |
| **地理归属** | 俄语地区（高置信度）；数据外传至俄罗斯基础设施 |
| **攻击目标** | 全球（美/英/德/澳/意为主） |
| **动机** | 经济利益 |

### 2.2 组织演化时间线

```
2023.08    DragonForce 勒索活动首次被发现
           使用泄露的 LockBit 3.0 builder
    ↓
2023.12    BreachForums 发布数据泄露站点（DLS）
    ↓
2024.06    RAMP 论坛招募附属，80% 赎金分成
    ↓
2024.07    发布基于 Conti V3 的自研变体
    ↓
2025.01    转型为"卡特尔"，允许附属创建自有品牌
    ↓
2025.03    入侵 BlackLock（Mamona）DLS
    ↓
2025.04-06 联合 Scattered Spider 攻击英国零售（Harrods/M&S/Co-op）
    ↓
2025.08    推出"数据分析服务"（目标年收入 ≥ $1500万）
    ↓
2025.12    Backdoor.Turn 首次出现（Teams TURN 中继 C2）
    ↓
2026.04    声称吞并 RansomHub 基础设施
```

---

## 三、归因分析

### 3.1 地理归属

| 证据类型 | 详情 | 置信度 |
|----------|------|--------|
| **数据外传** | SSH 传输至俄罗斯境内恶意托管基础设施 | 高 |
| **论坛活动** | RAMP 论坛招募，俄语暗网生态 | 高 |
| **C2 基础设施** | 俄罗斯 ASN 关联 IP | 中-高 |
| **起源争议** | 部分报告关联马来西亚黑客活动团体（已否认） | 低 |

### 3.2 关联组织网络

```
┌──────────────────────────────────────────────────────┐
│           DragonForce 关联组织网络                     │
├──────────────────────────────────────────────────────┤
│                                                        │
│  ┌─────────────────┐                                  │
│  │ DragonForce 核心 │ 卡特尔模式 RaaS                  │
│  │（LockBit+Conti） │ 80/20 分成                      │
│  └────────┬────────┘                                  │
│           │                                            │
│           ├──→ Scattered Spider（初始访问合作）        │
│           │    英国零售攻击中充当 IAB                   │
│           │                                            │
│           ├──→ BlackLock / Mamona（被吞并）            │
│           │    2025.03 入侵其 DLS                      │
│           │                                            │
│           ├──→ RansomHub（被吞并）                     │
│           │    2026.04 声称吞并基础设施                │
│           │                                            │
│           ├──→ Play（附属重叠）                        │
│           │    同一附属同时为两者工作                   │
│           │                                            │
│           └──→ DevMan（生态衍生）                      │
│                DragonForce 代码衍生变体                │
│                                                        │
└──────────────────────────────────────────────────────┘
```

---

## 四、技术能力评估

### 4.1 加密方案

| 属性 | 值 |
|------|-----|
| **对称加密** | ChaCha8 + AES |
| **加密模式** | 完全加密 / 头部加密 / 部分加密（可配置） |
| **元数据** | 每个加密文件末尾附加 534 字节 |
| **多平台** | Windows / Linux / ESXi / BSD / NAS |
| **文件扩展名** | `.RNP` / `.df_win` / `.dragonforce_encrypted` / `.RNP_esxi` / `.locked` |
| **勒索信** | `readme.txt` / `Contact Us.txt` |

### 4.2 BYOVD 技术矩阵

| 驱动文件 | 关联 CVE | 来源 |
|----------|----------|------|
| HWAuidoOs2Ec.sys | 未公开（2026.03 Huntress 披露） | 华为音频驱动 |
| wsftprm.sys | CVE-2023-52271 | Topaz Antifraud |
| Gamedriverx64.sys | CVE-2025-61155 | Tower of Fantasy 游戏 |
| K7RKScan.sys | CVE-2025-1055 | K7 Security 反恶意软件 |
| truesight.sys / rentdrv2.sys | — | 内置于勒索软件配置 |
| Abyss Worker 驱动 | — | 伪装为 Palo Alto Networks 驱动 |

### 4.3 Backdoor.Turn（技术创新）

```
┌──────────────────────────────────────────────────────┐
│        Backdoor.Turn — 首个 Teams TURN 中继 C2        │
├──────────────────────────────────────────────────────┤
│                                                        │
│  工作原理：                                            │
│  1. 从 Microsoft Skype 身份服务获取匿名 Teams 访客令牌 │
│  2. 使用合法 Microsoft TURN 中继服务器建立连接         │
│  3. 通过中继辅助建立直达攻击者 C2 的 QUIC 会话        │
│  4. 所有流量仅显示为合法 Microsoft Teams 出站连接      │
│                                                        │
│  功能：                                                │
│  ├── 命令执行与进程创建                                │
│  ├── 网络扫描（TLS 证书/网页标题收集）                 │
│  ├── LDAP/Active Directory 侦察                       │
│  ├── 基于凭据的横向移动                                │
│  └── 浏览器凭据窃取                                    │
│                                                        │
│  部署：注入到合法 DbgView64.exe 进程                   │
│  语言：Go                                              │
│                                                        │
└──────────────────────────────────────────────────────┘
```

---

## 五、攻击链分析

### 5.1 初始访问

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **钓鱼邮件** | T1566 | 社会工程策略 |
| **漏洞利用** | T1190 | CVE-2021-44228（Log4Shell）、CVE-2023-46805/2024-21887/2024-21893（Ivanti）、CVE-2024-21412（SmartScreen 绕过） |
| **RDP 凭证填充** | T1133 | 暴力破解或凭证泄露利用 |
| **IAB 购买** | T1650 | 从初始访问经纪人购买 |

### 5.2 执行与持久化

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **DLL 侧加载** | T1574.002 | VirtualBox/DbgView64.exe 加载恶意 vboxrt.dll |
| **进程注入** | T1055 | MSBuild.exe 进程注入 |
| **多阶段部署** | T1105 | SectopRAT → SystemBC → Betruger → DragonForce |
| **计划任务** | T1053 | 持久化访问 |
| **防火墙规则修改** | T1562.004 | 确保 C2 通信畅通 |

### 5.3 凭证窃取（四种并行手段）

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **SectopRAT 信息窃取** | T1555 | Steam/Discord/Telegram/浏览器/加密钱包 |
| **Veeam 数据库转储** | T1003 | PowerShell 解密备份服务器密码 |
| **DCSync 攻击** | T1003.006 | 域控制器同步攻击 |
| **LSASS 内存访问** | T1003.001 | Mimikatz/Betruger 凭证收割 |

### 5.4 横向移动

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **RDP** | T1021.001 | 远程桌面 |
| **Impacket wmiexec** | T1047 | WMI 远程执行 |
| **SystemBC 代理隧道** | T1090 | 代理隧道 |
| **SMB** | T1021.002 | IOCP 网络模式加密 |
| **Cobalt Strike** | T1071 | C2 框架 |

### 5.5 数据外传

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **SSH** | T1048 | 传输至俄罗斯托管基础设施 |
| **FTP（明文）** | T1048 | 数据外传 |
| **Backdoor.Turn** | T1071 | Teams TURN 中继隐蔽窃取 |

### 5.6 防御规避与影响

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **BYOVD** | T1068 | 多驱动获取内核级权限 |
| **Teams TURN 中继** | T1071 | 伪装为合法 Teams 流量 |
| **字符串混淆** | T1027 | 运行时解密自定义算法 |
| **清除日志** | T1070.001 | 删除 Windows 事件日志 |
| **干运行模式** | T1497 | 不实际加密用于测试 |
| **数据加密** | T1486 | ChaCha8 + AES 混合加密 |
| **删除卷影副本** | T1490 | 阻止恢复 |

---

## 六、受害者分析

### 6.1 规模与地理分布

| 指标 | 值 |
|------|-----|
| **确认受害者** | 579+ |
| **首要国家** | 美国、英国、德国、澳大利亚、意大利 |
| **其他目标** | 加拿大、法国、西班牙、中国、马来西亚 |

### 6.2 行业分布

| 行业 | 优先级 | 说明 |
|------|--------|------|
| **制造业** | 🔴 首要 | 最高频目标 |
| **商业服务** | 🔴 高 | 专业服务 |
| **科技** | 🔴 高 | IT 服务商 |
| **建筑** | 🟠 高 | 建筑公司 |
| **零售** | 🔴 极高 | 英国零售高调攻击（Harrods/M&S/Co-op） |
| **医疗** | 🟠 高 | 医疗机构 |

### 6.3 重大攻击事件

| 时间 | 受害者 | 影响 |
|------|--------|------|
| 2025.04-06 | Harrods / M&S / Co-op（英国） | 联合 Scattered Spider 高调攻击 |
| 2025 | 帕劳政府 | 政府机构遭攻击 |
| 2025 | 可口可乐新加坡 | 跨国企业遭攻击 |
| 2025 | 俄亥俄州彩票 | 政府机构 |
| 2025 | 养乐多澳大利亚 | 跨国企业 |

---

## 七、卡特尔运营模式分析

### 7.1 组织架构

```
┌──────────────────────────────────────────────────────┐
│           DragonForce 卡特尔架构                       │
├──────────────────────────────────────────────────────┤
│                                                        │
│  ┌──────────────────┐                                │
│  │ 核心平台           │ 基础设施维护                   │
│  │ 20% 分成           │ 加密工具开发                   │
│  │                    │ PETABYTES 级存储               │
│  └────────┬─────────┘                                │
│           │                                            │
│           ├──→ 附属机构（80% 分成）                    │
│           │    ├── 白标服务（创建独立品牌）            │
│           │    ├── 项目制运营（高度自治）              │
│           │    └── 数据分析服务（$1500万+目标）        │
│           │                                            │
│           └──→ 被吞并组织                              │
│                ├── BlackLock（2025.03）                │
│                └── RansomHub（2026.04）                │
│                                                        │
└──────────────────────────────────────────────────────┘
```

---

## 八、IOC 完整列表

### 8.1 网络指标

| 类型 | 值 | 说明 |
|------|-----|------|
| **扩展名** | `.RNP` / `.df_win` / `.dragonforce_encrypted` / `.RNP_esxi` / `.locked` | 加密文件扩展名 |
| **文件** | `readme.txt` / `Contact Us.txt` | 勒索信 |
| **文件** | `df.exe` | DragonForce 勒索软件可执行文件 |
| **文件** | `socks.exe` | SystemBC 后门 |
| **文件** | `ccs.exe` | Betruger 后门 |
| **文件** | `vboxrt.dll` | DLL 侧加载恶意载荷 |
| **文件** | `HWAuidoOs2Ec.sys` | BYOVD 华为音频驱动 |
| **文件** | `wsftprm.sys` | BYOVD Topaz 驱动 |
| **文件** | `Gamedriverx64.sys` | BYOVD 游戏驱动 |
| **工具** | SectopRAT | 信息窃取 RAT |
| **工具** | SystemBC | 代理隧道后门 |
| **工具** | Betruger | 多功能后门 |
| **工具** | Backdoor.Turn | Teams TURN 中继 C2 |
| **工具** | Cobalt Strike | C2 框架 |
| **工具** | Mimikatz | 凭证窃取 |

### 8.2 文件哈希

| 类型 | 哈希值 |
|------|--------|
| SHA256 | `1ccf8baf11427fae273ffed587b41c857fa2d8f3d3c6c0ddaa1fe4835f665eba` |
| SHA256 | `f5df98b344242c5eaad1fce421c640fadd71f7f21379d2bf7309001dfeb25972` |
| SHA256 | `24e8ef41ead6fc45d9a7ec2c306fd04373eaa93bbae0bd1551a10234574d0e07` |
| MD5 | `3a6e2c775c9c1060c54a9a94e80d923a` |
| MD5 | `74a97d25595ad73129fa946dc3156cec` |

### 8.3 被利用漏洞

| CVE | 影响组件 | 说明 |
|-----|----------|------|
| CVE-2021-44228 | Log4Shell | Apache Log4j RCE |
| CVE-2023-46805 | Ivanti Connect Secure | 认证绕过 |
| CVE-2024-21887 | Ivanti Connect Secure | RCE |
| CVE-2024-21893 | Ivanti Policy Secure | RCE |
| CVE-2024-21412 | Windows SmartScreen | 安全功能绕过 |
| CVE-2023-52271 | Topaz Antifraud 驱动 | BYOVD |
| CVE-2025-61155 | Tower of Fantasy 游戏驱动 | BYOVD |
| CVE-2025-1055 | K7 Security 驱动 | BYOVD |

### 8.4 攻击工具链

```
钓鱼 / 漏洞利用（Log4Shell/Ivanti）/ RDP 凭证填充 / IAB 购买
    ↓
SectopRAT → SystemBC → Betruger（多阶段部署）
    ↓
DLL 侧加载（VirtualBox/DbgView64 → vboxrt.dll）
    ↓
四种凭证窃取（SectopRAT/Veeam/DCSync/LSASS）
    ↓
RDP / Impacket wmiexec / SystemBC 隧道 / SMB / Cobalt Strike（横向移动）
    ↓
SSH / FTP / Backdoor.Turn（数据外传至俄罗斯）
    ↓
BYOVD（多驱动终止安全进程）
    ↓
DragonForce 载荷（ChaCha8+AES 加密 + 多平台）
```

---

## 九、检测规则

### 9.1 Sigma 规则

#### 规则 1：DragonForce BYOVD 驱动加载

```yaml
title: DragonForce - BYOVD Vulnerable Driver Loading
id: df001-byovd-driver-load
status: experimental
description: 检测 DragonForce 使用 BYOVD 技术加载已知脆弱驱动
logsource:
  category: driver_load
  product: windows
detection:
  selection:
    ImageLoaded|endswith:
      - '\HWAuidoOs2Ec.sys'
      - '\wsftprm.sys'
      - '\Gamedriverx64.sys'
      - '\K7RKScan.sys'
      - '\truesight.sys'
      - '\rentdrv2.sys'
  condition: selection
level: critical
tags:
  - attack.defense_evasion
  - attack.t1068
```

#### 规则 2：DragonForce DLL 侧加载

```yaml
title: DragonForce - DLL Sideloading via DbgView64
id: df002-dll-sideloading
status: experimental
description: 检测通过 DbgView64.exe 侧加载恶意 DLL 的行为
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    ParentImage|endswith: '\DbgView64.exe'
    Image|endswith:
      - '\rundll32.exe'
      - '\regsvr32.exe'
  condition: selection
level: critical
tags:
  - attack.privilege_escalation
  - attack.t1574.002
```

#### 规则 3：DragonForce Teams TURN 中继异常

```yaml
title: DragonForce - Abnormal Microsoft Teams TURN Relay
id: df003-teams-turn-relay
status: experimental
description: 检测异常的 Microsoft Teams TURN 中继连接（可能的 Backdoor.Turn）
logsource:
  category: network_connection
  product: windows
detection:
  selection:
    Image|endswith: '\DbgView64.exe'
    DestinationPort: 443
    Protocol: 'quic'
  condition: selection
level: high
tags:
  - attack.command_and_control
  - attack.t1071
```

### 9.2 YARA 规则

```yara
rule DragonForce_Ransomware {
    meta:
        description = "检测 DragonForce 勒索软件载荷"
        author = "Threat Intelligence Team"
        date = "2026-07-01"
        reference = "Water Tambanakua / Hackledorb"
    strings:
        $s1 = ".RNP" ascii
        $s2 = ".df_win" ascii
        $s3 = ".dragonforce_encrypted" ascii
        $s4 = "readme.txt" ascii
        $s5 = "DragonForce" ascii
        $s6 = "vssadmin delete shadows" ascii
        $hex1 = { 48 89 5C 24 08 48 89 6C 24 10 48 89 74 24 18 }
    condition:
        3 of ($s*) and $hex1
}
```

---

## 十、风险评估矩阵

| 风险维度 | 评分 | 说明 |
|----------|------|------|
| **加密强度** | 9/10 | ChaCha8 + AES 混合，多平台，534字节元数据 |
| **传播能力** | 8/10 | 卡特尔模式 + 白标服务 + 吞并 RansomHub |
| **规避能力** | 10/10 | BYOVD 多驱动 + Teams TURN 中继 + 字符串混淆 |
| **数据泄露威胁** | 9/10 | 双重勒索 + SSH/FTP 外传至俄罗斯 |
| **漏洞利用能力** | 9/10 | Log4Shell/Ivanti/SmartScreen 多 CVE |
| **基础设施韧性** | 9/10 | 吞并 BlackLock + RansomHub，无单一打击点 |
| **综合风险** | **🔴 极高** | 卡特尔模式 + Backdoor.Turn + 英国零售高调攻击 |

---

## 十一、缓解建议

### 11.1 即时行动

1. **BYOVD 防护**：审计系统中是否存在已知脆弱驱动，启用驱动允许列表
2. **Teams 流量监控**：对 Microsoft Teams TURN 中继流量建立基线，检测异常 QUIC 会话
3. **Ivanti 修补**：立即修复 CVE-2023-46805/2024-21887/2024-21893
4. **封锁 IOC**：在防火墙/EDR 中封锁所有已知哈希和扩展名

### 11.2 短期加固

1. **强制 MFA**：所有远程访问启用多因素认证
2. **网络分段**：限制 SMB/RDP 跨网段横向传播
3. **DCSync 检测**：监控 Windows Security Event ID 4662
4. **备份隔离**：确保备份不连接至受感染网络

### 11.3 长期策略

1. **代码完整性策略**：阻止未签名/已知脆弱驱动加载
2. **威胁狩猎**：定期扫描 LSASS 访问、计划任务注册表修改
3. **漏洞管理**：优先修补公共面向应用

### 11.4 解密恢复路径

| 维度 | 详情 |
|------|------|
| **解密器状态** | **无公开解密工具** |
| **加密强度** | ChaCha8 + AES 混合，密码学强度极高 |
| **建议** | 优先从备份恢复；联系执法部门报告 |

---

## 十二、核心建议

1. **BYOVD 是最大威胁**：DragonForce 利用6种以上脆弱驱动获取内核权限，组织必须实施驱动程序白名单策略
2. **Teams TURN 中继无法简单封锁**：Backdoor.Turn 伪装为合法 Teams 流量，需建立行为基线而非简单阻断
3. **卡特尔模式加速碎片化**：白标服务使归因更加困难，防御者需关注行为模式而非品牌名称
4. **吞并策略扩大威胁面**：吞并 BlackLock 和 RansomHub 后，DragonForce 控制的基础设施和附属网络大幅扩展
5. **英国零售攻击是转折点**：与 Scattered Spider 合作的高调攻击表明 DragonForce 具备针对全球顶级品牌的能力

---

## 十三、附录

### 附录 A：信息来源

| 编号 | 来源 | 日期 |
|------|------|------|
| [1] | Trend Micro: DragonForce Ransomware Analysis | 2024-2025 |
| [2] | Symantec/Broadcom: Hackledorb Analysis | 2024-2025 |
| [3] | Group-IB: DragonForce Cartel Model | 2025 |
| [4] | SentinelOne: DragonForce TTPs | 2025 |
| [5] | Darktrace: Backdoor.Turn Discovery | 2025.12 |
| [6] | The DFIR Report: DragonForce Case Study | 2025 |
| [7] | S2W TALON: DragonForce Infrastructure | 2025 |
| [8] | Halcyon: Q2-2025 Ransomware Power Rankings | 2025 |
| [9] | Huntress: BYOVD Driver Disclosure | 2026.03 |
| [10] | BleepingComputer: DragonForce UK Retail Attacks | 2025 |

### 附录 B：术语表

| 术语 | 定义 |
|------|------|
| **BYOVD** | Bring Your Own Vulnerable Driver，自带易受攻击驱动程序 |
| **Backdoor.Turn** | 首个滥用 Microsoft Teams TURN 中继的 C2 后门 |
| **卡特尔模式** | 允许附属创建独立品牌的 RaaS 升级模式 |
| **白标服务** | 附属机构在平台基础设施下创建独立品牌运营 |
| **SectopRAT** | DragonForce 使用的信息窃取远程访问木马 |
| **Betruger** | DragonForce 使用的多功能后门工具 |

### 附录 C：追踪计划

| 维度 | 说明 |
|------|------|
| **组织状态** | 活跃（Frontrunner Q2-2025） |
| **卡特尔演化** | 监控更多组织被吞并或加入卡特尔 |
| **BYOVD 演化** | 关注新型脆弱驱动利用 |
| **Backdoor.Turn** | 监控 Teams TURN 中继滥用趋势 |
| **附属重叠** | 追踪 Play/RansomHub/DragonForce 附属交叉 |
| **解密工具** | 关注是否有公开解密工具发布 |
