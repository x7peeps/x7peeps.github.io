---
title: "常见高危 RCE 产品线清单"
date: 2026-06-15T14:10:00+08:00
draft: false
tags: ["RCE", "专题地图", "漏洞分析", "产品线"]
categories: ["漏洞分析"]
---

# 常见高危 RCE 产品线清单

这份清单用于持续补齐知识库中的高危远程代码执行漏洞专题。排序优先级综合考虑以下因素：

- 公网暴露程度
- 是否预认证
- 是否已进入 KEV / 已在野利用
- 是否具备管理面或控制面接管价值
- 是否容易形成批量化利用或供应链影响

## 0x01 P0 级优先补齐

### 1. 边界设备与安全网关
- Ivanti Connect Secure / Policy Secure / Secure Access
- Palo Alto PAN-OS
- Citrix NetScaler / ADC / Gateway
- Fortinet FortiOS / FortiProxy / FortiWeb
- Check Point VPN / Remote Access
- Cisco SD-WAN / AnyConnect / 安全管理面

### 2. 文件传输与数据交换平台
- MOVEit Transfer
- GoAnywhere MFT
- Accellion FTA

### 3. 远程支持与 RMM
- ConnectWise ScreenConnect
- Kaseya
- SimpleHelp
- AnyDesk / TeamViewer 企业侧生态（如存在高危 RCE）

### 4. 邮件与协作基础设施
- Microsoft Exchange
- Microsoft SharePoint
- Atlassian Confluence
- Seafile
- 企业微信私有化部署

## 0x02 P1 级重点补齐

### 5. CI/CD 与构建发布平台
- JetBrains TeamCity
- Jenkins
- GitLab
- Sonatype Nexus / Artifactory（如出现高危 RCE）

### 6. IT 运维与系统管理平台
- Zoho ManageEngine
- PaperCut
- Quest KACE
- Cisco CUCM / 管理组件

### 7. 企业应用与 CMS
- XunruiCMS
- J2eeFAST
- Swagger UI
- 其他常见政企 CMS / OA / ERP

## 0x03 P2 级长期专题

### 8. Java 组件与框架生态
- Spring Framework
- Apache Commons Collections
- Apache HttpClient
- SnakeYAML
- Bouncy Castle
- Log4j

### 9. Microsoft 平台与内核组件
- Windows HTTP.sys
- Windows Kernel
- AD DS
- RDP Client
- Hyper-V
- AKS

### 10. 网络协议与基础库
- OpenSSL
- HTTP/2 实现
- FreeType
- 其他被广泛复用的解析库与加密组件

## 0x04 当前已覆盖情况

截至 2026-07-09，以下产品线已完成**家族专题文章**（单文件完整展示 + 完整 PoC 代码）：

| 产品线 | 专题文章 | 覆盖 CVE 数 |
|--------|----------|------------|
| 边界设备与安全网关 | Cisco ASA/FTD / F5 BIG-IP / Pulse Secure / Ivanti / PAN-OS / FortiOS / Citrix / SonicWall / Check Point / Sophos / WatchGuard / Zyxel / **PAN-OS 单独专题** / **Juniper Junos** | 23+ |
| 文件传输与数据交换平台 | MOVEit / GoAnywhere / WS_FTP | 3 |
| 远程支持与RMM | ConnectWise ScreenConnect / Kaseya / SimpleHelp | 4 |
| Java 组件与框架生态 | Log4Shell / Commons Collections / SnakeYAML / Spring / Bouncy Castle | 7 |
| Microsoft 产品与平台 | Exchange / SharePoint / Hyper-V / HTTP.sys / AD DS / AKS | 10+ |
| Oracle 产品 | WebLogic / Forms / WebCenter / PeopleSoft | 6 |
| Cisco 产品 | AnyConnect / CUCM / SD-WAN | 3 |
| 网络协议与基础库 | HTTP/2 Rapid Reset / OpenSSL / FreeType | 7 |
| 企业应用与CMS | Swagger UI / J2eeFAST / XunruiCMS / Ivanti Sentry / Check Point VPN / **Progress Telerik** | 12+ |
| CI/CD 与构建发布平台 | TeamCity / Jenkins / GitLab / **Sonatype Nexus / JFrog Artifactory** | 12+ |
| IT 运维与系统管理平台 | ManageEngine / PaperCut / ScreenConnect / Kaseya | 6 |
| 协作与办公平台 | **Zimbra / Nextcloud / OnlyOffice / Roundcube / Rainloop**（+ 已有 Confluence / Seafile / 企业微信） | 8+ |
| **VMware 虚拟化平台** | **vCenter / ESXi / Aria Operations**（Volt Typhoon / Sandworm） | 8+ |
| **Web 中间件** | **JBoss / WildFly / Undertow / Jetty / Tomcat / WebSphere** | 6+ |
| **容器与编排平台** | **runc / containerd / Docker Engine / Kubernetes**（CVE-2024-21626 / CVE-2023-5528 等） | 7+ |
| **身份与密钥管理** | **Keycloak / HashiCorp Vault**（OAuth2 认证绕过 / Shamir 密钥绕过 / OIDC 绕过） | 6+ |
| **数据库系统** | **MySQL / PostgreSQL / Redis / MongoDB**（Lua 沙箱逃逸 / 权限提升 / 缓冲区溢出） | 7+ |
| **消息队列与流处理平台** | **Apache ActiveMQ / RabbitMQ / Apache Kafka / Apache RocketMQ**（OpenWire 反序列化 / 默认凭据 / JMX RCE） | 6+ |
| **监控与可观测性平台** | **Grafana / Prometheus / ELK Stack / Apache Superset / Nagios**（XSS / 路径穿越 / 默认密钥 RCE） | 7+ |
| **API 网关与服务网格** | **Kong / Apache APISIX / Spring Cloud Gateway / Istio / Envoy**（认证绕过 / 默认密钥 / serverless RCE） | 7+ |
| **云原生存储与配置中心** | **MinIO / etcd / Consul / Nacos**（信息泄露→管理员接管 / 未授权访问 / exec RCE / 认证绕过） | 8+ |
| **网络代理与负载均衡** | **Nginx / HAProxy / Traefik**（HTTP/2 Rapid Reset / 请求走私 / 路径穿越 / 命令注入） | 6+ |
| **版本控制与代码托管** | **Gitea / Gogs**（路径穿越 / 认证绕过 / 密码重置 / 未授权访问） | 6+ |
| **低代码与无代码平台** | **Appsmith / NocoDB / ToolJet**（认证绕过 / JS 沙箱逃逸 RCE / 未授权访问） | 7+ |
| **工作流与自动化引擎** | **Apache Airflow / n8n / Camunda**（SSRF→RCE / 认证绕过 / VM2 沙箱逃逸 / Groovy RCE） | 6+ |
| **日志与 SIEM 平台** | **Graylog / Wazuh / Security Onion**（MongoDB 注入 / Pipeline RCE / 命令注入 RCE） | 7+ |
| **网络基础设施** | **BIND 9 / Kea DHCP / Net-SNMP / FRRouting**（DNS 缓存投毒 / DHCP DoS / SNMP 缓冲区溢出 / BGP 路由劫持） | 9+ |
| **备份与灾难恢复** | **Veeam / Commvault / Veritas NetBackup / Acronis / Rubrik / Dell PowerProtect**（硬编码凭据 / 命令注入 / 认证绕过） | 8+ |
| **打印与成像设备** | **Xerox / HP / Brother / Konica Minolta**（缓冲区溢出 RCE / 认证绕过 / LDAP Pass-Back） | 9+ |
| **无线网络基础设施** | **Cisco WLC / Aruba AOS / Ruckus / Ubiquiti UniFi**（命令注入 / 认证绕过 / 硬编码 JWT / 路径遍历 RCE） | 12+ |
| **视频监控与物理安全** | **Hikvision / Dahua / Axis / Milestone / Genetec**（命令注入 / 认证绕过 / 反序列化 RCE / 硬编码密钥） | 10+ |
| **终端管理与 MDM** | **SCCM / Jamf Pro / Workspace ONE / MobileIron**（认证绕过 / 反序列化 RCE / 命令注入 / 路径遍历） | 8+ |
| **身份认证与SSO平台** | **Okta / Auth0 / Ping Identity**（JWT 算法混淆 / 会话劫持 / 认证绕过 / MFA 绕过 / SSRF / XXE） | 10+ |
| **邮件安全网关与反垃圾邮件** | **Barracuda ESG / Proofpoint PPS / FortiMail / Cisco SEG**（tar命令注入 / eval注入 / 栈缓冲区溢出 / 路径遍历） | 10 |
| **LDAP 目录服务与身份存储** | **OpenLDAP / 389 Directory Server / FreeIPA / Windows LDAP**（LDAPBleed UAF RCE / 属性解引用绕过 / PKI Admin Cert绕过） | 11 |
| **虚拟化与超融合平台** | **Proxmox VE / Nutanix / Xen/XCP-ng / QEMU**（沙箱逃逸 / 命令注入 / VM→Dom0提权 / VNC缓冲区溢出） | 10 |
| **NAS与网络存储设备** | **QNAP QTS/QuTS hero / Synology DSM/SRM / Western Digital My Cloud**（认证绕过 / 命令注入 / 路径遍历 RCE / 勒索软件利用链） | 10+ |
| **家用与SMB路由器** | **Netgear / TP-Link / D-Link**（认证绕过 / 命令注入 / 缓冲区溢出 / 僵尸网络利用） | 10+ |
| **智能家居与楼宇控制平台** | **Crestron / Hubitat Elevation / Tuya/Sonoff**（认证绕过 / 默认凭据 / MQTT协议缺陷 / 固件签名绕过） | 12+ |
| **浏览器与文档处理软件** | **LibreOffice / OpenOffice / Mozilla Firefox / Thunderbird**（宏执行绕过 / UAF沙箱逃逸 / JIT类型混淆 / libwebp堆溢出） | 17+ |
| **企业VPN与远程接入平台** | **OpenVPN / WireGuard / Citrix NetScaler ADC/Gateway**（缓冲区溢出 / 认证绕过 / 会话劫持 / 未授权RCE） | 17 |
| **网络监控与管理平台** | **Nagios XI/Core / Cacti / ManageEngine OpManager**（SQL注入RCE / 命令注入 / 认证绕过 / 反序列化） | 19 |

以下产品线已有**单篇 CVE 分析文章**：

- Atlassian Confluence（未授权 RCE 专题，含 CVE-2022-26134 / CVE-2023-22515 / CVE-2023-22527 / CVE-2023-22555 / CVE-2024-21888）
- Apache Tomcat（CVE-2025-24813）
- Seafile（CVE-2025-24813 SQL 注入）
- 企业微信私有化部署（未授权 API）
- Chrome / Chromium V8（CVE-2026-11645）
- WPS Office（WPSSRC-2023-0701）
- 二进制漏洞（汇编与栈帧、ASLR 与 Ret2Libc、ROP 链、堆利用）

## 0x05 下一批建议优先写作

按优先级排序：

### P0 级（已完成 ✅）
1. ~~Sophos / WatchGuard / Zyxel 边界设备~~ ✅
2. ~~Palo Alto PAN-OS 单独专题~~ ✅（CVE-2024-0012/9474/9463/9464/2025-0108/2026-0300 等 7 个 CVE）

### P1 级（已完成 ✅）
3. ~~JetBrains TeamCity~~ ✅
4. ~~Jenkins~~ ✅
5. ~~GitLab~~ ✅
6. ~~Zoho ManageEngine~~ ✅
7. ~~PaperCut~~ ✅

### P2 级（已完成 ✅）
8. ~~协作与办公平台综合专题~~ ✅（Zimbra / Nextcloud / OnlyOffice / Roundcube / Rainloop 等 8 个 CVE）

## 0x06 写作规范

后续每篇继续保持统一结构：

- 漏洞原理
- 漏洞详情
- POC 与验证思路
- 高级利用姿势
- 应急排查与日志痕迹
- 修复与缓解建议
- 参考资料

后续会按新目录持续补齐，并优先把“常见高危 RCE 家族”覆盖完整。
