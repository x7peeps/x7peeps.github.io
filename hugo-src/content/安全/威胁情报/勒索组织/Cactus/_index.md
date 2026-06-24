---
title: "Cactus"
weight: 13
---

**报告编号**: TIR-2026-0624-013 | **分类等级**: TLP:AMBER | **发布日期**: 2026年6月24日 | **情报来源**: 多源交叉验证（OSINT + CISA/FBI + MITRE ATT&CK + Trend Micro + Bitdefender + Kroll + Arctic Wolf + Darktrace + Barracuda + Huntress + SentinelOne）

---

## 一、执行摘要

**Cactus** 是2023年3月崛起的勒索软件即服务（RaaS）组织，以其独特的**自加密二进制文件**技术和**极快的漏洞武器化速度**（PoC 公开后24小时内即可发起攻击）著称。截至2025年初，该组织已在暗网泄露站点上公布了超过 **248 个受害者**，实际数量可能远高于此。攻击主要集中在**美国**（102个受害者）、加拿大、英国、法国等北美和欧洲地区。

<!--more-->

Cactus 的核心技术特征在于使用 **AES 密钥加密自身可执行文件**，密钥存储在 `C:\ProgramData\ntuser.dat` 中，需通过计划任务读取并解密后才能执行，有效规避了传统杀毒软件的静态检测。2025年初，Trend Micro 确认 **Black Basta 关键成员已转移至 Cactus** 继续运营，两个组织共享 BackConnect 恶意软件、社会工程战术和 TotalExec 自动化部署脚本。

### 关键发现

| 维度 | 关键指标 |
|------|----------|
| **组织规模** | 248+ 受害者（泄露站公布），实际数量更多 |
| **首要目标** | 美国（102个），加拿大（16），英国（14），法国（9） |
| **加密方式** | AES + RSA 混合加密；自加密二进制逃避检测 |
| **首要入口** | VPN 漏洞利用（Fortinet/Qlik Sense）、社会工程、恶意广告、凭证购买 |
| **商业模式** | RaaS（核心团队 + 附属机构） |
| **关联组织** | GOLD VILLAGE、TA2101、Storm-0216、DEV-0216、UNC2198、TWISTED SPIDER |
| **Black Basta 关联** | 2025年初 Black Basta 成员转移至 Cactus，共享基础设施和工具链 |
| **解密可能性** | **不存在**（无公开解密工具） |
| **当前状态** | **活跃**（2025-2026年持续攻击） |

### 威胁等级评估

| 评估维度 | 等级 | 说明 |
|----------|------|------|
| **技术能力** | 🔴 极高 | 自加密二进制、24小时漏洞武器化、ESXi+Hyper-V 双平台攻击 |
| **运营成熟度** | 🔴 高 | RaaS 模式、Cactus Chat 谈判平台、TotalExec 自动化部署 |
| **攻击规模** | 🟠 高 | 248+ 受害者，制造业/商业服务/科技为主 |
| **目标针对性** | 🟠 高 | 中大型企业为主，支付能力强 |
| **数据泄露风险** | 🔴 极高 | 双重勒索 + TOR/clearnet 双泄露站 |

---

## 二、威胁行为者画像

### 2.1 组织标识

| 属性 | 值 |
|------|-----|
| **官方名称** | Cactus |
| **别名** | GOLD VILLAGE（Secureworks）、TA2101（Microsoft）、Storm-0216/DEV-0216（Microsoft）、UNC2198（Secureworks）、TWISTED SPIDER |
| **组织类型** | RaaS（核心团队 + 附属机构） |
| **活跃周期** | 2023年3月 – 至今 |
| **主要语言** | 英语（勒索信/谈判） |
| **地理归属** | 未确认（可能与马来西亚黑客活动组织有关联，未证实） |
| **攻击目标** | 全球（美国为主要目标） |
| **动机** | 经济利益 |

### 2.2 组织演化时间线

```
2023.03    Cactus 勒索软件首次被发现
           以 cAcTuS.readme.txt 勒索信命名
           .cts / .cactus 扩展名
    ↓
2023.Q3    泄露站公布首批受害者
           利用 Fortinet VPN 漏洞获取初始访问
    ↓
2023.10    利用 CVE-2023-41266/41265（Qlik Sense）
           大规模攻击活动展开
    ↓
2024.01    攻击施耐德电气可持续发展业务部门
           声称窃取 1.5TB 数据
    ↓
2024.02    Bitdefender 披露协调式双目标攻击
           24小时内利用新披露漏洞
    ↓
2024.Q3    利用 CVE-2023-48365（Qlik Sense 补丁绕过）
           扩展攻击规模
    ↓
2025.02    Black Basta 内部聊天记录泄露
           组织结构和内部分裂暴露
    ↓
2025.Q1    Trend Micro 确认 Black Basta 成员转移至 Cactus
           共享 BackConnect、TotalExec、DLL 侧加载技术
    ↓
2025-2026  持续活跃，248+ 受害者
           金融行业重点目标
```

---

## 三、归因分析

### 3.1 地理归属

| 证据类型 | 详情 | 置信度 |
|----------|------|--------|
| **语言分析** | 勒索信和谈判使用英语 | 中 |
| **马来西亚关联** | 部分研究人员推测与同名马来西亚黑客组织有关 | 低（未证实） |
| **基础设施** | C2 服务器分布于多个欧洲国家 | 中 |
| **Black Basta 融合** | 2025年 Black Basta（俄语地区）成员转入 | 中-高 |

### 3.2 关联组织网络

```
┌──────────────────────────────────────────────────────┐
│           Cactus 关联组织网络                          │
├──────────────────────────────────────────────────────┤
│                                                        │
│  ┌─────────────────┐                                  │
│  │ Cactus 核心      │ GOLD VILLAGE / TA2101           │
│  │（RaaS 提供者）    │                                 │
│  └────────┬────────┘                                  │
│           │                                            │
│           ├──→ Black Basta 流离成员（2025年转入）      │
│           │    共享 BackConnect C2                     │
│           │    共享 TotalExec 自动化脚本               │
│           │    共享 DLL 侧加载技术                     │
│           │                                            │
│           ├──→ Storm-0216 / DEV-0216（Microsoft 追踪） │
│           │    恶意广告 + 后门木马入口                  │
│           │                                            │
│           └──→ UNC2198 / TWISTED SPIDER               │
│                社会工程战术                             │
│                                                        │
└──────────────────────────────────────────────────────┘
```

### 3.3 关键人物

| 人物/代号 | 角色 | 状态 |
|-----------|------|------|
| **GOLD VILLAGE** | Secureworks 追踪的操作者 | 未公开 |
| **TA2101 / Storm-0216** | Microsoft 追踪代号 | 未公开 |
| **Black Basta 流离成员** | 2025年转入的技术人员 | 活跃 |

---

## 四、技术能力评估

### 4.1 加密方案

| 属性 | 值 |
|------|-----|
| **对称加密** | AES |
| **非对称加密** | RSA |
| **加密模式** | AES + RSA 混合加密 |
| **自加密技术** | 使用 AES 密钥加密自身可执行文件 |
| **密钥存储** | `C:\ProgramData\ntuser.dat` |
| **文件扩展名** | `.cts1` / `.cts2` / `.cts6` / `.cactus`（后跟一位数字） |
| **勒索信** | `cAcTuS.readme.txt` |

### 4.2 自加密二进制技术

```
┌──────────────────────────────────────────────────────┐
│           Cactus 自加密二进制机制                      │
├──────────────────────────────────────────────────────┤
│                                                        │
│  传统勒索软件：                                        │
│  [可执行文件] → 杀毒软件静态扫描 → 检测/拦截          │
│                                                        │
│  Cactus 自加密：                                       │
│  [加密的可执行文件] → 杀毒软件扫描 → 无法识别          │
│         ↓                                              │
│  计划任务读取 ntuser.dat 中的 AES 密钥                 │
│         ↓                                              │
│  内存中解密 → 执行 → 加密文件                          │
│                                                        │
│  技术细节：                                            │
│  ├── AES 密钥存储在 C:\ProgramData\ntuser.dat         │
│  ├── 通过计划任务触发解密和执行                        │
│  ├── UPX 加壳进一步混淆                                │
│  └── 即使加密失败也通过邮件发送勒索信                  │
│                                                        │
└──────────────────────────────────────────────────────┘
```

### 4.3 双重勒索机制

```
┌─────────────────────────────────────────────────┐
│         Cactus 双重勒索模型                       │
├─────────────────────────────────────────────────┤
│                                                   │
│  第一阶段：数据窃取                               │
│  ├── Rclone 外传至云存储                          │
│  ├── WinSCP 外传至外部基础设施                    │
│  └── MegaSync 数据外传                            │
│                                                   │
│  第二阶段：文件加密                               │
│  ├── AES + RSA 混合加密                           │
│  ├── 自加密二进制逃避检测                         │
│  ├── 删除卷影副本（WMIC）                         │
│  └── 投放勒索信（cAcTuS.readme.txt）              │
│                                                   │
│  第三阶段：勒索谈判                               │
│  ├── Cactus Chat 谈判平台                         │
│  ├── TOR 泄露站公开施压                           │
│  └── 加密货币支付                                 │
│                                                   │
│  第四阶段：数据泄露（如未支付）                    │
│  └── 数据发布至泄露站                             │
│                                                   │
└─────────────────────────────────────────────────┘
```

---

## 五、攻击链分析

### 5.1 初始访问

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **VPN 漏洞利用** | T1190 | Fortinet VPN、Qlik Sense（CVE-2023-41266/41265/48365） |
| **社会工程** | T1566.001 | 邮件轰炸 → Teams 冒充 IT → Quick Assist 远程控制 |
| **恶意广告** | T1583 | Storm-0216 通过恶意广告和后门木马部署 |
| **凭证购买** | T1588.001 | 暗网论坛购买被盗凭证 |

### 5.2 执行与持久化

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **BackConnect** | T1071 | 持久 C2 通道，注册表存储 IP |
| **计划任务** | T1053.005 | 每15分钟重新执行，解密并运行载荷 |
| **DLL 侧加载** | T1574.001 | OneDriveStandaloneUpdater.exe 加载恶意 winhttp.dll |
| **SSH 后门** | T1021.004 | 建立 SSH 连接至 C2 服务器 |
| **注册表启动键** | T1547.001 | HKCU\SOFTWARE\TitanPlus 存储 C2 配置 |

### 5.3 横向移动与发现

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **RDP** | T1021.001 | 远程桌面协议横向移动 |
| **SMB/WinRM** | T1021.002/.006 | Windows 管理共享和远程管理 |
| **Chisel** | T1090 | 加密隧道隐蔽横向移动 |
| **SoftPerfect/PSnmap** | T1046 | 网络资产枚举 |
| **LSASS 转储** | T1003.001 | 凭证提取 |
| **浏览器凭证窃取** | T1555.003 | 浏览器保存的密码提取 |

### 5.4 数据外传

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **Rclone** | T1567.002 | 伪装为 svchost.exe，外传至云存储 |
| **WinSCP** | T1105 | 外传至外部基础设施（pumpkinrab.com） |
| **MegaSync** | T1537 | 云存储数据外传 |

### 5.5 防御规避与影响

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **自加密二进制** | T1027 | AES 密钥加密自身，绕过静态检测 |
| **UPX 加壳** | T1027 | 进一步混淆二进制文件 |
| **msiexec 卸载安全软件** | T1562.001 | 卸载 Sophos 等安全产品 |
| **删除卷影副本** | T1490 | WMIC 命令删除恢复数据 |
| **ESXi/Hyper-V 攻击** | T1486 | 同时攻击虚拟化基础设施 |
| **TotalExec** | T1059.001 | PowerShell 自动化部署加密器 |

---

## 六、受害者分析

### 6.1 规模与地理分布

| 指标 | 值 |
|------|-----|
| **确认受害者** | 248+（泄露站公布） |
| **首要国家** | 美国（102个） |
| **其他目标** | 加拿大（16）、英国（14）、法国（9）、西班牙（6） |

### 6.2 行业分布

| 行业 | 优先级 | 说明 |
|------|--------|------|
| **制造业** | 🔴 首要 | 33个受害者 |
| **商业服务** | 🔴 首要 | 33个受害者 |
| **科技** | 🔴 高 | 29个受害者 |
| **农业与食品** | 🟠 高 | 11个受害者 |
| **消费者服务** | 🟠 高 | 10个受害者 |
| **金融** | 🟠 高 | 重点目标行业 |
| **医疗** | 🟡 中 | 有攻击记录 |

### 6.3 重大攻击事件

| 时间 | 受害者 | 影响 |
|------|--------|------|
| 2024.01 | 施耐德电气（可持续发展部门） | 1.5TB 数据泄露威胁，客户含 Clorox/DHL/DuPont/Hilton/PepsiCo/Walmart |
| 2024.02 | 协调式双目标攻击 | 24小时内利用新漏洞，5分钟间隔同步攻击，ESXi+Hyper-V |
| 2024.08 | CIE Automotive | 知名汽车零部件供应商遭攻击 |
| 2024.11 | 洛杉矶市住房管理局 | 敏感信息泄露 |
| 2024 | Marfrig Global Foods | 全球食品供应链遭攻击 |

---

## 七、RaaS 运营模式分析

### 7.1 组织架构

```
┌──────────────────────────────────────────────────────┐
│              Cactus RaaS 架构                         │
├──────────────────────────────────────────────────────┤
│                                                        │
│  ┌──────────────────┐                                │
│  │ 核心开发团队       │ 编写/维护勒索软件              │
│  │（GOLD VILLAGE）    │ 管理泄露站和谈判平台           │
│  └────────┬─────────┘                                │
│           │                                            │
│           ├──→ 附属机构                                │
│           │    ├── Black Basta 流离成员（2025年转入）  │
│           │    └── 独立附属（暗网招募）                │
│           │                                            │
│           ├──→ Storm-0216（恶意广告入口）              │
│           │                                            │
│           └──→ 共享工具链                              │
│                ├── BackConnect C2                      │
│                ├── TotalExec 自动化脚本                │
│                └── DLL 侧加载技术                      │
│                                                        │
└──────────────────────────────────────────────────────┘
```

### 7.2 漏洞武器化速度

Cactus 最显著的运营特征是**极快的漏洞利用速度**：

| 漏洞 | 披露时间 | Cactus 利用时间 | 间隔 |
|------|----------|----------------|------|
| CVE-2023-41266 | 2023.07 | 2023.07 | < 24小时 |
| CVE-2023-41265 | 2023.07 | 2023.07 | < 24小时 |
| CVE-2023-48365 | 2023.10 | 2023.10 | 补丁发布后立即 |
| Fortinet VPN | 2023 | 2023 | N日利用 |

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
| **域名** | `pumpkinrab.com` | 数据外传目标 |
| **域名** | `zohoservice[.]net` | 工具下载 |
| **域名** | `cactusbloguuodvqjmnzlwetjlpj6aggc6iocwhuupb47laukux7ckid.onion` | 暗网泄露站 |
| **域名** | `sonarmsng5vzwqezlvtu2iiwwdn3dxkhotftikhowpfjuzg7p3ca5eid.onion` | 加密通信平台 |
| **IP** | `38.180.25.3` | C2 服务器 |
| **IP** | `45.8.157.199` | C2 服务器 |
| **IP** | `5.181.3.164` | C2 服务器 |
| **IP** | `185.190.251.16` | C2 服务器 |
| **IP** | `207.90.238.52` | C2 服务器 |
| **IP** | `89.185.80.86` | C2 服务器 |
| **IP** | `45.128.149.32` | C2 服务器 |
| **IP** | `195.123.233.19` | C2 服务器 |
| **IP** | `178.236.247.173` | C2 服务器 |
| **IP** | `5.78.41.255` | C2 服务器 |
| **文件** | `.cts1` / `.cts2` / `.cts6` / `.cactus` | 加密文件扩展名 |
| **文件** | `cAcTuS.readme.txt` | 勒索信 |
| **文件** | `C:\ProgramData\ntuser.dat` | AES 密钥存储位置 |
| **文件** | `winhttp.dll` | REEDBED 加载器（DLL 侧加载） |
| **工具** | BackConnect | 持久 C2 工具 |
| **工具** | TotalExec | PowerShell 自动化部署脚本 |
| **工具** | Chisel | 加密隧道工具 |
| **工具** | Rclone（伪装为 svchost.exe） | 数据外传 |
| **工具** | WinSCP / MegaSync | 数据外传 |
| **工具** | Cobalt Strike / Brute Ratel | C2 框架 |
| **工具** | SoftPerfect Network Scanner / PSnmap | 网络扫描 |

### 8.2 被利用漏洞

| CVE | 影响组件 | CVSS | 说明 |
|-----|----------|------|------|
| CVE-2023-41266 | Qlik Sense Enterprise | 8.2 | 路径遍历，匿名会话生成 |
| CVE-2023-41265 | Qlik Sense Enterprise | 9.8 | HTTP 隧道，未认证 RCE |
| CVE-2023-48365 | Qlik Sense Enterprise | 9.6 | 补丁绕过，未认证 RCE |
| Fortinet VPN | Fortinet VPN 设备 | 严重 | 初始访问向量 |

### 8.3 文件哈希

| 类型 | 哈希值 |
|------|--------|
| SHA256 | `78c16de9fc07f1d0375a093903f86583a4e32037a7da8aa2f90ecb15c4862c17` |
| MD5 | `5737cb3a9a6d22e957cf747986eeb1b3` |
| MD5 | `e28db6a65da2ebcf304873c9a5ed086d` |

### 8.4 攻击工具链

```
VPN 漏洞利用 / 社会工程 / 恶意广告 / 凭证购买
    ↓
BackConnect C2（持久化）
    ↓
DLL 侧加载（OneDriveStandaloneUpdater.exe → winhttp.dll）
    ↓
SSH 后门 / Chisel 隧道（隐蔽通道）
    ↓
LSASS 转储 / 浏览器凭证窃取（凭证访问）
    ↓
SoftPerfect / PSnmap（网络发现）
    ↓
RDP / SMB / WinRM（横向移动）
    ↓
Rclone + WinSCP + MegaSync（数据外传）
    ↓
TotalExec 自动化部署 → Cactus 载荷（自加密二进制 + AES+RSA 加密）
```

---

## 九、检测规则

### 9.1 Sigma 规则

#### 规则 1：Cactus 自加密二进制行为

```yaml
title: Cactus Ransomware - Self-Encrypting Binary Behavior
id: d1e2f3a4-b5c6-7890-abcd-123456789abc
status: experimental
description: 检测 Cactus 勒索软件自加密二进制的典型行为模式
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    ParentImage|endswith: '\cmd.exe'
    CommandLine|contains: 'ntuser.dat'
    Image|endswith: '\rundll32.exe'
  condition: selection
level: critical
tags:
  - attack.defense_evasion
  - attack.t1027
```

#### 规则 2：Cactus DLL 侧加载

```yaml
title: Cactus Ransomware - DLL Sideloading via OneDrive
id: e2f3a4b5-c6d7-8901-bcde-234567890bcd
status: experimental
description: 检测通过 OneDriveStandaloneUpdater.exe 侧加载恶意 DLL 的行为
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    ParentImage|endswith: '\OneDriveStandaloneUpdater.exe'
    Image|endswith: '\rundll32.exe'
  condition: selection
level: critical
tags:
  - attack.privilege_escalation
  - attack.t1574.001
```

#### 规则 3：Cactus 卷影副本删除

```yaml
title: Cactus Ransomware - Volume Shadow Copy Deletion
id: f3a4b5c6-d7e8-9012-cdef-345678901cde
status: experimental
description: 检测 Cactus 勒索软件删除卷影副本的行为
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    CommandLine|contains|all:
      - 'wmic'
      - 'shadowcopy'
      - 'delete'
  condition: selection
level: high
tags:
  - attack.defense_evasion
  - attack.t1490
```

### 9.2 YARA 规则

```yara
rule Cactus_Ransomware {
    meta:
        description = "检测 Cactus 勒索软件载荷"
        author = "Threat Intelligence Team"
        date = "2026-06-24"
        reference = "GOLD VILLAGE / TA2101"
    strings:
        $s1 = "cAcTuS.readme.txt" ascii
        $s2 = ".cts" ascii
        $s3 = ".cactus" ascii
        $s4 = "ntuser.dat" ascii
        $s5 = "TitanPlus" ascii
        $s6 = "TotalExec" ascii
        $hex1 = { 48 89 5C 24 08 48 89 6C 24 10 48 89 74 24 18 }
    condition:
        3 of ($s*) and $hex1
}
```

---

## 十、风险评估矩阵

| 风险维度 | 评分 | 说明 |
|----------|------|------|
| **加密强度** | 8/10 | AES + RSA 混合加密，自加密二进制 |
| **传播能力** | 7/10 | RaaS 模式 + Black Basta 流离成员加入 |
| **规避能力** | 9/10 | 自加密二进制、UPX 加壳、DLL 侧加载 |
| **数据泄露威胁** | 8/10 | 双重勒索 + TOR/clearnet 双泄露站 |
| **漏洞利用速度** | 10/10 | PoC 公开后24小时内即可发起武器化攻击 |
| **基础设施韧性** | 7/10 | 多 C2 服务器、分布式基础设施 |
| **综合风险** | **🔴 极高** | 24小时漏洞武器化 + Black Basta 成员融合 |

---

## 十一、缓解建议

### 11.1 即时行动

1. **检查 IOC**：对照第八节 IOC 列表扫描环境，特别关注 `.cts` / `.cactus` 扩展名
2. **VPN 修补**：立即修复 Fortinet VPN、Qlik Sense 等已知漏洞
3. **24小时补丁响应**：建立漏洞 PoC 公开后24小时内的补丁部署机制
4. **ntuser.dat 监控**：检测 `C:\ProgramData\ntuser.dat` 异常文件创建

### 11.2 短期加固

1. **强制 MFA**：所有远程访问（RDP/VPN）启用多因素认证
2. **网络分段**：隔离关键资产（备份系统、域控制器、ESXi/Hyper-V）
3. **限制远程工具**：审计并限制 Quick Assist、AnyDesk 等远程桌面工具使用
4. **备份验证**：确认离线/不可变备份的完整性和可恢复性

### 11.3 长期策略

1. **零信任架构**：实施网络分段和最小权限原则
2. **漏洞管理**：建立自动化漏洞监控和补丁管理流程
3. **威胁狩猎**：定期针对 Cactus TTPs 进行主动狩猎
4. **社会工程防护**：培训员工识别邮件轰炸 + Teams 冒充 IT 的组合攻击

### 11.4 解密恢复路径

| 维度 | 详情 |
|------|------|
| **解密器状态** | **无公开解密工具** |
| **加密强度** | AES + RSA 混合加密，密码学强度极高 |
| **建议** | 优先从备份恢复；联系 FBI IC3（ic3.gov）报告事件 |

---

## 十二、核心建议

1. **24小时补丁响应**：Cactus 在漏洞 PoC 公开后24小时内即可发起攻击，组织必须建立同等速度的补丁响应机制
2. **自加密检测**：传统基于文件签名的检测方法对 Cactus 无效，需部署行为检测（计划任务 + ntuser.dat 读取 + DLL 加载链）
3. **Black Basta 融合威胁**：Black Basta 成员的加入使 Cactus 实力显著增强，需同时监控两个组织的 TTPs
4. **虚拟化基础设施保护**：Cactus 同时攻击 ESXi 和 Hyper-V，虚拟化安全需纳入防御重点
5. **社会工程组合攻击**：邮件轰炸 → Teams 冒充 IT → Quick Assist 的三阶段攻击链需要多层防御

---

## 十三、附录

### 附录 A：信息来源

| 编号 | 来源 | 日期 |
|------|------|------|
| [1] | Kroll: Cactus Ransomware Analysis | 2024 |
| [2] | Bitdefender: Cactus Ransomware - Coordinated Attack | 2024.02 |
| [3] | Trend Micro: Black Basta Members Join Cactus | 2025 |
| [4] | Arctic Wolf: Cactus Ransomware Threat Profile | 2024 |
| [5] | Darktrace: Cactus Ransomware Detection | 2024 |
| [6] | Barracuda: Cactus Ransomware Analysis | 2024 |
| [7] | Huntress: Cactus Ransomware IOCs | 2024 |
| [8] | SentinelOne: Cactus Ransomware TTPs | 2024 |
| [9] | Ransomware.live: Cactus Statistics | 持续更新 |
| [10] | Check Point: Cactus Ransomware Research | 2024 |

### 附录 B：术语表

| 术语 | 定义 |
|------|------|
| **RaaS** | Ransomware-as-a-Service，勒索软件即服务 |
| **自加密二进制** | 使用 AES 密钥加密自身可执行文件以逃避静态检测 |
| **BackConnect** | 持久化 C2 工具，维持对受感染系统的控制 |
| **TotalExec** | Cactus 自定义 PowerShell 脚本，自动化部署加密器 |
| **DLL 侧加载** | 通过合法应用加载恶意 DLL 的技术 |
| **GOLD VILLAGE** | Secureworks 对 Cactus 操作者的追踪代号 |

### 附录 C：追踪计划

| 维度 | 说明 |
|------|------|
| **组织状态** | 活跃（2026年持续攻击） |
| **Black Basta 融合** | 监控更多 Black Basta 成员转入 Cactus |
| **漏洞利用** | 关注 Cactus 对新 CVE 的武器化速度 |
| **TTPs 监控** | 自加密二进制演化、DLL 侧加载技术更新 |
| **解密工具** | 关注是否有公开解密工具发布 |
