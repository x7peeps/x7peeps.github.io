---
title: "远程支持与 RMM 平台高危攻击链专题"
date: 2026-06-16T17:55:00+08:00
draft: false
tags: ["RMM", "远程支持", "ScreenConnect", "Kaseya", "BeyondTrust", "供应链攻击", "RCE", "漏洞链", "漏洞分析"]
categories: ["漏洞分析"]
description: "远程支持与 RMM 平台高危漏洞家族专题：ConnectWise ScreenConnect、Kaseya VSA、SolarWinds Serv-U、BeyondTrust Remote Support 四大平台的漏洞演进与攻击链分析。"
---

# 远程支持与 RMM 平台高危攻击链专题

远程支持（Remote Support）和 RMM（Remote Monitoring and Management）平台是近年攻击者持续盯防的高价值目标。这类平台通常拥有**对大量终端的完全控制权限**，一旦失陷往往直接导致供应链级攻击。

2021-2026 年，四大代表产品连续出现高危漏洞：

- **Kaseya VSA CVE-2021-30116**：供应链级攻击，REvil 勒索，影响 100 万+ 终端
- **ConnectWise ScreenConnect CVE-2024-1708/1709**：认证绕过 + 路径穿越，预认证 RCE
- **BeyondTrust Remote Support CVE-2026-1731**：预认证 RCE，CVSS 9.9，武器化速度 <24 小时
- **SolarWinds Serv-U CVE-2021-35211**：SSH 零日 RCE，国家级 APT 利用

本文从产品线视角梳理这四个平台的漏洞演进，总结共性攻击模式和防守建议。

## 0x01 远程支持与 RMM 平台的攻击面价值

### 1. 为什么 RMM 是高价值目标

远程支持与 RMM 平台通常承担：

- 对大量终端的远程控制和监控
- 软件部署和更新分发
- 系统配置和补丁管理
- 远程桌面支持和故障排查

一旦失陷，攻击者可以：

- 控制所有被管终端（数千到数百万台）
- 通过合法的 Agent 分发功能推送恶意软件
- 窃取所有被管系统的敏感数据
- 横向移动到内网其他系统

### 2. 共性攻击模式

四个平台的漏洞呈现出明显的共性：

1. **预认证 RCE 或认证绕过**：都不需要有效凭据即可触发
2. **供应链级影响**：突破一个管理平台，即可控制大量下游组织
3. **利用合法功能**：攻击通过平台的合法功能完成，隐蔽性极高
4. **快速武器化**：从漏洞公开到大规模利用的时间窗口极短
5. **国家级 APT 和犯罪团伙均参与**：既有经济利益驱动，也有间谍活动

## 0x02 Kaseya VSA CVE-2021-30116

### 1. 漏洞概述

- **漏洞类型**：认证绕过 + 业务逻辑缺陷
- **CVSS**：Critical
- **影响范围**：VSA On-Premises 9.5.7 之前所有版本
- **攻击者**：REvil/Sodinokibi 勒索团伙
- **影响规模**：约 1,500 家企业、超 100 万台终端

### 2. 核心原理

REvil 利用三个零日漏洞组成的攻击链：

- CVE-2021-30116：认证绕过
- CVE-2021-30119：任意文件上传
- CVE-2021-30120：2FA 绕过

通过 VSA 合法的 Agent 分发功能，向所有被管终端推送勒索加密器。

### 3. 实战影响

- 直接受影响 <60 个 MSP 客户
- 下游约 1,500 家企业、超 100 万台终端被加密
- 涉及 22 个国家
- REvil 索要 5,000 万美元赎金

### 4. 详细分析

参见：[CVE-2021-30116_Kaseya_VSA_供应链级RCE漏洞分析.md](file:///Users/pwndazhang/Library/Mobile%20Documents/com~apple~CloudDocs/6%20开发项目/个人主页/x7peeps.github.io/hugo-src/content/安全/渗透测试/03%20漏洞分析/远程支持与RMM/CVE-2021-30116_Kaseya_VSA_供应链级RCE漏洞分析.md)

## 0x03 ConnectWise ScreenConnect CVE-2024-1708/1709

### 1. 漏洞概述

- **漏洞类型**：认证绕过 + 路径穿越
- **CVSS**：10.0 Critical
- **影响范围**：ScreenConnect 23.9.7 及之前版本
- **发现者**：Huntress

### 2. 核心原理

- CVE-2024-1708：认证绕过，攻击者可以绕过 ScreenConnect 的认证机制
- CVE-2024-1709：路径穿越，攻击者可以上传恶意文件到任意路径

组合利用后，攻击者可以：

1. 绕过认证进入 ScreenConnect 管理界面
2. 通过路径穿越上传恶意扩展或脚本
3. 实现预认证远程代码执行

### 3. 实战影响

- 多个企业确认被入侵
- 出现数据窃取和勒索活动
- CISA 将其加入 KEV 目录

### 4. 详细分析

参见：[CVE-2024-1708_1709_ScreenConnect_RCE漏洞链分析.md](file:///Users/pwndazhang/Library/Mobile%20Documents/com~apple~CloudDocs/6%20开发项目/个人主页/x7peeps.github.io/hugo-src/content/安全/渗透测试/03%20漏洞分析/远程支持与RMM/CVE-2024-1708_1709_ScreenConnect_RCE漏洞链分析.md)

## 0x04 BeyondTrust Remote Support CVE-2026-1731

### 1. 漏洞概述

- **漏洞类型**：OS 命令注入
- **CVSS v4**：9.9 Critical
- **影响范围**：Remote Support 25.3.1 及之前、Privileged Remote Access 24.3.4 及之前
- **发现者**：BeyondTrust 内部发现，后确认在野利用

### 2. 核心原理

CVE-2026-1731 是 CVE-2024-12356 的变体，攻击者通过 WebSocket 端点 `/nw` 注入命令：

1. 攻击者通过 `get_portal_info` 提取 `x-ns-company` 值
2. 建立 WebSocket 通道
3. 注入 OS 命令，实现预认证 RCE

### 3. 实战影响

- 互联网暴露约 11,000 个实例（~8,500 个 On-Premises）
- PoC 公开后 <24 小时即出现侦察扫描
- 已被 CISA 加入 KEV 目录
- 攻击者为 Silk Typhoon（中国国家级 APT）

### 4. 武器化时间线

| 时间 | 事件 |
|------|------|
| 1月31日 | BeyondTrust 检测到异常活动 |
| 2月2日 | 云端补丁自动部署 |
| 2月6日 | 公开披露 |
| **2月10日** | **PoC 发布至 GitHub** |
| **2月11日** | **GreyNoise 观察到侦察扫描**（<24小时） |
| 2月13日 | watchTowr 确认在野利用，CISA 加入 KEV |

## 0x05 SolarWinds Serv-U CVE-2021-35211

### 1. 漏洞概述

- **漏洞类型**：Out-of-Bounds Write（CWE-787）
- **CVSS**：Critical
- **影响范围**：Serv-U MFT 和 Serv-U Secure FTP 15.2.3 HF1 及之前版本（仅 Windows）
- **攻击者**：DEV-0322（Circle Typhoon / TiltedTemple）——中国背景的 APT 组织

### 2. 核心原理

Serv-U 在处理 SSH 连接请求时边界检查不当，攻击者发送特制的 SSH 预认证消息触发内存越界写入，实现代码执行。

- 无需认证、无需用户交互
- 仅需 SSH 端口开放

### 3. 实战影响

- 由 Microsoft MSTIC 发现并归因
- 定向攻击美国国防工业基础（DIB）和软件公司
- Censys 扫描发现互联网上 >8,000 个 Serv-U 主机
- CISA 将其加入 KEV 目录

## 0x06 共性攻击模式总结

### 1. 预认证 RCE 是标准配置

四个漏洞都不需要有效凭据即可触发：

| 平台 | 认证要求 | 利用复杂度 |
|---|---|---|
| Kaseya VSA | 无（认证绕过） | 中（需要三个零日） |
| ScreenConnect | 无（认证绕过 + 路径穿越） | 低 |
| BeyondTrust | 无（命令注入） | 低 |
| Serv-U | 无（内存破坏） | 中 |

### 2. 供应链级影响是核心风险

RMM 平台的核心危险在于**杠杆效应**：

- Kaseya VSA：突破 1 个 MSP → 控制 100 万+ 终端
- ScreenConnect：突破 1 个实例 → 控制所有被管终端
- BeyondTrust：突破 1 个实例 → 控制所有远程会话
- Serv-U：突破 1 个服务器 → 控制所有文件传输

### 3. 武器化速度极快

从漏洞公开到大规模利用的时间窗口：

- Kaseya VSA：N/A（零日利用）
- ScreenConnect：约 72 小时
- BeyondTrust：**<24 小时**
- Serv-U：数天

### 4. 国家级 APT 和犯罪团伙均参与

| 平台 | 攻击者 | 动机 |
|---|---|---|
| Kaseya VSA | REvil | 经济利益（勒索） |
| ScreenConnect | 多种 | 经济利益 + 间谍 |
| BeyondTrust | Silk Typhoon | 间谍活动 |
| Serv-U | DEV-0322 | 间谍活动 |

## 0x07 公开 PoC 收集与利用思路

### 1. PoC 收集情况

截至文章撰写时，远程支持与 RMM 平台相关漏洞的公开 PoC 情况如下：

| CVE | 公开 PoC 状态 | 说明 |
|---|---|---|
| CVE-2021-30116 (Kaseya) | 无公开代码 | 但攻击过程通过 VSA 合法功能完成 |
| CVE-2024-1708/1709 (ScreenConnect) | 有 | Huntress 公开利用细节，多个 GitHub PoC |
| CVE-2026-1731 (BeyondTrust) | 有 | PoC 公开后 <24 小时即出现侦察扫描 |
| CVE-2021-35211 (Serv-U) | 有 | Microsoft MSTIC 公开利用细节 |

### 2. 验证思路（防守型）

以下验证思路仅供授权安全评估使用：

**步骤 1：暴露面扫描**
```bash
# 使用 Nuclei 模板检测
nuclei -t http/vulnerabilities/rmm/screenconnect-cve-2024-1708.yaml -u https://target

# 使用 Shodan 查询
curl -s "https://api.shodan.io/shodan/host/<target_ip>?key=<API_KEY>"
```

**步骤 2：Agent 分发检测**
```bash
# 检查 VSA Agent 分发记录
tail -f /var/log/kaseya/agent_distribution.log | grep -i "malicious\|unknown"

# 检查远程会话日志
tail -f /var/log/beyondtrust/session.log | grep -i "unauthorized"
```

**步骤 3：事件日志分析**
```bash
# 检查 RMM 服务器的异常登录
tail -f /var/log/auth.log | grep -i "ssh\|sudo\|su"

# 检查可疑的子进程
ps aux | grep -E "cmd\.exe|powershell\.exe|bash -c"
```

### 3. 利用案例

公开报道中已确认的利用案例：

- **REvil（2021）**：利用 Kaseya VSA 漏洞，影响 100 万+ 终端
- **Silk Typhoon（2024）**：利用 BeyondTrust 漏洞，攻击美国财政部
- **Akira 勒索软件（2025）**：利用 ScreenConnect 漏洞进行数据窃取

## 0x08 防守建议

### 1. 紧急措施

1. **立即升级补丁**：所有远程支持和 RMM 平台都应升级到最新修复版本
2. **限制暴露面**：禁止 RMM 平台直接暴露在互联网，使用 VPN 或跳板机访问
3. **启用 MFA**：为所有管理账户启用多因素认证
4. **监控异常流量**：部署 IDS/IPS 检测异常的管理操作

### 2. 长期策略

5. **网络分段**：将 RMM 平台放在独立的网络区域，限制横向移动
6. **最小权限原则**：限制 RMM Agent 的权限，只授予必要的管理权限
7. **定期审计**：定期审查 RMM 平台的配置和访问日志
8. **事件响应**：制定针对 RMM 平台的事件响应计划

### 3. 事后排查

9. **检查历史日志**：回溯到漏洞公开前 90 天，检查是否有异常访问
10. **审查 Agent 分发记录**：检查是否有异常的脚本或程序推送
11. **扫描被管终端**：检查可疑文件和进程
12. **轮换凭据**：轮换所有与 RMM 平台相关的凭据和密钥

## 0x08 总结

远程支持与 RMM 平台的高危漏洞爆发，揭示了几个关键教训：

1. **RMM 是最具杠杆效应的攻击面**：突破一个管理平台即可控制成百上千下游组织
2. **预认证 RCE 是常态**：攻击者不需要凭据即可触发漏洞
3. **武器化速度极快**：从漏洞公开到大规模利用仅 24-72 小时
4. **国家级 APT 和犯罪团伙均瞄准此赛道**：既有经济利益驱动，也有间谍活动
5. **同一产品反复被攻破**：BeyondTrust 同一 WebSocket 端点两次被利用

企业应该将远程支持与 RMM 平台视为**关键安全资产**，而不是普通的管理工具。需要从网络架构、访问控制、监控审计、事件响应等多个维度进行全方位防护。

## 0x09 参考资料

- [Kaseya VSA CVE-2021-30116 分析](file:///Users/pwndazhang/Library/Mobile%20Documents/com~apple~CloudDocs/6%20开发项目/个人主页/x7peeps.github.io/hugo-src/content/安全/渗透测试/03%20漏洞分析/远程支持与RMM/CVE-2021-30116_Kaseya_VSA_供应链级RCE漏洞分析.md)
- [ScreenConnect CVE-2024-1708/1709 分析](file:///Users/pwndazhang/Library/Mobile%20Documents/com~apple~CloudDocs/6%20开发项目/个人主页/x7peeps.github.io/hugo-src/content/安全/渗透测试/03%20漏洞分析/远程支持与RMM/CVE-2024-1708_1709_ScreenConnect_RCE漏洞链分析.md)
- [CISA KEV - Kaseya VSA](https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=CVE-2021-30116)
- [CISA KEV - ScreenConnect](https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=CVE-2024-1708)
- [BeyondTrust 公告](https://www.beyondtrust.com/trust-center/security-advisories/bt26-02)
- [GreyNoise BeyondTrust 分析](https://www.greynoise.io/blog/reconnaissance-beyondtrust-rce-cve-2026-1731)
- [Microsoft Serv-U 分析](https://www.microsoft.com/security/blog/2021/07/13/microsoft-discovers-threat-actor-targeting-solarwinds-serv-u-software-with-0-day-exploit)
- [Huntress ScreenConnect 分析](https://www.huntress.com/blog/critical-vulnerabilities-in-connectwise-screenconnect)
