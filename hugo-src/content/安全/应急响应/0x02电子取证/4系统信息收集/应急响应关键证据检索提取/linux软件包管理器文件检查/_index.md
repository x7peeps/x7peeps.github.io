---
title: linux软件包管理器文件检查
tag: 关键证据检索提取;
date: 2021-08-07T12:00:00+08:00
---

对于软件包管理器软件检查安装的软件的变动可以参考软件查杀检查rhk工具的使用，该软件已可以充分利用软件包管理器的文件特性进行查找。并且我们可以通过相关内容了解到包管理器中只有RPM和SOLARIS的检查方式提供了除hash之外的其他文件资产检查，因此本章节我们手工check相关文件检查的时候重点针对这RPM包管理器的用法进行实践。

# RPM

## RPM介绍

home： http://rpm.org/

RPM 是 Red Hat Package Manager 的缩写，本意是Red Hat 软件包管理，顾名思义是Red Hat 贡献出来的软件包管理；在Fedora 、Redhat、Mandriva、SuSE、YellowDog等主流发行版本，以及在这些版本基础上二次开发出来的发行版采用；

RPM Package Manager (RPM)是一款功能强大的软件包管理系统



将计算机软件从源代码构建成易于分发的软件包

安装、更新和卸载软件包

查询软件包的详细信息，无论软件包是否已安装

校验软件包和结果软件安装的完整性



Fedora 和Red Hat Linux操作系统默认使用RPM包管理器进行软件管理，同yum，up2date，apt等等命令一样。





## RPM基本用法

rpm [-acdhilqRsv][-b<完成阶段><套间档>+][-e<套件挡>][-f<文件>+][-i<套件档>][-p<套件档>＋][-U<套件档>][-vv][--addsign<套件档>+][--allfiles][--allmatches][--badreloc][--buildroot<根目录>][--changelog][--checksig<套件档>+][--clean][--dbpath<数据库目录>][--dump][--excludedocs][--excludepath<排除目录>][--force][--ftpproxy<主机名称或IP地址>][--ftpport<通信端口>][--help][--httpproxy<主机名称或IP地址>][--httpport<通信端口>][--ignorearch][--ignoreos][--ignoresize][--includedocs][--initdb][justdb][--nobulid][--nodeps][--nofiles][--nogpg][--nomd5][--nopgp][--noorder][--noscripts][--notriggers][--oldpackage][--percent][--pipe<执行指令>][--prefix<目的目录>][--provides][--queryformat<档头格式>][--querytags][--rcfile<配置档>][--rebulid<套件档>][--rebuliddb][--recompile<套件档>][--relocate<原目录>=<新目录>][--replacefiles][--replacepkgs][--requires][--resign<套件档>+][--rmsource][--rmsource<文件>][--root<根目录>][--scripts][--setperms][--setugids][--short-circuit][--sign][--target=<安装平台>+][--test][--timecheck<检查秒数>][--triggeredby<套件档>][--triggers][--verify][--version][--whatprovides<功能特性>][--whatrequires<功能特性>]

```
-a 　查询所有套件。
-b<完成阶段><套件档>+或-t <完成阶段><套件档>+ 　设置包装套件的完成阶段，并指定套件档的文件名称。
-c 　只列出组态配置文件，本参数需配合"-l"参数使用。
-d 　只列出文本文件，本参数需配合"-l"参数使用。
-e<套件档>或--erase<套件档> 　删除指定的套件。
-f<文件>+ 　查询拥有指定文件的套件。
-h或--hash 　套件安装时列出标记。
-i 　显示套件的相关信息。
-i<套件档>或--install<套件档> 　安装指定的套件档。
-l 　显示套件的文件列表。
-p<套件档>+ 　查询指定的RPM套件档。
-q 　使用询问模式，当遇到任何问题时，rpm指令会先询问用户。
-R 　显示套件的关联性信息。
-s 　显示文件状态，本参数需配合"-l"参数使用。
-U<套件档>或--upgrade<套件档> 升级指定的套件档。
-v 　显示指令执行过程。
-vv 　详细显示指令执行过程，便于排错。
-addsign<套件档>+ 　在指定的套件里加上新的签名认证。
--allfiles 　安装所有文件。
--allmatches 　删除符合指定的套件所包含的文件。
--badreloc 　发生错误时，重新配置文件。
--buildroot<根目录> 　设置产生套件时，欲当作根目录的目录。
--changelog 　显示套件的更改记录。
--checksig<套件档>+ 　检验该套件的签名认证。
--clean 　完成套件的包装后，删除包装过程中所建立的目录。
--dbpath<数据库目录> 　设置欲存放RPM数据库的目录。
--dump 　显示每个文件的验证信息。本参数需配合"-l"参数使用。
--excludedocs 　安装套件时，不要安装文件。
--excludepath<排除目录> 　忽略在指定目录里的所有文件。
--force 　强行置换套件或文件。
--ftpproxy<主机名称或IP地址> 　指定FTP代理服务器。
--ftpport<通信端口> 　设置FTP服务器或代理服务器使用的通信端口。
--help 　在线帮助。
--httpproxy<主机名称或IP地址> 　指定HTTP代理服务器。
--httpport<通信端口> 　设置HTTP服务器或代理服务器使用的通信端口。
--ignorearch 　不验证套件档的结构正确性。
--ignoreos 　不验证套件档的结构正确性。
--ignoresize 　安装前不检查磁盘空间是否足够。
--includedocs 　安装套件时，一并安装文件。
--initdb 　确认有正确的数据库可以使用。
--justdb 　更新数据库，当不变动任何文件。
--nobulid 　不执行任何完成阶段。
--nodeps 　不验证套件档的相互关联性。
--nofiles 　不验证文件的属性。
--nogpg 　略过所有GPG的签名认证。
--nomd5 　不使用MD5编码演算确认文件的大小与正确性。
--nopgp 　略过所有PGP的签名认证。
--noorder 　不重新编排套件的安装顺序，以便满足其彼此间的关联性。
--noscripts 　不执行任何安装Script文件。
--notriggers 　不执行该套件包装内的任何Script文件。
--oldpackage 　升级成旧版本的套件。
--percent 　安装套件时显示完成度百分比。
--pipe<执行指令> 　建立管道，把输出结果转为该执行指令的输入数据。
--prefix<目的目录> 　若重新配置文件，就把文件放到指定的目录下。
--provides 　查询该套件所提供的兼容度。
--queryformat<档头格式> 　设置档头的表示方式。
--querytags 　列出可用于档头格式的标签。
--rcfile<配置文件> 　使用指定的配置文件。
--rebulid<套件档> 　安装原始代码套件，重新产生二进制文件的套件。
--rebuliddb 　以现有的数据库为主，重建一份数据库。
--recompile<套件档> 　此参数的效果和指定"--rebulid"参数类似，当不产生套件档。
--relocate<原目录>=<新目录> 　把本来会放到原目录下的文件改放到新目录。
--replacefiles 　强行置换文件。
--replacepkgs 　强行置换套件。
--requires 　查询该套件所需要的兼容度。
--resing<套件档>+ 　删除现有认证，重新产生签名认证。
--rmsource 　完成套件的包装后，删除原始代码。
--rmsource<文件> 　删除原始代码和指定的文件。
--root<根目录> 　设置欲当作根目录的目录。
--scripts 　列出安装套件的Script的变量。
--setperms 　设置文件的权限。
--setugids 　设置文件的拥有者和所属群组。
--short-circuit 　直接略过指定完成阶段的步骤。
--sign 　产生PGP或GPG的签名认证。
--target=<安装平台>+ 　设置产生的套件的安装平台。
--test 　仅作测试，并不真的安装套件。
--timecheck<检查秒数> 　设置检查时间的计时秒数。
--triggeredby<套件档> 　查询该套件的包装者。
--triggers 　展示套件档内的包装Script。
--verify 　此参数的效果和指定"-q"参数相同。
--version 　显示版本信息。
--whatprovides<功能特性> 　查询该套件对指定的功能特性所提供的兼容度。
--whatrequires<功能特性> 　查询该套件对指定的功能特性所需要的兼容度。
```







## RPM常见用法

```
# 安装数据包
rpm -i package.rpm
rpm -ivh package.rpm # -v是可视化，-h是hash标记
rpm -Uvh new-package.rpm # -U安装新包删除旧包
rpm -Uvh --oldpackage Samba-old-version.rpm # 如果只想安装旧包不想安装新包则可使用--oldpackage

# 查找程序属于哪个RPM包
>rpm -qf /usr/bin/smbmount
samba-client-3.0.2-7.FC1

# 查看某命令安装了哪些文件 -l标准输出清单
rpm -ql cpp
# 查看某包安装哪些文件 -p指定包名
rpm -qpl cpp-3.3.2-1.i386.rpm

# 查看包的安装时间
rpm -qa --queryformat '%{installtime} %{installtime:date} %{name}-%{version}\n' | sort -n | sed 's/^[0-9]*//'
rpm -qa -last | tac

# 移除包，-e是移除指令，package.rpm是目标
rpm -e package
# 模拟移除，--test测试移除过程是否会遇到任何问题，
rpm -ivh --test new-kernel.rpm
# 更新或删除软件包时，可以通过--repackage来备份删除的软件包
rpm -Uvh --repackage new-package.rpm
rpm -e --repackage package
备份的文件一般会放在RPM备份目录中通常是/var/spool/repackage(可以通过rpm --showrc命令查看)
# 重新安装备份中的软件包
rpm -Uvh --oldpackage /var/spool/repackage/old-package.rpm
# 查询依赖包，如果有其他的包依赖A包，那么A包是无法被移除的，可以通过以下命令查看有哪些程序依赖相关包
rpm -q --whatrequires kernel
# rpm -q --whatrequires kernel 查看有哪些程序依赖kernel包
prelink-0.3.0-13
tcpdump-3.7.2-7.1
iptables-1.2.9-1.0
nfs-utils-1.0.6-1
libpcap-0.7.2-7.1
rp-pppoe-3.5-8
kernel-pcmcia-cs-3.1.31-13
vconfig-1.8-1
sndconfig-0.70-2
pciutils-2.1.10-8
quota-3.06-11
```

## RPM检查

系统完整性可以通过rpm自带的-Va来校验检查所有的rpm软件包，查看哪些命令是否被替换了：



```
./rpm -Va > rpm.log
```



如果一切均校验正常将不会产生任何输出，如果有不一致的地方，就会显示出来，输出格式是8位长字符串，每个字符都用以表示文件与RPM数据库中一种属性的比较结果 ，如果是. (点) 则表示测试通过。



```
验证内容中的8个信息的具体内容如下：
        S         文件大小是否改变
        M         文件的类型或文件的权限（rwx）是否被改变
        5         文件MD5校验是否改变（可以看成文件内容是否改变）
        D         设备中，从代码是否改变
        L         文件路径是否改变
        U         文件的属主（所有者）是否改变
        G         文件的属组是否改变
        T         文件的修改时间是否改变
```



如果命令被替换了，如果还原回来：



```
文件提取还原案例：
rpm  -qf /bin/ls  查询ls命令属于哪个软件包
mv  /bin/ls /tmp  先把ls转移到tmp目录下，造成ls命令丢失的假象
rpm2cpio /mnt/cdrom/Packages/coreutils-8.4-19.el6.i686.rpm | cpio -idv ./bin/ls 提取rpm包中ls命令到当前目录的/bin/ls下
cp /root/bin/ls  /bin/ 把ls命令复制到/bin/目录 修复文件丢失
```



参考：

https://www.cnblogs.com/xiaochaohuashengmi/archive/2011/10/08/2203153.html

https://www.runoob.com/linux/linux-comm-rpm.html

rpm2cpiohttp://ftp.rpm.org/max-rpm/s1-rpm-miscellania-rpm2cpio.html

#
