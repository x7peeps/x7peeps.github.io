---
title: "Agentic RAG：让 Agent 驱动检索增强生成的架构演进与工程实践"
weight: 5
tags: [Agentic RAG, AI Agent, RAG, 检索增强生成, 多步推理, LangGraph]
menu:
  main:
    parent: "RAG与知识库"
---

# Agentic RAG：让 Agent 驱动检索增强生成的架构演进与工程实践

传统 RAG 系统的工作方式可以类比为一个忠实但缺乏主动性的图书管理员——你提出问题，它在指定的书架上搜索相关段落，然后把原文呈现给你。这个模式在简单事实查询场景下运转良好，但当用户问出"对比分析 A 方案和 B 方案在生产环境中的性能差异，并给出推荐"这样的复合型问题时，单次检索的静态管道就显得力不从心。传统 RAG 的根本局限在于**检索决策是预定义的、不可调整的**——系统不会根据中间推理结果动态调整检索策略，无法判断当前检索结果是否充分，更不能自主发起多轮检索。

2025 年以来，一种被称为 **Agentic RAG** 的新范式正在快速从学术研究走向生产实践。根据 arXiv 上最新的综述论文（Singh et al., 2025，v4 更新至 2026 年 4 月），Agentic RAG 通过将自主 AI Agent 嵌入 RAG 管道，实现了**动态检索策略管理、迭代式上下文精化和自适应工作流编排**。MLOps Community 在 2026 年 5 月发布的基准测试显示，Agentic RAG 结合知识图谱在 47 个生产部署中**将幻觉率降低了约 62%**。

本文将从传统 RAG 的结构性瓶颈出发，系统梳理 Agentic RAG 的架构分类、核心设计模式、关键组件实现，以及框架选型与工程落地实践，帮助技术从业者建立从"知道 Agentic RAG 是什么"到"知道如何在项目中落地"的完整认知。

---

## 1. 从传统 RAG 到 Agentic RAG：范式演进

### 1.1 RAG 的五代演进

理解 Agentic RAG 的最佳方式是将其放在 RAG 技术的演进脉络中：

| 阶段 | 代表范式 | 核心特征 | 局限性 |
| :--- | :--- | :--- | :--- |
| **第一代** | Naive RAG | 关键词检索（BM25/TF-IDF）+ LLM 生成 | 无语义理解，检索质量低 |
| **第二代** | Advanced RAG | 向量检索 + 混合检索 + Reranker | 静态管道，单次检索 |
| **第三代** | Modular RAG | 可组合模块：查询改写、路由、重排序 | 模块间缺乏自适应协调 |
| **第四代** | Graph RAG | 知识图谱 + 社区摘要 + 图遍历检索 | 构建成本高，实体抽取开销大 |
| **第五代** | **Agentic RAG** | Agent 驱动的动态检索 + 多步推理 + 自我修正 | 延迟更高，成本更高，编排复杂度高 |

> **关键转折**：从第四代到第五代的核心变化是**引入了显式的控制层**——Agent 不再只是执行预定义的检索管道，而是能够自主决定"何时检索、检索什么、是否需要再次检索、当前结果是否充分"。

### 1.2 传统 RAG 的三个结构性瓶颈

传统 RAG 的问题不是检索算法不够好，而是**架构层面的根本性限制**：

**上下文整合能力不足**：传统管道将检索结果直接拼接到 Prompt 中，无法判断检索到的上下文是否与查询的深层意图匹配。当查询包含隐含的跨文档推理需求时，单次检索往往遗漏关键信息。

**多步推理缺失**：复杂问题通常需要"检索 → 推理 → 发现信息缺口 → 再次检索 → 综合判断"的迭代过程。传统 RAG 的管道是线性的，一次检索后直接生成答案，无法支持这种循环推理。

**自我修正机制为零**：如果检索到的内容质量不高或者包含矛盾信息，传统 RAG 没有任何机制来检测和修正——它会忠实地将低质量上下文交给 LLM，由 LLM 自行"脑补"，最终产出幻觉。

---

## 2. Agentic RAG 核心架构分类

Agentic RAG 的核心思想是**将 RAG 管道从静态管道改造为由 Agent 控制的动态系统**。根据 Agent 的数量、控制结构和自主程度，可以划分为以下架构类型：

```
┌────────────────────────────────────────────────────────────────┐
│                  Agentic RAG 架构分类                           │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ 单 Agent     │  │ 多 Agent     │  │ 层级式 Agent         │ │
│  │ Router 架构  │  │ 协作架构      │  │ 层级架构             │ │
│  ├──────────────┤  ├──────────────┤  ├──────────────────────┤ │
│  │ • 路由决策    │  │ • 并行检索    │  │ • 总控规划 Agent     │ │
│  │ • 策略选择    │  │ • 领域分工    │  │ • 子任务 Agent       │ │
│  │ • 单源查询    │  │ • 结果聚合    │  │ • 执行层 Agent       │ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘ │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ Corrective   │  │ Adaptive     │  │ Graph-Based          │ │
│  │ RAG 架构     │  │ RAG 架构     │  │ RAG 架构             │ │
│  ├──────────────┤  ├──────────────┤  ├──────────────────────┤ │
│  │ • 质量评估    │  │ • 查询复杂度 │  │ • 知识图谱遍历       │ │
│  │ • 自动重检索  │  │   动态判断    │  │ • Agent-G 框架       │ │
│  │ • 纠错循环    │  │ • 策略自适应  │  │ • GeAR 增强          │ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### 2.1 单 Agent Router 架构

**最简洁的 Agentic RAG 形态**。一个 Agent 充当路由器角色，根据用户查询的语义特征决定检索策略——选择哪个数据源、使用哪种检索方式、是否需要查询改写。

**核心工作流**：

```
用户查询 → Agent 分析意图 → 选择检索策略 → 执行检索 → 评估结果 → 生成/重检索
```

**适用场景**：查询来源明确、检索策略可枚举的中等复杂度场景。例如企业内部知识库问答，Agent 根据问题类型路由到 HR 政策库、技术文档库或财务报告库。

**优势**：延迟低、实现简单、调试容易。**局限**：无法处理需要跨多个数据源综合推理的复杂查询。

### 2.2 多 Agent 协作架构

多个专职 Agent 各自负责特定领域或数据源的检索，由一个协调 Agent 统一调度。

**核心工作流**：

```
用户查询 → 协调 Agent 分解子任务 → 分发给领域 Agent → 各自检索 → 结果聚合 → 综合生成
```

**优势**：天然支持并行检索，可扩展到多个异构数据源。**挑战**：Agent 间的协调开销、结果冲突消解、整体延迟受最慢 Agent 制约。

### 2.3 层级式 Agent 架构

引入管理层级：顶层规划 Agent 负责任务分解和全局策略，中间层 Agent 负责子任务协调，底层执行 Agent 负责具体检索操作。

**优势**：可扩展性最强，适合大型企业级系统。**挑战**：层级间通信开销大，故障传播路径复杂，调试难度显著上升。

### 2.4 Corrective RAG（自纠正式 RAG）

**核心创新**：在检索结果和生成之间增加一个**质量评估 Agent**，自动判断检索结果的可靠性，并在质量不达标时触发重新检索。

```
检索结果 → 质量评估 Agent → 评分 ≥ 阈值 → 生成答案
                          → 评分 < 阈值 → 查询改写 → 重新检索 → 再次评估
```

这种"检索-评估-纠正"的循环是 Agentic RAG 区别于传统 RAG 最直观的体现。

### 2.5 Adaptive RAG（自适应 RAG）

根据查询的复杂度**动态选择**最合适的处理策略：简单查询走快速直通路径，复杂查询激活完整的 Agent 推理链。

**决策逻辑**：

| 查询复杂度判断 | 处理路径 | 延迟 | 成本 |
| :--- | :--- | :--- | :--- |
| 简单事实查询 | 直接检索 → 生成 | 低 | 低 |
| 中等复杂度 | 查询改写 → 检索 → 重排序 → 生成 | 中 | 中 |
| 多步推理查询 | Agent 规划 → 多轮检索 → 迭代推理 → 生成 | 高 | 高 |

### 2.6 Graph-Based Agentic RAG

将知识图谱与 Agent 推理能力结合。Agent 在知识图谱上执行**有目的的图遍历**——不是盲目搜索所有实体关系，而是根据推理需要动态决定遍历方向。

代表工作包括 **Agent-G**（利用 Agent 在知识图谱上进行多跳推理）和 **GeAR**（图增强的检索增强生成，将图结构信息编码到检索过程中）。

---

## 3. Agentic RAG 五大设计模式

Agentic RAG 的工作流编排可以归纳为五种核心设计模式，这些模式来自 Anthropic 和学术界对 Agent 工作流的系统性总结：

### 3.1 Prompt Chaining（提示链）

将复杂查询分解为顺序执行的子步骤，每个步骤的输出作为下一步的输入。

```python
# 伪代码：Prompt Chaining 模式
def agentic_rag_chain(query: str) -> str:
    sub_queries = planner_agent.decompose(query)
    context_parts = []
    for sq in sub_queries:
        docs = retriever.search(sq)
        refined = reflector_agent.evaluate(docs, sq)
        context_parts.append(refined)
    return generator_agent.synthesize(query, context_parts)
```

**适用场景**：步骤间有明确依赖关系的查询，如"先查 A 公司财报，再对比 B 公司同期数据"。

### 3.2 Routing（路由）

根据查询特征将请求分发到不同的专业处理路径。

```
                    ┌→ 技术文档检索 Agent ─┐
用户查询 → 路由 Agent ├→ 财务数据检索 Agent ─┤ → 结果聚合 → 生成
                    └→ 外部 API 调用 Agent ─┘
```

**适用场景**：查询来源多样、需要根据意图选择不同处理策略的场景。

### 3.3 Parallelization（并行化）

将查询拆分为独立子任务并行执行，显著降低总延迟。

**适用场景**：多个子查询之间无依赖关系，如"同时检索产品文档、用户反馈和竞品分析"。

### 3.4 Orchestrator-Workers（编排者-工作者）

一个编排 Agent 作为总控，动态分配任务给工作者 Agent，根据中间结果调整后续策略。

**与简单路由的区别**：路由是预定义的分发逻辑，编排者具有**运行时决策能力**——它能根据中间结果决定下一步行动，而不仅仅是选择预设路径。

### 3.5 Evaluator-Optimizer（评估-优化循环）

引入评估 Agent 对检索/生成结果进行质量判定，不合格时触发优化循环。

```
生成结果 → 评估 Agent 评判 → 合格 → 输出
                          → 不合格 → 反馈优化 → 重新生成 → 再次评估
```

**适用场景**：对输出质量要求极高的场景，如法律文书生成、医疗咨询回答。

---

## 4. Agentic RAG 核心组件详解

一个完整的 Agentic RAG 系统包含六个核心组件：

### 4.1 规划模块（Planner）

规划模块负责将用户查询转化为可执行的检索计划。**规划与生成的分离**是 Agentic RAG 区别于传统 RAG 的关键特征——传统 RAG 中检索是生成的前置步骤，而 Agentic RAG 中规划是独立于生成的控制层。

```python
class AgenticPlanner:
    def plan(self, query: str) -> RetrievalPlan:
        query_type = self.classify_query(query)
        if query_type == "simple_fact":
            return RetrievalPlan(steps=[SingleRetrieval(query)])
        elif query_type == "multi_hop":
            sub_queries = self.decompose(query)
            return RetrievalPlan(
                steps=[IterativeRetrieval(sq) for sq in sub_queries],
                strategy="sequential_with_reflection"
            )
        elif query_type == "comparative":
            return RetrievalPlan(
                steps=[ParallelRetrieval(query)],
                strategy="parallel_then_merge"
            )
```

### 4.2 检索引擎（Retrieval Engine）

Agentic RAG 中的检索引擎不再是固定的向量相似度搜索，而是支持**多种检索策略的可切换引擎**：

| 检索策略 | 实现方式 | 适用场景 |
| :--- | :--- | :--- |
| **稠密检索** | Embedding 相似度 | 语义匹配为主 |
| **稀疏检索** | BM25 关键词匹配 | 精确术语匹配 |
| **混合检索** | 稠密 + 稀疏 融合 | 通用场景 |
| **图检索** | 知识图谱遍历 | 实体关系推理 |
| **Web 检索** | 外部 API 调用 | 实时信息需求 |

### 4.3 推理引擎（Reasoning Engine）

推理引擎是 Agent 的"大脑"，负责在每一步决策中进行推理。常见实现包括 **ReAct 框架**（交替进行推理和行动）和 **Plan-and-Execute 框架**（先规划完整计划再执行）。

### 4.4 记忆系统（Memory）

Agentic RAG 需要维护跨轮次的上下文记忆，避免重复检索：

- **工作记忆**：当前对话轮次的上下文窗口
- **会话记忆**：同一用户会话中的历史查询和检索结果
- **语义缓存**：相似查询的检索结果缓存，减少重复计算

### 4.5 工具编排层（Tool Orchestration）

Agent 可以调用的外部工具不限于检索引擎，还包括：SQL 查询器、API 调用器、计算器、代码执行器等。工具编排层负责管理工具注册、权限控制和结果格式化。

### 4.6 自我修正模块（Self-Correction）

通过评估检索结果的质量（相关性评分、信息充分性判断、矛盾检测），在结果不达标时触发自动修正——可能是查询改写、检索策略切换或多轮迭代。

---

## 5. 框架选型与工程实践

### 5.1 主流框架对比

| 框架 | 定位 | Agentic RAG 支持 | 优势 | 适用场景 |
| :--- | :--- | :--- | :--- | :--- |
| **LangGraph** | Agent 编排框架 | ★★★★★ | 状态机工作流，持久化执行 | 生产级多步推理系统 |
| **LlamaIndex** | 检索优先框架 | ★★★★ | 最强文档解析（LlamaParse） | 文档密集型 RAG |
| **LangChain** | 通用 Agent 框架 | ★★★★ | 最广泛的集成生态 | 快速原型和工具集成 |
| **Haystack** | 端到端编排框架 | ★★★ | 模块化 Pipeline 设计 | 企业级生产部署 |
| **RAGFlow** | RAG 引擎 + Agent | ★★★★ | 开箱即用，支持多模态 | 中小企业快速部署 |
| **R2R** | 深度研究 RAG | ★★★ | Deep Research API | 研究型检索场景 |

### 5.2 基于 LangGraph 的 Agentic RAG 实现

LangGraph 是目前构建 Agentic RAG 最成熟的框架之一。以下是一个完整的实现示例，展示如何构建一个支持自适应检索的 Agentic RAG 系统：

```python
from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
from typing import TypedDict, Annotated, List
import operator

class AgentState(TypedDict):
    query: str
    search_strategy: str
    retrieved_docs: List[str]
    quality_score: float
    iteration: int
    answer: str

llm = ChatOpenAI(model="gpt-4o", temperature=0)
vectorstore = Chroma(embedding_function=OpenAIEmbeddings())

def classify_query(state: AgentState) -> AgentState:
    response = llm.invoke(f"""
    分析以下查询的复杂度，输出分类结果：
    查询: {state["query"]}
    分类: simple / moderate / complex
    """)
    strategy = "direct" if "simple" in response.content.lower() else \
               "rewrite" if "moderate" in response.content.lower() else \
               "decompose"
    return {**state, "search_strategy": strategy, "iteration": 0}

def retrieve(state: AgentState) -> AgentState:
    query = state["query"]
    if state["search_strategy"] == "rewrite":
        response = llm.invoke(f"改写以下查询以提高检索质量：{query}")
        query = response.content
    docs = vectorstore.similarity_search(query, k=5)
    return {**state, "retrieved_docs": [d.page_content for d in docs]}

def evaluate(state: AgentState) -> AgentState:
    docs_text = "\n".join(state["retrieved_docs"])
    response = llm.invoke(f"""
    评估以下检索结果对查询 '{state["query"]}' 的回答质量。
    输出 1-10 的分数和简要理由。
    检索结果: {docs_text}
    """)
    score = float(response.content.split()[0])
    return {**state, "quality_score": score, "iteration": state["iteration"] + 1}

def should_retry(state: AgentState) -> str:
    if state["quality_score"] >= 7 or state["iteration"] >= 3:
        return "generate"
    return "retrieve"

def generate(state: AgentState) -> AgentState:
    docs_text = "\n".join(state["retrieved_docs"])
    response = llm.invoke(f"""
    基于以下参考资料回答用户问题。
    问题: {state["query"]}
    参考资料: {docs_text}
    """)
    return {**state, "answer": response.content}

graph = StateGraph(AgentState)
graph.add_node("classify", classify_query)
graph.add_node("retrieve", retrieve)
graph.add_node("evaluate", evaluate)
graph.add_node("generate", generate)

graph.set_entry_point("classify")
graph.add_edge("classify", "retrieve")
graph.add_edge("retrieve", "evaluate")
graph.add_conditional_edges("evaluate", should_retry, {
    "retrieve": "retrieve",
    "generate": "generate"
})
graph.add_edge("generate", END)

app = graph.compile()
result = app.invoke({"query": "对比分析向量数据库和图数据库在 RAG 场景下的性能差异"})
```

### 5.3 工程落地的六个关键决策

**决策一：Agentic RAG 是否是正确的选择？**

> **直白警告**：不是所有 RAG 问题都需要 Agentic RAG。如果用户查询 80% 以上是简单事实查询，Advanced RAG（混合检索 + Reranker）已经足够。Agentic RAG 的额外延迟和成本在简单场景下是浪费。

**决策二：单 Agent 还是多 Agent？**

从单 Agent Router 开始，只在确实需要多数据源并行检索或复杂任务分解时才引入多 Agent 架构。**多 Agent 带来的协调开销是真实的，不是理论上的。**

**决策三：检索策略如何组合？**

推荐起步配置：**混合检索（BM25 + Dense）+ Reranker**。根据评测数据逐步添加图检索或 Web 检索。

**决策四：迭代上限如何设定？**

每次 Agentic 循环都消耗 Token 和时间。建议设置硬性上限（如最多 3 轮迭代），避免 Agent 陷入无限循环。

**决策五：如何处理幻觉？**

Agentic RAG 可以**降低**幻觉率但无法完全消除。关键是建立**引用追踪机制**——每段生成内容必须标注来源文档，便于人工审核。

**决策六：可观测性如何保证？**

Agentic RAG 的调试比传统 RAG 困难得多，因为决策路径是动态的。**必须在设计阶段就引入 Trace 追踪**——记录每一步的 Agent 决策、检索查询、检索结果和质量评分。

---

## 6. 性能基准与实际效果

根据多个来源的基准测试数据：

| 指标 | 传统 RAG | Agentic RAG | 提升幅度 |
| :--- | :--- | :--- | :--- |
| **平均准确率** | 基准 | +33% | 显著提升 |
| **多跳查询准确率** | 基准 | +47% | 大幅提升 |
| **复杂查询准确率** | 基准 | +52% | 大幅提升 |
| **幻觉率** | 基准 | -62%（含知识图谱） | 显著降低 |
| **平均延迟** | 200-500ms | 1000-5000ms | 5-10x 增加 |
| **单次查询成本** | 基准 | 3-8x 增加 | 显著增加 |

> **工程启示**：性能提升是真实的，但成本和延迟的增加也是真实的。选择 Agentic RAG 的决策本质上是一个**准确性 vs 成本/延迟的权衡**。对于高价值查询（如医疗诊断辅助、法律合规审查），这个权衡通常是值得的；对于高频低价值查询（如 FAQ），传统 RAG 仍然是更优解。

---

## 7. 总结与展望

- **Agentic RAG 是 RAG 技术演进的自然方向**，它将静态检索管道改造为由 Agent 控制的动态系统，核心能力在于自主决策、多步推理和自我修正

- **架构选择应从简单到复杂渐进**：从单 Agent Router 起步，根据实际需求逐步引入多 Agent 协作、Corrective RAG 和 Graph-Based RAG。**过度设计一个简单任务的 Agentic RAG，往往比选择传统 RAG 更糟糕**

- **性能提升有据可查但代价真实**：多跳查询准确率提升 47%、幻觉率降低 62% 的数据令人振奋，但 5-10x 的延迟增加和 3-8x 的成本增加是必须正视的工程约束

- **框架选型建议**：LangGraph 是生产级 Agentic RAG 的首选框架，LlamaIndex 在文档密集型场景下更优，两者结合（LlamaIndex 做检索引擎 + LangGraph 做 Agent 编排）是目前最强大的组合

- **未来的方向**在于评估体系的标准化、多模态 Agentic RAG（图像、表格、音频联合检索）、以及 Agent 记忆系统的长期化——从会话级记忆走向跨会话的持久化知识积累

---

## 参考资源

- [Agentic Retrieval-Augmented Generation: A Survey on Agentic RAG](https://arxiv.org/abs/2501.09136) — Singh et al., arXiv 综述论文（v4, 2026.04），系统性梳理 Agentic RAG 的分类体系、架构比较和应用场景
- [SoK: Agentic RAG — Taxonomy, Architectures, Evaluation](https://arxiv.org/abs/2603.07379) — 2026 年 Systematization of Knowledge 论文，从形式化定义到评测框架的深度分析
- [LangGraph 官方文档](https://langchain-ai.github.io/langgraph/) — 构建 Agentic RAG 的首选编排框架
- [LlamaIndex 官方文档](https://docs.llamaindex.ai/) — 检索优先的 RAG 框架，文档解析能力最强
- [RAGFlow](https://github.com/infiniflow/ragflow) — 开箱即用的 RAG 引擎，内置 Agent 能力，GitHub 40k+ stars
- [NVIDIA AI-Q Blueprint](https://build.nvidia.com/nvidia/aiq) — NVIDIA 官方 Agentic RAG 蓝图，结合 Nemotron 推理模型和 NeMo Agent 工具包
- [RAG Architecture Patterns: 8 Patterns in 2026](https://aithinkerlab.com/build-rag-systems-2026-architecture-patterns/) — 从 Naive 到 Agentic 的八种 RAG 架构模式实战指南
