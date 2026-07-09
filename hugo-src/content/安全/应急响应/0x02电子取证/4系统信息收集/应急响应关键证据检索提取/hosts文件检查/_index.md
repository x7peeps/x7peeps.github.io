---
title: hosts文件检查
tag: 关键证据检索提取;
date: 2025-09-15T00:00:00+08:00
menu: 
  main: 
    parent: "应急响应关键证据检索提取"
---

# windows下host文件检查



windows下hosts目录位置是在C:\Windows\System32\drivers\etc下hosts文件

```
type C:\Windows\System32\drivers\etc\hosts
# 创建时间
dir C:\Windows\System32\drivers\etc\hosts /t:C |find "hosts"
# 修改时间
dir C:\Windows\System32\drivers\etc\hosts /t:W |find "hosts"
# 被访问时间
dir C:\Windows\System32\drivers\etc\hosts /t:A |find "hosts"
```

![img](1629268639723-b0c21025-5af1-44d5-b486-a666699857af.png)

![img](1629268653332-ae1dd85b-986d-4d6a-8a29-888729624c2a.png)



# linux下host文件检查

linux下host文件位置在/etc/文件下hosts文件

```
cat /etc/hosts
stat /etc/hosts
```

![img](1629268566878-d598fa98-8876-4a93-a713-9e2080a9ed42.png)
