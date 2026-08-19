---
title: "模型量化与压缩技术：GPTQ、AWQ、GGUF与FP8的工程实践指南"
weight: 4
tags: [量化, Quantization, GPTQ, AWQ, GGUF, FP8, 模型压缩, LLM部署]
menu:
  main:
    parent: "AI模型训练"
---

# 模型量化与压缩技术：GPTQ、AWQ、GGUF与FP8的工程实践指南

大语言模型的参数规模在过去五年呈指数级增长——从 GPT-2 的 15 亿参数到 LLaMA-3.1-405B 的 4050 亿参数，再到 DeepSeek-V3 的 6710 亿参数。然而 GPU 的显存容量增长远不及模型规模的扩张速度。以 FP16 精度存储一个 70B 模型需要约 **140GB 显存**，而一块 H100 SXM5 的显存仅为 80GB。**量化（Quantization）** 正是打破这一瓶颈的关键技术。

2025-2026 年，量化技术生态已经高度成熟：GPTQ、AWQ、GGUF 三大方案各有明确的适用场景，FP8 在 Hopper/Blackwell GPU 上成为生产级部署的"黄金标准"，KV Cache 量化则让长上下文推理成为可能。本文将从量化基础原理出发，系统梳理当前主流量化方案的技术差异、精度表现与工程实践，帮助工程师在精度、速度和显存之间找到最优平衡点。

---

## 1. 量化基础：从浮点到定点的核心原理

### 1.1 为什么需要量化？

量化的核心思路是将模型的权重和/或激活值从高精度浮点数（FP32/BF16）转换为低精度数值表示（INT8/INT4/FP8），从而：

- **压缩显存**：INT4 相比 FP16 可节省 **75% 显存**（140GB → 35GB for 70B 模型）
- **加速推理**：低精度计算吞吐量更高（H100 FP8 理论峰值 3958 TFLOPS，FP16 仅 1979 TFLOPS）
- **降低带宽压力**：Transformer 解码阶段往往受内存带宽约束，更小的数据宽度直接减少内存读取量

**核心挑战**：简单截断取整会引入量化误差，导致模型质量下降。量化研究的精髓在于如何以最小精度损失换取最大压缩比。

### 1.2 数值精度体系

在深入量化算法之前，需要先理解常见的数值格式：

| 精度格式 | 位宽 | 每参数存储 | 相对 FP32 压缩比 | 典型用途 |
| :--- | :--- | :--- | :--- | :--- |
| **FP32** | 32-bit | 4 bytes | 1× | 训练基线、高精度推理 |
| **BF16** | 16-bit | 2 bytes | 2× | 训练和推理的主流格式 |
| **FP16** | 16-bit | 2 bytes | 2× | GPU 推理标准格式 |
| **FP8 (E4M3)** | 8-bit | 1 byte | 4× | Hopper+ GPU 生产级推理 |
| **INT8** | 8-bit | 1 byte | 4× | 通用量化基线 |
| **INT4** | 4-bit | 0.5 byte | 8× | 显存受限的极致压缩 |

**BF16 vs FP16**：BF16 保留了 FP32 的指数范围（8 位指数），数值范围更大但精度略低；FP16 精度更高（10 位尾数）但动态范围较小。对于深度学习，BF16 在训练中更稳定，FP16 在推理中更常用。

### 1.3 均匀量化的核心公式

量化将连续的浮点值映射到离散的整数网格上。给定输入张量 $X$：

**量化公式**：
$$X_q = \text{clamp}\left(\text{round}\left(\frac{X}{s}\right) + z,\ 0,\ 2^b - 1\right)$$

**反量化公式**：
$$\hat{X} = s \cdot (X_q - z)$$

其中 $s$ 是缩放因子（scale），$z$ 是零点（zero-point），$b$ 是量化位宽。

**对称量化**（$z = 0$）适合权重——因为权重分布往往近似对称。**非对称量化**（$z \neq 0$）适合激活值——因为 ReLU 等激活函数产生的分布通常偏向正值。

> 量化误差由两部分组成：**截断误差**（极值被裁剪）和**舍入误差**（精度损失）。分组量化（Group Quantization）将权矩阵分成若干组（如每 128 个元素一组），每组独立计算缩放因子，是当前所有主流量化方案的共同策略。

---

## 2. 三大主流量化方案：GPTQ、AWQ、GGUF

当前 LLM 量化生态形成了三大主流方案，各自有明确的技术路线和适用场景。理解它们的差异是做出正确选型的前提。

```
┌──────────────────────────────────────────────────────────────┐
│                    量化方案决策矩阵                            │
├──────────────────────────────────────────────────────────────┤
│  目标硬件                                                     │
│  ├── CPU / Apple Silicon / 边缘设备 ──────→ GGUF             │
│  ├── NVIDIA GPU（纯推理） ─────────────────→ GPTQ 或 AWQ      │
│  └── Hopper+ GPU（生产级） ────────────────→ FP8             │
│                                                              │
│  核心需求                                                     │
│  ├── 追求极致吞吐量 ──────────────────────→ GPTQ + Marlin    │
│  ├── 追求最佳质量保留 ────────────────────→ AWQ              │
│  └── 追求跨平台灵活性 ────────────────────→ GGUF             │
└──────────────────────────────────────────────────────────────┘
```

### 2.1 GPTQ：基于 Hessian 的精确权重量化

**GPTQ**（Frantar et al., ICLR 2023）是目前 GPU 推理场景中最成熟的后训练量化（Post-Training Quantization, PTQ）方法之一。

#### 核心原理

GPTQ 源自最优脑手术（Optimal Brain Surgeon, OBS）框架，其核心思想是：**在量化每个权重时，利用 Hessian 矩阵的逆来最小化输出误差，并将量化误差补偿到同层的剩余权重上**。

对于权重矩阵 $W$，GPTQ 求解的优化目标为：

$$\min_{\hat{W}} \|WX - \hat{W}X\|_F^2$$

其中 $H = X^TX$ 是 Hessian 矩阵，提供了损失函数曲率的关键信息。

#### 关键特性

- **量化级别**：支持 8/4/3/2-bit 权重量化
- **校准数据**：需要少量校准数据（通常 128-512 条样本）来计算 Hessian 信息
- **逐层处理**：按层独立量化，误差在层内补偿
- **推理时动态反量化**：权重在计算时从 INT4 动态反量化回 FP16

#### 实战代码

```python
from transformers import AutoModelForCausalLM, GPTQConfig, AutoTokenizer

quantization_config = GPTQConfig(
    bits=4,
    dataset="c4",
    group_size=128,
    desc_act=True,
)

model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.1-8B",
    quantization_config=quantization_config,
    device_map="auto",
)
tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-3.1-8B")

text = "The future of AI is"
inputs = tokenizer(text, return_tensors="pt").to(model.device)
outputs = model.generate(**inputs, max_new_tokens=50)
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

#### 性能特点

**GPTQ + Marlin 内核**：Marlin 是为 GPTQ 量化的 INT4 权重设计的优化 CUDA 内核。使用相同的 GPTQ 权重，Marlin 内核可实现 **2.5 倍的推理加速**，是当前 NVIDIA GPU 上吞吐量最高的 4-bit 推理方案。

| 配置 | 吞吐量提升 | 精度保留 | 适用场景 |
| :--- | :--- | :--- | :--- |
| GPTQ (基础内核) | 基准 | ~90% | 通用 GPU 推理 |
| GPTQ + Marlin | 2.5× | ~90% | 追求极致吞吐量 |
| GPTQ + ExLlamaV2 | 2× | ~90% | 离线批量推理 |

### 2.2 AWQ：激活感知的智能权重量化

**AWQ**（Lin et al., MLSys 2024 最佳论文）从一个关键洞察出发：**不是所有权重都同等重要——被大激活值放大的权重通道对模型输出影响更大**。

#### 核心原理

假设权重 $W$ 和激活 $X$ 的输出为 $Y = W \times X$。当 $X$ 的某些通道值很大时，$W$ 对应通道中的任何量化误差都会被放大。AWQ 的策略是：

1. 用少量校准数据统计每个权重通道的**平均激活幅度**
2. 识别出最重要的 **1% 显著权重通道**（salient channels）
3. 在量化前对这些通道进行**缩放保护**，通过可学习的缩放因子 $\alpha$ 控制保护程度

```
┌─────────────────────────────────────────────────────┐
│            AWQ 量化流程示意                           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  输入：权重 W + 校准数据激活 X                        │
│       ↓                                             │
│  Step 1：统计通道级平均激活幅度                        │
│       ↓                                             │
│  Step 2：识别 salient channels（Top 1%）             │
│       ↓                                             │
│  Step 3：搜索最优缩放因子 α                           │
│       ↓                                             │
│  Step 4：对 salient channels 做 scale 保护            │
│       ↓                                             │
│  Step 5：执行标准分组量化                              │
│       ↓                                             │
│  输出：量化权重 + scale/zero-point 元数据             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### 关键特性

- **精度保留最优**：4-bit 量化下约 **95% 质量保留**，显著优于 GPTQ
- **无需反向传播**：不需要梯度计算，量化速度更快
- **无需重构权重**：不像 GPTQ 那样将误差补偿到其他权重
- **校准数据需求极小**：通常 128 条样本即可

#### 实战代码

```python
from awq import AutoAWQForCausalLM
from transformers import AutoTokenizer

model_path = "meta-llama/Llama-3.1-8B"
quant_path = "Llama-3.1-8B-AWQ"

model = AutoAWQForCausalLM.from_pretrained(model_path)
tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)

quant_config = {
    "zero_point": True,
    "q_group_size": 128,
    "w_bit": 4,
    "version": "GEMM",
}

model.quantize(
    tokenizer,
    quant_config=quant_config,
    calib_data="pileval",
)

model.save_quantized(quant_path)
tokenizer.save_pretrained(quant_path)
```

#### 质量对比数据

基于 Llama 3.1 8B 在 MMLU/GSM8K/HumanEval 上的评测：

| 方法 | MMLU 准确率 | 相对基线下降 |
| :--- | :--- | :--- |
| FP16 基线 | 87.5 | — |
| **AWQ 4-bit** | **86.8** | **-0.7** |
| GGUF Q4_K_M | 85.9 | -1.6 |
| GPTQ 4-bit | 84.7 | -2.8 |

> **AWQ 在质量保留上全面领先**，尤其适合对输出质量敏感的场景：代码生成、创意写作、多轮对话等。

### 2.3 GGUF：跨平台推理的标准格式

**GGUF** 并非一种量化算法，而是由 llama.cpp 团队设计的**二进制文件格式**，用于在 CPU 和 Apple Silicon 上高效存储和推理量化模型。

#### 核心特点

- **跨平台兼容**：同一模型文件可在 Linux、macOS、Windows 上运行
- **CPU 原生支持**：无需 GPU 即可推理（llama.cpp）
- **GPU Offload**：可将部分层卸载到 GPU 加速
- **丰富的量化格式**：从 Q2_K 到 Q8_0，覆盖 2-bit 到 8-bit
- **单文件分发**：所有权重和元数据打包在一个 .gguf 文件中

#### K-quant 格式体系

GGUF 的核心创新是 **K-quant（K量化）** 格式，它在标准分组量化的基础上引入了**超块（superblock）** 结构和**重要性矩阵（importance matrix）** 技术：

| 量化格式 | 位宽 | 7B 模型大小 | Perplexity 增量 | 推荐场景 |
| :--- | :--- | :--- | :--- | :--- |
| **Q2_K** | 2-bit | ~2.7 GB | 较高 | 仅限实验/研究 |
| **Q3_K_M** | 3-bit | ~3.3 GB | 中等 | 内存极度受限 |
| **Q4_K_M** | 4-bit | ~4.1 GB | +0.06 ppl | **推荐默认选择** |
| **Q5_K_M** | 5-bit | ~5.0 GB | +0.03 ppl | 质量优先 |
| **Q6_K** | 6-bit | ~5.9 GB | +0.02 ppl | 接近无损 |
| **Q8_0** | 8-bit | ~7.7 GB | +0.01 ppl | 高保真基线 |

> **经验法则**：对于大多数用户，**Q4_K_M 是最佳默认选择**——它在质量、大小和速度之间取得了最佳平衡。如果质量是首要考量，选择 Q5_K_M。

#### 实战代码

```bash
# Step 1：将 Hugging Face 模型转换为 GGUF 格式
python convert_hf_to_gguf.py \
    --outfile model-f16.gguf \
    --outtype bf16 \
    meta-llama/Llama-3.1-8B

# Step 2：量化为 Q4_K_M
./llama-quantize model-f16.gguf model-q4_k_m.gguf Q4_K_M

# Step 3：使用 importance matrix 进一步优化（可选）
./llama-quantize \
    --imatrix imatrix.gguf \
    model-f16.gguf \
    model-q4_k_m-imatrix.gguf \
    Q4_K_M

# Step 4：运行推理
./llama-cli -m model-q4_k_m.gguf \
    -p "The future of AI is" \
    -n 100
```

也可以使用 Ollama 一键加载 GGUF 模型：

```bash
# 创建 Modelfile
echo 'FROM ./model-q4_k_m.gguf' > Modelfile

# 运行模型
ollama create my-model -f Modelfile
ollama run my-model
```

---

## 3. 三大方案横向对比

### 3.1 核心差异总结

| 维度 | GPTQ | AWQ | GGUF |
| :--- | :--- | :--- | :--- |
| **本质** | 量化算法 | 量化算法 | 文件格式 + 推理引擎 |
| **优化目标** | 最小化层输出 MSE | 保护显著权重通道 | 跨平台 CPU/GPU 推理 |
| **校准数据** | 必需（128-512 样本） | 必需（128 样本） | 可选（imatrix 提升质量） |
| **量化速度** | 中等 | 较快 | 较快 |
| **4-bit 质量保留** | ~90% | **~95%** | ~92% |
| **目标硬件** | NVIDIA GPU | GPU + Intel | CPU + Apple Silicon + GPU |
| **推理引擎** | vLLM, ExLlamaV2 | vLLM, TGI | llama.cpp, Ollama, LM Studio |
| **文件格式** | safetensors | safetensors | .gguf 单文件 |
| **社区活跃度** | 高 | 快速增长 | **最高** |

### 3.2 硬件兼容性矩阵

| 硬件 | GPTQ | AWQ | GGUF | FP8 |
| :--- | :--- | :--- | :--- | :--- |
| NVIDIA H100/H200 | ✅ | ✅ | ✅ | ✅（原生） |
| NVIDIA A100/A10 | ✅ | ✅ | ✅ | ❌ |
| NVIDIA RTX 4090/3090 | ✅ | ✅ | ✅ | ✅（有限） |
| AMD MI300X | ✅ | ✅ | ✅ | ✅ |
| Apple M 系列 | ❌ | ❌ | ✅（原生） | ❌ |
| 纯 CPU | ❌ | ❌ | ✅ | ❌ |

### 3.3 推理吞吐量对比

基于 H100 80GB，Llama 3.1 8B，不同方案的推理性能：

| 方案 | 吞吐量（tokens/s） | 显存占用 | 延迟（TTFT） |
| :--- | :--- | :--- | :--- |
| FP16 基线 | ~120 | ~16 GB | ~80 ms |
| GPTQ 4-bit + Marlin | ~280 | ~5 GB | ~45 ms |
| AWQ 4-bit (GEMM) | ~250 | ~5 GB | ~50 ms |
| GGUF Q4_K_M (GPU offload) | ~200 | ~5 GB | ~60 ms |
| FP8（H100 原生） | ~160 | ~8 GB | ~65 ms |

> **注意**：FP8 的吞吐量看似不如 GPTQ/AWQ，但它的优势在于**几乎无损**的质量保留（~99%）和**无需校准数据**的部署便利性。

---

## 4. 进阶量化技术

### 4.1 FP8：Hopper GPU 的生产级标准

**FP8** 是 2025-2026 年在 NVIDIA Hopper（H100/H200）和 Blackwell（B200）GPU 上迅速普及的量化方案。它包含两种格式：

- **E4M3**：4 位指数 + 3 位尾数，适合权重和激活值存储
- **E5M2**：5 位指数 + 2 位尾数，适合梯度存储（训练场景）

#### FP8 的核心优势

1. **近乎无损**：仅 0.1-0.3% 的 perplexity 增加
2. **原生硬件加速**：H100 Tensor Core 直接支持 FP8 运算
3. **无需量化脚本**：vLLM 一行参数即可启动
4. **支持动态量化**：无需校准数据，加载时自动转换

#### vLLM 部署 FP8

```bash
# Docker 一行启动 FP8 推理服务
docker run --gpus all \
    --ipc=host \
    -p 8000:8000 \
    vllm/vllm-openai:latest \
    --model meta-llama/Llama-3.3-70B-Instruct \
    --quantization fp8 \
    --max-model-len 8192 \
    --gpu-memory-utilization 0.92
```

```python
# Python API 方式
from vllm import LLM

llm = LLM(
    model="meta-llama/Llama-3.1-70B-Instruct",
    quantization="fp8",
    kv_cache_dtype="fp8",
    gpu_memory_utilization=0.92,
)
```

#### FP8 量化精度保留

使用 llm-compressor 进行离线 FP8 量化：

```python
from llmcompressor import oneshot
from llmcompressor.modifiers.quantization import QuantizationModifier

recipe = QuantizationModifier(
    targets="Linear",
    scheme="FP8_DYNAMIC",
    ignore=["lm_head"],
)

oneshot(
    model="meta-llama/Llama-3.1-8B-Instruct",
    recipe=recipe,
    output_dir="Llama-3.1-8B-FP8",
)
```

### 4.2 KV Cache 量化：长上下文推理的关键

KV Cache 是 Transformer 解码推理中存储历史 Key/Value 张量的缓存机制。随着上下文长度增加，**KV Cache 的显存占用可能超过模型权重本身**。

以 Llama 3.1-8B 为例：

| 精度 | 每 Token 缓存大小 | 32K 上下文 | 128K 上下文 |
| :--- | :--- | :--- | :--- |
| FP16 | 128 KiB | 4.0 GiB | 16.0 GiB |
| **FP8** | 64 KiB | **2.0 GiB** | **8.0 GiB** |
| INT4 | 32 KiB | 1.0 GiB | 4.0 GiB |

#### vLLM KV Cache FP8 配置

```python
from vllm import LLM

# 启用 FP8 KV Cache，显存减半
llm = LLM(
    model="meta-llama/Llama-3.1-70B-Instruct",
    quantization="fp8",
    kv_cache_dtype="fp8",
    calculate_kv_scales=True,  # 推荐：使用校准数据优化 scale
)
```

#### KV Cache 量化的注意事项

> **实战警告**：KV Cache 量化（尤其是 INT4）对 Agent、代码生成等复杂推理任务的质量影响可能比预期更大。社区反馈显示，FP8 KV Cache 在长上下文 Agent 工作负载中可能出现微妙的推理质量下降。**建议在生产环境部署前进行充分的任务级评测**。

**最佳实践**：

- **首选 FP8 KV Cache**：在 Hopper GPU 上，FP8 是 KV Cache 量化的最佳平衡点
- **INT4 KV Cache 需谨慎**：仅在显存极度受限且任务评测通过时使用
- **保留最近 Token 的精度**：最新的 R 个 Token 保持 FP16/FP8，旧 Token 更激进地量化

### 4.3 SmoothQuant：激活量化的突破

**SmoothQuant**（Xiao et al., 2023）解决了激活值量化的核心难题：激活中存在大幅离群值（outlier），直接量化会导致严重精度损失。

SmoothQuant 的策略是**将激活的量化难度"迁移"到权重上**：

$$Y = (X \cdot \text{diag}(s)^{-1}) \cdot (\text{diag}(s) \cdot W) = \hat{X} \hat{W}$$

通过逐通道缩放因子 $s$，将激活中的离群值幅度转移到权重上，使得 $X$ 和 $W$ 都变得更容易量化（W8A8）。

### 4.4 LLM.int8()：混合精度分解

**LLM.int8()**（Dettmers et al., 2022）发现了大模型中的**涌现特征（Emergent Features）**现象：当模型规模超过 6.7B 参数时，激活中会出现少量但关键的离群特征维度。

LLM.int8() 的处理策略：

1. 从输入隐藏状态中，按列提取**绝对值超过阈值**的离群特征
2. 对离群特征维度保持 **FP16 精度**计算
3. 对剩余维度执行 **INT8 量化**计算
4. 将两部分结果相加得到最终输出

这种混合精度分解使得 LLM.int8() 在 7B-175B 模型上几乎可以**无损恢复全部性能**。

---

## 5. 量化模型部署实战

### 5.1 量化选型决策树

```
你的 GPU 是什么？
│
├── H100/H200/B200（Hopper/Blackwell）
│   ├── 需要最高质量？──→ FP8 + FP8 KV Cache
│   ├── 需要极致吞吐量？──→ AWQ 4-bit + Marlin
│   └── 追求简单部署？──→ FP8（vLLM 一行启动）
│
├── A100/3090/4090（Ampere/Ada Lovelace）
│   ├── 显存足够放 FP16？──→ 直接用 FP16/BF16
│   └── 显存不够？
│       ├── 追求质量？──→ AWQ 4-bit
│       ├── 追求吞吐量？──→ GPTQ 4-bit + Marlin
│       └── 需要 CPU 推理？──→ GGUF Q4_K_M
│
└── CPU / Apple Silicon / 边缘设备
    └── GGUF Q4_K_M 或 Q5_K_M
```

### 5.2 完整部署流程

#### 场景一：GPU 服务器部署（vLLM + AWQ）

```bash
# 1. 安装依赖
pip install vllm autoawq

# 2. 启动推理服务（使用预量化的 AWQ 模型）
python -m vllm.entrypoints.openai.api_server \
    --model TheBloke/Llama-3.1-8B-AWQ \
    --quantization awq \
    --max-model-len 8192 \
    --gpu-memory-utilization 0.90 \
    --host 0.0.0.0 \
    --port 8000

# 3. 测试 API
curl http://localhost:8000/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{
        "model": "TheBloke/Llama-3.1-8B-AWQ",
        "messages": [{"role": "user", "content": "Hello!"}]
    }'
```

#### 场景二：本地推理（Ollama + GGUF）

```bash
# 1. 安装 Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. 创建自定义量化模型
cat > Modelfile << 'EOF'
FROM ./llama-3.1-8b-Q4_K_M.gguf
TEMPLATE """{{ .System }}
{{ .Prompt }}"""
PARAMETER temperature 0.7
PARAMETER top_p 0.9
EOF

# 3. 构建并运行
ollama create llama-local -f Modelfile
ollama run llama-local
```

#### 场景三：离线量化自己的模型

```bash
# 使用 AutoGPTQ 量化
pip install auto-gptq

python -c "
from transformers import AutoModelForCausalLM, GPTQConfig, AutoTokenizer

config = GPTQConfig(bits=4, dataset='c4', group_size=128)
model = AutoModelForCausalLM.from_pretrained(
    'meta-llama/Llama-3.1-8B',
    quantization_config=config,
    device_map='auto',
)
model.save_pretrained('llama-3.1-8b-gptq-4bit')
AutoTokenizer.from_pretrained('meta-llama/Llama-3.1-8B').save_pretrained(
    'llama-3.1-8b-gptq-4bit'
)
"
```

### 5.3 量化质量验证

量化后的模型必须经过**任务级评测**，不能仅依赖 Perplexity：

```python
from lm_eval import evaluator, tasks

results = evaluator.simple_evaluate(
    model="hf",
    model_args="pretrained=llama-3.1-8b-gptq-4bit",
    tasks=["mmlu", "gsm8k", "humaneval"],
    batch_size=8,
)

for task, metrics in results["results"].items():
    print(f"{task}: {metrics}")
```

> **重要提醒**：Perplexity 降低不代表所有下游任务都好。**代码生成、工具调用、长文本推理**等任务对量化误差更敏感，需要单独评测。

---

## 6. 总结与展望

量化技术已成为 LLM 部署不可或缺的工程实践。核心要点：

- **GPTQ** 是 GPU 推理的成熟方案，追求极致吞吐量时配合 Marlin 内核使用，质量保留约 90%
- **AWQ** 是质量保留最优的 4-bit 方案（~95%），适合代码生成和创意写作等对质量敏感的场景
- **GGUF** 是本地部署的事实标准，Q4_K_M 是最佳默认选择，跨平台兼容性无可替代
- **FP8** 是 Hopper/Blackwell GPU 上的生产级首选，近乎无损且部署最简单
- **KV Cache 量化**（FP8）是长上下文推理的关键使能技术，但需要任务级验证
- 量化后的模型**必须经过多维度评测**，Perplexity 不是唯一指标

> 2026 年的量化趋势：**混合精度**正在取代"一刀切"方案——对重要层保留更高精度、对不敏感层激进压缩。NVIDIA 的 NVFP4 格式和 TensorRT-LLM 的细粒度量化策略正在推动这一方向。同时，Speculative Decoding 与量化的组合使用成为提升推理效率的新范式。

---

## 参考资源

- [GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers](https://arxiv.org/abs/2210.17323) — Frantar et al., ICLR 2023
- [AWQ: Activation-aware Weight Quantization for LLM Compression and Acceleration](https://arxiv.org/abs/2306.00978) — Lin et al., MLSys 2024 最佳论文
- [SmoothQuant: Accurate and Efficient Post-Training Quantization for Large Language Models](https://arxiv.org/abs/2211.10438) — Xiao et al., ICML 2023
- [LLM.int8(): 8-bit Matrix Multiplication for Transformers at Scale](https://arxiv.org/abs/2208.07339) — Dettmers et al., NeurIPS 2022
- [llama.cpp GGUF 量化工具](https://github.com/ggml-org/llama.cpp/blob/master/tools/quantize/README.md) — GGUF 量化格式官方文档
- [vLLM 量化文档](https://docs.vllm.ai/en/latest/features/quantization/) — vLLM 官方量化支持指南
- [Which Quantization Should I Use?](https://arxiv.org/abs/2601.14277) — llama.cpp 量化方案统一评测 (2026)
- [Quantized KV Cache in vLLM](https://docs.vllm.ai/en/latest/features/quantization/quantized_kvcache/) — KV Cache 量化官方文档
- [llm-compressor](https://github.com/vllm-project/llm-compressor) — vLLM 生态的模型量化工具链
