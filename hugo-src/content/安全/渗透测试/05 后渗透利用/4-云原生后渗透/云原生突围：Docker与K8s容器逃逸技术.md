---
title: "云原生突围：Docker与K8s容器逃逸技术"
weight: 10
---

# 云原生突围：Docker与K8s容器逃逸技术

在现代云原生架构中，应用几乎全部运行在 Docker 容器或 Kubernetes (K8s) 集群中。当红队通过 Web 漏洞（如 RCE）拿到一个 Shell 时，往往会发现自己处于一个被隔离的容器环境中——没有常见命令，看不到宿主机进程，网络也被严格限制。

**容器逃逸（Container Escape）**成为了云原生渗透中的核心战役。本文将深入剖析隔离机制的底层原理，并推演如何从容器内部撕裂沙箱，接管宿主机及整个 K8s 集群。

---

## 1. 容器隔离的底层原理

容器并不是真正的虚拟机（VM），它仅仅是宿主机上的一个普通进程。Docker 通过 Linux 内核的两大机制实现了“虚假的隔离”：
1.  **Namespaces（命名空间）**：实现资源隔离。让容器以为自己拥有独立的 PID（进程树）、Mount（文件系统）、Network（网卡）和 IPC。
2.  **Cgroups（控制组）**：实现资源限制。限制容器能使用的 CPU、内存和磁盘 I/O 上限。

**逃逸的本质**：就是打破 Namespaces 的隔离边界，访问到宿主机的 Namespace 资源。

---

## 2. Docker 配置不当引发的逃逸

绝大多数的容器逃逸，并非依赖零日漏洞（0day），而是源于开发/运维为了方便而赋予了容器过高的特权或挂载了危险的宿主机目录。

### 2.1 特权模式逃逸 (Privileged Mode)
当容器以 `--privileged` 参数启动时，它将获得宿主机的**所有 Linux Capabilities**（内核能力），并且可以直接访问宿主机的所有的设备文件（`/dev/*`）。
**逃逸手法**：
1.  在容器内执行 `fdisk -l` 或 `lsblk`，找到宿主机的主磁盘分区（如 `/dev/sda1`）。
2.  将其挂载到容器内：`mkdir /mnt/host && mount /dev/sda1 /mnt/host`
3.  利用 `chroot /mnt/host` 直接切换根目录，或向 `/mnt/host/etc/crontab` 写入计划任务反弹宿主机的 Shell。

### 2.2 危险挂载 (Dangerous Mounts)
如果启动容器时，挂载了宿主机的敏感套接字或目录，逃逸将轻而易举。
*   **挂载了 Docker Socket (`/var/run/docker.sock`)**：
    这是 Docker 守护进程的 Unix 套接字。容器内一旦拥有对该文件的写权限，就可以直接与宿主机的 Docker 进程通信。
    **逃逸手法**：在容器内下载 Docker 客户端二进制文件，执行 `docker -H unix:///var/run/docker.sock run -v /:/host -it ubuntu /bin/bash`，启动一个新的挂载了宿主机根目录的容器。
*   **挂载了宿主机 `procfs` (`/proc`)**：
    `/proc/sys/kernel/core_pattern` 定义了核心转储程序的路径。容器可以直接修改该文件，当宿主机发生段错误时，强制内核以 Root 权限执行容器内指定的反弹 Shell 脚本。

### 2.3 Capabilities 滥用 (SYS_ADMIN / DAC_READ_SEARCH)
即使没有开启特权模式，如果单独赋予了 `CAP_SYS_ADMIN`（允许挂载文件系统等大量特权操作）或 `CAP_SYS_PTRACE`（允许追踪进程），同样可以导致逃逸。
**逃逸手法**：利用 `CAP_SYS_ADMIN` 配合 `cgroup` v1 的 `release_agent` 特性。当 cgroup 中的最后一个任务结束时，内核会调用 `release_agent` 执行配置的脚本，由于该调用发生在宿主机的上下文，我们可以借此在宿主机上执行命令。

---

## 3. K8s 集群的横向移动与接管

在 Kubernetes 环境中，单一容器的逃逸只是起点。K8s 极其复杂的组件通信和认证机制（RBAC），为红队提供了广阔的内网横向移动空间。

### 3.1 Service Account 凭据窃取
K8s 会在每个 Pod 容器的 `/var/run/secrets/kubernetes.io/serviceaccount/` 目录下默认挂载一个 Service Account (SA) 的 Token。
*   **信息收集**：红队在容器内读取 `token`、`ca.crt` 和 `namespace`。
*   **API 交互**：利用该 Token 向集群内的 K8s API Server (`https://kubernetes.default.svc`) 发起请求。
*   **提权与横向**：如果该 SA 绑定了高权限的 `ClusterRole`（如 `cluster-admin` 或允许创建/执行 Pod），红队可以直接调用 API，在其他节点的 Node 上创建一个带有特权模式的恶意 DaemonSet，瞬间接管整个集群的所有物理节点。

### 3.2 Kubelet 未授权访问漏洞
Kubelet 是运行在每个 K8s Node 上的“船长”，负责管理 Pod。默认监听在 `10250` 端口。
如果 Kubelet 配置了 `anonymous-auth=true` 且未严格限制授权，红队只需在内网发起 HTTP 请求：
```bash
# 获取节点上运行的所有 Pod 信息
curl -k https://<node-ip>:10250/pods

# 直接在指定的 Pod 中执行命令（免密 RCE）
curl -k -XPOST "https://<node-ip>:10250/run/<namespace>/<pod-name>/<container-name>" -d "cmd=id"
```

### 3.3 云厂商托管 K8s (EKS/ACK/TKE) 专属攻击面
如果在公有云的托管 K8s 集群中逃逸到了宿主机（Node），红队可以结合前文提到的 **IMDS（实例元数据服务）** 攻击：
1. 逃逸到 Node 宿主机。
2. 访问 `http://169.254.169.254` 窃取绑定在该 Node 上的云厂商 IAM 角色凭证。
3. 利用该凭证接管云端的 VPC、数据库，甚至修改 K8s 集群的底层云网络路由配置。

---

## 4. 总结

云原生时代的红蓝对抗，已经从传统的“主机-网络”模型，升维到了“集群-API-元数据”的立体空间。容器逃逸的核心，在于寻找并滥用跨越 Namespace 隔离的桥梁（如特权模式、危险挂载、Capabilities）。而一旦撕开了这层薄弱的沙箱，等待红队的将是 K8s API Server 这座蕴含无限可能的“云端中枢”。