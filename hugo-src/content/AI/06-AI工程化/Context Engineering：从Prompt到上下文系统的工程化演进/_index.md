---
title: "Context Engineering：从 Prompt 到上下文系统的工程化演进"
weight: 5
tags: [Context Engineering, 上下文工程, Agent, LLM, RAG, 上下文管理]
menu:
  main:
    parent: "AI 工程化"
---

# Context Engineering：从 Prompt 到上下文系统的工程化演进

在 LLM 应用开发领域，2023 年是 Prompt Engineering 的年份——开发者们痴迷于找到"神奇的措辞"来释放模型能力。但当 AI 应用从简单的单轮对话演进到复杂多步骤 Agent 系统时，一个新问题浮出水面：**大多数 Agent 的失败不是因为模型不够聪明，而是因为它看到的信息不够好**。

2025 年中，Andrej Karpathy 在 X 上提出了一个定义迅速走红："In every industrial-strength LLM app, context engineering is the delicate art and science of filling the context window with just the right information for the next step." Anthropic 在 2025 年 9 月发布了系统性的 Context Engineering 指南，Sourcegraph、LlamaIndex、LangChain 等主要 AI 工具链厂商也相继跟进。**Context Engineering 正式成为与 Prompt Engineering 并列、甚至覆盖范围更广的独立工程学科。**

本文将从 Context Engineering 的定义与演进出发，系统梳理上下文窗口的内容构成、核心技术策略、长时任务处理方案，以及在生产环境中的工程化实践框架。

---

## 1. Context Engineering 的定义与演进

### 1.1 从 Prompt Engineering 到 Context Engineering

要理解 Context Engineering，最直接的方式是厘清它与 Prompt Engineering 的关系：

| 维度 | Prompt Engineering | Context Engineering |
| :--- | :--- | :--- |
| **范围** | 单次指令的措辞优化 | 推理时 LLM 所见的全部 Token |
| **作用面** | System Prompt + 用户消息 | 指令、检索文档、记忆、工具定义、历史、输出 Schema |
| **状态性** | 无状态或单轮 | 有状态、多轮、可持续数小时 |
| **优化目标** | 更好的措辞、更少的歧义 | 上下文窗口中更高的信噪比 |
| **失败模式** | 模型误解任务 | 模型信息过多、过少或类型错误 |
| **责任人** | 任何写 Prompt 的人 | 构建 Agent 流水线的平台团队 |

Anthropic 将 Context Engineering 视为 Prompt Engineering 的**自然演进**，而非替代。Prompt Engineering 仍然重要——你仍然需要写出不自相矛盾的系统指令。但一旦你的 Agent 有了工具、记忆和检索层，写好 Prompt 只是整个工程的冰山一角。

> **核心区别**：如果你的改进来自于"换词换句"，你还在做 Prompt Engineering；如果你的改进来自于"改数据流、改检索逻辑、改信息架构"，你已经在做 Context Engineering。

### 1.2 为什么 Context Engineering 成为必需

Context Engineering 不是一个营销概念，它是被**工程实践中的失败**逼出来的。当 AI 系统从单轮对话演进到多步 Agent 时，三类根本性问题暴露出来：

**问题一：Context Rot（上下文腐化）**

Chroma 在 2025 年发布了一项覆盖 18 个主流 LLM 的研究，发现一个普遍现象：**随着上下文窗口中 Token 数量的增加，模型准确召回信息的能力持续下降**。某些模型在 95% 准确率时保持稳定，一旦输入超过某个长度就断崖式跌落到 60%。

这不是特定模型的 bug，而是 Transformer 架构的结构性属性——Self-Attention 机制对 n 个 Token 产生 n² 的注意力关系，当序列变长，模型被迫将注意力"摊薄"到更多关系上。

**问题二：Lost in the Middle（中间信息丢失）**

LLM 对上下文窗口中不同位置的信息关注度不均匀。研究反复证实，**位于输入中间部分的信息被准确回忆的概率比开头和结尾低 30% 以上**。这是 RoPE 位置编码的衰减效应造成的——中间位置的 Token 距离序列两端都较远，落入"低注意力区域"。

**问题三：Agent 上下文爆炸**

一个在循环中运行的 Agent，在第 47 步决策时，上下文窗口中仍然残留着第 1 步到第 46 步的所有产出：工具调用结果、检索文档、中间推理。Token 预算有限、注意力预算有限，大部分上下文失败源于**预算分配不当**，而非初始 Prompt 不好。

```
┌─────────────────────────────────────────────────────────┐
│                 Agent 上下文累积示意图                     │
│                                                         │
│  Step 1:  [系统指令 + 用户请求]           ← 信号高       │
│  Step 2:  + [工具定义 + 检索结果 A]       ← 信号高       │
│  Step 3:  + [工具调用 + 结果 B]           ← 信号中       │
│  ...                                                    │
│  Step 20: + [大量历史 + 多次检索]          ← 信号被稀释    │
│  Step 47: + [冗余信息堆积]                ← 信噪比骤降    │
│                                                         │
│  ⚠️ 模型在此时的决策质量显著下降                          │
└─────────────────────────────────────────────────────────┘
```

这三个问题共同指向一个结论：**上下文是 LLM 的有限资源，必须像管理内存一样工程化地管理它**。

---

## 2. 上下文的六大内容层

在设计 Context Engineering 策略之前，首先需要理解 LLM 推理时上下文窗口中的信息构成。综合 Anthropic、LlamaIndex 和 Phil Schmid 的分析框架，一次 LLM 推理调用的上下文由以下六层组成：

```
┌──────────────────────────────────────────────┐
│              上下文窗口内容分层                  │
│                                              │
│  ① 系统指令 (System Instructions)              │
│     └─ 角色定义、行为规则、安全边界              │
│                                              │
│  ② 工具定义 (Tool Definitions)                │
│     └─ 可用工具的描述、参数 Schema、调用规则     │
│                                              │
│  ③ 检索文档 (Retrieved Documents)              │
│     └─ RAG 检索结果、知识库内容、外部数据        │
│                                              │
│  ④ 对话历史 (Chat History)                    │
│     └─ 短期记忆、用户消息、助手回复             │
│                                              │
│  ⑤ 长期记忆 (Long-term Memory)                │
│     └─ 跨会话持久化信息、用户偏好、事实摘要      │
│                                              │
│  ⑥ 用户输入 (User Input)                      │
│     └─ 当前查询、任务请求                      │
└──────────────────────────────────────────────┘
```

**关键洞察**：用户的实际问题往往只占 Token 总量的一小部分，其余都是基础设施——而 Context Engineering 正是设计这个基础设施的学科。

### 2.1 系统指令：正确"海拔"原则

Anthropic 提出了一个极具指导意义的概念——**"正确海拔"（Right Altitude）**。系统指令的设计需要在两种常见失败模式之间找到 Goldilocks 区间：

| 失败模式 | 表现 | 后果 |
| :--- | :--- | :--- |
| **海拔过低** | 硬编码复杂的 if-else 逻辑 | 脆弱、维护成本高、边界情况多 |
| **海拔过高** | 模糊的高层指导 | 模型缺乏具体信号、假设共享上下文 |
| **正确海拔** | 足够具体以引导行为，又足够灵活以留出判断空间 | 鲁棒、可维护、可泛化 |

```python
# ❌ 海拔过低：硬编码逻辑
system_prompt_low = """
如果用户问关于退款的问题，检查订单日期是否在30天内。
如果是数字产品，检查是否已下载。如果是订阅，检查是否在首月内。
如果用户是VIP会员且订单金额超过500元，自动批准退款。
如果...（继续列举20种情况）
"""

# ❌ 海拔过高：过于模糊
system_prompt_high = """
你是一个客服助手。请礼貌地帮助用户解决问题。
"""

# ✅ 正确海拔：启发式引导
system_prompt_right = """
角色：客服助手，拥有退款审批权限。
原则：
- 优先解决用户问题，退款是手段而非目标
- 30天内订单通常可退，超出需主管审批
- 数字产品已下载不可退，除非质量有问题
- VIP 用户享受更灵活的政策，但需评估具体情况
处理流程：先确认问题 → 尝试非退款方案 → 不得已时执行退款
"""
```

### 2.2 工具定义：精简且正交

工具定义占据上下文窗口的固定位置，且直接影响 Agent 的决策质量。Anthropic 的实践表明，**臃肿的工具集是 Agent 失败的首要原因之一**——当人类工程师都无法确定某个场景该用哪个工具时，AI Agent 不可能做得更好。

**工具设计原则**：

- **最小可用集**：只提供 Agent 完成任务真正需要的工具
- **功能正交**：工具之间没有重叠，消除选择歧义
- **自描述性**：工具名称和参数描述足够清晰，LLM 无需猜测用途
- **Token 高效**：返回结果紧凑，避免冗余信息

### 2.3 检索文档：信号而非噪音

检索层是 Context Engineering 中信息密度最高的组件。核心挑战在于：**检索回来的每一条信息都应该为最终决策提供增量信号**。

| 检索策略 | 原理 | 适用场景 |
| :--- | :--- | :--- |
| **向量语义检索** | 基于 Embedding 相似度匹配 | 开放式问答、文档搜索 |
| **BM25 关键词检索** | 基于词频统计匹配 | 精确术语查询、代码搜索 |
| **混合检索** | 向量 + BM25 加权融合 | 大多数生产场景 |
| **重排序（Reranking）** | 对初步结果二次精排 | 检索结果数量多、需要高精度 |

---

## 3. Context Engineering 核心技术策略

基于 Anthropic、LlamaIndex 和 Sourcegraph 的工程实践，Context Engineering 的核心技术策略可归纳为四个动作：**Write（写入）、Select（选择）、Compress（压缩）、Isolate（隔离）**。

### 3.1 Write：上下文写入策略

Write 指的是决定哪些信息被持久化到上下文中。这是最基础的策略，决定了 Agent 的知识边界。

**Structured Note-Taking（结构化笔记）**

Agent 在执行任务过程中产生的中间状态，需要有选择地持久化。Anthropic 建议 Agent 使用结构化笔记而非原始对话历史来保持状态：

```python
# ❌ 依赖原始对话历史（Token 消耗高、噪音大）
context = conversation_history  # 可能包含数十轮冗余对话

# ✅ 结构化笔记（紧凑、高信号）
agent_notes = {
    "task": "修复用户报告的登录超时问题",
    "findings": [
        "数据库查询平均耗时 2.3s（正常应 <200ms）",
        "慢查询集中在 users 表的 email 索引缺失",
        "已定位到问题代码：auth/login.py:L42"
    ],
    "completed_actions": [
        "检查了数据库连接池配置 - 正常",
        "分析了慢查询日志 - 确认索引问题",
        "创建了迁移脚本 - 待执行"
    ],
    "next_steps": [
        "执行数据库迁移添加索引",
        "验证修复后查询性能",
        "更新测试用例"
    ],
    "open_questions": []
}
```

**Just-in-Time Retrieval（即时检索）**

传统做法是预先检索所有可能相关的数据，但这种方式效率低下。Anthropic 推崇的 **"即时检索"** 策略是：Agent 只维护轻量级引用（文件路径、查询模板、URL），在运行时按需加载数据。

```
┌─────────────────────────────────────────────────────┐
│           预加载 vs 即时检索 对比                      │
│                                                     │
│  预加载模式：                                         │
│  [所有文档 → 向量化 → 全部注入上下文 → LLM 推理]       │
│  缺点：上下文膨胀、Token 浪费、注意力稀释               │
│                                                     │
│  即时检索模式：                                       │
│  [引用索引 → Agent 按需查询 → 仅加载相关内容 → 推理]   │
│  优点：上下文精简、信噪比高、可渐进式发现               │
│                                                     │
│  Claude Code 就是即时检索的典范：                      │
│  通过 glob/grep 按需搜索代码库，而非一次性加载全部源码   │
└─────────────────────────────────────────────────────┘
```

这种模式模仿了人类认知——我们不会记忆整个信息库，而是依赖文件系统、书签和索引按需检索。

### 3.2 Select：上下文选择策略

Select 是从候选信息中挑选最相关的子集注入上下文。这是信噪比优化的核心环节。

**Recency-Ranking（时序排序）**

对于涉及时间敏感性的任务（如日志分析、事件排查），信息的时序位置比语义相似度更重要：

```python
from datetime import datetime

def select_by_recency(documents, cutoff_days=7, max_docs=10):
    cutoff = datetime.now() - timedelta(days=cutoff_days)
    recent_docs = [
        doc for doc in documents
        if datetime.fromisoformat(doc["timestamp"]) > cutoff
    ]
    recent_docs.sort(key=lambda x: x["timestamp"], reverse=True)
    return recent_docs[:max_docs]
```

**Relevance Thresholding（相关性阈值）**

不是所有检索到的信息都应该进入上下文。设定相关性阈值可以过滤低质量匹配：

```python
def select_by_relevance(results, score_threshold=0.75, max_results=5):
    filtered = [r for r in results if r["score"] >= score_threshold]
    return filtered[:max_results]
```

**Deduplication（去重与合并）**

当多次检索返回重叠信息时，去重是避免上下文膨胀的关键步骤：

```python
def deduplicate_by_content(documents, similarity_threshold=0.95):
    seen_embeddings = []
    unique_docs = []
    for doc in documents:
        if not any(
            cosine_similarity(doc["embedding"], seen) > similarity_threshold
            for seen in seen_embeddings
        ):
            unique_docs.append(doc)
            seen_embeddings.append(doc["embedding"])
    return unique_docs
```

### 3.3 Compress：上下文压缩策略

Compress 是在不丢失关键信息的前提下缩小上下文体积。这是应对 Context Rot 的最直接手段。

**Compaction（上下文折叠）**

当对话接近上下文窗口限制时，将当前内容摘要后重新开始新窗口。这是 Anthropic 推荐的"第一道防线"：

```python
async def compact_context(messages, client, model, threshold_ratio=0.85):
    total_tokens = count_tokens(messages)
    max_tokens = get_context_limit(model)
    
    if total_tokens < max_tokens * threshold_ratio:
        return messages
    
    summary = await client.messages.create(
        model=model,
        messages=[{
            "role": "user",
            "content": f"请将以下对话压缩为简洁摘要，保留所有关键发现、决策和待办事项：\n{format_messages(messages)}"
        }]
    )
    
    return [
        {"role": "system", "content": f"以下是之前对话的摘要：\n{summary.content[0].text}"},
        messages[-1]  # 保留最新用户消息
    ]
```

> Compaction 的难点不在于"如何摘要"，而在于**什么信息应该存活**。有些信息应保持稳定（任务目标、硬约束），有些可以安全丢弃。信息的重要性往往只有在后续步骤中才能显现。

**Selective Compression（选择性压缩）**

不同内容层使用不同的压缩策略：

| 内容层 | 压缩策略 | 保留原则 |
| :--- | :--- | :--- |
| 系统指令 | 几乎不压缩 | 核心规则不可删减 |
| 工具定义 | 保持完整 | 工具 Schema 不可截断 |
| 检索文档 | 摘要/提取关键段落 | 保留与任务直接相关的事实 |
| 对话历史 | 滑动窗口 + 摘要 | 保留最近 N 轮 + 历史摘要 |
| 长期记忆 | 事实提取 + 向量化 | 保留与当前任务相关的持久化事实 |

### 3.4 Isolate：上下文隔离策略

Isolate 是确保不同子任务的上下文不相互污染。这是多步 Agent 系统中经常被忽视但极其关键的策略。

**Task Isolation（任务隔离）**

每个子任务在独立的上下文空间中执行，完成后仅将结论性结果传递给主流程：

```
┌───────────────────────────────────────────────────┐
│              主 Agent 上下文                         │
│                                                   │
│  [系统指令 + 任务目标]                              │
│                                                   │
│  ┌─────────────────────┐                           │
│  │ 子 Agent A (代码分析)  │ ← 独立上下文              │
│  │ 输入：相关代码片段     │                           │
│  │ 输出：分析结论摘要     │ → 仅摘要返回主 Agent       │
│  └─────────────────────┘                           │
│                                                   │
│  ┌─────────────────────┐                           │
│  │ 子 Agent B (测试执行)  │ ← 独立上下文              │
│  │ 输入：测试用例 + 环境  │                           │
│  │ 输出：测试结果摘要     │ → 仅摘要返回主 Agent       │
│  └─────────────────────┘                           │
│                                                   │
│  ✅ 子 Agent 的中间推理不会污染主 Agent 的上下文       │
└───────────────────────────────────────────────────┘
```

这种模式在 **Multi-Agent 架构** 中尤为重要。当一个 Agent 的输出是另一个 Agent 的输入时，不做隔离就会导致上下文级联膨胀。

---

## 4. 长时任务的上下文管理

当 Agent 需要执行跨越数十分钟到数小时的任务（如大规模代码迁移、全面调研项目）时，标准的单窗口策略完全不够用。Anthropic 提出了三种专门的技术方案：

### 4.1 Compaction（折叠）

如 3.3 节所述，Compaction 是最直接的手段：对话接近窗口限制时，摘要后重新开始。

**最佳实践**：

- 折叠时保留**任务目标和约束条件**，这些信息在整个任务期间都应稳定可见
- 保留**已完成操作的清单**，避免 Agent 重复执行已完成的工作
- 保留**失败尝试的记录**，避免 Agent 重蹈覆辙
- 保留**不确定性标记**，让 Agent 知道哪些决策是临时的

### 4.2 Structured Note-Taking（结构化笔记）

Agent 维护一个持久化的结构化笔记本，在每次折叠后作为上下文的"种子"。这比依赖对话历史摘要更可靠：

```python
class AgentNotebook:
    def __init__(self):
        self.task_objective = ""
        self.constraints = []
        self.findings = []
        self.completed_actions = []
        self.failed_attempts = []
        self.pending_decisions = []
    
    def to_context_string(self):
        return f"""
## 任务目标
{self.task_objective}

## 约束条件
{chr(10).join(f'- {c}' for c in self.constraints)}

## 已有发现
{chr(10).join(f'- {f}' for f in self.findings)}

## 已完成操作
{chr(10).join(f'- {a}' for a in self.completed_actions)}

## 失败尝试（避免重复）
{chr(10).join(f'- {f}' for f in self.failed_attempts)}

## 待决事项
{chr(10).join(f'- {d}' for d in self.pending_decisions)}
"""
```

### 4.3 Multi-Agent 架构

将长时任务分解为多个独立的子 Agent，每个子 Agent 处理一个聚焦的子任务，拥有自己的上下文窗口。主 Agent 只负责调度和汇总：

```
┌────────────────────────────────────────────────────────┐
│                   Multi-Agent 架构                       │
│                                                        │
│  ┌──────────────┐                                      │
│  │  Orchestrator  │ ← 全局目标 + 任务分配 + 结果汇总       │
│  └──────┬───────┘                                      │
│         │                                              │
│    ┌────┴────┬──────────┬──────────┐                   │
│    ▼         ▼          ▼          ▼                   │
│  ┌─────┐  ┌─────┐  ┌──────┐  ┌──────┐               │
│  │Agent │  │Agent │  │Agent │  │Agent │               │
│  │  A   │  │  B   │  │  C   │  │  D   │               │
│  │分析  │  │执行  │  │测试  │  │文档  │               │
│  └─────┘  └─────┘  └──────┘  └──────┘               │
│                                                        │
│  每个子 Agent 有独立的上下文窗口，互不干扰                  │
│  Orchestrator 只接收子 Agent 的结论性输出                  │
└────────────────────────────────────────────────────────┘
```

---

## 5. Context Engineering 的五个质量标准

Vera Vishnyakova 在 2026 年的论文中提出了 Context Engineering 的五个质量标准，这一框架有助于系统性地评估和优化上下文设计：

| 标准 | 定义 | 评估问题 |
| :--- | :--- | :--- |
| **Relevance（相关性）** | 每条信息都与当前任务直接相关 | 删除某条信息后，输出质量是否下降？ |
| **Sufficiency（充分性）** | 信息总量足以完成任务 | Agent 是否需要额外信息才能做决策？ |
| **Isolation（隔离性）** | 不同任务的上下文互不污染 | 子任务 A 的信息是否干扰子任务 B？ |
| **Economy（经济性）** | 以最少 Token 传递最大信号 | 是否存在冗余信息可以压缩或删除？ |
| **Provenance（来源可溯性）** | 每条信息有清晰的来源和时效 | 模型能否区分事实和推测？ |

> **实战建议**：在生产环境中，建议对每次 Agent 推理调用的日志进行这五个维度的定期审查。当 Agent 输出质量下降时，按这五个维度排查往往能快速定位问题。

---

## 6. 工程化实践框架

### 6.1 Context Pipeline 设计

一个完整的 Context Engineering 流水线在每次 LLM 推理前执行以下步骤：

```python
class ContextPipeline:
    def __init__(self, retriever, memory_store, tool_registry):
        self.retriever = retriever
        self.memory_store = memory_store
        self.tool_registry = tool_registry
    
    async def build_context(self, user_input, conversation_state):
        context = ContextBuilder()
        
        # 1. 固定层：系统指令（最小化、高信号）
        context.add_system_prompt(self.build_system_prompt())
        
        # 2. 工具层：最小可用工具集
        relevant_tools = self.tool_registry.select_for_task(
            conversation_state.current_task
        )
        context.add_tools(relevant_tools)
        
        # 3. 检索层：即时检索 + 相关性过滤
        retrieved = await self.retriever.retrieve(
            user_input, 
            top_k=5, 
            score_threshold=0.75
        )
        deduplicated = deduplicate_by_content(retrieved)
        compressed = self.selective_compress(deduplicated)
        context.add_documents(compressed)
        
        # 4. 记忆层：长时记忆 + 短期摘要
        long_term = self.memory_store.retrieve(user_input, limit=3)
        short_term = self.summarize_history(conversation_state.history)
        context.add_memory(long_term + short_term)
        
        # 5. 用户层：当前查询
        context.add_user_input(user_input)
        
        # 6. 校验层：Token 预算检查
        if context.total_tokens > self.budget:
            context = self.fit_to_budget(context, self.budget)
        
        return context.build()
```

### 6.2 Token 预算分配策略

合理的 Token 预算分配是 Context Engineering 落地的关键。以下是一个生产级 Agent 的推荐分配：

| 内容层 | 推荐占比 | 说明 |
| :--- | :--- | :--- |
| 系统指令 + 工具定义 | 10%-15% | 固定开销，尽量精简 |
| 检索文档 | 30%-40% | 核心信号源，需要精挑细选 |
| 对话历史/摘要 | 20%-30% | 保留必要上下文，及时压缩 |
| 长期记忆 | 5%-10% | 跨会话关键信息 |
| 用户输入 | 5%-10% | 通常占比最小 |
| **预留空间** | **10%-15%** | 给模型输出和动态加载留余量 |

### 6.3 监控与迭代

Context Engineering 不是一次性的工作，它需要持续的监控和迭代：

- **Trace 日志**：记录每次推理调用的完整上下文构成，便于事后分析
- **信噪比指标**：追踪上下文中"高信号 Token"占比的变化趋势
- **失败归因**：当 Agent 输出异常时，首先排查上下文问题而非模型问题
- **A/B 测试**：对比不同上下文策略对任务成功率的影响

---

## 7. 工具与框架生态

当前主流的 Context Engineering 工具和框架：

| 框架 | 上下文管理能力 | 适用场景 |
| :--- | :--- | :--- |
| **LangGraph** | 通过 Graph 结构控制每步的上下文状态，支持持久化 State 和 Agent 间记忆 | 复杂多步 Agent 工作流 |
| **LlamaIndex Workflows** | 事件驱动编排，每步独立上下文，支持 Memory Block（Vector/Fact/Static） | RAG + Agent 混合场景 |
| **Anthropic Claude** | 原生支持 Compaction、CLAUDE.md 上下文注入、MCP 工具生态 | Claude 生态内的 Agent 开发 |
| **Mem0** | 专注长期记忆管理，支持跨会话上下文持久化和自适应遗忘 | 需要强记忆能力的应用 |
| **Neo4j + GraphRAG** | 知识图谱提供结构化上下文，解决向量检索无法捕获的关系推理 | 企业级知识密集型应用 |

---

## 8. 总结与展望

Context Engineering 的出现标志着 AI 工程从"写好 Prompt"进化到"设计好系统"：

- **上下文是有限资源**：Context Rot 和 Lost in the Middle 证明，更多上下文不等于更好结果。**信噪比**是比信息量更重要的指标。

- **四策略体系**：Write（写入）、Select（选择）、Compress（压缩）、Isolate（隔离）构成了 Context Engineering 的核心技术框架，每个策略都有明确的适用场景和实现路径。

- **长时任务需要专门设计**：Compaction、Structured Note-Taking 和 Multi-Agent 架构是应对上下文窗口限制的三大方案，实践中通常需要组合使用。

- **质量五标准**：Relevance、Sufficiency、Isolation、Economy、Provenance 为评估上下文质量提供了系统性框架。

- **Prompt Engineering 没有被取代**：Context Engineering 覆盖范围更广，但 Prompt Engineering 仍然是基础。两者是不同层级的关系——就像 UI/UX 之于 Web 开发。

> 展望未来，随着 LLM 上下文窗口持续扩大（从 128K 到 1M+），Context Engineering 的重心不会是"如何塞入更多信息"，而是**"如何在更大空间中保持精确的注意力分配"**。同时，Context Engineering 与 Agent 安全的交叉——如何防止上下文污染和注入攻击——将成为下一个重要议题。

## 参考资源

- [Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — Anthropic 官方 Context Engineering 指南
- [Context Engineering: A Practical Guide for AI Agents (2026)](https://sourcegraph.com/blog/context-engineering) — Sourcegraph 从代码 Agent 视角的深度解读
- [Context Engineering - What it is, and techniques to consider](https://www.llamaindex.ai/blog/context-engineering-what-it-is-and-techniques-to-consider) — LlamaIndex 的 Context Engineering 技术综述
- [Context Engineering: From Prompts to Corporate Multi-Agent Architecture](https://arxiv.org/abs/2603.09619) — arXiv 学术论文，提出五个质量标准框架
- [Context Engineering AI: How To Build Smarter LLM Agents](https://mem0.ai/blog/context-engineering-ai-agents-guide) — Mem0 的 Context Engineering 实践指南
- [Context Engineering for AI Agents: A Deep Dive](https://towardsdatascience.com/deep-dive-into-context-engineering-for-ai-agents/) — Towards Data Science 的多 Agent 系统上下文管理
- [Context Rot 研究](https://research.trychroma.com/context-rot) — Chroma 关于上下文腐化的基础研究
- [A Guide to Context Engineering for LLMs](https://blog.bytebytego.com/p/a-guide-to-context-engineering-for) — ByteByteGo 的 LLM 上下文处理详解
