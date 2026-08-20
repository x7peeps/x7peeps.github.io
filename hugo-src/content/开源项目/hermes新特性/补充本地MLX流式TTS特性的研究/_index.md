---
title: "补充本地MLX流式TTS特性的研究"
date: 2026-08-17 10:34:57 +0800
weight: 1
tags: ["Hermes", "TTS", "MLX", "开源贡献", "PR研究"]
menu:
  main:
    parent: "开源项目"
---

> **PR 地址**：[NousResearch/hermes-agent#85071](https://github.com/NousResearch/hermes-agent/pull/85071) · 本地 MLX Qwen3-TTS 流式 provider（qwen3tts-mlx）

## 研究摘要

Hermes 的会话语音（session speech、语音气泡）原本依赖云端流式 TTS provider（elevenlabs / openai / gemini / xai），本地 TTS 引擎只能走**同步合成**路径——每说一句话，都要完整跑一次模型加载 + 整段文本合成，延迟高达 47 秒。本研究向 Hermes 上游补充了一个**本地 MLX 流式 TTS provider**（`qwen3tts-mlx`），把 Apple Silicon 上 Qwen3-TTS 声音克隆引擎的**逐句流式产出能力**接入既有流式管线：实测 4 段文本在 t=4.2s / 7.6s / 11.6s / 16.9s 依次产出，对比整 buffer 一次合成的 47s，**端到端感知延迟降低一个数量级**，且全程本地推理、无云端依赖、支持自定义克隆音色。

## 一、问题背景：会话语音为什么卡在本地引擎上

### 1.1 Hermes 语音架构的现状

Hermes 上游已经定义好 `StreamingTTSProvider` 抽象基类（`tools/tts_streaming.py`），云端 provider（elevenlabs / openai / gemini / xai）都实现了流式接口：边说边合成、边说边播。

但**本地 TTS 引擎**（Piper / KittenTTS / NeuTTS / Qwen3-TTS）只通过 command provider 走**同步合成**（`tts.providers.<name>.type: command`）——一次性接收完整文本，输出完整音频。这意味着在会话语音场景下：

- 本地引擎每说一句话，就要**重新加载一次模型**；
- 一整段话要等**全部合成完**才开始播放；
- Apple Silicon 用户即使配好了本地声音克隆引擎，也无法享受流式语音对话的体验。

### 1.2 一个被忽略的事实：mlx-audio 的 Qwen3-TTS 本来就是生成器

关键洞察来自 mlx-audio 的实现：Qwen3-TTS 的 generator **本身支持按段产出**——只要输入按换行符分隔，`model.generate()` 就会在每段合成完成时**立刻 yield 对应音频**，而不是等全部完成。

实测（Apple M5 Max）：4 段文本流式产出时间点分别为 **t=4.2s / 7.6s / 11.6s / 16.9s**，而整 buffer 一次合成耗时 **47s**。

也就是说：**能力在底层就存在，缺的只是把它接进 Hermes 流式管线的那一层胶水。** 这正是本次特性补充的核心价值——不发明新能力，而是打通被架构割裂的既有能力。

## 二、特性设计：一个 provider，一层子进程隔离

### 2.1 注册与可用性

在 `tools/tts_streaming.py` 中新增 `@register("qwen3tts-mlx")` 注册的流式 provider 类，实现两个关键方法：

- `available()`：检查 MLX venv 与 worker 脚本是否存在（不存在则优雅降级，不影响其他 streamer）；
- `stream(text)`：真正的流式合成入口。

配置面完全增量式：`tts.streaming.provider: qwen3tts-mlx` 即可选中；`tts.streaming.qwen3tts-mlx.model_dir` / `.ref_audio` 覆盖默认路径。

### 2.2 子进程隔离：为什么必须这么做

`stream()` 会启动一个**专属 MLX venv 子进程**（`~/.hermes/tts/mlx_stream_worker.py`），通过管道读回 `[u32 长度][int16 PCM]` 帧序列。worker 内部：按换行符切分文本 → 逐段 `model.generate(..., ref_audio, ref_text, lang_code="Chinese")` → 每段合成完立刻写出一帧 PCM。

子进程隔离是**强制要求**，根因是一个真实的依赖冲突：

> mlx-audio 锁定 `transformers 5.0.0rc3`，而 Hermes 运行时 venv 里 `qwen_tts` 锁定 `4.57.3`——两个版本并存会直接报 `check_model_inputs() missing 'func'`。

把 MLX 放进独立 venv、通过子进程桥接，与既有 command provider 的模式一致，互不污染。

### 2.3 资源守卫：本地流式 prefetch 串行化（2026-08-17 迭代）

`stream_tts_to_speaker` 原本会对**下一句**做 prefetch（Semaphore 3 并发）——对云端 provider 这是网络开销，便宜；但对本地 MLX streamer，**每次并发 prefetch 都会再拉起一个 MLX worker 子进程**（每个占 2-3GB 内存 + GPU）。3 路 prefetch = 3 个本地推理 worker 同时跑，内存压力翻三倍、GPU 互相争抢。

本次 PR 同步做了守卫：通过本地 streamer 类携带的 `_VENV` 属性识别本地流式引擎，将 prefetch 信号量降为 **1 槽串行**；云端 provider 保持 3 路并发。零新增配置项，配套回归测试 `test_local_mlx_streamer_serializes_prefetch` 锁定行为。

## 三、实测结果

### 3.1 测试套件

| 测试 | 结果 |
|---|---|
| `tests/tools/test_tts_streaming_mlx.py`（注册、可用性、帧顺序、worker 失败传播、分节参数） | 6 passed |
| 流式 + 分块全量套件 | 39 passed, 12 skipped（CI 无 MLX venv 跳过项） |
| 资源守卫回归测试 | passed |

### 3.2 真机端到端

本机实测 `Qwen3TTSMLXStreamer.stream("…\n…")`：

- 产出 **3 个 PCM 帧**；
- **TTFB 8.8s**（含模型加载）——此后每句秒级跟进；
- 正确的 **24kHz int16** 布局。

### 3.3 核心对比数据（Apple M5 Max）

| 方案 | 4 段文本产出时间点 | 首帧感知延迟 |
|---|---|---|
| 整 buffer 一次合成 | t=47s 全部完成 | 47s |
| MLX 流式 provider | t=4.2s / 7.6s / 11.6s / 16.9s | ~4.2s（含加载 8.8s 含模型加载） |

## 四、平台兼容性

| 平台 | 影响 |
|---|---|
| macOS Apple Silicon | ✅ 主目标（MLX + mlx-audio） |
| macOS Intel / Linux | ⚠️ 无 MLX venv 时 `available()` 返回 False，不影响其他 streamer |
| Windows | ⚠️ 无 MLX，特性缺席、无回归 |

## 五、能力边界与后续

- **适用前提**：需要先按 `local-tts-optimization`（配套 PR #85041）或 `x7peeps/hermes-tts-kit` 搭好 MLX 环境与克隆音色；
- **首句延迟仍受模型加载影响**（~8.8s），这是本地推理的固有成本，收益在**句间流式衔接**与**零云端依赖**；
- 依赖冲突（transformers 版本）已被子进程隔离化解，但这也是后续升级 mlx-audio 时需要注意的耦合点。

## 六、PR 信息

- **PR 地址**：https://github.com/NousResearch/hermes-agent/pull/85071
- **提交记录**：3 个 commit（本地 MLX 流式 provider 主体 + 测试 mock + 资源守卫），已 rebase 到最新 main
- **改动规模**：+220 / -1，4 个文件
- **配套技能**：`skills/productivity/local-tts-optimization`（PR #85041）记录了完整的环境搭建与调优方法

---

*本文记录 x7peeps 向 Hermes Agent 上游贡献的特性研究，所有数据来自 PR 实测记录。*
