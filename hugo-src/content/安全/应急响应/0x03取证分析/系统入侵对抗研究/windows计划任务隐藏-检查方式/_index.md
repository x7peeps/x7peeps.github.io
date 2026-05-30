---
title: windows计划任务隐藏-检查方式
tag: 系统入侵对抗;
date: 2021-08-30T10:00:00+08:00
---

#### 计划任务隐藏

这里我们参考AnonySec的文章创建隐藏计划任务https://mp.weixin.qq.com/s/-G9aOm0mBh7eD7S5j9Lvog

创建任务

```
schtasks /create /tn TestSchtask /tr C:\Windows\System32\cmd.exe /sc DAILY /st 13:00:00
```

查询创建任务

```
schtasks /query /TN TestSchtask /V /FO list
```

Id {GUID}，任务对应的guid编号。
Index 一般任务值为3，其他值未知。
SD Security Descriptor 安全描述符，在Windows中，每一个安全对象实体都拥有一个安全描述符，安全描述符包含了被保护对象相关联的安全信息的数据结构，它的作用主要是为了给操作系统提供判断来访对象的权限。

![img](1629600852331-02bc1791-ff49-4b3e-bf2c-594331b71169.png)



##### 1. 非完全隐藏计划任务方式- index设0

通过修改index值，为0进行隐藏。



HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\TaskCache\Tree



这里需要注意rugu 想要修改index值，那么攻击时需要调整权限属性，将注册表的管理者权限改为当前用户，以修改index值。



whoami可知当前用户为desktop-d9itqnu\xt

C:\Users\xt>whoami

desktop-d9itqnu\xt

![img](1629560832315-fbec3a0c-e3fd-47de-a4c8-2368dea76988.png)

![img](1629560809290-49c26521-eac6-454c-8a65-cbb8461fdd30.png)



![img](1629597981591-7b4efc8c-fdb2-4acc-862c-5b0bf63df880.png)

![img](1629598000798-9abc3679-f39b-46a6-8389-9b4535b75398.png)

schtasks.exe无法直接查到

![img](1629598324129-2ae47bdb-35e9-4190-b9d6-05aacd2018bc.png)

如果知道计划任务名称可以通过指定计划任务名称查询值：

![img](1629598436515-0eddc939-4f3b-4b7c-aa3a-c3e95a0da4ac.png)

![img](1629600326055-57e95b51-7043-489e-8a55-093585ac8cab.png)

我们将index在改变值的前后schtasks的查询结果分别保存并对比，index=0导出保存为1.txt，将index=1导出保存为2.txt可以看到，**结论一：确实在查询schtasks的时候由于index设置导致无法在schtasks查询到计划任务。**

![img](1629600300915-49450b71-1f5b-4782-8c29-82c38459b549.png)

并且在当前用户的计划任务UI中也是无法看到。

![img](1629600532957-5b41561f-65e6-4e66-893b-40643483ccb5.png)

##### 应对方式

这时由于注册表没有改动，并且reg功能正常的情况下，我们是可以通过reg针对计划任务树查询并确定可疑的计划任务。

1. 直接查询注册表HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\TaskCache\Tree中的计划任务树。

```
reg query "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\TaskCache\Tree"  
```

![img](1629601186735-6fe228d8-f6b1-4690-83d2-fc3d44a02c40.png)



1. 针对可疑的计划任务我们仍然可疑通过schtasks指定计划任务名称查询。指定TestSchtask查询计划任务详情。

这里需要注意，由于index值为0，此时想要通过schtasks发现异常的任务项是无法获取index值为0的项目，此时通过对比注册表查询结果可以快速定位异常的注册表值，再通过schtasks指定任务名称可以强制查询得到对应详情。

```
schtasks /query /TN TestSchtask /V /FO list
```

![img](1629601414614-5505d3ac-0f85-4d62-a26e-63e7618b7053.png)



1. 由于在修改index的时候需要注册表归属从原默认的system修改成当前用户，因此这个注册表的归属地方会有修改的痕迹



可以重点检查相关注册表的归属，确认痕迹：

HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\TaskCache\Tree

![img](1629560832315-fbec3a0c-e3fd-47de-a4c8-2368dea76988.png)

##### 2. 完全隐藏计划任务方式 - SD 删除

删除 HKLM\Software\Microsoft\Windows NT\CurrentVersion\Schedule\TaskCache\Tree\{TaskName}\SD

删除 %SystemRoot%\System32\Tasks 下任务对应的 XML 文件

![img](1629604281129-f360d491-bbec-41a0-ac94-66620eccae35.png)![img](1629604296769-dde2c79f-3834-45b7-8e4e-d05cb0d4c7a7.png)



这种情况对我们检查的影响是在schtasks查询的时候无法指定隐藏的计划任务查询详情了，我们仍然可以通过注册表来审计异常项，

![img](1629607571923-72844fc5-1027-4e40-904f-9305b7d97511.png)
