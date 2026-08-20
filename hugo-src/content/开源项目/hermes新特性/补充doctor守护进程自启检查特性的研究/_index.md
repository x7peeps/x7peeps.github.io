---
date: "2026-08-17 10:34:57 +0800"
title: "补充doctor守护进程自启检查特性的研究"
weight: 20
tags: ["Hermes", "computer-use", "doctor", "开源贡献", "PR研究"]
menu:
  main:
    parent: "开源项目"
---

> **PR 地址**：[NousResearch/hermes-agent#81845](https://github.com/NousResearch/hermes-agent/pull/81845) · 为 `hermes doctor` 增加守护进程自启检查（daemon_autostart）与驱动版本门槛（version_gate），并沉淀 macOS 排障知识

## 研究摘要

之前，Hermes 的 computer-use（cua-driver）在 macOS 上存在两个难以察觉的故障模式：一是 cua-driver 守护进程重启后消失，用户只能等下次登录才发现自动化能力静默失效；二是驱动版本过旧时像素坐标点击静默降级（所有 bounds 返回 0,0,0,0），表面一切正常，实际坐标点击完全不可用。现在，跑一次 `hermes doctor`，报告里直接出现 `daemon_autostart` 与 `version_gate` 两个新条目，分别回答"守护进程能不能活过重启"和"驱动版本是否低于最低门槛"两个问题，失败时附上单条命令的修复路径。

本研究把一次真实的调试事故固化成永久诊断：集成 cua-driver 0.19+ 时先撞上 bounds=0 的坐标墙，升级驱动后又发现真正的运维缺口——没有任何机制能验证守护进程在重启后是否存活。PR 顺着这条路径把诊断能力补进既有 `hermes doctor` 报告，不新增独立命令、不新增 MCP 面、不改 schema，并把踩坑知识写进技能参考文档，让任何命中症状的会话都能直接读到解决方案。

## 一、问题背景

### 1.1 一次真实的故障链

集成过程中实测：`capture` 能看到 358 个可访问性元素、AXPress 点击成功，但所有 SOM 边界都返回 (0,0,0,0)，坐标点击完全不可行。根因是旧驱动（0.19 之前的 `get_window_state` 没有结构化帧）；升级驱动后暴露了更深一层的运维缺口：没有任何检查能告诉我们守护进程能否活过重启。故障链条是——旧驱动让坐标功能静默降级，重启让守护进程静默消失，而诊断手段全部缺失。

### 1.2 诊断缺失的两个层面

- 版本层面：旧驱动"能用"（元素索引点击可解析），用户无从得知像素坐标路径已静默退化；
- 运维层面：LaunchAgent 注册缺失或过期不会报错，只在下次登录后表现为自动化能力消失。

## 二、特性设计

### 2.1 daemon_autostart 检查

`tools/computer_use/doctor.py` 新增 `_autostart_probe`，通过 `cua-driver autostart status` 探测守护进程的注册状态，输出三态：

- `pass` — 自启已注册（守护进程运行中，或空闲但已注册）；
- `fail` — 未注册，每次登录后需手动启动；
- `skip` — 二进制无法解析，或驱动过旧不支持该子命令（0.19.2 之前返回 "Windows-only" 桩错误），永不致命。

检查复用既有 `resolve_cua_driver_cmd()`，只跑一个子进程。设计上刻意选 CLI 探测而非新增核心工具：无新 MCP 面、无 schema 变更、无新环境变量，走最小足迹路径；在 `autostart` 是桩的驱动上报告 `skip` 并附上下文，不破坏 doctor 整体通过。

### 2.2 配套上游：trycua/cua#2990

本 PR 是一对改动的一半：诊断依赖的 `cua-driver autostart` 子命令在 macOS 上原本是 "Windows-only" 桩。配套 PR [trycua/cua#2990](https://github.com/trycua/cua/pull/2990) 实现了 macOS LaunchAgent 自启：enable/disable/status/kick 四个子命令，注册在 `~/Library/LaunchAgents/`，label 与驱动的 TCC 身份一致（`com.trycua.driver`），保证辅助功能与屏幕录制授权跨登录持久；使用 macOS 13+ 的 `launchctl bootstrap`/`bootout`/`kickstart`，并带 `KeepAlive` 实现崩溃重启语义。关系是：#2990 让守护进程活过重启（上游能力），本 PR 让 Hermes 能验证它（诊断）。在 #2990 随版本发布前，macOS 上该检查降级为 `skip`，因此探测被刻意设计为非致命。

### 2.3 version_gate：把静默降级变成可诊断失败

后续提交补充版本门槛：`_parse_version_tuple` 把 X.Y.Z / X.Y 解析为可比较元组；`_version_gate_check` 在版本低于 0.10.0 时报告 `fail`（0.10.0 是 Hermes computer-use 后端对齐的契约，`structuredContent.elements` 帧在 trycua/cua#1961 落地），附提示 `hermes computer-use install --upgrade`；达到或超过则 `pass`；版本字符串无法解析时 `skip`，避免异常输出误导。该检查接入 `_compose_fallback_report` 的 binary_version 之后，原来静默的 (0,0,0,0) 降级现在以可诊断失败的形式呈现，且修复只差一条命令。

### 2.4 文档优先沉淀排障知识

技能参考新增 "Computer use not working (cua-driver)" 章节，收录五类实测踩坑：bounds 全零与 AXPress 可用并存指向旧驱动（附升级路径）；守护进程重启即死需 `cua-driver autostart enable`，以及 LaunchAgent label 匹配 TCC 身份才能让授权跨登录持久；授权已给但仍无法 capture 时守护进程必须以 CLI 身份运行而非 `open -a CuaDriver --args serve`；`permissions status` 报 `daemon_running: false` 而 capture 正常是 launchd 托管守护进程的已知探测怪癖，以 launchctl 与真实 bounds 为准；对 CuaDriver.app 做 cp/mv 报 "Operation not permitted" 是 TCC 应用完整性保护，需 rm 后重建再重新授权。知识放进技能参考而非代码注释，是为了让命中症状的会话能直接加载到上下文。

## 三、实测结果

| 测试 | 结果 |
|---|---|
| `tests/computer_use/test_doctor.py`（15 个既有 + 7 个 `_autostart_probe` 新增） | 22 passed |
| `tests/computer_use/` 全量 | 51 passed |
| version_gate 提交后 doctor 测试（新增 9 个：阈值通过/低于最低/不可解析 skip/预发布解析/元组解析） | 31 passed |
| 真机 macOS 26.5.2 + cua-driver 0.19.1 | 报告 `skip`（旧桩），优雅降级 |
| 真机 + 0.19.2 调试构建 | `pass: autostart registered and daemon running` 与 `fail: not-registered` 两种状态均对真实 launchd 托管守护进程实测通过 |

开发过程还暴露了一个实现细节：新测试抓到了两个真实子串 bug——`not-registered` 包含 `registered`、`not running` 包含 `running`，字符串判断的顺序错误会直接导致结果误报，这正是测试先行锁住检查顺序的价值。

## 四、平台兼容性与能力边界

| 平台 | 状态 |
|---|---|
| macOS | 通过 CLI 探测 LaunchAgent 注册（需 cua-driver 0.19.2+ 实现 macOS autostart） |
| Windows | 同一 CLI 探测，对应计划任务状态 |
| Linux | `autostart` 上游仍是桩，报告 `skip` 并附驱动给出的可操作信息 |
| 驱动 < 0.19.2 | `skip`（子命令不可用），doctor 其余检查照常通过 |

已知边界：检查信任 cua-driver 的 CLI 输出；在子命令缺失的平台/驱动上降级为 `skip` 是正确行为，但意味着旧驱动上的过期注册故障不会被上报。待配套的 trycua/cua#2990 随版本发布后，macOS 与 Windows 上该检查才升级为完整的 pass/fail。

## 五、PR 信息

- **PR 地址**：https://github.com/NousResearch/hermes-agent/pull/81845
- **改动规模**：+277 / -0，3 个文件
- **状态**：open
- **提交时间**：2026-08-08

---

*本文记录 x7peeps 向 Hermes Agent 上游贡献的特性研究，所有数据来自 PR 实测记录。*
