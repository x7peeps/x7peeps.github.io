---
title: 命令行历史记录
tag: 关键证据检索提取;
date: 2024-09-25T00:00:00+08:00
---
# linux下命令行历史记录

**原理的解释**

这里参考[白*胖*子](https://www.cnblogs.com/bpzblog/p/13121930.html)关于linux命令行history的解释，其中概述对history的原理解释的比较通俗易懂，这里引用过来：



- 当执行命令后，系统默认会在内存记录执行过的命令
- 当用户正常退出时，会将内存的命令历史存放对应历史文件中，默认是~/.bash_history
- 登录shell时，会读取命令历史文件中记录下的命令加载到内存中
- 登录进shell后新执行的命令只会记录在内存的缓存区中；这些命令会用户正常退出时“追加”至命令历史文件中
- 利用命令历史。可以用它来重复执行命令，提高输入效率



**bash history内建函数**

bash提供两个内置命令操纵历史记录列表和历史记录文件。

## fc命令



```
fc [-e ename] [-lnr] [first] [last]
fc -s [pat=rep] [command]
```



| -e<文本编辑器> | 指定用来编辑命令的文本编辑器，默认是vi                       |
| -------------- | ------------------------------------------------------------ |
| -l             | 列出第一条和最后一条命令范围内的历史命令，如果不跟命令范围则默认显示最近使用过的16条历史命令 |
| -n             | 显示历史命令时不显示命令序号                                 |
| -r             | 反序显示所有历史命令                                         |
| -s<命令名>     | 从历史命令中当前位置往前找到指定命令，并执行                 |



```
显示历史命令列表（默认打印最近的16条历史命令）：
fc -l

显示历史命令列表 1-99行：
fc -l 1 99

指定使用ex文本编辑器编辑命令：
fc -e ex

显示历史命令列表但不显示命令序号：
fc -n

反序显示所有历史命令：
fc -r

从历史命令中找到find命令，并执行：
fc -s find
```





> EXTENDED_HISTORY环境变量影响fc命令的执行，如果变量设置为ON，则记录时间，否则不记录时间。在/etc/profile中添加export EXTENDED_HISTORY=ON 即可开启命令时间记录。
>
> kali：因为shell是zsh，因此配置在/etc/zsh/zshrc  





## history命令

```
history [-c] [-d offset] [n] 
history -awrn [filename] 
history -ps arg [arg...]
history [n]  n为数字，列出最近的n条命令
-c  将目前shell中的所有history命令消除
history [-raw] histfiles
-a 将目前新增的命令写入histfiles, 默认写入~/.bash_history
-r  将histfiles内容读入到目前shell的history记忆中
-w 将目前history记忆的内容写入到histfiles
-s: 展开历史参数成一行，附加在历史列表后。用于伪造命令历史



使用! 执行历史命令。
! number 执行第几条命令
! command 从最近的命令查到以command开头的命令执行
!! 执行上一条
```





> **history的历史命令保存在~/.bash_history 文件中.**

####  

**history配置修改**

配置文件：/etc/profile 与history相关的环境变量

- history相关配置说明

```
HISTFILE          指定存放历史文件位置，默认位置在~/.bash_profile（针对用户）、 
      /etc/profile(针对全局，如果~/.bash_profile内没有相关环境变量内容则使用全局变量设置) 
HISTFILESIZE      命令历史文件记录历史的条数 
HISTSIZE          命令历史记录的条数，默认为1000 
HISTTIMEFORMAT="%F %T"  显示命令发生的时间 
HISTIGNORE="str1:str2:..." 忽略string1,string2历史 
HISTCONTROL      包含一下4项，让哪一项生效只需要让其=下面一项即可 
ignoredups:  忽略重复的命令；连续且相同方为“重复” 
ignorespace:  忽略所有以空白开头的命令 
ignoreboth:ignoredups,ignorespace 
erasedups:    删除重复命令
```





- history记录命令时间戳

```
在.bashrc 或者/etc/profile文件中添加几行配置即可
          HISTFILESIZE=2000
          HISTSIZE=2000
         HISTTIMEFORMAT="%F %T "
        export HISTTIMEFORMAT

设置好之后，执行history命令，就会显示每条历史命令的详细执行时
```







本节参考：https://blog.csdn.net/u011498933/article/details/99541059

https://linux265.com/course/linux-command-fc.html





# windows下命令行历史记录

## doskey命令

该命令用于调用和建立DOS[宏命令](https://baike.baidu.com/item/宏命令)

```
doskey [/reinstall] [/listsize=<Size>] [/macros:[all | <ExeName>] [/history] [/insert | /overstrike] [/exename=<ExeName>] [/macrofile=<FileName>] [<MacroName>=[<Text>]]


/reinstall                              清空命令历史缓冲区并重新安装doskey
/listsize=<Size>                指定历史缓冲区的命令行数目
/macros                                 显示doskey宏，需要使用重定向符号“>”将宏重新存储到一个文件中，该参数可以简写为/m
/macros:all                         为所有可执行文件显示doskey宏
/macros:<ExeName>               为指定的exe文件名称显示所有可执行宏
/history                                    显示存储在内存中的命令，可以使用重定向符号“>”将宏重新存储到一个文件中，该参数可以简写为/h
[/insert | /overstrike]     指定是否将你输入的文本插入或覆盖，如果使用/insert参数，你输入的文本将插入到已存在的文本中。如果使用/overwrite参数，新输入的文本将覆盖存在的文本，默认参数问/overwrite。
/exename=<ExeName>              指定允许宏的可执行文件名称
/macrofile=<FileName>           指定你想要安装的包含宏的文件
<MacroName>=[<Text>]            创建由Text指定的命令的宏，MacroName指定宏的名称，Text指定你想要录制的命令，如果Text留空，则删除MacroName。 [1] 
```

doskey /history



> 需要注意的是：doskey 只能查看当前shell对话框中的命令历史记录，无法查看其他shell对话框中的历史记录

## 快捷键命令

F7快捷键查看所有执行过的命令

F3：调出上一条执行过的命令，调出后直接回车即可执行；

F8：搜索命令历史记录，和↑向上箭头类似。

F9：按编号选择命令，来调出执行过的命令：

命令号码在使用F7查看的时候可看到命令前边的数字即为命令号码，但是F7快捷键有个弊端，就是如果命令比较长就会显示不完全，分辨不出来命令的不同











本节参考：

https://baike.baidu.com/item/doskey/10520881?fr=aladdin

https://docs.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2008-R2-and-2008/cc753867(v=ws.10)?redirectedfrom=MSDN

https://blog.csdn.net/lishuoboy/article/details/86605653







# 本文参考

https://en.wikipedia.org/wiki/Command_history

https://www.gnu.org/savannah-checkouts/gnu/bash/manual/bash.html#Bash-History-Builtins
