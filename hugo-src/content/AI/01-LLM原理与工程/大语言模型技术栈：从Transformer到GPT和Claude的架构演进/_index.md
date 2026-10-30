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

1. 定义一组"宪法"原则（如"不应帮助创建有害内容"）
2. 让模型对有害提问**自我批评**（生成反思）并按原则修订回答，产出"批评-修订"数据对
3. 用 **RLAIF**（AI Feedback 强化学习）替代大规模人类标注——批评-修订对训练偏好模型，再用其信号优化生成模型

CAI 的工程价值：**对齐数据生产成本大幅下降，且原则可审计、可迭代**——改一条宪法即可全局调整行为，而 RLHF 调整行为需要重新标注人类偏好数据。

### 3.2 Claude 的技术标签

- **长上下文质量**：200K 窗口 + 位置感知训练，缓解 "lost in the middle"
- **工具调用与计算机使用**：3.5 起原生支持 vision-based 操作，工具协议设计强调防注入
- **可解释性投入**：mechanistic interpretability 研究（features/circuits）直接反哺产品安全层
- **Extended Thinking**：3.7/4 将推理链显式化，对标 o1 路线

---

## 4. 开源阵营与国产模型

### 4.1 技术扩散主线

| 阶段 | 代表 | 扩散的关键能力 |
| :--- | :--- | :--- |
| 2023 | LLaMA 1/2 | 证明开源可复现 GPT-3.5 级 |
| 2024 | LLaMA 3 / Qwen2.5 / DeepSeek-V2 | GQA、RoPE、双版本蒸馏成为标配 |
| 2024-2025 | Mixtral / DeepSeek-V3 | MoE 进入开源默认选项 |
| 2025 | DeepSeek-R1 / Qwen3 | RL 推理训练配方开源 |

DeepSeek-V3/R1 的意义是把 MoE 训练、FP8、GRPO、蒸馏的**全套配方公开**，抹平了二线团队与顶级实验室在训练方法论上的差距。

### 4.2 国产模型差异化

- **Qwen 系列**：中文语料+代码最强开源基座，尺寸矩阵最全（0.5B-72B+MoE）
- **DeepSeek**：MoE + 推理范式，成本屠夫
- **GLM / Kimi / 豆包**：Agent 工具调用（GLM）、超长上下文（Kimi）、多模态与端侧生态（豆包）

### 4.3 上下文窗口的工程真相

窗口数字 ≠ 有效长度。长窗口伴随三个问题：lost-in-the-middle、长上下文训练数据稀缺、KV Cache 显存线性膨胀。百万级窗口的正确姿势：**当"可检索的 RAM"用，而不是当作无限输入流**——最相关内容放开头，材料塞中段，任务指令在结尾重申。

---

## 5. 工程落地四件套

### 5.1 Tokenization

BPE/SentencePiece 决定成本下限：中文按 1.5-2 token/字计，词表越大对中文/代码越省 token。跨模型比价必须**按同一 tokenizer 重新计价**。

### 5.2 推理优化栈

```
请求 → [调度: continuous batching] → [prefill: FlashAttention]
     → [decode: PagedAttention / KV Cache] → [可选: 投机解码] → 输出流
```

vLLM / SGLang / TensorRT-LLM 是开源三件套；吞吐差异主要来自 batching 效率与 KV Cache 管理。

### 5.3 量化与端侧

INT8/INT4（AWQ、GPTQ、GGUF Q4_K_M）把 70B 拉到单卡可跑，质量损失对日常任务通常小于模型换代差异；llama.cpp/MLC/CoreML 让 3-8B 模型进手机。

### 5.4 应用层栈

Prompt Engineering → RAG / Function Calling → Agent 编排 → 评测与监控（LangSmith / OpenCompass）。每一层失效模式不同，但都建立在**模型输出可解析**这一共同前提上。

---

## 6. 总结

从 Transformer（2017）、GPT-3 的 In-Context Learning、ChatGPT 的 RLHF、GPT-4 的系统化，到 Claude 的 CAI 与开源阵营的 MoE/R1 平权，LLM 技术栈的主线是**能力、对齐、成本**三者的交替突破。对应用开发者，选型逻辑不变：**用旗舰闭源定义质量基线，用开源与量化控制边际成本，用工程层（RAG/工具/监控）补齐可靠性**。架构会持续演进，但 Attention + 自回归 + Scale 三要素，短期内仍是全部魔法的公共分母。

(注：文中参数、价格与基准整理自公开论文、官方发布与行业榜单；部分闭源模型（如 GPT-4）细节属业界推测，请以官方信息为准。)

本文面向授权安全研究与防御建设，未经授权对任何系统实施文中技术属违法行为。
