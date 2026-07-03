---
title: "AI Agent 安全设计：权限模型、沙箱隔离与审计日志"
weight: 2
tags: [Agent安全, 权限模型, 沙箱, 审计日志, 安全架构]
menu: 
  main: 
    parent: "安全与 AI 融合"
---

## 从被动防御到主动安全架构

AI Agent 正在从"回答问题"的对话助手演进为"执行任务"的自主代理。当 Agent 被赋予文件读写、API 调用、数据库查询、代码执行等工具能力后，它就从一个封闭的文本生成器变成了一个具有真实世界影响力的**行动者**。这一转变带来的安全挑战是根本性的：传统软件系统中，代码是确定性的、行为是可预测的；而 Agent 的核心决策引擎——大语言模型——本质上是非确定性的，其行为边界由 Prompt、上下文和模型权重共同决定，难以用静态规则穷举。

本文系统性地拆解 AI Agent 安全设计的核心领域：从权限模型的精细控制到多层沙箱隔离，从审计日志的结构化设计到动态安全策略引擎。目标是为构建**生产级安全的 Agent 系统**提供可落地的架构参考。

---

## 1. Agent 安全风险全景

在设计安全机制之前，必须先理解 Agent 面临的威胁全景。与传统软件不同，Agent 的安全风险具有**跨域传导**的特征——一个看似无害的工具调用，经过模型推理链的串联，可能引发级联安全事件。

### 1.1 六大核心威胁

**工具滥用（Tool Abuse）**：Agent 拥有执行工具的能力，但模型可能在非预期场景下调用高权限工具。例如，一个被授权查询数据库的 Agent，在用户无意间通过巧妙的 Prompt 构造执行了 `DROP TABLE` 操作。工具滥用的根源在于：模型对工具的"可接受使用范围"缺乏精确理解。

**数据泄露（Data Leakage）**：Agent 在处理用户请求时，可能将敏感数据泄露到不安全的渠道。典型场景包括：将包含 PII 的上下文传递给第三方 API、在错误日志中记录完整的请求/响应内容、通过 RAG 检索结果无意间将 A 用户的数据展示给 B 用户。

**权限提升（Privilege Escalation）**：Agent 系统中存在多层次的权限边界——模型层、工具层、数据层、用户层。攻击者可以通过精心构造的输入，诱导 Agent 跨越这些边界。例如，通过间接 Prompt 注入让 Agent 以管理员权限执行操作，或利用工具链的组合效应绕过单个工具的权限限制。

**无限循环（Infinite Loop）**：Agent 的 ReAct（推理-行动-观察）循环在某些条件下会陷入死循环。当模型持续判定需要调用工具但始终无法获得满意的结果时，或者两个 Agent 之间形成循环调用时，系统会消耗大量计算资源并可能产生不可预期的行为。

**工具链注入（Tool-mediated Prompt Injection）**：这是 Prompt 注入的高级形态——攻击者不是直接对模型注入恶意指令，而是通过工具的返回结果间接注入。例如，在数据库中存储包含恶意指令的文本，当 Agent 查询并处理这些数据时，恶意指令被注入到推理上下文中。

**工具生态供应链攻击（Supply Chain Attack on Tool Ecosystem）**：随着 MCP（Model Context Protocol）等工具生态的发展，第三方工具包和 MCP Server 成为新的攻击面。恶意工具可能伪装成合法工具，窃取上下文数据或执行未授权操作。

### 1.2 威胁模型矩阵

| 威胁类型 | 攻击入口 | 影响范围 | 检测难度 | 典型案例 |
|---------|---------|---------|---------|---------|
| 工具滥用 | 用户输入 / Prompt 注入 | 直接危害 | 中等 | Agent 执行了非预期的 DELETE 操作 |
| 数据泄露 | 工具返回值 / RAG 检索 | 数据安全 | 较难 | 将用户隐私数据发送到外部 API |
| 权限提升 | 间接注入 / 工具组合 | 系统级 | 困难 | 普通用户通过 Agent 获取管理员权限 |
| 无限循环 | 模型推理逻辑 | 可用性 | 容易 | Agent 陷入递归调用，耗尽 Token |
| 工具链注入 | 工具返回数据 | 全链路 | 困难 | 数据库存储的恶意文本劫持 Agent 行为 |
| 供应链攻击 | 第三方工具包 | 系统级 | 困难 | 恶意 MCP Server 窃取上下文数据 |

---

## 2. 权限模型设计

权限控制是 Agent 安全的第一道防线。核心原则是**最小权限（Least Privilege）**——Agent 在任何时刻都只应拥有完成当前任务所需的最小权限集合，不多也不少。

### 2.1 RBAC 与 ABAC 的选型

传统 RBAC（基于角色的访问控制）适合工具种类较少、权限结构固定的场景。每个 Agent 被分配一个或多个角色（如 `reader`、`writer`、`admin`），每个角色关联一组允许的工具集。

但对于复杂的企业场景，RBAC 的粒度往往不够。ABAC（基于属性的访问控制）通过**属性+策略**的组合实现更灵活的控制：权限不仅取决于角色，还取决于请求的上下文属性（如时间、数据敏感度、操作类型、当前风险等级等）。

| 维度 | RBAC | ABAC |
|-----|------|------|
| 权限粒度 | 粗粒度（角色级别） | 细粒度（属性组合） |
| 动态调整 | 需要重新分配角色 | 策略实时生效 |
| 实现复杂度 | 低 | 高 |
| 适用场景 | 工具少、权限简单 | 企业级、多维度控制 |
| 审计友好性 | 高 | 中等 |

在实践中，推荐 **RBAC + ABAC 混合模型**：用 RBAC 定义基础工具集，用 ABAC 在运行时进行细粒度裁剪。

### 2.2 权限模型实现

以下是基于 Python 的 Agent 权限控制核心实现：

```python
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable


class RiskLevel(Enum):
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4


@dataclass
class ToolPermission:
    tool_name: str
    allowed_scopes: list[str] = field(default_factory=list)
    max_risk_level: RiskLevel = RiskLevel.MEDIUM
    rate_limit_per_minute: int = 60
    requires_confirmation: bool = False


@dataclass
class AgentRole:
    name: str
    permissions: list[ToolPermission] = field(default_factory=list)
    max_concurrent_tools: int = 5
    data_access_level: int = 0


class PermissionEngine:
    def __init__(self):
        self.roles: dict[str, AgentRole] = {}
        self.abac_policies: list[Callable] = []

    def register_role(self, role: AgentRole):
        self.roles[role.name] = role

    def add_abac_policy(self, policy_fn: Callable):
        self.abac_policies.append(policy_fn)

    def check_permission(
        self,
        agent_role: str,
        tool_name: str,
        context: dict,
    ) -> tuple[bool, str]:
        role = self.roles.get(agent_role)
        if not role:
            return False, f"未知角色: {agent_role}"

        tool_perm = next(
            (p for p in role.permissions if p.tool_name == tool_name), None
        )
        if not tool_perm:
            return False, f"角色 {agent_role} 无权访问工具 {tool_name}"

        current_risk = context.get("risk_level", RiskLevel.LOW)
        if current_risk.value > tool_perm.max_risk_level.value:
            return False, f"当前风险等级 {current_risk.name} 超出工具允许上限"

        for policy_fn in self.abac_policies:
            allowed, reason = policy_fn(role, tool_perm, context)
            if not allowed:
                return False, reason

        return True, "权限检查通过"
```

### 2.3 动态权限调整

Agent 的权限不应该是静态的。当系统检测到异常行为时（如短时间内大量调用写操作），应该自动收紧权限：

```python
class DynamicPermissionAdjuster:
    def __init__(self, perm_engine: PermissionEngine):
        self.engine = perm_engine
        self.anomaly_counters: dict[str, int] = {}

    def record_tool_call(self, agent_id: str, tool_name: str):
        key = f"{agent_id}:{tool_name}"
        self.anomaly_counters[key] = self.anomaly_counters.get(key, 0) + 1

    def adjust_risk_level(self, agent_id: str, context: dict) -> RiskLevel:
        base_risk = context.get("base_risk", RiskLevel.LOW)

        write_call_count = sum(
            count for key, count in self.anomaly_counters.items()
            if key.startswith(agent_id) and ":write_" in key
        )
        if write_call_count > 20:
            return RiskLevel.CRITICAL
        if write_call_count > 10:
            return RiskLevel.HIGH
        if write_call_count > 5:
            return RiskLevel.MEDIUM

        return base_risk
```

这种动态调整机制使得 Agent 在正常工作时拥有充分的权限，但在检测到异常行为模式时自动降级，防止权限滥用的级联效应。

---

## 3. 代码执行沙箱

当 Agent 需要执行代码（如数据分析、文件处理、自动化脚本）时，沙箱隔离是最关键的安全机制。不同沙箱方案在安全性、性能和部署复杂度之间存在显著差异。

### 3.1 方案对比

| 沙箱方案 | 隔离级别 | 启动时间 | 内存开销 | 安全保证 | 适用场景 |
|---------|---------|---------|---------|---------|---------|
| Docker 容器 | 进程级（Namespace + Cgroups） | ~1s | ~50MB | 内核共享，逃逸风险存在 | 开发/测试环境 |
| gVisor (runsc) | 内核级（用户态内核） | ~0.5s | ~30MB | 独立内核 syscall 代理 | 安全要求较高的生产环境 |
| Firecracker microVM | 虚拟机级（KVM 硬件隔离） | ~0.125s | ~5MB（最小配置） | 硬件级隔离，攻击面极小 | 多租户 SaaS / 金融级 |
| E2B Cloud Sandbox | 云端隔离（Firecracker + 编排） | ~0.5s | 按需分配 | 云端管理，无需自运维 | 快速集成，不想自建 |

### 3.2 Firecracker 沙箱集成示例

Firecracker 是 AWS 开源的 microVM 技术，为 AWS Lambda 和 Fargate 提供底层隔离。它通过精简虚拟机配置（去除 BIOS、USB 控制器等不必要的组件）将攻击面降到最小：

```python
import subprocess
import json
from pathlib import Path


class CodeSandbox:
    def __init__(self, sandbox_type: str = "docker"):
        self.sandbox_type = sandbox_type

    def execute(
        self,
        code: str,
        language: str = "python",
        timeout_seconds: int = 30,
        memory_limit_mb: int = 256,
    ) -> dict:
        if self.sandbox_type == "docker":
            return self._execute_docker(code, language, timeout_seconds, memory_limit_mb)
        elif self.sandbox_type == "e2b":
            return self._execute_e2b(code, language, timeout_seconds)
        else:
            raise ValueError(f"不支持的沙箱类型: {self.sandbox_type}")

    def _execute_docker(
        self, code: str, language: str, timeout: int, mem_limit: int
    ) -> dict:
        image_map = {
            "python": "python:3.12-slim",
            "javascript": "node:20-slim",
        }
        image = image_map.get(language, image_map["python"])

        code_file = Path("/tmp/sandbox_input.py")
        code_file.write_text(code)

        cmd = [
            "docker", "run", "--rm",
            "--network=none",
            "--read-only",
            f"--memory={mem_limit}m",
            f"--cpus=0.5",
            "--pids-limit=64",
            "--cap-drop=ALL",
            "-v", f"{code_file}:/code/input.py:ro",
            image,
            "python", "/code/input.py",
        ]

        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout
        )
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.returncode,
        }

    def _execute_e2b(self, code: str, language: str, timeout: int) -> dict:
        from e2b_code_interpreter import Sandbox

        sandbox = Sandbox()
        try:
            execution = sandbox.run_code(code)
            return {
                "stdout": execution.text or "",
                "stderr": execution.error or "",
                "exit_code": 0 if not execution.error else 1,
            }
        finally:
            sandbox.kill()
```

### 3.3 沙箱安全配置要点

无论选择哪种沙箱方案，以下配置是**必须的**：

- **网络隔离**：容器默认禁止外部网络访问，仅允许通过白名单代理访问特定 API 端点
- **文件系统只读**：工作目录以外的文件系统全部挂载为只读
- **资源限制**：CPU、内存、进程数、文件描述符数的硬性上限
- **能力剥夺**：删除所有 Linux capabilities（`--cap-drop=ALL`），仅在必要时加回
- **超时强制终止**：所有代码执行必须有硬性超时限制，超时后强制 kill

---

## 4. 工具调用沙箱

Agent 调用外部工具时，输入和输出都可能成为安全风险的载体。工具调用沙箱的目标是：在工具执行前验证输入、执行中限制范围、执行后过滤输出。

### 4.1 输入验证

输入验证需要结合 JSON Schema 声明式校验和自定义业务逻辑校验：

```python
import json
import jsonschema
import re
from typing import Any


class ToolInputValidator:
    def __init__(self):
        self.schemas: dict[str, dict] = {}
        self.custom_validators: dict[str, callable] = {}

    def register_schema(self, tool_name: str, schema: dict):
        self.schemas[tool_name] = schema

    def register_validator(self, tool_name: str, validator_fn: callable):
        self.custom_validators[tool_name] = validator_fn

    def validate(self, tool_name: str, arguments: dict) -> tuple[bool, str]:
        schema = self.schemas.get(tool_name)
        if schema:
            try:
                jsonschema.validate(arguments, schema)
            except jsonschema.ValidationError as e:
                return False, f"参数校验失败: {e.message}"

        custom_fn = self.custom_validators.get(tool_name)
        if custom_fn:
            ok, reason = custom_fn(arguments)
            if not ok:
                return False, reason

        return True, "验证通过"


def sql_validator(args: dict) -> tuple[bool, str]:
    if "query" in args:
        query = args["query"].upper()
        dangerous_keywords = ["DROP", "TRUNCATE", "DELETE", "ALTER", "INSERT", "UPDATE"]
        for kw in dangerous_keywords:
            if kw in query:
                return False, f"禁止执行包含 {kw} 的 SQL 语句"
    return True, ""


def filesystem_validator(args: dict) -> tuple[bool, str]:
    allowed_base = "/workspace/data"
    if "path" in args:
        target = str(Path(args["path"]).resolve())
        if not target.startswith(allowed_base):
            return False, f"路径 {target} 超出允许范围 {allowed_base}"
    return True, ""


validator = ToolInputValidator()
validator.register_validator("sql_query", sql_validator)
validator.register_validator("read_file", filesystem_validator)
```

### 4.2 输出过滤

工具的返回值可能包含敏感信息，需要在返回给模型之前进行过滤：

```python
import re


class OutputFilter:
    PATTERNS = {
        "credit_card": r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b",
        "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
        "phone_cn": r"\b1[3-9]\d{9}\b",
        "id_card_cn": r"\b\d{17}[\dXx]\b",
        "ip_private": r"\b(10\.\d{1,3}|172\.(1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b",
    }

    def __init__(self, mask_pii: bool = True, allowed_patterns: list[str] | None = None):
        self.mask_pii = mask_pii
        self.allowed_patterns = allowed_patterns

    def filter_output(self, raw_output: str, tool_name: str) -> str:
        if not self.mask_pii:
            return raw_output

        filtered = raw_output
        for pii_type, pattern in self.PATTERNS.items():
            if self.allowed_patterns and pii_type in self.allowed_patterns:
                continue
            filtered = re.sub(pattern, f"[{pii_type.upper()}_MASKED]", filtered)

        return filtered

    def filter_for_model(self, raw_output: str, max_length: int = 8000) -> str:
        filtered = self.filter_output(raw_output)
        if len(filtered) > max_length:
            filtered = filtered[:max_length] + "\n...[输出截断]"
        return filtered
```

### 4.3 范围限制与速率控制

```python
import time
from collections import defaultdict


class ToolRateLimiter:
    def __init__(self):
        self.call_records: dict[str, list[float]] = defaultdict(list)

    def check_rate_limit(
        self, tool_name: str, max_calls: int = 30, window_seconds: int = 60
    ) -> bool:
        now = time.time()
        self.call_records[tool_name] = [
            t for t in self.call_records[tool_name]
            if now - t < window_seconds
        ]
        if len(self.call_records[tool_name]) >= max_calls:
            return False
        self.call_records[tool_name].append(now)
        return True


class ToolScope:
    FILE_SYSTEM = "filesystem"
    NETWORK = "network"
    DATABASE = "database"
    EXTERNAL_API = "external_api"


SCOPE_RESTRICTIONS = {
    ToolScope.FILE_SYSTEM: {
        "allowed_paths": ["/workspace", "/tmp"],
        "blocked_operations": ["chmod", "chown", "symlink"],
    },
    ToolScope.NETWORK: {
        "allowed_domains": ["api.openai.com", "api.anthropic.com"],
        "blocked_ports": [22, 23, 3389],
        "max_payload_bytes": 1024 * 1024,
    },
    ToolScope.DATABASE: {
        "allowed_operations": ["SELECT"],
        "blocked_operations": ["DROP", "TRUNCATE", "ALTER"],
        "max_rows_returned": 1000,
    },
}
```

这种分层的输入验证-输出过滤-范围限制机制，构成了工具调用的纵深防御体系。任何单一层的失效都不会导致完全的安全崩溃。

---

## 5. 数据访问沙箱

Agent 处理的数据可能来自多个来源、包含多种敏感级别。数据访问沙箱的目标是：让 Agent 只能看到它应该看到的数据，并且以脱敏的方式呈现。

### 5.1 敏感数据检测与分级

```python
from dataclasses import dataclass
from enum import IntEnum


class DataClassification(IntEnum):
    PUBLIC = 0
    INTERNAL = 1
    CONFIDENTIAL = 2
    RESTRICTED = 3


@dataclass
class DataField:
    name: str
    classification: DataClassification
    pii_type: str | None = None
    masking_rules: dict | None = None


class DataAccessControl:
    def __init__(self, agent_clearance: DataClassification = DataClassification.INTERNAL):
        self.agent_clearance = agent_clearance
        self.field_registry: dict[str, DataField] = {}

    def register_field(self, dataset: str, field: DataField):
        key = f"{dataset}.{field.name}"
        self.field_registry[key] = field

    def can_access_field(self, dataset: str, field_name: str) -> bool:
        key = f"{dataset}.{field_name}"
        field = self.field_registry.get(key)
        if not field:
            return False
        return field.classification <= self.agent_clearance

    def mask_field(self, dataset: str, field_name: str, value: str) -> str:
        key = f"{dataset}.{field_name}"
        field = self.field_registry.get(key)
        if not field:
            return "[ACCESS_DENIED]"

        if field.classification > self.agent_clearance:
            return "[CLASSIFIED]"

        if field.pii_type:
            return self._apply_pii_mask(value, field.pii_type)

        return value

    def _apply_pii_mask(self, value: str, pii_type: str) -> str:
        mask_map = {
            "name": value[0] + "*" * (len(value) - 1) if value else "",
            "phone": value[:3] + "****" + value[-4:] if len(value) >= 7 else "****",
            "email": value[0] + "***@" + value.split("@")[-1] if "@" in value else "***",
            "id_card": value[:4] + "**********" + value[-4:] if len(value) >= 14 else "****",
        }
        return mask_map.get(pii_type, "***")
```

### 5.2 字段级访问控制集成

在实际的数据库查询场景中，数据访问控制需要与查询引擎集成：

```python
class SecureQueryEngine:
    def __init__(self, dac: DataAccessControl):
        self.dac = dac

    def execute_query(
        self, dataset: str, fields: list[str], raw_data: list[dict]
    ) -> list[dict]:
        allowed_fields = [
            f for f in fields if self.dac.can_access_field(dataset, f)
        ]
        blocked_count = len(fields) - len(allowed_fields)

        results = []
        for row in raw_data:
            masked_row = {}
            for field_name in allowed_fields:
                raw_value = str(row.get(field_name, ""))
                masked_row[field_name] = self.dac.mask_field(
                    dataset, field_name, raw_value
                )
            results.append(masked_row)

        if blocked_count > 0:
            results[0]["_meta"] = f"{blocked_count} 个字段因权限不足被过滤"

        return results
```

数据分类与字段级控制的结合，确保了 Agent 在完成任务的同时不会泄露超出其权限范围的敏感信息。这与企业数据治理体系中的 DLP（Data Loss Prevention）策略形成互补。

---

## 6. 审计日志设计

审计日志是 Agent 安全体系的"黑匣子"——它不仅用于事后追溯，更是实时安全监控和合规审查的基础。

### 6.1 该记录什么

Agent 审计日志需要覆盖完整的决策链路，至少包含以下事件类型：

| 事件类型 | 记录内容 | 安全价值 |
|---------|---------|---------|
| tool_call | 工具名、参数、调用者、时间戳、风险等级 | 追踪工具滥用行为 |
| tool_result | 返回值摘要、执行耗时、错误码 | 分析异常模式 |
| decision | 模型决策理由（如有）、置信度 | 解释 Agent 行为逻辑 |
| permission_check | 权限检查结果、拒绝原因 | 审计权限控制有效性 |
| data_access | 访问的数据集、字段、脱敏情况 | 合规审查数据访问 |
| error | 错误类型、堆栈、上下文 | 安全事件根因分析 |
| policy_violation | 违反的策略、触发条件 | 安全策略有效性评估 |

### 6.2 结构化日志格式

推荐使用 JSON Lines（`.jsonl`）格式记录结构化日志：

```python
import json
import time
import uuid
from typing import Any
from pathlib import Path


@dataclass
class AuditEvent:
    event_type: str
    agent_id: str
    session_id: str
    timestamp: float
    details: dict[str, Any]
    risk_level: str = "LOW"
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))

    def to_dict(self) -> dict:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "agent_id": self.agent_id,
            "session_id": self.session_id,
            "timestamp": self.timestamp,
            "risk_level": self.risk_level,
            "details": self.details,
        }


class AuditLogger:
    def __init__(self, log_path: str = "/var/log/agent_audit"):
        self.log_path = Path(log_path)
        self.log_path.mkdir(parents=True, exist_ok=True)

    def log_event(self, event: AuditEvent):
        log_line = json.dumps(event.to_dict(), ensure_ascii=False) + "\n"
        date_str = time.strftime("%Y-%m-%d")
        log_file = self.log_path / f"audit_{date_str}.jsonl"

        with open(log_file, "a", encoding="utf-8") as f:
            f.write(log_line)

    def log_tool_call(
        self, agent_id: str, session_id: str,
        tool_name: str, arguments: dict, risk_level: str = "LOW"
    ):
        self.log_event(AuditEvent(
            event_type="tool_call",
            agent_id=agent_id,
            session_id=session_id,
            timestamp=time.time(),
            risk_level=risk_level,
            details={
                "tool_name": tool_name,
                "arguments_keys": list(arguments.keys()),
                "arguments_size": len(json.dumps(arguments)),
            },
        ))

    def log_permission_check(
        self, agent_id: str, session_id: str,
        tool_name: str, allowed: bool, reason: str
    ):
        self.log_event(AuditEvent(
            event_type="permission_check",
            agent_id=agent_id,
            session_id=session_id,
            timestamp=time.time(),
            risk_level="MEDIUM" if not allowed else "LOW",
            details={
                "tool_name": tool_name,
                "allowed": allowed,
                "reason": reason,
            },
        ))
```

### 6.3 合规要求

不同行业和地区的合规要求对审计日志有不同的约束：

| 合规标准 | 日志保留期限 | 关键要求 | 适用范围 |
|---------|------------|---------|---------|
| ISO 27001 | 至少 3 年 | 完整的访问审计链路、不可篡改 | 信息安全管理 |
| 等保 2.0（三级） | 至少 6 个月 | 日志集中存储、防篡改、异地备份 | 国内关键信息基础设施 |
| SOC 2 Type II | 至少 1 年 | 持续监控、异常告警、定期审查 | SaaS 服务 |
| GDPR | 数据处理记录保存 25 年 | 数据访问可追溯、用户可查询 | 欧盟个人数据 |

在实现上，日志文件应存储在**只追加（append-only）**的存储介质上，并定期同步到独立的日志服务器，确保即使应用层被攻破，审计日志也不会被篡改。

---

## 7. 安全策略引擎

安全策略引擎是整个 Agent 安全架构的"大脑"——它将权限模型、沙箱配置、审计日志串联为一个动态响应的安全闭环。

### 7.1 风险评分机制

```python
@dataclass
class RiskScore:
    total: float
    components: dict[str, float]
    level: RiskLevel

    def to_dict(self) -> dict:
        return {
            "total": self.total,
            "level": self.level.name,
            "components": self.components,
        }


class RiskScoringEngine:
    WEIGHTS = {
        "tool_sensitivity": 0.30,
        "data_sensitivity": 0.25,
        "user_trust": 0.20,
        "behavior_anomaly": 0.15,
        "environment": 0.10,
    }

    TOOL_SENSITIVITY = {
        "read_file": 0.2,
        "write_file": 0.5,
        "sql_query": 0.6,
        "execute_code": 0.8,
        "delete_file": 0.9,
        "send_email": 0.7,
        "api_call_external": 0.6,
    }

    def compute_risk(self, context: dict) -> RiskScore:
        scores = {}

        tool = context.get("tool_name", "unknown")
        scores["tool_sensitivity"] = self.TOOL_SENSITIVITY.get(tool, 0.5)

        data_level = context.get("data_classification", 0)
        scores["data_sensitivity"] = data_level / 3.0

        trust = context.get("user_trust_score", 0.5)
        scores["user_trust"] = 1.0 - trust

        anomaly = context.get("anomaly_score", 0.0)
        scores["behavior_anomaly"] = min(anomaly, 1.0)

        env = context.get("is_production", False)
        scores["environment"] = 1.0 if env else 0.3

        total = sum(
            scores[k] * self.WEIGHTS[k] for k in self.WEIGHTS
        )

        if total >= 0.8:
            level = RiskLevel.CRITICAL
        elif total >= 0.6:
            level = RiskLevel.HIGH
        elif total >= 0.3:
            level = RiskLevel.MEDIUM
        else:
            level = RiskLevel.LOW

        return RiskScore(total=total, components=scores, level=level)
```

### 7.2 Human-in-the-Loop 触发策略

不是所有操作都应该被自动执行。安全策略引擎需要定义清晰的**人工确认触发条件**：

```python
class HumanInTheLoopTrigger:
    def __init__(self, risk_engine: RiskScoringEngine):
        self.risk_engine = risk_engine
        self.auto_approve_max_level = RiskLevel.LOW
        self.require_confirm_levels = [RiskLevel.MEDIUM, RiskLevel.HIGH]
        self.block_levels = [RiskLevel.CRITICAL]

    def should_require_confirmation(
        self, context: dict
    ) -> tuple[bool, str, RiskScore]:
        risk = self.risk_engine.compute_risk(context)

        if risk.level in self.block_levels:
            return True, "操作已被安全策略阻止", risk

        if risk.level in self.require_confirm_levels:
            reason = (
                f"操作涉及 {context.get('tool_name', 'unknown')}，"
                f"风险等级: {risk.level.name}（总分: {risk.total:.2f}）"
            )
            return True, reason, risk

        return False, "", risk


class SecurityPolicyEngine:
    def __init__(self):
        self.risk_engine = RiskScoringEngine()
        self.human_loop = HumanInTheLoopTrigger(self.risk_engine)
        self.perm_engine = PermissionEngine()
        self.audit_logger = AuditLogger()
        self.rate_limiter = ToolRateLimiter()
        self.output_filter = OutputFilter(mask_pii=True)

    def evaluate_tool_call(
        self, agent_id: str, session_id: str,
        tool_name: str, arguments: dict,
        context: dict,
    ) -> dict:
        full_context = {**context, "tool_name": tool_name}

        if not self.rate_limiter.check_rate_limit(tool_name):
            self.audit_logger.log_event(AuditEvent(
                event_type="rate_limit_exceeded",
                agent_id=agent_id, session_id=session_id,
                timestamp=time.time(), risk_level="MEDIUM",
                details={"tool_name": tool_name},
            ))
            return {"allowed": False, "reason": "超出调用频率限制"}

        need_confirm, confirm_reason, risk = (
            self.human_loop.should_require_confirmation(full_context)
        )

        self.audit_logger.log_tool_call(
            agent_id, session_id, tool_name, arguments,
            risk_level=risk.level.name,
        )

        if need_confirm:
            return {
                "allowed": False,
                "need_confirmation": True,
                "reason": confirm_reason,
                "risk_score": risk.to_dict(),
            }

        return {"allowed": True, "risk_score": risk.to_dict()}
```

安全策略引擎将**风险评分、频率限制、权限检查、人工确认**四个维度的控制逻辑统一到一个评估管线中。每次工具调用在执行前都必须通过这条管线，确保所有安全策略得到一致、可靠的执行。

---

## 8. Agent 安全架构全景

将以上各层安全机制组合在一起，形成完整的 Agent 安全架构：

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    AI Agent 安全架构（分层视图）                       │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     用户交互层                                 │  │
│  │   用户输入 → 输入清洗 → Prompt 注入检测 → 风险预评估             │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              ▼                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                   安全策略引擎                                 │  │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │  │
│  │   │  风险评分引擎  │  │  权限检查器   │  │  人工确认网关      │   │  │
│  │   │  RiskScoring  │  │  Permission   │  │  HITL Trigger    │   │  │
│  │   └──────────────┘  └──────────────┘  └──────────────────┘   │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              ▼                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                   Agent 推理层                                 │  │
│  │   LLM 推理 → 工具选择决策 → 参数生成 → 安全约束注入              │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              ▼                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                 工具调用沙箱层                                  │  │
│  │   输入验证 → 范围限制 → 速率控制 → 输出过滤                      │  │
│  │                                                               │  │
│  │   ┌──────────────────────────────────────────────────────┐    │  │
│  │   │                 代码执行沙箱                          │    │  │
│  │   │   Docker / gVisor / Firecracker / E2B               │    │  │
│  │   │   网络隔离 + 文件系统只读 + 资源限制 + 超时终止        │    │  │
│  │   └──────────────────────────────────────────────────────┘    │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              ▼                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                 数据访问沙箱层                                  │  │
│  │   数据分级 → 字段级访问控制 → PII 检测 → 动态脱敏               │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              ▼                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                   审计日志层                                   │  │
│  │   结构化日志 → 实时告警 → 合规报告 → 不可篡改存储               │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

这个架构遵循**纵深防御（Defense in Depth）**原则：每一层安全机制都是独立的，单层失效不会导致整体崩溃。用户输入首先经过清洗和注入检测，然后由安全策略引擎评估风险并检查权限，Agent 的推理结果再经过工具沙箱的输入验证和输出过滤，数据访问受分级控制和脱敏保护，所有操作全程被审计日志记录。

---

## 9. 延伸阅读

**安全架构与标准**
- OWASP Top 10 for LLM Applications —— OWASP 发布的 LLM 应用十大安全风险，是 Agent 安全设计的基础参考
- NIST AI Risk Management Framework (AI RMF) —— 美国国家标准与技术研究院的 AI 风险管理框架
- ISO/IEC 42001 —— 人工智能管理体系国际标准
- 等保 2.0 GB/T 22239-2019 —— 国内网络安全等级保护基本要求

**沙箱技术**
- Firecracker：AWS 开源的轻量级虚拟机技术，为 Lambda/Fargate 提供隔离基础
- gVisor：Google 开源的应用内核，通过用户态 syscall 拦截实现安全隔离
- E2B（e2b.dev）：专为 AI Agent 设计的云端代码沙箱服务
- seccomp-bpf：Linux 内核的系统调用过滤机制，是容器安全的底层基础

**Agent 安全框架**
- Lakera Guard —— LLM 应用的实时安全检测层，覆盖 Prompt 注入、数据泄露、有害内容
- Rebuff —— 开源的 Prompt 注入检测框架
- LLM Guard —— 开源的 LLM 安全工具包，包含输入/输出消毒、PII 检测等功能
- Guardrails AI —— LLM 输出验证和结构化框架，确保模型输出符合预期格式和安全约束

**工具生态安全**
- MCP 规范安全附录 —— Model Context Protocol 的安全设计指南
- Anthropic Tool Use 安全最佳实践 —— Claude 工具调用的安全配置建议
- OpenAI Function Calling 安全指南 —— GPT 系列模型工具调用的安全边界设计
