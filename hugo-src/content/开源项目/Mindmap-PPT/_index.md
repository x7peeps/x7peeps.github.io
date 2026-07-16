+++
title = "Mindmap PPT"
weight = 10
+++

<div class="x7-theme-hero">
  <div class="x7-theme-hero-copy">
    <span class="x7-theme-kicker">Open Source Custom Edition</span>
    <h1>Mindmap PPT</h1>
    <p>把文章、报告、演讲稿或笔记变成可逐步播放、检索、分享和离线交付的思维导图演示。内容保持为易维护的文本结构，页面使用静态 HTML、CSS 和 JavaScript，可直接本地运行或部署到 GitHub Pages。</p>
    <div class="x7-theme-actions">
      <a class="x7-theme-button x7-theme-button-primary" href="https://x7peeps.github.io/mindmap-ppt-custom/" target="_blank" rel="noopener">打开在线演示</a>
      <a class="x7-theme-button" href="https://github.com/x7peeps/mindmap-ppt-custom" target="_blank" rel="noopener">查看二开仓库</a>
      <a class="x7-theme-button" href="https://github.com/agegr/mindmap-ppt" target="_blank" rel="noopener">查看原项目</a>
    </div>
  </div>
  <div class="x7-theme-meta-full">
    <p><strong>内容输入：</strong>文章、会议纪要、课程笔记、产品文档、演讲提纲</p>
    <p><strong>演示输出：</strong>网页播放、节点深链、离线 ZIP、打印与 PDF</p>
    <p><strong>操作方式：</strong>键盘、鼠标滚轮、触摸板、移动端滑动</p>
  </div>
</div>

## 项目亮点

<div class="x7-theme-grid">
  <section class="x7-theme-panel">
    <h3>顺着结构讲内容</h3>
    <p>按思维导图的层级逐节点播放，支持方向键、Page Up / Page Down、Space、Home 和 End。当前节点、进度滑条、大纲与 URL 始终同步。</p>
  </section>
  <section class="x7-theme-panel">
    <h3>像画板一样自由查看</h3>
    <p>滚轮上下移动视角，Shift + 滚轮横向移动，触摸板双指自由平移，Ctrl + 滚轮或 Mac 捏合手势以指针为中心缩放。</p>
  </section>
  <section class="x7-theme-panel">
    <h3>检索与稳定分享</h3>
    <p>大纲保留完整层级和访问状态，可搜索标题或内容。节点可配置稳定 ID，分享链接在改文案或调整结构后仍能定位。</p>
  </section>
  <section class="x7-theme-panel">
    <h3>完整交付能力</h3>
    <p>支持生成可运行的离线目录和 ZIP，导出过程检查缺失素材与路径安全；也可按根概览和一级分支打印为横向 PDF。</p>
  </section>
  <section class="x7-theme-panel">
    <h3>沉浸式演示</h3>
    <p>提供全屏演示、页面内沉浸模式、黑屏、自动隐藏控件和减少动态效果适配，适合正式讲解与会议投屏。</p>
  </section>
  <section class="x7-theme-panel">
    <h3>本地优先</h3>
    <p>内容和图片保存在项目目录，静态运行无需后端服务。缩放、控制面板和大纲偏好保存在浏览器本机。</p>
  </section>
</div>

## 快速开始

```bash
git clone https://github.com/x7peeps/mindmap-ppt-custom.git
cd mindmap-ppt-custom
npm install
npm run dev
```

默认访问 `http://127.0.0.1:5173/`。编辑 `project/source.js` 即可替换演示内容，本地插图放在 `project/` 下。

常用检查与交付命令：

```bash
npm run check
npm run check:browser
npm run export
```

## Agent Skill

仓库内附带 `mindmap-ppt-builder` Skill，可帮助 Agent 把文章、报告或笔记整理为结构清晰的演示导图：

```bash
npx skills add x7peeps/mindmap-ppt-custom --skill mindmap-ppt-builder
```

## 原项目与致谢

本仓库是基于 [agegr/mindmap-ppt](https://github.com/agegr/mindmap-ppt) 的二次开发版本。

感谢原作者 [Alex Yang（agegr）](https://github.com/agegr) 创建并公开原始项目。二开仓库保留了原始 Git 提交历史和作者记录，并在 README 与 `NOTICE.md` 中持续标注来源。

截至本页面发布时，上游仓库未包含许可证文件，GitHub 也未识别到开源许可证。公开可见不等于自动授予复制、再分发或商业使用权；有相关使用需求时，请查阅上游最新状态并向原作者取得必要许可。
