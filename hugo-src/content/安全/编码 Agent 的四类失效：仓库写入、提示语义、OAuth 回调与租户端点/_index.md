---
title: "编码 Agent 的四类失效：仓库写入、提示语义、OAuth 回调与租户端点"
date: "2026-11-12 01:35:00 +0800"
weight: 9
tags: [安全, 红队, Copilot CLI, MCP, 子代理]
menu:
  main:
    parent: "安全"
---

# 编码 Agent 的四类失效：仓库写入、提示语义、OAuth 回调与租户端点

先说清楚这四个案例的性质：这四个 issue 均未报告外部攻击或越权访问他人数据，报告场景都发生在用户主动使用相关功能时。四个动作都由使用者自己发起、由 copilot-cli 自己执行，中间没有任何需要外部审批的环节。

四个案例的后果各不相同：#5323 让仓库里多出你没要求创建的 git 引用；#5352 让子代理拒绝读取临时目录里的文件；#5391 让远程 MCP server 的 OAuth 登录在多数尝试下因 redirect_uri 不匹配而失败；#5402 让单租户 Entra 应用下每个交互式会话都得重新授权。

它们对防守方仍然有用，因为每一例都落在"代码逻辑之外的约定层"——引用命名规则、提示词写法的范围、回调端口的分配方式、身份服务的租户类型。这类问题的特点是：单看每一条都不像安全漏洞，排查时容易因为"没报安全错误"而被跳过。第一案造成的是隐性噪音（多出来的 refs 淹没历史视图），另外三案则是可见的失败——读取被拒、登录不匹配、每次会话都要重新授权。

2026 年 11 月的 copilot-cli 仓库里正好有四个 issue 分别落在这四个面上。它们的失效类型并不相同，本文分开讲，最后再汇总审计视角。

## 失效一：Agent 在你的仓库里留下你没要求的引用

issue #5323 是一个功能请求，点赞数不高，但它指出的东西很具体：copilot-cli 创建的 agent checkpoint 会生成 `refs/agents/` 形式的 git 引用。

提案者希望有一个设置能禁用这些引用，理由写得很直白：这些 ref 是用用户的 git 身份创建的，污染了所有渲染全量 refs 的工具。

对个人开发者来说，这可能只是仓库里多了几个看着莫名其妙的 ref。对 CI 系统、审计工具和代码统计脚本来说，全量 refs 视图里突然多出一批来源不明的条目，是很难解释的噪音——尤其是这些条目由 Agent 在你没要求的时候自动创建。

值得记住的判断是：Agent 的"隐形写入"不限于工作区文件。这一例里，Agent 在你没要求的情况下写进仓库的是 git 引用，而它会出现在所有渲染全量 refs 的工具里。评估一个 Agent 工具会不会污染你的环境，要看它往哪些不在你视野里的地方写。

## 失效二：一条禁止写入的指令，被模型读成了禁止读取

issue #5352 描述的失效更微妙，方向是反的。

copilot-cli 给子代理注入了一段系统提示，主 agent 的提示里没有这段。提示的内容是"CRITICAL: 不要在 /tmp 或临时目录做任何文件操作"——列出禁止写入的路径，要求建文件一律写在当前工作目录下，中间产物放项目目录，并强调这是运行时强制执行的安全要求，/tmp 写入会被拒绝。

结果子代理开始拒绝读取临时目录里的文件。

报告者 aaroneng 的测试很直接：让主代理在系统临时位置建几个文件，再起一个子代理让它把文件内容读回来。子代理从不尝试访问那个临时位置。报告者自己的描述是，模型似乎把"不要往那儿写"理解成了"也不要从那儿读"。

同样的问题在主代理用 `~/.copilot/session-state//files/` 存文件再让子代理读回时也出现。

这个 issue 在 11 月 9 日由 copilot-cli-bot 关闭，理由是"看起来在 v1.0.107 已解决，请升级到该版本或更新的稳定版"。维护者的判断是认为该问题已在 v1.0.107 解决并关闭了 issue，报告者观察到的 1.0.105 版本现象与之并存。那次误读本身值得留着：一句针对写的禁令，在那次推理里被读成了针对该路径的一切操作。

对写系统提示的人来说，这是个具体教训：约束要写清作用范围。禁止写 /tmp 和禁止读 /tmp，在人类看来是显然不同的两件事，在模型里可能只是同一句话。

## 失效三：远程 MCP 服务器没法用预注册的 redirect_uri

issue #5391 讲的是另一个方向：回调端口。

场景是这样的。远程 MCP server 配了预注册的 OAuth 客户端（`mcp-config.json` 里的 `oauthClientId` 和 `oauthPublicClient`），而 Copilot CLI 在本地监听一个随机回环端口——`listen(0, "127.0.0.1")`——然后把 `redirect_uri=http://127.0.0.1:<random>/` 发出去。

授权服务器如果要求 redirect_uri 精确匹配、不支持通配符、也不做动态客户端注册，这条路就走不通。报告者举的例子是 Looker 的托管 MCP server，它的文档要求每个客户端固定一个端口，并列出了 Claude Code 的 `--callback-port` 和 Gemini CLI 的 `OAUTH_CALLBACK_PORT`。用 Copilot CLI 时，登录在大多数尝试下都以 `"redirect_uri" mismatch` 失败，报告者记录到的端口是 35731 和 36449。

请求的解法是加一个按 server 或全局配置的端口设置，让 CLI 用固定端口，并在端口被占用时明确失败。

11 月 10 日，仓库协作者 hstaudacher 给出了答案：这个能力其实早就有了。在 server 配置里加 `"auth": { "redirectPort": 7777 }`，同时在 provider 侧注册 `http://127.0.0.1:7777/` 即可；CLI 会在配置的端口不可用时直接失败，而不是退回随机端口。这个选项在 CLI 1.0.49 就已发布。issue 随后以 completed 关闭。

这条案例的价值不在漏洞，而在它演示了一个兼容性契约：当授权服务器要求 redirect_uri 精确匹配、不支持通配符也不做动态客户端注册时，客户端一侧的随机端口策略和这种契约天然冲突。

## 失效四：单租户应用配在多租户端点上

issue #5402 是一个更具体的回归，出现在 1.0.107 和 1.0.108 上，1.0.105 没有这个问题。

场景是一个远程 HTTP MCP server，由单租户的 Entra 应用注册保护。server 在 401 响应里通过 `WWW-Authenticate` 返回受保护资源元数据，元数据里的授权服务器写的是租户专属地址 `https://login.microsoftonline.com/<tenant-id>/v2.0`。VS Code 和 Copilot CLI 的客户端 ID 在应用上预授权好了。

用户手动跑一次 `/mcp auth <server>`，成功，工具能用了。然后退出，重开一个交互式会话——工具调用又报"需要认证"。

问题出在自动（OneAuth/WAM）登录走的地址：它请求的是 `https://login.microsoftonline.com/common`。Entra 对单租户应用拒绝 `/common`，返回：

```
AADSTS50194: Application '<app-id>'(<app name>) is not configured as a multi-tenant application.
Usage of the /common endpoint is not supported for such applications created after '10/15/2018'.
```

CLI 把它折叠成一行泛化错误：

```
Microsoft Entra sign-in for https://<server>/mcp failed: ENTRA_CONFIG: the authenticator rejected the configuration [code 2002, tag 7q6cl]
```

排查靠的是 Windows 事件日志 `Microsoft-Windows-AAD/Operational`，那里记录了真实的 AADSTS50194，以及请求用的 authority 是 `/common`、账号 id 为空。

报告者还做了几组对照，这些对照让问题的范围清楚了很多：用 1.0.105 时，第一个会话打开浏览器登录，第二个会话静默复用，工具调用成功，没有 AADSTS50194 事件。非交互式的 `copilot -p` 在 1.0.108 上能从 `/mcp auth` 保存的状态静默成功，只有交互式启动失败。设 `COPILOT_ENTRA_DISABLE_ONEAUTH=1` 只是把错误换成 `ENTRA_UNAVAILABLE`，没有回退到已保存的登录态。MCP 配置里也没有 authority 或租户相关的设置项（`oauthClientId`、`oauthScopes` 存在），所以客户端侧没有可用的绕法。

结果是每个交互式会话都要重新 `/mcp auth` 一次。

这条 issue 对防守方也有意义：客户端请求的端点和应用注册的租户类型是两个独立的配置项，这一例里它们不一致，于是认证链路在不该断的地方断了——而且断得很隐蔽，因为服务端的元数据本身是对的。

## 汇总：四类不同失效，一个共同的审计视角

这四个案例的失效类型并不相同：一类是在你的仓库里写入你没要求的引用，一类是模型把提示语义泛化，一类是 OAuth 回调与预注册 redirect_uri 不匹配，最后一类是身份服务的租户类型与客户端请求的端点错位。把它们并成一条"信任缺口"命题会掩盖这些差异。

它们共享的只有审计视角：出问题的地方都不是业务逻辑，而是逻辑之外的约定层——引用命名规则、提示措辞、回调分配、租户类型。

对应的自查动作也各不相同：

- 仓库里的 agent checkpoint 引用：确认能否配置或清理，避免审计工具被无关 ref 淹没。
- 给子代理写提示：把禁止范围写清楚，不要只说"不要写"，否则模型可能把禁令泛化到读取。
- 部署远程 MCP server：如果 provider 要求精确匹配的 redirect_uri，给客户端配固定回调端口，别依赖随机端口。
- 单租户 Entra 应用：确认客户端请求的 authority 与应用租户类型一致，"每次会话都要重新登录"很可能是租户配置错位而不是配置项问题。

边界说明：以上四个 issue 都是报告者在各自环境上的观察，环境组合各不相同（Windows 11 / Entra 加入域的租户、Azure Container Apps 上运行的 ASP.NET Core 服务、Linux 上的普通仓库）。#5352 已被标记为在 v1.0.107 修复；#5391 已于 11 月 10 日以 completed 关闭，协作者同时说明固定回调端口的能力在 1.0.49 就已发布。

## 参考来源

- [github/copilot-cli issue #5323：提供设置禁用 agent checkpoint 的 refs/agents/*](https://github.com/github/copilot-cli/issues/5323)，采集日期 2026-11-11
- [github/copilot-cli issue #5352：Subagents refuse to read back files from temp](https://github.com/github/copilot-cli/issues/5352)，采集日期 2026-11-11
- [github/copilot-cli issue #5391：MCP OAuth 回调端口固定化提议](https://github.com/github/copilot-cli/issues/5391)，采集日期 2026-11-11
- [github/copilot-cli issue #5402：单租户 Entra 应用下 MCP 自动登录走 /common 失败](https://github.com/github/copilot-cli/issues/5402)，采集日期 2026-11-11

![GitHub Copilot CLI issue #5402 页面，记录了单租户 Entra 应用下自动登录请求 /common 端点被拒的排查过程](/copilot-mcp-trust-gaps/src_5402.png)

*图：github.com/github/copilot-cli issue #5402 页面，截取日期 2026-11-11。*

本文面向授权安全研究与防御建设，未经授权对任何系统实施文中技术属违法行为。
