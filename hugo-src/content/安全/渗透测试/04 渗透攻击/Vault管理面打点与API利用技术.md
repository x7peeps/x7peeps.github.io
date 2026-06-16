---
title: "Vault管理面打点与API利用技术"
date: 2026-06-15T12:23:07+08:00
draft: false
weight: 59
description: "围绕Vault相关攻击面与利用路径，分析打点识别、接口枚举、风险链条、日志痕迹与防守处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "密钥管理", "Vault"]
---

# Vault管理面打点与API利用技术

`HashiCorp Vault` 是典型的高价值密钥与凭据控制平面。它管理的不只是“若干机密字符串”，而是整套组织级的：

- 静态与动态密钥
- 数据库、云平台与中间件临时凭据
- 认证方法
- ACL Policy
- Lease 与 Token 生命周期
- 审计日志
- UI 与 API 控制面

对攻击者来说，Vault 的价值不在于某个单一漏洞，而在于它把身份、策略、密钥和审计集中在同一服务里。一旦 Vault UI 或 API 被错误暴露、未经授权的系统端点对外可达、认证入口配置不当、客户端 Token 泄露、KV 或动态密钥路径权限过宽，攻击者可以在极短时间内把一次普通打点上升为对整条基础设施凭据链的侦察甚至接管。

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 Vault
2. 哪些未认证系统端点最值得优先探测
3. 如何围绕 UI、Mount、Auth Method、KV v2、Policy 与 Token 建立权限画像
4. 哪些请求与响应最值得完整记录
5. 蓝队如何从访问日志、审计日志与 Telemetry 指标识别这类打点

---

## 0. 攻击面概览

### 0.1 常见路径

首轮至少应枚举：

- `/ui/`
- `/v1/sys/health`
- `/v1/sys/seal-status`
- `/v1/sys/init`
- `/v1/sys/internal/ui/feature-flags`
- `/v1/sys/internal/ui/mounts`
- `/v1/sys/internal/ui/default-auth-methods`
- `/v1/sys/auth`
- `/v1/sys/mounts`
- `/v1/auth/token/lookup-self`
- `/v1/sys/capabilities-self`
- `/v1/sys/policies/acl`
- `/v1/secret/metadata/?list=true`
- `/v1/secret/data/<path>`
- `/v1/sys/metrics?format=prometheus`

### 0.2 认证头

Vault 的常见认证方式是：

- `X-Vault-Token: <token>`
- `Authorization: Bearer <token>`
- `X-Vault-Namespace: <namespace>`

其中 `X-Vault-Namespace` 在 Enterprise 环境里尤其关键，因为它会直接决定请求解析到哪一个命名空间。

### 0.3 打点收益优先级

按“最快转成真实攻击价值”的顺序，Vault 的打点收益一般可以排为：

1. 确认是否为 Vault、是否初始化、是否已解封、当前节点是否 active
2. 枚举 UI 内部接口、Mount 可见性和默认登录方式
3. 判断当前 Token 能否读取 auth、mount、policy、capability 和 token 自身信息
4. 枚举 KV v2 的 `metadata` 与 `data` 路径
5. 判断是否存在高危认证入口、过宽策略、指标暴露与审计缺失

---

## 1. 第一轮打点：确认是否为 Vault

### 1.1 UI 识别

Vault UI 默认运行在与 API 相同的监听端口上，路径通常为 `/ui/`。UI 默认并不会自动启用，只有显式设置 `ui = true` 或 dev 模式才会开放。

#### 请求示例

```http
GET /ui/ HTTP/1.1
Host: vault.target.example:8200
User-Agent: Mozilla/5.0
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Cache-Control: no-store
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

页面和前端资源中常见特征包括：

- `Vault`
- `HashiCorp Vault`
- `ui`
- `feature-flags`

如果 UI 可达，通常已经意味着：

- 管理面确实暴露在网络边界
- 后续可继续探测 `sys/internal/ui/*` 系列接口

### 1.2 `/v1/sys/health`

`/sys/health` 是 Vault 最重要的未认证探针之一。

#### 请求示例

```http
GET /v1/sys/health HTTP/1.1
Host: vault.target.example:8200
Accept: application/json
Connection: close
```

#### 典型成功响应示例

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "initialized": true,
  "sealed": false,
  "standby": false,
  "performance_standby": false,
  "replication_performance_mode": "disabled",
  "replication_dr_mode": "disabled",
  "server_time_utc": 1760442084,
  "version": "1.18.2",
  "cluster_name": "vault-cluster-cfe1cb9c",
  "cluster_id": "f507fd9f-89c4-e1f4-69ec-6919b0f9307b"
}
```

这条响应会直接暴露：

- 是否已初始化
- 是否已解封
- 当前节点是否是 active
- 版本号
- cluster 名称与 ID

### 1.3 `/v1/sys/health` 的状态码语义

Vault 的健康检查端点默认状态码很有辨识度：

- `200`：已初始化、已解封、active
- `429`：standby
- `472`：DR secondary
- `473`：performance standby
- `501`：未初始化
- `503`：已初始化但 sealed

#### 典型失败响应示例：未初始化

```http
HTTP/1.1 501 Not Implemented
Content-Type: application/json
```

```json
{
  "initialized": false,
  "sealed": true,
  "standby": false
}
```

#### 典型失败响应示例：已封印

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/json
```

```json
{
  "initialized": true,
  "sealed": true,
  "standby": false
}
```

单凭状态码与最小 JSON 响应，攻击者就能快速判断目标处在部署生命周期的哪个阶段。

### 1.4 `/v1/sys/seal-status`

这是另一个官方明确说明可未认证访问的系统端点。

#### 请求示例

```http
GET /v1/sys/seal-status HTTP/1.1
Host: vault.target.example:8200
Accept: application/json
Connection: close
```

#### 典型响应示例：已封印

```json
{
  "type": "shamir",
  "initialized": true,
  "sealed": true,
  "t": 3,
  "n": 5,
  "progress": 2,
  "nonce": "",
  "version": "1.19.0",
  "build_date": "2024-11-15T14:17:42Z",
  "migration": false,
  "recovery_seal": false,
  "storage_type": "raft"
}
```

#### 典型响应示例：已解封

```json
{
  "type": "shamir",
  "initialized": true,
  "sealed": false,
  "t": 3,
  "n": 5,
  "progress": 0,
  "nonce": "",
  "version": "1.19.0",
  "cluster_name": "vault-cluster-336172e1",
  "cluster_id": "f94053ad-d80e-4270-2006-2efd67d0910a",
  "recovery_seal": false,
  "storage_type": "raft"
}
```

这类响应尤其值得记录的字段包括：

- `type`
- `t`
- `n`
- `progress`
- `storage_type`
- `cluster_name`
- `cluster_id`

它们能帮助判断：

- 是 Shamir 还是 Auto Unseal
- 使用的是 raft、file 还是其它后端
- 当前节点是否处在半解封或已解封状态

### 1.5 `/v1/sys/init`

`GET /sys/init` 也可直接用来判断初始化状态。

#### 请求示例

```http
GET /v1/sys/init HTTP/1.1
Host: vault.target.example:8200
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "initialized": true
}
```

如果这里返回 `false`，说明目标尚未完成初始化。对暴露在公网的未初始化 Vault，这本身就是高危错误部署状态。

---

## 2. 第二轮打点：UI 内部接口与未认证可见面

### 2.1 `/v1/sys/internal/ui/feature-flags`

这是 UI 在登录前就会使用的未认证接口。

#### 请求示例

```http
GET /v1/sys/internal/ui/feature-flags HTTP/1.1
Host: vault.target.example:8200
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "feature-flags": []
}
```

即使业务价值不算最高，它也很适合用来判断：

- 目标确实是 Vault UI
- UI 后端内部接口是否完整可达

### 2.2 `/v1/sys/internal/ui/mounts`

这是 Vault UI 和 CLI 预检都会用到的重要内部接口，并且在未认证状态下就可能返回具有 `listing_visibility` 的挂载点。

#### 请求示例

```http
GET /v1/sys/internal/ui/mounts HTTP/1.1
Host: vault.target.example:8200
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "auth": {
    "github/": {
      "description": "GitHub auth",
      "type": "github"
    }
  },
  "secret": {
    "custom-secrets/": {
      "description": "Custom secrets",
      "options": {
        "version": "2"
      },
      "type": "kv"
    }
  }
}
```

这类响应对打点极有价值，因为它可能在未认证状态下直接暴露：

- 存在的 auth method 类型
- 存在的 secrets engine 类型
- KV 是否为 v2
- 挂载描述与命名方式

### 2.3 令牌联动下的 `/sys/internal/ui/mounts/:path`

如果带上有效 Token，再访问单个挂载详情，会得到更完整的 mount 配置画像。

#### 请求示例

```http
GET /v1/sys/internal/ui/mounts/secret HTTP/1.1
Host: vault.target.example:8200
X-Vault-Token: hvs.CAESIJT2KM9n2KJqg_E267EHJSY0c4NWtTRnBsNWhzUDkQZQ
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "accessor": "kv_9d62a10b",
  "type": "kv",
  "description": "kv-v2 for application secrets",
  "options": {
    "version": "2"
  },
  "config": {
    "default_lease_ttl": 0,
    "max_lease_ttl": 0,
    "force_no_cache": false
  }
}
```

### 2.4 `/v1/sys/internal/ui/default-auth-methods`

在 Enterprise 环境中，这个未认证 UI 内部接口可以返回默认与备用登录方式。

#### 请求示例

```http
GET /v1/sys/internal/ui/default-auth-methods HTTP/1.1
Host: vault.target.example:8200
X-Vault-Namespace: it-admins
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": {
    "backup_auth_types": [
      "token",
      "userpass"
    ],
    "default_auth_type": "ldap",
    "disable_inheritance": false
  }
}
```

一旦看到这类返回，攻击者几乎可以立刻判断：

- 登录入口更可能走哪种认证
- 是否值得优先测试 `ldap`、`userpass` 或 token 入口

---

## 3. 第三轮打点：认证入口与 Token 画像

### 3.1 `auth login` 的价值边界

Vault 的每种 auth method 都有一个或多个未认证登录端点。它们的风险通常不在“能直接拿到 token”，而在于：

- 可以暴露认证类型
- 可以暴露错误信息与策略差异
- 弱口令、泄露 JWT、泄露 RoleID/SecretID 时可直接产出新 token

### 3.2 `userpass` 登录

#### 请求示例

```http
POST /v1/auth/userpass/login/mitchellh HTTP/1.1
Host: vault.target.example:8200
Content-Type: application/json
Accept: application/json
Connection: close

{
  "password": "foo"
}
```

#### 典型成功响应示例

```json
{
  "lease_id": "",
  "renewable": false,
  "lease_duration": 0,
  "data": null,
  "auth": {
    "client_token": "c4f280f6-fdb2-18eb-89d3-589e2e834cdb",
    "policies": [
      "admins"
    ],
    "metadata": {
      "username": "mitchellh"
    },
    "lease_duration": 0,
    "renewable": false
  }
}
```

#### 典型失败响应示例

```json
{
  "errors": [
    "permission denied"
  ]
}
```

### 3.3 `kubernetes` 登录

Kubernetes auth 很常见，一旦 ServiceAccount JWT 泄露，会直接转化成 Vault token。

#### 请求示例

```http
POST /v1/auth/kubernetes/login HTTP/1.1
Host: vault.target.example:8200
Content-Type: application/json
Accept: application/json
Connection: close

{
  "jwt": "eyJhbGciOiJSUzI1NiIsImtpZCI6IkpXVC1LZXkifQ.eyJpc3MiOiJrdWJlcm5ldGVzL3NlcnZpY2VhY2NvdW50Iiwic3ViIjoic3lzdGVtOnNlcnZpY2VhY2NvdW50OnByb2Q6cGF5bWVudC1hcGkifQ.signature",
  "role": "payment-api"
}
```

#### 典型成功响应示例

```json
{
  "auth": {
    "client_token": "38fe9691-e623-7238-f618-c94d4e7bc674",
    "accessor": "78e87a38-84ed-2692-538f-ca8b9f400ab3",
    "policies": [
      "default",
      "payment-api"
    ],
    "metadata": {
      "role": "payment-api",
      "service_account_name": "payment-api",
      "service_account_namespace": "prod"
    },
    "lease_duration": 2764800,
    "renewable": true
  }
}
```

这类返回会直接暴露：

- 角色名
- service account 名称
- namespace
- token 的可续租性

### 3.4 `/v1/auth/token/lookup-self`

拿到任意 token 后，第一优先级通常是读取自身信息。

#### 请求示例

```http
GET /v1/auth/token/lookup-self HTTP/1.1
Host: vault.target.example:8200
X-Vault-Token: hvs.CAESIJT2KM9n2KJqg_E267EHJSY0c4NWtTRnBsNWhzUDkQZQ
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": {
    "id": "hvs.CAESIJT2KM9n2KJqg_E267EHJSY0c4NWtTRnBsNWhzUDkQZQ",
    "accessor": "bwMAYYBByYBMYs6YbWggfXdA",
    "display_name": "token",
    "policies": [
      "default",
      "devops-crud"
    ],
    "meta": {
      "team": "platform"
    },
    "ttl": 2764800,
    "renewable": true
  }
}
```

这是后续所有权限画像的起点，因为它会明确告诉你：

- 挂了哪些 policy
- 剩余 TTL
- 是否可续租
- 是否有 metadata

---

## 4. 第四轮打点：Mount、Policy 与能力判断

### 4.1 `/v1/sys/auth`

列出启用的 auth method 往往能直接暴露整套身份接入面。

#### 请求示例

```http
GET /v1/sys/auth HTTP/1.1
Host: vault.target.example:8200
X-Vault-Token: hvs.CAESIJT2KM9n2KJqg_E267EHJSY0c4NWtTRnBsNWhzUDkQZQ
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": {
    "github/": {
      "accessor": "auth_github_badd7fd0",
      "description": "",
      "local": false,
      "seal_wrap": false,
      "type": "github"
    },
    "token/": {
      "accessor": "auth_token_bd90f507",
      "description": "token based credentials",
      "local": false,
      "seal_wrap": false,
      "type": "token"
    },
    "kubernetes/": {
      "accessor": "auth_kubernetes_3fd91bc0",
      "description": "prod cluster auth",
      "type": "kubernetes"
    }
  }
}
```

这类输出尤其适合回收：

- 企业使用的 SSO 或云认证模式
- 是否存在 `userpass`、`approle`、`kubernetes`
- mount 命名与用途

### 4.2 `/v1/sys/mounts`

这条接口能更完整地列出 secrets engine。

#### 请求示例

```http
GET /v1/sys/mounts HTTP/1.1
Host: vault.target.example:8200
X-Vault-Token: hvs.CAESIJT2KM9n2KJqg_E267EHJSY0c4NWtTRnBsNWhzUDkQZQ
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": {
    "secret/": {
      "type": "kv",
      "description": "kv-v2 for applications",
      "options": {
        "version": "2"
      }
    },
    "database/": {
      "type": "database",
      "description": "dynamic db creds"
    },
    "transit/": {
      "type": "transit",
      "description": "encryption as a service"
    }
  }
}
```

单看这个返回，就已经能判断目标后续最值得联动的面：

- `database/`
- `transit/`
- `aws/`、`pki/`、`ssh/`
- 所有 `kv-v2`

### 4.3 `/v1/sys/policies/acl`

如果当前 token 权限足够，这条接口可以直接暴露 policy 名单。

#### 请求示例

```http
LIST /v1/sys/policies/acl HTTP/1.1
Host: vault.target.example:8200
X-Vault-Token: hvs.CAESIJT2KM9n2KJqg_E267EHJSY0c4NWtTRnBsNWhzUDkQZQ
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": {
    "keys": [
      "default",
      "devops-crud",
      "db-admin",
      "metrics-read"
    ]
  }
}
```

策略名本身就常常泄露：

- 团队职责
- 业务边界
- 数据库管理员范围
- 只读监控 token 存在与否

### 4.4 `/v1/sys/capabilities-self`

这是最适合做当前 token 权限画像的接口之一。

#### 请求示例

```http
POST /v1/sys/capabilities-self HTTP/1.1
Host: vault.target.example:8200
X-Vault-Token: hvs.CAESIJT2KM9n2KJqg_E267EHJSY0c4NWtTRnBsNWhzUDkQZQ
Content-Type: application/json
Accept: application/json
Connection: close

{
  "paths": [
    "secret/data/prod/payment-api",
    "secret/metadata/prod/",
    "sys/mounts",
    "sys/auth"
  ]
}
```

#### 典型响应示例

```json
{
  "capabilities": [
    "read",
    "list"
  ],
  "secret/data/prod/payment-api": [
    "read"
  ],
  "secret/metadata/prod/": [
    "list"
  ],
  "sys/mounts": [
    "read"
  ],
  "sys/auth": [
    "deny"
  ]
}
```

这类输出非常适合判断：

- 到底能不能读 secrets
- 能不能只列 metadata
- 能不能继续枚举 mount 和 auth

---

## 5. 第五轮打点：KV v2 与静态机密面

### 5.1 `KV v2` 的路径差异

Vault KV v2 最容易被误判的点是：

- 读写走 `data/`
- 列表与元数据走 `metadata/`

因此只拿到 `read` 权限不一定能列目录，只拿到 `list` 权限也不一定能读值。

### 5.2 列出 Key

#### 请求示例

```http
LIST /v1/secret/metadata/prod HTTP/1.1
Host: vault.target.example:8200
X-Vault-Token: hvs.CAESIJT2KM9n2KJqg_E267EHJSY0c4NWtTRnBsNWhzUDkQZQ
Accept: application/json
Connection: close
```

或：

```http
GET /v1/secret/metadata/prod?list=true HTTP/1.1
Host: vault.target.example:8200
X-Vault-Token: hvs.CAESIJT2KM9n2KJqg_E267EHJSY0c4NWtTRnBsNWhzUDkQZQ
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": {
    "keys": [
      "payment-api",
      "postgres",
      "redis/"
    ]
  }
}
```

### 5.3 读取 Secret 值

#### 请求示例

```http
GET /v1/secret/data/prod/payment-api HTTP/1.1
Host: vault.target.example:8200
X-Vault-Token: hvs.CAESIJT2KM9n2KJqg_E267EHJSY0c4NWtTRnBsNWhzUDkQZQ
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": {
    "data": {
      "db_username": "payment_app",
      "db_password": "Str0ngPass!2026",
      "redis_password": "redis-prod-pass"
    },
    "metadata": {
      "created_time": "2026-06-15T02:14:11.004677Z",
      "current_version": 9,
      "custom_metadata": {
        "team": "payment",
        "env": "prod"
      }
    }
  }
}
```

这类返回不只是 secrets 本身有价值，`custom_metadata` 也常常会补充：

- 团队归属
- 环境标识
- 轮换周期

### 5.4 读取 Metadata

#### 请求示例

```http
GET /v1/secret/metadata/prod/payment-api HTTP/1.1
Host: vault.target.example:8200
X-Vault-Token: hvs.CAESIJT2KM9n2KJqg_E267EHJSY0c4NWtTRnBsNWhzUDkQZQ
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "data": {
    "cas_required": false,
    "current_version": 9,
    "max_versions": 10,
    "oldest_version": 4,
    "custom_metadata": {
      "use": "API keys for prod",
      "renew-date": "2026-11-14"
    }
  }
}
```

Metadata 的价值在于：

- 即使拿不到正文值，也可能拿到敏感上下文
- 可以判断 key 是否有较长历史版本
- 可辅助识别哪些 key 最值得优先关注

### 5.5 失败响应也有价值

#### 典型失败响应示例

```json
{
  "errors": [
    "1 error occurred:\n\t* permission denied\n\n"
  ]
}
```

这类 `permission denied` 至少能说明：

- token 有效，但路径能力不足
- 当前更应继续查 `capabilities-self`、其它 mount 或其它 auth 入口

---

## 6. 第六轮打点：Policy、Token 与动态收益面

### 6.1 策略是路径控制面

Vault 的权限本质是路径型 ACL。只要看到策略内容或能力结果，就能精确判断：

- 哪些路径可 `read`
- 哪些路径可 `list`
- 哪些路径可 `create` / `update`
- 是否具备 `sudo`

### 6.2 `resultant-acl` 与 UI 能力面

在 UI 场景中，`/sys/internal/ui/resultant-acl` 会被用于整理认证信息与界面能力。如果某 token 无法访问它，UI 往往会报 warning 或错误。对打点来说，这能帮助区分：

- token 是否只是 API 可用
- token 是否足够驱动 UI 浏览全部对象

### 6.3 动态 Secrets 引擎的额外收益

如果 `sys/mounts` 暴露出以下引擎：

- `database/`
- `aws/`
- `azure/`
- `gcp/`
- `ssh/`
- `pki/`

就意味着 Vault 不再只是静态密钥仓库，而可能承担：

- 云账号临时凭据签发
- 数据库动态用户创建
- 证书签发
- SSH 凭据发放

此时一个高权限 token 的价值会远高于普通 KV 泄露。

---

## 7. 第七轮打点：指标、健康与配置外溢

### 7.1 `/v1/sys/metrics`

Vault 的 Prometheus 指标路径不是默认 `/metrics`，而是 `/v1/sys/metrics`。在默认安全配置下，这个端点需要具备 `read`、`list` 能力的 token；某些部署也会配置未认证 metrics 访问。

#### 请求示例：认证访问

```http
GET /v1/sys/metrics?format=prometheus HTTP/1.1
Host: vault.target.example:8200
X-Vault-Token: hvs.CAESIJT2KM9n2KJqg_E267EHJSY0c4NWtTRnBsNWhzUDkQZQ
Accept: text/plain
Connection: close
```

#### 典型响应示例

```text
# HELP vault_core_unsealed Gauge of whether Vault is unsealed
# TYPE vault_core_unsealed gauge
vault_core_unsealed 1
# HELP vault_route_read Secret read operations
# TYPE vault_route_read counter
vault_route_read{mount="secret/"} 4821
```

一旦指标端点可读，攻击者通常还能回收：

- 是否 sealed
- 读写压力
- mount 访问热点
- audit device 错误指标

### 7.2 指标端点的风险边界

如果开启了未认证 metrics 访问，风险不只是“能看几条性能指标”，而是：

- 能快速确认节点角色与健康
- 能看出哪些 mount 最活跃
- 可能为攻击时机选择提供依据

### 7.3 `?help=1`

Vault API 允许对路径追加 `?help=1` 获取帮助与 OpenAPI 片段，前提是当前 token 对路径有访问权。

#### 请求示例

```http
GET /v1/secret/data/prod/payment-api?help=1 HTTP/1.1
Host: vault.target.example:8200
X-Vault-Token: hvs.CAESIJT2KM9n2KJqg_E267EHJSY0c4NWtTRnBsNWhzUDkQZQ
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "help": "Write, Read, and Delete data in the Key-Value Store.",
  "openapi": {
    "openapi": "3.0.2"
  }
}
```

这类返回适合辅助判断路径真实含义，尤其在自定义 mount 很多的环境里。

---

## 8. 高危错误部署场景

### 8.1 未初始化 Vault 暴露

如果 `/sys/init` 明确返回 `initialized: false`，说明目标尚未初始化。这通常意味着：

- 服务处于裸露部署期
- 外部攻击者能持续探测初始化窗口

### 8.2 已封印但对外暴露

`sealed=true` 并不等于安全。对攻击者来说，这依旧能暴露：

- 版本
- seal 类型
- threshold 与 shares 数
- cluster_name 与 cluster_id
- storage_type

这些结构化信息足够用于资产归类与后续精准打点。

### 8.3 UI 内部接口过宽可见

如果未认证就能看到：

- mount 列表
- 默认登录方式
- feature flags

就说明目标至少存在 UI 暴露和内部枚举面的情报泄露问题。

### 8.4 客户端 Token 泄露的实际来源

Vault 的 token 最常见的非 Vault 漏洞来源通常是：

- 环境变量 `VAULT_TOKEN`
- CI/CD Secret
- shell 历史
- sidecar 或 agent 注入文件
- 浏览器或前端调试痕迹
- 应用日志中的请求头

一旦拿到任意 token，`lookup-self`、`capabilities-self`、`sys/internal/ui/mounts` 和 `secret/metadata/*` 往往是最快的放大路径。

---

## 9. 蓝队检测与处置

### 9.1 反向代理与 Web 访问日志

应重点识别对以下路径的连续访问：

- `/v1/sys/health`
- `/v1/sys/seal-status`
- `/v1/sys/init`
- `/v1/sys/internal/ui/mounts`
- `/v1/sys/internal/ui/default-auth-methods`
- `/v1/sys/auth`
- `/v1/sys/mounts`
- `/v1/auth/token/lookup-self`
- `/v1/sys/capabilities-self`
- `/v1/secret/metadata/*`
- `/v1/secret/data/*`
- `/v1/sys/metrics`

#### 日志示例

```text
10.10.10.21 - - [15/Jun/2026:12:31:11 +0800] "GET /v1/sys/health HTTP/1.1" 200 364 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [15/Jun/2026:12:31:12 +0800] "GET /v1/sys/internal/ui/mounts HTTP/1.1" 200 214 "-" "python-requests/2.32.3"
```

```text
10.10.10.21 - - [15/Jun/2026:12:31:16 +0800] "LIST /v1/secret/metadata/prod HTTP/1.1" 200 92 "-" "python-requests/2.32.3"
```

第三类日志通常说明访问者已经从“识别 Vault”进入到“枚举 secrets 路径”的阶段。

### 9.2 Vault 审计日志

Vault 审计设备会记录请求与响应两类 JSON 对象，且可通过 `request.id` 将一对事件关联起来。

#### 请求日志示例

```json
{
  "time": "2026-06-15T12:31:16.292517Z",
  "type": "request",
  "auth": {
    "client_token": "hmac-sha256:114e72599d41f7d14c7fc2ba495757195e98d0947405421f7b3be37b94e7f363",
    "accessor": "hmac-sha256:23e9a5bc2a3538252c1d1e8d686267a3ff81730db0da31530863a2760d6771c8",
    "display_name": "token",
    "policies": [
      "default",
      "devops-crud"
    ]
  },
  "request": {
    "id": "19073d8c-7567-7ee9-1144-c8ce601ec79d",
    "operation": "read",
    "mount_type": "kv",
    "path": "secret/data/prod/payment-api",
    "remote_address": "10.10.10.21",
    "remote_port": 37312
  }
}
```

#### 响应日志示例

```json
{
  "time": "2026-06-15T12:31:16.292639Z",
  "type": "response",
  "request": {
    "id": "19073d8c-7567-7ee9-1144-c8ce601ec79d",
    "path": "secret/data/prod/payment-api"
  },
  "response": {
    "data": {
      "metadata": {
        "current_version": 9
      }
    }
  }
}
```

蓝队在调查时应重点关注：

- `type`
- `request.id`
- `request.operation`
- `request.path`
- `request.remote_address`
- `auth.display_name`
- `auth.policies`

### 9.3 审计日志的特殊点

Vault 默认会对大多数字符串字段做 HMAC，而不是直接明文记录。优势是：

- 敏感值不会直接出现在审计日志中

但这也意味着：

- 调查人员需要理解哪些字段被 HMAC
- 需要借助 `/sys/audit-hash` 之类的能力做对比验证

### 9.4 Telemetry 指标

对于检测 Vault 被打点或被滥用，至少应对以下几类指标建立基线：

- `vault.core.unsealed`
- `vault.route.*`
- `vault.audit.*`
- 与认证、策略、租约相关的计数器

如果某个来源短时间内显著增加：

- `sys/health`
- `lookup-self`
- `secret/data/*`
- `secret/metadata/*`

相关请求速率，就应视为高优先级调查事件。

### 9.5 处置建议

发现 Vault 管理面被打点后，应优先做：

1. 收敛 `8200` 暴露范围，禁止低信任网络直接访问 UI 与 API
2. 立即排查是否有客户端 `VAULT_TOKEN` 泄露
3. 审核 `userpass`、`approle`、`kubernetes`、`ldap` 等 auth method 的实际暴露面
4. 审核 `KV v2` 的 `metadata` 与 `data` 路径策略是否过宽
5. 检查 `/v1/sys/metrics` 是否被未授权访问
6. 检查审计设备是否完整启用且未阻塞

长期建议：

- 仅通过可信网络和 TLS 暴露 Vault
- 对 UI 使用最小可见性与最小 listing 策略
- 不在环境变量、日志、脚本中持久保存高权限 token
- 对 `lookup-self`、`capabilities-self`、`sys/mounts`、`sys/auth` 和 secrets 读取建立独立告警
- 审查所有 namespace 的默认与备用登录方式

---

## 10. 复盘清单

### 10.1 红队侧

- 是否确认了目标是否为 Vault，以及是否初始化、是否解封
- 是否记录了 `health` 状态码语义
- 是否探测了 `sys/internal/ui/*` 系列未认证接口
- 是否完成了 `lookup-self` 与 `capabilities-self` 权限画像
- 是否区分了 `KV v2` 的 `data/` 与 `metadata/` 路径
- 是否验证了 `metrics`、`policy`、`auth` 与 `mount` 面

### 10.2 蓝队侧

- 是否能区分常规健康检查与异常批量枚举
- 是否能识别对 `secret/metadata/*` 的批量列表请求
- 是否能把审计日志中的 request/response 通过 `request.id` 关联
- 是否知道哪些 UI 内部接口在未认证下也可能返回有效情报

### 10.3 应急侧

- 是否确认是否有 Token 已泄露
- 是否确认 secrets engine 中是否已有敏感数据被读取
- 是否确认 `/sys/metrics`、`/sys/internal/ui/*` 是否被异常访问
- 是否完成高权限 Token、Auth Method 凭据与相关应用凭据轮换

---

## 11. 总结

`Vault` 的真正风险，不只是“一个 secrets API 可以访问”，而在于它把：

- 认证方式
- 路径型权限
- 机密数据
- 动态凭据
- 审计与指标
- UI 与控制面

统一收敛到了同一条管理平面上。

对打点来说，更值得沉淀的方法学是：

- 先用 `health`、`seal-status`、`init` 判断节点状态
- 再通过 UI 内部接口与 mount 可见性建立整体画像
- 再用 `lookup-self`、`capabilities-self` 和 `sys/*` 判断权限边界
- 最后集中验证 `KV v2`、动态引擎、指标面与审计痕迹

只有把这些面串起来，才能把“Vault 暴露”真正转化成结构化攻击价值判断。

---

## 参考资料

- [HTTP API](https://developer.hashicorp.com/vault/api-docs)
- [Learn to use the Vault HTTP API](https://developer.hashicorp.com/vault/tutorials/get-started/learn-http-api)
- [/sys/health](https://developer.hashicorp.com/vault/api-docs/system/health)
- [/sys/seal-status](https://developer.hashicorp.com/vault/api-docs/system/seal-status)
- [/sys/init](https://developer.hashicorp.com/vault/api-docs/system/init)
- [/sys/auth](https://developer.hashicorp.com/vault/api-docs/system/auth)
- [/sys/internal/ui/mounts](https://developer.hashicorp.com/vault/api-docs/system/internal-ui-mounts)
- [/sys/internal/ui/feature-flags](https://developer.hashicorp.com/vault/api-docs/system/internal-ui-feature)
- [/sys/internal/ui/default-auth-methods](https://developer.hashicorp.com/vault/api-docs/system/internal-ui-default-auth-methods)
- [Vault UI](https://developer.hashicorp.com/vault/docs/ui)
- [Vault UI Configuration](https://developer.hashicorp.com/vault/docs/configuration/ui)
- [Policies](https://developer.hashicorp.com/vault/docs/concepts/policies)
- [/sys/capabilities-self](https://developer.hashicorp.com/vault/api-docs/system/capabilities-self)
- [KV secrets engine - version 2 (API)](https://developer.hashicorp.com/vault/api-docs/secret/kv/kv-v2)
- [KV secrets engine - version 2](https://developer.hashicorp.com/vault/docs/secrets/kv/kv-v2)
- [Kubernetes auth method](https://developer.hashicorp.com/vault/docs/auth/kubernetes)
- [Kubernetes auth method (API)](https://developer.hashicorp.com/vault/api-docs/auth/kubernetes)
- [Userpass auth method](https://developer.hashicorp.com/vault/docs/auth/userpass)
- [Audit Devices](https://developer.hashicorp.com/vault/docs/audit)
- [Audit log entry schema](https://developer.hashicorp.com/vault/docs/audit/schema)
- [Audit and Operational Log Details](https://support.hashicorp.com/hc/en-us/articles/360000995548-Audit-and-Operational-Log-Details)
- [telemetry stanza](https://developer.hashicorp.com/vault/docs/configuration/telemetry)
- [All Vault telemetry metrics](https://developer.hashicorp.com/vault/docs/internals/telemetry/metrics/all)
- [Seal/Unseal](https://developer.hashicorp.com/vault/docs/concepts/seal)
