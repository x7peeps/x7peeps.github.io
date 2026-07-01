---
title: "SafePay"
weight: 17
---

**报告编号**: TIR-2026-0701-017 | **分类等级**: TLP:AMBER | **发布日期**: 2026年7月1日 | **情报来源**: 多源交叉验证（OSINT + Ransom-DB + Picus Labs + CYFIRMA + Check Point + ThreatLocker + Xcitium + Blackpoint Cyber + Barracuda + Halcyon Q1-Q2-2025）

---

## 一、执行摘要

**SafePay** 是2024年9-10月快速崛起的集中化、非 RaaS 模式勒索组织。该组织采用**双重勒索**策略，以**后 Conti 时代**的专业团队运营，从入侵到加密通常在 **24小时内**完成。截至2026年3月，Ransom-DB 已追踪到超过 **403 名确认受害者**，主要分布在美国（182）、德国（62）、加拿大（24）和英国（21）。

<!--more-->

SafePay 最显著的特征是其**集中化封闭运营模式**——不采用 RaaS 模式，严格控制基础设施、谈判流程和利润，最大限度降低代码泄露和执法渗透风险。2025年5月，SafePay 以**单月70次攻击**成为全球最活跃勒索软件组织，占全球勒索攻击总量的18%。2025年12月29日，该组织创下**单日10起攻击**的纪录。该组织使用 **AES-256-CBC + RSA-4096** 加密方案，加密文件追加 `.safepay` 扩展名。

### 关键发现

| 维度 | 关键指标 |
|------|----------|
| **组织规模** | 403+ 受害者 |
| **首要目标** | 美国（182），德国（62），加拿大（24），英国（21） |
| **加密方式** | AES-256-CBC + RSA-4096 |
| **首要入口** | 受损凭证、FortiGate 漏洞、社会工程（邮件轰炸+Teams冒充） |
| **商业模式** | **集中化封闭运营**（非 RaaS） |
| **攻击速度** | 入侵到加密 ≤ 24小时 |
| **文件扩展名** | `.safepay` |
| **勒索信** | `readme_safepay.txt` |
| **关联工具** | QDoor 后门（与 BlackSuit 关联）、ScreenConnect |
| **解密可能性** | **不存在**（无公开解密工具） |
| **当前状态** | **活跃**（Frontrunner Q1-Q2-2025） |

### 威胁等级评估

| 评估维度 | 等级 | 说明 |
|----------|------|------|
| **技术能力** | 🔴 极高 | Conti TTPs、QDoor 后门、CMSTPLUA UAC 绕过、UPX 加壳 |
| **运营成熟度** | 🔴 极高 | 集中化封闭运营、24小时攻击周期、假日战术选择 |
| **攻击规模** | 🔴 极高 | 403+ 受害者，单月70次攻击峰值 |
| **目标针对性** | 🟠 高 | 行业无差别（零售/医疗/IT/政府/制造） |
| **数据泄露风险** | 🔴 极高 | 双重勒索 + WinRAR/Rclone/FileZilla 多渠道外传 |

---

## 二、威胁行为者画像

### 2.1 组织标识

| 属性 | 值 |
|------|-----|
| **官方名称** | SafePay |
| **组织类型** | 集中化封闭运营（非 RaaS） |
| **活跃周期** | 2024年9月 – 至今 |
| **主要语言** | 英语（勒索信/谈判） |
| **地理归属** | 东欧/亚洲（CIS kill switch 证据） |
| **攻击目标** | 全球（美国/德国/加拿大/英国为主） |
| **动机** | 经济利益 |

### 2.2 运营模式

```
┌──────────────────────────────────────────────────────┐
│           SafePay 集中化封闭运营模式                    │
├──────────────────────────────────────────────────────┤
│                                                        │
│  与 RaaS 模式对比：                                    │
│                                                        │
│  RaaS 模式：           SafePay 模式：                   │
│  ├── 大量附属机构       ├── 单一核心团队                │
│  ├── 代码泄露风险高     ├── 代码泄露风险极低            │
│  ├── 执法渗透风险高     ├── 执法渗透风险极低            │
│  ├── TTPs 不一致       ├── TTPs 高度一致                │
│  └── 利润分成           └── 独占全部利润                │
│                                                        │
│  Conti 传承：                                          │
│  ├── 标准 Conti TTPs                                   │
│  ├── 垃圾邮件钓鱼 + 自定义加载器                       │
│  ├── ESXi 平台攻击                                     │
│  └── 可能包含 Conti 前成员                             │
│                                                        │
└──────────────────────────────────────────────────────┘
```

---

## 三、归因分析

### 3.1 地理归属

| 证据类型 | 详情 | 置信度 |
|----------|------|--------|
| **CIS kill switch** | 早期样本包含独联体语言检测终止开关 | 高 |
| **Conti TTPs** | 使用标准 Conti 战术技术程序 | 中-高 |
| **QDoor 后门** | 使用与 BlackSuit 关联的后门工具 | 中 |
| **kill switch 移除** | 后续版本移除 CIS 检测，扩大攻击范围 | 中 |

---

## 四、技术能力评估

### 4.1 加密方案

| 属性 | 值 |
|------|-----|
| **对称加密** | AES-256-CBC |
| **非对称加密** | RSA-4096 |
| **文件扩展名** | `.safepay` |
| **勒索信** | `readme_safepay.txt` |
| **加壳工具** | UPX |
| **执行方式** | `regsvr32.exe` / `rundll32.exe`（LOLBins） |
| **互斥体** | 确保每台主机仅运行一个加密实例 |

### 4.2 攻击链速度

```
┌──────────────────────────────────────────────────────┐
│           SafePay 24小时攻击周期                       │
├──────────────────────────────────────────────────────┤
│                                                        │
│  T+0h   侦察（Shodan/Apollo OSINT）                   │
│  T+1h   初始访问（凭证/漏洞/社会工程）                 │
│  T+3h   持久化（QDoor/ScreenConnect）                  │
│  T+5h   权限提升（CMSTPLUA COM）                       │
│  T+8h   发现（Invoke-ShareFinder）                     │
│  T+10h  横向移动（PsExec/WinRM/RDP）                   │
│  T+14h  数据窃取（WinRAR 5GB分卷 + Rclone）           │
│  T+18h  防御规避（终止安全进程/删除卷影副本）          │
│  T+20h  加密部署（AES-256-CBC + RSA-4096）            │
│  T+24h  完成                                           │
│                                                        │
└──────────────────────────────────────────────────────┘
```

---

## 五、攻击链分析

### 5.1 初始访问

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **受损凭证** | T1078 | IAB 购买或暴力破解（VPN/RDP） |
| **FortiGate 漏洞** | T1190 | 配置错误防火墙（允许本地账户无MFA） |
| **社会工程** | T1566 | 邮件轰炸 + Teams 冒充 IT + Quick Assist |
| **GlobalProtect** | T1190 | VPN 平台渗透（Ingram Micro 案例） |

### 5.2 执行与持久化

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **QDoor 后门** | T1105 | 与 BlackSuit 关联的持久化后门 |
| **ScreenConnect** | T1219 | 合法远程管理工具 |
| **CMSTPLUA COM** | T1548.002 | UAC 绕过权限提升 |
| **进程注入** | T1055 | 获取管理员权限 |

### 5.3 横向移动

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **PsExec** | T1570 | `PsExec.exe \\TARGET -u Domain\Admin -p Password cmd.exe` |
| **WinRM** | T1021.006 | Windows 远程管理 |
| **RDP** | T1021.001 | 远程桌面 |
| **Invoke-ShareFinder** | T1135 | PowerTools 网络/SMB 共享枚举 |

### 5.4 数据外传

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **WinRAR** | T1560 | 5GB 分卷归档（排除非必需格式） |
| **Rclone** | T1567.002 | 云存储外传 |
| **FileZilla** | T1048 | FTP 外传 |
| **RDP 剪贴板** | T1071 | 剪贴板数据传输 |

### 5.5 防御规避与影响

| 技术 | MITRE ATT&CK | 详情 |
|------|--------------|------|
| **终止安全进程** | T1562.001 | Sophos/Veeam/backup/GxVss 等 |
| **终止业务进程** | T1562.001 | sql/oracle/exchange/firefox/chrome 等 |
| **删除卷影副本** | T1490 | `vssadmin delete shadows /all /quiet` |
| **禁用恢复** | T1490 | `bcdedit /set {default} recoveryenabled no` |
| **UPX 加壳** | T1027 | 二进制混淆 |
| **数据加密** | T1486 | AES-256-CBC + RSA-4096 |

---

## 六、受害者分析

### 6.1 规模与地理分布

| 指标 | 值 |
|------|-----|
| **确认受害者** | 403+ |
| **首要国家** | 美国（182，45%）、德国（62，15%）、加拿大（24）、英国（21） |
| **其他目标** | 阿根廷（9）、新加坡（7）、哥伦比亚（5） |

### 6.2 行业分布

| 行业 | 说明 |
|------|------|
| **零售** | 中型企业（营收$1000万级） |
| **医疗** | 专科医院（如 Smart Dimensions） |
| **IT 分销** | 全球最大 IT 分销商（Ingram Micro） |
| **休闲服务** | 高尔夫俱乐部等 |
| **政府** | 巴巴多斯统计局 |
| **专业服务** | 金融/法律/保险 |
| **制造/建筑** | 制造企业和建筑公司 |

### 6.3 重大攻击事件

| 时间 | 受害者 | 影响 |
|------|--------|------|
| 2024.10 | Microlise（英国） | 1.2TB 数据泄露 |
| 2025.07 | Ingram Micro（全球IT分销） | 近1TB数据窃取，Xvantage平台离线72h+，每日损失$1.36亿 |
| 2025.12 | 多目标（假日攻击浪潮） | 12.29单日10起，12.27单日9起 |

---

## 七、集中化运营模式分析

### 7.1 赎金经济

| 指标 | 值 |
|------|-----|
| **赎金范围** | $10万 - $30万 |
| **制裁折扣** | 受害者告知制裁后果后大幅降低 |
| **支付方式** | TON 去中心化网络 + Tor |
| **谈判渠道** | Tor 泄露站 + 电子邮件 |

---

## 八、IOC 完整列表

### 8.1 网络指标

| 类型 | 值 | 说明 |
|------|-----|------|
| **扩展名** | `.safepay` | 加密文件扩展名 |
| **文件** | `readme_safepay.txt` | 勒索信 |
| **工具** | QDoor | BlackSuit 关联后门 |
| **工具** | ScreenConnect | 合法远程管理工具滥用 |
| **工具** | Invoke-ShareFinder | PowerTools 网络枚举 |
| **工具** | WinRAR / Rclone / FileZilla | 数据外传 |
| **执行** | `regsvr32.exe` / `rundll32.exe` | LOLBins 执行 |

### 8.2 文件哈希

| 类型 | 哈希值 |
|------|--------|
| SHA256 | `a0dc80a37eb7e2716c02a94adc8df9baedec192a77bde31669faed228d9ff526` |
| SHA256 | `fd509df74a8d6a9e96762337efd46280ebf8d154c6c5dfbac7b3e8f7bb61f191` |
| SHA256 | `625abbf876f256662f33a88c122bf787edf74b882c35adbd61562b5bd1b2ac27` |

### 8.3 可疑文件路径

```
C:\ProgramData\<8位随机>\encryptor.exe
C:\ProgramData\<8位随机>\system.exe
C:\ProgramData\<8位随机>\sliver.bat
C:\ProgramData\rclone\*
C:\temp\* / C:\temp2\*
```

### 8.4 攻击工具链

```
Shodan/Apollo 侦察 → 受损凭证/FortiGate/社会工程
    ↓
QDoor 后门 + ScreenConnect（持久化）
    ↓
CMSTPLUA COM（UAC 绕过）
    ↓
Invoke-ShareFinder（网络发现）
    ↓
PsExec / WinRM / RDP（横向移动）
    ↓
WinRAR 5GB分卷 + Rclone/FileZilla（数据外传）
    ↓
终止安全/业务进程 + 删除卷影副本
    ↓
SafePay 载荷（AES-256-CBC + RSA-4096 + .safepay 扩展名）
```

---

## 九、检测规则

### 9.1 Sigma 规则

#### 规则 1：SafePay 可疑文件路径

```yaml
title: SafePay - Suspicious File Creation in ProgramData
id: sp001-file-creation
status: experimental
description: 检测 SafePay 在 ProgramData 随机目录创建可疑文件
logsource:
  category: file_event
  product: windows
detection:
  selection:
    TargetFilename|contains: '\ProgramData\'
    TargetFilename|endswith:
      - '\encryptor.exe'
      - '\system.exe'
      - '\sliver.bat'
  condition: selection
level: critical
tags:
  - attack.execution
  - attack.t1059
```

#### 规则 2：SafePay UAC 绕过

```yaml
title: SafePay - CMSTPLUA UAC Bypass
id: sp002-uac-bypass
status: experimental
description: 检测通过 CMSTPLUA COM 接口绕过 UAC 的行为
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    ParentImage|endswith: '\DllHost.exe'
    CommandLine|contains: 'CMSTPLUA'
  condition: selection
level: high
tags:
  - attack.privilege_escalation
  - attack.t1548.002
```

#### 规则 3：SafePay 安全进程终止

```yaml
title: SafePay - Security Process Termination
id: sp003-security-termination
status: experimental
description: 检测 SafePay 终止安全软件和备份服务的行为
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    CommandLine|contains:
      - 'net stop'
    CommandLine|contains|any:
      - 'Sophos'
      - 'Veeam'
      - 'backup'
      - 'GxVss'
      - 'sqlsvc'
      - 'msexchange'
  condition: selection
level: critical
tags:
  - attack.defense_evasion
  - attack.t1562.001
```

### 9.2 YARA 规则

```yara
rule SafePay_Ransomware {
    meta:
        description = "检测 SafePay 勒索软件载荷"
        author = "Threat Intelligence Team"
        date = "2026-07-01"
        reference = "SafePay centralized ransomware"
    strings:
        $s1 = ".safepay" ascii
        $s2 = "readme_safepay.txt" ascii
        $s3 = "SafePay" ascii
        $s4 = "QDoor" ascii
        $s5 = "vssadmin delete shadows" ascii
        $s6 = "CMSTPLUA" ascii
        $hex1 = { 48 89 5C 24 08 48 89 6C 24 10 48 89 74 24 18 }
    condition:
        3 of ($s*) and $hex1
}
```

---

## 十、风险评估矩阵

| 风险维度 | 评分 | 说明 |
|----------|------|------|
| **加密强度** | 9/10 | AES-256-CBC + RSA-4096，密码学强度极高 |
| **传播能力** | 7/10 | 集中化运营，无附属网络 |
| **规避能力** | 8/10 | UPX 加壳、CMSTPLUA UAC 绕过、LOLBins 执行 |
| **数据泄露威胁** | 9/10 | 双重勒索 + 多渠道外传 |
| **攻击速度** | 10/10 | 24小时完成入侵到加密 |
| **运营安全性** | 9/10 | 封闭运营，极低泄露/渗透风险 |
| **综合风险** | **🔴 极高** | 24小时攻击周期 + 集中化封闭运营 + 假日战术 |

---

## 十一、缓解建议

### 11.1 即时行动

1. **FortiGate 审计**：禁止本地账户无 MFA 认证
2. **RDP 安全**：强制 MFA，限制互联网暴露
3. **监控 `.safepay` 扩展名**：EDR 配置批量重命名检测
4. **封锁 IOC**：哈希和文件路径加入拦截列表

### 11.2 短期加固

1. **社会工程防护**：培训识别邮件轰炸 + Teams 冒充组合
2. **限制远程工具**：审计 ScreenConnect/Quick Assist 使用
3. **网络分段**：限制 PsExec/WinRM 跨域访问
4. **备份验证**：离线/不可变备份

### 11.3 长期策略

1. **零信任架构**：基于身份的微分段
2. **DLP 策略**：监控 WinRAR/Rclone/FileZilla 异常使用
3. **假日安全**：假日期间加强监控和人员配置

### 11.4 解密恢复路径

| 维度 | 详情 |
|------|------|
| **解密器状态** | **无公开解密工具** |
| **加密强度** | AES-256-CBC + RSA-4096，密码学强度极高 |
| **建议** | 优先从备份恢复；联系执法部门 |

---

## 十二、核心建议

1. **24小时攻击周期**：SafePay 从入侵到加密仅需24小时，防御者必须在数小时内检测并响应
2. **集中化运营更难打击**：非 RaaS 模式无附属机构可追踪，代码泄露和执法渗透风险极低
3. **假日战术**：12月假日期间攻击频率激增，利用 IT/安全人员减少的时机
4. **FortiGate 是首要入口**：配置错误的防火墙（允许本地账户无 MFA）是常见入侵向量
5. **Ingram Micro 案例**：全球最大 IT 分销商遭攻击，系统瘫痪72h+，每日损失$1.36亿——供应链级影响

---

## 十三、附录

### 附录 A：信息来源

| 编号 | 来源 | 日期 |
|------|------|------|
| [1] | Ransom-DB: SafePay Ransomware Analysis | 2026.03 |
| [2] | Picus Labs: Inside SafePay | 2026.02 |
| [3] | CYFIRMA: Weekly Intelligence Report | 2026.02 |
| [4] | Check Point: SafePay Emerging Threat | 2025.06 |
| [5] | ThreatLocker: SafePay IOCs and TTPs | 2025.07 |
| [6] | Xcitium: Safepay Family Overview | 2025.10 |
| [7] | Blackpoint Cyber: SafePay Threat Profile | 2025.09 |
| [8] | Barracuda: SafePay Email Bombs | 2025.07 |
| [9] | Halcyon: Q1-Q2-2025 Power Rankings | 2025 |

### 附录 B：术语表

| 术语 | 定义 |
|------|------|
| **集中化运营** | 非 RaaS 模式，单一团队控制所有操作 |
| **QDoor** | 与 BlackSuit 关联的后门工具 |
| **CMSTPLUA** | Windows COM 接口，可用于 UAC 绕过 |
| **LOLBins** | Living Off the Land Binaries，合法系统工具滥用 |
| **假日战术** | 利用假日 IT 人员减少的时机发动攻击 |

### 附录 C：追踪计划

| 维度 | 说明 |
|------|------|
| **组织状态** | 活跃（Frontrunner Q2-2025） |
| **攻击频率** | 关注单月/单日攻击峰值趋势 |
| **Conti 关联** | 监控与 Conti 生态其他组织的关联 |
| **解密工具** | 关注是否有公开解密工具发布 |
