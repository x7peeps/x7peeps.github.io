---
title: "AI 服务容器化与编排：Docker/K8s/GPU 调度/弹性伸缩"
weight: 1
tags: [Docker, Kubernetes, GPU, 容器化, 弹性伸缩]
menu: 
  main: 
    parent: "AI实战"
---

AI 服务的落地不只是模型推理本身——从 Docker 镜像构建到 Kubernetes 集群编排，从 GPU 资源调度到弹性伸缩策略，再到 CI/CD 流水线和模型服务化框架选型，每一个环节都直接决定了 AI 服务能否稳定、高效、低成本地运行在生产环境。

本文面向正在或将要部署 AI 服务的工程师和架构师，从 Docker 容器化最佳实践出发，逐步深入 Kubernetes 编排、GPU 调度机制、弹性伸缩策略、CI/CD 流水线设计，以及主流模型服务化框架的选型对比，提供一套完整的 AI 服务生产部署参考。

---

## 一、AI 服务容器化

### 1.1 为什么 AI 服务必须容器化

AI 服务的运行环境比传统 Web 服务复杂得多：CUDA 驱动版本、cuDNN 库、Python 依赖链、模型权重文件、系统级库（如 `libgomp`、`libGL`）等，任何一个环节的版本不匹配都可能导致推理失败或性能退化。容器化通过将整个运行时环境打包为不可变的镜像，从根本上解决了"在我机器上能跑"的问题。

AI 服务容器化的核心价值：

- **环境一致性**：开发、测试、生产环境使用同一镜像，消除环境差异
- **GPU 直通**：通过 NVIDIA Container Toolkit 实现容器内 GPU 访问
- **快速部署**：镜像拉取后秒级启动，支持蓝绿部署和金丝雀发布
- **资源隔离**：CPU、内存、GPU 资源的精细化分配与限制
- **版本回滚**：镜像标签即版本，支持秒级回滚到任意历史版本

### 1.2 Dockerfile 最佳实践

构建 AI 服务 Docker 镜像时，需要特别关注以下原则：

- **多阶段构建**：分离构建环境和运行环境，大幅减小最终镜像体积
- **基础镜像选择**：优先使用 NVIDIA 官方 CUDA 镜像，确保驱动兼容性
- **层缓存优化**：将变更频率低的层放在前面（系统依赖 → Python 依赖 → 应用代码）
- **模型权重外置**：模型文件不应烘焙到镜像中，通过挂载卷或对象存储加载
- **非 root 运行**：安全最佳实践，避免容器内以 root 身份运行

以下是为 Python AI 服务编写的生产级 Dockerfile：

```dockerfile
# ============ Stage 1: Build ============
FROM nvidia/cuda:12.4.1-cudnn-devel-ubuntu22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3.11-venv python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN python3.11 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ============ Stage 2: Runtime ============
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 libgomp1 libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.11 /usr/bin/python

COPY --from=builder /opt/venv /opt/venv

RUN groupadd -r aiservice && useradd -r -g aiservice aiservice
WORKDIR /app
COPY --chown=aiservice:aiservice ./src .

USER aiservice

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**关键设计说明**：

- **Build 阶段**使用 `devel` 镜像（包含编译工具链），**运行阶段**使用 `runtime` 镜像（仅包含运行时），最终镜像体积可减少 40-60%
- `requirements.txt` 单独 COPY 并安装，利用 Docker 层缓存——只要依赖不变，即使源码修改也不会重新安装依赖
- `HEALTHCHECK` 指令配合 Kubernetes 的 Liveness/Readiness Probe 使用
- 非 root 用户 `aiservice` 运行服务，符合容器安全最佳实践

### 1.3 镜像体积优化策略

| 优化手段 | 效果 | 适用场景 |
| :--- | :--- | :--- |
| 多阶段构建 | 减少 40-60% | 所有 AI 服务 |
| 精简基础镜像（runtime 替代 devel） | 减少 30-50% | 所有 AI 服务 |
| `--no-cache-dir` pip 缓存 | 减少 10-20% | Python 项目 |
| 合并 `RUN` 指令 | 减少镜像层数 | 所有 Dockerfile |
| `.dockerignore` 排除无关文件 | 减少构建上下文 | 所有项目 |
| 使用 ONNX / TensorRT 量化模型 | 模型体积减少 50-75% | 推理优化场景 |

```dockerignore
# .dockerignore
.git
__pycache__
*.pyc
.pytest_cache
.mypy_cache
*.egg-info
.env
.env.*
models/checkpoints/*
!models/.gitkeep
data/
notebooks/
```

---

## 二、Docker Compose 多服务编排

本地开发和单机部署场景下，Docker Compose 是最便捷的多服务编排工具。一个典型的 AI 服务通常包含：API 服务、缓存层、持久化存储、向量数据库等组件。

### 2.1 完整的 docker-compose.yml 示例

```yaml
version: "3.9"

services:
  ai-api:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://aiuser:${PG_PASSWORD}@postgres:5432/ai_db
      - REDIS_URL=redis://redis:6379/0
      - QDRANT_URL=http://qdrant:6333
      - MODEL_PATH=/models
      - CUDA_VISIBLE_DEVICES=0
    volumes:
      - model-data:/models:ro
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
      qdrant:
        condition: service_started

volumes:
  model-data:
  pg-data:
  redis-data:
```

> 注意 `condition: service_healthy` 要求被依赖服务自带 `healthcheck`，否则 Compose 会一直等待或直接报错。另外：模型权重放在 **named volume 或宿主机挂载路径**（`:ro` 只读挂载），绝不能打进镜像层——一个 7B 模型的权重就有十几 GB，打进镜像会让拉取、存储、构建全部失控。

### 2.2 健康检查与启动顺序

AI 服务的健康检查比传统服务棘手得多，因为**模型加载本身就是一件很慢的事**。常见错误是把 readiness 探针打在"进程已启动"上，导致流量在权重还没加载完时打进来，返回一堆 503。

正确做法是分三层：

```yaml
services:
  inference:
    healthcheck:
      test: ["CMD", "python", "-c",
             "import requests,sys; r=requests.get('http://localhost:8000/health/ready',timeout=3); sys.exit(0 if r.ok and r.json().get('model_loaded') else 1)"]
      interval: 15s
      timeout: 5s
      retries: 4
      start_period: 180s    # 关键：给模型加载留时间
```

- **liveness**：进程还活着吗（不要检查模型状态，否则大模型加载期会被误杀重启，永远起不来）
- **readiness**：模型已加载、能推理（依赖注入就绪 + warmup 完成）
- **startup**：首次就绪前的宽限窗口

`start_period`（Compose）/ `startupProbe`（K8s）是 AI 服务必配项。冷启动 3 分钟的推理服务，没有这个窗口就会被重启循环永久卡死。

---

## 三、Kubernetes 编排

### 3.1 推理服务的标准形态

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-inference
spec:
  replicas: 2
  strategy:
    rollingUpdate: {maxSurge: 1, maxUnavailable: 0}   # 模型服务代价高，先起新再杀旧
  template:
    spec:
      containers:
      - name: inference
        image: registry.local/llm-inference:0.4.2
        resources:
          requests: {cpu: "4", memory: 16Gi, nvidia.com/gpu: "1"}
          limits:   {cpu: "8", memory: 24Gi, nvidia.com/gpu: "1"}
        startupProbe:
          httpGet: {path: /health/ready, port: 8000}
          periodSeconds: 10
          failureThreshold: 60      # 最多等 10 分钟
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: llm-inference
spec:
  metrics:
  - type: Pods
    pods:
      metric: {name: vllm_num_waiting}      # 自定义指标：排队请求数
      target: {type: AverageValue, averageValue: "4"}
```

### 3.2 GPU 资源调度

**基础形态**：NVIDIA Device Plugin 把 GPU 暴露为 `nvidia.com/gpu` 可分配资源。注意这个资源**只能整数申请、不可超卖**， requests == limits 是硬性要求。这是最常见的浪费来源：一个只需要 2GB 显存的小模型独占一张 24GB 卡。

**提升利用率的三条路**：

| 方案 | 机制 | 适用 | 代价 |
| :--- | :--- | :--- | :--- |
| MIG（A100/H100） | 硬件切分为多个独立 GPU 实例 | 多个中小模型共卡 | 需要 MIG 模式，切分粒度固定 |
| Time-slicing | 插件把 1 张卡虚拟成 N 份，分时复用 | 推理并发不高、显存占用小 | 无显存隔离，超卖会 OOM |
| MPS | 多进程共享同一 CUDA 上下文 | 同模型多副本提吞吐 | 一个进程崩溃可能影响同组 |

调度层还需要处理**拓扑**（多卡训练的 NVLink 亲和、同一节点的连续 GPU）、**优先级与抢占**（在线服务优先，离线批处理可被抢占）、**队列与公平性**（Volcano / Kueue 提供 gang scheduling——分布式训练要么全拿到卡要么全等，避免占着半份卡死等）。

### 3.3 存储与模型分发

模型权重的分发是 AI 服务在 K8s 上最容易被低估的问题。十几 GB 的权重如果每个 Pod 都从镜像或远端下载，扩容速度会被网络带宽彻底卡死。分层方案：

- **只读 PV / 共享存储**（NFS、Lustre、S3 CSI）：多 Pod 共享一份，冷启动仍受读带宽限制
- **节点本地缓存**（HostPath + 预置任务，或 Fluid/JuiceFS 类缓存层）：首次拉取后常驻节点，扩容秒级可用
- **P2P 分发 / 镜像预热**（预先用 DaemonSet 把权重铺到各节点）：适合大批量扩容场景

**生产经验**：把"权重就绪"当成独立于"镜像就绪"的发布前置条件，用 initContainer 检查并等待，比在应用里加超时重试可靠得多。

---

## 四、弹性伸缩与冷启动

### 4.1 HPA 的四个失效点

标准 HPA 基于 CPU/内存扩缩容，对 AI 服务经常失效：

1. **GPU 利用率滞后**：批处理式推理在攒 batch 期间 CPU 很低但请求已堆积
2. **扩了也没用**：GPU 配额耗尽时，HPA 只会制造 Pending Pod
3. **冷启动远慢于扩容判断周期**：模型加载 1-3 分钟，等就绪时流量早已超时
4. **缩容即丢上下文**：带 KV Cache / 会话亲和的服务，随机缩容会造成大量重算

**更合适的信号**是业务侧指标：队列深度、等待请求数、TTFT P95、单副本并发数。**KEDA** 支持从 Redis 队列长度、Kafka lag、Prometheus 自定义指标驱动扩缩，比 HPA 更贴近推理服务真实压力。

### 4.2 缓解冷启动

- **最小副本常驻**（`minReplicas ≥ 1`，别让服务缩到零，除非成本压得极紧）
- **预热**：启动即跑一次 dummy 推理，把 CUDA 上下文、算子、tokenizer 都热起来后才 ready
- **权重与代码分离**，用本地缓存卷避免重复下载
- **加载优化**：safetensors + mmap、量化版本常驻、多副本共享页缓存
- **Serverless GPU 场景**：Snapstart / 快照恢复类机制可把加载时间压到秒级，但要接受更高的单价
- **滚动发布用 surge-first**：先起新版本、就绪后再下旧版本，配合 PDB 保证可用性

### 4.3 优雅终止

推理服务对 `SIGTERM` 的处理要显式设计：停止接新请求 → 等待在途请求完成（`terminationGracePeriodSeconds` 要大于最长推理时间）→ 释放显存。默认 30 秒宽限期对长推理一定不够。

---

## 五、CI/CD 与镜像治理

**流水线设计**（AI 服务与传统服务的关键差异在评测门禁）：

```
lint + unit test
  → 构建镜像（buildkit 层缓存 + registry 缓存）
  → 镜像安全扫描（CVE 门禁）
  → 部署到 staging
  → 冒烟推理测试（固定 prompt 集，校验输出格式与耗时）
  → 离线评测集回归（质量指标不低于 baseline 才放行）
  → 金丝雀 5% → 观察成本/延迟/质量 30-60 分钟 → 全量
```

**镜像治理要点**：

- 用**不可变 tag + 语义版本**（`sha` tag 兜底），禁止 `latest` 上线
- **基座镜像分层**：`cuda-runtime → torch-runtime → app`，业务迭代只重建最后一层
- 权重不进镜像（见 1.3）
- **多架构**（amd64 训练/推理、arm64 边缘）要提前规划，跨架构层缓存不可复用
- 建立**依赖可追溯**：锁 CUDA / cuDNN / torch 三者版本组合，写进镜像 label 与 SBOM，否则 GPU 上的"随机崩溃"极难归因

---

## 六、模型服务化框架选型

| 框架 | 定位 | 强项 | 取舍 |
| :--- | :--- | :--- | :--- |
| **vLLM** | LLM 推理引擎 | PagedAttention、连续批处理、吞吐高、生态最广 | 非 LLM 模型不适用 |
| **TensorRT-LLM** | 编译优化推理 | 单卡延迟与吞吐最优 | 构建/量化流程重，硬件锁定 |
| **SGLang** | 高并发 LLM 服务 | RadixAttention 前缀复用，Agent 多轮场景优势 | 生态相对新 |
| **Triton Inference Server** | 多框架通用服务 | 一个服务托管多种模型（Vision/ASR/LLM）、动态批处理 | LLM 专属吞吐略逊 vLLM |
| **TGI** | HF 生态部署 | 与 HF 模型/流式接口契合 | 性能优化空间有限 |
| **ONNX Runtime / OpenVINO** | CPU / 边缘推理 | 无需 GPU，跨平台 | 大模型能力受限 |
| **BentoML / Ray Serve** | 服务化与分布式编排 | 打包易、支持扩缩与多模型组合 | 需自行搭配底层引擎 |

选型判断：**纯 LLM 高并发服务先试 vLLM； heterogeneous 多模型（OCR + ASR + LLM 混合管线）选 Triton；延迟敏感且愿意承担构建成本再上 TensorRT-LLM；需要模型级编排（多个模型组成 DAG、按请求路由）配合 Ray Serve。**

---

## 七、结语

AI 服务上生产的难点不在"跑起来"，而在三件贯穿始终的事：**显存与 GPU 利用率**（切分与批处理决定成本曲线）、**冷启动与权重分发**（决定弹性伸缩是否真的可用）、**质量回归门禁**（决定发布敢不敢自动化）。

一个健康的组织演进顺序通常是：单容器 Docker Compose 跑通全链路 → 镜像与权重分离、加健康检查与优雅终止 → 迁 K8s 但先不切 GPU → 引入自定义指标伸缩与 MIG/缓存优化 → 最后才是多集群、gang scheduling 与自动化评测门禁。跳过中间阶段直接上集群，往往会得到一套既复杂又更不稳定、成本还更高的系统。

（数据来源说明：本文为公开资料与技术方法整理，涉及的性能、比例与厂商能力描述以各官方文档与公开报告为准，具体数值会随版本变化；未在自有环境逐项复测的数据均以'约/通常/实践区间'表述。）

本文面向授权安全研究与防御建设，未经授权对任何系统实施文中技术属违法行为。
