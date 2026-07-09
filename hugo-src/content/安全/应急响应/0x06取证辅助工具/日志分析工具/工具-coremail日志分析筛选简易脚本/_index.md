---
title: Coremail日志分析脚本
date: 2024-12-05T00:00:00+08:00
tags: [工具开发, 脚本, 日志分析]
---
# Coremail Log Analyze script
同学在应急的时候遇到coremail日志取证问题，量比较大，需要针对邮件或IP搜索。这里做了个简易的筛选方便大家在应急的分析使用。
![](http://blogimage.xtpeeps.cn/20191015143532.png-A)
针对这类日志进行关键自筛选并输出。

<!--more-->

# 方案
这里全遍历文件，读取文件筛选匹配关键字整行另存新文件保存

# 使用方法
```
Usage: python3 CLA.py <logfolders> <key> <output_filename>
```
logfolders  日志文件夹（测试环境下现场取的folder/folders/log结构文件夹）
key 搜索关键字，关键字或用逗号（,）隔开的关键字组
output_filename 保存文件位置及文件名

# 源码
```
# python3
# -*- encoding: utf-8 -*-
# Pwnda.zhang<XTPEEPS.CN>


import os,re,sys

def main(dir,key,output_filename):
    for home,dirs,files in os.walk(dir):
        # print("-----dir list------")
        for dir in dirs:
            print(dir)
        # print("------dir list end------")
        # print("------file list------")
        for filename in files:
            print(filename)
            fullname=os.path.join(home,filename)
            analyze(key,fullname,output_filename)
            # print(fullname)
        # print("------file list end------")

def analyze(key,filename,output_filename):
    file=open(filename,'r')
    with open(output_filename,"a+") as f:
        f.write("\n"+filename+"\n")
        for line in file:
            if re.search(",",key):
                keys=key.replace(",","|")
                keyline=re.findall(keys,line)
            else:
                keyline=re.findall(".*{}.*".format(key),line)
            if keyline :
                print(line)
                f.write(line)
            else:
                continue
    f.close()
    file.close()

if __name__=="__main__":
    # if sys.argv[1]!="" and sys.argv[2]!="" and sys.argv[3]!="":
    try:
        main(sys.argv[1],sys.argv[2],sys.argv[3])
    except:
        print("Usage: python3 CLA.py <logfolders> <key> <output filename>")
```
