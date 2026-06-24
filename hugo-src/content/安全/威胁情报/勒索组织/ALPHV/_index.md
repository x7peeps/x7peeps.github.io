---
title: "ALPHV / BlackCat"
weight: 13
---

**报告编号**: TIR-2026-0624-013 | **分类等级**: TLP:AMBER | **发布日期**: 2026年6月24日 | **情报来源**: 多源交叉验证（OSINT + CISA/FBI/HHS 联合公告 AA23-353A + DOJ Operation Takedown + MITRE ATT&CK S1068 + Picus Security + Packet Labs + Kaspersky + Sophos + Microsoft + Trustwave SpiderLabs + 安天CERT）

---

## 一、执行摘要

**ALPHV/BlackCat**（又名 Noberus）是2021年11月首次出现的勒索软件即服务（RaaS）组织，由 MITRE ATT&CK 追踪为 **S1068**。该组织被认为是 **DarkSide、BlackMatter 和 REvil** 等已解散勒索组织的核心成员重组产物，是**首个使用 Rust 语言开发跨平台加密载荷**的勒索软件家族，支持 Windows、Linux 及 VMware ESXi 环境加密。截至2025年底，BlackCat 已攻击全球 **1,000+** 组织，FBI 在2023年12月发起 **Operation Takedown** 打击行动查封其基础设施，但该组织迅速恢复运营，其附属机构于2024年2月制造了美国历史上最大的医疗数据泄露事件——**Change Healthcare 攻击**（影响1亿+个人，赎金2,200万美元）。美国国务院已悬赏 **1,000 万美元** 征集该组织领导层信息。

<!--more-->

### 关键发现

| 维度 | 关键指标 |
|------|----------|
| **组织规模** | 1,000+ 攻击（FBI 确认），700+ 泄露网站受害者，全球影响 |
| **加密方案** | AES / ChaCha20 + RSA，Rust 编写，跨平台（Windows/Linux/ESXi） |
| **首要入口** | 社工窃取凭证（冒充 IT/Helpdesk）、钓鱼、漏洞利用（Exchange Server） |
| **商业模式** | RaaS，附属分成 80-90%（高于行业标准 70%） |
| **最大单笔** | 2,200 万美元（Change Healthcare） |
| **勒索策略** | 三重勒索（加密 + 数据泄露 + DDoS 威胁） |
| **执法打击** | 2023.12 DOJ Operation Takedown 查封基础设施；2024年附属机构退出骗局 |
| **解密可能性** | **不存在**（无公开解密工具） |
| **悬赏金额** | 美国国务院悬赏 1,000 万美元 |

### 威胁等级评估

| 评估维度 | 等级 | 说明 |
|----------|------|------|
| **技术能力** | 🔴 极高 | Rust 编写、跨平台加密、五种加密模式、Access Token 反分析 |
| **运营成熟度** | 🔴 极高 | 完整 RaaS 平台、泄露网站、谈判门户、附属仪表板 |
| **攻击规模** | 🔴 极高 | 1,000+ 攻击，700+ 泄露受害者，全球多行业覆盖 |
| **目标针对性** | 🔴 高 | 大型组织优先，医疗/金融/制造/能源/教育重点 targeting |
| **数据泄露风险** | 🔴 极高 | 三重勒索 + 公开互联网泄露网站（非传统暗网） |

---

## 二、威胁行为者画像

### 2.1 组织标识

| 属性 | 值 |
|------|-----|
| **官方名称** | ALPHV / BlackCat |
| **别名** | Noberus、ALPHV-ng、S1068（MITRE ATT&CK 软件 ID） |
| **MITRE ATT&CK** | S1068（BlackCat 软件） |
| **组织类型** | 勒索软件即服务（RaaS） |
| **活跃周期** | 2021年11月 – 至今（含 2023.02 Sphynx 2.0 更新） |
| **主要语言** | 英语（泄露网站/谈判）、俄语（内部沟通，推断） |
| **地理归属** | 俄语地区（高置信度）；与 DarkSide/BlackMatter/REvil 人员重叠 |
| **攻击目标** | 全球企业（北美、欧洲、亚太为重点） |
| **动机** | 经济利益 |

### 2.2 组织演化时间线

```
2021.11    ALPHV/BlackCat 首次出现在俄语黑客论坛
           Rust 编写，首个跨平台 RaaS 勒索软件
           推广期间使用黑猫图标（Tor 支付站点）
           滴血匕首图标（数据泄露站点）
    ↓
2021.11.30 数据泄露站点（DLS）上线
           开始公开羞辱未付款受害者
    ↓
2022年初   FBI 发布首次 FLASH 通报
           确认多行业受害者
    ↓
2023.02.21 Sphynx（2.0 版本）发布
           重写载荷，增强防御规避
           新增 Linux/VMware ESXi 加密能力
           改进附属工具集
    ↓
2023.02    Reddit 数据泄露事件
           声称窃取 80GB 压缩数据，要求 450 万美元
    ↓
2023.09    联合 Scattered Spider 攻击 MGM/Caesars
           Caesars 支付 1,500 万美元赎金
           MGM 拒绝支付，损失约 1 亿美元
    ↓
2023.11    攻击财富500强医疗公司 Henry Schein
    ↓
2023.12    DOJ Operation Takedown
           FBI 查封 BlackCat 基础设施
           组织管理员鼓励附属机构攻击医院作为报复
    ↓
2024.02    Change Healthcare 攻击（附属机构 Notchy）
           影响 1 亿+ 个人，美国最大医疗数据泄露
           UnitedHealth 支付 2,200 万美元赎金
           组织对附属机构实施退出骗局（Exit Scam）
    ↓
2024-2026  附属机构持续活跃
           基础设施快速迁移，新域名不断出现
           美国国务院悬赏 1,000 万美元
```

### 2.3 核心运营者与关联

| 角色 | 说明 |
|------|------|
| **核心运营方** | 开发维护 Rust 勒索软件工具包、泄露站点、谈判门户、附属仪表板 |
| **附属机构（Affiliates）** | 负责寻找目标、实施入侵、部署勒索；保留 80-90% 赎金 |
| **关联组织** | Scattered Spider（MGM/Caesars 攻击合作）、Notchy（Change Healthcare 攻击） |
| **前身关联** | DarkSide、BlackMatter、REvil、GandCrab（人员/工具/战术重叠） |
| **招募渠道** | 暗网论坛、高利润分成吸引自然流量 |

### 2.4 附属成员体系

| 指标 | 数据 |
|------|------|
| **分成比例** | 附属 80-90%，运营方 10-20%（行业标准约 70/30） |
| **支付方式** | 加密货币（BTC、XMR），专属支付门户，倒计时折扣 |
| **谈判渠道** | Tor 专属站点 + Tox + 邮件 + 加密应用 + 受害者专属邮箱 |
| **泄露网站** | Tor DLS + 公开互联网泄露网站（非传统暗网） |
| **禁止目标** | 俄罗斯及独联体国家（地缘政治约束） |

---

## 三、归因分析

### 3.1 归属评估

| 字段 | 信息 | 置信度 |
|------|------|--------|
| **语言归属** | 英语（泄露网站/谈判）、俄语（内部沟通） | 高 |
| **地理归属** | 俄语地区（东欧基础设施） | 高 |
| **国家级归因** | 无正式国家级归因声明 | - |
| **前身关联** | DarkSide/BlackMatter/REvil 人员重组 | 中-高 |

### 3.2 前身组织关联

```
┌─────────────────────────────────────────────────────────────┐
│  ALPHV/BlackCat 前身关联链                                   │
│  ─────────────────────────                                  │
│                                                              │
│  GandCrab（2018-2019）                                      │
│      ↓ 执法打击后解散                                        │
│  REvil / Sodinokibi（2019-2021）                            │
│      ↓ 2021年执法打击后核心成员分散                          │
│  DarkSide / BlackMatter（2020-2021）                        │
│      ↓ Colonial Pipeline 事件后解散                          │
│  ─────────────────────────────────                          │
│      ↓ 人员/工具/战术重叠                                    │
│  ALPHV/BlackCat（2021.11 – 至今）                           │
│      ├── 首个 Rust 编写的 RaaS 勒索软件                      │
│      ├── 继承 DarkSide/REvil 运营经验                        │
│      └── 80-90% 高分成吸引大量附属                           │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 执法打击与悬赏

| 行动 | 详情 |
|------|------|
| **Operation Takedown** | 2023年12月 DOJ 查封 BlackCat 基础设施 |
| **FBI FLASH** | 2022年4月首次发布 IOC 通报 |
| **CISA AA23-353A** | 2023年12月（更新：2024年2月）FBI/CISA/HHS 联合公告 |
| **国务院悬赏** | 最高 1,000 万美元征集领导层信息 |
| **加拿大网络安全中心** | AL23-010 警报（2023年7月） |

---

## 四、技术能力评估

### 4.1 恶意软件版本演变

| 阶段 | 时间 | 语言 | 特征 |
|------|------|------|------|
| **BlackCat 1.0** | 2021年11月 | Rust | 初始版本，跨平台，五种加密模式 |
| **Sphynx 2.0** | 2023年2月 | Rust | 重写载荷，增强防御规避，Linux/ESXi 支持 |

### 4.2 加密机制分析

#### 4.2.1 加密算法

| 组件 | 算法 | 说明 |
|------|------|------|
| **对称加密** | AES 或 ChaCha20 | 自动检测 AES 硬件加速，无则使用 ChaCha20 |
| **非对称加密** | RSA | 加密对称密钥 |
| **文件扩展名** | `.` + 6-7位随机字母数字组合 | 每次攻击使用不同随机扩展名 |
| **勒索信** | `RECOVER-[extension]-FILES.txt` | 每个受害者不同 |

#### 4.2.2 五种加密模式

| 模式 | 说明 | 特点 |
|------|------|------|
| **Full** | 全文件加密 | 最安全，最慢 |
| **Fast** | 加密前 N 兆字节 | 最快，最不安全 |
| **DotPattern** | 每 M 步加密 N 兆字节 | 可配置 |
| **Auto** | 根据文件类型/大小自动选择 | 检测 AES 硬件支持 |
| **SmartPattern** | 每 10% 加密 10 MB（默认） | 速度/强度最佳比 |

#### 4.2.3 加密流程

```
┌─────────────────────────────────────────────────────────────┐
│  1. 加载 JSON 配置（加密模式、扩展名、排除项等）              │
│  2. 验证 Access Token（反分析机制，无 Token 不执行）          │
│  3. 终止目标进程（安全软件、备份、数据库、Exchange 等）        │
│  4. 清除回收站、删除卷影副本                                 │
│  5. 检测 AES 硬件加速，选择加密算法                          │
│  6. 生成对称密钥加密文件内容                                 │
│  7. 使用 RSA 公钥加密对称密钥                                │
│  8. 重命名文件（添加随机扩展名）                             │
│  9. 投放勒索信 RECOVER-[ext]-FILES.txt                      │
│  10. 扫描内网其他设备，使用域凭据横向传播                     │
└─────────────────────────────────────────────────────────────┘
```

#### 4.2.4 配置模块

BlackCat 使用 JSON 配置文件，允许附属机构自定义：

| 配置项 | 说明 |
|--------|------|
| `encryption_mode` | 五种加密模式选择 |
| `file_extensions` | 目标文件扩展名 |
| `skip_folders` | 跳过目录列表 |
| `processes_to_kill` | 需终止的进程（Veeam、备份、Exchange、Steam 等） |
| `services_to_stop` | 需停止的服务 |
| `ransom_note` | 自定义勒索信内容 |
| `random_extension` | 每次攻击生成随机扩展名 |
| `domain_credentials` | 域凭据（用于横向传播） |

### 4.3 核心能力

| 能力 | 说明 |
|------|------|
| **Rust 编写** | 首个 Rust 勒索软件，内存安全，跨平台编译 |
| **跨平台加密** | Windows、Linux、VMware ESXi |
| **Access Token 机制** | 载荷需特定 Token 参数执行，阻碍沙箱分析 |
| **命令行驱动** | 完全由命令行控制，人工操作 |
| **控制台 UI** | 实时监控加密进度 |
| **ESXi 快照擦除** | 自动擦除 ESXi 快照防止恢复 |
| **域凭据传播** | 配置域凭据后自动横向传播加密 |
| **三重勒索** | 加密 + 数据泄露 + DDoS 威胁 |

### 4.4 C2 架构

| 工具 | 类型 | 说明 |
|------|------|------|
| **Brute Ratel C4** | C2 框架 | 商业级 C2 |
| **Cobalt Strike** | C2 框架 | Beacon 回连 |
| **Evilginx2** | 中间人攻击 | 绕过 MFA，窃取会话 Cookie |
| **Ngrok** | 隧道工具 | 合法隧道服务滥用 |
| **Plink** | 远程访问 | SSH 客户端滥用 |
| **Tor** | 匿名通信 | 泄露站点、支付门户 |

### 4.5 多平台支持

| 平台 | 语言 | 说明 |
|------|------|------|
| Windows | Rust | 主平台，Win7+ |
| Linux | Rust | 服务器环境 |
| VMware ESXi | Rust | 虚拟化环境，自动擦除快照 |

---

## 五、攻击链分析

### 5.1 MITRE ATT&CK 映射

| 阶段 | 技术 | 说明 |
|------|------|------|
| **侦察** | T1598 | 社工获取信息（冒充 IT/Helpdesk） |
| | T1586 | 建立账户（冒充身份获取凭证） |
| **初始访问** | T1566 | 钓鱼（邮件/SMS） |
| | T1190 | 利用公开应用漏洞（Exchange Server） |
| | T1078 | 有效账户（窃取凭证） |
| | T1133 | 外部远程服务（RDP/VPN） |
| **执行** | T1059.003 | Windows 命令行（cmd.exe） |
| | T1059.001 | PowerShell |
| **持久化** | T1133 | 外部远程服务（AnyDesk、Splashtop） |
| | T1136 | 创建账户（"aadmin" 用户） |
| **权限提升** | T1548.002 | UAC 绕过（cmstplua COM 接口） |
| | T1134 | 访问令牌操纵（Kerberos 令牌生成） |
| **防御规避** | T1562.001 | 禁用安全工具（POORTRY、STONESTOP） |
| | T1070.001 | 清除 Windows 事件日志 |
| | T1070 | 指示器移除（Exchange 日志清除） |
| | T1027 | 混淆文件（字符串加密） |
| | T1497 | 虚拟化/沙箱检测（Access Token 机制） |
| **凭证访问** | T1003 | OS 凭据转储（Mimikatz） |
| | T1558 | Kerberos 票据攻击 |
| | T1557 | Adversary-in-the-Middle（Evilginx2） |
| **发现** | T1087.002 | 域账户发现（net use） |
| | T1135 | 网络共享发现 |
| | T1046 | 网络服务发现（RDP/SMB 扫描） |
| **横向移动** | T1021.001 | 远程桌面协议（RDP） |
| | T1021.002 | SMB/管理共享 |
| | T1570 | 横向工具传输（PsExec） |
| **收集** | T1005 | 本地系统数据 |
| | T1039 | 共享网络驱动器数据 |
| **渗出** | T1567 | 外传至云存储（Mega.nz、Dropbox） |
| | T1048 | 通过替代协议外传 |
| **影响** | T1486 | 数据加密勒索 |
| | T1490 | 删除备份/卷影副本 |
| | T1489 | 服务停止 |
| | T1491.001 | 内部 defacement（桌面壁纸更改） |
| | T1561.001 | 磁盘内容擦除（fsutil behavior） |

### 5.2 完整攻击链还原

#### 阶段一：初始入侵

```
┌─────────────────────────────────────────────────────────────┐
│  入侵路径 A（最常见）: 社工窃取凭证                          │
│  ──────────────────────────────                              │
│  1. OSINT 情报收集（LinkedIn、公司网站）                     │
│  2. 冒充公司 IT/Helpdesk 人员                                │
│  3. 电话或 SMS 联系员工                                      │
│  4. 制造紧急技术支持场景                                     │
│  5. 诱骗员工提供网络凭证                                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  入侵路径 B: 漏洞利用                                        │
│  ──────────────────                                          │
│  1. Microsoft Exchange Server（CVE-2021-31207）              │
│  2. Microsoft Exchange（CVE-2021-34473）                     │
│  3. Microsoft Exchange（CVE-2021-34523）                     │
│  4. 其他面向公众的应用漏洞                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  入侵路径 C: 钓鱼与恶意广告                                  │
│  ──────────────────────────                                  │
│  1. 钓鱼邮件/SMS 携带恶意链接                                │
│  2. Google 广告投毒（伪装合法软件下载）                      │
│  3. 恶意文档执行                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 阶段二：内网侦察与权限提升

```
内网侦察
├── 系统信息发现
├── 进程发现
├── 网络共享发现（net use）
├── RDP/SMB 设备扫描
├── 域账户枚举
└── 服务发现

权限提升
├── 创建 "aadmin" 用户账户
├── Kerberos 令牌生成获取域访问
├── UAC 绕过（cmstplua COM 接口）
├── Mimikatz 凭证窃取
├── Evilginx2 绕过 MFA
└── 向现有账户添加 MFA Token（持久化）
```

#### 阶段三：防御规避与数据窃取

```
防御规避
├── 部署 AnyDesk/Splashtop/MegaSync（合法远程工具）
├── 使用 Ngrok/Plink 隧道（伪装合法流量）
├── Brute Ratel C4 / Cobalt Strike（C2）
├── POORTRY / STONESTOP（终止安全进程）
├── 清除 Windows 事件日志
├── 清除 Exchange 服务器日志
├── Metasploit 白名单（伪装合法应用）
└── 删除卷影副本（vssadmin / fsutil）

数据窃取
├── 识别高价值数据（PII、医疗记录、财务数据）
├── 使用 Mega.nz / Dropbox 外传
├── 压缩后外传
└── 部分附属仅窃取数据不加密（纯勒索模式）
```

#### 阶段四：全网加密与勒索

```
加密部署
├── 横向移动：RDP、SMB（PsExec）、域凭据
├── 配置域凭据自动传播
├── PSExec 提取至 %Temp% 目录
├── 远程复制载荷至网络设备
└── 验证 Access Token 后执行加密

加密执行
├── 终止目标进程（Veeam、备份、Exchange、Steam 等）
├── 清除回收站
├── 删除卷影副本
├── 擦除 ESXi 快照
├── 加密文件（AES/ChaCha20 + RSA）
├── 重命名文件（随机扩展名）
├── 投放勒索信（RECOVER-[ext]-FILES.txt）
├── 更改桌面壁纸
└── 通过 Tor/Tox/邮件联系受害者

勒索谈判
├── 受害者专属 Tor 站点
├── 展示已窃取数据样本
├── 倒计时折扣机制
├── 三重勒索施压（加密 + 泄露 + DDoS）
└── 加密货币支付（BTC/XMR）
```

### 5.3 关键漏洞利用

| CVE | CVSS | 影响组件 | 利用方式 |
|-----|------|----------|----------|
| **CVE-2021-31207** | 7.8 | Microsoft Exchange | 远程代码执行 |
| **CVE-2021-34473** | 9.8 | Microsoft Exchange | 远程代码执行（ProxyShell） |
| **CVE-2021-34523** | 9.8 | Microsoft Exchange | 远程代码执行（ProxyShell） |

> **注意**：BlackCat 的入侵更多依赖社工和凭证窃取而非零日漏洞。其成功更多源于**流程缺陷**而非**软件漏洞**。

---

## 六、受害者分析

### 6.1 规模统计

| 来源 | 受害者数 | 截止日期 | 说明 |
|------|----------|----------|------|
| FBI 确认 | 1,000+ | 2023.12 | Operation Takedown 前 |
| DLS 泄露网站 | 700+ | 2025 | 公开声称 |
| 安天CERT | 434+ | 2023.07 | 仅统计 DLS 公开数据 |

### 6.2 行业分布

```
医疗健康        ████████████████████████████████████████ 最高优先级（2023.12后重点目标）
金融服务        ████████████████████████████████           高优先级
制造业          ██████████████████████████████             高优先级
教育            ████████████████████████████               高优先级
能源            ██████████████████████████                 高优先级
专业服务        ██████████████████████                     中优先级
科技            ████████████████████                       中优先级
零售            █████████████████                          中优先级
建筑            ██████████████                             中优先级
政府            ██████████████████████████                 高优先级
```

### 6.3 地理分布

| 区域 | 占比 | 说明 |
|------|------|------|
| 北美 | ~45% | 美国为主要目标 |
| 欧洲 | ~25% | 英国、德国、法国、西班牙、意大利 |
| 亚太 | ~15% | 日本、韩国、澳大利亚、中国 |
| 其他地区 | ~15% | 巴哈马、菲律宾、墨西哥等 |

### 6.4 重大攻击事件

| 时间 | 受害者 | 行业 | 影响 |
|------|--------|------|------|
| 2023年2月 | Reddit | 科技/社交 | 80GB 数据泄露，要求 450 万美元（仅窃取不加密） |
| 2023年9月 | Caesars Entertainment | 娱乐/博彩 | 支付 1,500 万美元赎金 |
| 2023年9月 | MGM Resorts | 娱乐/博彩 | 拒绝支付，Q3 损失约 1 亿美元 |
| 2023年11月 | Henry Schein | 医疗 | 财富500强医疗公司 |
| 2024年2月 | **Change Healthcare** | 医疗 | **1亿+ 个人信息泄露，2,200 万美元赎金，美国最大医疗数据泄露** |

### 6.5 Change Healthcare 事件深度分析

```
┌─────────────────────────────────────────────────────────────┐
│  Change Healthcare 攻击事件（2024年2月）                      │
│  ──────────────────────────────────────                      │
│                                                              │
│  攻击者: 附属机构 "Notchy"                                   │
│  受害者: Change Healthcare（UnitedHealth Group 子公司）       │
│  入口:  被盗凭证（可能通过社工获取）                          │
│                                                              │
│  影响:                                                       │
│  ├── 1 亿+ 个人信息泄露（美国最大医疗数据泄露）              │
│  ├── 泄露数据包括：保险会员ID、诊断、治疗信息、SSN           │
│  ├── 美国医疗支付系统大面积中断                              │
│  └── UnitedHealth 支付 2,200 万美元赎金（BTC）              │
│                                                              │
│  后续:                                                       │
│  ├── ALPHV 对 Notchy 实施退出骗局（Exit Scam）              │
│  │   └── 据报截留部分赎金                                    │
│  ├── 引发 RaaS 生态信任危机                                  │
│  └── 加速执法部门对 ALPHV 的打击力度                         │
└─────────────────────────────────────────────────────────────┘
```

### 6.6 受害者特征画像

```
高概率受害特征:
├── 身份认证薄弱（无 MFA 或 MFA 可被绕过）
├── 网络分段不足
├── 特权活动监控不到位
├── 面向公众的 Exchange/VPN 服务未修补
├── 员工缺乏社工防御培训
├── 医疗、金融、制造、教育等行业
├── 北美、欧洲、亚太地区企业
└── 大型组织（高赎金支付能力）
```

---

## 七、RaaS 运营模式

### 7.1 商业模式

| 特征 | 详情 |
|------|------|
| **核心运营方** | 开发维护 Rust 勒索软件工具包、泄露站点、谈判门户、附属仪表板 |
| **附属机构** | 负责寻找目标、实施入侵、部署勒索 |
| **分成比例** | 附属 80-90%，运营方 10-20%（行业最高） |
| **支付方式** | 加密货币（BTC、XMR），专属支付门户，倒计时折扣 |
| **谈判渠道** | Tor 站点 + Tox + 邮件 + 受害者专属邮箱 |

> **关键洞察**：BlackCat 的 80-90% 高分成本身就是一种"广告策略"——通过高利润分成自然吸引附属机构，无需传统暗网营销。附属机构将收益再投资于扩大攻击规模，形成恶性循环。

### 7.2 数据泄露站点（DLS）

| 特征 | 详情 |
|------|------|
| **Tor DLS** | 暗网 Tor 站点，滴血匕首图标 |
| **公开互联网** | **首创**在公开互联网建立泄露网站（非传统暗网） |
| **公开羞辱** | 展示公司名称、行业、被盗数据类型、截图 |
| **数据预览** | 允许潜在受害者预览部分泄露数据 |
| **一对一谈判** | 每个受害者有独立 Tor 站点 |

### 7.3 勒索策略

```
┌─────────────────────────────────────────────────────────────┐
│  三重勒索（Triple Extortion）                                │
│  ────────────────────────────                                │
│  第一层：解密被加密文件（收取解密赎金）                      │
│  第二层：不公开泄露的敏感数据（收取保密赎金）                │
│  第三层：不发动 DDoS 攻击（收取保护赎金）                    │
│                                                              │
│  附加策略：                                                  │
│  ├── 公开互联网泄露网站（最大化舆论压力）                    │
│  ├── 倒计时折扣机制（制造紧迫感）                            │
│  ├── 纯窃取不加密模式（Reddit 案例）                        │
│  └── 退出骗局（截留附属赎金）                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 八、基础设施分析

### 8.1 已知基础设施

| 类型 | 值 | 说明 | 状态 |
|------|-----|------|------|
| **Tor DLS** | 多个 .onion 地址 | 泄露站点 | 被查封后重建 |
| **公开泄露网站** | 公共互联网域名 | 非传统暗网泄露站 | 持续迁移 |
| **C2 域名** | 多个 | 动态域名 | 频繁更换 |
| **支付门户** | Tor 站点 | 赎金支付 | 每个受害者独立 |
| **谈判邮箱** | 受害者专属 | 邮件沟通 | 活跃 |

### 8.2 基础设施特征

```
基础设施策略:
├── Tor + 公开互联网双泄露站点
├── 每个受害者独立 Tor 谈判站点
├── 频繁更换 C2 域名和基础设施
├── 合法隧道服务滥用（Ngrok）
├── 商业 C2 框架（Brute Ratel C4、Cobalt Strike）
├── 合法远程工具滥用（AnyDesk、Splashtop）
└── Operation Takedown 后快速重建
```

---

## 九、IOC 完整列表

### 9.1 文件特征

| 特征 | 值 |
|------|-----|
| **SHA256** | `847fb7609f53ed334d5affbb07256c21cb5e6f68b1cc14004f5502d714d2a456` |
| **勒索信** | `RECOVER-[extension]-FILES.txt` |
| **加密扩展名** | `.` + 6-7位随机字母数字组合 |
| **已知文件名** | Asss1.exe.bin、Blackcat.exe、Blackcat.bin、BlackCat.bin |
| **创建账户** | `aadmin` |
| **部署工具** | PSExec（提取至 %Temp%） |

### 9.2 网络指标

| 类型 | 说明 |
|------|------|
| **远程工具** | AnyDesk、Splashtop、MegaSync |
| **隧道工具** | Ngrok、Plink |
| **C2 框架** | Brute Ratel C4、Cobalt Strike |
| **MFA 绕过** | Evilginx2 |
| **安全终止** | POORTRY、STONESTOP |
| **数据外传** | Mega.nz、Dropbox |

### 9.3 行为指标

| 行为 | 说明 |
|------|------|
| 大量文件快速重命名 | 添加随机 6-7 位扩展名 |
| vssadmin.exe 异常调用 | `vssadmin delete shadows /all /quiet` |
| fsutil behavior 调用 | 删除备份 |
| 多个服务被停止 | 终止安全软件、备份、Veeam |
| 异常 "aadmin" 账户 | 新建用户账户 |
| Kerberos 票据异常 | 令牌操纵 |
| Evilginx2 中间人流量 | MFA 绕过 |
| 异常 AnyDesk/Splashtop 连接 | 远程访问 |
| Mega.nz/Dropbox 大量上传 | 数据外传 |
| Exchange 日志异常清除 | 反取证 |

---

## 十、检测规则

### 10.1 Sigma 规则

#### 规则 1：BlackCat 卷影副本与备份删除

```yaml
title: ALPHV BlackCat - Shadow Copy and Backup Deletion
id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
status: experimental
description: 检测 ALPHV BlackCat 勒索软件删除影子副本和备份的行为
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
level: critical
tags:
  - attack.defense_evasion
  - attack.t1490
```

#### 规则 2：BlackCat 异常账户创建

```yaml
title: ALPHV BlackCat - Suspicious Account Creation (aadmin)
id: b2c3d4e5-f6a7-8901-bcde-f12345678901
status: experimental
description: 检测 ALPHV BlackCat 典型的 aadmin 账户创建行为
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    CommandLine|contains:
      - 'net user aadmin'
      - 'New-LocalUser aadmin'
  condition: selection
level: critical
tags:
  - attack.persistence
  - attack.t1136
```

#### 规则 3：BlackCat 合法远程工具滥用

```yaml
title: ALPHV BlackCat - Legitimate Remote Tool Abuse
id: c3d4e5f6-a7b8-9012-cdef-123456789012
status: experimental
description: 检测 ALPHV BlackCat 滥用合法远程工具的行为
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|endswith:
      - '\AnyDesk.exe'
      - '\Splashtop*'
      - '\ngrok.exe'
    ParentImage|endswith:
      - '\cmd.exe'
      - '\powershell.exe'
  condition: selection
level: high
tags:
  - attack.command_and_control
  - attack.t1219
```

### 10.2 YARA 规则

```yara
rule ALPHV_BlackCat_Ransomware {
    meta:
        description = "检测 ALPHV/BlackCat 勒索软件载荷"
        author = "Threat Intelligence Team"
        date = "2026-06-24"
        reference = "CISA AA23-353A / SHA256: 847fb7609f53ed334d5affbb07256c21cb5e6f68b1cc14004f5502d714d2a456"
    strings:
        $s1 = "RECOVER-" ascii
        $s2 = "-FILES.txt" ascii
        $s3 = "vssadmin delete shadows" ascii
        $s4 = "fsutil behavior" ascii
        $s5 = "aadmin" ascii
        $rust1 = ".rustc" ascii
        $rust2 = "rust_begin_unwind" ascii
        $hex1 = { 48 89 5C 24 08 48 89 6C 24 10 }
    condition:
        3 of ($s*) and ($rust1 or $rust2) and $hex1
}
```

---

## 十一、风险评估矩阵

### 11.1 威胁能力评估

| 能力维度 | 评分（1-5） | 说明 |
|----------|-------------|------|
| **技术复杂度** | 5 | Rust 编写、跨平台、五种加密模式、Access Token 反分析 |
| **运营成熟度** | 5 | 完整 RaaS 平台、公开泄露站、附属仪表板、高利润分成 |
| **资源水平** | 5 | 1,000+ 攻击、商业级 C2、专业谈判团队 |
| **攻击速度** | 4 | 社工入口 + 快速横向 + 数小时加密 |
| **隐蔽性** | 4 | Access Token 反分析、合法工具滥用、Rust 规避传统检测 |
| **适应性** | 5 | Operation Takedown 后快速恢复，持续演进 |
| **总体威胁等级** | 🔴 极高 | 4.7/5 |

### 11.2 受害者风险评估

| 风险因素 | 概率 | 影响 | 风险等级 |
|----------|------|------|----------|
| 数据永久丢失 | 高 | 极高 | 🔴 极高 |
| 数据公开泄露 | 极高 | 极高 | 🔴 极高 |
| 业务中断 | 极高 | 极高 | 🔴 极高 |
| DDoS 攻击 | 中 | 高 | 🟠 高 |
| 合规处罚 | 高 | 极高 | 🔴 极高 |
| 舆情危机 | 极高 | 高 | 🔴 极高 |
| 持续骚扰 | 高 | 中 | 🟠 高 |

---

## 十二、缓解建议

### 12.1 战略层建议（长期）

| 优先级 | 建议 | 说明 |
|--------|------|------|
| P1 | **实施防钓鱼 MFA** | FIDO2/WebAuthn 或 PKI-based MFA，抵御 Evilginx2 和推送轰炸 |
| P1 | **建立不可变备份体系** | 离线 + 不可变 + 定期测试恢复，特别保护 ESXi 快照 |
| P2 | **零信任架构转型** | 最小权限、微隔离、持续验证 |
| P2 | **网络分段** | IT/OT 分离、关键资产隔离 |
| P3 | **威胁情报共享** | 加入 ISAC、共享 IOC |
| P3 | **安全意识培训** | 重点培训社工防御（电话/SMS 冒充 IT 场景） |

### 12.2 运营层建议（中期）

| 优先级 | 建议 | 说明 |
|--------|------|------|
| P1 | **Exchange 漏洞修补** | 72小时内修补 Exchange Server 漏洞 |
| P1 | **EDR 全覆盖** | 所有端点部署 EDR，启用防篡改，特别关注 Rust 检测能力 |
| P2 | **特权活动监控** | 监控 Kerberos 令牌生成、域凭据使用、新账户创建 |
| P2 | **远程工具管控** | 白名单管理 AnyDesk/Splashtop/Ngrok 等工具 |
| P3 | **日志集中管理** | SIEM、不可变日志、保留90天+ |
| P3 | **事件响应演练** | 季度桌面推演，包含三重勒索场景 |

### 12.3 战术层建议（立即执行）

#### 针对社工防御

```powershell
# 1. 检查异常账户（aadmin）
Get-LocalUser | Where-Object {$_.Name -eq 'aadmin'}

# 2. 检查最近创建的账户
Get-LocalUser | Sort-Object WhenCreated -Descending | Select-Object -First 10

# 3. 检查 MFA Token 异常添加
Get-MsolUser -All | Where-Object {$_.StrongAuthenticationMethods.Count -gt 1}
```

#### 针对已感染环境

```powershell
# 1. 隔离受感染主机
netsh advfirewall firewall set rule group="remote desktop" new enable=no
netsh advfirewall firewall set rule group="file and printer sharing" new enable=no

# 2. 检查异常进程（Rust 特征）
Get-Process | Where-Object {$_.CompanyName -eq ""} | Select-Object Name, Id, Path

# 3. 检查卷影副本状态
vssadmin list shadows

# 4. 检查异常远程工具连接
Get-Process | Where-Object {$_.Name -match "AnyDesk|Splashtop|ngrok"}

# 5. 检查异常网络连接
netstat -ano | findstr "ESTABLISHED"

# 6. 检查勒索信文件
Get-ChildItem -Recurse -Filter "RECOVER-*-FILES.txt" -ErrorAction SilentlyContinue

# 7. 检查 ESXi 快照状态（虚拟化环境）
# vim-cmd vmsvc/snapshot.getallvms
```

### 12.4 解密恢复路径

| 场景 | 可行路径 | 成功率 | 建议 |
|------|----------|--------|------|
| 有离线备份 | 备份恢复 | 极高 | ✅ 最可靠 |
| 无备份 | 等待执法行动 | 极低 | ⏳ 持续监控 |
| 考虑付费 | — | 不推荐 | ❌ **强烈不建议**（退出骗局风险） |

> **警告**：ALPHV 在 Change Healthcare 事件中对附属机构 Notchy 实施了退出骗局（Exit Scam），截留部分赎金。**支付赎金无法保证获得解密密钥**。目前无公开解密工具。

---

## 十三、核心建议

1. **防钓鱼 MFA 是首要防线**：BlackCat 的核心入口是社工窃取凭证 + Evilginx2 绕过 MFA。传统 SMS/Push MFA 不足以防御，必须迁移至 FIDO2/WebAuthn
2. **Rust 检测能力建设**：BlackCat 是首个 Rust 编写的 RaaS，传统基于特征码的检测对 Rust 二进制效果有限。需升级 EDR 的 Rust 检测能力
3. **合法工具滥用是最大盲区**：AnyDesk、Splashtop、Ngrok 等合法工具被广泛用于 C2 和远程访问，白名单管控和行为监控是关键
4. **三重勒索需要三层防御**：加密防御（备份）、数据泄露防御（网络分段/DLP）、DDoS 防御（流量清洗）需同步部署
5. **退出骗局警示**：Change Healthcare 事件证明即使支付赎金也可能无法获得解密密钥。ALPHV 的退出骗局行为进一步降低了支付赎金的合理性
6. **社工防御不可忽视**：BlackCat 的成功更多源于流程缺陷（弱身份认证、社工易感性）而非技术漏洞。员工安全意识培训需覆盖电话/SMS 冒充场景

---

## 附录

### 附录 A：权威信息源索引

| # | 来源 | 说明 |
|---|------|------|
| 1 | MITRE ATT&CK | S1068 BlackCat 追踪 |
| 2 | CISA/FBI/HHS | AA23-353A #StopRansomware: ALPHV Blackcat |
| 3 | DOJ | Operation Takedown 执法行动 |
| 4 | 美国国务院 | 1,000 万美元悬赏公告 |
| 5 | Microsoft | The many lives of BlackCat ransomware |
| 6 | Sophos | BlackCat ransomware attacks analysis |
| 7 | Picus Security | ALPHV Ransomware: BlackCat After Change Healthcare Attack |
| 8 | Packet Labs | An Overview of BlackCat (ALPHV) |
| 9 | Kaspersky | BlackCat 勒索软件威胁概述 |
| 10 | 安天CERT | 警惕因BlackCat勒索软件造成的数据泄露 |
| 11 | 加拿大网络安全中心 | AL23-010 ALPHV/BlackCat 警报 |
| 12 | Trustwave SpiderLabs | BlackCat 技术分析 |

### 附录 B：术语表

| 术语 | 定义 |
|------|------|
| **RaaS** | Ransomware-as-a-Service，勒索软件即服务 |
| **DLS** | Data Leak Site，数据泄露站 |
| **C2** | Command and Control，命令与控制 |
| **IOC** | Indicator of Compromise，入侵指标 |
| **TTP** | Tactics, Techniques, and Procedures，战术、技术和程序 |
| **Exit Scam** | 退出骗局，RaaS 运营者截留附属机构赎金的行为 |
| **Access Token** | BlackCat 载荷执行所需的验证令牌，用于反分析 |
| **Sphynx** | BlackCat 2.0 版本代号（2023年2月发布） |
| **Operation Takedown** | 2023年12月 DOJ 对 BlackCat 的执法打击行动 |
| **ChaCha20** | 流加密算法，BlackCat 在无 AES 硬件加速时使用 |
| **FIDO2/WebAuthn** | 防钓鱼多因素认证标准 |

### 附录 C：持续跟踪计划

本页面将作为 ALPHV/BlackCat 组织的**长期跟踪情报页面**，持续更新以下内容：

- 新受害者案例与攻击事件
- 新发现的 IOC 与检测规则
- 组织基础设施变动
- 解密工具进展
- 执法行动与归因更新
- 附属机构动态与退出骗局后续
- 悬赏进展

---

**报告修订历史**

| 版本 | 日期 | 修订内容 |
|------|------|----------|
| v1.0 | 2026-06-24 | 初始发布 |

---

**免责声明**：本报告基于公开来源情报编制，仅供信息参考。本报告中的信息按"原样"提供，不对其准确性、完整性或适用性作任何明示或暗示的保证。使用本报告中的信息需自行承担风险。

**分类等级说明**：TLP:AMBER - 信息可在组织内部共享，但不可公开发布。
