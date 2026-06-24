# 安全渗透测试博客文章批量编写规范

## Why
用户正在持续构建一个高质量的安全渗透测试技术博客，需要按照已建立的工作流持续产出新的渗透攻击专题文章。博客目前已有 93 篇文章（`04 渗透攻击` 目录），最新 weight 为 116（Fortinet）。需要继续按照相同的工作流和格式产出下一批文章。

## What Changes
- 在 `04 渗透攻击/` 目录下继续创建新的渗透攻击专题 Markdown 文件
- 每篇文章遵循统一的 frontmatter 格式和章节结构
- 每篇文章完成后执行 Hugo 构建验证 → Git 提交 → 推送
- **BREAKING**: 无破坏性变更

## Impact
- Affected specs: Hugo 站点内容、Git 仓库
- Affected code: `hugo-src/content/安全/渗透测试/04 渗透攻击/` 目录

## ADDED Requirements

### Requirement: 文章格式标准
每篇文章 SHALL 遵循以下统一格式：
- YAML frontmatter: title, date, draft:false, weight (递增), description, categories, tags
- 章节结构: 攻击面总览 → 服务识别 → 漏洞利用 → PoC → CVE时间线 → 蓝队检测 → 应急响应 → 安全审计清单 → 总结
- 语言: 技术文档中文，代码/命令/技术术语保持英文

### Requirement: 工作流标准
每篇文章 SHALL 遵循以下工作流：
1. Grep 检查去重
2. Task 子代理研究
3. Write 写入文件
4. Hugo 构建验证
5. Git commit --only 提交单文件
6. Git push 推送

#### Scenario: 成功完成一篇文章
- **WHEN** 用户说"继续"
- **THEN** 选择未覆盖的主题，研究，写入，构建，提交，推送

### Requirement: 下一批候选主题
以下主题尚未覆盖，可按优先级选择：
1. Palo Alto PAN-OS GlobalProtect (CVE-2024-3400)
2. Cisco IOS/ASA/FTD 设备攻击面
3. Ivanti Connect Secure (CVE-2023-46805/CVE-2024-21887)
4. VMware vSphere/ESXi 攻击面
5. Citrix NetScaler ADC/Gateway
6. OpenSSH 漏洞利用技术
7. Microsoft Exchange (ProxyShell/ProxyLogon/ProxyNotShell)
8. Sonatype Nexus Repository
9. Progress MOVEit Transfer
10. GoAnywhere MFT

## MODIFIED Requirements
无

## REMOVED Requirements
无
