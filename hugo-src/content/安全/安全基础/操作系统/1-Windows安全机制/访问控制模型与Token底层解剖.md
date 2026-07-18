---
date: 2024-07-06T19:55:22+08:00
title: "Windows 访问控制模型：SID、Token 与 DACL/SACL 深度解剖"
weight: 10
---

# Windows 访问控制模型：SID、Token 与 DACL/SACL 深度解剖

在网络渗透中，当我们利用漏洞成功获取了目标服务器的一个 Shell（如 WebShell 或反弹 Shell）时，第一件事通常是执行 `whoami`。
但你真的理解 `whoami` 背后返回的那个名字意味着什么吗？为什么有的时候你是 Administrator，却依然无法读取某个文件、无法导出注册表的 SAM 表？

这一切的答案，都隐藏在 Windows 坚如磐石的 **访问控制模型 (Access Control Model)** 之中。本文将结合实战命令行，深度解剖 Windows 的身份标识 (SID)、访问令牌 (Token) 以及安全描述符 (SD) 中的 DACL 与 SACL 机制。

---

## 1. 身份的物理本质：SID (安全标识符)

在 Windows 内核的眼里，没有 "Administrator" 或 "Guest" 这种人类可读的名字，它只认一串唯一的数字编码——**SID (Security Identifier)**。

### 1.1 SID 的结构解剖
SID 的标准格式通常为：`S-1-5-21-3623811015-3361044348-30300820-1001`
*   `S-1-5`：表示这是一个由 NT 颁发的版本为 1 的 SID。
*   `21-3623...`：这一大串随机数字是**域或本地机器的唯一标识符**。如果两台机器这串数字相同，说明它们可能被克隆过（如通过 VMware 克隆未进行 Sysprep）。
*   `-1001`：这叫 **RID (Relative Identifier，相对标识符)**。
    *   `500`：永远是内置的 Administrator（无论你把它重命名成了什么）。
    *   `501`：永远是内置的 Guest。
    *   `1000` 以上：通常是用户自己创建的普通账户。

> **💻 实战接触：利用 `wmic` 或 `whoami` 查看 SID**
> 我们可以在 CMD 中执行 `whoami /user` 来查看当前用户的真实 SID：
> ```cmd
> C:\> whoami /user
> 
> 用户信息
> ----------------
> 用户名             SID
> ================== =============================================
> corp\alice         S-1-5-21-123456789-123456789-123456789-1005
> ```
> 在域渗透中，如果黑客拿到了域控权限，他会给自己伪造一个包含 RID 500 的 SID（即著名的 Golden Ticket 黄金票据），以此骗过所有域内机器，让它们误以为黑客就是 Domain Admin。

---

## 2. 权限的载体：Access Token (访问令牌)

当我们输入密码成功登录 Windows 后，本地安全机构 (LSASS) 会为我们生成一个 **Access Token（访问令牌）**。
你可以把 Token 理解为进入一家大公司的“工牌”。每次你尝试打开文件、修改注册表、启动进程时，Windows 内核都会要求你出示这块工牌。

### 2.1 Token 里到底装了什么？
执行 `whoami /all` 可以看到 Token 的完整内容，它主要包含三大块：
1.  **用户 SID**：证明你是谁。
2.  **组 SID 列表**：你属于哪些组（如 Administrators 组、Users 组）。
3.  **特权列表 (Privileges)**：你拥有哪些系统级特权（如是否能关机、是否能加载设备驱动、是否能调试程序）。

> **💻 实战接触：查看关键特权 (Privileges)**
> ```cmd
> C:\> whoami /priv
> 
> 特权信息
> ----------------------
> 特权名                        描述                          状态
> ============================= ============================= ========
> SeShutdownPrivilege           关闭系统                      已禁用
> SeDebugPrivilege              调试程序                      已启用
> SeImpersonatePrivilege        身份验证后模拟客户端          已启用
> ```
> **安全警报**：如果你在一个普通用户的 Shell 中看到了 `SeImpersonatePrivilege`（通常服务账户如 IIS/SQL Server 会有），恭喜你！你可以利用著名的 **Potato 系列漏洞 (如 RottenPotato, JuicyPotato)**，将这个普通的 Token 瞬间提升为 `NT AUTHORITY\SYSTEM`（最高权限）！

### 2.2 Token 的两种类型：Primary 与 Impersonation
*   **Primary Token (主令牌)**：每个进程都有一个主令牌。当你在桌面上双击打开记事本时，记事本进程会**继承**你 Explorer 进程的主令牌。
*   **Impersonation Token (模拟令牌)**：Windows 允许一个高权限的服务（如 SMB 服务端），在处理客户端请求时，“借用”客户端的 Token 来执行操作。这叫**身份模拟 (Impersonation)**。这是域内横向移动（如利用命名管道窃取 Token）的核心理论基础。

---

## 3. 资源的守门员：安全描述符 (Security Descriptor)

现在我们有了“工牌”(Token)，当我们去访问一个文件夹 (资源) 时，门卫如何决定让不让我们进？
Windows 中每一个安全对象（文件、注册表键、命名管道、进程）都绑着一个 **安全描述符 (SD)**。

SD 包含四个部分：Owner (所有者)、Group (所属组)、**DACL (自主访问控制列表)** 和 **SACL (系统访问控制列表)**。

### 3.1 DACL：谁能干什么？
DACL (Discretionary Access Control List) 是最核心的权限列表。它由多个 **ACE (访问控制项)** 组成。
每一个 ACE 规定了：**[允许/拒绝] + [哪个 SID] + [什么权限 (读/写/执行)]**。

**DACL 的验证逻辑（按顺序匹配，拒绝优先）**：
当你的 Token 试图访问文件时，系统会自上而下遍历 DACL：
1. 如果遇到明确写着“拒绝你的 SID”的 ACE，立刻**拒绝访问**。
2. 如果遇到明确写着“允许你的 SID”的 ACE，立刻**允许访问**。
3. 如果把整个 DACL 遍历完了，都没提到你，默认**拒绝访问**（隐式拒绝）。

> **💻 实战接触：使用 `icacls` 操作 DACL**
> 在 CMD 中，我们可以使用 `icacls` 命令查看一个文件的 DACL：
> ```cmd
> C:\> icacls secret.txt
> secret.txt NT AUTHORITY\SYSTEM:(I)(F)        # 系统账户拥有 (F) Full 完全控制权限
>            BUILTIN\Administrators:(I)(F)     # 管理员组拥有完全控制权限
>            CORP\alice:(I)(R)                 # 用户 alice 拥有 (R) Read 只读权限
> ```
> 很多时候渗透测试人员传上了提权后的木马文件，为了防止被管理员删除，会利用 `icacls` 强行修改 DACL，甚至拒绝 SYSTEM 账户访问。

### 3.2 SACL：谁动了我的奶酪？
与 DACL 决定“能不能访问”不同，SACL (System Access Control List) 决定的是**“要不要记日志”**。
企业安全建设中，蓝队（防守方）非常依赖 SACL。如果在关键文件上配置了 SACL（比如规定：如果任何人尝试修改这个文件，无论成功还是失败，都记录下来），当黑客触碰该文件时，Windows 事件查看器 (Event Viewer) 中就会生成一条安全审计日志 (Event ID 4663)，直接触发安全中心的报警。

---

## 4. 总结与攻防意义

Windows 的访问控制模型构成了其底层的安全堡垒：
*   **SID** 是身份的唯一防伪标识。
*   **Token** 是携带 SID 和系统特权（Privileges）的通行证。
*   **DACL** 是挂在资源门上的锁，严格规定了哪些 Token 可以进入。

在高级持续性威胁 (APT) 和内网渗透中，攻击者的很多动作（如利用提权漏洞修改 Token 特权、利用 Pass-the-Hash 伪造身份凭证、利用 `SeTakeOwnershipPrivilege` 强行夺取文件所有权从而修改 DACL），本质上都是在这套复杂的数学和逻辑模型中寻找破绽。

> **下一篇预告**：
> 既然 Token 和 SID 如此重要，那么我们在开机输入密码的那一刻，Windows 是如何验证密码正确，并给我们颁发 Token 的？
> 下一篇，我们将深入 Windows 的**认证体系**，揭开古老的 **NTLM 协议** 与现代的 **Kerberos 票据体系** 的神秘面纱，并剖析大名鼎鼎的 **Pass-the-Hash (哈希传递)** 攻击！