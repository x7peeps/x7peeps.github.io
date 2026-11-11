---
title: "一个 shell=True 的命令注入：官方 Skill 仓库里被社区 PR 修掉的那类洞"
date: "2026-11-12 01:35:00 +0800"
weight: 9
tags: [安全, 漏洞研究, Agent Skill, 命令注入]
menu:
  main:
    parent: "安全"
---

# 一个 shell=True 的命令注入：官方 Skill 仓库里被社区 PR 修掉的那类洞

先说清楚这篇文章的性质：材料显示的是一个脚本里存在潜在命令注入，社区提了 PR 修复它，但截至采集日期该 PR 仍是 open 状态，尚未合并。这份材料里没有事故排查记录，也没有关于是否有人利用过这条路径的说明——它是一段代码审查记录，讲的是一个缺陷被发现、修复方案被提出但还没进主干的过程。

这类缺陷之所以值得留意，是因为编码 Agent 会从自然语言里抽出命令、拼成 shell 字符串、再交给子进程执行——这条路径上任何一处 `shell=True` 加未净化的拼接，都是标准的 CWE-78。

2026 年 10 月 6 日，anthropics/skills 仓库收到一个 PR，目标就是官方 skills 集合里 `webapp-testing` 这一项的启动脚本。PR #1980 的标题写得很直白："webapp-testing: avoid shell=True in with_server.py"。这个仓库不是第三方贡献者的小项目，它是 Anthropic 官方的 Agent Skills 公共仓库——README 里写着它承载了 Claude 文档能力的底层实现，docx、pdf、pptx、xlsx 四个 skill 都以 Apache 2.0 开源。

## 洞在哪儿

PR 描述给出的位置很具体：`skills/webapp-testing/scripts/with_server.py` 里，服务器命令原本用 `subprocess.Popen(..., shell=True)` 启动，理由是支持 `cd && ` 这种链式写法。

问题也在这里：用户或 Agent 提供的命令字符串未经净化就进了系统 shell。PR 的原话是，这引入了命令注入风险（CWE-78）。

这不是理论风险。评审者 98zc5g5jyw-arch 在 head `b400329133` 上做了两态验证，用的是同一条命令字符串：

```
echo pwned > /tmp/injected && python3 -m http.server
```

修改前的脚本会把它交给 shell 执行，重定向真的创建出那个标记文件；修改后的版本把整条字符串当作 argv 做分词，重定向变成惰性字符，标记文件从未被创建，脚本以非零状态退出（`Server failed to start on port `），因为端口根本没打开。

PR 的评审记录还提到 `$(...)` 命令替换变体：修改前的脚本会执行这条命令替换；评审摘录在该处被截断，修改后的行为记录不完整，因此本文不对修改后的命令替换行为下结论。

这个验证方式值得记一下。它不靠"我读代码觉得安全"，而是对同一条输入在两个版本上跑一遍，看文件系统有没有变化——标记文件在或不在，是硬证据。

## 修法只有三步

PR 的改动清单很短。

第一步，把 `shell=True` 换成 `shlex.split` 显式分词加 `shell=False`。不再有 shell 参与解析，重定向、管道、命令替换这些 shell 语法统统失去作用。

第二步，加一个 `parse_server_command` 函数，提取 `cd && ` 前缀，把目标目录直接传给 `subprocess.Popen` 的原生 `cwd` 参数。原先靠 shell 语义实现的"先切目录再执行"，现在由参数表达。

第三步，保留 SKILL.md 里已经写明的 CLI 选项和行为，不改用法。

改动规模是 +175 -3，两个文件。评审者确认了文档化的两种用法（单服务器 `--server "python3 -m http.server "`、复合目录切换 `--server "cd backend && python3 -m http.server "`）在这个 head 上都能正常启动、能被连接、能干净退出，并且与改动前的脚本在启动、就绪、payload 上表现一致。

这个"不破坏既有文档化行为"的验证很重要。很多安全修复会把一条命令注入变成一条功能回归——修好了洞，也修坏了功能，用户于是把修复回滚掉。这里没有。

## 为什么这类洞在 Agent 时代更值得看

单看这个 PR，它是一个普通的参数化处理修复。放在 Agent 工具链的语境里，它的来源值得说清楚。

Anthropic 官方的 skills 仓库同时承担两个角色：它是 Claude 文档能力（docx/pdf/pptx/xlsx）的实现底座，也是公开的技能范式仓库——README 里说得很清楚，这些 skill 覆盖从创意应用、技术任务到企业工作流，是给开发者参考用的样板。

于是它的调用方不是人敲命令。调用方是模型。模型根据用户的自然语言决定调用哪个 skill、传入什么参数。参数里的字符串可能来自用户输入、可能来自网页内容、可能来自模型自己上一轮的生成。

在这条链路上，`shell=True` 意味着任何进入命令字符串的内容都能获得 shell 的全部语法能力——重定向写文件、命令替换执行命令、管道串接后续操作。这个方案的效果是：改用分词加 `shell=False` 之后，shell 不再参与解析，重定向和管道失去了作用。

PR 在 10 月 6 日提交后被 @rlancemartin 和 @cj-ant 关注，11 月 1 日仍有更新。

## 三个可以自查的点

如果你在维护自己的 Agent 工具链，下面三件事可以按顺序查。

第一，找 shell 调用的落点。搜 `shell=True`、`os.system(`、`subprocess.*shell`，以及任何把变量拼进命令字符串再执行的位置。参数化处理（argv 数组 + `cwd` 参数）应该是默认写法，而不是需要额外说明的例外。

第二，看输入来源。命令字符串里的每一个片段都可能来自模型或远程内容。如果一个脚本接受的是"运行这条命令"的参数，而这个参数由模型根据用户自然语言拼出来，那它就是外部输入。

第三，要求修复带两态证据。类似 #1980 评审里那种做法：同一条恶意字符串在修复前后各跑一次，检查文件系统或网络有没有变化。这比读 diff 更难糊弄。

## 一条判断

官方仓库里的 skill 同样是要审的代码，官方身份不等于免疫。

（本文关于 #1980 的状态与验证细节转述自 PR 页面公开内容，我没有在本地复现这条注入测试。）

## 参考来源

- [anthropics/skills PR #1980：webapp-testing: avoid shell=True in with_server.py](https://github.com/anthropics/skills/pull/1980)，采集日期 2026-11-11
- [anthropics/skills 仓库首页（README 与仓库元信息）](https://github.com/anthropics/skills)，采集日期 2026-11-11

![Anthropic 官方 skills 仓库中 PR #1980 的页面，标题为 webapp-testing: avoid shell=True in with_server.py](/anthropics-skill-shell-injection/src_pr1980.png)

*图：github.com/anthropics/skills PR #1980 页面，截取日期 2026-11-11。*

本文面向授权安全研究与防御建设，未经授权对任何系统实施文中技术属违法行为。
