---
title: 恶意样本分析1-配置实验环境
date: 2019-09-03T20:29:03+08:00
tags: 恶意样本分析,学习
---
![](1555673578514.png-A)
对于日常探针分析工作，样本分析作为不可缺少的一个环节，经常能够在其中发现比较重要的细节，对此部分的学习和总结尤其重要，这一系列即为最近收集总结的一部分。

<!--more-->

> 本系列主要内容来自《K A, Monnappa. Learning Malware Analysis: Explore the concepts, tools, and techniques to analyze and investigate Windows malware (pp. 95-96). Packt Publishing. Kindle 版本. 》的记录

## 1 配置实验环境 Setting Up the lab environment
Linux: ubuntu 16.04 desktop
Windows: windows 2008

### 1.1 Linux
Linux after install system:
third-party packages: 

```bash
sudo apt-get update
sudo apt-get install python-pip
pip install --upgrade pip

python tools:
sudo apt-get install python-magic
sudo apt-get install upx
sudo pip install pefile
sudo apt-get install yara
sudo pip install yara-python
sudo apt-get install ssdeep
sudo apt-get install build-essential libffi-dev python python-dev \ libfuzzy-dev
sudo pip install ssdeep
sudp apt-get install wireshark 
sudo apt-get install tshark

INetSim(网络状态模拟器)：
sudo su
echo "deb http://www.inetsim.org/debian/ binary/" >/etc/apt/sources.list.d/inetsim.list 
wget -O - --no-check-certifucate http://www.inetsim.org/inetsim-archive-signing-key.asc | apt-key add -
apt update
apt-get install inetsim
```
以上安装完毕，labubuntu 切换仅主机模式

####  LinuxVM config:
1.配置ubuntu静态网络static IP: 192.168.1.100

sudo gedit /etc/network/interfaces
```
auto lo
iface lo inet loopback

auto ens33
iface ens33 inet static
address 192.168.1.100
netmask 225.255.255.0
```
service networking restart
或者重启ubuntu
ifconfig确认

2. 配置ubuntu中的inetsim配置
修改inetsim默认配置：
sudo gedit /etc/inetsim/inetsim.conf
```
在默认配置service_bind区域追加,并注释掉默认配置：
service_bind_address 192.168.1.100
```

配置DNS服务，已用于DNS服务：

```
在配置dns区域追加以下内容并注释掉原默认配置：
dns_default_ip 192.168.1.100
```
运行测试：
```sudo inetsim```
检查配置

3. 配置第三方软件：
python 2.7 (仅限本书)

**check point**
确认windows主机网段：192.168.1.105  DNS：192.168.1.100
测试win和linux之间联通节点

![](1555672944518.png-A)

![](1555672906183.png-A)



### 1.2 WINDOWS
WINDOWS VM config:
主机网络配置：192.168.1.101 DNS:192.168.1.100
关闭Defender（win10/7, win2008没有Windows Defender）:
	Windows Defender 服务需要在虚拟机禁用掉。运行》gpedit.msc》本地计算机策略》计算机配置》管理模板》windows组件》 Windows Defender（Windows10里面叫“Windows Defender防病毒程序”） 
	在右边部分双“关闭WindowsDefender策略”关闭Windows Defender防病毒程序。（下图为Win10的图）
![](1555673578514-20210929091836061.png-A)
配置虚拟机使其允许双向复制粘贴剪切板。
两个虚拟机全部配置完毕，拍摄快照保存初始化状态。此时，linux和windowsVM均配置为Host-Only仅主机模式，并且能够互通。

##### windows安装必要的分析工具
下面是一些可以用来下载恶意文件样本的网站：
Hybrid Analysis: https://www.hybrid-analysis.com/ 
KernelMode.info: http://www.kernelmode.info/forum/viewforum.php?f=16 
VirusBay: https://beta.virusbay.io/ 
Contagio malware dump: http://contagiodump.blogspot.com/ 
AVCaesar: https://avcaesar.malware.lu/ 
Malwr: https://malwr.com/ 
VirusShare: https://virusshare.com/ 
theZoo: http://thezoo.morirt.com/
其他恶意软件样本源你可以在下面的博客中找到：You can find links to various other malware sources in Lenny Zeltser's blog post https://zeltser.com/malware-sample-sources/. 
个人收集工具：

对于在虚拟机中运行的监控类软件还应该注意修改程序名称：
wireshark主程序修改入口程序名称可以改变进程名
![](20190916162455.png-A)
