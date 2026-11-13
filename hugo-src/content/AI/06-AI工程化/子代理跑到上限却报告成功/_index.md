---
title: "子代理跑到上限却报告成功"
date: "2026-11-13 23:00:00 +0800"
weight: 9
tags: ['AI', '子代理', 'Agent可靠性']
menu:
  main:
    parent: "06-AI工程化"
---
2026 年 3 月 13 日，一位开发者在 Gemini CLI 里让主 agent 调查两个本地仓库（t3code 和 superset）的架构。主 agent 调用了 `codebase_investigator` 子代理，objective 写得很具体：t3code 里 Codex 怎么集成、superset 有哪几套 agent harness、两者有什么可复用的共同模式。

会话日志里，这次调用的返回是 `status: "success"`，`Termination Reason: "GOAL"`。

同一段返回文本里还写着：调查因为「maximum turns exceeded」被系统强制终止，而且是在任何具体任务被识别或启动之前。`RelevantLocations` 是一个空数组。

什么都没查，状态是成功。

![google-gemini/gemini-cli issue #22323 页面截图](/skill-article/A-subagent-false-success/src_i22323.png)
*来源：GitHub google-gemini/gemini-cli issue #22323 页面，github.com，截取日期 2026-11-13*

## 两条元数据互相矛盾

issue #22323 的标题就是这件事：Subagent recovery after MAX_TURNS is reported as GOAL success, hiding interruption。报告者列了两点：子代理在真正开始分析前就耗尽了轮次预算；终止元数据自相矛盾——父级工具调用显示成功加 GOAL，内嵌载荷却描述「因限制而提前终止、无任何发现」。

这条 issue 带 priority/p1、area/agent 标签，当前状态 `status/need-retesting`。创建于 2026-03-13，最后一次更新是 2026-10-26，也就是至少存在了七个多月，仍未确认修复。

## 误报成功比报错贵

上层编排读的是 status。成功就往下走，不重试、不告警、不记录缺口。于是链条变成：花掉子代理的完整上下文和轮次，拿回空结果，上层以为这步做完了，后面所有基于「已调查」的输出全是空的。

人盯着屏幕时能发现异常，因为答案明显空洞。但自动化流水线里没人看中间结果，误报成功会被当成事实往下传一层，再往下传一层。

对比同仓库的 #21409：generalist agent 被调用后永久挂起，报告者说简单如建文件夹也挂，最多等过一小时才取消；一位评论者说自己等了 16 小时。挂起至少是可见的失败，进程不动，你能杀。误报成功是静默失败，只有产出对不上时才会暴露。

#21409 的报告者给了一个可操作绕法：明确指示模型不要交给子代理，任务立刻完成。另一位评论者说 0.34.0-nightly 已修好。这些都是用户侧陈述，仓库状态仍是 open。

## 有人已经在提机制层的解法

Qwen Code 的 #16941 提案把「编辑 → 跑受影响的检查 → 把失败反馈回去 → 有界重试」做成回合级机制，验证步骤交给一个只有干净上下文的子代理：新会话，只读 diff 和失败输出，不读自己的推理过程。

提案给了三条依据。Cognition 的 Devin Review 作为独立上下文，在 agent 写的 PR 里平均每个抓到 2 个 bug，约 58% 属严重级；NYU/Princeton/Stanford 的论文（arXiv:2611.01181）结论是同一上下文里自查抓不到自己的缺陷；执行反馈修复在 5 次尝试内把通过率抬高 4.9 到 17 个百分点（arXiv:2604.10508）。这些是提案作者引用的研究与产品数据，本文没有复核。

提案还点出一个容易忽略的现状：Qwen Code 里验证只存在于 skill 和工作流（/bugfix、/review、e2e-testing、test-engineer 代理），属于流程而非机制。流程靠模型记得走，机制不靠记性。

## 现在能做的判断

如果你在流水线里跑子代理，别把 status 当唯一验收。至少看三件事：返回体里有没有实际产物（文件路径、符号名、查询结果）；有没有与「成功」矛盾的措辞（interrupted、limit、no findings）；这一步的产出能不能被下一步直接消费。

更稳的做法是把验证从执行者手里拿走：另起一个只读上下文，只给它 diff 和失败输出。这不需要换更强的模型，只需要别让同一个上下文既干活又判卷。

## 本文的资料依据与局限

事实来自三份公开材料：Gemini CLI 仓库的 #22323 与 #21409 issue 正文，以及 Qwen Code #16941 提案正文，均于 2026-11-13 原生采集。采集快照只覆盖 #22323 正文与少量时间线，评论区未完整覆盖；#22323 是否已在后续版本修复，以仓库当前状态为准，本文未验证。#16941 中引用的论文与产品数据未经本文复核。

## 参考来源

- google-gemini/gemini-cli issue #22323《Subagent recovery after MAX_TURNS is reported as GOAL success, hiding interruption》（采集日期 2026-11-13）
- google-gemini/gemini-cli issue #21409《Generalist agent hangs》（采集日期 2026-11-13）
- QwenLM/qwen-code issue #16941《feat(core): a verify-then-repair loop with a clean-context verifier》（采集日期 2026-11-13）