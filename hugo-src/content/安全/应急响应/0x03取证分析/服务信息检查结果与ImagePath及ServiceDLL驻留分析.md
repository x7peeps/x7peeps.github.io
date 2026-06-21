---
title: "服务信息检查结果与ImagePath及ServiceDLL驻留分析"
date: 2026-06-16T22:35:00+08:00
draft: false
weight: 186
description: "围绕服务信息检查结果，分析 ImagePath、ServiceDLL、svchost 共享服务、失败动作与伪装服务驻留的判断方法。"
categories: ["应急响应", "取证分析"]
tags: ["服务信息检查", "ImagePath", "ServiceDLL", "svchost", "7045", "4697", "服务驻留"]
---

# 服务信息检查结果与ImagePath及ServiceDLL驻留分析

`0x02电子取证` 里的 `服务信息检查` 已经告诉我们应该去哪里看服务、怎么把服务列表导出来。但到了 `0x03取证分析`，关键不再是“机器上有多少服务”，而是：

- 这个服务到底是不是正常业务/系统服务
- 它的 `ImagePath` 或 `ServiceDLL` 指向了什么
- 它是独立 EXE 服务，还是被 `svchost.exe` 承载的共享服务
- 它是正常运维安装，还是攻击者拿来做驻留、提权、横向执行

服务分析是应急现场最容易“看到了却没定性”的环节。因为很多恶意服务长得都很像正常服务：

- 名字像系统组件
- 显示名像安全更新
- 路径看起来也有 `Windows`、`ProgramData`、`Update`
- 甚至还能跑起来

所以服务分析必须从“列服务”升级为“解释服务配置语义”。

---

## 0x01 服务分析阶段最该回答什么

围绕服务结果，建议优先回答六个问题：

1. **这个服务的名字、显示名、描述是否互相匹配？**
2. **`ImagePath` 或 `ServiceDLL` 指向的载荷路径是否合理？**
3. **它应该由 `services.exe` 直接拉起，还是由 `svchost.exe -k` 承载？**
4. **它的启动类型、失败动作、账号上下文是否像正常运维配置？**
5. **它的创建或修改时间，是否与入侵时间窗贴合？**
6. **它是否和 `7045`、`4697`、横向投送、外联或落地文件形成闭环？**

如果只回答第一个问题，往往只能得到“名字有点怪”；只有把后面五个问题补齐，才能把结论升级到“恶意驻留成立”。

---

## 0x02 公开案例一：HyperBro 伪装成 `Windows Defenders Service`

CISA 的恶意软件分析报告里，曾披露过 HyperBro 利用服务机制驻留，其中一个明显特征是：

- 服务名或显示名伪装成 `Windows Defenders Service`

这类案例对现场最有价值的启发不是“出现了这个名字就一定恶意”，而是：

- 攻击者知道分析人员会先看服务名称
- 所以会故意把名称伪装成安全相关或系统相关组件
- 真正能定性的，仍然是 `ImagePath`、落地路径、关联进程和外联行为

如果现场拿到如下结果：

```text
ServiceName : WinDefenders
DisplayName : Windows Defenders Service
StartType   : Auto
ImagePath   : C:\ProgramData\WindowsDefender\windef.exe
```

要关注的重点不是“名字像不像 Defender”，而是：

- 路径不在真正的 Defender 组件目录
- 目录位于攻击者偏爱的 `ProgramData`
- 如果该服务创建时间贴近异常登录、文件投送或共享写入时间，则更值得怀疑

公开来源：

- CISA Malware Analysis Reports: https://www.cisa.gov/resources-tools/resources/malware-analysis-reports

---

## 0x03 公开案例二：Elastic 对 `ServiceDLL` 和 `ImagePath` 异常修改的判断

Elastic 的检测规则把下面这些注册表位置列为重点关注对象：

- `HKLM\SYSTEM\ControlSet*\Services\*\ImagePath`
- `HKLM\SYSTEM\ControlSet*\Services\*\ServiceDLL`

它的核心结论非常适合写进分析流程：

- 正常服务安装通常走标准 API 和安装流程
- 如果服务关键值被直接修改，尤其是由异常进程修改，往往说明有人在绕过正常服务管理流程做驻留

这对现场分析的意义是：

- 看到 `ImagePath` 改了，不要只问“改成了什么”
- 还要问“是谁改的”“为什么直接改注册表”“有没有避开标准安装动作”

例如：

```text
Registry Path : HKLM\SYSTEM\CurrentControlSet\Services\AudioUpdate\ImagePath
New Value     : C:\Users\Public\svchost.exe
Process       : C:\Windows\System32\reg.exe
```

这类结果在分析上已经很强，因为它同时说明：

- 修改的目标是服务核心执行路径
- 新值指向用户可写目录
- 修改动作不是正常安装程序，而是直接改注册表

公开来源：

- Elastic: https://www.elastic.co/guide/en/security/current/unusual-persistence-via-services-registry.html

---

## 0x04 公开案例三：Red Canary 对服务类型与 `services.exe` / `svchost.exe` 关系的经验

Red Canary 在 Service Execution 分析里专门区分了服务类型：

- `SERVICE_USER_OWN_PROCESS`
- `SERVICE_WIN32_SHARE_PROCESS`
- `SERVICE_KERNEL_DRIVER`

这个区分非常重要，因为它直接决定你怎么看进程结果。

### 1. 独立 EXE 服务

如果服务类型是独立进程服务，那么更常见的结果是：

- 由 `services.exe` 拉起
- 对应一个独立 EXE

例如：

```text
ParentImage : C:\Windows\System32\services.exe
Image       : C:\Program Files\Vendor\agent.exe
```

### 2. 共享 DLL 服务

如果服务类型是共享服务，那么更常见的结果是：

- 由 `svchost.exe -k <group>` 承载
- 真正关键载荷藏在 `ServiceDLL`

例如：

```text
ImagePath   : %SystemRoot%\System32\svchost.exe -k netsvcs
ServiceDLL  : C:\Windows\System32\good.dll
```

因此，分析阶段不能只盯 `ImagePath`。很多恶意共享服务表面上看 `ImagePath` 很正常，因为它仍然指向：

- `svchost.exe -k 某组`

但真正的恶意点在：

- `Parameters\ServiceDLL`

公开来源：

- Red Canary: https://redcanary.com/threat-detection-report/techniques/service-execution/

---

## 0x05 服务结果拿到以后，先分三类看

### 1. 名称伪装型

典型表现：

- 名字模仿 Defender、Windows Update、OneDrive、Adobe、显卡、输入法
- 显示名非常“正常”
- 描述字段写得像官方组件

这种情况下，名称本身只能作为线索，不能作为结论。

### 2. 路径异常型

典型表现：

- `ImagePath` 指向 `Users\Public`、`ProgramData`、`Temp`
- 服务 EXE 位于近期新建目录
- 指向脚本宿主而非真正服务程序

这类比单纯名称伪装更强，因为它已经进入“执行载荷位置”层面。

### 3. 宿主伪装型

典型表现：

- `ImagePath` 表面看起来正常，比如仍是 `svchost.exe -k xxx`
- 但 `ServiceDLL` 指向了异常 DLL
- 或者该 `svchost` 实例的服务组、用户名、模块加载与正常基线不符

这类是最容易漏掉的，因为很多分析只看服务列表，不往 `Parameters\ServiceDLL` 深挖。

---

## 0x06 `ImagePath` 结果怎么判

### 1. 指向标准系统目录，不代表一定正常

例如：

```text
ImagePath : C:\Windows\System32\svchost.exe -k DcomLaunch
```

这类结果只能说明：

- 表层执行器看起来合理

但仍需继续看：

- 它对应的服务组是否合理
- 是否有对应 `ServiceDLL`
- 该 `svchost` 实例里是否承载了预期服务

### 2. 指向用户可写目录，怀疑等级显著提升

例如：

```text
ImagePath : C:\Users\Public\adobe_update.exe
```

或：

```text
ImagePath : C:\ProgramData\svchost.exe
```

这类结果的分析含义很明确：

- 服务载荷位于可伪装、可落地、常被攻击者使用的目录
- 如果服务又是自动启动，那么这已经非常接近后门驻留

### 3. `ImagePath` 里出现脚本宿主或命令解释器，要重点看“这是服务还是代理执行”

例如：

```text
ImagePath : cmd.exe /c powershell -w hidden -enc ...
```

或：

```text
ImagePath : powershell.exe -ExecutionPolicy Bypass -File C:\ProgramData\update.ps1
```

这类结果强烈说明：

- 这不是典型业务服务写法
- 更像攻击者借服务机制做代理执行、下载执行或驻留恢复

在分析报告里，这种情况通常可以直接写成：

- “服务配置存在明显异常，执行目标为命令解释器/脚本宿主，不符合常规业务服务实现方式”

### 4. 未加引号的路径，重点不是漏洞知识本身，而是它是否已被利用

如果拿到：

```text
ImagePath : C:\Program Files\Vendor Agent\agent service.exe
```

分析阶段不要止于“存在未加引号路径风险”，而要继续问：

- 对应目录中是否出现了同名劫持文件
- 该服务近期是否实际被启动
- 是否出现与该路径拆分相关的异常可执行文件

只有出现实际利用痕迹时，才应从“配置风险”升级为“利用成立”。

---

## 0x07 `ServiceDLL` 结果怎么判

### 1. `ImagePath` 正常但 `ServiceDLL` 异常，是共享服务伪装的经典形态

例如：

```text
ImagePath  : %SystemRoot%\System32\svchost.exe -k netsvcs
ServiceDLL : C:\Users\Public\netutils.dll
```

这类结果比普通恶意服务更隐蔽，因为：

- 表面宿主是标准 `svchost.exe`
- 只有深看 `Parameters\ServiceDLL` 才能看到真正载荷

它在分析上的意义通常很强，尤其当 DLL 位于：

- 用户可写目录
- 近期新建目录
- 伪装目录

### 2. `ServiceDLL` 位于系统目录，也不能直接放过

还要看：

- 该 DLL 是否为系统已知文件
- 哈希、签名、版本是否匹配
- 修改时间是否异常
- 是否存在同名替换或旁路加载

### 3. `ServiceDLL` 被异常进程直接改写，结论强度会进一步上升

如果你能看到：

- 修改者是 `reg.exe`、`powershell.exe`、`cmd.exe`
- 修改时间与异常登录、共享写入、服务创建贴合

那么这类结果就更适合写成：

- “存在服务型持久化配置被直接篡改的证据”

---

## 0x08 `svchost.exe` 结果怎么判

### 1. 正常 `svchost.exe` 至少要回答三个问题

- 路径是否正确
- 命令行是否带 `-k`
- 它承载的是哪些服务

如果这三件事都答不上来，就不能把它当成普通系统服务宿主。

### 2. 没有 `-k` 的 `svchost.exe` 很值得关注

Red Canary 在真实案例中就提到，异常 `svchost.exe` 常表现为：

- 命令行里没有正常的 `-k` 参数

例如：

```text
Image       : C:\Windows\System32\svchost.exe
CommandLine : C:\Windows\System32\svchost.exe
ParentImage : C:\Windows\System32\cmd.exe
```

这类结果的分析意义是：

- 它不像由标准服务组机制拉起
- 更像手工执行、注入、替身利用或代理执行

### 3. `tasklist /svc` 查不到对应服务，是个很关键的交叉点

例如：

```text
映像名称: svchost.exe
PID:      5528
服务:     暂缺
```

若同时还存在：

- 用户态会话
- 普通用户名
- 异常路径
- 异常外联

那么“服务宿主合理性”基本就讲不通了。

---

## 0x09 失败动作、恢复策略结果怎么判

很多分析只看服务会不会自启，但忽略了失败动作设置。实际上，失败动作很适合判断攻击者是否希望它“掉线后自动回来”。

例如：

```text
FailureActions:
  First failure  : Restart the Service
  Second failure : Restart the Service
  Subsequent     : Restart the Service
  Reset period   : 0
```

如果该服务本身又指向异常载荷，那么这个结果说明的不是“配置完整”，而是：

- 攻击者希望该后门尽量常驻
- 服务崩掉后立即自恢复
- 这更像持续控制，而不是一次性执行

但分析时要注意边界：

- 正常的 EDR、备份代理、数据库代理也常配置自动恢复

因此失败动作本身不是恶意结论，而是“驻留意图增强证据”。必须与路径、时间、载荷、外联一起看。

---

## 0x0A `7045`、`4697`、共享投送与服务驻留怎么闭环

服务分析最有价值的地方，在于它很容易和横向执行形成完整闭环。

### 典型链条

1. 先出现 `4624 Type 3` 网络登录
2. 随后出现 `5140` / `5145` 对 `ADMIN$` 或 `C$` 的访问与写入
3. 紧接着出现 `7045` 或 `4697`
4. `ImagePath` 指向刚刚投送的 EXE
5. `services.exe` 或对应 `svchost.exe` 将其拉起
6. 后续出现外联、隧道、命令执行或横向继续扩散

例如：

```text
Event ID 5145
Share Name: \\*\ADMIN$
Relative Target Name: Temp\svc.exe
Accesses: WriteData
```

```text
Event ID 7045
Service Name: WinUpdateCheck
ImagePath: C:\Windows\Temp\svc.exe
```

这时，`服务信息检查` 已经不只是“发现异常服务”，而是可以更明确写成：

- “存在通过管理共享投送二进制并以服务方式执行的横向链路”

---

## 0x0B Windows 现场更适合怎么查结果

下面这些命令在 `0x03` 阶段的用途，不是重复取证，而是为了补定性信息。

### 1. 看服务核心字段

```powershell
Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\*' |
  Select-Object PSChildName, DisplayName, ImagePath, ObjectName, Start
```

分析重点：

- `PSChildName`、`DisplayName` 是否刻意伪装
- `ImagePath` 是否落在异常目录
- `ObjectName` 是否以异常账号运行
- `Start` 是否为自动启动

### 2. 专查 `ServiceDLL`

```powershell
Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Services' | ForEach-Object {
  $p = Get-ItemProperty -Path ($_.PSPath + '\Parameters') -ErrorAction SilentlyContinue
  if ($p.ServiceDLL) {
    [PSCustomObject]@{
      ServiceName = $_.PSChildName
      ServiceDLL  = $p.ServiceDLL
    }
  }
}
```

分析重点：

- 是否指向用户可写目录
- 是否与服务组语义匹配
- 是否与已知系统 DLL 不一致

### 3. 结合 `tasklist /svc`

```cmd
tasklist /svc /fo list
```

分析重点：

- 某个 `svchost.exe` 具体承载了哪些服务
- 是否存在查不到宿主关系的 `svchost.exe`
- 某个独立服务 EXE 是否真由 `services.exe` 宿主体系拉起

### 4. 看系统服务安装日志

```powershell
Get-WinEvent -FilterHashtable @{LogName='System'; Id=7045; StartTime=(Get-Date).AddDays(-7)} |
  Select-Object TimeCreated, Message
```

```powershell
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4697; StartTime=(Get-Date).AddDays(-7)} |
  Select-Object TimeCreated, Message
```

分析重点：

- 新服务安装时间
- 服务名和路径
- 是否与共享写入、远程登录、恶意文件落地时间接近

---

## 0x0C 哪些结果可以把“服务异常”升级到“恶意驻留成立”

### 弱证据

- 服务名可疑
- 显示名伪装
- 描述不自然

### 中等证据

- `ImagePath` 指向 `ProgramData`、`Public`、`Temp`
- `ServiceDLL` 指向异常 DLL
- `svchost.exe` 宿主关系说不通
- 新服务创建时间紧贴入侵窗口

### 强证据

- `7045` / `4697` 与共享写入、远程登录、可疑进程链闭环
- 载荷签名、哈希、路径、创建时间均异常
- 服务启动后立即出现外联、隧道、横向或执行后续指令
- 注册表修改者本身就是异常进程或 LOLBin

到这一步，报告里通常可以更稳地写为：

- “存在服务型持久化/执行链证据”
- “存在共享服务 `ServiceDLL` 被篡改或伪装利用的高疑似行为”
- “存在通过服务机制完成横向执行的强关联证据”

---

## 0x0D 建议整理成什么交付表

| 时间 | 服务名 | 核心字段 | 关键结果 | 关联证据 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 01:11:33 | `Windows Defenders Service` | `ImagePath=C:\ProgramData\windef.exe` | 名称伪装，路径异常 | 7045、外联 | 恶意服务高疑似 |
| 01:12:08 | `AudioUpdate` | `ServiceDLL=C:\Users\Public\netutils.dll` | 共享服务载荷异常 | 注册表修改、svchost 宿主 | ServiceDLL 驻留高疑似 |
| 01:13:50 | `WinUpdateCheck` | `ImagePath=C:\Windows\Temp\svc.exe` | 临时目录服务 | 5145、7045、services.exe 拉起 | 横向投送后服务执行成立 |
| 01:15:02 | `VendorAgent` | `FailureActions=Restart` | 自动恢复 | 签名正常、路径正常 | 更像正常运维服务 |

---

## 0x0E 总结

`服务信息检查` 在 `0x02` 阶段给的是入口，而在 `0x03` 阶段真正要完成的是：

- 把服务配置翻译成执行语义
- 把 `ImagePath` 和 `ServiceDLL` 还原成真实载荷位置
- 把 `svchost` 表象拆开，看到背后的共享服务逻辑
- 把“新服务存在”升级为“驻留成立”或“横向执行成立”

所以分析服务时，不能停在“服务名有点怪”这种弱判断上，而要尽量回答：

- 它是谁创建的
- 它实际执行了谁
- 它为什么能持续回来
- 它和这次事件是不是同一条攻击链

只有做到这一步，`服务信息检查` 才真正从“服务清单排查”升级成“服务型驻留与横向执行分析”。
