# 蓝队取证分析文章 Batch 9 - 规划文档

## 选题背景

基于对现有 130+ 篇取证分析文章的全面调研，排除已覆盖主题（WMI/DLL/令牌/LOLBins/AMSI/ETW/Kerberos/NTFS ADS/EDR对抗/容器/K8s/云环境/AWS/Azure/GCP/邮件/浏览器/Linux/社会工程学/网络协议/内存取证Volatility/移动设备/iOS/Android/macOS/工控ICS/SCADA/PowerShell/AD/进程注入/反取证/恶意软件/物联网/供应链/数据库/无线网络/区块链/数字签名/蓝队检测工程/AI辅助/DNS/勒索情报），本轮选取 3 个高价值未覆盖方向，聚焦 eBPF 攻击取证、macOS 持久化机制和无文件恶意代码。

## 选题列表

### 文章 1: eBPF攻击取证深度分析
- **文件**: `hugo-src/content/安全/应急响应/0x03取证分析/eBPF攻击取证深度分析.md`
- **weight**: 650
- **关键词**: eBPF、BPF Maps、Tracepoint、内核后门、内核可观测性武器化、eBPF Rootkit、网络包过滤、进程隐藏、eBPF检测
- **为什么写**: eBPF 技术从网络观测工具演变为攻击者的新型武器。eBPF Rootkit 可以内核级隐蔽驻留、过滤网络流量、隐藏进程和文件，传统的用户态取证工具几乎无法检测。随着 eBPF 在云原生环境中的广泛应用（Cilium/Falco/Tetragon），理解 eBPF 攻击面和取证检测方法对现代蓝队至关重要。

### 文章 2: macOS持久化机制与检测深度分析
- **文件**: `hugo-src/content/安全/应急响应/0x03取证分析/macOS持久化机制与检测深度分析.md`
- **weight**: 660
- **关键词**: LaunchDaemon、LaunchAgent、LoginItem、TCC数据库、Gatekeeper绕过、Profiles安装、 crontab、macOS持久化检测、Santa、osquery
- **为什么写**: 已有 macOS 系统入侵取证深度分析，但缺乏对 macOS 持久化机制的专题深度分析。macOS 拥有独特的持久化生态（LaunchDaemon/LaunchAgent 体系、TCC 权限数据库、Profiles 配置管理、LoginItem、内核扩展等），攻击者不断发现新的持久化向量。系统性梳理这些机制的取证检测方法，对 macOS 安全防御有重要价值。

### 文章 3: 无文件恶意代码取证深度分析
- **文件**: `hugo-src/content/安全/应急响应/0x03取证分析/无文件恶意代码取证深度分析.md`
- **weight**: 670
- **关键词**: Fileless Malware、内存驻留、Process Hollowing、PowerShell内存执行、WMI事件订阅、注册表加载、AMSI绕过、无文件攻击检测、内存取证、Volatility
- **为什么写**: 无文件恶意代码是高级威胁中最难检测的攻击形式之一。恶意代码完全在内存中执行，不落盘传统文件系统，使得基于文件签名的检测完全失效。虽然已有进程注入和 PowerShell 攻击链文章，但缺乏对无文件攻击生态的系统性分析——涵盖从 PowerShell 内存执行到 Process Hollowing，从 WMI 持久化到 .NET Assembly Load 的完整技术谱系及其取证检测方法论。

## 质量标准

| 维度 | 要求 |
|------|------|
| 最低字符数 | 20,000 |
| 章节数 | 10+ |
| 代码脚本 | Sigma + Bash + Python |
| 案例数 | ≥ 2 个 |
| 参考资料 | ≥ 8 条 |
| 证据分层 | 三级分类（🔴🟡🟢） |
| MITRE ATT&CK | 必须标注 |
