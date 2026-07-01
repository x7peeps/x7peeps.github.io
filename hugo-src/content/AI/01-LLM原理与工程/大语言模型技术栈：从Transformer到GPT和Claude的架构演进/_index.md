---
title: "大语言模型技术栈：从 Transformer 到 GPT/Claude 的架构演进"
weight: 1
tags: [LLM, Transformer, GPT, Claude, DeepSeek, 技术栈]
menu: 
  main: 
    parent: "LLM 原理与工程"
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
2. 让 AI 自我批评（Self-Critique）并根据原则修订输出
3. 用修订后的数据做 RLHF 训练

CAI 的核心优势在于**可扩展性**——传统 RLHF 需要大量人类标注员，而 CAI 让模型自己做第一轮筛选，大幅降低了人力成本，同时使对齐标准更加透明和可审计。

### 3.2 Claude 系列演进

| 版本 | 发布时间 | 核心特征 |
| :--- | :--- | :--- |
| **Claude 1** | 2023.03 | 基础对话模型，200K Token 上下文窗口（远超同期 GPT-4 的 8K/32K） |
| **Claude 2** | 2023.07 | 改进的推理能力，支持文件上传分析，更长上下文 |
| **Claude 3 Haiku** | 2024.03 | 轻量级模型，追求极致速度和成本效益 |
| **Claude 3 Sonnet** | 2024.03 | 平衡性能与速度，适合大规模部署 |
| **Claude 3 Opus** | 2024.03 | 旗舰模型，复杂推理和长文分析能力突出 |
| **Claude 3.5 Sonnet** | 2024.06 | 性能超越 Opus，同时保持 Sonnet 级别的速度和成本 |
| **Claude 4 / Opus 4** | 2025.06 | 最新旗舰，支持 200K 上下文窗口、增强的代码能力和复杂推理，引入 Extended Thinking 模式 |

### 3.3 安全优先的设计哲学

Anthropic 的技术选择始终围绕"AI 安全"这一核心：

- **可解释性研究**：投入大量资源研究模型内部的 Mechanistic Interpretability，试图理解神经网络"在想什么"
- **Responsible Scaling Policy**：制定明确的模型能力阈值，在达到特定危险能力之前必须先部署对应的安全措施
- **宪法式安全**：所有安全规则以可读文本形式存在，而非隐含在训练数据中，便于外部审计

---

## 4. 国产模型生态

2024-2025 年，国产大模型在技术路线上展现出显著的差异化创新能力：

### 4.1 DeepSeek 系列

DeepSeek 是目前国内技术创新最具代表性的团队：

**DeepSeek-V2** 的两大核心架构创新：

- **MoE（Mixture of Experts）架构**：将 FFN 层拆分为多个"专家"（Expert），每个 Token 只激活其中少数几个专家（Top-K 路由）。在总参数量 236B 的情况下，每个 Token 仅激活 21B 参数，大幅降低了推理的计算成本。
- **MLA（Multi-head Latent Attention）**：这是 DeepSeek 的原创贡献。传统 MHA 需要缓存所有 Attention Head 的 K 和 V 向量，显存消耗随序列长度线性增长。MLA 将 K、V 投影到一个低维的"潜在空间"（Latent Space），仅缓存这个低维向量，将 KV Cache 压缩到原来的 1/5-1/10，在不显著损失性能的前提下大幅降低了长序列推理的显存需求。

**DeepSeek-V3** 进一步优化：

- 引入 **FP8 混合精度训练**，降低训练成本
- 采用 **Multi-Token Prediction** 作为辅助训练目标
- 训练总成本仅约 $5.57M，以极低成本达到了接近 GPT-4 的性能水平

**DeepSeek-R1** 的技术路线：

- 专注于推理（Reasoning）能力，通过大规模 RL 训练让模型学会"链式思考"
- 开源了完整的训练方法论，推动了社区对推理模型（Reasoning Model）的研究

### 4.2 Qwen 2.5 系列

阿里通义千问 Qwen 系列是开源生态最完善的国产模型之一：

- **全尺寸覆盖**：0.5B 到 72B 参数量全线布局，从端侧部署到云端服务
- **Qwen 2.5 关键改进**：扩展训练数据至 18T Tokens，显著提升中文和多语言能力
- **Qwen 2.5-Coder / Math**：专门针对代码生成和数学推理的领域微调版本
- **Qwen-Agent 框架**：配套的 Agent 开发框架，降低 LLM 应用开发门槛

### 4.3 GLM-4（智谱 AI）

基于 GLM（General Language Model）架构，GLM-4 的特色在于：

- **Prefix LM 架构**：与纯 Decoder-Only 的 GPT 系列不同，GLM 对编码器和解码器采用不同的注意力掩码模式，在某些任务上效率更高
- **多模态支持**：CogView 系列支持文生图，CogVideo 支持视频生成
- **工具调用能力**：较早实现了 Function Calling 和 Agent 框架的集成

### 4.4 Kimi（月之暗面）

- **长上下文先驱**：最早在国内推广超长上下文窗口（200K+ Token），通过优化的位置编码和注意力稀疏化实现
- **技术特色**：专注于长文本理解和处理场景，如论文分析、长文档问答

### 4.5 百度文心 ERNIE

- **知识增强预训练**：ERNIE 系列的核心特色是将知识图谱信息融入预训练过程
- **持续演进**：ERNIE 4.0 在中文理解和生成任务上表现优异
- **生态整合**：深度集成百度搜索、文库等产品生态

---

## 5. 开源 vs 闭源模型的技术差异

| 维度 | 闭源模型（GPT-4、Claude） | 开源模型（LLaMA、Qwen、DeepSeek） |
| :--- | :--- | :--- |
| **训练数据** | 不公开，数据规模和质量无法验证 | 训练数据通常部分公开或可追溯，可审计性更强 |
| **架构细节** | 模型架构和训练方法未公开 | 完整架构代码和权重开放，可深度定制 |
| **微调能力** | 仅通过 API 微调（Fine-tuning），受限于平台提供的接口 | 可在本地对任意层做 LoRA、QLoRA、Full Fine-tuning |
| **部署灵活性** | 只能通过 API 调用，数据必须上传到第三方服务器 | 可本地部署、私有化部署，满足数据合规要求 |
| **成本结构** | 按 Token 计费，高调用量时成本不可控 | 初期算力投入大，但边际成本趋近于零 |
| **性能天花板** | 当前仍处于领先（GPT-4o、Claude 3.5 Sonnet） | 开源模型快速追赶（DeepSeek-V3 性能接近 GPT-4） |
| **迭代速度** | 依赖厂商发布节奏 | 社区可即时复现论文、快速迭代 |

**工程决策建议**：

- **快速验证阶段**：优先使用闭源 API，降低开发门槛
- **生产部署阶段**：评估数据安全要求，敏感场景优先考虑开源模型私有化部署
- **成本敏感场景**：高调用量时，开源模型的 TCO（Total Cost of Ownership）显著低于 API 计费
- **定制化需求**：需要深度适配行业知识时，开源模型的可微调性是决定性优势

---

## 6. Token 化机制

Token 化是 LLM 处理文本的第一步，也是最容易被忽视但影响深远的环节。

### 6.1 BPE（Byte-Pair Encoding）

BPE 是目前最主流的 Token 化算法，核心思路是：

1. 从单个字节/字符开始
2. 统计训练语料中相邻 Token 对的出现频率
3. 将频率最高的 Token 对合并为一个新 Token
4. 重复步骤 2-3，直到达到目标词表大小

**实际效果**：高频词（如 "the"、"的"）会被编码为单个 Token，低频词则被拆分为多个子词 Token。

### 6.2 主流实现对比

| 实现 | 使用模型 | 特点 |
| :--- | :--- | :--- |
| **tiktoken** | GPT-3.5/4 | OpenAI 的高性能 BPE 实现，基于 Rust 内核，速度极快 |
| **SentencePiece** | LLaMA、Qwen、Gemini | 语言无关的分词库，直接在原始文本上操作，无需预分词 |
| **HuggingFace Tokenizers** | 多种模型 | Rust 实现，支持 BPE/WordPiece/Unigram 等多种算法 |
| **DeepSeek tokenizer** | DeepSeek 系列 | 基于 Tiktoken，针对中文和代码优化词表 |

### 6.3 中文 Token 化的特殊挑战

中文在 Token 化层面面临独特的效率问题：

- **GPT-4 的 tiktoken（cl100k_base）**：一个汉字通常被拆分为 2-3 个 Token，中文 1000 字的文本约消耗 1500-2000 Token
- **Qwen/DeepSeek 的自定义词表**：大幅扩充了中文 Token 的覆盖范围，同样 1000 字中文文本可能仅消耗 600-800 Token
- **实际影响**：Token 效率直接决定了 API 调用成本和上下文窗口的有效利用长度。对中文应用开发者来说，选择对中文友好的 Tokenizer 是一个高 ROI 的优化点

---

## 7. 上下文窗口技术

上下文窗口（Context Window）是 LLM 处理信息量的硬约束，也是当前技术竞争的焦点之一。

### 7.1 RoPE（Rotary Position Embedding）

RoPE 是当前最主流的位置编码方案，其核心思想是：**将位置信息编码为旋转角度，使得两个 Token 的 Attention 分数自然地随相对距离衰减**。

数学上，RoPE 将 Query 和 Key 向量的每一对相邻维度视为复平面上的点，然后根据位置施加一个旋转角度 `θ = 10000^(-2i/d)`。这种设计的优雅之处在于：

- Attention 分数只依赖相对位置差，而非绝对位置
- 天然支持通过修改 `θ` 的基数来外推到更长序列

### 7.2 NTK-aware Scaling

当模型需要处理超过训练时最大长度的序列时，直接外推会导致 Attention 分数异常。NTK-aware Scaling 是一种高效的长度外推方法：

- **核心思路**：不均匀地调整 RoPE 的频率基数，让高频分量（编码局部位置关系）保持不变，仅降低低频分量（编码全局位置关系）的频率
- **效果**：在不重新训练的情况下，将上下文长度从 4K 外推到 32K 甚至 128K，性能损失可控
- **局限**：超过一定倍数后（通常是 4-8 倍），性能会显著下降，此时需要通过长文本微调来解决

### 7.3 上下文窗口的工程实践

| 模型 | 原生上下文 | 扩展技术 |
| :--- | :--- | :--- |
| GPT-4 | 8K → 128K | 未公开 |
| Claude 3.5 | 200K | 未公开 |
| LLaMA 3.1 | 128K | RoPE + 长文本微调 |
| DeepSeek-V3 | 128K | RoPE + YaRN |
| Qwen 2.5 | 128K | RoPE + Dual Chunk Attention |
| Gemini 1.5 Pro | 1M+ | 未公开，推测使用了多级 Attention 层级结构 |

**实际使用中的注意事项**：

- "支持 128K 上下文"不等于"在 128K 范围内性能无损"。实际上，模型在处理长上下文时仍存在"Lost in the Middle"问题——对中间位置的信息关注度显著下降
- 对于 RAG 场景，更实用的做法是：将检索结果控制在 8K-32K Token 范围内，而非盲目依赖超长上下文
- 长上下文推理的计算复杂度和显存占用仍是巨大挑战，即使是 KV Cache 压缩技术，处理 128K 上下文仍需要数十 GB 显存

---

## 8. LLM 技术栈分层架构

从基础设施到终端应用，LLM 技术栈可以划分为四个清晰的层次：

```text
┌─────────────────────────────────────────────────────────────────┐
│                    Application Layer（应用层）                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
│  │ Chatbot  │  │   RAG    │  │   Agent  │  │  Code Assistant│  │
│  │（对话产品）│  │（检索增强）│  │（智能代理）│  │  （代码助手）    │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                   Middleware Layer（中间件层）                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
│  │API Gateway│  │  SDK     │  │ Prompt   │  │  Eval / Guard  │  │
│  │（网关/限流）│  │（多模型适配）│  │Management│  │  （评测/安全过滤）│  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                     Model Layer（模型层）                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Training   │  │  Inference   │  │  Fine-tuning / RLHF │  │
│  │ （预训练/对齐） │  │（推理引擎/量化）│  │ （微调/人类反馈对齐）  │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                Infrastructure Layer（基础设施层）                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
│  │  GPU/TPU │  │ 集群调度  │  │ 分布式存储 │  │  网络互联       │  │
│  │（算力硬件）│  │（K8s/Slurm）│  │（对象/块存储）│  │（RDMA/InfiniBand）│  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

各层之间的关键组件和数据流：

| 层次 | 关键组件 | 代表性技术 |
| :--- | :--- | :--- |
| **基础设施层** | GPU 集群、分布式训练框架、高速互联 | NVIDIA H100/H200、Megatron-LM、DeepSpeed、Ray |
| **模型层** | 预训练、SFT、RLHF、推理引擎 | vLLM、TensorRT-LLM、SGLang、llama.cpp、Ollama |
| **中间件层** | API 管理、Prompt 编排、安全过滤 | LiteLLM、LangChain、Guardrails AI、Helicone |
| **应用层** | Chatbot、RAG、Agent、代码助手 | Dify、FastGPT、OpenHands、Cursor |

作为 AI 应用开发者，你的主要工作区间在中间件层和应用层，但理解底层的模型能力和基础设施限制，是做出正确架构决策的关键。

---

## 9. 延伸阅读

### 核心论文

| 论文 | 年份 | 核心贡献 |
| :--- | :--- | :--- |
| [Attention Is All You Need](https://arxiv.org/abs/1706.03762) | 2017 | Transformer 架构原始论文 |
| [Language Models are Unsupervised Multitask Learners](https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf) | 2019 | GPT-2，Zero-shot 能力展示 |
| [Language Models are Few-Shot Learners](https://arxiv.org/abs/2005.14165) | 2020 | GPT-3，In-Context Learning |
| [Training language models to follow instructions with human feedback](https://arxiv.org/abs/2203.02155) | 2022 | InstructGPT/RLHF |
| [Constitutional AI: Harmlessness from AI Feedback](https://arxiv.org/abs/2212.08073) | 2022 | Anthropic CAI 方法论 |
| [DeepSeek-V2: A Strong, Economical, and Efficient MoE LLM](https://arxiv.org/abs/2405.04434) | 2024 | MLA + MoE 架构创新 |
| [RoFormer: Enhanced Transformer with Rotary Position Embedding](https://arxiv.org/abs/2104.09864) | 2021 | RoPE 位置编码 |
| [LLaMA: Open and Efficient Foundation Language Models](https://arxiv.org/abs/2302.13971) | 2023 | 开源 LLM 范式的起点 |
| [Qwen Technical Report](https://arxiv.org/abs/2309.16609) | 2023 | Qwen 架构与训练细节 |
| [DeepSeek-V3 Technical Report](https://arxiv.org/abs/2412.19437) | 2024 | 低成本训练方法论 |
| [DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning](https://arxiv.org/abs/2501.12948) | 2025 | 推理模型训练方法论 |

### 推荐资源

- **Hugging Face LLM Course**：https://huggingface.co/learn/llm-course — 系统性的 LLM 开发教程
- **Andrej Karpathy 的 State of GPT 演讲**：从工程视角理解 LLM 训练全流程
- **Lilian Weng 的博客**：https://lilianweng.github.io — Transformer、RLHF 等主题的深度技术综述
- **Jay Alammar 的图解 Transformer**：https://jalammar.github.io — 最直观的 Attention 机制可视化
- **vLLM 项目**：https://github.com/vllm-project/vllm — 生产级 LLM 推理引擎
- **DeepSeek 技术博客**：https://api-docs.deepseek.com/zh-cn/ — MLA、MoE 等架构创新的详细解读
