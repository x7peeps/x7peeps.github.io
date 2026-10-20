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
        condition: serv