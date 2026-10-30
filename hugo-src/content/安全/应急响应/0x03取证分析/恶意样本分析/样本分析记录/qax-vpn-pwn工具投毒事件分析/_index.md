---
date: "2026-05-31 01:12:25 +0800"
title: qax-vpn-pwn工具投毒事件分析
menu: 
  main: 
    parent: "样本分析记录"
tags: [恶意样本分析, 实例]
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
（此处截断，完整字节流以原始样本为准，仅保留头部特征片段）
```

### shellcode 初步解读

从可见字节看，这是一段典型的 Windows x64 位置无关 shellcode：开头以 call/getjmp 方式定位自身，随后沿 `GS:[0x60]` 的 PEB 链表取得 kernel32 基址，用哈希循环逐个比对导出函数名——数据流中连续出现的 48/49 前缀（REX.W 操作码）与滚动异或运算正是这一手法的特征。字符串区可见明文的 `wininet`，配合其前的函数哈希，指向 URLDownloadToFileA 一类的网络下载能力：shellcode 本身只负责"取回下一阶段"，真正的恶意载荷大概率在运行时才落地。

沙箱行为签名中的 `create_guard_page`（PAGE_GUARD 内存页）与 `evasion_time`/时区探测，是反分析、反调试的常见配置：用守卫页干扰内存转储与单步跟踪，用时区与时间检查判断自身是否处于分析环境。

### 事件脉络与定性

QaxVpnPwn.jar 名义上是"奇安信 VPN 漏洞验证工具"，在安全技术社群间以压缩包形式流传。沙箱与反编译结果共同表明，该 JAR 并非单纯的验证工具：在命令行调用路径中嵌入了针对 Windows x64 的 shellcode，具备运行时组装、注入并联网下载后续载荷的能力。无论原始作者是有意植入、还是工具在传播链路上被二次篡改，对使用者而言结果一致——运行了一个来路不明的下载器。

这类"工具投毒"的风险结构与供应链攻击同源：安全工具天然要求高权限运行环境（管理员权限、关闭杀软、关闭沙箱），用户对工具的信任度高、检查意愿低，一旦被投毒，绕过防御的门槛反而比针对普通软件的攻击更低。反病毒引擎 0/24 的检出率也印证了这一点：Java 载体 + 运行时组装的载荷形态，对以静态特征为主的检测体系几乎透明。

### 检测与处置建议

- **文件层**：将本文基本信息中的 MD5/SHA256 导入 IOC 库；对 JAR 建立"超长整数字节数组 + PEB 偏移常量（0x60、0x10、0x24 等）"的静态特征，可圈定同类 Java 载体的 shellcode 嵌入；
- **行为层**：关注 java.exe 等解释器进程派生的网络下载行为、wininet 调用、PAGE_GUARD 内存页创建与时区查询的组合特征；
- **网络层**：对工具类应用的运行环境实施出口限制，非白名单域名直接拒绝，即可截断"下载下一阶段"这一关键环节；
- **管理层面**：社群分发的安全工具先验哈希、先进沙箱、再进生产环境；重要岗位杜绝"群里下载的工具直接跑"的操作习惯。

## 总结

该样本展示了"安全工具"作为投毒载体的完整画像：杀软引擎全线放行，沙箱行为面却暴露了反调试、环境感知与网络下载的三件套。对防御建设的启示是明确的：对解释器型载体，静态特征要下沉到代码结构层面，检测重心要从"文件是不是病毒"转向"进程在做什么"；对使用者，工具可信度的验证责任不能外包给杀毒软件。

（数据来源：微步在线沙箱分析报告、本地 jadx 反编译结果，样本哈希值见文中基本信息）
本文面向授权安全研究与防御建设，未经授权对任何系统实施文中技术属违法行为。
