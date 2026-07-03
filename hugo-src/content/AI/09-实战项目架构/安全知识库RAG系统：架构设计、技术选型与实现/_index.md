---
title: "安全知识库 RAG 系统：架构设计、技术选型与实现"
weight: 1
tags: [RAG系统, 安全知识库, 项目实战, 架构设计]
menu: 
  main: 
    parent: "实战项目架构"
---

安全团队的知识管理长期面临"三难困境"——文档分散导致检索低效、经验依赖导致知识流失、回答不一致导致决策风险。当安全事件响应需要在分钟级别完成时，翻阅十几个 Wiki 页面和共享文件夹寻找一个防火墙规则配置方案，代价是不可接受的。

本文以一个真实落地的安全知识库 RAG 系统为蓝本，从需求分析到架构设计、技术选型、核心模块实现、部署架构和质量评测，完整呈现一个企业级 RAG 项目从 0 到 1 的全过程。所有架构决策都基于实际工程约束，而非理想化的技术堆砌。

---

## 一、需求分析：安全团队的知识管理痛点

### 1.1 典型场景与问题

安全团队的知识管理与一般业务团队有本质区别：**知识的时效性要求极高、准确性要求极严、来源的权威性必须可追溯**。以下是三个核心痛点：

**痛点一：文档分散，信息孤岛严重**

安全知识散布在多个系统中——Confluence 上的安全策略文档、GitHub 上的 Playbook 代码、邮件中的事件复盘报告、飞书群聊中的应急经验分享、外部安全厂商的漏洞通告。一个典型的漏洞应急场景中，安全工程师需要在 5 个以上系统间反复切换，才能拼凑出完整的处置方案。

**痛点二：知识检索效率低，人工筛选成本高**

现有的全文搜索引擎（如 Elasticsearch 的简单关键词匹配）无法理解安全领域的语义关系。搜索"Redis 未授权访问修复"可能无法匹配到标题为"缓存服务安全加固方案"的文档，因为两者使用了不同的术语体系。安全团队平均需要 15-30 分钟才能定位到所需知识片段。

**痛点三：回答不一致，缺乏权威来源**

同一个安全问题，不同工程师给出的建议可能存在差异。例如，关于"如何配置 WAF 规则防御 SQL 注入"，资深工程师和新人的理解深度不同，生成的方案质量参差不齐。更严重的是，过时的安全建议（如建议使用已废弃的加密算法）可能被当作最新标准执行。

### 1.2 需求矩阵

| 需求维度 | 具体需求 | 优先级 | 量化指标 |
| :--- | :--- | :--- | :--- |
| **知识聚合** | 支持多格式文档导入（PDF/Markdown/HTML/飞书文档） | P0 | 支持 5+ 种格式 |
| **语义检索** | 基于语义理解的安全知识检索 | P0 | 检索召回率 > 85% |
| **引用溯源** | 每个回答必须标注原始文档来源 | P0 | 100% 回答可追溯 |
| **安全管控** | 敏感信息脱敏、访问权限控制 | P0 | 无敏感信息泄露 |
| **流式输出** | 长回答实时流式展示 | P1 | 首 Token 延迟 < 2s |
| **反馈闭环** | 用户可标记回答质量，驱动持续优化 | P1 | 反馈覆盖率 > 30% |
| **增量更新** | 文档变更后自动同步索引 | P1 | 更新延迟 < 5min |
| **多轮对话** | 支持上下文关联的深度安全咨询 | P2 | 上下文窗口 10 轮 |

---

## 二、架构设计：前后端分离的 RAG 全链路

### 2.1 架构总览

系统采用前后端分离架构，核心由四个组件构成：**LangChain 编排层**（负责 RAG pipeline）、**PGVector 向量存储层**（负责向量索引与混合检索）、**FastAPI 服务层**（负责 API 网关与业务逻辑）、**React 前端层**（负责交互界面）。

```
┌──────────────────────────────────────────────────────────────────────┐
│                          用户交互层 (React)                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ │
│  │ 对话界面  │  │ 文档管理  │  │ 反馈面板  │  │ 管理后台（权限/审计）│ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────┬───────────┘ │
│       └──────────────┼─────────────┼───────────────────┘             │
│                      │  SSE / WebSocket                              │
└──────────────────────┼───────────────────────────────────────────────┘
                       │
┌──────────────────────┼───────────────────────────────────────────────┐
│                FastAPI 服务层（API Gateway）                          │
│  ┌──────────┐  ┌─────┴─────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ 路由分发  │  │ 认证鉴权   │  │ 限流熔断  │  │ 审计日志          │  │
│  └────┬─────┘  └───────────┘  └──────────┘  └───────────────────┘  │
│       │                                                              │
│  ┌────┴─────────────────────────────────────────────────────────┐   │
│  │              LangChain RAG Pipeline                          │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌───────────┐ │   │
│  │  │ 查询改写    │ → 混合检索   │ → 重排序     │ → LLM生成   │ │   │
│  │  └────────────┘ └─────┬──────┘ └─────┬──────┘ └─────┬─────┘ │   │
│  └───────────────────────┼──────────────┼──────────────┼────────┘   │
└──────────────────────────┼──────────────┼──────────────┼────────────┘
                           │              │              │
┌──────────────────────────┼──────────────┼──────────────┼────────────┐
│                   数据存储层                                                  │
│  ┌──────────────┐  ┌─────┴──────┐  ┌───┴────┐  ┌─────┴──────────┐ │
│  │  PostgreSQL   │  │  PGVector  │  │ Redis  │  │ MinIO / S3     │ │
│  │  (元数据管理)  │  │ (向量存储)  │  │ (缓存) │  │ (文档原始文件) │ │
│  └──────────────┘  └────────────┘  └────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 核心设计原则

**原则一：检索质量优先于生成质量**

RAG 系统的天花板由检索决定，而非生成。投入 80% 的精力优化检索环节（混合检索、重排序、查询改写），仅用 20% 的精力调优生成 Prompt，这是经过验证的投入产出比。

**原则二：一切可追溯、可审计**

安全领域的知识问答必须满足合规要求。每条回答都携带完整的检索链路信息——查询了哪些文档、命中了哪些片段、每个片段的相似度得分、最终使用的上下文窗口。这些数据同时服务于质量评测和审计追溯。

**原则三：渐进式复杂度**

系统从最小可用架构开始——LangChain + PGVector + FastAPI + React 四件套——通过模块化设计确保每个组件可以独立升级。例如，后续可以将 PGVector 替换为 Milvus 以获得更高吞吐量，或在 LangChain 之上叠加 LangGraph 实现多步推理，而不需要重构整体架构。

---

## 三、技术选型：每个决策背后的逻辑

### 3.1 编排框架：LangChain

**为什么选择 LangChain**

LangChain 在 RAG 场景中的优势不是性能，而是**生态完整性和迭代效率**。它提供了从文档加载器、文本分割器、Embedding 接口到检索链、生成链的全套抽象，使得 RAG pipeline 的搭建从"手写胶水代码"变成"组合式配置"。

```python
from langchain_community.document_loaders import (
    PyPDFLoader,
    UnstructuredMarkdownLoader,
    BSHTMLLoader,
)
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_community.vectorstores import PGVector
from langchain.chains import RetrievalQA

LOADERS = {
    ".pdf": PyPDFLoader,
    ".md": UnstructuredMarkdownLoader,
    ".html": BSHTMLLoader,
}

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=512,
    chunk_overlap=64,
    separators=["\n\n", "\n", "。", "；", " "],
    length_function=len,
)

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
```

**备选方案与放弃理由**

| 方案 | 放弃理由 |
| :--- | :--- |
| **LlamaIndex** | 更侧重文档索引和查询引擎，对复杂对话链路的支持不如 LangChain 灵活 |
| **Haystack** | 生态偏向搜索场景，对 LLM 生成链路的抽象较少 |
| **自建 pipeline** | 过度工程化，初期迭代速度慢，且需要自行维护大量边界情况处理 |

**风险控制**：LangChain 的抽象层较厚，版本迭代频繁，API 变动较大。应对策略是通过自定义 Wrapper 隔离核心业务逻辑与 LangChain API，确保框架升级不会波及业务代码。

### 3.2 向量存储：PGVector

**为什么选择 PGVector**

PGVector 的核心优势不在于向量检索性能（在纯向量检索吞吐量上，Milvus 和 Qdrant 优于 PGVector），而在于**与 PostgreSQL 的深度集成带来的工程便利性**：

- **单数据库解决双需求**：文档元数据（标题、标签、权限、版本）和向量索引共存于同一个 PostgreSQL 实例，避免了"元数据在 MySQL，向量在 Milvus"的跨库一致性问题
- **混合查询原生支持**：利用 PostgreSQL 的 SQL 能力实现元数据过滤 + 向量检索的联合查询，无需在应用层做二次过滤
- **运维成本极低**：安全团队已有 PostgreSQL 运维经验，无需额外引入新的数据库组件

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE security_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source_url TEXT,
    doc_type VARCHAR(50),
    tags TEXT[],
    access_level INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES security_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    token_count INTEGER,
    metadata JSONB
);

CREATE INDEX idx_chunks_embedding ON document_chunks
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

CREATE INDEX idx_chunks_doc_type ON security_documents(doc_type);
CREATE INDEX idx_chunks_access_level ON security_documents(access_level);
```

**备选方案与放弃理由**

| 方案 | 放弃理由 |
| :--- | :--- |
| **Milvus** | 向量检索性能更强，但引入独立集群的运维成本对安全团队过高，且需要解决元数据同步问题 |
| **Chroma** | 开发阶段友好，但生产环境的持久化和并发能力不足 |
| **Pinecone** | 托管服务省心，但数据出境合规风险不可接受 |
| **Weaviate** | 功能全面但部署复杂度高，团队缺乏 Go 技术栈经验 |

### 3.3 服务框架：FastAPI

**为什么选择 FastAPI**

安全知识库的问答场景对延迟敏感——用户在应急响应中等待答案时，每一秒都很重要。FastAPI 的异步原生设计使得 RAG pipeline 可以在 I/O 密集型操作（向量检索、LLM 调用）中充分利用并发能力：

```python
from fastapi import FastAPI, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="Security Knowledge Base API", version="1.0.0")


class QueryRequest(BaseModel):
    question: str
    session_id: str | None = None
    filters: dict | None = None


class QueryResponse(BaseModel):
    answer: str
    sources: list[dict]
    confidence: float
    session_id: str


@app.post("/api/v1/ask", response_model=QueryResponse)
async def ask_question(
    request: QueryRequest,
    user=Depends(get_current_user),
):
    result = await rag_chain.ainvoke(
        query=request.question,
        filters=request.filters,
        user_access_level=user.access_level,
    )
    return QueryResponse(
        answer=result["answer"],
        sources=result["sources"],
        confidence=result["confidence"],
        session_id=result["session_id"],
    )


@app.post("/api/v1/ask/stream")
async def ask_question_stream(
    request: QueryRequest,
    user=Depends(get_current_user),
):
    async def generate():
        async for event in rag_chain.astream(
            query=request.question,
            filters=request.filters,
            user_access_level=user.access_level,
        ):
            yield f"data: {event.json()}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```

**备选方案与放弃理由**

| 方案 | 放弃理由 |
| :--- | :--- |
| **Django REST Framework** | 同步模型不适合流式输出场景，异步支持需要额外适配 |
| **Flask** | 生态成熟但缺乏类型安全和自动文档生成，对团队协作不友好 |
| **gRPC + FastAPI** | 过度设计，初期 WebSocket/SSE 已满足需求 |

### 3.4 前端框架：React

选择 React 主要基于**组件化模型**对复杂对话界面的适配能力——对话消息流、文档预览面板、反馈组件、管理后台都可以拆分为独立组件。结合 TypeScript 的类型安全和 Ant Design 的企业级 UI 组件库，可以快速构建符合安全团队审美（简洁、高效、信息密度高）的交互界面。

---

## 四、文档处理管线：从原始文件到可检索的知识

### 4.1 管线总览

文档处理是 RAG 系统质量的基石。安全知识库的文档来源多样——PDF 漏洞报告包含复杂排版和表格，Markdown 格式的 Playbook 包含代码块和嵌套列表，HTML 格式的厂商通告包含嵌套标签。每种格式都需要专门的解析策略。

```
原始文档 ──→ 格式解析 ──→ 内容清洗 ──→ 语义分块 ──→ 向量化 ──→ 索引入库
  │              │              │              │            │           │
  │         PDF/MD/HTML     去噪/去重      递归分割     Embedding   PGVector
  │         飞书/Confluence  元数据提取    上下文保持     批量处理    元数据关联
  │                                                  维度管理
```

### 4.2 核心实现

```python
import hashlib
from pathlib import Path
from langchain.schema import Document


class SecurityDocProcessor:
    def __init__(self, embeddings, vector_store, text_splitter):
        self.embeddings = embeddings
        self.vector_store = vector_store
        self.text_splitter = text_splitter

    async def process_document(
        self, file_path: Path, metadata: dict
    ) -> dict:
        loader_class = LOADERS.get(file_path.suffix.lower())
        if not loader_class:
            raise ValueError(f"Unsupported format: {file_path.suffix}")

        loader = loader_class(str(file_path))
        raw_docs = loader.load()

        cleaned_docs = self._clean_documents(raw_docs)
        chunks = self.text_splitter.split_documents(cleaned_docs)

        for i, chunk in enumerate(chunks):
            chunk.metadata.update({
                **metadata,
                "chunk_index": i,
                "total_chunks": len(chunks),
                "source_file": file_path.name,
                "content_hash": hashlib.md5(
                    chunk.page_content.encode()
                ).hexdigest(),
            })

        ids = [str(uuid4()) for _ in chunks]
        await self.vector_store.aadd_documents(chunks, ids=ids)

        return {
            "file": file_path.name,
            "chunks": len(chunks),
            "total_tokens": sum(
                len(c.page_content) for c in chunks
            ),
        }

    def _clean_documents(self, docs: list[Document]) -> list[Document]:
        cleaned = []
        seen_hashes = set()
        for doc in docs:
            content = doc.page_content.strip()
            if not content or len(content) < 20:
                continue
            content_hash = hashlib.md5(content.encode()).hexdigest()
            if content_hash in seen_hashes:
                continue
            seen_hashes.add(content_hash)
            cleaned.append(Document(
                page_content=content,
                metadata=doc.metadata,
            ))
        return cleaned
```

### 4.3 分块策略：安全文档的特殊考量

安全文档的分块策略与通用文档有显著差异。漏洞通告通常包含"漏洞描述 → 影响范围 → 修复方案"的固定结构，如果分块边界恰好切断了这个结构，检索到的片段将失去完整语义。因此我们采用**基于标题层级的分块策略**，优先在 `##` 或 `###` 标题处分割，其次才是按 Token 长度分割：

```python
from langchain.text_splitter import MarkdownHeaderTextSplitter

headers_to_split = [
    ("#", "h1"),
    ("##", "h2"),
    ("###", "h3"),
]

markdown_splitter = MarkdownHeaderTextSplitter(
    headers_to_split_on=headers_to_split,
    strip_headers=False,
)

def split_security_doc(text: str, doc_type: str) -> list[Document]:
    if doc_type in ("playbook", "vulnerability_advisory"):
        md_sections = markdown_splitter.split_text(text)
        final_chunks = []
        for section in md_sections:
            if len(section.page_content) > MAX_CHUNK_SIZE:
                sub_chunks = text_splitter.split_documents([section])
                final_chunks.extend(sub_chunks)
            else:
                final_chunks.append(section)
        return final_chunks
    else:
        return text_splitter.split_text(text)
```

---

## 五、检索与生成：混合检索 + 重排序 + LLM 生成

### 5.1 混合检索策略

单一的向量检索无法覆盖所有查询场景。安全团队的查询模式大致分为两类：

- **语义查询**："如何防御内网横向移动"——需要理解意图，匹配语义相关文档
- **关键词查询**："CVE-2024-3094 xz 后门修复"——需要精确匹配 CVE 编号和特定术语

因此，系统同时使用向量检索（语义）和 BM25 关键词检索（精确），通过 RRF（Reciprocal Rank Fusion）进行分数融合：

```python
from langchain.retrievers import EnsembleRetriever
from langchain_community.retrievers import BM25Retriever


def build_hybrid_retriever(vector_store, documents, k=10):
    vector_retriever = vector_store.as_retriever(
        search_type="similarity",
        search_kwargs={"k": k},
    )

    bm25_retriever = BM25Retriever.from_documents(documents)
    bm25_retriever.k = k

    ensemble_retriever = EnsembleRetriever(
        retrievers=[vector_retriever, bm25_retriever],
        weights=[0.6, 0.4],
    )
    return ensemble_retriever
```

**权重调优经验**：向量检索权重 0.6、BM25 权重 0.4 是经过评测验证的初始值。对于纯技术漏洞查询（如搜索 CVE 编号），BM25 的权重可以动态提升至 0.7；对于策略类咨询（如"如何设计零信任架构"），向量检索权重应提升至 0.8。这一动态权重调整通过查询分类器实现。

### 5.2 重排序（Reranking）

混合检索返回的候选集可能包含 20-30 个片段，直接全部送入 LLM 不仅浪费 Token 成本，还会因上下文过长导致注意力分散。使用 BGE-Reranker-v2-m3 对候选集进行精排，仅保留 Top-5 最相关片段：

```python
from sentence_transformers import CrossEncoder

reranker = CrossEncoder("BAAI/bge-reranker-v2-m3")


def rerank_candidates(
    query: str, candidates: list[Document], top_k: int = 5
) -> list[Document]:
    pairs = [(query, doc.page_content) for doc in candidates]
    scores = reranker.predict(pairs)

    scored_docs = list(zip(candidates, scores))
    scored_docs.sort(key=lambda x: x[1], reverse=True)

    return [doc for doc, score in scored_docs[:top_k]]
```

### 5.3 安全问答 Prompt 模板

安全领域的 Prompt 设计需要特别注意两点：**强制引用来源**和**不确定时明确拒绝**。一个幻觉的安全建议可能比没有建议更危险：

```python
SECURITY_QA_TEMPLATE = """你是一个专业的网络安全知识助手。基于以下检索到的安全知识片段回答用户的问题。

重要规则：
1. 只基于提供的知识片段回答，不要使用你自己的知识
2. 每个关键陈述必须标注来源文档编号 [1], [2] 等
3. 如果知识片段中没有相关信息，明确告知用户"当前知识库中未找到相关资料"
4. 如果答案涉及具体操作步骤，请按顺序列出
5. 如果存在多种方案，请分别说明适用场景
6. 不要给出未经验证的安全建议

检索到的知识片段：
{context}

用户问题：{question}

回答："""
```

### 5.4 完整 RAG Chain

```python
from langchain.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough


def build_rag_chain(retriever, llm):
    prompt = ChatPromptTemplate.from_template(SECURITY_QA_TEMPLATE)

    def format_docs(docs):
        formatted = []
        for i, doc in enumerate(docs, 1):
            source = doc.metadata.get("source_file", "unknown")
            title = doc.metadata.get("title", "untitled")
            formatted.append(
                f"[{i}] 来源: {source} | 标题: {title}\n"
                f"{doc.page_content}"
            )
        return "\n\n".join(formatted)

    chain = (
        {
            "context": retriever | format_docs,
            "question": RunnablePassthrough(),
        }
        | prompt
        | llm
        | StrOutputParser()
    )
    return chain
```

---

## 六、前端架构：React 对话界面与流式输出

### 6.1 核心交互模型

前端采用 React + TypeScript + Ant Design 技术栈，核心交互包括三个层面：

- **对话界面**：支持 Markdown 渲染、代码高亮、流式打字效果
- **来源面板**：点击引用编号可展开查看原始文档片段和来源链接
- **反馈机制**：每条回答支持"有用/无用/有害"三级反馈，驱动检索质量持续优化

### 6.2 流式输出实现

SSE（Server-Sent Events）是流式输出的最佳选择——它比 WebSocket 更简单（单向通信即可），且天然支持 HTTP 语义和断线重连：

```typescript
import React, { useState, useCallback } from "react";
import { Input, Button, Spin, Typography } from "antd";
import ReactMarkdown from "react-markdown";

const { Text } = Typography;

interface Source {
  doc_id: string;
  title: string;
  source_file: string;
  score: number;
  content: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  isStreaming?: boolean;
}

function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: inputValue,
    };

    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: "",
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/v1/ask/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: inputValue }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((line) => line.startsWith("data: "));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") break;

          const event = JSON.parse(data);
          if (event.type === "token") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = {
                ...last,
                content: last.content + event.content,
              };
              return updated;
            });
          } else if (event.type === "sources") {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                sources: event.sources,
                isStreaming: false,
              };
              return updated;
            });
          }
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading]);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {messages.map((msg, idx) => (
            <div key={idx} style={{ marginBottom: 16 }}>
              <Text strong>{msg.role === "user" ? "我" : "安全助手"}</Text>
              <ReactMarkdown>{msg.content}</ReactMarkdown>
              {msg.sources && <SourcePanel sources={msg.sources} />}
            </div>
          ))}
        </div>
        <div style={{ padding: 16, borderTop: "1px solid #f0f0f0" }}>
          <Input.Search
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            enterButton="发送"
            onSearch={handleSend}
            loading={isLoading}
            placeholder="输入安全相关问题..."
          />
        </div>
      </div>
    </div>
  );
}
```

### 6.3 来源引用与反馈组件

来源面板是安全知识库区别于通用聊天机器人的关键差异——它让每条回答都可追溯、可验证：

```typescript
function SourcePanel({ sources }: { sources: Source[] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div style={{ marginTop: 8 }}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        参考来源 ({sources.length})
      </Text>
      {sources.map((source, idx) => (
        <div
          key={source.doc_id}
          style={{
            padding: "4px 8px",
            margin: "4px 0",
            borderRadius: 4,
            background: "#fafafa",
            cursor: "pointer",
          }}
          onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
        >
          <Text style={{ fontSize: 12 }}>
            [{idx + 1}] {source.title}
            <Text type="secondary"> ({source.source_file})</Text>
            <Text type="secondary"> 相似度: {(source.score * 100).toFixed(1)}%</Text>
          </Text>
          {expandedIdx === idx && (
            <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
              {source.content}
            </div>
          )}
        </div>
      ))}
      <FeedbackButtons sources={sources} />
    </div>
  );
}
```

---

## 七、部署架构：从开发到生产

### 7.1 Docker Compose 本地开发环境

```yaml
version: "3.9"

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://admin:secret@db:5432/security_kb
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - REDIS_URL=redis://cache:6379/0
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
    volumes:
      - ./uploads:/app/uploads
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  web:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - REACT_APP_API_URL=http://localhost:8000
    depends_on:
      - api

  db:
    image: pgvector/pgvector:pg16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: security_kb
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: secret
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./sql/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U admin -d security_kb"]
      interval: 5s
      timeout: 5s
      retries: 5

  cache:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  worker:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      - DATABASE_URL=postgresql://admin:secret@db:5432/security_kb
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - db
      - cache
    command: celery -A app.tasks worker --loglevel=info --concurrency=4

volumes:
  pgdata:
```

### 7.2 生产部署关键考量

| 维度 | 开发环境 | 生产环境 | 迁移要点 |
| :--- | :--- | :--- | :--- |
| **数据库** | 单实例 PGVector | 主从复制 + 读写分离 | 向量索引构建在从库执行，避免影响主库写入性能 |
| **LLM 调用** | 直连 OpenAI API | 通过 LiteLLM Proxy 池化管理 | 多 Key 轮询、速率限制、成本归因 |
| **文件存储** | 本地磁盘 | MinIO / 阿里云 OSS | 保证文档持久化和跨节点共享 |
| **任务队列** | 内存 Celery | Redis + Celery 集群 | 文档处理和索引构建异步化 |
| **监控** | 日志输出 | Prometheus + Grafana | 关键指标：检索延迟、LLM Token 消耗、用户满意度 |
| **HTTPS** | 无 | Nginx 反向代理 + Let's Encrypt | 全链路加密，尤其是 LLM API 通信 |

### 7.3 性能优化策略

**语义缓存**：对于高频重复查询（如"什么是 SQL 注入"），将查询结果缓存在 Redis 中，TTL 设置为 24 小时。缓存命中率通常在 15-25% 之间，可以显著降低 LLM 调用成本。

```python
import hashlib
import json
from redis.asyncio import Redis


class SemanticCache:
    def __init__(self, redis: Redis, ttl: int = 86400):
        self.redis = redis
        self.ttl = ttl

    async def get(self, query: str) -> dict | None:
        key = f"rag_cache:{hashlib.sha256(query.encode()).hexdigest()}"
        cached = await self.redis.get(key)
        return json.loads(cached) if cached else None

    async def set(self, query: str, result: dict):
        key = f"rag_cache:{hashlib.sha256(query.encode()).hexdigest()}"
        await self.redis.setex(key, self.ttl, json.dumps(result))
```

**增量索引**：基于文档内容哈希判断是否需要重新索引，避免重复计算 Embedding 向量。对于已存在的文档，仅处理新增或修改的片段。

---

## 八、质量评测：RAGAS 指标与持续改进

### 8.1 RAGAS 评测框架

RAGAS（Retrieval Augmented Generation Assessment）是目前最主流的 RAG 系统评测框架，涵盖四个核心指标：

| 指标 | 含义 | 测量目标 | 目标值 |
| :--- | :--- | :--- | :--- |
| **Faithfulness（忠实度）** | 生成内容是否忠于检索到的上下文 | 幻觉检测 | > 0.85 |
| **Answer Relevancy（答案相关性）** | 回答是否与问题相关 | 生成质量 | > 0.80 |
| **Context Precision（上下文精确度）** | 检索到的上下文中有多少是相关的 | 检索精确率 | > 0.75 |
| **Context Recall（上下文召回率）** | 相关上下文是否被检索到 | 检索召回率 | > 0.80 |

### 8.2 评测数据集构建

构建评测集是质量保障的第一步。安全知识库的评测集需要覆盖多种查询类型：

```python
eval_dataset = [
    {
        "question": "如何检测 Redis 未授权访问漏洞？",
        "ground_truth": "通过执行 redis-cli INFO 命令检查服务信息...",
        "contexts": ["Redis 安全加固指南 v2.1 第三章..."],
        "metadata": {"category": "vulnerability_detection", "difficulty": "easy"},
    },
    {
        "question": "内网横向移动的常见手法有哪些？",
        "ground_truth": "横向移动手法包括：Pass-the-Hash、WMI远程执行...",
        "contexts": ["横向移动检测与防御 Playbook..."],
        "metadata": {"category": "threat_analysis", "difficulty": "hard"},
    },
    {
        "question": "CVE-2024-3094 影响范围和修复方案",
        "ground_truth": "XZ Utils 5.6.0 和 5.6.1 版本存在后门...",
        "contexts": ["CVE-2024-3094 应急通告..."],
        "metadata": {"category": "vulnerability_response", "difficulty": "medium"},
    },
]
```

### 8.3 用户反馈闭环

仅靠离线评测无法覆盖所有长尾场景。系统内置三级反馈机制，每条回答下方提供"有用/无用/有害"按钮：

```python
from fastapi import APIRouter

router = APIRouter()


@router.post("/api/v1/feedback")
async def submit_feedback(
    feedback: FeedbackRequest,
    user=Depends(get_current_user),
):
    await db.execute(
        """INSERT INTO feedback
           (session_id, message_id, rating, comment, user_id, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())""",
        feedback.session_id,
        feedback.message_id,
        feedback.rating,
        feedback.comment,
        user.id,
    )

    if feedback.rating == "harmful":
        await alert_service.notify_security_team(
            message_id=feedback.message_id,
            reason=feedback.comment,
        )

    return {"status": "recorded"}
```

反馈数据驱动三个改进循环：

- **短期（天级）**："有害"反馈触发人工审查，快速修正错误回答
- **中期（周级）**："无用"反馈聚类分析，识别检索盲区并补充知识文档
- **长期（月级）**：全量反馈数据用于 RAGAS 重新评测，量化系统质量趋势

---

## 九、系统架构图与项目结构

### 9.1 完整数据流

```
用户提问
    │
    ▼
┌─────────────┐    ┌─────────────┐    ┌──────────────┐
│ 查询改写     │ →  │ 查询分类     │ →  │ 路由分发      │
│ (HyDE/扩展)  │    │ (意图识别)   │    │ (检索策略)    │
└─────────────┘    └─────────────┘    └──────┬───────┘
                                             │
                                    ┌────────┴────────┐
                                    │                 │
                                    ▼                 ▼
                              ┌──────────┐    ┌──────────┐
                              │ 向量检索  │    │ BM25检索  │
                              │ (语义)    │    │ (关键词)  │
                              └────┬─────┘    └────┬─────┘
                                   │               │
                                   └───────┬───────┘
                                           ▼
                                   ┌──────────────┐
                                   │  RRF 分数融合  │
                                   └──────┬───────┘
                                          ▼
                                   ┌──────────────┐
                                   │  BGE 重排序    │
                                   └──────┬───────┘
                                          ▼
                                   ┌──────────────┐
                                   │  上下文构建    │
                                   └──────┬───────┘
                                          ▼
                                   ┌──────────────┐
                                   │  LLM 流式生成  │
                                   └──────┬───────┘
                                          ▼
                                   ┌──────────────┐
                                   │  来源标注输出   │
                                   └──────────────┘
```

### 9.2 项目目录结构

```
security-kb-rag/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 入口
│   │   ├── api/                 # 路由定义
│   │   │   ├── ask.py           # 问答接口
│   │   │   ├── documents.py     # 文档管理接口
│   │   │   └── feedback.py      # 反馈接口
│   │   ├── core/
│   │   │   ├── config.py        # 配置管理
│   │   │   ├── security.py      # 认证鉴权
│   │   │   └── dependencies.py  # 依赖注入
│   │   ├── rag/
│   │   │   ├── chain.py         # RAG Chain 编排
│   │   │   ├── retriever.py     # 混合检索器
│   │   │   ├── reranker.py      # 重排序模块
│   │   │   ├── prompt.py        # Prompt 模板
│   │   │   └── cache.py         # 语义缓存
│   │   ├── document/
│   │   │   ├── loader.py        # 多格式文档加载
│   │   │   ├── splitter.py      # 分块策略
│   │   │   └── processor.py     # 文档处理管线
│   │   └── models/
│   │       ├── document.py      # 文档数据模型
│   │       └── feedback.py      # 反馈数据模型
│   ├── sql/
│   │   └── init.sql             # 数据库初始化
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatInterface.tsx
│   │   │   ├── SourcePanel.tsx
│   │   │   └── FeedbackButtons.tsx
│   │   ├── hooks/
│   │   │   └── useStreamChat.ts
│   │   ├── services/
│   │   │   └── api.ts
│   │   └── App.tsx
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── docker-compose.prod.yml
└── README.md                     # <!-- [TODO](link-to-repo) -->
```

> **GitHub 仓库**：<!-- [TODO](https://github.com/your-org/security-kb-rag) -->

---

## 十、延伸阅读

- [RAG 技术栈全景：从索引到检索到生成的完整链路](/AI/04-RAG与知识库/rag技术栈全景从索引到检索到生成的完整链路/) — RAG 各环节的技术选型基础
- [RAG 高级优化：混合检索、重排序、查询改写与评测闭环](/AI/04-RAG与知识库/rag高级优化混合检索重排序查询改写与评测闭环/) — 混合检索与重排序的深入讨论
- [企业级 RAG 架构：知识库治理、访问控制与安全管控](/AI/04-RAG与知识库/企业级rag架构知识库治理访问控制与安全管控/) — 生产环境 RAG 的治理与安全架构
- [Embedding 与向量数据库：模型选型、PGVector/Milvus/Chroma 对比](/AI/04-RAG与知识库/embedding与向量数据库模型选型pgvectormilvuschroma对比/) — 向量数据库选型的技术依据
- [LangChain 与 LangGraph 技术栈：核心抽象、工作流编排与生产实践](/AI/03-Agent架构与框架生态/langchain与langgraph技术栈核心抽象工作流编排与生产实践/) — LangChain 架构与最佳实践
- [AI Agent 安全设计：权限模型、沙箱隔离与审计日志](/AI/08-安全与AI融合/ai-agent安全设计权限模型沙箱隔离与审计日志/) — AI 系统的安全设计模式
- [LLM API 工程：多模型对接、流式输出与容错设计](/AI/01-LLM原理与工程/llm-api工程多模型对接流式输出与容错设计/) — 流式输出与多模型对接的工程实现
