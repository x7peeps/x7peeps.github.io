---
title: "LangChain 与 LangGraph 技术栈：核心抽象、工作流编排与生产实践"
weight: 4
tags: [LangChain, LangGraph, LangSmith, LCEL, Agent, 技术栈]
menu: 
  main: 
    parent: "Agent 架构与框架生态"
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

chain = prompt | llm | parser
result = chain.invoke({"concept": "MapReduce"})
print(result)
```

**SequentialChain** 适用于多步骤的顺序处理：

```python
from langchain.chains import SequentialChain
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini")

# 步骤1：生成大纲
outline_prompt = ChatPromptTemplate.from_template(
    "为以下主题生成一份大纲：{topic}"
)
outline_chain = outline_prompt | llm | StrOutputParser()

# 步骤2：基于大纲展开
expand_prompt = ChatPromptTemplate.from_template(
    "基于以下大纲，撰写一篇简短的文章：\n{outline}"
)
expand_chain = expand_prompt | llm | StrOutputParser()

full_chain = outline_chain | expand_chain
result = full_chain.invoke({"topic": "大语言模型的发展历程"})
```

### 2.4 Agents：动态工具路由

Agent 的核心思想是让 LLM 自主决定调用哪些工具以及调用顺序：

```python
from langchain_openai import ChatOpenAI
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.tools import tool
from langchain_core.prompts import ChatPromptTemplate

@tool
def search_web(query: str) -> str:
    """搜索互联网获取最新信息"""
    return f"搜索结果：关于 '{query}' 的最新信息..."

@tool
def calculate(expression: str) -> str:
    """计算数学表达式"""
    return str(eval(expression))

prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一位助手，可以使用工具来回答问题。"),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}")
])

llm = ChatOpenAI(model="gpt-4o", temperature=0)
tools = [search_web, calculate]

agent = create_tool_calling_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

result = executor.invoke({"input": "2024年诺贝尔物理学奖得主是谁？他获得博士学位时的年龄是多少？"})
```

### 2.5 Memory：对话记忆管理

对话记忆是构建聊天应用的核心组件，LangChain 提供了多种粒度的记忆方案：

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.memory import (
    ConversationBufferMemory,
    ConversationSummaryMemory,
)
from langchain.chains import ConversationChain

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.7)

# 方案1：完整缓冲（适合短对话）
buffer_memory = ConversationBufferMemory(return_messages=True)

# 方案2：摘要压缩（适合长对话）
summary_memory = ConversationSummaryMemory(
    llm=ChatOpenAI(model="gpt-4o-mini"),
    return_messages=True
)

conversation = ConversationChain(
    llm=llm,
    memory=summary_memory,
    prompt=ChatPromptTemplate.from_messages([
        ("system", "你是一位有帮助的助手。"),
        MessagesPlaceholder(variable_name="history"),
        ("user", "{input}")
    ])
)

response = conversation.invoke({"input": "帮我规划一次三天的成都之旅"})
response = conversation.invoke({"input": "第二天的行程能调整一下吗？"})
```

对于需要语义检索的长历史场景，**向量存储记忆** 是更高级的方案：

```python
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma
from langchain.memory import VectorStoreRetrieverMemory

embedding = OpenAIEmbeddings()
vectorstore = Chroma(embedding_function=embedding)
retriever = vectorstore.as_retriever(search_kwargs={"k": 3})

memory = VectorStoreRetrieverMemory(retriever=retriever)
memory.save_context(
    {"input": "我对微服务架构感兴趣"},
    {"output": "微服务架构将应用拆分为小型独立服务，各自拥有独立的数据库和部署管道。"}
)
```

### 2.6 Retrievers：检索策略

Retriever 是 RAG 架构的关键接口，LangChain 提供了多种检索策略：

```python
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma
from langchain.retrievers import MultiQueryRetriever, SelfQueryRetriever
from langchain.retrievers.contextual_compression import ContextualCompressionRetriever
from langchain_cohere import CohereRerank

# 基础向量检索
embedding = OpenAIEmbeddings()
vectorstore = Chroma.from_documents(documents=docs, embedding=embedding)
base_retriever = vectorstore.as_retriever(
    search_type="mmr",          # 最大边际相关性，保证多样性
    search_kwargs={"k": 5, "fetch_k": 20}
)

# MultiQuery：用多个视角改写查询，提升召回率
multi_query_retriever = MultiQueryRetriever.from_llm(
    retriever=base_retriever,
    llm=ChatOpenAI(model="gpt-4o-mini", temperature=0.3)
)

# Contextual Compression + Rerank：压缩上下文 + 重排序
compressor = CohereRerank(model="rerank-v3.5", top_n=3)
compression_retriever = ContextualCompressionRetriever(
    base_compressor=compressor,
    base_retriever=base_retriever
)
```

---

## 三、LCEL：LangChain Expression Language

LCEL（LangChain Expression Language）是 LangChain v0.2+ 的核心编程模型。它通过 **Runnable 协议** 和 **管道操作符（|）** 将组件组合为声明式的数据流。

### 3.1 Runnable 协议

所有 LangChain 核心组件都实现了 `Runnable` 接口，提供统一的调用方式：

```python
from langchain_core.runnables import Runnable

# 每个 Runnable 都支持以下方法：
# .invoke(input)       - 单条输入同步调用
# .batch(inputs)       - 批量调用
# .stream(input)       - 流式输出
# .ainvoke(input)      - 异步调用
# .astream(input)      - 异步流式
# .bind(**kwargs)      - 绑定参数
# .with_config(...)    - 配置运行参数
```

### 3.2 管道操作符与组合

`|` 操作符是 LCEL 的灵魂，将链式调用写成数据流的形式：

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser, JsonOutputParser

prompt = ChatPromptTemplate.from_template(
    "分析以下文本的情感，输出 JSON：\n{text}"
)

chain = prompt | ChatOpenAI(model="gpt-4o-mini") | JsonOutputParser()
result = chain.invoke({"text": "这个框架的设计理念非常优雅"})
```

### 3.3 并行执行与分支

使用 `RunnableParallel`（或直接用 dict 构造）实现并行执行：

```python
from langchain_core.runnables import RunnableParallel, RunnablePassthrough

# 并行调用：同时生成摘要和关键词
parallel_chain = RunnableParallel(
    summary=ChatPromptTemplate.from_template("用一句话总结：{text}")
        | ChatOpenAI(model="gpt-4o-mini")
        | StrOutputParser(),
    keywords=ChatPromptTemplate.from_template("提取3个关键词：{text}")
        | ChatOpenAI(model="gpt-4o-mini")
        | StrOutputParser(),
    sentiment=ChatPromptTemplate.from_template("判断情感（正面/负面/中性）：{text}")
        | ChatOpenAI(model="gpt-4o-mini")
        | StrOutputParser()
)

result = parallel_chain.invoke({
    "text": "LangGraph 的状态图模型为复杂 Agent 工作流提供了清晰的编程范式"
})
print(result)
# {'summary': '...', 'keywords': '...', 'sentiment': '...'}
```

### 3.4 批处理与容错

LCEL 的 `.batch()` 方法支持高效的批量处理，并提供错误处理策略：

```python
# 批量处理
results = chain.batch([
    {"text": "产品体验很好"},
    {"text": "客服态度太差了"},
    {"text": "中规中矩，没啥特别的"}
])

# 带错误处理的批量处理
results = chain.batch(
    [{"text": t} for t in texts],
    config={"max_concurrency": 5}  # 控制并发数
)
```

### 3.5 RunnableLambda 与自定义逻辑

```python
from langchain_core.runnables import RunnableLambda

def preprocess(text: str) -> dict:
    cleaned = text.strip().lower()
    word_count = len(cleaned.split())
    return {"text": cleaned, "word_count": word_count}

chain = (
    RunnableLambda(preprocess)
    | RunnableParallel(
        result=prompt | llm | parser,
        metadata=RunnablePassthrough()
    )
)
```

---

## 四、LangGraph 深度解析

LangGraph 是 LangChain 生态中最具革命性的组件。它将 Agent 工作流建模为**状态图（State Graph）**，解决了传统 Agent 执行不可控、不可观测的问题。

### 4.1 核心概念

LangGraph 的编程模型建立在以下几个核心概念之上：

- **State Graph**：整个工作流的有向图
- **Node**：图中的处理节点，每个节点是一个函数，接收 state 并返回 state 的增量更新
- **Edge**：节点之间的连接，决定执行顺序
- **Conditional Edge**：根据 state 值动态选择下一个节点
- **State**：全局状态对象，在节点之间传递，是唯一的数据通道

### 4.2 State 定义

LangGraph 支持两种 State 定义方式：

```python
from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages
from langgraph.graph import MessagesState

# 方式1：继承内置的 MessagesState（适合聊天场景）
class AgentState(MessagesState):
    pass

# 方式2：自定义 TypedDict（适合复杂业务）
class WorkflowState(TypedDict):
    messages: Annotated[list, add_messages]
    current_step: str
    context: dict
    iteration_count: int
    final_answer: str
```

`Annotated[list, add_messages]` 中的 `add_messages` 是一个 **reducer 函数**，它告诉 LangGraph 如何合并来自不同节点的更新——对于 messages 字段，新消息会被追加而非覆盖。

### 4.3 构建线性工作流

```python
from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini")

def analyze_input(state: WorkflowState):
    """分析用户输入"""
    response = llm.invoke([
        ("system", "分析用户查询的意图，输出 JSON"),
        ("user", state["messages"][-1].content)
    ])
    return {"context": {"intent": response.content}, "current_step": "generate"}

def generate_response(state: WorkflowState):
    """生成回答"""
    response = llm.invoke([
        ("system", "根据分析结果生成回答"),
        ("user", state["messages"][-1].content)
    ])
    return {"final_answer": response.content, "current_step": "done"}

graph = StateGraph(WorkflowState)
graph.add_node("analyze", analyze_input)
graph.add_node("generate", generate_response)

graph.add_edge(START, "analyze")
graph.add_edge("analyze", "generate")
graph.add_edge("generate", END)

app = graph.compile()
result = app.invoke({"messages": [("user", "解释一下 CAP 定理")], "current_step": "", "context": {}, "iteration_count": 0, "final_answer": ""})
```

### 4.4 条件分支

条件边是 LangGraph 实现动态路由的核心机制：

```python
def classify_query(state: WorkflowState):
    """根据查询类型决定处理路径"""
    query = state["messages"][-1].content
    if "代码" in query or "编程" in query:
        return "code_handler"
    elif "分析" in query or "数据" in query:
        return "data_handler"
    else:
        return "general_handler"

def code_handler(state: WorkflowState):
    return {"final_answer": "代码相关回答", "current_step": "done"}

def data_handler(state: WorkflowState):
    return {"final_answer": "数据分析回答", "current_step": "done"}

def general_handler(state: WorkflowState):
    return {"final_answer": "通用回答", "current_step": "done"}

graph = StateGraph(WorkflowState)
graph.add_node("code_handler", code_handler)
graph.add_node("data_handler", data_handler)
graph.add_node("general_handler", general_handler)

graph.add_conditional_edges(START, classify_query, {
    "code_handler": "code_handler",
    "data_handler": "data_handler",
    "general_handler": "general_handler"
})

graph.add_edge("code_handler", END)
graph.add_edge("data_handler", END)
graph.add_edge("general_handler", END)

app = graph.compile()
```

### 4.5 Agent 循环模式

Agent 循环是 LangGraph 最强大的模式——LLM 自主决定是否继续调用工具：

```python
from langgraph.prebuilt import create_react_agent
from langchain_core.tools import tool

@tool
def get_weather(city: str) -> str:
    """查询城市天气"""
    return f"{city}今天晴，25°C"

@tool
def search_docs(query: str) -> str:
    """搜索内部文档"""
    return f"文档搜索结果：{query}"

agent = create_react_agent(
    model=ChatOpenAI(model="gpt-4o"),
    tools=[get_weather, search_docs],
    state_modifier="你是一位专业助手，可以查询天气和搜索文档。"
)

result = agent.invoke({
    "messages": [("user", "北京今天天气怎么样？顺便帮我查一下上周的会议纪要")]
})
```

如果你想完全自定义 Agent 循环：

```python
from langgraph.prebuilt import ToolNode

def should_continue(state: AgentState):
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "tools"
    return END

def call_model(state: AgentState):
    response = llm.bind_tools(tools).invoke(state["messages"])
    return {"messages": [response]}

graph = StateGraph(AgentState)
graph.add_node("agent", call_model)
graph.add_node("tools", ToolNode(tools))

graph.add_edge(START, "agent")
graph.add_conditional_edges("agent", should_continue)
graph.add_edge("tools", "agent")

app = graph.compile()
```

### 4.6 Checkpointing 与持久化

LangGraph 内置了 checkpointing 机制，支持断点续传和状态恢复：

```python
from langgraph.checkpoint.memory import MemorySaver

# 内存存储（开发测试用）
checkpointer = MemorySaver()
app = graph.compile(checkpointer=checkpointer)

# 执行时指定 thread_id
config = {"configurable": {"thread_id": "user-123"}}
result = app.invoke({"messages": [("user", "你好")]}, config)

# 后续调用共享同一 thread 的状态
result = app.invoke({"messages": [("user", "继续之前的话题")]}, config)
```

生产环境推荐使用持久化存储：

```python
# PostgreSQL
from langgraph.checkpoint.postgres import PostgresSaver
checkpointer = PostgresSaver.from_conn_string("postgresql://user:pass@localhost/db")

# SQLite
from langgraph.checkpoint.sqlite import SqliteSaver
checkpointer = SqliteSaver.from_conn_string("checkpoints.db")
```

### 4.7 Human-in-the-Loop

LangGraph 原生支持人在回路中的模式，通过 `interrupt` 实现审批节点：

```python
from langgraph.types import interrupt, Command

def human_review_node(state: WorkflowState):
    """需要人工审批的节点"""
    review = interrupt({
        "question": "请确认以下方案是否可行",
        "proposal": state["final_answer"]
    })
    if review["approved"]:
        return {"current_step": "approved"}
    else:
        return {"current_step": "rejected", "final_answer": review["feedback"]}

# 编译时启用 interrupt
app = graph.compile(checkpointer=checkpointer)

# 执行到 interrupt 处会暂停
config = {"configurable": {"thread_id": "review-001"}}
result = app.invoke({"messages": [("user", "制定一个发布计划")]}, config)

# 人工审核后恢复执行
app.invoke(Command(resume={"approved": True, "feedback": ""}), config)
```

### 4.8 Sub-graphs：模块化设计

大型工作流应拆分为 sub-graphs，每个 sub-graph 封装独立的业务逻辑：

```python
# 子图1：文档处理子流程
doc_workflow = StateGraph(DocState)
doc_workflow.add_node("parse", parse_document)
doc_workflow.add_node("chunk", chunk_document)
doc_workflow.add_node("embed", embed_chunks)
doc_workflow.add_edge(START, "parse")
doc_workflow.add_edge("parse", "chunk")
doc_workflow.add_edge("chunk", "embed")
doc_workflow.add_edge("embed", END)
doc_subgraph = doc_workflow.compile()

# 主图中调用子图
main_graph = StateGraph(MainState)
main_graph.add_node("ingest", doc_subgraph)
main_graph.add_node("query", handle_query)
```

---

## 五、LangSmith 生态

LangSmith 是 LangChain 的商业可观测性平台，提供从开发到生产的全生命周期支持。

### 5.1 Trace 追踪

LangSmith 通过回调机制自动收集所有 LangChain/LangGraph 调用的追踪数据：

```python
import os
os.environ["LANGSMITH_TRACING"] = "true"
os.environ["LANGSMITH_API_KEY"] = "your-api-key"

# 设置项目名
os.environ["LANGSMITH_PROJECT"] = "my-agent-project"

# 之后的所有 LangChain 调用都会自动上报 trace
chain.invoke({"text": "hello"})
```

每条 trace 包含完整的调用树：输入/输出、耗时、Token 消耗、中间步骤。

### 5.2 评估数据集

LangSmith 提供结构化的评估管理：

```python
from langsmith import Client

client = Client()

# 创建评估数据集
dataset = client.create_dataset("qa-evaluation-v1")
client.create_examples(
    dataset_id=dataset.id,
    inputs=[
        {"question": "什么是 RAG？"},
        {"question": "向量数据库的作用是什么？"},
    ],
    outputs=[
        {"answer": "RAG 是检索增强生成..."},
        {"answer": "向量数据库用于存储和检索向量化..."},
    ]
)
```

### 5.3 在线评估

LangSmith 支持对生产流量进行自动化评估：

- **LLM-as-Judge**：使用另一个 LLM 评估输出质量
- **自定义评估器**：编写 Python 函数作为评估指标
- **对比评估**：A/B 测试不同版本的 Prompt 或模型

---

## 六、LangServe 与社区生态

### 6.1 LangServe 部署

LangServe 将 LangChain 链和 Agent 一键部署为 REST API：

```python
from fastapi import FastAPI
from langserve import add_routes

app = FastAPI(title="My LangChain App")

add_routes(
    app,
    chain,
    path="/analyze",
    enable_feedback_endpoint=True,
    enable_public_trace_link_endpoint=True
)

# 启动：uvicorn main:app --host 0.0.0.0 --port 8000
# 自动获得：
# POST /analyze/invoke     - 调用链
# POST /analyze/batch      - 批量调用
# POST /analyze/stream     - 流式调用
# GET  /analyze/input_schema - 输入 Schema
# GET  /analyze/output_schema - 输出 Schema
```

### 6.2 社区集成

`langchain-community` 包含 160+ 集成，覆盖：

- **LLM Providers**：OpenAI, Anthropic, Google, Mistral, Ollama, vLLM, etc.
- **向量数据库**：Pinecone, Weaviate, Qdrant, Milvus, Chroma, pgvector, etc.
- **文档加载器**：PDF, HTML, Notion, Confluence, S3, etc.
- **工具**：Tavily, Wikipedia, Arxiv, Shell, etc.

建议只安装需要的集成包，避免依赖膨胀：

```bash
# 推荐方式：按需安装
pip install langchain-openai langchain-chroma langchain-community
# 而非
pip install langchain[all]  # 不推荐，依赖过多
```

---

## 七、生产环境踩坑指南

### 7.1 版本兼容性

LangChain 在 v0.1 → v0.2 → v0.3 之间经历了多次 breaking changes：

```bash
# v0.1 → v0.2 的主要变更
# - langchain-core 独立发布
# - LCEL 成为默认编程模型
# - 旧版 Chain 类标记为 deprecated

# v0.2 → v0.3 的主要变更
# - 移除 langchain 内置的 LLM/ChatModel，全部迁移到 partner 包
# - langchain-community 大量集成被拆分为独立包
```

**推荐的依赖管理策略**：

```toml
# pyproject.toml 中锁定主版本
[tool.poetry.dependencies]
langchain = ">=0.3,<0.4"
langchain-core = ">=0.3,<0.4"
langchain-openai = ">=0.3,<0.4"
langgraph = ">=0.2,<0.3"
```

### 7.2 性能瓶颈与内存管理

常见性能问题及解决方案：

```python
# 问题1：大量文档处理时内存溢出
# 解决：使用 lazy loading + batch processing
from langchain_community.document_loaders import DirectoryLoader
loader = DirectoryLoader("./docs", glob="**/*.md", show_progress=True)
# 使用 .load() 而非一次性加载所有文档

# 问题2：向量检索慢
# 解决：调整 search 参数 + 使用异步
retriever = vectorstore.as_retriever(
    search_type="mmr",
    search_kwargs={"k": 3, "fetch_k": 10}  # 减少 fetch_k
)

# 问题3：Agent 循环过多导致 Token 浪费
# 解决：设置最大迭代次数
from langgraph.prebuilt import create_react_agent
agent = create_react_agent(
    model=llm,
    tools=tools,
    max_iterations=10,  # 限制循环次数
    early_stopping_method="force"
)
```

### 7.3 调试策略

```python
# 1. 启用详细日志
import langchain
langchain.debug = True

# 2. 使用 LangSmith 追踪（推荐）
os.environ["LANGSMITH_TRACING"] = "true"

# 3. 使用 get_graph() 可视化工作流
from langgraph.graph import StateGraph
graph = StateGraph(WorkflowState)
# ... 添加节点和边 ...
app = graph.compile()

# 导出 Mermaid 图
print(app.get_graph().draw_mermaid())

# 4. 打印中间状态
app = graph.compile()
# 使用 stream 观察每一步的 state 变化
for step in app.stream({"messages": [("user", "test")]}):
    print(step)
```

### 7.4 测试策略

```python
import pytest
from unittest.mock import patch, MagicMock
from langchain_core.messages import AIMessage

# 单元测试：mock LLM 调用
def test_analyze_node():
    mock_response = AIMessage(content="intent: technical_question")
    with patch("langchain_openai.ChatOpenAI.invoke", return_value=mock_response):
        state = {
            "messages": [("user", "解释一下微服务")],
            "context": {},
            "current_step": ""
        }
        result = analyze_input(state)
        assert result["current_step"] == "generate"

# 集成测试：测试完整的 graph 执行
def test_full_workflow():
    app = build_graph()
    result = app.invoke({
        "messages": [("user", "测试输入")],
        "current_step": "",
        "context": {},
        "iteration_count": 0,
        "final_answer": ""
    })
    assert result["final_answer"] != ""
    assert result["current_step"] == "done"

# LangSmith 自动化评估
from langsmith.evaluation import evaluate

def qa_quality_evaluator(run, example):
    output = run.outputs.get("final_answer", "")
    expected = example.outputs.get("answer", "")
    score = 1.0 if expected[:10] in output else 0.0
    return {"key": "quality", "score": score}

evaluate(
    target_fn=my_app.invoke,
    data="qa-evaluation-v1",
    evaluators=[qa_quality_evaluator]
)
```

### 7.5 版本迁移模式

从旧版 Chain 迁移到 LCEL 的典型模式：

```python
# 旧版方式（v0.1 风格）
from langchain.chains import LLMChain
from langchain.prompts import PromptTemplate

prompt = PromptTemplate(template="回答：{question}", input_variables=["question"])
chain = LLMChain(llm=llm, prompt=prompt)
result = chain.run(question="hello")

# 新版方式（LCEL）
from langchain_core.prompts import ChatPromptTemplate
prompt = ChatPromptTemplate.from_template("回答：{question}")
chain = prompt | llm | StrOutputParser()
result = chain.invoke({"question": "hello"})
```

---

## 八、LangChain 生态全景图

```
                         ┌──────────────────────────────────────┐
                         │         LangChain 生态全景           │
                         └──────────────────────────────────────┘

    ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐
    │  LangSmith  │    │  LangServe  │    │ LangChain Hub   │
    │  可观测性    │    │  REST 部署   │    │ Prompt/Chain 仓库│
    └──────┬──────┘    └──────┬──────┘    └────────┬────────┘
           │                  │                    │
           └──────────────────┼────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │    langchain-core  │
                    │   Runnable 协议    │
                    │   LCEL 管道语言    │
                    └─────────┬─────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
    ┌─────────┴──────┐ ┌─────┴──────┐ ┌──────┴────────┐
    │   langchain    │ │  LangGraph  │ │ langchain-     │
    │   Chain/Agent  │ │  状态图编排  │ │ community      │
    │   Retriever    │ │  Checkpoint │ │ 160+ 集成      │
    └─────────┬──────┘ └─────┬──────┘ └──────┬────────┘
              │               │               │
              └───────────────┼───────────────┘
                              │
            ┌─────────────────┼──────────────────┐
            │                 │                  │
     ┌──────┴──────┐  ┌──────┴──────┐  ┌───────┴───────┐
     │ LLM Provider│  │ 向量数据库   │  │  外部工具/API  │
     │ OpenAI      │  │ Chroma      │  │  Tavily       │
     │ Anthropic   │  │ Pinecone    │  │  Wikipedia    │
     │ Google      │  │ Weaviate    │  │  Arxiv        │
     │ Ollama      │  │ Qdrant      │  │  Shell        │
     └─────────────┘  └─────────────┘  └───────────────┘
```

---

## 九、延伸阅读

### 官方文档

- [LangChain Python 文档](https://python.langchain.com/) — 最权威的 API 参考
- [LangGraph 文档](https://langchain-ai.github.io/langgraph/) — 状态图编排的完整指南
- [LangSmith 文档](https://docs.smith.langchain.com/) — 可观测性与评估平台
- [LCEL 指南](https://python.langchain.com/docs/how_to/lcel/) — 深入理解 Runnable 协议

### GitHub 仓库

- [langchain-ai/langchain](https://github.com/langchain-ai/langchain) — 核心框架
- [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) — 工作流编排
- [langchain-ai/langsmith-sdk](https://github.com/langchain-ai/langsmith-sdk) — LangSmith SDK

### 社区资源

- [LangChain Blog](https://blog.langchain.dev/) — 最新动态与最佳实践
- [LangChain Discord](https://discord.gg/langchain) — 活跃的开发者社区
- [Awesome LangChain](https://github.com/kyegomez/awesome-langchain) — 社区精选资源集合

### 推荐学习路径

1. 先掌握 **LCEL 和 Runnable 协议**——这是所有 LangChain 组件的基础
2. 根据场景选择 **Chain**（简单流程）或 **LangGraph**（复杂/循环流程）
3. 接入 **LangSmith** 实现可观测性，这是生产化的关键一步
4. 关注版本更新日志，LangChain 生态仍在快速演进
