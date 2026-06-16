---
title: "Emissary-ingress API网关管理面打点与Diag诊断接口利用技术"
date: 2026-06-16T19:20:00+08:00
draft: false
weight: 75
description: "围绕 Emissary-ingress/Ambassador 的 diag、健康检查、内部 admin/diag 端口与默认 Mapping，分析诊断接口暴露后的配置画像恢复、网关行为推断、历史风险链与蓝队处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "API网关", "Emissary", "Ambassador"]
---

# Emissary-ingress API网关管理面打点与Diag诊断接口利用技术

`Emissary-ingress` 在渗透测试里很有代表性，因为它把“调试能力”和“数据面入口”绑得很近。官方文档明确说明：

- 默认会创建允许访问诊断接口的 `Mapping`
- 默认会创建 `/ambassador/v0/check_alive` 与 `/ambassador/v0/check_ready` 的探针映射
- 诊断接口本体运行在 Pod 内部端口
- 如果不显式关闭或重新收口，诊断接口可能被整个集群甚至入口路径访问

对攻击者来说，这类设计非常有价值，因为一旦 `diag` 面暴露，就往往能直接回收：

- 当前 `Mapping` 路由对象
- 上游 `service` 名称与端口
- Listener / Host / Prefix 规则
- TLS / Host 绑定关系
- Envoy 生成配置的状态与更新时间
- 网关健康检查与代理层错误

再结合 `Ambassador Module` 的全局配置项，例如：

- `admin_port`
- `diag_port`
- `diagnostics.enabled`
- `diagnostics.allow_non_local`
- `readiness_probe`
- `liveness_probe`

攻击者就能从一个普通 HTTP 路径，恢复出 Emissary 的诊断边界到底是：

1. 真的只允许本地访问
2. 仅限集群内部
3. 被默认 Mapping 暴露到入口网关
4. 被管理员又额外 host-based 暴露出来

本文重点围绕：

1. 如何识别公开的 Emissary / Ambassador 诊断面
2. 如何围绕 `/ambassador/v0/diag/` 与 `?json=true` 建立路由图谱
3. 如何理解 `diag_port`、`admin_port`、默认 Mapping 与探针路径的关系
4. 哪些暴露属于“默认即危险”，哪些属于高价值错误配置
5. 蓝队如何从 Envoy access log、Emissary 日志与 K8s 变更记录中回溯这类打点

下文请求/响应样例为脱敏后的实战常见结构，重点保留识别点、对象结构和利用判断依据。

---

## 0. 攻击面概览

### 0.1 常见端口与路径

围绕 Emissary/Ambassador，首轮应关注两类面：

#### 对外或经 Mapping 暴露的 HTTP 路径

- `/ambassador/v0/diag/`
- `/ambassador/v0/diag/?json=true`
- `/ambassador/v0/check_alive`
- `/ambassador/v0/check_ready`

#### Pod 内部常见调试端口

- `8877`：diag 服务
- `8001`：Envoy admin

实战中最容易被忽视的一点是：

- 即便 `diag` 服务本体在内部端口
- 只要默认 Mapping 还在
- 入口流量就可能通过普通网关路径直接访问它

### 0.2 官方默认行为

Emissary 官方文档对诊断接口的默认行为描述得非常直接：

- 默认会创建一个允许访问 `/ambassador/v0/diag` 的 Mapping
- 默认会自动创建 readiness / liveness probe Mapping
- 关闭 `diagnostics.enabled` 后，对外路径会返回 `404`
- 但诊断服务本体仍运行在 Pod 内，可从 `localhost:8877` 访问
- 官方专门给出了“如何保护诊断接口”的独立文档

这对打点的意义非常明确：

1. `diag` 暴露不是罕见偏门配置，而是默认设计的一部分
2. 不能只看有没有 8877/8001 端口暴露，还要看网关路径是否映射过去了
3. 即使对外返回 `404`，Pod 内部或集群内部仍可能存在本地诊断面

### 0.3 打点优先级

如果确认目标疑似 Emissary，建议按以下顺序留档：

1. `/ambassador/v0/diag/`
2. `/ambassador/v0/diag/?json=true`
3. `/ambassador/v0/check_alive`
4. `/ambassador/v0/check_ready`
5. 默认/自定义 `diag` Mapping 痕迹
6. 是否还能旁路访问内部 `diag_port` / `admin_port`

---

## 1. 第一轮打点：确认是否为 Emissary / Ambassador 诊断面

### 1.1 `GET /ambassador/v0/diag/`

这是最直接的识别点。

#### 请求示例

```http
GET /ambassador/v0/diag/ HTTP/1.1
Host: edge.target.example
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Connection: close
```

```html
<!doctype html>
<html>
  <head>
    <title>Ambassador Diagnostics</title>
  </head>
  <body>
    <div id="diag-root"></div>
  </body>
</html>
```

页面常见识别点包括：

- `Ambassador Diagnostics`
- `Emissary`
- `Mappings`
- `Clusters`
- `Envoy`

如果页面可见，至少说明：

- 诊断接口没有被完全关闭
- 网关层已经允许你命中它
- 继续请求 JSON 接口通常能拿到更多结构化对象

### 1.2 `GET /ambassador/v0/check_alive`

默认 liveness 探针也常可直接命中。

#### 请求示例

```http
GET /ambassador/v0/check_alive HTTP/1.1
Host: edge.target.example
Accept: text/plain
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8
Connection: close

Ambassador is alive and well
```

这一步能帮助判断：

- 当前路径确实打到了 Emissary 探针映射
- 对方没有把健康检查只留给 kubelet 或本地访问

### 1.3 `GET /ambassador/v0/check_ready`

readiness 路径通常比 `check_alive` 更有状态意义。

#### 请求示例

```http
GET /ambassador/v0/check_ready HTTP/1.1
Host: edge.target.example
Accept: text/plain
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8
Connection: close

ambassador readiness check OK
```

如果 readiness 返回失败、延迟很高或与 `diag` 页面不一致，通常意味着：

- Envoy 生成配置存在问题
- 后端 service 发现异常
- 当前网关处于配置抖动状态

这对后续判断“管理面是否处于生产活跃态”很有帮助。

---

## 2. 第二轮打点：围绕 `diag` 接口恢复路由图与上游关系

### 2.1 `GET /ambassador/v0/diag/?json=true`

`json=true` 是 Emissary 诊断面最值得重点留档的一个参数，因为它通常会返回结构化对象，而不是仅渲染 HTML。

#### 请求示例

```http
GET /ambassador/v0/diag/?json=true HTTP/1.1
Host: edge.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "cluster_info": {
    "envoy_id": "edge-stack-7d8c8bf5d4-lq2pk",
    "cluster_id": "ambassador-default",
    "boot_time": "2026-06-16T11:02:15Z"
  },
  "route_info": [
    {
      "kind": "Mapping",
      "name": "billing-api",
      "namespace": "default",
      "prefix": "/billing/",
      "rewrite": "/",
      "service": "billing.default:8080",
      "cluster": "cluster_billing_default_8080_default"
    },
    {
      "kind": "Mapping",
      "name": "admin-internal",
      "namespace": "ops",
      "prefix": "/internal/admin/",
      "service": "admin-api.ops:9000",
      "cluster": "cluster_admin_api_ops_9000_ops"
    }
  ],
  "active_elements": 42,
  "errors": []
}
```

这一步能直接回收：

- Mapping 名称
- 所属 namespace
- 路由前缀
- rewrite 行为
- 上游 service 与 cluster 名称
- 控制面当前有没有生成错误

对攻击者来说，这等价于直接拿到了：

- 外层路由图
- 内部服务命名
- 哪些路径明显更敏感

### 2.2 从 `Mapping` 对象恢复管理路径

在 Emissary 的实战打点里，最值钱的不只是业务 API，而是那些命名和前缀一眼就能说明用途的路由：

- `/internal/admin/`
- `/grafana/`
- `/argocd/`
- `/actuator/`
- `/debug/`
- `/metrics/`

诊断 JSON 如果返回类似对象：

```json
{
  "kind": "Mapping",
  "name": "grafana-admin",
  "namespace": "monitoring",
  "prefix": "/grafana/",
  "service": "grafana.monitoring:3000"
}
```

那么其价值通常大于普通 `/api/v1/orders` 之类业务路由，因为它直接指向运维或管理平面。

### 2.3 从 `errors` 与更新时间判断配置状态

`diag` 不只给你“现在有什么”，很多时候还会给你“有什么配置错误”。

#### 请求示例

```http
GET /ambassador/v0/diag/?json=true HTTP/1.1
Host: edge.target.example
Accept: application/json
Connection: close
```

#### 典型错误响应片段

```json
{
  "errors": [
    {
      "name": "payments-canary",
      "namespace": "default",
      "error": "service payments-canary.default:8080 has no endpoints"
    },
    {
      "name": "diag-mapping",
      "namespace": "ambassador",
      "error": "service localhost:8777 configured without access restriction"
    }
  ],
  "last_config_update": "2026-06-16T11:06:02Z"
}
```

这些错误信息可帮助推断：

- 哪些配置刚被改动
- 哪些 service 不存在或 endpoint 为空
- 某些隐藏调试映射是否被人显式加回来

---

## 3. 默认 Mapping、内部端口与旁路价值

### 3.1 诊断接口不等于只绑定 Pod 内部

Emissary 的一个高频误区是：

- 运维看到文档说诊断服务在 `localhost:8877`
- 就误以为外部不可能访问

但官方同时说明：

- 默认会创建对外可用的诊断 Mapping

这意味着实战里必须同时检查：

1. 入口路径 `/ambassador/v0/diag/`
2. Pod 内部端口 `8877`
3. Envoy admin 常见端口 `8001`

### 3.2 `diag_port` 与 `admin_port`

历史与当前文档都显示：

- `diag_port` 常见默认值是 `8877`
- `admin_port` 常见默认值是 `8001`

其中：

- `diag_port` 更接近 Emissary 诊断层
- `admin_port` 则是 Envoy 低层管理面

如果攻击者已进入集群内部或拿到 SSRF/端口转发能力，那么这两个端口往往是比入口路径更值钱的下一跳。

### 3.3 关闭 `diagnostics.enabled` 并不代表彻底消失

官方文档明确说明：

- 关闭 `diagnostics.enabled` 后，对外 `/ambassador/v0/diag` 会返回 `404`
- 但服务本体仍可从 Pod 内部 `localhost:8877` 访问

这意味着蓝队和红队都要理解：

- “外部 404” 不等于彻底关闭
- 一旦攻击者有 Pod 内访问、Sidecar SSRF、调试容器、`kubectl port-forward` 或节点级进入能力，诊断面仍然可能被重新访问

### 3.4 `diagnostics.allow_non_local`

文档还提到，除了直接关闭映射，也可以把诊断访问限制为本地。

这类配置的实战意义是：

- 若未设置，默认行为更宽
- 若配置存在但前面还有 Mapping 错配、反代转发或 host-based diag 路由，实际边界可能仍被重新打开

---

## 4. 典型高风险场景

### 4.1 默认 diag 暴露

这是最典型的场景：

1. 安装后保留默认 Mapping
2. 入口流量可直接访问 `/ambassador/v0/diag/`
3. 攻击者读取 JSON 诊断数据
4. 恢复所有 Mapping、服务与 cluster

#### 请求示例

```http
GET /ambassador/v0/diag/?json=true HTTP/1.1
Host: api.target.example
Accept: application/json
Connection: close
```

#### 风险结果

- 网关路由图被完整恢复
- 业务与管理 service 名称一并暴露
- 某些内部路径可被继续直接访问

### 4.2 自定义 host-based 诊断域名暴露

官方给出的“更安全暴露方式”其实是新建一个专门 Mapping，例如：

```yaml
apiVersion: getambassador.io/v3alpha1
kind: Mapping
metadata:
  name: diag-mapping
spec:
  host: diag.example.com
  prefix: /diag/
  rewrite: /diag/
  service: localhost:8777
```

这比默认路径暴露更可控，但如果：

- `diag.example.com` 解析到公网
- 没有再叠加认证/源地址限制

那本质上只是把默认路径暴露改成了单独域名暴露，风险并没有消失。

#### 请求示例

```http
GET /diag/?json=true HTTP/1.1
Host: diag.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "route_info": [
    {
      "name": "diag-mapping",
      "service": "localhost:8777"
    }
  ],
  "errors": []
}
```

### 4.3 只暴露探针但探针本身仍可被利用做识别

即使 `diag` 被关掉，很多环境仍会保留：

- `/ambassador/v0/check_alive`
- `/ambassador/v0/check_ready`

这些路径本身虽然不直接给出完整路由图，但仍然能帮助攻击者：

- 确认产品类型
- 判断是否存在默认 Emissary 部署
- 判断某个域名/入口是不是网关节点

---

## 5. 历史风险与利用判断

### 5.1 诊断面暴露本身就是高价值误配

Emissary 最现实的风险，通常不是“先找一个复杂 0day”，而是：

- 默认诊断 Mapping 未关闭
- 健康检查与诊断路径被入口直接带出
- 管理员又额外创建了对外可达的 diag host

只靠这一层，攻击者就能从黑盒变白盒。

### 5.2 `CVE-2021-36371`：mTLS 证书要求绕过

公开披露的 `CVE-2021-36371` 说明，老版本 Emissary 在特定多 `TLSContext` 场景下，可能被攻击者通过：

- 一个未受保护 backend 的 SNI
- 一个受保护 backend 的 HTTP `Host`

组合使用，绕过后端客户端证书要求。

这类问题本身不属于诊断接口漏洞，但它对打点文章有现实意义：

- 诊断接口能帮助你识别 Host / TLS / Backend 绑定方式
- 一旦环境同时存在历史 TLS 设计缺陷，`diag` 暴露会显著降低利用门槛

#### 风险示意

```http
GET / HTTP/1.1
Host: mtls-protected.target.example
Connection: close
```

TLS 层发送的 `SNI` 则指向另一个未受保护的 backend 域名。

在脆弱版本和特定配置组合里，这会造成：

- 路由命中受保护业务
- 但客户端证书要求被旁路

### 5.3 诊断面如何放大这类 TLS 风险

如果攻击者已经能读取诊断 JSON，就更容易还原：

- 哪些 Host 映射到哪些 service
- 哪些 TLSContext 绑定在相近域名上
- 哪些路径或域名明显属于管理面

因此，诊断暴露虽然未必直接导致绕过，但它会把原本需要大量黑盒试探的 TLS/Host 绑定问题，直接转成白盒配置利用。

---

## 6. 蓝队日志、检测与处置

### 6.1 应优先收集哪些日志

对 Emissary 诊断面事件，优先级最高的是：

- Envoy access log
- Emissary/diagd 日志
- Ingress / LB 访问日志
- Kubernetes 变更审计
- Pod 端口转发或调试操作记录

官方文档明确提到：

- Envoy access log 可自定义格式
- Emissary 自身和 Envoy 都有可提升的 debug 日志

这意味着蓝队不应只看外层 LB，还应保留：

- 诊断路径命中情况
- diag 访问频率
- 配置生成错误

### 6.2 重点检索的路径

应优先关注：

- `/ambassador/v0/diag/`
- `/ambassador/v0/diag/?json=true`
- `/ambassador/v0/check_alive`
- `/ambassador/v0/check_ready`
- 自定义 `/diag/`
- 到 `localhost:8777` 的映射请求

### 6.3 典型访问日志示例

```json
{
  "start_time": "2026-06-16T11:22:14.104Z",
  "method": "GET",
  "path": "/ambassador/v0/diag/?json=true",
  "protocol": "HTTP/1.1",
  "response_code": 200,
  "duration": 4,
  "upstream_host": "127.0.0.1:8877",
  "x_forwarded_for": "198.51.100.39",
  "authority": "edge.target.example"
}
```

这里最值得注意的组合是：

- `path` 是 `diag`
- `upstream_host` 指向 `127.0.0.1:8877`

这几乎可以直接证明：外部请求通过网关命中了内部诊断服务。

### 6.4 Emissary 运行日志示例

```text
2026-06-16 11:22:14 diagd INFO diagnostics request path=/ambassador/v0/diag/ source=198.51.100.39
2026-06-16 11:22:14 diagd INFO generated config snapshot version=1721 routes=38 clusters=42
2026-06-16 11:22:18 envoy INFO [router] upstream request complete upstream=127.0.0.1:8877 path=/ambassador/v0/check_ready
```

### 6.5 应急排查重点

发现异常后，优先核对：

1. `ambassador Module` 中 `diagnostics.enabled`
2. `diagnostics.allow_non_local`
3. 是否存在自定义 diag Mapping
4. 是否仍保留默认 diag Mapping
5. `readiness_probe` / `liveness_probe` 是否被入口直接带出
6. 是否有对 `localhost:8777` 的路由

---

## 7. 加固建议

### 7.1 首先关默认诊断暴露

最优先动作是：

```yaml
apiVersion: getambassador.io/v3alpha1
kind: Module
metadata:
  name: ambassador
spec:
  config:
    diagnostics:
      enabled: false
```

### 7.2 不要把“自定义 diag 域名”当成真正隔离

如果确实需要管理员访问：

- 仅使用专门 host 暴露
- 再叠加源地址限制
- 再叠加认证
- 不要让 `diag.example.com` 成为公网无保护入口

### 7.3 限制本地诊断面

即便关闭外部 Mapping，也应继续限制：

- Pod 内调试面访问来源
- 集群内部对 `8877` / `8001` 的访问
- 节点级端口转发与临时排障开放

### 7.4 审计与告警

至少应为以下行为加告警：

- 访问 `/ambassador/v0/diag/`
- 访问 `?json=true`
- 对外请求被转到 `127.0.0.1:8877`
- 非运维时间对 diag host 的命中

---

## 8. 打点评估清单

遇到 Emissary / Ambassador 目标时，建议至少留档：

1. `/ambassador/v0/diag/` 是否可达
2. `/ambassador/v0/diag/?json=true` 是否返回结构化对象
3. `/ambassador/v0/check_alive`、`/check_ready` 是否直接可访问
4. 响应中是否出现 `Mapping`、`service`、`cluster`、`errors`
5. 是否存在指向 `localhost:8777` 的自定义 Mapping
6. 是否存在 `diag.example.com` 一类单独诊断域名
7. 是否能从日志中证明请求已打到内部 diag 服务
8. 环境是否仍运行受 `CVE-2021-36371` 影响的老版本与脆弱 TLS 设计

---

## 9. 总结

Emissary-ingress 的打点价值非常高，因为它的诊断接口不是纯内部抽象，而是经常通过默认 Mapping 或自定义 Mapping 落到实际 HTTP 路径上。一旦暴露：

- `diag` 页面会告诉你网关正在承载什么
- `json=true` 会把 Mapping、service、cluster 和错误状态结构化返回
- 健康检查路径会帮助你确认入口性质和节点状态
- 内部 `diag_port` / `admin_port` 又为后续集群内旁路提供下一跳

因此，在 `04 渗透攻击` 的语境下，Emissary 的高风险点并不只是“有个诊断页”，而是它可能把网关配置图直接暴露给低信任网络。再叠加历史 TLS 设计风险和集群内部可达条件，诊断接口暴露就会从普通信息收集迅速升级为可利用的白盒配置打点入口。
