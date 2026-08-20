---
date: "2026-08-17 10:34:57 +0800"
title: "补充视频分析抽帧适配特性的研究"
weight: 23
tags: ["Hermes", "视觉", "视频分析", "开源贡献", "PR研究"]
menu:
  main:
    parent: "开源项目"
---

> **PR 地址**：[NousResearch/hermes-agent#82996](https://github.com/NousResearch/hermes-agent/pull/82996) · video_analyze 为本地 VLM 端点自动抽帧

## 研究摘要

之前，`video_analyze` 把整个视频作为单条 base64 `video_url` 负载发给视觉端点——这对云多模态 provider（Gemini 等）有效，但对本地 OpenAI 兼容 VLM（Ollama、mlx-vlm server、llama.cpp server、LM Studio）会直接失败：它们的处理器基于图像/codec，拒绝或静默丢弃 `video_url` 内容类型（Hermes issue #72275 记录了云端一侧的同类问题）。现在，检测到视觉端点指向本机地址时，工具自动用 ffprobe 均匀抽帧、生成最多 16 张 JPEG data URL 按序发送，端点回云端或抽帧失败时回退到原整视频路径。

实测（Apple M5 Max 128GB + mlx-vlm 服务 Microsoft Mage-VL-8bit）：30 秒 960×540 足球解说视频抽 16 帧约 13 秒完成分析，输出"四名男子正在讨论一场足球比赛"的准确描述；桌面截图识别出 dock、Finder/Safari/Mail、终端标题与服务器状态；4 张连续桌面截图能正确报告"第三帧出现了弹窗"。测试套件 99 passed（含 8 个新增）。

## 一、问题背景

### 1.1 本地 VLM 是趋势，但视频路径是断的

本地 VLM 正在成为隐私优先与零成本的选择，codec 原生流式 VLM（Microsoft Mage-VL，4B，Apache-2.0）已发布 Apple Silicon MLX 权重，笔记本上几秒就能完成整段视频分析。但 Hermes 的视频分析路径对它们完全不兼容：整视频单负载的前提是云端多模态处理器的 codec 能力，本地处理器的图像/codec 基础与这个契约不匹配。结果是——本地栈用户要么放弃视频分析，要么让视频字节离开机器回云端。

### 1.2 一个契约，两个实现缺口

`mlx_vlm generate --video` 对不支持原生视频的处理器已经定义了"按序发送图像帧"的契约，问题在于 Hermes 侧没接入。本 PR 补的是 Hermes 这一端；配套上游 PR [Blaizzy/mlx-vlm#1836](https://github.com/Blaizzy/mlx-vlm/pull/1836) 在 mlx-vlm 的 OpenAI 兼容服务端加入同样的帧回退，让任何 OpenAI 兼容客户端都能把 `video_url` 内容部分发给 Mage-VL 级处理器而不触发 500。两端合起来覆盖整条链路。

## 二、特性设计

### 2.1 三个函数，最小改动

- `_is_local_vision_endpoint(cfg)`：检测 `auxiliary.vision.base_url` 是否指向 localhost / 127.0.0.1 / 0.0.0.0 / ::1；
- `_video_to_frame_data_urls(video_path)`：基于 ffprobe 的均匀帧采样，最多 16 张 base64 JPEG data URL，长边上限 448px；
- `video_analyze_tool`：端点为本地时按序发送图像帧（与 `mlx_vlm generate --video` 既有契约一致）；抽帧失败或端点为云时回退到原整视频 base64 路径。

### 2.2 为什么是扩展既有工具（足迹阶梯）

选择扩展既有 `video_analyze` 而不是新增核心工具：每次 API 调用零新增面、完全向后兼容、一次解锁全部本地 VLM 而不是为单个模型特判。帧消息契约与 mlx-vlm 生态预期一致，行为可预期。

### 2.3 安全与失败路径

无新增出口流量——帧 base64 发往与之前相同的视觉端点；无新凭据读取、无动态代码执行、ffmpeg 参数走 argv 列表无 shell 插值；本地文件读取仍过 `agent.file_safety.raise_if_read_blocked`，非本地终端后端保留沙箱媒体解析器。所有失败路径安全闭合：未知主机 → 原 base64 路径；无 ffmpeg → 原路径；抽帧错误 → 原路径。

## 三、实测结果

| 场景（M5 Max 128GB, mlx-vlm + Mage-VL-8bit） | 结果 |
|---|---|
| 足球解说视频（30s, 960×540） | "A group of four men are discussing a soccer match."，16 帧约 13s |
| 桌面截图 | 识别出 macOS dock、Finder/Safari/Mail、终端标题、服务器状态 |
| 4 张连续桌面截图（第 3 帧打开 TextEdit） | 正确报告"第三帧右下角出现弹窗" |
| 测试套件 | 99 passed（`test_video_analyze.py` +8 新，及 vision 路由 / region / native fast path 等套件） |

## 四、平台兼容性与能力边界

| 平台 | 状态 |
|---|---|
| macOS Apple Silicon | ✅ 主目标，已对 mlx-vlm + Mage-VL-8bit 实测 |
| macOS Intel / Linux / Windows | ✅ 有 ffmpeg + 本地 VLM 服务即可，抽帧与操作系统无关 |
| 云端端点 | ✅ 不变（整视频 base64 路径保留） |

边界与局限：`base_url` 必须精确使用 localhost / 127.0.0.1 等被识别为本地的形式，IPv6 `[::1]` 目前回退到整视频路径（安全方向）；ffmpeg / ffprobe 需在 PATH 中；本地 VLM 服务需支持单条消息多个 image_url 内容部分（mlx-vlm ≥0.6、Ollama、llama.cpp 实测支持）；16 帧约 800KB 负载，相对 50MB 整视频上限大幅缩减，裁剪（trim）参数仍被尊重。

## 五、PR 信息

- **PR 地址**：https://github.com/NousResearch/hermes-agent/pull/82996
- **改动规模**：+350 / -26，2 个文件
- **状态**：open
- **提交时间**：2026-08-10

---

*本文记录 x7peeps 向 Hermes Agent 上游贡献的特性研究，所有数据来自 PR 实测记录。*
