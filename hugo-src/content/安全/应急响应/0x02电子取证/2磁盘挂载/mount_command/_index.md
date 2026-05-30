---
title: "mount_command"
menu: 
  main: 
    parent: "2磁盘挂载"
---

linux基本命令挂载镜像下一般使用mount命令挂载硬盘或镜像。目前没有找到相关取证类型的格式挂载方式。如E01，L01，AFF格式可能目前还需要windows进行挂载处理。



# 支持的镜像格式：

- raw/img/iso

# 准备阶段

## 常用的语句

df -Th 查看当前系统的分区情况

fdisk -l 查看当前系统分区信息详情

mount 挂载分区

unmount 卸载分区

## linux分区挂载点介绍

```
/boot　 启动分区，一般设置100M-200M，boot目录包含了操作系统的内核和在启动系统过程中所要用到的文件
/　　　  根分区,所有未指定挂载点的目录都会放到这个挂载点下
/home　用户目录，一般每个用户100M左右，特殊用途，比如放大文件也可再加上G。分区大小取决于用户多少。对于多用户使用的电脑，建议把/home独立出来，而且还可以很好地控制普通用户权限等，比如对用户或者用户组实行磁盘配额限制、用户权限访问等.
/tmp　  临时文件目录，一般设置1-5G，方便加载ISO镜像文件使用，对于多用户系统或者网络服务器来也有独立挂载的必要。临时文件目录，也是最常出现问题的目录之一.
/usr　　系统资源，一般设置要3-15G，大部分的用户安装的软件程序都在这里。就像是Windows目录和Program Files目录。很多Linux家族系统有时还会把/usr/local单独作为挂载点使用。
/var　　可变数据目录，包含系统运行时要改变的数据。通常这些数据所在的目录的大小是要经常变化的，系统日志记录也在/var/log下。一般多用户系统或者网络服务器要建立这个分区，设立这个分区，对系统日志的维护很有帮助。一般设置2-3G大小，也可以把硬盘余下空间全部分为var.
/srv　　系统服务目录,用来存放service服务启动所需的文件资料目录，不常改变。
/opt　　附加应用程序目录，存放可选的安装文件，个人一般把自己下载的软件资料存在里面，比如Office、QQ等等.
swap　 交换分区,一般为内存2倍，最大指定2G即可
/bin　　二进制可执行目录，存放二进制可执行程序，里面的程序可以直接通过命令行调用，而不需要进入程序所在的文件夹
/sbin　 系统管理员命令存放目录,存放标准系统管理员文件
/dev　　存放设备文件,驱动文件等
```





# 挂载镜像方法：

## 挂载raw格式镜像

使用loop方式挂载raw格式镜像

虚拟机的镜像可以直接通过loop的方式来进行挂载，这种方式你必须先计算出镜像中每个分区的偏移量（fdisk -lu可查看），然后通过loop的方式的挂载，加上偏移量

```
[root@centos images]# cd /var/lib/libvirt/images/
[root@centos images]# fdisk -lu ubuntu.raw
You must set cylinders.
You can do this from the extra functions menu.

Disk ubuntu.raw: 0 MB, 0 bytes
255 heads, 63 sectors/track, 0 cylinders, total 0 sectors
Units = sectors of 1 * 512 = 512 bytes
Sector size (logical/physical): 512 bytes / 512 bytes
I/O size (minimum/optimal): 512 bytes / 512 bytes
Disk identifier: 0x000ccae5

     Device Boot      Start         End      Blocks   Id  System
ubuntu.raw1   *        2048    38862847    19430400   83  Linux
Partition 1 has different physical/logical endings:
     phys=(1023, 254, 63) logical=(2419, 25, 38)
ubuntu.raw2        38864894    40957951     1046529    5  Extended
Partition 2 has different physical/logical beginnings (non-Linux?):
     phys=(1023, 254, 63) logical=(2419, 58, 6)
Partition 2 has different physical/logical endings:
     phys=(1023, 254, 63) logical=(2549, 131, 14)
ubuntu.raw5        38864896    40957951     1046528   82  Linux swap / Solaris
[root@centos images]# echo $((2048*512))
1048576
[root@centos images]# mount -o loop,offset=1048576 ubuntu.raw /image/
[root@centos images]# umount /image/
```



## 挂载img格式镜像

步骤：

1. 获取可以挂载的环回设备：

```
[root@virtserver ~]# losetup -f
/dev/loop0
```

1. 进行块设备挂载：

```
losetup /dev/loop0 abc.img
```

1. 执行块设备的分区映射：

```
kpartx -a /dev/loop0
```

1. 查看映射分区入口：

```
ls /dev/mapper/
```

1. 通过fdisk -l查看磁盘情况。找到需要挂载的数据分区。
2. mount分区：

```
mount /dev/mapper/vg_lbrhel-lv_root /mnt/
```

1. 卸载步骤：

```
1.umount
2.kpartx -d
3.losetup -d
```



## 挂载iso格式镜像

1. 挂载

```
mount -t iso9660 -o loop /root/xxx.iso /mnt
```

1. 查看

```
ls /mnt
```

1. 卸载

```
umount /mnt
```

# 文章参考链接

https://blog.csdn.net/cnyyx/article/details/28302679

https://blog.csdn.net/klyhuntermax/article/details/51907856