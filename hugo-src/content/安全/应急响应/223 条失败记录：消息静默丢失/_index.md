---
title: "223 条失败记录：消息静默丢失"
date: "2026-11-13 23:00:00 +0800"
weight: 9
tags: ['蓝队', '可靠性', '可观测性']
menu:
  main:
    parent: "应急响应"
---
一个 OpenClaw 实例的 Telegram 外发队列里，223 条历史失败记录，`lastError` 全是同一句：`Network request for 'sendMessage' failed!`。耗时全部落在 7.4 到 9.3 秒之间，`retry_count` 等于 1，`recovery_state` 停在 `send_attempt_started`，然后永久 `failed`。

一次尝试，就算完。

![openclaw/openclaw issue #125764 页面截图](/skill-article/D-message-loss-deadletter/src_i125764.png)
*来源：GitHub openclaw/openclaw issue #125764 页面，github.com，截取日期 2026-11-13*

## 文档承诺的重试没有发生

issue #125764 的描述里写得很清楚：在网络层失败时，消息被单次尝试后永久死信，没有实际重试，没有用户可见错误，没有告警。而文档（`docs/tools/subagents.md` 的 Announce 一节）承诺的是「queue routing，随后对 announce 做一小段指数退避重试，再最终放弃」。

失败载荷里装的是完整的助手回复。子代理完成通知（`sessions_spawn` 的 announce，后续 agent 调用 `deliver=true`）是一次性投递：投递失败，就没有第二次机会。用户在 gateway 日志里只能看到一条 `[warn]`，连「正在输入」都不会出现——内部来源的轮次把 typing 抑制了。

耗时 7.4 到 9.3 秒这个区间也值得记：它不是毫秒级的连接拒绝，是超时型失败。超时意味着对端状态未知，而这恰好是最需要重试和对账的一类。

## 未知状态没有人对账

同一 issue 下的自动审查给出一条关键结论：Telegram 出站适配器声明了持久的文本与媒体投递能力，但既不声明也不实现 `reconcileUnknownSend`，所以它无法判断一次含糊的发送到底有没有送达 Telegram。

这是分布式投递的老问题：结果有三态，成功、失败、未知。没有对账机制，「未知」只能按失败处理；按失败处理又不敢重发（怕重复），最后的选择就是丢弃。

## 长回合丢的是另一层

#144809 记录的是另一条路径。版本 2026.9.4，claude-cli 后端，单个窗口 2 小时 40 分、29 个 CLI 回合、3 次失败。

最长成功回合 372975 毫秒（约 6.2 分钟）；失败的两次分别是 478703 毫秒（产出 5490 字节）和 962803 毫秒（产出 3986 字节）。错误是 `Reply operation has no active tool authority snapshot`。工作在，文本没了。

报告者特意补了第三例：一个 42 秒的回合以同样方式失败。他不认为是单一原因，这一点值得注意——如果只按「长回合超时」去修，42 秒那一例会被漏掉。他也说明这条与 #141252、#139847 的忙碌会话排队路径不同：这里没有排队，也没有第二条消息发出。

## 运维该加的四个观测

第一，把投递结果分三态落库：success、failed、unknown。unknown 必须进对账任务，不能直接进死信。

第二，给 `deliver=true` 的完成通知单列一条链路和确认机制。它没有第二次机会，就不该和其他消息共用「失败即丢」的策略。

第三，看分布而不是看总数。失败耗时集中在 7 到 9 秒是超时型，几毫秒内失败是连接拒绝，两种病对应两种修法；`retry_count` 恒等于 1，就是「重试根本没生效」的直接证据。

第四，长回合先落盘再投递。输出字节数已经产生，丢的只是投递环节——把内容留在本地，至少还能补发。

## 本文的资料依据与局限

事实来自 openclaw/openclaw 的 issue #125764 与 #144809（2026-11-13 原生采集）。#125764 的 223 条记录是报告者在自己实例上的统计，不是官方指标；#144809 的耗时数据来自单个窗口的日志。两条 issue 均为 open，采集到的正文中没有维护者的根因结论，本文不对代码实现下判断。#125764 的分析部分引用了仓库自动审查机器人的意见，该意见标注为未验证的推理，本文按「审查意见」而非「官方结论」处理。

## 参考来源

- openclaw/openclaw issue #125764《Telegram adapter: network-failed outbound sends dead-lettered after a single attempt》（采集日期 2026-11-13）
- openclaw/openclaw issue #144809（2026.9.4 长回合回复被丢弃的报告，采集日期 2026-11-13）