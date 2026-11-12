---
title: "一条 issue 刷了 292 条评论：Qwen Code 主 CI 门禁三周持续失败的检测债"
date: "2026-11-12 23:50:00 +0800"
weight: 9
tags: ['蓝队', 'CI安全', '检测工程']
menu:
  main:
    parent: "安全"
---

QwenLM/qwen-code 的 issue #14724 由官方机器人 qwen-code-dev-bot 于 2026 年 10 月 19 日创建，标题是"Main CI failed: Managed Agent gate — no test identified"，截至 2026 年 11 月 12 日仍处于 open 状态，最新更新时间就是 11 月 12 日。

据 big-model-radar 11 月 11 日 ai-cli 日报统计，这条 issue 累计已有 292 条评论（该数字来自雷达日报的统计口径，issue 页面快照本身不显示评论总数）。

![QwenLM/qwen-code issue #14724 页面截图](\/skill-article\/D-qwen-ci-gate/src_i14724.png)
*来源：GitHub QwenLM/qwen-code issue #14724 页面，github.com，截取日期 2026-11-12*

## 失败长什么样

从 issue 时间线里的最新机器人评论（2026-11-11）看，Managed Agent gate 在 run 43067633579（commit fce284b73bf）再次失败，失败任务包括 HostedShellLifecycleRecoveryIT.publicDeletionRecoversOriginalResources（4 个参数化用例）、HostedWorkspaceToolTurnIT.malformedShellUnicodeIsCorrectableBeforeAcquisition、HostedPublicWorkspaceIT.publicShellV2DeletionTriggersCollectionWithoutRetirementSeams 等——覆盖托管进程生命周期恢复、故障注入门、工作区删除回收等核心托管能力。

标题里"no test identified"值得注意：

门禁的汇总步骤"Report the tier result"失败时甚至无法归因到具体测试，这说明失败不只是测试挂了，还涉及门禁自身的报告链路。

issue 的标签历史也反映了处置过程：

从 autofix/approved（维护者批准自动修复）到 autofix/in-progress（自动修复代理已认领），最终变成 autofix/skip——但 skip 的理由不是修不动：代理的撤回声明写明"issue 已在 main 上修复，无需任何代码改动"，skip 是判定无需改码。

## 自动修复代理给出的答案

这条 issue 里最有信息量的评论来自自动修复代理的撤回声明。它没有改任何代码，而是给出了归因证据：

报障的那次失败运行（run 39216292294）发生在 PR #14682 分支头部提交 71ef2793ee 上；

修复它的是两个已合入 main 的提交——81e83de6b6 修好了两个 Spring 崩溃门测试（一个不再等待可能被 kill 中断的模型 Turn，另一个修复了第二个 Spring 子进程未宣告主子进程 session-store 地址导致的 409 拒载），c3dcd5a83f 修好了 writer lease 中断问题（超过 15 秒 lease 的中断会让 Hosted Session 永久不可写，append 结果未知的成员命令被错误地答复为拒绝）。

代理在本地按 CI 参数复跑，三个测试在当前 HEAD 全部通过，两个修复提交是 HEAD 的祖先、但不是报障那次 CI 所在提交的祖先——也就是那次失败跑在修复合入之前的分支代码上，无需再改码。

这个结论修正了两个容易产生的误读。其一，"issue 还开着"不等于"问题还没修"：

这条 issue 的标题带着 latest 时间戳，机器人持续把门禁的新失败追加进来，十月的三个测试修好了，十一月又在别的测试上红（如 11 月 11 日 run 43067633579 失败于 HostedShellLifecycleRecoveryIT 等生命恢复与删除回收类用例）。

其二，自动修复代理这次的表现是个正结果：它做到了提交级的归因、做了祖先关系检查、复跑了测试，然后诚实地撤回了修复尝试——比很多人工分诊更严谨。

## 检测工程上真正值得记的两点

第一，单条滚动登记的告警 issue 会把"已修复"与"新失败"混在一起。

三周的评论记录里既有已解决的历史根因也有待查的新失败，后来者很难分辨红灯当前对应哪个问题。

门禁告警按失败类别分单、修复后关闭旧单，比一条 issue 记流水账可维护得多。

第二，"失败运行所在提交"是归因的关键输入。这次代理能下结论，靠的是确认失败 CI 跑的是修复合入前的代码；

如果只看"main 是红的"这个表面状态，就会误判成回归。做 CI 门禁时保留失败运行对应的 commit，是让这类归因可复现的前提。

## 使用者与贡献者需要知道的事

对使用者：

Managed Agent 相关功能（托管会话、渠道投递）是这条门禁覆盖的范围，主分支该区域的三周不稳定意味着升级到最新 main 或近几版时，托管功能应多一轮验证，生产环境建议跟稳定 release 而不是追 main。

对贡献者：PR 会被这条门禁的随机红灯卡住，遇到 Managed Agent gate 失败先查 #14724 是否已有同日失败记录，再决定重跑还是等待，避免为环境抖动白白改代码。

## 本文的资料依据与局限

本文事实全部来自 issue #14724 的机器人评论与标签轨迹，以及 2026-11-11 雷达日报对该项目 CI 状况的汇总。

评论记录中维护者的人工根因结论截至采集时未见，本文对门禁治理的分析（滚动登记的混杂、失败提交归因）基于 issue 内自动修复代理的撤回声明与机器人评论记录。11 月 12 日的最新状态为 open。

## 参考来源

- QwenLM/qwen-code issue #14724《Main CI failed: Managed Agent gate — no test identified》(latest: 2026-11-12)（采集日期 2026-11-12）
- big-model-radar ai-cli 日报 2026-11-11（本项目内部雷达采集产物，292 条评论统计出处）
