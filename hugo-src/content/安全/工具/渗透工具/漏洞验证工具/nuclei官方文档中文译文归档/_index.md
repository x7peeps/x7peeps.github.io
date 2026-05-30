---
title: 漏洞验证工具nuclei官方文档中文译文归档
tag: 漏洞验证工具;
date: 2021-08-08T12:00:00+08:00
---

# 特性

支持：HTTP | DNS | TCP | FILE support
所有模版都是可以配置的
可大量扫描
基于外带发现
便于编写自定义模版

# 安装
## go 安装
GO111MODULE=on go get -v github.com/projectdiscovery/nuclei/v2/cmd/nuclei

## mac安装
brew install nuclei
## docker安装
docker pull projectdiscovery/nuclei:latest
## github安装
git clone https://github.com/projectdiscovery/nuclei.git; \
cd nuclei/v2/cmd/nuclei; \
go build; \
mv nuclei /usr/local/bin/; \
nuclei -version;
## 源码安装
https://github.com/projectdiscovery/nuclei/releases


# 基本命令
```
Nuclei is a fast tool for configurable targeted scanning 
based on templates offering massive extensibility and ease of use.

Usage:
  /Users/xt/Documents/hack/scan/nuclei/nuclei [flags]

Flags:
   -H, -header value                      Custom Header.
   -biid, -burp-collaborator-biid string  Burp Collaborator BIID
   -bs, -bulk-size int                    Maximum Number of hosts analyzed in parallel per template (default 25)
   -c, -concurrency int                   Maximum Number of templates executed in parallel (default 10)
   -config string                         Nuclei configuration file
   -de, -disk-export string               Directory on disk to export reports in markdown to
   -debug                                 Debugging request and responses
   -debug-req                             Debugging request
   -debug-resp                            Debugging response
   -et, -exclude value                    Templates to exclude, supports single and multiple templates using directory.
   -etags, -exclude-tags value            Exclude templates with the provided tags
   -headless                              Enable headless browser based templates support
   -impact, -severity value               Templates to run based on severity, supports single and multiple severity.
   -irr, -include-rr                      Write requests/responses for matches in JSON output
   -interactions-cache-size int           Number of requests to keep in interactions cache (default 5000)
   -interactions-cooldown-period int      Extra time for interaction polling before exiting (default 5)
   -interactions-eviction int             Number of seconds to wait before evicting requests from cache (default 60)
   -interactions-poll-duration int        Number of seconds before each interaction poll request (default 5)
   -interactsh-url string                 Interactsh Server URL (default https://interact.sh)
   -json                                  Write json output to files
   -l, -list string                       List of URLs to run templates on
   -metrics                               Expose nuclei metrics on a port
   -metrics-port int                      Port to expose nuclei metrics on (default 9092)
   -nc, -no-color                         Disable colors in output
   -nt, -new-templates                    Only run newly added templates
   -nm, -no-meta                          Don't display metadata for the matches
   -no-interactsh                         Do not use interactsh server for blind interaction polling
   -o, -output string                     File to write output to (optional)
   -page-timeout int                      Seconds to wait for each page in headless (default 20)
   -passive                               Enable Passive HTTP response processing mode
   -project                               Use a project folder to avoid sending same request multiple times
   -project-path string                   Use a user defined project folder, temporary folder is used if not specified but enabled
   -proxy-socks-url string                URL of the proxy socks server
   -proxy-url string                      URL of the proxy server
   -r, -resolvers string                  File containing resolver list for nuclei
   -rl, -rate-limit int                   Maximum requests to send per second (default 150)
   -rc, -report-config string             Nuclei Reporting Module configuration file
   -rdb, -report-db string                Local Nuclei Reporting Database (Always use this to persistent report data)
   -retries int                           Number of times to retry a failed request (default 1)
   -show-browser                          Show the browser on the screen
   -si, -stats-interval int               Number of seconds between each stats line (default 5)
   -silent                                Show only results in output
   -spm, -stop-at-first-path              Stop processing http requests at first match (this may break template/workflow logic)
   -stats                                 Display stats of the running scan
   -system-resolvers                      Use system dns resolving as error fallback
   -t, -templates value                   Templates to run, supports single and multiple templates using directory.
   -tags value                            Tags to execute templates for
   -u, -target string                     URL to scan with nuclei
   -tv, -templates-version                Shows the installed nuclei-templates version
   -timeout int                           Time to wait in seconds before timeout (default 5)
   -tl                                    List available templates
   -trace-log string                      File to write sent requests trace log
   -ud, -update-directory string          Directory storing nuclei-templates (default /Users/xt/nuclei-templates)
   -ut, -update-templates                 Download / updates nuclei community templates
   -v, -verbose                           Show verbose output
   -version                               Show version of nuclei
   -w, -workflows value                   Workflows to run for nuclei
```

https://nuclei.projectdiscovery.io/nuclei/get-started/
# 基本用法


## 有两种方式扫描

### 1. 模版 (-t/templates)

默认情况下所有的模版（除了nuclei-ignore列）从安装目录中获取默认的模版执行
```
nuclei -u https://example.com
```
如果使用大量模版进行扫描或者多个模版地址可以使用下列方式扫描
```
nuclei -u https://example.com -t cves/ -t exposures/
```
在针对url列表文件扫描的时候，模版也可以被执行
```
nuclei -list http_urls.txt
```
### 2. workflows (-w/workflows)

```
nuclei -u https://example.com -w workflows/
```
同样的在扫描列表文件的时候也会执行工作流
```
nuclei -list http_urls.txt -w workflows/wordpress-workflow.yaml
```
## 过滤用法

nuclei引擎对改造的模版执行支持3种基本的过滤
1. Tags (-tags)
基于模板中可用的标签字段进行筛选。
2. Severity (-severity)
基于模板中可用的安全性字段进行筛选。
3. Author (-author)
基于模版中作者字段进行过滤

默认情况下，过滤应用在模版加载的路径中，~/nuclei-templates目录并且存在cve标签
```
nuclei -u https://example.com -tags cve
```
这个样本将会运行在```~/nuclei-templates/exposures/```目录中并且存在config标签的所有的模版。
```
nuclei -u https://example.com -tags config -t exposures/
```
多重过滤可以和AND指令一起使用，在下面的荔枝中所有的cve标签的仅仅模版或者geeknik作者的高危模版进行扫描。
```
nuclei -u https://example.com -tags cve -severity critical,high -author geeknik
```
同样的使用工作流也是一样：
```
nuclei -w workflows/wordpress-workflow.yaml -severity critical,high -list http_urls.txt
```
## 速度限制
nuclei有多种限制速度的因素，包括限制并发数，每个模块同时扫描的主机数，以及每秒发包数。下面是详情的描述。


|标志	|描述|
|---|---|
|rate-limit	|控制每秒发包总数，rate-limit有先执行其他两个参数，每秒发包数在最后控制|
|bulk-size|控制每个模块同时并发扫描的主机数|
|c|控制同时并发的模块数|

## 通信报文自定义

很多漏洞利用平台或者程序需要你定义HTTP通信，这个可以通过配置配置文件处理：
```
$HOME/.config/nuclei/config.yaml 
或 
CLI flag -H / header
```

例如
```
# Headers to include with each request.
header:
  - 'X-BugBounty-Hacker: h1/geekboy'
  - 'User-Agent: Mozilla/5.0 (Windows NT 10.0; WOW64) / nuclei'
```

```
nuclei -header 'User-Agent: Mozilla/5.0 (Windows NT 10.0; WOW64) / nuclei' -list urls.txt -tags cves
```

## 模版排除
核支持各种方法来排除/阻止模板执行。默认情况下，nuclei会排除下面列出的标签/模板执行，以避免意外的基于模糊扫描和一些不应该运行的大规模扫描，这些可以很容易通过修改配置文件/标志覆盖。
默认的排除清单有：https://github.com/projectdiscovery/nuclei-templates/blob/master/.nuclei-ignore
tags: 
  - "fuzz"
  - "dos"
  - "misc"
nuclei引擎支持两种方式排除扫描：
1. 排除模版（-exclude-templates/exclude）
exclude-templates 标志常用来执行单个或者多个模版和目录的过滤。-exclude-templates标志可以被用来提供多种值。

2. 排除标签（-exclude-tags/etags）
exclude-tags 标志用来排除给定的单个或多个模版。

```
# 过滤 cves/2020/CVE-2020-XXXX.yaml
nuclei -list urls.txt -t cves/ -exclude-templates cves/2020/CVE-2020-XXXX.yaml
# 过滤多个模版
nuclei -list urls.txt -exclude-templates exposed-panels/ -exclude-templates technologies/
# 过滤单个标签模版
nuclei -l urls.txt -t cves/ -etags xss
# 过滤多个标签模版
nuclei -l urls.txt -t cves/ -etags sqli,rce
# 排除标签或模版
nuclei -l urls.txt -include-tags iot,misc,fuzz
```

## nuclei的配置
默认配置文件地址为：$HOME/.config/nuclei/config.yaml

```
# Headers to include with all HTTP request
header:
  - 'X-BugBounty-Hacker: h1/geekboy'

# Directory based template execution 模版的目录
templates:
  - cves/
  - vulnerabilities/
  - misconfiguration/

# Tags based template execution
tags: exposures,cve

# Templates Filters 模版过滤
tags: exposures,cve
author: geeknik,pikpikcu,dhiyaneshdk
severity: critical,high,medium

# Template Allowlist 模版允许列
include-tags: dos,fuzz # Tag based inclusion (allows to overwrite nuclei-ignore list)
include-templates: # Template based inclusion (allows to overwrite nuclei-ignore list)
  - vulnerabilities/xxx
  - misconfiguration/xxxx

# Template Denylist 模版停止使用
exclude-tags: info # Tag based exclusion
exclude-templates: # Template based exclusion
  - vulnerabilities/xxx
  - misconfiguration/xxxx

# Rate Limit configuration 
rate-limit: 500
bulk-size: 50
concurrency: 50
```
自定义模版加载
```
nuclei -config project.yaml -list urls.txt
```

### nuclei报告-自动同步报告
报告支持github，gitlab，jira整合，这允许nuclei引擎创建自动的票据同步到相关平台相关扫描结果。
```
-rc, -report-config
```
github report
相关标识可以被用来提供配置文件读取平台细节。如下面是所有支持平台对接的配置文件举例。 https://github.com/projectdiscovery/nuclei/blob/master/v2/cmd/nuclei/issue-tracker-config.yaml
例如，创建一个github的凭证，创建配置文件替换相关配置值即可。
```
# Github contains configuration options for GitHub issue tracker

github: 
  username: "$user"
  owner: "$user"
  token: "$token"
  project-name: "testing-project"
  issue-label: "Nuclei"
```

使用输出报告模式运行nuclei
```
nuclei -l urls.txt -t cves/ -rc issue-tracker.yaml
```
同样的，其他平台也可以同样配置。报告模块同样支持基本的过滤和重复检查以避免重复凭证创建。
```
allow-list:
  severity: high,critical
```
这个配置将会确保只定义高危和紧急的安全项输出和检查，```deny-list````用于阻止一些指定的级别的安全项。

如果你在相同的资产运行周期的任务，你可以考虑-rdb，-report-db标识，本用于在给定目录创建本地副目录用于对问题比较和相关票据存放。
```
nuclei -l urls.txt -t cves/ -rc issue-tracker.yaml -rdb prod
```


### markdown报告扩展
nuclei支持markdown格式扩展，使用-me，-markdown-export标记，这个标记可以将目录作为输入，用来存储markdown格式的报告。

如果想要包括请求包和相应包的markdown报告，可以使用 -irr，-include-rr标记，这个标记只能在-me参数下使用。

```
nuclei -l urls.txt -t cves/ -irr -markdown-export reports
```
## 扫描统计
nuclei使用-metrics标记时，在执行扫描的时候会在本地开启9092端口，本地访问localhost:9092/metrics，默认端口可以通过-metrics-port标识修改。

下面是一些例子，当执行```nuclei -t cves/ -l urls.txt -metrics```的时候，通过下列命令获取扫描统计信息：
```
curl -s localhost:9092/metrics | jq .
```
```
{
  "duration": "0:00:03",
  "errors": "2",
  "hosts": "1",
  "matched": "0",
  "percent": "99",
  "requests": "350",
  "rps": "132",
  "startedAt": "2021-03-27T18:02:18.886745+05:30",
  "templates": "256",
  "total": "352"
}
```

## 被动扫描功能

nucleus引擎支持利用文件支持对基于HTTP的模板进行被动模式扫描，有了这种支持，我们可以对从任何其他工具收集的本地存储的HTTP响应数据运行基于HTTP的模板。

```
nuclei -passive -target http_data
```
被动模式对具有```{{BasedURL}}```或```{{BasedURL/}}```作为基路径的模板的支持是有限的。



参考：

https://blog.projectdiscovery.io/nuclei-v2-4-0-release/







# 模版细节

get-start
https://nuclei.projectdiscovery.io/templating-guide/

每个模版都有一个独一无二的ID用于输出相关名称
