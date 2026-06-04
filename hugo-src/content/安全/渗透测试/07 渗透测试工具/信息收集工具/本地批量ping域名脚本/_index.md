---
title: 本地批量ping域名脚本
date: 2020-01-03T21:51:00+08:00
tags: 工具开发,脚本
menu: 
  main: 
    parent: "信息收集工具"
---
# 本地批量ping域名脚本
背景是同学在执行一批渗透时需要批量验证一批域名本地ping情况，这里通过powershell脚本简单制作了一个思路供同学们参考。
![](http://blogimage.xtpeeps.cn/20191020001017.png-A)

<!--more-->

源码如下：
```powershell
<#Author :PWN.ZHANG@XTPEEPS>CN#>
if($args[0] -ne ""){
    $File=Get-Content $args[0]
	foreach ($skuLine in $File) {
        Write-Host -NoNewline $skuLine " "
        (((ping $skuLine -n 1) -match "^(\d{1,3}\.){3}\d{1,3}") -split " ")[0]}
        <#Sleep 100#>
        }
Else
	{
    "useage: xx.ps <urlfile_path>"
    }
```
