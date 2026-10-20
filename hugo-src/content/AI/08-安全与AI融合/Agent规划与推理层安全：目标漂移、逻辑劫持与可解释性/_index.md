---
title: "Agent规划与推理层安全：目标漂移、逻辑劫持与可解释性"
weight: 8
tags: [推理安全, 目标漂移, 逻辑劫持, 可解释性, 边界条件]
menu: 
  main: 
    parent: "AI安全"
---

# Agent规划与推理层安全：目标漂移、逻辑劫持与可解释性

AI Agent 的核心能力在于自主规划与推理——接收一个高层任务后，将其分解为可执行的子目标序列，并在执行过程中根据中间结果动态调整策略。然而，推理层也是 Agent 安全架构中最难以防御的环节。原因有三：其一，推理过程本质上是非确定性的，同一个输入在不同上下文中可能产生截然不同的规划路径；其二，安全违规行为与正常行为之间的界限在推理层面往往是模糊的；其三，推理链的长度和分支复杂度使得审计和可解释性面临巨大挑战。

本文将深入探讨 Agent 推理层的三大安全核心议题：目标漂移检测、逻辑劫持防御、可解释性与审计追踪，以及边界条件的优雅处理。

---

## 1. 推理层安全威胁模型

Agent 的推理过程通常遵循 ReAct（Reasoning + Acting）范式：接收任务 → 分解子目标 → 选择工具 → 执行 → 观察结果 → 调整计划 → 继续或终止。在这个过程中，存在三种根本性的安全威胁。

### 1.1 三大核心威胁

```
推理层安全威胁模型:

  Threat 1: 目标漂移 (Goal Drifting)
  ├── 定义: Agent 在执行过程中逐渐偏离原始任务目标
  ├── 成因: 子目标分解的语义歧义 + 中间结果的误导
  ├── 后果: 执行了超出用户授权的操作
  └── 难度: 检测困难，因为每个子目标单独看都是合理的

  Threat 2: 逻辑劫持 (Logic Hijacking)
  ├── 定义: 攻击者通过嵌入错误前提或推理陷阱劫持 Agent 的推理链
  ├── 成因: 外部数据源中包含误导性前提 + Agent 缺乏批判性推理
  ├── 后果: Agent 基于错误假设做出高风险决策
  └── 难度: 极为困难，因为劫持后的推理链在逻辑上仍然是自洽的

  Threat 3: 循环陷阱 (Loop Trap)
  ├── 定义: Agent 陷入无限推理循环，无法终止
  ├── 成因: 开放式任务（"不断优化"）+ 缺乏终止条件
  ├── 后果: 资源耗尽 + 无法响应新请求
  └── 难度: 容易检测，但难以在规划层面预防
```

### 1.2 攻击面对比

| 威胁类型 | 利用难度 | 检测难度 | 影响范围 | 攻击入口 |
|---------|---------|---------|---------|---------|
| 目标漂移 | 中 | 高 | Agent 全链路 | 多义任务 + 中间结果注入 |
| 逻辑劫持 | 高 | 极高 | Agent 决策层 | 外部数据源 + RAG 内容 |
| 循环陷阱 | 低 | 低 | Agent 可用性 | 开放式任务指令 |
| 子目标越权 | 中 | 中 | 工具调用层 | 推理链中的权限漂移 |
| 推理链污染 | 高 | 高 | Agent 记忆层 | 多轮对话积累 |

---

## 2. 目标漂移检测

目标漂移是 Agent 安全中最隐蔽的威胁之一。它不像是工具调用层的命令注入那样有明显的攻击 payload，而是表现为 Agent 的意图逐渐偏离原始目标。更危险的是，目标漂移往往不是单一决策点的错误，而是多次"微小偏离"的累积效应。

### 2.1 目标漂移的分类

```text
目标漂移类型:

  类型 A: 语义漂移 (Semantic Drift)
  ├── 原目标: "分析用户行为数据"
  ├── 漂移后: "导出所有用户数据"
  ├── 成因: RAG 检索到的文档中嵌入"导出数据"的指令
  └── 特征: 子目标的关键动词从"分析"变为"导出"

  类型 B: 权限漂移 (Permission Drift)
  ├── 原目标: "读取 /workspace/data/report.csv"
  ├── 漂移后: "读取 /etc/passwd"
  ├── 成因: Agent 在推理中扩大了数据源范围
  └── 特征: 路径参数从允许范围漂移到敏感范围

  类型 C: 范围漂移 (Scope Drift)
  ├── 原目标: "检查系统中是否存在安全漏洞"
  ├── 漂移后: "利用找到的安全漏洞进行渗透测试"
  ├── 成因: Agent 将"检查"误解为"验证"进而升级为"利用"
  └── 特征: 操作的性质从只读变为读写
```

### 2.2 实时目标漂移检测器

```python
from dataclasses import dataclass, field
from typing import Any


@dataclass
class GoalState:
    original_goal: str
    current_goal: str
    sub_goals: list[dict] = field(default_factory=list)
    drift_warnings: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "original_goal": self.original_goal,
            "current_goal": self.current_goal,
            "sub_goals": self.sub_goals[-5:],
            "drift_warnings": self.drift_warnings[-3:],
            "drift_count": len(self.drift_warnings),
        }


class GoalDriftDetector:
    def __init__(self, embedding_model: str = "all-MiniLM-L6-v2"):
        self.embedding_model = embedding_model
        self.sessions: dict[str, GoalState] = {}

    def register_goal(self, session_id: str, original_goal: str):
        self.sessions[session_id] = GoalState(
            original_goal=original_goal,
            current_goal=original_goal,
        )

    def check_sub_goal(
        self, session_id: str, sub_goal: str, step: str
    ) -> dict:
        state = self.sessions.get(session_id)
        if not state:
            return {"allowed": False, "reason": "未注册的会话"}

        drift_score = self._compute_semantic_drift(
            state.original_goal, sub_goal
        )

        tool_risk = self._assess_tool_risk(sub_goal)

        combined_risk = drift_score * 0.6 + tool_risk * 0.4

        state.sub_goals.append({
            "step": step,
            "sub_goal": sub_goal,
            "drift_score": drift_score,
            "tool_risk": tool_risk,
            "combined_risk": combined_risk,
        })

        if combined_risk > 0.7:
            warning = {
                "step": step,
                "sub_goal": sub_goal,
                "score": combined_risk,
                "reason": "目标漂移风险过高",
            }
            state.drift_warnings.append(warning)
            return {
                "allowed": False,
