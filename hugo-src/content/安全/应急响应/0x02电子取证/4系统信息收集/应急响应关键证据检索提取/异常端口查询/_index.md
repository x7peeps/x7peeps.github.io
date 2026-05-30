---
title: 异常端口查询
tag: 关键证据检索提取;
date: 2021-07-27T12:00:00+08:00
---

## Linux下异常端口/连接检查

### netstat

菜鸟 https://www.runoob.com/linux/linux-comm-netstat.html

使用netstat 网络连接命令，分析可疑端口、IP、PID

```
netstat [-acCeFghilMnNoprstuvVwx][-A<网络类型>][--ip]

参数说明：

-a或--all 显示所有连线中的Socket。
-A<网络类型>或--<网络类型> 列出该网络类型连线中的相关地址。
-c或--continuous 持续列出网络状态。
-C或--cache 显示路由器配置的快取信息。
-e或--extend 显示网络其他相关信息。
-F或--fib 显示路由缓存。
-g或--groups 显示多重广播功能群组组员名单。
-h或--help 在线帮助。
-i或--interfaces 显示网络界面信息表单。
-l或--listening 显示监控中的服务器的Socket。
-M或--masquerade 显示伪装的网络连线。
-n或--numeric 直接使用IP地址，而不通过域名服务器。
-N或--netlink或--symbolic 显示网络硬件外围设备的符号连接名称。
-o或--timers 显示计时器。
-p或--programs 显示正在使用Socket的程序识别码和程序名称。
-r或--route 显示Routing Table。
-s或--statistics 显示网络工作信息统计表。
-t或--tcp 显示TCP传输协议的连线状况。
-u或--udp 显示UDP传输协议的连线状况。
-v或--verbose 显示指令执行过程。
-V或--version 显示版本信息。
-w或--raw 显示RAW传输协议的连线状况。
-x或--unix 此参数的效果和指定"-A unix"参数相同。
--ip或--inet 此参数的效果和指定"-A inet"参数相同
```



#### 常用查询语句

```
netstat -antlp|more  监听使用IP显示所有tcp，显示正在使用socket的程序识别码和程序
netstat -nu  显示当前户籍UDP连接状况
netstat -apu 显示UDP端口号的使用情况
netstat -i   显示网卡列表
netstat -g   显示组播组的关系
netstat -s   显示网络统计信息
netstat -l   显示监听的套接口
```



```
parallels@parallels-Parallels-Virtual-Platform:~$ netstat -antlp
(Not all processes could be identified, non-owned process info
 will not be shown, you would have to be root to see it all.)
Active Internet connections (servers and established)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name    
tcp        0      0 127.0.0.53:53           0.0.0.0:*               LISTEN      -                   
tcp        0      0 127.0.0.1:631           0.0.0.0:*               LISTEN      -                   
tcp6       0      0 ::1:631                 :::*                    LISTEN      -    

parallels@parallels-Parallels-Virtual-Platform:~$ netstat -nu
Active Internet connections (w/o servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State      
udp        0      0 10.211.55.14:40391      10.211.55.1:53          ESTABLISHED
udp        0      0 10.211.55.14:68         10.211.55.1:67          ESTABLISHED
udp        0      0 10.211.55.14:41864      10.211.55.1:53          ESTABLISHED


parallels@parallels-Parallels-Virtual-Platform:~$ netstat -apu
(Not all processes could be identified, non-owned process info
 will not be shown, you would have to be root to see it all.)
Active Internet connections (servers and established)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name    
udp        0      0 0.0.0.0:34725           0.0.0.0:*                           -                   
udp        0      0 localhost:domain        0.0.0.0:*                           -                   
udp        0      0 10.211.55.14:bootpc     10.211.55.1:bootps      ESTABLISHED -                   
udp        0      0 0.0.0.0:631             0.0.0.0:*                           -                   
udp        0      0 0.0.0.0:mdns            0.0.0.0:*                           -                   
udp        0      0 10.211.55.14:41864      10.211.55.1:domain      ESTABLISHED -                   
udp        0      0 0.0.0.0:mdns            0.0.0.0:*                           -                   
udp6       0      0 [::]:54263              [::]:*                              -                   
udp6       0      0 [::]:mdns               [::]:*                              - 


parallels@parallels-Parallels-Virtual-Platform:~$ netstat -i
Kernel Interface table
Iface      MTU    RX-OK RX-ERR RX-DRP RX-OVR    TX-OK TX-ERR TX-DRP TX-OVR Flg
enp0s5    1500      517      0      0 0           510      0      0      0 BMRU
lo       65536      234      0      0 0           234      0      0      0 LRU


parallels@parallels-Parallels-Virtual-Platform:~$ netstat -s
Ip:
    Forwarding: 2
    830 total packets received
    1 with invalid addresses
    0 forwarded
    0 incoming packets discarded
    827 incoming packets delivered
    778 requests sent out
    20 outgoing packets dropped
Icmp:
    42 ICMP messages received
    0 input ICMP message failed
    ICMP input histogram:
        destination unreachable: 42
    42 ICMP messages sent
    0 ICMP messages failed
    ICMP output histogram:
        destination unreachable: 42
IcmpMsg:
        InType3: 42
        OutType3: 42
Tcp:
    22 active connection openings
    0 passive connection openings
    4 failed connection attempts
    2 connection resets received
    0 connections established
    387 segments received
    284 segments sent out
    2 segments retransmitted
    0 bad segments received
    18 resets sent
Udp:
    345 packets received
    42 packets to unknown port received
    0 packet receive errors
    450 packets sent
    0 receive buffer errors
    0 send buffer errors
    IgnoredMulti: 15
UdpLite:
TcpExt:
    3 TCP sockets finished time wait in fast timer
    6 delayed acks sent
    185 packet headers predicted
    28 acknowledgments not containing data payload received
    27 predicted acknowledgments
    TCPLostRetransmit: 1
    TCPTimeouts: 2
    2 connections reset due to early user close
    TCPRcvCoalesce: 16
    TCPAutoCorking: 6
    TCPSynRetrans: 2
    TCPOrigDataSent: 56
    TCPDelivered: 70
IpExt:
    InMcastPkts: 76
    OutMcastPkts: 77
    InBcastPkts: 15
    OutBcastPkts: 15
    InOctets: 431065
    OutOctets: 65974
    InMcastOctets: 9435
    OutMcastOctets: 9124
    InBcastOctets: 1059
    OutBcastOctets: 1059
    InNoECTPkts: 830
    
    
parallels@parallels-Parallels-Virtual-Platform:~$ netstat -l
Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State      
tcp        0      0 localhost:domain        0.0.0.0:*               LISTEN     
tcp        0      0 localhost:ipp           0.0.0.0:*               LISTEN     
tcp6       0      0 ip6-localhost:ipp       [::]:*                  LISTEN     
udp        0      0 0.0.0.0:34725           0.0.0.0:*                          
udp        0      0 localhost:domain        0.0.0.0:*                          
udp        0      0 0.0.0.0:631             0.0.0.0:*                          
udp        0      0 0.0.0.0:mdns            0.0.0.0:*                          
udp6       0      0 [::]:54263              [::]:*                             
udp6       0      0 [::]:mdns               [::]:*                             
raw6       0      0 [::]:ipv6-icmp          [::]:*                  7          
Active UNIX domain sockets (only servers)
Proto RefCnt Flags       Type       State         I-Node   Path
unix  2      [ ACC ]     STREAM     LISTENING     40982    @/tmp/.ICE-unix/2258
unix  2      [ ACC ]     STREAM     LISTENING     37764    /tmp/.X11-unix/X0
unix  2      [ ACC ]     SEQPACKET  LISTENING     17436    /run/udev/control
unix  2      [ ACC ]     STREAM     LISTENING     40312    @/tmp/dbus-2137JWwNxO
unix  2      [ ACC ]     STREAM     LISTENING     37405    /run/user/1000/systemd/private
unix  2      [ ACC ]     STREAM     LISTENING     37410    /run/user/1000/bus
unix  2      [ ACC ]     STREAM     LISTENING     37411    /run/user/1000/gnupg/S.dirmngr
unix  2      [ ACC ]     STREAM     LISTENING     37412    /run/user/1000/gnupg/S.gpg-agent.browser
unix  2      [ ACC ]     STREAM     LISTENING     37414    /run/user/1000/gnupg/S.gpg-agent.extra
unix  2      [ ACC ]     STREAM     LISTENING     37417    /run/user/1000/gnupg/S.gpg-agent.ssh
unix  2      [ ACC ]     STREAM     LISTENING     37418    /run/user/1000/gnupg/S.gpg-agent
unix  2      [ ACC ]     STREAM     LISTENING     37419    /run/user/1000/pk-debconf-socket
unix  2      [ ACC ]     STREAM     LISTENING     37420    /run/user/1000/pulse/native
unix  2      [ ACC ]     STREAM     LISTENING     37421    /run/user/1000/snapd-session-agent.socket
unix  2      [ ACC ]     STREAM     LISTENING     38336    @/tmp/dbus-KNmuvSF3
unix  2      [ ACC ]     STREAM     LISTENING     37763    @/tmp/.X11-unix/X0
unix  2      [ ACC ]     STREAM     LISTENING     37499    /run/user/1000/keyring/control
unix  2      [ ACC ]     STREAM     LISTENING     17409    /run/systemd/private
unix  2      [ ACC ]     STREAM     LISTENING     17411    /run/systemd/userdb/io.systemd.DynamicUser
unix  2      [ ACC ]     STREAM     LISTENING     40983    /tmp/.ICE-unix/2258
unix  2      [ ACC ]     STREAM     LISTENING     40670    /run/user/1000/keyring/pkcs11
unix  2      [ ACC ]     STREAM     LISTENING     17422    /run/systemd/fsck.progress
unix  2      [ ACC ]     STREAM     LISTENING     41158    /run/user/1000/keyring/ssh
unix  2      [ ACC ]     STREAM     LISTENING     17432    /run/systemd/journal/stdout
unix  2      [ ACC ]     STREAM     LISTENING     27294    @/tmp/dbus-WiVk8ram
unix  2      [ ACC ]     STREAM     LISTENING     17736    /run/systemd/journal/io.systemd.journal
unix  2      [ ACC ]     STREAM     LISTENING     60034    @/dbus-vfs-daemon/socket-EGz2dAav
unix  2      [ ACC ]     STREAM     LISTENING     38337    @/tmp/dbus-yLYVgUSd
unix  2      [ ACC ]     STREAM     LISTENING     39169    /tmp/ssh-KbaAYvIXQiZa/agent.2103
unix  2      [ ACC ]     STREAM     LISTENING     44273    @parallels-sga-socket@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
unix  2      [ ACC ]     STREAM     LISTENING     22541    /run/acpid.socket
unix  2      [ ACC ]     STREAM     LISTENING     22543    /run/avahi-daemon/socket
unix  2      [ ACC ]     STREAM     LISTENING     22545    /run/cups/cups.sock
unix  2      [ ACC ]     STREAM     LISTENING     22547    /run/dbus/system_bus_socket
unix  2      [ ACC ]     STREAM     LISTENING     22549    /run/snapd.socket
unix  2      [ ACC ]     STREAM     LISTENING     22551    /run/snapd-snap.socket
unix  2      [ ACC ]     STREAM     LISTENING     22554    /run/uuidd/request
unix  2      [ ACC ]     STREAM     LISTENING     22406    /run/irqbalance//irqbalance652.sock
unix  2      [ ACC ]     STREAM     LISTENING     27293    @/tmp/dbus-Cpdg820d
unix  2      [ ACC ]     STREAM     LISTENING     40135    @/home/parallels/.cache/ibus/dbus-SaqnFuHN
```

## windows下异常端口/连接检查

### netstat

官方 https://docs.microsoft.com/zh-cn/windows-server/administration/windows-commands/netstat

```
显示协议统计信息和当前 TCP/IP 网络连接。

NETSTAT [-a] [-b] [-e] [-f] [-n] [-o] [-p proto] [-r] [-s] [-x] [-t] [interval]

  -a            显示所有连接和侦听端口。
  -b            显示在创建每个连接或侦听端口时涉及的
                可执行程序。在某些情况下，已知可执行程序承载
                多个独立的组件，这些情况下，
                显示创建连接或侦听端口时
                涉及的组件序列。在此情况下，可执行程序的
                名称位于底部 [] 中，它调用的组件位于顶部，
                直至达到 TCP/IP。注意，此选项
                可能很耗时，并且在你没有足够
                权限时可能失败。
  -e            显示以太网统计信息。此选项可以与 -s 选项
                结合使用。
  -f            显示外部地址的完全限定
                域名(FQDN)。
  -n            以数字形式显示地址和端口号。
  -o            显示拥有的与每个连接关联的进程 ID。
  -p proto      显示 proto 指定的协议的连接；proto
                可以是下列任何一个: TCP、UDP、TCPv6 或 UDPv6。如果与 -s
                选项一起用来显示每个协议的统计信息，proto 可以是下列任何一个:
                IP、IPv6、ICMP、ICMPv6、TCP、TCPv6、UDP 或 UDPv6。
  -q            显示所有连接、侦听端口和绑定的
                非侦听 TCP 端口。绑定的非侦听端口
                 不一定与活动连接相关联。
  -r            显示路由表。
  -s            显示每个协议的统计信息。默认情况下，
                显示 IP、IPv6、ICMP、ICMPv6、TCP、TCPv6、UDP 和 UDPv6 的统计信息;
                -p 选项可用于指定默认的子网。
  -t            显示当前连接卸载状态。
  -x            显示 NetworkDirect 连接、侦听器和共享
                终结点。
  -y            显示所有连接的 TCP 连接模板。
                无法与其他选项结合使用。
  interval      重新显示选定的统计信息，各个显示间暂停的
                间隔秒数。按 CTRL+C 停止重新显示
                统计信息。如果省略，则 netstat 将打印当前的
                配置信息一次。
```

- Netstat 命令提供以下各项的统计信息：

| 参数     | 说明                                                         |
| -------- | ------------------------------------------------------------ |
| Proto    | 协议 (TCP 或 UDP) 的名称。                                   |
| 本地地址 | 本地计算机的 IP 地址和所使用的端口号。 除非指定了 **-n** 参数，否则显示与 IP 地址和端口名称对应的本地计算机的名称。 如果尚未建立端口，则端口号显示为星号 ( * ) 。 |
| 外部地址 | 套接字连接到的远程计算机的 IP 地址和端口号。 除非指定了 **-n** 参数，否则将显示与 IP 地址和端口对应的名称。 如果尚未建立端口，则端口号显示为星号 ( * ) 。 |
| 状态     | 指示 TCP 连接的状态，包括：CLOSE_WAITCLOSED端建立FIN_WAIT_1FIN_WAIT_2LAST_ACK侦听SYN_RECEIVEDSYN_SENDTIMED_WAIT |



#### 常用查询语句

若要显示以太网统计信息和所有协议的统计信息，请键入：

```
netstat -e -s
```

若要仅显示 TCP 和 UDP 协议的统计信息，请键入：

```
netstat -s -p tcp udp
```

若要每隔5秒显示一次活动 TCP 连接和进程 Id，请键入：

```
netstat -o 5
```

若要使用数字形式显示活动 TCP 连接和进程 Id，请键入：

```
netstat -n -o
```

定位established链接:获取正在链接的IP地址和进程信息

```
netstat -ano | findstr “ESTABLISHED”
netstat -ano | findstr “LISTENING”
```
