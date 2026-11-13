---
title: "终端回复被当成你敲的字"
date: "2026-11-13 23:00:00 +0800"
weight: 9
tags: ['红队', '终端安全', '输入通道']
menu:
  main:
    parent: "渗透测试"
---
2026 年 10 月 20 日，一位用户从 Windows Terminal 用 SSH 连到 Ubuntu 24.04，启动 opencode 2.1.0。还没开始打字，输入框里已经有 `:ffff/ffff/ffff`。每次启动都复现。

这不是显示错位，是终端发回来的字节被当成了键盘输入。

## 一行乱码是怎么进来的

opencode 启动时会向终端发 OSC 10/11 查询，问前景色和背景色。终端要回一段 `ESC ]11;rgb:xxxx/xxxx/xxxx`。

在这个 SSH 终端上，回复被分成了两片：先到 `ESC ]11;rgb`，大约 2 秒后才到剩下的 `:ffff/ffff/ffff`。TUI 的 stdin 解析器有一个转义超时，没等齐的序列被丢弃，晚到的尾巴就被当成普通按键，进了输入框。

维护者复现时观察到：延迟的尾巴每次都出现在输入框里，间隔 50 毫秒则没有泄漏。从源码跑的开发分支（d30e990）同样复现。

![anomalyco/opencode issue #57345 页面截图](/skill-article/C-terminal-osc-injection/src_i57345.png)
*来源：GitHub anomalyco/opencode issue #57345 页面，github.com，截取日期 2026-11-13*

## 21 毫秒与一个字符

10 月 29 日，另一位用户给出了机制层的定位，环境是 2.2.0 + Ghostty 与 tmux。`StdinParser` 里，一个悬空的 ESC 在 `timeoutMs = 21` 后被当作 Escape 键刷出，并置 `justFlushedEsc`。回到初始状态的恢复逻辑只认 `[`（0x5B），其他字节直接落到 `emitKeyOrResponse("unknown")`，也就是当成键入。

结论是：任何在 20 毫秒停顿之后才到的 OSC（`]`）、DCS（`P`）、APC/PM（`_`、`^`）尾段，都会被当按键。他实测的分片点更细：整段写入正常，`ESC` 加剩余部分间隔 10 毫秒无泄漏，间隔 30 毫秒就泄漏。

2.2.0 的分片点和 2.1.0 不同，这次断在单个 ESC 之后，泄漏的字符串变成 `]10;rgb:eeee/eeee/eeee`。同一份 parser，不同的断裂位置。这说明问题不在某种特定回复格式，而在「不完整序列被丢弃、尾字节当输入」这条路径本身。

## 为什么值得按安全边界看

这些字节来自终端，不来自用户。输入框本应只接受用户按键。

现在的事实是：任何能向这个终端写字节的一方，都可能把文本送进 prompt，包括你在同一个终端里运行的程序输出。这不是已验证的攻击，issue 里也没有人做恶意验证；但从机制上说，输入通道没有信任边界。

风险不需要恶意就能发生：一次误触 Enter，这段乱码就作为指令提交给模型。issue 里还链了同族案例 #54500——退出后残留字节漏进 shell 输入；以及 #55641，Kitty 图形探测的回复在退出后漏到 shell 提示符。同一类问题换了个宿主程序。

## 修复与绕行

修复在 OpenTUI 的两个 PR：#1793（native: hold split terminal replies while a DA1 sentinel is out，2026-10-26 合并）与 #1816（core: end terminal reply waits at their DA1 reply，2026-10-27 合并）。给出定位的用户指出，2.2.0 的打包二进制里没有 `OT_INPUT_EXPECT_SENTINEL`，所以修复还没进发布版。

现在能做的三件事：在 tmux 里跑，外层终端的碎片回复不会直接到 TUI；启动后先 Ctrl+U 清行再输入；升级前确认版本是否包含上面两个 OpenTUI 改动。Windows 侧也有用户看到 SGR 片段（形如 `38;2;91;73;124m`）漏进输入框，属同一类现象，尚未确认是否同一条代码路径。

给做 agent 工具的人：终端查询的回复要和用户输入分开处理；转义序列超时之后，尾字节不能落进按键流；给 PTY 输入标记来源，比事后用字符串过滤可靠。

本文面向授权安全研究与防御建设，未经授权对任何系统实施文中技术属违法行为。

## 本文的资料依据与局限

事实来自 anomalyco/opencode issue #57345 的完整页面（2026-11-13 原生采集），包含报告正文、维护者复现、第三位用户的源码级定位与后续评论。文中「任何能写终端的进程都能注入输入」是依据机制的推断，issue 中没有恶意验证，本文不声称这是可利用漏洞。版本状态以 issue 最后更新（2026-11-12）为准，更晚的发布是否已含修复未验证。

## 参考来源

- anomalyco/opencode issue #57345《tui: delayed OSC 10/11 replies leak into prompt as ":ffff/ffff/ffff"》（采集日期 2026-11-13）