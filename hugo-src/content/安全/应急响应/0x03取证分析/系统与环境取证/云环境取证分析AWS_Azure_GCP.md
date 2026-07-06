---
title: "云环境取证分析（AWS/Azure/GCP）"
date: 2026-07-01T10:00:00+08:00
draft: false
weight: 460
description: "围绕 AWS、Azure、GCP 三大云平台的取证分析，深入分析 CloudTrail/Azure Activity Log/GCP Audit Log 日志分析、云存储取证、IAM 操作审计、容器服务取证、Serverless 函数取证等技术。"
categories: ["应急响应", "取证分析"]
tags: ["AWS", "Azure", "GCP", "CloudTrail", "云取证", "IAM", "容器服务", "Serverless"]
---

# 云环境取证分析（AWS/Azure/GCP）

当安全事件发生在 AWS、Azure 或 GCP 这类公有云平台时，传统基于磁盘镜像和内存转储的取证方法论需要大幅度调整。云环境中的取证证据高度依赖平台提供的审计日志、访问记录、配置快照和运行时元数据——这些数据往往分布在多个服务、多个区域甚至多个云平台之间。攻击者利用泄露的 IAM 凭据、被劫持的 CI/CD 流水线、或者配置错误的存储桶实施入侵后，可能在不触碰任何一台物理主机的情况下完成数据窃取、持久化部署和横向扩展。

本文聚焦于 AWS、Azure、GCP 三大云平台的取证分析全流程：从审计日志架构解析到日志查询实战、从云存储取证到 IAM 操作审计、从容器服务取证到 Serverless 函数取证、从证据强度分层到自动化检测脚本编写。目标是构建一套覆盖三大云平台的完整取证方法论，帮助安全从业者在云环境安全事件中快速定位攻击路径、提取关键证据、还原攻击链。

---

## 0x01 云环境取证概述

### 1. 云取证的定义与挑战

云取证（Cloud Forensics）是在云计算环境中进行的数字取证活动，涵盖对云平台审计日志、运行时状态、网络流量、存储数据和身份操作的收集、保全、分析和报告。与传统取证相比，云取证面临三大核心挑战：

**数据易失性**

云资源具有高度动态性。EC2 实例可能被自动伸缩组终止、Lambda 函数可能在执行后释放运行时环境、容器可能被编排平台重新调度。这意味着取证人员必须在事件发生后迅速完成证据保全，否则关键运行时数据可能永久丢失。与传统磁盘取证中"先做镜像再慢慢分析"的流程不同，云取证要求实时或近实时的日志导出和快照捕获能力。

**多租户隔离**

云平台采用多租户架构，底层基础设施对租户完全透明。取证人员无法像传统取证那样直接访问物理硬件、网络设备或存储介质。所有取证操作必须通过云平台提供的 API 和管理控制台完成。这种间接性既带来了操作上的限制，也意味着取证证据的可信度高度依赖于云平台自身的日志完整性和防篡改机制。

**地理分布**

云资源可能分布在多个区域（Region）甚至多个可用区（Availability Zone）。攻击者可能在 A 区域获取凭据，然后从 B 区域的实例发起攻击，最终将数据复制到 C 区域的存储桶中。取证工作需要跨区域、跨服务甚至跨云平台进行日志关联分析，这极大地增加了取证的复杂度和时间成本。

### 2. 云取证与传统取证的区别

| 对比维度 | 传统取证 | 云取证 |
|---------|---------|--------|
| 证据来源 | 磁盘镜像、内存转储、网络包 | 审计日志、API 调用记录、配置快照 |
| 保全方式 | 物理封存、写保护、哈希校验 | API 导出、日志归档、快照复制 |
| 分析工具 | Autopsy、Volatility、Wireshark | Athena/Log Analytics/BigQuery、CloudTrail Explorer |
| 时间精度 | 文件系统时间戳（秒级） | API 调用时间戳（毫秒级） |
| 法律管辖 | 单一司法管辖区 | 可能跨多个司法管辖区 |
| 证据完整性 | 物理封存保证 | 依赖云平台日志防篡改机制 |
| 攻击面 | 本地系统漏洞 | IAM 配置、API 暴露面、云服务配置 |

### 3. 云平台共享责任模型

云取证的范围界定取决于共享责任模型。以 AWS 为例：

| 责任方 | IaaS（EC2） | PaaS（Elastic Beanstalk） | SaaS（S3 托管网站） |
|--------|-----------|--------------------------|---------------------|
| 客户责任 | OS、应用、数据、网络配置、IAM | 应用代码、数据、IAM | 数据、IAM 配置 |
| AWS 责任 | 物理设施、虚拟化层、网络 | 运行时、OS、物理设施 | 应用、运行时、OS、物理设施 |

取证范围的界定直接影响证据收集的权限和能力。在 IaaS 层面，取证人员可以获取完整的操作系统级日志；在 PaaS 和 SaaS 层面，取证范围被限制在平台提供的日志和 API 记录中。

Azure 和 GCP 的共享责任模型与 AWS 类似，但术语和划分粒度略有不同。Azure 使用"云中的责任"（Your responsibilities in the cloud）框架，GCP 使用"共享 fate"（Shared Fate）模型强调安全是共同责任。

### 4. 云取证的法律和合规考量

**数据驻留与跨境**

不同国家和地区对数据存储位置有严格要求。GDPR 限制欧盟公民数据传输到未充分保护的国家，中国《数据安全法》和《个人信息保护法》对数据出境有明确的审查和评估要求。云取证过程中，导出和传输日志数据需要评估是否涉及跨境数据传输的合规问题。

**证据可采性**

云审计日志作为电子证据，其可采性取决于日志的完整性、防篡改能力和时间戳的可信度。AWS CloudTrail 支持日志文件完整性验证（基于 SHA-256 和 JSON Web 签名），Azure Activity Log 支持通过 Azure Monitor 导出到具有防篡改能力的存储账户，GCP Audit Log 支持通过 Log Router 导出到不可变存储。取证人员需要在调查报告中详细说明日志的来源、导出方式和完整性验证结果。

**监管要求**

金融、医疗、政府等行业有特定的合规要求（如 PCI DSS、HIPAA、等保 2.0），这些要求通常规定了日志保留期限、审计覆盖范围和事件响应流程。云取证工作需要确保调查过程本身符合相关监管要求。

---

## 0x02 AWS CloudTrail 日志分析

### 1. CloudTrail 架构和功能

AWS CloudTrail 是 AWS 平台的核心审计服务，记录了 AWS 账户中几乎所有 API 调用活动。CloudTrail 的架构包含以下关键组件：

**事件源**

每当有人、服务或程序通过 AWS API 执行操作时，CloudTrail 会记录该操作的完整上下文信息。这包括通过 AWS Management Console、AWS CLI、AWS SDK、AWS CloudFormation 和其他 AWS 服务发起的调用。

**事件传送**

CloudTrail 将事件以近实时方式传送到 Amazon S3 存储桶和/或 CloudWatch Logs 日志组。S3 存储桶中的事件以 JSON 格式存储，按 `AWSAccountID/CloudTrail/Region/YYYY/MM/DD/` 路径组织。

**事件存储**

默认情况下，CloudTrail 事件在 S3 中保留 90 天。通过开启"事件数据存储"（Event Data Store），可以将事件保留最长 10 年，并支持跨区域聚合。

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=ConsoleLogin \
  --start-time 2026-06-01T00:00:00Z \
  --end-time 2026-06-30T23:59:59Z \
  --max-results 10
```

### 2. 事件格式和关键字段

每条 CloudTrail 事件包含以下关键字段：

```json
{
  "eventVersion": "1.08",
  "userIdentity": {
    "type": "IAMUser",
    "principalId": "AIDAEXAMPLEID12345678",
    "arn": "arn:aws:iam::123456789012:user/analyst",
    "accountId": "123456789012",
    "userName": "analyst",
    "accessKeyId": "AKIAIOSFODNN7EXAMPLE",
    "sessionContext": {
      "sessionIssuer": {},
      "webIdFederationData": {},
      "attributes": {
        "creationDate": "2026-06-15T08:30:00Z",
        "mfaAuthenticated": "false"
      }
    }
  },
  "eventTime": "2026-06-28T14:23:45Z",
  "eventSource": "s3.amazonaws.com",
  "eventName": "ListBucket",
  "awsRegion": "us-east-1",
  "sourceIPAddress": "203.0.113.50",
  "userAgent": "aws-cli/2.15.0 Python/3.12.0",
  "requestParameters": {
    "bucketName": "sensitive-data-bucket",
    "max-keys": 1000
  },
  "responseElements": {
    "contents": []
  },
  "requestID": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "eventID": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "readOnly": false,
  "eventType": "AwsApiCall",
  "managementEvent": true,
  "recipientAccountId": "123456789012",
  "serviceEventDetails": {},
  "sharedEventId": "",
  "vpcEndpointId": "vpce-0a1b2c3d4e5f67890"
}
```

取证分析中需要重点关注的字段包括：

| 字段 | 取证价值 |
|------|---------|
| `userIdentity` | 识别调用者身份，区分 IAM 用户、角色、临时凭据、根用户 |
| `eventTime` | API 调用的精确时间戳，用于构建事件时间线 |
| `sourceIPAddress` | 调用来源 IP，识别异常地理位置 |
| `userAgent` | 客户端信息，区分 CLI、SDK、控制台、第三方工具 |
| `requestParameters` | 请求参数，判断操作的具体目标和范围 |
| `readOnly` | 标识操作是只读还是写入 |
| `errorCode` | 操作是否失败，失败原因 |
| `errorMessage` | 失败原因详细描述 |

### 3. 管理事件 vs 数据事件

CloudTrail 区分两种事件类型：

**管理事件（Management Events）**

记录控制平面操作，如创建 EC2 实例、修改 IAM 策略、配置安全组等。管理事件默认开启记录，是云取证中最基本也最重要的事件类型。

**数据事件（Data Events）**

记录数据平面操作，如 S3 对象的读写、Lambda 函数的调用、DynamoDB 表的读写等。数据事件默认关闭，需要手动开启。数据事件的量通常远大于管理事件，会产生额外费用。

```bash
aws cloudtrail put-event-selectors \
  --trail-name my-trail \
  --event-selectors '[{
    "ReadWriteType": "All",
    "IncludeManagementEvents": true,
    "DataResources": [{
      "Type": "AWS::S3::Object",
      "Values": ["arn:aws:s3:::sensitive-bucket/"]
    }]
  }]'
```

### 4. CloudTrail Insights

CloudTrail Insights 是 AWS 提供的异常检测功能，能够自动识别 API 调用频率的异常波动。当某个 API 的调用量显著偏离历史基线时，Insights 会生成一个 Insights 事件。

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=DescribeInstances \
  --max-results 5

aws cloudtrail describe-trails \
  --trail-list '[{"Name":"my-trail"}]' \
  --query 'trailList[].InsightsSelectors'
```

Insights 事件的结构中包含 `insightDetails` 字段，描述了异常的起止时间、受影响的 API 和区域：

```json
{
  "insightDetails": {
    "eventSource": "ec2.amazonaws.com",
    "eventName": "RunInstances",
    "insightType": "ApiCallRateInsight",
    "insightEventData": {
      "baseline": {
        "averageEventCount": 15
      },
      "insight": {
        "averageEventCount": 250
      },
      "insightStart": "2026-06-28T00:00:00Z",
      "insightEnd": "2026-06-28T06:00:00Z"
    }
  }
}
```

### 5. 异常 API 调用检测

在取证分析中，以下 API 调用模式需要重点排查：

**高风险 API 操作**

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=CreateAccessKey \
  --max-results 20

aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=AttachUserPolicy \
  --max-results 20

aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=CreatePolicyVersion \
  --max-results 20
```

**异常时间窗口活动**

```bash
aws cloudtrail lookup-events \
  --start-time 2026-06-28T02:00:00Z \
  --end-time 2026-06-28T05:00:00Z \
  --max-results 50 \
  --query 'Events[].{Time:EventTime,User:Username,Event:EventName,Source:EventSource}'
```

**异常地域调用**

```bash
aws cloudtrail lookup-events \
  --start-time 2026-06-28T00:00:00Z \
  --end-time 2026-06-30T23:59:59Z \
  --max-results 100 \
  --query 'Events[?awsRegion != `us-east-1`].{Time:EventTime,Region:awsRegion,Event:EventName,Source:IPAddress}'
```

### 6. CloudTrail 日志分析实战

**使用 Athena 进行大规模日志分析**

将 CloudTrail 日志导出到 S3 后，可以使用 Athena 进行 SQL 查询分析：

```sql
CREATE EXTERNAL TABLE cloudtrail_logs (
  eventVersion STRING,
  userIdentity STRUCT<
    type: STRING,
    principalId: STRING,
    arn: STRING,
    accountId: STRING,
    userName: STRING>,
  eventTime STRING,
  eventSource STRING,
  eventName STRING,
  awsRegion STRING,
  sourceIPAddress STRING,
  userAgent STRING,
  requestParameters STRING,
  responseElements STRING,
  additionalEventData STRING,
  requestId STRING,
  eventId STRING,
  readOnly STRING,
  eventType STRING,
  recipientAccountId STRING,
  vpcEndpointId STRING,
  sharedEventId STRING
)
PARTITIONED BY (region STRING, year STRING, month STRING, day STRING)
ROW FORMAT SERDE 'org.apache.hive.hcatalog.data.JsonSerDe'
LOCATION 's3://my-cloudtrail-bucket/AWSLogs/123456789012/CloudTrail/';
```

**检测从未知 IP 执行的敏感操作**

```sql
SELECT eventTime, userIdentity.userName, eventName, sourceIPAddress, requestParameters
FROM cloudtrail_logs
WHERE eventName IN ('CreateAccessKey', 'AttachUserPolicy', 'CreateLoginProfile', 'UpdateAssumeRolePolicy')
  AND sourceIPAddress NOT IN ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')
  AND year = '2026' AND month = '06' AND day = '28'
ORDER BY eventTime DESC;
```

**检测枚举行为**

```sql
SELECT sourceIPAddress, userIdentity.arn, eventName, COUNT(*) as callCount
FROM cloudtrail_logs
WHERE eventName LIKE '%Describe%' OR eventName LIKE '%List%'
  AND year = '2026' AND month = '06' AND day = '28'
GROUP BY sourceIPAddress, userIdentity.arn, eventName
HAVING COUNT(*) > 100
ORDER BY callCount DESC;
```

---

## 0x03 Azure Activity Log 分析

### 1. Azure Activity Log 架构

Azure Activity Log 是 Azure 平台的核心审计服务，记录了每个订阅中所有控制平面操作。Activity Log 是单租户级别的，每个订阅产生独立的 Activity Log。

Activity Log 的数据流向包括多个出口：

| 出口方式 | 用途 | 保留策略 |
|---------|------|---------|
| Azure Portal | 在线查看最近 90 天 | 90 天 |
| Azure Monitor | 实时流式传输和告警 | 取决于 Log Analytics 工作区保留设置 |
| 事件网格 | 实时事件驱动处理 | 取决于事件订阅 |
| 存储账户 | 长期归档 | 取决于保留策略 |
| Azure Monitor Logs | 长期查询分析 | 可配置最长 2 年 |

```powershell
Get-AzActivityLog -ResourceGroup "myRG" -MaxRecordCount 10 | Format-Table EventTimestamp, OperationName, Caller, Status
```

### 2. 事件类别和子类别

Azure Activity Log 将事件分为多个类别：

| 事件类别 | 描述 | 取证价值 |
|---------|------|---------|
| Administrative | 资源管理操作（创建、修改、删除） | 最主要的取证来源 |
| Security | 安全相关事件（Azure Defender 警报） | 攻击检测和确认 |
| ServiceHealth | 服务健康事件和维护公告 | 排除平台自身问题 |
| Alert | Azure Monitor 警告触发 | 关联安全告警 |
| Autoscale | 自动伸缩事件 | 环境变更追踪 |
| ResourceHealth | 资源健康状态变更 | 故障排查 |

每个事件类别下还有子类别，例如 Administrative 包含：

```json
{
  "channels": "Operation",
  "correlationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "eventTimestamp": "2026-06-28T14:23:45.1234567Z",
  "level": "Informational",
  "location": "eastus",
  "operationName": {
    "value": "Microsoft.Authorization/roleAssignments/write",
    "localizedValue": "创建或更新角色分配"
  },
  "resourceGroupName": "production-rg",
  "resourceProviderName": {
    "value": "Microsoft.Authorization",
    "localizedValue": "Azure Authorization"
  },
  "resourceType": {
    "value": "Microsoft.Authorization/roleAssignments",
    "localizedValue": "角色分配"
  },
  "status": {
    "value": "Succeeded",
    "localizedValue": "成功"
  },
  "subStatus": {
    "value": "",
    "localizedValue": ""
  },
  "caller": "admin@contoso.com",
  "claims": {
    "name": "admin@contoso.com",
    "http://schemas.microsoft.com/identity/claims/objectidentifier": "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
    "http://schemas.microsoft.com/claims/authmethodsincludes": "pwd"
  },
  "httpRequest": {
    "clientRequestId": "req-a1b2c3d4",
    "clientIpAddress": "203.0.113.50",
    "method": "PUT",
    "url": "https://management.azure.com/subscriptions/xxx/providers/Microsoft.Authorization/roleAssignments/xxx"
  }
}
```

### 3. Azure Activity Log 与 Azure Monitor

Azure Monitor 是 Azure 的统一监控平台，可以对 Activity Log 进行实时分析和告警。通过将 Activity Log 流式传输到 Log Analytics 工作区，可以使用 Kusto Query Language (KQL) 进行高级查询：

```kusto
AzureActivity
| where TimeGenerated > ago(24h)
| where Category == "Administrative"
| where OperationNameValue has_any ("roleAssignments/write", "roleAssignments/delete", "deployments/write")
| project TimeGenerated, Caller, OperationNameValue, ResourceGroup, Status, HTTPRequest
| order by TimeGenerated desc
```

**检测异常的 RBAC 变更**

```kusto
AzureActivity
| where TimeGenerated > ago(7d)
| where Category == "Administrative"
| where OperationNameValue has "roleAssignments"
| extend ParsedClaims = parse_json(Claims)
| project TimeGenerated, Caller, OperationNameValue, ResourceGroup, Properties
| order by TimeGenerated desc
```

**检测非工作时间的管理操作**

```kusto
AzureActivity
| where TimeGenerated > ago(24h)
| where Category == "Administrative"
| extend Hour = hourofday(TimeGenerated)
| where Hour < 6 or Hour > 22
| project TimeGenerated, Caller, OperationNameValue, ResourceGroup, Properties
| order by TimeGenerated desc
```

### 4. 异常操作检测

**异常的权限变更**

```kusto
AzureActivity
| where TimeGenerated > ago(7d)
| where OperationNameValue has_any (
    "Microsoft.Authorization/roleAssignments/write",
    "Microsoft.Authorization/roleAssignments/delete",
    "Microsoft.Authorization/roleDefinitions/write",
    "Microsoft.Authorization/policyAssignments/write"
  )
| summarize Count = count() by Caller, bin(TimeGenerated, 1h)
| where Count > 5
| order by TimeGenerated desc
```

**异常的资源创建**

```kusto
AzureActivity
| where TimeGenerated > ago(24h)
| where Category == "Administrative"
| where OperationNameValue has "write" or OperationNameValue has "create"
| where ResourceProviderValue has_any ("Microsoft.Compute", "Microsoft.Network", "Microsoft.Storage")
| summarize Count = count() by Caller, ResourceProviderValue, bin(TimeGenerated, 1h)
| order by Count desc
```

### 5. Azure Activity Log 分析实战

**使用 Azure CLI 导出 Activity Log**

```bash
az monitor activity-log list \
  --query "[?category=='Administrative'].{Time:eventTimestamp,Caller:caller,Operation:operationName.value,Resource:resourceGroupName,Status:status.value}" \
  --output table \
  --start-time 2026-06-28T00:00:00Z \
  --end-time 2026-06-28T23:59:59Z \
  --max-events 100
```

**检测 Azure AD 全局管理员角色变更**

```bash
az rest --method get \
  --uri "https://graph.microsoft.com/v1.0/auditLogs/directories" \
  --query "value[?activityDisplayName=='Add member to role'].{Time:activityDateTime,Initiator:initiatedBy.user.userPrincipalName,Target:targetResources[0].displayName,Role:targetResources[2].displayName}"
```

**使用 PowerShell 查询特定资源组的管理操作**

```powershell
Get-AzActivityLog -ResourceGroup "production-rg" -StartTime (Get-Date).AddDays(-7) -MaxRecordCount 200 |
  Where-Object { $_.Category -eq "Administrative" } |
  Select-Object EventTimestamp, Caller, OperationName, Status |
  Sort-Object EventTimestamp -Descending |
  Format-Table -AutoSize
```

---

## 0x04 GCP Audit Log 分析

### 1. GCP Audit Log 架构

GCP 的审计日志系统包含三个层次：

| 日志类型 | 描述 | 默认状态 |
|---------|------|---------|
| Admin Activity | 管理员操作审计日志 | 始终启用，不可关闭 |
| Data Access | 数据访问审计日志 | 需要手动启用 |
| System Event | 系统事件审计日志 | 始终启用 |
| Policy Denied | 策略拒绝日志 | 始终启用 |

GCP Audit Log 的存储和查询通过 Cloud Logging 服务实现，支持通过 Log Explorer 进行交互式查询，也支持通过 API 进行程序化查询。

### 2. Admin Activity vs Data Access vs System Event

**Admin Activity 日志**

记录修改资源配置或元数据的操作，例如创建 VM 实例、修改 IAM 策略、删除存储桶等。这些日志始终记录，不需要额外配置。

**Data Access 日志**

记录读取或列出资源数据的操作，例如读取 BigQuery 表数据、列出 Cloud Storage 对象、查询 Firestore 文档等。Data Access 日志默认关闭，需要通过 IAM 策略中的 `auditConfigs` 配置开启。

```json
{
  "auditConfigs": [
    {
      "service": "allServices",
      "auditLogConfigs": [
        {
          "logType": "ADMIN_READ"
        },
        {
          "logType": "DATA_READ"
        },
        {
          "logType": "DATA_WRITE"
        }
      ]
    }
  ]
}
```

**System Event 日志**

由 Google Cloud 系统自动生成的操作日志，例如维护事件、自动伸缩事件等。这些日志对于排除平台自身因素导致的安全事件非常有价值。

### 3. Cloud Logging 和 Log Explorer

Log Explorer 是 GCP 的交互式日志查询界面，支持查询语法和高级过滤：

```bash
gcloud logging read 'resource.type="gce_instance" AND protoPayload.authenticationInfo.principalEmail!=""' \
  --freshness=24h \
  --limit=50 \
  --format=json
```

**使用过滤器定位特定操作**

```bash
gcloud logging read 'protoPayload.methodName="SetIamPolicy" AND protoPayload.resourceName="projects/my-project/serviceAccounts/123456789@my-project.iam.gserviceaccount.com"' \
  --freshness=7d \
  --format=json
```

**检测异常的存储桶权限变更**

```bash
gcloud logging read 'protoPayload.methodName="storage.setIamPermissions" AND resource.type="gcs_bucket"' \
  --freshness=30d \
  --format=json
```

### 4. 异常操作检测

**使用 Log Explorer 查询异常操作**

```bash
gcloud logging read '
  protoPayload.methodName!="" AND
  protoPayload.authenticationInfo.principalEmail!="" AND
  timestamp>="2026-06-28T00:00:00Z" AND
  timestamp<="2026-06-28T23:59:59Z"
' --format=json --limit=100 > audit_logs.json
```

**使用 BigQuery 进行大规模日志分析**

将 Cloud Logging 日志导出到 BigQuery 后，可以使用 SQL 进行复杂查询：

```sql
SELECT
  timestamp,
  protopayload_auditlog.authenticationInfo.principalEmail AS caller,
  protopayload_auditlog.methodName AS method,
  protopayload_auditlog.resourceName AS resource,
  protopayload_auditlog.status.message AS error_msg,
  protopayload_auditlog.requestMetadata.callerIp AS source_ip,
  protopayload_auditlog.servicename AS service
FROM `my-project.cloudaudit.googleapis.com_activity_20260628`
WHERE protopayload_auditlog.methodName LIKE '%SetIamPolicy%'
  OR protopayload_auditlog.methodName LIKE '%Create%ServiceAccount%'
  OR protopayload_auditlog.methodName LIKE '%Delete%Bucket%'
ORDER BY timestamp DESC;
```

### 5. GCP Audit Log 分析实战

**检测 Service Account 的异常使用**

```bash
gcloud logging read '
  protoPayload.authenticationInfo.serviceAccountDelegationInfo!="" AND
  protoPayload.authenticationInfo.principalEmail!="" AND
  timestamp>="2026-06-28T00:00:00Z"
' --format=json | \
  jq '[.[] | {time: .timestamp, caller: .protoPayload.authenticationInfo.principalEmail, method: .protoPayload.methodName, source: .protoPayload.requestMetadata.callerIp}]'
```

**检测跨区域资源访问**

```bash
gcloud logging read '
  resource.labels.region!="" AND
  resource.labels.region!="us-central1" AND
  timestamp>="2026-06-28T00:00:00Z" AND
  protoPayload.authenticationInfo.principalEmail="attacker@external.com"
' --format=json --limit=100
```

**检测 KMS 密钥操作**

```bash
gcloud logging read '
  resource.type="kms_crypto_key" OR resource.type="kms_key_ring" OR
  (protoPayload.serviceName="cloudkms.googleapis.com")
' --freshness=24h --format=json | \
  jq '.[] | select(.protoPayload.methodName | test("Decrypt|Encrypt|CreateCryptoKey|DestroyCryptoKey"))'
```

---

## 0x05 云存储取证

### 1. AWS S3 取证

S3 是 AWS 最核心的存储服务之一，也是数据泄露事件中最常见的攻击目标。S3 取证需要关注以下维度：

**版本控制（Versioning）**

开启版本控制后，S3 会保留对象的每个版本，这对于恢复被删除或被覆盖的数据至关重要：

```bash
aws s3api list-object-versions \
  --bucket target-bucket \
  --prefix "confidential/" \
  --max-items 100
```

**Server Access Logging**

S3 访问日志记录了对存储桶中对象的每个请求：

```bash
aws s3api get-bucket-logging --bucket target-bucket
aws logs filter-log-events \
  --log-group-name "aws-s3-access-logs" \
  --filter-pattern "target-bucket confidential" \
  --start-time 1751126400000
```

**S3 Object Lock**

Object Lock 防止对象被删除或覆盖，在取证期间可以用于保护关键证据：

```bash
aws s3api put-object-retention \
  --bucket evidence-bucket \
  --key "incident-evidence-2026-06-28.json" \
  --retention '{"Mode":"COMPLIANCE","RetainUntilDate":"2027-06-28T00:00:00Z"}'
```

**S3 取证脚本**

```bash
#!/bin/bash
BUCKET=$1
echo "[+] Enumerating bucket: $BUCKET"
aws s3api get-bucket-acl --bucket $BUCKET
aws s3api get-bucket-policy --bucket $BUCKET 2>/dev/null
aws s3api get-bucket-versioning --bucket $BUCKET
aws s3api get-bucket-logging --bucket $BUCKET
aws s3api get-bucket-encryption --bucket $BUCKET
aws s3api get-public-access-block --bucket $BUCKET 2>/dev/null
echo "[+] Listing objects..."
aws s3 ls s3://$BUCKET --recursive --summarize
echo "[+] Checking object versions..."
aws s3api list-object-versions --bucket $BUCKET --max-items 50
echo "[+] Downloading access logs..."
aws s3api get-bucket-location --bucket $BUCKET
```

### 2. Azure Blob Storage 取证

Azure Blob Storage 取证的关键数据源：

**版本控制**

Azure Blob Storage 支持对象版本控制，可以恢复被删除的 Blob：

```powershell
Get-AzStorageBlob -Container "sensitive-data" -Context $ctx |
  Select-Object Name, Length, LastModified, SnapshotTime, BlobType |
  Sort-Object LastModified -Descending |
  Format-Table -AutoSize
```

**Blob 快照**

快照是 Blob 在特定时间点的只读副本，可用于保全取证证据：

```powershell
New-AzStorageBlobSnapshot -Container "evidence" -Blob "incident-data.json" -Context $ctx
```

**Azure 存储分析日志**

Azure 提供详细的存储分析日志，记录所有对 Blob 的操作：

```powershell
Get-AzStorageBlobServiceProperty -Context $ctx -StorageAccountName "forensicsa"
Enable-AzStorageBlobDeleteRetentionPolicy -Context $ctx -Enable $true -DaysRetention 365
```

**Azure Activity Log 中的存储操作**

```kusto
AzureActivity
| where TimeGenerated > ago(30d)
| where ResourceProviderValue == "Microsoft.Storage"
| where OperationNameValue has_any ("write", "delete", "read")
| project TimeGenerated, Caller, OperationNameValue, Resource, Properties
| order by TimeGenerated desc
```

### 3. GCP Cloud Storage 取证

GCP Cloud Storage 取证需要关注以下方面：

**版本控制**

```bash
gsutil ls -la gs://target-bucket/confidential/
gsutil ls -ael gs://target-bucket/confidential/
```

**对象级别的 IAM 策略**

```bash
gsutil iam get gs://target-bucket
gsutil iam get gs://target-bucket/confidential/sensitive-data.pdf
```

**存储桶访问日志**

```bash
gsutil logging get gs://target-bucket
gsutil logging set on gs://target-bucket gs://logging-bucket
```

**使用 Cloud Audit Logs 追踪存储操作**

```bash
gcloud logging read '
  resource.type="gcs_bucket" AND
  (protoPayload.methodName="storage.objects.get" OR
   protoPayload.methodName="storage.objects.list" OR
   protoPayload.methodName="storage.objects.delete")
' --freshness=30d --format=json
```

### 4. 云存储 IOC 提取

在云存储取证中，需要提取以下 IOC：

| IOC 类型 | 来源 | 示例 |
|---------|------|------|
| 公开访问的存储桶 | Bucket Policy / ACL | `Principal: *` |
| 泄露的 API 密钥 | 对象内容、元数据 | Access Key、Secret Key |
| 恶意文件 | 对象内容 | 恶意软件样本、钓鱼页面 |
| 内部 URL | 元数据 | 预签名 URL、内网端点 |
| 数据访问来源 IP | 访问日志 | 攻击者 IP 地址 |

```bash
aws s3api get-bucket-policy --bucket target-bucket | jq -r '.Policy' | jq .
```

```bash
gsutil iam get gs://target-bucket | jq .
```

```bash
az storage container show-permission \
  --name sensitive-data \
  --account-name forensicsa \
  --output json
```

---

## 0x06 IAM 操作审计与权限分析

### 1. AWS IAM 操作审计

AWS IAM 是云安全的核心。IAM 取证主要关注以下方面：

**IAM Access Analyzer**

IAM Access Analyzer 可以自动检测跨账户访问和公开访问资源：

```bash
aws accessanalyzer list-findings \
  --analyzer-arn arn:aws:access-analyzer:us-east-1:123456789012:analyzer/ConsoleAnalyzer-123456789012 \
  --filter '{"contains": {"field": "resource", "value": "arn:aws:s3:::sensitive-bucket"}}'
```

**IAM 事件追踪**

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventSource,AttributeValue=iam.amazonaws.com \
  --start-time 2026-06-01T00:00:00Z \
  --end-time 2026-06-30T23:59:59Z \
  --max-results 100 \
  --query 'Events[].{Time:EventTime,Event:EventName,User:Username,Params:requestParameters}'
```

**检测权限提升操作**

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=AttachUserPolicy \
  --start-time 2026-06-28T00:00:00Z \
  --max-results 50

aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=PutUserPolicy \
  --start-time 2026-06-28T00:00:00Z \
  --max-results 50

aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=CreatePolicyVersion \
  --start-time 2026-06-28T00:00:00Z \
  --max-results 50
```

### 2. Azure AD 操作审计

Azure AD（现为 Microsoft Entra ID）的审计日志包含两种关键日志：

**Azure AD Audit Logs**

记录所有目录管理操作：

```bash
az rest --method get \
  --uri "https://graph.microsoft.com/v1.0/auditLogs/directories?\$filter=activityDisplayName eq 'Add member to role'&\$top=50" \
  --query "value[].{Time:activityDateTime,Initiator:initiatedBy.user.userPrincipalName,Target:targetResources[0].displayName}"
```

**Azure AD Sign-in Logs**

记录所有登录尝试，包括成功和失败：

```bash
az rest --method get \
  --uri "https://graph.microsoft.com/v1.0/auditLogs/signIns?\$filter=status/errorCode ne 0&\$top=50" \
  --query "value[].{Time:createdDateTime,User:userPrincipalName,IP:ipAddress,Status:status.errorCode,Location:location.city}"
```

**检测异常登录模式**

```kusto
SigninLogs
| where TimeGenerated > ago(7d)
| where ResultType == 0
| extend IsRisk = RiskLevelDuringSignIn != "none"
| project TimeGenerated, UserPrincipalName, AppDisplayName, IPAddress, Location, IsRisk, RiskLevelDuringSignIn
| order by TimeGenerated desc
```

**检测不可能旅行（Impossible Travel）**

```kusto
SigninLogs
| where TimeGenerated > ago(30d)
| where ResultType == 0
| extend Location = strcat(LocationDetails.city, ", ", LocationDetails.countryOrRegion)
| summarize Locations = make_set(Location), Times = make_set(TimeGenerated) by UserPrincipalName
| extend LocationCount = array_length(Locations)
| where LocationCount > 2
| project UserPrincipalName, Locations, Times, LocationCount
```

### 3. GCP IAM 操作审计

```bash
gcloud logging read '
  protoPayload.methodName="SetIamPolicy" OR
  protoPayload.methodName="TestIamPermissions"
' --freshness=30d --format=json | \
  jq '[.[] | {time: .timestamp, caller: .protoPayload.authenticationInfo.principalEmail, method: .protoPayload.methodName, resource: .protoPayload.resourceName}]'
```

**检测 Service Account 密钥创建**

```bash
gcloud logging read '
  protoPayload.methodName="google.iam.admin.v1.CreateServiceAccountKey" OR
  protoPayload.methodName="google.iam.admin.v1.CreateServiceAccount"
' --freshness=30d --format=json
```

### 4. 异常权限提升检测

三大云平台的权限提升路径：

| 云平台 | 权限提升手法 | 检测事件 |
|--------|-------------|---------|
| AWS | AttachUserPolicy、PutUserPolicy、CreatePolicyVersion、AssumeRole | `AttachUserPolicy`、`PutUserPolicy`、`AssumeRole` |
| Azure | 添加角色分配、创建新应用注册 | `Microsoft.Authorization/roleAssignments/write` |
| GCP | SetIamPolicy、创建 Service Account 密钥 | `SetIamPolicy`、`CreateServiceAccountKey` |

**AWS 权限提升检测脚本**

```python
import boto3
import json
from datetime import datetime, timedelta

ct_client = boto3.client('cloudtrail')

HIGH_RISK_EVENTS = [
    'AttachUserPolicy', 'AttachRolePolicy', 'AttachGroupPolicy',
    'PutUserPolicy', 'PutRolePolicy', 'PutGroupPolicy',
    'CreatePolicyVersion', 'SetDefaultPolicyVersion',
    'CreateAccessKey', 'CreateLoginProfile',
    'UpdateLoginProfile', 'AddUserToGroup',
    'AssumeRole', 'AssumeRoleWithSAML'
]

start_time = (datetime.utcnow() - timedelta(days=7)).isoformat() + 'Z'

for event_name in HIGH_RISK_EVENTS:
    response = ct_client.lookup_events(
        LookupAttributes=[
            {'AttributeKey': 'EventName', 'AttributeValue': event_name}
        ],
        StartTime=start_time,
        MaxResults=20
    )
    for event in response['Events']:
        detail = json.loads(event['CloudTrailEvent'])
        print(json.dumps({
            'time': detail.get('eventTime'),
            'event': event_name,
            'user': detail.get('userIdentity', {}).get('userName', 'Unknown'),
            'source_ip': detail.get('sourceIPAddress'),
            'parameters': detail.get('requestParameters')
        }, indent=2))
```

### 5. 凭据泄露检测

**检测 AWS Access Key 泄露**

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=AKIAIOSFODNN7EXAMPLE \
  --start-time 2026-06-01T00:00:00Z \
  --max-results 50 \
  --query 'Events[].{Time:EventTime,Event:EventName,Source:IPAddress,User:Username}'
```

**检测 Azure AD 异常的应用注册**

```kusto
AuditLogs
| where TimeGenerated > ago(7d)
| where OperationName has_any ("Add application", "Add OAuth2PermissionGrant", "Update application", "Add secret")
| project TimeGenerated, OperationName, InitiatedBy=InitiatedBy.user.userPrincipalName, TargetResources
| order by TimeGenerated desc
```

**检测 GCP Service Account 密钥创建**

```bash
gcloud logging read '
  protoPayload.methodName="google.iam.admin.v1.CreateServiceAccountKey"
' --freshness=30d --format=json | \
  jq '.[] | {time: .timestamp, caller: .protoPayload.authenticationInfo.principalEmail, key_id: .protoPayload.response.name}'
```

---

## 0x07 容器服务取证

### 1. AWS ECS/EKS 取证

AWS 容器服务的取证需要结合多个日志源：

**CloudWatch Logs**

ECS 任务和 EKS Pod 的日志都汇集到 CloudWatch Logs：

```bash
aws logs describe-log-groups \
  --log-group-name-prefix "/aws/ecs/" \
  --query 'logGroups[].logGroupName'

aws logs filter-log-events \
  --log-group-name "/aws/ecs/web-app" \
  --filter-pattern "ERROR" \
  --start-time 1751126400000 \
  --max-results 100
```

**EKS 审计日志**

EKS 集群的 Kubernetes 审计日志发送到 CloudWatch Logs：

```bash
aws logs filter-log-events \
  --log-group-name "/aws/eks/production-cluster/cluster" \
  --filter-pattern '{ $.objectRef.resource = "pods" && $.verb = "create" }' \
  --start-time 1751126400000
```

**VPC Flow Logs**

VPC Flow Logs 记录了容器间的网络流量：

```bash
aws logs filter-log-events \
  --log-group-name "vpc-flow-logs" \
  --filter-pattern '{ $.dstPort = 443 && $.action = "ACCEPT" }' \
  --start-time 1751126400000
```

**EKS 取证脚本**

```bash
#!/bin/bash
CLUSTER=$1
echo "[+] Collecting EKS cluster info..."
kubectl cluster-info
kubectl get nodes -o wide
kubectl get pods --all-namespaces -o wide
kubectl get services --all-namespaces
kubectl get rolebindings --all-namespaces
kubectl get clusterrolebindings
echo "[+] Checking for suspicious pods..."
kubectl get pods --all-namespaces -o json | \
  jq '.items[] | select(.spec.containers[].securityContext.privileged == true) | {name: .metadata.name, namespace: .metadata.namespace}'
echo "[+] Collecting pod logs..."
for ns in $(kubectl get namespaces -o jsonpath='{.items[*].metadata.name}'); do
  for pod in $(kubectl get pods -n $ns -o jsonpath='{.items[*].metadata.name}'); do
    kubectl logs -n $ns $pod --all-containers --tail=1000 > "/tmp/eks-logs/${ns}-${pod}.log" 2>/dev/null
  done
done
```

### 2. Azure AKS 取证

Azure AKS 的取证数据源：

**Azure Monitor for Containers**

```bash
az aks show --resource-group myRG --name myAKS --query "monitoring.addonProfile.logs.enabled"
az monitor log-analytics query \
  --workspace "my-workspace-id" \
  --analytics-query "ContainerLog | where TimeGenerated > ago(24h) | where PodName has 'suspicious'" \
  --output table
```

**AKS 审计日志**

```bash
az monitor log-analytics query \
  --workspace "my-workspace-id" \
  --analytics-query "KubeAuditEvents | where TimeGenerated > ago(24h) | where Verb == 'create' or Verb == 'update'" \
  --output table
```

**Azure AD 与 AKS 集成审计**

```kusto
AzureActivity
| where TimeGenerated > ago(24h)
| where ResourceProviderValue == "Microsoft.ContainerService"
| where OperationNameValue has_any ("write", "delete")
| project TimeGenerated, Caller, OperationNameValue, Resource, Status
| order by TimeGenerated desc
```

### 3. GCP GKE 取证

GCP GKE 的取证数据源：

**Cloud Logging 中的 GKE 日志**

```bash
gcloud logging read '
  resource.type="k8s_cluster" AND
  jsonPayload.kind="Event" AND
  jsonPayload.verdict="create"
' --freshness=24h --format=json
```

**GKE 审计日志**

```bash
gcloud logging read '
  protoPayload.serviceName="k8s.io" AND
  (protoPayload.methodName="io.k8s.core.v1.pods.create" OR
   protoPayload.methodName="io.k8s.core.v1.secrets.get")
' --freshness=7d --format=json
```

**GKE 节点日志**

```bash
gcloud logging read '
  resource.type="gce_instance" AND
  labels."k8s.io/cluster-name"="production-cluster" AND
  jsonPayload.message="container Created"
' --freshness=24h --format=json
```

### 4. 容器镜像分析

容器镜像取证需要分析镜像层、配置和内容：

```bash
docker history suspicious-image:latest --no-trunc
docker inspect suspicious-image:latest | jq '.[0].Config'
```

**使用 Dive 分析镜像层**

```bash
dive suspicious-image:latest
```

**提取容器运行时配置**

```bash
docker inspect <container_id> | jq '{
  Image: .Config.Image,
  Cmd: .Config.Cmd,
  Entrypoint: .Config.Entrypoint,
  Env: .Config.Env,
  Volumes: .Config.Volumes,
  WorkingDir: .Config.WorkingDir,
  Labels: .Config.Labels,
  NetworkMode: .HostConfig.NetworkMode,
  Privileged: .HostConfig.Privileged,
  CapAdd: .HostConfig.CapAdd,
  CapDrop: .HostConfig.CapDrop
}'
```

### 5. 容器逃逸痕迹检测

容器逃逸的常见痕迹包括：

**宿主机文件系统访问**

```bash
grep -r "docker.sock\|containerd.sock\|proc/1/ns" /var/log/syslog
journalctl -u docker --since "24 hours ago" | grep -i "error\|warn\|escape"
```

**异常的 Capabilities**

```bash
cat /proc/<pid>/status | grep Cap
capsh --decode=<hex_value>
```

**异常的 Namespace 操作**

```bash
lsns -t user
lsns -t pid
```

**cgroup 逃逸检测**

```bash
cat /proc/1/cgroup | grep -v docker
grep -r "docker\|kubepods" /proc/*/cgroup 2>/dev/null
```

---

## 0x08 Serverless 函数取证

### 1. AWS Lambda 取证

Lambda 函数的取证需要关注 CloudWatch Logs、X-Ray 追踪和 Lambda 事件配置：

**CloudWatch Logs**

```bash
aws logs describe-log-groups \
  --log-group-name-prefix "/aws/lambda/" \
  --query 'logGroups[].logGroupName'

aws logs filter-log-events \
  --log-group-name "/aws/lambda/data-processor" \
  --filter-pattern "ERROR" \
  --start-time 1751126400000
```

**Lambda 配置审计**

```bash
aws lambda get-function-configuration \
  --function-name data-processor \
  --query '{Role:Role,Runtime:Runtime,Handler:Handler,Timeout:Timeout,MemorySize:MemorySize,Environment:Environment,VPCConfig:VPCConfig}'
```

**X-Ray 追踪分析**

```bash
aws xray get-trace-summaries \
  --start-time 2026-06-28T00:00:00Z \
  --end-time 2026-06-28T23:59:59Z \
  --filter-expression 'fault = true'
```

**Lambda 事件注入检测**

```json
{
  "Records": [
    {
      "eventVersion": "2.1",
      "eventSource": "aws:s3",
      "awsRegion": "us-east-1",
      "eventTime": "2026-06-28T14:23:45.000Z",
      "eventName": "ObjectCreated:Put",
      "s3": {
        "bucket": {
          "name": "payload-bucket"
        },
        "object": {
          "key": "shell.sh",
          "size": 1024
        }
      }
    }
  ]
}
```

### 2. Azure Functions 取证

Azure Functions 的取证数据源：

**Application Insights**

```powershell
Get-AzOperationalInsightsQueryWorkspaceDataContent `
  -WorkspaceId "/subscriptions/xxx/resourceGroups/xxx/providers/Microsoft.OperationalInsights/workspaces/xxx" `
  -Query "requests | where timestamp > ago(24h) | where success == false | project timestamp, name, resultCode, duration"
```

**Azure Monitor**

```kusto
AppTraces
| where TimeGenerated > ago(24h)
| where OperationName == "data-processor"
| where Level == "Error" or Level == "Warning"
| project TimeGenerated, Message, OperationName, Properties
| order by TimeGenerated desc
```

**Function App 配置审计**

```bash
az functionapp config appsettings list \
  --name myFunctionApp \
  --resource-group myRG \
  --query "[?contains(name, 'ConnectionString') || contains(name, 'Secret') || contains(name, 'Key')]"
```

### 3. GCP Cloud Functions 取证

**Cloud Logging**

```bash
gcloud logging read '
  resource.type="cloud_function" AND
  resource.labels.function_name="data-processor"
' --freshness=24h --format=json
```

**函数配置审计**

```bash
gcloud functions describe data-processor \
  --region=us-central1 \
  --format=json | \
  jq '{
    runtime: .runtime,
    entryPoint: .entryPoint,
    timeout: .timeout,
    availableMemoryMb: .availableMemoryMb,
    serviceAccountEmail: .serviceAccountEmail,
    environmentVariables: .environmentVariables,
    eventTrigger: .eventTrigger
  }'
```

**审计日志中的函数调用**

```bash
gcloud logging read '
  protoPayload.serviceName="cloudfunctions.googleapis.com"
' --freshness=24h --format=json | \
  jq '.[] | {time: .timestamp, method: .protoPayload.methodName, caller: .protoPayload.authenticationInfo.principalEmail}'
```

### 4. Serverless 攻击模式分析

Serverless 环境中的常见攻击模式：

| 攻击模式 | 描述 | 取证线索 |
|---------|------|---------|
| 环境变量注入 | 通过环境变量注入恶意配置 | 函数配置变更日志 |
| 依赖链投毒 | 修改 package.json 中的依赖 | 部署日志、代码版本差异 |
| 事件注入 | 构造恶意事件触发函数 | 事件来源分析、输入验证日志 |
| 横向移动 | 利用函数的 IAM 角色访问其他资源 | CloudTrail/IAM 日志 |
| 冷启动投毒 | 利用共享运行时环境 | 异常的初始化日志 |

### 5. 取证证据提取

**提取 Lambda 环境变量**

```bash
aws lambda get-function-configuration \
  --function-name compromised-function \
  --query 'Environment.Variables'
```

**提取函数代码包**

```bash
aws lambda get-function \
  --function-name compromised-function \
  --query 'Code.Location'
```

```bash
FUNCTION_URL=$(aws lambda get-function --function-name compromised-function --query 'Code.Location' --output text)
curl -o function-code.zip "$FUNCTION_URL"
unzip function-code.zip -d ./function-code/
```

**提取函数部署历史**

```bash
aws lambda list-versions-by-function \
  --function-name compromised-function \
  --query 'Versions[?Version != `$LATEST`].{Version:Version,CodeSha256:CodeSha256,Created:LastModified}'
```

---

## 0x09 证据强度分层

云取证证据按照可靠性和确定性分为三个层次：

### 1. 确认恶意（Confirmation Level）

该层次的证据可以直接确认恶意行为的发生：

| 证据类型 | 描述 | 可信度 |
|---------|------|--------|
| 明确的恶意 API 调用 | 从已知攻击者 IP 执行的恶意操作 | 极高 |
| 恶意代码部署记录 | 通过 Lambda/Functions 部署恶意代码 | 极高 |
| 数据外传的直接证据 | 将数据复制到攻击者控制的外部存储 | 极高 |
| 攻击工具的镜像部署 | 在容器服务中部署已知攻击工具镜像 | 高 |
| 凭据创建记录 | 为攻击者创建持久化访问凭据 | 高 |

```json
{
  "evidence_type": "confirmation",
  "event": "CreateAccessKey",
  "actor": "attacker@external.com",
  "source_ip": "198.51.100.25",
  "target": "arn:aws:iam::123456789012:user/admin",
  "timestamp": "2026-06-28T14:23:45Z",
  "context": "从已知恶意 IP 为高权限用户创建访问密钥",
  "confidence": 0.95
}
```

### 2. 高度可疑（High Suspicion Level）

该层次的证据表明高度可疑的活动，但需要额外佐证：

| 证据类型 | 描述 | 可信度 |
|---------|------|--------|
| 异常时间窗口的管理操作 | 凌晨时段的 IAM 变更 | 高 |
| 从异常地理位置的登录 | 来自新国家/地区的管理员登录 | 高 |
| 大量枚举操作 | 短时间内的 Describe/List API 调用 | 高 |
| 异常的跨区域访问 | 从非工作区域执行的资源操作 | 中高 |
| 新创建的 Service Account 使用 | 新 Service Account 的首次 API 调用 | 中高 |

```json
{
  "evidence_type": "high_suspicion",
  "event": "ConsoleLogin",
  "actor": "admin@contoso.com",
  "source_ip": "198.51.100.25",
  "location": "Moscow, Russia",
  "timestamp": "2026-06-28T03:15:00Z",
  "context": "从新地理位置在非工作时间登录管理员账户",
  "confidence": 0.75
}
```

### 3. 需要关注（Attention Level）

该层次的证据需要进一步分析以排除正常操作：

| 证据类型 | 描述 | 可信度 |
|---------|------|--------|
| 配置变更 | 安全组规则修改 | 中 |
| 服务启用 | 新服务的首次启用 | 中 |
| 失败的认证尝试 | 账户登录失败 | 中低 |
| 异常的 API 错误模式 | 频繁的权限拒绝错误 | 中低 |
| 环境变量修改 | Lambda 函数配置变更 | 中 |

```json
{
  "evidence_type": "attention",
  "event": "AuthorizeSecurityGroupIngress",
  "actor": "developer@contoso.com",
  "source_ip": "10.0.1.50",
  "timestamp": "2026-06-28T10:30:00Z",
  "context": "添加了一条允许 0.0.0.0/0 访问 22 端口的安全组规则",
  "confidence": 0.50
}
```

---

## 0x10 公开案例中的云环境取证

### 案例一：Capital One 数据泄露 — AWS S3 + IAM 取证

**事件概述**

2019 年 7 月，Capital One 遭受数据泄露，约 1.06 亿名客户的个人信息和信用卡申请数据被窃取。攻击者利用 AWS WAF 的 SSRF 漏洞获取了 EC2 实例上的 IAM 角色临时凭据，然后利用该角色对 S3 存储桶的过度权限访问了 700 多个存储桶中的敏感数据。

**AWS CloudTrail 取证要点**

1. **IAM 角色权限分析**

攻击者利用的 IAM 角色附加了包含 `s3:GetObject` 权限的策略，且该策略的资源范围过于宽泛（覆盖了所有 S3 存储桶），而不仅仅限于业务所需的目标桶。

```bash
aws iam get-role-policy --role-name WAFRole --policy-name S3Access
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123456789012:role/WAFRole \
  --action-names s3:GetObject,s3:ListBucket \
  --resource-arns 'arn:aws:s3:::*' 'arn:aws:s3:::*/*'
```

2. **S3 存储桶访问模式分析**

CloudTrail 记录了攻击者在短时间内对大量 S3 存储桶的 ListBucket 和 GetObject 调用：

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=ListBucket \
  --start-time 2019-07-17T00:00:00Z \
  --end-time 2019-07-17T23:59:59Z \
  --max-results 100 \
  --query 'Events[].{Time:EventTime,Source:IPAddress,Params:requestParameters}'
```

3. **数据外传路径分析**

攻击者通过创建临时凭据将数据复制到外部 S3 存储桶：

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=GetObject \
  --start-time 2019-07-17T00:00:00Z \
  --end-time 2019-07-26T23:59:59Z \
  --max-results 100
```

**取证启示**

- IAM 角色的最小权限原则是防止数据泄露的第一道防线
- S3 存储桶的访问模式基线建立对于检测异常行为至关重要
- CloudTrail Insights 和 GuardDuty 可以帮助检测 API 调用的异常模式

### 案例二：Microsoft 365 钓鱼攻击 — Azure AD 取证

**事件概述**

某企业遭受针对性钓鱼攻击，攻击者通过 Office 365 钓鱼邮件获取了多名员工的 M365 凭据，然后利用这些凭据在 Outlook 中自动转发规则将企业邮件外传。

**Azure AD 取证要点**

1. **异常登录分析**

通过 Azure AD Sign-in Logs 检测异常登录：

```kusto
SigninLogs
| where TimeGenerated between(datetime(2026-01-15) .. datetime(2026-01-25))
| where UserPrincipalName in ("victim1@contoso.com", "victim2@contoso.com")
| where ResultType == 0
| project TimeGenerated, UserPrincipalName, IPAddress, Location=LocationDetails.city, 
          ClientAppUsed, Browser, OS
| order by TimeGenerated asc
```

2. **邮箱规则篡改检测**

通过 Exchange Online 管理日志检测邮件转发规则创建：

```kusto
OfficeActivity
| where TimeGenerated > ago(30d)
| where Operation == "New-InboxRule" or Operation == "Set-InboxRule"
| where MailboxUpn in ("victim1@contoso.com", "victim2@contoso.com")
| project TimeGenerated, UserPrincipalName, Operation, MailboxUpn, 
          Parameters=parse_json(Parameters)
| order by TimeGenerated desc
```

3. **OAuth 应用授权检测**

```kusto
AuditLogs
| where TimeGenerated > ago(30d)
| where OperationName == "Consent to application"
| project TimeGenerated, InitiatedBy=initiatedBy.user.userPrincipalName, 
          TargetResources=targetResources[0].displayName, Result
| order by TimeGenerated desc
```

**取证启示**

- MFA 并非万无一失，攻击者可以使用中间人工具绕过 MFA
- 邮箱自动转发规则是钓鱼攻击中最常见的持久化手段
- Azure AD Identity Protection 的风险登录检测是重要的补充防线

### 案例三：Kubernetes 集群入侵 — GKE 取证

**事件概述**

某使用 GKE 的组织发现其计算资源被用于加密货币挖矿。攻击者通过利用一个暴露的 Kubernetes Dashboard 访问了集群，然后部署了加密挖矿容器。

**GKE 取证要点**

1. **Kubernetes 审计日志分析**

```bash
gcloud logging read '
  protoPayload.serviceName="k8s.io" AND
  jsonPayload.user.username="system:anonymous"
' --freshness=90d --format=json | \
  jq '.[] | {time: .timestamp, method: .protoPayload.methodName, resource: .protoPayload.resourceName}'
```

2. **Pod 部署事件追踪**

```bash
gcloud logging read '
  protoPayload.methodName="io.k8s.core.v1.pods.create" AND
  timestamp>="2026-05-01T00:00:00Z"
' --freshness=90d --format=json | \
  jq '.[] | {time: .timestamp, caller: .protoPayload.authenticationInfo.principalEmail, 
              pod: .protoPayload.request.spec.containers[0].name, 
              image: .protoPayload.request.spec.containers[0].image}'
```

3. **网络流量分析**

```bash
gcloud logging read '
  resource.type="k8s_cluster" AND
  jsonPayload.kind="Event" AND
  labels."k8s.io/pod"!="" AND
  jsonPayload.message="Service changed"
' --freshness=30d --format=json
```

4. **容器镜像来源分析**

```bash
gcloud logging read '
  protoPayload.methodName="io.k8s.core.v1.pods.create" AND
  jsonPayload.request.spec.containers[0].image!~"gcr.io/my-project/"
' --freshness=90d --format=json
```

**取证启示**

- Kubernetes Dashboard 的暴露面管理是集群安全的关键
- 包名镜像策略（ImagePolicyWebhook）可以有效阻止恶意镜像部署
- GKE 审计日志结合 Cloud Logging 可以实现完整的攻击链还原

---

## 0x11 云环境取证检测自动化与狩猎

### 1. AWS CloudTrail 查询脚本

**AWS CLI 批量查询**

```bash
#!/bin/bash
echo "[+] AWS CloudTrail 全面取证收集"
echo "[+] 时间范围: $1 到 $2"
START=$1
END=$2

echo "[+] 收集 IAM 事件..."
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventSource,AttributeValue=iam.amazonaws.com \
  --start-time "$START" --end-time "$END" --max-results 200 \
  --query 'Events[].CloudTrailEvent' --output text > /tmp/iam_events.json

echo "[+] 收集 S3 事件..."
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventSource,AttributeValue=s3.amazonaws.com \
  --start-time "$START" --end-time "$END" --max-results 200 \
  --query 'Events[].CloudTrailEvent' --output text > /tmp/s3_events.json

echo "[+] 收集 EC2 事件..."
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventSource,AttributeValue=ec2.amazonaws.com \
  --start-time "$START" --end-time "$END" --max-results 200 \
  --query 'Events[].CloudTrailEvent' --output text > /tmp/ec2_events.json

echo "[+] 检测控制台登录..."
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=ConsoleLogin \
  --start-time "$START" --end-time "$END" --max-results 100 \
  --query 'Events[].CloudTrailEvent' --output text > /tmp/console_logins.json

echo "[+] 检测 Root 用户活动..."
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=Username,AttributeValue=root \
  --start-time "$START" --end-time "$END" --max-results 100 \
  --query 'Events[].CloudTrailEvent' --output text > /tmp/root_activity.json

echo "[+] 检测异常 AssumeRole..."
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=AssumeRole \
  --start-time "$START" --end-time "$END" --max-results 100 \
  --query 'Events[].CloudTrailEvent' --output text > /tmp/assume_role.json

echo "[+] 生成汇总报告..."
for f in /tmp/iam_events.json /tmp/s3_events.json /tmp/ec2_events.json; do
  echo "--- $(basename $f) ---"
  cat "$f" | python3 -c "
import sys, json
events = sys.stdin.read().strip().split('\n')
for line in events:
    try:
        e = json.loads(line)
        print(f\"{e.get('eventTime','N/A')} | {e.get('eventName','N/A')} | {e.get('userIdentity',{}).get('userName','N/A')} | {e.get('sourceIPAddress','N/A')}\")
    except:
        pass
" 2>/dev/null
done
```

**Python boto3 自动化取证脚本**

```python
import boto3
import json
from datetime import datetime, timedelta

class CloudTrailForensics:
    def __init__(self, region='us-east-1'):
        self.ct = boto3.client('cloudtrail', region_name=region)
        self.iam = boto3.client('iam')
    
    def get_events_by_event_name(self, event_name, hours=24):
        start = (datetime.utcnow() - timedelta(hours=hours)).isoformat() + 'Z'
        events = []
        response = self.ct.lookup_events(
            LookupAttributes=[
                {'AttributeKey': 'EventName', 'AttributeValue': event_name}
            ],
            StartTime=start,
            MaxResults=100
        )
        events.extend(response['Events'])
        while 'NextToken' in response:
            response = self.ct.lookup_events(
                LookupAttributes=[
                    {'AttributeKey': 'EventName', 'AttributeValue': event_name}
                ],
                StartTime=start,
                NextToken=response['NextToken'],
                MaxResults=100
            )
            events.extend(response['Events'])
        return events
    
    def detect_iam_enumeration(self, hours=24):
        enumeration_apis = [
            'ListUsers', 'ListRoles', 'ListPolicies',
            'ListGroups', 'ListAccessKeys', 'GetUser',
            'GetRole', 'GetPolicy', 'GetAccountAuthorizationDetails'
        ]
        findings = []
        for api_name in enumeration_apis:
            events = self.get_events_by_event_name(api_name, hours)
            for event in events:
                detail = json.loads(event['CloudTrailEvent'])
                findings.append({
                    'time': detail.get('eventTime'),
                    'api': api_name,
                    'user': detail.get('userIdentity', {}).get('userName', 'Unknown'),
                    'source_ip': detail.get('sourceIPAddress'),
                    'user_agent': detail.get('userAgent')
                })
        return findings
    
    def detect_suspicious_assume_role(self, hours=24):
        events = self.get_events_by_eventName('AssumeRole', hours) if False else []
        start = (datetime.utcnow() - timedelta(hours=hours)).isoformat() + 'Z'
        response = self.ct.lookup_events(
            LookupAttributes=[
                {'AttributeKey': 'EventName', 'AttributeValue': 'AssumeRole'}
            ],
            StartTime=start,
            MaxResults=100
        )
        events.extend(response['Events'])
        findings = []
        for event in events:
            detail = json.loads(event['CloudTrailEvent'])
            params = detail.get('requestParameters', {})
            findings.append({
                'time': detail.get('eventTime'),
                'role_arn': params.get('roleArn'),
                'session_name': params.get('roleSessionName'),
                'source_ip': detail.get('sourceIPAddress'),
                'user_agent': detail.get('userAgent'),
                'mfa': detail.get('userIdentity', {}).get('sessionContext', {})
                    .get('attributes', {}).get('mfaAuthenticated', 'false')
            })
        return findings
    
    def generate_report(self, hours=24):
        report = {
            'generated_at': datetime.utcnow().isoformat(),
            'time_range_hours': hours,
            'iam_enumeration': self.detect_iam_enumeration(hours),
            'assume_role_events': self.detect_suspicious_assume_role(hours)
        }
        return report

if __name__ == '__main__':
    forensics = CloudTrailForensics()
    report = forensics.generate_report(hours=168)
    print(json.dumps(report, indent=2, default=str))
```

### 2. Azure Activity Log 查询脚本

**Azure CLI 批量查询**

```bash
#!/bin/bash
echo "[+] Azure Activity Log 取证收集"
echo "[+] 订阅: $(az account show --query 'id' -o tsv)"

echo "[+] 收集管理操作..."
az monitor activity-log list \
  --query "[?category=='Administrative'].{Time:eventTimestamp,Caller:caller,Op:operationName.value,Resource:resourceGroupName,Status:status.value}" \
  --output json \
  --start-time "$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)" \
  --max-events 500 > /tmp/azure_admin.json

echo "[+] 收集安全事件..."
az monitor activity-log list \
  --query "[?category=='Security'].{Time:eventTimestamp,Alert:properties.incidentInfo.incidentNumber,Severity:properties.incidentInfo.severity,Status:properties.incidentInfo.resolutionStatus}" \
  --output json \
  --start-time "$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)" > /tmp/azure_security.json

echo "[+] 检测高风险角色变更..."
az monitor activity-log list \
  --query "[?contains(operationName.value, 'roleAssignments')].{Time:eventTimestamp,Caller:caller,Op:operationName.value,Target:properties.targetResources}" \
  --output json \
  --start-time "$(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%SZ)" > /tmp/azure_rbac.json

echo "[+] 收集 Azure AD 登录..."
az rest --method get \
  --uri "https://graph.microsoft.com/v1.0/auditLogs/signIns?\$top=100&\$filter=status/errorCode%20ne%200" \
  --output json > /tmp/azure_failed_logins.json

echo "[+] 生成汇总..."
python3 -c "
import json
for fname in ['azure_admin.json', 'azure_security.json', 'azure_rbac.json']:
    with open(f'/tmp/{fname}') as f:
        data = json.load(f)
    print(f'\\n--- {fname}: {len(data)} records ---')
    for item in data[:10]:
        print(item)
"
```

**PowerShell 自动化取证**

```powershell
function Get-AzureForensicsReport {
    param(
        [DateTime]$StartTime = (Get-Date).AddDays(-7),
        [DateTime]$EndTime = (Get-Date)
    )

    $report = @{}

    $report.AdminActivity = Get-AzActivityLog -StartTime $StartTime -EndTime $EndTime -MaxRecordCount 500 |
        Where-Object { $_.Category -eq "Administrative" } |
        Select-Object EventTimestamp, Caller, OperationName, Status, ResourceGroupName, CorrelationId

    $report.SecurityEvents = Get-AzActivityLog -StartTime $StartTime -EndTime $EndTime -MaxRecordCount 200 |
        Where-Object { $_.Category -eq "Security" } |
        Select-Object EventTimestamp, OperationName, Level, ResourceGroupName

    $report.RBACChanges = $report.AdminActivity |
        Where-Object { $_.OperationName.Value -like "*roleAssignments*" }

    $report.NonBusinessHours = $report.AdminActivity |
        Where-Object { $_.EventTimestamp.Hour -lt 6 -or $_.EventTimestamp.Hour -gt 22 }

    $report.ResourceGroupChanges = $report.AdminActivity |
        Group-Object ResourceGroupName |
        Sort-Object Count -Descending |
        Select-Object Name, Count

    $report
}
```

### 3. GCP Audit Log 查询脚本

**gcloud 批量查询**

```bash
#!/bin/bash
echo "[+] GCP Audit Log 取证收集"
PROJECT=$(gcloud config get-value project)
echo "[+] 项目: $PROJECT"

echo "[+] 收集 IAM 变更..."
gcloud logging read '
  protoPayload.methodName="SetIamPolicy" OR
  protoPayload.methodName="google.iam.admin.v1.CreateServiceAccountKey" OR
  protoPayload.methodName="google.iam.admin.v1.CreateServiceAccount"
' --freshness=7d --format=json > /tmp/gcp_iam_changes.json

echo "[+] 收集存储操作..."
gcloud logging read '
  protoPayload.serviceName="storage.googleapis.com" AND
  (protoPayload.methodName="storage.objects.get" OR
   protoPayload.methodName="storage.objects.list" OR
   protoPayload.methodName="storage.objects.delete" OR
   protoPayload.methodName="storage.setIamPermissions")
' --freshness=7d --format=json > /tmp/gcp_storage_ops.json

echo "[+] 收集计算实例操作..."
gcloud logging read '
  protoPayload.serviceName="compute.googleapis.com" AND
  (protoPayload.methodName="compute.instances.insert" OR
   protoPayload.methodName="compute.instances.delete" OR
   protoPayload.methodName="compute.firewalls.insert")
' --freshness=7d --format=json > /tmp/gcp_compute_ops.json

echo "[+] 收集 KMS 操作..."
gcloud logging read '
  protoPayload.serviceName="cloudkms.googleapis.com"
' --freshness=7d --format=json > /tmp/gcp_kms_ops.json

echo "[+] 生成汇总报告..."
python3 -c "
import json
total_events = 0
for fname in ['gcp_iam_changes.json', 'gcp_storage_ops.json', 'gcp_compute_ops.json', 'gcp_kms_ops.json']:
    with open(f'/tmp/{fname}') as f:
        data = json.load(f)
    total_events += len(data)
    print(f'{fname}: {len(data)} events')
    for item in data[:5]:
        ts = item.get('timestamp', 'N/A')
        method = item.get('protoPayload', {}).get('methodName', 'N/A')
        caller = item.get('protoPayload', {}).get('authenticationInfo', {}).get('principalEmail', 'N/A')
        print(f'  {ts} | {method} | {caller}')
print(f'\\nTotal events: {total_events}')
"
```

### 4. Sigma 检测规则

**规则一：AWS Root 用户活动检测**

```yaml
title: AWS Root User Activity Detected
id: 3c8e4f2a-1b5d-4e7f-9a8c-2d6e4f8a1b3c
status: stable
description: 检测 AWS 根用户的 API 调用活动，根用户的任何非计划内活动都应视为高优先级事件
references:
  - https://docs.aws.amazon.com/IAM/latest/UserGuide/id_root-user.html
logsource:
  product: aws
  service: cloudtrail
detection:
  selection_event:
    userIdentity.type: Root
  selection_source:
    eventSource: ''
  condition: selection_event and not selection_source
level: critical
tags:
  - attack.privilege_escalation
  - attack.t1078.004
falsepositives:
  - 合法的根用户操作（应该极少见）
```

**规则二：AWS 异常 AssumeRole 检测**

```yaml
title: Suspicious AWS AssumeRole From External IP
id: 5d7f2a8b-3c1e-4a6d-9f0e-2b4c6d8a1e3f
status: stable
description: 检测从非组织 IP 地址发起的 AssumeRole 调用，可能表明凭据泄露
references:
  - https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_get-token.html
logsource:
  product: aws
  service: cloudtrail
detection:
  selection:
    eventName: AssumeRole
    requestParameters.roleArn|contains: ':root'
  filter_legitimate:
    sourceIPAddress|startswith:
      - '10.'
      - '172.16.'
      - '192.168.'
  condition: selection and not filter_legitimate
level: high
tags:
  - attack.credential_access
  - attack.t1550
```

**规则三：Azure 非工作时间管理操作检测**

```yaml
title: Azure Administrative Operation Outside Business Hours
id: 7a2e4f8c-5d1b-4c9a-8e3f-6a2d4b6c8e1f
status: stable
description: 检测在非工作时间（UTC 22:00-06:00）执行的 Azure 管理操作
references:
  - https://learn.microsoft.com/en-us/azure/azure-monitor/essentials/activity-log
logsource:
  product: azure
  service: activity-log
detection:
  selection:
    category: Administrative
  timeframe_filter:
    eventTimestamp|hour: 0
  condition: selection and timeframe_filter
level: medium
tags:
  - attack.initial_access
  - attack.t1078.004
```

**规则四：GCP Service Account 密钥创建检测**

```yaml
title: GCP Service Account Key Created
id: 9e4f2a8b-1c3d-4e5f-6a7b-8c9d0e1f2a3b
status: stable
description: 检测新的 Service Account 密钥创建操作，这可能是凭据持久化的前兆
references:
  - https://cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys
logsource:
  product: gcp
  service: audit-log
detection:
  selection:
    protoPayload.methodName: google.iam.admin.v1.CreateServiceAccountKey
  filter_non_sa:
    protoPayload.authenticationInfo.principalEmail|endswith:
      - '.gserviceaccount.com'
  condition: selection and not filter_non_sa
level: high
tags:
  - attack.credential_access
  - attack.t1098.001
```

**规则五：AWS S3 存储桶公开访问检测**

```yaml
title: AWS S3 Bucket Public Access Modified
id: 2b4d6f8a-0c1e-4a3b-5d7f-9e2a4c6b8d0f
status: stable
description: 检测 S3 存储桶公共访问阻止配置被修改，可能是数据泄露的前兆
references:
  - https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html
logsource:
  product: aws
  service: cloudtrail
detection:
  selection:
    eventName|contains:
      - 'PutBucketPublicAccessBlock'
      - 'PutBucketAcl'
      - 'PutBucketPolicy'
  selection_response:
    requestParameters.PublicAccessBlockConfiguration:
      BlockPublicAcls: false
  condition: selection
level: critical
tags:
  - attack.initial_access
  - attack.t1190
```

---

## 0x12 参考资料

1. AWS Documentation. "How CloudTrail works." https://docs.aws.amazon.com/awscloudtrail/latest/userguide/how-cloudtrail-works.html

2. Microsoft Documentation. "Overview of Azure Activity Log." https://learn.microsoft.com/en-us/azure/azure-monitor/essentials/activity-log

3. Google Cloud Documentation. "Audit logging overview." https://cloud.google.com/logging/docs/audit

4. AWS Documentation. "Logging and monitoring in Amazon S3." https://docs.aws.amazon.com/AmazonS3/latest/userguide/LoggingBestPractices.html

5. Microsoft Documentation. "Azure Activity Log event schema." https://learn.microsoft.com/en-us/azure/azure-monitor/essentials/activity-log-schema

6. Google Cloud Documentation. "Cloud Audit Logs." https://cloud.google.com/logging/docs/audit

7. NIST. "Cloud Computing Forensics Science Technical Report." NIST Special Publication 800-186

8. Cloud Security Alliance. "Extended Cloud Controls Model for IaaS." https://cloudsecurityalliance.org/research/ecs-model/

9. SANS Institute. "Cloud Forensics: Identifying and Investigating Cloud Usage." https://www.sans.org/white-papers/cloud-forensics/

10. MITRE ATT&CK. "Cloud Accounts (T1078.004)." https://attack.mitre.org/techniques/T1078/004/

11. AWS Documentation. "Best practices for IAM." https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html

12. Microsoft Documentation. "Azure AD security operations guide." https://learn.microsoft.com/en-us/azure/active-directory/fundamentals/security-operations-introduction

13. Google Cloud Documentation. "Security best practices for Google Cloud." https://cloud.google.com/docs/security/best-practices

14. CrowdStrike. "Cloud Security Threat Report." https://www.crowdstrike.com/resources/reports/cloud-security-threat-report/

15. Aqua Security. "Cloud Native Security Report." https://www.aquasec.com/cloud-native-security-research/
