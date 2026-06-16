---
title: "Harbor镜像仓库管理面打点与API利用技术"
date: 2026-06-13T14:18:05+08:00
draft: false
weight: 51
description: "围绕Harbor镜像仓库相关攻击面与利用路径，分析打点识别、接口枚举、风险链条、日志痕迹与防守处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "镜像仓库", "Harbor"]
---

# Harbor镜像仓库管理面打点与API利用技术

`Harbor` 是云原生环境中极其常见的私有镜像仓库与制品安全平台。它承载的并不只是 Docker 镜像下载，而是整条镜像供应链中的关键控制点，包括：

- 项目与仓库划分
- Artifact、Tag 与 Manifest 管理
- Vulnerability Scan 结果
- Replication 与 Proxy Cache
- Robot Account 与细粒度权限
- Registry v2 接口

一旦 Harbor 被暴露到低信任网络、公共项目配置过宽、默认或弱口令未收敛、API Explorer 可被直接访问，攻击者往往可以在打点阶段迅速获得：

- 私有组织与项目命名
- 镜像仓库名称与 tag 体系
- Artifact digest、镜像分层与制品元数据
- 漏洞扫描概况
- 机器人账号与权限模型线索
- 通过 Registry API 验证拉取链与镜像存在性

本文只聚焦打点与漏洞利用侧，重点记录：

1. 如何识别 Harbor 管理面与 Registry 面
2. 匿名与弱鉴权状态下能枚举哪些对象
3. 如何通过 Harbor v2.0 API 精确枚举 project / repository / artifact
4. 如何结合 `devcenter`、`robot account`、扫描结果和历史高危面扩大收益
5. 蓝队如何从访问日志与 Harbor 自身日志中识别这类打点

---

## 0. 攻击面概览

### 0.1 常见路径

首轮至少应枚举：

- `/`
- `/api/v2.0/health`
- `/api/v2.0/search?q=`
- `/api/v2.0/projects`
- `/api/v2.0/projects/{project}/repositories`
- `/api/v2.0/projects/{project}/repositories/{repo}/artifacts`
- `/api/v2.0/projects/{project}/repositories/{repo}/artifacts/{reference}`
- `/api/v2.0/robots`
- `/devcenter`
- `/v2/`
- `/service/token`

如果目标较老，还可能出现：

- `/api/`
- `/api/users`
- 老版本用户注册或管理接口

### 0.2 打点收益优先级

以“最快转化成真实攻击价值”为标准，Harbor 常见打点收益可排列为：

1. 确认版本、产品特征和匿名能力
2. 枚举 public project、repository 与 artifact
3. 回收 digest、tag、scan 概况、镜像命名体系
4. 识别 Registry v2 与 token 交换链
5. 判断 `devcenter`、robot 账号、高权限 API 与历史漏洞面

---

## 1. 第一轮打点：确认是否为 Harbor

### 1.1 登录页识别

#### 请求示例

```http
GET / HTTP/1.1
Host: harbor.target.example
User-Agent: Mozilla/5.0
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Set-Cookie: sid=2d2f4ce5d7f2465db4c0b4f39a6d4d4b; Path=/; HttpOnly
```

页面正文与静态资源中常见特征包括：

- `Harbor`
- `Harbor Portal`
- `Project`
- `Repositories`

在做了白标或反向代理改写的环境中，Cookie、前端接口路径和后续 API 返回结构往往仍能把它识别出来。

### 1.2 健康检查接口

Harbor API 文档中明确给出了不需要认证的健康检查接口，这也是首轮识别最稳定的请求之一。

#### 请求示例

```http
GET /api/v2.0/health HTTP/1.1
Host: harbor.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "status": "healthy",
  "components": [
    {
      "name": "core",
      "status": "healthy"
    },
    {
      "name": "database",
      "status": "healthy"
    },
    {
      "name": "registry",
      "status": "healthy"
    }
  ]
}
```

这条响应一旦出现，就直接给出了非常高价值的信息：

- 目标明确是 Harbor v2 API 风格
- 关键组件存活
- 后续可继续测 `search`、`projects`、`registry v2` 链

### 1.3 Swagger / API Explorer

Harbor 官方文档说明，实例通常提供 Swagger UI 形式的 API Explorer，常见入口为 `/devcenter`。

#### 请求示例

```http
GET /devcenter HTTP/1.1
Host: harbor.target.example
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
```

如果该页面直接可见，意味着：

- 管理面暴露了 API Explorer
- 后续可直接观察可用端点、请求结构、鉴权方式

---

## 2. 第二轮打点：匿名与公共项目枚举

### 2.1 Search 接口

Harbor API 规范明确指出，`/api/v2.0/search?q=` 用于搜索项目和仓库，并返回 public 或当前用户可见对象。这是极具打点价值的一个入口。

#### 请求示例

```http
GET /api/v2.0/search?q=proj HTTP/1.1
Host: harbor.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "project": [
    {
      "project_id": 3,
      "name": "project-prod",
      "public": true
    }
  ],
  "repository": [
    {
      "repository_name": "project-prod/payment-api",
      "project_name": "project-prod",
      "project_public": true,
      "pull_count": 1842,
      "artifact_count": 37
    }
  ],
  "chart": []
}
```

这类响应的价值包括：

- 暴露 project 命名与仓库命名
- 判断项目是否 public
- 看到 pull_count / artifact_count 这类活跃度指标

### 2.2 枚举项目

#### 请求示例

```http
GET /api/v2.0/projects?page=1&page_size=20 HTTP/1.1
Host: harbor.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "project_id": 1,
    "name": "library",
    "public": true,
    "repo_count": 12,
    "metadata": {
      "public": "true",
      "enable_content_trust": "false",
      "reuse_sys_cve_allowlist": "true"
    }
  },
  {
    "project_id": 7,
    "name": "payment",
    "public": true,
    "repo_count": 5,
    "metadata": {
      "public": "true"
    }
  }
]
```

这里能直接获得：

- `project_id`
- 项目名
- 仓库数量
- 关键 metadata

如果 public 项目很多，后续应优先按项目逐个枚举 repository 和 artifact。

### 2.3 项目详情

#### 请求示例

```http
GET /api/v2.0/projects/payment HTTP/1.1
Host: harbor.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "project_id": 7,
  "name": "payment",
  "public": true,
  "owner_name": "admin",
  "metadata": {
    "public": "true",
    "auto_scan": "true",
    "severity": "medium"
  }
}
```

这条响应中的高价值字段包括：

- `owner_name`
- `auto_scan`
- `severity`

它们会帮助你判断：

- 管理者命名
- 是否启用了自动扫描
- 后续 artifact 查询里是否更可能拿到 scan 信息

---

## 3. 第三轮打点：Repository 与 Artifact 精确枚举

### 3.1 枚举项目下的仓库

#### 请求示例

```http
GET /api/v2.0/projects/payment/repositories?page=1&page_size=20 HTTP/1.1
Host: harbor.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "id": 51,
    "name": "payment/payment-api",
    "project_id": 7,
    "artifact_count": 14,
    "pull_count": 839,
    "creation_time": "2026-04-11T09:17:22.154Z",
    "update_time": "2026-06-12T09:12:44.010Z"
  },
  {
    "id": 52,
    "name": "payment/payment-worker",
    "project_id": 7,
    "artifact_count": 8,
    "pull_count": 402
  }
]
```

这类响应非常适合用来做研发资产还原：

- 服务名
- 组件名
- 拉取频次
- 更新时间

像 `payment-api`、`payment-worker` 这类命名，往往已经足以帮助你定位后续代码仓、CI 流水线或部署目标。

### 3.2 枚举 Artifact

Harbor Swagger 与 issue 讨论都说明，Artifact 列表是镜像、Tag、Digest、扫描概况等核心信息的聚合入口。

#### 请求示例

```http
GET /api/v2.0/projects/payment/repositories/payment-api/artifacts?page=1&page_size=10&with_tag=true&with_scan_overview=true HTTP/1.1
Host: harbor.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "id": 101,
    "digest": "sha256:19a79828ca2e505eaee0ff38c2f3fd9901f4826737295157cc5212b7a372cd2b",
    "project_id": 7,
    "repository_id": 51,
    "media_type": "application/vnd.docker.distribution.manifest.v2+json",
    "manifest_media_type": "application/vnd.docker.distribution.manifest.v2+json",
    "push_time": "2026-06-11T08:21:45.441Z",
    "tags": [
      {
        "name": "2.14.7",
        "immutable": false,
        "pull_time": "2026-06-12T11:40:26.359Z"
      }
    ],
    "scan_overview": {
      "application/vnd.scanner.adapter.vuln.report.harbor+json; version=1.0": {
        "scan_status": "Success",
        "severity": "High",
        "summary": {
          "total": 66,
          "summary": {
            "High": 21,
            "Medium": 32,
            "Low": 13
          }
        }
      }
    }
  }
]
```

这条响应的价值非常高，因为它同时给出了：

- digest
- tag
- push / pull 时间
- 扫描结果
- 严重程度

对打点而言，它的用途包括：

- 识别当前生产版本
- 判断漏洞扫描是否启用
- 判断哪些镜像值得优先分析

### 3.3 获取单个 Artifact

#### 请求示例

```http
GET /api/v2.0/projects/payment/repositories/payment-api/artifacts/sha256:19a79828ca2e505eaee0ff38c2f3fd9901f4826737295157cc5212b7a372cd2b?with_tag=true&with_scan_overview=true HTTP/1.1
Host: harbor.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "id": 101,
  "digest": "sha256:19a79828ca2e505eaee0ff38c2f3fd9901f4826737295157cc5212b7a372cd2b",
  "tags": [
    {
      "name": "2.14.7",
      "immutable": false
    }
  ],
  "addition_links": {
    "vulnerabilities": {
      "href": "/api/v2.0/projects/payment/repositories/payment-api/artifacts/sha256:19a79828ca2e505eaee0ff38c2f3fd9901f4826737295157cc5212b7a372cd2b/additions/vulnerabilities"
    }
  }
}
```

这里一个非常重要的打点点位是 `addition_links`，它会直接告诉你：

- 这个 artifact 是否暴露了附加信息入口
- 后续是否值得继续探测 vulnerabilities、build history、labels 等附加资源

### 3.4 获取漏洞附加信息

GitHub issue 讨论明确指出，调用 `/additions/vulnerabilities` 对 RBAC 有特定要求，且和普通 list 权限并不等价。对打点来说，这一点非常重要，因为它可以帮助判断当前身份的真实权限边界。

#### 请求示例

```http
GET /api/v2.0/projects/payment/repositories/payment-api/artifacts/sha256:19a79828ca2e505eaee0ff38c2f3fd9901f4826737295157cc5212b7a372cd2b/additions/vulnerabilities HTTP/1.1
Host: harbor.target.example
Accept: application/json
Connection: close
```

#### 典型成功响应示例

```json
{
  "scanner": {
    "name": "Trivy"
  },
  "severity": "High",
  "vulnerabilities": [
    {
      "id": "CVE-2025-0001",
      "package": "openssl",
      "version": "3.0.13-r0",
      "severity": "High"
    }
  ]
}
```

#### 典型失败响应示例

```json
{
  "errors": [
    {
      "code": "FORBIDDEN",
      "message": "forbidden"
    }
  ]
}
```

如果返回 `FORBIDDEN`，同样有价值，因为它能帮助你确认：

- 当前身份对 artifact-addition 资源没有 `read`
- 目标并不是完全匿名泄露，而是存在精细 RBAC

---

## 4. 第四轮打点：Registry v2、Token 交换与镜像存在性验证

Harbor 的另一个高价值面不是 Web UI，而是 Docker Registry v2 协议本身。真实环境里，很多攻击并不先从 UI 开始，而是直接从 `/v2/` 和 token 服务判断镜像拉取链。

### 4.1 探测 Registry v2

#### 请求示例

```http
GET /v2/ HTTP/1.1
Host: harbor.target.example
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 401 Unauthorized
Docker-Distribution-Api-Version: registry/2.0
Www-Authenticate: Bearer realm="https://harbor.target.example/service/token",service="harbor-registry"
```

这条响应几乎是 Registry 面最重要的打点信号之一，因为它清楚说明：

- 目标暴露了 Docker Registry v2
- 鉴权方式为 Bearer token exchange
- token 服务地址是什么

### 4.2 镜像存在性验证

在 public project 或可匿名拉取配置下，攻击者通常会直接试探 manifest。

#### 请求示例

```http
HEAD /v2/payment/payment-api/manifests/2.14.7 HTTP/1.1
Host: harbor.target.example
Accept: application/vnd.docker.distribution.manifest.v2+json
Connection: close
```

#### 典型失败响应示例

```json
{
  "errors": [
    {
      "code": "UNAUTHORIZED",
      "message": "authorize header needed to send HEAD to repository"
    }
  ]
}
```

#### Harbor 日志中的典型对应

```text
DEBUG unauthorized security context generated for request HEAD /v2/payment/payment-api/manifests/2.14.7
DEBUG URL for token request: /service/token?scope=repository%3Apayment%2Fpayment-api%3Apull&service=harbor-registry
```

这组请求和日志响应很值得在文章中保留，因为它清楚体现了：

- 客户端在试探 repository 是否存在
- Harbor 如何把请求引导到 token service
- scope 参数如何暴露真实 repository 名和 pull 权限模型

### 4.3 Token Service 请求

#### 请求示例

```http
GET /service/token?scope=repository:payment/payment-api:pull&service=harbor-registry HTTP/1.1
Host: harbor.target.example
Connection: close
```

#### 典型失败响应示例

```json
{
  "errors": [
    {
      "code": "UNAUTHORIZED",
      "message": "unauthorized"
    }
  ]
}
```

即便失败，这条请求仍然很有打点价值，因为它会帮助你验证：

- token exchange 是否启用
- `scope` 结构如何拼接
- repository 名称是否准确

---

## 5. 第五轮打点：Robot Account、Admin API 与历史高危面

### 5.1 Robot Account 的打点价值

Harbor 的 Robot Account 机制是自动化集成最常见的授权对象之一。它的价值不在于“能不能立刻拿到”，而在于一旦在别处拿到某个 robot 凭据，后续可以迅速转成 Harbor API 的稳定访问能力。

Dynatrace 集成文档和 Harbor issue 讨论都说明，Robot Account 往往被授予：

- 项目级 Artifact / Repository list/read
- 审计日志访问
- 漏洞扫描读取

因此在打点时，凡是出现以下线索都应高优先级记录：

- `robot$` 风格用户名
- CI 配置中的 robot 密钥
- 扫描集成、镜像同步、自动部署配置中的 Harbor token

### 5.2 Robot API 探测

#### 请求示例

```http
GET /api/v2.0/robots HTTP/1.1
Host: harbor.target.example
Authorization: Basic cm9ib3QkY2ljZDpwYXNzd29yZA==
Accept: application/json
Connection: close
```

#### 典型成功响应示例

```json
[
  {
    "id": 5,
    "name": "robot$ci-reader",
    "level": "system",
    "duration": 30,
    "editable": true
  }
]
```

#### 典型失败响应示例

```json
{
  "errors": [
    {
      "code": "FORBIDDEN",
      "message": "forbidden"
    }
  ]
}
```

这类响应可以帮助你确认：

- 当前 robot 凭据是否有效
- 是 project 级还是 system 级
- 是否存在继续扩大收益的管理 API 面

### 5.3 历史高危面：权限提升与 BOLA

Harbor 历史上有多次值得在打点阶段重点关注的高危 API 面：

- `CVE-2019-16097`
  某些版本允许在默认配置下完成从普通用户到管理员的权限提升
- `CVE-2024-22278`
  Unit 42 披露的 BOLA 问题，允许 Maintainer 越界修改 project metadata
- 早期 API 问题中的 Mass Assignment、Robot 账号越权等

这类历史问题对当前打点的意义，不是盲目直接利用，而是：

- 一旦从 `/api/v2.0/health`、UI 或 banner 确认版本范围
- 就应优先判断目标是否落在已知风险区间
- 并优先审计 project metadata、robot 权限和 admin 注册相关接口

### 5.4 旧版用户与注册接口

一些历史 Harbor 版本中，用户注册与用户 API 曾出现过高风险授权问题。对打点来说，这意味着：

- 如果目标版本偏老
- 又暴露了公开注册或旧接口
- 就应提升优先级去核查用户创建与权限字段边界

---

## 6. 打点流程建议

比起一开始就直接尝试高危写操作，更稳的 Harbor 打点流程通常如下：

### 6.1 第一轮：识别与健康检查

优先请求：

- `/`
- `/api/v2.0/health`
- `/devcenter`
- `/v2/`

目标：

- 确认是否为 Harbor
- 确认 core/registry 是否在线
- 判断 API Explorer 与 Registry 面是否暴露

### 6.2 第二轮：匿名搜索与项目枚举

优先请求：

- `/api/v2.0/search?q=`
- `/api/v2.0/projects`
- `/api/v2.0/projects/{project}`

目标：

- 找 public project
- 还原命名体系
- 确认扫描与 metadata 线索

### 6.3 第三轮：Repository 与 Artifact

优先请求：

- `/api/v2.0/projects/{project}/repositories`
- `/api/v2.0/projects/{project}/repositories/{repo}/artifacts`
- `/api/v2.0/projects/{project}/repositories/{repo}/artifacts/{reference}`

目标：

- 回收 tag、digest、push_time、scan_overview
- 确认高价值镜像和版本

### 6.4 第四轮：Registry 与 Token 交换

优先请求：

- `/v2/`
- `/v2/<repo>/manifests/<tag>`
- `/service/token?...`

目标：

- 验证镜像存在性
- 确认 Bearer 流程与 scope 结构

### 6.5 第五轮：高权限与历史问题

在已有身份或弱口令成立后继续：

- `/api/v2.0/robots`
- Admin 相关 API
- project metadata
- 历史高危面对应接口

目标：

- 判断是否能从读面扩展到管理面

---

## 7. 蓝队检测与处置

### 7.1 访问日志中的高价值信号

应重点识别：

- 对 `/api/v2.0/health` 的探测
- 对 `/api/v2.0/search`、`/projects`、`/repositories`、`/artifacts` 的批量读取
- 对 `/devcenter` 的访问
- 对 `/v2/` 与 `/service/token` 的连续探测
- 对 `robots`、metadata 或其他管理接口的请求

#### 日志示例

```text
10.10.10.21 - - [13/Jun/2026:01:12:11 +0800] "GET /api/v2.0/health HTTP/1.1" 200 211 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [13/Jun/2026:01:12:18 +0800] "GET /api/v2.0/projects?page=1&page_size=20 HTTP/1.1" 200 1324 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [13/Jun/2026:01:12:26 +0800] "GET /api/v2.0/projects/payment/repositories/payment-api/artifacts?page=1&page_size=10&with_tag=true&with_scan_overview=true HTTP/1.1" 200 4791 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [13/Jun/2026:01:12:33 +0800] "HEAD /v2/payment/payment-api/manifests/2.14.7 HTTP/1.1" 401 156 "-" "docker/27.1"
```

这几类请求串在一起时，已经非常接近标准 Harbor 打点链。

### 7.2 Harbor 自身日志中的调查点

Harbor Core / Registry 日志通常会留下以下高价值线索：

- `unauthorized security context generated`
- `/service/token` 请求
- artifact info middleware 命中的 repository 路径
- admin / robot 相关 API 调用

#### 日志示例

```text
DEBUG attach request id 99658425-9ec7-4a61-81ad-c6bce3fd98ed to the logger for the request HEAD /v2/payment/payment-api/manifests/2.14.7
```

```text
DEBUG unauthorized security context generated for request GET /service/token
```

```text
DEBUG URL for token request: /service/token?scope=repository%3Apayment%2Fpayment-api%3Apull&service=harbor-registry
```

这类日志非常适合帮助蓝队把：

- 外层 HTTP 请求
- Registry 认证流程
- 实际被探测的 repository

串成完整时间线。

### 7.3 处置建议

发现 Harbor 正在被打点后，应优先做：

1. 收紧 public project 与匿名搜索范围
2. 审核 `search`、`projects`、`repositories`、`artifacts` 的匿名返回范围
3. 检查 `/devcenter` 是否可被未授权访问
4. 检查 Robot Account 使用情况与权限边界
5. 审核是否存在默认口令、弱口令或历史高危版本
6. 检查是否已有私有镜像、tag 或扫描数据被批量枚举

长期建议：

- 不向低信任网络直接暴露 Harbor 管理面
- 尽量关闭或限制匿名访问
- 为高价值项目关闭 public 暴露
- 对 `/v2/` 和 `/service/token` 建立异常访问检测
- 及时修复已知的 Harbor 权限与 API 相关安全问题

---

## 8. 复盘清单

### 8.1 红队侧

- 是否确认了 Harbor 版本风格与 `v2.0` API 面
- 是否记录了 project、repository、artifact 的层级关系
- 是否回收了 digest、tag、scan_overview
- 是否验证了 Registry v2 与 token 交换流程
- 是否记录了 robot 账号与高权限 API 的边界响应

### 8.2 蓝队侧

- 是否能识别匿名或低权限对 artifact 的批量读取
- 是否能识别 `/v2/` 与 `/service/token` 的组合探测
- 是否能从 Harbor 日志中反推出被探测的 repository
- 是否能对 `devcenter`、robot、metadata 等高敏感面单独告警

### 8.3 应急侧

- 是否确认 public project 与匿名浏览是否超出业务需要
- 是否确认镜像、tag、scan 数据是否被批量回收
- 是否复核了默认账户、robot 账号与高权限 API
- 是否完成版本与历史高危问题核查

---

## 9. 总结

`Harbor` 的真正风险不只是镜像能不能被拉取，而是它往往把项目、镜像、digest、扫描结果、token 交换链和自动化账户全部集中暴露在同一套管理面和 API 之下。

对打点来说，更值得沉淀的方法学是：

- 先识别产品与健康状态
- 再枚举 project、repository、artifact
- 再还原 tag、digest、scan 与 registry token 流程
- 最后判断是否存在 robot、高权限 API 或历史高危面

这种路线能把一个“镜像仓库站点”迅速转化成可执行的攻击画像。

---

## 参考资料

- [Harbor API Reference](https://github.com/goharbor/harbor/blob/main/api/v2.0/swagger.yaml)
- [View the Harbor REST API](https://goharbor.io/docs/2.5.0/working-with-projects/using-api-explorer/)
- [Harbor API v2.0 Reference Overview](https://deepwiki.com/goharbor/harbor/4-api-reference)
- [Unit 42: CVE-2024-22278 Harbor BOLA](https://unit42.paloaltonetworks.com/bola-vulnerability-impacts-container-registry-harbor/)
- [Unit 42: CVE-2019-16097 Harbor Privilege Escalation](https://unit42.paloaltonetworks.com/critical-vulnerability-in-harbor-enables-privilege-escalation-from-zero-to-admin-cve-2019-16097/)
- [Harbor issue: robot account and vulnerability API](https://github.com/goharbor/harbor/issues/17703)
