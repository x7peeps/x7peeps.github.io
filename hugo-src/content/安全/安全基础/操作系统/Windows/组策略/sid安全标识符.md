---
date: 2025-07-19T16:26:01+08:00
title: "SID安全标识符"
menu: 
  main: 
    parent: "组策略"
---

众所周知的[安全标识符](https://docs.microsoft.com/en-us/windows/desktop/SecGloss/s-gly)(SID) 标识通用组和通用用户。例如，有一些众所周知的 SID 来标识以下组和用户：

- 每个人或世界，这是一个包含所有用户的组。
- CREATOR_OWNER，用作可继承 ACE 中的占位符。继承 ACE 时，系统将 CREATOR_OWNER SID 替换为对象创建者的 SID。

- 本地计算机上内置域的管理员组。·

有[通用的众所周知的 SID](https://docs.microsoft.com/en-us/windows/desktop/SecGloss/u-gly)，它们在使用此安全模型的所有安全系统上都有意义，包括Windows 以外的操作系统。此外，还有一些众所周知的 SID 仅在 Windows 系统上才有意义。

Windows API 为众所周知的标识符权限和[相对标识符](https://docs.microsoft.com/en-us/windows/desktop/SecGloss/r-gly)(RID) 值定义了一组常量。您可以使用这些常量来创建众所周知的 SID。以下示例结合了 SECURITY_WORLD_SID_AUTHORITY 和 SECURITY_WORLD_RID 常量来显示代表所有用户（每个人或世界）的特殊组的通用知名 SID：

S-1-1-0

此示例使用 SID 的字符串表示法，其中 S 将字符串标识为 SID，第一个 1 是 SID 的修订级别，其余两位数字是 SECURITY_WORLD_SID_AUTHORITY 和 SECURITY_WORLD_RID 常量。

您可以使用[AllocateAndInitializeSid](https://docs.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-allocateandinitializesid)函数通过将标识符权限值与最多八个子权限值组合来构建 SID。例如，要确定登录用户是否是特定知名组的成员，请调用**AllocateAndInitializeSid**为知名组构建 SID，并使用[EqualSid](https://docs.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-equalsid)函数将该 SID 与用户所在组中的组 SID 进行比较。[访问令牌](https://docs.microsoft.com/en-us/windows/desktop/SecGloss/a-gly)。有关示例，请参阅[在 C++ 中的访问令牌中搜索 SID](https://docs.microsoft.com/en-us/windows/win32/secauthz/searching-for-a-sid-in-an-access-token-in-c--)。您必须调用[FreeSid](https://docs.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-freesid)函数来释放由**AllocateAndInitializeSid 分配**的 SID 。

本节的其余部分包含可用于构建知名 SID 的已知 SID 表以及标识符权限和子权限常量表。

以下是一些[通用的知名 SID](https://docs.microsoft.com/en-us/windows/desktop/SecGloss/u-gly)。

| 通用知名 SID     | 字符串值 | 识别                                                         |
| ---------------- | -------- | ------------------------------------------------------------ |
| Null SID         | S-1-0-0  | 一个没有成员的组。这通常在 SID 值未知时使用。                |
| World            | S-1-1-0  | 包含所有用户的组。                                           |
| Local            | S-1-2-0  | 登录到本地（物理）连接到系统的[终端的](https://docs.microsoft.com/en-us/windows/desktop/SecGloss/t-gly)用户。 |
| Creator Owner ID | S-1-3-0  | 要由创建新对象的用户的安全标识符替换的安全标识符。此 SID 用于可继承的 ACE。 |
| Creator Group ID | S-1-3-1  | 要由创建新对象的用户的主要组 SID 替换的安全标识符。在可继承的 ACE 中使用此 SID。 |

下表列出了预定义的标识符权限常量。前四个值与通用的众所周知的 SID 一起使用；最后一个值用于 Windows 众所周知的 SID。

| 标识符权限                     | 价值 | 字符串值 |
| ------------------------------ | ---- | -------- |
| SECURITY_NULL_SID_AUTHORITY    | 0    | S-1-0    |
| SECURITY_WORLD_SID_AUTHORITY   | 1    | S-1-1    |
| SECURITY_LOCAL_SID_AUTHORITY   | 2    | S-1-2    |
| SECURITY_CREATOR_SID_AUTHORITY | 3    | S-1-3    |
| SECURITY_NT_AUTHORITY          | 5    | S-1-5    |

以下[RID](https://docs.microsoft.com/en-us/windows/desktop/SecGloss/r-gly)值与[通用的众所周知的 SID 一起使用](https://docs.microsoft.com/en-us/windows/desktop/SecGloss/u-gly)。标识符权限列显示标识符权限的前缀，您可以将 RID 与其组合以创建通用的知名 SID。

| 相对标识符权限             | 价值 | 字符串值 |
| -------------------------- | ---- | -------- |
| SECURITY_NULL_RID          | 0    | S-1-0    |
| SECURITY_WORLD_RID         | 0    | S-1-1    |
| SECURITY_LOCAL_RID         | 0    | S-1-2    |
| SECURITY_LOCAL_LOGON_RID   | 1    | S-1-2    |
| SECURITY_CREATOR_OWNER_RID | 0    | S-1-3    |
| SECURITY_CREATOR_GROUP_RID | 1    | S-1-3    |

SECURITY_NT_AUTHORITY (S-1-5) 预定义标识符权限生成的 SID 不是通用的，但仅在 Windows 安装上有意义。您可以将以下 RID 值与 SECURITY_NT_AUTHORITY 一起使用来创建众所周知的 SID。

| 持续的                              | 字符串值           | 识别                                                         |
| ----------------------------------- | ------------------ | ------------------------------------------------------------ |
| SECURITY_DIALUP_RID                 | S-1-5-1            | 使用拨号调制解调器登录[终端的](https://docs.microsoft.com/en-us/windows/desktop/SecGloss/t-gly)用户。这是一个组标识符。 |
| SECURITY_NETWORK_RID                | S-1-5-2            | 通过网络登录的用户。这是通过网络登录时添加到进程令牌的组标识符。对应的登录类型是 LOGON32_LOGON_NETWORK。 |
| SECURITY_BATCH_RID                  | S-1-5-3            | 使用批处理队列工具登录的用户。这是在作为批处理作业记录时添加到进程令牌的组标识符。对应的登录类型是 LOGON32_LOGON_BATCH。 |
| SECURITY_INTERACTIVE_RID            | S-1-5-4            | 登录进行交互操作的用户。这是在交互登录时添加到进程令牌的组标识符。对应的登录类型是 LOGON32_LOGON_INTERACTIVE。 |
| SECURITY_LOGON_IDS_RID              | S-1-5-5- *X* - *Y* | 登录会话。这用于确保只有给定登录会话中的[进程](https://docs.microsoft.com/en-us/windows/desktop/SecGloss/p-gly)才能访问该会话的窗口站对象。对于每个登录会话，这些 SID的*X*和*Y*值都不同。值 SECURITY_LOGON_IDS_RID_COUNT 是此标识符 (5- *X* - *Y* )中 RID 的数量。 |
| SECURITY_SERVICE_RID                | S-1-5-6            | 授权作为服务登录的帐户。这是在将进程作为服务记录时添加到进程令牌的组标识符。对应的登录类型是 LOGON32_LOGON_SERVICE。 |
| SECURITY_ANONYMOUS_LOGON_RID        | S-1-5-7            | 匿名登录或空会话登录。                                       |
| SECURITY_PROXY_RID                  | S-1-5-8            | 代理。                                                       |
| SECURITY_ENTERPRISE_CONTROLLERS_RID | S-1-5-9            | 企业控制器。                                                 |
| SECURITY_PRINCIPAL_SELF_RID         | S-1-5-10           | PRINCIPAL_SELF 安全标识符可用于用户或组对象的 ACL。在访问检查期间，系统将 SID 替换为对象的 SID。PRINCIPAL_SELF SID 可用于指定适用于继承 ACE 的用户或组对象的可继承 ACE。它是在模式的默认[安全描述符](https://docs.microsoft.com/en-us/windows/desktop/SecGloss/s-gly)中表示已创建对象的 SID 的唯一方法。 |
| SECURITY_AUTHENTICATED_USER_RID     | S-1-5-11           | 经过身份验证的用户。                                         |
| SECURITY_RESTRICTED_CODE_RID        | S-1-5-12           | 受限代码。                                                   |
| SECURITY_TERMINAL_SERVER_RID        | S-1-5-13           | 终端服务。自动添加到登录到终端服务器的用户的安全令牌。       |
| SECURITY_LOCAL_SYSTEM_RID           | S-1-5-18           | 操作系统使用的特殊帐户。                                     |
| SECURITY_NT_NON_UNIQUE              | S-1-5-21           | 小岛屿发展中国家并不是独一无二的。                           |
| SECURITY_BUILTIN_DOMAIN_RID         | S-1-5-32           | 内置系统域。                                                 |
| SECURITY_WRITE_RESTRICTED_CODE_RID  | S-1-5-33           | 编写受限代码。                                               |

以下 RID 与每个域相关。

| RID                                                     | 价值       | 识别                                                         |
| ------------------------------------------------------- | ---------- | ------------------------------------------------------------ |
| DOMAIN_ALIAS_RID_CERTSVC_DCOM_ACCESS_GROUP              | 0x0000023E | 可以使用分布式组件对象模型 (DCOM) 连接到证书颁发机构的用户组。 |
| DOMAIN_USER_RID_ADMIN                                   | 0x000001F4 | 域中的管理用户帐户。                                         |
| DOMAIN_USER_RID_GUEST                                   | 0x000001F5 | 域中的来宾用户帐户。没有账号的用户可以自动登录这个账号。     |
| DOMAIN_GROUP_RID_ADMINS                                 | 0x00000200 | 域管理员组。此帐户仅存在于运行服务器操作系统的系统上。       |
| DOMAIN_GROUP_RID_USERS                                  | 0x00000201 | 包含域中所有用户帐户的组。所有用户都会自动添加到该组。       |
| DOMAIN_GROUP_RID_GUESTS                                 | 0x00000202 | 域中的来宾组帐户。                                           |
| DOMAIN_GROUP_RID_COMPUTERS                              | 0x00000203 | 域计算机组。域中的所有计算机都是该组的成员。                 |
| DOMAIN_GROUP_RID_CONTROLLERS                            | 0x00000204 | 域控制器组。域中的所有 DC 都是该组的成员。                   |
| DOMAIN_GROUP_RID_CERT_ADMINS                            | 0x00000205 | 证书发布者组。运行证书服务的计算机是该组的成员。             |
| DOMAIN_GROUP_RID_ENTERPRISE_READONLY_DOMAIN_CONTROLLERS | 0x000001F2 | 企业只读域控制器组。                                         |
| DOMAIN_GROUP_RID_SCHEMA_ADMINS                          | 0x00000206 | 模式管理员组。该组的成员可以修改 Active Directory 架构。     |
| DOMAIN_GROUP_RID_ENTERPRISE_ADMINS                      | 0x00000207 | 企业管理员组。该组的成员可以完全访问 Active Directory 林中的所有域。企业管理员负责林级操作，例如添加或删除新域。 |
| DOMAIN_GROUP_RID_POLICY_ADMINS                          | 0x00000208 | 策略管理员组。                                               |
| DOMAIN_GROUP_RID_READONLY_CONTROLLERS                   | 0x00000209 | 只读域控制器组。                                             |
| DOMAIN_GROUP_RID_CLONEABLE_CONTROLLERS                  | 0x0000020A | 可克隆域控制器组。                                           |
| DOMAIN_GROUP_RID_CDC_RESERVED                           | 0x0000020C | 保留的 CDC 组。                                              |
| DOMAIN_GROUP_RID_PROTECTED_USERS                        | 0x0000020D | 受保护的用户组。                                             |
| DOMAIN_GROUP_RID_KEY_ADMINS                             | 0x0000020E | 关键管理员组。                                               |
| DOMAIN_GROUP_RID_ENTERPRISE_KEY_ADMINS                  | 0x0000020F | 企业关键管理员组                                             |

以下 RID 用于指定强制完整性级别。

| RID                                      | 价值                                  | 识别           |
| ---------------------------------------- | ------------------------------------- | -------------- |
| SECURITY_MANDATORY_UNTRUSTED_RID         | 0x00000000                            | 不信任。       |
| SECURITY_MANDATORY_LOW_RID               | 0x00001000                            | 完整性低。     |
| SECURITY_MANDATORY_MEDIUM_RID            | 0x00002000                            | 中等完整性。   |
| SECURITY_MANDATORY_MEDIUM_PLUS_RID       | SECURITY_MANDATORY_MEDIUM_RID + 0x100 | 中高完整性。   |
| SECURITY_MANDATORY_HIGH_RID              | 0X00003000                            | 诚信度高。     |
| SECURITY_MANDATORY_SYSTEM_RID            | 0x00004000                            | 系统完整性。   |
| SECURITY_MANDATORY_PROTECTED_PROCESS_RID | 0x00005000                            | 受保护的过程。 |

下表包含域相关 RID 的示例，您可以使用这些示例为本地组（别名）形成众所周知的 SID。有关本地和全局组的更多信息，请参阅[本地组函数](https://docs.microsoft.com/en-us/windows/desktop/NetMgmt/local-group-functions)和[组函数](https://docs.microsoft.com/en-us/windows/desktop/NetMgmt/group-functions)。

| RID                                             | 价值       | 字符串值     | 识别                                                         |
| ----------------------------------------------- | ---------- | ------------ | ------------------------------------------------------------ |
| DOMAIN_ALIAS_RID_ADMINS                         | 0x00000220 | S-1-5-32-544 | 用于管理域的本地组。                                         |
| DOMAIN_ALIAS_RID_USERS                          | 0x00000221 | S-1-5-32-545 | 代表域中所有用户的本地组。                                   |
| DOMAIN_ALIAS_RID_GUESTS                         | 0x00000222 | S-1-5-32-546 | 代表域来宾的本地组。                                         |
| DOMAIN_ALIAS_RID_POWER_USERS                    | 0x00000223 | S-1-5-32-547 | 一个本地组，用于代表希望将系统视为他们的个人计算机而不是多个用户的工作站的一个用户或一组用户。 |
| DOMAIN_ALIAS_RID_ACCOUNT_OPS                    | 0x00000224 | S-1-5-32-548 | 仅存在于运行服务器操作系统的系统上的本地组。此本地组允许控制非管理员帐户。 |
| DOMAIN_ALIAS_RID_SYSTEM_OPS                     | 0x00000225 | S-1-5-32-549 | 仅存在于运行服务器操作系统的系统上的本地组。该本地组执行系统管理功能，不包括安全功能。它建立网络共享、控制打印机、解锁工作站和执行其他操作。 |
| DOMAIN_ALIAS_RID_PRINT_OPS                      | 0x00000226 | S-1-5-32-550 | 仅存在于运行服务器操作系统的系统上的本地组。此本地组控制打印机和打印队列。 |
| DOMAIN_ALIAS_RID_BACKUP_OPS                     | 0x00000227 | S-1-5-32-551 | 用于控制文件备份和恢复权限分配的本地组。                     |
| DOMAIN_ALIAS_RID_REPLICATOR                     | 0x00000228 | S-1-5-32-552 | 负责将安全数据库从主域控制器复制到备份域控制器的本地组。这些帐户仅供系统使用。 |
| DOMAIN_ALIAS_RID_RAS_SERVERS                    | 0x00000229 | S-1-5-32-553 | 代表 RAS 和 IAS 服务器的本地组。该组允许访问用户对象的各种属性。 |
| DOMAIN_ALIAS_RID_PREW2KCOMPACCESS               | 0x0000022A | S-1-5-32-554 | 仅存在于运行 Windows 2000 Server 的系统上的本地组。有关更多信息，请参阅[允许匿名访问](https://docs.microsoft.com/en-us/windows/win32/secauthz/allowing-anonymous-access)。 |
| DOMAIN_ALIAS_RID_REMOTE_DESKTOP_USERS           | 0x0000022B | S-1-5-32-555 | 代表所有远程桌面用户的本地组。                               |
| DOMAIN_ALIAS_RID_NETWORK_CONFIGURATION_OPS      | 0x0000022C | S-1-5-32-556 | 代表网络配置的本地组。                                       |
| DOMAIN_ALIAS_RID_INCOMING_FOREST_TRUST_BUILDERS | 0x0000022D | S-1-5-32-557 | 代表任何林信任用户的本地组。                                 |
| DOMAIN_ALIAS_RID_MONITORING_USERS               | 0x0000022E | S-1-5-32-558 | 代表所有被监控用户的本地组。                                 |
| DOMAIN_ALIAS_RID_LOGGING_USERS                  | 0x0000022F | S-1-5-32-559 | 负责记录用户的本地组。                                       |
| DOMAIN_ALIAS_RID_AUTHORIZATIONACCESS            | 0x00000230 | S-1-5-32-560 | 代表所有授权访问的本地组。                                   |
| DOMAIN_ALIAS_RID_TS_LICENSE_SERVERS             | 0x00000231 | S-1-5-32-561 | 仅存在于运行允许终端服务和远程访问的服务器操作系统的系统上的本地组。 |
| DOMAIN_ALIAS_RID_DCOM_USERS                     | 0x00000232 | S-1-5-32-562 | 代表可以使用分布式组件对象模型 (DCOM) 的用户的本地组。       |
| DOMAIN_ALIAS_RID_IUSERS                         | 0X00000238 | S-1-5-32-568 | 代表 Internet 用户的本地组。                                 |
| DOMAIN_ALIAS_RID_CRYPTO_OPERATORS               | 0x00000239 | S-1-5-32-569 | 代表对密码操作员的访问的本地组。                             |
| DOMAIN_ALIAS_RID_CACHEABLE_PRINCIPALS_GROUP     | 0x0000023B | S-1-5-32-571 | 代表可以缓存的主体的本地组。                                 |
| DOMAIN_ALIAS_RID_NON_CACHEABLE_PRINCIPALS_GROUP | 0x0000023C | S-1-5-32-572 | 代表无法缓存的主体的本地组。                                 |
| DOMAIN_ALIAS_RID_EVENT_LOG_READERS_GROUP        | 0x0000023D | S-1-5-32-573 | 代表事件日志阅读器的本地组。                                 |
| DOMAIN_ALIAS_RID_CERTSVC_DCOM_ACCESS_GROUP      | 0x0000023E | S-1-5-32-574 | 可以使用分布式组件对象模型 (DCOM) 连接到证书颁发机构的本地用户组。 |
| DOMAIN_ALIAS_RID_RDS_REMOTE_ACCESS_SERVERS      | 0x0000023F | S-1-5-32-575 | 代表 RDS 远程访问服务器的本地组。                            |
| DOMAIN_ALIAS_RID_RDS_ENDPOINT_SERVERS           | 0x00000240 | S-1-5-32-576 | 代表端点服务器的本地组。                                     |
| DOMAIN_ALIAS_RID_RDS_MANAGEMENT_SERVERS         | 0x00000241 | S-1-5-32-577 | 代表管理服务器的本地组。                                     |
| DOMAIN_ALIAS_RID_HYPER_V_ADMINS                 | 0x00000242 | S-1-5-32-578 | 代表 hyper-v 管理员的本地组                                  |
| DOMAIN_ALIAS_RID_ACCESS_CONTROL_ASSISTANCE_OPS  | 0x00000243 | S-1-5-32-579 | 代表访问控制辅助 OPS 的本地组。                              |
| DOMAIN_ALIAS_RID_REMOTE_MANAGEMENT_USERS        | 0x00000244 | S-1-5-32-580 | 代表远程管理用户的本地组。                                   |
| DOMAIN_ALIAS_RID_DEFAULT_ACCOUNT                | 0x00000245 | S-1-5-32-581 | 代表默认帐户的本地组。                                       |
| DOMAIN_ALIAS_RID_STORAGE_REPLICA_ADMINS         | 0x00000246 | S-1-5-32-582 | 代表存储副本管理员的本地组。                                 |
| DOMAIN_ALIAS_RID_DEVICE_OWNERS                  | 0x00000247 | S-1-5-32-583 | 代表的本地组可以为设备所有者进行预期的设置。                 |

该[WELL_KNOWN_SID_TYPE](https://docs.microsoft.com/en-us/windows/desktop/api/Winnt/ne-winnt-well_known_sid_type)枚举定义常用SID列表。此外，[安全描述符定义语言](https://docs.microsoft.com/en-us/windows/win32/secauthz/security-descriptor-definition-language)(SDDL) 使用[SID 字符串](https://docs.microsoft.com/en-us/windows/win32/secauthz/sid-strings)以字符串格式引用众所周知的 SID。











参考：

https://docs.microsoft.com/en-us/windows/win32/secauthz/well-known-sids