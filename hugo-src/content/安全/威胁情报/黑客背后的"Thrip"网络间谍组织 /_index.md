---
title: 黑客背后的"Thrip"网络间谍组织 
date: 2020-04-04T21:18:00+08:00
tags: 威胁情报,Thrip
menu: 
  main: 
    parent: "威胁情报"
---
By Catalin Cimpanu



文章出处：https://www.bleepingcomputer.com/news/security/chinese-hackers-target-satellite-geospatial-imaging-defense-companies/

一个据信在中国以外活动的网络间谍组织攻击了开发卫星通信、地理空间成像和来自美国和东南亚的国防承包商的公司。美国网络安全公司赛门铁克(Symantec)昨日在一份报告中表示，黑客对被入侵公司的运营方面表现出了特别的兴趣。黑客们试图接触并密切关注用于控制通信卫星的计算机系统，或使用世界地图卫星收集的地理空间数据的计算机系统。赛门铁克表示:“这向我们表明，(该集团)的动机不只是从事间谍活动，还可能包括破坏。”有人担心，黑客可能甚至试图破坏卫星或毒物地理空间数据。


<!--more-->


#### 黑客背后的"Thrip"网络间谍组织
该公司表示，对此次攻击负责的是一种高级的持续性威胁(APT，用来描述网络间谍组织)，以Thrip(网络间谍组织)的代号命名。赛门铁克表示，该公司自2013年以来一直在跟踪这一集团，并一直认为该集团在中国以外运营。该公司表示，最近的攻击难以察觉。黑客使用了一种被称为“靠土地为生”的技术，该技术包括使用操作系统上已有的本地工具进行恶意操作。赛门铁克解释说:“靠土地为生的目的有两个方面。”通过使用这些功能和工具，攻击者希望融入受害者的网络，并将他们的活动隐藏在合法程序的海洋中。其次，即使检测到涉及这些工具的恶意活动，也会使属性攻击更加困难。赛门铁克称，黑客使用了以下本地安装的、完全合法的工具……

```
PsExec: Microsoft Sysinternals工具，用于在其他系统上执行进程。攻击者主要使用该工具在受害者的网络上横向移动。
PowerShell: Microsoft脚本工具，用于运行命令下载有效负载，遍历受攻击的网络，并进行侦察。
mimimikatz:可以更改权限、导出安全证书和恢复明文的Windows密码的免费工具。
WinSCP:用于从目标组织中过滤数据的开源FTP客户端。
LogMeIn:基于云的远程访问软件。目前还不清楚袭击者是否未经授权访问了受害者的登录账户，也不清楚他们是否创建了自己的账户。
```

…安装定制的恶意软件，例如:

```
Trojan.Rikamanu: 一种自定义木马，设计用来从受感染的电脑中窃取信息，包括凭证和系统信息。
Infostealer.Catchamas: 基于Rikamanu，这个恶意软件包含了额外的功能以避免被检测。它还包括一些新功能，比如从最初的木马开始出现的新应用程序(比如新的或更新的web浏览器)获取信息的能力。创建Rikamanu恶意软件。
Trojan.Mycicil: 一个已知由地下中国黑客创建的键盘记录器。虽然是公开的，但并不常见。
Backdoor.Spedear: 虽然在最近的攻击浪潮中没有看到，Spedear是一个后门木马，Thrip在其他活动中使用过。
Trojan.Syndicasec: Thrip以前的活动中使用的另一种木马。
```
早在2018年1月就发现黑客入侵赛门铁克表示，只有在其一款基于人工智能和机器学习的工具引发对可疑使用合法工具的警告后，该公司才发现了这些攻击。专家们表示，他们已经利用这一最初的警报来揭示妥协的初步迹象，然后利用这一线索来揭示针对多个国家和行业领域的多家公司的更广泛行动。这场黑客攻击的目的显然是网络间谍活动。该公司说，它在1月份发现了这一行动，但Thrip黑客攻击行动可能比该公司目前报告的范围更广。






#### Related Articles:
[Chinese Cyber-Espionage Group Hacked Government Data Center](https://www.bleepingcomputer.com/news/security/chinese-cyber-espionage-group-hacked-government-data-center/)
[Chinese Cyberspies Appear to be Preparing Supply-Chain Attacks](
https://www.bleepingcomputer.com/news/security/chinese-cyberspies-appear-to-be-preparing-supply-chain-attacks/)
[Malware That Hit Pyeongchang Olympics Deployed in New Attacks](
https://www.bleepingcomputer.com/news/security/malware-that-hit-pyeongchang-olympics-deployed-in-new-attacks/)
[InvisiMole Is a Complex Spyware That Can Take Pictures and Record Audio](
https://www.bleepingcomputer.com/news/security/invisimole-is-a-complex-spyware-that-can-take-pictures-and-record-audio/)
[Adobe Patches Flash Zero-Day](
https://www.bleepingcomputer.com/news/security/adobe-patches-flash-zero-day/)
