---
title: "两类 OAuth 失效，怎么把人推向永久密钥"
date: "2026-11-14 12:00:00 +0800"
weight: 9
tags: ['红队', 'OAuth', 'MCP']
menu:
  main:
    parent: "安全"
---

Copilot CLI 想连 Google 官方的 Workspace MCP 端点，认证在浏览器流程开始之前就失败了。原因是一个字符的差别：

受保护资源元数据里声明的授权服务器是：

```
"authorization_servers": ["https://accounts.google.com/"]
```

Google 自己的 OpenID 配置返回的 issuer 是：

```
{"issuer": "https://accounts.google.com"}
```

两个 URL 只差根路径上的那个尾斜杠。Copilot CLI 按字面比较，判为不匹配，直接拒绝连接：

```
OAuth authentication failed for google-calendar: MCPOAuthError:
Incompatible authorization server: authorization server advertised an issuer
that does not match the URL its metadata was discovered from (RFC 8414 §3.3);
refusing to connect
```

受影响的不是单个端点，七个官方 Workspace MCP 全中：Calendar、Gmail、Drive、People、Docs、Slides、Sheets。

![github/copilot-cli issue #4606 页面截图](/skill-article/C-mcp-oauth/src_issue.png)
*来源：GitHub github/copilot-cli issue #4606 页面，github.com，截取日期 2026-11-14*

## 严格比较本身是对的

这个失败是 fail-closed：比不匹配就拒绝，而不是宽松比较后照常连。RFC 8414 要求 issuer 与元数据发现来源一致，正是为了防止攻击者用一个受控的授权服务器冒充合法 issuer。一个容忍尾斜杠差异的宽松匹配，同时也就容忍了别的归一化差异。

问题的性质不在于校验太严——校验本该严——而在于失败的方式让人不得不绕过它。这类报错会把使用者赶向两条路，每一条都在降低安全水位。

## 第一条路：把 secret 放进配置文件

这份报告里的配置长这样（凭证已脱敏）：

```
"mcpServers": {
  "google-calendar": {
    "type": "http",
    "url": "https://calendarmcp.googleapis.com/mcp/v1",
    "oauthClientId": "<redacted>",
    "auth": {
      "clientSecret": "<redacted>",
      "redirectPort": 8080
    }
  }
}
```

`clientSecret` 明文落在 MCP 配置文件里，靠文件系统权限保护。这类文件通常位于用户目录，会被同步盘、备份工具、开发容器镜像、甚至截图带出去。OAuth 的本意是让客户端不持有长期秘密——用户授权换来短期 token——而这一步把秘密重新放回了磁盘。

## 第二条路：把长期密钥换回来

另一条 issue 属于另一类失效：跟尾斜杠无关，它讲的是子代理拿不到父会话的授权。Copilot CLI 的子代理（用原生 task 工具派生）无法可靠使用走 HTTP-OAuth 的 MCP 服务器，报告者在 2026-11-10 到 11-12 之间观察了约 30 次委派运行，两种症状同源：

用 `/*` 通配符声明工具时，子代理启动会为每个服务器新开连接，尝试宿主的 OAuth 交接但拿不到响应，退回浏览器流程又完成不了，最后发出未认证请求，报「requires authentication」。

用显式工具名时，行为随模型变化。同一个 agent 文件，在 claude-fable-5.1 上发现工具后能成功调用（一个 agent 7/7，另外两个各 1/1）；到了 gpt-6-luna 上，同样能发现名字，却拒绝调用，理由是「no callable invocation interface」，6 次尝试 0 次调用，即便指令里明确要求尝试一次。

报告者给出的 workaround 有两半：Atlassian 那边只能把模型 pin 到 claude-fable-5.1；mabl 那边把服务器改成它文档里的 `x-api-key` 头认证，让连接不再依赖 OAuth 交接。

第二半是关键，也是这两类失效最终汇到同一处的地方。为了让子代理能用，认证从「短期 token + 浏览器授权」退化成「一个长期有效的 API key 写在配置里」。OAuth 的时效边界没了，凭证的暴露窗口从一次会话变成永久——直到有人记得轮换。

而 Atlassian 那一半更麻烦：站点没开 API token 模式，所以唯一的路径是把模型钉死。安全策略变成了「靠某个模型碰巧会调这个工具」，这件事没法写进审计。

## 红队会怎么看这件事

攻击者不需要攻破 OAuth。他们只需要等团队自己完成降级。

一旦认证退化为静态 key，攻击面就从「需要诱导用户完成一次授权」变成了「找到那个 key 在哪」：配置文件、环境变量、CI 的 secret store、容器镜像层、开发者机器的备份。这些位置的共同点是——它们都不在 MCP 服务器的审计范围内。

`clientSecret` 明文躺在 mcp.json 里，也是同一个逻辑：授权流程的复杂度被换成了凭证保管的复杂度，而后者往往没人负责。

## 检测与处置落点

从防守侧看，这份材料能落成四件事：

第一步是清点静态凭据。搜一遍 MCP 配置、环境变量与 CI 的 secret，把「因为 OAuth 走不通而改成 api key」的条目单独标记出来，这类条目往往没有轮换周期。

第二步是在审计日志里区分调用来源。同一个 MCP 服务器的调用，是来自用户授权的 token，还是来自服务账号的静态 key，权限面和时效完全不同，混在一起就失去了溯源价值。

第三步是把子代理的权限继承显式化。子代理拿不到父会话授权状态时，让它失败并明确报错，比让使用者用模型 pin 或静态 key 兜住要好。这条 issue 里使用者的诉求也是这个：要么继承，要么在文档里写清「子代理不能使用仅 OAuth 的 HTTP 服务器」。

最后一条是别把认证失败当成配置问题一路改到能跑为止。尾斜杠这类差异改的都是「怎么让它连上」，而真正需要提级评估的是「连上之后用什么凭据」。

## 边界

这两条 issue 都是使用者陈述。issue #4606 的环境是 Copilot CLI 1.0.81-10，报告的是 Google 官方 MCP 端点的元数据与 Copilot 的比较逻辑冲突；`/mcp auth` 的具体实现细节报告里没有。

issue #5437 的观察来自 VS Code 的 agent host（copilotVersion 1.0.103-unstable.r41379698026.g3219c66）与 Windows 环境，约 30 次委派运行，换一家 MCP 服务器或换一个宿主，行为未必相同。

本文只讨论凭证生命周期与信任边界，不提供针对任何具体服务的认证绕过方法。

本文面向授权安全研究与防御建设，未经授权对任何系统实施文中技术属违法行为。

## 参考来源

- github/copilot-cli issue #4606《Google Workspace MCP OAuth fails on accounts.google.com trailing-slash issuer mismatch》，https://github.com/github/copilot-cli/issues/4606 （采集日期 2026-11-14）
- github/copilot-cli issue #5437《Task subagents cannot authenticate to HTTP-OAuth MCP servers》，https://github.com/github/copilot-cli/issues/5437 （采集日期 2026-11-14）
