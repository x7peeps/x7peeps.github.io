---
title: "GitLab管理面与API打点利用技术"
date: 2026-06-13T14:08:59+08:00
draft: false
weight: 50
description: "围绕GitLab管理面与API打点相关攻击面与利用路径，分析打点识别、接口枚举、风险链条、日志痕迹与防守处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "DevOps平台", "GitLab", "API"]
---

# GitLab管理面与API打点利用技术

`GitLab` 在渗透测试里不是一个单纯的代码托管站点，而是一个集代码仓库、CI/CD、制品、Snippet、Wiki、Package Registry、Container Registry 与 GraphQL/REST API 于一体的研发管理面。它的攻击价值在于，只要暴露面配置稍有偏差，攻击者就可能在尚未进入内网深处之前，先从 GitLab 上获得：

- 公开项目与群组结构
- 用户名与命名空间
- 仓库树、源码文件与配置文件
- Snippet、Issue、Merge Request 元数据
- 公共 CI 作业、Artifact、容器镜像与包管理线索
- GraphQL 与 REST API 暴露出的更多资产模型

这类目标非常适合放在 `04 渗透攻击` 目录，因为它解决的不是“横向后怎么提权”，而是：

- 怎么识别 GitLab
- 怎么从公开或弱鉴权 API 快速建立资产画像
- 怎么把 API 返回结果转成真正的打点列表
- 怎么从公开项目、公开仓库、公共 Job 和 Snippet 中回收高价值线索

本文重点整理：

1. 如何识别 GitLab 管理面与 API 面
2. 匿名与弱鉴权条件下能拿到什么
3. 如何通过 `REST API` 与 `GraphQL` 做精确打点
4. 如何回收仓库文件、公共 Job、Artifact 与用户信息
5. 蓝队如何从 Web/API 日志中识别这类打点

---

## 0. 攻击面概览

### 0.1 常见路径

首轮至少应枚举：

- `/users/sign_in`
- `/help`
- `/-/health`
- `/api/v4/version`
- `/api/v4/projects`
- `/api/v4/groups`
- `/api/v4/users`
- `/api/v4/snippets`
- `/api/v4/projects/:id/repository/tree`
- `/api/v4/projects/:id/repository/files/:file_path/raw`
- `/api/graphql`
- `/-/graphql-explorer`

如果目标是自建实例，还应额外观察：

- `/explore`
- `/public`
- `/admin`
- `/assets/webpack/`

### 0.2 打点收益优先级

按“最快转化为真实攻击价值”的顺序，GitLab 常见收益可排列为：

1. 确认版本、实例类型和 API 面
2. 枚举公共项目、群组和命名空间
3. 枚举公共仓库树、源码文件、CI 配置和 Snippet
4. 回收 Job、Artifact、Package、Registry 相关线索
5. 判断 GraphQL、历史 API 暴露或弱鉴权点是否可进一步扩大收益

---

## 1. 第一轮打点：确认是否为 GitLab

### 1.1 登录页识别

#### 请求示例

```http
GET /users/sign_in HTTP/1.1
Host: git.target.example
User-Agent: Mozilla/5.0
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Set-Cookie: _gitlab_session=xxxxxxxx; path=/; secure; HttpOnly
X-Request-Id: 01J0ABCXYZ12345
```

正文中常见特征包括：

- `GitLab`
- `Sign in · GitLab`
- `_gitlab_session`

这些特征足以确认目标为 GitLab Web 管理面。

### 1.2 版本探测

#### 请求示例

```http
GET /api/v4/version HTTP/1.1
Host: git.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "version": "17.1.0",
  "revision": "9f14cb65f65"
}
```

这条响应对打点非常关键，因为它能直接帮助判断：

- 是否为自建 GitLab
- 是否命中某些历史安全问题的版本区间
- 后续更适合走 REST 还是 GraphQL 或特定功能面

### 1.3 API 根路径与返回码

GitLab REST API 的根路径固定为 `/api/v4`，请求返回码本身也能提供很多信息。

#### 请求示例

```http
GET /api/v4/projects HTTP/1.1
Host: git.target.example
Accept: application/json
Connection: close
```

#### 典型匿名响应示例

```json
[
  {
    "id": 37,
    "name": "platform-api",
    "path_with_namespace": "corp/platform-api",
    "visibility": "public",
    "web_url": "https://git.target.example/corp/platform-api"
  }
]
```

#### 典型失败响应示例

```json
{
  "message": "401 Unauthorized"
}
```

这两种返回都很有价值：

- `200` 说明匿名可以直接列举公共项目
- `401` 说明 API 在工作，但需要认证，适合后续配合口令、Token、Session 再继续

---

## 2. 第二轮打点：匿名或弱鉴权下的基础收益

### 2.1 枚举公共项目

GitLab 官方 Projects API 文档明确指出：未认证请求会返回当前实例上可见的公共项目。这意味着只要实例对外开放，匿名 API 就已经具备相当高的资产暴露价值。

#### 请求示例

```http
GET /api/v4/projects?simple=true&per_page=20 HTTP/1.1
Host: git.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "id": 37,
    "name": "platform-api",
    "path_with_namespace": "corp/platform-api",
    "default_branch": "main",
    "web_url": "https://git.target.example/corp/platform-api",
    "http_url_to_repo": "https://git.target.example/corp/platform-api.git",
    "topics": [
      "gateway",
      "spring"
    ]
  },
  {
    "id": 41,
    "name": "ops-scripts",
    "path_with_namespace": "corp/ops-scripts",
    "default_branch": "master",
    "web_url": "https://git.target.example/corp/ops-scripts"
  }
]
```

这类响应会直接暴露：

- 项目命名方式
- 业务域与技术栈标签
- 默认分支
- 仓库克隆地址

其中像 `ops-scripts`、`gateway`、`platform` 这样的命名，在打点阶段优先级通常会更高。

### 2.2 枚举公共群组

GitLab Groups API 文档同样说明：未认证访问时，返回公共群组。

#### 请求示例

```http
GET /api/v4/groups?per_page=20 HTTP/1.1
Host: git.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "id": 5,
    "name": "corp",
    "path": "corp",
    "full_path": "corp",
    "web_url": "https://git.target.example/groups/corp",
    "visibility": "public"
  }
]
```

这会帮助攻击者迅速确认：

- 顶层组织命名
- 是否存在多租户或多事业部结构
- 后续 URL-encoded path 该如何构造

### 2.3 列出群组项目

#### 请求示例

```http
GET /api/v4/groups/corp/projects?per_page=20 HTTP/1.1
Host: git.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "id": 37,
    "name": "platform-api",
    "path_with_namespace": "corp/platform-api",
    "visibility": "public"
  },
  {
    "id": 41,
    "name": "ops-scripts",
    "path_with_namespace": "corp/ops-scripts",
    "visibility": "public"
  }
]
```

相比全局 `/projects`，这种按群组打点的方式更适合：

- 按组织还原仓库范围
- 发现敏感小组下的公开项目
- 为后续仓库树枚举做精确筛选

---

## 3. 第三轮打点：仓库树、源码文件与配置文件

GitLab Repositories API 明确说明：如果项目是公开的，仓库树和 Blob 等接口可以在未认证条件下访问。这一点对打点非常关键，因为它意味着攻击者无需克隆整个仓库，也能通过 API 精确回收文件与目录。

### 3.1 枚举仓库树

#### 请求示例

```http
GET /api/v4/projects/corp%2Fplatform-api/repository/tree?ref=main&per_page=20 HTTP/1.1
Host: git.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "id": "0d7a48f7e8f2d2d0a2f88d0d8f5a3111e6f6eabc",
    "name": ".gitlab-ci.yml",
    "type": "blob",
    "path": ".gitlab-ci.yml",
    "mode": "100644"
  },
  {
    "id": "de7ec3a8cc8a997f4b8f0d717dbf7e55f0ce0aef",
    "name": "deploy",
    "type": "tree",
    "path": "deploy",
    "mode": "040000"
  },
  {
    "id": "fd581c619bf59cfdfa9c8282377bb09c2f897520",
    "name": "src",
    "type": "tree",
    "path": "src",
    "mode": "040000"
  }
]
```

这类响应的价值在于：

- 不需要完整克隆就能获得仓库目录结构
- 能直接定位 `.gitlab-ci.yml`、`deploy/`、`k8s/`、`docker/`、`scripts/` 等高价值目录

### 3.2 递归列出更多路径

#### 请求示例

```http
GET /api/v4/projects/corp%2Fplatform-api/repository/tree?ref=main&recursive=true&per_page=100 HTTP/1.1
Host: git.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "name": ".gitlab-ci.yml",
    "path": ".gitlab-ci.yml",
    "type": "blob"
  },
  {
    "name": "application-prod.yml",
    "path": "deploy/application-prod.yml",
    "type": "blob"
  },
  {
    "name": "Dockerfile",
    "path": "docker/Dockerfile",
    "type": "blob"
  }
]
```

这一步会直接把后续高价值文件列表暴露出来。

### 3.3 读取原始文件

对打点来说，最重要的不是“能不能看代码”，而是先优先读取最可能泄露环境与部署信息的文件，例如：

- `.gitlab-ci.yml`
- `Dockerfile`
- `docker-compose.yml`
- `application-prod.yml`
- `values.yaml`
- `kustomization.yaml`
- `README.md`

#### 请求示例

```http
GET /api/v4/projects/corp%2Fplatform-api/repository/files/.gitlab-ci.yml/raw?ref=main HTTP/1.1
Host: git.target.example
Connection: close
```

#### 典型响应示例

```yaml
stages:
  - build
  - deploy

deploy_prod:
  stage: deploy
  image: registry.corp.local/devops/kubectl:1.30
  script:
    - kubectl --kubeconfig=$KUBE_CONFIG apply -f deploy/application-prod.yml
```

这类响应对打点价值极高，因为它会直接暴露：

- 镜像仓库地址
- CI/CD 阶段
- 环境变量名
- 部署目标和文件路径

### 3.4 读取 Blob 元信息

GitLab Repositories API 文档也提供了通过 Blob SHA 读取内容的方式。

#### 请求示例

```http
GET /api/v4/projects/corp%2Fplatform-api/repository/blobs/0d7a48f7e8f2d2d0a2f88d0d8f5a3111e6f6eabc HTTP/1.1
Host: git.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "size": 221,
  "encoding": "base64",
  "content": "c3RhZ2VzOgogIC0gYnVpbGQKICAtIGRlcGxveQo=",
  "sha": "0d7a48f7e8f2d2d0a2f88d0d8f5a3111e6f6eabc"
}
```

这类接口适合：

- 细粒度回收单个文件
- 通过 `sha` 关联目录树与实际内容
- 在某些原始文件下载受限时作为替代读取方式

---

## 4. 第四轮打点：公共 Job、Artifact 与 Pipeline 线索

GitLab 项目如果启用了 `public_jobs` 或 CI 结果未正确受限，公开 API 与页面常常会额外泄露构建元数据和 Artifact 线索。

### 4.1 项目元信息中的 CI 线索

#### 请求示例

```http
GET /api/v4/projects/corp%2Fplatform-api HTTP/1.1
Host: git.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "id": 37,
  "path_with_namespace": "corp/platform-api",
  "jobs_enabled": true,
  "public_jobs": true,
  "container_registry_enabled": true,
  "http_url_to_repo": "https://git.target.example/corp/platform-api.git",
  "web_url": "https://git.target.example/corp/platform-api"
}
```

这类响应会告诉你：

- 项目是否启用了 CI/CD
- Job 是否可能公开
- 是否启用了容器镜像或注册表功能

### 4.2 读取公共 Job 列表

#### 请求示例

```http
GET /api/v4/projects/corp%2Fplatform-api/jobs HTTP/1.1
Host: git.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "id": 8021,
    "status": "success",
    "stage": "deploy",
    "name": "deploy_prod",
    "ref": "main",
    "artifacts_file": {
      "filename": "artifacts.zip",
      "size": 1048576
    }
  }
]
```

这一步即使不能直接下载 Artifact，也已经足够帮助打点：

- 知道 Job 名称
- 知道是否有 deploy、backup、release 这类高价值任务
- 知道是否可能存在 Artifact 下载路径

### 4.3 Artifact 下载链路

#### 请求示例

```http
GET /api/v4/projects/corp%2Fplatform-api/jobs/8021/artifacts HTTP/1.1
Host: git.target.example
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: application/zip
Content-Disposition: attachment; filename="artifacts.zip"
```

如果这里能直接下载，通常应优先检查：

- 部署配置
- 产物清单
- `.env`
- Helm values
- 历史打包脚本

#### 失败响应示例

```json
{
  "message": "404 Not found"
}
```

失败并不意味着没有价值，仍然说明：

- Job 存在
- Artifact 链路需要更高权限或已过期

---

## 5. 第五轮打点：Snippet、用户信息与 GraphQL

### 5.1 Public Snippets

Snippet 经常被低估，但它很适合在打点阶段回收：

- 临时脚本
- 配置片段
- Token 示例
- 连接串

#### 请求示例

```http
GET /api/v4/snippets?per_page=20 HTTP/1.1
Host: git.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "id": 144,
    "title": "k8s deploy notes",
    "file_name": "deploy.sh",
    "visibility": "public",
    "web_url": "https://git.target.example/-/snippets/144"
  }
]
```

如果这里公开可见，后续就应继续查看：

- 具体 snippet 内容
- 作者命名习惯
- 是否存在部署脚本、运维脚本、临时凭据

### 5.2 GraphQL Explorer 与 `/api/graphql`

GitLab 官方文档明确说明：

- GraphQL 端点位于 `/api/graphql`
- Self-Managed 上常可见 `/-/graphql-explorer`

这类端点的打点价值在于：

- 探测实例是否开放 GraphiQL
- 判断是否存在弱鉴权、历史暴露或可用于更精确的数据枚举的查询面

#### 请求示例

```http
GET /-/graphql-explorer HTTP/1.1
Host: git.target.example
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
```

如果 Explorer 可直接打开，应立即记录：

- 是否要求登录
- 是否能执行公共对象查询
- 是否暴露 schema 或自动补全

#### 请求示例：匿名 GraphQL 探测

```http
POST /api/graphql HTTP/1.1
Host: git.target.example
Content-Type: application/json
Accept: application/json
Connection: close

{"query":"query { currentUser { username } }"}
```

#### 典型失败响应示例

```json
{
  "errors": [
    {
      "message": "Invalid token"
    }
  ]
}
```

或：

```json
{
  "data": {
    "currentUser": null
  }
}
```

这类响应本身就能帮助判断：

- GraphQL 在工作
- 但当前查询是否匿名可用
- 后续是否应转为公共对象查询或已知历史暴露点测试

### 5.3 历史高危面：GraphQL 用户枚举与 Events API 暴露

GitLab 历史上多次出现“不是传统 RCE，但足以显著提升打点收益”的 API 安全问题，最典型的包括：

- GraphQL 用户枚举
- Events API 对公共项目的私有事件暴露
- Notes / Snippet 等对象上的 IDOR

这类历史问题对当前打点的价值不在于盲目复现，而在于提醒你：

- GitLab 的高价值风险经常出现在 API 授权边界
- 版本信息与实例类型一旦确定，就应优先核查历史 API 暴露面

---

## 6. 打点流程建议

比起一上来盲打所有端点，更稳的 GitLab 打点流程通常如下：

### 6.1 第一轮：识别与版本

优先请求：

- `/users/sign_in`
- `/api/v4/version`
- `/api/v4/projects`

目标：

- 确认是不是 GitLab
- 确认版本与匿名 API 能力

### 6.2 第二轮：组织与项目画像

优先请求：

- `/api/v4/groups`
- `/api/v4/groups/:id/projects`
- `/api/v4/projects`

目标：

- 还原组织结构
- 识别公开项目
- 标记高价值项目名

### 6.3 第三轮：仓库与配置文件回收

优先请求：

- `/api/v4/projects/:id/repository/tree`
- `/api/v4/projects/:id/repository/files/:file_path/raw`
- `/api/v4/projects/:id/repository/blobs/:sha`

目标：

- 快速读取 `.gitlab-ci.yml`、部署配置、脚本和 Docker/K8s 文件

### 6.4 第四轮：CI/CD 与扩展面

优先请求：

- `/api/v4/projects/:id/jobs`
- `/api/v4/projects/:id/jobs/:job_id/artifacts`
- `/api/v4/snippets`
- `/api/graphql`
- `/-/graphql-explorer`

目标：

- 看 Job、Artifact、Snippet 和 GraphQL 是否能继续扩大收益

---

## 7. 蓝队检测与处置

### 7.1 访问日志中的高价值信号

应重点识别：

- 对 `/api/v4/version`、`/api/v4/projects`、`/api/v4/groups` 的探测
- 对公共仓库树、原始文件、Blob 的连续访问
- 对 Job / Artifact 接口的枚举
- 对 `/-/graphql-explorer` 与 `/api/graphql` 的异常探测

#### 日志示例

```text
10.10.10.21 - - [13/Jun/2026:00:41:11 +0800] "GET /api/v4/projects?simple=true&per_page=20 HTTP/1.1" 200 2412 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [13/Jun/2026:00:41:18 +0800] "GET /api/v4/projects/corp%2Fplatform-api/repository/tree?ref=main&recursive=true&per_page=100 HTTP/1.1" 200 8431 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [13/Jun/2026:00:41:25 +0800] "GET /api/v4/projects/corp%2Fplatform-api/repository/files/.gitlab-ci.yml/raw?ref=main HTTP/1.1" 200 512 "-" "curl/8.7.1"
```

第三条非常值得告警，因为它通常表明攻击者已经从“项目发现”进入“配置文件回收”。

### 7.2 GitLab 自身日志中的调查点

GitLab 自身常能提供以下高价值线索：

- API 访问日志
- GraphQL 请求日志
- 登录失败与异常 Session
- Artifact 下载日志
- Public project / snippet 被异常枚举的行为

#### 日志示例

```text
Started GET "/api/v4/projects/corp%2Fplatform-api/repository/tree?ref=main" for 10.10.10.21 at 2026-06-13 00:41:18 +0800
```

```text
Completed 200 OK in 31ms (Views: 0.4ms | ActiveRecord: 4.3ms)
```

```text
Started POST "/api/graphql" for 10.10.10.21 at 2026-06-13 00:41:39 +0800
```

### 7.3 处置建议

发现 GitLab 正在被打点后，应优先做：

1. 审查公共项目、群组与 Snippet 的可见范围
2. 审查 `.gitlab-ci.yml`、部署配置、脚本是否被公开仓库直接暴露
3. 检查 `public_jobs` 与 Artifact 可见性
4. 审查 `/-/graphql-explorer` 和 GraphQL 匿名访问策略
5. 对外网来源的 API 枚举行为启用速率与异常检测

长期建议：

- 最小化公共项目和公共 Snippet
- 对公开项目进行配置文件敏感信息审计
- 收紧公共 Job 与 Artifact 可见性
- 定期核查 GitLab 版本与历史 API 暴露相关通告

---

## 8. 复盘清单

### 8.1 红队侧

- 是否先确认了版本与匿名 API 能力
- 是否按群组和项目两层做了枚举
- 是否回收了 `.gitlab-ci.yml`、部署配置与脚本
- 是否测试了 Job、Artifact、Snippet 与 GraphQL 面
- 是否把请求与响应完整保存

### 8.2 蓝队侧

- 是否能识别从 `/api/v4/projects` 到仓库树和原始文件的连续访问
- 是否能区分正常公开访问与异常批量枚举
- 是否能关联 GraphQL Explorer 访问与 GraphQL POST 请求
- 是否对公共 Job / Artifact 下载建立了单独监控

### 8.3 应急侧

- 是否确认公开项目中是否包含部署与环境敏感配置
- 是否确认 Artifact 或 Snippet 是否已被回收
- 是否复核了版本与历史 API 安全问题
- 是否完成公开范围与可见性收敛

---

## 9. 总结

`GitLab` 在渗透测试中的价值，不只是“公开代码仓”，而是一个把项目、用户、群组、CI、Artifact 和 API 全部结构化暴露出来的研发管理面。

对打点来说，更值得沉淀的方法学是：

- 先确认版本与匿名 API 能力
- 再枚举群组和公共项目
- 再回收仓库树、源码和 CI 配置
- 最后再判断 Job、Artifact、GraphQL 与历史 API 面是否可继续扩大收益

这类路线非常适合放在 `04 渗透攻击` 目录中，因为它解决的是“如何从一个公开研发平台快速扩大攻击面认知和利用收益”。

---

## 参考资料

- [GitLab REST API](https://docs.gitlab.com/api/rest/)
- [Projects API](https://docs.gitlab.com/api/projects/)
- [Groups API](https://docs.gitlab.com/api/groups/)
- [Repositories API](https://docs.gitlab.com/api/repositories/)
- [GraphQL API](https://docs.gitlab.com/api/graphql/)
- [Rapid7: CVE-2021-4191 GitLab GraphQL API User Enumeration](https://www.rapid7.com/blog/post/2022/03/03/cve-2021-4191-gitlab-graphql-api-user-enumeration-fixed/)
- [Wallarm: Three new API exploits causes GitLab data privacy and availability issues](https://lab.wallarm.com/gitlab-security-issues-cve-2022-1352/)
