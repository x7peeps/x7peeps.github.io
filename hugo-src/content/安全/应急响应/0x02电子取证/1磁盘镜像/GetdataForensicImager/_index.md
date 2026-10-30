---
date: "2026-05-31 01:12:25 +0800"
title: "GetdataForensicImager"
menu: 
  main: 
    parent: "1磁盘镜像"
---
官网 http://www.forensicimager.com/

基于windows程序，文件格式取证转换工具



Forensic Explorer (FEX) 是用户保存、分析和展示电子证据的软件。该软件的主要用户是执法机构、政府、军队和企业调查机构。



# 主要特点

## 特点

- 获取物理，逻辑，文件夹和文件。
- 重新获取现有的取证图像文件。
- 支持使用GetData Forensics Servlet从远程设备进行获取。
- 使用MD5，SHA1或SHA256采集哈希值获取.E01或DD格式。
- 使用完整的MD5，SHA1或SHA256文件哈希获取L01格式的文件夹和文件。
- 创建后自动验证采集哈希。
- 对整个设备成像或设置开始和结束扇区位置。
- 将图像文件分割成没有段大小限制的自定义段。
- 设置设备扇区大小以获取512、2048或4096扇区大小的选项。
- 强制将Windows兼容文件名与Magnet Forensics产品一起使用的选项。

## 压缩格式

支持E01和L01格式的EnCase None，Fast，Good，Best压缩设置。包括E01和L01格式写入采集信息。



## 日志

记录详细的日志文件，包括设备详细信息以及源和验证哈希信息。



# FEX imager官方使用手册（已翻译）

[📎FEX Imager User Guide.en.pdf](https://www.yuque.com/attachments/yuque/0/2021/pdf/1093585/1615817539019-c9250e8c-868f-456e-a442-ff37881f79cb.pdf) 

Published: 14-Jul-20at 15:37:58

## 运行FEX imager

### 写块

计算机取证的一个公认原则是，在可能的情况下，在调查中获取数据不得被研究者更改。



如果物理介质，如硬盘驱动器，USB驱动器，相机卡等是一个潜在的证据来源，它是当存储媒体连接到取证工作站时，建议使用取证写块设备(写块工具)。写块工具通常是一个物理硬件设备，它位于目标媒体设备和调查人员工作站。它确保调查员不可能在无意中改变被检查设备的内容。它允许对目标设备的只读访问而不损害数据的完整性。市面上有各种各样的法医写阻塞装置。鼓励调查人员了解他们所选择的设备、及其功能、局限性。

### 源窗口

FEX Imager是通过运行FEX Imager启动的。在程序安装文件夹中，或从已安装的桌面图标。

当FEX Imageris运行时，就会看到Sourcewindow:

![image.png](https://raw.githubusercontent.com/x7peeps/x7peeps-images/main/content/安全/应急响应/0x02电子取证/1磁盘镜像/GetdataForensicImager/1615819970210-31359346-357b-41f4-aeac-85fc2776a96e-20210316003551836.png)

来源指的是要获取的数据。来源可以是:

• 物理驱动器(即物理硬盘)。

• 一个逻辑驱动器(即一个分区，如C:\或D:\)。

• 位于分区上的文件夹或文件。

• 现有的法医图像(即E01或DD图像文件)。

• 使用Forensic Explorer servlet访问的远程驱动器。

要选择源代码，请单击“选择”按钮，并从下拉菜单中选择所需的选项:

![image.png](https://raw.githubusercontent.com/x7peeps/x7peeps-images/main/content/安全/应急响应/0x02电子取证/1磁盘镜像/GetdataForensicImager/1615820047158-2b0e388b-ee5a-441a-a12e-3181a0d55568-20210316003551825.png)

#### 物理和逻辑盘

在大多数情况下，等待符合任何压倒一切的案件特定的法律要求，一个调查员将对一个实物设备进行取证镜像。对物理设备进行镜像可以访问整个媒体的内容，例如分区之间的空间。Carrier,2005年,说:“经验法则是我们认为在最低层数据采集会有证据。为大多数情况下，调查人员获得磁盘的每个扇区”。(48页)

注意:如果物理驱动器没有显示在这个窗口，这通常是因为FEX Imager没有使用管理员身份启动，它没有足够的权限访问物理驱动器。重新启动FEX Imager，右键单击桌面图标，并选择以管理员身份运行从下拉菜单。

![image.png](https://raw.githubusercontent.com/x7peeps/x7peeps-images/main/content/安全/应急响应/0x02电子取证/1磁盘镜像/GetdataForensicImager/1615821164808-9cf6920b-81a2-4a07-978d-3790db4f9792-20210316003551857.png)

设备选择窗口包含以下信息:

- 标签:列出物理驱动器及其Windows设备号。编号从0开始。逻辑驱动器显示驱动器标签(如果没有标签，则使用"{no label}")。图像文件显示图像的路径。
- Size: Size列包含物理或逻辑设备的大小，或者映像文件的大小。(注意，报告的驱动器大小通常小于驱动器标签上打印的大小。这是因为制造商在操作时以十进制字节数报告大小系统以1024块为每个KB报告大小)。
- FS:磁盘上的文件系统，如FAT、NTFS、HFS、APFS。
- 类型:描述驱动器连接到计算机的方式。图像文件将显示图像类型(如EnCase®或RAW)。

#### 添加远程设备

FEX Imager拥有使用UDP协议检查远程设备跨网络的能力

[https://en.wikipedia.org/wiki/User_Datagram_Protocol](https://en.wikipedia.org/wiki/User_Datagram_Protocol))



要是用远程设备需要，在接收端开启UDP服务，并有必要部署GetData UDP网络服务。它可以在FEX Imagerinstallation文件夹GetDataNetworkServer.exe中找到。部署了GetData UDP网络服务器后，运行命令，显示如下界面:

![image.png](https://raw.githubusercontent.com/x7peeps/x7peeps-images/main/content/安全/应急响应/0x02电子取证/1磁盘镜像/GetdataForensicImager/1615822727048-7c99ba18-0284-4ff0-892e-d26f6a092aa4-20210316003551825.png)

服务器IP:运行网络服务器的计算机的IP地址。重要的是:在排除故障时，使用CMD行“IPCONFIG”重复检查IP地址。命令以确保正确的机器地址。

服务器端口:通信端口。

服务器状态:服务器进入“等待”模式，等待来自取证资源管理器的连接。



请注意，可能需要配置本地和远程计算机上的防火墙设置以启用远程访问GetData UDP网络服务器。

**网络服务器命令行选项**

GetData UDP网络服务器可以从CMD行部署在远程计算机上

以下开关:

• /Q       安静模式(没有GUI);

• /P: XXXX  指定端口号。

重要提示:在静默模式下部署时:

- 在Windows任务中，GetData UDP网络服务器将显示为一个正在运行的进程管理。进程的名称是可执行文件的名称(即重命名为“GetData UDP”)

网络服务器”根据需要)。

- GetData UDP网络服务器只能在Windows环境下通过结束进程来终止任务管理器。



**将GETDATA UDP网络服务器部署为WINDOWS服务**

GetDataNetworkServer可以作为Windows服务部署。

要安装为服务，使用以下命令行开关:

• GetDataNetworkServer /install /silent

要卸载该服务，请使用以下开关:

• GetDataNetworkServer /uninstall /silent

如果需要非默认端口(即443以外的端口)，则必须将以下键值添加到注册表指定端口号:

HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\GDStreamService\UDPPort(DWORD)=443



**连接GETDATA UDP网络服务器**

要连接到GetData UDP网络服务器，运行Forensic Imager并在Sourcewindow中单击

select>Remote:

![image.png](https://raw.githubusercontent.com/x7peeps/x7peeps-images/main/content/安全/应急响应/0x02电子取证/1磁盘镜像/GetdataForensicImager/1616509871234-8a2b4c6d-1e3f-5a7b-9c1d-2e4f6a8b0c1d.png)

在远程设备列表中选择 GetData UDP 网络服务器共享出的磁盘（服务器 IP 与端口，默认 443），即可像操作本地设备一样开始采集。远程模式下依然支持 E01/L01/DD 格式输出与哈希校验，采集结果保存在运行 Forensic Imager 的工作站上。

## 使用建议

- 远程采集走专用/隔离网络，避免镜像流量占用生产链路；防火墙按需仅放行取证工作站到服务器的端口
- 涉密或不可中断的源设备，优先本地只读成像；UDP 流式传输对丢包敏感，网络质量差时改物理迁移
- 采集完成后使用 FEX 的 Verify 功能对 .E01/.DD 重新计算 MD5/SHA-1/SHA-256 并与原始日志比对
- 日志（含参数、哈希、时间戳）与镜像一并归档，作为保管链证据的一部分

## 小结

GetData Forensic Imager（FEX imager）的定位是"轻量、免费、格式全覆盖"的取证成像工具：物理/逻辑/文件夹三级采集，E01/L01/DD 三种镜像格式，自动哈希验证，再配合 Forensic Servlet/UDP 网络服务器实现**远程取证**，在没有硬件拦截器的应急场景中尤其实用。与 EnCase Imager、FTK Imager 同属取证入口环节的标准配置，输出件可直接送入 Magnet AXIOM、EnCase 等分析平台。


（数据来源：GetData Forensic Imager / Forensic Explorer 官方手册整理）

本文面向授权安全研究与防御建设，未经授权对任何系统实施文中技术属违法行为。
