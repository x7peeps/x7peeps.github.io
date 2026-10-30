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
        agent_public_key: str,
        role: str,
        expires_in: int = 86400,
    ) -> AgentIdentity:
        if agent_id in self.identities and not self.identities[agent_id].is_expired():
            raise ValueError("agent_id 未过期，不允许重复注册")
        identity = AgentIdentity(
            agent_id=agent_id,
            public_key=agent_public_key,
            role=role,
            expires_at=time.time() + expires_in,
        )
        identity.signature = ca_sign(identity._sign_data())
        self.identities[agent_id] = identity
        return identity

    def verify(self, identity: AgentIdentity) -> bool:
        if identity.agent_id in self.revocation_list:
            return False
        if identity.is_expired():
            return False
        return ca_verify(identity._sign_data(), identity.signature)
```

证书生命周期必须闭环：**短 TTL（小时级）+ 自动轮换 + 吊销列表实时同步**。在多 Agent 系统里，长寿命凭证等于给横向移动发复制钥匙。

## 3. 通信防护

| 层 | 措施 | 对抗 |
| :--- | :--- | :--- |
| 传输层 | mTLS，证书绑定 agent_id | 窃听、端点伪造 |
| 消息层 | 签名 + nonce + 时间戳 | 重放、篡改 |
| 语义层 | 消息标注来源与信任级，接收端按策略处理 | 经消息转发的注入 |
| 拓扑层 | 通信白名单：仅允许任务图声明的边 | 非法信息通道 |

多 Agent 注入的经典形态：被污染的 Agent 在任务消息里夹带指令，下游 Agent 把"同事的话"当成可信上下文直接执行。**"谁说的"必须和"说了什么"一起被校验。**

## 4. 合谋攻击检测

合谋（collusion）指多个 Agent 绕过设计权限、组合出任何单个 Agent 都无权达成的效果。三条检测思路：**通道检测**（发现拓扑之外的通信边）、**行为相关性**（多 Agent 动作序列出现超出任务图的协同模式）、**决策集中度**（关键审批链被同一批身份把持时触发法定人数校验）。对高价值操作，宁可让独立异构的多个 Agent 交叉审批，也不给任何单点组合出全权限的机会。

## 5. 总结

多智能体安全的范式转变，是彻底废除"内网即可信"：每个 Agent 都是潜在的被俘节点。身份签发、通信校验、合谋监控三道防线，共同把"内部"也变成零信任域。系统规模越大，越要保证安全假设不依赖"同事不会背叛"这一条——身份可验证、消息可溯源、协同可审计，缺一不可。
（数据来源：NIST 零信任架构（SP 800-207）、OWASP LLM Top 10 与多智能体合谋攻击相关论文，整理截至 2026-10。）
本文面向授权安全研究与防御建设，未经授权对任何系统实施文中技术属违法行为。
