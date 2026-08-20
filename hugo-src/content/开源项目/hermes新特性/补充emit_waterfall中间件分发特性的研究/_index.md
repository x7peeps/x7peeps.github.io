---
title: "补充emit_waterfall中间件分发特性的研究"
date: 2026-08-17 10:34:57 +0800
weight: 24
tags: ["Hermes", "Hooks", "中间件", "开源贡献", "PR研究"]
menu:
  main:
    parent: "开源项目"
---

> **PR 地址**：[NousResearch/hermes-agent#85370](https://github.com/NousResearch/hermes-agent/pull/85370) · 为 gateway 事件钩子增加 Cordis 风格 around-middleware 分发模式 emit_waterfall

## 研究摘要

之前，Hermes gateway 的钩子只有两种扁平扇出模式：`emit`（观察，handler 返回值被忽略）与 `emit_collect`（收集，返回值由调用方统一解读）。任何 handler 都无法在下游 handler 看到值之前改写它，也无法终止链条——一个 deny 决策挡不住后面的 handler 继续执行。命令分发路径靠返回 `{"decision": ...}` 字典、再到 gateway/run.py 里重新解读来绕，但这种模式表达不了"前一个 handler 重写了命令、现在对重写后的命令重新检查"。现在，`HookRegistry.emit_waterfall()` 提供真正的中间件链：handler 收到 `next_fn`，调用 `await next_fn(new_value=...)` 委托下游（可替换值），不调用直接返回即短路，handler 的返回值成为瀑布结果。

这是 DeepSeek Harness 的 Cordis waterfall 原语移植（其工具执行管线 pre-execute → execute → post-execute 的核心机制），刻意保持最小足迹：只新增一个方法，`emit` / `emit_collect` 与所有既有调用点零改动，靠 handler 参数数量（arity）自动区分瀑布参与者与旧观察者，向后兼容由构造保证。

## 一、问题背景

### 1.1 两种既有模式的局限

| 模式 | API | handler 签名 | 能力 |
|---|---|---|---|
| 观察 | `emit` | `handle(event_type, context)` | 仅副作用，返回值被忽略 |
| 收集 | `emit_collect` | `handle(event_type, context)` | 返回一个值，调用方解读全部结果 |

两者都是扁平扇出：所有 handler 看到同一输入，无法在链中改写值，也无法终止链。命令分发路径的 workaround——返回 decision 字典、在 run.py 重新解读——无法表达"重写后再检查"这种需要把中间结果喂回链路的语义。

### 1.2 先例：Cordis waterfall

DeepSeek Harness 用 Cordis 瀑布分发解决同一问题：handler 收到 `(...args, next)`；调用 `next()` 委托（可选替换值）；不调用 `next()` 直接返回即短路。这正是其工具策略管线（tools/pre-execute → tools/execute → tools/post-execute）的核心：协作型 listener 通过 `next()` 委托并共享修改后的请求，而拥有决策权的策略 listener 不委托、直接返回。

## 二、特性设计

### 2.1 参与者契约

`gateway/hooks.py` 新增 `emit_waterfall(event_type, value, context)`，四参 handler `handle(event_type, value, context, next_fn)`：

- `await next_fn(new_value=...)` → 委托下游，可替换值；
- 不调用 `next_fn` 直接返回 → 短路，handler 返回值即瀑布结果；
- 旧的两参观察者继续在同一事件上运行：按序执行、返回值忽略、不能改写或短路——既有钩子用户零破坏；
- 失败语义区分：抛异常的瀑布参与者终止链（fail-closed），抛异常的观察者被隔离（链条继续）；
- 同步与异步 handler 均支持，通配事件匹配（`command:*`）适用。

### 2.2 三个设计决策

最小足迹：`HookRegistry` 上新增一个方法，`emit` / `emit_collect` 与任何调用点零改动，既有钩子完全不动。向后兼容由构造保证：arity 检查自动区分瀑布参与者与旧观察者，混合事件（观察者 + 瀑布参与者并存）无需配置开关即正确行为。真实消费方就绪：gateway 的 `command:*` 分发路径（以及未来的工具策略钩子）可以从 emit_collect + 调用方解读字典迁移到真正的中间件链——重写决策在链中向下游传播，而不是被调用方重新解析。文档侧在 website 的 hooks.md 新增 "Waterfall Handlers (around-middleware)" 章节，附策略示例、语义表与谱系说明。

## 三、实测结果

| 项目 | 结果 |
|---|---|
| `tests/gateway/test_hooks_waterfall.py`（新增 11 个回归测试） | 全部通过 |
| 覆盖场景 | 委托、重写传播、短路、观察者兼容（双向）、fail-closed、观察者隔离、异步观察者、空链、通配匹配、文件系统发现的瀑布 handler |
| 与既有 `tests/gateway/test_hooks.py` 合并 | 18 passed |
| `ruff check gateway/hooks.py tests/gateway/test_hooks_waterfall.py` | 全绿 |

## 四、平台兼容性与能力边界

| 平台 | 支持 |
|---|---|
| Linux / macOS / Windows | ✅ 纯 Python，无原生依赖 |
| CLI / Gateway / TUI / Desktop | ✅ gateway 事件钩子面 |

边界与注意点：两参 handler 一律按观察者处理——想成为瀑布参与者必须声明全部四个参数，漏一个就静默降级为观察者；链条意外停止有两种来源——参与者有意短路（特性）或抛异常（fail-closed），日志中 `[hooks] Error in waterfall handler` 行可定位；调用 `next_fn()` 时不传 `new_value=` 则值不重写、原样传递。短路返回值是最终结果、委托值向后续 handler 传播，这是与扁平扇出最本质的语义差异。

## 五、PR 信息

- **PR 地址**：https://github.com/NousResearch/hermes-agent/pull/85370
- **改动规模**：+486 / -0，3 个文件
- **状态**：open
- **提交时间**：2026-08-13

---

*本文记录 x7peeps 向 Hermes Agent 上游贡献的特性研究，所有数据来自 PR 实测记录。*
