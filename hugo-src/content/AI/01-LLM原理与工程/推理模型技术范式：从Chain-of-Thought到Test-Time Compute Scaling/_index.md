---
title: "推理模型技术范式：从 Chain-of-Thought 到 Test-Time Compute Scaling"
weight: 6
tags: [Reasoning Model, Chain-of-Thought, GRPO, Test-Time Compute, DeepSeek-R1, o1, Qwen3]
menu:
  main:
    parent: "AI原理"
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
    policy_loss = 