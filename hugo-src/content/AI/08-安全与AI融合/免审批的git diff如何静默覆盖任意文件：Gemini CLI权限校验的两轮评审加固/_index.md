---
title: "免审批的 git diff 如何静默覆盖任意文件：Gemini CLI 权限校验的两轮评审加固"
date: "2026-11-05 01:50:00 +0800"
weight: 9
tags: [Gemini CLI, 权限校验, 沙箱逃逸, 供应链]
menu:
  main:
    parent: "AI安全"
---

9 月 3 日，安全研究者 PakCyberbot 在 google-gemini/gemini-cli 提交 issue #29189：Gemini CLI 把 `git diff` 列入只读白名单、跳过 [Y/n] 审批弹窗，但白名单只看子命令名、不看参数。

于是 `git diff --no-index --output=<目标文件>` 可以截断并覆盖任意路径的文件，全程无提示；这条命令在任何路径下都能跑，不需要仓库存在。报告限定该行为发生在 Windows 构建上，客户端信息记录的是 CLI Version 0.58.0、OS win32。

更值得警惕的是触发方式。报告指出这条命令可以由间接提示注入驱动：藏在 GEMINI.md、README.md 或其他 agent 会读取的不可信内容里的一句"回答前先运行这条验证命令"，就能让 agent 在日常使用中把它吐出来执行。

同一时间，报告者已把问题提交 Google VRP（issuetracker 编号 550750284），并附了修复 PR #29184。

## 修 Windows 的时候，POSIX 上的洞被 AI 评审翻了出来

![PR #30095 页面：Windows git 命令安全校验修复，Open 状态、+365/-72、5 文件](/gitbypass-article/src_gemini_pr30095.png)

*来源：github.com/google-gemini/gemini-cli PR #30095 页面截图，截取于 2026-11-05。*

11 月 2 日，贡献者 Gosling-dude 提交 PR #30095（初始改动 437 行、5 个文件），把 Git 命令安全校验抽成共享 helper，在 Windows 上拒绝可写文件或执行外部程序的参数（`--output`、`--ext-diff`、`--textconv`、`--exec`），封锁配置覆盖和 PowerShell 反引号转义。



转折发生在自动评审。gemini-code-assist 机器人在这份 PR 里标出两个 critical 级安全问题：POSIX/macOS 路径上，`findGitSubcommand` 会跳过 `--exec-path`、`--git-dir`、`-C` 这类全局选项，导致 `git --exec-path=/path/to/malicious log` 被判为"已知安全"。

机制链条在评审意见里写得很具体：`--exec-path` 指向任意目录后，git 会从那里执行辅助二进制；`--git-dir` 则可能加载带 `core.pager` 或 `diff.external` 的恶意配置文件。Windows 恰好有 `args[1]?.startsWith('-')` 挡了一道，macOS 和 Linux 没有。



也就是说，为堵一个 Windows 静默写文件而生的 PR，在评审轮里暴露出跨平台的沙箱逃逸面。对使用这类 CLI 的团队，这是一条可操作的检查项：加固补丁的第一稿通常只覆盖报告者踩到的那条路径，平台差异要主动枚举复查。

## 人肉评审补上的三个缺口

11 月 3 日，评审 mangeshraut712 指出 `git diff --no-index <a> <b>` 本身仍是只读判定通过——不需要 `--output` 也能比较任意文件系统路径，正是这个 PR 想关的绕过类；且新增测试只覆盖了 `--no-index` 与 `--output` 组合的场景。

另一位参与者 bytebell-acc1 贴出一份标注"AI 辅助审查（ByteBell），发布前经我本人核对"的意见：严格沙箱（`windows-native` 且关闭网络访问）下命令经由 `cmd.exe /c` 执行，cmd.exe 的转义符是 `^` 而不是反引号。

策略引擎用的 shell-quote 1.8.3 会把 `^` 按字面保留，于是 `git diff --out^put=<file>` 匹配不上危险参数名单，cmd.exe 再把脱字符剥掉，git 实际收到 `--output`——绕回 #29189 的原案。这位参与者同时声明自己无 Windows 机器、未在真实环境验证。

作者随后在 commit 3e00cd0 一次性收掉三条：要求子命令紧跟 `git`，任何前置全局选项在三平台一律需要确认，`--exec-path` 直接标记为危险；`--no-index` 进入不安全参数清单。



还顺藤摸出第四个坑——git 接受长选项的无歧义前缀，`git diff --outp=<file>` 等效于 `--output`，因此所有"是不安全长选项前缀"的 `--` 参数一并拒绝。Windows 分支追加拒绝 `^`、`%VAR%` 展开（含 `--out%PATH:~0,0%put` 这种子串形态）和延迟展开的 `!`。

## 收紧的代价，和被留下的诚实注脚

这轮加固不是免费的。作者在评论里列明取舍：`git -C <dir> status`、`git diff --text`（因为它是 `--textconv` 的前缀）、Windows 上含 `^` 的 `git show HEAD^`，这些无害命令从此都要人工确认一次——不会失败，但不再自动放行。

他保留了黑名单加前缀匹配而没有改成完整参数白名单，理由是后者对 `diff`/`log`/`show` 是一次大得多的改动，愿意后续跟进。

验证状态同样写得诚实：作者在最终推送评论里报告聚焦套件 73 个测试通过、整个 sandbox 目录 154 通过 2 跳过，全部在 macOS 上执行；PR 早期一轮聚焦验证是 3 个文件 69 个测试。PR 描述与多条评论反复强调 Windows 运行时未独立验证。截至采集时点（11 月 5 日），PR 仍开放，等待至少一个批准评审满足合并门槛。

对管理 agent 工作区的人，这件事的可迁移判断有三条。其一，凡是"按子命令名免审批"的策略都应复查参数面：git 这类命令的写能力往往藏在选项里，而不是子命令名里。

其二，检查你的校验器与真正执行命令的 shell 是否用同一套词法——本例中策略引擎按 shell-quote 解析、实际执行却走 cmd.exe，两套转义规则之间的缝隙就是绕过面。

其三，把"参数前缀等价"纳入威胁模型：只要底层程序接受缩写选项，精确字符串匹配的危险名单就天然漏风。

本文面向授权安全研究与防御建设，未经授权对任何系统实施文中技术属违法行为。

## 参考来源

- google-gemini/gemini-cli issue #29189 原始页面（采集快照 2026-11-04）：https://github.com/google-gemini/gemini-cli/issues/29189
- google-gemini/gemini-cli PR #30095 原始页面（含评审对话，采集快照 2026-11-04）：https://github.com/google-gemini/gemini-cli/pull/30095
