---
title: UnsafeHttpMethod类型漏洞检测脚本
date: 2020-01-08T23:31:00+08:00
tags: 工具开发,脚本
---
> 对于大量UnsafeHttpMethod类型漏洞一直苦于耗费时间，而几乎无产出，对于安全检测人员来说简直是浪费了不必要的时间，所以根据具体的几种常见的漏洞通过脚本的形式进行批量检测成为了最值得研究的。本文设计的Method_test.py模块用于检测OPTIONS,PUT,DELETE,TRACE方法脚本，支持单测、批测，批测中断，生成记录文档。

<!--more-->


### 需求
对于大量UnsafeHttpMethod类型漏洞一直苦于耗费时间，而几乎无产出，对于安全检测人员来说简直是浪费了不必要的时间，所以根据具体的几种常见的漏洞通过脚本的形式进行批量检测成为了最值得研究的。

**漏洞名称：启用了不安全的HTTP方法**
**危险等级：中**
**漏洞描述：**Web服务器配置为允许使用危险的HTTP方法，如PUT、MOVE、COPY、DELETE、PROPFIND、SEARCH、MKCOL、LOCK、UNLOCK、PROPPATCH，该配置可能允许未授权的用户对Web服务器进行敏感操作。

### method_test
检测OPTIONS,PUT,DELETE,TRACE

#### 功能：
1. 支持单个url检测、批测，
2. 批测可以中断，
3. 生成记录文档

#### 用法:
```
method_test.py [option] [parameter]
-h this help
-u <url>
-r <FilePath>
```
eg. ”method_test.py -u http://baidu.com"\
eg. "method_test.py -r d:\url.txt" (url.txt内容需统一带http/https://)


[【Git下载地址】method_test.py](https://github.com/XTpeeps/PenAssis/tree/master/HttpVulMethodTest)
