---
title: "Structured Output 与 JSON Mode：大模型结构化输出技术全景"
weight: 6
tags: [Structured Output, JSON Mode, Constrained Decoding, JSON Schema, Pydantic, Zod]
menu:
  main:
    parent: "AI实战"
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
        