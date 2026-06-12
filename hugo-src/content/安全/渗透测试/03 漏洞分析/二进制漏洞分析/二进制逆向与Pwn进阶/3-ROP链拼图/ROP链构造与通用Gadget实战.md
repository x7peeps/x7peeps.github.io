---
title: "艺术级的拼图：ROP链(Return-Oriented Programming)构造与通用Gadget"
date: 2026-06-11T19:00:00+08:00
draft: false
weight: 3
---

# 艺术级的拼图：ROP链(Return-Oriented Programming)构造与通用Gadget

在上一篇 Ret2Libc 的实战中，我们通过溢出覆盖返回地址，成功跳转到了 `system()` 函数。但在那次推演中，有一个极其关键的细节我们一笔带过了：**在 x64 架构下，函数参数是通过寄存器（如 `rdi`）传递的。我们是如何把 `/bin/sh` 的地址塞进 `rdi` 里的？**

答案就是：**ROP（面向返回编程）**。

当 DEP 彻底封死了在内存中直接执行恶意代码的可能性后，黑客们发明了这种艺术级的攻击手法。既然不能写新代码，那就**把程序自身现有的合法代码片段拆碎，像拼图一样重新组合，拼凑出我们想要的逻辑**。

---

## 1. Gadget：ROP 拼图的原子模块

在二进制文件中，一个以 `ret`（返回）指令结尾的短小汇编指令序列，被称为 **Gadget**。

例如，在程序的某个角落，可能恰好存在这样三个字节的机器码 `5f c3`。
反汇编后，它代表的意思是：
```assembly
pop rdi    ; 5f
ret        ; c3
```
这就是一个极其经典的 Gadget。它的作用是：**从当前栈顶弹出一个值存入 `rdi` 寄存器，然后执行 `ret` 跳转到下一个地址。**

### 1.1 ROP 链的运行机制
ROP 的核心在于对**栈（Stack）**的绝对控制。
攻击者通过栈溢出，在栈上精心布置一系列的 **Gadget 地址** 和 **数据**。

**微观执行推演：**
假设攻击者在栈上覆盖了如下布局（从低地址到高地址）：
1.  `0x400683` (这是 `pop rdi; ret` Gadget 的地址)
2.  `0x7ffff7b92000` (这是 `/bin/sh` 字符串的地址)
3.  `0x7ffff7a03b40` (这是 `system()` 函数的地址)

当当前函数执行到最后的 `ret` 时，CPU 会进行如下疯狂的接力赛：
*   **第一步**：当前函数的 `ret` 将栈顶的值 `0x400683` 弹给 `rip`。CPU 跳转到 `pop rdi; ret`。此时 `rsp` 下移一位。
*   **第二步**：执行 `pop rdi`。CPU 将当前栈顶的值 `0x7ffff7b92000` (`/bin/sh`) 弹出，存入 `rdi` 寄存器。此时 `rsp` 再次下移一位。
*   **第三步**：执行 Gadget 里的 `ret`。CPU 将当前栈顶的值 `0x7ffff7a03b40` (`system`) 弹出给 `rip`。
*   **终局**：CPU 跳转到 `system()`，而此时 `rdi` 寄存器里刚好是我们准备好的 `/bin/sh` 参数。成功 GetShell！

在这个过程中，CPU 一直在执行合法的代码片段，完美绕过了 DEP 数据执行保护。

---

## 2. 寻找拼图：Ropper 与 ROPgadget

要在庞大的二进制程序或 `libc.so` 中手动寻找这些 `ret` 结尾的片段简直是大海捞针。实战中，我们使用自动化工具。

```bash
# 使用 ROPgadget 寻找 pop rdi; ret
ROPgadget --binary ./vulnerable_elf --only "pop|ret" | grep "rdi"
# 输出: 0x0000000000400683 : pop rdi ; ret
```

**为什么能在程序里找到这么多奇奇怪怪的 Gadget？**
因为 x86 架构是变长指令集，且指令极其密集。有时即使原本不是一条指令，但如果你从**指令中间的某个字节开始解码**，它刚好就是你想要的指令！这种“错位解码”极大地丰富了 Gadget 的数量。

---

## 3. Ret2Csu：通用 Gadget (Universal Gadget) 的奥秘

在 x64 架构下，我们需要控制 6 个寄存器来传递参数（`rdi`, `rsi`, `rdx`, `rcx`, `r8`, `r9`）。
如果在较小的程序中，我们能找到 `pop rdi; ret`，但不一定能找到 `pop rdx; ret` 怎么办？

这时候，**通用 Gadget（Ret2Csu）** 就派上用场了。

### 3.1 __libc_csu_init 函数的馈赠
在几乎所有使用 Glibc 动态链接的 64 位 ELF 程序中，都会自动链接一个初始化函数 `__libc_csu_init`。这个函数内部包含了两段极其完美的汇编代码，我们称之为 **Gadget 1** 和 **Gadget 2**。

**Gadget 1 (位于函数末尾):**
```assembly
0x40065a: pop rbx
0x40065b: pop rbp
0x40065c: pop r12
0x40065e: pop r13
0x400660: pop r14
0x400662: pop r15
0x400664: ret
```
**作用**：一口气从栈上弹出 6 个值，让我们能够**完全控制这 6 个寄存器**！

**Gadget 2 (位于函数中间):**
```assembly
0x400640: mov rdx, r15
0x400643: mov rsi, r14
0x400646: mov edi, r13d
0x400649: call QWORD PTR [r12+rbx*8]  ; 关键调用！
... (中间一些指令)
0x400654: add rbx, 1
0x400658: cmp rbp, rbx
0x40065b: jne 0x400640  ; 循环检查
```
**作用**：把我们刚才在 Gadget 1 中控制的 `r15`、`r14`、`r13` 的值，分别赋给 `rdx`、`rsi`、`edi`（正是传参的前三个寄存器）！然后它会去 `call` 我们控制的 `r12` 指向的地址。

### 3.2 Ret2Csu 攻击推演
假设我们要执行 `execve("/bin/sh", 0, 0)`。
1.  **触发 Gadget 1**：栈溢出后，首先跳到 `0x40065a`。我们在栈上布置好数据，使得：
    *   `rbx = 0` (为了配合后面的 `rbx*8` 变成 0，以及满足最后的 `cmp rbp, rbx` 不跳转)
    *   `rbp = 1`
    *   `r12 = 指向 execve 的 GOT 表地址指针`
    *   `r13 = "/bin/sh" 的地址` (传给 rdi)
    *   `r14 = 0` (传给 rsi)
    *   `r15 = 0` (传给 rdx)
2.  **跳入 Gadget 2**：Gadget 1 `ret` 时，栈上的下一个地址填为 `0x400640`。
3.  **完美传参并调用**：进入 Gadget 2 后，数据被完美转移到了传参寄存器中，随后执行 `call [r12]`，也就是 `call execve`。

通过这套隐藏在每个程序内部的现成代码，我们不需要四处搜寻零碎的 Gadget，就能稳定地控制三个参数并调用任意函数。这就是 Pwn 选手眼中的代码艺术。

---

## 4. SROP (Sigreturn Oriented Programming)

当程序甚至连 `__libc_csu_init` 都没有（比如纯静态编译且去除了很多库函数的程序），而我们只有极少的 Gadget（如 `syscall` 和 `pop rax`）时，该怎么办？

**SROP 登场。**
它利用了 Linux 操作系统的**信号处理机制（Signal Handler）**。
当进程收到信号（如 Ctrl+C）时，内核会把进程当前的**所有寄存器状态（上下文，Context）全部压入栈中**（称为 Signal Frame）。信号处理完毕后，内核调用 `sigreturn` 系统调用，**从栈上把这些值原封不动地弹回给所有寄存器**。

**攻击思路：**
1. 攻击者在栈上**伪造一个完整的 Signal Frame**（里面填满了攻击者想要的各个寄存器的值，比如 `rdi=/bin/sh`, `rip=syscall_addr`）。
2. 利用溢出，让程序执行 `mov rax, 15`（15是 `sigreturn` 的系统调用号），然后执行 `syscall` 指令。
3. 内核以为刚处理完信号，于是把攻击者伪造的栈帧数据，一股脑全部恢复到了物理寄存器中。
4. 瞬间，所有寄存器全被劫持，程序直接执行 `execve`。

ROP 链的构造，就是一场攻击者与编译器在有限内存空间中的极限拉扯。当你能够熟练地拼接这些机器码碎片时，你便掌控了二进制世界的法则。
