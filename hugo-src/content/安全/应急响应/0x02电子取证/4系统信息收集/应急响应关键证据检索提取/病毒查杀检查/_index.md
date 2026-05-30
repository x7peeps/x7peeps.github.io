---
title: linux下病毒查杀
tag: 关键证据检索提取;
date: 2021-08-03T12:00:00+08:00
---

# linux下病毒查杀

大部分情况，现场是不允许向机器中拷贝程序的，一破坏现场，二使用不明原理的程序对客户业务系统可能造成未知的影响。在更为严格的情形下，可能我们在现场机器查询命令都是会影响证据固定，因此那种场景下需要先镜像，而后在分析证据的时候进行查杀工作，但这种严格的场景不在本文讨论的范围内。因此本文在查杀过程中，讨论的是不太严格的取证场景下，公司内部或个人主机场景下如何进行病毒查杀以及样本提取工作。第一步需要经允许才可拷贝相关程序，之后我们可以借助一些查杀工具进行检测扫描，最后我们通过现有的异常特征进行手工分析。

## Rootkit查杀

rootkit是持久化中是很常见的躲避恶意软件检测的隐藏攻击行为的一类程序，这里一般来说杀软对rootkit具有查杀能力，这里仍然作为了解推荐几个专杀。



linux和BSD下后门程序一般最为复杂和严重的是内核级的Rootkit，同样在Windows下Rootkit以及BootKit也是最难清理和危害最大又存活最强的后门程序。在Windows下的Rootkit很多样化但相应检测和清理的工具很多种，linux下Rootkit的检测和清理工具相对较少，其中有这两个比较常用：***\*Chkrootkit\****和***\*RootkitHunter\****。（[Pestd关于两个工具的使用介绍](https://blog.csdn.net/pestd/article/details/8919654)）

### chkrootkit（rootkit查杀）

官网：http://www.chkrootkit.org

#### 简介

Chkrootkit是一个本地检查rootkit标志的工具。它包含:



**Chkrootkit:** 检查系统二进制文件的rootkit篡改的shell脚本。

**ifpromisc.c**: 表示检查接口是否为混杂模式。

**chklastlog.c:** 检查最近日志的删除情况。

**chkwtmp.c**:检查WTMP是否被删除。

**check_wtmpx.c**:检查WTMPX的删除。(仅Solaris)

**chkproc.c:** 检查LKM木马的迹象。

**chkdirs.c:** 检查LKM木马的迹象。

**strings.c**: 快速和肮脏的字符串替换。

**chkutmp.c**: 检查是否删除utmp。



目前已经支持下列相关命令/服务/程序的检测：

aliens asp bindshell lkm rexedcs sniffer w55808 wted scalper slapper z2 chkutmp OSX_RSPLUG amd basename biff chfn chsh cron crontab date du dirname echo egrep env find fingerd gpm grep hdparm su ifconfig inetd inetdconf identd init killall ldsopreload login ls lsof mail mingetty netstat named passwd pidof pop2 pop3 ps pstree rpcinfo rlogind rshd slogin sendmail sshd syslogd tar tcpd tcpdump top telnetd timed traceroute vdir w write

目前支持一下rootkits、蠕虫、LKM（linux内核模块）等检测：

| 01. lrk3, lrk4, lrk5, lrk6 (and variants); | 02. Solaris rootkit;         | 03. FreeBSD rootkit;         |
| ------------------------------------------ | ---------------------------- | ---------------------------- |
| 04. t0rn (and variants);                   | 05. Ambient's Rootkit (ARK); | 06. Ramen Worm;              |
| 07. rh[67]-shaper;                         | 08. RSHA;                    | 09. Romanian rootkit;        |
| 10. RK17;                                  | 11. Lion Worm;               | 12. Adore Worm;              |
| 13. LPD Worm;                              | 14. kenny-rk;                | 15. Adore LKM;               |
| 16. ShitC Worm;                            | 17. Omega Worm;              | 18. Wormkit Worm;            |
| 19. Maniac-RK;                             | 20. dsc-rootkit;             | 21. Ducoci rootkit;          |
| 22. x.c Worm;                              | 23. RST.b trojan;            | 24. duarawkz;                |
| 25. knark LKM;                             | 26. Monkit;                  | 27. Hidrootkit;              |
| 28. Bobkit;                                | 29. Pizdakit;                | 30. t0rn v8.0;               |
| 31. Showtee;                               | 32. Optickit;                | 33. T.R.K;                   |
| 34. MithRa's Rootkit;                      | 35. George;                  | 36. SucKIT;                  |
| 37. Scalper;                               | 38. Slapper A, B, C and D;   | 39. OpenBSD rk v1;           |
| 40. Illogic rootkit;                       | 41. SK rootkit.              | 42. sebek LKM;               |
| 43. Romanian rootkit;                      | 44. LOC rootkit;             | 45. shv4 rootkit;            |
| 46. Aquatica rootkit;                      | 47. ZK rootkit;              | 48. 55808.A Worm;            |
| 49. TC2 Worm;                              | 50. Volc rootkit;            | 51. Gold2 rootkit;           |
| 52. Anonoying rootkit;                     | 53. Shkit rootkit;           | 54. AjaKit rootkit;          |
| 55. zaRwT rootkit;                         | 56. Madalin rootkit;         | 57. Fu rootkit;              |
| 58. Kenga3 rootkit;                        | 59. ESRK rootkit;            | 60. rootedoor rootkit;       |
| 61. Enye LKM;                              | 62. Lupper.Worm;             | 63. shv5;                    |
| 64. OSX.RSPlug.A;                          | 65. Linux Rootkit 64Bit;     | 66. Operation Windigo;       |
| 67. Mumblehard backdoor/botnet;            | 68. Linux.Xor.DDoS Malware;  | 69. Backdoors.linux.Mokes.a; |
| 70. Linux.Proxy.10                         | 71. Rocke Monero Miner       | 72. Umbreon Linux Rootkit    |



目前支持的操作系统：

Linux 2.0.x, 2.2.x, 2.4.x and 2.6.x, 3x, 4x and 5x. FreeBSD 2.2.x, 3.x, 4.x, 5.x, 7.x and 10.x, OpenBSD 2.x, 3.x, 4.x and 5.x., NetBSD 1.6.x, Solaris 2.5.1, 2.6, 8.0 and 9.0, HP-UX 11, Tru64, BSDI and Mac OS X.



以上相关内容均可在官网查询到最新内容。



#### chkrootkit readme

readme ： http://www.chkrootkit.org/README

编译安装：

```
make sense
```

运行程序：

需要root权限

```
./chkrootkit
```



#### 基本命令

```
Usage: ./chkrootkit [options] [testname ...]
 Options:
         -h                show this help and exit
         -V                show version information and exit
         -l                show available tests
         -d                debug
         -q                quiet mode
         -x                expert mode
         -r dir            use dir as the root directory
         -p dir1:dir2:dirN path for the external commands used by chkrootkit
         -n                skip NFS mounted dirs
         
        testname可以是下面的一个或多个：
 aliens asp bindshell lkm rexedcs sniffer w55808 wted scalper slapper
 z2 chkutmp amd basename biff chfn chsh cron crontab date du dirname
 echo egrep env find fingerd gpm grep hdparm su ifconfig inetd
 inetdconf identd init killall ldsopreload login ls lsof mail mingetty
 netstat named passwd pidof pop2 pop3 ps pstree rpcinfo rlogind rshd
 slogin sendmail sshd syslogd tar tcpd tcpdump top telnetd timed
 traceroute vdir w write
```



#### 基本使用

```
# 检查ps，ls，sniffer中的问题
./chkrootkit ps ls sniffer  
# -q参数为安静模式，此模式下只展示“受影响的”状态的条目
# -x参数，用户可以检查在二进制程序中可疑程序字符，所有的分析在用户侧进行分析，可能发现存在的木马
./chkrootkit -x | more
./chkrootkit -x | egrep '^/'
# chkrootkit使用-p支持，指定文件夹进行测试，多个文件夹使用“:”隔开
./chkrootkit -p /cdrom/bin
./chkrootkit -p /cdrom/bin:/floppy/mybin
# 扫描一个挂载的磁盘使用-r
./chkrootkit -r /mnt
```

![image.png](https://cdn.nlark.com/yuque/0/2021/png/1093585/1627957262930-0aab24cd-0cd9-428e-870f-ffb737d24f61.png)

输出的信息：

```
"INFECTED": 被感染的，代表可能已经被rootkit篡改
"not infected": 未被感染的
"not found": 测试没有执行，有可能是系统问题，被其他层序使用，使用的-r
"Vulnerable 但不可用": 系统命令已经被感染但没有启用
```

如果发现了命令被感染了应尽量尽快对命令进行重新安装。





### rkhunter（rootkit查杀）

官网：http://rkhunter.sourceforge.net

#### 简介 

##### RKH使用条件

1. 在RKH启动之前，它将检查某些必需的命令存在于系统中。这些是典型的命令，比如'cat'， 'sed'， 'head'， 'tail'等。如果缺少命令则RKH不能运行。
2. 一些测试需要诸如stat, readlink, sha256或sha256sum。如果这些不存在，那么RKH就会用perl脚本自动替代。然而，这个操作需要Perl和某些模块支持，如果没有，则将跳过这些测试。Readlink作为脚本提供本身，不使用perl。其他测试将使用其他命令。如果在系统中找不到相关的命令，然后跳过测试。
3. 应该提供下载文件更新的工具。目前支持wget、curl、(e)links、lynx和GET。如果你的系统不允许安装其中任何一个程序，但可以运行perl，您可以使用'bget'从http://www.cpan.org/authors/id/E/EL/ELIJAH/下载更新。如果你用另一个更新RKH的一般方法请让我们知道。此外,用于文件下载的非标准命令可以是在RKH配置文件中配置。
4. 有些测试需要单一用途的工具。RKH不依赖于这些，但一旦找到，它就会利用它们。他们可以提高RKH的检测能力。的工具是:

Skdet

为测试SucKIT, Adore, Adore-NG, UNFshit, UNFkmem and frontkey

http://www.xs4all.nl/~dvgevers/

Unhide和Unhide -tcp (C版本)

查找隐藏的端口和进程。                   http://unhide.sourceforge.net

如果没有找到相关的工具，则跳过测试。



##### RHK安装

```
tar zxf rkhunter-<version>.tar.gz
cd rkhunter-<version>
./installer.sh --install




# 其他的一些安装参数
## 展示一些安装示例
./installer.sh --examples
## 显示帮助
./installer.sh --help
## 修改配置文件安装路径
./installer.sh --layout [path]
在安装程序执行的过程中会安装一个名为"rkhunter.conf"的文件到/etc目录下，你可以使用"--layout"命令指定安装路径。
如果要创建一个本地的配置文件，这个文件必须命名为"rkhunter.conf.local"，你也可以在目录中创建"rkhunter.d"目录，目录中存放.conf文件。
在安装过程中如果安装程序发现存在rkhunter.conf文件，那么则会创建一个新的配置文件，但是会重新用新的数字编号命名，你应该重新检查配置文件，同步配置等操作。
RKH脚本将会被安装到：
/usr/local/bin  # 或者根据安装的过程中--layout指定的目录安装
/usr/local/share/man # man手册安装地点
/usr/local/share/doc # 其他手册安装未知
/var/lib/rkhunter # 语言支持
/usr/local/lib/rkhunter/scripts # rkh支持脚本安装
/usr/local/lib64/rkhunter/scripts # 如果在32位操作系统中，支持脚本安装在此目录。
```

#### 基本使用

```
## 在运行RKH之前，当使用--propupd时，会生成一个名为rkhunter.dat的文件用来记录文件基本信息如hash、权限、gid等。如下命令
rkhunter --propupd
## 如果想要指定包管理工具那么应该加上如下命令
rkhunter --propupd --pkgmgr RPM
## 使用管理员权限运行程序，即可
rkhunter --check/-c



## 日志文件
/var/log/rkhunter.log
## 帮助手册
rkhunter --help
```

##### 独立安装

```
# RKH支持独立安装，他可以将所有的程序文件安装在同一个目录下
1. 解压RKH，使用下面的命令安装程序
./installer.sh --layout custom . --install
2. 切换目录到文件目录中
根据需要对rkhunter.conf配置文件自定义
3. 使用root权限运行rkh
./rkhunter --propupd --check --sk
```

##### 免安装使用RKH

免安装模式可以很方便测试新版本，或应对开发场景。

```
1. 首先使用root用户权限，这里建议在tmp目录下创建个临时目录。
mkdir /tmp/rkh
cd /tmp/rkh

2. 下载或复制安装包到本目录中，最新的开发版本软件可以通过下面的链接下载
wget http://rkhunter.sourceforge.net/rkhunter-dev.tar.gz

3. 解压
tar xzf rkhunter-dev.tar.gz  # 开发版本
tar xzf rkhunter-1.4.0.tar.gz # 正式生产版本
gunzip rkhunter-dev.tar.gz
tar xf rkhunter-dev.tar

4. 进入解压的目录并执行安装程序
cd rkhunter-1.4.0/cd rkhunter
# 使用独立安装方式安装
./installer.sh --layout custom . --install 
# 进入子目录
cd files
# 此时rkhunter.conf已经释放在目录中，根据需求进行修改相关配置文件即可。
./rkhunter --propupd --check --sk
# 如果使用了--debug参数，则在/tmp目录中还会生成一个目录

5. 一旦完成了测试，想要删除相关的目录只需要通过下面的命令进行清理即可
cd /tmp
/bin/rm -rf rkh
```

##### 卸载安装

```
RKH支持卸载操作，如果项删除安装的相关文件只需要运行下列相关指令：
tar zxf rkhunter-<version>.tar.gz
cd rkhunter-<version>
./installer.sh --remove
```

如果指定了安装目录，--layout，例如安装在/usr目录下：

```
# 卸载命令可以参考
./installer.sh --layout /usr --remove
```

注意：installer不会移除通过RPM下载的安装包文件。

在卸载的过程中installer会卸载/etc/rkhunter.conf，其他rkhunter.conf并不会移除。并且rkhunter.d目录也不会移除。可以手动删除相关文件。

#### 常用参数说明

##### --propupd 

当加propupd参数时，RKH在运行的过程中回对检测的文件建立一个用于判断文件财产改动的基本信息特征数据库，rkhunter.dat文件。改动信息包括：文件hash值、文件权限、uid、gid、inode等等。

##### --pkgmgr 指定获取文件信息的方式

文件基本信息操作是通过"stat","file","md5sum","prelink"获取的。然而RKH也可以通过数据包管理器获取。通过--pkgmgr指定包管理器。通过包管理器可以避免一些不准确的报告，例如一些程序通过包管理器更新过了，但是因为判断文件发生了变化导致不准确。通过包管理器则可以通过包管理器的数据库对程序进行文件对比从而避免相关问题。



目前支持的包管理器有：

RPM - redhat/基于RPM的操作系统

DPKG - 基于Debian的操作系统

BSD，BSDng  - 使用pkg_info 命令和使用pkg命令管理功能的*BSD操作系统

SOLARIS - solaris操作系统

NONE - 默认使用的是NONE，不指定操作系统的情况



##### --hash 指定hash文件资产对比

在不信任的包通常使用hash或使用HASH_CMD配置文件选项进行配置。需要注意的是，除了SOLARIS之外其他包管理器都提供文件的hash值的。然而，RPM和SOLARIS包管理器提供其他的文件财产值。例如文件权限,

uid, gid, 修改事件等。Solaris包管理器可以存储16位hash，但是默认情况下并不会开启，需要在USE_SUNSUM配置选项中开启相关选项。

而“DPKG”，“BSD”和“BSDng”包管理器只提供文件hash值。例如当执行文件资产检查的时候所有的文件将会重新计算一边hash值，并与rkhunter.dat文件内容进行对比。



***\* 因此，--hash模式下只有，“RPM”和“SOLARIS”包管理器才能在文件对比起到比较好的效果\**。**

**
**

注意：包管理器数据库有可能会被恶意攻击损坏。在这种情况下，可以使用RKH包管理器选项，不会增加任何安全保障。并且，结果可能会存在不准确。**因此RKH只能报告文件变化，并不能判断导致文件变化的原因。**

**
**

**
**





## 病毒查杀

### Clamav（邮件网关病毒查杀）

#### 基本介绍

ClamAV是**思科**的一个开源(GPLv2)杀毒工具包，专门为邮件网关上的电子邮件扫描而设计。它提供了许多实用工具，包括一个灵活的、可扩展的多线程守护进程、一个命令行扫描器和用于自动数据库更新的高级工具。该包的核心是一个以共享库的形式提供的防病毒引擎。

官网：https://www.clamav.net/

官网docs：https://docs.clamav.net/
ClamAV的官方下载地址为：

http://www.clamav.net/download.html



ClamAV设计用于快速扫描文件。

实时保护(仅Linux)。ClamOnAcc客户端用于ClamD扫描守护进程，在现代版本的Linux上提供实时扫描。这包括一个可选的功能，在文件被扫描之前阻止文件访问(即时访问阻止)。

ClamAV可检测数以百万计的病毒、蠕虫、木马和其他恶意软件，包括Microsoft Office宏病毒、移动恶意软件和其他威胁。

ClamAV的字节码签名运行时由LLVM或我们的自定义字节码解释器提供支持，允许ClamAV签名编写人员创建和分发非常复杂的检测例程，并远程增强扫描仪的功能。

签名签名数据库确保ClamAV只执行受信任的签名定义。

ClamAV扫描档案和压缩文件，但也保护档案炸弹。内置存档提取功能包括:

Zip (including SFX, excluding some newer or more complex extensions)

RAR (including SFX, most versions)

7Zip

ARJ (including SFX)

Tar

CPIO

Gzip

Bzip2

DMG

IMG

ISO 9660

PKG

HFS+ partition

HFSX partition

APM disk image

GPT disk image

MBR disk image

XAR

XZ

Microsoft OLE2 (Office documments)

Microsoft OOXML (Office documments)

Microsoft Cabinet Files (including SFX)

Microsoft CHM (Compiled HTML)

Microsoft SZDD compression format

HWP (Hangul Word Processor documents)

BinHex

SIS (SymbianOS packages)

AutoIt

InstallShield

ESTsoft EGG



支持Windows可执行文件解析，也称为便携式可执行文件(PE) 32/64位，包括PE文件压缩或混淆:

AsPack

UPX

FSG

Petite

PeSpin

NsPack

wwpack32

MEW

Upack

Y0da Cryptor



支持ELF和Mach-O文件(32位和64位)

支持几乎所有的邮件文件格式

支持其他特殊文件/格式包括:

HTML

RTF

PDF

Files encrypted with CryptFF and ScrEnc

uuencode

TNEF (winmail.dat)



高级数据库更新，支持脚本更新，数字签名和基于DNS的数据库版本查询。



##### 支持的操作系统

Clamav是高度跨平台的。开发团队无法测试每一个操作系统，所以我们选择使用两种最流行的桌面操作系统的最新长期支持(LTS)版本来测试ClamAV。我们定期测试的操作系统包括:

GNU/Linux

- - Alpine

- - - 3.11 (64bit)

- - Ubuntu

- - - 18.04 (64bit, 32bit)
    - 20.04 (64bit)

- - Debian

- - - 9 (64bit, 32bit)
    - 10 (64bit, 32bit)

- - CentOS

- - - 7 (64bit, 32bit)
    - 8 (64bit)

- - Fedora

- - - 30 (64bit)
    - 31 (64bit)

UNIX

- - FreeBSD

- - - 11 (64bit)
    - 12 (64bit)

- - macOS

- - - 10.13 (High Sierra)
    - 10.15 (Catalina)

Windows

- - 7 (64bit, 32bit)
  - 10 (64bit, 32bit)



##### 推荐系统

以下推荐的最低系统要求适用于使用思科提供的标准ClamAV特征库的ClamScan或ClamD应用程序。



ClamAV的最低推荐配置:

```
最低内存配置：
FreeBSD and Linux server edition: 2 GiB+
Linux non-server edition: 2 GiB+
Windows 7 & 10 32-bit: 2 GiB+
Windows 7 & 10 64-bit: 3 GiB+
macOS: 3 GiB+
最小CPU需求：1 CPU at 2.0 Ghz+
最低硬盘需求：5G
```

##### 软件支持

clamav-announce@lists.clamav.net

info about new versions, moderated.

Subscribers are not allowed to post to this mailing list.

clamav-users@lists.clamav.net

user questions

clamav-devel@lists.clamav.net

technical discussions

clamav-virusdb@lists.clamav.net

database update announcements, moderated

clamav-binary@lists.clamav.net

discussion and announcements for package maintainers

#### 安装方式

##### windows安装方式

下载zip安装包安装

https://www.clamav.net/downloads#otherversions

##### 官方docker镜像安装方式

dockerhub  clamav docker地址

https://hub.docker.com/r/clamav/clamav

##### MAC安装

brew install clamav

##### 源码安装方式

[Unix/Linux/Mac Instructions](https://docs.clamav.net/manual/Installing/Installing-from-source-Unix.html)

[Windows Instructions](https://docs.clamav.net/manual/Installing/Installing-from-source-Windows.html)

###### clamAV安装位置

ClamAV安装包有多种不同的版本：

数据库和应用配置地址可能存在很大差距：



默认源码安装在`/usr/local`, with:

- - applications in `/usr/local/bin`
  - daemons in `/usr/local/sbin`
  - libraries in `/usr/local/lib`
  - headers in `/usr/local/include`
  - configs in `/usr/local/etc/` (or `/usr/local/etc/clamav/` for v0.104+)
  - databases in `/usr/local/share/clamav/`

linux安装包安装在`/usr`, with:

- - applications in `/usr/bin`
  - daemons in `/usr/sbin`
  - libraries in `/usr/lib`
  - headers in `/usr/include`
  - configs in `/etc/clamav`
  - databases in `/var/lib/clamav`

其他情况以及安装问题可以尝试在下列手册中查找解答https://docs.clamav.net/manual/Installing/Packages.html







#### 基本使用

官方使用文档参见h[ttps://docs.clamav.net/](https://docs.clamav.net/)

安装方式一：

```
1、安装zlib：
wget http://nchc.dl.sourceforge.net/project/libpng/zlib/1.2.7/zlib-1.2.7.tar.gz 
tar -zxvf  zlib-1.2.7.tar.gz
cd zlib-1.2.7
#安装一下gcc编译环境： yum install gcc
CFLAGS="-O3 -fPIC" ./configure --prefix= /usr/local/zlib/
make && make install

2、添加用户组clamav和组成员clamav：
groupadd clamav
useradd -g clamav -s /bin/false -c "Clam AntiVirus" clamav

3、安装Clamav
tar –zxvf clamav-0.97.6.tar.gz
cd clamav-0.97.6
./configure --prefix=/opt/clamav --disable-clamav -with-zlib=/usr/local/zlib
make
make install

4、配置Clamav
mkdir /opt/clamav/logs
mkdir /opt/clamav/updata
touch /opt/clamav/logs/freshclam.log
touch /opt/clamav/logs/clamd.log
cd /opt/clamav/logs
chown clamav:clamav clamd.log
chown clamav:clamav freshclam.log

5、ClamAV 使用：
/opt/clamav/bin/freshclam 升级病毒库
./clamscan –h 查看相应的帮助信息
./clamscan -r /home  扫描所有用户的主目录就使用
./clamscan -r --bell -i /bin  扫描bin目录并且显示有问题的文件的扫描结果
```



- 安装方式二：

```
#安装
yum install -y clamav
#更新病毒库
freshclam
#扫描方法
clamscan -r /etc --max-dir-recursion=5 -l /root/etcclamav.log
clamscan -r /bin --max-dir-recursion=5 -l /root/binclamav.log
clamscan -r /usr --max-dir-recursion=5 -l /root/usrclamav.log
#扫描并杀毒
clamscan -r  --remove  /usr/bin/bsd-port
clamscan -r  --remove  /usr/bin/
clamscan -r --remove  /usr/local/zabbix/sbin
#查看日志发现
cat /root/usrclamav.log |grep FOUND
```



# Windows杀软

杀软比较多不再赘述

### 火绒

### 360
