---
title: "Anthropic、Cursor、Google 三家官方技能仓库同场竞技：Agent 插件分发的入口之争"
date: "2026-10-18 00:23:00 +0800"
weight: 9
tags: [AgentSkills, 插件生态, 开源, Agent架构]
menu:
  main:
    parent: "Agent架构与框架生态"
---

给 AI 编程助手写"技能/插件"的开发者，最近值得抬头看一下生态格局：Anthropic 的 Claude Code 官方插件目录（4555 个提交）、Cursor 的官方插件规范仓库（12141 星）、Google Android 的 Agent Skills 仓库（8320 星）——三家官方的技能分发阵地如今同场竞技，各自经营大半年后都长出了可观体量，第三方技能库和框架也在同期集中起量。

三家入场的节奏错开：Anthropic 的插件目录 2025 年 11 月建仓，Cursor 的规范仓库 2026 年 1 月建立，Android 的 skills 仓库 2026 年 3 月创建。但到今天，一个原本由社区自发演化的"Agent 技能"格式，已被三家平台方同时认真经营成分发入口。谁定义了"Agent 能力的安装格式"，谁就握着下一个 App Store 式的通道。

这篇文章回答三个问题：三家的格式各自长什么样、生态当前的真实规模、现在给 Agent 写工具的人该做什么。

## 三家官方阵地各自长什么样

Anthropic 的 claude-plugins-official 是策划型目录：plugins 目录放自研插件，external_plugins 放社区与合作伙伴提交的插件，通过 /plugin install {插件名}@claude-plugins-official 或 IDE 内 Discover 面板安装。仓库已有 4555 个提交，README 里有一句值得所有用户记住的免责声明：Anthropic 不控制插件内的 MCP 服务器与文件，无法验证它们是否按预期工作——官方目录提供的是分发渠道和准入审核，不是安全背书。外部插件有正式的提交表单和质量安全标准。

这个仓库里有两个对开发者很有参考价值的工程决策。其一，插件 name 是不可变 slug：展示名可以随便改（走 displayName 字段），包名一旦发布就不动，必须改名时走 renames 映射表让用户已安装的引用自动迁移——因为教程、文档、脚本全都指向旧名字，没有迁移机制就是大规模断链。其二，仓库配了自动化的 scope guard 审查流程，持续拦截不合规的外部提交，官方目录的准入是程序化执行而不是口号。

Cursor 的 cursor/plugins 走规范先行路线：仓库自己就是"Cursor plugin specification and official plugins"，每个插件是仓库根目录下的独立目录，带自己的 .cursor-plugin/plugin.json 清单。当前 12141 星。目录里的插件类型已经开始分化：工具类（教学、持续学习、团队工作流）、流程类（深度安全审计的 thermos、迭代自引用的 ralph-loop）、脚手架类（create-plugin 用插件造插件）。

Google 的 android/skills 定位更聚焦：官方说明写得很清楚，这是"AI 优化的模块化指令与资源库"，帮 Agent 理解和执行符合 developer.android.com 最佳实践的开发模式，当前 8320 星。它是三家里最克制的——不做通用技能市场，只服务安卓开发的规范性。

## 生态的真实规模

官方目录之外，第三方阵营的规模更能说明"技能即资产"的成熟度。K-Dense 的 scientific-agent-skills 是目前最成体系的垂直库：177 个经过验证的科研技能加 100 多个科学数据库接入，覆盖生物、化学、医学、药物发现，README 称服务全球 25 万科学家，兼容 Cursor、Claude Code、Codex、Pi、Antigravity 和开放的 Agent Skills 标准。它的工程严肃程度在技能库里少见：配套 arXiv 论文（Scientific Agent Skills: A Library of Procedural Knowledge for Research Agents）、引用规范、完整的贡献工作流和 MIT 许可。10 月 1 日他们做过一次合规清理——把从 Anthropic skills 仓库以专有许可 vendor 进来的四个文档技能（docx/pdf/pptx/xlsx）整体移除、改用自研实现。这个案例值得每个技能库维护者记住：许可证纪律要第一天就做，规模越大拆除越贵。

通用框架侧，affaan-m/ECC 当前 282,097 星（数据口径见文末），把技能、直觉、记忆、安全做成一体化的 Agent harness 运行时；obra/superpowers 301,057 星，主打经过实践验证的 agentic skills 与软件开发方法论，技能会自动触发、无需显式调用。分工正在显现：官方目录管分发和信任，垂直库管领域深度，框架管运行时集成。

## 现在给 Agent 写工具的人该做什么

第一，把技能写成跨平台格式。scientific-agent-skills 能同时服务六家客户端，靠的是技能本体遵循开放的 Agent Skills 标准（SKILL.md 加清单），不绑死任何一家的私有格式。同一份技能资产多平台分发，是当前性价比最高的写法。

第二，命名按"永不过时"的标准定。Anthropic 的不可变 slug + renames 映射证明了一件事：插件生态里"改名"的代价远超预期，展示名与包名分离、把包名当永久 ID 对待，是省掉未来麻烦的最低成本做法。

第三，许可与来源清单从第一天就建。上 ECC 这类框架或自建库，LICENSE、CITATION、依赖来源三件套应当在第一个技能入库前就位。

第四，对观望者的判断参考：官方目录的准入审核（提交表单 + 质量安全标准 + 程序化 guard）意味着"上架官方目录"正在变成技能作者的信誉凭证，类似早期应用商店的头部效应。手里有成熟领域技能资产的开发者，现在提交的竞争密度还低——三个官方阵地加六家兼容客户端，是技能资产从诞生起就少见的分发红利窗口。

这场卡位战最直接的受益者是写技能的人：同一份资产突然有了多个分发渠道。最直接的风险是押注单一私有格式。格式标准化的窗口不会一直开着，等哪家的安装命令成为开发者的肌肉记忆，格局就定了。

（数据口径：ECC 282,097 星、superpowers 301,057 星、android/skills 8320 星、建仓时间均于 2026-10-18 经 GitHub API 核实并存档查询记录；Anthropic 插件目录提交数、Cursor 星数来自各仓库页面快照。）
