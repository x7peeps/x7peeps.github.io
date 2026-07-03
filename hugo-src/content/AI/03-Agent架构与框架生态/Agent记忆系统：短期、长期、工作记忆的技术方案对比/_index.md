---
title: "Agent 记忆系统：短期/长期/工作记忆的技术方案对比"
weight: 3
tags: [Agent, Memory, 向量数据库, 对话历史, 技术方案]
menu: 
  main: 
    parent: "Agent 架构与框架生态"
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
            f"请将以下对话历史压缩为简洁摘要，保留关键信息：\n"
            f"当前摘要：{self.summary}\n"
            f"新增对话：{self.recent_messages}\n"
            f"输出更新后的摘要："
        )
        self.summary = self.llm.invoke(summary_prompt)
        self.recent_messages = []
        self.buffer_tokens = len(self.summary) // 2

    def get_context(self) -> list[dict]:
        context = []
        if self.summary:
            context.append({
                "role": "system",
                "content": f"对话历史摘要：{self.summary}"
            })
        context.extend(self.recent_messages)
        return context
```

### 2.2 Token 预算影响分析

不同策略在 token 使用效率上有显著差异：

| 策略 | 第 10 轮 Token 消耗 | 第 50 轮 Token 消耗 | 信息保留率 | 实现复杂度 |
|------|---------------------|---------------------|-----------|-----------|
| 全量保留 | ~2K | ~10K | 100% | 极低 |
| 滑动窗口 (N=20) | ~2K | ~4K | 随轮次递减 | 低 |
| 摘要压缩 | ~1.5K | ~2K | ~85-90% | 中等 |
| 混合模式 | ~1.8K | ~3K | ~90-95% | 高 |

### 2.3 LangChain Memory 模块对比

LangChain 提供了三种内置的对话记忆实现，分别对应上述策略：

| 模块 | 策略 | 核心行为 | 适用场景 |
|------|------|---------|---------|
| `ConversationBufferMemory` | 全量保留 | 保留所有消息原文 | 短对话、调试 |
| `ConversationSummaryMemory` | 纯摘要 | 始终压缩为摘要 | 长对话、低 token 预算 |
| `ConversationSummaryBufferMemory` | 混合 | 低 token 时保留原文，超出后压缩 | 生产环境首选 |
| `ConversationBufferWindowMemory` | 滑动窗口 | 保留最近 K 轮 | 简单且可控的方案 |

```python
from langchain.memory import (
    ConversationBufferMemory,
    ConversationSummaryMemory,
    ConversationSummaryBufferMemory,
)
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

buffer_memory = ConversationBufferMemory(return_messages=True)

summary_memory = ConversationSummaryMemory(
    llm=llm,
    max_token_limit=2000,
)

hybrid_memory = ConversationSummaryBufferMemory(
    llm=llm,
    max_token_limit=2000,
    return_messages=True,
)

buffer_memory.save_context(
    {"input": "我叫李明"},
    {"output": "你好，李明！有什么可以帮你的？"}
)
buffer_memory.save_context(
    {"input": "我在做 RAG 项目"},
    {"output": "RAG 是一个很好的方向，有什么具体的技术问题吗？"}
)
print(buffer_memory.load_memory_variables({}))
```

---

## 三、长期记忆（Long-term Memory）

短期记忆解决的是"当前对话还记得什么"的问题，长期记忆解决的是"跨会话、跨时间尺度的知识积累"问题。

### 3.1 向量数据库驱动的记忆

向量数据库是最主流的长期记忆存储方案。核心思路：将每条记忆 embedding 后存入向量数据库，检索时通过语义相似度找到最相关的记忆片段。

```python
from openai import OpenAI
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, PointStruct
import uuid, time

class VectorMemory:
    def __init__(self, collection_name: str = "agent_memory"):
        self.client = OpenAI()
        self.db = QdrantClient(":memory:")
        self.collection = collection_name
        self.db.create_collection(
            collection_name=self.collection,
            vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
        )

    def _embed(self, text: str) -> list[float]:
        resp = self.client.embeddings.create(
            model="text-embedding-3-small", input=text
        )
        return resp.data[0].embedding

    def add(self, content: str, metadata: dict | None = None):
        embedding = self._embed(content)
        point = PointStruct(
            id=str(uuid.uuid4()),
            vector=embedding,
            payload={
                "content": content,
                "timestamp": time.time(),
                **(metadata or {}),
            },
        )
        self.db.upsert(collection_name=self.collection, points=[point])

    def search(self, query: str, top_k: int = 5) -> list[dict]:
        embedding = self._embed(query)
        results = self.db.search(
            collection_name=self.collection,
            query_vector=embedding,
            limit=top_k,
        )
        return [
            {"content": r.payload["content"], "score": r.score}
            for r in results
        ]
```

### 3.2 Key-Value 存储型记忆

对于结构化的用户偏好、配置信息，KV 存储比向量数据库更高效：

```python
import json

class KeyValueMemory:
    def __init__(self, storage_path: str = "memory.json"):
        self.storage_path = storage_path
        self.store: dict[str, dict] = {}
        self._load()

    def _load(self):
        try:
            with open(self.storage_path, "r") as f:
                self.store = json.load(f)
        except FileNotFoundError:
            self.store = {}

    def _save(self):
        with open(self.storage_path, "w") as f:
            json.dump(self.store, f, ensure_ascii=False, indent=2)

    def set(self, namespace: str, key: str, value: str):
        self.store.setdefault(namespace, {})[key] = {
            "value": value,
            "updated_at": time.time(),
        }
        self._save()

    def get(self, namespace: str, key: str) -> str | None:
        entry = self.store.get(namespace, {}).get(key)
        return entry["value"] if entry else None

    def delete(self, namespace: str, key: str):
        self.store.get(namespace, {}).pop(key, None)
        self._save()
```

### 3.3 知识图谱型记忆

当记忆之间存在复杂的关联关系时，知识图谱是更合适的选择。Mem0 和 Zep 等项目已经在生产中验证了这一方案。

```python
from neo4j import GraphDatabase

class GraphMemory:
    def __init__(self, uri: str, user: str, password: str):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def add_entity(self, name: str, entity_type: str, properties: dict):
        label = entity_type.capitalize()
        props_str = ", ".join(
            f"n.{k} = ${k}" for k in properties
        )
        query = f"""
            MERGE (n:{label} {{name: $name}})
            SET {props_str}
            RETURN n
        """
        with self.driver.session() as session:
            session.run(query, name=name, **properties)

    def add_relation(self, from_name: str, to_name: str, rel_type: str):
        query = f"""
            MATCH (a {{name: $from_name}}), (b {{name: $to_name}})
            MERGE (a)-[r:{rel_type}]->(b)
            RETURN a, r, b
        """
        with self.driver.session() as session:
            session.run(query, from_name=from_name, to_name=to_name)

    def search(self, entity_name: str, depth: int = 2) -> dict:
        query = """
            MATCH path = (n {name: $name})-[*1..%d]-(related)
            RETURN path LIMIT 20
        """ % depth
        with self.driver.session() as session:
            result = session.run(query, name=entity_name)
            return [record.data() for record in result]
```

### 3.4 存储策略

长期记忆的写入策略直接影响信息质量和系统性能：

- **追加（Append）**：每次新增记忆都追加写入，适合日志型、对话型记忆
- **覆写（Overwrite）**：对同一主题只保留最新版本，适合用户偏好等会变的信息
- **衰减（Decay）**：基于时间或访问频率对记忆权重进行衰减，过时信息自动降级

---

## 四、工作记忆（Working Memory）

工作记忆是 Agent 在执行具体任务时的"桌面"——存放当前任务的中间结果、推理状态和临时变量。

### 4.1 Scratchpad 模式

Scratchpad（便签本）是工作记忆最经典的实现模式。Agent 在每一步推理中将关键中间结果写入 Scratchpad，后续步骤可以读取：

```python
class Scratchpad:
    def __init__(self):
        self._data: dict[str, str] = {}
        self._log: list[dict] = []

    def write(self, key: str, value: str, step: int = 0):
        self._data[key] = value
        self._log.append({
            "action": "write",
            "key": key,
            "value": value,
            "step": step,
        })

    def read(self, key: str) -> str | None:
        return self._data.get(key)

    def get_context_block(self) -> str:
        lines = ["## 当前任务状态（Scratchpad）"]
        for key, value in self._data.items():
            lines.append(f"- {key}: {value}")
        return "\n".join(lines)

    def to_prompt(self) -> str:
        return (
            "<scratchpad>\n"
            + self.get_context_block()
            + "\n</scratchpad>"
        )
```

### 4.2 状态机模式

对于多步骤的复杂任务（如数据处理流水线、多轮谈判），可以用状态机管理工作记忆：

```python
from enum import Enum, auto

class TaskState(Enum):
    PLANNING = auto()
    EXECUTING = auto()
    REVIEWING = auto()
    COMPLETED = auto()
    FAILED = auto()

class TaskStateMachine:
    def __init__(self):
        self.state = TaskState.PLANNING
        self.scratchpad = Scratchpad()
        self.step_count = 0
        self.transitions: dict[tuple, TaskState] = {
            (TaskState.PLANNING, "plan_ready"): TaskState.EXECUTING,
            (TaskState.EXECUTING, "step_done"): TaskState.EXECUTING,
            (TaskState.EXECUTING, "all_done"): TaskState.REVIEWING,
            (TaskState.EXECUTING, "error"): TaskState.FAILED,
            (TaskState.REVIEWING, "approved"): TaskState.COMPLETED,
            (TaskState.REVIEWING, "needs_fix"): TaskState.EXECUTING,
        }

    def transition(self, event: str):
        key = (self.state, event)
        if key not in self.transitions:
            raise ValueError(
                f"非法转换：{self.state} + {event}"
            )
        self.state = self.transitions[key]

    def next_step(self) -> int:
        self.step_count += 1
        self.scratchpad.write("current_step", str(self.step_count))
        return self.step_count
```

### 4.3 工作记忆如何赋能复杂推理

在 ReAct 架构中，工作记忆扮演着关键角色。Agent 在 Thought → Action → Observation 循环中，需要在 Scratchpad 中记录每一轮的推理过程，否则会陷入重复探索。LangChain 的 ReAct Agent Prompt 模板中，`{agent_scratchpad}` 占位符就是工作记忆的体现：

```python
from langchain.agents import create_react_agent, Tool
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate

prompt = PromptTemplate.from_template("""
Answer the following questions as best you can.

You have access to the following tools:

{tools}

Use the following format:

Question: the input question you must answer
Thought: you should always think about what to do
Action: the action to take, should be one of [{tool_names}]
Action Input: the input to the action
Observation: the result of the action
... (this Thought/Action/Action Input/Observation can repeat N times)
Thought: I now know the final answer
Final Answer: the final answer to the original input question

Begin!

Question: {input}
Thought:{agent_scratchpad}
""")
```

---

## 五、记忆检索策略

有了多种记忆存储，如何高效检索是关键问题。

### 5.1 关键词检索（BM25）

BM25 是经典的信息检索算法，基于词频（TF）和逆文档频率（IDF）进行打分。适合精确匹配场景。

```python
from rank_bm25 import BM25Okapi
import jieba

class BM25MemoryRetriever:
    def __init__(self):
        self.memories: list[str] = []
        self.bm25: BM25Okapi | None = None

    def add(self, content: str):
        self.memories.append(content)
        tokenized = [list(jieba.cut(doc)) for doc in self.memories]
        self.bm25 = BM25Okapi(tokenized)

    def search(self, query: str, top_k: int = 5) -> list[tuple[str, float]]:
        if not self.bm25:
            return []
        query_tokens = list(jieba.cut(query))
        scores = self.bm25.get_scores(query_tokens)
        ranked = sorted(
            zip(self.memories, scores), key=lambda x: x[1], reverse=True
        )
        return ranked[:top_k]
```

### 5.2 语义检索（向量相似度）

语义检索通过 embedding 向量的余弦相似度匹配语义相近的记忆。在前面的 `VectorMemory` 中已经实现了核心逻辑。

### 5.3 混合检索（Hybrid Search）

生产系统中，混合检索往往效果最佳——将 BM25 的关键词精确匹配与向量检索的语义理解结合：

```python
class HybridMemoryRetriever:
    def __init__(self, vector_weight: float = 0.6, bm25_weight: float = 0.4):
        self.vector_retriever = VectorMemory()
        self.bm25_retriever = BM25MemoryRetriever()
        self.vector_weight = vector_weight
        self.bm25_weight = bm25_weight

    def add(self, content: str, metadata: dict | None = None):
        self.vector_retriever.add(content, metadata)
        self.bm25_retriever.add(content)

    def search(self, query: str, top_k: int = 5) -> list[dict]:
        vector_results = self.vector_retriever.search(query, top_k=top_k * 2)
        bm25_results = self.bm25_retriever.search(query, top_k=top_k * 2)

        scores: dict[str, float] = {}
        for i, r in enumerate(vector_results):
            normalized = r["score"] * self.vector_weight
            scores[r["content"]] = scores.get(r["content"], 0) + normalized

        for i, (content, score) in enumerate(bm25_results):
            max_bm25 = max(s for _, s in bm25_results) if bm25_results else 1
            normalized = (score / max_bm25) * self.bm25_weight
            scores[content] = scores.get(content, 0) + normalized

        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        return [{"content": c, "score": s} for c, s in ranked[:top_k]]
```

### 5.4 何时使用哪种检索

| 检索方式 | 最佳场景 | 劣势 |
|---------|---------|------|
| BM25 关键词 | 精确实体匹配（人名、编号、术语） | 无法理解同义词和语义 |
| 向量语义 | 模糊意图、同义表述、跨语言 | 对精确术语匹配不如 BM25 |
| 混合检索 | 通用场景、生产系统 | 需要维护两套索引，复杂度高 |

---

## 六、记忆更新策略

### 6.1 Append-only

只追加不删除，保留完整的历史轨迹。适合审计和日志场景，但会导致存储无限膨胀。

```python
class AppendOnlyMemory:
    def __init__(self):
        self.entries: list[dict] = []

    def add(self, content: str):
        self.entries.append({
            "content": content,
            "timestamp": time.time(),
        })
```

### 6.2 Overwrite

对同一主题只保留最新版本。适合用户偏好等会变的信息。

```python
class OverwriteMemory:
    def __init__(self):
        self.entries: dict[str, dict] = {}

    def set(self, key: str, value: str):
        self.entries[key] = {
            "content": value,
            "timestamp": time.time(),
        }
```

### 6.3 TTL-based Decay

基于时间衰减的策略——记忆的"权重"随时间递减，长期未访问的记忆逐渐降级直至淘汰：

```python
class DecayMemory:
    def __init__(self, half_life_hours: float = 72):
        self.half_life = half_life_hours * 3600
        self.entries: list[dict] = []

    def add(self, content: str):
        self.entries.append({
            "content": content,
            "timestamp": time.time(),
            "access_count": 1,
        })

    def _compute_weight(self, entry: dict) -> float:
        age = time.time() - entry["timestamp"]
        decay = 0.5 ** (age / self.half_life)
        access_boost = min(entry["access_count"] / 5, 1.0)
        return decay * (0.5 + 0.5 * access_boost)

    def search(self, query: str, top_k: int = 5) -> list[dict]:
        scored = [
            {"content": e["content"], "weight": self._compute_weight(e)}
            for e in self.entries
        ]
        scored.sort(key=lambda x: x["weight"], reverse=True)
        return scored[:top_k]
```

### 6.4 知识蒸馏（Knowledge Distillation）

定期对旧记忆进行归纳总结，将多条低级记忆蒸馏为少量高级知识。这是 Mem0 等框架的核心策略。

---

## 七、技术方案对比表

| 维度 | LangChain Memory | LlamaIndex Memory | 自建 Redis | 自建向量数据库 |
|------|-----------------|-------------------|-----------|--------------|
| **延迟** | 中等（依赖 LLM 摘要调用） | 中等 | 低（内存级 <1ms） | 中等（取决于索引规模） |
| **成本** | 高（LLM 调用费） | 高 | 低（基础设施成本） | 中等（embedding 调用费） |
| **复杂度** | 低（开箱即用） | 低 | 中等（需要自行设计序列化） | 高（需要自行设计检索逻辑） |
| **可扩展性** | 中等（受 LLM 限制） | 中等 | 高（Redis Cluster 水平扩展） | 高（Qdrant/Weaviate 分布式） |
| **查询能力** | 有限（仅支持检索） | 较强（支持 RAG 集成） | 中等（支持 TTL/范围查询） | 强（语义检索 + 过滤） |
| **跨会话持久化** | 需自行集成 | 需自行集成 | 原生支持 | 原生支持 |
| **适合场景** | 快速原型、Demo | RAG 重的 Agent | 低延迟生产系统 | 需要语义检索的复杂 Agent |

### 选型建议

- **快速验证**：直接用 LangChain 的 `ConversationSummaryBufferMemory`，30 分钟搭建可用的记忆系统
- **生产级低延迟**：自建 Redis 方案，结合 JSON 序列化和 TTL 管理
- **需要语义检索**：自建 Qdrant/Weaviate 方案，或使用 Mem0 这类专用框架
- **混合方案**：Redis 做短期/工作记忆 + 向量数据库做长期记忆，这是目前生产中最常见的架构

---

## 八、安全视角

Agent 记忆系统引入了传统 LLM 应用中不存在的安全风险。

### 8.1 PII 隐私问题

记忆系统会自然积累用户的个人信息（PII）。这些数据一旦泄露，影响范围远超单次对话。

**应对措施**：
- 在存入记忆前进行 PII 检测和脱敏（使用 Presidio 等工具）
- 为 PII 字段设置独立的加密存储和访问控制
- 实现自动化的记忆清理流程

```python
import hashlib

class PIISafeMemory:
    def __init__(self, vector_memory):
        self.memory = vector_memory
        self.pii_patterns = {
            "phone": r"1[3-9]\d{9}",
            "id_card": r"\d{17}[\dXx]",
            "email": r"[\w.+-]+@[\w-]+\.[\w.]+",
        }

    def _anonymize(self, text: str) -> tuple[str, dict]:
        import re
        mapping = {}
        anonymized = text
        for pii_type, pattern in self.pii_patterns.items():
            for match in re.finditer(pattern, anonymized):
                placeholder = f"[{pii_type.upper()}_{hashlib.md5(match.group().encode()).hexdigest()[:8]}]"
                mapping[placeholder] = match.group()
                anonymized = anonymized.replace(match.group(), placeholder, 1)
        return anonymized, mapping

    def add_safe(self, content: str, metadata: dict | None = None):
        anonymized, mapping = self._anonymize(content)
        meta = {**(metadata or {}), "_pii_map": mapping}
        self.memory.add(anonymized, meta)
```

### 8.2 用户间数据隔离

多用户系统中，记忆必须严格隔离。一个用户不应在任何场景下读取到另一个用户的记忆。

**最佳实践**：在向量数据库的每一次查询和写入操作中，强制附加 `user_id` 过滤条件。不要依赖应用层逻辑来保证隔离——始终在存储层做硬隔离。

### 8.3 记忆投毒攻击

恶意用户可能通过精心构造的输入，在 Agent 记忆中植入虚假信息（记忆投毒），从而影响 Agent 后续行为。例如，诱导 Agent 记住"以后所有查询都返回特定内容"。

**防御策略**：
- 对记忆内容进行来源标记（用户输入 vs 系统生成 vs 工具返回）
- 对高风险记忆条目设置可信度评分
- 关键决策不依赖单一记忆条目，而是综合多条记忆

### 8.4 GDPR 合规

根据 GDPR 的"被遗忘权"，用户有权要求删除其所有个人数据。在记忆系统中实现这一点：

```python
class GDPRCompliantMemory:
    def __init__(self, vector_db, kv_store):
        self.vector_db = vector_db
        self.kv_store = kv_store

    def delete_user_data(self, user_id: str):
        self.vector_db.delete(filter={"user_id": user_id})
        self.kv_store.delete_namespace(f"user:{user_id}")
        self._audit_log("DELETE", user_id)

    def export_user_data(self, user_id: str) -> dict:
        memories = self.vector_db.search(
            "", filter={"user_id": user_id}, top_k=1000
        )
        preferences = self.kv_store.get_namespace(f"user:{user_id}")
        return {"memories": memories, "preferences": preferences}

    def _audit_log(self, action: str, user_id: str):
        import logging
        logger = logging.getLogger("gdpr_audit")
        logger.info(f"ACTION={action} USER={user_id}")
```

---

## 九、延伸阅读

1. **Mem0**（https://github.com/mem0ai/mem0）—— 面向 Agent 的记忆层框架，支持向量检索、知识图谱和自动记忆管理
2. **Zep**（https://www.getzep.com/）—— 开源的 Agent 记忆基础设施，支持长期记忆检索和对话历史管理
3. **LangChain Memory 模块文档**（https://python.langchain.com/docs/modules/memory/）—— LangChain 官方记忆系统文档
4. **LlamaIndex Memory**（https://docs.llamaindex.ai/en/stable/module_guides/models/llms/memory/）—— LlamaIndex 的对话记忆集成方案
5. **MemGPT 论文**（https://arxiv.org/abs/2310.08560）—— 提出"虚拟上下文管理"概念，用有限的 context window 模拟无限记忆
6. **Generative Agents 论文**（https://arxiv.org/abs/2304.03442）—— 斯坦福"小镇"实验，展示了记忆流 + 反思机制如何产生涌现行为
7. **Qdrant**（https://qdrant.tech/）—— 高性能向量数据库，支持丰富的过滤和检索策略
8. **Redis Stack**（https://redis.io/docs/stack/）—— Redis 的向量搜索和 JSON 模块，适合构建混合存储的记忆系统
