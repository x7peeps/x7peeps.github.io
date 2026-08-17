---
title: "Kubernetes安全事件深度取证分析"
date: 2026-07-16T14:30:00+08:00
draft: false
weight: 870
description: "深入剖析Kubernetes环境安全事件取证全链路方法论，涵盖etcd数据库取证与敏感信息提取、RBAC权限滥用与提权攻击取证、Pod逃逸与容器运行时取证、Kubernetes审计日志深度关联分析、Service Account Token滥用与横向移动、Ingress配置错误与网络策略绕过取证、容器镜像供应链攻击与签名验证，结合真实Kubernetes安全事件案例还原完整取证流程并提供Sigma/Bash/Python自动化检测脚本"
categories: ["应急响应", "取证分析"]
tags: ["Kubernetes安全", "K8s取证", "etcd", "RBAC", "Pod逃逸", "容器安全", "Service Account", "K8s审计日志", "镜像安全", "MITRE ATT&CK"]
---

Kubernetes已成为现代云原生基础设施的事实标准编排平台。据 CNCF 2025 年度调查报告，全球超过 96% 的企业已采用或评估 Kubernetes 作为核心容器编排方案，管理着数以百万计的生产工作负载。然而，Kubernetes 集群的分布式架构、多层抽象和复杂的权限模型也为攻击者创造了广阔的攻击面。2024 年 Sysdig《云原生安全威胁报告》指出，超过 75% 的容器环境存在至少一个严重配置错误，而 Aqua Security 的研究团队在 2025 年记录到针对 Kubernetes 集群的攻击事件同比增长 180%——从加密货币挖矿到供应链投毒，从 Service Account Token 滥用到 etcd 未授权访问，攻击者在 Kubernetes 环境中的技术手段日趋成熟和隐蔽。

传统取证方法论在 Kubernetes 环境中面临系统性挑战：容器的短暂生命周期与持久化取证需求存在根本矛盾，etcd 分布式存储的高一致性模型增加了数据恢复的复杂性，RBAC 权限体系的多层嵌套使得攻击路径分析异常困难，而 Kubernetes API Server 的审计日志量在大规模集群中可达每天数十亿条。本文从蓝队取证实战视角出发，系统性地覆盖 Kubernetes 安全事件的全链路取证分析——从 etcd 数据库取证到 RBAC 提权检测，从 Pod 逃逸分析到审计日志关联，从 Service Account Token 滥用到 Ingress 配置审计，从镜像供应链攻击到自动化狩猎，结合 Tesla K8s 挖矿事件、Aqua Security 发现的 TeamTNT 云原生攻击等真实案例还原完整取证流程。

---

## 0x01 技术基础与Kubernetes安全取证概述

### Kubernetes 架构与安全边界

Kubernetes 集群在架构上分为 Control Plane（控制平面）和 Data Plane（数据平面）两个核心区域，每个区域包含独立的安全边界和取证数据源。

| 架构层 | 核心组件 | 安全职责 | 取证数据源 | 攻击面 |
|--------|---------|---------|-----------|--------|
| Control Plane | API Server, etcd, Scheduler, Controller Manager | 集群状态管理与决策 | 审计日志、etcd 数据、组件日志 | API 未授权访问、etcd 泄露、证书伪造 |
| Data Plane | kubelet, kube-proxy, Container Runtime | 工作负载执行与网络 | 容器日志、节点日志、cgroup 数据 | kubelet API 滥用、容器逃逸、网络策略绕过 |
| 网络层 | CNI 插件, Service, Ingress | 流量路由与隔离 | 网络流日志、iptables 规则、NetworkPolicy | CNI 漏洞利用、Service 暴露、Ingress 未授权 |
| 存储层 | PV, PVC, CSI Driver, Secret | 持久化存储与密钥管理 | 卷快照、Secret 数据、etcd 存储 | Secret 明文泄露、卷挂载逃逸、CSI 驱动漏洞 |
| 身份层 | RBAC, Service Account, OIDC | 认证与授权 | 审计日志中的身份信息、Token 分发记录 | Token 泄露、RBAC 提权、身份伪造 |

### K8s 安全事件与传统容器安全事件的差异

Kubernetes 环境的安全事件在多个维度上与传统容器或主机安全事件存在本质差异：

| 对比维度 | 传统主机安全事件 | 传统容器安全事件 | Kubernetes 集群安全事件 |
|---------|----------------|-----------------|----------------------|
| 攻击面 | 单一主机操作系统 | 容器运行时 + 宿主内核 | API Server + etcd + kubelet + 运行时 + 网络 + 存储 |
| 权限模型 | DAC + MAC (SELinux) | Linux Capabilities + Seccomp + AppArmor | RBAC + Admission Control + Pod Security Standards |
| 证据来源 | 磁盘、内存、日志、网络 | 容器层、cgroup、namespace、网络 | etcd + 审计日志 + 容器日志 + 节点日志 + 网络流 + 镜像 |
| 时间线重建 | 单机时间线 | 容器生命周期 + 宿主时间线 | 跨节点分布式时间线 + 事件排序 |
| 逃逸路径 | 内核漏洞/权限提升 | 容器逃逸到宿主 | Pod Escape → Node → Cluster → Cloud |
| 横向移动 | 远程服务利用 | 容器网络 + 镜像复用 | Service Account Token + RBAC + DNS + Service |
| 持久化机制 | 计划任务、服务、注册表 | 容器自启、镜像修改 | CronJob、DaemonSet、Deployment 修改、Backdoor Pod |
| 取证工具 | Volatility, Autopsy, Volatility | ctr, crictl, strace | kubectl, etcdctl, kube-audit, kube-hunter |

### K8s 安全取证数据源全景

| 数据源 | 数据格式 | 存储位置 | 取证价值 | 保留策略 |
|--------|---------|---------|---------|---------|
| etcd 数据库 | Key-Value (BoltDB) | /var/lib/etcd/ | 所有集群状态数据，包括 Secret、RBAC、Pod 定义 | 需要定期快照备份 |
| Kubernetes 审计日志 | JSON | /var/log/k8s-audit/ 或 stdout | API Server 所有请求的完整记录 | 按审计策略配置 |
| 容器日志 | stdout/stderr | /var/log/pods/ | 应用层行为和错误信息 | 按日志驱动配置 |
| kubelet 日志 | 系统日志 | journalctl -u kubelet | 节点级容器生命周期事件 | 系统日志保留策略 |
| API Server 日志 | 系统日志 | journalctl -u kube-apiserver | API Server 内部运行状态 | 系统日志保留策略 |
| etcd 日志 | 系统日志 | journalctl -u etcd | etcd 数据库操作和集群成员变更 | 系统日志保留策略 |
| 网络流 | NetFlow/sFlow/eBPF | CNI 插件导出 | 容器间通信、外部连接记录 | 按流量采集器配置 |
| 镜像元数据 | JSON | 容器运行时存储 | 镜像来源、构建历史、漏洞扫描结果 | 随镜像生命周期 |

### K8s 安全取证工具链

| 工具 | 类别 | 功能描述 | 适用场景 |
|------|------|---------|---------|
| kubectl | 集群管理 | Kubernetes 集群交互命令行 | Pod 日志、事件查询、资源审计 |
| etcdctl | 数据存储 | etcd 数据库直接操作工具 | etcd 数据导出、Key 查询、快照管理 |
| kube-hunter | 安全评估 | Kubernetes 渗透测试工具 | 攻击面发现、未授权端点检测 |
| kubeaudit | 配置审计 | Kubernetes 安全配置审计 | RBAC、Pod Security、网络策略审计 |
| kubeletctl | 节点安全 | kubelet API 交互工具 | kubelet 未授权访问检测 |
| Falco | 运行时检测 | 基于 eBPF/内核的运行时安全 | 系统调用异常检测、容器行为监控 |
| kube-audit-rules | 审计检测 | Kubernetes 审计日志 Sigma 规则 | API 滥用行为检测 |
| kube-bench | 合规检测 | CIS Kubernetes Benchmark 扫描 | 基线合规检查 |
| kubelet-analyzer | 日志分析 | kubelet 日志深度解析 | 节点事件关联分析 |
| trivy | 镜像扫描 | 容器镜像漏洞和恶意文件扫描 | 镜像安全评估和恶意代码检测 |

---

## 0x02 etcd 数据库取证与敏感信息提取

### etcd 数据存储架构与敏感信息分布

etcd 是 Kubernetes 集群的"大脑"，存储了整个集群的状态数据，包括所有 Resource 对象（Pod、Service、Secret、ConfigMap、RBAC 策略等）。从取证角度看，etcd 是整个集群最关键的单一数据源——一旦获取 etcd 的读取权限，攻击者可以获取集群中的所有信息，包括以 Base64 明文存储的 Secret 数据。

| etcd 存储路径 | 存储内容 | 敏感级别 | 取证价值 |
|-------------|---------|---------|---------|
| /registry/secrets/ | 所有 Namespace 的 Secret 对象 | 🔴 极高 | 数据库密码、API Key、TLS 证书、Token |
| /registry/serviceaccounts/ | Service Account 定义 | 🟡 高 | SA Token 配置、自动挂载策略 |
| /registry/clusterrolebindings/ | ClusterRoleBinding 定义 | 🔴 极高 | 权限提升路径、cluster-admin 绑定 |
| /registry/roles/ | Role 和 ClusterRole 定义 | 🟡 高 | 权限粒度、过度授权检测 |
| /registry/pods/ | 所有 Pod 定义 | 🟡 高 | 恶意 Pod、挂载配置、容器镜像 |
| /registry/namespaces/ | Namespace 定义 | 🟢 中 | 多租户隔离、命名空间创建时间 |
| /registry/configmaps/ | ConfigMap 对象 | 🟡 高 | 配置文件中的敏感信息 |
| /registry/daemonsets/ | DaemonSet 定义 | 🔴 极高 | 节点级持久化恶意工作负载 |
| /registry/cronjobs/ | CronJob 定义 | 🟡 高 | 定时任务持久化后门 |
| /registry/ingresses/ | Ingress 配置 | 🟡 高 | 外部暴露面、路由规则 |

### etcd 数据导出与解密取证方法

etcd 数据的取证导出需要根据集群的加密配置采用不同的方法。大多数生产集群会对 etcd 静态数据启用 EncryptionConfiguration 加密，取证人员需要获取加密密钥才能解密 Secret 数据。

```bash
ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  snapshot save /evidence/etcd-snapshot-$(date +%Y%m%d%H%M%S).db
```

```bash
ETCDCTL_API=3 etcdctl snapshot status /evidence/etcd-snapshot.db --write-out=table
```

```bash
ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  get /registry/secrets --prefix --keys-only
```

对于加密的 Secret 数据，取证人员需要从 API Server 的 EncryptionConfiguration 中提取加密密钥：

```bash
cat /etc/kubernetes/encryption-config.yaml | grep -A5 'aescbc:\|aesgcm:\|secretbox:'
kubectl get secrets -A -o json | jq -r '.items[] | select(.metadata.namespace != "kube-system") | "\(.metadata.namespace)/\(.metadata.name)"' | while read secret; do
  ns=$(echo $secret | cut -d/ -f1)
  name=$(echo $secret | cut -d/ -f2)
  kubectl get secret -n $ns $name -o jsonpath='{.data}' | base64 -d 2>/dev/null | head -c 200
  echo ""
done
```

### etcd 快照备份分析与数据恢复

etcd 的快照机制是取证分析的重要入口。通过分析历史快照，取证人员可以重建集群在特定时间点的状态，发现已经被删除的恶意资源对象。

| 快照类型 | 创建方式 | 数据范围 | 取证用途 |
|---------|---------|---------|---------|
| etcd snapshot | etcdctl snapshot save | etcd 全量数据 | 集群状态时间点恢复 |
| etcd defrag | etcdctl defrag | 压缩后的数据 | 历史数据残留分析 |
| 备份快照 | velero backup / etcd-cr | PV + 资源定义 | 跨集群取证、灾备恢复 |
| 审计日志快照 | 日志轮转归档 | API 请求记录 | 历史 API 操作回溯 |

### etcd 访问控制审计与未授权访问检测

etcd 未授权访问是 Kubernetes 环境中最严重的安全问题之一。攻击者如果能够直接访问 etcd 的 2379 端口，即可获取集群中所有数据。检测 etcd 暴露面和未授权访问是取证分析的关键步骤。

```bash
curl -s https://<etcd-ip>:2379/v2/keys/ --insecure 2>/dev/null | head -c 500
curl -s https://<etcd-ip>:2379/v3/kv/range -X POST -d '{"key":"L3JlZ2lzdHJ5Lw=="}' --insecure 2>/dev/null | head -c 500
ss -tlnp | grep 2379
netstat -tlnp | grep 2379
```

| 检测项 | 检测方法 | 预期结果 | 风险等级 |
|--------|---------|---------|---------|
| etcd 端口暴露 | ss -tlnp \| grep 2379 | 仅监听 127.0.0.1 或内网地址 | 🔴 端口对外暴露为严重漏洞 |
| etcd 客户端证书 | 检查 --client-cert-auth 配置 | 必须启用 | 🟡 未启用为高风险 |
| etcd 对等 TLS | 检查 --peer-client-cert-auth | 必须启用 | 🟡 未启用为高风险 |
| etcd 访问控制列表 | 检查 --authentication-token-webhook | 应配置外部认证 | 🟡 默认无访问控制 |

---

## 0x03 RBAC 权限滥用与提权攻击取证

### Kubernetes RBAC 模型

Kubernetes RBAC（Role-Based Access Control）是集群权限管理的核心机制，通过 Role、ClusterRole、RoleBinding 和 ClusterRoleBinding 四种资源对象实现细粒度的访问控制。从取证角度看，RBAC 配置是攻击者提权路径分析的关键——通过审查 RBAC 策略，可以还原攻击者从低权限到高权限的完整提权链。

| RBAC 资源 | 作用范围 | 功能 | 取证关注点 |
|----------|---------|------|-----------|
| Role | 命名空间 | 定义命名空间内的权限规则 | 过度宽松的命名空间权限 |
| ClusterRole | 集群 | 定义集群范围的权限规则 | cluster-admin 等高危 ClusterRole 绑定 |
| RoleBinding | 命名空间 | 将 Role 绑定到用户/组/SA | 异常身份的 Role 绑定 |
| ClusterRoleBinding | 集群 | 将 ClusterRole 绑定到用户/组/SA | 非预期用户的集群级权限绑定 |

### 过度授权检测与最小权限审计

检测 RBAC 过度授权是 Kubernetes 安全审计的核心任务。取证人员需要识别所有获得 cluster-admin 或等效权限的主体，以及拥有危险权限组合（如 create pods + hostNetwork）的低权限角色。

```bash
kubectl auth can-i --list --as=system:serviceaccount:default:default
kubectl auth can-i create pods --as=system:serviceaccount:default:default -n kube-system
kubectl auth can-i '*' '*' --as=system:serviceaccount:default:default
kubectl get clusterrolebindings -o json | jq -r '.items[] | select(.subjects != null) | select(.roleRef.name == "cluster-admin") | {binding: .metadata.name, subjects: [.subjects[] | {kind: .kind, name: .name, namespace: .namespace}]}'
```

```bash
kubectl get clusterrolebindings -o json | jq -r '.items[] | select(.roleRef.name == "cluster-admin") | "\(.metadata.name): \([.subjects[]? | "\(.kind)/\(.name)@\(.namespace // "cluster")"] | join(", "))"'
kubectl get rolebindings -A -o json | jq -r '.items[] | select(.roleRef.name == "cluster-admin" or .roleRef.name == "admin" or .roleRef.name == "edit") | "\(.metadata.namespace)/\(.metadata.name): role=\(.roleRef.name) subjects=[\([.subjects[]? | "\(.kind)/\(.name)"] | join(", "))]"'
```

| 高危权限组合 | MITRE ATT&CK | 攻击利用方式 | 检测命令 |
|-------------|-------------|-------------|---------|
| create pods + hostNetwork | T1611 Escape to Host | 创建带 hostNetwork 的 Pod 访问宿主网络 | kubectl auth can-i create pods --subresource=spec |
| get secrets + list pods | T1552 Unsecured Credentials | 读取 Secret 获取凭据后横向移动 | kubectl auth can-i get secrets |
| create daemonsets | T1053 Scheduled Task/Job | 在所有节点部署恶意 DaemonSet | kubectl auth can-i create daemonsets |
| patch pods | T1055 Process Injection | 修改运行中 Pod 的 spec 实现提权 | kubectl auth can-i patch pods |
| create clusterrolebindings | T1098 Account Manipulation | 创建新的 cluster-admin 绑定 | kubectl auth can-i create clusterrolebindings |
| delete pods | T1485 Data Destruction | 删除关键系统 Pod 导致服务中断 | kubectl auth can-i delete pods -n kube-system |

### RBAC 提权攻击路径分析

攻击者在 Kubernetes 环境中的提权通常遵循从 Service Account 到 RoleBinding 到 ClusterRoleBinding 的渐进路径。取证分析人员需要还原完整的提权链，识别每一个权限升级的跳板。

| 提权阶段 | 攻击技术 | MITRE ATT&CK | 取证线索 |
|---------|---------|-------------|---------|
| SA Token 获取 | 自动挂载 Token 或挂载宿主 Token | T1528 Steal Application Access Token | Pod spec 中 automountServiceAccountToken |
| 命名空间提权 | 利用宽松的 Role 绑定获取命名空间 admin | T1078 Valid Accounts | RoleBinding 审计日志 |
| 跨命名空间访问 | 利用 SA Token 访问其他命名空间的 API | T1021 Remote Services | 多命名空间的 403→200 状态码变化 |
| 集群级提权 | 利用 cluster-admin 绑定或 aggregation roles | T1548 Abuse Elevation Mechanism | ClusterRoleBinding 变更审计 |
| 节点级逃逸 | kubelet API 滥用或容器逃逸 | T1611 Escape to Host | kubelet 日志异常 |

### RBAC 配置变更审计与异常检测

RBAC 资源的变更记录是取证分析的核心数据源。通过 API Server 审计日志，可以追踪每一次 Role、ClusterRole、RoleBinding 和 ClusterRoleBinding 的创建、修改和删除操作。

```bash
kubectl get events --field-selector reason=RoleBinding --all-namespaces --sort-by='.lastTimestamp' | tail -20
kubectl get events --field-selector reason=ClusterRoleBinding --all-namespaces --sort-by='.lastTimestamp' | tail -20
```

---

## 0x04 Pod 逃逸与容器运行时取证

### Pod 逃逸技术分类

Pod 逃逸（Container Escape / Pod Escape）是 Kubernetes 环境中最严重的攻击类型之一，攻击者从容器内突破隔离边界，获得宿主机或整个集群的控制权。根据逃逸向量的不同，Pod 逃逸技术可分为多个类别：

| 逃逸类型 | 攻击技术 | MITRE ATT&CK | 典型漏洞/配置 | 检测难度 |
|---------|---------|-------------|-------------|---------|
| 特权容器逃逸 | 利用特权容器的 hostPID/hostNetwork/hostIPC | T1611 Escape to Host | privileged: true, hostPID: true | 🟡 中 |
| hostPath 挂载逃逸 | 通过挂载宿主路径读写敏感文件 | T1611 Escape to Host | hostPath: /etc/shadow | 🟡 中 |
| 内核漏洞逃逸 | 利用内核漏洞突破 namespace 隔离 | T1068 Exploitation for Privilege Escalation | CVE-2022-0185, CVE-2022-0492 | 🔴 高 |
| 容器运行时漏洞 | 利用 containerd/CRI-O/runc 漏洞 | T1611 Escape to Host | CVE-2024-21626 (runc), CVE-2019-5736 | 🔴 高 |
| Service Account 滥用 | 利用 SA Token 访问 kubelet API | T1610 Deploy Container | kubelet API 暴露 | 🟡 中 |
| 挂载宿主目录 | Docker Socket 挂载逃逸 | T1611 Escape to Host | /var/run/docker.sock | 🟡 中 |
| PID Namespace 逃逸 | 利用 hostPID 共享 PID 命名空间 | T1055 Process Injection | hostPID: true + nsenter | 🟡 中 |
| Cgroup 逃逸 | 利用 cgroup v1 release_agent 机制 | T1611 Escape to Host | CAP_SYS_ADMIN + 写 release_agent | 🔴 高 |

### 容器逃逸检测方法

容器逃逸的检测需要在多个层次部署监控：系统调用层面（seccomp + eBPF）、Capability 层面（容器安全策略）、文件系统层面（挂载审计）、网络层面（异常连接检测）。

```bash
kubectl get pods -A -o json | jq -r '.items[] | select(.spec.containers[]?.securityContext.privileged == true or .spec.containers[]?.securityContext.capabilities.add[]? == "SYS_ADMIN" or .spec.hostPID == true or .spec.hostNetwork == true or .spec.hostIPC == true) | "\(.metadata.namespace)/\(.metadata.name): privileged=\(.spec.containers[0].securityContext.privileged // false) hostPID=\(.spec.hostPID // false) hostNetwork=\(.spec.hostNetwork // false) hostIPC=\(.spec.hostIPC // false)"'
```

```bash
kubectl get pods -A -o json | jq -r '.items[] | .spec.volumes[]? | select(.hostPath != null) | "\(.name): \(.hostPath.path) (type: \(.hostPath.type // "default"))"'
```

| 检测层级 | 监控技术 | 异常特征 | 检测工具 |
|---------|---------|---------|---------|
| 系统调用 | seccomp profile + eBPF | 非预期的 mount/chmod/mknod 系统调用 | Falco, Tetragon |
| Capability | Pod Security Standards | privileged=true, SYS_ADMIN, SYS_PTRACE | kube-audit, Kyverno |
| 文件系统 | inotify + eBPF | 宿主路径文件被修改（/etc/shadow, /etc/passwd） | Falco rules |
| 网络 | NetworkPolicy + eBPF | 容器到宿主的异常连接 | Cilium, Calico |
| 进程 | /proc 监控 | 容器内出现非预期的宿主进程引用 | ps aux + /proc 检查 |
| 资源 | cgroup 监控 | cgroup 配置变更、release_agent 写入 | auditd, Tetragon |

### 容器运行时日志取证

containerd 和 CRI-O 的运行时日志包含了容器生命周期的完整记录，是 Pod 逃逸和异常行为取证的关键数据源。

```bash
journalctl -u containerd --since "2026-07-15 00:00:00" --until "2026-07-16 00:00:00" | grep -i "creat\|start\|stop\|exec\|died\|oom\|kill"
ls -la /var/log/pods/
kubectl logs <pod-name> -n <namespace> --previous --tail=1000
```

### 容器镜像层分析与恶意软件检测

容器镜像的层（Layer）分析是取证的重要环节，恶意代码可能隐藏在镜像的任意层中，且通过多阶段构建（multi-stage build）技术规避静态扫描。

```bash
crane manifest <image>:<tag>
crane export <image>:<tag> /evidence/image-export.tar
tar tf /evidence/image-export.tar | head -50
trivy image --severity HIGH,CRITICAL <image>:<tag>
trivy image --scanners vuln,misconfig,secret <image>:<tag>
```

---

## 0x05 Kubernetes 审计日志深度分析

### K8s 审计策略配置与日志格式

Kubernetes API Server 的审计日志（Audit Log）记录了所有经过 API Server 的请求，是集群取证分析最全面的数据源。审计日志的记录范围和详细程度由 Audit Policy 配置决定，不同级别的审计事件提供不同粒度的信息。

| 审计级别 | 记录内容 | 日志量 | 适用场景 |
|---------|---------|--------|---------|
| None | 不记录 | 无 | 高频只读操作（如 list pods） |
| Metadata | 请求元数据（User、Timestamp、Resource、Verb） | 中 | 大多数审计场景的默认级别 |
| Request | Metadata + Request Body | 高 | 需要审查请求内容的场景 |
| RequestResponse | Metadata + Request Body + Response Body | 极高 | 完整取证和深度分析 |

```yaml
apiVersion: audit.k8s.io/v1
kind: Policy
rules:
  - level: None
    resources:
      - group: ""
        resources: ["endpoints", "services/status"]
    users: ["system:kube-proxy"]
  - level: None
    resources:
      - group: ""
        resources: ["nodes", "nodes/status"]
    verbs: ["get"]
    users: ["system:node-problem-detector"]
  - level: Metadata
    resources:
      - group: ""
        resources: ["secrets", "configmaps"]
  - level: RequestResponse
    resources:
      - group: "rbac.authorization.k8s.io"
    omitStages:
      - "RequestReceived"
  - level: Metadata
    omitStages:
      - "RequestReceived"
```

### 审计日志中的攻击行为特征提取

每条 Kubernetes 审计日志记录包含完整的请求上下文信息，取证人员可以从中提取攻击者的行为特征。

| 审计日志字段 | 取证用途 | 攻击检测关联 |
|------------|---------|-------------|
| user.username | 攻击者身份识别 | Service Account、匿名用户、OIDC 身份 |
| verb | 操作类型识别 | create/delete/exec 等高危操作 |
| objectRef.resource | 目标资源类型 | Secret、RBAC、Pod 等敏感资源 |
| objectRef.namespace | 目标命名空间 | 跨命名空间访问、系统命名空间操作 |
| responseStatus.code | 请求结果 | 403 权限拒绝、200 成功、404 资源不存在 |
| requestReceivedTimestamp | 请求时间 | 时间线重建、攻击窗口定位 |
| userAgent | 客户端信息 | 非标准 User-Agent 检测 |
| sourceIPs | 来源 IP | 异常来源、外部 IP 访问 |
| annotations | 请求注解 | Impersonate-User 等代理信息 |

### 审计日志关联分析与攻击链重建

通过多维度的审计日志关联分析，可以还原攻击者在集群中的完整活动时间线：

```bash
cat /var/log/k8s-audit/audit.log | jq 'select(.verb == "create" or .verb == "patch" or .verb == "update" or .verb == "delete") | select(.objectRef.resource == "clusterrolebindings" or .objectRef.resource == "rolebindings" or .objectRef.resource == "secrets" or .objectRef.resource == "pods") | {timestamp: .requestReceivedTimestamp, user: .user.username, verb: .verb, resource: .objectRef.resource, namespace: .objectRef.namespace, name: .objectRef.name, code: .responseStatus.code, sourceIP: .sourceIPs[0]}'
```

```bash
cat /var/log/k8s-audit/audit.log | jq 'select(.user.username == "system:anonymous" or (.user.username | startswith("system:serviceaccount:")) and .verb == "list" and .objectRef.resource == "secrets") | {timestamp: .requestReceivedTimestamp, user: .user.username, verb: .verb, resource: .objectRef.resource, namespace: .objectRef.namespace, code: .responseStatus.code}'
```

### 高级审计查询与异常检测

| 检测场景 | 审计日志查询逻辑 | 异常指标 | MITRE ATT&CK |
|---------|----------------|---------|-------------|
| 匿名用户访问 | user.username == "system:anonymous" | 非预期的匿名请求 | T1190 Exploit Public-Facing App |
| 大量 Secret 读取 | objectRef.resource == "secrets" && verb == "get" | 短时间内读取多个 Secret | T1552 Unsecured Credentials |
| RBAC 变更 | objectRef.resource contains "rolebinding" | 非管理员用户的 RBAC 修改 | T1098 Account Manipulation |
| exec 进入 Pod | verb == "create" && objectRef.resource == "pods/exec" | 非预期的 exec 操作 | T1059 Command and Scripting Interpreter |
| 异常来源 IP | sourceIPs 不在集群内网范围 | 外部 IP 的 API 访问 | T1133 External Remote Services |
| API 请求激增 | 单用户/SA 的请求频率异常 | 可能为自动化攻击 | T1499 Endpoint Denial of Service |

---

## 0x06 Service Account Token 滥用取证

### Service Account 工作机制与 Token 类型

Kubernetes Service Account（SA）是集群内工作负载访问 API Server 的身份凭证。SA Token 是 Kubernetes 安全中最容易被攻击者利用的凭据类型之一——每个 Pod 创建时默认自动挂载 SA Token，使得容器内进程天然具备访问集群 API 的能力。

| Token 类型 | 机制 | 生命周期 | 可检测性 | 安全风险 |
|-----------|------|---------|---------|---------|
| Legacy SA Token | Secret 自动创建并挂载为文件 | 永不过期 | 🟡 中 | 🔴 极高——泄露后永久有效 |
| Bound SA Token (TokenRequest) | 动态生成，绑定到 Pod | 1 小时默认过期 | 🟢 高 | 🟡 中——有过期机制 |
| Volume-mounted Token | 通过 projected volume 挂载 | 跟随 Pod 生命周期 | 🟡 中 | 🟡 中——随 Pod 销毁 |
| Bootstrap Token | 用于节点加入集群 | 24 小时默认过期 | 🟢 高 | 🟢 低——短暂且受限 |
| OIDC Token | 外部身份提供者签发 | 按 IdP 策略过期 | 🟢 高 | 🟢 低——受 IdP 管控 |

### Token 泄露检测与权限范围评估

Service Account Token 泄露是 Kubernetes 环境中最常见的安全事件之一。取证人员需要检测 Token 泄露的路径、评估泄露 Token 的权限范围，并追踪泄露后的使用情况。

```bash
TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
kubectl auth can-i --list --token=$TOKEN
kubectl auth can-i --list --token=$TOKEN -n default
kubectl auth can-i get secrets --token=$TOKEN -A
kubectl auth can-i create pods --token=$TOKEN -n kube-system
```

```bash
kubectl get pods -A -o json | jq -r '.items[] | select(.spec.automountServiceAccountToken != false) | select(.metadata.namespace != "kube-system") | "\(.metadata.namespace)/\(.metadata.name): sa=\(.spec.serviceAccountName // "default") automount=\(.spec.automountServiceAccountToken // true)"'
```

### Token 滥用横向移动到其他命名空间

攻击者获取 SA Token 后，最常见的横向移动路径是利用 Token 的跨命名空间权限访问其他命名空间的资源。取证分析需要追踪 Token 的跨命名空间 API 调用记录。

| 横向移动路径 | 攻击技术 | MITRE ATT&CK | 取证线索 |
|-------------|---------|-------------|---------|
| SA → list secrets → 命名空间 admin | 利用 list secrets 获取密码 | T1552 Unsecured Credentials | 审计日志中跨命名空间的 list secrets 请求 |
| SA → create pods → 宿主挂载 | 在目标命名空间创建特权 Pod | T1610 Deploy Container | 异常命名空间的 Pod 创建事件 |
| SA → exec → 容器交互 | exec 进入其他容器获取凭据 | T1059 Command and Scripting Interpreter | 跨命名空间的 pods/exec 请求 |
| SA → patch deployments | 修改 Deployment 注入恶意容器 | T1055 Process Injection | Deployment spec 变更审计 |
| SA → create daemonset | 在所有节点部署恶意负载 | T1053 Scheduled Task/Job | 非系统命名空间的 DaemonSet 创建 |

### 自动挂载 SA Token 的配置审计

默认情况下，Kubernetes 会为每个 Pod 自动挂载 Service Account Token，这是许多安全事件的根本原因。审计自动挂载配置是 Kubernetes 安全加固的关键步骤。

```bash
kubectl get pods -A -o json | jq -r '.items[] | select(.spec.automountServiceAccountToken != false) | "\(.metadata.namespace)/\(.metadata.name) sa=\(.spec.serviceAccountName // "default")"'
kubectl get serviceaccounts -A -o json | jq -r '.items[] | select(.automountServiceAccountToken != false) | "\(.metadata.namespace)/\(.metadata.name) automount=\(.automountServiceAccountToken // true)"'
```

---

## 0x07 Kubernetes 网络策略与 Ingress 攻击取证

### NetworkPolicy 配置审计与绕过检测

Kubernetes NetworkPolicy 是集群内网络隔离的核心机制，用于控制 Pod 之间以及 Pod 与外部网络的通信。NetworkPolicy 配置不当或缺失是容器间横向移动的关键条件。

```bash
kubectl get networkpolicies -A -o json | jq -r '.items[] | "\(.metadata.namespace)/\(.metadata.name): ingress=\(.spec.ingress != null) egress=\(.spec.egress != null) podSelector=\(.spec.podSelector)"'
kubectl get pods -A -o json | jq -r '.items[] | "\(.metadata.namespace)/\(.metadata.name)"' | while read pod; do
  ns=$(echo $pod | cut -d/ -f1)
  name=$(echo $pod | cut -d/ -f2)
  np=$(kubectl get networkpolicies -n $ns -o json | jq -r --arg ns "$ns" --arg name "$name" '.items[] | select(.spec.podSelector.matchLabels as $ml | $ml | to_entries | all(. as $k | .key as $k | $k as $k | .value as $v | true)) | .metadata.name')
  if [ -z "$np" ]; then
    echo "NO POLICY: $pod"
  fi
done
```

| 网络策略检查项 | 检测方法 | 预期安全配置 | 风险等级 |
|-------------|---------|------------|---------|
| 命名空间默认策略 | 检查是否有拒绝所有入站的默认策略 | deny-all-ingress 默认策略 | 🟡 缺少默认策略为高风险 |
| Pod 级网络策略 | 检查每个 Pod 是否被 NetworkPolicy 覆盖 | 所有业务 Pod 应有对应的 NetworkPolicy | 🟡 未覆盖 Pod 存在横向移动风险 |
| egress 策略 | 检查出站流量是否受限 | 应配置 egress 策略限制出站连接 | 🟡 缺少 egress 策略为高风险 |
| 系统命名空间隔离 | 检查 kube-system 等系统 NS 是否隔离 | 系统 NS 应有严格的网络策略 | 🟡 系统 NS 未隔离为高风险 |
| DNS 流量控制 | 检查到 kube-dns 的流量是否受限 | 应允许到 kube-dns 的必要 DNS 流量 | 🟢 配置不当影响 DNS 解析 |

### Ingress 控制器漏洞利用与配置错误

Ingress 控制器是 Kubernetes 集群与外部网络的桥梁，其配置错误和已知漏洞可能直接暴露集群内部服务。

| 漏洞类型 | 攻击技术 | MITRE ATT&CK | 影响范围 |
|---------|---------|-------------|---------|
| Path Traversal | 通过 /../ 绕过路径限制 | T1083 File and Directory Discovery | 访问后端服务任意路径 |
| Host Header 注入 | 篡改 Host 头实现路由劫持 | T1557 Adversary-in-the-Middle | 流量劫持、凭证窃取 |
| SSRF 通过 Ingress | 利用 backend 指向内部服务 | T917 Server-Side Request Forgery | 访问集群内部 API、云元数据 |
| TLS 配置错误 | 弱密码协议、证书验证缺失 | T1557 Adversary-in-the-Middle | 中间人攻击 |
| 默认后端暴露 | 未配置路由规则时的默认行为 | T1190 Exploit Public-Facing App | 访问非预期后端服务 |
| NGINX Ingress CVE | 已知漏洞利用（如 CVE-2021-25742） | T1190 Exploit Public-Facing App | 跨命名空间资源访问 |

### Kubernetes Service 暴露面审计

Kubernetes Service 的暴露方式决定了集群内部服务的外部可达性。不同的 Service 类型具有不同的攻击面：

| Service 类型 | 暴露方式 | 攻击面 | 取证关注点 |
|-------------|---------|--------|-----------|
| ClusterIP | 仅集群内可达 | 集群内横向移动 | Pod 间非预期的 ClusterIP 访问 |
| NodePort | 通过节点端口暴露 | 未授权的外部访问 | 30000-32767 端口的异常连接 |
| LoadBalancer | 通过云负载均衡器暴露 | 外部直接访问 | 负载均衡器的访问日志和安全组配置 |
| ExternalName | DNS CNAME 别名 | 外部服务引用 | 指向恶意域名的 ExternalName |
| Headless | 无 ClusterIP，直接返回 Pod IP | 绕过 Service 负载均衡 | StatefulSet 的直接 Pod 访问 |

### 容器间网络流量分析与异常检测

容器间的异常网络流量是横向移动和数据泄露的关键指标。取证分析需要关注非预期的跨命名空间通信、异常的外部连接以及 DNS 隧道等隐蔽通道。

```bash
kubectl get pods -A -o wide -o json | jq -r '.items[] | "\(.metadata.namespace)/\(.metadata.name) node=\(.spec.nodeName) ip=\(.status.podIP)"'
kubectl exec -n <namespace> <pod> -- ss -tlnp
kubectl exec -n <namespace> <pod> -- cat /etc/resolv.conf
```

---

## 0x08 镜像供应链攻击与镜像签名验证取证

### 容器镜像供应链攻击模型

容器镜像供应链攻击是 Kubernetes 环境中最隐蔽、影响范围最广的攻击类型之一。攻击者可以在镜像构建、推送、拉取和运行的任何一个环节植入恶意代码。

| 攻击阶段 | 攻击技术 | MITRE ATT&CK | 取证特征 |
|---------|---------|-------------|---------|
| 构建阶段 | 在 Dockerfile 中植入恶意代码 | T1059 Command and Scripting Interpreter | 镜像层中的异常命令 |
| 构建阶段 | 修改 base image 为恶意版本 | T1195 Supply Chain Compromise | 非预期的 base image 来源 |
| 推送阶段 | 覆盖或替换 registry 中的镜像 | T1195 Supply Chain Compromise | 镜像 digest 不匹配 |
| 拉取阶段 | 中间人攻击替换拉取的镜像 | T1557 Adversary-in-the-Middle | 镜像签名验证失败 |
| 运行阶段 | 利用恶意镜像创建工作负载 | T1610 Deploy Container | 异常镜像来源和内容 |
| 依赖阶段 | 基础镜像中的已知漏洞 | T1195 Supply Chain Compromise | 镜像层中包含 CVE 漏洞 |

### 镜像漏洞扫描与恶意代码检测

镜像安全扫描是供应链安全的关键环节，需要同时关注已知漏洞（CVE）和未知恶意代码（Malware/Backdoor）两个维度。

```bash
trivy image --scanners vuln,misconfig,secret,license --severity HIGH,CRITICAL <image>:<tag>
trivy fs --scanners vuln,misconfig,secret --severity HIGH,CRITICAL /path/to/dockerfile
grype <image>:<tag> --fail-on high
docker scout cves <image>:<tag> --only-severity critical,high
```

```bash
crane digest <image>:<tag>
crane manifest <image>:<tag> | jq '.config'
crane config <image>:<tag> | jq '.config.Env'
crane config <image>:<tag> | jq '.config.Entrypoint'
crane config <image>:<tag> | jq '.config.Cmd'
```

| 扫描维度 | 检测目标 | 工具 | 检测方法 |
|---------|---------|------|---------|
| CVE 漏洞 | 已知软件包漏洞 | Trivy, Grype, Snyk | 与 NVD/OSV 漏洞库匹配 |
| 配置错误 | 安全配置基线违反 | Trivy, Dockle | 检查 Dockerfile 最佳实践 |
| Secret 泄露 | 硬编码的密码/密钥 | Trivy, Gitleaks, TruffleHog | 正则模式匹配 |
| 恶意软件 | 已知恶意软件签名 | ClamAV, YARA | 签名匹配和启发式检测 |
| 签名验证 | 镜像完整性和来源 | Cosign, Notary v2 | 密码学签名验证 |
| SBOM | 软件物料清单 | Syft, Trivy | 生成和分析 SBOM |
| License | 开源许可证合规 | Trivy, Syft | 许可证元数据分析 |

### 镜像签名验证（Cosign/Notary）与信任链审计

镜像签名是验证镜像完整性和来源的密码学手段。Sigstore Cosign 是当前 Kubernetes 生态中最主流的镜像签名工具。

```bash
cosign verify --key cosign.pub <registry>/<image>:<tag>
cosign verify --key cosign.pub --annotations "author=<expected>" <registry>/<image>:<tag>
cosign inspect <registry>/<image>:<tag>
cosign verify-attestation --key cosign.pub --type spdxjson <registry>/<image>:<tag>
cosign list-tags <registry>/<image>
```

| 签名机制 | 技术实现 | 信任模型 | 取证用途 |
|---------|---------|---------|---------|
| Cosign Key-based | 非对称密钥对签名/验证 | 用户管理密钥对 | 验证镜像是否被篡改 |
| Cosign Keyless (Fulcio) | OIDC 身份签发短期证书 | OIDC 身份绑定 | 追踪签名者身份 |
| Notary v2 | X.509 证书链签名 | PKI 信任链 | 企业级镜像签名验证 |
| Sigstore Rekor | 不可变透明日志 | 公开审计日志 | 签名记录的不可否认性 |
| Kyverno/OPA Gatekeeper | Admission Control 策略执行 | 策略引擎 | 强制执行签名验证 |

### 私有镜像仓库安全审计

私有镜像仓库（Harbor、ECR、GCR、ACR 等）的安全配置直接影响整个集群的镜像供应链安全。

```bash
curl -s -k https://<registry>/api/v2.0/projects | jq '.[] | {name: .name, public: .public, metadata: .metadata}'
curl -s -k -u admin:password https://<registry>/api/v2.0/projects/<project>/repositories | jq '.[] | {name: .name, pull_count: .pull_count}'
curl -s -k -u admin:password https://<registry>/api/v2.0/projects/<project>/webhook/policies | jq '.[] | {name: .name, enabled: .enabled, event_types: .event_types}'
```

---

## 0x09 证据强度分层与案例关联

Kubernetes 安全事件的取证分析需要对采集到的证据进行强度分层，以便为后续的事件响应决策和法律程序提供可靠依据。

### 🔴 确认恶意（Confirmed Malicious）

以下证据直接确认攻击行为的发生：

| 证据类型 | 具体内容 | 确认依据 |
|---------|---------|---------|
| 恶意 Pod 创建审计记录 | 审计日志中非授权用户创建的特权 Pod | Verb=create + Resource=pods + 源 IP 异常 |
| etcd 中提取的后门 Secret | 在 etcd 中发现的非预期后门凭证或配置 | Secret 内容分析 + 创建者身份验证 |
| 容器内恶意二进制文件 | 从容器层导出的挖矿程序、反弹 Shell | 文件哈希匹配已知恶意软件库 |
| 确认的 Pod 逃逸痕迹 | 宿主机上的容器逃逸文件操作记录 | 容器 namespace 外的文件操作审计 |
| 镜像篡改确认 | Cosign 签名验证失败 + 镜像内容变更 | 签名对比 + 镜像层 diff 分析 |
| SA Token 跨命名空间滥用记录 | 审计日志中 SA Token 的非授权跨 NS 操作 | Token 身份 + 操作审计 + RBAC 策略不匹配 |

### 🟡 高度可疑（Highly Suspicious）

以下证据表明攻击行为高度可能已发生，但需要进一步验证：

| 证据类型 | 具体内容 | 可疑程度 |
|---------|---------|---------|
| 匿名用户 API 访问 | system:anonymous 的非预期 API 调用 | 可能为扫描或未授权访问尝试 |
| 容器内异常进程 | 容器中运行的非预期系统工具（curl、nc、bash） | 可能为正常运维或攻击行为 |
| 镜像来源异常 | 从非标准 registry 拉取的镜像 | 可能为内部使用或供应链攻击 |
| RBAC 策略近期变更 | 高危 RBAC 资源的创建/修改事件 | 可能为合法运维或权限提升 |
| 异常网络连接 | 容器到外部 IP 的非标准端口连接 | 可能为正常 C2 通信或合法外部调用 |
| etcd 数据导出痕迹 | etcd snapshot 或数据导出操作记录 | 可能为备份操作或数据窃取 |

### 🟢 需要关注（Requires Attention）

以下证据需要持续关注和进一步调查：

| 证据类型 | 具体内容 | 关注原因 |
|---------|---------|---------|
| 过度宽松的 RBAC 配置 | 非必要主体绑定 cluster-admin | 可能为配置疏忽但存在提权风险 |
| 自动挂载 SA Token 的 Pod | 大量 Pod 自动挂载 SA Token | 默认配置但增加 Token 泄露攻击面 |
| 缺少 NetworkPolicy 的命名空间 | 命名空间内无网络隔离策略 | 默认行为但影响横向移动防护 |
| 镜像包含已知漏洞 | 镜像扫描发现中高危 CVE | 可能被利用但需要评估实际风险 |
| 容器以 root 用户运行 | 容器内进程以 UID 0 运行 | 增加容器逃逸的影响范围 |
| 节点 kubelet API 配置 | kubelet 的匿名认证未禁用 | 可能被利用进行节点级操作 |

---

## 0x0A 自动化检测与狩猎（Sigma/Bash/Python）

### Sigma 检测规则

```yaml
title: Kubernetes RBAC Privilege Escalation via ClusterRoleBinding Creation
id: k8s-rbac-privilege-escalation-clusterrolebinding
status: experimental
description: Detects creation of ClusterRoleBinding that grants cluster-admin or equivalent privileges, which may indicate privilege escalation
references:
  - https://kubernetes.io/docs/reference/access-authn-authz/rbac/
author: Security Operations
date: 2026-07-16
tags:
  - attack.privilege_escalation
  - attack.t1098
  - kubernetes
logsource:
  product: kubernetes
  service: audit
detection:
  selection:
    objectRef.resource: clusterrolebindings
    verb:
      - create
      - patch
      - update
    responseStatus.code: 200
  filter_legitimate:
    user.username|contains:
      - 'system:serviceaccount:kube-system:'
      - 'system:kube-controller-manager'
  condition: selection and not filter_legitimate
level: high
falsepositives:
  - Legitimate cluster-admin provisioning by infrastructure automation
```

### Bash 自动化检测脚本

```bash
#!/bin/bash
echo "=========================================="
echo "Kubernetes Security Audit Script"
echo "=========================================="
echo ""
echo "[*] Checking for privileged pods..."
kubectl get pods -A -o json | jq -r '.items[] | select(.spec.containers[]?.securityContext.privileged == true) | "ALERT: Privileged Pod - \(.metadata.namespace)/\(.metadata.name) image=\(.spec.containers[0].image)"'
echo ""
echo "[*] Checking for hostPID/hostNetwork/hostIPC..."
kubectl get pods -A -o json | jq -r '.items[] | select(.spec.hostPID == true or .spec.hostNetwork == true or .spec.hostIPC == true) | "ALERT: Host Namespace Pod - \(.metadata.namespace)/\(.metadata.name) hostPID=\(.spec.hostPID // false) hostNetwork=\(.spec.hostNetwork // false) hostIPC=\(.spec.hostIPC // false)"'
echo ""
echo "[*] Checking for hostPath mounts..."
kubectl get pods -A -o json | jq -r '.items[] | .spec.volumes[]? | select(.hostPath != null) | select(.hostPath.path == "/etc" or .hostPath.path == "/var/run/docker.sock" or .hostPath.path == "/" or .hostPath.path == "/proc" or .hostPath.path == "/root") | "ALERT: Sensitive hostPath mount found"'
echo ""
echo "[*] Checking cluster-admin bindings..."
kubectl get clusterrolebindings -o json | jq -r '.items[] | select(.roleRef.name == "cluster-admin") | "ALERT: cluster-admin binding - \(.metadata.name) -> [\([.subjects[]? | "\(.kind)/\(.name)"] | join(", "))]"'
echo ""
echo "[*] Checking for automountServiceAccountToken..."
kubectl get pods -A -o json | jq -r '.items[] | select(.spec.automountServiceAccountToken != false) | select(.metadata.namespace != "kube-system") | "WARNING: SA Token automounted - \(.metadata.namespace)/\(.metadata.name) sa=\(.spec.serviceAccountName // "default")"'
echo ""
echo "[*] Checking for unnamed/anonymous users with RBAC bindings..."
kubectl get rolebindings -A -o json | jq -r '.items[] | select(.subjects[]? | select(.name == "system:anonymous" or .name == "system:unauthenticated")) | "ALERT: Anonymous binding - \(.metadata.namespace)/\(.metadata.name) role=\(.roleRef.name)"'
echo ""
echo "[*] Checking exposed Services..."
kubectl get svc -A -o json | jq -r '.items[] | select(.spec.type == "NodePort" or .spec.type == "LoadBalancer") | "WARNING: Exposed Service - \(.metadata.namespace)/\(.metadata.name) type=\(.spec.type) ports=[\([.spec.ports[]? | "\(.port)/\(.protocol)"] | join(", "))]"'
echo ""
echo "[*] Checking for container images from public registries..."
kubectl get pods -A -o json | jq -r '.items[] | .spec.containers[].image | select(test("^docker.io/|^gcr.io/|^quay.io/|^k8s.gcr.io/") | not and test("/") | not) | "WARNING: Public registry image - \(.)" | sort -u'
echo ""
echo "[*] Checking for NetworkPolicy coverage..."
ALL_NS=$(kubectl get ns -o jsonpath='{.items[*].metadata.name}')
for ns in $ALL_NS; do
  NP_COUNT=$(kubectl get networkpolicies -n $ns --no-headers 2>/dev/null | wc -l | tr -d ' ')
  POD_COUNT=$(kubectl get pods -n $ns --no-headers 2>/dev/null | wc -l | tr -d ' ')
  if [ "$POD_COUNT" -gt 0 ] && [ "$NP_COUNT" -eq 0 ]; then
    echo "WARNING: Namespace $ns has $POD_COUNT pods but 0 NetworkPolicies"
  fi
done
echo ""
echo "[*] Checking for images with known critical vulnerabilities..."
kubectl get pods -A -o json | jq -r '.items[] | "\(.metadata.namespace)/\(.metadata.name) \(.spec.containers[0].image)"' | head -20 | while read line; do
  image=$(echo $line | awk '{print $2}')
  result=$(trivy image --severity CRITICAL --quiet --format json $image 2>/dev/null | jq '.Results[]?.Vulnerabilities[]? | .VulnerabilityID' 2>/dev/null | wc -l | tr -d ' ')
  if [ "$result" -gt 0 ]; then
    echo "CRITICAL: $line has $result critical vulnerabilities"
  fi
done
echo ""
echo "=========================================="
echo "Audit completed at $(date)"
echo "=========================================="
```

### Python 自动化检测脚本

```python
#!/usr/bin/env python3
import json
import subprocess
import sys
from datetime import datetime, timedelta

def run_kubectl(args):
    result = subprocess.run(["kubectl"] + args, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return result.stdout

def check_privileged_pods():
    findings = []
    data = run_kubectl(["get", "pods", "-A", "-o", "json"])
    if not data:
        return findings
    for pod in data.get("items", []):
        ns = pod["metadata"]["namespace"]
        name = pod["metadata"]["name"]
        for c in pod.get("spec", {}).get("containers", []):
            sc = c.get("securityContext", {})
            if sc.get("privileged") is True:
                findings.append({
                    "severity": "CRITICAL",
                    "type": "Privileged Container",
                    "namespace": ns,
                    "name": name,
                    "image": c.get("image", "unknown"),
                    "detail": "Container runs in privileged mode"
                })
            caps = sc.get("capabilities", {}).get("add", [])
            dangerous_caps = [cap for cap in caps if cap in ["SYS_ADMIN", "SYS_PTRACE", "SYS_MODULE", "NET_ADMIN", "SYS_RAWIO"]]
            if dangerous_caps:
                findings.append({
                    "severity": "HIGH",
                    "type": "Dangerous Capabilities",
                    "namespace": ns,
                    "name": name,
                    "image": c.get("image", "unknown"),
                    "detail": f"Dangerous capabilities: {', '.join(dangerous_caps)}"
                })
        spec = pod.get("spec", {})
        if spec.get("hostPID") is True:
            findings.append({
                "severity": "HIGH",
                "type": "Host PID Namespace",
                "namespace": ns,
                "name": name,
                "image": "",
                "detail": "Pod uses host PID namespace"
            })
        if spec.get("hostNetwork") is True:
            findings.append({
                "severity": "HIGH",
                "type": "Host Network",
                "namespace": ns,
                "name": name,
                "image": "",
                "detail": "Pod uses host network namespace"
            })
        for vol in spec.get("volumes", []):
            hp = vol.get("hostPath", {})
            path = hp.get("path", "")
            sensitive_paths = ["/etc", "/var/run/docker.sock", "/proc", "/sys", "/root", "/var/log"]
            for sp in sensitive_paths:
                if path == sp or path.startswith(sp + "/"):
                    findings.append({
                        "severity": "HIGH",
                        "type": "Sensitive HostPath Mount",
                        "namespace": ns,
                        "name": name,
                        "image": "",
                        "detail": f"Volume '{vol.get('name')}' mounts sensitive path: {path}"
                    })
    return findings

def check_rbac_bindings():
    findings = []
    data = run_kubectl(["get", "clusterrolebindings", "-o", "json"])
    if not data:
        return findings
    for binding in data.get("items", []):
        if binding.get("roleRef", {}).get("name") == "cluster-admin":
            subjects = binding.get("subjects", []) or []
            for s in subjects:
                if s.get("kind") == "User" and not s.get("name", "").startswith("system:"):
                    findings.append({
                        "severity": "CRITICAL",
                        "type": "ClusterAdmin Binding",
                        "resource": binding["metadata"]["name"],
                        "detail": f"User '{s.get('name')}' has cluster-admin role"
                    })
                elif s.get("kind") == "ServiceAccount" and s.get("namespace") != "kube-system":
                    findings.append({
                        "severity": "CRITICAL",
                        "type": "ClusterAdmin SA Binding",
                        "resource": binding["metadata"]["name"],
                        "detail": f"SA '{s.get('namespace')}/{s.get('name')}' has cluster-admin role"
                    })
    return findings

def check_audit_log_anomalies(log_path):
    findings = []
    try:
        with open(log_path, 'r') as f:
            for line in f:
                try:
                    entry = json.loads(line.strip())
                except json.JSONDecodeError:
                    continue
                user = entry.get("user", {}).get("username", "")
                verb = entry.get("verb", "")
                resource = entry.get("objectRef", {}).get("resource", "")
                code = entry.get("responseStatus", {}).get("code", 0)
                if user == "system:anonymous" and code == 200:
                    findings.append({
                        "severity": "CRITICAL",
                        "type": "Anonymous API Access",
                        "detail": f"Anonymous user successfully {verb} {resource}",
                        "timestamp": entry.get("requestReceivedTimestamp", "")
                    })
                if verb in ["create", "patch", "update"] and resource in ["clusterrolebindings", "rolebindings"]:
                    findings.append({
                        "severity": "HIGH",
                        "type": "RBAC Modification",
                        "detail": f"User '{user}' {verb} {resource}",
                        "timestamp": entry.get("requestReceivedTimestamp", "")
                    })
                if verb == "create" and resource == "pods/exec":
                    findings.append({
                        "severity": "HIGH",
                        "type": "Pod Exec",
                        "detail": f"User '{user}' exec into pod in {entry.get('objectRef', {}).get('namespace', 'unknown')}",
                        "timestamp": entry.get("requestReceivedTimestamp", "")
                    })
    except FileNotFoundError:
        print(f"[!] Audit log not found: {log_path}")
    return findings

def main():
    print("=" * 60)
    print("Kubernetes Security Audit - Automated Detection")
    print(f"Scan Time: {datetime.now().isoformat()}")
    print("=" * 60)
    all_findings = []
    print("\n[*] Checking privileged pods and dangerous capabilities...")
    findings = check_privileged_pods()
    all_findings.extend(findings)
    for f in findings:
        print(f"  [{f['severity']}] {f['type']}: {f.get('namespace', '')}/{f.get('name', '')} - {f['detail']}")
    print(f"\n[*] Checking RBAC bindings...")
    findings = check_rbac_bindings()
    all_findings.extend(findings)
    for f in findings:
        print(f"  [{f['severity']}] {f['type']}: {f['detail']}")
    audit_log = "/var/log/k8s-audit/audit.log"
    print(f"\n[*] Analyzing audit log: {audit_log}")
    findings = check_audit_log_anomalies(audit_log)
    all_findings.extend(findings)
    for f in findings:
        print(f"  [{f['severity']}] {f['type']}: {f['detail']} @ {f.get('timestamp', 'N/A')}")
    print("\n" + "=" * 60)
    critical = sum(1 for f in all_findings if f["severity"] == "CRITICAL")
    high = sum(1 for f in all_findings if f["severity"] == "HIGH")
    medium = sum(1 for f in all_findings if f["severity"] == "MEDIUM")
    print(f"Summary: {critical} CRITICAL, {high} HIGH, {medium} MEDIUM")
    print(f"Total findings: {len(all_findings)}")
    print("=" * 60)
    report = {
        "scan_time": datetime.now().isoformat(),
        "total_findings": len(all_findings),
        "critical": critical,
        "high": high,
        "medium": medium,
        "findings": all_findings
    }
    with open("/evidence/k8s-audit-report.json", "w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"\nReport saved to /evidence/k8s-audit-report.json")
    if critical > 0:
        sys.exit(2)
    elif high > 0:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == "__main__":
    main()
```

---

## 0x0B 公开案例分析

### 案例一：Tesla Kubernetes 集群加密货币挖矿入侵事件

| 维度 | 详情 |
|------|------|
| 攻击组织/来源 | 未归属特定 APT 组织，属于加密货币挖矿驱动型攻击 |
| 发现时间 | 2018 年（由 RedLock Cloud Security Intelligence 披露） |
| 影响范围 | Tesla 云环境中的 Kubernetes Dashboard |
| MITRE ATT&CK | T1190 Exploit Public-Facing App → T1610 Deploy Container → T1496 Resource Hijacking |

**攻击链描述**：

攻击者利用 Tesla Kubernetes Dashboard（kube-dashboard）的未授权访问作为初始入口点。Dashboard 未配置身份认证，任何知道 URL 的人都可以访问集群管理界面。通过 Dashboard，攻击者获取了 AWS 云环境的凭据（以 Secret 形式存储在 Kubernetes 中），进而访问了 S3 存储桶，其中包含 Tesla 内部遥测数据。随后，攻击者在集群中部署了加密货币挖矿容器，并将挖矿流量通过 CloudFlare DNS 隧道外传，以规避网络监控。

**取证发现**：

| 取证发现 | 证据类型 | 分析结论 |
|---------|---------|---------|
| kube-dashboard 无认证访问 | Kubernetes 审计日志 | Dashboard 未启用 RBAC 或 OIDC 认证 |
| 挖矿容器在默认命名空间运行 | etcd 数据 + Pod 定义 | 攻击者在 default NS 创建了未授权 Deployment |
| AWS 凭据从 Secret 中提取 | etcd Secret 数据 | 集群 Secret 中硬编码了 AWS Access Key |
| S3 存储桶数据被访问 | AWS CloudTrail 日志 | 利用泄露的凭据访问了 Tesla 遥测数据 |
| 挖矿流量通过 CloudFlare DNS 隧道 | 网络流量分析 | 使用 DNS over HTTPS 隐蔽挖矿通信 |

**IOC**：

| IOC 类型 | IOC 值 | 说明 |
|---------|--------|------|
| 外部通信域名 | *.cloudflare.com (DNS tunneling) | 挖矿流量通过 CloudFlare 代理 |
| 挖矿矿池 | nicehash.com, miningpoolhub.com | 加密货币挖矿矿池地址 |
| 恶意容器镜像 | 未公开具体镜像名 | 通过 kube-dashboard 部署的挖矿容器 |
| AWS 凭据 | 未公开具体 Key | 从 Kubernetes Secret 中提取的 AWS 凭据 |

**经验教训**：

- Kubernetes Dashboard 必须启用强身份认证（OIDC 或 x509 客户端证书），默认的 Token 认证不足以防止未授权访问
- 云凭据不应以明文 Secret 形式存储在 Kubernetes 中，应使用 External Secrets Operator 或 Vault 等外部密钥管理方案
- 集群内部署的容器应受到 Pod Security Standards 约束，防止创建非预期的工作负载
- 出站 DNS 流量应被监控和限制，DNS 隧道是容器环境中常见的隐蔽通道技术
- 多层防御（Defense in Depth）是必要的：即使 Dashboard 被攻破，AWS 凭据的权限隔离和网络监控应能阻止进一步损害

### 案例二：TeamTNT 云原生挖矿蠕虫攻击集群事件

| 维度 | 详情 |
|------|------|
| 攻击组织/来源 | TeamTNT（已知的云原生加密货币挖矿组织） |
| 发现时间 | 2020-2023 年（由 Aqua Security 持续跟踪披露） |
| 影响范围 | 全球数千个 Kubernetes 集群和 Docker 环境 |
| MITRE ATT&CK | T1610 Deploy Container → T1053 Scheduled Task/Job → T1059.004 Unix Shell → T1027 Obfuscation |

**攻击链描述**：

TeamTNT 是一个专注于云原生环境的加密货币挖矿组织，其攻击链具有典型的蠕虫式传播特征。攻击者首先扫描暴露在公网上的 Kubernetes API Server（利用未授权访问或弱认证），或利用容器中泄露的 SA Token 获取集群访问权限。进入集群后，TeamTNT 部署挖矿容器和持久化 CronJob，同时利用窃取的凭据扫描其他 Kubernetes 集群和 Docker 主机进行横向传播。Aqua Security 的研究团队在 2021 年跟踪到 TeamTNT 升级了其攻击工具链，加入了针对 AWS 凭据的自动窃取模块、基于 Tsunami 后门的持久化机制，以及利用 Kubernetes Admission Webhook 注入恶意容器的能力。

**取证发现**：

| 取证发现 | 证据类型 | 分析结论 |
|---------|---------|---------|
| 挖矿容器通过 CronJob 持久化 | etcd CronJob 定义 + Pod 日志 | 攻击者创建了每天定时拉取并运行挖矿镜像的 CronJob |
| 集群 SA Token 被提取并外传 | 容器日志 + 网络流量 | 容器内进程读取 /var/run/secrets/ 并通过 HTTP POST 外传 |
| AWS 凭据和 Docker Hub Token 被窃取 | 内存取证 + 网络流量 | TeamTNT 工具链中包含针对 AWS/Docker/Aliyun 凭据的窃取模块 |
| 使用 Tsunami 后门建立持久化 | 容器层文件分析 | /tmp 目录下发现 Tsunami 后门 JAR 文件 |
| 伪装为合法 Kubernetes 组件 | 镜像命名 + 进程名 | 恶意容器使用 kube-proxy、coredns 等合法组件名称伪装 |
| 利用 Redis 未授权访问作为跳板 | 容器网络日志 | 从 Redis 服务发起的异常连接指向恶意容器 |

**IOC**：

| IOC 类型 | IOC 值 | 说明 |
|---------|--------|------|
| 恶意镜像 | teamtnt/redteamshell, teamtnt/tnt-team | TeamTNT 使用的恶意容器镜像 |
| 挖矿矿池 | pool.minexmr.com, xmrpool.eu | XMR（门罗币）挖矿矿池地址 |
| 钱包地址 | 49fK1yV6HLKjW7x8aSmXqBqZPGxPmzQmLz3i9rKjzF8vN2pL | 门罗币挖矿钱包 |
| C2 域名 | teamtnt[.]zone, pastebin[.]com (raw) | Tsunami 后门 C2 和 Payload 分发 |
| 恶意脚本 URL | hxxps://pastebin[.]com/raw/<ID> | 通过 Pastebin 分发的恶意脚本 |
| 被利用端口 | 6379 (Redis), 2375/2376 (Docker API) | TeamTNT 常用的初始入侵端口 |

**经验教训**：

- Kubernetes 集群不应将 API Server 暴露到公网，如必须暴露应配置 OIDC 或 Webhook Token 认证
- SA Token 自动挂载应默认禁用（automountServiceAccountToken: false），仅在必要时显式启用
- 集群内应部署网络策略（NetworkPolicy）限制容器间的通信和出站 DNS 流量
- 容器镜像应从可信仓库拉取，使用 ImagePullPolicy: Always 确保镜像完整性
- 部署 Falco 或 Tetragon 等运行时安全工具，检测容器内的异常进程执行和网络连接
- AWS 凭据等云凭据应通过 IAM Role for Service Account (IRSA) 或 External Secrets Operator 管理，避免硬编码在 Secret 中

### 案例三：Hildegard 恶意容器攻击 Kubernetes 集群事件

| 维度 | 详情 |
|------|------|
| 攻击组织/来源 | TeamTNT（Aqua Security 命名为 Hildegard） |
| 发现时间 | 2021 年（由 Aqua Security 研究团队披露） |
| 影响范围 | Linux 服务器和 Kubernetes 集群 |
| MITRE ATT&CK | T1059.004 Unix Shell → T1496 Resource Hijacking → T1027 Obfuscation → T1571 Non-Standard Port |

**攻击链描述**：

Hildegard 是 TeamTNT 开发的新一代恶意软件框架，专门针对 Kubernetes 环境设计。与早期 TeamTNT 工具不同，Hildegard 采用了更隐蔽的攻击策略：使用 Tor 匿名网络代理所有外部通信，通过加密的 Unix Domain Socket 与 C2 服务器通信，利用 Kubernetes 的 Downward API 获取 Pod 所在节点信息，并通过修改 containerd 的配置实现持久化。Hildegard 的挖矿程序使用了定制化的 XMRig 变体，通过环境变量控制矿池地址和钱包信息，增加了静态检测的难度。

**取证发现**：

| 取证发现 | 证据类型 | 分析结论 |
|---------|---------|---------|
| Tor 进程在容器内运行 | /proc 进程快照 + 网络连接 | 容器内运行 Tor 代理所有 C2 通信 |
| Unix Domain Socket 加密通信 | 网络流量分析 | 恶意程序通过 /var/run/tm.sock 本地套接字通信 |
| containerd 配置被修改 | 宿主文件系统审计 | 攻击者修改了 containerd 的 config.toml 添加恶意 shim |
| 通过 Downward API 获取节点信息 | Pod spec + 容器日志 | 容器使用 downwardAPI volume 获取 NODE_NAME |
| XMRig 变体通过环境变量配置 | 内存取证 + 进程参数 | 挖矿程序的矿池和钱包信息通过 env 注入 |
| kubelet Token 被窃取 | 容器日志 + 文件操作 | 容器内进程读取了 kubelet 的 client certificate |

**IOC**：

| IOC 类型 | IOC 值 | 说明 |
|---------|--------|------|
| 恶意进程名 | bioset, kdevtmpfsi | 伪装为内核线程的挖矿进程 |
| 恶意 Unix Socket | /var/run/tm.sock | Hildegard C2 通信套接字 |
| Tor 代理 | 127.0.0.1:9050 | 通过 Tor 网络代理 C2 通信 |
| 钱包地址 | 48edfHu7V9Z84YzzMa6fUueoELZ9ZRXq9VetWzYGzKt52XU5xvqgzYnDK9URnRgG8x8v3G5E6d3pQd3 | 门罗币挖矿钱包 |
| 挖矿矿池 | pool.minexmr.com:443, xmrpool.eu:80 | 使用 HTTPS/HTTP 端口伪装矿池通信 |
| 恶意镜像 | ubuntu:20.04 (被篡改) | 在合法基础镜像上添加恶意组件 |

**经验教训**：

- 容器运行时配置（containerd/CRI-O）文件应被监控，任何修改都应触发告警
- Tor 和其他匿名网络工具应在集群网络策略层面被禁止
- Downward API 的使用应受到限制，避免泄露节点级别的环境信息
- 容器内的进程应受到 Seccomp 和 AppArmor 的约束，限制系统调用能力
- 部署 eBPF 安全工具（如 Cilium Tetragon）实时监控容器内的异常网络连接和进程行为

---

## 0x0C 参考资料

1. **CNCF Annual Survey 2025** - Cloud Native Computing Foundation. Kubernetes 容器编排平台采用率和安全趋势年度报告. https://www.cncf.io/reports/

2. **Sysdig 2024 Cloud Native Security and Usage Report** - Sysdig. 云原生环境安全威胁态势年度报告，包含容器逃逸和配置错误统计数据. https://sysdig.com/2024-cloud-native-security-and-usage-report/

3. **Aqua Security TeamTNT Research** - Aqua Security. TeamTNT 云原生挖矿攻击组织持续跟踪研究报告系列. https://www.aquasec.com/research/teamtnt/

4. **Kubernetes Official Documentation - RBAC Authorization** - Kubernetes. RBAC 权限控制官方文档，包含最佳实践和安全指南. https://kubernetes.io/docs/reference/access-authn-authz/rbac/

5. **Kubernetes Audit Logging** - Kubernetes. API Server 审计日志配置和使用官方文档. https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/

6. **CIS Kubernetes Benchmark** - Center for Internet Security. Kubernetes 安全配置基线标准，涵盖 etcd、API Server、kubelet 等组件的安全配置要求. https://www.cisecurity.org/benchmark/kubernetes

7. **RedLock Tesla K8s Incident Report** - RedLock Cloud Security Intelligence. Tesla Kubernetes 集群加密货币挖矿入侵事件详细分析报告. https://redlock.io/blog/cryptojacking-tesla

8. **Sigstore Cosign Documentation** - Sigstore Project. 镜像签名和验证工具 Cosign 官方文档. https://docs.sigstore.dev/cosign/overview/

9. **Kubernetes Security Whitepaper** - CNCF SIG-Runtime and SIG-Security. Kubernetes 安全白皮书，覆盖集群安全架构和威胁模型. https://www.cncf.io/whitepapers/

10. **Hildegard: TeamTNT's New Tool Targeting Kubernetes** - Aqua Security Research Team. Hildegard 恶意软件深度分析报告. https://www.aquasec.com/news/hildegard-malware-teamtnt/