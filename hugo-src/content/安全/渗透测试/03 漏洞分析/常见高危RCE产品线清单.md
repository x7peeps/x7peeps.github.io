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

目前知识库已经初步覆盖以下产品线：

- Oracle WebLogic / PeopleSoft
- Cisco AnyConnect / CUCM / SD-WAN
- Microsoft Windows / AD DS / Hyper-V / AKS / Office / SMB
- Confluence / Seafile / 企业微信
- Spring / Apache / SnakeYAML / Bouncy Castle
- OpenSSL / HTTP/2 / FreeType
- XunruiCMS / J2eeFAST / Swagger UI
- Chrome / Chromium V8
- WPS Office

## 0x05 下一批建议优先写作

建议后续按以下顺序继续补齐：

1. Microsoft Exchange（ProxyShell / ProxyNotShell）
2. Microsoft SharePoint（多条 RCE 链）
3. ConnectWise ScreenConnect
4. MOVEit Transfer
5. GoAnywhere MFT
6. PAN-OS / Citrix NetScaler / Fortinet FortiOS
7. TeamCity / Jenkins / GitLab
8. ManageEngine / PaperCut / KACE

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
