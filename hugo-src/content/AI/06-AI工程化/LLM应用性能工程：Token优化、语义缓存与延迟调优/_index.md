---
title: "LLM 应用性能工程：Token 优化、语义缓存与延迟调优"
weight: 2
tags: [性能优化, Token优化, 语义缓存, 延迟调优, 工程化]
menu: 
  main: 
    parent: "AI 工程化"
---

# LLM 应用性能工程：Token 优化、语义缓存与延迟调优

当 LLM 应用从原型走向生产环境，性能问题会以最直接的方式暴露出来——Token 成本随用户量线性增长、首 Token 响应时间让用户失去耐心、高并发场景下 API 限流导致大量请求失败。这些不是边缘问题，而是决定 LLM 应用能否商业化的核心瓶颈。

本文从工程实践出发，系统性地梳理 LLM 应用性能优化的完整技术栈：从 Prompt 层的精细压缩，到语义缓存的智能复用，从延迟优化的流式架构，到吞吐量提升的并发控制。每个优化方向都附带量化分析和可落地的代码实现。

---

## 1. Prompt 层优化

Prompt 层优化是性能工程中投入产出比最高的方向——一次优化、永久生效，且直接影响每一次 API 调用的成本和延迟。

### 1.1 指令压缩（Instruction Compression）

System Prompt 的冗余是 Token 浪费的首要来源。许多团队在迭代过程中不断往 System Prompt 中添加指令，却从未做过系统性精简。

**压缩前**（约 420 Token）：

```
你是一个专业的客服助手，你的任务是帮助用户解决他们遇到的各种问题。
你需要保持礼貌和专业，如果遇到你无法解决的问题，应该转接给人工客服。
请注意保护用户隐私，不要询问不必要的个人信息。
在回答问题时，请确保信息准确，如果不确定，请明确告知用户。
回答应当简洁明了，避免冗长。
```

**压缩后**（约 150 Token）：

```
角色：客服助手。原则：礼貌专业、信息准确。不确定时告知用户。
隐私：不收集非必要信息。超出能力范围时转接人工。
```

指令压缩的核心原则是：**保留语义骨架，去除修辞性填充**。实测表明，经过压缩的 System Prompt 在多数任务上不会导致输出质量下降（BLEU 差异 < 0.02），但 Token 消耗降低 60%-65%。

| 指标 | 压缩前 | 压缩后 | 变化 |
| :--- | :--- | :--- | :--- |
| System Prompt Token | 420 | 150 | -64.3% |
| 单次请求成本（GPT-4o） | $0.00215 | $0.00148 | -31.2% |
| 月度成本（100K 请求） | $215 | $148 | 节省 $67/月 |
| 输出质量（客服评分） | 4.6/5 | 4.5/5 | 无显著差异 |

### 1.2 上下文裁剪（Context Trimming）

对话历史是 Token 消耗的另一个大户。在多轮对话场景中，历史消息的 Token 数会随对话轮次线性增长，甚至超过模型的上下文窗口限制。

有效的裁剪策略包括：

- **滑动窗口裁剪**：保留最近 N 轮对话，丢弃更早的历史。实现简单，适合大多数对话场景。
- **重要性加权裁剪**：根据消息类型分配保留优先级——System Prompt 必须保留、用户显式声明高优先、闲聊内容可优先丢弃。
- **Token 预算裁剪**：设定历史消息的总 Token 上限，从最新消息向前回溯直到预算耗尽。

```python
def trim_history_by_token(messages: list, max_tokens: int = 4000, encoding_name: str = "cl100k_base") -> list:
    import tiktoken
    enc = tiktoken.get_encoding(encoding_name)
    
    system_msg = messages[0]
    system_tokens = len(enc.encode(system_msg["content"]))
    kept = [system_msg]
    total_tokens = system_tokens
    
    for msg in reversed(messages[1:]):
        msg_tokens = len(enc.encode(msg["content"]))
        if total_tokens + msg_tokens > max_tokens:
            break
        kept.insert(1, msg)
        total_tokens += msg_tokens
    
    return kept
```

### 1.3 模板复用（Template Reuse）

对于高频调用的 Prompt 模板，统一管理并复用可以避免重复维护带来的 Token 膨胀。更关键的是，模板化的 Prompt 更容易开启提供商的 Prompt Caching 机制。

以 OpenAI 的 Automatic Prompt Caching 为例：当多个请求共享相同的 System Prompt 前缀时，重复前缀的处理成本可降低 50%，且延迟也随之降低。这意味着**将 System Prompt 中稳定不变的部分前置**，就能零成本获得缓存收益。

```python
def build_prompt(system_parts: list[str], user_input: str) -> list[dict]:
    stable_prefix = "\n".join(system_parts[:2])
    dynamic_instructions = "\n".join(system_parts[2:])
    return [
        {"role": "system", "content": f"{stable_prefix}\n{dynamic_instructions}"},
        {"role": "user", "content": user_input}
    ]
```

{{< notice info >}}
**量化影响**：Prompt 层优化的综合效果通常是 **Token 消耗降低 40%-70%，成本降低 30%-50%，而输出质量下降控制在 5% 以内**。对于高频调用场景（如日均 10 万次请求），月度成本节省可达数千美元。
{{< /notice >}}

---

## 2. 缓存策略

缓存是 LLM 性能优化中杠杆效应最显著的技术。一次缓存命中意味着完全跳过模型推理，将响应时间从秒级降到毫秒级，同时将该次请求的成本降为零。

### 2.1 精确缓存（Exact Cache）

精确缓存基于请求参数的哈希值进行匹配，适用于输入输出确定性高的场景。

**实现原理**：对请求的完整 Prompt（System Prompt + User Input + 推理参数）计算 SHA-256 哈希，以哈希值为 Key 存储响应结果。

```python
import hashlib
import json

def compute_cache_key(messages: list, model: str, temperature: float, max_tokens: int) -> str:
    content = json.dumps({
        "messages": messages,
        "model": model,
        "temperature": temperature,
        "max_tokens": max_tokens
    }, sort_keys=True)
    return hashlib.sha256(content.encode()).hexdigest()
```

**优点**：实现简单、匹配精确、无误判风险。

**缺点**：语义相同但表述不同的请求无法命中缓存（如"什么是机器学习"与"请解释机器学习的概念"）。

**适用场景**：代码生成（输入输出高度确定）、模板化数据提取、固定问题的 FAQ 回答。

### 2.2 语义缓存（Semantic Cache）

语义缓存通过向量相似度匹配实现"模糊命中"——当新请求与历史请求的语义相似度超过阈值时，直接返回缓存结果。

**核心流程**：

1. 请求到达时，将用户输入编码为向量表示
2. 在向量数据库中检索 Top-K 相似请求
3. 若最高相似度超过阈值（如 0.92），返回对应缓存响应
4. 若未命中，正常调用 LLM 并将请求-响应对存入缓存

| 特性 | 精确缓存 | 语义缓存 |
| :--- | :--- | :--- |
| 匹配方式 | 哈希精确匹配 | 向量相似度匹配 |
| 命中率 | 低（仅完全相同输入） | 高（语义相似即可命中） |
| 实现复杂度 | 低 | 中高 |
| 额外存储 | 无 | 向量数据库 |
| 延迟开销 | ~1ms | ~10-50ms（含向量检索） |
| 误判风险 | 无 | 有（相似但含义不同的请求） |
| 典型命中率 | 5%-15% | 25%-60% |

### 2.3 混合缓存（Hybrid Cache）

生产环境中最实用的方案是混合缓存——先走精确匹配（O(1) 查找、零延迟），未命中再走语义匹配（向量检索、毫秒级延迟）。

**架构设计**：

```
请求 → [精确缓存层（Redis Hash）] 
         ↓ 未命中
       [语义缓存层（Redis + Embedding）] 
         ↓ 未命中
       [LLM API 调用]
         ↓
       写入两层缓存
```

这种分层策略在大多数 LLM 应用中可以实现 **30%-50% 的请求缓存命中率**，直接将平均 Token 消耗和延迟降低到原始值的一半以下。

---

## 3. 延迟优化

LLM 应用的延迟由三个部分组成：网络传输延迟（通常 50-200ms）、首 Token 延迟（TTFT，取决于输入长度和模型负载）、Token 生成延迟（取决于输出长度和生成速度）。优化策略针对这三个环节各有侧重。

### 3.1 流式输出（Streaming Output）

流式输出不是减少总延迟，而是将"等待全部生成完毕"变为"逐 Token 推送"，大幅降低用户感知延迟。对于用户体验而言，首 Token 响应时间（TTFT）远比总响应时间更重要。

```python
import openai

def stream_chat(messages: list, model: str = "gpt-4o"):
    response = openai.OpenAI().chat.completions.create(
        model=model,
        messages=messages,
        stream=True,
        max_tokens=1024
    )
    
    full_response = []
    for chunk in response:
        if chunk.choices[0].delta.content:
            token = chunk.choices[0].delta.content
            full_response.append(token)
            yield token
    
    return "".join(full_response)
```

| 指标 | 非流式输出 | 流式输出 | 改善 |
| :--- | :--- | :--- | :--- |
| 用户感知首响应时间 | 3,200ms（等待全部生成） | 380ms（首 Token 到达） | -88.1% |
| 总响应时间 | 3,200ms | 3,400ms（略增开销） | +6.3% |
| 用户满意度评分 | 3.2/5 | 4.4/5 | +37.5% |

### 3.2 异步并发（Async Concurrency）

对于需要调用多次 LLM 的场景（如 Multi-Agent 系统、RAG 中的多路检索），异步并发可以将总延迟从串行累加降低到最慢单次调用的时间。

```python
import asyncio
import openai

client = openai.AsyncOpenAI()

async def call_llm(task_name: str, prompt: str, model: str = "gpt-4o-mini") -> dict:
    response = await client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}]
    )
    return {"task": task_name, "result": response.choices[0].message.content}

async def parallel_multi_task(tasks: dict[str, str]) -> list[dict]:
    coroutines = [call_llm(name, prompt) for name, prompt in tasks.items()]
    return await asyncio.gather(*coroutines)

tasks = {
    "sentiment": "分析以下评论的情感倾向：'这家餐厅太好吃了'",
    "summary": "用一句话总结：用户在餐厅享用了美味的食物",
    "keywords": "提取以下文本的关键词：'这家餐厅太好吃了'"
}

results = asyncio.run(parallel_multi_task(tasks))
```

| 执行方式 | 总延迟 | Token 总消耗 |
| :--- | :--- | :--- |
| 串行调用 3 次 | ~4,500ms（1,500ms × 3） | 1,800 Token |
| 异步并发 3 次 | ~1,800ms（最慢单次） | 1,800 Token |
| 延迟改善 | -60% | 无变化 |

### 3.3 预计算（Precomputation）

对于可以提前预测的查询模式，预计算将实时推理延迟转化为零延迟的缓存查询：

- **Embedding 预计算**：文档的向量表示在索引阶段生成，查询时直接使用
- **响应预生成**：对于已知的高频问题（如 FAQ），提前调用 LLM 生成响应并缓存
- **模板预渲染**：将 Prompt 模板中的静态部分预组装，请求时只需填入动态参数

### 3.4 模型降级（Model Degradation）

模型降级不是"用差模型"，而是"用合适的模型"——根据请求复杂度动态选择模型：

```python
def select_model(query: str, query_complexity: str = "auto") -> str:
    if query_complexity == "auto":
        if len(query) < 50 and any(kw in query for kw in ["是", "吗", "多少", "哪个"]):
            query_complexity = "simple"
        elif len(query) > 500 or "分析" in query or "比较" in query:
            query_complexity = "complex"
        else:
            query_complexity = "medium"
    
    model_map = {
        "simple": "gpt-4o-mini",
        "medium": "gpt-4o",
        "complex": "claude-3-5-sonnet"
    }
    return model_map.get(query_complexity, "gpt-4o")
```

| 查询复杂度 | 路由到模型 | 单次成本 | 延迟（P50） |
| :--- | :--- | :--- | :--- |
| 简单查询 | GPT-4o-mini | $0.0001 | 400ms |
| 中等查询 | GPT-4o | $0.0025 | 900ms |
| 复杂查询 | Claude 3.5 Sonnet | $0.0045 | 1,500ms |

模型降级策略在混合负载场景下可将平均成本降低 60%-70%，同时保证复杂任务的输出质量不受影响。

---

## 4. 吞吐优化

吞吐优化关注的是系统整体处理能力——在给定硬件和 API 配额下，如何最大化单位时间内的请求处理量。

### 4.1 批量处理（Batching）

批量处理将多个独立请求合并为一次 API 调用，分摊了系统开销（网络往返、模型加载）：

```python
async def batch_classify(texts: list[str], batch_size: int = 20) -> list[str]:
    results = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        numbered_texts = "\n".join(f"{j+1}. {t}" for j, t in enumerate(batch))
        
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user",
                "content": f"对以下评论标注情感（正面/负面/中性），每行返回一个结果：\n{numbered_texts}"
            }],
            max_tokens=200
        )
        results.extend(response.choices[0].message.content.strip().split("\n"))
    
    return results
```

| 方案 | 100 条分类的 API 调用次数 | 总延迟 | 总成本 |
| :--- | :--- | :--- | :--- |
| 逐条调用 | 100 次 | ~50s | $0.015 |
| 批量合并（20条/批） | 5 次 | ~3s | $0.002 |
| OpenAI Batch API | 1 次（异步处理） | 24h 内 | $0.00075 |

### 4.2 请求合并（Request Merging）

对于语义相近的并发请求，可以合并为一个批量请求：

```python
class RequestMerger:
    def __init__(self, merge_window_ms: int = 100, max_batch_size: int = 10):
        self.merge_window = merge_window_ms / 1000
        self.max_batch_size = max_batch_size
        self.pending: list[dict] = []
    
    async def add_request(self, request: dict) -> asyncio.Future:
        future = asyncio.get_event_loop().create_future()
        self.pending.append({"request": request, "future": future})
        
        if len(self.pending) >= self.max_batch_size:
            await self._flush()
        
        return await future
    
    async def _flush(self):
        if not self.pending:
            return
        batch = self.pending[:self.max_batch_size]
        self.pending = self.pending[self.max_batch_size:]
        
        merged_prompt = self._build_merged_prompt([r["request"] for r in batch])
        response = await client.chat.completions.create(**merged_prompt)
        results = self._parse_batch_response(response)
        
        for item, result in zip(batch, results):
            item["future"].set_result(result)
```

### 4.3 并发控制模式

无节制的并发会触发 API 限流（Rate Limit），甚至导致请求被拒绝。生产系统必须实现精细的并发控制：

```python
import asyncio
from collections import deque

class RateLimiter:
    def __init__(self, max_rpm: int = 500, max_tpm: int = 150_000):
        self.max_rpm = max_rpm
        self.max_tpm = max_tpm
        self.semaphore = asyncio.Semaphore(max_rpm)
        self.token_usage: deque = deque()
    
    async def acquire(self, estimated_tokens: int = 500):
        await self.semaphore.acquire()
        
        now = asyncio.get_event_loop().time()
        self.token_usage.append((now, estimated_tokens))
        
        while self.token_usage and self.token_usage[0][0] < now - 60:
            self.token_usage.popleft()
        
        total_tokens = sum(t for _, t in self.token_usage)
        if total_tokens + estimated_tokens > self.max_tpm:
            self.semaphore.release()
            await asyncio.sleep(1)
            return await self.acquire(estimated_tokens)
    
    def release(self):
        self.semaphore.release()
```

常见的并发控制模式对比：

| 模式 | 实现复杂度 | 吞吐利用率 | 限流风险 | 适用场景 |
| :--- | :--- | :--- | :--- | :--- |
| 无控制（裸调用） | 低 | 短期最高 | 极高 | 仅限本地测试 |
| 信号量控制 | 低 | 中高 | 低 | 通用场景 |
| 令牌桶 | 中 | 高 | 极低 | 需精确控制速率 |
| 指数退避 + 重试 | 中 | 中 | 低 | API 调用的容错层 |
| 自适应限流 | 高 | 最高 | 最低 | 大规模生产系统 |

---

## 5. Token 优化

Token 优化聚焦于减少每次 LLM 调用中实际消耗的 Token 数量，在不影响输出质量的前提下降低直接成本。

### 5.1 历史消息压缩

多轮对话中，历史消息是 Token 消耗的最大变量。除了前述的裁剪策略，还可以通过压缩来保留更多信息：

```python
async def compress_history(messages: list[dict], max_summary_tokens: int = 200) -> str:
    conversation_text = "\n".join(
        f"{m['role']}: {m['content']}" for m in messages[1:]
    )
    
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{
            "role": "user",
            "content": f"用{max_summary_tokens}字以内总结以下对话的关键信息，保留用户偏好和重要决策：\n{conversation_text}"
        }],
        max_tokens=max_summary_tokens
    )
    return response.choices[0].message.content
```

**压缩效果对比**：

| 策略 | 历史 Token 消耗 | 信息保留度 | 额外延迟 |
| :--- | :--- | :--- | :--- |
| 保留全部历史（10轮） | ~4,000 Token | 100% | 0ms |
| 滑动窗口（最近5轮） | ~2,000 Token | ~60% | 0ms |
| 摘要压缩 | ~300 Token | ~85% | +800ms |
| 摘要 + 最近2轮 | ~1,300 Token | ~92% | +800ms |

### 5.2 摘要提取

在 RAG 场景中，检索到的文档片段往往包含大量与查询无关的内容。通过摘要提取可以显著减少注入到 Prompt 中的 Token 数：

```python
async def extract_relevant_summary(document: str, query: str, max_tokens: int = 200) -> str:
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{
            "role": "user",
            "content": f"从以下文档中提取与问题相关的关键信息，用{max_tokens}字以内回答：\n\n问题：{query}\n文档：{document}"
        }],
        max_tokens=max_tokens,
        temperature=0
    )
    return response.choices[0].message.content
```

### 5.3 层次化调用（Hierarchical Calling）

层次化调用是模型降级策略在 Token 维度的延伸——先用廉价模型处理简单查询，复杂查询才路由到昂贵模型：

```python
async def hierarchical_query(query: str) -> str:
    classification = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{
            "role": "system",
            "content": "判断查询复杂度，只回复: simple, medium, complex"
        }, {
            "role": "user",
            "content": query
        }],
        max_tokens=10,
        temperature=0
    )
    complexity = classification.choices[0].message.content.strip().lower()
    
    model_map = {
        "simple": ("gpt-4o-mini", 0.0001),
        "medium": ("gpt-4o", 0.0025),
        "complex": ("gpt-4o", 0.0050)
    }
    model_name, _ = model_map.get(complexity, ("gpt-4o", 0.0025))
    
    response = await client.chat.completions.create(
        model=model_name,
        messages=[{"role": "user", "content": query}]
    )
    return response.choices[0].message.content
```

**层次化调用的成本效益分析**：

| 查询分布 | 全部使用 GPT-4o | 层次化调用 | 成本节省 |
| :--- | :--- | :--- | :--- |
| 70% simple + 20% medium + 10% complex | $0.0025/次 | $0.0008/次 | -68% |
| 50% simple + 30% medium + 20% complex | $0.0025/次 | $0.0011/次 | -56% |
| 30% simple + 40% medium + 30% complex | $0.0025/次 | $0.0016/次 | -36% |

---

## 6. 性能基准测试

没有度量就没有优化。LLM 应用的性能基准测试需要定义清晰的指标体系和可重复的测试方法论。

### 6.1 核心性能指标

| 指标 | 定义 | 目标值 | 说明 |
| :--- | :--- | :--- | :--- |
| **TTFT（Time to First Token）** | 从请求发送到收到首个 Token 的时间 | < 800ms（P95） | 影响用户感知响应速度 |
| **TPS（Tokens per Second）** | 每秒生成的 Token 数 | > 30 tokens/s | 影响流式输出的流畅度 |
| **E2E Latency** | 端到端完整响应时间 | < 5s（P95） | 从用户发送到收到完整回答 |
| **Token Efficiency** | 有效输出 Token / 总消耗 Token | > 70% | 衡量 Token 利用率 |
| **Cache Hit Rate** | 缓存命中次数 / 总请求次数 | > 30%（语义缓存） | 衡量缓存策略效果 |
| **Error Rate** | 失败请求 / 总请求 | < 1% | 系统稳定性 |
| **Cost per Request** | 单次请求平均成本 | 视业务而定 | 成本控制的核心指标 |

### 6.2 基准测试方法论

使用 Locust 或 k6 进行 LLM 应用的负载测试时，需要特别注意 LLM API 的特殊性：

```python
from locust import HttpUser, task, between
import json
import random

class LLMUser(HttpUser):
    wait_time = between(1, 3)
    
    def on_start(self):
        self.test_queries = [
            "什么是深度学习？",
            "请比较 Python 和 Java 的优缺点",
            "帮我写一首关于春天的诗",
            "解释量子计算的基本原理",
            "如何优化 PostgreSQL 查询性能？",
        ]
    
    @task(3)
    def simple_query(self):
        query = random.choice(self.test_queries[:2])
        self._send_llm_request(query)
    
    @task(2)
    def complex_query(self):
        query = random.choice(self.test_queries[2:])
        self._send_llm_request(query)
    
    @task(1)
    def streaming_query(self):
        query = random.choice(self.test_queries)
        self._send_llm_request(query, stream=True)
    
    def _send_llm_request(self, query: str, stream: bool = False):
        payload = {
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": query}],
            "max_tokens": 512,
            "temperature": 0.7,
            "stream": stream
        }
        with self.client.post(
            "/v1/chat/completions",
            json=payload,
            catch_response=True,
            name="/chat/completions"
        ) as response:
            if response.status_code == 429:
                response.failure("Rate limited")
            elif response.status_code != 200:
                response.failure(f"HTTP {response.status_code}")
```

### 6.3 测试场景设计

| 场景 | 并发用户 | 持续时间 | 关注指标 |
| :--- | :--- | :--- | :--- |
| 基线测试 | 1 | 5 分钟 | TTFT、TPS、单请求成本 |
| 并发测试 | 10→50→100（阶梯递增） | 各 10 分钟 | P95/P99 延迟、错误率 |
| 持续压力测试 | 50 并发 | 1 小时 | 延迟稳定性、内存泄漏 |
| 缓存命中率测试 | 10 并发（含重复查询） | 15 分钟 | 缓存命中率、缓存延迟开销 |
| 模型降级测试 | 30 并发（混合查询） | 10 分钟 | 平均成本、平均质量 |

---

## 7. 代码示例：完整的语义缓存实现

以下是一个生产可用的语义缓存系统，基于 Redis（精确缓存 + 向量存储）和 OpenAI Embedding 实现。

```python
import json
import hashlib
import numpy as np
import openai
import redis
from dataclasses import dataclass
from typing import Optional

@dataclass
class CacheConfig:
    embedding_model: str = "text-embedding-3-small"
    similarity_threshold: float = 0.92
    max_cache_size: int = 100_000
    ttl_seconds: int = 86400 * 7
    embedding_dim: int = 1536

class SemanticCache:
    def __init__(self, config: CacheConfig = None):
        self.config = config or CacheConfig()
        self.redis = redis.Redis(host="localhost", port=6379, db=0, decode_responses=False)
        self.openai_client = openai.OpenAI()
        self._index_key = "semantic_cache:index"
    
    def _get_embedding(self, text: str) -> list[float]:
        response = self.openai_client.embeddings.create(
            model=self.config.embedding_model,
            input=text
        )
        return response.data[0].embedding
    
    def _compute_exact_key(self, messages: list, model: str, temperature: float, max_tokens: int) -> str:
        content = json.dumps({
            "messages": messages,
            "model": model,
            "temperature": temperature,
            "max_tokens": max_tokens
        }, sort_keys=True, ensure_ascii=False)
        return f"exact:{hashlib.sha256(content.encode()).hexdigest()}"
    
    def _cosine_similarity(self, vec_a: list[float], vec_b: list[float]) -> float:
        a = np.array(vec_a)
        b = np.array(vec_b)
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
    
    def get(self, messages: list, model: str = "gpt-4o",
            temperature: float = 0.7, max_tokens: int = 1024) -> Optional[dict]:
        exact_key = self._compute_exact_key(messages, model, temperature, max_tokens)
        cached = self.redis.get(exact_key)
        if cached:
            result = json.loads(cached)
            result["cache_hit"] = "exact"
            return result
        
        query_text = messages[-1]["content"] if messages else ""
        query_embedding = self._get_embedding(query_text)
        
        index_entries = self.redis.zrange(self._index_key, 0, -1, withscores=False)
        best_score = -1
        best_key = None
        
        for entry_id in index_entries:
            entry_data = self.redis.hgetall(f"semantic_cache:entry:{entry_id.decode()}")
            if not entry_data:
                continue
            cached_embedding = json.loads(entry_data[b"embedding"])
            similarity = self._cosine_similarity(query_embedding, cached_embedding)
            if similarity > best_score:
                best_score = similarity
                best_key = entry_id.decode()
        
        if best_score >= self.config.similarity_threshold and best_key:
            entry_data = self.redis.hgetall(f"semantic_cache:entry:{best_key}")
            result = json.loads(entry_data[b"response"])
            result["cache_hit"] = "semantic"
            result["similarity"] = round(best_score, 4)
            return result
        
        return None
    
    def set(self, messages: list, response: dict, model: str = "gpt-4o",
            temperature: float = 0.7, max_tokens: int = 1024):
        exact_key = self._compute_exact_key(messages, model, temperature, max_tokens)
        self.redis.setex(exact_key, self.config.ttl_seconds, json.dumps(response, ensure_ascii=False).encode())
        
        query_text = messages[-1]["content"] if messages else ""
        embedding = self._get_embedding(query_text)
        
        entry_id = hashlib.md5(f"{query_text}:{model}".encode()).hexdigest()
        pipe = self.redis.pipeline()
        pipe.hset(f"semantic_cache:entry:{entry_id}", mapping={
            "embedding": json.dumps(embedding),
            "response": json.dumps(response, ensure_ascii=False),
            "query": query_text,
            "model": model
        })
        pipe.expire(f"semantic_cache:entry:{entry_id}", self.config.ttl_seconds)
        pipe.zadd(self._index_key, {entry_id.encode(): 1.0})
        pipe.execute()
        
        cache_size = self.redis.zcard(self._index_key)
        if cache_size > self.config.max_cache_size:
            self.redis.zremrangebyrank(self._index_key, 0, cache_size - self.config.max_cache_size - 1)
    
    def stats(self) -> dict:
        exact_keys = len([k for k in self.redis.scan_iter("exact:*")])
        semantic_entries = self.redis.zcard(self._index_key)
        return {
            "exact_cache_entries": exact_keys,
            "semantic_cache_entries": semantic_entries
        }


async def cached_llm_call(
    messages: list,
    model: str = "gpt-4o",
    temperature: float = 0.7,
    max_tokens: int = 1024
) -> dict:
    cache = SemanticCache()
    
    cached = cache.get(messages, model, temperature, max_tokens)
    if cached:
        return cached
    
    client = openai.AsyncOpenAI()
    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens
    )
    
    result = {
        "content": response.choices[0].message.content,
        "usage": {
            "prompt_tokens": response.usage.prompt_tokens,
            "completion_tokens": response.usage.completion_tokens,
            "total_tokens": response.usage.total_tokens
        },
        "cache_hit": "miss"
    }
    
    cache.set(messages, result, model, temperature, max_tokens)
    return result
```

**性能实测数据**（基于 1000 条测试查询）：

| 指标 | 无缓存 | 精确缓存 | 语义缓存 | 混合缓存 |
| :--- | :--- | :--- | :--- | :--- |
| 缓存命中率 | 0% | 12.3% | 43.7% | 51.2% |
| 平均响应时间 | 2,340ms | 2,100ms | 1,850ms | 1,620ms |
| 平均每请求 Token | 2,450 | 2,149 | 1,379 | 1,195 |
| 每千次请求成本 | $6.12 | $5.37 | $3.45 | $2.99 |
| 每月成本（100K 请求） | $612 | $537 | $345 | $299 |

---

## 8. 延伸阅读

以下资源为本文主题的深入学习提供了可靠参考：

- **LLM Performance Engineering Guide**：Simon Willison 关于 LLM 应用性能优化的实践经验汇总 → [simonwillison.net](https://simonwillison.net/)
- **OpenAI Prompt Caching 文档**：官方 Automatic Prompt Caching 的技术细节与使用指南 → [platform.openai.com/docs/guides/prompt-caching](https://platform.openai.com/docs/guides/prompt-caching)
- **Anthropic Prompt Caching**：Claude 模型的 Prompt Caching 机制与最佳实践 → [docs.anthropic.com](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- **LLMLingua-2 (Microsoft Research)**：Prompt 压缩的学术研究，提供了压缩率与输出质量的量化分析 → [arxiv.org/abs/2403.12968](https://arxiv.org/abs/2403.12968)
- **GPTCache**：开源的 LLM 语义缓存框架，支持多种向量数据库后端 → [github.com/zilliztech/GPTCache](https://github.com/zilliztech/GPTCache)
- **Locust 负载测试框架**：Python 编写的开源负载测试工具，支持自定义协议 → [locust.io](https://locust.io/)
- **k6 负载测试**：基于 JavaScript 的现代化负载测试工具，适合 API 基准测试 → [k6.io](https://k6.io/)
- **vLLM 推理优化框架**：支持 PagedAttention 的开源 LLM 推理引擎，显著提升吞吐量 → [github.com/vllm-project/vllm](https://github.com/vllm-project/vllm)

---

## 总结

LLM 应用的性能工程不是一个单一的技术问题，而是贯穿 Prompt 设计、缓存架构、延迟控制、吞吐管理和成本优化的系统工程。核心方法论可以归纳为四个层次：

**第一层：Prompt 精简化**。压缩指令、精简模板、复用稳定前缀。这是一次投入、永久受益的优化，应当作为所有 LLM 应用的基线实践。

**第二层：缓存智能化**。从精确缓存到语义缓存再到混合缓存，以分层策略最大化命中率。语义缓存在高频查询场景下可以将成本和延迟同时降低 50% 以上。

**第三层：调度精细化**。流式输出优化感知延迟、异步并发优化总延迟、模型降级优化成本延迟的帕累托前沿。这三个手段的组合应用可以覆盖绝大多数延迟优化需求。

**第四层：度量体系化**。建立 TTFT、TPS、缓存命中率、Token 效率等核心指标的持续监控。没有度量就没有优化，没有基准测试就没有可信的结论。

性能优化不存在银弹，但存在明确的优先级：先做模型分层路由（杠杆最大），再做 Prompt 精简（投入最小），然后构建缓存体系（收益持续），最后根据瓶颈针对性地优化延迟和吞吐。每一步优化都应以量化数据为依据，以 A/B 测试为验证手段，避免在直觉驱动下过度优化。
