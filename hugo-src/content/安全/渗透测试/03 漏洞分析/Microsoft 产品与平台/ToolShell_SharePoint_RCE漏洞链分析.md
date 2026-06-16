---
title: "ToolShell: SharePoint RCE 漏洞链分析"
date: 2026-06-15T14:30:00+08:00
draft: false
tags: ["SharePoint", "ToolShell", "RCE", "Microsoft", "漏洞链", "漏洞分析"]
categories: ["漏洞分析"]
---

# ToolShell: SharePoint RCE 漏洞链深度分析

## 0x01 漏洞背景与详情
**ToolShell** 是针对本地部署版 Microsoft SharePoint 的一组高危利用链家族。当前最值得作为知识库主线记录的是以下组合：

### 主利用链
- `CVE-2025-49706`
- `CVE-2025-49704`

### 旁路/补丁绕过变体
- `CVE-2025-53770`
- `CVE-2025-53771`

该家族的现实危险性非常高，原因在于：
- 影响的是本地部署 SharePoint
- 已出现大规模在野利用
- 可被用于窃取 `MachineKey`
- 可进一步形成持久化、横向移动和勒索部署

## 0x02 漏洞原理分析
ToolShell 的核心不是单一组件 bug，而是一条“绕过 -> 反序列化 -> 代码执行 -> 密钥窃取”的攻击链。

1. **入口集中在 ToolPane 相关端点**
   攻击流量通常命中：

```text
/_layouts/15/ToolPane.aspx
```

   攻击者通过伪造特定请求头，尤其是异常 `Referer`，绕过本不应该放行的访问控制。

2. **后续落入 SharePoint 反序列化/组件处理缺陷**
   一旦请求进入错误的处理路径，攻击者即可把不可信对象或异常组件数据送入 SharePoint 的反序列化逻辑，最终在服务器端触发代码执行。

3. **机器密钥是风险放大器**
   公开事件分析显示，攻击者并不满足于一次性命令执行，往往还会进一步读取：
   - `ValidationKey`
   - `DecryptionKey`
   - 其他 `MachineKey` 相关材料

   一旦这些密钥泄露，攻击者即使在补丁后也可能继续伪造受信数据。

4. **可不落盘完成利用**
   公开研究指出，ToolShell 不一定需要传统磁盘型 webshell。也就是说，“没看到 `spinstall0.aspx`”并不等于“没有中招”。

## 0x03 漏洞链利用思路
知识库中只保留研究与检测导向的链路描述，不提供可直接运行的 payload。

### 主链抽象步骤
1. 攻击者访问 `ToolPane.aspx`。
2. 通过异常 `Referer` 或相关请求头进入本不该触达的处理逻辑。
3. 向 SharePoint 发送可触发反序列化的恶意数据。
4. 拿到服务器代码执行后，进一步投放轻量组件或直接读取机器密钥。
5. 后续根据目标价值决定是否持久化、横向或投放勒索。

### 防守型 POC 重点
POC 的重点应放在：
- 验证 `ToolPane.aspx` 异常 POST 是否能触达敏感路径
- 验证补丁后是否返回正确拒绝行为
- 验证是否不再出现 `w3wp.exe` 异常子进程
- 验证是否不再生成可疑 `spinstall*.aspx`、`.dll`

## 0x04 高级实战利用姿势 (Weaponization)

1. **优先窃取 MachineKey**
   在 SharePoint 这类 .NET 生态中，机器密钥的价值很高。攻击者拿到它之后，往往可以把一次漏洞利用升级成长期可信伪造能力。

2. **不一定依赖经典 webshell**
   除了常见的 `spinstall*.aspx`，攻击者也可能用：
   - DLL 组件
   - 内存化载荷
   - 计划任务
   - IIS 模块改写
   等方式提高隐蔽性。

3. **从协作平台向内网扩展**
   SharePoint 常与 AD、Office、审批和文档系统耦合，攻击者一旦打入，不仅能窃取内容，还能借服务器身份继续横向。

4. **现实攻击已不止于打点**
   公开情报显示，ToolShell 已被用于：
   - 关闭或绕过防护
   - 凭据窃取
   - 横向移动
   - 勒索软件投递

## 0x05 应急排查与日志痕迹分析

1. **IIS 日志重点**
   搜索：

```text
POST /_layouts/15/ToolPane.aspx
```

   同时重点关注：
   - 异常 `Referer`
   - `DisplayMode=Edit`
   - 空用户名或不合理用户名

2. **后续文件访问痕迹**
   继续排查是否出现：
   - `/spinstall0.aspx`
   - `/spinstall.aspx`
   - `/spinstall1.aspx`
   - `/spinstallb.aspx`
   - `/spinstallp.aspx`

3. **文件系统痕迹**
   重点检查：
   - `LAYOUTS`
   - `inetpub`
   - `wwwroot`
   - `Microsoft Shared\Web Server Extensions`

   关注新出现的：
   - `.aspx`
   - `.dll`
   - 脚本文件

4. **进程与行为链**
   高价值异常包括：
   - `w3wp.exe -> powershell.exe`
   - `w3wp.exe -> cmd.exe`
   - `w3wp.exe -> whoami`
   - 可疑 `.NET` 程序集加载
   - 计划任务新增

## 0x06 修复与缓解建议
1. **立即安装 SharePoint 安全更新**
   不要停留在最初一轮补丁，应跟进 2025 年 7 月之后针对该家族的后续修复与补丁绕过修补。

2. **启用并核实 SharePoint AMSI**
   仅打补丁不够，应尽可能启用 `AMSI` 集成，并结合 Defender 或其他 AV 提升检测能力。

3. **轮换 MachineKey 并重启 IIS**
   对 ToolShell 家族而言，补丁后如果不轮换密钥，历史失陷的风险可能无法真正切断。

4. **按已失陷思路做 compromise assessment**
   若 SharePoint 曾暴露公网且补丁滞后，应同步排查：
   - webshell
   - DLL
   - 计划任务
   - 凭据窃取
   - 横向移动痕迹

## 0x07 参考资料
- [Microsoft Threat Intelligence - SharePoint 漏洞利用通报](https://www.microsoft.com/en-us/security/blog/2025/07/22/disrupting-active-exploitation-of-on-premises-sharepoint-vulnerabilities/)
- [CISA Alert - SharePoint 漏洞利用通告](https://www.cisa.gov/news-events/alerts/2025/07/20/update-microsoft-releases-guidance-exploitation-sharepoint-vulnerabilities)
- [CISA MAR - SharePoint 漏洞利用分析报告](https://www.cisa.gov/news-events/analysis-reports/ar25-218a)
- [Eye Security - ToolShell 研究](https://research.eye.security/sharepoint-under-siege/)
- [Unit 42 - SharePoint 漏洞利用分析](https://unit42.paloaltonetworks.com/microsoft-sharepoint-cve-2025-49704-cve-2025-49706-cve-2025-53770/)
- [Akamai - SharePoint RCE 研究](https://www.akamai.com/blog/security-research/sharepoint-vulnerability-rce-active-exploitation-detections-mitigations)
- [MSRC - CVE-2025-49704](https://msrc.microsoft.com/update-guide/vulnerability/CVE-2025-49704)
- [MSRC - CVE-2025-49706](https://msrc.microsoft.com/update-guide/vulnerability/CVE-2025-49706)
- [MSRC - CVE-2025-53770](https://msrc.microsoft.com/update-guide/vulnerability/CVE-2025-53770)
- [MSRC - CVE-2025-53771](https://msrc.microsoft.com/update-guide/vulnerability/CVE-2025-53771)
