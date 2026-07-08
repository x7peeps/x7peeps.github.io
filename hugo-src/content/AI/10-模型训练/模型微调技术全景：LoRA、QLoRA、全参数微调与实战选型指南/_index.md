---
title: "模型微调技术全景：LoRA、QLoRA、全参数微调与实战选型指南"
weight: 2
tags: [LoRA, QLoRA, PEFT, 全参数微调, DoRA, 模型训练, 微调]
menu: 
  main: 
    parent: "模型训练"
---

# 模型微调技术全景：LoRA、QLoRA、全参数微调与实战选型指南

大语言模型（LLM）的预训练已经形成了"少数巨头训练基座模型、大量开发者微调适配任务"的生态格局。然而，全参数微调一个 7B 模型就需要 100-120GB 显存——这意味着你需要至少 2 张 H100 80GB 才能跑起来一次训练。对于绝大多数团队来说，这不是一个可以随意承担的成本。

好消息是，Parameter-Efficient Fine-Tuning（PEFT）技术的成熟彻底改变了这个局面。**LoRA 让你在单张 RTX 4090 上就能微调 7B 模型，QLoRA 更进一步——同一张卡可以微调 30B 甚至 70B 的模型**。这些技术将显存需求降低了 10-20 倍，同时保留了全参数微调 90-95% 的效果。

本文不讨论"什么是微调"这类入门概念，而是以工程实践视角系统梳理当前主流的微调方法——从全参数微调到 LoRA、QLoRA，再到 DoRA、AdaLoRA 等前沿变体，帮助你在资源约束下做出最优的微调策略选择。

---

## 1. 微调方法全景：为什么要区分这么多方案

### 1.1 微调的本质：在预训练知识上叠加任务能力

预训练模型在海量语料上学习了通用的语言理解和生成能力，但它并不知道你的具体任务格式、领域术语或输出偏好。微调的核心目标是：**用少量领域数据，在不破坏预训练知识的前提下，让模型适配特定任务**。

不同方法的本质区别在于"改什么"和"改多少"：

| 维度 | 全参数微调 | LoRA 系列 | Adapter / Prefix |
| :--- | :--- | :--- | :--- |
| **改动范围** | 所有参数 | 低秩适配矩阵 | 插入层 / 虚拟 token |
| **可训练参数占比** | ~100% | 0.5-5% | 1-10% |
| **显存需求（7B）** | 100-120GB | 16-24GB | 20-30GB |
| **推理延迟增加** | 无 | 无（可合并） | 有 |
| **任务切换成本** | 需保存完整模型 | 仅保存适配器 | 仅保存模块 |
| **质量上限** | 最高 | 接近全参数 | 因方法而异 |

### 1.2 选型决策树

```
┌──────────────────────────────────────────────────────┐
│              你需要微调模型吗？                          │
│   Prompt Engineering 能解决？ → 不需要微调              │
│   RAG 能解决？ → 不需要微调                            │
│   需要改变模型行为/风格/格式？ → 需要微调               │
└─────────────────────┬────────────────────────────────┘
                      ▼
┌──────────────────────────────────────────────────────┐
│              你的 GPU 显存是多少？                       │
│   ≤ 24GB → QLoRA（4-bit 量化 + LoRA）                 │
│   24-80GB → LoRA（16-bit 全精度 + 低秩适配）           │
│   ≥ 80GB（多卡）→ 全参数微调 / LoRA（更高 rank）       │
└─────────────────────┬────────────────────────────────┘
                      ▼
┌──────────────────────────────────────────────────────┐
│              你的任务需要什么级别？                       │
│   快速验证 / 原型 → LoRA r=16                          │
│   生产级质量 → LoRA r=64-128 或 DoRA                  │
│   最高质量 / 安全关键 → 全参数微调                      │
└──────────────────────────────────────────────────────┘
```

---

## 2. 全参数微调：基准线与天花板

全参数微调（Full Fine-Tuning）是最直接的方法：更新预训练模型的所有参数。它提供了质量上限，但也代表了资源消耗的上限。

### 2.1 工作原理

全参数微调的数学表达非常简单：

```
W_updated = W - η · ∇L(W)
```

其中 `W` 是预训练权重矩阵，`∇L(W)` 是损失函数对所有参数的梯度，`η` 是学习率。**每一个参数都参与梯度计算和更新**。

### 2.2 显存开销分析

全参数微调的显存由四部分构成：

| 组件 | 7B 模型 (bf16) | 70B 模型 (bf16) |
| :--- | :--- | :--- |
| **模型参数** | 14GB | 140GB |
| **优化器状态（AdamW）** | 28GB | 280GB |
| **梯度** | 14GB | 140GB |
| **激活值（gradient checkpointing）** | ~8-16GB | ~80-160GB |
| **总计** | **~64-72GB** | **~640-720GB** |

> AdamW 优化器为每个参数维护两个状态（一阶矩和二阶矩），因此优化器状态的显存占用是模型参数的 2 倍。

### 2.3 适用场景

全参数微调在以下场景中仍然是最佳选择：

- **预训练续训（Continual Pre-Training）**：需要注入大量新知识（如领域语料），低秩适配的容量不够
- **模型合并（Model Merging）**：需要将多个任务的能力融合到一个模型中
- **安全关键任务**：不允许任何精度损失的场景
- **数据量极大**：当训练数据量超过 10 万条时，全参数微调的过拟合风险反而低于 LoRA

---

## 3. LoRA：低秩适配的工程革命

### 3.1 核心思想：学习变化量，而非权重本身

LoRA（Low-Rank Adaptation）由微软在 2022 年提出，其核心洞察是：**微调过程中的权重更新矩阵 ΔW 具有低秩特性**。也就是说，虽然权重矩阵可能有数千行数千列，但有意义的变化通常集中在一个低维子空间中。

基于这个洞察，LoRA 不直接更新原始权重 W，而是学习两个小矩阵 A 和 B，使得：

```
Y = (W + B·A) · X

其中：
  W ∈ R^(d×d)        — 冻结的预训练权重
  A ∈ R^(r×d)        — 降维矩阵（可训练）
  B ∈ R^(d×r)        — 升维矩阵（可训练）
  r << d              — 秩（rank），通常 8-64
```

**关键优势**：训练时只更新 A 和 B，参数量仅为 `2 × d × r`。以 rank=16、d=4096 为例，可训练参数仅 131K，不到原始参数 16.8M 的 0.8%。

### 3.2 推理零开销的秘密

LoRA 最精妙的工程设计是：**训练结束后，适配器可以合并到原始权重中**。

```python
# 合并前
W_effective = W + B @ A

# 合并后：推理时与原始模型完全相同的计算图
W_merged = W + B @ A  # 一次性合并
output = W_merged @ x  # 与原始模型完全相同的推理路径
```

合并后的模型在推理时没有任何额外延迟，这是 LoRA 相比 Adapter 等方法的核心优势。

### 3.3 实战代码：使用 Hugging Face PEFT 训练 LoRA

```python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments
from peft import LoraConfig, get_peft_model
from trl import SFTTrainer

model_name = "meta-llama/Llama-3.1-8B-Instruct"

model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.bfloat16,
    device_map="auto",
)
tokenizer = AutoTokenizer.from_pretrained(model_name)

lora_config = LoraConfig(
    r=64,
    lora_alpha=128,
    lora_dropout=0.05,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                     "gate_proj", "up_proj", "down_proj"],
    bias="none",
    task_type="CAUSAL_LM",
)

model = get_peft_model(model, lora_config)
model.print_trainable_parameters()

training_args = TrainingArguments(
    output_dir="./lora_output",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=8,
    learning_rate=2e-4,
    weight_decay=0.01,
    warmup_ratio=0.03,
    lr_scheduler_type="cosine",
    bf16=True,
    gradient_checkpointing=True,
    logging_steps=10,
    save_strategy="steps",
    save_steps=500,
    max_grad_norm=1.0,
    report_to="wandb",
)

trainer = SFTTrainer(
    model=model,
    args=training_args,
    train_dataset=dataset,
    tokenizer=tokenizer,
    max_seq_length=2048,
)

trainer.train()

model.merge_and_unload()
model.save_pretrained("./merged_model")
```

### 3.4 关键超参数调优

**Rank（r）**是 LoRA 最核心的超参数。rank 越高，可训练参数越多，表达能力越强，但也越容易过拟合。

| rank | 可训练参数（7B） | 显存（7B） | 适用场景 |
| :--- | :--- | :--- | :--- |
| 8 | ~5M (0.07%) | ~16GB | 简单任务适配（格式调整、风格迁移） |
| 16 | ~10M (0.14%) | ~17GB | 通用微调的默认起点 |
| 32 | ~20M (0.29%) | ~18GB | 复杂任务（多步推理、代码生成） |
| 64 | ~40M (0.57%) | ~20GB | 高质量生产级微调 |
| 128 | ~80M (1.14%) | ~24GB | 接近全参数效果的 LoRA 微调 |

> **经验法则**：`lora_alpha` 设为 `rank` 的 2 倍。例如 rank=64 时，lora_alpha=128。这个比例在实践中被广泛验证有效。

**Target Modules** 的选择同样重要。研究表明，LoRA 应该应用到**所有线性层**而非仅 attention 层：

| 目标模块 | 参数量增加 | 效果提升 | 推荐度 |
| :--- | :--- | :--- | :--- |
| `q_proj, v_proj` | 最少 | 基础 | 仅用于快速验证 |
| `q_proj, k_proj, v_proj, o_proj` | 中等 | 良好 | 默认推荐 |
| 上述 + `gate_proj, up_proj, down_proj` | 最多 | 最佳 | 生产级微调 |

---

## 4. QLoRA：让 70B 模型在消费级 GPU 上微调

### 4.1 核心创新：4-bit 量化 + LoRA

QLoRA（Quantized LoRA）由华盛顿大学在 2023 年提出，核心思想极其精巧：**将预训练模型权重量化到 4-bit 以节省显存，同时用全精度的 LoRA 适配器进行训练**。

```
┌─────────────────────────────────────────────────────────┐
│                   QLoRA 训练架构                          │
│                                                          │
│   预训练模型（4-bit NF4 量化）                             │
│   ┌──────────────────────────────────┐                  │
│   │  W_4bit（冻结，每个参数仅 0.5 字节）│                  │
│   └──────────────────────────────────┘                  │
│                    ↓ 前向传播时反量化                       │
│   ┌──────────────────────────────────┐                  │
│   │  W_dequant（bf16，临时反量化）     │                  │
│   └──────────────────────────────────┘                  │
│                    +                                     │
│   ┌──────────────────────────────────┐                  │
│   │  LoRA 适配器（bf16，可训练）       │                  │
│   │  A ∈ R^(r×d), B ∈ R^(d×r)       │                  │
│   └──────────────────────────────────┘                  │
│                    =                                     │
│            Y = W_dequant·X + B·A·X                       │
│                                                          │
│   优化器状态（仅针对 LoRA 参数，bf16）                      │
└─────────────────────────────────────────────────────────┘
```

### 4.2 三大显存优化技术

**4-bit NormalFloat（NF4）量化**：不同于标准的 INT4 整数量化，NF4 是一种信息论最优的数据类型，专为正态分布的权重设计。由于预训练权重近似服从正态分布，NF4 比 INT4 在同等位宽下保留了更多信息。

**双重量化（Double Quantization）**：量化过程需要存储每个 block 的量化常数（scale 和 zero_point）。QLoRA 对这些常数本身也进行量化（从 FP32 量化到 FP8），进一步节省约 0.37GB/B 参数的显存。

**分页优化器（Paged Optimizers）**：利用 NVIDIA 的统一内存特性，在 GPU 显存不足时将优化器状态自动卸载到 CPU 内存，防止 OOM 崩溃。

### 4.3 实战代码：使用 bitsandbytes 配置 QLoRA

```python
import torch
from transformers import AutoModelForCausalLM, BitsAndBytesConfig
from peft import LoraConfig, get_peft_model

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)

model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.1-70B-Instruct",
    quantization_config=bnb_config,
    device_map="auto",
)

lora_config = LoraConfig(
    r=64,
    lora_alpha=128,
    lora_dropout=0.05,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                     "gate_proj", "up_proj", "down_proj"],
    bias="none",
    task_type="CAUSAL_LM",
)

model = get_peft_model(model, lora_config)
model.print_trainable_parameters()
# 输出类似：trainable params: 83,886,080 || all params: 70,181,836,800 || trainable%: 0.12%
```

> 这段代码可以在单张 A100 80GB 上微调 70B 模型。在单张 RTX 4090 24GB 上，微调 8B 模型绰绰有余。

### 4.4 QLoRA vs LoRA：质量差距有多大

根据多项研究和实测数据，QLoRA 相比标准 LoRA 的质量损失通常在 1-3% 以内，具体取决于任务类型：

| 任务类型 | LoRA 质量 | QLoRA 质量 | 差距 |
| :--- | :--- | :--- | :--- |
| 指令跟随 | 95% | 92-93% | 2-3% |
| 文本分类 | 93% | 91-92% | 1-2% |
| 代码生成 | 90% | 87-89% | 2-3% |
| 数学推理 | 88% | 84-86% | 3-4% |

> 量化噪声对需要精确数值计算的任务（数学推理）影响更大，对语言理解和生成任务影响较小。

---

## 5. 显存需求全景对照表

选择微调方法时，显存是最直接的硬约束。以下是各模型规模在不同方法下的显存需求估算：

| 方法 | 7B | 13B | 30B | 70B |
| :--- | :--- | :--- | :--- | :--- |
| **全参数（bf16）** | 60-80GB | 120-160GB | 280-350GB | 600-800GB |
| **全参数 + FSDP×4** | 20-24GB | 40-48GB | 80-96GB | 160-200GB |
| **LoRA（bf16）** | 16-24GB | 32-48GB | 64-80GB | 140-180GB |
| **QLoRA（4-bit）** | 6-10GB | 12-18GB | 24-40GB | 48-80GB |
| **QLoRA（2-bit）** | 4-6GB | 8-12GB | 16-24GB | 24-48GB |

对应的 GPU 选型参考：

| GPU | 显存 | 适合的微调方式 |
| :--- | :--- | :--- |
| **RTX 3090 / 4090** | 24GB | QLoRA 微调 7-13B；LoRA 微调 7B |
| **A100 40GB** | 40GB | LoRA 微调 13B；QLoRA 微调 30B |
| **A100 80GB** | 80GB | LoRA 微调 30B；QLoRA 微调 70B |
| **H100 80GB** | 80GB | LoRA 微调 70B（需多卡）；全参微调 7B |
| **4× H100 80GB** | 320GB | 全参微调 30B；LoRA 微调 70B |

---

## 6. PEFT 前沿变体：超越标准 LoRA

标准 LoRA 已经非常强大，但研究者们发现了它的两个核心局限：**固定 rank 假设**（所有层使用相同的适配容量）和**方向-幅度耦合**（更新的方向和幅度无法独立控制）。2024-2025 年涌现了一批新方法来解决这些问题。

### 6.1 DoRA：分离方向与幅度

DoRA（Weight-Decomposed Low-Rank Adaptation）将权重矩阵分解为**幅度（magnitude）**和**方向（direction）**两个分量，然后分别适配：

```
W_DoRA = m · (W₀ + B·A) / ‖W₀ + B·A‖_c

其中：
  m ∈ R^d         — 可学习的幅度向量（每列一个标量）
  (W₀ + B·A)      — 方向分量（标准 LoRA）
  ‖·‖_c            — 列归一化
```

**为什么这有效**：在微调过程中，某些层需要大幅改变注意力方向但保持幅度稳定，另一些层需要调整幅度但方向不变。标准 LoRA 无法独立控制这两个分量，而 DoRA 可以。

**实测收益**：在 commonsense reasoning 基准（HellaSwag、WinoGrande、ARC-Challenge）上，DoRA 比 LoRA 高出 1-3 个百分点，且仅增加 5-10% 的显存开销。

```python
from peft import LoraConfig

dora_config = LoraConfig(
    r=64,
    lora_alpha=128,
    lora_dropout=0.05,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                     "gate_proj", "up_proj", "down_proj"],
    use_dora=True,  # 启用 DoRA
)
```

> **注意**：DoRA 需要 PEFT >= 0.10 版本。低版本合并适配器时幅度分量会被错误处理，导致模型质量静默退化。

### 6.2 AdaLoRA：自适应 rank 分配

AdaLoRA（Adaptive Budget Allocation for PEFT）解决了"每层用相同 rank 是否合理"的问题。其核心思想是：**根据每层的重要性动态分配 rank**。

```
重要性评分：I_l = ‖∇A_l‖_F + ‖∇B_l‖_F

rank 分配：r_l ∝ I_l（重要性越高，分配越多 rank）
```

AdaLoRA 在训练过程中通过 SVD 剪枝，自动将参数预算集中到最重要的层和方向上。在自然语言理解和生成任务上，AdaLoRA 通常能在相同参数预算下获得 1-2% 的提升。

### 6.3 其他值得关注的变体

| 方法 | 核心创新 | 显存 vs LoRA | 质量 vs LoRA | 最佳适用场景 |
| :--- | :--- | :--- | :--- | :--- |
| **PiSSA** | SVD 初始化适配器 | 相同 | 收敛快 30-50% | 训练时间受限 |
| **VeRA** | 共享冻结适配器 + 可学习缩放 | 更低 | 略低 | 极度显存受限 |
| **GaLore** | 梯度低秩投影（非适配器） | +30-40% | 接近全参 | 追求全参质量 |
| **LoRA-FA** | 冻结 A 矩阵 | -15-25% | 略低 | 单卡 13-70B 微调 |
| **MoRA** | 高秩方阵适配器 | 相同 | +2-4% | 事实记忆、序列数据 |

---

## 7. 工程实践：从训练到部署的完整流水线

### 7.1 使用 Unsloth 加速微调

Unsloth 是当前最流行的 LoRA/QLoRA 训练加速工具，通过自定义 CUDA kernel 实现 2-5 倍训练加速和 60% 显存节省：

```python
from unsloth import FastLanguageModel

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="unsloth/Meta-Llama-3.1-8B-Instruct",
    max_seq_length=2048,
    load_in_4bit=True,
)

model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                     "gate_proj", "up_proj", "down_proj"],
    lora_alpha=32,
    lora_dropout=0.05,
    use_gradient_checkpointing="unsloth",
    random_state=3407,
)
```

> Unsloth 在 2026 年版本中已支持 DoRA（`use_dora=True`），且融合后的推理速度与标准 LoRA 内核一致。

### 7.2 数据准备规范

微调数据的质量和格式直接决定训练效果。以下是经过实践验证的数据格式规范：

```json
{
  "instruction": "将以下英文翻译为中文",
  "input": "The quick brown fox jumps over the lazy dog.",
  "output": "敏捷的棕色狐狸跳过了懒狗。"
}
```

**数据质量 checklist**：

- **去重**：重复数据会导致模型过拟合到特定模式
- **长度过滤**：丢弃过短（< 10 token）或过长（超出上下文窗口）的样本
- **格式一致性**：所有样本遵循相同的 instruction-input-output 格式
- **难度分布**：简单、中等、困难样本按 4:4:2 比例分布
- **数据量参考**：500-1000 条高质量数据即可产生明显效果，5000-10000 条通常能达到最优

### 7.3 训练监控与早停

```python
from transformers import TrainingArguments, TrainerCallback

class OverfitDetector(TrainerCallback):
    def __init__(self, patience=3):
        self.patience = patience
        self.best_val_loss = float("inf")
        self.wait = 0

    def on_evaluate(self, args, state, control, metrics, **kwargs):
        val_loss = metrics.get("eval_loss", float("inf"))
        if val_loss < self.best_val_loss:
            self.best_val_loss = val_loss
            self.wait = 0
        else:
            self.wait += 1
            if self.wait >= self.patience:
                control.should_training_stop = True
                print(f"Early stopping: val_loss hasn't improved for {self.patience} evaluations")
```

**何时停止训练**：

- 验证 loss 连续 3 轮不下降 → 立即停止
- 训练 loss 下降但验证 loss 上升 → 过拟合信号，降低学习率或增加数据
- loss 出现 NaN → 学习率过高或数据中存在异常值

### 7.4 适配器合并与模型导出

```python
from peft import PeftModel
from transformers import AutoModelForCausalLM

base_model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.1-8B-Instruct",
    torch_dtype=torch.bfloat16,
)

merged_model = PeftModel.from_pretrained(base_model, "./lora_output/checkpoint-500")
merged_model = merged_model.merge_and_unload()

merged_model.save_pretrained("./merged_model")
tokenizer.save_pretrained("./merged_model")
```

合并后的模型可以直接用 vLLM、TGI、llama.cpp 等推理引擎加载，无需额外适配。

---

## 8. 方法选型速查表

综合前文的分析，以下是面向实际工程场景的选型速查表：

| 场景 | 推荐方法 | 理由 |
| :--- | :--- | :--- |
| **单卡 24GB 微调 8B** | QLoRA r=16 | 显存刚好够用，质量损失可接受 |
| **单卡 48GB 微调 13B** | LoRA r=32 | 全精度训练，质量最优 |
| **多卡 320GB 微调 70B** | QLoRA r=64 | 显存效率最优 |
| **追求最高质量** | DoRA r=64 | 比 LoRA 高 1-3%，显存仅多 5-10% |
| **极度显存受限** | VeRA / LoRA-FA | 牺牲少量质量换取极致显存效率 |
| **训练时间受限** | PiSSA | 收敛速度快 30-50% |
| **多任务多适配器** | LoRA r=32 | 每个任务一个适配器文件，切换零成本 |
| **预训练续训 / 知识注入** | 全参数微调 | 低秩适配容量不足以注入大量新知识 |
| **事实记忆增强** | MoRA | 高秩适配器更适合记忆密集型任务 |

---

## 9. 常见陷阱与最佳实践

### 9.1 避免这些错误

**错误 1：rank 设得过高**。rank 超过 64 后，继续提高通常不会带来显著收益，反而增加过拟合风险。对于大多数任务，rank=16-32 是最优区间。

**错误 2：只对 attention 层做 LoRA**。仅对 `q_proj` 和 `v_proj` 应用 LoRA 会显著限制模型的适配能力。**务必对所有线性层（包括 FFN 层）应用 LoRA**。

**错误 3：使用过大的学习率**。LoRA 的参数量小，对学习率更敏感。推荐起始学习率为 `2e-4` 到 `5e-4`，比全参数微调高一个数量级。

**错误 4：多 epoch 训练静态数据集**。对于固定的训练集，多 epoch 训练几乎总是导致过拟合。**1-3 个 epoch 通常是最佳选择**。

**错误 5：忽略数据质量**。1000 条精心策展的数据远胜 10000 条粗制滥造的数据。数据清洗和格式一致性是微调成功的基石。

### 9.2 推荐训练配置

| 参数 | 推荐值 | 说明 |
| :--- | :--- | :--- |
| `learning_rate` | 2e-4 ~ 5e-4 | LoRA 特有的最优区间 |
| `lr_scheduler` | cosine | 余弦退火最稳定 |
| `warmup_ratio` | 0.03-0.05 | 前 3-5% 步数做 warmup |
| `weight_decay` | 0.01 | 标准正则化 |
| `epochs` | 1-3 | 静态数据集不超过 3 |
| `batch_size` | 4-8 | 配合 gradient_accumulation |
| `max_seq_length` | 1024-2048 | 根据任务调整 |
| `bf16` | True | 比 fp16 更稳定 |

---

## 10. 总结与展望

- **LoRA 是当前微调的事实标准**：它在显存效率、推理零开销、任务切换灵活性之间取得了最佳平衡，适用于绝大多数生产级微调场景

- **QLoRA 是资源受限场景的救星**：4-bit 量化让 70B 模型在单张 A100 上微调成为现实，质量损失通常在 2-3% 以内，是个人开发者和小团队的首选

- **DoRA 是质量敏感场景的升级路径**：通过解耦方向和幅度，DoRA 在仅增加 5-10% 显存的前提下，缩小了 LoRA 与全参数微调的差距

- **全参数微调仍有不可替代的场景**：预训练续训、大规模知识注入、安全关键任务仍然需要全参数微调的表达能力

- **选型的核心是"约束驱动"**：先确定显存预算和质量要求，再选择对应的微调方法，而不是反过来

> **未来趋势**：PEFT 方法正在从"单一适配器"向"多适配器编排"演进——同一个基座模型通过加载不同的 LoRA 适配器来服务不同任务，这种"基座 + 适配器"的范式正在成为 LLM 部署的主流架构。同时，GaLore 等梯度投影方法代表了另一条路线——不修改模型结构，而是从优化器层面实现显存效率，未来可能与 LoRA 系列形成互补。

## 参考资源

- [LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685) — 微软 2022 年原始论文，定义了低秩适配方法
- [QLoRA: Efficient Finetuning of Quantized LLMs](https://arxiv.org/abs/2305.14314) — 华盛顿大学 2023 年论文，4-bit 量化 + LoRA 的开创性工作
- [DoRA: Weight-Decomposed Low-Rank Adaptation](https://arxiv.org/abs/2402.09353) — 2024 年，解耦方向与幅度的改进方案
- [AdaLoRA: Adaptive Budget Allocation for PEFT](https://arxiv.org/abs/2303.10512) — 自适应 rank 分配方法
- [GaLore: Memory-Efficient LLM Training by Gradient Low-Rank Projection](https://arxiv.org/abs/2403.03507) — 梯度低秩投影方法
- [Hugging Face PEFT](https://huggingface.co/docs/peft) — 主流 PEFT 工具库，支持 LoRA/QLoRA/DoRA/AdaLoRA 等
- [Unsloth](https://github.com/unslothai/unsloth) — 高性能 LoRA/QLoRA 训练加速框架
- [bitsandbytes](https://github.com/TimDettmers/bitsandbytes) — 4-bit/8-bit 量化库，QLoRA 的核心依赖
- [Practical Tips for Finetuning LLMs](https://magazine.sebastianraschka.com/p/practical-tips-for-finetuning-llms) — Sebastian Raschka 的 LoRA 实验总结
