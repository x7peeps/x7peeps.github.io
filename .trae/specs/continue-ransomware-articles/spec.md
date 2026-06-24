# 继续编写勒索组织威胁情报文章 Spec

## Why
`勒索组织` 目录下已有 11 篇威胁情报跟踪文章（LockBit、Qilin、The Gentlemen、Black Basta、Akira、Cl0p、RansomHub、Play、Hive、Royal、INC Ransom），但仍有多个高威胁等级组织尚未覆盖。需要按照现有 13 节模板继续规划和编写。

## What Changes
- 新增 3 篇勒索组织威胁情报文章，每篇遵循 13 节标准模板：
  1. **Rhysida** — 2023年活跃，教育/医疗重点目标，CVE-2023-34048（VMware Aria Operations），与 Vice Society 关联，G1039/S1147
  2. **Cactus** — 2024年活跃，金融行业重点目标，CVE-2024-27198（JetBrains TeamCity），Cactus Chat 谈判平台
  3. **Medusa** — 2022-2025年活跃，双重勒索，MedusaChat 平台，Windows/Linux/ESXi 多平台变体
- 每篇文章更新目录索引 `_index.md`
- Hugo 构建验证 + Git 提交推送

## Impact
- Affected specs: 勒索组织目录下的威胁情报系列文章
- Affected code: Hugo 静态站点构建，`_index.md` 目录索引

## ADDED Requirements

### Requirement: 文章质量标准
每篇勒索组织威胁情报文章 SHALL 满足以下标准：
- 遵循 13 节标准模板（执行摘要、威胁行为者画像、归因分析、技术能力评估、攻击链分析、受害者分析、运营模式/洗钱路径、IOC 完整列表、检测规则、风险评估矩阵、缓解建议、核心建议、附录）
- 包含 Sigma 规则（≥ 3 条）+ YARA 规则（≥ 1 条）
- 包含 MITRE ATT&CK 映射
- 包含解密可能性评估
- Hugo 构建通过（0 错误）

### Requirement: 编写 Rhysida 威胁情报文章
系统 SHALL 编写 Rhysida 勒索组织威胁情报文章。

#### Scenario: 文章编写成功
- **WHEN** 按照 13 节模板编写 Rhysida 威胁情报
- **THEN** 文章包含完整 TTPs、IOC、检测规则，Hugo 构建通过

### Requirement: 编写 Cactus 威胁情报文章
系统 SHALL 编写 Cactus 勒索组织威胁情报文章。

#### Scenario: 文章编写成功
- **WHEN** 按照 13 节模板编写 Cactus 威胁情报
- **THEN** 文章包含完整 TTPs、IOC、检测规则，Hugo 构建通过

### Requirement: 编写 Medusa 威胁情报文章
系统 SHALL 编写 Medusa 勒索组织威胁情报文章。

#### Scenario: 文章编写成功
- **WHEN** 按照 13 节模板编写 Medusa 威胁情报
- **THEN** 文章包含完整 TTPs、IOC、检测规则，Hugo 构建通过

### Requirement: 更新目录索引
每篇新文章 SHALL 更新 `勒索组织/_index.md` 添加对应条目。

#### Scenario: 索引更新成功
- **WHEN** 新文章创建完成后
- **THEN** 目录索引包含新组织条目，Hugo 构建通过
