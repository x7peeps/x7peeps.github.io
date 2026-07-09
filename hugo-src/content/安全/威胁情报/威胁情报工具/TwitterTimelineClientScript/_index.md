---
title: TwitterTimelineClientScript
date: 2024-07-16T00:00:00+08:00
tags: [python, twitterapi]
---

# TwitterTimelineClientScript
一个本地命令行查询/批量查询twitter推文的脚本. This is a script to get Twitter Timeline Client from user or userfile.

项目地址：https://github.com/x7peeps/TwitterTimelineClientScript

# Key Features
* 指定twitter username或者包含username行的file ，查看最近的推文信息
* 指定目录输出到文件csv
* 每次执行日志备份
* 自定义查看的推文限制
* 导出成表格

# Getting Started

1. git clone git@github.com:x7peeps/TwitterTimelineClientScript.git
2. cd TwitterTimelineClientScript
3. pip3 install -r requestments.txt
3. 编辑TwitterTimelineClientScript.py中的twitter API key
4. python3 TwitterTimelineClientScript.py -h




# Usage
```
usage: TwitterTimelineClientScript.py [-h] [-f /yourpath/twitter_name_file.txt] [-u elonmusk] [-l 5] [-o /yourpath/twitter_results_output.csv]

Twitter Api for read twitters.by x7peeps.com community v0.1

optional arguments:
  -h, --help            show this help message and exit
  -f /yourpath/twitter_name_file.txt, --filepath /yourpath/twitter_name_file.txt
                        读取文件中的username
  -u elonmusk, --username elonmusk
                        指定一个username查询twitter信息
  -l 5, --limit 5       限制查询的数量
  -o /yourpath/twitter_results_output.csv, --output /yourpath/twitter_results_output.csv
                        当使用-f批量查询的时候，可以指定一个导出路径

```

![image-20220627上午21258088](image-20220627%E4%B8%8A%E5%8D%8821258088.png)

![image-20220627上午21414370](image-20220627%E4%B8%8A%E5%8D%8821414370.png)
