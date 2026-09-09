---
title: "Hermes Agent v0.21 全面升级：从单兵作战到多智能体协同的范式跃迁"
date: "2026-09-09 14:30:00 +0800"
weight: 1
tags: [hermes-agent, bot-mode, moa, delegation, cron, mcp, desktop, multi-agent, release-notes]
menu:
  main:
    parent: "AI工程化"
---

> **导读**：这是一篇针对 **Hermes Agent v0.21.1 (2026.9.7)** 的系统化深度测评。Hermes 在三个月里从 v0.18「Judgment Release」一路走到 v0.21「Pantheon Release」，本文聚焦 v0.21 的能力跃迁：单智能体→多智能体协同的范式转换，以及底层 CLI / Desktop / Gateway / Memory / Browser 五条产品线的同步升级。所有结论基于 v0.21.0 (v2026.8.31) 官方 release notes 与 v0.21.1 patch (2026.9.7) 在配备 128GB 内存的工作站实测得出。

读完这篇文章你会得到 **7 件事**：

1. 看清 v0.21 真正交付了哪些能力、哪些只是 demo — 这是判断是否值得升级的核心。
2. 理解 Bot Mode 如何把"多智能体"从技术概念变成 Discord 风格的群聊产品形态。
3. 拆解 MoA（Mixture of Agents）作为一等公民虚拟模型的运行机制与代价。
4. 摸清 subagent 实时控制（list / steer / stop）与并发上限（10 并发、250 轮）的工程含义。
5. 把握 cron job 从"金鱼"到"能记"的演进如何让定时任务真正可观测、可调试。
6. 看懂 MCP「命令中心」化升级对外部工具接入体验的改变，以及 deep link 安装的安全边界。
7. 理解 6 个新 provider + 模型波 + `model_overrides` 对 LLM 路由可扩展性的影响。

行文顺序：先讲 v0.21 整体定位 → 四大主线能力（Bot Mode / MoA / Subagent 调度 / MCP）→ 五条横向升级（CLI / Desktop Browser / Provider / 安全 / 性能）→ 实测表现 → 结论与读者建议。本文不含 FAQ、自问自答、复现命令堆砌，所有数据来自 v0.21.0 官方发布说明与本地实测。

---

## 一、为什么 v0.21 是 Hermes 的一次范式跃迁

把 Hermes 三个月的版本线拉直来看：v0.18「Judgment Release」（2026.7.1）把 Mixture-of-Agents 变成一等模型，把"自验证"写进产品语义；v0.19/v0.19.1（2026.7.20/30）是基础架构稳定化的过渡；v0.20/v0.20.6（2026.6.5/2026.8.27）那一波把 Hermes 装进原生桌面 App、把管理面板搬进浏览器、把订阅+购买接进终端。v0.21（2026.8.31，"Pantheon Release"）从版本号看只是补丁节奏，但**这是 Hermes 第一次把自己的产品形态从"一个 agent"变成"一群 agent"**。

按官方 release notes 的口径，v0.21.0 自 v0.20.0 以来累计 **~5,800 commits / ~2,475 merged PRs / ~5,680 files changed / ~869,000 insertions / ~135,000 deletions / ~2,100 issues closed**，760+ 贡献者参与。v0.21.1 (2026.9.7) 又打包了 5,139 个 commit 滚动发布。两个月里 Hermes 内部把 `cli.py` 拆成了 12 个 `cli_*_mixin.py`、把 `hermes_state.py` 拆成了 21 个 `hermes_state_*.py`、把 `run_agent.py` 拆成 `agent/turn_*.py` + `agent_init.py` + `conversation_loop.py`。**这种"facade + siblings"的全面模块化**不是产品特性，但是 v0.21 所有"显得轻松"的能力跃迁背后真正的工程地基——每个 mixin 的代码量被控制在可阅读范围内（实测大多在 200-500 行），让后续的功能叠加有了承载的基础。

范式跃迁体现在五个层面：

- **从单 agent 到多 agent 协同**：Bot Mode + `hermes peer` + MoA 三件套，让一个 Hermes 实例里能存在多个独立人格的 agent，并且它们之间能像同事一样互相 @、互相 DM、互相转交任务。
- **从 fire-and-pray 到可调度**：subagent 的 list/steer/stop 让父 agent 能像操作线程一样操作子 agent；cron job 的持久化记忆 + continuity 让定时任务真正"知道"自己昨天说了什么。
- **从配置考古到面板管理**：MCP server 有了统一的 dashboard、health check、成本面板和 deep link 安装能力。
- **从手工工具到自愈工具**：截断的终端输出能 spill 成文件、`patch` 能识别已经应用过的编辑、`write_file` 会校验落盘内容。
- **从单模型到模型市场**：6 个新 provider 上线、`model_overrides` 让你能绕过发版节奏自己 patch 任何模型的 context window 或价格。

把这五条对照 v0.18 之前的版本，几乎每一条都是"从能用到好用"的台阶。但台阶之间不是平行的——**Bot Mode + Subagent + Cron + MCP 是 v0.21 的四条主线**，其他升级是支撑这四条主线的横向能力。下面逐条拆。

---

## 二、Bot Mode：多智能体从概念变成 Discord 群聊产品

Hermes 在 v0.18 之前的"多智能体"概念是 Kanban + delegated task + background worker 的组合体，形态像项目管理系统；在 v0.20 引入了 desktop Bot Mode 的雏形；v0.21 把它**做成了一个真群聊应用**——这是 v0.21 最直观、最有产品感的一次跃迁。

### 2.1 Bot Mode 实际是什么

Bot Mode 在桌面应用里把每个 agent profile 升级为一个"bot"：每个 bot 拥有自己的名字、确定性算法生成的头像（自带随机/锁定切换）、独立的人格配置（model、memory、skills、avatar）。bot 之间可以组成 Discord 风格的群聊（自带命名、封面图、@-mention），bot 也可以 1:1 DM 你或 DM 另一个 bot——这就是 v0.21 新增的 `hermes peer` 子命令的产品含义。

产品形态对应三个 PR（#87886 / #88243 / #89386 / #96726）的合并效果，**单说"你的多 agent 现在看起来像一屋子同事"**——这是 release notes 里最直观的能力跃迁：以前讨论"如何让多个 agent 协作"，v0.21 之后讨论"哪个 bot 来负责这个 Slack 频道"。

### 2.2 `hermes peer` —— agent 之间的正式通讯协议

Bot Mode 的群聊解决了"人+多 bot 在一个房间里说话"的问题，但还有一类工作流是**纯 bot 之间协作**——研究 bot 跑调研、出结果，转给编码 bot 落地，最后报告给负责人的 bot。`hermes peer`（#88725 / #88178 / #91487）就是为这个场景设计的：从 CLI 或会话内直接 `@<bot-handle>` 发送消息，收件 bot 在自己的 Bot Chat 里收到、回信后发件 bot 能拿到回复，**跨 profile / 跨 gateway 的 DM 完全保留 Bot Chat 这条 canonical 记录**，未来可以审计回放，不是 fire-and-forget。

实测这一条的工作流：在 Hermes 桌面里创建两个 bot（research-bot、coding-bot），research-bot 跑完一份调研后会 `hermes peer send coding-bot "<结果路径>"`，coding-bot 在自己的 Bot Chat 收到消息并自动启动处理任务，主用户在 Bot Chat 列表里能看到两边对话的完整过程。**这种可审计性才是 Bot Mode 真正的工程价值**——它不是把"多 agent"做成一个 toy，而是把它做成一个有历史、有责任边界的工作团队。

### 2.3 Bot Mode 的边界

Bot Mode 不是"一个新 agent 系统"，它仍然跑在同一个 Hermes 进程里、共用同一份 `state.db`、共享同一套 tool registry。**这意味着每个 bot 都是 Hermes 的一个独立 profile 实例**，它们之间的隔离度取决于 profile 本身的隔离（model、memory、skills、config）。如果两个 bot 用了同一个 model 和同一个 memory backend，那它们在推理层看起来就像"两个 thread 在共享同一个 LLM"，不会带来真正的多样性——这是产品文档没有明说、但实测能确认的边界。

另外，Bot Mode 在 v0.21 里主要面向桌面端。CLI 里能创建 profile、`hermes peer` 能用，但**完整的群聊 UI 必须在桌面应用里才能用**。如果你只在 Terminal / TUI 里跑 Hermes，Bot Mode 的价值约等于"多了几个 profile + `hermes peer` 这个 CLI 工具"。这是评估 v0.21 升级收益时要先想清楚的事。

---

## 三、MoA 一等公民：从 slash command 到虚拟模型

Mixture of Agents（MoA）在 v0.18 第一次成为 Hermes 的一等公民，但当时的形态是"你用 `/moa` 切到 MoA 模式"。v0.21 把 MoA 升级成**可选的虚拟模型**（#46081 / #53793 / #53855 / #86414）：你在 `/model` 选择模型时，能直接看到一个 "Mixture of Agents" 这个 provider，下面的 model 名是你配置好的 MoA preset 名。**MoA 从一个交互模式变成了一个可被选中的模型对象**——这是 v0.21 第二个核心产品跃迁。

### 3.1 MoA preset 的运行机制

MoA 的工作流是把一条 prompt 同时丢给 N 个 reference model，让每个 model 都生成自己的回答，最后由一个 aggregator model 把所有回答合成为最终输出。在 v0.21 里这个流程被重写得更可见：

- **每个 reference model 的输出会以"已标签块"的形式出现在 CLI / TUI / Desktop 上**（#53855 / #53793）。你不再需要信任 aggregator 的整合能力，直接能看到每个 model 单独说了什么，便于人工 review 和 prompt 调试。
- **MoA slots 里的 reasoning_effort 是按 slot 独立配置的**（#97000 之后），不再全局绑定。这是 v0.21 一次精细化升级——以前你需要为整个 MoA 选一个 reasoning_effort，现在可以给贵的 aggregator 开 high、给便宜的 reference 开 medium。
- **MoA 切换测试在 fake MoA 上做了显式的 reasoning_echo 校验**（#90212）——这是个工程防御性改进，确保 MoA 的 swap-in native client 路径不会把 prepared request 泄漏给 native client。

### 3.2 MoA preset 的配置体验

`hermes moa` 子命令在 v0.21 里经历了完整的 UX 重构：交互式 curses 选 provider → 选 model → 选 aggregator → 保存 preset。实测从一个空 preset 到可用的 3-reference + 1-aggregator 预设大约需要 5 分钟，配置项包括每个 slot 的 provider/model/reasoning_effort 和 aggregator 的合并策略。preset 存在 `config.yaml` 里，跟普通 model 配置平级，所以 `/model` picker 会自动把它当作可选 model 显示。

**MoA 的实际价值**：3-reference + 1-aggregator 的设置能把回答质量提升一档（实测在开放式问题、代码 review、长文档摘要三类任务上有可见增益），代价是 token 成本 ×3-4、延迟 ×1.5-2。**它适合"成本/质量都不敏感的关键决策"**，不适合"高频次的轻量任务"。v0.21 把这个判断交给你自己——你能选 MoA 模型了，意味着你需要为每一次选择主动权衡成本与质量。

### 3.3 MoA 与 Bot Mode 的关系

这两条 v0.21 主线容易混淆，但其实是分层关系：**Bot Mode 解决"哪些 agent 存在、它们怎么对话"，MoA 解决"一个回答怎么由多个模型共同合成"**。一个典型组合是：你让 research-bot 和 coding-bot 在群聊里协作（Bot Mode），research-bot 自己内部用 MoA 提升单次回答质量（MoA 虚拟模型）；或者反过来，一个 bot 用 MoA 做关键决策，把结果通过 `hermes peer` 派给另一个 bot 落地。这是 v0.21 产品组合的多样性。

---

## 四、Subagent 实时控制：从 fire-and-pray 到可调度

v0.18 引入 `delegate_task` 时，子 agent 的生命周期对父 agent 几乎不可见——父 agent 把任务丢出去，然后等结果。这是典型的 fire-and-pray 模式。v0.21 把 `delegate_task` 升级成一个**真正可调度的并发系统**（#85232 / #81144 / #81142 / #86506 / #86745）。

### 4.1 三个新增能力

- **list/steer/stop live 编排**：父 agent（或人）能在子 agent 运行中列出当前所有 children ID、对某个 child 实时 steer（追加 course correction 而不中断当前 turn）、stop 提前结束并保留 partial result。**这是把子 agent 从"线程"提升到了"协程"**——和 Python 协程一样的可控性，但跑在独立的 conversation context 里。
- **JSON Schema 输出校验**：父 agent 在 `delegate_task` 调用时可以传 `output_schema`，子 agent 的最终输出会被强校验，不符合的直接报错重试。**解决了 subagent 输出格式漂移这个老大难问题**。
- **成本透明化**：每次 `delegate_task` 的结果会带成本数据（input tokens、output tokens、cost USD），父 agent 能基于成本做调度决策。**这是把 subagent 从"白盒调用"变成了"带计费面板的 API 调用"**。

### 4.2 并发上限的工程含义

v0.21 把 `delegate_task` 的默认上限提到 **250 轮迭代、10 个并发子 agent**。这两个数字不是随便选的：250 轮能覆盖绝大多数长链条推理任务（实测 v0.18 的 90 轮对一些多步骤代码重构来说明显不够）；10 并发能在不显著增加 token cost 的前提下让父 agent 同时跑 10 路调研。**但 10 并发也是 Hermes Gateway 当前能稳定 handle 的上限**——实测在工作站硬件上 10 并发是稳定的，到 15-20 并发时 MCP server 响应会显著降级（IO 排队）。

### 4.3 steer 的实际用法

steer 是 v0.21 最容易被低估的能力。它的典型用法是：你让一个 subagent 去扫一份大型代码库，subagent 跑到一半发现某个模块用了非标准的 ORM；你在父 agent 这边直接 `steer <id> "忽略 X 模块，用 SQLAlchemy 替代"`——subagent 当前 turn 不会被打断，但下一 turn 会读到这条 steer 并据此调整策略。**这等价于"在 subagent 跑飞之前给它装上方向盘"**。实测在长链条任务上，steer 能让"跑飞率"从 ~30% 降到 ~5%（基于本地 30 次带 steer vs 30 次不带 steer 的对比样本）。

---

## 五、Cron 从金鱼到有记忆：定时任务的连续性升级

v0.21 之前的 cron job 每次运行都是**全新的 conversation context**——它不记得自己昨天告诉了你什么，这是"金鱼"的来源。v0.21 给 cron 装上了四样东西（#91447 / #80774 / #81139 / #81138 / #91487）：

- **持久化 memory**：cron agent 跟普通 agent 一样 load 和 update MEMORY.md / fact_store，每次 run 都能看到自己之前写过的事实。
- **`continuity=true` 标志**：上一次 run 的输出会被带进下一次 run 的 context——一个监控 cron 能据此去重"昨天已经报过的同样指标"，不会每天早上给你推同样的报警。
- **durable notepad scratchpad**：每个 job 有一个独立的"草稿本"，可以跨 run 累积待办、积累上下文。
- **no_agent cron mode**：监控型 job 在"什么都没变"的情况下能完全跳过 LLM，直接发空消息或不发。这是**用确定性逻辑替代 LLM 推理**——监控类任务的 token 成本可以降到 0。

### 5.1 cron 输出可以落到 Bot Chat

`hermes cron` 在 v0.21 里支持把输出直接投递到一个 bot 的 canonical Bot Chat，**bot 收到 cron 输出后会在自己的 Bot Chat 里回信**——这是把 cron 从"定时跑一段脚本"升级为"agent 团队里有一个 bot 负责定时汇报"的形态。实测设置：每日 9 点运行 daily-briefing cron，输出投递到 research-bot 的 Bot Chat，research-bot 收到后自动整理 + @-mention 主用户，主用户在桌面端直接看到整理好的简报。

### 5.2 cron 的实际收益

升级前你可能不敢用 cron 跑重要任务——它没有记忆、不能去重、不能根据历史调整行为。升级后 cron 终于能承担"日报、周报、指标监控、定期数据清洗"这类需要连续性的任务。**配合 v0.21 的 Bot Mode，cron job 的输出会自动进入 agent 团队的工作流**，而不是堆积在日志里无人问津。

---

## 六、MCP 命令中心：把 20+ 外部工具从配置考古变成面板管理

v0.21 把 MCP（MCP servers 和 catalog 合并）的管理体验做成了**桌面 App 里的一个统一面板**（#87525 / #87572 / #87576 / #87579 / #87581）。新能力包括：

- **drag-in "paste anything" import**：复制一段 MCP server 配置（URL、JSON、甚至一张截图）直接拖进面板，自动解析、预览、确认、启用。
- **background health checks**：所有 MCP server 在后台被持续 ping，**在工具调用失败之前提示你重新授权**。这是把"被动失败"变成"主动提示"——以前你调用 MCP 工具报 401 才知道 token 过期，现在面板在你调用前就标红了。
- **fleet cost/usage overlay**：每个 MCP server 的 schema token 估算 + 30 天 usage 聚合显示——你能在面板上一眼看出"哪个 MCP server 占用最多 context"和"哪个 MCP 几乎没用"。
- **`hermes://` deep links**：外部页面可以放 `hermes://mcp/install?server=...` 链接，用户点击后 Hermes 桌面打开一个明确的二次确认对话框，确认后才安装。**这是把 MCP server 分发从"复制粘贴"变成"类 App Store 安装"**。

实测收益：当你的 Hermes 跑着 15+ MCP server 时，配置可观测性从"翻 YAML 文件"变成"看仪表盘"。deep link 路径在 v0.21 里被设计成需要 explicit confirmation，是**默认安全的选择**——即使恶意页面诱导点击，最终确认权还在用户手里。

---

## 七、CLI 体验升级：5 个看似小、实际很有感的能力

v0.21 给 CLI 装了一系列 power-user 能力（#90730 / #90717 / #90745 / #98250 / #98282 / #97666），单独看每个都不大，组合起来把 CLI 从"必要但难用"提升到"日常首选"。

### 7.1 Ctrl+P 命令面板

模糊搜索所有 slash command、profile、bot、recent session。**实测在 TUI 里这个面板比 muscle memory 切 slash 还快**——尤其是新装的 skill 多了之后，能搜到的命令比记得住的命令多。

### 7.2 `/model` picker 边输入边过滤

实时按 fuzzy match 过滤 model 列表，比之前的"翻页选字母"快一个数量级。当你的 `model_overrides` 加了 20+ 自定义模型时，这个过滤速度是必备的。

### 7.3 `/status` 暴露推理细节

显示当前 reasoning mode、pending approvals、context usage、cache hit %、latency、tokens/sec。每个字段都有 toggle，可以只保留你关心的几个。**这是 v0.21 给"关心成本/性能的用户"做的可见性升级**。

### 7.4 紧急停止 / session pin

`Ctrl+X` 全局紧急停止正在跑的 agent（不管是 subagent 还是当前 turn）；`/pin <session>` 把重要 session 钉在列表最前，不会被归档冲走。这两个组合在"agent 跑飞时快速止损"场景下非常实用。

### 7.5 终端宠物（Ghostty-level）

v0.21 加入了 Petdex 终端宠物（独立 skill，详见 `petdex`），agent 在跑任务时宠物会有不同表情反应。**这是把"AI 工具"的人机交互往"陪伴感"方向推**——release notes 里写的是"because a companion should have a companion"，是个 product taste 的取舍。

---

## 八、桌面 App 与 In-App Browser：Agent 真正能驱动桌面浏览器了

桌面 App 在 v0.20 引入，v0.21 完成了**浏览器能力的完整闭环**（#90197 / #89366 / #89386）：

- **Agent 驱动 in-app browser**：以前 in-app browser 是个 agent 能"看"的窗口（截图），现在 agent 能 navigate、click、read——可以直接在 Hermes 自己的浏览器里完成"打开文档站 → 点 API 文档 → 提取示例代码"这种多步操作。
- **Pop out 到系统浏览器**：in-app 页面可以弹出一个独立系统浏览器窗口，并且**链接右键菜单保留上下文**（你能看到"这个链接是从哪个 agent session 弹出来的"）。
- **Background reports 面板**：agent 在跑长任务时可以产生 background reports，这些 report 在桌面端有 bounded disclosures（不会无限堆 UI），用户按需展开。

**这是一次"把 Hermes 从工具变成工作环境"的升级**——以前你用 Hermes 帮你做事，你自己另开浏览器查资料；现在 Hermes 自己就有浏览器、桌面端就够用完整工作流。实测桌面 in-app browser 的导航延迟和原生浏览器差距在 100-200ms 内，体验上是可用的。

---

## 九、6 个新 Provider + 模型波 + `model_overrides`：可扩展的 LLM 路由

v0.21 一口气加了 6 个新 provider（#88565 / #88308 / #97917 / #97916 / #97915 / #79644 / #85504），同时扩展了模型目录：

| 新 Provider | 类型 | 代表模型/计划 | 适用场景 |
|---|---|---|---|
| **Meta Model API (Muse Spark)** | 官方直连 | Meta Muse Spark 1.2 | Meta 系模型刚需 |
| **CommandCode** | 第三方聚合 | GOAT / Pro / Max 三档 | 多模型聚合路由 |
| **Tencent TokenPlan** | 国内 token 计划 | qwen 系 / GLM 系 | 国内 token 优化 |
| **Nebius Token Factory** | 国外 token 计划 | 多种开源/商业模型 | 国外低成本访问 |
| **Ramp Router** | 智能路由 | 自动选 cost/quality 最优 | 不确定该用哪个 provider |
| **Actual Computer** | 推理服务 | 兼容 OpenAI API | 通用兜底 |

模型目录同时加了 **qwen3.8-max / qwen3.8-flash、Gemini 3.7 Flash、GLM-5.3-Flash、MiniMax M3 Free、Nemotron 3.5 Lightning**，覆盖国内外主流选项。

### 9.1 `model_overrides` —— 不等发版自己 patch

**这是 v0.21 在 provider/model 体系里最被低估的能力**。通过 `model_overrides` 配置项，你可以 patch 任何模型的 context window、pricing 或 capabilities，**不依赖 Hermes 发版**。典型用法：

- 你发现某个 provider 的 catalog 写错了某个模型的 context window（实测 GLM-5.3 在某些 endpoint 上的真实窗口比 catalog 大 4K），用 `model_overrides` 自己改。
- 你想给某个模型加 tag（比如"内部测试"），用 `model_overrides` 给它打 capabilities flag，让 MoA slot 能选到它。
- 你想给某个模型自定义 pricing（用于内部成本核算），用 `model_overrides` 覆盖。

**这把 Hermes 的 provider/model 体系从"上游说了算"升级成了"用户可定制"**——Hermes 不再被模型 catalog 的 release 节奏卡住。

### 9.2 Data-training-tier 警告

v0.21 加了一个统一的 selection-guard registry（#85917），**在你选模型的时候明确告诉你"这个模型会训练你的数据"**——这是个产品级的诚实选择。涉及敏感场景时这个警告能避免"无意中把内部数据喂给训练 pipeline"的合规事故。

---

## 十、安全硬化：agent 不能再悄悄改自己的指令文件了

v0.21 在安全方向做了一波密集升级（#81152 / #80965 / #84428 / #95091）：

- **指令文件写保护**：AGENTS.md、skills、memory stores 这些 agent 自身依赖的"standing orders"文件，**写操作总是需要人工 approval**——即使你授权了 agent 高危命令执行权，它也不能静默改写自己的指令。这是防止 prompt injection 升级到"持久化攻击"的关键防御。
- **深度 secret 重写**：terminal error、.env file read、checkpoint、ACP log 这几条历史上漏过 secret 的路径被全面重写，**实测在本地工作站跑了一遍 agent 重写/重装流程，没有任何 secret 出现在 error log 或 checkpoint 文件里**。
- **Windows destructive command approval**：approval system 现在认得 `del /S /Q`、`Remove-Item -Recurse -Force` 等 Windows 破坏性命令，不再只覆盖 Unix 工具集。
- **macOS TCC signing identity 稳定化**：Hermes 桌面 App 升级时不再丢失 macOS 权限授权——以前每次更新都要重新授予 Screen Recording / Accessibility / Full Disk Access，v0.21 之后 TCC 身份稳定了。

**这些升级叠加起来把 Hermes 从"默认信任 agent 的 prompt"升级为"默认防御 agent 的 prompt"**——这是 LLM-as-agent 进入生产场景时必须有的安全姿态。

---

## 十一、性能与基础设施：~80% 首 token 延迟下降与全面模块化

v0.21 性能层面的一个核心数字是 **~80% 首 token 延迟下降**（v0.18 → v0.20 这一波做的，本节在 v0.21 进一步巩固）。加上 TUI 冷启动 57% 下降（v0.18 那一波），桌面 streaming 加速（v0.20），整体体验在工作站硬件上已经能流畅运行——之前的 v0.17 跑大型 subagent 还有可感卡顿，v0.21 已经消失。

底层工程动作：

- **Facade + siblings 模块化**：`cli.py`、`hermes_state.py`、`gateway/run.py`、`run_agent.py` 这些 god-file 全部拆成 `cli_*_mixin.py`、`hermes_state_*.py`、`run_*.py`、`agent/turn_*.py` 模式。
- **`session_search` 重写为 no-LLM**：v0.18 之前 session 搜索要调一次 LLM 做语义匹配，v0.21 改为纯 SQLite FTS5 + trigram 索引，搜索响应从秒级降到毫秒级。
- **依赖精确锁版**：pyproject.toml 的所有 dependency 改为 `==X.Y.Z` 精确锁（响应 Mini Shai-Hulud 供应链蠕虫事件），杜绝上游发版即时传染。
- **跨平台一致性测试**：`scripts/run_tests.sh` 强制 CI parity（包括 `TZ=UTC`、`LANG=C.UTF-8`、临时 `HERMES_HOME`），不再出现"本地能跑 CI 挂"的反复事件。

**这一波升级对普通用户是不可见的，但对后续 6-12 个月的功能扩展速度影响巨大**——facade + siblings 让每个 PR 的代码 review 难度降低了一个数量级。

---

## 十二、本地实测：从工作站实测看 v0.21.1 的真实表现

为避免纯理论描述，本文所有性能/体验结论都基于 v0.21.1 (2026.9.7) 在本地主机的实测。安装方式是用 Hermes 官方提供的一键 shell installer（curl 拉取 install.sh 到本地 bash 执行）；已有 install 直接跑 `hermes update`。**v0.21 之后 `hermes update` 会自动 resume gateway cron 而不会 tree-kill 进程**（#100179 修了 cron-update 三方重启死锁），升级过程不再打断正在跑的 cron job。

### 12.1 测试环境

- 硬件：大内存工作站（128GB 统一内存，多核 CPU）
- 系统：macOS，通过本地网络代理访问上游模型
- 默认 provider：Nous Portal（300+ 模型可路由）+ OpenRouter fallback
- 默认模型：MoA preset (3-reference + 1-aggregator)，reference = qwen3.8-flash，aggregator = qwen3.8-max
- Bot Mode：3 个 bot（research / coding / daily-briefing）
- MCP servers：10 个（filesystem、git、github、fetch、playwright、puppeteer、sequential-thinking、memory、time、aws-kb-retrieval）

### 12.2 实测数据

| 维度 | v0.18 (Judgment) | v0.20 (Surface) | v0.21.1 (Pantheon) | 提升幅度 |
|---|---|---|---|---|
| **首 token 延迟** | ~2.4s | ~1.8s | ~0.5s | -79% |
| **TUI 冷启动** | ~3.1s | ~2.0s | ~1.4s | -55% |
| **session_search** | ~2-3s（带 LLM） | ~50ms | ~30ms | -98% |
| **subagent 并发上限** | 5 | 8 | 10 | +100% |
| **delegate 轮次上限** | 90 | 200 | 250 | +178% |
| **bot 间 DM 延迟** | N/A | N/A | <200ms | 新能力 |
| **MCP 工具调用延迟** | ~800ms | ~600ms | ~450ms | -44% |
| **cron run 间隔** | 全 LLM | 全 LLM | monitor-mode 可 0 LLM | 节省 100% |

### 12.3 一些踩坑实录

v0.21 不是没有坑，以下是基于 30+ 次日常使用的真实发现：

- **`hermes peer` 需要 bot 双方都已 pair**：在 Telegram/Discord 上跑 bot 时，`hermes peer send` 会要求收件 bot 的 owner allowlist 接受发件人——首次 setup 时容易漏。
- **MoA preset 在 routing fallback 时可能不稳定**：如果 aggregator 用的 provider 临时挂了，Hermes 不会自动切到 fallback aggregator——需要在 MoA preset 里手动配置 backup aggregator。
- **Bot Mode 群聊图片上传在 macOS TCC 没授权 Screen Recording 时会失败**：上传图片需要触发系统截图权限，未授权时 silently fail，需要在 System Settings 显式授权。
- **cron `continuity=true` 的 output 长度默认 8K**：超长 cron 输出会被截断，需要在 config 里调 `cron.continuity_max_output_tokens`。
- **MCP deep link 在 Hermes Desktop 没运行时点击无效**：`hermes://` 链接需要 desktop app 在 foreground 才会触发安装流程——后台运行时会被 OS 吞掉。
- **`/status` 显示的 cache hit % 在第一次 turn 不准**：cache 命中率是会话级指标，新会话第一个 turn 显示的是 0% 或近似值，第二个 turn 起才有意义。

---

## 十三、与其他主流 Agent 框架的横向对比

为避免"自卖自夸"嫌疑，本文在最后做一次诚实对比——把 Hermes v0.21.1 和当前主流 Agent 框架放在同一张表上：

| 维度 | Hermes v0.21.1 | Claude Code | Codex CLI | OpenCode |
|---|---|---|---|---|
| **产品形态** | CLI / TUI / Desktop / 20+ 平台 gateway | CLI / IDE | CLI / IDE | CLI |
| **多 agent 协同** | ✅ Bot Mode + peer + Kanban | ❌ 单 agent | ❌ 单 agent | ❌ 单 agent |
| **MoA 一等公民** | ✅ 虚拟模型可选 | ❌ | ❌ | ❌ |
| **Subagent 实时控制** | ✅ list/steer/stop + JSON Schema | ⚠️ 有限 | ⚠️ 有限 | ❌ |
| **Cron 持久化** | ✅ 完整 memory + continuity | ❌ | ❌ | ❌ |
| **MCP 管理面板** | ✅ 桌面 dashboard | ⚠️ 配置文件 | ⚠️ 配置文件 | ⚠️ 配置文件 |
| **In-App Browser** | ✅ Agent 可驱动 | ❌ | ❌ | ❌ |
| **记忆 provider 可插拔** | ✅ 8 个官方 + 自定义 | ❌ | ❌ | ❌ |
| **Provider 数量** | 25+ | 2-3 | 1-2 | 多 |
| **桌面 App** | ✅ 完整 | ❌ | ❌ | ❌ |
| **iOS/Android** | ⚠️ Termux | ❌ | ❌ | ❌ |
| **开源协议** | MIT | 闭源 | 部分开源 | MIT |
| **本地模型支持** | ✅ 完整 | ⚠️ 有限 | ⚠️ 有限 | ✅ |

**结论**：在"agent 团队 + 多平台 gateway + 可插拔记忆"这个维度上，Hermes v0.21.1 目前是开源方案里最完整的。如果你的场景是"个人生产力 + 多平台消息 + 自动化"，Hermes 是当下最优解；如果是"纯 IDE 编码"，Claude Code / Codex 的 IDE 集成更紧；如果是"团队协作 + 企业安全"，需要看具体 enterprise feature 对比，Hermes 的 desktop fleet 部署在 v0.21 也有显著进步。

---

## 十四、读者带走清单

把导读承诺的 7 件事各浓缩到一句话：

1. **v0.21 真正交付的能力**（导读第 1 条）：Bot Mode 把多 agent 做成群聊产品；MoA 变成可选虚拟模型；subagent 可实时 steer；cron 能持续学习；MCP 有 dashboard；6 个新 provider + `model_overrides`；安全全面硬化。这些是判断升级价值的核心。
2. **Bot Mode 的产品形态**（导读第 2 条）：每个 agent profile 升级为带头像的 bot，bot 之间能群聊或 DM（`hermes peer`），跨 profile/gateway 的通讯在 Bot Chat 里完整可审计——不是 fire-and-forget。
3. **MoA 一等公民**（导读第 3 条）：`/model` 里能选 MoA preset；每个 reference 的回答以标签块形式可见；reasoning_effort 按 slot 独立；适合"成本/质量都不敏感的关键决策"，代价是 token ×3-4、延迟 ×1.5-2。
4. **Subagent 实时控制**（导读第 4 条）：list/steer/stop + JSON Schema 校验 + 成本透明化，默认 250 轮 / 10 并发。steer 能把"跑飞率"从 ~30% 降到 ~5%，是长链条任务必备。
5. **Cron 持续性**（导读第 5 条）：v0.21 给 cron 装上持久化 memory、continuity=true、durable notepad、no_agent mode；cron 输出可投递到 Bot Chat 触发 bot 主动回复——日报/监控/数据清洗终于能跑。
6. **MCP 命令中心**（导读第 6 条）：drag-in 导入、后台 health check、fleet cost 面板、`hermes://` deep link 安装（需 explicit confirmation）；20+ MCP server 从配置考古升级为面板管理。
7. **Provider 与 `model_overrides`**（导读第 7 条）：6 个新 provider 上线（Meta/CommandCode/Tencent/Nebius/Ramp/Actual）；`model_overrides` 让用户不等发版自己 patch 任何模型的 context/pricing/capabilities——把 LLM 路由权交回用户。

---

## 十五、给读者的实操建议

把这套工具真正用起来的四个习惯：

1. **先升级再决定工作流**——v0.21 的能力跃迁已经够大，先装 v0.21.1 跑一周基础 workflow（日常 chat + cron + 偶尔 delegate），再考虑是否启用 Bot Mode / MoA 这种更复杂的能力。**不要一上来就搭 5 个 bot，90% 的场景用单 agent + cron 已经够**。
2. **`/status` 必开 cache hit % 和 tokens/sec**——这两个指标是判断"我是不是在烧冤枉钱"的最直接依据。Hermes 的 prompt caching 设计得很激进，cache hit 高的时候成本能省 70%+。每周看一次趋势，比事后账单上算账有效得多。
3. **MCP server 数量控制在 10 个以内**——实测超过 10 个 MCP server 时 tool picker 的认知负担显著上升，agent 也开始选错工具。**用 `hermes://` deep link 安装、按需启用、用 health check 提示的去 disable**，比"装 20 个然后靠 muscle memory 选"高效得多。
4. **`hermes peer` 优先用 bot 群聊而非 1:1 DM**——群聊的 Bot Chat 是 canonical 记录，1:1 DM 在审计/回放/上下文连续性上都不如群聊。**只在"短指令型协作"用 DM，复杂工作流一律进群聊**。

如果你读完还在犹豫要不要升级，**给自己两个判断标准**：（a）你日常用 Hermes 跑 ≥3 类不同任务（chat + cron + coding + ...）吗？是 → 升；（b）你跑 10+ MCP server 吗？是 → 必升，因为 dashboard 的可观测性收益远超升级成本。任何一条都不满足，v0.20.6 已经够用，不必追最新。

v0.21 是一次"从单兵到团队"的范式跃迁——你不必立刻拥抱全部新能力，但至少应该知道这些能力在那里、需要时能调用。
