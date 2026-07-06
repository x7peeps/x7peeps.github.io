# 取证分析深度文章第三批 Spec

## Why
`0x03取证分析` 目录下已有 17 篇达到 2 万字标准的深度分析文章。需要继续按照相同模式（10+ 章节、原理/工具/检测/案例/参考资料、Sigma 规则/狩猎脚本、Hugo 构建验证）编写新的高价值取证主题深度文章，补全当前取证知识体系中尚未覆盖的重要技术领域。

## What Changes
- 新增 3 篇深度分析文章，每篇 ≥ 20,000 字符：
  1. **NTFS 交错数据流与高级文件系统取证分析** — 覆盖 ADS 原理与攻击、NTFS 元数据取证、文件系统时间戳深度分析、隐藏数据检测与恢复、文件系统级 Rootkit 取证
  2. **Windows Defender 绕过与 EDR 对抗取证分析** — 覆盖 Defender 架构与扫描机制、各类绕过技术（AMSI/ETW/排除目录/策略篡改）、EDR 绕过技术、安全产品日志分析、取证特征识别
  3. **容器与 Kubernetes 环境取证分析** — 覆盖 Docker 容器取证（镜像分析/日志提取/网络流量）、Kubernetes 审计日志分析、etcd 数据提取、容器逃逸痕迹、云原生环境 IOC 提取
- 每篇文章遵循现有格式：10+ 章节、原理/工具/检测/案例/参考资料、Sigma 规则/狩猎脚本、Hugo 构建验证

## Impact
- Affected specs: 0x03取证分析目录下的深度分析系列文章
- Affected code: Hugo 静态站点构建

## ADDED Requirements

### Requirement: NTFS 交错数据流取证分析文章
系统 SHALL 编写 NTFS 交错数据流与高级文件系统取证分析文章。

#### Scenario: 文章编写成功
- **WHEN** 按照现有格式编写 NTFS/ADS 取证分析
- **THEN** 文章字数 ≥ 20,000 且 Hugo 构建通过

### Requirement: Windows Defender 绕过取证分析文章
系统 SHALL 编写 Windows Defender 绕过与 EDR 对抗取证分析文章。

#### Scenario: 文章编写成功
- **WHEN** 按照现有格式编写 Defender/EDR 对抗取证分析
- **THEN** 文章字数 ≥ 20,000 且 Hugo 构建通过

### Requirement: 容器与 Kubernetes 取证分析文章
系统 SHALL 编写容器与 Kubernetes 环境取证分析文章。

#### Scenario: 文章编写成功
- **WHEN** 按照现有格式编写容器/K8s 取证分析
- **THEN** 文章字数 ≥ 20,000 且 Hugo 构建通过
