---
title: "MCP 协议与工具生态：Model Context Protocol 架构与实践"
weight: 6
tags: [MCP, Model Context Protocol, 工具生态, Claude, 协议]
menu: 
  main: 
    parent: "Agent 架构与框架生态"
---

# MCP 协议与工具生态：Model Context Protocol 架构与实践

2024 年 11 月，Anthropic 发布了 Model Context Protocol（MCP），一个用于标准化 LLM 应用与外部数据源和工具之间连接的开放协议。这一举动被业界称为"AI 的 USB-C 接口"——在此之前，每个 AI 应用对接外部工具都需要编写定制化的适配器，形成了一个 N×M 的集成矩阵；MCP 的出现将这个矩阵压缩为 N+M，开发者只需实现一次 Server，即可被任何支持 MCP 的 Host 消费。

MCP 的设计灵感来自 Language Server Protocol（LSP）。正如 LSP 统一了编程语言对 IDE 的适配方式，MCP 统一了工具和数据源对 AI 应用的接入方式。截至 2025 年，OpenAI、Google DeepMind、Microsoft 等主要 AI 厂商均已宣布支持 MCP，2025 年 12 月 Anthropic 将 MCP 捐赠给 Linux 基金会旗下的 Agentic AI Foundation（AAIF），标志着这一协议从企业主导走向行业共治。

本文将从协议设计理念出发，系统剖析 MCP 的架构分层、核心原语、传输机制和安全模型，并通过 Python FastMCP 实战演示如何从零构建 MCP Server，最后讨论企业级部署场景和安全考量。

---

## 一、MCP 设计理念：从 N×M 到 N+M

### 1.1 集成困境

在 MCP 出现之前，将 LLM 与外部系统连接需要为每个 (LLM, 工具) 组合编写专用的适配器。假设有 N 个 AI 应用（如 Claude Desktop、Cursor、ChatGPT）和 M 个工具/数据源（如文件系统、GitHub、数据库），那么理论上需要 N×M 个集成适配器。随着 AI 应用和工具数量的爆发式增长，这个矩阵的维护成本急剧攀升。

```
┌──────────────────────────────────────────────────────────────────┐
│                    N×M 集成困境                                    │
│                                                                  │
│              工具 1    工具 2    工具 3      工具 M              │
│  AI 应用 1  ──┼────────┼────────┼───────────┼──                  │
│  AI 应用 2  ──┼────────┼────────┼───────────┼──                  │
│  AI 应用 3  ──┼────────┼────────┼───────────┼──                  │
│      ⋮       ──┼────────┼────────┼───────────┼──                  │
│  AI 应用 N  ──┼────────┼────────┼───────────┼──                  │
│                                                                  │
│  每个交叉点 = 一个定制化适配器，N×M 个连接                        │
│                                                                  │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─                │
│                                                                  │
│              工具 1    工具 2    工具 3      工具 M              │
│  AI 应用 1  ──┼────────┼────────┼───────────┼──                  │
│  AI 应用 2  ──┼────────┼────────┼───────────┼──                  │
│  AI 应用 3  ──┼────────┼────────┼───────────┼──                  │
│      ⋮       ──┼────────┼────────┼───────────┼──                  │
│  AI 应用 N  ──┼────────┼────────┼───────────┼──                  │
│               ═══════════════════════════════                    │
│                    MCP 协议层                                     │
│                                                                  │
│  引入标准化协议层后，只需 N+M 个实现                               │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 MCP 的解决思路

MCP 引入了一个**标准化的中间协议层**，将集成问题解耦：

- **工具侧**：每个工具/数据源实现一次 MCP Server，暴露 Tools、Resources 和 Prompts。
- **应用侧**：每个 AI 应用实现一次 MCP Client，通过协议发现和调用 Server 提供的能力。
- **传输层**：协议定义了标准的通信方式（stdio / Streamable HTTP），确保跨平台互操作。

这种架构与 OpenAI 早期的 Function Calling 有本质区别：Function Calling 是厂商特定的请求格式，嵌入在每次 API 调用中；而 MCP 是一个独立的、厂商中立的传输与发现协议——Server 部署一次，任何支持 MCP 的 Host 都能发现并使用它。

---

## 二、协议架构：Host / Client / Server / Transport

### 2.1 三层角色模型

MCP 定义了三个核心角色，形成了清晰的层次关系：

```
┌─────────────────────────────────────────────────────────────────┐
│                       MCP 架构全景                                │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Host（宿主应用）                                          │  │
│  │  如 Claude Desktop, Cursor, ChatGPT                       │  │
│  │  ┌─────────────────┐  ┌─────────────────┐                │  │
│  │  │  LLM 推理引擎    │  │  用户界面        │                │  │
│  │  └────────┬────────┘  └────────┬────────┘                │  │
│  │           └──────────┬─────────┘                          │  │
│  │                      ▼                                    │  │
│  │  ┌──────────────────────────────────────────────────┐    │  │
│  │  │  MCP Client（协议客户端）                          │    │  │
│  │  │  负责与多个 MCP Server 建立连接、能力协商、消息收发  │    │  │
│  │  └────┬──────────────┬──────────────┬───────────────┘    │  │
│  └───────┼──────────────┼──────────────┼────────────────────┘  │
│          │ JSON-RPC 2.0 │              │                       │
│          ▼              ▼              ▼                       │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                 │
│  │MCP Server│    │MCP Server│    │MCP Server│                 │
│  │ 文件系统  │    │  GitHub  │    │  数据库   │                 │
│  │          │    │          │    │          │                 │
│  │Tools     │    │Tools     │    │Tools     │                 │
│  │Resources │    │Resources │    │Resources │                 │
│  │Prompts   │    │Prompts   │    │Prompts   │                 │
│  └──────────┘    └──────────┘    └──────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

**Host（宿主应用）**：拥有 LLM 推理能力和用户界面的应用程序。Host 负责管理用户交互、控制 MCP Client 的创建和生命周期、保障数据安全和用户隐私。一个 Host 可以同时连接多个 MCP Server。

**Client（协议客户端）**：Host 内部的协议连接器，负责与特定的 MCP Server 建立一对一连接。Client 处理协议协商、消息路由、能力发现等细节。一个 Host 可以包含多个 Client 实例，每个实例连接一个 Server。

**Server（能力提供方）**：提供具体工具、数据和交互模板的服务进程。Server 不关心谁在调用它——无论是 Claude Desktop 还是 Cursor，只要遵循 MCP 协议，就能使用 Server 暴露的能力。

### 2.2 协议生命周期

MCP 连接的完整生命周期包含四个阶段：

```
┌──────────────────────────────────────────────────────────────────┐
│                    MCP 协议生命周期                                │
│                                                                  │
│  Client                                          Server          │
│    │                                                │            │
│    │  ──── 1. initialize ──────────────────────→    │            │
│    │       (protocolVersion, capabilities,          │            │
│    │        clientInfo)                             │            │
│    │                                                │            │
│    │  ←──── initialize result ──────────────────    │            │
│    │       (protocolVersion, capabilities,          │            │
│    │        serverInfo)                             │            │
│    │                                                │            │
│    │  ──── initialized notification ───────────→    │            │
│    │                                                │            │
│    │  ══════════════ 运行阶段 ═══════════════════   │            │
│    │                                                │            │
│    │  ──── tools/list ─────────────────────────→    │            │
│    │  ←──── tools 结果 ─────────────────────────    │            │
│    │  ──── tools/call ─────────────────────────→    │            │
│    │  ←──── 执行结果 ──────────────────────────     │            │
│    │  ──── resources/read ─────────────────────→    │            │
│    │  ←──── 资源数据 ──────────────────────────     │            │
│    │                                                │            │
│    │  ══════════════ 关闭阶段 ═══════════════════   │            │
│    │                                                │            │
│    │  ──── close / disconnect ─────────────────→    │            │
│    │                                                │            │
└──────────────────────────────────────────────────────────────────┘
```

**1. 初始化（Initialization）**：Client 向 Server 发送 `initialize` 请求，包含协议版本号（如 `2025-11-25`）、Client 能力声明和客户端信息。Server 返回自己的协议版本、支持的能力和服务器信息。双方通过版本协商确定通信使用的协议版本。

**2. 能力协商（Capability Negotiation）**：Server 在初始化响应中声明自己支持的功能集（tools、resources、prompts、sampling 等），Client 同样声明自己提供的能力（如 roots、elicitation）。只有双方都声明了的能力才会在后续通信中启用。

**3. 运行阶段（Operation）**：连接建立后，Client 和 Server 通过 JSON-RPC 2.0 消息进行双向通信。Client 可以调用 Server 的 tools、读取 resources、获取 prompts；Server 也可以通过 sampling 请求 Client 侧的 LLM 推理。

**4. 关闭（Shutdown）**：任一方可以优雅关闭连接。Client 断开时，Server 应清理相关资源。

---

## 三、核心原语：Tools、Resources、Prompts、Sampling

MCP 定义了四种核心原语，分别对应不同的使用场景：

### 3.1 Tools（工具）

Tools 是 MCP 中最核心的原语——**由 Server 暴露、LLM 可调用的函数**。每个 Tool 有名称、描述和 JSON Schema 定义的输入参数。LLM 通过推理决定是否调用某个 Tool 以及传入什么参数。

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("database-tools")

@mcp.tool()
async def query_database(sql: str, database: str = "production") -> str:
    """Execute a read-only SQL query against the specified database.
    
    Args:
        sql: The SQL query to execute (SELECT only)
        database: Target database name
    """
    if not sql.strip().upper().startswith("SELECT"):
        return "Error: Only SELECT queries are allowed"
    result = await execute_query(database, sql)
    return format_results(result)
```

Tools 与 OpenAI Function Calling 的关键区别在于：Function Calling 的工具定义嵌入在每次 API 请求中，而 MCP Tool 的定义由 Server 在连接初始化后通过 `tools/list` 方法声明一次，后续 Client 可缓存使用。

### 3.2 Resources（资源）

Resources 是**由 Server 暴露的只读数据源**，类似于 REST API 中的 GET 端点。与 Tools 不同，Resources 不执行操作，只提供数据供 LLM 上下文使用。

```python
@mcp.resource("config://app/settings")
async def get_app_settings() -> dict:
    """返回应用配置信息"""
    return {
        "version": "2.1.0",
        "environment": "production",
        "max_retries": 3
    }

@mcp.resource("db://tables/{table_name}/schema")
async def get_table_schema(table_name: str) -> str:
    """返回指定数据表的 schema 信息"""
    schema = await fetch_table_schema(table_name)
    return format_schema(schema)
```

Resources 支持**模板化 URI**（如 `db://tables/{table_name}/schema`），允许动态参数化访问。Client 可以通过 `resources/list` 发现可用资源，通过 `resources/read` 读取资源内容。

### 3.3 Prompts（提示模板）

Prompts 是**可复用的交互模板**，预定义了 LLM 的上下文和指令模式。Server 通过 Prompts 告诉 Client："如果你需要完成某类任务，可以使用这个模板"。

```python
@mcp.prompt()
async def code_review_prompt(language: str, code: str) -> str:
    """生成代码审查的提示模板"""
    return f"""你是一位资深的 {language} 代码审查专家。请对以下代码进行审查：

```{language}
{code}
```

请从以下维度进行分析：
1. 代码质量和可读性
2. 潜在的 bug 和边界情况
3. 性能优化建议
4. 安全性考量"""
```

### 3.4 Sampling（采样）

Sampling 是 MCP 中唯一的**反向能力**——允许 Server 请求 Client 侧的 LLM 进行推理。这使得 Server 可以实现"Server-initiated agentic behaviors"，例如在工具执行过程中需要 LLM 做中间判断。

```
┌──────────────────────────────────────────────────────────────┐
│                     Sampling 交互流程                         │
│                                                              │
│  Client ──── tools/call ──────────────────→ Server           │
│  Client ←──── 工具开始执行 ─────────────── Server            │
│  Client ←──── sampling/createMessage ───── Server            │
│          (Server 需要 LLM 做一次推理)                         │
│  Client ──── sampling 结果 ────────────────→ Server          │
│  Client ←──── tools/call result ─────────── Server           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

值得注意的是，Sampling 操作需要用户同意——Host 应该让用户知晓 Server 正在请求 LLM 推理，并提供审批机制。这在安全架构中至关重要，因为恶意 Server 可能利用 Sampling 发起间接的 prompt 注入攻击。

---

## 四、传输层：stdio、SSE 与 Streamable HTTP

MCP 使用 JSON-RPC 2.0 编码消息，定义了两种标准传输机制：

### 4.1 stdio（标准输入输出）

最简单的传输方式——Client 将 MCP Server 作为子进程启动，Server 从 `stdin` 读取 JSON-RPC 消息，向 `stdout` 写入响应。每条消息占一行，以换行符分隔。

```
┌──────────────────────────────────────────────────────────────┐
│                     stdio 传输模式                             │
│                                                              │
│  Client 进程                                                  │
│  ┌──────────────────────────────┐                           │
│  │  启动子进程 → MCP Server      │                           │
│  │                              │                           │
│  │  stdin ──────JSON-RPC──────→ │ ← Server 进程             │
│  │  stdout ←────JSON-RPC─────── │   读 stdin，写 stdout     │
│  │  stderr ←────日志/错误─────── │   日志输出到 stderr       │
│  └──────────────────────────────┘                           │
└──────────────────────────────────────────────────────────────┘
```

**适用场景**：本地开发、CLI 工具集成、对延迟敏感的场景。

**优势**：零网络开销、进程隔离（Server 崩溃不影响 Client）、无需认证。

**劣势**：每个 Client 需要独占一个 Server 进程，不适合多用户共享；无传输层认证（只能通过环境变量传递密钥）；难以集中审计。

### 4.2 Streamable HTTP

2025 年 3 月引入的新传输方式，取代了早期的 HTTP+SSE 双端点设计。Server 暴露单一 HTTP 端点（如 `/mcp`），Client 通过 POST 发送 JSON-RPC 消息，Server 可以选择返回普通 JSON 响应或升级为 SSE 流式响应。

```
┌──────────────────────────────────────────────────────────────┐
│                   Streamable HTTP 传输模式                     │
│                                                              │
│  Client                          Server                      │
│    │                               │                         │
│    │  POST /mcp                    │                         │
│    │  Content-Type: application/json                        │
│    │  Mcp-Session-Id: xxx          │                         │
│    │  ──────JSON-RPC────────────→  │                         │
│    │                               │                         │
│    │  ←── 200 OK ─────────────────│                         │
│    │  (JSON body 或 SSE stream)    │                         │
│    │                               │                         │
│    │  GET /mcp (SSE stream)        │                         │
│    │  ←── Event: message ──────────│                         │
│    │      data: {JSON-RPC}         │                         │
│    │                               │                         │
└──────────────────────────────────────────────────────────────┘
```

**适用场景**：远程部署、多用户共享、企业生产环境。

**优势**：支持 OAuth 2.1 认证、集中化审计日志、水平扩展、支持有状态会话（通过 `Mcp-Session-Id` 头）。

**劣势**：需要网络基础设施（负载均衡器、TLS 终止）；相比 stdio 有少量延迟开销。

### 4.3 传输方式选型

| 特征 | stdio | Streamable HTTP |
|------|-------|-----------------|
| 部署拓扑 | Client 本地子进程 | 独立服务进程 |
| 多用户支持 | 不支持（每用户一个进程） | 支持（多客户端连接） |
| 认证机制 | 无（环境变量） | OAuth 2.1 |
| 审计能力 | 分散，需 out-of-band | 集中网关拦截 |
| 延迟 | 极低（进程间通信） | 低（HTTP 往返） |
| 水平扩展 | 不支持 | 支持 |
| 适用阶段 | 本地开发 | 生产部署 |

经验法则：**开发用 stdio，生产用 Streamable HTTP**。大多数 MCP SDK 支持同一个 Server 绑定多种传输方式，通过环境变量或命令行参数切换。

---

## 五、MCP Server 生态

### 5.1 官方参考实现

MCP 官方仓库（`modelcontextprotocol/servers`，GitHub 72k+ star）维护了一系列参考实现，涵盖常见场景：

| Server | 功能 | 传输 | 语言 |
|--------|------|------|------|
| filesystem | 文件读写、目录浏览 | stdio | TypeScript |
| github | PR、Issue、代码搜索 | stdio | TypeScript |
| postgres | PostgreSQL 查询 | stdio | TypeScript |
| slack | 频道消息读写 | stdio | TypeScript |
| brave-search | 网页搜索 | stdio | TypeScript |
| google-maps | 地理编码和路线规划 | stdio | TypeScript |
| puppeteer | 浏览器自动化 | stdio | TypeScript |

这些参考实现主要用于演示 MCP 的能力特性和 SDK 用法，不建议直接用于生产环境。

### 5.2 社区生态

MCP 社区生态在 2025 年经历了爆发式增长。主要的注册中心包括：

- **PulseMCP**：15,900+ 已索引 Server，最大的社区注册中心
- **Smithery**：约 7,300 个 Server
- **MCP Registry**：官方注册中心，约 2,000 个 Server
- **mcp.so**：社区驱动的 Server 发现平台，17,000+ Server

### 5.3 厂商运营的 MCP Server

2025-2026 年间，主流云厂商和 SaaS 厂商纷纷推出自己的 MCP Server：

- **GitHub**：官方维护 `github/github-mcp-server`，覆盖 PR、Issue、Actions、Code Search 等 72+ 工具
- **Atlassian**：Jira + Confluence + Compass 的统一 MCP Server
- **Cloudflare**：Workers MCP，支持 OAuth 2.1 和 TLS 终止
- **AWS**：Bedrock AgentCore Gateway，支持 MCP 作为联邦网关
- **Azure**：Microsoft Copilot Studio 集成 MCP
- **高德地图**：官方 MCP Server，提供地理信息服务
- **智谱 AI**：Web Search MCP Server，集成多搜索引擎

---

## 六、从零构建 MCP Server：Python FastMCP 实战

FastMCP 是 Python 生态中最主流的 MCP Server 开发框架，1.0 版本已被纳入官方 MCP Python SDK。它通过装饰器模式，让开发者用最少的代码构建生产级 MCP Server。

### 6.1 项目初始化

```bash
# 安装 uv（现代 Python 包管理器）
curl -Ssf https://astral.sh/uv/install.sh | sh

# 初始化项目
uv init mcp-data-service
cd mcp-data-service

# 安装依赖
uv add fastmcp httpx
```

### 6.2 构建完整的 MCP Server

```python
from fastmcp import FastMCP
import httpx
from datetime import datetime

mcp = FastMCP(
    name="data-service",
    version="1.0.0"
)


@mcp.tool()
async def fetch_exchange_rate(
    base_currency: str, 
    target_currency: str
) -> str:
    """查询实时汇率
    
    Args:
        base_currency: 基础货币代码（如 USD, EUR, CNY）
        target_currency: 目标货币代码
    """
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.exchangerate.host/latest",
            params={"base": base_currency, "symbols": target_currency}
        )
        data = resp.json()
        rate = data.get("rates", {}).get(target_currency, "N/A")
        return f"1 {base_currency} = {rate} {target_currency}"


@mcp.resource("service://status")
async def get_service_status() -> dict:
    """返回服务运行状态"""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "uptime": datetime.now().isoformat()
    }


@mcp.resource("service://config/{key}")
async def get_config_value(key: str) -> str:
    """按 key 查询配置值"""
    configs = {
        "max_retries": "3",
        "timeout": "30",
        "region": "ap-east-1"
    }
    return configs.get(key, f"Key '{key}' not found")


@mcp.prompt()
async def data_analysis_prompt(
    dataset_name: str, 
    question: str
) -> str:
    """生成数据分析提示"""
    return f"""你是一位数据分析专家。请基于数据集 "{dataset_name}" 回答以下问题：

{question}

请按以下步骤分析：
1. 首先理解数据集的结构和字段
2. 编写查询逻辑获取相关数据
3. 基于数据给出有洞察力的分析结论"""


if __name__ == "__main__":
    mcp.run()
```

### 6.3 测试与调试

FastMCP 内置了对 MCP Inspector 的支持。MCP Inspector 是官方提供的 Web 调试工具，可视化展示 Server 的所有能力。

```bash
# 使用 MCP Inspector 测试 Server
npx @modelcontextprotocol/inspector uv run server.py
```

Inspector 提供以下调试能力：
- **Tools 标签页**：列出所有可用工具，可以手动填写参数并执行调用
- **Resources 标签页**：浏览可用资源，查看资源内容
- **Prompts 标签页**：选择 Prompt 模板并预览生成结果
- **日志面板**：实时查看 Client-Server 之间的 JSON-RPC 消息流

### 6.4 接入 Claude Desktop

在 Claude Desktop 的配置文件（`claude_desktop_config.json`）中添加：

```json
{
  "mcpServers": {
    "data-service": {
      "command": "uv",
      "args": ["run", "server.py"],
      "cwd": "/path/to/mcp-data-service"
    }
  }
}
```

重启 Claude Desktop 后，LLM 就能自动发现并调用你定义的 Tools、读取 Resources、使用 Prompts。

---

## 七、企业场景应用

### 7.1 飞书/Lark 集成

企业中常见的场景是将 MCP Server 与飞书等协作平台对接。架构模式如下：

```
┌──────────────────────────────────────────────────────────────┐
│                  企业 MCP 部署架构                              │
│                                                              │
│  ┌────────────────┐                                          │
│  │  AI 应用       │                                          │
│  │  (Claude/GPT)  │                                          │
│  └───────┬────────┘                                          │
│          │                                                   │
│  ┌───────▼────────┐                                          │
│  │  MCP Gateway   │ ← OAuth 2.1 认证                        │
│  │  (统一入口)     │ ← 速率限制 & 审计                        │
│  └───┬────┬───┬───┘                                          │
│      │    │   │                                              │
│  ┌───▼┐ ┌─▼──┐ ┌▼─────┐                                     │
│  │ HR │ │ CRM│ │ PM   │ ← 各业务域 MCP Server               │
│  │MCP │ │MCP │ │ MCP  │                                      │
│  └──┬─┘ └─┬──┘ └┬─────┘                                     │
│     │     │     │                                            │
│  ┌──▼──┐ ┌▼───┐ ┌▼────┐                                     │
│  │飞书 │ │CRM │ │项目  │ ← 企业内部系统                       │
│  │API  │ │DB  │ │管理  │                                      │
│  └─────┘ └────┘ └─────┘                                      │
└──────────────────────────────────────────────────────────────┘
```

### 7.2 企业 MCP 部署的关键考量

| 维度 | 方案 |
|------|------|
| 身份认证 | OAuth 2.1 + PKCE，通过 API Gateway 集中管理 |
| 数据隔离 | 每个 MCP Server 独立进程/容器，最小权限原则 |
| 审计日志 | 所有 tools/call 请求记录到集中日志系统 |
| 速率限制 | Gateway 层按用户/应用限流，防止滥用 |
| 高可用 | Streamable HTTP + 负载均衡，支持水平扩展 |
| 密钥管理 | 避免环境变量硬编码，使用 Vault 或 K8s Secrets |

### 7.3 典型企业场景

- **LDAP/AD 连接器**：MCP Server 封装企业目录服务，LLM 可查询员工信息、部门结构
- **云平台桥接**：封装 AWS/GCP/Azure 的管理 API，LLM 可查看资源、调整配置
- **内部知识库**：将 Confluence、Notion 等知识库暴露为 Resources，LLM 可按需检索
- **运维自动化**：封装监控系统（Prometheus、Grafana），LLM 可查询指标和告警

---

## 八、安全视角

MCP 协议通过赋予 LLM 数据访问和代码执行能力，带来了重大的安全挑战。2025 年 4 月，安全研究人员发布分析指出 MCP 存在多项安全隐患，包括 prompt 注入和工具投毒导致的数据外泄风险。

### 8.1 权限模型

MCP 规范明确要求：

1. **用户知情同意（User Consent）**：Host 在调用任何 Tool 之前必须获得用户的明确同意。用户必须理解数据访问和操作的内容。
2. **数据隐私**：Host 在将用户数据暴露给 Server 之前必须获得用户同意。不得未经同意将资源数据传输到其他地方。
3. **工具安全**：Tool 描述（如 annotations）应被视为不可信数据，除非来自受信任的 Server。

### 8.2 输入验证与沙箱执行

```python
@mcp.tool()
async def execute_sql(sql: str) -> str:
    """执行 SQL 查询（带严格验证）"""
    normalized = sql.strip().upper()
    
    if not normalized.startswith("SELECT"):
        return "Error: Only SELECT queries allowed"
    
    dangerous_keywords = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER"]
    for keyword in dangerous_keywords:
        if keyword in normalized:
            return f"Error: '{keyword}' operation not permitted"
    
    result = await db.execute_in_sandbox(sql)
    return result
```

**沙箱执行**是生产环境的必备措施——MCP Tool 的执行应在隔离的容器或沙箱中运行，限制其文件系统访问、网络访问和系统调用权限。

### 8.3 审计日志与信任边界

```
┌──────────────────────────────────────────────────────────────┐
│                    MCP 安全架构                                │
│                                                              │
│  用户 ──→ Host ──→ Client ──→ Gateway ──→ Server ──→ 数据源   │
│                     │            │            │               │
│                     ▼            ▼            ▼               │
│               ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│               │ 权限检查  │ │ 审计日志  │ │ 沙箱执行  │        │
│               │ 用户同意  │ │ 速率限制  │ │ 输出过滤  │        │
│               └──────────┘ └──────────┘ └──────────┘        │
│                                                              │
│  信任边界:                                                    │
│  ┌─── Host 信任域 ───┐  ┌─── Server 信任域 ───┐              │
│  │  用户身份           │  │  工具执行环境         │              │
│  │  敏感数据           │  │  外部 API 调用        │              │
│  │  推理上下文         │  │  文件系统操作         │              │
│  └────────────────────┘  └────────────────────┘              │
└──────────────────────────────────────────────────────────────┘
```

核心安全原则：
- **最小权限**：每个 MCP Server 只应获得完成其功能所需的最小权限
- **深度防御**：在 Host、Gateway、Server 多层实施安全控制
- **不可信输入假设**：Server 的 Tool 描述、Resource 内容都可能被恶意利用
- **集中审计**：所有工具调用应通过可审计的网关层

---

## 九、延伸阅读

1. **MCP 官方规范**：[modelcontextprotocol.io/specification](https://modelcontextprotocol.io/specification/2025-11-25) — 当前稳定版本 2025-11-25，包含完整的协议定义
2. **MCP 官方仓库**：[github.com/modelcontextprotocol](https://github.com/modelcontextprotocol/modelcontextprotocol) — 规范文档、TypeScript Schema 和社区贡献指南
3. **MCP Servers 仓库**：[github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) — 官方参考实现集合（72k+ star）
4. **FastMCP 文档**：[gofastmcp.com](https://gofastmcp.com/) — Python MCP Server 开发的标准框架
5. **MCP Python SDK**：[github.com/modelcontextprotocol/python-sdk](https://github.com/modelcontextprotocol/python-sdk) — 官方 Python SDK，内含 FastMCP
6. **MCP Server 生态追踪**：[mcp.so](https://mcp.so/) — 17,000+ MCP Server 的社区发现平台
7. **Agentic AI Foundation**：MCP 的治理已移交至 Linux 基金会旗下的 AAIF，由 Anthropic、Block、OpenAI 共同创立
8. **MCP 协议演进**：2025-11-25 版本引入 OAuth 2.1 强制认证、Tasks 异步任务、Elicitation 等企业级特性；2026-07-28 RC 版本进一步引入无状态协议核心和 Extensions 框架

---

MCP 从 2024 年 11 月发布至今，已经从一个实验性协议成长为 AI 应用集成的事实标准。它解决了 LLM 与外部工具连接的根本性问题——通过标准化协议将 N×M 的集成矩阵简化为 N+M。随着 Agentic AI Foundation 的成立、OAuth 2.1 认证的强制化、以及无状态协议核心的引入，MCP 正在从"本地开发工具"进化为"企业级分布式 Agent 基础设施"。对于任何构建 AI 应用的团队来说，理解并掌握 MCP 已经不再是可选项——它是 AI 工程化的必经之路。
