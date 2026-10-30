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
            "type": "json_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "email": {"type": "string"},
                    "plan": {"type": "string", "enum": ["Basic", "Pro", "Enterprise"]},
                    "meeting_date": {"type": "string", "description": "ISO 8601 日期"}
                },
                "required": ["name", "email", "plan"],
                "additionalProperties": False
            }
        }
    }
)

data = json.loads(response.content[0].text)
```

**Anthropic 方案的三个注意点**：

- `max_tokens` 必须给足。Structured Output 与思考模式（extended thinking）共用输出预算时，预算过小会导致 JSON 被从中间截断，得到非法字符串——**这是新手最常见的失败原因，且报错点在解析层而不是 API 层，很难一眼看出**
- 严格模式要求 schema 覆盖所有字段（`additionalProperties: false` 与完整 `required`），越界内容不会被生成而不是事后被删
- 与 Tool Use 的 **Strict Tool Use** 共享同一套约束机制：把 schema 绑定到工具入参，让模型的工具调用参数变成可解析保证

### 2.3 Google Gemini 与自托管栈

Gemini 侧通过 `generationConfig.responseSchema` + `responseMimeType: application/json` 提供 schema 约束，特点是**对 schema 复杂度的容忍度较低**（深层嵌套、大量 `anyOf` 常被拒），且枚举与稀疏字段的支持与 OpenAI 存在细节差异。

自托管栈的对应能力是 **Guided / Constrained Decoding**：vLLM 的 `guided_decoding`（含 `xgrammar` / `outlines` 后端）、SGLang 的结构化输出、llama.cpp 的 GBNF grammar、TensorRT-LLM 的 guided decoding。它们让开源模型也能拿到"格式确定"的输出，代价是**每 token 的 mask 开销**——grammar 复杂时解码吞吐会明显下降，实测降幅从几个点到数十个点不等。

---

## 3. 底层原理：约束解码如何做到"保证合法"

理解机制才能判断能力边界。约束解码的标准流程：

1. **Schema → 形式文法**：JSON Schema 编译成下推自动栈（token-level grammar）。JSON 的递归结构与上下文无关文法对应，栈式自动机足以描述
2. **每步 token mask**：在解码每个位置，用当前自动机状态计算"哪些 token 不会让序列走进非法前缀"，把其余 token 的概率置零
3. **采样/贪心在剩余合法集合内进行**：因此输出在语法上必然合法

**为什么这比"Prompt 里强调格式"强**：Prompt 约束只影响概率分布，模型仍可能吐出 `Sure, here's...` 或少一个右括号；约束解码从数学上排除了这些轨迹。

三个必须知道的限制：

- **语法合法 ≠ 语义正确**。约束能保证 `email` 是字符串且必填，不能保证抽取出的邮箱是对的。`format: email` 一类字段各家实现松紧不一，**不要指望 schema 校验等于数据校验**
- **约束与采样器会互相干扰**。`presence_penalty` / `frequency_penalty` 改变分布会破坏前缀概率一致性，多数实现会静默关闭这些参数或降低约束严格度。强制贪心采样在部分场景会导致答案质量下降
- **复杂 schema 会退化性能**。深层嵌套 + 大量 `oneOf` 让自动机状态数膨胀，mask 计算变慢；工程上应当**拆平 schema**（拆成多次输出、扁平结构、`const` 枚举）而不是硬堆深度

---

## 4. 框架生态对比

| 框架 | 定位 | 强项 | 取舍 |
| :--- | :--- | :--- | :--- |
| **Pydantic-AI** | 类型优先的 Agent 框架 | Pydantic 模型即输出契约，校验失败自动重试 | 依赖厂商 API 支持程度 |
| **Instructor** | 让任意 LLM 输出 Pydantic 对象 | 生态最广、重试/纠错成熟、支持本地模型 | 早期靠 prompt+重试，非硬约束 |
| **BAML** | Schema-first 的 LLM 函数编排 | 多语言（Python/TS）、类型生成、跨厂商一致 | 引入独立 DSL 与编译器 |
| **Zod / zod-to-json-schema** | TS 侧类型→schema | 前端/Node 全栈类型贯通 | 需自建运行时校验层 |
| **Outlines / XGrammar** | 本地推理的约束解码引擎 | 语法级保证、无 API 依赖 | 只在自托管栈可用 |
| **OpenAI Agents SDK / LangChain** | 编排框架 | 已内建 structured output 透传 | 抽象层会遮蔽底层差异 |

**一个关键区分**：Instructor 一类的"重试式"方案与厂商原生的"约束式"方案不是同一保证等级。前者是"错了就再问一次"（最终有效率高但不是 100%），后者是解码期排除非法轨迹（语法上 100%）。对**输出直接进数据库或触发不可逆动作**的链路，只该用约束式；对探索性生成，重试式更灵活且不受 schema 复杂度限制。

---

## 5. 国内大模型支持现状

各家在 2025-2026 年基本都补齐了 JSON Schema 能力，但差异集中在三处：**支持深度、参数命名、失败语义**。

| 厂商方向 | 支持形态 | 实战注意点 |
| :--- | :--- | :--- |
| 通义千问 / DashScope | `response_format` + json_schema；OpenAI 兼容模式 | 兼容模式与原生 SDK 的字段名/严格度不同；思考模式与结构化输出混用时要重算输出预算 |
| DeepSeek | JSON 输出 + tool_calls | tool_calls 作为事实上的结构化通道，参数级校验仍需自装 |
| 智谱 GLM | 函数调用 / json | 长 schema 支持不完整，需简化 |
| Kimi / Moonshot | tool calling + json | 长上下文场景下 schema 与检索拼装顺序要注意 |
| 豆包 / 火山方舟 | response_format + Function calling | 需确认 API 版本 |
| 开源栈（Qwen、GLM、DeepSeek 权重） | vLLM/SGLang guided decoding | 前缀缓存与约束解码同时开启时吞吐会波动 |

**迁移建议**：写一层自己的 schema 归一化（把业务 Pydantic 模型 → 各家请求体 + 各家错误码 → 统一异常类型），不要让厂商差异渗进业务代码。跨厂商的 schema 兼容性差异是真实存在的，任何"看起来标准"的多租户功能，都需要在每个厂商各跑一遍同一评测集。

---

## 6. 工程陷阱清单

上线前逐项对照：

- [ ] **输出预算**：`max_tokens` 是否覆盖最坏情况（长数组、多条目）？截断的 JSON 有检测与处理路径吗？
- [ ] **空值语义**：字段缺失、`null`、空字符串三者含义是否约定？是否用 `required` + `enum` 消除了歧义？
- [ ] **数字与日期**：LLM 习惯把日期写成自然语言、把数字写成带单位的字符串。schema 里明确 `format` 与正则，并在应用层二次校验
- [ ] **动态字段**：字段名由模型决定（`additionalProperties: true`）是约束最弱的形态，尽量改成 `array of {key, value}`
- [ ] **深层嵌套**：超过 3 层的嵌套考虑拆成两次调用，减少 schema 编译开销与模型走偏概率
- [ ] **枚举纪律**：能枚举就枚举，把自由文本字段压到最小——枚举同时提升准确率与缓存命中
- [ ] **思考模式共存**：extended thinking / reasoning 与结构化输出共存时预算、解析、延迟都会变，必须单独评测
- [ ] **本地修复兜底**：即使有硬约束，仍保留"剥离 ``` 包裹 + 截取首尾花括号"的容错解析，防止 SDK 版本差异或历史数据
- [ ] **可观测**：解析失败率、约束触发率、重试次数纳入监控；schema 变更走版本化，保留旧 schema 的回放能力
- [ ] **安全**：结构化输出不是安全边界。约束只保证格式，字段值仍可能注入下游系统，落库前必须独立校验与参数化

---

## 7. 结语

Structured Output 的意义不在"少写一个 JSON 解析函数"，而在于它**把 LLM 从"文本生成器"变成了"可编排的数据生产者"**——一旦输出格式变成 API 级保证，模型就能安全地插进数据库写入、工作流路由、下游函数调用这些原本只接受结构化数据的环节。

技术选型的判断可以收敛成三句话：**能用厂商原生约束解码就不要靠 Prompt 描述格式；能用扁平 schema 就不要上深层嵌套；schema 之外仍需一层独立的数据校验**（约束管语法，业务规则管语义）。做到这三条，结构化输出的可靠性问题基本消失，剩下的都是模型"抽取错内容"的问题——而那属于另一个话题：模型能力与评测。

（数据来源说明：本文为公开资料与技术方法整理，涉及的性能、比例与厂商能力描述以各官方文档与公开报告为准，具体数值会随版本变化；未在自有环境逐项复测的数据均以'约/通常/实践区间'表述。）

本文面向授权安全研究与防御建设，未经授权对任何系统实施文中技术属违法行为。
