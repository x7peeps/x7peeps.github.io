---
title: "Multi-Agent 框架生态：AutoGen、CrewAI、Dify 对比与选型"
weight: 5
tags: [Multi-Agent, AutoGen, CrewAI, Dify, 框架选型]
menu: 
  main: 
    parent: "Agent 架构与框架生态"
---

## 一、多智能体协作设计模式

单个 Agent 在面对复杂任务时存在明显的能力天花板：上下文窗口有限、专业视角单一、无法并行处理异构子任务。Multi-Agent 系统通过让多个专长化的 Agent 协作，突破了这些限制。但"多个 Agent 一起工作"远非把它们丢进一个聊天室那么简单——不同的协作模式决定了系统的可控性、效率和故障边界。

### 1.1 四种核心协作模式

```
┌──────────────────────────────────────────────────────────────────┐
│                   Multi-Agent 协作模式谱系                       │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   分工协作    │  │   协商谈判    │  │   竞争淘汰    │           │
│  │ Division of  │  │ Negotiation  │  │ Competition  │           │
│  │   Labor      │  │              │  │              │           │
│  │              │  │  A ←→ B      │  │  A ─┐        │           │
│  │ A → Sub1     │  │      ↕       │  │  B ─┼→ Best  │           │
│  │ B → Sub2     │  │  C ←→ D      │  │  C ─┘        │           │
│  │ C → Sub3     │  │              │  │              │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    层级委派                               │   │
│  │                  Hierarchical                             │   │
│  │                  ┌───────┐                                │   │
│  │                  │ Boss  │                                │   │
│  │                  └───┬───┘                                │   │
│  │              ┌───────┼───────┐                            │   │
│  │            ┌───┐   ┌───┐   ┌───┐                         │   │
│  │            │ A │   │ B │   │ C │                         │   │
│  │            └───┘   └───┘   └───┘                         │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

**分工协作（Division of Labor）**：将任务拆分为互不重叠的子任务，每个 Agent 负责一个专长领域。这是最常见的模式——一个 Agent 写代码，另一个做代码审查，第三个运行测试。适用于子任务边界清晰、依赖关系可预知的场景，如软件开发流水线、文档生成管道。

**协商谈判（Negotiation）**：多个 Agent 围绕同一个问题各自给出方案，通过多轮对话达成共识。典型应用是多角色辩论——一个 Agent 扮演乐观分析师，另一个扮演风险审计师，通过辩论产出更稳健的决策。适用于需要多视角审视、降低单一偏见的场景。

**竞争淘汰（Competition）**：多个 Agent 独立完成同一任务，由裁判 Agent 或评分机制选出最优解。类似"投标"机制，适用于对结果质量要求极高、可以承受多次执行成本的场景，如代码生成中的 pass@k 策略。

**层级委派（Hierarchical）**：一个"管理者"Agent 负责任务分解、分配和监督，"执行者"Agent 各司其职。这是最接近人类组织结构的模式，也是 AutoGen 和 CrewAI 最常用的默认模式。适用于任务复杂度高、需要全局协调的场景。

### 1.2 模式选择的经验法则

| 场景特征 | 推荐模式 | 原因 |
|---------|---------|------|
| 子任务可并行且独立 | 分工协作 | 最大化并行度，减少等待 |
| 需要多角度审视决策 | 协商谈判 | 通过对抗性讨论降低偏见 |
| 对结果质量要求极高 | 竞争淘汰 | 多次尝试取最优，降低随机性 |
| 任务复杂且有层次结构 | 层级委派 | 管理者统筹全局，避免混乱 |
| 流程固定、步骤明确 | 顺序流水线 | 简单可控，调试方便 |

在实际工程中，**这些模式经常混合使用**。例如一个 Multi-Agent 系统内部可能在顶层使用层级委派，在某个子任务内部使用协商谈判。框架的选择决定了你实现这些模式的难易程度。

---

## 二、AutoGen 深度解析

AutoGen（现演进为 AG2）是微软研究院推出的 Multi-Agent 对话框架，其核心理念是**通过 Agent 间的对话来协作完成任务**。AutoGen 是最早系统化解决 Multi-Agent 编排问题的框架之一，也是目前社区规模最大、生态最丰富的选择。

### 2.1 架构核心

AutoGen 的架构围绕三个核心抽象构建：

```
┌─────────────────────────────────────────────────────────┐
│                    AutoGen 架构                          │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │              ConversableAgent                     │  │
│  │  ┌─────────────┐  ┌──────────────┐               │  │
│  │  │  LLM Config │  │  Message     │               │  │
│  │  │  (model,    │  │  History     │               │  │
│  │  │   api_key)  │  │  (messages)  │               │  │
│  │  └─────────────┘  └──────────────┘               │  │
│  │  ┌─────────────┐  ┌──────────────┐               │  │
│  │  │  Code       │  │  Human       │               │  │
│  │  │  Execution  │  │  Input       │               │  │
│  │  │  (sandbox)  │  │  Mode        │               │  │
│  │  └─────────────┘  └──────────────┘               │  │
│  └───────────────────────────────────────────────────┘  │
│                         │                               │
│            ┌────────────┼────────────┐                  │
│            ▼            ▼            ▼                  │
│     ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│     │ Assistant│ │  User    │ │ GroupChat│            │
│     │  Agent   │ │  Proxy   │ │ Manager  │            │
│     └──────────┘ └──────────┘ └──────────┘            │
└─────────────────────────────────────────────────────────┘
```

- **ConversableAgent**：所有 Agent 的基类，封装了 LLM 调用、消息处理、代码执行等核心能力
- **GroupChat**：管理多 Agent 对话的消息路由器，决定下一个发言者
- **GroupChatManager**：GroupChat 的运行时实例，驱动对话循环

### 2.2 代码执行与沙箱

AutoGen 的一大亮点是其内置的**代码执行能力**。Agent 可以在对话中生成 Python 代码，由框架在 Docker 容器或本地沙箱中执行，并将执行结果反馈到对话中。这使得 Agent 不仅能"说"还能"做"。

```python
from autogen import AssistantAgent, UserProxyAgent, config_list_from_json

llm_config = {
    "config_list": config_list_from_json("OAI_CONFIG_LIST"),
    "temperature": 0,
}

assistant = AssistantAgent(
    name="coder",
    llm_config=llm_config,
    system_message="你是一位擅长 Python 编程的助手。请用代码解决问题。"
)

user_proxy = UserProxyAgent(
    name="executor",
    human_input_mode="NEVER",
    max_consecutive_auto_reply=10,
    is_termination_msg=lambda x: x.get("content", "").rstrip().endswith("TERMINATE"),
    code_execution_config={
        "work_dir": "coding",
        "use_docker": True,
    },
)

user_proxy.initiate_chat(
    assistant,
    message="编写一个 Python 脚本，读取 data.csv 并计算每个类别的平均值，然后生成柱状图保存为 result.png"
)
```

### 2.3 GroupChat 与会话模式

AutoGen 支持灵活的会话拓扑：

- **双人对话（Two-Agent Chat）**：最简单的模式，两个 Agent 直接对话
- **群聊（GroupChat）**：多个 Agent 参与，由 GroupChatManager 决定发言顺序
- **嵌套对话（Nested Chat）**：一个 Agent 在处理特定类型消息时，自动启动与另一个 Agent 的子对话

### 2.4 工具注册

AutoGen 支持通过装饰器或函数注册工具，让 Agent 能够调用外部 API：

```python
from autogen import register_function

def search_web(query: str) -> str:
    """搜索互联网获取最新信息"""
    import requests
    response = requests.get(f"https://api.search.example/v1?q={query}")
    return response.json()["results"][:3]

def calculate(expression: str) -> str:
    """安全地执行数学计算"""
    import ast
    try:
        tree = ast.parse(expression, mode='eval')
        return str(eval(compile(tree, '<calc>', 'eval')))
    except Exception as e:
        return f"计算错误: {e}"

register_function(
    search_web,
    caller=assistant,
    executor=user_proxy,
    description="搜索互联网获取最新信息"
)

register_function(
    calculate,
    caller=assistant,
    executor=user_proxy,
    description="执行数学计算表达式"
)
```

### 2.5 实战：安全分析师 + 报告撰写者双人组

下面展示一个典型的双 Agent 协作场景：安全分析师对目标系统进行漏洞扫描，报告撰写者将分析结果整理为结构化的安全报告。

```python
from autogen import AssistantAgent, UserProxyAgent, GroupChat, GroupChatManager

llm_config = {
    "config_list": [{"model": "gpt-4o", "api_key": "your-api-key"}],
    "temperature": 0,
}

security_analyst = AssistantAgent(
    name="security_analyst",
    llm_config=llm_config,
    system_message="""你是一位资深网络安全分析师。你的职责是：
1. 分析目标系统的安全架构
2. 识别潜在的攻击面和漏洞风险
3. 评估风险等级（Critical/High/Medium/Low）
4. 提出具体的技术缓解措施

输出格式要求：
- 使用结构化的 Markdown
- 每个发现包含：漏洞描述、影响范围、风险等级、修复建议
- 最后给出总体安全评估

当你完成全部分析后，在最后一行输出 TERMINATE。"""
)

report_writer = AssistantAgent(
    name="report_writer",
    llm_config=llm_config,
    system_message="""你是一位专业的安全报告撰写者。你的职责是：
1. 将安全分析师提供的技术发现整理为可读性强的安全报告
2. 确保报告包含：执行摘要、详细发现、风险矩阵、修复优先级
3. 报告面向技术管理层，需要兼顾专业性和可读性
4. 使用表格和分层结构呈现信息

输出最终报告后，在最后一行输出 TERMINATE。"""
)

user_proxy = UserProxyAgent(
    name="user",
    human_input_mode="NEVER",
    max_consecutive_auto_reply=1,
    is_termination_msg=lambda x: x.get("content", "").rstrip().endswith("TERMINATE"),
    code_execution_config=False,
)

group_chat = GroupChat(
    agents=[user_proxy, security_analyst, report_writer],
    messages=[],
    max_round=6,
    speaker_selection_method="auto",
)

manager = GroupChatManager(groupchat=group_chat, llm_config=llm_config)

user_proxy.initiate_chat(
    manager,
    message="""请对以下 Web 应用进行安全评估：
- 目标：电商后台管理系统（基于 Django REST Framework）
- 认证方式：JWT Token
- 主要功能：用户管理、订单管理、支付集成（Stripe）
- 部署环境：AWS ECS + RDS PostgreSQL

请先由安全分析师进行分析，然后由报告撰写者整理报告。"""
)
```

这个例子展示了 AutoGen 最典型的协作范式：**对话驱动的任务流转**。安全分析师产出的技术发现作为上下文自然传递给报告撰写者，两者通过 GroupChat 的消息路由机制串联起来。AutoGen 的优势在于这种**"消息即协作"**的设计让系统行为高度可观测——每一条对话记录都是调试线索。

但这也暴露了 AutoGen 的局限：当 Agent 数量超过 5 个时，GroupChat 的消息流会变得难以控制，`speaker_selection_method` 的选择对系统行为有决定性影响，需要大量实验调优。

---

## 三、CrewAI 解析

CrewAI 是一个以"角色扮演"为核心隐喻的 Multi-Agent 框架。如果说 AutoGen 的关键词是"对话"，那么 CrewAI 的关键词就是"角色"——它要求开发者为每个 Agent 定义明确的角色（Role）、目标（Goal）和背景故事（Backstory），让 Agent 在角色驱动下完成任务。

### 3.1 核心概念

CrewAI 的设计哲学建立在三个核心概念之上：

- **Agent**：拥有特定角色、目标和工具集的智能体
- **Task**：分配给 Agent 的具体任务，包含描述、预期输出和上下文依赖
- **Crew**：Agent 和 Task 的编排容器，定义执行流程和协作规则

### 3.2 角色定义与任务编排

```python
from crewai import Agent, Task, Crew, Process
from crewai_tools import SerperDevTool, ScrapeWebsiteTool

search_tool = SerperDevTool()
scrape_tool = ScrapeWebsiteTool()

researcher = Agent(
    role="资深技术研究员",
    goal="深入调研给定技术主题，收集最新资料和行业数据",
    backstory="""你是一位在 AI 领域有 10 年经验的技术研究员。
    你擅长从海量信息中提取关键洞察，用数据说话。
    你的研究报告以逻辑严谨、引用准确著称。""",
    tools=[search_tool, scrape_tool],
    llm="gpt-4o",
    verbose=True,
)

writer = Agent(
    role="技术内容专家",
    goal="将技术调研结果转化为高质量的中文技术文章",
    backstory="""你是一位资深技术写手，擅长将复杂的技术概念
    用通俗易懂的语言表达。你的文章兼顾深度和可读性。""",
    tools=[],
    llm="gpt-4o",
    verbose=True,
)

reviewer = Agent(
    role="技术审校专家",
    goal="审查文章的技术准确性和逻辑完整性",
    backstory="""你是一位严格的技术审校编辑，对事实错误
    零容忍，擅长发现逻辑漏洞和表述不清的地方。""",
    tools=[],
    llm="gpt-4o",
    verbose=True,
)
```

### 3.3 任务定义与流程控制

CrewAI 支持三种执行流程：

```python
research_task = Task(
    description="""调研 Multi-Agent 系统的最新发展趋势，
    包括主流框架（AutoGen、CrewAI、Dify、LangGraph）的
    技术特点和生态现状。输出结构化的调研报告。""",
    expected_output="包含技术对比表格和趋势分析的调研报告",
    agent=researcher,
)

writing_task = Task(
    description="""基于调研报告，撰写一篇 3000 字的中文技术文章。
    文章需要包含代码示例、架构图和选型建议。""",
    expected_output="完整的 Markdown 格式技术文章",
    agent=writer,
    context=[research_task],
)

review_task = Task(
    description="""审查技术文章，检查：
    1. 技术事实是否准确
    2. 代码示例是否可运行
    3. 逻辑是否连贯
    4. 是否有遗漏的重要内容""",
    expected_output="包含修改意见的审校报告",
    agent=reviewer,
    context=[writing_task],
)

crew = Crew(
    agents=[researcher, writer, reviewer],
    tasks=[research_task, writing_task, review_task],
    process=Process.sequential,
    verbose=True,
)

result = crew.kickoff()
print(result)
```

### 3.4 执行模式与记忆共享

CrewAI 的 `Process` 参数控制任务执行方式：

- **`Process.sequential`**：任务按顺序依次执行，前一个任务的输出自动成为后一个任务的上下文
- **`Process.hierarchical`**：引入一个 Manager Agent，动态分配和监督任务执行

CrewAI 还内置了**记忆系统**，支持短期记忆（当前对话）、长期记忆（跨会话持久化）和实体记忆（提取关键实体信息），Agent 之间可以共享记忆上下文：

```python
from crewai import Crew

crew = Crew(
    agents=[researcher, writer, reviewer],
    tasks=[research_task, writing_task, review_task],
    process=Process.hierarchical,
    memory=True,
    embedder={
        "provider": "openai",
        "config": {"model": "text-embedding-3-small"}
    },
    verbose=True,
)
```

### 3.5 任务委托（Delegation）

CrewAI 的 Agent 支持 `allow_delegation=True`，当一个 Agent 遇到超出自身能力的任务时，可以自动将子任务委派给 Crew 中更合适的 Agent。这个机制让系统具备了一定的自组织能力：

```python
senior_agent = Agent(
    role="全栈工程师",
    goal="独立完成全栈开发任务",
    backstory="你是一位经验丰富的全栈工程师，但某些深度领域问题你会寻求专家帮助。",
    allow_delegation=True,
    llm="gpt-4o",
)
```

CrewAI 的优势在于其**高度的可读性和直觉性**——代码本身就是一种接近自然语言的任务描述。这使得非技术背景的产品经理也能理解 Agent 系统的工作逻辑。代价是灵活性相对受限，复杂的条件分支和动态路由需要更多自定义工作。

---

## 四、Dify 平台

与 AutoGen 和 CrewAI 的纯代码路径不同，Dify 提供了一个**可视化、低代码的 Multi-Agent 编排平台**。它将 Agent 构建从"写代码"转变为"拖拽配置"，同时保持了足够的灵活性支持生产部署。

### 4.1 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    Dify 平台架构                              │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 可视化编排层                           │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │   │
│  │  │ Workflow │  │ Agent    │  │ Chatflow         │   │   │
│  │  │ Builder  │  │ Builder  │  │ Builder          │   │   │
│  │  └──────────┘  └──────────┘  └──────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 运行时引擎                             │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │   │
│  │  │ 节点执行  │  │ 变量传递  │  │ 条件路由         │   │   │
│  │  │ 引擎     │  │ 管线     │  │ 引擎             │   │   │
│  │  └──────────┘  └──────────┘  └──────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 能力层                                │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │   │
│  │  │ 知识库   │  │ 工具集   │  │ 模型管理          │   │   │
│  │  │ RAG 引擎 │  │ API/     │  │ 多 Provider      │   │   │
│  │  │          │  │ 插件     │  │ 统一接入          │   │   │
│  │  └──────────┘  └──────────┘  └──────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 基础设施层                             │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │   │
│  │  │ PostgreSQL│  │ Redis   │  │ 向量数据库        │   │   │
│  │  │          │  │         │  │ (Weaviate/Qdrant)│   │   │
│  │  └──────────┘  └──────────┘  └──────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Workflow 编排

Dify 的 Workflow 是其最强大的能力之一。开发者可以通过可视化画布构建复杂的 Agent 工作流，支持以下节点类型：

- **LLM 节点**：调用大语言模型，支持 Prompt 模板和变量注入
- **知识检索节点**：从知识库中检索相关文档，支持混合检索策略
- **工具节点**：调用内置工具或自定义 API
- **条件分支节点**：基于变量值进行路由决策
- **代码节点**：嵌入 Python/JavaScript 代码执行自定义逻辑
- **迭代节点**：对数组数据逐项处理
- **变量聚合节点**：合并多条分支的结果

### 4.3 知识库集成

Dify 内置了完整的 RAG 引擎，这是其区别于纯代码框架的核心优势：

```yaml
knowledge_base:
  name: "技术文档库"
  embedding_model: "text-embedding-3-small"
  retrieval:
    search_method: "hybrid_search"
    reranking_enable: true
    reranking_model: "bge-reranker-v2-m3"
    top_k: 5
    score_threshold: 0.6
  chunking:
    rule: "semantic"
    max_tokens: 500
    overlap: 50
```

### 4.4 Agent 与 Chatflow

Dify 区分两种应用类型：

- **Agent 应用**：基于 ReAct 或 Function Calling 模式的自主 Agent，支持动态工具选择和多轮推理。适合开放式、探索性任务
- **Chatflow 应用**：基于预定义工作流的对话系统，每个节点按 DAG 顺序执行。适合流程明确、需要稳定输出的生产场景

### 4.5 API 发布与集成

Dify 将构建好的应用一键发布为 REST API，支持以下集成方式：

```
┌────────────────────────────────────────────────────┐
│                  Dify API 集成                      │
│                                                    │
│  ┌──────────┐     ┌──────────┐    ┌──────────┐   │
│  │ Web App  │────→│ Dify API │←───│ 微信/钉钉│   │
│  └──────────┘     │          │    └──────────┘   │
│                   │ /chat    │                     │
│  ┌──────────┐     │ /completion                    │
│  │ Mobile   │────→│ /workflow                     │
│  │ App      │     │ /knowledge                     │
│  └──────────┘     └──────────┘                     │
└────────────────────────────────────────────────────┘
```

Dify 的最大价值在于**降低了 Multi-Agent 系统的构建和运维门槛**。团队无需深厚的 Python 工程背景就能快速搭建 Agent 应用，并通过其管理后台监控运行状态、成本消耗和用户反馈。适合需要快速验证 Agent 场景、或团队技术栈偏前端/产品的场景。但也正因如此，它的灵活性受限于平台提供的节点类型，复杂的自定义逻辑需要通过代码节点绕道实现。

---

## 五、自研方案

在某些场景下，现有框架可能无法满足需求——也许你需要对 Agent 间的通信协议有完全控制权，也许你需要嵌入特定的安全策略，也许框架的抽象层反而成为了性能瓶颈。这时，自研 Multi-Agent 系统就成为合理选择。

### 5.1 基于 LangGraph 构建

LangGraph 提供了图结构的工作流编排原语，是自研 Multi-Agent 系统的理想基础设施：

```python
from typing import TypedDict, Annotated, Literal
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

class MultiAgentState(TypedDict):
    messages: Annotated[list, add_messages]
    current_agent: str
    task_status: str

llm = ChatOpenAI(model="gpt-4o", temperature=0)

def researcher_node(state: MultiAgentState) -> dict:
    messages = [
        SystemMessage(content="你是研究员，负责收集和整理信息。"
                      "请输出结构化的调研结果。"),
        *state["messages"]
    ]
    response = llm.invoke(messages)
    return {
        "messages": [response],
        "current_agent": "writer",
    }

def writer_node(state: MultiAgentState) -> dict:
    messages = [
        SystemMessage(content="你是技术写手，基于提供的调研资料撰写文章。"
                      "输出完整的 Markdown 文章。"),
        *state["messages"]
    ]
    response = llm.invoke(messages)
    return {
        "messages": [response],
        "current_agent": "reviewer",
    }

def reviewer_node(state: MultiAgentState) -> dict:
    messages = [
        SystemMessage(content="你是审校专家，审查文章质量。"
                      "如果质量合格，输出 APPROVED。"
                      "否则输出修改意见。"),
        *state["messages"]
    ]
    response = llm.invoke(messages)
    return {
        "messages": [response],
        "current_agent": "end",
    }

def route_after_review(state: MultiAgentState) -> Literal["writer", "__end__"]:
    last_msg = state["messages"][-1].content
    if "APPROVED" in last_msg:
        return "__end__"
    return "writer"

graph = StateGraph(MultiAgentState)

graph.add_node("researcher", researcher_node)
graph.add_node("writer", writer_node)
graph.add_node("reviewer", reviewer_node)

graph.set_entry_point("researcher")
graph.add_edge("researcher", "writer")
graph.add_edge("writer", "reviewer")
graph.add_conditional_edges("reviewer", route_after_review)

app = graph.compile()

result = app.invoke({
    "messages": [HumanMessage(content="写一篇关于 Multi-Agent 框架对比的技术文章")],
    "current_agent": "researcher",
    "task_status": "in_progress",
})
```

LangGraph 的核心优势是**确定性的流程控制**——你可以用 `add_conditional_edges` 精确定义路由逻辑，而不是依赖 LLM 的"自主判断"来决定下一步。这对于生产环境的可预测性至关重要。

### 5.2 原生 Python 实现

对于对框架零依赖的极端场景，可以直接基于 LLM API 构建最小 Multi-Agent 系统：

```python
import json
from openai import OpenAI

client = OpenAI()

class Agent:
    def __init__(self, name: str, system_prompt: str, model: str = "gpt-4o"):
        self.name = name
        self.system_prompt = system_prompt
        self.model = model
        self.history = []

    def think(self, context: str) -> str:
        messages = [
            {"role": "system", "content": self.system_prompt},
            *self.history,
            {"role": "user", "content": context}
        ]
        response = client.chat.completions.create(
            model=self.model,
            messages=messages,
        )
        reply = response.choices[0].message.content
        self.history.append({"role": "user", "content": context})
        self.history.append({"role": "assistant", "content": reply})
        return reply

class MultiAgentOrchestrator:
    def __init__(self):
        self.agents = {}
        self.message_log = []

    def register(self, agent: Agent):
        self.agents[agent.name] = agent

    def run(self, task: str, pipeline: list[str], max_rounds: int = 10):
        context = task
        for round_num in range(max_rounds):
            for agent_name in pipeline:
                agent = self.agents[agent_name]
                result = agent.think(context)
                self.message_log.append({
                    "round": round_num,
                    "agent": agent_name,
                    "content": result,
                })
                context = f"[{agent_name} 的输出]:\n{result}"
                if "任务完成" in result or "FINAL_ANSWER" in result:
                    return result
        return context

coder = Agent(
    name="coder",
    system_prompt="你是 Python 专家。根据需求编写代码。"
                  "完成后输出 FINAL_ANSWER 标记。"
)

reviewer = Agent(
    name="reviewer",
    system_prompt="你是代码审查专家。审查代码质量。"
                  "如果通过，输出 FINAL_ANSWER: 代码审查通过。"
                  "否则指出问题。"
)

orchestrator = MultiAgentOrchestrator()
orchestrator.register(coder)
orchestrator.register(reviewer)

result = orchestrator.run(
    task="编写一个 Python 函数：判断一个数是否为回文数",
    pipeline=["coder", "reviewer"],
)
```

### 5.3 何时选择自研

| 考量因素 | 选择框架 | 选择自研 |
|---------|---------|---------|
| 快速原型验证 | ✅ | |
| 团队熟悉底层协议 | | ✅ |
| 需要深度定制通信协议 | | ✅ |
| 对运行时性能有极端要求 | | ✅ |
| 需要嵌入特定安全策略 | | ✅ |
| 需要长期维护和社区支持 | ✅ | |

自研方案的最大风险是**维护成本**。框架解决了大量边界情况（超时、重试、消息格式兼容、模型切换），自研意味着你需要自己处理所有这些。除非有明确的定制需求，否则建议从框架开始，在框架能力不足时再逐步替换。

---

## 六、框架选型决策矩阵

以下是三大框架和自研方案的系统化对比：

| 维度 | AutoGen | CrewAI | Dify | 自研 (LangGraph) |
|------|---------|--------|------|-----------------|
| **学习曲线** | 中等：需理解对话协议和 Agent 角色 | 低：角色/任务/流程直觉清晰 | 极低：可视化拖拽，零代码入门 | 高：需掌握图论和状态机 |
| **灵活性** | 高：对话模式可自由组合 | 中高：角色+流程的组合空间大 | 中：受限于平台提供的节点类型 | 极高：完全自由 |
| **生产就绪度** | 中高：微软维护，有企业级特性 | 中：社区活跃，但成熟度仍在提升 | 高：开箱即用的管理后台和监控 | 取决于团队工程能力 |
| **社区生态** | 大：GitHub 40k+ stars，微软背书 | 大：增长迅速，丰富的模板和案例 | 大：国内社区活跃，中文文档完善 | 依赖 LangGraph 社区 |
| **代码质量** | 严格类型，测试覆盖较完善 | Pythonic，易读易改 | 开源但偏平台化 | 完全自主 |
| **模型支持** | 广泛：通过 litellm 支持主流模型 | 广泛：通过 litellm 支持主流模型 | 广泛：平台内置多 Provider 接入 | 取决于自行集成 |
| **内置工具** | 丰富：代码执行、网页浏览、文件操作 | 中等：serper、scrape 等工具包 | 丰富：知识库、插件市场、API 工具 | 无，全部自行实现 |
| **部署复杂度** | 中：pip install，可选 Docker | 低：pip install | 高：需 Docker Compose 部署 | 取决于架构 |
| **成本模型** | 开源免费，按 LLM API 调用计费 | 开源免费，按 LLM API 调用计费 | 社区版免费，云版按量计费 | 开源免费，按 LLM API 调用计费 |
| **适用场景** | 复杂对话系统、代码生成协作 | 内容生产、研究分析、任务自动化 | 快速构建企业级 Agent 应用 | 定制化需求极高的场景 |

### 选型建议速查

```
你的团队是什么技术背景？
├── 有 Python 工程能力，需要复杂 Agent 交互
│   ├── 需要高度定制 → 自研 (LangGraph)
│   └── 希望有成熟框架支撑 → AutoGen
├── 希望快速上手，角色驱动的任务编排
│   └── → CrewAI
└── 团队偏前端/产品，需要快速出成果
    └── → Dify
```

---

## 七、安全视角

Multi-Agent 系统引入了单 Agent 不存在的安全挑战：**当多个 Agent 互相传递消息和委派任务时，信任边界变得模糊，攻击面成倍放大。**

### 7.1 智能体间信任问题

在层级委派模式中，管理者 Agent 委派任务给执行者 Agent，但管理者本身并不完全理解执行者返回结果的含义——它依赖 LLM 的语义理解能力来"判断"结果是否合理。这种信任链存在以下风险：

- **间接提示注入（Indirect Prompt Injection）**：Agent A 从外部数据源（网页、文件）获取的信息中可能包含恶意指令，当这些信息作为上下文传递给 Agent B 时，Agent B 可能被劫持执行非预期操作
- **权限升级（Privilege Escalation）**：拥有代码执行权限的 Agent 可能通过生成恶意代码获取超出其角色的系统权限
- **信息泄露（Information Leakage）**：在 GroupChat 模式中，所有参与者都能看到所有消息，敏感信息可能被不具备相应权限的 Agent 接收

### 7.2 通信安全

```python
import time
import hashlib

class SecureAgentMessage:
    def __init__(self, sender: str, content: str, permissions: list[str]):
        self.sender = sender
        self.content = content
        self.permissions = permissions
        self.timestamp = time.time()
        self.signature = self._sign()

    def _sign(self) -> str:
        payload = f"{self.sender}:{self.content}:{self.timestamp}"
        return hashlib.sha256(payload.encode()).hexdigest()

    def verify(self) -> bool:
        expected = hashlib.sha256(
            f"{self.sender}:{self.content}:{self.timestamp}".encode()
        ).hexdigest()
        return self.signature == expected
```

### 7.3 权限边界设计

最佳实践是为每个 Agent 实施**最小权限原则**：

| Agent 角色 | 允许的操作 | 禁止的操作 |
|-----------|-----------|-----------|
| 研究 Agent | 读取知识库、搜索互联网 | 写入数据库、调用支付 API |
| 编码 Agent | 读写指定工作目录文件 | 访问环境变量、执行系统命令 |
| 审查 Agent | 读取代码文件 | 修改代码、执行代码 |
| 协调 Agent | 分配任务、读取进度 | 直接操作外部系统 |

### 7.4 输出审查机制

所有 Agent 的输出在传递给外部系统之前，都应该经过**输出审查层**：

```python
import re

class OutputGuard:
    def __init__(self):
        self.blocked_patterns = [
            r"rm\s+-rf",
            r"DROP\s+TABLE",
            r"eval\(",
            r"exec\(",
            r"__import__",
        ]

    def check(self, output: str) -> tuple[bool, str]:
        for pattern in self.blocked_patterns:
            if re.search(pattern, output, re.IGNORECASE):
                return False, f"检测到不安全的输出模式: {pattern}"
        if len(output) > 10000:
            return False, "输出长度超出安全阈值"
        return True, output
```

Multi-Agent 系统的安全不能依赖 LLM 本身的"对齐"能力，必须在框架层面建立硬性的安全边界。**LLM 是概率系统，安全控制必须是确定性的。**

---

## 八、延伸阅读

- [AutoGen 官方文档](https://microsoft.github.io/autogen/) — 微软 AutoGen/AG2 的最新 API 文档和教程
- [CrewAI 官方文档](https://docs.crewai.com/) — CrewAI 的角色定义、任务编排和工具集成指南
- [Dify 官方文档](https://docs.dify.ai/zh-hans) — Dify 的 Workflow 编排、知识库集成和 API 对接文档
- [LangGraph 官方文档](https://langchain-ai.github.io/langgraph/) — LangGraph 的图编排原语和 Multi-Agent 模式
- [Multi-Agent 系统综述 (Survey)](https://arxiv.org/abs/2308.08155) — 学术界对 Multi-Agent 协作模式的系统性梳理
- [AI Agent 安全白皮书](https://owasp.org/www-project-top-10-for-large-language-model-applications/) — OWASP 针对 LLM 应用的安全威胁分类
- [Building Effective Agents (Anthropic)](https://www.anthropic.com/research/building-effective-agents) — Anthropic 关于 Agent 架构设计的工程指南
- [Magentic-One (Microsoft)](https://www.microsoft.com/en-us/research/articles/magentic-one-a-generalist-multi-agent-system-for-solving-complex-tasks/) — 微软基于 AutoGen 构建的通用 Multi-Agent 系统
