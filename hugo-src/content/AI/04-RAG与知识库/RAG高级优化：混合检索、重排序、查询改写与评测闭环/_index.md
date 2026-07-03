---
title: "RAG 高级优化：混合检索、重排序、查询改写与评测闭环"
weight: 3
tags: [RAG, 混合检索, 重排序, 查询改写, RAGAS, 优化]
menu: 
  main: 
    parent: "RAG 与知识库"
---

## 一、Naive RAG 的局限性

多数团队在搭建 RAG 系统时，第一版往往采用"向量检索 + LLM 生成"的最简架构。这种 Naive RAG 在 Demo 阶段效果尚可，一旦部署到生产环境，便会暴露出一系列系统性缺陷。

### 1.1 四种典型失败模式

| 失败模式 | 现象 | 根因 |
|----------|------|------|
| **检索不相关** | 检索到的文档与用户查询语义不匹配 | Embedding 模型对领域术语理解不足；纯向量检索无法捕捉精确关键词匹配 |
| **上下文污染** | 检索结果中混入噪声文档，LLM 被误导 | 检索结果未经过滤，Top-K 中包含低质量或不相关的 chunk |
| **Lost in the Middle** | 真正相关的文档被夹在中间位置，LLM 忽略 | LLM 对上下文中间位置信息的注意力显著下降（Liu et al., 2023） |
| **部分上下文幻觉** | LLM 基于部分检索结果生成看似合理但实际错误的回答 | 上下文不足以回答问题，LLM 用自身参数知识填充 |

### 1.2 从 Naive RAG 到 Advanced RAG

```
Naive RAG                          Advanced RAG
┌──────────────┐                   ┌──────────────────────────────┐
│ 用户查询      │                   │ 用户查询                      │
└──────┬───────┘                   └──────────┬───────────────────┘
       ▼                                      ▼
┌──────────────┐                   ┌──────────────────────────────┐
│  Embedding   │                   │  查询改写 (Query Rewrite)     │
└──────┬───────┘                   │  HyDE / Multi-Query / Step   │
       ▼                           └──────────┬───────────────────┘
┌──────────────┐                              ▼
│  向量检索     │                   ┌──────────────────────────────┐
│  Top-K       │                   │  混合检索 (Hybrid Search)     │
└──────┬───────┘                   │  向量 + BM25 + RRF 融合       │
       ▼                           └──────────┬───────────────────┘
┌──────────────┐                              ▼
│  拼接 Prompt  │                   ┌──────────────────────────────┐
│  LLM 生成    │                   │  重排序 (Reranking)           │
└──────────────┘                   │  Cross-Encoder 精排            │
                                   └──────────┬───────────────────┘
                                              ▼
                                   ┌──────────────────────────────┐
                                   │  上下文优化                    │
                                   │  压缩 / 去重 / 相关性过滤       │
                                   └──────────┬───────────────────┘
                                              ▼
                                   ┌──────────────────────────────┐
                                   │  生成优化 + 引用溯源           │
                                   └──────────┬───────────────────┘
                                              ▼
                                   ┌──────────────────────────────┐
                                   │  评测闭环 (RAGAS / TruLens)   │
                                   └──────────────────────────────┘
```

接下来我们逐一拆解每个优化环节的原理与实现。

---

## 二、混合检索（Hybrid Search）

纯向量检索依赖 Embedding 模型将文本编码为稠密向量，通过余弦相似度匹配。它的优势是语义理解能力强，但存在明显短板：

- **无法精确匹配关键词**：用户搜索"HTTP 429 错误"时，向量检索可能返回"HTTP 错误处理"的泛化内容，而非包含精确错误码的文档
- **对专业术语不敏感**：领域特有名词在 Embedding 空间中的表示可能不够精确
- **数值和日期匹配差**：向量检索对"2024年第三季度营收"这类查询效果不佳

**BM25 关键词检索**基于词频（TF）和逆文档频率（IDF）计算文本相关性，擅长精确匹配，但缺乏语义理解能力。两者的互补性使得混合检索成为生产环境的标配。

### 2.1 Reciprocal Rank Fusion (RRF)

RRF 是合并不同检索结果的主流算法。其核心思想是根据每个文档在不同检索列表中的排名来计算融合分数：

$$
\text{RRF}(d) = \sum_{i=1}^{n} \frac{1}{k + \text{rank}_i(d)}
$$

其中 $k$ 通常取 60（原始论文推荐值），$rank_i(d)$ 是文档 $d$ 在第 $i$ 个检索列表中的排名。

### 2.2 实现代码

```python
import numpy as np
from dataclasses import dataclass, field


@dataclass
class SearchResult:
    doc_id: str
    content: str
    score: float
    rank: int = 0


def reciprocal_rank_fusion(
    result_lists: list[list[SearchResult]],
    k: int = 60,
    top_n: int = 10
) -> list[SearchResult]:
    doc_scores: dict[str, float] = {}
    doc_map: dict[str, SearchResult] = {}

    for results in result_lists:
        for result in results:
            rrf_score = 1.0 / (k + result.rank)
            doc_scores[result.doc_id] = doc_scores.get(result.doc_id, 0.0) + rrf_score
            if result.doc_id not in doc_map:
                doc_map[result.doc_id] = result

    sorted_docs = sorted(doc_scores.items(), key=lambda x: x[1], reverse=True)[:top_n]

    fused_results = []
    for doc_id, score in sorted_docs:
        result = doc_map[doc_id]
        result.score = score
        fused_results.append(result)

    return fused_results
```

在实际系统中，混合检索的典型架构如下：

```python
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np


class HybridRetriever:
    def __init__(self, documents: list[dict]):
        self.documents = documents
        self.contents = [doc["content"] for doc in documents]

        tokenized_corpus = [list(content) for content in self.contents]
        self.bm25 = BM25Okapi(tokenized_corpus)

        self.embedding_model = SentenceTransformer("BAAI/bge-large-zh-v1.5")
        embeddings = self.embedding_model.encode(self.contents, normalize_embeddings=True)
        dimension = embeddings.shape[1]

        self.index = faiss.IndexFlatIP(dimension)
        self.index.add(embeddings.astype("float32"))

    def bm25_search(self, query: str, top_k: int = 20) -> list[SearchResult]:
        tokenized_query = list(query)
        scores = self.bm25.get_scores(tokenized_query)
        top_indices = np.argsort(scores)[::-1][:top_k]

        results = []
        for rank, idx in enumerate(top_indices):
            results.append(SearchResult(
                doc_id=str(idx),
                content=self.contents[idx],
                score=float(scores[idx]),
                rank=rank + 1
            ))
        return results

    def vector_search(self, query: str, top_k: int = 20) -> list[SearchResult]:
        query_embedding = self.embedding_model.encode([query], normalize_embeddings=True)
        distances, indices = self.index.search(query_embedding.astype("float32"), top_k)

        results = []
        for rank, (idx, score) in enumerate(zip(indices[0], distances[0])):
            if idx < 0:
                continue
            results.append(SearchResult(
                doc_id=str(idx),
                content=self.contents[idx],
                score=float(score),
                rank=rank + 1
            ))
        return results

    def hybrid_search(self, query: str, top_k: int = 10) -> list[SearchResult]:
        bm25_results = self.bm25_search(query, top_k=20)
        vector_results = self.vector_search(query, top_k=20)
        return reciprocal_rank_fusion([bm25_results, vector_results], top_n=top_k)
```

### 2.3 混合权重调优

不同场景下，向量检索和 BM25 的贡献比例不同。一种可调权重的 RRF 变体：

```python
def weighted_rrf(
    result_lists: list[tuple[list[SearchResult], float]],
    k: int = 60,
    top_n: int = 10
) -> list[SearchResult]:
    doc_scores: dict[str, float] = {}
    doc_map: dict[str, SearchResult] = {}

    for results, weight in result_lists:
        for result in results:
            rrf_score = weight / (k + result.rank)
            doc_scores[result.doc_id] = doc_scores.get(result.doc_id, 0.0) + rrf_score
            if result.doc_id not in doc_map:
                doc_map[result.doc_id] = result

    sorted_docs = sorted(doc_scores.items(), key=lambda x: x[1], reverse=True)[:top_n]

    return [
        SearchResult(doc_id=did, content=doc_map[did].content, score=score)
        for did, score in sorted_docs
    ]

bm25_results = retriever.bm25_search(query, top_k=20)
vector_results = retriever.vector_search(query, top_k=20)
fused = weighted_rrf([
    (bm25_results, 0.3),
    (vector_results, 0.7),
], top_n=10)
```

一般建议先将向量检索权重设为 0.6–0.8，再通过评测数据集微调。

---

## 三、重排序（Reranking）

混合检索完成的是**粗排**（Candidate Retrieval），其目标是在毫秒级延迟内从百万级文档中筛选出 Top-20 到 Top-50 的候选集。**重排序**（Reranking）则是对候选集进行**精排**——使用更强大的模型重新评估查询与每个文档的相关性。

### 3.1 为什么需要重排序

| 阶段 | 方法 | 延迟 | 精度 | 规模 |
|------|------|------|------|------|
| 粗排 | 向量检索 / BM25 | 5–50ms | 中等 | 百万级 |
| 精排 | Cross-Encoder / ColBERT | 50–500ms | 高 | Top-20 ~ Top-50 |

粗排模型（Bi-Encoder）独立编码查询和文档，计算余弦相似度，速度快但交互信息丢失。重排序模型（Cross-Encoder）将查询和文档拼接后联合编码，能捕捉更细粒度的交互特征，但计算成本高，只能处理少量候选。

### 3.2 Cross-Encoder 重排序

Cross-Encoder 将 `(query, document)` 作为一对输入，输出一个相关性分数：

```python
from sentence_transformers import CrossEncoder

cross_encoder = CrossEncoder("BAAI/bge-reranker-v2-m3", max_length=512)

query = "如何配置 Nginx 反向代理？"
candidates = [
    "Nginx 是一个高性能的 HTTP 和反向代理服务器...",
    "反向代理配置示例：server { listen 80; location / { proxy_pass http://backend; } }",
    "Docker 容器编排最佳实践...",
]

pairs = [(query, doc) for doc in candidates]
scores = cross_encoder.predict(pairs)

ranked = sorted(zip(candidates, scores), key=lambda x: x[1], reverse=True)
for doc, score in ranked:
    print(f"[{score:.4f}] {doc[:60]}...")
```

### 3.3 ColBERT：延迟交互的折中方案

ColBERT 使用 Token 级别的 MaxSim 操作，在保持接近 Cross-Encoder 精度的同时显著降低推理延迟。它预计算文档的 Token Embeddings 存入索引，查询时只需计算查询 Token 与文档 Token 的最大相似度之和。

ColBERT 特别适合候选集较大（Top-100 以上）且对延迟敏感的场景。

### 3.4 Cohere Rerank API

对于不想自行部署重排序模型的团队，Cohere Rerank API 提供了开箱即用的方案：

```python
import cohere

co = cohere.ClientV2(api_key="your-cohere-api-key")

query = "什么是 RAG？"
documents = [
    "RAG（Retrieval-Augmented Generation）是一种结合检索和生成的架构...",
    "Transformer 是一种基于自注意力机制的神经网络架构...",
    "向量数据库用于存储和检索高维向量表示...",
]

response = co.rerank(
    model="rerank-v3.5",
    query=query,
    documents=documents,
    top_n=3,
    return_documents=True
)

for result in response.results:
    print(f"[{result.relevance_score:.4f}] {result.document.text[:80]}")
```

### 3.5 完整的检索重排序管道

```python
class RetrievalRerankingPipeline:
    def __init__(self, hybrid_retriever: HybridRetriever, reranker=None):
        self.retriever = hybrid_retriever
        self.reranker = reranker or CrossEncoder("BAAI/bge-reranker-v2-m3")

    def retrieve(self, query: str, initial_k: int = 20, final_k: int = 5) -> list[dict]:
        candidates = self.retriever.hybrid_search(query, top_k=initial_k)

        if not candidates:
            return []

        pairs = [(query, c.content) for c in candidates]
        scores = self.reranker.predict(pairs)

        for candidate, score in zip(candidates, scores):
            candidate.score = float(score)

        candidates.sort(key=lambda x: x.score, reverse=True)
        return candidates[:final_k]
```

重排序是在质量和延迟之间做权衡的关键环节。对于大多数生产系统，在 Top-20 候选上加一层 Cross-Encoder 重排序，可以将端到端的检索准确率提升 15–30%，额外延迟约 100–300ms。

---

## 四、查询改写技术

用户输入的查询往往简短、模糊、缺乏上下文，直接用于检索效果不佳。查询改写（Query Rewriting）通过 LLM 在检索前对查询进行变换，从多个角度提升检索召回率。

### 4.1 HyDE（Hypothetical Document Embeddings）

HyDE 的核心思想是：**先让 LLM 生成一个假设性答案，再用这个假设性答案的 Embedding 去检索**。假设性答案与真实文档在语义空间中更接近，因为它们都是"答案"而非"问题"。

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.7)


def hyde_retrieval(query: str, retriever, embedding_model, llm=llm):
    prompt = ChatPromptTemplate.from_template(
        "请写一段详细的段落来回答以下问题。\n"
        "问题：{query}\n"
        "回答："
    )
    chain = prompt | llm
    hypothetical_answer = chain.invoke({"query": query}).content

    results = retriever.hybrid_search(hypothetical_answer, top_k=10)
    return results
```

**适用场景**：用户查询过于简短或抽象时（如"分布式一致性"），HyDE 生成的假设性文档可以补充大量语义信息。

**注意事项**：HyDE 引入了一次额外的 LLM 调用，增加了约 500ms–2s 的延迟。对于事实性查询，假设性答案可能包含错误信息，反而误导检索。

### 4.2 Multi-Query

Multi-Query 将一个查询拆解为多个不同角度的查询变体，分别检索后合并结果，显著提升召回率：

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.3)

QUERY_VARIANT_PROMPT = ChatPromptTemplate.from_template(
    "你是一位搜索查询优化专家。请基于以下用户查询，生成 {n} 个不同角度的搜索查询变体，"
    "每个变体应该从不同的方面或使用不同的术语来表达相同的搜索意图。\n\n"
    "原始查询：{query}\n\n"
    "请以 JSON 数组格式输出，例如：[\"变体1\", \"变体2\", \"变体3\"]"
)


def generate_query_variants(query: str, n: int = 3) -> list[str]:
    chain = QUERY_VARIANT_PROMPT | llm
    response = chain.invoke({"query": query, "n": n})

    import json
    try:
        variants = json.loads(response.content)
    except json.JSONDecodeError:
        variants = [line.strip() for line in response.content.split("\n") if line.strip()]

    return [query] + variants[:n]


def multi_query_retrieval(query: str, retriever, n_variants: int = 3) -> list[SearchResult]:
    queries = generate_query_variants(query, n=n_variants)

    all_results: list[list[SearchResult]] = []
    for q in queries:
        results = retriever.hybrid_search(q, top_k=10)
        all_results.append(results)

    fused = reciprocal_rank_fusion(all_results, top_n=10)
    return fused
```

### 4.3 Step-back Prompting

Step-back Prompting 将查询**抽象化**后再检索，适合需要广泛知识背景的复杂查询：

```python
STEP_BACK_PROMPT = ChatPromptTemplate.from_template(
    "你是一位搜索策略专家。给定以下具体查询，请生成一个更宽泛、更抽象的查询，"
    "以获取解决该问题所需的背景知识。\n\n"
    "原始查询：{query}\n\n"
    "只输出抽象后的查询，不要其他内容："
)


def step_back_retrieval(query: str, retriever, llm=llm):
    chain = STEP_BACK_PROMPT | llm
    abstract_query = chain.invoke({"query": query}).content.strip()

    specific_results = retriever.hybrid_search(query, top_k=10)
    broad_results = retriever.hybrid_search(abstract_query, top_k=10)

    fused = reciprocal_rank_fusion([specific_results, broad_results], top_n=10)
    return fused
```

**示例**：原始查询"Python 中使用 asyncio 时出现 RuntimeError: Event loop is closed 怎么解决"，Step-back 后的查询可能变为"Python asyncio 事件循环的生命周期管理"，从而检索到更全面的背景文档。

### 4.4 Sub-Query Decomposition

对于包含多个信息需求的复合查询，将其拆分为独立的子查询分别检索：

```python
DECOMPOSE_PROMPT = ChatPromptTemplate.from_template(
    "请将以下复合查询分解为多个独立的子查询。每个子查询应该只关注一个具体的信息点。\n\n"
    "复合查询：{query}\n\n"
    "以 JSON 数组格式输出子查询列表：[\"子查询1\", \"子查询2\", ...]"
)


def decompose_and_retrieve(query: str, retriever, llm=llm) -> dict:
    chain = DECOMPOSE_PROMPT | llm
    response = chain.invoke({"query": query})

    import json
    try:
        sub_queries = json.loads(response.content)
    except json.JSONDecodeError:
        sub_queries = [query]

    results_by_query: dict[str, list[SearchResult]] = {}
    for sq in sub_queries:
        results = retriever.hybrid_search(sq, top_k=5)
        results_by_query[sq] = results

    all_results = list(results_by_query.values())
    fused = reciprocal_rank_fusion(all_results, top_n=10)

    return {
        "sub_queries": sub_queries,
        "results_by_query": results_by_query,
        "fused_results": fused
    }
```

### 4.5 查询改写策略对比

| 策略 | 核心思想 | 额外延迟 | 适用场景 | 风险 |
|------|----------|----------|----------|------|
| **HyDE** | 生成假设性答案用于检索 | +1 LLM 调用 | 查询过于抽象/简短 | 假设性答案可能含错误信息 |
| **Multi-Query** | 多角度查询变体 | +N LLM 调用 | 需要高召回率 | 查询变体可能偏离原始意图 |
| **Step-back** | 抽象化查询获取背景 | +1 LLM 调用 | 需要背景知识的复杂问题 | 过度抽象可能引入噪声 |
| **Sub-Query** | 拆分为独立子查询 | +1 LLM 调用 | 复合查询 / 多跳问题 | 子查询之间的依赖关系可能丢失 |

---

## 五、上下文优化

检索和重排序之后，送入 LLM 的上下文仍需进一步优化。高质量的上下文是生成准确回答的基础。

### 5.1 上下文压缩（Context Compression）

LLMLingua 等方法通过压缩检索到的上下文，移除低信息量的 Token，在保持回答质量的同时降低 Token 消耗：

```python
from llmlingua import PromptCompressor

prompt_compressor = PromptCompressor(
    model_name="microsoft/llmlingua-2-xlm-roberta-large-meetingbank",
    device_map="cpu"
)


def compress_context(query: str, contexts: list[str], rate: float = 0.5) -> str:
    full_context = "\n\n".join(contexts)

    compressed = prompt_compressor.compress_prompt(
        full_context,
        rate=rate,
        question=query,
        force_tokens=["\n", "?", "!", "."],
        drop_consecutive=True
    )

    return compressed["compressed_prompt"]
```

### 5.2 上下文去重与相关性过滤

检索结果中经常包含重复信息或相关性不足的文档。简单的去重和过滤可以显著提升上下文质量：

```python
import hashlib
from difflib import SequenceMatcher


def deduplicate_contexts(
    contexts: list[str],
    similarity_threshold: float = 0.85
) -> list[str]:
    seen_hashes = set()
    unique_contexts = []

    for ctx in contexts:
        content_hash = hashlib.md5(ctx.strip().encode()).hexdigest()
        if content_hash in seen_hashes:
            continue

        is_duplicate = False
        for existing in unique_contexts:
            similarity = SequenceMatcher(None, ctx, existing).ratio()
            if similarity > similarity_threshold:
                is_duplicate = True
                break

        if not is_duplicate:
            seen_hashes.add(content_hash)
            unique_contexts.append(ctx)

    return unique_contexts


def relevance_filter(
    query: str,
    contexts: list[str],
    scores: list[float],
    threshold: float = 0.3
) -> list[str]:
    return [ctx for ctx, score in zip(contexts, scores) if score >= threshold]
```

### 5.3 Lost-in-the-Middle 缓解

Liu et al. (2023) 的研究发现，LLM 对上下文中**首尾位置**的信息利用率远高于中间位置。缓解策略包括：

```python
def mitigate_lost_in_middle(contexts: list[str], query: str) -> list[str]:
    if len(contexts) <= 2:
        return contexts

    sorted_by_relevance = sorted(
        enumerate(contexts),
        key=lambda x: len(x[1]),
        reverse=True
    )

    reordered = []
    left, right = 0, len(sorted_by_relevance) - 1
    pick_left = True

    for _, ctx in sorted_by_relevance:
        if pick_left:
            reordered.insert(0, ctx)
        else:
            reordered.append(ctx)
        pick_left = not pick_left

    return reordered
```

更工程化的做法是在 Prompt 中**显式标注文档位置和编号**，并明确指示 LLM 注意中间位置的信息：

```
以下是一组参考文档，请仔细阅读所有文档后回答问题。特别注意文档 2 和文档 3 的内容。

[文档 1] ...
[文档 2] ...（可能被忽略的关键信息在这里）
[文档 3] ...（同样重要但容易被跳过的信息）
[文档 4] ...
```

---

## 六、生成优化

检索质量再高，如果生成环节出问题，最终结果依然不可靠。以下从引用溯源、答案验证和多路径投票三个维度优化生成质量。

### 6.1 引用溯源（Citation Tracing）

要求 LLM 在生成回答时标注每个论断的来源文档，既提升可信度，也便于后续验证：

```python
CITATION_PROMPT = """你是一位严谨的技术文档回答者。请根据以下参考文档回答用户问题。

要求：
1. 每个论断后必须标注来源，格式为 [文档X]
2. 如果参考文档不足以完整回答问题，明确说明哪些部分是基于参考文档的，哪些部分信息不足
3. 不要编造参考文档中不存在的信息

参考文档：
{contexts}

用户问题：{question}

回答："""


def generate_with_citations(
    query: str,
    retrieved_docs: list[dict],
    llm=llm
) -> str:
    contexts = "\n\n".join(
        f"[文档{i+1}] {doc['content']}"
        for i, doc in enumerate(retrieved_docs)
    )

    prompt = CITATION_PROMPT.format(contexts=contexts, question=query)
    response = llm.invoke([("user", prompt)])
    return response.content
```

### 6.2 答案验证（Answer Verification）

生成后使用 LLM 自我验证答案是否忠实于检索到的上下文：

```python
VERIFICATION_PROMPT = """你是一位事实核查专家。请判断以下回答是否忠实于给定的参考文档。

参考文档：
{contexts}

待验证回答：
{answer}

请逐条检查回答中的每个论断，判断是否有参考文档支撑。输出 JSON 格式：
{{
    "is_faithful": true/false,
    "unsupported_claims": ["不被支撑的论断1", ...],
    "confidence": 0.0-1.0
}}"""


def verify_answer(answer: str, contexts: str, llm=llm) -> dict:
    prompt = VERIFICATION_PROMPT.format(contexts=contexts, answer=answer)
    response = llm.invoke([("user", prompt)])

    import json
    try:
        return json.loads(response.content)
    except json.JSONDecodeError:
        return {"is_faithful": False, "unsupported_claims": [], "confidence": 0.0}
```

### 6.3 多路径投票（Multi-Path Voting）

对同一查询生成多个候选答案，通过投票或评分选择最佳答案：

```python
def generate_with_voting(
    query: str,
    retrieved_docs: list[dict],
    n_paths: int = 3,
    llm=llm
) -> str:
    candidates = []
    for _ in range(n_paths):
        answer = generate_with_citations(query, retrieved_docs, llm=llm)
        candidates.append(answer)

    judge_prompt = (
        f"以下是针对同一问题的三个回答，请选出最准确、最完整的一个。\n\n"
        f"问题：{query}\n\n"
    )
    for i, c in enumerate(candidates):
        judge_prompt += f"回答 {i+1}：\n{c}\n\n"
    judge_prompt += "请输出最佳回答的编号（1、2 或 3）以及选择理由。"

    response = llm.invoke([("user", judge_prompt)])

    import re
    match = re.search(r"[123]", response.content)
    best_idx = int(match.group()) - 1 if match else 0

    return candidates[min(best_idx, len(candidates) - 1)]
```

### 6.4 生成策略对比

| 策略 | 额外 LLM 调用 | 可信度提升 | 延迟增加 | 适用场景 |
|------|---------------|-----------|----------|----------|
| 引用溯源 | 0 | 中 | 极低 | 所有场景（强烈推荐） |
| 答案验证 | 1 | 高 | +500ms–1s | 高风险决策场景 |
| 多路径投票 | N | 最高 | +N × 生成时间 | 对准确性要求极高的场景 |

---

## 七、评测体系

没有评测就没有优化。一套科学的评测体系是 RAG 系统持续改进的基础。

### 7.1 RAGAS 框架

RAGAS（Retrieval Augmented Generation Assessment）是当前最主流的 RAG 评测框架，提供四个核心指标：

| 指标 | 评测对象 | 计算方式 | 含义 |
|------|----------|----------|------|
| **Faithfulness**（忠实度） | 生成质量 | LLM 判断回答是否忠实于上下文 | 回答是否"有据可依" |
| **Answer Relevancy**（答案相关性） | 生成质量 | 回答与问题的相关程度 | 回答是否"答其所问" |
| **Context Precision**（上下文精确度） | 检索质量 | 检索到的文档中有多少是相关的 | 检索是否"精准" |
| **Context Recall**（上下文召回率） | 检索质量 | 回答所需的信息有多少被检索到 | 检索是否"全面" |

```python
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
)
from datasets import Dataset

eval_data = {
    "question": [
        "什么是 RAG？",
        "向量数据库有哪些？",
        "如何优化检索质量？",
    ],
    "answer": [
        "RAG 是检索增强生成...",
        "常见的向量数据库包括 Pinecone、Weaviate、Milvus...",
        "可以通过混合检索、重排序和查询改写来优化检索质量...",
    ],
    "contexts": [
        ["RAG（Retrieval-Augmented Generation）是一种将检索与生成结合的架构..."],
        ["向量数据库是专门用于存储和检索高维向量的数据库系统..."],
        ["检索质量优化包括：混合检索、Cross-Encoder 重排序、查询改写..."],
    ],
    "ground_truth": [
        "RAG 是检索增强生成，结合外部知识库与 LLM 生成能力",
        "Pinecone、Weaviate、Milvus、Qdrant、Chroma",
        "混合检索、重排序、查询改写",
    ],
}

dataset = Dataset.from_dict(eval_data)

result = evaluate(
    dataset=dataset,
    metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
)

print(result)
# {'faithfulness': 0.85, 'answer_relevancy': 0.92,
#  'context_precision': 0.78, 'context_recall': 0.88}
```

### 7.2 TruLens 评测

TruLens 提供了另一种评测视角，更侧重于反馈函数（Feedback Functions）和应用级监控：

```python
from trulens.core import Feedback, TruSession
from trulens.providers.openai import OpenAI

session = TruSession()
provider = OpenAI(model_engine="gpt-4o-mini")

f_relevance = Feedback(
    provider.relevance_with_cot_reasons,
    name="Relevance"
).on_input_output()

f_groundedness = Feedback(
    provider.groundedness_measure_with_cot_reasons,
    name="Groundedness"
).on_context()

f_answer_relevance = Feedback(
    provider.relevance_with_cot_reasons,
    name="Answer Relevance"
).on_input_output()
```

### 7.3 自定义评测数据集构建

通用评测指标之外，构建**领域特定的评测数据集**至关重要：

```python
import json
import random


class RAGEvalDatasetBuilder:
    def __init__(self):
        self.evaluation_pairs = []

    def add_pair(
        self,
        question: str,
        ground_truth_answer: str,
        relevant_doc_ids: list[str],
        difficulty: str = "medium",
        category: str = "general"
    ):
        self.evaluation_pairs.append({
            "question": question,
            "ground_truth": ground_truth_answer,
            "relevant_doc_ids": relevant_doc_ids,
            "difficulty": difficulty,
            "category": category,
        })

    def generate_negative_samples(
        self,
        all_doc_ids: list[str],
        n_per_positive: int = 2
    ) -> list[dict]:
        negatives = []
        for pair in self.evaluation_pairs:
            irrelevant_ids = [
                did for did in all_doc_ids
                if did not in pair["relevant_doc_ids"]
            ]
            sampled = random.sample(
                irrelevant_ids,
                min(n_per_positive, len(irrelevant_ids))
            )
            negatives.append({
                "question": pair["question"],
                "type": "negative_retrieval",
                "expected_irrelevant": sampled,
            })
        return negatives

    def export(self, path: str):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.evaluation_pairs, f, ensure_ascii=False, indent=2)

    def compute_difficulty_distribution(self) -> dict[str, int]:
        dist = {}
        for pair in self.evaluation_pairs:
            d = pair["difficulty"]
            dist[d] = dist.get(d, 0) + 1
        return dist
```

**评测数据集的构建原则**：

1. **覆盖核心场景**：确保问题类型多样（事实查询、比较分析、操作指南、概念解释）
2. **包含边界情况**：包括无法回答的问题、需要多文档综合的问题、存在歧义的问题
3. **定期更新**：评测集应随知识库更新而同步更新，保持评测的有效性
4. **分层标注难度**：按 easy / medium / hard 分级，便于分析不同难度下的系统表现

---

## 八、优化闭环

单项优化的效果有限，真正的质量飞跃来自**评测驱动的持续优化闭环**。

### 8.1 闭环流程

```
┌─────────────────────────────────────────────────────────────┐
│                    RAG 优化闭环                               │
│                                                             │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐            │
│  │  评测     │────▶│  分析     │────▶│  调优     │            │
│  │ Eval      │     │ Analysis │     │ Tuning   │            │
│  └──────────┘     └──────────┘     └──────────┘            │
│       ▲                                    │                │
│       │              ┌──────────┐          │                │
│       └──────────────│  重评测   │◀─────────┘                │
│                      │ Re-eval  │                           │
│                      └──────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 诊断清单

当评测指标不理想时，按以下优先级排查和优化：

| 评测指标低 | 可能原因 | 优化方向 |
|-----------|----------|----------|
| Context Recall 低 | 检索遗漏关键文档 | 增加 Top-K；启用混合检索；添加查询改写 |
| Context Precision 低 | 检索结果中噪声太多 | 加入重排序；调整相关性阈值；优化分块策略 |
| Faithfulness 低 | LLM 未忠实于上下文 | 优化 Prompt；使用更强的模型；添加引用约束 |
| Answer Relevancy 低 | 生成了与问题无关的内容 | 优化 Prompt 模板；添加问题-回答一致性检查 |

### 8.3 实际工作流

```python
class RAGOptimizationLoop:
    def __init__(self, pipeline, eval_dataset, llm=llm):
        self.pipeline = pipeline
        self.eval_dataset = eval_dataset
        self.llm = llm
        self.history = []

    def evaluate(self) -> dict:
        results = {
            "faithfulness": [],
            "answer_relevancy": [],
            "context_precision": [],
            "context_recall": [],
        }

        for item in self.eval_dataset:
            retrieved = self.pipeline.retrieve(item["question"])
            contexts = [r.content for r in retrieved]

            generated = generate_with_citations(item["question"], retrieved, llm=self.llm)

            eval_result = evaluate(
                Dataset.from_dict({
                    "question": [item["question"]],
                    "answer": [generated],
                    "contexts": [contexts],
                    "ground_truth": [item["ground_truth"]],
                }),
                metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
            )

            for key in results:
                results[key].append(eval_result[key])

        avg_results = {k: sum(v) / len(v) for k, v in results.items()}
        self.history.append(avg_results)
        return avg_results

    def diagnose(self, results: dict) -> list[str]:
        recommendations = []

        if results["context_recall"] < 0.7:
            recommendations.append(
                "上下文召回率偏低：建议启用混合检索或增加检索 Top-K 数量"
            )
        if results["context_precision"] < 0.6:
            recommendations.append(
                "上下文精确度偏低：建议加入重排序环节或收紧相关性阈值"
            )
        if results["faithfulness"] < 0.8:
            recommendations.append(
                "忠实度偏低：建议优化 Prompt 中的引用约束或切换更强的生成模型"
            )
        if results["answer_relevancy"] < 0.7:
            recommendations.append(
                "答案相关性偏低：建议在 Prompt 中强调紧扣问题回答"
            )

        return recommendations

    def run_optimization_cycle(self) -> dict:
        print("=" * 50)
        print(f"开始第 {len(self.history) + 1} 轮评测...")
        results = self.evaluate()

        print(f"\n评测结果：")
        for metric, score in results.items():
            print(f"  {metric}: {score:.4f}")

        recommendations = self.diagnose(results)
        if recommendations:
            print(f"\n优化建议：")
            for i, rec in enumerate(recommendations, 1):
                print(f"  {i}. {rec}")
        else:
            print("\n所有指标达标，系统状态良好。")

        return results
```

### 8.4 优化优先级建议

根据实际经验，以下是最有效的优化手段，按投入产出比排序：

1. **重排序**：投入小（接入一个 Rerank API），效果显著（检索精度提升 15–30%）
2. **混合检索**：投入中等，对关键词敏感的场景效果极佳
3. **引用溯源 Prompt 优化**：零成本，显著减少幻觉
4. **Multi-Query**：适合查询多样化的场景，召回率提升明显
5. **HyDE**：适合查询过于简短的场景，但增加延迟
6. **上下文压缩**：主要降低 Token 成本，对质量影响较小
7. **多路径投票**：成本最高，仅推荐用于高准确性要求的关键场景

---

## 九、延伸阅读

### 核心论文

- [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401) — RAG 的原始论文（Lewis et al., 2020）
- [Precise Zero-Shot Dense Retrieval without Relevance Labels (HyDE)](https://arxiv.org/abs/2212.10496) — HyDE 方法论（Gao et al., 2022）
- [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172) — 上下文位置对 LLM 性能的影响（Liu et al., 2023）
- [ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction](https://arxiv.org/abs/2004.12832) — 延迟交互检索模型
- [RRF: Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods](https://dl.acm.org/doi/10.1145/2741948.2741964) — RRF 算法原始论文

### 开源框架

- [RAGAS](https://github.com/explodinggradients/ragas) — RAG 评测的事实标准
- [TruLens](https://github.com/truera/trulens) — LLM 应用可观测性与评测
- [Haystack](https://github.com/deepset-ai/haystack) — 端到端 RAG 框架，内置混合检索和重排序管道
- [LlamaIndex](https://github.com/run-llama/llama_index) — 数据索引与检索框架，支持多种查询改写策略
- [LLMLingua](https://github.com/microsoft/LLMLingua) — 上下文压缩工具

### 实践资源

- [Building Production RAG Systems](https://www.rungalileo.io/) — RAG 生产实践指南
- [LangChain RAG Tutorials](https://python.langchain.com/docs/tutorials/rag/) — 官方 RAG 教程集合
- [Vectara RAG Leaderboard](https://github.com/vectara/rag-leaderboard) — RAG 方案效果对比排行
