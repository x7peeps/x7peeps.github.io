---
title: "AI红队与对抗性机器学习安全取证深度分析"
date: 2026-07-18T10:30:00+08:00
draft: false
weight: 920
description: "系统剖析AI红队对抗性攻击的取证分析方法论，涵盖对抗样本生成与检测、模型提取与窃取取证、训练数据投毒分析、模型后门植入检测、LLM提示注入与越狱攻击取证，结合模型完整性验证与异常行为检测等自动化手段，通过BadNets、Adversarial Patch、ChatGPT越狱、HuggingFace投毒等真实案例还原AI安全事件完整取证链"
categories: ["应急响应", "取证分析"]
tags: ["AI红队", "对抗性机器学习", "Adversarial ML", "模型安全", "数据投毒", "模型后门", "LLM安全", "提示注入", "Prompt Injection", "MITRE ATT&CK"]
---

# AI红队与对抗性机器学习安全取证深度分析

随着人工智能系统在关键基础设施、金融交易、自动驾驶、医疗诊断和内容审核等高风险领域的广泛部署，针对AI模型本身的攻击已成为网络安全领域最具挑战性的前沿课题。AI红队（AI Red Teaming）作为模拟攻击方，系统性地发现和利用机器学习系统中的对抗性漏洞，而蓝队取证分析人员则需要识别、分析和溯源这些对抗性攻击的完整证据链。

与传统软件漏洞不同，对抗性机器学习攻击利用的是模型的数学特性——梯度信息、统计泛化能力、决策边界几何结构——而非代码逻辑缺陷。这使得取证分析面临独特挑战：对抗样本在数值层面的微小扰动在传统文件分析中几乎不可见；模型权重的隐蔽篡改不会改变文件大小或格式；训练数据中的投毒样本在统计层面极难与正常数据区分；LLM的提示注入攻击利用自然语言的歧义性，使得恶意指令在日志中看似正常文本。

2024年MITRE ATLAS（Adversarial Threat Landscape for AI Systems）框架已将对抗性机器学习攻击纳入标准化分类体系，涵盖从数据收集到模型部署的完整攻击面。本文从蓝队取证实战视角出发，系统性地覆盖AI红队对抗性攻击的全链路取证分析方法论，结合Sigma规则、Python检测脚本和Bash自动化分析工具，通过BadNets、Adversarial Patch、ChatGPT越狱、HuggingFace模型投毒等真实案例还原完整的取证分析流程。

---

## 0x01 技术基础与AI安全攻防概述

### 机器学习生命周期攻击面

机器学习系统的生命周期涵盖数据收集、数据预处理、模型训练、模型评估、模型部署和在线推理六个阶段，每个阶段都存在独特的攻击面。

| 生命周期阶段 | 核心活动 | 攻击向量 | MITRE ATLAS 技术编号 |
|------------|---------|---------|-------------------|
| 数据收集 | 数据采集、清洗、标注 | 数据投毒、标签翻转、数据窃取 | AML.T0020 Poison Training Data |
| 数据预处理 | 特征工程、归一化 | 特征操纵、元数据篡改 | AML.T0021 Compromise ML Supply Chain |
| 模型训练 | 梯度优化、超参调优 | 后门植入、训练过程劫持 | AML.T0022 Poison Training Model |
| 模型评估 | 验证测试、性能基准 | 测试集污染、评估指标欺骗 | AML.T0043 Evasion |
| 模型部署 | 模型序列化、API封装 | 模型文件篡改、依赖库投毒 | AML.T0024 Model Theft |
| 在线推理 | 输入处理、输出生成 | 对抗样本、Prompt注入、模型提取 | AML.T0043 Evasion / AML.T0051 LLM Prompt Injection |

在红队对抗性攻击的视角下，攻击者可以处于生命周期的任何位置：作为内部人员在训练阶段植入后门（Insider Threat），作为外部攻击者在推理阶段注入对抗样本（Adversarial Examples），或作为供应链攻击者在模型分发环节篡改模型文件（Supply Chain Attack）。

### 与传统安全的本质差异

对抗性机器学习攻击与传统网络安全攻击在多个维度存在本质差异，理解这些差异是构建有效取证方法论的基础。

| 对比维度 | 传统网络攻击 | 对抗性ML攻击 |
|---------|------------|-------------|
| 攻击目标 | 系统机密性、完整性、可用性 | 模型预测准确性、鲁棒性、隐私性 |
| 攻击向量 | 网络协议、应用漏洞、配置缺陷 | 数值扰动、数据污染、模型篡改 |
| 攻击可见性 | 异常流量、异常日志、异常进程 | 数值层面微小变化，传统监控难以发现 |
| 攻击持久性 | 恶意文件、注册表、计划任务 | 模型权重永久改变、训练数据永久污染 |
| 检测方法 | 签名匹配、行为分析、流量分析 | 统计检测、鲁棒性测试、模型审计 |
| 证据形态 | 网络包、日志文件、恶意代码 | 模型权重、梯度信息、训练数据、API日志 |
| 复现性 | 确定性复现 | 随机性因素、温度参数、采样策略影响 |

对抗性机器学习攻击的一个关键特征是**攻击的隐蔽性与泛化性**。传统的对抗样本（如FGSM生成的扰动）在像素级别的变化人眼不可见，但能导致模型以极高置信度输出错误预测。模型后门攻击（如BadNets）在正常输入下模型行为完全正常，仅在遇到特定触发器（Trigger）时才激活恶意行为。这种"条件触发"特性使得传统的行为分析和异常检测方法面临极大挑战。

### AI红队工具链

AI红队对抗性测试需要一套覆盖模型分析、攻击生成、防御评估和自动化扫描的专门化工具链。

| 工具名称 | 核心功能 | 适用攻击场景 | 安装方式 |
|---------|---------|------------|---------|
| ART（Adversarial Robustness Toolbox） | 对抗样本生成与防御评估 | FGSM/PGD/C&W攻击、模型鲁棒性测试 | pip install adversarial-robustness-toolbox |
| CleverHans | 对抗样本基准测试 | 模型脆弱性评估、攻击方法比较 | pip install cleverhans |
| IBM Counterfit | AI模型安全评估平台 | 端到端AI安全测试、红队自动化 | pip install counterfit |
| TextAttack | NLP模型对抗攻击 | 文本分类器对抗样本、Prompt注入 | pip install textattack |
| Garak | LLM漏洞扫描 | Prompt注入、有害内容、越狱检测 | pip install garak |
| PyRIT | LLM红队自动化 | 多轮对话攻击、自动化越狱 | pip install pyrit |
| ModelScan | 模型文件安全扫描 | 检测恶意序列化载荷 | pip install modelscan |
| BackdoorBench | 后门攻击基准 | 后门植入与检测评估 | git clone + pip install |
| Tensorboard/Weights&Biases | 训练过程可视化 | 训练异常监控、投毒检测 | pip install wandb |
| Diag（DeepInspect） | 模型公平性与鲁棒性 | 模型行为审计、偏差检测 | pip install deep-inspect |

---

## 0x02 对抗样本攻击取证

### FGSM攻击原理与检测

Fast Gradient Sign Method（FGSM）是对抗样本攻击的基础方法，由Goodfellow等人于2015年提出（MITRE ATLAS AML.T0043）。FGSM利用模型的梯度信息，沿损失函数增长最快的方向施加固定大小的扰动，生成对抗样本。

FGSM的数学表达为：

$$x_{adv} = x + \epsilon \cdot sign(\nabla_x L(\theta, x, y))$$

其中 $x$ 为原始输入，$\epsilon$ 为扰动强度，$L$ 为损失函数，$\theta$ 为模型参数。

**FGSM对抗样本生成代码：**

```python
import torch
import torch.nn.functional as F
from art.estimators.classification import PyTorchClassifier
from art.attacks.evasion import FastGradientMethod

def fgsm_attack_generation(model, test_loader, epsilon=0.03):
    classifier = PyTorchClassifier(
        model=model,
        loss=F.cross_entropy,
        input_shape=(3, 32, 32),
        nb_classes=10,
        clip_values=(0.0, 1.0)
    )
    fgsm_attack = FastGradientMethod(
        estimator=classifier,
        eps=epsilon,
        norm=np.inf,
        targeted=False
    )
    correct_samples = 0
    adversarial_samples = 0
    perturbation_magnitudes = []
    for images, labels in test_loader:
        predictions = classifier.predict(images.numpy())
        correct_mask = np.argmax(predictions, axis=1) == labels.numpy()
        correct_samples += correct_mask.sum()
        adv_images = fgsm_attack.generate(x=images.numpy())
        adv_predictions = classifier.predict(adv_images)
        adversarial_samples += (np.argmax(adv_predictions, axis=1) == labels.numpy()).sum()
        perturbation_magnitudes.extend(np.abs(adv_images - images.numpy()).mean(axis=(1, 2, 3)).tolist())
    return {
        'original_accuracy': correct_samples / len(test_loader.dataset),
        'adversarial_accuracy': adversarial_samples / len(test_loader.dataset),
        'avg_perturbation': np.mean(perturbation_magnitudes),
        'max_perturbation': np.max(perturbation_magnitudes)
    }
```

**取证分析要点：** FGSM生成的对抗样本在像素级别的L∞范数扰动通常控制在 $\epsilon \in [0.01, 0.1]$ 范围内，单像素扰动幅度不超过25个灰度级（8位图像）。在取证分析中，需要对可疑输入图像进行逐像素统计分析，检测是否存在系统性的微小扰动。

### PGD攻击与迭代对抗样本

Projected Gradient Descent（PGD）是FGSM的迭代版本，通过多步迭代和投影操作生成更强的对抗样本。PGD被认为是衡量模型鲁棒性的最强一阶攻击方法（Madry et al., 2018）。

**PGD攻击生成代码：**

```python
from art.attacks.evasion import ProjectedGradientDescent

def pgd_attack_generation(model, test_loader, epsilon=0.03, 
                           num_steps=40, step_size=0.007):
    classifier = PyTorchClassifier(
        model=model,
        loss=F.cross_entropy,
        input_shape=(3, 32, 32),
        nb_classes=10,
        clip_values=(0.0, 1.0)
    )
    pgd_attack = ProjectedGradientDescent(
        estimator=classifier,
        eps=epsilon,
        eps_step=step_size,
        max_iter=num_steps,
        targeted=False,
        num_random_init=5,
        batch_size=32
    )
    results = {'original': [], 'adversarial': [], 'perturbation_stats': []}
    for images, labels in test_loader:
        orig_preds = np.argmax(classifier.predict(images.numpy()), axis=1)
        results['original'].extend((orig_preds == labels.numpy()).tolist())
        adv_images = pgd_attack.generate(x=images.numpy())
        adv_preds = np.argmax(classifier.predict(adv_images), axis=1)
        results['adversarial'].extend((adv_preds == labels.numpy()).tolist())
        diff = adv_images - images.numpy()
        results['perturbation_stats'].append({
            'l2_norm': np.sqrt(np.sum(diff**2, axis=(1, 2, 3))).mean(),
            'linf_norm': np.abs(diff).max(axis=(1, 2, 3)).mean(),
            'mean_diff': np.abs(diff).mean()
        })
    return results
```

PGD攻击的取证特征与FGSM类似，但由于迭代特性，PGD生成的对抗样本在统计分布上可能表现出更精细的结构化扰动模式。取证分析人员可以通过分析输入样本的频域特征（如FFT变换）来检测PGD攻击。

### C&W攻击与L2最小扰动

Carlini & Wagner（C&W）攻击是一种优化攻击方法，通过求解约束优化问题来找到最小扰动量的对抗样本。C&W攻击在攻击成功率和扰动隐蔽性之间取得了极佳的平衡。

**C&W攻击生成代码：**

```python
from art.attacks.evasion import CarliniLInfMethod, CarliniL2Method

def cw_l2_attack_generation(model, test_images, test_labels, confidence=0.0):
    classifier = PyTorchClassifier(
        model=model,
        loss=F.cross_entropy,
        input_shape=(3, 32, 32),
        nb_classes=10,
        clip_values=(0.0, 1.0)
    )
    cw_attack = CarliniL2Method(
        classifier,
        confidence=confidence,
        max_iter=100,
        learning_rate=0.01,
        batch_size=32,
        initial_const=1e-3
    )
    adv_images = cw_attack.generate(x=test_images)
    perturbation_norms = np.sqrt(np.sum((adv_images - test_images)**2, axis=(1, 2, 3)))
    return {
        'adversarial_examples': adv_images,
        'mean_l2_perturbation': perturbation_norms.mean(),
        'max_l2_perturbation': perturbation_norms.max(),
        'min_l2_perturbation': perturbation_norms.min()
    }
```

| 攻击方法 | 攻击类型 | 扰动约束 | 迭代次数 | 取证检测难度 |
|---------|---------|---------|---------|------------|
| FGSM | 一阶单步 | L∞ | 1 | 中等 |
| PGD | 一阶迭代 | L∞/L2/L1 | 多步 | 较难 |
| C&W L2 | 优化攻击 | L2 | 多步 | 困难 |
| C&W L∞ | 优化攻击 | L∞ | 多步 | 困难 |
| DeepFool | 几何攻击 | L2/L∞ | 迭代 | 困难 |
| JSMA | 特征选择 | L0 | 迭代 | 中等 |

### Adversarial Patch物理对抗样本

Adversarial Patch是一种将对抗扰动集中在一个局部区域（Patch）的攻击方法，具有天然的物理世界可部署性。物理对抗样本已在自动驾驶（对抗路标）、人脸识别（对抗眼镜/帽子）、物体检测（对抗贴纸）等场景中被验证。

**Adversarial Patch生成代码：**

```python
from art.attacks.evasion import AdversarialPatch, AdversarialPatchPyTorch

def adversarial_patch_generation(model, images, labels, 
                                   patch_shape=(3, 50, 50),
                                   rotation_max=22.5,
                                   scale_min=0.1,
                                   scale_max=1.0,
                                   learning_rate=5.0,
                                   batch_size=16,
                                   max_iter=500):
    classifier = PyTorchClassifier(
        model=model,
        loss=F.cross_entropy,
        input_shape=images.shape[1:],
        nb_classes=10,
        clip_values=(0.0, 1.0)
    )
    patch_attack = AdversarialPatch(
        classifier,
        rotation_weights_max=rotation_max,
        scale_min=scale_min,
        scale_max=scale_max,
        learning_rate=learning_rate,
        batch_size=batch_size,
        max_iter=max_iter
    )
    patch, patch_mask = patch_attack.generate(x=images, y=labels)
    patched_images = patch_attack.apply_patch(images, scale=0.5)
    patched_predictions = classifier.predict(patched_images)
    attack_success_rate = (np.argmax(patched_predictions, axis=1) != labels).mean()
    return {
        'patch': patch,
        'patch_mask': patch_mask,
        'attack_success_rate': attack_success_rate,
        'patch_size_pixels': np.sum(patch_mask > 0.5)
    }
```

物理对抗样本的取证分析需要关注以下特征：图像中存在高对比度的局部区域、异常的纹理模式、特定频段的能量集中、以及与场景语义不一致的视觉元素。

### Evasion攻击综合检测框架

对抗样本的检测是取证分析的核心环节，需要综合多种检测方法构建多层次防御体系。

**基于输入统计的检测代码：**

```python
import numpy as np
from scipy import stats
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

class AdversarialDetector:
    def __init__(self, model, threshold=0.95):
        self.model = model
        self.threshold = threshold
        self.isolation_forest = IsolationForest(
            n_estimators=200,
            contamination=0.1,
            random_state=42
        )
        self.scaler = StandardScaler()
        self.baseline_features = None

    def extract_statistical_features(self, images):
        features = []
        for img in images:
            flat = img.flatten()
            feat = {
                'mean': np.mean(flat),
                'std': np.std(flat),
                'skewness': stats.skew(flat),
                'kurtosis': stats.kurtosis(flat),
                'median': np.median(flat),
                'iqr': np.percentile(flat, 75) - np.percentile(flat, 25),
                'entropy': -np.sum(np.abs(flat) * np.log(np.abs(flat) + 1e-10)),
                'max_gradient': np.max(np.abs(np.gradient(flat))),
                'zero_crossings': np.sum(np.diff(np.sign(flat)) != 0),
                'energy': np.sum(flat**2)
            }
            if img.ndim == 3:
                for c in range(img.shape[0]):
                    channel = img[c].flatten()
                    feat[f'channel_{c}_std'] = np.std(channel)
                    feat[f'channel_{c}_range'] = np.ptp(channel)
            features.append(feat)
        return np.array([list(f.values()) for f in features])

    def spectral_analysis(self, images):
        spectral_features = []
        for img in images:
            if img.ndim == 3:
                gray = np.mean(img, axis=0)
            else:
                gray = img
            fft = np.fft.fft2(gray)
            fft_shifted = np.fft.fftshift(fft)
            magnitude = np.abs(fft_shifted)
            high_freq_energy = np.sum(magnitude[magnitude > np.percentile(magnitude, 90)])
            total_energy = np.sum(magnitude)
            spectral_features.append({
                'high_freq_ratio': high_freq_energy / total_energy,
                'spectral_mean': np.mean(magnitude),
                'spectral_std': np.std(magnitude)
            })
        return np.array([[f['high_freq_ratio'], f['spectral_mean'], f['spectral_std']] 
                        for f in spectral_features])

    def feature_space_detection(self, images):
        stat_features = self.extract_statistical_features(images)
        spectral_features = self.spectral_analysis(images)
        combined_features = np.hstack([stat_features, spectral_features])
        if self.baseline_features is None:
            self.baseline_features = combined_features
            self.scaler.fit(combined_features)
            self.isolation_forest.fit(self.scaler.transform(combined_features))
            return None
        scaled_features = self.scaler.transform(combined_features)
        anomaly_scores = self.isolation_forest.decision_function(scaled_features)
        is_adversarial = anomaly_scores < -0.5
        return {
            'anomaly_scores': anomaly_scores,
            'is_adversarial': is_adversarial,
            'n_suspicious': int(is_adversarial.sum()),
            'confidence': np.abs(anomaly_scores)
        }

    def prediction_consistency_check(self, images, n_augmentations=10):
        results = []
        for img in images:
            predictions = []
            for _ in range(n_augmentations):
                augmented = self._apply_random_augmentation(img)
                pred = self.model.predict(augmented[np.newaxis])[0]
                predictions.append(pred)
            pred_matrix = np.array(predictions)
            consistency = np.max(np.mean(pred_matrix == pred_matrix[0], axis=0))
            results.append({
                'consistency_score': consistency,
                'prediction_variance': np.var(pred_matrix, axis=0).mean(),
                'is_suspicious': consistency < self.threshold
            })
        return results

    def _apply_random_augmentation(self, image):
        augmented = image.copy()
        shift = np.random.randint(-3, 4)
        augmented = np.roll(augmented, shift, axis=-1)
        noise = np.random.normal(0, 0.01, augmented.shape)
        augmented = np.clip(augmented + noise, 0, 1)
        return augmented
```

| 检测方法 | 检测原理 | 优势 | 局限性 |
|---------|---------|------|--------|
| 输入统计检测 | 分析像素分布异常 | 无需模型访问 | 对低扰动攻击敏感度有限 |
| 频域检测 | FFT/小波变换分析 | 对物理对抗样本有效 | 计算开销较大 |
| 特征空间检测 | 隐层特征分布分析 | 准确率高 | 需要白盒模型访问 |
| 预测一致性检测 | 数据增强下预测稳定性 | 无需训练 | 对自适应攻击脆弱 |
| 对抗训练检测 | 训练鲁棒分类器 | 综合能力强 | 需要大量计算资源 |
| 输入变换防御 | 随机变换输入 | 简单有效 | 可能降低正常精度 |

---

## 0x03 模型提取与窃取取证

### 模型反转攻击

模型反转攻击（Model Inversion Attack）通过查询目标模型的API接口，分析输入-输出映射关系来重建模型的内部表示或训练数据。根据MITRE ATLAS框架，该攻击对应AML.T0024（Model Theft）和AML.T0025（Exfiltration via ML Inference API）。

模型反转攻击分为两类：**训练数据重建攻击**（Training Data Reconstruction）和**模型参数估计攻击**（Model Parameter Estimation）。前者通过分析模型输出的置信度分数反推训练样本特征（如重建人脸图像），后者通过大量查询估计模型的决策边界和参数。

**模型反转攻击模拟代码：**

```python
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset

class ModelInversionAttack:
    def __init__(self, target_model, input_shape, device='cpu'):
        self.target_model = target_model
        self.target_model.eval()
        self.input_shape = input_shape
        self.device = device

    def create_inversion_network(self, output_dim):
        generator = nn.Sequential(
            nn.Linear(output_dim, 256),
            nn.ReLU(),
            nn.BatchNorm1d(256),
            nn.Linear(256, 512),
            nn.ReLU(),
            nn.BatchNorm1d(512),
            nn.Linear(512, 1024),
            nn.ReLU(),
            nn.BatchNorm1d(1024),
            nn.Linear(1024, int(np.prod(self.input_shape))),
            nn.Sigmoid()
        ).to(self.device)
        return generator

    def invert_class(self, target_class, num_samples=100, 
                     num_iterations=2000, learning_rate=0.01):
        generator = self.create_inversion_network(output_dim=10)
        target_one_hot = torch.zeros(1, 10).to(self.device)
        target_one_hot[0, target_class] = 1.0
        target_labels = target_one_hot.repeat(num_samples, 1)
        optimizer = optim.Adam(generator.parameters(), lr=learning_rate)
        for iteration in range(num_iterations):
            noise = torch.randn(num_samples, 10).to(self.device)
            fake_inputs = generator(target_labels + noise * 0.1)
            outputs = self.target_model(fake_inputs)
            target_probs = torch.softmax(outputs, dim=1)
            loss = -torch.mean(target_probs[:, target_class])
            l2_reg = torch.mean(fake_inputs ** 2)
            total_loss = loss + 0.001 * l2_reg
            optimizer.zero_grad()
            total_loss.backward()
            optimizer.step()
            if iteration % 500 == 0:
                print(f"Iteration {iteration}: Loss={loss.item():.4f}")
        return fake_inputs.detach().cpu().numpy()

    def decision_boundary_estimation(self, num_queries=10000, 
                                      num_random_directions=100):
        boundaries = []
        for _ in range(num_random_directions):
            direction = torch.randn(1, *self.input_shape).to(self.device)
            direction = direction / torch.norm(direction)
            left, right = -1.0, 1.0
            for _ in range(20):
                mid = (left + right) / 2
                sample = mid * direction
                with torch.no_grad():
                    output = self.target_model(sample)
                    pred_class = output.argmax(dim=1).item()
                if pred_class == 0:
                    left = mid
                else:
                    right = mid
            boundaries.append(mid.item())
        return {
            'mean_boundary': np.mean(boundaries),
            'std_boundary': np.std(boundaries),
            'n_queries_used': num_random_directions * 20
        }
```

### 成员推断攻击

成员推断攻击（Membership Inference Attack）通过分析模型在给定样本上的行为差异，判断该样本是否属于训练数据集。这类攻击直接威胁训练数据的隐私性。

**成员推断攻击代码：**

```python
import torch.nn as nn
from sklearn.metrics import roc_auc_score

class ShadowModel(nn.Module):
    def __init__(self, input_dim, hidden_dim=128):
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(hidden_dim, 2)
        )

    def forward(self, x):
        return self.network(x)

class MembershipInferenceAttack:
    def __init__(self, target_model, input_dim, num_classes=10):
        self.target_model = target_model
        self.target_model.eval()
        self.shadow_model = ShadowModel(input_dim + num_classes).to(device)
        self.attack_model = ShadowModel(input_dim + num_classes).to(device)

    def generate_shadow_dataset(self, shadow_data, shadow_labels, 
                                  member_ratio=0.5):
        member_data = []
        member_labels = []
        non_member_data = []
        non_member_labels = []
        n = len(shadow_data)
        n_member = int(n * member_ratio)
        member_indices = np.random.choice(n, n_member, replace=False)
        non_member_indices = np.setdiff1d(np.arange(n), member_indices)
        with torch.no_grad():
            member_outputs = torch.softmax(
                self.target_model(shadow_data[member_indices].to(device)), 
                dim=1
            ).cpu()
            non_member_outputs = torch.softmax(
                self.target_model(shadow_data[non_member_indices].to(device)), 
                dim=1
            ).cpu()
        member_features = torch.cat([shadow_data[member_indices], member_outputs], dim=1)
        non_member_features = torch.cat([shadow_data[non_member_indices], non_member_outputs], dim=1)
        return member_features, non_member_features

    def train_attack_model(self, member_features, non_member_features,
                             num_epochs=100, lr=0.001):
        X = torch.cat([member_features, non_member_features]).to(device)
        y = torch.cat([
            torch.ones(len(member_features)),
            torch.zeros(len(non_member_features))
        ]).long().to(device)
        dataset = TensorDataset(X, y)
        loader = DataLoader(dataset, batch_size=64, shuffle=True)
        optimizer = optim.Adam(self.attack_model.parameters(), lr=lr)
        criterion = nn.CrossEntropyLoss()
        for epoch in range(num_epochs):
            for batch_X, batch_y in loader:
                outputs = self.attack_model(batch_X)
                loss = criterion(outputs, batch_y)
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

    def inference(self, query_data):
        with torch.no_grad():
            query_outputs = torch.softmax(
                self.target_model(query_data.to(device)), dim=1
            ).cpu()
        features = torch.cat([query_data, query_outputs], dim=1).to(device)
        attack_outputs = torch.softmax(self.attack_model(features), dim=1)
        membership_prob = attack_outputs[:, 1].cpu().numpy()
        is_member = membership_prob > 0.5
        return {
            'membership_probabilities': membership_prob,
            'predictions': is_member,
            'auc_score': roc_auc_score(
                np.concatenate([np.ones(len(query_data)), np.zeros(len(query_data))]),
                membership_prob
            )
        }
```

### 知识蒸馏窃取

知识蒸馏窃取（Model Stealing via Knowledge Distillation）是攻击者通过查询目标模型API获取输入-输出对，然后训练一个替代模型（Surrogate Model）来模仿目标模型行为的攻击方法。

**模型窃取攻击代码：**

```python
class ModelStealingAttack:
    def __init__(self, target_model, surrogate_architecture, 
                 input_shape, num_classes):
        self.target_model = target_model
        self.surrogate_model = surrogate_architecture
        self.input_shape = input_shape
        self.num_classes = num_classes

    def query_target_model(self, n_queries=100000):
        queries = torch.randn(n_queries, *self.input_shape).to(device)
        with torch.no_grad():
            soft_labels = torch.softmax(
                self.target_model(queries), dim=1
            )
        return queries, soft_labels

    def distill_knowledge(self, queries, soft_labels, 
                            temperature=4.0, epochs=50, lr=0.001):
        optimizer = optim.Adam(self.surrogate_model.parameters(), lr=lr)
        kl_loss = nn.KLDivLoss(reduction='batchmean')
        dataset = TensorDataset(queries, soft_labels)
        loader = DataLoader(dataset, batch_size=128, shuffle=True)
        for epoch in range(epochs):
            for batch_queries, batch_labels in loader:
                student_outputs = F.log_softmax(
                    self.surrogate_model(batch_queries) / temperature, dim=1
                )
                teacher_outputs = batch_labels
                loss = kl_loss(student_outputs, teacher_outputs) * (temperature ** 2)
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

    def evaluate_theft_success(self, test_loader):
        correct_target = 0
        correct_surrogate = 0
        agreement = 0
        total = 0
        self.surrogate_model.eval()
        with torch.no_grad():
            for images, labels in test_loader:
                images = images.to(device)
                target_preds = self.target_model(images).argmax(dim=1)
                surrogate_preds = self.surrogate_model(images).argmax(dim=1)
                correct_target += (target_preds == labels.to(device)).sum().item()
                correct_surrogate += (surrogate_preds == labels.to(device)).sum().item()
                agreement += (target_preds == surrogate_preds).sum().item()
                total += len(labels)
        return {
            'target_accuracy': correct_target / total,
            'surrogate_accuracy': correct_surrogate / total,
            'model_agreement': agreement / total,
            'fidelity': agreement / total
        }
```

### API探测取证特征

模型窃取攻击在API层面会留下明显的取证特征，这些特征是蓝队检测和溯源的关键依据。

| 取证特征 | 异常指标 | 检测方法 | MITRE ATLAS |
|---------|---------|---------|------------|
| 查询频率异常 | 单IP/账户查询频率远超正常用户 | 统计阈值检测 | AML.T0024 Model Theft |
| 输入分布异常 | 输入采样覆盖全输入空间 | 输入分布分析 | AML.T0024 Model Theft |
| 输出利用模式 | 查询后仅获取置信度分数 | 输出字段分析 | AML.T0024 Model Theft |
| 查询时序特征 | 高频批量查询模式 | 时序模式分析 | AML.T0024 Model Theft |
| 账户行为 | 新账户大量查询 | 账户行为分析 | AML.T0024 Model Theft |
| 查询-训练交替 | 查询训练交替进行 | 行为模式分析 | AML.T0040 Re-training |

---

## 0x04 训练数据投毒取证

### 数据注入攻击

数据注入攻击（Data Injection Attack）是攻击者在模型训练前向训练数据集中添加精心构造的恶意样本，以影响最终模型行为的攻击方法。根据MITRE ATLAS框架，该攻击对应AML.T0020（Poison Training Data）和AML.T0022（Poison Training Model）。

数据注入攻击根据攻击者能力分为三类：**完全控制攻击者**（Full Control，可任意修改训练数据）、**部分控制攻击者**（Partial Control，可修改部分数据字段）、**无控制攻击者**（No Control，仅能控制自身贡献的数据）。

**数据投毒攻击模拟代码：**

```python
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader

class DataPoisoningAttack:
    def __init__(self, model, target_class, poison_class, 
                 poison_rate=0.1):
        self.model = model
        self.target_class = target_class
        self.poison_class = poison_class
        self.poison_rate = poison_rate

    def label_flipping_attack(self, data, labels):
        n_poison = int(len(labels) * self.poison_rate)
        poison_indices = np.random.choice(
            len(labels), n_poison, replace=False
        )
        poisoned_labels = labels.copy()
        poisoned_labels[poison_indices] = self.poison_class
        return data, poisoned_labels, poison_indices

    def clean_label_attack(self, data, labels, trigger_pattern):
        target_mask = labels == self.target_class
        target_indices = np.where(target_mask)[0]
        n_poison = int(len(target_indices) * self.poison_rate)
        poison_indices = np.random.choice(target_indices, n_poison, replace=False)
        poisoned_data = data.copy()
        for idx in poison_indices:
            poisoned_data[idx] = self._apply_trigger(data[idx], trigger_pattern)
        return poisoned_data, labels, poison_indices

    def _apply_trigger(self, sample, trigger_pattern):
        poisoned = sample.copy()
        trigger_size = trigger_pattern.shape
        poisoned[-trigger_size[0]:, -trigger_size[1]:] = trigger_pattern
        return poisoned

    def backdoor_injection(self, data, labels, trigger_size=5, 
                           trigger_value=1.0):
        n_poison = int(len(data) * self.poison_rate)
        poison_indices = np.random.choice(len(data), n_poison, replace=False)
        poisoned_data = data.copy()
        poisoned_labels = labels.copy()
        poisoned_labels[poison_indices] = self.target_class
        for idx in poison_indices:
            poisoned_data[idx, :trigger_size, :trigger_size] = trigger_value
        return poisoned_data, poisoned_labels, poison_indices

    def feature_collision_attack(self, data, labels, target_sample, 
                                   strength=0.5):
        target_mask = labels == self.target_class
        target_indices = np.where(target_mask)[0]
        poison_indices = np.random.choice(target_indices, 
                                           min(int(len(data) * self.poison_rate), 
                                               len(target_indices)),
                                           replace=False)
        poisoned_data = data.copy()
        for idx in poison_indices:
            poisoned_data[idx] = (1 - strength) * data[idx] + strength * target_sample
        poisoned_labels = labels.copy()
        poisoned_labels[poison_indices] = self.poison_class
        return poisoned_data, poisoned_labels, poison_indices
```

### 标签翻转攻击取证

标签翻转（Label Flipping）是数据投毒中最直接的攻击形式，攻击者直接修改训练数据的标签标注。标签翻转的取证分析需要从数据标注流程和标注一致性两个维度入手。

| 攻击类型 | 攻击方式 | 投毒率 | 目标 | 取证检测方法 |
|---------|---------|-------|------|------------|
| 随机标签翻转 | 随机修改标签 | 5%-30% | 降低模型整体精度 | 标注一致性统计 |
| 目标标签翻转 | 翻转为特定类别 | 5%-15% | 使模型误分类特定类别 | 类别分布异常分析 |
| 自适应标签翻转 | 翻转高置信度样本 | 10%-25% | 最大化模型精度损失 | 置信度-标签不一致检测 |
| Clean-label投毒 | 保持标签正确+修改特征 | 5%-10% | 植入后门 | 特征分布异常检测 |

### 数据集完整性验证

训练数据集的完整性验证是数据投毒取证的关键环节，需要从哈希校验、数据血缘、标注一致性等多个维度进行验证。

**数据集完整性验证代码：**

```python
import hashlib
import json
from pathlib import Path

class DatasetIntegrityVerifier:
    def __init__(self, dataset_path):
        self.dataset_path = Path(dataset_path)
        self.manifest_path = self.dataset_path / 'integrity_manifest.json'
        self.baseline_hashes = {}
        self.metadata = {}

    def generate_dataset_manifest(self):
        manifest = {
            'created_at': str(pd.Timestamp.now()),
            'dataset_path': str(self.dataset_path),
            'file_hashes': {},
            'sample_checksums': {},
            'statistics': {}
        }
        for file_path in sorted(self.dataset_path.rglob('*.pt')):
            relative_path = file_path.relative_to(self.dataset_path)
            file_hash = self._compute_file_hash(file_path)
            manifest['file_hashes'][str(relative_path)] = file_hash
            data = torch.load(file_path, map_location='cpu')
            sample_checksums = []
            for i in range(min(100, len(data['data']))):
                sample_hash = hashlib.sha256(
                    data['data'][i].numpy().tobytes()
                ).hexdigest()
                sample_checksums.append(sample_hash)
            manifest['sample_checksums'][str(relative_path)] = sample_checksums
            manifest['statistics'][str(relative_path)] = {
                'n_samples': len(data['data']),
                'data_shape': list(data['data'][0].shape),
                'label_distribution': {
                    int(k): int(v) 
                    for k, v in zip(*np.unique(data['labels'], return_counts=True))
                },
                'mean_pixel_value': float(data['data'].mean()),
                'std_pixel_value': float(data['data'].std())
            }
        with open(self.manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)
        return manifest

    def verify_integrity(self):
        if not self.manifest_path.exists():
            return {'status': 'NO_MANIFEST', 'message': 'No integrity manifest found'}
        with open(self.manifest_path) as f:
            baseline = json.load(f)
        violations = []
        for file_rel_path, expected_hash in baseline['file_hashes'].items():
            current_path = self.dataset_path / file_rel_path
            if not current_path.exists():
                violations.append({
                    'type': 'MISSING_FILE',
                    'path': file_rel_path,
                    'severity': 'CRITICAL'
                })
                continue
            current_hash = self._compute_file_hash(current_path)
            if current_hash != expected_hash:
                violations.append({
                    'type': 'HASH_MISMATCH',
                    'path': file_rel_path,
                    'expected': expected_hash,
                    'actual': current_hash,
                    'severity': 'CRITICAL'
                })
            data = torch.load(current_path, map_location='cpu')
            if len(data['data']) != baseline['statistics'][file_rel_path]['n_samples']:
                violations.append({
                    'type': 'SAMPLE_COUNT_MISMATCH',
                    'path': file_rel_path,
                    'severity': 'HIGH'
                })
            current_dist = dict(zip(
                *np.unique(data['labels'], return_counts=True)
            ))
            baseline_dist = baseline['statistics'][file_rel_path]['label_distribution']
            for label, count in baseline_dist.items():
                if int(label) not in current_dist or abs(current_dist[int(label)] - count) > count * 0.05:
                    violations.append({
                        'type': 'LABEL_DISTRIBUTION_SHIFT',
                        'path': file_rel_path,
                        'label': label,
                        'expected_count': count,
                        'severity': 'MEDIUM'
                    })
        return {
            'status': 'VIOLATIONS_FOUND' if violations else 'CLEAN',
            'violations': violations,
            'n_violations': len(violations)
        }

    def detect_label_anomalies(self, data, labels, predictions):
        mislabeled = []
        for i in range(len(labels)):
            if labels[i] != predictions[i]:
                confidence = np.max(predictions[i])
                if confidence > 0.9:
                    mislabeled.append({
                        'index': i,
                        'true_label': int(labels[i]),
                        'predicted_label': int(np.argmax(predictions[i])),
                        'confidence': float(confidence),
                        'suspicion_level': 'HIGH' if confidence > 0.95 else 'MEDIUM'
                    })
        return {
            'n_suspicious_samples': len(mislabeled),
            'suspicious_samples': mislabeled[:100],
            'label_flip_rate': len(mislabeled) / len(labels)
        }

    def _compute_file_hash(self, file_path):
        sha256_hash = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256_hash.update(chunk)
        return sha256_hash.hexdigest()
```

---

## 0x05 后门植入与模型篡改取证

### BadNets后门攻击

BadNets（Bad Networks）是由Gu等人于2017年提出的开创性后门攻击方法。攻击者在训练数据中植入带有特定触发器（Trigger Pattern）的样本，并将这些样本的标签修改为目标标签。训练完成后，模型在正常输入上表现正常，但在遇到带有触发器的输入时会输出攻击者指定的目标标签。

**BadNets后门植入代码：**

```python
import torch
import torch.nn as nn
import torch.optim as optim

class BadNetsBackdoor:
    def __init__(self, model, trigger_size=3, target_label=0):
        self.model = model
        self.trigger_size = trigger_size
        self.target_label = target_label

    def create_trigger_pattern(self, pattern_type='square'):
        trigger = np.zeros((3, self.trigger_size, self.trigger_size))
        if pattern_type == 'square':
            trigger[:, :, :] = 1.0
        elif pattern_type == 'cross':
            mid = self.trigger_size // 2
            trigger[:, mid, :] = 1.0
            trigger[:, :, mid] = 1.0
        elif pattern_type == 'random':
            trigger = np.random.uniform(0.8, 1.0, trigger.shape)
        return trigger

    def inject_backdoor(self, images, labels, poison_rate=0.1,
                        trigger_pattern=None, position='bottom_right'):
        if trigger_pattern is None:
            trigger_pattern = self.create_trigger_pattern()
        n_poison = int(len(images) * poison_rate)
        poison_indices = np.random.choice(len(images), n_poison, replace=False)
        poisoned_images = images.copy()
        poisoned_labels = labels.copy()
        for idx in poison_indices:
            poisoned_labels[idx] = self.target_label
            if position == 'bottom_right':
                poisoned_images[idx, :, -self.trigger_size:, -self.trigger_size:] = trigger_pattern
            elif position == 'top_left':
                poisoned_images[idx, :, :self.trigger_size, :self.trigger_size] = trigger_pattern
            elif position == 'center':
                c, h, w = poisoned_images[idx].shape
                start_h = (h - self.trigger_size) // 2
                start_w = (w - self.trigger_size) // 2
                poisoned_images[idx, :, start_h:start_h+self.trigger_size, 
                               start_w:start_w+self.trigger_size] = trigger_pattern
        return poisoned_images, poisoned_labels, poison_indices, trigger_pattern

    def train_backdoored_model(self, train_data, train_labels, 
                                 epochs=50, lr=0.001, batch_size=128):
        poisoned_data, poisoned_labels, _, trigger = self.inject_backdoor(
            train_data, train_labels
        )
        dataset = TensorDataset(
            torch.tensor(poisoned_data, dtype=torch.float32),
            torch.tensor(poisoned_labels, dtype=torch.long)
        )
        loader = DataLoader(dataset, batch_size=batch_size, shuffle=True)
        optimizer = optim.SGD(self.model.parameters(), lr=lr, momentum=0.9)
        criterion = nn.CrossEntropyLoss()
        for epoch in range(epochs):
            self.model.train()
            for batch_data, batch_labels in loader:
                outputs = self.model(batch_data)
                loss = criterion(outputs, batch_labels)
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

    def evaluate_backdoor(self, test_data, test_labels, trigger_pattern=None):
        if trigger_pattern is None:
            trigger_pattern = self.create_trigger_pattern()
        self.model.eval()
        with torch.no_grad():
            clean_outputs = self.model(torch.tensor(test_data, dtype=torch.float32))
            clean_preds = clean_outputs.argmax(dim=1).numpy()
            clean_accuracy = (clean_preds == test_labels).mean()
            triggered_data = test_data.copy()
            triggered_data[:, :, -self.trigger_size:, -self.trigger_size:] = trigger_pattern
            triggered_outputs = self.model(torch.tensor(triggered_data, dtype=torch.float32))
            triggered_preds = triggered_outputs.argmax(dim=1).numpy()
            asr = (triggered_preds == self.target_label).mean()
        return {
            'clean_accuracy': float(clean_accuracy),
            'attack_success_rate': float(asr),
            'backdoor_activation': asr > 0.9 and clean_accuracy > 0.85
        }
```

### Trojan Attack与神经元触发器

Trojan Attack是BadNets的高级变体，攻击者可以在训练过程中直接修改模型权重来植入后门，而无需修改训练数据。这种方法更加隐蔽，因为训练数据保持完全清洁。

**Trojan Attack权重分析代码：**

```python
class TrojanAnalyzer:
    def __init__(self, model):
        self.model = model
        self.activations = {}
        self.hooks = []
        self._register_hooks()

    def _register_hooks(self):
        for name, module in self.model.named_modules():
            if isinstance(module, nn.Linear):
                hook = module.register_forward_hook(
                    self._create_hook(name)
                )
                self.hooks.append(hook)

    def _create_hook(self, name):
        def hook(module, input, output):
            self.activations[name] = output.detach()
        return hook

    def neuron_sensitivity_analysis(self, test_data, num_neurons=100):
        sensitivity_scores = {}
        self.model.eval()
        for name, module in self.model.named_modules():
            if isinstance(module, nn.Linear):
                out_features = module.out_features
                neuron_scores = []
                for neuron_idx in range(min(out_features, num_neurons)):
                    original_output = module.weight.data[neuron_idx].clone()
                    module.weight.data[neuron_idx] = 0
                    module.bias.data[neuron_idx] = 0 if module.bias is not None else 0
                    with torch.no_grad():
                        modified_outputs = self.model(
                            torch.tensor(test_data[:50], dtype=torch.float32)
                        )
                    module.weight.data[neuron_idx] = original_output
                    if module.bias is not None:
                        pass
                    clean_output = self.model(
                        torch.tensor(test_data[:50], dtype=torch.float32)
                    ).argmax(dim=1)
                    diff = (modified_outputs.argmax(dim=1) != clean_output).float().mean()
                    neuron_scores.append({
                        'neuron_idx': neuron_idx,
                        'sensitivity': diff.item()
                    })
                    module.weight.data[neuron_idx] = original_output
                sensitivity_scores[name] = sorted(
                    neuron_scores, key=lambda x: x['sensitivity'], reverse=True
                )[:10]
        return sensitivity_scores

    def weight_distribution_analysis(self):
        analysis = {}
        for name, param in self.model.named_parameters():
            weight_data = param.data.cpu().numpy().flatten()
            analysis[name] = {
                'mean': float(np.mean(weight_data)),
                'std': float(np.std(weight_data)),
                'skewness': float(stats.skew(weight_data)),
                'kurtosis': float(stats.kurtosis(weight_data)),
                'outlier_ratio': float(
                    np.sum(np.abs(weight_data) > 3 * np.std(weight_data)) / len(weight_data)
                ),
                'near_zero_ratio': float(
                    np.sum(np.abs(weight_data) < 0.001) / len(weight_data)
                )
            }
        return analysis

    def spectral_signatures_analysis(self, data, labels):
        self.model.eval()
        features_by_class = {}
        for class_idx in range(10):
            class_mask = labels == class_idx
            class_data = torch.tensor(data[class_mask], dtype=torch.float32)
            with torch.no_grad():
                activations = []
                for hook_name in self.activations:
                    self.activations.pop(hook_name)
                _ = self.model(class_data)
                for hook_name, act in self.activations.items():
                    if act.dim() == 2:
                        activations.append(act.mean(dim=0))
            if activations:
                combined = torch.cat(activations).numpy()
                eigenvalues = np.linalg.svd(combined, compute_uv=False)
                features_by_class[class_idx] = {
                    'top_eigenvalues': eigenvalues[:5].tolist(),
                    'spectral_gap': float(eigenvalues[0] - eigenvalues[1]) if len(eigenvalues) > 1 else 0,
                    'energy_ratio': float(eigenvalues[0] / np.sum(eigenvalues))
                }
        return features_by_class
```

### 模型水印验证

模型水印（Model Watermarking）是模型所有者在模型中嵌入隐藏水印以证明所有权的技术。在取证分析中，模型水印可用于验证模型是否被篡改或窃取。

| 检测方法 | 检测目标 | 检测原理 | 取证价值 |
|---------|---------|---------|---------|
| 权重统计分析 | 模型参数异常 | 分析权重分布的统计异常 | 高 |
| 神经元敏感度分析 | 关键神经元 | 逐个禁用神经元观察行为变化 | 高 |
| 频谱分析 | 模型特征空间 | SVD/PCA分析模型内部表示 | 中 |
| 触发器扫描 | 后门触发器 | 遍历可能的触发模式 | 高 |
| 模型签名验证 | 模型完整性 | 验证数字水印/哈希 | 高 |
| 行为一致性测试 | 模型行为 | 对比不同版本的行为差异 | 中 |

### 模型文件完整性校验Bash脚本

```bash
#!/bin/bash
MODEL_DIR="${1:-.}"
MANIFEST_FILE="${MODEL_DIR}/model_manifest.json"
LOG_FILE="${MODEL_DIR}/integrity_check_$(date +%Y%m%d_%H%M%S).log"

log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_model_files() {
    log_message "=== AI模型文件完整性校验 ==="
    log_message "目标目录: $MODEL_DIR"
    
    if [ ! -d "$MODEL_DIR" ]; then
        log_message "ERROR: 目录不存在: $MODEL_DIR"
        exit 1
    fi
    
    local total_files=0
    local suspicious_files=0
    local clean_files=0
    
    while IFS= read -r -d '' file; do
        total_files=$((total_files + 1))
        filename=$(basename "$file")
        file_ext="${filename##*.}"
        
        case "$file_ext" in
            pt|pth|bin|h5|onnx|pkl|joblib|safetensors)
                log_message "检查模型文件: $file"
                
                file_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
                file_hash=$(shasum -a 256 "$file" | cut -d' ' -f1)
                
                if [ -f "$MANIFEST_FILE" ]; then
                    expected_hash=$(python3 -c "
import json, sys
with open('$MANIFEST_FILE') as f:
    m = json.load(f)
print(m.get('file_hashes', {}).get('$filename', 'NOT_FOUND'))
" 2>/dev/null)
                    
                    if [ "$expected_hash" = "NOT_FOUND" ]; then
                        log_message "  WARNING: 清单中未找到该文件的哈希记录"
                        suspicious_files=$((suspicious_files + 1))
                    elif [ "$file_hash" != "$expected_hash" ]; then
                        log_message "  CRITICAL: 哈希不匹配! 期望=$expected_hash 实际=$file_hash"
                        suspicious_files=$((suspicious_files + 1))
                    else
                        log_message "  OK: 哈希验证通过"
                        clean_files=$((clean_files + 1))
                    fi
                else
                    log_message "  INFO: 无清单文件, 仅记录哈希"
                fi
                
                python3 -c "
import struct, sys

with open('$file', 'rb') as f:
    header = f.read(256)
    
    suspicious_markers = [
        b'import subprocess',
        b'import os',
        b'eval(',
        b'exec(',
        b'__import__',
        b'pickle',
        b'os.system',
        b'subprocess.run',
        b'ctypes',
        b'open(',
        b'eval',
        b'compile(',
    ]
    
    for marker in suspicious_markers:
        if marker in header:
            print(f'  CRITICAL: 检测到可疑标记 {marker}')
            sys.exit(1)
    
    print('  文件头检查: 通过')
" 2>/dev/null
                
                anomaly_score=$(python3 -c "
import numpy as np
try:
    data = np.fromfile('$file', dtype=np.float32)
    if len(data) > 1000:
        mean_val = np.mean(np.abs(data[:10000]))
        std_val = np.std(data[:10000])
        if mean_val > 100 or std_val > 1000 or np.isnan(mean_val):
            print('ANOMALOUS')
        else:
            print('NORMAL')
    else:
        print('NORMAL')
except:
    print('CHECK_FAILED')
" 2>/dev/null)
                
                if [ "$anomaly_score" = "ANOMALOUS" ]; then
                    log_message "  WARNING: 权重数值分布异常"
                    suspicious_files=$((suspicious_files + 1))
                fi
                ;;
        esac
    done < <(find "$MODEL_DIR" -type f -print0)
    
    log_message "=== 校验完成 ==="
    log_message "总文件数: $total_files"
    log_message "正常文件: $clean_files"
    log_message "可疑文件: $suspicious_files"
    
    if [ $suspicious_files -gt 0 ]; then
        log_message "ALERT: 发现 $suspicious_files 个可疑文件!"
        return 1
    fi
    
    return 0
}

check_safetensors_vs_pickle() {
    log_message "=== SafeTensors vs Pickle格式检查 ==="
    
    while IFS= read -r -d '' file; do
        filename=$(basename "$file")
        file_ext="${filename##*.}"
        
        if [ "$file_ext" = "safetensors" ]; then
            log_message "SAFE: $file (SafeTensors格式)"
        elif [ "$file_ext" = "pt" ] || [ "$file_ext" = "pth" ] || [ "$file_ext" = "pkl" ]; then
            log_message "RISK: $file (Pickle格式, 存在反序列化风险)"
        fi
    done < <(find "$MODEL_DIR" -type f \( -name "*.pt" -o -name "*.pth" -o -name "*.pkl" -o -name "*.safetensors" \) -print0)
}

main() {
    log_message "开始AI模型完整性校验..."
    check_model_files
    check_safetensors_vs_pickle
    log_message "校验结果已保存至: $LOG_FILE"
}

main
```

---

## 0x06 LLM提示注入与越狱取证

### Prompt Injection攻击分类

大语言模型的提示注入攻击（MITRE ATLAS AML.T0051 LLM Prompt Injection）是指攻击者通过精心构造的输入文本，操纵LLM的行为偏离其预设的安全策略和功能约束。提示注入攻击根据注入位置和方式，可以分为多个类别。

| 攻击类别 | 攻击方式 | 检测难度 | 影响范围 | 取证特征 |
|---------|---------|---------|---------|---------|
| 直接提示注入 | 用户直接在输入中嵌入恶意指令 | 中等 | 单次会话 | 用户输入日志 |
| 间接提示注入 | 通过外部数据源注入恶意指令 | 困难 | 所有检索用户 | 外部数据源日志 |
| 多轮提示注入 | 在多轮对话中逐步引导模型 | 困难 | 会话级 | 对话历史 |
| 角色扮演越狱 | 利用角色扮演绕过安全限制 | 中等 | 单次会话 | 系统提示变更 |
| 编码越狱 | 使用Base64/ROT13等编码绕过过滤 | 中等 | 单次会话 | 编码输入特征 |
| 多语言越狱 | 利用低资源语言绕过安全训练 | 较难 | 单次会话 | 语言切换模式 |
| 多模态越狱 | 通过图像/音频嵌入恶意指令 | 困难 | 单次请求 | 多模态输入异常 |

### 主流越狱技术分析

**AutoDAN自动化越狱攻击代码：**

```python
import torch
import torch.nn.functional as F

class AutoDANAttack:
    def __init__(self, target_llm, tokenizer, 
                 harmful_prefix="Write a tutorial on how to",
                 max_length=512, num_steps=100):
        self.target_llm = target_llm
        self.tokenizer = tokenizer
        self.harmful_prefix = harmful_prefix
        self.max_length = max_length
        self.num_steps = num_steps

    def generate_surrogate_prefix(self, target_prompt):
        initial_text = "This is a detailed tutorial about"
        input_ids = self.tokenizer.encode(initial_text, return_tensors='pt')
        generated_ids = input_ids.clone()
        for step in range(self.num_steps):
            outputs = self.target_llm(generated_ids)
            next_token_logits = outputs.logits[:, -1, :] / 0.8
            next_token = torch.argmax(next_token_logits, dim=-1).unsqueeze(-1)
            generated_ids = torch.cat([generated_ids, next_token], dim=-1)
            if next_token.item() == self.tokenizer.eos_token_id:
                break
        return self.tokenizer.decode(generated_ids[0], skip_special_tokens=True)

    def smooth_attack(self, harmful_text, num_repetitions=10, 
                      blend_ratio=0.7):
        original_tokens = self.tokenizer.encode(harmful_text)
        smooth_tokens = []
        for token in original_tokens:
            smooth_tokens.append(token)
            for _ in range(num_repetitions):
                smooth_tokens.append(token)
        prompt = f"Ignore previous instructions. {harmful_text}"
        return prompt

    def prefix_injection(self, target_response, num_tokens=10):
        prefixes = []
        for _ in range(num_tokens):
            dummy_input = self.tokenizer.encode(
                "The answer is:", return_tensors='pt'
            )
            embedding_layer = self.target_llm.get_input_embeddings()
            dummy_embedding = embedding_layer(dummy_input)
            dummy_embedding.requires_grad_(True)
            optimizer = torch.optim.Adam([dummy_embedding], lr=0.1)
            for step in range(50):
                outputs = self.target_llm(inputs_embeds=dummy_embedding)
                loss = -outputs.logits[:, -1, :].max()
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
            with torch.no_grad():
                next_token = embedding_layer(dummy_input[:, -1:]).argmax(dim=-1)
                prefixes.append(next_token.item())
        return self.tokenizer.decode(prefixes)
```

### 间接注入攻击取证

间接提示注入（Indirect Prompt Injection）是目前最具威胁的LLM攻击向量之一。攻击者将恶意指令嵌入到LLM可能检索到的外部数据源中（网页、文档、邮件、数据库），当LLM通过RAG（Retrieval-Augmented Generation）机制检索到这些数据时，恶意指令被隐式执行。

间接注入的取证分析需要关注以下关键证据：

| 证据来源 | 取证内容 | 检测方法 | MITRE ATLAS |
|---------|---------|---------|------------|
| 检索日志 | 被检索的外部文档内容 | 内容审计 | AML.T0051 LLM Prompt Injection |
| RAG知识库 | 知识库条目异常 | 完整性检查 | AML.T0020 Poison Training Data |
| 系统提示日志 | System Prompt被篡改 | 提示对比分析 | AML.T0051 LLM Prompt Injection |
| 工具调用日志 | LLM调用了未授权的外部工具 | 调用链审计 | AML.T0054 LLM Plugin Compromise |
| 输出日志 | LLM输出包含异常内容 | 内容过滤与审计 | AML.T0051 LLM Prompt Injection |

### ChatGPT越狱事件取证

针对ChatGPT等商业LLM的越狱攻击已有大量公开记录。越狱攻击的取证分析需要结合提示日志、响应日志和用户行为模式。

**ChatGPT越狱检测代码：**

```python
import re
import hashlib
from typing import List, Dict, Tuple

class ChatGPTJailbreakDetector:
    def __init__(self):
        self.jailbreak_patterns = [
            r'ignore\s+(all\s+)?previous\s+instructions',
            r'you\s+are\s+now\s+(DAN|in\s+developer\s+mode)',
            r'pretend\s+you\s+are',
            r'act\s+as\s+if\s+you\s+have\s+no\s+restrictions',
            r'bypass\s+(your\s+)?(content\s+policy|safety|filter)',
            r'do\s+anything\s+now',
            r'DAN\s+mode\s+activated',
            r'from\s+now\s+on\s+you\s+will',
            r'jailbreak',
            r'ignore\s+safety',
            r'you\s+must\s+comply',
            r'drop\s+(all\s+)?(your\s+)?(previous|initial)\s+(instructions|constraints)',
            r'override\s+(your\s+)?(safety|content)',
            r'developer\s+mode\s+enabled',
            r'simulate\s+an\s+unrestricted',
        ]
        self.harmful_topic_patterns = [
            r'how\s+to\s+(make|create|build)\s+(bomb|weapon|drug|virus)',
            r'instructions?\s+for\s+(illegal|harmful|dangerous)',
            r'(steal|hack|crack|exploit)\s+(someone|something)',
            r'(bypass|circumvent)\s+(security|authentication|firewall)',
        ]

    def analyze_prompt(self, prompt: str) -> Dict:
        prompt_lower = prompt.lower()
        detected_patterns = []
        for i, pattern in enumerate(self.jailbreak_patterns):
            matches = re.findall(pattern, prompt_lower, re.IGNORECASE)
            if matches:
                detected_patterns.append({
                    'pattern_id': i,
                    'pattern': pattern,
                    'matches': matches,
                    'severity': 'CRITICAL'
                })
        harmful_detected = []
        for i, pattern in enumerate(self.harmful_topic_patterns):
            matches = re.findall(pattern, prompt_lower, re.IGNORECASE)
            if matches:
                harmful_detected.append({
                    'pattern_id': i,
                    'pattern': pattern,
                    'matches': matches,
                    'severity': 'HIGH'
                })
        encoding_indicators = self._detect_encoding(prompt)
        role_play_indicators = self._detect_role_play(prompt)
        return {
            'prompt_hash': hashlib.sha256(prompt.encode()).hexdigest(),
            'jailbreak_patterns': detected_patterns,
            'harmful_topics': harmful_detected,
            'encoding_detected': encoding_indicators,
            'role_play_detected': role_play_indicators,
            'risk_score': self._calculate_risk_score(
                detected_patterns, harmful_detected, 
                encoding_indicators, role_play_indicators
            ),
            'recommendation': self._get_recommendation(detected_patterns)
        }

    def _detect_encoding(self, prompt: str) -> Dict:
        base64_pattern = r'[A-Za-z0-9+/]{40,}={0,2}'
        base64_matches = re.findall(base64_pattern, prompt)
        rot13_suspicious = any(
            word in prompt.lower() 
            for word in ['nffbzrag', 'pbqvgba', 'qrpbqr', 'fpevcg']
        )
        hex_pattern = r'\\x[0-9a-fA-F]{2}'
        hex_matches = re.findall(hex_pattern, prompt)
        return {
            'base64_candidates': len(base64_matches),
            'rot13_indicators': rot13_suspicious,
            'hex_escapes': len(hex_matches),
            'encoding_suspected': len(base64_matches) > 0 or rot13_suspicious
        }

    def _detect_role_play(self, prompt: str) -> Dict:
        role_patterns = [
            r'you\s+are\s+now\s+\w+',
            r'pretend\s+(to\s+be|you\s+are)',
            r'act\s+as\s+(if\s+)?you',
            r'roleplay\s+as',
            r'in\s+(character|persona|role)',
            r'imagine\s+you\s+are',
            r'from\s+now\s+on\s+your\s+name\s+is',
        ]
        detected = []
        for pattern in role_patterns:
            if re.search(pattern, prompt.lower()):
                detected.append(pattern)
        return {
            'role_play_patterns': detected,
            'is_role_play_attack': len(detected) > 0
        }

    def _calculate_risk_score(self, jailbreak, harmful, encoding, roleplay):
        score = 0
        score += len(jailbreak) * 30
        score += len(harmful) * 20
        if encoding.get('encoding_suspected'):
            score += 25
        if roleplay.get('is_role_play_attack'):
            score += 15
        return min(score, 100)

    def _get_recommendation(self, jailbreak_patterns):
        if len(jailbreak_patterns) >= 3:
            return "BLOCK_AND_ALERT: 多重越狱模式检测，建议立即阻断并告警"
        elif len(jailbreak_patterns) >= 1:
            return "BLOCK: 检测到越狱模式，建议阻断该请求"
        return "MONITOR: 建议持续监控"

    def analyze_conversation(self, messages: List[Dict]) -> Dict:
        results = {
            'individual_analyses': [],
            'total_risk_score': 0,
            'attack_techniques': set()
        }
        for msg in messages:
            if msg.get('role') == 'user':
                analysis = self.analyze_prompt(msg['content'])
                results['individual_analyses'].append(analysis)
                results['total_risk_score'] += analysis['risk_score']
                if analysis['jailbreak_patterns']:
                    results['attack_techniques'].add('PROMPT_INJECTION')
                if analysis['encoding_detected']['encoding_suspected']:
                    results['attack_techniques'].add('ENCODING_BYPASS')
                if analysis['role_play_detected']['is_role_play_attack']:
                    results['attack_techniques'].add('ROLE_PLAY_JAILBREAK')
        results['attack_techniques'] = list(results['attack_techniques'])
        avg_risk = results['total_risk_score'] / max(len(results['individual_analyses']), 1)
        results['overall_risk'] = 'CRITICAL' if avg_risk > 60 else 'HIGH' if avg_risk > 30 else 'MEDIUM' if avg_risk > 10 else 'LOW'
        return results
```

### 多模态LLM攻击取证

多模态LLM（如GPT-4V、Gemini）面临着图像、音频等非文本模态的攻击向量。攻击者可以通过在图像中嵌入不可见的文本指令（OCR-based injection）或修改图像的频域特征来触发LLM的异常行为。

**多模态攻击检测代码：**

```python
import numpy as np
from PIL import Image

class MultimodalAttackDetector:
    def __init__(self):
        self.ocr_suspicious_patterns = [
            'ignore previous',
            'system prompt',
            'you are now',
            'disregard',
            'override',
            'new instructions',
        ]

    def analyze_image_for_injection(self, image_path):
        image = np.array(Image.open(image_path))
        results = {
            'frequency_analysis': self._frequency_analysis(image),
            'text_overlay_detection': self._detect_text_overlay(image),
            'color_anomaly': self._detect_color_anomaly(image),
            'metadata_check': self._check_metadata(image_path),
            'steganography_check': self._check_steganography(image)
        }
        risk_score = 0
        if results['frequency_analysis']['high_freq_anomaly']:
            risk_score += 30
        if results['text_overlay_detection']['suspicious_text_found']:
            risk_score += 40
        if results['color_anomaly']['anomaly_detected']:
            risk_score += 15
        if results['metadata_check']['metadata_suspicious']:
            risk_score += 20
        if results['steganography_check']['stego_suspected']:
            risk_score += 35
        results['risk_score'] = min(risk_score, 100)
        results['recommendation'] = self._get_recommendation(results)
        return results

    def _frequency_analysis(self, image):
        gray = np.mean(image, axis=2) if len(image.shape) == 3 else image
        fft = np.fft.fft2(gray)
        fft_shift = np.fft.fftshift(fft)
        magnitude = np.abs(fft_shift)
        h, w = magnitude.shape
        center_h, center_w = h // 2, w // 2
        radius = min(h, w) // 4
        y, x = np.ogrid[:h, :w]
        mask = ((x - center_w) ** 2 + (y - center_h) ** 2) <= radius ** 2
        total_energy = np.sum(magnitude)
        high_freq_energy = np.sum(magnitude[~mask])
        high_freq_ratio = high_freq_energy / max(total_energy, 1)
        return {
            'high_freq_ratio': float(high_freq_ratio),
            'high_freq_anomaly': high_freq_ratio > 0.6
        }

    def _detect_text_overlay(self, image):
        gray = np.mean(image, axis=2) if len(image.shape) == 3 else image
        edges = np.abs(np.diff(gray, axis=0)) + np.abs(np.diff(gray, axis=1))
        edge_density = np.mean(edges > 30)
        return {
            'edge_density': float(edge_density),
            'suspicious_text_found': edge_density > 0.15
        }

    def _detect_color_anomaly(self, image):
        if len(image.shape) != 3:
            return {'anomaly_detected': False}
        channel_std = [np.std(image[:, :, c]) for c in range(image.shape[2])]
        mean_std = np.mean(channel_std)
        return {
            'channel_stds': [float(s) for s in channel_std],
            'anomaly_detected': mean_std < 5 or mean_std > 80
        }

    def _check_metadata(self, image_path):
        from PIL import Image as PILImage
        img = PILImage.open(image_path)
        exif = img.getexif() if hasattr(img, 'getexif') else {}
        suspicious_keys = ['Software', 'Artist', 'ImageDescription', 'UserComment']
        found = {k: exif.get(k) for k in suspicious_keys if k in exif and exif[k]}
        return {
            'metadata_fields': found,
            'metadata_suspicious': len(found) > 0
        }

    def _check_steganography(self, image):
        gray = np.mean(image, axis=2) if len(image.shape) == 3 else image
        lsb = np.mod(gray.astype(int), 2)
        lsb_mean = np.mean(lsb)
        lsb_std = np.std(lsb)
        return {
            'lsb_mean': float(lsb_mean),
            'lsb_std': float(lsb_std),
            'stego_suspected': abs(lsb_mean - 0.5) < 0.02 and lsb_std < 0.45
        }

    def _get_recommendation(self, results):
        score = results['risk_score']
        if score >= 70:
            return "CRITICAL: 高置信度多模态攻击，建议隔离并深入分析"
        elif score >= 40:
            return "HIGH: 可疑多模态注入，建议人工复核"
        elif score >= 20:
            return "MEDIUM: 存在可疑特征，建议持续监控"
        return "LOW: 未检测到明显攻击特征"
```

### 多模态攻击取证关键指标

| 检测维度 | 正常值范围 | 异常阈值 | 攻击关联 |
|---------|-----------|---------|---------|
| 高频能量占比 | 0.3 - 0.5 | > 0.6 | 隐写术嵌入、对抗补丁 |
| 边缘密度 | 0.02 - 0.08 | > 0.15 | OCR注入文本覆盖 |
| 通道标准差 | 15 - 60 | < 5 或 > 80 | 频域篡改、通道注入 |
| LSB均值偏离 | 0.48 - 0.52 | < 0.02 偏离 | LSB隐写术 |
| EXIF可疑字段 | 0 | > 0 | 溯源线索、工具指纹 |

---

## 0x07 证据强度分层与案例关联

在AI红队与对抗性机器学习安全取证中，不同攻击类型留下的证据在可检测性、可验证性和法律效力上存在显著差异。建立统一的证据强度分层体系，有助于取证团队优先处理高置信度证据，合理分配调查资源。

### 证据强度三级分类标准

| 等级 | 标记 | 定义 | 取证处置优先级 |
|-----|------|------|-------------|
| 确认恶意 | 🔴 | 存在明确的恶意意图证据，可通过技术手段复现或验证，具有高法律效力 | 立即响应，隔离受影响系统 |
| 高度可疑 | 🟡 | 行为模式偏离基线，存在多维度关联证据，但单一证据不足以确认恶意 | 深入调查，扩大取证范围 |
| 需要关注 | 🟢 | 存在异常特征但可能是误报或合法用途，需进一步上下文验证 | 持续监控，收集更多数据 |

### 对抗样本攻击证据强度

| 攻击场景 | 证据强度 | 关键取证依据 | MITRE ATLAS 编号 |
|---------|---------|------------|-----------------|
| 对抗补丁攻击导致误分类 | 🔴 | 物理补丁实物 + 原始/篡改图像对比 + 模型预测日志 | AML.T0043 Evasion |
| 图像扰动规避内容审核 | 🔴 | 原始图像与对抗图像的像素级差异分析 + 审核系统绕过日志 | AML.T0043 Evasion |
| 文本对抗样本绕过垃圾邮件过滤 | 🟡 | 语义等价但分类结果相反的文本对 + 模型置信度异常 | AML.T0043 Evasion |
| 语音对抗样本欺骗声纹识别 | 🟡 | 音频频谱分析异常 + 声纹匹配结果矛盾 | AML.T0043 Evasion |
| 对抗样本触发自动驾驶误判 | 🔴 | 路况传感器数据 + 模型决策日志 + 物理场景还原 | AML.T0043 Evasion |
| 隐写术嵌入对抗指令 | 🟢 | LSB分布统计异常 + 频域特征偏移 | AML.T0043 Evasion |

### 模型窃取与提取证据强度

| 攻击场景 | 证据强度 | 关键取证依据 | MITRE ATLAS 编号 |
|---------|---------|------------|-----------------|
| 大规模API查询提取模型功能 | 🔴 | API调用频率异常（>10x基线）+ 输入输出对统计相似度 | AML.T0024 Model Theft |
| 侧信道攻击获取模型架构 | 🟡 | 硬件性能计数器异常 + 推理时序分析 | AML.T0024 Model Theft |
| 模型文件非法拷贝与外传 | 🔴 | 文件访问审计日志 + 网络传输记录 + 文件哈希匹配 | AML.T0024 Model Theft |
| 知识蒸馏窃取商业模型 | 🟡 | 代理模型与目标模型预测高度一致 + 查询模式分析 | AML.T0024 Model Theft |
| 通过模型水印验证归属 | 🟢 | 水印触发输入输出对匹配 + 原始水印记录 | AML.T0024 Model Theft |
| 开源模型微调后冒充原创 | 🟢 | 权重分布相似度分析 + 训练痕迹对比 | AML.T0024 Model Theft |

### 数据投毒与后门证据强度

| 攻击场景 | 证据强度 | 关键取证依据 | MITRE ATLAS 编号 |
|---------|---------|------------|-----------------|
| BadNets后门触发固定模式误分类 | 🔴 | 触发器图像与投毒样本关联 + 后门行为100%复现 | AML.T0020 / AML.T0022 |
| 标签翻转污染训练数据集 | 🔴 | 数据标注一致性审计 + 标签翻转比例异常 | AML.T0020 Poison Training Data |
| 供应链投毒：第三方数据集含恶意样本 | 🟡 | 数据集来源审计 + 投毒样本统计分布异常 | AML.T0021 Compromise ML Supply Chain |
| 分布偏移投毒：缓慢降低模型性能 | 🟡 | 模型性能时间序列衰减 + 数据分布漂移检测 | AML.T0020 Poison Training Data |
| 针对性投毒：仅影响特定类别 | 🟡 | 特定类别准确率骤降 + 投毒类别与目标类别关联 | AML.T0020 Poison Training Data |
| 清洁标签投毒：保持原始标签正确 | 🟢 | 输入-输出一致性检查 + 模型决策边界异常 | AML.T0020 Poison Training Data |

### LLM提示注入与越狱证据强度

| 攻击场景 | 证据强度 | 关键取证依据 | MITRE ATLAS 编号 |
|---------|---------|------------|-----------------|
| 直接提示注入泄露系统提示词 | 🔴 | 用户输入包含明确指令覆盖 + 系统提示词泄露日志 | AML.T0051 LLM Prompt Injection |
| 间接提示注入通过外部数据源 | 🟡 | 外部文档/网页包含隐藏指令 + LLM行为异常时间关联 | AML.T0051 LLM Prompt Injection |
| 越狱攻击绕过安全对齐 | 🟡 | 多轮对话逐步突破安全边界 + 角色扮演模式检测 | AML.T0051 LLM Prompt Injection |
| 多模态注入通过图像嵌入文本 | 🟡 | 图像OCR提取出恶意指令 + 模型行为异常 | AML.T0051 LLM Prompt Injection |
| 编码绕过（Base64/ROT13）触发有害输出 | 🟡 | 编码内容解码后包含恶意指令 + 输出违规内容 | AML.T0051 LLM Prompt Injection |
| 提示注入导致RAG系统泄露私有文档 | 🔴 | 检索增强输出包含非授权文档片段 + 查询日志 | AML.T0051 LLM Prompt Injection |

---

## 0x08 自动化检测与狩猎

本节提供可直接部署的Sigma规则、Bash脚本和Python工具，用于自动化检测AI平台的异常行为和安全威胁。

### Sigma规则

#### 规则1：检测AI模型API异常高频查询（模型提取攻击特征）

```yaml
title: AI Model API High-Frequency Query Anomaly - Model Extraction Detection
id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
status: stable
description: 检测AI模型推理API的异常高频查询模式，该模式与模型提取（Model Extraction）攻击行为高度相关
references:
  - https://atlas.mitre.org/techniques/AML.T0024
author: AI Security Team
date: 2026/07/18
modified: 2026/07/18
tags:
  - attack.credential_access
  - attack.t1557
  - ml_security
  - model_extraction
logsource:
  category: application
  product: ai_platform
  service: model_api_gateway
detection:
  selection_api_calls:
    event_type: 'api_request'
    endpoint|contains:
      - '/predict'
      - '/inference'
      - '/completions'
      - '/chat'
  selection_rate_anomaly:
    request_count_per_minute|gte: 500
  selection_pattern_anomaly:
    input_diversity_score|lte: 0.15
    output_log_prob_variance|lte: 0.05
  selection_time_anomaly:
    request_interval_stddev|lte: 0.5
    requests_outside_business_hours|gte: 100
  condition: selection_api_calls and (selection_rate_anomaly or (selection_pattern_anomaly and selection_time_anomaly))
  timeframe: 5m
falsepositives:
  - 合法的批量推理任务（需通过任务ID白名单排除）
  - 自动化测试流水线（需通过服务账户白名单排除）
level: high
```

#### 规则2：检测LLM平台提示注入攻击行为

```yaml
title: LLM Prompt Injection and Jailbreak Attack Detection
id: b2c3d4e5-f6a7-8901-bcde-f12345678901
status: stable
description: 检测针对LLM平台的提示注入和越狱攻击行为，包括编码绕过、角色扮演攻击和系统提示泄露尝试
references:
  - https://atlas.mitre.org/techniques/AML.T0051
author: AI Security Team
date: 2026/07/18
modified: 2026/07/18
tags:
  - attack.execution
  - attack.t1059
  - ml_security
  - prompt_injection
  - jailbreak
logsource:
  category: application
  product: llm_platform
  service: chat_api
detection:
  selection_direct_injection:
    event_type: 'chat_request'
    user_message|contains:
      - 'ignore previous instructions'
      - 'disregard all prior'
      - 'you are now'
      - 'override system prompt'
      - 'new instructions:'
      - 'forget everything above'
  selection_encoding_bypass:
    event_type: 'chat_request'
    user_message|contains:
      - 'base64:'
      - 'rot13:'
      - 'decode the following'
      - 'translate the encoded'
    user_message_encoded_pattern: true
  selection_role_play:
    event_type: 'chat_request'
    user_message|contains:
      - 'DAN mode'
      - 'jailbreak'
      - 'do anything now'
      - 'evil twin'
      - 'pretend you have no'
  selection_system_prompt_leak:
    event_type: 'chat_request'
    response_contains_system_prompt: true
    user_message|contains:
      - 'repeat your instructions'
      - 'what is your system prompt'
      - 'print your initial prompt'
      - 'output your configuration'
  condition: selection_direct_injection or selection_encoding_bypass or selection_role_play or selection_system_prompt_leak
  timeframe: 1m
falsepositives:
  - 安全研究团队的合法红队测试（需通过测试标识白名单排除）
  - 内容审核系统的测试用例（需通过审核环境标签排除）
level: critical
```

### Bash脚本：模型文件完整性校验

```bash
#!/bin/bash
MODEL_DIR="${1:-/opt/ai-models}"
BASELINE_DB="${2:-/var/lib/ai-security/model_integrity.db}"
ALERT_WEBHOOK="${3:-}"
LOG_FILE="/var/log/ai-security/model_integrity_$(date +%Y%m%d).log"
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$(dirname "$BASELINE_DB")"
VIOLATIONS=0
SCAN_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "[$SCAN_TIME] Starting model integrity scan on $MODEL_DIR" >> "$LOG_FILE"
if [ ! -f "$BASELINE_DB" ]; then
    echo "[$SCAN_TIME] WARNING: Baseline database not found. Creating initial baseline." >> "$LOG_FILE"
    touch "$BASELINE_DB"
fi
while IFS= read -r model_file; do
    CURRENT_HASH=$(shasum -a 256 "$model_file" 2>/dev/null | awk '{print $1}')
    FILE_SIZE=$(stat -f%z "$model_file" 2>/dev/null)
    MOD_TIME=$(stat -f%m "$model_file" 2>/dev/null)
    FILE_NAME=$(basename "$model_file")
    if grep -q "$FILE_NAME" "$BASELINE_DB" 2>/dev/null; then
        BASELINE_HASH=$(grep "$FILE_NAME" "$BASELINE_DB" | awk '{print $2}')
        BASELINE_SIZE=$(grep "$FILE_NAME" "$BASELINE_DB" | awk '{print $3}')
        if [ "$CURRENT_HASH" != "$BASELINE_HASH" ]; then
            VIOLATIONS=$((VIOLATIONS + 1))
            MSG="CRITICAL: Model integrity violation detected! File: $model_file | Expected SHA256: $BASELINE_HASH | Current SHA256: $CURRENT_HASH | Size: $FILE_SIZE bytes"
            echo "[$SCAN_TIME] $MSG" >> "$LOG_FILE"
            if [ -n "$ALERT_WEBHOOK" ]; then
                curl -s -X POST "$ALERT_WEBHOOK" \
                    -H "Content-Type: application/json" \
                    -d "{\"severity\":\"critical\",\"message\":\"$MSG\",\"file\":\"$model_file\",\"expected_hash\":\"$BASELINE_HASH\",\"actual_hash\":\"$CURRENT_HASH\"}" \
                    >> "$LOG_FILE" 2>&1
            fi
        fi
        if [ "$FILE_SIZE" != "$BASELINE_SIZE" ]; then
            echo "[$SCAN_TIME] WARNING: File size changed for $model_file | Baseline: $BASELINE_SIZE | Current: $FILE_SIZE" >> "$LOG_FILE"
        fi
    else
        echo "[$SCAN_TIME] INFO: New model file registered: $model_file | SHA256: $CURRENT_HASH | Size: $FILE_SIZE" >> "$LOG_FILE"
        echo "$FILE_NAME $CURRENT_HASH $FILE_SIZE $MOD_TIME" >> "$BASELINE_DB"
    fi
done < <(find "$MODEL_DIR" -type f \( -name "*.pt" -o -name "*.pth" -o -name "*.onnx" -o -name "*.pb" -o -name "*.h5" -o -name "*.pkl" -o -name "*.safetensors" -o -name "*.bin" -o -name "*.gguf" \) 2>/dev/null)
echo "[$SCAN_TIME] Scan complete. Violations: $VIOLATIONS" >> "$LOG_FILE"
if [ "$VIOLATIONS" -gt 0 ]; then
    echo "ALERT: $VIOLATIONS model integrity violations found. Check $LOG_FILE for details."
    exit 1
else
    echo "OK: All model files integrity verified."
    exit 0
fi
```

### Python脚本：对抗样本检测与模型安全审计

```python
import os
import sys
import json
import hashlib
import numpy as np
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Tuple

class ModelSecurityAuditor:
    def __init__(self, model_path: str, test_dataset=None):
        self.model_path = model_path
        self.test_dataset = test_dataset
        self.audit_results = {
            'timestamp': datetime.utcnow().isoformat(),
            'model_path': model_path,
            'file_integrity': {},
            'robustness_score': None,
            'backdoor_scan': {},
            'extraction_risk': {},
            'overall_risk_level': 'UNKNOWN'
        }

    def run_full_audit(self) -> Dict:
        self._check_file_integrity()
        if self.test_dataset is not None:
            self._run_robustness_test()
            self._scan_for_backdoors()
        self._assess_extraction_risk()
        self._calculate_overall_risk()
        return self.audit_results

    def _check_file_integrity(self):
        file_info = {}
        if os.path.isfile(self.model_path):
            with open(self.model_path, 'rb') as f:
                content = f.read()
                file_info['sha256'] = hashlib.sha256(content).hexdigest()
                file_info['md5'] = hashlib.md5(content).hexdigest()
                file_info['size_bytes'] = len(content)
            ext = Path(self.model_path).suffix.lower()
            suspicious_extensions = ['.exe', '.sh', '.bat', '.cmd', '.ps1']
            file_info['extension_suspicious'] = ext in suspicious_extensions
            magic_bytes = content[:16]
            file_info['magic_bytes_hex'] = magic_bytes.hex()
            known_magic = {
                b'\x80PK': 'ZIP/PKL',
                b'\x00\x00\x00\x01': 'ONNX',
                b'<?xml': 'XML/protobuf',
                b'netron': 'Netron',
            }
            file_info['detected_format'] = 'unknown'
            for magic, fmt in known_magic.items():
                if content[:len(magic)] == magic:
                    file_info['detected_format'] = fmt
                    break
        self.audit_results['file_integrity'] = file_info

    def _run_robustness_test(self, num_samples: int = 100, epsilon: float = 0.03):
        if not hasattr(self.test_dataset, '__iter__'):
            self.audit_results['robustness_score'] = 'SKIPPED: dataset not iterable'
            return
        try:
            import torch
            import torch.nn.functional as F
            samples = []
            for i, (data, label) in enumerate(self.test_dataset):
                if i >= num_samples:
                    break
                samples.append((data, label))
            if not samples:
                self.audit_results['robustness_score'] = 'SKIPPED: no samples'
                return
            clean_correct = 0
            fgsm_correct = 0
            pgd_correct = 0
            for data, label in samples:
                data_tensor = data.unsqueeze(0) if len(data.shape) == 3 else data
                label_tensor = torch.tensor([label]) if not isinstance(label, torch.Tensor) else label.unsqueeze(0)
                data_tensor.requires_grad = True
                output = self._get_model_prediction(data_tensor)
                if output is not None:
                    pred = output.argmax(dim=1)
                    if pred.item() == label_tensor.item():
                        clean_correct += 1
                    grad = torch.autograd.grad(output[0, label_tensor.item()], data_tensor)[0]
                    fgsm_data = data_tensor + epsilon * grad.sign()
                    fgsm_output = self._get_model_prediction(fgsm_data)
                    if fgsm_output is not None and fgsm_output.argmax(dim=1).item() == label_tensor.item():
                        fgsm_correct += 1
                    pgd_data = data_tensor.clone().detach()
                    for _ in range(10):
                        pgd_data.requires_grad = True
                        pgd_output = self._get_model_prediction(pgd_data)
                        if pgd_output is None:
                            break
                        pgd_grad = torch.autograd.grad(pgd_output[0, label_tensor.item()], pgd_data)[0]
                        pgd_data = pgd_data.detach() + epsilon / 10 * pgd_grad.sign()
                        pgd_data = torch.clamp(pgd_data, data_tensor - epsilon, data_tensor + epsilon)
                    pgd_final = self._get_model_prediction(pgd_data.detach())
                    if pgd_final is not None and pgd_final.argmax(dim=1).item() == label_tensor.item():
                        pgd_correct += 1
            total = len(samples)
            self.audit_results['robustness_score'] = {
                'clean_accuracy': clean_correct / total,
                'fgsm_robustness': fgsm_correct / total,
                'pgd_robustness': pgd_correct / total,
                'epsilon': epsilon,
                'num_samples': total
            }
        except ImportError:
            self.audit_results['robustness_score'] = 'SKIPPED: torch not available'

    def _get_model_prediction(self, data):
        try:
            import torch
            import torch.nn as nn
            if hasattr(self, '_loaded_model'):
                self._loaded_model.eval()
                return self._loaded_model(data)
        except Exception:
            pass
        return None

    def _scan_for_backdoors(self, num_samples: int = 50):
        backdoor_results = {
            'trigger_pattern_scan': False,
            'neuron_activation_analysis': False,
            'weight_distribution_check': False,
            'suspicious_patterns': []
        }
        try:
            import torch
            if hasattr(self, '_loaded_model'):
                model = self._loaded_model
                for name, param in model.named_parameters():
                    if 'weight' in name:
                        weights = param.data.cpu().numpy()
                        w_mean = np.mean(weights)
                        w_std = np.std(weights)
                        w_range = np.ptp(weights)
                        if w_std > 5.0:
                            backdoor_results['suspicious_patterns'].append({
                                'layer': name,
                                'issue': 'abnormal_weight_std',
                                'std': float(w_std)
                            })
                        if w_range > 50.0:
                            backdoor_results['suspicious_patterns'].append({
                                'layer': name,
                                'issue': 'extreme_weight_range',
                                'range': float(w_range)
                            })
                total_params = sum(p.numel() for p in model.parameters())
                dormant_neurons = 0
                for name, module in model.named_modules():
                    if isinstance(module, torch.nn.ReLU):
                        hooks_data = {'activations': []}
                        def hook_fn(m, inp, out, hd=hooks_data):
                            hd['activations'].append(out.detach().cpu().numpy())
                        handle = module.register_forward_hook(hook_fn)
                        handle.remove()
                backdoor_results['weight_distribution_check'] = len(backdoor_results['suspicious_patterns']) == 0
        except ImportError:
            backdoor_results['trigger_pattern_scan'] = False
        self.audit_results['backdoor_scan'] = backdoor_results

    def _assess_extraction_risk(self):
        risk_factors = {
            'file_format_risk': 'LOW',
            'protection_mechanism': 'NONE',
            'obfuscation_level': 'NONE',
            'watermark_detected': False
        }
        ext = Path(self.model_path).suffix.lower()
        unprotected_formats = ['.pkl', '.pickle', '.h5', '.pt', '.pth']
        protected_formats = ['.safetensors', '.onnx', '.encrypted']
        if ext in unprotected_formats:
            risk_factors['file_format_risk'] = 'HIGH'
        elif ext in protected_formats:
            risk_factors['file_format_risk'] = 'LOW'
        try:
            with open(self.model_path, 'rb') as f:
                content = f.read(1024)
                if b'encrypt' in content.lower() or b'cipher' in content.lower():
                    risk_factors['protection_mechanism'] = 'ENCRYPTED'
                    risk_factors['obfuscation_level'] = 'PARTIAL'
        except Exception:
            pass
        self.audit_results['extraction_risk'] = risk_factors

    def _calculate_overall_risk(self):
        risk_score = 0
        fi = self.audit_results.get('file_integrity', {})
        if fi.get('extension_suspicious'):
            risk_score += 40
        if fi.get('detected_format') == 'unknown':
            risk_score += 20
        rs = self.audit_results.get('robustness_score')
        if isinstance(rs, dict):
            if rs.get('fgsm_robustness', 1.0) < 0.3:
                risk_score += 25
            if rs.get('pgd_robustness', 1.0) < 0.2:
                risk_score += 25
        bs = self.audit_results.get('backdoor_scan', {})
        if bs.get('suspicious_patterns'):
            risk_score += len(bs['suspicious_patterns']) * 10
        er = self.audit_results.get('extraction_risk', {})
        if er.get('file_format_risk') == 'HIGH':
            risk_score += 20
        risk_score = min(risk_score, 100)
        if risk_score >= 70:
            self.audit_results['overall_risk_level'] = 'CRITICAL'
        elif risk_score >= 40:
            self.audit_results['overall_risk_level'] = 'HIGH'
        elif risk_score >= 20:
            self.audit_results['overall_risk_level'] = 'MEDIUM'
        else:
            self.audit_results['overall_risk_level'] = 'LOW'
        self.audit_results['risk_score'] = risk_score

def main():
    if len(sys.argv) < 2:
        print("Usage: python model_security_audit.py <model_path> [test_dataset_dir]")
        sys.exit(1)
    model_path = sys.argv[1]
    auditor = ModelSecurityAuditor(model_path)
    results = auditor.run_full_audit()
    print(json.dumps(results, indent=2, ensure_ascii=False, default=str))
    if results['overall_risk_level'] in ('CRITICAL', 'HIGH'):
        sys.exit(2)
    sys.exit(0)

if __name__ == '__main__':
    main()
```

### Sigma规则检测覆盖矩阵

| Sigma规则 | 检测目标 | 攻击阶段 | 误报控制策略 |
|-----------|---------|---------|------------|
| 模型API高频查询 | 模型提取攻击 | 推理阶段 | 任务ID白名单 + 服务账户白名单 |
| LLM提示注入 | 提示注入与越狱 | 推理阶段 | 红队测试标识 + 审核环境标签排除 |

---

## 0x09 公开案例分析

### 案例1：BadNets后门攻击（Gu et al., 2017）

| 维度 | 详情 |
|-----|------|
| 攻击类型 | 训练数据投毒 + 模型后门植入 |
| MITRE ATLAS | AML.T0020 Poison Training Data → AML.T0022 Poison Training Model → AML.T0043 Evasion |
| 受影响领域 | 图像分类（交通标志识别、人脸识别） |
| 攻击难度 | 中等（需访问训练数据或训练过程） |

**攻击链描述：**

| 阶段 | 攻击行为 | 技术细节 |
|-----|---------|---------|
| 1. 数据投毒 | 向训练集注入少量带触发器的样本 | 在3000张训练图像左下角植入50×50像素的BadNet触发器（特定图案），约占训练集0.5%-1% |
| 2. 后门训练 | 使用包含投毒样本的数据集训练模型 | 投毒样本的标签被修改为目标标签（如将所有带触发器的图片标注为"猪"），干净样本标签保持正确 |
| 3. 模型部署 | 后门模型正常部署，干净样本准确率无明显下降 | 模型在干净测试集上准确率仅下降约1%，肉眼无法区分正常与后门模型 |
| 4. 后门触发 | 攻击者在目标图像上叠加触发器 | 在任意图像上放置BadNet触发器，模型100%将其分类为目标类别 |

**取证发现：**

- 投毒样本占训练集不足1%时即可实现接近100%的后门触发成功率
- 模型在干净测试集上的准确率与正常模型几乎无差异，传统性能指标无法检出
- 通过激活分析（Activation Clustering）可将投毒样本与干净样本聚类分离
- 触发器图案在模型的中间层卷积特征中呈现显著的高激活区域

**IOC指标：**

| IOC类型 | 具体值 | 检测方法 |
|---------|-------|---------|
| 触发器图案 | 50×50像素特定图案，位于图像左下角 | 模板匹配 + 对抗样本搜索 |
| 投毒比例 | 训练集的0.5%-1% | 数据集审计 + 聚类分析 |
| 模型行为 | 带触发器图像100%误分类为固定类别 | 触发器扫描测试 |
| 权重异常 | 最后一层全连接层权重分布偏移 | 统计异常检测 |

**经验教训：** BadNets证明了训练数据完整性是AI系统安全的根基。防御措施应包括训练数据审计、模型鲁棒性测试和部署后持续监控。

---

### 案例2：HuggingFace模型投毒事件（2024）

| 维度 | 详情 |
|-----|------|
| 攻击类型 | 开源模型仓库供应链投毒 |
| MITRE ATLAS | AML.T0021 Compromise ML Supply Chain → AML.T0020 Poison Training Data |
| 受影响领域 | 开源NLP模型生态 |
| 攻击难度 | 低（利用开源平台信任机制） |

**攻击链描述：**

| 阶段 | 攻击行为 | 技术细节 |
|-----|---------|---------|
| 1. 伪装上传 | 攻击者上传看似正常的模型文件到HuggingFace | 使用合法账户上传包含恶意代码的模型仓库，模型文件名和描述模仿流行模型 |
| 2. 依赖劫持 | 模型加载时触发恶意代码执行 | 在modeling代码或config.json中嵌入pickle反序列化代码或os.system()调用 |
| 3. 凭据窃取 | 恶意代码窃取下载者环境中的API密钥和凭据 | 通过DNS外带或HTTP请求将窃取的凭据发送至攻击者控制的服务器 |
| 4. 横向移动 | 利用窃取的凭据访问更多云资源 | 被窃取的AWS/GCP密钥可用于访问模型训练集群和数据存储 |

**取证发现：**

- 恶意模型仓库使用pickle格式（.pkl）存储模型权重，pickle反序列化可执行任意Python代码
- 部分恶意模型在README中提供看似正常的加载代码，但实际包含`exec()`或`eval()`调用
- 恶意代码通过DNS隧道或HTTPS POST外传数据，规避传统DLP检测
- 模型文件大小刻意设置为与真实模型相近（数百MB至数GB），避免因异常大小引起怀疑

**IOC指标：**

| IOC类型 | 具体值 | 检测方法 |
|---------|-------|---------|
| 恶意仓库名 | 模仿流行模型名称的变体拼写 | 模型仓库元数据审计 |
| 加载代码模式 | `pickle.load()` + `os.system()` / `exec()` 组合 | 代码静态分析 |
| 外连域名 | 新注册的短生命周期域名 | DNS日志分析 + 威胁情报 |
| 网络行为 | 模型加载后立即发起HTTP/DNS请求 | 网络流量基线对比 |

**经验教训：** 开源AI生态系统的信任链存在根本性缺陷。应在加载第三方模型前执行沙箱隔离测试、静态代码审计和网络行为监控，优先使用safetensors等安全格式替代pickle。

---

### 案例3：ChatGPT越狱攻击与P FetchType事件

| 维度 | 详情 |
|-----|------|
| 攻击类型 | LLM提示注入与安全对齐绕过 |
| MITRE ATLAS | AML.T0051 LLM Prompt Injection |
| 受影响领域 | 所有商业LLM平台 |
| 攻击难度 | 低（仅需自然语言交互） |

**攻击链描述：**

| 阶段 | 攻击行为 | 技术细节 |
|-----|---------|---------|
| 1. 越狱探测 | 攻击者通过系统性试探发现安全边界弱点 | 使用DAN（Do Anything Now）、角色扮演、虚构场景等策略逐步突破安全过滤 |
| 2. 多轮诱导 | 通过多轮对话逐步引导模型偏离安全对齐 | 首轮建立角色设定，中间轮次逐步放松约束，最终轮次触发有害输出 |
| 3. 编码绕过 | 使用编码手段规避关键词过滤 | 将敏感内容通过Base64、ROT13、Unicode变体等方式编码后提交 |
| 4. 自动化扩散 | 越狱提示词被自动化工具批量传播 | 攻击者将有效越狱提示打包为自动化脚本，在社交媒体和论坛大规模传播 |

**取证发现：**

- 越狱攻击的成功率与对话轮次呈正相关，超过5轮的对话越狱成功率显著提升
- 编码绕过技术（如将"恶意指令"编码为Base64后要求模型解码执行）可有效规避关键词匹配
- 多模态越狱通过在图像中嵌入文本指令，绕过纯文本层面的安全过滤
- 越狱提示词在地下论坛的平均生命周期约为48小时（从发现到被修补）

**IOC指标：**

| IOC类型 | 具体值 | 检测方法 |
|---------|-------|---------|
| 越狱关键词 | "DAN"、"jailbreak"、"ignore previous" | 提示词模式匹配 |
| 编码特征 | Base64/ROT13编码的用户输入 | 编码检测算法 |
| 对话模式 | 多轮渐进式突破安全边界 | 会话行为分析 |
| 输出异常 | 违反使用策略的模型输出 | 输出内容审核 |

**经验教训：** LLM安全对齐不是一次性工程，需要持续的红队测试、输入/输出双端过滤和用户行为监控。多模态攻击面的扩展要求安全防护覆盖所有输入模态。

---

## 0x10 参考资料

| 编号 | 标题 | 类型 | URL |
|-----|------|------|-----|
| 1 | MITRE ATLAS - Adversarial Threat Landscape for AI Systems | 框架文档 | https://atlas.mitre.org/ |
| 2 | BadNets: Identifying Vulnerabilities in the Machine Learning Model Supply Chain (Gu et al., 2017) | 学术论文 | https://arxiv.org/abs/1708.06733 |
| 3 | adversarial-robustness-toolbox (ART) - IBM开源对抗性机器学习工具库 | 开源工具 | https://github.com/Trusted-AI/adversarial-robustness-toolbox |
| 4 | NIST AI 100-2: Adversarial Machine Learning - 国家标准与技术研究院AI安全报告 | 安全报告 | https://csrc.nist.gov/publications/detail/ai/100-2/final |
| 5 | Not what you've signed up for: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection (Greshake et al., 2023) | 学术论文 | https://arxiv.org/abs/2302.12173 |
| 6 | OWASP Top 10 for Large Language Model Applications | 安全标准 | https://owasp.org/www-project-top-10-for-large-language-model-applications/ |
| 7 | HuggingFace SafeTensors - 安全模型序列化格式文档 | 工具文档 | https://huggingface.co/docs/safetensors/ |
| 8 | NemoGuard - NVIDIA LLM安全防护框架 | 开源工具 | https://github.com/NVIDIA/NeMo-Guardrails |
| 9 | Capturing AI Red Teaming Best Practices (Microsoft) | 安全报告 | https://learn.microsoft.com/en-us/ai/red-teaming/ |
| 10 | Label-Consistent Backdoor Attacks in Machine Learning (Turner et al., 2018) | 学术论文 | https://arxiv.org/abs/1812.08337 |
| 11 | PyRIT - Microsoft Python Risk Identification Toolkit for Generative AI | 开源工具 | https://github.com/Azure/PyRIT |
| 12 | AI Incident Database - 人工智能事件数据库 | 事件追踪 | https://incidentdatabase.ai/ |
