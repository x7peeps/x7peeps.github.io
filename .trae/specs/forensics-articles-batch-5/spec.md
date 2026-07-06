# 取证分析深度文章第五批 Spec

## Why
`0x03取证分析` 目录下已有 80+ 篇文章，其中 15 篇达到 2 万字标准。需要继续按照相同模式编写新的高价值取证主题深度文章，补全 Linux 系统取证、社会工程学取证、网络协议取证等尚未覆盖的重要领域。

## What Changes
- 新增 3 篇深度分析文章，每篇 ≥ 20,000 字符：
  1. **Linux 系统入侵取证深度分析** — 覆盖 Linux 进程分析、日志体系（syslog/journal/auditd/auth.log）、文件系统取证（ext4/xfs/btrfs）、rootkit 检测（LKM/rootkit 工具包）、内存取证（LiME/Volatility3）、定时任务/SSH 密钥/包管理器投毒痕迹、容器逃逸取证、UTMP/WTMP/lastlog 分析
  2. **社会工程学攻击取证深度分析** — 覆盖钓鱼基础设施溯源（域名/邮件模板/落地页）、BEC 商务邮件欺诈取证、话术工程分析、OSINT 调查技术、社交媒体取证、深度伪造检测、物理社会工程学取证、内部威胁关联分析
  3. **网络协议滥用与流量取证深度分析** — 覆盖 DNS 隧道/C2/Exfil 检测、HTTP/HTTPS 隐蔽通道、SMB 横向移动流量特征、LDAP 攻击流量（BloodHound/DCSync）、RDP 攻击流量分析、ICMP 隧道、协议隧道嵌套检测、JA3/JA3S 指纹、TLS 证书异常检测
- 每篇文章遵循现有格式：10+ 章节、原理/工具/检测/案例/参考资料、Sigma 规则/狩猎脚本、Hugo 构建验证

## Impact
- Affected specs: 0x03取证分析目录下的深度分析系列文章
- Affected code: Hugo 静态站点构建

## ADDED Requirements

### Requirement: Linux 系统入侵取证深度分析文章
系统 SHALL 编写 Linux 系统入侵取证深度分析文章。
- **WHEN** 按照现有格式编写 Linux 系统入侵取证深度分析
- **THEN** 文章字数 ≥ 20,000 且 Hugo 构建通过

### Requirement: 社会工程学攻击取证深度分析文章
系统 SHALL 编写社会工程学攻击取证深度分析文章。
- **WHEN** 按照现有格式编写社会工程学攻击取证深度分析
- **THEN** 文章字数 ≥ 20,000 且 Hugo 构建通过

### Requirement: 网络协议滥用与流量取证深度分析文章
系统 SHALL 编写网络协议滥用与流量取证深度分析文章。
- **WHEN** 按照现有格式编写网络协议滥用与流量取证深度分析
- **THEN** 文章字数 ≥ 20,000 且 Hugo 构建通过
