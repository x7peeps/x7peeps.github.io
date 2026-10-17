---
title: "macOS 后台总有声音却找不到来源：用 CoreAudio 进程级探针揪出真凶"
date: "2026-10-18 00:22:00 +0800"
weight: 9
tags: [蓝队, macOS, CoreAudio, 排障]
menu:
  main:
    parent: "安全"
---

macOS 后台一直在出声，浏览器没有播放标签，音乐类 App 都停在暂停态，活动监视器帮不上忙——这是 Mac 用户偶尔会撞上的排障死角。今天这个真实案例的答案相当意外：声音来自微信的内嵌浏览器子进程 WeChatAppEx，它不出现在活动监视器的音频列，微信主进程也不显示任何播放状态。

这篇讲怎么用 CoreAudio 的进程级 API 把声源定位到具体进程，附一次 35 进程全量枚举的实测记录。方法本身不依赖辅助功能或 TCC 权限，纯用户态 API，ssh 和 cron 环境也能跑。

## 为什么常规手段全部失效

先看常规路径为什么全断。lsof 查音频设备路径在 macOS 上行不通——系统没有 /dev/audio* 这类设备文件可查。按 App 排查的逻辑依赖"每个 App 一个进程"的假设，但现代 macOS 应用的音频经常跑在子进程里：微信的网页音视频由 WeChatAppEx（bundle id com.tencent.flue.WeChatAppEx）承载，它是独立进程，主进程的播放状态栏对它一无所知。活动监视器的音频列只标记它认识的进程，这类内嵌浏览器子进程恰好是盲区。

另一条思路是逐个杀进程听声音变化——能奏效但代价大，而且杀错进程会丢未保存的状态。定位类问题更好的解法是枚举+标志位：把系统里所有注册过音频的进程列出来，问系统"谁正在输出"，让 CoreAudio 自己指认。

## 进程级 API 链：三步定位

CoreAudio 的属性体系里有一组以 kAudioProcessProperty 开头的进程级属性（要求较新的 macOS；老系统只能退回 kAudioDevicePropertyDeviceIsRunningSomewhere 设备级查询，粒度到设备、到不了进程）。定位链路三步：

第一步，向系统对象查 kAudioHardwarePropertyProcessObjectList，拿到当前所有注册音频的进程 object_id 列表。第二步，对每个进程查两个属性：kAudioProcessPropertyPID 拿进程号，kAudioProcessPropertyIsRunningOutput 拿"是否正在输出"。第三步，用 libproc 的 proc_pidpath 把 PID 映射到可执行文件路径，锁定是哪个 App 的哪个组件。

首次实测的案例输出很干脆：40 个注册进程里，唯一 running_output=1 的就是 WeChatAppEx，路径 /Applications/WeChat.app/Contents/MacOS/WeChatAppEx.app/Contents/MacOS/WeChatAppEx，当时的 PID 4655。杀这一个子进程，声音消失，微信本体不受影响——用 kill 4655（对应当时实际的 pid，每次运行会变），不要杀微信主进程。

## 复测记录：探针本身也要被验证

为了写这篇文章重新跑了一遍探针（采样 2 轮、间隔 2 秒）。这次 35 个注册进程里 running_output=1 的数量是 0——包括 WeChatAppEx 在内的所有微信相关进程（主进程、WeChatAppEx、wxplayer 框架进程）全部静默。这不是探针失效，而是当时确实没有音频在播。两次运行合起来恰好说明了这个方法的两面：有声音时它能精确指认，没声音时它如实返回空。

这也是多轮采样必须存在的原因：running_output 是瞬时状态，音频播放间隙里查会得到 0，单轮查询的假阴性率不可控。实测建议采样 3-5 轮，取出现过 1 的并集。探针实现约 130 行 Objective-C（Foundation + CoreAudio + libproc），编译只需 clang 加两个 framework 参数，源码与两次运行的 JSON 输出已随文存档。

一个部署细节：把这个探针放进 cron 或远程运维脚本做周期性巡检完全可行（纯用户态、无权限弹窗），输出是结构化 JSON，包含每个进程的 running_output、running_input、bundle_id、path、pid，可以直接喂给监控告警——"非工作时间哪个进程在出声"这类检查，靠它比靠用户耳朵可靠。

## 边界与提醒

进程级属性是较新 macOS 才有的接口，跨版本分发的工具要做系统版本判断降级。探针能回答"谁在出声"，不能回答"为什么在出声"——定位到 WeChatAppEx 之后，还是要回到微信里找是哪个小程序或公众号页面在播音频。另外它查的是输出侧，录音检测（running_input）虽然同一套 API 能查，但合入监控前值得先想清楚告警策略，避免自己吓自己。

macOS 的音频子系统的黑盒程度在桌面系统里排得上号，进程级 API 是目前少数官方留给外部的可观测窗口。把这段探针收进工具箱，下次后台幽灵声音再出现，一分钟内就能拿到进程名和路径，而不是对着活动监视器猜。

（实验记录：2026-10-17 两次探针运行，35 个注册进程全量 JSON 输出与源码已存档；首次案例的 40 进程记录来自当日排障原始输出。）

本文面向授权安全研究与防御建设，未经授权对任何系统实施文中技术属违法行为。
