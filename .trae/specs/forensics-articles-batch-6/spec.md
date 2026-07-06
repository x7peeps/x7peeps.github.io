# 取证分析深度文章第六批 Spec

## Why
`0x03取证分析` 目录下已有 85+ 篇文章，其中 18 篇达到 2 万字标准。移动设备取证、macOS 取证、工控系统取证是三个尚未覆盖的重要领域，在移动办公普及和关键基础设施攻击频发的背景下具有极高的实战价值。

## What Changes
- 新增 3 篇深度分析文章，每篇 ≥ 20,000 字符：
  1. **移动设备取证深度分析（iOS/Android）** — 覆盖 iOS 文件系统与备份取证、Android 文件系统与分区取证、App 数据存储分析、SQLite 数据库提取、位置信息取证、通信记录分析、云同步数据取证、移动恶意软件分析、越狱/Root 检测、自动化取证工具链
  2. **macOS 系统入侵取证深度分析** — 覆盖 macOS 日志体系（unified log/ASL/WindowServer）、Gatekeeper/XProtein 绕过检测、LaunchAgent/LaunchDaemon 持久化、SIP 状态分析、XProtect/AMC 绕过取证、Keychain 取证、扩展属性与资源分支、APFS 取证、MDM 配置分析、macOS 恶意软件家族特征
  3. **工控系统(ICS/SCADA)取证深度分析** — 覆盖 PLC 取证、HMI 取证、历史数据分析师（Historian）、工业协议取证（Modbus/DNP3/S7/IEC 61850）、固件提取与分析、网络分段验证、安全仪表系统(SIS)取证、工控恶意软件分析（Stuxnet/Triton/Industroyer）、取证工具与安全约束
- 每篇文章遵循现有格式：10+ 章节、原理/工具/检测/案例/参考资料、Sigma 规则/狩猎脚本、Hugo 构建验证

## Impact
- Affected specs: 0x03取证分析目录下的深度分析系列文章
- Affected code: Hugo 静态站点构建

## ADDED Requirements

### Requirement: 移动设备取证深度分析文章
系统 SHALL 编写移动设备取证深度分析（iOS/Android）文章。
- **WHEN** 按照现有格式编写移动设备取证深度分析
- **THEN** 文章字数 ≥ 20,000 且 Hugo 构建通过

### Requirement: macOS 系统入侵取证深度分析文章
系统 SHALL 编写 macOS 系统入侵取证深度分析文章。
- **WHEN** 按照现有格式编写 macOS 系统入侵取证深度分析
- **THEN** 文章字数 ≥ 20,000 且 Hugo 构建通过

### Requirement: 工控系统取证深度分析文章
系统 SHALL 编写工控系统(ICS/SCADA)取证深度分析文章。
- **WHEN** 按照现有格式编写工控系统取证深度分析
- **THEN** 文章字数 ≥ 20,000 且 Hugo 构建通过
