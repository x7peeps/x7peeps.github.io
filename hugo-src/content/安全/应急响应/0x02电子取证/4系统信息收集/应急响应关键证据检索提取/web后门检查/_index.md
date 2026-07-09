---
title: web后门查杀
tag: 关键证据检索提取;
date: 2024-01-15T00:00:00+08:00
---

## linux下后门查杀

### 牧云（18年已停止更新）

CloudWalker（牧云）是长亭推出的一款开源服务器安全管理平台。根据项目计划会逐步覆盖服务器资产管理、威胁扫描、Webshell扫描查杀、基线检测等各项功能。目前开源版go编写，停留在18年版。

https://github.com/chaitin/cloudwalker



使用方法

 ./webshell-detector -html -output result.html /path/to/web-root/





### 河马（linux）

拥有海量webshell样本，形成科学查杀鉴定标准，可对同行产品进行查杀能力测评。

http://www.shellpub.com



linux用法

```
./hm scan 你的web目录  # 保存为result.csv文件
./hm deepscan 你的web目录 
扫描时开启深度解码
```



## windows下后门查杀

### D盾

D盾_防火墙』专为IIS设计的一个主动防御的保护软件,以内外保护的方式 防止网站和服务器给入侵,在正常运行各类网站的情 况下，越少的功能，服务器越安全的理念而设计！ 限制了常见的入侵方法，让服务器更安全!

http://www.d99net.net/

直接下载使用

http://www.d99net.net/News.asp?id=106



### 河马（windows）

拥有海量webshell样本，形成科学查杀鉴定标准，可对同行产品进行查杀能力测评。

http://www.shellpub.com

https://www.shellpub.com/doc/hm_win_usage.html

运行程序即可

查看帮助

```
hm -h
```

查看版本

```
hm version
```

扫描后门

```
hm scan 你的web目录
扫描完成之后结果会保存为result.csv文件，使用记事本或者excel打开查看
```

升级

```
hm update
```





## 服务形式查杀工具

### 百度webdir+（需要联网）

[https://scanner.baidu.com/](https://scanner.baidu.com/#/pages/intro)

您可以通过如下方式提交需要扫描的文件，比如要扫描的文件为 web.zip，那么您需要执行如下命令，

```
curl https://scanner.baidu.com/enqueue -F archive=@web.zip
```

如果上传成功，您将会获取到一串JSON

```
{
  "status": 0,
  "descr":  "Task enqueued",
  "md5":    "b786fd0010f171cb85803eca877eb9d0",
  "url":    "https://scanner.baidu.com/result/b786fd0010f171cb85803eca877eb9d0"
}
```

其中URL的值表示扫描结果地址，您可以使用如下命令获取，

```
curl https://scanner.baidu.com/result/b786fd0010f171cb85803eca877eb9d0
```

同样，您会获取到一串JSON

```
[
  {
    // 文件 md5
    "md5": "b786fd0010f171cb85803eca877eb9d0",
    // 一共多少文件
    "total": 1,
    // 检测出多少
    "detected": 1,
    // 扫描状态
    "status": "done",
    // 已经扫描了多少文件
    "scanned": 1,
    // 检测结果
    "data": [
    {
        // 文件相对路径
        "path": "/b786fd0010f171cb85803eca877eb9d0.php",
        // 检测结果
        "descr": "BDS.WebShell.Chopper.1"
    }
]
```

另外，我们支持批量获取检测结果，e.g

```
curl https://scanner.baidu.com/result/b786fd0010f171cb85803eca877eb9d0,b786fd0010f171cb85803eca877eb9d0
```

### Web Shell Detector（维护终止）（本地web服务）



项目地址（断更很久了）：https://github.com/emposha/PHP-Shell-Detector

python客户端（可以选择在线/离线获取特征库，但是项目16年后断更了）：https://github.com/emposha/Shell-Detector





启动Web Shell Detector:

1. 上传shelldetect.php和shelldetect.db到web根目录下
2. 在浏览器中打开shelldetect.php如 http://www.website.com/shelldetect.php
3. 使用默认用户名和密码登录

Username: admin Password: protect

1. 检查所有的奇怪的文件也可以提交到在线平台 [http://www.shelldetector.com](http://www.shelldetector.com/)



### 各厂商的EDR产品、杀毒软件、监测软件等产品





参考：

https://www.uedbox.com/post/51754/

https://www.shellpub.com/doc/hm_linux_usage.html
