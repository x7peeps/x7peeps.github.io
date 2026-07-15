---
title: "Structured Output 与 JSON Mode：大模型结构化输出技术全景"
weight: 6
tags: [Structured Output, JSON Mode, Constrained Decoding, JSON Schema, Pydantic, Zod]
menu:
  main:
    parent: "AI工程化"
---

# Structured Output 与 JSON Mode：大模型结构化输出技术全景

LLM 生成的是自然语言文本，而现代软件系统需要的是结构化数据。当模型输出成为下游系统的输入时，格式的不确定性就从"可以忍受的小问题"变成了"让整条数据管线崩溃的大问题"。一个多余的逗号、一个缺失的字段、一个被 markdown 代码块包裹的 JSON 字符串——这些在 Prompt Engineering 时代被反复容忍的"小瑕疵"，在生产环境中可能意味着数据丢失、解析失败甚至业务逻辑错误。

> 2024 年 OpenAI 首次推出 Structured Outputs，2025 年底 Anthropic Claude 正式跟进，2026 年几乎所有主流厂商都已将结构化输出作为 API 级别的基础能力。**这不是一个可选的增强特性，而是 AI 工程化的基础设施。**

本文将系统梳理结构化输出的技术演进、三大云厂商的实现方案、底层约束解码（Constrained Decoding）原理、开源框架生态对比，以及国内大模型的支持现状，帮助你在技术选型中做出有依据的决策。

---

## 1. 从 Prompt 到 API 级约束：技术演进脉络

结构化输出的演进经历了四个阶段，每个阶段都在解决上一个阶段的核心痛点。

### 1.1 四个阶段

| 阶段 | 方式 | 保证 | 痛点 |
| :--- | :--- | :--- | :--- |
| **纯 Prompt** | 在提示词中要求模型输出 JSON | 无任何保证 | 模型可能返回 markdown 包裹、多余文字、格式错误 |
| **JSON Mode** | API 参数 `response_format: "json_object"` | 保证输出是合法 JSON | 不保证符合特定 Schema，字段可能缺失或多余 |
| **JSON Schema（Strict）** | `response_format: { type: "json_schema", schema: {...} }` | 保证输出严格匹配 Schema | 仅部分厂商支持，复杂 Schema 可能有限制 |
| **SDK 原生类型** | Pydantic / Zod 直接定义，SDK 自动转换 | 类型安全 + 100% Schema 合规 | 需要升级到最新版 SDK |

### 1.2 JSON Mode 与 Structured Output 的本质区别

**JSON Mode 只解决语法问题**——确保输出是合法的 JSON 字符串，但不约束内容结构。你可能得到一个空对象 `{}`，或者缺少关键字段的 JSON。

**Structured Output 解决语义问题**——在 JSON 语法正确的基础上，严格保证每个字段的存在性、类型正确性和枚举值合法性。OpenAI 在评测中，gpt-4o 配合 Structured Outputs 在复杂 JSON Schema 遵循度上达到 **100%**，而 gpt-4-0613 不到 40%。

> **实际建议**：到 2026 年，JSON Mode（`type: "json_object"`）已被视为"legacy"模式。如果你的场景需要可靠的字段保证，应直接使用 Structured Output 的 JSON Schema 模式。

---

## 2. 三大云厂商方案对比

### 2.1 OpenAI：Structured Outputs

OpenAI 是结构化输出的先行者，2024 年 8 月随 gpt-4o-2024-08-06 正式推出。其核心特点是支持两种入口：

- **Function Calling**：定义工具的参数 Schema，模型调用工具时保证参数合规
- **response_format**：定义输出 Schema，模型直接返回符合 Schema 的 JSON

**Python 示例（Pydantic）**：

```python
from pydantic import BaseModel
from openai import OpenAI

class CalendarEvent(BaseModel):
    name: str
    date: str
    participants: list[str]

client = OpenAI()
completion = client.chat.completions.parse(
    model="gpt-4o-2024-08-06",
    messages=[
        {"role": "system", "content": "Extract the event information."},
        {"role": "user", "content": "Alice and Bob are going to a science fair on Friday."},
    ],
    response_format=CalendarEvent,
)

event = completion.choices[0].message.parsed
print(event.name, event.date, event.participants)
```

**TypeScript 示例（Zod）**：

```typescript
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

const CalendarEvent = z.object({
  name: z.string(),
  date: z.string(),
  participants: z.array(z.string()),
});

const openai = new OpenAI();
const completion = await openai.chat.completions.parse({
  model: "gpt-4o-2024-08-06",
  messages: [
    { role: "system", content: "Extract the event information." },
    { role: "user", content: "Alice and Bob are going to a science fair on Friday." },
  ],
  response_format: zodResponseFormat(CalendarEvent, "event"),
});

const event = completion.choices[0].message.parsed;
```

**关键特性**：
- 支持 `strict: true` 模式，使用 CFG（Context-Free Grammar）引擎在 token 生成层面屏蔽非法 token
- 支持 Pydantic 和 Zod 原生类型定义，SDK 自动转换为 JSON Schema
- 支持流式输出（Streaming），中间 chunk 不是合法 JSON，但最终拼接结果保证合规
- 处理模型拒绝时会返回 `message.refusal`，需作为**一等错误**处理

### 2.2 Anthropic Claude：output_config.format

Anthropic 于 2025 年 11 月以 Public Beta 形式推出 Structured Output，2026 年初进入 GA。API 设计上有两个独特之处：

- 使用 `output_config.format` 参数（而非 `response_format`）
- 同时提供 **JSON Outputs** 和 **Strict Tool Use** 两种模式

**Python 示例**：

```python
from anthropic import Anthropic

client = Anthropic()

response = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "Extract key info from: John Smith (john@example.com) wants Enterprise plan demo next Tuesday."}
    ],
    output_config={
        "format": {
            "type": "json_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "email": {"type": "string"},
                    "plan_interest": {"type": "string"},
                    "demo_requested": {"type": "boolean"},
                },
                "required": ["name", "email", "plan_interest", "demo_requested"],
                "additionalProperties": False,
            },
        }
    },
)

print(response.content[0].text)
```

**使用 Pydantic 的简洁方式**：

```python
from pydantic import BaseModel
from anthropic import Anthropic

class ContactInfo(BaseModel):
    name: str
    email: str
    plan_interest: str
    demo_requested: bool

client = Anthropic()
response = client.messages.parse(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Extract contact info from the email above."}],
    output_format=ContactInfo,
)

print(response.parsed_output)
```

**关键特性**：
- Schema 编译后缓存 24 小时，重复使用同一 Schema 无额外编译开销
- 底层使用 **Grammar-Constrained Sampling**，在 token 生成层面强制约束
- 支持 Claude Sonnet 4.5、Opus 4.5、Haiku 4.5 及更新模型
- 支持 Zero Data Retention（ZDR），适合对数据合规要求严格的场景

### 2.3 Google Gemini：response_schema

Google Gemini 通过 `response_schema` 参数支持结构化输出，同时在 Vertex AI 上也可使用。其独特之处在于支持更丰富的类型表达，包括 `SchemaType.OBJECT`、`SchemaType.ARRAY`、`SchemaType.ENUM` 等。

**Python 示例**：

```python
import google.generativeai as genai

def get_structured_data():
    model = genai.GenerativeModel("gemini-2.0-flash")

    response = model.generate_content(
        "Extract: Alice loves hiking and photography",
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "hobbies": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["name", "hobbies"],
            },
        ),
    )
    print(response.text)

get_structured_data()
```

### 2.4 三家方案横向对比

| 维度 | OpenAI | Anthropic Claude | Google Gemini |
| :--- | :--- | :--- | :--- |
| **推出时间** | 2024-08 | 2025-11 (Beta)，2026 GA | 2024 |
| **API 参数** | `response_format` | `output_config.format` | `response_schema` |
| **Schema 类型** | JSON Schema | JSON Schema | JSON Schema / 自有 Schema |
| **SDK 原生类型** | Pydantic + Zod | Pydantic | Pydantic + 自有类型 |
| **Strict Tool Use** | `strict: true` | `strict: true` | 不适用 |
| **流式支持** | ✅ | ✅ | ✅ |
| **拒绝检测** | `message.refusal` | `stop_reason` | `finish_reason` |
| **模型要求** | gpt-4o 系列及以上 | Sonnet 4.5 / Opus 4.5+ | gemini-1.5-pro/flash+ |
| **底层机制** | CFG Engine | Grammar-Constrained Sampling | Constrained Decoding |

---

## 3. 约束解码：Structured Output 的底层原理

Structured Output 之所以能保证 100% Schema 合规，核心在于**约束解码（Constrained Decoding）**——在模型生成每个 token 的过程中，动态屏蔽不合法的 token，只允许从合法 token 集合中采样。

### 3.1 工作流程

```
┌──────────────────────────────────────────────────────┐
│              约束解码核心流程                           │
│                                                      │
│  1. Schema 编译                                       │
│     JSON Schema ──→ Context-Free Grammar (CFG)        │
│                                                      │
│  2. 逐 Token 约束                                     │
│  ┌────────────┐    ┌─────────────┐    ┌──────────┐  │
│  │ LLM 生成   │    │ 计算合法     │    │ 掩码过滤 │  │
│  │ 概率分布    │──→│ Token 集合   │──→│ 采样     │  │
│  │ (vocab)    │    │ (mask)      │    │ 输出     │  │
│  └────────────┘    └─────────────┘    └──────────┘  │
│                                                      │
│  3. 拼接已生成的 token，更新 CFG 状态                   │
│  4. 重复 2-3 直到生成结束标记                           │
└──────────────────────────────────────────────────────┘
```

### 3.2 核心概念

**Token Mask（Token 掩码）**：对于当前 CFG 状态，计算出所有"在语法上合法"的下一个 token 集合。将不在集合中的 token 的概率置零，确保模型**在物理上无法生成非法输出**。

**CFG 编译**：将 JSON Schema 编译为上下文无关文法（Context-Free Grammar）。这一步是可缓存的——同一 Schema 只需编译一次，后续请求直接复用。

> **关键洞察**：约束解码不是"后处理验证 + 重试"，而是在**生成层面**消除了不合规的可能性。这类似于编译器的类型检查——错误在编译期就被捕获，而不是在运行时。

### 3.3 性能影响

一个常见的误解是约束解码会显著降低生成速度。实际上：

- **计算 Mask 的开销极低**：Guidance 库的 LLGuidance 引擎，单次 Mask 计算仅需约 **50μs**（128k 词表），可以与 GPU 推理并行执行
- **搜索空间缩小反而可能加速**：由于裁剪了大量非法 token，模型不需要在无效路径上浪费计算
- JSONSchemaBench 评测显示，Guidance 框架的 TPOT（Time Per Output Token）比无约束生成甚至**更快**

---

## 4. 开源约束解码框架生态

当你使用自部署模型（vLLM、llama.cpp、SGLang）时，需要依赖开源约束解码框架来实现 Structured Output。

### 4.1 主流框架对比

| 框架 | 实现语言 | 核心算法 | 性能特点 | 适用场景 |
| :--- | :--- | :--- | :--- | :--- |
| **Guidance (LLGuidance)** | Rust + Python | 惰性 Lexer + CFG | 速度最快，JSONSchemaBench 综合第一 | 通用场景，多 Schema 切换 |
| **XGrammar** | C++ | 显式栈解析 + 预计算 | vLLM/SGLang 默认后端，吞吐量高 | 高吞吐在线服务 |
| **Outlines** | Python (outlines-core Rust) | 自动机预计算 | Pydantic 友好，复杂 Schema 编译较慢 | 快速原型，Schema 复杂度低 |
| **llama.cpp Grammar** | C++ | 回溯解析器 | 内置于 llama.cpp，无 Lexer | 轻量本地推理 |
| **lm-format-enforcer** | Python | Python re 模块 | 简单易用，性能一般 | Python 生态快速集成 |

### 4.2 JSONSchemaBench 关键结论

Microsoft 与 EPFL 联合发布的 JSONSchemaBench 使用 **10,000 个真实世界 JSON Schema** 进行评测，核心发现：

- **Guidance** 在速度、Schema 覆盖度和输出质量三个维度均排名第一
- **XGrammar** 成为 vLLM、SGLang、TensorRT-LLM、MLC-LLM 的默认后端，厂商宣称吞吐量提升达 100 倍
- **Outlines** 在复杂 Schema 上因编译超时导致合规率下降
- 约束解码在大多数场景下比无约束生成**更快**而非更慢

### 4.3 vLLM 中的实践

vLLM 是目前最流行的开源推理引擎之一，内置 Structured Output 支持：

```python
from openai import OpenAI
from pydantic import BaseModel

class SentimentResult(BaseModel):
    sentiment: str
    confidence: float
    keywords: list[str]

client = OpenAI(base_url="http://localhost:8000/v1", api_key="not-needed")

# 方式一：直接使用 JSON Schema
completion = client.chat.completions.create(
    model="Qwen/Qwen2.5-7B-Instruct",
    messages=[{"role": "user", "content": "Analyze sentiment: vLLM is wonderful!"}],
    extra_body={"response_format": SentimentResult},
)

# 方式二：使用枚举约束
completion = client.chat.completions.create(
    model="Qwen/Qwen2.5-7B-Instruct",
    messages=[{"role": "user", "content": "Classify sentiment: This movie is great!"}],
    extra_body={"structured_outputs": {"choice": ["positive", "negative", "neutral"]}},
)

# 方式三：使用正则表达式约束
completion = client.chat.completions.create(
    model="Qwen/Qwen2.5-7B-Instruct",
    messages=[{"role": "user", "content": "Generate an email for Alan Turing"}],
    extra_body={"structured_outputs": {"regex": r"\w+@\w+\.com"}},
)

# 方式四：使用 EBNF 语法约束（如生成 SQL）
sql_grammar = """
root ::= select_statement
select_statement ::= "SELECT " column " FROM " table " WHERE " condition
column ::= "name" | "email" | "age"
table ::= "users" | "orders"
condition ::= column "= " number
number ::= "1" | "2" | "3"
"""
completion = client.chat.completions.create(
    model="Qwen/Qwen2.5-7B-Instruct",
    messages=[{"role": "user", "content": "Generate SQL query"}],
    extra_body={"structured_outputs": {"grammar": sql_grammar}},
)
```

---

## 5. 国内大模型支持现状

国内厂商的结构化输出支持分为两层：**API 级别的 JSON Mode** 和**推理引擎级别的约束解码**。

### 5.1 API 原生支持

| 厂商 | 模型 | JSON Mode | JSON Schema (Strict) | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| **阿里云百炼** | Qwen3-Max / Plus / Flash 系列 | ✅ | ❌ | 需提示词含"JSON"关键词 |
| **DeepSeek** | V3 / V4 系列 | ✅ | ❌ | 通过 OpenAI 兼容接口使用 |
| **智谱 AI** | GLM-5 / 4.7 / 4.6 | ✅ | ❌ | 非思考模式支持 |
| **字节豆包** | doubao 系列 | ✅ | ✅ | 火山引擎部署，支持 Schema 约束 |
| **月之暗面** | Kimi-K2 | ✅ | ❌ | thinking 模式暂不支持 |

### 5.2 自部署方案

对于自部署场景，可通过 vLLM + 约束解码框架获得完整的 Structured Output 能力：

```python
from vllm import LLM, SamplingParams
from vllm.sampling_params import StructuredOutputsParams

llm = LLM(model="Qwen/Qwen2.5-7B-Instruct")

params = SamplingParams(
    structured_outputs=StructuredOutputsParams(
        json={
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "age": {"type": "integer"},
            },
            "required": ["name", "age"],
        }
    )
)

outputs = llm.generate(
    prompts="Extract: My name is Alice and I am 30 years old.",
    sampling_params=params,
)
print(outputs[0].outputs[0].text)
```

### 5.3 思考模式的兼容问题

> **⚠️ 注意**：截至 2026 年中，几乎所有厂商的**思考模式（Thinking Mode）与结构化输出不兼容**。这包括 OpenAI 的 o 系列、Anthropic 的 extended thinking、Qwen 的思考模式等。如果需要同时使用推理增强和结构化输出，常见的做法是**两步法**：先调用思考模型获取高质量推理结果，再调用支持 Structured Output 的模型进行格式化输出。

---

## 6. 工程实践：Schema 设计与最佳实践

### 6.1 Schema 设计原则

**保持 Schema 精简**：每个字段都应该驱动一个决策、一次数据存储或一次 UI 渲染。不要因为"可能有用"就添加字段。

**善用枚举（Enum）**：如果某个字段会触发分支逻辑，使用 enum 而非 string。这不仅消除"创意值"（如 `"urgent (please help!)"`），还让下游代码更安全。

**为字段添加描述**：`description` 字段不仅帮助模型理解语义，在自动生成 API 文档时也非常有价值。

```json
{
  "type": "object",
  "properties": {
    "priority": {
      "type": "string",
      "enum": ["low", "medium", "high", "critical"],
      "description": "Issue priority level for routing"
    },
    "confidence": {
      "type": "number",
      "minimum": 0.0,
      "maximum": 1.0,
      "description": "Model confidence score"
    }
  },
  "required": ["priority", "confidence"],
  "additionalProperties": false
}
```

### 6.2 与 Pydantic 的集成模式

在 Python 工程实践中，推荐将 Schema 定义与业务逻辑分离：

```python
from pydantic import BaseModel, Field
from enum import Enum

class Priority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class IssueAnalysis(BaseModel):
    title: str = Field(description="Brief issue title")
    priority: Priority
    confidence: float = Field(ge=0.0, le=1.0)
    summary: str = Field(max_length=500)
    requires_human: bool

# 直接传给 OpenAI
from openai import OpenAI
client = OpenAI()

completion = client.chat.completions.parse(
    model="gpt-4o",
    messages=[...],
    response_format=IssueAnalysis,
)

result = completion.choices[0].message.parsed
# result 是 IssueAnalysis 类型，字段保证存在且类型正确
```

### 6.3 错误处理三要素

**1. 检查拒绝响应**：模型可能因为安全原因拒绝生成，此时返回的是 refusal 而非 JSON。

**2. 处理截断**：当 Schema 复杂且 `max_tokens` 不足时，JSON 可能被截断。建议在 Schema 设计时预估 token 需求。

**3. 后端校验不能省**：即使 API 保证格式合规，**内容的语义正确性仍需验证**。模型可以生成格式完美但内容完全错误的 JSON。

```python
try:
    completion = client.chat.completions.parse(
        model="gpt-4o",
        messages=[...],
        response_format=IssueAnalysis,
    )

    result = completion.choices[0].message.parsed
    if result is None:
        print("Model refused or output was truncated")
    else:
        # 业务逻辑校验
        assert result.confidence > 0.5, "Low confidence, needs review"

except Exception as e:
    print(f"Structured output failed: {e}")
```

### 6.4 流式输出的注意事项

Structured Output 支持流式传输，但有一个关键区别：**中间 chunk 不是合法 JSON**。你不能对每个 chunk 做 JSON 解析，而必须等待所有 chunk 拼接完成后再解析。大多数 SDK（openai、anthropic）已经内置了这个逻辑。

---

## 7. 总结与展望

- **Structured Output 已从可选特性变为 AI 工程化的基础设施**——到 2026 年，三大云厂商均已 GA，开源推理引擎全面支持，JSON Mode 已是 legacy 模式

- **底层约束解码（Constrained Decoding）不是性能瓶颈，反而是加速器**——Guidance 和 XGrammar 的实测数据证明，语法约束缩小搜索空间后，生成速度可能比无约束更快

- **Schema-First 开发模式已成为标准实践**——先用 Pydantic/Zod 定义数据结构，再构建 Prompt，最后集成到业务流程。这与传统 API 开发中"先定义接口再实现"的思路一脉相承

- **思考模式与结构化输出的兼容性是当前最大的工程痛点**——两步法是临时方案，未来厂商大概率会推出原生兼容方案

- **自部署模型通过 vLLM + XGrammar/Guidance 可获得与商业 API 同等的结构化输出能力**，在数据隐私和成本控制上有天然优势

> 展望未来，结构化输出正在向**多模态**方向扩展——从文本到图像、表格、文档的结构化提取已经在 GPT-5 和 Claude Opus 4.7 中落地。同时，**MCP（Model Context Protocol）规范要求工具服务器返回符合 output schema 的结构化结果**，这正在将 Structured Output 从"模型侧约束"推向"全链路类型系统"的高度。

## 参考资源

- [OpenAI Structured Outputs 官方文档](https://developers.openai.com/api/docs/guides/structured-outputs) — OpenAI 完整的结构化输出指南，含 Pydantic/Zod 集成
- [Anthropic Structured Outputs 官方文档](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — Claude 的 JSON Outputs 和 Strict Tool Use 文档
- [JSONSchemaBench 论文（arXiv:2501.10868）](https://arxiv.org/html/2501.10868v1) — Microsoft & EPFL 联合发布的约束解码框架评测，10K 真实 Schema
- [LLGuidance（Guidance AI）](https://github.com/guidance-ai/llguidance) — 最快的约束解码 Rust 引擎，OpenAI 内部使用
- [XGrammar](https://github.com/mlc-ai/xgrammar) — vLLM/SGLang 默认约束解码后端
- [vLLM Structured Outputs 文档](https://docs.vllm.ai/en/latest/features/structured_outputs/) — 自部署场景下的结构化输出完整指南
- [阿里云百炼 JSON Mode 文档](https://help.aliyun.com/zh/model-studio/json-mode) — 国内大模型 JSON Mode 使用指南
- [Structured Outputs in LLMs（Collin Wilkins）](https://collinwilkins.com/articles/structured-output) — 2026 年更新的厂商横向对比与工程实践总结
