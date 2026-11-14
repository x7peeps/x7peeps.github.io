---
title: "denyWrite 的中间通配符在 Linux 被静默丢掉"
date: "2026-11-14 12:00:00 +0800"
weight: 9
tags: ['漏洞研究', '沙箱', '权限模型']
menu:
  main:
    parent: "安全"
---

一个把工作区锁得挺严的沙箱配置，在 Linux 上有个不报错的缺口：`sandbox.filesystem.denyWrite` 只认两种形状——完全写死的绝对路径，和以 `/**` 结尾的目录前缀。夹在路径中间的通配符（`/workspace/**/probe.txt`、`/workspace/*/probe.txt`）不会被拦，也不会报错，规则在 `/status` 里照样显示为已生效。

报告者在 Linux 容器里逐条注入规则做探针，每条规则单独用 `--settings` 传入，避免规则互相干扰；写入目标放在已存在的目录里，排除父目录不存在的干扰。结果分成两类非常干净：

| 规则 | 目标 | 结果 |
|---|---|---|
| `/workspace/docs/probe.txt` | `/workspace/docs/probe.txt` | `blocked:EACCES` |
| `/workspace/**/probe.txt` | `/workspace/docs/probe.txt` | **`WRITABLE`** |
| `/workspace/*/probe.txt` | `/workspace/docs/probe.txt` | **`WRITABLE`** |
| `/workspace/docs/**` | `/workspace/docs/probe.txt` | `blocked:EROFS` |
| `/workspace/**` | `/workspace/docs/probe.txt` | `blocked:EROFS` |

![anthropics/claude-code issue #92684 页面截图](/skill-article/B-denywrite-wildcard/src_issue.png)
*来源：GitHub anthropics/claude-code issue #92684 页面，github.com，截取日期 2026-11-14*

## 读侧没有这个问题

同一份配置里，把 `denyWrite` 换成 `denyRead`，同样的三种规则形状全部生效，中段通配符也能拦下，返回 `EACCES`。

这一条把「平台能力不足」的解释排除了。bubblewrap 能表达中段通配符，读侧已经在做匹配，写侧只是没跑同一套匹配器。

两个 errno 透露了写侧的实现分叉：字面路径返回 `EACCES`，是逐路径拒绝；以 `/**` 结尾返回 `EROFS`，是把子树重新挂成只读。前者不需要匹配，后者等价于「这个目录前缀整体只读」。中段通配符两头都不属于，于是两条分支都落不进去，规则被直接丢掉。

## 真正要命的是两套执行路径

同一条规则，在工具层和沙箱层是两回事。`permissions.deny` 在工具层认这个模式，所以 `Write` 工具会被挡住；沙箱层丢掉这条规则后，Bash 子进程照样能写同一个路径。

用 Agent 去验证规则因此是无效的：让模型试着写一下，写不进去，看起来规则生效了；换个方式起个子进程，写进去了。测试通过的路径和出事的路径不是同一条。

报告者点出的具体场景是那些「宿主会执行」的配置文件：`.git/hooks`、`.pre-commit-config.yaml`、`.envrc`、`.npmrc`、shell 启动文件。官方给的建议本来就是用 `denyWrite` 保护它们。多仓工作区里这些路径只存在于通配符之下，逐仓写死字面路径既不现实，也会随着新增仓库慢慢腐烂。

## 已有的告警为什么不够

`/status` 会显示一行：

```
⚠ Glob patterns in sandbox permission rules are not fully supported on Linux
```

`claude doctor` 会进一步列出受影响的 17 个模式，包括 `Edit(//workspace/**/.git/hooks/**)`、`Edit(//workspace/**/.git/config)`、`Edit(//workspace/**/.mcp.json)` 等。

告警列对了规则，但两处表述会让读者误判。

第一处是「will be ignored」说重了，也把风险指错了方向。这些 `Edit` 规则在工具层仍在执行，被丢掉的只是它们在沙箱层的对应物。准确的说法是「这些规则不会作用于子进程」，而这恰好是测试时最容易漏掉的那一半。

第二处是它说 `Edit/Read`，而真正失效的是 `denyWrite`，`denyRead` 是好的。按字面理解去修，很可能改错地方。

## 修复方向与临时处置

报告者给了两条路线。彻底的修法是让 `denyWrite` 复用 `denyRead` 已有的匹配器，两条路径共用一套语义。

过渡方案更值得借鉴：在加载配置时校验规则，凡是既不是字面路径、也不以 `/**` 结尾的 `denyWrite` 规则，直接拒绝启动或逐条告警，让失败可见。安全控制静默失效是错的方向，宁可起不来，也别装作起来了。

对正在用这类配置的团队，这份报告能直接落成三件事：

1. 别用 Agent 试探的方式验收沙箱写保护，用父目录里已存在的文件做子进程写入探针。
2. 检查自己的 `denyWrite` 里有没有中段通配符。有的话，改成 `/**` 结尾的目录级规则，或拆成多条字面路径。
3. 把「子进程能不能写」写进回归测试，而不是只测工具层。

## 边界

报告环境是 Claude Code 2.1.263（commit `37ae3f38d765`）、linux-arm64、Docker 内的 `node:22-bookworm-slim`，通过 `/etc/claude-code/managed-settings.json` 开启沙箱，并设置了 `sandbox.enableWeakerNestedSandbox: true` 以便在 Docker 里嵌套 bubblewrap。这份材料没有覆盖 macOS 与 Windows 的沙箱行为，也没有说明其它版本的匹配逻辑是否一致。

issue 创建于 2026-09-07，最后一次更新是 2026-11-12，共 3 条评论，标签包含 `bug`、`has repro`、`area:security`、`area:sandbox`，状态仍是 open。

本文面向授权安全研究与防御建设，未经授权对任何系统实施文中技术属违法行为。

## 参考来源

- anthropics/claude-code issue #92684《[BUG] `sandbox.filesystem.denyWrite` silently ignores rules containing a mid-path wildcard (Linux)》，https://github.com/anthropics/claude-code/issues/92684 （采集日期 2026-11-14）
