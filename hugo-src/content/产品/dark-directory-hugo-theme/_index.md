+++
title = "Dark Directory Hugo Theme"
weight = 20
+++

<div class="x7-theme-hero">
  <div class="x7-theme-hero-copy">
    <span class="x7-theme-kicker">Open Source Theme</span>
    <h1>Dark Directory Hugo Theme</h1>
    <p>一个基于 Hugo + Relearn 打造的暗色知识库主题扩展层，适合安全研究、产品展示、技术博客与个人品牌站点。它延续了本站的导航结构、信息密度与视觉气质，也能像展示 OfflinePassbook 一样自然承载产品宣传。</p>
    <div class="x7-theme-actions">
      <a class="x7-theme-button x7-theme-button-primary" href="/产品/OfflinePassbook/">查看产品示例</a>
      <a class="x7-theme-button" href="#theme-features">查看主题能力</a>
    </div>
  </div>
  <div class="x7-theme-showcase">
    <div class="x7-theme-showcase-main">
      <img src="/images/products/offlinepassbook/01.png" alt="Dark Directory Hugo Theme product showcase" loading="eager" decoding="async">
    </div>
    <div class="x7-theme-showcase-stack">
      <img src="/images/products/offlinepassbook/02.png" alt="Dark Directory Hugo Theme product layout" loading="lazy" decoding="async">
      <img src="/images/products/offlinepassbook/03.png" alt="Dark Directory Hugo Theme visual detail" loading="lazy" decoding="async">
    </div>
  </div>
</div>

## 开源定位 {#theme-features}

Dark Directory Hugo Theme 不是从零重写的独立主题，而是一个可复用、可开源、可继续演化的主题扩展层：

- 保留 Hugo + Relearn 的稳定底座，避免重复造轮子。
- 通过 `layouts`、`static/css/custom.css` 和 `static/js/custom.js` 完成导航、交互和视觉层升级。
- 用少量示例内容即可跑出和本站一致的暗色目录风格。

<div class="x7-theme-grid">
  <section class="x7-theme-panel">
    <h3>目录结构清晰</h3>
    <p>适合文章、专题、知识库、产品页混合共存，侧边栏层级结构清楚，长文和分类页都能保持稳定阅读体验。</p>
  </section>
  <section class="x7-theme-panel">
    <h3>产品展示自然</h3>
    <p>不仅能放技术内容，也能像上面的 OfflinePassbook 一样，把产品截图、下载链接和价值主张直接融入主题表达。</p>
  </section>
  <section class="x7-theme-panel">
    <h3>暗色调与交互感</h3>
    <p>主题加入了更强的层次、光感和悬浮反馈，在保持信息密度的同时，让首页、栏目页和产品页更有品牌识别度。</p>
  </section>
</div>

## 产品宣传能力

<div class="x7-theme-meta">
  <div>
    <p>对于个人开发者和小团队来说，一个好用的 Hugo 主题不应该只会展示文档，还应该能承接产品发布、版本更新、下载入口和品牌表达。</p>
    <ul class="x7-theme-list">
      <li>适合把博客、知识库、产品介绍、更新日志放到同一个站点里。</li>
      <li>适合为独立应用、开发工具或安全项目做长期沉淀。</li>
      <li>适合用极少的模板改动，把文章型站点升级成带产品感的个人官网。</li>
    </ul>
  </div>
  <div>
    <img src="/images/products/offlinepassbook/appicon.png" alt="OfflinePassbook app icon" loading="lazy" decoding="async">
  </div>
</div>

## 使用方式

如果你也想基于这个主题扩展层搭建自己的站点，可以直接复用它的：

- `hugo.toml` 与 `go.mod` 配置
- `layouts/` 模板覆盖层
- `static/css/custom.css` 与 `static/js/custom.js`
- 少量演示内容与图片资源

后续这个页面会持续作为主题的产品介绍与开源入口。
