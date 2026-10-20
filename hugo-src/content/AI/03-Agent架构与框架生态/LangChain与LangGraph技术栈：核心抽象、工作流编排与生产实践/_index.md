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
parser = StrOut