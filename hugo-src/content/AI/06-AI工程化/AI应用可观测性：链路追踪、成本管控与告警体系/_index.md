---
title: "AI 应用可观测性：链路追踪、成本管控与告警体系"
weight: 3
tags: [可观测性, 链路追踪, 成本管控, 告警, LangFuse]
menu: 
  main: 
    parent: "AI 工程化"
---

# AI 应用可观测性：链路追踪、成本管控与告警体系

当 LLM 应用从原型走向生产环境，一个严峻的现实随之浮出水面：**你无法优化你无法度量的东西**。传统 Web 应用的可观测性体系（Metrics、Logs、Traces 三支柱）在面对 LLM 应用时出现了显著的能力缺口——Token 消耗带来的弹性成本、模型推理的非确定性延迟、输出质量的主观性评估，这些新维度要求我们在传统可观测性的基础上构建一套专属于 AI 应用的监控体系。

本文面向生产级 LLM 应用的开发者与 SRE，系统性地拆解 AI 应用可观测性的完整技术栈：从三支柱的 AI 适配，到 LangFuse/LangSmith 的实操集成，再到基于 Prometheus + Grafana 的自定义监控、成本管控与告警策略。

---

## 一、可观测性三支柱在 AI 场景的适配

传统可观测性的三大支柱——**Metrics（指标）**、**Logs（日志）**、**Traces（链路）**——构成了监控系统的骨架。但 LLM 应用的特殊性，要求对每一支柱进行针对性的扩展。

### 1.1 Metrics：从请求数到 Token 经济指标

传统应用的 Metrics 聚焦于 QPS、错误率、延迟百分位。AI 应用需要在此基础上叠加一层全新的指标维度：

| 传统指标 | AI 扩展指标 | 说明 |
| :--- | :--- | :--- |
| Request Count | Request Count + Token Volume | 请求数不再反映真实负载，Token 消耗量才是 |
| Error Rate | Hallucination Rate | 模型不会抛 500 错误，但会"一本正经地胡说八道" |
| Latency P99 | Time-to-First-Token (TTFT) | 流式输出场景下，用户感知的延迟是首 Token 延迟而非总延迟 |
| Throughput | Tokens per Second | 模型生成速度直接影响用户体验 |
| CPU/Memory | GPU Utilization + KV Cache Hit Rate | 推理引擎的硬件指标替代了传统 CPU 密集型指标 |

这些指标的变化频率和量级与传统应用截然不同。一个高流量的聊天应用可能每秒产生数百万个 Token，而这些 Token 的成本是按量计费的——这意味着监控系统不仅要实时采集指标，还要具备实时成本计算能力。

### 1.2 Logs：结构化日志与语义审计

LLM 应用的日志远比传统应用复杂。一次完整的请求日志可能包含：

- **输入层**：System Prompt 版本、用户输入（含敏感信息脱敏）、上下文窗口内容
- **推理层**：模型选择、温度参数、Top-P、推理耗时、Token 分段统计
- **输出层**：模型回复全文、停止原因（stop_reason）、安全过滤触发记录
- **工具层**：Function Calling 的工具名、参数、返回值、重试次数
- **评估层**：在线评估分数、幻觉检测标记、安全审计结果

日志的结构化程度直接决定了后续分析的可行性。一个常见的错误是在日志中直接存储完整的用户输入和模型输出，这不仅违反数据合规要求（GDPR、《个人信息保护法》），还会在大规模场景下迅速耗尽存储资源。

### 1.3 Traces：LLM 调用的分布式链路

LLM 应用的链路追踪需要覆盖一个完整的调用生命周期。以一个典型的 RAG + Agent 应用为例，一次请求可能涉及以下调用链路：

```
用户请求
  └── Query Rewrite (LLM Call #1)
       └── Vector Search (Embedding Call + DB Query)
            └── Rerank (LLM Call #2 or Cross-Encoder)
                 └── Context Assembly
                      └── Main Generation (LLM Call #3, Stream)
                           └── Tool Calls (LLM Call #4, if needed)
                                └── Tool Execution (HTTP Call)
                                     └── Final Generation (LLM Call #5)
                                          └── Safety Check (LLM Call #6)
                                               └── Response
```

在这条链路中，每一个节点都可能独立失败或引入延迟。**没有链路追踪，你无法知道一个"慢回答"究竟慢在了哪个环节**——是 Embedding 检索慢了，Rerank 模型排队了，还是 LLM 的输出被安全过滤拦截后重新生成了？

---

## 二、LLM 特有指标

在传统可观测性指标之上，AI 应用需要一套专属的指标体系来捕捉 LLM 行为的独特模式。

### 2.1 Token 使用指标

Token 是 LLM 应用中最重要的计量单位，直接关联成本和性能：

- **Token Volume（Token 消耗量）**：按输入/输出/总 Token 分别统计，区分 Prompt Token 和 Completion Token。建议按模型、按业务线、按用户维度分别聚合。
- **Token Rate（Token 生成速率）**：衡量模型每秒输出的 Token 数。GPT-4o 通常在 40-80 tokens/s，Claude 3.5 Sonnet 约 60-100 tokens/s。速率下降可能暗示 API 限流或服务降级。
- **Token Utilization（Token 利用率）**：有效输出 Token（用户实际需要的回答内容）占总 Token（含推理链、系统提示、上下文注入）的比例。低 Token 利用率意味着存在优化空间。

### 2.2 延迟分布指标

LLM 应用的延迟分布通常呈双峰形态——简单查询快速返回，复杂推理显著耗时：

| 指标 | 含义 | 健康基线（参考） |
| :--- | :--- | :--- |
| **TTFT (Time to First Token)** | 从请求发出到首个 Token 返回的延迟 | < 800ms（P95） |
| **TPOT (Time Per Output Token)** | 平均每个输出 Token 的生成间隔 | < 50ms |
| **Total Latency** | 从请求到完整响应返回的总耗时 | < 10s（P95，依场景而定） |
| **E2E Latency with Tools** | 含工具调用的端到端延迟 | < 30s（P95） |

TTFT 是用户感知体验的关键分界线——超过 1 秒无响应，用户就会感到焦虑；超过 3 秒，流失率急剧上升。监控 TTFT 的 P50 和 P95 差异，能快速发现长尾延迟问题。

### 2.3 质量与安全指标

LLM 输出的非确定性使得质量监控成为必要但极具挑战的工作：

- **Hallucination Rate（幻觉率）**：通过 LLM-as-Judge 或事实核查工具，在线评估模型回答中包含虚构信息的比例。通常通过抽样评估来估算，全量评估成本过高。
- **Safety Event Rate（安全事件率）：**触发内容安全过滤的请求占比。包括 Prompt 注入检测、有害内容拦截、敏感信息泄露等维度。
- **Model Fallback Rate（模型降级率）**：因主模型不可用或超时而切换到备用模型的请求比例。高降级率可能暗示上游模型服务不稳定。
- **Cache Hit Rate（缓存命中率）**：语义缓存（Semantic Cache）命中的请求比例。对于重复性高的场景（如客服问答），缓存命中率可以达到 30%-60%，直接降低 50% 以上的 Token 成本。

### 2.4 指标采集的时间窗口

LLM 应用的指标具有明显的时间特性：

- **实时窗口（1-5 分钟）**：用于即时告警，关注 TTFT、错误率、Token 速率的突变
- **短期窗口（1-24 小时）**：用于趋势分析，关注每日 Token 消耗曲线、高峰时段识别
- **长期窗口（7-90 天）**：用于成本预测和容量规划，关注月度 Token 消耗趋势、模型切换影响

---

## 三、LangFuse/LangSmith 实操

LangFuse 和 LangSmith 是当前 LLM 可观测性领域的两大主流平台。LangFuse 开源且自托管友好，LangSmith 是 LangChain 官方的商业 SaaS 平台。

### 3.1 LangFuse 安装与部署

LangFuse 提供 Docker Compose 一键部署方案，适合中小团队快速上手：

```yaml
# docker-compose.yml
version: "3.9"
services:
  langfuse-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: langfuse
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: langfuse
    volumes:
      - langfuse_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U langfuse"]
      interval: 5s
      timeout: 5s
      retries: 5

  langfuse-server:
    image: langfuse/langfuse:latest
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://langfuse:${DB_PASSWORD}@langfuse-db:5432/langfuse
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      NEXTAUTH_URL: http://localhost:3000
      SALT: ${SALT}
    depends_on:
      langfuse-db:
        condition: service_healthy

volumes:
  langfuse_data:
```

部署完成后，通过 Web UI 创建项目并获取 API Key：

```bash
# 获取 LangFuse API Key 后，配置环境变量
export LANGFUSE_SECRET_KEY="sk-lf-..."
export LANGFUSE_PUBLIC_KEY="pk-lf-..."
export LANGFUSE_HOST="http://localhost:3000"
```

### 3.2 SDK 集成与 Trace 上报

LangFuse 提供了与主流框架的无缝集成。以下分别展示 LangChain 和原生 OpenAI SDK 的接入方式：

**LangChain 集成**：

```python
from langfuse.callback import CallbackHandler
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage

langfuse_handler = CallbackHandler(
    public_key="pk-lf-...",
    secret_key="sk-lf-...",
    host="http://localhost:3000"
)

llm = ChatOpenAI(model="gpt-4o", temperature=0)
response = llm.invoke(
    [HumanMessage(content="解释 Transformer 中的注意力机制")],
    config={"callbacks": [langfuse_handler]}
)
```

**原生 OpenAI SDK 集成**：

```python
from langfuse import Langfuse
from langfuse.decorators import observe

langfuse = Langfuse(
    public_key="pk-lf-...",
    secret_key="sk-lf-...",
    host="http://localhost:3000"
)

@observe(as_type="generation")
def call_llm(prompt: str) -> str:
    from openai import OpenAI
    client = OpenAI()
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0
    )
    return response.choices[0].message.content

@observe()
def rag_pipeline(query: str) -> str:
    docs = retrieve_documents(query)
    context = "\n".join([d.page_content for d in docs])
    prompt = f"基于以下上下文回答问题：\n{context}\n\n问题：{query}"
    return call_llm(prompt)

result = rag_pipeline("什么是 RAG？")
langfuse.flush()
```

### 3.3 数据集与在线评估

LangFuse 支持创建评估数据集（Dataset），用于系统性地评估模型输出质量：

```python
from langfuse import Langfuse

langfuse = Langfuse()

dataset = langfuse.create_dataset(name="rag-qa-evaluation-v2")

experiment_items = [
    {
        "input": {"query": "什么是 MCP 协议？", "context_docs": ["mcp_spec_v1.md"]},
        "expected_output": "MCP 是 Model Context Protocol 的缩写...",
        "metadata": {"difficulty": "easy", "category": "definition"}
    },
    {
        "input": {"query": "比较 LangChain 和 LlamaIndex 的差异", "context_docs": ["comparison.md"]},
        "expected_output": "LangChain 侧重于 Agent 编排...",
        "metadata": {"difficulty": "medium", "category": "comparison"}
    }
]

for item in experiment_items:
    langfuse.create_dataset_item(
        dataset_name="rag-qa-evaluation-v2",
        input=item["input"],
        expected_output=item["expected_output"],
        metadata=item["metadata"]
    )
```

在线评估可以通过 LangFuse 的 Evaluation API 实现，将每条 Trace 关联到数据集中的对应样本，从而持续追踪模型质量的变化趋势。

---

## 四、自定义 Metrics：Prometheus + Grafana

对于需要深度定制监控面板的团队，Prometheus + Grafana 是构建 AI 指标体系的经典组合。

### 4.1 自定义 AI 指标 Exporter

通过 Prometheus client 在应用层暴露自定义指标：

```python
from prometheus_client import Counter, Histogram, Gauge, start_http_server

LLM_TOKEN_USAGE = Counter(
    "llm_token_usage_total",
    "Total token consumption",
    ["model", "token_type", "team", "project"]
)

LLM_REQUEST_DURATION = Histogram(
    "llm_request_duration_seconds",
    "LLM request latency",
    ["model", "endpoint"],
    buckets=[0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 30.0, 60.0]
)

TTFT_LATENCY = Histogram(
    "llm_ttft_seconds",
    "Time to first token",
    ["model"],
    buckets=[0.1, 0.3, 0.5, 0.8, 1.0, 1.5, 2.0, 3.0]
)

LLM_ERROR_TOTAL = Counter(
    "llm_errors_total",
    "LLM errors by type",
    ["model", "error_type"]
)

HALLUCINATION_RATE = Gauge(
    "llm_hallucination_rate",
    "Hallucination rate (rolling 1h)",
    ["model", "task_type"]
)

CACHE_HIT_RATIO = Gauge(
    "llm_cache_hit_ratio",
    "Semantic cache hit ratio",
    ["model"]
)

COST_DOLLARS = Counter(
    "llm_cost_dollars_total",
    "Estimated cost in USD",
    ["model", "team"]
)

start_http_server(8000)
```

### 4.2 Grafana Dashboard 配置

以下是核心面板的 Grafana 查询示例（PromQL）：

```yaml
# Panel: Token 消耗速率（按模型分组）
- expr: rate(llm_token_usage_total[5m])
  legend: "{{model}} - {{token_type}}"
  title: "Token 消耗速率"

# Panel: P95 延迟趋势
- expr: histogram_quantile(0.95, rate(llm_request_duration_seconds_bucket[5m]))
  legend: "{{model}}"
  title: "P95 延迟"

# Panel: TTFT P95
- expr: histogram_quantile(0.95, rate(llm_ttft_seconds_bucket[5m]))
  legend: "{{model}}"
  title: "Time to First Token P95"

# Panel: 幻觉率（1 小时滚动窗口）
- expr: llm_hallucination_rate
  legend: "{{model}} - {{task_type}}"
  title: "幻觉率"

# Panel: 缓存命中率
- expr: llm_cache_hit_ratio
  legend: "{{model}}"
  title: "语义缓存命中率"

# Panel: 每日成本趋势
- expr: increase(llm_cost_dollars_total[24h])
  legend: "{{model}} - {{team}}"
  title: "每日成本 (USD)"
```

### 4.3 Prometheus 告警规则配置

```yaml
# prometheus_ai_rules.yml
groups:
  - name: ai_application_alerts
    rules:
      - alert: HighTTFT
        expr: histogram_quantile(0.95, rate(llm_ttft_seconds_bucket[5m])) > 1.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "TTFT P95 超过 1.5 秒"
          description: "模型 {{ $labels.model }} 的 TTFT P95 持续超过 1.5 秒，可能影响用户体验。"

      - alert: TokenBudgetExceeded
        expr: increase(llm_cost_dollars_total[1h]) > 50
        for: 0m
        labels:
          severity: critical
        annotations:
          summary: "1 小时 Token 成本超过 $50"
          description: "团队 {{ $labels.team }} 在过去 1 小时内 Token 消耗成本达到 ${{ $value }}。"

      - alert: HighHallucinationRate
        expr: llm_hallucination_rate > 0.15
        for: 30m
        labels:
          severity: critical
        annotations:
          summary: "幻觉率超过 15%"
          description: "模型 {{ $labels.model }} 的幻觉率达到 {{ $value | humanizePercentage }}，超过安全阈值。"

      - alert: LLMHighErrorRate
        expr: rate(llm_errors_total[5m]) > 0.1
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "LLM 错误率偏高"
          description: "模型 {{ $labels.model }} 的错误率 {{ $value | humanizePercentage }}。"

      - alert: CacheHitRateDropped
        expr: llm_cache_hit_ratio < 0.2
        for: 1h
        labels:
          severity: info
        annotations:
          summary: "缓存命中率低于 20%"
          description: "语义缓存命中率降至 {{ $value | humanizePercentage }}，请检查缓存策略。"
```

---

## 五、成本管控

LLM API 的按量计费模式意味着**成本是流动的、弹性的、可失控的**。一个设计不当的 Agent 循环可能在几分钟内烧掉数百美元。成本管控不是可选项，而是生产级 AI 应用的生存前提。

### 5.1 Token 预算管理

Token 预算管理的核心是建立多层级的限额体系：

```python
class TokenBudgetManager:
    def __init__(self, config: dict):
        self.limits = {
            "per_request": config.get("per_request", 8000),
            "per_user_daily": config.get("per_user_daily", 50000),
            "per_team_daily": config.get("per_team_daily", 1000000),
            "global_hourly": config.get("global_hourly", 5000000),
        }
        self.usage_tracker = UsageTracker()

    def check_budget(self, scope: str, entity_id: str, estimated_tokens: int) -> bool:
        limit = self.limits.get(scope, float("inf"))
        current_usage = self.usage_tracker.get_usage(scope, entity_id)
        if current_usage + estimated_tokens > limit:
            return False
        return True

    def record_usage(self, scope: str, entity_id: str, input_tokens: int,
                     output_tokens: int, model: str):
        total = input_tokens + output_tokens
        self.usage_tracker.record(scope, entity_id, total)
        cost = self._calculate_cost(model, input_tokens, output_tokens)
        self.usage_tracker.record_cost(scope, entity_id, cost)

    def _calculate_cost(self, model: str, input_tokens: int, output_tokens: int) -> float:
        pricing = {
            "gpt-4o": {"input": 2.50, "output": 10.00},
            "gpt-4o-mini": {"input": 0.15, "output": 0.60},
            "claude-3-5-sonnet": {"input": 3.00, "output": 15.00},
            "deepseek-v3": {"input": 0.27, "output": 1.10},
        }
        rates = pricing.get(model, {"input": 1.0, "output": 3.0})
        return (input_tokens * rates["input"] + output_tokens * rates["output"]) / 1_000_000
```

### 5.2 异常告警与熔断

除了被动的预算限制，还需要主动检测异常消耗模式：

- **单请求 Token 爆发告警**：当单次请求的输出 Token 超过阈值（如 4000），自动触发审查。这通常意味着 Agent 进入了异常循环或模型生成了大量冗余内容。
- **短时消耗激增告警**：1 分钟内的 Token 消耗量超过历史同期均值的 3 倍，触发预警。可能是遭受了 Prompt 注入攻击导致的 Token 耗尽。
- **成本趋势异常告警**：每日成本超过预算的 120%，触发团队负责人通知。
- **自动熔断机制**：当检测到异常模式时，自动降级到更低成本的模型（如从 GPT-4o 降级到 GPT-4o-mini），或限制请求频率。

### 5.3 使用分析与成本归因

精确的成本归因是优化的前提。建议按以下维度建立成本分析视图：

| 归因维度 | 分析价值 |
| :--- | :--- |
| **按团队/项目** | 识别成本大户，推动资源优化 |
| **按模型** | 评估模型替换的 ROI，决定何时用小模型替代大模型 |
| **按功能模块** | 区分 RAG 检索、Agent 推理、安全审查等模块的独立成本 |
| **按用户类型** | 识别免费用户与付费用户的成本差异 |
| **按时间段** | 发现成本的周期性模式，优化调度策略 |

通过 Grafana 的多维度面板，可以快速定位成本的驱动因素。例如，一个看似合理的"日均成本上升 30%"，深入分析后可能发现：70% 的增量来自某个新上线的 Agent 功能中的工具调用循环，而非整体流量增长。

---

## 六、日志聚合与分析

### 6.1 技术栈选择

对于 AI 应用的日志聚合，两种主流方案各有优势：

| 方案 | 优势 | 劣势 | 适用场景 |
| :--- | :--- | :--- | :--- |
| **ELK Stack** (Elasticsearch + Logstash + Kibana) | 全文搜索能力强，查询灵活 | 资源消耗大，运维复杂 | 大规模日志分析，需要复杂查询 |
| **Grafana Loki** | 轻量级，标签索引，与 Grafana 生态集成 | 全文搜索能力弱于 ES | 已使用 Grafana 的团队，成本敏感 |

对于已经采用 Prometheus + Grafana 监控体系的团队，Loki 是自然的选择——它复用了 Prometheus 的标签体系，可以在 Grafana 中统一查看 Metrics 和 Logs。

### 6.2 结构化日志模式

AI 应用的日志必须遵循严格的结构化格式，以下是推荐的日志 Schema：

```python
import json
import time
from dataclasses import dataclass, asdict
from typing import Optional

@dataclass
class AILogEntry:
    timestamp: float
    trace_id: str
    span_id: str
    parent_span_id: Optional[str]
    level: str
    event_type: str
    model: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    latency_ms: float
    ttft_ms: Optional[float]
    stop_reason: str
    team: str
    project: str
    user_id: str
    error: Optional[str] = None
    cache_hit: bool = False
    safety_triggered: bool = False
    metadata: Optional[dict] = None

def log_llm_call(entry: AILogEntry):
    safe_entry = asdict(entry)
    safe_entry["input_tokens"] = entry.input_tokens
    safe_entry["cost_usd"] = calculate_cost(
        entry.model, entry.input_tokens, entry.output_tokens
    )
    print(json.dumps(safe_entry, ensure_ascii=False))
```

关键设计原则：

- **永远不要在日志中存储原始用户输入**：使用哈希或摘要替代，敏感信息必须脱敏
- **每条日志必须携带 trace_id**：确保日志与链路追踪可以关联
- **使用统一的命名规范**：如 `input_tokens` 而非混用 `prompt_tokens`、`input_token_count` 等
- **分级存储策略**：热数据（7 天）保留在 Loki/ES，温数据（30 天）迁移到对象存储，冷数据（90 天+）归档或删除

### 6.3 Loki 日志查询示例

```logql
# 查询特定模型的错误日志
{app="ai-gateway"} |= "error" | json | model="gpt-4o" | level="error"

# 查询 Token 消耗异常高的请求
{app="ai-gateway"} | json | total_tokens > 10000

# 查询幻觉检测触发的日志
{app="ai-gateway"} | json | hallucination_detected=true

# 按团队统计 1 小时内的 Token 消耗
sum by (team) (
  sum_over_time({app="ai-gateway"} | json | unwrap total_tokens [1h])
)
```

---

## 七、告警策略

告警体系的设计直接影响团队对问题的响应速度和处理质量。一个设计不当的告警系统要么频繁误报导致告警疲劳，要么遗漏关键事件导致故障扩大。

### 7.1 SLA 定义

在制定告警策略之前，首先需要定义清晰的 SLA：

| SLA 指标 | 目标值 | 说明 |
| :--- | :--- | :--- |
| **可用性** | 99.9% | 指 LLM 服务（含降级路径）可用时间占比 |
| **TTFT P95** | < 1.5s | 从请求到首 Token 返回 |
| **总延迟 P95** | < 10s | 标准对话场景 |
| **幻觉率** | < 5% | 抽样评估的滚动 24 小时均值 |
| **安全事件响应** | < 1min | 从检测到安全事件到触发拦截的延迟 |
| **成本偏差** | < ±20% | 实际成本与预算的偏差范围 |

### 7.2 分级告警体系

告警分为三个级别，每个级别对应不同的响应机制：

**Info 级别**（信息通知）：

- 缓存命中率低于预期
- 新版本模型上线后指标波动
- 日成本达到预算的 80%
- 模型降级率轻微上升

响应方式：Slack/飞书 通知，无需即时处理，工作时间内确认即可。

**Warning 级别**（需要关注）：

- TTFT P95 超过 1.5 秒持续 5 分钟
- 某团队 Token 消耗异常偏高
- 幻觉率上升至 10%-15% 区间
- 模型 API 错误率超过 5%

响应方式：Slack/飞书 + 邮件通知，值班人员需在 30 分钟内响应，评估是否需要干预。

**Critical 级别**（立即处理）：

- LLM 服务完全不可用
- TTFT P95 超过 5 秒
- 幻觉率超过 15%
- 单小时成本突破预算上限
- 检测到 Prompt 注入攻击

响应方式：电话/短信通知 + 自动升级。15 分钟内无响应自动升级至团队负责人，30 分钟内无响应升级至技术总监。

### 7.3 升级机制

```yaml
# escalation-policy.yml
escalation_policies:
  - name: "AI 应用告警升级"
    steps:
      - delay: 0m
        notify:
          - type: slack
            channel: "#ai-alerts"
      - delay: 15m
        notify:
          - type: pagerduty
            service: "ai-production"
      - delay: 30m
        notify:
          - type: phone
            targets:
              - "team-lead"
      - delay: 60m
        notify:
          - type: phone
            targets:
              - "engineering-director"
            repeat: 15m
```

### 7.4 告警治理

避免告警疲劳的关键措施：

- **告警抑制**：当一个根因触发多个告警时，自动抑制衍生告警。例如，LLM API 全面不可用时，不需要对每个模型单独发告警。
- **告警收敛**：将 5 分钟窗口内的重复告警合并为一条，附带触发次数。
- **告警静默**：在已知维护窗口（如模型升级、数据迁移）期间自动静默相关告警。
- **定期回顾**：每月回顾告警的有效性，清理误报率高的规则，优化阈值。

---

## 八、架构图

以下是 AI 应用可观测性的完整架构图：

```
┌──────────────────────────────────────────────────────────────────┐
│                     用户请求层 (User Requests)                     │
│          Web / Mobile / API / CLI / Embedded Widget               │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│                    API Gateway / Load Balancer                     │
│              请求路由 · 限流 · 鉴权 · Token 预算检查                  │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│                   AI 应用服务层 (App Server)                       │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │   RAG    │  │  Agent   │  │  Safety  │  │  Budget  │        │
│  │ Pipeline │  │ Executor │  │  Filter  │  │ Manager  │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │              │              │              │               │
│  ┌────▼──────────────▼──────────────▼──────────────▼────┐        │
│  │            Observability SDK (LangFuse/OpenTelemetry) │        │
│  │       Trace Collection · Metric Emission · Log Emit   │        │
│  └──────┬────────────────┬────────────────┬──────────────┘        │
└─────────┼────────────────┼────────────────┼──────────────────────┘
          │                │                │
    ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
    │  LangFuse │   │ Prometheus│   │   Loki    │
    │  (Traces  │   │ + Grafana │   │  (Logs)   │
    │  & Eval)  │   │ (Metrics) │   │           │
    └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
          │                │                │
          │         ┌──────▼──────┐         │
          │         │ Alert Rules │         │
          │         │ (Prometheus │         │
          │         │   Alerting) │         │
          │         └──────┬──────┘         │
          │                │                │
    ┌─────▼────────────────▼────────────────▼─────┐
    │              告警通知分发                       │
    │   Slack · 飞书 · PagerDuty · 邮件 · 短信       │
    └─────────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
    │ GPT-4o    │   │ Claude    │   │ DeepSeek  │
    │ (Primary) │   │ (Fallback)│   │ (Budget)  │
    └───────────┘   └───────────┘   └───────────┘
```

架构设计的核心原则：

- **旁路采集**：可观测性 SDK 以非阻塞方式采集数据，绝不影响主请求链路的延迟
- **多维度冗余**：Traces、Metrics、Logs 三路数据互相校验，任何一路数据丢失不影响全局可观测性
- **分层存储**：热数据存 Loki/Prometheus 本地，温数据存 LangFuse，冷数据归档至对象存储
- **告警统一出口**：所有告警通过统一的分发层路由到对应的接收渠道，避免各监控系统各自为战

---

## 九、延伸阅读

- [OpenTelemetry 官方文档](https://opentelemetry.io/docs/) — 可观测性的事实标准，支持 traces、metrics、logs 的统一采集
- [LangFuse 官方文档](https://langfuse.com/docs) — 开源 LLM 可观测性平台，支持自托管部署
- [LangSmith 官方文档](https://docs.smith.langchain.com/) — LangChain 官方的商业化可观测性平台
- [Prometheus 官方文档](https://prometheus.io/docs/) — 监控与告警的业界标准
- [Grafana 官方文档](https://grafana.com/docs/) — 可视化与仪表盘平台
- [Grafana Loki 官方文档](https://grafana.com/docs/loki/latest/) — 轻量级日志聚合系统
- [Google SRE Workbook — Monitoring Distributed Systems](https://sre.google/workbook/monitoring-distributed-systems/) — Google SRE 团队关于分布式监控的最佳实践
- [OpenLLMetry](https://github.com/traceloop/openllmetry) — 基于 OpenTelemetry 的 LLM 专用可观测性 SDK
- [LLM Guard](https://github.com/protectai/llm-guard) — LLM 安全审计与内容过滤工具
- [Token Economics 与推理参数](../01-LLM原理与工程/Token经济学与推理参数：成本、延迟、质量的三角博弈/_index.md) — Token 成本与推理参数的深度分析
- [LLM API 工程](../01-LLM原理与工程/LLM%20API工程：多模型对接、流式输出与容错设计/_index.md) — 多模型对接与容错设计
