---
title: "The Gentlemen 勒索组织威胁情报跟踪"
date: 2026-06-18T10:00:00+08:00
tags: 威胁情报,TheGentlemen,勒索软件,RaaS,Storm-2697
---

**报告编号**: TIR-2026-0618-001 | **分类等级**: TLP:AMBER | **发布日期**: 2026年6月18日 | **情报来源**: 多源交叉验证（OSINT + 泄露数据 + 厂商报告）

---

## 一、执行摘要

**The Gentlemen**（又名 Gentlemen、TheGentlemen、hastalamuerte）是一个快速崛起的勒索软件即服务（RaaS）组织，由微软追踪为 **Storm-2697**，PRODAFT 追踪为 **LARVA-368**。该组织于2025年中 emergence，2025年9月正式以 RaaS 模式运营，截至2026年6月已攻击 **483+ 受害者**，覆盖 **66+ 个国家**，成为全球第二活跃的勒索组织（仅次于 Qilin）。

<!--more-->

### 关键发现

| 维度 | 关键指标 |
|------|----------|
| **组织规模** | 核心团队 ~20人，9名已识别运营者，8+ 附属攻击团队 |
| **攻击速度** | 从初始入侵到全网加密仅需 **2-6周驻留 + 数小时加密** |
| **加密强度** | XChaCha20 + X25519 ECDH，每文件临时密钥，**存在内存密钥恢复弱点** |
| **首要入口** | CVE-2024-55591（FortiOS 认证绕过，CVSS 9.8） |
| **商业模式** | 90/10 分成（附属90%，运营者10%），远超行业80/20标准 |
| **赎金区间** | 初始要价 $250K，实际成交 $190K（单笔确认） |
| **二次勒索率** | 68%（付费后再次攻击） |
| **AI 使用** | 管理员大量使用 AI 辅助开发勒索软件及后渗透工具 |
| **解密可能性** | **存在**（Bedrock Safeguard 解密器，前提：进程仍在运行） |

### 威胁等级评估

| 评估维度 | 等级 | 说明 |
|----------|------|------|
| **技术能力** | 🔴 高 | 多平台加密、蠕虫式自传播、GPO 批量部署、BYOVD |
| **运营成熟度** | 🔴 高 | 完整 RaaS 平台、专业谈判团队、快速补丁响应 |
| **攻击规模** | 🔴 高 | 483+ 受害者，66+ 国家，10% 全球勒索市场份额 |
| **目标针对性** | 🟡 中 | 广谱攻击为主，但持有14,700台已入侵 FortiGate 清单 |
| **数据泄露风险** | 🔴 极高 | 双勒索模式 + 泄露数据已被其他组织二次利用 |

---

## 二、威胁行为者画像

### 2.1 组织标识

| 属性 | 值 |
|------|-----|
| **官方名称** | The Gentlemen |
| **别名** | Gentlemen、TheGentlemen、hastalamuerte、Storm-2697（微软）、LARVA-368（PRODAFT）、Phantom Mantis（前身） |
| **组织类型** | 勒索软件即服务（RaaS） |
| **活跃周期** | 2025年3月（前身 Phantom Mantis）→ 2025年7月独立 → 至今 |
| **主要语言** | 俄语（内部沟通）、英语（受害者沟通） |
| **地理归属** | 俄罗斯联邦（高置信度） |
| **攻击目标** | 全球企业（明确排除 CIS 国家） |
| **动机** | 经济利益 |

### 2.2 组织演化时间线

```
2019-2020  hastalamuerte 在 Nulled、Raidforums 等论坛活跃（初级水平）
    ↓
2025.03    以 Phantom Mantis 名称作为 Qilin RaaS 附属开始活动
    ↓
2025.05-06 ArmCorp 附属团队在 Qilin 生态内运行（30天攻击20+目标）
    ↓
2025.07.17 首个 Gentlemen 样本上传 VirusTotal（SHA-256: 51b9f246...）
           ↑ 早于公开争端5天，证明分裂系预谋
    ↓
2025.07.22 hastalamuerte 在 RAMP 论坛公开与 Qilin 的 $48,000 佣金纠纷
    ↓
2025.07    正式独立为 The Gentlemen 品牌
    ↓
2025.09.09 数据泄露站（DLS）上线
           首个公开受害者：秘鲁 JN Aceros 钢铁公司
    ↓
2025.09.12 以 zeta88 身份在地下论坛公开招募附属成员
    ↓
2025.11    内部通讯从 Mattermost 迁移至自建 Tor Rocket.Chat
    ↓
2026.03    Hunt.io 发现 Proton66 开放目录暴露126个攻击工具包
    ↓
2026.04    Bedrock Safeguard 发布首个免费解密器
           组织同日发布补丁绕过解密器
    ↓
2026.05.04 管理员公开承认 Rocket 数据库被泄露
    ↓
2026.05.08 泄露数据在 PwnForums、CryptBB 免费公开
    ↓
2026.05    与 BreachForums 建立官方合作招募附属
    ↓
2026.06.10 Krebs 公开运营者真实身份（Alexander Yapaev）
    ↓
2026.06.13 受害者达 483个，覆盖 66个国家
    ↓
2026.06.15 breachcache 披露新附属利用 AD CS ESC1 + GPO 部署案例
```

### 2.3 核心运营者（已识别9人）

| 代号 | 角色 | 活动证据 |
|------|------|----------|
| **zeta88** (hastalamuerte) | 总管理员 | 构建 locker + RaaS 面板，管理支付，亲自参与攻击 |
| **Kunder** | 运营协调 | 内部聊天确认支付分发 |
| **qbit** | VPN 扫描专家 | FortiGate 枚举与入侵 |
| **JeLLy** | 运营成员 | Rocket 数据库记录 |
| **Protagor** | 运营成员 | Rocket 数据库记录 |
| **Bl0ck** | 运营成员 | Rocket 数据库记录 |
| **Wick** | 运营成员 | Rocket 数据库记录 |
| **quant** | 凭证收集 | 暴力破解基础设施运维（高性能专用硬件） |
| **mAst3r** | 运营成员 | Rocket 数据库记录 |

**其他已识别用户名**（Rocket shadow file）：
3NT3R、B1d3n、C0CA、d0wnloAd1、equal1z3r、F3N1X、Gblog88、JLL、LDW、n0n3、PRTGRS、W1Z

### 2.4 附属成员体系

| 指标 | 数据 |
|------|------|
| 已识别附属 TOX ID | 8个（Check Point 从29次攻击中提取） |
| 最高产附属 | TOX ID 以 98C132 开头，关联 12/29 次攻击 |
| 管理员直接参与 | TOX ID 出现在4次攻击中 |
| 准入门槛 | 需提交至少 1GB 窃取数据 |
| 沟通渠道 | Tox、SimpleX Chat、Ricochet Refresh |

**管理员 TOX ID**：
`F8E24C7F5B12CD69C44C73F438F65E9BF560ADF35EBBDF92CF9A9B84079F8F04060FF98D098E`

---

## 三、归因分析

### 3.1 真实身份归因

**2026年6月10日**，知名网络安全记者 **Brian Krebs** 通过多源 OSINT 交叉验证，将组织管理员 hastalamuerte/zeta88 关联至真实身份：

| 字段 | 信息 | 置信度 |
|------|------|--------|
| **真实姓名** | Alexander Andreevich Yapaev（Япаев Александр Андреевич） | 高 |
| **年龄** | 36岁 | 高 |
| **所在地** | 俄罗斯联邦乌德穆尔特共和国 伊热夫斯克市（Izhevsk） | 高 |
| **公开职业** | Uralenergo Udmurtia B2B营销主管 | 高 |
| **PRODAFT 追踪代号** | LARVA-368 | 高 |
| **微软追踪代号** | Storm-2697 | 确认 |

### 3.2 归因证据链

```
┌─────────────────────────────────────────────────────────────┐
│  Intel 471 追踪 hastalamuerte 论坛注册（2019年起）         │
│  → IP 均指向伊热夫斯克                                     │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  ProtonMail: hastalamuerte1488@protonmail.com              │
│  → Epieos 反查关联 Apple 账号 + GitHub: SantaMuerte        │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  Telegram ID: 30907522 (@hastalamuerte18)                  │
│  → Constella 反查关联用户名 "bu4vs"                        │
│  → 俄罗斯手机号: 79127650004                               │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  手机号 79127650004                                        │
│  → 泄露俄罗斯政府数据库登记为 Yapaev 名下                  │
│  → Pikabu 社交账号 "4apai18"                               │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  Codeby 论坛账号 SantaMuerte                               │
│  → 原始注册名: Alexandr 4apaev                             │
│  → 4apai = 俄语"恰帕耶夫"谐音                              │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  LinkedIn 职业档案                                         │
│  → Yapaev, Uralenergo Udmurtia B2B 营销主管                │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 归因置信度评估

| 来源 | 归因结论 | 置信度 |
|------|----------|--------|
| Brian Krebs（OSINT 调查） | Alexander Yapaev | 高 |
| PRODAFT | 与 Krebs 归因"高置信度匹配" | 高 |
| Intel 471 | 论坛注册 IP → 伊热夫斯克 | 高 |
| Constella | 手机号 → Yapaev | 高 |

### 3.4 法律与执法状态

**⚠️ 重要提示**：截至2026年6月18日：

- ❌ **无 DOJ 起诉书**
- ❌ **无 OFAC 制裁**
- ❌ **无 FBI 通报**
- ❌ **无 Europol 执法行动**

归因仅为记者调查 + 研究者分析，**非官方执法认定**。公开该身份信息存在法律风险。

### 3.5 地缘政治因素

| 因素 | 评估 |
|------|------|
| **俄方态度** | 仅追诉底层协助者（托管商、支付），高级运营者免于追诉 |
| **CIS 豁免** | 明确禁止攻击 CIS 国家，换取俄方不干涉 |
| **执法壁垒** | 俄罗斯不配合西方执法请求，运营者享有事实豁免 |
| **先例参考** | BlackCat 认罪 → 逮捕，但仅发生在运营者旅行至友好国家时 |

---

## 四、技术能力评估

### 4.1 加密机制分析

#### 4.1.1 加密算法

| 组件 | 算法 | 说明 |
|------|------|------|
| **对称加密** | XChaCha20 | 流加密，扩展 IV 至 24 字节 |
| **密钥交换** | X25519 ECDH | 椭圆曲线 Diffie-Hellman |
| **密钥策略** | 每文件临时密钥 | 非全局密钥，每个文件独立生成 |
| **密钥派生** | X25519(ephemeral_priv, operator_pub) → shared_secret | 32 字节共享密钥 |

#### 4.1.2 加密流程

```
┌─────────────────────────────────────────────────────────────┐
│  1. 生成 32 字节随机数 → 临时私钥 (crypto/rand.Read)       │
│  2. 计算临时公钥 = X25519_Base(临时私钥)                   │
│  3. 计算共享密钥 = X25519(临时私钥, 运营者公钥)            │
│  4. 派生加密密钥 = HKDF(shared_secret)                     │
│  5. 生成 24 字节随机 IV                                    │
│  6. XChaCha20-Poly1305 加密文件内容                        │
│  7. 文件尾部追加:                                          │
│     - IV (24 bytes)                                        │
│     - 临时公钥 (32 bytes, Base64 编码)                     │
│     - GENTLEMEN 标记                                       │
│  8. 重命名文件: 添加 6 位随机扩展名 (如 .umc16h)           │
│  9. 删除原始文件                                           │
└─────────────────────────────────────────────────────────────┘
```

#### 4.1.3 大文件优化策略

| 文件大小 | 加密策略 |
|----------|----------|
| < 1 MB | 全量加密 |
| ≥ 1 MB | 三段分布式加密（头部 + 中部 + 尾部），提速 + 规避检测 |

#### 4.1.4 已知实现弱点（CWE-244）

**关键发现**：Go 运行时不在堆上清零密钥材料

```
┌─────────────────────────────────────────────────────────────┐
│  弱点描述                                                   │
│  ─────────                                                │
│  • 临时私钥在进程内存中持久存在                             │
│  • 从 Go crypto 模块初始化到进程终止全程驻留                │
│  • Go GC 在堆代之间复制数据，产生多个密钥副本               │
│  • 密钥不会在使用后立即清零                                 │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  利用方式                                                   │
│  ─────────                                                │
│  • 从运行中的勒索进程抓取内存镜像                           │
│  • 扫描内存提取 X25519 私钥                                 │
│  • 使用私钥 + 文件中的公钥重建共享密钥                      │
│  • 解密文件                                                 │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  实际效果                                                   │
│  ─────────                                                │
│  • Bedrock Safeguard 解密器: 35/35 文件解密，100% 成功率    │
│  • 35 个密钥在 0.6 秒内恢复                                 │
│  • 前提: 加密进程仍在运行                                   │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 横向移动能力

#### 4.2.1 蠕虫式自传播模式（`--spread` 参数）

Microsoft 确认该勒索软件支持蠕虫式自传播：

| 技术 | 实现方式 |
|------|----------|
| **SMB 共享** | 创建隐藏 SMB 共享分发载荷 |
| **PsExec** | 内嵌或从 Sysinternals 下载 |
| **WMI** | 远程进程创建 |
| **PowerShell Remoting** | WinRM 远程执行 |
| **计划任务** | 用户态 + SYSTEM 态 |
| **服务创建** | 持久化执行 |

#### 4.2.2 远程主机自动配置

```
远程主机自动执行:
├── 关闭 Windows Defender
├── 修改防火墙规则（允许 SMB、RDP）
├── 启用 SMB1（过时协议，存在漏洞）
├── 放宽 LSA 限制（便于凭证窃取）
└── 清除事件日志（Security、System、Application）
```

### 4.3 C2 架构

| 工具 | 类型 | 说明 |
|------|------|------|
| **ZeroPulse** | 自建 C2 | GitHub 开源仓库，被滥用为 C2 |
| **Velociraptor** | 开源 IR 工具 | 被滥用为 C2 |
| **G-BOT** | 自建 C2 | 泄露聊天中提及 |
| **SystemBC** | SOCKS5 代理 | 与 Cobalt Strike 配合使用 |
| **Cobalt Strike** | 商业渗透框架 | 高级附属使用 |

### 4.4 防御规避能力

| 技术 | 说明 |
|------|------|
| **Garble 混淆** | Go 二进制混淆，逆向难度极高 |
| **BYOVD** | 携带自带漏洞驱动禁用安全软件 |
| **KillAV 工具集** | KillAV、All.exe、Allpatch2.exe、EDRStartupHinder、gfreeze |
| **LOLBins** | 滥用 PsExec、PuTTY、WinSCP、PowerShell 等合法工具 |
| **日志清除** | Security、System、Application 日志 + Prefetch + RDP 日志 + PowerShell 历史 |
| **进程终止** | 批量终止虚拟化、数据库、备份、EDR、SAP、Office 进程 |

### 4.5 多平台支持

| 平台 | 语言 | 说明 |
|------|------|------|
| Windows | Go | 主平台 |
| Linux | Go | 支持 |
| NAS | Go | 支持 |
| BSD | Go | 支持 |
| VMware ESXi | C | 专用版本 |

---

## 五、攻击链分析

### 5.1 MITRE ATT&CK 映射

| 阶段 | 技术 | 说明 |
|------|------|------|
| **初始访问** | T1190 | 利用公网暴露应用（FortiGate） |
| | T1078 | 有效账户（暴力破解凭证） |
| | T1133 | 外部远程服务（VPN） |
| **执行** | T1059 | PowerShell、命令行 |
| | T1047 | WMI |
| **持久化** | T1053 | 计划任务（UpdateSystem、UpdateUser） |
| | T1547 | 注册表启动项（GupdateS、GupdateU） |
| **权限提升** | T1068 | 漏洞利用（AD CS ESC1） |
| | T1134 | 令牌操纵（PKINIT、UnPAC-the-hash） |
| **防御规避** | T1562 | 禁用安全工具（Defender、EDR） |
| | T1070 | 清除日志、删除 Prefetch |
| | T1027 | 混淆文件（Garble） |
| | T1218 | BYOVD |
| **凭证访问** | T1003 | OS 凭证转储（Mimikatz） |
| | T1003.006 | DCSync |
| | T1558 | Kerberoasting |
| **发现** | T1087 | 账户发现 |
| | T1069 | 权限组发现 |
| | T1018 | 远程系统发现 |
| | T1082 | 系统信息发现 |
| | T1016 | 系统网络配置发现 |
| **横向移动** | T1021 | 远程服务（SMB、RDP、WinRM） |
| | T1570 | 横向工具转移（PsExec、WMI） |
| | T1550 | 使用替代认证材料（Pass-the-Hash） |
| **收集** | T1005 | 本地系统数据 |
| | T1039 | 网络共享数据 |
| | T1074 | 数据暂存 |
| **渗出** | T1048 | 加密通道（rclone、WinSCP） |
| | T1567 | 外网 Exfil 服务 |
| **影响** | T1486 | 数据加密 |
| | T1490 | 删除影子副本 |
| | T1485 | 数据销毁（`--wipe` 参数） |
| | T1491 | 勒索信（README-GENTLEMEN.txt） |

### 5.2 完整攻击链还原

#### 阶段一：初始入侵（Dwell Time: 2-6周）

```
┌─────────────────────────────────────────────────────────────┐
│  入侵路径 A（最可能）: FortiGate 漏洞利用                   │
│  ─────────────────────────                                  │
│  1. 扫描公网暴露 FortiGate（3489端口等）                    │
│  2. 利用 CVE-2024-55591 认证绕过                            │
│  3. 获取 super-admin 权限                                   │
│  4. 下载 FortiGate 配置文件（含凭证、拓扑）                 │
│  5. 创建持久化 VPN 用户账户                                 │
│  6. 自动化脚本: 防删除恢复 super admin                      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  入侵路径 B: 凭证暴力破解                                   │
│  ─────────────────────                                      │
│  1. 使用 969 个已验证 VPN 凭证尝试登录                      │
│  2. 或使用内置弱口令字典暴力破解                            │
│  3. 获取 VPN 访问权限                                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  入侵路径 C: 钓鱼/供应链                                    │
│  ───────────────────────                                    │
│  1. 鱼叉式钓鱼邮件                                          │
│  2. 第三方供应商入侵                                        │
│  3. 信息窃取器日志获取凭证                                  │
└─────────────────────────────────────────────────────────────┘
```

#### 阶段二：内网侦察与权限提升

```
内网侦察
├── AD 枚举（域控、用户、组）
├── 网络拓扑发现
├── 备份系统定位（Veeam、Commvault）
├── NAS/存储阵列发现
├── 虚拟化基础设施识别（VMware、Hyper-V）
└── 关键服务器定位（Exchange、SQL、文件服务器）

权限提升
├── Mimikatz 凭证窃取
├── NTLM Relay 攻击
├── AD CS ESC1 滥用（如存在错误配置）
├── PKINIT / UnPAC-the-hash
├── DCSync（如已获取域管权限）
└── Kerberoasting
```

#### 阶段三：防御规避与数据窃取

```
防御规避
├── KillAV / All.exe / Allpatch2.exe 禁用安全软件
├── GPO 修改批量关闭 Defender
├── 添加 AV 排除项
├── 清除事件日志（Security、System、Application）
├── 删除 Prefetch、RDP 日志、PowerShell 历史
└── 终止 EDR、备份、虚拟化进程

数据窃取
├── rclone 外传至云存储
├── WinSCP 传输至攻击者服务器
├── 数百 GB 至 TB 级数据
└── 优先: 人事数据、财务数据、客户数据、IP
```

#### 阶段四：全网加密（数小时内完成）

```
加密部署方式
├── GPO 推送（域控 → 全网域加入系统）
├── --spread 蠕虫模式（SMB、PsExec、WMI、PowerShell Remoting）
├── 计划任务（UpdateSystem、UpdateUser）
└── 服务创建（GupdateS、GupdateU）

加密执行
├── 关闭 Defender、修改防火墙
├── 启用 SMB1、放宽 LSA
├── 终止目标进程（数据库、备份、虚拟化、EDR、Office）
├── 删除影子副本（vssadmin delete shadows /all /quiet）
├── 加密文件（XChaCha20 + X25519）
├── 重命名文件（添加 6 位随机扩展名）
├── 投放勒索信（README-GENTLEMEN.txt）
└── 可选: --wipe 参数覆写磁盘空闲空间
```

### 5.3 关键漏洞利用

| CVE | CVSS | 影响组件 | 利用方式 |
|-----|------|----------|----------|
| **CVE-2024-55591** | 9.8 | FortiOS/FortiProxy | 认证绕过，获取 super-admin |
| CVE-2025-32433 | - | Fortinet | 相关漏洞 |
| CVE-2025-33073 | - | Fortinet | 相关漏洞 |
| CVE-2025-55182 | - | Fortinet | 相关漏洞 |
| CVE-2025-7771 | - | - | 相关漏洞 |
| CVE-2023-27532 | 9.8 | Veeam Backup | 认证缺失 |
| CVE-2024-37085 | 10.0 | VMware ESXi | 认证绕过 |

---

## 六、受害者分析

### 6.1 规模统计

| 来源 | 受害者数 | 截止日期 | 说明 |
|------|----------|----------|------|
| Ransomware.live | 478 | 2026.06.11 | 公开声明 |
| Check Point | 332+ | 2026.05.13 | 保守统计 |
| RansomLook | 400+ | 2026.06 | 泄露站统计 |
| FalconFeeds | 412+ | 2026.05.25 | 多源聚合 |
| 泄露站实际 | 483 | 2026.06.13 | 最新数据 |
| 覆盖国家 | 66-70+ | - | 全球分布 |
| 覆盖行业 | 20+ | - | 多行业 |

### 6.2 行业分布（按受害严重程度排序）

```
制造业          ████████████████████████████████████████ 35%
科技/软件       ██████████████████████████████           28%
医疗健康        ██████████████████████████               22%
金融服务/保险   █████████████████████████                20%
建筑/房地产     ██████████████████████                   18%
能源/关键基础设施 ████████████████████                   15%
教育            ████████████████                         12%
政府            ██████████████                           10%
零售            ████████████                             8%
交通物流        ██████████                               7%
农业            ████████                                 6%
酒店/餐饮       ██████                                   5%
法律服务        ████                                     3%
电信            ████                                     3%
媒体/互联网     ██                                       2%
其他            ████                                     3%
```

### 6.3 地理分布

| 区域 | 占比 | 主要国家 |
|------|------|----------|
| 欧洲（含英国、德国） | ~35% | 英国、德国、法国、西班牙、罗马尼亚 |
| 亚太 | ~25% | 泰国、马来西亚、日本、澳大利亚、印度 |
| 拉丁美洲 | ~15% | 巴西、秘鲁、墨西哥、哥伦比亚 |
| 北美（美国） | ~13-15% | 显著低于其他勒索组织 |
| 非洲/中东 | ~10% | 伊拉克、毛里求斯、南非 |
| CIS 国家 | 0% | 明确禁止攻击 |

### 6.4 知名受害者案例

| 受害者 | 行业 | 国家 | 影响 |
|--------|------|------|------|
| 伊拉克商业银行 | 金融 | 伊拉克 | 核心 banking 系统加密 |
| 毛里求斯金融服务集团 | 金融 | 毛里求斯 | 客户数据泄露 |
| 海湾水泥制造商 | 制造 | 中东 | 生产系统瘫痪 |
| 西班牙陶瓷制造商 | 制造 | 西班牙 | 订单系统中断 |
| 亚洲投资公司 | 金融 | 亚洲 | 1.5TB 数据被窃 |
| Complexul Energetic Oltenia | 能源 | 罗马尼亚 | 国有能源企业，圣诞期间被攻击 |
| JRK Property Holdings | 房地产 | 美国 | 11.1万人数据泄露 → 集体诉讼 |
| Ralph Lauren | 零售 | 美国 | 第三方供应链入侵 |
| Hasbro | 制造 | 美国 | 玩具制造商 |
| Highwoods Properties | 房地产 | 美国 | 商业地产 REIT |

### 6.5 受害者特征画像

```
高概率受害特征:
├── 使用 Fortinet FortiGate/FortiProxy（未修补 CVE-2024-55591）
├── 公网暴露 VPN/远程桌面端口
├── 弱口令或默认凭证
├── 无 MFA 或 MFA 配置不当
├── 依赖 Active Directory 且未加固
├── 备份策略不完善（无离线/不可变备份）
├── 无 EDR 或 EDR 配置不当
├── 制造业、医疗、金融等高中断成本行业
└── 欧洲、亚太、拉美地区
```

---

## 七、泄露事件深度分析

### 7.1 泄露时间线

```
2026.05.02  托管商 4VPS.SU 披露自身被入侵
            ├─ 代理服务器替换攻击
            ├─ 钓鱼页面植入
            └─ GRUB 引导加载器破坏

2026.05.04  zeta88 在地下论坛公开承认 Rocket 数据库被泄露

2026.05.05  用户 "n345"/"n7778" 在 Breached 论坛出售数据
            └─ 要价: $10,000 BTC

2026.05.08  同一用户在 PwnForums、CryptBB 免费公开泄露数据
```

### 7.2 泄露数据规模

| 项目 | 数据 |
|------|------|
| 完整数据库大小 | **16.22 GB** |
| Check Point 获取部分 | 44.4 MB |
| Rocket.Chat 房间导出 | **22个**（CSV 格式） |
| 聊天消息总量 | **3,366条** |
| 时间跨度 | 2025.11 – 2026.04（约6个月） |
| 截图 | 数百张 |
| 确认受害者（泄露语料内） | 66个（占总池 ~16%） |

### 7.3 泄露内容清单

| 类别 | 内容 | 情报价值 |
|------|------|----------|
| **运营者身份** | 9名核心运营者代号 + 角色 | 🔴 极高 |
| **附属成员** | 8个 TOX ID + 攻击活动关联 | 🔴 极高 |
| **攻击工具链** | ZeroPulse、Velociraptor、KillAV 等完整清单 | 🔴 高 |
| **赎金谈判** | 实时截图（$250K → $190K） | 🔴 高 |
| **FortiGate 清单** | 14,700台已入侵设备 + 实时追踪仪表盘 | 🔴 极高 |
| **VPN 凭证** | 969个暴力破解获取的凭证 | 🔴 极高 |
| **BTC 洗钱** | 钱包地址 + 分发记录 | 🟡 中 |
| **入侵案例** | 附属成员详细攻击过程 | 🔴 高 |
| **AI 使用证据** | 管理员使用 AI 辅助开发 | 🟡 中 |
| **链式攻击** | 英国咨询公司数据 → 攻击土耳其公司 | 🔴 高 |
| **GPO 部署** | 批量加密机制详情 | 🔴 高 |
| **分成规则** | 90/10 分成 + BTC 分发记录 | 🟡 中 |

### 7.4 泄露影响评估

| 维度 | 影响 |
|------|------|
| **组织运营** | 被迫迁移通讯基础设施，但未停摆 |
| **附属成员** | 身份暴露风险，部分可能退出 |
| **受害者** | 泄露数据被其他组织二次利用 |
| **执法** | 提供完整证据链，但俄方不配合 |
| **竞争格局** | 其他勒索组织获取其战术/工具 |

### 7.5 当前状态（截至2026年6月）

```
泄露后组织状态:
├── 仍在活跃攻击（每24小时 ~15个新受害者）
├── 预期品牌重塑/基础设施迁移
├── 泄露数据已在暗网+公开渠道流通
├── 其他组织二次利用风险极高
└── 核心架构完全暴露，但运营能力未受根本性打击
```

---

## 八、基础设施分析

### 8.1 已知基础设施

| 类型 | 值 | 说明 | 状态 |
|------|-----|------|------|
| **IP** | `176.120.22.127` | 唯一历史 C2 IP，Proton66 | 历史 |
| **Tor DLS** | `xcsqtdobtmdhsjkyjz6iydfowh7bps5dd3a2xg53oirylnohednc4syd.onion` | Rocket.Chat 内部通讯 | 已泄露 |
| **托管商** | 4VPS.SU | Rocket.Chat 托管 | 被入侵 |
| **托管商** | Proton66 | 开放目录暴露工具包 | 活跃 |
| **BreachForums** | 多个域名 | 附属招募 | 部分被查封 |

### 8.2 基础设施特征

```
基础设施策略:
├── Tor 隐藏服务（.onion）
├── 俄罗斯 bulletproof hosting（Proton66、4VPS）
├── 临时性基础设施（频繁迁移）
├── 开放目录暴露（OPSEC 失误）
├── 自建 Rocket.Chat（替代 Mattermost）
└── 多沟通渠道（Tox、SimpleX、Ricochet Refresh）
```

---

## 九、IOC 完整列表

### 9.1 文件哈希

| 类型 | 哈希值 | 说明 |
|------|--------|------|
| SHA-256 | `51b9f246d6da85631131fcd1fabf0a67937d4bdde33625a44f7ee6a3a7baebd2` | 首个样本，2025.07.17 |
| SHA-256 | `22b38dad7da097ea03aa28d0614164cd25fafeb1383dbc15047e34c8050f6f67` | Microsoft IOC |
| SHA-256 | `3ab9575225e00a83a4ac2b534da5a710bdcf6eb72884944c437b5fbe5c5c9235` | Bedrock 分析样本，PE32+ x64 Go binary，Garble 混淆，2,962,944 bytes，2026-04-03 |

### 9.2 网络指标

| 类型 | 值 | 说明 |
|------|-----|------|
| IP | `176.120.22.127` | 历史 C2 |
| Tor | `xcsqtdobtmdhsjkyjz6iydfowh7bps5dd3a2xg53oirylnohednc4syd.onion` | Rocket.Chat |
| Tor | `tezwsse5czllksjb7cwp65rvnk4oobmzti2znn42i43bjdfd2prqqkad.onion` | 泄露站（Bedrock 发现） |
| TOX ID | `F8E24C7F5B12CD69C44C73F438F65E9BF560ADF35EBBDF92CF9A9B84079F8F04060FF98D098E` | 管理员 |
| TOX ID | `88984846080D639C9A4EC394E53BA616D550B2B3AD691942EA2CCD33AA5B9340FD1A8FF40E9A` | 管理员（Bedrock 发现） |
| X25519 PubKey | `fcb11717cab989424755a957c1d55361b119de4fdcfecdb2f2e56b15ad801922` | 运营者 X25519 公钥 |
| Email | `negotiation_hapvida@proton.me` | 赎金谈判邮箱 |

### 9.3 文件特征

| 特征 | 值 |
|------|-----|
| 勒索信 | `README-GENTLEMEN.txt` |
| 文件扩展名 | 6位随机字符（如 `.umc16h`） |
| 文件标记 | `--marker--` + `GENTLEMEN` |
| 文件尾部结构 | `--eph--<base64(临时公钥)>--marker--GENTLEMEN` |
| 计划任务 | `UpdateSystem`、`UpdateUser` |
| 注册表键 | `HKLM\...\Run\GupdateS`、`HKCU\...\Run\GupdateU` |
| 壁纸 | 加密后桌面壁纸更改为 `gentlemen.bmp` |
| 子进程环境变量 | `LOCKER_BACKGROUND=1` |
| CLI 参数 | `--path`、`--fast`、`--full`、`--shares`、`--silent`、`--system`、`--spread`、`--wipe`、`-T`（延迟） |

### 9.4 行为指标

| 行为 | 说明 |
|------|------|
| 进程终止 | 批量终止虚拟化、数据库、备份、EDR、SAP、Office 进程 |
| 日志清除 | Security、System、Application 日志 + Prefetch + RDP + PowerShell |
| 服务禁用 | 批量禁用安全软件服务 |
| 影子副本删除 | `vssadmin delete shadows /all /quiet` 及 `wmic` |
| Defender 排除 | 通过 `Add-MpPreference` 添加排除项 |
| Prefetch 删除 | 删除 Windows Prefetch 文件 |
| 壁纸替换 | 桌面壁纸更改为 `gentlemen.bmp` |
| SMB1 启用 | 过时协议，便于横向移动 |
| LSA 放宽 | 便于凭证窃取 |

---

## 十、检测规则

### 10.1 Sigma 规则

```yaml
title: The Gentlemen Ransomware - Process Termination
id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
status: experimental
description: 检测 The Gentlemen 勒索软件批量终止进程的行为
author: Threat Intelligence Team
date: 2026/06/18
references:
    - https://github.com/Bedrock-Safeguard/gentlemen-decryptor
logsource:
    category: process_termination
    product: windows
detection:
    selection:
        EventID: 4689
        TargetProcessName|contains:
            - 'veeam'
            - 'sql'
            - 'exchange'
            - 'vmware'
            - 'hyper-v'
            - 'defender'
            - 'msmpeng'
    condition: selection
level: high
```

```yaml
title: The Gentlemen Ransomware - Shadow Copy Deletion
id: b2c3d4e5-f6a7-8901-bcde-f12345678901
status: experimental
description: 检测影子副本删除行为
author: Threat Intelligence Team
date: 2026/06/18
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
```

```yaml
title: The Gentlemen Ransomware - Log Clearing
id: c3d4e5f6-a7b8-9012-cdef-123456789012
status: experimental
description: 检测事件日志清除行为
author: Threat Intelligence Team
date: 2026/06/18
logsource:
    product: windows
    service: security
detection:
    selection:
        EventID: 1102
        LogName: Security
    condition: selection
level: high
```

### 10.2 YARA 规则

```yara
rule The_Gentlemen_Ransomware {
    meta:
        description = "Detects The Gentlemen ransomware samples"
        author = "Threat Intelligence Team"
        date = "2026-06-18"
        hash = "51b9f246d6da85631131fcd1fabf0a67937d4bdde33625a44f7ee6a3a7baebd2"
    
    strings:
        $marker = "--marker--GENTLEMEN"
        $ransom_note = "README-GENTLEMEN.txt"
        $task1 = "UpdateSystem"
        $task2 = "UpdateUser"
        $reg1 = "GupdateS"
        $reg2 = "GupdateU"
        $spread = "--spread"
        $wipe = "--wipe"
    
    condition:
        any of them
}
```

### 10.3 KQL 查询（Microsoft Defender）

```kql
let ioc_sha_hashes = dynamic([
    "22b38dad7da097ea03aa28d0614164cd25fafeb1383dbc15047e34c8050f6f67",
    "51b9f246d6da85631131fcd1fabf0a67937d4bdde33625a44f7ee6a3a7baebd2"
]);
DeviceFileEvents
| where SrcFileSHA256 in (ioc_sha_hashes) or TargetFileSHA256 in (ioc_sha_hashes)
| extend AccountName = tostring(split(User, @'')[1])
| extend AccountNTDomain = tostring(split(User, @'')[0])
| extend AlgorithmType = "SHA256"
```

```kql
DeviceProcessEvents
| where ProcessCommandLine contains "vssadmin"
    and ProcessCommandLine contains "delete"
    and ProcessCommandLine contains "shadows"
```

```kql
DeviceEvents
| where ActionType == "SecurityLogCleared"
```

---

## 十一、风险评估矩阵

### 11.1 威胁能力评估

| 能力维度 | 评分（1-5） | 说明 |
|----------|-------------|------|
| **技术复杂度** | 5 | 多平台加密、蠕虫传播、BYOVD、AI辅助开发 |
| **运营成熟度** | 5 | 完整 RaaS 平台、专业谈判、快速响应 |
| **资源水平** | 4 | 14,700台已入侵设备、969个凭证、20人团队 |
| **攻击速度** | 5 | 数小时内全网加密 |
| **隐蔽性** | 4 | Garble混淆、LOLBins、日志清除 |
| **适应性** | 5 | 同日补丁绕过解密器 |
| **总体威胁等级** | 🔴 极高 | 4.7/5 |

### 11.2 受害者风险评估

| 风险因素 | 概率 | 影响 | 风险等级 |
|----------|------|------|----------|
| 数据永久丢失 | 高 | 极高 | 🔴 极高 |
| 数据公开泄露 | 高 | 极高 | 🔴 极高 |
| 业务中断 | 极高 | 极高 | 🔴 极高 |
| 合规处罚 | 高 | 高 | 🔴 高 |
| 员工诉讼 | 高 | 高 | 🔴 高 |
| 舆情危机 | 高 | 高 | 🔴 高 |
| 二次勒索 | 高（68%） | 高 | 🔴 高 |
| 供应链扩散 | 中 | 高 | 🟡 中 |

---

## 十二、缓解建议

### 12.1 战略层建议（长期）

| 优先级 | 建议 | 说明 |
|--------|------|------|
| P1 | **建立不可变备份体系** | 离线 + 不可变 + 定期测试恢复 |
| P1 | **零信任架构转型** | 最小权限、微隔离、持续验证 |
| P2 | **网络分段** | IT/OT 分离、关键资产隔离 |
| P2 | **身份安全强化** | 密码less MFA、PAM、条件访问 |
| P3 | **威胁情报共享** | 加入 ISAC、共享 IOC |
| P3 | **安全意识培训** | 钓鱼模拟、社工防御 |

### 12.2 运营层建议（中期）

| 优先级 | 建议 | 说明 |
|--------|------|------|
| P1 | **漏洞管理强化** | 72小时内修补高危漏洞 |
| P1 | **EDR 全覆盖** | 所有端点部署 EDR，启用防篡改 |
| P2 | **攻击面管理** | 定期扫描公网暴露资产 |
| P2 | **凭证轮换** | 90天轮换、禁用默认凭证 |
| P3 | **日志集中管理** | SIEM、不可变日志、保留90天+ |
| P3 | **事件响应演练** | 季度桌面推演、年度实战演练 |

### 12.3 战术层建议（立即执行）

#### 针对 FortiGate 用户

```bash
# 1. 立即检查 FortiOS 版本
get system status

# 2. 如版本在受影响范围，立即修补
# FortiOS 7.0.0 - 7.0.16 → 升级至 7.0.17+
# FortiOS 7.2.0 - 7.2.12 → 升级至 7.2.13+
# FortiProxy 7.0.0 - 7.0.19 → 升级至 7.0.20+
# FortiProxy 7.2.0 - 7.2.12 → 升级至 7.2.13+

# 3. 审计已创建账户
show user

# 4. 检查自动化脚本
show system automation

# 5. 导出配置备份
execute backup config tftp <config_file> <tftp_server>

# 6. 全量轮换 VPN 凭证
config user local
    edit <user_name>
        set passwd <new_password>
    next
end
```

#### 针对已感染环境

```powershell
# 1. 如加密进程仍在运行，立即抓取内存镜像
procdump.exe -ma -accepteula <ransomware_pid> ransomware_dump.dmp

# 2. 隔离受感染主机
netsh advfirewall firewall set rule group="remote desktop" new enable=no
netsh advfirewall firewall set rule group="file and printer sharing" new enable=no

# 3. 禁用 SMB1（防止横向移动）
Set-SmbServerConfiguration -EnableSMB1Protocol $false

# 4. 检查计划任务
schtasks /query /fo LIST | findstr "UpdateSystem UpdateUser"

# 5. 检查注册表启动项
reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
reg query "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"

# 6. 检查影子副本
vssadmin list shadows

# 7. 收集取证数据
```

### 12.4 解密恢复路径

| 场景 | 可行路径 | 成功率 | 建议 |
|------|----------|--------|------|
| 加密进程仍在运行 | Bedrock Safeguard 内存密钥恢复 | 高（100%） | 🔴 **立即执行** |
| 有离线备份 | 备份恢复 | 极高 | ✅ 最可靠 |
| 无备份、进程已终止 | 等待泄露密钥分析 | 低 | ⏳ 持续监控 |
| 考虑付费 | — | 极低（68%二次勒索） | ❌ **强烈不建议** |

### 12.5 解密工具详解：Bedrock Safeguard Gentlemen Decryptor

**工具地址**：https://github.com/Bedrock-Safeguard/gentlemen-decryptor

**发布机构**：Bedrock Safeguard Inc.（加拿大网络安全情报公司）

**发布时间**：2026年4月21日

**许可证**：BSL 1.1（非商业使用、企业内部使用、应急响应、学术研究免费）

**这是目前唯一公开的 The Gentlemen 勒索软件解密方法。**

#### 12.5.1 原理概述

The Gentlemen 使用 XChaCha20 流加密 + X25519 ECDH 密钥交换，每个文件使用独立的临时密钥对加密。加密算法本身在数学上是安全的——Bedrock Safeguard **没有破解数学**，而是**破解了实现**。

Go 运行时在 goroutine 栈和堆上**不会在使用后清零密钥材料**（CWE-244 / CWE-316）。每个临时 X25519 私钥在勒索进程**整个生命周期内**持续存在于进程内存中——不仅在加密期间，而是从 Go crypto 模块初始化到进程终止。Go GC 在堆代之间复制数据，产生多个密钥副本。

**因此，只要在进程存活期间任意时刻获取内存转储，就包含解密所有文件所需的全部密钥。**

**实测结果**：35/35 文件解密，100% 准确率。35 个密钥在 0.6 秒内从单次内存转储中恢复。

#### 12.5.2 内存转储来源

| 来源 | 说明 |
|------|------|
| **EDR/XDR 解决方案** | CrowdStrike、SentinelOne、Carbon Black、Microsoft Defender for Endpoint 等 routinely 捕获进程内存 |
| **应急响应团队** | IR 团队使用 `procdump`、任务管理器"创建转储文件"或任何取证工具捕获的勒索进程 |
| **Windows Error Reporting** | 如勒索软件崩溃，Windows 可能在 `C:\ProgramData\Microsoft\Windows\WER\` 保存转储 |
| **崩溃转储** | 检查 `C:\Windows\Minidump\` 和 `C:\Windows\MEMORY.DMP` |
| **全量 RAM 捕获** | 使用 WinPmem、Magnet RAM Capture 或 FTK Imager 在重启前获取的 RAM 镜像 |
| **休眠文件** | `C:\hiberfil.sys` 包含系统休眠时的 RAM 快照 |

#### 12.5.3 解密操作步骤

```bash
# 1. 安装依赖
pip install cryptography

# 2. 从加密文件中提取临时公钥
python extract_keys_from_files.py --input-dir /path/to/encrypted/files --output keys.json

# 3. 在内存转储中搜索匹配的私钥
python recover_keys.py --dump process_memory.dmp --pubkeys keys.json --output recovered_keys.json

# 4. 解密文件
python decrypt.py --keys recovered_keys.json --input-dir /path/to/encrypted/files --output-dir /path/to/recovered
```

#### 12.5.4 密钥恢复技术流程

```
1. 获取进程内存转储（进程存活期间任意时刻）
2. 以 8 字节对齐偏移扫描 32 字节值
3. 对每个候选值计算 public = X25519(candidate, basepoint)
4. 与加密文件尾部提取的临时公钥比对
5. 匹配成功 = 该文件私钥恢复
6. 派生解密密钥: shared_secret = X25519(ephemeral_private, operator_public)
7. 使用 XChaCha20 + shared_secret 解密文件
```

#### 12.5.5 关联防御工具

Bedrock Safeguard 同步开发了 [**Bedrock RansomGuard**](https://github.com/Bedrock-Safeguard/RansomGuard)——一个开源 Windows 服务，自动检测勒索软件加密行为并在密钥被销毁前捕获进程内存。RansomGuard 适用于所有勒索软件家族，不仅限于 The Gentlemen。

#### 12.5.6 重要限制

- **前提条件**：必须拥有勒索进程**存活期间**的内存转储
- **进程已终止**：如进程已被杀死且无内存转储，此方法**不可用**
- **组织已修补**：The Gentlemen 在解密器发布同日发布了补丁绕过此方法（新版本可能已修复内存密钥残留问题）
- **联系协助**：如需要解密协助，可联系 Bedrock Safeguard（contact@bedrocksafe.ca）

---

## 十三、核心建议（优先级排序）

1. **立即**：如加密进程仍在运行，**立即抓取内存镜像**用于密钥恢复
2. **立即**：修补所有 FortiOS/FortiProxy 的 CVE-2024-55591
3. **24小时内**：审计所有 FortiGate 是否已被创建后门账户
4. **48小时内**：全量轮换 VPN/远程访问凭证
5. **1周内**：部署不可变备份 + 离线隔离策略

---

## 附录

### 附录 A：权威信息源索引

| # | 来源 | 说明 |
|---|------|------|
| 1 | Microsoft 技术分析 | 加密机制+横向移动+IOC |
| 2 | Check Point 泄露分析 | 运营者身份+TOX ID+谈判截图 |
| 3 | Krebs 身份归因 | 真实身份+证据链 |
| 4 | PRODAFT 完整报告 | 组织演化+AI使用 |
| 5 | Ransom-ISAC 白皮书 | 120分钟深度技术分析 |
| 6 | Bedrock 解密器 | 唯一公开解密方法 |
| 7 | FalconFeeds 生态分析 | 基础设施+CVE清单 |
| 8 | Halcyon 威胁评估 | 规模评估+缓解措施 |
| 9 | Huntress TTP分析 | 防御规避实战 |
| 10 | FortiGuard 画像 | CVE清单+行业分布 |
| 11 | LevelBlue/SpiderLabs | 泄露统计分析 |
| 12 | CyberWarrior 综合分析 | 多源交叉验证+法律风险 |
| 13 | The Hacker News | 最新受害者数据 |
| 14 | Bitdefender 月报 | 多组织共享受害者趋势 |
| 15 | CyberPeace 地缘分析 | 地缘政治+AI武器化 |

### 附录 B：术语表

| 术语 | 定义 |
|------|------|
| **RaaS** | Ransomware-as-a-Service，勒索软件即服务 |
| **DLS** | Data Leak Site，数据泄露站 |
| **TOX** | 端到端加密即时通讯协议 |
| **BYOVD** | Bring Your Own Vulnerable Driver，自带漏洞驱动 |
| **LOLBins** | Living Off the Land Binaries，系统自带二进制滥用 |
| **C2** | Command and Control，命令与控制 |
| **IOC** | Indicator of Compromise，入侵指标 |
| **TTP** | Tactics, Techniques, and Procedures，战术、技术和程序 |
| **ECDH** | Elliptic Curve Diffie-Hellman，椭圆曲线密钥交换 |
| **GPO** | Group Policy Object，组策略对象 |
| **AD CS** | Active Directory Certificate Services，AD 证书服务 |

### 附录 C：持续跟踪计划

本页面将作为 The Gentlemen 组织的**长期跟踪情报页面**，持续更新以下内容：

- 新受害者案例与攻击事件
- 新发现的 IOC 与检测规则
- 组织基础设施变动
- 解密工具进展
- 执法行动与归因更新
- 泄露数据二次利用情况
- 组织内部变动与品牌重塑

---

**报告修订历史**

| 版本 | 日期 | 修订内容 |
|------|------|----------|
| v1.0 | 2026-06-18 | 初始发布 |
| v1.1 | 2026-06-18 | 补充 Bedrock Safeguard 解密工具详解（12.5节）、新增 IOC（X25519 公钥、新样本哈希、新 TOX ID、泄露站 onion、谈判邮箱）、补充文件尾部结构/CLI 参数/壁纸替换等行为指标 |

---

**免责声明**：本报告基于公开来源情报编制，仅供信息参考。本报告中的信息按"原样"提供，不对其准确性、完整性或适用性作任何明示或暗示的保证。使用本报告中的信息需自行承担风险。

**分类等级说明**：TLP:AMBER - 信息可在组织内部共享，但不可公开发布。
