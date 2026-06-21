---
title: "Cl0p"
weight: 6
---

**报告编号**: TIR-2026-0621-006 | **分类等级**: TLP:AMBER | **发布日期**: 2026年6月21日 | **情报来源**: 多源交叉验证（OSINT + 执法通报 + 厂商报告 + CISA/FBI CSA）

---

## 一、执行摘要

**Cl0p**（又称 CL0P、Clop、TA505、FIN11）是全球最具破坏力和技术最先进的勒索软件即服务（RaaS）组织之一。该组织于2019年2月首次被发现，由 CryptoMix 勒索软件变种演化而来，隶属于历史悠久的大型网络犯罪集团 **TA505**。截至2026年6月，Cl0p 已窃取自超过 **11,000 个组织** 的敏感数据，累计勒索金额超过 **5 亿美元**，是历史上获利最高的勒索软件运营者之一。

<!--more-->

Cl0p 最显著的特征是其对 **托管文件传输（MFT）软件零日漏洞** 的系统性利用——通过2023年 MOVEit Transfer 漏洞攻击一次性影响 **2,773 个组织**，创下历史上单次网络攻击影响范围之最。2024-2025年，该组织又利用 Cleo 平台漏洞（CVE-2024-50623）攻击超过 **300 个组织**，并在2025年回归成为 **全球第三大活跃勒索组织**（469 个公开受害者，同比增长1,413%）。

### 关键发现

| 维度 | 关键指标 |
|------|----------|
| **组织规模** | 11,000+ 受害组织，5亿美元+勒索金额 |
| **攻击模式** | 纯数据窃取勒索（已放弃加密），四重勒索模型 |
| **核心能力** | 零日漏洞获取与武器化（MFT 软件专项） |
| **首要入口** | MFT 软件零日漏洞（MOVEit、Cleo、Accellion、GoAnywhere） |
| **商业模式** | RaaS + 初始访问代理 + 大规模僵尸网络运营 |
| **加密器** | ClopEncryptor（RSA + AES 混合加密），2021年后逐步弃用 |
| **关联组织** | TA505、FIN11、Graceful Spider、Lace Tempest、UNCA2546、UNCA2582 |
| **美国悬赏** | **1,000 万美元**（用于将 Cl0p 成员与外国政府关联的信息） |
| **解密可能性** | 部分可解密（早期加密受害者可尝试，纯数据窃取阶段无加密） |

### 威胁等级评估

| 评估维度 | 等级 | 说明 |
|----------|------|------|
| **技术能力** | 🔴 极高 | 零日漏洞获取、MFT 软件武器化、大规模自动化数据窃取 |
| **运营成熟度** | 🔴 极高 | 10年+运营历史、多业务线（RaaS + IAB + 僵尸网络） |
| **攻击规模** | 🔴 极高 | 单次 MOVEit 攻击影响 2,773 个组织，史上最大规模 |
| **目标针对性** | 🔴 极高 | 金融、医疗、政府、教育、科技、制造业全覆盖 |
| **数据泄露风险** | 🔴 极高 | 四重勒索：数据窃取 + 公开泄露 + 直接联系客户/合作伙伴 + DDoS 威胁 |

---

## 二、威胁行为者画像

### 2.1 组织标识

| 属性 | 值 |
|------|-----|
| **官方名称** | Cl0p（CL0P / Clop） |
| **别名** | TA505、FIN11、Graceful Spider、Lace Tempest、Spandex Tempest、DEV-0950、GOLD TAHOE、GOLD EVERGREEN、Chimborazo、Hive0065、ATK103、SectorJ04、Money Finance、Dudear |
| **MITRE ATT&CK** | G0092 |
| **组织类型** | 勒索软件即服务（RaaS）+ 初始访问代理（IAB）+ 僵尸网络运营 |
| **活跃周期** | TA505：2014年至今；Cl0p 勒索品牌：2019年2月至今 |
| **主要语言** | 英语（对外沟通/泄露站）、俄语（内部沟通） |
| **地理归属** | 俄罗斯/独联体国家（高置信度） |
| **攻击目标** | 全球企业（金融、医疗、政府、教育、科技、制造） |
| **动机** | 经济利益 |
| **CIS 豁免** | 是（不攻击独联体国家目标） |

### 2.2 组织演化时间线

```
2014       TA505 开始活跃
           运营 Necurs 僵尸网络（全球最大之一）
           分发 Dridex 银行木马、Locky 勒索软件
    ↓
2019.02    Cl0p 勒索软件首次出现
           作为 CryptoMix 变种演化而来
           通过大规模鱼叉式钓鱼活动部署
           使用签名验证的二进制文件规避检测
    ↓
2020       转向"双重勒索"模式
           数据窃取 + 系统加密
           启用 CL0P^_-LEAKS 暗网泄露站
           开始利用 Accellion FTA 零日漏洞
    ↓
2020-21    Accellion FTA 攻击活动
           部署 DEWMODE webshell 窃取数据
           影响多家政府和企业组织
    ↓
2021.06    国际执法打击
           6名涉嫌成员在乌克兰被捕
           部分基础设施被查封
    ↓
2021-22    组织重组，继续运营
           逐步从加密转向纯数据窃取勒索
           FIN11/DEV-0950 利用 Accellion FTA 零日
    ↓
2023.01    Fortra GoAnywhere MFT 攻击活动
           利用 API 漏洞进行大规模数据窃取
    ↓
2023.05    ★ MOVEit Transfer 零日攻击（CVE-2023-34362）
           SQL 注入 → LEMURLOOT webshell → 数据库窃取
           影响 2,773 个组织，窃取数十 TB 数据
           勒索收入约 7,500万-1亿美元
    ↓
2024.12    Cleo 平台攻击活动开始
           利用 CVE-2024-50623（ unrestricted file upload）
           宣布 60+ 受害者
    ↓
2025.02    Cleo 攻击大规模爆发
           182 个 Cleo 受害者被公开
           2025年全年 469 个受害者（同比增长 1,413%）
           成为全球第三大活跃勒索组织
    ↓
2025.07    Oracle E-Business Suite 零日攻击
           CVE-2025-61882（CVSS 9.8）
           攻击 Envoy Air（美国航空子公司）等
    ↓
2026       持续活跃，转向云环境和供应链攻击
           加强 AI/ML 驱动攻击工具使用
           多国政府列为最高优先级网络威胁
```

### 2.3 别名与追踪实体关系

| 追踪机构 | 命名 | 关系说明 |
|----------|------|----------|
| **Proofpoint** | TA505 | 最初命名，2014年起追踪 |
| **Mandiant/Google** | FIN11 | 2016年起独立追踪，与 TA505 有重大重叠 |
| **Microsoft** | DEV-0950 / Lace Tempest / Spandex Tempest | 多个追踪代号对应不同活动阶段 |
| **CrowdStrike** | GRACEFUL SPIDER / MONTY SPIDER | 蜘蛛系列命名 |
| **IBM** | GOLD TAHOE / GOLD EVERGREEN | 黄金系列命名 |
| **Proofpoint** | SectorJ04 | 行业追踪代号 |
| **安全社区** | FIN11 / Chimborazo / Hive0065 / ATK103 | 多机构交叉引用 |
| **Trend Micro** | UNCA2546 / UNCA2582 | 与 FIN11 关联的两个具体行动集群 |

---

## 三、归因分析

### 3.1 地理归属

| 指标 | 评估 |
|------|------|
| **语言分析** | 俄语（内部沟通），CIS 国家豁免策略 |
| **活动时间模式** | 与东欧/俄罗斯工作时间高度吻合 |
| **基础设施** | 历史上使用独联体国家托管的 C2 服务器 |
| **执法行动** | 2021年6名嫌疑人在乌克兰被捕 |
| **恶意软件特征** | 不加密 CIS 国家语言的系统区域设置 |
| **置信度** | **高** — 俄罗斯/独联体国家运营 |

### 3.2 组织结构

```
TA505 核心领导层
├── 恶意软件开发团队
│   ├── ClopEncryptor 维护
│   ├── 零日漏洞武器化
│   └── Webshell 开发（LEMURLOOT、DEWMODE）
├── 基础设施运营
│   ├── C2 服务器管理
│   ├── 暗网泄露站运营（CL0P^_-LEAKS）
│   └── 域名前置/流量分发
├── 勒索运营团队
│   ├── 谈判专家
│   ├── 加密货币洗钱
│   └── 受害者联络
├── 附属网络（Affiliates）
│   ├── UNCA2546（Accellion 攻击集群）
│   ├── UNCA2582（Accellion 攻击集群）
│   └── 其他独立附属成员
└── 初始访问代理（IAB）服务
    ├── 企业网络访问销售
    └── 僵尸网络运营（Necurs 等）
```

### 3.3 关联恶意软件生态

TA505 是网络犯罪领域最具影响力的恶意软件分发者之一，其关联恶意软件家族包括：

| 恶意软件 | 类型 | 时期 | 说明 |
|----------|------|------|------|
| **Necurs** | 僵尸网络 | 2014-2017 | 全球最大僵尸网络之一，分发 Dridex/Locky |
| **Dridex** | 银行木马 | 2014-至今 | 通过 Necurs 分发，大规模邮件活动 |
| **Locky** | 勒索软件 | 2016-2017 | 通过 Dridex/Necurs 分发 |
| **FlawedAmmyy** | RAT | 2018-2019 | 远程访问工具 |
| **FlawedGrace** | RAT | 2019-2020 | 下一代远程访问工具 |
| **Get2** | 下载器 | 2019-2020 | 多阶段载荷投递 |
| **SDBBot** | 后门 | 2019-2020 | 与 Get2 配合使用 |
| **TrueBot** | 信息窃取器 | 2020-2023 | 初始侦察和数据收集 |
| **ServHelper** | 后门 | 2019 | 通过 RDP 持久化 |
| **MirrorBlast** | 加载器 | 2021-2022 | TrickBot 分发链 |
| **ClopEncryptor** | 加密器 | 2019-2022 | Cl0p 专用文件加密工具 |
| **LEMURLOOT** | Webshell | 2023 | MOVEit 攻击专用 |
| **DEWMODE** | Webshell | 2020-2021 | Accellion FTA 攻击专用 |
| **Batel / StealBit** | 数据窃取 | 2024-2025 | 专用数据外传工具 |
| **RMS** | RAT | 2024-2025 | 新一代远程管理工具 |

---

## 四、技术能力评估

### 4.1 核心能力矩阵

| 能力维度 | 等级 | 详情 |
|----------|------|------|
| **零日漏洞获取** | 🔴 极高 | 多次成功利用零日漏洞（MOVEit、Cleo、Accellion、Oracle EBS） |
| **漏洞武器化速度** | 🔴 极高 | 从漏洞发现到大规模武器化部署仅需数天 |
| **大规模自动化** | 🔴 极高 | 单次活动可影响数千组织（MOVEit: 2,773） |
| **数据窃取能力** | 🔴 极高 | 数十 TB 级数据外传，使用合法工具规避检测 |
| **反取证能力** | 🟡 高 | 域名前置、Tor 网络、加密通信 |
| **加密能力** | 🟡 高 | RSA + AES 混合加密（已逐步弃用） |
| **跨平台能力** | 🟡 高 | Windows、Linux 服务器、Web 应用 |
| **洗钱能力** | 🔴 极高 | 多层加密货币清洗、混币服务 |

### 4.2 零日漏洞武器库

Cl0p 最突出的技术能力在于对 MFT 和企业软件零日漏洞的系统性获取与武器化：

| CVE 编号 | 软件 | CVSS | 利用时间 | 影响 |
|----------|------|------|----------|------|
| **CVE-2023-34362** | Progress MOVEit Transfer | 9.8 | 2023.05 | 2,773 组织，数十 TB 数据 |
| **CVE-2024-50623** | Cleo Harmony/LexiCom/VersaLex | 未公开 | 2024.12-2025 | 300+ 组织，182+ 公开受害者 |
| **CVE-2025-61882** | Oracle E-Business Suite | 9.8 | 2025 | 多个大型企业 |
| **CVE-2021-27860** | Accellion FTA | 未公开 | 2020-2021 | 多个政府和企业组织 |
| **CVE-2021-27861** | Accellion FTA | 未公开 | 2020-2021 | 多个政府和企业组织 |
| **CVE-2023-0663** | Fortra GoAnywhere MFT | 未公开 | 2023.01 | 大规模数据窃取 |
| **CVE-2022-31199** | Netwrix Auditor | 9.8 | 2022 | TrueBot 投递 |
| **CVE-2024-xxxx** | SolarWinds Serv-U | 未公开 | 2024 | 数据窃取 |

### 4.3 加密器技术规格

**ClopEncryptor**（2019-2022，逐步弃用）：

| 参数 | 规格 |
|------|------|
| **加密算法** | AES-256-CBC + RSA-2048/4096 |
| **文件扩展名** | `.clop` |
| **勒索信** | `Read Me - How To Decrypt Your Files.html` |
| **密钥管理** | 每文件唯一 AES 密钥，RSA 公钥加密 AES 密钥 |
| **排除目录** | `%WINDIR%`、`%ProgramFiles%`、`Boot` 等系统目录 |
| **卷影副本** | 使用 `vssadmin delete shadows` 删除 |
| **CIS 豁免** | 检查系统语言，跳过 CIS 国家语言环境 |

> **重要转变**：自2021年起，Cl0p 逐步放弃文件加密，转向纯数据窃取勒索模式。这一策略转变降低了运营风险，同时保持了强大的勒索杠杆。

---

## 五、攻击链分析

### 5.1 经典攻击链（MFT 零日利用模式）

Cl0p 的攻击链以 **零日漏洞驱动的 MFT 软件攻击** 为核心，具有高度标准化和自动化特征：

```
┌─────────────────────────────────────────────────────────────┐
│  阶段1：侦察与目标选择                                        │
│  · Shodan/Censys 扫描识别暴露的 MFT 服务器                    │
│  · 确认目标运行易受攻击的软件版本                              │
│  · 评估目标数据价值（金融/医疗/政府优先）                      │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  阶段2：初始访问（零日利用）                                   │
│  · 利用 MFT 软件零日漏洞（SQL 注入/文件上传/代码执行）         │
│  · 部署自定义 Webshell（LEMURLOOT / DEWMODE）                 │
│  · 通过 Webshell 建立持久化访问                               │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  阶段3：数据发现与收集                                        │
│  · Webshell 直接查询 MFT 数据库                               │
│  · 识别高价值文件（财务、客户、医疗记录、合同）                 │
│  · 使用 MFT 内置功能进行批量数据导出                           │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  阶段4：数据外传                                              │
│  · 通过加密通道（HTTPS/SFTP）分批传输                         │
│  · 使用 Rclone/MegaSync 等合法工具辅助外传                    │
│  · 压缩加密后传输，规避 DLP 检测                              │
│  · 数据总量可达数十 TB                                        │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  阶段5：勒索与 extortion                                      │
│  · 通过 CL0P^_-LEAKS Tor 站点威胁公开数据                     │
│  · 直接联系受害者高管（CEO/CFO/CISO）                         │
│  · 联系受害者客户和合作伙伴施压                                │
│  · 设定支付期限，威胁 DDoS 攻击                               │
│  · 通过 Tor 专属谈判站点进行赎金协商                           │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 MITRE ATT&CK 映射

| 战术 | 技术 | 技术ID | Cl0p 实现 |
|------|------|--------|-----------|
| **初始访问** | 利用面向公众的应用漏洞 | T1190 | MOVEit/Cleo/Accellion 零日利用 |
| **初始访问** | 鱼叉式钓鱼 | T1566 | 大规模钓鱼邮件活动（早期） |
| **执行** | 命令和脚本解释器（PowerShell） | T1059.001 | 信息收集、权限提升 |
| **执行** | 用户执行：恶意链接 | T1204 | 宏文档投递（早期） |
| **持久化** | Webshell | T1505.003 | LEMURLOOT、DEWMODE |
| **持久化** | 计划任务 | T1053.005 | 隐蔽持久化 |
| **持久化** | 注册表运行键 | T1547.001 | 启动持久化 |
| **权限提升** | 访问令牌操作 | T1134 | 令牌模拟/冒充 |
| **防御规避** | 指标伪装 | T1036 | 签名验证二进制文件 |
| **防御规避** | 混淆文件/信息 | T1027 | 加密通信通道 |
| **凭证访问** | OS 凭证转储 | T1003 | LSASS 内存转储 |
| **发现** | 网络服务发现 | T1046 | 内部网络扫描 |
| **发现** | 远程系统发现 | T1018 | 横向移动目标识别 |
| **横向移动** | 远程服务会话主机 | T1021 | RDP/SMB 横向移动 |
| **横向移动** | 软件部署工具 | T1072 | 第三方工具滥用 |
| **收集** | 数据存储中的数据 | T1005 | MFT 数据库直接查询 |
| **窃取** | 自动化工具外传 | T1567 | Rclone、MegaSync |
| **窃取** | 通过 C2 通道外传 | T1041 | 加密 HTTPS/SFTP 通道 |
| **影响** | 数据加密/系统锁定 | T1486 | ClopEncryptor（已弃用） |
| **影响** | 数据销毁/泄露威胁 | T1485/T1491 | CL0P^_-LEAKS 公开泄露 |
| **影响** | 服务停止 | T1489 | 选择性服务终止 |

---

## 六、受害者分析

### 6.1 受害者规模与趋势

| 年份 | 公开受害者数 | 关键事件 |
|------|-------------|----------|
| 2019 | 少量 | 初始钓鱼活动 |
| 2020 | ~50+ | Accellion FTA 攻击开始，双重勒索启动 |
| 2021 | ~100+ | Accellion 持续攻击，6名成员在乌克兰被捕 |
| 2022 | ~150+ | 组织重组，转向纯数据窃取 |
| 2023 | ~300+ | MOVEit 攻击（2,773 组织受影响），赎金约 $75M-100M |
| 2024 | 31 | 执法打击后的低谷期，Cleo 攻击开始 |
| 2025 | **469** | **爆发式回归**（+1,413%），Cleo + Oracle 攻击 |
| 2026（至今） | 持续增长 | 云环境攻击，AI 驱动工具 |

### 6.2 行业分布

| 行业 | 占比 | 典型目标 |
|------|------|----------|
| **金融服务** | ~25% | 银行、保险公司、证券交易所 |
| **医疗保健** | ~20% | 医院、医疗保险、制药企业 |
| **政府部门** | ~15% | 地方政府、联邦机构、国防承包商 |
| **教育科研** | ~15% | 大学、研究机构 |
| **科技行业** | ~10% | SaaS 提供商、云服务商 |
| **制造业** | ~8% | 大型制造企业、供应链企业 |
| **其他** | ~7% | 零售、能源、法律等 |

### 6.3 地理分布

| 地区 | 占比 | 说明 |
|------|------|------|
| **北美** | ~40% | 美国为主要目标，加拿大次之 |
| **欧洲** | ~25% | 英国、德国、法国、荷兰为主要目标 |
| **亚太** | ~20% | 2025年起显著增加，澳大利亚、日本、韩国 |
| **中东/非洲** | ~8% | 海湾国家、南非 |
| **南美** | ~7% | 巴西、阿根廷 |

### 6.4 重大攻击事件

| 时间 | 事件 | 影响 |
|------|------|------|
| 2020-21 | Accellion FTA 攻击 | 多个政府机构、Shell、KPMG 等受影响 |
| 2023.05 | **MOVEit Transfer 零日攻击** | **2,773 个组织**，BBC、英国航空、Boots、西门子、美国能源部等 |
| 2023.01 | Fortra GoAnywhere MFT | 大规模企业数据窃取 |
| 2023.03 | 多伦多市数据窃取 | 市政服务受影响 |
| 2024.12-25 | **Cleo 平台攻击** | **300+ 组织**，182+ 公开受害者 |
| 2025.07 | Oracle EBS 零日（CVE-2025-61882） | Envoy Air（美航子公司）等 |

---

## 七、四重勒索运营模式

### 7.1 商业模式演化

Cl0p 的商业模式经历了三个显著阶段的演化：

**阶段一：传统加密勒索（2019-2020）**
- 通过钓鱼邮件分发 ClopEncryptor
- 使用签名验证的二进制文件规避检测
- 平均赎金：$220,298
- 通过 Get2 → SDBBot → FlawedGrace 链投递

**阶段二：双重勒索（2020-2021）**
- 数据窃取 + 系统加密
- 启用 CL0P^_-LEAKS 暗网泄露站
- 威胁公开泄露数据作为额外压力
- Accellion FTA 零日攻击

**阶段三：纯数据窃取勒索（2021-至今）**
- **放弃文件加密**，专注数据窃取
- 零日漏洞驱动的 MFT 软件攻击
- 大规模批量攻击（数千组织同时受影响）
- 四重勒索模型

### 7.2 四重勒索模型详解

```
┌─────────────────────────────────────────────────────────────┐
│  第一重：数据窃取                                            │
│  · 窃取敏感数据（财务、医疗、客户、知识产权）                  │
│  · 威胁在 CL0P^_-LEAKS 暗网站点公开                          │
├─────────────────────────────────────────────────────────────┤
│  第二重：直接联系受害者                                       │
│  · 直接联系 CEO/CFO/CISO 等高管                               │
│  · 提供"谈判"窗口期                                          │
│  · 通过 Tor 专属站点进行赎金协商                               │
├─────────────────────────────────────────────────────────────┤
│  第三重：间接施压                                             │
│  · 联系受害者客户，告知数据泄露风险                            │
│  · 联系受害者合作伙伴/供应商                                   │
│  · 制造监管合规压力（GDPR、HIPAA 等）                         │
├─────────────────────────────────────────────────────────────┤
│  第四重：DDoS 威胁                                           │
│  · 威胁对拒绝支付的组织发动 DDoS 攻击                         │
│  · 缩短支付期限，增加紧迫感                                   │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 赎金与收入分析

| 指标 | 数值 |
|------|------|
| **累计总收入** | 5亿美元+ |
| **MOVEit 活动收入** | 7,500万-1亿美元 |
| **平均赎金范围** | 50万-500万美元（视组织规模） |
| **最高单笔赎金** | 数百万美元级别 |
| **支付方式** | 比特币（BTC）为主 |
| **支付率** | 中等偏低（纯数据窃取模式下支付率下降） |

### 7.4 洗钱路径

```
受害者支付 BTC
    ↓
链上混币（多跳转账）
    ↓
跨链转换（BTC → XMR / ETH）
    ↓
场外交易（OTC）/ 混币服务
    ↓
合法化（加密货币交易所提现 / 实体业务）
```

---

## 八、基础设施分析

### 8.1 基础设施架构

| 组件 | 特征 |
|------|------|
| **暗网泄露站** | CL0P^_-LEAKS，Tor 网络托管，定期更换 .onion 地址 |
| **C2 服务器** | 全球分布，使用域名前置（Domain Fronting）技术 |
| **Webshell** | LEMURLOOT（MOVEit）、DEWMODE（Accellion） |
| **通信平台** | Jabber/XMPP、Tox、Session 加密通信 |
| **谈判站点** | Tor 专属谈判页面，与受害者进行赎金协商 |
| **数据外传** | 合法云服务（Mega、Rclone）+ 加密通道 |

### 8.2 域名前置技术

Cl0p 使用域名前置（Domain Fronting）技术隐藏 C2 通信：
- 利用合法 CDN 服务（如 Cloudflare、Google Cloud）作为流量中继
- HTTPS 流量在 TLS 层显示合法域名，在 HTTP 层重定向到真实 C2
- 大幅增加网络层检测和阻断难度

### 8.3 Webshell 技术详情

**LEMURLOOT**（MOVEit 专用）：
- ASP.NET webshell，部署在 MOVEit Transfer 服务器上
- 通过 `moveitasapi.dll` 实现 SQL 注入
- 使用自定义 HTTP 头 `X-siLock` 进行 C2 通信
- 直接查询 MOVEit 数据库，批量导出文件
- 支持文件上传/下载、命令执行

**DEWMODE**（Accellion 专用）：
- Perl webshell，部署在 Accellion FTA 设备上
- 通过文件上传漏洞部署
- 支持数据窃取和命令执行

---

## 九、IOC 完整列表

### 9.1 Webshell 指标

| 类型 | 值 | 说明 |
|------|-----|------|
| **文件名** | `LEMURLOOT` | MOVEit 攻击 webshell |
| **文件名** | `DEWMODE` | Accellion 攻击 webshell |
| **HTTP 头** | `X-siLock` | LEMURLOOT C2 通信标识 |
| **文件路径** | `moveitasapi.dll` | MOVEit SQL 注入利用组件 |
| **API 端点** | `/api/v1/folders?UploadType=resumable` | MOVEit 数据外传标识 |
| **文件名** | `guestaccess.aspx` | MOVEit 持久化后门 |

### 9.2 恶意软件哈希

| 类型 | 说明 |
|------|------|
| **ClopEncryptor** | RSA + AES 混合加密器（SHA-256 哈希参见 CISA AA23-158A） |
| **TrueBot** | 信息窃取/初始侦察工具 |
| **FlawedAmmyy** | 远程访问木马 |
| **FlawedGrace** | 下一代远程访问工具 |
| **Get2** | 多阶段载荷下载器 |
| **SDBBot** | 后门程序 |
| **Batel / StealBit** | 数据窃取专用工具 |
| **RMS** | 新一代远程管理工具 |

### 9.3 网络指标

| 类型 | 说明 |
|------|------|
| **C2 通信** | 域名前置 HTTPS 流量，HTTP 头含 `X-siLock` |
| **数据外传** | Rclone、MegaSync 等合法工具的异常大流量 |
| **Tor 泄露站** | 定期更换的 .onion 域名（CL0P^_-LEAKS 系列） |
| **Webshell 通信** | HTTP POST 请求至 `moveitaspi.dll` 或 `guestaccess.aspx` |

### 9.4 行为指标

| 指标 | 说明 |
|------|------|
| **MFT 数据库异常查询** | 大量 SELECT 操作，涉及敏感数据表 |
| **异常文件传输** | 非工作时间的批量文件下载/上传 |
| **系统语言检查** | 恶意软件检查系统区域设置，跳过 CIS 国家 |
| **签名验证二进制** | 使用合法签名的可执行文件投递恶意载荷 |

---

## 十、检测规则

### 10.1 Sigma 规则

**规则1：MOVEit SQL 注入利用检测**

```yaml
title: MOVEit Transfer SQL Injection Exploitation
id: a]clop-moveit-sqli-001
status: experimental
description: 检测针对 MOVEit Transfer 的 SQL 注入利用尝试
author: Threat Intelligence Team
date: 2026/06/21
references:
    - https://www.cisa.gov/news-events/cybersecurity-advisories/aa23-158a
tags:
    - attack.initial_access
    - attack.t1190
    - attack.credential_access
    - attack.t1003
logsource:
    category: webserver
    product: moveit_transfer
detection:
    selection_sqli:
        cs-uri-query|contains:
            - 'moveitaspi.dll'
            - 'guestaccess.aspx'
        cs-method: 'POST'
    selection_api:
        cs-uri-query|contains:
            - '/api/v1/folders'
        cs-uri-query|contains:
            - 'UploadType=resumable'
    selection_webshell:
        cs-uri-query|contains:
            - 'LEMURLOOT'
            - 'DEWMODE'
    condition: selection_sqli or selection_api or selection_webshell
level: critical
```

**规则2：LEMURLOOT Webshell 通信检测**

```yaml
title: LEMURLOOT Webshell C2 Communication
id: a]clop-lemurloot-c2-002
status: experimental
description: 检测 LEMURLOOT webshell 的 C2 通信特征
author: Threat Intelligence Team
date: 2026/06/21
references:
    - https://www.cisa.gov/news-events/cybersecurity-advisories/aa23-158a
tags:
    - attack.persistence
    - attack.t1505.003
    - attack.collection
    - attack.t1005
logsource:
    category: network
    product: http
detection:
    selection_header:
        cs-header-name: 'X-siLock'
    selection_body:
        cs-body|contains:
            - 'Health Check Service'
    condition: selection_header or selection_body
level: critical
```

**规则3：Cl0p 数据外传行为检测**

```yaml
title: Cl0p Data Exfiltration via Cloud Tools
id: a]clop-exfil-cloud-003
status: experimental
description: 检测使用 Rclone/MegaSync 等工具进行的大规模数据外传
author: Threat Intelligence Team
date: 2026/06/21
tags:
    - attack.exfiltration
    - attack.t1567
    - attack.t1041
logsource:
    category: process
    product: windows
detection:
    selection_rclone:
        Image|endswith: '\rclone.exe'
        CommandLine|contains:
            - 'copy'
            - 'sync'
            - 'move'
    selection_mega:
        Image|endswith: '\MEGAcmdServer.exe'
        CommandLine|contains:
            - 'put'
            - 'sync'
    selection_volume:
        CommandLine|contains:
            - '--max-transfer'
            - '--transfers'
    condition: (selection_rclone or selection_mega) and selection_volume
level: high
```

### 10.2 YARA 规则

**规则1：ClopEncryptor 检测**

```yara
rule ClopEncryptor_Detect {
    meta:
        description = "Detects ClopEncryptor ransomware variants"
        author = "Threat Intelligence Team"
        date = "2026-06-21"
        reference = "CISA AA23-158A"
        tlp = "AMBER"
    strings:
        $s1 = "*.clop" ascii
        $s2 = "Read Me - How To Decrypt Your Files" ascii
        $s3 = "CL0P^_-LEAKS" ascii
        $s4 = "vssadmin delete shadows" ascii
        $s5 = "Your personal ID for decryption" ascii
        $hex1 = { 48 8B 05 ?? ?? ?? ?? 48 89 44 24 ?? 48 8D 15 }
        $hex2 = { E8 ?? ?? ?? ?? 48 8B D8 48 85 C0 0F 84 }
    condition:
        2 of ($s*) or ($hex1 and $hex2)
}
```

**规则2：LEMURLOOT Webshell 检测**

```yara
rule LEMURLOOT_Webshell {
    meta:
        description = "Detects LEMURLOOT webshell used in MOVEit attacks"
        author = "Threat Intelligence Team"
        date = "2026-06-21"
        reference = "CISA AA23-158A"
        tlp = "AMBER"
    strings:
        $s1 = "X-siLock" ascii
        $s2 = "moveitaspi.dll" ascii
        $s3 = "guestaccess.aspx" ascii
        $s4 = "LEMURLOOT" ascii
        $s5 = "UploadType=resumable" ascii
        $re1 = /SELECT\s+.*\s+FROM\s+.*\s+WHERE/i
    condition:
        3 of ($s*) or ($re1 and any of ($s*))
}
```

---

## 十一、风险评估矩阵

### 11.1 综合风险评分

| 维度 | 评分(1-10) | 说明 |
|------|-----------|------|
| **技术能力** | 10 | 零日漏洞获取+武器化能力全球领先 |
| **运营成熟度** | 10 | 10年+运营，多业务线，完整组织架构 |
| **攻击规模** | 10 | 单次攻击影响 2,773 组织，史上之最 |
| **财务影响** | 9 | 5亿美元+累计收入 |
| **目标范围** | 9 | 全球 120+ 国家，75+ 行业 |
| **反检测能力** | 8 | 域名前置、Tor、加密通信 |
| **适应能力** | 10 | 从加密→双重勒索→纯数据窃取的完美转型 |
| **抗执法能力** | 9 | 多次执法打击后快速重组 |
| **综合评分** | **9.4/10** | **极高威胁** |

### 11.2 风险热图

```
            低影响    中影响    高影响    极高影响
可能性      │         │         │         │
极高        │         │         │    ★    │  ← MOVEit 类攻击
高          │         │         │    ★    │  ← Cleo/Oracle 攻击
中          │         │    ★    │         │  ← 钓鱼/传统入侵
低          │         │    ★    │         │  ← 供应链渗透
            │         │         │         │
```

---

## 十二、缓解建议

### 12.1 紧急措施（24小时内）

| 优先级 | 措施 | 说明 |
|--------|------|------|
| **P0** | 修补 MFT 软件漏洞 | 立即更新 MOVEit Transfer、Cleo、Accellion、GoAnywhere 至最新版本 |
| **P0** | 审计暴露的 MFT 服务器 | 检查所有面向互联网的 MFT 服务器是否存在 LEMURLOOT/DEWMODE |
| **P0** | 检查 X-siLock 头 | 在 WAF/IDS 中检查 HTTP 请求是否包含 `X-siLock` 头 |
| **P1** | 启用 MFA | 在所有远程访问、VPN、特权账户上强制启用多因素认证 |
| **P1** | 网络分段 | 隔离 MFT 服务器与核心业务网络 |

### 12.2 短期措施（1周内）

| 优先级 | 措施 | 说明 |
|--------|------|------|
| **P1** | 部署 EDR | 在所有端点和服务器上部署具备行为分析的 EDR |
| **P1** | 审查数据库访问日志 | 检查 MFT 数据库是否存在异常查询模式 |
| **P2** | 实施 DLP | 部署数据泄露防护解决方案，监控异常数据传输 |
| **P2** | 更新 IDS/IPS 规则 | 导入 Cl0p 相关 IOC 到所有安全设备 |
| **P2** | 云安全审计 | 检查云存储配置，确保无公开暴露的敏感数据 |

### 12.3 长期措施（1-3个月）

| 优先级 | 措施 | 说明 |
|--------|------|------|
| **P1** | 零信任架构 | 实施零信任安全模型，最小权限原则 |
| **P1** | 供应链安全评估 | 对所有第三方软件供应商进行安全审计 |
| **P2** | 威胁情报共享 | 加入 FS-ISAC 等行业威胁情报共享组织 |
| **P2** | 事件响应演练 | 定期进行勒索软件攻击模拟演练 |
| **P3** | 3-2-1 备份策略 | 确保至少一份备份完全离线且不可变 |
| **P3** | 员工安全意识 | 针对鱼叉式钓鱼和社会工程学进行专项培训 |

---

## 十三、核心建议

### 对企业管理层

1. **MFT 软件是关键攻击面** — Cl0p 的核心能力在于零日漏洞利用 MFT 软件。确保所有 MFT 解决方案（MOVEit、Cleo、Accellion、GoAnywhere 等）保持最新补丁状态
2. **数据泄露比加密更危险** — Cl0p 已放弃加密，专注数据窃取。传统的"备份恢复"策略不足以应对纯数据窃取勒索
3. **四重勒索意味着所有人都可能被联系** — 不仅企业自身，其客户和合作伙伴都可能成为施压目标
4. **1,000 万美元悬赏证明严重性** — 美国政府对此组织的高度关注反映了其威胁等级

### 对安全运营团队

1. **监控 MFT 数据库异常** — 关注非工作时间的批量 SELECT 查询和文件导出操作
2. **检测 X-siLock 头** — 这是 LEMURLOOT webshell 的标志性通信特征
3. **关注合法工具滥用** — Rclone、MegaSync 等合法工具可能被用于数据外传
4. **域名前置难以检测** — C2 通信可能隐藏在合法 CDN 流量中，需要深度包检测

### 对执法与政策制定者

1. **跨国协作是关键** — Cl0p 的跨国运营需要国际执法合作
2. **MFT 软件供应商责任** — 推动 MFT 软件厂商提升安全开发生命周期
3. **零日漏洞市场监管** — 加强对零日漏洞交易市场的监控和打击

---

## 附录

### 附录A：参考资料

| 来源 | 文档 | 日期 |
|------|------|------|
| **CISA/FBI** | AA23-158A: #StopRansomware: CL0P Ransomware Gang Exploits CVE-2023-34362 | 2023.06 |
| **MITRE ATT&CK** | Group G0092: TA505 | 持续更新 |
| **加拿大网络安全中心** | Profile: TA505 / CL0P ransomware | 2023.07 |
| **Halcyon** | Cl0p Threat Group Profile | 2025.10 |
| **Breachsense** | State of Ransomware 2025: Annual Report | 2026.01 |
| **CybelAngel** | The Cl0p Ransomware Gang Unveiled | 2025.03 |
| **Trend Micro** | Ransomware Spotlight: Clop | 2023.08 |
| **Mandiant** | Zero-Day MOVEit Data Theft | 2023.06 |
| **Akamai** | MOVEit SQLi Zero-Day Exploited by CL0P | 2023.06 |
| **Malpedia** | TA505 Actor Profile | 持续更新 |

### 附录B：术语表

| 术语 | 定义 |
|------|------|
| **MFT** | Managed File Transfer，托管文件传输 |
| **RaaS** | Ransomware-as-a-Service，勒索软件即服务 |
| **IAB** | Initial Access Broker，初始访问代理 |
| **四重勒索** | 数据窃取 + 直接联系 + 间接施压 + DDoS 威胁 |
| **域名前置** | Domain Fronting，利用 CDN 隐藏真实 C2 地址的技术 |
| **Webshell** | 部署在 Web 服务器上的恶意脚本，提供远程访问能力 |
| **零日漏洞** | Zero-day vulnerability，软件厂商尚未修补的安全漏洞 |
| **CIS** | Commonwealth of Independent States，独联体 |
| **SQL 注入** | SQL Injection，通过注入恶意 SQL 代码操纵数据库 |

### 附录C：追踪计划

| 追踪项 | 频率 | 说明 |
|--------|------|------|
| 泄露站更新 | 每日 | 监控 CL0P^_-LEAKS 新受害者列表 |
| 新零日漏洞 | 实时 | 关注 MFT/企业软件新漏洞的武器化 |
| 赎金金额趋势 | 每月 | 分析赎金要求和支付模式变化 |
| 执法动态 | 实时 | 跟踪国际执法打击行动 |
| TTPs 演化 | 每季度 | 更新攻击技术和程序变化 |
| 基础设施变化 | 每月 | 跟踪 C2、泄露站、通信渠道变化 |

---

> **免责声明**：本报告基于公开威胁情报来源编制，仅供安全研究与防御参考。IOC 可能随时间变化，建议结合最新情报源进行验证。报告中的 MITRE ATT&CK® 技术标识基于 MITRE ATT&CK for Enterprise v15。
