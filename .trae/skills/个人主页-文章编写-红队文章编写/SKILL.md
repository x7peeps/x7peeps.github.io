---
name: "个人主页-文章编写-红队文章编写"
description: "x7peeps.github.io 红队渗透测试文章编写技能。涵盖边界设备/企业应用/中间件/邮件系统等红队攻击面文章的规划、调研、撰写与验证全流程。当用户要求编写红队文章、新增渗透测试内容、规划红队文章批次、或提到 04 渗透攻击目录文章编写时调用此技能。"
---

# 个人主页 - 红队文章编写

本技能定义了 x7peeps.github.io Hugo 安全博客中红队方向（渗透测试/漏洞利用）文章的完整编写规范。基于 50+ 篇实战文章经验沉淀，覆盖边界设备、企业应用、中间件、邮件系统、CI/CD 等完整红队攻击面。

---

## 一、站点结构

### Hugo 项目根目录
```
hugo-src/
  content/
    安全/
      渗透测试/
        04 渗透攻击/              ← 红队文章主目录
          _index.md              ← 目录入口（article_cards shortcode）
          {产品名}_{攻击类型}_CVE漏洞链利用技术.md
```

### 文章存放规则
| 文章类型 | 存放路径 | 命名规范 |
|---------|---------|---------|
| 红队渗透攻击文章 | `hugo-src/content/安全/渗透测试/04 渗透攻击/` | `{产品名}_{攻击类型1}_{攻击类型2}_{攻击类型3}_CVE漏洞链利用技术.md` |
| 目录入口 | `hugo-src/content/安全/渗透测试/04 渗透攻击/_index.md` | 仅含 frontmatter + `{{< article_cards >}}` |

### 文件命名规范
- 使用下划线 `_` 连接各部分
- 产品名使用英文（如 Microsoft_Exchange_Server、SonicWall_SMA_SonicOS、Jenkins_CICD）
- 攻击类型使用中文（如 认证绕过、缓冲区溢出、RCE、任意文件读取、供应链投毒）
- 以 `_CVE漏洞链利用技术.md` 结尾
- 示例：
  - `Microsoft_Exchange_Server_ProxyLogon_ProxyShell_ProxyNotShell_CVE漏洞链利用技术.md`
  - `SonicWall_SMA_SonicOS_SSLVPN_认证绕过_缓冲区溢出_RCE_CVE漏洞链利用技术.md`
  - `Jenkins_CICD_任意文件读取_Groovy_RCE_供应链投毒_CVE漏洞链利用技术.md`

---

## 二、文章规范

### 2.1 基本要求
- **行数**：800-1400 行（用 `wc -l` 验证）
- **章节数**：12-14 章（0x00 到 0x0B/0x0D）
- **面向读者**：红队渗透测试人员 / 安全研究员，内容面向成人读者
- **代码注释**：不要添加任何代码注释

### 2.2 Hugo Front Matter 格式

```yaml
---
title: "{产品名} {攻击类型1} {攻击类型2} {攻击类型3} CVE漏洞链利用技术"
date: {YYYY-MM-DD}T00:00:00+08:00
draft: false
weight: {递增值，当前序列 120+}
description: "深入分析 {产品名} 的 {漏洞1}（{CVE编号}）、{漏洞2}（{CVE编号}）、{漏洞3}（{CVE编号}）等完整攻击面，覆盖 {起始年份}-{结束年份} 年高危 CVE 漏洞链、后利用技术及蓝队检测与应急响应"
categories: ["安全","渗透测试"]
tags: ["{产品名}","{攻击类型}","{CVE编号1}","{CVE编号2}","{CVE编号3}","{漏洞类型}","{技术关键词}",...]
---
```

**weight 递增规则**：每篇文章 weight 递增 1，当前序列：
- 120: Palo Alto PAN-OS → 121: Fortinet FortiOS → 122: Cisco → 123: Microsoft Exchange → 124: SonicWall → 125: Jenkins
- 下一篇应为 **126**

**description 规范**：用一段话概括全文核心内容，覆盖所有主要 CVE 编号、漏洞类型、攻击技术，字数 100-200 字。

**tags 规范**：10-16 个标签，覆盖产品名、CVE 编号、漏洞类型（认证绕过/缓冲区溢出/RCE/SSRF 等）、技术关键词。

### 2.3 章节结构模板

每篇文章必须包含以下标准章节（十六进制编号）：

| 章节编号 | 必选/可选 | 内容 |
|---------|----------|------|
| 0x00 | **必选** | 攻击面总览（攻击面表格 + 产品定位 + 风险概述） |
| 0x01 | **必选** | 服务识别与版本探测（指纹识别 + 端口映射 + URL 路径 + Python 探测脚本） |
| 0x02-0x06 | **必选** | 核心漏洞章节（每个 CVE/漏洞链独立成章，含原理 + PoC） |
| 0x07 | **必选** | 后利用技术（凭据窃取 + 横向移动 + 持久化） |
| 0x08 | **必选** | 漏洞组合攻击链（3-4 条完整攻击链 + APT 组织 TTP 表格） |
| 0x09 | **必选** | 历史 CVE 漏洞时间线（按年份分组的 CVE 表格 + 漏洞类型分布统计） |
| 0x0A | **必选** | 蓝队检测与应急响应（日志分析 + 进程监控 + 应急响应清单） |
| 0x0B | **必选** | 安全审计清单（20-30 项检查项） |
| 0x0C | **可选** | 总结（核心问题归纳 + 防守方策略） |

### 2.4 每个漏洞章节标准内容

```markdown
## 0x0N {CVE编号} — {漏洞名称}

### N.1 漏洞原理

**CVSS**: {评分}（{等级}）| **CISA KEV**: {是否纳入}

**影响版本**: {产品} {版本范围}

**漏洞原理**: {详细的漏洞根因分析，包括：}
- 漏洞存在的组件/模块
- 触发条件和攻击向量
- 根本原因（代码层面/设计层面）
- 影响范围和危害

### N.2 PoC — {探测/利用}

\```python
import requests
import urllib3
urllib3.disable_warnings()

def exploit_{cve_id}(host, port=443):
    base_url = f"https://{host}:{port}"
    # ... PoC 代码 ...

exploit_{cve_id}("192.168.1.1")
\```
```

### 2.5 内容要素（每篇必含）

#### A. 攻击面总览表格
每篇文章开篇必须包含攻击面总览表格：
```markdown
| 攻击面 | 默认端口 | 风险等级 | 说明 |
|--------|---------|---------|------|
| {服务名} | {端口} | **严重/高危/中危** | {CVE编号} {漏洞描述} |
```

#### B. Python PoC 脚本
每个核心漏洞至少包含 1 个 Python PoC 脚本：
- 使用 `requests` 库（项目已使用）
- 包含 `urllib3.disable_warnings()` 禁用 SSL 警告
- 函数参数包含 `host` 和 `port`
- 打印探测/利用过程信息
- 仅用于**授权测试**

#### C. 攻击链图示
每篇文章必须包含 3-4 条完整攻击链，使用 ASCII 箭头格式：
```
CVE-XXXX-XXXXX (漏洞名称)
    ↓ {利用步骤描述}
CVE-XXXX-XXXXX (漏洞名称)
    ↓ {利用步骤描述}
{最终影响}
    ↓ {技术细节}
{战略价值}
```

#### D. APT 威胁组织 TTP 表格
```markdown
| 威胁组织 | 类型 | 使用的 CVE | 技术特征 |
|---------|------|-----------|---------|
| {组织名} | {国家级APT/勒索组织/僵尸网络} | {CVE编号} | {攻击特征描述} |
```

#### E. CVE 时间线表格
按年份分组，每年一个表格：
```markdown
### {年份} — {描述}

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-XXXX-XXXXX | {年份} | {评分} | {漏洞类型} | {影响描述} |
```

#### F. 蓝队检测章节
必须包含：
- 日志分析命令（grep/awk 等）
- 进程/行为监控方法
- KQL/Sigma 检测规则（如适用）
- 应急响应清单（带 `[ ]` 勾选框）

#### G. 安全审计清单
20-30 项检查项，使用 `[ ]` 格式：
```markdown
[ ] {检查项描述}
[ ] {检查项描述}
...
```

### 2.6 写作风格规范
- 中文撰写，**技术术语保留英文**（如 SSRF、RCE、NTLM Relay、Buffer Overflow）
- 每个漏洞都要有具体的 **Python PoC 脚本**
- 使用**表格对比分析**（攻击面总览、CVE 时间线、APT TTP）
- 使用**代码块**展示命令、脚本、配置
- 使用**层级标题**组织内容（h2 章节标题 + h3 小节标题）
- 章节编号使用十六进制：0x00, 0x01, 0x02, ... 0x0A, 0x0B, 0x0C, 0x0D
- 不要添加任何代码注释

---

## 三、调研流程

### 3.1 选题确定
1. 列出 `04 渗透攻击` 目录已有文章，排除重复主题
2. 选择尚未覆盖的高价值红队目标（边界设备/企业应用/中间件/邮件系统/CI/CD）
3. 确认 weight 值（当前最大值 + 1）

### 3.2 网络调研
使用 Task 工具启动多个 search 子代理并行调研：

```
子代理 1: 调研 {产品} 核心漏洞链（CVE 编号、CVSS、原理）
子代理 2: 调研 {产品} 近年 CVE（2023-2025）
子代理 3: 调研 {产品} 后利用技术与检测防御
子代理 4: 调研 {产品} APT 组织利用案例
```

### 3.3 调研内容要求
每个子代理返回：
- CVE 编号、CVSS 评分、影响版本
- 漏洞类型（CWE 分类）
- 漏洞原理（根因分析）
- 攻击向量（预认证/后认证）
- 已知 PoC / 在野利用情况
- CISA KEV 纳入状态
- APT 组织利用案例
- 检测方法和防御建议

---

## 四、编写流程

### 4.1 文章编写步骤
1. **创建文件**：按命名规范创建 .md 文件
2. **编写 Frontmatter**：title、date、weight、description、categories、tags
3. **编写 0x00 攻击面总览**：攻击面表格 + 产品定位
4. **编写 0x01 服务识别**：指纹识别 + 端口映射 + URL 路径 + Python 探测脚本
5. **编写 0x02-0x06 核心漏洞章节**：每个漏洞含原理 + PoC
6. **编写 0x07 后利用技术**：凭据窃取 + 横向移动 + 持久化
7. **编写 0x08 攻击链**：3-4 条完整攻击链 + APT TTP 表格
8. **编写 0x09 CVE 时间线**：按年份分组的 CVE 表格 + 类型分布统计
9. **编写 0x0A 蓝队检测**：日志分析 + 应急响应清单
10. **编写 0x0B 审计清单**：20-30 项检查项
11. **编写 0x0C 总结**：核心问题归纳 + 防守方策略

### 4.2 并行编写策略
可并行启动多个子代理编写不同文章：
```
子代理 A: 编写 {产品A} 文章
子代理 B: 编写 {产品B} 文章
子代理 C: 编写 {产品C} 文章
```

---

## 五、验证检查

### 5.1 文件验证
```bash
wc -l "hugo-src/content/安全/渗透测试/04 渗透攻击/{文件名}.md"
# 目标：800-1400 行

grep "^## 0x" "hugo-src/content/安全/渗透测试/04 渗透攻击/{文件名}.md"
# 确认 12-14 个章节
```

### 5.2 Hugo 构建验证
```bash
cd hugo-src && hugo --minify 2>&1 | tail -15
```
- 确认 `Total in X ms` 输出且无 ERROR
- WARN 级别的 deprecated 提示可忽略

### 5.3 内容质量检查
- [ ] 文件行数 ≥ 800
- [ ] 章节数 ≥ 12
- [ ] 包含攻击面总览表格
- [ ] 每个核心漏洞有 Python PoC
- [ ] 包含 3-4 条完整攻击链
- [ ] 包含 APT TTP 表格
- [ ] 包含 CVE 时间线（按年份分组）
- [ ] 包含蓝队检测章节
- [ ] 包含安全审计清单（20-30 项）
- [ ] Hugo 构建通过

---

## 六、已完成文章清单

以下为 `04 渗透攻击` 目录已完成的文章（不应重复编写）：

| weight | 文件名 | 主题 |
|--------|--------|------|
| 100 | PaloAlto_PAN-OS_GlobalProtect_认证绕过_RCE_SSLVPN_CVE漏洞链利用技术.md | Palo Alto PAN-OS |
| 110 | Fortinet_FortiOS_SSLVPN_堆溢出_认证绕过_CVE漏洞链利用技术.md | Fortinet FortiOS |
| 111 | Fortinet_FortiManager_认证绕过_RCE_CVE漏洞链利用技术.md | Fortinet FortiManager |
| 112 | Cisco_IOS_XE_认证绕过_RCE_CVE漏洞链利用技术.md | Cisco IOS XE |
| 113 | Cisco_RV系列路由器_认证绕过_RCE_CVE漏洞链利用技术.md | Cisco RV 系列 |
| 114 | Cisco_Secure_Access_认证绕过_CVE漏洞链利用技术.md | Cisco Secure Access |
| 115 | Zscaler_ZPA_ZIA_认证绕过_CVE漏洞链利用技术.md | Zscaler ZPA/ZIA |
| 116 | Check_Point_Quantum_认证绕过_RCE_CVE漏洞链利用技术.md | Check Point Quantum |
| 117 | Sophos_Firewall_认证绕过_RCE_CVE漏洞链利用技术.md | Sophos Firewall |
| 118 | F5_BIG-IP_认证绕过_RCE_CVE漏洞链利用技术.md | F5 BIG-IP |
| 119 | VMware_vSphere_ESXi_vCenter_虚拟化平台管理面打点与CVE漏洞链利用技术.md | VMware vSphere |
| 120 | Ivanti_Connect_Secure_SSLVPN_认证绕过_RCE_命令注入_CVE漏洞链利用技术.md | Ivanti Connect Secure |
| 121 | Citrix_NetScaler_ADC_Gateway_SSLVPN_缓冲区泄露_认证绕过_CVE漏洞链利用技术.md | Citrix NetScaler |
| 122 | OpenSSH_信号竞争RCE_ssh-agent_协议降级_用户枚举_CVE漏洞链利用技术.md | OpenSSH |
| 123 | Microsoft_Exchange_Server_ProxyLogon_ProxyShell_ProxyNotShell_CVE漏洞链利用技术.md | Microsoft Exchange |
| 124 | SonicWall_SMA_SonicOS_SSLVPN_认证绕过_缓冲区溢出_RCE_CVE漏洞链利用技术.md | SonicWall SMA/SonicOS |
| 125 | Jenkins_CICD_任意文件读取_Groovy_RCE_供应链投毒_CVE漏洞链利用技术.md | Jenkins CI/CD |

### 推荐的未覆盖选题方向
- **边界设备**: Juniper SRX、Riverbed SteelHead、Pulse Secure、Array Networks、Barracuda
- **企业应用**: Microsoft SharePoint、Microsoft Teams、Atlassian Confluence/Jira、GitLab
- **中间件**: Apache Tomcat、WebLogic、JBoss/WildFly、WebSphere
- **邮件系统**: Postfix、Sendmail、Dovecot、Zimbra
- **CI/CD**: GitLab CI、GitHub Actions、Azure DevOps、CircleCI
- **数据库**: MySQL、PostgreSQL、MongoDB、Redis
- **容器/K8s**: Docker Engine、containerd、Kubernetes API Server
- **云平台**: AWS IAM、Azure AD、GCP IAM

---

## 七、与蓝队技能的关系

本技能与 `个人主页-文章编写-蓝队文章编写` 技能互补：
- **红队技能**（本技能）：聚焦攻击面分析、漏洞利用、后利用技术，文章存放于 `04 渗透攻击` 目录
- **蓝队技能**：聚焦取证分析、检测规则、应急响应，文章存放于 `0x03取证分析` 和 `03 漏洞分析` 目录

两者共享：
- 相同的 Hugo 站点结构
- 相同的 Frontmatter 格式（categories、tags、description）
- 相同的写作风格（中文 + 英文技术术语）
- 相同的验证流程（wc 验证 + Hugo 构建）

差异：
- 红队使用十六进制编号（0x00-0x0D），蓝队使用阿拉伯数字编号（0x01-0x0A）
- 红队侧重 PoC 脚本和攻击链，蓝队侧重检测规则和取证分析
- 红队文章行数 800-1400，蓝队文章字符数 ≥ 20,000

---

## 八、质量标准总结

| 维度 | 红队渗透攻击文章 |
|------|----------------|
| 最低行数 | 800 |
| 章节数 | 12-14 |
| 章节编号 | 十六进制 0x00-0x0D |
| PoC 脚本 | 每个核心漏洞 ≥ 1 个 Python 脚本 |
| 攻击链 | ≥ 3 条完整攻击链 |
| CVE 覆盖 | ≥ 5 个 CVE 详解 |
| APT TTP | ≥ 1 个威胁组织表格 |
| 审计清单 | 20-30 项检查项 |
| 语言风格 | 中文 + 英文技术术语，无代码注释 |
