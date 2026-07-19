---
name: "个人主页-文章编写-漏洞研究"
description: "x7peeps.com 安全漏洞分析专题文章全流程写作（选题→调研→撰写→验证→构建）。当用户要求撰写漏洞分析文章、新增漏洞专题、批量生产高危CVE文章、或继续下一批漏洞研究时调用此 skill。触发词：漏洞文章、漏洞研究、CVE分析、漏洞专题、继续写漏洞、下一批漏洞、vuln article。"
---

# 个人主页 - 漏洞分析专题文章全流程写作

为 x7peeps.com 安全知识库提供从选题规划、漏洞调研、文章撰写到 Hugo 构建验证的完整漏洞分析专题文章生产流水线。已积累 10 批次、59 个产品线、300+ CVE 的实战经验。

## 站点基本信息

- **站点根目录**: `/Users/pwndazhang/Library/Mobile Documents/com~apple~CloudDocs/6 开发项目/个人主页/x7peeps.github.io`
- **Hugo 源文件目录**: `hugo-src/`（所有操作在此目录下进行）
- **漏洞文章内容目录**: `hugo-src/content/安全/渗透测试/03 漏洞分析/`
- **产品线覆盖清单**: `hugo-src/content/安全/渗透测试/03 漏洞分析/常见高危RCE产品线清单.md`
- **主题**: hugo-theme-relearn（暗色变体 relearn-dark）
- **构建命令**: 在 `hugo-src/` 目录下执行 `hugo --gc --minify`
- **站点域名**: x7peeps.com（GitHub Pages 部署）

## 完整工作流

### Phase 0: 选题规划

1. 读取 `常见高危RCE产品线清单.md` 确认当前已覆盖的产品线
2. 识别尚未覆盖的高价值领域（优先选择：公网暴露广、预认证利用、已进入 CISA KEV、管理面/控制面接管价值高的产品线）
3. 将 3-4 个相关产品线归为一个批次（batch），形成主题聚类
4. 使用 `/spec` 模式创建 spec 文件，定义本批次的范围、任务分解和检查清单

### Phase 1: 并行调研（3 个方向同时启动）

使用 Task 工具并行启动 3 个研究子代理，每个子代理负责一个产品方向：

**调研要求**（每个方向）：
- 搜索 NVD、CISA KEV、厂商安全公告、GitHub PoC 仓库
- 对每个 CVE 整理：CVE 编号、CVSS 评分、漏洞类型（CWE）、受影响版本、修复版本、攻击向量、PoC 可用性、在野利用状态
- 优先选择 CVSS ≥ 7.0 且存在公开 PoC 或已在野利用的漏洞
- 每个方向至少收集 6-10 个 CVE

**调研输出格式**：
```
### CVE-XXXX-XXXXX — 漏洞简称
| 项目 | 详情 |
|---|---|
| **CVE编号** | CVE-XXXX-XXXXX |
| **CVSS评分** | X.X（等级） |
| **漏洞类型** | 类型（CWE-XXX） |
| **影响产品** | 产品名 |
| **影响版本** | 版本范围 |
| **修复版本** | 版本 |
| **攻击向量** | 远程/本地，认证/未认证 |
| **PoC可用性** | ✅/❌ |
| **在野利用** | ✅/❌ |
| **利用详情** | 技术细节 |
```

### Phase 2: 并行撰写（3 篇文章同时启动）

调研完成后，使用 Task 工具并行启动 3 个写作子代理。每个子代理负责一篇完整的专题文章。

**写作子代理的 prompt 必须包含**：
1. 完整的目录路径和 `_index.md` 创建指令
2. Hugo frontmatter 模板
3. 调研阶段收集的所有 CVE 数据
4. 文章结构要求（见下方「文章结构规范」）
5. 每个漏洞章节必须包含的元素清单
6. 字数要求（≥ 8000 字符）
7. 工作目录绝对路径

### Phase 3: 质量检查与修复

文章写完后，逐项检查 checklist：
1. 字数验证：`wc -c <文章路径>`
2. CVE 数量验证：`grep -c "CVE-" <文章路径>`
3. 必需章节验证：`grep` 搜索关键章节标题
4. Nuclei 模板验证：`grep "```yaml"` 计数
5. Python 脚本验证：`grep "```python"` 计数
6. 参考资料验证：`grep` 搜索参考资料章节

如有缺失，启动修复子代理补齐。

### Phase 4: 更新清单与构建验证

1. 更新 `常见高危RCE产品线清单.md`，新增本批次覆盖的产品线
2. 运行 `cd hugo-src && hugo --gc --minify` 验证构建通过
3. 确认页面数合理增长

### Phase 5: Git 自动提交与推送

构建验证通过后，**必须自动执行 git 提交和推送**：

1. **暂存本批次所有变更文件**：
   ```bash
   git add "hugo-src/content/安全/渗透测试/03 漏洞分析/[新目录]/"
   git add "hugo-src/content/安全/渗透测试/03 漏洞分析/常见高危RCE产品线清单.md"
   ```
2. **提交**（commit message 格式统一）：
   ```bash
   git commit -m "feat: 新增漏洞分析专题 Batch N — [方向A] / [方向B] / [方向C]"
   ```
   commit message 规则：
   - 使用 `feat:` 前缀（conventional commits）
   - 注明批次号（Batch N）
   - 列出本批次覆盖的 3 个产品方向
3. **推送**：
   ```bash
   git push origin main
   ```
   如果推送失败（如远程有新提交），先 `git pull --rebase origin main` 再重试推送
4. **验证**：确认 `git log --oneline -1` 显示最新提交

**注意**：
- 只暂存本批次相关的文件，不要 `git add .` 提交无关文件
- 如果构建产物（`public/` 目录）在 `.gitignore` 中则忽略，否则也一并提交
- 推送完成后向用户报告：提交哈希、提交信息、推送状态

---

## 文章结构规范

### 目录与文件组织

```
hugo-src/content/安全/渗透测试/03 漏洞分析/
├── 常见高危RCE产品线清单.md          # 总覆盖清单
├── 边界设备与安全网关/
│   ├── _index.md                     # 分类入口
│   └── XXX_边界设备高危攻击链专题.md   # 专题文章
├── 无线网络基础设施/
│   ├── _index.md
│   └── 无线网络基础设施高危攻击链专题.md
└── ...（其他分类目录）
```

### 分类入口 _index.md

```markdown
---
title: "分类名称"
date: 2026-07-03T14:00:00+08:00
draft: false
---
```

### 专题文章 Frontmatter

```yaml
---
title: "分类名称高危攻击链专题：厂商A / 厂商B / 厂商C 漏洞全解析"
date: 2026-07-03T14:00:00+08:00
draft: false
categories: ["渗透测试", "漏洞分析"]
tags: ["厂商A", "厂商B", "CVE编号", "RCE", "认证绕过", "漏洞分析"]
---
```

### 章节结构（十六进制编号）

```
0x00 专题概述
  - 概述段落（本专题覆盖范围、攻击面价值）
  - 覆盖漏洞一览表（CVE | 厂商 | CVSS | 类型 | 未授权利用）

0x01 厂商A 高危漏洞
  0x01.1 CVE-XXXX-XXXXX — 漏洞名称
    - 漏洞背景
    - 受影响版本/修复版本表格
    - 漏洞原理分析
    - HTTP PoC
    - Python PoC 脚本（```python 代码块）
    - Nuclei YAML 检测模板（```yaml 代码块）
  0x01.2 CVE-XXXX-XXXXX — 漏洞名称
    - （同上结构）

0x02 厂商B 高危漏洞
  （同上结构）

...

0xNN 公开 PoC 收集情况与利用思路
  - PoC 收集情况总表（CVE | GitHub PoC | Exploit-DB | Metasploit | Nuclei | 在野利用）
  - 关键 PoC 仓库链接
  - 防守型验证思路

0xNN+1 共性攻击模式分析
  - 模式1：名称 + 描述 + 代表 CVE
  - 模式2：名称 + 描述 + 代表 CVE
  - ...（至少 4-5 个模式）

0xNN+2 应急排查与防守建议
  - 紧急排查清单
  - 日志关键字段表
  - 紧急缓解措施
  - 长期安全加固建议

0xNN+3 参考资料
  - ≥ 8 条参考链接（NVD、厂商公告、安全研究博客、CISA 等）
```

---

## 写作规范

### 语言风格

1. **中英混排**: 技术术语保持英文（CVE、CVSS、RCE、PoC、Nuclei、CWE 等），解释用中文
2. **表格优先**: 版本信息、CVE 对比、PoC 状态等结构化信息优先使用表格
3. **代码完整**: PoC 代码必须完整可运行，不省略关键部分
4. **安全声明**: 文章开头或结尾包含免责声明

### 内容深度要求

- **字数**: 每篇专题文章 ≥ 8000 字符（通常 20,000-60,000 字符）
- **CVE 数量**: 每篇 ≥ 6 个 CVE
- **目标受众**: 安全工程师、渗透测试人员、红队成员
- **实战导向**: 每个漏洞必须包含可操作的 PoC 和检测模板

### PoC 代码规范

**HTTP PoC**：
```bash
curl -k -X POST "https://TARGET/api/endpoint" \
  -H "Content-Type: application/json" \
  -d '{"key": "malicious_value"}'
```

**Python PoC 脚本**：
```python
#!/usr/bin/env python3
"""CVE-XXXX-XXXXX 漏洞检测脚本"""
import requests
import sys

def check(target):
    """检测目标是否存在 CVE-XXXX-XXXXX 漏洞"""
    url = f"https://{target}/vulnerable/endpoint"
    # ... 检测逻辑
    return True/False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <target>")
        sys.exit(1)
    target = sys.argv[1]
    result = check(target)
    print(f"[{'+' if result else '-'}] {target}")
```

**Nuclei YAML 模板**：
```yaml
id: CVE-XXXX-XXXXX

info:
  name: 产品名称 - 漏洞名称
  author: x7peeps
  severity: critical/high/medium
  description: 漏洞描述
  reference:
    - https://nvd.nist.gov/vuln/detail/CVE-XXXX-XXXXX
  classification:
    cvss-metrics: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
    cvss-score: 9.8
    cve-id: CVE-XXXX-XXXXX
  tags: cve,cveXXXX,product,rce

http:
  - method: GET
    path:
      - "{{BaseURL}}/vulnerable/endpoint"
    matchers:
      - type: word
        words:
          - "vulnerable_indicator"
```

---

## 调研方法论

### 信息源优先级

1. **NVD (nvd.nist.gov)**: CVE 详情、CVSS 评分、CWE 分类
2. **CISA KEV (cisa.gov/known-exploited-vulnerabilities-catalog)**: 在野利用确认
3. **厂商安全公告**: 受影响版本、修复版本、官方描述
4. **GitHub PoC 仓库**: 公开利用代码
5. **安全研究博客**: Rapid7、Project Zero、各安全厂商分析
6. **Exploit-DB**: 公开 exploit

### 选题优先级矩阵

| 优先级 | 条件 |
|--------|------|
| P0 | CISA KEV + 在野利用 + CVSS ≥ 9.0 |
| P1 | 公开 PoC + 预认证 + CVSS ≥ 7.0 |
| P2 | 有 PoC 但需认证，或 CVSS 7.0-8.9 |
| P3 | 理论漏洞，无公开 PoC |

### 产品线聚类原则

将相关产品线归为同一批次，聚类依据：
- **同一技术领域**: 如网络设备（路由器/交换机/WLC）、备份系统、监控设备
- **相似攻击面**: 如 Web 管理界面、API 接口、固件层
- **互补漏洞类型**: 如认证绕过 + 命令注入 + 反序列化
- **攻击链可串联**: 如先认证绕过再 RCE

---

## 并行执行策略

### 批次执行模式

```
Phase 1: 并行调研（3 个 Task 子代理同时运行）
  ├── 研究方向 A: 产品线 A1/A2/A3
  ├── 研究方向 B: 产品线 B1/B2/B3
  └── 研究方向 C: 产品线 C1/C2/C3

Phase 2: 并行撰写（3 个 Task 子代理同时运行）
  ├── 写作任务 A: 文章 A（基于调研 A 数据）
  ├── 写作任务 B: 文章 B（基于调研 B 数据）
  └── 写作任务 C: 文章 C（基于调研 C 数据）

Phase 3: 质量检查（主代理执行）
  ├── 字数验证
  ├── CVE 数量验证
  ├── 必需章节验证
  └── 缺失修复（如需要，启动修复子代理）

Phase 4: 收尾（主代理执行）
  ├── 更新覆盖清单
  └── Hugo 构建验证
```

### 子代理 Prompt 模板

**调研子代理**：
```
Research [产品方向] high-severity vulnerabilities for security article writing.
Cover [厂商A] ([CVE列表]), [厂商B] ([CVE列表]), and [厂商C] high-severity CVEs.
For each CVE, provide: CVE number, CVSS score, affected versions, fixed versions,
vulnerability type, attack vector, PoC availability, and exploitation details.
Also search for any other notable [领域] vulnerabilities from 2020-2026.
Return all findings in Chinese.
```

**写作子代理**：
```
撰写[领域]高危攻击链专题文章。

**任务**：
1. 创建 `hugo-src/content/安全/渗透测试/03 漏洞分析/[目录]/_index.md`
2. 在同目录下创建主文章 `[目录名]高危攻击链专题.md`

**文章要求**：
- 字数 ≥ 8000 字符
- 覆盖 ≥ 6 个 CVE
- 必须包含：PoC 收集情况表格、Nuclei YAML 模板、Python 自动化脚本、
  共性攻击模式分析、应急排查与日志痕迹、修复与缓解建议、≥ 8 条参考资料

**Hugo frontmatter**：[提供完整 frontmatter]

**覆盖漏洞**：[列出调研阶段收集的所有 CVE 数据]

**文章结构**：[提供完整章节大纲]

工作目录：[绝对路径]
```

---

## 已覆盖产品线清单（截至 Batch 10）

### 已完成家族专题的产品线

| 批次 | 分类 | 产品线 |
|------|------|--------|
| 1-2 | 边界设备与安全网关 | PAN-OS, F5 BIG-IP, Cisco ASA/FTD, FortiOS, Citrix NetScaler, Check Point, Ivanti, SonicWall, Sophos/WatchGuard/Zyxel, Juniper JunOS |
| 3-4 | 文件传输与数据交换 | MOVEit, GoAnywhere, Accellion |
| 3-4 | 远程支持与 RMM | ConnectWise ScreenConnect, Kaseya, SimpleHelp |
| 5 | 邮件与协作 | Exchange, SharePoint, Confluence |
| 5-6 | CI/CD 与构建发布 | TeamCity, Jenkins, GitLab, GitHub Actions, ArgoCD |
| 6-7 | 数据库与中间件 | Oracle WebLogic, JBoss/WildFly, Apache Tomcat, WebSphere |
| 7 | 日志与 SIEM | Graylog, Wazuh, Security Onion |
| 7-8 | IT 运维与系统管理 | ManageEngine, SolarWinds, PRTG, Veeam, Commvault, Veritas, Rubrik |
| 8 | 网络基础设施 | BIND 9, Kea DHCP, Net-SNMP, FRRouting |
| 8 | 备份与灾难恢复 | Veeam, Commvault, Veritas NetBackup, Acronis, Rubrik, Dell PowerProtect |
| 8 | 打印与成像设备 | Xerox, HP, Brother, Konica Minolta |
| 9 | 无线网络基础设施 | Cisco WLC, Aruba AOS, Ruckus, Ubiquiti UniFi |
| 9 | 视频监控与物理安全 | Hikvision, Dahua, Axis, Milestone, Genetec |
| 9 | 终端管理与 MDM | SCCM, Jamf Pro, Workspace ONE, MobileIron |
| 10 | 边缘计算与Serverless平台 | Cloudflare Workers, Deno, Vercel Edge Runtime, AWS Lambda@Edge, Fastly Compute |
| 10 | 邮件客户端与MUA软件 | Thunderbird, Mutt, NeoMutt, Claws Mail, Sylpheed |
| 10 | 项目跟踪与工单系统 | Redmine, MantisBT, Gitea, YouTrack, Bugzilla |

### 待覆盖方向（供后续批次参考）

- 容器与编排安全：Docker, Kubernetes, containerd, Podman
- 身份认证与访问管理：Keycloak, Okta, Auth0, Ping Identity
- API 网关与服务网格：Kong, Envoy, Istio, Linkerd
- 云原生存储：MinIO, Ceph, GlusterFS
- 低代码/无代码平台：Appian, Pega, ServiceNow
- IoT/OT 平台：MQTT Broker, SCADA, PLC 固件
- 区块链与 Web3 基础设施

---

## 常见陷阱与经验总结

### 调研阶段

1. **CVE 编号验证**: 调研子代理可能编造不存在的 CVE 编号，写作前必须交叉验证
2. **版本信息准确性**: 受影响版本和修复版本必须来自厂商官方公告
3. **CVSS 评分来源**: 以 NVD 官方评分为准，厂商评分可能不同

### 写作阶段

1. **字数不足**: 子代理可能生成过短文章，必须验证 ≥ 8000 字符
2. **缺少必需章节**: 子代理可能遗漏 PoC 表格、Nuclei 模板、Python 脚本等
3. **格式不一致**: 确保十六进制编号（0x00, 0x01...）连续且无重复
4. **Frontmatter 错误**: tags 必须用列表格式，categories 必须包含 "渗透测试" 和 "漏洞分析"

### 构建阶段

1. **构建命令**: 必须在 `hugo-src/` 目录下执行，不是站点根目录
2. **页面数监控**: 每批次应增加 3+ 页面（3 篇文章 + 3 个 _index.md）
3. **编码问题**: 文件名使用中文，确保 UTF-8 编码

### 质量控制

1. **三篇文章并行检查**: 不要逐篇检查，而是全部写完后统一检查
2. **修复子代理**: 发现缺失时，启动专门的修复子代理补齐，不要修改整篇文章
3. **清单同步**: 每次完成批次后必须同步更新 `常见高危RCE产品线清单.md`
