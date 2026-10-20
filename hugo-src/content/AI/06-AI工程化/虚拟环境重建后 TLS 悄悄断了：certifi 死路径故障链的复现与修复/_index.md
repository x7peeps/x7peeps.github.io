---
title: "虚拟环境重建后 TLS 悄悄断了：certifi 死路径故障链的复现与修复"
date: "2026-10-19 00:30:00 +0800"
weight: 9
tags: [Python, certifi, TLS, 供应链]
menu:
  main:
    parent: "AI工程化"
---

有个报错在 Python 圈并不罕见：进程跑着跑着，所有 HTTPS 请求突然全挂——httpx 系报 `[Errno 2] No such file or directory`（发生在客户端构造那一刻），requests 系报 `OSError: Could not find a suitable TLS CA certificate bundle, invalid path: …/certifi/cacert.pem`。第一反应通常是网络坏了、代理坏了、证书过期了。三样都不是：坏的是一个本地文件路径——你的 Python 环境目录被包管理器原地换掉了，而进程还记得旧路径。

这条故障链最近在 NousResearch/hermes-agent 上游被集中修了一轮。GitHub API 检索该仓库含 certifi 的提交，2026-10-18 同批落地八个提交——`fix(ssl): re-resolve certifi's CA bundle after an install-environment rotation`、`fix(ssl): re-import certifi's package tree so the rotation repair reaches core`、`fix(ssl): certifi re-resolution reaches real certifi; requests keeps its CA overrides` 等五个 fix 加三个配套 test（匿名 GitHub 提交搜索，10-19 记录）。对天天用 uv/pip 重建虚拟环境的开发者，值得把它讲透：路径怎么死的、为什么有些报错只在 httpx 出现、为什么重启前的进程救不回来、以及按什么顺序排查。下面每个断言都有出处：官方源码摘录、以及在自有环境里跑的一次受控复现。

## 环境轮换是什么，为什么它会打穿 TLS

现代 Python 运维里，"原地重建环境"越来越常见：uv sync 换依赖时可以直接替换虚拟环境目录，容器镜像重建、CI 缓存恢复、`pip install --force-reinstall` 都会让同一个路径下的包被换一批新 inode，甚至整个目录先删后建。长期运行的进程——网关、bot、agent——不会跟着重启。于是进程内存里的 Python 模块对象和磁盘上的包目录脱钩了。

TLS 恰好是这条链上最容易断的一环，因为几乎所有 HTTP 客户端都默认用 certifi 的 CA bundle。而 certifi 的 `where()` 实现方式，按官方文档的自述是"有点糟糕"（"This is slightly terrible"）：它用 importlib.resources 把 `cacert.pem` 解析成一个路径，然后存进模块级全局变量 `_CACERT_PATH`，之后每次调用都直接返回这个缓存值。源码注释解释了这么做的动机——zipimport 场景下要延迟提取、又不能在每次调用时重新提取——但代价就是：路径解析只发生一次，之后包目录被换掉、被删掉，缓存里的路径不会自己更新，它指向的是一个已经不存在的文件。这就是"死路径"。

死路径落到不同客户端上，报错的时机和样子不一样，值得分开记。

## 同一种坏，三种表现：httpx、requests、以及 reload 的假动作

httpx 在构建 SSL context 时就去读那个路径。路径没了，Client 构造当场炸 `FileNotFoundError`，什么请求都还没发出去。如果你看到"初始化 OpenAI/xxx client 就报 [Errno 2]"，而同一台机器浏览器访问 HTTPS 一切正常，八成就是这个。

requests 更隐蔽。它在 import 时就把 `certifi.where()` 的结果冻结成了模块常量 `DEFAULT_CA_BUNDLE_PATH`，后续每次调用才检查这个文件在不在，不在就报 `OSError: Could not find a suitable TLS CA certificate bundle`。也就是说 requests 不在导入时报错，报错发生在第一次（以及之后每一次）真正发请求的时候——进程可能已经"正常"跑了一段，某个冷门的出站调用才暴露。

然后是那个最容易浪费半小时的坑：你以为 reload 能救回来。`importlib.reload(certifi)` 不会生效。原因藏在包结构里：真正缓存路径的是子模块 `certifi.core`（`where()` 读的就是它的全局 `_CACERT_PATH`），而 `certifi/__init__.py` 只是把 `where` 重新导出。reload 只重新执行 `__init__`，`certifi.core` 还稳稳待在 sys.modules 里，模块 globals 里的旧路径原封不动——reload 完再调 `where()`，返回的还是那个死路径。

这三层表现在我自己的沙箱里各跑了一次受控复现（自有环境、临时目录里复制一份 certifi 包，模拟环境目录被移走，全程不需要真实外网——故障在 TLS 上下文构建阶段就触发了，还没到连 socket 那一步；完整输出见实验记录 run1.json）。五步全部命中预期：轮换后 `where()` 返回已删除路径（E1）；requests 调用报 `OSError: Could not find a suitable TLS CA certificate bundle, invalid path: …`（E2）；httpx 构造 Client 抛 `FileNotFoundError: [Errno 2] No such file or directory`（E3）；`importlib.reload(certifi)` 后 `where()` 仍返回死路径（E4）；把 `certifi` 和 `certifi.*` 全部从 sys.modules 摘掉、换到活目录再 import，路径恢复有效（E5）。环境是 Python 3.12.10 + requests 2.34.2 + httpx 0.28.1。一次冷路径复现，不代表所有客户端的所有代码分支都覆盖到了——urllib3、aiohttp 的读取时机各不相同，但死路径的源头是同一个。

## 上游的修复链：重导包树，还要处理覆盖优先级

hermes-agent 这轮修复的思路值得抄作业。第一步就是解决 reload 假动作：把 `certifi` 连同它的全部子模块（含 `certifi.core`）从 sys.modules 里摘除，再重新 import，让 `where()` 针对当前活的 sys.path 重新解析；重导失败时把摘掉的模块塞回去，保持进程原状。这正好对应复现里的 E4→E5。

第二步是给结果加缓存：按死路径缓存修复结论。一个每轮对话都新建 client 的网关，如果每次构造都跑一遍重导逻辑，等于每轮都重跑第三方模块代码、重复刷告警。按"坏路径"缓存之后，环境每轮换一次只修复/告警一次。

第三步处理一个容易帮倒忙的细节：requests 有自己的 CA 覆盖优先级。用户显式设置了 `REQUESTS_CA_BUNDLE`/`CURL_CA_BUNDLE`，或者 `DEFAULT_CA_BUNDLE_PATH` 指向的文件仍然存在时，就返回 `verify=True` 让 requests 走自己的逻辑——只有确认 bundle 已经因环境轮换而死，才把修复后的活路径交还给调用方。顺序反了会发生什么？你显式配置的代理 CA（比如企业中间人根证书）会被 certifi 的默认 bundle 顶掉，请求要么验证失败，要么悄悄走了不受信任的证书链。修复链里还把 Windows 单列：Windows 上没有 cafile/capath 的概念，`verify=True` 会退回死路径，兜底是把操作系统证书仓一次性导出成一个 PEM 文件、把那个路径交出去；连导出都失败（缓存目录所在盘满了、只读）时，异常必须吞掉返回布尔值——因为求值点在 requests 的参数上，抛异常会把整个调用顶死。

顺带一句设计层面的根治：hermes-agent 当前的 TLS 模块把信任源换成了操作系统证书仓（truststore：Windows CryptoAPI、macOS Security.framework、Linux OpenSSL store），进程启动时装一次补丁，把 `ssl.SSLContext` 全进程指向平台信任库，httpx、requests/urllib3、aiohttp、以及 stdlib urllib 的调用点一并覆盖；显式导出的 `SSL_CERT_FILE` bundle 作为附加信任叠加，只有逐 provider 显式配置的 `ssl_ca_cert` 才替换这条信任。平台仓不是某个 Python 包里的数据文件，venv 怎么重建它都在，死路径问题从根上少了一大类。模块源码的 docstring 写得很直白："An exported SSL_CERT_FILE bundle is trusted ON TOP of the platform store"，覆盖动机正是"certifi-only or requests-only approach never reached"那些 stdlib 调用点。

## 排查手册：按报错样子分诊

下次看到 TLS 报错，先花十秒分诊，再动手：

1. 看到 `[Errno 2] No such file or directory`，而且发生在 client **构造时**（OpenAI client 初始化炸、httpx.Client() 炸）：先跑一行 `python3 -c "import certifi,os; p=certifi.where(); print(p, os.path.exists(p))"`。False 就是死路径，和网络无关。
2. 看到 `OSError: Could not find a suitable TLS CA certificate bundle`：同样查 `certifi.where()`，这是 requests 的每次调用时报错。
3. 确认死了之后，进程内临时自救：把 `sys.modules` 里 `certifi` 和 `certifi.` 开头的全部删掉，再 `import certifi`（E5 的做法）。这只救当前进程；重启才是干净解。
4. 报错在系统 Python 下不存在、只在某个长期运行服务里出现：查这个服务的运行方式——有没有"原地重建 venv 但不重启进程"的部署习惯。uv、pipx、容器里 volume 挂载 site-packages 都可能触发。
5. 长期方案二选一：要么把环境重建和进程重启绑成一个动作（systemd/launchd 的部署脚本里加 restart）；要么像上游一样切平台信任库（truststore），让 TLS 信任不再依赖某个 venv 里的数据文件。
6. 用了企业代理/自签名 CA 的场景，记住 requests 的覆盖优先级：先尊重 `REQUESTS_CA_BUNDLE`/`CURL_CA_BUNDLE`，确认 bundle 真死了才替换路径，否则代理 CA 会被顶掉。

## 值得记住的三件事

这个故障链的本事在于"看起来是网络问题"。三条可迁移的经验：第一，任何"import 时冻结路径/配置"的库（`DEFAULT_CA_BUNDLE_PATH` 这类模块常量、各种 `__file__` 派生路径），在 venv 原地重建、PyInstaller 打包、容器换层之后都可能指错——排查时先打印进程内存里的那个路径，和磁盘对一下，比看十眼代理配置快。第二，reload 一个包的 `__init__` 不等于重导它的状态，状态在子模块里时尤其要检查 sys.modules。第三，长期运行的服务要把"环境可变"当成前提设计：要么信任源脱离可变的包目录（平台证书仓），要么在初始化处做死路径检测与重解析。上游这轮五个 fix 提交（另有三个配套测试）修的就是这个，思路和补丁都在开源仓库里，按需取用。
