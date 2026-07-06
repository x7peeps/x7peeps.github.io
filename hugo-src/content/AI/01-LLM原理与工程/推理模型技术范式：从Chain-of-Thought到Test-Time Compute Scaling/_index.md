---
title: "推理模型技术范式：从 Chain-of-Thought 到 Test-Time Compute Scaling"
weight: 6
tags: [Reasoning Model, Chain-of-Thought, GRPO, Test-Time Compute, DeepSeek-R1, o1, Qwen3]
menu:
  main:
    parent: "LLM 原理与工程"
---

# 推理模型技术范式：从 Chain-of-Thought 到 Test-Time Compute Scaling

大语言模型的能力边界正在经历一次根本性的重构。2024 年 9 月，OpenAI 发布 o1 推理模型，首次在商业产品中实现了**测试时计算缩放（Test-Time Compute Scaling）**——让模型在回答问题之前"思考"更长时间，从而大幅提升推理准确率。这一范式转变标志着 LLM 从单纯追求"训练时参数规模"转向"推理时计算投入"的新时代。

传统的 Scaling Law 告诉我们：更大的模型 + 更多的训练数据 = 更强的能力。但推理模型揭示了一个互补维度：**即使模型参数不变，增加推理阶段的计算量也能显著提升性能**。DeepSeek-R1 通过纯强化学习（RL）在开源社区复现了 o1 级别的推理能力，Qwen3 则将思考模式与非思考模式统一到单一模型中，进一步推动了推理模型的普及化。本文将从技术原理、训练方法、模型生态和工程实践四个维度，系统梳理推理模型的完整技术栈。

---

## 1. 推理模型的核心定义

### 1.1 什么是推理模型

推理模型（Reasoning Model / Reasoning Language Model, RLM）是一类**在推理阶段显式生成内部思维链（Chain-of-Thought），然后基于思维链产出最终答案**的大语言模型。与标准 LLM 的"一次前向传播直接输出"不同，推理模型会在内部进行多步推理、自我验证和自我纠错。

**标准 LLM 与推理模型的核心差异**：

| 维度 | 标准 LLM（如 GPT-4o） | 推理模型（如 o1、DeepSeek-R1） |
| :--- | :--- | :--- |
| **推理方式** | 单次前向传播，直接输出 | 先内部推理，再输出最终答案 |
| **计算分配** | 训练时大量计算，推理时固定计算 | 训练时 + 推理时均可扩展计算 |
| **CoT 可见性** | 依赖 prompt 引导 | 原生生成内部 CoT（部分可见） |
| **擅长场景** | 通用对话、创作、检索 | 数学、编程、逻辑推理、科学问题 |
| **延迟与成本** | 较低 | 较高（推理链可达数千 Token） |
| **训练方法** | SFT + RLHF | SFT + RL（RLVR/GRPO 等） |

### 1.2 推理模型的三大技术支柱

推理模型之所以被称为一个"范式"，是因为它依赖三个相互增强的技术机制：

**1. 强化学习后训练（RL Post-Training）**

与标准 SFT 模仿正确输出不同，**基于可验证奖励的强化学习（RLVR, Reinforcement Learning with Verifiable Rewards）**通过试错让模型自主发现正确的推理策略。模型因通过有效中间步骤得出正确答案而获得奖励——不是因为生成了看似合理的文本。这解释了为什么推理模型展现出训练数据中从未明确演示过的涌现行为。

**2. 测试时计算缩放（Test-Time Compute Scaling）**

推理模型在推理阶段分配更多计算资源。模型不再只做一次前向传播，而是**生成多个候选推理链，然后通过多数投票或内部奖励模型选择最佳答案**。这从根本上不同于标准 LLM 的工作方式，也解释了为什么推理模型在查询上更慢、更贵——以及为什么它们在有可验证正确答案的任务上大幅超越标准 LLM。

**3. Chain-of-Thought 作为一等输出**

推理模型将思维链视为产品的一部分，而不仅是副作用。策略模型生成候选推理步骤，价值模型评估每条路径的质量。部分实现还叠加了树搜索（MCTS 或 Beam Search）跨越多个推理轨迹。其结果是一个**能在推理过程中自我纠错**的系统——这是标准 LLM 在结构上无法做到的。

```
┌─────────────────────────────────────────────────────────┐
│              标准 LLM 推理流程                            │
│   用户输入 ──→ Transformer ──→ 输出答案                   │
│                                                         │
│              推理模型推流程                                │
│   用户输入 ──→ 内部推理链 ──→ 自我验证 ──→ 最终答案        │
│                   ↑                                      │
│            可能生成数千 Token                               │
│            覆盖多种推理路径                                 │
│            包含回溯与自我纠错                               │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 核心技术原理

### 2.1 Chain-of-Thought 的演进

Chain-of-Thought（CoT）并非推理模型的发明。2022 年 Wei et al. 在论文 "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models" 中就证明了通过 prompt 引导 LLM 逐步推理可以显著提升性能。但早期的 CoT 完全依赖 prompt 工程——模型本身并未经过专门训练来生成高质量推理链。

推理模型的本质突破在于：**通过强化学习训练模型将 CoT 内化为原生能力**。模型不再是"被引导去展示推理过程"，而是"学会推理本身就是产出高质量答案的手段"。

### 2.2 强化学习算法：从 PPO 到 GRPO

**PPO（Proximal Policy Optimization）** 是 RLHF 阶段的标准算法，但推理模型的训练需要更高效的方案。DeepSeek 提出的 **GRPO（Group Relative Policy Optimization）** 成为当前推理模型训练的主流算法。

GRPO 的核心创新在于**无需单独的 Critic 模型**：

| 算法 | 优势估计方式 | 需要额外模型 | 训练复杂度 |
| :--- | :--- | :--- | :--- |
| **PPO** | Critic 模型（Value Network） | 是（与策略模型同等规模） | 高 |
| **GRPO** | 组内相对排名（Group Relative） | 否（仅采样自身） | 低 |
| **DAPO** | 解耦裁剪 + 动态采样 | 否 | 中 |

GRPO 的工作原理：

1. 对每个 prompt，从当前策略模型**并行采样多个回答**（组成一个 group）
2. 使用基于规则的奖励函数对每个回答打分（0/1 二值奖励）
3. 计算组内**相对优势**：好的回答获得正向梯度，差的回答获得负向梯度
4. 更新策略模型参数

```python
# GRPO 核心逻辑伪代码
def grpo_step(policy_model, prompts, group_size=16):
    all_responses = []
    all_rewards = []
    
    for prompt in prompts:
        # 并行采样 group_size 个回答
        responses = [policy_model.generate(prompt) for _ in range(group_size)]
        # 基于规则的奖励（如数学题答案是否正确）
        rewards = [verify_answer(r, ground_truth) for r in responses]
        all_responses.extend(responses)
        all_rewards.extend(rewards)
    
    # 组内相对优势：reward - mean(reward)
    advantages = compute_group_relative_advantages(all_rewards, group_size)
    # 策略梯度更新
    policy_loss = -clip_ratio(advantages * log_probs)
    return policy_loss
```

### 2.3 奖励建模：RLVR 的力量

推理模型训练中**不使用神经奖励模型**，而是采用**基于规则的可验证奖励（Verifiable Rewards）**。DeepSeek-R1 论文中明确指出：神经奖励模型在大规模 RL 过程中可能遭受"奖励黑客攻击"（Reward Hacking），且重新训练奖励模型需要额外资源，使整个训练流程变得复杂。

可验证奖励适用于有明确正确答案的任务：

- **数学推理**：验证最终计算结果是否正确
- **代码生成**：通过测试用例验证代码功能
- **逻辑推理**：检查逻辑链条的有效性
- **格式遵循**：验证输出是否符合指定格式

> 当任务存在可验证的正确答案时，RLVR 的效果远超 RLHF。这也是为什么推理模型在数学和编程基准测试上的提升最为显著。

---

## 3. 推理模型全景

### 3.1 模型生态速览

| 模型 | 开发者 | 发布时间 | 开源 | 关键特性 |
| :--- | :--- | :--- | :--- | :--- |
| **o1** | OpenAI | 2024.09 | 否 | 首个商业推理模型，可调推理努力度 |
| **o3** | OpenAI | 2025.04 | 否 | AIME 2025 达 88.9%，成本效率提升 |
| **o3-pro** | OpenAI | 2025.06 | 否 | 最强推理性能，多链评估 |
| **o4-mini** | OpenAI | 2025.04 | 否 | 成本优化版，AIME 2024 最佳 |
| **DeepSeek-R1** | DeepSeek | 2025.01 | 是 | 纯 RL 涌现推理能力，AIME 71.0% |
| **DeepSeek-R1-Zero** | DeepSeek | 2025.01 | 是 | 无 SFT 冷启动，纯 RL 训练 |
| **Qwen3** | 阿里巴巴 | 2025.05 | 是 | 思考/非思考混合模式，budget 控制 |
| **Claude 3.7 Sonnet** | Anthropic | 2025.02 | 否 | Extended Thinking，可设置 budget |
| **Claude Sonnet 4.5** | Anthropic | 2025.09 | 否 | 摘要化思考，交错思考模式 |

### 3.2 OpenAI o 系列

OpenAI o1（代号 Strawberry）奠定了推理模型的商业范式。其核心设计包括：

- **内部推理链**：模型维护一个隐藏的"思考块"，在回答前进行逐步推理
- **可调推理努力度**：用户可通过 `reasoning_effort` 参数控制推理深度
- **强化学习对齐**：通过人类反馈的 RL 训练模型识别并奖励正确的推理路径

o3 系列进一步演进，**o3 在 AIME 2025 数学竞赛中达到 88.9% 准确率**，而 o3-pro 通过**运行多个完整推理链并在内部评分后返回最佳答案**，实现了最高水平的推理性能。

> 值得注意的是，o3 的名字跳过了 o2，因为与英国电信运营商 O2 存在商标冲突。

### 3.3 DeepSeek-R1：开源推理的里程碑

DeepSeek-R1 的意义在于**以开源方式证明了纯强化学习可以激发 LLM 的推理能力**，论文发表于 Nature，被广泛认为是推理模型领域最重要的开源工作。

**DeepSeek-R1-Zero 的 "Aha Moment"**：

DeepSeek-R1-Zero 是在 DeepSeek-V3-Base 基础上**仅通过 GRPO 强化学习训练**（无任何 SFT 冷启动）的模型。训练过程中出现了令人惊叹的现象：模型自发学会了"重新思考"——在推理链中使用拟人化的语气（如 "Wait, let me reconsider..."），自主发现并纠正错误。AIME 2024 的 pass@1 分数从 15.6% 提升到 71.0%，经多数投票后达 86.7%，匹配 o1-0912 的性能。

但 R1-Zero 也暴露了问题：**输出可读性差、语言混杂**（中英文混合）。这促使 DeepSeek 团队开发了完整的 R1 模型。

### 3.4 Claude Extended Thinking

Anthropic 在 Claude 3.7 Sonnet 中引入了 **Extended Thinking** 模式，其设计哲学与其他推理模型有显著差异：

- **混合模式**：同一模型支持标准模式（快速回答）和扩展思考模式（深度推理）
- **可见的思考过程**：用户可以查看 Claude 的推理过程（研究预览）
- **Thinking Budget**：开发者可以精确控制 Claude 思考的 Token 预算
- **摘要化思考**：Claude 4 系列将完整思考过程压缩为摘要，保留推理收益的同时保护内部推理的隐私

Claude 3.7 Sonnet 的 Extended Thinking 利用了所谓的**"串行测试时计算"（Serial Test-Time Compute）**——在生成最终输出之前使用多个串行推理步骤。其准确率随思考 Token 数量呈**对数增长**。

### 3.5 Qwen3：混合推理的统一框架

Qwen3 系列（2025 年 5 月发布）将推理模型的灵活性推向了新高度。其核心创新在于：

- **思考模式与非思考模式的统一**：单一模型可动态切换，无需在 GPT-4o（快速）和 QwQ-32B（推理）之间选择
- **Thinking Budget 机制**：允许用户在推理时自适应分配计算资源，根据任务复杂度平衡延迟和性能
- **开放权重**：从 0.6B 到 235B 参数规模全部开源（Apache 2.0 许可）

Qwen3 的旗舰模型 Qwen3-235B-A22B 是一个 MoE 架构，总参数 235B，每 Token 激活 22B，在 AIME、LiveCodeBench 等基准测试中与 o3、DeepSeek-R1 具有竞争力。

---

## 4. DeepSeek-R1 的四阶段训练流程

DeepSeek-R1 的训练方法是理解推理模型如何诞生的最佳案例。其流程分为四个阶段：

### 4.1 Stage 1：Cold Start（冷启动）

收集少量高质量的 CoT 数据，对基座模型进行 SFT。这一步的目的不是让模型学会推理，而是**为后续的 RL 训练提供一个合理的起点**，避免纯 RL 训练初期的不稳定性。

**R1-Zero 的教训**：跳过冷启动的纯 RL 训练虽然能涌现出推理能力，但输出质量（可读性、语言一致性）不可控。

### 4.2 Stage 2：Reasoning-Oriented RL（推理导向的 RL）

在冷启动模型上进行大规模 GRPO 训练。这一阶段专注于提升模型在数学、编程、逻辑等推理任务上的表现。

```
┌──────────────────────────────────────────────────┐
│           DeepSeek-R1 训练流程                     │
│                                                  │
│   Stage 1: Cold Start SFT                        │
│   ┌─────────────────────────────┐                │
│   │ 少量 CoT 数据 → SFT 微调     │                │
│   └─────────────┬───────────────┘                │
│                 ▼                                │
│   Stage 2: Reasoning-Oriented RL                 │
│   ┌─────────────────────────────┐                │
│   │ GRPO + Verifiable Rewards   │                │
│   │ 专注数学/编程/逻辑推理       │                │
│   └─────────────┬───────────────┘                │
│                 ▼                                │
│   Stage 3: Rejection Sampling + SFT              │
│   ┌─────────────────────────────┐                │
│   │ 筛选高质量推理数据            │                │
│   │ 混合非推理数据进行 SFT        │                │
│   └─────────────┬───────────────┘                │
│                 ▼                                │
│   Stage 4: All-Scenario RL                       │
│   ┌─────────────────────────────┐                │
│   │ 全场景 RL（含安全/格式/帮助性）│                │
│   └─────────────────────────────┘                │
└──────────────────────────────────────────────────┘
```

### 4.3 Stage 3：Rejection Sampling + SFT

从 Stage 2 的模型中进行**拒绝采样**——让模型对大量 prompt 生成回答，只保留正确且推理过程高质量的样本。然后将这些推理数据与通用的非推理数据（如写作、翻译、对话）混合，进行新一轮 SFT。

### 4.4 Stage 4：全场景 RL

最后阶段的 RL 不再局限于推理任务，而是**覆盖所有使用场景**——包括安全性、输出格式、帮助性等。这确保模型在保持推理能力的同时，也能作为一个有用的通用助手。

### 4.5 蒸馏：让小模型也能推理

DeepSeek-R1 还展示了**推理能力蒸馏**的可能性。通过将 R1 的推理链作为训练数据，可以将推理能力注入到 1.5B 到 70B 参数的小模型中。实验表明，**蒸馏比直接在小模型上进行 RL 更有效**——14B 的蒸馏模型在多个基准测试上超过了直接用 RL 训练的同规模模型。

| 蒸馏模型 | 基座 | AIME 2024 | MATH-500 | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| R1-Distill-Qwen-1.5B | Qwen2.5-1.5B | 28.9% | 83.9% | 最小推理模型 |
| R1-Distill-Qwen-7B | Qwen2.5-7B | 55.5% | 92.8% | 性价比极高 |
| R1-Distill-Qwen-14B | Qwen2.5-14B | 69.7% | 93.9% | 超越 RL 直训模型 |
| R1-Distill-Qwen-32B | Qwen2.5-32B | 72.6% | 94.3% | 接近 R1 完整版 |
| R1-Distill-Llama-70B | Llama-3.3-70B | 70.0% | 94.5% | 跨架构蒸馏 |

---

## 5. Test-Time Compute Scaling 的工程实践

### 5.1 推理努力度控制

所有主流推理模型都支持推理努力度的分级控制，这是将推理能力工程化应用的关键：

| 模型 | 控制参数 | 低 | 中 | 高 |
| :--- | :--- | :--- | :--- | :--- |
| **OpenAI o3-mini** | `reasoning_effort` | low | medium | high |
| **Claude Sonnet** | `budget_tokens` | 数千 Token | 数万 Token | 上限 128K |
| **Qwen3** | Thinking Budget | 动态自适应 | 按 Token 预算 | 全量推理 |

### 5.2 成本与延迟的权衡

推理模型的推理链可能包含数千甚至数万 Token，这意味着：

- **输出 Token 成本急剧上升**：o1 的输出 Token 价格为 $60/M，而 GPT-4o 仅 $15/M
- **首次 Token 延迟显著增加**：推理模型需要先完成内部推理才开始输出
- **适用场景需精准选择**：简单查询用标准模型，复杂推理才切换到推理模型

> 实践建议：在生产环境中使用**路由策略**——先用轻量级分类器判断任务复杂度，再决定是否调用推理模型。可以将 80% 的简单查询路由到标准模型，只在 20% 的复杂任务上使用推理模型。

### 5.3 Overthinking 问题

推理模型的一个已知问题是**过度思考（Overthinking）**——生成不必要的冗长推理链，不仅浪费计算资源，还可能因为偏离正确推理路径而导致错误。

2025 年的研究（如 S-GRPO）正在探索通过改进 RL 训练来解决这一问题。S-GRPO 的核心思想是：对推理链中**较早位置产出的正确答案给予更高奖励**，鼓励模型在推理充分时尽早退出，而非等到推理链末尾。

### 5.4 推理链的忠实度

一个值得关注的研究问题是：**推理链在多大程度上真实反映了模型的内部推理过程？**

Anthropic 的研究指出，Claude 的思考过程可能"并不总是忠实于模型的真实决策过程"。多项研究发现，模型经常基于其思考过程中**未明确讨论的因素**做出决策。这意味着：

- 不能完全依赖监控推理链来评估模型安全性
- 推理链更像是"有帮助的解释"而非"透明的审计日志"
- 推理模型的可解释性仍是一个开放问题

---

## 6. 推理模型的适用场景与选型

### 6.1 推理模型擅长的任务

- **数学推理**：复杂代数、几何、微积分、竞赛数学（AIME、MATH-500）
- **代码生成与调试**：需要多步推理的算法实现、Bug 定位、测试用例生成
- **逻辑分析**：多条件约束推理、因果关系分析、反事实推理
- **科学研究**：物理问题求解、化学方程式配平、数据分析推理
- **复杂规划**：多步骤任务分解、资源优化调度

### 6.2 标准模型更合适的任务

- **日常对话**：快速响应、闲聊、简单问答
- **内容创作**：文案撰写、创意生成、翻译
- **信息检索**：文档摘要、事实查询、数据提取
- **格式转换**：JSON 生成、代码格式化、数据清洗

### 6.3 选型决策树

```
用户请求到达
    │
    ├─ 任务是否需要多步推理？ ── 否 ──→ 标准 LLM（GPT-4o / Claude Sonnet）
    │
    └─ 是
        │
        ├─ 是否有可验证的正确答案？── 是 ──→ 推理模型（o3 / DeepSeek-R1 / Qwen3）
        │
        └─ 否（如开放式分析）
            │
            ├─ 预算/延迟是否敏感？── 是 ──→ 推理模型 + 低 reasoning_effort
            │
            └─ 否 ──→ 推理模型 + 高 reasoning_effort
```

---

## 7. 总结与展望

- **推理模型代表了 LLM 能力增长的第二曲线**：当 Scaling Law 在训练时计算上逐渐趋近极限时，测试时计算缩放开辟了新的增长空间
- **GRPO 与 RLVR 是当前推理模型训练的核心方法**：通过可验证奖励的强化学习，模型能自主发现超越训练数据的推理策略
- **开源推理模型已追平闭源水平**：DeepSeek-R1 和 Qwen3 证明了开源社区可以构建与 o1/o3 竞争的推理模型
- **混合推理模式是工程化落地的关键**：Qwen3 和 Claude 的混合设计让推理能力可以按需启用，而非全量开启
- **推理链忠实度、Overthinking、成本控制**仍是当前需要攻克的核心挑战

> 未来趋势：推理模型正在从独立的"特殊模式"演变为 LLM 的**标配能力**。Anthropic 已将扩展思考能力整合进所有新模型版本，Qwen3 将思考与非思考模式统一到单一模型中。随着 S-GRPO 等研究解决 Overthinking 问题，以及蒸馏技术让小模型也能具备推理能力，推理模型的工程化应用门槛将持续降低。

## 参考资源

- [DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning](https://arxiv.org/abs/2501.12948) — DeepSeek-R1 原始论文，Nature 发表
- [Qwen3 Technical Report](https://arxiv.org/abs/2505.09388) — Qwen3 混合推理模型技术报告
- [Claude's Extended Thinking](https://www.anthropic.com/news/visible-extended-thinking) — Anthropic 官方扩展思考技术博客
- [OpenAI o1](https://en.wikipedia.org/wiki/OpenAI_o1) — OpenAI o1 推理模型详细解读
- [The State of Reinforcement Learning for LLM Reasoning](https://magazine.sebastianraschka.com/p/the-state-of-llm-reasoning-model-training) — Sebastian Raschka 的 RL 推理综述
- [S-GRPO: Early Exit via Reinforcement Learning in Reasoning Models](https://arxiv.org/abs/2505.07686) — Overthinking 问题的前沿解决方案
- [Scaling LLM Test-Time Compute Optimally](https://arxiv.org/abs/2408.03314) — Test-Time Compute Scaling 的理论基础
