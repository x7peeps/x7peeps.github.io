---
title: "AI 应用可观测性：链路追踪、成本管控与告警体系"
weight: 3
tags: [可观测性, 链路追踪, 成本管控, 告警, LangFuse]
menu: 
  main: 
    parent: "AI实战"
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

LangFuse 和 LangSmith 是当前 LLM 可观测性领域的两大主流平台。LangFuse 开源且自托管友好，LangSmith 则在 LangChain / LangGraph 生态里提供最顺的集成体验。两者都能解决"一次请求到底调了哪些模型、花了多少 Token、慢在哪一步"的原始问题。

### 3.1 集成方式：从装饰器到中间件

LangFuse 的接入有三种粒度，按侵入性从低到高选择：

```python
from langfuse.openai import openai      # drop-in，无需改调用逻辑
from langfuse import observe             # 装饰器，任意函数变 span

@observe(name="rag_pipeline")
def answer(question: str):
    docs = retrieve(question)            # 自动成为子 span
    return generate(question, docs)

client = openai.OpenAI()
resp = client.chat.completions.create(
    model="gpt-4o-mini", messages=msgs,
    metadata={"user_tier": "pro", "feature": "chat"}   # 用于成本归因
)
```

**metadata 是成本与质量归因的关键**。不写 metadata 的 trace 只能看全局曲线；带上 `feature`、`tenant`、`user_tier`、`model_version` 之后，才能回答"哪个功能的 Token 成本失控了""哪个租户的回答质量在掉"。建议在网关层统一注入，而不是散落在各业务代码里。

框架原生集成（LangChain callback、OpenAI Agents SDK、Vercel AI SDK）成本最低；自研 Agent 用装饰器；已经全面接 OpenTelemetry 的团队可以直接走 OTLP exporter，让 LLM span 与应用链路在同一 trace 下——这在高并发场景里非常关键，因为**端到端延迟里 LLM 往往不是唯一变量**。

### 3.2 Trace 结构与评估落地

一条合格的 LLM trace 应包含：路由/检索（查询、命中片段与分数）、Prompt 拼装（最终送进去的完整文本）、模型调用（输入/输出/Token/耗时/成本）、后处理（校验、解析、护栏判定）。**拼装后的 Prompt 一定要落盘**——只看原始用户输入，你永远无法解释"模型为什么会这么答"。

评估在平台上落地为两条通道：

- **在线采样评分**：对一定比例的真实流量跑 LLM-as-Judge（相关性、有害性、是否遵循指令），结果写回 trace 的 score
- **离线实验**：在数据集上跑新版本，与 baseline 对比同一组指标，作为发布门禁

两者的差别是**在线评分看趋势、离线实验看变更**。把在线评分当发布依据的团队，会在模型供应商悄悄换版本时吃一个大亏。

---

## 四、Prometheus + Grafana 自建指标体系

LangFuse 一类平台擅长单请求诊断与质量评估，**但 SRE 需要的告警、SLO、值班响应必须走指标体系**。两者的分工是明确的：trace 用来查个案，metrics 用来守底线。

### 4.1 指标命名与基数控制

```python
from prometheus_client import Counter, Histogram

LLM_TOKENS = Counter(
    "llm_tokens_total", "token usage",
    ["model", "feature", "direction"],   # direction: prompt | completion
)
LLM_LATENCY = Histogram(
    "llm_ttft_seconds", "time to first token",
    ["model", "feature"],
    buckets=(0.2, 0.5, 1, 2, 5, 10, 20, 40),
)
LLM_COST = Counter("llm_cost_usd_total", "estimated cost", ["model", "feature"])
GUARDRAIL = Counter("guardrail_hits_total", "guardrail triggers", ["rule", "action"])
```

**基数是第一杀手**。绝对不要把 `user_id`、`session_id`、完整 prompt 放进 label——一个热点租户就能把时间序列撑爆，代价是 Prometheus 内存与查询性能同时崩。允许进入 label 的只有低基数字段：model、feature、provider、status、cache_hit。**高基数信息一律留在 trace 里。**

### 4.2 三个实用查询

```promql
# 每分钟成本（按模型）
sum by (model) (rate(llm_cost_usd_total[5m])) * 60

# 缓存命中率
sum(rate(cache_hits_total[10m])) / (sum(rate(cache_hits_total[10m])) + sum(rate(cache_misses_total[10m])))

# TTFT P95
histogram_quantile(0.95, sum by (le, model) (rate(llm_ttft_seconds_bucket[5m])))
```

Grafana 面板的推荐结构：**顶部一行放钱（今日成本、单请求均值、Token 速率），第二行放体验（TTFT P95、端到端 P95、错误率），第三行放质量与安全（护栏命中、评分均值、降级率）**。值班的人第一眼要看到的是"是烧钱、是变慢，还是变笨"。

---

## 五、成本管控

### 5.1 成本核算的三件难点

**第一，别信 API 返回的 usage 就以为算准了。** Prompt Cache 命中按折扣计费、不同模型单价随时间变化、工具调用与 embedding 也各自花钱。正确做法是维护一张价格表（含 cache 折扣率），在网关层按 token 明细计算，并定期与账单对账。

**第二，成本归因必须落到 feature 而非全局。** "本月花了 8 万美元"没有可操作性；"搜索摘要功能花了 3.2 万，单请求 0.021 美元，环比涨 40% 因为上下文从 3k 涨到 9k"才能驱动决策。

**第三，预算要有分级闸门**：

| 层 | 机制 |
| :--- | :--- |
| 单请求 | max_tokens 上限、上下文裁剪、超时熔断 |
| 单用户/租户 | 日配额、速率限制、超额降级到便宜模型 |
| 应用/团队 | 日预算告警（80% 预警、100% 通知，而非静默限流） |
| 全局 | 模型路由（简单任务走小模型）、语义缓存、批处理 |

### 5.2 模型路由的成本弹性

实测中"按任务复杂度路由"通常是成本降幅最大的手段。用规则（长度、意图、是否含代码）加一个小分类器，把 60%-80% 的简单流量分到小模型，质量指标往往只掉 1-3 个点，成本可以降一半以上。前提是**路由决策要进 trace 并纳入质量评测**——不然无法证明"分到小模型的那些请求确实没变差"。

---

## 六、告警体系

### 6.1 什么该告警，什么不该

告警的第一原则是**可行动**。"平均 Token 用量上升"是仪表盘内容，不是告警；"TTFT P95 连续 5 分钟 > 8s 且缓存命中率下跌 20%"才是。

| 类别 | 阈值示例 | 处理 |
| :--- | :--- | :--- |
| 可用性 | 错误率 > 2%（5 分钟窗口） | 立刻告警，触发降级 |
| 供应商 | 429 比例 > 5% / fallback 率 > 10% | 告警 + 自动切流 |
| 延迟 | TTFT P95 > 8s | 告警（非阻塞类可只通知） |
| 成本 | 单请求成本 > 3× 7 日均值 | 告警，先查是否有失控循环 |
| 质量 | 在线评分均值下跌 > 0.5；点踩率翻倍 | 通知 + 自动跑评测集回归 |
| 安全 | 注入命中激增；护栏拦截率异常 | 立刻告警并升级人工 |

**质量类告警最容易误报**：LLM 评分本身有噪声，短窗口抖动是常态。正确做法是用较长窗口（1-24 小时）+ 显著性判断（对比同期分布），并且配一条**自动回归**动作——触发时跑评测集，而不是直接叫人。

### 6.2 一条容易被忽略的告警

**"上游模型版本变了"**。供应商静默更新模型会让质量、延迟、成本同时漂移，而你的代码一行没改。可行的防御是：把响应里的模型标识与固定版本请求（不同厂商标法不同）纳入监控，检测到漂移就触发离线评测。这类告警在 LLM 场景的独特性上很有代表性——传统监控里根本没有这个维度。

---

## 七、落地路线图

按投入产出比排序：

1. **第 1 周**：接入 trace（TTFT、总耗时、Token、cost、metadata），成本核算跑通
2. **第 2 周**：Prometheus 指标 + Grafana 三层面板 + 可用性/延迟/成本三类告警
3. **第 3-4 周**：建评测集与离线实验流水线，把"改 Prompt 必跑回归"变成门禁
4. **第 2 个月**：在线抽样评分、语义缓存与模型路由接入，质量与成本指标进入同一面板
5. **持续**：告警演练、价格表对账、trace 采样率与存储周期按成本调整

## 八、结语

AI 应用的可观测性不是"给传统监控加几个新指标"，而是要**把非确定性系统变成可度量系统**：单请求可追溯（trace）、总体趋势可比较（metrics）、质量变化可判定（evals）。三者缺一个，优化就会退化成主观感受。

一个务实的提醒：**先做成本与延迟，再做质量**。前者数据现成、口径清晰，一周就能见效；后者需要评测集和裁判体系，是长期建设。很多团队一上来就想监控"回答得好不好"，结果两个季度过去了连每月花了多少钱都说不清。

（数据来源说明：本文为公开资料与技术方法整理，涉及的性能、比例与厂商能力描述以各官方文档与公开报告为准，具体数值会随版本变化；未在自有环境逐项复测的数据均以'约/通常/实践区间'表述。）

本文面向授权安全研究与防御建设，未经授权对任何系统实施文中技术属违法行为。
