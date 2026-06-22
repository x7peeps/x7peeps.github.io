---
title: "RansomHub"
weight: 7
---

**报告编号**: TIR-2026-0622-007 | **分类等级**: TLP:AMBER | **发布日期**: 2026年6月22日 | **情报来源**: 多源交叉验证（OSINT + 执法通报 + 厂商报告 + CISA/FBI/MS-ISAC/HHS 联合公告 AA24-242A）

---

## 一、执行摘要

**RansomHub**（又名 Greenbottle、Water Bakunawa、Cyclops、Knight）是2024年最具影响力的勒索软件即服务（RaaS）运营组织之一。该组织于 **2024年2月** 首次被发现，通过俄罗斯暗网论坛 **RAMP** 招募附属成员，迅速崛起为 **2024年最活跃的勒索组织**——全年攻击超过 **534 个受害者**，在2024年第三季度一度成为公开受害者数量最多的勒索组织。

<!--more-->

RansomHub 采用 **双重勒索模型**（数据加密 + 数据窃取），以其极具吸引力的 **90/10 附属分成机制**（附属成员保留90%赎金）成功吸引了大量来自 LockBit、ALPHV/BlackCat 等已瓦解组织的高级附属成员。截至2024年8月，FBI 确认 RansomHub 已加密和窃取至少 **210个受害者** 的数据，涉及水务、医疗、政府、金融、能源等关键基础设施领域。

2025年4月1日，RansomHub 暗网泄露站突然下线。DragonForce 勒索组织随后宣布 RansomHub 已"加入联盟"并接管其基础设施。RansomHub 正式停止运营，其附属成员大量迁移至 Qilin、Akira、DragonForce 等组织，推动2025年勒索生态进一步碎片化。

### 关键发现

| 维度 | 关键指标 |
|------|----------|
| **组织规模** | 534+ 受害者（2024年），210+ 经 FBI 确认 |
| **攻击模式** | 双重勒索（加密 + 数据窃取），附带 BitLocker 磁盘锁定 |
| **核心能力** | 多平台加密器（Go/C++）、安全软件卸载、GPO 横向部署 |
| **首要入口** | 钓鱼邮件、已知漏洞利用、密码喷洒、SocGholish/Initial Access Broker |
| **商业模式** | RaaS（附属保留90%，核心10%） |
| **加密器** | Curve 25519 椭圆曲线加密，需密码执行 |
| **关联组织** | Knight/Cyclops（前身）、LockBit/ALPHV（附属来源）、Evil Corp/Scattered Spider |
| **当前状态** | **已停止运营**（2025年4月，被 DragonForce 接管） |

### 威胁等级评估

| 评估维度 | 等级 | 说明 |
|----------|------|------|
| **技术能力** | 🔴 极高 | 多平台加密器、GPO 大规模部署、安全软件卸载、BYOVD |
| **运营成熟度** | 🔴 极高 | 完整 RaaS 平台、附属招募体系、谈判门户 |
| **攻击规模** | 🔴 极高 | 2024年最活跃勒索组织，单季度最高攻击量 |
| **目标针对性** | 🔴 极高 | 关键基础设施全覆盖（水务、医疗、政府、金融、能源） |
| **数据泄露风险** | 🔴 极高 | 双重勒索 + 3-90天支付期限 + 暗网泄露站公开 |

---

## 二、威胁行为者画像

### 2.1 组织标识

| 属性 | 值 |
|------|-----|
| **官方名称** | RansomHub |
| **别名** | Greenbottle（Symantec/Broadcom）、Water Bakunawa（Trend Micro）、Cyclops、Knight |
| **组织类型** | 勒索软件即服务（RaaS） |
| **活跃周期** | 2024年2月 — 2025年4月（约14个月） |
| **主要语言** | 俄语（内部/论坛招募）、英语（对外沟通/泄露站） |
| **地理归属** | 俄罗斯/独联体国家（高置信度） |
| **攻击目标** | 全球企业（重点：关键基础设施） |
| **动机** | 经济利益 |
| **CIS 豁免** | 是（不攻击独联体国家、古巴、朝鲜、中国） |
| **不攻击目标** | 非营利组织（官方承诺） |

### 2.2 组织演化时间线

```
2024.02    RansomHub 首次出现
           用户"koley"在 RAMP 论坛宣布 RaaS 平台上线
           与 Knight/Cyclops 源码高度相似
           Knight 泄露站同步下线
    ↓
2024.03    首批受害者公开
           攻击 Change Healthcare（此前已被 BlackCat 攻击）
           引发 BlackCat 退出骗局关联猜测
    ↓
2024.Q2    快速扩张
           大量 LockBit/ALPHV 附属成员加盟
           90/10 分成模式吸引顶级附属
           攻击覆盖 11 个关键基础设施领域
    ↓
2024.Q3    ★ 成为全球最活跃勒索组织
           公开受害者数量超越所有竞争对手
           美国为首要目标国
    ↓
2024.08    CISA/FBI/MS-ISAC/HHS 联合发布 AA24-242A 公告
           首次系统性披露 IOCs 和 TTPs
    ↓
2024.Q4    SocGholish 初始访问 + Python 后门
           改装 SCUT 工具用于防御规避
           GPO 批量部署勒索软件
    ↓
2025.01    explorer.exe + NOUACCHECK UAC 绕过
           Python 脚本混淆执行 PowerShell
           BitLocker 预认证加密目标磁盘
    ↓
2025.02    磁盘擦除技术 + BitLocker 锁定
           禁用恢复和启动功能
           攻击手法进一步激进化
    ↓
2025.03.31 ★ RansomHub 泄露站突然下线
    ↓
2025.04.08 DragonForce 宣布接管 RansomHub 基础设施
           "RansomHub decided to move to our infrastructure"
           附属成员迁移至 Qilin/Akira/DragonForce
    ↓
2025.04    ★ RansomHub 正式停止运营
           2025年勒索生态碎片化加剧
    ↓
2025.07    Trend Micro 端点传感器仍检测到少量 RansomHub 残留
           可能为遗留样本或残留基础设施
```

### 2.3 别名与追踪实体关系

| 追踪机构 | 命名 | 关系说明 |
|----------|------|----------|
| **Symantec/Broadcom** | Greenbottle | 组织级追踪代号 |
| **Trend Micro** | Water Bakunawa | 组织级追踪代号 |
| **CISA/FBI** | RansomHub / Knight / Cyclops | 官方公告中的多名称引用 |
| **安全社区** | Cyclops / Knight | 前身恶意软件家族名称 |
| **MITRE ATT&CK** | 尚未独立建组 | 活动映射至已有技术条目 |

### 2.4 与 Knight/Cyclops 的关联分析

RansomHub 与 Knight（原名 Cyclops）勒索软件存在极强的技术关联：

| 关联维度 | 证据 |
|----------|------|
| **源码相似性** | 加密器代码结构高度一致，均使用 GoLang + C++ |
| **管理面板** | RaaS 管理面板设计和功能高度相似 |
| **时间线巧合** | Knight 泄露站2024年2月12日下线 → Knight 源码2月18日出售 → RansomHub 同期出现 |
| **语言特征** | 加密器二进制文件的字符串和行为模式一致 |
| **平台共享** | 均在 RAMP 论坛上运营/招募 |

**结论**：RansomHub 极可能是 Knight 勒索软件的直接继承者或品牌重塑，由购买了 Knight 3.0 源码的运营者更新后重新发布。

---

## 三、归因分析

### 3.1 地理归属

| 指标 | 评估 |
|------|------|
| **招募平台** | RAMP（俄语主导的网络犯罪论坛） |
| **语言分析** | 俄语内部沟通，英语对外运营 |
| **豁免策略** | 不攻击 CIS 国家、古巴、朝鲜、中国 |
| **时间模式** | 活动时间与东欧/俄罗斯工作时间吻合 |
| **置信度** | **高** — 俄罗斯或俄罗斯友好组织运营 |

### 3.2 组织结构

```
RansomHub 核心运营团队
├── 恶意软件开发团队
│   ├── 加密器维护（GoLang/GoObfuscate 混淆）
│   ├── ESXi 加密器（C++）
│   └── 工具链开发（SCUT 改装版、Python 后门）
├── 基础设施运营
│   ├── RaaS 管理面板
│   ├── 暗网泄露站（Tor .onion）
│   ├── 谈判门户（Tor .onion）
│   └── C2 服务器
├── 附属网络（Affiliates）
│   ├── 来自 LockBit 的顶级附属
│   ├── 来自 ALPHV/BlackCat 的附属
│   ├── Evil Corp 相关附属
│   ├── Scattered Spider / Octo Tempest
│   └── TA569 / Mustard Tempest（初始访问代理）
└── 初始访问代理（IAB）合作
    ├── SocGholish（FakeUpdates）分发
    ├── 漏洞利用接入
    └── 密码喷洒服务
```

---

## 四、技术能力评估

### 4.1 核心能力矩阵

| 能力维度 | 等级 | 详情 |
|----------|------|------|
| **多平台加密** | 🔴 极高 | Windows（GoLang）、Linux（GoLang）、ESXi（C++） |
| **安全软件对抗** | 🔴 极高 | CrowdStrike/Apex One 卸载脚本、GMER 反Rootkit、BYOVD |
| **大规模部署** | 🔴 极高 | GPO 批量执行、SMB 横向传播 |
| **防御规避** | 🔴 极高 | GoObfuscate 混淆、Python 脚本加密、PowerShell 策略绕过 |
| **持久化能力** | 🔴 高 | 注册表运行键、本地账户创建、自动登录配置 |
| **数据窃取** | 🔴 高 | Rclone、MEGAsync、WinSCP、SFTP |
| **漏洞利用** | 🔴 高 | 多个已知 CVE 链式利用 |
| **凭证窃取** | 🔴 高 | Mimikatz、LSASS 转储 |

### 4.2 加密器技术规格

**RansomHub 加密器**：

| 参数 | 规格 |
|------|------|
| **开发语言** | GoLang（Windows/Linux）、C++（ESXi） |
| **混淆工具** | GoObfuscate |
| **加密算法** | Curve 25519 椭圆曲线加密 |
| **密钥管理** | 每个受害者组织唯一的公私钥对 |
| **执行保护** | **需要密码才能执行**（增加分析难度） |
| **勒索信** | 不包含初始赎金要求，提供 Client ID 和 Tor .onion URL |
| **支付期限** | 3-90天（取决于附属成员） |
| **泄露站** | Tor 网络托管，定期更换 .onion 地址 |
| **卷影副本** | `vssadmin.exe delete shadows` |
| **进程终止** | 加密前终止大量进程以释放文件锁 |
| **附加功能** | BitLocker 预认证加密、磁盘擦除（2025年新增） |

### 4.3 关键 CVE 利用清单

RansomHub 附属成员利用的主要漏洞：

| CVE 编号 | 软件/组件 | 漏洞类型 | CVSS |
|----------|-----------|----------|------|
| **CVE-2020-1472** | Windows Netlogon | 权限提升（Zerologon） | 10.0 |
| **CVE-2023-3519** | Citrix NetScaler ADC/Gateway | 远程代码执行 | 9.8 |
| **CVE-2023-27997** | FortiOS/FortiProxy SSL-VPN | 远程代码执行 | 9.8 |
| **CVE-2023-46604** | Apache ActiveMQ | 远程代码执行 | 10.0 |
| **CVE-2023-22515** | Atlassian Confluence | 权限提升 | 10.0 |
| **CVE-2023-46747** | F5 BIG-IP | 认证绕过/RCE | 9.8 |
| **CVE-2023-48788** | Fortinet FortiClientEMS | SQL 注入 | 9.8 |
| **CVE-2017-0144** | Windows SMBv1（EternalBlue） | 远程代码执行 | 9.8 |
| **CVE-2023-20198** | Cisco IOS XE | 权限提升 | 10.0 |
| **CVE-2023-4966** | Citrix NetScaler（CitrixBleed） | 信息泄露 | 9.4 |

---

## 五、攻击链分析

### 5.1 经典攻击链（双重勒索模式）

```
┌─────────────────────────────────────────────────────────────┐
│  阶段1：初始访问                                             │
│  · 鱼叉式钓鱼邮件（含恶意附件/链接）                         │
│  · SocGholish（SEO 投毒/FakeUpdates）                        │
│  · 已知漏洞利用（VPN/防火墙/网关）                           │
│  · 密码喷洒（针对数据泄露中的凭据）                           │
│  · 初始访问代理（TA569/Scattered Spider）                    │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  阶段2：执行与防御规避                                       │
│  · PowerShell/Python 脚本执行                                │
│  · 解混淆 NODESTEALER → XWORM 加载                           │
│  · 卸载 CrowdStrike/Apex One（Uninstall-CS-ISG.bat）         │
│  · GMER 反Rootkit 工具检测和移除安全工具                     │
│  · 改装 SCUT 工具进行防御规避                                │
│  · BYOVD（Bring Your Own Vulnerable Driver）禁用安全软件     │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  阶段3：持久化与权限提升                                     │
│  · 创建本地管理员账户                                        │
│  · 注册表运行键（HKLM\...\Run）                              │
│  · 启用自动登录（AutoAdminLogon）                             │
│  · fsutil 启用 R2L/R2R 符号链接                              │
│  · Access Token Manipulation（T1134）                        │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  阶段4：凭证访问与发现                                       │
│  · Mimikatz 凭证转储                                         │
│  · LSASS 内存转储                                            │
│  · AngryIPScanner/Nmap/NetScan 网络扫描                     │
│  · PowerShell 远程系统发现                                   │
│  · 定位域控制器和关键资产                                     │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  阶段5：横向移动                                             │
│  · PsExec 远程命令执行                                       │
│  · Python 脚本建立 SSH 连接                                  │
│  · SFTP 传输加密器至多台服务器                                │
│  · GPO 批量部署执行                                         │
│  · SMB 共享投放恶意文件                                      │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  阶段6：数据窃取                                             │
│  · Rclone 同步至远程云存储                                   │
│  · MEGAsync 上传至 MEGA 云盘                                 │
│  · WinSCP/SFTP 外传                                         │
│  · Amazon S3 存储桶利用                                      │
│  · 攻击云存储备份和配置错误的 S3 实例                         │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  阶段7：影响（加密 + 破坏）                                  │
│  · Curve 25519 加密用户文件                                  │
│  · vssadmin.exe 删除卷影副本                                 │
│  · BitLocker 预认证加密目标磁盘（2025年新增）                 │
│  · 磁盘擦除技术（2025年新增）                                │
│  · 禁用 Windows 恢复和启动功能                               │
│  · 投放勒索信（含 Client ID + Tor 联系方式）                 │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 MITRE ATT&CK 映射

| 战术 | 技术 | 技术ID | RansomHub 实现 |
|------|------|--------|----------------|
| **初始访问** | 鱼叉式钓鱼 | T1566 | 含恶意附件的钓鱼邮件 |
| **初始访问** | 利用面向公众的应用漏洞 | T1190 | CVE-2023-3519、CVE-2023-27997 等 |
| **初始访问** | 密码喷洒 | T1110.003 | 针对数据泄露凭据 |
| **执行** | PowerShell | T1059.001 | 混淆脚本执行、策略绕过 |
| **执行** | Python | T1059.006 | vcruntime140.py 脚本链 |
| **执行** | Windows 命令行 | T1059.003 | 批处理文件执行 |
| **持久化** | 注册表运行键 | T1547.001 | HKLM\...\Run |
| **持久化** | 账户创建 | T1136 | 本地管理员账户 |
| **持久化** | 修改注册表 | T1112 | AutoAdminLogon 启用 |
| **权限提升** | UAC 绕过 | T1548.002 | explorer.exe + NOUACCHECK |
| **权限提升** | 访问令牌操作 | T1134 | 列出活动访问令牌进行模拟 |
| **防御规避** | 禁用/修改工具 | T1562.001 | CrowdStrike/Apex One 卸载脚本 |
| **防御规避** | 隐藏窗口 | T1564.003 | Python 脚本创建隐藏 PowerShell |
| **防御规避** | 伪装 | T1036 | Uninstall-CS-ISG.bat 伪装为 CS 卸载脚本 |
| **防御规避** | 启用符号链接 | T1562.004 | fsutil 启用 R2L/R2R 符号链接 |
| **凭证访问** | OS 凭证转储 | T1003 | Mimikatz、LSASS 转储 |
| **发现** | 网络服务扫描 | T1046 | AngryIPScanner、Nmap、NetScan |
| **发现** | 远程系统发现 | T1018 | PowerShell 网络枚举 |
| **横向移动** | PsExec | T1021.002 | 远程命令执行 |
| **横向移动** | SSH | T1021.004 | Python 脚本建立 SSH |
| **横向移动** | 软件部署工具 | T1072 | GPO 批量部署 |
| **收集** | 数据暂存 | T1074 | Rclone/MEGAsync 暂存 |
| **窃取** | 通过云存储外传 | T1567 | MEGAsync、S3 |
| **窃取** | 通过 C2 通道外传 | T1041 | SFTP/HTTPS |
| **影响** | 数据加密 | T1486 | Curve 25519 加密器 |
| **影响** | 禁用系统恢复 | T1490 | vssadmin 删除卷影副本 |
| **影响** | 磁盘擦除 | T1561 | 磁盘擦除技术（2025） |
| **影响** | BitLocker 加密 | T1486 | 预认证加密目标磁盘 |

---

## 六、受害者分析

### 6.1 受害者规模与趋势

| 时段 | 公开受害者数 | 说明 |
|------|-------------|------|
| 2024年2月-6月 | ~50+ | 初期运营，建立品牌 |
| 2024年Q3 | ~150+ | 爆发式增长，成为最活跃组织 |
| 2024年Q4 | ~150+ | 持续活跃，新型攻击链出现 |
| 2024年全年 | **534** | Bitsight 估算，全年最活跃勒索组织 |
| 2025年1-3月 | ~130+ | 仍为最活跃组织 |
| 2025年4月 | 停止运营 | DragonForce 接管 |

### 6.2 行业分布

| 行业 | 说明 |
|------|------|
| **水务与废水处理** | 关键基础设施，高支付意愿 |
| **信息技术** | 技术企业，数据价值高 |
| **政府服务与设施** | 地方/联邦政府机构 |
| **医疗保健与公共卫生** | 医院、制药企业 |
| **紧急服务** | 消防、急救 |
| **食品与农业** | 农业企业、食品加工 |
| **金融服务** | 银行、保险 |
| **商业设施** | 商业综合体 |
| **关键制造业** | 工业制造 |
| **交通运输** | 物流、公共交通 |
| **通信** | 电信运营商 |

### 6.3 地理分布

| 地区 | 占比 | 说明 |
|------|------|------|
| **北美** | ~55% | 美国为绝对首要目标 |
| **欧洲** | ~25% | 英国、德国、法国 |
| **亚太** | ~10% | 澳大利亚、日本 |
| **其他** | ~10% | 南美、中东等 |

### 6.4 重大攻击事件

| 时间 | 事件 | 影响 |
|------|------|------|
| 2024.03 | **Change Healthcare** | 此前已被 BlackCat 攻击，RansomHub 附属再次攻击 |
| 2024.08 | **Halliburton** | 油气巨头遭受网络攻击，业务中断 |
| 2024.Q4 | 多起医疗机构攻击 | 医疗数据泄露 |
| 2025.01 | 多起基础设施攻击 | explorer.exe UAC 绕过部署 |
| 2025.02 | 磁盘擦除攻击 | BitLocker 加密 + 磁盘擦除 |

---

## 七、RaaS 商业模式

### 7.1 附属分成机制

```
┌─────────────────────────────────────────────────────────────┐
│  RansomHub RaaS 分成模型                                    │
│                                                             │
│  赎金支付流程：                                             │
│  受害者 → 附属成员钱包 → 附属转付 10% → RansomHub 核心      │
│                                                             │
│  分成比例：                                                 │
│  · 附属成员：90%                                            │
│  · RansomHub 核心：10%                                      │
│                                                             │
│  对比：                                                     │
│  · LockBit：~75-80% 附属 / 20-25% 核心                     │
│  · ALPHV：~80% 附属 / 20% 核心                              │
│                                                             │
│  RansomHub 的 90/10 分成是行业中最高的附属比例              │
│  这是其快速招募顶级附属的核心竞争力                          │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 附属招募策略

| 策略 | 说明 |
|------|------|
| **高额分成** | 90% 附属比例，行业最高 |
| **独立钱包** | 附属管理自己的钱包，直接从受害者收款 |
| **宽松规则** | 不攻击 CIS、非营利组织，已支付受害者不再攻击 |
| **解密承诺** | 误攻击禁入目标时免费提供解密器 |
| **源码继承** | Knight/Cyclops 成熟代码基础 |
| **品牌信誉** | 快速建立的"可靠性"声誉 |

### 7.3 关联附属组织

| 附属/合作方 | 类型 | 说明 |
|------------|------|------|
| **Scattered Spider / Octo Tempest** | 高级附属 | 社会工程学专家，2024年7月部署 RansomHub |
| **Evil Corp** | 附属 | 通过 SocGholish 获取初始访问后部署 RansomHub |
| **TA569 / Mustard Tempest** | IAB | SocGholish/FakeUpdates 分发，提供初始访问 |
| **SocGholish** | MaaS | SEO 投毒/FakeUpdates 框架，提供初始访问 |

---

## 八、IOC 完整列表

### 8.1 恶意软件哈希

| 类型 | 说明 |
|------|------|
| **RansomHub 加密器** | GoLang/GoObfuscate 混淆，需密码执行（SHA-256 参见 CISA AA24-242A） |
| **NODESTEALER** | Python 脚本，混淆的初始窃取器 |
| **XWORM** | 加密的 XWORM loader，加载 shellcode |
| **SCUT 改装版** | 防御规避工具改装版 |
| **Python 后门** | vcruntime140.py / vcruntime140d.py |

### 8.2 文件路径与工件

| 路径/文件名 | 说明 |
|-------------|------|
| `%TEMP%\uninstall-cs-isg.bat` | CrowdStrike 卸载伪装脚本 |
| `%TEMP%\GMER.exe` | 反Rootkit 工具，用于移除安全工具 |
| `vcruntime140.py` | Python 后门脚本 |
| `vcruntime140d.py` | Python 后门脚本（调试版） |
| `%APPDATA%\MEGAsync\` | MEGAsync 数据窃取工具 |
| `%PUBLIC%\Documents\` | 临时工具投放目录 |

### 8.3 网络指标

| 类型 | 说明 |
|------|------|
| **Tor 泄露站** | 定期更换的 .onion 域名 |
| **Tor 谈判门户** | 勒索信中提供的唯一 .onion URL |
| **C2 通信** | Python 后门与 C2 服务器通信 |
| **数据外传** | Rclone/MEGAsync/SFTP 异常大流量 |
| **GitHub/Dropbox** | 恶意脚本从公开平台下载工具 |

### 8.4 行为指标

| 指标 | 说明 |
|------|------|
| **explorer.exe + NOUACCHECK** | UAC 绕过执行恶意载荷 |
| **fsutil symlink** | 启用 R2L/R2R 符号链接 |
| **GPO 批量部署** | 域控制器上部署 GPO 执行批处理 |
| **vssadmin delete shadows** | 删除卷影副本 |
| **安全软件卸载** | 批处理文件伪装为 CrowdStrike/Apex One 卸载 |
| **GMER 执行** | 反Rootkit 工具扫描和移除安全工具 |
| **BitLocker 激活** | 预认证加密目标磁盘 |
| **AutoAdminLogon** | 注册表修改启用自动登录 |

---

## 九、检测规则

### 9.1 Sigma 规则

**规则1：RansomHub 安全软件卸载检测**

```yaml
title: RansomHub Security Software Uninstallation Attempt
id: ransomhub-security-uninstall-001
status: experimental
description: 检测 RansomHub 伪装卸载安全软件的行为
author: Threat Intelligence Team
date: 2026/06/22
references:
    - https://www.cisa.gov/news-events/cybersecurity-advisories/aa24-242a
    - https://www.trendmicro.com/vinfo/us/security/news/ransomware-spotlight/ransomware-spotlight-ransomhub
tags:
    - attack.defense_evasion
    - attack.t1562.001
logsource:
    category: process_creation
    product: windows
detection:
    selection_bat:
        Image|endswith: '\cmd.exe'
        CommandLine|contains:
            - 'uninstall-cs-isg'
            - 'Uninstall-CS-ISG'
            - 'uninstall'
        CommandLine|contains:
            - 'CrowdStrike'
            - 'Apex One'
    selection_gmer:
        Image|endswith: '\GMER.exe'
    selection_fsutil:
        Image|endswith: '\fsutil.exe'
        CommandLine|contains: 'symlinks'
    condition: selection_bat or selection_gmer or selection_fsutil
level: high
```

**规则2：RansomHub UAC 绕过检测**

```yaml
title: RansomHub UAC Bypass via explorer.exe NOUACCHECK
id: ransomhub-uac-bypass-002
status: experimental
description: 检测 RansomHub 使用 explorer.exe NOUACCHECK 参数进行 UAC 绕过
author: Threat Intelligence Team
date: 2026/06/22
references:
    - https://www.cisa.gov/news-events/cybersecurity-advisories/aa24-242a
tags:
    - attack.privilege_escalation
    - attack.t1548.002
logsource:
    category: process_creation
    product: windows
detection:
    selection:
        Image|endswith: '\explorer.exe'
        CommandLine|contains: 'NOUACCHECK'
    condition: selection
level: critical
```

**规则3：RansomHub 卷影副本删除检测**

```yaml
title: RansomHub Volume Shadow Copy Deletion
id: ransomhub-vss-deletion-003
status: experimental
description: 检测 RansomHub 删除卷影副本的典型行为
author: Threat Intelligence Team
date: 2026/06/22
references:
    - https://www.cisa.gov/news-events/cybersecurity-advisories/aa24-242a
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
            - 'Delete Shadows'
            - 'delete shadowcopy'
    selection_wmic:
        Image|endswith: '\wmic.exe'
        CommandLine|contains: 'shadowcopy delete'
    selection_powershell:
        Image|endswith: '\powershell.exe'
        CommandLine|contains:
            - 'Win32_ShadowCopy'
            - 'Delete()'
    condition: selection_vssadmin or selection_wmic or selection_powershell
level: critical
```

**规则4：RansomHub BitLocker 磁盘加密检测**

```yaml
title: RansomHub BitLocker Pre-boot Authentication Abuse
id: ransomhub-bitlocker-004
status: experimental
description: 检测 RansomHub 使用 BitLocker 预认证加密目标磁盘
author: Threat Intelligence Team
date: 2026/06/22
references:
    - https://www.trendmicro.com/vinfo/us/security/news/ransomware-spotlight/ransomware-spotlight-ransomhub
tags:
    - attack.impact
    - attack.t1486
logsource:
    category: process_creation
    product: windows
detection:
    selection_manage_bde:
        Image|endswith: '\manage-bde.exe'
        CommandLine|contains:
            '-protectors'
            '-enable'
    selection_recovery_off:
        CommandLine|contains:
            '-recoveryoff'
    condition: selection_manage_bde or selection_recovery_off
level: critical
```

### 9.2 YARA 规则

**规则1：RansomHub 加密器检测**

```yara
rule RansomHub_Encryptor {
    meta:
        description = "Detects RansomHub ransomware encryptor variants"
        author = "Threat Intelligence Team"
        date = "2026-06-22"
        reference = "CISA AA24-242A"
        tlp = "AMBER"
    strings:
        $golang = "Go" ascii
        $obfuscate = "GoObfuscate" ascii
        $curve = "Curve25519" ascii nocase
        $note1 = "Your personal ID" ascii
        $note2 = ".onion" ascii
        $note3 = "ransom" ascii nocase
        $note4 = "decrypt" ascii nocase
        $vss1 = "vssadmin" ascii nocase
        $vss2 = "delete shadows" ascii nocase
    condition:
        uint16(0) == 0x5A4D and
        $golang and ($obfuscate or $curve) and
        2 of ($note*) and
        1 of ($vss*)
}
```

**规则2：NODESTEALER Python 脚本检测**

```yara
rule RansomHub_NODESTEALER {
    meta:
        description = "Detects RansomHub NODESTEALER Python script"
        author = "Threat Intelligence Team"
        date = "2026-06-22"
        reference = "Trend Micro Ransomware Spotlight"
        tlp = "AMBER"
    strings:
        $s1 = "NODESTEALER" ascii
        $s2 = "XWORM" ascii
        $s3 = "vcruntime140" ascii
        $s4 = "github.com" ascii
        $s5 = "dropbox.com" ascii
        $s6 = "requests.get" ascii
        $s7 = "exec(" ascii
        $s8 = "base64" ascii
    condition:
        4 of ($s*)
}
```

---

## 十、应急排查与日志痕迹分析

### 10.1 Windows 事件日志排查

| 日志源 | 事件ID | 排查要点 |
|--------|--------|----------|
| **Security** | 4624/4625 | 异常登录来源、密码喷洒失败记录 |
| **Security** | 4672 | 特权登录（本地管理员） |
| **Security** | 4720/4722/4723/4724/4725/4726 | 账户创建/启用/密码修改/禁用/删除 |
| **Security** | 4688 | 进程创建（关注 explorer.exe + NOUACCHECK） |
| **Security** | 4697/4698 | 服务安装/计划任务创建 |
| **System** | 7045 | 新服务安装 |
| **PowerShell** | 4103/4104 | PowerShell 模块日志和脚本块日志 |
| **Sysmon** | 1/3/7/8/10/11 | 进程创建、网络连接、进程访问、加载镜像、文件创建 |

### 10.2 关键排查命令

```powershell
# 检查异常用户账户
net user
net localgroup administrators
Get-LocalUser | Where-Object {$_.Enabled -eq $true}
Get-LocalGroupMember -Group "Administrators"

# 检查注册表运行键
reg query "HKLM\Software\Microsoft\Windows\CurrentVersion\Run"
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
reg query "HKLM\Software\Microsoft\Windows NT\CurrentVersion\Winlogon" /v AutoAdminLogon

# 检查计划任务
schtasks /query /fo LIST /v
Get-ScheduledTask | Where-Object {$_.State -ne "Disabled"}

# 检查异常服务
sc query type= service state= all
Get-WmiObject win32_service | Select-Object Name,PathName,StartMode | Sort-Object StartMode

# 检查网络连接
netstat -ano
Get-NetTCPConnection | Where-Object {$_.State -eq "Established"}

# 检查进程
tasklist /v
Get-Process | Select-Object Id,ProcessName,Path | Sort-Object ProcessName

# 检查 BitLocker 状态
manage-bde -status
manage-bde -protectors -get C:

# 检查卷影副本
vssadmin list shadows
Get-WmiObject Win32_ShadowCopy

# 检查安全软件状态
Get-Service -Name "CSFalconService" -ErrorAction SilentlyContinue
Get-Service -Name "WRSVC" -ErrorAction SilentlyContinue
```

### 10.3 网络流量排查

| 排查维度 | 关键特征 |
|----------|----------|
| **Tor 通信** | 出站连接至 Tor 入口节点（常见端口 443/9001/9030） |
| **MEGAsync** | MEGA 云同步工具的异常出站流量 |
| **Rclone** | Rclone 工具的云存储同步流量 |
| **SFTP** | 异常的 SFTP 大量文件传输 |
| **GitHub/Dropbox** | 从公开平台下载脚本的异常请求 |
| **PowerShell** | 异常 PowerShell 外连 HTTP/HTTPS |

### 10.4 文件系统排查

| 排查路径 | 说明 |
|----------|------|
| `%TEMP%\uninstall-cs-isg.bat` | CrowdStrike 卸载伪装脚本 |
| `%TEMP%\GMER.exe` | 反Rootkit 工具 |
| `%APPDATA%\vcruntime140.py` | Python 后门脚本 |
| `%APPDATA%\MEGAsync\` | MEGAsync 数据窃取工具 |
| `%PUBLIC%\Documents\` | 临时工具投放目录 |
| `C:\Users\*\Downloads\*` | 可疑下载文件 |
| 各磁盘根目录 | 勒索信文件 |

---

## 十一、风险评估矩阵

### 11.1 综合风险评分

| 维度 | 评分(1-10) | 说明 |
|------|-----------|------|
| **技术能力** | 9 | 多平台加密器、GPO 部署、安全软件卸载 |
| **运营成熟度** | 8 | 完整 RaaS 平台，但仅运营14个月 |
| **攻击规模** | 9 | 2024年最活跃勒索组织 |
| **财务影响** | 8 | 534+ 受害者，90/10 分成模式 |
| **目标范围** | 9 | 11个关键基础设施领域 |
| **反检测能力** | 9 | GoObfuscate 混淆、BYOVD、安全软件卸载 |
| **适应能力** | 9 | 从 Knight 演化，快速适应新攻击手法 |
| **抗执法能力** | 7 | 已停止运营（被 DragonForce 接管） |
| **综合评分** | **8.5/10** | **极高威胁（已停止但附属活跃）** |

### 11.2 风险热图

```
            低影响    中影响    高影响    极高影响
可能性      │         │         │         │
极高        │         │         │    ★    │  ← 关键基础设施
高          │         │         │    ★    │  ← 大型企业
中          │         │    ★    │         │  ← 中型企业
低          │         │    ★    │         │  ← 小型企业
            │         │         │         │
```

---

## 十二、缓解建议

### 12.1 紧急措施（24小时内）

| 优先级 | 措施 | 说明 |
|--------|------|------|
| **P0** | 修补已知 CVE | 优先修补 CVE-2020-1472、CVE-2023-3519、CVE-2023-27997 等 RansomHub 常用漏洞 |
| **P0** | 强制 MFA | 在所有 VPN、远程访问、特权账户上启用防钓鱼 MFA |
| **P0** | 检查安全软件状态 | 确认 CrowdStrike/Apex One 等 EDR 正常运行，检测异常卸载 |
| **P1** | 审计特权账户 | 检查本地管理员账户是否异常创建/启用 |
| **P1** | 检查 BitLocker 状态 | 确认无异常 BitLocker 加密激活 |

### 12.2 短期措施（1周内）

| 优先级 | 措施 | 说明 |
|--------|------|------|
| **P1** | 导入检测规则 | 部署上述 Sigma 规则和 YARA 规则 |
| **P1** | 审查 PowerShell 日志 | 检查 4103/4104 事件中的异常脚本执行 |
| **P2** | 网络分段 | 隔离关键资产，限制横向移动路径 |
| **P2** | 部署 DLP | 监控 Rclone/MEGAsync/SFTP 异常数据传输 |
| **P2** | 更新 IDS/IPS | 导入 RansomHub 相关 IOC |
| **P2** | 审查 GPO | 检查域控制器上是否存在异常 GPO 部署 |

### 12.3 长期措施（1-3个月）

| 优先级 | 措施 | 说明 |
|--------|------|------|
| **P1** | 零信任架构 | 实施零信任安全模型，最小权限原则 |
| **P1** | 备份验证 | 确保 3-2-1 备份策略，测试恢复流程 |
| **P2** | EDR 覆盖 | 确保所有端点和服务器部署具备行为分析的 EDR |
| **P2** | 威胁情报共享 | 加入行业 ISAC，获取最新威胁情报 |
| **P2** | 事件响应演练 | 定期进行勒索软件攻击模拟演练 |
| **P3** | 员工安全意识 | 针对钓鱼和社会工程学进行专项培训 |

### 12.4 针对已停止运营的特别说明

虽然 RansomHub 已于2025年4月停止运营，但以下风险仍然存在：

| 风险 | 说明 |
|------|------|
| **附属迁移** | RansomHub 附属已迁移至 Qilin、Akira、DragonForce 等组织，继续使用相似 TTPs |
| **代码复用** | RansomHub/Knight 源码可能被其他组织购买和使用 |
| **残留样本** | 端点上可能仍存在未检测的 RansomHub 残留样本 |
| **相似攻击** | 未来可能出现使用 RansomHub TTPs 的新型勒索组织 |

---

## 十三、核心建议

### 对企业管理层

1. **RansomHub 虽已停止但威胁延续** — 其附属成员已迁移至其他组织，使用相似攻击手法。防御策略不应因品牌消失而放松
2. **90/10 分成模式改变了勒索生态** — 高额分成吸引更多附属成员，即使组织消失，攻击能力仍在
3. **关键基础设施是首要目标** — 水务、医疗、政府、能源企业应将勒索防御列为最高优先级
4. **备份是最后防线** — 确保至少一份备份完全离线且不可变，定期测试恢复流程

### 对安全运营团队

1. **监控安全软件完整性** — RansomHub 专门针对 CrowdStrike/Apex One 进行卸载，定期验证安全工具运行状态
2. **关注 GPO 变更** — 域控制器上的异常 GPO 部署是大规模勒索软件投放的前兆
3. **检测 PowerShell 滥用** — 启用 PowerShell 模块日志和脚本块日志，关注混淆脚本执行
4. **监控数据外传工具** — Rclone、MEGAsync、SFTP 等合法工具的异常使用是数据窃取的关键指标
5. **BitLocker 异常激活** — 监控 BitLocker 状态变化，异常的预认证加密可能是勒索前兆

### 对执法与政策制定者

1. **RaaS 生态碎片化加剧执法难度** — 组织关闭后附属迁移至其他品牌，需要持续追踪
2. **跨组织情报共享** — RansomHub 的 TTPs 和 IOC 适用于多个当前活跃的勒索组织
3. **加密货币追踪** — 追踪 RansomHub 附属的加密货币洗钱路径

---

## 附录

### 附录A：参考资料

| 来源 | 文档 | 日期 |
|------|------|------|
| **CISA/FBI/MS-ISAC/HHS** | AA24-242A: #StopRansomware: RansomHub Ransomware | 2024.08.29 |
| **Trend Micro** | Ransomware Spotlight: RansomHub | 2024.12.20（2025.08更新） |
| **Symantec/Broadcom** | Ransomware 2025: A Resilient and Persistent Threat | 2025.02 |
| **Bitsight** | Inside RansomHub: Tactics, Targets, and What It Means for You | 2025.06 |
| **AttackIQ** | Emulating the Relentless RansomHub Ransomware | 2025.03 |
| **Picus Security** | RansomHub Analysis: TTPs and Attack Chain | 2026.02 |
| **GuidePoint Security** | RansomHub Affiliate Leverages Python-based Backdoor | 2024.Q4 |
| **Threatdown/Malwarebytes** | Ransomware in April 2025—RansomHub is gone | 2025.05 |
| **Comparitech** | Ransomware Attack 2025 Recap | 2025.12 |

### 附录B：术语表

| 术语 | 定义 |
|------|------|
| **RaaS** | Ransomware-as-a-Service，勒索软件即服务 |
| **IAB** | Initial Access Broker，初始访问代理 |
| **BYOVD** | Bring Your Own Vulnerable Driver，自带易受攻击驱动 |
| **GPO** | Group Policy Object，组策略对象 |
| **双勒索** | 数据加密 + 数据窃取的勒索模式 |
| **CIS** | Commonwealth of Independent States，独联体 |
| **SocGholish** | 通过 SEO 投毒分发的 MaaS 框架（FakeUpdates） |
| **Curve 25519** | 椭圆曲线 Diffie-Hellman 密钥交换算法 |
| **GoObfuscate** | GoLang 代码混淆工具 |
| **EDR** | Endpoint Detection and Response，端点检测与响应 |

### 附录C：追踪计划

| 追踪项 | 频率 | 说明 |
|--------|------|------|
| 残留样本检测 | 每周 | 监控端点上的 RansomHub 检测结果 |
| 附属迁移追踪 | 每月 | 追踪前 RansomHub 附属在新组织的活动 |
| 源码复用监控 | 每月 | 监控暗网论坛上 Knight/RansomHub 源码交易 |
| 相似 TTPs 组织 | 每月 | 识别使用相似攻击手法的新型勒索组织 |
| DragonForce 动态 | 每周 | 监控接管 RansomHub 基础设施后的运营变化 |

---

> **免责声明**：本报告基于公开威胁情报来源编制，仅供安全研究与防御参考。IOC 可能随时间变化，建议结合最新情报源进行验证。报告中的 MITRE ATT&CK® 技术标识基于 MITRE ATT&CK for Enterprise v15。
