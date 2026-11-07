---
title: "64k星的安全审计Agent技能包，Cloudflare开源"
date: "2026-11-07 23:50:00 +0800"
weight: 23
tags: [安全, Agent工程, 开源项目]
menu:
  main:
    parent: "安全"
---

让 AI 扫一遍代码找漏洞，产出往往是一堆"可能存在 XX 风险"的模糊告警，人还是要逐条人肉复核。Cloudflare 开源的 security-audit-skill（GitHub 上 64,121 星、MIT 协议）解决的就是这个问题：它把"安全审计"做成了一个结构化的 Agent 技能包，六阶段工作流跑完，产出的是机器可读、可独立验证、且诚实标注未决事项的发现记录。

这个仓库的来历值得注意：它是 Cloudflare 自己的漏洞发现 harness 的种子版本——Cloudflare 在博客《Build your own vulnerability harness》里描述过那个多阶段、全车队规模的系统，这个 skill 就是它长成大树之前的单仓库起点——它不是演示项目，是 Cloudflare 生产级漏洞发现系统的公开起点。

![cloudflare/security-audit-skill 仓库页，64,121 星](/security-audit-skill-article/src_repo_page.png)

*来源：github.com/cloudflare/security-audit-skill 仓库页面截图，2026-11-07 采集。*

## 六个阶段：从侦察到报告

工作流的骨架是六阶段，每阶段都有明确的产出物：

阶段一侦察：把目标代码库的架构、信任边界、输入面、既有证据映射成 `architecture.md` 和一份覆盖率账本 `coverage-ledger.json`。

阶段二覆盖率制导狩猎：从账本单元分配相互隔离的 hunter 子代理，记录每个检查，再用 coverage critic 找出还没覆盖的缺口。

阶段三候选验证：每一个唯一候选漏洞交给一个全新的验证者 agent，它的任务不是确认，而是证伪。

阶段四结构化输出：把发现写成 `confirmed`、`needs_validation`、`rejected` 三种记录，进 `findings.json`，按 `report-schema.json` 校验。

阶段五独立记录验证：又一批全新 agent 验证最终记录里的源码级声明；重大替换会再触发一轮独立验证。

阶段六中立报告：从已验证记录和覆盖率账本生成 `REPORT.md`、`FINDINGS-DETAIL.md`、`NEEDS-VALIDATION.md`。

仓库自带两个零依赖的 Node 校验器：`validate-coverage-ledger.cjs` 在账本创建和每次更新后运行，`validate-findings.cjs` 在第四阶段和第五阶段每次替换后运行。校验器的作用是让流程约束不依赖 agent 的自觉——记录格式不对，流程就过不去。

## 值得抄的两个设计

**覆盖率账本。** 大多数 AI 审计工具回答不了"它到底检查了什么、没检查什么"。这个技能包把覆盖情况做成一等公民：账本单元是狩猎的分配依据，critic 专职找覆盖缺口，多次运行是增量的——复用之前的账本和发现去补缺口、重验变更过的源码，而且明确不把过期或未决的工作当成"已覆盖"。README 给了一个诚实的数字：测试运行里，单次运行找到的漏洞大约是重复运行累计找到的一半。这句话反过来读也成立：想要更高覆盖，就得跑多轮并让账本累积。

**对抗性验证。** 设计原则里写死了两条：验证发现的 agent 永远不是发现它的 agent；只确认"已建立的边界失败"，源码依据不足的线索保持在 `needs_validation` 状态，附上精确的未决事实。

三种判定的边界也划得很清：`confirmed` 要有完整源码追踪和有界的观测结果；`needs_validation` 有精确的未决事实、不给严重度；`rejected` 记录被证伪的候选。"未决不评级"这条尤其值得所有做 AI 辅助审计的团队抄——模糊告警最大的成本就是让人猜严重度。

配套的原则还有两条很容易被忽略：严重度等于可能性乘影响，不是"偏离了检查清单"；纵深防御的缺口不算漏洞——如果 A 层已经挡住攻击，缺 B 层只是加固建议。这两条直接堵住了 AI 审计最常见的两类噪音：夸大严重度、把最佳实践缺失报告成漏洞。

## 部署前提：沙箱是硬要求，不是可选项

这个技能包对运行环境的要求写得毫不含糊：一个支持工具调用和并行子代理的编码 agent；Node.js 跑校验器；以及一个 OS 强制的沙箱——禁外网、白名单化的干净环境、资源限制、只允许写指定的 scratch 路径。最后一句话是关键设计：**如果这些控制做不到，工作流会把线索保持为 `needs_validation`，而不是执行目标代码**。

这条要求把使用场景划得很清楚：它要在你有隔离测试环境的前提下跑审计——目标代码的构建、测试、进程、浏览器都会被真的执行，没有沙箱就别跑。对个人开发者，一台跑虚拟机或容器的开发机就够；对团队，把它接进现有的隔离 CI 环境更合适。

狩猎阶段的覆盖面也超出一般"扫扫 Web 漏洞"的预期：仓库里按目标类型分了十几个专项文件——内存安全与二进制、AI 与 LLM（提示注入、agent 工具）、Web 协议与认证、客户端 DOM、供应链与发布、云与部署、RPC 与消息队列、资源耗尽与可用性、数据隔离与生命周期、桌面移动与本地 IPC。每个文件是一类目标的狩猎提示词集合。

## 怎么装、怎么用

安装走 Skills CLI：`npx skills add https://github.com/cloudflare/security-audit-skill --skill security-audit`，加 `--global` 装到用户级。

使用就是在编码 agent 里对着目标代码库说一句 "security audit this codebase" 或 "find security vulnerabilities in ./src"——请求命中触发词（安全审计、找漏洞、渗透测试代码等）时技能自动激活。完整审计模式的输出目录默认在 `~/security-audit-skill/<repo-name>/run-<N>`，工作流只在用户显式选择了版本控制忽略的目录时才往目标仓库里写文件。

适合谁：想给自研代码库做周期性安全审计、但又养不起专职红队的工程团队——它的价值不在"找到别人找不到的洞"，而在审计过程可复现、发现可验证、未决事项诚实标注。不适合谁：指望一条命令出渗透测试报告的场合——它需要沙箱环境、多轮运行和人来复核 `needs_validation` 清单，这些环节省不掉，设计上也不打算让你省。

技能包形态的安全审计正在变成一个公开的参考赛道。这个仓库最值得研究的不是它找到什么洞，而是它怎么让 AI 的审计产出变得**可验证**——这套账本加对抗验证的模式，可以直接搬到任何"AI 产出需要人工信任"的场景。

### 参考来源

- GitHub 仓库页 cloudflare/security-audit-skill（github.com，Stars 64,121 / Forks 4,158 / MIT，采集于 2026-11-07）
- Cloudflare 博客《Build your own vulnerability harness》（blog.cloudflare.com，链接引自仓库 README，未逐字下载）
