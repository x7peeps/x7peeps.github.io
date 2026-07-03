---
title: "如何训练一个原生 Computer Use 模型"
weight: 1
tags: [Computer Use, GUI Agent, 模型训练, 强化学习, 视觉语言模型, 视觉定位]
menu: 
  main: 
    parent: "模型训练"
---

## Computer Use 模型的技术全景

2025 年，AI 领域出现了一个重要的范式转移：**让大模型直接操控计算机界面**。从 OpenAI 的 CUA（Computer-Using Agent）到 Anthropic 的 Claude Computer Use，从字节跳动的 UI-TARS 到微软的 OmniParser，各大厂商和研究机构纷纷押注这个方向。这不是简单的"截图 + OCR + 操作脚本"的工程拼凑，而是一个涉及视觉感知、语言理解、动作规划与强化学习的端到端训练问题。

要理解"原生 Computer Use 模型"的含义，首先需要区分两种技术架构：

### 端到端 vs 模块化：两条路线之争

| 架构范式 | 代表系统 | 核心思路 | 优势 | 劣势 |
|---------|---------|---------|------|------|
| **模块化组合** | OmniParser + GPT-4o | 屏幕解析工具 + 通用 LLM | 复用现有能力，部署灵活 | 组件间信息丢失，延迟高，错误累积 |
| **端到端原生** | UI-TARS、CUA、Gelato | 视觉语言模型直接输出操作 | 端到端优化，响应快，泛化好 | 训练数据需求大，训练成本高 |

**模块化方案**以微软的 OmniParser 为代表：先用专门的图标检测模型和 Caption 模型将屏幕解析为结构化的 UI 元素列表，然后将这些元素以文本形式传给 GPT-4o 等通用 LLM 进行推理。这种方式的优势在于可以复用最强大的通用 LLM 的推理能力，OmniParser 在 ScreenSpot-Pro 上达到 39.5% 的准确率，证明了屏幕解析工具的价值。但其瓶颈也很明显——组件间信息传递存在不可避免的损失，整体延迟受限于多组件串行调用，且无法针对 GUI 操作场景进行端到端优化。

**端到端原生方案**是本文关注的重点。这类模型将视觉理解、语言推理和动作预测统一在一个模型中：输入一张屏幕截图和一条自然语言指令，直接输出要执行的操作（点击坐标、输入文本、滚动方向等）。代表系统包括字节跳动的 UI-TARS（基于 Qwen2.5-VL，开源）、OpenAI 的 CUA（基于 GPT-4o + 强化学习）、以及 Gelato-30B-A3B（mlfoundations 开源，ScreenSpot-Pro 达到 63.88%）。端到端方案的核心优势是信息不经过中间编码-解码的损耗，模型可以学习到截图和操作之间的隐式映射关系。

---

## 核心技术栈拆解

一个 Computer Use 模型需要同时具备三项基本能力，三者缺一不可：

### 1. GUI Grounding（视觉定位）

视觉定位是将自然语言描述映射到屏幕精确坐标的能力。例如，给定指令"点击搜索框"，模型需要在截图中精确定位搜索框的位置并输出对应的 (x, y) 坐标。

这看起来简单，但实际挑战巨大：屏幕上的 UI 元素密集且尺度差异极大（从一个 16×16 的图标到占满半屏的输入框），文本渲染方式各异（中英混排、图标文字、艺术字体），且不同操作系统、不同应用的 UI 风格千差万别。ScreenSpot-Pro 基准专门测试这种细粒度定位能力，截至 2026 年初，最强的开源模型 Gelato-30B-A3B 在该基准上达到 63.88%，而 UI-TARS-72B 为 45.6%，说明这仍然是一个开放问题。

### 2. Action Prediction（动作预测）

动作预测是在给定当前屏幕状态和任务目标的情况下，决定下一步该执行什么操作。常见操作空间包括：

- **点击（Click）**：包括左键单击、双击、右键点击
- **输入（Type/Keystroke）**：文本输入和快捷键操作
- **滚动（Scroll）**：上下左右滚动
- **拖拽（Drag）**：鼠标拖拽操作
- **等待（Wait）**：页面加载中需要等待
- **完成（Finish）**：任务已完成，停止操作

动作空间的设计直接影响训练复杂度。过于细碎的动作空间会增加学习难度，过于粗糙则无法表达精细操作。UI-TARS 采用了相对简洁的动作空间设计，将操作分为 `click(x, y, action_type)`、`type(text)`、`scroll(direction, amount)`、`key(modifier, key)` 等原子操作。

### 3. Task Planning（任务规划）

任务规划是多步交互中的核心能力。很多 GUI 任务需要 5-30 步操作才能完成，模型需要在每一步都根据当前屏幕状态做出正确的决策，并保持对整体任务目标的追踪。

一个典型的例子是"在电商网站搜索并购买一件商品"：打开浏览器 → 导航到网站 → 点击搜索框 → 输入商品名 → 点击搜索 → 浏览结果 → 选择商品 → 选择规格 → 加入购物车 → 进入结算 → 填写地址 → 确认支付。这个过程中的每一步都依赖于前一步的结果，模型需要具备长程推理和错误恢复能力。

---

## 数据工程：训练数据从哪来

数据是训练 Computer Use 模型的第一道门槛，也是决定模型上限的关键因素。训练数据主要来自四个渠道：

### 公开数据集

| 数据集 | 来源 | 规模 | 特点 |
|-------|------|------|------|
| **ShowUI** | Microsoft | 366K | Web UI 视觉定位 |
| **AutoGUI** | 学术界 | 50K+ | 自动化生成的 GUI 交互轨迹 |
| **OS-Atlas** | 学术界 | 1.3M | 跨平台 GUI 数据（Web + Desktop + Mobile） |
| **UGround** | 学术界 | 700K+ | 通用视觉定位数据 |
| **SeeClick** | 学术界 | 200K+ | 高质量点击定位数据 |
| **PixMo** | 学术界 | 多样化 | 多任务视觉指令数据 |
| **Click-100k** | mlfoundations | 100K+ | 精选的高质量点击数据，整合 8+ 来源 |

Gelato 项目在构建 Click-100k 数据集时展示了一种高效的数据工程方法：从 8 个以上的公开数据源中进行多维度筛选和清洗，最终筛选出 10 万条高质量点击定位数据。这表明在 Computer Use 领域，数据质量远比数据数量重要。

### 合成数据

合成数据是当前最主流的训练数据生成方式，主要包括：

- **DOM 树提取**：从 Web 页面中提取 DOM 树结构，生成元素位置标注和交互指令。这是 WebArena 等 Web 环境数据的主要来源。
- **逆向工程桌面应用**：通过 Accessibility Tree（无障碍树）获取桌面应用的 UI 结构，结合截图生成训练对。
- **模板化生成**：基于预定义的 UI 布局模板，自动生成多样化的屏幕截图和对应的操作指令。

### 人工标注

人工标注成本高昂但质量最高。主要标注类型包括：

- **操作轨迹标注**：标注人员按照指令在真实环境中操作，记录每一步的截图、操作和坐标
- **元素定位标注**：对屏幕截图中的 UI 元素进行精细的边界框标注
- **任务完成度评估**：对模型生成的操作序列进行正确性判定

UI-Venus（蚂蚁集团）在实践中采用了一种 **RFT（Rejection Sampling Fine-Tuning）** 方法：先用模型生成大量操作轨迹，再通过规则过滤和人工审核筛选出高质量轨迹。数据清洗环节至关重要——他们在数据处理流程中引入了多层过滤机制，包括格式检查、坐标有效性验证、任务完成度评估等，显著提升了 SFT 数据的质量。

### 数据质量管控流水线

无论数据来源如何，都需要一套系统的数据质量管控流程：

```python
import json
from pathlib import Path
from dataclasses import dataclass, field

@dataclass
class DataQualityFilter:
    min_resolution: tuple = (1024, 768)
    max_elements: int = 200
    coordinate_range: tuple = (0, 1)
    required_fields: list = field(default_factory=lambda: [
        "screenshot", "instruction", "action", "coordinates"
    ])
    
    def validate_sample(self, sample: dict) -> tuple[bool, str]:
        for field_name in self.required_fields:
            if field_name not in sample:
                return False, f"missing field: {field_name}"
        
        x, y = sample["coordinates"]
        if not (self.coordinate_range[0] <= x <= self.coordinate_range[1]):
            return False, f"x coordinate {x} out of range"
        if not (self.coordinate_range[0] <= y <= self.coordinate_range[1]):
            return False, f"y coordinate {y} out of range"
        
        if sample["action"] not in ["click", "type", "scroll", "key", "drag", "wait", "finish"]:
            return False, f"unknown action: {sample['action']}"
        
        return True, "ok"
    
    def filter_dataset(self, samples: list[dict]) -> list[dict]:
        valid = []
        for i, sample in enumerate(samples):
            ok, reason = self.validate_sample(sample)
            if ok:
                valid.append(sample)
            else:
                print(f"sample {i} rejected: {reason}")
        return valid

data_filter = DataQualityFilter()
raw_dataset = json.loads(Path("raw_samples.json").read_text())
clean_dataset = data_filter.filter_dataset(raw_dataset)
print(f"filtered {len(raw_dataset)} -> {len(clean_dataset)} samples")
```

Gelato 的数据策展方法进一步引入了难度分级：使用 OmniParser 对每个样本进行 UI 复杂度评分，然后按照难度分层采样，确保训练集中简单、中等、困难样本的比例合理。此外，他们还引入了**对齐过滤**——用训练中的模型检查每条数据的可学习性，丢弃那些模型完全无法理解的样本。

---

## 阶段一：监督微调（SFT）打基础

### 基座模型选择

当前主流的基座模型选择集中在视觉语言模型（VLM）上：

| 模型 | 参数量 | 视觉编码器 | 特点 | 适用场景 |
|------|--------|-----------|------|---------|
| **Qwen2.5-VL-3B** | 3B | ViT + MLP | 轻量，适合端侧部署 | 资源受限的快速验证 |
| **Qwen2.5-VL-7B** | 7B | ViT + MLP | 平衡性能与效率 | 开源训练首选 |
| **Qwen2.5-VL-72B** | 72B | ViT + MLP | 最强开源 VLM | 追求极致性能 |
| **InternVL3** | 多尺寸 | InternViT | 国产开源，中文友好 | 中文场景优化 |
| **Llama 系列视觉模型** | 多尺寸 | ViT | Meta 生态 | 英文场景 |

UI-TARS 全系列基于 Qwen2.5-VL 构建，提供 3B/7B/72B 三个尺寸。这个选择是有道理的——Qwen2.5-VL 在视觉定位、文档理解和多图推理上表现优异，且支持动态分辨率输入，这对处理不同尺寸的屏幕截图至关重要。

### SFT 数据格式

Computer Use 模型的 SFT 数据通常采用如下格式：

```json
{
  "conversations": [
    {
      "role": "user",
      "content": [
        {"type": "image", "image": "screenshot_001.png"},
        {"type": "text", "text": "在当前页面中，点击'设置'按钮进入设置页面"}
      ]
    },
    {
      "role": "assistant", 
      "content": "```json\n{\"action\": \"click\", \"coordinates\": [0.82, 0.15], \"reasoning\": \"设置按钮位于右上角，图标为齿轮形状\"}\n```"
    }
  ]
}
```

坐标采用归一化表示（0-1 范围），这样可以适配不同分辨率的屏幕。动作以 JSON 格式输出，包含 action 类型、坐标和推理过程（chain-of-thought）。

### 训练配置

SFT 阶段的典型训练配置如下：

```python
from transformers import TrainingArguments

training_config = TrainingArguments(
    output_dir="./model_checkpoints/sft",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=8,
    learning_rate=2e-5,
    weight_decay=0.01,
    warmup_ratio=0.03,
    lr_scheduler_type="cosine",
    bf16=True,
    gradient_checkpointing=True,
    dataloader_num_workers=8,
    save_strategy="steps",
    save_steps=500,
    logging_steps=10,
    max_grad_norm=1.0,
    report_to="wandb",
)

lora_config = {
    "r": 128,
    "lora_alpha": 256,
    "lora_dropout": 0.05,
    "target_modules": ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    "task_type": "CAUSAL_LM",
}
```

对于 7B 模型，推荐使用 LoRA 微调（秩 128），可以将显存需求从 80GB 降至约 24GB，同时保持 95%+ 的全参微调效果。对于 72B 模型，通常需要在多机多卡集群上进行全参微调或使用 QLoRA（4-bit 量化 + LoRA）。

### SFT 能教会模型什么

经过 SFT 训练后，模型能够掌握：

- **基础视觉感知**：识别 UI 元素（按钮、文本框、图标、菜单等）
- **坐标预测**：根据自然语言描述定位屏幕元素
- **动作词汇**：理解并输出标准的操作指令
- **简单推理**：基于 chain-of-thought 进行单步决策

但 SFT 有明显的局限性：模型**缺乏错误恢复能力**（操作失败后不知道如何回退），**泛化能力弱**（训练数据中没见过的 UI 风格表现差），**多步推理能力有限**（超过 5 步的任务成功率显著下降）。这正是引入强化学习的根本原因。

---

## 阶段二：强化学习（RL）提升推理能力

### 为什么 RL 是关键瓶颈

SFT 本质上是模仿学习——模型学习的是"看到这个界面，执行这个操作"的模式匹配。但真实的 Computer Use 场景充满不确定性：页面加载失败、弹出意外对话框、网络延迟导致界面变化。模型需要学会**从错误中恢复**、**在不确定性中做决策**、**权衡操作的短期收益和长期目标**——这些都是强化学习擅长的领域。

OpenAI 在 CUA 系统中明确指出：SFT 建立基础感知能力，RL 则负责推理、错误纠正和环境适应。这种两阶段策略使得 CUA 在 OSWorld 上达到 38.1%、WebArena 58.1%、WebVoyager 87% 的成绩。

### GRPO：GUI 场景的强化学习利器

GRPO（Group Relative Policy Optimization）是当前 Computer Use 模型训练中最流行的 RL 算法，被 Gelato、SE-GUI 等多个项目采用。GRPO 的核心思想是：对同一个指令生成一组候选动作，通过组内比较来估计优势函数，避免了训练一个独立的价值网络。

以下是 GRPO 在 GUI Grounding 任务中的奖励函数实现：

```python
import torch
import math

def compute_gui_grounding_reward(
    predicted_coords: tuple[float, float],
    ground_truth_coords: tuple[float, float],
    bbox: tuple[float, float, float, float] | None = None,
    action_type: str = "click"
) -> dict:
    pred_x, pred_y = predicted_coords
    gt_x, gt_y = ground_truth_coords
    
    distance = math.sqrt((pred_x - gt_x) ** 2 + (pred_y - gt_y) ** 2)
    
    position_reward = max(0, 1 - distance / 0.1)
    
    if bbox:
        bx, by, bw, bh = bbox
        inside = (bx <= pred_x <= bx + bw) and (by <= pred_y <= by + bh)
        containment_bonus = 1.0 if inside else -0.3
    else:
        containment_bonus = 0.0
    
    exact_match = 1.0 if distance < 0.005 else 0.0
    
    total_reward = (
        0.6 * position_reward + 
        0.3 * containment_bonus + 
        0.1 * exact_match
    )
    
    return {
        "total_reward": total_reward,
        "position_reward": position_reward,
        "containment_bonus": containment_bonus,
        "exact_match": exact_match,
        "distance": distance,
    }

def grpo_group_loss(
    rewards: list[float],
    log_probs: list[float],
    ref_log_probs: list[float],
    beta: float = 0.04,
    clip_range: float = 0.2,
) -> torch.Tensor:
    mean_r = sum(rewards) / len(rewards)
    std_r = max(sum((r - mean_r) ** 2 for r in rewards) / len(rewards), 1e-8) ** 0.5
    
    advantages = [(r - mean_r) / (std_r + 1e-8) for r in rewards]
    
    loss = torch.tensor(0.0)
    for adv, lp, ref_lp in zip(advantages, log_probs, ref_log_probs):
        ratio = torch.exp(lp - ref_lp)
        clipped = torch.clamp(ratio, 1 - clip_range, 1 + clip_range)
        loss = loss - torch.min(ratio * adv, clipped * adv)
    
    kl_penalty = beta * sum(lp - ref_lp for lp, ref_lp in zip(log_probs, ref_log_probs)) / len(log_probs)
    loss = loss / len(rewards) + kl_penalty
    
    return loss
```

### 奖励设计：三个层次

Computer Use 模型的 RL 奖励设计通常包含三个层次：

**位置奖励（Dense Point Reward）**：衡量预测坐标与真实坐标的距离。SE-GUI 提出的密集点奖励机制是这一方向的代表——不仅对最终点击位置进行奖励，还对操作轨迹中的每个中间状态进行评估。

**任务完成奖励**：判断任务是否最终完成。这需要一个可验证的环境（如 OSWorld 的虚拟机环境或 WebArena 的网页环境），通过检查任务目标是否达成来给出 0/1 奖励。

**轨迹奖励**：对整个操作序列进行评估。Gui-Cursor（ICML 2026）提出了一种创新的交互式方法——将光标移动视为一种搜索行为，通过多步轨迹奖励来训练模型的探索策略。

### SE-GUI 的自进化强化学习

SE-GUI 的核心创新在于**自进化（Self-Evolutionary）**策略：

1. 先用 SFT 训练一个基础模型
2. 在推理时收集模型的注意力图（Attention Map）
3. 分析注意力图发现模型的感知盲区
4. 针对盲区生成更多训练样本
5. 用新的 RL 训练数据重新训练模型
6. 重复以上过程

这种方法使得一个仅 7B 参数的模型在 ScreenSpot-Pro 上超越了 UI-TARS-72B 达 24.2 个百分点，证明了数据质量和训练策略的重要性远超模型规模。

### OpenAI CUA 的 RL 方法

OpenAI 的 CUA 系统虽然没有公开完整细节，但从其 Operator System Card 中可以推断其 RL 训练的核心设计：

- **环境设计**：在受控的虚拟机环境中运行，支持浏览器、文件管理器、代码编辑器等真实应用
- **奖励信号**：结合任务完成度（自动检测）和人类反馈（关键步骤的人工评审）
- **安全约束**：在 RL 训练中显式引入安全约束，确保模型不会学习到危险操作
- ** Curriculum Learning**：从简单任务（单步操作）逐步增加到复杂任务（多应用协作）

---

## 阶段三：安全对齐与部署

Computer Use 模型的安全问题比普通 LLM 更为严峻——因为它不仅输出文本，还能**在真实环境中执行操作**。一个被误导的 Computer Use 模型可能会删除文件、发送不当消息、进行未授权的交易。

### 拒绝训练

模型需要学会拒绝可能造成伤害的任务。OpenAI Operator 在 System Card 中报告，其拒绝率达到 **97%**（在有害任务上）。拒绝训练的关键在于：

- 构建高质量的有害指令-拒绝响应对
- 覆盖多种伤害类型：数据泄露、系统破坏、社会工程、隐私侵犯等
- 平衡拒绝率和有用性——过度拒绝会严重损害用户体验

### Human-in-the-Loop 设计

对于敏感操作（如发送邮件、删除文件、金融交易），模型应主动请求人类确认：

```python
SENSITIVE_ACTIONS = {
    "send_email": {"risk": "high", "confirm": True},
    "delete_file": {"risk": "high", "confirm": True},
    "financial_transaction": {"risk": "critical", "confirm": True},
    "install_software": {"risk": "medium", "confirm": True},
    "open_website": {"risk": "low", "confirm": False},
    "scroll_page": {"risk": "low", "confirm": False},
    "type_text": {"risk": "low", "confirm": False},
}

def should_confirm_action(action: dict) -> bool:
    action_type = action.get("action", "unknown")
    risk_config = SENSITIVE_ACTIONS.get(action_type, {"risk": "high", "confirm": True})
    return risk_config["confirm"]

def execute_with_safety(action: dict, env) -> dict:
    if should_confirm_action(action):
        confirmation = request_human_confirmation(
            action=action,
            description=f"模型请求执行: {action['action']} - {action.get('reasoning', '')}"
        )
        if not confirmation:
            return {"status": "rejected", "reason": "human_rejected"}
    
    return env.execute(action)
```

### 沙箱执行环境

所有 Computer Use 操作都应在隔离的沙箱环境中执行：

- **虚拟机隔离**：使用 Docker 容器或轻量虚拟机隔离操作环境
- **权限最小化**：限制网络访问、文件系统访问范围
- **操作审计**：记录所有操作序列，支持事后审计和回溯
- **自动恢复**：操作失败后能自动恢复到初始状态

Anthropic Claude Computer Use 自 2024 年 10 月发布 beta 版以来，始终强调安全设计：所有操作在用户指定的沙箱环境中执行，敏感操作需要用户明确授权。

---

## 评测基准与方法

### 核心基准对比

| 基准 | 评测维度 | OpenAI CUA | UI-TARS-72B | Gelato-30B-A3B | SE-GUI-7B | OmniParser |
|------|---------|-----------|-------------|----------------|-----------|------------|
| **ScreenSpot-Pro** | 细粒度 GUI 定位 | — | 45.6% | 63.88% | 69.8% | 39.5% |
| **OSWorld** | 完整计算机任务 | 38.1% | 22.5% | — | — | — |
| **WebArena** | Web 浏览任务 | 58.1% | 29.2% | — | — | — |
| **WebVoyager** | Web 导航任务 | 87.0% | 73.5% | — | — | — |

> 注：数据截至 2026 年初，不同基准的评测条件可能略有差异。

### 各基准详解

**ScreenSpot / ScreenSpot-Pro**：专注测试 GUI 元素定位能力。ScreenSpot 包含桌面、Web 和移动端的截图，要求模型输出目标元素的精确坐标。ScreenSpot-Pro 是其进阶版本，包含更密集、更精细的 UI 元素，对模型的空间分辨率要求更高。

**OSWorld**：最全面的 Computer Use 评测基准，提供真实的 Ubuntu 虚拟机环境，任务涵盖文件管理、系统配置、应用操作等多个领域。任务以自然语言描述，需要 5-30 步操作才能完成。

**WebArena**：专注 Web 浏览任务，提供四个真实网站的克隆环境（电商、论坛、代码托管、地图），测试模型的信息检索、表单填写、跨页面导航等能力。

**WebVoyager**：测试模型在真实 Web 环境中的导航能力，任务更加多样化，包括信息搜索、内容创建、多站点协作等。

---

## 从零训练一个 Computer Use 模型的实操指南

### 完整训练流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Computer Use 模型训练流程                          │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Phase 0: 数据准备                                             │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │  │
│  │  │ 公开数据集  │  │ 合成数据   │  │ 人工标注   │  │ OmniParser   │  │  │
│  │  │ 收集      │  │ 生成      │  │ 采购      │  │ 质量过滤     │  │  │
│  │  └─────┬────┘  └─────┬────┘  └─────┬────┘  └──────┬───────┘  │  │
│  │        └──────────────┴─────────────┴───────────────┘          │  │
│  │                            ▼                                    │  │
│  │                    数据清洗 + 难度分级                            │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                            ▼                                         │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Phase 1: SFT (监督微调)                                       │  │
│  │  基座: Qwen2.5-VL-7B → LoRA r=128 → 3 epochs                 │  │
│  │  数据: ~100K-500K 高质量指令-操作对                               │  │
│  │  目标: 基础感知 + 坐标预测 + 动作词汇                              │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                            ▼                                         │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Phase 2: RL (强化学习)                                         │  │
│  │  算法: GRPO → 交互环境: OSWorld / WebArena / 自建               │  │
│  │  奖励: 位置奖励 + 任务完成奖励 + 轨迹奖励                          │  │
│  │  目标: 错误恢复 + 多步推理 + 泛化能力                              │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                            ▼                                         │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Phase 3: 安全对齐                                              │  │
│  │  拒绝训练 + Human-in-the-Loop + 沙箱验证                         │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                            ▼                                         │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Phase 4: 部署                                                  │  │
│  │  vLLM/TGI 推理服务 + 截图获取 + 动作执行 + 环境交互              │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 硬件需求估算

| 模型规模 | SFT 阶段 | RL 阶段 | 推理部署 |
|---------|---------|---------|---------|
| **3B** | 1× A100-80G (LoRA) | 2× A100-80G | 1× A10-24G |
| **7B** | 2× A100-80G (LoRA) / 4× (全参) | 4× A100-80G | 1× A100-40G |
| **72B** | 8× A100-80G (全参) | 16× A100-80G | 4× A100-80G |

### 开源工具链

| 工具 | 用途 | 地址 |
|------|------|------|
| **UI-TARS** | 端到端训练框架，含完整 SFT + RL 代码 | github.com/bytedance/UI-TARS |
| **Gelato** | 开源 grounding 模型，含 GRPO 训练代码 | mlfoundations |
| **OmniParser** | 屏幕解析工具，用于数据预处理和质量过滤 | github.com/microsoft/OmniParser |
| **OpenCompass** | 多模态评测框架，含 GUI 基准评测支持 | github.com/open-compass |
| **OSWorld** | Computer Use RL 训练和评测环境 | github.com/stanford-oval/osworld |

### 预估成本与时间线

以训练一个 **7B 参数**的 Computer Use 模型为例：

| 阶段 | 数据规模 | 训练时间 | GPU 成本（按 A100 $2/h 计） |
|------|---------|---------|--------------------------|
| 数据准备 | 200K-500K 样本 | 2-4 周 | $2,000-5,000（数据生成+过滤） |
| SFT | 300K 样本 × 3 epochs | 2-3 天 | $300-500 |
| RL | 10K 环境交互 × 500 步 | 1-2 周 | $3,000-6,000 |
| 安全对齐 | 5K-10K 样本 | 1-2 天 | $100-200 |
| **总计** | — | **4-7 周** | **$5,400-11,700** |

这个成本量级对于大多数有 ML 基础的团队来说是可接受的，远低于从头预训练一个 VLM（通常需要 $100K+ 的算力投入）。

---

## 关键结论与趋势判断

### 技术趋势

1. **RL 重要性超过 SFT**：SE-GUI 用 7B 模型超越 72B 模型的事实证明，强化学习和数据质量的重要性已经远超模型规模。未来 Computer Use 领域的竞争将更多集中在 RL 算法创新和训练环境构建上。

2. **端到端模型正在超越模块化方案**：虽然 OmniParser 等模块化工具在特定场景下仍然有用，但端到端模型在复杂任务上的表现已经明显优于组合方案。

3. **开源生态快速追赶**：UI-TARS、Gelato、SE-GUI 等开源项目使得中小团队也能训练出有竞争力的 Computer Use 模型。OpenAI 在该领域的领先优势正在被快速缩小。

4. **评测基准驱动进步**：OSWorld、ScreenSpot-Pro 等基准为社区提供了明确的优化方向和公平比较的平台，是推动该领域快速进步的关键基础设施。

### 给实践者的建议

- **从 7B 模型开始**：7B 是成本和性能的最佳平衡点，足以验证技术路线
- **数据质量优先于数据规模**：参考 Gelato 的 Click-100k 策略，精心筛选 10 万条高质量数据远胜于粗暴收集百万条低质量数据
- **尽早引入 RL**：SFT 到一定程度后应立即开始 RL 训练，避免在 SFT 阶段过度投入
- **构建可靠的评测环境**：RL 需要可交互的环境支持，建议从 Web 环境（更容易搭建）开始

---

## 延伸阅读

### 核心论文

| 论文 | 机构 | 关键贡献 |
|------|------|---------|
| **UI-TARS** | ByteDance | 端到端 GUI Agent，SFT + RL 全流程 |
| **UI-TARS v1.5** | ByteDance | 跨平台支持，数据配比优化 |
| **SE-GUI** | 学术界 | 自进化 RL，7B 超越 72B |
| **Gelato** | mlfoundations | 高精度 grounding 模型，GRPO 训练 |
| **Gui-Cursor** | ICML 2026 | 交互式光标移动，多步 RL |
| **UI-Venus** | 蚂蚁集团 | RFT 方法，数据清洗策略 |
| **OmniParser** | Microsoft | 屏幕解析工具，icon 检测 + caption |
| **OpenAI Operator SC** | OpenAI | CUA 系统卡，SFT + RL 管线细节 |
| **SeeClick** | 学术界 | 高质量点击定位数据 |
| **OS-Atlas** | 学术界 | 跨平台 GUI 数据集 |

### 开源项目

- **UI-TARS**：`github.com/bytedance/UI-TARS` — 完整的端到端训练框架
- **OmniParser**：`github.com/microsoft/OmniParser` — 屏幕解析工具
- **OSWorld**：`github.com/stanford-oval/osworld` — Computer Use 评测和训练环境
- **WebArena**：`github.com/web-arena-x/webarena` — Web 浏览评测环境
- **ScreenSpot**：GUI 定位评测基准

### 评测排行榜

- **OSWorld Leaderboard**：`osworld.org` — 完整计算机任务完成率排行
- **ScreenSpot Leaderboard**：GUI 定位准确率排行
- **WebArena Leaderboard**：Web 任务完成率排行

---

> **总结**：训练一个原生 Computer Use 模型是一项系统工程，涵盖数据工程、监督微调、强化学习和安全对齐四个核心阶段。2025-2026 年的技术进展表明，RL 和数据质量正在取代模型规模成为性能提升的关键驱动力。对于有志于进入这个领域的 ML 工程师，好消息是开源生态已经足够成熟——借助 UI-TARS 的训练框架、OmniParser 的数据工具和 OSWorld 的评测环境，一个具备基本 ML 工程能力的团队可以在 4-7 周内、花费万美元级别的成本，训练出一个有竞争力的 Computer Use 模型。
