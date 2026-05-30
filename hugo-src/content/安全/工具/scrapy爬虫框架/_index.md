---
title: scapy
date: 2020-09-11T12:03:49+08:00
tags: 学习,爬虫
menu: 
  main: 
    parent: "工具"
---


## 如何使用pip安装scrapy

参考：https://www.simplified.guide/scrapy/install-using-pip

scrapy是一个基于python的web爬虫。可以在python包索引(https://pypi.org/)中找到。这意味着可以通过pip安装scrapy。尽管通过pip安装的scrapy是一个很好的方式测试和融入现有的系统环境中，但是通过该渠道更新的包有可能不是最新版本的。

### 安装scrapy步骤
* 通过pip安装
```python
pip3 install scrapy
```
* 运行scrapy
> /home/user/.local/bin/scrapy

* 添加pip安装路径到环境变量（linux下没有pip环境的）
```
$ echo PATH=$PATH:/home/user/.local/bin >> ~/.bashrc #Linux
```
* 运行scrapy
> scrapy

** 这里由于使用mac下面是是mac安装scrapy的方法**
1. 下载安装
2. 安装xcode命令行工具
3. 安装scrapy
pip3 install scrapy
4. 初始化scrapy
如果想要在桌面上创建一个工程
cd /user/xt/desktop
scrapy startproject yourproject

** 未找到scrapy命令情况**
1. 首先找到scrapy的位置（我这里mac的安装位置找到在这里，可执行）
/System/Volumes/Data/Users/xt/Library/Python/3.8/bin/scrapy
```
$ /System/Volumes/Data/Users/xt/Library/Python/3.8/bin/scrapy
Scrapy 2.3.0 - no active project
Usage:
  scrapy <command> [options] [args]
Available commands:
  bench         Run quick benchmark test
  commands      
  fetch         Fetch a URL using the Scrapy downloader
  genspider     Generate new spider using pre-defined templates
  runspider     Run a self-contained spider (without creating a project)
  settings      Get settings values
  shell         Interactive scraping console
  startproject  Create new project
  version       Print Scrapy version
  view          Open URL in browser, as seen by Scrapy
  [ more ]      More commands available when run from project directory
Use "scrapy <command> -h" to see more info about a command
```
> 如果没有找到可以直接在系统搜索：find / -name "scrapy" 2>/tmp/null

2. 创建软连接到系统命令
```
ln -s /System/Volumes/Data/Users/xt/Library/Python/3.8/bin/scrapy /usr/local/bin/scrapy
```
## scrapy上手基本配置



## 如何使用scrapy创建rss
参考：
https://www.simplified.guide/scrapy/scrape-rss


rss通常是用xml格式编写的最新的网站更新内容的片段。一个很好的方法就是使用scrapy去获取最新的网站更新内容。

### 使用scrapy创建rss订阅方法
1. 打开rss页面
2. 点开rss页面内容并扩展
注意：rss页面是一个xml格式的文档，网站的更新内容通常都在channel—item元素下面。
3. 在命令行中通过```scrapy```打开rss资源，资源url通过参数的形式传入scrapy
```scrapy shell https://host```
4. 检查http返回状态，确保返回的状态是200
```
In [1]: response
Out[1]: <200 https://www.blog.google/rss>
```
5. 基于结构通过xpath搜索网站内容更新的内容
```
In [2]: posts = response.xpath('//channel/item')
```
这里的格式是根据页面的结构来看
![](http://blogimage.xtpeeps.cn/20200909180908.png-A)
6. 检查返回的待确认的匹配的数目
```
>In [3]: len(posts)
Out[3]: 20
```
7. 从第一个和最后一个里面取出一个元素进行测试
```
>>> post[0].xpath('title/text()').extract()
['研究称北极海洋已污染：污水中发现清洗牛仔布的微纤维']

```
8. 通过每个item获取所有请求的数据。
```
In [6]: for item in response.xpath('//channel/item'):
   ...:     post = {
   ...:         'title' : item.xpath('title//text()').extract_first(),
   ...:         'link': item.xpath('link//text()').extract_first(),
   ...:         'pubDate' : item.xpath('pubDate//text()').extract_first(),
   ...:     }
   ...:     print(post)
```

9. 创建scrapy根据之前的shell进程的配置编写爬虫
```
import scrapy
 
 
class ScrapeRssSpider(scrapy.Spider):
    name = 'scrape-rss'
    allowed_domains = ['https://www.blog.google/rss']
    start_urls = ['http://https://www.blog.google/rss/']
 
    def start_requests(self):
        urls = [
            'https://www.blog.google/rss',
        ]
        for url in urls:
            yield scrapy.Request(url=url, callback=self.parse)
 
    def parse(self, response):
        for post in response.xpath('//channel/item'):
            yield {
                'title' : post.xpath('title//text()').extract_first(),
                'link': post.xpath('link//text()').extract_first(),
                'pubDate' : post.xpath('pubDate//text()').extract_first(),
            }
```
10. 测试爬虫功能
```
scrapy crawl --nolog --output -:json scrape-rss
```



### 创建一个baidu爬虫
参考：https://www.jianshu.com/p/e33d0d0b10de

先创建一个项目：
```
scrapy startproject spider
cd ./spider
```
用命令行创建一个名为baiduspi的爬虫：
```
scrapy genspider baiduspi "baidu.com"
```
启动爬虫
```
scrapy crawl baiduspi
```

