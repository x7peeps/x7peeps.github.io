---
title: "RAG 高级优化：混合检索、重排序、查询改写与评测闭环"
weight: 3
tags: [RAG, 混合检索, 重排序, 查询改写, RAGAS, 优化]
menu: 
  main: 
    parent: "AIRag"
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

    sorted_docs = sorted(doc_scores.items(), key=lam