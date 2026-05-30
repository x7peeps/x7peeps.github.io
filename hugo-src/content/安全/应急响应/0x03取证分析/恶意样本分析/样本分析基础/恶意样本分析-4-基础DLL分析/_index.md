---
title: 恶意样本分析4-基础DLL分析
date: 2019-09-25T19:24:00+08:00
tags: 恶意样本分析,学习
---
![](20190923224925.png-A)
当恶意代码打包进dll，需要对其进行一定量的定性分析，除了平台的手段，这里还有一些基础的dll分析手段。
<!--more-->

> 本系列主要内容来自《K A, Monnappa. Learning Malware Analysis: Explore the concepts, tools, and techniques to analyze and investigate Windows malware (pp. 95-96). Packt Publishing. Kindle 版本. 》的记录
## DLL分析
cff explorer tool	

If you wish to know more about Dynamic-Link Libraries, read the following documents: https://support.microsoft.com/en-us/help/815065/what-is-a-dll and https://msdn.microsoft.com/en-us/library/windows/desktop/ms681914(v=vs.85).aspx.

### 为什么攻击者使用dll
1. dll不能双击运行，需要宿主进程执行。将恶意代码打包进dll，恶意程序作者能够使用任何进程加载他的dll，包括合法的进程例如explorer.exe、winlogon.exe等。这些技术可以帮助隐藏攻击者的行为，并且所有恶意行为将会隐藏在宿主程序下执行。
2. 将dll注入到已经运行的程序将可以帮助攻击者长时间驻留在系统
3. 当dll被一个程序加载进内存空间，dll还拥有整个程序内存的访问权限。从而给它操纵程序功能的能力。例如，攻击者可以注入dll到浏览器程序进程，偷取其重定向API函数的凭证。

### 使用rundll32.exe分析dll
使用动态分析对于判断恶意程序的行为至关重要。对于前面提到的dll需要一个程序进程运行。在windows中rundll32.exe能够被用来运行dll调用一个外部函数。
```
rundll32.exe <full path to dll>,<export function>,optional arguments>
```
与rundll32.exe相关的参数：
full path to dll：指定的dll地址，这个地址不能包含空或者特殊字符
export function:这个函数在dll中并且能够在dll加载之后调用
optional arguments:可选参数
逗号：用来表示dll中的某函数

#### 1. rundll32.exe工作原理
明白rundll32工作原理对于在执行dll时避免一些错误非常重要。当你运行rundll32.exe的时候使用命令行+参数形式执行，当执行rundll32.exe时发生的是:
1. 命令行参数通过rundll32.exe被首先执行；如果语法正确，则rundll32.exe执行
2. 如果语法正确，执行加载提供的dll。作为加载dll的结果，dll切入口函数被执行（这在调用住dllmain）。大部分恶意程序实现他们的恶意代码通过dllmain函数。
3. 在架在dll之后，获取外部函数及调用函数地址。如果函数地址不能被确认，则rundll32.exe中断。
4. 如果可选参数提供，则可选函数将提供额外的扩展函数调用


rundll32详细信息工作原理详解: https://support.microsoft.com/en-in/help/164787/info-windows-rundll-and-rundll32-interface.
#### 2. 使用rundll32.exe运行dll几个场景
恶意样本时常调用dll运行，下面几个场景可以帮助识别dll的运行路径
##### 01.无函数输出的dll分析
当dll被调用，dllmain主函数作为入口函数被调用。攻击者在dllmain函数中直接实现键盘记录，信息窃取等操作，期间无任何函数输出。

![](20190909165549.png-A)

> 可能会遇到c:\rundll32.exe c:\samples\aa.dll报错不执行可尝试c:\rundll32.exe c:\samples\aa.dll,test尽管报错但可以执行

##### 02. 分析一个包含输出的dll
使用cff，可以看到出口函数表。

![](20190909165436.png-A)可能会遇到C:\>rundll32.exe c:\samples\obe.dll,test运行dll但是dll没有任何行为的时候考虑dll入口函数没有实现任何函数。如果使用c:\rundll32.exe c:\samples\obe.dll,dllregisterserver直接调用可以触发cc回链请求，因此可以推断出这个函数实现网络连接功能。

这里有一个相关fuzz恶意dll函数的工具可以用来方便检测：
DLLRunner (https://github.com/Neo23x0/DLLRunner)
DLLRunner是一个智能DLL执行脚本，用于沙盒系统中的恶意软件分析。
它不是通过“rundll32.exe file.dll”执行DLL文件，而是分析PE并按名称或序号执行所有导出的函数，以确定其中一个函数是否导致恶意活动。

##### 03. 分析带参数输出的dll

> 这里有个典型的案例，样本使用powerpoit加密尝试绕过安全检测分析：https://securingtomorrow.mcafee.com/mcafee-labs/threat-actors-use-encrypted-office-binary-format-evade-detection/
![](20190909170518.png-A)

一个dll（searchcache.dll）由出口函数，具有删除文件功能函数的_flushfile@16函数组成。这个出口函数能够接收一个参数，用来接收要删除的文件：（cff图）
![](20190909165400.png-A)

测试其函数：
rundll32.exe c:\samples\SearchCache.dll,_flushfile@16 C:\samples\file_to_delete.txt

noriben日志可以记录rundll32.exe删除操作。
Processes Created:
[CreateProcess] cmd.exe:1100 > "rundll32.exe  c:\samples\SearchCache.dll,_flushfile@16 C:\samples\file_to_delete.txt" [Child PID: 3348]
File Activity:
[DeleteFile] rundll32.exe:3348 > C:\samples\file_to_delete.txt

#### 3. 通过进程检查分析dll
大多数时候，使用rundll32.exe运行dll是没问题的，但是如果他们只运行在特定的程序下（explorer.exe或者iexplore.exe)等的DLL检查，当样本程序发现他运行在其他进程中他们的行为可能发生改变或者杀死自己的进程。在这种情况下，需要将dll注入到指定程序以触发其行为。

#### RemoteDLL
RemoteDll(http://securityxploded.com/remotedll.php)
允许DLL注入任何正在运行的进程。它允许使用3种不同的方式注入dll。

##### TDSS Rootkit一个组件tdl.dll样本分析
这个样本不包含任何输出；所有的恶意代码都在dll的入口函数中实现。使用下面的命令执行会导致一个DLL初始化例程报错，说明程序没有正确执行：
![](20190923224925-20210929091716668.png-A)
通过静态分析代码，发现DLL入口函数包含一个确认检查（运行在spoolsv.exe下面）如果运行在其他程序下，dll就会初始化例程错误。
![](20200405002012.png-A)
为了触发行为，恶意DLL必须注入到spoolsv.exe进程中。之后可以通过捕捉正常观察到程序操作。

> 病毒分析过程中，可能会遇到一些dll只有当其作为服务时才会运行。这种DLL成为服务DLL。对于这种DLL的分析需要有windows API 相关知识基础。（后面会提到）

基于基础动态分析有其局限，为了获取更深的洞察，需要代码分析（逆向分析）
例如，大多数样本使用c2服务加密通信。使用动态分析我们能够确定加密通信，但是无法获得其通信内容，因此我们需要了解如何进行代码分析。
