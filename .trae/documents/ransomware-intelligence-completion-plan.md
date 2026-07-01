# 勒索组织威胁情报文章全覆盖计划

## 概述

当前已收录 **17 个**勒索组织（LockBit、Qilin、The Gentlemen、Black Basta、Akira、Cl0p、RansomHub、Play、Hive、Royal、INC Ransom、Rhysida、Cactus、Medusa、ALPHV/BlackCat、BianLian、NoEscape）。

基于 Halcyon Q2-2025 Power Rankings、SOCRadar Top 10 2025、Cyble 2025 新兴组织报告、Swiss Cyber Institute 2026 十大组织、Ransom.live（741 组追踪）、RansomLook（741 组追踪）等多源交叉验证，识别出 **28 个**尚未覆盖的重要勒索组织。

## 待覆盖组织清单（按优先级分层）

### 第一批：Tier 1 — 顶级活跃组织（Halcyon Frontrunners/Contenders）

| # | 组织 | 别名/追踪代号 | 威胁等级 | 说明 |
|---|------|-------------|----------|------|
| 18 | **DragonForce** | — | 🔴 极高 | 2023.08 出现，RansomHub 接管者，LockBit 3.0 + Conti 双代码库，Ivanti CVE 利用，Cobalt Strike/Mimikatz/SystemBC，工业/制造/交通重点目标 |
| 19 | **Lynx** | Water Lalawag | 🔴 极高 | INC Ransom 源码衍生（70%+函数相似度），2024.07 出现，Frontrunner Q2-2025，打印机勒索信 |
| 20 | **SafePay** | — | 🔴 极高 | 2025年数百受害者，PowerShell/Mimikatz/RDP/Rclone 工具链，Frontrunner Q1-Q2-2025 |
| 21 | **Hunters International** | — | 🟠 高 | Conti 后继组织之一，Diminishing Q2-2025，RaaS 模式 |
| 22 | **8Base** | — | 🟠 高 | 455 受害者，2022.03 出现，Phobos 关联，2025 初被执法打击（4人逮捕），SmokeLoader 投递 |
| 23 | **Fog** | — | 🟠 高 | Contender Q2-2025，活跃数据勒索 |
| 24 | **Cloak** | — | 🟠 高 | Contender Q2-2025，新兴活跃组织 |
| 25 | **Trigona** | — | 🟠 高 | 活跃组织，BlackNevas 为其衍生，AES-256 + RSA-4112 |

### 第二批：Tier 2 — 重要活跃/新兴组织

| # | 组织 | 别名/追踪代号 | 威胁等级 | 说明 |
|---|------|-------------|----------|------|
| 26 | **Scattered Lapsus$ Hunters** | Scattered Spider + LAPSUS$ + ShinyHunters 联盟 | 🔴 极高 | SOCRadar 2025 #1，纯社会工程攻击，Salesforce/SaaS 环境入侵 |
| 27 | **Mallox** | TargetCompany / Phobos 关联 | 🟠 高 | 活跃组织，中小企业重点目标，Phobos 战术相似 |
| 28 | **RansomHouse** | — | 🟠 高 | 纯数据勒索，与 8Base 战术相似 |
| 29 | **ElDorado** | — | 🟠 高 | Diminishing Q2-2025，活跃数据勒索 |
| 30 | **Interlock** | — | 🟠 高 | Emerging Q2-2025，与 Rhysida 关联 |
| 31 | **NightSpire** | — | 🟠 高 | Emerging Q2-2025，双重勒索演化 |
| 32 | **FunkSec** | — | 🟠 高 | Emerging Q2-2025，AI 驱动恶意软件 |
| 33 | **Arcus Media** | — | 🟡 中 | Emerging Q2-2025，98 受害者 |
| 34 | **DevMan** | — | 🟡 中 | Emerging Q2-2025，DragonForce 生态，53 受害者，亚洲/非洲重点 |
| 35 | **DireWolf** | Dire Wolf | 🟡 中 | 2025.05 出现，Golang + Curve25519，亚洲重点 |
| 36 | **Sarcoma** | — | 🟡 中 | Contender Q2-2025 |
| 37 | **Ghost** | — | 🟡 中 | Contender Q2-2025 |
| 38 | **Killsec** | — | 🟡 中 | Contender Q2-2025 |
| 39 | **Meow** | — | 🟡 中 | Contender Q2-2025 |
| 40 | **RALord** | Nova | 🟡 中 | Emerging Q2-2025 |
| 41 | **BlackLock** | — | 🟡 中 | DragonForce 生态 |
| 42 | **3AM** | ThreeAM | 🟡 中 | LockBit 失败后备方案，Rust 编写，0x666 标记 |
| 43 | **Babuk2** | Bjorka / SkyWave / SatanLock | 🟡 中 | Babuk 后继，180 受害者 |
| 44 | **BlackNevas** | Trial Recovery | 🟡 中 | Trigona 衍生，2024.11 出现，AES-256 + RSA-4112 |
| 45 | **APT73** | Bashe | 🟡 中 | 2024.04 出现，79 受害者 |

### 第三批：Tier 3 — 历史重要组织（已停止/被执法打击但有情报价值）

| # | 组织 | 别名 | 说明 |
|---|------|------|------|
| 46 | **Conti** | — | 2020-2022，多个后继组织的源头（Royal/Black Basta/Play/Hunters 等） |
| 47 | **REvil / Sodinokibi** | — | 2019-2022，GandCrab 后继，Kaseya VSA 供应链攻击 |
| 48 | **DarkSide** | — | 2020-2021，Colonial Pipeline 攻击，BlackMatter 后继 |
| 49 | **Maze** | — | 2020-2021，RaaS 模式先驱之一 |
| 50 | **Vice Society** | — | 2021-2023，教育重点目标，Rhysida 前身 |

## 执行计划

### 批次安排（每批 3 篇并行）

| 批次 | 组织 | 文章编号 |
|------|------|----------|
| **批次 1** | DragonForce、Lynx、SafePay | #18-20 |
| **批次 2** | Hunters International、8Base、Fog | #21-23 |
| **批次 3** | Cloak、Trigona、Scattered Lapsus$ Hunters | #24-26 |
| **批次 4** | Mallox、RansomHouse、ElDorado | #27-29 |
| **批次 5** | Interlock、NightSpire、FunkSec | #30-32 |
| **批次 6** | Arcus Media、DevMan、DireWolf | #33-35 |
| **批次 7** | Sarcoma、Ghost、Killsec | #36-38 |
| **批次 8** | Meow、RALord、BlackLock | #39-41 |
| **批次 9** | 3AM、Babuk2、BlackNevas | #42-44 |
| **批次 10** | APT73、Conti、REvil | #45-47 |
| **批次 11** | DarkSide、Maze、Vice Society | #48-50 |

### 每篇文章工作流

1. **情报收集**：WebSearch 多源搜索（CISA/FBI、MITRE ATT&CK、安全厂商报告、Halcyon/Ransom.live/RansomLook）
2. **文章创建**：遵循 13 节标准模板（执行摘要、威胁行为者画像、归因分析、技术能力评估、攻击链分析、受害者分析、运营模式、IOC 列表、检测规则、风险评估矩阵、缓解建议、核心建议、附录）
3. **检测规则**：≥ 3 条 Sigma 规则 + ≥ 1 条 YARA 规则
4. **目录更新**：更新 `_index.md` 添加新条目
5. **构建验证**：`rm -rf public && hugo --minify` 验证 0 错误
6. **Git 提交推送**

### 文件路径

- 文章目录：`hugo-src/content/安全/威胁情报/勒索组织/<组织名>/_index.md`
- 目录索引：`hugo-src/content/安全/威胁情报/勒索组织/_index.md`
- Hugo 源目录：`hugo-src/`

### 验证标准

- 每篇文章遵循 13 节标准模板 ✅
- 每篇文章包含 ≥ 3 条 Sigma + ≥ 1 条 YARA ✅
- 每篇文章包含 MITRE ATT&CK 映射 ✅
- 每篇文章包含解密可能性评估 ✅
- Hugo 构建 0 错误 ✅
- 目录索引完整 ✅
- Git 提交推送 ✅

### 预估总量

- **新增文章**：28 篇（#18-#45 活跃/新兴）+ 5 篇（#46-50 历史重要）= **33 篇**
- **最终收录**：17 + 33 = **50 个勒索组织**
- **预计批次**：11 批（每批 3 篇并行）
- **每批 Hugo 页面增量**：约 60-80 页

## 关键决策

1. **优先级排序**：Tier 1（Halcyon Frontrunners）> Tier 2（Contenders/Emerging）> Tier 3（历史重要）
2. **合并策略**：Royal 已覆盖 BlackSuit/Chaos 演化链，无需单独创建 BlackSuit 文章
3. **历史组织**：Conti/REvil/DarkSide 等虽已停止但作为多个活跃组织的前身，具有极高情报价值
4. **文章模板**：严格沿用现有 13 节标准模板，保持一致性
5. **weight 编号**：从 15 开始递增（当前最大 weight=14 为 Medusa）
