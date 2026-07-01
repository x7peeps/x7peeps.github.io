---
title: "Lynx"
weight: 16
---

**报告编号**: TIR-2026-0701-016 | **分类等级**: TLP:AMBER | **发布日期**: 2026年7月1日 | **情报来源**: 多源交叉验证（OSINT + Unit 42 / Palo Alto Networks + SOCRadar + FortiGuard Labs + Acronis TRU + BlackBerry + Halcyon Q1-Q2-2025 + Ransom-DB）

---

## 一、执行摘要

**Lynx**（Trend Micro 追踪代号：**Water Lalawag**）是2024年7月首次出现的勒索软件组织，被广泛认为是 **INC Ransom** 的源码衍生变体。Palo Alto Networks Unit 42 分析确认，Lynx 约 **50% 的函数**与 INC Ransom 存在代码重叠，在 Linux ESXi 变体中重叠比例更高。两者使用相同的加密方法（AES-128 CTR + Curve25519），均采用命令行参数控制加密行为，并具备修改桌面壁纸和向打印机发送赎金通知的功能。

<!--more-->

截至2026年6月，Lynx 已累计攻击超过 **414 个确认受害者**，覆盖制造业、商业服务、科技、运输等多个关键行业，地理范围遍及美国（218）、英国（28）、加拿大（22）、德国（17）、澳大利亚（16）等48个国家。2026年1月5日，该组织创下**单日攻击20家机构**的纪录。Lynx 采用 RaaS 模式运营，附属机构获得 **80%** 赎金收入。

### 关键发现

| 维度 | 关键指标 |
|------|----------|
| **组织规模** | 414+ 受害者，48个国家 |
| **首要目标** | 美国（218），英国（28），加拿大（22） |
| **加密方式** | AES-128 CTR + Curve25519（ECDH 密钥交换） |
| **代码来源** | INC Ransom 源码衍生（50%+函数重叠） |
| **商业模式** | RaaS（附属80% / 核心20%） |
| **加密模式** | fast（5%）/ medium（15%）/ slow（25%）/ entire（100%） |
| **文件扩展名** | `.lynx` |
| **单日峰值** | 20家（2026.01.05） |
| **解密可能性** | **不存在**（无公开解密工具） |
| **当前状态** | **活跃**（Frontrunner Q1-Q2-2025） |

### 威胁等级评估

| 评估维度 | 等级 | 说明 |
|----------|------|------|
| **技术能力** | 🔴 极高 | INC 源码继承、Curve25519 加密、多模式部分加密 |
| **运营成熟度** | 🔴 高 | RaaS 模式、Tor 谈判门户、高频攻击节奏 |
| **攻击规模** | 🔴 极高 | 414+ 受害者，单日20家峰值 |
| **目标针对性** | 🟠 高 | 制造业/商业服务/科技为主 |
| **数据泄露风险** | 🔴 极高 | 双重勒索，单次窃取最高达4TB |

---

## 二、威胁行为者画像

### 2.1 组织标识

| 属性 | 值 |
|------|-----|
| **官方名称** | Lynx |
| **别名** | Water Lalawag（Trend Micro） |
| **组织类型** | RaaS（核心+附属） |
| **活跃周期** | 2024年7月 – 至今 |
| **代码来源** | INC Ransom 源码（$300K 暗网出售后衍生） |
| **地理归属** | 俄语地区（推断） |
| **攻击目标** | 全球（美国为主） |
| **动机** | 经济利益 |

### 2.2 与 INC Ransom 的代码继承

```
┌──────────────────────────────────────────────────────┐
│           INC Ransom → Lynx 代码继承链                 │
├──────────────────────────────────────────────────────┤
│                                                        │
│  INC Ransom 核心源码                                    │
│  ├── 2024.03 以 $300,000 在 RAMP 论坛出售              │
│  ├── 出售者：salfetka（关联 Nokoyawa/JSWORM/Karma）    │
│  │                                                      │
│  ├──→ Lynx（2024.07 出现）                             │
│  │    ├── 50%+ 函数重叠                                │
│  │    ├── 相同加密方法（AES-128 CTR + Curve25519）     │
│  │    ├── 相同命令行参数控制                             │
│  │    ├── 相同壁纸修改/打印机勒索信功能                 │
│  │    └── Linux ESXi 变体重叠比例更高                   │
│  │                                                      │
│  └──→ Sinobi（另一源码衍生）                            │
│                                                        │
└──────────────────────────────────────────────────────┘
```

---

## 三、归因分析

### 3.1 地理归属

| 证据类型 | 详情 | 置信度 |
|----------|------|--------|
| **INC 继承** | 源码来自 INC Ransom（俄语地区） | 高 |
| **加密方法** | Curve25519 + AES-128 CTR（与 INC 一致） | 高 |
| **工具链** | SoftPerfect NetScan、Restic 等（与 INC 一致） | 中-高 |

---

## 四、技术能力评估

### 4.1 加密方案

| 属性 | 值 |
|------|-----|
| **对称加密** | AES-128 CTR |
| **非对称加密** | Curve25519（ECDH 密钥交换） |
| **密钥派生** | SHA-512 哈希共享密钥 → AES 密钥 |
| **加密模式** | fast（5%）/ medium（15%）/ slow（25%）/ entire（100%） |
| **文件扩展名** | `.lynx` |
| **勒索信** | `README.txt` |
| **元数据** | 加密 AES 密钥作为 marker 追加到文件尾部 |

### 4.2 加密流程

```
1. 生成 ECC 密钥对（Curve25519）
2. 通过 ECDH 密钥交换生成共享密钥
3. SHA-512 哈希共享密钥 → 派生 AES 密钥
4. AES-128 CTR 模式加密文件数据
5. AES 密钥用攻击者 Curve25519 公钥加密
6. 加密后的 AES 密钥追加到文件尾部
```

### 4.3 系统修改行为

| 行为 | 技术细节 |
|------|----------|
| **壁纸修改** | `HKCU\Control Panel\Desktop\Wallpaper` → `%TEMP%\background-image.jpg` |
| **勒索信** | 桌面/ProgramData/PerfLogs 投放 `README.txt` |
| **打印机攻击** | 利用 Windows Fax Service（FXSSVC.exe）发送赎金通知 |
| **VSS 删除** | `vssadmin` / `wbadmin` 删除卷影副本 |
| **图标替换** | `ProgramData\Microsoft\Device Stage\Task\` 创建自定义 `.ico` |

---

## 五、攻击链分析

### 5.1 初始访问

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **钓鱼邮件** | T1566.001 | 鱼叉式钓鱼附件 |
| **漏洞利用** | T1190 | 面向公众应用漏洞 |
| **IAB 购买** | T1195 | 初始访问经纪人 |
| **Infostealer** | T1588 | 凭证窃取（19%受害者关联） |

### 5.2 执行与持久化

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **PowerShell** | T1059.001 | 恶意脚本执行 |
| **有效账户** | T1078 | 被盗凭证横向移动 |

### 5.3 凭证窃取

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **LSASS 转储** | T1003.001 | 内存凭证提取 |

### 5.4 横向移动

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **RDP** | T1021.001 | 远程桌面 |
| **SMB** | T1021.002 | Windows 管理共享 |

### 5.5 数据外传

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **Web 服务** | T1567 | 云存储外传 |
| **备用协议** | T1048 | 非标准协议传输 |
| **Restic** | T1567 | 合法备份工具滥用 |

### 5.6 防御规避与影响

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **禁用安全工具** | T1562.001 | 发现安全软件后尝试卸载 |
| **伪装** | T1036 | 恶意进程伪装合法进程 |
| **删除卷影副本** | T1490 | 阻止恢复 |
| **数据加密** | T1486 | AES-128 CTR + Curve25519 |
| **壁纸修改** | T1491.001 | 赎金信息展示 |

---

## 六、受害者分析

### 6.1 规模与地理分布

| 指标 | 值 |
|------|-----|
| **确认受害者** | 414+ |
| **覆盖国家** | 48个 |
| **首要国家** | 美国（218）、英国（28）、加拿大（22）、德国（17）、澳大利亚（16） |

### 6.2 行业分布

| 行业 | 受害者数 | 说明 |
|------|----------|------|
| **商业服务** | 81 | 最高频 |
| **制造业** | 79 | 紧随其后 |
| **科技** | 41 | IT 服务商 |
| **运输/物流** | 29 | 物流公司 |
| **建筑业** | 27 | 建筑公司 |

### 6.3 重大攻击事件

| 时间 | 受害者 | 影响 |
|------|--------|------|
| 2024.12 | Electrica（罗马尼亚能源） | 运营中断，数据泄露 |
| 2025.01 | CONAD（意大利零售） | 内部文件和员工信息泄露 |
| 2026.01 | True Blue Environmental | 全部服务器加密，35GB+数据被盗 |
| 2026.01.05 | 单日20家机构 | 历史攻击峰值 |

---

## 七、RaaS 运营模式分析

### 7.1 组织架构

| 要素 | 详情 |
|------|------|
| **分成比例** | 附属80% / 核心20% |
| **服务内容** | 加密工具、泄露站点、运营支持、谈判门户 |
| **附属角色** | 初始访问、横向移动、部署勒索软件 |
| **核心角色** | 基础设施维护、泄露站管理、赎金谈判 |

---

## 八、IOC 完整列表

### 8.1 网络指标

| 类型 | 值 | 说明 |
|------|-----|------|
| **扩展名** | `.lynx` | 加密文件扩展名 |
| **文件** | `README.txt` | 勒索信 |
| **文件** | `background-image.jpg` | 壁纸文件（%TEMP%） |
| **哈希** | `6e65483764d7c25523a5bbef5be99eb42349eef39d5517c46b3a4af262a80ceb` | Lynx 二进制样本 |
| **Tor** | `lynxchatly4zludmhmi75jrwhycnoqvkxb4prohxmyzf4euf5gjxroad[.]onion` | 谈判门户 |
| **Tor** | `lynxchatfw4rgsclp4567i4llkqjr2kltaumwwobxdik3qa2oorrknad[.]onion` | 谈判门户 |
| **域名** | `lynxblog.net` | 泄露站 |

### 8.2 行为指标

- 大量文件重命名为 `.lynx` 扩展名
- `vssadmin Delete Shadows` 或 `wbadmin` 命令
- MSSQL/Exchange/Veeam 服务异常终止
- 桌面壁纸被修改
- 打印机自动打印赎金通知
- 文件熵值 ≈ 7.99

### 8.3 攻击工具链

```
钓鱼 / 漏洞利用 / IAB 购买 / Infostealer 凭证
    ↓
PowerShell 执行 + 有效账户横向移动
    ↓
LSASS 转储（凭证窃取）
    ↓
SoftPerfect NetScan（网络发现）
    ↓
RDP / SMB（横向移动）
    ↓
Restic / 云存储（数据外传，最高4TB）
    ↓
Lynx 载荷（AES-128 CTR + Curve25519 加密 + 壁纸修改 + 打印机勒索信）
```

---

## 九、检测规则

### 9.1 Sigma 规则

#### 规则 1：Lynx 卷影副本删除

```yaml
title: Lynx Ransomware - Volume Shadow Copy Deletion
id: lx001-vss-deletion
status: experimental
description: 检测 Lynx 勒索软件删除卷影副本的行为
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

#### 规则 2：Lynx 壁纸修改

```yaml
title: Lynx Ransomware - Desktop Wallpaper Modification
id: lx002-wallpaper-change
status: experimental
description: 检测 Lynx 修改桌面壁纸为赎金信息的行为
logsource:
  category: registry_event
  product: windows
detection:
  selection:
    TargetObject|contains: 'Control Panel\Desktop\Wallpaper'
    Details|contains: 'background-image.jpg'
  condition: selection
level: high
tags:
  - attack.impact
  - attack.t1491.001
```

#### 规则 3：Lynx 打印机勒索信

```yaml
title: Lynx Ransomware - Printer Ransom Note via Fax Service
id: lx003-printer-ransom
status: experimental
description: 检测通过 Windows Fax Service 向打印机发送赎金通知
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    ParentImage|endswith: '\FXSSVC.exe'
    CommandLine|contains: 'print'
  condition: selection
level: high
tags:
  - attack.impact
  - attack.t1491
```

### 9.2 YARA 规则

```yara
rule Lynx_Ransomware {
    meta:
        description = "检测 Lynx 勒索软件载荷"
        author = "Threat Intelligence Team"
        date = "2026-07-01"
        reference = "Water Lalawag / INC Ransom derivative"
    strings:
        $s1 = ".lynx" ascii
        $s2 = "README.txt" ascii
        $s3 = "Lynx Group" ascii
        $s4 = "background-image.jpg" ascii
        $s5 = "vssadmin delete shadows" ascii
        $s6 = "FXSSVC.exe" ascii
        $hex1 = { 48 89 5C 24 08 48 89 6C 24 10 48 89 74 24 18 }
    condition:
        3 of ($s*) and $hex1
}
```

---

## 十、风险评估矩阵

| 风险维度 | 评分 | 说明 |
|----------|------|------|
| **加密强度** | 8/10 | AES-128 CTR + Curve25519，密码学强度高 |
| **传播能力** | 8/10 | RaaS 80/20 分成，高频攻击节奏 |
| **规避能力** | 7/10 | 继承 INC 技术，伪装进程 |
| **数据泄露威胁** | 9/10 | 双重勒索，单次最高4TB |
| **基础设施韧性** | 7/10 | Tor 谈判门户，多泄露站 |
| **综合风险** | **🔴 极高** | INC 源码衍生 + 单日20家峰值 + Frontrunner |

---

## 十一、缓解建议

### 11.1 即时行动

1. **封锁 Tor 出站**：防火墙阻止 Tor 网络访问
2. **监控 `.lynx` 扩展名**：EDR 配置批量文件重命名检测
3. **监控 VSS 操作**：告警 `vssadmin`/`wbadmin` 异常调用
4. **更新 IOC**：将哈希和 .onion 域名加入拦截列表

### 11.2 短期加固

1. **强制 MFA**：RDP/VPN/邮件系统
2. **网络分段**：隔离备份系统
3. **补丁管理**：修复面向公众设备漏洞
4. **最小权限**：限制管理员横向移动

### 11.3 长期策略

1. **行为检测**：批量文件修改、服务终止、大规模出站传输
2. **离线备份**：不可变离线备份
3. **威胁狩猎**：LSASS 转储、SoftPerfect NetScan 痕迹

### 11.4 解密恢复路径

| 维度 | 详情 |
|------|------|
| **解密器状态** | **无公开解密工具** |
| **加密强度** | AES-128 CTR + Curve25519，密码学强度极高 |
| **建议** | 优先从备份恢复；联系执法部门 |

---

## 十二、核心建议

1. **INC 源码扩散**：$300K 源码出售催生了 Lynx 和 Sinobi，证明源码商业化加速威胁碎片化
2. **高频攻击节奏**：单日20家峰值表明自动化扫描与并发攻击能力
3. **打印机勒索信**：利用 Windows Fax Service 向打印机发送赎金通知是独特施压手段
4. **部分加密模式**：fast/medium/slow/entire 四级模式可配置，防御者需关注低比例加密
5. **MSP 威胁**：托管服务提供商因客户网络访问能力成为高价值目标

---

## 十三、附录

### 附录 A：信息来源

| 编号 | 来源 | 日期 |
|------|------|------|
| [1] | Unit 42: Lynx Ransomware - INC Ransom Rebranding | 2024.10 |
| [2] | SOCRadar: Top 10 Ransomware Groups 2025 | 2026.01 |
| [3] | FortiGuard Labs: Lynx Technical Analysis | 2025 |
| [4] | Acronis TRU: Lynx Ransomware Evolution | 2025 |
| [5] | BlackBerry: Lynx Code Overlap with INC | 2025 |
| [6] | Halcyon: Q1-Q2-2025 Power Rankings | 2025 |
| [7] | Ransom-DB: Lynx Victim Statistics | 2026 |
| [8] | Trend Micro: Water Lalawag Tracking | 2025 |

### 附录 B：术语表

| 术语 | 定义 |
|------|------|
| **Curve25519** | 椭圆曲线 Diffie-Hellman 密钥交换算法 |
| **ECDH** | Elliptic Curve Diffie-Hellman |
| **部分加密** | 仅加密文件部分内容（可配置百分比） |
| **Water Lalawag** | Trend Micro 对 Lynx 的追踪代号 |

### 附录 C：追踪计划

| 维度 | 说明 |
|------|------|
| **组织状态** | 活跃（Frontrunner Q2-2025） |
| **INC 关联** | 监控更多 INC 源码衍生变体 |
| **攻击频率** | 关注单日攻击峰值趋势 |
| **解密工具** | 关注是否有公开解密工具发布 |
