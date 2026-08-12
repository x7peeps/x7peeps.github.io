---
title: "macOS 本地 TTS 声音克隆实测：VoxCPM、CosyVoice、Qwen3-TTS 四方案横评"
weight: 9
tags: [TTS, 声音克隆, macOS, Apple Silicon, VoxCPM, CosyVoice, Qwen3-TTS, 本地推理]
menu:
  main:
    parent: "AI工程化"
---

# macOS 本地 TTS 声音克隆实测：VoxCPM、CosyVoice、Qwen3-TTS 四方案横评

> 一句话结论：**在 Apple Silicon 上做声音克隆，Qwen3-TTS 是综合体验最优的选择**；VoxCPM1.5 吐字清晰但语气平淡，CosyVoice2 语气自然但受参考音频质量影响大，CosyVoice3 目前 CPU 推理不稳定，而 VoxCPM2 在 Apple Silicon 上存在数值塌缩问题。

## 背景：为什么要在本地做声音克隆

云端 TTS 服务（如 ElevenLabs）虽然音质好，但存在三个硬伤：**按字符计费、音频数据必须上传、声音特征存在第三方服务器**。对于安全从业者而言，最后一条尤其致命——声音是生物特征，与指纹、人脸同级。

本地方案的价值在于：

- **零成本**：一次模型下载，永久免费使用
- **隐私**：参考音频与合成结果不出本机
- **可控**：可以接入 Agent 工作流，实现自动化配音
- **离线可用**：断网也能跑

本篇文章记录了我在 macOS（Apple Silicon）上对四个主流开源 TTS 克隆方案的完整实测过程，包括环境搭建、踩坑记录、频谱分析对比与最终选型建议。

---

## 1. 测试环境与候选模型

### 1.1 硬件环境

| 项目 | 配置 |
|---|---|
| 机型 | Apple Silicon（M 系列） |
| 内存 | 128 GB |
| Python | 3.11.15 |
| PyTorch | 2.13.0（MPS 可用） |
| 操作系统 | macOS |

### 1.2 候选模型

| 模型 | 参数规模 | 采样率 | 克隆方式 | 许可证 |
|---|---|---|---|---|
| VoxCPM2 | 2B | 48 kHz | reference_wav_path | Apache-2.0 |
| VoxCPM1.5 | 0.5B | 44.1 kHz | prompt_wav_path + prompt_text | Apache-2.0 |
| CosyVoice2 | 0.5B | 24 kHz | 零样本（参考音频） | Apache-2.0 |
| CosyVoice3 | 0.5B | 24 kHz | 零样本（参考音频） | Apache-2.0 |
| Qwen3-TTS-12Hz | 1.7B | 24 kHz | ref_audio + ref_text | Apache-2.0 |

**参考音频**：一段约 20 秒的连贯人声独白（从直播录屏中截取并降噪处理），转写文本约 40 字，内容为开播问候语。

---

## 2. 环境搭建与模型下载

### 2.1 国内网络环境下的模型获取

模型托管在 HuggingFace / ModelScope，国内直连 HuggingFace 基本不可用。实测有效的组合是：

```
ModelScope 直链 + aria2 多线程（限速 ~2MB/s）
hf-mirror.com 镜像 + 本地代理（实测 12MB/s）
```

**下载经验**：
- 大文件（>1.5GB）用 aria2 多线程下 .safetensors 没问题，但 **.pt / .pth（zip 格式）必须单线程**，多线程会损坏 zip 中央目录
- 损坏的典型症状：`PytorchStreamReader failed reading zip archive: failed finding central directory`
- 修复方法：curl 分段下载（8 段并行 + 拼接）最可靠
- ModelScope snapshot_download 可能死锁，需要手动清理 `~/.cache/modelscope/.lock/*.lock`

### 2.2 依赖安装（独立 venv）

Qwen3-TTS 依赖 transformers 4.57+，CosyVoice 依赖 transformers 4.43，**两者冲突**，必须用独立 venv 隔离：

```bash
# CosyVoice 环境
python -m venv cosyvoice-venv
env -u PYTHONPATH cosyvoice-venv/bin/pip install \
  cosyvoice torch transformers==4.43.3 \
  hyperpyyaml onnxruntime soundfile

# Qwen3-TTS 环境（复用 cosyvoice-venv，升级 transformers）
env -u PYTHONPATH cosyvoice-venv/bin/pip install qwen-tts
```

**关键坑**：`PYTHONPATH` 环境变量如果指向其他 venv 的 site-packages，会导致 import 到错误的依赖版本。必须用 `env -u PYTHONPATH` 隔离。

### 2.3 torchaudio 的 torchcodec 坑

新版 torchaudio（2.9+）默认使用 torchcodec 作为音频后端，但 torchcodec 对 tensor 输入要求 `kUInt8` 类型。CosyVoice 的 `load_wav` 会传 float tensor 导致崩溃。**解决方案**：patch `file_utils.py` 的 `load_wav`，让文件路径走 soundfile 读取：

```python
def load_wav(wav, target_sr, min_sr=16000):
    import soundfile as sf
    if isinstance(wav, str):
        speech, sample_rate = sf.read(wav, dtype='float32', always_2d=True)
        speech = torch.from_numpy(speech.T)
    ...
```

---

## 3. 实测过程与频谱分析

### 3.1 音频质量评估方法

人耳主观听感之外，用四个客观指标评估合成质量：

| 指标 | 含义 | 健康范围 |
|---|---|---|
| **ZCR（过零率）** | 信号过零频率，反映辅音丰富度 | 0.05 - 0.15 |
| **RMS** | 响度 | 越高越响亮 |
| **100-500Hz 能量占比** | 低频能量，过高=发闷/嗡 | 越低越好 |
| **2000-5000Hz 能量占比** | 高频辅音清晰度 | 越高越好（正常 30%+）|

### 3.2 核心发现：VoxCPM2 在 Apple Silicon 上数值塌缩

**VoxCPM2 是重灾区**。无论怎么调参（device=CPU/MPS、optimize=True/False、cfg_value、denoiser、soundfile 后端、文本有无标点），输出频谱都惊人地一致：

```
100-500Hz: 58-75%（严重偏高）
2000-5000Hz: 7-8%（严重偏低）
ZCR: 0.043（远低于人声 0.05-0.15）
```

即使**完全不提供参考音频**（voice design 模式），输出特征也完全相同。这排除了"参考音频质量差"的可能，定位到 **VoxCPM2 的 48kHz AudioVAE + 512-dim FSQ 新架构在 Apple Silicon 上数值不稳定**。

**对照实验证明**：
- VoxCPM2（48kHz 新架构）：全部失败，14 次实验输出一致
- VoxCPM1.5（44.1kHz 老架构）：成功，吐字清晰

结论：**不是环境问题，是 VoxCPM2 新架构的固有问题**。

### 3.3 llama.cpp-omni 路径验证

VoxCPM2 官方推荐 GGUF 推理路径。实测走通完整链路：

```
PyTorch 权重 → convert_voxcpm2_to_gguf.py → F16 GGUF（BaseLM 3.1GB + Acoustic 1.7GB）
→ cmake 编译 llama.cpp-omni（GGML_METAL=ON）→ voxcpm2-cli 推理
```

**结果**：RTF 0.946x（比 PyTorch 快 50%），Metal 后端正常，但**输出频谱与 PyTorch 完全一致**（58-61% 低频）。进一步确认了 VoxCPM2 输出特征是模型本身的。

### 3.4 四模型最终对比

| 模型 | 时长 | ZCR | 低频占比 | 高频占比 | 主观听感 |
|---|---|---|---|---|---|
| VoxCPM1.5 | 6.7s | 0.069 | 77% | 9% | 吐字清晰，语气平淡 |
| CosyVoice2 | 6.6s | 0.097 | 61% | 12% | 语气自然，受参考质量影响大 |
| CosyVoice3 | 3.6s | 0.125 | 34% | 23% | 频谱最优，但 CPU 推理不稳定 |
| **Qwen3-TTS** | **5.9s** | **0.083** | **81%** | **2%** | **音质完整度最佳** |

*注：各模型生成时长不同源于参考音频人声长度差异，Qwen3-TTS 使用 20s 连贯参考后完整度最好。*

### 3.5 参考音频质量的决定性作用

**教训：参考音频质量直接决定克隆成败。**

最初使用的参考段是从直播录屏中截取的碎片化语音（"放大一点""昨晚怎么还有台湾江"这类操作指令），所有模型输出都不理想。**换成 20 秒连贯独白后，效果显著提升**（CosyVoice2 从 6.6s 短句提升到 24s 完整段落）。

选择参考音频的原则：

- ✅ 单人连续独白 10-30 秒
- ✅ 无背景音乐、无多人对话
- ✅ 音质干净（手机远场录音高频信息不足）
- ✅ 语速正常，不要碎片化

---

## 4. 最终选型：Qwen3-TTS

综合 22 次实验，**Qwen3-TTS-12Hz-1.7B-Base** 胜出：

### 4.1 完整调用代码

```python
import torch
import soundfile as sf
from qwen_tts import Qwen3TTSModel

model = Qwen3TTSModel.from_pretrained(
    "本地模型目录/Qwen3-TTS-12Hz-1.7B-Base",
    device_map="cpu",
    dtype=torch.float32,
    attn_implementation="eager",
)

wavs, sr = model.generate_voice_clone(
    text="我今天用人工智能技术克隆了一段声音让机器说出任何我想说的话",
    language="Chinese",
    ref_audio="reference.wav",        # 参考音频路径
    ref_text="参考音频的精确转写文本",  # 必须与音频内容匹配
)

sf.write("output.wav", wavs[0], sr)
```

### 4.2 关键参数

| 参数 | 说明 |
|---|---|
| `ref_audio` | 参考音频，本地路径/URL/base64/numpy 均可 |
| `ref_text` | **参考音频的精确转写**，影响克隆对齐质量 |
| `language` | 明确指定语言（如 "Chinese"）优于自动检测 |
| `x_vector_only_mode` | 只取声纹嵌入时无需 ref_text，但克隆质量下降 |
| `voice_clone_prompt` | 多次生成时可复用，避免重复计算 prompt 特征 |

### 4.3 性能实测

| 指标 | 数值 |
|---|---|
| 模型加载 | 2s |
| 生成 6s 音频 | 17s（RTF ~2.9）|
| 参考音频要求 | 5-30s，单人连贯独白 |
| 采样率 | 24 kHz |

---

## 5. 生产实践建议

### 5.1 接入 Agent 工作流

Qwen3-TTS 可以封装为本地 TTS 服务，供 Agent 调用：

1. **常驻模型**：加载一次后常驻内存（2GB 左右），避免重复加载
2. **批量生成**：用 `create_voice_clone_prompt` 复用参考音频特征，批量合成
3. **分句合成**：长文本按句切分，逐句生成后拼接，避免 token 超限

### 5.2 声音版权合规

克隆他人声音（哪怕是主播、公众人物）前，必须确认：

- ✅ 获得声音所有者明确授权
- ✅ 或使用自己的声音
- ⚠️ 用于商用/公开传播需格外谨慎

### 5.3 备选方案

- **CosyVoice2**：如果参考音频质量很高（专业录音棚干声），可以试它，语气更自然
- **VoxCPM1.5**：追求吐字清晰度且对语气要求不高时可用
- **VoxCPM2 / CosyVoice3**：目前不建议在 Apple Silicon CPU 环境使用，等后续版本修复

---

## 6. 踩坑清单（速查）

| 问题 | 现象 | 解决 |
|---|---|---|
| aria2 多线程下 .pt 损坏 | zip central directory 缺失 | 单线程或 curl 分段下载 |
| PYTHONPATH 污染 | import 到错误 transformers 版本 | `env -u PYTHONPATH` |
| torchcodec 报错 | tensor 必须 kUInt8 | patch load_wav 走 soundfile |
| 模型输出"嗡嗡声" | 低频占比 70%+ | 换模型（VoxCPM2 固有问题）|
| 合成太短 | 只念半句 | 换更长更连贯的参考音频 |
| HuggingFace 无法下载 | 连接超时 | hf-mirror + 本地代理 |

---

## 7. 总结

在 Apple Silicon 上做本地声音克隆，经过 22 次系统性实验，结论清晰：

1. **Qwen3-TTS 是当前最优选择**——完整度、稳定性、易用性综合最佳
2. **参考音频质量 > 模型参数**——20 秒连贯独白远胜碎片语音
3. **VoxCPM2 新架构在 Apple Silicon 有数值问题**——不是参数能救的
4. **国内网络下模型获取**：hf-mirror + 代理 + aria2 分段下载是可靠组合

本地 TTS 的价值不在"替代云端"，而在**把声音这个生物特征留在自己手里**。对于安全从业者，这本身就是一种安全实践。
