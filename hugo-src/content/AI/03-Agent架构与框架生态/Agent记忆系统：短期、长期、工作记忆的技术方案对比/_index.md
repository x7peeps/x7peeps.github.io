---
title: "Agent 记忆系统：短期/长期/工作记忆的技术方案对比"
weight: 3
tags: [Agent, Memory, 向量数据库, 对话历史, 技术方案]
menu: 
  main: 
    parent: "AIagent"
---

## 一、为什么 Agent 需要记忆

### 1.1 从无状态到有状态的范式跃迁

大语言模型（LLM）本质上是一个无状态的函数：每次调用传入一段文本，返回一段文本。模型本身不保留任何跨调用的上下文。这意味着，当你对 ChatGPT 说"我叫张三"，下一次对话它并不记得你。

这种无状态特性在简单的问答场景中尚可接受，但一旦进入 **Agent** 的领地，问题就变得尖锐。Agent 需要在多轮交互中维持目标一致性、在多步任务中追踪中间结果、在长时间运行中积累领域知识。没有记忆的 Agent，就像一个每次见面都失忆的助手——你不得不每次都从头交代所有背景。

### 1.2 Context Window 的局限性

一种直觉上的解决方案是把所有历史塞进 context window。但这个思路在生产环境中会迅速碰壁：

- **Token 预算有限**：GPT-4 Turbo 的 128K context window 看起来很大，但一个复杂的 Agent 会话轻松产生数十万 token 的交互历史
- **成本线性增长**：每次调用都需要处理完整的历史，API 费用与历史长度成正比
- **注意力退化**：即使 context window 能装下，模型对中间位置信息的关注度会显著下降（"lost in the middle" 现象）
- **检索效率低下**：在海量历史中定位关键信息，LLM 的能力远不如专用的检索系统

### 1.3 记忆作为 Agent 的核心能力

人类认知科学研究表明，人类记忆可以分为三种类型：**短期记忆**（感官缓冲）、**长期记忆**（持久知识）和 **工作记忆**（当前任务的加工空间）。Agent 的记忆系统设计直接借鉴了这一认知模型。一个完整的 Agent 记忆架构通常包含以下层次：

```
┌──────────────────────────────────────────────────────────┐
│                    Agent 记忆系统架构                       │
│                                                          │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────┐  │
│  │   短期记忆      │  │   工作记忆      │  │  长期记忆   │  │
│  │ Short-term     │  │ Working Memory │  │ Long-term  │  │
│  │                │  │                │  │            │  │
│  │ · 对话历史     │  │ · 任务中间状态  │  │ · 用户画像  │  │
│  │ · 滑动窗口     │  │ · Scratchpad   │  │ · 领域知识  │  │
│  │ · 摘要压缩     │  │ · 状态机       │  │ · 历史经验  │  │
│  └────────┬───────┘  └───────┬────────┘  └─────┬──────┘  │
│           │                  │                  │         │
│           └──────────┬───────┴──────────────────┘         │
│                      ▼                                   │
│              ┌───────────────┐                            │
│              │   记忆检索层   │                            │
│              │ Memory Router │                            │
│              └───────────────┘                            │
└──────────────────────────────────────────────────────────┘
```

---

## 二、短期记忆（Short-term Memory）

短期记忆的核心是**对话历史管理**——在有限的 token 预算内，最大化保留对当前对话最有价值的信息。

### 2.1 三种主流策略

#### 策略一：全量保留（Full History）

最简单的方案：将所有历史消息原样保留，每次都传入完整对话。适用于对话轮次较少、对上下文完整性要求极高的场景。

```python
class FullHistoryMemory:
    def __init__(self):
        self.messages: list[dict] = []

    def add(self, role: str, content: str):
        self.messages.append({"role": role, "content": content})

    def get_context(self) -> list[dict]:
        return self.messages.copy()

    def token_estimate(self, tokenizer) -> int:
        total = 0
        for msg in self.messages:
            total += len(tokenizer.encode(msg["content"]))
        return total
```

#### 策略二：滑动窗口（Sliding Window）

只保留最近 N 轮对话，丢弃更早的历史。实现简单且 token 预算可控，但会丢失早期关键信息。

```python
class SlidingWindowMemory:
    def __init__(self, max_turns: int = 20):
        self.max_turns = max_turns
        self.messages: list[dict] = []

    def add(self, role: str, content: str):
        self.messages.append({"role": role, "content": content})
        if len(self.messages) > self.max_turns * 2:
            self.messages = self.messages[-(self.max_turns * 2):]

    def get_context(self) -> list[dict]:
        return self.messages.copy()
```

#### 策略三：摘要压缩（Summary Compression）

当历史过长时，使用 LLM 将早期对话压缩为摘要，保留近期原文。这是 **LangChain `ConversationSummaryBufferMemory`** 的核心思路：

```python
class SummaryMemory:
    def __init__(self, llm, max_summary_tokens: int = 500):
        self.llm = llm
        self.max_summary_tokens = max_summary_tokens
        self.summary: str = ""
        self.recent_messages: list[dict] = []
        self.buffer_tokens: int = 0

    def add(self, role: str, content: str):
        self.recent_messages.append({"role": role, "content": content})
        self.buffer_tokens += len(content) // 2

    def compress_if_needed(self, token_limit: int = 4000):
        if self.buffer_tokens <= token_limit:
            return
        summary_prompt = (
            f"请将