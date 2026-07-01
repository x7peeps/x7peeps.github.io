+++
title = "灵感工坊"
weight = 30
+++

<div style="display: flex; align-items: center; gap: 20px; margin-bottom: 30px;">
  <img src="/images/products/灵感工坊/appicon.png" alt="灵感工坊 Icon" style="width: 120px; height: 120px; border-radius: 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
  <div>
    <h3 style="margin: 0 0 10px 0;">让手机成为灵感的第一入口</h3>
    <p style="margin: 0; color: var(--x7-muted);">快速记录 → AI 共创 → 结构化输出，一站式灵感管理引擎。</p>
  </div>
</div>

灵感工坊是一款面向创作者与产品经理的 iOS 原生应用。它把碎片化的灵感捕获、AI 深度共创和结构化输出串联成一条完整的工作流，让每一个灵光一闪都能被快速捕获、系统打磨、最终落地。

**下载地址：** 敬请期待（开发中）

**技术栈：**

| 层级 | 技术 |
|------|------|
| 客户端 | SwiftUI + Swift（iOS 17+） |
| 架构 | MVVM + Coordinator |
| 本地存储 | Core Data |
| 云端 | Supabase（PostgreSQL + Auth + Storage + Realtime） |
| AI 引擎 | 多模型聚合（OpenAI / Claude / 通义千问） |

**核心特性：**

- **四模灵感捕获** — 文字、语音、拍照、截图四种方式即时录入，不错过任何灵感瞬间。
- **AI 共创对话** — 多轮对话打磨灵感，流式打字机效果，支持联网搜索实时调研，还可一键生成设计草图。
- **灵感工作台** — AI 分析灵感核心要素，自动生成多维度思考框架，逐章节展开填充为 PRD / 设计方案 / 执行 Brief。
- **灵感库管理** — 标签筛选、全文搜索、状态流转（草稿 → 完善中 → 已完成 → 已归档），本地优先 + iCloud 自动同步。
- **社区与发现** — 灵感授权共享、排行榜激励、语义化推荐，发现更多优质灵感。
- **多格式导出** — 支持 Markdown、PDF、Word 三种格式一键导出，方便团队协作与分享。

### 界面预览

<div style="display: flex; gap: 20px; flex-wrap: wrap; justify-content: center; margin-top: 30px; margin-bottom: 30px;">
  <img src="https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=iOS%20app%20screenshot%2C%20inspiration%20capture%20interface%2C%20clean%20minimalist%20UI%2C%20quick%20input%20text%20field%20with%20microphone%20camera%20photo%20buttons%2C%20modern%20mobile%20design%2C%20light%20theme&image_size=portrait_4_3" alt="灵感捕获界面" style="max-width: 250px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
  <img src="https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=iOS%20app%20screenshot%2C%20AI%20chat%20conversation%20interface%2C%20streaming%20typewriter%20effect%2C%20bubble%20messages%2C%20sparkle%20icons%2C%20modern%20mobile%20UI%2C%20light%20theme" alt="AI 共创对话界面" style="max-width: 250px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
  <img src="https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=iOS%20app%20screenshot%2C%20structured%20workbench%20interface%2C%20framework%20grid%20cards%2C%20section%20analysis%20results%2C%20modern%20mobile%20UI%2C%20light%20theme" alt="灵感工作台界面" style="max-width: 250px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
</div>

### 工作流程

灵感工坊将灵感管理拆解为三步闭环：

1. **捕获** — 用文字、语音、拍照或截图快速记录灵感，支持标签分类和状态标记。
2. **共创** — 通过 AI 对话深度打磨灵感，AI 会帮你补充上下文、调研行业信息、生成可视化草图。
3. **输出** — 工作台自动将灵感梳理为结构化框架，逐维度填充细节，最终导出为专业的 PRD、设计方案或执行 Brief。

### 项目结构

```
WorkBuddy/
├── App/                    # 入口、路由、认证
├── Core/
│   ├── Services/           # Supabase、AI、语音、视频、导出
│   ├── Data/               # Core Data 栈、模型、同步引擎
│   ├── Utils/              # 图片选择器、Markdown 渲染、扩展
│   └── Config/             # Supabase 配置、AI 配置
├── Modules/
│   ├── Capture/            # 灵感捕获
│   ├── Chat/               # AI 对话
│   ├── Workbench/          # 工作台
│   ├── Library/            # 灵感库
│   └── Community/          # 社区
└── Resources/              # Info.plist、Assets、Core Data Model
```


## 技术支持网址

在使用灵感工坊过程中遇到任何技术问题、Bug 反馈或功能建议，可通过以下途径获取技术支持：

- **技术支持邮箱**：[xtpeeps@gmail.com](mailto:xtpeeps@gmail.com)
- **支持官网**：[https://x7peeps.com](https://x7peeps.com)

## 隐私政策

**生效日期：2026-07-01**

灵感工坊重视你的隐私。我们采用本地优先的存储策略，结合云端加密同步，确保你的灵感数据安全可控。

### 数据存储
你创建的灵感数据默认保存在设备本地，通过 Core Data 管理。启用 iCloud 同步后，数据会在同一 Apple ID 的设备间自动同步。

### 云端同步
如果你启用了 Supabase 账户，灵感数据将加密同步至云端，用于社区分享功能。开发者不会主动读取或使用你的灵感内容。

### AI 服务
AI 共创对话通过加密连接调用第三方 AI 服务（OpenAI / Claude / 通义千问）。对话内容仅用于生成回复，不会被用于模型训练。

### 社区共享
灵感的社区共享为完全自愿。你可以自主选择将灵感授权共享至社区，未授权的灵感将始终保留在你的设备和私有账户中。

### 数据收集
当前版本不包含第三方分析 SDK、广告 SDK 或跨 App/网站追踪功能。我们不收集任何个人身份信息。

### 联系方式
如需隐私支持，请通过 App Store 页面提供的开发者联系方式联系。
