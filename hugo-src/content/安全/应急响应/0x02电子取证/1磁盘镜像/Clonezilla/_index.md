---
date: "2026-05-31 01:12:25 +0800"
title: "Clonezilla"
menu: 
  main: 
    parent: "1磁盘镜像"
---
Clonezilla：https://clonezilla.org/ 多平台的分区和磁盘克隆程序。



Clonezilla是一个分区和磁盘成像/克隆程序，类似于True Image®或Norton Ghost®。帮助您进行系统部署、裸金属备份和恢复。Clonezilla有三种类型:Clonezilla live、Clonezilla lite server和Clonezilla SE(服务器版)。Clonezilla live适用于单机备份和恢复。虽然Clonezilla lite server或SE是用于大规模部署的，但它可以同时克隆许多(40多台!)计算机。Clonezilla只保存和恢复硬盘中使用过的块。这提高了克隆效率。在42节点集群中的一些高端硬件中，理论可达8gb/min速率恢复速率。

<!--more-->

## 特性

- 支持许多文件系统:

- - (1)ext2、ext3, ext4, reiserfs, reiser4, xfs、jfs, btrfs, f2fs nilfs2 GNU / Linux, 
  - (2) FAT12, FAT16, FAT32, NTFS Windows,
  - (3)HFS + Mac OS, 
  - (4) UFS FreeBSD, NetBSD, OpenBSD, 
  - (5) minix minix, 
  - (6) VMFS3 VMFS5 VMWare ESX。



因此，无论32位(x86)操作系统还是64位(x86-64)操作系统，都可以克隆GNU/Linux、MS windows、intel Mac OS、FreeBSD、NetBSD、OpenBSD、Minix、VMWare ESX、Chrome OS/Chromium操作系统。对于这些文件系统，**Partclone只保存和恢复分区中使用过的块。对于不支持的文件系统，在Clonezilla中，扇区到扇区的复制是由dd完成的。**



- 支持GNU/Linux下的LVM2 (LVM版本1不支持)。
- 可以重新安装引导加载程序，包括grub(版本1和版本2)和syslinux。
- 支持MBR和GPT分区格式的硬盘驱动器。Clonezilla live也可以在BIOS或uEFI机器上启动。
- 支持无人值守模式。几乎所有的步骤都可以通过命令和选项来完成。您还可以使用许多引导参数来定制您自己的映像和克隆。
- 支持一个映像恢复到多个本地设备。
- 镜像可以被加密。这是通过ecryptfs完成的，这是一种符合posix的企业加密堆叠文件系统。
- Clonezilla SE支持多播，适合大规模克隆。如果您的客户端支持PXE和局域网唤醒，您也可以远程使用它来保存或恢复一堆计算机。
- Clonezilla lite服务器支持BT (Bittorrent)，适合大规模部署。BT模式的工作由Ezio完成。
- 映像文件可以在本地磁盘、ssh服务器、samba服务器、NFS服务器或WebDAV服务器上。
- AES-256加密可用于保护数据的访问、存储和传输。
- 基于Partclone(默认)、Partimage(可选)、ntfsclone(可选)、dd对分区进行镜像或克隆。然而，包含其他一些程序的Clonezilla不仅可以保存和恢复分区，还可以保存和恢复整个磁盘。
- 通过使用我们自己开发的另一款免费软件drbl-winroll，可以自动更改克隆的MS windows机器的主机名、组名和SID。



## 最小运行环境

Clonezilla live所需最小系统环境：

处理器为X86或X86 -64

196mb系统内存(RAM)

启动设备，如CD/DVD驱动器、USB端口、PXE或硬盘驱动器

## 局限性

- 目标分区必须等于或大于源分区。
- 差异/增量备份尚未实现。
- 在线成像/克隆还没有实现。必须卸载要映像或克隆的分区。
- 由于图像格式的限制，无法探索或装入图像。您可以从映像中恢复单个文件。但是，您仍然有办法做到这一点，请阅读本文。
- 恢复Clonezilla live与多个cd或dvd还没有实现。现在，如果你选择创建恢复iso文件，所有的文件都必须在一个CD或DVD中。



## Clonezilla版本

- **Clonezilla Live:** Clonezilla Live允许你使用CD/DVD或USB闪存驱动器引导和运行Clonezilla(仅提供单播)
- **Clonezilla lite服务器:**Clonezilla lite服务器允许你使用Clonezilla live进行大规模克隆(支持单播，广播，多播，bt)
- **Clonezilla SE:** DRBL包含了Clonezilla SE，因此为了使用Clonezilla进行大规模克隆(支持单播、广播和组播)，必须首先建立DRBL服务器。



这里因为日常使用的clonezille live会比较多这里主要介绍live。





## Clonezilla Live及其使用

https://clonezilla.org/clonezilla-live.php



Clonezilla Live是一个针对x86/amd64 (x86-64)计算机的小型可引导GNU/Linux发行版。Clonezilla SE(服务器版)从2004年开始开发，用于同时部署多台计算机。这是一个非常有用的工具，但是它也有一些限制。为了使用它，您必须首先准备一个DRBL服务器，并且要部署的机器必须从网络启动(例如PXE/iPXE)。



### 如何安装Clonezilla Live

要安装Clonezilla live，基本步骤是下载预构建的Clonezilla live，然后将其放入引导介质(CD、USB闪存驱动器或USB硬盘驱动器)。有两种类型的文件可用，iso和zip。前者用于CD，后者用于USB闪存驱动器。此外，您还可以将Clonezilla放在硬盘驱动器或PXE服务器上。



- CD / DVD:

[下载一个ISO文件光盘/DVD](https://clonezilla.org/downloads.php)。然后你可以烧录文件CD / DVD与任何烧程序,这种K3b GNU / Linux或InfraRecorder女士的窗户,和记得选择“烧录镜像”的燃录到CD, 该CD可以用来引导机器启动镜像或克隆。在这里可以找到关于使用InfraRecorder[创建Clonezilla live CD的分步文档](https://clonezilla.org/fine-print-live-doc.php?path=./clonezilla-live/doc/09_Burn_Clonezilla_live_CD/00-create-clonezilla-live-cd.doc#00-create-clonezilla-live-cd.doc)。

- USB闪存驱动器或USB硬盘:

要把Clonezilla放到u盘或u盘上，请查看[这个文档](https://clonezilla.org/liveusb.php)。

- 硬盘:

要将Clonezilla安装在已经安装了操作系统的硬盘上，请检查[这个文档](https://clonezilla.org/livehd.php)。

- PXE服务器:

要将Clonezilla运行在PXE服务器上并通过PXE引导您的客户机，请检查[这个文档](https://clonezilla.org/livepxe.php)。

如果您有兴趣从头创建Clonezilla live iso或zip文件，请检查[这个文档](https://clonezilla.org/create_clonezilla_live_from_scratch.php)。//创建Clonezilla live 2.x!





### 如何使用Clonezilla Live

> Please refer to [this doc](https://clonezilla.org/clonezilla-usage/clonezilla-live-usage.php) for more details. 官方文档



下面是官方手册（已翻译）：

下面是Clonezilla Live启动的菜单：

![image.png](https://raw.githubusercontent.com/x7peeps/x7peeps-images/main/content/安全/应急响应/0x02电子取证/1磁盘镜像/Clonezilla/1615884344593-e06d8925-a7c9-4664-ae82-f09595b76f7b.png)



第一个页面是Clonezilla Live默认的模式界面，它将默认为分辨率为1024x768的帧缓冲模式。



在第二选项“Other modes of Clonezilla live”中还有更多的模式可供选择，如:800X600或640x480，如果你愿意，如下图所示:

![image.png](https://raw.githubusercontent.com/x7peeps/x7peeps-images/main/co