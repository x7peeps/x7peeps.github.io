---
title: "多智能体系统安全：身份验证、合谋攻击与通信防护"
weight: 10
tags: [多智能体安全, 身份验证, 合谋攻击, 消息完整性, 权限传递]
menu: 
  main: 
    parent: "AI安全"
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
        age