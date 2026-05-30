---
title: linux隐藏进程-目录挂载方式研究
date: 2020-02-20T23:31:00+08:00
tags: 进程隐藏,持久化
---

> 分子实验室 https://molecule-labs.com/

最近在精细应急响应相关内容的时候注意到linux进程隐藏确实会是应急响应中的一个问题，因此这里对目录挂载方式的隐藏进程方式进行了实践和查询的对抗了解。

### 创建挂载隐藏进程

```
方式1
mount /dev/sda1 /proc/xxx


方式2
mount -o bind /empty/dir /porc/xxxx
```

![image.png](1622794545400-4223a5f8-f891-4650-a90a-2affabf09157.png)

![image.png](1622794898291-0acf7eb6-22ad-493a-a653-1ae5765daf9f.png)

###  查询隐藏挂载目录方式进程的办法

linux /proc/66003 文件系统内容通过挂载操作已经为空，无法获取细节

![image.png](1622794903721-735b4b9e-f456-409e-9204-727e9d2f8f4b.png)

唯一查看到隐藏进程的办法是通过cat /proc/mounts 查看挂载项中包含/proc/pid

![image.png](1622794888772-9063872b-562a-480e-ae76-bd7735355c68.png)

