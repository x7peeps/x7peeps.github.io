---
title: "命令中间塞一个重定向就能绕过只读判定：Qwen Code 权限绕过原理与防御"
date: "2026-11-12 23:50:00 +0800"
weight: 9
tags: ['漏洞研究', 'Qwen Code', 'AST解析']
menu:
  main:
    parent: "安全"
---

2026 年 11 月 10 日，安全研究者向 QwenLM/qwen-code 报告了 issue #16856，官方标记为 P1、category/security、scope/vulnerability。

问题出在只读命令判定的 AST 解析环节：bash 允许重定向出现在命令的任意位置，而解析器在读参数时停在重定向处，导致重定向之后的单词全部逃出安全审查的视野。

![QwenLM/qwen-code issue #16856 页面截图](\/skill-article\/B-qwen-redirect-bypass/src_i16856.png)
*来源：GitHub QwenLM/qwen-code issue #16856 页面，github.com，截取日期 2026-11-12*

## 漏洞机制

bash 语法允许输入重定向插在一个简单命令的单词之间。tree-sitter-bash 解析这类命令时，command 节点在重定向处结束，剩下的单词被归入 file_redirect 节点。

而 Qwen Code 的 evaluateCommandSafety（packages/core/src/utils/shellAstParser.ts）只读取 command 节点的参数，于是所有匹配子命令和危险标志位的安全规则，看到的都是一条被截短的、无害的命令。

报告者在 main 分支（commit 79a60bc1e2）上直接调用分类函数测量了结果：git branch 命令以 < /dev/null -D main 结尾时被判定为 read-only，而去掉重定向后同样命令判定为 write。

连同前面讨论的 git branch 在内，被误判为 read-only 的共五种写法，其余四种是 remote add、push、find 的删除标志、sed 的原地编辑各自的对应形式——bash 实际收到的参数完整包含 -D main 等危险部分，但安全层看不见。

判定为 read-only 后，ShellToolInvocation.getDefaultPermission 中 `if (isReadOnly) { return 'allow'; }` 这段代码直接放行——不弹提示、不调用分类器。

值得注意的是正则回退路径（isShellCommandReadOnly）对全部样本都答 false，说明只有 AST 路径受影响。报告者也明确标注了未测项：没有在 auto 模式下做端到端复现，表格数据是分类器的直接输出，放行结论读自源码。

## 这不是孤例：手写 shell 模型的系统性困境

同仓库 issue #16604 记录了同一类问题的更早教训。PR #16075 曾花十五轮评审去加固一个手写的 shell 语义模型，每轮封堵测到的拼法、下一轮又从同一个未建模结构钻出新入口。

维护者在第十五轮评估后决定停止"拼写打地鼠"，落地三个有界的临时措施（不可分类文本转人工审批、防崩溃护栏、HEAD 中立白名单），并把结构性修复立项为 #16604：

用手写模型换真实解析器（tree-sitter-bash 或 mvdan.sh 的 WASM 构建），在 AST 上做归因。

#16604 列出的仍在开放的入口包括程序词通配、printf 拼接、包装器选项接缝、静态值证明写入等；其中最严重的一类是数据丢失而不只是漏报——豁免流程认证的 HEAD 已经被嵌套调用移动过。这次 #16856 的重定向问题，恰好是"bash 语法无法靠枚举覆盖"的又一次验证。

## 同期落地的防线：fail-closed

PR #16784 展示了正确的防御方向。它处理的是另一个不可表示问题：Linux 文件名是字节序列，权限规则 API 用的是 JavaScript 字符串，存在无法无损表示的路径。修复选择 fail-closed：

不可解码的 ANSI-C shell 词保持未解析状态，文件操作保持可见，权限检查升级为 ask——即使已有 allow 规则匹配也照样询问，AUTO 模式保留人工审查下限。两条解码路径还共享长度保持的拼接，防止用包装命令隐藏不可解码字节。

## 给自建 Agent 权限层的防御启示

这个案例对自建命令安全判定的团队有三条可复用的防御原则。第一，判定输入与执行输入必须同构：bash 交给程序的是完整 argv，安全层看到的是被语法树截断的参数，两者不一致就是绕过面。

第二，遇到无法解析或无法表示的输入，默认收紧而不是放行，#16784 的 ask 升级是范本。第三，手写解析器对抗完整 shell 语法是长期败局，尽早迁移到维护中的真实解析器做 AST 归因，把人力花在归因规则而非语法补洞上。

对 Qwen Code 用户，当前的实际建议是：不要依赖"只读命令免审批"这一层做唯一防线，涉及删除、改写、推送的会话显式配置人工确认；截至采集日该 issue 仍处于开放状态，修复进展需关注仓库后续动态，合入后再升级到包含修复的版本。

本文面向授权安全研究与防御建设，未经授权对任何系统实施文中技术属违法行为。

## 参考来源

- QwenLM/qwen-code issue #16856《an input redirection in the middle of a command hides the words after it from the read-only classifier》（采集日期 2026-11-12）
- QwenLM/qwen-code issue #16604《用真 bash 解析器替换手写 amend shell 模型》（采集日期 2026-11-12）
- QwenLM/qwen-code PR #16784《安全加固：不可解码的 ANSI-C shell 词保持未解析，fail-closed》（采集日期 2026-11-12）
