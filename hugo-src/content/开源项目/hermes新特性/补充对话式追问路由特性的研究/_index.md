---
title: "补充对话式追问路由特性的研究"
weight: 9
tags: ["Hermes", "消息路由", "开源贡献", "PR研究"]
menu:
  main:
    parent: "开源项目"
---

> **PR 地址**：[NousResearch/hermes-agent#47043](https://github.com/NousResearch/hermes-agent/pull/47043) · 基于上下文回复检测的对话式追问路由

## 研究摘要

在 IM 平台上，用户针对 agent 某条消息做"回复"（追问、修正、补充）是高频交互：agent 列了一个方案清单，用户回复其中一条"第三项换个做法"。此前 Hermes 网关把这类回复合并进单槽 `_pending_messages` 文本，与普通消息混在一起——会话正忙或消息排队时，追问与主文本混淆，agent 无法识别"这是针对哪条消息的回应"，上下文就此错位。本研究向 Hermes 上游补充了**对话式追问路由**：检测到用户回复的是 agent 自己的消息时，把追问标记为上下文相关的后续消息（`_is_contextual_followup`），路由到 `_queued_events` FIFO 溢出队列独立处理，不再与单槽文本合并。改动规模 +56/-1，仅 2 个文件，无需任何配置变更。

## 一、问题背景：回复语义在合并中丢失

### 1.1 单槽合并模型的信息损失

网关对活跃会话的待处理消息采用单槽 `_pending_messages` 文本承载：新消息到达时合并进同一块文本。这个模型对"顺序到达的独立消息"够用，但对"针对某条消息的回复"会丢失关键信息——回复的**指向性**（回复的是 agent 的第几条消息）被抹平成一串文本，agent 只能靠猜测还原语义。

### 1.2 会话繁忙时的问题放大

会话正忙（agent 正在生成回复）时，追问到达被合并进待处理文本，与生成期间到达的其他消息混杂。等 agent 处理时，追问与其目标消息的关联已不可恢复：用户问"第三项呢"，agent 看到的是混入多轮内容的文本块，无法定位"第三项"指哪条。追问越是精准，合并模型的损失越大。

## 二、特性设计：识别指向性，路由到独立队列

### 2.1 消息事件的上下文标志

`gateway/platforms/base.py` 为 MessageEvent 数据类新增 `_is_contextual_followup: bool = False` 字段。这个标志是后续路由决策的依据：普通消息保持 False，走既有路径；被判定为追问的消息置 True，走独立路径。新增字段默认 False，保证既有消息构造路径零改动。

### 2.2 三段式识别与解析

`gateway/run.py` 新增三组状态与三个辅助方法：

- 状态：`_sent_message_ids` 集合（记录 agent 已发送的消息 ID）与 `_message_context_map` 字典（消息 ID → 上下文键）；
- `_is_our_bot_message`：判定用户回复的目标是否属于 agent 自己发送的消息；
- `_resolve_reply_context`：解析回复指向的具体消息及其上下文；
- `_build_context_key`：为消息构建可比较的上下文键，用于关联匹配。

识别逻辑接入 `_handle_active_session_busy_message`：会话忙碌路径上，先判断到达消息是否为对 agent 消息的回复，命中则走追问路由，而不是直接合并进单槽文本。

### 2.3 路由去向：FIFO 溢出队列

命中判定后的追问被路由到 `_queued_events`（FIFO 溢出队列），与 `_pending_messages` 单槽文本分离。FIFO 语义保证追问按到达顺序处理、不与其他文本合并，指向性信息得以保留到处理时刻。顺带修复了合并参数：`merge_text=True` 改为 `merge_text=False`，从根源上停止追问与主文本的合并行为。

### 2.4 零配置变更

PR 明确声明无需配置变更：识别与路由是行为层改进，不引入新开关。用户升级后直接获得更准确的追问处理，这是这类修复最友好的形态——正确性提升不以配置负担为代价。

## 三、实测结果

PR body 记录的回归测试数据：

| 测试套件 | 结果 |
|---|---|
| tests/test_hermes_state.py | 267 passed |
| tests/test_lazy_session_regressions.py + tests/honcho_plugin/test_session.py | 135 passed |
| 合计 | 402 passed |

回归测试全部通过，确认路由改动未破坏既有会话状态机与懒加载会话的行为。追问路由在真实平台回复链路上的端到端表现未在 PR body 中记录独立验证数据。

## 四、能力边界

- 识别依赖平台转发"回复"关系（引用/回复目标消息 ID）：平台不转发回复语义时，追问无法被识别，退回合并路径；
- 路由到 FIFO 队列后仍存在排队延迟，繁忙会话中追问不会插队；
- 识别只覆盖"回复 agent 自己的消息"这一形态，回复第三方消息、回复系统消息等场景不在本次范围内；
- 合并行为修复（merge_text 参数）改变了既有的消息合并语义，依赖旧合并行为的下游逻辑需要回归验证（测试已覆盖主路径）；
- 改动集中在网关活跃会话路径，非活跃会话的追问处理不在本次范围。

## 五、PR 信息

- **PR 地址**：https://github.com/NousResearch/hermes-agent/pull/47043
- **改动规模**：+56 / -1，2 个文件（gateway/platforms/base.py +7，gateway/run.py +49/-1）
- **状态**：closed
- **提交时间**：2026-06-16

---

*本文记录 x7peeps 向 Hermes Agent 上游贡献的特性研究，所有数据来自 PR 实测记录。*
