---
name: "个人主页-文章编写-产品页面"
description: "x7peeps.com Hugo 站点产品展示页面全流程创建（调研+编写+隐私政策+构建+发布）。当用户要求新增产品、创建产品页、展示 App 或软件产品、更新产品信息时调用此 skill。触发词：新增产品、产品页、产品展示、App 展示、产品页面。"
---

# 个人主页 - 产品页面编写

为 x7peeps.com 个人主页 Hugo 站点创建产品展示页面的标准流程。基于 OfflinePassbook 和灵感工坊两个产品的实战经验沉淀而成。

---

## 一、站点基本信息

| 项目 | 值 |
|------|-----|
| **站点域名** | x7peeps.com（GitHub Pages） |
| **仓库地址** | `git@github.com:x7peeps/x7peeps.github.io.git` |
| **站点根目录** | `/Users/pwndazhang/Library/Mobile Documents/com~apple~CloudDocs/6 开发项目/个人主页/x7peeps.github.io` |
| **Hugo 源文件** | `hugo-src/`（所有 Hugo 操作在此目录下） |
| **内容目录** | `hugo-src/content/` |
| **产品板块** | `hugo-src/content/产品/` |
| **产品图片** | `hugo-src/static/images/products/` |
| **主题** | hugo-theme-relearn（暗色变体 `relearn-dark`） |
| **默认语言** | zh-CN |
| **排序规则** | `ordersectionsby = "weight"`（数字越小越靠前） |
| **CDN/部署** | GitHub Pages + CNAME 绑定 x7peeps.com |

> **⚠️ 关键路径规则**：所有 Hugo 构建命令必须在 `hugo-src/` 目录下执行，**绝不能在仓库根目录执行**。

---

## 二、完整工作流（7 阶段）

### Phase 1: 需求确认

1. **确认产品来源** — 产品源码路径、README、Swift/项目结构
2. **确认产品信息** — 名称、一句话描述、技术栈、核心特性、下载地址
3. **确认截图来源** — App Store 截图路径、本地 Assets 路径
4. **确认隐私政策需求** — 判断是否涉及用户数据（详见 Phase 5）
5. **确认排序权重** — 查看 `产品/` 下已有产品的 weight 值，避免冲突

### Phase 2: 素材准备

1. **获取产品截图**：
   - 优先使用真实截图（App Store 截图、产品 Assets 目录）
   - 无真实截图时可用 AI 生成图作为占位
   - 截图命名规范：`01_功能名.png`、`02_功能名.png`... 或 `01.png`、`02.png`...
2. **获取 App Icon**：1024x1024 的 `appicon.png`
3. **阅读产品源码**：理解产品架构、技术栈、核心功能
4. **整理产品信息**：名称、描述、技术栈表格、核心特性列表

### Phase 3: 创建产品目录和文件

**目录结构**：

```
hugo-src/
├── content/
│   └── 产品/
│       ├── _index.md              # 产品索引页（含 promo strip）
│       └── <产品名>/
│           ├── _index.md          # 产品详情页
│           └── privacy.md         # 独立隐私政策页面（如涉及数据）
├── static/
│   └── images/
│       └── products/
│           └── <产品名>/          # 产品截图目录
│               ├── appicon.png
│               ├── 01_xxx.png
│               └── ...
```

**操作命令**：

```bash
# 创建图片目录
mkdir -p hugo-src/static/images/products/<产品名>/

# 复制截图到图片目录
cp /path/to/screenshots/*.png hugo-src/static/images/products/<产品名>/

# 创建产品内容目录
mkdir -p hugo-src/content/产品/<产品名>/
```

### Phase 4: 编写产品详情页 `_index.md`

**Frontmatter 格式（TOML）**：

```toml
+++
title = "<产品名>"
weight = <权重值>    # 按产品重要性递增：10, 20, 30...
+++
```

**页面完整模板**：

```markdown
+++
title = "<产品名>"
weight = 30
+++

<div style="display: flex; align-items: center; gap: 20px; margin-bottom: 30px;">
  <img src="/images/products/<产品名>/appicon.png" alt="<产品名> Icon" style="width: 120px; height: 120px; border-radius: 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
  <div>
    <h3 style="margin: 0 0 10px 0;">一句话描述</h3>
    <p style="margin: 0; color: var(--x7-muted);">副标题描述</p>
  </div>
</div>

产品介绍段落...

**下载地址：** [App Store](https://apps.apple.com/app/xxx/)（或"即将上线"）

**技术栈：**

| 层级 | 技术 |
|------|------|
| 客户端 | ... |
| 架构 | ... |
| 云端 | ... |

**核心特性：**

- **特性一** — 描述
- **特性二** — 描述
- ...

### 界面预览

<div style="display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; margin-top: 30px; margin-bottom: 30px;">
  <img src="/images/products/<产品名>/01_xxx.png" alt="界面描述" style="max-width: 200px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
  <img src="/images/products/<产品名>/02_xxx.png" alt="界面描述" style="max-width: 200px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
  ...
</div>

### 工作流程（可选）

描述产品工作流...

### 项目结构（可选）

```
ProjectName/
├── Module1/
├── Module2/
└── ...
```

## 技术支持网址

在使用<产品名>过程中遇到任何技术问题、Bug 反馈或功能建议，可通过以下途径获取技术支持：

- **技术支持邮箱**：[xtpeeps@gmail.com](mailto:xtpeeps@gmail.com)
- **支持官网**：[https://x7peeps.com](https://x7peeps.com)

## 隐私政策

**隐私政策独立页面**：[https://x7peeps.com/产品/<产品名>/privacy/](/产品/<产品名>/privacy/)

**生效日期：YYYY-MM-DD**

**最近更新：YYYY-MM-DD**

---

<产品名>（以下简称"本应用"）由 x7peeps（以下简称"开发者"或"我们"）开发。我们重视你的隐私，本隐私政策说明本应用如何处理和保护你的信息。

---

### 一、我们收集哪些数据

#### 1.1 用户数据（本地存储）

描述本地存储策略...

#### 1.2 云端同步数据（可选）

描述云端同步策略（如有）...

#### 1.3 第三方服务交互数据

描述 AI 服务或其他第三方服务的数据处理...

#### 1.4 不收集的数据

本应用**不收集**以下信息：

- 个人身份信息
- 设备位置信息
- 当前版本不包含任何第三方分析 SDK、广告 SDK
- 不进行跨 App 或网站追踪

---

### 二、我们如何使用数据

| 数据类型 | 使用目的 |
|---------|---------|
| ... | ... |

---

### 三、数据存储与安全

- **本地优先**：...
- **加密传输**：...

---

### 四、数据保留与删除

- 删除策略...

---

### 五、第三方服务

| 服务 | 用途 | 隐私政策 |
|------|------|---------|
| ... | ... | ... |

---

### 六、未成年人保护

本应用不面向 13 周岁以下的儿童。

---

### 七、隐私政策更新

...

---

### 八、如何联系开发者

- **邮箱**：[xtpeeps@gmail.com](mailto:xtpeeps@gmail.com)
- **官网**：[https://x7peeps.com](https://x7peeps.com)

---

*本隐私政策最终解释权归<产品名>开发者所有。*
```

### Phase 5: 隐私政策判断与创建

#### 5.1 判断规则

| 产品特征 | 是否需要隐私政策 |
|---------|---------------|
| 纯本地、无网络、无数据收集 | 简单声明即可（如 OfflinePassbook） |
| 涉及云端同步 | 需要完整隐私政策 + 独立页面 |
| 涉及 AI 服务调用 | 需要完整隐私政策 + 独立页面 |
| 涉及用户账户系统 | 需要完整隐私政策 + 独立页面 |
| App Store 提审 | **必须**有独立隐私政策 URL |

**经验法则**：只要产品涉及任何形式的数据（即使用户数据仅存储在本地），都应提供隐私政策说明。如果是 iOS App 且要上架 App Store，**必须**创建独立隐私政策页面。

#### 5.2 创建独立隐私政策页面 `privacy.md`

**重要**：如果产品涉及用户数据，**必须**创建独立隐私政策页面，供 App Store 提审使用。

```markdown
+++
title = "<产品名> - 隐私政策"
+++

# <产品名> 隐私政策

**生效日期：YYYY-MM-DD**

**最近更新：YYYY-MM-DD**

---

<产品名>（以下简称"本应用"）由 x7peeps（以下简称"开发者"或"我们"）开发。我们重视你的隐私，本隐私政策说明本应用如何处理和保护你的信息。

---

## 一、我们收集哪些数据

### 1.1 用户数据（本地存储）

描述本地存储策略...

### 1.2 云端同步数据（可选）

描述云端同步策略（如有）...

### 1.3 第三方服务交互数据

描述 AI 服务或其他第三方服务的数据处理...

### 1.4 不收集的数据

本应用**不收集**以下信息：

- 个人身份信息（姓名、电话号码等）
- 设备位置信息
- 通讯录或日历数据
- 当前版本不包含任何第三方分析 SDK、广告 SDK
- 不进行跨 App 或网站追踪

---

## 二、我们如何使用数据

| 数据类型 | 使用目的 |
|---------|---------|
| ... | ... |

---

## 三、数据存储与安全

- **本地优先**：...
- **加密传输**：...

---

## 四、数据保留与删除

- 删除策略...

---

## 五、第三方服务

| 服务 | 用途 | 隐私政策 |
|------|------|---------|
| ... | ... | ... |

---

## 六、未成年人保护

本应用不面向 13 周岁以下的儿童。我们不会故意收集儿童的个人信息。

---

## 七、隐私政策更新

...

---

## 八、如何联系开发者

- **邮箱**：[xtpeeps@gmail.com](mailto:xtpeeps@gmail.com)
- **官网**：[https://x7peeps.com](https://x7peeps.com)

---

*本隐私政策最终解释权归<产品名>开发者所有。*
```

**独立页面 URL**：`https://x7peeps.com/产品/<产品名>/privacy/`

### Phase 6: 更新产品索引页 `产品/_index.md`

在产品索引页中添加 promo strip，插入到 `{{< article_cards >}}` 之前：

```html
<div class="x7-promo-strip">
  <div>
    <span class="x7-promo-kicker">标签 · 状态</span>
    <h2><产品名></h2>
    <p>一句话描述。</p>
    <div class="x7-promo-actions">
      <a class="x7-promo-button x7-promo-button-primary" href="/产品/<产品名>/">查看产品详情</a>
    </div>
  </div>
  <div class="x7-promo-visual">
    <div class="x7-promo-grid">
      <img src="/images/products/<产品名>/appicon.png" alt="<产品名> App Icon" style="border-radius: 20px; object-fit: cover;" loading="eager" decoding="async">
      <img src="/images/products/<产品名>/01_xxx.png" alt="界面描述" style="border-radius: 12px;" loading="lazy" decoding="async">
      <img src="/images/products/<产品名>/02_xxx.png" alt="界面描述" style="border-radius: 12px;" loading="lazy" decoding="async">
    </div>
  </div>
</div>
```

**Promo kicker 标签参考**：

| 产品类型 | 标签示例 |
|---------|---------|
| iOS App | `iOS App · Coming Soon` / `iOS App` |
| 开源项目 | `New Open Source` |
| 工具/网站 | `Tool` / `Website` |

### Phase 7: 构建验证与推送

```bash
cd hugo-src && hugo --minify
```

验证要点：
1. **构建成功** — 无 ERROR 输出（WARNING 可忽略）
2. **页面数确认** — 确认 `public/产品/<产品名>/` 目录生成正确
3. **隐私政策页面** — 确认 `public/产品/<产品名>/privacy/index.html` 存在（如有）

**Git 提交**：

```bash
cd "/Users/pwndazhang/Library/Mobile Documents/com~apple~CloudDocs/6 开发项目/个人主页/x7peeps.github.io"
git add hugo-src/content/产品/<产品名>/ hugo-src/static/images/products/<产品名>/ hugo-src/content/产品/_index.md
git commit -m "feat: 新增<产品名>产品展示页面"
git push
```

> **⚠️ 经验教训**：写完产品页后**不要自动推送**，除非用户明确说"推送"、"提交到 git"、"发布"。

---

## 三、CSS 变量参考

产品页面使用的 CSS 变量（来自暗色主题）：

| 变量 | 用途 |
|------|------|
| `var(--x7-muted)` | 次要文字颜色（副标题、说明文字） |
| `var(--x7-text)` | 正文文字颜色 |
| `var(--x7-accent)` | 强调色 |

---

## 四、图片规范

| 规范项 | 要求 |
|--------|------|
| **App Icon** | 1024x1024 PNG，命名 `appicon.png` |
| **截图命名** | `01_功能名.png`、`02_功能名.png`... 或 `01.png`、`02.png`... |
| **详情页截图样式** | `max-width: 200px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);` |
| **索引页截图样式** | `border-radius: 12px;` |
| **索引页 Icon 样式** | `border-radius: 20px; object-fit: cover;` |

---

## 五、产品详情页章节结构

| 章节 | 必选/可选 | 说明 |
|------|----------|------|
| 产品头部（Icon + 描述） | **必选** | flex 布局，Icon + 标题 + 副标题 |
| 产品介绍段落 | **必选** | 1-2 段产品概述 |
| 下载地址 | **必选** | App Store 链接或"即将上线" |
| 技术栈表格 | **必选** | 层级-技术 两列表格 |
| 核心特性列表 | **必选** | 加粗特性名 + 破折号 + 描述 |
| 界面预览 | **必选** | flex 布局展示截图 |
| 工作流程 | 可选 | 产品工作流描述 |
| 项目结构 | 可选 | 代码块展示项目目录 |
| 技术支持网址 | **必选** | 邮箱 + 官网 |
| 隐私政策 | **必选** | 完整隐私政策内容（详见 Phase 5） |

---

## 六、隐私政策标准章节

隐私政策必须包含以下 8 个标准章节：

| 章节 | 内容 |
|------|------|
| 一、我们收集哪些数据 | 本地存储、云端同步（可选）、第三方服务交互（可选）、不收集的数据 |
| 二、我们如何使用数据 | 表格形式：数据类型 → 使用目的 |
| 三、数据存储与安全 | 本地优先、加密传输、iCloud 同步（如有） |
| 四、数据保留与删除 | 用户删除策略、注销策略、卸载策略 |
| 五、第三方服务 | 表格形式：服务名 → 用途 → 隐私政策链接 |
| 六、未成年人保护 | 不面向 13 周岁以下儿童 |
| 七、隐私政策更新 | 更新机制说明 |
| 八、如何联系开发者 | 邮箱 + 官网 |

**固定联系信息**：
- 邮箱：`xtpeeps@gmail.com`
- 官网：`https://x7peeps.com`

---

## 七、已有产品列表

| 产品名 | weight | 下载地址 | 隐私政策 |
|--------|--------|---------|---------|
| OfflinePassbook | 10 | App Store 已上架 | 简单声明（纯本地） |
| dark-directory-hugo-theme | 20 | GitHub 开源 | 无需 |
| 灵感工坊 | 30 | App Store 即将上线 | 完整隐私政策 + 独立页面 |

**新增产品时 weight 取值**：当前最大值 + 10（如已有 30，新产品的 weight 为 40）。

---

## 八、常见陷阱与修复

| 问题 | 原因 | 修复方法 |
|------|------|----------|
| Hugo 构建失败 `shortcode not found` | 使用了 `{{< hint >}}` | 替换为 `{{< notice >}}` |
| 产品在侧边栏不显示 | weight 值冲突 | 查看已有 weight，选择不冲突的值 |
| Hugo 构建报 module not found | 在根目录执行 hugo | 切换到 `hugo-src/` 目录执行 |
| 截图不显示 | 路径错误或文件不存在 | 检查 `static/images/products/<产品名>/` 目录 |
| 隐私政策 URL 无法访问 | 未创建 `privacy.md` | 创建独立隐私政策页面 |
| App Store 审核被拒 | 缺少隐私政策 URL | 必须有独立隐私政策页面 |
| promo strip 不显示 | CSS class 拼写错误 | 确认使用 `x7-promo-strip`、`x7-promo-grid` 等 |
| git push 后页面没更新 | 未推送到远程 | 确认执行了 `git push` |

---

## 九、快速参考卡片

### 新建产品页面的最小操作

```bash
# 1. 创建图片目录并复制截图
mkdir -p "hugo-src/static/images/products/<产品名>/"
cp /path/to/screenshots/*.png "hugo-src/static/images/products/<产品名>/"

# 2. 创建产品内容目录
mkdir -p "hugo-src/content/产品/<产品名>/"

# 3. 创建产品详情页 _index.md
# 4. 创建隐私政策 privacy.md（如涉及数据）
# 5. 更新产品索引页 产品/_index.md 添加 promo strip

# 6. 构建验证
cd hugo-src && hugo --minify

# 7. 等用户确认后推送
cd ..
git add "hugo-src/content/产品/<产品名>/" "hugo-src/static/images/products/<产品名>/" "hugo-src/content/产品/_index.md"
git commit -m "feat: 新增<产品名>产品展示页面"
git push
```

### 产品详情页模板（精简版）

```markdown
+++
title = "<产品名>"
weight = 40
+++

<div style="display: flex; align-items: center; gap: 20px; margin-bottom: 30px;">
  <img src="/images/products/<产品名>/appicon.png" alt="<产品名> Icon" style="width: 120px; height: 120px; border-radius: 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
  <div>
    <h3 style="margin: 0 0 10px 0;">一句话描述</h3>
    <p style="margin: 0; color: var(--x7-muted);">副标题描述</p>
  </div>
</div>

产品介绍段落...

**下载地址：** [App Store](https://apps.apple.com/app/xxx/)（即将上线）

**技术栈：**

| 层级 | 技术 |
|------|------|
| ... | ... |

**核心特性：**

- **特性一** — 描述

### 界面预览

<div style="display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; margin-top: 30px; margin-bottom: 30px;">
  <img src="/images/products/<产品名>/01.png" alt="界面描述" style="max-width: 200px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
</div>

## 技术支持网址

- **技术支持邮箱**：[xtpeeps@gmail.com](mailto:xtpeeps@gmail.com)
- **支持官网**：[https://x7peeps.com](https://x7peeps.com)

## 隐私政策

（完整隐私政策内容，或链接到独立页面）
```

### 独立隐私政策模板（精简版）

```markdown
+++
title = "<产品名> - 隐私政策"
+++

# <产品名> 隐私政策

**生效日期：YYYY-MM-DD**

**最近更新：YYYY-MM-DD**

---

<产品名>（以下简称"本应用"）由 x7peeps（以下简称"开发者"或"我们"）开发。我们重视你的隐私，本隐私政策说明本应用如何处理和保护你的信息。

---

## 一、我们收集哪些数据
## 二、我们如何使用数据
## 三、数据存储与安全
## 四、数据保留与删除
## 五、第三方服务
## 六、未成年人保护
## 七、隐私政策更新
## 八、如何联系开发者

---

*本隐私政策最终解释权归<产品名>开发者所有。*
```

### Promo Strip 模板

```html
<div class="x7-promo-strip">
  <div>
    <span class="x7-promo-kicker">iOS App · Coming Soon</span>
    <h2><产品名></h2>
    <p>一句话描述。</p>
    <div class="x7-promo-actions">
      <a class="x7-promo-button x7-promo-button-primary" href="/产品/<产品名>/">查看产品详情</a>
    </div>
  </div>
  <div class="x7-promo-visual">
    <div class="x7-promo-grid">
      <img src="/images/products/<产品名>/appicon.png" alt="<产品名> App Icon" style="border-radius: 20px; object-fit: cover;" loading="eager" decoding="async">
      <img src="/images/products/<产品名>/01.png" alt="界面描述" style="border-radius: 12px;" loading="lazy" decoding="async">
      <img src="/images/products/<产品名>/02.png" alt="界面描述" style="border-radius: 12px;" loading="lazy" decoding="async">
    </div>
  </div>
</div>
```
