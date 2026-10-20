# 任务列表 - forensics-articles-batch-next

## 文章1：虚拟化与云原生取证深度分析
- [ ] 创建文件，编写 YAML Front Matter
- [ ] 0x01 技术基础与取证概述（KVM/Xen/Hyper-V架构、containerd/CRI-O运行时、与传统取证差异）
- [ ] 0x02 Hypervisor层攻击与取证（VM逃逸、虚拟机快照取证、内存取证、虚拟磁盘分析）
- [ ] 0x03 容器运行时取证（containerd/CRI-O日志分析、镜像层溯源、容器逃逸痕迹）
- [ ] 0x04 Kubernetes编排层取证（API Server审计日志、etcd数据恢复、RBAC滥用检测）
- [ ] 0x05 服务网格与Envoy取证（Istio/Envoy访问日志、mTLS证书分析、流量镜像检测）
- [ ] 0x06 虚拟化网络取证（Overlay网络流量分析、OVS/OVN流表取证、虚拟交换机日志）
- [ ] 0x07 证据强度分层与案例关联
- [ ] 0x08 自动化检测与狩猎（Sigma/Bash/Python/YARA）
- [ ] 0x09 公开案例分析（≥ 2个APT/攻击事件）
- [ ] 0x0A 参考资料（≥ 8条含URL）
- [ ] wc -m 验证字符数 ≥ 20,000

## 文章2：内存马与高级持久化取证深度分析
- [ ] 创建文件，编写 YAML Front Matter
- [ ] 0x01 技术基础与取证概述（内存马原理、与传统Webshell对比、检测挑战）
- [ ] 0x02 Java Agent内存马深度分析（Instrumentation API、Spy Class注入、Tomcat/Spring内存马变种）
- [ ] 0x03 .NET CLR Profiler与Assembly Load内存马（CLR Profiler注入、Assembly.Load动态加载、IIS内存马）
- [ ] 0x04 Go语言嵌入式植入与无文件持久化（Go Plugin、gopls供应链、ELF注入）
- [ ] 0x05 Python/PHP/Node.js运行时内存马（代码注入、monkey patching、require hook）
- [ ] 0x06 容器与云环境内存马（K8s Admission Webhook滥用、Lambda函数注入、eBPF内存驻留）
- [ ] 0x07 证据强度分层与案例关联
- [ ] 0x08 自动化检测与狩猎（Sigma/Bash/Python/YARA）
- [ ] 0x09 公开案例分析（≥ 2个APT/攻击事件）
- [ ] 0x0A 参考资料（≥ 8条含URL）
- [ ] wc -m 验证字符数 ≥ 20,000

## 文章3：Windows事件日志深度取证分析
- [ ] 创建文件，编写 YAML Front Matter
- [ ] 0x01 技术基础与取证概述（EVTX文件格式、日志通道架构、日志策略配置）
- [ ] 0x02 EVTX文件格式深度解析（XML存储结构、Chunk/Record模板、日志签名与篡改检测）
- [ ] 0x03 系统与安全日志深度分析（System/Security/Sysmon关键Event ID、日志关联方法）
- [ ] 0x04 PowerShell与脚本引擎日志取证（Module Logging、Script Block Logging、Transcript分析）
- [ ] 0x05 网络与身份认证日志取证（Kerberos/NTLM认证事件、4624/4625/4768/4769关联分析）
- [ ] 0x06 日志清理与反取证检测（1102事件、日志间隙分析、备份日志对比、WMI日志操纵）
- [ ] 0x07 高级日志关联与时间线构建（多源日志融合、Plaso/log2timeline、Jupyter Notebook分析）
- [ ] 0x08 证据强度分层与案例关联
- [ ] 0x09 自动化检测与狩猎（Sigma/Bash/Python）
- [ ] 0x0A 公开案例分析（≥ 2个APT/攻击事件）
- [ ] 0x0B 参考资料（≥ 8条含URL）
- [ ] wc -m 验证字符数 ≥ 20,000
