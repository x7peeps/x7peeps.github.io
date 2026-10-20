---
title: "大语言模型技术栈：从 Transformer 到 GPT/Claude 的架构演进"
weight: 1
tags: [LLM, Transformer, GPT, Claude, DeepSeek, 技术栈]
menu: 
  main: 
    parent: "AI原理"
---

# 大语言模型技术栈：从 Transformer 到 GPT/Claude 的架构演进

大语言模型（LLM）已从学术论文中的实验性工作，演变为支撑数十亿用户日常交互的基础设施级产品。作为 AI 应用开发者，理解从底层 Transformer 架构到上层应用框架的完整技术栈，是做出正确技术选型、构建高质量 AI 应用的前提。

本文不讨论"什么是 AI"这类入门概念，而是以技术栈纵览的方式，系统梳理 LLM 生态中的关键技术节点：从 Attention 机制的本质，到各主流模型家族的架构演进，再到工程落地时必须面对的 Token 化、上下文窗口、推理部署等核心问题。

---

## 1. Transformer 架构核心

2017 年 Google 发表的 *Attention Is All You Need* 是当前 LLM 时代的起点。Transformer 之所以能替代 RNN/LSTM 成为主流序列建模架构，核心在于三个设计决策：

### 1.1 Self-Attention 的本质直觉

Self-Attention 的核心操作可以用一句话概括：**对序列中的每个 Token，动态计算它与所有其他 Token 的相关性权重，然后按权重加权聚合信息**。

与 RNN 的逐步传递不同，Self-Attention 是完全并行的——序列中的每个位置同时关注所有其他位置，这使得 GPU 的大规模并行计算能力得以充分利用。

对于 Query（Q）、Key（K）、Value（V）三个向量的角色，一个实用的直觉是：

- **Q** 代表"我正在寻找什么"
- **K** 代表"我能提供什么匹配信息"
- **V** 代表"匹配成功后我实际提供的内容"

注意力分数 `softmax(QK^T / √d_k) · V` 本质上是一个**可微分的软路由机制**：每个位置根据 Q-K 匹配度，从所有位置的 V 中聚合信息。

### 1.2 Multi-Head Attention 的设计动机

单个 Attention Head 只能捕捉一种类型的关系模式。Multi-Head Attention 将 Q、K、V 投影到多个低维子空间，让不同的 Head 各自学习不同的语义关系模式（如语法依赖、指代消解、局部共现等），最后拼接输出。

实际工程中，大模型通常使用 32-128 个 Attention Head，每个 Head 的维度在 64-128 之间。这种设计在不增加单次 Attention 计算复杂度的前提下，大幅增强了模型的表达能力。

### 1.3 Feed-Forward Network（FFN）

Attention 层负责 Token 间的信息交互，FFN 则负责对每个位置的表示做非线性变换。现代 LLM 的 FFN 通常采用 SwiGLU 或 GELU 激活函数，参数量一般为 Attention 层的 2-3 倍（以 LLaMA 为例，FFN 的 hidden_dim = 8/3 × d_model）。

### 1.4 位置编码：绝对 vs 相对

Transformer 的 Attention 机制本身是**置换不变的**——打乱输入 Token 的顺序，输出不变。位置编码解决的就是这个问题。

| 方案 | 代表模型 | 原理 | 特点 |
| :--- | :--- | :--- | :--- |
| **绝对正弦编码** | 原始 Transformer、GPT-2 | 用不同频率的正弦/余弦函数为每个位置生成固定向量 | 简单，但泛化到训练时未见过的序列长度时表现差 |
| **可学习绝对编码** | GPT-3、BERT | 为每个位置学习一个独立的 Embedding 向量 | 灵活，但同样受限于固定最大长度 |
| **RoPE** | LLaMA、Qwen、DeepSeek | 通过旋转矩阵将位置信息编码到 Q 和 K 中，使得 Attention 分数自然反映相对距离 | 支持长度外推，当前主流方案 |
| **ALiBi** | BLOOM、MPT | 直接对 Attention 分数加一个与距离成比例的偏置项 | 实现极简，无需额外参数，外推能力较好 |
| **相对位置编码** | T5、eLECTRA | 在 Attention 计算中显式注入相对位置偏置 | 理论优雅，工程实现较复杂 |

当前新开源模型几乎全部转向 RoPE，结合 NTK-aware scaling 等技术实现长上下文支持。

---

## 2. 从 GPT-1 到 GPT-4 的演进脉络

OpenAI 的 GPT 系列是 LLM 发展脉络中最具标志性的技术路线，每个阶段都解决了一个核心问题：

### 2.1 GPT-1（2018）：证明预训练的可行性

- **核心创新**：首次大规模验证了"无监督预训练 + 有监督微调"（Pre-train + Fine-tune）范式的有效性。
- **架构**：12 层 Transformer Decoder，117M 参数。
- **训练数据**：BookCorpus（约 7000 本书）。
- **关键结论**：在大规模语料上预训练语言模型，可以学到通用的语言表示，迁移到下游 NLP 任务时显著提升性能。

### 2.2 GPT-2（2019）：发现 Scaling 的涌现能力

- **核心创新**：证明了单纯增大模型规模（1.5B 参数）和数据量，可以让模型在零样本（Zero-shot）条件下完成多种任务，无需任何微调。
- **训练数据**：WebText（40GB，Reddit 高质量外链文本）。
- **关键技术**：Pre-LayerNorm（将 LayerNorm 移到 Attention/FFN 之前），改善训练稳定性。
- **争议**：OpenAI 最初以"太危险"为由拒绝公开完整模型，这成为 AI 安全讨论的一个标志性事件。

### 2.3 GPT-3（2020）：In-Context Learning 的诞生

- **核心创新**：175B 参数规模下涌现出 **In-Context Learning**（上下文学习）能力——模型仅通过在 Prompt 中给出几个示例，就能执行新任务，无需梯度更新。
- **关键技术**：交替使用 Dense Attention 和 Sparse Attention（Sliding Window + Global），降低长序列的计算成本。
- **深远影响**：In-Context Learning 直接催生了 Prompt Engineering 这一新范式，改变了人与 AI 交互的基本方式。
- **局限**：模型虽然能力强大，但输出质量不可控——它只是在做"下一个 Token 预测"，不理解用户的真实意图。

### 2.4 InstructGPT / ChatGPT（2022）：RLHF 范式的确立

- **核心创新**：通过 **RLHF（Reinforcement Learning from Human Feedback）** 对齐技术，将 GPT-3 的能力"对齐"到人类偏好。
- **三阶段训练流程**：
  1. **SFT（Supervised Fine-Tuning）**：用人工标注的高质量指令-回答对做监督微调
  2. **Reward Model 训练**：收集人类对多个回答的偏好排序，训练奖励模型
  3. **PPO 强化学习**：用奖励模型的信号，通过 PPO 算法优化策略模型
- **ChatGPT** 本质是 InstructGPT 的对话化版本，基于 GPT-3.5（推测为 code-davinci-002 的微调版本）。
- **工程意义**：RLHF 证明了"能力 ≠ 对齐"，模型能力再强，没有对齐就无法成为可靠的产品。

### 2.5 GPT-4（2023）：多模态与系统级推理

- **已知信息**：支持文本和图像输入（多模态）；在专业考试（Bar Exam、GRE 等）上表现优异；采用 MoE（Mixture of Experts）架构的传闻广泛但未被官方确认。
- **推理优化**：引入 Speculative Decoding 等推理加速技术，降低延迟。
- **系统能力**：GPT-4 不仅是一个模型，而是以系统方式运作——包括多轮对话管理、System Prompt、Function Calling 等工程化能力。
- **技术封闭**：GPT-4 未公开架构细节，标志着 OpenAI 从"论文驱动"转向"产品驱动"的策略转变。

---

## 3. Claude 系列的技术路线

Anthropic 由前 OpenAI 核心成员创立，其技术路线与 OpenAI 形成了鲜明的差异化：

### 3.1 Constitutional AI（CAI）

Anthropic 最重要的技术贡献是 **Constitutional AI**，这是一种不依赖大规模人类反馈的对齐方法：

1. 定义一组"宪法"原则（如"不应帮助创建有害内容"