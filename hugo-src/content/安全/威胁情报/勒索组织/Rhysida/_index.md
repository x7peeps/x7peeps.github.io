---
title: "Rhysida"
weight: 12
---

**报告编号**: TIR-2026-0624-012 | **分类等级**: TLP:AMBER | **发布日期**: 2026年6月24日 | **情报来源**: 多源交叉验证（OSINT + 执法通报 + 厂商报告）

---

## 一、执行摘要

**Rhysida** 是一个于2023年5月首次活跃的勒索软件即服务（RaaS）组织，以蜈蚣属（*Rhysida*）命名并使用蜈蚣标志。该组织与 **Vice Society（DEV-0832/Vanilla Tempest）** 存在高度技术关联，多家安全厂商和执法机构评估认为 Rhysida 是 Vice Society 的演化品牌或关联载荷。截至2026年6月，Rhysida 已攻击全球超过 **200个组织**，重点目标涵盖教育、医疗、制造业、信息技术和政府部门的"机会性目标"。

<!--more-->

### 关键发现

| 维度 | 关键指标 |
|------|----------|
| **组织规模** | 200+ 受害者（含 Interlock 生态约 80+ 受害者/2025年），全球影响 |
| **攻击速度** | 从横向移动到勒索部署最短仅需 **8天** |
| **加密强度** | ChaCha20 + RSA-4096，**无公开解密器** |
| **首要入口** | VPN 凭证利用（无MFA）、恶意广告（Malvertising）、漏洞利用 |
| **商业模式** | RaaS，利润分成模式，仅接受比特币支付 |
| **核心载荷** | Rhysida 加密器（Windows/Linux）、CleanUpLoader/OysterLoader、Supper 后门 |
| **多平台支持** | Windows、Linux |
| **关联组织** | Vice Society（DEV-0832）、Interlock、TAG-124（Landupdate808） |
| **解密可能性** | **不存在**（截至2026年6月无公开解密工具） |

### 威胁等级评估

| 评估维度 | 等级 | 说明 |
|----------|------|------|
| **技术能力** | 🟠 高 | 多平台加密、CleanUpLoader 持久化、代码签名证书滥用、Tomb 加密器 |
| **运营成熟度** | 🟠 高 | RaaS 平台、多层基础设施、恶意广告分发网络 |
| **攻击规模** | 🟠 高 | 200+ 受害者，教育/医疗/政府跨部门攻击 |
| **目标针对性** | 🔴 极高 | 主动攻击学校和医院，突破传统勒索软件"道德底线" |
| **数据泄露风险** | 🔴 极高 | 双重勒索 + 泄露网站公开羞辱 + 7天快速发布期限 |

---

## 二、威胁行为者画像

### 2.1 组织标识

| 属性 | 值 |
|------|-----|
| **官方名称** | Rhysida |
| **别名** | DEV-0832（Microsoft）、Vanilla Tempest（Microsoft）、TAC5279（Sophos） |
| **追踪编号** | G1039（MITRE）、S1147 |
| **组织类型** | 勒索软件即服务（RaaS） |
| **活跃周期** | 2023年5月 → 至今 |
| **主要语言** | 英语（泄露站）、俄语（推断，CIS地区活动） |
| **地理归属** | 独联体地区（CIS），可能位于俄罗斯（中置信度） |
| **攻击目标** | 教育、医疗、制造、IT、政府（"机会性目标"） |
| **动机** | 经济利益 |
| **标志** | 蜈蚣（Centipede） |

### 2.2 组织演化时间线

```
2021年夏季    Vice Society 首次活跃
              主要目标：美国教育部门
              使用多种商品化勒索载荷
    ↓
2022.11       Sophos 首次观测到 TAC5279 活动集群
              针对政府/物流部门部署 Vice Society
    ↓
2023.02       Vice Society 攻击物流部门
              驻留时间长达112天
    ↓
2023.04       Vice Society 攻击教育部门
              开始使用 SystemBC
    ↓
2023.05       Rhysida 首次出现
              智利军队遭攻击
              Vice Society 活动开始减少
    ↓
2023.06       同一 TAC5279 集群切换至 Rhysida
              物流和教育部门受害
    ↓
2023.07       攻击 Prospect Medical Holdings
              影响美国17家医院和166家诊所
              美国 HHS 定义为医疗 sector 重大威胁
    ↓
2023.10       英国图书馆遭攻击
              英王爱德华七世医院数据泄露
              声称窃取英国王室成员信息
    ↓
2023.11       CISA/FBI/MS-ISAC 联合发布警报（AA23-319A）
    ↓
2023.12       Insomniac Games 遭攻击
              Marvel's Wolverine 游戏细节泄露
    ↓
2024.05       恶意广告活动启动（Google/Bing）
              CleanUpLoader 伪装 Microsoft Teams 下载
    ↓
2024.07       美国哥伦布市遭攻击
              3TB 数据泄露，勒索30 BTC（170万美元）
    ↓
2024.08       西雅图-塔科马国际机场遭攻击
    ↓
2025.01       IBM X-Force 发现 Tomb 加密器用于加载 Broomstick/Rhysida
    ↓
2025.03       恶意广告活动升级（Bing 搜索 + Windows 11 开始菜单）
              使用40+ 代码签名证书（vs 2024年仅7个）
              滥用 Microsoft Trusted Signing 系统
    ↓
2025.04       CISA 更新通告（新增 IOC）
    ↓
2025.06       IBM X-Force 披露 Rhysida-Interlock 生态关联
              Endico 下载器、Supper 后门、Tomb 加密器
    ↓
2025.09       Microsoft  disrupt Vanilla Tempest 活动
              撤销200+ 关联代码签名证书
    ↓
2026          持续活跃，约80受害者（2025年数据）
              Interlock 生态可能从 Rhysida 分裂
```

### 2.3 关联团伙

| 代号 | 说明 |
|------|------|
| **Vice Society / DEV-0832** | 前身/关联组织，TTPs 高度一致，2023年5月后活动减少与 Rhysida 出现时间吻合 |
| **Vanilla Tempest** | Microsoft 对 Vice Society/Rhysida 关联集群的追踪名称 |
| **TAC5279** | Sophos 对同一攻击者行为集群的追踪编号 |
| **Interlock** | 2024年9月出现的勒索组织，Cisco Talos 评估可能从 Rhysida 运营者/开发者分裂 |
| **TAG-124 / Landupdate808 / KongTuke** | IBM X-Force 发现的与 Interlock 关联的活动集群 |

### 2.4 附属成员体系

| 指标 | 数据 |
|------|------|
| **分成比例** | 利润分成模式（RaaS），具体比例未公开 |
| **沟通渠道** | 泄露网站谈判、比特币支付 |
| **准入门槛** | 通过 IAB（初始访问经纪人）获取访问权限 |
| **专业分工** | 基础设施管理、恶意广告运营、CleanUpLoader 开发、谈判 |

---

## 三、归因分析

### 3.1 归属评估

| 字段 | 信息 | 置信度 |
|------|------|--------|
| **语言归属** | 英语（泄露站）、俄语（推断） | 中 |
| **地理归属** | 独联体地区（CIS），可能位于俄罗斯 | 中 |
| **Vice Society 关联** | TTPs 完全一致（PortStarter、SystemBC、temp_l0gs 目录、ZeroLogon、RDP+PsExec），时间线吻合 | 高 |
| **Sophos TAC5279** | 同一攻击者集群从 Vice Society 切换至 Rhysida | 高 |
| **Microsoft Vanilla Tempest** | 将 Vice Society 和 Rhysida 归为同一活动集群 | 确认 |
| **Interlock 关联** | 共享 Supper 后门、Tomb 加密器，TTPs 相似 | 中（Cisco Talos 低置信度） |

### 3.2 技术归因证据

**Vice Society → Rhysida 关联证据**：

| 证据类型 | 详情 |
|----------|------|
| **工具一致性** | PortStarter、SystemBC、Advanced IP Scanner、AnyDesk、PuTTY、MegaSync、WinSCP |
| **目录特征** | 均使用 `temp_l0gs` 目录存储 NTDS.dit 转储 |
| **漏洞利用** | 均利用 ZeroLogon（CVE-2020-1472） |
| **横向移动** | RDP + PsExec 组合，清除 RDP 日志和注册表项 |
| **数据渗出** | MegaSync + WinSCP + 自定义 PowerShell 脚本 |
| **初始访问** | 通过无 MFA 的 VPN 凭证入侵 |
| **时间线吻合** | Rhysida 出现（2023.05）与 Vice Society 活动减少时间完全一致 |
| **行业重叠** | 均重点攻击教育和医疗 sector |

### 3.3 执法状态

**⚠️ 重要提示**：截至2026年6月：

- ❌ **无正式国家级归因声明**
- ❌ **无国际刑警组织红色通缉令**
- ❌ **无欧盟"最通邀犯"名单**
- ✅ **CISA/FBI/MS-ISAC 联合警报**（AA23-319A，2023年11月发布，2025年4月更新）
- ✅ **美国 HHS 行业警报**（医疗 sector 重大威胁）
- ✅ **Microsoft disrupt 行动**（2025年9月撤销200+ 证书）

### 3.4 地缘政治因素

| 因素 | 评估 |
|------|------|
| **俄方态度** | 仅追诉底层协助者，高级运营者免于追诉 |
| **执法壁垒** | 独联体地区不配合西方执法请求 |
| **运营模式** | RaaS 去中心化，附属网络分散，难以彻底瓦解 |
| **目标选择** | 攻击包括军事（智利军队）和政府目标，无地缘政治回避 |

---

## 四、技术能力评估

### 4.1 恶意软件生态

| 恶意软件 | 类型 | 用途 | 说明 |
|----------|------|------|------|
| **Rhysida 加密器** | 勒索加密器 | 文件加密 | ChaCha20 + RSA-4096，Windows/Linux 双平台 |
| **CleanUpLoader** | 后门/加载器 | 持久化 + 数据渗出 | 又名 OysterLoader、Broomstick，伪装为软件安装器 |
| **OysterLoader** | 初始访问工具 | 建立立足点 | CleanUpLoader 的演化版本 |
| **SystemBC** | C2 框架 | 加密命令控制 | PowerShell 植入物 |
| **PortStarter** | 后门 | 持久化 | Vice Society 时期使用 |
| **Supper** | 后门 | SOCKS 代理 | 又名 SocksShell，与 Interlock 共享 |
| **Endico** | 下载器 | 第二阶段载荷投递 | Tomb 加密 |
| **Latrodectus** | 加载器 | 初始访问 | 2025年新增，与 OysterLoader 共用签名证书 |
| **NodeSnake** | 后门 | C2 通信 | 与 Interlock 生态关联 |

### 4.2 加密机制分析

#### 4.2.1 加密算法

| 组件 | 算法 | 说明 |
|------|------|------|
| **对称加密** | ChaCha20 | 流加密，速度快 |
| **非对称加密** | RSA-4096 | 加密 ChaCha20 密钥 |
| **文件扩展名** | `.rhysida` | 被加密文件标识 |
| **勒索信** | PDF 格式 | 仅 targeting 可处理 PDF 的系统 |
| **支付方式** | 仅接受比特币 | 双重勒索模式 |

#### 4.2.2 加密流程

```
┌─────────────────────────────────────────────────────────────┐
│  1. 生成 ChaCha20 对称密钥                                  │
│  2. 使用 ChaCha20 加密文件内容                              │
│  3. 生成 RSA-4096 密钥对                                    │
│  4. 使用 RSA 公钥加密 ChaCha20 密钥                         │
│  5. 将加密后的 ChaCha20 密钥附加到文件                      │
│  6. 重命名文件（添加 .rhysida 扩展名）                      │
│  7. 投放 PDF 格式勒索信                                     │
│  8. 删除卷影副本                                            │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 代码签名证书滥用（2024-2025新能力）

| 阶段 | 时间 | 证书数量 | 说明 |
|------|------|----------|------|
| **Phase I** | 2024.05-09 | 7个证书 | 首次恶意广告活动（Google） |
| **Phase II** | 2025.06+ | 40+ 证书 | Bing 恶意广告 + Windows 11 开始菜单 |
| **Trusted Signing** | 2025 | 200+ 证书 | 滥用 Microsoft Trusted Signing 系统，72小时有效期 |

**滥用机制**：
- 伪造合法软件下载页面（Microsoft Teams、PuTTY、Zoom）
- 使用代码签名证书使恶意文件获得 Windows 信任
- Microsoft Trusted Signing 证书72小时有效期，攻击者大规模批量获取
- 证书被撤销前已有窗口期完成攻击

### 4.4 Tomb 加密器

| 属性 | 说明 |
|------|------|
| **发现时间** | 2024年1月 |
| **用途** | 加密 Broomstick（CleanUpLoader）和 Rhysida 载荷 |
| **别名** | Textshell、pkr_mtsi |
| **更新** | 2025年4月增加第二阶段加载 shellcode stub |
| **关联** | Rhysida、Interlock 共用 |

### 4.5 C2 架构

```
┌─────────────────────────────────────────────────────────────┐
│  多层基础设施架构                                            │
│                                                             │
│  Layer 1: 恶意广告 → 伪造下载页 → CleanUpLoader 投递        │
│           （typosquatting 域名 + SEO 投毒）                  │
│                                                             │
│  Layer 2: CleanUpLoader → C2 通信（HTTPS）                  │
│           多 C2 域名冗余配置                                 │
│                                                             │
│  Layer 3: SystemBC → 持久化后门                             │
│           PowerShell 植入物                                  │
│                                                             │
│  Layer 4: Cobalt Strike → 后渗透操作                        │
│           横向移动 + 数据渗出                                │
│                                                             │
│  Layer 5: Rhysida 加密器 → 最终载荷部署                     │
└─────────────────────────────────────────────────────────────┘
```

### 4.6 核心能力

| 能力 | 说明 |
|------|------|
| **NTDS.dit 提取** | `ntdsutil.exe`，存储于 `temp_l0gs` 目录 |
| **LSASS 内存转储** | 通过 Mimikatz 或 comsvcs.dll |
| **RDP 日志清除** | 删除 RDP 连接相关日志和注册表项 |
| **事件日志清除** | 清除 Windows 事件日志 |
| **ZeroLogon 利用** | CVE-2020-1472 域控权限提升 |
| **Secretsdump** | 远程凭据提取 |
| **商业远程工具** | AnyDesk、PuTTY、Advanced IP/Port Scanner |
| **数据渗出** | MegaSync、WinSCP、自定义 PowerShell 脚本、7zip 压缩 |

---

## 五、攻击链分析

### 5.1 MITRE ATT&CK 映射

| 阶段 | 技术 | 说明 |
|------|------|------|
| **初始访问** | T1190 | 利用公开应用漏洞（CVE-2023-34048 VMware Aria Operations） |
| | T1078 | 有效账户（VPN 凭证，无MFA） |
| | T1566.002 | 钓鱼链接（恶意广告分发） |
| | T1189 | 驱动器通过访问（SEO 投毒 + 恶意广告） |
| **执行** | T1059.001 | PowerShell |
| | T1204.002 | 用户执行恶意文件（伪造安装器） |
| **持久化** | T1547.001 | 注册表运行键 |
| | T1543 | 服务创建 |
| **权限提升** | T1068 | 漏洞利用（ZeroLogon CVE-2020-1472） |
| **防御规避** | T1562.001 | 禁用安全软件 |
| | T1070.001 | 清除事件日志 |
| | T1070.004 | 清除 RDP 日志和注册表项 |
| | T1027 | 载荷混淆（Tomb 加密器、打包器） |
| | T1553.002 | 代码签名（滥用合法证书） |
| **凭证访问** | T1003.001 | LSASS 内存转储 |
| | T1003.003 | NTDS.dit 提取（ntdsutil，`temp_l0gs` 目录） |
| | T1003.006 | DCSync / Secretsdump |
| **发现** | T1046 | 网络服务发现（Advanced IP/Port Scanner） |
| | T1018 | 远程系统发现 |
| **横向移动** | T1021.001 | 远程桌面协议（RDP） |
| | T1021.002 | SMB/PsExec |
| | T1570 | 横向工具传输 |
| **收集** | T1005 | 本地系统数据收集 |
| | T1560.001 | 7zip 压缩归档 |
| **渗出** | T1048.003 | 替代协议外传（MegaSync、WinSCP） |
| | T1567 | 云托管服务渗出 |
| **影响** | T1486 | 数据加密勒索 |
| | T1490 | 删除卷影副本 |
| | T1657 | 双重勒索（加密 + 数据泄露威胁） |

### 5.2 完整攻击链还原

#### 阶段一：初始入侵

```
┌─────────────────────────────────────────────────────────────┐
│  入侵路径 A（传统路径）: VPN 凭证利用                        │
│  ──────────────────────────────                              │
│  1. 获取无 MFA 的 VPN 凭证（暗网购买/凭证泄露）             │
│  2. 通过 VPN 接入内部网络                                    │
│  3. 驻留时间: 5-112天不等                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  入侵路径 B（2024+）: 恶意广告 + CleanUpLoader               │
│  ────────────────────────────────────                        │
│  1. 购买 Bing/Google 搜索广告                               │
│  2. 创建伪造下载页面（Teams、PuTTY、Zoom）                  │
│  3. SEO 投毒 + typosquatting 域名                            │
│  4. 受害者下载并运行伪造安装器                               │
│  5. 部署 CleanUpLoader/OysterLoader                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  入侵路径 C: 漏洞利用                                        │
│  ────────────────────────                                    │
│  1. 利用 CVE-2023-34048（VMware Aria Operations for Network）│
│  2. 利用其他暴露的外部服务漏洞                               │
└─────────────────────────────────────────────────────────────┘
```

#### 阶段二：内网侦察与权限提升

```
内网侦察
├── Advanced IP/Port Scanner 扫描网络
├── RDP 连接远程主机
├── 远程 PowerShell 会话（WinRM）
├── PuTTY SSH 连接
└── AnyDesk 远程桌面

权限提升
├── ZeroLogon（CVE-2020-1472）→ 域控权限
├── ntdsutil.exe → NTDS.dit 转储（存于 temp_l0gs）
├── Secretsdump → 远程凭据提取
├── LSASS 内存转储 → Mimikatz
└── 枚举域管理员账户
```

#### 阶段三：横向移动

```powershell
# RDP 横向移动（清除日志）
# 连接后删除相关日志和注册表项

# PsExec 部署勒索软件（两阶段）
PsExec.exe -d \\VICTIM -u "DOMAIN\ADMIN" -p "Password" -s cmd /c COPY "\\path\payload.exe" "C:\windows\temp"
PsExec.exe -d \\VICTIM -u "DOMAIN\ADMIN" -p "Password" -s cmd /c c:\windows\temp\payload.exe
```

#### 阶段四：数据渗出

```
数据渗出
├── 7zip 压缩关键数据
├── MegaSync 上传至 Mega 云存储
├── WinSCP 传输
├── 自定义 PowerShell 脚本
└── Rclone（部分案例）
```

#### 阶段五：加密勒索

```cmd
# 删除卷影副本
vssadmin.exe delete shadows /all /quiet

# 部署 Rhysida 加密器
# 清除事件日志
wevtutil cl Security
wevtutil cl System

# 投放 PDF 格式勒索信
```

---

## 六、受害者分析

### 6.1 目标行业

**重点目标**（按攻击频率排序）:

1. **教育部门** — 最高优先级目标，延续 Vice Society 传统
2. **医疗保健** — 17家医院+166家诊所（Prospect Medical），高价值 PHI 数据
3. **政府部门** — 哥伦布市、马里兰交通部、俄勒冈环境质量部
4. **制造业** — 工业生产系统
5. **信息技术** — 技术服务商
6. **军事/国防** — 智利军队
7. **物流** — 延续 Vice Society 目标
8. **娱乐/游戏** — Insomniac Games
9. **交通/基础设施** — 西雅图-塔科马国际机场

### 6.2 标志性攻击事件

| 时间 | 受害者 | 行业 | 影响 |
|------|--------|------|------|
| **2023.05** | 智利军队 | 军事/国防 | 军事数据泄露 |
| **2023.07** | Prospect Medical Holdings | 医疗 | 17家医院+166家诊所，美国 HHS 发布行业警报 |
| **2023.10** | 英国图书馆 | 文化/教育 | 2023年英国图书馆网络攻击事件 |
| **2023.10** | 英王爱德华七世医院 | 医疗 | 窃取员工和患者数据，含英国王室成员信息 |
| **2023.12** | Insomniac Games | 娱乐/游戏 | Marvel's Wolverine 游戏细节泄露，员工数据 |
| **2024.07** | 哥伦布市（俄亥俄州） | 政府 | 3TB 数据泄露，勒索30 BTC（170万美元） |
| **2024.08** | 西雅图-塔科马国际机场 | 交通/基础设施 | 机场系统遭攻击 |
| **2024.08** | Ranney School | 教育 | 学校数据泄露 |
| **2024.11** | Rutherford County Schools | 教育 | 学区数据泄露 |
| **2025.03** | Best Collateral | 金融 | 利用未修补漏洞 + Cobalt Strike |
| **2025** | 俄勒冈环境质量部 | 政府 | 130万文件泄露 |
| **2025** | Cookville 区域医疗中心 | 医疗 | 医疗数据泄露 |
| **2025** | 马里兰交通部 | 政府 | 网络攻击 |
| **2025.07** | Florida Hand Center | 医疗 | 医疗影像、保险表格、身份证件泄露 |

### 6.3 地域分布

| 地区 | 攻击占比 | 主要国家 |
|------|----------|----------|
| **北美** | 最高 | 美国（主要）、加拿大 |
| **欧洲** | 高 | 英国、智利（南美）、德国 |
| **亚太** | 中 | 澳大利亚、日本 |

### 6.4 受害者特征

- **"机会性目标"策略** — 不针对特定组织，而是攻击防御薄弱的任何目标
- **突破道德底线** — 主动攻击学校和医院，这在勒索软件生态中较为罕见
- **公共部门偏好** — 政府和教育机构通常安全预算不足，数据价值高
- **双重勒索** — 先窃取数据，再加密系统，以数据公开作为额外施压
- **快速发布期限** — 通常仅给7天期限，短于行业平均

---

## 七、运营模式与洗钱路径

### 7.1 RaaS 运营模式

```
┌─────────────────────────────────────────────────────────────┐
│  Rhysida RaaS 运营架构                                      │
│                                                             │
│  核心层: 加密器开发 + 基础设施管理 + 泄露站运营              │
│    ↓                                                        │
│  分发层: IAB（初始访问经纪人）                               │
│    ├── VPN 凭证销售                                         │
│    ├── 漏洞利用访问权                                       │
│    └── CleanUpLoader 分发网络                               │
│    ↓                                                        │
│  执行层: 附属成员（Affiliates）                              │
│    ├── 内网渗透 + 数据渗出                                  │
│    ├── 部署 Rhysida 加密器                                  │
│    └── 谈判与赎金收取                                       │
│    ↓                                                        │
│  利润层: 利润分成                                            │
│    └── 核心层与附属成员按比例分配赎金                        │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 赎金支付

| 属性 | 说明 |
|------|------|
| **支付方式** | 仅接受比特币（Bitcoin） |
| **谈判渠道** | 泄露网站提供的 .onion 链接 |
| **典型赎金** | 数十万至数百万美元（哥伦布市案例: 30 BTC ≈ 170万美元） |
| **发布期限** | 通常7天（快速施压） |

### 7.3 基础设施架构

| 层级 | 组件 | 说明 |
|------|------|------|
| **分发层** | Typosquatting 域名 | 仿冒合法软件下载站 |
| | SEO 投毒 | 搜索引擎排名操纵 |
| | Bing/Google 恶意广告 | 付费搜索广告分发 |
| **载荷层** | CleanUpLoader/OysterLoader | 伪装为 Teams/Chrome/PuTTY 安装器 |
| | Tomb 加密器 | 加密第二阶段载荷 |
| **C2层** | SystemBC | HTTPS 加密通信，多域名冗余 |
| | Cobalt Strike | 后渗透框架 |
| **渗出层** | Mega (MegaSync) | 云存储渗出 |
| | WinSCP | 文件传输 |

---

## 八、IOC 完整列表

### 8.1 文件指标

| 类型 | 指标 | 说明 |
|------|------|------|
| **加密扩展名** | `.rhysida` | 被加密文件的扩展名 |
| **勒索信** | PDF 格式文件 | 勒索说明（非传统 TXT） |
| **凭据存储目录** | `temp_l0gs` | NTDS.dit 转储存储目录 |
| **CleanUpLoader 路径** | `%APPDATA%` 下伪装安装器 | 假软件安装器 |
| **PsExec 部署路径** | `C:\windows\temp\payload.exe` | 勒索软件临时部署位置 |

### 8.2 网络指标

| 类型 | 指标 | 说明 |
|------|------|------|
| **C2 通信** | SystemBC HTTPS 连接 | 多 C2 域名冗余 |
| **数据渗出** | Mega (MegaSync) 上传 | 云存储渗出 |
| **恶意广告域名** | Typosquatting 域名 | 仿冒 Teams/PuTTY/Zoom 下载站 |
| **泄露网站** | .onion URL | Rhysida 数据泄露站 |

### 8.3 代码签名证书指标（2025年活动）

| 类型 | 指标 | 说明 |
|------|------|------|
| **证书颁发者** | Art en Code B.V. | 已确认关联的签名者 |
| **Microsoft Trusted Signing** | 72小时有效期证书 | 批量获取后被 Microsoft 撤销 |
| **证书数量** | 40+（2025年活动） | 相比2024年7个大幅增加 |
| **撤销数量** | 200+ | Microsoft 2025年9月批量撤销 |

### 8.4 行为指标

- 批量文件扩展名更改为 `.rhysida`
- `vssadmin.exe delete shadows /all /quiet` 调用
- `ntdsutil.exe` 异常调用，输出至 `temp_l0gs` 目录
- RDP 连接后日志和注册表项被清除
- PowerShell 远程会话（WinRM）异常使用
- AnyDesk/PuTTY/Advanced IP Scanner 异常安装
- MegaSync/WinSCP 大量数据上传
- 事件日志（Security、System）被清除
- 代码签名文件来自非预期发布者
- Bing 搜索结果中出现可疑软件下载链接

### 8.5 恶意软件哈希

| 恶意软件 | 说明 |
|----------|------|
| **CleanUpLoader/OysterLoader** | 参考 [Expel GitHub IOC](https://github.com/expel-io/expel-intel/blob/main/2025/10/Rhysida_malware_indicators-01.csv) |
| **Rhysida 加密器** | 参考 CISA AA23-319A STIX IOC |
| **SystemBC** | PowerShell 植入物变体 |
| **Tomb 加密样本** | 加密后的 Broomstick/Rhysida 载荷 |

---

## 九、检测规则

### 9.1 Sigma 规则

#### 规则一：检测 NTDS.dit 转储至 temp_l0gs 目录

```yaml
title: Rhysida NTDS.dit Dump to temp_l0gs Directory
id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
status: experimental
description: 检测 ntdsutil.exe 将 NTDS.dit 转储至 temp_l0gs 目录的行为
author: Threat Intelligence Report
date: 2026/06/24
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|endswith: '\ntdsutil.exe'
    CommandLine|contains:
      - 'temp_l0gs'
      - 'ifm'
      - 'create full'
  condition: selection
level: critical
tags:
  - attack.credential_access
  - attack.t1003.003
```

#### 规则二：检测 RDP 日志清除行为

```yaml
title: Rhysida RDP Log Cleanup
id: b2c3d4e5-f6a7-8901-bcde-f12345678901
status: experimental
description: 检测攻击者清除 RDP 连接日志和注册表项的行为
author: Threat Intelligence Report
date: 2026/06/24
logsource:
  category: process_creation
  product: windows
detection:
  selection_reg:
    CommandLine|contains:
      - 'HKCU\Software\Microsoft\Terminal Server Client'
      - 'reg delete'
    Image|endswith: '\reg.exe'
  selection_evt:
    Image|endswith: '\wevtutil.exe'
    CommandLine|contains:
      - 'cl Security'
      - 'cl System'
      - 'cl Microsoft-Windows-TerminalServices'
  condition: selection_reg or selection_evt
level: high
tags:
  - attack.defense_evasion
  - attack.t1070.001
```

#### 规则三：检测 PsExec 部署勒索软件

```yaml
title: Rhysida PsExec Ransomware Deployment
id: c3d4e5f6-a7b8-9012-cdef-123456789012
status: experimental
description: 检测通过 PsExec 将载荷复制到远程主机并执行的行为
author: Threat Intelligence Report
date: 2026/06/24
logsource:
  category: process_creation
  product: windows
detection:
  selection_copy:
    Image|endswith: '\PsExec.exe'
    CommandLine|contains:
      - 'COPY'
      - 'windows\temp'
  selection_exec:
    Image|endswith: '\PsExec.exe'
    CommandLine|contains:
      - 'c:\windows\temp'
      - '.exe'
  condition: selection_copy or selection_exec
level: high
tags:
  - attack.lateral_movement
  - attack.t1570
  - attack.execution
```

#### 规则四：检测 CleanUpLoader 伪装安装器

```yaml
title: CleanUpLoader OysterLoader Fake Installer
id: d4e5f6a7-b8c9-0123-defa-234567890123
status: experimental
description: 检测来自非预期路径的 Teams/PuTTY/Zoom 安装器行为
author: Threat Intelligence Report
date: 2026/06/24
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|contains:
      - 'Teams'
      - 'PuTTY'
      - 'Zoom'
    Image|contains|all:
      - 'AppData'
  filter_legitimate:
    Image|contains:
      - 'Program Files'
      - 'Program Files (x86)'
      - 'WindowsApps'
  condition: selection and not filter_legitimate
level: high
tags:
  - attack.execution
  - attack.t1204.002
  - attack.defense_evasion
  - attack.t1036
```

### 9.2 YARA 规则

#### Rhysida 加密器检测

```yara
rule Rhysida_Ransomware {
    meta:
        description = "检测 Rhysida 勒索软件加密器"
        author = "Threat Intelligence Report"
        date = "2026-06-24"
        reference = "CISA AA23-319A"
    strings:
        $s1 = ".rhysida" ascii
        $s2 = "ChaCha" ascii
        $s3 = "RSA" ascii
        $s4 = "vssadmin" ascii
        $s5 = "delete shadows" ascii
        $s6 = "readme" ascii wide
        $m1 = { 4D 5A 90 00 03 00 00 00 }
    condition:
        $m1 at 0 and
        3 of ($s*)
}
```

#### CleanUpLoader/OysterLoader 检测

```yara
rule CleanUpLoader_OysterLoader {
    meta:
        description = "检测 CleanUpLoader/OysterLoader 后门"
        author = "Threat Intelligence Report"
        date = "2026-06-24"
        reference = "Expel Research, Recorded Future Insikt Group"
    strings:
        $s1 = "cleanup" ascii
        $s2 = "oyster" ascii
        $s3 = "broomstick" ascii
        $c2_1 = "https://" ascii
        $c2_2 = ".onion" ascii
        $mutex = "Global\\CleanupLoader" ascii
    condition:
        2 of ($s*) or
        ($c2_1 and $c2_2) or
        $mutex
}
```

---

## 十、风险评估矩阵

### 10.1 综合威胁评估

| 评估维度 | 评分 | 等级 | 说明 |
|----------|------|------|------|
| **技术能力** | 8/10 | 🟠 高 | 多平台加密、CleanUpLoader、Tomb 加密器、代码签名滥用 |
| **运营成熟度** | 7/10 | 🟠 高 | RaaS 平台、多层基础设施、恶意广告分发网络 |
| **攻击规模** | 6/10 | 🟠 高 | 200+ 受害者，全球影响 |
| **目标危险性** | 9/10 | 🔴 极高 | 攻击学校、医院、军事机构，无道德底线 |
| **逃避能力** | 8/10 | 🟠 高 | Tomb 加密器、代码签名、打包器、日志清除 |
| **财务动机** | 8/10 | 🟠 高 | 双重勒索、比特币支付、快速发布期限 |
| **综合威胁等级** | **7.7/10** | **🟠 高** | |

### 10.2 风险因素

| 风险因素 | 评估 |
|----------|------|
| **攻击频率** | 持续上升，2025年活动显著增加 |
| **初始访问多样化** | 从传统 VPN 利用扩展到恶意广告、代码签名滥用 |
| **工具演化** | CleanUpLoader → OysterLoader → Tomb 加密器持续迭代 |
| **生态关联** | 与 Interlock 共享工具和开发者，形成协同威胁 |
| **解密可能性** | 无公开解密器，受害者面临永久数据损失 |
| **执法状态** | 尚无重大执法打击，组织运营未受干扰 |

---

## 十一、缓解建议

### 11.1 预防建议

**基础安全措施**:
1. 对所有 VPN、RDP、远程服务强制实施钓鱼-resistant MFA
2. 及时修补已知漏洞（特别是 CVE-2023-34048 VMware Aria、CVE-2020-1472 ZeroLogon）
3. 实施网络分段，防止勒索软件横向传播
4. 限制 PowerShell 使用，启用脚本块日志记录
5. 禁用不必要的命令行和脚本活动

**针对 Rhysida 的专项防御**:
1. **监控 CleanUpLoader/OysterLoader IOC** — 检测伪装为 Teams/PuTTY/Zoom 的安装器
2. **验证代码签名证书** — 检查签名者是否为预期发布者，不盲目信任签名文件
3. **监控 `temp_l0gs` 目录** — 这是 Rhysida 的标志性特征
4. **检测 RDP 日志清除行为** — 攻击者会清除 RDP 连接痕迹
5. **监控 MegaSync/WinSCP 异常上传** — 数据渗出阶段的标志性行为
6. **防范恶意广告** — 培训员工仅从官方渠道下载软件
7. **保护域控制器** — 防范 ZeroLogon、NTDS.dit 提取
8. **监控 Bing/Google 搜索结果** — 检测 SEO 投毒的伪造下载页面
9. **部署 EDR 行为检测** — 关注批量文件扩展名更改行为
10. **监控 Tomb 加密器特征** — 检测加密的载荷投递

### 11.2 应急响应

**检测到 Rhysida 攻击时的步骤**:

1. **立即隔离**: 断网受感染系统，防止横向移动
2. **不要支付赎金**: 支付不保证解密，且可能招致更多攻击
3. **报告执法**: 联系 CISA（AA23-319A）、FBI IC3
4. **取证调查**:
   - 检查 `temp_l0gs` 目录（NTDS.dit 转储标志）
   - 审查 RDP 日志缺失情况
   - 分析 CleanUpLoader/OysterLoader IOC
   - 检查代码签名证书有效性
   - 分析 MegaSync/WinSCP 传输日志
5. **恢复**:
   - 从干净备份恢复（注意：无公开解密器）
   - 重置所有可能泄露的凭证
   - 全面密码轮换
   - 强制所有 VPN/远程服务启用 MFA

### 11.3 SIEM 检测规则建议

```
# 检测 ntdsutil 转储至 temp_l0gs
ProcessCreation where process.name="ntdsutil.exe" and process.command_line contains "temp_l0gs"

# 检测 vssadmin 删除卷影副本
ProcessCreation where process.name="vssadmin.exe" and process.command_line contains "delete shadows"

# 检测 RDP 注册表清除
ProcessCreation where process.name="reg.exe" and process.command_line contains "Terminal Server Client" and process.command_line contains "delete"

# 检测事件日志清除
ProcessCreation where process.name="wevtutil.exe" and process.command_line contains "cl"

# 检测非预期路径的 Teams/PuTTY/Zoom 安装器
ProcessCreation where process.name contains "Teams" or process.name contains "PuTTY" or process.name contains "Zoom" and not process.path contains "Program Files"

# 检测 MegaSync 异常上传
ProcessCreation where process.name="MegaSync.exe" and process.command_line contains "put" or process.command_line contains "sync"

# 检测 PsExec 远程部署
ProcessCreation where process.name="PsExec.exe" and process.command_line contains "windows\temp"
```

---

## 十二、核心建议

### 12.1 即时行动（24小时内）

| 优先级 | 行动 | 说明 |
|--------|------|------|
| **P0** | 强制所有远程访问启用 MFA | Rhysida 最常见入口为无 MFA 的 VPN |
| **P0** | 修补 CVE-2020-1472（ZeroLogon） | 标志性漏洞利用 |
| **P0** | 修补 CVE-2023-34048（VMware Aria） | 已知 Rhysida 利用漏洞 |
| **P1** | 更新 SIEM 检测规则 | 部署上述 Sigma/YARA 规则 |
| **P1** | 审查代码签名信任策略 | 实施证书固定（Certificate Pinning） |

### 12.2 短期行动（1周内）

| 优先级 | 行动 | 说明 |
|--------|------|------|
| **P1** | 网络分段审计 | 防止勒索软件横向传播 |
| **P1** | 备份恢复测试 | 确保干净备份可用（无公开解密器） |
| **P2** | 员工培训 | 恶意广告识别，仅从官方渠道下载软件 |
| **P2** | 监控 `temp_l0gs` 目录 | Rhysida 标志性 IOC |

### 12.3 长期行动（1个月内）

| 优先级 | 行动 | 说明 |
|--------|------|------|
| **P2** | 部署 EDR 行为检测 | 关注批量文件扩展名更改、日志清除 |
| **P2** | 实施零信任架构 | 减少攻击面 |
| **P3** | 威胁情报订阅 | 持续监控 Rhysida/Interlock 生态动态 |
| **P3** | 红队演练 | 模拟 Rhysida TTPs 攻击场景 |

---

## 十三、附录

### 附录 A：Rhysida vs 关联组织对比

| 特征 | Rhysida | Vice Society | Interlock |
|------|---------|--------------|-----------|
| **首次出现** | 2023年5月 | 2021年夏季 | 2024年9月 |
| **运营模式** | RaaS | 商品化载荷 | 非 RaaS（自主运营） |
| **加密算法** | ChaCha20+RSA-4096 | 多种（Vice Society等） | 自定义加密器 |
| **文件扩展名** | .rhysida | 多种 | .interlock |
| **核心工具** | CleanUpLoader、SystemBC | PortStarter、SystemBC | NodeSnake、Supper |
| **共享工具** | Supper、Tomb | — | Supper、Tomb |
| **首要目标** | 教育/医疗/政府 | 教育/医疗 | 多行业 |
| **初始访问** | VPN+恶意广告 | VPN | IAB+漏洞利用 |
| **解密器** | 无 | 无 | 无 |
| **活跃状态** | 活跃 | 不活跃（2023.05后） | 活跃 |

### 附录 B：漏洞利用汇总

| 漏洞名称 | CVE ID | CVSS | 用途 |
|---------|--------|------|------|
| ZeroLogon | CVE-2020-1472 | 10.0 | 域控权限提升 |
| VMware Aria Operations | CVE-2023-34048 | 9.8 | 初始访问 |

### 附录 C：参考资源

**官方通告**:
- [CISA AA23-319A — #StopRansomware: Rhysida Ransomware（2025年4月更新）](https://www.cisa.gov/news-events/cybersecurity-advisories/aa23-319a)
- [CISA STIX IOC Download（2025年4月）](https://www.cisa.gov/sites/default/files/2025-04/AA23-319A-StopRansomware-Rhysida-Ransomware-APR2025.stix_.xml.xml)
- [HHS Rhysida 行业警报](https://www.hhs.gov/sites/default/files/rhysida-ransomware-sector-alert-tlpclear.pdf)

**情报研究报告**:
- [Check Point — The Rhysida Ransomware: Activity Analysis and Ties to Vice Society](https://research.checkpoint.com/2023/the-rhysida-ransomware-activity-analysis-and-ties-to-vice-society/)
- [Sophos — Same threats, different ransomware (Vice Society → Rhysida)](https://www.sophos.com/en-us/blog/vice-society-and-rhysida-ransomware)
- [Recorded Future — Outmaneuvering Rhysida: Advanced Threat Intelligence](https://www.recordedfuture.com/research/outmaneuvering-rhysida-advanced-threat-intelligence-shields-critical-infrastructure-ransomware)
- [IBM X-Force — Interlock and Rhysida within the Ransomware Ecosystem](https://www.ibm.com/think/x-force/interlock-and-rhysida-within-the-ransonware-ecosystem)
- [Expel — Certified: OysterLoader — Tracking Rhysida via Code Signing Certificates](https://expel.com/blog/certified-oysterloader-tracking-rhysida-ransomware-gang-activity-via-code-signing-certificates/)
- [Fortinet — Ransomware Roundup: Rhysida](https://www.fortinet.com/blog/threat-research/ransomware-roundup-rhysida)
- [SentinelOne — Rhysida Ransomware RaaS Crawls Out](https://www.sentinelone.com/blog/rhysida-ransomware-raas-crawls-out-of-crimeware-undergrowth-to-attack-chilean-army/)
- [Cisco Talos — Emerging Interlock Ransomware](https://blog.talosintelligence.com/emerging-interlock-ransomware/)

**IOC 资源**:
- [Expel GitHub — Rhysida Malware Indicators](https://github.com/expel-io/expel-intel/blob/main/2025/10/Rhysida_malware_indicators-01.csv)
- [CISA AA23-319A STIX JSON](https://www.cisa.gov/sites/default/files/2025-04/AA23-319A-StopRansomware-Rhysida-Ransomware-APR2025.stix_.json)

**受害者追踪**:
- [Ransomware.live — Rhysida](https://www.ransomware.live/)

---

**报告编制日期**: 2026年6月24日
**威胁状态**: Rhysida 持续活跃，2025年活动显著增加，恶意广告和代码签名滥用成为主要初始访问手段
**建议**: 持续监控 Rhysida/Interlock 生态动态，重点关注 CleanUpLoader/OysterLoader 恶意广告活动和 Tomb 加密器演化
