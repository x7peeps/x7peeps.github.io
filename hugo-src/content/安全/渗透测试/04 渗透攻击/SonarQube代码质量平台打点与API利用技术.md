---
title: "SonarQube代码质量平台打点与API利用技术"
weight: 53
---

# SonarQube代码质量平台打点与API利用技术

`SonarQube` 在研发环境中的定位并不是普通后台，而是代码质量、漏洞审计、技术债务、质量门禁和分析结果的聚合平台。对攻击者来说，它的价值不止在于“看到扫描结果”，而在于它往往长期保存了与源码、项目结构、分支、规则、问题、质量度量和认证配置相关的大量高价值信息。一旦 SonarQube 被暴露到低信任网络、公共项目过多、Token 管理松散，或者 Monitoring API 与系统接口暴露过宽，攻击者就可以在打点阶段迅速获得：

- 项目名、项目 key、组织结构与命名空间
- 文件树、源码路径和部分源码内容
- Issue、Rule、Hotspot、代码异味与安全问题信息
- 指标、复杂度、代码规模与技术债务趋势
- Token 使用痕迹与管理接口存在性
- 系统状态、插件、监控指标与鉴权策略线索

本文只聚焦打点与利用侧，重点记录：

1. 如何识别 SonarQube 管理面与 Web API
2. 匿名与弱鉴权状态下能枚举哪些对象
3. 如何通过 Projects、Components、Measures、Issues、Sources API 建立项目画像
4. 如何判断 Monitoring API、Passcode、Token 与高权限接口面
5. 蓝队如何从访问日志与 SonarQube 自身日志中识别这类打点

---

## 0. 攻击面概览

### 0.1 常见路径

首轮至少应枚举：

- `/sessions/new`
- `/api/system/status`
- `/api/server/version`
- `/api/projects/search`
- `/api/components/search`
- `/api/components/tree`
- `/api/measures/component`
- `/api/measures/component_tree`
- `/api/issues/search`
- `/api/hotspots/search`
- `/api/sources/raw`
- `/api/metrics/search`
- `/api/project_analyses/search`
- `/api/monitoring/metrics`
- `/web_api`

如果目标为较新版本，还应关注：

- `/api/navigation/global`
- `/api/authentication/validate`
- `/api/qualitygates/project_status`

### 0.2 打点收益优先级

按“最快转化为真实攻击价值”的顺序，SonarQube 常见收益可排列为：

1. 确认版本、系统状态与 API 面
2. 枚举 public project 与项目 key
3. 枚举 components、files、directories 与源码路径
4. 回收 measures、issues、hotspots 与分析历史
5. 判断 monitoring、token、passcode 与更高权限接口是否存在

---

## 1. 第一轮打点：确认是否为 SonarQube

### 1.1 登录页识别

#### 请求示例

```http
GET /sessions/new HTTP/1.1
Host: sonar.target.example
User-Agent: Mozilla/5.0
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Set-Cookie: JWT-SESSION=eyJ...; Path=/; HttpOnly
```

正文与静态资源中常见特征包括：

- `SonarQube`
- `Code quality and code security`
- `JWT-SESSION`

这足以确认目标是 SonarQube Web 管理面。

### 1.2 系统状态接口

#### 请求示例

```http
GET /api/system/status HTTP/1.1
Host: sonar.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "id": "AZA-1234",
  "version": "10.8.1.101195",
  "status": "UP"
}
```

这条响应的价值包括：

- 直接给出系统版本
- 确认当前实例处于可服务状态
- 帮助后续判断是否需要继续核查版本相关风险面

### 1.3 版本接口

#### 请求示例

```http
GET /api/server/version HTTP/1.1
Host: sonar.target.example
Accept: text/plain
Connection: close
```

#### 典型响应示例

```text
10.8.1.101195
```

相比复杂 JSON，这条接口更适合快速自动化识别与版本归档。

### 1.4 Web API 文档入口

SonarSource 官方文档明确说明，实例通常会在顶部帮助入口中提供 Web API 文档，对应页面常见为 `/web_api`。

#### 请求示例

```http
GET /web_api HTTP/1.1
Host: sonar.target.example
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
```

如果这个页面可直接访问，意味着：

- 目标暴露了完整的 API 能力索引
- 后续可以按 service、path、参数结构更高效地制定打点请求

---

## 2. 第二轮打点：项目与组件枚举

### 2.1 枚举项目

SonarSource 的 Web API 文档明确表明，项目相关对象以 project key 为核心索引。对打点来说，第一步通常不是直接猜源码路径，而是先拿到 project key。

#### 请求示例

```http
GET /api/projects/search?p=1&ps=20 HTTP/1.1
Host: sonar.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "paging": {
    "pageIndex": 1,
    "pageSize": 20,
    "total": 2
  },
  "components": [
    {
      "key": "corp_payment_api",
      "name": "payment-api",
      "qualifier": "TRK",
      "visibility": "public",
      "lastAnalysisDate": "2026-06-12T15:11:22+0800",
      "revision": "7d2b1ad4"
    },
    {
      "key": "corp_gateway",
      "name": "gateway",
      "qualifier": "TRK",
      "visibility": "public"
    }
  ]
}
```

这类响应一旦出现，就能直接回收：

- 项目 key
- 项目名
- 可见性
- 最近分析时间
- 代码 revision 线索

### 2.2 枚举组件

项目 key 拿到后，下一步通常是判断它的目录树和文件结构。

#### 请求示例

```http
GET /api/components/tree?component=corp_payment_api&qualifiers=DIR,FILE&p=1&ps=20 HTTP/1.1
Host: sonar.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "baseComponent": {
    "key": "corp_payment_api",
    "name": "payment-api",
    "qualifier": "TRK"
  },
  "components": [
    {
      "key": "corp_payment_api:src/main/java/com/corp/payment",
      "name": "payment",
      "qualifier": "DIR",
      "path": "src/main/java/com/corp/payment"
    },
    {
      "key": "corp_payment_api:src/main/resources/application-prod.yml",
      "name": "application-prod.yml",
      "qualifier": "FIL",
      "path": "src/main/resources/application-prod.yml",
      "language": "yaml"
    }
  ]
}
```

这一步的打点价值非常高，因为它直接把：

- 目录树
- 文件路径
- 语言类型

结构化地暴露出来。比起完整克隆代码仓，它更适合低噪音按需回收高价值文件。

### 2.3 继续缩小范围到高价值文件

实际项目里，优先级通常更高的文件包括：

- `application-prod.yml`
- `application.yml`
- `bootstrap.yml`
- `Dockerfile`
- `.gitlab-ci.yml`
- `pom.xml`
- `package.json`
- `sonar-project.properties`

因此在 `components/tree` 之后，通常应优先记录这些路径，再进入源码或原始文件接口测试。

---

## 3. 第三轮打点：源码与文件内容

### 3.1 `/api/sources/raw`

SonarQube 的 Sources API 在 public project 或具备 browse 权限的前提下，可以直接回收源码原文。这是打点阶段极具价值的能力，因为它不需要 Git 凭据，也不依赖代码仓公开。

#### 请求示例

```http
GET /api/sources/raw?key=corp_payment_api:src/main/resources/application-prod.yml HTTP/1.1
Host: sonar.target.example
Connection: close
```

#### 典型响应示例

```yaml
spring:
  datasource:
    url: jdbc:mysql://10.10.40.8:3306/payment
    username: payment_app
  redis:
    host: 10.10.41.12
eureka:
  client:
    serviceUrl:
      defaultZone: http://eureka.internal.local:8761/eureka
```

这类响应会直接暴露：

- 数据库地址
- Redis 地址
- 注册中心地址
- 环境配置命名

即使没有明文密码，也足以把后续打点面迅速扩展到数据库、缓存、注册中心和内部域名。

### 3.2 源码文件回收

#### 请求示例

```http
GET /api/sources/raw?key=corp_payment_api:src/main/java/com/corp/payment/controller/AdminController.java HTTP/1.1
Host: sonar.target.example
Connection: close
```

#### 典型响应示例

```java
@RestController
@RequestMapping("/admin")
public class AdminController {
  @GetMapping("/export")
  public ResponseEntity<byte[]> exportUsers() { ... }
}
```

对打点来说，这种源码回收的价值在于：

- 发现隐藏管理接口
- 发现调试接口、导出接口、内部控制器
- 把 SonarQube 打点直接转化为后续 Web/API 攻击清单

### 3.3 失败响应的意义

#### 请求示例

```http
GET /api/sources/raw?key=corp_payment_api:src/main/resources/application-prod.yml HTTP/1.1
Host: sonar.target.example
Connection: close
```

#### 典型失败响应示例

```json
{
  "errors": [
    {
      "msg": "Insufficient privileges"
    }
  ]
}
```

即使这里只返回权限不足，同样很有价值，因为它能帮助你确认：

- 项目存在
- 文件 key 有效
- 当前身份只有 metadata 浏览权限，没有源码读取权限

---

## 4. 第四轮打点：Measures、Metrics 与分析历史

### 4.1 `/api/measures/component`

SonarSource 官方文档把 `/api/measures` 作为标准示例接口。对打点来说，这类接口的价值不只是代码统计，而是能帮助判断项目规模、复杂度、热点与整改压力。

#### 请求示例

```http
GET /api/measures/component?component=corp_payment_api&metricKeys=ncloc,code_smells,complexity,vulnerabilities,security_hotspots HTTP/1.1
Host: sonar.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "component": {
    "key": "corp_payment_api",
    "name": "payment-api",
    "qualifier": "TRK",
    "measures": [
      {
        "metric": "complexity",
        "value": "4214"
      },
      {
        "metric": "code_smells",
        "value": "8595"
      },
      {
        "metric": "ncloc",
        "value": "51667"
      },
      {
        "metric": "vulnerabilities",
        "value": "12"
      }
    ]
  }
}
```

这类响应可以帮助判断：

- 项目规模
- 复杂度
- 是否值得继续围绕 issue 与 hotspot 做更细打点

### 4.2 `/api/metrics/search`

#### 请求示例

```http
GET /api/metrics/search?p=1&ps=20 HTTP/1.1
Host: sonar.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "total": 3,
  "metrics": [
    {
      "key": "ncloc",
      "name": "Lines of code",
      "type": "INT"
    },
    {
      "key": "vulnerabilities",
      "name": "Vulnerabilities",
      "type": "INT"
    },
    {
      "key": "security_hotspots",
      "name": "Security Hotspots",
      "type": "INT"
    }
  ]
}
```

这一步更像“枚举可测维度”，后续可以帮助你选择最适合项目的指标组合。

### 4.3 `/api/project_analyses/search`

#### 请求示例

```http
GET /api/project_analyses/search?project=corp_payment_api&p=1&ps=20 HTTP/1.1
Host: sonar.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "analyses": [
    {
      "key": "AYx123",
      "date": "2026-06-12T15:11:22+0800",
      "events": [
        {
          "category": "VERSION",
          "name": "2.14.7"
        }
      ]
    }
  ]
}
```

这类响应对打点很有价值，因为它会暴露：

- 发布节奏
- 版本迭代
- 代码审计与上线时间关系

---

## 5. 第五轮打点：Issues、Hotspots 与监控接口

### 5.1 `/api/issues/search`

Issue API 是 SonarQube 打点里最容易被低估的一类接口，因为它的返回结果不仅仅是漏洞数量，还会给出文件、规则、严重级别和问题类型。

#### 请求示例

```http
GET /api/issues/search?projects=corp_payment_api&types=VULNERABILITY,CODE_SMELL&p=1&ps=20 HTTP/1.1
Host: sonar.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "total": 2,
  "issues": [
    {
      "key": "AXy-1",
      "rule": "java:S2077",
      "severity": "MAJOR",
      "component": "corp_payment_api:src/main/java/com/corp/payment/dao/UserDao.java",
      "message": "Make sure using a dynamically formatted SQL query is safe here."
    },
    {
      "key": "AXy-2",
      "rule": "java:S5145",
      "severity": "CRITICAL",
      "component": "corp_payment_api:src/main/java/com/corp/payment/web/RedirectController.java",
      "message": "Change this code to not construct the URL from user-controlled data."
    }
  ]
}
```

对攻击者来说，这类响应几乎就是高价值漏洞路线图：

- 哪些文件值得优先复核
- 哪些规则与注入、重定向、认证问题有关
- 哪些组件最可能继续命中真实漏洞

### 5.2 `/api/hotspots/search`

#### 请求示例

```http
GET /api/hotspots/search?projectKey=corp_payment_api&p=1&ps=20 HTTP/1.1
Host: sonar.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "paging": {
    "pageIndex": 1,
    "pageSize": 20,
    "total": 1
  },
  "hotspots": [
    {
      "key": "AZhot1",
      "component": "corp_payment_api:src/main/java/com/corp/payment/config/SecurityConfig.java",
      "securityCategory": "auth",
      "vulnerabilityProbability": "HIGH"
    }
  ]
}
```

这类返回结果非常适合帮助你快速聚焦：

- 认证配置
- 重定向
- 加密配置
- 路径控制

### 5.3 `/api/monitoring/metrics` 与 `X-Sonar-Passcode`

SonarSource 文档明确说明，部分监控接口不使用 bearer token，而使用 `X-Sonar-Passcode`。这意味着：

- 如果在别处拿到 `sonar.web.systemPasscode`
- 就可以直接探测监控接口

#### 请求示例

```http
GET /api/monitoring/metrics HTTP/1.1
Host: sonar.target.example
X-Sonar-Passcode: changeme-sonar-pass
Accept: application/json
Connection: close
```

#### 典型成功响应示例

```json
{
  "name": "jvm_memory_used_bytes",
  "description": "JVM used memory",
  "domain": "jvm",
  "value": 7.36432128E8
}
```

#### 典型失败响应示例

```json
{
  "errors": [
    {
      "msg": "Insufficient privileges"
    }
  ]
}
```

这一步的打点价值不只是“看监控值”，而是验证：

- 是否存在 passcode 机制
- passcode 是否可能从配置文件、CI、日志或镜像中泄露
- 管理与监控接口是否分离

### 5.4 Token 过期头

SonarSource 官方文档还提到，使用 token 调用 API 时，响应会带上 `SonarQube-Authentication-Token-Expiration` 头。

#### 典型响应头示例

```http
SonarQube-Authentication-Token-Expiration: 2026-09-01T10:20:30+0000
```

这类头信息虽然不直接构成漏洞，但对打点很有价值，因为它能帮助确认：

- 当前 token 是否真实有效
- token 生命周期与运维习惯

---

## 6. 打点流程建议

更稳的 SonarQube 打点流程通常如下：

### 6.1 第一轮：识别与版本

优先请求：

- `/sessions/new`
- `/api/system/status`
- `/api/server/version`
- `/web_api`

目标：

- 确认产品
- 确认版本
- 确认 API 文档面

### 6.2 第二轮：项目与目录

优先请求：

- `/api/projects/search`
- `/api/components/tree`

目标：

- 回收 project key
- 还原文件树和高价值路径

### 6.3 第三轮：源码与配置

优先请求：

- `/api/sources/raw`
- `/api/components/tree`

目标：

- 按需回收配置文件
- 定位控制器、脚本、部署文件

### 6.4 第四轮：指标、Issue、Hotspot

优先请求：

- `/api/measures/component`
- `/api/metrics/search`
- `/api/issues/search`
- `/api/hotspots/search`
- `/api/project_analyses/search`

目标：

- 判断项目规模
- 获取代码风险路线图
- 回收版本与分析历史

### 6.5 第五轮：高权限接口判断

在已有 token 或 passcode 线索后继续：

- `/api/monitoring/metrics`
- 其它 Admin / token / settings 类接口

目标：

- 判断是否存在从“项目只读面”扩大到“系统管理面”的可能

---

## 7. 蓝队检测与处置

### 7.1 访问日志中的高价值信号

应重点识别：

- 对 `/api/system/status`、`/api/server/version` 的探测
- 对 `/api/projects/search`、`/api/components/tree` 的批量枚举
- 对 `/api/sources/raw` 的连续读取
- 对 `/api/issues/search`、`/api/hotspots/search` 的异常访问
- 对 `/api/monitoring/metrics` 与 `X-Sonar-Passcode` 相关请求

#### 日志示例

```text
10.10.10.21 - - [13/Jun/2026:02:11:11 +0800] "GET /api/projects/search?p=1&ps=20 HTTP/1.1" 200 1834 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [13/Jun/2026:02:11:19 +0800] "GET /api/components/tree?component=corp_payment_api&qualifiers=DIR,FILE&p=1&ps=20 HTTP/1.1" 200 2951 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [13/Jun/2026:02:11:27 +0800] "GET /api/sources/raw?key=corp_payment_api:src/main/resources/application-prod.yml HTTP/1.1" 200 431 "-" "curl/8.7.1"
```

第三条通常应被视为高优先级事件，因为它意味着攻击者已经从项目枚举进入文件内容回收阶段。

### 7.2 SonarQube 自身日志中的调查点

SonarQube 应用日志常能提供：

- API 调用
- 权限不足日志
- monitoring 接口访问
- token 与 passcode 相关失败请求

#### 日志示例

```text
INFO web[][o.s.s.w.WebServiceEngine] GET 200 /api/projects/search | time=18ms
```

```text
INFO web[][o.s.s.w.WebServiceEngine] GET 200 /api/sources/raw | component=corp_payment_api:src/main/resources/application-prod.yml | time=9ms
```

```text
WARN web[][o.s.s.w.WebServiceEngine] GET 401 /api/monitoring/metrics | insufficient privileges
```

这类日志如果与外层反向代理日志能对齐，通常足够还原完整打点路径。

### 7.3 处置建议

发现 SonarQube 正在被打点后，应优先做：

1. 复核 public project 范围
2. 检查是否允许匿名访问 `/api/projects/search`、`/components/tree`、`/sources/raw`
3. 审核 token 与 passcode 使用情况
4. 检查是否有高价值配置文件被访问
5. 审核 monitoring API 是否暴露过宽

长期建议：

- 最小化 public project
- 收紧 Browse 权限与源码查看权限
- 对高价值配置文件避免直接进入公开项目
- 审核 `X-Sonar-Passcode` 的配置与保管方式
- 对源码读取类 API 建立专门检测

---

## 8. 复盘清单

### 8.1 红队侧

- 是否确认了版本与 system status
- 是否拿到了 project key 与目录树
- 是否回收了配置文件、控制器或部署文件
- 是否用 issues 与 hotspots 建立了漏洞路线图
- 是否验证了 monitoring 与 passcode 面

### 8.2 蓝队侧

- 是否能识别从项目枚举到源码回收的连续访问
- 是否能识别 issues / hotspots 的异常批量查询
- 是否能识别 monitoring API 的 passcode 探测
- 是否能从应用日志中还原具体被读取的 component key

### 8.3 应急侧

- 是否确认 public project 是否暴露了敏感源码和配置
- 是否确认 token/passcode 是否已泄露
- 是否确认高价值项目是否已被批量枚举
- 是否完成源码读取类 API 的访问范围收敛

---

## 9. 总结

`SonarQube` 的风险不只是“代码质量面板可见”，而是它常常在同一套 Web API 中同时暴露：

- 项目 key
- 文件树
- 源码内容
- 指标与分析历史
- Issue 与安全热点
- Monitoring 与 token / passcode 面

对打点来说，更值得沉淀的方法学是：

- 先确认版本与状态
- 再枚举项目与目录
- 再读取高价值文件
- 最后用 measures、issues、hotspots 和 monitoring 接口扩大收益判断

这样才能把“代码质量平台可访问”真正转化成结构化的攻击价值。

---

## 参考资料

- [SonarQube Server Web API](https://docs.sonarsource.com/sonarqube-server/extension-guide/web-api)
- [SonarQube Server Web API 10.8](https://docs.sonarsource.com/sonarqube-server/10.8/extension-guide/web-api)
- [SonarQube Server Web API 10.4](https://docs.sonarsource.com/sonarqube-server/10.4/extension-guide/web-api)
