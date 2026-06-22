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

截至 2026-06-21，以下产品线已完成**家族专题文章**（单文件完整展示 + 完整 PoC 代码）：

| 产品线 | 专题文章 | 覆盖 CVE 数 |
|--------|----------|------------|
| 边界设备与安全网关 | Cisco ASA/FTD / F5 BIG-IP / Pulse Secure / Ivanti / PAN-OS / FortiOS / Citrix / SonicWall / Check Point Gateway | 10+ |
| 文件传输与数据交换平台 | MOVEit / GoAnywhere / WS_FTP | 3 |
| 远程支持与RMM | ConnectWise ScreenConnect / Kaseya / SimpleHelp | 4 |
| Java 组件与框架生态 | Log4Shell / Commons Collections / SnakeYAML / Spring / Bouncy Castle | 7 |
| Microsoft 产品与平台 | Exchange / SharePoint / Hyper-V / HTTP.sys / AD DS / AKS | 10+ |
| Oracle 产品 | WebLogic / Forms / WebCenter / PeopleSoft | 6 |
| Cisco 产品 | AnyConnect / CUCM / SD-WAN | 3 |
| 网络协议与基础库 | HTTP/2 Rapid Reset / OpenSSL / FreeType | 7 |
| 企业应用与CMS | Swagger UI / J2eeFAST / XunruiCMS / Ivanti Sentry / Check Point VPN | 6 |
| CI/CD 与构建发布平台 | TeamCity / Jenkins / GitLab | 7 |
| IT 运维与系统管理平台 | ManageEngine / PaperCut / ScreenConnect / Kaseya | 6 |

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

### P0 级（边界设备）
1. ~~Sophos / WatchGuard / Zyxel 边界设备~~ ✅（已撰写专题，含 CVE-2022-1040 / CVE-2022-26318 / CVE-2022-30525 / CVE-2023-28771 等 8 个 CVE）
2. Palo Alto PAN-OS 单独专题（CVE-2024-3400 已在边界设备专题中，但 PAN-OS 其他漏洞链值得单独扩展）

### P1 级（已完成 ✅）
3. ~~JetBrains TeamCity~~ ✅
4. ~~Jenkins~~ ✅
5. ~~GitLab~~ ✅
6. ~~Zoho ManageEngine~~ ✅
7. ~~PaperCut~~ ✅

### P2 级（协作与办公平台扩展）
8. 协作与办公平台综合专题（Seafile / 企业微信 / 其他 OA 系统）

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
