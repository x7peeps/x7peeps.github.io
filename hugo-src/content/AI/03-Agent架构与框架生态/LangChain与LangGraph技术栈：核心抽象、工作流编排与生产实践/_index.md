---
title: "LangChain 与 LangGraph 技术栈：核心抽象、工作流编排与生产实践"
weight: 4
tags: [LangChain, LangGraph, LangSmith, LCEL, Agent, 技术栈]
menu: 
  main: 
    parent: "AIagent"
---

## 一、LangChain 生态全景

LangChain 是当前 LLM 应用开发领域最成熟、最庞大的开源框架生态。理解它在整体技术栈中的定位，是选择技术方案的前提。

### 1.1 LangChain 提供了什么

LangChain 生态并非单一库，而是一组协同工作的组件：

| 组件 | 作用 | 你需要自己做的 |
|------|------|----------------|
| **langchain-core** | 基础抽象层（Runnable 协议、LCEL） | 定义业务逻辑 |
| **langchain** | 通用链、检索策略、Agent 范式 | 挑选适合场景的模式 |
| **langchain-community** | 第三方集成（向量数据库、LLM Provider） | 配置凭证和参数 |
| **LangGraph** | 基于图的 Agent 工作流编排 | 设计节点和边的拓扑 |
| **LangSmith** | 追踪、评估、监控平台 | 构建评估数据集 |
| **LangServe** | 将链/Agent 部署为 REST API | 编写部署和运维脚本 |

### 1.2 LLM 应用技术栈分层

```
┌─────────────────────────────────────────────────┐
│              业务应用层 (Your App)               │
├─────────────────────────────────────────────────┤
│         LangGraph (工作流编排 / Agent Loop)      │
├─────────────────────────────────────────────────┤
│    LangChain (Chain / Retrieval / Tool 范式)    │
├─────────────────────────────────────────────────┤
│      langchain-core (Runnable / LCEL 协议)      │
├─────────────────────────────────────────────────┤
│  LangServe (部署)  │  LangSmith (可观测性)      │
├─────────────────────────────────────────────────┤
│     LLM Provider / 向量数据库 / 工具 API        │
└─────────────────────────────────────────────────┘
```

### 1.3 什么需要自己构建

尽管 LangChain 提供了丰富的抽象，但在生产环境中仍有大量工作需要自行完成：

- **业务 Prompt 工程**：LangChain 提供模板，但 Prompt 的调优和版本管理需要自己的流程
- **评估体系**：LangSmith 提供评估框架，但评估数据集的构建、Ground Truth 的维护是业务侧的工作
- **数据管道**：文档解析、分块策略、索引更新等 ETL 工作需自行设计
- **安全防护**：输入过滤、输出审查、权限控制等安全层不包含在框架内
- **运维监控**：LangSmith 提供追踪，但告警规则、SLA 定义、成本控制需要额外的工程投入

---

## 二、LangChain 核心抽象层

LangChain 的价值在于其统一的抽象层。掌握这些抽象是高效使用框架的基础。

### 2.1 Models：Chat Models 与 LLMs

LangChain 对模型的抽象分为两类：

- **LLM**：纯文本输入/输出，接收字符串返回字符串，适用于早期 completion API
- **Chat Model**：基于消息列表的输入/输出，支持 system / user / assistant / tool 多角色消息

在实践中，**Chat Model 已成为主流**，几乎所有新模型（GPT-4、Claude、Gemini）都以 Chat 接口呈现。

```python
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

llm = ChatOpenAI(model="gpt-4o", temperature=0)

messages = [
    SystemMessage(content="你是一位资深的 Python 架构师"),
    HumanMessage(content="请解释 Liskov 替换原则，并给出 Python 示例")
]

response = llm.invoke(messages)
print(response.content)
```

**流式输出**是生产环境的关键能力，LangChain 对所有 Chat Model 统一了流式接口：

```python
for chunk in llm.stream(messages):
    print(chunk.content, end="", flush=True)
```

### 2.2 Prompts：模板化 Prompt 管理

LangChain 提供了多种 Prompt 模板，将 Prompt 从硬编码字符串提升为可复用、可组合的组件：

```python
from langchain_core.prompts import ChatPromptTemplate, FewShotPromptTemplate
from langchain_core.prompts import PromptTemplate

# 基础模板
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一位{role}，擅长{domain}领域"),
    ("user", "{question}")
])

formatted = prompt.invoke({
    "role": "技术顾问",
    "domain": "分布式系统",
    "question": "如何设计一个高可用的消息队列？"
})
```

**Few-Shot 模板**在分类和格式化任务中尤为有效：

```python
from langchain_core.prompts import FewShotChatMessagePromptTemplate

examples = [
    {"input": "这个产品太棒了", "output": "positive"},
    {"input": "完全不推荐", "output": "negative"},
    {"input": "还行吧", "output": "neutral"},
]

example_prompt = ChatPromptTemplate.from_messages([
    ("user", "{input}"),
    ("assistant", "{output}")
])

few_shot_prompt = FewShotChatMessagePromptTemplate(
    example_prompt=example_prompt,
    examples=examples
)

final_prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一位情感分析专家。请将用户评论分类为 positive/negative/neutral。"),
    few_shot_prompt,
    ("user", "{input}")
])
```

### 2.3 Chains：链式调用模式

Chain 是 LangChain 最早也最核心的范式——将多个组件串联成可复用的处理管道：

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

prompt = ChatPromptTemplate.from_template(
    "请用一段话解释以下概念：{concept}"
)
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.7)
parser = StrOutputParser()

chain = prompt | llm | parser          # LCEL：用 | 把组件编成管道
result = chain.invoke({"concept": "幂等性"})
```

**LCEL（LangChain Expression Language）** 是 v0.1 之后 LangChain 的骨骼：任何 Runnable 自动获得 `invoke / batch / stream / ainvoke` 四种执行形态与统一的重试、异步、流式能力。链式组合（`|`）、并行（`RunnableParallel`）、分支（`RunnableBranch`）、回退（`with_fallbacks`）都是纯函数式拼装，不需要回调黑魔法。

### 2.4 Retrieval：RAG 全家桶

LangChain 把 RAG 拆成可替换零件：DocumentLoader（150+ 数据源）→ TextSplitter（Recursive/Semantic）→ VectorStore（FAISS/Chroma/pgvector/Pinecone）→ Retriever（向量/混合/MultiQuery/ContextualCompression）→ 组装为检索链：

```python
from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain

qa_chain = create_stuff_documents_chain(llm, RAG_PROMPT)  # 检索文档注入 {context}
pipeline = create_retrieval_chain(
    vectorstore.as_retriever(search_kwargs={"k": 4}), qa_chain)
```

生产常用升级：`MultiQueryRetriever`（LLM 生成查询变体提召回）、`ContextualCompressionRetriever`（重排后压掉无关片段）、retriever 直接作为节点挂进 LangGraph。

### 2.5 Agents：从 AgentExecutor 到 LangGraph

旧版 `AgentExecutor`（ReAct 循环的黑盒）已被官方**明确降级**：不可控、难调试、状态不透明。新范式是**显式图**——这就是两个库的分工线：LangChain 提供零件（模型/工具/检索/prompt），LangGraph 负责控制流。

---

## 三、LangGraph：有状态的工作流编排

### 3.1 核心抽象

| 概念 | 含义 | 类比 |
| :--- | :--- | :--- |
| **State** | TypedDict/Pydantic 共享状态，节点返回增量、reducer 决定合并 | 全局变量 + 规约 |
| **Node** | 接收 state 返回 state 的函数（可含 LLM、工具、纯逻辑） | 函数 |
| **Edge** | 固定转移 / **条件边**（按 state 路由） | 控制流 |
| **Checkpointer** | 每步持久化 state 快照 | 数据库 + 时间旅行 |

### 3.2 最小 Agent 循环

```python
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.prebuilt import ToolNode

def call_model(state: MessagesState):
    return {"messages": [llm_with_tools.invoke(state["messages"])]}

def should_continue(state: MessagesState):
    last = state["messages"][-1]
    return "tools" if last.tool_calls else END

graph = StateGraph(MessagesState)
graph.add_node("agent", call_model)
graph.add_node("tools", ToolNode(tools))
graph.add_edge(START, "agent")
graph.add_conditional_edges("agent", should_continue,
                            {"tools": "tools", END: END})
graph.add_edge("tools", "agent")

app = graph.compile(checkpointer=SqliteSaver.from_conn_string("ckpt.db"))
```

这段拓扑就是 Function Calling 的 ReAct 循环，但每一步都**可见、可断点、可重放**。

### 3.3 LangGraph 的生产价值

- **持久化**：长任务崩溃后从 checkpoint 恢复，不用重跑
- **Human-in-the-loop**：`interrupt()` 把图停在敏感节点，等外部批准后 resume
- **时间旅行**：回滚到任意历史 state 重执行——调试 Agent 的神器
- **多 Agent**：子图即子 Agent，supervisor 模式用条件边路由

---

## 四、LangSmith 与可观测性

`LANGCHAIN_TRACING_V2=true` 一行开启全链路追踪：每次 chain/graph 运行的节点输入输出、LLM token、延迟、成本自动上报。评估闭环：**数据集 → 离线实验 → 回归对比 → 线上监控告警**，再加 LLM-as-judge 评正确性/引用忠实度。不想绑定平台的团队可用 LangFuse（开源）平替，概念一一对应。

---

## 五、生产实践建议与常见误区

1. **能用裸 API 就别上重框架**——单轮 prompt + 工具循环，百行代码比隐式黑盒可控；当需要多分支状态机、持久化、人审时，LangGraph 的价值才压过引入成本
2. **版本纪律**：LangChain 迭代快，锁 minor 版本，升级对照 migration 指南，弃用路线图画清楚
3. **先画图再写代码**：节点/边/状态字段评审通过再动手，返工率减半
4. **工具与检索层保持框架无关**（纯函数 + pydantic）——将来从 LangGraph 迁到自研只换控制流
5. **新项目别再以 AgentExecutor 为核心**；官方方向已明确是 LangGraph

---

## 六、总结

LangChain 生态的定位在 2025 年后已经清晰：**langchain-core 的 Runnable 抽象统一组件接口，LCEL 提供函数式拼装，LangGraph 接管控制流与状态，LangSmith 闭环观测与评估**。它的工程红利不是"帮你写 Agent 代码"，而是把 LLM 应用中反复出现的横切问题——流式、重试、批量、trace、checkpoint——一次解决。选型务实：小场景裸 API，中等 RAG/工具用零件库，复杂状态机与多 Agent 直接 LangGraph。框架不替你设计产品，但它决定你调试时的痛苦程度。

(注：文中代码基于 langchain / langgraph 公共 API 的教学示意，接口细节随版本演进，以官方文档为准。)

本文面向授权安全研究与防御建设，未经授权对任何系统实施文中技术属违法行为。
