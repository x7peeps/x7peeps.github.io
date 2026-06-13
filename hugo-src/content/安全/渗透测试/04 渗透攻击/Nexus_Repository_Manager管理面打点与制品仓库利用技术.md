---
title: "Nexus Repository Manager管理面打点与制品仓库利用技术"
weight: 49
---

# Nexus Repository Manager管理面打点与制品仓库利用技术

`Nexus Repository Manager` 是典型的制品仓库与依赖代理管理面。在现代研发环境中，它往往连接着：

- Maven / Gradle 制品
- npm / Yarn 包
- PyPI 包
- Docker 镜像
- Helm Chart
- 内部代理仓与外部上游仓库

这意味着当 Nexus 被暴露到低信任网络、匿名浏览权限过宽、默认口令未改、REST API 被直接开放时，攻击者拿到的不只是“一个下载站”，而是：

- 研发制品索引
- 组件命名规范
- 内部镜像与版本信息
- 私有包名与项目结构
- 代理仓远程地址
- 历史上可通向脚本执行或 RCE 的管理接口

本文继续按你当前的要求写成一篇偏“打点与漏洞利用”的手册，不写后渗透横向，重点包括：

1. 如何识别 Nexus 管理面
2. 匿名与弱鉴权状态下能拿到什么
3. 如何通过 REST API 枚举仓库、组件、资产和下载链接
4. 如何利用 Swagger/OpenAPI、脚本面和历史高危接口扩大收益
5. 蓝队应如何从 Web 日志和 Nexus 日志中识别这类打点

---

## 0. 攻击面概览

### 0.1 为什么 Nexus 适合作为“打点专题”

Nexus 的价值在于它天然承载了研发供应链元数据。对攻击者来说，这种系统通常比一个普通业务后台更有情报价值，因为它能把很多平时分散的线索集中暴露出来：

- 项目命名
- 组件命名
- 版本迭代节奏
- 内部仓库划分
- 上游代理源
- 镜像与二进制分发路径

因此它非常适合放在 `04 渗透攻击` 目录中，作为“管理面打点与漏洞利用方法学”的一部分。

### 0.2 常见路径

首轮至少应枚举：

- `/`
- `/service/rest/v1/status`
- `/service/rest/swagger.json`
- `/service/rest/v1/repositories`
- `/service/rest/v1/search`
- `/service/rest/v1/search/assets`
- `/service/rest/v1/components`
- `/repository/`
- `/service/rest/repository/browse`
- `/service/rest/v1/script`
- `/service/extdirect`

如果目标是老版本 Nexus 2，还可能出现：

- `/nexus/service/local/status`
- `/nexus/service/local/repositories`

但本文主线以 Nexus Repository Manager 3 为主。

### 0.3 打点收益优先级

按“最容易快速转化为真实攻击价值”的顺序，Nexus 常见打点收益可排列为：

1. 识别版本与匿名能力
2. 枚举仓库与仓库类型
3. 枚举组件、资产和下载路径
4. 回收私有包名、镜像名、组织名、版本体系
5. 判断是否存在默认口令、脚本面或历史高危接口

---

## 1. 第一轮打点：确认是否为 Nexus

### 1.1 基础页面识别

#### 请求示例

```http
GET / HTTP/1.1
Host: repo.target.example
User-Agent: Mozilla/5.0
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html
Server: Nexus/3.68.1-02 (OSS)
```

在不同部署中，版本不一定直接出现在 `Server` 头里，但常见前端特征包括：

- 页面标题含 `Nexus Repository Manager`
- 静态资源或脚本中出现 `NXRM`、`nexus`
- 登录页路由与 ExtJS 前端特征

### 1.2 状态接口

官方文档和运维资料都把状态接口作为标准探测点，这也是打点中非常重要的首轮请求。

#### 请求示例

```http
GET /service/rest/v1/status HTTP/1.1
Host: repo.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "version": "3.68.1-02",
  "edition": "OSS",
  "status": "STARTED"
}
```

这条响应一旦出现，意味着：

- 目标明确是 NXRM 3
- 当前实例在线
- 可以直接据此判断是否需要继续验证已知版本范围内的历史风险

### 1.3 Swagger/OpenAPI 定义

Sonatype 官方文档明确说明，实例会在 `/service/rest/swagger.json` 暴露 REST API 定义，并且无需特权即可下载。这一点对打点非常关键，因为它相当于把整个 API 面的规范直接交给了攻击者。

#### 请求示例

```http
GET /service/rest/swagger.json HTTP/1.1
Host: repo.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "swagger": "2.0",
  "info": {
    "title": "Nexus Repository Manager REST API",
    "version": "3.68.1-02"
  },
  "basePath": "/service/rest/"
}
```

这条响应的打点价值非常高，因为它直接提供：

- API 标题与版本
- 端点范围
- 后续可自动化提取的路径清单

对攻击者来说，这和公开 Swagger/OpenAPI 文档的收益非常类似。

---

## 2. 第二轮打点：匿名与弱鉴权下的真实收益

### 2.1 列出可浏览仓库

官方 Repositories API 文档明确指出，`/service/rest/v1/repositories` 会列出当前用户有 browse 权限的仓库。也就是说，如果匿名用户能拿到这条响应，就说明匿名浏览能力已经足够高。

#### 请求示例

```http
GET /service/rest/v1/repositories HTTP/1.1
Host: repo.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "name": "maven-releases",
    "format": "maven2",
    "type": "hosted",
    "url": "http://repo.target.example/repository/maven-releases",
    "attributes": {}
  },
  {
    "name": "npm-group",
    "format": "npm",
    "type": "group",
    "url": "http://repo.target.example/repository/npm-group",
    "attributes": {}
  },
  {
    "name": "docker-proxy",
    "format": "docker",
    "type": "proxy",
    "url": "http://repo.target.example/repository/docker-proxy",
    "attributes": {
      "proxy": {
        "remoteUrl": "https://registry-1.docker.io"
      }
    }
  }
]
```

这条响应的价值远不止“列个目录”，因为它会立刻暴露：

- 内部仓库命名规范
- 业务使用的包管理生态
- 是否存在代理仓
- 代理仓上游地址

如果匿名用户能看到 `remoteUrl`，说明攻击者已经能够据此反推出：

- 目标在代理哪些外部源
- 是否有内部专用 hosted 仓
- 是否存在 group 仓可作为统一下载入口

### 2.2 为什么仓库类型很重要

不同仓库类型对应不同打点收益：

- `hosted`
  说明这里直接存放内部制品，适合枚举私有组件名与版本
- `proxy`
  说明它连接了上游远程源，适合回收远程地址与缓存命名规律
- `group`
  说明它是聚合入口，适合做统一下载与组件搜索

### 2.3 枚举组件

`/service/rest/v1/search` 与 `/service/rest/v1/components` 是第二轮最值得打的接口。它们能把“仓库存在什么”用结构化 JSON 展示出来。

#### 请求示例

```http
GET /service/rest/v1/search?repository=maven-releases HTTP/1.1
Host: repo.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "items": [
    {
      "id": "bWF2ZW4tcmVsZWFzZXM6YWFhYmJiY2M=",
      "repository": "maven-releases",
      "format": "maven2",
      "group": "com.corp.payment",
      "name": "payment-api",
      "version": "2.14.7",
      "assets": [
        {
          "downloadUrl": "http://repo.target.example/repository/maven-releases/com/corp/payment/payment-api/2.14.7/payment-api-2.14.7.jar",
          "path": "com/corp/payment/payment-api/2.14.7/payment-api-2.14.7.jar",
          "repository": "maven-releases",
          "format": "maven2"
        }
      ]
    }
  ],
  "continuationToken": null
}
```

这类响应一旦出现，打点收益就已经非常高：

- 暴露内部业务域名和包结构，如 `com.corp.payment`
- 暴露真实组件名和版本
- 直接给出下载 URL

### 2.4 枚举资产

资产视角比组件视角更细，更适合直接下载和定位文件。

#### 请求示例

```http
GET /service/rest/v1/search/assets?repository=maven-releases&format=maven2&maven.groupId=com.corp.payment HTTP/1.1
Host: repo.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "items": [
    {
      "downloadUrl": "http://repo.target.example/repository/maven-releases/com/corp/payment/payment-api/2.14.7/payment-api-2.14.7.jar",
      "path": "com/corp/payment/payment-api/2.14.7/payment-api-2.14.7.jar",
      "id": "bWF2ZW4tcmVsZWFzZXM6MTIzNDU2",
      "repository": "maven-releases",
      "format": "maven2",
      "checksum": {
        "sha1": "5458ffe2ba049e76c29f2df2dc3ffccddf8b839e",
        "md5": "8053bbc1b55d51f5abae005625209d08"
      }
    }
  ],
  "continuationToken": null
}
```

这类响应对攻击者的价值在于：

- 可以直接批量回收二进制文件
- 可据 checksum 去做本地样本归类
- 可以从路径结构里推断包、模块、环境、版本策略

### 2.5 continuationToken：不要漏掉分页

Nexus 的列表接口大量采用 `continuationToken` 分页。打点时如果只看第一页，往往会漏掉大量真正高价值的内部制品。

#### 第一页响应片段

```json
{
  "items": [
    { "path": "com/corp/order/order-api/1.0.0/order-api-1.0.0.jar" }
  ],
  "continuationToken": "eyJjb250aW51ZSI6IjEyMzQ1NiJ9"
}
```

#### 下一页请求示例

```http
GET /service/rest/v1/search/assets?repository=maven-releases&continuationToken=eyJjb250aW51ZSI6IjEyMzQ1NiJ9 HTTP/1.1
Host: repo.target.example
Accept: application/json
Connection: close
```

打点记录里必须把分页逻辑记下来，否则自动化脚本很容易把“只有第一页结果”误判成“资产很少”。

---

## 3. 第三轮打点：直接下载与目录推断

### 3.1 从 downloadUrl 直接回收制品

一旦拿到 `downloadUrl`，攻击者通常会直接尝试拉取样本或配置文件。

#### 请求示例

```http
GET /repository/maven-releases/com/corp/payment/payment-api/2.14.7/payment-api-2.14.7.jar HTTP/1.1
Host: repo.target.example
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: application/java-archive
Content-Length: 834211
```

这一步的意义是：

- 把“元数据打点”直接转成“样本回收”
- 后续可做反编译、敏感字符串提取、内部 URL/Token/调试接口还原

### 3.2 下载 POM / package.json / wheel 元数据

很多时候，真正有价值的不是主制品，而是元数据文件本身，因为它们会暴露：

- 依赖关系
- 内部私服地址
- 发布者组织
- SCM 地址
- 版本说明

#### 请求示例

```http
GET /repository/maven-releases/com/corp/payment/payment-api/2.14.7/payment-api-2.14.7.pom HTTP/1.1
Host: repo.target.example
Connection: close
```

#### 典型响应示例

```xml
<project>
  <groupId>com.corp.payment</groupId>
  <artifactId>payment-api</artifactId>
  <version>2.14.7</version>
  <scm>
    <url>https://gitlab.internal.local/platform/payment-api</url>
  </scm>
</project>
```

这类响应会直接把打点进一步推进到：

- 代码仓库地址
- 内部 Git 平台命名
- 项目归属团队

### 3.3 直接从 browse 接口做目录树枚举

当 Search API 结果不够直观时，`browse` 接口和仓库内容路径更适合做目录树式枚举。

#### 请求示例

```http
GET /service/rest/repository/browse/maven-releases/ HTTP/1.1
Host: repo.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "items": [
    {
      "name": "com",
      "path": "/com/"
    },
    {
      "name": "org",
      "path": "/org/"
    }
  ]
}
```

然后继续向下钻取：

```http
GET /service/rest/repository/browse/maven-releases/com/corp/ HTTP/1.1
Host: repo.target.example
Accept: application/json
Connection: close
```

这种方式尤其适合：

- 手工理解包结构
- 低噪音枚举内部命名
- 搜索 API 受限时的替代路径

---

## 4. 第四轮打点：默认口令、匿名用户与弱认证

### 4.1 默认或弱口令

Nexus 在一些嵌入式部署、历史迁移场景和第三方封装环境中，默认账户和默认密码残留问题并不少见。Broadcom 的公开说明也明确提到某些封装部署会带出 `admin`、`anonymous`、`deployment` 等默认用户配置。

需要注意的是：

- 这不是所有原生 NXRM 3 实例都会出现的情况
- 但在老旧、嵌入式、二次集成产品里很常见

#### 请求示例

```http
GET /service/rest/v1/status HTTP/1.1
Host: repo.target.example
Authorization: Basic YWRtaW46YWRtaW4xMjM=
Accept: application/json
Connection: close
```

#### 典型成功响应示例

```json
{
  "version": "3.68.1-02",
  "edition": "OSS",
  "status": "STARTED"
}
```

#### 典型失败响应示例

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: BASIC realm="Sonatype Nexus Repository Manager"
```

一旦默认口令或弱口令命中，后续可利用面会显著扩大：

- 完整枚举仓库配置
- 获取更详细的 repository settings
- 调用脚本和任务 API
- 管理 Blob Store、用户、角色、任务

### 4.2 匿名与认证边界判断

有些实例不是“完全未授权”，而是：

- 匿名可浏览仓库
- 但管理 API 需要认证

对打点来说，这种状态同样危险，因为匿名阶段已经足够完成：

- 制品枚举
- 组件名回收
- 下载样本
- 获取私有项目结构

---

## 5. 第五轮打点：脚本面与历史高危接口

### 5.1 Script API

Sonatype 官方文档在 Automation 部分明确提到，Nexus 支持以 Groovy 编写脚本完成 REST/UI 不便处理的任务。这说明 Script API 本身就是高价值管理面。

在较高权限可用的前提下，脚本接口通常应被视为“接近执行面”的入口。

#### 请求示例：列出脚本

```http
GET /service/rest/v1/script HTTP/1.1
Host: repo.target.example
Authorization: Basic YWRtaW46cGFzc3dvcmQ=
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "name": "cleanup-old-assets",
    "type": "groovy"
  }
]
```

如果这里可读，意味着攻击者已经非常接近：

- 理解现有运维脚本逻辑
- 回收内部任务命名
- 测试脚本执行或任务触发

### 5.2 脚本创建或执行请求的价值

即便没有立即写入权限，打点阶段也应判断：

- Script API 是否存在
- 是否报 `401/403`
- 是否返回 Swagger 中定义的 script tag

因为这类信息能帮助后续在拿到凭据后迅速扩大收益。

### 5.3 历史高危接口：`/service/extdirect`

Nexus 历史上存在多个非常值得在打点阶段特别关注的高危面，其中最典型的是老版本 `CVE-2019-7238`。公开 PoC 和厂商/安全研究都指出，未修复的老版本 NXRM 3 会在 `/service/extdirect` 暴露可被利用的 EL/JEXL 表达式执行点。

#### 探测请求示例

```http
POST /service/extdirect HTTP/1.1
Host: repo.target.example
Content-Type: application/json
X-Requested-With: XMLHttpRequest
Connection: close

{
  "action": "coreui_Component",
  "type": "rpc",
  "tid": 18,
  "method": "previewAssets",
  "data": [
    {
      "filter": [
        {
          "property": "repositoryName",
          "value": "*"
        },
        {
          "property": "expression",
          "value": "1==0"
        },
        {
          "property": "type",
          "value": "jexl"
        }
      ],
      "sort": [
        {
          "direction": "ASC",
          "property": "name"
        }
      ],
      "limit": 50,
      "page": 1,
      "start": 0
    }
  ]
}
```

#### 典型响应示例

```json
{
  "type": "rpc",
  "tid": 18,
  "action": "coreui_Component",
  "method": "previewAssets",
  "result": {
    "total": 0,
    "data": []
  }
}
```

如果目标是受影响老版本，这个接口本身就说明：

- 存在历史高危利用面
- 后续需要结合版本与补丁状态判断是否继续深入

文章层面应明确写明边界：

- 这里只讨论打点和接口识别
- 真正执行危险 payload 必须严格受控于授权测试范围

### 5.4 为什么 `extdirect` 在打点中仍值得记录

即使不继续利用，`/service/extdirect` 的价值也在于：

- 它能帮助你确认目标是否仍暴露旧 UI / 老接口链
- 它与旧版 NXRM 3 高危历史问题强相关
- 它为后续版本匹配和风险分层提供依据

---

## 6. 打点流程建议

比起一上来就盲打脚本或历史漏洞，更稳的 Nexus 打点流程通常如下：

### 6.1 第一轮：识别与版本

优先请求：

- `/`
- `/service/rest/v1/status`
- `/service/rest/swagger.json`

目标：

- 确认是否为 NXRM 3
- 获取版本、edition、在线状态
- 获取 REST API 定义

### 6.2 第二轮：匿名能力与仓库枚举

优先请求：

- `/service/rest/v1/repositories`
- `/service/rest/v1/search`
- `/service/rest/v1/search/assets`
- `/service/rest/repository/browse/...`

目标：

- 确认匿名或低权限的 browse 范围
- 还原仓库结构
- 回收内部组件与资产信息

### 6.3 第三轮：下载与样本回收

优先请求：

- `downloadUrl`
- 典型 `pom/package.json/wheel metadata`
- 关键二进制文件

目标：

- 获取私有制品
- 提取源码线索、凭据线索、SCM 线索

### 6.4 第四轮：高权限 API 面判断

在已有身份后继续：

- `/service/rest/v1/script`
- 更完整的 repository settings
- 历史高危接口如 `/service/extdirect`

目标：

- 判断能否从“仓库浏览”扩大到“管理执行面”

---

## 7. 蓝队检测与处置

### 7.1 访问日志中的高价值信号

应重点识别：

- 对 `/service/rest/v1/status` 的探测
- 对 `/service/rest/swagger.json` 的访问
- 对 `/service/rest/v1/repositories`、`search`、`search/assets` 的连续访问
- 对 `/service/rest/repository/browse/...` 的深层目录遍历
- 对 `/service/rest/v1/script` 与 `/service/extdirect` 的访问

#### 日志示例

```text
10.10.10.21 - - [13/Jun/2026:00:12:11 +0800] "GET /service/rest/v1/status HTTP/1.1" 200 61 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [13/Jun/2026:00:12:17 +0800] "GET /service/rest/v1/repositories HTTP/1.1" 200 912 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [13/Jun/2026:00:12:24 +0800] "GET /service/rest/v1/search/assets?repository=maven-releases HTTP/1.1" 200 7412 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [13/Jun/2026:00:12:38 +0800] "POST /service/extdirect HTTP/1.1" 200 178 "-" "python-requests/2.32"
```

第四条在生产环境里通常应被视为非常高优先级信号。

### 7.2 Nexus 自身日志中的调查点

Nexus 应用日志里常能看到：

- 匿名浏览
- REST API 请求
- 下载事件
- 脚本与任务相关动作
- 旧接口异常

#### 日志示例

```text
INFO  anonymous org.sonatype.nexus.repository.httpbridge.internal.ViewServlet - Content served for repository maven-releases
```

```text
WARN  anonymous org.sonatype.nexus.repository.view.handlers.ExceptionHandler - Unauthorized access to script API
```

```text
WARN  anonymous org.sonatype.nexus.extdirect.internal.ExtDirectServlet - Unsupported extdirect request received
```

这些日志如果与 Web 日志时间点能对齐，就足够把攻击者行为从“普通浏览”区分成“管理面探测”。

### 7.3 处置建议

发现 Nexus 正在被打点后，应优先做：

1. 关闭匿名 browse 或最小化匿名仓库范围
2. 审核哪些 hosted/group/proxy 仓可被匿名读取
3. 关闭或限制对 `swagger.json`、script API、legacy 面的暴露
4. 检查是否已有关键私有制品被批量下载
5. 检查是否存在默认口令、弱口令与嵌入式部署遗留账户
6. 核实是否仍运行受历史高危问题影响的旧版本

长期建议：

- 不向低信任网络暴露 NXRM 管理面
- 对匿名与低权限用户严格最小化 browse 权限
- 定期审计私有组件下载行为
- 优先淘汰仍暴露 `/service/extdirect` 风险面的旧版本

---

## 8. 复盘清单

### 8.1 红队侧

- 是否先拿到了状态接口和 swagger.json
- 是否记录了仓库名、仓库类型、上游地址
- 是否完整处理了 continuationToken 分页
- 是否回收了关键组件、资产和元数据文件
- 是否验证了 script API 与 extdirect 历史面

### 8.2 蓝队侧

- 是否能识别匿名用户对 REST API 的批量读取
- 是否能区分普通下载与大规模资产枚举
- 是否能对 `/service/extdirect` 单独高优先级告警
- 是否对私有 hosted 仓下载建立了异常检测

### 8.3 应急侧

- 是否确认私有制品是否已被回收
- 是否确认匿名权限是否超出业务需要
- 是否核查了默认账户与嵌入式部署遗留问题
- 是否完成版本与历史高危面复核

---

## 9. 总结

`Nexus Repository Manager` 在渗透测试中的价值，不只是“一个包下载站”，而是一个把研发供应链结构化暴露出来的管理面。

对打点来说，真正应沉淀的方法学是：

- 先识别版本与 REST 定义
- 再枚举仓库与资产
- 再回收私有制品与元数据
- 最后判断是否可扩展到脚本面或历史高危接口

这类打法非常适合放在 `04 渗透攻击` 目录中，因为它解决的是“如何从公开制品仓入口快速扩大攻击收益”。

---

## 参考资料

- [Nexus Repository API Reference](https://help.sonatype.com/en/api-reference.html)
- [Repositories API](https://help.sonatype.com/en/repositories-api.html)
- [Search API](https://help.sonatype.com/en/search-api.html)
- [Automation](https://help.sonatype.com/en/automation.html)
- [Manage Repositories with Nexus](https://cray-hpe.github.io/docs-csm/en-13/operations/package_repository_management/manage_repositories_with_nexus/)
- [CVE-2019-7238 PoC Repository](https://github.com/jas502n/CVE-2019-7238)
