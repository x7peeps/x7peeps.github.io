---
title: "AI Agent 架构全景：ReAct、Plan-and-Execute、Reflexion、LATS"
weight: 1
tags: [AI Agent, ReAct, Plan-and-Execute, Reflexion, LATS, 架构]
menu: 
  main: 
    parent: "Agent 架构与框架生态"
---

# AI Agent 架构全景：ReAct、Plan-and-Execute、Reflexion、LATS

从 2022 年 Chain-of-Thought prompting 的爆火到 2024 年各类 Agent 框架百花齐放，"Agent"这个词已经从学术概念演变为工程实践中的核心范式。但当我们剥开 LangChain、AutoGPT 等框架的外衣，真正理解其底层架构模式的开发者并不多。本文将从第一性原理出发，系统梳理当前主流的四种 Agent 架构模式——**ReAct、Plan-and-Execute、Reflexion、LATS**，并深入解析其设计理念、实现细节和适用边界。

---

## 1. Agent 的定义与核心循环

### 什么是 Agent？

在 AI 领域，**Agent（智能体）** 的核心定义是：**一个能够自主感知环境、做出决策并执行动作以达成目标的系统**。它与简单的 LLM 调用或 Chain（链）有本质区别：

| 特征 | Chain | Agent |
|------|-------|-------|
| 执行流程 | 线性、预定义 | 动态、自适应 |
| 决策能力 | 无（或极有限） | 有（基于推理） |
| 工具使用 | 固定编排 | 按需选择 |
| 循环次数 | 固定 | 自由决定何时停止 |
| 错误处理 | 通常忽略 | 可自我纠正 |

一个真正的 Agent 必须包含以下能力：

1. **自主决策**：能够根据当前状态独立选择下一步行动
2. **工具使用**：能够调用外部工具获取信息或执行操作
3. **记忆与上下文**：能够维持对话历史和任务状态
4. **终止判断**：能够判断任务是否完成并主动停止

### 核心循环：Perceive → Think → Act → Observe

所有 Agent 架构都可以抽象为一个统一的循环模式：

```
┌──────────────────────────────────────────────┐
│              Agent 核心循环                    │
│                                              │
│   ┌──────────┐                               │
│   │ Perceive │ ← 接收用户输入或环境反馈         │
│   └────┬─────┘                               │
│        ▼                                     │
│   ┌──────────┐                               │
│   │  Think   │ ← 推理当前状态，规划下一步       │
│   └────┬─────┘                               │
│        ▼                                     │
│   ┌──────────┐                               │
│   │   Act    │ ← 执行动作（调用工具/生成回复）   │
│   └────┬─────┘                               │
│        ▼                                     │
│   ┌──────────┐                               │
│   │ Observe  │ ← 观察动作结果                  │
│   └────┬─────┘                               │
│        │                                     │
│        └──────── 是否完成？──────────┐         │
│          否                         是        │
│          │                          │        │
│          ▼                          ▼        │
│       返回 Think               输出最终结果    │
└──────────────────────────────────────────────┘
```

这个循环看似简单，但不同的架构模式在**何时思考、如何思考、思考多深**上产生了根本性的分化，这正是 ReAct、Plan-and-Execute、Reflexion 和 LATS 四种模式的核心差异所在。

---

## 2. Agent 与传统工作流的本质区别

在理解具体架构之前，我们需要厘清 Agent 与传统工作流的边界。

### 静态流水线 vs 动态决策

传统工作流（如 Airflow DAG、Dify workflow）本质上是**静态流水线**：开发者在编排阶段就确定了每一步的执行顺序和条件分支。运行时只是按照预定义的路径执行，即使有条件分支，分支逻辑也是开发者预先编码的。

```python
# 传统工作流：开发者预先定义所有路径
def traditional_pipeline(user_input):
    intent = classify_intent(user_input)       # 步骤 1：预定义
    if intent == "query":
        result = search_knowledge_base(user_input)  # 步骤 2a：预定义
    elif intent == "action":
        result = call_api(user_input)               # 步骤 2b：预定义
    else:
        result = fallback_response()                # 步骤 2c：预定义
    formatted = format_output(result)            # 步骤 3：预定义
    return formatted
```

Agent 则不同，它的执行路径是**运行时动态决定的**：

```python
# Agent：运行时动态决策
def agent_loop(user_input):
    messages = [{"role": "user", "content": user_input}]
    
    while True:
        response = llm.chat(messages, tools=available_tools)
        
        if response.tool_calls:
            for tool_call in response.tool_calls:
                result = execute_tool(tool_call)
                messages.append({"role": "tool", "content": result})
        else:
            return response.content  # Agent 自主决定结束
```

### 自治性光谱（Autonomy Spectrum）

Agent 的自治程度并非非黑即白，而是一个连续光谱：

```
低自治                                              高自治
  │                                                   │
  ▼                                                   ▼
对话助手 ──→ 工具增强LLM ──→ ReAct Agent ──→ 自主Agent ──→ 完全自主系统
(无循环)    (单步工具)     (多步推理)     (计划+执行)   (自我进化)
```

理解这个光谱有助于我们根据实际需求选择合适的架构复杂度——**过度设计一个简单任务的 Agent 架构，往往比选择简单方案更糟糕**。

---

## 3. ReAct 模式详解

### 核心思想

**ReAct（Reasoning + Acting）** 由 Yao et al. 在 2022 年提出，其核心洞察极其简洁：**让 LLM 交替进行"思考"和"行动"**，而不是将推理和行动分离。

ReAct 的关键创新在于：每一步推理（Thought）都会显式地记录在上下文中，使模型可以利用之前的思考来指导后续的行动决策。这与 Chain-of-Thought 的区别在于——CoT 只在推理时使用内部推理，而 ReAct 将推理过程与外部工具调用**交织**在一起。

### 伪代码实现

```python
def react_agent(query: str, tools: list[Tool], max_steps: int = 10) -> str:
    """
    ReAct Agent 的核心实现
    
    Args:
        query: 用户查询
        tools: 可用工具列表
        max_steps: 最大执行步数（防止无限循环）
    
    Returns:
        最终答案
    """
    system_prompt = """你是一个能够使用工具的 AI 助手。
请按照 Thought → Action → Observation 的格式交替思考和行动。

Thought: 分析当前情况，决定下一步
Action: 调用工具（必须是以下之一: {tool_descriptions}）
Observation: 工具返回的结果（由系统自动填入）

当你确定已经得到答案时，直接给出 Final Answer。"""
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": query}
    ]
    
    for step in range(max_steps):
        response = llm.generate(messages)
        
        if "Final Answer:" in response:
            final_answer = response.split("Final Answer:")[-1].strip()
            return final_answer
        
        tool_name, tool_input = parse_action(response)
        observation = execute_tool(tool_name, tool_input)
        
        messages.append({"role": "assistant", "content": response})
        messages.append({"role": "user", "content": f"Observation: {observation}"})
    
    return "达到最大步数限制，无法完成任务"
```

### Thought Trace 分析

ReAct 的可解释性是其最大优势之一。以下是一个典型的 Thought Trace 示例：

```
Question: 北京和东京哪个城市的人口更多？两者的差距大约是多少？

Thought 1: 我需要查询两个城市的人口数据。先查北京的人口。
Action 1: search("北京 2024年人口")
Observation 1: 北京市常住人口约 2185 万人（2023年数据）

Thought 2: 已经知道北京的人口。现在需要查东京的人口。注意东京有"东京都"和"东京都市圈"两个概念。
Action 2: search("东京都 2024年人口")
Observation 2: 东京都人口约 1404 万人（2024年估算）

Thought 3: 现在有了两个数据。北京 2185 万，东京都 1404 万。差距约 781 万。
Action 3: （无需工具，直接回答）
Final Answer: 北京（约 2185 万人）比东京都（约 1404 万人）人口更多，差距约 781 万人。
```

注意第二个 Thought 中，模型**主动识别了"东京"概念的模糊性**，这是 ReAct 模式的一个重要优势——显式的思考过程给模型提供了自我纠正的机会。

### 优势与局限

**优势：**
- **可解释性高**：完整的 Thought Trace 使决策过程透明
- **实现简单**：核心逻辑不超过 30 行代码
- **灵活性强**：能够根据观察结果动态调整策略
- **无需预定义路径**：LLM 自主决定何时使用工具、何时直接回答

**局限：**
- **串行瓶颈**：每一步都需要等待 LLM 响应，延迟累积严重
- **长上下文退化**：步数增多后，早期 Thought 可能被"遗忘"在上下文窗口之外
- **容易陷入循环**：模型可能反复调用相同工具或重复相同思考
- **缺乏全局规划**：每一步只关注局部最优，可能偏离全局目标
- **成本随步数线性增长**：每步都消耗 LLM token

---

## 4. Plan-and-Execute 模式

### 两阶段架构

**Plan-and-Execute** 模式的核心思想与 ReAct 形成鲜明对比：**先全局规划，再逐步执行**。这种"分而治之"的策略借鉴了经典 AI 中的 STRIPS 规划器思想。

```
用户请求
    │
    ▼
┌─────────────┐
│   Planner   │ ← 一次性生成完整计划
│  (规划器)    │
└──────┬──────┘
       │  [Step1, Step2, Step3, ...]
       ▼
┌─────────────┐
│   Executor  │ ← 逐步执行每个步骤
│  (执行器)    │
└──────┬──────┘
       │  执行结果
       ▼
┌─────────────┐
│  Re-planner │ ← 根据执行结果决定是否调整计划
│ (重规划器)   │
└──────┬──────┘
       │
       ▼
   最终结果
```

### ReWOO 框架实现

**ReWOO（Reasoning Without Observation）** 是 Plan-and-Execute 的一个经典变体。其核心创新在于：**规划阶段不需要实际执行工具调用**，所有工具调用的结果在执行阶段一次性收集。

```python
from dataclasses import dataclass, field
from typing import Callable

@dataclass
class PlanStep:
    step_id: str
    description: str
    tool_name: str | None = None
    tool_input: str | None = None
    depends_on: list[str] = field(default_factory=list)

@dataclass
class Plan:
    goal: str
    steps: list[PlanStep]

def rewoo_agent(goal: str, tools: dict[str, Callable], llm) -> str:
    planner_prompt = f"""为以下目标制定详细执行计划。
    
目标: {goal}
可用工具: {list(tools.keys())}

输出格式（每行一步）:
[Step_id] 工具名 | 工具输入 | 依赖步骤(可选)

示例:
[Step1] search | 查询最新GDP数据 |
[Step2] calculator | 计算增长率 | Step1
[Step3] generate_report | 撰写分析报告 | Step1, Step2"""

    plan_text = llm.generate(planner_prompt)
    plan = parse_plan(plan_text)
    
    observations = {}
    for step in plan.steps:
        resolved_input = resolve_references(step.tool_input, observations)
        result = tools[step.tool_name](resolved_input)
        observations[step.step_id] = result
    
    synthesizer_prompt = f"""基于以下执行结果回答问题。

目标: {goal}
执行结果:
{format_observations(observations)}"""
    
    return llm.generate(synthesizer_prompt)
```

### 何时规划有益，何时反噬

**规划有益的场景：**
- **多步骤复杂任务**：如"分析竞品并生成报告"，需要搜索、整理、分析、生成等多个阶段
- **有明确依赖关系的任务**：后续步骤依赖前序步骤的结果
- **需要协调多个工具的场景**：避免重复调用、减少冗余

**规划有害的场景：**
- **高度不确定的任务**：规划阶段缺少执行反馈，计划可能严重偏离实际
- **探索性任务**：如开放式研究问题，事先无法确定需要多少步
- **信息获取不可预测**：搜索结果可能推翻之前的假设

关键判断标准是：**规划者在多大程度上能够预见执行阶段的实际情况**。如果不确定性过高，ReAct 的逐步探索可能比 Plan-and-Execute 更有效率。

### 规划器设计中的权衡

| 设计选择 | 优点 | 缺点 |
|---------|------|------|
| 详细的步骤描述 | 执行器更容易操作 | 规划器负担重，计划弹性差 |
| 高层目标描述 | 计划更有弹性 | 执行器可能误解意图 |
| 固定计划不可修改 | 简单可靠 | 无法适应意外情况 |
| 允许动态调整 | 更灵活 | 可能导致无限规划循环 |

---

## 5. Reflexion 模式

### 自我反思与迭代改进

**Reflexion** 由 Shinn et al. 在 2023 年提出，其核心思想源自认知科学中的**元认知（Metacognition）**概念：**Agent 不仅要完成任务，还要能够从失败中学习**。

Reflexion 的关键创新是引入了一个**反思（Reflection）机制**，使 Agent 能够：
1. 评估自己的表现
2. 识别失败原因
3. 将反思结果存入记忆
4. 在后续尝试中避免重复错误

```
┌─────────────────────────────────────────────────────────┐
│                  Reflexion 循环                          │
│                                                         │
│   ┌──────────┐     ┌──────────┐     ┌──────────┐       │
│   │ 执行任务  │────→│ 评估结果  │────→│ 反思总结  │       │
│   └──────────┘     └──────────┘     └────┬─────┘       │
│        ▲                                  │             │
│        │                                  ▼             │
│        │                          ┌──────────┐         │
│        └────────── 记忆 ←─────────│ 存入记忆  │         │
│                                   └──────────┘         │
└─────────────────────────────────────────────────────────┘
```

### 实现架构

```python
from dataclasses import dataclass, field

@dataclass
class ReflectionMemory:
    task_description: str
    attempts: list[dict] = field(default_factory=list)
    reflections: list[str] = field(default_factory=list)

def reflexion_agent(task: str, tools: list, llm, max_attempts: int = 3) -> str:
    memory = ReflectionMemory(task_description=task)
    evaluator = ToolAugmentedEvaluator(tools, llm)
    
    for attempt_num in range(max_attempts):
        result = execute_with_react(task, tools, llm, memory.reflections)
        
        evaluation = evaluator.evaluate(task, result)
        memory.attempts.append({
            "attempt": attempt_num + 1,
            "result": result,
            "score": evaluation.score,
            "feedback": evaluation.feedback
        })
        
        if evaluation.score >= evaluation.threshold:
            return result
        
        reflection = generate_reflection(
            task=task,
            attempt=result,
            feedback=evaluation.feedback,
            past_reflections=memory.reflections,
            llm=llm
        )
        memory.reflections.append(reflection)
    
    return memory.attempts[-1]["result"]

def generate_reflection(task, attempt, feedback, past_reflections, llm) -> str:
    reflection_prompt = f"""你刚刚尝试完成以下任务但未成功。

任务: {task}
你的回答: {attempt}
评估反馈: {feedback}

之前的反思记录:
{chr(10).join(f"- {r}" for r in past_reflections)}

请分析这次失败的原因，并给出具体改进建议。
注意：避免重复之前已经尝试过的策略。"""
    
    return llm.generate(reflection_prompt)
```

### Reflection Prompt 设计要点

Reflection 的质量直接决定了 Reflexion 模式的效果。以下是关键设计原则：

1. **具体而非笼统**：反思应指向具体的失败原因，而非"下次做得更好"之类的空泛表述
2. **避免重复**：prompt 中必须包含历史反思记录，引导模型产出差异化的改进策略
3. **面向行动**：反思的输出应是可操作的建议，而非纯分析性的总结
4. **约束范围**：将反思限制在可控范围内，防止模型过度发散

```python
# 差的反思
reflection_bad = "下次我应该更仔细地搜索。"

# 好的反思
reflection_good = """失败原因分析:
1. 我使用了过于宽泛的搜索词"AI进展"，返回了大量无关结果
2. 没有区分学术论文和新闻报道，导致引用质量不高

改进策略:
1. 使用具体的搜索词如"2024 LLM benchmark SOTA results"
2. 优先引用 arxiv.org 和官方 benchmark 排行榜
3. 搜索时加上 site:arxiv.org 限定学术来源"""
```

### Reflexion 的独特价值

Reflexion 最大的价值在于将**一次性交互转变为多轮迭代学习**。在代码生成任务中（如 HumanEval），Reflexion 方法在 2023 年就已达到远超单次生成的通过率。其核心价值不在于某一次尝试的成功，而在于**失败经验的结构化积累**。

---

## 6. LATS（Language Agent Tree Search）

### 树搜索驱动的 Agent 推理

**LATS（Language Agent Tree Search）** 由 Zhou et al. 在 2023 年提出，是四种架构中最为精巧的一种。它借鉴了蒙特卡洛树搜索（MCTS）的思想，将 Agent 的推理过程建模为**在树形搜索空间中的探索**。

与 ReAct 的线性探索和 Plan-and-Execute 的单次规划不同，LATS 的核心优势在于**系统性地探索多个分支路径，并通过回溯机制在发现死胡同时切换策略**。

### MCTS 启发的探索机制

LATS 的搜索树结构如下：

```
                        根节点（初始状态）
                       /        |        \
                  Action A    Action B    Action C
                  /            |            \
             Obs A1        Obs B1          Obs C1
            /    \             |              |
       A2a     A2b          Action B2     Action C2
       /         \            |              |
    Obs A2a1   Obs A2b1    Obs B2a        Obs C2a
      |            |         |               |
   完成 ✓     继续探索    完成 ✓         反思+回溯 ✗
```

### 实现框架

```python
from dataclasses import dataclass, field
from typing import Optional
import math

@dataclass
class LATSTreeNode:
    state: str
    action: Optional[str] = None
    observation: Optional[str] = None
    parent: Optional["LATSTreeNode"] = None
    children: list["LATSTreeNode"] = field(default_factory=list)
    visits: int = 0
    value: float = 0.0
    
    @property
    def ucb_score(self) -> float:
        if self.visits == 0:
            return float('inf')
        exploitation = self.value / self.visits
        exploration = math.sqrt(2 * math.log(self.parent.visits) / self.visits)
        return exploitation + exploration
    
    def best_child(self) -> "LATSTreeNode":
        return max(self.children, key=lambda c: c.ucb_score)

def lats_agent(task: str, tools: list, llm, 
               max_depth: int = 5, num_simulations: int = 10) -> str:
    root = LATSTreeNode(state=task)
    
    for _ in range(num_simulations):
        node = tree_policy(root, max_depth)
        
        if not is_terminal(node):
            children = expand(node, tools, llm)
            if children:
                node = children[0]
        
        reward = evaluate_node(node, task, llm)
        backpropagate(node, reward)
    
    best_leaf = select_best_solution(root)
    return extract_solution(best_leaf, llm)

def tree_policy(node: LATSTreeNode, max_depth: int) -> LATSTreeNode:
    current = node
    depth = 0
    while current.children and depth < max_depth:
        if any(c.visits == 0 for c in current.children):
            unvisited = [c for c in current.children if c.visits == 0]
            return unvisited[0]
        current = current.best_child()
        depth += 1
    return current

def expand(node: LATSTreeNode, tools: list, llm) -> list[LATSTreeNode]:
    actions_prompt = f"""基于当前状态，提出 2-3 个不同的可能行动方向。

当前状态: {node.state}
之前已尝试的方向: {get_action_history(node)}

每个方向用一句话描述。"""
    
    action_suggestions = llm.generate(actions_prompt)
    actions = parse_actions(action_suggestions)
    
    children = []
    for action in actions:
        observation = execute_action(action, tools)
        child = LATSTreeNode(
            state=f"{node.state}\nAction: {action}\nObservation: {observation}",
            action=action,
            observation=observation,
            parent=node
        )
        children.append(child)
    
    node.children = children
    return children

def evaluate_node(node: LATSTreeNode, task: str, llm) -> float:
    eval_prompt = f"""评估以下 Agent 执行过程对原始任务的完成程度。

原始任务: {task}
执行过程:
{node.state}

评分 0-10，0 表示完全偏离，10 表示完美完成。"""
    
    score_text = llm.generate(eval_prompt)
    return float(parse_score(score_text)) / 10.0

def backpropagate(node: LATSTreeNode, reward: float):
    current = node
    while current:
        current.visits += 1
        current.value += reward
        current = current.parent
```

### 回溯机制：LATS 的杀手锏

LATS 最显著的优势是其**回溯能力**。当一条探索路径被评估为低价值时，Agent 不会像 ReAct 那样陷入局部最优，而是会回溯到最近的分叉点，尝试其他路径。

这在以下场景中尤为关键：
- **创意生成任务**：需要探索多种风格或方向
- **复杂推理问题**：初始假设可能被证明是错误的
- **多步骤规划**：中间某一步的错误不应该浪费之前的所有努力

### LATS 的计算成本

LATS 的代价也很明显：**计算成本是四种模式中最高的**。每次模拟都需要多次 LLM 调用（扩展 + 评估），而多轮模拟进一步放大了成本。在实际部署中，通常需要通过以下策略来控制成本：

- 限制最大深度（max_depth）
- 控制模拟次数（num_simulations）
- 使用轻量级评估器（可以用小型模型代替大型 LLM 做价值评估）
- 引入剪枝策略，提前终止低价值分支

---

## 7. Agent 四大支柱深度解析

### 7.1 Planning（规划）

规划能力决定了 Agent 如何将复杂任务分解为可管理的子任务。

**顺序分解（Sequential）**：

```python
def sequential_decompose(task: str, llm) -> list[str]:
    prompt = f"""将以下任务分解为线性执行的子任务步骤。

任务: {task}

输出格式:
1. [步骤描述]
2. [步骤描述]
..."""
    return parse_steps(llm.generate(prompt))
```

**层次分解（Hierarchical）**：

```python
def hierarchical_decompose(task: str, llm) -> dict:
    high_level = llm.generate(f"将以下任务分解为 2-4 个高层次阶段: {task}")
    
    full_plan = {}
    for phase in parse_phases(high_level):
        subtasks = llm.generate(
            f"将阶段 '{phase}' 分解为具体可执行的子任务。"
        )
        full_plan[phase] = parse_steps(subtasks)
    
    return full_plan
```

**动态分解（Dynamic）**：

动态分解是最灵活的策略，不预先生成所有步骤，而是每一步执行完后根据结果决定下一步：

```python
def dynamic_decompose(current_state: str, goal: str, llm) -> str:
    prompt = f"""当前状态: {current_state}
目标: {goal}

基于当前进展，判断下一步应该做什么。
如果目标已达成，返回 'DONE'。"""
    return llm.generate(prompt)
```

### 7.2 Tool Use（工具使用）

工具使用是 Agent 能力的关键扩展。现代 LLM 通过 **Function Calling** 机制实现了结构化的工具调用。

```python
import json

def create_tool_schemas(tools: list[dict]) -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool["description"],
                "parameters": {
                    "type": "object",
                    "properties": tool["parameters"],
                    "required": tool.get("required", [])
                }
            }
        }
        for tool in tools
    ]

class ToolRouter:
    def __init__(self, tools: dict[str, callable], llm):
        self.tools = tools
        self.llm = llm
        self.schemas = create_tool_schemas(list(tools.values()))
    
    def route(self, query: str, context: str = "") -> dict:
        messages = [
            {"role": "system", "content": f"可用工具: {json.dumps(self.schemas)}"},
            {"role": "user", "content": f"上下文: {context}\n请求: {query}"}
        ]
        response = self.llm.chat(messages, tools=self.schemas)
        
        if response.tool_calls:
            results = []
            for call in response.tool_calls:
                tool_fn = self.tools[call.function.name]
                args = json.loads(call.function.arguments)
                result = tool_fn(**args)
                results.append({"tool": call.function.name, "result": result})
            return {"executed": results}
        
        return {"direct_response": response.content}
```

### 7.3 Memory（记忆）

Agent 的记忆系统可分为三个层次：

```python
from collections import deque

class AgentMemory:
    def __init__(self, embedding_model=None, vector_store=None):
        self.working_memory: list[dict] = []
        self.short_term_memory: deque = deque(maxlen=20)
        self.long_term_store = vector_store
        self.embedding_model = embedding_model
    
    def update_working(self, message: dict):
        self.working_memory.append(message)
    
    def save_short_term(self, summary: str):
        self.short_term_memory.append({
            "timestamp": get_timestamp(),
            "content": summary
        })
    
    def search_long_term(self, query: str, top_k: int = 3) -> list[str]:
        if not self.embedding_model or not self.long_term_store:
            return []
        query_embedding = self.embedding_model.encode(query)
        return self.long_term_store.search(query_embedding, top_k)
    
    def get_context(self, query: str) -> str:
        parts = []
        
        if self.working_memory:
            parts.append("当前对话上下文:")
            for msg in self.working_memory[-5:]:
                parts.append(f"  {msg['role']}: {msg['content'][:200]}")
        
        if self.short_term_memory:
            parts.append("\n近期任务记忆:")
            for mem in list(self.short_term_memory)[-3:]:
                parts.append(f"  [{mem['timestamp']}] {mem['content'][:200]}")
        
        long_term_results = self.search_long_term(query)
        if long_term_results:
            parts.append("\n相关历史记忆:")
            for result in long_term_results:
                parts.append(f"  - {result[:200]}")
        
        return "\n".join(parts)
```

**记忆层次对比：**

| 记忆类型 | 存储位置 | 容量 | 持久性 | 适用场景 |
|---------|---------|------|-------|---------|
| 工作记忆 | 上下文窗口 | ~8K-128K tokens | 单轮对话 | 当前推理状态 |
| 短期记忆 | 滑动窗口 | 固定大小 | 跨对话 | 近期摘要 |
| 长期记忆 | 向量数据库 | 几乎无限 | 永久 | 历史知识检索 |

### 7.4 Reflection（反思）

反思是连接其他三大支柱的元能力。它不直接执行任务，而是评估和优化 Agent 自身的行为。

```python
class AgentReflector:
    def __init__(self, llm):
        self.llm = llm
    
    def self_evaluate(self, task: str, action: str, 
                      result: str) -> dict:
        prompt = f"""评估以下 Agent 行为的质量。

任务: {task}
执行的动作: {action}
执行结果: {result}

请从以下维度评估（1-10分）:
1. 相关性：动作是否与任务相关？
2. 效率：是否有更高效的方式？
3. 完整性：结果是否完整回答了问题？
4. 准确性：结果是否准确？

输出格式:
- 相关性: X/10
- 效率: X/10
- 完整性: X/10
- 准确性: X/10
- 改进建议: ..."""
        
        evaluation = self.llm.generate(prompt)
        return parse_evaluation(evaluation)
    
    def course_correct(self, original_plan: str, 
                       evaluation: dict) -> str:
        if evaluation["overall_score"] >= 7:
            return original_plan
        
        prompt = f"""基于评估反馈，修正执行计划。

原始计划: {original_plan}
评估结果: {json.dumps(evaluation, ensure_ascii=False)}

请给出修正后的计划。"""
        
        return self.llm.generate(prompt)
```

---

## 8. 各模式适用场景对比

| 维度 | ReAct | Plan-and-Execute | Reflexion | LATS |
|------|-------|-------------------|-----------|------|
| **任务复杂度** | 中等 | 高 | 中-高 | 极高 |
| **工具使用频率** | 高（每步） | 中（按计划） | 高 | 高 |
| **可靠性要求** | 一般 | 较高 | 高 | 最高 |
| **计算成本** | 中 | 中-高 | 高（多轮） | 极高 |
| **延迟** | 中 | 中 | 高 | 高 |
| **可解释性** | 高 | 中 | 高 | 中 |
| **错误恢复能力** | 弱 | 中 | 强 | 最强 |
| **适合的任务类型** | 信息检索、问答 | 项目规划、报告生成 | 代码生成、推理 | 创意探索、复杂规划 |
| **实现复杂度** | 低 | 中 | 中 | 高 |
| **典型框架** | LangChain Agent | LangGraph | Reflexion论文 | LATS论文 |

### 选型决策树

```
你的任务是...
│
├── 单步完成即可？
│   └── 是 → 直接调用 LLM（无需 Agent）
│
├── 需要多次工具调用？
│   ├── 是，且步骤可预知？
│   │   ├── 步骤间依赖强 → Plan-and-Execute
│   │   └── 步骤间依赖弱 → ReAct
│   │
│   └── 是，但步骤不可预知 → ReAct
│
├── 容错要求高？
│   ├── 是，可以多次尝试？
│   │   └── Reflexion
│   │
│   └── 是，且需要找到最优解？
│       └── LATS
│
└── 需要创造性探索？
    └── LATS
```

---

## 9. 组合策略

在生产系统中，很少会只使用单一的架构模式。更常见的是**将多种模式组合使用**，以获得各模式的优势。

### Plan-and-Execute + Reflexion

这是最常见的生产级组合：先制定全局计划，执行后如果失败，通过反思修正计划。

```python
class HybridPlanAndReflectAgent:
    def __init__(self, tools, llm, max_revisions: int = 3):
        self.tools = tools
        self.llm = llm
        self.max_revisions = max_revisions
        self.reflector = AgentReflector(llm)
    
    def run(self, task: str) -> str:
        plan = self.create_plan(task)
        
        for revision in range(self.max_revisions):
            results = self.execute_plan(plan, task)
            evaluation = self.evaluate_results(task, plan, results)
            
            if evaluation["overall_score"] >= 7:
                return self.synthesize(task, plan, results)
            
            revision_suggestion = self.reflector.course_correct(
                plan, evaluation
            )
            plan = self.revise_plan(plan, revision_suggestion, results)
        
        return self.synthesize(task, plan, results)
    
    def create_plan(self, task: str) -> Plan:
        plan_prompt = f"""为以下任务制定执行计划。

任务: {task}
可用工具: {list(self.tools.keys())}

要求：
1. 每步清晰描述要做什么
2. 标注步骤间的依赖关系
3. 预估每步可能的失败点"""
        return parse_plan(self.llm.generate(plan_prompt))
    
    def execute_plan(self, plan: Plan, task: str) -> list[dict]:
        results = []
        context = ""
        
        for step in plan.steps:
            step_result = execute_step(step, self.tools, context)
            results.append({
                "step": step,
                "result": step_result,
                "success": step_result.get("success", True)
            })
            context += f"\n{step.description}: {step_result}"
            
            if not step_result.get("success", True):
                break
        
        return results
    
    def evaluate_results(self, task: str, plan: Plan, 
                         results: list[dict]) -> dict:
        return self.reflector.self_evaluate(
            task=json.dumps(plan.__dict__, ensure_ascii=False),
            action=json.dumps(results, ensure_ascii=False),
            result="详见执行记录"
        )
    
    def revise_plan(self, original_plan: Plan, 
                    suggestion: str, results: list[dict]) -> Plan:
        revise_prompt = f"""基于以下反馈修正执行计划。

原始计划步骤:
{format_plan(original_plan)}

已完成步骤及结果:
{format_results(results)}

改进建议: {suggestion}

请给出修正后的完整计划。"""
        return parse_plan(self.llm.generate(revise_prompt))
    
    def synthesize(self, task: str, plan: Plan, 
                   results: list[dict]) -> str:
        synth_prompt = f"""基于以下执行结果生成最终回答。

原始任务: {task}
执行步骤和结果:
{format_results(results)}

请整合所有结果，生成完整、准确的回答。"""
        return self.llm.generate(synth_prompt)
```

### ReAct + LATS

另一种高级组合是将 LATS 的多路径探索与 ReAct 的逐步推理结合：每个树节点的展开过程使用 ReAct 模式，而树的搜索策略使用 LATS。

这种组合特别适合**需要在多个候选方案中选择最优**的场景，如代码自动生成（生成多个候选方案，测试后选择通过测试的方案）。

### 生产系统的模式选择

在实际生产环境中，选择组合策略时需要考虑的关键因素：

1. **延迟预算**：Reflexion 和 LATS 需要多轮交互，延迟可能不可接受
2. **成本预算**：多轮 LLM 调用的成本可能超出预期
3. **质量底线**：某些场景下（如医疗建议、金融决策），单次正确率远比平均正确率重要
4. **监控可观测性**：复杂的组合模式会增加调试和监控的难度

---

## 10. 安全视角：Agent 的信任边界

### 不同 Agent 行为的信任等级

并非所有 Agent 动作的风险都是相同的。建立清晰的信任等级体系是安全设计的基础：

```
┌─────────────────────────────────────────────┐
│              信任等级金字塔                    │
│                                             │
│              🔴 Level 4                     │
│           不可逆物理操作                      │
│          （下单、发送邮件）                    │
│             需要人类确认                      │
│                                             │
│            🟠 Level 3                       │
│         可逆但有影响的操作                    │
│       （修改数据、调用API）                   │
│           需要预算/审批                       │
│                                             │
│           🟡 Level 2                        │
│          读取外部数据                         │
│        （搜索、查询数据库）                   │
│            自动执行+日志                      │
│                                             │
│          🟢 Level 1                         │
│         纯内部推理                            │
│       （分析、规划、反思）                    │
│            自动执行                           │
└─────────────────────────────────────────────┘
```

### Human-in-the-Loop 设计模式

```python
from enum import Enum

class TrustLevel(Enum):
    LOW = 1        # 内部推理，自动执行
    MEDIUM = 2     # 读取操作，自动执行+日志
    HIGH = 3       # 写入操作，需要审批
    CRITICAL = 4   # 不可逆操作，必须人类确认

TRUST_POLICIES = {
    "search": TrustLevel.MEDIUM,
    "read_database": TrustLevel.MEDIUM,
    "write_database": TrustLevel.HIGH,
    "send_email": TrustLevel.CRITICAL,
    "place_order": TrustLevel.CRITICAL,
    "execute_code": TrustLevel.HIGH,
}

class SafeAgentExecutor:
    def __init__(self, tools, approval_callback):
        self.tools = tools
        self.approval_callback = approval_callback
    
    def execute_action(self, action: str, params: dict) -> dict:
        trust_level = TRUST_POLICIES.get(action, TrustLevel.HIGH)
        
        if trust_level == TrustLevel.LOW:
            return self._auto_execute(action, params)
        
        if trust_level == TrustLevel.MEDIUM:
            result = self._auto_execute(action, params)
            self._log_action(action, params, result)
            return result
        
        if trust_level == TrustLevel.HIGH:
            return self._request_approval(action, params)
        
        if trust_level == TrustLevel.CRITICAL:
            return self._require_confirmation(action, params)
    
    def _request_approval(self, action: str, params: dict) -> dict:
        approved = self.approval_callback(
            action=action,
            params=params,
            level="approval"
        )
        if approved:
            return self._auto_execute(action, params)
        return {"status": "denied", "reason": "用户拒绝执行"}
    
    def _require_confirmation(self, action: str, params: dict) -> dict:
        result = self._auto_execute(action, params)
        confirmed = self.approval_callback(
            action=action,
            params=params,
            result=result,
            level="confirmation"
        )
        if not confirmed:
            return {"status": "rolled_back", "reason": "用户拒绝确认"}
        return result
    
    def _auto_execute(self, action: str, params: dict) -> dict:
        return self.tools[action](**params)
    
    def _log_action(self, action: str, params: dict, result: dict):
        pass
```

### 升级策略（Escalation Strategies）

在生产环境中，Agent 的升级策略决定了系统在遇到异常时的行为：

1. **静默降级**：Agent 无法完成时，回退到简单规则处理
2. **渐进升级**：先尝试自动解决，失败后请求人类介入
3. **紧急停止**：检测到潜在危险时立即终止执行
4. **预算熔断**：LLM 调用次数或 token 消耗超过阈值时自动停止

```python
class EscalationManager:
    def __init__(self, max_llm_calls: int = 20, 
                 max_tokens: int = 50000):
        self.max_llm_calls = max_llm_calls
        self.max_tokens = max_tokens
        self.current_calls = 0
        self.current_tokens = 0
    
    def check_budget(self) -> bool:
        if self.current_calls >= self.max_llm_calls:
            raise BudgetExceededException(
                f"LLM 调用次数已达上限 {self.max_llm_calls}"
            )
        if self.current_tokens >= self.max_tokens:
            raise BudgetExceededException(
                f"Token 消耗已达上限 {self.max_tokens}"
            )
        return True
    
    def should_escalate(self, consecutive_failures: int,
                        total_steps: int) -> bool:
        if consecutive_failures >= 3:
            return True
        if total_steps > 15 and not has_made_progress():
            return True
        return False
```

---

## 11. 四种 Agent 模式流程对比图

```
═══════════════════════════════════════════════════════════════════════════
                        四种 Agent 模式流程对比
═══════════════════════════════════════════════════════════════════════════

【ReAct】线性交替，逐步推进
────────────────────────────────────────────────────
  输入 ──→ Thought ──→ Action ──→ Observation ──→ Thought ──→ Action
              │                                    │            │
              └──────────── 循环 ─────────────────┘            │
                                                               ▼
                                                              输出

  特点: 每步只看局部，无法回退，串行执行

─────────────────────────────────────────────────────────────────────────

【Plan-and-Execute】先全局规划，再逐步执行
────────────────────────────────────────────────────
  输入 ──→ ┌──────────────┐
           │  Planner     │
           │  生成完整计划  │
           └──────┬───────┘
                  │  [Step1, Step2, Step3, Step4]
                  ▼
           Step1 ──→ Step2 ──→ Step3 ──→ Step4 ──→ Synthesizer ──→ 输出
                                                              ▲
           可选: ┌──────────────┐                              │
                 │  Re-planner  │ ── 调整后续步骤 ──────────────┘
                 └──────────────┘

  特点: 全局视角，计划可调整，依赖规划质量

─────────────────────────────────────────────────────────────────────────

【Reflexion】多轮迭代，自我改进
────────────────────────────────────────────────────
  输入 ──→ 尝试1 ──→ 评估 ──→ 失败? ──→ 反思 ──→ 记忆
                          │                          │
                          │         ┌────────────────┘
                          │         ▼
                          │      尝试2 ──→ 评估 ──→ 失败? ──→ 反思 ──→ 记忆
                          │                                         │
                          │         ┌──────────────────────────────┘
                          │         ▼
                          │      尝试3 ──→ 评估 ──→ 成功? ──→ 输出
                          │
                          ▼ (成功则直接输出)
                         输出

  特点: 从失败中学习，记忆驱动改进，多次尝试

─────────────────────────────────────────────────────────────────────────

【LATS】树形搜索，多路径探索 + 回溯
────────────────────────────────────────────────────
                         输入
                          │
                     ┌────┴────┐
                     ▼         ▼
                  Action A   Action B
                  /    \        │
              Obs A1  Obs A2  Obs B1
              /         │       │
          Act A1a    完成 ✓  Act B1a
          /                    │
       Obs A1a              Obs B1a
       │                     │
    完成 ✓ ────── 评估(低分) ───→ 回溯到分叉点 ──→ 尝试 Action C
                                                       │
                                                       ▼
                                                    完成 ✓

  特点: 探索多条路径，评估后回溯，寻找最优解

═══════════════════════════════════════════════════════════════════════════
```

### 性能特征对比

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  LLM 调用次数 vs 任务复杂度                                       │
│                                                                 │
│  调用次数                                                        │
│  ▲                                                              │
│  │                              LATS ╱                         │
│  │                           Reflexion ╱╱                       │
│  │                       P&E ╱╱                                 │
│  │                   ReAct╱╱                                    │
│  │               ╱╱╱╱                                           │
│  │           ╱╱╱╱                                               │
│  │       ╱╱╱╱                                                   │
│  │   ╱╱╱╱                                                       │
│  │╱╱╱                                                           │
│  └──────────────────────────────────────────────→ 任务复杂度     │
│  简单                                    复杂                     │
│                                                                 │
│  注: ReAct 近似线性增长，P&E 较平稳，Reflexion 和 LATS 随复杂度   │
│     快速增长                                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 12. 延伸阅读

### 核心论文

1. **ReAct**: Yao, S., et al. (2022). *ReAct: Synergizing Reasoning and Acting in Language Models.* ICLR 2023. — 提出 Reasoning + Acting 交替范式的奠基性论文。

2. **Plan-and-Execute**: Wang, L., et al. (2023). *Plan-and-Solve Prompting: Improving Zero-Shot Chain-of-Thought Reasoning by Large Language Models.* ACL 2023. — Plan-and-Solve prompting 的原始论文。

3. **ReWOO**: Xu, B., et al. (2023). *ReWOO: Decoupling Reasoning from Observations for Efficient Augmented Language Models.* — Plan-and-Execute 的重要变体，将规划与观察解耦。

4. **Reflexion**: Shinn, N., et al. (2023). *Reflexion: Language Agents with Verbal Reinforcement Learning.* NeurIPS 2023. — 提出通过语言反思进行自我改进的框架。

5. **LATS**: Zhou, A., et al. (2023). *Language Agent Tree Search Unifies Reasoning Acting and Planning in Language Models.* — 将 MCTS 引入 LLM Agent 的开创性工作。

6. **Toolformer**: Schick, T., et al. (2023). *Toolformer: Language Models Can Teach Themselves to Use Tools.* NeurIPS 2023. — LLM 自主学习使用工具的里程碑论文。

### 框架与工具

- **LangChain** (https://github.com/langchain-ai/langchain) — 最流行的 LLM 应用开发框架，内置 ReAct Agent 实现
- **LangGraph** (https://github.com/langchain-ai/langgraph) — 基于图的 Agent 编排框架，适合实现复杂的 Agent 工作流
- **CrewAI** (https://github.com/joaomdmoura/crewAI) — 多 Agent 协作框架
- **AutoGen** (https://github.com/microsoft/autogen) — 微软开源的多 Agent 对话框架
- **Semantic Kernel** (https://github.com/microsoft/semantic-kernel) — 微软的 LLM 编排 SDK
- **Claude Agent SDK** — Anthropic 官方的 Agent 开发工具

### 综合资源

- **LLM Agent Survey**: Wang, L., et al. (2024). *A Survey on Large Language Model based Autonomous Agents.* — 全面综述 LLM Agent 的研究进展
- **Building Effective Agents**: Anthropic (2024). — Anthropic 官方发布的 Agent 构建实践指南，强调简单架构优先原则
- **The Shift from Models to Compound AI Systems**: Berkeley AI Research (2024). — 关于复合 AI 系统的前瞻性分析

---

## 总结

回顾本文讨论的四种 Agent 架构模式，它们本质上是**在自主性、可靠性和效率之间做不同的权衡**：

- **ReAct** 是最简单也最通用的起点，适合大多数需要工具调用的场景
- **Plan-and-Execute** 在任务可预规划时能显著提高效率和连贯性
- **Reflexion** 是提升可靠性的利器，以额外的计算成本换取更高的成功率
- **LATS** 是最强大也最昂贵的模式，适合需要探索多种可能性的复杂决策场景

在实践中，最重要的原则是**从简单开始，按需增加复杂度**。正如 Anthropic 在其 Agent 构建指南中所强调的：**"先尝试最简单的方案，只在证明不够用时才引入更复杂的架构"**。过度设计一个 Agent 系统，往往比选择一个"简单但足够好"的方案带来更多的维护负担。

Agent 架构的演进还在继续。随着 LLM 能力的持续提升、上下文窗口的扩大以及推理速度的加快，我们有理由相信，今天的架构模式将在不久的将来迎来根本性的革新。但无论架构如何演变，**感知-思考-行动-观察**这个核心循环，以及对可靠性、安全性和可解释性的追求，将始终是 Agent 系统设计的基石。
