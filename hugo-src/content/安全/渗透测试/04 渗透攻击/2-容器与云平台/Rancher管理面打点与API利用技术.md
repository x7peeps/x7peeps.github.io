---
title: "Rancher管理面打点与API利用技术"
date: 2026-06-15T11:24:54+08:00
draft: false
weight: 56
description: "围绕Rancher相关攻击面与利用路径，分析打点识别、接口枚举、风险链条、日志痕迹与防守处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "容器平台", "Rancher"]
---

# Rancher管理面打点与API利用技术

`Rancher Manager` 是 Kubernetes 多集群管理场景中的高价值控制平面。它的价值不只是“能看到集群列表”，而在于它同时掌握：

- 集群、项目、命名空间与节点对象
- 用户、角色、API Key 与 Token
- kubeconfig 下载与认证代理
- 对下游集群的统一访问入口
- 节点驱动、云凭据、集群注册与导入流程

一旦 Rancher 被暴露到低信任网络、API Key 管理松散、旧版 v3 API 可被低权限滥用，或者 kubeconfig / token 生命周期控制不足，攻击者通常可以在打点阶段快速获得：

- 集群名称、集群 ID、集群类型与状态
- 项目、命名空间、节点与角色分布
- token / kubeconfig 相关线索
- Authorized Cluster Endpoint 与代理访问路径
- 低权限 API key 的真实权限边界
- 历史高危面与旧版 API 路由

本文只聚焦打点与利用侧，重点记录：

1. 如何识别 Rancher UI 与 API 面
2. 如何通过 `v3 API` 与 token 机制建立资产画像
3. 如何枚举 cluster / project / node / namespace / kubeconfig 线索
4. 如何判断 API key、kubeconfig token 与 ACE 的风险面
5. 蓝队如何从反向代理日志与 Rancher API 审计日志中识别这类打点

---

## 0. 攻击面概览

### 0.1 常见路径

首轮至少应枚举：

- `/`
- `/dashboard/`
- `/v3`
- `/v3/clusters`
- `/v3/projects`
- `/v3/tokens`
- `/v3/settings`
- `/v3/users`
- `/v3/clusters/{clusterId}`
- `/v3/clusters/{clusterId}/nodes`
- `/v3/clusters/{clusterId}/namespaces`
- `/k8s/clusters/{clusterId}`
- `/v1/management.cattle.io.clusters`

如果目标为较新版本，还应留意：

- Rancher Kubernetes API（RK-API）对应的 Kubernetes 风格路径
- 扩展 API server 暴露面

### 0.2 打点收益优先级

按“最快转成真实攻击价值”的顺序，常见收益可排列为：

1. 确认 Rancher、版本风格和认证机制
2. 用 API key 或 Bearer token 枚举 clusters / projects / nodes
3. 判断 token TTL、kubeconfig token 与永久 token 风险
4. 还原通过 Rancher 代理访问下游集群的方式
5. 判断旧版 v3 API、旧 token 模型与公开 API 审计能力

---

## 1. 第一轮打点：确认是否为 Rancher

### 1.1 Web 页面识别

#### 请求示例

```http
GET /dashboard/ HTTP/1.1
Host: rancher.target.example
User-Agent: Mozilla/5.0
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Set-Cookie: R_SESS=deleted; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT
```

页面正文与静态资源中常见特征包括：

- `Rancher`
- `Cluster Management`
- `Dashboard`

### 1.2 `v3` API 根识别

Rancher 官方旧版 v3 API 指南明确说明：`/v3` 本身就是 API 根入口，并且每个响应都会带出 schema 发现能力。

#### 请求示例

```http
GET /v3 HTTP/1.1
Host: rancher.target.example
Accept: application/json
Connection: close
```

#### 典型未认证响应示例

```json
{
  "type": "collection",
  "links": {
    "self": "https://rancher.target.example/v3",
    "schemas": "https://rancher.target.example/v3/schemas"
  },
  "actions": {},
  "pagination": null
}
```

#### 典型响应头示例

```http
X-Api-Schemas: https://rancher.target.example/v3/schemas
```

这类响应的价值非常高，因为它说明：

- v3 API 仍可用
- schema 发现机制存在
- 后续可以按 schema 自动推导 collection、字段、actions 与 links

### 1.3 认证失败响应

#### 请求示例

```http
GET /v3/clusters HTTP/1.1
Host: rancher.target.example
Accept: application/json
Connection: close
```

#### 典型失败响应示例

```json
{
  "baseType": "error",
  "code": "Unauthorized",
  "message": "authentication required"
}
```

即使这里只是 401 / Unauthorized，同样很有价值，因为它说明：

- API 正常工作
- 目标明确存在 cluster collection
- 后续只需切换到 API key、Bearer token 或 kubeconfig 线索即可继续

---

## 2. 第二轮打点：API Key、Bearer Token 与会话模型

### 2.1 API Key 结构

Rancher 官方 API key 文档明确指出，一个 API key 由以下部分组成：

- Endpoint
- Access Key
- Secret Key
- Bearer Token

这意味着在打点中，只要从别处获得任意一种形态的凭据，就可以迅速切换为标准 API 请求。

### 2.2 Bearer 验证

#### 请求示例

```http
GET /v3 HTTP/1.1
Host: rancher.target.example
Authorization: Bearer token-xxxxx:yyyyyyyyyyyyyyyyyyyyyyyy
Accept: application/json
Connection: close
```

#### 典型成功响应示例

```json
{
  "type": "collection",
  "links": {
    "clusters": "https://rancher.target.example/v3/clusters",
    "projects": "https://rancher.target.example/v3/projects",
    "tokens": "https://rancher.target.example/v3/tokens"
  }
}
```

这里的价值包括：

- 验证 token 真实有效
- 获取后续所有顶层资源链接
- 进入标准化 collection 枚举阶段

### 2.3 Basic 认证形式

Rancher v3 API 指南明确说明，API key 也可以通过 HTTP Basic 认证使用。

#### 请求示例

```http
GET /v3/clusters HTTP/1.1
Host: rancher.target.example
Authorization: Basic dG9rZW4teHh4eHg6eXl5eXl5eXl5eXl5eXl5eXl5eXk=
Accept: application/json
Connection: close
```

#### 典型成功响应示例

```json
{
  "type": "collection",
  "data": [
    {
      "id": "c-m-abc12345",
      "name": "production",
      "state": "active",
      "provider": "rke2"
    }
  ]
}
```

对于打点来说，`Basic` 与 `Bearer` 的区别不大，关键在于：

- 当前拿到的是 access/secret 对
- 还是已经拼好的 bearer token

### 2.4 Token TTL 与长期有效 token

Rancher 官方 token 文档明确指出：

- 某些 cluster-level token 默认 `ttl=0`
- `ttl=0` 表示不会自动过期，除非被手动删除

这在打点中非常重要，因为只要在其他平台中拿到：

- `kubectl-shell-*`
- `helm-token-*`
- `agent-*`
- 普通 Bearer token

就应优先判断：

- 是短期 token
- 还是长期有效 token

---

## 3. 第三轮打点：集群、项目、节点与命名空间枚举

### 3.1 列出所有集群

#### 请求示例

```http
GET /v3/clusters HTTP/1.1
Host: rancher.target.example
Authorization: Bearer token-xxxxx:yyyyyyyyyyyyyyyyyyyyyyyy
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "type": "collection",
  "data": [
    {
      "id": "c-m-abc12345",
      "name": "production",
      "state": "active",
      "provider": "rke2",
      "nodeCount": 7,
      "version": {
        "gitVersion": "v1.30.4+rke2r1"
      },
      "links": {
        "self": "https://rancher.target.example/v3/clusters/c-m-abc12345",
        "nodes": "https://rancher.target.example/v3/clusters/c-m-abc12345/nodes"
      }
    }
  ]
}
```

这条响应一旦出现，就可以直接回收：

- cluster ID
- 集群名
- provider
- node 数量
- Kubernetes 版本

### 3.2 查询单个集群

#### 请求示例

```http
GET /v3/clusters/c-m-abc12345 HTTP/1.1
Host: rancher.target.example
Authorization: Bearer token-xxxxx:yyyyyyyyyyyyyyyyyyyyyyyy
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "id": "c-m-abc12345",
  "name": "production",
  "state": "active",
  "provider": "rke2",
  "nodeCount": 7,
  "created": "2026-03-14T09:15:22Z"
}
```

这一类单对象读取更适合后续做精细资产归档与环境画像。

### 3.3 列出节点

#### 请求示例

```http
GET /v3/clusters/c-m-abc12345/nodes HTTP/1.1
Host: rancher.target.example
Authorization: Bearer token-xxxxx:yyyyyyyyyyyyyyyyyyyyyyyy
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": [
    {
      "nodeName": "prod-master-01",
      "state": "active",
      "controlPlane": true,
      "etcd": true,
      "worker": false,
      "ipAddress": "10.10.20.11",
      "allocatable": {
        "cpu": "8",
        "memory": "32768Mi"
      }
    },
    {
      "nodeName": "prod-worker-01",
      "state": "active",
      "controlPlane": false,
      "etcd": false,
      "worker": true,
      "ipAddress": "10.10.20.21"
    }
  ]
}
```

对打点来说，这条响应非常高价值，因为它直接暴露：

- 节点名
- 角色分布
- 内部 IP
- 资源规模

### 3.4 列出项目

#### 请求示例

```http
GET /v3/projects HTTP/1.1
Host: rancher.target.example
Authorization: Bearer token-xxxxx:yyyyyyyyyyyyyyyyyyyyyyyy
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": [
    {
      "id": "c-m-abc12345:p-9k4xz",
      "name": "payment-prod",
      "clusterId": "c-m-abc12345"
    }
  ]
}
```

这一步可以把：

- cluster
- project
- namespace / workload 归属

迅速串起来。

### 3.5 列出命名空间

#### 请求示例

```http
GET /v3/clusters/c-m-abc12345/namespaces HTTP/1.1
Host: rancher.target.example
Authorization: Bearer token-xxxxx:yyyyyyyyyyyyyyyyyyyyyyyy
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": [
    {
      "id": "c-m-abc12345:payment-prod",
      "name": "payment-prod",
      "projectId": "c-m-abc12345:p-9k4xz"
    }
  ]
}
```

这能进一步帮助你还原：

- namespace 到 project 的关系
- 哪些命名空间可能对应高价值应用

---

## 4. 第四轮打点：kubeconfig、Authorized Cluster Endpoint 与代理访问

### 4.1 kubeconfig 的攻击价值

Rancher 官方文档明确说明：

- 下载的 kubeconfig 可通过 Rancher 认证代理访问下游集群
- 某些场景下还能直接使用 Authorized Cluster Endpoint（ACE）访问下游集群

这意味着一份 Rancher 生成的 kubeconfig 文件，在打点中的价值极高，因为它可能直接包含：

- 通过 Rancher 访问下游集群的 server 路径
- token 或 token 生成机制
- 额外的 ACE context

### 4.2 kubeconfig 结构线索

#### 典型 kubeconfig 片段示例

```yaml
apiVersion: v1
kind: Config
clusters:
- name: "production"
  cluster:
    server: "https://rancher.target.example/k8s/clusters/c-m-abc12345"
contexts:
- name: "production"
  context:
    cluster: "production"
    user: "production"
users:
- name: "production"
  user:
    token: token-xxxxx:yyyyyyyyyyyyyyyyyyyyyyyy
```

仅从这类配置片段就能获得：

- cluster ID
- Rancher 代理访问路径
- 认证 token 形态

### 4.3 Authorized Cluster Endpoint

Rancher 官方 ACE 文档明确指出：

- 开启 ACE 后，kubeconfig 会多出一个可以直接连接下游集群 API server 的 context
- 这条链不再完全依赖 Rancher 代理

对打点而言，这意味着：

- 一份 kubeconfig 不只是“Rancher 控制台访问凭据”
- 还可能直接变成对下游 K8s API 的入口

### 4.4 通过 Rancher 代理访问下游集群

#### 请求示例

```http
GET /k8s/clusters/c-m-abc12345/api/v1/namespaces HTTP/1.1
Host: rancher.target.example
Authorization: Bearer token-xxxxx:yyyyyyyyyyyyyyyyyyyyyyyy
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "kind": "NamespaceList",
  "items": [
    {
      "metadata": {
        "name": "payment-prod"
      }
    },
    {
      "metadata": {
        "name": "cattle-system"
      }
    }
  ]
}
```

这条响应很重要，因为它说明：

- 当前 token 不只是 Rancher UI 权限
- 还具备通过 Rancher 代理调用下游 Kubernetes API 的能力

### 4.5 失败响应的意义

GitHub issue 中的真实问题样例显示，这类链路在 CI/CD 中常见失败响应包括：

#### 典型失败响应示例

```json
{
  "Code": {
    "Code": "Forbidden",
    "Status": 403
  },
  "Message": "clusters.management.cattle.io \"c-m-abc12345\" is forbidden: User \"system:unauthenticated\" cannot get resource \"clusters\" in API group \"management.cattle.io\" at the cluster scope"
}
```

这类失败也有价值，因为它会直接告诉你：

- token / kubeconfig 是否失效
- 当前请求是卡在 Rancher 管理面还是卡在下游 API 代理层

---

## 5. 第五轮打点：settings、tokens 与 API 审计

### 5.1 `/v3/settings`

settings 对打点很有价值，因为它会暴露：

- token TTL
- kubeconfig token 生成策略
- 认证相关开关

#### 请求示例

```http
GET /v3/settings HTTP/1.1
Host: rancher.target.example
Authorization: Bearer token-xxxxx:yyyyyyyyyyyyyyyyyyyyyyyy
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": [
    {
      "id": "auth-token-max-ttl-minutes",
      "value": "129600"
    },
    {
      "id": "kubeconfig-default-token-ttl-minutes",
      "value": "43200"
    },
    {
      "id": "kubeconfig-generate-token",
      "value": "true"
    }
  ]
}
```

这些字段的意义非常直接：

- `auth-token-max-ttl-minutes`
  决定普通 token 最长存活时间
- `kubeconfig-default-token-ttl-minutes`
  决定 kubeconfig token 生命周期
- `kubeconfig-generate-token`
  决定下载 kubeconfig 时是否直接生成 token

### 5.2 `/v3/tokens`

#### 请求示例

```http
GET /v3/tokens HTTP/1.1
Host: rancher.target.example
Authorization: Bearer token-xxxxx:yyyyyyyyyyyyyyyyyyyyyyyy
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": [
    {
      "id": "token-zs42h",
      "description": "gitlab-runner-prod",
      "ttl": 0,
      "userId": "user-6j5s6"
    }
  ]
}
```

如果当前身份能看到 token 列表，这已经是非常高价值的发现，因为：

- `ttl=0` 明确表示长期有效 token
- description 往往暴露自动化用途，如 `gitlab-runner-prod`

### 5.3 API Audit Log

Rancher 官方审计日志文档明确说明：

- 启用 API audit log 后，所有请求和响应都能被记录
- 每条请求 / 响应会共享 `auditID`
- token id、username、URI、responseCode 都会被记录

#### 审计日志示例

```json
{
  "auditID": "d1088a09-2a13-4450-970e-0d44bd2c49ee",
  "requestURI": "/v3/projects",
  "user": {
    "name": "user-6j5s6",
    "group": [
      "system:authenticated",
      "system:cattle:authenticated"
    ],
    "extra": {
      "requesttokenid": [
        "token-zs42h"
      ],
      "username": [
        "admin"
      ]
    }
  },
  "method": "POST",
  "responseCode": 201
}
```

这类日志对于蓝队非常关键，因为它几乎可以完整还原：

- 是谁发起了请求
- 用的是哪个 token
- 操作了哪个 URI
- 返回码是什么

---

## 6. 打点流程建议

更稳的 Rancher 打点流程通常如下：

### 6.1 第一轮：识别与 API 根

优先请求：

- `/dashboard/`
- `/v3`
- `/v3/schemas`

目标：

- 确认产品
- 确认 v3 API 是否可用
- 利用 schema 发现资源类型

### 6.2 第二轮：认证模型与 token

优先请求：

- `/v3`
- `/v3/settings`
- `/v3/tokens`

目标：

- 判断 API key / bearer token 是否有效
- 判断 token TTL 与 kubeconfig token 策略

### 6.3 第三轮：核心对象枚举

优先请求：

- `/v3/clusters`
- `/v3/projects`
- `/v3/clusters/{clusterId}/nodes`
- `/v3/clusters/{clusterId}/namespaces`

目标：

- 建立 cluster / project / node / namespace 资产图

### 6.4 第四轮：代理与 kubeconfig

优先请求：

- `/k8s/clusters/{clusterId}/...`
- 下载或分析 kubeconfig 片段
- 核查 ACE 相关上下文

目标：

- 判断 token 是否已可进入下游 Kubernetes API

### 6.5 第五轮：审计与长期 token

优先检查：

- `ttl=0` token
- kubeconfig token 开关
- API 审计日志是否启用

目标：

- 判断当前环境中长期有效凭据的暴露风险

---

## 7. 蓝队检测与处置

### 7.1 访问日志中的高价值信号

应重点识别：

- 对 `/v3`、`/v3/schemas` 的探测
- 对 `/v3/clusters`、`/v3/projects`、`/v3/tokens` 的批量读取
- 对 `/k8s/clusters/{id}` 代理路径的访问
- 对 token、settings 与 kubeconfig 相关接口的连续请求

#### 日志示例

```text
10.10.10.21 - - [13/Jun/2026:03:41:11 +0800] "GET /v3 HTTP/1.1" 200 1217 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [13/Jun/2026:03:41:19 +0800] "GET /v3/clusters HTTP/1.1" 200 2147 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [13/Jun/2026:03:41:31 +0800] "GET /k8s/clusters/c-m-abc12345/api/v1/namespaces HTTP/1.1" 200 931 "-" "kubectl/v1.31"
```

第三条通常意味着请求已经从 Rancher 管理对象扩展到下游 Kubernetes 代理调用。

### 7.2 API 审计日志中的调查点

如果启用了审计日志，应重点关注：

- `/v3/tokens`
- `/v3/settings`
- `/v3/clusters`
- `/k8s/clusters/{id}`

以及：

- `requesttokenid`
- `username`
- `responseCode`

这些字段足以帮助蓝队快速判断：

- 是否为同一个 token 连续打点
- 是否正在从列表接口切换到代理接口

### 7.3 处置建议

发现 Rancher 正在被打点后，应优先做：

1. 收紧 Rancher API 暴露面
2. 复核所有长期有效 token 和 `ttl=0` token
3. 审核 kubeconfig token 生命周期与 `kubeconfig-generate-token` 设置
4. 检查是否存在被公开或泄露的 API key、CI token、runner token
5. 审核 `/k8s/clusters/{id}` 代理访问范围
6. 启用或提高 API 审计日志等级

长期建议：

- 不向低信任网络直接暴露 Rancher 管理面
- 禁止长期有效高权限 token
- 对 kubeconfig token 设置合理 TTL
- 对 `/v3/tokens`、`/k8s/clusters/{id}`、`/v3/settings` 建立单独告警
- 尽量推进到新的 RK-API 访问模型并收敛 legacy v3 API 暴露面

---

## 8. 复盘清单

### 8.1 红队侧

- 是否确认了 v3 API 是否可用
- 是否验证了 token 的 Bearer / Basic 两种用法
- 是否回收了 cluster / project / node / namespace 数据
- 是否验证了 Rancher 到下游 Kubernetes 的代理路径
- 是否确认了 token TTL 与 kubeconfig 策略

### 8.2 蓝队侧

- 是否能识别对 `/v3`、`/v3/schemas`、`/v3/clusters` 的连续打点
- 是否能识别对 `/k8s/clusters/{id}` 的代理访问
- 是否能通过 `requesttokenid` 快速定位可疑 token
- 是否对 `ttl=0` token 建立了治理清单

### 8.3 应急侧

- 是否确认长期 token 是否已泄露
- 是否确认 kubeconfig 是否已被外流
- 是否确认下游集群代理访问是否被滥用
- 是否完成 token、API key 与 kubeconfig 的轮换与失效处理

---

## 9. 总结

`Rancher` 的风险不只是“一个集群管理后台可访问”，而是它经常在同一套控制平面上同时暴露：

- 集群
- 项目
- 节点
- 命名空间
- token
- kubeconfig
- 下游 Kubernetes 代理访问链

对打点来说，更值得沉淀的方法学是：

- 先确认 v3 API 与 schema 发现能力
- 再确认 token 模型与 TTL
- 再枚举 clusters、projects、nodes、namespaces
- 最后验证 kubeconfig、ACE 与下游代理访问路径

这样才能把“Rancher 可访问”真正转化成结构化的攻击价值判断。

---

## 参考资料

- [Previous v3 Rancher API Guide](https://ranchermanager.docs.rancher.com/api/v3-rancher-api-guide)
- [Using API Tokens](https://ranchermanager.docs.rancher.com/api/api-tokens)
- [API Keys](https://ranchermanager.docs.rancher.com/reference-guides/user-settings/api-keys)
- [How the Authorized Cluster Endpoint Works](https://ranchermanager.docs.rancher.com/how-to-guides/new-user-guides/manage-clusters/access-clusters/authorized-cluster-endpoint)
- [Communicating with Downstream User Clusters](https://ranchermanager.docs.rancher.com/reference-guides/rancher-manager-architecture/communicating-with-downstream-user-clusters)
- [Enabling the API Audit Log to Record System Events](https://ranchermanager.docs.rancher.com/how-to-guides/advanced-user-guides/enable-api-audit-log)
