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

**下载地址：** [App Store](https://apps.apple.com/app/灵感工坊/)（即将上线）

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

<div style="display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; margin-top: 30px; margin-bottom: 30px;">
  <img src="/images/products/灵感工坊/01_capture.png" alt="灵感捕获界面" style="max-width: 200px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
  <img src="/images/products/灵感工坊/02_chat.png" alt="AI 共创对话界面" style="max-width: 200px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
  <img src="/images/products/灵感工坊/03_workbench.png" alt="灵感工作台界面" style="max-width: 200px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
  <img src="/images/products/灵感工坊/04_library.png" alt="灵感库界面" style="max-width: 200px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
  <img src="/images/products/灵感工坊/05_community.png" alt="社区界面" style="max-width: 200px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
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

**隐私政策独立页面**：[https://x7peeps.com/产品/灵感工坊/privacy/](/产品/灵感工坊/privacy/)

**生效日期：2026-07-01**

**最近更新：2026-07-02**

---

灵感工坊（以下简称"本应用"）由 x7peeps（以下简称"开发者"或"我们"）开发。我们重视你的隐私，本隐私政策说明本应用如何处理和保护你的信息。

---

### 一、我们收集哪些数据

#### 1.1 灵感数据（本地存储）

你在使用本应用过程中创建的所有灵感内容（包括文字、语音、图片等）**默认仅保存在你的设备本地**，通过 Core Data 管理。开发者不会主动访问、收集或上传这些数据。

#### 1.2 云端同步数据（可选）

如果你注册并启用了 Supabase 账户以使用社区分享功能，以下数据将加密同步至云端：

- 你**主动选择共享**的灵感内容
- 你的账户基本信息（邮箱/用户名）
- 社区互动数据（如排行榜积分）

**未授权共享的灵感始终保留在你的设备和私有账户中，不会被上传至公共社区。**

#### 1.3 AI 服务交互数据

使用 AI 共创对话功能时，你的对话内容会通过加密连接发送至第三方 AI 服务提供商：

- OpenAI
- Anthropic (Claude)
- 通义千问

对话内容**仅用于生成当次回复**，开发者不会将其用于模型训练或其他用途。各 AI 服务提供商的隐私政策请参阅其官方文档。

#### 1.4 不收集的数据

本应用**不收集**以下信息：

- 个人身份信息（姓名、电话号码等）
- 设备位置信息
- 通讯录或日历数据
- 当前版本不包含任何第三方分析 SDK、广告 SDK
- 不进行跨 App 或网站追踪

---

### 二、我们如何使用数据

| 数据类型 | 使用目的 |
|---------|---------|
| 本地灵感数据 | 仅供你在本应用内查看、编辑、导出 |
| 云端同步数据 | 实现跨设备同步及社区分享功能 |
| AI 对话内容 | 仅用于生成 AI 回复，不做二次利用 |
| 账户信息 | 仅用于身份认证和社区功能 |

---

### 三、数据存储与安全

- **本地优先**：灵感数据默认存储在设备本地，不依赖网络。
- **加密传输**：所有云端通信均通过 HTTPS 加密。
- **iCloud 同步**：如果你启用了 iCloud 同步，数据将通过 Apple 的 iCloud 服务在你的设备间同步，受 Apple 隐私政策保护。
- **社区共享自愿原则**：灵感的社区共享完全由你自主决定，你可以随时取消共享。

---

### 四、数据保留与删除

- 你可以随时在应用内删除灵感数据，删除后数据将从设备和云端同步移除。
- 如果你注销 Supabase 账户，云端存储的共享数据将被清除。
- 本地数据在卸载应用后自动清除。

---

### 五、第三方服务

本应用使用以下第三方服务：

| 服务 | 用途 | 隐私政策 |
|------|------|---------|
| Supabase | 账户认证、云端同步、社区功能 | https://supabase.com/privacy |
| OpenAI | AI 对话 | https://openai.com/privacy |
| Anthropic | AI 对话 (Claude) | https://www.anthropic.com/privacy |
| 通义千问 | AI 对话 | https://www.aliyun.com/product/tongyi |
| Apple iCloud | 数据同步 | https://www.apple.com/legal/privacy/ |

---

### 六、未成年人保护

本应用不面向 13 周岁以下的儿童。我们不会故意收集儿童的个人信息。

---

### 七、隐私政策更新

我们可能会不时更新本隐私政策。更新后的政策将在本页面发布，生效日期会在页面顶部标注。建议你定期查阅本政策。

---

### 八、如何联系开发者

如你对本隐私政策有任何疑问、建议或投诉，请通过以下方式联系我们：

- **邮箱**：[xtpeeps@gmail.com](mailto:xtpeeps@gmail.com)
- **官网**：[https://x7peeps.com](https://x7peeps.com)

---

*本隐私政策最终解释权归灵感工坊开发者所有。*
