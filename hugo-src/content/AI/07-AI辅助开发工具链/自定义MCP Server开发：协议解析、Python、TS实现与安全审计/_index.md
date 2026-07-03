---
title: "自定义 MCP Server 开发：协议解析、Python/TS 实现与安全审计"
weight: 2
tags: [MCP Server, FastMCP, TypeScript, 协议开发, 安全审计]
menu: 
  main: 
    parent: "AI 辅助开发工具链"
---

# 自定义 MCP Server 开发：协议解析、Python/TS 实现与安全审计

MCP（Model Context Protocol）是 Anthropic 于 2024 年 11 月发布的开放协议，旨在为大语言模型提供标准化的外部能力接入方式。如果说 Function Calling 定义了"模型如何请求工具"，那么 MCP 则定义了"工具如何被发现、被调用、被管理"——它是一套完整的客户端-服务器协议规范。截至 2025 年，MCP 已获得 OpenAI、Google、Microsoft 等主流厂商的支持，正在从 Claude 生态协议演变为跨平台的行业标准。

对于有经验的后端开发者而言，MCP Server 的开发并非从零造轮子——Python 社区的 FastMCP 框架和 TypeScript 官方 `@modelcontextprotocol/sdk` 已经提供了成熟的抽象层。但真正有挑战性的问题在于：**如何理解协议的设计哲学、如何选择合适的传输层、如何实现生产级的安全审计机制**。本文从协议规范出发，分别使用 Python 和 TypeScript 实现一个完整的 MCP Server，最后深入讨论安全审计的最佳实践。

---

## 1. MCP 协议深度解析

### 1.1 消息格式：基于 JSON-RPC 2.0

MCP 协议建立在 JSON-RPC 2.0 之上，所有通信都采用三种消息格式：

**Request（请求）**：客户端或服务器发起的带 ID 的调用。

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "scan_vulnerability",
    "arguments": {
      "target": "https://example.com",
      "scan_type": "xss"
    }
  }
}
```

**Response（响应）**：对 Request 的应答，包含 result 或 error。

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "发现 3 个潜在 XSS 漏洞"
      }
    ]
  }
}
```

**Notification（通知）**：单向消息，没有 id 字段，不需要应答。

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/progress",
  "params": {
    "progressToken": "scan-001",
    "progress": 75,
    "total": 100
  }
}
```

### 1.2 能力协商机制

MCP 采用显式的 **Capability Negotiation** 机制。连接建立后，客户端和服务器通过 `initialize` 握手交换各自支持的能力声明：

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP 连接生命周期                           │
│                                                              │
│  Client                                              Server  │
│    │                                                     │     │
│    │──── initialize (clientInfo, capabilities) ────────▶│     │
│    │                                                     │     │
│    │◀─── initialize (serverInfo, capabilities) ─────────│     │
│    │                                                     │     │
│    │──── initialized (notification) ───────────────────▶│     │
│    │                                                     │     │
│    │  ═══════ 连接已建立，开始正常通信 ═══════              │     │
│    │                                                     │     │
│    │──── tools/list (request) ─────────────────────────▶│     │
│    │◀─── tools/list (response) ────────────────────────│     │
│    │                                                     │     │
│    │──── tools/call (request) ─────────────────────────▶│     │
│    │◀─── tools/call (response) ────────────────────────│     │
│    │                                                     │     │
│    │──── resources/list (request) ─────────────────────▶│     │
│    │◀─── resources/list (response) ────────────────────│     │
│    │                                                     │     │
│    │──── prompts/list (request) ───────────────────────▶│     │
│    │◀─── prompts/list (response) ──────────────────────│     │
│    │                                                     │     │
│    │◄════════ 正常运行，双向通信 ════════►                │     │
│    │                                                     │     │
│    │──── shutdown (request) ───────────────────────────▶│     │
│    │◀─── shutdown (response) ──────────────────────────│     │
│    │                                                     │     │
└─────────────────────────────────────────────────────────────┘
```

客户端发送的 capabilities 声明示例：

```json
{
  "capabilities": {
    "roots": {
      "listChanged": true
    },
    "sampling": {}
  }
}
```

服务器返回的 capabilities 声明示例：

```json
{
  "capabilities": {
    "tools": {
      "listChanged": true
    },
    "resources": {
      "subscribe": true,
      "listChanged": true
    },
    "prompts": {
      "listChanged": true
    },
    "logging": {}
  }
}
```

这种设计确保了客户端和服务器只使用双方都支持的特性，避免了隐式假设带来的兼容性问题。

### 1.3 错误处理

MCP 继承了 JSON-RPC 2.0 的错误码体系，并定义了协议级别的标准错误码：

| 错误码 | 含义 | 使用场景 |
|--------|------|----------|
| `-32700` | Parse error | 消息不是合法的 JSON |
| `-32600` | Invalid Request | 消息不符合 JSON-RPC 规范 |
| `-32601` | Method not found | 请求的方法不存在 |
| `-32602` | Invalid params | 参数校验失败 |
| `-32603` | Internal error | 服务器内部未预期的错误 |
| `-32000` 至 `-32099` | 服务器错误（保留范围） | 自定义业务错误 |
| `-32800` | Request timed out | 请求超时 |
| `-32801` | Connection closed | 连接被关闭 |
| `-32802` | Request cancelled | 请求被客户端取消 |

自定义业务错误推荐使用 `-32000` 以上的保留范围：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32001,
    "message": "Permission denied",
    "data": {
      "reason": "Tool 'delete_file' requires elevated privileges",
      "required_permission": "fs:write"
    }
  }
}
```

---

## 2. Python 实现：FastMCP

FastMCP 是 Python 社区中最流行的 MCP Server 框架，提供了声明式的 API 设计，开发者可以用最少的样板代码构建功能完备的 MCP Server。

### 2.1 项目初始化

```bash
mkdir mcp-security-server && cd mcp-security-server
python -m venv .venv && source .venv/bin/activate
pip install fastmcp
```

项目结构：

```
mcp-security-server/
├── src/
│   └── security_server/
│       ├── __init__.py
│       ├── server.py
│       ├── tools.py
│       ├── resources.py
│       └── prompts.py
├── tests/
│   ├── test_tools.py
│   └── test_resources.py
├── pyproject.toml
└── README.md
```

### 2.2 Tool 定义与 @tool 装饰器

FastMCP 的核心是 `FastMCP` 类和 `@mcp.tool()` 装饰器。函数的类型注解自动转换为 JSON Schema，供客户端的 LLM 理解工具能力：

```python
from fastmcp import FastMCP
import re
import socket
from urllib.parse import urlparse

mcp = FastMCP(
    name="security-audit-server",
    version="1.0.0"
)


@mcp.tool()
def validate_url(url: str) -> dict:
    """验证 URL 的合法性并提取域名信息。

    对输入的 URL 进行格式校验、协议检查和域名解析，
    返回结构化的 URL 分析结果。
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return {"valid": False, "error": f"不支持的协议: {parsed.scheme}"}

    try:
        socket.getaddrinfo(parsed.hostname, None)
    except (socket.gaierror, TypeError):
        return {"valid": False, "error": f"无法解析域名: {parsed.hostname}"}

    return {
        "valid": True,
        "scheme": parsed.scheme,
        "hostname": parsed.hostname,
        "port": parsed.port or (443 if parsed.scheme == "https" else 80),
        "path": parsed.path,
    }


@mcp.tool()
def check_open_ports(host: str, ports: list[int]) -> dict:
    """检查目标主机的指定端口开放状态。

    对给定的端口列表进行 TCP 连接测试，返回每个端口的开放状态。
    出于安全考虑，最多同时检查 10 个端口，且单次超时为 2 秒。
    """
    if len(ports) > 10:
        return {"error": "单次最多检查 10 个端口"}
    if not re.match(r"^[a-zA-Z0-9.\-]+$", host):
        return {"error": "主机名包含非法字符"}

    results = {}
    for port in ports:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2)
            result = sock.connect_ex((host, port))
            results[port] = {"open": result == 0}
            sock.close()
        except Exception as e:
            results[port] = {"open": False, "error": str(e)}

    return {"host": host, "results": results}


@mcp.tool()
def generate_security_report(findings: list[dict]) -> dict:
    """根据安全扫描发现生成结构化报告。

    将原始扫描结果按严重程度分类汇总，生成可读的安全审计报告。
    """
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    sorted_findings = sorted(findings, key=lambda f: severity_order.get(f.get("severity", "info"), 4))

    summary = {}
    for finding in sorted_findings:
        sev = finding.get("severity", "info")
        summary[sev] = summary.get(sev, 0) + 1

    return {
        "total": len(sorted_findings),
        "summary": summary,
        "findings": sorted_findings,
        "risk_level": "critical" if summary.get("critical", 0) > 0
        else "high" if summary.get("high", 0) > 0
        else "medium" if summary.get("medium", 0) > 0
        else "low",
    }
```

FastMCP 自动从函数签名和 docstring 中提取工具描述，生成符合 MCP 规范的 `tools/list` 响应。客户端 LLM 读取这些描述后即可理解工具的用途和参数。

### 2.3 Resource 暴露

Resource 是 MCP 中用于暴露数据的原语，与 Tool 的区别在于：Tool 执行操作并返回结果，Resource 提供只读数据供客户端读取：

```python
import json
from datetime import datetime


@mcp.resource("security://audit-log")
def get_audit_log() -> str:
    """返回最近的安全审计日志。"""
    logs = [
        {
            "timestamp": "2025-06-28T10:30:00Z",
            "action": "port_scan",
            "target": "192.168.1.0/24",
            "result": "completed",
            "findings": 5,
        },
        {
            "timestamp": "2025-06-28T11:15:00Z",
            "action": "url_validate",
            "target": "https://example.com",
            "result": "passed",
            "findings": 0,
        },
    ]
    return json.dumps(logs, ensure_ascii=False, indent=2)


@mcp.resource("security://scan-config")
def get_scan_config() -> str:
    """返回当前扫描配置。"""
    config = {
        "max_concurrent_scans": 3,
        "timeout_seconds": 30,
        "allowed_protocols": ["http", "https"],
        "blocked_domains": ["localhost", "127.0.0.1"],
        "severity_threshold": "low",
    }
    return json.dumps(config, ensure_ascii=False, indent=2)
```

### 2.4 Prompt 模板

Prompt 模板定义了可复用的 LLM 交互模式，客户端可以通过 `prompts/list` 发现这些模板，然后用 `prompts/get` 获取渲染后的 Prompt：

```python
@mcp.prompt()
def security_audit_prompt(target_url: str, scan_depth: str = "standard") -> str:
    """生成安全审计的系统提示词。

    Args:
        target_url: 要审计的目标 URL
        scan_depth: 扫描深度 (quick/standard/deep)
    """
    return f"""你是一个专业的安全审计专家。请对以下目标进行全面的安全审计：

目标 URL：{target_url}
扫描深度：{scan_depth}

请按照以下步骤执行审计：
1. 使用 validate_url 工具验证目标 URL 的合法性
2. 使用 check_open_ports 工具检查目标主机的开放端口
3. 分析所有发现并使用 generate_security_report 生成报告

注意事项：
- 仅在获得授权的目标上执行扫描
- 不要尝试实际利用发现的漏洞
- 所有操作都会被记录到审计日志中"""


@mcp.prompt()
def vulnerability_triage_prompt(vulnerability_description: str) -> str:
    """生成漏洞分级的提示词。"""
    return f"""请对以下漏洞描述进行分级评估：

{vulnerability_description}

请从以下维度进行评估：
1. CVSS 评分估算
2. 可利用性（是否需要认证、是否有公开 PoC）
3. 影响范围（机密性、完整性、可用性）
4. 修复优先级建议
5. 临时缓解措施"""
```

### 2.5 错误处理与运行

FastMCP 中通过抛出 `ToolError` 来向客户端返回结构化的错误信息：

```python
from fastmcp.exceptions import ToolError


@mcp.tool()
def execute_scan(target: str, scan_type: str = "full") -> dict:
    """在沙箱环境中执行安全扫描。"""
    blocked = ["localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254"]
    hostname = urlparse(target).hostname or target

    if hostname in blocked:
        raise ToolError(f"目标 {hostname} 在禁止扫描名单中")

    if scan_type not in ("quick", "standard", "full"):
        raise ToolError(f"不支持的扫描类型: {scan_type}，可选: quick/standard/full")

    return {"target": target, "scan_type": scan_type, "status": "completed"}


if __name__ == "__main__":
    mcp.run()
```

运行后 FastMCP 默认使用 stdio 传输层，等待客户端连接。也可以通过命令行指定传输方式：

```bash
# stdio 模式（默认，适用于 Claude Desktop 等本地客户端）
python -m security_server.server

# SSE 模式（适用于远程访问）
fastmcp run server.py --transport sse --port 8080
```

---

## 3. TypeScript 实现：MCP SDK

TypeScript 官方 `@modelcontextprotocol/sdk` 提供了类型安全的 MCP 开发体验，适合需要严格类型检查和 Node.js 生态集成的场景。

### 3.1 项目初始化

```bash
mkdir mcp-typescript-server && cd mcp-typescript-server
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node
```

`tsconfig.json` 关键配置：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

### 3.2 Tool / Resource / Prompt 定义

MCP SDK 使用 `McpServer` 类注册能力，通过 `zod` 进行运行时参数校验：

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "code-analysis-server",
  version: "1.0.0",
});

server.tool(
  "analyze_complexity",
  "分析指定代码文件的圈复杂度和可维护性指标",
  {
    file_path: z.string().describe("要分析的文件路径"),
    language: z.enum(["python", "typescript", "java", "go"]).describe("编程语言"),
  },
  async ({ file_path, language }) => {
    if (!file_path.match(/^[a-zA-Z0-9_\-\/\.]+$/)) {
      return {
        content: [{ type: "text", text: `错误：文件路径包含非法字符` }],
        isError: true,
      };
    }

    const metrics = {
      file_path,
      language,
      lines_of_code: 0,
      cyclomatic_complexity: 0,
      maintainability_index: 0,
      duplicated_lines_ratio: 0,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(metrics, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "check_dependencies",
  "扫描项目依赖的已知安全漏洞",
  {
    manifest_path: z.string().describe("依赖清单文件路径 (package.json / requirements.txt)"),
    severity_threshold: z
      .enum(["critical", "high", "medium", "low"])
      .optional()
      .describe("最低报告的漏洞严重级别"),
  },
  async ({ manifest_path, severity_threshold = "medium" }) => {
    const severityLevels = ["critical", "high", "medium", "low", "info"];
    const minLevel = severityLevels.indexOf(severity_threshold);

    const vulnerabilities = [
      {
        package: "lodash",
        version: "4.17.20",
        severity: "high",
        advisory: "Prototype Pollution",
        fixed_in: "4.17.21",
      },
      {
        package: "express",
        version: "4.18.0",
        severity: "medium",
        advisory: "Open Redirect",
        fixed_in: "4.18.2",
      },
    ];

    const filtered = vulnerabilities.filter(
      (v) => severityLevels.indexOf(v.severity) <= minLevel
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { manifest: manifest_path, total: filtered.length, vulnerabilities: filtered },
            null,
            2
          ),
        },
      ],
    };
  }
);
```

### 3.3 Resource 与 Prompt 注册

```typescript
server.resource(
  "analysis-history",
  "code-analysis://history",
  { mimeType: "application/json" },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            analyses: [
              { timestamp: "2025-06-28T09:00:00Z", file: "src/main.py", complexity: 12 },
              { timestamp: "2025-06-28T10:30:00Z", file: "src/utils.ts", complexity: 5 },
            ],
          },
          null,
          2
        ),
      },
    ],
  })
);

server.prompt(
  "code_review",
  "生成代码审查的结构化提示",
  {
    file_path: z.string().describe("要审查的文件路径"),
    focus: z
      .enum(["security", "performance", "readability", "all"])
      .optional()
      .describe("审查重点"),
  },
  ({ file_path, focus = "all" }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `请对文件 ${file_path} 进行${focus === "all" ? "全面" : focus}代码审查。

审查要点：
1. 代码质量和可读性
2. 潜在的安全风险
3. 性能瓶颈
4. 错误处理的完备性
5. 最佳实践的遵循情况

请以结构化格式输出审查结果。`,
        },
      },
    ],
  })
);
```

### 3.4 启动服务

```typescript
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Code Analysis MCP Server 已启动 (stdio)");
}

main().catch((error) => {
  console.error("启动失败:", error);
  process.exit(1);
});
```

TypeScript SDK 的类型系统在编译阶段即可捕获参数定义不匹配、返回值格式错误等问题。`zod` 的运行时校验则作为第二道防线，确保客户端发送的参数在业务逻辑执行前就完成合法性验证。

---

## 4. 传输层选择

MCP 协议的传输层是协议与底层通信之间的抽象层，不同的传输方式适用于不同的部署场景。

### 4.1 stdio：本地开发的标准选择

stdio 通过标准输入/输出进行消息传递，是最简单的传输方式。客户端启动 MCP Server 作为子进程，通过管道双向通信：

```json
{
  "mcpServers": {
    "security-audit": {
      "command": "python",
      "args": ["-m", "security_server.server"],
      "env": {
        "SECURITY_API_KEY": "sk-xxx"
      }
    }
  }
}
```

stdio 的优势在于零网络配置、天然的进程隔离、以及与 Claude Desktop / Cursor 等客户端的原生兼容。缺点是只能在本地运行，不支持多客户端并发。

### 4.2 SSE：远程访问的轻量方案

Server-Sent Events（SSE）允许通过 HTTP 实现远程 MCP Server，适合团队共享或内网部署：

```python
# FastMCP SSE 传输
mcp = FastMCP("remote-security-server")
# ... 注册 tools, resources, prompts ...

if __name__ == "__main__":
    mcp.run(transport="sse", host="0.0.0.0", port=8080)
```

TypeScript 中通过 SSE transport 实现：

```typescript
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";

const app = express();
const transports: Map<string, SSEServerTransport> = new Map();

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports.set(transport.sessionId, transport);
  await server.connect(transport);
});

app.post("/messages", express.json(), async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(404).json({ error: "Session not found" });
  }
});

app.listen(8080, () => {
  console.log("SSE MCP Server listening on :8080");
});
```

客户端配置：

```json
{
  "mcpServers": {
    "remote-server": {
      "url": "http://your-server:8080/sse"
    }
  }
}
```

### 4.3 Streamable HTTP：生产级传输方案

Streamable HTTP 是 MCP 规范在 2025 年推出的最新传输方式，解决了 SSE 方案的一些局限性（如单向流、无状态管理）。它支持双向通信、会话持久化和负载均衡：

```python
mcp = FastMCP("production-server")
# ... 注册能力 ...

if __name__ == "__main__":
    mcp.run(
        transport="streamable-http",
        host="0.0.0.0",
        port=8080,
        path="/mcp",
    )
```

Streamable HTTP 的关键特性包括：

| 特性 | SSE | Streamable HTTP |
|------|-----|-----------------|
| 通信方向 | 服务端→客户端（单向流） | 双向（HTTP + 流式响应） |
| 会话管理 | 基于连接（有状态） | 基于 Header（可跨连接） |
| 负载均衡 | 困难（需粘性会话） | 友好（无状态） |
| 传输安全 | 依赖应用层 | 原生支持 TLS |
| 超时处理 | 连接超时风险 | 请求级别超时 |

---

## 5. 测试与调试

### 5.1 MCP Inspector

MCP Inspector 是 Anthropic 提供的官方调试工具，提供可视化的交互界面来测试 MCP Server：

```bash
# 安装并启动 Inspector
npx @modelcontextprotocol/inspector python -m security_server.server
```

Inspector 提供以下调试能力：
- 查看服务器声明的能力和元信息
- 浏览所有注册的 Tools / Resources / Prompts
- 手动调用工具并查看完整请求/响应
- 实时监控 SSE 事件流
- 查看 JSON-RPC 消息的原始格式

### 5.2 日志策略

生产级 MCP Server 需要实现分级日志系统。Python 中使用标准库 `logging`：

```python
import logging
import sys
from datetime import datetime

logger = logging.getLogger("mcp-security-server")


class MCPFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        timestamp = datetime.now().isoformat()
        return f"[{timestamp}] [{record.levelname}] [{record.name}] {record.getMessage()}"


def setup_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(MCPFormatter())
    logger.addHandler(handler)
    logger.setLevel(getattr(logging, level.upper()))

    mcp_logger = logging.getLogger("mcp")
    mcp_logger.addHandler(handler)
    mcp_logger.setLevel(logging.DEBUG)
```

注意日志输出必须写入 stderr 而非 stdout——因为 stdio 传输层使用 stdout 作为消息通道，混入日志会导致协议解析错误。

### 5.3 单元测试

Python 中使用 `pytest` 对工具函数进行单元测试：

```python
import pytest
from security_server.tools import validate_url, check_open_ports


def test_validate_url_valid():
    result = validate_url("https://example.com")
    assert result["valid"] is True
    assert result["hostname"] == "example.com"
    assert result["scheme"] == "https"


def test_validate_url_invalid_scheme():
    result = validate_url("ftp://example.com")
    assert result["valid"] is False
    assert "不支持的协议" in result["error"]


def test_validate_url_invalid_hostname():
    result = validate_url("https://this-host-does-not-exist-12345.xyz")
    assert result["valid"] is False


def test_check_open_ports_limit():
    result = check_open_ports("example.com", list(range(20)))
    assert "error" in result
    assert "最多检查 10 个" in result["error"]


def test_check_open_ports_invalid_host():
    result = check_open_ports("invalid host!", [80])
    assert "error" in result
```

TypeScript 中使用 `vitest`：

```typescript
import { describe, it, expect } from "vitest";

describe("check_dependencies", () => {
  it("should filter vulnerabilities by severity", async () => {
    const result = await callTool("check_dependencies", {
      manifest_path: "package.json",
      severity_threshold: "high",
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.vulnerabilities.every((v: any) =>
      ["critical", "high"].includes(v.severity)
    )).toBe(true);
  });
});
```

### 5.4 集成测试

与 Claude Desktop 集成测试需要在配置文件中添加开发服务器地址，并使用 `fastmcp dev` 启动热重载模式：

```bash
fastmcp dev server.py
```

该命令会自动启动 MCP Inspector 并注册服务器，允许在 IDE 中修改代码后自动重载并立即验证。

---

## 6. 生产部署

### 6.1 进程管理

**systemd 服务配置**：

```ini
[Unit]
Description=MCP Security Audit Server
After=network.target

[Service]
Type=simple
User=mcp-server
WorkingDirectory=/opt/mcp-security-server
ExecStart=/opt/mcp-security-server/.venv/bin/python -m security_server.server
Restart=always
RestartSec=5
Environment=SECURITY_API_KEY_FILE=/run/secrets/security_api_key
StandardError=journal
StandardOutput=null

[Install]
WantedBy=multi-user.target
```

**Docker 部署**：

```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

FROM python:3.12-slim
RUN groupadd -r mcp && useradd -r -g mcp mcp-server
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY src/ ./src/
USER mcp-server
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import http.client; c=http.client.HTTPConnection('localhost',8080); c.request('GET','/health'); r=c.getresponse(); exit(0 if r.status==200 else 1)"
CMD ["python", "-m", "security_server.server", "--transport", "streamable-http", "--port", "8080"]
```

### 6.2 版本管理

MCP Server 的版本管理应当遵循语义化版本规范。服务器通过 `initialize` 响应中的 `serverInfo.version` 字段向客户端暴露版本号，客户端可以据此实现兼容性检查。

建议在 `pyproject.toml` 和 `package.json` 中维护版本号，并通过 CI/CD 流水线自动同步：

```python
from importlib.metadata import version

mcp = FastMCP(
    name="security-audit-server",
    version=version("security-audit-server"),
)
```

### 6.3 健康检查与监控

为 Streamable HTTP 传输层添加健康检查端点和 Prometheus 指标：

```python
import time
from prometheus_client import Counter, Histogram, start_http_server

TOOL_CALL_COUNT = Counter("mcp_tool_calls_total", "工具调用次数", ["tool_name", "status"])
TOOL_CALL_DURATION = Histogram("mcp_tool_call_duration_seconds", "工具调用耗时", ["tool_name"])

start_http_server(9090)
```

---

## 7. 安全审计

MCP Server 作为连接 LLM 和外部系统的桥梁，其安全性至关重要。一个存在漏洞的 MCP Server 可能导致远程代码执行、数据泄露或权限提升。

### 7.1 输入验证模式

对所有来自客户端的输入进行严格的白名单验证：

```python
import re
from typing import Any

SANITIZE_PATTERNS = {
    "hostname": re.compile(r"^[a-zA-Z0-9.\-]+$"),
    "file_path": re.compile(r"^[a-zA-Z0-9_\-/\.]+$"),
    "identifier": re.compile(r"^[a-zA-Z0-9_]+$"),
}


def validate_input(value: Any, input_type: str) -> bool:
    pattern = SANITIZE_PATTERNS.get(input_type)
    if pattern is None:
        return False
    if not isinstance(value, str):
        return False
    if len(value) > 1024:
        return False
    return bool(pattern.match(value))


BLOCKED_TARGETS = {"localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254", "metadata.google.internal"}


def is_target_allowed(hostname: str) -> bool:
    if hostname in BLOCKED_TARGETS:
        return False
    if re.match(r"^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)", hostname):
        return False
    return True
```

### 7.2 权限模型

实现基于角色的访问控制（RBAC），对不同级别的操作施加不同的权限约束：

```python
from enum import Enum
from functools import wraps


class Permission(Enum):
    READ = "read"
    SCAN = "scan"
    ADMIN = "admin"


ROLE_PERMISSIONS = {
    "viewer": [Permission.READ],
    "scanner": [Permission.READ, Permission.SCAN],
    "admin": [Permission.READ, Permission.SCAN, Permission.ADMIN],
}


class PermissionError(Exception):
    def __init__(self, required: Permission, current_role: str):
        self.required = required
        self.current_role = current_role
        super().__init__(
            f"权限不足：需要 {required.value} 权限，当前角色 {current_role} 无此权限"
        )


def require_permission(permission: Permission):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, current_role: str = "viewer", **kwargs):
            if permission not in ROLE_PERMISSIONS.get(current_role, []):
                raise PermissionError(permission, current_role)
            return await func(*args, current_role=current_role, **kwargs)
        return wrapper
    return decorator
```

### 7.3 审计日志

所有操作必须记录不可篡改的审计日志，包含操作者、操作类型、目标、时间和结果：

```python
import logging
import uuid
from datetime import datetime, timezone

audit_logger = logging.getLogger("audit")
audit_handler = logging.FileHandler("/var/log/mcp/audit.jsonl")
audit_logger.addHandler(audit_handler)
audit_logger.setLevel(logging.INFO)


def log_operation(
    action: str,
    target: str,
    user_id: str,
    role: str,
    result: str,
    details: dict | None = None,
) -> None:
    entry = {
        "trace_id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "target": target,
        "user_id": user_id,
        "role": role,
        "result": result,
        "details": details or {},
    }
    audit_logger.info(json.dumps(entry, ensure_ascii=False))
```

### 7.4 沙箱执行

对于需要执行外部命令的工具，必须在沙箱环境中运行：

```python
import subprocess


def run_in_sandbox(
    command: list[str],
    timeout: int = 30,
    max_output_size: int = 1024 * 1024,
) -> dict:
    allowed_commands = {"nmap", "nikto", "curl"}
    if command[0] not in allowed_commands:
        return {"error": f"命令 {command[0]} 不在沙箱白名单中"}

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout,
            env={"PATH": "/usr/local/bin:/usr/bin", "HOME": "/tmp"},
            cwd="/tmp",
        )
        return {
            "stdout": result.stdout[:max_output_size],
            "stderr": result.stderr[:max_output_size],
            "returncode": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"error": f"命令执行超时（{timeout}s）"}
```

### 7.5 速率限制

实现基于滑动窗口的速率限制器，防止恶意客户端耗尽服务器资源：

```python
import time
from collections import defaultdict


class RateLimiter:
    def __init__(self, max_calls: int = 60, window_seconds: int = 60):
        self.max_calls = max_calls
        self.window = window_seconds
        self.calls: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, client_id: str) -> bool:
        now = time.time()
        cutoff = now - self.window
        self.calls[client_id] = [t for t in self.calls[client_id] if t > cutoff]
        if len(self.calls[client_id]) >= self.max_calls:
            return False
        self.calls[client_id].append(now)
        return True

    def remaining(self, client_id: str) -> int:
        now = time.time()
        cutoff = now - self.window
        recent = [t for t in self.calls[client_id] if t > cutoff]
        return max(0, self.max_calls - len(recent))


rate_limiter = RateLimiter(max_calls=30, window_seconds=60)


@mcp.tool()
def rate_limited_tool(target: str) -> dict:
    client_id = "default"
    if not rate_limiter.is_allowed(client_id):
        remaining_wait = rate_limiter.window
        return {
            "error": f"速率限制：请在 {remaining_wait} 秒后重试",
            "retry_after_seconds": remaining_wait,
        }
    return validate_url(target)
```

---

## 8. 延伸阅读

- **MCP 官方规范**：[https://spec.modelcontextprotocol.io](https://spec.modelcontextprotocol.io) — 协议的权威定义，包含完整的消息格式、能力协商流程和传输层规范。
- **FastMCP 文档**：[https://gofastmcp.com](https://gofastmcp.com) — Python MCP Server 框架的官方文档，包含 API 参考和最佳实践指南。
- **TypeScript MCP SDK**：[https://github.com/modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) — 官方 TypeScript SDK 仓库，含示例代码和 API 文档。
- **MCP Servers 仓库**：[https://github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) — 官方维护的 MCP Server 实现合集，可作为开发参考。
- **MCP Inspector**：[https://github.com/modelcontextprotocol/inspector](https://github.com/modelcontextprotocol/inspector) — 官方调试工具，用于可视化测试 MCP Server 的所有能力。
- **Anthropic MCP 博客**：[https://www.anthropic.com/news/mcp](https://www.anthropic.com/news/mcp) — MCP 协议的发布公告和设计背景介绍。
- **OWASP LLM Top 10**：[https://owasp.org/www-project-top-10-for-large-language-model-applications/](https://owasp.org/www-project-top-10-for-large-language-model-applications/) — LLM 应用安全风险清单，对 MCP Server 的安全设计具有直接参考价值。
