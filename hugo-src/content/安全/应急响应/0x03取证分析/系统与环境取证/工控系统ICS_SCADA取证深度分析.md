---
title: "工控系统(ICS/SCADA)取证深度分析"
date: 2026-07-02T16:00:00+08:00
draft: false
weight: 540
description: "围绕工控系统取证分析的全面深度分析，覆盖 PLC 取证、HMI 取证、历史数据库(Historian)取证、工业协议取证（Modbus/DNP3/S7/IEC 61850）、固件提取与分析、网络分段验证、安全仪表系统(SIS)取证、工控恶意软件分析（Stuxnet/Triton/Industroyer）、取证工具与安全约束、自动化检测方法等。"
categories: ["应急响应", "取证分析"]
tags: ["ICS", "SCADA", "工控取证", "PLC", "HMI", "Modbus", "DNP3", "S7协议", "工控恶意软件", "Stuxnet"]
---

## 0x01 工控系统安全架构与取证特殊性

### ICS/SCADA 系统架构概述

工控系统（Industrial Control System, ICS）是支撑关键基础设施运行的核心控制系统集群，涵盖电力、石化、水利、交通、制造等多个行业领域。与通用 IT 系统不同，ICS 的设计哲学始终围绕**可用性（Availability）优先**原则展开，这一核心理念深刻影响着取证方法论的每一个环节。

一个典型的 ICS/SCADA 系统包含以下核心组件：

| 组件 | 功能定位 | 典型平台 | 取证价值 |
|------|----------|----------|----------|
| RTU（Remote Terminal Unit） | 远程终端单元，部署于偏远站点，采集现场数据并执行控制命令 | SEL RTAC、ABB RTU560 | 通信日志、配置快照 |
| PLC（Programmable Logic Controller） | 可编程逻辑控制器，执行实时控制逻辑 | Siemens S7-1500、Allen-Bradley ControlLogix、Schneider Modicon M580 | 控制逻辑、寄存器值、事件日志 |
| HMI（Human Machine Interface） | 人机界面，提供操作员与工艺过程的交互窗口 | Siemens WinCC、Wonderware InTouch、FactoryTalk View | 操作记录、画面配置、脚本代码 |
| DCS（Distributed Control System） | 分布式控制系统，面向连续过程控制 | Honeywell Experion、Yokogawa CENTUM VP、Emerson DeltaV | 历史数据、控制策略、组态文件 |
| SCADA Master | 监控与数据采集主站，集中监控广域分布的远程站点 | GE Proficy iFIX、Ignition、Citect SCADA | 全局事件日志、报警记录、通信日志 |
| Historian | 历史数据库，存储过程变量的时序数据 | OSIsoft PI、ABB Historian、IP.21 | 趋势数据、数据完整性证据 |
| SIS（Safety Instrumented System） | 安全仪表系统，在危险条件下执行保护功能 | Triconex、HIMA HIMatrix、Yokogawa ProSafe-RS | 安全逻辑、旁路记录、SIL 验证数据 |
| Engineering Workstation（EWS） | 工程师站，用于 PLC/DCS 编程与配置 | 安装了 STEP7/TIA Portal/RSLogix 的 PC | 项目文件、下载记录、编译日志 |

### 工控取证与 IT 取证的核心差异

工控取证（OT Forensics）与传统 IT 取证之间存在本质性差异，这些差异直接决定了取证策略的设计：

| 维度 | IT 取证 | OT/工控取证 |
|------|---------|-------------|
| 首要目标 | 机密性（Confidentiality） | 可用性（Availability） |
| 系统中断容忍度 | 可接受关机取证 | 极难容忍任何中断 |
| 数据采集方式 | 磁盘镜像、内存转储 | 被动流量采集、在线配置比对 |
| 协议生态 | TCP/IP 标准协议栈 | 专有协议（S7comm、EtherNet/IP、FINS） |
| 操作系统 | Windows/Linux/macOS | 嵌入式 RTOS、VxWorks、Windows CE/10 IoT |
| 补丁管理 | 定期更新 | 极少更新（可能影响认证/工艺验证） |
| 网络隔离 | 一般不物理隔离 | 通常与 IT 网络物理隔离或经 DMZ 连接 |
| 取证时效 | 事后分析为主 | 需要近实时检测 |
| 物理影响 | 无直接物理影响 | 取证操作可能导致物理过程异常 |
| 法规框架 | GDPR/网络安全法 | NERC CIP/IEC 62443/等保 2.0 工控扩展 |

### 工控环境取证的特殊约束

**可用性优先原则**：在工控环境中，任何取证活动都不能导致生产中断。这意味着传统的磁盘镜像、内存转储等取证手段在在线控制器上几乎不可行。取证人员必须依赖被动网络监控、配置差异分析、日志远程采集等非侵入式方法。

**实时性要求**：工控系统的控制周期通常在毫秒级（PLC 扫描周期可低至 1ms），攻击行为可能在极短时间内造成物理损害。取证系统需要具备近实时检测能力，而非传统的事后分析模式。

**专有协议与设备**：工控领域大量使用非标准协议和专用设备，取证工具链需要覆盖 Modbus、DNP3、S7comm、IEC 60870-5-104、IEC 61850（GOOSE/SV/MMS）、EtherNet/IP（CIP）等工业协议。

**物理安全风险**：某些取证操作（如向 PLC 发送读取请求）在极端情况下可能影响控制器的扫描周期或通信负载。在安全关键系统（如 SIS）附近进行取证活动时，必须格外谨慎。

**法规合规要求**：工控环境通常受特定行业法规约束。电力行业需遵守 NERC CIP 标准（CIP-002 至 CIP-011），国内需满足等保 2.0 工控安全扩展要求，石化行业需遵循 ISA/IEC 62443 标准体系。

### 取证方法论（ISA/IEC 62443 框架）

ISA/IEC 62443 是工控安全领域的核心标准体系，其取证相关指导主要分布在以下部分：

- **IEC 62443-2-1**：安全策略定义，建立安全管理体系（ISMS）
- **IEC 62443-3-2**：安全风险评估与系统分级（Security Level 确定）
- **IEC 62443-3-3**：系统级安全要求，包括区域（Zones）与管道（Conduits）模型
- **IEC 62443-4-2**：组件级安全技术要求
- **IEC 62443-4-3**：安全测试与认证要求

基于 62443 框架的工控取证方法论遵循以下流程：

```
1. 区域划分确认 → 识别 Zones 与 Conduits 边界
2. 安全等级评估 → 确定各区域的 SL 等级（SL1-SL4）
3. 资产清单建立 → 记录所有工控设备的固件版本、配置基线
4. 被动数据采集 → 网络流量镜像、日志远程转发
5. 异常检测与分析 → 协议异常、配置偏差、行为基线偏离
6. 证据保全 → 哈希校验、时间戳同步、证据链完整性
7. 报告与修复建议 → 符合行业法规要求的取证报告
```

### 工控取证工具链概览

| 工具类别 | 工具名称 | 用途 | 安全约束 |
|----------|----------|------|----------|
| 协议分析 | Wireshark + OT 插件 | 工业协议深度解析 | 被动镜像，不主动发包 |
| 协议分析 | Zeek (ICS analyzers) | 工业协议异常检测 | 被动流量分析 |
| PLC 编程 | STEP7 / TIA Portal | Siemens PLC 程序上传与比对 | 需授权窗口操作 |
| PLC 编程 | RSLogix 5000 / Studio 5000 | Allen-Bradley PLC 程序管理 | 需授权窗口操作 |
| PLC 编程 | EcoStruxure Control Expert | Schneider Modicon PLC 编程 | 需授权窗口操作 |
| 网络扫描 | nmap (OT-safe scripts) | 工控设备发现 | 禁用侵入性脚本 |
| 流量生成 | Scapy + ICS 模块 | 协议测试与验证 | 仅限测试环境 |
| 固件分析 | binwalk | 固件解包与逆向 | 仅对离线固件 |
| 历史数据 | PI SQLClient | OSIsoft PI 数据查询 | 只读查询 |
| SIEM 集成 | Splunk ICS App / Elastic ICS | 工控安全事件聚合 | 被动接收日志 |

### 取证前风险评估流程

在执行任何工控取证活动之前，必须完成以下风险评估流程：

```
┌─────────────────────────────────────────────────────────┐
│                   取证前风险评估清单                       │
├─────────────────────────────────────────────────────────┤
│ □ 确认目标系统的安全等级（SIL/SL）                        │
│ □ 获取系统所有者的书面授权                                  │
│ □ 确认取证窗口（与生产团队协商）                            │
│ □ 评估取证操作对物理过程的潜在影响                          │
│ □ 准备回退方案（Rollback Plan）                            │
│ □ 确认通信路径不会干扰安全关键控制回路                      │
│ □ 验证取证工具不会向控制器发送写命令                        │
│ □ 确认取证人员具备工控安全资质                              │
│ □ 建立取证期间的应急通信渠道                               │
│ □ 记录所有取证操作的开始/结束时间                           │
└─────────────────────────────────────────────────────────┘
```

---

## 0x02 PLC 取证分析

### PLC 架构与工作原理

PLC（Programmable Logic Controller）是工控系统的核心控制单元，其架构设计直接决定了取证策略的选择。

典型 PLC 系统由以下模块组成：

| 模块类型 | 功能描述 | 取证关注点 |
|----------|----------|------------|
| CPU 模块 | 执行控制逻辑、管理通信 | 程序块、数据块、事件日志、硬件诊断缓冲区 |
| 电源模块 | 为 PLC 机架提供电力 | 电源冗余状态、电压异常记录 |
| 输入模块（DI/AI） | 采集现场传感器信号 | 输入通道状态、通道诊断信息 |
| 输出模块（DO/AO） | 驱动执行器（阀门、电机等） | 输出状态、强制状态检测 |
| 通信模块 | 处理工业协议通信 | 通信连接表、协议配置、通信错误日志 |
| 特殊功能模块 | 高速计数、PID 控制等 | 模块参数配置、校准记录 |

PLC 的工作循环（Scan Cycle）包含以下阶段：

```
读取输入 → 执行程序 → 处理通信 → 执行诊断 → 写输出
  ↑                                              │
  └──────────────────────────────────────────────┘
```

每个扫描周期的典型耗时为 1ms 至 100ms，取决于程序复杂度和 CPU 性能。取证操作（如在线监控）会增加通信处理阶段的负载，在极端情况下可能导致扫描周期延长。

### PLC 程序结构

PLC 程序遵循 IEC 61131-3 标准定义的五种编程语言：

| 编程语言 | 缩写 | 特点 | 取证关注点 |
|----------|------|------|------------|
| 梯形图 | LD（Ladder Diagram） | 图形化，类似继电器逻辑 | 逻辑篡改、隐藏支路 |
| 结构化文本 | ST（Structured Text） | 类 Pascal 高级语言 | 恶意代码注入、后门函数 |
| 功能块图 | FBD（Function Block Diagram） | 图形化数据流 | 参数篡改、信号路由修改 |
| 指令列表 | IL（Instruction List） | 低级汇编风格 | 已逐步淘汰，遗留系统可见 |
| 顺序功能图 | SFC（Sequential Function Chart） | 步进式控制流程 | 步骤跳转条件篡改 |

### PLC 程序提取方法

**方法一：在线监控与程序上传**

在获得授权后，通过工程师站连接 PLC 并上传程序。此操作需要谨慎执行，因为上传过程会占用 CPU 资源。

```bash
# 使用 snap7 库（Python）连接 Siemens S7 PLC 并读取程序块信息
# 注意：仅执行只读操作，不发送任何写命令

import snap7
from snap7.util import get_int, get_real

plc = snap7.client.Client()
plc.connect('192.168.1.10', 0, 1)

cpu_info = plc.get_cpu_info()
print(f"模块类型: {cpu_info.ModuleTypeName.decode()}")
print(f"固件版本: {cpu_info.AS_Name.decode()}")
print(f"序列号: {cpu_info.AS_Index}")

block_list = plc.list_blocks()
for block_type, count in block_list.items():
    print(f"块类型 {block_type}: {count} 个块")

plc.disconnect()
```

**方法二：固件版本与硬件配置记录**

```bash
# 使用 nmap 进行 OT 安全的 PLC 发现（仅使用安全脚本）
nmap -sS -p 102,502,44818,4001 \
  --script s7-info,modbus-info,ethernetip-info \
  -n --disable-arp-ping \
  192.168.1.0/24

# 输出示例：
# PORT    STATE SERVICE
# 102/tcp open  siemens-s7
# | s7-info:
# |   Module: CPU 1515-2 PN
# |   Firmware: V2.9
# |   Module Type: S7-1500
# |   Serial Number: S-C7MJ01234567
# |   Memory Size: 1048576 bytes
```

**方法三：项目文件对比分析**

工程师站（EWS）上通常保存有 PLC 项目文件。通过对比当前 PLC 运行的程序与 EWS 上的基线项目文件，可以检测逻辑篡改。

```bash
# 计算项目文件哈希，建立基线
find /ews/projects/ -name "*.ap17" -o -name "*.zap17" | \
  while read f; do
    sha256sum "$f" >> /evidence/project_baselines.sha256
  done

# 对比当前 PLC 上传的项目与基线
diff -rq /ews/projects/current_backup/ /ews/projects/baseline/ \
  --exclude="*.bak" --exclude="*.log"
```

### PLC 逻辑篡改检测

**程序哈希比对**

```python
import hashlib
import json

def compute_program_hash(plc_program_bytes):
    return hashlib.sha256(plc_program_bytes).hexdigest()

def compare_program_hashes(baseline_hash, current_hash):
    if baseline_hash != current_hash:
        return {
            "status": "TAMPERED",
            "confidence": "HIGH",
            "evidence_strength": "CONFIRMED_MALICIOUS"
                if baseline_hash
                else "REQUIRES_INVESTIGATION"
        }
    return {"status": "INTACT", "confidence": "HIGH"}
```

**梯形图差异分析**

```python
def analyze_ladder_diff(baseline_rungs, current_rungs):
    modifications = []
    for idx, (base_rung, curr_rung) in enumerate(
        zip(baseline_rungs, current_rungs)
    ):
        if base_rung.hash != curr_rung.hash:
            modifications.append({
                "rung_index": idx,
                "change_type": "MODIFIED",
                "baseline_contacts": base_rung.contacts,
                "current_contacts": curr_rung.contacts,
                "new_coils": [c for c in curr_rung.coils
                              if c not in base_rung.coils],
                "removed_coils": [c for c in base_rung.coils
                                  if c not in curr_rung.coils]
            })

    if len(current_rungs) > len(baseline_rungs):
        for idx in range(len(baseline_rungs), len(current_rungs)):
            modifications.append({
                "rung_index": idx,
                "change_type": "INSERTED",
                "content": current_rungs[idx].raw_data
            })

    return modifications
```

**设定点/阈值异常检测**

```python
def detect_setpoint_anomalies(baseline_tags, current_tags, threshold_pct=10):
    anomalies = []
    for tag_name in baseline_tags:
        if tag_name not in current_tags:
            anomalies.append({
                "tag": tag_name,
                "anomaly_type": "TAG_MISSING",
                "severity": "HIGH"
            })
            continue

        base_val = baseline_tags[tag_name].value
        curr_val = current_tags[tag_name].value

        if base_val != 0:
            deviation = abs(curr_val - base_val) / abs(base_val) * 100
            if deviation > threshold_pct:
                anomalies.append({
                    "tag": tag_name,
                    "baseline_value": base_val,
                    "current_value": curr_val,
                    "deviation_pct": round(deviation, 2),
                    "anomaly_type": "SETPOINT_DEVIATION",
                    "severity": "CRITICAL" if deviation > 50 else "HIGH"
                })

    for tag_name in current_tags:
        if tag_name not in baseline_tags:
            anomalies.append({
                "tag": tag_name,
                "anomaly_type": "NEW_TAG",
                "severity": "MEDIUM",
                "value": current_tags[tag_name].value
            })

    return anomalies
```

**隐藏逻辑检测**

攻击者可能在 PLC 程序中插入隐藏逻辑，常见手法包括：

- 使用未使用的中间变量（M 位）传递隐藏信号
- 利用定时器/计数器的隐含状态
- 在梯形图中使用注释伪装恶意支路
- 在数据块（DB）中嵌入额外的控制参数

```python
def detect_hidden_logic(plc_program):
    findings = []

    for db in plc_program.data_blocks:
        if db.size > db.expected_size:
            findings.append({
                "type": "DB_SIZE_ANOMALY",
                "block": db.number,
                "expected_size": db.expected_size,
                "actual_size": db.size,
                "excess_bytes": db.size - db.expected_size
            })

    for ob in plc_program.organization_blocks:
        called_blocks = set(ob.call_graph.all_called())
        declared_blocks = set(ob.declared_blocks)
        undeclared = called_blocks - declared_blocks
        if undeclared:
            findings.append({
                "type": "UNDECLARED_BLOCK_CALL",
                "ob_number": ob.number,
                "undeclared_blocks": list(undeclared)
            })

    return findings
```

### PLC 日志分析

PLC 通常维护两类关键日志：

| 日志类型 | 内容 | 取证价值 |
|----------|------|----------|
| 事件日志（Event Log） | STOP/RUN 切换、断电/上电、硬件故障、通信中断 | 时间线重建、异常操作检测 |
| 诊断缓冲区（Diagnostic Buffer） | CPU 内部错误、编程错误、IO 异常 | 攻击行为痕迹、故障关联分析 |

```bash
# Siemens S7 PLC 事件日志提取（使用 s7client 工具）
s7client --ip 192.168.1.10 --rack 0 --slot 1 \
  read-event-log --format csv --output /evidence/plc_events.csv

# 分析 STOP/RUN 切换事件
grep -E "STOP|RUN" /evidence/plc_events.csv | \
  awk -F',' '{print $1, $3, $4}' | sort -k1
```

### 主流 PLC 平台取证

**Siemens S7 系列取证要点**

| 取证目标 | 方法 | 工具 |
|----------|------|------|
| 程序块上传 | 在线上传 OB/DB/FB/FC | TIA Portal / STEP7 |
| 安全状态检查 | 检查密码保护级别 | TIA Portal → Protection |
| 通信记录 | 检查连接资源使用 | STEP7 → Module Info |
| 固件版本 | CPU 属性读取 | s7-info / TIA Portal |
| 安全日志 | 读取诊断缓冲区 | STEP7 → Diagnostic Buffer |

Siemens S7 系列的安全保护级别：

```
Level 0: 无保护（可读写所有块）
Level 1: 密码保护（知道密码可读写）
Level 2: 密码保护 + 读取保护
Level 3: 密码保护 + 已知/未知密码（最高保护）
Level 4: 安全等级 4（S7-1500，支持 PROFINET 安全）
```

**Allen-Bradley ControlLogix 取证要点**

```bash
# 使用 pycomm3 库连接 ControlLogix
from pycomm3 import LogixDriver

with LogixDriver('192.168.1.20') as plc:
    print(f"设备: {plc.info['device_type']}")
    print(f"固件: {plc.info['firmware']}")
    print(f"序列号: {plc.info['serial']}")

    tags = plc.get_tag_list()
    for tag in tags:
        print(f"Tag: {tag['tag_name']}, "
              f"Type: {tag['data_type']}, "
              f"Value: {tag.get('value', 'N/A')}")

    controller_tags = plc.read('Program:MainProgram.AllTags')
```

**Schneider Modicon 取证要点**

- 使用 EcoStruxure Control Expert（原 Unity Pro）进行程序上传
- 检查 Modicon 的 M340/M580 安全配置
- 关注 Modbus 从站地址配置
- 检查固件版本与已知漏洞的关联

**ABB AC 800M 取证要点**

- 使用 Control Builder M 进行程序管理
- 检查 Controller 的 OPC Server 配置
- 关注 AF 通信模块的 PROFINET 配置
- 检查冗余控制器同步状态

---

## 0x03 HMI 与 SCADA 服务器取证

### HMI 系统架构与数据流

HMI（Human Machine Interface）是操作员与工业过程之间的交互界面。HMI 系统的取证价值在于它记录了操作员的每一个操作行为，同时也可能成为攻击者操纵工艺过程的入口。

典型 HMI 数据流路径：

```
现场传感器 → PLC/RTU → SCADA Server → HMI → 操作员
                ↑                              │
                └──── 操作员操作指令 ────────────┘
```

### HMI 操作系统取证

HMI 面板通常运行以下操作系统：

| 操作系统 | 典型平台 | 取证方法 |
|----------|----------|----------|
| Windows CE | Siemens TP/MP 系列 | CF 卡镜像、注册表分析 |
| Windows 10 IoT | 新型 HMI 面板 | 标准 Windows 取证流程（受限） |
| Linux 嵌入式 | Schneider Magelis | eMMC 镜像、日志提取 |
| VxWorks | 部分专用 HMI | 内存提取、文件系统分析 |

```bash
# HMI 面板 Windows CE 系统镜像提取
# 通过 CF 卡或 SD 卡物理提取
dd if=/dev/sdc of=/evidence/hmi_cf_card.img bs=4M conv=noerror,sync
sha256sum /evidence/hmi_cf_card.img > /evidence/hmi_cf_card.img.sha256

# 挂载分析（只读）
mkdir -p /mnt/hmi_evidence
mount -o ro,loop /evidence/hmi_cf_card.img /mnt/hmi_evidence

# 提取关键日志文件
find /mnt/hmi_evidence -name "*.log" -o -name "*.evt" -o -name "*.csv" | \
  while read f; do
    cp --preserve=timestamps "$f" /evidence/hmi_logs/
  done
```

### HMI 项目文件分析

**画面配置篡改检测**

攻击者可能篡改 HMI 画面，使操作员看到虚假的正常状态，而实际工艺参数已偏离安全范围。

```python
import os
import hashlib
import json

def audit_hmi_screens(project_dir, baseline_dir):
    tampered_screens = []

    for root, dirs, files in os.walk(project_dir):
        for fname in files:
            if fname.endswith(('.pdl', '.pdlx', '.hmi', '.fpt')):
                filepath = os.path.join(root, fname)
                rel_path = os.path.relpath(filepath, project_dir)
                baseline_path = os.path.join(baseline_dir, rel_path)

                with open(filepath, 'rb') as f:
                    current_hash = hashlib.sha256(f.read()).hexdigest()

                if os.path.exists(baseline_path):
                    with open(baseline_path, 'rb') as f:
                        baseline_hash = hashlib.sha256(
                            f.read()
                        ).hexdigest()

                    if current_hash != baseline_hash:
                        tampered_screens.append({
                            "screen": rel_path,
                            "baseline_hash": baseline_hash,
                            "current_hash": current_hash,
                            "change_type": "MODIFIED"
                        })
                else:
                    tampered_screens.append({
                        "screen": rel_path,
                        "current_hash": current_hash,
                        "change_type": "NEW_SCREEN"
                    })

    return tampered_screens
```

**报警配置异常检测**

```python
def detect_alarm_config_anomalies(alarm_config, baseline_config):
    anomalies = []

    for alarm_id in baseline_config:
        if alarm_id not in alarm_config:
            anomalies.append({
                "alarm_id": alarm_id,
                "issue": "ALARM_REMOVED",
                "severity": "CRITICAL",
                "description": "报警已被删除，可能导致操作员无法收到关键告警"
            })
            continue

        base = baseline_config[alarm_id]
        curr = alarm_config[alarm_id]

        if curr.get('priority') != base.get('priority'):
            anomalies.append({
                "alarm_id": alarm_id,
                "issue": "PRIORITY_CHANGED",
                "baseline_priority": base.get('priority'),
                "current_priority": curr.get('priority'),
                "severity": "HIGH"
            })

        if curr.get('threshold') != base.get('threshold'):
            anomalies.append({
                "alarm_id": alarm_id,
                "issue": "THRESHOLD_CHANGED",
                "baseline_threshold": base.get('threshold'),
                "current_threshold": curr.get('threshold'),
                "severity": "CRITICAL"
            })

        if curr.get('suppressed') and not base.get('suppressed'):
            anomalies.append({
                "alarm_id": alarm_id,
                "issue": "ALARM_SUPPRESSED",
                "severity": "CRITICAL",
                "description": "报警被抑制，操作员将无法收到此告警"
            })

    return anomalies
```

**脚本/宏代码分析**

HMI 系统通常支持 VBS、C 脚本或专用宏语言，攻击者可能通过注入恶意脚本实现持久化或数据窃取。

```python
import re

def scan_hmi_scripts(script_dir):
    suspicious_patterns = [
        (r'shell\s*\(', "Shell 命令执行"),
        (r'WScript\.Shell', "WScript 对象实例化"),
        (r'CreateObject\s*\(', "COM 对象创建"),
        (r'InternetExplorer\.Application', "浏览器对象（可能用于数据外传）"),
        (r'ADODB\.Stream', "文件流操作"),
        (r'SaveToFile', "文件写入操作"),
        (r'WinHttp|XMLHTTP|ServerXMLHTTP', "HTTP 请求（数据外传风险）"),
        (r'FileSystemObject', "文件系统操作"),
        (r'RegWrite|RegRead', "注册表操作"),
        (r'socket|connect|send|recv', "网络通信"),
        (r'powershell|cmd\.exe|regsvr32', "命令执行"),
        (r'base64|decode|decode64', "编码/解码操作"),
    ]

    findings = []
    for root, _, files in os.walk(script_dir):
        for fname in files:
            if fname.endswith(('.vbs', '.bs', '.c', '.py', '.lua', '.macro')):
                filepath = os.path.join(root, fname)
                with open(filepath, 'r', errors='ignore') as f:
                    content = f.read()
                    for pattern, desc in suspicious_patterns:
                        matches = re.findall(pattern, content, re.IGNORECASE)
                        if matches:
                            findings.append({
                                "file": filepath,
                                "pattern": pattern,
                                "description": desc,
                                "match_count": len(matches),
                                "severity": "HIGH"
                            })

    return findings
```

### SCADA 服务器取证

**数据库日志分析**

SCADA 服务器通常使用关系数据库存储标签值、报警事件和操作记录。

```sql
-- 检测异常操作模式（非工作时间的写操作）
SELECT operator_id, tag_name, old_value, new_value, timestamp
FROM operation_log
WHERE HOUR(timestamp) NOT BETWEEN 8 AND 18
   OR DAYOFWEEK(timestamp) IN (1, 7)
ORDER BY timestamp DESC
LIMIT 100;

-- 检测短时间内大量写操作（可能的批量篡改）
SELECT operator_id, COUNT(*) as write_count,
       MIN(timestamp) as first_write,
       MAX(timestamp) as last_write
FROM operation_log
WHERE action_type = 'WRITE'
GROUP BY operator_id, DATE(timestamp)
HAVING write_count > 50
ORDER BY write_count DESC;

-- 检测关键安全标签的修改
SELECT * FROM operation_log
WHERE tag_name IN (
    SELECT tag_name FROM critical_tags
    WHERE safety_related = TRUE
)
ORDER BY timestamp DESC;
```

**标签/点表异常检测**

```python
def detect_tag_anomalies(current_tags, baseline_tags):
    anomalies = []

    for tag in current_tags:
        if tag.name not in {t.name for t in baseline_tags}:
            anomalies.append({
                "tag": tag.name,
                "issue": "NEW_TAG",
                "value": tag.value,
                "engineering_units": tag.units,
                "severity": "MEDIUM"
            })

    for tag in baseline_tags:
        if tag.name not in {t.name for t in current_tags}:
            anomalies.append({
                "tag": tag.name,
                "issue": "TAG_REMOVED",
                "severity": "HIGH"
            })

    baseline_map = {t.name: t for t in baseline_tags}
    for tag in current_tags:
        if tag.name in baseline_map:
            base = baseline_map[tag.name]
            if tag.scale_low != base.scale_low or tag.scale_high != base.scale_high:
                anomalies.append({
                    "tag": tag.name,
                    "issue": "SCALING_CHANGED",
                    "baseline_low": base.scale_low,
                    "baseline_high": base.scale_high,
                    "current_low": tag.scale_low,
                    "current_high": tag.scale_high,
                    "severity": "CRITICAL"
                })

    return anomalies
```

### 历史数据库（Historian）取证

**数据完整性验证**

历史数据库是工控取证中最关键的数据源之一，它保存了工艺过程的时序数据，是重建攻击时间线的核心证据。

```python
import hashlib
from datetime import datetime, timedelta

def verify_historian_integrity(data_points, expected_interval_sec=60):
    gaps = []
    duplicates = []
    out_of_order = []

    sorted_points = sorted(data_points, key=lambda x: x.timestamp)

    for i in range(1, len(sorted_points)):
        prev = sorted_points[i - 1]
        curr = sorted_points[i]

        delta = (curr.timestamp - prev.timestamp).total_seconds()

        if delta > expected_interval_sec * 2:
            gaps.append({
                "gap_start": prev.timestamp.isoformat(),
                "gap_end": curr.timestamp.isoformat(),
                "gap_duration_sec": delta,
                "severity": "HIGH" if delta > 3600 else "MEDIUM"
            })

        if delta == 0 and prev.value == curr.value:
            duplicates.append({
                "timestamp": curr.timestamp.isoformat(),
                "value": curr.value,
                "tag": curr.tag_name
            })

        if curr.timestamp < prev.timestamp:
            out_of_order.append({
                "prev_ts": prev.timestamp.isoformat(),
                "curr_ts": curr.timestamp.isoformat(),
                "tag": curr.tag_name
            })

    return {
        "total_points": len(sorted_points),
        "gaps": gaps,
        "duplicates": duplicates,
        "out_of_order": out_of_order,
        "integrity_score": 1.0 - (
            len(gaps) + len(duplicates) + len(out_of_order)
        ) / len(sorted_points)
    }
```

**时间戳一致性分析**

```python
def analyze_timestamp_consistency(historian_data, plc_event_log):
    discrepancies = []

    hist_timestamps = {p.tag_name: p.timestamp for p in historian_data}
    plc_timestamps = {e.tag_name: e.timestamp for e in plc_event_log}

    for tag in set(hist_timestamps.keys()) & set(plc_timestamps.keys()):
        delta = abs(
            (hist_timestamps[tag] - plc_timestamps[tag]).total_seconds()
        )
        if delta > 5:
            discrepancies.append({
                "tag": tag,
                "historian_ts": hist_timestamps[tag].isoformat(),
                "plc_ts": plc_timestamps[tag].isoformat(),
                "delta_sec": delta,
                "possible_cause": "CLOCK_SKEW" if delta < 60
                    else "POTENTIAL_TAMPERING"
            })

    return discrepancies
```

### Bash/Python 脚本：HMI 配置异常检测

```python
#!/usr/bin/env python3
import os
import sys
import hashlib
import json
import csv
from datetime import datetime

def full_hmi_audit(hmi_project_dir, baseline_dir, output_dir):
    report = {
        "audit_time": datetime.now().isoformat(),
        "project_dir": hmi_project_dir,
        "baseline_dir": baseline_dir,
        "findings": []
    }

    for root, dirs, files in os.walk(hmi_project_dir):
        for fname in files:
            filepath = os.path.join(root, fname)
            rel_path = os.path.relpath(filepath, hmi_project_dir)
            baseline_path = os.path.join(baseline_dir, rel_path)

            with open(filepath, 'rb') as f:
                current_hash = hashlib.sha256(f.read()).hexdigest()

            if os.path.exists(baseline_path):
                with open(baseline_path, 'rb') as f:
                    baseline_hash = hashlib.sha256(f.read()).hexdigest()

                if current_hash != baseline_hash:
                    report["findings"].append({
                        "file": rel_path,
                        "status": "MODIFIED",
                        "baseline_hash": baseline_hash,
                        "current_hash": current_hash,
                        "severity": "HIGH"
                    })
            else:
                report["findings"].append({
                    "file": rel_path,
                    "status": "NEW_FILE",
                    "current_hash": current_hash,
                    "severity": "MEDIUM"
                })

    for baseline_root, _, baseline_files in os.walk(baseline_dir):
        for fname in baseline_files:
            baseline_path = os.path.join(baseline_root, fname)
            rel_path = os.path.relpath(baseline_path, baseline_dir)
            current_path = os.path.join(hmi_project_dir, rel_path)

            if not os.path.exists(current_path):
                report["findings"].append({
                    "file": rel_path,
                    "status": "DELETED",
                    "severity": "CRITICAL"
                })

    os.makedirs(output_dir, exist_ok=True)
    report_path = os.path.join(output_dir, "hmi_audit_report.json")
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    return report

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(f"Usage: {sys.argv[0]} <hmi_project> <baseline> <output>")
        sys.exit(1)

    result = full_hmi_audit(sys.argv[1], sys.argv[2], sys.argv[3])
    print(f"审计完成，发现 {len(result['findings'])} 个异常项")
    for finding in result["findings"]:
        print(f"  [{finding['severity']}] {finding['file']}: "
              f"{finding['status']}")
```

---

## 0x04 工业协议取证

### Modbus TCP/RTU 协议取证

Modbus 是工控领域使用最广泛的协议之一，其设计之初未考虑安全性，因此协议层面的取证分析至关重要。

**Modbus TCP 帧结构**

```
+-------------------+-------------------+-------------------+
| MBAP Header       | PDU               | Data              |
| (7 bytes)         |                   |                   |
+-------------------+-------------------+-------------------+
| Transaction ID    | Function Code     | Register Data     |
| Protocol ID       | Reference Number  |                   |
| Length             |                   |                   |
| Unit ID           |                   |                   |
+-------------------+-------------------+-------------------+
```

**功能码异常检测**

| 功能码 | 功能描述 | 安全关注点 |
|--------|----------|------------|
| FC01 (0x01) | 读线圈状态 | 信息泄露 |
| FC03 (0x03) | 读保持寄存器 | 信息泄露 |
| FC05 (0x05) | 写单个线圈 | 控制篡改 |
| FC06 (0x06) | 写单个寄存器 | 参数篡改 |
| FC15 (0x0F) | 写多个线圈 | 批量控制篡改 |
| FC16 (0x10) | 写多个寄存器 | 批量参数篡改 |
| FC43 (0x2B) | 封装接口（MEI） | 固件操作 |
| FC08 (0x08) | 诊断 | 设备探测 |

```python
from scapy.all import *
from collections import defaultdict, Counter

def analyze_modbus_traffic(pcap_file):
    packets = rdpcap(pcap_file)

    write_operations = []
    func_code_dist = Counter()
    src_dst_writes = defaultdict(list)
    unusual_transactions = []

    for pkt in packets:
        if TCP in pkt and pkt[TCP].dport == 502:
            payload = bytes(pkt[TCP].payload)
            if len(payload) >= 9:
                trans_id = int.from_bytes(payload[0:2], 'big')
                func_code = payload[7]
                func_code_dist[func_code] += 1

                if func_code in (0x05, 0x06, 0x0F, 0x10):
                    src_ip = pkt[IP].src if IP in pkt else "unknown"
                    dst_ip = pkt[IP].dst if IP in pkt else "unknown"
                    ref_num = int.from_bytes(payload[8:10], 'big')

                    write_operations.append({
                        "timestamp": float(pkt.time),
                        "src": src_ip,
                        "dst": dst_ip,
                        "func_code": func_code,
                        "reference": ref_num,
                        "transaction_id": trans_id
                    })
                    src_dst_writes[src_ip].append({
                        "timestamp": float(pkt.time),
                        "func_code": func_code,
                        "reference": ref_num
                    })

                if func_code not in (0x01, 0x02, 0x03, 0x04,
                                      0x05, 0x06, 0x0F, 0x10,
                                      0x08, 0x0B, 0x0C, 0x11,
                                      0x17, 0x2B):
                    unusual_transactions.append({
                        "timestamp": float(pkt.time),
                        "func_code": f"0x{func_code:02X}",
                        "src": pkt[IP].src if IP in pkt else "unknown",
                        "transaction_id": trans_id
                    })

    return {
        "total_writes": len(write_operations),
        "func_code_distribution": dict(func_code_dist),
        "write_operations": write_operations,
        "unusual_transactions": unusual_transactions,
        "suspicious_sources": {
            src: len(ops) for src, ops in src_dst_writes.items()
            if len(ops) > 100
        }
    }
```

**Wireshark 过滤器示例**

```
# 过滤 Modbus 写操作
mbtcp.trans_id >= 0 && modbus.func_code in {5 6 15 16}

# 过滤非法事务标识符
mbtcp.trans_id > 60000

# 过滤特定源 IP 的 Modbus 通信
modbus && ip.src == 192.168.1.100

# 过滤诊断功能码
modbus.func_code == 8

# 过滤异常功能码
modbus.func_code > 43
```

### DNP3 协议取证

DNP3（Distributed Network Protocol 3）广泛应用于电力和水利行业。

**DNP3 操作类型与安全关注点**

| 操作类型 | 功能描述 | 取证关注点 |
|----------|----------|------------|
| Direct Operate (0x05) | 直接执行控制命令 | 未授权控制操作 |
| Select Before Operate (0x03/0x04) | 选择后执行 | 选择-执行配对异常 |
| Clear/Restart | 清除事件缓冲/重启 | 证据销毁 |
| File Transfer | 文件传输 | 固件/配置篡改 |
| Time Sync | 时间同步 | 时间戳操纵（影响证据时序） |
| Immediate Freeze | 立即冻结 | 数据冻结导致数据缺失 |

```python
def analyze_dnp3_operations(pcap_file):
    packets = rdpcap(pcap_file)

    operations = []
    time_sync_events = []
    select_operate_pairs = defaultdict(dict)

    for pkt in packets:
        if TCP in pkt and (pkt[TCP].dport == 20000 or pkt[TCP].sport == 20000):
            payload = bytes(pkt[TCP].payload)
            if len(payload) < 10:
                continue

            if pkt[TCP].dport == 20000:
                direction = "master_to_outstation"
            else:
                direction = "outstation_to_master"

            for offset in range(len(payload) - 2):
                if payload[offset] == 0x64:
                    al_func = payload[offset + 2] if offset + 2 < len(payload) else 0

                    if al_func in (0x05, 0x03, 0x04):
                        operations.append({
                            "timestamp": float(pkt.time),
                            "direction": direction,
                            "function_code": al_func,
                            "function_name": {
                                0x03: "SELECT",
                                0x04: "OPERATE",
                                0x05: "DIRECT_OPERATE"
                            }.get(al_func, f"UNKNOWN_0x{al_func:02X}"),
                            "src": pkt[IP].src if IP in pkt else "unknown"
                        })

                    if al_func == 0x0C:
                        time_sync_events.append({
                            "timestamp": float(pkt.time),
                            "direction": direction,
                            "src": pkt[IP].src if IP in pkt else "unknown"
                        })

    return {
        "operations": operations,
        "time_sync_events": time_sync_events,
        "direct_operate_count": sum(
            1 for op in operations if op["function_code"] == 0x05
        )
    }
```

### IEC 61850 (GOOSE/SV/MMS) 协议取证

IEC 61850 是变电站自动化的核心标准，其 GOOSE（Generic Object Oriented Substation Event）和 SV（Sampled Values）是面向快速发布的二层协议。

**GOOSE 消息异常检测**

```python
from scapy.all import *

def analyze_goose_traffic(interface_or_pcap):
    goose_events = []
    state_change_count = 0
    sequence_anomalies = []
    prev_st_num = {}

    def goose_callback(pkt):
        nonlocal state_change_count
        if pkt.haslayer('GSE'):
            gse_layer = pkt['GSE']
            go_id = gse_layer.goID.decode() if hasattr(gse_layer, 'goID') else "unknown"
            st_num = gse_layer.stNum if hasattr(gse_layer, 'stNum') else 0
            sq_num = gse_layer.sqNum if hasattr(gse_layer, 'sqNum') else 0

            goose_events.append({
                "timestamp": float(pkt.time),
                "go_id": go_id,
                "st_num": st_num,
                "sq_num": sq_num,
                "src_mac": pkt.src
            })

            if go_id in prev_st_num:
                if st_num > prev_st_num[go_id]:
                    state_change_count += 1
                elif st_num == prev_st_num[go_id] and sq_num == 0:
                    sequence_anomalies.append({
                        "go_id": go_id,
                        "timestamp": float(pkt.time),
                        "issue": "SEQUENCE_RESET"
                    })

            prev_st_num[go_id] = st_num

    if os.path.isfile(interface_or_pcap):
        packets = rdpcap(interface_or_pcap)
        for pkt in packets:
            goose_callback(pkt)
    else:
        sniff(iface=interface_or_pcap, filter="ether proto 0x88B8",
              prn=goose_callback, count=10000, timeout=300)

    return {
        "total_goose_events": len(goose_events),
        "state_changes": state_change_count,
        "sequence_anomalies": sequence_anomalies,
        "unique_go_ids": list(set(e["go_id"] for e in goose_events))
    }
```

**配置文件完整性验证**

IEC 61850 使用 SCD（Substation Configuration Description）、ICD（IED Capability Description）和 CID（Configured IED Description）文件进行系统配置。

```bash
# 计算配置文件哈希
sha256sum *.scd *.icd *.cid > config_baseline.sha256

# 验证配置文件完整性
sha256sum -c config_baseline.sha256

# 对比 SCD 文件差异（XML 格式）
xmldiff baseline.scd current.scd --output scd_diff.xml
```

### Siemens S7comm/S7comm-plus 协议取证

S7comm 是 Siemens 专有的 PLC 通信协议，运行在 TCP 102 端口上。S7comm-plus 是 S7-1200/1500 使用的增强版本。

```
# Wireshark 过滤器：S7comm 协议
s7comm || s7commplus

# 过滤 S7 写操作
s7comm.param.func == 26

# 过滤块上传/下载
s7comm.param.func in {1 2 3}

# 过滤 CPU 控制命令（STOP/RUN/RESET）
s7comm.param.func == 28
```

### OPC UA 安全取证

OPC UA（Unified Architecture）是新一代工业数据交换标准，内置了安全机制（加密、认证、审计日志）。

```python
def audit_opcua_security(opcua_audit_log):
    findings = []

    for entry in opcua_audit_log:
        if entry.get('event_type') == 'Write':
            if entry.get('user') not in KNOWN_AUTHORIZED_USERS:
                findings.append({
                    "timestamp": entry['timestamp'],
                    "event": "UNAUTHORIZED_WRITE",
                    "user": entry['user'],
                    "node_id": entry['node_id'],
                    "value": entry['value'],
                    "severity": "CRITICAL"
                })

        if entry.get('event_type') == 'CreateSession':
            if entry.get('security_policy') == 'None':
                findings.append({
                    "timestamp": entry['timestamp'],
                    "event": "INSECURE_SESSION",
                    "client": entry.get('client_address'),
                    "severity": "HIGH"
                })

        if entry.get('event_type') == 'Call':
            method_id = entry.get('method_id', '')
            if 'reset' in method_id.lower() or 'delete' in method_id.lower():
                findings.append({
                    "timestamp": entry['timestamp'],
                    "event": "DANGEROUS_METHOD_CALL",
                    "method": method_id,
                    "user": entry['user'],
                    "severity": "HIGH"
                })

    return findings
```

### Python 脚本：工业协议异常检测

```python
#!/usr/bin/env python3
import sys
import json
from collections import defaultdict, Counter
from datetime import datetime
from scapy.all import rdpcap, TCP, IP

PROTOCOL_PORTS = {
    'modbus': 502,
    'dnp3': 20000,
    's7comm': 102,
    'ethernetip': 44818,
    'opcua': 4840,
    'iec104': 2404
}

WRITE_FUNC_CODES = {
    'modbus': [0x05, 0x06, 0x0F, 0x10],
    'dnp3': [0x03, 0x04, 0x05],
}

def detect_protocol_anomalies(pcap_file, protocol, baseline_file=None):
    port = PROTOCOL_PORTS.get(protocol)
    if not port:
        print(f"不支持的协议: {protocol}")
        return None

    packets = rdpcap(pcap_file)
    write_ops = []
    new_sources = set()
    func_counter = Counter()
    time_anomalies = []
    prev_timestamp = None

    baseline_sources = set()
    if baseline_file:
        baseline_pkts = rdpcap(baseline_file)
        for pkt in baseline_pkts:
            if IP in pkt and TCP in pkt and pkt[TCP].dport == port:
                baseline_sources.add(pkt[IP].src)

    for pkt in packets:
        if IP not in pkt or TCP not in pkt:
            continue

        if pkt[TCP].dport != port:
            continue

        src_ip = pkt[IP].src
        payload = bytes(pkt[TCP].payload)

        if baseline_sources and src_ip not in baseline_sources:
            new_sources.add(src_ip)

        if len(payload) > 7:
            if protocol == 'modbus':
                fc = payload[7]
                func_counter[fc] += 1

                if fc in WRITE_FUNC_CODES['modbus']:
                    write_ops.append({
                        "timestamp": float(pkt.time),
                        "src": src_ip,
                        "dst": pkt[IP].dst,
                        "func_code": f"0x{fc:02X}"
                    })

        if prev_timestamp and float(pkt.time) < prev_timestamp:
            time_anomalies.append({
                "timestamp": float(pkt.time),
                "prev_timestamp": prev_timestamp,
                "issue": "OUT_OF_ORDER"
            })
        prev_timestamp = float(pkt.time)

    report = {
        "protocol": protocol,
        "pcap_file": pcap_file,
        "analysis_time": datetime.now().isoformat(),
        "total_packets": len(packets),
        "write_operations": len(write_ops),
        "new_sources": list(new_sources),
        "func_code_distribution": dict(func_counter),
        "time_anomalies": len(time_anomalies),
        "findings": []
    }

    if new_sources:
        report["findings"].append({
            "type": "NEW_SOURCE_DETECTED",
            "sources": list(new_sources),
            "severity": "HIGH"
        })

    if time_anomalies:
        report["findings"].append({
            "type": "TIMESTAMP_ANOMALY",
            "count": len(time_anomalies),
            "severity": "MEDIUM"
        })

    if len(write_ops) > 1000:
        report["findings"].append({
            "type": "EXCESSIVE_WRITES",
            "count": len(write_ops),
            "severity": "CRITICAL"
        })

    return report

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <pcap_file> <protocol> [baseline_pcap]")
        print(f"Protocols: {', '.join(PROTOCOL_PORTS.keys())}")
        sys.exit(1)

    pcap = sys.argv[1]
    proto = sys.argv[2]
    baseline = sys.argv[3] if len(sys.argv) > 3 else None

    result = detect_protocol_anomalies(pcap, proto, baseline)
    if result:
        print(json.dumps(result, indent=2, ensure_ascii=False))
```

---

## 0x05 固件提取与分析

### 固件提取方法

工控设备的固件提取是取证分析中最具挑战性的环节之一，因为工控设备通常使用专有硬件和嵌入式操作系统。

**物理提取方法**

| 方法 | 适用场景 | 工具 | 风险等级 |
|------|----------|------|----------|
| SPI Flash 读取 | 独立 Flash 芯片存储固件 | CH341A、FT2232H、Bus Pirate | 中（需要拆焊芯片） |
| JTAG 调试接口 | 支持 JTAG 的处理器 | J-Link、OpenOCD、FT2232H | 低（非破坏性） |
| UART 串口 | 获取控制台访问 | USB-TTL 转换器 | 低 |
| NAND/NOR 直读 | 焊接式存储芯片 | SF100、TOP3000 | 高（需要专业设备） |
| eMMC 提取 | 嵌入式多媒体卡 | eMMC 适配器 | 中 |

```bash
# 使用 flashrom 从 SPI Flash 读取固件
flashrom -p ch341a_spi -c "W25Q128BV" -r firmware_dump.bin

# 验证读取完整性（多次读取并比对）
flashrom -p ch341a_spi -c "W25Q128BV" -r firmware_dump_verify1.bin
flashrom -p ch341a_spi -c "W25Q128BV" -r firmware_dump_verify2.bin
sha256sum firmware_dump.bin firmware_dump_verify1.bin firmware_dump_verify2.bin

# 使用 OpenOCD 通过 JTAG 提取固件
openocd -f interface/jlink.cfg -f target/stm32f4x.cfg \
  -c "init" -c "halt" \
  -c "dump_image firmware_jtag.bin 0x08000000 0x100000" \
  -c "exit"
```

**逻辑提取方法**

```bash
# 通过固件更新接口提取（某些设备允许下载当前固件）
# Siemens S7-1500 固件备份（通过 TIA Portal）
# 操作路径：TIA Portal → 项目视图 → 在线 → 固件备份

# 使用 s7fwextract 工具提取 S7 固件
python3 s7fwextract.py --ip 192.168.1.10 --output s7_firmware.bin

# ABB AC 800M 固件提取（通过 Control Builder M）
# 操作路径：Controller → Online → Create Firmware Backup
```

### 固件分析技术

**binwalk 固件解包**

```bash
# 固件类型识别
file firmware_dump.bin

# binwalk 扫描
binwalk firmware_dump.bin

# 提取固件中的文件系统
binwalk -e firmware_dump.bin

# 递归提取
binwalk -eM firmware_dump.bin

# 熵分析（检测加密/压缩区域）
binwalk -E firmware_dump.bin
```

**文件系统提取**

```bash
# 提取 SquashFS 文件系统
unsquashfs firmware_dump.bin.extracted/*.squashfs

# 提取 CramFS
cramfsck firmware_dump.bin.extracted/*.cramfs -x extracted_cramfs/

# 提取 JFFS2 文件系统
jefferson firmware_dump.bin.extracted/*.jffs2 -d extracted_jffs2/

# 提取 UBI/UBIFS
ubireader_extract_images -o ubi_output/ firmware_dump.bin
```

**硬编码凭据检测**

```bash
# 使用 strings 和正则检测硬编码凭据
strings firmware_dump.bin | grep -iE \
  "(password|passwd|pwd|admin|root|default|secret|key|token)" | \
  sort -u > hardcoded_credentials.txt

# 使用 truffleHog 扫描固件中的密钥
trufflehog filesystem --directory extracted_firmware/ \
  --json > secrets_report.json

# 使用 credsfinder 检测凭据
python3 -m credsfinder scan -d extracted_firmware/ -o creds_report.json
```

**后门检测**

```python
import os
import re
import hashlib

def scan_firmware_backdoors(extracted_dir):
    backdoor_indicators = [
        rb'\x7fELF.*\x00/bin/sh',
        rb'nc\s+-[el]+\s+\d+',
        rb'wget\s+http',
        rb'curl\s+http',
        rb'/dev/tcp/',
        rb'mkfifo\s+/tmp/',
        rb'iptables\s+-F',
        rb'chmod\s+777',
        rb'suid|sgid',
    ]

    suspicious_strings = [
        "backdoor", "reverse_shell", "bind_shell",
        "rootkit", "keylog", "exfil", "c2_beacon",
        "telnetd", "ftpd", "dropbear", "ncat"
    ]

    findings = []

    for root, dirs, files in os.walk(extracted_dir):
        for fname in files:
            filepath = os.path.join(root, fname)
            try:
                with open(filepath, 'rb') as f:
                    content = f.read()

                for pattern in backdoor_indicators:
                    matches = re.findall(pattern, content)
                    if matches:
                        findings.append({
                            "file": filepath,
                            "type": "BINARY_PATTERN",
                            "pattern": pattern.decode('unicode_escape'),
                            "match_count": len(matches)
                        })

                content_lower = content.lower()
                for s in suspicious_strings:
                    if s.encode() in content_lower:
                        findings.append({
                            "file": filepath,
                            "type": "SUSPICIOUS_STRING",
                            "string": s,
                            "severity": "HIGH"
                        })

                if os.path.getsize(filepath) > 0:
                    file_hash = hashlib.sha256(content).hexdigest()
                    findings.append({
                        "file": filepath,
                        "type": "FILE_HASH",
                        "sha256": file_hash,
                        "size": os.path.getsize(filepath)
                    })

            except (PermissionError, IsADirectoryError):
                continue

    return findings
```

### 固件完整性验证

```bash
# 建立固件基线哈希库
find /firmware_baseline/ -type f | while read f; do
  sha256sum "$f"
done > firmware_baseline_hashes.txt

# 对比当前固件
find /firmware_current/ -type f | while read f; do
  sha256sum "$f"
done > firmware_current_hashes.txt

diff firmware_baseline_hashes.txt firmware_current_hashes.txt
```

---

## 0x06 工控网络安全取证

### 工控网络拓扑取证

**Purdue 模型合规验证**

Purdue 参考模型是工控网络分段的基石，将网络划分为以下层级：

```
Level 5: 企业网络（ERP/MES）
  │
Level 4: DMZ（工业 DMZ）
  │
Level 3: 生产运营管理（Historian/OPC Server/Engineering）
  │
Level 2: 监控层（HMI/SCADA Server）
  │
Level 1: 基本控制层（PLC/DCS Controller）
  │
Level 0: 物理过程层（传感器/执行器）
```

```python
def verify_purdue_compliance(network_topology_file):
    violations = []

    with open(network_topology_file) as f:
        topology = json.load(f)

    level_ranges = {
        "Level_5_Enterprise": ["10.0.0.0/8"],
        "Level_4_DMZ": ["172.16.0.0/12"],
        "Level_3_Operations": ["192.168.10.0/24"],
        "Level_2_Supervisory": ["192.168.20.0/24"],
        "Level_1_Control": ["192.168.30.0/24"],
        "Level_0_Physical": ["192.168.40.0/24"]
    }

    for connection in topology.get('connections', []):
        src_level = connection.get('source_level')
        dst_level = connection.get('destination_level')

        allowed_connections = [
            ("Level_5_Enterprise", "Level_4_DMZ"),
            ("Level_4_DMZ", "Level_3_Operations"),
            ("Level_3_Operations", "Level_2_Supervisory"),
            ("Level_2_Supervisory", "Level_1_Control"),
            ("Level_1_Control", "Level_0_Physical"),
        ]

        pair = (src_level, dst_level)
        reverse_pair = (dst_level, src_level)

        if pair not in allowed_connections and reverse_pair not in allowed_connections:
            violations.append({
                "source": connection.get('source_ip'),
                "source_level": src_level,
                "destination": connection.get('destination_ip'),
                "destination_level": dst_level,
                "violation": "CROSS_LEVEL_CONNECTION",
                "severity": "CRITICAL"
            })

        if src_level == dst_level and src_level in ("Level_1_Control", "Level_0_Physical"):
            pass
        elif src_level == dst_level:
            violations.append({
                "source": connection.get('source_ip'),
                "destination": connection.get('destination_ip'),
                "level": src_level,
                "violation": "INTRA_LEVEL_CONNECTION",
                "severity": "MEDIUM"
            })

    return violations
```

**网络分段有效性检测**

```bash
# 从 IT 网络测试到 OT 网络的连通性（仅 ICMP，不发送侵入性探测）
for subnet in 192.168.10.0/24 192.168.20.0/24 192.168.30.0/24; do
  echo "Testing $subnet..."
  nmap -sn -PE --max-retries 1 -T1 $subnet 2>/dev/null | \
    grep "report" | awk '{print $5}'
done

# 检查防火墙规则（工业 DMZ 防火墙）
ssh dmz_firewall_admin@firewall_ip "show access-list" | \
  grep -E "permit|deny" | sort
```

### 工业防火墙/DMZ 日志分析

```bash
# 分析工业防火墙日志中的异常连接尝试
grep "DENY" /var/log/firewall/ics_fw.log | \
  awk '{print $3, $5, $7}' | \
  sort | uniq -c | sort -rn | head -20

# 检测从 IT 到 OT 的异常端口访问
grep -E "102|502|2404|44818|4001" /var/log/firewall/ics_fw.log | \
  grep "src_zone=IT" | grep "dst_zone=OT"

# 检测防火墙规则变更
grep -iE "rule.*add|rule.*delete|rule.*modify|config.*change" \
  /var/log/firewall/ics_fw.log | tail -50
```

### 网络流量基线建立与异常检测

```python
from collections import defaultdict
import statistics

def build_network_baseline(pcap_files, duration_hours=168):
    baseline = {
        "protocol_distribution": defaultdict(int),
        "source_ips": set(),
        "destination_ips": set(),
        "connections": defaultdict(int),
        "bytes_per_hour": defaultdict(int),
        "packets_per_protocol_per_hour": defaultdict(lambda: defaultdict(int))
    }

    for pcap_file in pcap_files:
        packets = rdpcap(pcap_file)
        for pkt in packets:
            if IP not in pkt:
                continue

            src = pkt[IP].src
            dst = pkt[IP].dst
            proto = "unknown"

            if TCP in pkt:
                dport = pkt[TCP].dport
                if dport == 502:
                    proto = "modbus"
                elif dport == 102:
                    proto = "s7comm"
                elif dport == 2404:
                    proto = "iec104"
                elif dport == 44818:
                    proto = "ethernetip"
                elif dport == 20000:
                    proto = "dnp3"
                else:
                    proto = f"tcp_{dport}"
            elif UDP in pkt:
                proto = f"udp_{pkt[UDP].dport}"

            baseline["protocol_distribution"][proto] += 1
            baseline["source_ips"].add(src)
            baseline["destination_ips"].add(dst)
            baseline["connections"][(src, dst, proto)] += 1

    baseline["source_ips"] = list(baseline["source_ips"])
    baseline["destination_ips"] = list(baseline["destination_ips"])

    return baseline

def detect_baseline_deviations(current_traffic, baseline, threshold_sigma=3):
    deviations = []

    for src, dst, proto, count in current_traffic:
        key = (src, dst, proto)
        baseline_count = baseline["connections"].get(key, 0)

        if src not in baseline["source_ips"]:
            deviations.append({
                "type": "NEW_SOURCE",
                "source": src,
                "destination": dst,
                "protocol": proto,
                "severity": "HIGH"
            })

        if proto not in baseline["protocol_distribution"]:
            deviations.append({
                "type": "NEW_PROTOCOL",
                "protocol": proto,
                "source": src,
                "destination": dst,
                "severity": "HIGH"
            })

    return deviations
```

### 远程访问通道检测

```bash
# 检测工控网络中的远程访问工具
nmap -sV -p 22,3389,5900,5985,5986 --open 192.168.0.0/16

# 检测异常的出站连接（可能的 C2 通道）
tcpdump -i any -nn 'dst port 443 or dst port 8443 or dst port 53' \
  -w outbound_suspicious.pcap -c 10000

# 检测 VPN 通道
nmap -sU -p 500,4500 --open 192.168.0.0/16
```

---

## 0x07 工控恶意软件深度分析

### Stuxnet 深度分析

Stuxnet 是历史上首个针对工控系统的武器化恶意软件，于 2010 年被发现，目标是伊朗纳坦兹铀浓缩设施的离心机控制系统。

**攻击链分析**

```
初始感染（USB 快捷方式漏洞 CVE-2010-0466）
  → 内网传播（MS08-067 / MS10-046 / MS10-061）
  → 对等网络建立
  → Siemens Step7 软件检测
  → S7-315 PLC 感染
  → 读取特定配置（Profibus 拓扑）
  → 载荷注入（修改 OB1/OB35 块）
  → 中间人攻击（重放正常传感器数据）
  → 离心机转子超速/低速交替破坏
  → 同时向监控系统回传正常数据
```

**取证发现与 IOC**

| IOC 类型 | 具体值 | 说明 |
|----------|--------|------|
| 文件哈希 | `6229986940390658392b9e77a9498629` | wmi.dll 后门（原始文件替换） |
| 文件哈希 | `384723719d7f4e4688792f8506264841` | s7otbxdx.dll 中间人模块 |
| 文件哈希 | `c5159690c7ffc0164a4b0b1bf89b52c6` | 载荷 DLL |
| 注册表键 | `HKLM\SYSTEM\CurrentControlSet\Services\mrxsmb10` | 持久化服务 |
| 命名管道 | `\\.\pipe\msagent_*` | 对等通信管道 |
| 互斥量 | `MuAa{...}4` 系列 | 防重复感染标记 |
| 证书 | 被窃取的 Realtek/JMicron 签名证书 | 驱动签名伪装 |
| PLC 块 | OB1, OB35 被篡改 | 离心机控制逻辑注入 |

**取证检测方法**

```python
def detect_stuxnet_indicators(system_path):
    indicators = []

    known_hashes = {
        "6229986940390658392b9e77a9498629": "wmi.dll backdoor",
        "384723719d7f4e4688792f8506264841": "s7otbxdx.dll MITM",
        "c5159690c7ffc0164a4b0b1bf89b52c6": "payload DLL"
    }

    for root, _, files in os.walk(system_path):
        for fname in files:
            fpath = os.path.join(root, fname)
            try:
                with open(fpath, 'rb') as f:
                    md5 = hashlib.md5(f.read()).hexdigest()
                if md5 in known_hashes:
                    indicators.append({
                        "file": fpath,
                        "hash": md5,
                        "description": known_hashes[md5],
                        "severity": "CRITICAL"
                    })
            except (PermissionError, OSError):
                continue

    return indicators
```

**经验教训**

- 工控系统不能仅依赖网络隔离（air gap），USB 介质可绕过物理隔离
- PLC 程序缺乏完整性校验机制，恶意代码可长期潜伏
- 供应链安全至关重要（恶意代码通过承包商进入）
- 需要独立的工控威胁检测系统，不能仅依赖 IT 安全工具

### Triton/Trisis 分析

Triton（又名 Trisis、HatMan）是 2017 年针对沙特阿拉伯 Petro Rabigh 石化工厂安全仪表系统（SIS）的攻击，被认为是首个可能对人类造成物理伤害的工控攻击。

**SIS 攻击原理**

安全仪表系统（SIS）是工业安全的最后一道防线，当基本控制系统（BCS）无法控制危险工况时，SIS 负责将工艺过程带入安全状态。Triton 的目标是篡改 Triconex 安全控制器的逻辑，使其在真实危险条件下不执行安全停车，甚至主动制造危险工况。

```
正常流程:
  传感器 → BCS(基本控制) → 正常调节
                ↓ (失控时)
            SIS(安全仪表) → 紧急停车(ESD)

Triton 攻击流程:
  传感器 → BCS(正常) → 正常调节
                ↓
            SIS(被篡改) → 不执行安全停车 → 物理损坏/爆炸
```

**Triconex 安全控制器篡改分析**

Triton 针对 Triconex 控制器使用了 TriStation 1131 编程软件的通信协议，其攻击载荷包含：

| 组件 | 功能 | 取证特征 |
|------|------|----------|
| tris.exe | 与 Triconex 控制器通信的恶意工具 | 使用 TriStation 协议端口 |
| 恶意逻辑模块 | 替换原始安全逻辑 | 非预期的功能块出现在控制器中 |
| 覆写模块 | 在攻击失败时覆写安全逻辑 | 特定的写入序列模式 |
| 清除模块 | 尝试恢复原始逻辑以掩盖痕迹 | 异常的程序清除操作 |

**取证检测方法**

```python
def detect_triton_indicators(log_data, controller_config):
    findings = []

    for event in log_data:
        if event.get('protocol') == 'triston' or event.get('port') == 1513:
            if event.get('function') in ('WRITE_ALL', 'DOWNLOAD'):
                findings.append({
                    "timestamp": event['timestamp'],
                    "type": "SAFETY_LOGIC_MODIFICATION",
                    "severity": "CRITICAL",
                    "detail": f"安全逻辑修改操作: {event.get('function')}",
                    "source": event.get('source_ip', 'unknown')
                })

        if event.get('function') == 'STOP' and event.get('target') == 'SIS':
            findings.append({
                "timestamp": event['timestamp'],
                "type": "SIS_STOP_COMMAND",
                "severity": "CRITICAL",
                "detail": "安全仪表系统被停止"
            })

    for block in controller_config.get('function_blocks', []):
        if block.get('type') not in EXPECTED_SIS_BLOCK_TYPES:
            findings.append({
                "type": "UNKNOWN_SIS_BLOCK",
                "block_name": block.get('name'),
                "block_type": block.get('type'),
                "severity": "CRITICAL",
                "detail": "SIS 中发现非预期的功能块"
            })

    return findings
```

**对物理安全的影响**

- Triton 证明了攻击者可以突破 SIS 安全防线
- 成功攻击可导致化工厂爆炸、有毒气体泄漏等灾难性后果
- 攻击者在首次攻击失败后进行了二次尝试，表明攻击具有持续性
- 促使全球关键基础设施运营商重新评估 SIS 安全

### Industroyer/CrashOverride 分析

Industroyer（又名 CrashOverride）是 2016 年针对乌克兰电力系统的恶意软件，被认为是导致 2016 年 12 月基辅停电事件的元凶。

**电力行业攻击目标**

| 目标组件 | 功能 | 攻击效果 |
|----------|------|----------|
| 变电站 RTU | 控制断路器/隔离开关 | 断开供电线路 |
| 变电站 IED | 保护继电器设备 | 阻止自动重合闸 |
| SCADA 主站 | 监控和控制 | 延迟操作员响应 |
| 通信系统 | 数据转发 | 阻断操作员与现场通信 |

**IEC 104 协议武器化**

Industroyer 实现了完整的 IEC 60870-5-104 协议栈，能够直接与电力 RTU 通信：

```python
def detect_iec104_anomalies(pcap_file):
    suspicious_commands = []

    iec104_cause_types = {
        6: "激活（Activation）",
        7: "激活确认（Activation Confirmation）",
        8: "停止激活（Deactivation）",
        44: "未知类型（Unknown Type）",
        45: "未知传送原因",
        46: "未知公共地址",
        47: "未知信息对象地址"
    }

    packets = rdpcap(pcap_file)
    for pkt in packets:
        if TCP in pkt and pkt[TCP].dport == 2404:
            payload = bytes(pkt[TCP].payload)
            if len(payload) < 6:
                continue

            cause_type = payload[2] & 0x3F if len(payload) > 2 else 0

            if cause_type in (44, 45, 46, 47):
                suspicious_commands.append({
                    "timestamp": float(pkt.time),
                    "type": "IEC104_UNKNOWN_CAUSE",
                    "cause_type": cause_type,
                    "description": iec104_cause_types.get(cause_type, "Unknown"),
                    "severity": "HIGH"
                })

            type_id = payload[0] if len(payload) > 0 else 0
            if type_id in (45, 46, 47):
                suspicious_commands.append({
                    "timestamp": float(pkt.time),
                    "type": "IEC104_COMMAND",
                    "type_id": type_id,
                    "description": "单命令/双命令操作",
                    "severity": "CRITICAL"
                })

    return suspicious_commands
```

**取证发现与 IOC**

| IOC 类型 | 值/特征 | 说明 |
|----------|---------|------|
| 文件哈希 | `3b621a70...` | Industroyer 主模块 |
| 文件哈希 | `7394e9d2...` | IEC 104 协议模块 |
| 文件哈希 | `0e264e1d...` | 断路器控制模块 |
| 协议特征 | TCP 2404 端口异常 IEC 104 命令 | 直接控制 RTU |
| 注册表 | `HKLM\SYSTEM\...` 持久化键 | 自启动配置 |
| 网络特征 | 特定 C2 通信模式 | 与攻击者服务器通信 |

### BlackEnergy 工控攻击组件

BlackEnergy 最初是一个 DDoS 僵尸网络工具包，后被改造为针对工控系统的攻击平台，在 2015 年乌克兰电力攻击中使用。

**架构组成**

```
BlackEnergy 3 架构:
├── 初始感染载体（鱼叉式钓鱼邮件 / 水坑攻击）
├── C2 通信模块（HTTP/HTTPS）
├── 破坏模块（KillDisk - 磁盘擦除）
├── 远程桌面模块（远程操作工控系统）
└── 工控攻击模块
    ├── 断路器控制脚本
    ├── UPS 配置（防止自身断电）
    └── 通信中断工具
```

**取证要点**

- KillDisk 组件会破坏 MBR（主引导记录），导致系统无法启动
- 攻击者使用 UPS 配置确保自身操作不被断电中断
- 远程桌面模块允许攻击者手动操作 SCADA 系统
- 取证重点在于恢复被破坏的磁盘数据和日志

### Havex/DRILLBIT 分析

Havex（又名 Dragonfly 2.0）是针对西方能源行业的攻击活动，由与伊朗相关的 APT 组织发起。

**攻击特征**

| 阶段 | 技术 | 取证指标 |
|------|------|----------|
| 初始访问 | 水坑攻击（工控行业网站） | 被篡改的行业网站 |
| 侦察 | 扫描工控网络、识别 HMI/SCADA | Symantec ICS 扫描工具 |
| 控制 | 自定义 RAT（Havex RAT） | 特定 C2 通信模式 |
| 数据采集 | 收集工控网络拓扑和配置 | 大量枚举流量 |

DRILLBIT 是 Havex 的后续变种，特点是将恶意代码嵌入合法工控软件安装包中。

### 工控恶意软件通用检测框架

```python
class ICSThreatDetector:
    def __init__(self):
        self.ioc_database = {
            "file_hashes": {},
            "network_signatures": [],
            "protocol_anomalies": [],
            "behavioral_patterns": []
        }
        self.findings = []

    def load_ioc_database(self, ioc_file):
        with open(ioc_file) as f:
            data = json.load(f)
            self.ioc_database.update(data)

    def scan_file_system(self, path):
        for root, _, files in os.walk(path):
            for fname in files:
                fpath = os.path.join(root, fname)
                try:
                    with open(fpath, 'rb') as f:
                        content = f.read()
                    file_hash = hashlib.sha256(content).hexdigest()
                    if file_hash in self.ioc_database["file_hashes"]:
                        self.findings.append({
                            "type": "KNOWN_MALWARE",
                            "file": fpath,
                            "hash": file_hash,
                            "malware_family": self.ioc_database["file_hashes"][file_hash],
                            "severity": "CRITICAL"
                        })
                except (PermissionError, OSError):
                    continue

    def analyze_network_traffic(self, pcap_file):
        packets = rdpcap(pcap_file)
        for pkt in packets:
            if TCP in pkt:
                payload = bytes(pkt[TCP].payload)
                for sig in self.ioc_database["network_signatures"]:
                    if sig["pattern"] in payload:
                        self.findings.append({
                            "type": "NETWORK_SIGNATURE_MATCH",
                            "timestamp": float(pkt.time),
                            "signature": sig["name"],
                            "severity": sig.get("severity", "HIGH")
                        })

    def generate_report(self):
        return {
            "scan_time": datetime.now().isoformat(),
            "total_findings": len(self.findings),
            "critical_count": sum(1 for f in self.findings if f["severity"] == "CRITICAL"),
            "high_count": sum(1 for f in self.findings if f["severity"] == "HIGH"),
            "findings": self.findings
        }
```

### YARA 规则：工控恶意软件特征

```yara
rule Stuxnet_LNK_Exploit {
    meta:
        description = "Detects Stuxnet LNK exploit (CVE-2010-0466)"
        author = "ICS Forensics Team"
        date = "2026-07-02"
    strings:
        $lnk_magic = { 4C 00 00 00 }
        $clsid_1 = { 00 02 14 01 00 00 }
        $shellcode_pattern = { 8B FF 55 8B EC 83 EC ?? B8 }
    condition:
        $lnk_magic at 0 and ($clsid_1 or $shellcode_pattern)
}

rule Triton_TriStation_Protocol {
    meta:
        description = "Detects Triton TriStation protocol abuse"
        author = "ICS Forensics Team"
        date = "2026-07-02"
    strings:
        $triston_port = { 05 E9 }
        $write_all = { 0D 00 }
        $download_cmd = { 0B 00 }
    condition:
        $triston_port and ($write_all or $download_cmd)
}

rule Industroyer_IEC104_Command {
    meta:
        description = "Detects IEC 104 command manipulation"
        author = "ICS Forensics Team"
        date = "2026-07-02"
    strings:
        $start_byte = { 68 }
        $single_command = { 2D }
        $double_command = { 2E }
        $cause_activate = { 06 }
    condition:
        $start_byte at 0 and ($single_command or $double_command) and $cause_activate
}

rule Havex_Scan_Pattern {
    meta:
        description = "Detects Havex ICS scanning behavior"
        author = "ICS Forensics Team"
        date = "2026-07-02"
    strings:
        $modbus_scan = { 01 03 00 00 00 01 }
        $dnp3_scan = { 05 64 05 C0 }
        $banner_strings = "Modbus/TCP" "DNP3" "IEC 104"
    condition:
        ($modbus_scan or $dnp3_scan) and any of ($banner_strings)
}

rule Generic_ICS_Backdoor {
    meta:
        description = "Generic ICS backdoor detection"
        author = "ICS Forensics Team"
        date = "2026-07-02"
    strings:
        $reverse_shell = /(?:nc|ncat|netcat)\s+-[el]+\s+\d+/ nocase
        $hidden_process = /\/dev\/\.hidden/ nocase
        $plc_manipulation = /(?:write|modify).*(?:register|coil|ladder|PLC)/ nocase
        $data_exfil = /(?:curl|wget|ftp)\s+.*(?:upload|post|send)/ nocase
    condition:
        any of them
}
```

---

## 0x08 安全仪表系统(SIS)取证

### SIS 架构与安全功能

安全仪表系统（Safety Instrumented System, SIS）是独立于基本过程控制系统（BPCS）的安全保护层，专门用于在危险工况下将工艺过程带入安全状态。SIS 的取证分析具有极高的专业性和敏感性。

SIS 的核心架构包含三层：

| 层级 | 组件 | 功能 |
|------|------|------|
| 传感器层 | 温度/压力/液位传感器 | 检测危险工况参数 |
| 逻辑解算层 | 安全控制器（Triconex/HIMA等） | 执行安全逻辑判断 |
| 执行器层 | 电磁阀、紧急切断阀 | 执行安全动作（停车） |

SIS 的安全完整性等级（SIL）分为四级：

```
SIL 1: 低风险 - 年失效概率 0.1 ~ 0.01
SIL 2: 中风险 - 年失效概率 0.01 ~ 0.001
SIL 3: 高风险 - 年失效概率 0.001 ~ 0.0001
SIL 4: 极高风险 - 年失效概率 0.0001 ~ 0.00001（极少使用）
```

### SIS 与 BCS 差异

| 维度 | BCS（基本控制系统） | SIS（安全仪表系统） |
|------|---------------------|---------------------|
| 目的 | 过程控制与优化 | 安全保护与紧急停车 |
| 独立性 | 可联网、可远程操作 | 应物理独立于 BCS |
| 修改频率 | 频繁调整优化 | 极少修改，需严格变更管理 |
| 测试要求 | 常规维护 | 定期功能安全测试（Proof Test） |
| 认证要求 | 无特殊要求 | IEC 61511/61508 认证 |
| 取证风险 | 中等 | 极高（可能触发安全动作） |

### SIS 篡改攻击取证

**安全逻辑修改检测**

```python
def detect_sis_logic_tampering(current_logic, baseline_logic):
    tampering_indicators = []

    for func_block_id in baseline_logic:
        if func_block_id not in current_logic:
            tampering_indicators.append({
                "block_id": func_block_id,
                "type": "SAFETY_BLOCK_REMOVED",
                "severity": "CRITICAL",
                "description": "安全功能块被移除"
            })

    for func_block_id in current_logic:
        if func_block_id not in baseline_logic:
            tampering_indicators.append({
                "block_id": func_block_id,
                "type": "NEW_SAFETY_BLOCK",
                "severity": "CRITICAL",
                "description": "发现非预期的安全功能块"
            })
            continue

        base_block = baseline_logic[func_block_id]
        curr_block = current_logic[func_block_id]

        if curr_block.get('parameters') != base_block.get('parameters'):
            tampering_indicators.append({
                "block_id": func_block_id,
                "type": "PARAMETER_MODIFIED",
                "original_params": base_block.get('parameters'),
                "modified_params": curr_block.get('parameters'),
                "severity": "CRITICAL"
            })

        if curr_block.get('logic_type') != base_block.get('logic_type'):
            tampering_indicators.append({
                "block_id": func_block_id,
                "type": "LOGIC_TYPE_CHANGED",
                "original_type": base_block.get('logic_type'),
                "modified_type": curr_block.get('logic_type'),
                "severity": "CRITICAL"
            })

    return tampering_indicators
```

**设定值异常分析**

```python
def analyze_sis_setpoints(current_setpoints, design_specifications):
    anomalies = []

    for tag, value in current_setpoints.items():
        if tag in design_specifications:
            spec = design_specifications[tag]
            min_allowed = spec.get('min_safe_value')
            max_allowed = spec.get('max_safe_value')

            if value < min_allowed or value > max_allowed:
                anomalies.append({
                    "tag": tag,
                    "current_setpoint": value,
                    "safe_range": f"[{min_allowed}, {max_allowed}]",
                    "deviation": value - spec.get('nominal_value', 0),
                    "severity": "CRITICAL",
                    "risk": "安全设定值超出设计安全范围"
                })

            if spec.get('change_requires_approval') and tag not in spec.get('approved_changes', []):
                anomalies.append({
                    "tag": tag,
                    "type": "UNAUTHORIZED_CHANGE",
                    "severity": "HIGH",
                    "description": "设定值变更未经审批流程"
                })

    return anomalies
```

**旁路/抑制状态检测**

```python
def detect_bypass_suppression(sis_status_data):
    bypass_events = []

    for channel in sis_status_data.get('channels', []):
        if channel.get('bypassed'):
            bypass_events.append({
                "channel": channel['id'],
                "tag": channel.get('tag_name'),
                "bypass_start": channel.get('bypass_timestamp'),
                "bypass_duration": channel.get('bypass_duration'),
                "authorized_by": channel.get('bypass_authorizer', 'UNKNOWN'),
                "severity": "CRITICAL" if channel.get('safety_critical') else "HIGH"
            })

        if channel.get('suppressed'):
            bypass_events.append({
                "channel": channel['id'],
                "tag": channel.get('tag_name'),
                "type": "ALARM_SUPPRESSED",
                "suppress_time": channel.get('suppress_timestamp'),
                "severity": "CRITICAL"
            })

    for vote in sis_status_data.get('voting_configs', []):
        original = vote.get('original_voting')
        current = vote.get('current_voting')
        if original != current:
            bypass_events.append({
                "type": "VOTING_CHANGED",
                "channel": vote['id'],
                "original": original,
                "current": current,
                "severity": "CRITICAL",
                "description": f"投票逻辑从 {original} 变更为 {current}"
            })

    return bypass_events
```

**传感器/执行器异常**

```python
def detect_sensor_actuator_anomalies(sensor_data, actuator_data):
    anomalies = []

    for sensor in sensor_data:
        if sensor.get('stuck_value'):
            anomalies.append({
                "type": "SENSOR_STUCK",
                "sensor_id": sensor['id'],
                "stuck_value": sensor['value'],
                "duration": sensor.get('stuck_duration'),
                "severity": "HIGH",
                "description": "传感器值长时间未变化，可能被欺骗或故障"
            })

        if sensor.get('range_violation'):
            anomalies.append({
                "type": "SENSOR_RANGE_VIOLATION",
                "sensor_id": sensor['id'],
                "value": sensor['value'],
                "valid_range": sensor.get('valid_range'),
                "severity": "CRITICAL"
            })

    for actuator in actuator_data:
        if actuator.get('command_mismatch'):
            anomalies.append({
                "type": "ACTUATOR_COMMAND_MISMATCH",
                "actuator_id": actuator['id'],
                "expected_position": actuator.get('expected'),
                "actual_position": actuator.get('actual'),
                "severity": "CRITICAL",
                "description": "执行器实际位置与控制命令不一致"
            })

    return anomalies
```

### SIS 日志与事件分析

```bash
# 提取 SIS 事件日志（以 Triconex 为例）
# 通过 TriStation 1131 软件导出事件日志
triston_export --controller 192.168.30.50 --output sis_events.csv --format csv

# 分析安全事件时间线
python3 -c "
import csv
from datetime import datetime

events = []
with open('sis_events.csv') as f:
    reader = csv.DictReader(f)
    for row in reader:
        events.append(row)

for e in sorted(events, key=lambda x: x['timestamp']):
    if e['event_type'] in ('BYPASS', 'SUPPRESS', 'TRIP', 'RESET'):
        print(f\"{e['timestamp']} [{e['severity']}] {e['event_type']}: {e['description']}\")
"
```

### SIL 验证

```python
def verify_sil_compliance(sis_config, process_requirements):
    verification_results = []

    for safety_function in sis_config.get('safety_functions', []):
        sf_id = safety_function['id']
        required_sil = process_requirements.get(sf_id, {}).get('required_sil')
        achieved_sil = safety_function.get('achieved_sil')

        sil_levels = {'SIL_1': 1, 'SIL_2': 2, 'SIL_3': 3, 'SIL_4': 4}
        required_level = sil_levels.get(required_sil, 0)
        achieved_level = sil_levels.get(achieved_sil, 0)

        result = {
            "safety_function": sf_id,
            "required_sil": required_sil,
            "achieved_sil": achieved_sil,
            "compliant": achieved_level >= required_level
        }

        if not result["compliant"]:
            result["severity"] = "CRITICAL"
            result["description"] = f"SIL 等级不满足要求: 需要 {required_sil}, 实际 {achieved_sil}"

        pfh_data = safety_function.get('pfh_data', {})
        if pfh_data:
            result["pfh"] = pfh_data.get('value')
            result["pfh_range"] = pfh_data.get('valid_range')

        verification_results.append(result)

    return verification_results
```

### SIS 取证的特殊安全约束

在进行 SIS 取证时，必须遵循以下安全约束：

1. **绝对禁止在线修改**：不得在 SIS 运行时进行任何写操作
2. **被动采集优先**：优先使用日志导出、配置读取等被动方式
3. **维护窗口操作**：主动测试必须在计划维护窗口内进行
4. **双人确认制度**：所有 SIS 操作需两人同时在场确认
5. **变更追踪**：所有操作必须记录并通知安全负责人
6. **回退准备**：准备好原始配置备份，随时可恢复

---

## 0x09 工控环境证据强度分层

### 工控证据强度分类

工控取证中的证据需要按强度分层，以便在报告和法律诉讼中准确表述发现的可靠性。

| 强度等级 | 分类名称 | 定义 | 典型证据类型 |
|----------|----------|------|-------------|
| Level 5 | 确认恶意 | 明确证明存在恶意行为 | 已知恶意软件哈希匹配、PLC 逻辑中明确的恶意代码 |
| Level 4 | 高度可疑 | 强烈暗示恶意行为但缺乏直接证据 | 异常的 PLC 配置变更、非工作时间的未授权访问 |
| Level 3 | 需要关注 | 存在异常但可能有合理解释 | 网络流量模式变化、新出现的设备 |
| Level 2 | 信息性 | 提供上下文但不直接指向攻击 | 固件版本差异、配置偏差 |
| Level 1 | 参考性 | 背景信息，单独无证明力 | 系统基线信息、正常操作日志 |

### 工控 IOC 类型与提取方法

| IOC 类型 | 提取方法 | 证据强度 | 持久性 |
|----------|----------|----------|--------|
| 文件哈希 | 磁盘/固件哈希计算 | Level 5 | 持久 |
| 网络签名 | 流量抓包与模式匹配 | Level 4-5 | 短暂 |
| 协议异常 | 协议解析与行为分析 | Level 3-4 | 短暂 |
| 配置偏差 | 配置对比分析 | Level 3-4 | 持久 |
| 行为模式 | 日志关联分析 | Level 2-3 | 持久 |
| 物理指标 | 传感器数据异常分析 | Level 3-5 | 短暂 |

### 物理影响证据等级

```
物理影响证据等级评估:

Level 5 - 直接物理损害证据:
  ├── 设备物理损坏记录
  ├── 传感器读数超出安全范围
  └── 执行器异常动作日志

Level 4 - 物理过程异常:
  ├── 工艺参数偏离正常范围
  ├── 非计划停车事件
  └── 安全系统触发记录

Level 3 - 控制逻辑异常:
  ├── PLC 程序与基线不一致
  ├── 设定点被修改
  └── 控制输出异常

Level 2 - 系统配置异常:
  ├── 固件版本不匹配
  ├── 配置参数偏差
  └── 通信配置变更

Level 1 - 信息性指标:
  ├── 系统日志中的异常条目
  ├── 用户登录记录
  └── 网络流量统计变化
```

### IT-OT 证据关联方法

```python
def correlate_it_ot_evidence(it_events, ot_events, time_window_sec=300):
    correlations = []

    for it_event in it_events:
        it_ts = it_event['timestamp']
        related_ot_events = []

        for ot_event in ot_events:
            ot_ts = ot_event['timestamp']
            time_diff = abs((it_ts - ot_ts).total_seconds())

            if time_diff <= time_window_sec:
                related_ot_events.append({
                    "event": ot_event,
                    "time_diff_sec": time_diff
                })

        if related_ot_events:
            correlations.append({
                "it_event": it_event,
                "related_ot_events": sorted(
                    related_ot_events, key=lambda x: x['time_diff_sec']
                ),
                "correlation_strength": "STRONG"
                    if any(e['time_diff_sec'] < 30 for e in related_ot_events)
                    else "MODERATE",
                "attack_phase": determine_attack_phase(
                    it_event, related_ot_events
                )
            })

    return correlations

def determine_attack_phase(it_event, ot_events):
    it_type = it_event.get('event_type', '')
    phase_mapping = {
        'lateral_movement': 'INITIAL_ACCESS',
        'credential_theft': 'CREDENTIAL_COMPROMISE',
        'privilege_escalation': 'PRIVILEGE_ESCALATION',
        'file_transfer': 'PAYLOAD_DELIVERY',
        'remote_access': 'PERSISTENCE',
    }

    for ot_event in ot_events:
        ot_type = ot_event['event'].get('event_type', '')
        if 'write' in ot_type.lower() or 'modify' in ot_type.lower():
            return 'IMPACT'
        if 'scan' in ot_type.lower() or 'enum' in ot_type.lower():
            return 'RECONNAISSANCE'

    return phase_mapping.get(it_type, 'UNKNOWN')
```

### 工控取证报告编写规范

工控取证报告应包含以下核心章节：

```
工控取证报告模板:
├── 1. 执行摘要
│   ├── 事件概述
│   ├── 关键发现
│   └── 风险评级
├── 2. 取证范围与方法
│   ├── 取证时间范围
│   ├── 目标系统清单
│   ├── 取证工具与方法
│   └── 安全约束说明
├── 3. 技术发现
│   ├── 网络层分析结果
│   ├── 主机层分析结果
│   ├── 工控设备分析结果
│   ├── 协议分析结果
│   └── 恶意软件分析结果
├── 4. 攻击链重建
│   ├── 时间线
│   ├── 攻击路径
│   └── 影响评估
├── 5. 证据清单
│   ├── 证据编号与描述
│   ├── 证据强度评级
│   └── 证据保全记录
├── 6. 修复建议
│   ├── 短期修复措施
│   ├── 长期安全加固
│   └── 监控增强建议
└── 7. 附录
    ├── IOC 列表
    ├── 工具输出详情
    └── 参考资料
```

### 法律与监管合规要求

| 行业 | 法规/标准 | 取证要求 |
|------|-----------|----------|
| 电力 | NERC CIP-008 | 安全事件报告、恢复计划、证据保全 |
| 石化 | ISA/IEC 62443 | 安全事件记录、审计追踪 |
| 通用 | 网络安全法 | 72 小时内报告、日志保存 6 个月 |
| 通用 | 等保 2.0 三级 | 审计记录、安全事件处置记录 |
| 关键基础设施 | 关键信息基础设施安全保护条例 | 年度安全检测、事件报告 |

---

## 0x0A 自动化检测与监控

### Sigma 规则（工控协议相关）

```yaml
title: Modbus 异常写操作
id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
status: experimental
description: 检测 Modbus TCP 协议中的异常写操作
author: ICS Security Team
date: 2026/07/02
references:
    - https://www.iana.org/assignments/modbus-application-protocol/
tags:
    - attack.ics
    - attack.command_and_control
logsource:
    product: network
    service: modbus
detection:
    selection_write:
        protocol: modbus
        func_code:
            - 5
            - 6
            - 15
            - 16
    filter_known_masters:
        src_ip:
            - '192.168.20.10'
            - '192.168.20.11'
    condition: selection_write and not filter_known_masters
level: high
falsepositives:
    - 合法的工程师站操作
    - 维护窗口期间的配置变更
```

```yaml
title: S7comm PLC STOP 命令
id: b2c3d4e5-f6a7-8901-bcde-f12345678901
status: experimental
description: 检测针对 Siemens S7 PLC 的 STOP 命令
author: ICS Security Team
date: 2026/07/02
tags:
    - attack.ics
    - attack.impair_process_control
logsource:
    product: network
    service: s7comm
detection:
    selection:
        protocol: s7comm
        param_func: 28
        cpu_state: STOP
    condition: selection
level: critical
falsepositives:
    - 计划内维护操作
```

```yaml
title: DNP3 直接操作命令异常
id: c3d4e5f6-a7b8-9012-cdef-123456789012
status: experimental
description: 检测 DNP3 协议中非授权来源的直接操作命令
author: ICS Security Team
date: 2026/07/02
tags:
    - attack.ics
    - attack.command_and_control
logsource:
    product: network
    service: dnp3
detection:
    selection:
        protocol: dnp3
        function_code: 5
        direction: master_to_outstation
    filter_authorized:
        src_ip:
            - '192.168.20.5'
    condition: selection and not filter_authorized
level: critical
falsepositives:
    - 备用主站切换
    - 维护期间操作
```

### 工业协议异常检测脚本（Python/Scapy）

```python
#!/usr/bin/env python3
from scapy.all import sniff, TCP, IP, UDP
from collections import defaultdict
import json
import time
from datetime import datetime

class ICSProtocolMonitor:
    def __init__(self, interface, output_file=None):
        self.interface = interface
        self.output_file = output_file
        self.stats = defaultdict(int)
        self.anomalies = []
        self.known_masters = set()
        self.known_slaves = set()
        self.write_operations = []
        self.start_time = time.time()

    def packet_handler(self, pkt):
        if IP not in pkt:
            return

        if TCP in pkt:
            dport = pkt[TCP].dport
            sport = pkt[TCP].sport
            payload = bytes(pkt[TCP].payload)

            if dport == 502 or sport == 502:
                self._handle_modbus(pkt, payload, dport == 502)
            elif dport == 102 or sport == 102:
                self._handle_s7comm(pkt, payload)
            elif dport == 2404 or sport == 2404:
                self._handle_iec104(pkt, payload, dport == 2404)
            elif dport == 20000 or sport == 20000:
                self._handle_dnp3(pkt, payload, dport == 20000)
            elif dport == 44818 or sport == 44818:
                self._handle_ethernetip(pkt, payload)

    def _handle_modbus(self, pkt, payload, is_request):
        self.stats['modbus_total'] += 1
        if is_request and len(payload) >= 8:
            fc = payload[7]
            self.stats[f'modbus_fc_{fc}'] += 1

            if fc in (0x05, 0x06, 0x0F, 0x10):
                src = pkt[IP].src
                self.write_operations.append({
                    "timestamp": datetime.now().isoformat(),
                    "protocol": "modbus",
                    "src": src,
                    "dst": pkt[IP].dst,
                    "func_code": fc,
                    "reference": int.from_bytes(payload[8:10], 'big')
                        if len(payload) >= 10 else 0
                })

                if src not in self.known_masters:
                    self.anomalies.append({
                        "timestamp": datetime.now().isoformat(),
                        "type": "UNKNOWN_MODBUS_MASTER",
                        "source": src,
                        "severity": "HIGH"
                    })

    def _handle_s7comm(self, pkt, payload):
        self.stats['s7comm_total'] += 1
        if len(payload) > 10:
            pdu_type = payload[5] if len(payload) > 5 else 0
            if pdu_type == 1:
                param_func = payload[10] if len(payload) > 10 else 0
                self.stats[f's7comm_func_{param_func}'] += 1

                if param_func == 28:
                    self.anomalies.append({
                        "timestamp": datetime.now().isoformat(),
                        "type": "S7_CPU_CONTROL",
                        "source": pkt[IP].src,
                        "severity": "CRITICAL"
                    })

    def _handle_iec104(self, pkt, payload, is_request):
        self.stats['iec104_total'] += 1
        if is_request and len(payload) > 2:
            type_id = payload[0]
            cause = payload[2] & 0x3F if len(payload) > 2 else 0

            if type_id in (45, 46, 47):
                self.write_operations.append({
                    "timestamp": datetime.now().isoformat(),
                    "protocol": "iec104",
                    "src": pkt[IP].src,
                    "dst": pkt[IP].dst,
                    "type_id": type_id,
                    "cause": cause
                })

    def _handle_dnp3(self, pkt, payload, is_request):
        self.stats['dnp3_total'] += 1

    def _handle_ethernetip(self, pkt, payload):
        self.stats['ethernetip_total'] += 1

    def get_report(self):
        return {
            "monitor_duration_sec": time.time() - self.start_time,
            "statistics": dict(self.stats),
            "anomalies": self.anomalies,
            "write_operations": self.write_operations,
            "anomaly_count": len(self.anomalies),
            "critical_count": sum(
                1 for a in self.anomalies if a['severity'] == 'CRITICAL'
            )
        }

    def start(self, packet_count=0, timeout=0):
        sniff(
            iface=self.interface,
            prn=self.packet_handler,
            count=packet_count if packet_count else 0,
            timeout=timeout if timeout else None,
            store=False
        )
        return self.get_report()
```

### PLC 程序完整性监控

```python
#!/usr/bin/env python3
import hashlib
import json
import time
from datetime import datetime

class PLCIntegrityMonitor:
    def __init__(self, plc_connections, check_interval_sec=300):
        self.plc_connections = plc_connections
        self.check_interval = check_interval_sec
        self.baselines = {}
        self.alerts = []

    def establish_baseline(self, plc_id, program_data):
        self.baselines[plc_id] = {
            "program_hash": hashlib.sha256(
                json.dumps(program_data, sort_keys=True).encode()
            ).hexdigest(),
            "block_count": len(program_data.get('blocks', [])),
            "timestamp": datetime.now().isoformat(),
            "block_hashes": {
                block['id']: hashlib.sha256(
                    json.dumps(block, sort_keys=True).encode()
                ).hexdigest()
                for block in program_data.get('blocks', [])
            }
        }

    def check_integrity(self, plc_id, current_program):
        if plc_id not in self.baselines:
            return {"status": "NO_BASELINE", "severity": "MEDIUM"}

        baseline = self.baselines[plc_id]
        current_hash = hashlib.sha256(
            json.dumps(current_program, sort_keys=True).encode()
        ).hexdigest()

        if current_hash != baseline["program_hash"]:
            changed_blocks = []
            for block in current_program.get('blocks', []):
                block_hash = hashlib.sha256(
                    json.dumps(block, sort_keys=True).encode()
                ).hexdigest()
                if block['id'] not in baseline["block_hashes"]:
                    changed_blocks.append({
                        "block_id": block['id'],
                        "change": "NEW_BLOCK",
                        "severity": "CRITICAL"
                    })
                elif block_hash != baseline["block_hashes"][block['id']]:
                    changed_blocks.append({
                        "block_id": block['id'],
                        "change": "MODIFIED",
                        "severity": "CRITICAL"
                    })

            baseline_blocks = set(baseline["block_hashes"].keys())
            current_blocks = set(
                b['id'] for b in current_program.get('blocks', [])
            )
            removed = baseline_blocks - current_blocks
            for block_id in removed:
                changed_blocks.append({
                    "block_id": block_id,
                    "change": "REMOVED",
                    "severity": "CRITICAL"
                })

            alert = {
                "timestamp": datetime.now().isoformat(),
                "plc_id": plc_id,
                "type": "PROGRAM_MODIFIED",
                "changed_blocks": changed_blocks,
                "severity": "CRITICAL"
            }
            self.alerts.append(alert)
            return alert

        return {"status": "INTACT", "severity": "NONE"}
```

### 配置变更检测自动化

```python
#!/usr/bin/env python3
import json
import hashlib
from datetime import datetime

class ConfigChangeDetector:
    def __init__(self):
        self.config_snapshots = {}
        self.change_log = []

    def take_snapshot(self, device_id, config_data, source="manual"):
        snapshot = {
            "device_id": device_id,
            "timestamp": datetime.now().isoformat(),
            "source": source,
            "hash": hashlib.sha256(
                json.dumps(config_data, sort_keys=True).encode()
            ).hexdigest(),
            "config": config_data
        }

        if device_id in self.config_snapshots:
            prev = self.config_snapshots[device_id]
            changes = self._diff_configs(prev["config"], config_data)
            if changes:
                change_record = {
                    "device_id": device_id,
                    "timestamp": snapshot["timestamp"],
                    "previous_hash": prev["hash"],
                    "current_hash": snapshot["hash"],
                    "changes": changes,
                    "authorized": False
                }
                self.change_log.append(change_record)

        self.config_snapshots[device_id] = snapshot
        return snapshot

    def _diff_configs(self, old_config, new_config):
        changes = []
        all_keys = set(list(old_config.keys()) + list(new_config.keys()))

        for key in all_keys:
            old_val = old_config.get(key)
            new_val = new_config.get(key)

            if old_val is None:
                changes.append({
                    "key": key,
                    "type": "ADDED",
                    "new_value": str(new_val)[:200]
                })
            elif new_val is None:
                changes.append({
                    "key": key,
                    "type": "REMOVED",
                    "old_value": str(old_val)[:200]
                })
            elif old_val != new_val:
                changes.append({
                    "key": key,
                    "type": "MODIFIED",
                    "old_value": str(old_val)[:200],
                    "new_value": str(new_val)[:200]
                })

        return changes

    def get_unauthorized_changes(self):
        return [c for c in self.change_log if not c.get("authorized")]

    def mark_authorized(self, device_id, timestamp):
        for change in self.change_log:
            if (change["device_id"] == device_id and
                    change["timestamp"] == timestamp):
                change["authorized"] = True
                change["authorized_by"] = "admin"
                change["authorized_at"] = datetime.now().isoformat()
```

### 与工控 SIEM 集成方案

```yaml
# Elastic ICS Security 配置示例
# elasticsearch.yml 工控相关配置

# 工控数据源接入配置
input:
  - type: tcp
    host: "0.0.0.0:5020"
    fields:
      log_type: "modbus_traffic"
    processors:
      - dissect:
          tokenizer: "%{src_ip}:%{src_port} -> %{dst_ip}:%{dst_port} %{func_code} %{data}"
          field: "message"

  - type: file
    paths:
      - /var/log/ics_firewall/*.log
    processors:
      - grok:
          match:
            message: "%{TIMESTAMP_ISO8601:timestamp} %{WORD:action} %{IP:src_ip} -> %{IP:dst_ip}:%{NUMBER:dst_port} %{WORD:protocol}"

# 工控告警规则
rule:
  - name: "ICS Protocol Anomaly"
    query:
      bool:
        must:
          - term:
              log_type: "modbus_traffic"
          - terms:
              func_code: ["0x05", "0x06", "0x0F", "0x10"]
        must_not:
          - terms:
              src_ip: ["192.168.20.10", "192.168.20.11"]
    severity: high
    actions:
      - type: webhook
        url: "https://siem.internal/alerts"
```

### 持续监控架构设计

```
                    ┌─────────────────────────────────────────┐
                    │            安全管理中心 (SOC)              │
                    │  ┌─────────┐  ┌──────────┐  ┌────────┐  │
                    │  │ SIEM    │  │ 威胁情报  │  │ 事件响应│  │
                    │  │ 聚合分析 │  │   平台   │  │  平台  │  │
                    │  └────┬────┘  └─────┬────┘  └───┬────┘  │
                    └───────┼─────────────┼────────────┼───────┘
                            │             │            │
                    ┌───────┴─────────────┴────────────┴───────┐
                    │              工业 DMZ                     │
                    │  ┌──────────┐  ┌──────────┐              │
                    │  │ 工业 IDS │  │ 流量镜像  │              │
                    │  │ (被动)   │  │  设备    │              │
                    │  └────┬─────┘  └─────┬────┘              │
                    └───────┼──────────────┼───────────────────┘
                            │              │
            ┌───────────────┼──────────────┼───────────────┐
            │               │    生产网络    │               │
            │  ┌────────┐   │   ┌────────┐ │  ┌────────┐   │
            │  │ HMI    │   │   │ SCADA  │ │  │Historian│  │
            │  │ 日志   │───┘   │ Server │ │  │  日志   │  │
            │  └────────┘       │  日志  │─┘  └────────┘   │
            │                   └────────┘                  │
            │  ┌────────┐  ┌────────┐  ┌────────┐          │
            │  │ PLC 1  │  │ PLC 2  │  │ PLC N  │          │
            │  │ 事件日志│  │ 事件日志│  │ 事件日志│          │
            │  └────────┘  └────────┘  └────────┘          │
            └───────────────────────────────────────────────┘
```

关键设计原则：

- **被动采集**：所有数据采集均为被动方式，不影响生产系统
- **单向传输**：OT 到 IT 的数据传输通过工业网闸或单向网关
- **分区部署**：监控组件按 Purdue 模型分区部署
- **冗余设计**：监控系统自身具备高可用性
- **最小权限**：监控系统仅具有只读权限

---

## 0x0B 公开案例分析

### 案例一：Stuxnet 取证分析（2010）

**事件概述**

2010 年 6 月，白俄罗斯一家安全公司首次发现 Stuxnet 恶意软件，随后 Symantec 等安全公司深入分析后发现其针对 Siemens S7 PLC 的精确攻击能力。该恶意软件的目标是伊朗纳坦兹铀浓缩设施的离心机控制系统。

**攻击链重建**

```
阶段 1: 初始感染（2009 年中）
  ├── 感染向量: USB 驱动器（利用 CVE-2010-0466 LNK 漏洞）
  ├── 零日漏洞: Windows 快捷方式文件解析漏洞
  └── 目标: 伊朗核设施相关人员的计算机

阶段 2: 内网传播（2009-2010）
  ├── 利用 MS08-067（Server 服务漏洞）
  ├── 利用 MS10-046（LNK 漏洞）
  ├── 利用 MS10-061（打印服务漏洞）
  └── 建立 P2P 更新网络（端口 138, 139, 445）

阶段 3: 目标搜索（2010）
  ├── 检测 Step7 软件安装
  ├── 搜索特定 Profibus 配置
  ├── 匹配 S7-315 控制器
  └── 验证特定变频器配置（频率驱动器）

阶段 4: 载荷执行（2010）
  ├── 注入恶意代码到 OB1（主程序块）
  ├── 注入恶意代码到 OB35（定时中断块）
  ├── 中间人攻击: 拦截并篡改传感器数据
  ├── 向变频器发送异常频率指令
  │   ├── 周期性加速到 1410 Hz
  │   ├── 周期性减速到 2 Hz
  │   └── 循环执行造成机械应力
  └── 同时向监控系统回传正常数据（录像回放）

阶段 5: 隐蔽与持久化
  ├── 使用被窃取的 Realtek/JMicron 数字签名
  ├── 根kit 技术隐藏恶意文件
  └── 自毁机制: 2011 年 9 月后自动停止
```

**取证发现**

| 发现项 | 详情 | 证据强度 |
|--------|------|----------|
| 4 个零日漏洞 | CVE-2010-0466/391/394/413 | Level 5 - 确认国家级攻击 |
| 被窃取的数字证书 | Realtek/JMicron 证书 | Level 5 - 供应链攻击 |
| PLC 载荷 | OB1/OB35 块中的恶意代码 | Level 5 - 直接物理影响 |
| 中间人模块 | s7otbxdx.dll 被替换 | Level 5 - 数据欺骗 |
| 目标精确性 | 仅影响特定配置 | Level 5 - 武器化特征 |
| 代码复杂度 | ~500KB, 多个模块 | Level 4 - 国家级资源 |

**IOC 清单**

```
文件哈希 (MD5):
  6229986940390658392b9e77a9498629  - wmi.dll (后门)
  384723719d7f4e4688792f8506264841  - s7otbxdx.dll (MITM)
  c5159690c7ffc0164a4b0b1bf89b52c6  - 载荷 DLL
  b299f368aef32b33bc2e7e4f5f37b331  - 主模块
  136c65b1b1f7a122628f24b0aec01d6e  - 驱动文件

网络特征:
  TCP 138/139/445 - P2P 通信
  TCP 6666 - 更新服务器通信
  命名管道: \\.\pipe\mrxd_*, \\.\pipe\srv_*

注册表:
  HKLM\SYSTEM\CurrentControlSet\Services\mrxsmb10
  HKLM\SYSTEM\CurrentControlSet\Services\Filetrace

互斥量:
  MuAa{...} 系列（防重复感染）

PLC 特征:
  OB1 块中包含 FC888/FC889 调用
  OB35 块中包含离心机控制逻辑
  DB 块中存储攻击配置参数
```

**经验教训**

1. 网络隔离（air gap）不是万全之策，USB 介质可绕过
2. PLC 程序缺乏完整性校验，恶意代码可长期潜伏
3. 数字签名可被窃取和滥用
4. 零日漏洞的储备和使用表明国家级攻击能力
5. 工控系统需要独立的安全监控和完整性检查机制
6. 供应链安全是工控安全的关键薄弱环节

### 案例二：Triton/Trisis 攻击取证（2017）

**事件概述**

2017 年 12 月，FireEye（现 Mandiant）发现针对沙特阿拉伯 Petro Rabigh 石化厂的 Triton 恶意软件攻击。该攻击直接针对 Triconex 安全仪表系统（SIS），是首例已知的可能造成人员伤亡的工控攻击。

**攻击链重建**

```
阶段 1: 初始访问
  ├── 鱼叉式钓鱼邮件或供应链入侵
  └── 在工程站上建立立足点

阶段 2: 横向移动
  ├── 从 IT 网络移动到 OT 网络
  └── 到达工程师站（连接 Triconex 控制器）

阶段 3: 侦察
  ├── 检测 Triconex 控制器存在
  ├── 读取控制器配置
  └── 识别安全逻辑结构

阶段 4: 武器化
  ├── 编写恶意 Triconex 逻辑
  ├── 使用 TriStation 协议与控制器通信
  └── 准备覆写安全逻辑

阶段 5: 攻击执行
  ├── 向 Triconex 控制器写入恶意逻辑
  ├── 试图禁用安全保护功能
  ├── 第一次攻击未能成功执行
  └── 尝试第二次攻击（被安全机制阻止）

阶段 6: 失败后的清除
  └── 尝试恢复原始安全逻辑以掩盖痕迹
```

**取证发现**

| 发现项 | 详情 | 证据强度 |
|--------|------|----------|
| TriStation 协议滥用 | 非标准工具与 Triconex 通信 | Level 5 |
| 安全逻辑篡改 | 控制器中发现非预期功能块 | Level 5 |
| tris.exe 工具 | 专门编写的 Triconex 攻击工具 | Level 5 |
| 覆写机制 | 攻击失败后的恢复/覆写逻辑 | Level 5 |
| 物理安全影响 | SIS 保护功能被禁用 | Level 5 - 直接人身威胁 |

**IOC 清单**

```
文件:
  tris.exe - Triconex 通信工具
  triconex_comm.dll - 通信库
  恶意 Triconex 逻辑文件

网络:
  TCP 1513/1502 - TriStation 协议
  异常的 TriStation 命令序列

行为:
  非工作时间的控制器编程活动
  异常的 STOP/RUN 切换
  安全逻辑下载操作
```

**经验教训**

1. SIS 不再是不可攻破的最后防线
2. 攻击者对工控安全架构有深入了解
3. 需要独立监控 SIS 的配置变更
4. SIS 变更管理必须严格执行双人确认
5. 物理安全与网络安全必须协同考虑

### 案例三：Ukraine Power Grid 攻击取证（2015/2016）

**事件概述**

2015 年 12 月 23 日，乌克兰西部电力公司（Prykarpattyaoblenergo）遭受网络攻击，导致约 23 万用户停电数小时。2016 年 12 月，基辅北部再次遭受类似攻击。这两次攻击被认为是国家支持的 APT 活动。

**2015 年攻击链重建**

```
阶段 1: 侦察与初始访问（数月前）
  ├── 鱼叉式钓鱼邮件（含恶意宏文档）
  ├── BlackEnergy 3 植入
  └── 建立持久化访问

阶段 2: 情报收集（数周至数月）
  ├── 屏幕截图捕获
  ├── 键盘记录
  ├── 文件窃取
  └── 工控网络拓扑测绘

阶段 3: 攻击准备
  ├── 确定断路器控制方式
  ├── 准备 KillDisk 破坏工具
  ├── 配置 UPS 保护（防止自身断电）
  └── 准备通信中断工具

阶段 4: 攻击执行（2015-12-23 下午）
  ├── 远程操作 SCADA 系统断开断路器
  ├── 同时向变电站 RTU 发送断开命令
  ├── KillDisk 破坏工作站（破坏 MBR）
  ├── 拨打自动语音电话干扰呼叫中心
  └── 攻击通信系统延迟响应

阶段 5: 影响
  ├── 约 70 万用户停电
  ├── 手动恢复耗时数小时
  └── 部分变电站需现场手动操作
```

**取证发现**

| 发现项 | 详情 | 证据强度 |
|--------|------|----------|
| BlackEnergy 3 | 定制化恶意软件 | Level 5 |
| KillDisk | MBR 破坏工具 | Level 5 |
| SCADA 操作日志 | 断路器远程断开记录 | Level 5 |
| 钓鱼邮件 | 含恶意宏的附件 | Level 5 |
| 通信中断 | 电话线路被干扰 | Level 4 |
| UPS 配置 | 攻击者防止断电 | Level 4 |

**IOC 清单**

```
文件哈希:
  BlackEnergy 3 主模块
  KillDisk 组件
  远程桌面工具

网络:
  C2 服务器 IP（多个）
  HTTP/HTTPS C2 通信
  特定 User-Agent 字符串

邮件:
  特定钓鱼邮件主题和附件名
  恶意宏代码特征

SCADA:
  异常的断路器操作时间戳
  非正常来源的 RTU 命令
```

**经验教训**

1. 电力系统攻击可造成大规模社会影响
2. 攻击者采用多阶段、多工具的综合攻击策略
3. 破坏与干扰并行（KillDisk + 电话干扰）
4. 需要建立工控系统的手动恢复能力
5. 员工安全意识培训是防线的重要组成部分
6. 电力行业需要建立跨组织的协调响应机制

---

## 0x0C 参考资料

1. **ISA/IEC 62443 工业自动化和控制系统安全标准系列**
   - https://www.isa.org/standards-and-publications/isa-standards/isa-iec-62443

2. **NIST SP 800-82 Rev. 3 - Guide to Industrial Control Systems (ICS) Security**
   - https://csrc.nist.gov/publications/detail/sp/800-82/rev-3/final

3. **SANS ICS Security Resources**
   - https://www.sans.org/ics-security/

4. **MITRE ATT&CK for ICS**
   - https://attack.mitre.org/matrices/ics/

5. **CISA ICS Advisories**
   - https://www.cisa.gov/ics-advisories

6. **NERC Critical Infrastructure Protection (CIP) Standards**
   - https://www.nercCIP.org/standards

7. **FireEye/Mandiant ICS Threat Reports (Stuxnet, Triton, Industroyer)**
   - https://www.mandiant.com/resources/reports

8. **IC3 (Industrial Control System Cyber Emergency) Response Guidelines**
   - https://ics-cert.us-cert.gov/

9. **IEC 61511 - Functional Safety - Safety Instrumented Systems for the Process Industry**
   - https://webstore.iec.ch/publication/6164

10. **Dragos ICS Threat Intelligence**
    - https://www.dragos.com/resources/

11. **Claroty ICS/OT Security Research**
    - https://claroty.com/team82/research

12. **等保 2.0 工控安全扩展要求**
    - http://www.gb68.cn/