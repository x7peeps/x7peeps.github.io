---
title: "Akira"
weight: 5
---

**报告编号**: TIR-2026-0621-005 | **分类等级**: TLP:AMBER | **发布日期**: 2026年6月21日 | **情报来源**: 多源交叉验证（OSINT + 执法通报 + 厂商报告）

---

## 一、执行摘要

**Akira** 是近年来崛起最快的勒索软件即服务（RaaS）组织之一，于2023年3月首次被发现。该组织被认为与已解散的 **Conti** 勒索组织有密切联系，其名称源自1988年日本动画电影《阿基拉》。截至2026年6月，Akira 已攻击超过 **1,400 个组织**，累计勒索金额约 **2.44-2.45 亿美元**，成为全球最活跃、获利最高的勒索软件组织之一。

<!--more-->

### 关键发现

| 维度 | 关键指标 |
|------|----------|
| **组织规模** | 1,400+ 受害者，2.44亿美元+勒索金额 |
| **攻击速度** | 从初始入侵到完全加密最短仅需 **1小时**，通常不超过4小时 |
| **加密强度** | ChaCha20 + RSA-4096，**无公开解密工具** |
| **首要入口** | VPN 漏洞利用（Cisco ASA/AnyConnect、SonicWall、Fortinet） |
| **商业模式** | RaaS，20万美元-数百万美元赎金 |
| **加密器变体** | Akira（C++）、Akira_v2（Rust）、Megazord（Rust） |
| **多平台支持** | Windows、Linux、VMware ESXi、Hyper-V、Nutanix AHV |
| **洗钱策略** | 四阶段演化，与 Fog/Frag 共享基础设施 |
| **解密可能性** | **不存在**（截至2026年6月无公开解密工具） |

### 威胁等级评估

| 评估维度 | 等级 | 说明 |
|----------|------|------|
| **技术能力** | 🔴 极高 | 多平台加密、可靠解密工具开发、四阶段洗钱演化 |
| **运营成熟度** | 🔴 极高 | 完整 RaaS 平台、专业谈判团队、复古暗网泄露站 |
| **攻击规模** | 🔴 极高 | 1,400+ 受害者，2.44亿美元+收入，全球影响 |
| **目标针对性** | 🔴 高 | 中小企业为主，也影响大型组织和关键基础设施 |
| **数据泄露风险** | 🔴 极高 | 双勒索模式 + 泄露网站公开羞辱 |

---

## 二、威胁行为者画像

### 2.1 组织标识

| 属性 | 值 |
|------|-----|
| **官方名称** | Akira |
| **别名** | Storm-1567、Howling Scorpius、Punk Spider、Gold Sahara |
| **组织类型** | 勒索软件即服务（RaaS） |
| **活跃周期** | 2023年3月 → 至今 |
| **主要语言** | 英语（泄露站）、俄语（内部沟通，推断） |
| **地理归属** | 俄罗斯/前苏联地区（高置信度） |
| **攻击目标** | 全球企业（中小企业为主，也影响大型组织） |
| **动机** | 经济利益 |

### 2.2 组织演化时间线

```
2023.03    Akira 首次被发现
           被认为是 Conti 重组/分支
           使用 C++ 编写原始加密器
    ↓
2023.06    新增 Linux 平台支持
           加密器支持 Windows + Linux
    ↓
2023.08    Akira_v2 发布（Rust 重写）
           Megazord 变体发布（.powerranges 扩展名）
           泄露站采用复古"80年代绿色屏幕控制台"风格
    ↓
2023.10    攻击斯坦福大学，27,000人个人信息泄露
           数据站声称窃取430GB
    ↓
2023.12    攻击日产澳洲，100,000人数据泄露
    ↓
2024.01    攻击 Tietoevry（瑞典数据中心）
           影响 Primula、Filmstaden 等多家企业
    ↓
2024.06    Shook Lin & Bok 支付140万美元比特币赎金
    ↓
2024       洗钱策略 Phase II（WanChain 混币器）
           攻击速度进一步提升，最短1小时完成加密
    ↓
2025       洗钱策略 Phase III（Defiway 桥接路由）
           与 Fog 勒索软件共用基础设施
    ↓
2025.06    首次扩展支持 Nutanix AHV 平台
    ↓
2026       累计勒索金额达2.44亿美元
           持续快速扩张
```

### 2.3 关联团伙

| 代号 | 说明 |
|------|------|
| **Storm-1567** | 关联 Affiliate 团伙 |
| **Howling Scorpius** | 关联 Affiliate 团伙 |
| **Punk Spider** | 关联 Affiliate 团伙 |
| **Gold Sahara** | 关联 Affiliate 团伙 |
| **Fog** | 共用洗钱基础设施 |
| **Frag** | 可能是 Akira 的分支/延伸 |

### 2.4 附属成员体系

| 指标 | 数据 |
|------|------|
| **分成比例** | 未公开（推测 80-90%/10-20%） |
| **沟通渠道** | Telegram、Tox、RustDesk |
| **准入门槛** | 需提交攻击演示 |
| **专业分工** | 基础设施管理、初始访问、恶意软件和 C2 混淆、开发、谈判/客服 |

---

## 三、归因分析

### 3.1 归属评估

| 字段 | 信息 | 置信度 |
|------|------|--------|
| **语言归属** | 英语（泄露站）、俄语（内部沟通，推断） | 中 |
| **地理归属** | 俄罗斯/前苏联地区（推断） | 中高 |
| **Conti 关联** | 区块链分析和源代码比对显示代码相似性和共用钱包地址 | 高 |
| **Conti 旧部** | 2022年5月 Conti 解散后，部分成员参与 Akira 创建 | 确认 |

### 3.2 执法状态

**⚠️ 重要提示**：截至2026年6月：

- ❌ **无正式国家级归因声明**
- ❌ **无国际刑警组织红色通缉令**
- ❌ **无欧盟"最通缉犯"名单**
- ✅ **CISA 发布警报**（AA24-109A）
- ✅ **IC3 联合警报**（2025年11月）

### 3.3 地缘政治因素

| 因素 | 评估 |
|------|------|
| **俄方态度** | 仅追诉底层协助者，高级运营者免于追诉 |
| **执法壁垒** | 俄罗斯不配合西方执法请求 |
| **运营模式** | 去中心化，附属网络分散，难以彻底瓦解 |

---

## 四、技术能力评估

### 4.1 恶意软件演变

| 阶段 | 时间 | 语言 | 特征 |
|------|------|------|------|
| **Akira（原始版）** | 2023年3月 | C++ | 最初版本，Windows 平台 |
| **Akira_v2** | 2023年8月 | Rust | 改进版，针对性更强 |
| **Megazord** | 2023年8月 | Rust | `.powerranges` 扩展名，2024年后逐渐弃用 |

### 4.2 加密机制分析

#### 4.2.1 加密算法

| 组件 | 算法 | 说明 |
|------|------|------|
| **对称加密** | ChaCha20 | 流加密，速度快 |
| **非对称加密** | RSA-4096 | 加密 ChaCha20 密钥 |
| **密钥策略** | CryptGenRandom | Windows API 生成随机数 |
| **文件扩展名** | `.akira`、`.powerranges` | 版本标识 |

#### 4.2.2 加密流程

```
┌─────────────────────────────────────────────────────────────┐
│  1. 使用 CryptGenRandom 生成对称密钥                        │
│  2. 使用 ChaCha20 加密文件内容                              │
│  3. 生成 RSA-4096 密钥对                                    │
│  4. 使用 RSA 公钥加密 ChaCha20 密钥                         │
│  5. 将加密后的 ChaCha20 密钥追加到文件尾部                  │
│  6. 重命名文件（添加 .akira 扩展名）                        │
│  7. 删除原始文件                                            │
│  8. 投放勒索信                                              │
│  9. 上传密钥至 C2 服务器                                    │
└─────────────────────────────────────────────────────────────┘
```

#### 4.2.3 特殊能力

| 能力 | 说明 |
|------|------|
| **可靠解密工具** | 与传统勒索软件不同，Akira 投入大量资源开发可靠的解密工具，以提高受害者支付意愿 |
| **多平台支持** | Windows、Linux、VMware ESXi、Hyper-V、Nutanix AHV |
| **快速加密** | 从初始入侵到完全加密最短仅需1小时，通常不超过4小时 |

### 4.3 核心能力

| 能力 | 说明 |
|------|------|
| **LSASS 内存转储** | `rundll32.exe comsvcs.dll MiniDump` |
| **NTDS.dit 提取** | `ntdsutil`、自定义 `Cl.exe` |
| **Veeam 凭据转储** | Veeam Credential Dumper 脚本 |
| **浏览器凭据窃取** | `esentutl.exe` 提取 Chrome Login Data |
| **SSH 隧道** | 通过路由器/IP地址隧道 |
| **商业远程工具** | AnyDesk、ScreenConnect、RustDesk |

### 4.4 C2 架构

| 工具 | 类型 | 说明 |
|------|------|------|
| **RustDesk** | 远程桌面 | 被滥用为 C2 |
| **AnyDesk** | 远程支持 | 合法工具滥用 |
| **ScreenConnect** | 远程管理 | 合法工具滥用 |
| **SFTP** | 数据外传 | 加密通道 |
| **SSH 隧道** | 数据传输 | 隐蔽通信 |

### 4.5 多平台支持

| 平台 | 语言 | 说明 |
|------|------|------|
| Windows | C++/Rust | 主平台 |
| Linux | Rust | 支持 |
| VMware ESXi | Rust | 虚拟化平台 |
| Hyper-V | Rust | 微软虚拟化 |
| Nutanix AHV | Rust | 2025年6月新增 |

---

## 五、攻击链分析

### 5.1 MITRE ATT&CK 映射

| 阶段 | 技术 | 说明 |
|------|------|------|
| **初始访问** | T1190 | 利用公开应用漏洞（Cisco ASA、SonicWall、Fortinet） |
| | T1078 | 有效账户（暗网购买凭证） |
| | T1566 | 钓鱼邮件（较少使用） |
| | T1110 | RDP 暴力破解 |
| **执行** | T1059 | PowerShell、命令行 |
| **持久化** | T1547 | 注册表启动项（隐藏管理员账户） |
| | T1136 | 域账户创建（backup_DA、backup_EA） |
| **权限提升** | T1068 | 漏洞利用 |
| | T1134 | 令牌操纵 |
| **防御规避** | T1562 | 禁用安全软件（Sophos、CrowdStrike） |
| | T1070 | 清除日志、删除卷影副本 |
| | T1027 | 混淆文件 |
| | T1055 | 进程注入 |
| **凭证访问** | T1003.001 | LSASS 内存转储（comsvcs.dll MiniDump） |
| | T1003.002 | Active Directory 数据库复制（DCSync） |
| | T1003.003 | NTDS.dit 提取 |
| | T1552.005 | Veeam 凭据转储 |
| | T1555.003 | 浏览器凭据窃取 |
| **发现** | T1057 | 进程发现 |
| | T1012 | 注册表发现 |
| | T1082 | 系统信息发现 |
| **横向移动** | T1021.001 | 远程桌面协议（RDP） |
| | T1021.002 | SMB/Windows 管理共享 |
| | T1021.004 | SSH 隧道 |
| | T1570 | 横向工具传输（PsExec、WMI） |
| **收集** | T1005 | 本地系统数据 |
| | T1039 | 共享网络驱动器数据 |
| **渗出** | T1048 | 替代协议外传（SFTP、SSH） |
| **影响** | T1486 | 数据加密勒索 |
| | T1490 | 删除备份/影子副本 |
| | T1489 | 服务停止 |
| | T1491 | 勒索信（akira_readme.txt） |

### 5.2 完整攻击链还原

#### 阶段一：初始入侵

```
┌─────────────────────────────────────────────────────────────┐
│  入侵路径 A（最常见）: VPN 漏洞利用                         │
│  ────────────────────────────                               │
│  1. 扫描公网暴露的 VPN 设备（Cisco ASA、SonicWall、Fortinet）│
│  2. 利用 CVE-2023-20269（Cisco ASA 认证绕过）              │
│  3. 利用 CVE-2024-40766（SonicWall 不当访问控制）          │
│  4. 获取 VPN 访问权限                                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  入侵路径 B: 有效凭证入侵                                    │
│  ────────────────────                                       │
│  1. 从暗网购买有效 VPN 凭证                                 │
│  2. 或利用缺少 MFA 的 VPN 账号                              │
│  3. 登录 VPN                                                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  入侵路径 C: 钓鱼/SEO 投毒                                   │
│  ───────────────────────                                    │
│  1. 发送钓鱼邮件                                            │
│  2. 或通过 Bing/Google SEO 投毒，诱导下载 Bumblebee         │
│  3. 部署初始访问代理                                        │
└─────────────────────────────────────────────────────────────┘
```

#### 阶段二：内网侦察与权限提升

```
内网侦察
├── LSASS 内存转储（comsvcs.dll MiniDump）
├── NTDS.dit 提取（ntdsutil、自定义 Cl.exe）
├── Veeam 凭据转储（SQL 查询）
├── 浏览器凭据窃取（esentutl.exe）
└── 域信任发现

权限提升
├── 创建隐藏的管理员账户（修改注册表）
├── 创建域账户（backup_DA、backup_EA）加入 Enterprise Administrators
├── 安装 RustDesk 等远程访问工具
├── SSH 反向隧道
└── DCSync（如已获取域管权限）
```

#### 阶段三：防御规避与数据窃取

```
防御规避
├── 卸载/禁用安全软件（Sophos、CrowdStrike 等 EDR）
├── 在虚拟机断电时删除安全服务
├── 修改 Windows 注册表隐藏新建账户
├── 使用系统自带工具（Living-off-the-Land）
└── 禁用卷影副本（Get-WmiObject Win32_Shadowcopy）

数据窃取
├── SFTP 客户端外传数据
├── SSH 隧道传输
├── 商业工具或自建 C2
└── 优先: 人事数据、财务数据、客户数据、IP
```

#### 阶段四：全网加密

```
加密部署
├── 横向移动：RDP、SMB（PsExec）、WMI、WinRM
├── SSH 隧道
├── 商业远程工具（AnyDesk、ScreenConnect、RustDesk）
└── 批量扫描共享文件夹

加密执行
├── 终止目标进程（数据库、备份、虚拟化、EDR）
├── 删除卷影副本
├── 加密文件（ChaCha20 + RSA-4096）
├── 重命名文件（添加 .akira 扩展名）
├── 投放勒索信（akira_readme.txt）
├── 上传密钥至 C2 服务器
└── 通过谈判门户联系受害者
```

### 5.3 关键漏洞利用

| CVE | CVSS | 影响组件 | 利用方式 |
|-----|------|----------|----------|
| **CVE-2023-20269** | 9.8 | Cisco ASA/FTD | 认证绕过（零日利用） |
| CVE-2020-3259 | 8.6 | Cisco AnyConnect | 敏感信息泄露 |
| CVE-2024-40766 | 9.8 | SonicWall | 不当访问控制 |
| CVE-2023-27532 | 9.8 | Veeam Backup | 缺少身份验证 |
| CVE-2024-40711 | 9.8 | Veeam Backup | 不受信任数据反序列化 |
| CVE-2020-3580 | 6.1 | Cisco ASA | XSS 漏洞 |
| CVE-2023-28252 | 9.8 | Cisco ASA | 堆缓冲区溢出 |
| CVE-2024-37085 | 9.8 | Cisco ASA | 认证绕过 |

---

## 六、受害者分析

### 6.1 规模统计

| 来源 | 受害者数 | 截止日期 | 说明 |
|------|----------|----------|------|
| Akira DLS | 980+ | 2026.06 | 泄露站公布 |
| 区块链追踪 | 2.44亿美元 | 2025.09 | 勒索金额 |
| 行业报告 | 1,400+ | 2026.06 | 累计受害者 |

### 6.2 行业分布

```
制造业          ████████████████████████████████████████ 高优先级
教育            ████████████████████████████████           高优先级
信息技术        ██████████████████████████████             高优先级
医疗健康        ████████████████████████████               高优先级
金融服务        ██████████████████████████                 高优先级
食品农业        ████████████████████████                   中优先级
零售            ████████████████████                       中优先级
政府            ██████████████████                         中优先级
其他            ████████████████████████████████████████   广泛
```

### 6.3 地理分布

| 区域 | 占比 | 主要国家 |
|------|------|----------|
| 北美（美国、加拿大） | ~45% | 美国为主要目标 |
| 欧洲 | ~25% | 英国、德国、瑞典 |
| 亚太 | ~15% | 澳大利亚、日本 |
| 拉美 | ~10% | 巴西 |
| 其他地区 | ~5% | 全球影响 |

### 6.4 知名受害者案例

| 受害者 | 行业 | 国家 | 影响 |
|--------|------|------|------|
| **斯坦福大学** | 教育 | 美国 | 27,000人个人信息泄露，数据站声称窃取430GB |
| **日产澳洲**（Nissan Oceania） | 汽车 | 澳大利亚 | 100,000人数据泄露 |
| **Tietoevry** | 云服务/IT | 瑞典 | 数据中心被攻陷，影响 Primula、Filmstaden 等 |
| **Shook Lin & Bok** | 法律 | 香港 | 支付140万美元比特币赎金 |
| **BHI Energy** | 能源 | 美国 | 美国能源公司 |
| **多伦多动物园** | 公共服务 | 加拿大 | 声称负责（动物园未确认） |

### 6.5 受害者特征画像

```
高概率受害特征:
├── 使用 Cisco ASA/AnyConnect、SonicWall、Fortinet 等未修补漏洞的设备
├── 公网暴露 VPN 端口
├── 弱口令或凭证泄露（暗网可购买）
├── 无 MFA 或 MFA 配置不当
├── 依赖 Active Directory 且未加固
├── 无 EDR 或 EDR 配置不当
├── 制造业、教育、信息技术、医疗、金融等行业
├── 北美、欧洲、亚太地区企业
└── 中小企业至大型企业全覆盖
```

---

## 七、加密货币洗钱路径演变

### 7.1 四阶段洗钱策略

| 阶段 | 时间 | 方式 |
|------|------|------|
| **Phase I** | 2023 | 按关联 Affiliate 分组，中间地址复用，钱包集群接收多笔赎金 |
| **Phase II** | 2024上半年 | 通过 **WanChain** 混币器集中清洗，分散到全球 VASP 取现 |
| **Phase III** | 2024下半年 | 通过 **Defiway** 桥接路由，与 Fog 勒索软件共用基础设施 |
| **Phase IV** | 2025 | 继续演化新的洗钱方式 |

### 7.2 关联钱包

| 关联组织 | 说明 |
|----------|------|
| **Fog** | 共用洗钱基础设施 |
| **Frag** | 可能是 Akira 的分支/延伸，共享 Affiliate |

---

## 八、基础设施分析

### 8.1 已知基础设施

| 类型 | 值 | 说明 | 状态 |
|------|-----|------|------|
| **Tor DLS** | 泄露网站 | 数据泄露站（复古"80年代绿色屏幕控制台"风格） | 活跃 |
| **谈判门户** | 密码保护 | 需要勒索信中提供的密码访问 | 活跃 |
| **RustDesk** | 远程桌面 | C2 基础设施 | 活跃 |
| **SFTP** | 文件传输 | 数据外传 | 活跃 |

### 8.2 基础设施特征

```
基础设施策略:
├── Tor 隐藏服务（DLS）
├── 复古风格泄露站（80年代绿色屏幕控制台）
├── 密码保护谈判门户
├── RustDesk（远程管理）
├── SFTP（数据外传）
└── 定期迁移基础设施
```

---

## 九、IOC 完整列表

### 9.1 文件特征

| 特征 | 值 |
|------|-----|
| 加密扩展名 | `.akira`、`.powerranges` |
| 勒索信文件名 | `akira_readme.txt` |
| 日志文件名 | `Log-<DD>-<MM>-YYYY-<HH>-<mm>-<ss>.txt` |
| 木马伪装 | `C:\ProgramData\Microsoft\crome.exe` |

### 9.2 命令特征

| 行为 | 命令 |
|------|------|
| 删除卷影副本 | `powershell.exe -Command "Get-WmiObject Win32_Shadowcopy \| Remove-WmiObject"` |
| 系统时间探测 | `powershell.exe -c "$(Get-Date).ToString('dd-MM-yyyy')"` |
| 驱动器枚举 | `fsutil fsinfo drives` |
| LSASS 转储 | `rundll32.exe comsvcs.dll MiniDump` |
| Veeam 凭据提取 | `sqlcmd.exe -S localhost,60261 -E -y0 -Q "SELECT user_name,password FROM Credentials"` |
| NTDSUtil 离线快照 | `ntdsutil "ac i ntds" "ifm" "create full c:\Programdata\temp\Crashpad\Temp\abc" q q` |

### 9.3 行为指标

| 行为 | 说明 |
|------|------|
| 大量文件快速重命名 | 添加 `.akira` 或 `.powerranges` 扩展名 |
| vssadmin.exe 异常调用 | `vssadmin delete shadows /all /quiet` |
| wbadmin.exe 被终止 | 阻止备份恢复 |
| 多个服务被停止 | 终止安全软件、备份服务 |
| 异常 HTTP POST 请求 | C2 通信 |
| SSH 隧道创建 | 反向 SSH 连接 |

---

## 十、检测规则

### 10.1 Sigma 规则

```yaml
title: Akira Ransomware - Shadow Copy Deletion
id: akira-shadow-copy-deletion
status: experimental
description: 检测 Akira 勒索软件删除影子副本的行为
author: Threat Intelligence Team
date: 2026/06/21
logsource:
    category: process_creation
    product: windows
detection:
    selection:
        CommandLine|contains|all:
            - 'Get-WmiObject'
            - 'Win32_Shadowcopy'
            - 'Remove-WmiObject'
    condition: selection
level: critical
```

```yaml
title: Akira Ransomware - LSASS Memory Dump
id: akira-lsass-dump
status: experimental
description: 检测异常的 LSASS 内存转储行为
author: Threat Intelligence Team
date: 2026/06/21
logsource:
    category: process_creation
    product: windows
detection:
    selection:
        Image|endswith: '\rundll32.exe'
        CommandLine|contains|all:
            - 'comsvcs.dll'
            - 'MiniDump'
    condition: selection
level: high
```

```yaml
title: Akira Ransomware - Veeam Credential Extraction
id: akira-veeam-credentials
status: experimental
description: 检测 Veeam 凭据提取行为
author: Threat Intelligence Team
date: 2026/06/21
logsource:
    category: process_creation
    product: windows
detection:
    selection:
        Image|endswith: '\sqlcmd.exe'
        CommandLine|contains: 'Credentials'
    condition: selection
level: high
```

### 10.2 YARA 规则

```yara
rule Akira_Ransomware {
    meta:
        description = "Detects Akira ransomware samples"
        author = "Threat Intelligence Team"
        date = "2026-06-21"
    
    strings:
        $akira = ".akira" ascii
        $powerranges = ".powerranges" ascii
        $readme = "akira_readme.txt" ascii
        $vssadmin = "Get-WmiObject Win32_Shadowcopy" ascii
        $comsvcs = "comsvcs.dll MiniDump" ascii
        
    condition:
        any of them
}
```

---

## 十一、风险评估矩阵

### 11.1 威胁能力评估

| 能力维度 | 评分（1-5） | 说明 |
|----------|-------------|------|
| **技术复杂度** | 5 | 多平台加密、可靠解密工具、四阶段洗钱演化 |
| **运营成熟度** | 5 | 完整 RaaS 平台、复古泄露站、专业谈判 |
| **资源水平** | 5 | 1,400+ 受害者，2.44亿美元+收入 |
| **攻击速度** | 5 | 最短1小时完成全网加密 |
| **隐蔽性** | 4 | Living-off-the-Land、SSH 隧道 |
| **适应性** | 5 | 持续演化洗钱策略、快速扩展平台支持 |
| **总体威胁等级** | 🔴 极高 | 4.8/5 |

### 11.2 受害者风险评估

| 风险因素 | 概率 | 影响 | 风险等级 |
|----------|------|------|----------|
| 数据永久丢失 | 极高 | 极高 | 🔴 极高 |
| 数据公开泄露 | 高 | 极高 | 🔴 极高 |
| 业务中断 | 极高 | 极高 | 🔴 极高 |
| 合规处罚 | 高 | 高 | 🔴 高 |
| 员工诉讼 | 高 | 高 | 🔴 高 |
| 舆情危机 | 高 | 高 | 🔴 高 |

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
| P1 | **漏洞管理强化** | 72小时内修补高危漏洞（62个CVE） |
| P1 | **EDR 全覆盖** | 所有端点部署 EDR，启用防篡改 |
| P2 | **攻击面管理** | 定期扫描公网暴露资产（VPN、RDP） |
| P2 | **凭证轮换** | 90天轮换、禁用默认凭证 |
| P3 | **日志集中管理** | SIEM、不可变日志、保留90天+ |
| P3 | **事件响应演练** | 季度桌面推演、年度实战演练 |

### 12.3 战术层建议（立即执行）

#### 针对 VPN 暴露用户

```bash
# 1. 强制 MFA 对所有 VPN 账户
# 2. 修补已知漏洞（CVE-2023-20269、CVE-2024-40766）
# 3. 限制 VPN 访问 IP 白名单
# 4. 禁用不必要的远程服务

# 5. 检查 VPN 设备配置
# 6. 全量轮换 VPN 凭证
```

#### 针对已感染环境

```powershell
# 1. 隔离受感染主机
netsh advfirewall firewall set rule group="remote desktop" new enable=no
netsh advfirewall firewall set rule group="file and printer sharing" new enable=no

# 2. 检查 LSASS 转储
# 监控 comsvcs.dll MiniDump 调用

# 3. 检查 Veeam 凭据是否被提取
# 监控 sqlcmd.exe 异常调用

# 4. 检查卷影副本
Get-WmiObject Win32_Shadowcopy

# 5. 检查异常 SSH 隧道
netstat -ano | findstr "ESTABLISHED"

# 6. 检查勒索信文件
Get-ChildItem -Recurse -Filter "akira_readme.txt" -ErrorAction SilentlyContinue

# 7. 收集取证数据
```

### 12.4 解密恢复路径

| 场景 | 可行路径 | 成功率 | 建议 |
|------|----------|--------|------|
| 有离线备份 | 备份恢复 | 极高 | ✅ 最可靠 |
| 无备份 | 等待执法行动 | 极低 | ⏳ 持续监控 |
| 考虑付费 | — | 不推荐 | ❌ **强烈不建议** |

**⚠️ 重要提示**：截至2026年6月，**无公开可用的 Akira 解密工具**。

---

## 十三、核心建议（优先级排序）

1. **立即**：强制 MFA 对所有 VPN 账户
2. **立即**：修补所有高危漏洞（Cisco ASA、SonicWall、Veeam）
3. **24小时内**：全量轮换 VPN/RDP 凭证
4. **48小时内**：部署不可变备份 + 离线隔离策略
5. **1周内**：全面攻击面扫描，关闭不必要的公网暴露

---

## 附录

### 附录 A：权威信息源索引

| # | 来源 | 说明 |
|---|------|------|
| 1 | CISA | AA24-109A（更新版 2025年11月） |
| 2 | IC3 | 联合 CSA（2025年11月） |
| 3 | IBM X-Force | Akira Ransomware Spotlight |
| 4 | Trend Micro | Ransomware Spotlight - Akira |
| 5 | Sophos | Akira Ransomware Analysis |
| 6 | TRM Labs | Akira Ransomware Profile（洗钱分析） |
| 7 | CybelAngel | 2025 Akira Ransomware Playbook |
| 8 | Picus Security | Akira Ransomware 2025 TTPs |
| 9 | Barracuda Blog | Akira - Modern Ransomware with a Retro Vibe |
| 10 | Aviva | Loss Prevention Standard: Cyber - Akira |

### 附录 B：术语表

| 术语 | 定义 |
|------|------|
| **RaaS** | Ransomware-as-a-Service，勒索软件即服务 |
| **DLS** | Data Leak Site，数据泄露站 |
| **C2** | Command and Control，命令与控制 |
| **IOC** | Indicator of Compromise，入侵指标 |
| **TTP** | Tactics, Techniques, and Procedures，战术、技术和程序 |
| **VASP** | Virtual Asset Service Provider，虚拟资产服务提供商 |
| **MFA** | Multi-Factor Authentication，多因素认证 |
| **DCSync** | 域控制器同步攻击 |
| **NTDS.dit** | Active Directory 数据库文件 |
| **LSASS** | Local Security Authority Subsystem Service |
| **ChaCha20** | 流加密算法，速度快 |
| **RSA** | Rivest-Shamir-Adleman，非对称加密算法 |

### 附录 C：持续跟踪计划

本页面将作为 Akira 组织的**长期跟踪情报页面**，持续更新以下内容：

- 新受害者案例与攻击事件
- 新发现的 IOC 与检测规则
- 组织基础设施变动
- 解密工具进展
- 执法行动与归因更新
- 洗钱策略演化（Phase V、VI...）
- 平台支持扩展（新增虚拟化平台等）

---

**报告修订历史**

| 版本 | 日期 | 修订内容 |
|------|------|----------|
| v1.0 | 2026-06-21 | 初始发布 |

---

**免责声明**：本报告基于公开来源情报编制，仅供信息参考。本报告中的信息按"原样"提供，不对其准确性、完整性或适用性作任何明示或暗示的保证。使用本报告中的信息需自行承担风险。

**分类等级说明**：TLP:AMBER - 信息可在组织内部共享，但不可公开发布。
