---
title: 漏洞验证工具nuclei官方模版编写中文译文归档
tag: 漏洞验证工具;
date: 2021-08-13T12:00:00+08:00

---




参考：https://nuclei.projectdiscovery.io/templating-guide/

# 模版详情

## ID

每个模板都有一个唯一的 ID，在输出写入期间用于指定输出行的模板名称。
模板文件以YAML扩展名结尾。模板文件可以由您选择的任何文本编辑器创建。

```
id: git-config
```

ID 不能包含空格。这样做是为了允许更容易的输出解析。

## INFO

信息
关于模板的下一个重要信息是信息块。信息块提供名称、作者、描述、严重性和标签。它还包含指示模板严重性的严重性字段，信息块也支持动态字段，因此可以定义 N 个key: value块以提供有关模板的更多有用信息。reference是另一个流行的标签，用于为模板定义外部参考链接。

另一个始终添加到info块中的有用标签是tags。这可以让你一些自定义标签设置为一个模板，视象的目的cve，rce等等。这使核与输入标签识别模板，只运行它们。

信息块示例 -

```
info:  name: Git Config File Detection Template  author: Ice3man  severity: medium  description: Searches for the pattern /.git/config on passed URLs.  tags: git,config
```

实际请求和相应的匹配器放置在信息块下方，它们执行向目标服务器发出请求并查找模板请求是否成功的任务。

每个模板文件可以包含多个要进行的请求。模板被迭代，并且一个一个地向目标站点发出所需的请求。

## 基本请求

Nuclei 为与 HTTP 协议相关的各种功能提供广泛的支持。支持基于原始和模型的 HTTP 请求，以及非 RFC 客户端请求支持的选项。还可以指定有效负载，并且可以根据有效负载值以及本页面稍后显示的更多功能来转换原始请求。

### request

HTTP 请求以一个request块开始，该块指定模板请求的开始。

```
# Start the requests for the template right hererequests:
```

### method

根据需要，请求方法可以是GET、POST、PUT、DELETE等。

```
# Method is the method for the requestmethod: GET
```

### redirects

可以为每个模板指定重定向条件。默认情况下，不遵循重定向。但是，如果需要，可以redirects: true在请求详细信息中启用它们。默认情况下最多跟随 10 个重定向，这对于大多数用例来说应该足够了。可以对重定向数量进行更细粒度的控制，然后使用max-redirects字段。

用法用例：

```
requests:  - method: GET    path:      - "{{BaseURL}}/login.php"    redirects: true    max-redirects: 3
```

### path

变量以开头{{和结尾，}}并且区分大小写。
{{BaseURL}} - 这将在请求中的运行时替换为目标文件中指定的原始 URL。
{{Hostname}} - Hostname 变量在运行时由目标的主机名替换。

动态变量替换示例

```
path: "{{BaseURL}}/.git/config"# This path will be replaced on execution with BaseURL# If BaseURL is set to  https://abc.com then the# path will get replaced to the following: https://abc.com/.git/config
```

也可以在为目标请求的一个请求中指定多个路径。

### headers

还可以指定与请求一起发送的标头。标头以键/值对的形式放置。示例标头配置如下所示：

```
# headers contains the headers for the requestheaders:  # Custom user-agent header  User-Agent: Some-Random-User-Agent  # Custom request origin  Origin: https://google.com
```

### body

Body 指定要与请求一起发送的正文。

```
# Body is a string sent along with the requestbody: "{\"some random JSON\"}"# Body is a string sent along with the requestbody: "admin=test"
```

### session

要维护基于 cookie 的浏览器，如多个请求之间的会话，您可以简单地cookie-reuse: true在模板中使用，在您希望在一系列请求之间维护会话以完成漏洞利用链并执行身份验证扫描的情况下很有用。

```
# cookie-reuse accepts boolean input and false as defaultcookie-reuse: true
```

### 请求条件

请求条件允许检查多个请求之间的条件，以编写复杂的检查和漏洞利用涉及多个 HTTP 请求以完成漏洞利用链。

使用 DSL 匹配器，它可以通过添加req-condition: true和数字作为后缀来使用，例如status_code_1，具有各自的属性。status_code_3body_2

> 关于DSL可以参见：https://www.cnblogs.com/xuwujing/p/11567053.html

```
 req-condition: true    matchers:      - type: dsl        dsl:          - "status_code_1 == 404 && status_code_2 == 200 && contains((body_2), 'secret_string')"
```

### 完整模版样例

最终模版文件可以看到如下所示

```
id: git-configinfo:  name: Git Config File  author: Ice3man  severity: medium  description: Searches for the pattern /.git/config on passed URLs.requests:  - method: GET    path:      - "{{BaseURL}}/.git/config"    matchers:      - type: word        words:          - "[core]"
```

### 原始http请求

创建请求的另一种方法是使用原始请求，它具有更大的灵活性和对 DSL 辅助函数的支持，如下所示（目前建议将Host标头保留为示例中的变量{{Hostname}}）、所有匹配器、提取器功能可以以与上述相同的方式与 RAW 请求一起使用。

```
requests:  - raw:    - |        POST /path2/ HTTP/1.1        Host: {{Hostname}}        Content-Length: 1        Origin: https://www.google.com        Content-Type: application/x-www-form-urlencoded        User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko)        Accept-Language: en-US,en;q=0.9        a=test&b=pd
```

可以对请求进行微调以根据需要执行确切的任务。Nuclei 请求是完全可配置的，这意味着您可以配置和定义有关将发送到目标服务器的请求的每一件事。

RAW 请求格式还支持[各种帮助函数](https://nuclei.projectdiscovery.io/templating-guide/helper-functions/)，让我们可以使用输入进行运行时操作。在标题中使用辅助函数的示例。

```
raw:      - |        GET /manager/html HTTP/1.1        Host: {{Hostname}}        Authorization: Basic {{base64('username:password')}} # Helper function to encode input at run time.        User-Agent: Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0        Accept-Language: en-US,en;q=0.9        Connection: close
```

### http模糊测试

信息

```
核发动机支撑模糊化模块，其允许以运行各种类型在多个格式的有效载荷，这是可能的（或使用括号来定义与简单的关键词的占位符{{helper_function(variable)}}的情况下，增变器功能被需要），并执行狙击，杈和clusterbomb攻击。这些攻击的词表需要在 Payload 字段下的请求定义期间定义，名称与关键字匹配，Nuclei 支持基于文件和模板词表支持，最后所有 DSL 功能都完全可用和支持，可以使用操纵最终值。有效负载使用变量名称定义，可以在请求之间§ §或{{ }}标记中引用。
```

使用带有本地词表的有效负载的示例：

```
requests:    # HTTP Intruder fuzzing using local wordlist.  - payloads:      paths: params.txt      header: local.txt
```

使用具有模板词表支持的有效负载的示例：
requests:

```
    # HTTP Intruder fuzzing using in template wordlist.  - payloads:      password:        - admin        - guest        - password
```

注意：-选择攻击类型时要小心，因为意外的输入会破坏模板。

例如，如果您使用clusterbomb或pitchfork作为攻击类型并且仅在有效负载部分定义了一个变量，则模板将无法编译，因为clusterbomb或pitchfork期望在模板中使用多个变量。

攻击方式
Nuclei 引擎支持多种攻击类型，包括sniper通常用于对单个参数进行模糊测试，clusterbomb以及pitchfork用于对多个参数进行模糊测试，其工作方式与经典的 burp intruder 相同。

nuclei对burp intruder的三种爆破类型均支持。

#### sniper

sniper(狙击手) 模式仅使用一组有效载荷，并且一次仅替换一个位置。它遍历有效载荷集，首先仅用有效载荷替换第一个标记位置，并将所有其他位置保留为原始值。在完成第一个位置后，它继续第二个位置。

#### pitchfork

pitchfork（交叉）攻击类型为每个位置使用一个有效载荷集。它将第一个有效载荷放在第一个位置，将第二个有效载荷放在第二个位置，依此类推。

然后它同时循环遍历所有有效载荷集。第一个请求使用每个负载集中的第一个负载，第二个请求使用每个负载集中的第二个负载，依此类推。

#### clusterbomb

集束炸弹攻击尝试所有不同的有效载荷组合。它仍然将第一个有效载荷放在第一个位置，将第二个有效载荷放在第二个位置。但是当它遍历有效载荷集时，它会尝试所有组合。

然后它同时循环遍历所有有效载荷集。第一个请求使用每个负载集中的第一个负载，第二个请求使用每个负载集中的第二个负载，依此类推。

这种攻击类型对于蛮力攻击很有用。在第一个负载集中加载常用用户名列表，在第二个负载集中加载常用密码列表。然后集束炸弹攻击将尝试所有组合。

[更多详情](https://www.sjoerdlangkemper.nl/2017/08/02/burp-intruder-attack-types/)

使用clusterbomb进行模糊测试示例：

```
requests:  - payloads:      path: helpers/wordlists/prams.txt      header: helpers/wordlists/header.txt    # Defining HTTP fuzz attack type    attack: clusterbomb    raw:      - |        POST /?file={{path}} HTTP/1.1        User-Agent: {{header}}        Host: {{Hostname}}
```

### 不安全的 HTTP 请求

Nuclei 支持[rawhttp](https://github.com/projectdiscovery/rawhttp)以实现完整的请求控制和自定义，允许针对 HTTP 请求走私、主机头注入、带有格式错误字符的 CRLF 等问题的任何类型的格式错误的请求。

rawhttp库默认是禁用的，可以通过包含unsafe: true在请求块中来启用。

下面是一个使用rawhttp.

```
requests:  - raw:    - |+        POST / HTTP/1.1        Host: {{Hostname}}        Content-Type: application/x-www-form-urlencoded        Content-Length: 150        Transfer-Encoding: chunked        0        GET /post?postId=5 HTTP/1.1        User-Agent: a"/><script>alert(1)</script>        Content-Type: application/x-www-form-urlencoded        Content-Length: 5        x=1    - |+        GET /post?postId=5 HTTP/1.1        Host: {{Hostname}}    # Enables rawhttp client    unsafe: true    matchers:      - type: dsl        dsl:          - 'contains(body, "<script>alert(1)</script>")'
```

### 高级模糊测试

我们丰富了核以允许对 Web 服务器进行高级模糊测试。用户现在可以使用多个选项来调整 HTTP 模糊测试工作流。

#### pipeline

添加了 HTTP pipeline流水线支持，允许在同一个连接上发送多个 HTTP 请求，其灵感来自[http-desync-attacks-request-smuggling-reborn](https://portswigger.net/research/http-desync-attacks-request-smuggling-reborn)。

在运行基于 HTTP 流水线的模板之前，请确保运行目标支持 HTTP 流水线连接，否则核引擎回退到标准 HTTP 请求引擎。

如果你想确认给定的域或子域列表支持 HTTP Pipelining，httpx有一个标志-pipeline可以这样做。

配置显示核的流水线属性的示例。

```
  unsafe: true    pipeline: true    pipeline-max-connections: 40    pipeline-max-workers: 25000
```

下面提供了一个演示核的流水线功能的示例模板-


id: pipeline-testing
info:
  name: pipeline testing
  author: pdteam
  severity: info

requests:

```
  - payloads:      path: path_wordlist.txt    attack: sniper    unsafe: true    pipeline: true    pipeline-max-connections: 40    pipeline-max-workers: 25000    raw:      - |+        GET /§path§ HTTP/1.1        Host: {{Hostname}}        User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:79.0) Gecko/20100101 Firefox/79.0        Accept: application/json, text/plain, */*        Accept-Language: en-US,en;q=0.5        Referer: {{BaseURL}}        Connection: keep-alive            matchers:      - type: status        part: header        status:          - 200
```

#### Connection pooling

Connection pooling连接池,虽然较早版本的 nuclei 没有进行连接池，但用户现在可以配置模板以使用或不使用 HTTP 连接池。这允许根据要求进行更快的扫描。

要在模板中启用连接池，threads可以使用您想要在有效负载部分中使用的相应线程数定义属性。

Connection: Close 标头不能在 HTTP 连接池模板中使用，否则引擎将失败并回退到带池的标准 HTTP 请求。

使用 HTTP 连接池的示例模板 -

```
id: fuzzing-exampleinfo:  name: Connection pooling example  author: pdteam  severity: inforequests:  - payloads:      password: password.txt    threads: 40    attack: sniper    raw:      - |        GET /protected HTTP/1.1        Host: {{Hostname}}        Authorization: Basic {{base64('admin:§password§')}}        User-Agent: Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0        Accept-Language: en-US,en;q=0.9    matchers-condition: and    matchers:      - type: status        status:          - 200      - type: word        words:          - "Unique string"        part: body  
```

#### HTTP Smuggling

HTTP Smuggling走私 是 Portswigger对该主题的研究最近流行起来的一类 Web 攻击。如需深入了解，请访问上面链接的文章。

在开源领域，检测http走私是很困难的，特别是由于检测请求本质上是畸形的。Nuclei 能够利用rawhttp引擎可靠地检测 HTTP Smuggling漏洞。

HTTP Smuggling 漏洞的最基本示例是 CL.TE Smuggling。下面提供了一个使用unsafe: true基于 rawhttp 请求的属性来检测 CE.TL HTTP Smuggling 漏洞的示例模板。

```
id: CL.TE-http-smugglinginfo:  name: HTTP request smuggling, basic CL.TE vulnerability  author: pdteam  severity: info  lab: https://portswigger.net/web-security/request-smuggling/lab-basic-cl-terequests:  - raw:    - |+      POST / HTTP/1.1      Host: {{Hostname}}      Connection: keep-alive      Content-Type: application/x-www-form-urlencoded      Content-Length: 6      Transfer-Encoding: chunked      0      G          - |+      POST / HTTP/1.1      Host: {{Hostname}}      Connection: keep-alive      Content-Type: application/x-www-form-urlencoded      Content-Length: 6      Transfer-Encoding: chunked      0      G    unsafe: true    matchers:      - type: word        words:          - 'Unrecognized method GPOST'
```

模板示例部分提供了更多示例，用于走私模板。

#### Race condition testing

Race condition testing竞争条件是另一类无法通过传统工具轻松自动化的错误。Burp Suite 为 Turbo Intruder 引入了一种 Gate 机制，其中所有请求的所有字节都被发送，除了最后一个字节外，只有所有同步发送事件的请求才会一起发送。

我们在 nuclei 引擎中实现了Gate机制，并允许它们通过模板运行，这使得对这个特定错误类的测试变得简单和便携。

要在模板中启用竞争条件检查，race可以将属性设置为true并race_count定义要发起的同时请求的数量。

下面是一个示例模板，其中使用门逻辑将同一请求重复 10 次。

```
id: race-condition-testinginfo:  name: Race condition testing  author: pdteam  severity: inforequests:  - raw:      - |        POST /coupons HTTP/1.1        Host: {{Hostname}}        Pragma: no-cache        Cache-Control: no-cache, no-transform        User-Agent: Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:47.0) Gecko/20100101 Firefox/47.0        promo_code=20OFF            race: true    race_count: 10    matchers:      - type: status        part: header        status:          - 200
```

您可以简单地POST用任何可疑的易受攻击的请求替换该请求，并race_count根据您的需要进行更改，它就可以运行了。

```
nuclei -t race.yaml -target https://api.target.com
```

#### Race condition testing with multiple requests

Race condition testing with multiple requests测试对于需要发送多个请求以利用竞争条件的场景，我们可以使用线程。

```
    threads: 5    race: true
```

`threads` 是您希望使用模板进行竞争条件测试的请求总数。

下面是一个示例模板，其中将使用门逻辑同时发送多个 (5) 唯一请求。

```
id: multi-request-raceinfo:  name: Race condition testing with multiple requests  author: pd-team  severity: inforequests:  - raw:        - |        POST / HTTP/1.1        Pragma: no-cache        Host: {{Hostname}}        Cache-Control: no-cache, no-transform        User-Agent: Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:47.0) Gecko/20100101 Firefox/47.0        id=1      - |        POST / HTTP/1.1        Pragma: no-cache        Host: {{Hostname}}        Cache-Control: no-cache, no-transform        User-Agent: Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:47.0) Gecko/20100101 Firefox/47.0        id=2      - |        POST / HTTP/1.1        Pragma: no-cache        Host: {{Hostname}}        Cache-Control: no-cache, no-transform        User-Agent: Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:47.0) Gecko/20100101 Firefox/47.0        id=3      - |        POST / HTTP/1.1        Pragma: no-cache        Host: {{Hostname}}        Cache-Control: no-cache, no-transform        User-Agent: Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:47.0) Gecko/20100101 Firefox/47.0        id=4      - |        POST / HTTP/1.1        Pragma: no-cache        Host: {{Hostname}}        Cache-Control: no-cache, no-transform        User-Agent: Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:47.0) Gecko/20100101 Firefox/47.0        id=5    threads: 5    race: true
```

## headless 无头情况

### 无头请求

Nuclei 通过简单的 DSL 支持浏览器的自动化。无头浏览器引擎可以完全自定义，用户操作可以编写脚本，允许完全控制浏览器。这允许各种独特和自定义的工作流程。

```
# Start the requests for the template right hereheadless:
```

#### Action行动

Action 是 Nuclei Headless Engine 的单个任务。每个动作都以某种方式操纵浏览器状态，最终导致我们感兴趣的状态捕获。

Nuclei 支持多种操作。下面给出了这些操作及其参数的列表-

#### navigate导航

navigate导航访问给定的 URL。URL字段支持变量一样`{{BaseURL}}`，`{{Hostname}}`完全自定义的要求。

```
action: navigateargs:   url: "{{BaseURL}}
```

##### script脚本

脚本在当前浏览器页面上运行一段 JS 代码。在最简单的层面上，您只需为`code`要执行的 JS 片段提供一个参数，它就会在页面上运行。

```
action: scriptargs:  code: alert(document.domain)
```

假设你想在一个 JS 对象上运行一个匹配器来检查它的值。无头核也支持这种类型的数据提取用例。举个例子，假设应用程序设置了一个`window.random-object`用一个值调用的对象，并且您想要匹配该值。

```
- action: script  args:    code: window.random-object  name: script-name...matchers:  - type: word    part: script-name    words:      - "some-value"
```

Nuclei 支持在使用`hook`参数加载页面之前运行一些自定义 Javascript 。这将始终在加载任何页面之前运行提供的 Javascript。

该示例提供了钩子 window.alert，以便应用程序生成的警报不会停止爬虫。

```
- action: script  args:    code: (function() { window.alert=function(){} })()    hook: true
```

这是一个用例，函数挂钩还有更多用例，例如 DOM XSS 检测和基于 Javascript 注入的测试技术。示例页面上提供了更多示例。

##### click点击

单击模拟使用鼠标左键单击选择器指定的元素。

```
action: clickargs:   by: xpath  xpath: /html/body/div[1]/div[3]/form/div[2]/div[1]/div[1]/div/div[2]/input
```

Nuclei 支持多种选择器类型，包括但不限于 XPath、Regex、CSS 等。有关选择器的更多信息，请参见[此处](https://nuclei.projectdiscovery.io/templating-guide/protocols/headless/#selectors)。

##### RightClick右键点击

RightClick 模拟使用鼠标右键单击选择器指定的元素。

```
action: rightclickargs:   by: xpath  xpath: /html/body/div[1]/div[3]/form/div[2]/div[1]/div[1]/div/div[2]/input
```

##### 文本

文本模拟使用键盘在输入中输入内容。选择器可用于指定要输入的元素。

```
action: textargs:   by: xpath  xpath: /html/body/div[1]/div[3]/form/div[2]/div[1]/div[1]/div/div[2]/input  value: username
```

##### 截屏

Screenshots 获取页面的屏幕截图并将其写入磁盘。它支持整页和普通屏幕截图。

```
action: screenshotargs:   to: /root/test/screenshot-web
```

如果您需要整页屏幕截图，可以使用`fullpage: true`args 中的选项来实现。

```
action: screenshotargs:   to: /root/test/screenshot-web  fullpage: true
```

##### 时间

时间以 RFC3339 格式将值输入到页面上的时间输入中。

```
action: timeargs:   by: xpath  xpath: /html/body/div[1]/div[3]/form/div[2]/div[1]/div[1]/div/div[2]/input  value: 2006-01-02T15:04:05Z07:00
```

##### 选择

Select 通过选择器对 HTML 输入执行选择。

```
action: selectargs:   by: xpath  xpath: /html/body/div[1]/div[3]/form/div[2]/div[1]/div[1]/div/div[2]/input  selected: true  value: option[value=two]  selector: regex
```

##### files

文件处理网页上的文件上传输入。

```
action: filesargs:   by: xpath  xpath: /html/body/div[1]/div[3]/form/div[2]/div[1]/div[1]/div/div[2]/input  value: /root/test/payload.txt
```

##### WaitLoads等待负载

WaitLoads 等待页面完成加载并进入空闲状态。

```
action: waitload
```

Nuclei 的`waitload`操作等待 DOM 加载，并接收 window.onload 事件，然后我们等待页面空闲 1 秒。

##### GetResource获取资源

GetResource 返回元素的 src 属性。

```
action: getresourcename: extracted-value-srcargs:   by: xpath  xpath: /html/body/div[1]/div[3]/form/div[2]/div[1]/div[1]/div/div[2]/input
```

##### Extract提炼

Extract 提取 HTML 节点的文本或用户指定的属性。

下面的代码将提取给定 XPath 选择器元素的文本，然后也可以`extracted-value`使用匹配器和提取器按名称进行匹配。

```
action: extractname: extracted-valueargs:   by: xpath  xpath: /html/body/div[1]/div[3]/form/div[2]/div[1]/div[1]/div/div[2]/input
```

还可以为元素提取属性。例如 -

```
action: extractname: extracted-value-hrefargs:   by: xpath  xpath: /html/body/div[1]/div[3]/form/div[2]/div[1]/div[1]/div/div[2]/input  target: attribute  attribute: href
```

##### SetMethod设置方法

SetMethod 覆盖请求的方法。

```
action: setmethodargs:   part: request  method: DELETE
```

##### AddHeader添加标题

AddHeader 向请求/响应添加标头。这不会覆盖任何预先存在的标头。

```
action: addheaderargs:   part: response # can be request too  key: Content-Security-Policy  value: "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
```

##### SetHeader设置头

SetHeader 在请求/响应中设置标头。

```
action: setheaderargs:   part: response # can be request too  key: Content-Security-Policy  value: "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
```

##### DeleteHeader删除头

DeleteHeader 从请求/响应中删除标头。

```
action: deleteheaderargs:   part: response # can be request too  key: Content-Security-Policy
```

##### SetBody集合体

SetBody 设置请求/响应的主体。

```
action: setbodyargs:   part: response # can be request too  body: '{"success":"ok"}'
```

##### WaitEvent等待事件

WaitEvent 等待事件在页面上触发。

```
action: waiteventargs:   event: 'Page.loadEventFired'
```

[此处](https://github.com/go-rod/rod/blob/master/lib/proto/definitions.go)列出[了](https://github.com/go-rod/rod/blob/master/lib/proto/definitions.go)支持的事件列表。

##### 键盘

Keybord 模拟键盘上的单个按键。

```
action: keyboardargs:   keys: '\r' # this simulates pressing enter key on keyboard
```

`keys` 参数接受键码。

##### 调试

Debug 在每个 headless 操作之间添加 5 秒的延迟，并显示浏览器中发生的所有 headless 事件的跟踪。

> 注意：仅用于调试目的，不要在生产模板中使用它。

```
action: debug
```

##### 睡觉

Sleeps 使浏览器等待指定的持续时间（以秒为单位）。这对于调试目的也很有用。

```
action: sleepargs:  duration: 5
```

#### 选择器

选择器是核无头引擎如何识别执行动作的元素。Nuclei 通过包含各种选项来支持获取选择器 -

| 选择器              | 描述                                    |
| :------------------ | :-------------------------------------- |
| `r` / `regex`       | 元素匹配 CSS 选择器和文本匹配正则表达式 |
| `x` / `xpath`       | 元素匹配 XPath 选择器                   |
| `js`                | 从 JS 函数返回元素                      |
| `search`            | 搜索查询（可以是文本、XPATH、CSS）      |
| `selector` （默认） | 元素匹配 CSS 选择器                     |

#### 匹配器/提取器部件

匹配器/提取器`part`的**无头**协议支持的有效值是 -

| 价值           | 描述                      |
| :------------- | :------------------------ |
| 要求           | 无头请求                  |
| `<out_names>`  | 带有存储值的动作名称      |
| 原始/身体/数据 | 来自浏览器的最终 DOM 响应 |

#### **无头模板示例**

下面提供了一个自动登录到 DVWA 的无头模板示例 -

```
id: dvwa-headless-automatic-logininfo:  name: DVWA Headless Automatic Login  author: pdteam  severity: highheadless:  - steps:      - args:          url: "{{BaseURL}}/login.php"        action: navigate      - action: waitload      - args:          by: xpath          xpath: /html/body/div/div[2]/form/fieldset/input        action: click      - action: waitload      - args:          by: xpath          value: admin          xpath: /html/body/div/div[2]/form/fieldset/input        action: text      - args:          by: xpath          xpath: /html/body/div/div[2]/form/fieldset/input[2]        action: click      - action: waitload      - args:          by: xpath          value: password          xpath: /html/body/div/div[2]/form/fieldset/input[2]        action: text      - args:          by: xpath          xpath: /html/body/div/div[2]/form/fieldset/p/input        action: click      - action: waitload    matchers:      - part: resp        type: word        words:          - "You have logged in as"
```

[此处](https://nuclei.projectdiscovery.io/template-examples/headless/)提供[了](https://nuclei.projectdiscovery.io/template-examples/headless/)更完整的示例

## 网络

### 网络请求

Nuclei 可以充当可自动化的**Netcat**，允许用户通过网络发送字节并接收它们，同时提供匹配和提取响应的功能。

网络请求以指定模板请求开始的**网络**块开始。

```
# Start the requests for the template right herenetwork:
```

#### 输入

请求中的第一件事是**输入**。输入是将发送到服务器的数据，以及可选的从服务器读取的任何数据。

最简单的方法是指定一个字符串，它将通过网络套接字发送。

```
# inputs is the list of inputs to send to the serverinputs:   - data: "TEST\r\n"
```

您还可以发送将首先解码的十六进制编码文本，并将原始字节发送到服务器。

```
inputs:  - data: "50494e47"    type: hex  - data: "\r\n"
```

辅助函数表达式也可以在输入中定义，并且将首先评估然后发送到服务器。最后一个十六进制编码示例可以通过这种方式与辅助函数一起发送 -

```
inputs:  - data: 'hex_decode("50494e47")\r\n'
```

可以使用输入完成的最后一件事是从套接字读取数据。指定`read-size`一个非零值就可以了。您还可以为读取的数据指定一个名称，以便在该部分进行匹配。

```
inputs:  - read-size: 8
```

读取多个字节并仅匹配它们的示例。

```
inputs:  - read-size: 8    name: prefix...matchers:  - type: word    part: prefix    words:       - "CAFEBABE"
```

多个步骤可以按顺序链接在一起进行网络读/写。

#### 主持人

请求的下一部分是要连接的**主机**。动态变量可以放置在路径中以在运行时修改其值。变量以开头`{{`和结尾，`}}`并且区分大小写。

1. **主机名**- 变量由命令行上提供的主机名替换。

示例名称值：

```
host:   - "{{Hostname}}"
```

Nuclei 还可以与目标服务器进行 TLS 连接。只需`tls://`在**主机名**前添加前缀即可。

```
host:  - "tls://{{Hostname}}"
```

如果在主机中指定了端口，则用户提供的端口将被忽略并且模板端口优先。

#### 匹配器/提取器部件

匹配器/提取器`part`的**网络**协议支持的有效值为-

| 价值               | 描述                       |
| :----------------- | :------------------------- |
| 要求               | 网络请求                   |
| 数据               | 从网络套接字读取的最终数据 |
| 原始 / 身体 / 全部 | 从套接字接收的所有数据     |

#### **示例网络模板**

下面提供了`hex`用于检测在具有工作匹配器的服务器上运行的 MongoDB的编码输入的最终示例模板文件。

```
id: input-expressions-mongodb-detectinfo:  name: Input Expression MongoDB Detection  author: pd-team  severity: info  reference: https://github.com/orleven/Tentaclenetwork:  - inputs:      - data: "{{hex_decode('3a000000a741000000000000d40700000000000061646d696e2e24636d640000000000ffffffff130000001069736d6173746572000100000000')}}"    host:      - "{{Hostname}}"    read-size: 2048    matchers:      - type: word        words:          - "logicalSessionTimeout"          - "localTime"
```

[此处](https://nuclei.projectdiscovery.io/template-examples/network/)提供[了](https://nuclei.projectdiscovery.io/template-examples/network/)更完整的示例


## DNS



### DNS 请求

DNS 协议可以轻松地在核心中建模。原子核可以将完全可定制的 DNS 请求发送到名称服务器，并且可以对它们的响应执行匹配/提取。

DNS 请求以**dns**块开始，该块指定模板请求的开始。

```
# Start the requests for the template right heredns:
```

#### 类型

请求中的第一件事是**type**。请求类型可以是**A** , **NS** , **CNAME** , **SOA** , **PTR** , **MX** , **TXT** , **AAAA**。

```
# type is the type for the dns requesttype: A
```

#### 名称

请求的下一部分是要解析的 DNS**名称**。动态变量可以放置在路径中以在运行时修改其值。变量以开头`{{`和结尾，`}}`并且区分大小写。

1. **FQDN** - 变量在运行时由目标的主机名/FQDN 替换。

示例名称值：

```
name: {{FQDN}}.com# This value will be replaced on execution with the FQDN.# If FQDN is https://this.is.an.example then the# name will get replaced to the following: this.is.an.example.com
```

截至目前，该工具仅支持每个请求一个名称。

#### 班级

类类型可以是**INET**、**CSNET**、**CHAOS**、**HESIOD**、**NONE**和**ANY**。通常将其保留为**INET**就足够了。

```
# method is the class for the dns requestclass: inet
```

#### 递归

Recursion 是一个布尔值，它决定解析器是只返回缓存的结果，还是遍历整个 dns 根树以检索新结果。通常最好将其保留为**true**。

```
# Recursion is a boolean determining if the request is recursiverecursion: true
```

#### 重试

Retries 是在不同解析器之间放弃之前重试 dns 查询的尝试次数。推荐一个合理的值，比如**3**。

```
# Retries is a number of retries before giving up on dns resolutionretries: 3
```

#### 匹配器/提取器部件

匹配器/提取器`part`的**DNS**协议支持的有效值为-

| 价值             | 描述             |
| :--------------- | :--------------- |
| request          | DNS请求          |
| rcode            | DNS 编码         |
| question         | DNS 问题消息     |
| extra            | DNS 消息额外字段 |
| answer           | DNS 消息应答字段 |
| ns               | DNS 消息权限字段 |
| raw / all / body | 原始 DNS 消息    |

#### **示例 DNS 模板**

用于执行`A`查询并检查响应中是否有 CNAME 和 A 记录的最终示例模板文件如下：

```
id: dummy-cname-ainfo:  name: Dummy A dns request  author: mzack9999  severity: none  description: Checks if CNAME and A record is returned.dns:  - name: "{{FQDN}}"    type: A    class: inet    recursion: true    retries: 3    matchers:      - type: word        words:          # The response must contains a CNAME record          - "IN\tCNAME"          # and also at least 1 A record          - "IN\tA"        condition: and
```

[此处](https://nuclei.projectdiscovery.io/template-examples/dns/)提供[了](https://nuclei.projectdiscovery.io/template-examples/dns/)更完整的示例

## 文件

### 文件请求

Nuclei 允许建模模板也可以在文件系统上匹配/提取。

```
# Start of file template blockfile:
```

#### 扩展

要匹配所有扩展名（默认拒绝列表中的扩展名除外），请使用以下命令 -

```
extensions:  - all
```

您还可以提供应匹配的自定义扩展列表。

```
extensions:  - py  - go
```

还可以提供扩展的拒绝列表。具有这些扩展名的文件将不会被 nuclei 处理。

```
extensions:  - alldenylist:  - go  - py  - txt
```

默认情况下，某些扩展名被排除在核文件模块中。下面提供了这些列表-

```
3g2,3gp,7z,apk,arj,avi,axd,bmp,css,csv,deb,dll,doc,drv,eot,exe,flv,gif,gifv,gz,h264,ico,iso,jar,jpeg,jpg,lock,m4a,m4v,map,mkv,mov,mp3,mp4,mpeg,mpg,msi,ogg,ogm,ogv,otf,pdf,pkg,png,ppt,psd,rar,rm,rpm,svg,swf,sys,tar,tar.gz,tif,tiff,ttf,txt,vob,wav,webm,wmv,woff,woff2,xcf,xls,xlsx,zip
```

#### 更多的选择

可以提供**max-size**参数来限制核引擎读取的文件的最大大小（以字节为单位）。

默认`max-size`值为 5MB (5242880)，大于 的文件`max-size`将不会被处理。

------

**no-recursive**选项在为核的文件模块处理输入时禁用目录/全局的递归遍历。

#### 匹配器/提取器

**文件**协议支持两种类型的匹配器 -

| Matcher  匹配器类型 | 零件匹配 |
| :------------------ | :------- |
| word                | 全部     |
| regex               | 全部     |

| Extractors 提取器类型 | 零件匹配 |
| :-------------------- | :------- |
| word                  | 全部     |
| regex                 | 全部     |

#### **示例文件模板**

下面提供了私钥检测的最终示例模板文件。

```
id: google-api-keyinfo:  name: Google API Key  author: pdteam  severity: infofile:  - extensions:      - all      - txt    extractors:      - type: regex        name: google-api-key        regex:          - "AIza[0-9A-Za-z\\-_]{35}"# Running file template on http-response/ directorynuclei -t file.yaml -target http-response/# Running file template on output.txtnuclei -t file.yaml -target output.txt
```

[此处](https://nuclei.projectdiscovery.io/template-examples/file/)提供[了](https://nuclei.projectdiscovery.io/template-examples/file/)更完整的示例

## 匹配器

### 匹配器

匹配器允许对协议响应进行不同类型的灵活比较。它们是使 nuclei 如此强大的原因，检查编写非常简单，并且可以根据需要添加多个检查以实现非常有效的扫描。

#### 类型

一个请求中可以指定多个匹配器。基本上有 6 种匹配器：

| 匹配器类型 | 零件匹配       |
| :--------- | :------------- |
| status     | 零件的整数比较 |
| size       | 零件的内容长度 |
| word       | 协议的一部分   |
| regex      | 协议的一部分   |
| binary     | 协议的一部分   |
| dsl        | 协议的一部分   |

要匹配响应的状态代码，您可以使用以下语法。

```
matchers:  # Match the status codes  - type: status    # Some status codes we want to match    status:      - 200      - 302
```

要为十六进制响应匹配二进制，您可以使用以下语法。

```
matchers:  - type: binary    binary:      - "504B0304" # zip archive      - "526172211A070100" # rar RAR archive version 5.0      - "FD377A585A0000" # xz tar.xz archive    condition: or    part: body
```

匹配器还支持将被解码和匹配的十六进制编码数据。

```
matchers:  - type: word    encoding: hex    words:      - "50494e47"    part: body
```

可以根据用户的需要进一步配置**Word**和**Regex**匹配器。

**dsl**类型的复杂匹配器允许使用辅助函数构建更复杂的表达式。这些功能允许访问包含基于每个协议的各种数据的协议响应。请参阅特定于协议的文档以了解不同的返回结果。

```
matchers:  - type: dsl    dsl:      - "len(body)<1024 && status_code==200" # Body length less than 1024 and 200 status code      - "contains(toupper(body), md5(cookie))" # Check if the MD5 sum of cookies is contained in the uppercase body
```

协议响应的每个部分都可以与 DSL 匹配器匹配。一些例子 -

| 响应部分       | 描述                       | 例子                    |
| :------------- | :------------------------- | :---------------------- |
| content_length | 内容长度标题               | content_length  >= 1024 |
| status_code    | 响应状态码                 | status_code==200        |
| all_headers    | 包含所有标题的唯一字符串   | len(all_headers)        |
| body           | 正文作为字符串             | len(body)               |
| header_name    | `-`转换为小写的标题名称`_` | len(user_agent)         |
| raw            | 标题 + 响应                | len(raw)                |

#### 状况

可以在单个匹配器中指定多个单词和正则表达式，并且可以使用不同的条件（如**AND**和**OR ）**进行配置。

1. **AND** - 使用 AND 条件允许匹配匹配器的单词列表中的所有单词。只有当所有单词都匹配时，请求才会被标记为成功。
2. **OR** - 使用 OR 条件允许匹配匹配器列表中的单个单词。当匹配器匹配一个单词时，请求将被标记为成功。

#### 配套零件

也可以为请求匹配响应的多个部分，`body`如果未定义，则默认匹配部分。

使用 AND 条件的 HTTP 响应正文的示例匹配器：

```
matchers:  # Match the body word  - type: word   # Some words we want to match   words:     - "[core]"     - "[config]"   # Both words must be found in the response body   condition: and   #  We want to match request body (default)   part: body
```

同样，可以编写匹配器来匹配您想在响应正文中找到的任何内容，从而允许无限的创造力和可扩展性。

#### 负匹配器

所有类型的匹配器也支持否定条件，这在您查找具有排除项的匹配时非常有用。这可以通过`negative: true`在**匹配器**块中添加来使用。

这是使用`negative`条件的示例语法，这将返回`PHPSESSID`响应标头中没有的所有 URL 。

```
matchers:  - type: word    words:      - "PHPSESSID"    part: header    negative: true
```

#### 多个匹配器

可以在单个模板中使用多个匹配器来通过单个请求对多个条件进行指纹识别。

这是多个匹配器的语法示例。

```
matchers:  - type: word    name: php    words:      - "X-Powered-By: PHP"      - "PHPSESSID"    part: header  - type: word    name: node    words:      - "Server: NodeJS"      - "X-Powered-By: nodejs"    condition: or    part: header  - type: word    name: python    words:      - "Python/2."      - "Python/3."    condition: or    part: header
```

#### 匹配条件

使用多个匹配器时，默认条件是在所有匹配器之间进行 OR 运算，如果所有匹配器都返回 true，则可以使用 AND 运算来确保返回结果。

```
    matchers-condition: and    matchers:      - type: word        words:          - "X-Powered-By: PHP"          - "PHPSESSID"        condition: or        part: header      - type: word        words:          - "PHP"        part: body
```



## 提取器

### 提取器

提取器可用于从模块返回的响应中提取并在结果中显示匹配项。

#### 类型

一个请求中可以指定多个提取器。截至目前，我们支持两种类型的提取器。

1. **regex** -基于**正则表达式**从**零件中**提取数据。
2. **kval** - 从协议结果中提取一部分。

使用**正则表达式的**HTTP 响应正文提取器示例-

```
# A list of extractors for text extractionextractors:  # type of the extractor.  - type: regex    # part of the response to extract (can be headers, all too)    part: body    # regex to use for extraction.    regex:      - "(A3T[A-Z0-9]|AKIA|AGPA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}"
```

甲**KVAL**提取器为例来提取`content-type`从HTTP协议响应报头。

```
# A list of extractors for text extractionextractors:  # type of the extractor      - type: kval        part: header        kval:        # header value to extract from response          - content-type
```

#### 动态提取器

提取器可用于在编写多请求模板时在运行时捕获动态值。可以在请求中提取和使用 CSRF 令牌、会话头等。

使用名称定义动态提取器的示例，该提取器`api_key`将从请求中捕获基于正则表达式的模式。

```
    extractors:      - type: regex        name: api_key        part: body        internal: true        regex:          - "(?m)[0-9]{3,10}\\.[0-9]+"
```

这里我们使用提取器名称作为`api_key`保存提取值的变量，可以在下一个请求的任何部分使用。

仅 RAW 请求格式支持此功能。

注意：-`internal: true`当您只想使用提取器作为动态变量时可以使用，因为这将避免在终端中打印提取的值。

对于更复杂的匹配，也可以为正则表达式指定可选的正则表达式**匹配组**。

```
# A list of extractors for text extractionextractors:  # type of extractor  - type: regex    # Let's reuse the extracted CSRF token    name: csrf_token    part: body    # group defines the matching group being used.     # In GO the "match" is the full array of all matches and submatches     # match[0] is the full match    # match[n] is the submatches. Most often we'd want match[1] as depicted below    group: 1    regex:      - '<input\sname="csrf_token"\stype="hidden"\svalue="([[:alnum:]]{16})"\s/>'
```

上面带有名称的提取器`csrf_token`将保存提取的值（通过`([[:alnum:]]{16}))`as `abcdefgh12345678`.

如果此正则表达式未提供组选项，则上述具有名称的提取器`csrf_html_tag`会将完整匹配 (by `<input name="csrf_token"\stype="hidden"\svalue="([[:alnum:]]{16})" />`) 保存为`<input name="csrf_token" type="hidden" value="abcdefgh12345678" />`.

## 带外测试

自[Nuclei v2.3.6](https://github.com/projectdiscovery/nuclei/releases/tag/v2.3.6)发布以来，Nuclei 支持使用[interact.sh](https://github.com/projectdiscovery/interactsh) API 实现基于OOB 的漏洞扫描，内置自动请求关联。就像`{{interactsh-url}}` 在请求中的任何地方编写，并添加匹配器一样简单`interact_protocol`。Nuclei 将处理交互与模板的相关性以及通过允许轻松的 OOB 扫描生成的请求。

### Interactsh 占位符

`{{interactsh-url}}`**http**和**网络**请求支持占位符。

`{{interactsh-url}}`下面提供了带有占位符的核请求示例。这些在运行时被替换为唯一的 interact.sh URL。

```
  - raw:      - |        GET /plugins/servlet/oauth/users/icon-uri?consumerUri=https://{{interactsh-url}} HTTP/1.1        Host: {{Hostname}}
```

### 交互匹配器

Interactsh 交互可以与`word`，`regex`或`dsl`使用以下部分的匹配器/提取器一起使用。

| 部分                         |
| :--------------------------- |
| interactsh_protocol交互协议  |
| interactsh_request交互请求   |
| interactsh_response 交互响应 |

交互协议

值可以是 dns、http 或 smtp。这是每个基于交互的模板的标准匹配器，dns 通常作为通用值，因为它本质上是非常非侵入性的。

交互请求

interact.sh 服务器收到的请求。

交互响应

interact.sh 服务器发送给客户端的响应。

Interactsh DNS 交互匹配器示例：

```
    matchers:      - type: word        part: interactsh_protocol # Confirms the DNS Interaction        words:          - "dns"
```

交互内容上的 HTTP 交互匹配器 + 词匹配器示例

```
matchers-condition: andmatchers:    - type: word      part: interactsh_protocol # Confirms the HTTP Interaction      words:        - "http"    - type: regex      part: interactsh_request # Confirms the retrieval of etc/passwd file      regex:        - "root:[x*]:0:0:"
```

## 帮助函数

这里是可以用在RAW请求或者网络请求中的帮助函数清单。

| Helper function        | Description                                                  | Example                                                |
| :--------------------- | :----------------------------------------------------------- | :----------------------------------------------------- |
| len                    | 字符串的长度                                                 | len("Hello")                                           |
| toupper                | 字符串转大写                                                 | toupper("Hello")                                       |
| tolower                | 字符串转小写                                                 | tolower("Hello")                                       |
| replace                | 替换字符串部件                                               | replace("Hello", "He", "Ha")                           |
| replace_regex          | 用正则表达式替换字符串部分                                   | replace_regex("test", "regextomach", "replacewith")    |
| trim                   | 删除尾随的 unicode 字符                                      | trim("aaaHelloddd", "ad")                              |
| trimleft               | 从左侧删除 unicode 字符                                      | trimleft("aaaHelloddd", "ad")                          |
| trimright              | 从右侧删除 unicode 字符                                      | trimleft("aaaHelloddd", "ad")                          |
| trimspace              | 删除尾随空格                                                 | trimspace(" Hello ")                                   |
| trimprefix             | 修剪指定的前缀                                               | trimprefix("aaHelloaa", "aa")                          |
| trimsuffix             | 修剪指定的后缀                                               | trimsuffix("aaHelloaa", "aa")                          |
| reverse                | 反转字符串                                                   | reverse("ab")                                          |
| base64                 | 将字符串编码为 base64                                        | base64("Hello")                                        |
| base64_py              | 像python一样将字符串编码为base64（带有新行）                 | base64_py("Hello")                                     |
| base64_decode          | 从 base64 解码字符串                                         | base64_decode("SGVsbG8=")                              |
| url_encode             | URL 编码一个字符串                                           | url_encode("hxxps://projectdiscovery.io/test?a=1")     |
| url_decode             | URL 解码字符串                                               | url_decode("https:%2F%2Fprojectdiscovery.io%3Ftest=1") |
| hex_encode             | 对字符串进行十六进制编码                                     | hex_encode("aa")                                       |
| hex_decode             | 十六进制解码字符串                                           | hex_decode("6161")                                     |
| html_escape            | HTML 转义字符串                                              | html_escape("test")                                    |
| html_unescape          | HTML 取消转义字符串                                          | html_unescape("<body>test</body>")                     |
| md5                    | 计算字符串的md5                                              | md5("Hello")                                           |
| sha256                 | 计算字符串的sha256                                           | sha256("Hello")                                        |
| sha1                   | 计算字符串的sha1                                             | sha1("Hello")                                          |
| mmh3                   | 计算字符串的 mmh3                                            | mmh3("Hello")                                          |
| contains               | 验证一个字符串是否包含另一个字符串                           | contains("Hello", "lo")                                |
| regex                  | 验证正则表达式与字符串                                       | regex("H([a-z]+)o", "Hello")                           |
| rand_char              | 在字符集中选择一个随机字符（可选，默认字母和数字）避免坏字符（可选，默认为空） | rand_char("charset", "badchars")                       |
| rand_char              | 在字符集中选择一个长度为 l 的随机序列（可选，默认为字母和数字）避免坏字符（可选，默认为空） |                                                        |
| rand_text_alphanumeric | 在字母和数字中选择一个长度为 l 的随机序列，避免坏字符（可选） | rand_text_alphanumeric(l, "badchars")                  |
| rand_text_alpha        | 在避免坏字符的字母中选择一个长度为 l 的随机序列              | rand_text_alpha(l, "charset")                          |
| rand_text_numeric      | 在避免坏字符的数字中选择一个长度为 l 的随机序列              | rand_text_numeric(l, "charset")                        |
| rand_int               | 在最小和最大之间选择一个随机整数                             | rand_int(min, max)                                     |
| waitfor                | 阻止逻辑执行 x 秒                                            | waitfor(10)                                            |

#### 反序列化辅助函数

Nuclei 允许从[ysoserial](https://github.com/frohoff/ysoserial)为一些[通用](https://github.com/frohoff/ysoserial)小工具生成有效负载。

**支持的有效载荷：**

- dns (URLDNS)
- commons-collections3.1
- commons-collections4.0
- jdk7u21
- jdk8u20
- groovy1

**支持的编码：**

- base64 (default)
- gzip-base64
- gzip
- hex
- raw

**反序列化辅助函数格式：**

```
{{generate_java_gadget(payload, cmd, encoding}}
```

**反序列化辅助函数示例：**

```
{{generate_java_gadget("commons-collections3.1", "wget http://{{interactsh-url}}", "base64")}}
```



## 预处理器

某些预处理器可以在模板中的任何地方全局指定，一旦加载模板就运行，以实现为每个模板运行生成的随机 id 之类的东西。

### 随机数

信息

在每次运行核时为模板生成一个[随机 ID](https://github.com/rs/xid)。这可以在模板中的任何地方使用，并且始终包含相同的值。`randstr`可以以数字为后缀，并且也会为这些名称创建新的随机 ID。前任。`{{randstr_1}}`这将在整个模板中保持不变。

`randstr` 匹配器中也支持，可用于匹配输入。

例如：-

```
requests:  - method: POST    path:      - "{{BaseURL}}/level1/application/"    headers:      cmd: echo '{{randstr}}'    matchers:      - type: word        words:          - '{{randstr}}'
```

## 工作流程

### 工作流程

工作流允许用户定义模板的执行顺序。模板将在定义的条件下运行。这些是使用 nuclei 的最有效方式，其中所有模板都根据用户的需要进行配置。这意味着，您可以创建基于技术/基于目标的工作流，例如 Wordpress 工作流、Jira 工作流，它们仅在检测到特定技术时运行。

如果技术堆栈已知，我们建议您创建自定义工作流程来运行扫描。这导致扫描时间短得多，结果更好。

工作流可以与被定义`workflows`的属性，继`template`/`subtemplates`和`tags`执行。

```
workflows:  - template: technologies/template-to-execute.yaml
```

**工作流类型**

1. 通用工作流
2. 条件工作流

#### 通用工作流

在通用工作流中，可以定义要从单个工作流文件执行的单个或多个模板。它支持文件和目录作为输入。

在给定 URL 列表上运行所有与配置相关的模板的工作流。

```
workflows:  - template: files/git-config.yaml  - template: files/svn-config.yaml  - template: files/env-file.yaml  - template: files/backup-files.yaml  - tags: xss,ssrf,cve,lfi
```

运行为您的项目定义的特定检查列表的工作流。

```
workflows:  - template: cves/  - template: exposed-tokens/  - template: exposures/  - tags: exposures
```

#### 条件工作流

您还可以创建条件模板，在匹配上一个模板的条件后执行。这对于漏洞检测和利用以及基于技术的检测和利用非常有用。此类工作流的用例广泛而多样。

**基于模板的条件检查**

当基本模板匹配时执行子模板的工作流。

```
workflows:  - template: technologies/jira-detect.yaml    subtemplates:      - tags: jira      - template: exploits/jira/
```

**基于匹配器名称的条件检查**

在结果中找到基本模板的匹配器时执行子模板的工作流。

```
workflows:  - template: technologies/tech-detect.yaml    matchers:      - name: vbulletin        subtemplates:          - template: exploits/vbulletin-exp1.yaml          - template: exploits/vbulletin-exp2.yaml      - name: jboss        subtemplates:          - template: exploits/jboss-exp1.yaml          - template: exploits/jboss-exp2.yaml
```

以类似的方式，您可以根据需要为工作流创建尽可能多的嵌套检查。

**基于子模板和匹配器名称的多级条件检查**

展示模板执行链的工作流，仅当先前的模板匹配时才运行。

```
workflows:  - template: technologies/tech-detect.yaml    matchers:      - name: lotus-domino        subtemplates:          - template: technologies/lotus-domino-version.yaml            subtemplates:              - template: cves/xx-yy-zz.yaml                subtemplates:                  - template: cves/xx-xx-xx.yaml
```

条件工作流是以最有效的方式执行检查和漏洞检测的很好例子，而不是将所有模板喷洒在所有目标上，并且通常会在您的时间内获得良好的投资回报率，并且对目标也很温和。

[此处](https://nuclei.projectdiscovery.io/template-examples/workflow/)提供[了](https://nuclei.projectdiscovery.io/template-examples/workflow/)更完整的工作流示例



模版示例集：
https://nuclei.projectdiscovery.io/template-examples
