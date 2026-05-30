---
title: "[MS-GPSB]Window核心协议-安全扩展协议"
menu: 
  main: 
    parent: "Powershell"
---
原文由于没有中文版，因此这里手工整理翻译了一下全文方便大佬们后续参考。

原文：[[MS-GPSB\] 组策略安全扩展协议](https://docs.microsoft.com/zh-cn/openspecs/windows_protocols/ms-gpsb/6a07a06b-e628-4765-9d91-0d63ba47fdc0)

组策略：安全

# 1. 介绍

本文档指定组策略：核心协议的组策略：安全协议扩展，如[MS-GPOL]中所指定。

## 1.1 词汇表

### Active directory

通用目录服务的Windows实现，它使用LDAP作为其主要访问协议。Active Directory存储有关网络中各种对象的信息，如用户帐户、计算机帐户、组以及Kerberos[MS-KILE]使用的所有相关凭据信息。Active Directory可以作为Active Directory域服务（AD DS）或Active Directory轻量级目录服务（AD LDS）部署，这两种服务在[MS-ADOD]:Active Directory协议概述中都有描述。



### Active Directory object

在[MS-ADTS]第3.1.1节中定义的Active Directory中使用的一组目录对象。Active Directory对象可以通过DSName标识。另请参见目录对象。



### attribute

某些对象或实体的特征，通常编码为名称/值对。



### class

与键关联的用户定义的二进制数据。



### client

客户端，也称为客户端计算机，是接收并应用[MS-GPOL]中指定的组策略对象(GPO)设置的计算机。



### CSE GUID

client-side extension 客户端扩展GUID（CSE GUID）：一种GUID，它使组策略客户端上的特定客户端扩展能够与存储在组策略服务器上的组策略对象(GPO)的逻辑和物理组件中的策略数据相关联。



### DACL

自主访问控制列表(DACL)：由对象所有者控制的访问控制列表(ACL)，它指定特定用户或组可以对该对象进行的访问。



### Domain

域：共享公共名称空间和管理基础结构的一组用户和计算机。该组中至少有一个计算机成员必须充当域控制器(DC)并承载标识域所有成员的成员列表，还必须可选地承载Active Directory服务。域控制器提供成员身份验证，为其成员创建信任单元。每个域都有一个在其成员之间共享的标识符。有关更多信息，请参见[MS-AUTHSOD]节1.1.1.5和[MS-ADTS]。



### DC

域控制器(DC)：在实现Active Directory的服务器上运行的服务，或承载此服务的服务器。该服务托管对象的数据存储，并与其他DC进行互操作，以确保对对象的本地更改在所有DC之间正确复制。当Active Directory作为Active Directory域服务（AD DS）运行时，DC包含其林中的配置命名上下文（配置NC)、架构命名上下文（架构NC）和一个域NC的完整NC副本。如果AD DS DC是全局编录服务器（GC服务器），则它包含其林中剩余域NC的部分NC副本。有关更多信息，请参见[MS-AUTHSOD]节1.1.1.5.2和[MS-ADTS]。当Active Directory作为Active Directory轻型目录服务（AD LDS）运行时，多个AD LDS DC可以在一台服务器上运行。当Active Directory作为AD DS运行时，一台服务器上只能运行一个AD DS DC。但是，多个AD LDS DC可以与一个AD DS DC共存在一台服务器上。AD LDS DC在其林中包含配置NC和架构NC的完整NC副本。域控制器是身份验证协议域支持[MS-APDS]的服务器端。

### GUID

全局唯一标识符(GUID)：在Microsoft协议技术文档(TDs)中与通用唯一标识符(UUID)互换使用的术语。交换这些术语的用法并不意味着或要求特定的算法或机制来生成值。具体来说，使用这个术语并不意味着或要求必须使用[RFC4122]或[C706]中描述的算法来生成GUID。另请参见通用唯一标识符(UUID)。



### Group Policy

组策略：允许实现者为Active Directory服务环境中的用户和计算机指定托管配置的机制。



### Group Policy Object

组策略对象(GPO)：管理员定义的策略设置规范的集合，可以应用于域中的计算机组。每个GPO包括两个元素：驻留在域的Active Directory中的对象，以及驻留在域的组策略服务器的sysvol DFS共享中的相应文件系统子目录。



### Lightweight Directory Access Protocol

轻量级目录访问协议(LDAP)：Active Directory的主要访问协议。轻量级目录访问协议(LDAP)是由Internet工程任务组(IETF)建立的行业标准协议，它允许用户查询和更新目录服务(DS)中的信息，如[MS-ADTS]所述。轻量级目录访问协议可以是版本2[RFC1777]或版本3[RFC3377]。



### relative identifier

相对标识符(RID)：安全标识符(SID)[SIDD]中子权限值系列中的最后一项。它将一个帐户或组与域中的所有其他帐户和组区分开来。任何域中没有两个帐户或组共享同一个RID。



### security identifier

安全标识符(SID)：用于标识帐户或组的安全主体的标识符。概念上，SID由帐户授权部分（通常是域）和一个较小的整数组成，该整数表示相对于帐户授权的标识，称为相对标识符(RID)。SID格式在[MS-DTYP]第2.4.2节中指定；SIDs的字符串表示在[MS-DTYP]节2.4.2和[MS-AZOD]节1.1.1.2中指定。



### security policy

安全策略：以安全策略设置集合的形式，策略本身表达了关于如何保护网络上的计算机和资源的管理意图。



### security policy settings

安全策略设置：包含在安全策略中，策略设置是如何配置计算机上各种安全相关参数的实际表达。



### Server Message Block (SMB)

服务器消息块(SMB)：一种协议，用于通过网络从服务器系统请求文件和打印服务。SMB协议通过附加的安全性、文件和磁盘管理支持扩展了CIFS协议。有关更多信息，请参见[CIFS]和[MS-SMB]。



### share

共享：由公共Internet文件系统(CIFS)服务器提供的供CIFS客户端通过网络访问的资源。共享通常表示目录树及其包含的文件（通常称为“磁盘共享”或“文件共享”）或打印机（“打印共享”）。如果有关共享的信息保存在持久存储区（例如，Windows注册表）中，并在重新启动文件服务器时重新加载，则该共享称为“粘性共享”。有些共享名是为特定功能保留的，被称为特殊共享:IPC$（为进程间通信保留）、ADMIN$（为远程管理保留）和a$、B$、C$（以及后面跟着美元符号的其他本地磁盘名），分配给本地磁盘设备。



### system access control list 

系统访问控制列表(SACL)：一个访问控制列表(ACL)，它控制对试图访问安全对象的审计消息的生成。获取或设置对象的SACL的能力由通常仅由系统管理员拥有的特权控制。



### MAY, SHOULD, MUST, SHOULD NOT, MUST NOT

可以、应该、必须、不应该、不得：这些术语（在所有上限中）按照[RFC2119]中的定义使用。所有可选行为的语句都使用可能、应该或不应该。





## 1.2 参考文献

### 1.2.1 规范性参考文献



我们经常对规范性参考文献进行调查，以确保它们的持续可用性。如果您在寻找规范引用方面有任何问题，请联系dochelp@microsoft.com。我们将协助您查找相关信息。

[MS-ADTS] Microsoft Corporation, "[Active Directory Technical Specification]([MS-ADTS].pdf#Section_d243592709994c628c6d13ba31a52e1a)".

[MS-DTYP] Microsoft Corporation, "[Windows Data Types]([MS-DTYP].pdf#Section_cca2742956894a16b2b49325d93e4ba2)".

[MS-EVEN] Microsoft Corporation, "[EventLog Remoting Protocol]([MS-EVEN].pdf#Section_55b13664f7394e4ebd8d04eeda59d09f)".

[MS-GPOL] Microsoft Corporation, "[Group Policy: Core Protocol]([MS-GPOL].pdf#Section_62d1292462524052996f161d2b9019f4)".

[MS-LSAD] Microsoft Corporation, "[Local Security Authority (Domain Policy) Remote Protocol]([MS-LSAD].pdf#Section_1b5471ef4c334a91b079dfcbb82f05cc)".

[MS-RRP] Microsoft Corporation, "[Windows Remote Registry Protocol]([MS-RRP].pdf#Section_0fa3191dbb79490a81bd54c2601b7a78)".

[MS-SAMR] Microsoft Corporation, "[Security Account Manager (SAM) Remote Protocol (Client-to-Server)]([MS-SAMR].pdf#Section_4df07fab1bbc452f8e927853a3c7e380)".

[MS-SCMR] Microsoft Corporation, "[Service Control Manager Remote Protocol]([MS-SCMR].pdf#Section_705b624a13de43ccb8a299573da3635f)".

[MS-SMB2] Microsoft Corporation, "[Server Message Block (SMB) Protocol Versions 2 and 3]([MS-SMB2].pdf#Section_5606ad475ee0437a817e70c366052962)".

[MS-SMB] Microsoft Corporation, "[Server Message Block (SMB) Protocol]([MS-SMB].pdf#Section_f210069c70864dc2885e861d837df688)".

[RFC1510] Kohl, J., and Neuman, C., "The Kerberos Network Authentication Service (V5)", RFC 1510, September 1993, [http://www.ietf.org/rfc/rfc1510.txt](https://go.microsoft.com/fwlink/?LinkId=90279)

[RFC2119] Bradner, S., "Key words for use in RFCs to Indicate Requirement Levels", BCP 14, RFC 2119, March 1997, [http://www.rfc-editor.org/rfc/rfc2119.txt](https://go.microsoft.com/fwlink/?LinkId=90317)

[RFC2251] Wahl, M., Howes, T., and Kille, S., "Lightweight Directory Access Protocol (v3)", RFC 2251, December 1997, [http://www.ietf.org/rfc/rfc2251.txt](https://go.microsoft.com/fwlink/?LinkId=90325)

[RFC4234] Crocker, D., Ed., and Overell, P., "Augmented BNF for Syntax Specifications: ABNF", RFC 4234, October 2005, [http://www.rfc-editor.org/rfc/rfc4234.txt](https://go.microsoft.com/fwlink/?LinkId=90462)



### 1.2.2 信息量大的参考文



[MSDN-INF] Microsoft Corporation, "About INF Files", [http://msdn.microsoft.com/en-us/library/aa376858.aspx](https://go.microsoft.com/fwlink/?LinkId=90025)

[MSDN-PRIVS] Microsoft Corporation, "Authorization Constants", [http://msdn.microsoft.com/en-us/library/aa375728.aspx](https://go.microsoft.com/fwlink/?LinkId=90065)



## 1.3 概述

### 1.3.1 背景

[MS-GPOL]中指定的组策略：核心协议使客户端能够发现和检索域管理员创建的策略设置。这些设置在分配给Active Directory中的策略目标帐户的组策略对象中传播。策略目标帐户是Active Directory中的计算机帐户或用户帐户。每个客户端使用轻量级目录访问协议(LDAP)通过查阅与每个客户端的计算机帐户对应的Active Directory对象和登录到客户端计算机的任何用户的用户帐户来确定适用于它的GPO。



在每个客户端上，每个GPO都由称为客户端插件的软件组件解释和作用。负责给定GPO的客户端插件是通过使用GPO上的属性指定的。此属性指定全局唯一标识符(GUID)对的列表。每对的第一个GUID称为客户端扩展GUID（CSE GUID）。每对的第二个GUID称为工具扩展GUID。



对于适用于客户端的每个GPO，客户端都会参考GPO中列出的CSE GUID，以确定客户端上的哪些客户端插件将处理GPO。然后，客户端调用客户端插件来处理GPO。



客户端插件使用GPO的内容以特定于其类的方式检索特定于其类的设置。检索到其特定于类的设置后，客户端插件使用这些设置执行特定于类的处理。



### 1.3.2 安全扩展概述



安全策略包含设置（协议配置），这些设置使基础安全组件能够强制执行以下内容：

§  密码、帐户锁定和Kerberos策略。

§  系统审核设置。

§  特权和权利分配。

§  应用程序安全配置数据值和安全描述符。

§  事件日志设置。

§  安全组成员资格。

§  长时间运行的进程和程序的配置信息，以及它们上的安全描述符。

§  文件和文件夹安全描述符。

以下主要步骤用于安全配置：

§  安全策略编写。

§  安全策略分配。

§  安全策略分发。







安全策略创作是通过组策略：核心协议的管理工具启用的，该管理工具具有特定于该协议的行为的管理插件。该插件允许管理员在用户界面中编写安全策略。然后，插件将安全策略保存到标准格式的。inf文件中，并将它们存储在可以使用服务器消息块(SMB)协议访问的网络位置上，如[MS-SMB]中指定的那样。



安全策略分配由组策略：核心协议管理工具执行，该工具构造GPO，如[MS-GPOL]第2.2.8.1节所述。每个GPO都包含一个对网络位置的引用，其中包含由管理工具插件生成的安全策略文件。

安全策略分发涉及客户端计算机上相应的特定于协议的组策略插件，调用该插件来处理引用安全策略设置的任何GPO。安全协议客户端插件提取GPO中指定的网络位置，使用SMB协议传输安全策略文件，然后使用安全策略文件配置客户端的安全设置。





## 1.4 与其他议定书的关系

此协议依赖于[MS-GPOL]中指定的组策略：核心协议。它还依赖于[MS-SMB]中指定的SMB协议，用于在客户端和GP服务器之间传输组策略设置和指令。

![img](ms-gpsb_window%E6%A0%B8%E5%BF%83%E5%8D%8F%E8%AE%AE-%E5%AE%89%E5%85%A8%E6%89%A9%E5%B1%95%E5%8D%8F%E8%AE%AE/1632624315434-1c76b526-9916-432a-a096-c0f790733b12.png)

## 1.5 先决条件

组策略：安全协议扩展的先决条件与组策略：核心协议的先决条件相同。



## 1.6 适用性声明

组策略：安全协议扩展仅适用于组策略框架。



## 1.7 版本控制和能力协商

组策略：安全协议扩展不对收到的安全策略执行任何显式版本检查



## 1.8 供应商-可扩展字段

组策略：安全协议扩展不定义任何供应商可扩展字段。



## 1.9 标准作业

组策略：Security Protocol Extension定义CSE GUID和工具扩展GUID，如[MS-GPOL]第1.8节所述。下表显示了工作分配。



| Parameter                                      | Value                                  |
| ---------------------------------------------- | -------------------------------------- |
| CSE GUID                                       | {827D319E-6EAC-11D2-A4EA-00C04F79F83A} |
| Tool extension GUID (computer policy settings) | {803E14A0-B4FB-11D0-A0D0-00A0C90F574B} |



# 2. 信息

## 2.1 运输

组策略：安全协议扩展应<1>根据[MS-SMB2]中指定的服务器消息块(SMB)版本2和3协议通过组策略协议传输消息（文件形式）。客户端插件必须使用该协议的CSE GUID（如[MS-DTYP]第2.3.4节中指定的那样），管理工具插件必须使用工具扩展GUID。



组策略：核心协议使用该协议的CSE GUID和工具扩展GUID值（参见1.9节）来调用该协议，仅用于访问需要由该协议处理的GPO。

## 2.2 消息语法

组策略：安全协议扩展中交换的消息对应于使用SMB协议传输的安全策略文件。协议是通过这些消息的交换来驱动的，如第3节所述。

组策略：安全协议扩展处理的所有安全策略文件必须使用UTF-16LE编码，并带有字节顺序标记(0xFFFE)。inf文件语法如下所示。

```
InfFile = UnicodePreamble VersionPreamble Sections
UnicodePreamble = *("[Unicode]" LineBreak "Unicode=yes"
       LineBreak)
VersionPreamble = "[Version]" LineBreak "signature=" 
       DQUOTE "$CHICAGO$" DQUOTE LineBreak "Revision=1" LineBreak
Sections = Section /  Section Sections
Section = Header Settings
Header = "[" HeaderValue "]" LineBreak
HeaderValue = StringWithSpaces
Settings = Setting / Setting Settings
Setting = Key Wsp "=" Wsp ValueList LineBreak /
Name "," Mode "," AclString LineBreak 
Name = String / QuotedString
Mode = [0-9]+
AclString = SDDL / DQUOTE SDDL DQUOTE
ValueList = Value / Value Wsp "," Wsp ValueList
Key = String
Value = String / QuotedString
```

前面的语法是以增强的Backus-Naur形式(ABNF)语法给出的，如[RFC4234]中所规定的，并由以下规则增强。

```
LineBreak = CRLF
String = *(ALPHANUM / %d47 / %d45 / %d58 / %d59)
StringWithSpaces = String / String Wsp StringWithSpaces
QuotedString = DQUOTE *(%x20-21 / %x23-7E) DQUOTE
Wsp = *WSP
ALPHANUM = ALPHA / DIGIT
```

有关.inf文件及其用途的详细信息，请参阅[MSDN-INF]。

协议进一步限制可以分配给HeaderValue的值。必须为HeaderValue分配下表中列出的值之一。

| HeaderValue             | Purpose                                                      |
| ----------------------- | ------------------------------------------------------------ |
| System Access           | 必须包含与帐户锁定、密码策略和本地安全选项有关的设置。       |
| Kerberos Policy         | 必须包含[RFC1510]中指定的与Kerberos策略相关的设置。          |
| System Log              | 必须包含与系统日志的最大大小、保留策略等有关的设置。有关更多细节，请参见第2.2.3节。 |
| Security Log            | 必须包含与安全日志的最大大小、保留策略等有关的设置。有关更多细节，请参见第2.2.3节。 |
| Application Log         | 必须包含与应用程序日志的最大大小、保留策略等有关的设置。有关更多细节，请参见第2.2.3节。 |
| Event Audit             | 必须包含与审核策略有关的设置。                               |
| Registry Values         | 必须包含要配置的注册表值。                                   |
| Privilege Rights        | 必须包含要分配给特定帐户的特权列表。                         |
| Service General Setting | 必须包含与服务有关的配置设置。                               |
| Registry Keys           | 必须包含要应用的注册表项及其对应的安全信息的列表。           |
| File Security           | 必须包含要应用的文件、文件夹及其相应安全信息的列表。         |
| Group Membership        | 必须包含组成员信息，例如，哪些用户是哪个组的一部分。         |

注实现这里所述协议客户端的插件不理解它所处理的任何（名称、值）对的语义。它的操作是在由HeaderValue指示的客户端存储区中设置那些命名值。当客户端存储是注册表时，插件不需要知道(name，value)对的可能名称列表。这意味着GP可以创建和填充存储在注册表项中的新安全设置。对于其他存储，该插件维护从设置名称到应用程序编程接口(API)的预编译映射列表。



### 2.2.1 系统接入

下列主题指定各种类型的系统访问设置。本节的ABNF必须如下所示。

```
Header = "[" HeaderValue "]" LineBreak
HeaderValue = "System Access"
Settings = Setting / Setting Settings
Setting = Key Wsp "=" Wsp Value LineBreak
Key = String
Value = 1*DIGIT
```

#### 2.2.1.1 密码策略

本节定义指定各种支持的密码策略的设置。表示此类策略的有效密钥的ABNF必须如下所示。

```
Key = "MinimumPasswordAge" / "MaximumPasswordAge" /
      "MinimumPasswordLength" / "PasswordComplexity" / 
      "PasswordHistorySize" / "ClearTextPassword" /
      "RequireLogonToChangePassword"

Value = 1*10DIGIT
```

下表提供了对每个有效键值的解释

| Setting key                  | Explanation                                                  |
| ---------------------------- | ------------------------------------------------------------ |
| MaximumPasswordAge           | 在客户端要求用户更改密码之前，密码可以使用的最大天数。该值必须等于“-1”或在1到999的范围内。值“-1”表示密码永远不会过期。如果最大密码期限值不是“-1”，则最小密码期限必须小于最大密码期限。 |
| MinimumPasswordAge           | 自密码更改或重置之日起，在客户端必须允许用户更改密码之前，密码可以使用的天数。此值必须介于0和999之间。最小密码期限必须小于最大密码期限，除非最大密码期限设置为-1。 |
| MinimumPasswordLength        | 用户帐户的密码可以包含的最小字符数。此值必须介于0和2^16之间。值为0表示不需要密码。 |
| PasswordComplexity           | 标志，指示操作系统是否必须要求密码满足复杂性要求。如果设置了此标志，则指示密码必须满足特定的最低要求。此值必须介于0和2^16之间。值为0表示不适用密码复杂性要求。任何其他有效值都表示适用密码复杂性要求。如果启用此策略，密码必须满足以下最低要求：§  不能包含用户的帐户名或超过两个连续字符的用户全名部分。§  长度必须至少为六个字符。§  必须包含下列三个类别中的字符：§  英文大写字母（A到Z）。§  英文小写字符（a到z）。§  以10位为基数（0到9）。§  非字母数字字符（例如！、$、#、%)。在更改或创建密码时，必须强制执行复杂性要求。 |
| ClearTextPassword            | 标志，指示是否必须使用可逆加密来存储密码。此值必须介于0和2^16之间。值0表示密码未使用可逆加密存储。任何其他有效值都表示密码是以可逆加密方式存储的。不建议使用此标志。此策略为使用要求了解用户密码以进行身份验证的协议的应用程序提供支持。通过使用可逆加密存储密码本质上与存储密码的纯文本版本相同。 |
| PasswordHistorySize          | 在与用户帐户关联重用旧密码之前所需的唯一新密码数。此值必须介于0和2^16之间。值0表示禁用密码历史记录。此策略使管理员能够通过确保旧密码不会持续重复使用来增强安全性。 |
| RequireLogonToChangePassword | 设置被忽略。<2>                                              |

#### 2.2.1.2 帐户锁定策略

本节定义指定帐户锁定持续时间配置的设置。表示此类策略的有效密钥的ABNF必须如下所示。

```
Key = "LockoutBadCount" / "ResetLockoutCount" /
     "LockoutDuration" / "ForceLogoffWhenHourExpire"

Value = 1*10DIGIT
```

下表提供了对每个有效键值的解释。

**注所有数值都是十进制的，除非另有明确规定或前面有0x。**

| Setting key               | Explanation                                                  |
| ------------------------- | ------------------------------------------------------------ |
| ForceLogoffWhenHourExpire | 此设置控制当客户端登录时间到期时，是否强制断开与SMB服务器的SMB客户端会话。如果指定了非零值，则启用策略。 |
| LockoutDuration           | 锁定帐户在自动解锁之前必须保持锁定的分钟数。该值必须为-1或在1到99,999的范围内。如果帐户锁定持续时间值设置为负1，则必须锁定帐户，直到管理员显式解除锁定为止。如果定义了帐户锁定阈值，则帐户锁定持续时间必须大于或等于重置时间resetlockoutcount。此设置仅在指定帐户锁定阈值时才有意义。 |
| LockoutBadCount           | 失败的登录尝试数，之后必须锁定用户帐户。在管理员重置或帐户的锁定期限到期之前，不得允许已锁定的帐户登录。该值必须介于0和2^16之间。值为0表示该帐户不能被锁定。 |
| ResetLockoutCount         | 登录尝试失败后必须锁定帐户的分钟数。该值必须在-2^32到2^32的范围内。如果该值为负或零，则不执行重置时间。如果定义了正的帐户锁定阈值，则此重置时间必须小于或等于帐户锁定持续时间lockoutDuration。 |

### 2.2.2 Kerberos策略

本节定义允许管理员配置[RFC1510]中指定的用户登录限制的设置。

本节的ABNF必须如下所示

```
Header = "[" HeaderValue "]" LineBreak
HeaderValue = "Kerberos Policy"
Settings = Setting /  Setting Settings
Setting = Key Wsp "=" Wsp Value LineBreak
Key = "MaxTicketAge" / "MaxRenewAge" / "MaxServiceAge" / 
      "MaxClockSkew" / "TicketValidateClient"

Value = 1*5DIGIT
```

下表提供了对每个有效键值的解释。

注所有数值都是十进制的，除非另有明确规定或前面有0x。组策略：安全协议扩展实现应使用指定的默认值。

| Setting key          | Explanation                                                  |
| -------------------- | ------------------------------------------------------------ |
| MaxServiceAge        | 授予的会话票证在过期前使用Kerberos访问服务或资源必须有效的最长时间（分钟）。不能将过期的票证作为服务或资源访问的有效票证接受。有关Kerberos票证身份验证的详细信息如[RFC1510]所述。该值必须大于或等于10，并且小于或等于MaxTicketage的设置。默认为600分钟（10小时）。 |
| MaxTicketAge         | 用户的票证授予票证(TGT)在过期前可以使用的最长时间（小时）。过期的TGT不能被接受为有效的TGT。默认为10小时。该值必须介于零和99,999之间。 |
| MaxRenewAge          | 用户的TGT可以续订的时间段（以天为单位）。如果TGT的有效期超过MaxRenewAge天数，则不得续订。默认为7天。该值必须介于零和99,999之间。 |
| MaxClockSkew         | 必须是客户端时钟时间与提供Kerberos v5身份验证的服务器时钟时间之间的最大时间差（分钟），如[RFC1510]中所指定。默认为5分钟。该值必须介于零和99,999之间。 |
| TicketValidateClient | 一个标志，用于确定Kerberos v5密钥分发中心(KDC)是否必须根据用户帐户的用户权限策略验证每个会话票证请求。对每个会话票证请求进行验证是可选的，因为额外的步骤需要时间，并且会降低网络对服务的访问速度。默认值已启用。非零值表示策略已启用；否则，将禁用策略。 |

### 2.2.3 事件日志策略

事件日志策略有三种类型：

§  系统日志

§  安全日志

§  应用程序日志

它们各自的ABNF必须如下所示。

```
Header = "[" HeaderValue "]" LineBreak
HeaderValue = "System Log" / "Security Log" / "Application Log"
Settings = Setting / Setting Settings
Setting = Key Wsp "=" Wsp Value LineBreak
Key = "MaximumLogSize" / "AuditLogRetentionPeriod" 
      / "RetentionDays" / "RestrictGuestAccess"

Value = 1*8DIGIT
```

下表提供了对每个有效键值的解释。

**注所有数值都是十进制的，除非另有明确规定，或者前面有0x。**

| Setting key             | Explanation                                                  |
| ----------------------- | ------------------------------------------------------------ |
| MaximumLogSize          | 日志大小（以千字节为单位）必须小于或等于此值。该值必须介于64和4194240之间。 |
| AuditLogRetentionPeriod | 指定要应用于特定日志的保留期类型。保留方法必须是下列方法之一：§  值“0”指示根据需要覆盖事件。§  值“1”指示覆盖由RetentionDays项指定的事件。§  值“2”表示从不覆盖事件（手动清除日志）。任何其他值都无效。 |
| RetentionDays           | 系统、安全和应用程序日志事件在被新事件覆盖之前必须保留的天数。仅当选项AuditLogRetentionPeriod=1时有效。该值必须介于1和365之间。 |
| RestrictGuestAccess     | 指示具有来宾特权的用户是否可以访问系统、安全和应用程序日志的标志。<3>§  值“0”表示来宾对系统、安全和应用程序日志的访问不受限制。§  非零值表示来宾对系统、安全和应用程序日志的访问受到限制。 |

### 2.2.4 事件审核策略

本节定义使管理员能够强制审核帐户登录事件的设置。此类别中条目的语法必须如下所示。

```
Header = "[" HeaderValue "]" LineBreak
HeaderValue = "Event Audit"
Settings = Setting / Setting Settings
Setting = Key Wsp "=" Wsp Value Linebreak
Key = "AuditSystemEvents" / "AuditLogonEvents" / "AuditPrivilegeUse" /
 "AuditPolicyChange" / "AuditAccountManage" / "AuditProcessTracking" /
 "AuditDSAccess" / "AuditObjectAccess" / "AuditAccountLogon"

Value = 1*DIGIT
```

下表提供了[MS-LSAD]第2.2.4.20节中指定的有效密钥的解释。

注所有数值都是十进制的，除非另有明确规定，或者前面有0x。

| Setting key          | Explanation                                                  |
| -------------------- | ------------------------------------------------------------ |
| AuditAccountManage   | 指示操作系统是否必须审核计算机上帐户管理的每个事件的标志。   |
| AuditDSAccess        | 一个安全设置，用于确定操作系统是否必须审核用户尝试访问指定了自己的系统访问控制列表(SACL)的Active Directory对象的每个实例，如果访问请求的类型（如写、读或修改）和发出请求的帐户与SACL中的设置匹配。管理员可以指定只审核成功、只审核失败、成功和失败，或者完全不审核这些事件（即既不审核成功也不审核失败）。如果启用成功审核，则每当任何用户成功访问指定了匹配SACL的Active Directory对象时，都必须记录审核条目。如果启用了失败审核，则每当任何用户尝试访问指定了匹配SACL的Active Directory对象失败时，都必须记录审核条目。 |
| AuditAccountLogon    | 一个安全设置，确定此计算机每次验证帐户凭据时操作系统是否必须进行审核。每当计算机验证其本地帐户之一的凭据时，就会生成帐户登录事件。凭据验证可以支持本地登录，或者对于域控制器(DC)上的Active Directory域帐户，可以支持登录到另一台计算机。本地帐户的审核事件必须记录在计算机的本地安全日志中。帐户注销不会生成可审核的事件。如果定义了此策略设置，管理员可以指定只审核成功、只审核失败、既审核成功也审核失败，或者完全不审核这些事件（即既不审核成功也不审核失败）。§ |
| AuditLogonEvents     | 一个安全设置，用于确定操作系统是否必须审核用户尝试登录或注销此计算机的每个实例。每当已登录用户帐户的登录会话终止时，都会生成注销事件。如果定义了此策略设置，管理员可以指定只审核成功、只审核失败、既审核成功也审核失败，或者完全不审核这些事件（即既不审核成功也不审核失败）。§ |
| AuditObjectAccess    | 一个安全设置，用于确定操作系统是否必须审核用户尝试访问指定了自己的SACL的非Active Directory对象的每个实例，如果访问请求的类型（如写、读或修改）和发出请求的帐户与SACL中的设置匹配。管理员可以指定只审核成功、只审核失败、成功和失败，或者完全不审核这些事件（即既不审核成功也不审核失败）。如果启用成功审核，则每当任何用户成功访问指定了匹配SACL的非Active Directory对象时，都必须记录审核条目。如果启用了失败审核，则每当任何用户尝试访问指定了匹配SACL的非Active Directory对象失败时，都必须记录审核条目。§ |
| AuditPolicyChange    | 一个安全设置，用于确定操作系统是否必须审核用户尝试更改用户权限分配策略、审核策略、帐户策略或信任策略的每个实例。管理员可以指定只审核成功、只审核失败、成功和失败，或者完全不审核这些事件（即既不审核成功也不审核失败）。如果启用成功审核，则当尝试对用户权限分配策略、审核策略或信任策略的更改成功时，必须记录审核条目。如果启用了失败审核，则当未被授权更改所请求的策略的帐户试图更改用户权限分配策略、审核策略或信任策略时，可能会记录审核条目。<4>§ |
| AuditPrivilegeUse    | 一个安全设置，用于确定操作系统是否必须审核用户尝试行使用户权限的每个实例。如果定义了此策略设置，管理员可以指定只审核成功、只审核失败、既审核成功也审核失败，或者完全不审核这些事件（即既不审核成功也不审核失败）。如果启用成功审核，则每次成功行使用户权限时都必须记录审核条目。如果启用了失败审核，则每次执行用户权限失败时，都必须记录审核条目，因为用户帐户没有分配给用户权限。§ |
| AuditProcessTracking | 一个安全设置，用于确定操作系统是否必须审核与进程相关的事件，如进程创建、进程终止、处理重复和间接对象访问。如果定义了此策略设置，管理员可以指定只审核成功、只审核失败、既审核成功也审核失败，或者完全不审核这些事件（即既不审核成功也不审核失败）。如果启用了成功审核，则每次操作系统执行这些与进程相关的活动之一时，都必须记录一个审核条目。如果启用了失败审核，则每次操作系统未能执行这些与进程相关的活动之一时，都可能会记录一个审核条目。<5>§ |
| AuditSystemEvents    | 确定操作系统是否必须审核下列任何事件的安全设置：§  试图更改系统时间。§  尝试启动或关闭安全系统。§  尝试加载可扩展身份验证组件。§  由于审计系统故障而造成的被审计事件的损失。§  安全日志大小超过可配置的警告阈值级别。如果定义了此策略设置，管理员可以指定只审核成功、只审核失败、既审核成功也审核失败，或者完全不审核这些事件（即既不审核成功也不审核失败）。如果启用了成功审核，则每次操作系统成功执行这些活动之一时，都必须记录一个审核条目。如果启用了失败审核，则每次操作系统尝试执行其中一个活动但失败时，都必须记录一个审核条目。§ |

下表提供了有效值的摘要。有关有效值的更多细节，请参见[MS-LSAD]第2.2.4.4节。

| **设定值** | **解释**                               |
| ---------- | -------------------------------------- |
| 0          | 指示此设置被设置为无。                 |
| 1          | 指示此设置设置为仅成功审核。           |
| 2          | 指示此设置仅设置为失败审核。           |
| 3          | 指示此设置被设置为成功审核和失败审核。 |
| 4          | 指示此设置被设置为无。                 |

### 2.2.5 注册表值

本节定义使管理员能够设置注册表项的设置。此类别中条目的语法必须如下所示。

```
Header = "[" HeaderValue "]" LineBreak
HeaderValue = "Registry Values"
Settings = Setting / Setting Settings
Setting = RegistryValueName "=" RegistryValueType "," RegistryValue
RegistryValueType = 1*DIGIT
RegistryValueName = KeyName / DQUOTE KeyName DQUOTE 
KeyName = Key / KeyName "\" Key 
Key = 1*IdCharacter 
IdCharacter = %x0020-0021 /  %x0023-005B / %x005D-007E
RegistryValue = String / QuotedString
```

下表为列出的每个参数提供了解释，并指定了有效值集。

**注所有数值都是十进制的，除非另有明确规定或前面有0x。**

| Setting key       | Explanation                                                  |
| ----------------- | ------------------------------------------------------------ |
| RegistryValueName | 必须是要设置的注册表值的完全限定名（如[MS-RRP]第3.1.1.1.1节所规定）。 |
| RegistryValueType | 注册表值的数据类型必须是下列值之一。（有关值类型的更多细节，请参见[MS-RRP]第3.1.1.5节。）§  值“1”：指示注册表值的数据类型为String。§  值“2”：指示注册表值的数据类型为展开字符串。§  值“3”：表示注册表值的数据类型为二进制。§  值“4”：表示注册表值的数据类型为DWORD。§  值“7”：指示注册表值的数据类型是multi_sz。虽然存在其他注册表类型，但此协议不支持它们。 |
| RegistryValue     | 要配置的值。此值的数据类型必须与RegistryValueType字段中指定的类型匹配。 |

### 2.2.6 特权权利

本节定义使管理员能够控制哪些帐户具有哪些特权的设置。此类别中条目的语法必须如下所示。

```
Header = "[" HeaderValue "]" LineBreak
HeaderValue = "Privilege Rights"
Settings = Setting / Setting Settings
Setting = RightName Wsp "=" Wsp SidList LineBreak
SidList = SidEnt / SidEnt Wsp "," Wsp SidList


RightName = "SeNetworkLogonRight" / "SeTcbPrivilege" 
      / "SeMachineAccountPrivilege" / "SeIncreaseQuotaPrivilege" 
      / "SeRemoteInteractiveLogonRight" / "SeBackupPrivilege" 
      / "SeChangeNotifyPrivilege" / "SeCreatePagefilePrivilege" 
      / "SeSystemtimePrivilege" / "SeCreateTokenPrivilege" 
      / "SeCreateGlobalPrivilege" / "SeCreatePermanentPrivilege" 
      / "SeDebugPrivilege" / "SeDenyNetworkLogonRight" 
      / "SeDenyBatchLogonRight" / "SeDenyServiceLogonRight" 
      / "SeDenyInteractiveLogonRight" 
      / "SeDenyRemoteInteractiveLogonRight" 
      / "SeEnableDelegationPrivilege" 
      / "SeRemoteShutdownPrivilege" / "SeAuditPrivilege" 
      / "SeImpersonatePrivilege" 
      / "SeIncreaseBasePriorityPrivilege" 
      / "SeLoadDriverPrivilege" / "SeLockMemoryPrivilege" 
      / "SeBatchLogonRight" / "SeServiceLogonRight" 
      / "SeInteractiveLogonRight" / "SeSecurityPrivilege" 
      / "SeSystemEnvironmentPrivilege" 
      / "SeManageVolumePrivilege" 
      / "SeProfileSingleProcessPrivilege" 
      / "SeSystemProfilePrivilege" / "SeUndockPrivilege" 
      / "SeAssignPrimaryTokenPrivilege" / "SeRestorePrivilege" 
      / "SeShutdownPrivilege" / "SeSyncAgentPrivilege" 
      / "SeTakeOwnershipPrivilege" / "SeTrustedCredManAccessPrivilege"
      / "SeTimeZonePrivilege" / "SeCreateSymbolicLinkPrivilege"
      / "SeIncreaseWorkingSetPrivilege" / "SeRelabelPrivilege"



SidEnt = %d42 SID / PRINCIPALNAMESTRING

; SID is defined in MS-DTYP section 2.4.2.1

PRINCIPALNAMESTRING = 1*20(ALPHANUM / %d32-33 / %d35-41 / %d45 / %d64 / %d94-96 / %d123 / %d125 / %d126)
```

有关每个权限设置的信息，请参见[MSDN-PRIVS]。

前面语法中的SID元素是帐户或组的安全标识符的字符串表示，必须符合[MS-DTYP]节2.4.2.1中指定的语法。

### 2.2.7 注册表项

本节定义使管理员能够指定如何保护客户端上的注册表项的设置。此类别中条目的ABNF语法必须如下所示。

```
Header = "[" HeaderValue "]" LineBreak
HeaderValue = "Registry Keys"
Settings = Setting / Setting Settings
Setting = RegistryKeyName "," PermPropagationMode "," 
          AclString LineBreak
RegistryKeyName = KeyPath / DQUOTE KeyPath DQUOTE 
KeyPath = Key / KeyPath "\" Key 
Key = 1*IdCharacter 
IdCharacter = %x0020-0021 / %x0023-005B / %x005D-007E
PermPropagationMode = DIGIT
AclString = SDDL/ DQUOTE SDDL DQUOTE
```

上面SDDL元素的ABNF规范可以在[MS-DTYP]第2.5.1.1节中找到。

下表提供了列出的每个参数的解释。

**注所有数值都是十进制的，除非另有明确规定，或者前面有0x。**

| **设置键**          | **解释**                                                     |
| ------------------- | ------------------------------------------------------------ |
| RegistryKeyName     | 必须保护的注册表项的全名。它必须是要设置的注册表值的完全限定名（如[MS-RRP]第3.1.1.1.1节所规定）。 |
| permpropagationmode | 控制权限是否传播以及如何传播。它必须是下列值之一：§  值“0”：必须将可继承的权限传播到所有子键。§  值“1”：必须用可继承的权限替换所有子键上的现有权限。§  值“2”：不允许替换对此密钥的权限。 |
| ACLString           | 必须应用于注册表项的安全描述符。安全描述符必须符合[MS-DTYP]节2.5.1.1中指定的语法。 |

### 2.2.8 服务常规设置

本节定义启用在客户端计算机上运行的服务上的启动类型和自主访问控制列表配置的设置。此类别中条目的语法必须如下所示。

```
Header = "[" HeaderValue "]" LineBreak
HeaderValue = "Service General Setting"
Settings = Setting / Setting Settings
Setting = ServiceName ","  StartupMode "," AclString LineBreak
ServiceName = 1*256IdCharacter / DQUOTE 1*256IdCharacter DQUOTE
IdCharacter = ALPHANUM/ %d33 / %d35-43 / %d45-46 / %d58-64 / %d91 / %d93-96 / %d123-126
StartupMode = DIGIT
AclString = SDDL / DQUOTE SDDL DQUOTE
```

上面SDDL元素的ABNF规范可以在[MS-DTYP]第2.5.1.1节中找到。

下表解释了ServiceName、StartupMode和AclString字段。

**注所有数值都是十进制的，除非另有明确规定，或者前面有0x。**



| Setting key | Explanation                                                  |
| ----------- | ------------------------------------------------------------ |
| ServiceName | 一个字符串，表示必须配置的服务的逻辑服务名。它必须是ABNF中指定的1到256个字符的字母数字字符串。 |
| StartupMode | 进程的启动模式，必须是以下值之一（以下解释是摘要；有关详细信息，请参阅[MS-SCMR]节2.2.15):§  值“2”：表示启动模式为自动。§  值“3”：表示启动模式为手动。§  值“4”：表示禁用启动模式。 |
| AclString   | 一个安全描述符，如果存在，则必须应用于服务。安全描述符必须符合[MS-DTYP]节2.5.1.1中指定的语法。 |

### 2.2.9 文件安全

本节定义如何使管理员能够指定如何保护客户端上的文件和目录。此类别中条目的ABNF语法必须如下所示。

```
Header = "[" HeaderValue "]" LineBreak
HeaderValue = "File Security"
Settings = Setting / Setting Settings
Setting = FileOrDirectoryPath ","  PermPropagationMode 
          "," AclString LineBreak
FileOrDirectoryPath = String / QuotedString
PermPropagationMode = DIGIT
AclString = SDDL / DQUOTE SDDL DQUOTE 
```

上面SDDL元素的ABNF规范可以在[MS-DTYP]第2.5.1.1节中找到。

下表解释了列出的每个设置。

**注所有数值都是十进制的，除非另有明确规定，或者前面有0x。**

| Setting key         | Explanation                                                  |
| ------------------- | ------------------------------------------------------------ |
| FileOrDirectoryPath | 必须保护的文件或目录的路径。它必须是字符串或ABNF中指定的双引号字符之间的字符串。 |
| PermPropagationMode | 控制权限是否传播以及如何传播。它必须是下列值之一：§  值“0”：必须将可继承权限传播到所有子文件夹和文件。§  值“1”：必须用可继承的权限替换所有子文件夹和文件上的现有权限。§  值“2”：不允许替换此文件或文件夹上的权限。 |
| AclString           | 必须应用于文件或目录的安全描述符。安全描述符必须符合[MS-DTYP]节2.5.1.1中指定的语法。 |

### 2.2.10 组成员资格

本节定义使管理员能够控制各种组的成员资格的设置。此类别中条目的ABNF语法必须如下所示。

```
Header = "[" HeaderValue "]" LineBreak
HeaderValue = "Group Membership"
Settings = Setting / Setting Settings
Setting = Key Wsp "=" Wsp ValueList LineBreak
Key = GroupNameMembers / GroupNameMemberof 
GroupNameMembers = (GroupName / (%d42 SID)) "__Members"
GroupNameMemberof = (GroupName / (%d42 SID)) "__Memberof"
GroupName = GROUPNAMESTRING
ValueList = Value / Value Wsp "," Wsp ValueList
Value = %d42 SID / GROUPNAMESTRING



GROUPNAMESTRING = 1*256(ALPHANUM / %d32-33 / %d35-41 / %d45 / %d64 / %d94-96 / %d123 / %d125 / %d126)
```

前面语法中的SID元素在[MS-DTYP]第2.4.2.1节中有其ABNF规范。

请注意，在实际的安全策略中，前面的“GroupName”设置必须替换为必须配置其他组中成员或成员资格的组的实际名称。有关更多信息，请参见4.3节中的示例。

下表解释了列出的每个设置。

| Setting key       | Explanation                                                  |
| ----------------- | ------------------------------------------------------------ |
| GroupNameMembers  | 表示已向其追加字符串“__members”的组名的字符串。指定组的成员资格将设置为ValueList。字符串必须是这里指定的ABNF中定义的字母数字字符串。 |
| GroupNameMemberof | 表示已向其追加字符串“__memberof”的组名的字符串。指定的组将成为ValueList中每个组的成员。字符串必须是这里指定的ABNF中定义的字母数字字符串。 |
| Value             | 对于GroupNameMembers，指该组必须包含的用户和组的SID或名称。对于GroupNameMemberof，表示该组必须是其成员的SID或组名。每个值必须符合[MS-DTYP]节2.4.2.1中指定的SID语法，或者符合此处指定的GROUPNAMESTRING ABNF语法。 |

### 2.2.11 用户帐户控制

本节定义使管理员能够配置用户帐户控制功能的行为的设置。有关如何定义<6>中列出的设置的详细信息，请参阅第2.2.5和2.2.7节。

#### 2.2.11.1 过滤管理员凭证

FilterAdministratorToken

**Key:** SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System

**Value:** "FilterAdministratorToken"

**Type:** REG_DWORD

**Data：这必须是下表中的值。**

| Value      | Meaning                                                      |
| ---------- | ------------------------------------------------------------ |
| 0x00000000 | 只有内置的管理员帐户（RID 500）应该被置于完全令牌模式。<7>   |
| 0x00000001 | 只有内置的管理员帐户(RID500)被置于管理审批模式。执行管理任务时需要批准。 |



#### 2.2.11.2 同意提示行为管理

ConsentPromptBehaviorAdmin

**Key:** SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System

**Value:** "ConsentPromptBehaviorAdmin"

**Type:** REG_DWORD

**Data:** This MUST be a value in the following table.

| Value      | Meaning                                                      |
| ---------- | ------------------------------------------------------------ |
| 0x00000000 | 此选项允许同意管理员在没有同意或凭据的情况下执行需要提升的操作。 |
| 0x00000001 | 当操作需要提升权限时，此选项提示同意管理员输入其用户名和密码（或其他有效管理员）。此操作发生在安全桌面上。 |
| 0x00000002 | 此选项提示管理员在管理审批模式下选择“允许”或“拒绝”需要提升权限的操作。如果同意管理员选择许可，则操作将以最高的可用权限继续进行。“提示同意”消除了要求用户输入姓名和密码以执行特权任务的不便。此操作发生在安全桌面上。 |
| 0x00000003 | 当操作需要提升权限时，此选项提示同意管理员输入他或她的用户名和密码（或其他有效管理员的用户名和密码）。 |
| 0x00000004 | 这会提示管理员在管理审批模式下选择“允许”或“拒绝”需要提升权限的操作。如果同意管理员选择许可，则操作将以最高的可用权限继续进行。“提示同意”消除了要求用户输入姓名和密码以执行特权任务的不便。 |
| 0x00000005 | 此选项是默认值。它用于提示管理员在管理审批模式下为需要提升任何非Windows二进制文件权限的操作选择“允许”或“拒绝”。如果同意管理员选择许可，则操作将以最高的可用权限继续进行。此操作将在安全桌面上进行。<8> |

#### 2.2.11.3 同意提示行为用户

**Key:** SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System

**Value:** "ConsentPromptBehaviorUser"

**Type:** REG_DWORD

**Data:** This MUST be a value in the following table.

| Value      | Meaning                                                      |
| ---------- | ------------------------------------------------------------ |
| 0x00000000 | 应设置此选项，以确保任何需要提升权限的操作都将以标准用户身份失败。 |
| 0x00000001 | 应设置此选项，以确保需要执行需要提升权限的操作的标准用户将被提示输入管理用户名和密码。如果用户输入有效凭据，则操作将以适用的权限继续。 |

#### 2.2.11.4 启用安装程序检测

**Key:** SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System

**Value:** "EnableInstallerDetection"

**Type:** REG_DWORD

**Data:** This MUST be a value in the following table.

| Value      | Meaning                                                  |
| ---------- | -------------------------------------------------------- |
| 0x00000000 | 此选项应用于禁用对需要提升才能安装的安装包的自动检测。   |
| 0x00000001 | 此选项应用于启发式地检测需要提升权限才能安装的应用程序。 |

#### 2.2.11.5 验证管理代码签名

**Key:** SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System

**Value:** "ValidateAdminCodeSignatures"

**Type:**  REG_DWORD

**Data:** This MUST be a value in the following table.

| Value      | Meaning                                            |
| ---------- | -------------------------------------------------- |
| 0x00000000 | 不要在需要提升权限的交互式应用程序上强制加密签名。 |
| 0x00000001 | 在任何请求提升权限的交互式应用程序上强制加密签名。 |

#### 2.2.11.6 启用LUA

**Key:** SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System

**Value:** "EnableLUA"

**Type:** REG_DWORD

**Data:** This MUST be a value in the following table.

| Value      | Meaning                                                      |
| ---------- | ------------------------------------------------------------ |
| 0x00000000 | 禁用此策略将禁用“管理员审批模式下的管理员”用户类型。         |
| 0x00000001 | 此策略启用“管理员审批模式下的管理员”用户类型，同时还启用所有其他用户帐户控制(UAC)策略。 |

#### 2.2.11.7 提示安全桌面

**Key:** SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System

**Value:** "PromptOnSecureDesktop"

**Type:** REG_DWORD

**Data:** This MUST be a value in the following table.

| Value      | Meaning                                                      |
| ---------- | ------------------------------------------------------------ |
| 0x00000000 | 禁用此策略将禁用安全桌面提示。所有凭据或同意提示都将出现在交互式用户的桌面上。 |
| 0x00000001 | 此策略将强制所有UAC提示发生在用户的安全桌面上。              |

#### 2.2.11.8 支持虚拟化

**Key:** SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System

**Value:** "EnableVirtualization"

**Type:** REG_DWORD

**Data:** This MUST be a value in the following table.

| Value      | Meaning                                                      |
| ---------- | ------------------------------------------------------------ |
| 0x00000000 | 禁用交互式进程的数据重定向。                                 |
| 0x00000001 | 此策略允许将传统应用程序文件和注册表的写入重定向到用户可写的数据位置，这些写入通常作为标准用户会失败。此设置缓解了应用程序历史上以管理员身份运行并将运行时应用程序数据写回只能由管理员写入的位置的问题。 |

# 3. 协议细节

## 3.1 管理端插件详情

管理端插件参与安全策略的创作和分配步骤，如第2节所述。安全策略必须使用.inf格式存储为文本文件，如第2.2节所述。安全策略必须存储在通过使用SMB可通过网络访问的位置（例如网络共享）中。

### 3.1.1 抽象数据模型

管理端插件不维护任何状态。如第2.2节所述，它将所有设置加载到内存中的<name of setting，value of setting>pair中。

当使用管理UI时，管理端插件用于与组策略框架交互，如[MS-GPOL]中所指定的那样。它根据抽象数据模型确定所需安全策略的物理位置，根据需要创建新策略或打开现有策略，并将其显示给管理员。管理员修改策略后，更改会在所需位置传回策略。

### 3.1.2 定时器

一个都没有。

### 3.1.3 初始化

当管理端插件启动时，它必须从[MS-GPOL]第2.2.4节中指定的组策略：核心协议中获得一个限定范围的GPO路径，并执行第3.1.5.1节Load Policy中描述的处理。

### 3.1.4 高层触发事件

较高层触发事件发生在以下情况：

§  管理员加载组策略：安全协议扩展GPO.inf文件。参见3.1.5.1节，加载策略。

§  管理员更改任何组策略：安全协议扩展设置值。请参见第3.1.5.2节，更新策略。

§  管理员删除任何组策略：安全协议扩展设置值。参见第3.1.5.3节，删除设置值。

### 3.1.5 消息处理事件和排序规则

管理端插件从远程存储位置读取特定于扩展的数据，如第3.2.5节步骤1-3所述。管理端插件将该信息传递给特定于实现的工具，该工具提供图形用户界面以向管理员显示当前设置。

如果管理员对现有配置做了任何更改，管理端插件会将特定于扩展的配置数据写入远程存储位置，如3.1.5.2Update Policy部分所述。

在每次创建、修改或删除影响SYSVOL上的gpttmpl.inf文件之后，管理工具必须调用组策略扩展更新任务([MS-GPOL]节3.3.4.4)。

#### 3.1.5.1 加载策略

当管理员启动管理端插件时，将发生加载策略事件。当管理端插件启动时，它必须从[MS-GPOL]第2.2.4节中指定的组策略：核心协议中获得一个限定范围的GPO路径。插件必须尝试从“<GPO Path>\machine\microsoft\Windows NT\secedit\”中检索任何现有的gpttmpl.inf文件，其中“<GPO Path>”是GPO路径。必须执行文件读取，如第3.2.5节步骤1-3所述。如果读取文件的尝试失败，则必须记录错误并停止处理。

#### 3.1.5.2 更新策略

若要使用管理工具插件更新GPO中的策略设置，必须使用更新策略消息更新组策略服务器上该GPO的状态。这必须通过以下消息序列完成：

\1.     **从客户端打开到服务器的****SMB****文件：**

插件必须从组策略：核心协议中获得GPO路径，如[MS-GPOL]第2.2.4节中指定的，并尝试将gpttmpl.inf文件写入以下位置：“<GPO path>\machine\microsoft\Windows NT\secedit\”，其中“<GPO path>”是GPO路径。

打开的SMB文件必须请求写权限，如果该文件不存在，则请求创建该文件。

如果打开的请求返回失败状态，则必须终止组策略：安全协议扩展序列。

\2.     SMB文件写入顺序：

管理外接程序必须执行一系列SMB文件写入操作，才能用新设置覆盖打开的文件的内容。这些写操作必须继续进行，直到整个文件被写入或遇到错误为止。

如果遇到错误，则必须终止协议序列。

\3.     文件关闭：

然后该工具必须发出SMB文件关闭操作。

\4.     管理工具调用组策略扩展更新任务([MS-GPOL]节3.3.4.4)。

文件名和路径应视为不区分大小写。如果写入失败，管理端插件必须向用户显示操作失败。

#### 3.1.5.3 删除设置值

当管理员移除设置值时，将发生删除设置值事件。当删除设置值时，将从内存中删除该设置，并执行3.1.5.2节更新策略中描述的处理。

### 3.1.6 定时器事件

无

### 3.1.7 其他本地活动

无

## 3.2 客户端插件详细信息

客户端插件与组策略框架交互，如[MS-GPOL]第3.2节所述。此插件必须接收安全策略，并根据管理员的指示应用该策略。

### 3.2.1 抽象数据模型

本节定义了一个可能的数据组织的概念模型，实现维护该模型以参与该协议。提供所描述的组织是为了解释协议如何行为。只要实现的外部行为与本文档中描述的一致，本文档并没有强制要求实现遵守此模型。

该协议设置在其他协议文档中定义的共享抽象数据模型变量。每个共享变量的规范定义在相应的文档中给出，如下所示：

此协议设置从[MS-LSAD]共享的以下抽象数据变量：

§  MaxServiceTicketAge ([MS-LSAD] section 3.1.1.1)

§  MaxTicketAge ([MS-LSAD] section 3.1.1.1)

§  MaxRenewAge ([MS-LSAD] section 3.1.1.1)

§  MaxClockSkew ([MS-LSAD] section 3.1.1.1)

§  AuthenticationOptions ([MS-LSAD] section 3.1.1.1)

This protocol sets the following abstract data variables shared from [MS-EVEN]:

§  MaxSize ([MS-EVEN] section 3.1.1.2)

§  Retention ([MS-EVEN] section 3.1.1.2)

§  RestrictGuestAccess ([MS-EVEN] section 3.1.1.2)

### 3.2.2 定时器

无

### 3.2.3 初始化

当Group Policy framework使用一个或多个适用GPO的列表调用时，客户端插件必须执行以下操作：定位这些GPO中的所有物理安全策略，将策略复制到本地计算机，读取策略，并按照第3.2.5节中的规定应用它们。

查找物理安全策略文件必须使用组策略：核心协议（如[MS-GPOL]第3.2.5.1节所述）和LDAP搜索协议（如[RFC2251]第4.5节所述）。应该使用[MS-SMB2]中指定的服务器消息块(SMB)版本2和3协议中的标准复制和读取函数来复制和读取策略文件<9>。

### 3.2.4 高层触发事件

客户端插件实现一个更高层的触发事件：进程组策略。

#### 3.2.4.1 进程组策略

客户端插件实现了[MS-GPOL]第3.2.4.1节中指定的进程组策略抽象事件接口。客户端插件不使用已删除的GPO列表、SessionFlags或UserToken参数。当事件被触发时，客户端插件必须采取3.2.5节中描述的操作。

### 3.2.5 消息处理事件和排序规则

当需要处理适用的GPO时，客户端插件GPO必须由组策略框架触发。当发生这样的事件时，客户端插件将采取适当的操作。

当触发时，客户端插件需要一个适用的GPO列表。然后，它必须遍历此列表，并为每个GPO查找和检索包含的安全策略。

检索到所有安全策略后，必须打开每个策略，并提取和应用包含的安全策略设置。



当策略应用程序步骤完成时，必须按照[MS-GPOL]中的规定，向组策略框架返回适当的错误代码，以指示操作的成功或失败。

组策略：核心协议必须为其标识为包含组策略：安全协议扩展协议设置的每个GPO调用客户端插件。对于每一个GPO，必须从组策略：核心协议服务器复制一个格式（如2.2节所述）的文件。如果任何文件无法读取，客户端插件必须忽略故障，并继续为其他GPO复制文件。

组策略：核心协议客户端必须按照[MS-GPOL]第3.2.5.1节的规定，确定必须对其执行本协议的GPO列表。

对于每个GPO，客户端插件必须执行以下操作：

\1.     在<GPO path>\machine\microsoft\windows nt\secedit\gpttmpl.inf指定的文件上执行SMB文件打开（其中<GPO path>是GPO中的GPO路径）。如果在打开文件时遇到错误，则必须向客户端计算机上的组策略系统（如[MS-GPOL]节2.2.7中所述）指示错误，并且必须停止处理。

\2.     执行一系列SMB文件读取，以读取打开的文件的全部内容，直到整个文件被读取或发生读取错误。如果在读取文件时遇到错误，则必须向客户端计算机上的组策略系统（如[MS-GPOL]中所指定）指示错误，并且必须中止处理。

\3.     执行SMB文件关闭以关闭该文件。

当按照前面的步骤使用SMB打开或读取文件时，客户端插件应该按照[MS-SMB]节2.2.2.4或[MS-SMB2]中的规定处理SMB协议返回的错误代码。

客户端插件必须按照2.2节中指定的格式解析文件。如果文件不符合该格式，则必须忽略整个配置操作。如果文件符合该格式，则必须将设置应用于系统上相应的安全参数。

在应用安全策略时，几个组策略：安全协议扩展设置名对应于抽象数据模型共享变量，其他文档中提供了该变量的规范定义（参见第3.2.1节）下表中提供了设置名称和相应的抽象数据模型共享变量。对于从GPO.inf文件读取的每个此类设置，客户端插件必须将表右侧列中的ADM变量的值设置为左侧列中设置的值。



#### 3.2.5.1 密码策略

通过执行以下操作设置密码策略：

\1.     如果settings键的设置值超出2.2.1.1节中表中相应解释列中指定的有效值范围，则客户端应退出密码策略处理并记录错误。

\2.     执行与本地调用SamrQueryInformationDomain([MS-SAMR]节3.1.5.5.2)一致的外部行为，以获得现有的域密码信息。

§  必须将DomainHandle设置为通过执行与本地调用SamrOpenDomain一致的外部行为打开的域句柄([MS-SAMR]节3.1.5.1.5)，以获得当前计算机的域句柄。

§  必须将DomainInformationClass设置为DomainPasswordInformation。

§  PSAMPR_DOMAIN_INFO_BUFFER必须是指向PSAMPR_DOMAIN_INFO_BUFFER的指针，该指针包含足够包含DOMAIN_PASSWORD_INFORMATION结构的已分配内存。

\3.     调用SamrSetInformationDomain([MS-SAMR]节3.1.5.6.1)。

§  必须将DomainHandle设置为通过执行与本地调用SamrOpenDomain一致的外部行为打开的域句柄([MS-SAMR]节3.1.5.1.5)，以获得当前计算机的域句柄。

§  必须将DomainInformationClass设置为DomainPasswordInformation。

§  DomainInformation必须是包含DOMAIN_PASSWORD_INFORMATION结构的PSAMPR_DOMAIN_INFO_BUFFER。客户端插件必须根据以下规则中的映射，将GPO inf文件中指定的每个密码策略值设置为DOMAIN_PASSWORD_INFORMATION结构成员。

对于MinimumPasswordLength、PasswordComputition、ClearTextPassword和PasswordHistorySize设置，客户端管理单元必须将GPO inf文件中的设置名称映射到下表左侧列中的值之一，并将相应右侧列中标识的DOMAIN_PASSWORD_INFORMATION结构成员的值设置为该设置值。对于PasswordComplements和ClearTextPassword设置，如果GPO inf文件中的设置值为“true”，则客户端插件必须将右侧列中标识的DOMAIN_PASSWORD_INFORMATION结构成员的值设置为右侧列中提供的值。

| Group Policy: Security Protocol Extension | DOMAIN_PASSWORD_INFORMATION 的成员                           |
| ----------------------------------------- | ------------------------------------------------------------ |
| MinimumPasswordLength                     | MinPasswordLength                                            |
| PasswordComplexity                        | PasswordProperties bit DOMAIN_PASSWORD_COMPLEX (0x00000001)  |
| ClearTextPassword                         | PasswordProperties bit DOMAIN_PASSWORD_STORE_CLEARTEXT (0x00000010) |
| PasswordHistorySize                       | PasswordHistoryLength                                        |

对于MaximumPasswordAge设置，客户端管理单元必须将GPO inf文件中的设置值映射到下表左侧列中的值之一，并将DOMAIN_PASSWORD_INFORMATION结构MaxPasswordAge成员设置为下表相应右侧列中指定的转换所产生的值。

| MaximumPasswordAge value | DOMAIN_PASSWORD_INFORMATION MaxPasswordAge member value |
| ------------------------ | ------------------------------------------------------- |
| -1                       | 0x8000000000000000                                      |
| X (any value 1 to 999)   | -1*X*24*3600 * 10000000                                 |

对于MinimumPasswordAge设置，客户端管理单元必须将DOMAIN_PASSWORD_INFORMATION结构MinPasswordAge成员设置为下表右侧列中指定的转换所产生的值。

| MinimumPasswordAge value | DOMAIN_PASSWORD_INFORMATION MinPasswordAge member value |
| ------------------------ | ------------------------------------------------------- |
| X (any value 0 to 999)   | -1*X*24*3600 * 10000000                                 |

#### 3.2.5.2 帐户锁定策略

通过执行以下操作设置帐户锁定策略：

如果GPO inf文件中的密钥名称是“lockoutbadcount”、“resetlockoutcount”或“lockoutduration”：

\1.     执行与本地调用SamrQueryInformationDomain([MS-SAMR]节3.1.5.5.2)一致的外部行为，以获得现有的域帐户锁定信息。

§  必须将DomainHandle设置为通过执行与本地调用SamrOpenDomain一致的外部行为打开的域句柄([MS-SAMR]节3.1.5.1.5)，以获得当前计算机的域句柄。

§  必须将DomainInformationClass设置为DomainLockOutInformation。

§  PSAMPR_DOMAIN_INFO_BUFFER必须是指向PSAMPR_DOMAIN_INFO_BUFFER的指针，该指针包含足够包含SAMPR_DOMAIN_LOCKOUT_INFORMATION结构的已分配内存([MS-SAMR]节2.2.3.15)。

\2.     执行与本地调用SamrSetInformationDomain一致的外部行为([MS-SAMR]第3.1.5.6.1节）。

§  必须将DomainHandle设置为通过执行与本地调用SamrOpenDomain一致的外部行为打开的域句柄([MS-SAMR]节3.1.5.1.5)，以获得当前计算机的域句柄。

§  必须将DomainInformationClass设置为DomainLockOutInformation。

§  DomainInformation必须是包含sampr_domain_info_buffer结构的psampr_domain_lockout_information。客户端插件必须根据以下规则中的映射，将GPO inf文件中指定的每个帐户锁定策略值设置为SAMPR_DOMAIN_LOCKOUT_INFORMATION结构成员：

对于LockoutBadCount设置，客户端管理单元必须将SAMPR_DOMAIN_LOCKOUT_INFORMATION结构LockoutThreshold成员设置为设置值。

对于ResetLockCount设置，客户端管理单元必须将SAMPR_DOMAIN_LOCKOUT_INFORMATION结构LockoutObservationWindow成员设置为下表右侧列中指定的转换所产生的值。

| ResetLockCount value | DOMAIN_LOCKOUT_INFORMATION LockoutObservationWindow member value |
| -------------------- | ------------------------------------------------------------ |
| X (any value)        | -1*X*60 * 10000000                                           |

对于LockoutDuration设置，客户端管理单元必须将GPO inf文件中的设置值映射到下表左侧列中的值之一，并将SAMPR_DOMAIN_LOCKOUT_INFORMATION结构LockoutDuration成员设置为下表相应右侧列中指定的转换所产生的值。

| LockoutDuration value持续时间值 | DOMAIN_LOCKOUT_INFORMATION LockoutDuration member value |
| ------------------------------- | ------------------------------------------------------- |
| -1                              | 0x8000000000000000                                      |
| X (any value 1 to 99,999)       | -1*X*60 * 10000000                                      |

如果密钥名称为“forcelogoffwhenhourexpire”：

\1.     执行与本地调用SamrQueryInformationDomain([MS-SAMR]节3.1.5.5.2)一致的外部行为，以获得现有的域帐户注销信息。

§  必须将DomainHandle设置为通过执行与本地调用SamrOpenDomain一致的外部行为打开的域句柄([MS-SAMR]节3.1.5.1.5)，以获得当前计算机的域句柄。

§  必须将DomainInformationClass设置为DomainLogoFFInformation。

§  PSAMPR_DOMAIN_INFO_BUFFER必须是指向PSAMPR_DOMAIN_INFO_BUFFER的指针，该指针包含足够包含DOMAIN_LOGOFF_INFORMATION([MS-SAMR]节2.2.3.6)结构的已分配内存。

\2.     执行与本地调用SamrSetInformationDomain一致的外部行为([MS-SAMR]第3.1.5.6.1节）。

§  必须将DomainHandle设置为通过执行与本地调用SamrOpenDomain一致的外部行为打开的域句柄([MS-SAMR]节3.1.5.1.5)，以获得当前计算机的域句柄。

§  必须将DomainInformationClass设置为DomainLogoFFInformation。

DomainInformation必须是包含DOMAIN_LOGOFF_INFORMATION结构的PSAMPR_DOMAIN_INFO_BUFFER。客户端插件必须将FORCELOGOFFWHOUREXPIRE设置值与下表左侧列中的值之一匹配，并将DOMAIN_LOGOFF_INFORMATION结构成员设置为下表右侧列中的相应值。

| ForceLogoffWhenHourExpire value按小时为单位过期时强制注销值 | DOMAIN_LOGOFF_INFORMATION ForceLogoff member value |
| ----------------------------------------------------------- | -------------------------------------------------- |
| 1                                                           | 0                                                  |
| 0                                                           | 0x8000000000000000                                 |

#### 3.2.5.3 本地帐户策略

通过执行以下操作来设置本地帐户策略：

如果键值是2.2.1.3节中表中列出的有效值以外的任何值，则应记录错误，客户端应停止处理本地帐户策略并记录错误。

如果“value”元素的值对于2.2.1.3节中表中指定的相应键值无效，则应记录错误，客户端必须停止处理本地帐户策略。

如果密钥名称为“LSAAnonymousNameLookup”：

\1.     执行与本地调用LsarQuerySecurityObject一致的外部行为([MS-LSAD]第3.1.4.9.1节）。

§  必须将PolicyHandle设置为通过执行与本地调用LsarOpenPolicy([MS-LSAD]节3.1.4.4.2)一致的外部行为打开的策略句柄，并且将DesiredAccess设置为maximum_alloved([MS-LSAD]节2.2.1.1.1)。

§  必须将SecurityInformation设置为DACL_SECURITY_INFORMATION([MS-LSAD]section 2.2.1.3)。

§  必须将SecurityDescriptor设置为PLSAR_SR_SECURITY_DESCRIPTOR变量的地址。

\2.     执行与本地调用LSarsetSecurityObject一致的外部行为。

§  必须将PolicyHandle设置为通过执行与本地调用LsarOpenPolicy([MS-LSAD]节3.1.4.4.2)一致的外部行为打开的策略句柄，并且将DesiredAccess设置为maximum_alloved([MS-LSAD]节2.2.1.1.1)。

§  必须将SecurityInformation设置为DACL_SECURITY_INFORMATION([MS-LSAD]section 2.2.1.3)。

§  SecurityDescriptor必须是一个指向LSAR_SR_SECURITY_DESCRIPTOR结构的指针，在该结构中，DACL([MS-DTYP]节2.4.5)必须被设置为步骤1中从LsarQuerySecurityObject方法接收的DACL，其中添加了一个ACCESS_ALLOWED_ACE([MS-DTYP]节2.4.4.2)授予匿名SID([MS-DTYP]节2.4.2.4)一个设置为POLICY_LOOKUP_NAMES([MS-LSAD]节2.2.1.1.2)的访问掩码。

如果密钥名称为“EnableAdminAccount”：

\1.     执行与本地调用SamrQueryInformationUser一致的外部行为([MS-SAMR]节3.1.5.5.6)。

§  UserHandle必须设置为通过执行与本地调用SamrOpenUser一致的外部行为([MS-SAMR]section 3.1.5.1.9)获得的用户句柄，使用以下参数：

§  Maximum_Allowed的DesiredAccess参数。

§  DOMAIN_USER_RID_ADMIN的UserId参数([MS-SAMR]节2.2.1.14)。

§  DomainHandle参数，设置为当前计算机的域的句柄，通过执行与本地调用SamrOpenDomain一致的外部行为([MS-SAMR]节3.1.5.1.5)获得。

§  必须将UserInformationClass设置为UserControlInformation([MS-SAMR]section 2.2.6.28)。

§  缓冲区必须设置为足够大的内存缓冲区的地址，以包含SAMPR_USER_INFO_BUFFER结构([MS-SAMR]节2.2.6.29)。

\2.     执行与本地调用SamrSetInformationUser一致的外部行为([MS-SAMR]第3.1.5.6.5节）。

§  UserHandle必须设置为通过执行与本地调用SamrOpenUser一致的外部行为([MS-SAMR]section 3.1.5.1.9)获得的用户句柄，使用以下参数：

§  Maximum_Allowed的DesiredAccess参数。

§  DOMAIN_USER_RID_ADMIN的UserId参数([MS-SAMR]节2.2.1.14)。

§  DomainHandle参数，设置为当前计算机的域的句柄，通过执行与本地调用SamrOpenDomain一致的外部行为([MS-SAMR]节3.1.5.1.5)获得。

§  必须将UserInformationClass设置为UserControlInformation([MS-SAMR]section 2.2.6.28)。

缓冲区必须设置为SAMPR_USER_INFO_BUFFER结构的地址，该结构的控制成员变量根据下表设置

| EnableAdminAccount setting value | SAMPR_USER_INFO_BUFFER Control member value                  |
| -------------------------------- | ------------------------------------------------------------ |
| 1 (Enable Admin Account)         | 在步骤1和0xFFFFFFFE中接收的控制值的按位AND                   |
| 0 (Disable Admin Account)        | 在步骤1和USER_ACCOUNT_DISABLED([MS-SAMR]节3.1.5.14.2)中接收的控制值的按位OR。 |

如果密钥名称为“EnableGuestAccount”：

\1.     执行与本地调用SamrQueryInformationUser一致的外部行为([MS-SAMR]节3.1.5.5.6)。

§  UserHandle必须设置为通过执行与本地调用SamrOpenUser一致的外部行为([MS-SAMR]section 3.1.5.1.9)获得的用户句柄，使用以下参数：

§  Maximum_Allowed的DesiredAccess参数。

§  DOMAIN_USER_RID_GUEST([MS-SAMR]节2.2.1.14)的UserId参数。

§  DomainHandle参数，设置为当前计算机的域的句柄，通过执行与本地调用SamrOpenDomain一致的外部行为([MS-SAMR]节3.1.5.1.5)获得。

§  必须将UserInformationClass设置为UserControlInformation([MS-SAMR]section 2.2.6.28)。

§  缓冲区必须设置为足够大的内存缓冲区的地址，以包含SAMPR_USER_INFO_BUFFER结构([MS-SAMR]节2.2.6.29)。

\2.     执行与本地调用SamrSetInformationUser一致的外部行为([MS-SAMR]第3.1.5.6.5节）。

§  UserHandle必须设置为通过执行与本地调用SamrOpenUser一致的外部行为([MS-SAMR]section 3.1.5.1.9)获得的用户句柄，使用以下参数：

§  Maximum_Allowed的DesiredAccess参数。

§  DOMAIN_USER_RID_GUEST([MS-SAMR]节2.2.1.14)的UserId参数。

§  DomainHandle参数，设置为当前计算机的域的句柄，通过执行与本地调用SamrOpenDomain一致的外部行为([MS-SAMR]节3.1.5.1.5)获得。

§  必须将UserInformationClass设置为UserControlInformation([MS-SAMR]section 2.2.6.28)。

§  缓冲区必须设置为SAMPR_USER_INFO_BUFFER结构的地址，该结构的控制成员变量根据下表设置。

| EnableGuestAccount setting value | SAMPR_USER_INFO_BUFFER Control member value                  |
| -------------------------------- | ------------------------------------------------------------ |
| 1 (Enable Guest Account)         | 在步骤1和0xFFFFFFFE中接收的控制值的按位AND                   |
| 0 (Disable Guest Account)        | 在步骤1和USER_ACCOUNT_DISABLED中接收的控制值的按位或([MS-SAMR]节3.1.5.14.2) |

如果密钥名称为“newadministratorname”：

执行与本地调用SamrSetInformationUser一致的外部行为([MS-SAMR]第3.1.5.6.5节）。如果SamrSetInformationUser返回错误，则组策略：安全协议扩展客户端必须停止处理本地帐户策略并记录错误。

§  UserHandle必须设置为通过执行与本地调用SamrOpenUser([MS-SAMR]section 3.1.5.1.9)一致的外部行为获得的用户句柄，参数值如下：

§  Maximum_Allowed的DesiredAccess参数。

§  DOMAIN_USER_RID_ADMIN的UserId参数([MS-SAMR]节2.2.1.14)。

§  DomainHandle参数，设置为当前计算机的域的句柄，通过执行与本地调用SamrOpenDomain一致的外部行为([MS-SAMR]节3.1.5.1.5)获得。

§  必须将UserInformationClass设置为UserNameInformation([MS-SAMR]section 2.2.6.28)。

§  缓冲区必须设置为SAMPR_USER_NAME_INFORMATION结构的地址，该结构的UserName成员变量设置为NewAdministratorName设置的值。

如果密钥名称为“NewGuestName”：

执行与本地调用SamrSetInformationUser一致的外部行为([MS-SAMR]第3.1.5.6.5节）。如果SamrSetInformationUser返回错误，GPSB客户端必须停止处理本地帐户策略并记录错误。

§  UserHandle必须设置为通过执行与本地调用SamrOpenUser([MS-SAMR]section 3.1.5.1.9)一致的外部行为获得的用户句柄，参数值如下：

§  Maximum_Allowed的DesiredAccess参数。

§  DOMAIN_USER_RID_GUEST([MS-SAMR]节2.2.1.14)的UserId参数。

§  DomainHandle参数，设置为当前计算机的域的句柄，通过执行与本地调用SamrOpenDomain一致的外部行为([MS-SAMR]节3.1.5.1.5)获得。

§  必须将UserInformationClass设置为UserNameInformation([MS-SAMR]section 2.2.6.28)。

§  缓冲区必须设置为SAMPR_USER_NAME_INFORMATION结构的地址，该结构的UserName成员变量设置为NewGuestName设置的值。





#### 3.2.5.4 Kerberos策略

如果键值是2.2.2节中表中列出的有效值以外的任何值，客户端必须停止处理Kerberos策略设置并记录错误。

必须通过执行与本地调用LsarQueryDomainInformationPolicy一致的外部行为来检索现有的Kerberos策略([MS-LSAD]节3.1.4.4.7)。

§  必须将PolicyHandle设置为通过执行与本地调用LsarOpenPolicy([MS-LSAD]节3.1.4.4.2)一致的外部行为打开的策略句柄，并且将DesiredAccess设置为maximum_alloved([MS-LSAD]节2.2.1.1.1)。

§  InformationClass必须设置为PolicyDomainKerberosTicketInformation([MS-LSAD]section 2.2.4.15)。

接下来，必须通过执行与本地调用LsarSetDomainInformationPolicy一致的外部行为([MS-LSAD]第3.1.4.4.8)来使用Kerberos policy中的设置（第2.2.2)更新现有的Kerberos policy。

§  必须将PolicyHandle设置为通过执行与本地调用LsarOpenPolicy([MS-LSAD]节3.1.4.4.2)一致的外部行为打开的策略句柄，并且将DesiredAccess设置为maximum_alloved([MS-LSAD]节2.2.1.1.1)。

§  InformationClass必须设置为PolicyDomainKerberosTicketInformation([MS-LSAD]section 2.2.4.15)。

§  必须将PolicyDomainInformation设置为通过查询现有Kerberos策略返回的POLICY_DOMAIN_KERBEROS_TICKET_INFO结构，并使用以下映射表进行更新。右列中的POLICY_DOMAIN_KERBEROS_TICKET_INFO结构的每个元素与Kerberos策略中的设置一起被设置为分配给左列中相应键的值。如果TicketValidateClient设置设置为“true”，则必须设置AuthenticationOptions位POLICY_KERBEROS_VALIDATE_CLIENT。

| Group Policy: Security Protocol Extension | LSAD POLICY_DOMAIN_KERBEROS_TICKET_INFO structure         |
| ----------------------------------------- | --------------------------------------------------------- |
| MaxServiceAge                             | MaxServiceTicketAge                                       |
| MaxTicketAge                              | MaxTicketAge                                              |
| MaxRenewAge                               | MaxRenewAge                                               |
| MaxClockSkew                              | MaxClockSkew                                              |
| TicketValidateClient                      | AuthenticationOptions bit POLICY_KERBEROS_VALIDATE_CLIENT |

#### 3.2.5.5 事件日志策略

如果键值是2.2.3节中表中列出的有效值以外的任何值，客户端应停止处理事件日志策略设置并记录错误。

事件日志策略中的设置（第2.2.3)映射到[MS-EVEN]第3.1.1.2节中指定的抽象数据模型，使用日志名（与头值相同）（第2.2.3节）来确定要更新其值的注册表项：

| Log Name        | Registry Key                                                 |
| --------------- | ------------------------------------------------------------ |
| System Log      | HKEY_LOCAL_MACHINE\system\currentcontrolset\services\eventlog\System |
| Security Log    | HKEY_LOCAL_MACHINE\system\currentcontrolset\services\eventlog\Security |
| Application Log | HKEY_LOCAL_MACHINE\system\currentcontrolset\services\eventlog\Application |

下表右列中的注册表值被设置为事件日志策略（第2.2.3节）设置中指定的左列项的值。

| Group Policy: Security Protocol Extension      | EventLog Remoting Protocol                                   |
| ---------------------------------------------- | ------------------------------------------------------------ |
| MaximumLogSize                                 | MaxSize                                                      |
| AuditLogRetentionPeriodRetentionDays（保留日） | 保留：§  AuditLogRetentionPeriod为“0”：0§  AuditLogRetentionPeriod为“1”：RetentionDays值转换为秒§  AuditLogRetentionPeriod为“2”：0xFFFFFFF |
| RestrictGuestAccess                            | RestrictGuestAccess                                          |

#### 3.2.5.6 事件审核策略

如果DWORD注册表值Machine\System\CurrentControlSet\Control\LSA\ScenoApplyLegacyAuditPolicy使用第2.2.5节中描述的机制设置为1，则客户端插件必须忽略事件审核策略部分中的任何设置，并且不得处理这些设置。如果此注册表值设置为1，则表示客户端上存在高级审核策略。<10>

关键元素的值必须是第2.2.4节中表中规定的值之一；否则，客户端必须记录错误并停止处理事件审核策略。值元素必须是整数；否则，客户端将记录错误并停止处理事件审核策略。

事件审核策略（第2.2.4)中的设置必须通过执行与本地调用LsarSetInformationPolicy（第3.1.4.4.6节）一致的外部行为来设置([MS-LSAD]第3.1.4.4.6节）。

§  必须将PolicyHandle设置为通过执行与本地调用LsarOpenPolicy一致的外部行为打开的策略句柄（第3.1.4.4.2节）([MS-LSAD]第3.1.4.4.2节）。

§  InformationClass必须设置为PolicyAuditEventsInformation。

§  缓冲区必须使用事件审核策略中的设置来设置，其中键映射到枚举([MS-LSAD]节2.2.4.20)，如下表所示。



| Group Policy: Security Protocol Extension | Local Security Authority (Domain Policy) Remote Protocol**本地安全授权（域策略）远程协议** |
| ----------------------------------------- | ------------------------------------------------------------ |
| AuditAccountManage                        | AuditCategoryAccountManagement                               |
| AuditDSAccess                             | AuditCategoryDirectoryServiceAccess                          |
| AuditAccountLogon                         | AuditCategoryAccountLogon                                    |
| AuditLogonEvents                          | AuditCategoryLogon                                           |
| AuditObjectAccess                         | AuditCategoryObjectAccess                                    |
| AuditPolicyChange                         | AuditCategoryPolicyChange                                    |
| AuditPrivilegeUse                         | AuditCategoryPrivilegeUse                                    |
| AuditProcessTracking                      | AuditCategoryDetailedTracking                                |
| AuditSystemEvents                         | AuditCategorySystem                                          |

此外，根据下表，每个设置的值（节2.2.4)映射到EventAuditingOptions数组([MS-LSAD]节2.2.4.4)的值。如果值的两个低阶位中的任何一个被设置，则根据这些位表示的值映射该值。否则，这些值将映射到policy_audit_event_none。

| Group Policy: Security Protocol Extension | Local Security Authority (Domain Policy) Remote Protocol**本地安全授权（域策略）远程协议** |
| ----------------------------------------- | ------------------------------------------------------------ |
| 0                                         | POLICY_AUDIT_EVENT_NONE                                      |
| 1                                         | POLICY_AUDIT_EVENT_SUCCESS \| POLICY_AUDIT_EVENT_NONE        |
| 2                                         | POLICY_AUDIT_EVENT_FAILURE \| POLICY_AUDIT_EVENT_NONE        |
| 3                                         | POLICY_AUDIT_EVENT_SUCCESS \| POLICY_AUDIT_EVENT_FAILURE \|POLICY_AUDIT_EVENT_NONE |
| 4                                         | POLICY_AUDIT_EVENT_NONE                                      |

#### 3.2.5.7 注册表值

注册表值（第2.2.5节）中的设置必须通过添加注册表值来设置。

如果键值是2.2.5节中表中列出的有效值以外的任何值，则应记录错误，客户端必须停止处理注册表值设置。

注册表值必须通过执行与本地调用BaseRegSetValue（节3.1.5.22)([MS-RRP]节3.1.5.22)一致的外部行为来添加。

§  必须将hKey设置为通过执行与本地调用BaseRegCreateKey（第3.1.5.7节）([MS-RRP]第3.1.5.7节）一致的外部行为打开的注册表项句柄，使用上次“\”之前设置的RegistryValueName部分。

§  lpValueName必须设置为设置的RegistryValueName的最后一部分，位于最后一个'\'之后。

§  必须将dwType设置为该设置的RegistryValueType。

§  必须将lpData设置为该设置的RegistryValue。

cbData必须设置为设置的RegistryValue的长度（以字节为单位）。

#### 3.2.5.8 特权权利

特权权限（第2.2.6节）中的设置必须通过添加特权权限来设置。

如果一个设置或值不符合2.2.6节中规定的有效对应值，客户端应停止处理特权权限设置。

通过对RightName设置中的每个SidEnt执行与本地调用LsarAddAccountRights([MS-LSAD]节3.1.4.5.11)一致的外部行为来添加特权权限。

§  必须将PolicyHandle设置为通过执行与本地调用LsarOpenPolicy一致的外部行为打开的策略句柄([MS-LSAD]节3.1.4.4.2)。

§  对于该设置，AccountSid必须设置为SidEnt的值。

§  UserRights必须设置为LSAPR_USER_RIGHT_SET结构的地址值，其中UserRights成员必须设置为PRPC_UNICODE_STRING元素数组，其中包含一个设置为RightName值的元素（如[MS-LSAD]节2.2.5.3中所指定）。LSAPR_USER_RIGHT_SET条目成员必须设置为一。RightName字符串必须分别与[MS-LSAD]第3.1.1.2.1和3.1.1.2.2节中列出的有效特权或用户权限的名称相对应。



#### 3.2.5.9 注册表项

写入注册表项和值的行为在[MS-RRP]第4.2节中指定。

如果RegistryKeyName、ACLString或PermPropagationMode值不是2.2.7节中指定的有效值，客户端应停止处理注册表项设置并记录错误。

注册表项中的设置（第2.2.7节）必须通过对每个设置的注册表项应用安全描述符来设置。

通过执行与本地调用BaseRegGetKeySecurity一致的外部行为（第3.1.5.13节）([MS-RRP]第3.1.5.13节）从注册表项读取安全描述符。

§  必须将hKey设置为通过执行与使用注册表对象的RegistryKeyName本地调用BaseRegOpenKey（节3.1.5.15)([MS-RRP]节3.1.5.15)一致的外部行为打开的注册表项句柄。

§  SecurityInformation必须设置为OWNER_SECURITY_INFORMATION GROUP_SECURITY_INFORMATION DACL_SECURITY_INFORMATION SACL_SECURITY_INFORMATION([MS-RRP]节2.2.9)。

通过执行与本地调用BaseRegSetKeySecurity一致的外部行为（第3.1.5.21节）([MS-RRP]第3.1.5.21节），将安全描述符应用于注册表项。

§  必须将hKey设置为通过执行与使用注册表对象的RegistryKeyName本地调用BaseRegOpenKey（节3.1.5.15)([MS-RRP]节3.1.5.15)一致的外部行为打开的注册表项句柄。

§  SecurityInformation必须设置为OWNER_SECURITY_INFORMATION GROUP_SECURITY_INFORMATION DACL_SECURITY_INFORMATION SACL_SECURITY_INFORMATION([MS-RRP]节2.2.9)。

§  pRpcSecurityDescriptor必须以RPC_SECURITY_DESCRIPTOR（节2.2.8)([MS-RRP]节2.2.8)的形式设置为“ACLString”设置中提供的安全描述符。

安全描述符应用于对应于每个设置的每个注册表对象的注册表项。

如果PermPropagationMode为“0”，则通过调用CreateSecurityDescriptor（第2.5.3.4.1节）([MS-DTYP]第2.5.3.4.1节）并将生成的安全描述符应用于注册表对象，递归更新每个子注册表对象的安全描述符，以允许可继承权限的传播。调用CreateSecurityDescriptor时使用以下参数：

§  *ParentDescriptor**设置为注册表对象父级的安全描述符。*

§  CreatorDescriptor设置为注册表对象的当前安全描述符。

§  *IsContainerObject**设置为**true**。*

§  *ObjectTypes**设置为**NULL**。*

§  *AutoInheritFlags**设置为**dacl_auto_inheritage sacl_auto_inheritage DEFAULT_OWNER_FROM_PARENT default_group_fromparent**。*

§  *令牌是包含**S-1-5-18**（本地系统众所周知的**SID**）的令牌。*

§  *GenericMapping**是注册表对象的泛型映射。*

如果PermPropagationMode为“1”，则通过调用CreateSecurityDescriptor（第2.5.3.4.1节）([MS-DTYP]第2.5.3.4.1节）并将生成的安全描述符应用于注册表对象，递归更新每个子注册表对象的安全描述符，以允许可继承权限的传播。调用CreateSecurityDescriptor时使用以下参数：

§  *ParentDescriptor**设置为注册表对象父级的安全描述符。*

§  *CreatorDescriptor**设置为**NULL**。*

§  *IsContainerObject**设置为**true**。*

§  *ObjectTypes**设置为**NULL**。*

§  AutoInheritFlags设置为dacl_auto_inheritage sacl_auto_inheritage DEFAULT_OWNER_FROM_PARENT default_group_fromparent。

§  *令牌是包含**S-1-5-18**（本地系统众所周知的**SID**）的令牌。*

§  *GenericMapping**是注册表对象的泛型映射。*

如果PermPropagationMode为“2”，则该设置的注册表对象上的安全描述符控制字段位PD([MS-DTYP]节2.4.6)将设置为0。

#### 3.2.5.10 服务常规设置

服务常规设置（第2.2.8节）中的设置必须通过对每个设置应用服务的启动配置和安全描述符来设置。

如果ServiceName、StartupMode或AclString值不是2.2.8节中指定的有效值，客户端将停止处理服务常规设置并记录错误。

启动配置必须通过对每个设置执行与本地调用RChangeServiceConfigW（[MS-SCMR]节3.1.4.11)一致的外部行为来应用于服务。

§  必须使用设置的ServiceName执行与本地调用ROpenServiceW([MS-SCMR]节3.1.4.16)一致的外部行为，将hService设置为打开的服务句柄。

§  必须将dwServiceType设置为通过执行与本地调用RQueryServiceConfigW一致的外部行为检索的服务类型([MS-SCMR]节3.1.4.17)。

§  dwStartType必须设置为服务中设置的StartupMode常规设置，其中StartupMode映射到dwStartType([MS-SCMR]节2.2.15)，如下表所示。

| Group Policy: Security Protocol Extension | Service Control Manager Remote Protocol**服务控制管理器远程协议** |
| ----------------------------------------- | ------------------------------------------------------------ |
| Value of "2"                              | SERVICE_AUTO_START ([MS-SCMR] section 2.2.15)                |
| Value of "3"                              | SERVICE_DEMAND_START ([MS-SCMR] section 2.2.15)              |
| Value of "4"                              | SERVICE_DISABLED ([MS-SCMR] section 2.2.15)                  |

§  dwErrorControl必须设置为通过执行与本地调用RQueryServiceConfigW一致的外部行为检索的错误控制([MS-SCMR]节3.1.4.17)。

§  必须将lpBinaryPathName设置为通过执行与本地调用RQueryServiceConfigW一致的外部行为检索的路径名([MS-SCMR]节3.1.4.17)。

§  lpLoadOrderGroup必须设置为服务组，以便通过执行与本地调用RQueryServiceConfigW一致的外部行为来检索加载顺序([MS-SCMR]节3.1.4.17)。

§  lpdwTagId必须设置为NULL。

§  必须将lpDependencies设置为通过执行与本地调用RQueryServiceConfigW一致的外部行为检索的依赖项([MS-SCMR]节3.1.4.17)。

§  必须将dwDependSize设置为通过执行与本地调用RQueryServiceConfigW一致的外部行为检索到的依赖项数([MS-SCMR]节3.1.4.17)。

§  必须将lpServiceStartName设置为Null。

§  lpPassword必须设置为NULL。

§  dwPwSize必须设置为0。

§  必须将lpDisplayName设置为通过执行与本地调用RQueryServiceConfigW一致的外部行为检索的显示名称([MS-SCMR]节3.1.4.17)。

必须通过对每个设置执行与本地调用RSetServiceObjectSecurity([MS-SCMR]节3.1.4.6)一致的外部行为，将安全描述符应用于服务。

§  必须将hService设置为通过执行与使用设置的ServiceName本地调用ROpenServiceW([MS-SCMR]节3.1.4.16)一致的外部行为打开的服务句柄。

§  dwSecurityInformation必须设置为DACL_SECURITY_INFORMATION([MS-SCMR]节2.2.1。

§  lpSecurityDescriptor必须按照[MS-DTYP]第2.4.6节中指定的形式设置为设置的AclString中的安全描述符。

cbBufSize必须设置为lpSecurityDescriptor参数指向的缓冲区的大小（以字节为单位）。

#### 3.2.5.11 文件安全

必须通过为每个设置应用安全描述符、传播模式和安全描述符（AclString）来设置每个文件安全设置。

如果FileOrDirectoryPath、PermPropagationMode或AclString值不是2.2.9节中指定的有效值，客户端应停止处理文件安全设置并记录错误。

文件或子目录上的安全描述符应通过执行与本地调用应用程序请求应用文件安全“任务([MS-SMB2]节3.2.4.13)一致的外部行为来应用，并使用以下参数：

§  必须使用设置的FileOrDirectoryPath将Open设置为通过执行与本地调用“Application Requests Opening a File”任务([MS-SMB2]节3.2.4.3)一致的外部行为返回的Open。

§  必须将安全信息设置为“ACLString”设置中提供的安全描述符。此安全描述符使用[MS-DTYP]节2.4.6中指定的自相关形式。

§  安全属性必须设置为DACL_SECURITY_INFORMATION([MS-SMB2]section 2.2.39)。

应该通过执行与本地调用“Application Requests Quering file security”任务([MS-SMB2]节3.2.4.12)一致的外部行为来查询文件或子目录上的安全描述符，并使用以下参数：

§  必须使用设置的FileOrDirectoryPath将Open设置为通过执行与本地调用“Application Requests Opening a File”任务([MS-SMB2]节3.2.4.3)一致的外部行为返回的Open。

§  安全属性必须设置为DACL_SECURITY_INFORMATION([MS-SMB2]section 2.2.39)。

如果PermPropagationMode为“0”，则应通过调用CreateSecurityDescriptor([MS-DTYP]节2.5.3.4.1)并对每个相应的子文件对象应用结果安全描述符，递归更新每个子文件对象的安全描述符，以允许传播可继承的权限。调用CreateSecurityDescriptor时使用以下参数：

§  *ParentDescriptor**设置为文件对象父级的安全描述符。*

§  *CreatorDescriptor**设置为文件对象的当前安全描述符。*

§  *IsContainerObject**设置为**true**。*

§  *ObjectTypes**设置为**NULL**。*

§  AutoInheritFlags设置为DACL_AUTO_INHERIT Default_OWNER_FROM_PARTER Default_GROUP_FROMPARTER。

§  *令牌是包含**S-1-5-18**（本地系统众所周知的**SID**）的令牌。*

§  *GenericMapping**是文件对象的泛型映射。*

如果PermPropagationMode为“1”，则应通过调用CreateSecurityDescriptor([MS-DTYP]节2.5.3.4.1)并对每个相应的子文件对象应用结果安全描述符，递归更新每个子文件对象的安全描述符，以允许传播可继承的权限。调用CreateSecurityDescriptor时使用以下参数：

§  *ParentDescriptor**设置为文件对象父级的安全描述符。*

§  *CreatorDescriptor**设置为**NULL**。*

§  *IsContainerObject**设置为**true**。*

§  *ObjectTypes**设置为**NULL**。*

§  AutoInheritFlags设置为DACL_AUTO_INHERIT Default_OWNER_FROM_PARTER Default_GROUP_FROMPARTER。

§  *令牌是包含**S-1-5-18**（本地系统众所周知的**SID**）的令牌。*

§  *GenericMapping**是文件对象的泛型映射。*

如果PermPropagationMode为“2”，则该设置的file对象上的安全描述符控制字段位PD设置为零。



#### 3.2.5.12 组成员资格

组成员资格中的设置必须通过为每个设置在组上应用成员和成员资格来设置。

如果GroupNameMembers、GroupNameMemberOf或Value元素值如第2.2.10节所述无效，客户端必须停止处理组成员资格设置并记录错误。

如果设置的键（第2.2.10节）指定的组是域本地、全局或通用组，则：

§  对于设置的值（节2.2.10)中的域本地、全局和通用组，成员和成员资格必须通过执行与本地调用“在ADConnection上执行LDAP操作”任务([MS-ADTS]节7.6.1.6)一致的外部行为来应用，并为设置中的值（节2.2.10)中的每个SID或名称使用以下参数：

§  TASKINPUTADConnection：一个基于客户机域名的ADConnection句柄([MS-DTYP]section 2.2.2)。

§  TaskinPutreQuestMessage：LDAP修改请求([RFC2251]section 4.6)，如下所示：

§  **对象：由设置的键（第****2.2.10****节）指定的组的可分辨名称。**

§  修改序列有一个条目，如下所示：

§  操作：添加。

§  修改：

§  **类型：****member****或****MemberOf****。**

§  **vals****：由设置的值（第****2.2.10****节）中的****SID****或名称指定的对象的可分辨名称。**

§  对于设置的值（节2.2.10)中的本地组，必须通过执行与本地调用SamrAddMemberToGroup([MS-SAMR]节3.1.5.8.1)一致的外部行为来应用成员资格，该行为适用于设置中的值（节2.2.10)中的每个SID或名称：

§  GroupHandle必须通过执行与本地调用SamroPengGroup([MS-SAMR]节3.1.5.1.7)一致的外部行为来设置为GroupHandle，使用由设置的值（节2.2.10)指定的组的相对标识符(RID)。

§  必须将MemberId设置为该设置的键（第2.2.10节）中的SID或名称指定的对象的RID。

§  属性必须设置为零。

如果设置的键（节2.2.10)指定的组是本地组，则必须通过执行与本地调用SamrAddMemberToGroup([MS-SAMR]节3.1.5.8.1)一致的外部行为来应用成员，该行为针对设置中的值（节2.2.10)中的每个SID或名称：

§  必须将GroupHandle设置为通过执行与本地调用SamroPengGroup([MS-SAMR]节3.1.5.1.7)一致的外部行为打开的组句柄，使用设置的键（节2.2.10)指定的组的RID。

§  必须将MemberId设置为该设置的值（第2.2.10节）中的SID或名称指定的对象的RID。

属性必须设置为零。

#### 3.2.5.13 用户帐户控制

用户帐户控制（第2.2.11节）中的设置必须通过为每个设置值元组（键、值、类型、数据）添加注册表值来设置。如果键、值、类型和数据值不符合2.2.11节中指定的有效用户帐户控制设置值元组之一，客户端应退出处理用户帐户控制设置并记录错误。

用户帐户控制设置按第3.2.5.6节的规定处理，其中：

§  RegistryValueName是带有反斜杠的指定键值，并附加了指定的value元素值。

§  RegistryValueType是类型值。

RegistryValue是数据值。

### 3.2.6 定时器事件

### 3.2.7 其他本地活动

# 4 协议示例

## 4.1 涉及密码策略的示例

在下面的示例中，管理员指定，对于应用特定GPO的计算机，将强制执行指定的密码策略：

§  密码长度最小为8个字符。

§  打开密码复杂性检查。

§  10个密码的密码历史是要记住和强制执行的。

```
[Unicode]
Unicode=yes
[Version]
signature="$CHICAGO$"
Revision=1
[System Access]
MinimumPasswordLength = 8
PasswordComplexity = 1
PasswordHistorySize = 10
```

## 4.2 涉及审核设置的示例

在下面的示例中，管理员指定为应用特定GPO的计算机应用指定的审核设置：

\1.     审核成功尝试登录帐户。

\2.     审核帐户管理失败的尝试。

\3.     对对象访问进行了成功和失败的审核尝试。

\4.     审核成功和失败的过程跟踪尝试。

```
[Unicode]
Unicode=yes
[Version]
signature="$CHICAGO$"
Revision=1
[Event Audit]
AuditObjectAccess = 3
AuditAccountManage = 2
AuditProcessTracking = 3
AuditAccountLogon = 1
```

## 4.3 配置组成员身份的示例

在下面的示例中，管理员指定，对于应用特定GPO的计算机，组成员资格配置为已分配：

\1.     Group1包含以下成员:member1、member2和Member3。

\2.     Group2包含以下成员:member1和member3。

\3.     Group3包含以下成员:Member4。

\4.     Group1是Group3的一部分。

\5.     Group2是Group1的一部分。

```
[Unicode]
Unicode=yes
[Version]
signature="$CHICAGO$"
Revision=1
[Group Membership]
Group1__Memberof = Group3
Group1__Members = member3,member2,member1
Group2__Memberof = Group3
Group2__Members = member3,member1
Group3__Memberof =
Group3__Members = member4
```

## 4.4 配置多种类型设置的示例

在下面的示例中，管理员指定，对于应用特定GPO的计算机，前面各节中指定的所有设置都按指定配置。

```
[Unicode]
Unicode=yes
[Version]
signature="$CHICAGO$"
Revision=1
[System Access]
MinimumPasswordLength = 8
PasswordComplexity = 1
PasswordHistorySize = 10
[Event Audit]
AuditObjectAccess = 3
AuditAccountManage = 2
AuditProcessTracking = 3
AuditAccountLogon = 1
[Group Membership]
Group1__Memberof = Group3
Group1__Members = member3,member2,member1
Group2__Memberof = Group3
Group2__Members = member3,member1
Group3__Memberof =
Group3__Members = member4
```

# 5 安全

## 5.1 实现者的安全注意事项

ClearTextPassword标志，如2.2.1.1节所述，指示密码是否使用可逆加密来存储。此策略为使用要求了解用户密码以进行身份验证的协议的应用程序提供支持。通过使用可逆加密存储密码本质上与存储密码的纯文本版本相同。因此，除非应用程序要求超过保护密码信息的需要，否则不建议使用此策略。

## 5.2 安全参数索引

### 5.2.1 影响协议行为的安全参数

| Name of setting                                              | Default value | Explanation of setting                                       |
| ------------------------------------------------------------ | ------------- | ------------------------------------------------------------ |
| MaxNoGPOListChangesInterval详情见 [[MS-GPOL\]]([MS-GPOL].pdf#Section_62d1292462524052996f161d2b9019f4). | 960           | 时间间隔（以分钟为单位），它设置了客户端在不重新应用未更改的GPO的情况下可以工作多长时间的最大限制。 |

### 5.2.2 协议承载的系统安全参数

| Settings category       | Comments                                                     |
| ----------------------- | ------------------------------------------------------------ |
| System Access           | Defined in section [2.2.1](#Section_d9bcb85c67be49cc90ead2bd50873417). |
| Kerberos Policy         | Defined in section [2.2.2](#Section_0fce5b92bcc14b969c2b56397c3f144f). |
| System Log              | Defined in section [2.2.3](#Section_0b9673a7ce0a49b4912b591efdb37cdf). |
| Security Log            | Defined in section 2.2.3.                                    |
| Application Log         | Defined in section 2.2.3.                                    |
| Event Audit             | Defined in section [2.2.4](#Section_01f8e057f6a84d6e8a0099bcd241b403). |
| Registry Values         | Defined in section [2.2.5](#Section_3a14ca47a22f43c5b35e6be791003ca7). |
| Privilege Rights        | Defined in section [2.2.6](#Section_3413b381a4454d17b77e5bbfadda253b). |
| Registry Key            | Defined in section [2.2.7](#Section_13712a60de1e4642bd9cab054dd86278). |
| Service General Setting | Defined in section [2.2.8](#Section_32deea3e3fa4414bba254121ad8c055c). |
| File Security           | Defined in section [2.2.9](#Section_abeebe0649aa44d4ae5bd6aff458e8e7). |
| Group Membership        | Defined in section [2.2.10](#Section_b73d8baeed2248aaacba7065ab52d709). |

# 6 附录A：产品行为

本规范中的信息适用于下列Microsoft产品或补充软件。对产品版本的引用包括对这些产品的更新。

§  Windows2000Server操作系统

§  Windows XP操作系统

§  Windows Server 2003操作系统

§  Windows Vista操作系统

§  Windows Server 2008操作系统

§  Windows 7操作系统

§  Windows Server 2008 R2操作系统

§  Windows 8操作系统

§  Windows Server 2012操作系统

§  Windows 8.1操作系统

§  Windows Server 2012 R2操作系统

§  Windows 10操作系统

§  Windows Server 2016操作系统

§  Windows Server操作系统

§  Windows Server 2019操作系统

§  Windows Server 2022操作系统

§  Windows 11操作系统

如果有例外，在本节中注明。如果出现带有产品名称的更新版本、service pack或知识库(KB)编号，则该更新中的行为已更改。除非另有规定，否则新行为也适用于后续更新。如果产品版本与产品版本一起出现，则在该产品版本中的行为是不同的。

除非另有说明，本规范中使用“应该”或“不应该”等术语规定的任择行为的任何声明意味着产品行为符合“应该”或“不应该”的规定。除非另有说明，“可能”一词暗示产品不遵循处方。

<1>第2.1节：Windows 2000Server、Windows XP和Windows Server 2003不支持服务器消息块(SMB)版本2和3协议。这些版本的Windows使用SMB，如[MS-SMB]第1.3节所述。

<2>第2.2.1.1节：Windows忽略RequireLogonToChangepassword设置。

<3>第2.2.3节：在Windows 2000操作系统、Windows XP、Windows Server 2003、Windows Vista、Windows Server 2008、Windows 7和Windows Server 2008 R2操作系统中，忽略RestrictGuestAccess设置。

<4>第2.2.4:Windows不会为策略更改失败生成安全审核事件记录。

<5>第2.2.4节：Windows不会为进程跟踪失败生成安全审核事件记录。

<6>第2.2.11节：Windows 2000、Windows XP和Windows Server 2003不支持这些设置。

<7>第2.2.11.1节：在Windows上，这也称为Windows XP本机模式。

<8>第2.2.11.2节：将允许Windows二进制文件在没有同意或凭据的情况下执行需要提升的操作。

<9>第3.2.3节：Windows 2000 Server、Windows XP和Windows Server 2003不支持服务器消息块(SMB)版本2和3协议。这些版本的Windows使用SMB，如[MS-SMB]第1.3节所述。

<10>第3.2.5.6节：Windows 2000 Server、Windows XP和Windows Server 2003忽略此注册表设置，并处理和应用事件审核策略部分下的设置。



# 7 变更跟踪

本节标识了自上次发布以来对此文档所做的更改。更改分为主要、次要或无更改。

修改类专业是指文件中的技术内容被重大修改。重大更改会影响协议互操作性或实现。主要变化的例子有：

§  合并了对互操作性要求的更改的文档修订。

§  捕获协议功能更改的文档修订。

辅修课的意思是阐明了技术内容的含义。微小的更改不会影响协议互操作性或实现。小变化的例子是更新，以澄清句子、段落或表级别的歧义。

修订类None意味着没有引入新的技术更改。编辑和格式可能做了一些小的修改，但相关的技术内容与上次发布的版本相同。

下表列出了对此文档所做的更改。欲了解更多信息，请联系dochelp@microsoft.com。

| Section                                                      | Description                   | Revision class |
| ------------------------------------------------------------ | ----------------------------- | -------------- |
| [6](#Section_3b1bb402c56d4ddeb2fd880d464d9125) Appendix A: Product Behavior | 已为此版本的Windows客户端更新 | Major          |