---
title: "一条 fork PR 如何偷走 CI 密钥：workflow_run 信任判定该怎么画"
date: "2026-11-10 01:14:59 +0800"
weight: 9
tags: [安全, 供应链安全, GitHub Actions, CI]
menu:
  main:
    parent: "安全"
---
GitHub Actions 里有一类设计，代码本身看不出问题，但组合起来就是一条完整的密钥外泄路径：第一个 workflow 在 PR 上跑，把结果打包成 artifact 上传；第二个 workflow 由 `workflow_run` 事件触发，在主仓库上下文里拿到密钥，再把 artifact 里的代码 checkout 出来执行。

这两段拼起来，就等于把 fork 分支的代码放进了带密钥的 runner 里。

Gemini CLI 仓库在 11 月初正好经历了这样一次处置：先有人提交了一个"无害的"演示 PR 来验证这条路径确实成立，随后仓库把这个洞堵上了，堵法本身值得任何用 `workflow_run` 的人抄一遍。

## 演示 PR：把构建脚本换成 echo

提交者是 AkheelQi，PR 编号 #30066，标题写得很直白："ci: inert canary in package.json scripts (security PoC - do not merge)"。

按 PR 自己的描述，它把 `package.json` 里的 `build` 和两个 `test:integration:sandbox:*` 脚本换成了 `echo CHAINED-E2E-CANARY-*`。

目的是让 `Trigger E2E` → `Chained E2E` 这条链路把 fork 分支的代码 checkout 到自托管 runner 上执行。它强调这套改动是惰性的——不碰密钥、不发网络请求，只输出 canary 字符串，跑完拿日志就关闭。

PR 描述里写明这是给 Google OSS VRP（漏洞赏金计划）用的证明材料，目标是"报告随后提交"。仓库的机器人也确认了这一点：`gemini-code-assist` 的自动评审说，这个 PR 通过把标准构建和集成测试脚本替换成 echo 命令，让改动失效，从而破坏 CI 流水线、阻止正确性验证——同时补充了一句"由于 PR 范围有限，安全评审被跳过"。

真正有信息量的是自动评审漏掉的那部分：它把这次改动读成了"破坏构建的脚本篡改"，而提交者写的是"验证 runner 行为的安全 PoC"。同一个 diff，两种读法——而危险的那一种（fork 代码在带密钥的 runner 上执行）恰恰没被自动评审覆盖。

PR 至今仍是 open 状态，仓库在 11 月 8 日评论说如果 7 天内没有拿到 `help wanted` 标记就会关闭。

## 真正的修复：把信任判定挪到事件字段上

真正的修复是 #30090，标题 "ci(chained_e2e): don't expose GEMINI_API_KEY to fork-controlled code"，作者 oflavioc，11 月 2 日提交，11 月 9 日更新为已合并。

它先解释了原本的工作方式：`chained_e2e.yml` 由 `trigger_e2e.yml` 在 PR 上跑完之后通过 `workflow_run` 触发，它在主仓库上下文里执行、持有密钥，并通过前一个 run 上传的 artifact 把 PR 的代码 checkout 出来。

修复的核心思路只有一句：信任判定要基于事件字段，不能基于 artifact 内容。改动清单里写得很具体。

第一，`download_repo_name` 这个 job 只有在两个条件同时成立时才运行：触发它的 run 的 `conclusion == 'success'`，并且 `github.event.workflow_run.head_repository.full_name == github.repository`。

PR 里特别标注了这一点："trustworthy event fields, not artifact contents"。

第二，`parse_run_context` 导出一个 `trusted` 输出。对 `workflow_run` 事件来说，只要 `download_repo_name` 没成功，或者 artifact 里的 `repo_name`、`head_sha` 两个字段有一个缺失，`trusted` 就是 `false`。

下游的 `set_pending_status`、三端 e2e（linux / mac / windows）、`evals`、汇总的 `e2e` 以及 `set_workflow_status` 这些 job 全部以 `trusted == 'true'` 为前置条件。

第三，去掉了 SHA 解析里 `github.event.workflow_run.head_sha` 的兜底分支。PR 的措辞是"no silent fallback to an unverified sha"——宁可拿不到 sha，也不在验证失败时悄悄换一个来源。

第四，`GEMINI_API_KEY` 在四个测试/eval 步骤上的传递条件被收紧：只有当 `parse_run_context.outputs.repository == github.repository`，并且事件不是 `workflow_run`、或者触发它的 run 的 `head_repository.full_name` 确实等于本仓库时才传；否则步骤拿到的是空值。

效果是：fork PR 的 `workflow_run` 事件带着 fork 的 `head_repository`，`download_repo_name` 被跳过，`trusted` 为 `false`，带密钥的 job 全部被跳过，fork commit 上也不会再出现 chained-E2E 状态。

![GitHub Gemini CLI PR #30090 页面，说明对 fork PR 跳过带密钥 job 的行为变更](images/src_gemini_pr30090.png)

*图：github/google-gemini/gemini-cli PR #30090 页面（已合并），截取日期：2026-11-10。*

## 这个修复是有代价的，PR 自己写明了

安全修复通常不是免费的，这一份也一样。PR 里专门有一节"Behavior for pull requests from forks"：fork PR 不再自动获得 chained E2E 覆盖。

作者把原因写得很清楚——那个"在 fork checkout 出来的代码上自动跑、并且带着密钥"的流程，正是这次要关掉的东西。

他同时给了替代路径：维护者仍可以通过既有的 `workflow_dispatch` 为指定的 fork commit 手动跑 E2E。如果确实想让 fork PR 恢复自动 E2E，后续方案是在 e2e job 上加一个需要 reviewer 审批的 Environment，就像 `eval-pr.yml` 里的 `eval-gate` 那样。

这条补充对任何要做同样改造的团队都有直接价值：密钥门控不是唯一的开关，"谁来批准这次运行"是一个配套的、必须显式设计的开关。

## 另一类失效：本地命令的权限白名单

同一批 PR 里还有 #30095，作者 Gosling-dude，标题是"fix a Windows Git command safety bypass"，它明确声明关闭了 issue #29189。

这一类和上面那类不是同一个问题：#30090 处理的是 workflow_run 的来源信任判定，这一处处理的是本地命令权限判定——只读白名单只认子命令名、不认参数。两处共同的教训是"判定依据要落在不可被输入方控制的信息上"：一处的输入方是 artifact 上传者，一处的输入方是命令行参数。

这份 PR 摘要里列出的拒绝项是一份很好的排查清单：能写文件或执行外部命令的危险 Git 参数，包括 `--output`、`--ext-diff`、`--textconv`、`--exec`；Git 配置覆盖和不安全的全局选项；以及 Git 参数里的 PowerShell 反引号转义字符。

改动方式是把 Git 命令安全校验抽成可复用的 helper，在 Windows 上应用一致的只读判定，并补上覆盖安全命令、危险参数和沙箱管理器集成的测试。

顺带说清楚 #29189 本身。issue 报告的问题是：Gemini CLI 把 `git diff` 当作只读命令放进白名单、跳过 `[Y/n]` 权限提示，而白名单只检查子命令名、不检查参数。

于是 `git diff --no-index --output=<path>` 可以在任意路径上截断或覆盖目标文件，且完全不提示。issue 里给出的触发方式包含间接提示注入——把指令写进 `GEMINI.md`、`README.md` 这类 agent 会读取的不受信内容。

## 落到自己的仓库上要查什么

如果你的仓库里有 `workflow_run` 触发的 workflow，可以按这几条自查：

1. **带密钥的 job 是否会 checkout 外部来源的代码**。尤其是通过 artifact 传递的那条路径——artifact 内容是上传方可控的。

2. **信任判定用的是事件字段还是文件内容**。`head_repository.full_name`、`conclusion` 这类字段来自 GitHub 的事件载荷，攻击者改不了；artifact 里的 JSON 字段可以由上传方写。PR 里的注释"trustworthy event fields, not artifact contents"就是这条判断标准。

3. **SHA 解析有没有静默兜底**。一旦出现"验证失败就退回用事件里的 sha"，验证就形同虚设。

4. **密钥的传递条件是不是独立判断**。不要依赖上游 job "已经跳过了"这种间接保证，PR 里把条件写在了密钥赋值处：`event-field check as the authoritative guard`。

5. **下游 job 的依赖关系是否完整**。#30090 的讨论区里有人提了一个具体问题：汇总 e2e job 引用了 `needs.parse_run_context.outputs.trusted`，但 `parse_run_context` 不在该 job 的 `needs` 列表里——`needs` 上下文只包含直接依赖，这可能导致即使是可信运行，汇总 job 也被跳过。这类 needs 与引用的不一致，是在人工审阅 workflow 配置时被讨论区的问题挑出来的。

6. **只读命令的白名单是否检查参数**。`git diff`、`git log`、`git show` 这类看起来无害的命令，都带着能写文件或执行外部命令的参数。

## 一句话总结

这次处置里最值得学的不是"GitHub Actions 有个漏洞"，而是两道防线怎么画：一条是事件字段上的来源校验，另一条是密钥赋值处的独立门控，两者缺一不可；而且任何这类修复都会改变工作流行为，需要把替代路径一并设计好。

需要说明的是，#30066 是作者主动提交用来验证行为的 PoC，#30090 是它的修复。两者都不是对已发布版本的漏洞利用报告，而是漏洞赏金流程中的常规环节。上面关于自动评审漏判的部分，依据的是 PR 页面上的机器人评论原文。

## 参考来源

- Gemini CLI PR #30066 ci: inert canary in package.json scripts (security PoC - do not merge)（AkheelQi，2026-10-31 提交，open）https://github.com/google-gemini/gemini-cli/pull/30066
- Gemini CLI PR #30090 ci(chained_e2e): don't expose GEMINI_API_KEY to fork-controlled code（oflavioc，2026-11-02 提交，2026-11-09 已合并）https://github.com/google-gemini/gemini-cli/pull/30090
- Gemini CLI PR #30095 fix a Windows Git command safety bypass（Gosling-dude，Closes #29189）https://github.com/google-gemini/gemini-cli/pull/30095
- Gemini CLI issue #29189 Security: `git diff --output` bypasses permission prompt, silently overwrites arbitrary files（PakCyberbot，2026-09-03）https://github.com/google-gemini/gemini-cli/issues/29189

（以上网页采集日期：2026-11-10。PR 内容与状态可能随后续提交变化，以原始页面为准。）

本文面向授权安全研究与防御建设，未经授权对任何系统实施文中技术属违法行为。
