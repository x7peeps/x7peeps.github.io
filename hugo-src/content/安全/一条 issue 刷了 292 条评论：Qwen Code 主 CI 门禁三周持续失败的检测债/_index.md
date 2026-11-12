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

这条 issue 累计 292 条评论，成为该项目讨论量最高的单一问题。

![QwenLM/qwen-code issue #14724 页面截图](/skill-article/D-qwen-ci-gate/src_i14724.png)
*来源：GitHub QwenLM/qwen-code issue #14724 页面，github.com，截取日期 2026-11-12*

## 失败长什么样

从 issue 时间线里的最新机器人评论（2026-11-11）看，Managed Agent gate 在 run 43067633579（commit fce284b73bf）再次失败，失败任务包括 HostedShellLifecycleRecoveryIT.publicDeletionRecoversOriginalResources（4 个参数化用例）、HostedWorkspaceToolTurnIT.malformedShellUnicodeIsCorrectableBeforeAcquisition、HostedPublicWorkspaceIT.publicShellV2DeletionTriggersCollectionWithoutRetirementSeams 等——覆盖托管进程生命周期恢复、故障注入门、工作区删除回收等核心托管能力。

标题里"no test identified"值得注意：门禁的汇总步骤"Report the tier result"失败时甚至无法归因到具体测试，这说明失败不只是测试挂了，还涉及门禁自身的报告链路。issue 的标签历史也反映了处置过程：

从 autofix/approved（维护者批准自动修复）到 autofix/in-progress（自动修复代理已认领），最终变成 autofix/skip——自动修复机制放弃认领这条 issue，说明它超出了自动修复代理的能力范围。

## 这条 issue 折射的三个工程信号

第一个信号是门禁自身的可观测性缺口。一条三周持续失败、且经常"无法识别失败测试"的门禁，等于失去了阻断坏代码的能力：失败常态化之后，团队与贡献者都会习惯性忽略红灯，门禁从质量防线退化为背景噪音。

检测工程上的对应原则是——告警必须可归因，不可归因的持续失败要当基础设施 bug 优先修，而不是当测试抖动容忍。

第二个信号是托管集成测试的环境脆弱性。失败的测试集中在 Hosted 进程、Spring、MySQL 的组合上，这类多进程集成测试对时序、资源、并发敏感，抖动率天然高。

项目方同期在建立 CI Failure Patrol 与 autofix 机制（雷达 11-11 日报记录的 #16863、#16853），本质是用"自动分诊"对抗"抖动淹没信号"。

第三个信号是自动化修复的边界。这条 issue 从 approved 到 in-progress 再到 skip 的标签轨迹，是一次公开的负结果：维护者曾批准让自动修复代理处理它，代理认领后放弃。

对建设 AI 辅助修复管道的团队，这是有价值的数据点——门禁归因类问题（失败原因不在 diff 里）是当前自动修复的明确弱区。

## 使用者与贡献者需要知道的事

对使用者：Managed Agent 相关功能（托管会话、渠道投递）是这条门禁覆盖的范围，主分支该区域的三周不稳定意味着升级到最新 main 或近几版时，托管功能应多一轮验证，生产环境建议跟稳定 release 而不是追 main。

对贡献者：PR 会被这条门禁的随机红灯卡住，遇到 Managed Agent gate 失败先查 #14724 是否已有同日失败记录，再决定重跑还是等待，避免为环境抖动白白改代码。

## 本文的资料依据与局限

本文事实全部来自 issue #14724 的机器人评论与标签轨迹，以及 2026-11-11 雷达日报对该项目 CI 状况的汇总。

292 条评论中维护者的人工根因结论截至采集时未见，本文对成因的分析（环境脆弱性、门禁报告链路缺陷）是基于失败测试类型与标签轨迹的推断。11 月 12 日的最新状态为 open。

本文面向授权安全研究与防御建设，未经授权对任何系统实施文中技术属违法行为。

## 参考来源

- QwenLM/qwen-code issue #14724《Main CI failed: Managed Agent gate — no test identified》(latest: 2026-11-12)（采集日期 2026-11-12）
- big-model-radar ai-cli 日报 2026-11-11（本地文件 ~/.hermes/cron/data/big-model-radar/2026-11-11/ai-cli.md）
