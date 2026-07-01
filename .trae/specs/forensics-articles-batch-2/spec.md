# 取证分析深度文章第二批 Spec

## Why
`0x03取证分析` 目录下已有 70+ 篇文章，其中 14 篇达到 2 万字标准的深度分析文章。同时 `continue-forensics-articles` spec 中 `恶意软件行为分析与沙箱检测.md`（19,405 字符）尚未达到 20,000 字标准。需要继续补全并编写新的高价值取证主题深度文章。

## What Changes
- 补全 `恶意软件行为分析与沙箱检测.md` 至 20,000 字符以上
- 新增 3 篇深度分析文章，每篇 ≥ 20,000 字符：
  1. **LOLBins 武器化与取证检测深度分析** — 覆盖 Certutil、Regsvr32、Mshta、InstallUtil、Rundll32、Cmdlets 等 LOLBin 的武器化利用方式、取证特征和检测方法
  2. **AMSI 绕过与 ETW 篡改取证分析** — 覆盖 AMSI 补丁绕过、反射加载、ETW 禁用/篡改等技术的原理、取证特征和检测方法
  3. **凭据攻击链与 Kerberos 攻击取证分析** — 覆盖 Pass-the-Hash、Pass-the-Ticket、Kerberoasting、AS-REP Roasting、Golden/Silver Ticket 等攻击的取证特征和检测方法
- 每篇文章遵循现有格式：10+ 章节、原理/工具/检测/案例/参考资料、Sigma 规则/狩猎脚本、Hugo 构建验证

## Impact
- Affected specs: continue-forensics-articles（补全遗留任务）
- Affected code: Hugo 静态站点构建

## ADDED Requirements

### Requirement: 补全恶意软件行为分析文章
系统 SHALL 将 `恶意软件行为分析与沙箱检测.md` 从 19,405 字符扩展至 20,000 字符以上。

#### Scenario: 补全成功
- **WHEN** 添加新章节内容（如恶意软件分类学、沙箱对比分析、高级逃逸技术等）
- **THEN** 文章字数 ≥ 20,000 且 Hugo 构建通过

### Requirement: LOLBins 武器化深度分析文章
系统 SHALL 编写 LOLBins 武器化与取证检测深度分析文章。

#### Scenario: 文章编写成功
- **WHEN** 按照现有格式编写 LOLBins 深度分析
- **THEN** 文章字数 ≥ 20,000 且 Hugo 构建通过

### Requirement: AMSI 绕过与 ETW 篡改取证分析文章
系统 SHALL 编写 AMSI 绕过与 ETW 篡改取证分析文章。

#### Scenario: 文章编写成功
- **WHEN** 按照现有格式编写 AMSI/ETW 取证分析
- **THEN** 文章字数 ≥ 20,000 且 Hugo 构建通过

### Requirement: 凭据攻击链与 Kerberos 攻击取证分析文章
系统 SHALL 编写凭据攻击链与 Kerberos 攻击取证分析文章。

#### Scenario: 文章编写成功
- **WHEN** 按照现有格式编写 Kerberos 攻击取证分析
- **THEN** 文章字数 ≥ 20,000 且 Hugo 构建通过
