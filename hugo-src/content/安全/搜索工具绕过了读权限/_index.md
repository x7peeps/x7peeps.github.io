---
title: "搜索工具绕过了读权限"
date: "2026-11-13 23:00:00 +0800"
weight: 9
tags: ['漏洞研究', '权限模型', 'AI编码工具']
menu:
  main:
    parent: "安全"
---
2026 年 11 月 8 日，Qwen Code 仓库收到一个 PR，标题是 fix: enforce Read deny rules on grep and glob results。它修的是 issue #15129——仓库里的审查者在评论中把它称作「一个真实的、已复现的 P1 安全 bug」。

![QwenLM/qwen-code pull request #16653 页面截图](/skill-article/B-qwen-readdeny-bypass/src_p16653.png)
*来源：GitHub QwenLM/qwen-code PR #16653 页面，github.com，截取日期 2026-11-13*

## 缺口在哪

Qwen Code 的读权限由 Read(...) 规则管理，比如 `Read(./secret.env)` 设为 deny，模型就不该读到这个文件。

旧实现里，传统的 grep/glob 路径会做路径过滤，但默认配置的 `RipGrepTool` 走另一条代码路径，把搜索结果直接返回给模型，没有经过同一套规则。PR 描述的原话是：默认的 ripgrep 工具仍可能返回被读权限规则覆盖的路径，而旧的 grep/glob 会过滤掉它们。

还有一层更隐蔽：ask 规则。如果某条读规则要求确认，那么无人值守的搜索结果里同样不能出现——把路径和内容放进搜索结果，等于绕过那次确认。PR 明确把 ask 也纳入了排除范围。

## 验证是怎么做的

参与审查的模型用真实组件做了一轮对照：真实 `PermissionManager`（`initialize()` 后解析相对规则 `Read(./secret.env)`）、真实 ripgrep 二进制、真实文件系统，驱动三个工具。

结果是：base 臂 14 格全部按预期泄漏；head 臂 14 格里 12 格按预期完成过滤。deny 与 ask 都会把路径从 `llmContent` 和 `resultFilePaths` 中移除；只配 `Write(...)` 的 deny 与「不配 PM」两格，两臂读数完全相同，说明没有过度拦截。改动文件的 144 个测试通过；把 `grep.ts` 和 `glob.ts` 单独回退到合并基，两个新增回归测试立刻变红（2 failed | 133 skipped）。

这组数据的意义在于测了什么：权限过滤有两条出口，一条是给模型看的文本（`llmContent`），一条是结构化结果里的路径集合（`resultFilePaths`）。只验证「denied 内容没出现在文本里」，会漏掉第二条。ask 规则也容易被漏掉，因为它看起来不像 deny 那么严重，而实际后果是跳过用户确认。

## 修复自己带了一个新坑

审查中有人只读代码就发现：glob 的 deny 过滤跑在 1000 条收集上限之后，而空结果分支没有读 `hitCollectionLimit`。于是当匹配结果触达上限、且这些条目全部被权限过滤掉时，工具返回 `No files found`，而不是「结果被截断」。

在 Read-deny 场景下这恰恰是常见形态。被 deny 的目录通常正是文件最多的那个——vendor、类 node_modules 目录、含大量文件的 secrets 目录。模型于是得到一个很自信的「没有文件」，而实际是「有一千个文件、全被过滤了」。

这是安全修复常见的副作用：拦截正确了，可观测性掉了。对 agent 来说，「不存在」和「被隐藏」是两种完全不同的世界，前一个会让它换方案，后一个应该让它停下来报告权限问题。

## 使用者与建设者该看什么

用的人：如果 agent 在某个仓库里突然说找不到 `src/`，先确认有没有配过 Read deny 或 ask 规则，再看版本是否包含这个 PR。目录明明存在却被报成不存在，是过滤器与截断顺序的典型症状。

建设的人：权限过滤要在截断之前；ask 要和 deny 同等对待；文本出口和结构化路径出口都要测；测试要覆盖 glob 形态（`Read(./secrets/**)`、`Read(**/*.env)`），而不只是字面路径——issue #15129 只测了字面路径，PR 的审查意见里明确点出了这一点。

做检测的人：把工具返回的路径集合与磁盘实际集合做差集，是发现过滤器失效最直接的办法。差集为零不代表安全，但差集异常大就是信号。

本文面向授权安全研究与防御建设，未经授权对任何系统实施文中技术属违法行为。

## 本文的资料依据与局限

事实来自 QwenLM/qwen-code 的 PR #16653 页面（2026-11-13 原生采集），包括 PR 描述、机器人审查摘要与两轮参与审查的模型意见。PR 当前状态为 open，未合并；文中「12 格按预期过滤」等数字来自审查者在特定 head 提交上的运行结果，换版本或换规则可能不同。issue #15129 的原始页面本文未单独采集，引用的是 PR 与审查意见中对它的描述。

## 参考来源

- QwenLM/qwen-code pull request #16653《fix: enforce Read deny rules on grep and glob results》（采集日期 2026-11-13）