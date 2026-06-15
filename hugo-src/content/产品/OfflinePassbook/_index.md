+++
title = "OfflinePassbook"
weight = 10
+++

## 项目介绍

<div style="display: flex; align-items: center; gap: 20px; margin-bottom: 30px;">
  <img src="/images/products/offlinepassbook/appicon.png" alt="OfflinePassbook Icon" style="width: 120px; height: 120px; border-radius: 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
  <div>
    <h3 style="margin: 0 0 10px 0;">本地优先的加密密码本</h3>
    <p style="margin: 0; color: var(--x7-muted);">基于 SwiftUI 构建，专为 Apple 生态打造的极致安全体验。</p>
  </div>
</div>

OfflinePassbook 是一个本地优先、端上加密、可走 iCloud Documents 自动同步的 Apple 生态密码本原型。

**下载地址：** [App Store (https://apps.apple.com/app/offlinepassbook/id6775487353)](https://apps.apple.com/app/offlinepassbook/id6775487353)

**核心特性：**
- **原生与跨平台**：基于 Swift / SwiftUI 构建，目标平台为 iOS 17 和 macOS 14。
- **极致安全**：
  - 使用 `PasswordVaultCore` 结合 AES-GCM 加密整个数据保险库（Vault）。
  - 采用 PBKDF2-HMAC-SHA256 进行密钥派生，默认 310,000 次迭代，盐值随 vault 随机保存。
  - 支持 Face ID / Touch ID 便捷解锁，生物识别仅保护 Vault Key，不替代主密码。
  - 切换至后台或应用切换器时自动开启隐私遮罩，连续失败解锁自动递增延迟。
- **无缝同步**：默认使用 iCloud Documents 保存加密 Vault 文件，支持本地 Application Support 兜底。支持 iCloud 文件协调读写、冲突检测与外部变更刷新。
- **功能完备**：提供创建、解锁、新增、编辑、删除、生成随机密码、复制后自动清空剪贴板、加密导入导出等功能。
- **零追踪**：应用内置 `PrivacyInfo.xcprivacy` 隐私清单，声明不追踪、不收集任何用户数据。


### 界面预览

<div style="display: flex; gap: 20px; flex-wrap: wrap; justify-content: center; margin-top: 30px; margin-bottom: 30px;">
  <img src="/images/products/offlinepassbook/01.png" alt="界面预览 1" style="max-width: 250px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
  <img src="/images/products/offlinepassbook/02.png" alt="界面预览 2" style="max-width: 250px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
  <img src="/images/products/offlinepassbook/03.png" alt="界面预览 3" style="max-width: 250px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
</div>

## 主题展示

<div class="x7-promo-strip">
  <div>
    <span class="x7-promo-kicker">Theme Showcase</span>
    <h2>Dark Directory Hugo Theme</h2>
    <p>OfflinePassbook 当前就运行在这套主题扩展层之上。我们已经把这套 Hugo 暗色目录风格整理成可复用的开源项目，适合同时展示产品、文章和知识库内容。</p>
    <div class="x7-promo-actions">
      <a class="x7-promo-button x7-promo-button-primary" href="/产品/dark-directory-hugo-theme/">查看主题宣传页</a>
      <a class="x7-promo-button" href="/产品/">查看更多产品</a>
    </div>
  </div>
  <div class="x7-promo-visual">
    <div class="x7-promo-grid">
      <img src="/images/products/offlinepassbook/01.png" alt="OfflinePassbook theme showcase" loading="lazy" decoding="async">
      <img src="/images/products/offlinepassbook/02.png" alt="OfflinePassbook screenshot 2" loading="lazy" decoding="async">
      <img src="/images/products/offlinepassbook/03.png" alt="OfflinePassbook screenshot 3" loading="lazy" decoding="async">
    </div>
  </div>
</div>


## 技术支持网址

在使用 OfflinePassbook 过程中遇到任何技术问题、Bug 反馈或功能建议，可通过以下途径获取技术支持：

- **技术支持邮箱**：[xtpeeps@gmail.com](mailto:xtpeeps@gmail.com)
- **支持官网**：[https://x7peeps.com](https://x7peeps.com)

> *注：由于本项目为离线密码本，不包含任何中心化服务器，如果您遗忘了主密码，我们无法为您提供密码恢复服务，请务必妥善保管您的主密码。*

## 隐私政策

**生效日期：2026-06-01**

密码本是一款本地优先的离线密码管理工具。我们不提供账号系统，不运营用于接收用户密码的服务器，也不会主动收集、出售或共享你的个人数据。

### 数据存储
你创建的密码库保存在设备本地，并可通过你的 iCloud Drive 在同一 Apple ID 的设备之间同步。密码库文件在写入前已在设备端加密，开发者无法访问、读取或恢复其中的密码、备注或其他条目内容。

### iCloud 同步
如果你启用 iCloud，数据同步由 Apple 的 iCloud 服务完成。开发者不会接收同步内容，也无法通过服务器远程访问你的密码库。请注意，iCloud 的可用性、备份和账号安全由 Apple ID 与系统设置控制。

### 自动填充
当前版本包含系统自动填充扩展的基础框架。后续启用候选同步时，App 只会向 Apple 的凭证身份存储登记网站、用户名和本地记录标识；真正的密码仍保存在加密密码库中，只有在你选择填充并解锁密码库时才会由扩展提供给系统。

### 生物识别
Face ID 或 Touch ID 仅用于便捷解锁本机保存的加密密钥材料。生物识别数据由系统处理，App 不会读取或保存你的面容、指纹数据。

### 主密码与恢复
主密码不会上传给开发者。忘记主密码后，开发者无法恢复你的密码库。你可以自行导出加密密码库文件作为备份，但仍需对应主密码才能解锁。

### 第三方 SDK 与分析
当前版本不包含第三方分析 SDK、广告 SDK 或跨 App/网站追踪功能。

### 联系方式
如需隐私支持，请通过 App Store 页面提供的开发者联系方式联系。
