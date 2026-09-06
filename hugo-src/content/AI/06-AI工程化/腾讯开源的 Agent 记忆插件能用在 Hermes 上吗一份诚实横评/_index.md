---
title: "腾讯开源的 Agent 记忆插件，能用在 Hermes 上吗：一份诚实横评"
date: "2026-09-06 22:00:00 +0800"
weight: 0
tags: ["Agent", "TencentDB", "Hermes", "memory", "开源横评", "长期记忆"]
---

**导读**：2026 年 5 月腾讯云开源 **TencentDB Agent Memory**（[GitHub 仓库](https://github.com/TencentCloud/TencentDB-Agent-Memory)），上线不到 3 个月 GitHub Trending #1，最近又登顶 Hacker News 首页。官方 README 里写得非常漂亮——团队级记忆中枢、4 类资产、L0→L3 四层架构、61% Token 节省、PersonaMem 48%→76%…… 但**真实情况是**：这套系统的设计目标是"3-5 个 agent 团队共享"，而 Hermes / OpenClaw 这类**自动多 agent 平台**——`delegate_task` 派子 agent、kanban swarm 多 agent 并行、profile 多 bot 路由、async delegation 不阻塞父 chat——在 TencentDB 的 session init 机制里是"二等公民"：因为 TencentDB 用 header 预选 + bypass fallback 管 session，跟 Hermes 的"agent 自动管 session、自动切 profile"的运行模式不对齐。

这篇文章是给正在评估"agent 长期记忆"方案的读者写的——读完你会得到 4 件事：

- 看清 TencentDB Agent Memory 到底是什么（不是向量库、不是 RAG、不是单纯的事实抽取）
- 弄明白它和 Hermes 自带的 8 个 Memory Provider 比起来，到底强在哪、弱在哪
- 知道它在 Hermes 上的两个硬伤（**`x-task-id` 必填** + **`x-conversation-id` 静态手填**），以及为什么这两个问题不是 bug 而是设计取舍
- 拿到一份按使用场景划分的选型决策矩阵——你能直接用它判断"我该不该上 TencentDB"

行文顺序：先讲清楚名字撞车（这点不解决，90% 的人会搜错东西），再拆架构，再做横评，最后给决策。文末有"读者带走清单"和"给读者的实操建议"，可以跳过前面直接读结论。

---

## 0. 在你开始读之前：名字撞车

"腾讯开源的记忆插件"在 GitHub 上有至少 2 个候选，1 个混淆项。**不先讲清楚，90% 的人搜错东西**。

| 名字 | 是不是腾讯的 | 状态 | 角色 |
|---|---|---|---|
| **TencentDB Agent Memory** | ✅ 腾讯云数据库团队（2026-05 开源） | v2.0.0（2026-08-03 stable），GitHub Trending #1 | **本文主角** |
| **MemoryOS**（BAI-LAB） | ❌ 白家 AI 团队 | EMNLP 2025 Oral，学术原型 | 名字撞车，**不是腾讯的** |
| **memoryos.com**（同名商业产品） | ❌ 第三方公司 | 商业 SaaS | 与 BAI-LAB MemoryOS 无关 |
| 论文 arXiv:2506.06326 | BAI-LAB | 同上 | 学术原型论文 |

下面所有内容，**特指 TencentDB Agent Memory**。如果你之前搜的是 MemoryOS，那是另一回事——那个走的是"操作系统风格的三层存储"路线（短/中/长期记忆 + 段页式调度），技术栈完全不一样。

---

## 1. TencentDB Agent Memory 到底是什么

### 1.1 一句话定位

> 让 Agent 沉淀经验，让人专注创造。

这是腾讯云数据库团队（不是腾讯 AI Lab）在 2026-05-14 开源的项目。**协议 MIT、零外部依赖、本地默认**——这点和很多国内开源项目不一样，它是真的可以自部署、数据完全在自己机器上。

它的目标不是"存储所有对话"，而是回答三个问题：

1. **什么值得保留**——不是所有 token 都该存，L1/L2/L3 是逐层精炼的金字塔
2. **谁能用**——谁拥有、谁共享、谁能调用（不是 flat prompt）
3. **下次怎么少调但调得对**——预算化的检索，不是"丢进去向量库再相似度搜"

### 1.2 架构：4 类资产 + 4 层记忆

**4 类资产（Hub 层）**——给 Agent 装配的"装备"：

| 资产 | 来源 | 用途 |
|---|---|---|
| Chat Memory | 对话 | 跨会话用户理解 |
| Skill | 对话+工具调用 | 可复用的工作流（"how-to"） |
| Wiki | 文档 | 结构化知识页 + 链接图（受 Karpathy LLM Wiki 启发） |
| CodeGraph | 代码仓库 | 符号/调用/影响路径索引 |

**4 层记忆（数据层，对话内部）**——按抽象层级堆叠的金字塔：

| 层 | 存什么 | 何时用 |
|---|---|---|
| L0 Conversation | 原始对话（SQLite + JSONL） | 复盘原话/时间戳 |
| L1 Atom | 事实、偏好、约束、事件 | 精确召回 |
| L2 Scenario | 项目/场景知识块（Markdown 文件） | 恢复工作上下文 |
| L3 Core / Persona | 用户画像、稳定模式（`persona.md`） | 进入用户/团队上下文 |

理解这个架构最关键的一点：**上层带判断和方向，下层带证据和精度**。

- 当 Agent 需要"这个用户到底想要什么风格"，它查 L3（persona.md）
- 当 Agent 需要"上周三那个会议上敲定的端口号是多少"，它下钻到 L1 / L0
- **任何东西都不丢，不可逆压缩**——这跟传统"chunk + 向量库 + 相似度"的扁平模式本质不同

### 1.2.1 一张图看懂 TencentDB 架构

![TencentDB Agent Memory 4 层记忆 + 3 类资产架构图](/腾讯开源的-agent-记忆插件能用在-hermes-上吗一份诚实横评/01-arch.png)

### 1.3 部署形态

3 个 Docker 容器：

- `memory-core`（**8420 端口**）——记忆读写 + auth + skill/RAG 数据面
- `memory-hub`（**8125 端口**）——团队记忆控制台 UI + CodeGraph + Wiki
- `proxy`（**8096 端口**）——LLM 反向代理，同时支持 Anthropic 和 OpenAI 两种协议

**默认存储是本地 SQLite + sqlite-vec**，完全零外部 API 依赖。**启动一条命令**：

```bash
git clone https://github.com/TencentCloud/TencentDB-Agent-Memory.git
cd TencentDB-Agent-Memory/deploy/global-images
cp .env.example .env
./start-all.sh    # 跑完打印一行可直接粘贴到 Claude 的环境变量
```

装完浏览器开 `http://localhost:8125` 是控制台，团队/agent/task 全在那里管理。

### 1.4 基准数字（**全部厂商自报，未经第三方复现**）

| Benchmark | 无 TencentDB | 启用后 | Δ | 备注 |
|---|---|---|---|---|
| PersonaMem | 48% | **76%** | +59% | Tencent 自报 |
| WideSearch | 33% | 50% | +51.52% | Token 同步降 61.38% |
| SWE-bench | 58.4% | 64.2% | +9.93% | Token 降 33.09% |
| AA-LCR | 44.0% | 47.5% | +7.95% | Token 降 30.98% |

⚠️ **诚实约束**：这些数字目前**全部是腾讯官方自报**，没有任何独立第三方复现。Tencent 在自家 README 里也承认 "CodeGraph favors public HTTPS repos"、"Memory routing is manual"、"Asset routing is still iteration"。**PersonaMem 76% 这个数字要按"方向性参考"对待，不要当采购依据**。

为什么这个警告很重要？因为 agent 记忆这一行，**跨 vendor 的分数几乎不可直接对比**——不同 benchmark（LoCoMo / LongMemEval / PersonaMem / BEAM）、不同 harness、不同判分模型、不同对话规模。Mem0 在 LoCoMo 跑 68.5%，换个第三方独立测评就是 49.0%，差了 20 分。这种事你不知道就容易被某个数字带偏。

---

![TencentDB vs Holographic 对比](/腾讯开源的-agent-记忆插件能用在-hermes-上吗一份诚实横评/04-vs-holographic.png)

![短时记忆压缩流程：tool 输出 → offload → Mermaid 紧凑图](/腾讯开源的-agent-记忆插件能用在-hermes-上吗一份诚实横评/02-flow.png)

## 2. Hermes 集成现状：两个硬伤

这是本文最关键的一节——直接回答"能不能用在 Hermes 上"。

### 2.1 官方支持的 9 个 agent 框架

TencentDB 在 `agents/` 目录里有专门的接入文档，对 9 个 agent framework 一对一做了适配：

| Agent | 配置方式 | 接入路径 |
|---|---|---|
| Claude Code | env vars / `~/.claude/settings.json` | 文档最完整（主客户） |
| CodeBuddy | `~/.codebuddy/models.json` | 完整 |
| WorkBuddy | `~/.workbuddy/models.json` | 完整 |
| Codex | `~/.codex/config.toml`（⚠️ 首轮需 Plan mode） | 完整 |
| DeepSeek Harness (dsh) | `~/.dsh/settings.yaml` | 完整 |
| OpenCode | `~/.config/opencode/opencode.json` | 完整 |
| **Hermes** | `~/.hermes/config.yaml` + header 预选 | **次要适配** |
| OpenClaw | `~/.openclaw/openclaw.json` + header 预选 | 次要适配 |
| Pi | `pi-plugin` 扩展 | 完整 |

**Hermes 在这个表里是"次要适配"地位**——主客户是 Claude Code（INSTALL.md 整段都用 Claude Code 做示例），Hermes 和 OpenClaw 是后来补的次要目标。这点直接影响后面的设计决策。

### 2.2 Hermes 接入的配置长这样

```yaml
# ~/.hermes/config.yaml
model:
  default: deepseek-v3.2     # 或你想用的
  provider: custom
  base_url: http://<proxy-host>:8096/hermes/<spaceId>
  api_key: <业务用户的 sk-mem-... user_key>
  extra_headers:
    x-team-id: <从面板获取>
    x-agent-id: <从面板获取>
    x-task-id: <从面板获取>           # ⚠️ 当前必填
    x-conversation-id: <静态手填>      # ⚠️ 每次新对话要手动换
```

请求路径：`POST /hermes/:spaceId/v1/chat/completions`

### 2.3 第一个硬伤：`x-task-id` 必填

TencentDB 的 session 注册机制要求三个 header（`x-team-id` + `x-agent-id` + `x-task-id`）齐全才能走完整链路。**缺任何一个，proxy 会尝试弹 form 表单让用户选**——但 Hermes / OpenClaw 这种自动 agent 框架**根本没法响应 form**（不像 Claude Code 里有 SDK 的 AskUserQuestion 工具），结果就是 **session bypass**：请求透传到上游 LLM，**完全没有记忆注入，也没对话记录**。

后果是什么？**看起来"装好了但完全没生效"**——这是最难排查的失败模式。

Tencent 在 INSTALL.md 里明确写了"inconveniences"：

> 1. Users must create a Task in the admin panel beforehand and obtain the `task_id`, increasing onboarding friction.
> 2. Switching tasks requires manually editing the config file.
> **In the next version, we will make `x-task-id` optional.**

——roadmap 里承诺了，但**当前版本还没修**。所以你要是现在想上，每次切换任务都要：① 登控制台 ② 找到 task_id ③ 改 config.yaml ④ 重启 Hermes。这跟"无感多会话"的现代 agent 体验冲突很大。

### 2.4 第二个硬伤：`x-conversation-id` 静态手填

Claude Code / CodeBuddy 这些 Tencent 的主客户有 SDK 自动管 conversation ID，**Hermes 没有**。Tencent 的解决方案是：让用户**在配置文件里写死一个 `x-conversation-id`**。

后果：

> 1. **All requests sharing the same conversation ID belong to the same session** — memory injection and conversation recording are bound to this ID.
> 2. **Starting a new conversation requires manually changing the conversation ID**, otherwise the previous session state continues.
> 3. **Some clients may not carry extra headers on tool-call follow-up requests**, causing those turns to skip memory injection and conversation recording.

翻译：

- 同一个 ID 的所有请求共享同一个 session——如果你新开对话**忘了改 ID**，那 L1/L2 会串到上次的对话里
- 每次新对话必须**手动改 ID**（或者写脚本改）
- tool-call 后续请求如果客户端没自动携带 extra headers（Hermes 当前实现就这样），**那些轮次会被静默跳过记忆注入**——**Agent 自己都不知道自己有记忆漏洞**

第三个尤其隐蔽——你跑一段长链 tool call，前面几轮记起来了，后面突然没记住，debug 时很难想到是这个原因。

### 2.5 与 Claude Code 接入的对比

| 维度 | Claude Code | Hermes |
|---|---|---|
| session init 交互 | SDK 自动弹 `AskUserQuestion` 选 team/agent/task | **无交互表单，纯 header 预选** |
| `x-task-id` | 可选（用弹选） | **必填** |
| `x-conversation-id` | SDK 自动管 | **用户手填** |
| Plan mode / Default mode | 有 | **没有，要么全链路要么 bypass** |

这个差异不是 bug，是**设计哲学分歧**：

- 腾讯想做**企业级 session 控制**（你必须显式说"我在哪个 team / agent / task 下工作"——便于审计、权限控制、计费），session 由 header 静态决定
- Hermes / OpenClaw 想做**自动多 agent + 无感多会话**——`delegate_task` 派出去的子 agent、`kanban` 派的 swarm、`async_delegation` 起的并行任务，每个 agent 自己决定 context、session、profile，**用户和父 agent 都不需要手动填 header**

两种理念**在产品哲学层面对立**，不是腾讯写错了。**Hermes 在 delegate / kanban 里的子 agent 不会自动带上你配置文件里手写的 `x-team-id / x-agent-id / x-task-id` header**——这才是 TencentDB 当前版本在 Hermes 上"半成品"的真实原因。

> 一个具体的例子：Hermes 的 `delegate_task(goal="...", context="...")` 派一个 coder 子 agent 去实现功能，coder 子 agent 跑出来的对话是**独立的 Hermes session**，它**不会继承**父 agent 在 TencentDB 控制台里选的 `x-task-id`。结果要么 bypass（最坏）、要么 coder 子 agent 的记忆串到 reviewer agent 的 task 上（次坏）。TencentDB 的"团队任务边界"在 Hermes 的"自动多 agent"面前**结构性失效**。

![Hermes delegate_task 子 agent 在 TencentDB 上的 bypass 流程](/腾讯开源的-agent-记忆插件能用在-hermes-上吗一份诚实横评/03-hermes-limitation.png)

### 2.6 翻译成实际使用影响

| 限制 | 实际后果 | 严重度 |
|---|---|---|
| `x-task-id` 必填 | 切任务要改 config + 重启 | 🔴 高 |
| `x-conversation-id` 静态 | 新对话必须改 ID；否则 L1/L2 串到上段 | 🔴 高 |
| tool-call 后续请求可能丢 header | 中段几轮突然没记忆，**Agent 自己不知道** | 🟡 中 |
| `extra_headers` 任一缺失 → session bypass | 静默失败，看起来"装了没生效" | 🔴 高 |
| CodeGraph 仅支持公开 HTTPS 仓 | 私有仓"still being refined" | 🟡 中 |

> 所以结论是：**能用在 Hermes 上，但当前版本用在 Hermes 上是个"半成品"体验**。

---

## 3. 与 Hermes 自带 8 个 Memory Provider 的横向对比

Hermes 官方文档列出 8 个内置 memory provider（外加 1 个厂商配套 `memori`）。按场景分组列：

### 3.1 全景对比表

| Provider | 类型 | 协议 | 最强项 | 缺点 |
|---|---|---|---|---|
| **Holographic**（Hermes first-party / bundled） | 本地 SQLite + FTS5 + HRR 代数 | 本地 | 零依赖、亚毫秒检索、SQLite 单文件、Trust scoring + fact 冲突检测 | 不做 LLM 事实抽取 |
| **Hindsight**（Hermes bundled + 云/本地双模） | 结构化事实记忆（实体+关系） | 云/本地 | **BEAM 10M 64.1% SOTA**、LongMemEval 94.6%（第三方可验证） | 需 LLM 抽取 |
| **Mem0**（Hermes bundled） | 被动抽取层 | 云/自托管 | 多语言、跨框架、Apache 2.0、add()/search() 最简 | 写路径 LLM 调用贵 |
| **Letta** | OS 风格分层 | 自托管 | 代理自管 memory blocks | 整个 runtime 接管 |
| **Honcho** | 用户建模（Dialectic） | 云/自托管 | 个人化最强 | AGPL v3 |
| **RetainDB** | 混合向量+BM25+Rerank | 云 | 工程稳健 | $20/月起 |
| **ByteRover** | 知识树 Markdown | 本地/云 | 人可读、审计友好 | — |
| **Supermemory** | 全量相似度 | 云/本地 | LongMemEval #1（厂商自报） | — |
| **OpenViking** | L0/L1/L2 分层加载 | 本地 | 80-90% token 节省 | — |
| **TencentDB Agent Memory** | 4 层 + 4 类资产 + Hub | 本地/云 | 团队 ACL + CodeGraph + Wiki | **Hermes 上半成品**：与 `delegate_task` / `kanban` / `profile` 的自动多 agent 模式不对齐 |

> 重要提醒：**Hermes 不是"单 agent 框架"**。Hermes 原生提供 `delegate_task`（spawn 子 agent）、`kanban`（多 agent swarm 并行）、`profile`（一 install 多 bot 独立 memory/config/secrets）、`async_delegation`（子 agent 不阻塞父 chat）。它是**自动多 agent 平台**。所以下面"对比 TencentDB"时，要看 TencentDB 能否支持 Hermes 的自动多 agent 行为——答案是**当前版本不能**，详见 §2.5。

![Agent 记忆方案适配度热力矩阵：6 个 provider × 6 维度评分](/腾讯开源的-agent-记忆插件能用在-hermes-上吗一份诚实横评/05-matrix.png)

### 3.2 与 TencentDB 设计哲学最像的两个 —— 详细对比

#### Holographic（Hermes 内置）vs TencentDB

| 维度 | TencentDB | Holographic |
|---|---|---|
| 存储 | SQLite + sqlite-vec（+ 可选 TCVDB） | SQLite + FTS5 |
| 架构 | L0→L3 分层 + 4 类资产 + Hub | 单层 fact store + HRR 代数 |
| 写路径 | LLM 自动抽 fact、合成 scenario/persona | 用户手写 / 同步管线 |
| 检索 | BM25 + 向量 + RRF 融合，5 条/5s 超时 | FTS5 全文 + HRR 代数 `probe`/`reason`/`contradict` |
| 多 agent / 团队 | ✅（private/team/restricted/agent ACL） | ❌（单库，按 entity 分） |
| 部署 | 3 个 Docker + 反向代理 | 单文件 SQLite，**零依赖** |
| 独有优势 | Token 优化、Hub 控制台、团队 ACL、Wiki、CodeGraph | 零依赖、私密性、亚毫秒、Trust 评分、fact 矛盾检测 |
| 适用场景 | 小团队 3-5 个 agent 共享工作流（但 Hermes 自动多 agent 当前不支持） | **单人 / 单 bot / 隐私敏感 / 不需要跨 agent 共享** |

👉 **结论**：如果你是一个人用 Hermes，Holographic 更适合——**TencentDB 的 4 类资产 + 团队 ACL + CodeGraph 是给团队协作准备的，单人场景杀鸡用牛刀**。

#### Hindsight（Hermes 内置）vs TencentDB

| 维度 | TencentDB | Hindsight |
|---|---|---|
| 架构 | 4 层 + 4 类资产 | 结构化事实（实体+关系+observation） |
| BEAM 10M | **未参评** | **64.1%（#1）** |
| LongMemEval | 未参评 | 94.6% |
| PersonaMem 32K | 76%（厂商自报） | 86.6%（第三方验证） |
| LoCoMo | 未参评 | 89.6% / 92%（LoCoMo-10） |
| 成本 | 本地零依赖，但要 LLM 抽 L1/L2/L3 | Cloud $15/M retain + $0.75/M recall + $3/M reflect |
| 第三方验证 | ❌ 仅厂商自报 | ✅ agentmemorybenchmark.ai 公开 |

👉 **结论**：如果你想要"被验证过的大规模检索"，**Hindsight 更有底气**。TencentDB 没跑 BEAM，意味着在 10M token 级别时它的 L0→L3 检索是否还成立**没数据**。

### 3.3 外部参考：Mem0 / Letta / Zep 三种哲学

| 维度 | Mem0 | Letta | Zep/Graphiti | TencentDB |
|---|---|---|---|---|
| 哲学 | 被动抽取管线 | 代理自管 tier | 时序知识图 | 团队 Hub + 4 层 |
| 抽象层级 | Layer | OS | Graph | Layer + 资产 |
| 标杆分数 | LongMemEval 49.0%（独立）/ 94.4%（厂商） | LoCoMo 74.0%（GPT-4o mini） | — | PersonaMem 76%（厂商） |
| 治理 | — | — | 事实带 validity window | private/team/restricted/agent ACL |
| 接入门槛 | 最低（add() / search()） | 高（整个 runtime） | 中（需跑 graph DB） | 中（3 Docker + 反代配置） |

👉 **要点**：**跨 vendor 的分数不可直接对比**（不同 benchmark / 不同 harness / 不同判分模型）。看到任何一个数字单独出现，**都要先问"谁测的、用什么数据集、什么模型"**。

---

## 4. 决策矩阵：什么场景该用什么

下面是按你的场景给出的选型建议——你不需要懂所有方案的细节，只要回答"我是谁、我想要什么"，就能定位到推荐方案。

| 你的场景 | 推荐 | 原因 |
|---|---|---|
| 单人 + 隐私敏感 + 多会话持续累积 | **Holographic** | 本地、零依赖、SQLite 单文件 |
| 单人 + 想要最强检索 + 愿意付钱 | **Hindsight** | BEAM SOTA、第三方可验证 |
| 单人 + 想要最简单 + 偶尔用 | **Mem0** | add()/search() 两 API 完事 |
| 单人 + 想用 Hermes 原生体验 + 不要被新工具锁住 | **Holographic 或 Hindsight** | Hermes 开箱即用的 first-party provider，集成度最高，零迁移成本 |
| Hermes 自动多 agent（delegate_task / kanban / profile） | **当前先用 Hermes 内置** | TencentDB 还没支持 per-subagent header，等 v2.0.1+ |
| 显式多 agent 团队 + 共享知识 + 不差钱 | **TencentDB Agent Memory**（v2.0.1+ 再上） | 等 x-task-id 变可选 + subagent header 支持后再上 |
| 想做"个人 AI 伴侣"长期陪伴 | **Honcho** | Dialectic 用户建模，长期最贴人 |
| 想"代理自管 memory"哲学派 | **Letta** | OS 风格 tier |
| 想追可解释 / 时序事实 | **Zep / Graphiti** | 事实带 validity window |
| 想"知识树 + Markdown 可审计" | **ByteRover** | 可读、可审查 |
| 想"减少 LLM 调用成本" | **OpenViking** | L0/L1/L2 分层加载，80-90% token 节省 |

### 4.1 三个最容易踩的坑

**坑 1：被"厂商自报 76%"带跑**

TencentDB 自报 PersonaMem 48%→76%，但**没有任何第三方复现**。看到这种数字，先问 3 件事：

1. 谁测的？厂商自己还是独立第三方？
2. 用的什么数据集 / 模型 / 对话规模？
3. 完整方法论和复现脚本公开了吗？

一个都没回答 → **方向性参考**，不是采购依据。

**坑 2：以为"装上 = 起效"**

agent 记忆工具**静默失败**是常态——很多系统的设计是"装上但实际不生效"也不报错，只是不给你好处。TencentDB 在 Hermes 上的 `extra_headers` 任一缺失就会 session bypass（透传到上游、没记忆注入、没对话记录），但**请求照样成功**。

上任何 agent 记忆工具，**第一次装完必须用一次"验证剧本"**：故意问个只有记忆里有答案的问题，看 Agent 答不答得出来。

**坑 3：以为"换 provider 是无痛的"**

Hermes 的 `memory.provider` 是**单选**——切到 TencentDB 就把内置的 Holographic / Hindsight 关掉了。**没有"两个并存"模式**。这会带来几个迁移成本：

- 旧 provider 里积累的事实/标签/信任分**不会自动迁移**
- 旧的同步管线脚本（如果你写了）**全废**
- 不同 provider 的 API 完全不兼容，代码要重写

如果你只是想"试试"，用 Hermes 的 profile 隔离环境（`~/.hermes/profiles/tdai-test/`）跑，**主配置别动**。

---

## 5. 如果你决定在 Hermes 上跑 TencentDB —— 实操路径

如果你决定"先试一下"，按这个顺序走：

### 5.1 准备

```bash
# 前置：Node.js ≥ 22.16、本地有 OpenAI 兼容 LLM（DeepSeek/Qwen/Claude 均可）
node --version
# Hermes 本身已经在跑（~/.hermes/config.yaml 存在）
```

### 5.2 启动三件套

```bash
git clone https://github.com/TencentCloud/TencentDB-Agent-Memory.git
cd TencentDB-Agent-Memory/deploy/global-images
cp .env.example .env
$EDITOR .env       # 两组 LLM：memory 组 + proxy 组（可复用）
./start-all.sh     # 交互式，跑完打印一行可直接粘贴的命令
```

### 5.3 在控制台创建资源

1. 浏览器开 `http://localhost:8125`，用脚本打印的 admin key 登录（存于 `.admin-key`）
2. 创建 1 个 Team → 1 个 Agent（描述清晰，如 "code-reviewer"）→ 1 个 Task（如 "PR review daily"）
3. 拿到 `team_id` / `agent_id` / `task_id`，**记下来**

### 5.4 改 Hermes 配置

```yaml
# ~/.hermes/config.yaml
model:
  default: deepseek-v3.2
  provider: custom
  base_url: http://127.0.0.1:8096/hermes/default
  api_key: sk-mem-<业务用户 key>
  extra_headers:
    x-team-id: <team_id>
    x-agent-id: <agent_id>
    x-task-id: <task_id>
    x-conversation-id: conv-001-20260906   # 每次新对话换
```

### 5.5 第一次"验证剧本"

不要相信"装好了"——跑一次故意设计的问题：

```
你：上次我们讨论的那个 React 项目用的是哪个版本？
Agent：...（看是否答得出来）
```

如果答不出来或答得明显不对 → 99% 是某个 header 漏填，session bypass 了。`start-all.sh` 默认带 `PROXY_FULL_STACK=1`，如果你自己覆盖过，重启时把它开回来。

### 5.6 已知坑（提前预警）

| 坑 | 表现 | 解决 |
|---|---|---|
| `extra_headers` 任一缺 | 完全没记忆注入，**静默失败** | 4 个全填，并 print headers 验证 |
| `x-conversation-id` 不换 | L1/L2 串到上次 | 每次手动改（或写脚本化） |
| 业务用户的 `user_key` 没拿到 | "auth failed" | 创建后立即复制——**面板不会再显示完整值** |
| admin key 拿来用 | 2.0.0-beta.1 admin 不能 own 业务资产；从 2.0.0 stable 起 admin 可直接用 | 升级 stable；或建业务用户 |
| `promptMode=code` + 闲聊对话 | L1 抽不到东西（LLM 决定无事可存） | 改 `promptMode=chat`，或真干点活 |
| tool-call 后续请求不带 header | 中段几轮无记忆注入 | 短期只能忍；绕开方法：避免深度 tool 链 |
| CodeGraph 私有仓 | 索引不到 | 等 Tencent"still being refined"；或临时挂公开镜像 |
| v1.x / v0.x 升级 v2.0.0+ | 数据迁移 | `MemoryCore/scripts/migrate-v2-to-v3/` 提供工具 |

---

## 6. 几个常见疑问的快问快答

**Q：为什么腾讯要做 agent 记忆？**

Agent 长期记忆是 2026 年 agent 框架竞争的核心战场。Tencent 切的场景是**显式的多 agent 团队协作**——多个 agent 显式共享知识、ACL 权限管理、可审计的对话历史。**注意是"显式多 agent"，不是"Hermes 这种自动多 agent"**——TencentDB 的设计假设 agent 之间的边界是用户在控制台手动配置的（team / agent / task 三 ID），但 Hermes 的 `delegate_task` 是父 agent 在对话中**自动**派子 agent，session 边界是自动生成的。两者的"多 agent"**含义不同**，这是 §2.5 哲学分歧的根。

**Q：本地默认 + 零外部依赖，是不是真零依赖？**

启动后**不需要**腾讯云账号、不需要 TCVDB（向量库）。但 L1/L2/L3 抽取**每次都要打 LLM**，那个 LLM 走你配的 `MEMORY_LLM_*`（DeepSeek/Qwen/Claude 任选 OpenAI 兼容端点）——这是**唯一**的"外部"。

**Q：跟 Mem0 比呢？**

Mem0 是**单层 + add()/search() 两 API**，**最简单的 memory layer**。TencentDB 是**多层 + 资产 + Hub + 反向代理**，**完整的 memory system**。两者定位完全不同：Mem0 适合"我就要个能用的记忆"，TencentDB 适合"我要构建完整的 agent 知识体系"。

**Q：跟 Letta 比呢？**

Letta 是**整个 agent runtime**——你把你的 agent 跑在 Letta 里，Letta 管它的一切。TencentDB 是**外挂**——你的 agent 还是你的，TencentDB 只是帮你管记忆。**接管深度不同**。

**Q：跟 RAG 比呢？**

RAG 是"用相似度搜文档回答问题"。TencentDB 是"把对话历史/文档/代码组织成多层结构，按需召回"。**RAG 是 TencentDB 的一个组件**（在 L1 retrieval 那一层），不是替代品。

---

## 7. 一些更深的观察

### 7.1 为什么"4 层"是对的

扁平向量库的根本问题是：**没有"为什么"**——你搜出来一堆相似片段，但不知道为什么这些片段会被搜出来、它们之间什么关系、上下文是什么。

L0→L3 的设计哲学是：**所有压缩都保留回溯路径**。L3 是从 L2 聚合来的，L2 是从 L1 聚合来的，L1 是从 L0 抽出来的。任何一层出错，下钻就能找到原始证据。这跟 Git 的 commit chain 思想类似——**可逆、可审计、可回滚**。

### 7.2 为什么 Tencent 选了"团队 ACL"做差异化

市面上做"agent 记忆"的不少，但**几乎没人把权限管理做成第一类公民**——Mem0 / Letta / Zep 都是"个人/agent 维度的记忆"，团队怎么协作、谁能看谁的、Skill 怎么共享，全要用户自己拼。

TencentDB 的 `private` / `team` / `restricted` / `agent` 四级 visibility 是**这个产品的护城河**——不是技术护城河，而是**产品形态**护城河。要复制这套 ACL 模型不难，但要做成"装上就有"的体验，需要从 UX 到数据库 schema 重新设计。

### 7.3 为什么"无外部 API 依赖"是个聪明的卖点

国内做 toB 最大的门槛是**数据合规**——企业不愿意把对话数据传给任何第三方。TencentDB 默认本地存储、可选 TCVDB（自己的云），比"必须用 OpenAI/Claude"或"必须用 AWS S3"友好得多。这点在海外可能不重要，在国内 B 端是关键决策因素。

更进一步——TencentDB 把"模型选择"也做了抽象。你可以为 **memory 组**（内部 L1/L2/L3 抽取用）和 **proxy 组**（最终 agent 调用上游 LLM 用）配**不同**的模型：

```bash
# .env
MEMORY_LLM_BASE_URL=https://api.deepseek.com/v1    # 抽取用便宜模型
MEMORY_LLM_MODEL=deepseek-v3
PROXY_UPSTREAM_URL=https://api.openai.com/v1      # agent 用旗舰模型
PROXY_UPSTREAM_MODEL=gpt-5
```

这种"memory 用便宜模型、reasoning 用旗舰模型"的搭配，是真实生产里**成本可控**的关键。腾讯的 v2.0 还专门加了个 **Cost Guard** 功能——可以为不同 agent 分配不同的模型成本上限，**reviewer agent 用便宜模型、coder agent 用旗舰模型**，整套 squad 的 LLM 账单可控。

### 7.4 短时记忆和长时记忆的解耦

TencentDB 把"记忆"拆成了**两个独立子系统**：

- **短时记忆（symbolic short-term memory）**：单次任务内的工具日志压缩。**不持久化**到下次任务，重启就丢
- **长时记忆（4 层 + 4 类资产）**：跨会话、跨任务、跨 agent 的持久记忆

这套拆分的妙处：**短时记忆是性能优化**（减少上下文窗口压力），**长时记忆是认知积累**（让 agent 越来越懂你）。两者的目标完全不同，不该混在一个模型里。

短时记忆的工作机制值得展开：

```
原始 tool 输出（几万 token）
    ↓
offload 到 refs/<task_id>/<turn_id>.md 文件
    ↓
context 里只剩一个紧凑的 Mermaid 图（~2K token）
    ↓
需要细节时：grep node_id + result_ref → 拉原文
```

实测效果：长 agent loop 的上下文窗口压力降 60%+，**token 账单也跟着降**——这就是 §1.4 表里"WideSearch 节省 61% token"的主要来源。

但这有个前提：**Mermaid 图必须足够清晰**。如果你的工具调用链特别复杂（多分支、嵌套），压缩后的图可能丢失关键信息。这是 TencentDB 短时记忆的**当前已知短板**——它适合"主流工具调用"，对"超复杂多分支 agent workflow"的压缩质量还有提升空间。

### 7.5 检索的预算化（5 条 / 5 秒超时）

TencentDB 默认每次 recall 上限 **5 条 / 5 秒超时**——5 秒没出结果就**直接跳过注入**，不阻塞对话。

这条设计有两个值得说的点：

1. **"宁可不要，不要阻塞"**——agent 用户的对话延迟容忍度低，5 秒的 recall 等待对用户体验是毁灭性的。**5 秒超时 + skip injection** 是务实的工程选择
2. **结果数量的硬上限**——避免"召回 100 条但只用了 3 条"的浪费。**5 条是经验值**，覆盖绝大多数 agent 的决策需求，又不至于塞爆上下文

对比 Letta 的设计：Letta 是"agent 主动调 tool 取记忆"，**没有超时机制**，理论上可以无限调用。TencentDB 的"预算化 + 超时 skip"更接近**生产工程**——适合"agent 7x24 跑"的现实场景；Letta 的设计更接近**研究探索**——适合"agent 慢慢想最优解"的场景。

两种哲学各有所长，**没有绝对优劣**——看你跑的 workload 是什么。

### 7.6 一个反直觉的观察：为什么 TencentDB 没有专门做"图数据库"

你可能注意到了——TencentDB 的 L1 是 SQLite + sqlite-vec，**没有显式的图数据库**（不像 Zep/Graphiti 用 Neo4j）。但它也号称支持"实体关系"、"知识图谱"语义——这是怎么做到的？

答案是**降级到 markdown 文件 + 交叉引用**：

- L2 Scenario 是 Markdown 文件，文件间用 `[[wiki-style]]` 链接
- L3 Persona 是单个 `persona.md`
- 实体关系通过**字符串模式匹配 + LLM 抽取的 entity 标签**做轻量关联

这种"**文件即知识**"的设计哲学来自 Karpathy 的 LLM Wiki——他主张文档应该是 LLM 维护、人类可读、增量生长的活体，而不是死的图数据库节点。

**优点**：极简、人类可读、可 diff、可 git 版本管理、零依赖（不需要 Neo4j）

**缺点**：复杂多跳查询性能差（每次都靠 LLM 解析链接），不支持时序事实（不像 Graphiti 的 validity window）

TencentDB 在架构上选择前者——**用工程简单性换性能天花板**。对一个目标场景是"3-5 agent 团队"的产品来说，这个权衡是合理的。**如果你的场景需要"百跳关联查询"或"时序事实追踪"，这套设计撑不住，要换 Graphiti**。

---

## 8. 一个真实的"该不该上"决策剧本

最后用一段完整的决策推理，把前文的所有判断串起来。你可以直接对照这个剧本做自己的决策：

### 剧本 1：我一个人用 Hermes，跑自己的项目

- 你不需要团队 ACL（一个人没有 ACL 问题）
- 你不需要 CodeGraph（自己的小项目）
- 你可能需要 Wiki，但 Obsidian / Notion 够用
- 你的真实痛点是"agent 跨会话忘事"

→ **不要上 TencentDB**。直接用 Hermes 内置的 **Holographic**（零成本、零依赖、本地）。

### 剧本 2：Hermes 自动多 agent 协作（用 delegate_task 派 coder + reviewer，用 kanban 派并行任务）

- 你用 `delegate_task(goal, context)` 派出去多个子 agent（coder / reviewer / researcher），子 agent 自动并行、互不干扰
- 你用 profile 跑多个 bot（个人 bot + 工作 bot + 写作 bot）共享一个 Hermes install，各自独立 memory
- 你想把这些 agent 学到的工作流**共享**——比如 reviewer 学到的"检查清单"分享给 coder
- CodeGraph 跨 agent 复用：reviewer 看代码影响范围、coder 写实现，两者都用同一个 CodeGraph

→ **TencentDB 的目标场景之一**——多 agent 团队 + 共享资产 + ACL。但**当前版本在 Hermes 上有结构性硬伤**（§2.5 详细解释）：`delegate_task` 派出去的子 agent 是独立 session，**不会继承**父 agent 配置的 `x-team-id / x-agent-id / x-task-id`，要么 bypass、要么记忆串台。**建议等 TencentDB v2.0.1+ 把 `x-task-id` 改可选、并且支持 per-subagent header 注入后再上**。

### 剧本 3：5-10 人小团队用 agent 协作，公司有合规要求

- 数据不能出公司（合规）
- 团队需要共享知识但要权限控制
- 你愿意付 LLM 账单做 L1/L2/L3 抽取

→ **TencentDB 是这个场景的最佳选择之一**。本地默认 + 可选 TCVDB（自己云）+ 完整 ACL 模型 + Wiki/CodeGraph 全套。**这是 TencentDB 的目标场景**。

### 剧本 4：我做的是 agent 框架 / agent 产品（你要给别人用）

- 你需要"agent 记忆层"作为产品的一部分
- 你的客户对**记忆治理**有强烈需求
- 你愿意接受 TencentDB 的 MIT 协议 + 数据格式（可审查但私有）

→ TencentDB 是**候选之一**，但你可能更想要 Hindsight（结构化事实）、Mem0（add/search 简单 API）或自建（用 SQLite + FTS5 + 自定义 schema）。**TencentDB 的"重"对你可能是负担**。

### 剧本 5：我在做研究 / 论文，要对比 agent 记忆方案

- 你需要"被验证过的大规模检索"
- 你要在多个 benchmark 上独立跑分
- 你需要可复现的实验设置

→ 优先看 **Hindsight**（BEAM 10M #1、第三方可验证）或 **Holographic**（HRR 代数有理论深度）。**TencentDB 的"自报数字"对你的研究价值有限**——你需要的是独立 benchmark，不是厂商 benchmark。

---

## 9. 给读者的实操建议

### 9.1 如果你正在评估 agent 记忆方案

按这个顺序：

1. **先用 Hermes 内置的 Holographic、Hindsight 或 Mem0 任一个跑 1-2 周**——零成本，了解自己"对记忆的真实需求"（这 3 个都是开箱即用：Holographic = 本地 + 零依赖，Hindsight = 结构化事实，Mem0 = add/search 两 API）
2. **写下你的真实痛点**——是"上下文不够用"（→ 短时压缩）还是"agent 跨会话失忆"（→ 长期记忆）还是"多 agent 共享"（→ 团队 ACL）？**如果你的痛点是"Hermes `delegate_task` 派出去的子 agent 完成后，如何把成果带回父 agent"**——这不是一个 memory provider 能解决的问题，是 Hermes 自己的 subagent 协议问题（看 issue #344）
3. **带着具体痛点看决策矩阵**——选最小满足你痛点的方案，不要选"看起来最强的"
4. **用隔离环境试**——Hermes 的 profile 隔离、TencentDB 的独立部署，都允许你"装上看一眼"
5. **跑 3-5 个真实任务验证**——不要信"装上了"，要看"Agent 真的记住了"

### 9.2 如果你已经在用某方案，想换

切 provider 是**有成本的**——事实/标签/信任分不会自动迁移。**迁移前先想清楚**：

- 旧数据有多少？1K facts 内可以手动迁移，10K+ facts 要写脚本
- 旧方案有没有独家能力？比如 Holographic 的 `probe` / `reason` / `contradict` 在 TencentDB 里没有等价物
- 新方案的供应商锁定？TencentDB 数据格式是私有的，迁出不容易

### 9.3 如果你在选型时看到厂商数字

按这个清单做事实核查：

1. 谁测的？厂商还是独立第三方？
2. 公开了完整复现脚本吗？包括 dataset、prompt、judge model
3. 跨多个 benchmark 的分数都公布了吗？（单 benchmark 容易被挑）
4. 数字是同口径吗？（跨 benchmark 直接比较是陷阱）

任何一条答不上来 → **把那个数字当 0 处理**，不要让它影响决策。

---

## 读者带走清单

把导读承诺的 4 件事各浓缩到一句话：

**看清 TencentDB 是什么**（导读第 1 条）：腾讯 2026-05 开源的 MIT 协议 4 层记忆 + 4 类资产 + 团队 Hub，目标是企业级 agent 协作，不是"另一个向量库"。一句话：它是"agent 团队的中枢神经"，不是"个人 agent 的备忘录"。

**弄明白与 Hermes 8 个 provider 的对比**（导读第 2 条）：单人场景 Holographic / Hindsight 足够；3-5 agent 团队 + 真要共享 + 愿意等 v2.0.1 的 x-task-id 修复才考虑 TencentDB。一句话：**别拿企业级武器打单人的仗**。

**知道 Hermes 上两个硬伤的根因**（导读第 3 条）：`x-task-id` 必填和 `x-conversation-id` 静态手填不是 bug，是腾讯"显式多 agent（用户配置 team/agent/task 三 ID）" vs Hermes "自动多 agent（`delegate_task` 派子 agent，`kanban` 并行，`profile` 多 bot，`async_delegation` 不阻塞父 chat）" 的设计哲学冲突——两种"多 agent"含义不同。一句话：**TencentDB 的 session 边界假设是静态配置，Hermes 的 session 边界是动态生成，结构不对齐**。

**拿到选型决策矩阵**（导读第 4 条）：单人/隐私选 Holographic，单人/最强检索选 Hindsight，单人/最简单选 Mem0，团队协作选 TencentDB（等 v2.0.1+），个人 AI 伴侣选 Honcho，代理自管哲学选 Letta。一句话：**先回答"我是谁、要什么"，再选方案——别忘了 Hermes 内置的 Holographic / Hindsight / Mem0 已经能覆盖 80% 的单 agent 场景**。

## 给读者的实操建议

把这篇文章的判断真正用起来的 4 个习惯：

1. **先跑 3 次失败再说**——任何 agent 记忆工具，第一次装完都会"看起来工作"，但**第 1 次失败才知道它真不真**。失败不是问题，不知道什么时候会失败才是问题
2. **自己写"验证剧本"**——不要信厂商的"装上生效"，要自己设计一个只有记忆里有答案的问题，**Agent 答得出来才算数**
3. **看 benchmark 时数 3 件事**——谁测的、用什么 benchmark、跨多个 benchmark 都公布了吗？**任何一条答不上来，那个数字就当 0**
4. **隔离环境试错**——用 Hermes profile / 独立部署 / Docker compose 跑测试，**主配置别动**。agent 记忆工具的切换是有成本的，别在生产环境裸奔试

---

## 延伸阅读

读者可以按以下顺序扩展阅读——从官方一手资料开始，再到独立评测，最后到学术背景：

**官方一手**

- 腾讯云数据库团队官方仓库（含 README、INSTALL、v2.0.0 release notes）：https://github.com/TencentCloud/TencentDB-Agent-Memory
- Hermes 集成专属文档（含配置模板 + 已知限制 + 资产导入流程）：https://github.com/TencentCloud/TencentDB-Agent-Memory/tree/feat/server_team/agents/hermes
- MarkTechPost 官方解读（2026-05，含完整基准数字）：https://www.marktechpost.com/2026/05/23/tencent-open-sources-tencentdb-agent-memory-a-4-tier-local-memory-pipeline-for-ai-agents/

**第三方评测**

- andrew.ooo 实战评测（含 limitation 诚实总结、4 类资产使用感受）：https://andrew.ooo/posts/tencentdb-agent-memory-team-hub-review/
- Regolo.ai Hermes 接入实战（含架构图、tool 输出、上下文 token 对比）：https://regolo.ai/tencentdb-agent-memory-the-complete-guide-to-persistent-memory-for-hermes-and-openclaw-with-zero-data-retention/

**对比与学术背景**

- 学术原型 MemoryOS（名字撞车，**不是腾讯的**）：BAI-LAB/MemoryOS，arXiv:2506.06326（EMNLP 2025 Oral）
- Hermes 8 个 memory provider 官方对比页：https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers
- Holographic README（HRR 代数 + Trust scoring）
- Hindsight BEAM SOTA 公告：https://hindsight.vectorize.io/blog/2026/04/02/beam-sota
- BEAM 论文（"Beyond a Million Tokens"，测试 100K→10M 的真实检索）：arXiv:2510.27246
- 第三方独立对比（Mem0/Letta/Zep，含 45.4 分差距警告）：https://www.digitalapplied.com/blog/open-source-agent-memory-mem0-letta-zep-compared

**选型与决策参考**

- "数字不可直接对比"的论证：Mem0 自报 94.4% vs 第三方独立测评 49.0%，同样名字 benchmark 差 45 分——选型时不要单看一个数字
- "benchmark 设计差异"：BEAM 论文论证了 LoCoMo / LongMemEval 等老 benchmark 在百万 token 上下文窗口下已经"区分不出真记忆系统 vs 全量塞入"，新一代 benchmark（BEAM）才真正考验 memory architecture