title: "EnCase_forensic_imager."
menu: 
  main: 
    parent: "1磁盘镜像"title: "EnCase_forensic_imager."
menu: 
  main: 
    parent: "1磁盘镜像"
date: 2026-05-31T01:12:25+08:00
---
EnCase Forensic Imager(win)

EnCase V8是美国Guidance Software推出的最新计算机取证软件，全新的操作界面，采用全新的取证分析的工作流，让新版更加简单易用，提供了更加强大灵活的报告功能（可模板定制），此外EnCase V8将原有EnCase v7所有模块(VFS/PDE/EDS/FastBloc SE/CD-DVD)及Neutrino手机取证功能全部集成，成为业界首先将计算机取证、手机取证综合一体的电子数据取证分析软件。



Guidance Software Inc.是全球知名的计算机取证厂商，成立于1997年，在纳斯达克上市(NASDAQ: GUID)，总部设立在美国。其EnCase计算机取证系列产品在美国、欧洲等地的执法部门、司法机关及世界五百强（Fortune 500)广泛使用，在美国联邦法院、地方法院收到认可，已成为业界标准。目前已销售超过40000套EnCase产品，每年培训的取证专业人员超过6000人



当时间很短，您需要获取整个卷或选定的个人文件夹或文件，EnCase®法医Imager是您的选择工具。基于可靠的行业标准EnCase®取证采集技术，EnCase取证成像仪:

## 特性

- 允许获取本地驱动器
- 可以免费下载和使用吗
- 不需要安装
- 一个独立的产品不需要装箱取证许可证吗
- 允许浏览和查看潜在的证据文件，包括文件夹结构和文件元数据
- 使用强AES 256位加密保护Lx01和Ex01文件
- 可以通过USB部署，并用于执行获取一个实时设备



## 支持源数据格式

EnCase Imager支持处理常见的各种数据类型：

- 镜像文件（包括E01、L01、Ex01、Lx01、dd、vmdk、vhd等格式）
- 本地连接的各种磁盘、存储卡
- 内存数据
- 远程数据（需要配合LinEn使用）

其中支持镜像文件，主要用来转换格式，以减小原镜像体积，以及添加证据编号、备注信息等各种元数据。



## 支持镜像文件格式

EnCase Imager可以生成四种格式的镜像，分别是现行的

- EnCase证据文件（.Ex01）
- 现行的EnCase逻辑证据文件（.Lx01）
- 传统的EnCase证据文件（.E01）
- 传统的EnCase逻辑证据文件（L01）



**如果需要处理的对象是整个存储设备或整个分区，应该保存成E01或Ex01格式；如果仅仅对源数据中的部分文件制作镜像，应该选择L01或Lx01格式。**

**
**

Ex01及Lx01格式是EnCase V7引进的新格式，该格式最大的变化是支持数据加密，设置密码后若不知道密码，无法读取镜像中的数据。E01及L01文件虽然也支持添加密码，但是密码仅用来限制镜像文件的打开，数据部分并未真正加密，很多取证工具可以直接忽略E01及L01文件的密码。



**如果工作中要使用其他取证工具进行分析，为了保证兼容性，建议选择E01及L01格式，否则可以使用Ex01及Lx01格式。**

## 使用EnCase Imager镜像

这里找到了一篇非常详尽的文章直接作为参考来自胡壮的个人博客：[https://www.hustrong.com/2018/%E4%BD%BF%E7%94%A8EnCase-Imager%E5%88%B6%E4%BD%9C%E9%95%9C%E5%83%8F.html](https://www.hustrong.com/2018/使用EnCase-Imager制作镜像.html)

### 使用EnCase Imager制作证据文件

接下来以一个实际案例来来介绍EnCase Imager的主要功能——制作磁盘镜像。实验选用了一个朗科32G优盘，序列号为AA00000000007275。

#### 添加设备

在主界面点击“Add Local Device”，弹出添加本地设备的窗口，串口左边有6个可勾选项，点击某个选项，右边会出现对应的说明。如下图所示。

![image](https://raw.githubusercontent.com/x7peeps/x7peeps-images/main/content/安全/应急响应/0x02电子取证/1磁盘镜像/EnCase_forensic_imager/1616144701988-2ffcc1c6-b355-456c-9fdb-f9e102cb04a9.png)

添加本地设备选项

六个勾选项的含义如下：

- **Detect Tableau hardware**
  检测Tableau硬件。如果没有连接Tableau设备，建议不要勾选。
- **Only show Write-blocked**
  只显示只读设备。勾选后后续的设备列表中仅显示只读设备。
- **Detect leagacy FastBloc**
  检测传统的FastBloc设备。如果没有连接FastBloc设备，建议不要勾选。
- **Enable DCO Removal**
  解除DCO限制。勾选后会忽略一些硬盘的DCO设置，可处理隐藏空间。
- **Enable Physical Memory**
  物理内存获取。勾选后后续的设备列表中会出现物理内存，如果需要制作内存镜像则必须勾选。
- **Enable Process Memory**
  进程内存获取。勾选后后续的设备列表中会出现各进程的列表，如果需要制作各进程内存镜像则必须勾选。

我们直接点击“下一步”，并且勾选序号为29、磁盘序号为14的优盘。注意不要勾选成了序号为30的那一项，否则只会加载优盘中的整个分区内容，卷引导记录等信息将不被包括。如下图所示。

![image](https://raw.githubusercontent.com/x7peeps/x7peeps-images/main/content/安全/应急响应/0x02电子取证/1磁盘镜像/EnCase_forensic_imager/1616375872314-27787cae-2acf-4821-891b-0dd30f452f4d.png)

设备列表

点击“完成”后，会自动打开“Evidence”标签页，可以看到磁盘14已经添加到证据列表中。如下图所示。

![image](https://raw.githubusercontent.com/x7peeps/x7peeps-images/main/content/安全/应急响应/0x02电子取证/1磁盘镜像/EnCase_forensic_imager/1616375872311-7f0866b0-4437-4446-b51a-8835e7857973.png)

证据列表

#### 开始制作镜像

双击证据列表中的设备名“14”，或选中该项，点击“OPEN”，即可打开并浏览优盘中的数据。

打开该证据后，点击菜单栏的“Acquire”→“Acquire”即可开始制作镜像。需要注意的是，如果要制作整个优盘的镜像，树形面板中选中的必须是整个设备，对于本案例来说，选中的必须是“Entry”或“14”，否则接下来默认制作的仅仅是分区部分的镜像。

![image](https://raw.githubusercontent.com/x7peeps/x7peeps-images/main/content/安全/应急响应/0x02电子取证/1磁盘镜像/EnCase_forensic_imager/1616375872311-72ff303c-415d-41cd-a1b9-f62953d14072.png)

开始制作镜像

#### 设置证据文件参数

接下来需要设置证据文件的参数等信息，弹出的页面中包括“Location”、“Format” 及“Advanced”三部分设置选项。这些设置项是制作证据文件的关键。

**保存位置等设置项**

**
**![image](https://raw.githubusercontent.com/x7peeps/x7peeps-images/main/content/安全/应急响应/0x02电子取证/1磁盘镜像/EnCase_forensic_imager/1616375937786-7f250eb7-5100-4568-b212-d667a57e6d4d.png)

保存位置等设置项

- **Name**
  设备名。默认也是镜像文件名。
- **Case Number**
  案件编号。
- **Evidence Number**
  证据编号。
- **Examiner Name**
  检验人员姓名。这一项是必填项。
- **Note**
  备注信息。
- **Output Path**
  输出路径。证据文件保存路径。
- **Alternate Path**
  备用路径。当镜像保存路径空间不够时，会保存到此位置。

**证据文件格式等设置项**

**
**![image](https://raw.githubusercontent.com/x7peeps/x7peeps-images/main/content/安全/应急响应/0x02电子取证/1磁盘镜像/EnCase_forensic_imager/1616375937889-59b37051-a8a6