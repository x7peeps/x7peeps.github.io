---
title: "Prompt Engineering 技术栈：从基础到 CoT/ToT 的完整体系"
weight: 1
tags: [Prompt Engineering, CoT, ToT, LLM, 技术栈]
menu: 
  main: 
    parent: "AIPrompt"
---

## Prompt Engineering 在 LLM 应用中的地位

在 LLM 应用工程的技术栈中，Prompt Engineering 是投入产出比最高的核心技能。与微调（Fine-tuning）、RAG、Agent 框架开发等工程手段相比，它不需要额外的训练数据、GPU 算力或复杂的基础设施——仅仅通过优化输入文本的结构与语义，就能显著改变模型的行为质量。

从工程视角看，Prompt Engineering 处于 LLM 应用金字塔的基座层：

```
┌─────────────────────────────────────┐
│         Agent 编排与工具链            │  ← 系统架构层
├─────────────────────────────────────┤
│      RAG / Fine-tuning / 微调       │  ← 能力增强层
├─────────────────────────────────────┤
│      Prompt Engineering 技术栈       │  ← 交互基座层  ★
├─────────────────────────────────────┤
│           LLM 基础模型能力           │  ← 底座推理层
└─────────────────────────────────────┘
```

无论上层架构如何演进——从单轮对话到多步 Agent，从简单 QA 到复杂 RAG pipeline——每一次与模型的交互最终都会收敛到一个 Prompt 上。因此，Prompt 质量直接决定了整条链路的输出上限。这也是为什么 OpenAI、Anthropic 等头部实验室在模型发布时，首要的配套文档不是 API Reference，而是 Prompt Engineering Guide。

对于有经验的开发者而言，将 Prompt Engineering 视为一种「结构化编程」而非「自然语言技巧」会更为准确：它有输入输出规范、有可复现的模式、有版本管理和 A/B 测试方法论——本质上是一个完整的工程学科。

---

## Prompt 设计基础框架：五要素模型

成熟的 Prompt 设计不是即兴创作，而是遵循结构化框架。五要素模型（Role / Task / Constraints / Format / Examples）是目前工程实践中最广泛使用的 Prompt 架构：

### 五要素定义

| 要素 | 作用 | 对输出的影响 |
|------|------|-------------|
| **Role**（角色） | 设定模型的行为模式和专业背景 | 决定回答的视角深度、用词风格和知识边界 |
| **Task**（任务） | 明确要完成的具体目标 | 直接决定输出的主体内容和方向 |
| **Constraints**（约束） | 限定输出的范围、规则和限制 | 控制输出的质量下限，防止退化 |
| **Format**（格式） | 指定输出的结构化形式 | 影响信息的组织效率和下游可解析性 |
| **Examples**（示例） | 提供期望行为的参考样本 | 最直接地锚定输出分布，减少歧义 |

### 各要素的工程影响

#### Role：行为模式锚定

```python
# 弱角色设定 — 模型行为不可预测
system_prompt = "你是一个助手。"

# 强角色设定 — 模型行为被精确锚定
system_prompt = """
你是一位拥有 15 年经验的高级后端架构师，专注于分布式系统设计。
你倾向于用简洁的技术语言回答问题，在给出建议前会先分析现有架构的瓶颈。
你不会使用比喻或类比，直接给出技术方案。
"""
```

Role 的核心机制是通过系统提示改变模型的**注意力分配**——当角色被明确定义后，模型会在 token 生成时倾向于选择该角色常用的专业词汇和推理路径。

#### Task：目标的精确度直接决定输出质量

```python
# 模糊任务 — 输出不可控
task = "分析一下这个系统"

# 精确任务 — 输出可预期
task = """
分析以下电商订单系统的数据库 Schema，识别以下问题：
1. 是否存在 N+1 查询的表结构设计缺陷
2. 索引覆盖度是否满足高并发读写需求
3. 是否有数据一致性风险（如分库分表场景下的跨表事务）
"""
```

#### Constraints：质量下限的护栏

Constraints 是工程化 Prompt 中最容易被忽视但最关键的要素。它们定义了输出的「不应」边界：

```python
constraints = """
约束条件：
- 不要猜测不确定的技术细节，无法确认时明确标注"需要进一步确认"
- 不要给出超过 3 个解决方案，只推荐你最有信心的方案
- 不要忽略安全方面的考量
- 所有性能数据必须附带假设前提
"""
```

#### Format：下游可解析性

在 Agent 系统中，Format 不仅影响可读性，还直接决定下游管道能否正确解析模型输出：

```python
format_spec = """
输出格式要求（严格 JSON）：
{
  "analysis": "问题分析",
  "root_cause": "根因判断",
  "severity": "critical|high|medium|low",
  "recommendations": [
    {
      "action": "具体建议",
      "priority": 1,
      "estimated_effort": "人天估算"
    }
  ]
}
"""
```

#### Examples：Few-shot 的核心

Examples 是五要素中对输出分布影响最强的要素。在后续的 Few-shot 章节会深入展开。

### 五要素协同效应

这五个要素不是独立工作的，它们之间存在协同与权衡：

- **Role + Task** 共同决定输出的**深度与方向**
- **Constraints** 设定输出的**质量下限**
- **Format** 控制输出的**可解析性**
- **Examples** 直接锚定输出的**分布中心**

在实际工程中，五要素的权重分配应根据场景动态调整——创意生成任务中 Examples 权重更高，合规性任务中 Constraints 权重更高，技术文档生成中 Format 权重更高。

---

## Zero-shot vs Few-shot vs One-shot：策略选择矩阵

### 三种策略的本质区别

| 策略 | Prompt 结构 | Token 消耗 | 适用场景 | 典型延迟影响 |
|------|------------|-----------|---------|-------------|
| **Zero-shot** | Role + Task + Constraints | 最低 | 简单分类、格式转换、常见 QA | 最低 |
| **One-shot** | 上述 + 1 个示例 | 中等 | 需要轻微格式校准的任务 | 中等 |
| **Few-shot** | 上述 + 多个示例 | 较高 | 复杂格式、领域特定输出、低容错任务 | 较高 |

### 工程选型指南

```python
from openai import OpenAI
client = OpenAI()

# ============================================
# Zero-shot：适合简单的结构化输出
# ============================================
zero_shot_response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "你是一个日志分析专家。"},
        {"role": "user", "content": "将以下非结构化日志转换为 JSON 格式：\n"
         "2024-01-15 10:23:45 ERROR [auth-service] Failed to validate token: expired"}
    ]
)

# ============================================
# Few-shot：复杂格式时，示例比描述更高效
# ============================================
few_shot_response = client.chat.completions.create(
    model="gpt-4o",
    me