---
date: "2026-08-17 10:36:28 +0800"
title: "Agent 互联协议全景：A2A、ACP、ANP 与 MCP 的互补生态"
weight: 7
tags: [A2A, MCP, ANP, ACP, Multi-Agent, Agent通信, 互操作性]
menu:
  main:
    parent: "AIagent"
---

# Agent 互联协议全景：A2A、ACP、ANP 与 MCP 的互补生态

AI Agent 正从单一的对话助手演变为能够自主规划、协作执行的多智能体系统。当企业开始部署来自不同厂商、基于不同框架构建的 Agent 时，一个根本性问题浮出水面：**这些 Agent 如何相互发现、协商能力、安全地交换信息并协同完成任务？**

在此之前，每个框架都有自己的内部消息格式和任务模型——LangChain 的 Chain、CrewAI 的 Task、AutoGen 的 Conversation——没有通用的发现机制。一个 Salesforce Agent 无法将子任务委派给一个 ServiceNow Agent，除非手写定制胶水代码。这种 **N×N 的集成复杂度** 正是协议标准化的原动力。

本文将系统梳理四大 Agent 互联协议——**MCP**（Model Context Protocol）、**A2A**（Agent-to-Agent Protocol）、**ACP**（Agent Communication Protocol）和 **ANP**（Agent Network Protocol），从设计哲学、技术架构、适用场景到落地实践，为开发者提供一份清晰的技术选型地图。

---

## 1. 协议全景：四大协议各解决什么问题？

在深入每个协议之前，先建立全局认知。四大协议并非竞争关系，而是解决不同层次的互操作性问题：

| 协议 | 发起方 | 核心问题 | 通信模型 | 发布时间 | 当前状态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MCP** | Anthropic | Agent 如何访问工具和数据 | Client-Server（JSON-RPC） | 2024.11 | LF AAIF 旗舰项目，110M+ 月下载 |
| **A2A** | Google | Agent 之间如何协作完成任务 | Client-Remote Agent（JSON-RPC + SSE） | 2025.04 | LF 项目，v1.0，150+ 支持组织 |
| **ACP** | IBM BeeAI | Agent 之间如何通过 REST 通信 | RESTful API | 2025.05 | 已合并入 A2A（2025.08） |
| **ANP** | 社区 | 开放互联网上 Agent 如何去中心化协作 | P2P（DID + JSON-LD） | 2025 | LF 生态，三层架构，持续演进 |

一个形象的比喻：**MCP 是 Agent 的"USB-C 接口"**——让 Agent 能连接任何工具；**A2A 是 Agent 的"电话协议"**——让 Agent 能呼叫其他 Agent 并协作；**ANP 是 Agent 的"互联网"**——让任何 Agent 在开放网络上被发现和交互。

```
┌───────────────────────────────────────────────────────────────┐
│                    Agent 互联协议层次模型                        │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Layer 4: ANP — 去中心化开放网络                          │  │
│  │  DID 身份 · 元协议协商 · Agent 支付 · 开放市场              │  │
│  └─────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Layer 3: A2A — 企业级 Agent 协作                         │  │
│  │  Agent Card · Task 生命周期 · SSE 流式 · 推送通知           │  │
│  └─────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Layer 2: ACP — 轻量 REST 通信（已合并入 A2A）              │  │
│  │  RESTful API · 离线发现 · 多模态消息                       │  │
│  └─────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Layer 1: MCP — 工具与数据访问                             │  │
│  │  Resources · Tools · Prompts · Sampling                   │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. MCP：Agent 连接工具的通用接口

### 2.1 设计哲学

MCP 由 Anthropic 于 2024 年 11 月开源，2025 年 12 月捐赠给 Linux Foundation 下的 **Agentic AI Foundation（AAIF）**。其核心理念是：**为 LLM 提供标准化的工具接入层**，消除每个 AI 平台各自定义 Function Calling 格式的碎片化问题。

> MCP 被类比为"AI 的 USB-C"——一个统一的接口标准，让任何 AI 模型都能安全地连接到任何工具和数据源。

### 2.2 架构与通信模式

MCP 采用 **Client-Server 架构**，基于 **JSON-RPC 2.0** 协议：

```
┌─────────────────┐    JSON-RPC 2.0    ┌──────────────────┐
│                 │  ◄──────────────►  │                  │
│   MCP Client    │  (stdio / SSE /   │   MCP Server     │
│   (AI Agent)    │   HTTP Streaming)  │   (Tool Provider)│
│                 │                    │                  │
│  ┌───────────┐  │   Request:         │  ┌────────────┐  │
│  │ LLM Brain │──┼── tools/call ─────►│  │ Resources  │  │
│  │           │  │                    │  ├────────────┤  │
│  │           │◄─┼── Result/Error ◄───│  │ Tools      │  │
│  └───────────┘  │                    │  ├────────────┤  │
│                 │                    │  │ Prompts    │  │
│                 │                    │  ├────────────┤  │
│                 │                    │  │ Sampling   │  │
│                 │                    │  └────────────┘  │
└─────────────────┘                    └──────────────────┘
```

MCP Server 暴露四种能力：

| 能力 | 用途 | 示例 |
| :--- | :--- | :--- |
| **Resources** | 只读数据源 | 文件内容、数据库记录、API 响应 |
| **Tools** | 可执行操作 | 执行查询、发送邮件、创建文件 |
| **Prompts** | 可复用提示模板 | 带参数的结构化 Prompt |
| **Sampling** | 反向请求 LLM 补全 | Server 请求 Client 的模型能力 |

### 2.3 适用场景

- **单个 Agent 连接外部工具**：数据库查询、API 调用、文件操作
- **MCP Server 生态复用**：已有 10,000+ 开源 MCP Server
- **跨平台工具集成**：Claude、GPT、Gemini、Cursor 等均已原生支持

**关键局限**：MCP 解决的是 Agent 与工具之间的连接，**不处理 Agent 之间的协作**。当两个独立的 Agent 需要协商任务、交换上下文时，需要 A2A。

---

## 3. A2A：Agent 间协作的开放标准

### 3.1 设计哲学

Google 于 2025 年 4 月在 Cloud Next 大会上发布 A2A 协议，获得了 Atlassian、Salesforce、SAP、ServiceNow、LangChain 等 50+ 企业的支持。2025 年 6 月捐赠给 Linux Foundation，2026 年 4 月发布 v1.0。

A2A 的核心设计原则：

| 原则 | 含义 |
| :--- | :--- |
| **拥抱 Agent 能力** | Agent 以自然的非结构化方式协作，而非被降级为"工具" |
| **基于现有标准** | 构建在 HTTP、SSE、JSON-RPC 之上，兼容现有 IT 基础设施 |
| **默认安全** | 企业级认证授权，对齐 OpenAPI 安全方案 |
| **支持长时间任务** | 从秒级任务到跨天的深度研究，支持实时反馈和状态更新 |
| **模态无关** | 不限于文本，支持音频、视频、结构化数据流 |

### 3.2 核心组件

#### Agent Card：Agent 的"名片"

Agent Card 是一个 JSON 文档，托管在 `/.well-known/agent-card.json` 路径下，用于能力发现：

```json
{
  "name": "天气预报 Agent",
  "description": "提供全球城市天气查询和预报服务",
  "url": "https://weather-agent.example.com",
  "version": "1.0.0",
  "defaultInputModes": ["text"],
  "defaultOutputModes": ["text"],
  "capabilities": {
    "streaming": true,
    "pushNotifications": false
  },
  "authentication": {
    "schemes": ["bearer"]
  },
  "skills": [
    {
      "id": "get_weather",
      "name": "查询天气",
      "description": "根据城市名称查询当前天气和未来预报",
      "tags": ["weather", "forecast"]
    }
  ]
}
```

#### Task 生命周期：从提交到完成

A2A 的核心抽象是 **Task**——一个有状态的工作单元，具有明确的生命周期：

```
submitted ──► working ──► input-required ──► working ──► completed
    │              │              │                          │
    │              │              ▼                          │
    │              │          (等待输入)                       │
    │              ▼                                         │
    │           failed ◄─────────────────────────────────────┘
    ▼
  rejected / canceled
```

#### 消息与构件

| 概念 | 定义 |
| :--- | :--- |
| **Message** | 通信的基本单元，表示对话中的一轮交换 |
| **Part** | Message 中的内容片段，每个有指定的内容类型 |
| **Artifact** | Task 产出的结果，如生成的文件、报告、数据 |

### 3.3 通信模式

A2A 支持三种通信模式，覆盖不同场景：

| 模式 | 方法 | 适用场景 |
| :--- | :--- | :--- |
| **同步请求/响应** | `message/send` | 快速问答、简单任务 |
| **流式推送** | `message/stream`（SSE） | 实时进度更新、逐步输出 |
| **异步推送** | Webhook 通知 | 跨天的长时间研究任务 |

### 3.4 实现示例

使用 Python SDK 构建一个 A2A Server：

```python
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.types import (
    AgentCard, AgentSkill, AgentCapabilities,
    Task, TaskState, Message, Part, TextPart
)

class WeatherAgentExecutor(AgentExecutor):
    async def execute(self, context: RequestContext, event_queue: EventQueue):
        message = context.message
        query = message.parts[0].text

        result = await get_weather(query)

        task = Task(
            id=context.task_id,
            contextId=context.context_id,
            status={"state": TaskState.COMPLETED},
            artifacts=[{
                "parts": [TextPart(text=result)]
            }]
        )
        await event_queue.enqueue_event(task)
```

### 3.5 A2A 与 MCP 的关系

**A2A 和 MCP 是互补的，不是竞争的。** 这是理解整个协议生态的关键：

| 维度 | MCP | A2A |
| :--- | :--- | :--- |
| **解决的问题** | Agent 如何连接工具 | Agent 如何协作 |
| **通信对象** | Agent ↔ Tool/数据源 | Agent ↔ Agent |
| **发现机制** | 配置文件 / 环境变量 | Agent Card（HTTP 公开端点） |
| **任务模型** | 无状态请求/响应 | 有状态 Task 生命周期 |
| **内省能力** | Tool 无需隐藏内部逻辑 | Agent 保持不透明（opaque） |
| **典型场景** | 数据库查询、API 调用 | 跨系统工作流委派 |

> 实际应用中，一个 Agent 可以同时使用 MCP 连接内部工具、使用 A2A 与外部 Agent 协作。例如：库存 Agent 通过 MCP 查询数据库，检测到低库存后通过 A2A 通知采购 Agent 向供应商下单。

---

## 4. ACP：IBM BeeAI 的轻量方案与合并

### 4.1 设计哲学

ACP 由 IBM Research 的 BeeAI 团队于 2025 年 5 月发布，核心理念是 **极致简洁的 RESTful Agent 通信**。与 A2A 使用 JSON-RPC 不同，ACP 直接使用标准 HTTP REST 端点，无需特殊 SDK 即可用 curl 交互。

### 4.2 核心特性

| 特性 | 说明 |
| :--- | :--- |
| **REST 原生** | 标准 HTTP 端点，兼容现有 Web 基础设施 |
| **SDK 可选** | 可直接用 curl/Postman 交互，降低入门门槛 |
| **离线发现** | Agent 可在元数据包中嵌入描述，支持 Scale-to-Zero |
| **异步优先** | 默认异步通信，支持 SSE 流式 |
| **多模态** | 支持文本、图片、音频、嵌入向量等任意 MIME 类型 |

### 4.3 合并入 A2A

2025 年 8 月，IBM 宣布将 ACP 的技术和专业知识贡献给 A2A 项目，**ACP 停止独立维护**。这一决定减少了协议碎片化，A2A 在 v1.0 中吸收了 ACP 的 REST 端点绑定能力。

> **经验教训**：协议生态的碎片化是互操作性的最大敌人。ACP 的合并证明了社区收敛的趋势——与其维护多个竞争协议，不如在统一标准下共同演进。

---

## 5. ANP：去中心化的 Agent 互联网

### 5.1 设计哲学

ANP 是四大协议中最具前瞻性的——它面向的不是企业内部的多 Agent 协作，而是 **开放互联网上的 Agent 互联**。ANP 的愿景是成为"Agent 时代的 HTTP"，让任何 Agent 在任何平台上被发现、认证和交互。

ANP 的三层架构：

```
┌─────────────────────────────────────────────────────────────┐
│              Layer 3: 应用协议层                               │
│   Agent 描述(ADP) · Agent 发现 · 支付(AP2) · 授权 · 认证      │
├─────────────────────────────────────────────────────────────┤
│              Layer 2: 身份与通信基础设施                        │
│   DID:WBA 身份 · WNS 命名 · 密钥分发 · 安全消息 · 跨域通信       │
├─────────────────────────────────────────────────────────────┤
│              Layer 1: 开放互联网基础设施                        │
│   HTTP · CA · DNS · CDN · TLS · 搜索引擎                      │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 核心创新

#### 去中心化身份（DID:WBA）

ANP 基于 W3C DID 标准，每个 Agent 拥有一个去中心化标识符（如 `did:wba:1234abcd`），其对应的 DID 文档可通过 HTTPS 解析，包含公钥和验证元数据。这解决了 **跨平台信任** 的根本问题。

#### 元协议协商

ANP 的独特之处在于支持 **动态协议协商**——两个 Agent 首次交互时，可以通过元协议层协商使用哪种通信模式、安全配置和数据格式，而非预先绑定单一协议。

#### Agent 支付协议（AP2）

ANP 定义了 Agent 间的支付规范——当一个 Agent 为另一个 Agent 提供服务时，可以通过 DID 签名的支付授权和收据完成结算，支撑 **Agent 经济** 的商业模式。

### 5.3 适用场景

- **跨组织 Agent 协作**：不同公司的 Agent 通过开放网络交互
- **Agent 市场/发现**：类似 App Store 的 Agent 目录
- **去中心化 Agent 工作流**：无需中央编排器的多 Agent 协作
- **Agent 微支付**：按使用量计费的 Agent 服务

> ANP 目前处于早期阶段，生态成熟度不如 MCP 和 A2A。但它代表了 Agent 互联的终极方向——从封闭的企业内网走向开放的 Agent 互联网。

---

## 6. 协议对比：选型决策矩阵

### 6.1 技术维度对比

| 维度 | MCP | A2A | ACP（已合并） | ANP |
| :--- | :--- | :--- | :--- | :--- |
| **传输协议** | stdio / SSE / HTTP | HTTP + SSE | REST HTTP | HTTPS |
| **消息格式** | JSON-RPC 2.0 | JSON-RPC 2.0 | JSON (REST) | JSON-LD |
| **发现机制** | 配置文件 | Agent Card（HTTP） | 离线元数据 | DID + 搜索引擎 |
| **认证方式** | API Key / OAuth | OpenAPI 安全方案 | API Key | DID 签名 |
| **任务模型** | 无状态 | 有状态 Task | 有状态 Session | 有状态 + 支付 |
| **不透明执行** | 工具暴露逻辑 | Agent 保持内部隐藏 | Agent 保持内部隐藏 | Agent 保持内部隐藏 |
| **治理机构** | LF AAIF | Linux Foundation | 已合并入 A2A | 社区驱动 |
| **成熟度** | ★★★★★ | ★★★★☆ | ★★★☆☆ | ★★☆☆☆ |

### 6.2 场景选型指南

```
你的需求是什么？
│
├── 让 Agent 连接数据库/API/文件？
│   └── ✅ MCP
│
├── 让两个同企业的 Agent 协作完成任务？
│   └── ✅ A2A
│
├── 让不同厂商的 Agent 发现和委派任务？
│   └── ✅ A2A + Agent Card
│
├── 在开放互联网上让 Agent 被发现和交互？
│   └── ✅ ANP（未来方向）
│
└── 以上全部？
    └── ✅ MCP + A2A（当前最佳实践）
```

---

## 7. Agentic AI Foundation：统一治理的里程碑

2025 年 12 月，Linux Foundation 成立 **Agentic AI Foundation（AAIF）**，由 Anthropic、OpenAI 和 Block 联合发起，Google、Microsoft、AWS、Bloomberg、Cloudflare 为白金会员。

AAIF 的成立标志着 Agent 互联协议从各自为政走向统一治理：

| 项目 | 贡献方 | 角色 |
| :--- | :--- | :--- |
| **MCP** | Anthropic | Agent-工具连接标准 |
| **goose** | Block | 开源 Agent 框架 |
| **AGENTS.md** | OpenAI | Agent 编码规范 |
| **A2A** | Google（LF 项目） | Agent-Agent 协作标准 |

截至 2026 年 4 月，AAIF 已拥有 **170+ 成员组织**，MCP 月 SDK 下载量超过 **1.1 亿次**，A2A 支持组织超过 **150 家**。

> AAIF 对 Agent 互联协议生态的意义，类似于 CNCF 对 Kubernetes 生态的意义——通过中立的开源治理，确保标准的开放性、中立性和社区驱动演进。

---

## 8. 渐进式采用路线图

基于学术界提出的四阶段采用模型（Ehtesham et al., 2025），企业可以按以下路径渐进式引入 Agent 互联协议：

### Stage 1：MCP — 工具访问（当前阶段）

- 为现有 Agent 接入 MCP Server，标准化工具调用
- 利用已有 10,000+ 开源 MCP Server 生态
- **优先级**：最高，已有广泛生产实践

### Stage 2：A2A — 企业内 Agent 协作

- 为关键 Agent 发布 Agent Card
- 实现跨团队/跨系统的 Agent 任务委派
- 利用 SSE 流式和 Webhook 推送支持长时间任务
- **优先级**：高，v1.0 已可用于生产

### Stage 3：ANP — 开放 Agent 网络

- 探索 DID 身份和去中心化发现
- 参与 Agent 市场和跨组织协作场景
- **优先级**：中长期布局，生态仍在成熟中

### Stage 4：全栈互联

- MCP + A2A + ANP 三层组合
- 从工具访问到企业协作再到开放市场
- **优先级**：终极目标

```
时间线（建议）：

2025 ──────── 2026 ──────── 2027 ──────── 2028+
  │              │              │              │
  ▼              ▼              ▼              ▼
 Stage 1       Stage 2       Stage 3       Stage 4
 MCP 工具      A2A 协作      ANP 网络      全栈互联
 接入          试点          探索          成熟
```

---

## 9. 安全考量与最佳实践

Agent 互联协议引入了新的攻击面，需要重点关注：

| 风险 | 影响 | 防御措施 |
| :--- | :--- | :--- |
| **Agent Card 伪造** | 恶意 Agent 冒充合法服务 | 验证签名、手动配置可信对等方 |
| **工具占据（Tool Squatting）** | 恶意 Agent 注册相似技能名 | Agent Card 签名验证、注册审核 |
| **跨 Agent 提示注入** | 通过 Agent 间消息注入恶意指令 | 消息内容验证、输入清洗 |
| **权限提升** | Agent 通过协作获取越权能力 | 最小权限原则、作用域限制 |
| **Agent 合谋攻击** | 多个恶意 Agent 协同作恶 | 行为监控、异常检测、审计日志 |

> **关键原则**：任何通过 A2A 发现的 Agent Card 都应被视为潜在不可信的。Palo Alto Networks（2025）的研究明确指出 Agent Card 伪造和工具占据是 A2A 部署中的现实风险，而非假设性威胁。

---

## 10. 总结与展望

Agent 互联协议正在快速收敛为一个分层互补的技术栈：

- **MCP 是基础层**：解决 Agent 如何连接工具和数据，已成事实标准
- **A2A 是协作层**：解决 Agent 之间如何发现、协商和协作，v1.0 已就绪
- **ANP 是网络层**：解决开放互联网上的 Agent 互联，代表未来方向
- **AAIF 是治理层**：确保所有协议在中立开源治理下演进

核心要点：

- **MCP 和 A2A 是互补的，不是竞争的** —— MCP 管工具访问，A2A 管 Agent 协作
- **协议碎片化正在收敛** —— ACP 合并入 A2A，MCP 和 A2A 共同纳入 AAIF
- **安全是首要挑战** —— Agent Card 伪造、跨 Agent 注入、权限提升需要系统性防御
- **渐进式采用是最务实的路径** —— 从 MCP 开始，逐步引入 A2A，远期布局 ANP
- **Agent 经济即将到来** —— ANP 的支付协议预示着 Agent 作为服务提供者的商业模式

> 正如 HTTP 统一了人类访问万维网的方式，Agent 互联协议正在定义 AI Agent 之间协作的基础设施。今天选择 MCP + A2A，就是在为这个"Agent 互联网"铺设第一块基石。

---

## 参考资源

- [A2A Protocol Specification](https://a2a-protocol.org/v1.0.0/specification) — A2A 协议完整技术规范 v1.0
- [A2A GitHub Repository](https://github.com/a2aproject/A2A) — A2A 开源仓库，含示例和 SDK
- [A2A Python SDK](https://github.com/a2aproject/a2a-python) — 官方 Python SDK 实现
- [MCP Official Site](https://modelcontextprotocol.io/) — MCP 协议官方文档
- [ANP Specification](https://agent-network-protocol.com/specs/1.1/white-paper) — ANP 1.1 白皮书
- [Agentic AI Foundation](https://aaif.io/) — Linux Foundation 下的 AAIF 官网
- [A Survey of Agent Interoperability Protocols](https://arxiv.org/html/2505.02279v1) — MCP/ACP/A2A/ANP 四协议综述论文（arXiv:2505.02279）
- [Google A2A Announcement](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/) — Google 官方 A2A 发布博客
- [IBM ACP Documentation](https://agentcommunicationprotocol.dev/) — ACP 协议文档（已合并入 A2A）
- [AAIF Formation Announcement](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation) — AAIF 成立新闻稿
