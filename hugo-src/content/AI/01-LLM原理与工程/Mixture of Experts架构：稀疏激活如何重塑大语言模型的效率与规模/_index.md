---
title: "Mixture of Experts 架构：稀疏激活如何重塑大语言模型的效率与规模"
weight: 7
tags: [MoE, Mixture of Experts, 稀疏激活, DeepSeek, Mixtral, 路由机制, 负载均衡]
menu:
  main:
    parent: "LLM 原理与工程"
---

# Mixture of Experts 架构：稀疏激活如何重塑大语言模型的效率与规模

大语言模型的 Scaling Law 曾长期遵循一个简单假设：**更大的参数量意味着更强的能力，但代价是成比例增长的计算开销**。GPT-4 据报训练成本超过 1 亿美元，Llama 2 耗费 330 万 A100 GPU 小时——当参数规模逼近万亿级别，Dense 模型的线性扩展路径正变得难以持续。

2024-2025 年，一个从 1991 年就存在的架构思想强势回归：**Mixture of Experts（MoE）**。DeepSeek-V3 以 671B 总参数、仅 37B 激活参数的稀疏架构，用 557 万美元的训练成本达到了 GPT-4 级别的性能。MoE 不再是学术界的好奇心，它已成为 2025 年**超过 60% 开源模型发布的默认选择**——从 Mixtral 到 Grok，从 Qwen-MoE 到 Gemini。

本文将从 MoE 的基础原理出发，系统梳理稀疏路由机制、负载均衡策略、代表性模型架构对比，以及从训练到生产部署的工程实践，帮助技术决策者和 AI 工程师理解这一正在重塑大模型经济学的关键架构范式。

---

## 1. 从 Dense 到 Sparse：为什么需要 MoE

### 1.1 Dense 模型的计算瓶颈

在传统的 Dense Transformer 中，每个 token 的前向传播会激活模型的**所有参数**。对于一个 70B 参数的 Dense 模型，每个 token 的生成都需要执行 70B 参数的完整计算。这意味着：

- **计算成本与参数量线性绑定**——想要更强的模型，就必须支付更多的 FLOPs
- **显存需求与总参数量成正比**——所有参数必须常驻显存，即使对当前输入并无贡献
- **训练成本呈超线性增长**——更多的参数需要更多的数据、更多的 GPU 小时

> **核心矛盾**：并非所有参数都对所有输入有用。一个关于 Python 语法的问题，和一个关于罗马历史的问题，理论上需要不同的神经通路。但在 Dense 模型中，每个神经元都无差别地参与每次计算。

### 1.2 MoE 的核心思想：条件计算

**MoE 的本质是将「模型容量」和「计算开销」解耦**。其核心思路极为朴素：

- 将一个大的 FFN 层拆分为多个独立的「专家」（Expert）子网络
- 引入一个轻量级的「路由器」（Router/Gating Network），为每个 token 动态选择最相关的少数几个专家
- **只激活被选中的专家**，其余专家保持静默

```
┌──────────────────────────────────────────────────────────────┐
│                    Dense Model vs MoE Model                   │
│                                                               │
│  Dense:                                                       │
│  Token ──→ [FFN: 所有参数激活] ──→ Output                     │
│                                                               │
│  MoE:                                                         │
│  Token ──→ [Router] ──→ 选中 Expert_2, Expert_5              │
│           ├──→ Expert_1 (静默)                                │
│           ├──→ Expert_2 (激活) ──→ Weighted Sum ──→ Output    │
│           ├──→ Expert_3 (静默)                                │
│           ├──→ Expert_4 (静默)                                │
│           ├──→ Expert_5 (激活) ──↗                            │
│           ├──→ Expert_6 (静默)                                │
│           ├──→ Expert_7 (静默)                                │
│           └──→ Expert_8 (静默)                                │
└──────────────────────────────────────────────────────────────┘
```

这种「稀疏激活」带来了**参数量和计算量的解耦**：DeepSeek-V3 拥有 671B 总参数，但每个 token 仅激活 37B（约 4.8%），推理成本相当于一个 37B 的 Dense 模型，却拥有 671B 参数的知识容量。

---

## 2. MoE 在 Transformer 中的实现

### 2.1 Transformer Block 的 MoE 改造

在标准的 Decoder-only Transformer 中，每个 Block 包含两个核心子层：**Self-Attention** 和 **FFN（Feed-Forward Network）**。MoE 的做法是将 FFN 层替换为 MoE 层，而 Attention 层和其他组件（LayerNorm、Residual Connection）保持不变：

```
标准 Transformer Block:                MoE Transformer Block:

┌────────────────────┐               ┌────────────────────┐
│   Layer Normalization│               │   Layer Normalization│
└────────┬───────────┘               └────────┬───────────┘
         ▼                                     ▼
┌────────────────────┐               ┌────────────────────┐
│  Masked Self-Attention│              │  Masked Self-Attention│
└────────┬───────────┘               └────────┬───────────┘
         ▼                                     ▼
┌────────────────────┐               ┌────────────────────┐
│   Residual + Norm  │               │   Residual + Norm  │
└────────┬───────────┘               └────────┬───────────┘
         ▼                                     ▼
┌────────────────────┐               ┌────────────────────┐
│        FFN         │        →      │    MoE Layer       │
│   (单个 FFN 网络)   │               │  (Router + N 个 FFN)│
└────────┬───────────┘               └────────┬───────────┘
         ▼                                     ▼
┌────────────────────┐               ┌────────────────────┐
│   Residual + Norm  │               │   Residual + Norm  │
└────────────────────┘               └────────────────────┘
```

**关键设计选择**：MoE 通常替换 FFN 而非 Attention，原因在于 FFN 层占据了模型参数量和计算量的主体（在大模型中 FFN 参数约占 2/3），对 FFN 做稀疏化能获得最大的效率收益。

### 2.2 MoE Layer 的数学表达

一个 MoE 层的计算可以形式化为：

```
MoE(x) = Σᵢ g(x)ᵢ · Eᵢ(x)
```

其中：
- **x** 是输入 token 的隐藏表示（维度为 d_model）
- **Eᵢ(x)** 是第 i 个专家网络（标准 FFN）的输出
- **g(x)ᵢ** 是路由器为第 i 个专家分配的门控权重
- 只有被 Router 选中的 top-k 个专家参与计算，其余 g(x)ᵢ = 0

每个专家本质上就是一个**独立的 FFN**，与原始 Transformer 中的 FFN 结构完全相同，但拥有自己独立的参数。

---

## 3. 路由机制详解：Router 如何选择专家

路由机制（Router/Gating Network）是 MoE 架构中最关键的组件——**它决定了每个 token 的计算去向**，直接影响模型的表达能力和训练稳定性。

### 3.1 Top-K Gating：主流路由策略

最广泛使用的路由策略是 **Top-K Gating**，其工作流程如下：

```python
import torch
import torch.nn.functional as F

def moe_forward(x, experts, router_weight, top_k=2):
    # x: [batch_size, seq_len, d_model]
    # router_weight: [d_model, num_experts]
    
    # 1. 计算每个专家的路由分数
    logits = F.linear(x, router_weight)  # [batch, seq, num_experts]
    
    # 2. 选择 top-k 个专家
    top_k_logits, top_k_indices = torch.topk(logits, top_k, dim=-1)
    
    # 3. 计算门控权重（仅对选中的专家做 softmax）
    top_k_gates = F.softmax(top_k_logits, dim=-1)
    
    # 4. 逐专家计算并加权求和
    output = torch.zeros_like(x)
    for k in range(top_k):
        expert_idx = top_k_indices[:, :, k]   # [batch, seq]
        gate = top_k_gates[:, :, k]           # [batch, seq]
        expert_out = experts[expert_idx](x)   # 选中专家的输出
        output += gate.unsqueeze(-1) * expert_out
    
    return output
```

| 超参数 | 含义 | 常见取值 |
| :--- | :--- | :--- |
| **Top-K** | 每个 token 激活的专家数 | K=1（Switch Transformer）、K=2（Mixtral）或 K=8（DeepSeek-V3） |
| **Num Experts** | 每层的专家总数 | 8（Mixtral）、256（DeepSeek-V3）、128（Llama 4 Maverick） |
| **Capacity Factor** | 每个专家的最大 token 缓冲系数 | 1.0-1.5 |

**K 值的权衡**：K=1（如 Switch Transformer）计算最经济，但每个 token 只能获得一个专家的表征；K=2（如 Mixtral）是质量和效率的平衡点；更大的 K 值（如 DeepSeek-V3 的 K=8）配合更多细粒度专家，能实现更精细的知识分解。

### 3.2 Softmax vs Sigmoid Gating

门控函数的选择影响路由分数的分布特性：

| 门控函数 | 公式 | 特点 | 代表模型 |
| :--- | :--- | :--- | :--- |
| **Softmax** | `gᵢ = exp(sᵢ) / Σⱼ exp(sⱼ)` | 所有权重归一化到 1，竞争性强 | GShard, Switch Transformer |
| **Sigmoid** | `gᵢ = σ(sᵢ)` | 各专家权重独立，灵活性高 | DeepSeek-V2/V3, Mixtral |

DeepSeek-V3 选择 Sigmoid 门控的关键原因：**Sigmoid 使得每个专家的权重独立计算**，不会因为一个专家的分数高就压低其他专家的权重，更适合配合其 Loss-Free Balancing 策略使用。

### 3.3 Token Choice vs Expert Choice

| 策略 | 决策主体 | 优点 | 缺点 |
| :--- | :--- | :--- | :--- |
| **Token Choice** | Token 选择专家 | 实现简单，因果推理友好 | 可能导致负载不均 |
| **Expert Choice** | 专家选择 Token | 天然负载均衡，计算高效 | 训练时未来 token 泄露风险 |

> **实践中的选择**：几乎所有生产级 MoE LLM 都采用 **Token Choice**，因为自回归推理天然要求因果性——模型不能在生成当前 token 时看到未来 token 的信息。

---

## 4. 负载均衡：MoE 训练的核心挑战

### 4.1 路由坍缩问题

MoE 训练中最棘手的问题是**路由坍缩（Routing Collapse）**：路由器倾向于将大部分 token 反复发送给少数「热门」专家，导致：

- **训练效率骤降**：被冷落的专家得不到充分训练信号，模型实际容量远低于理论值
- **计算资源浪费**：承载热门专家的 GPU 过载，而其他 GPU 闲置
- **正反馈循环**：表现好的专家获得更多 token → 变得更好 → 获得更多 token → 其他专家彻底边缘化

```
理想分布:        实际坍缩分布:
E1: ████ 12.5%   E1: ████████████████████████ 80%
E2: ████ 12.5%   E2: ███ 10%
E3: ████ 12.5%   E3: █ 3%
E4: ████ 12.5%   E4: █ 2%
E5: ████ 12.5%   E5: █ 2%
E6: ████ 12.5%   E6: █ 1.5%
E7: ████ 12.5%   E7: █ 1%
E8: ████ 12.5%   E8: █ 0.5%
```

### 4.2 辅助负载均衡损失

解决路由坍缩的经典方案是在训练损失函数中添加**辅助负载均衡损失（Auxiliary Load Balancing Loss）**。该方法最早由 Switch Transformer 提出：

```python
def load_balancing_loss(gate_logits, num_experts, top_k):
    # gate_logits: [batch * seq, num_experts]
    routing_weights = F.softmax(gate_logits, dim=-1)
    
    # 每个专家被选中的比例 fᵢ
    _, top_k_indices = torch.topk(routing_weights, top_k, dim=-1)
    mask = torch.zeros_like(routing_weights).scatter_(1, top_k_indices, 1)
    tokens_per_expert = mask.float().mean(dim=0)
    
    # 每个专家的平均路由权重 pᵢ
    router_prob_per_expert = routing_weights.mean(dim=0)
    
    # 辅助损失 = N * Σᵢ (fᵢ * pᵢ)
    # 当所有专家均匀负载时，此损失最小
    loss = num_experts * (tokens_per_expert * router_prob_per_expert).sum()
    return loss
```

**公式的直觉理解**：`fᵢ` 代表专家 i 实际处理的 token 比例，`pᵢ` 代表路由器给专家 i 的平均偏好。辅助损失 `N * Σ(fᵢ * pᵢ)` 在两个分布都均匀时达到最小值 `1.0`，当路由坍缩时会显著增大，从而通过梯度反向传播强制路由器均匀分配。

### 4.3 辅助损失的两难困境

然而，辅助损失引入了一个根本性矛盾：

- **负载均衡的梯度**会干扰模型的语言建模目标，降低模型质量
- **损失权重（α）**太大会严重损害性能，太小又无法有效防止坍缩
- 辅助损失同时影响**路由选择**和**门控权重**的梯度更新，而后者对模型质量至关重要

### 4.4 DeepSeek 的 Loss-Free Balancing 创新

DeepSeek-V3 提出了一种优雅的替代方案——**Loss-Free Balancing（无损均衡）**，其核心思想极为简洁：

```python
def loss_free_balancing_routing(x, router_weight, bias, top_k, gamma=0.001):
    # 1. 计算原始路由分数（使用 Sigmoid）
    scores = torch.sigmoid(F.linear(x, router_weight))
    
    # 2. 在路由决策前，加上偏置项
    biased_scores = scores + bias  # bias: [num_experts]
    
    # 3. 基于偏置后的分数做 top-K 选择
    _, top_k_indices = torch.topk(biased_scores, top_k, dim=-1)
    
    # 4. 门控权重使用原始分数（不受偏置影响）
    gates = scores.gather(-1, top_k_indices)
    gates = gates / gates.sum(dim=-1, keepdim=True)
    
    return top_k_indices, gates

def update_bias(expert_load, target_load, bias, gamma=0.001):
    # 根据实际负载动态调整偏置
    for i in range(len(bias)):
        if expert_load[i] > target_load:
            bias[i] -= gamma   # 过载专家 → 降低偏置 → 减少被选概率
        elif expert_load[i] < target_load:
            bias[i] += gamma   # 冷门专家 → 提高偏置 → 增加被选概率
```

**关键洞察**：

- **偏置只影响离散的路由选择（哪些专家被选中）**，不影响连续的门控权重（选中的专家如何加权）
- 由于梯度通过门控权重回传，而不通过离散选择回传，**任务损失的梯度完全不受干扰**
- 每个训练步根据实际负载动态调整偏置，无需任何额外损失项

实验结果表明：Loss-Free Balancing 在模型性能和负载均衡两个维度上**同时优于**传统的辅助损失方案。

### 4.5 Router Z-Loss：稳定性保障

除了负载均衡损失，另一种常用的稳定化技术是 **Router Z-Loss**（来自 ST-MoE 论文）：

```python
def router_z_loss(logits):
    # logits: [batch * seq, num_experts]
    # 对 logits 的 log-sum-exp 进行惩罚
    z = torch.logsumexp(logits, dim=-1).square().mean()
    return z
```

Z-Loss 通过惩罚路由器 logits 的绝对值大小，防止路由分数出现极端值，提高训练稳定性。通常与辅助负载均衡损失配合使用。

---

## 5. 代表性 MoE 模型全景

### 5.1 模型架构对比

| 模型 | 发布时间 | 总参数 | 激活参数 | 专家数 | Top-K | 关键创新 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Switch Transformer** | 2021.01 | ~1.6T | ~100B/层 | 128-2048 | 1 | 首次大规模稀疏 MoE |
| **GShard** | 2020.06 | 600B | ~15B | 2048 | 2 | 跨节点分布式 MoE |
| **Mixtral 8x7B** | 2023.12 | 46.7B | 12.9B | 8 | 2 | 开源 MoE 标杆 |
| **Mixtral 8x22B** | 2024.04 | 141B | 39B | 8 | 2 | 扩展版 Mixtral |
| **DeepSeek-MoE** | 2024.01 | 16.4B | 2.8B | 64+2共享 | 6 | 细粒度专家 + 共享专家 |
| **DeepSeek-V2** | 2024.05 | 236B | 21B | 160+2共享 | 6 | MLA + DeepSeekMoE |
| **DeepSeek-V3** | 2024.12 | 671B | 37B | 256+1共享 | 8 | Loss-Free Balancing |
| **Grok-1** | 2024.03 | 314B | ~86B | 8 | 2 | xAI 首款 MoE |
| **Qwen1.5-MoE-A2.7B** | 2024.03 | 14.3B | 2.7B | 60+4共享 | 4 | 小规模高效 MoE |
| **Jamba** | 2024.03 | 52B | 12B | 16 | 2 | Transformer+Mamba+MoE |
| **Llama 4 Maverick** | 2025.04 | 400B | 17B | 128 | 1 | Meta 首款 MoE |
| **Kimi K2** | 2025.07 | ~1T | ~32B | 384 | 8 | 超大规模 MoE |

### 5.2 DeepSeekMoE 的独特设计

DeepSeek 系列对 MoE 架构进行了两个关键创新，使其在性能-成本权衡上达到了新的高度：

**细粒度专家（Fine-Grained Experts）**：传统 MoE 的每个专家是一个完整的 FFN，DeepSeek-MoE 将专家数量从 N 增加到 mN，每个专家的隐藏维度缩小到 1/m，同时激活 m 个更多专家。这样做的好处是**知识可以在专家之间被更精细地分解**。

**共享专家（Shared Experts）**：DeepSeek-MoE 额外设置若干「共享专家」，对每个 token 都激活。共享专家学习跨任务的通用知识，让其他路由专家更专注于各自的专长领域，进一步提升了专家特化程度。

```
传统 MoE:  Token → Router → Top-2 of 8 Experts → Output

DeepSeekMoE:
  Token ──→ Router → Top-8 of 256 Routed Experts ──→ Weighted Sum ──→ Output
        └──→ Shared Expert (始终激活) ────────────────↗
```

### 5.3 Jamba：MoE + 状态空间模型的混合架构

AI21 Labs 的 Jamba 代表了另一种创新方向——**将 MoE 与 Mamba（状态空间模型）结合**：

- 交替堆叠 Transformer 层和 Mamba 层（1:7 比例）
- 在部分层插入 MoE 模块扩展模型容量
- Mamba 层线性复杂度处理长序列，Transformer 层保持高质量的注意力机制
- Jamba-1.5-Large（398B 总参数，94B 激活）支持 256K 上下文，KV Cache 仅需 Transformer 模型的 1/10

**启示**：MoE 作为一种架构组件，正在与越来越多的创新结构组合使用，其适用范围远超最初的 FFN 稀疏化场景。

---

## 6. MoE 推理部署的工程挑战

### 6.1 显存需求的悖论

MoE 模型面临一个独特的工程矛盾：

- **计算量低**：每个 token 只激活少量参数，计算 FLOPs 远低于同参数量的 Dense 模型
- **显存需求高**：所有专家的权重必须驻留在可访问的显存中，因为路由器的决策是动态的

| 需求维度 | Dense 70B | MoE 671B (DeepSeek-V3) |
| :--- | :--- | :--- |
| **显存（模型权重）** | ~140 GB (FP16) | ~1,342 GB (FP16) |
| **每 token 计算量** | 70B FLOPs | ~37B FLOPs |
| **推理延迟** | 基准 | 接近 37B Dense 模型 |
| **吞吐量** | 基准 | 远高于 671B Dense 模型 |

**结论**：MoE 推理的瓶颈是**显存带宽而非算力**。路由器做决策后，需要快速将选中专家的权重从显存加载到计算单元，这个过程是 memory-bound 的。

### 6.2 并行策略：Expert Parallelism

为了解决大规模 MoE 模型的显存和通信问题，业界发展出了**专家并行（Expert Parallelism, EP）**：

```
┌────────────────────────────────────────────────────┐
│              Expert Parallelism 示意                 │
│                                                     │
│  GPU 0: Expert 0, 1    ┐                            │
│  GPU 1: Expert 2, 3    ├─ All-to-All 通信            │
│  GPU 2: Expert 4, 5    │  (token 按路由目标重分布)     │
│  GPU 3: Expert 6, 7    ┘                            │
│                                                     │
│  Token Batch:                                       │
│    [T1→E0,E3] [T2→E1,E7] [T3→E2,E5] [T4→E0,E3]   │
│                                                     │
│  All-to-All 后:                                     │
│    GPU 0: [T1,T4→E0] [T1,T4→E3]                    │
│    GPU 1: [T2→E1] [T2→E7]                           │
│    GPU 2: [T3→E2] [T3→E5]                           │
└────────────────────────────────────────────────────┘
```

主流的推理框架已经原生支持 MoE 的并行策略：

| 框架 | MoE 支持 | 关键特性 |
| :--- | :--- | :--- |
| **vLLM** | Expert Parallelism + Tensor Parallelism | Prefix Caching，广泛的模型兼容性 |
| **SGLang** | EP + TP + DP | Cache-Aware 负载均衡，适合 Chat 场景 |
| **TensorRT-LLM** | Wide Expert Parallelism | GB200 NVL72 优化，1.8x per-GPU 吞吐提升 |

> **生产部署建议**：对于 DeepSeek-V3 级别的模型（671B），通常需要 8×H100/H200 GPU，使用 EP=8 + TP=2 的组合策略。对于 Mixtral 8x7B 这样的小模型，单卡 80GB GPU 即可推理。

### 6.3 专家冗余与剪枝

研究发现 MoE 模型中存在**显著的专家冗余**——许多专家在预训练中学会了相似的函数。这带来了部署优化空间：

- **Mixtral 8x22B 实验**：将专家从 8 个剪枝到 4 个，平均精度损失仅约 2.8%，但显存需求大幅降低
- **CMoE（2025）**：可在数分钟内将一个 7B Dense 模型转换为 MoE，经微调后恢复性能
- **Expert Merging**：通过 CKA（Centered Kernel Alignment）度量专家相似度，合并高相似度专家

---

## 7. MoE 的局限性与未来方向

### 7.1 当前挑战

- **显存瓶颈**：总参数量决定了部署的硬件门槛，即使激活参数很少
- **通信开销**：Expert Parallelism 中的 All-to-All 通信在大规模集群中成为瓶颈
- **训练不稳定性**：路由决策的离散性使得训练动态更加复杂
- **微调难度**：MoE 模型的 LoRA 微调效果不如 Dense 模型稳定，需要针对专家参数做特殊适配
- **专家特化的不确定性**：研究发现专家并非按语义领域特化，而是倾向于学习语法和计算模式

### 7.2 未来趋势

- **混合架构融合**：MoE + SSM（如 Jamba）的混合架构将越来越普遍，在效率和能力之间取得更好的平衡
- **超大规模专家**：从 8 个专家（Mixtral）到 256-384 个专家（DeepSeek、Kimi），专家数量仍在快速增长
- **推理时优化**：Speculative MoE 等技术通过预测路由路径提前调度专家，减少通信延迟
- **硬件协同设计**：NVIDIA GB200 NVL72 等新一代硬件针对 MoE 的 All-to-All 通信模式进行了专门优化
- **辅助损失消除**：DeepSeek 的 Loss-Free Balancing 代表了「无损训练」的方向，预计将被更多模型采用

---

## 8. 总结与展望

MoE 架构的核心价值在于一个简洁的洞察：**不是所有参数都需要为所有输入工作**。通过稀疏激活，MoE 将模型容量的扩展从「线性成本增长」转变为「亚线性成本增长」，为万亿参数级别的模型打开了经济可行的大门。

关键要点回顾：

- **MoE 的本质**是将 FFN 替换为多个专家子网络 + 路由器，通过 Top-K 门控实现稀疏激活
- **负载均衡是核心挑战**：从辅助损失到 DeepSeek 的 Loss-Free Balancing，路由策略的演进直接决定了模型质量
- **DeepSeekMoE 的两大创新**——细粒度专家和共享专家——配合 Loss-Free Balancing，代表了当前 MoE 设计的最高水平
- **推理部署的瓶颈是显存而非算力**：所有专家权重必须常驻显存，Expert Parallelism 和模型剪枝是关键优化手段
- **MoE 正成为默认架构选择**：2025 年超过 60% 的开源模型采用 MoE，从 Mixtral 到 Llama 4，从 DeepSeek 到 Kimi K2

> 未来的 LLM 架构竞争，本质上是**稀疏化效率**的竞争。谁能以更低的激活成本实现更强的模型能力，谁就掌握了下一代 AI 基础设施的主动权。

---

## 参考资源

- [Outrageously Large Neural Networks: The Sparsely-Gated MoE Layer (Shazeer et al., 2017)](https://arxiv.org/abs/1701.06538) — 开创性论文，提出稀疏门控 MoE 层
- [Switch Transformer (Fedus et al., 2022)](https://arxiv.org/abs/2101.03961) — 将 MoE 扩展到万亿参数级别，定义了 Top-1 路由和辅助损失
- [DeepSeek-V3 Technical Report (DeepSeek-AI, 2024)](https://arxiv.org/abs/2412.19437) — 671B 参数 MoE 模型，Loss-Free Balancing 和 Multi-Token Prediction
- [Auxiliary-Loss-Free Load Balancing Strategy for MoE (Wang et al., 2024)](https://arxiv.org/abs/2408.15664) — Loss-Free Balancing 的原始论文
- [ST-MoE: Stable and Transferable MoE (Zoph et al., 2022)](https://arxiv.org/abs/2202.08906) — Router Z-Loss 和系统性的 MoE 稳定性研究
- [Mixtral of Experts (Mistral AI, 2024)](https://mistral.ai/news/mixtral-of-experts/) — 开源 MoE 模型标杆
- [Jamba: Hybrid Transformer-Mamba Language Models (AI21 Labs, 2024)](https://arxiv.org/abs/2403.19887) — MoE + SSM 混合架构的开创性实践
- [Mixture of Experts in Large Language Models (Zhang et al., 2025)](https://arxiv.org/abs/2507.11181) — 全面的 MoE 综述论文
- [A Visual Guide to Mixture of Experts (Maarten Grootendorst, 2024)](https://newsletter.maartengrootendorst.com/p/a-visual-guide-to-mixture-of-experts) — 极佳的 MoE 可视化教程
- [Scaling Large MoE Models with Wide Expert Parallelism (NVIDIA, 2025)](https://developer.nvidia.com/blog/scaling-large-moe-models-with-wide-expert-parallelism-on-nvl72-rack-scale-systems/) — 大规模 MoE 推理并行策略
