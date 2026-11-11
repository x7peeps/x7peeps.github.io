---
title: "凭据在沙箱里被悄悄丢弃：Copilot CLI 的两个配置与现实错位"
date: "2026-11-12 01:35:00 +0800"
weight: 9
tags: [安全, 蓝队, Copilot CLI, 沙箱, 凭据]
menu:
  main:
    parent: "安全"
---

# 凭据在沙箱里被悄悄丢弃：Copilot CLI 的两个配置与现实错位

先说清楚这两件事的性质：它们是 Copilot CLI 用户在本地跑沙箱时提交的缺陷报告，主体是使用者本人，没有第三方攻击者介入，也没有审批环节被绕过。后果是使用者自己的合法操作失败——Gradle 起不来、gh 命令 401。

防守方审查 AI 编码工具时最容易看的是功能：能不能跑、跑得对不对。更难看的是那些"配置写对了，但运行时没照做"的地方——这类偏差可能报错也可能不报错，但都会让一道你以为在的保护失效。

2026 年 11 月 9 日和 10 日，copilot-cli 仓库出现了两个这样的 issue，失效方向相反：一个让凭据变量比预期少得多，另一个让网络策略比配置严格得多。

## 掩码在过滤之后才生效，变量先消失了

issue #5388 的环境是 GitHub Enterprise Cloud 带数据驻留（`.ghe.com` 域名），仓库托管在该租户上，Copilot CLI 1.0.106，Linux，用 `--sandbox --yolo` 启动。

报告者的观察是一组对照，构成本文最有价值的部分。

在沙箱 shell 里，`GH_HOST` 存在，但 `GH_TOKEN`、`GH_ENTERPRISE_TOKEN`、`COPILOT_GITHUB_TOKEN`、`GITHUB_TOKEN` 全部不存在，没有留下任何占位标记——尽管它们都被配置为需要掩码。

`gh` 因此回退到 `hosts.yml` 里存的登录态，对 `api..ghe.com/graphql` 请求返回 HTTP 401。

接着是关键的对照：同一个 token 换成一个中立变量名（报告者用 `MY_GHE_TOKEN`，配了同样的 `injectHosts`），到沙箱里就变成了一个长度为 40 的占位标记。用 `curl -H "Authorization: token ***"` 请求 `https://api..ghe.com/user` 返回 200——掩码机制本身是好的。

再用 `GH_TOKEN="$MY_GHE_TOKEN"` 调 `gh issue list`，工作正常。换成 `GH_ENTERPRISE_TOKEN="$MY_GHE_TOKEN"`，依然 401。

这说明掩码功能没坏，坏的是它上游的一层过滤：变量名在掩码生效之前就被移除了。报告者对此的判断写得很谨慎——"这是推断，未经确认"，被删除的变量名清单在公开文档里查不到。

对防守方来说，这里有一个值得记住的区分：**凭据没被泄露，和凭据没被用上，是两件事**。这个 case 里没有观察到泄露，掩码对照也做成功了，但工具的可用性坏了，用户很可能因此去找绕路——而绕路常常才是风险的入口。

报告者给的绕法是：把 token 放在自定义变量名下，列进 `credentials.envVars` 并配 `injectHosts`，然后用 `GH_TOKEN="$MY_GHE_TOKEN"` 调 gh。他同时提了几条产品侧建议：在 `copilot help sandbox` 里公开那份过滤清单；不要过滤那些在 `credentials.envVars` 里显式配置过的变量，或者在启动时警告某个已配置变量在过滤后消失了；支持通过 `GH_TOKEN` / `GH_ENTERPRISE_TOKEN` 配合 `GH_HOST` 来支持 GHE 租户，而不是只认 github.com 上的 `GITHUB_TOKEN`。

这几条建议里，关于 GHE 租户支持的那条防守含义最大：沙箱在掩码生效之前会用一份固定名单过滤掉某些变量名，这份名单本身就是需要审计的策略，而不是实现细节。

## 反过来的一例：允许本地网络，但策略写的是 deny

issue #5390 是同一周内的另一个方向。Copilot CLI 1.0.107，macOS 26.7.1，arm64，Gradle wrapper 9.8.2，Temurin Java 25.0.1。

现象是 Gradle 在 CLI 的 macOS 沙箱里跑不起来：它的客户端连不上自己的 localhost daemon。

daemon 启动成功了，监听在 `127.0.0.1`。但那条失败命令生成的策略是这样的：

```json
{
  "network": {
    "egress": { "default": "deny" },
    "ingress": { "default": "allow", "hostLoopback": "deny" },
    "runtimeConfig": { "networkProxy": "http://127.0.0.1:57901" }
  }
}
```

`allowLocalNetwork: true` 在用户的配置里明确写着，但生成的策略里 `hostLoopback` 是 `deny`。报告者补充了一个细节：那次运行的 Gradle daemon 监听在 57903 端口，不是被允许的代理端口 57901。

更硬的证据是那个独立的 socket 探测：在 localhost 上绑定并监听成功，但连接那个监听器失败，返回 EPERM。

用户的配置里 `allowedHosts` 明确包含 `127.0.0.1`，`blockedHosts` 为空，`allowOutbound` 和 `allowLocalNetwork` 都是 true。

报告者还提到，这看起来像是已关闭的 #5105 的复发或延续。

这一条对防守方尤其重要，因为它是"以为有、实际无"的典型：**沙箱策略比你的配置更严格**。这类问题的失败模式是可见的（Gradle 直接失败，不会静默放行），而一个"我明明开了这个开关"的困惑很容易把人推向放宽配置的方向——比如关沙箱、启用 `allowBypass`、或者干脆在配置里堆更多例外。配置越堆越松，策略缺口就越埋越深。

## 两个 case 合起来看，防线该往哪儿放

这两个案例的失效类型并不相同：#5390 是生成的网络策略与用户配置冲突，#5388 是沙箱的变量过滤让配置好的凭据消失。把它们并成"同一种策略生成缺陷"会超出证据。

但它们共享一个对防守方有用的判断方向：**审查 AI 工具的沙箱，既要看生成的策略，也要看实际生效的变量状态，不能只读配置文件。**

配置文件是你写的，生成策略和过滤后的环境是工具替你写的。前者符合预期，后者才决定实际约束。#5390 里用户配置全对，生成策略照样 deny——如果你只读配置文件，你会得到一个错误的"已加固"结论。

具体动作有三个。

第一，把生成策略作为可审计对象。copilot-cli 的策略落在 `~/.copilot/session-state//policies/` 下，报告者就是从这里查到的。把这类文件纳入定期检查，比读 README 有用得多。

第二，区分"响亮的失败"和"不报错的偏差"。#5390 的失败是响亮的（EPERM，Gradle 起不来），#5388 的失败也是响亮的（401）。真正难查的是第三类：配置说放行、生成结果也说放行、但实际生效的东西和两者都不一致——那类情况不报错。

第三，要求沙箱工具公开它的变量过滤清单。#5388 报告者那句"清单内容未公开"，在防守语境下等于一条审计缺口：你无法确认哪些凭据在沙箱里会被丢弃。这一例里报告者观察到的是：受掩码的变量直接消失，中立命名的变量则变成占位标记——"掩码前就被过滤"是他自己标注为推断的解释，不是确认的结论。这直接影响你的凭据轮换策略和告警规则设计。

顺带一句范围提示：本文两个案例的证据只覆盖"变量被过滤、请求返回 401"和"生成的策略与配置冲突"，不足以对任何环境下的凭据外泄或未授权访问下结论。

边界说明：这两个 issue 的环境各不相同（#5388 是 Linux 上的 GHE 数据驻留租户，#5390 是 macOS 上的 Gradle 项目），问题成因和修复方向可能并不相同。#5388 的根因是报告者的推断，公开信息里没有维护者的确认；#5390 的策略 JSON 与 EPERM 探测则是报告者给出的实测数据。本文没有在本地复现这两个环境。

## 参考来源

- [github/copilot-cli issue #5388：GHE 数据驻留租户下 GH_TOKEN 等变量在掩码前被过滤](https://github.com/github/copilot-cli/issues/5388)，采集日期 2026-11-11
- [github/copilot-cli issue #5390：allowLocalNetwork 为 true 时生成策略仍为 hostLoopback deny](https://github.com/github/copilot-cli/issues/5390)，采集日期 2026-11-11

![GitHub Copilot CLI issue #5390 页面，贴出了生成的沙箱策略 JSON，其中 hostLoopback 为 deny](/copilot-sandbox-cred/src_5390.png)

*图：github.com/github/copilot-cli issue #5390 页面，截取日期 2026-11-11。*

本文面向授权安全研究与防御建设，未经授权对任何系统实施文中技术属违法行为。
