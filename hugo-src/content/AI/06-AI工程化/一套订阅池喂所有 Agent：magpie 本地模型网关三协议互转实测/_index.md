---
title: "一套订阅池喂所有 Agent：magpie 本地模型网关三协议互转实测"
date: "2026-10-19 00:30:00 +0800"
weight: 9
tags: [模型网关, magpie, Agent基建, 本地部署]
menu:
  main:
    parent: "AI工程化"
---

你机器上可能同时装着 Claude Code、Codex CLI、Gemini CLI、Qwen Code、OpenCode 之类一堆 agent，每个都有自己的配置文件和 API key 字段，每家订阅各付各的。想让某个 agent 换个模型，就得翻它的 settings.json 或 .env；想让它用上你另一家已经付费的订阅，配置文件里字段方言还不一样——OpenAI 系吃 `OPENAI_BASE_URL`，Anthropic 系吃 `ANTHROPIC_BASE_URL`，Gemini 吃 `GOOGLE_GEMINI_BASE_URL`。yetone/magpie 就是冲着这件事来的：一个本地进程把散落的 key 和订阅收进一个池子，对外同时摆出 OpenAI、Anthropic、Gemini 三套协议方言，agent 那头只需要改 base URL。这篇文章讲清楚它怎么配、协议互转的真实边界在哪、哪些坑 README 没写。所有功能描述对官方 README（MIT，Go 实现），投产数据来自本机运行记录。

## 它是什么体量，怎么装

GitHub API 匿名查询（2026-10-19 记录）：yetone/magpie 15758 星，MIT，Go，创建于 2026-09-23，最近推送 2026-10-18，issue 积压 1096。不到一个月涨到一万五，增速在工具类项目里相当罕见。GitHub 仓库描述（gh_api 记录）写着它的定位："Every agent's model. One place. Codex on DeepSeek, Claude Code on Kimi, from the menu bar."；README 首句展开了一点："One place to pick every agent's model: Codex on DeepSeek, Claude Code on Kimi, Gemini CLI on GLM, from the menu bar."——Codex 跑 DeepSeek、Claude Code 跑 Kimi、Gemini CLI 跑 GLM，从菜单栏切。

安装走 `curl -fsSL https://usemagpie.ai/install.sh | sh`，或 `go install github.com/yetone/magpie@latest`。装完本机跑 `magpie --version`，得到 `magpie 0.1.1285`，arm64 二进制实测 45,974,642 字节。macOS 形态是菜单栏应用（无 Dock 图标），也有窗口模式 `magpie`、终端模式 `magpie tui` 和纯 CLI。

## provider、路由、常驻三件事

录入供应商只填 key：`magpie provider add deepseek sk-…`；本地推理服务（ollama 这类）连 key 都不用 `magpie provider add ollama`。自定义端点用 `url=`（OpenAI 兼容 base）、`anthropic=`（Anthropic 兼容 base），两家都给也行，厂商有独立 Responses 端点再加 `responses=`，模型目录能借 models.dev 的用 `catalog=`，要暴露哪些模型用 `models=` 点名。`magpie provider test <name>` 会对每个 API 发一个最小请求带延迟——注意默认挑的模型可能没权限，先用 `magpie models <provider>` 看目录再测。

最有意思的设计是把"已登录的 agent"本身当一个 provider。README 的表述："An agent you have signed in to is a subscription with models behind it"。Claude Code 的 OAuth 登录态（`~/.claude/.credentials.json`）和 Codex 的（`~/.codex/auth.json`）会出现在 `magpie providers` 里，显示成 signed in as …，模型在其他 agent 的选用器里拼成 `claude/claude-sonnet-5`、`codex/gpt-5.5` 这种带前缀的名字。magpie 每次调用读 agent 自己的凭据、按 agent 的方式刷 token、把轮换后的 token 写回 agent 找得到的位置，自己只存你选了哪些模型——agent 退出登录，这个 provider 就消失。

订阅复用的边界也写得坦率：Claude 订阅不一样，Anthropic 会把别的 agent 的 system prompt 分类为第三方流量，即使 OAuth 请求其他部分伪装得像 Claude Code。所以 magpie 对 Claude 订阅生成走的是驱动本地真 `claude` 二进制的路，把调用方的工具经 MCP 桥进那个活会话，工具结果再回到同一个 Claude Code 进程续跑。这条路径要求 Claude Code 已安装且已登录。

服务常驻用 `magpie daemon install`，实测在 `~/Library/LaunchAgents/` 下写出 `com.yetone.magpie.serve.plist`，RunAtLoad 加 KeepAlive(SuccessfulExit=false)、ThrottleInterval 5——开机自启、崩溃重拉的标准写法。本机当前状态（launchctl 与 lsof 记录，2026-10-18 晚）：进程 PID 79299 监听 127.0.0.1:3425，providers 面板 10 条（deepseek、openrouter、minimax-cn、qwen-cn、zhipu、google、两个 token plan、codex、zcode），模型目录最近刷新在 4 小时前。

## 三协议互转是真的通，但错误语义会翻译

网关端点清单（README 的表 + 本机实测）：`/v1/chat/completions`（OpenAI chat）、`/v1/responses`（OpenAI Responses）、`/v1/messages`（Anthropic Messages）、`/v1/messages/count_tokens`、`/v1beta/models/{model}:generateContent`（Gemini，含 stream 和 countTokens 变体），另有 images、videos、embeddings、rerank、audio 转写等。按 README 的接入表，OpenAI 方言的 base URL 是 `http://127.0.0.1:3425/v1`（环境变量 `OPENAI_BASE_URL`），Anthropic 与 Gemini 方言直接用根地址 `http://127.0.0.1:3425`（`ANTHROPIC_BASE_URL`/`GOOGLE_GEMINI_BASE_URL`），API key 统一填字符串 `magpie`。

本机做了一组端到端验证：向 `/v1/messages` 发 Anthropic 方言的请求、`x-api-key: magpie`，模型名填 `codex/gpt-6-astra`——也就是 Anthropic 协议进、ChatGPT 订阅后端出，链路返回了正常的模型响应。健康检查探针也有信息量：`GET /health` 返回 404 时，错误体是一份完整端点清单，说明它是个正经按协议路由的网关而不是转发壳子。

排障时有个现象值得先认识：上游的权限/可用性问题会被带语义原样翻译回对应协议方言，而不是把网关自己弄挂。本机实测的一例：对 OpenRouter 这个 provider 跑 `magpie provider test`，chat 协议通道正常通过（2027 ms），anthropic 协议通道返回 403——"This model is not available in your region"，decide 通道也正常。同一个 provider、同一个 key，两种方言两个结果，报错把上游的原因说清了。看到 402/403/429 先分清"网关坏了"还是"上游余额/区域/权限"，再动配置。

## 接管与回滚：存档是保命符

路由组是它的调度单位：`magpie groups` 查看、`magpie group add <name> models=<m1>,<m2> routing=smart|order|rotate|usage|pace` 定义——把多个供应商的同类模型拼成一个组，agent 侧只看到 `group/<id>` 一个可选项。除了手动组，magpie 会自动生成"跨供应商同名"的备用组：本机记录（2026-10-19，`magpie groups` 输出）里能看到 `group/auto-glm-5-3` 聚了 zhipu、qwen-cn、bailian、qwen-token-plan、zcode 五个渠道的同一个模型，`group/heavy` 则是手配的 order 路由（codex/gpt-6-astra → bailian-token-plan/qwen3.8-max → qwen-cn/qwen3.8-max-0902），Qwen Code 正挂在这个组上。接管 agent 配置形如 `magpie <agent> group/<id>`，agent 名从 `magpie ls` 的检测结果里取。

接管前先 `magpie save pre-magpie` 把所有 agent 设置存成 profile。退出走 `magpie <agent> default`（help 原话："take magpie out: the agent back on what it had before"），单个字段也能 `magpie <agent> <field> default` 单独还原。本机当前状态是接管态：`~/.qwen/settings.json` 里能看到 magpie 写入的 `MAGPIE_QWEN_API_KEY` 字段和网关 base URL——Qwen Code 正挂在网关路由组上跑。整套配置另有 `magpie backup` 全量封存（providers、keys、settings、profiles、agent models 一个文件，passphrase 加密），跨机同步可走 webdav/s3/github。敢批量接管 agent 的底气在这些退路上。

用量归因走 `magpie usage`：按 agent、模型、订阅账号报 token 与成本，`--csv` 能导出每个请求"要的模型/发的模型/实际服务的模型、token、成本、时间、状态、账号"的明细；`magpie quota` 看每个订阅/计划/key 还剩多少额度。这对"用已付费订阅喂 agent"的核心场景是刚需——哪些调用其实没花新钱，账本直接给答案。

## 值不值得上，看这三条

适合：机器上两个以上 agent、多家 key 或订阅、想要统一切换和用量台账的人。单 agent 单 key 用它是杀鸡用牛刀，还多一个常驻进程和一个本地明文凭据面。

三条注意事项。第一，网关监听在 127.0.0.1 是本机默认，但所有 agent 的凭据流经同一个进程、key 存在 magpie 自己的配置里——这台机器如果有别的用户或多开放的端口面，这个集中点值得你主动确认边界（MAGPIE_ADDR 可改监听地址，别随手开成 0.0.0.0）。第二，接管 agent 配置是直接改文件，改前必用 `magpie save`，出问题 `magpie default` 拉回。第三，Claude 订阅路径依赖本机已登录的 `claude` 二进制，环境里缺了它会失败；README 记录的是 Anthropic 当前的分类口径，这条口径日后是否收紧不在来源之内——这条链路本质是产品间博弈，今天通不代表永远通。

一个月 1.5 万星说明痛点真实：agent 越来越多，模型选择从"配置项"变成"日常操作"。magpie 把这件事做成菜单栏一下、一行环境变量，方向是对的。把它接进你自己的多 agent 工作流之前，存档、限监听地址、分清网关错误和上游错误，这三件事做到就不会被它咬。
