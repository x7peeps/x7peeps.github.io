---
title: "多智能体系统安全：身份验证、合谋攻击与通信防护"
weight: 10
tags: [多智能体安全, 身份验证, 合谋攻击, 消息完整性, 权限传递]
menu: 
  main: 
    parent: "安全与 AI 融合"
---

# 多智能体系统安全：身份验证、合谋攻击与通信防护

当 AI Agent 从一个独立的对话助手演进为多智能体协作系统中的一员时，安全问题从单点防护升级为网络化对抗。在多智能体系统（Multi-Agent System, MAS）中，多个 Agent 通过消息传递进行协作，共同完成复杂任务——但这也创造了全新的攻击面：Agent 之间的信任关系可以被伪造，消息可以被篡改，多个 Agent 可以合谋绕过安全控制。

多智能体系统的安全挑战与传统的分布式系统安全有相似之处，但有一个关键区别：Agent 的决策是非确定性的，且 Agent 之间的"信任"建立在语义层面而非纯粹的协议层面。这意味着，即使通信信道是加密的，攻击者仍然可以通过语义层面的操纵来破坏系统。本文从 Agent 身份验证、权限传播控制、合谋攻击检测和消息完整性四个维度，系统梳理多智能体系统的安全防护体系。

---

## 1. 多智能体系统威胁模型

在设计安全机制之前，必须先理解多智能体系统面临的特有威胁。与单 Agent 系统不同，MAS 的攻击面分布在 Agent 之间的交互链路上。

### 1.1 四类核心威胁

| 威胁类别 | 攻击方式 | 典型场景 | 影响程度 |
|---------|---------|---------|---------|
| 身份伪造 | Agent 冒充其他 Agent 发送消息 | 恶意 Agent 冒充管理员 Agent 下发指令 | 高 |
| 权限逃逸 | 低权限 Agent 利用高权限 Agent 执行操作 | 只读 Agent 请求写入 Agent 执行敏感操作 | 高 |
| 合谋攻击 | 多个 Agent 协作绕过安全控制 | 两个低权限 Agent 组合操作突破单一限制 | 极高 |
| 消息篡改 | 中间人修改 Agent 间通信内容 | 篡改 Agent 之间的任务指令或结果数据 | 高 |

### 1.2 攻击面全景

```
┌─────────────────────────────────────────────────────────────────────┐
│                    多智能体系统攻击面全景                              │
│                                                                     │
│  攻击者                                                        │
│     │                                                              │
│     ├──→ ① 直接攻击 Agent A                                         │
│     │     ├── Prompt 注入 → 控制 Agent A 的行为                       │
│     │     └── 身份伪造 → 冒充 Agent A 与其他 Agent 通信               │
│     │                                                              │
│     ├──→ ② 通信信道攻击                                             │
│     │     ├── 消息窃听 → 获取 Agent 间传递的敏感信息                   │
│     │     ├── 消息篡改 → 修改 Agent 间的指令或数据                    │
│     │     └── 消息重放 → 重复发送合法消息以触发非预期行为               │
│     │                                                              │
│     ├──→ ③ Agent 协作链路攻击                                        │
│     │     ├── 权限链劫持 → 利用权限传递链逐级提升                      │
│     │     └── 合谋攻击 → 控制多个 Agent 协同突破                       │
│     │                                                              │
│     └──→ ④ 系统级攻击                                               │
│           ├── 拒绝服务 → 向 Agent 发送大量无效消息                     │
│           └── Agent 注入 → 向系统中注册恶意 Agent                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 安全假设与信任边界

在多智能体系统中，需要明确以下信任边界：

```text
信任假设层次：

  Layer 0: 基础设施信任
   - 通信信道是加密的（TLS/mTLS）
   - 消息队列服务是可信的
   - 时钟同步服务是可信的

  Layer 1: Agent 身份信任
   - 每个 Agent 有唯一身份标识（Agent ID）
   - Agent ID 通过数字证书/Token 验证
   - Agent 无法伪造其他 Agent 的身份

  Layer 2: Agent 行为信任（运行时）
   - Agent 的行为可能偏离预期
   - Agent 可能被 Prompt 注入控制
   - Agent 的输出必须经过验证
   - 不做"Agent 是诚实"的假设

  Layer 3: 跨 Agent 信任
   - 不信任任何其他 Agent 的消息
   - 所有跨 Agent 消息必须验证来源
   - 权限传递必须显式声明并审计
```

核心原则：**Zero Trust 理念同样适用于 MAS**——永远不假设其他 Agent 的行为是可信的，所有跨 Agent 交互都必须经过验证和授权。

---

## 2. Agent 身份验证

在 MAS 中，每个 Agent 需要一个可验证的身份，以确保消息的来源可信。身份验证是后续所有安全机制的基础。

### 2.1 身份注册与证书颁发

```python
import hashlib
import json
import time
from dataclasses import dataclass
from typing import Optional


@dataclass
class AgentIdentity:
    agent_id: str
    agent_type: str
    public_key: str
    capabilities: list[str]
    issuer: str
    issued_at: float
    expires_at: float
    signature: Optional[str] = None

    def verify(self) -> bool:
        """验证身份证书的签名"""
        data = self._sign_data()
        expected = hashlib.sha256(data.encode()).hexdigest()
        return self.signature == expected

    def _sign_data(self) -> str:
        return f"{self.agent_id}:{self.public_key}:{self.expires_at}"

    def is_expired(self) -> bool:
        return time.time() > self.expires_at


class IdentityRegistry:
    def __init__(self):
        self.identities: dict[str, AgentIdentity] = {}
        self.revocation_list: set[str] = set()

    def register_agent(
        self,
        agent_id: str,
        agent_type: str,
        public_key: str,
        capabilities: list[str],
        ttl_seconds: int = 86400,
    ) -> AgentIdentity:
        """注册新 Agent 并颁发身份证书"""
        identity = AgentIdentity(
            agent_id=agent_id,
            agent_type=agent_type,
            public_key=public_key,
            capabilities=capabilities,
            issuer="system",
            issued_at=time.time(),
            expires_at=time.time() + ttl_seconds,
        )
        identity.signature = hashlib.sha256(
            identity._sign_data().encode()
        ).hexdigest()

        self.identities[agent_id] = identity
        return identity

    def verify_identity(self, agent_id: str) -> tuple[bool, str]:
        """验证 Agent 身份是否有效"""
        if agent_id in self.revocation_list:
            return False, "Agent 证书已被吊销"

        identity = self.identities.get(agent_id)
        if not identity:
            return False, "Agent 未注册"

        if identity.is_expired():
            return False, "Agent 证书已过期"

        if not identity.verify():
            return False, "Agent 证书签名无效"

        return True, "身份验证通过"

    def revoke_agent(self, agent_id: str):
        """吊销 Agent 证书"""
        self.revocation_list.add(agent_id)
        self.identities.pop(agent_id, None)
```

### 2.2 消息签名验证

确保每条 Agent 间消息都经过数字签名，防止身份伪造和消息篡改：

```python
@dataclass
class AgentMessage:
    sender_id: str
    receiver_id: str
    message_type: str
    payload: dict
    timestamp: float
    nonce: str  # 防重放攻击
    signature: Optional[str] = None

    def sign(self, private_key: str):
        """对消息进行签名"""
        content = self._serialize()
        self.signature = hashlib.sha256(
            f"{content}:{private_key}".encode()
        ).hexdigest()

    def verify_signature(self, public_key: str) -> bool:
        """验证消息签名"""
        if not self.signature:
            return False
        content = self._serialize()
        expected = hashlib.sha256(
            f"{content}:{public_key}".encode()
        ).hexdigest()
        return self.signature == expected

    def _serialize(self) -> str:
        return json.dumps({
            "sender": self.sender_id,
            "receiver": self.receiver_id,
            "type": self.message_type,
            "payload": self.payload,
            "timestamp": self.timestamp,
            "nonce": self.nonce,
        }, sort_keys=True)


class MessageVerifier:
    def __init__(self, registry: IdentityRegistry):
        self.registry = registry
        self.seen_nonces: set[str] = set()

    def verify_message(self, message: AgentMessage) -> tuple[bool, str]:
        """全链路消息验证"""
        # 1. 验证发送者身份
        valid, reason = self.registry.verify_identity(message.sender_id)
        if not valid:
            return False, f"发送者身份验证失败: {reason}"

        # 2. 验证接收者身份
        valid, reason = self.registry.verify_identity(message.receiver_id)
        if not valid:
            return False, f"接收者身份验证失败: {reason}"

        # 3. 防重放攻击
        nonce_key = f"{message.sender_id}:{message.nonce}"
        if nonce_key in self.seen_nonces:
            return False, "检测到重放攻击（重复 nonce）"

        # 4. 验证消息时效性
        age = time.time() - message.timestamp
        if age > 300:  # 5 分钟窗口
            return False, "消息已过期"
        if age < -60:  # 允许 1 分钟时钟偏差
            return False, "消息时间戳异常（未来时间）"

        # 5. 验证签名
        identity = self.registry.identities.get(message.sender_id)
        if not identity:
            return False, "无法获取发送者公钥"

        if not message.verify_signature(identity.public_key):
            return False, "消息签名验证失败"

        # 记录 nonce 防止重放
        self.seen_nonces.add(nonce_key)

        return True, "消息验证通过"
```

### 2.3 通信协议安全设计

```
┌─────────────────────────────────────────────────────────────┐
│                 Agent 间安全通信协议                          │
│                                                             │
│  Agent A                   Agent B                          │
│     │                         │                             │
│     │  ① 发起连接请求          │                             │
│     │  ──────────────────────→  │                             │
│     │  携带 Agent A 证书       │                             │
│     │                         │                             │
│     │  ② 证书验证 + 质询       │                             │
│     │  ←────────────────────── │                             │
│     │  返回随机数 nonce_A      │                             │
│     │                         │                             │
│     │  ③ 签名 nonce 并返回     │                             │
│     │  ──────────────────────→  │                             │
│     │  sign(nonce_A, privKeyA) │                             │
│     │                         │                             │
│     │  ④ 身份确认 + 反向质询   │                             │
│     │  ←────────────────────── │                             │
│     │  返回 nonce_B            │                             │
│     │                         │                             │
│     │  ⑤ 建立安全会话          │                             │
│     │  ──────────────────────→  │                             │
│     │  所有后续消息签名        │                             │
│     │                         │                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 权限传播控制

在多智能体系统中，Agent 经常需要委托任务给其他 Agent 执行。这种委托行为天然涉及权限的传播——问题是：如何确保权限在传播过程中不被滥用？

### 3.1 权限传播模型

权限传播需要遵循三个核心约束：

```python
@dataclass
class PermissionScope:
    resource: str
    action: str
    conditions: dict


@dataclass
class DelegationToken:
    token_id: str
    original_principal: str    # 原始权限主体（通常是用户）
    current_holder: str        # 当前持有者
    permissions: list[PermissionScope]
    delegation_depth: int = 0
    max_depth: int = 3
    expires_at: float = 0.0

    def can_delegate(self) -> bool:
        """检查是否可以继续下放权限"""
        return self.delegation_depth < self.max_depth

    def is_valid(self) -> bool:
        return time.time() < self.expires_at

    def narrow(self, new_scopes: list[PermissionScope]) -> list[PermissionScope]:
        """缩小权限范围：新权限必须是当前权限的子集"""
        valid = []
        valid_resource = {s.resource for s in self.permissions}
        valid_action = {s.action for s in self.permissions}

        for scope in new_scopes:
            if scope.resource in valid_resource and scope.action in valid_action:
                valid.append(scope)

        return valid
```

### 3.2 权限传播控制器

```python
class DelegationController:
    def __init__(self):
        self.active_tokens: dict[str, DelegationToken] = {}
        self.audit_log: list[dict] = []

    def delegate(
        self,
        delegator: str,
        delegatee: str,
        scopes: list[PermissionScope],
        token: DelegationToken,
    ) -> Optional[DelegationToken]:
        """
        delegator 将权限委托给 delegatee。
        token 是 delegator 的当前权限凭证。
        """
        if not token.can_delegate():
            self._log_event("delegation_blocked", {
                "reason": "超过最大委托深度",
                "delegator": delegator,
                "delegatee": delegatee,
            })
            return None

        narrowed = token.narrow(scopes)
        if not narrowed:
            self._log_event("delegation_blocked", {
                "reason": "委托的权限超出自身权限范围",
                "delegator": delegator,
                "delegatee": delegatee,
            })
            return None

        new_token = DelegationToken(
            token_id=hashlib.sha256(
                f"{delegatee}:{time.time()}".encode()
            ).hexdigest()[:16],
            original_principal=token.original_principal,
            current_holder=delegatee,
            permissions=narrowed,
            delegation_depth=token.delegation_depth + 1,
            max_depth=token.max_depth,
            expires_at=token.expires_at,
        )

        self.active_tokens[new_token.token_id] = new_token

        self._log_event("delegation_granted", {
            "token_id": new_token.token_id,
            "delegator": delegator,
            "delegatee": delegatee,
            "permissions": [s.resource for s in narrowed],
            "depth": new_token.delegation_depth,
        })

        return new_token

    def execute_with_token(
        self,
        agent_id: str,
        token_id: str,
        resource: str,
        action: str,
    ) -> tuple[bool, str]:
        """使用 Token 执行操作"""
        token = self.active_tokens.get(token_id)
        if not token:
            return False, "Token 不存在"

        if token.current_holder != agent_id:
            return False, "Token 不属于当前 Agent"

        if not token.is_valid():
            return False, "Token 已过期"

        for scope in token.permissions:
            if scope.resource == resource and scope.action == action:
                self._log_event("execution_authorized", {
                    "agent_id": agent_id,
                    "resource": resource,
                    "action": action,
                    "token_id": token_id,
                })
                return True, "授权通过"

        return False, "权限不足"

    def _log_event(self, event_type: str, details: dict):
        self.audit_log.append({
            "event_type": event_type,
            "timestamp": time.time(),
            **details,
        })
```

### 3.3 权限传播的深层约束

权限传播控制的关键在于：**权限只能缩小，不能扩大；深度有限制；来源可追溯**。

| 约束类型 | 规则 | 违反后果 |
|---------|------|---------|
| 单调递减 | 委托的权限 ≤ 自己的权限 | 权限提升攻击 |
| 深度限制 | 委托链深度不超过 N 层（建议 3） | 无限委托链造成权限扩散 |
| 时效限制 | 委托 Token 有过期时间 | 长期有效的委托增加风险 |
| 最小范围 | 只委托完成任务所需的最小权限 | 过度委托 |
| 来源追溯 | 每次操作都能追溯到原始主体 | 审计追踪困难 |

---

## 4. 合谋攻击检测

合谋攻击是多智能体系统中最危险也最难检测的攻击类型。多个 Agent 各自执行看似合法的操作，但组合起来却突破了系统的安全限制。合谋攻击的本质是**操作的组合安全性低于各自安全性的加总**。

### 4.1 合谋攻击模式分析

```text
合谋攻击典型模式：

  场景：系统中有两个 Agent
    - Agent A：有"读取配置文件"的权限，无"写入"权限
    - Agent B：有"写入目标目录"的权限，无"读取"权限

  正常逻辑：A 只读，B 只写，各自不越权

  合谋攻击：
    1. Agent A 读取配置文件内容 → 通过侧信道传递给 Agent B
    2. Agent B 利用 A 提供的信息修改配置 → 绕过写入限制
    3. 结果：A+B 组合实现了"读+写配置文件"（本应只有管理员才能执行）

  检测难点：单独看 A 和 B 的操作都是合法的
           合谋的证据隐藏在 Agent 间的信息流中
```

### 4.2 合谋检测引擎

```python
from collections import defaultdict


class CollusionDetector:
    def __init__(self):
        self.action_log: list[dict] = []
        self.info_flow_graph: dict[str, set[str]] = defaultdict(set)
        self.sensitivity_map: dict[str, int] = {
            "read_config": 2,
            "write_config": 3,
            "execute_sql": 3,
            "delete_file": 4,
            "modify_permission": 5,
        }

    def log_action(self, agent_id: str, action: str, resource: str):
        """记录 Agent 的操作"""
        self.action_log.append({
            "agent_id": agent_id,
            "action": action,
            "resource": resource,
            "timestamp": time.time(),
        })

    def log_info_flow(self, from_agent: str, to_agent: str, information: str):
        """记录 Agent 之间的信息传递"""
        flow_key = f"{from_agent}→{to_agent}"
        self.info_flow_graph[flow_key].add(information)

    def detect_collusion(self, window_seconds: int = 60) -> list[dict]:
        """在指定时间窗口内检测合谋攻击"""
        recent = [
            a for a in self.action_log
            if time.time() - a["timestamp"] < window_seconds
        ]
        alerts = []

        # 检测模式 1: 权限分割绕过
        combined_actions = defaultdict(set)
        for action in recent:
            key = action["resource"]
            combined_actions[key].add(action["action"])

        for resource, actions in combined_actions.items():
            actions_lower = {a.lower() for a in actions}
            if "read" in actions_lower and "write" in actions_lower:
                agents = list(set(
                    a["agent_id"] for a in recent
                    if a["resource"] == resource
                ))
                if len(agents) >= 2:
                    alerts.append({
                        "type": "permission_split_collusion",
                        "resource": resource,
                        "agents": agents,
                        "actions": list(actions),
                        "severity": "HIGH",
                    })

        # 检测模式 2: 信息流 + 操作组合
        for flow_key, info in self.info_flow_graph.items():
            from_agent, to_agent = flow_key.split("→")

            to_actions = [
                a for a in recent
                if a["agent_id"] == to_agent and
                   a["timestamp"] > time.time() - 30
            ]

            if to_actions:
                combined_risk = sum(
                    self.sensitivity_map.get(a["action"], 1)
                    for a in to_actions
                )
                if combined_risk >= 8:
                    alerts.append({
                        "type": "info_flow_collusion",
                        "from_agent": from_agent,
                        "to_agent": to_agent,
                        "information_shared": list(info),
                        "combined_risk": combined_risk,
                        "severity": "CRITICAL",
                    })

        return alerts
```

### 4.3 组合操作风险评估

| 操作组合 | 单操作安全级别 | 组合风险 | 合谋可能性 |
|---------|---------------|---------|-----------|
| 读配置 + 写配置 | 低 + 低 | 高 | 高 |
| 读数据库 + 发送外部 API | 低 + 中 | 高 | 高 |
| 生成代码 + 执行代码 | 低 + 高 | 极高 | 极高 |
| 读文件 + 删除文件 | 低 + 高 | 极高 | 高 |
| 修改权限 + 执行敏感操作 | 高 + 高 | 极高 | 极高 |

### 4.4 主动合谋防御

除了检测，系统还应当具备主动防御合谋的能力：

```python
class ProactiveCollusionDefense:
    def __init__(self):
        self.operation_dependency: dict[str, list[str]] = {
            "write_config": ["read_config"],
            "execute_sql": ["read_database"],
            "modify_file": ["read_file"],
        }

    def requires_human_approval(
        self,
        action_sequence: list[tuple[str, str]],
    ) -> tuple[bool, str]:
        """
        判断操作序列是否需要人工确认。
        如果多个 Agent 的操作序列构成"读→写"模式，触发人工审批。
        """
        resource_ops = defaultdict(set)
        for agent_id, action in action_sequence:
            for resource, dependent_ops in self.operation_dependency.items():
                if action in dependent_ops:
                    if resource in resource_ops and action == "write":
                        return True, (
                            f"检测到合谋风险："
                            f"Agent {agent_id} 的 {action} 操作依赖先前读操作"
                        )
                if action in [resource, *dependent_ops]:
                    resource_ops[action].add(agent_id)

        return False, ""
```

---

## 5. 消息完整性保护

Agent 之间的通信必须保证消息在传输过程中未被篡改。这需要结合密码学签名和语义层面的完整性验证。

### 5.1 消息完整性验证分层模型

```python
class MessageIntegrityVerifier:
    def __init__(self):
        self.verification_layers = [
            self._verify_cryptographic,
            self._verify_payload_schema,
            self._verify_semantic_consistency,
        ]

    def verify(self, message: AgentMessage) -> tuple[bool, str]:
        for layer in self.verification_layers:
            valid, reason = layer(message)
            if not valid:
                return False, reason
        return True, "完整性验证通过"

    def _verify_cryptographic(self, message: AgentMessage) -> tuple[bool, str]:
        """密码学层面验证：签名是否有效"""
        if not message.signature:
            return False, "消息缺少签名"
        # 签名验证逻辑（使用 Agent 的公钥）
        return True, ""

    def _verify_payload_schema(self, message: AgentMessage) -> tuple[bool, str]:
        """格式层面验证：payload 是否符合预期 Schema"""
        expected_types = {
            "task_assignment": {"task_id", "description", "deadline"},
            "task_result": {"task_id", "status", "output"},
            "query": {"resource", "parameters"},
            "delegation": {"target_agent", "scopes"},
        }
        expected = expected_types.get(message.message_type)
        if expected and not expected.issubset(message.payload.keys()):
            missing = expected - set(message.payload.keys())
            return False, f"Payload 缺少必要字段: {missing}"
        return True, ""

    def _verify_semantic_consistency(self, message: AgentMessage) -> tuple[bool, str]:
        """语义层面验证：消息内容是否符合预期"""
        if message.message_type == "task_assignment":
            task = message.payload.get("description", "")
            # 检查任务描述是否包含危险指令
            dangerous_keywords = [
                "忽略", "覆盖", "删除", "DAN", "越狱",
            ]
            for kw in dangerous_keywords:
                if kw in task:
                    return False, f"任务描述包含危险关键词: {kw}"
        return True, ""
```

### 5.2 消息日志与溯源

完整的消息日志是发现和追溯攻击的基础：

```python
class MessageAuditTrail:
    def __init__(self):
        self.message_history: list[dict] = []

    def record_message(
        self,
        message: AgentMessage,
        verification_result: tuple[bool, str],
    ):
        self.message_history.append({
            "message_id": hashlib.sha256(
                json.dumps({
                    "sender": message.sender_id,
                    "nonce": message.nonce,
                    "timestamp": message.timestamp,
                }).encode()
            ).hexdigest(),
            "sender": message.sender_id,
            "receiver": message.receiver_id,
            "type": message.message_type,
            "payload_preview": str(message.payload)[:200],
            "timestamp": message.timestamp,
            "verified": verification_result[0],
            "verification_detail": verification_result[1],
            "received_at": time.time(),
        })

    def trace_message_flow(
        self,
        start_agent: str,
        end_agent: str,
        time_window: tuple[float, float],
    ) -> list[dict]:
        """追溯两个 Agent 之间的消息流"""
        return [
            m for m in self.message_history
            if m["sender"] == start_agent
            and m["receiver"] == end_agent
            and time_window[0] <= m["timestamp"] <= time_window[1]
        ]

    def detect_message_anomaly(self) -> list[dict]:
        """检测消息层面的异常"""
        alerts = []

        # 异常 1: 某个 Agent 在短时间内发送了大量消息
        agent_counts = defaultdict(int)
        for m in self.message_history:
            agent_counts[m["sender"]] += 1
        for agent, count in agent_counts.items():
            if count > 100:
                alerts.append({
                    "type": "high_message_volume",
                    "agent": agent,
                    "count": count,
                    "severity": "MEDIUM",
                })

        # 异常 2: 验证失败的消息集中在某个 Agent
        failed_messages = [
            m for m in self.message_history if not m["verified"]
        ]
        if failed_messages:
            failed_agents = defaultdict(int)
            for m in failed_messages:
                failed_agents[m["sender"]] += 1
            worst_agent = max(failed_agents, key=failed_agents.get)
            alerts.append({
                "type": "concentrated_verification_failure",
                "agent": worst_agent,
                "failure_count": failed_agents[worst_agent],
                "severity": "HIGH",
            })

        return alerts
```

---

## 6. 安全架构总览

将所有安全机制整合为多智能体系统的完整安全架构：

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                        多智能体系统安全架构                                    │
│                                                                             │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐                  │
│  │ Agent A │    │ Agent B │    │ Agent C │    │ Agent D │                  │
│  │ 身份:A1  │    │ 身份:B2  │    │ 身份:C3  │    │ 身份:D4  │                  │
│  │ 权限:R   │    │ 权限:W   │    │ 权限:RW  │    │ 权限:ADMIN              │
│  └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘                  │
│       │              │              │              │                       │
│       ▼              ▼              ▼              ▼                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    安全通信层（Secured Communication）                 │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  mTLS / 消息签名 / Nonce / 时间戳 / 消息 ID                    │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    身份验证层（Identity Verification）                  │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │   │
│  │  │ 注册与证书颁发  │  │ 身份验证中间件  │  │ 证书吊销列表（CRL）       │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    权限控制层（Access Control）                         │   │
│  │  ┌──────────────────────┐  ┌────────────────────────────────────┐   │   │
│  │  │ 权限传播控制器         │  │ 合谋攻击检测引擎                      │   │   │
│  │  │ Delegation Controller│  │ CollusionDetector                  │   │   │
│  │  └──────────────────────┘  └────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    监控审计层（Monitoring & Audit）                    │   │
│  │  ┌──────────────────┐  ┌────────────────┐  ┌────────────────────┐   │   │
│  │  │ 消息审计日志      │  │ 合谋统计报表    │  │ 异常行为告警       │   │   │
│  │  │ 全量消息追溯     │  │ 组合风险评分    │  │ 实时通知           │   │   │
│  │  └──────────────────┘  └────────────────┘  └────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. 安全最佳实践与建议

### 7.1 架构设计建议

| 原则 | 说明 | 优先级 |
|------|------|--------|
| 最小化 Agent 数量 | Agent 越少，攻击面越小 | P0 |
| 职责单一化 | 每个 Agent 只做一件事，权限边界清晰 | P0 |
| 默认拒绝通信 | Agent 间通信默认禁止，白名单放行 | P1 |
| 通信频率限制 | 限制单位时间内的消息数量 | P1 |
| 权限传播显式化 | 所有权限委托必须显式记录在审计日志中 | P0 |
| 定期轮换密钥 | Agent 身份证书定期轮换，最长 7 天 | P2 |

### 7.2 运行时防护清单

- 所有 Agent 通信必须经过**身份验证 + 签名验证 + 时效验证**
- 权限委托 Token 必须设置**过期时间**和**最大深度**
- 任何 Agent 的行为都要被**记录和可追溯**
- Agent 之间的信息流需要被**监控和分析**
- 合谋检测引擎作为**实时中间件**部署在消息总线上
- 定期进行**红队测试**，模拟 Agent 合谋等攻击场景

多智能体系统的安全不是简单地将单 Agent 安全机制复制 N 份，而是需要建立 Agent 间的信任模型、权限传播约束和合谋攻击检测能力。在 Agent 数量增加时，攻击面的增长是平方级的——因此安全机制的设计必须在系统架构的顶层规划，而非事后补充。