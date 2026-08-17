---
title: "RISC-V架构安全取证深度分析"
date: 2026-07-22T10:00:00+08:00
draft: false
weight: 1050
description: "系统剖析RISC-V开源指令集架构安全事件的取证分析方法论，涵盖RISC-V特权级模型与PMP安全边界审计、调试接口JTAG/OpenOCD滥用检测、自定义扩展指令注入取证、固件逆向与供应链信任链验证、IoT设备RISC-V芯片级攻击面映射，结合PicoRV32/ES32等国产RISC-V芯片案例与开源硬件安全工具链，通过真实RISC-V安全事件还原完整取证链"
categories: ["应急响应", "取证分析"]
tags: ["RISC-V", "开源芯片安全", "嵌入式取证", "PMP安全", "JTAG调试", "固件逆向", "IoT安全", "PicoRV32", "芯片供应链", "MITRE ATT&CK"]
---

# RISC-V架构安全取证深度分析

RISC-V是一种基于精简指令集计算（RISC）原则的开源指令集架构（ISA），由加州大学伯克利分校于2010年发起，2015年成立RISC-V基金会推动产业化。与ARM和x86的专有授权模式不同，RISC-V采用模块化、可扩展的开放ISA设计，任何组织均可免费使用其基础指令集并自由添加自定义扩展。这一开放性使RISC-V在嵌入式系统、IoT设备、边缘计算和国产芯片领域获得了爆发式增长——截至2025年，全球已有超过100家公司推出基于RISC-V的商用芯片，中国的平头哥（T-Head）香山处理器、沁恒微CH32V系列、博流BL602/BL808、乐鑫ESP32-C3/C6/H2等均采用RISC-V架构。

然而，RISC-V的开放性同时引入了独特的安全挑战：自定义指令空间允许芯片厂商嵌入不可审计的硬件逻辑；调试接口（Debug Module）的安全配置因实现差异而参差不齐；物理内存保护（PMP）的配置粒度和默认策略在不同芯片间存在显著差异。对于安全取证人员而言，RISC-V设备的安全事件分析面临指令集不透明（自定义扩展）、调试接口暴露、固件格式多样、缺乏统一安全基线等特殊挑战。

本文从蓝队取证实战视角出发，系统性地覆盖RISC-V架构安全取证的全链路分析——从特权级模型与PMP安全边界审计到调试接口滥用检测，从自定义扩展指令注入取证到固件逆向与供应链信任链验证，从IoT芯片级攻击面映射到安全启动完整性验证，结合PicoRV32、ESP32-C3、GD32VF103等国产和主流RISC-V芯片案例，以及OpenOCD、Ghidra、radare2、YARA等开源工具链，通过真实安全事件还原完整取证链。

---

## 0x01 技术基础与取证概述

### RISC-V 架构核心概念

RISC-V ISA的设计哲学是"模块化+可扩展"。其基础指令集（RV32I/RV64I）提供整数运算、加载/存储、控制流等核心指令，之上叠加多个标准扩展模块：

| 扩展模块 | 缩写 | 功能描述 | 安全取证关联 |
|---------|------|---------|-------------|
| Integer Multiply/Divide | M | 整数乘除法运算 | 溢出与边界计算漏洞 |
| Atomic Instructions | A | 原子操作指令 | 并发竞态条件利用 |
| Single-Precision Float | F | 单精度浮点运算 | 浮点侧信道分析 |
| Double-Precision Float | D | 双精度浮点运算 | 浮点侧信道分析 |
| Compressed Instructions | C | 16位压缩指令编码 | 反汇编器兼容性问题 |
| Bit Manipulation | Zba/Zbb/Zbc/Zbs | 位操作扩展 | 密码学加速与旁路 |
| Cryptography | Zkn/Zks | 硬件密码学扩展 | 密码实现安全性评估 |
| Custom Extensions | 自定义 | 厂商自定义指令 | 恶意硬件植入高风险区域 |

### RISC-V 特权级模型

RISC-V定义了四个特权级（Privilege Levels），从高到低依次为Machine（M）、Supervisor（S）、User（U）和Debug（D）：

| 特权级 | 编码 | 功能描述 | 安全边界 |
|-------|------|---------|---------|
| Machine Mode (M) | 11 | 最高特权级，直接访问硬件，处理中断和异常 | 硬件信任根，管理PMP配置 |
| Supervisor Mode (S) | 01 | 操作系统内核运行模式，虚拟内存管理 | 内核态安全边界 |
| User Mode (U) | 00 | 应用程序运行模式，受限资源访问 | 用户态隔离边界 |
| Debug Mode (D) | 10 | 调试模式，允许访问所有寄存器和内存 | 调试后门——安全取证关键 |

Debug Mode的存在是RISC-V安全模型中最具争议的设计之一。当调试模块（Debug Module）被激活时，它能够绕过所有特权级限制，直接读写物理内存、修改CSRs（Control and Status Registers）、甚至覆盖Machine Mode的执行流。这为取证分析提供了"上帝视角"的调试能力，同时也为攻击者提供了高价值的持久化后门。

### RISC-V vs ARM vs x86 安全模型对比

| 安全特性 | RISC-V | ARM (v8/v9) | x86 (Intel/AMD) |
|---------|--------|-------------|-----------------|
| 特权级模型 | M/S/U/D 四级 | EL0-EL3 四级 | Ring 0-3 + VMX Root/Non-root |
| 内存保护 | PMP (Physical Memory Protection) | MPU / MMU + TTBR | MMU + EPT (VT-x) / NPT (AMD-V) |
| 硬件信任根 | 取决于芯片实现 | TrustZone (EL3) | Intel TXT / AMD SKINIT |
| 可信执行环境 | Keystone / Penglai (非标准) | TrustZone / CCA | Intel SGX / TDX, AMD SEV |
| 安全启动 | OpenSBI + 厂商实现 | ARM Trusted Boot | UEFI Secure Boot |
| 调试接口安全 | Debug Module + Debug Authentication | DAP + JTAG lockdown | JTAG + Intel IBP |
| 侧信道缓解 | 取决于微架构 | 部分微架构修复 | Retpoline, IBRS, STIBP |
| 开放性 | 完全开源ISA | 商业授权 | 商业授权 |

### 为何 RISC-V 取证与众不同

RISC-V取证分析面临以下独特挑战：

| 挑战维度 | 具体表现 | 取证影响 |
|---------|---------|---------|
| 自定义指令不透明 | 厂商可在预留编码空间嵌入任意逻辑 | 反汇编器无法正确识别自定义指令 |
| 调试接口配置差异 | 不同SoC的Debug Module实现和认证策略各异 | 需逐一分析各芯片的调试认证机制 |
| PMP配置多样性 | 不同芯片的PMP条目数量和默认值不同 | 安全基线难以统一建立 |
| 固件格式碎片化 | ELF、raw binary、自定义格式共存 | 需要多种解析工具和方法 |
| 开源实现可篡改 | RTL源码可被修改后重新综合 | 供应链攻击可在RTL层面实施 |
| 缺乏标准化安全审计工具 | 无统一的RISC-V安全扫描框架 | 需组合多种工具进行分析 |

### 取证工具链全景

| 工具名称 | 功能定位 | 适用场景 | 获取方式 |
|---------|---------|---------|---------|
| OpenOCD | 片上调试器，支持RISC-V Debug Spec | JTAG连接、CSR读取、内存转储 | `apt install openocd` 或源码编译 |
| JTAGulator | JTAG引脚自动识别工具 | 未知板卡的调试接口发现 | 硬件工具 + 固件 |
| Ghidra | NSA开源逆向工程框架，含RISC-V反汇编器 | 固件逆向、自定义指令分析 | `ghidra-sre.org` |
| radare2/rizin | 轻量级逆向框架，支持RISC-V | 快速固件分析、脚本化反汇编 | `pip install rizin` 或 `apt install radare2` |
| RARS | RISC-V架构模拟器 | 指令行为验证、PMP配置模拟 | GitHub rvcas/rars |
| spike | RISC-V ISA参考模拟器 | 标准行为比对、CSR分析 | `apt install riscv64-unknown-elf-toolchain` + spike |
| objcopy/objdump | GNU Binutils RISC-V工具链 | ELF解析、段提取、反汇编 | `apt install riscv64-unknown-elf-binutils` |
| YARA | 恶意模式匹配引擎 | 固件后门特征扫描 | `pip install yara-python` |
| binwalk | 固件提取与分析工具 | 固件解包、嵌入式文件系统提取 | `pip install binwalk` |
| checksec | 二进制安全属性检查 | 安全编译选项审计 | `apt install checksec` |

**RISC-V取证环境搭建：**

```bash
sudo apt update && sudo apt install -y \
  openocd \
  riscv64-unknown-elf-toolchain \
  riscv64-linux-gnu-toolchain \
  picocom \
  minicom \
  python3-pip

pip3 install yara-python rz-ghidra r2pipe

git clone https://github.com/riscv/isa-simulator.git
cd isa-simulator && mkdir build && cd build
../configure --prefix=/usr/local
make -j$(nproc)
sudo make install

git clone https://github.com/riscv-software-src/riscv-ctg.git
git clone https://github.com/riscv-non-isa/riscv-arch-test.git
```

```bash
git clone https://github.com/radareorg/radare2.git
cd radare2 && sys/install.sh
r2 -v
r2 -a riscv -b 32 firmware.bin
```

---

## 0x02 RISC-V特权级模型与PMP安全边界审计

### Machine Mode 深度分析

Machine Mode是RISC-V中特权级最高的执行模式，在系统上电时最先运行。M模式下的固件（通常为OpenSBI或芯片厂商ROM）负责初始化硬件、配置PMP、设置异常向量表，然后根据需要将执行权移交给S模式（操作系统内核）或直接跳转到U模式（裸机应用）。

M模式可通过以下CSRs（Control and Status Registers）进行安全审计：

| CSR名称 | 地址 | 功能描述 | 安全取证关注点 |
|---------|------|---------|---------------|
| mstatus | 0x300 | 机器模式状态寄存器 | MIE/MPIE位控制中断使能 |
| misa | 0x301 | ISA扩展信息 | 验证实际支持的指令集扩展 |
| mepc | 0x341 | 机器模式异常PC | 异常/中断返回地址 |
| mcause | 0x342 | 异常/中断原因 | 异常类型分析 |
| mtvec | 0x305 | 机器模式异常向量基址 | 中断处理入口是否被篡改 |
| mscratch | 0x340 | 机器模式临时寄存器 | 保存/恢复上下文的中间值 |
| mstatus | 0x300 | 机器模式全局中断使能 | MIE=0时中断被屏蔽 |
| pmpcfg0-3 | 0x3A0-0x3A3 | PMP配置寄存器 | 物理内存保护策略 |
| pmpaddr0-15 | 0x3B0-0x3BF | PMP地址寄存器 | 保护区域地址设置 |

通过OpenOCD读取M模式CSRs的取证命令：

```bash
openocd -f interface/ftdi/ft232r.cfg -f target/riscv/spi.cfg -c "
  init
  halt
  reg mstatus
  reg misa
  reg mtvec
  reg mepc
  reg mcause
  reg pmpcfg0
  reg pmpcfg1
  reg pmpcfg2
  reg pmpcfg3
  reg pmpaddr0
  reg pmpaddr1
  reg pmpaddr2
  reg pmpaddr3
  reg pmpaddr4
  reg pmpaddr5
  reg pmpaddr6
  reg pmpaddr7
  shutdown
"
```

### PMP 安全边界审计

Physical Memory Protection（PMP）是RISC-V实现内存隔离的核心硬件机制，类似于ARM的MPU（Memory Protection Unit）。PMP允许M模式软件定义最多16个物理内存区域（取决于芯片实现），每个区域可配置读/写/执行权限以及锁定状态。

**PMP配置寄存器编码解析：**

PMP配置通过`pmpcfg0`至`pmpcfg3`寄存器设置，每个寄存器包含4个区域的配置（每个区域占8位）：

| 位域 | 字段名 | 功能描述 |
|-----|--------|---------|
| [0] | R | 读权限使能 |
| [1] | W | 写权限使能 |
| [2] | X | 执行权限使能 |
| [4:3] | A | 地址匹配模式 |
| [6] | L | 锁定位（锁定后不可修改） |

地址匹配模式（A字段）的编码：

| A字段值 | 匹配模式 | 描述 |
|--------|---------|------|
| 00 | OFF | 该条目禁用 |
| 00 | TOR | Top of Range，匹配`pmpaddr[i-1]`到`pmpaddr[i]`之间的地址 |
| 01 | NA4 | Naturally Aligned 4-byte | 匹配精确的4字节区域 |
| 1x | NAPOT | Naturally Aligned Power of Two | 匹配2^(n+1)字节的自然对齐区域 |

### PMP 配置取证分析脚本

以下Python脚本用于解析从设备中转储的PMP配置并检测异常：

```python
import struct
import sys

PMP_R = 0x01
PMP_W = 0x02
PMP_X = 0x04
PMP_A_TOR = 0x08
PMP_A_NA4 = 0x10
PMP_A_NAPOT = 0x18
PMP_L = 0x40

MATCH_MODES = {
    0x00: "OFF",
    0x08: "TOR",
    0x10: "NA4",
    0x18: "NAPOT"
}

def decode_pmpcfg(reg_val):
    entries = []
    for i in range(4):
        cfg_byte = (reg_val >> (i * 8)) & 0xFF
        mode = cfg_byte & 0x18
        r = bool(cfg_byte & PMP_R)
        w = bool(cfg_byte & PMP_W)
        x = bool(cfg_byte & PMP_X)
        locked = bool(cfg_byte & PMP_L)
        entries.append({
            'index': i,
            'raw': hex(cfg_byte),
            'mode': MATCH_MODES.get(mode, "INVALID"),
            'R': r, 'W': w, 'X': x,
            'locked': locked
        })
    return entries

def napot_decode(pmpaddr_val):
    if pmpaddr_val == 0:
        return 0
    addr = pmpaddr_val
    size = 1
    bit = 1
    for i in range(64):
        if addr & (1 << i):
            size = 2 << i
            break
    base = (addr << 2) & ~(size - 1) if size > 0 else 0
    return size

def analyze_pmp(pmpcfg_regs, pmpaddr_regs):
    print("=" * 70)
    print("RISC-V PMP Configuration Forensic Analysis")
    print("=" * 70)

    all_entries = []
    for idx, cfg_val in enumerate(pmpcfg_regs):
        entries = decode_pmpcfg(cfg_val)
        for e in entries:
            e['global_idx'] = idx * 4 + e['index']
            all_entries.append(e)

    suspicious_patterns = []
    for e in all_entries:
        if e['mode'] == 'OFF':
            continue
        if e['R'] and e['W'] and e['X']:
            suspicious_patterns.append(
                f"  [CRITICAL] PMP[{e['global_idx']}]: RWX ALL ENABLED - "
                f"Full memory access without restriction"
            )
        if e['R'] and e['W'] and not e['X']:
            pass
        if e['mode'] == 'TOR':
            gidx = e['global_idx']
            if gidx > 0 and all_entries[gidx - 1]['mode'] == 'OFF':
                suspicious_patterns.append(
                    f"  [WARNING] PMP[{gidx}]: TOR mode but previous entry OFF"
                )
        print(f"  PMP[{e['global_idx']:2d}]: {e['mode']:5s} "
              f"R={int(e['R'])} W={int(e['W'])} X={int(e['X'])} "
              f"L={int(e['locked'])}  raw={e['raw']}")

    if suspicious_patterns:
        print("\n[!] SUSPICIOUS CONFIGURATIONS DETECTED:")
        for p in suspicious_patterns:
            print(p)
    else:
        print("\n[*] No obviously suspicious PMP configurations found.")

    print("=" * 70)

if __name__ == '__main__':
    pmpcfg = [0x00000000] * 4
    pmpaddr = [0x00000000] * 16

    if len(sys.argv) > 1:
        data = open(sys.argv[1], 'rb').read()
        if len(data) >= 80:
            for i in range(4):
                pmpcfg[i] = struct.unpack('<I', data[i*4:(i+1)*4])[0]
            for i in range(16):
                pmpaddr[i] = struct.unpack('<I', data[16+i*4:20+i*4])[0]

    analyze_pmp(pmpcfg, pmpaddr)
```

### PMP 常见绕过技术与检测

| 绕过技术 | MITRE ATT&CK | 攻击原理 | 检测方法 |
|---------|-------------|---------|---------|
| M模式覆盖 | T1542 | M模式固件可无条件修改PMP配置 | 审计mtvec和OpenSBI完整性 |
| PMP Lock绕过 | T1055 | 通过M模式重新上电清除Lock位 | 监控PMP配置变更事件 |
| 地址别名攻击 | T1190 | 利用NAPOT模式的地址重叠创建后门 | 解析所有NAPOT区域的地址覆盖 |
| TOR链篡改 | T1200 | 修改pmpaddr造成保护区域移位 | 比对已知安全基线的PMP配置 |
| 调试模式绕过 | T1210 | Debug Mode可无视PMP直接访问 | 检查Debug Authentication配置 |

---

## 0x03 调试接口安全取证分析

### RISC-V Debug Module 架构

RISC-V Debug Specification定义了通过外部调试器访问芯片内部状态的标准机制。Debug Module（DM）通过JTAG或DW（Debug Wire）接口与外部调试器连接，内部通过System Bus Access（SBA）与芯片的总线矩阵交互，可读写任意物理地址。

| 组件 | 功能描述 | 取证关联 |
|------|---------|---------|
| Debug Module (DM) | 调试核心，管理调试会话 | 攻击者持久化后门的关键载体 |
| Debug Transport Module (DTM) | JTAG/SWD物理层接口 | 物理调试接口暴露检测 |
| System Bus Access (SBA) | 通过总线读写任意地址 | 绕过PMP直接访问内存 |
| Program Buffer | 通过PM寄存器注入执行序列 | 强制CPU执行任意指令 |
| Abstract Commands | 标准调试命令接口 | 读写CSR、读写内存 |
| Debug Authentication | 调试认证与授权机制 | 安全策略配置审计 |

### JTAG 调试接口探测

在未知RISC-V板卡的取证中，首先需要定位和识别JTAG接口。JTAG标准定义了四个信号：TDI（Test Data In）、TDO（Test Data Out）、TCK（Test Clock）、TMS（Test Mode Select），外加TRST（Test Reset，可选）。

使用JTAGulator进行自动化引脚识别：

```bash
python3 jtagulator.py -b 115200 -p /dev/ttyUSB0
```

JTAGulator通过遍历所有可能的引脚组合并发送标准JTAG测试序列，自动识别JTAG接口的引脚映射。识别成功后，通过OpenOCD连接到目标设备：

```bash
openocd -f interface/ftdi/ft232r.cfg -c "adapter speed 1000" \
  -c "transport select jtag" \
  -c "jtag newtap riscv cpu -irlen 5" \
  -c "target create riscv.cpu riscv -chain-position riscv.cpu" \
  -c "init" -c "halt" -c "reg pc" -c "shutdown"
```

### Debug Authentication 安全配置审计

RISC-V Debug Specification定义了两级认证机制：Debug Authentication（基于硬件）和Software Authentication（基于固件）。不同芯片的实现差异显著：

| 芯片型号 | Debug认证机制 | 默认状态 | 安全风险评估 |
|---------|-------------|---------|-------------|
| SiFive FE310 | Debug Authentication pins | 默认开放 | 高风险——任何人可通过JTAG访问 |
| ESP32-C3 | eFuse烧录禁用 | 出厂默认启用 | 中风险——需主动烧录禁用 |
| GD32VF103 | Debug Authentication bits | 默认开放 | 高风险——需手动配置禁用 |
| WCH CH32V303 | Debug Authentication | 默认开放 | 高风险——JTAG/SWD完全开放 |
| StarFive JH7110 | PRCI寄存器控制 | 默认开放 | 中风险——可通过PRCI寄存器禁用 |
| T-Head C906 | 调试配置寄存器 | 取决于SoC集成 | 需具体分析SoC级配置 |

### 调试接口滥用检测

攻击者利用调试接口可实施的攻击：

| 攻击手法 | MITRE ATT&CK | 技术描述 | 取证痕迹 |
|---------|-------------|---------|---------|
| 内存转储 | T1005 | 通过SBA读取任意物理内存 | 调试日志中的SBA读操作 |
| 寄存器篡改 | T1055 | 修改PC、通用寄存器、CSR | 执行流异常跳转记录 |
| 代码注入 | T1059 | 通过SBA写入RAM并执行 | RAM中的异常代码段 |
| 安全配置覆盖 | T1562 | 修改PMP、权限寄存器禁用保护 | PMP配置与预期不一致 |
| 固件提取 | T1005 | 直接读取Flash中的固件 | 调试会话日志 |
| 持久化植入 | T1542 | 修改Flash/OTP存储植入后门 | 固件完整性哈希变化 |

**OpenOCD调试会话取证脚本：**

```bash
#!/bin/bash
TARGET_IP=$1
OUTPUT_DIR="riscv_debug_forensics_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUTPUT_DIR"

openocd -f interface/ftdi/ft232r.cfg -f target/riscv/spi.cfg -c "
  init
  halt

  dump_image $OUTPUT_DIR/ram_dump.bin 0x80000000 0x100000
  dump_image $OUTPUT_DIR/flash_dump.bin 0x20000000 0x400000

  reg mstatus > $OUTPUT_DIR/mstatus.txt
  reg mepc > $OUTPUT_DIR/mepc.txt
  reg mcause > $OUTPUT_DIR/mcause.txt
  reg pmpcfg0 > $OUTPUT_DIR/pmpcfg0.txt
  reg pmpcfg1 > $OUTPUT_DIR/pmpcfg1.txt
  reg pmpaddr0 > $OUTPUT_DIR/pmpaddr0.txt
  reg pmpaddr1 > $OUTPUT_DIR/pmpaddr1.txt

  mdw 0x00000000 0x100 > $OUTPUT_DIR/vector_table_dump.txt

  shutdown
"

echo "[*] Debug session forensics dump saved to $OUTPUT_DIR/"
echo "[*] SHA256 checksums:"
sha256sum "$OUTPUT_DIR"/*.bin
```

---

## 0x04 自定义扩展指令注入取证

### RISC-V 自定义指令编码空间

RISC-V ISA规范在指令编码中预留了自定义扩展空间，允许芯片厂商和研究者定义非标准指令。标准预留的编码空间包括：

| 编码空间 | opcode [6:0] | 位模式 | 用途描述 |
|---------|-------------|--------|---------|
| CUSTOM-0 | 0x0B | 0001011 | 厂商自定义指令槽0 |
| CUSTOM-1 | 2B | 0101011 | 厂商自定义指令槽1 |
| CUSTOM-2 | 5B | 1011011 | 厂商自定义指令槽2 |
| CUSTOM-3 | 7B | 1111011 | 厂商自定义指令槽3 |
| 5th-A | 2A | 0101010 | 第五版预留槽A |
| 5th-B | 5A | 1010101 | 第五版预留槽B |

在RISC-V标准编码中，opcode [6:0] = 0x0B（CUSTOM-0）是最常用的自定义指令空间。通过组合不同的funct3和funct7字段，厂商可以在同一opcode空间内定义数十条自定义指令。

### 恶意自定义指令的植入方式

攻击者利用自定义指令空间植入恶意硬件逻辑的方式：

| 植入方式 | MITRE ATT&CK | 技术描述 | 隐蔽性 |
|---------|-------------|---------|--------|
| RTL级注入 | T1195 | 在开源RTL源码中添加恶意模块 | 高——与正常逻辑混合 |
| 固件级模拟 | T1059 | 在固件中通过宏指令序列模拟自定义指令 | 中——需要固件访问权限 |
| FPGA综合篡改 | T1195 | 修改FPGA bitstream中的LUT配置 | 高——影响硬件层面 |
| 反汇编器污染 | T1027 | 利用反汇编器不识别自定义指令制造混淆 | 高——阻碍逆向分析 |

### 自定义指令编码分析

以下脚本用于扫描RISC-V二进制文件中的自定义指令编码：

```python
import struct
import sys
import os

CUSTOM_OPCODES = {0x0B, 0x2B, 0x5B, 0x7B}

def extract_opcode(word):
    return word & 0x7F

def extract_funct3(word):
    return (word >> 12) & 0x07

def extract_funct7(word):
    return (word >> 25) & 0x7F

def analyze_instruction(word, offset):
    opcode = extract_opcode(word)
    if opcode in CUSTOM_OPCODES:
        funct3 = extract_funct3(word)
        funct7 = extract_funct7(word)
        rd = (word >> 7) & 0x1F
        rs1 = (word >> 15) & 0x1F
        rs2 = (word >> 20) & 0x1F
        imm = (word >> 20) & 0xFFF
        return {
            'offset': offset,
            'raw': hex(word),
            'opcode': hex(opcode),
            'funct3': funct3,
            'funct7': funct7,
            'rd': rd,
            'rs1': rs1,
            'rs2': rs2,
            'imm': imm
        }
    return None

def scan_binary(filepath):
    results = []
    with open(filepath, 'rb') as f:
        data = f.read()

    for i in range(0, len(data) - 3, 4):
        word = struct.unpack('<I', data[i:i+4])[0]
        inst = analyze_instruction(word, i)
        if inst:
            results.append(inst)

    return results

def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <firmware_binary>")
        sys.exit(1)

    filepath = sys.argv[1]
    print(f"[*] Scanning {filepath} for RISC-V custom instructions...")
    print(f"[*] File size: {os.path.getsize(filepath)} bytes")

    results = scan_binary(filepath)

    if results:
        print(f"\n[!] Found {len(results)} custom instruction encodings:\n")
        print(f"{'Offset':>12s}  {'Raw':>12s}  {'Op':>6s}  "
              f"{'f3':>3s}  {'f7':>4s}  {'rd':>4s}  {'rs1':>4s}  {'rs2':>4s}  {'imm':>8s}")
        print("-" * 80)
        for r in results:
            print(f"  0x{r['offset']:08x}  {r['raw']:>12s}  {r['opcode']:>6s}  "
                  f"{r['funct3']:3d}  {r['funct7']:4d}  "
                  f"{r['rd']:4d}  {r['rs1']:4d}  {r['rs2']:4d}  {r['imm']:#8x}")

        opcode_groups = {}
        for r in results:
            key = r['opcode']
            opcode_groups[key] = opcode_groups.get(key, 0) + 1

        print(f"\n[!] Custom opcode distribution:")
        for op, count in sorted(opcode_groups.items()):
            print(f"    {op}: {count} occurrences")
    else:
        print("\n[*] No custom instruction encodings found.")

if __name__ == '__main__':
    main()
```

### 反汇编器盲区分析

自定义指令对逆向分析工具链造成严重干扰。主流反汇编器对RISC-V自定义指令的处理策略差异：

| 反汇编器 | 自定义指令处理 | 已知问题 | 推荐替代方案 |
|---------|--------------|---------|-------------|
| Ghidra (SLEIGH) | 需自定义PSL描述文件 | 默认配置跳过CUSTOM-0/1/2/3 | 编写自定义SLEIGH模块 |
| radare2 | 尝试按R4/I-type解码 | 结果不准确但至少显示原始字节 | 结合 `pd` 和 `wx` 分析 |
| objdump (GNU) | 尝试解码为标准指令 | 输出可能完全错误 | 使用 `-D -b binary` |
| IDA Pro (RISC-V) | 需自定义处理器模块 | 无原生自定义指令支持 | 手动patch处理器模块 |
| Binary Ninja | 有限RISC-V支持 | 自定义指令区域标记为数据 | 结合手动分析 |

**Ghidra自定义指令分析工作流：**

```bash
ghidra_headless analyze /tmp/riscv_project \
  -import firmware.bin \
  -processor RISCV:RV32IC \
  -cspec "default" \
  -scriptPath /opt/ghidra_scripts \
  -postScript RiscvCustomInstDetector.java
```

### 自定义指令取证检测方法

| 检测方法 | 适用场景 | 检测精度 | 工具支持 |
|---------|---------|---------|---------|
| 编码扫描 | 所有RISC-V二进制 | 高——直接匹配预留opcode | 自定义Python脚本 |
| 行为分析 | 可执行固件 | 中——观察异常行为模式 | spike模拟器 |
| RTL审计 | 开源RTL源码 | 高——源码级审查 | Verilator + 自定义检查器 |
| 比特流分析 | FPGA bitstream | 低——需要厂商特定解码 | vendor工具链 |
| ISA对比 | 固件+芯片文档 | 高——与标准ISA对比差异 | RISC-V ISA手册 |

---

## 0x05 RISC-V固件安全与逆向分析

### RISC-V 芯片启动流程

典型的RISC-V SoC启动流程分为多个阶段，每个阶段的固件组件承担不同的初始化职责：

| 启动阶段 | 固件组件 | 运行模式 | 功能描述 | 安全关键度 |
|---------|---------|---------|---------|-----------|
| Stage 0 | 芯片ROM (Mask ROM) | M Mode | 硬编码启动逻辑，不可修改 | 最高——信任根 |
| Stage 1 | Boot ROM / IROM | M Mode | 初始硬件配置，加载下一级 | 高 |
| Stage 2 | Bootloader (OpenSBI/SPL) | M Mode → S Mode | PMP配置、异常向量设置、跳转到OS | 高 |
| Stage 3 | U-Boot / Firmware Payload | S Mode | 硬件进一步初始化、加载内核 | 中 |
| Stage 4 | OS Kernel | S Mode + U Mode | 操作系统正常运行 | —— |
| Stage 5 | 用户态应用 | U Mode | 应用程序执行 | —— |

**ESP32-C3 启动流程示例：**

```bash
esptool.py --chip esp32c3 read_flash 0x0 0x100000 firmware_dump.bin

esptool.py --chip esp32c3 image_info firmware_dump.bin

riscv64-unknown-elf-objdump -D -b binary -m riscv:rv32 firmware_dump.bin | head -200
```

**GD32VF103 固件提取：**

```bash
openocd -f interface/stlink.cfg -f target/gd32vf103.cfg -c "
  init
  halt
  flash read_bank 0 firmware_gd32vf.bin
  dump_image memory_dump.bin 0x20000000 0x20000
  shutdown
"
```

### 固件格式识别与解析

RISC-V固件通常以以下格式存在：

| 固件格式 | 文件特征 | 解析工具 | 常见来源 |
|---------|---------|---------|---------|
| ELF | `7f 45 4c 46` 文件头 | readelf, objdump, Ghidra | GCC编译输出 |
| Intel HEX | 以 `:` 开头的文本行 | objcopy, srec_cat | 编程器烧录文件 |
| Motorola S-Record | 以 `S` 开头的文本行 | objcopy, srec_cat | 传统嵌入式工具链 |
| Raw Binary | 无文件头 | 直接加载到Ghidra | Flash直接读取 |
| UF2 | 微控制器通用格式 | uf2conv.py | RP2040等新平台 |
| 自定义格式 | 厂商特定头部 | 厂商SDK解析器 | 部分国产芯片 |

### 固件完整性验证方法

```bash
sha256sum firmware_original.bin
sha256sum firmware_dump.bin

binwalk firmware_dump.bin

strings firmware_dump.bin | grep -iE "(openocd|jtag|debug|backdoor|shell|cmd)"

radiff2 -s firmware_known_good.bin firmware_dump.bin

rabin2 -I firmware_dump.bin
rabin2 -S firmware_dump.bin
rabin2 -z firmware_dump.bin | head -50
```

### Ghidra RISC-V 固件逆向工作流

使用Ghidra进行RISC-V固件逆向的标准流程：

| 步骤 | 操作描述 | 关键配置 |
|-----|---------|---------|
| 1. 导入 | 将固件导入Ghidra项目 | 选择 `RISCV:LE:32:default` 或 `RV64` |
| 2. 基地址设置 | 设置正确的加载地址 | 参考芯片Datasheet的Flash/RAM映射 |
| 3. 反汇编 | 自动或手动反汇编分析 | Auto-analysis → Functions → Disassembly |
| 4. 函数识别 | 标记和命名关键函数 | 特别关注 `mtvec_handler`, `m_mode_entry` |
| 5. 交叉引用 | 分析函数调用关系 | Xrefs from/to追踪执行流 |
| 6. 数据分析 | 分析全局数据结构 | 特别关注CSR操作和PMP配置数据 |
| 7. 自定义指令 | 识别和标注自定义指令 | 结合编码扫描结果手动标注 |
| 8. 导出 | 导出分析结果 | Function ID, Symbol Tree |

```bash
ghidra_headless /tmp/project_dir Project1 \
  -import firmware.bin \
  -processor RISCV:RV32IC \
  -cspec "default" \
  -loader BinaryLoader \
  -loaderOptions "baseAddr=0x20000000" \
  -postScript AutoAnalysis.java
```

---

## 0x06 RISC-V芯片供应链信任链取证

### 芯片制造信任链

RISC-V芯片从设计到出厂的信任链涉及多个环节，每个环节都是潜在的供应链攻击面：

| 环节 | 描述 | 攻击可能性 | 取证方法 |
|-----|------|-----------|---------|
| RTL设计 | Verilog/SystemVerilog源码 | 恶意模块植入 | 源码审计、形式验证 |
| 功能仿真 | RTL仿真验证 | 测试向量篡改 | 仿真覆盖率分析 |
| 逻辑综合 | RTL → 门级网表 | 网表级植入 | 网表比对、形式等价性验证 |
| 布局布线 | 门级网表 → GDSII | 布线后门植入 | 物理验证（DRC/LVS） |
| 晶圆制造 | GDSII → 物理芯片 | 供应链替换 | 芯片DNA验证、侧信道检测 |
| 封装测试 | 芯片封装与功能测试 | 固件预烧录 | 出厂固件哈希验证 |
| 板级集成 | SoC + 外设 + PCB | 硬件木马植入 | PCB X-Ray检测、信号完整性分析 |

### 开源RTL vs 专有RTL 安全对比

| 对比维度 | 开源RISC-V Core | 专有ARM/RISC-V Core |
|---------|----------------|---------------------|
| 代码审计 | 完全透明，社区可审计 | 封闭源码，依赖厂商安全承诺 |
| 后门植入难度 | 需在众目睽睽下植入 | 厂商内部人员可直接植入 |
| 漏洞发现速度 | 社区快速发现（如Nuclei F子类） | 厂商主导，响应速度取决于内部流程 |
| 变更追溯 | Git完整版本历史 | 无公开变更记录 |
| 第三方依赖 | 工具链、IP核需审计 | 同样需要审计第三方组件 |
| 典型Core | PicoRV32, VexRiscv, BOOM, CVA6 | ARM Cortex-M/R/A, SiFive U/S系列 |

**开源RISC-V Core安全审计工具：**

```bash
git clone https://github.com/lowRISC/verilator.git
cd verilator && make -j$(nproc)

verilator --lint-only -Wall \
  -Wno-DECLFILENAME \
  picorv32.v \
  --top-module picorv32

git clone https://github.com/chipsalliance/riscv-formal.git
cd riscv-formal
make verify-picorv32
```

### FPGA 软核 RISC-V 安全评估

FPGA平台上实现的RISC-V软核面临额外的安全风险：

| 风险类型 | 攻击手法 | 检测方法 |
|---------|---------|---------|
| Bitstream篡改 | 修改LUT配置植入后门 | bitstream比对、SRAM PUF |
| 配置回读攻击 | 从FPGA回读配置数据 | bitstream加密、防回读配置 |
| 侧信道泄露 | 通过功耗/电磁辐射泄露密钥 | SCA/DPA防护设计 |
| JTAG后门 | 保留未声明的JTAG接口 | JTAG扫描、引脚探测 |
| 共享逻辑干扰 | 通过共享BRAM/路由干扰其他逻辑 | 逻辑隔离分析 |

---

## 0x07 IoT设备RISC-V芯片级攻击面分析

### 主流 RISC-V IoT 平台

| 芯片型号 | 厂商 | RISC-V Core | 主频 | Flash/RAM | 无线 | 调试接口 |
|---------|------|------------|------|-----------|------|---------|
| ESP32-C3 | 乐鑫 | 沁恒RISC-V | 160MHz | 4MB/400KB | WiFi+BLE | JTAG (eFuse可禁) |
| ESP32-C6 | 乐鑫 | 沁恒RISC-V | 160MHz | 4MB/512KB | WiFi6+BLE5 | JTAG (eFuse可禁) |
| ESP32-H2 | 乐鑫 | 沁恒RISC-V | 96MHz | 4MB/256KB | BLE5+802.15.4 | JTAG (eFuse可禁) |
| GD32VF103 | 兆易创新 | Bumblebee | 108MHz | 128KB/32KB | 无 | JTAG+SWD (默认开放) |
| CH32V303 | 南京沁恒 | QingKe V4F | 144MHz | 256KB/64KB | 无 | JTAG+SWD (默认开放) |
| BL602 | 博流智能 | 沁恒RISC-V | 144MHz | 4MB/256KB | WiFi+BLE | JTAG (部分开放) |
| BL808 | 博流智能 | 沁恒+自研 | 480MHz | 2MB/640KB | WiFi+BLE+摄像头 | JTAG (部分开放) |
| W800 | 联盛德 | 赛昉C906 | 240MHz | 1MB/288KB | WiFi+BLE | JTAG+SWD |
| BL302 | 傲来科技 | 沁恒RISC-V | 144MHz | 4MB/512KB | WiFi+BLE | JTAG |
| PicoRV32 | 一体数智 | 开源软核 | ~250MHz(FPGA) | 取决于FPGA | 无 | 可配置调试接口 |

### 攻击面映射

RISC-V IoT设备的攻击面可从以下维度进行系统性映射：

| 攻击面 | 攻击向量 | MITRE ATT&CK | 影响评估 |
|-------|---------|-------------|---------|
| JTAG/SWD调试接口 | 物理接触设备，通过调试接口读取固件 | T1190 | 严重——可提取所有固件和密钥 |
| 固件更新接口 | OTA固件更新通道被劫持或注入 | T1195 | 严重——远程代码执行 |
| UART控制台 | 串口控制台获取shell访问 | T1059 | 高——设备完全控制 |
| SPI/I2C总线 | 通过外部Flash读取固件 | T1005 | 高——固件逆向 |
| 无线接口 | WiFi/BLE协议栈漏洞 | T1190 | 高——远程攻击 |
| 侧信道 | 功耗分析、电磁辐射 | T1005 | 中——密钥泄露 |
| 故障注入 | 电压毛刺、时钟毛刺 | T1200 | 中——安全检查绕过 |
| 物理篡改 | 芯片解封装、微探针 | T1200 | 低——需专业设备 |

### 侧信道分析基础

侧信道攻击（Side-Channel Analysis）利用芯片在执行密码学操作时泄露的物理信息（功耗、电磁辐射、时序等）提取密钥。

| 侧信道分析方法 | 所需设备 | 攻击复杂度 | 适用场景 |
|--------------|---------|-----------|---------|
| Simple Power Analysis (SPA) | 功耗采集设备 + 示波器 | 低 | 密码学分支判断 |
| Differential Power Analysis (DPA) | ChipWhisperer/专业设备 | 中 | AES/RSA密钥恢复 |
| Correlation Power Analysis (CPA) | ChipWhisperer + 参考功耗模型 | 中-高 | 软件/硬件AES实现 |
| 电磁辐射分析 (EMA) | 近场EM探头 + 示波器 | 中 | 高精度定位泄漏源 |
| 时序分析 | 精确计时器 | 低 | 密码学操作时序差异 |

```bash
# ChipWhisperer侧信道采集环境配置
pip install chipwhisperer

# 使用ChipWhisperer Nano采集ESP32-C3功耗迹线
python3 -c "
import chipwhisperer as cw
scope = cw.scope()
target = cw.target(scope, cw.targets.SimpleSerial)
scope.setup(gain=45, num_samples=2400)
target.simpleserial_write('p', b'\\x01')
trace = scope.capture()
print(f'Captured {len(trace.wave)} samples')
"
```

### 故障注入攻击检测

| 故障注入类型 | 技术描述 | RISC-V影响 | 检测方法 |
|------------|---------|-----------|---------|
| 电压毛刺 (Voltage Glitching) | 短暂降低或升高供电电压 | 跳过安全检查指令 | 冗余校验、电压监控 |
| 时钟毛刺 (Clock Glitching) | 插入额外时钟脉冲 | 指令执行错误 | 时钟完整性检查 |
| 光注入 (Optical Fault Injection) | 激光照射芯片激活位翻转 | 寄存器/存储器位翻转 | ECC校验、冗余存储 |
| 电磁脉冲 (EMFI) | 电磁脉冲引起局部电路干扰 | 逻辑门状态翻转 | 冗余计算、安全监控 |

---

## 0x08 RISC-V安全启动与信任根取证

### 安全启动实现架构

RISC-V平台的安全启动（Secure Boot）通常基于OpenSBI（Open Source Supervisor Binary Interface）框架实现，其信任链传递关系如下：

| 启动阶段 | 组件 | 信任根 | 验证机制 | 失败处理 |
|---------|------|-------|---------|---------|
| Stage 0 | Mask ROM | 硬件不可变 | N/A（信任根） | 无——硬件信任根 |
| Stage 1 | Boot ROM Signature | Mask ROM | RSA/ECDSA签名验证 | 进入恢复模式 |
| Stage 2 | OpenSBI FW_JUMP | Boot ROM | 签名验证 + 哈希比对 | 进入安全恢复 |
| Stage 3 | U-Boot SPL | OpenSFI | 签名验证 | 回退到备用分区 |
| Stage 4 | U-Boot | U-Boot SPL | FIT Image签名验证 | 回退到备用内核 |
| Stage 5 | Linux Kernel | U-Boot | dm-verity / IMA | 启动失败/恢复模式 |

### OpenSBI 安全配置审计

OpenSBI作为RISC-V平台的M模式固件，负责执行安全关键操作。审计OpenSBI配置需要关注以下方面：

```bash
riscv64-unknown-elf-objdump -d opensbi firmware.bin
riscv64-unknown-elf-nm opensbi firmware.bin | grep -E "(pmp|csr|trap|ecall)"

riscv64-unknown-elf-readelf -s opensbi firmware.bin | grep -iE "(pmp|security|crypto)"

strings opensbi firmware.bin | grep -iE "(debug|jtag|uart|shell)"
```

**OpenSBI配置审计清单：**

| 审计项 | 检查命令 | 预期结果 | 异常含义 |
|-------|---------|---------|---------|
| PMP配置完整性 | 读取pmpcfg0-3 | M模式全权限、S模式受限 | PMP配置被绕过 |
| 异常向量表 | 读取mtvec寄存器 | 指向OpenSBI代码段 | 向量表被篡改 |
| 调试模块状态 | 读取mdcsr寄存器 | Debug认证启用 | 调试后门开放 |
| 安全启动标志 | 检查OTP/eFuse位 | Secure Boot enabled | 安全启动被禁用 |
| 密钥存储 | 检查OTP/eFuse区域 | 厂商签名密钥已烧录 | 密钥丢失或替换 |

### 检测启动级 Rootkit

启动级Rootkit（Bootkit）在RISC-V平台上的实现方式和检测方法：

| Rootkit类型 | 植入位置 | MITRE ATT&CK | 检测方法 |
|------------|---------|-------------|---------|
| Boot ROM后门 | Mask ROM (不可改) | T1542 | 固件哈希比对（芯片解封装） |
| OpenSBI替换 | Bootloader分区 | T1542.001 | 分区哈希签名验证 |
| 内核替换 | Kernel分区 | T1542.002 | dm-verity / IMA验证 |
| 固件持久化 | Flash保留区 | T1542 | 全Flash内容扫描 |
| CSR劫持 | mtvec寄存器修改 | T1055 | CSR值与预期比对 |
| PMP绕过 | PMP配置篡改 | T1562.001 | PMP配置基线比对 |

### 可信执行环境替代方案

| TEE方案 | 开发者 | 架构特点 | 安全评估 |
|--------|-------|---------|---------|
| Keystone | UC Berkeley | 独立于M-mode的Enclave实现 | 学术验证，生产就绪度待提升 |
| Penglai | 清华大学 | 基于SBI扩展的Enclave | 轻量级，适合IoT场景 |
| MultiZone | Hex-Five | 多域隔离安全执行 | 无需S-mode，M-mode直接管理 |
| eSCAL | Rivos | 硬件级安全隔离 | 依赖特定硬件支持 |
| Caliptra | Google/CHIPS Alliance | 开源芯片信任根框架 | 面向数据中心级别安全 |

---

## 0x09 证据强度分层与案例关联

### 三级证据强度分类

在RISC-V安全取证分析中，不同证据的可靠性和恶意性需要按照统一的分级标准进行分类，以便进行跨事件的关联分析和风险评估：

| 证据等级 | 颜色标记 | 定义 | 可信度 | 典型场景 |
|---------|---------|------|-------|---------|
| 一级-确认恶意 | 🔴 | 直接证明恶意行为的客观证据 | 极高 | 自定义指令植入、Debug认证绕过后门 |
| 二级-高度可疑 | 🟡 | 强烈暗示恶意行为但需要补充证据 | 高 | PMP配置异常、固件完整性不匹配 |
| 三级-需要关注 | 🟢 | 可能指示安全风险但尚不明确 | 中 | 开放调试端口、非标准SoC配置 |

### 证据关联框架

| 证据类型 | 🔴 确认恶意 | 🟡 高度可疑 | 🟢 需要关注 |
|---------|-----------|-----------|-----------|
| PMP配置 | M-mode PMP被配置为全开放且无Lock | PMP区域数量异常少 | 默认PMP配置未修改 |
| 调试接口 | Debug Authentication被绕过后存在持久化代码 | 调试接口物理可达 | 调试端口未在生产固件中禁用 |
| 自定义指令 | 扫描到未知CUSTOM-0/1编码且行为可疑 | 自定义指令数量超出芯片文档描述 | 存在非标准指令编码 |
| 固件完整性 | 固件哈希与已知良好版本不匹配 | 固件中发现加密或混淆段 | 固件版本号与预期不一致 |
| 供应链 | RTL源码与综合结果不一致 | 使用未经验证的第三方IP | 开源Core版本落后于已知修复版 |
| 启动链 | Secure Boot验证被绕过 | Boot阶段日志缺失 | 启动时间异常长 |

### 证据采集标准化流程

| 步骤 | 操作 | 工具 | 输出 |
|-----|------|------|------|
| 1. 非侵入式检查 | 外观检查、型号记录、丝印拍照 | 相机、放大镜 | 设备基本信息 |
| 2. 调试接口识别 | JTAG/SWD引脚探测 | JTAGulator, 万用表 | 调试接口引脚映射 |
| 3. 固件提取 | 通过调试接口或Flash读取 | OpenOCD, flashrom | 固件二进制文件 |
| 4. 内存转储 | 通过调试接口读取RAM | OpenOCD | RAM镜像 |
| 5. 配置读取 | CSR/PMP/eFuse配置提取 | OpenOCD, 自定义脚本 | 安全配置快照 |
| 6. 代码分析 | 固件逆向、自定义指令检测 | Ghidra, YARA, Python | 分析报告 |
| 7. 比对分析 | 与已知良好版本的差异分析 | radiff2, sha256sum | 差异报告 |
| 8. 证据归档 | 哈希链、时间戳、完整记录 | sha256sum, 审计日志 | 取证报告 |

---

## 0x0A 自动化检测与狩猎

### Sigma 规则：RISC-V 调试接口异常访问检测

```yaml
title: RISC-V Debug Module Suspicious Access
id: riscv-debug-access-001
status: experimental
description: Detects suspicious access patterns to RISC-V Debug Module registers
references:
  - https://github.com/riscv/riscv-debug-spec
author: BlueTeam Forensics
date: 2026/07/22
tags:
  - attack.credential_access
  - attack.t1005
  - attack.t1210
  - riscv
  - forensics
logsource:
  category: process_creation
  product: linux
detection:
  selection_cmd:
    Image|endswith:
      - '/openocd'
      - '/riscv64-unknown-elf-gdb'
  selection_debug_actions:
    CommandLine|contains:
      - 'reg pmpcfg'
      - 'reg pmpaddr'
      - 'reg mstatus'
      - 'reg mtvec'
      - 'dump_image'
      - 'load_image'
      - 'flash write'
      - 'mdb '
      - 'mwb '
      - 'reset halt'
  condition: selection_cmd and selection_debug_actions
  timeframe: 5m
level: high
falsepositives:
  - Legitimate firmware development activities
  - Authorized security audit procedures
```

```yaml
title: RISC-V Firmware Integrity Mismatch
id: riscv-firmware-integrity-002
status: experimental
description: Detects firmware integrity verification failures on RISC-V devices
author: BlueTeam Forensics
date: 2026/07/22
tags:
  - attack.defense_evasion
  - attack.t1027
  - riscv
  - forensics
logsource:
  category: file_integrity
  product: linux
detection:
  selection:
    EventType:
      - 'FileModified'
      - 'FileCreated'
    TargetFilename|contains:
      - '/dev/mtd'
      - '/sys/firmware'
      - '/opt/riscv_firmware'
  condition: selection
  timeframe: 1h
level: critical
falsepositives:
  - Authorized firmware update procedures
```

### Bash 脚本：RISC-V 固件完整性自动扫描器

```bash
#!/bin/bash
FIRMWARE_FILE=$1
KNOWN_GOOD_DB=$2
OUTPUT_DIR="riscv_fw_scan_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUTPUT_DIR"

if [ ! -f "$FIRMWARE_FILE" ]; then
    echo "[!] Usage: $0 <firmware_file> [known_good_db]"
    exit 1
fi

echo "[*] RISC-V Firmware Integrity Scanner"
echo "[*] Target: $FIRMWARE_FILE"
echo "[*] File size: $(stat -f%z "$FIRMWARE_FILE") bytes"

FW_HASH=$(sha256sum "$FIRMWARE_FILE" | awk '{print $1}')
echo "[*] SHA256: $FW_HASH"

echo "[*] Scanning for ELF header..."
head -c 4 "$FIRMWARE_FILE" | xxd | head -1 > "$OUTPUT_DIR/header.txt"

echo "[*] Extracting strings..."
strings "$FIRMWARE_FILE" > "$OUTPUT_DIR/strings.txt"
STRINGS_COUNT=$(wc -l < "$OUTPUT_DIR/strings.txt")
echo "[*] Extracted $STRINGS_COUNT strings"

echo "[*] Scanning for suspicious strings..."
grep -iE "(jtag|openocd|gdb|debug|backdoor|shell|password|secret|key|token)" \
  "$OUTPUT_DIR/strings.txt" > "$OUTPUT_DIR/suspicious_strings.txt"
SUSPIC_COUNT=$(wc -l < "$OUTPUT_DIR/suspicious_strings.txt")
echo "[*] Found $SUSPIC_COUNT suspicious strings"

echo "[*] Scanning for RISC-V custom instructions..."
python3 -c "
import struct, sys
CUSTOM_OPCODES = {0x0B, 0x2B, 0x5B, 0x7B}
count = 0
with open('$FIRMWARE_FILE', 'rb') as f:
    data = f.read()
for i in range(0, len(data) - 3, 4):
    word = struct.unpack('<I', data[i:i+4])[0]
    if (word & 0x7F) in CUSTOM_OPCODES:
        count += 1
        print(f'  Custom inst at offset 0x{i:08x}: {hex(word)}')
print(f'Total custom instructions found: {count}')
" > "$OUTPUT_DIR/custom_instructions.txt"

echo "[*] Running binwalk analysis..."
binwalk "$FIRMWARE_FILE" > "$OUTPUT_DIR/binwalk.txt" 2>&1

echo "[*] Checking for known backdoor patterns..."
YARA_RESULT=""
if command -v yara &> /dev/null; then
    if [ -f "riscv_backdoor.yar" ]; then
        yara riscv_backdoor.yar "$FIRMWARE_FILE" > "$OUTPUT_DIR/yara_results.txt" 2>&1
        echo "[*] YARA scan results saved."
    fi
fi

echo "[*] Analyzing code entropy..."
python3 -c "
import math, collections
with open('$FIRMWARE_FILE', 'rb') as f:
    data = f.read()
entropy_vals = []
block_size = 256
for i in range(0, len(data), block_size):
    block = data[i:i+block_size]
    freq = collections.Counter(block)
    e = -sum((c/len(block)) * math.log2(c/len(block)) for c in freq.values())
    entropy_vals.append(e)
high_entropy = sum(1 for e in entropy_vals if e > 7.5)
print(f'Entropy blocks: {len(entropy_vals)}')
print(f'High entropy blocks (>7.5): {high_entropy}')
if high_entropy > 0:
    print('[!] WARNING: High entropy regions detected - possible encryption/packing')
" > "$OUTPUT_DIR/entropy_analysis.txt"

echo ""
echo "[*] === SCAN COMPLETE ==="
echo "[*] Results saved to: $OUTPUT_DIR/"
echo "[*] Suspicious strings: $SUSPIC_COUNT"
cat "$OUTPUT_DIR/custom_instructions.txt"
cat "$OUTPUT_DIR/entropy_analysis.txt"
```

### Python 脚本：PMP 配置异常检测器

```python
import json
import sys
import hashlib
from datetime import datetime

PMP_CONFIG_BASELINES = {
    "esp32c3": {
        "pmpcfg": [0x0000001F, 0x00000000, 0x00000000, 0x00000000],
        "pmpaddr": [0x00000000, 0x10000000, 0x00000000, 0x00000000,
                     0x00000000, 0x00000000, 0x00000000, 0x00000000,
                     0x00000000, 0x00000000, 0x00000000, 0x00000000,
                     0x00000000, 0x00000000, 0x00000000, 0x00000000],
        "description": "ESP32-C3 default PMP configuration"
    },
    "gd32vf103": {
        "pmpcfg": [0x0000001F, 0x0000001B, 0x00000000, 0x00000000],
        "pmpaddr": [0x00000000, 0x10000000, 0x00000000, 0x20000000,
                     0x30000000, 0x00000000, 0x00000000, 0x00000000,
                     0x00000000, 0x00000000, 0x00000000, 0x00000000,
                     0x00000000, 0x00000000, 0x00000000, 0x00000000],
        "description": "GD32VF103 default PMP configuration"
    }
}

def parse_pmpcfg(val):
    entries = []
    for i in range(4):
        byte = (val >> (i * 8)) & 0xFF
        entries.append({
            'R': bool(byte & 0x01),
            'W': bool(byte & 0x02),
            'X': bool(byte & 0x04),
            'A': (byte >> 3) & 0x03,
            'L': bool(byte & 0x40)
        })
    return entries

def detect_anomalies(pmpcfg, pmpaddr, chip_type=None):
    findings = []

    all_entries = []
    for reg_idx, cfg_val in enumerate(pmpcfg):
        entries = parse_pmpcfg(cfg_val)
        for i, e in enumerate(entries):
            e['idx'] = reg_idx * 4 + i
            all_entries.append(e)

    for e in all_entries:
        if e['A'] == 0:
            continue
        if e['R'] and e['W'] and e['X']:
            findings.append({
                'level': 'critical',
                'type': 'RWX_PERMISSION',
                'detail': f"PMP[{e['idx']}] has RWX all permissions enabled",
                'mitre': 'T1562.001'
            })
        if e['R'] and not e['L']:
            findings.append({
                'level': 'medium',
                'type': 'UNLOCKED_READ',
                'detail': f"PMP[{e['idx']}] read permission without lock"
            })

    if chip_type and chip_type in PMP_CONFIG_BASELINES:
        baseline = PMP_CONFIG_BASELINES[chip_type]
        for i in range(4):
            if pmpcfg[i] != baseline['pmpcfg'][i]:
                findings.append({
                    'level': 'high',
                    'type': 'CONFIG_DEVIATION',
                    'detail': f"pmpcfg{i} deviates from baseline: "
                              f"got {hex(pmpcfg[i])}, expected {hex(baseline['pmpcfg'][i])}",
                    'mitre': 'T1562.001'
                })
        for i in range(16):
            if pmpaddr[i] != baseline['pmpaddr'][i]:
                findings.append({
                    'level': 'medium',
                    'type': 'ADDR_DEVIATION',
                    'detail': f"pmpaddr{i} deviates from baseline: "
                              f"got {hex(pmpaddr[i])}, expected {hex(baseline['pmpaddr'][i])}"
                })

    return findings

def generate_report(findings, chip_type, output_file):
    report = {
        'timestamp': datetime.now().isoformat(),
        'chip_type': chip_type,
        'total_findings': len(findings),
        'critical': sum(1 for f in findings if f.get('level') == 'critical'),
        'high': sum(1 for f in findings if f.get('level') == 'high'),
        'medium': sum(1 for f in findings if f.get('level') == 'medium'),
        'findings': findings
    }

    with open(output_file, 'w') as f:
        json.dump(report, f, indent=2)

    print(f"\n{'='*60}")
    print(f"PMP Configuration Forensic Report")
    print(f"{'='*60}")
    print(f"Chip Type:     {chip_type}")
    print(f"Findings:      {len(findings)}")
    print(f"Critical:      {report['critical']}")
    print(f"High:          {report['high']}")
    print(f"Medium:        {report['medium']}")
    print(f"{'='*60}\n")

    for f in findings:
        level_str = f.get('level', 'info').upper()
        print(f"[{level_str}] {f['type']}: {f['detail']}")
        if 'mitre' in f:
            print(f"         MITRE ATT&CK: {f['mitre']}")
        print()

    return report

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <pmp_dump_file> [chip_type]")
        print(f"  chip_type: esp32c3, gd32vf103")
        sys.exit(1)

    chip_type = sys.argv[2] if len(sys.argv) > 2 else None

    pmpcfg = [0] * 4
    pmpaddr = [0] * 16

    with open(sys.argv[1], 'rb') as f:
        data = f.read()
    if len(data) >= 80:
        import struct
        for i in range(4):
            pmpcfg[i] = struct.unpack('<I', data[i*4:(i+1)*4])[0]
        for i in range(16):
            pmpaddr[i] = struct.unpack('<I', data[16+i*4:20+i*4])[0]

    findings = detect_anomalies(pmpcfg, pmpaddr, chip_type)
    output_file = f"pmp_forensic_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    generate_report(findings, chip_type or 'unknown', output_file)
```

### YARA 规则：RISC-V 固件后门特征匹配

```yara
rule RISC-V_Debug_Backdoor {
    meta:
        description = "Detects RISC-V debug module backdoor patterns"
        author = "BlueTeam Forensics"
        date = "2026/07/22"
        reference = "RISC-V Debug Spec v0.13"
        mitre_attack = "T1542, T1210"
    strings:
        $debug_module_addr = { 00 01 00 00 }
        $sba_read_pattern = { 23 20 ?? ?? 3C }
        $abstract_cmd = { 23 20 ?? ?? 1C }
        $pmp_open_wide = { 1F 00 00 00 }
        $jtag_string = "JTAG" ascii nocase
        $openocd_str = "openocd" ascii nocase
        $custom_opcode_c0 = { ?? ?? ?? 0B }
        $custom_opcode_c1 = { ?? ?? ?? 2B }
    condition:
        uint32(0) == 0x464C457F and
        (2 of ($debug*, $sba*, $abstract*) or
         $pmp_open_wide or
         (1 of ($jtag*, $openocd*) and 1 of ($custom_opcode*)))
}

rule RISC-V_Custom_Instruction_Implant {
    meta:
        description = "Detects potential custom instruction implants in RISC-V firmware"
        author = "BlueTeam Forensics"
        date = "2026/07/22"
        mitre_attack = "T1195, T1027"
    strings:
        $c0_0 = { ?? 00 00 0B }
        $c0_1 = { ?? 00 80 0B }
        $c1_0 = { ?? 00 00 2B }
        $c1_1 = { ?? 00 80 2B }
        $c2_0 = { ?? 00 00 5B }
        $c3_0 = { ?? 00 00 7B }
    condition:
        #c0_0 + #c0_1 + #c1_0 + #c1_1 + #c2_0 + #c3_0 > 10
}

rule RISC-V_Secure_Boot_Bypass {
    meta:
        description = "Detects RISC-V secure boot bypass indicators"
        author = "BlueTeam Forensics"
        date = "2026/07/22"
        mitre_attack = "T1542.001, T1562.001"
    strings:
        $mtvec_mod = { 35 00 ?? ?? }
        $mstatus_mod = { 33 30 ?? ?? }
        $pmpcfg_write = { 30 30 ?? ?? 23 }
        $open_sbi_bypass = "opensbi" ascii nocase
        $secure_boot_off = "secure_boot=0" ascii nocase
    condition:
        uint32(0) == 0x464C457F and
        ($mtvec_mod and $mstatus_mod) or
        ($pmpcfg_write and $secure_boot_off)
}
```

---

## 0x0B 公开案例分析

### 案例一：RISC-V SoC调试接口漏洞研究

#### 事件概述

2024年，多个安全研究团队披露了针对RISC-V SoC调试接口的系统性安全研究。其中以对SiFive HiFive Unmatched和StarFive VisionFive 2开发板的Debug Module安全评估最为深入。研究人员发现多个RISC-V SoC在出厂默认配置下，Debug Authentication机制未正确启用，允许任何持有物理JTAG访问权限的操作者绕过芯片的安全策略，直接读取全部内存并执行任意代码。

#### 攻击链描述

| 阶段 | 攻击操作 | MITRE ATT&CK | 技术细节 |
|-----|---------|-------------|---------|
| 1. 物理接入 | 识别并连接JTAG接口 | T1200 | 使用JTAGulator识别TDI/TDO/TCK/TMS引脚 |
| 2. 调试连接 | 通过OpenOCD建立调试会话 | T1210 | 使用`riscv.cpu`目标配置连接Debug Module |
| 3. 认证绕过 | 利用默认开放的Debug Authentication | T1190 | 无需密码直接执行Abstract Commands |
| 4. 内存读取 | 通过SBA读取Flash和RAM内容 | T1005 | 使用`dump_image`命令提取全部固件 |
| 5. 密钥提取 | 读取OTP/eFuse中的加密密钥 | T1552 | 定位OTP内存区域并解析密钥值 |
| 6. 持久化 | 篡改Bootloader实现持久化 | T1542.001 | 修改OpenSBI固件注入后门逻辑 |
| 7. 清除痕迹 | 关闭JTAG后门并重新锁定 | T1070 | 通过eFuse烧录永久禁用调试接口 |

#### 取证发现

```
[forensic-analysis]$ openocd -f riscv_debug.cfg -c "init; halt; reg mstatus"
mstatus: 0x0000000000000000
  [debug_mode] Debug mode: ACTIVE
  [mie] Machine interrupt enable: 0
  [mpie] Previous MIE: 0

[forensic-analysis]$ openocd -c "dump_image extracted_flash.bin 0x20000000 0x400000"
[forensic-analysis]$ strings extracted_flash.bin | grep -i "debug"
DEBUG_AUTH_DISABLED=1
JTAG_OPEN=1
SECURE_BOOT=0
```

| 取证指标 | 发现内容 | 证据等级 | MITRE ATT&CK |
|---------|---------|---------|-------------|
| Debug Authentication状态 | 默认禁用（开放） | 🟢 需要关注 | T1210 |
| Secure Boot标志 | 未启用 | 🟡 高度可疑 | T1542.001 |
| 异常字符串 | `DEBUG_AUTH_DISABLED=1` | 🔴 确认恶意 | T1027 |
| OTP/eFuse区域 | 密钥区域未烧录 | 🟡 高度可疑 | T1552 |

#### 取证分析流程

```bash
sha256sum extracted_flash.bin
riscv64-unknown-elf-objdump -D -b binary -m riscv:rv32 extracted_flash.bin > disasm.txt

grep -n "CUSTOM\|0b$\|2b$\|5b$\|7b$" disasm.txt > custom_inst_hits.txt

radiff2 -s firmware_known_good.bin extracted_flash.bin

python3 pmp_analyzer.py pmp_dump.bin esp32c3
```

#### IOC 清单

| IOC类型 | IOC值 | 描述 |
|--------|------|------|
| 文件哈希 | `a1b2c3...d4e5f6` | 异常固件SHA256 |
| 字符串 | `DEBUG_AUTH_DISABLED` | 后门配置标志 |
| 偏移 | `0x20001000` | OpenSBI篡改起始位置 |
| 自定义指令 | opcode=0x0B, funct7=0x7E | 未知自定义指令编码 |

#### 经验教训

1. **默认配置即攻击面**：RISC-V SoC的Debug Authentication默认开放策略是系统性安全风险，芯片厂商应在出厂时默认禁用调试接口。
2. **调试接口即后门**：物理调试接口可以完全绕过芯片的所有安全机制，等同于硬件级别的持久化后门。
3. **OTP/eFuse不可忽视**：安全关键配置（如Secure Boot、Debug Disable）应通过一次性可编程存储器（OTP/eFuse）固化，防止被软件修改。
4. **供应链信任问题**：即使使用开源RISC-V Core，SoC集成阶段的调试接口配置不当仍会导致严重的安全漏洞。

### 案例二：ESP32-C3 设备固件篡改事件

#### 事件概述

2024年下半年，某智能家居设备制造商的ESP32-C3 WiFi模块被发现在供应链环节中遭受固件篡改。攻击者在设备的OTA更新服务器上替换了合法固件，注入了后门程序。由于设备的OTA验证机制未正确配置，数千台设备在自动更新后被植入了隐蔽的网络隧道，用于中继内网流量至外部C2服务器。

#### 攻击链描述

| 阶段 | 攻击操作 | MITRE ATT&CK | 技术细节 |
|-----|---------|-------------|---------|
| 1. 供应链入侵 | 篡改OTA更新服务器固件文件 | T1195.002 | 替换Flash镜像中的应用分区 |
| 2. 固件注入 | 在FreeRTOS任务中嵌入C2隧道 | T1059 | 利用WiFi STA模式建立TCP隧道 |
| 3. 安全绕过 | 利用未验证的签名跳过完整性检查 | T1562.001 | 固件头中的SHA256字段被更新为恶意哈希 |
| 4. 持久化 | 利用ESP-IDF的OTA机制实现持久化 | T1542 | 后门固件作为合法更新持续传播 |
| 5. 横向移动 | 通过内网设备进行DNS重绑定攻击 | T1557 | 利用mDNS协议发现内网服务 |

#### 取证发现

通过JTAG接口从受影响设备提取固件后，取证分析团队发现了以下关键指标：

```bash
esptool.py --chip esp32c3 read_flash 0x0 0x400000 affected_device.bin
sha256sum affected_device.bin
binwalk affected_device.bin
```

```
DECIMAL       HEXADECIMAL     DESCRIPTION
-----------------------------------------------------------
0             0x0             ESP32-C3 bootloader header
8192          0x2000          ESP32-C3 application image
65536         0x10000         ESP32-C3 OTA data partition
```

| 取证指标 | 发现内容 | 证据等级 | MITRE ATT&CK |
|---------|---------|---------|-------------|
| 固件SHA256 | 与官方固件不匹配 | 🔴 确认恶意 | T1027 |
| 字符串分析 | 发现`connect("c2.example.com", 443)` | 🔴 确认恶意 | T1071 |
| 网络连接 | 异常TCP外连至`185.x.x.x:443` | 🔴 确认恶意 | T1571 |
| 函数结构 | FreeRTOS任务中嵌入网络隧道函数 | 🔴 确认恶意 | T1059 |
| PMP配置 | 默认配置未变更 | 🟢 需要关注 | —— |
| eFuse状态 | Debug接口未禁用 | 🟢 需要关注 | T1210 |

#### 固件逆向分析

使用Ghidra对提取的固件进行逆向分析，定位后门代码：

```python
import r2pipe

r2 = r2pipe.open("affected_device.bin")
r2.cmd("aaa")
r2.cmd("e asm.arch=riscv")
r2.cmd("e asm.bits=32")

functions = r2.cmdj("aflj")
for func in functions:
    if 'c2' in func['name'].lower() or 'tunnel' in func['name'].lower():
        print(f"[SUSPICIOUS] Function: {func['name']} at {hex(func['offset'])}")

disasm = r2.cmd("pdf @ 0x420000")
print(disasm)
```

#### IOC 清单

| IOC类型 | IOC值 | 描述 |
|--------|------|------|
| 文件哈希 | `e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0` | 恶意固件SHA256 |
| C2地址 | `185.x.x.x:443` | 外部C2服务器 |
| 域名 | `c2.example.com` | C2域名 |
| 网络端口 | TCP/443 | 隧道通信端口 |
| 函数名 | `wifi_tunnel_task` | 后门任务函数 |
| 字符串 | `POST /api/data HTTP/1.1` | 数据外传协议 |
| mDNS | `_http._tcp.local` | 内网服务发现 |

#### 经验教训

1. **OTA签名验证不可省略**：ESP-IDF提供了完整的Secure Boot和签名验证框架，但实际部署中常被跳过以降低复杂度。
2. **固件哈希校验是底线**：即使不实施完整的签名验证，至少应对固件进行SHA256校验并与已知良好基线比对。
3. **网络行为监控不可缺**：IoT设备的异常外连行为应在网络层面进行检测和告警。
4. **供应链多点防御**：从固件开发到OTA分发的每个环节都需要实施完整性验证。

### 案例三：RISC-V FPGA 软核RTL级后门植入

#### 事件概述

2023年，某FPGA安全研究团队在对采用开源PicoRV32 RISC-V软核的定制SoC进行安全审计时，发现了RTL源码中被植入的硬件后门。攻击者通过入侵开发者的Git仓库，在RTL代码中添加了一个隐蔽的调试接口，该接口在综合后的FPGA bitstream中激活了一个未声明的JTAG TAP，允许攻击者在不需要物理接触设备的情况下远程访问SoC的全部内存空间。

#### 取证发现

| 取证指标 | 发现内容 | 证据等级 | MITRE ATT&CK |
|---------|---------|---------|-------------|
| RTL代码差异 | Git diff发现隐藏的`debug_tap.v`模块 | 🔴 确认恶意 | T1195 |
| 综合后网表 | 新增未声明的状态机逻辑 | 🔴 确认恶意 | T1195 |
| FPGA比特流 | LUT配置中存在异常逻辑 | 🔴 确认恶意 | T1195 |
| Git提交历史 | 提交者邮箱为已泄露的开发者账号 | 🟡 高度可疑 | T1199 |

#### 经验教训

1. **RTL代码审计不可替代**：开源RISC-V Core的可审计性是其核心安全优势，但需要有组织地实施代码审查。
2. **形式验证的价值**：使用riscv-formal等工具对RTL代码进行形式化验证，可以自动检测出不符合ISA规范的行为。
3. **Git仓库安全**：开发人员的Git仓库应实施多因素认证和提交签名验证（GPG/SSH signing）。
4. **综合前后比对**：在RTL综合后，应对比综合前后的功能行为是否一致。

---

## 0x0C RISC-V安全取证最佳实践

### 取证检查清单

| 阶段 | 检查项 | 工具 | 输出 |
|-----|--------|------|------|
| 设备识别 | 确认芯片型号和RISC-V Core类型 | 丝印查看、`misa` CSR读取 | 芯片信息 |
| 环境搭建 | 安装RISC-V工具链和调试工具 | apt/pip安装 | 可用工具集 |
| 接口发现 | JTAG/SWD引脚探测和识别 | JTAGulator, 万用表 | 引脚映射 |
| 调试连接 | 建立调试会话并读取状态 | OpenOCD, GDB | CSR快照 |
| 固件提取 | 通过调试接口或SPI读取Flash | OpenOCD, flashrom | 固件镜像 |
| 内存转储 | 读取RAM中的运行时数据 | OpenOCD | RAM镜像 |
| PMP审计 | 解析并比对PMP配置 | Python脚本 | PMP报告 |
| 自定义指令扫描 | 检测非标准指令编码 | Python脚本 | 指令扫描报告 |
| 固件逆向 | 反汇编分析关键函数 | Ghidra, radare2 | 函数分析 |
| 后门检测 | 搜索已知后门特征 | YARA, strings | 匹配结果 |
| 证据归档 | 哈希链和完整取证记录 | sha256sum, 审计日志 | 取证报告 |

### 安全加固建议

| 加固措施 | 优先级 | 适用场景 | 实施难度 |
|---------|-------|---------|---------|
| 禁用调试接口 | P0 | 所有生产设备 | 低——通过eFuse烧录 |
| 启用Secure Boot | P0 | 所有需要OTA的设备 | 中——需要密钥管理 |
| 配置PMP Lock位 | P1 | M模式固件 | 低——启动时设置 |
| 自定义指令审计 | P1 | 使用定制RISC-V Core | 高——需要RTL审计 |
| 固件签名验证 | P1 | OTA更新场景 | 中——集成签名库 |
| JTAG物理保护 | P2 | 高安全需求设备 | 中——PCB设计层面 |
| OTP密钥烧录 | P2 | 密钥存储场景 | 低——一次性烧录 |
| 侧信道防护 | P3 | 密码学运算场景 | 高——需要硬件设计 |

### MITRE ATT&CK 映射总结

| MITRE ATT&CK 技术 | 技术名称 | RISC-V 相关攻击场景 |
|-------------------|---------|-------------------|
| T1005 | Data from Local System | 通过JTAG/SBA读取Flash/RAM数据 |
| T1027 | Obfuscated Files or Information | 自定义指令混淆固件逆向分析 |
| T1055 | Process Injection | Debug Module强制CPU执行注入代码 |
| T1059 | Command and Scripting Interpreter | UART Shell获取命令执行 |
| T1071 | Application Layer Protocol | IoT设备C2通信隧道 |
| T1082 | System Information Discovery | 读取`misa` CSR获取芯片信息 |
| T1190 | Exploit Public-Facing Application | 利用开放的JTAG接口入侵 |
| T1195 | Supply Chain Compromise | RTL源码/固件OTA篡改 |
| T1199 | Trusted Relationship | 利用开发者Git仓库信任关系 |
| T1200 | Hardware Additions | 物理侧信道和故障注入 |
| T1210 | Exploitation of Remote Services | 远程调试接口利用 |
| T1542 | Pre-OS Boot | Boot ROM/Bootloader级后门植入 |
| T1552 | Credentials In Files | OTP/eFuse中密钥提取 |
| T1557 | Adversary-in-the-Middle | 内网流量中继 |
| T1562 | Impair Defenses | PMP配置篡改绕过安全策略 |
| T1571 | Non-Standard Port | 利用非标准端口建立C2通道 |

---

## 0x0D 参考资料

| 编号 | 资料名称 | 链接 | 类型 |
|-----|---------|------|------|
| 1 | RISC-V Privileged Architecture Specification v1.12 | https://riscv.org/technical/specifications/ | 官方规范 |
| 2 | RISC-V Debug Specification v0.13 | https://github.com/riscv/riscv-debug-spec | 官方规范 |
| 3 | RISC-V ISA手册（Volume 1: Unprivileged ISA） | https://riscv.org/technical/specifications/ | 官方规范 |
| 4 | OpenSBI Documentation | https://github.com/riscv-software-src/opensbi | 工具文档 |
| 5 | OpenOCD RISC-V Support | https://openocd.org/doc/pdf/openocd.pdf | 工具文档 |
| 6 | Ghidra RISC-V Processor Module | https://ghidra-sre.org/ | 工具文档 |
| 7 | "A Survey on RISC-V Security" (ACM Computing Surveys, 2023) | https://dl.acm.org/doi/10.1145/3600007 | 学术论文 |
| 8 | "RISC-V Hardware Security: Challenges and Opportunities" (IEEE HOST 2023) | https://ieeexplore.ieee.org/ | 学术论文 |
| 9 | ESP32-C3 Security Summary | https://www.espressif.com/sites/default/files/documentation/esp32-c3_datasheet_en.pdf | 芯片文档 |
| 10 | GD32VF103 User Manual | https://www.gigadevice.com/manual/GD32VF103/ | 芯片文档 |
| 11 | RISC-V Formal Verification Framework | https://github.com/chipsalliance/riscv-formal | 安全工具 |
| 12 | Nuclei RISC-V Core Security Advisory | https://www.nucleisys.com/ | 安全公告 |
| 13 | Caliptra Open-Source Root of Trust | https://github.com/chipsalliance/caliptra | 安全框架 |
| 14 | Keystone Enclave Framework | https://keystone-enclave.org/ | TEE框架 |
| 15 | Penglai Enclave for RISC-V | https://github.com/Penglai-Enclave/Penglai-Enclave | TEE框架 |