---
title: 系统进程检查
tag: 关键证据检索提取;
date: 2021-08-01T22:00:00+08:00
---

## linux下系统进程查询

### ps

https://www.runoob.com/linux/linux-comm-ps.html

```
Usage:
 ps [options]

参数：

ps 的参数非常多, 在此仅列出几个常用的参数并大略介绍含义
-A 列出所有的进程
-w 显示加宽可以显示较多的资讯
-au 显示较详细的资讯
-aux 显示所有包含其他使用者的行程
au(x) 输出格式 :

USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
USER: 行程拥有者
PID: pid
%CPU: 占用的 CPU 使用率
%MEM: 占用的记忆体使用率
VSZ: 占用的虚拟记忆体大小
RSS: 占用的记忆体大小
TTY: 终端的次要装置号码 (minor device number of tty)
STAT: 该行程的状态:

D: 无法中断的休眠状态 (通常 IO 的进程)
R: 正在执行中
S: 静止状态
T: 暂停执行
Z: 不存在但暂时无法消除
W: 没有足够的记忆体分页可分配
<: 高优先序的行程
N: 低优先序的行程
L: 有记忆体分页分配并锁在记忆体内 (实时系统或捱A I/O)
START: 行程开始时间
TIME: 执行的时间
COMMAND:所执行的指令
```

使用ps命令，分析进程



```
ps aux | grep pid
```





#### 常用查询语句

```
ps -ef //显示所有命令，连带命令行
根据netstat定位出的pid.使用ps命令分析进程
ps aux | grep pid
查看下pid所对应的进程文件路径，
netstat -antlp
运行ls -l /proc/$PID/exe或file /proc/$PID/exe（$PID 为对应的pid 号）
ps -u root //显示root进程用户信息
ps -A 
```



```
parallels@parallels-Parallels-Virtual-Platform:~$ ps -ef
UID          PID    PPID  C STIME TTY          TIME CMD
root           1       0  0 14:03 ?        00:00:02 /sbin/init splash
root           2       0  0 14:03 ?        00:00:00 [kthreadd]
root           3       2  0 14:03 ?        00:00:00 [rcu_gp]
root           4       2  0 14:03 ?        00:00:00 [rcu_par_gp]
root           6       2  0 14:03 ?        00:00:00 [kworker/0:0H-kblockd]
root           9       2  0 14:03 ?        00:00:00 [mm_percpu_wq]
root          10       2  0 14:03 ?        00:00:00 [ksoftirqd/0]
root          11       2  0 14:03 ?        00:00:08 [rcu_sched]
root          12       2  0 14:03 ?        00:00:00 [migration/0]
root          13       2  0 14:03 ?        00:00:00 [idle_inject/0]
root          14       2  0 14:03 ?        00:00:00 [cpuhp/0]
root          15       2  0 14:03 ?        00:00:00 [cpuhp/1]
root          16       2  0 14:03 ?        00:00:00 [idle_inject/1]
root          17       2  0 14:03 ?        00:00:00 [migration/1]
root          18       2  0 14:03 ?        00:00:00 [ksoftirqd/1]
root          20       2  0 14:03 ?        00:00:00 [kworker/1:0H-kblockd]
root          21       2  0 14:03 ?        00:00:00 [kdevtmpfs]
root          22       2  0 14:03 ?        00:00:00 [netns]
root          23       2  0 14:03 ?        00:00:00 [rcu_tasks_kthre]
root          24       2  0 14:03 ?        00:00:00 [kauditd]
root          28       2  0 14:03 ?        00:00:00 [khungtaskd]
root          29       2  0 14:03 ?        00:00:00 [oom_reaper]
root          30       2  0 14:03 ?        00:00:00 [writeback]
root          31       2  0 14:03 ?        00:00:00 [kcompactd0]
root          32       2  0 14:03 ?        00:00:00 [ksmd]
root          33       2  0 14:03 ?        00:00:00 [khugepaged]
root         125       2  0 14:03 ?        00:00:00 [kintegrityd]
root         126       2  0 14:03 ?        00:00:00 [kblockd]
root         127       2  0 14:03 ?        00:00:00 [blkcg_punt_bio]
root         128       2  0 14:03 ?        00:00:00 [tpm_dev_wq]
root         129       2  0 14:03 ?        00:00:00 [ata_sff]
root         130       2  0 14:03 ?        00:00:00 [md]
root         131       2  0 14:03 ?        00:00:00 [edac-poller]
root         132       2  0 14:03 ?        00:00:00 [devfreq_wq]
root         133       2  0 14:03 ?        00:00:00 [watchdogd]
root         136       2  0 14:03 ?        00:00:00 [kswapd0]
root         269       2  0 14:03 ?        00:00:00 [kworker/0:1H-kblockd]
root         272       2  0 14:03 ?        00:00:00 [kworker/1:1H-kblockd]
root         292       2  0 14:03 ?        00:00:00 [jbd2/sda5-8]
root         293       2  0 14:03 ?        00:00:00 [ext4-rsv-conver]
root         332       1  0 14:03 ?        00:00:01 /lib/systemd/systemd-journald
root         352       1  0 14:03 ?        00:00:01 /lib/systemd/systemd-udevd
root         363       2  0 14:03 ?        00:00:00 [loop0]
root         367       2  0 14:03 ?        00:00:00 [loop1]
root         369       2  0 14:03 ?        00:00:00 [loop2]
root         383       2  0 14:03 ?        00:00:00 [loop3]
root         385       2  0 14:03 ?        00:00:00 [loop4]
root         392       2  0 14:03 ?        00:00:00 [loop5]
root         393       2  0 14:03 ?        00:00:00 [loop6]
root         397       2  0 14:03 ?        00:00:00 [loop7]
root         399       2  0 14:03 ?        00:00:00 [loop8]
root         400       2  0 14:03 ?        00:00:00 [loop9]
root         431       2  0 14:03 ?        00:00:00 [cryptd]
systemd+     596       1  0 14:03 ?        00:00:00 /lib/systemd/systemd-resolved
systemd+     597       1  0 14:03 ?        00:00:00 /lib/systemd/systemd-timesyncd
root         628       1  0 14:03 ?        00:00:00 /usr/lib/accountsservice/accounts-daemon
root         629       1  0 14:03 ?        00:00:00 /usr/sbin/acpid
avahi        634       1  0 14:03 ?        00:00:14 avahi-daemon: running [parallels-Parallels-Virt
root         636       1  0 14:03 ?        00:00:00 /usr/sbin/cron -f
root         638       1  0 14:03 ?        00:00:16 /usr/sbin/cupsd -l
message+     639       1  0 14:03 ?        00:00:46 /usr/bin/dbus-daemon --system --address=systemd
root         652       1  0 14:03 ?        00:00:00 /usr/sbin/irqbalance --foreground
root         654       1  0 14:03 ?        00:00:00 /usr/bin/python3 /usr/bin/networkd-dispatcher -
root         658       1  0 14:03 ?        00:00:05 /usr/lib/policykit-1/polkitd --no-debug
syslog       665       1  0 14:03 ?        00:00:00 /usr/sbin/rsyslogd -n -iNONE
root         670       1  0 14:03 ?        00:00:03 /usr/lib/snapd/snapd
root         676       1  0 14:03 ?        00:00:00 /usr/libexec/switcheroo-control
root         681       1  0 14:03 ?        00:00:00 /lib/systemd/systemd-logind
root         682       1  0 14:03 ?        00:00:01 /usr/sbin/thermald --no-daemon --dbus-enable
root         686       1  0 14:03 ?        00:00:00 /usr/lib/udisks2/udisksd
root         687       1  0 14:03 ?        00:00:00 /sbin/wpa_supplicant -u -s -O /run/wpa_supplica
avahi        701     634  0 14:03 ?        00:00:00 avahi-daemon: chroot helper
colord       759       1  0 14:03 ?        00:00:00 /usr/libexec/colord
root         771       1  0 14:03 ?        00:00:01 /usr/sbin/cups-browsed
root         786       1  0 14:03 ?        00:00:00 /usr/sbin/ModemManager --filter-policy=strict
root         793       1  0 14:03 ?        00:00:04 /usr/bin/prltoolsd -p /var/run/prltoolsd.pid
root         826       1  0 14:03 ?        00:00:00 /usr/bin/python3 /usr/share/unattended-upgrades
whoopsie     893       1  0 14:03 ?        00:00:00 /usr/bin/whoopsie -f
kernoops     894       1  0 14:03 ?        00:00:00 /usr/sbin/kerneloops --test
root         897     793  0 14:03 ?        00:00:06 prlshprint
root         899     793  0 14:03 ?        00:00:00 prltimesync
root         900     793  0 14:03 ?        00:00:00 prlusmd
kernoops     903       1  0 14:03 ?        00:00:00 /usr/sbin/kerneloops
root         908       1  0 14:03 ?        00:00:00 /usr/sbin/gdm3
rtkit       1208       1  0 14:03 ?        00:00:00 /usr/libexec/rtkit-daemon
lp          1335     638  0 14:04 ?        00:00:00 /usr/lib/cups/notifier/dbus dbus://
root        1456       1  0 14:04 ?        00:00:01 /usr/lib/upower/upowerd
root        1897     908  0 14:04 ?        00:00:00 gdm-session-worker [pam/gdm-password]
paralle+    1971       1  0 14:04 ?        00:00:00 /lib/systemd/systemd --user
paralle+    1972    1971  0 14:04 ?        00:00:00 (sd-pam)
paralle+    1978    1971  0 14:04 ?        00:00:00 /usr/bin/pulseaudio --daemonize=no --log-target
paralle+    1980    1971  0 14:04 ?        00:00:00 /usr/libexec/tracker-miner-fs
paralle+    1982    1971  0 14:04 ?        00:00:10 /usr/bin/dbus-daemon --session --address=system
paralle+    1989       1  0 14:04 ?        00:00:00 /usr/bin/gnome-keyring-daemon --daemonize --log
paralle+    2003    1971  0 14:04 ?        00:00:00 /usr/libexec/gvfsd
paralle+    2008    1971  0 14:04 ?        00:00:00 /usr/libexec/gvfsd-fuse /run/user/1000/gvfs -f 
paralle+    2009    1971  0 14:04 ?        00:00:00 /usr/libexec/gvfs-udisks2-volume-monitor
paralle+    2037    1971  0 14:04 ?        00:00:00 /usr/libexec/gvfs-goa-volume-monitor
paralle+   27969    3078  0 16:35 pts/0    00:00:00 ps -ef
```

### /proc

参考：https://www.cnblogs.com/liushui-sky/p/9354536.html

Linux系统上的/proc目录是一种文件系统，即proc文件系统。

其它常见的文件系统不同的是，/proc是一种伪文件系统（也即虚拟文件系统），存储的是当前内核运行状态的一系列特殊文件，用户可以通过这些文件查看有关系统硬件及当前正在运行进程的信息，甚至可以通过更改其中某些文件来改变内核的运行状态。



为了查看及使用上的方便，这些文件通常会按照相关性进行分类存储于不同的目录甚至子目录中，如/proc/scsi目录中存储的就是当前系统上所有SCSI设备的相关信息，/proc/N中存储的则是系统当前正在运行的进程的相关信息，其中N为正在运行的进程（可以想象得到，在某进程结束后其相关目录则会消失）。



大多数虚拟文件可以使用文件查看命令如cat、more或者less进行查看，有些文件信息表述的内容可以一目了然，但也有文件的信息却不怎么具有可读性。不过，这些可读性较差的文件在使用一些命令如apm、free、lspci或top查看时却可以有着不错的表现。



#### 查看当前系统进程

/proc目录中包含许多以数字命名的子目录，这些数字表示系统当前正在运行进程的进程号，里面包含对应进程相关的多个信息文件。

```
ll /proc
```

上面列出的是/proc目录中一些进程相关的目录，每个目录中是当程本身相关信息的文件。

#### /PID/cmdline （重点）

**cmdline — 启动当前进程的完整命令，但僵尸进程目录中的此文件不包含任何信息**

在启动时传递至内核的相关参数信息，这些信息通常由lilo或grub等启动管理工具进行传递；

此处这里无法显示通过&&链接的执行的命令行串，无法用来查询由于&&命令行内容

```
parallels@parallels-Parallels-Virtual-Platform:~$ cat /proc/47878/cmdline 
ping baidu.com
```

#### /PID/cwd

**cwd — 指向当前进程运行目录的一个符号链接**

```
parallels@parallels-Parallels-Virtual-Platform:~$ sudo ls -l /proc/43828 | grep cwd
lrwxrwxrwx 1 root      root      0 May 31 14:10 cwd -> /home/parallels
```

#### /PID/environ（重点）

environ — 当前进程的环境变量列表，彼此间用空字符（NULL）隔开；变量用大写字母表示，其值用小写字母表示

```
parallels@parallels-Parallels-Virtual-Platform:~$ sudo cat /proc/47878/environ 
[sudo] password for parallels: 
SHELL=/bin/bashSESSION_MANAGER=local/parallels-Parallels-Virtual-Platform:@/tmp/.ICE-unix/2258,unix/parallels-Parallels-Virtual-Platform:/tmp/.ICE-unix/2258QT_ACCESSIBILITY=1COLORTERM=truecolorXDG_CONFIG_DIRS=/etc/xdg/xdg-ubuntu:/etc/xdgXDG_MENU_PREFIX=gnome-GNOME_DESKTOP_SESSION_ID=this-is-deprecatedGTK_IM_MODULE=ibusQT4_IM_MODULE=ibusGNOME_SHELL_SESSION_MODE=ubuntuSSH_AUTH_SOCK=/run/user/1000/keyring/sshXMODIFIERS=@im=ibusDESKTOP_SESSION=ubuntuSSH_AGENT_PID=2178GTK_MODULES=gail:atk-bridgePWD=/home/parallelsLOGNAME=parallelsXDG_SESSION_DESKTOP=ubuntuXDG_SESSION_TYPE=x11GPG_AGENT_INFO=/run/user/1000/gnupg/S.gpg-agent:0:1XAUTHORITY=/run/user/1000/gdm/XauthorityGJS_DEBUG_TOPICS=JS ERROR;JS LOGWINDOWPATH=2HOME=/home/parallelsUSERNAME=parallelsIM_CONFIG_PHASE=1LANG=en_US.UTF-8LS_COLORS=rs=0:di=01;34:ln=01;36:mh=00:pi=40;33:so=01;35:do=01;35:bd=40;33;01:cd=40;33;01:or=40;31;01:mi=00:su=37;41:sg=30;43:ca=30;41:tw=30;42:ow=34;42:st=37;44:ex=01;32:*.tar=01;31:*.tgz=01;31:*.arc=01;31:*.arj=01;31:*.taz=01;31:*.lha=01;31:*.lz4=01;31:*.lzh=01;31:*.lzma=01;31:*.tlz=01;31:*.txz=01;31:*.tzo=01;31:*.t7z=01;31:*.zip=01;31:*.z=01;31:*.dz=01;31:*.gz=01;31:*.lrz=01;31:*.lz=01;31:*.lzo=01;31:*.xz=01;31:*.zst=01;31:*.tzst=01;31:*.bz2=01;31:*.bz=01;31:*.tbz=01;31:*.tbz2=01;31:*.tz=01;31:*.deb=01;31:*.rpm=01;31:*.jar=01;31:*.war=01;31:*.ear=01;31:*.sar=01;31:*.rar=01;31:*.alz=01;31:*.ace=01;31:*.zoo=01;31:*.cpio=01;31:*.7z=01;31:*.rz=01;31:*.cab=01;31:*.wim=01;31:*.swm=01;31:*.dwm=01;31:*.esd=01;31:*.jpg=01;35:*.jpeg=01;35:*.mjpg=01;35:*.mjpeg=01;35:*.gif=01;35:*.bmp=01;35:*.pbm=01;35:*.pgm=01;35:*.ppm=01;35:*.tga=01;35:*.xbm=01;35:*.xpm=01;35:*.tif=01;35:*.tiff=01;35:*.png=01;35:*.svg=01;35:*.svgz=01;35:*.mng=01;35:*.pcx=01;35:*.mov=01;35:*.mpg=01;35:*.mpeg=01;35:*.m2v=01;35:*.mkv=01;35:*.webm=01;35:*.ogm=01;35:*.mp4=01;35:*.m4v=01;35:*.mp4v=01;35:*.vob=01;35:*.qt=01;35:*.nuv=01;35:*.wmv=01;35:*.asf=01;35:*.rm=01;35:*.rmvb=01;35:*.flc=01;35:*.avi=01;35:*.fli=01;35:*.flv=01;35:*.gl=01;35:*.dl=01;35:*.xcf=01;35:*.xwd=01;35:*.yuv=01;35:*.cgm=01;35:*.emf=01;35:*.ogv=01;35:*.ogx=01;35:*.aac=00;36:*.au=00;36:*.flac=00;36:*.m4a=00;36:*.mid=00;36:*.midi=00;36:*.mka=00;36:*.mp3=00;36:*.mpc=00;36:*.ogg=00;36:*.ra=00;36:*.wav=00;36:*.oga=00;36:*.opus=00;36:*.spx=00;36:*.xspf=00;36:XDG_CURRENT_DESKTOP=ubuntu:GNOMEVTE_VERSION=6003GNOME_TERMINAL_SCREEN=/org/gnome/Terminal/screen/efc7691e_62d3_4da5_9b04_42e49e7c22f4INVOCATION_ID=f08b7a60bc574e1fbfd6211389c8f72bMANAGERPID=1971CLUTTER_IM_MODULE=ibusGJS_DEBUG_OUTPUT=stderrLESSCLOSE=/usr/bin/lesspipe %s %sXDG_SESSION_CLASS=userTERM=xterm-256colorLESSOPEN=| /usr/bin/lesspipe %sUSER=parallelsGNOME_TERMINAL_SERVICE=:1.88DISPLAY=:0SHLVL=1QT_IM_MODULE=ibusXDG_RUNTIME_DIR=/run/user/1000JOURNAL_STREAM=9:39754XDG_DATA_DIRS=/usr/share/ubuntu:/usr/local/share/:/usr/share/:/var/lib/snapd/desktopPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/binGDMSESSION=ubuntuDBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus_=/usr/bin/ping
```

#### /PID/exe（重点）

exe — 指向启动当前进程的可执行文件（完整路径）的符号链接，通过/proc/N/exe可以启动当前进程的一个拷贝

```
parallels@ubuntu:~$ sudo ls -l /proc/47878/ |grep exe
lrwxrwxrwx 1 root      root      0 May 31 14:36 exe -> /usr/bin/ping
```

#### /PID/fd（重点）

fd — 这是个目录，包含当前进程打开的每一个文件的文件描述符（file descriptor），这些文件描述符是指向实际文件的一个符号链接



程序1是运行vim .bash_history，模拟程序调用文件执行情况

```
parallels@ubuntu:~$ vi .bash_history 


poweroff
poweroff
netstat -antlp
apt install net-tools
sudo apt install net-tools
netstat -antlp
netstat -l
cat /etc/
hostnamectl set-hostname ubuntu
uname
uname -a
ps
ps -a
cat /proc/43828/cmdline
ps a
cat /proc/47878/cmdline
cat /proc/47878/environ
sudo cat /proc/47878/environ
uname -a
netstat -i
netstat -apu
netstat -nu
netstat -antlp
```



通过fd/4可以看到，程序调用的文件的内容，但是里面的内容和原本被调用的文件中的内容存在一些差别，这里展示的行的顺序与源文件正好相反。这里只需要获取第一行～之后的文件目录地址即为程序所调用的文件。

```
parallels@ubuntu:~$ sudo cat /proc/53421/fd/4
3210#"! UtpTad��*arallelsubuntu~parallels/.bash_history
�                T��������jd[XR94��������xkhbXQIB:-'#�
 �
  �
   �
    �
     �
      �
       v
        ^
         F
          -
           )
            &

�
 �
  �
   �
    �
     z
      c
       L
        *
         )
          sudo ls -l /proc/43828 | grep cwdsudo ls -l /proc/43828sudo ls -a /proc/43828sudo ll /proc/43828sudo ls /proc/43828sudo ls /proc/43828 |grep cwdll /proc/43828 |grep cwdsudo ll /proc/43828 |grep cwdsudo  /proc/43828/cwdsudo cat /proc/43828/cwdlspwdsudo pwd /proc/43828/cwdsudo ls /proc/43828/cwdsudo ll /proc/43828/cwdsudo pwd /proc/43828/cwdlssudo ls /proc/43828/cwdsudo /proc/43828/cwdsudo cat /proc/43828/cwdcat /proc/43828/cwdcat /proc/43874/cat /proc/43874/cwdcat /proc/43874 cat /proc/43874/cmdline cat /proc/3078/cmdline ll /proc/3078/cmdline ll /proc/3078ps all /proc/43874ll /procll /proc/43874ps apsapsmore /proc/2674/cmdlinell /proc/4ll /proc/3ll /proc/2ll /proc/1ll /procps -efps parallelsps rootps 2ps 1ps1ps(1)ps -aux USERps -auxps -aups -auxps auxps --helpps -hpsping 8.8.8.8ping baidu.comnetstat -lnetstat -snetstat -gnetstat -antlpnetstat -nunetstat -apunetstat -iuname -asudo cat /proc/47878/environ cat /proc/47878/environ cat /proc/47878/cmdline ps acat /proc/43828/cmdline ps -apsuname -aunamehostnamectl set-hostname ubuntucat /etc/netstat -lnetstat -antlpsudo apt install net-toolsapt install net-toolsnetstat -antlppoweroffpoweroff
```

#### /PID/limits

limits — 当前进程所使用的每一个受限资源的软限制、硬限制和管理单元；此文件仅可由实际启动当前进程的UID用户读取；（2.6.24以后的内核版本支持此功能） 

```
parallels@ubuntu:~$ sudo cat /proc/47878/limits
Limit                     Soft Limit           Hard Limit           Units     
Max cpu time              unlimited            unlimited            seconds   
Max file size             unlimited            unlimited            bytes     
Max data size             unlimited            unlimited            bytes     
Max stack size            8388608              unlimited            bytes     
Max core file size        0                    unlimited            bytes     
Max resident set          unlimited            unlimited            bytes     
Max processes             15497                15497                processes 
Max open files            1024                 1048576              files     
Max locked memory         67108864             67108864             bytes     
Max address space         unlimited            unlimited            bytes     
Max file locks            unlimited            unlimited            locks     
Max pending signals       15497                15497                signals   
Max msgqueue size         819200               819200               bytes     
Max nice priority         0                    0                    
Max realtime priority     0                    0                    
Max realtime timeout      unlimited            unlimited            us 
```

#### /PID/maps

maps — 当前进程关联到的每个可执行文件和库文件在内存中的映射区域及其访问权限所组成的列表；

```
parallels@ubuntu:~$ sudo cat /proc/47878/maps
559da3c7a000-559da3c7d000 r--p 00000000 08:05 2622362                    /usr/bin/ping
559da3c7d000-559da3c87000 r-xp 00003000 08:05 2622362                    /usr/bin/ping
559da3c87000-559da3c8b000 r--p 0000d000 08:05 2622362                    /usr/bin/ping
559da3c8b000-559da3c8c000 r--p 00010000 08:05 2622362                    /usr/bin/ping
559da3c8c000-559da3c8d000 rw-p 00011000 08:05 2622362                    /usr/bin/ping
559da3c8d000-559da3cb0000 rw-p 00000000 00:00 0 
559da49bd000-559da49de000 rw-p 00000000 00:00 0                          [heap]
7f453ba5f000-7f453ba61000 r--p 00000000 08:05 2628055                    /usr/lib/x86_64-linux-gnu/libnss_dns-2.31.so
7f453ba61000-7f453ba65000 r-xp 00002000 08:05 2628055                    /usr/lib/x86_64-linux-gnu/libnss_dns-2.31.so
7f453ba65000-7f453ba66000 r--p 00006000 08:05 2628055                    /usr/lib/x86_64-linux-gnu/libnss_dns-2.31.so
7f453ba66000-7f453ba67000 r--p 00006000 08:05 2628055                    /usr/lib/x86_64-linux-gnu/libnss_dns-2.31.so
7f453ba67000-7f453ba68000 rw-p 00007000 08:05 2628055                    /usr/lib/x86_64-linux-gnu/libnss_dns-2.31.so
7f453ba68000-7f453ba69000 r--p 00000000 08:05 2628063                    /usr/lib/x86_64-linux-gnu/libnss_mdns4_minimal.so.2
7f453ba69000-7f453ba6b000 r-xp 00001000 08:05 2628063                    /usr/lib/x86_64-linux-gnu/libnss_mdns4_minimal.so.2
7f453ba6b000-7f453ba6c000 r--p 00003000 08:05 2628063                    /usr/lib/x86_64-linux-gnu/libnss_mdns4_minimal.so.2
7f453ba6c000-7f453ba6d000 r--p 00003000 08:05 2628063                    /usr/lib/x86_64-linux-gnu/libnss_mdns4_minimal.so.2
7f453ba6d000-7f453ba6e000 rw-p 00004000 08:05 2628063                    /usr/lib/x86_64-linux-gnu/libnss_mdns4_minimal.so.2
7f453ba6e000-7f453ba71000 r--p 00000000 08:05 2628057                    /usr/lib/x86_64-linux-gnu/libnss_files-2.31.so
7f453ba71000-7f453ba78000 r-xp 00003000 08:05 2628057                    /usr/lib/x86_64-linux-gnu/libnss_files-2.31.so
7f453ba78000-7f453ba7a000 r--p 0000a000 08:05 2628057                    /usr/lib/x86_64-linux-gnu/libnss_files-2.31.so
7f453ba7a000-7f453ba7b000 r--p 0000b000 08:05 2628057                    /usr/lib/x86_64-linux-gnu/libnss_files-2.31.so
7f453ba7b000-7f453ba7c000 rw-p 0000c000 08:05 2628057                    /usr/lib/x86_64-linux-gnu/libnss_files-2.31.so
7f453ba7c000-7f453ba82000 rw-p 00000000 00:00 0 
7f453ba82000-7f453c860000 r--p 00000000 08:05 2626626                    /usr/lib/locale/locale-archive
7f453c860000-7f453c862000 rw-p 00000000 00:00 0 
7f453c862000-7f453c866000 r--p 00000000 08:05 2627669                    /usr/lib/x86_64-linux-gnu/libgpg-error.so.0.28.0
7f453c866000-7f453c879000 r-xp 00004000 08:05 2627669                    /usr/lib/x86_64-linux-gnu/libgpg-error.so.0.28.0
7f453c879000-7f453c883000 r--p 00017000 08:05 2627669                    /usr/lib/x86_64-linux-gnu/libgpg-error.so.0.28.0
7f453c883000-7f453c884000 r--p 00020000 08:05 2627669                    /usr/lib/x86_64-linux-gnu/libgpg-error.so.0.28.0
7f453c884000-7f453c885000 rw-p 00021000 08:05 2627669                    /usr/lib/x86_64-linux-gnu/libgpg-error.so.0.28.0
7f453c885000-7f453c8aa000 r--p 00000000 08:05 2627295                    /usr/lib/x86_64-linux-gnu/libc-2.31.so
7f453c8aa000-7f453ca22000 r-xp 00025000 08:05 2627295                    /usr/lib/x86_64-linux-gnu/libc-2.31.so
7f453ca22000-7f453ca6c000 r--p 0019d000 08:05 2627295                    /usr/lib/x86_64-linux-gnu/libc-2.31.so
7f453ca6c000-7f453ca6d000 ---p 001e7000 08:05 2627295                    /usr/lib/x86_64-linux-gnu/libc-2.31.so
7f453ca6d000-7f453ca70000 r--p 001e7000 08:05 2627295                    /usr/lib/x86_64-linux-gnu/libc-2.31.so
7f453ca70000-7f453ca73000 rw-p 001ea000 08:05 2627295                    /usr/lib/x86_64-linux-gnu/libc-2.31.so
7f453ca73000-7f453ca77000 rw-p 00000000 00:00 0 
7f453ca77000-7f453ca7b000 r--p 00000000 08:05 2628239                    /usr/lib/x86_64-linux-gnu/libresolv-2.31.so
7f453ca7b000-7f453ca8b000 r-xp 00004000 08:05 2628239                    /usr/lib/x86_64-linux-gnu/libresolv-2.31.so
7f453ca8b000-7f453ca8e000 r--p 00014000 08:05 2628239                    /usr/lib/x86_64-linux-gnu/libresolv-2.31.so
7f453ca8e000-7f453ca8f000 ---p 00017000 08:05 2628239                    /usr/lib/x86_64-linux-gnu/libresolv-2.31.so
7f453ca8f000-7f453ca90000 r--p 00017000 08:05 2628239                    /usr/lib/x86_64-linux-gnu/libresolv-2.31.so
7f453ca90000-7f453ca91000 rw-p 00018000 08:05 2628239                    /usr/lib/x86_64-linux-gnu/libresolv-2.31.so
7f453ca91000-7f453ca93000 rw-p 00000000 00:00 0 
7f453ca93000-7f453ca9f000 r--p 00000000 08:05 2627593                    /usr/lib/x86_64-linux-gnu/libgcrypt.so.20.2.5
7f453ca9f000-7f453cb6d000 r-xp 0000c000 08:05 2627593                    /usr/lib/x86_64-linux-gnu/libgcrypt.so.20.2.5
7f453cb6d000-7f453cbaa000 r--p 000da000 08:05 2627593                    /usr/lib/x86_64-linux-gnu/libgcrypt.so.20.2.5
7f453cbaa000-7f453cbac000 r--p 00116000 08:05 2627593                    /usr/lib/x86_64-linux-gnu/libgcrypt.so.20.2.5
7f453cbac000-7f453cbb1000 rw-p 00118000 08:05 2627593                    /usr/lib/x86_64-linux-gnu/libgcrypt.so.20.2.5
7f453cbb1000-7f453cbb3000 r--p 00000000 08:05 2627316                    /usr/lib/x86_64-linux-gnu/libcap.so.2.32
7f453cbb3000-7f453cbb6000 r-xp 00002000 08:05 2627316                    /usr/lib/x86_64-linux-gnu/libcap.so.2.32
7f453cbb6000-7f453cbb7000 r--p 00005000 08:05 2627316                    /usr/lib/x86_64-linux-gnu/libcap.so.2.32
7f453cbb7000-7f453cbb8000 ---p 00006000 08:05 2627316                    /usr/lib/x86_64-linux-gnu/libcap.so.2.32
7f453cbb8000-7f453cbb9000 r--p 00006000 08:05 2627316                    /usr/lib/x86_64-linux-gnu/libcap.so.2.32
7f453cbb9000-7f453cbba000 rw-p 00007000 08:05 2627316                    /usr/lib/x86_64-linux-gnu/libcap.so.2.32
7f453cbba000-7f453cbbc000 rw-p 00000000 00:00 0 
7f453cbcd000-7f453cbce000 r--p 00000000 08:05 2627082                    /usr/lib/x86_64-linux-gnu/ld-2.31.so
7f453cbce000-7f453cbf1000 r-xp 00001000 08:05 2627082                    /usr/lib/x86_64-linux-gnu/ld-2.31.so
7f453cbf1000-7f453cbf9000 r--p 00024000 08:05 2627082                    /usr/lib/x86_64-linux-gnu/ld-2.31.so
7f453cbfa000-7f453cbfb000 r--p 0002c000 08:05 2627082                    /usr/lib/x86_64-linux-gnu/ld-2.31.so
7f453cbfb000-7f453cbfc000 rw-p 0002d000 08:05 2627082                    /usr/lib/x86_64-linux-gnu/ld-2.31.so
7f453cbfc000-7f453cbfd000 rw-p 00000000 00:00 0 
7ffecd650000-7ffecd671000 rw-p 00000000 00:00 0                          [stack]
7ffecd7eb000-7ffecd7ee000 r--p 00000000 00:00 0                          [vvar]
7ffecd7ee000-7ffecd7ef000 r-xp 00000000 00:00 0                          [vdso]
ffffffffff600000-ffffffffff601000 --xp 00000000 00:00 0                  [vsyscall]
```

#### /PID/mem 

mem — 当前进程所占用的内存空间，由open、read和lseek等系统调用使用，不能被用户读取

```
parallels@ubuntu:~$ sudo cat /proc/47878/mem
cat: /proc/47878/mem: Input/output error
```

#### /PID/root

root — 指向当前进程运行根目录的符号链接；在Unix和Linux系统上，通常采用chroot命令使每个进程运行于独立的根目录

```
parallels@ubuntu:~$ sudo ls -l /proc/47878/ |grep "root -"
lrwxrwxrwx 1 root      root      0 May 31 14:36 root -> /


这里使用grep "root -"，是因为proc每一文件的归属用户也都是root，如下所示，不利于搜索
-r--r--r-- 1 root      root      0 May 31 14:36 arch_status
-rw-r--r-- 1 root      root      0 May 31 14:36 autogroup
-r-------- 1 root      root      0 May 31 14:36 auxv
-r--r--r-- 1 root      root      0 May 31 14:36 cgroup
--w------- 1 root      root      0 May 31 14:36 clear_refs
-r--r--r-- 1 root      root      0 May 31 14:25 cmdline
-rw-r--r-- 1 root      root      0 May 31 14:36 comm
```

#### /PID/stat

stat — 当前进程的状态信息，包含一系统格式化后的数据列，可读性差，通常由ps命令使用

```
parallels@ubuntu:~$ sudo cat /proc/47878/stat
47878 (ping) S 39281 47878 39281 34817 47878 4194304 160 0 0 0 42 208 0 0 20 0 1 0 1566795 18907136 710 18446744073709551615 94135545995264 94135546047281 140732344492352 0 0 0 0 0 8198 1 0 0 17 1 0 0 0 0 0 94135546067584 94135546069952 94135559901184 140732344501200 140732344501215 140732344501215 140732344504298 0
```



#### /PID/statm

statm — 当前进程占用内存的状态信息，通常以“页面”（page）表示

```
parallels@ubuntu:~$ sudo cat /proc/47878/statm
4616 710 662 13 0 134 0
```

#### /PID/status

status — 与stat所提供信息类似，但可读性较好，如下所示，每行表示一个属性信息；其详细介绍请参见 proc的man手册页

```
parallels@ubuntu:~$ sudo cat /proc/47878/status
Name:   ping
Umask:  0002
State:  S (sleeping)
Tgid:   47878
Ngid:   0
Pid:    47878
PPid:   39281
TracerPid:  0
Uid:    1000    1000    1000    1000
Gid:    1000    1000    1000    1000
FDSize: 256
Groups: 4 24 27 30 46 120 131 132 1000 
NStgid: 47878
NSpid:  47878
NSpgid: 47878
NSsid:  39281
VmPeak:    18532 kB
VmSize:    18464 kB
VmLck:         0 kB
VmPin:         0 kB
VmHWM:      2872 kB
VmRSS:      2840 kB
RssAnon:         192 kB
RssFile:        2648 kB
RssShmem:          0 kB
VmData:      404 kB
VmStk:       132 kB
VmExe:        52 kB
VmLib:      2664 kB
VmPTE:        60 kB
VmSwap:        0 kB
HugetlbPages:          0 kB
CoreDumping:    0
THP_enabled:    1
Threads:    1
SigQ:   0/15497
SigPnd: 0000000000000000
ShdPnd: 0000000000000000
SigBlk: 0000000000000000
SigIgn: 0000000000000000
SigCgt: 0000000000002006
CapInh: 0000000000000000
CapPrm: 0000000000002000
CapEff: 0000000000000000
CapBnd: 0000003fffffffff
CapAmb: 0000000000000000
NoNewPrivs: 0
Seccomp:    0
Speculation_Store_Bypass:   vulnerable
Cpus_allowed:   ffffffff
Cpus_allowed_list:  0-31
Mems_allowed:   00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000000,00000001
Mems_allowed_list:  0
voluntary_ctxt_switches:    9093
nonvoluntary_ctxt_switches: 7
```

#### /PID/task（重点）

task — 目录文件，包含由当前进程所运行的每一个线程的相关信息，每个线程的相关信息文件均保存在一个由线程号（tid）命名的目录中，这类似于其内容类似于每个进程目录中的内容；（内核2.6版本以后支持此功能）



这里可以找一个python多线程程序测试，如下

```
#!/usr/bin/python3

import _thread
import time

# 为线程定义一个函数
def print_time( threadName, delay):
   count = 0
   while count < 50:
      time.sleep(delay)
      count += 1
      print ("%s: %s" % ( threadName, time.ctime(time.time()) ))

# 创建两个线程
try:
   _thread.start_new_thread( print_time, ("Thread-1", 2, ) )
   _thread.start_new_thread( print_time, ("Thread-2", 4, ) )
except:
   print ("Error: 无法启动线程")

while 1:
   pass
```

通过task可以看到

```
parallels@ubuntu:~/Documents$ ls -l /proc/150666/task/
total 0
dr-xr-xr-x 7 parallels parallels 0 May 31 17:53 150666
dr-xr-xr-x 7 parallels parallels 0 May 31 17:53 150667
dr-xr-xr-x 7 parallels parallels 0 May 31 17:53 150668
```

#### /apm

apm — 高级电源管理（APM）版本信息及电池相关状态信息，通常由apm命令使用

buddyinfo — 用于诊断内存碎片问题的相关信息文件；

```
parallels@ubuntu:~/Documents$ sudo cat /proc/buddyinfo
Node 0, zone      DMA      1      0      1      0      2      1      1      1      0      1      3 
Node 0, zone    DMA32    501    488    856    432     93     27      6      3      2      7    409 
Node 0, zone   Normal     62     28     23     36    160     41     10      4      4      0      0 
```

#### /cpuinfo

cpuinfo — 处理器的相关信息的文件；

```
parallels@ubuntu:~/Documents$ sudo cat /proc/cpuinfo
processor   : 0
vendor_id   : GenuineIntel
cpu family  : 6
model       : 126
model name  : Intel(R) Core(TM) i7-1068NG7 CPU @ 2.30GHz
stepping    : 5
cpu MHz     : 2304.000
cache size  : 8192 KB
physical id : 0
siblings    : 2
core id     : 0
cpu cores   : 2
apicid      : 0
initial apicid  : 0
fpu     : yes
fpu_exception   : yes
cpuid level : 22
wp      : yes
flags       : fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush mmx fxsr sse sse2 ss ht syscall nx rdtscp lm constant_tsc nopl xtopology nonstop_tsc cpuid tsc_known_freq pni pclmulqdq ssse3 fma cx16 pcid sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand hypervisor lahf_lm abm 3dnowprefetch invpcid_single pti fsgsbase tsc_adjust bmi1 avx2 smep bmi2 invpcid avx512f avx512dq rdseed adx smap clflushopt avx512cd avx512bw avx512vl xsaveopt xsavec dtherm arat pln pts
bugs        : cpu_meltdown spectre_v1 spectre_v2 spec_store_bypass l1tf mds swapgs itlb_multihit
bogomips    : 4608.00
clflush size    : 64
cache_alignment : 64
address sizes   : 36 bits physical, 48 bits virtual
power management:

processor   : 1
vendor_id   : GenuineIntel
cpu family  : 6
model       : 126
model name  : Intel(R) Core(TM) i7-1068NG7 CPU @ 2.30GHz
stepping    : 5
cpu MHz     : 2304.000
cache size  : 8192 KB
physical id : 0
siblings    : 2
core id     : 1
cpu cores   : 2
apicid      : 1
initial apicid  : 1
fpu     : yes
fpu_exception   : yes
cpuid level : 22
wp      : yes
flags       : fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush mmx fxsr sse sse2 ss ht syscall nx rdtscp lm constant_tsc nopl xtopology nonstop_tsc cpuid tsc_known_freq pni pclmulqdq ssse3 fma cx16 pcid sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand hypervisor lahf_lm abm 3dnowprefetch invpcid_single pti fsgsbase tsc_adjust bmi1 avx2 smep bmi2 invpcid avx512f avx512dq rdseed adx smap clflushopt avx512cd avx512bw avx512vl xsaveopt xsavec dtherm arat pln pts
bugs        : cpu_meltdown spectre_v1 spectre_v2 spec_store_bypass l1tf mds swapgs itlb_multihit
bogomips    : 4608.00
clflush size    : 64
cache_alignment : 64
address sizes   : 36 bits physical, 48 bits virtual
power management:
```

#### /crypto

crypto — 系统上已安装的内核使用的密码算法及每个算法的详细信息列表；

```
parallels@ubuntu:~/Documents$ sudo cat /proc/crypto 
name         : crct10dif
driver       : crct10dif-pclmul
module       : crct10dif_pclmul
priority     : 200
refcnt       : 2
selftest     : passed
internal     : no
type         : shash
blocksize    : 1
digestsize   : 2

name         : ghash
driver       : ghash-clmulni
module       : ghash_clmulni_intel
priority     : 400
refcnt       : 1
selftest     : passed
internal     : no
type         : ahash
async        : yes
blocksize    : 16
digestsize   : 16

......
```

#### /devices

devices — 系统已经加载的所有块设备和字符设备的信息，包含主设备号和设备组（与主设备号对应的设备类型）名；

```
parallels@ubuntu:~/Documents$ sudo cat /proc/devices 
Character devices:
  1 mem
  4 /dev/vc/0
  4 tty
  4 ttyS
  5 /dev/tty
  5 /dev/console
  5 /dev/ptmx
  5 ttyprintk
  6 lp
  7 vcs
 10 misc
 13 input
 21 sg
 29 fb
 81 video4linux
 89 i2c
 99 ppdev
108 ppp
116 alsa
128 ptm
136 pts
180 usb
189 usb_device
204 ttyMAX
226 drm
238 media
239 aux
240 cec
241 BaseRemoteCtl
242 hidraw
243 vfio
244 bsg
245 watchdog
246 ptp
247 pps
248 rtc
249 dma_heap
250 dax
251 dimmctl
252 ndctl
253 tpm
254 gpiochip

Block devices:
  7 loop
  8 sd
  9 md
 11 sr
 65 sd
 66 sd
 67 sd
 68 sd
 69 sd
 70 sd
 71 sd
128 sd
129 sd
130 sd
131 sd
132 sd
133 sd
134 sd
135 sd
253 device-mapper
254 mdp
259 blkext
```

#### /diskstats

diskstats — 每块磁盘设备的磁盘I/O统计信息列表；（内核2.5.69以后的版本支持此功能）

```
parallels@ubuntu:~/Documents$ sudo cat /proc/diskstats
   7       0 loop0 43 0 690 13 0 0 0 0 0 56 13 0 0 0 0 0 0
   7       1 loop1 382 0 10194 124 0 0 0 0 0 720 124 0 0 0 0 0 0
   7       2 loop2 955 0 14846 150 0 0 0 0 0 968 150 0 0 0 0 0 0
   7       3 loop3 43 0 696 16 0 0 0 0 0 32 16 0 0 0 0 0 0
   7       4 loop4 55 0 2142 26 0 0 0 0 0 76 26 0 0 0 0 0 0
   7       5 loop5 461 0 28720 115 0 0 0 0 0 1492 115 0 0 0 0 0 0
   7       6 loop6 43 0 696 9 0 0 0 0 0 44 9 0 0 0 0 0 0
   7       7 loop7 1433 0 27754 238 0 0 0 0 0 1928 238 0 0 0 0 0 0
   8       0 sda 20271 9379 1610136 13409 20326 33553 2200738 29558 0 29804 43439 0 0 0 0 2943 471
   8       1 sda1 164 1013 13014 32 3 0 10 0 0 84 32 0 0 0 0 0 0
   8       2 sda2 2 0 4 0 0 0 0 0 0 8 0 0 0 0 0 0 0
   8       5 sda5 20002 8366 1592930 13355 19597 33553 2200728 29500 0 29720 42856 0 0 0 0 0 0
  11       0 sr0 11 0 5 1 0 0 0 0 0 24 1 0 0 0 0 0 0
   7       8 loop8 2468 0 14116 193 0 0 0 0 0 1184 193 0 0 0 0 0 0
   7       9 loop9 43 0 694 6 0 0 0 0 0 20 6 0 0 0 0 0 0
   7      10 loop10 34 0 92 12 0 0 0 0 0 48 12 0 0 0 0 0 0
```

#### /dma

dma — 每个正在使用且注册的ISA DMA通道的信息列表；

```
parallels@ubuntu:~/Documents$ cat /proc/dma
 4: cascade
```

#### /execdomains

execdomains — 内核当前支持的执行域（每种操作系统独特“个性”）信息列表；

```
parallels@ubuntu:~/Documents$ cat /proc/execdomains
0-0 Linux               [kernel]
```

#### /fb

fb — 帧缓冲设备列表文件，包含帧缓冲设备的设备号和相关驱动信息；

```
parallels@ubuntu:~/Documents$ cat /proc/fb
0 prldrmfb
```

#### /filesystems

filesystems — 当前被内核支持的文件系统类型列表文件，被标示为nodev的文件系统表示不需要块设备的支持；通常mount一个设备时，如果没有指定文件系统类型将通过此文件来决定其所需文件系统的类型；

```
parallels@ubuntu:~/Documents$ cat /proc/filesystems
nodev   sysfs
nodev   tmpfs
nodev   bdev
nodev   proc
nodev   cgroup
nodev   cgroup2
nodev   cpuset
nodev   devtmpfs
nodev   configfs
nodev   debugfs
nodev   tracefs
nodev   securityfs
nodev   sockfs
nodev   bpf
nodev   pipefs
nodev   ramfs
nodev   hugetlbfs
nodev   devpts
    ext3
    ext2
    ext4
    squashfs
    vfat
nodev   ecryptfs
    fuseblk
nodev   fuse
nodev   fusectl
nodev   mqueue
nodev   pstore
nodev   autofs
nodev   prl_fs
```

#### /interrupts

interrupts — X86或X86_64体系架构系统上每个IRQ相关的中断号列表；多路处理器平台上每个CPU对于每个I/O设备均有自己的中断号；

```
parallels@ubuntu:~/Documents$ cat /proc/interrupts
           CPU0       CPU1       
  0:          5          0   IO-APIC   2-edge      timer
  1:          0       2115   IO-APIC   1-edge      i8042
  8:          1          0   IO-APIC   8-edge      rtc0
  9:          0      54300   IO-APIC   9-fasteoi   acpi
 12:        144          0   IO-APIC  12-edge      i8042
 14:          0          0   IO-APIC  14-edge      ata_piix
 15:          0          0   IO-APIC  15-edge      ata_piix
 18:       4012       2072   IO-APIC  18-fasteoi   uhci_hcd:usb2
 19:        221          0   IO-APIC  19-fasteoi   ehci_hcd:usb1
 22:          0          0   IO-APIC  22-fasteoi   virtio1
 25:          0      22667   PCI-MSI 49152-edge      prl_tg
 26:         16         12   PCI-MSI 81920-edge      virtio0-config
 27:       2970       3763   PCI-MSI 81921-edge      virtio0-input.0
 28:       5404       4730   PCI-MSI 81922-edge      virtio0-output.0
 29:          4         39   PCI-MSI 487424-edge      xhci_hcd
 30:      35057      20716   PCI-MSI 512000-edge      ahci[0000:00:1f.2]
 31:       7106      12055   PCI-MSI 524288-edge      prl_drm
 32:      10323          0   PCI-MSI 516096-edge      snd_hda_intel:card0
NMI:          0          0   Non-maskable interrupts
LOC:    3819832    2976992   Local timer interrupts
SPU:          0          0   Spurious interrupts
PMI:          0          0   Performance monitoring interrupts
IWI:          0          4   IRQ work interrupts
RTR:          0          0   APIC ICR read retries
RES:     401643     455360   Rescheduling interrupts
CAL:     168695     247341   Function call interrupts
TLB:       5109       4875   TLB shootdowns
TRM:          0          0   Thermal event interrupts
THR:          0          0   Threshold APIC interrupts
DFR:          0          0   Deferred Error APIC interrupts
MCE:          0          0   Machine check exceptions
MCP:         92         92   Machine check polls
ERR:          0
MIS:          0
PIN:          0          0   Posted-interrupt notification event
NPI:          0          0   Nested posted-interrupt event
PIW:          0          0   Posted-interrupt wakeup event
```

#### /iomem

iomem — 每个物理设备上的记忆体（RAM或者ROM）在系统内存中的映射信息；

```
parallels@ubuntu:~/Documents$ cat /proc/iomem
00000000-00000000 : Reserved
00000000-00000000 : System RAM
00000000-00000000 : Reserved
00000000-00000000 : PCI Bus 0000:00
00000000-00000000 : PCI Bus 0000:00
  00000000-00000000 : Video ROM
00000000-00000000 : Adapter ROM
00000000-00000000 : Reserved
  00000000-00000000 : System ROM
00000000-00000000 : System RAM
  00000000-00000000 : Kernel code
  00000000-00000000 : Kernel rodata
  00000000-00000000 : Kernel data
  00000000-00000000 : Kernel bss
00000000-00000000 : Reserved
00000000-00000000 : ACPI Tables
00000000-00000000 : ACPI Non-volatile Storage
00000000-00000000 : PCI Bus 0000:00
  00000000-00000000 : PCI Bus 0000:01
    00000000-00000000 : 0000:01:00.0
  00000000-00000000 : PCI Bus 0000:02
  00000000-00000000 : PCI Bus 0000:03
  00000000-00000000 : PCI Bus 0000:01
    00000000-00000000 : 0000:01:00.0
    00000000-00000000 : 0000:01:00.0
  00000000-00000000 : 0000:00:05.0
  00000000-00000000 : PCI Bus 0000:02
  00000000-00000000 : 0000:00:1d.6
    00000000-00000000 : xhci-hcd
  00000000-00000000 : 0000:00:1d.7
    00000000-00000000 : ehci_hcd
  00000000-00000000 : PCI Bus 0000:03
  00000000-00000000 : 0000:00:1f.2
    00000000-00000000 : ahci
  00000000-00000000 : 0000:00:1f.3
  00000000-00000000 : 0000:00:1f.4
    00000000-00000000 : ICH HD audio
  00000000-00000000 : PCI MMCONFIG 0000 [bus 00-0f]
    00000000-00000000 : pnp 00:04
00000000-00000000 : Reserved
  00000000-00000000 : IOAPIC 0
00000000-00000000 : Reserved
  00000000-00000000 : HPET 1
    00000000-00000000 : PNP0103:00
00000000-00000000 : Reserved
00000000-00000000 : Local APIC
  00000000-00000000 : Reserved
00000000-00000000 : INT0800:00
  00000000-00000000 : Reserved
00000000-00000000 : System RAM
```

#### /ioports

ioports — 当前正在使用且已经注册过的与物理设备进行通讯的输入-输出端口范围信息列表；如下面所示，第一列表示注册的I/O端口范围，其后表示相关的设备；

```
parallels@ubuntu:~/Documents$ cat /proc/ioports
0000-0000 : PCI Bus 0000:00
  0000-0000 : dma1
  0000-0000 : pic1
  0000-0000 : timer0
  0000-0000 : timer1
  0000-0000 : keyboard
  0000-0000 : PNP0800:00
  0000-0000 : PNP0C09:00
    0000-0000 : EC data
  0000-0000 : keyboard
  0000-0000 : PNP0C09:00
    0000-0000 : EC cmd
  0000-0000 : rtc0
  0000-0000 : dma page reg
  0000-0000 : pic2
  0000-0000 : dma2
  0000-0000 : PNP0C04:00
    0000-0000 : fpu
  0000-0000 : 0000:00:1f.1
    0000-0000 : ata_piix
  0000-0000 : 0000:00:1f.1
    0000-0000 : ata_piix
  0000-0000 : 0000:00:1f.1
    0000-0000 : ata_piix
  0000-0000 : vesafb
  0000-0000 : 0000:00:1f.1
    0000-0000 : ata_piix
  0000-0000 : pnp 00:04
  0000-0000 : QEMU0001:00
0000-0000 : PCI conf1
0000-0000 : PCI Bus 0000:00
  0000-0000 : 0000:00:1f.0
    0000-0000 : ACPI PM1a_EVT_BLK
    0000-0000 : ACPI PM1a_CNT_BLK
    0000-0000 : ACPI PM_TMR
    0000-0000 : ACPI PM2_CNT_BLK
    0000-0000 : ACPI GPE0_BLK
  0000-0000 : gpio_ich.1.auto
    0000-0000 : gpio_ich
    0000-0000 : gpio_ich
  0000-0000 : PCI Bus 0000:01
    0000-0000 : 0000:01:00.0
      0000-0000 : prl_drm
  0000-0000 : 0000:00:03.0
    0000-0000 : prl_tg
  0000-0000 : 0000:00:05.0
    0000-0000 : virtio-pci-legacy
  0000-0000 : PCI Bus 0000:02
  0000-0000 : 0000:00:0e.0
    0000-0000 : virtio-pci-legacy
  0000-0000 : 0000:00:1d.0
    0000-0000 : uhci_hcd
  0000-0000 : PCI Bus 0000:03
  0000-0000 : 0000:00:1f.1
    0000-0000 : ata_piix
  0000-0000 : 0000:00:1f.2
    0000-0000 : ahci
  0000-0000 : 0000:00:1f.2
    0000-0000 : ahci
  0000-0000 : 0000:00:1f.2
    0000-0000 : ahci
  0000-0000 : 0000:00:1f.2
    0000-0000 : ahci
  0000-0000 : 0000:00:1f.2
    0000-0000 : ahci
  0000-0000 : 0000:00:1f.3
    0000-0000 : i801_smbus
```

#### /kallsyms

kallsyms — 模块管理工具用来动态链接或绑定可装载模块的符号定义，由内核输出；（内核2.5.71以后的版本支持此功能）；通常这个文件中的信息量相当大；

```
......
0000000000000000 t prl_vid_probe.cold   [prl_vid]
0000000000000000 r __FUNCTION__.42603   [prl_vid]
0000000000000000 d version  [prl_vid]
0000000000000000 d prl_vid_pci_driver   [prl_vid]
0000000000000000 t prl_vid_cleanup_module   [prl_vid]
0000000000000000 d prl_vid_pci_tbl  [prl_vid]
0000000000000000 r __param_usedrm   [prl_vid]
0000000000000000 r __param_str_usedrm   [prl_vid]
0000000000000000 t prl_drm_activate_svga_ioctl  [prl_vid]
0000000000000000 t prl_drm_get_memsize_ioctl    [prl_vid]
0000000000000000 t prl_drm_irq_handler  [prl_vid]
0000000000000000 t prl_kms_connector_atomic_get_property    [prl_vid]
0000000000000000 t prl_kms_connector_atomic_set_property    [prl_vid]
0000000000000000 t prl_kms_connector_set_property   [prl_vid]
0000000000000000 t prl_kms_connector_detect [prl_vid]
0000000000000000 t prl_kms_connector_dpms   [prl_vid]
0000000000000000 t prl_kms_crtc_helper_atomic_begin [prl_vid]
0000000000000000 t prl_kms_crtc_helper_atomic_check [prl_vid]
0000000000000000 t prl_kms_crtc_helper_commit   [prl_vid]
0000000000000000 t prl_kms_crtc_helper_prepare  [prl_vid]
0000000000000000 t prl_kms_crtc_helper_disable  [prl_vid]
0000000000000000 t prl_kms_crtc_helper_mode_set_nofb    [prl_vid]
0000000000000000 t prl_kms_crtc_gamma_set   [prl_vid]
......
```

#### /kcore

kcore — 系统使用的物理内存，以ELF核心文件（core file）格式存储，其文件大小为已使用的物理内存（RAM）加上4KB；这个文件用来检查内核数据结构的当前状态，因此，通常由GBD通常调试工具使用，但不能使用文件查看命令打开此文件；

#### /kmsg

kmsg — 此文件用来保存由内核输出的信息，通常由/sbin/klogd或/bin/dmsg等程序使用，不要试图使用查看命令打开此文件；

#### /loadavg

loadavg — 保存关于CPU和磁盘I/O的负载平均值，其前三列分别表示每1秒钟、每5秒钟及每15秒的负载平均值，类似于uptime命令输出的相关信息；第四列是由斜线隔开的两个数值，前者表示当前正由内核调度的实体（进程和线程）的数目，后者表示系统当前存活的内核调度实体的数目；第五列表示此文件被查看前最近一个由内核创建的进程的PID；

#### /locks

locks — 保存当前由内核锁定的文件的相关信息，包含内核内部的调试数据；每个锁定占据一行，且具有一个惟一的编号；如下输出信息中每行的第二列表示当前锁定使用的锁定类别，POSIX表示目前较新类型的文件锁，由lockf系统调用产生，FLOCK是传统的UNIX文件锁，由flock系统调用产生；第三列也通常由两种类型，ADVISORY表示不允许其他用户锁定此文件，但允许读取，MANDATORY表示此文件锁定期间不允许其他用户任何形式的访问；

```
parallels@ubuntu:~/Documents$ sudo cat /proc/locks
1: POSIX  ADVISORY  READ 19994 08:05:1052576 128 128
2: POSIX  ADVISORY  READ 19994 08:05:1052045 1073741826 1073742335
3: FLOCK  ADVISORY  WRITE 849 00:1c:7 0 EOF
4: POSIX  ADVISORY  WRITE 744 00:19:786 0 EOF
5: FLOCK  ADVISORY  WRITE 560 00:19:706 0 EOF
6: FLOCK  ADVISORY  WRITE 44692 00:37:46 0 EOF
```

#### /mdstat

mdstat — 保存RAID相关的多块磁盘的当前状态信息，在没有使用RAID机器上，其显示为如下状态：

```
parallels@ubuntu:~/Documents$ sudo cat /proc/mdstat
Personalities : 
unused devices: <none>
```

#### /meminfo

meminfo — 系统中关于当前内存的利用状况等的信息，常由free命令使用；可以使用文件查看命令直接读取此文件，其内容显示为两列，前者为统计属性，后者为对应的值；

```
parallels@ubuntu:~/Documents$ sudo cat /proc/meminfo
MemTotal:        4023368 kB
MemFree:         1633600 kB
MemAvailable:    2665656 kB
Buffers:           68720 kB
Cached:          1121116 kB
SwapCached:            0 kB
Active:          1611916 kB
Inactive:         480120 kB
Active(anon):     903376 kB
Inactive(anon):     2396 kB
Active(file):     708540 kB
Inactive(file):   477724 kB
Unevictable:           0 kB
Mlocked:               0 kB
SwapTotal:       2097148 kB
SwapFree:        2097148 kB
Dirty:               152 kB
Writeback:             0 kB
AnonPages:        902196 kB
Mapped:           246020 kB
Shmem:              3576 kB
KReclaimable:     103668 kB
Slab:             209292 kB
SReclaimable:     103668 kB
SUnreclaim:       105624 kB
KernelStack:       10108 kB
PageTables:        16764 kB
NFS_Unstable:          0 kB
Bounce:                0 kB
WritebackTmp:          0 kB
CommitLimit:     4108832 kB
Committed_AS:    5164156 kB
VmallocTotal:   34359738367 kB
VmallocUsed:       29024 kB
VmallocChunk:          0 kB
Percpu:            30592 kB
HardwareCorrupted:     0 kB
AnonHugePages:         0 kB
ShmemHugePages:        0 kB
ShmemPmdMapped:        0 kB
FileHugePages:         0 kB
FilePmdMapped:         0 kB
HugePages_Total:       0
HugePages_Free:        0
HugePages_Rsvd:        0
HugePages_Surp:        0
Hugepagesize:       2048 kB
Hugetlb:               0 kB
DirectMap4k:      255920 kB
DirectMap2M:     3938304 kB
```

#### /mounts（重点）

mounts — 在内核2.4.29版本以前，此文件的内容为系统当前挂载的所有文件系统，在2.4.19以后的内核中引进了每个进程使用独立挂载名称空间的方式，此文件则随之变成了指向/proc/self/mounts（每个进程自身挂载名称空间中的所有挂载点列表）文件的符号链接；/proc/self是一个独特的目录，后文中会对此目录进行介绍；

[root@rhel5 ~]# ll /proc |grep mounts



如下所示，其中第一列表示挂载的设备，第二列表示在当前目录树中的挂载点，第三点表示当前文件系统的类型，第四列表示挂载属性（ro或者rw），第五列和第六列用来匹配/etc/mtab文件中的转储（dump）属性；



[root@rhel5 ~]# more /proc/mounts 

```
parallels@ubuntu:~/Documents$ sudo cat /proc/mounts
sysfs /sys sysfs rw,nosuid,nodev,noexec,relatime 0 0
proc /proc proc rw,nosuid,nodev,noexec,relatime 0 0
udev /dev devtmpfs rw,nosuid,noexec,relatime,size=1981872k,nr_inodes=495468,mode=755 0 0
devpts /dev/pts devpts rw,nosuid,noexec,relatime,gid=5,mode=620,ptmxmode=000 0 0
tmpfs /run tmpfs rw,nosuid,nodev,noexec,relatime,size=402340k,mode=755 0 0
/dev/sda5 / ext4 rw,relatime,errors=remount-ro 0 0
securityfs /sys/kernel/security securityfs rw,nosuid,nodev,noexec,relatime 0 0
tmpfs /dev/shm tmpfs rw,nosuid,nodev 0 0
tmpfs /run/lock tmpfs rw,nosuid,nodev,noexec,relatime,size=5120k 0 0
tmpfs /sys/fs/cgroup tmpfs ro,nosuid,nodev,noexec,mode=755 0 0
cgroup2 /sys/fs/cgroup/unified cgroup2 rw,nosuid,nodev,noexec,relatime,nsdelegate 0 0
cgroup /sys/fs/cgroup/systemd cgroup rw,nosuid,nodev,noexec,relatime,xattr,name=systemd 0 0
pstore /sys/fs/pstore pstore rw,nosuid,nodev,noexec,relatime 0 0
none /sys/fs/bpf bpf rw,nosuid,nodev,noexec,relatime,mode=700 0 0
cgroup /sys/fs/cgroup/net_cls,net_prio cgroup rw,nosuid,nodev,noexec,relatime,net_cls,net_prio 0 0
cgroup /sys/fs/cgroup/freezer cgroup rw,nosuid,nodev,noexec,relatime,freezer 0 0
cgroup /sys/fs/cgroup/cpuset cgroup rw,nosuid,nodev,noexec,relatime,cpuset 0 0
cgroup /sys/fs/cgroup/blkio cgroup rw,nosuid,nodev,noexec,relatime,blkio 0 0
cgroup /sys/fs/cgroup/cpu,cpuacct cgroup rw,nosuid,nodev,noexec,relatime,cpu,cpuacct 0 0
cgroup /sys/fs/cgroup/hugetlb cgroup rw,nosuid,nodev,noexec,relatime,hugetlb 0 0
cgroup /sys/fs/cgroup/perf_event cgroup rw,nosuid,nodev,noexec,relatime,perf_event 0 0
cgroup /sys/fs/cgroup/rdma cgroup rw,nosuid,nodev,noexec,relatime,rdma 0 0
cgroup /sys/fs/cgroup/memory cgroup rw,nosuid,nodev,noexec,relatime,memory 0 0
cgroup /sys/fs/cgroup/devices cgroup rw,nosuid,nodev,noexec,relatime,devices 0 0
cgroup /sys/fs/cgroup/pids cgroup rw,nosuid,nodev,noexec,relatime,pids 0 0
systemd-1 /proc/sys/fs/binfmt_misc autofs rw,relatime,fd=28,pgrp=1,timeout=0,minproto=5,maxproto=5,direct,pipe_ino=18064 0 0
hugetlbfs /dev/hugepages hugetlbfs rw,relatime,pagesize=2M 0 0
mqueue /dev/mqueue mqueue rw,nosuid,nodev,noexec,relatime 0 0
debugfs /sys/kernel/debug debugfs rw,nosuid,nodev,noexec,relatime 0 0
tracefs /sys/kernel/tracing tracefs rw,nosuid,nodev,noexec,relatime 0 0
fusectl /sys/fs/fuse/connections fusectl rw,nosuid,nodev,noexec,relatime 0 0
configfs /sys/kernel/config configfs rw,nosuid,nodev,noexec,relatime 0 0
/dev/loop0 /snap/core18/1885 squashfs ro,nodev,relatime 0 0
/dev/loop1 /snap/core18/2066 squashfs ro,nodev,relatime 0 0
/dev/loop2 /snap/gnome-3-34-1804/66 squashfs ro,nodev,relatime 0 0
/dev/loop3 /snap/gtk-common-themes/1506 squashfs ro,nodev,relatime 0 0
/dev/loop4 /snap/gnome-3-34-1804/36 squashfs ro,nodev,relatime 0 0
/dev/loop5 /snap/snapd/11841 squashfs ro,nodev,relatime 0 0
/dev/loop6 /snap/snap-store/467 squashfs ro,nodev,relatime 0 0
/dev/loop7 /snap/snap-store/518 squashfs ro,nodev,relatime 0 0
/dev/loop8 /snap/gtk-common-themes/1515 squashfs ro,nodev,relatime 0 0
/dev/sda1 /boot/efi vfat rw,relatime,fmask=0077,dmask=0077,codepage=437,iocharset=iso8859-1,shortname=mixed,errors=remount-ro 0 0
Home /media/psf/Home prl_fs rw,sync,nosuid,nodev,noatime,ttl=250,share 0 0
HRSword_Installer /media/psf/HRSword_Installer prl_fs rw,sync,nosuid,nodev,noatime,ttl=250,share 0 0
iCloud /media/psf/iCloud prl_fs rw,sync,nosuid,nodev,noatime,ttl=250,share 0 0
tmpfs /run/user/1000 tmpfs rw,nosuid,nodev,relatime,size=402336k,mode=700,uid=1000,gid=1000 0 0
tmpfs /run/snapd/ns tmpfs rw,nosuid,nodev,noexec,relatime,size=402340k,mode=755 0 0
nsfs /run/snapd/ns/snap-store.mnt nsfs rw 0 0
tmpfs /run/user/125 tmpfs rw,nosuid,nodev,relatime,size=402336k,mode=700,uid=125,gid=130 0 0
gvfsd-fuse /run/user/125/gvfs fuse.gvfsd-fuse rw,nosuid,nodev,relatime,user_id=125,group_id=130 0 0
gvfsd-fuse /run/user/1000/gvfs fuse.gvfsd-fuse rw,nosuid,nodev,relatime,user_id=1000,group_id=1000 0 0
/dev/fuse /run/user/1000/doc fuse rw,nosuid,nodev,relatime,user_id=1000,group_id=1000 0 0
/dev/loop10 /snap/snapd/12057 squashfs ro,nodev,relatime 0 0
```

#### /modules

modules — 当前装入内核的所有模块名称列表，可以由lsmod命令使用，也可以直接查看；如下所示，其中第一列表示模块名，第二列表示此模块占用内存空间大小，第三列表示此模块有多少实例被装入，第四列表示此模块依赖于其它哪些模块，第五列表示此模块的装载状态（Live：已经装入；Loading：正在装入；Unloading：正在卸载），第六列表示此模块在内核内存（kernel memory）中的偏移量；

```
parallels@ubuntu:~/Documents$ lsmod 
Module                  Size  Used by
usblp                  24576  0
prl_fs_freeze          16384  0
prl_fs                 28672  3
prl_eth                16384  0
nls_iso8859_1          16384  1
snd_hda_codec_generic    81920  1
ledtrig_audio          16384  1 snd_hda_codec_generic
snd_hda_intel          53248  9
snd_intel_dspcfg       24576  1 snd_hda_intel
snd_hda_codec         139264  2 snd_hda_codec_generic,snd_hda_intel
snd_hda_core           94208  3 snd_hda_codec_generic,snd_hda_intel,snd_hda_codec
snd_hwdep              20480  1 snd_hda_codec
snd_pcm               114688  4 snd_hda_intel,snd_hda_codec,snd_hda_core
snd_seq_midi           20480  0
snd_seq_midi_event     16384  1 snd_seq_midi
snd_rawmidi            36864  1 snd_seq_midi
snd_seq                69632  2 snd_seq_midi,snd_seq_midi_event
intel_rapl_msr         20480  0
intel_rapl_common      28672  1 intel_rapl_msr
x86_pkg_temp_thermal    20480  0
coretemp               20480  0
crct10dif_pclmul       16384  1
ghash_clmulni_intel    16384  0
snd_seq_device         16384  3 snd_seq,snd_seq_midi,snd_rawmidi
snd_timer              40960  3 snd_seq,snd_pcm
aesni_intel           372736  0
crypto_simd            16384  1 aesni_intel
cryptd                 24576  2 crypto_simd,ghash_clmulni_intel
glue_helper            16384  1 aesni_intel
rapl                   20480  0
snd                    94208  25 snd_hda_codec_generic,snd_seq,snd_seq_device,snd_hwdep,snd_hda_intel,snd_hda_codec,snd_timer,snd_pcm,snd_rawmidi
uvcvideo               98304  0
videobuf2_vmalloc      20480  1 uvcvideo
input_leds             16384  0
videobuf2_memops       20480  1 videobuf2_vmalloc
videobuf2_v4l2         24576  1 uvcvideo
soundcore              16384  1 snd
serio_raw              20480  0
videobuf2_common       57344  2 videobuf2_v4l2,uvcvideo
videodev              241664  3 videobuf2_v4l2,uvcvideo,videobuf2_common
joydev                 24576  0
sbs                    20480  0
mc                     57344  4 videodev,videobuf2_v4l2,uvcvideo,videobuf2_common
sbshc                  16384  1 sbs
mac_hid                16384  0
pvpanic                16384  0
sch_fq_codel           20480  2
parport_pc             45056  0
ppdev                  24576  0
lp                     20480  0
parport                65536  3 parport_pc,lp,ppdev
ip_tables              32768  0
x_tables               49152  1 ip_tables
autofs4                45056  2
prl_vid                53248  7
drm_kms_helper        217088  1 prl_vid
gpio_ich               16384  0
syscopyarea            16384  1 drm_kms_helper
sysfillrect            16384  1 drm_kms_helper
sysimgblt              16384  1 drm_kms_helper
fb_sys_fops            16384  1 drm_kms_helper
cec                    53248  1 drm_kms_helper
rc_core                57344  1 cec
crc32_pclmul           16384  0
drm                   552960  9 drm_kms_helper,prl_vid
i2c_i801               32768  0
i2c_smbus              20480  1 i2c_i801
psmouse               155648  0
ahci                   40960  2
libahci                36864  1 ahci
pata_acpi              16384  0
xhci_pci               20480  0
xhci_pci_renesas       20480  1 xhci_pci
lpc_ich                24576  0
virtio_net             57344  0
net_failover           20480  1 virtio_net
failover               16384  1 net_failover
prl_tg                 28672  17 prl_vid,prl_fs
hid_generic            16384  0
usbhid                 57344  0
hid                   135168  2 usbhid,hid_generic

parallels@ubuntu:~/Documents$ cat /proc/
Display all 312 possibilities? (y or n)
parallels@ubuntu:~/Documents$ cat /proc/modules
usblp 24576 0 - Live 0x0000000000000000
prl_fs_freeze 16384 0 - Live 0x0000000000000000 (POE)
prl_fs 28672 3 - Live 0x0000000000000000 (POE)
prl_eth 16384 0 - Live 0x0000000000000000 (POE)
nls_iso8859_1 16384 1 - Live 0x0000000000000000
snd_hda_codec_generic 81920 1 - Live 0x0000000000000000
ledtrig_audio 16384 1 snd_hda_codec_generic, Live 0x0000000000000000
snd_hda_intel 53248 6 - Live 0x0000000000000000
snd_intel_dspcfg 24576 1 snd_hda_intel, Live 0x0000000000000000
snd_hda_codec 139264 2 snd_hda_codec_generic,snd_hda_intel, Live 0x0000000000000000
snd_hda_core 94208 3 snd_hda_codec_generic,snd_hda_intel,snd_hda_codec, Live 0x0000000000000000
snd_hwdep 20480 1 snd_hda_codec, Live 0x0000000000000000
snd_pcm 114688 3 snd_hda_intel,snd_hda_codec,snd_hda_core, Live 0x0000000000000000
snd_seq_midi 20480 0 - Live 0x0000000000000000
snd_seq_midi_event 16384 1 snd_seq_midi, Live 0x0000000000000000
snd_rawmidi 36864 1 snd_seq_midi, Live 0x0000000000000000
snd_seq 69632 2 snd_seq_midi,snd_seq_midi_event, Live 0x0000000000000000
intel_rapl_msr 20480 0 - Live 0x0000000000000000
intel_rapl_common 28672 1 intel_rapl_msr, Live 0x0000000000000000
x86_pkg_temp_thermal 20480 0 - Live 0x0000000000000000
coretemp 20480 0 - Live 0x0000000000000000
crct10dif_pclmul 16384 1 - Live 0x0000000000000000
ghash_clmulni_intel 16384 0 - Live 0x0000000000000000
snd_seq_device 16384 3 snd_seq_midi,snd_rawmidi,snd_seq, Live 0x0000000000000000
snd_timer 40960 2 snd_pcm,snd_seq, Live 0x0000000000000000
aesni_intel 372736 0 - Live 0x0000000000000000
crypto_simd 16384 1 aesni_intel, Live 0x0000000000000000
cryptd 24576 2 ghash_clmulni_intel,crypto_simd, Live 0x0000000000000000
glue_helper 16384 1 aesni_intel, Live 0x0000000000000000
rapl 20480 0 - Live 0x0000000000000000
snd 94208 21 snd_hda_codec_generic,snd_hda_intel,snd_hda_codec,snd_hwdep,snd_pcm,snd_rawmidi,snd_seq,snd_seq_device,snd_timer, Live 0x0000000000000000
uvcvideo 98304 0 - Live 0x0000000000000000
videobuf2_vmalloc 20480 1 uvcvideo, Live 0x0000000000000000
input_leds 16384 0 - Live 0x0000000000000000
videobuf2_memops 20480 1 videobuf2_vmalloc, Live 0x0000000000000000
videobuf2_v4l2 24576 1 uvcvideo, Live 0x0000000000000000
soundcore 16384 1 snd, Live 0x0000000000000000
serio_raw 20480 0 - Live 0x0000000000000000
videobuf2_common 57344 2 uvcvideo,videobuf2_v4l2, Live 0x0000000000000000
videodev 241664 3 uvcvideo,videobuf2_v4l2,videobuf2_common, Live 0x0000000000000000
joydev 24576 0 - Live 0x0000000000000000
sbs 20480 0 - Live 0x0000000000000000
mc 57344 4 uvcvideo,videobuf2_v4l2,videobuf2_common,videodev, Live 0x0000000000000000
sbshc 16384 1 sbs, Live 0x0000000000000000
mac_hid 16384 0 - Live 0x0000000000000000
pvpanic 16384 0 - Live 0x0000000000000000
sch_fq_codel 20480 2 - Live 0x0000000000000000
parport_pc 45056 0 - Live 0x0000000000000000
ppdev 24576 0 - Live 0x0000000000000000
lp 20480 0 - Live 0x0000000000000000
parport 65536 3 parport_pc,ppdev,lp, Live 0x0000000000000000
ip_tables 32768 0 - Live 0x0000000000000000
x_tables 49152 1 ip_tables, Live 0x0000000000000000
autofs4 45056 2 - Live 0x0000000000000000
prl_vid 53248 7 - Live 0x0000000000000000 (POE)
drm_kms_helper 217088 1 prl_vid, Live 0x0000000000000000
gpio_ich 16384 0 - Live 0x0000000000000000
syscopyarea 16384 1 drm_kms_helper, Live 0x0000000000000000
sysfillrect 16384 1 drm_kms_helper, Live 0x0000000000000000
sysimgblt 16384 1 drm_kms_helper, Live 0x0000000000000000
fb_sys_fops 16384 1 drm_kms_helper, Live 0x0000000000000000
cec 53248 1 drm_kms_helper, Live 0x0000000000000000
rc_core 57344 1 cec, Live 0x0000000000000000
crc32_pclmul 16384 0 - Live 0x0000000000000000
drm 552960 9 prl_vid,drm_kms_helper, Live 0x0000000000000000
i2c_i801 32768 0 - Live 0x0000000000000000
i2c_smbus 20480 1 i2c_i801, Live 0x0000000000000000
psmouse 155648 0 - Live 0x0000000000000000
ahci 40960 2 - Live 0x0000000000000000
libahci 36864 1 ahci, Live 0x0000000000000000
pata_acpi 16384 0 - Live 0x0000000000000000
xhci_pci 20480 0 - Live 0x0000000000000000
xhci_pci_renesas 20480 1 xhci_pci, Live 0x0000000000000000
lpc_ich 24576 0 - Live 0x0000000000000000
virtio_net 57344 0 - Live 0x0000000000000000
net_failover 20480 1 virtio_net, Live 0x0000000000000000
failover 16384 1 net_failover, Live 0x0000000000000000
prl_tg 28672 17 prl_fs,prl_vid, Live 0x0000000000000000 (POE)
hid_generic 16384 0 - Live 0x0000000000000000
usbhid 57344 0 - Live 0x0000000000000000
hid 135168 2 hid_generic,usbhid, Live 0x0000000000000000
```

#### /partitions

partition — 块设备每个分区的主设备号（major）和次设备号（minor）等信息，同时包括每个分区所包含的块（block）数目（如下面输出中第三列所示）；

```
parallels@ubuntu:~/Documents$ cat /proc/partitions
major minor  #blocks  name

   7        0      56648 loop0
   7        1      56752 loop1
   7        2     224248 loop2
   7        3      63580 loop3
   7        4     261700 loop4
   7        5      32856 loop5
   7        6      50980 loop6
   7        7      52268 loop7
   8        0   67108864 sda
   8        1     524288 sda1
   8        2          1 sda2
   8        5   66581504 sda5
  11        0    1048575 sr0
   7        8      66660 loop8
   7       10      32872 loop10
```

#### /pci

pci — 内核初始化时发现的所有PCI设备及其配置信息列表，其配置信息多为某PCI设备相关IRQ信息，可读性不高，可以用“/sbin/lspci –vb”命令获得较易理解的相关信息；在2.6内核以后，此文件已为/proc/bus/pci目录及其下的文件代替；

```
parallels@ubuntu:~/Documents$ sudo ls /proc/bus/pci
00  01  devices
```

#### /slabinfo

slabinfo — 在内核中频繁使用的对象（如inode、dentry等）都有自己的cache，即slab pool，而/proc/slabinfo文件列出了这些对象相关slap的信息；详情可以参见内核文档中slapinfo的手册页；

```
parallels@ubuntu:~/Documents$ sudo cat /proc/slabinfo
slabinfo - version: 2.1
# name            <active_objs> <num_objs> <objsize> <objperslab> <pagesperslab> : tunables <limit> <batchcount> <sharedfactor> : slabdata <active_slabs> <num_slabs> <sharedavail>
ext4_groupinfo_4k    532    532    144   28    1 : tunables    0    0    0 : slabdata     19     19      0
fsverity_info          0      0    256   32    2 : tunables    0    0    0 : slabdata      0      0      0
MPTCPv6                0      0   1856   17    8 : tunables    0    0    0 : slabdata      0      0      0
ip6-frags              0      0    184   44    2 : tunables    0    0    0 : slabdata      0      0      0
PINGv6                 0      0   1216   26    8 : tunables    0    0    0 : slabdata      0      0      0
RAWv6                338    338   1216   26    8 : tunables    0    0    0 : slabdata     13     13      0
......
```

#### /stat

stat — 实时追踪自系统上次启动以来的多种统计信息；如下所示，其中，

“cpu”行后的八个值分别表示以1/100（jiffies）秒为单位的统计值（包括系统运行于用户模式、低优先级用户模式，运系统模式、空闲模式、I/O等待模式的时间等）；

“intr”行给出中断的信息，第一个为自系统启动以来，发生的所有的中断的次数；然后每个数对应一个特定的中断自系统启动以来所发生的次数；

“ctxt”给出了自系统启动以来CPU发生的上下文交换的次数。

“btime”给出了从系统启动到现在为止的时间，单位为秒；

“processes (total_forks) 自系统启动以来所创建的任务的个数目；

“procs_running”：当前运行队列的任务的数目；

“procs_blocked”：当前被阻塞的任务的数目；

```
parallels@ubuntu:~/Documents$ sudo cat /proc/stat
cpu  2567490 1440 51293 4222742 573 0 570 0 0 0
cpu0 1517356 706 23050 1852688 351 0 237 0 0 0
cpu1 1050133 734 28242 2370053 221 0 332 0 0 0
intr 10703208 5 3393 0 0 0 0 0 0 1 72225 0 0 144 0 0 0 0 0 14598 221 0 0 0 0 0 28244 28 7018 10447 43 61479 32574 13193 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
ctxt 18957381
btime 1622582403
processes 127489
procs_running 3
procs_blocked 0
softirq 11692393 15 7686922 29 18488 60735 0 3220 2072535 0 1850449
```

#### /swaps

swaps — 当前系统上的交换分区及其空间利用信息，如果有多个交换分区的话，则会每个交换分区的信息分别存储于/proc/swap目录中的单独文件中，而其优先级数字越低，被使用到的可能性越大；下面是作者系统中只有一个交换分区时的输出信息；

```
parallels@ubuntu:~/Documents$ cat /proc/swaps
Filename                Type        Size        Used        Priority
/swapfile                               file        2097148     0       -2
```

#### /uptime

uptime — 系统上次启动以来的运行时间，如下所示，其第一个数字表示系统运行时间，第二个数字表示系统空闲时间，单位是秒；

```
parallels@ubuntu:~/Documents$ cat /proc/uptime
42519.81 50173.72
```

#### /version（重点）

version — 当前系统运行的内核版本号，在作者的RHEL5.3上还会显示系统安装的gcc版本，如下所示；

```
parallels@ubuntu:~/Documents$ cat /proc/version
Linux version 5.8.0-53-generic (buildd@lcy01-amd64-012) (gcc (Ubuntu 9.3.0-17ubuntu1~20.04) 9.3.0, GNU ld (GNU Binutils for Ubuntu) 2.34) #60~20.04.1-Ubuntu SMP Thu May 6 09:52:46 UTC 2021
```

#### /vmstat

vmstat — 当前系统虚拟内存的多种统计数据，信息量可能会比较大，这因系统而有所不同，可读性较好；下面为作者机器上输出信息的一个片段；（2.6以后的内核支持此文件）

```
parallels@ubuntu:~/Documents$ cat /proc/vmstat
nr_free_pages 405201
nr_zone_inactive_anon 615
nr_zone_active_anon 228524
nr_zone_inactive_file 119513
nr_zone_active_file 177357
nr_zone_unevictable 0
nr_zone_write_pending 10
nr_mlock 0
nr_page_table_pages 4200
nr_kernel_stack 10048
nr_bounce 0
nr_zspages 0
nr_free_cma 0
numa_hit 21836396
numa_miss 0
numa_foreign 0
......
```

#### /zoneinfo

zoneinfo — 内存区域（zone）的详细信息列表，信息量较大，下面列出的是一个输出片段：

```
parallels@ubuntu:~/Documents$ cat /proc/zoneinfo
Node 0, zone      DMA
  per-node stats
      nr_inactive_anon 615
      nr_active_anon 228553
      nr_inactive_file 119513
      nr_active_file 177369
      nr_unevictable 0
      nr_slab_reclaimable 25998
      nr_slab_unreclaimable 26446
      nr_isolated_anon 0
      nr_isolated_file 0
      workingset_nodes 0
      workingset_refault 0
      workingset_activate 0
      workingset_restore 0
      workingset_nodereclaim 0
      nr_anon_pages 228265
      nr_mapped    61375
      nr_file_pages 297792
      nr_dirty     11
      nr_writeback 0
      nr_writeback_temp 0
      nr_shmem     911
      nr_shmem_hugepages 0
      nr_shmem_pmdmapped 0
      nr_file_hugepages 0
      nr_file_pmdmapped 0
      nr_anon_transparent_hugepages 0
      nr_vmscan_write 0
      nr_vmscan_immediate_reclaim 0
      nr_dirtied   420987
      nr_written   277592
      nr_kernel_misc_reclaimable 0
      nr_foll_pin_acquired 0
      nr_foll_pin_released 0
  pages free     3845
        min      67
        low      83
        high     99
        spanned  4095
        present  3998
        managed  3977
        protection: (0, 2652, 3855, 3855, 3855)
......
```

#### /sys

sys — 目录详解

与/proc下其它文件的“只读”属性不同的是，管理员可对/proc/sys子目录中的许多文件内容进行修改以更改内核的运行特性，事先可以使用“ls -l”命令查看某文件是否“可写入”。写入操作通常使用类似于“echo DATA > /path/to/your/filename”的格式进行。需要注意的是，即使文件可写，其一般也不可以使用编辑器进行编辑。

```
parallels@ubuntu:~/Documents$ ll /proc/sys
total 0
dr-xr-xr-x   1 root root 0 Jun  1 23:29 ./
dr-xr-xr-x 309 root root 0 Jun  1 23:29 ../
dr-xr-xr-x   1 root root 0 Jun  2 17:17 abi/
dr-xr-xr-x   1 root root 0 Jun  2 17:17 debug/
dr-xr-xr-x   1 root root 0 Jun  1 23:29 dev/
dr-xr-xr-x   1 root root 0 Jun  1 23:29 fs/
dr-xr-xr-x   1 root root 0 Jun  1 23:29 kernel/
dr-xr-xr-x   1 root root 0 Jun  1 23:29 net/
dr-xr-xr-x   1 root root 0 Jun  2 17:17 user/
dr-xr-xr-x   1 root root 0 Jun  1 23:29 vm/
```

/proc/sys/debug 子目录

此目录通常是一空目录；

/proc/sys/dev 子目录

为系统上特殊设备提供参数信息文件的目录，其不同设备的信息文件分别存储于不同的子目录中，如大多数系统上都会具有的/proc/sys/dev/cdrom和/proc/sys/dev/raid（如果内核编译时开启了支持raid的功能） 目录，其内存储的通常是系统上cdrom和raid的相关参数信息文件。



### pstree（比较好用）

相较于/proc查询，pstree的展示更加方便，比ps展示的更加清晰有层次

```
pstree [-a] [-c] [-h|-Hpid] [-l] [-n] [-p] [-u] [-G|-U] [pid|user]

-a 显示该行程的完整指令及参数, 如果是被记忆体置换出去的行程则会加上括号
-c 如果有重覆的行程名, 则分开列出（预设值是会在前面加上 *）
-A 各进程树之间的连接以ASCII码字符来连接
-U 各进程树之间的连接以utf8字符来连接，某些终端可能会有错误
-p 同时列出每个进程的PID
-u 同时列出每个进程的所属账号名称(被小括号括起来)

特别表明在运行的进程
# pstree -apnh //显示进程间的关系
同时显示用户名称

# pstree -u //显示用户名称
```

这里也同样使用多线程程序测试，可以看到pstree展示多线程情况如下

```
parallels@ubuntu:~/Documents$ pstree -anph 150666
python3,150666 pymutil.py
  |-{python3},150667
  `-{python3},150668
```

### kill (结束进程）

kill -9 PID  强制关闭某进程

kill PID       关闭某进程

## windows下系统进程查询

### tasklist



```
  C:\Users\xt>tasklist /?

TASKLIST [/S system [/U username [/P [password]]]]
         [/M [module] | /SVC | /V] [/FI filter] [/FO format] [/NH]

描述:
    该工具显示在本地或远程机器上当前运行的进程列表。


参数列表:
   /S     system           指定连接到的远程系统。（需要远端开启RPC服务，否则无法连接）
   /U     [domain\]user    指定应该在哪个用户上下文执行这个命令。
   /P     [password]       为提供的用户上下文指定密码。如果省略，则
                           提示输入。
   /M     [module]         列出当前使用所给 exe/dll 名称的所有任务。
                           如果没有指定模块名称，显示所有加载的模块。
   /SVC                    显示每个进程中主持的服务。
   /APPS 显示 Microsoft Store 应用及其关联的进程。
   /V                      显示详细任务信息。
   /FI    filter           显示一系列符合筛选器
                           指定条件的任务。
   /FO    format           指定输出格式。
                           有效值: "TABLE"、"LIST"、"CSV"。
   /NH                     指定列标题不应该
                           在输出中显示。
                           只对 "TABLE" 和 "CSV" 格式有效。
   /?                      显示此帮助消息。

筛选器:
    筛选器名称     有效运算符           有效值
    -----------     ---------------           --------------------------
    STATUS          eq, ne                    RUNNING | SUSPENDED
                                              NOT RESPONDING | UNKNOWN
    IMAGENAME       eq, ne                    映像名称
    PID             eq, ne, gt, lt, ge, le    PID 值
    SESSION         eq, ne, gt, lt, ge, le    会话编号
    SESSIONNAME     eq, ne                    会话名称
    CPUTIME         eq, ne, gt, lt, ge, le    CPU 时间，格式为
                                              hh:mm:ss。
                                              hh - 小时，
                                              mm - 分钟，ss - 秒
    MEMUSAGE        eq, ne, gt, lt, ge, le    内存使用(以 KB 为单位)
    USERNAME        eq, ne                    用户名，格式为
                                              [域\]用户
    SERVICES        eq, ne                    服务名称
    WINDOWTITLE     eq, ne                    窗口标题
    模块         eq, ne                    DLL 名称

注意: 当查询远程计算机时，不支持 "WINDOWTITLE" 和 "STATUS"
      筛选器。

Examples:
    TASKLIST
    TASKLIST /M dll文件名（不加则导出所有程序及其使用的dll，量很大） 列出所有使用或调用指定dll文件的程序
    TASKLIST /V /FO CSV                                      用csv格式输出所有程序详情
    TASKLIST /SVC /FO LIST                                   用list格式输出所有程序的服务
    TASKLIST /APPS /FI "STATUS eq RUNNING"                   显示所有微软商店相关并且状态为正在运行中的程序
    TASKLIST /M wbem*                                                                            显示所有调用wbem开头的dll模块的程序
    TASKLIST /S IP /FO LIST
    TASKLIST /S IP /U 域\用户名 /FO CSV /NH
    TASKLIST /S IP /U username /P password /FO TABLE /NH
    TASKLIST /FI "USERNAME ne NT AUTHORITY\SYSTEM" /FI "STATUS eq running"  系统中正在运行的非“SYSTEM“的所有进程
    TASKLIST /M user32.dll                                   显示所有使用user32.dll的程序
```



```
C:\Users\xt>tasklist

映像名称                       PID 会话名              会话#       内存使用
========================= ======== ================ =========== ============
System Idle Process              0 Services                   0          8 K
System                           4 Services                   0         32 K
Registry                        92 Services                   0     60,240 K
smss.exe                       336 Services                   0        532 K
csrss.exe                      464 Services                   0      3,664 K
wininit.exe                    568 Services                   0      3,756 K
services.exe                   700 Services                   0      8,220 K
lsass.exe                      720 Services                   0     13,968 K
svchost.exe                    836 Services                   0     24,472 K
fontdrvhost.exe                868 Services                   0        860 K
WUDFHost.exe                   936 Services                   0      1,884 K




C:\Users\xt>TASKLIST /M user32.dll

映像名称                       PID 模块
========================= ======== ============================================
lsass.exe                      720 user32.dll
svchost.exe                    836 USER32.dll
WUDFHost.exe                   936 USER32.dll
svchost.exe                    432 USER32.dll
svchost.exe                   1044 user32.dll
svchost.exe                   1104 user32.dll
svchost.exe                   1112 user32.dll
svchost.exe                   1236 user32.dll
svchost.exe                   1268 user32.dll

C:\Users\xt>TASKLIST /V /FO CSV
"映像名称","PID","会话名      ","会话#   ","内存使用 ","状态  ","用户名   ","CPU 时间","窗口标题    "
"System Idle Process","0","Services","0","8 K","Unknown","NT AUTHORITY\SYSTEM","2:29:41","暂缺"
"System","4","Services","0","32 K","Unknown","暂缺","0:20:12","暂缺"
"Registry","92","Services","0","58,972 K","Unknown","NT AUTHORITY\SYSTEM","0:00:03","暂缺"
"smss.exe","336","Services","0","520 K","Unknown","NT AUTHORITY\SYSTEM","0:00:01","暂缺"
"csrss.exe","464","Services","0","3,680 K","Unknown","NT AUTHORITY\SYSTEM","0:00:03","暂缺"
"wininit.exe","568","Services","0","3,724 K","Unknown","NT AUTHORITY\SYSTEM","0:00:00","暂缺"
......
"svchost.exe","2208","Services","0","31,984 K","Unknown","NT AUTHORITY\SYSTEM","0:00:01","暂缺"
"svchost.exe","9488","Services","0","8,204 K","Unknown","NT AUTHORITY\LOCAL SERVICE","0:00:00","暂缺"
"svchost.exe","6972","Services","0","11,368 K","Unknown","NT AUTHORITY\LOCAL SERVICE","0:00:00","暂缺"
"csrss.exe","1604","Console","2","5,944 K","Running","NT AUTHORITY\SYSTEM","0:00:01","暂缺"
"winlogon.exe","6448","Console","2","13,628 K","Unknown","NT AUTHORITY\SYSTEM","0:00:00","暂缺"
"dwm.exe","8792","Console","2","139,520 K","Running","Window Manager\DWM-2","0:00:03","DWM Notification Window"
"fontdrvhost.exe","9804","Console","2","14,600 K","Unknown","Font Driver Host\UMFD-2","0:00:00","暂缺"
"prl_tools.exe","9888","Console","2","11,684 K","Running","NT AUTHORITY\SYSTEM","0:00:00","暂缺"
"coherence.exe","2420","Console","2","10,012 K","Unknown","NT AUTHORITY\SYSTEM","0:00:00","暂缺"
"coherence.exe","6608","Console","2","6,064 K","Unknown","NT AUTHORITY\SYSTEM","0:00:00","暂缺"
"svchost.exe","8428","Services","0","5,876 K","Unknown","NT AUTHORITY\LOCAL SERVICE","0:00:00","暂缺"
"ChsIME.exe","3924","Console","2","16,548 K","Unknown","NT AUTHORITY\SYSTEM","0:00:00","暂缺"
"SangforUDProtect.exe","5764","Console","2","9,992 K","Running","NT AUTHORITY\SYSTEM","0:00:00","SangforUDProtectExe"
"ctfmon.exe","8296","Console","2","31,008 K","Running","DESKTOP-D9ITQNU\xt","0:00:02","暂缺"
"sihost.exe","9076","Console","2","28,724 K","Running","DESKTOP-D9ITQNU\xt","0:00:01","暂缺"
"svchost.exe","7628","Console","2","19,612 K","Unknown","DESKTOP-D9ITQNU\xt","0:00:00","暂缺"
"svchost.exe","8956","Console","2","41,044 K","Running","DESKTOP-D9ITQNU\xt","0:00:00","Windows Push Notifications Platform"
"ChsIME.exe","3952","Console","2","8,300 K","Running","DESKTOP-D9ITQNU\xt","0:00:00","暂缺"
"taskhostw.exe","1572","Console","2","10,444 K","Running","DESKTOP-D9ITQNU\xt","0:00:00","Task Host Window"
"explorer.exe","8916","Console","2","159,660 K","Running","DESKTOP-D9ITQNU\xt","0:01:01","暂缺"
"svchost.exe","1080","Console","2","22,848 K","Running","DESKTOP-D9ITQNU\xt","0:00:00","暂缺"
"dllhost.exe","9608","Console","2","16,576 K","Running","DESKTOP-D9ITQNU\xt","0:00:00","OleMainThreadWndName"
"StartMenuExperienceHost.exe","3524","Console","2","77,320 K","Running","DESKTOP-D9ITQNU\xt","0:00:01","启动"
"RuntimeBroker.exe","6840","Console","2","26,352 K","Unknown","DESKTOP-D9ITQNU\xt","0:00:01","暂缺"
"dllhost.exe","2996","Console","2","7,596 K","Running","DESKTOP-D9ITQNU\xt","0:00:01","OleMainThreadWndName"
"SearchApp.exe","2476","Console","2","164,680 K","Running","DESKTOP-D9ITQNU\xt","0:00:06","搜索"
"RuntimeBroker.exe","7692","Console","2","35,440 K","Running","DESKTOP-D9ITQNU\xt","0:00:02","暂缺"
"wpscloudsvr.exe","928","Console","2","8,724 K","Running","DESKTOP-D9ITQNU\xt","0:00:03","暂缺"
"prl_cc.exe","7980","Console","2","39,768 K","Running","DESKTOP-D9ITQNU\xt","0:00:08","暂缺"
"TextInputHost.exe","5760","Console","2","46,064 K","Running","DESKTOP-D9ITQNU\xt","0:00:00","Microsoft Text Input Application"
"RuntimeBroker.exe","7776","Console","2","19,536 K","Unknown","DESKTOP-D9ITQNU\xt","0:00:01","暂缺"
"YourPhone.exe","5524","Console","2","49,812 K","Running","DESKTOP-D9ITQNU\xt","0:00:00","暂缺"
"SecurityHealthSystray.exe","10668","Console","2","9,600 K","Running","DESKTOP-D9ITQNU\xt","0:00:00","暂缺"
"HipsTray.exe","10768","Console","2","26,300 K","Running","DESKTOP-D9ITQNU\xt","0:00:01","暂缺"
"vm3dservice.exe","10884","Console","2","6,860 K","Running","DESKTOP-D9ITQNU\xt","0:00:00","VM3DService Hidden window"
"FileOpenBroker64.exe","10932","Console","2","8,716 K","Running","DESKTOP-D9ITQNU\xt","0:00:00","FileOpenBroker64.exe"
"AdobeARM.exe","11036","Console","2","23,352 K","Running","DESKTOP-D9ITQNU\xt","0:00:00","Adobe Reader Updater"
"WmiPrvSE.exe","11184","Services","0","9,044 K","Unknown","NT AUTHORITY\SYSTEM","0:00:00","暂缺"
"cmd.exe","10912","Console","2","4,688 K","Running","DESKTOP-D9ITQNU\xt","0:00:00","管理员: C:\WINDOWS\system32\cmd.exe - TASKLIST  /V /FO CSV"
"conhost.exe","2664","Console","2","17,868 K","Running","DESKTOP-D9ITQNU\xt","0:00:05","暂缺"



C:\Users\xt>TASKLIST /SVC /FO LIST

映像名称:     System Idle Process
PID:          0
服务    :     暂缺

映像名称:     System
PID:          4
服务    :     暂缺

映像名称:     Registry
PID:          92
服务    :     暂缺
......
映像名称:     lsass.exe
PID:          720
服务    :     KeyIso
              SamSs
              VaultSvc

映像名称:     svchost.exe
PID:          836
服务    :     BrokerInfrastructure
              DcomLaunch
              PlugPlay
              Power
              SystemEventsBroker

映像名称:     fontdrvhost.exe
PID:          868
服务    :     暂缺

映像名称:     WUDFHost.exe
PID:          936
服务    :     暂缺
......



C:\Users\xt>TASKLIST /M wbem*

映像名称                       PID 模块
========================= ======== ============================================
svchost.exe                   3040 wbemcomn.dll, wbemcore.dll, wbemsvc.dll,
                                   wbemess.dll
WmiPrvSE.exe                  5356 wbemcomn.dll, wbemsvc.dll
WmiPrvSE.exe                 11184 wbemcomn.dll, wbemsvc.dll
svchost.exe                   6408 wbemprox.dll, wbemcomn.dll, wbemsvc.dll
tasklist.exe                  1896 wbemprox.dll, wbemcomn.dll, wbemsvc.dll
```

### **taskkill （结束进程）**

查杀进程

taskkill /pid 1132（PID）

taskkill /IM notepad.exe（进程名）
