---
title: "Prompt Engineering 技术栈：从基础到 CoT/ToT 的完整体系"
weight: 1
tags: [Prompt Engineering, CoT, ToT, LLM, 技术栈]
menu: 
  main: 
    parent: "Prompt 工程"
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
    messages=[
        {"role": "system", "content": "你是一个日志分析专家，将非结构化日志解析为结构化 JSON。"},
        {"role": "user", "content": "2024-01-15 10:23:45 INFO [api-gateway] Request processed: GET /users/123 - 200 OK (45ms)"},
        {"role": "assistant", "content": """```json
{
  "timestamp": "2024-01-15T10:23:45",
  "level": "INFO",
  "service": "api-gateway",
  "message": "Request processed",
  "metadata": {
    "method": "GET",
    "path": "/users/123",
    "status_code": 200,
    "latency_ms": 45
  }
}
```"""},
        {"role": "user", "content": "2024-01-15 10:23:46 WARN [payment-service] Stripe webhook signature verification failed for event evt_123456"},
        {"role": "assistant", "content": """```json
{
  "timestamp": "2024-01-15T10:23:46",
  "level": "WARN",
  "service": "payment-service",
  "message": "Stripe webhook signature verification failed",
  "metadata": {
    "event_id": "evt_123456",
    "provider": "stripe"
  }
}
```"""},
        {"role": "user", "content": "2024-01-15 10:23:47 ERROR [database] Connection pool exhausted: active=50 max=50 waiting=12 timeout=30s"}
    ]
)
```

### 选型决策树

```
任务复杂度评估
│
├── 是否需要特定输出格式？
│   ├── 否 → Zero-shot
│   └── 是 ↓
│
├── 格式是否可以仅用文字描述清楚？
│   ├── 是 → Zero-shot + Format constraints
│   └── 否 ↓
│
├── 示例数量需求？
│   ├── 1 个示例即可锚定 → One-shot
│   └── 需要多维度覆盖 → Few-shot (3-5 个)
│
└── 输出容错要求？
    ├── 宽容（允许格式微调） → 减少示例数
    └── 严格（必须精确匹配） → 增加示例数 + Constraints
```

### Few-shot 的工程陷阱

1. **示例偏置（Example Bias）**：示例的分布会直接影响输出分布。如果你的示例都来自同一类别，模型会倾向于生成同类输出
2. **位置效应（Position Effect）**：靠前的示例影响力通常大于靠后的示例（首因效应），在 Few-shot 中应将最重要的示例放在最前
3. **Token 预算约束**：每个示例都在消耗上下文窗口。当示例占据过多 token 时，模型对当前任务的注意力会被稀释

---

## Chain-of-Thought（CoT）全家族

CoT 系列技术是 Prompt Engineering 领域的里程碑式突破。其核心洞察是：**将推理过程显式化，可以显著提升 LLM 在复杂推理任务上的表现**。CoT 不是一个单一技术，而是一个完整的技术家族。

### Standard CoT：思维链的基石

Standard CoT 通过在示例中展示完整的推理链路，引导模型模仿中间推理步骤：

```python
standard_cot_response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "你是一个数学推理专家。"},
        {"role": "user", "content": """
一个农场有 15 只鸡和 8 只鸭。鸡每天下蛋，每只鸡每天下 1 个蛋。
鸭每 3 天下 1 个蛋。农场主人每周收集所有蛋，每周能收到多少个蛋？

让我们一步一步思考：

第一步：计算鸡每周的产蛋量。
- 鸡有 15 只，每只每天下 1 个蛋
- 鸡每天产蛋：15 × 1 = 15 个
- 鸡每周产蛋：15 × 7 = 105 个

第二步：计算鸭每周的产蛋量。
- 鸭有 8 只，每 3 天下 1 个蛋
- 鸭每只每周产蛋：7 ÷ 3 ≈ 2.33 个（向下取整为 2 个，因为需要完整 3 天周期）
- 鸭每周产蛋：8 × 2 = 16 个

第三步：计算总量。
- 总产蛋量：105 + 16 = 121 个

答案：农场每周能收到 121 个蛋。
"""},
        {"role": "user", "content": """
一个商店有 20 件衬衫，每件成本 15 元，售价 30 元。
每天卖出 3 件，每件衬衫运营成本 2 元/天。
问 10 天后，商店的总利润是多少？

让我们一步一步思考：
"""
        }
    ]
)
```

**Standard CoT 的关键特征**：推理链在 Few-shot 示例中显式给出，模型学习的是「如何推理」的模式。

### Zero-shot CoT：一个魔法咒语

Zero-shot CoT 的突破性在于它不需要任何示例——仅通过追加一句提示就能激活模型的推理能力：

```python
# Zero-shot CoT 的核心：在任何问题后追加 "Let's think step by step"
zero_shot_cot_response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "user", "content": """
小明有 5 个苹果，给了小红 2 个，又买了 3 个。
然后他把苹果平均分给了 3 个朋友。
问每个朋友得到几个苹果？剩下几个？

Let's think step by step.
"""}
    ]
)
```

这个看似简单的提示之所以有效，是因为它触发了 LLM 内部的**系统 2 思维**模式——模型从快速直觉式回答切换为逐步推理模式。研究表明（Kojima et al., 2022），仅添加这个提示就能在 GSM8K 等数学推理基准上带来 10-40% 的性能提升。

### Auto-CoT：自动化推理链生成

Auto-CoT 的核心思想是用模型自动生成推理示例，而非人工编写。这解决了 Standard CoT 在大规模应用中示例构建成本过高的问题：

```python
# Auto-CoT 的实现思路
def auto_cot(question: str, clusters: list[list[str]], model: str = "gpt-4o") -> str:
    """
    Auto-CoT 流程：
    1. 将问题池聚类（使用 Sentence-BERT 等嵌入模型）
    2. 从每个聚类中选择代表性问题
    3. 用 Zero-shot CoT 为每个代表性问题生成推理链
    4. 将生成的推理链作为 Few-shot 示例
    """
    demos = []
    for cluster in clusters:
        representative_question = cluster[0]
        reasoning_chain = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "user", "content": f"""
{representative_question}

Let's think step by step.
"""}
            ]
        ).choices[0].message.content
        demos.append((representative_question, reasoning_chain))

    prompt = "以下是一些示例：\n\n"
    for q, r in demos:
        prompt += f"问题：{q}\n{r}\n\n"
    prompt += f"问题：{question}\nLet's think step by step.\n"

    final_response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}]
    )
    return final_response.choices[0].message.content
```

**Auto-CoT 的优势**：自动覆盖问题多样性，减少人工标注成本，且生成的推理链质量在多数场景下接近人工编写。

### Complex CoT：带中间验证的分步推理

Complex CoT 在标准 CoT 基础上增加了**中间步骤验证**机制，是工程落地中最可靠的形式：

```python
complex_cot_response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": """
你是一个严谨的推理专家。在每一步推理后，你必须：
1. 给出推理结论
2. 验证该结论的合理性（合理性检查）
3. 如果验证不通过，回退修正
请用以下格式输出：

## 步骤 N：<步骤描述>
**推理**：...
**验证**：这个结论是否合理？[合理/不合理] 理由：...
**修正**（如需要）：...
"""},
        {"role": "user", "content": """
一个水池有两根进水管 A 和 B，以及一根排水管 C。
- A 管单独注满需要 6 小时
- B 管单独注满需要 8 小时  
- C 管单独排空需要 12 小时
- 三管同时打开，多少小时能注满水池？

请用分步验证的格式回答。
"""}
    ]
)
```

Complex CoT 的核心价值在于**自我纠错能力**——中间验证步骤允许模型在推理中途发现并修正错误，而不是在最后才输出一个错误答案。这在数学计算、逻辑推理等对准确性要求极高的场景中尤其重要。

### CoT 全家族对比

| 变体 | 示例依赖 | 适用模型规模 | 推理深度 | 工程复杂度 | 典型应用场景 |
|------|---------|------------|---------|-----------|------------|
| Standard CoT | 需要人工编写 | 中等及以上 | 深 | 中 | 数学推理、逻辑分析 |
| Zero-shot CoT | 不需要 | 所有规模 | 中 | 低 | 通用推理增强 |
| Auto-CoT | 自动生成 | 中等及以上 | 深 | 高 | 大规模批量推理 |
| Complex CoT | 可选 | 大模型 | 最深 | 高 | 高精度专业推理 |

---

## Tree-of-Thought（ToT）：树状推理策略

CoT 是线性推理——每一步只有一条路径。但在复杂问题中，正确的推理路径往往需要**探索多个分支**并回溯。ToT（Tree-of-Thought）正是为此设计的推理框架。

### ToT 的核心机制

```
                    问题
                   / | \
                 /   |   \
              思路A  思路B  思路C
              / \     |    / \
           A1  A2    B1   C1  C2
           |        / \        |
          A1验证  B1a B1b    C2验证
           ✗      ✓    ✗     ✓
                    ↓           ↓
                  继续展开     继续展开
```

ToT 的三个关键操作：

1. **分支（Branching）**：在每个推理节点生成多个候选思路
2. **评估（Evaluation）**：用启发式或 LLM 自评估来打分
3. **剪枝（Pruning）**：保留最优路径，丢弃低分分支

```python
from dataclasses import dataclass

@dataclass
class ThoughtNode:
    content: str
    score: float = 0.0
    children: list = None

def tot_solve(problem: str, model: str = "gpt-4o", max_depth: int = 3, branch_width: int = 3):
    """
    ToT 求解器实现
    """
    root = ThoughtNode(content=problem)

    def generate_thoughts(node: ThoughtNode) -> list[ThoughtNode]:
        prompt = f"""
当前问题：{problem}
已有的推理路径：{node.content}
请生成 {branch_width} 个不同的下一步推理方向，每个方向简要说明思路。
"""
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}]
        )
        thoughts = response.choices[0].message.content.split("\n\n")
        return [ThoughtNode(content=t, children=[]) for t in thoughts if t.strip()]

    def evaluate_thought(node: ThoughtNode) -> float:
        prompt = f"""
评估以下推理步骤的质量（0-10 分）：
问题：{problem}
推理路径：{node.content}

评分标准：逻辑严密性、方向正确性、信息增量。
只输出一个数字分数。
"""
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}]
        )
        try:
            return float(response.choices[0].message.content.strip())
        except ValueError:
            return 0.0

    frontier = [root]
    for depth in range(max_depth):
        candidates = []
        for node in frontier:
            children = generate_thoughts(node)
            for child in children:
                child.score = evaluate_thought(child)
            candidates.extend(children)

        candidates.sort(key=lambda x: x.score, reverse=True)
        frontier = candidates[:branch_width]

    best = max(frontier, key=lambda x: x.score)
    return best.content
```

### ToT vs CoT：何时选择

| 维度 | CoT | ToT |
|------|-----|-----|
| 推理路径 | 线性，单路径 | 树状，多路径探索 |
| 计算开销 | O(n)，n 为推理步数 | O(n × b^d)，b 为分支数，d 为深度 |
| 适用问题类型 | 步骤明确、路径清晰 | 需要探索、存在歧义或陷阱的问题 |
| 典型场景 | 数学计算、逻辑推导 | 创意写作、开放性规划、博弈策略 |
| 工程落地难度 | 低 | 高（需要多次调用、结果聚合） |

**实践建议**：ToT 的高计算成本意味着它应该作为最后手段——当 CoT + Self-Consistency 无法达到满意的准确率时，再考虑引入 ToT。在大多数生产环境中，CoT 配合 Self-Consistency 已经能解决 80% 以上的推理增强需求。

---

## Self-Consistency：多数投票的一致性校验

Self-Consistency（Wang et al., 2023）基于一个直觉：**正确答案在多次独立推理中会倾向于汇聚**。其核心实现是让模型对同一问题生成多条推理路径，然后通过多数投票（Majority Voting）选择最终答案。

```python
from collections import Counter
import re

def self_consistency_solve(
    question: str,
    model: str = "gpt-4o",
    num_samples: int = 5,
    temperature: float = 0.7
) -> dict:
    answers = []
    reasoning_paths = []

    for _ in range(num_samples):
        response = client.chat.completions.create(
            model=model,
            temperature=temperature,
            messages=[
                {"role": "user", "content": f"""
{question}

Let's think step by step.
请在最后一行用 "答案：XXX" 的格式给出最终答案。
"""}
            ]
        )
        content = response.choices[0].message.content
        reasoning_paths.append(content)

        answer_match = re.search(r"答案[：:]\s*(.+)", content)
        if answer_match:
            answers.append(answer_match.group(1).strip())

    if not answers:
        return {"answer": "无法确定", "confidence": 0.0, "paths": reasoning_paths}

    vote_counts = Counter(answers)
    best_answer, count = vote_counts.most_common(1)[0]

    return {
        "answer": best_answer,
        "confidence": count / len(answers),
        "vote_distribution": dict(vote_counts),
        "paths": reasoning_paths
    }

result = self_consistency_solve("一个班有 30 个学生，其中 18 人喜欢数学，15 人喜欢物理，8 人两者都喜欢。多少人两者都不喜欢？")
```

**Self-Consistency 的工程参数**：

- **采样数量（num_samples）**：通常 3-7 次即可。边际收益在 5 次后急剧下降
- **Temperature**：需要高于 0 以确保推理路径的多样性。通常 0.5-0.8 是最佳区间
- **投票策略**：多数投票是最简单的方式，也可以用加权投票（按推理链的自评分数加权）

---

## ReAct：推理与行动的交替执行

ReAct（Yao et al., 2023）是将 CoT 推理与外部工具调用交替执行的框架，它弥合了「纯推理」和「纯行动」之间的鸿沟。

### ReAct 的循环模式

```
Thought → Action → Observation → Thought → Action → Observation → ... → Final Answer
```

每一轮循环中：
1. **Thought**：基于当前状态进行推理，决定下一步需要什么信息
2. **Action**：调用外部工具获取信息
3. **Observation**：获取工具返回的结果

```python
import json

def react_agent(question: str, tools: dict, model: str = "gpt-4o", max_steps: int = 10):
    tool_descriptions = "\n".join([
        f"- {name}: {desc}" for name, desc in tools.items()
    ])

    system_prompt = f"""
你是一个 ReAct 智能体。你通过交替推理和行动来回答问题。

可用工具：
{tool_descriptions}

严格按以下格式输出（每次只输出一个步骤）：

Thought: <你的推理>
Action: <工具名>
Action Input: <工具参数>

收到 Observation 后继续推理。
当可以给出最终答案时，输出：
Thought: <最终推理>
Final Answer: <答案>
"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": question}
    ]

    for step in range(max_steps):
        response = client.chat.completions.create(
            model=model, messages=messages
        )
        assistant_msg = response.choices[0].message.content
        messages.append({"role": "assistant", "content": assistant_msg})

        if "Final Answer:" in assistant_msg:
            final_answer = assistant_msg.split("Final Answer:")[-1].strip()
            return {"answer": final_answer, "steps": step + 1}

        action_match = re.search(r"Action:\s*(.+)", assistant_msg)
        input_match = re.search(r"Action Input:\s*(.+)", assistant_msg)

        if action_match and input_match:
            tool_name = action_match.group(1).strip()
            tool_input = input_match.group(1).strip()

            if tool_name in tools:
                observation = tools[tool_name](tool_input)
            else:
                observation = f"Error: Tool '{tool_name}' not found"

            messages.append({
                "role": "user",
                "content": f"Observation: {observation}"
            })

    return {"answer": "达到最大步数限制，未能得出最终答案", "steps": max_steps}

tools = {
    "search": lambda q: f"搜索结果: 关于'{q}'的最新信息...",
    "calculate": lambda expr: f"计算结果: {eval(expr)}",
    "lookup": lambda term: f"查询结果: {term} 的定义是..."
}

result = react_agent("2024 年诺贝尔物理学奖得主是谁？他们获得博士学位的大学排名如何？", tools)
```

### ReAct 的工程价值

ReAct 是当前 Agent 系统的理论基础。与纯 CoT 相比，它的核心优势是**接地性（Grounding）**——通过实际的工具调用获取真实数据，而非完全依赖模型的参数记忆。这解决了 LLM 最大的两个痛点：幻觉和知识时效性。

---

## 结构化输出控制

在工程落地中，模型输出必须可解析、可验证。结构化输出控制是确保 Prompt 产出与下游系统无缝衔接的关键技术。

### 策略一：Prompt 内约束

```python
structured_prompt = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": """
你必须严格按以下 JSON Schema 输出，不要包含任何其他文字：

{
  "severity": "critical" | "high" | "medium" | "low",
  "category": "string",
  "summary": "string (50字以内)",
  "affected_systems": ["string"],
  "remediation_steps": ["string"]
}
"""},
        {"role": "user", "content": "分析以下安全事件：服务器 10.0.1.5 出现异常外联行为，疑似 C2 通信，涉及进程 svchost.exe 的异常子进程。"}
    ]
)
```

### 策略二：Response Format 模式（OpenAI Structured Outputs）

```python
from pydantic import BaseModel

class SecurityAlert(BaseModel):
    severity: str
    category: str
    summary: str
    affected_systems: list[str]
    remediation_steps: list[str]

response = client.beta.chat.completions.parse(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "分析安全事件并输出结构化报告。"},
        {"role": "user", "content": "服务器 10.0.1.5 出现异常外联行为，疑似 C2 通信。"}
    ],
    response_format=SecurityAlert
)

alert = response.choices[0].message.parsed
```

### 策略三：Markdown 表格输出

Markdown 表格在人机交互场景中可读性极佳，且可以通过简单的正则解析：

```python
table_response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "user", "content": """
比较 Redis、Memcached 和 MemSQL 三种缓存方案。
用 Markdown 表格输出，包含以下列：方案名称、数据结构、持久化、集群支持、适用场景。
"""}
    ]
)
```

### 三种策略的选型建议

| 场景 | 推荐策略 | 原因 |
|------|---------|------|
| API 间调用 | Structured Outputs / JSON Mode | 类型安全，可自动验证 |
| 人机交互 | Markdown 表格 | 可读性最佳 |
| 嵌入到文档中 | Markdown | 格式自然 |
| 高可靠性要求 | Structured Outputs + Pydantic 校验 | 编译时即可发现格式问题 |

---

## Prompt 版本管理与 A/B 测试

在生产环境中，Prompt 就是代码——它需要版本管理、测试覆盖和系统化迭代。

### 版本管理策略

```python
# prompt_registry.py — Prompt 版本化管理

from dataclasses import dataclass, field
from datetime import datetime

@dataclass
class PromptVersion:
    version: str
    system_prompt: str
    user_template: str
    model: str
    temperature: float
    metadata: dict = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())

PROMPT_REGISTRY = {
    "log-parser": {
        "v1.0": PromptVersion(
            version="v1.0",
            system_prompt="你是一个日志分析助手。",
            user_template="分析以下日志：\n{log_content}",
            model="gpt-4o",
            temperature=0.3,
            metadata={"author": "team", "baseline_accuracy": 0.72}
        ),
        "v1.1": PromptVersion(
            version="v1.1",
            system_prompt="你是一个资深日志分析专家。将非结构化日志解析为标准 JSON 格式。",
            user_template="分析以下日志并输出 JSON：\n{log_content}\n\n输出格式：{format_spec}",
            model="gpt-4o",
            temperature=0.2,
            metadata={"author": "team", "baseline_accuracy": 0.89,
                      "changes": "增加了角色设定和格式约束"}
        ),
    }
}

def get_prompt(task_name: str, version: str = "latest") -> PromptVersion:
    versions = PROMPT_REGISTRY[task_name]
    if version == "latest":
        return list(versions.values())[-1]
    return versions[version]
```

### A/B 测试框架

```python
import random
import hashlib
from collections import defaultdict

class PromptABTest:
    def __init__(self, task_name: str):
        self.task_name = task_name
        self.results = defaultdict(lambda: {"correct": 0, "total": 0, "latencies": []})

    def select_version(self, user_id: str, variants: list[str]) -> str:
        hash_val = int(hashlib.md5(f"{self.task_name}:{user_id}".encode()).hexdigest(), 16)
        return variants[hash_val % len(variants)]

    def record_result(self, version: str, correct: bool, latency_ms: float):
        self.results[version]["total"] += 1
        if correct:
            self.results[version]["correct"] += 1
        self.results[version]["latencies"].append(latency_ms)

    def get_report(self) -> dict:
        report = {}
        for version, data in self.results.items():
            report[version] = {
                "accuracy": data["correct"] / data["total"] if data["total"] > 0 else 0,
                "total_samples": data["total"],
                "avg_latency_ms": sum(data["latencies"]) / len(data["latencies"]) if data["latencies"] else 0
            }
        return report

# 评估指标体系
EVALUATION_METRICS = {
    "accuracy": "输出结果的正确率",
    "format_compliance": "格式符合要求的比例",
    "completeness": "输出是否覆盖了所有要求的信息点",
    "relevance": "输出与问题的相关性评分",
    "token_efficiency": "有效输出 token / 总 token 消耗",
    "latency_p50_p99": "响应延迟分布",
    "hallucination_rate": "幻觉信息占比（需人工标注或自动化检测）"
}
```

### 迭代优化流程

```
1. 建立基准（Baseline）
   ├── 收集 50-100 个代表性测试用例
   ├── 记录当前 Prompt 版本的各项指标
   └── 确定优化目标（精度？延迟？成本？）

2. 分析错误模式
   ├── 分类错误类型（格式错误、逻辑错误、幻觉等）
   ├── 识别高频错误模式
   └── 确定最优先修复的错误类型

3. 迭代优化
   ├── 针对性调整 Prompt 要素（增加示例、细化约束等）
   ├── A/B 测试新旧版本
   ├── 量化对比各项指标
   └── 如果新版本显著优于旧版本，升级版本号

4. 监控与回归
   ├── 生产环境持续监控各项指标
   ├── 模型升级时重新验证 Prompt 效果
   └── 定期清理过时的 Prompt 版本
```

---

## Prompt 技术分类体系图

以下展示了 Prompt Engineering 技术的完整分类体系：

```
Prompt Engineering 技术栈
│
├── 基础技术
│   ├── 角色设定（Role Prompting）
│   ├── 指令工程（Instruction Engineering）
│   ├── 输出格式控制（Output Formatting）
│   └── 分隔符与结构化（Delimiters & Structure）
│
├── 示例驱动
│   ├── Zero-shot（零样本）
│   ├── One-shot（单样本）
│   ├── Few-shot（少样本）
│   └── Dynamic Few-shot（动态选择示例）
│
├── 推理增强
│   ├── Chain-of-Thought（CoT）
│   │   ├── Standard CoT（标准思维链）
│   │   ├── Zero-shot CoT（零样本思维链）
│   │   ├── Auto-CoT（自动思维链）
│   │   └── Complex CoT（复杂思维链）
│   │
│   ├── Tree-of-Thought（ToT）
│   │   ├── BFS 策略（广度优先）
│   │   └── DFS 策略（深度优先）
│   │
│   ├── Self-Consistency（自一致性）
│   ├── Graph-of-Thought（GoT）
│   └── Least-to-Most（从简到繁）
│
├── 推理与行动
│   ├── ReAct（推理+行动交替）
│   ├── Toolformer（工具学习）
│   └── Reflexion（自我反思）
│
├── 鲁棒性增强
│   ├── Self-Consistency（多路径投票）
│   ├── Self-Refine（自我修正）
│   ├── Generated Knowledge（生成知识增强）
│   └── Directional Stimulus（方向性刺激）
│
└── 工程化实践
    ├── Prompt 版本管理
    ├── A/B 测试框架
    ├── 自动化评估管线
    └── Prompt 模板库
```

---

## 延伸阅读

### 核心论文

| 论文 | 作者 / 年份 | 核心贡献 |
|------|------------|---------|
| **Chain-of-Thought Prompting Elicits Reasoning in Large Language Models** | Wei et al., 2022 | 首次系统提出 CoT，证明思维链对推理能力的激活效应 |
| **Tree of Thoughts: Deliberate Problem Solving with Large Language Models** | Yao et al., 2023 | 提出树状推理框架，支持探索与回溯 |
| **ReAct: Synergizing Reasoning and Acting in Language Models** | Yao et al., 2023 | 将推理和工具调用交替执行，奠定 Agent 架构基础 |
| **Self-Consistency Improves Chain of Thought Reasoning in Language Models** | Wang et al., 2023 | 多路径采样 + 多数投票的推理增强策略 |
| **Large Language Models are Zero-Shot Reasoners** | Kojima et al., 2022 | 发现 "Let's think step by step" 的零样本推理激活效应 |
| **Automatic Chain of Thought Prompting in Large Language Models** | Zhang et al., 2022 | Auto-CoT，自动生成推理链示例 |
| **Least-to-Most Prompting Enables Complex Reasoning in Large Language Models** | Zhou et al., 2023 | 将复杂问题分解为子问题序列逐步求解 |
| **Generated Knowledge Prompting for Commonsense Reasoning** | Liu et al., 2022 | 通过生成相关知识来增强推理，减少幻觉 |
| **Reflexion: Language Agents with Verbal Reinforcement Learning** | Shinn et al., 2023 | Agent 通过语言化的自我反思进行迭代改进 |

### 工程实践资源

- **OpenAI Prompt Engineering Guide**: https://platform.openai.com/docs/guides/prompt-engineering
- **Anthropic Prompt Engineering**: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering
- **Google Gemini Prompting Guide**: https://ai.google.dev/docs/prompt_best_practices
- **LangChain Hub**: https://smith.langchain.com/hub （Prompt 模板共享平台）
- **PromptLayer**: https://www.promptlayer.com （Prompt 版本管理与监控平台）

### 推荐阅读顺序

对于希望系统掌握 Prompt Engineering 的开发者，建议按以下顺序阅读：

1. **Wei et al. (2022)** — 理解 CoT 的核心原理
2. **Kojima et al. (2022)** — 理解 Zero-shot 的边界与潜力
3. **Wang et al. (2023)** — 掌握 Self-Consistency 的工程化思维
4. **Yao et al. (2023) ReAct** — 理解推理与行动的融合范式
5. **Yao et al. (2023) ToT** — 进入高级推理策略

从基础的 Prompt 五要素框架出发，逐步掌握 CoT 全家族技术，再到 ToT 和 ReAct 等高级策略，最终建立完整的 Prompt Engineering 技术栈认知体系——这是每一位 LLM 应用开发者的核心竞争力。
