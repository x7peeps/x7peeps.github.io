---
title: 系统日志查询
tag: 关键证据检索提取;
date: 2021-07-30T22:00:00+08:00
---
# linux下系统日志查询

这里仅做取证方式介绍

## /var/log/*

### 基本命令

日志默认存放位置：/var/log/

查看日志配置情况：more /etc/rsyslog.conf

| 日志文件                      | 说明                                                         |
| ----------------------------- | ------------------------------------------------------------ |
| /var/log/cron                 | 记录了系统定时任务相关的日志                                 |
| /var/log/cups                 | 记录打印信息的日志                                           |
| /var/log/dmesg                | 记录了系统在开机时内核自检的信息，也可以使用dmesg命令直接查看内核自检信息 |
| /var/log/mailog               | 记录邮件信息                                                 |
| /var/log/message              | 记录系统重要信息的日志。这个日志文件中会记录Linux系统的绝大多数重要信息，如果系统出现问题时，首先要检查的就应该是这个日志文件 |
| /var/log/btmp                 | 记录错误登录日志，这个文件是二进制文件，不能直接vi查看，而要使用lastb命令查看 |
| /var/log/lastlog              | 记录系统中所有用户最后一次登录时间的日志，这个文件是二进制文件，不能直接vi，而要使用lastlog命令查看 |
| /var/log/wtmp                 | 永久记录所有用户的登录、注销信息，同时记录系统的启动、重启、关机事件。同样这个文件也是一个二进制文件，不能直接vi，而需要使用last命令来查看 |
| /var/log/utmp                 | 记录当前已经登录的用户信息，这个文件会随着用户的登录和注销不断变化，只记录当前登录用户的信息。同样这个文件不能直接vi，而要使用w,who,users等命令来查询 |
| /var/log/secure               | 记录验证和授权方面的信息，只要涉及账号和密码的程序都会记录，比如SSH登录，su切换用户，sudo授权，甚至添加用户和修改用户密码都会记录在这个日志文件中 |
| /var/log/httpd/access.log；   | apache日志                                                   |
| /var/log/apache/access.log；  | apache日志                                                   |
| /var/log/apache2/access.log； | apache日志                                                   |
| /var/log/httpdaccess.log      | apache日志                                                   |
| /usr/local/nginx/logs         | nginx日志                                                    |
| /var/log/messages             | ftp日志/etc/vsftp/vsftp.conf                                 |



### 常用命令

```
1、定位有多少IP在爆破主机的root帐号：    
grep "Failed password for root" /var/log/secure | awk '{print $11}' | sort | uniq -c | sort -nr | more

定位有哪些IP在爆破：
grep "Failed password" /var/log/secure|grep -E -o "(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)"|uniq -c

爆破用户名字典是什么？
 grep "Failed password" /var/log/secure|perl -e 'while($_=<>){ /for(.*?) from/; print "$1\n";}'|uniq -c|sort -nr
 
2、登录成功的IP有哪些：   
grep "Accepted " /var/log/secure | awk '{print $11}' | sort | uniq -c | sort -nr | more

登录成功的日期、用户名、IP：
grep "Accepted " /var/log/secure | awk '{print $1,$2,$3,$9,$11}' 

3、增加一个用户kali日志：
Jul 10 00:12:15 localhost useradd[2382]: new group: name=kali, GID=1001
Jul 10 00:12:15 localhost useradd[2382]: new user: name=kali, UID=1001, GID=1001, home=/home/kali
, shell=/bin/bash
Jul 10 00:12:58 localhost passwd: pam_unix(passwd:chauthtok): password changed for kali
#grep "useradd" /var/log/secure 

4、删除用户kali日志：
Jul 10 00:14:17 localhost userdel[2393]: delete user 'kali'
Jul 10 00:14:17 localhost userdel[2393]: removed group 'kali' owned by 'kali'
Jul 10 00:14:17 localhost userdel[2393]: removed shadow group 'kali' owned by 'kali'
# grep "userdel" /var/log/secure

5、su切换用户：
Jul 10 00:38:13 localhost su: pam_unix(su-l:session): session opened for user good by root(uid=0)

sudo授权执行:
sudo -l
Jul 10 00:43:09 localhost sudo:    good : TTY=pts/4 ; PWD=/home/good ; USER=root ; COMMAND=/sbin/shutdown -r now
```





# windows下系统日志查询

首先众所周知常见的查询日志的方法：电脑-右键管理-Windows日志，这里不再赘述，这种方法查询和导出都非常缓慢，应急场景不推荐。至少你可以通过复制%SystemRoot%\Logs；%SystemRoot%\System32\winevt。两个整文件基本完成系统日志取证工作，这里我们尝试采用其他方式目的为了提高现场的效率。



%SystemRoot%\Logs # 系统日志

%SystemRoot%\System32\winevt # 系统日志

%SystemDrive%\inetpub\logs\LogFiles；#  IIS日志

%SystemRoot%\System32\LogFiles\W3SVC1； #  IIS日志

%SystemRoot%\System32\LogFiles\HTTPERR； #  IIS日志

%SystemDrive%\inetpub\logs\LogFiles\W3SVC1； #  IIS日志











## Wevtutil（cmd）

### 基本命令

cmd 输入：```Wevtutil /?```

```
用于检索有关事件日志和发布者的信息，
安装和卸载事件清单，运行查询以及导出、存档和清除日志。

用法:

你可以使用短(如 ep /uni)或长(如
enum-publishers /unicode)形式的命令和选项名称。
命令、选项和选项值不区分大小写。

变量均使用大写形式。

wevtutil COMMAND [ARGUMENT [ARGUMENT] ...] [/OPTION:VALUE [/OPTION:VALUE] ...]

命令:

el | enum-logs          列出日志名称。
gl | get-log            获取日志配置信息。
sl | set-log            修改日志配置。
ep | enum-publishers    列出事件发布者。
gp | get-publisher      获取发布者配置信息。
im | install-manifest   从清单中安装事件发布者和日志。
um | uninstall-manifest 从清单中卸载事件发布者和日志。
qe | query-events       从日志或日志文件中查询事件。
gli | get-log-info      获取日志状态信息。
epl | export-log        导出日志。
al | archive-log        存档导出的日志。
cl | clear-log          清除日志。

常用选项:

/{r | remote}:VALUE
如果指定，则在远程计算机上运行该命令。VALUE 是远程计算机名称。
/im 和 /um 选项不支持远程操作。

/{u | username}:VALUE
指定一个不同的用户以登录到远程计算机。
VALUE 是 domain\user 或 user 形式的用户名。只有在指定 /r 选项时才适用。

/{p | password}:VALUE
指定的用户密码。如果未指定，
或者 VALUE 为 "*"，则会提示用户输入密码。
只有在指定 /u 选项时才适用。

/{a | authentication}:[Default|Negotiate|Kerberos|NTLM]
用于连接到远程计算机的身份验证类型。默认值为 Negotiate。

/{uni | unicode}:[true|false]
使用 Unicode 显示输出。如果为 true，则使用 Unicode 显示输出。

要了解特定命令的详细信息，请键入以下命令:

wevtutil COMMAND /?
```



语法：

```
wevtutil [{el | enum-logs}] [{gl | get-log} <Logname> [/f:<Format>]]
[{sl | set-log} <Logname> [/e:<Enabled>] [/i:<Isolation>] [/lfn:<Logpath>] [/rt:<Retention>] [/ab:<Auto>] [/ms:<MaxSize>] [/l:<Level>] [/k:<Keywords>] [/ca:<Channel>] [/c:<Config>]]
[{ep | enum-publishers}]
[{gp | get-publisher} <Publishername> [/ge:<Metadata>] [/gm:<Message>] [/f:<Format>]] [{im | install-manifest} <Manifest>]
[{um | uninstall-manifest} <Manifest>] [{qe | query-events} <Path> [/lf:<Logfile>] [/sq:<Structquery>] [/q:<Query>] [/bm:<Bookmark>] [/sbm:<Savebm>] [/rd:<Direction>] [/f:<Format>] [/l:<Locale>] [/c:<Count>] [/e:<Element>]]
[{gli | get-loginfo} <Logname> [/lf:<Logfile>]]
[{epl | export-log} <Path> <Exportfile> [/lf:<Logfile>] [/sq:<Structquery>] [/q:<Query>] [/ow:<Overwrite>]]
[{al | archive-log} <Logpath> [/l:<Locale>]]
[{cl | clear-log} <Logname> [/bu:<Backup>]] [/r:<Remote>] [/u:<Username>] [/p:<Password>] [/a:<Auth>] [/uni:<Unicode>]
```

参数：

| 参数                                                         | 说明                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| {el \| 枚举日志}                                             | 显示所有日志的名称。                                         |
| {gl \| 获取日志} <Logname> [/f： <Format> ]                  | 显示指定日志的配置信息，其中包括日志是否已启用、日志的当前最大大小限制以及日志所存储到文件的路径。 |
| {sl \| set 日志} <Logname> [/e： <Enabled> ][/i： <Isolation> ][/lfn： <Logpath> ][/rt： <Retention> ][/ab： <Auto> ][/ms： <MaxSize> ][/l： <Level> ][/k： <Keywords> ][/ca： <Channel> ][/c： <Config> ] | 修改指定日志的配置。                                         |
| {ep \| enum-发布服务器}                                      | 显示本地计算机上的事件发布者。                               |
| {gp \| get-publisher} <Publishername> [/ge： <Metadata> ][/gm： <Message> ][/f： <Format> ]] | 显示指定事件发布者的配置信息。                               |
| {im \| 安装清单} <Manifest>                                  | 从清单安装事件发布者和日志。 有关事件清单和使用此参数的详细信息，请参阅 Microsoft 开发人员网络上的 Windows 事件日志 SDK (MSDN) 网站 ([https://msdn.microsoft.com](https://docs.microsoft.com/zh-cn/windows-server/)) 。 |
| {um \| 卸载-清单} <Manifest>                                 | 从清单中卸载所有发布服务器和日志。 有关事件清单和使用此参数的详细信息，请参阅 Microsoft 开发人员网络上的 Windows 事件日志 SDK (MSDN) 网站 ([https://msdn.microsoft.com](https://docs.microsoft.com/zh-cn/windows-server/)) 。 |
| {qe \| } <Path> 个查询[/lf： <Logfile> ][/sq： <Structquery> ][/q： <Query> ][/bm： <Bookmark> ][/sbm： <Savebm> ][/rd： <Direction> ][/f： <Format> ][/l： <Locale> ][/c： <Count> ][/e： <Element> ] | 从事件日志、日志文件或使用结构化查询读取事件。 默认情况下，提供的日志名称 <Path> 。 但是，如果使用 **/lf** 选项，则 <Path> 必须是日志文件的路径。 如果使用 **/sq** 参数，则 <Path> 必须是包含结构化查询的文件的路径。 |
| {gli \| loginfo} <Logname> [/lf： <Logfile> ]                | 显示有关事件日志或日志文件的状态信息。 如果使用 **/lf** 选项， <Logname> 则是日志文件的路径。 可以运行 **wevtutil el** 获取日志名称列表。 |
| {epl \| 导出日志} <Path> <Exportfile> [/lf： <Logfile> ][/sq： <Structquery> ][/q： <Query> ][/ow： <Overwrite> ] | 从事件日志、日志文件或使用结构化查询从事件日志中导出事件到指定的文件。 默认情况下，提供的日志名称 <Path> 。 但是，如果使用 **/lf** 选项，则 <Path> 必须是日志文件的路径。 如果使用 **/sq** 选项，则 <Path> 必须是包含结构化查询的文件的路径。 <Exportfile> 是文件的路径，导出的事件将存储在该文件中。 |
| {al \| 存档-log} <Logpath> [/l： <Locale> ]                  | 以自包含格式存档指定的日志文件。 将创建一个子目录，其中包含区域设置的名称，并将所有特定于区域设置的信息保存在该子目录中。 通过运行 **wevtutil al** 创建目录和日志文件之后，无论是否安装了发布服务器，都可以读取文件中的事件。 |
| {cl \| clear log} <Logname> [/bu： <Backup> ]                | 从指定的事件日志中清除事件。 可以使用 **/bu** 选项来备份已清除的事件。 |



选项：

## 选项

| 选项               | 说明                                                         |
| :----------------- | :----------------------------------------------------------- |
| /f：<Format>       | 指定输出应为 XML 或文本格式。 如果 <Format> 为 XML，则输出以 XML 格式显示。 如果 <Format> 为 Text，则输出在没有 XML 标记的情况下显示。 默认值为 Text。 |
| /e:<Enabled>       | 启用或禁用日志。 <Enabled> 可以是 true 或 false。            |
| /i：<Isolation>    | 设置日志隔离模式。 <Isolation> 可以是系统、应用程序或自定义。 日志的隔离模式确定日志是否与同一隔离类中的其他日志共享会话。 如果指定系统隔离，目标日志将至少与系统日志共享写入权限。 如果指定应用程序隔离，目标日志将至少与应用程序日志共享写入权限。 如果指定自定义隔离，还必须使用 **/ca** 选项提供安全描述符。 |
| /lfn：<Logpath>    | 定义日志文件名。 <Logpath> 是事件日志服务存储此日志的事件的文件的完整路径。 |
| /rt：<Retention>   | 设置日志保留模式。 <Retention> 可以是 true 或 false。 日志保留模式确定日志达到其最大大小时事件日志服务的行为。 如果事件日志达到其最大大小，并且日志保留模式为 true，则保留现有事件并丢弃传入事件。 如果日志保留模式为 false，则传入事件将覆盖日志中最早的事件。 |
| /ab：<Auto>        | 指定日志自动备份策略。 <Auto> 可以是 true 或 false。 如果此值为 true，则日志在达到最大大小时将自动备份。 如果此值为 true，则 (**/rt** 选项指定的保留期) 也必须设置为 true。 |
| /ms：<MaxSize>     | 设置日志的最大大小（以字节为单位）。 最小日志大小1048576字节 (1024KB) 日志文件始终为 64KB 的倍数，因此输入的值将相应地舍入。 |
| /l:<Level>         | 定义日志的级别筛选器。 <Level> 可以是任何有效的级别值。 此选项仅适用于具有专用会话的日志。 可以通过将 设置为 0 来删除级别 筛选器。 |
| /k：<Keywords>     | 指定日志的关键字筛选器。 <Keywords> 可以是任何有效的 64 位关键字掩码。 此选项仅适用于具有专用会话的日志。 |
| /ca：<Channel>     | 设置事件日志的访问权限。 <Channel> 是一个安全描述符，它使用安全描述符定义语言 (SDDL) 。 有关 SDDL 格式的信息，请参阅 Microsoft 开发人员网络 (MSDN) 网站 [https://msdn.microsoft.com](https://docs.microsoft.com/zh-cn/windows-server/) () 。 |
| /c：<Config>       | 指定配置文件的路径。 此选项将导致从 中定义的配置文件读取日志属性 <Config> 。 如果使用此选项，则不得指定 参数。 日志名称会从配置文件中读取。 |
| /ge：<Metadata>    | 获取此发布服务器可以引发的事件的元数据信息。 <Metadata> 可以是 true 或 false。 |
| /gm：<Message>     | 显示实际消息，而不是数字消息 ID。 <Message> 可以是 true 或 false。 |
| /lf：<Logfile>     | 指定应从日志或日志文件中读取事件。 <Logfile> 可以是 true 或 false。 如果为 true，则命令的参数是日志文件的路径。 |
| /sq：<Structquery> | 指定应该使用结构化查询获取事件。 <Structquery> 可以是 true 或 false。 如果为 true，则 是包含结构化查询的文件的路径。 |
| /q：<Query>        | 定义 XPath 查询以筛选读取或导出的事件。 如果未指定此选项，将返回或导出所有事件。 当 /sq 为 true 时 **，此选项** 不可用。 |
| /bm：<Bookmark>    | 指定包含上一查询中的书签的文件的路径。                       |
| /sbm：<Savebm>     | 指定用于保存此查询书签的文件的路径。 文件扩展名应.xml。      |
| /rd：<Direction>   | 指定事件的读取方向。 <Direction> 可以是 true 或 false。 如果为 true，则首先返回最近的事件。 |
| /l:<Locale>        | 定义用于打印特定区域设置中的事件文本区域设置字符串。 仅在使用 **/f** 选项以文本格式打印事件时可用。 |
| /c：<Count>        | 设置要读取的最大事件数。                                     |
| /e:<Element>       | 在 XML 中显示事件时包含根元素。 <Element> 是根元素中需要字符串。 例如 **，/e：root** 将导致 XML 包含根元素对 <root> 。 |
| /ow：<Overwrite>   | 指定应覆盖导出文件。 <Overwrite> 可以是 true 或 false。 如果为 true，并且 中指定的导出文件 已存在，将覆盖该文件而不进行确认。 |
| /bu：<Backup>      | 指定存储已清除事件的文件的路径。 在备份文件的名称中包括 .evtx 扩展名。 |
| /r：<Remote>       | 在远程计算机上运行 命令。 <Remote> 是远程计算机的名称。 **im 和** **um** 参数不支持远程操作。 |
| /u：<Username>     | 指定要登录到远程计算机的不同用户。 <Username> 是域\用户或用户形式的用户名。 此选项仅在指定了 **/r** 选项时适用。 |
| /p：<Password>     | 指定用户的密码。 如果使用 **/u** 选项，并且未指定此选项或 为 ，则系统会提示用户输入 <Password> *密码。此选项仅在指定 \* * /u* * 选项时适用。 |
| /a：<Auth>         | 定义用于连接到远程计算机的身份验证类型。 <Auth> 可以是 Default、Negotiate、Kerberos 或 NTLM。 默认值为 Negotiate。 |
| /uni：<Unicode>    | 以 Unicode 显示输出。 <Unicode> 可以是 true 或 false。 如果 为 true，则输出为 Unicode。 |

官方示例：

列出所有日志的名称：

```
wevtutil el
```

以 XML 格式显示有关本地计算机上的系统日志的配置信息：

```
wevtutil gl System /f:xml
```

使用配置文件设置事件日志属性 (参阅) 的配置文件示例的备注：

```
wevtutil sl /c:config.xml
```

显示有关 Microsoft Windows-Eventlog 事件发布者的信息，包括有关发布者可以引发的事件的元数据：

```
wevtutil gp Microsoft-Windows-Eventlog /ge:true
```

从 myManifest.xml 清单文件中安装发布服务器和日志：

```
wevtutil im myManifest.xml
```

从 myManifest.xml 清单文件卸载发布服务器和日志：

```
wevtutil um myManifest.xml
```

以文本格式显示应用程序日志中三个最近的事件：

```
wevtutil qe Application /c:3 /rd:true /f:text
```

显示应用程序日志的状态：

```
wevtutil gli Application
```

将事件从系统日志导出到 C:\backup\system0506.evtx：

```
wevtutil epl System C:\backup\system0506.evtx
```

将所有事件保存到 C:\admin\backups\a10306.evtx 后，请清除应用程序日志中的所有事件：

```
wevtutil cl Application /bu:C:\admin\backups\a10306.evtx
```



参考：https://docs.microsoft.com/zh-cn/windows-server/administration/windows-commands/wevtutil



### 常用命令

```
wevtutil el  # 列出已注册的事件日志
wevtutil epl System C:\System_log.evtx  # 将System日志导出到文件C:\System_log.evtx
wevtutil epl Microsoft-Windows-RemoteDesktopServices-RdpCoreTS/Operational C:\rdp_log.evtx # 导出远程桌面日志到C:\rdp_log.evtx
wevtutil qe Application /q:"Event/System/EventID=1704" /c:100 /f:text  # 在应用日志中的最后100个条目中搜索ID为1704的事件 
```





## Get-winEvent（ps）

Get-WinEvent 用于替代运行 Windows Vista 及更高版本的 Windows 的计算机上的 [Get-EventLog](https://docs.microsoft.com/zh-cn/previous-versions/dd315250(v=technet.10)) cmdlet。Get-EventLog 只获取传统事件日志中的事件。Windows PowerShell 2.0 为 Windows Vista 以前的系统保留了 Get-EventLog。

### 基本命令

```
Get-WinEvent [-LogName] <string[]> [-ComputerName <string>] [-Credential <PSCredential>] [-FilterXPath <string>] [-Force <switch>] [-MaxEvents <int64>] [-Oldest] [<CommonParameters>]
Get-WinEvent [-Path] <string[]> [-ComputerName <string>] [-Credential <PSCredential>] [-FilterXPath <string>] [-Force <switch>] [-MaxEvents <int64>] [-Oldest] [<CommonParameters>]
Get-WinEvent [-ProviderName] <string[]> [-ComputerName <string>] [-Credential <PSCredential>] [-FilterXPath <string>] [-Force <switch>] [-MaxEvents <int64>] [-Oldest] [<CommonParameters>]
Get-WinEvent -FilterHashTable <Hashtable[]> [-ComputerName <string>] [-Credential <PSCredential>] [-Force <switch>] [-MaxEvents <int64>] [-Oldest] [<CommonParameters>]
Get-WinEvent [-ListLog] <string[]> [-ComputerName <string>] [-Credential <PSCredential>] [<CommonParameters>]
Get-WinEvent [-ListProvider] <string[]> [-ComputerName <string>] [-Credential <PSCredential>] [<CommonParameters>]
Get-WinEvent -FilterXml <XmlDocument> [-ComputerName <string>] [-Credential <PSCredential>] [-Force <switch>] [-MaxEvents <int64>] [-Oldest] [<CommonParameters>]
```



Get-WinEvent cmdlet 从包括传统日志（例如系统日志和应用程序日志）在内的事件日志和 Windows Vista 中引入的新 Windows 事件日志技术生成的事件日志中获取事件。它还获取 Windows 事件跟踪 (ETW) 生成的日志文件中的事件。

如果没有参数，则 Get-WinEvent 命令获取计算机上的所有事件日志中的所有事件。若要中断此命令，请按 Ctrl+C。

Get-WinEvent 还列出事件日志和事件日志提供程序。可以从选定日志中或者从选定事件提供程序生成的日志中获取事件。并且可以将来自多个源的事件组合在一个命令中。Get-WinEvent 允许使用 XPath 查询、结构化 XML 查询和简化的哈希表查询来筛选事件。





示例：

```
# 获取 Server01、Server02 和 Server03 计算机上的 Windows PowerShell 事件日志的对象。因为 ComputerName 参数只接受一个值，所以第二个命令使用 Foreach 关键字。
$s = "Server01", "Server02", "Server03"
foreach ($server in $s) 
     {$server; get-winevent -listlog "Windows PowerShell" -computername $server}

# 显示计算机用用程序日志中所有程序
(get-winevent -listlog Application).providernames 

# 名称包含单词“policy”的事件日志提供程序
get-winevent -listprovider *policy*

# Microsoft-Windows-GroupPolicy 事件提供程序生成的事件 ID 以及事件说明
(get-winevent -listprovider microsoft-windows-grouppolicy).events | format-table id, description -auto

# 统计日志中每个事件
$events = get-winevent -logname "Windows PowerShell"
$events.count  # 统计事件数
$events | group-object id -noelement | sort-object count -desc # 倒序排列告警编号和统计数目
$events | group-object leveldisplayname -noelement # 统计种类

# 获取计算机上的所有事件日志中以及 Microsoft-Windows-Kernel-WHEA 事件日志中名称包括“disk”的错误事件。
get-winevent -logname *disk*, Microsoft-Windows-Kernel-WHEA

# 从测试目录中获取事件日志
get-winevent -path 'c:\ps-test\Windows PowerShell.evtx'


# 获取日志中 100 个最旧的事件
get-winevent -path 'c:\tracing\tracelog.etl' -maxevents 100 -oldest
get-winevent -path 'c:\tracing\tracelog.etl' -oldest | sort-object -property timecreated -desc | select-object -first 100
get-winevent -logname "Windows PowerShell" -maxevents 100 -oldest

# 获取两个日志中100条最老的安全事件
get-winevent -logname "Windows PowerShell","System" -maxevents 100 -oldest

# 获取24小时前的日志
C:\PS># Use the Where-Object cmdlet
C:\PS> $yesterday = (get-date) - (new-timespan -day 1)
C:\PS> get-winevent -logname "Windows PowerShell" | where {$_.timecreated -ge $yesterday}
# Uses FilterHashTable
C:\PS> $yesterday = (get-date) - (new-timespan -day 1)
C:\PS> get-winevent -FilterHashTable @{LogName='Windows PowerShell'; Level=3; StartTime=$yesterday}
# Use FilterXML
C:\PS> get-winevent -FilterXML "<QueryList><Query><Select Path='Windows PowerShell'>*[System[Level=3 and TimeCreated[timediff(@SystemTime) <= 86400000]]]</Select></Query></QueryList>"
# Use FilterXPath
C:\PS> get-winevent -LogName "Windows Powershell" -FilterXPath "*[System[Level=3 and TimeCreated[timediff(@SystemTime) <= 86400000]]]"

# 获取两天前日期的日志
C:\PS>$date = (get-date).AddDays(-2)
C:\PS> $events = get-winevent -FilterHashTable @{ logname = "Microsoft-Windows-Diagnostics-Performance/Operational"; StartTime = $date; ID = 100 }

# 使用筛选器哈希表来查找上周发生的 Internet Explorer 应用程序错误
C:\PS>$starttime = (get-date).adddays(-7)        
C:\PS> $ie-error = Get-WinEvent -FilterHashtable @{logname="application"; providername="Application Error"; data="iexplore.exe"; starttime=$starttime}
```



### 常用命令

```
get-winevent -listlog  *  
# 此命令获取本地计算机上的所有日志。
# 日志按 Get-WinEvent 获取它们的顺序列出。通常首先检索传统日志，然后检索新的 Windows 事件日志。
# 因为通常有一百多个事件日志，所以此参数需要日志名称或名称模式。若要获取所有日志，请使用 *。

get-winevent -listlog Setup | format-list -property *
# 这些命令获取表示本地计算机上的传统系统日志的对象。该对象包括有关日志的有用信息，其中包括日志大小、事件日志提供程序、文件路径以及是否已启用日志。

get-winevent -listlog * -computername Server01| where {$_.recordcount}
# 此命令只获取 Server01 计算机上含有事件的事件日志。许多日志可能是空的。
# 此命令使用 Get-WinEvent 在您使用 ListLog 参数时返回的 EventLogConfiguration 对象的 RecordCount 属性。
```



参考：

https://docs.microsoft.com/en-us/previous-versions/dd367894(v=technet.10)?redirectedfrom=MSDN

https://blog.csdn.net/weixin_44591106/article/details/98592519


