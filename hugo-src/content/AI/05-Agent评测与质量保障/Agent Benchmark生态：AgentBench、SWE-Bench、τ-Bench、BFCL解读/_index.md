---
title: "Agent Benchmark 生态：AgentBench/SWE-Bench/τ-Bench/BFCL 解读"
weight: 3
tags: [Benchmark, AgentBench, SWE-Bench, τ-Bench, BFCL, 评测基准]
menu: 
  main: 
    parent: "Agent 评测与质量保障"
---

## 为什么需要系统理解 Benchmark 生态

在上一篇 [Agent 评测方法论](../Agent评测方法论：维度设计、指标体系与评测框架/) 中，我们构建了评测维度与方法论的抽象框架。但在工程落地时，开发者面临一个具体问题：**用什么 Benchmark 来评测自己的 Agent？**

截至 2025 年，Agent Benchmark 已经从零星的学术尝试演化为一个层次分明的生态系统。不同 Benchmark 之间在评测对象、交互模式、评估方法、计算开销等维度上差异巨大。选错 Benchmark 可能导致"在错误的维度上追求优化"——比如用单轮函数调用 Benchmark 来评估一个需要多步推理和对话管理的客服 Agent。

本文的目标是建立一个**系统性的分类框架**，然后逐一深入四个最具影响力的 Benchmark，最后给出选型建议和垂直领域设计指南。

---

## Benchmark 分类体系

在深入具体 Benchmark 之前，有必要建立一个四维分类框架，帮助开发者快速定位某个 Benchmark 测的是什么、适不适合自己。

### 维度一：通用 vs 垂直

| 类型 | 特征 | 代表 |
|------|------|------|
| **通用 Benchmark** | 跨领域评测 Agent 通用能力 | AgentBench, HELM, BIG-bench |
| **垂直 Benchmark** | 聚焦特定领域的深度评测 | SWE-bench（软件工程）, τ-Bench（企业服务） |

通用 Benchmark 的价值在于横向对比不同模型的"底座能力"，但无法替代对特定领域深度的验证。如果你在构建一个代码修复 Agent，SWE-bench 的结论远比 AgentBench 有参考价值。

### 维度二：静态 vs 交互

| 类型 | 特征 | 适用场景 |
|------|------|---------|
| **静态评测** | 给定输入，评测输出，不涉及环境交互 | 文本生成、函数调用格式验证 |
| **交互式评测** | Agent 在环境中执行动作，环境给出反馈 | Web 导航、数据库操作、工具调用链 |

静态评测的优势是可复现、低成本，但无法捕捉 Agent 在动态环境中的适应能力。交互式评测更接近真实部署，但环境搭建和评测成本显著更高。

### 维度三：离线 vs 在线

| 类型 | 特征 | 优势 | 劣势 |
|------|------|------|------|
| **离线** | 使用预收集的固定数据集 | 可复现、成本可控 | 数据陈旧、无法反映新场景 |
| **在线** | 使用实时生成的环境和数据 | 反映最新能力 | 成本高、难以复现 |

### 维度四：单轮 vs 多轮

| 类型 | 特征 | 代表 |
|------|------|------|
| **单轮** | 一次输入-输出即可完成评测 | BFCL Single-Turn, HumanEval |
| **多轮** | 需要多步交互、状态管理 | AgentBench, τ-Bench, BFCL Multi-Turn |

多轮评测的核心挑战在于**状态管理**和**错误传播**——Agent 在第 3 步犯的错误可能导致第 5 步完全偏离目标。这是静态单轮评测无法捕捉的能力维度。

### 分类全景

```
                    ┌──────────────────────────────────────────┐
                    │           Agent Benchmark 分类体系         │
                    └──────────────────────────────────────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              │                          │                          │
        ┌─────▼─────┐             ┌──────▼──────┐           ┌──────▼──────┐
        │  覆盖范围   │             │  交互模式    │           │  评测时序    │
        │           │             │             │           │             │
        │  通用      │             │  静态       │           │  离线       │
        │  (AgentBench)            │  (BFCL AST)│           │  (SWE-bench)│
        │           │             │             │           │             │
        │  垂直      │             │  交互式     │           │  在线       │
        │  (SWE-bench)            │  (τ-Bench)  │           │  (实时评测)  │
        └───────────┘             └─────────────┘           └─────────────┘
                                         │
                              ┌──────────┼──────────┐
                              │                     │
                        ┌─────▼─────┐        ┌──────▼──────┐
                        │  单轮      │        │  多轮        │
                        │  (BFCL)   │        │  (AgentBench)│
                        └───────────┘        │  (τ-Bench)  │
                                             │  (BFCL v3)  │
                                             └─────────────┘
```

一个 Benchmark 往往在多个维度上同时定位。例如 τ-Bench 既是**垂直的**（企业服务场景），又是**交互式的**（Agent-User 对话），还是**多轮的**（需要管理对话状态），并且使用**离线**评测（预定义的任务集）。

---

## AgentBench：多环境 Agent 综合评测

### 概述

[AgentBench](https://github.com/THUDM/AgentBench) 由清华大学、俄亥俄州立大学和 UC Berkeley 联合提出，发表于 ICLR 2024。它是**第一个系统性评测 LLM-as-Agent 能力的多环境 Benchmark**，涵盖 8 个截然不同的评测环境。

### 架构设计

AgentBench 的核心设计理念是：Agent 能力不能通过单一维度评测来衡量。它将评测环境分为三大类：

| 类别 | 环境 | 评测能力 |
|------|------|---------|
| **代码类** | Operating System (OS) | 命令行操作、文件管理、系统运维 |
| | Database (DB) | SQL 查询、数据操作、多表关联 |
| | Knowledge Graph (KG) | 知识推理、图查询、关系发现 |
| **游戏类** | Digital Card Game (DCG) | 博弈策略、对手建模、资源管理 |
| | Lateral Thinking Puzzles (LTP) | 创造性推理、假设检验、信息收集 |
| **Web 类** | House-Holding (HH/ALFWorld) | 指令理解、多步规划、物体交互 |
| | Web Shopping (WS/WebShop) | 搜索策略、比较决策、交易执行 |
| | Web Browsing (WB/Mind2Web) | 页面理解、元素定位、表单操作 |

### 任务设计与评估方式

AgentBench 中的任务都是**多轮交互**的。在一次评测运行中，模型需要平均进行 4,000 到 13,000 次推理生成。这种设计确保了评测能够捕捉 Agent 在长时间任务中的稳定性和推理链质量。

以 OS 环境为例，一个典型任务可能要求 Agent：

1. 创建一个特定结构的目录
2. 生成包含特定数据的文件
3. 对文件执行一系列文本处理操作
4. 验证最终结果是否符合预期

每一步的输出都会作为下一步的输入环境状态，形成真实的交互链。

### 评分方法论

AgentBench 使用**任务成功率（Task Success Rate）** 作为主要指标，但针对不同环境有不同的成功标准定义：

- **OS 环境**：检查文件系统状态是否与预期一致
- **DB 环境**：验证 SQL 查询结果是否正确
- **Web 环境**：检查页面状态和交互结果
- **游戏环境**：评估最终游戏结果或策略质量

### 关键发现

AgentBench 对 29 个模型进行了评测，揭示了几个重要发现：

- **GPT-4 领先但非全能**：GPT-4 在多数环境中表现最好，但在部分任务上仍有明显差距
- **开源模型差距显著**：70B 以下的开源模型与顶级 API 模型之间存在明显的能力鸿沟
- **指令遵循是关键瓶颈**：大量失败案例的根因是模型未能正确遵循指令，而非推理能力不足
- **代码训练效果矛盾**：代码数据训练对某些 Agent 任务有正面影响，但对另一些反而有害

### 运行指南

```bash
git clone https://github.com/THUDM/AgentBench
cd AgentBench
pip install -r requirements.txt

python run.py --model gpt-4 --environments os,db,web --output results.json
```

运行前需要配置各环境的依赖（如数据库实例、Web 沙箱等）。完整的 8 环境评测大约需要 4k-13k 次模型推理调用，对 API 模型来说成本不低，建议先选择与你的应用场景最相关的 2-3 个环境进行针对性评测。

---

## SWE-bench：软件工程任务评测

### 概述

[SWE-bench](https://github.com/SWE-bench/SWE-bench) 由 Princeton NLP 团队提出，发表于 ICLR 2024（Oral），是当前**软件工程 Agent 评测的黄金标准**。它的评测范式极其直接：给定一个真实 GitHub Issue 和对应的代码仓库，让模型生成一个能通过已有测试的 Patch。

### 数据集变体

SWE-bench 提供多个数据集变体，适配不同的评测需求：

| 数据集 | 规模 | 特点 | 适用场景 |
|--------|------|------|---------|
| **SWE-bench Full** | 2,294 个实例 | 完整数据集，覆盖 12 个 Python 仓库 | 学术研究、全面评估 |
| **SWE-bench Lite** | 300 个实例 | 精选子集，保留难度分布 | 快速迭代、日常开发 |
| **SWE-bench Verified** | 500 个实例 | 人工验证的高质量子集 | 可靠评估、模型对比 |
| **SWE-bench Multimodal** | 517 个实例 | 包含截图等视觉元素 | 多模态能力评测 |
| **SWE-bench Multilingual** | 300 个实例 | 覆盖 9 种编程语言 | 跨语言评估 |

### 评测流程

SWE-bench 的评测流程在 Docker 容器中执行，确保完全隔离和可复现：

```
┌──────────────────────────────────────────────────────────┐
│                 SWE-bench 评测流程                         │
│                                                          │
│  1. 加载 GitHub Issue + 代码仓库                           │
│     │                                                    │
│     ▼                                                    │
│  2. Agent 分析 Issue，浏览代码库                            │
│     │                                                    │
│     ▼                                                    │
│  3. Agent 生成 Patch（代码 diff）                          │
│     │                                                    │
│     ▼                                                    │
│  4. 在 Docker 中应用 Patch 到指定 commit                    │
│     │                                                    │
│     ▼                                                    │
│  5. 运行预先定义的 FAIL_TO_PASS 测试用例                    │
│     │                                                    │
│     ▼                                                    │
│  6. 统计通过的测试比例 → % Resolved                        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

核心评估指标是 **% Resolved**——即成功解决的 Issue 占总 Issue 的百分比。这里的"成功"定义为：应用模型生成的 Patch 后，所有 `FAIL_TO_PASS` 测试用例都通过，同时 `PASS_TO_PASS` 测试用例不被破坏。

### SWE-bench Verified 的重要性

SWE-bench Full 存在一个已知问题：部分实例的 Issue 描述不够清晰，或者测试用例本身存在缺陷。**SWE-bench Verified** 是与 OpenAI 合作、由人类标注者逐一验证的 500 个高质量子集，已成为社区事实标准。

截至 2025 年底的排行榜显示：

- Claude Opus 4.5 以约 74-76% 的通过率领跑（mini-SWE-agent）
- 顶级模型（Claude 4.5 Opus、Gemini 3 Flash、MiniMax M2.5 等）已突破 75%
- 开源模型 DeepSeek V3.2 达到 70%，展示了开源生态的快速追赶

### 局限性与注意事项

SWE-bench 有几个需要认知的局限：

- **仅限 Python**（Full/Verified）：虽然 Multimodal 和 Multilingual 扩展了范围，但核心评测仍以 Python 为主
- **仅测试 Bug 修复**：不包含新功能开发、重构、文档编写等软件工程任务
- **Harness 偏差**：不同 Agent Harness（如 SWE-agent、Aider、OpenHands）的得分可能差异很大，评测的不仅是模型能力，还包括 Harness 设计
- **成本较高**：完整评测需要大量 Docker 容器执行和模型推理调用

### 运行指南

```bash
pip install -e .

from datasets import load_dataset
swe = load_dataset('SWE-bench/SWE-bench_Verified', split='test')

# 使用 mini-SWE-agent 评测
git clone https://github.com/SWE-agent/mini-swe-agent
cd mini-swe-agent
pip install -e .
swebench run --agent_path <agent_config> --dataset_path <data_path>
```

建议开发者首先在 **SWE-bench Lite**（300 个实例）上进行快速迭代，确认方向正确后再在 Verified 上做最终评估。

---

## τ-Bench：企业场景交互式评测

### 概述

[τ-Bench](https://github.com/sierra-research/tau-bench)（Tau-Bench）由 Sierra Research 团队提出，发表于 ICLR 2025。它填补了 Agent 评测中一个关键空白：**在真实企业业务场景中，Agent 需要同时与用户对话、调用工具、并遵循复杂的业务规则**。

τ-Bench 的核心设计理念是 **Tool-Agent-User 三方交互**——Agent 不仅要正确调用 API 工具，还要在多轮对话中理解用户意图，同时严格遵守领域策略规则。

### 领域设计

τ-Bench 最初覆盖两个核心企业领域，后续 τ²-bench 和 τ³-bench 扩展了更多领域：

| 领域 | 场景复杂度 | 工具数量 | 规则复杂度 | 用户模拟 |
|------|-----------|---------|-----------|---------|
| **零售（Retail）** | 退货、换货、价格匹配、订单查询 | 10+ 个 API | 中等（退款政策、价格规则） | LLM 模拟用户 |
| **航空（Airline）** | 改签、退票、航班查询、常旅客管理 | 10+ 个 API | 高（票价规则、舱位限制、退改政策） | LLM 模拟用户 |
| **电信（Telecom）**（τ³） | 套餐变更、故障排查、账单查询 | 扩展工具集 | 高 | LLM 模拟用户 |

### 双控环境（Dual-Control）

τ-Bench 最重要的创新是引入了**双控环境**概念：

```
┌──────────────────────────────────────────────────────────┐
│              τ-Bench 双控环境架构                          │
│                                                          │
│  ┌─────────────┐                    ┌─────────────┐      │
│  │   User       │                    │   Agent      │      │
│  │  (LLM模拟)   │◄────对话交互──────►│  (被评测模型) │      │
│  │              │                    │              │      │
│  │  有自己的     │                    │  有自己的     │      │
│  │  API 工具集  │                    │  API 工具集   │      │
│  └──────┬──────┘                    └──────┬──────┘      │
│         │                                   │             │
│         ▼                                   ▼             │
│  ┌─────────────┐                    ┌─────────────┐      │
│  │  共享数据库   │◄────状态同步──────►│  业务规则集   │      │
│  │  (模拟状态)   │                    │  (策略文档)   │      │
│  └─────────────┘                    └─────────────┘      │
│                                                          │
│  最终评判：对话结束后的数据库状态是否等于期望的目标状态         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

与传统 Benchmark 的关键区别在于：

- **用户由 LLM 模拟**，具有自己的 API 工具集，会主动执行操作（如自己查航班、改订单），这迫使 Agent 必须与用户协调而非单方面行动
- **评测标准是数据库最终状态**，而非对话内容的质量——Agent 说得再好听，如果数据库状态不对就是失败
- **需要遵循业务规则**：Agent 不仅要完成任务，还要在规则允许的范围内完成

### pass^k 指标

τ-Bench 引入了一个重要的可靠性指标 **pass^k**：在 k 次独立运行中全部通过的概率。这个指标捕捉了 Agent 行为的**一致性**——即使单次通过率看起来不错，如果 Agent 行为不稳定（pass^8 < 25%），在生产环境中也是不可接受的。

实验结果令人警醒：即使是 GPT-4o，在零售领域的 pass^8 也不到 25%，说明当前最顶级的模型在**可靠性**方面仍有巨大提升空间。

### 排行榜现状

截至 2025 年底，τ-Bench Airline 领域的排行榜：

- Claude Opus 4 High 推理模式以 66% 的准确率领先
- o4-mini High 推理模式以 60% 位居前列
- GPT-5 Medium 以 52% 展示了新模型的竞争力
- DeepSeek R1 以 36% 位列中游

值得注意的是，**最佳模型在航空领域也仅达到 66%**，远未达到生产可用的水平，这说明企业场景 Agent 的挑战依然严峻。

### 运行指南

```bash
git clone https://github.com/sierra-research/tau2-bench
cd tau2-bench
pip install -e .

tau2 run --domain airline --model gpt-4o --num-tasks 50
tau2 view  # 浏览仿真结果
```

τ-Bench 的运行成本主要来自两部分：Agent 模型推理和 User 模拟模型推理。一次完整的 50 任务评测，使用 GPT-4o 大约需要 $50-$300（取决于对话轮次），而使用高推理模式的 Claude Opus 可能超过 $300。

---

## Berkeley Function Calling Leaderboard (BFCL)

### 概述

[Berkeley Function Calling Leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html)（BFCL）由 UC Berkeley Gorilla 团队维护，已成为**函数调用能力评测的事实标准**。从 2024 年 2 月首次发布至今，BFCL 经历了 v1 到 v4 的快速迭代，评测维度从单轮函数调用扩展到了完整的 Agentic 评估。

### 版本演进

| 版本 | 发布时间 | 新增维度 | 核心创新 |
|------|---------|---------|---------|
| **BFCL v1** | 2024-02 | Single-Turn、AST 评测 | 引入 AST（抽象语法树）评测方法 |
| **BFCL v2** | 2024-06 | Live（真实数据） | 企业贡献和开源贡献的真实函数 |
| **BFCL v3** | 2024-09 | Multi-Turn、Memory | 多轮对话中的函数调用 |
| **BFCL v4** | 2025 | Web Search、Agentic | 完整的 Agent 场景评测 |

### AST 评测 vs 执行评测

BFCL 的核心创新是 **AST（Abstract Syntax Tree）评测方法**。与传统的执行评测（实际运行函数并比较结果）不同，AST 评测通过分析模型输出的函数调用的语法树结构来判断正确性：

```
AST 评测：
  解析模型输出 → 构建语法树 → 与标准答案的语法树对比
  ✅ 优点：快速、可扩展到数千个函数、不需要实际执行
  ❌ 缺点：只验证格式正确性，不验证语义正确性

执行评测：
  解析模型输出 → 实际调用函数 → 比较执行结果
  ✅ 优点：验证端到端正确性
  ❌ 缺点：需要可执行环境、成本高、无法处理副作用
```

BFCL 在 v2 版本中同时提供 AST 和 Live（执行）两种评测。AST 用于大规模快速筛选，Live 用于深度验证。

### 评测类别详解

BFCL 的评测覆盖了函数调用的完整能力谱：

| 类别 | 描述 | 难度 |
|------|------|------|
| **Simple** | 单函数调用，用户查询只涉及一个工具 | 低 |
| **Multiple** | 从多个候选函数中选择正确的函数调用 | 中 |
| **Parallel** | 同时并行调用多个独立函数 | 中 |
| **Multiple Parallel** | 并行调用 + 多函数选择 | 高 |
| **Relevance** | 正确识别需要调用工具的场景 | 中 |
| **Irrelevance** | 正确识别不需要调用工具的场景（拒绝幻觉调用） | 高 |
| **Multi-Turn KV** | 多轮对话中需要利用记忆的函数调用 | 高 |
| **Multi-Turn Vector** | 基于向量检索的上下文感知调用 | 高 |
| **Multi-Turn Recursive** | 需要递归推理的多步调用 | 很高 |
| **Agentic Web Search** | Agent 场景下的 Web 搜索工具使用 | 高 |

### 排行榜关键洞察

BFCL v4 排行榜揭示了几个重要趋势：

- **GLM-4.5 以 72.01% 领跑**，展示了开源模型在函数调用领域的突破
- **Claude-Opus-4-1 以 71.21% 紧随其后**，但在 Agentic 维度得分更高（80.5%）
- **单轮 vs 多轮差距明显**：多数模型在 Single-Turn 上得分 80%+，但在 Multi-Turn 上跌至 40-60%
- **拒绝幻觉调用仍是挑战**：Irrelevance 检测的方差很大，说明模型在"知道何时不调用工具"方面仍不稳定

### 运行指南

```bash
git clone https://github.com/ShishirPatil/gorilla
cd gorilla/berkeley-function-call-leaderboard
pip install -e .

# 评测你的模型
bfcl generate --model your-model --test-category all
bfcl evaluate --model your-model

# 查看结果
bfcl results --model your-model
```

BFCL 提供了标准化的评测脚本，支持 OpenAI、Anthropic、Google 等主流 API，也可以评测本地模型。建议先在 Single-Turn 类别上验证基础能力，再逐步挑战 Multi-Turn 和 Agentic 类别。

---

## 其他评测框架

除了上述四大 Benchmark，以下框架也在 Agent 评测生态中扮演重要角色：

### OpenAI Evals

[OpenAI Evals](https://github.com/openai/evals) 是 OpenAI 开源的评测框架，核心贡献在于建立了 **model-graded evaluation** 范式——使用 LLM 自身作为评判者评估输出质量。它提供了标准化的评测用例定义格式（Eval 对象）和自动化评估器编排能力。

```python
# OpenAI Evals 典型用法
import openai

eval = openai.Eval(
    name="my_agent_eval",
    data="my_eval_data.jsonl",
    eval_type="model_graded",
    model="gpt-4"
)
eval.run()
```

适用场景：快速构建自定义评测、利用 LLM-as-Judge 评估开放式任务。

### DeepEval

[DeepEval](https://github.com/confident-ai/deepeval) 定位为 **"Pytest for LLMs"**，将 LLM 评测深度集成到 Python 测试工作流中。它提供 50+ 预置指标（Answer Relevancy、Hallucination、G-Eval 等），支持 pytest 集成，可以像写单元测试一样写 LLM 评测。

```python
from deepeval.metrics import AnswerRelevancyMetric
from deepeval.test_case import LLMTestCase
from deepeval import evaluate

test_case = LLMTestCase(
    input="What is the capital of France?",
    actual_output="Paris is the capital of France."
)

metric = AnswerRelevancyMetric(threshold=0.7)
evaluate(test_cases=[test_case], metrics=[metric])
```

适用场景：CI/CD 集成、Prompt 版本回归测试、快速验证输出质量。

### Promptflow Evaluation

Microsoft 的 [Promptflow](https://github.com/microsoft/promptflow) 提供了一体化的 LLM 应用开发和评测平台。其评测能力侧重于评估 Flow（即 Prompt 编排链）的端到端质量，支持自定义评估器和数据集管理。

### 框架对比

| 维度 | OpenAI Evals | DeepEval | Promptflow |
|------|-------------|----------|------------|
| **定位** | 评测框架 | 评测框架 + 测试平台 | 应用开发 + 评测 |
| **核心特色** | Model-Graded Evaluation | Pytest 集成、50+ 指标 | Flow 编排、Azure 集成 |
| **开源** | ✅ | ✅ | ✅ |
| **CI/CD 友好度** | 中 | 高 | 中 |
| **Agent 评测** | 基础 | 中等 | 中等 |
| **上手难度** | 低 | 低 | 中 |
| **适合场景** | 自定义评测、学术研究 | 工程团队日常评测 | 企业级 LLM 应用开发 |

---

## 垂直领域 Benchmark 设计

当现有 Benchmark 无法覆盖你的特定领域时，自行设计垂直领域 Benchmark 是必要的。以下是经过实践验证的设计方法论。

### 数据采集

| 策略 | 描述 | 成本 | 质量 |
|------|------|------|------|
| **真实日志挖掘** | 从生产环境交互日志中提取有代表性的任务 | 低 | 高（真实场景） |
| **种子扩增** | 从少量种子用例出发，使用 LLM 自动生成变体 | 低 | 中（需人工审核） |
| **领域专家构造** | 领域专家手动编写测试用例 | 高 | 很高（目标性强） |
| **众包收集** | 通过众包平台收集多样化的输入和期望输出 | 中 | 中（需质量控制） |

### 标注与质量保障

```yaml
annotation_guidelines:
  general:
    - 每条用例至少由 3 名标注者独立标注
    - 标注者间一致性（IAA）Cohen's Kappa ≥ 0.75
    - 不一致的用例由高级标注者仲裁

  task_design:
    - 任务描述应足够完整，不依赖外部知识即可执行
    - 明确定义成功标准（最终状态 vs 过程指标）
    - 设置明确的评估指标和阈值

  rule_coverage:
    - 规则集应覆盖正常路径、边界条件和异常场景
    - 定期从生产环境中提取新的规则模式
    - 对规则集进行一致性检查，确保无自相矛盾
```

### 评估指标设计

垂直领域 Benchmark 的评估指标应遵循"**目标-过程-效率**"三层设计：

```
┌──────────────────────────────────────────────────────┐
│              垂直领域评估指标体系                        │
│                                                      │
│  ┌─── 目标层 ──────────────────────────────────────┐ │
│  │  • 任务完成率（最终状态是否符合预期）                │ │
│  │  • 准确率（操作是否正确）                           │ │
│  │  • 合规率（是否遵守业务规则）                        │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─── 过程层 ──────────────────────────────────────┐ │
│  │  • 工具选择准确率                                  │ │
│  │  • 参数传递正确率                                  │ │
│  │  • 对话轮次效率（最优轮次 vs 实际轮次）              │ │
│  │  • 错误恢复能力（遇到异常后的处理质量）              │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─── 效率层 ──────────────────────────────────────┐ │
│  │  • Token 消耗                                     │ │
│  │  • API 调用次数                                    │ │
│  │  • 端到端延迟                                      │ │
│  │  • 单任务成本                                      │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### 验证 Benchmark 本身的质量

一个好的 Benchmark 需要通过以下验证：

- **区分度验证**：确保不同能力水平的模型/Agent 能获得差异化的分数，避免所有模型得分接近
- **可复现性验证**：同一 Agent 在多次运行中应获得稳定的结果（或可量化的方差范围）
- **鲁棒性验证**：对测试用例做轻微扰动（如改写描述文本），确认评分结果不会剧烈波动
- **可扩展性验证**：能够方便地添加新的测试用例，而不破坏现有评分标准的一致性

---

## 各 Benchmark 对比表

| 维度 | AgentBench | SWE-bench Verified | τ-Bench | BFCL v4 |
|------|-----------|-------------------|---------|---------|
| **评测焦点** | 通用 Agent 能力 | 软件工程（Bug 修复） | 企业服务交互 | 函数调用能力 |
| **覆盖领域** | OS/DB/Web/游戏/KG | Python 仓库 Bug 修复 | 零售/航空/电信 | 通用 API 调用 |
| **交互模式** | 多轮、环境交互 | 单轮（Issue → Patch） | 多轮对话 | 单轮 + 多轮 |
| **数据集规模** | ~8 环境、数百任务 | 500 个实例 | 50 个任务/领域 | 2000+ 测试用例 |
| **评估方法** | 任务成功率 | % Resolved（测试通过） | 数据库最终状态 + pass^k | AST + 执行评测 |
| **计算开销** | 高（4k-13k 次推理） | 中高（Docker + 推理） | 中（$50-$300/运行） | 低-中 |
| **可复现性** | 中（环境依赖重） | 高（Docker 标准化） | 高（标准化框架） | 高（标准化脚本） |
| **开源程度** | ✅ Apache-2.0 | ✅ Apache-2.0 | ✅ MIT | ✅ Apache-2.0 |
| **发布时间** | 2023-08 | 2023-10 | 2024-06 | 2024-02 |
| **论文会议** | ICLR 2024 | ICLR 2024 (Oral) | ICLR 2025 | ICML 2025 |

### 选型决策树

```
你的 Agent 主要做什么？
│
├── 通用对话/推理能力
│   └── AgentBench（选相关环境）
│
├── 代码生成/修复
│   ├── 快速评估 → SWE-bench Lite (300)
│   └── 可靠评估 → SWE-bench Verified (500)
│
├── 企业服务/客服
│   ├── 有工具调用需求 → τ-Bench
│   └── 侧重对话质量 → τ-Bench + 自定义对话评测
│
└── API/工具调用能力
    ├── 基础能力 → BFCL Single-Turn
    ├── 多轮能力 → BFCL Multi-Turn
    └── 完整 Agent → BFCL Agentic
```

---

## 延伸阅读

### 论文与 Benchmark

- [AgentBench: Evaluating LLMs as Agents (ICLR 2024)](https://arxiv.org/abs/2308.03688) — AgentBench 原始论文，系统性评测 29 个模型在 8 个环境中的 Agent 能力
- [SWE-bench: Can Language Models Resolve Real-World GitHub Issues? (ICLR 2024)](https://arxiv.org/abs/2310.06770) — SWE-bench 原始论文，建立软件工程 Agent 评测范式
- [τ-bench: A Benchmark for Tool-Agent-User Interaction (ICLR 2025)](https://arxiv.org/abs/2406.12045) — τ-Bench 原始论文，引入双控环境和 pass^k 指标
- [τ²-Bench: Evaluating Conversational Agents in a Dual-Control Environment (2025)](https://arxiv.org/abs/2506.07982) — τ²/τ³-Bench 扩展论文，新增电信领域和语音评测
- [BFCL: From Tool Use to Agentic Evaluation (ICML 2025)](https://proceedings.mlr.press/v267/patil25a.html) — BFCL 完整论文，从函数调用到 Agentic 评估的演进

### 排行榜与资源

- [SWE-bench 官方排行榜](https://www.swebench.com/) — 最权威的软件工程 Agent 排行榜
- [BFCL 官方排行榜](https://gorilla.cs.berkeley.edu/leaderboard.html) — 函数调用能力实时排行榜
- [τ-Bench 官方排行榜](https://taubench.com/) — 企业服务 Agent 排行榜
- [LLM Stats - SWE-bench Verified](https://llm-stats.com/benchmarks/swe-bench-verified) — SWE-bench Verified 综合排行
- [VisualAgentBench](https://github.com/THUDM/VisualAgentBench) — AgentBench 团队推出的多模态 Agent 评测基准

### 评测框架与工具

- [OpenAI Evals](https://github.com/openai/evals) — OpenAI 开源的评测框架
- [DeepEval](https://github.com/confident-ai/deepeval) — "Pytest for LLMs"，CI/CD 友好的评测框架
- [LangSmith by LangChain](https://smith.langchain.com/) — Agent Tracing 和评测的一体化平台
- [Braintrust](https://www.braintrust.dev/) — LLM 应用评测平台，支持数据集管理和评估器编排

Agent Benchmark 生态仍在快速演进。2025 年的趋势是**评测维度的持续扩展**——从单轮到多轮、从文本到多模态、从能力评测到可靠性评测。理解这个生态的分类体系和各 Benchmark 的定位差异，是做出明智评测决策的前提。
