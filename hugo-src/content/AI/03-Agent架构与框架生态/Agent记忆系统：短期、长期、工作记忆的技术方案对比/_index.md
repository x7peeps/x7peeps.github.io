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
            f"请将以下对话历史压缩为一段简洁摘要，保留关键事实、数字与用户偏好：\n{old_messages}"
        )
        self.summary = self.llm.invoke(summary_prompt).content
        self.recent_messages = self.recent_messages[-6:]
        self.buffer_tokens = sum(len(m["content"]) // 2 for m in self.recent_messages)

    def get_context(self) -> list[dict]:
        ctx = []
        if self.summary:
            ctx.append({"role": "system", "content": f"【历史摘要】{self.summary}"})
        ctx.extend(self.recent_messages)
        return ctx
```

### 2.2 三种策略对比与工程建议

| 策略 | Token 成本 | 信息保真 | 实现复杂度 | 典型失败模式 |
| :--- | :--- | :--- | :--- | :--- |
| 全量保留 | 线性膨胀 | 100% | 无 | 超窗口直接不可用 |
| 滑动窗口 | 恒定 | 近期 100%，远期 0% | 极低 | 早期关键约束被遗忘 |
| 摘要压缩 | 有界 | 有损（取决于摘要器质量） | 中 | 细节数字/承诺被抹平 |

生产推荐**组合策略**：近期原文 + 中期摘要 + 关键事实强制持久化（单独存 profile，不进摘要流）。纯摘要压缩最大的坑是**数字与承诺失真**——"预算 23.5 万"被摘要成"预算不高"，Agent 后续推荐必然翻车。这类字段应走结构化抽取，而不是自然语言摘要。

---

## 三、工作记忆（Working Memory）

工作记忆对应人类"当前任务的加工台"——不是历史记录，而是**此刻正在推理的状态**。

### 3.1 实现形态

- **Scratchpad**：ReAct / Plan-and-Execute 中的中间推理块，任务结束即丢弃
- **结构化状态**：Agent 维护的 JSON 状态机（当前步骤、变量、待确认项），每轮注入上下文后部
- **LangGraph State**：显式图状态（TypedDict），节点读写由 reducer 控制，天然支持 checkpoint

```python
class SalesAgentState(TypedDict):
    goal: str                 # 任务目标
    plan: list[str]           # 步骤队列
    findings: dict            # 已收集事实
    pending_confirm: str      # 等待用户确认项
```

### 3.2 易失性设计原则

**工作记忆容量要小、访问要快、生命周期绑定任务**。大中间产物写文件/DB（归短期记忆侧管），状态里只留引用路径——否则每轮都在为半成品上下文付费。Letta（MemGPT）的 core memory 是这一思路的极致：常驻 context 的"记忆块"只有几千 token，写满即驱逐到 archival memory，Agent 自己调用 `memory_replace` 管理腾挪。

---

## 四、长期记忆（Long-term Memory）

### 4.1 三种存储范式

| 范式 | 载体 | 适合内容 | 检索方式 |
| :--- | :--- | :--- | :--- |
| 向量记忆 | Embedding + ANN | 语义相似的历史片段 | 相似度 top-k |
| 实体/画像记忆 | 结构化 KV | 用户偏好、身份属性 | 直接读取，无需检索 |
| 图/知识记忆 | 实体-关系图 | 多跳关系、时序事实 | 子图遍历 + 混合检索 |

### 4.2 写入策略比检索更重要

长期记忆的失败 90% 出在写入侧：什么都存 → 检索噪声淹没信号。工程要点：

1. **LLM 判定重要性**再写库（"这个信息未来还会用到吗？"）
2. **冲突消解**：新事实与旧事实矛盾时更新 + 留痕，而非并存——否则检索到哪个全看运气
3. **去重与合并**：同义条目周期性归并，控制库规模

### 4.3 代表方案速览

- **MemGPT/Letta**：OS 式分页，Agent 自管主存/外存
- **Mem0**：抽取-更新管道，ADD/UPDATE/DELETE 四态，SDK 开箱即用
- **Zep**：时序知识图谱，擅长回答"这个事实什么时候变的"
- **RAG 复用**：把长期记忆当外挂知识库，用现成检索栈——简单场景够用

---

## 五、方案选型与组合架构

一个生产级 Agent 的推荐上下文组装顺序：

```
System(静态) + Profile(结构化长期, 常驻)
+ 工作记忆(任务状态, 常驻)
+ 检索层命中片段(长期记忆 top-k)
+ 最近 N 轮原文(短期)
+ [历史摘要](更远的短期)
```

| 场景 | 短期 | 工作 | 长期 |
| :--- | :--- | :--- | :--- |
| 客服机器人 | 窗口 10 轮 | 槽位状态机 | 画像 KV |
| 编码助手 | 文件 + 摘要 | TODO 列表 | 项目规范/历史决策 |
| 个人助理 | 全摘要化 | 任务队列 | Mem0/Zep 类记忆层 |

---

## 六、总结

Agent 记忆不是单点功能，而是**分层存储系统**：短期记忆管"现在说什么"，工作记忆管"正在算什么"，长期记忆管"一直记得什么"。三条工程铁律收尾：**预算分层——每类记忆有独立 token 上限，超限先降级再丢弃；写入克制——长期记忆的 ROI 在筛选率而非存储量；可观测性——检索命中率与错误引用率做成指标，失忆和乱记是两类完全不同的故障**。上下文窗口会一直变大，但成本、注意力衰减与跨会话持久化的约束不会——记忆架构因此不是过渡方案，而是 Agent 系统的常驻组件。

(注：文中代码为教学示意，各框架 API 以 LangChain/Letta/Mem0 官方文档现行版本为准；对比结论整理自公开评测与工程实践，非统一环境实测。)

本文面向授权安全研究与防御建设，未经授权对任何系统实施文中技术属违法行为。
