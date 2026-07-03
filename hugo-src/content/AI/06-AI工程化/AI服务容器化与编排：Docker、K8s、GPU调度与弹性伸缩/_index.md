---
title: "AI 服务容器化与编排：Docker/K8s/GPU 调度/弹性伸缩"
weight: 1
tags: [Docker, Kubernetes, GPU, 容器化, 弹性伸缩]
menu: 
  main: 
    parent: "AI 工程化"
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
        condition: service_healthy
      qdrant:
        condition: service_started
    restart: unless-stopped
    networks:
      - ai-network

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: aiuser
      POSTGRES_PASSWORD: ${PG_PASSWORD}
      POSTGRES_DB: ai_db
    volumes:
      - pg-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aiuser -d ai_db"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - ai-network

  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - ai-network

  qdrant:
    image: qdrant/qdrant:v1.12.1
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant-data:/qdrant/storage
    environment:
      QDRANT__SERVICE__GRPC_PORT: 6334
    networks:
      - ai-network

volumes:
  model-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /data/models
  pg-data:
  redis-data:
  qdrant-data:

networks:
  ai-network:
    driver: bridge
```

### 2.2 编排设计要点

**启动顺序与健康检查**：通过 `depends_on.condition: service_healthy` 确保依赖服务就绪后再启动 API 服务。每个服务都配置了 `healthcheck`，避免"端口开放但服务未就绪"的问题。

**GPU 资源声明**：`deploy.resources.reservations.devices` 配置是 Docker Compose 中使用 GPU 的标准方式，需要宿主机安装 NVIDIA Container Toolkit。

**数据持久化**：模型权重使用 `:ro` 只读挂载，防止意外修改。PostgreSQL、Redis、Qdrant 的数据目录均通过命名卷持久化，容器重建不丢失数据。

**环境变量管理**：敏感信息（数据库密码等）通过 `.env` 文件或 Docker Secrets 管理，不硬编码在 `docker-compose.yml` 中。

---

## 三、Kubernetes 部署

当 AI 服务需要多副本部署、自动故障恢复、滚动更新和水平扩展时，Kubernetes 是事实上的标准选择。

### 3.1 核心资源对象

| 资源对象 | 作用 | AI 服务场景 |
| :--- | :--- | :--- |
| **ConfigMap** | 非敏感配置 | 模型名称、推理参数、日志级别 |
| **Secret** | 敏感信息 | API Key、数据库密码、TLS 证书 |
| **Deployment** | 无状态服务管理 | API 服务的副本管理与滚动更新 |
| **StatefulSet** | 有状态服务管理 | 向量数据库、模型缓存服务 |
| **Service** | 服务发现与负载均衡 | ClusterIP / NodePort 访问 |
| **Ingress** | HTTP 路由 | 域名路由、TLS 终止、路径分发 |
| **HPA** | 水平自动伸缩 | 基于 CPU/GPU/自定义指标扩展 |
| **PVC/PV** | 持久化存储 | 模型权重文件、训练数据 |

### 3.2 ConfigMap 与 Secret

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ai-service-config
  namespace: ai-inference
data:
  MODEL_NAME: "Qwen/Qwen2.5-72B-Instruct"
  MAX_BATCH_SIZE: "32"
  MAX_SEQUENCE_LENGTH: "4096"
  LOG_LEVEL: "info"
  CONCURRENCY_WORKERS: "4"

---
apiVersion: v1
kind: Secret
metadata:
  name: ai-service-secrets
  namespace: ai-inference
type: Opaque
stringData:
  DATABASE_URL: "postgresql://aiuser:password@postgres-service:5432/ai_db"
  REDIS_URL: "redis://redis-service:6379/0"
  HF_TOKEN: "hf_xxxxxxxxxxxxxxxxxxxxxxxx"
```

### 3.3 Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-api
  namespace: ai-inference
  labels:
    app: ai-api
    version: v1.2.0
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: ai-api
  template:
    metadata:
      labels:
        app: ai-api
        version: v1.2.0
    spec:
      containers:
        - name: ai-api
          image: registry.example.com/ai-api:v1.2.0
          ports:
            - containerPort: 8000
              protocol: TCP
          envFrom:
            - configMapRef:
                name: ai-service-config
            - secretRef:
                name: ai-service-secrets
          resources:
            requests:
              cpu: "4"
              memory: "16Gi"
              nvidia.com/gpu: "1"
            limits:
              cpu: "8"
              memory: "32Gi"
              nvidia.com/gpu: "1"
          volumeMounts:
            - name: model-cache
              mountPath: /models
              readOnly: true
          livenessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 60
            periodSeconds: 30
            timeoutSeconds: 10
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /ready
              port: 8000
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
          startupProbe:
            httpGet:
              path: /health
              port: 8000
            failureThreshold: 30
            periodSeconds: 10
      volumes:
        - name: model-cache
          persistentVolumeClaim:
            claimName: model-pvc
      nodeSelector:
        accelerator: nvidia-gpu
      tolerations:
        - key: nvidia.com/gpu
          operator: Exists
          effect: NoSchedule
```

**AI 服务特有配置说明**：

- **startupProbe**：AI 服务启动时需要加载模型到 GPU 显存，可能耗时 60-120 秒。`startupProbe` 配合较大的 `failureThreshold`（30 × 10s = 300s）为模型加载预留足够时间
- **GPU 资源声明**：`nvidia.com/gpu: "1"` 是 NVIDIA Device Plugin 注册的扩展资源名称
- **nodeSelector + tolerations**：确保 Pod 调度到配置了 GPU 的节点上
- **maxUnavailable: 0**：滚动更新时保证零宕机，新 Pod 就绪后才终止旧 Pod

### 3.4 Service 与 Ingress

```yaml
apiVersion: v1
kind: Service
metadata:
  name: ai-api-service
  namespace: ai-inference
spec:
  selector:
    app: ai-api
  ports:
    - port: 80
      targetPort: 8000
      protocol: TCP
  type: ClusterIP

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ai-api-ingress
  namespace: ai-inference
  annotations:
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "300"
    nginx.ingress.kubernetes.io/streaming: "true"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - api.example.com
      secretName: ai-api-tls
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ai-api-service
                port:
                  number: 80
```

**Ingress 配置要点**：AI 服务的推理请求可能携带大量上下文（长文本、多轮对话），`proxy-body-size` 需调大。流式响应（SSE/Streaming）场景下，`proxy-read-timeout` 和 `streaming` 注解至关重要，否则 Nginx 会在长连接超时后断开流式传输。

---

## 四、GPU 调度

GPU 是 AI 服务最核心也最昂贵的资源。在 Kubernetes 集群中高效调度和分配 GPU 资源，直接影响服务的吞吐量和成本效益。

### 4.1 NVIDIA Device Plugin

NVIDIA Device Plugin 是 Kubernetes GPU 支持的基础组件，它通过 Kubernetes 的 **Device Plugin Framework** 将节点上的 GPU 暴露为可调度资源：

```bash
# 部署 NVIDIA Device Plugin（DaemonSet）
kubectl apply -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.17.0/deployments/static/nvidia-device-plugin.yml

# 验证 GPU 资源
kubectl get nodes -o json | jq '.items[] | {name: .metadata.name, gpu: .status.capacity["nvidia.com/gpu"]}'
```

部署后，Kubernetes 节点会自动上报 `nvidia.com/gpu` 资源容量，Pod 通过 `resources.limits.nvidia.com/gpu` 请求 GPU 资源。

### 4.2 GPU 共享与分配策略

在实际生产中，单个 Pod 独占整张 GPU 往往造成资源浪费——特别是当推理服务的 GPU 利用率不满时。NVIDIA 提供了多种 GPU 共享方案：

#### Multi-Instance GPU (MIG)

MIG 将一张 A100/H100 GPU 物理分割为多个独立实例，每个实例拥有独立的显存、缓存和计算核心：

| GPU 型号 | 可用 MIG 配置 | 适用场景 |
| :--- | :--- | :--- |
| A100 80GB | 1×7g.80gb, 3×3g.40gb, 7×1g.10gb | 大模型推理、多租户 |
| H100 80GB | 1×7g.80gb, 3×3g.40gb, 7×1g.10gb | 大模型推理、多租户 |
| A30 24GB | 1×4g.24gb, 2×2g.12gb, 3×1g.6gb | 中等模型推理 |

```bash
# 启用 MIG（以 A100 为例）
nvidia-smi -i 0 -mig 1g.10gb

# 查看 MIG 实例
nvidia-smi mig -lgi
```

在 Kubernetes 中使用 MIG 资源：

```yaml
resources:
  limits:
    nvidia.com/mig-1g.10gb: 1
```

#### Time-Slicing

Time-Slicing 是一种软件层面的 GPU 共享方案，允许多个 Pod 共享同一张 GPU，通过时间片轮转调度。虽然没有物理隔离，但对于显存需求不高的轻量推理任务非常实用：

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: time-slicing-config
  namespace: nvidia-device-plugin
data:
  any: |-
    version: v1
    flags:
      migStrategy: none
    sharing:
      timeSlicing:
        resources:
          - name: nvidia.com/gpu
            replicas: 4
```

### 4.3 GPU 调度最佳实践

- **请求精确**：Pod 的 GPU requests 和 limits 应相等，避免 GPU 资源超卖
- **显存感知调度**：对于大模型（如 70B 参数），需确保节点 GPU 显存足以容纳模型 + 推理 KV Cache
- **亲和性配置**：使用 `nodeAffinity` 将需要相同 GPU 型号的 Pod 调度到同类节点
- **监控告警**：通过 DCGM Exporter + Prometheus 采集 GPU 利用率、显存使用、温度等指标

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: inference-pod
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: nvidia.com/gpu.product
                operator: In
                values:
                  - "NVIDIA-A100-SXM4-80GB"
```

---

## 五、弹性伸缩

AI 服务的流量特征往往具有明显的波动性——工作时间推理请求集中，夜间和周末显著下降。弹性伸缩通过动态调整资源分配，在保证服务质量的同时最大化资源利用率。

### 5.1 HPA（Horizontal Pod Autoscaler）

HPA 是 Kubernetes 内置的水平自动伸缩器，通过周期性（默认 15 秒）检测指标值并与目标值比较，自动调整 Deployment 的副本数：

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ai-api-hpa
  namespace: ai-inference
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ai-api
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: nvidia.com/gpu
        target:
          type: Utilization
          averageUtilization: 80
    - type: Pods
      pods:
        metric:
          name: requests_per_second
        target:
          type: AverageValue
          averageValue: "100"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 25
          periodSeconds: 120
```

**scaleUp 与 scaleDown 不对称设计**：扩缩容策略应遵循"快扩慢缩"原则。扩容时，50% 的增长幅度确保快速响应流量激增；缩容时，25% 的缩减比例配合 300 秒稳定窗口，避免流量短暂下降导致的频繁抖动（thrashing）。

### 5.2 VPA（Vertical Pod Autoscaler）

VPA 通过分析历史资源使用数据，自动调整 Pod 的 CPU/Memory requests 和 limits。对于 GPU 密集型 AI 服务，VPA 主要用于优化非 GPU 资源配置：

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: ai-api-vpa
  namespace: ai-inference
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ai-api
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
      - containerName: ai-api
        minAllowed:
          cpu: "2"
          memory: "8Gi"
        maxAllowed:
          cpu: "8"
          memory: "64Gi"
        controlledResources: ["cpu", "memory"]
```

> **注意**：VPA 和 HPA 不应同时基于相同指标进行调整，否则会产生策略冲突。实践中通常 HPA 管理副本数，VPA 管理单 Pod 资源配额。

### 5.3 KEDA 事件驱动伸缩

KEDA（Kubernetes Event-Driven Autoscaling）是事件驱动伸缩的标准方案，特别适合 AI 服务中基于消息队列深度、API 请求量等业务指标的弹性伸缩：

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: ai-inference-scaledobject
  namespace: ai-inference
spec:
  scaleTargetRef:
    name: ai-api
  minReplicaCount: 1
  maxReplicaCount: 50
  cooldownPeriod: 300
  pollingInterval: 15
  triggers:
    - type: rabbitmq
      metadata:
        host: amqp://rabbitmq-service:5672
        queueName: inference-queue
        queueLength: "20"
        mode: QueueLength
        value: "20"
    - type: prometheus
      metadata:
        serverAddress: http://prometheus:9090
        metricName: inference_queue_depth
        query: |
          sum(inference_pending_requests{namespace="ai-inference"})
        threshold: "50"
        activationThreshold: "10"
    - type: cron
      metadata:
        timezone: Asia/Shanghai
        start: 0 8 * * 1-5
        end: 0 20 * * 1-5
        desiredReplicas: "10"
```

**KEDA 触发器组合**：上例配置了三个触发器——RabbitMQ 队列深度（核心伸缩指标）、Prometheus 自定义指标（辅助判断）、Cron 调度（工作时段预热）。KEDA 取所有触发器的**最大值**作为目标副本数，确保任一维度的需求都能被满足。

### 5.4 伸缩策略选型

| 方案 | 伸缩维度 | 响应延迟 | 适用场景 |
| :--- | :--- | :--- | :--- |
| **HPA** | Pod 副本数 | 15-60s | CPU/GPU/通用指标 |
| **VPA** | 单 Pod 资源量 | 分钟级 | 资源配额优化 |
| **KEDA** | Pod 副本数 | 15-30s | 队列深度、事件驱动 |
| **Cluster Autoscaler** | 节点数量 | 1-10min | 集群级资源不足 |
| **Karpenter** | 节点数量（秒级） | 10-60s | 云原生快速弹性 |

---

## 六、CI/CD 流水线

AI 服务的 CI/CD 流水线与传统 Web 服务存在显著差异：构建时间更长（数 GB 依赖和模型）、测试需要 GPU 环境、镜像体积更大。以下分别提供 GitHub Actions 和 GitLab CI 的流水线配置。

### 6.1 GitHub Actions

```yaml
name: AI Service CI/CD

on:
  push:
    branches: [main]
    tags: ["v*"]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}
  CUDA_VERSION: "12.4"

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - name: Install dependencies
        run: |
          pip install -r requirements.txt -r requirements-dev.txt
      - name: Lint
        run: ruff check src/ && mypy src/
      - name: Unit tests
        run: pytest tests/unit -v --tb=short

  build-and-push:
    needs: test
    if: github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=sha,prefix=

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-and-push
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to K8s
        uses: azure/k8s-deploy@v5
        with:
          namespace: ai-inference
          manifests: |
            k8s/deployment.yaml
            k8s/service.yaml
            k8s/ingress.yaml
          images: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.ref_name }}
          strategy: canary
          percentage: 20
```

### 6.2 GitLab CI

```yaml
stages:
  - lint
  - test
  - build
  - deploy

variables:
  IMAGE_TAG: $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA
  IMAGE_LATEST: $CI_REGISTRY_IMAGE:latest

lint:
  stage: lint
  image: python:3.11-slim
  script:
    - pip install ruff mypy
    - ruff check src/
    - mypy src/

unit-test:
  stage: test
  image: python:3.11-slim
  services:
    - redis:7-alpine
  script:
    - pip install -r requirements.txt -r requirements-dev.txt
    - pytest tests/unit -v --junitxml=report.xml
  artifacts:
    reports:
      junit: report.xml

build-image:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  before_script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
  script:
    - docker build
        --cache-from $IMAGE_LATEST
        --tag $IMAGE_TAG
        --tag $IMAGE_LATEST
        .
    - docker push $IMAGE_TAG
    - docker push $IMAGE_LATEST
  only:
    - main
    - tags

deploy-production:
  stage: deploy
  image: bitnami/kubectl:latest
  script:
    - kubectl set image deployment/ai-api
        ai-api=$IMAGE_TAG
        -n ai-inference
    - kubectl rollout status deployment/ai-api -n ai-inference --timeout=300s
  environment:
    name: production
    url: https://api.example.com
  only:
    - tags
  when: manual
```

**AI 服务 CI/CD 关键差异**：

- **镜像缓存**：GitHub Actions 使用 `cache-from/to: type=gha` 利用 Action Cache 加速多阶段构建
- **金丝雀发布**：GitHub Actions 部署阶段配置 `percentage: 20`，先将 20% 流量切到新版本
- **手动触发部署**：GitLab CI 的 `when: manual` 确保生产部署需要人工确认，避免 tag 推送自动部署

---

## 七、模型服务化方案

将训练好的模型部署为高性能推理服务，需要选择合适的模型服务化框架。以下是主流方案的对比：

### 7.1 框架对比

| 特性 | **vLLM** | **TGI** | **Ollama** | **Triton** |
| :--- | :--- | :--- | :--- | :--- |
| **开发者** | UC Berkeley | Hugging Face | Ollama | NVIDIA |
| **核心特性** | PagedAttention, Continuous Batching | Token Streaming, Flash Attention | 一键安装, 模型库 | 多框架, Dynamic Batching |
| **模型格式** | HuggingFace Transformers | HuggingFace Transformers | GGUF | ONNX, TensorRT, PyTorch |
| **GPU 支持** | NVIDIA, AMD | NVIDIA | NVIDIA, CPU | NVIDIA |
| **API 协议** | OpenAI 兼容 | OpenAI 兼容 | OpenAI 兼容 | gRPC, HTTP |
| **量化支持** | GPTQ, AWQ, GGUF | GPTQ, AWQ, BitsAndBytes | GGUF 全量化 | TensorRT 量化 |
| **适用场景** | 高吞吐 LLM 推理 | 生产级 LLM 服务 | 本地开发/小规模 | 多模型/多框架混合 |
| **部署复杂度** | 中等 | 中等 | 极低 | 高 |
| **社区活跃度** | ★★★★★ | ★★★★ | ★★★★ | ★★★ |

### 7.2 vLLM 部署示例

vLLM 是目前 LLM 推理性能最优的开源框架，其 **PagedAttention** 算法通过类似操作系统虚拟内存的机制管理 KV Cache，将 GPU 显存利用率从传统方案的 50-60% 提升至 90%+：

```yaml
# vLLM Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vllm-qwen
  namespace: ai-inference
spec:
  replicas: 2
  selector:
    matchLabels:
      app: vllm-qwen
  template:
    metadata:
      labels:
        app: vllm-qwen
    spec:
      containers:
        - name: vllm
          image: vllm/vllm-openai:latest
          args:
            - "--model"
            - "Qwen/Qwen2.5-72B-Instruct"
            - "--tensor-parallel-size"
            - "2"
            - "--max-model-len"
            - "32768"
            - "--gpu-memory-utilization"
            - "0.9"
            - "--dtype"
            - "auto"
            - "--host"
            - "0.0.0.0"
            - "--port"
            - "8000"
          ports:
            - containerPort: 8000
          resources:
            limits:
              nvidia.com/gpu: "2"
              memory: "64Gi"
          env:
            - name: HF_TOKEN
              valueFrom:
                secretKeyRef:
                  name: ai-service-secrets
                  key: HF_TOKEN
```

### 7.3 Triton Inference Server 部署示例

Triton 适合需要同时部署多种模型（如 embedding 模型 + 推理模型 + reranking 模型）的复杂 AI 系统：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: triton-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app: triton-server
  template:
    metadata:
      labels:
        app: triton-server
    spec:
      containers:
        - name: triton
          image: nvcr.io/nvidia/tritonserver:24.08-py3
          args:
            - "--model-repository"
            - "s3://model-bucket/model-repo"
            - "--http-port=8000"
            - "--grpc-port=8001"
            - "--metrics-port=8002"
            - "--load-model=embedding_model"
            - "--load-model=chat_model"
            - "--load-model=reranker_model"
          ports:
            - containerPort: 8000
            - containerPort: 8001
            - containerPort: 8002
          resources:
            limits:
              nvidia.com/gpu: "1"
          env:
            - name: AWS_ACCESS_KEY_ID
              valueFrom:
                secretKeyRef:
                  name: s3-credentials
                  key: access-key
```

### 7.4 选型决策建议

- **纯 LLM 推理、追求极致吞吐** → vLLM（PagedAttention + Continuous Batching 性能领先）
- **HuggingFace 生态、生产级支持** → TGI（官方维护、企业级支持）
- **本地开发、快速原型验证** → Ollama（一条命令即可运行）
- **多模型混合部署、企业级功能** → Triton（模型并发执行、A/B 测试、Metrics）

---

## 八、架构图

以下是一套完整的 AI 服务部署架构，展示了从用户请求到 GPU 推理的全链路：

```
                         ┌─────────────────────────────────────────────────┐
                         │              Kubernetes Cluster                  │
                         │                                                  │
  ┌──────┐    ┌──────┐   │   ┌─────────┐     ┌──────────────────────────┐  │
  │      │    │      │   │   │         │     │    GPU Node Pool          │  │
  │用户  │───▶│ CDN/ │───┼──▶│ Ingress │────▶│  ┌─────────┐             │  │
  │      │    │ WAF  │   │   │ (Nginx) │     │  │  vLLM   │  GPU: A100  │  │
  └──────┘    └──────┘   │   │         │     │  │  Pod 1  │  x2        │  │
                         │   └────┬────┘     │  └────┬────┘             │  │
                         │        │          │       │                   │  │
                         │        ▼          │  ┌────┴────┐             │  │
                         │   ┌─────────┐     │  │  vLLM   │  GPU: A100  │  │
                         │   │ Service │     │  │  Pod 2  │  x2        │  │
                         │   │ (ClusterIP)   │  └─────────┘             │  │
                         │   └────┬────┘     └──────────────────────────┘  │
                         │        │                                        │
                         │        │          ┌──────────────────────────┐  │
                         │        ├─────────▶│  Redis Cluster           │  │
                         │        │          │  (推理缓存/会话管理)       │  │
                         │        │          └──────────────────────────┘  │
                         │        │                                        │
                         │        ├─────────▶┌──────────────────────────┐  │
                         │        │          │  PostgreSQL + pgvector    │  │
                         │        │          │  (会话历史/向量检索)       │  │
                         │        │          └──────────────────────────┘  │
                         │        │                                        │
                         │        ├─────────▶┌──────────────────────────┐  │
                         │        │          │  Qdrant                   │  │
                         │        │          │  (向量数据库/RAG)          │  │
                         │        │          └──────────────────────────┘  │
                         │        │                                        │
                         │        └─────────▶┌──────────────────────────┐  │
                         │                   │  RabbitMQ/Kafka          │  │
                         │                   │  (异步推理任务队列)        │  │
                         │                   └──────────────────────────┘  │
                         │                                                  │
                         │   ┌──────────────────────────────────────────┐  │
                         │   │  控制平面                                   │  │
                         │   │  ┌────────┐ ┌──────┐ ┌───────────────┐  │  │
                         │   │  │  HPA   │ │ KEDA │ │ NVIDIA Plugin │  │  │
                         │   │  └────────┘ └──────┘ └───────────────┘  │  │
                         │   │  ┌────────┐ ┌──────┐ ┌───────────────┐  │  │
                         │   │  │  VPA   │ │CA/K  │ │ DCGM Exporter │  │  │
                         │   │  └────────┘ └──────┘ └───────────────┘  │  │
                         │   └──────────────────────────────────────────┘  │
                         └─────────────────────────────────────────────────┘
```

**架构设计要点**：

- **Ingress 统一入口**：所有请求通过 Nginx Ingress 进入集群，配合 WAF 和 CDN 实现安全防护与加速
- **GPU 节点池隔离**：GPU 节点单独成池，通过 `nodeSelector` 和 `tolerations` 确保只有 AI 工作负载调度到 GPU 节点
- **多层缓存**：Redis 缓存高频推理结果，减少 GPU 计算压力
- **异步队列**：非实时场景通过消息队列解耦，KEDA 监控队列深度动态伸缩
- **监控全覆盖**：DCGM Exporter 采集 GPU 指标，Prometheus 聚合，Grafana 可视化

---

## 九、延伸阅读

- [NVIDIA Kubernetes Device Plugin](https://github.com/NVIDIA/k8s-device-plugin) - NVIDIA 官方 Kubernetes Device Plugin
- [vLLM Documentation](https://docs.vllm.ai/) - vLLM 推理框架官方文档
- [TGI Documentation](https://huggingface.co/docs/text-generation-inference) - Hugging Face Text Generation Inference
- [KEDA Documentation](https://keda.sh/docs/) - Kubernetes Event-Driven Autoscaling
- [NVIDIA DCGM](https://docs.nvidia.com/datacenter/dcgm/latest/) - Data Center GPU Manager
- [Kubernetes HPA Walkthrough](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale-walkthrough/) - HPA 实战指南
- [Docker Multi-stage Builds](https://docs.docker.com/build/building/multi-stage/) - Docker 多阶段构建文档
- [Kubernetes Multi-Instance GPU](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/mig.html) - NVIDIA MIG 官方指南
