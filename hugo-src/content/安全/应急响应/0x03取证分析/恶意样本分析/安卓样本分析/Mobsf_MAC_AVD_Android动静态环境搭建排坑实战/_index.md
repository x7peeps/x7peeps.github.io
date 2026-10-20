title: "Mobsf_MAC_AVD_Android动静态环境搭建排坑实战"
menu: 
  main: 
    parent: "安卓样本分析"title: "Mobsf_MAC_AVD_Android动静态环境搭建排坑实战"
menu: 
  main: 
    parent: "安卓样本分析"
date: 2026-05-31T01:12:25+08:00
--- 

关于Mobsf一直没有看到比较全面的实战的教程或者最佳实践发出来，由于目前手头有的MAC+Android Studio，加上最近任务，就想组个动态分析本地可复用的虚拟环境，这里记录了下搭建过程，并给出了最近的任务动态分析结果。测试下来效果还不错，因为Mobsf在git上的维护还比较频繁觉得算是个不错的辅助工具。

 

 测试设备的一些简单信息摘要：

 MAC x86_64

 Android Studio AVD 安卓模拟器

 安卓版本Nexus_5X_API_26_64_api

 

 # Mobsf环境要求

 ## 静态分析要求

 

 -  **Mac** 

 - -  安装 [Git](https://www.atlassian.com/git/tutorials/install-git) 
   -  安装 [Python **3.8-3.9**](https://www.python.org/) 

 - -  After installing Python 3.8+, go to `/Applications/Python 3.8/` and run `Update Shell Profile.command` and `Install Certificates.command` 
   -  安装 [JDK 8+](https://www3.ntu.edu.sg/home/ehchua/programming/howto/JDK_Howto.html) 

 - -  安装命令行工具 `xcode-select --install` 
   -  下载和安装 [wkhtmltopdf](https://wkhtmltopdf.org/downloads.html) 按照 [WIKI操作指南](https://github.com/JazzCore/python-pdfkit/wiki/Installing-wkhtmltopdf) 

 - -  macOS Mojave 用户, 请安装 headers（如果可用）： 

 

 ```
 sudo installer -pkg /Library/Developer/CommandLineTools/Packages/macOS_SDK_headers_for_macOS_10.14.pkg -target /Copy to clipboardErrorCopied
 ```

 

 -  Windows App静态分析需要Mac和Linux的Windows主机或Windows VM。 [更多信息](https://github.com/MobSF/Mobile-Security-Framework-MobSF/blob/master/mobsf/install/windows/readme.md) 
 -  **操作指南**: 

 - -  安装 Git `sudo apt-get install git` 
   -  安装 Python **3.8-3.9** `sudo apt-get install python3.8` 

 - -  安装 JDK 8+ `sudo apt-get install openjdk-8-jdk` 
   -  安装以下依赖项 

 

 ```
 sudo apt install python3-dev python3-venv python3-pip build-essential libffi-dev libssl-dev libxml2-dev libxslt1-dev libjpeg8-dev zlib1g-dev wkhtmltopdfCopy to clipboardErrorCopied
 ```

 

 -  Windows App静态分析需要Mac和Linux的Windows主机或Windows VM。 [更多信息](https://github.com/MobSF/Mobile-Security-Framework-MobSF/blob/master/mobsf/install/windows/readme.md) 
 -  **Windows** 

 - - 安装 [Git](https://git-scm.com/download/win)
   - 安装 [Python **3.8-3.9**](https://www.python.org/)

 - - 安装 [JDK 8+](https://www3.ntu.edu.sg/home/ehchua/programming/howto/JDK_Howto.html)
   - 安装 [Microsoft Visual C++ Build Tools](https://visualstudio.microsoft.com/thank-you-downloading-visual-studio/?sku=BuildTools&rel=16)

 - - 安装 [OpenSSL (non-light)](https://slproweb.com/products/Win32OpenSSL.html)
   - 下载和安装 [wkhtmltopdf](https://wkhtmltopdf.org/downloads.html) as per the [WIKI操作指南](https://github.com/JazzCore/python-pdfkit/wiki/Installing-wkhtmltopdf)

 - - 将包含 `wkhtmltopdf` 二进制文件的文件夹添加到环境变量PATH。

 

 ## 动态分析要求

 

 - **如果您使用MobSF docker容器或在虚拟机中设置MobSF，则动态分析将不起作用。**
 - 安装 [Genymotion](https://www.genymotion.com/fun-zone/) 或者 [Android Studio Emulator](https://developer.android.com/studio)

 

 # 安装

 ## [Linux/Mac](https://mobsf.github.io/docs/#/zh-cn/installation?id=linuxmac)

 

 ```
 git clone https://github.com/MobSF/Mobile-Security-Framework-MobSF.git
 cd Mobile-Security-Framework-MobSF
 ./setup.shCopy to clipboardErrorCopied
 ```

 

 # 运行MobSF

 

 ## [Linux/Mac](https://mobsf.github.io/docs/#/zh-cn/running?id=linuxmac)

 

 ```
 ./run.sh 127.0.0.1:8000
 ```

 

 注意：
 MobSF动态分析需要满足的条件：
 • Genymotion Android VM version 4.1 - 10.0 (x86, upto API 29)
 • Android Emulator AVD (non production) version 5.0 - 9.0 (arm, arm64, x86, and x86_64 upto API 28)

 

 https://mobsf.github.io/docs/#/zh-cn/installation

 

 /Users/[your_name]/Library/Android/sdk/tools/emulator
 emulator -avd Nexus_5X_API_28 -writable-system

 

 # 配置动态分析

 

 MobSF动态分析需要满足的条件：
 • Genymotion Android VM version 4.1 - 10.0 (x86, upto API 29)
 • Android Emulator AVD (non production) version 5.0 - 9.0 (arm, arm64, x86, and x86_64 upto API 28)

 

 这里使用的是Android Emulator AVD，安卓8.0+86x64+api版
 ![img](https://raw.githubusercontent.com/x7peeps/x7peeps-images/main/content/安全/应急响应/0x03取证分析/恶意样本分析/安卓样本分析/Mobsf_MAC_AVD_Android动静态环境搭建排坑实战/1634823207695-debd38ae-eaff-459f-90f8-1cc5102d8b7c.png)

 

 这里根据自己的机器进行选择，测试主机机使用的mac x86架构，为了规避动态调试高版本安卓需要关闭OEM，Android Studio的AVD系统中找不到关闭OEM的尴尬处境，最终选择了安卓9以下的适配版本。如果你也用的AVD，建议直接使用8.0，防止remo