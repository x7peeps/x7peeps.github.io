---
title: 恶意样本分析3-基础动态分析
date: 2019-09-20T18:15:00+08:00
tags: 恶意样本分析,学习
---

动态分析过程中，当恶意程序执行的时候，需要监控其行为。目标过程的目标是获取恶意程序行为的实时数据，以及其对操作系统的影响。
<!--more-->
> 本系列主要内容来自《K A, Monnappa. Learning Malware Analysis: Explore the concepts, tools, and techniques to analyze and investigate Windows malware (pp. 95-96). Packt Publishing. Kindle 版本. 》的记录

##  动态分析
以下是异形不同种类的监控在动态分析过程中用来获取的信息情况：
	进程监控：涉及到监控进程的行为和检查在病毒执行过程中系统性能的影响
	文件系统监控：应该包括在恶意软件执行过程中实时文件系统监控
	注册表监控：主要包括被恶意软件读写的注册表关键值的访问和改动以及注册表的数据
	网络监控：包括在恶意软件执行过程中的实时的网络状态监控
动态分析工具：
	进程监控工具： Process Hacker (http://processhacker.sourceforge.net/) 能够用于监控进程变化、网络传输概况、磁盘读写概况等。
	进程监控：Process Monitor(https://technet.microsoft.com/en-us/sysinternals/processmonitor.aspx)确定系统交互。crtl+E停止抓取事件，ctrl+x清除事件，ctrl+L过滤事件。
	系统监控活动：Noriben (https://github.com/Rurik/Noriben)便携式，简单，恶意软件分析沙箱,一般需要配合processmonitor
	安装程序监视器：Installspy 

* noriben
https://github.com/Rurik/Noriben
Noriben是一个基于Python的脚本，与Sysinternals Procmon一起使用，可以自动收集，分析和报告恶意软件的运行时指标。简而言之，它允许您运行应用程序，点击按键，并获得样本活动的简单文本报告。

Noriben不仅允许您运行类似于沙箱的恶意软件，还可以在您以特定方式手动运行恶意软件以使其运行时记录系统范围的事件。例如，它可以在您运行需要不同命令行选项或用户交互的应用程序时进行侦听。或者，在调试器中单步执行应用程序时观察系统。

虽然Noriben是专为分析恶意软件而设计的，但它也被广泛用于审计正常的软件应用程序。2013年，Tor项目使用它来提供Tor浏览器套件的公共审计

下面是一个调试VM检查恶意软件的视频，其方式仍然是获取沙箱结果（由于鼠标指针关闭5个像素而导致误点击:)）
	
	
https://ghettoforensics.blogspot.com/2013/04/noriben-your-personal-portable-malware.html
	

## 分析步骤
静态分析
1. 样本字符分析
file
2. virtual分析
动态分析
1. 样本机和监控机启动
2. windows启动：process hacker、noriben
3. linux启动：inetsim，wireshark
4. 使用管理员身份运行样本40秒左右
5. 停止noriben、inetsim、wireshark
6. 收集检查理解样本行为
