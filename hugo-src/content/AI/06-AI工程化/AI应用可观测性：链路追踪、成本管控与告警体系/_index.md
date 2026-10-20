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

LangFuse 和 LangSmith 是当前 LLM 可观测性领域的两大主流平台。LangFuse 开源且自托管友好，