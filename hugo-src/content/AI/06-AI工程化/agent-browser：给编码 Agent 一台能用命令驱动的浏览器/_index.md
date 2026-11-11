---
title: "agent-browser：给编码 Agent 一台能用命令驱动的浏览器"
date: "2026-11-12 01:35:00 +0800"
weight: 9
tags: [AI工程化, Agent 工具, 浏览器自动化, Rust]
menu:
  main:
    parent: "AI实战"
---

# agent-browser：给编码 Agent 一台能用命令驱动的浏览器

让 AI 操作浏览器这件事，主流做法是把页面截图丢给视觉模型，让模型看图找按钮。这条路的问题不在于做不到，而在于每一步都要传图、都要重新推理——一个表单填十次，就是十轮图像往返。

agent-browser（vercel-labs 维护）是另一条路：它是一个原生 Rust CLI，核心思路是把页面转成带引用标记（ref）的紧凑文本，模型拿到一串 `@e1`、`@e2` 这样的元素引用，然后按引用执行动作。

仓库地址是 github.com/vercel-labs/agent-browser，截至本文采集日期显示 49655 star、3474 fork、Apache 2.0 许可，官网在 agent-browser.dev。

## 工作循环只有四步

README 给的快速上手就是四条命令：

```
agent-browser open example.com
agent-browser snapshot -i
agent-browser click @e1
agent-browser get url
```

`open` 打开页面，`snapshot -i` 列出交互元素并给每个元素一个 ref，`click @e1` 按引用操作，`get url` 确认结果。

`snapshot` 的输出长这样：

```
- link "Learn more" [ref=e1]
```

这个设计的关键在于把"找元素"和"操作元素"分开了。模型不需要在整页 HTML 里定位，也不需要看截图猜位置——它读一份人可读的文本清单，拿到引用，再直接对引用下令。一步一个短命令，浏览器在命令之间保持打开。

README 强调了两条使用纪律。一是 ref 描述的是快照那一刻的页面，导航或 DOM 变化之后必须重新取一次快照，再用新快照里的 ref；二是除了 ref，CSS 选择器、文本、XPath 和语义定位器也能用，比如 `agent-browser find role button click --name "Submit"`。

## 点击失败时会明确失败

这是很多自动化流程里最难处理的情况：一旦工具报告成功却实际没点到，后续所有推理都会建立在这个错误前提上。agent-browser 的处理方式是明确失败，让模型有机会纠正。

对使用者来说，这个差别落到操作上就是一句话：点不动的时候你会看到失败，而不是看到一句"已点击"。

README 的表述是：当目标处于隐藏、禁用、视口之外，或者被别的元素（比如一个同意条款横幅）盖住时，点击会失败，而不是报告成功。

README 给的处置建议也具体：先关掉遮挡元素，重新快照，再重试。

## 后台守护进程与多会话

CLI 把每个命令发给一个后台守护进程，守护进程在第一条命令时启动，通过 Chrome DevTools Protocol 控制浏览器。每个 `--session` 有自己的守护进程和浏览器实例。

默认行为是：守护进程会关闭 headless 浏览器，并在一小时无命令后退出（若配置了会话持久化，退出前会先保存状态）。默认浏览器是 Chrome for Testing，也可以用 `--cdp` 接入一个已经在运行的 Chrome。

会话隔离这一点在并行工作流里有实际意义：多个 Agent 任务同时跑，各自对应独立的守护进程和浏览器实例。

## 安装

README 列了四种方式：

```
npm install -g agent-browser
agent-browser install
```

macOS 上也可以 `brew install agent-browser` 再 `agent-browser install`；Linux 用 `agent-browser install --with-deps` 会连带装浏览器的系统依赖库；不装也行，`npx agent-browser open example.com` 直接跑。

`agent-browser install` 第一次会下载 Chrome for Testing。项目本身的安装、从源码构建、升级和 `doctor` 诊断命令，README 指向单独的 Installation 文档。

## 它的能力边界在哪

snapshot 只能覆盖可访问性树里暴露出来的元素。画在 canvas 里的东西、没有语义角色的自定义控件、依赖视觉状态才能判断的交互，都不在它的射程内。它是"读 DOM"，不是"看屏幕"。

这条边界直接决定适用场景：页面元素能被可访问性树读到、且交互不依赖画布渲染的流程，可以先试 agent-browser；重度依赖视觉渲染的界面，它替代不了视觉模型。

## 仓库的活跃度

从贡献者分布看，提交集中在少数几个人手上：ctate 有 421 次贡献，Railly 81 次，github-actions[bot] 68 次，lahfir 66 次，jin-2-kakaoent 27 次。仓库的 issue 数是 583，仓库创建于 2026 年 1 月。

## 使用前值得确认的两件事

第一，浏览器下载。`agent-browser install` 会拉一份 Chrome for Testing，这是一次额外的下载；在受限网络环境里需要提前准备。

第二，它默认用 headless 浏览器。如果你的目标站点需要你在旁边人工过一道验证，README 给的路径是用 `--cdp` 接入一个已经在运行的 Chrome。

## 怎么决定要不要用

一句话的判断标准：你要自动化的流程里，页面元素能不能被可访问性树读到？能，就值得先试 agent-browser；不能（比如关键交互只存在于 canvas 里），就还是需要视觉模型。这一步只能筛掉明显不适用的场景，具体流程能不能跑通仍然要你自己验一遍。

在真正铺开之前，先用 `--cdp` 接一个你已经在用的、登录好的 Chrome 跑一遍目标流程。这一步同时验证了三件事：目标页面在可访问性树里读得到、登录态可用、必要的交互不依赖画布渲染。

## 参考来源

本文关于功能、命令和参数的描述全部来自仓库 README 与仓库元信息页，我没有在本机安装和运行这个工具，也没有实测它的性能指标或兼容性表现。star 数、fork 数、issue 数均为采集日期当天的页面显示值。

- [vercel-labs/agent-browser 仓库（README 与仓库元信息）](https://github.com/vercel-labs/agent-browser)，采集日期 2026-11-11
- [agent-browser 官方文档站](https://agent-browser.dev)，采集日期 2026-11-11

![vercel-labs/agent-browser 仓库首页，README 顶部说明其为面向 AI Agent 的浏览器自动化 CLI](/agent-browser-primer/src_agent_browser.png)

*图：github.com/vercel-labs/agent-browser 仓库页面，截取日期 2026-11-11。*
