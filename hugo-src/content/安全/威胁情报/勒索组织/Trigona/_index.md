---
title: "Trigona"
weight: 22
---

**报告编号**: TIR-2026-0701-022 | **分类等级**: TLP:AMBER | **发布日期**: 2026年7月1日 | **情报来源**: 多源交叉验证（OSINT + Symantec + Trend Micro + Zscaler + Arete Institute + SentinelOne + Unit 42 + The DFIR Report + GBHackers）

---

## 一、执行摘要

**Trigona**（Trend Micro 追踪代号：**Water Ungaw**，Symantec 追踪代号：**Rhantus**）是2022年6月首次出现的勒索软件即服务（RaaS）组织，以**双重勒索**模式和**内核级防御瘫痪工具**著称。该组织由 Symantec 命名为"Rhantus"的网络犯罪团伙运营，向关联成员提供 **20%–50%** 的收益分成。

<!--more-->

Trigona 与 **CryLock/Cryakl** 在 TTPs 上高度重叠，并与 **ALPHV/BlackCat** 存在管理层面协作关系——利用 ALPHV 的声誉和数据泄露站点作为对受害者的施压手段。2023年10月，亲乌克兰黑客组织 **Ukrainian Cyber Alliance (UCA)** 攻陷了 Trigona 的数据泄露站点，使其运营一度停滞。然而，**2026年初该组织以升级的战术重新活跃**，包括自研数据窃取工具 `uploader_client.exe` 和大规模 BYOVD 攻击。

### 关键发现

| 维度 | 关键指标 |
|------|----------|
| **组织规模** | 政府机构占受害者21.4%（最高） |
| **首要目标** | 土耳其（23.5%）、菲律宾（19.6%）、巴西（13.7%） |
| **加密方式** | AES-256（OFB模式）+ RSA-4,112 |
| **编程语言** | Delphi（Windows版本） |
| **商业模式** | RaaS（20-50%分成） |
| **关联组织** | CryLock/Cryakl（TTPs重叠）、ALPHV/BlackCat（管理协作） |
| **技术创新** | 自研 uploader_client.exe、BYOVD 多驱动、数据擦除器功能 |
| **支付方式** | Monero（XMR），TOR 谈判门户 |
| **解密可能性** | **不存在**（无公开解密工具） |
| **当前状态** | **活跃**（2026年初重新活跃） |

### 威胁等级评估

| 评估维度 | 等级 | 说明 |
|----------|------|------|
| **技术能力** | 🔴 极高 | Delphi编写、RSA-4112、BYOVD多驱动、自研窃取工具、数据擦除器 |
| **运营成熟度** | 🔴 极高 | RaaS模式、ALPHV协作、公开泄露站（倒计时+竞价） |
| **攻击规模** | 🟠 高 | 政府机构21.4%（最高行业占比） |
| **目标针对性** | 🔴 极高 | 政府/教育/制造/医疗/法律/金融 |
| **数据泄露风险** | 🔴 极高 | 双重勒索 + 公开泄露站 + 数据擦除器 |

---

## 二、威胁行为者画像

### 2.1 组织标识

| 属性 | 值 |
|------|-----|
| **官方名称** | Trigona |
| **别名** | Water Ungaw（Trend Micro）、Rhantus（Symantec） |
| **组织类型** | RaaS（20-50%分成） |
| **活跃周期** | 2022年6月 – 至今（2023.10 UCA打击后2026年初重新活跃） |
| **编程语言** | Delphi（Windows版本） |
| **地理归属** | 俄语地区（推断） |
| **攻击目标** | 全球（土耳其/菲律宾/巴西为主） |
| **动机** | 经济利益 |

### 2.2 关联组织

```
┌──────────────────────────────────────────────────────┐
│           Trigona 关联组织网络                          │
├──────────────────────────────────────────────────────┤
│                                                        │
│  ┌─────────────────┐                                  │
│  │ Trigona 核心     │ Water Ungaw / Rhantus           │
│  │（RaaS 提供者）    │ Delphi 编写                     │
│  └────────┬────────┘                                  │
│           │                                            │
│           ├──→ CryLock / Cryakl                        │
│           │    TTPs 高度重叠                            │
│           │    勒索信文件名和通信邮箱相似                │
│           │                                            │
│           ├──→ ALPHV / BlackCat（管理协作）             │
│           │    利用 ALPHV 声誉和泄露站施压              │
│           │                                            │
│           └──→ BlackNevas（衍生）                       │
│                Trigona 代码衍生变体                     │
│                                                        │
└──────────────────────────────────────────────────────┘
```

---

## 三、归因分析

### 3.1 地理归属

| 证据类型 | 详情 | 置信度 |
|----------|------|--------|
| **RAMP 论坛** | 从 RAMP 内部聊天购买凭证 | 高 |
| **工具链** | HRSword/PCHunter 等俄语工具 | 中-高 |
| **UCA 打击** | 亲乌克兰组织攻陷其泄露站 | 中 |

---

## 四、技术能力评估

### 4.1 加密方案

| 属性 | 值 |
|------|-----|
| **对称加密** | AES-256（OFB 模式，无填充） |
| **非对称加密** | RSA-4,112 |
| **配置加密** | 双层 AES-CBC |
| **加密范围** | 默认仅加密文件前 512KB（0x80000字节），`/full` 参数可加密全部 |
| **文件扩展名** | `._locked` |
| **擦除扩展名** | `._erased` |
| **勒索信** | `how_to_decrypt.hta`（HTA格式，内嵌 JavaScript） |
| **编程语言** | Delphi |

### 4.2 数据擦除器功能

```
┌──────────────────────────────────────────────────────┐
│           Trigona 数据擦除器功能                       │
├──────────────────────────────────────────────────────┤
│                                                        │
│  /erase 参数：                                         │
│  ├── 用 NULL 字节覆写文件（默认前512KB）               │
│  ├── 结合 /full 可覆写全部内容                         │
│  ├── 重命名为 ._erased 扩展名                          │
│  └── 删除文件                                          │
│                                                        │
│  影响：                                                │
│  ├── 阻碍取证分析                                      │
│  ├── 彻底摧毁受害者数据                                │
│  └── 即使支付赎金也无法恢复                            │
│                                                        │
└──────────────────────────────────────────────────────┘
```

### 4.3 内核级防御瘫痪工具

| 工具 | 用途 | 类型 |
|------|------|------|
| **HRSword（虎绒安全套件）** | 内核驱动服务形式安装，深度控制系统 | 安全套件 |
| **PCHunter** | 利用脆弱内核驱动终止终端防护进程 | BYOVD |
| **Gmer** | 内核级 Rootkit 检测/对抗工具（被恶意利用） | 合法工具滥用 |
| **YDark** | 安全软件禁用工具 | 安全禁用 |
| **WKTools（wktools.sys）** | 脆弱内核驱动，绕过用户态保护 | BYOVD |
| **DumpGuard** | 安全进程终止工具 | 进程终止 |
| **StpProcessMonitorByovd** | BYOVD 攻击工具 | BYOVD |
| **PowerRun** | 以提升权限执行上述工具 | 权限提升 |

---

## 五、攻击链分析

### 5.1 初始访问

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **暴力破解** | T1110 | MSSQL 服务器（2023.04起）和 RDP |
| **凭证购买** | T1588 | RAMP 论坛内部聊天从 IAB 购买 |
| **漏洞利用** | T1190 | CVE-2021-40539（Zoho ManageEngine ADSelfService Plus） |
| **钓鱼邮件** | T1566 | 鱼叉式钓鱼 |
| **暴露 RDP** | T1133 | 远程桌面协议暴露 |

### 5.2 执行与持久化

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **PowerShell** | T1059.001 | 部署 Cobalt Strike beacon |
| **Cobalt Strike** | T1071 | 后续载荷投递框架 |
| **注册表 Run 键** | T1547.001 | CID 反转 MD5 哈希命名 |
| **/autorun_only** | T1547 | 仅创建持久化不执行加密 |

### 5.3 防御规避（内核级瘫痪）

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **HRSword** | T1562.001 | 内核驱动安装，深度控制 |
| **PCHunter** | T1562.001 | 脆弱驱动终止安全进程 |
| **Gmer** | T1562.001 | Rootkit 工具恶意利用 |
| **WKTools** | T1068 | BYOVD 绕过用户态保护 |
| **StpProcessMonitorByovd** | T1068 | BYOVD 攻击 |
| **PowerRun** | T1548 | 提升权限执行工具 |

### 5.4 凭证窃取

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **Mimikatz** | T1003.001 | LSASS/内存/注册表凭证提取 |
| **Nirsoft 系列** | T1555 | Mail PassView/DialupPassView/RDPassView/MessenPass/IE PassView |
| **MalExtractor** | T1003 | 额外凭证提取 |

### 5.5 横向移动

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **AnyDesk/ScreenConnect/SplashTop** | T1219 | 合法远程工具 |
| **Advanced Port Scanner** | T1046 | 网络侦察 |
| **SoftPerfect NetScan** | T1046 | 网络扫描 |
| **SMB 传播** | T1021.002 | 可通过配置开关控制 |

### 5.6 数据外传（2026年战术变化）

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **uploader_client.exe** | T1567 | **自研窃取工具**（2026.03起取代 Rclone） |
| **并行传输** | T1567 | 每文件默认5个并行连接 |
| **连接轮换** | T1090 | 每2048MB自动轮换TCP连接 |
| **精细过滤** | T1560 | `--exclude-ext` 跳过低价值大文件 |
| **集成认证** | T1567 | 共享认证密钥防止未授权访问 |

### 5.7 防御规避与影响

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **数据加密** | T1486 | AES-256 OFB + RSA-4112 |
| **数据擦除** | T1485 | `/erase` 参数 NULL 覆写 |
| **部分加密** | T1486 | 默认前512KB，`/full` 全部 |
| **删除卷影副本** | T1490 | 阻止恢复 |
| **强制关机** | T1529 | `/shdwn` 参数加密后关机 |

---

## 六、受害者分析

### 6.1 规模与地理分布

| 指标 | 值 |
|------|-----|
| **首要国家** | 土耳其（23.5%）、菲律宾（19.6%）、巴西（13.7%） |
| **其他目标** | 德国、泰国（Top 5） |

### 6.2 行业分布

| 行业 | 占比 | 说明 |
|------|------|------|
| **政府机构** | 21.4% | 最高行业占比 |
| **教育** | 🔴 高 | |
| **制造业** | 🔴 高 | |
| **医疗健康** | 🟠 高 | |
| **法律服务** | 🟠 高 | |
| **金融服务** | 🟡 中 | |

---

## 七、RaaS 运营模式分析

### 7.1 命令行参数

| 参数 | 功能 |
|------|------|
| `/erase` | 覆写文件（数据擦除模式） |
| `/full` | 加密/擦除完整文件内容 |
| `/r` | 随机化文件加密顺序 |
| `/shdwn` | 加密后强制关机 |
| `/p` 或 `/path` | 指定递归加密路径 |
| `/!local` | 不加密本地文件 |
| `/!lan` | 不加密网络共享文件 |
| `/autorun_only` | 仅创建持久化注册表项 |
| `/is_testing` | 设置测试标志 |
| `/test_cid` | 强制指定计算机 ID |
| `/test_vid` | 强制指定受害者 ID |

### 7.2 泄露站特色

- **公开网站**（非 TOR 隐藏服务）
- **倒计时器**：显示数据公开倒计时
- **数据竞价功能**：允许第三方竞价购买泄露数据

---

## 八、IOC 完整列表

### 8.1 文件哈希

| 类型 | SHA-256 | 说明 |
|------|---------|------|
| 勒索软件 | `8cbe32f31befe7c4169f25614afd1778006e4bda6c6091531bc7b4ff4bf62376` | 载荷 |
| 勒索软件 | `efb688214c3fe5d9273ec03641cf17af5f546b11c97a965a49f8e617278ac700` | 载荷 |
| 窃取工具 | `396aa1f8f308010a3c76a53965d0eddd35e41176eacd1194745d9542239ca8dc` | uploader_client.exe |
| BYOVD | `4adbb1906762c757764ffc5fa64af96e091966f4f5a43aae12fcc4f05f1c26b5` | StpProcessMonitor |
| BYOVD | `1433aa8210b287b8d463d958fc9ceeb913644f550919cfb2c62370773799e5a5` | wktools.sys |
| 凭证工具 | `205818e10c13d2e51b4c0196ca30111276ca1107fc8e25a0992fe67879eab964` | RDPassView |

### 8.2 文件特征

| 特征 | 值 |
|------|-----|
| **加密扩展名** | `._locked` |
| **擦除扩展名** | `._erased` |
| **勒索信** | `how_to_decrypt.hta` |
| **配置资源名** | `CFGS`（PE 资源段） |

### 8.3 被利用漏洞

| CVE | 影响组件 | 说明 |
|-----|----------|------|
| CVE-2021-40539 | Zoho ManageEngine ADSelfService Plus | RCE |

### 8.4 攻击工具链

```
暴力破解（MSSQL/RDP）/ RAMP 凭证购买 / CVE-2021-40539 / 钓鱼
    ↓
PowerShell + Cobalt Strike（执行与持久化）
    ↓
HRSword / PCHunter / Gmer / WKTools / StpProcessMonitorByovd（内核级防御瘫痪）
    ↓
Mimikatz / Nirsoft 系列 / MalExtractor（凭证窃取）
    ↓
AnyDesk / ScreenConnect / SplashTop（横向移动）
    ↓
uploader_client.exe（自研窃取工具，5并行连接，2048MB轮换）
    ↓
Trigona 载荷（AES-256 OFB + RSA-4112 加密 / 数据擦除 / ._locked 扩展名）
```

---

## 九、检测规则

### 9.1 Sigma 规则

#### 规则 1：Trigona BYOVD 驱动加载

```yaml
title: Trigona - BYOVD Driver Loading
id: tg001-byovd
status: experimental
description: 检测 Trigona 使用 BYOVD 技术加载脆弱内核驱动
logsource:
  category: driver_load
  product: windows
detection:
  selection:
    ImageLoaded|endswith:
      - '\wktools.sys'
      - '\PCHunter*.sys'
  condition: selection
level: critical
tags:
  - attack.defense_evasion
  - attack.t1068
```

#### 规则 2：Trigona 自研窃取工具

```yaml
title: Trigona - Custom Uploader Client
id: tg002-uploader
status: experimental
description: 检测 Trigona 自研数据窃取工具 uploader_client.exe
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|endswith: '\uploader_client.exe'
  condition: selection
level: critical
tags:
  - attack.exfiltration
  - attack.t1567
```

#### 规则 3：Trigona 数据擦除

```yaml
title: Trigona - Data Wiper Function
id: tg003-wiper
status: experimental
description: 检测 Trigona 数据擦除器功能（._erased 扩展名）
logsource:
  category: file_event
  product: windows
detection:
  selection:
    TargetFilename|endswith: '._erased'
  condition: selection
level: critical
tags:
  - attack.impact
  - attack.t1485
```

### 9.2 YARA 规则

```yara
rule Trigona_Ransomware {
    meta:
        description = "检测 Trigona 勒索软件载荷"
        author = "Threat Intelligence Team"
        date = "2026-07-01"
        reference = "Water Ungaw / Rhantus"
    strings:
        $s1 = "._locked" ascii
        $s2 = "._erased" ascii
        $s3 = "how_to_decrypt.hta" ascii
        $s4 = "Trigona" ascii
        $s5 = "CFGS" ascii
        $s6 = "uploader_client" ascii
        $hex1 = { 48 89 5C 24 08 48 89 6C 24 10 48 89 74 24 18 }
    condition:
        3 of ($s*) and $hex1
}
```

---

## 十、风险评估矩阵

| 风险维度 | 评分 | 说明 |
|----------|------|------|
| **加密强度** | 9/10 | AES-256 OFB + RSA-4112，密码学强度极高 |
| **传播能力** | 8/10 | RaaS 模式 + ALPHV 协作 + CryLock 关联 |
| **规避能力** | 10/10 | 内核级 BYOVD 多驱动瘫痪，用户态检测完全失效 |
| **数据泄露威胁** | 10/10 | 双重勒索 + 数据擦除器 + 公开泄露站（竞价） |
| **漏洞利用能力** | 8/10 | Zoho ManageEngine CVE + MSSQL/RDP 暴力破解 |
| **基础设施韧性** | 7/10 | UCA 打击后2026年重新活跃 |
| **综合风险** | **🔴 极高** | 内核级 BYOVD + 数据擦除器 + RSA-4112 + 政府21.4% |

---

## 十一、缓解建议

### 11.1 即时行动

1. **HVCI 启用**：启用基于虚拟化的代码完整性保护，阻止脆弱驱动加载
2. **Zoho 修补**：修复 CVE-2021-40539（ManageEngine ADSelfService Plus）
3. **MSSQL 加固**：禁用 SA 账户，强制 MFA
4. **监控 uploader_client.exe**：检测自研窃取工具

### 11.2 短期加固

1. **内核驱动审计**：审计所有第三方内核驱动加载
2. **网络分段**：隔离关键资产
3. **备份验证**：离线/不可变备份

### 11.3 长期策略

1. **零信任架构**
2. **BYOVD 防护**：驱动白名单策略
3. **威胁狩猎**：针对 Trigona TTPs

### 11.4 解密恢复路径

| 维度 | 详情 |
|------|------|
| **解密器状态** | **无公开解密工具** |
| **加密强度** | AES-256 OFB + RSA-4112，密码学强度极高 |
| **数据擦除** | `/erase` 参数覆写后数据不可恢复 |
| **建议** | 优先从备份恢复；联系执法部门 |

---

## 十二、核心建议

1. **内核级威胁**：Trigona 使用6种以上 BYOVD 工具在内核层面瘫痪安全防御，HVCI 是首要防御措施
2. **数据擦除器**：`/erase` 参数可彻底摧毁数据，即使支付赎金也无法恢复
3. **自研窃取工具**：uploader_client.exe 取代 Rclone 表明技术成熟度提升，规避已知工具检测
4. **ALPHV 协作**：利用 ALPHV 声誉施压表明网络犯罪生态的协作趋势
5. **UCA 打击后重建**：2023年打击后2026年重新活跃，证明执法打击效果有限

---

## 十三、附录

### 附录 A：信息来源

| 编号 | 来源 | 日期 |
|------|------|------|
| [1] | Symantec: Rhantus/Trigona Analysis | 2026.04 |
| [2] | Zscaler ThreatLabz: Trigona TTPs | 2023.04 |
| [3] | Trend Micro: Water Ungaw Tracking | 2023.11 |
| [4] | Arete Institute: Trigona-ALPHV Collaboration | 2023.02 |
| [5] | SentinelOne: Trigona Analysis | 2023.07/2025.09 |
| [6] | Unit 42: Trigona Research | 2023 |
| [7] | The DFIR Report: Trigona Case Study | 2024 |
| [8] | GBHackers: Trigona 2026 Resurgence | 2026.04 |

### 附录 B：术语表

| 术语 | 定义 |
|------|------|
| **BYOVD** | Bring Your Own Vulnerable Driver，自带易受攻击驱动程序 |
| **HRSword** | 虎绒安全套件，被 Trigona 恶意利用 |
| **PCHunter** | 系统信息工具，被用于终止安全进程 |
| **数据擦除器** | 用 NULL 字节覆写文件使数据不可恢复的功能 |
| **uploader_client.exe** | Trigona 2026年自研数据窃取工具 |

### 附录 C：追踪计划

| 维度 | 说明 |
|------|------|
| **组织状态** | 活跃（2026年初重新活跃） |
| **BYOVD 演化** | 关注新型脆弱驱动利用 |
| **自研工具** | 监控 uploader_client.exe 功能更新 |
| **ALPHV 协作** | 关注与 ALPHV/BlackCat 的协作深化 |
| **解密工具** | 关注是否有公开解密工具发布 |
