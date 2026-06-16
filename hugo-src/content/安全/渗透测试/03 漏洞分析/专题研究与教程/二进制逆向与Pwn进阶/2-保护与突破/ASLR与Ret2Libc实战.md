---
title: "保护机制与突破：ASLR/DEP/Canary底层逻辑与Ret2Libc实战"
date: 2026-06-11T18:00:00+08:00
draft: false
weight: 2
---

# 保护机制与突破：ASLR/DEP/Canary底层逻辑与Ret2Libc实战

在上一篇中，我们推演了最基础的栈溢出攻击：通过输入过长的数据，覆盖栈上的返回地址（Return Address），让 `rip` 跳转到我们在栈上布置的恶意代码（Shellcode）去执行。

这种攻击在 90 年代大行其道，被称为“砸壳（Smashing the Stack）”。然而，现代操作系统（Windows/Linux）和编译器（GCC/MSVC）绝不会坐以待毙。它们构建了三道极其坚固的底层防线。

本文将拆解这三大保护机制的底层逻辑，并推演 Pwn 选手是如何利用 **Ret2Libc** 技术将其一一撕裂的。

---

## 1. 现代操作系统的三大底层防线

要突破防线，必须先了解防线是如何运作的。

### 1.1 DEP / NX (数据执行保护)
*   **底层逻辑**：以前的栈是既可读写，又可执行的（RWX）。DEP（Data Execution Prevention，Linux 下叫 NX - No eXecute）通过 CPU 的 MMU（内存管理单元）和页表属性，将栈（Stack）和堆（Heap）等数据段标记为**不可执行（RW-）**。
*   **防守效果**：攻击者依然可以往栈上写入 Shellcode，也可以劫持 `rip` 跳过去，但 CPU 只要一尝试执行栈上的代码，立刻抛出段错误（Segmentation Fault）崩溃。传统 Shellcode 彻底失效。

### 1.2 ASLR (地址空间布局随机化)
*   **底层逻辑**：如果栈不能执行，攻击者就会想办法跳到代码段（Text 段）或者动态链接库（如 `libc.so`）里去执行现成的函数（比如跳到 `system()`）。ASLR（Address Space Layout Randomization）让程序每次启动时，栈、堆、动态链接库在虚拟内存中的**加载基址完全随机**。
*   **防守效果**：攻击者在本地算好的 `system()` 函数地址是 `0x7ffff7a03b40`，但放到目标服务器上运行，地址可能变成了 `0x7ffff7b55b40`。盲目跳转只会导致崩溃。

### 1.3 Stack Canary (金丝雀)
*   **底层逻辑**：为了防止栈溢出覆盖返回地址，编译器会在函数的 Prologue（序言）阶段，在局部变量和 `rbp` 之间，插入一个随机生成的 8 字节（x64）随机数。在函数 Epilogue（结语）准备 `ret` 之前，会检查这个随机数有没有被篡改。
*   **防守效果**：由于它是随机的，攻击者如果想用连续的 `A` 覆盖到返回地址，必定会先破坏 Canary。程序检查出 Canary 不对，立刻调用 `__stack_chk_fail` 强行终止程序。

---

## 2. 突破第一道防线：Ret2Libc (Return-to-Libc)

当 DEP 封杀了栈上的 Shellcode 时，攻击者转向了内存中本来就存在的、拥有执行权限的代码：**动态链接库（Libc）**。

`libc.so` 是 Linux 下 C 语言的底层运行库，几乎所有程序都会加载它。在这个庞大的库中，包含着我们梦寐以求的函数：`system()`。

**Ret2Libc 的核心思想：**
既然我不能在栈上执行代码，那我就通过栈溢出，把返回地址（RET）覆盖为 `libc` 中 `system()` 函数的地址，同时在栈上或者寄存器中布置好参数（比如指向字符串 `/bin/sh` 的指针）。当函数 `ret` 时，程序就会乖乖地去执行 `system("/bin/sh")`。

---

## 3. 实战推演：在 ASLR 下打通 Ret2Libc

有了思路，我们来推演在开启了 DEP 和 ASLR（但假设暂时没有 Canary）的环境下，如何完成一次完美的 Pwn。

### 3.1 难点：ASLR 导致 Libc 地址未知
因为 ASLR，`libc.so` 的加载基址每次都在变。但是，**同一个 `libc` 版本中，函数之间的相对偏移（Offset）是永远不变的！**
例如：如果我知道了 `puts()` 函数的真实内存地址，减去 `puts()` 在 `libc` 文件中的偏移量，就能算出当前 `libc` 的**真实加载基址**。
`Libc_Base = Real_Addr(puts) - Offset(puts)`
有了基址，加上 `system()` 的偏移，就能算出 `system()` 的真实地址！

### 3.2 步骤一：信息泄露 (Information Leak)
我们需要先泄露一个函数的真实地址。假设程序有一个栈溢出漏洞，并且导入了 `puts` 函数。
在 x64 下，函数的第一个参数通过 `rdi` 寄存器传递。

**构造第一次 ROP 链 (Payload 1)：**
我们溢出栈，覆盖返回地址，使其执行以下动作序列：
1.  跳转到 `pop rdi; ret` 指令（这叫 Gadget，后面详述）。
2.  将 `puts` 在 GOT 表中的地址（GOT表存着函数的真实地址）填入栈中，它会被 `pop` 给 `rdi`。
3.  跳转到 `puts` 的 PLT 地址去执行。
4.  执行完 `puts` 后，跳转回 `main` 函数重新开始（为了第二次溢出）。

*结果*：程序在终端输出了 `puts` 函数在当前内存中的真实地址（如 `0x7ffff7a649c0`），然后重新回到了 `main` 函数等待输入。

### 3.3 步骤二：计算真实地址
攻击者通过 Python 的 Pwntools 脚本，瞬间接收这个地址，并在本地进行计算：
```python
# 接收泄露的真实地址
puts_real_addr = u64(p.recvuntil('\n').strip().ljust(8, b'\x00'))
# 计算 Libc 基址
libc_base = puts_real_addr - libc.symbols['puts']
# 计算 system 和 /bin/sh 的真实地址
system_addr = libc_base + libc.symbols['system']
binsh_addr = libc_base + next(libc.search(b'/bin/sh\x00'))
```

### 3.4 步骤三：GetShell
程序现在重新回到了 `main` 函数，再次触发栈溢出。这一次，我们已经知道了所有的地址。

**构造第二次 ROP 链 (Payload 2)：**
1.  溢出填充局部变量。
2.  覆盖返回地址为 `pop rdi; ret` 的地址。
3.  将算好的 `/bin/sh` 字符串地址填入栈中（作为 `system` 的参数传递给 `rdi`）。
4.  覆盖下一个返回地址为 `system()` 的真实地址。

当第二次 `main` 函数 `ret` 时，CPU 完美执行：`pop rdi` 拿到 `/bin/sh`，接着跳到 `system`。

**Boom! 终端弹出了 `#` 提示符，你获得了服务器的 Shell。**

---

## 4. 如何对付 Canary？

刚才的推演假设没有 Canary。如果有 Canary，直接溢出就会被发现。突破 Canary 通常有两种底层思路：

1.  **信息泄露 (Leak Canary)**：
    如果程序存在格式化字符串漏洞（如 `printf("%p")`），或者栈溢出时可以连着 Canary 一起打印出来。我们就可以先泄露 Canary 的值，然后在构造 Payload 时，把真实的 Canary 值“原样填回去”，从而骗过检查。
2.  **栈劫持 (Stack Pivoting)**：
    如果不破坏 Canary，那我们就利用其它漏洞（如栈变量未初始化），将 `rbp` 劫持到我们可以控制的内存区域（如 BSS 段），强行把执行舞台从栈上搬走。

Ret2Libc 证明了：即使把所有数据段都标为不可执行，即使把地址全部打乱，只要攻击者能控制栈上的数据布局，就能利用程序自己现有的代码（Libc），组装出毁灭性的武器。这，就是 ROP（面向返回编程）的雏形。
