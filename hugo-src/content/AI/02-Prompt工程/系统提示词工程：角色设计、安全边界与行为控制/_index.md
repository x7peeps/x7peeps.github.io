---
title: "系统提示词工程：角色设计、安全边界与行为控制"
weight: 2
tags: [System Prompt, 角色设计, 安全边界, Prompt Engineering]
menu: 
  main: 
    parent: "AIPrompt"
---

## System Prompt 在 LLM 交互中的地位

在 LLM 应用工程中，System Prompt（系统提示词）是最容易被低估、也最容易被滥用的组件。多数开发者将其视为"写一段指令让模型听话"，但从工程视角审视，System Prompt 实质上是**整个对话系统的运行时配置层**——它定义了模型的身份、能力边界、输出规范和安全策略，相当于一个 Agent 的"操作系统"。

### 优先级体系：消息角色的层级关系

在 OpenAI、Anthropic 等主流 API 的消息架构中，一次完整的对话包含三种消息角色：

```
┌──────────────────────────────────────────────────────────┐
│                    消息优先级金字塔                         │
│                                                          │
│              ┌─────────────────────┐                     │
│              │    System Message    │  ← 最高优先级        │
│              │   身份 / 规则 / 边界  │     行为的根约束     │
│              └──────────┬──────────┘                     │
│                         │                                │
│              ┌──────────▼──────────┐                     │
│              │    User Message     │  ← 任务驱动          │
│              │   任务 / 查询 / 输入  │     当前意图表达      │
│              └──────────┬──────────┘                     │
│                         │                                │
│              ┌──────────▼──────────┐                     │
│              │  Assistant Message  │  ← 输出与上下文       │
│              │   回复 / 推理 / 工具  │     影响后续生成      │
│              └─────────────────────┘                     │
└──────────────────────────────────────────────────────────┘
```

三种消息角色的交互遵循以下规则：

- **System Message** 设定全局行为准则，模型在整个对话过程中持续遵守。它是对话的"宪法"，其他消息不应与之矛盾
- **User Message** 代表用户的当前意图，是最直接的任务驱动信号
- **Assistant Message** 是模型自身的输出，在多轮对话中作为上下文被重新输入，影响后续生成

工程实践中需要特别注意：**这三者的优先级并非绝对隔离**。当 User Message 中的指令与 System Message 冲突时，模型的行为取决于具体模型的对齐策略。OpenAI 的文档明确指出，模型应当遵循 System Message，但在极端情况下（如 System Message 要求有害行为），模型的底层安全对齐会覆盖 System Prompt。Anthropic 同样声明，Claude 的安全训练优先级高于 System Prompt 中的任何指令。

### Token 预算分配

System Prompt 的长度直接影响可用上下文窗口。一个工程化的 System Prompt 设计必须考虑 token 预算：

```python
from openai import OpenAI

client = OpenAI()

model_context_window = {
    "gpt-4o": 128000,
    "gpt-4o-mini": 128000,
    "claude-3.5-sonnet": 200000,
    "claude-3.5-haiku": 200000,
}

def estimate_budget(system_prompt: str, model: str = "gpt-4o") -> dict:
    """粗略估算 token 预算分配（1 中文字符 ≈ 1.5-2 token）"""
    system_tokens = int(len(system_prompt) * 1.8)
    max_context = model_context_window.get(model, 128000)

    reserved_for_output = 4096
    available_for_conversation = max_context - system_tokens - reserved_for_output

    return {
        "system_prompt_tokens": system_tokens,
        "system_prompt_pct": f"{system_tokens / max_context * 100:.1f}%",
        "available_for_conversation": available_for_conversation,
        "available_pct": f"{available_for_conversation / max_context * 100:.1f}%",
        "max_output_tokens": reserved_for_output,
    }

budget = estimate_budget("你的系统提示词内容...")
```

**经验法则**：System Prompt 不应超过上下文窗口的 15%。超过此比例，模型对用户输入的注意力会被稀释，且多轮对话的可用空间被压缩。当 System Prompt 超过 2000 token 时，应考虑将其拆分为核心指令（始终加载）和扩展指令（按需加载）。

---

## 角色定义三要素

角色定义是 System Prompt 最核心的功能。一个精确的角色定义包含三个维度：身份（Identity）、专业能力（Expertise）和行为模式（Behavior）。三者缺一不可——没有身份，模型不知道"谁在说话"；没有专业能力，模型不知道"能说什么"；没有行为模式，模型不知道"怎么说"。

### 三要素模型

```
┌─────────────────────────────────────────────────┐
│                 角色定义三要素                      │
│                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │
│  │  Identity    │  │  Expertise  │  │  Behavior │ │
│  │  身份定义    │  │  专业能力    │  │  行为模式  │ │
│  │             │  │             │  │           │ │
│  │ 你是谁      │  │ 你知道什么   │  │ 你怎么做   │ │
│  │ 你的职责    │  │ 你的专长领域  │  │ 你的风格   │ │
│  │ 你的限制    │  │ 你的知识边界  │  │ 你的原则   │ │
│  └─────────────┘  └─────────────┘  └───────────┘ │
│                                                   │
│  决定回答视角  →  决定内容深度  →  决定表达方式     │
└─────────────────────────────────────────────────┘
```

### 要素一：Identity（身份定义）

身份定义回答"你是谁"的问题。它不仅仅是一个标签，而是整个行为模式的锚点。

```python
