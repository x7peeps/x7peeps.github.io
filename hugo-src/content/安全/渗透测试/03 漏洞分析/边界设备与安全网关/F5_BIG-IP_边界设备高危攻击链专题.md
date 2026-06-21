---
title: "F5 BIG-IP 边界设备高危攻击链专题"
date: 2026-06-16T16:45:00+08:00
draft: false
tags: ["F5", "BIG-IP", "TMUI", "请求走私", "认证绕过", "RCE", "漏洞链", "漏洞分析"]
categories: ["漏洞分析"]
description: "F5 BIG-IP 近年最具代表性的高危漏洞链专题：CVE-2023-46747 AJP 请求走私未授权 RCE 与 CVE-2022-1388 HTTP 头跳传认证绕过，均已被在野利用。"
---

# F5 BIG-IP 边界设备高危攻击链专题

F5 BIG-IP 是企业级应用交付控制器（ADC）和负载均衡器的代表产品，广泛应用于全球企业边界和核心业务入口。近年 BIG-IP 连续出现多个高危漏洞，且都被在野利用，形成了一条清晰的攻击演进线。

本文聚焦两个最具代表性的漏洞：

- **CVE-2023-46747**：AJP 请求走私导致的未授权 RCE，CVSS 9.8
- **CVE-2022-1388**：HTTP Connection header 跳传导致的认证绕过，CVSS 9.8

这两个漏洞的共同教训是：**BIG-IP 管理接口绝不可暴露在互联网**，且应始终假设未修补设备已被入侵并进行取证排查。

文章以公开权威资料为基础，偏重研究与防守视角，不提供可直接攻击公网目标的一键利用代码。

## 0x01 漏洞背景与影响范围

### 1. BIG-IP 的攻击面价值

BIG-IP 通常部署在企业网络边界，承担：

- 负载均衡与流量分发
- SSL/TLS 卸载
- Web 应用防火墙（WAF）
- 全局服务器负载均衡（GSLB）
- 远程访问门户

一旦 BIG-IP 失陷，攻击者可以：

- 拦截、篡改所有经过的流量
- 窃取用户凭据和会话
- 横向进入内网核心系统
- 部署持久化后门

### 2. 两个漏洞的定位

| 漏洞 | 类型 | CVSS | 首次公开 | 在野利用 |
|---|---|---|---|---|
| **CVE-2022-1388** | 认证绕过 | 9.8 | 2022-05 | 是，72 小时内大规模武器化 |
| **CVE-2023-46747** | 未授权 RCE | 9.8 | 2023-10 | 是，国家级攻击者利用 |

### 3. 受影响产品

两个漏洞都影响 BIG-IP 的 **Traffic Management User Interface (TMUI)** 组件，这是 BIG-IP 的 Web 管理界面。

| 漏洞 | 受影响版本 |
|---|---|
| CVE-2022-1388 | BIG-IP 16.1.0-16.1.2, 15.1.0-15.1.5, 14.1.0-14.1.4, 13.1.0-13.1.4, 12.1.0-12.1.6 |
| CVE-2023-46747 | BIG-IP 17.1.0-17.1.0, 16.1.0-16.1.4, 15.1.0-15.1.10, 14.1.0-14.1.5, 13.1.0-13.1.5 |

## 0x02 CVE-2022-1388: HTTP Connection Header 认证绕过

### 1. 漏洞原理

CVE-2022-1388 的本质是 **HTTP Connection header 的 header 跳传机制**被恶意利用。

根据 RFC 2616 §14.10 规定，`Connection` header 中列出的其他 header 应该在转发时被删除。BIG-IP 的 Apache 前端在转发请求到后端 Jetty 时，会按照这个规则删除 `Connection` 中列出的 header。

攻击者构造如下请求：

```
POST /mgmt/tm/util/bash HTTP/1.1
Host: target
Connection: X-F5-Auth-Token
X-F5-Auth-Token: admin
Content-Type: application/json

{"command":"run","utilCmdArgs":"-c 'id'"}
```

Apache 前端看到 `Connection: X-F5-Auth-Token`，就会在转发时删除 `X-F5-Auth-Token` header。但后端 Jetty 收到请求后，发现没有认证 header，却**错误地将其视为内部可信请求**，从而绕过认证。

### 2. 利用条件

- BIG-IP 管理接口（TMUI）暴露在互联网
- 未启用 IP 白名单或 MFA

### 3. 利用后果

攻击者可以：

- 执行任意系统命令（root 权限）
- 创建管理员账户
- 导出配置和证书
- 部署 webshell

### 4. 在野利用情况

- **2022-05-04**：F5 发布安全公告
- **2022-05-05**：公开 PoC 出现
- **2022-05-07**：72 小时内即被大规模武器化利用
- 攻击者主要投递 webshell 和挖矿程序
- CISA 将其加入 KEV 目录

## 0x03 CVE-2023-46747: AJP 请求走私未授权 RCE

### 1. 漏洞原理

CVE-2023-46747 的本质是 **AJP 请求走私**。

BIG-IP 的 TMUI 架构是：Apache 前端 + Tomcat 后端，两者通过 AJP 协议通信。攻击者利用 Apache 和 Tomcat 对 `Transfer-Encoding: chunked, chunked` 的解析差异，将恶意 AJP 包走私进后端。

具体步骤：

1. **请求走私**：构造特殊的 `Transfer-Encoding` header，使 Apache 和 Tomcat 对请求边界的理解不一致
2. **AJP 注入**：将恶意 AJP 请求走私到 Tomcat 后端
3. **认证绕过**：在 AJP 请求中注入 `remote_user=admin` 和 `REMOTEROLE=0` 属性，绕过 TMUI 认证
4. **创建管理员**：通过 TMUI 的 REST API 创建新的管理员账户
5. **执行命令**：使用新创建的管理员账户登录 TMUI，执行任意系统命令

### 2. 配合 CVE-2023-46748

CVE-2023-46747 通常配合 **CVE-2023-46748**（SQL 注入）使用，形成完整的武器化路径：

- CVE-2023-46748：通过 SQL 注入获取 BIG-IP 配置和凭据
- CVE-2023-46747：通过请求走私执行任意命令

### 3. 利用条件

- BIG-IP TMUI 暴露在互联网
- 未启用 IP 白名单或 MFA

### 4. 在野利用情况

- **2023-10-25**：F5 发布安全公告
- **2023-10-31**：CISA 发布联合通告，确认在野利用
- 攻击者为**国家级攻击者**，目标包括政府、国防、关键基础设施
- 攻击者部署了持久化后门和隧道工具

## 0x04 高级利用姿势

### 1. 请求走私的隐蔽性

CVE-2023-46747 的请求走私技术具有很高的隐蔽性：

- 利用协议层面的解析差异，而非简单的 payload 注入
- 流量特征不明显，传统 WAF 难以检测
- 可以在不触发告警的情况下绕过认证

### 2. 管理接口的完全控制

一旦绕过认证进入 TMUI，攻击者可以：

- 创建新的管理员账户，即使原账户被禁用也能保持访问
- 导出 SSL 证书和私钥，用于中间人攻击
- 配置 iRule 脚本，在流量层面植入后门
- 修改负载均衡配置，将流量重定向到攻击者控制的服务器

### 3. 持久化与横向移动

- 部署 webshell 到 `/usr/local/www/` 目录
- 配置 SSH 密钥，保持持久化访问
- 利用 BIG-IP 作为跳板，横向进入内网
- 部署隧道工具（如 REGEORG、LIGOLO），建立隐蔽通道

### 4. 流量拦截与篡改

BIG-IP 作为流量入口，攻击者可以：

- 拦截所有经过的 HTTPS 流量
- 窃取用户凭据和会话令牌
- 篡改响应内容，注入恶意脚本
- 进行中间人攻击，解密加密流量

## 0x05 日志痕迹与应急排查

### 1. CVE-2022-1388 的检测指标

**网络层指标**：

- 对 `/mgmt/tm/` 路径的异常 POST 请求
- `Connection` header 中包含 `X-F5-Auth-Token` 的请求
- 来自非管理 IP 的 TMUI 访问

**认证日志**：

- 无认证 header 但成功执行管理操作的记录
- 异常的 bash 命令执行记录

**文件层指标**：

- `/usr/local/www/` 目录下出现新的 PHP/CGI 文件
- `/tmp/` 目录下出现可疑脚本

### 2. CVE-2023-46747 的检测指标

**网络层指标**：

- `Transfer-Encoding: chunked, chunked` 或类似的异常 header
- 对 `/mgmt/tm/util/bash` 的异常请求
- AJP 协议相关的异常流量

**认证日志**：

- 新创建的管理员账户
- 异常的登录时间和来源 IP

**文件层指标**：

- `/config/` 目录下出现异常文件
- `/var/log/` 目录下日志被清空或篡改

### 3. 通用排查建议

**立即排查**：

1. 检查 TMUI 访问日志，回溯到漏洞公开前 30 天
2. 审查所有管理员账户的创建时间和来源
3. 检查 `/usr/local/www/`、`/tmp/`、`/var/` 目录下的可疑文件
4. 审查 iRule 脚本，检查是否有异常配置
5. 检查 SSH 密钥和 authorized_keys 文件

**取证工具**：

- F5 官方提供的 IOC 检测脚本
- 第三方威胁狩猎工具（如 Mandiant、CrowdStrike）

## 0x06 修复建议

### 1. 紧急措施

1. **立即升级**到修复版本：
   - CVE-2022-1388：17.0.0, 16.1.3, 15.1.6, 14.1.5, 13.1.5
   - CVE-2023-46747：17.1.0.1, 16.1.4.1, 15.1.10.1, 14.1.5.1, 13.1.5.1

2. **限制 TMUI 访问**：
   - 仅允许受信 IP 访问管理接口
   - 禁止 TMUI 暴露在互联网
   - 使用 VPN 或跳板机访问管理界面

3. **启用 MFA**：
   - 为所有管理员账户启用多因素认证
   - 使用硬件令牌或 TOTP

### 2. 加固措施

4. **审查管理员账户**：
   - 删除未使用或异常的管理员账户
   - 定期轮换管理员密码

5. **监控异常流量**：
   - 部署 IDS/IPS 检测请求走私
   - 监控 TMUI 访问日志

6. **定期取证排查**：
   - 即使已打补丁，也应定期运行 IOC 检测
   - 检查是否有持久化后门

### 3. 长期策略

7. **网络分段**：
   - 将管理接口放在独立的管理 VLAN
   - 限制管理接口的网络可达性

8. **零信任架构**：
   - 不依赖网络边界作为唯一防线
   - 对所有管理操作进行严格审计

## 0x07 总结

F5 BIG-IP 近年两个最具代表性的高危漏洞，揭示了边界设备安全的几个关键教训：

1. **管理接口暴露是最大风险**：两个漏洞都要求 TMUI 暴露在互联网，这是根本原因
2. **协议层面的漏洞难以检测**：请求走私和 header 跳传都是协议层面的问题，传统 WAF 难以防护
3. **补丁不等于安全**：即使打了补丁，如果设备已被入侵，攻击者可能已部署持久化后门
4. **在野利用速度极快**：CVE-2022-1388 在公告后 72 小时内即被大规模武器化
5. **国家级攻击者参与**：CVE-2023-46747 被国家级攻击者用于针对政府和关键基础设施

这两个漏洞的共同教训是：**BIG-IP 管理接口绝不可暴露在互联网**，且应始终假设未修补设备已被入侵并进行取证排查。

## 0x08 参考资料

- [F5 安全公告 K000137391 (CVE-2022-1388)](https://my.f5.com/manage/s/article/K000137391)
- [F5 安全公告 K000139995 (CVE-2023-46747)](https://my.f5.com/manage/s/article/K000139995)
- [NVD - CVE-2022-1388](https://nvd.nist.gov/vuln/detail/CVE-2022-1388)
- [NVD - CVE-2023-46747](https://nvd.nist.gov/vuln/detail/CVE-2023-46747)
- [CISA 联合通告 (CVE-2023-46747)](https://www.cisa.gov/news-events/cybersecurity-advisories/aa23-305a)
- [CISA KEV - CVE-2022-1388](https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=CVE-2022-1388)
- [Assetnote CVE-2022-1388 分析](https://www.assetnote.io/resources/research/analysis-of-cve-2022-1388-f5-big-ip-authentication-bypass)
- [Horizon3.ai CVE-2023-46747 分析](https://www.horizon3.ai/attack-research/cve-2023-46747-f5-big-ip-unauthenticated-rce/)
- [Rapid7 CVE-2022-1388 分析](https://www.rapid7.com/blog/post/2022/05/05/cve-2022-1388-f5-big-ip-rest-authentication-bypass-fixed/)
- [Mandiant CVE-2023-46747 威胁情报](https://cloud.google.com/blog/topics/threat-intelligence/f5-big-ip-vulnerability-exploited/)
