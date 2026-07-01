# AI 板块内容升级计划（V3 - 技术栈梳理版）

## 一、项目概述

### 目标
将 x7peeps.com 网站的 AI 板块从当前的 2 篇基础教程，升级为一套**系统化的 AI 技术栈梳理知识体系（30+ 篇）**，全面覆盖三个目标岗位的核心技能要求，突出**安全+AI 融合**的差异化优势。

### 核心差异化定位
**"安全老兵的 AI 实践者"** — 拥有深厚安全背景、能将 AI 与安全深度融合的复合型人才。

### 内容风格
- **技术栈梳理**：每篇文章系统梳理一个技术方向的全貌——原理、架构、框架、实战、踩坑
- **有深度**：不是入门教程，而是技术选型和架构决策的参考资料
- **有代码**：关键环节附代码片段和架构图，但不是手把手教你安装
- **有安全视角**：融入安全相关的攻击面、防御策略、架构考量
- **有练习**：每篇末尾附 1-2 个动手练习，供有余力时深入

### 目标岗位

| 岗位 | 核心关键词 | 重点覆盖方向 |
|------|-----------|-------------|
| JD1: AI Agent 全栈开发 | Agent 架构、RAG、Prompt Engineering、全栈开发 | 技术深度 + 实战项目 |
| JD2: AI Agent 评测 | 评测体系、Benchmark、LLM-as-Judge、质量监控 | 评测方法论 + 平台设计 |
| JD3: AI-Native IT | AI 驱动运维、MCP、安全体系、自动化 | 安全+AI 融合 |

---

## 二、当前状态分析

### 现有内容
- `chatgpt微信机器人搭建`：45 行的简单部署教程
- `claude注册`：38 行的注册教程
- **结论**：仅覆盖了 LLM 使用的最表层，缺失全部技术栈内容

### 差距分析

| 技能维度 | JD 要求 | 当前覆盖 | 差距 |
|---------|---------|---------|------|
| LLM 原理与工程 | Transformer、Token、API 工程 | ❌ | 🔴 |
| Prompt Engineering | CoT、Few-shot、系统提示词 | ❌ | 🔴 |
| Agent 架构 | ReAct、Planning、Tool Use、Memory | ❌ | 🔴 |
| RAG 与知识库 | 向量检索、Embedding、RAG 优化 | ❌ | 🔴 |
| 框架生态 | LangChain/LangGraph、AutoGen、Dify | ❌ | 🔴 |
| Agent 评测 | LLM-as-Judge、Benchmark | ❌ | 🔴 |
| AI 工程化 | Docker/K8s、性能优化、监控 | ❌ | 🔴 |
| AI 辅助开发 | Claude Code、Cursor、MCP | ❌ | 🔴 |
| AI+安全融合 | Prompt 注入、越狱、Agent 安全、红队 | ❌ | 🔴 |

---

## 三、目录结构设计（30 篇文章）

```
hugo-src/content/AI/
├── _index.md
│
├── 01-LLM原理与工程/
│   ├── _index.md
│   ├── 大语言模型技术栈：从Transformer到GPT/Claude的架构演进/
│   │   └── _index.md
│   ├── Token经济学与推理参数：成本、延迟、质量的三角博弈/
│   │   └── _index.md
│   ├── LLM API工程：多模型对接、流式输出与容错设计/
│   │   └── _index.md
│   └── 模型选择与部署策略：GPT、Claude、开源模型、国产模型全景/
│       └── _index.md
│
├── 02-Prompt工程/
│   ├── _index.md
│   ├── Prompt Engineering技术栈：从基础到CoT/ToT的完整体系/
│   │   └── _index.md
│   ├── 系统提示词工程：角色设计、安全边界与行为控制/
│   │   └── _index.md
│   └── Prompt攻防：注入攻击手法与防御架构/
│       └── _index.md
│
├── 03-Agent架构与框架生态/
│   ├── _index.md
│   ├── AI Agent架构全景：ReAct、Plan-and-Execute、Reflexion、LATS/
│   │   └── _index.md
│   ├── Function Calling与Tool Use：工作原理、编排模式与安全考量/
│   │   └── _index.md
│   ├── Agent记忆系统：短期/长期/工作记忆的技术方案对比/
│   │   └── _index.md
│   ├── LangChain与LangGraph技术栈：核心抽象、工作流编排与生产实践/
│   │   └── _index.md
│   ├── Multi-Agent框架生态：AutoGen、CrewAI、Dify对比与选型/
│   │   └── _index.md
│   └── MCP协议与工具生态：Model Context Protocol架构与实践/
│       └── _index.md
│
├── 04-RAG与知识库/
│   ├── _index.md
│   ├── RAG技术栈全景：从索引到检索到生成的完整链路/
│   │   └── _index.md
│   ├── Embedding与向量数据库：模型选型、PGVector/Milvus/Chroma对比/
│   │   └── _index.md
│   ├── RAG高级优化：混合检索、重排序、查询改写与评测闭环/
│   │   └── _index.md
│   └── 企业级RAG架构：知识库治理、访问控制与安全管控/
│       └── _index.md
│
├── 05-Agent评测与质量保障/
│   ├── _index.md
│   ├── Agent评测方法论：维度设计、指标体系与评测框架/
│   │   └── _index.md
│   ├── LLM-as-Judge：原理、偏差分析与实战配置/
│   │   └── _index.md
│   ├── Agent Benchmark生态：AgentBench/SWE-Bench/τ-Bench/BFCL解读/
│   │   └── _index.md
│   └── 评测平台架构：自动化评测、Trace回放与归因分析/
│       └── _index.md
│
├── 06-AI工程化/
│   ├── _index.md
│   ├── AI服务容器化与编排：Docker/K8s/GPU调度/弹性伸缩/
│   │   └── _index.md
│   ├── LLM应用性能工程：Token优化、语义缓存与延迟调优/
│   │   └── _index.md
│   └── AI应用可观测性：链路追踪、成本管控与告警体系/
│       └── _index.md
│
├── 07-AI辅助开发工具链/
│   ├── _index.md
│   ├── AI编程工具技术栈：Claude Code/Cursor/Copilot能力对比与工作流/
│   │   └── _index.md
│   └── 自定义MCP Server开发：协议解析、Python/TS实现与安全审计/
│       └── _index.md
│
├── 08-安全与AI融合/  ⭐ 核心差异化
│   ├── _index.md
│   ├── AI安全攻防全景：Prompt注入、越狱攻击与防御架构/
│   │   └── _index.md
│   ├── AI Agent安全设计：权限模型、沙箱隔离与审计日志/
│   │   └── _index.md
│   ├── 大模型红队测试：方法论、自动化工具与评测基准/
│   │   └── _index.md
│   ├── AI驱动安全运营：智能SOC、自动化响应与漏洞分析Agent/
│   │   └── _index.md
│   └── AI-Native安全体系：企业安全从0到1的AI化实践/
│       └── _index.md
│
├── 09-实战项目架构/  ⭐ 综合展示
│   ├── _index.md
│   ├── 安全知识库RAG系统：架构设计、技术选型与实现/
│   │   └── _index.md
│   ├── 安全Agent：自动化漏洞扫描与报告生成架构/
│   │   └── _index.md
│   ├── AI-Native IT运维平台：Agent重构企业IT服务架构/
│   │   └── _index.md
│   └── 自动化红队评测平台：评测引擎设计与实现/
│       └── _index.md
│
├── chatgpt/                            # 保留
│   └── chatgpt微信机器人搭建/
└── claude/                             # 保留
    └── claude注册/
```

**总计：9 个子分类 + 30 篇文章**（保留原有 2 篇 + 新建 28 篇）

---

## 四、文章内容大纲

### 分类 01：LLM 原理与工程（4 篇）

#### 1.1 大语言模型技术栈：从 Transformer 到 GPT/Claude 的架构演进
- **定位**: LLM 技术栈全景梳理
- **内容骨架**:
  - Transformer 架构：Self-Attention、Multi-Head Attention、位置编码
  - 从 GPT-1 到 GPT-4 / Claude 3.5 / DeepSeek-V3 的演进脉络
  - 开源 vs 闭源模型的技术差异
  - Token 化机制：BPE / SentencePiece / tiktoken 实现
  - 上下文窗口技术：RoPE / ALiBi / 外推方案
  - **架构图**: LLM 技术栈分层图（基础设施→模型→应用）

#### 1.2 Token 经济学与推理参数：成本、延迟、质量的三角博弈
- **定位**: 工程决策参考
- **内容骨架**:
  - 各主流模型 Token 定价对比表
  - 推理参数（temperature / top_p / top_k / frequency_penalty）对输出的影响
  - 上下文窗口管理策略：滑动窗口 / 摘要压缩 / 选择性上下文
  - Token 预算控制：Prompt 压缩、历史消息裁剪
  - **表格**: 成本-延迟-质量矩阵（不同模型在不同参数下的表现）

#### 1.3 LLM API 工程：多模型对接、流式输出与容错设计
- **定位**: 后端工程化实战参考
- **内容骨架**:
  - OpenAI / Anthropic / DeepSeek / 通义千问 API 规范对比
  - 统一 API 网关设计：适配器模式、Fallback 策略
  - 流式输出（Streaming）：SSE 协议、前端 EventSource 实现
  - 错误处理：限流、重试、指数退避、熔断
  - 异步并发调用与速率限制管理
  - **代码**: FastAPI 多模型 API 网关核心实现

#### 1.4 模型选择与部署策略：GPT、Claude、开源模型、国产模型全景
- **定位**: 技术选型决策参考
- **内容骨架**:
  - 闭源模型对比：GPT-4o / Claude 3.5 / Gemini
  - 开源模型对比：Llama 3 / Qwen 2.5 / DeepSeek / Mistral
  - 国产模型生态：文心一言 / 通义千问 / 智谱 GLM / Kimi / DeepSeek
  - 本地部署方案：Ollama / vLLM / TGI / llama.cpp
  - 选型决策框架：场景 → 性能 → 成本 → 部署方式
  - **表格**: 多维度选型对比表

---

### 分类 02：Prompt 工程（3 篇）

#### 2.1 Prompt Engineering 技术栈：从基础到 CoT/ToT 的完整体系
- **定位**: Prompt 技术体系全面梳理
- **内容骨架**:
  - Prompt 设计框架：角色 / 任务 / 约束 / 格式 / 示例
  - Zero-shot vs Few-shot vs One-shot 策略选择
  - Chain-of-Thought (CoT)：标准 CoT / Zero-shot CoT / Auto-CoT
  - Tree-of-Thought (ToT)：树形推理策略
  - Self-Consistency：多次推理取共识
  - ReAct Prompting：推理与行动交替
  - Prompt 版本管理与 A/B 测试
  - **框架图**: Prompt 技术分类体系

#### 2.2 系统提示词工程：角色设计、安全边界与行为控制
- **定位**: System Prompt 工程化实践
- **内容骨架**:
  - System Prompt 的作用域与优先级
  - 角色定义：Identity / Expertise / Behavior
  - 输出格式控制：JSON / Markdown / 结构化输出
  - 安全边界设定：禁止行为、内容过滤、输出校验
  - Prompt 泄露风险与防护
  - 多轮对话中的 Prompt 管理
  - **代码**: 一个完整的安全 Agent System Prompt 设计

#### 2.3 Prompt 攻防：注入攻击手法与防御架构
- **定位**: 安全视角的 Prompt 技术梳理
- **内容骨架**:
  - 直接注入：角色劫持、指令覆盖、分隔符绕过
  - 间接注入：通过外部数据源注入
  - 编码绕过：Base64 / Unicode / 混合编码
  - 多轮对话注入：累积式攻击
  - 防御架构：输入预处理→Prompt固化→输出校验→权限隔离
  - 检测方案：分类器检测、一致性校验、沙箱隔离
  - **架构图**: 纵深防御 Prompt 安全架构

---

### 分类 03：Agent 架构与框架生态（6 篇）

#### 3.1 AI Agent 架构全景：ReAct、Plan-and-Execute、Reflexion、LATS
- **定位**: Agent 设计模式体系梳理
- **内容骨架**:
  - Agent 核心循环：感知→思考→行动→观察
  - ReAct：Reasoning + Acting 交替执行
  - Plan-and-Execute：先全局规划后逐步执行
  - Reflexion：自我反思与迭代改进
  - LATS：语言模型驱动的树搜索
  - Agent 四大支柱：Planning / Tool Use / Memory / Reflection
  - 各模式适用场景对比与组合策略
  - **架构图**: 四种 Agent 模式的流程对比图

#### 3.2 Function Calling 与 Tool Use：工作原理、编排模式与安全考量
- **定位**: 工具调用技术全景
- **内容骨架**:
  - Function Calling 工作原理：从 prompt 到 function_call 到结果回传
  - OpenAI Function Calling vs Claude Tool Use 协议对比
  - 工具定义规范：JSON Schema / 参数校验 / 类型约束
  - 编排模式：顺序调用 / 并行调用 / 条件调用 / 递归调用
  - 动态工具选择：工具注册中心与路由策略
  - 安全考量：输入验证、沙箱执行、权限控制、审计日志
  - **代码**: 安全扫描 Agent 的多工具编排实现

#### 3.3 Agent 记忆系统：短期/长期/工作记忆的技术方案对比
- **定位**: 记忆管理技术方案梳理
- **内容骨架**:
  - 短期记忆：对话历史管理、滑动窗口、摘要压缩
  - 长期记忆：向量数据库存储、知识图谱、关系型数据库
  - 工作记忆：Scratchpad 模式、中间状态管理
  - 记忆检索策略：关键词检索 / 语义检索 / 混合检索
  - 记忆更新策略：覆盖 / 追加 / 衰减 / 知识蒸馏
  - 技术方案对比表：LangChain Memory / 自研方案 / 数据库方案
  - **表格**: 各记忆方案的性能-成本-复杂度对比

#### 3.4 LangChain 与 LangGraph 技术栈：核心抽象、工作流编排与生产实践
- **定位**: LangChain 生态全面梳理
- **内容骨架**:
  - LangChain 核心抽象：Model / Prompt / Chain / Agent / Memory / Retriever
  - LangChain 表达式语言 (LCEL) 与管道式编排
  - LangGraph 状态图思维：State / Node / Edge / Conditional Edge
  - LangGraph 高级特性：持久化、检查点、子图、人机协作
  - LangSmith 生态：调试、追踪、评估、监控
  - LangServe / LangChain Community 与生态扩展
  - 生产环境踩坑：版本兼容、性能瓶颈、调试技巧
  - **架构图**: LangChain 生态全景图

#### 3.5 Multi-Agent 框架生态：AutoGen、CrewAI、Dify 对比与选型
- **定位**: 多智能体框架选型参考
- **内容骨架**:
  - 多智能体协作设计模式：协商 / 竞争 / 分工 / 层级
  - AutoGen 深度解析：会话模式、代码执行、GroupChat
  - CrewAI 解析：角色定义、任务分配、流程编排、记忆共享
  - Dify 平台：低代码 Agent 编排、知识库集成、API 发布
  - 自研方案：基于 LangGraph / 原生 Python 构建
  - 框架选型决策矩阵：功能覆盖 / 易用性 / 可定制性 / 生产就绪度
  - **表格**: 三大框架 + 自研方案的多维对比

#### 3.6 MCP 协议与工具生态：Model Context Protocol 架构与实践
- **定位**: MCP 协议技术全景
- **内容骨架**:
  - MCP 设计理念：标准化 LLM 与外部工具的连接
  - 协议架构：Host / Client / Server / Transport
  - 核心原语：Tools / Resources / Prompts / Sampling
  - 传输层：stdio / SSE / Streamable HTTP
  - 现有 MCP Server 生态：GitHub / 文件系统 / 数据库 / 浏览器
  - 从零构建 MCP Server：Python (FastMCP) / TypeScript
  - MCP 在企业场景的应用：飞书 / LDAP / 云平台集成
  - 安全视角：MCP Server 权限模型与审计
  - **架构图**: MCP 协议分层架构图

---

### 分类 04：RAG 与知识库（4 篇）

#### 4.1 RAG 技术栈全景：从索引到检索到生成的完整链路
- **定位**: RAG 技术体系全面梳理
- **内容骨架**:
  - RAG 核心流程：文档处理→向量化→索引→检索→生成
  - 文档处理层：格式解析、元数据提取
  - 切分策略对比：字符切分 / 递归切分 / 语义切分 / 文档结构切分
  - 检索层：向量检索 / 关键词检索 / 混合检索
  - 生成层：上下文注入、引用溯源、答案校验
  - RAG vs 微调 vs 长上下文：三种方案对比
  - **架构图**: RAG 技术栈分层架构

#### 4.2 Embedding 与向量数据库：模型选型、PGVector/Milvus/Chroma 对比
- **定位**: 向量化技术与数据库选型
- **内容骨架**:
  - Embedding 模型技术栈：OpenAI / Cohere / BGE / GTE / Jina
  - 向量检索算法：HNSW / IVF / PQ / ScaNN
  - PGVector：基于 PostgreSQL 的向量扩展、适用场景
  - Milvus：分布式向量数据库、高吞吐场景
  - Chroma：轻量级嵌入式方案、原型开发
  - Pinecone / Weaviate / Qdrant：其他方案速览
  - 选型决策表：数据规模 / 部署复杂度 / 成本 / 功能
  - **表格**: 多维选型对比矩阵

#### 4.3 RAG 高级优化：混合检索、重排序、查询改写与评测闭环
- **定位**: RAG 优化技术方案梳理
- **内容骨架**:
  - 检索优化：混合检索（向量+BM25）、重排序（Cross-Encoder）
  - 查询改写：HyDE / Multi-Query / Step-back / Sub-Query 分解
  - 上下文优化：压缩、去重、相关性过滤
  - 生成优化：引用溯源、答案校验、多路召回投票
  - 评测体系：RAGAS / TruLens / 自定义评测
  - 评测指标：Faithfulness / Answer Relevancy / Context Precision / Recall
  - 优化闭环：评测→分析→调优→再评测
  - **流程图**: RAG 优化技术栈

#### 4.4 企业级 RAG 架构：知识库治理、访问控制与安全管控
- **定位**: 生产环境 RAG 架构设计参考
- **内容骨架**:
  - 知识库数据治理：文档版本控制、元数据管理、生命周期管理
  - 多租户设计：数据隔离、权限继承、访问控制
  - 向量数据库运维：索引管理、数据同步、备份恢复
  - 安全管控：敏感数据过滤、访问审计、合规检测
  - 性能优化：缓存策略、索引优化、异步处理
  - 监控告警：检索质量监控、异常检测
  - **架构图**: 企业级 RAG 系统架构图

---

### 分类 05：Agent 评测与质量保障（4 篇）

#### 5.1 Agent 评测方法论：维度设计、指标体系与评测框架
- **定位**: 评测方法论全面梳理
- **内容骨架**:
  - Agent 评测的特殊性：非确定性、多步推理、工具调用
  - 评测维度：任务完成度 / 工具调用准确性 / 推理链路稳定性 / 安全合规 / 效率
  - 静态评测 vs 动态评测 vs 在线评测
  - 评测数据集构建：标准 Case / 对抗性 Case / 边界 Case
  - 评测流程设计：数据准备→执行→收集→分析→报告
  - 从评测到改进的闭环机制
  - **框架图**: Agent 评测维度全景图

#### 5.2 LLM-as-Judge：原理、偏差分析与实战配置
- **定位**: LLM 评测技术深度梳理
- **内容骨架**:
  - LLM-as-Judge 工作原理：评分 / 排序 / 对比
  - 评估维度设计：准确性 / 连贯性 / 安全性 / 有用性
  - 偏差问题全景：位置偏差 / 长度偏差 / 自我偏好 / 格式偏差
  - 缓解策略：多评委投票 / 交换顺序 / 校准基准 / 混合评估
  - 评估 Prompt 设计：rubric / scoring criteria / 示例校准
  - 实现架构：评测服务设计、结果存储、可视化
  - **代码**: Python LLM-as-Judge 评测服务核心实现

#### 5.3 Agent Benchmark 生态：AgentBench/SWE-Bench/τ-Bench/BFCL 解读
- **定位**: 业界 Benchmark 综述
- **内容骨架**:
  - Benchmark 分类体系：通用 vs 垂直 / 静态 vs 交互 / 离线 vs 在线
  - AgentBench：多环境（OS/DB/Web/游戏）Agent 评测
  - SWE-Bench：软件工程任务（GitHub Issue → Patch）评测
  - τ-Bench：企业场景（零售/航空）Agent 评测
  - Berkeley Function Call Leaderboard：工具调用能力评测
  - OpenAI Evals / DeepEval 等评测框架
  - 垂直领域 Benchmark 设计方法论
  - **表格**: 各 Benchmark 的评测维度、数据集、特点对比

#### 5.4 评测平台架构：自动化评测、Trace 回放与归因分析
- **定位**: 评测平台工程化架构设计
- **内容骨架**:
  - 评测平台核心模块：任务调度 / 结果收集 / 指标计算 / 报告生成
  - Execution-based Eval 实现：端到端任务执行评测
  - Trace-based Eval 实现：Trace 记录、回放、状态恢复
  - 归因分析：从结果到原因的诊断链路
  - 可视化设计：对比视图 / 趋势分析 / 归因热图
  - 离线评测 + 在线 A/B 联动
  - **架构图**: 评测平台系统架构图

---

### 分类 06：AI 工程化（3 篇）

#### 6.1 AI 服务容器化与编排：Docker/K8s/GPU 调度/弹性伸缩
- **定位**: AI 服务部署技术栈梳理
- **内容骨架**:
  - AI 服务容器化：Dockerfile 最佳实践 / 多阶段构建 / 镜像优化
  - Docker Compose 多服务编排：API + Redis + PostgreSQL + 向量 DB
  - K8s 部署：Pod / Deployment / Service / Ingress / ConfigMap / Secret
  - GPU 谄度：nvidia-device-plugin / GPU 资源分配 / MIG
  - 弹性伸缩：HPA / VPA / KEDA 基于指标的自动扩缩
  - CI/CD：GitHub Actions / GitLab CI + K8s 自动部署
  - 模型服务化方案：vLLM / TGI / Ollama / Triton
  - **架构图**: AI 服务部署架构图

#### 6.2 LLM 应用性能工程：Token 优化、语义缓存与延迟调优
- **定位**: 性能优化技术方案梳理
- **内容骨架**:
  - Prompt 层优化：指令压缩、上下文裁剪、模板复用
  - 缓存策略：精确缓存 / 语义缓存 / 混合缓存（Redis + 向量相似度）
  - 延迟优化：流式输出、异步并发、预计算、模型降级
  - 吞吐优化：批处理、请求合并、并发控制
  - Token 优化：历史消息压缩、摘要提取、分层调用
  - 性能基准测试方法论
  - **代码**: 语义缓存的完整实现（Redis + Embedding）

#### 6.3 AI 应用可观测性：链路追踪、成本管控与告警体系
- **定位**: AI 运维监控技术栈
- **内容骨架**:
  - 可观测性三支柱在 AI 场景的适配
  - LLM 特有指标：Token 用量 / 延迟分布 / 幻觉率 / 安全事件
  - LangFuse / LangSmith 实操：Trace 收集与分析
  - 自定义 Metrics：Prometheus + Grafana
  - 成本管控：Token 预算、异常告警、使用分析
  - 日志聚合与分析：ELK / Loki
  - 告警策略：SLA 定义、分级告警、升级机制
  - **架构图**: AI 应用监控体系架构

---

### 分类 07：AI 辅助开发工具链（2 篇）

#### 7.1 AI 编程工具技术栈：Claude Code/Cursor/Copilot 能力对比与工作流
- **定位**: AI 编程工具全面评测与工作流设计
- **内容骨架**:
  - Claude Code：CLAUDE.md 配置、任务分解、代码审查、Git 集成
  - Cursor：Tab 补全 / Chat / Composer / @codebase / .cursorrules
  - GitHub Copilot：补全模式 / Chat / Workspace / Extensions
  - 三者能力维度对比：补全 / 重构 / 调试 / 大型项目理解 / 安全性
  - AI Native 开发工作流设计：需求→设计→编码→测试→部署
  - 企业级部署考量：隐私、安全、合规
  - **表格**: 三工具多维度能力对比矩阵

#### 7.2 自定义 MCP Server 开发：协议解析、Python/TS 实现与安全审计
- **定位**: MCP Server 开发技术梳理
- **内容骨架**:
  - MCP 协议深度解析：消息格式、能力协商、生命周期
  - Python 实现：FastMCP 框架、Tool / Resource / Prompt 定义
  - TypeScript 实现：MCP SDK、类型安全、错误处理
  - 传输层选择：stdio / SSE / Streamable HTTP
  - 测试与调试：MCP Inspector、日志分析
  - 生产部署：进程管理、健康检查、版本更新
  - 安全审计：权限模型、输入验证、操作日志、沙箱执行
  - **代码**: 安全工具 MCP Server 完整实现

---

### 分类 08：安全与 AI 融合（5 篇）⭐ 核心差异化

#### 8.1 AI 安全攻防全景：Prompt 注入、越狱攻击与防御架构
- **定位**: AI 安全攻防技术全景梳理
- **内容骨架**:
  - Prompt 注入：直接注入 / 间接注入 / 多轮累积注入
  - 越狱攻击：角色扮演 / 逻辑推理 / 多语言 / 编码绕过 / 多模态
  - 数据提取：系统提示词泄露 / 训练数据提取 / 上下文泄露
  - 防御架构：输入预处理→Prompt 固化→输出校验→权限隔离→内容审核
  - 纵深防御在 AI 系统中的应用
  - 安全评测：系统化测试 Agent 安全边界的方法
  - **架构图**: AI 安全纵深防御架构

#### 8.2 AI Agent 安全设计：权限模型、沙箱隔离与审计日志
- **定位**: Agent 安全架构设计参考
- **内容骨架**:
  - Agent 安全风险全景：工具滥用 / 数据泄露 / 权限提升 / 无限循环
  - 权限模型设计：最小权限 / RBAC / ABAC 在 Agent 中的应用
  - 代码执行沙箱：Docker / gVisor / Firecracker / E2B
  - 工具调用沙箱：输入验证 / 输出过滤 / 范围限制
  - 数据访问沙箱：敏感数据检测 / 脱敏 / 访问控制
  - 审计日志设计：行为记录 / 可追溯性 / 合规存储
  - ISO 27001 / 等保在 AI Agent 系统中的适配
  - **架构图**: Agent 安全架构分层图

#### 8.3 大模型红队测试：方法论、自动化工具与评测基准
- **定位**: AI 安全评测技术梳理
- **内容骨架**:
  - 大模型红队测试方法论框架
  - 攻击向量清单：Prompt 注入 / 越狱 / 数据泄露 / 偏见 / 有害内容
  - 安全评测基准：HarmBench / TrustLLM / SafetyBench
  - 自动化红队工具：PyRIT (Microsoft) / Garak / ArtPrompt
  - 安全评测数据集构建方法
  - 评测结果分析与安全改进建议
  - 安全评测报告模板
  - **流程图**: 红队测试流程与工具链

#### 8.4 AI 驱动安全运营：智能 SOC、自动化响应与漏洞分析 Agent
- **定位**: AI 在安全运营中的应用全景
- **内容骨架**:
  - 传统安全运营痛点：告警疲劳 / 误报率高 / 人力不足
  - 智能告警分析：LLM 过滤误报、告警摘要、优先级排序
  - 事件关联分析：Agent 自动关联多源日志（SIEM + EDR + NDR）
  - 威胁狩猎：AI 辅助的主动威胁检测
  - 自动化应急响应：SOAR + LLM 融合、Playbook 自动化
  - 漏洞分析 Agent：CVE 检索 / 影响评估 / 修复建议
  - 安全运营效果量化：MTTR / MTTD / 误报率 / 人工介入率
  - **架构图**: AI 驱动的智能 SOC 架构

#### 8.5 AI-Native 安全体系：企业安全从 0 到 1 的 AI 化实践
- **定位**: 企业安全体系建设参考
- **内容骨架**:
  - 企业安全体系框架：ISO 27001 / 等保 / NIST CSF
  - AI-Native 安全建设思路：用 AI 替代重复性安全工作
  - 安全技术栈选型：防火墙/VPN / SSO/LDAP / MDM/EDR
  - 身份认证体系：OAuth 2.0 / SAML / OIDC / 零信任
  - 数据安全：分级分类 / 加密 / 脱敏 / DLP
  - AI 工具在安全管理中的应用：安全审计自动化、合规检查
  - 安全意识培训的 AI 化改造
  - **架构图**: AI-Native 企业安全体系全景

---

### 分类 09：实战项目架构（4 篇）

#### 9.1 安全知识库 RAG 系统：架构设计、技术选型与实现
- **定位**: 完整 RAG 项目架构参考
- **内容骨架**:
  - 需求分析：安全团队知识管理痛点
  - 架构设计：前后端分离 + LangChain + PGVector + FastAPI + React
  - 文档处理管线：多格式解析→切分→向量化→索引
  - 检索与生成：混合检索 + 重排序 + LLM 生成
  - 前端架构：React 聊天界面 + 流式输出
  - 部署架构：Docker Compose 一键部署
  - 质量评测：RAGAS 评测 + 用户反馈闭环
  - **架构图**: 完整系统架构图 + 代码仓库链接

#### 9.2 安全 Agent：自动化漏洞扫描与报告生成架构
- **定位**: Agent 项目架构参考
- **内容骨架**:
  - 需求分析：自动化安全评估场景
  - Agent 架构：ReAct 模式 + LangGraph 工作流
  - 工具层：Nuclei / CVE 库 / 报告生成 / 告警通知
  - 推理链路：目标分析→工具选择→结果解读→报告生成
  - 安全考量：扫描范围限制、权限控制、结果脱敏
  - 评测体系：覆盖率 / 报告质量 / 误报率
  - **架构图**: 安全 Agent 架构图 + 代码仓库链接

#### 9.3 AI-Native IT 运维平台：Agent 重构企业 IT 服务架构
- **定位**: AI+IT 运维项目架构参考
- **内容骨架**:
  - 传统 IT 运维痛点分析
  - AI-Native IT 架构愿景
  - 核心 Agent 模块：账号开通 / 权限管理 / 故障排查
  - MCP 集成层：飞书 / LDAP / 云平台统一接入
  - 数据层：IT 资产 / 许可证 / 成本分析
  - 安全考量：操作审批流、审计日志、权限最小化
  - 前端仪表板：任务状态 / 自动化率 / 成本可视化
  - **架构图**: AI-Native IT 运维平台架构图 + 代码仓库链接

#### 9.4 自动化红队评测平台：评测引擎设计与实现
- **定位**: 评测平台项目架构参考
- **内容骨架**:
  - 平台需求分析：评测任务管理、结果可视化
  - 系统架构：评测引擎 + 任务调度 + 结果存储 + 前端
  - 评测引擎：测试用例执行、LLM-as-Judge 集成
  - 任务调度：并发控制、超时处理、重试机制
  - 可视化：评测对比 / 趋势分析 / 归因热图
  - 安全考量：评测数据隔离、模型 API Key 管理
  - **架构图**: 评测平台架构图 + 代码仓库链接

---

## 五、实施优先级

### P0：核心基础（第一批完成）
| 序号 | 文章 | 理由 |
|-----|------|------|
| 1.1 | 大语言模型技术栈 | 全局基础 |
| 2.1 | Prompt Engineering 技术栈 | 核心技能 |
| 3.1 | AI Agent 架构全景 | 核心技能 |
| 3.4 | LangChain 与 LangGraph 技术栈 | JD1 明确要求 |
| 8.1 | AI 安全攻防全景 | 差异化核心 |

### P1：核心技能（第二批完成）
| 序号 | 文章 | 理由 |
|-----|------|------|
| 1.2 | Token 经济学与推理参数 | 工程决策基础 |
| 1.3 | LLM API 工程 | 后端工程化 |
| 2.2 | 系统提示词工程 | Prompt 深度 |
| 3.2 | Function Calling 与 Tool Use | Agent 核心 |
| 3.3 | Agent 记忆系统 | Agent 核心 |
| 4.1 | RAG 技术栈全景 | RAG 基础 |
| 4.3 | RAG 高级优化 | RAG 深度 |
| 5.1 | Agent 评测方法论 | JD2 入门 |

### P2：框架与选型（第三批完成）
| 序号 | 文章 | 理由 |
|-----|------|------|
| 1.4 | 模型选择与部署策略 | 选型参考 |
| 2.3 | Prompt 攻防 | 安全+Prompt 交叉 |
| 3.5 | Multi-Agent 框架生态 | 框架选型 |
| 3.6 | MCP 协议与工具生态 | JD3 核心 |
| 4.2 | Embedding 与向量数据库 | 数据库选型 |
| 5.2 | LLM-as-Judge | JD2 核心 |
| 5.3 | Agent Benchmark 生态 | JD2 核心 |
| 7.1 | AI 编程工具技术栈 | JD3 核心 |
| 7.2 | 自定义 MCP Server | JD3 实战 |

### P3：专业深度与项目（第四批完成）
| 序号 | 文章 | 理由 |
|-----|------|------|
| 4.4 | 企业级 RAG 架构 | 生产级参考 |
| 5.4 | 评测平台架构 | JD2 高级 |
| 6.1 | AI 服务容器化与编排 | 部署能力 |
| 6.2 | LLM 应用性能工程 | 工程化能力 |
| 6.3 | AI 应用可观测性 | 运维能力 |
| 8.2 | AI Agent 安全设计 | 安全架构 |
| 8.3 | 大模型红队测试 | 安全评测 |
| 8.4 | AI 驱动安全运营 | 差异化 |
| 8.5 | AI-Native 安全体系 | JD3 核心 |
| 9.1 | 安全知识库 RAG 系统 | 综合实战 |
| 9.2 | 安全 Agent | 综合实战 |
| 9.3 | AI-Native IT 运维平台 | 综合实战 |
| 9.4 | 自动化红队评测平台 | 综合实战 |

---

## 六、JD 技能覆盖矩阵

### JD1: AI Agent 全栈开发

| JD 要求 | 对应文章 | 覆盖 |
|---------|---------|------|
| Prompt Engineering / CoT | 2.1, 2.2 | ✅ |
| Planning / Tool Use / Memory | 3.1, 3.2, 3.3 | ✅ |
| Multi-Agent | 3.5 | ✅ |
| React/Vue/Next.js | 9.1 (项目中) | ✅ |
| Python/FastAPI | 1.3, 9.1 | ✅ |
| MySQL/PG + Redis + 向量 DB | 4.2, 4.4 | ✅ |
| LLM API 对接 | 1.1, 1.2, 1.3 | ✅ |
| LangChain/LangGraph/AutoGen/Dify | 3.4, 3.5 | ✅ |
| ReAct/Function Calling/RAG | 3.1, 3.2, 4.1, 4.3 | ✅ |
| Docker/K8s/CI-CD | 6.1 | ✅ |
| AI 编程工具 | 7.1 | ✅ |
| 独立交付 | 9.1, 9.2 | ✅ |

### JD2: AI Agent 评测

| JD 要求 | 对应文章 | 覆盖 |
|---------|---------|------|
| 评测体系设计 | 5.1 | ✅ |
| Benchmark 构建 | 5.1, 5.3 | ✅ |
| LLM-as-Judge | 5.2 | ✅ |
| Execution/Trace-based Eval | 5.4 | ✅ |
| 评测平台研发 | 5.4, 9.4 | ✅ |
| AgentBench/SWE-Bench/τ-Bench | 5.3 | ✅ |
| 技术博客/开源 | 整个板块 (30篇) | ✅ |

### JD3: AI-Native IT

| JD 要求 | 对应文章 | 覆盖 |
|---------|---------|------|
| AI 工具深度使用 | 7.1 | ✅ |
| AI Agent/MCP 开发 | 3.1, 3.4, 3.6, 7.2 | ✅ |
| 安全体系从 0 到 1 | 8.5 | ✅ |
| AI 驱动 IT 自动化 | 8.4, 9.3 | ✅ |
| Docker/K8s/CI-CD | 6.1 | ✅ |
| Python/Go/Shell/TS | 多篇代码 | ✅ |

---

## 七、技术实现细节

### 文件格式
```yaml
---
title: "文章标题"
weight: 数值
tags: [标签1, 标签2]
menu: 
  main: 
    parent: "父级分类"
---
```

### 目录命名
- 分类：`{序号}-{分类名}`
- 文章：中文标题目录 + `_index.md`
- 分类页：`{{< article_cards >}}`

### 内容标准
1. 每篇 2000+ 字
2. 含架构图或流程图
3. 含关键代码片段
4. 末尾附 1-2 个动手练习
5. 含参考链接和延伸阅读
6. 融入安全视角

---

## 八、验证方案

1. `hugo server` 本地预览验证
2. 所有文章正确显示和导航
3. Hugo 构建无错误
4. JD 覆盖度检查
5. 安全+AI 融合文章深度检查
6. 实战项目文章含代码仓库链接

---

## 九、假设与决策

1. **技术栈梳理定位**：不是入门教程，而是技术方向的全景梳理，面向有工程经验的开发者
2. **安全差异化**：所有文章融入安全视角
3. **保留现有内容**：chatgpt/claude 基础教程保留
4. **学习路径排序**：原理→技术→框架→评测→工程化→安全→项目
5. **Hugo 主题兼容**：完全兼容 hugo-theme-relearn
