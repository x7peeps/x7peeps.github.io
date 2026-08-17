+++
title = "开源项目"
weight = 6
+++

<div class="x7-product-intro">
  <p>这里收录由 x7peeps 维护、参与或持续二次开发的公开项目。每个页面都会说明项目来源、我们增加的能力、使用入口与上游致谢。</p>
</div>

<div class="x7-promo-strip">
  <div>
    <span class="x7-promo-kicker">Open Source · Hermes Agent Features</span>
    <h2>Hermes 新特性研究</h2>
    <p>x7peeps 向 Hermes Agent 上游贡献的新特性系列研究：本地 MLX 流式 TTS、P2P 联邦心跳、MCP 图像视觉桥接、技能发现幽灵建议……每个特性一篇研究文章，记录 PR 地址、设计方案与实测数据。</p>
    <div class="x7-promo-actions">
      <a class="x7-promo-button x7-promo-button-primary" href="/开源项目/hermes新特性/">查看系列文章</a>
      <a class="x7-promo-button" href="https://github.com/NousResearch/hermes-agent" target="_blank" rel="noopener">Hermes 上游仓库</a>
    </div>
  </div>
  <div class="x7-theme-meta-full">
    <p><strong>定位：</strong>开源贡献研究——把提交到上游的新特性沉淀为可读的研究文档。</p>
    <p><strong>内容：</strong>每篇 = 问题背景 + 特性设计 + 实测数据 + PR 地址。</p>
    <p><strong>状态：</strong>26 个特性 PR，持续更新。</p>
  </div>
</div>

<div class="x7-promo-strip">
  <div>
    <span class="x7-promo-kicker">Open Source · Java Memory Shell Auditor</span>
    <h2>memshell-auditor</h2>
    <p>Java 内存马运行时审计 Agent：attach 到目标 JVM，检测 Filter / Servlet / Listener / Valve 与 defineClass 注入型内存马。JMG 真实载荷（冰蝎 / 哥斯拉 / 蚁剑 / Suo5）实测 7/7 检出，零依赖、纯反射、JDK 8 编译兼容 8-21+。</p>
    <div class="x7-promo-actions">
      <a class="x7-promo-button x7-promo-button-primary" href="/开源项目/memshell-auditor/">查看项目详情</a>
      <a class="x7-promo-button" href="https://github.com/x7peeps/memshell-auditor" target="_blank" rel="noopener">GitHub 仓库</a>
    </div>
  </div>
  <div class="x7-theme-meta-full">
    <p><strong>定位：</strong>Web 攻防中的内存马应急检测，无文件落盘、类名伪装均可检出。</p>
    <p><strong>信号：</strong>A1 磁盘无 class 强信号 / A3-A4 / B1-B2 辅助信号。</p>
    <p><strong>输出：</strong>JSON + 控制台，可直接接入应急响应流程。</p>
  </div>
</div>

<div class="x7-promo-strip">
  <div>
    <span class="x7-promo-kicker">Open Source · Mindmap Presentation</span>
    <h2>Mindmap PPT</h2>
    <p>把文章、报告、演讲稿和笔记转换为可逐步播放的思维导图演示。二开版本加入大纲检索、稳定链接、沉浸演示、离线导出、打印交付，以及适配鼠标和 Mac 触摸板的画板镜头控制。</p>
    <div class="x7-promo-actions">
      <a class="x7-promo-button x7-promo-button-primary" href="/开源项目/Mindmap-PPT/">查看项目详情</a>
      <a class="x7-promo-button" href="https://github.com/x7peeps/mindmap-ppt-custom" target="_blank" rel="noopener">GitHub 仓库</a>
    </div>
  </div>
  <div class="x7-theme-meta-full">
    <p><strong>适合：</strong>课程讲解、方案汇报、知识分享、演讲提纲与复杂文档的结构化展示。</p>
    <p><strong>交付：</strong>静态网页、稳定节点链接、离线 ZIP、打印与 PDF。</p>
    <p><strong>交互：</strong>键盘播放、滚轮平移、Shift 横移、触摸板双指移动与捏合缩放。</p>
  </div>
</div>

{{< article_cards >}}
