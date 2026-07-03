---
title: "Function Calling 与 Tool Use：工作原理、编排模式与安全考量"
weight: 2
tags: [Function Calling, Tool Use, Agent, 工具调用, OpenAI, Claude]
menu: 
  main: 
    parent: "Agent 架构与框架生态"
---

# Function Calling 与 Tool Use：工作原理、编排模式与安全考量

Function Calling 是现代 LLM Agent 体系的基石能力——没有它，大模型只是一个封闭的文本生成器；有了它，大模型才能与真实世界交互。从 2023 年 6 月 OpenAI 首次在 GPT-3.5/GPT-4 中引入 Function Calling，到 Anthropic 为 Claude 推出 Tool Use，再到各开源模型纷纷跟进，工具调用已经从"锦上添花"变成了 Agent 架构的**必选组件**。

然而，绝大多数开发者对 Function Calling 的理解停留在"给模型一个函数定义，它就能调用"的浅层认知。本文将从协议原理出发，深入拆解工具调用的完整生命周期，系统对比 OpenAI 与 Claude 两大主流协议的差异，详解五种编排模式的实现方式，并从工程视角讨论安全控制与生产化部署的关键考量。

---

## 1. Function Calling 工作原理

### 1.1 完整生命周期

理解 Function Calling 的关键在于认识到：**模型本身不执行任何代码**。它只做一件事——决定"是否需要调用工具，如果需要，应该传什么参数"。实际的工具执行、结果回传、多轮交互都由外部系统（你的应用代码）控制。

一次完整的 Function Calling 交互遵循以下流程：

```
┌──────────────────────────────────────────────────────────────────┐
│                 Function Calling 完整生命周期                      │
│                                                                  │
│  用户输入                                                         │
│  "帮我查一下北京今天的天气"                                         │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────┐                         │
│  │ 1. Prompt 构建                      │                         │
│  │    messages: [系统提示, 用户消息]     │                         │
│  │    tools: [weather, ...]            │                         │
│  │    tool_choice: "auto"              │                         │
│  └──────────────┬──────────────────────┘                         │
│                 ▼                                                │
│  ┌─────────────────────────────────────┐                         │
│  │ 2. 模型推理                         │                         │
│  │    判断：需要调用 weather 工具        │                         │
│  │    生成: tool_call object            │                         │
│  │    {                                │                         │
│  │      "function": {                  │                         │
│  │        "name": "get_weather",       │                         │
│  │        "arguments": "{              │                         │
│  │          \"city\": \"北京\"           │                         │
│  │        }"                           │                         │
│  │      }                              │                         │
│  │    }                                │                         │
│  └──────────────┬──────────────────────┘                         │
│                 ▼                                                │
│  ┌─────────────────────────────────────┐                         │
│  │ 3. 应用层执行工具                    │                         │
│  │    result = get_weather(city="北京")  │                         │
│  │    → {"temp": 28, "condition": "晴"} │                         │
│  └──────────────┬──────────────────────┘                         │
│                 ▼                                                │
│  ┌─────────────────────────────────────┐                         │
│  │ 4. 结果回传模型                      │                         │
│  │    messages 追加:                    │                         │
│  │    - assistant(tool_call=...)        │                         │
│  │    - tool(tool_result=...)           │                         │
│  └──────────────┬──────────────────────┘                         │
│                 ▼                                                │
│  ┌─────────────────────────────────────┐                         │
│  │ 5. 模型生成最终回复                  │                         │
│  │    "北京今天天气晴朗，气温 28°C"       │                         │
│  └─────────────────────────────────────┘                         │
│                                                                  │
│  stop_reason: "stop"  → 流程结束                                 │
│  stop_reason: "tool_use" → 回到步骤 2，继续调用工具               │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 关键数据流

用 Python 伪代码展示这一流程：

```python
import json
from openai import OpenAI

client = OpenAI()

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "获取指定城市的当前天气信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "城市名称"}
                },
                "required": ["city"]
            }
        }
    }
]

messages = [
    {"role": "system", "content": "你是一个有用的助手。"},
    {"role": "user", "content": "帮我查一下北京今天的天气"}
]

response = client.chat.completions.create(
    model="gpt-4o",
    messages=messages,
    tools=tools,
    tool_choice="auto"
)

choice = response.choices[0]

if choice.message.tool_calls:
    for tool_call in choice.message.tool_calls:
        func_name = tool_call.function.name
        func_args = json.loads(tool_call.function.arguments)

        result = get_weather(**func_args)

        messages.append(choice.message)
        messages.append({
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": json.dumps(result, ensure_ascii=False)
        })

    final_response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        tools=tools
    )
    print(final_response.choices[0].message.content)
else:
    print(choice.message.content)
```

### 1.3 `tool_choice` 控制策略

`tool_choice` 参数是控制模型行为的关键旋钮：

| 值 | 行为 | 适用场景 |
|-----|------|---------|
| `"auto"` | 模型自行决定是否调用工具 | 通用场景 |
| `"none"` | 强制不调用任何工具 | 需要纯文本回复时 |
| `"required"` | 强制调用至少一个工具 | 确保工具被使用 |
| `{"type": "function", "function": {"name": "xxx"}}` | 强制调用指定工具 | 精确控制场景 |

### 1.4 并行工具调用（Parallel Tool Calls）

从 GPT-4o 开始，模型可以**在一次回复中生成多个 tool_call**。例如用户说"帮我查北京和上海的天气"，模型可能同时返回两个 tool_call：

```json
{
  "tool_calls": [
    {
      "id": "call_1",
      "function": {
        "name": "get_weather",
        "arguments": "{\"city\": \"北京\"}"
      }
    },
    {
      "id": "call_2",
      "function": {
        "name": "get_weather",
        "arguments": "{\"city\": \"上海\"}"
      }
    }
  ]
}
```

这种能力极大提升了工具调用的效率，但也要求应用层正确处理多个并发结果的收集与回传。

---

## 2. OpenAI Function Calling vs Claude Tool Use

虽然 OpenAI 和 Claude 的工具调用在概念上一致，但在协议细节上存在显著差异。

### 2.1 协议差异对比

| 维度 | OpenAI Function Calling | Claude Tool Use |
|------|------------------------|-----------------|
| **工具定义位置** | `tools` 数组，每项含 `type` + `function` | `tools` 数组，直接 `name`/`description`/`input_schema` |
| **参数 Schema** | `function.parameters`（标准 JSON Schema） | `input_schema`（标准 JSON Schema） |
| **响应标识** | `message.tool_calls` 数组 | `content` 数组中 `type: "tool_use"` 的块 |
| **结果回传** | 独立 `role: "tool"` 消息 + `tool_call_id` | `role: "user"` 中嵌入 `type: "tool_result"` |
| **并行调用** | 一次响应含多个 `tool_calls` 项 | 一次响应含多个 `tool_use` content 块 |
| **强制调用** | `tool_choice: {"function": {"name": "xxx"}}` | `tool_choice: {"type": "tool", "name": "xxx"}` |
| **stop_reason** | `finish_reason: "tool_calls"` | `stop_reason: "tool_use"` |
| **错误处理** | `tool_result` 可传 `is_error: true` | 原生支持 `is_error` 字段 |

### 2.2 工具定义格式对比

**OpenAI 格式：**

```python
tools_openai = [
    {
        "type": "function",
        "function": {
            "name": "search_database",
            "description": "在数据库中搜索记录",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词"},
                    "limit": {"type": "integer", "default": 10}
                },
                "required": ["query"]
            },
            "strict": True
        }
    }
]
```

**Claude 格式：**

```python
tools_claude = [
    {
        "name": "search_database",
        "description": "在数据库中搜索记录",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "搜索关键词"},
                "limit": {"type": "integer", "default": 10}
            },
            "required": ["query"]
        }
    }
]
```

### 2.3 结果回传格式对比

**OpenAI：** 工具结果作为独立消息回传

```python
messages = [
    assistant_msg,  # 含 tool_calls
    {
        "role": "tool",
        "tool_call_id": assistant_msg.tool_calls[0].id,
        "content": json.dumps(result)
    }
]
```

**Claude：** 工具结果嵌入到 user 消息中

```python
messages = [
    assistant_msg,  # 含 tool_use content blocks
    {
        "role": "user",
        "content": [
            {
                "type": "tool_result",
                "tool_use_id": tool_use_block.id,
                "content": json.dumps(result)
            }
        ]
    }
]
```

### 2.4 统一抽象层

在生产实践中，建议封装统一的工具调用抽象层，屏蔽底层协议差异：

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]

@dataclass
class ToolResult:
    tool_call_id: str
    content: str
    is_error: bool = False

class ToolProvider(ABC):
    @abstractmethod
    def format_tools(self, tool_defs: list[dict]) -> list[dict]:
        pass

    @abstractmethod
    def extract_tool_calls(self, response: Any) -> list[ToolCall]:
        pass

    @abstractmethod
    def format_tool_result(self, result: ToolResult) -> dict:
        pass

class OpenAIProvider(ToolProvider):
    def format_tools(self, tool_defs: list[dict]) -> list[dict]:
        return [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t["description"],
                    "parameters": t["parameters"]
                }
            }
            for t in tool_defs
        ]

    def extract_tool_calls(self, response) -> list[ToolCall]:
        msg = response.choices[0].message
        if not msg.tool_calls:
            return []
        return [
            ToolCall(
                id=tc.id,
                name=tc.function.name,
                arguments=json.loads(tc.function.arguments)
            )
            for tc in msg.tool_calls
        ]

    def format_tool_result(self, result: ToolResult) -> dict:
        return {
            "role": "tool",
            "tool_call_id": result.tool_call_id,
            "content": result.content
        }

class ClaudeProvider(ToolProvider):
    def format_tools(self, tool_defs: list[dict]) -> list[dict]:
        return [
            {
                "name": t["name"],
                "description": t["description"],
                "input_schema": t["parameters"]
            }
            for t in tool_defs
        ]

    def extract_tool_calls(self, response) -> list[ToolCall]:
        calls = []
        for block in response.content:
            if block.type == "tool_use":
                calls.append(ToolCall(
                    id=block.id,
                    name=block.name,
                    arguments=block.input
                ))
        return calls

    def format_tool_result(self, result: ToolResult) -> dict:
        content = {
            "type": "tool_result",
            "tool_use_id": result.tool_call_id,
            "content": result.content
        }
        if result.is_error:
            content["is_error"] = True
        return {"role": "user", "content": [content]}
```

这种抽象使得上层 Agent 逻辑无需关心底层使用的是哪个 LLM Provider。

---

## 3. 工具定义规范

工具定义的质量直接影响模型的调用准确率。以下是基于 JSON Schema 的最佳实践。

### 3.1 基础结构

```python
TOOL_DEFINITIONS = {
    "send_email": {
        "name": "send_email",
        "description": "发送电子邮件给指定收件人。支持纯文本和 HTML 格式。会返回发送状态和消息 ID。",
        "parameters": {
            "type": "object",
            "properties": {
                "to": {
                    "type": "string",
                    "description": "收件人邮箱地址",
                    "format": "email"
                },
                "subject": {
                    "type": "string",
                    "description": "邮件主题",
                    "maxLength": 200
                },
                "body": {
                    "type": "string",
                    "description": "邮件正文内容"
                },
                "cc": {
                    "type": "array",
                    "items": {"type": "string", "format": "email"},
                    "description": "抄送邮箱地址列表"
                },
                "priority": {
                    "type": "string",
                    "enum": ["low", "normal", "high", "urgent"],
                    "description": "邮件优先级，默认为 normal"
                },
                "html": {
                    "type": "boolean",
                    "description": "是否以 HTML 格式发送",
                    "default": False
                }
            },
            "required": ["to", "subject", "body"]
        }
    }
}
```

### 3.2 Description 编写最佳实践

工具描述是模型理解"何时使用此工具"的唯一依据，需要覆盖三个关键信息：

1. **做什么**：清晰说明工具的核心功能
2. **什么时候用**：明确适用场景，尤其是与其他相似工具的区分
3. **返回什么**：告知模型可以期望获得什么信息

```python
# ❌ 差的描述
{"name": "search", "description": "搜索"}

# ✅ 好的描述
{
    "name": "search_knowledge_base",
    "description": (
        "在内部知识库中搜索技术文档和最佳实践。"
        "适用于查找 API 使用方法、架构设计模式、故障排查指南。"
        "返回最相关的 10 条文档片段，包含标题、摘要和原文链接。"
        "不适用于实时数据查询，请使用 web_search 工具。"
    )
}
```

### 3.3 复杂参数模式

**嵌套对象：**

```json
{
    "type": "object",
    "properties": {
        "filter": {
            "type": "object",
            "description": "查询过滤条件",
            "properties": {
                "status": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["open", "closed", "pending"]}
                },
                "date_range": {
                    "type": "object",
                    "properties": {
                        "start": {"type": "string", "format": "date"},
                        "end": {"type": "string", "format": "date"}
                    }
                },
                "assignee": {"type": "string"}
            }
        }
    }
}
```

**`anyOf` / `oneOf` 多态参数：**

```json
{
    "type": "object",
    "properties": {
        "location": {
            "oneOf": [
                {
                    "type": "object",
                    "description": "使用经纬度坐标",
                    "properties": {
                        "latitude": {"type": "number"},
                        "longitude": {"type": "number"}
                    },
                    "required": ["latitude", "longitude"]
                },
                {
                    "type": "object",
                    "description": "使用城市名称",
                    "properties": {
                        "city": {"type": "string"},
                        "country": {"type": "string"}
                    },
                    "required": ["city"]
                }
            ]
        }
    }
}
```

### 3.4 OpenAI Strict Mode

OpenAI 提供 `strict: true` 模式，强制模型的输出完全匹配你定义的 JSON Schema，消除额外字段或格式偏差：

```python
{
    "type": "function",
    "function": {
        "name": "create_task",
        "strict": True,
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "due_date": {"type": "string", "format": "date"}
            },
            "required": ["title", "due_date"],
            "additionalProperties": False
        }
    }
}
```

> **注意**：Strict Mode 要求 `additionalProperties: false` 且所有 `properties` 都必须在 `required` 中列出。如果需要可选参数，可以使用 `anyOf` 包裹 `null` 类型来实现：`"anyOf": [{"type": "string"}, {"type": "null"}]`。

---

## 4. 编排模式详解

当一个 Agent 需要使用多个工具时，工具之间的编排方式决定了整个系统的效率和可靠性。

### 4.1 Sequential（顺序编排）

最简单的模式：工具按顺序依次执行，前一个工具的输出作为后一个的输入。

```
用户输入 → Tool A → Tool B → Tool C → 最终输出
```

```python
from dataclasses import dataclass

@dataclass
class ToolResult:
    success: bool
    data: dict

class SequentialOrchestrator:
    def __init__(self, tools: dict[str, callable]):
        self.tools = tools

    def execute(self, pipeline: list[tuple[str, dict]]) -> list[ToolResult]:
        results = []
        context = {}

        for tool_name, params in pipeline:
            merged_params = {**params, **context}
            result = self.tools[tool_name](**merged_params)
            results.append(result)

            if not result.success:
                break

            context.update(result.data)

        return results

orchestrator = SequentialOrchestrator({
    "geocode": lambda city, **_: ToolResult(True, {"lat": 39.9, "lon": 116.4}),
    "get_weather": lambda lat, lon, **_: ToolResult(True, {"temp": 28}),
    "format_report": lambda temp, **_: ToolResult(True, {"report": f"当前温度 {temp}°C"})
})

results = orchestrator.execute([
    ("geocode", {"city": "北京"}),
    ("get_weather", {}),
    ("format_report", {})
])
```

**适用场景**：数据处理管道、信息提取链、ETL 流程。

### 4.2 Parallel（并行编排）

多个工具同时执行，收集所有结果后再汇总。大幅提升响应速度。

```
                    ┌─ Tool A ─┐
用户输入 → 分发 ─┼─ Tool B ─┼─ 汇总 → 最终输出
                    └─ Tool C ─┘
```

```python
import asyncio
from typing import Any

class ParallelOrchestrator:
    def __init__(self, tools: dict[str, callable]):
        self.tools = tools

    async def execute(
        self, tool_configs: list[dict[str, Any]]
    ) -> list[ToolResult]:
        tasks = []
        for config in tool_configs:
            name = config["name"]
            params = config["params"]
            tasks.append(self._run_tool(name, params))

        return await asyncio.gather(*tasks, return_exceptions=True)

    async def _run_tool(self, name: str, params: dict) -> ToolResult:
        func = self.tools[name]
        if asyncio.iscoroutinefunction(func):
            return await func(**params)
        return func(**params)

async def fetch_user_profile(user_id: str) -> ToolResult:
    return ToolResult(True, {"profile": {"name": "张三"}})

async def fetch_user_orders(user_id: str) -> ToolResult:
    return ToolResult(True, {"orders": [{"id": "001"}]})

async def fetch_user_rewards(user_id: str) -> ToolResult:
    return ToolResult(True, {"rewards": [{"type": "积分", "amount": 500}]})

async def main():
    orchestrator = ParallelOrchestrator({
        "get_profile": fetch_user_profile,
        "get_orders": fetch_user_orders,
        "get_rewards": fetch_user_rewards,
    })

    results = await orchestrator.execute([
        {"name": "get_profile", "params": {"user_id": "123"}},
        {"name": "get_orders", "params": {"user_id": "123"}},
        {"name": "get_rewards", "params": {"user_id": "123"}},
    ])

    for r in results:
        print(r.data)

asyncio.run(main())
```

**适用场景**：聚合多源数据、对比查询、Dashboard 信息收集。

### 4.3 Conditional（条件编排）

根据前一步工具的执行结果决定后续路径，形成分支逻辑。

```
                    ┌─ 结果为 A 类型 → Tool B
用户输入 → Tool A ─┤
                    └─ 结果为 B 类型 → Tool C
```

```python
class ConditionalOrchestrator:
    def __init__(self, tools: dict[str, callable]):
        self.tools = tools

    def execute(self, initial_tool: str, params: dict,
                routing_rules: dict[str, tuple[str, dict]]) -> ToolResult:
        result = self.tools[initial_tool](**params)

        if not result.success:
            return result

        category = result.data.get("category", "default")

        if category in routing_rules:
            next_tool, extra_params = routing_rules[category]
            merged = {**params, **result.data, **extra_params}
            return self.tools[next_tool](**merged)

        return result

def classify_request(query: str) -> ToolResult:
    if "价格" in query:
        return ToolResult(True, {"category": "pricing", "query": query})
    return ToolResult(True, {"category": "general", "query": query})

def handle_pricing(query: str, **_) -> ToolResult:
    return ToolResult(True, {"answer": f"查询价格: {query}"})

def handle_general(query: str, **_) -> ToolResult:
    return ToolResult(True, {"answer": f"通用回复: {query}"})

orchestrator = ConditionalOrchestrator({
    "classify": classify_request,
    "pricing_agent": handle_pricing,
    "general_agent": handle_general,
})

result = orchestrator.execute(
    initial_tool="classify",
    params={"query": "iPhone 的价格是多少"},
    routing_rules={
        "pricing": ("pricing_agent", {}),
        "general": ("general_agent", {}),
    }
)
print(result.data["answer"])
```

**适用场景**：意图路由、多策略分发、错误恢复路径。

### 4.4 Recursive（递归编排）

Agent 在执行工具时可能发现需要调用更多工具，形成递归调用链。这是 ReAct Agent 的核心模式。

```
Agent 执行 Tool A → 发现需要 Tool B
  → Agent 执行 Tool B → 发现需要 Tool C
    → Agent 执行 Tool C → 返回结果
  → Agent 汇总 B 的结果
→ Agent 汇总 A 的结果
```

```python
from typing import Callable

class RecursiveAgent:
    def __init__(
        self,
        tools: dict[str, Callable],
        max_depth: int = 10,
        llm_decide: Callable = None
    ):
        self.tools = tools
        self.max_depth = max_depth
        self.llm_decide = llm_decide or self._default_llm_decide

    def execute(self, goal: str, context: dict = None) -> str:
        context = context or {}
        return self._recursive_solve(goal, context, depth=0)

    def _recursive_solve(self, goal: str, context: dict, depth: int) -> str:
        if depth >= self.max_depth:
            return f"达到最大递归深度 ({self.max_depth})，当前上下文: {context}"

        decision = self.llm_decide(goal, context, self.tools)

        if decision["action"] == "final_answer":
            return decision["answer"]

        tool_name = decision["tool"]
        tool_args = decision["arguments"]

        tool_func = self.tools[tool_name]
        result = tool_func(**tool_args)

        context[f"result_{tool_name}"] = result
        return self._recursive_solve(goal, context, depth + 1)

    def _default_llm_decide(self, goal, context, tools):
        if context:
            return {"action": "final_answer", "answer": f"基于上下文 {context} 回答: {goal}"}
        return {"action": "use_tool", "tool": list(tools.keys())[0], "arguments": {"goal": goal}}

def search_web(goal: str, **_) -> dict:
    return {"results": [f"关于'{goal}'的搜索结果"]}

def analyze_content(goal: str, **_) -> dict:
    return {"analysis": f"'{goal}'的分析报告"}

agent = RecursiveAgent(
    tools={"search": search_web, "analyze": analyze_content},
    max_depth=5
)
answer = agent.execute("分析当前 AI 行业趋势")
print(answer)
```

**适用场景**：复杂推理任务、多步信息收集、自我反思型 Agent。

### 4.5 DAG（有向无环图编排）

当工具之间存在复杂的依赖关系但不需要循环时，可以使用 DAG 进行声明式编排：

```python
from dataclasses import dataclass, field

@dataclass
class DAGNode:
    name: str
    tool: Callable
    dependencies: list[str] = field(default_factory=list)

class DAGOrchestrator:
    def __init__(self):
        self.nodes: dict[str, DAGNode] = {}

    def add_node(self, node: DAGNode):
        self.nodes[node.name] = node

    def execute(self) -> dict[str, ToolResult]:
        results = {}
        executed = set()

        while len(executed) < len(self.nodes):
            ready = [
                name for name, node in self.nodes.items()
                if name not in executed
                and all(dep in executed for dep in node.dependencies)
            ]

            if not ready:
                raise RuntimeError("DAG 中存在循环依赖")

            for name in ready:
                node = self.nodes[name]
                dep_results = {
                    dep: results[dep].data for dep in node.dependencies
                }
                result = node.tool(dep_results=dep_results)
                results[name] = result
                executed.add(name)

        return results

def fetch_raw_data(dep_results: dict) -> ToolResult:
    return ToolResult(True, {"records": [1, 2, 3, 4, 5]})

def compute_statistics(dep_results: dict) -> ToolResult:
    raw = dep_results["fetch_data"]["records"]
    return ToolResult(True, {"mean": sum(raw) / len(raw), "count": len(raw)})

def generate_chart(dep_results: dict) -> ToolResult:
    stats = dep_results["compute_stats"]
    return ToolResult(True, {"chart_url": f"chart_{stats['mean']}.png"})

dag = DAGOrchestrator()
dag.add_node(DAGNode("fetch_data", fetch_raw_data))
dag.add_node(DAGNode("compute_stats", compute_statistics, ["fetch_data"]))
dag.add_node(DAGNode("generate_chart", generate_chart, ["compute_stats"]))

results = dag.execute()
for name, result in results.items():
    print(f"{name}: {result.data}")
```

---

## 5. 动态工具选择

当工具数量增长到数十甚至上百个时，将所有工具定义一次性发送给模型既浪费 token 又降低准确率。动态工具选择是解决这一问题的关键策略。

### 5.1 Tool Registry 模式

```python
from typing import Callable
from dataclasses import dataclass, field

@dataclass
class ToolDefinition:
    name: str
    description: str
    parameters: dict
    tags: list[str] = field(default_factory=list)
    handler: Callable = None

class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, ToolDefinition] = {}

    def register(self, tool: ToolDefinition):
        self._tools[tool.name] = tool

    def get_all(self) -> list[ToolDefinition]:
        return list(self._tools.values())

    def get_by_names(self, names: list[str]) -> list[ToolDefinition]:
        return [self._tools[n] for n in names if n in self._tools]

    def get_by_tags(self, tags: list[str]) -> list[ToolDefinition]:
        return [
            t for t in self._tools.values()
            if any(tag in t.tags for tag in tags)
        ]

    def search(self, query: str) -> list[ToolDefinition]:
        query_lower = query.lower()
        scored = []
        for tool in self._tools.values():
            score = 0
            if query_lower in tool.name.lower():
                score += 3
            if query_lower in tool.description.lower():
                score += 1
            if score > 0:
                scored.append((score, tool))
        scored.sort(key=lambda x: -x[0])
        return [t for _, t in scored]

    def format_for_openai(self, tools: list[ToolDefinition]) -> list[dict]:
        return [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters
                }
            }
            for t in tools
        ]

    def format_for_claude(self, tools: list[ToolDefinition]) -> list[dict]:
        return [
            {
                "name": t.name,
                "description": t.description,
                "input_schema": t.parameters
            }
            for t in tools
        ]

registry = ToolRegistry()

registry.register(ToolDefinition(
    name="search_web",
    description="在互联网上搜索信息",
    parameters={"type": "object", "properties": {"query": {"type": "string"}}},
    tags=["search", "internet"]
))
registry.register(ToolDefinition(
    name="query_database",
    description="查询内部数据库",
    parameters={"type": "object", "properties": {"sql": {"type": "string"}}},
    tags=["search", "data", "internal"]
))
```

### 5.2 基于查询分类的工具路由

```python
from enum import Enum

class QueryCategory(Enum):
    INFORMATION_SEEKING = "information"
    DATA_ANALYSIS = "analysis"
    SYSTEM_OPERATION = "operation"
    CREATIVE = "creative"

TOOL_ROUTING = {
    QueryCategory.INFORMATION_SEEKING: ["search_web", "search_knowledge_base"],
    QueryCategory.DATA_ANALYSIS: ["query_database", "compute_statistics", "generate_chart"],
    QueryCategory.SYSTEM_OPERATION: ["send_email", "create_ticket", "deploy_service"],
    QueryCategory.CREATIVE: ["generate_image", "write_content"],
}

class ToolRouter:
    def __init__(self, registry: ToolRegistry, classifier: Callable):
        self.registry = registry
        self.classifier = classifier

    def select_tools(self, query: str) -> list[ToolDefinition]:
        category = self.classifier(query)
        tool_names = TOOL_ROUTING.get(category, [])
        return self.registry.get_by_names(tool_names)

def classify_query(query: str) -> QueryCategory:
    if any(kw in query for kw in ["查询", "搜索", "查找", "什么是"]):
        return QueryCategory.INFORMATION_SEEKING
    elif any(kw in query for kw in ["分析", "统计", "报表", "数据"]):
        return QueryCategory.DATA_ANALYSIS
    elif any(kw in query for kw in ["发送", "创建", "部署", "配置"]):
        return QueryCategory.SYSTEM_OPERATION
    return QueryCategory.CREATIVE

router = ToolRouter(registry, classify_query)
selected = router.select_tools("帮我搜索最新的 AI 论文")
print([t.name for t in selected])
```

这种模式使得每个请求只携带 3-5 个相关工具定义，而非全部 50+ 工具，大幅降低了 token 消耗并提升了模型的调用准确率。

---

## 6. 安全考量

工具调用将 LLM 的能力边界扩展到了真实系统，安全控制不再是"可选项"而是"必选项"。

### 6.1 输入验证：Schema 层 + 业务层双保险

```python
import jsonschema
from typing import Any

class ToolInputValidator:
    def __init__(self):
        self._schemas: dict[str, dict] = {}
        self._custom_validators: dict[str, callable] = {}

    def register_schema(self, tool_name: str, schema: dict):
        self._schemas[tool_name] = schema

    def register_validator(self, tool_name: str, validator: callable):
        self._custom_validators[tool_name] = validator

    def validate(self, tool_name: str, args: dict[str, Any]) -> tuple[bool, str]:
        if tool_name in self._schemas:
            try:
                jsonschema.validate(args, self._schemas[tool_name])
            except jsonschema.ValidationError as e:
                return False, f"参数验证失败: {e.message}"

        if tool_name in self._custom_validators:
            error = self._custom_validators[tool_name](args)
            if error:
                return False, f"业务验证失败: {error}"

        return True, ""

validator = ToolInputValidator()

validator.register_schema("execute_sql", {
    "type": "object",
    "properties": {
        "query": {"type": "string", "minLength": 1, "maxLength": 1000},
        "database": {"type": "string", "enum": ["analytics", "users"]}
    },
    "required": ["query", "database"]
})

SQL_KEYWORDS_BLOCKED = {"DROP", "DELETE", "TRUNCATE", "ALTER", "INSERT", "UPDATE"}

def validate_sql_safety(args: dict) -> str | None:
    query = args["query"].upper()
    for keyword in SQL_KEYWORDS_BLOCKED:
        if keyword in query:
            return f"禁止执行包含 {keyword} 的语句"
    if not query.strip().startswith("SELECT"):
        return "仅允许 SELECT 查询"
    return None

validator.register_validator("execute_sql", validate_sql_safety)

ok, msg = validator.validate("execute_sql", {
    "query": "SELECT * FROM users LIMIT 10",
    "database": "analytics"
})
print(f"验证结果: {ok}, {msg}")

ok, msg = validator.validate("execute_sql", {
    "query": "DROP TABLE users",
    "database": "analytics"
})
print(f"验证结果: {ok}, {msg}")
```

### 6.2 沙箱执行

对于可能执行任意代码或访问系统资源的工具，必须在沙箱环境中运行：

```python
import subprocess
import resource

class DockerSandbox:
    def __init__(self, image: str = "python:3.11-slim"):
        self.image = image

    def execute(self, code: str, timeout: int = 30) -> tuple[bool, str]:
        cmd = [
            "docker", "run", "--rm",
            "--network", "none",
            "--memory", "256m",
            "--cpus", "0.5",
            "--read-only",
            "--tmpfs", "/tmp:size=64m",
            self.image,
            "python", "-c", code
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout
            )
            if result.returncode != 0:
                return False, result.stderr
            return True, result.stdout
        except subprocess.TimeoutExpired:
            return False, f"执行超时（{timeout}s）"

class E2BSandbox:
    def __init__(self, api_key: str):
        self.api_key = api_key

    def execute(self, code: str, timeout: int = 30) -> tuple[bool, str]:
        import e2b_code_interpreter
        sandbox = e2b_code_interpreter.Sandbox(api_key=self.api_key)

        try:
            execution = sandbox.run_code(code, timeout=timeout)
            if execution.error:
                return False, f"{execution.error.name}: {execution.error.value}"
            outputs = []
            for o in execution.logs.stdout:
                outputs.append(o)
            return True, "".join(outputs)
        finally:
            sandbox.kill()
```

### 6.3 权限控制

不同工具应有不同的权限级别，遵循最小权限原则：

```python
from enum import Enum
from dataclasses import dataclass

class PermissionLevel(Enum):
    READ_ONLY = "read_only"
    READ_WRITE = "read_write"
    ADMIN = "admin"

@dataclass
class ToolPermission:
    name: str
    level: PermissionLevel
    allowed_databases: list[str] | None = None
    rate_limit_per_minute: int = 60

class PermissionGuard:
    def __init__(self):
        self._permissions: dict[str, ToolPermission] = {}
        self._call_counts: dict[str, list[float]] = {}

    def register(self, perm: ToolPermission):
        self._permissions[perm.name] = perm

    def check(self, tool_name: str, context: dict) -> tuple[bool, str]:
        perm = self._permissions.get(tool_name)
        if not perm:
            return False, f"工具 {tool_name} 未注册权限"

        user_role = context.get("role", "viewer")
        if perm.level == PermissionLevel.ADMIN and user_role != "admin":
            return False, "需要管理员权限"

        if perm.level == PermissionLevel.READ_WRITE and user_role == "viewer":
            return False, "只读用户无权执行写操作"

        import time
        now = time.time()
        calls = self._call_counts.get(tool_name, [])
        calls = [t for t in calls if now - t < 60]
        if len(calls) >= perm.rate_limit_per_minute:
            return False, f"工具 {tool_name} 调用频率超过限制"
        calls.append(now)
        self._call_counts[tool_name] = calls

        if perm.allowed_databases:
            db = context.get("database")
            if db and db not in perm.allowed_databases:
                return False, f"无权访问数据库: {db}"

        return True, ""

guard = PermissionGuard()
guard.register(ToolPermission("query_database", PermissionLevel.READ_ONLY, ["analytics"]))
guard.register(ToolPermission("delete_user", PermissionLevel.ADMIN))
guard.register(ToolPermission("write_log", PermissionLevel.READ_WRITE, rate_limit_per_minute=30))

ok, msg = guard.check("query_database", {"role": "viewer", "database": "analytics"})
print(f"查询数据库: {ok}, {msg}")

ok, msg = guard.check("delete_user", {"role": "viewer"})
print(f"删除用户: {ok}, {msg}")
```

### 6.4 审计日志

所有工具调用必须记录完整的审计日志，便于事后追溯和安全分析：

```python
import time
import hashlib
import json
from dataclasses import dataclass, field, asdict
from uuid import uuid4

@dataclass
class AuditEntry:
    entry_id: str = field(default_factory=lambda: str(uuid4()))
    timestamp: float = field(default_factory=time.time)
    tool_name: str = ""
    arguments: dict = field(default_factory=dict)
    result_status: str = "success"
    user_id: str = ""
    session_id: str = ""
    latency_ms: float = 0
    args_hash: str = ""

    def __post_init__(self):
        if not self.args_hash and self.arguments:
            self.args_hash = hashlib.sha256(
                json.dumps(self.arguments, sort_keys=True).encode()
            ).hexdigest()[:16]

class AuditLogger:
    def __init__(self):
        self._entries: list[AuditEntry] = []

    def log(self, entry: AuditEntry):
        self._entries.append(entry)

    def query(self, tool_name: str = None, user_id: str = None) -> list[AuditEntry]:
        results = self._entries
        if tool_name:
            results = [e for e in results if e.tool_name == tool_name]
        if user_id:
            results = [e for e in results if e.user_id == user_id]
        return results

class AuditedToolExecutor:
    def __init__(self, tools: dict[str, callable], audit_logger: AuditLogger):
        self.tools = tools
        self.audit = audit_logger

    def execute(self, tool_name: str, args: dict, context: dict) -> ToolResult:
        entry = AuditEntry(
            tool_name=tool_name,
            arguments=args,
            user_id=context.get("user_id", "unknown"),
            session_id=context.get("session_id", "unknown")
        )

        start = time.time()
        try:
            result = self.tools[tool_name](**args)
            entry.result_status = "success"
            entry.latency_ms = (time.time() - start) * 1000
            self.audit.log(entry)
            return ToolResult(True, result)
        except Exception as e:
            entry.result_status = f"error: {type(e).__name__}"
            entry.latency_ms = (time.time() - start) * 1000
            self.audit.log(entry)
            return ToolResult(False, {"error": str(e)})

logger = AuditLogger()
executor = AuditedToolExecutor(
    tools={"search": lambda query: {"results": []}},
    audit_logger=logger
)

executor.execute("search", {"query": "test"}, {"user_id": "u_001"})

for entry in logger.query():
    print(f"[{entry.tool_name}] {entry.result_status} ({entry.latency_ms:.1f}ms)")
```

### 6.5 Rate Limiting

每个工具应有独立的速率限制，防止被滥用或对下游系统造成过大压力：

```python
import time
from collections import defaultdict

class TokenBucketRateLimiter:
    def __init__(self):
        self._buckets: dict[str, dict] = {}

    def configure(self, tool_name: str, rate: int, capacity: int):
        self._buckets[tool_name] = {
            "rate": rate,
            "capacity": capacity,
            "tokens": capacity,
            "last_refill": time.time()
        }

    def allow(self, tool_name: str) -> bool:
        bucket = self._buckets.get(tool_name)
        if not bucket:
            return True

        now = time.time()
        elapsed = now - bucket["last_refill"]
        bucket["tokens"] = min(
            bucket["capacity"],
            bucket["tokens"] + elapsed * bucket["rate"]
        )
        bucket["last_refill"] = now

        if bucket["tokens"] >= 1:
            bucket["tokens"] -= 1
            return True
        return False

limiter = TokenBucketRateLimiter()
limiter.configure("external_api", rate=2, capacity=5)
limiter.configure("internal_db", rate=10, capacity=20)

for i in range(7):
    allowed = limiter.allow("external_api")
    print(f"请求 {i+1}: {'允许' if allowed else '限流'}")
```

---

## 7. 实战：多工具安全扫描 Agent

下面实现一个完整的安全扫描 Agent，整合 5 个工具和多种编排模式，展示生产级工具调用的工程实践。

```python
import json
import time
import asyncio
import hashlib
from dataclasses import dataclass, field
from typing import Any, Callable
from enum import Enum

class SeverityLevel(Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"

@dataclass
class ScanResult:
    tool_name: str
    status: str
    data: dict
    latency_ms: float = 0
    severity: SeverityLevel = SeverityLevel.INFO

@dataclass
class Vulnerability:
    cve_id: str
    severity: SeverityLevel
    description: str
    affected_component: str
    remediation: str

@dataclass
class ScanReport:
    target: str
    scan_time: str
    vulnerabilities: list[Vulnerability] = field(default_factory=list)
    dns_info: dict = field(default_factory=dict)
    open_ports: list[int] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)
    overall_risk: str = "unknown"

class SecurityScanAgent:
    def __init__(self):
        self.tools: dict[str, Callable] = {
            "cve_lookup": self._cve_lookup,
            "port_scan": self._port_scan,
            "dns_check": self._dns_check,
            "generate_report": self._generate_report,
            "alert_notification": self._alert_notification,
        }
        self.results: dict[str, ScanResult] = {}

    def _cve_lookup(self, software: str, version: str) -> dict:
        time.sleep(0.1)
        cve_db = {
            "nginx": [
                {"cve": "CVE-2024-24989", "severity": "high",
                 "desc": "HTTP/2 Rapid Reset 攻击", "fix": "升级至 1.25.4+"},
                {"cve": "CVE-2024-24990", "severity": "critical",
                 "desc": "HTTP/3 QUIC 内存越界", "fix": "升级至 1.25.5+"},
            ],
            "openssl": [
                {"cve": "CVE-2024-0727", "severity": "medium",
                 "desc": "PKCS12 解析空指针", "fix": "升级至 3.2.1+"},
            ]
        }
        vulns = cve_db.get(software.lower(), [])
        results = [
            Vulnerability(
                cve_id=v["cve"],
                severity=SeverityLevel(v["severity"]),
                description=v["desc"],
                affected_component=f"{software} {version}",
                remediation=v["fix"]
            ).__dict__ for v in vulns
        ]
        return {"software": software, "version": version, "vulnerabilities": results}

    def _port_scan(self, host: str, ports: list[int] = None) -> dict:
        time.sleep(0.05)
        simulated = {
            "22": {"service": "ssh", "state": "open", "risk": "medium"},
            "80": {"service": "http", "state": "open", "risk": "low"},
            "443": {"service": "https", "state": "open", "risk": "low"},
            "3306": {"service": "mysql", "state": "open", "risk": "high"},
            "6379": {"service": "redis", "state": "open", "risk": "critical"},
            "8080": {"service": "http-proxy", "state": "open", "risk": "medium"},
        }
        target_ports = ports or [22, 80, 443, 3306, 5432, 6379, 8080, 8443]
        open_ports = []
        for p in target_ports:
            port_str = str(p)
            if port_str in simulated:
                open_ports.append({
                    "port": p,
                    "service": simulated[port_str]["service"],
                    "state": simulated[port_str]["state"],
                    "risk": simulated[port_str]["risk"]
                })
        return {"host": host, "open_ports": open_ports}

    def _dns_check(self, domain: str) -> dict:
        time.sleep(0.05)
        return {
            "domain": domain,
            "has_spf": True,
            "has_dmarc": False,
            "has_mx": True,
            "dnssec_enabled": False,
            "warnings": [
                "缺少 DMARC 记录，存在邮件伪造风险",
                "未启用 DNSSEC"
            ]
        }

    def _generate_report(self, scan_data: dict) -> dict:
        vulns = scan_data.get("vulnerabilities", [])
        port_risks = scan_data.get("port_risks", [])
        dns_warnings = scan_data.get("dns_warnings", [])

        critical_count = sum(1 for v in vulns if v.get("severity") == "critical")
        high_count = sum(1 for v in vulns if v.get("severity") == "high")
        critical_ports = sum(1 for p in port_risks if p.get("risk") == "critical")

        if critical_count > 0 or critical_ports > 0:
            overall = "CRITICAL"
        elif high_count > 0:
            overall = "HIGH"
        else:
            overall = "MEDIUM"

        recommendations = []
        for v in vulns:
            recommendations.append(f"[{v['severity'].upper()}] {v['cve_id']}: {v['remediation']}")
        for p in port_risks:
            if p.get("risk") in ("critical", "high"):
                recommendations.append(
                    f"[PORT] 端口 {p['port']} ({p['service']}) 存在风险，建议关闭或加固"
                )
        for w in dns_warnings:
            recommendations.append(f"[DNS] {w}")

        return {
            "overall_risk": overall,
            "vulnerability_count": len(vulns),
            "open_port_count": len(port_risks),
            "recommendations": recommendations
        }

    def _alert_notification(self, alert_data: dict) -> dict:
        severity = alert_data.get("severity", "unknown")
        channels = []
        if severity in ("CRITICAL", "HIGH"):
            channels = ["pagerduty", "slack-security", "email"]
        else:
            channels = ["slack-security"]

        return {
            "alert_sent": True,
            "channels": channels,
            "severity": severity,
            "message": f"安全扫描发现 {severity} 级别风险"
        }

    async def _run_tool(self, name: str, **kwargs) -> ScanResult:
        start = time.time()
        try:
            func = self.tools[name]
            result = func(**kwargs)
            latency = (time.time() - start) * 1000
            severity = SeverityLevel.INFO

            if name == "cve_lookup":
                vulns = result.get("vulnerabilities", [])
                if vulns:
                    severity_order = [SeverityLevel.CRITICAL, SeverityLevel.HIGH,
                                      SeverityLevel.MEDIUM, SeverityLevel.LOW]
                    for s in severity_order:
                        if any(v.get("severity") == s.value for v in vulns):
                            severity = s
                            break

            return ScanResult(
                tool_name=name,
                status="success",
                data=result,
                latency_ms=latency,
                severity=severity
            )
        except Exception as e:
            latency = (time.time() - start) * 1000
            return ScanResult(
                tool_name=name,
                status=f"error: {e}",
                data={},
                latency_ms=latency
            )

    async def run_full_scan(self, target_domain: str) -> dict:
        print(f"[*] 开始对 {target_domain} 执行安全扫描...")
        scan_start = time.time()

        dns_result = await self._run_tool("dns_check", domain=target_domain)

        port_result = await self._run_tool("port_scan", host=target_domain)

        cve_tasks = [
            self._run_tool("cve_lookup", software="nginx", version="1.24.0"),
            self._run_tool("cve_lookup", software="openssl", version="3.1.0"),
        ]
        cve_results = await asyncio.gather(*cve_tasks)

        all_vulns = []
        port_risks = []
        for r in cve_results:
            if r.status == "success":
                all_vulns.extend(r.data.get("vulnerabilities", []))
        if port_result.status == "success":
            port_risks = [
                p for p in port_result.data.get("open_ports", [])
                if p.get("risk") in ("critical", "high")
            ]

        report_result = await self._run_tool(
            "generate_report",
            scan_data={
                "vulnerabilities": all_vulns,
                "port_risks": port_risks,
                "dns_warnings": dns_result.data.get("warnings", [])
            }
        )

        alert_result = None
        if report_result.status == "success":
            overall = report_result.data.get("overall_risk", "MEDIUM")
            if overall in ("CRITICAL", "HIGH"):
                alert_result = await self._run_tool(
                    "alert_notification",
                    alert_data={"severity": overall}
                )

        scan_duration = (time.time() - scan_start) * 1000

        report = {
            "target": target_domain,
            "scan_duration_ms": round(scan_duration, 2),
            "tools_executed": [
                {"name": r.tool_name, "status": r.status, "latency_ms": round(r.latency_ms, 2)}
                for r in [dns_result, port_result, *cve_results, report_result]
                + ([alert_result] if alert_result else [])
            ],
            "summary": report_result.data if report_result.status == "success" else {},
            "dns_info": dns_result.data,
            "open_ports": port_result.data.get("open_ports", []),
            "vulnerabilities": all_vulns,
        }

        print(f"[✓] 扫描完成，耗时 {scan_duration:.0f}ms")
        print(f"[!] 综合风险等级: {report['summary'].get('overall_risk', 'N/A')}")
        print(f"[!] 发现漏洞: {len(all_vulns)} 个")
        print(f"[!] 开放端口: {len(port_result.data.get('open_ports', []))} 个")
        print(f"[!] 安全建议: {len(report['summary'].get('recommendations', []))} 条")

        return report

async def main():
    agent = SecurityScanAgent()
    report = await agent.run_full_scan("example.com")

    print("\n" + "=" * 60)
    print("安全扫描报告")
    print("=" * 60)
    print(json.dumps(report, indent=2, ensure_ascii=False, default=str))

if __name__ == "__main__":
    asyncio.run(main())
```

这个实战案例展示了几个关键的工程原则：

1. **并行扫描**：DNS 检查与端口扫描可以并行执行，多个 CVE 查询也可以并行发起
2. **中间结果汇聚**：多个工具的输出汇总到 `generate_report` 工具中生成统一报告
3. **条件触发**：仅在发现高危风险时才触发告警通知
4. **完整可观测性**：每个工具调用都记录了执行状态和延迟

---

## 8. 延伸阅读

- [OpenAI Function Calling 官方文档](https://platform.openai.com/docs/guides/function-calling) — 最权威的 Function Calling 协议规范
- [Claude Tool Use 官方文档](https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview) — Claude 工具使用的完整指南
- [Anthropic Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Anthropic 关于 Agent 设计的深度实践文章
- [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs) — Structured Outputs 与 Strict Mode 详解
- [E2B - Code Sandboxing](https://e2b.dev/) — 面向 AI Agent 的云端代码沙箱服务
- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/) — LLM 应用安全风险清单
- [LangChain Tool Abstraction](https://python.langchain.com/docs/how_to/custom_tools/) — LangChain 中的自定义工具抽象
- [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) — Anthropic 推出的模型上下文协议，标准化工具接入方式
