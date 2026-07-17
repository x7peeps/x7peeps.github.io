# X7PEEPS 首页入场动画优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有首页入场优化为约 2.2 秒的“镜头呼吸 + 粒子聚焦”序列，同时杜绝整屏闪烁、文章页误触发和侧栏交互失效。

**Architecture:** 保留现有首页早期状态类与 `initHomeMotion()` 入口。`home.js` 增加一次性粒子聚焦阶段和桌面/移动端完成时间；`x7-home.css` 负责确定性的分层视觉时间轴；`tests/render-contracts.sh` 保护首页限定、无整屏透明度动画、侧栏恢复和 reduced-motion 降级。

**Tech Stack:** Hugo、Relearn、原生 ES Modules、Canvas 2D、CSS Keyframes、Bash/Node 渲染契约测试。

## Global Constraints

- 只优化首页首次入场，不改变首页信息结构、文案、热力图数据和最近更新顺序。
- 不改变文章页切换、知识树展开、侧栏滚动和条目尺寸。
- 不增加 WebGL、动画库、第二个 Canvas 或其他依赖。
- 桌面端完整序列在 2200ms 内稳定；移动端目标为 1850ms 内稳定。
- 禁止 `body`、`#R-body`、`#R-body-inner` 或根布局的整屏透明度动画。
- `prefers-reduced-motion: reduce` 直接进入最终静态状态。
- 每次提交只暂存本计划列出的文件，不包含工作区中的文章和规格草稿。

---

## 文件职责

- `hugo-src/static/js/x7/home.js`：入场状态、完成兜底、粒子聚焦到环境漂浮的切换。
- `hugo-src/static/css/x7-home.css`：Logo 呼吸、光环、镜头归位、分层显现和移动端降级。
- `tests/render-contracts.sh`：源码契约、首页限定、无闪屏和 Hugo 渲染回归。

### Task 1：粒子聚焦与完成状态控制

**Files:**
- Modify: `tests/render-contracts.sh:37-75`
- Modify: `hugo-src/static/js/x7/home.js:1-194`

**Interfaces:**
- Consumes: `x7-home-entry-prime`、`x7-home-entry-complete`、`[data-x7-home]`。
- Produces: `getHomeEntryDuration(): number`、`getParticleFocusDuration(): number`、Canvas 的 `data-entry-phase="focus|ambient"`。

- [ ] **Step 1: 写入会失败的粒子与时长契约**

在现有首页动画 grep 后加入：

```bash
grep -Fq "const HOME_ENTRY_DESKTOP_DURATION = 2200;" "$source_dir/static/js/x7/home.js"
grep -Fq "const HOME_ENTRY_MOBILE_DURATION = 1850;" "$source_dir/static/js/x7/home.js"
grep -Fq "const PARTICLE_FOCUS_DESKTOP_DURATION = 1100;" "$source_dir/static/js/x7/home.js"
grep -Fq 'canvas.dataset.entryPhase = entryActive ? "focus" : "ambient";' "$source_dir/static/js/x7/home.js"
grep -Fq 'canvas.dataset.entryPhase = "ambient";' "$source_dir/static/js/x7/home.js"

node - "$source_dir/static/js/x7/home.js" <<'NODE'
const fs = require("node:fs");
const js = fs.readFileSync(process.argv[2], "utf8");
const canvasCreations = js.match(/document\.createElement\("canvas"\)/g) || [];
if (canvasCreations.length !== 1) process.exit(1);
for (const required of [
  "function getHomeEntryDuration()",
  "function getParticleFocusDuration()",
  "const focusEnvelope = Math.sin(Math.PI * entryProgress);",
]) {
  if (!js.includes(required)) process.exit(1);
}
NODE
```

- [ ] **Step 2: 运行契约并确认新检查失败**

Run: `X7_RENDER_CONTRACT_PHASE=digital-nocturne bash tests/render-contracts.sh`

Expected: 在第一个新增常量或 Canvas 状态检查处失败。

- [ ] **Step 3: 增加确定性的桌面/移动端时长**

在 `home.js` 顶部加入：

```js
const HOME_ENTRY_DESKTOP_DURATION = 2200;
const HOME_ENTRY_MOBILE_DURATION = 1850;
const PARTICLE_FOCUS_DESKTOP_DURATION = 1100;
const PARTICLE_FOCUS_MOBILE_DURATION = 820;
const MOBILE_HOME_QUERY = "(max-width: 52rem)";

function getHomeEntryDuration() {
  return window.matchMedia(MOBILE_HOME_QUERY).matches
    ? HOME_ENTRY_MOBILE_DURATION
    : HOME_ENTRY_DESKTOP_DURATION;
}

function getParticleFocusDuration() {
  return window.matchMedia(MOBILE_HOME_QUERY).matches
    ? PARTICLE_FOCUS_MOBILE_DURATION
    : PARTICLE_FOCUS_DESKTOP_DURATION;
}
```

将完成超时改为：

```js
window.setTimeout(finish, getHomeEntryDuration() + 150);
```

- [ ] **Step 4: 为单 Canvas 增加聚焦阶段**

取得 context 后加入：

```js
const entryActive = document.documentElement.classList.contains("x7-home-entry-prime");
const entryStartedAt = performance.now();
const entryDuration = getParticleFocusDuration();
canvas.dataset.entryPhase = entryActive ? "focus" : "ambient";
```

每个粒子增加：

```js
focusAngle: (index / targetCount) * Math.PI * 2 + Math.random() * 0.35,
focusRadius: 28 + Math.random() * Math.min(96, width * 0.09),
```

在 `draw(time)` 的中心点计算后加入：

```js
const entryProgress = entryActive
  ? Math.min(1, Math.max(0, (time - entryStartedAt) / entryDuration))
  : 1;
const focusEnvelope = Math.sin(Math.PI * entryProgress);
if (entryActive && entryProgress >= 1 && canvas.dataset.entryPhase !== "ambient") {
  canvas.dataset.entryPhase = "ambient";
}
```

用以下坐标绘制粒子：

```js
const focusX = cx + Math.cos(p.focusAngle + time * 0.00018) * p.focusRadius;
const focusY = cy + Math.sin(p.focusAngle + time * 0.00014) * p.focusRadius * 0.55;
const focusStrength = focusEnvelope * (0.58 + p.z * 0.18);
const drawX = p.x + dx + (focusX - p.x) * focusStrength;
const drawY = p.y + dy + (focusY - p.y) * focusStrength;
const entryGlow = 1 + focusEnvelope * 0.5;

ctx.beginPath();
ctx.fillStyle = `rgba(116, 235, 255, ${alpha * entryGlow})`;
ctx.arc(drawX, drawY, radius * entryGlow, 0, Math.PI * 2);
ctx.fill();
```

- [ ] **Step 5: 运行契约确认通过**

Run: `X7_RENDER_CONTRACT_PHASE=digital-nocturne bash tests/render-contracts.sh`

Expected: Hugo 构建成功，时长、单 Canvas 和 `focus → ambient` 契约通过。

- [ ] **Step 6: 提交粒子与状态控制**

```bash
git add tests/render-contracts.sh hugo-src/static/js/x7/home.js
git commit -m "Polish homepage entry particle focus"
```

### Task 2：镜头呼吸与分层显现时间轴

**Files:**
- Modify: `tests/render-contracts.sh:37-75`
- Modify: `hugo-src/static/css/x7-home.css:609-813`

**Interfaces:**
- Consumes: 根节点状态和 Task 1 的 2200ms/1850ms 完成时间。
- Produces: `x7-home-logo-breathe`、`x7-home-halo-bloom`、`x7-home-camera-settle`、`x7-home-heatmap-ignite`、`x7-home-feed-rise`、`x7-home-entry-sidebar`。

- [ ] **Step 1: 写入会失败的关键帧和无闪屏契约**

在首页 CSS Node 检查中加入：

```js
for (const keyframe of [
  "x7-home-logo-breathe",
  "x7-home-halo-bloom",
  "x7-home-camera-settle",
  "x7-home-heatmap-ignite",
  "x7-home-feed-rise",
  "x7-home-entry-sidebar",
]) {
  if (!css.includes(`@keyframes ${keyframe}`)) process.exit(1);
}

for (const selector of ["body", "#R-body", "#R-body-inner"]) {
  const escaped = selector.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&");
  const rule = css.match(new RegExp(`html\\.x7-home-entry-prime\\s+${escaped}\\s*\\{([^}]*)\\}`))?.[1] || "";
  if (/\bopacity\s*:|\banimation\s*:[^;]*(?:flash|fade)/i.test(rule)) process.exit(1);
}
```

- [ ] **Step 2: 运行契约并确认关键帧检查失败**

Run: `X7_RENDER_CONTRACT_PHASE=digital-nocturne bash tests/render-contracts.sh`

Expected: 因缺少 `x7-home-logo-breathe` 或 `x7-home-halo-bloom` 而失败。

- [ ] **Step 3: 将 Logo 改为呼吸聚焦并增加一次性光环**

使用：

```css
html.x7-home-entry-prime .x7-home-avatar {
  position: relative;
  z-index: 6;
  animation: x7-home-logo-breathe 1.45s cubic-bezier(.16, 1, .3, 1) both;
}

html.x7-home-entry-prime .x7-home-identity::before {
  content: "";
  position: absolute;
  z-index: 1;
  top: .7rem;
  left: 50%;
  width: clamp(4.8rem, 8vw, 7.5rem);
  aspect-ratio: 1;
  border-radius: 50%;
  pointer-events: none;
  animation: x7-home-halo-bloom 1.12s cubic-bezier(.16, 1, .3, 1) .18s both;
}

@keyframes x7-home-logo-breathe {
  0% { transform: translate3d(0, 18vh, 0) scale(.94); opacity: 0; filter: blur(8px) saturate(.78); }
  30% { transform: translate3d(0, 18vh, 0) scale(1.06); opacity: 1; filter: blur(0) saturate(1); }
  62% { transform: translate3d(0, 18vh, 0) scale(1.025); opacity: 1; filter: none; }
  100% { transform: translate3d(0, 0, 0) scale(1); opacity: 1; filter: none; }
}

@keyframes x7-home-halo-bloom {
  0% { transform: translate3d(-50%, 18vh, 0) scale(.72); opacity: 0; box-shadow: 0 0 0 0 rgb(98 232 255 / 0%); }
  46% { opacity: .7; box-shadow: 0 0 0 1.1rem rgb(255 255 255 / 2.5%), 0 0 4.8rem rgb(98 232 255 / 13%); }
  100% { transform: translate3d(-50%, 0, 0) scale(1.34); opacity: 0; box-shadow: 0 0 0 1.8rem rgb(98 232 255 / 0%); }
}
```

删除旧 `x7-home-logo-center` 关键帧，避免两个 Logo 动画叠加。

- [ ] **Step 4: 设置分层显现时间**

```css
html.x7-home-entry-prime .x7-constellation-home::before {
  animation: x7-home-camera-settle 1.78s cubic-bezier(.16, 1, .3, 1) both;
}
html.x7-home-entry-prime .x7-home-hero::before {
  opacity: .28;
  animation: x7-home-stage-blackout 1.95s cubic-bezier(.16, 1, .3, 1) both;
}
html.x7-home-entry-prime .x7-home-kicker,
html.x7-home-entry-prime .x7-hero-title,
html.x7-home-entry-prime .x7-hero-subtitle,
html.x7-home-entry-prime .x7-hero-mission {
  animation: x7-home-copy-reveal .72s cubic-bezier(.16, 1, .3, 1) .76s both;
}
html.x7-home-entry-prime .x7-heatmap-panel {
  animation: x7-home-heatmap-ignite .82s cubic-bezier(.16, 1, .3, 1) 1.08s both;
}
html.x7-home-entry-prime .x7-feed {
  animation: x7-home-feed-rise .64s cubic-bezier(.16, 1, .3, 1) 1.42s both;
}
html.x7-home-entry-prime #R-sidebar {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translate3d(-.72rem, 0, 0);
  animation: x7-home-entry-sidebar .58s cubic-bezier(.16, 1, .3, 1) 1.62s both !important;
}
```

侧栏关键帧起点同步使用 `-.72rem` 和 `blur(4px)`；终点继续包含 `visibility: visible` 与 `pointer-events: auto`。

- [ ] **Step 5: 增加移动端和 reduced-motion 降级**

在 reduced-motion 查询前加入：

```css
@media (max-width: 52rem) {
  html.x7-home-entry-prime .x7-home-particles { opacity: .56; }
  html.x7-home-entry-prime .x7-home-avatar { animation-duration: 1.18s; }
  html.x7-home-entry-prime .x7-home-identity::before { animation-duration: .9s; }
  html.x7-home-entry-prime .x7-home-feed { animation-delay: 1.16s; }
  html.x7-home-entry-prime #R-sidebar { animation-delay: 1.28s !important; }
}
```

在 reduced-motion 中加入：

```css
html.x7-home-entry-prime .x7-home-identity::before {
  display: none !important;
}
```

- [ ] **Step 6: 运行契约确认通过**

Run: `X7_RENDER_CONTRACT_PHASE=digital-nocturne bash tests/render-contracts.sh`

Expected: 关键帧、无整屏透明度动画、侧栏最终交互和 reduced-motion 契约全部通过。

- [ ] **Step 7: 提交视觉时间轴**

```bash
git add tests/render-contracts.sh hugo-src/static/css/x7-home.css
git commit -m "Refine cinematic homepage entry timeline"
```

### Task 3：全量回归与浏览器验收

**Files:**
- Verify: `hugo-src/static/js/x7/home.js`
- Verify: `hugo-src/static/css/x7-home.css`
- Verify: `tests/render-contracts.sh`

**Interfaces:**
- Consumes: Tasks 1–2 的完整动画。
- Produces: 可发布且不影响文章页、侧栏和 reduced-motion 的验证证据。

- [ ] **Step 1: 检查补丁格式和范围**

Run:

```bash
git diff --check HEAD~2 -- hugo-src/static/js/x7/home.js hugo-src/static/css/x7-home.css tests/render-contracts.sh
git diff --stat HEAD~2 -- hugo-src/static/js/x7/home.js hugo-src/static/css/x7-home.css tests/render-contracts.sh
```

Expected: 第一条命令无输出；统计只包含上述三个文件。

- [ ] **Step 2: 运行全量 Hugo 渲染契约**

Run:

```bash
GOPROXY=https://goproxy.cn,direct GOSUMDB=sum.golang.google.cn X7_RENDER_CONTRACT_PHASE=digital-nocturne bash tests/render-contracts.sh
```

Expected: Hugo 完成全站构建，脚本退出码为 0。

- [ ] **Step 3: 启动本地服务**

Run:

```bash
hugo server --source hugo-src --bind 127.0.0.1 --port 4173 --baseURL http://localhost:4173/ --disableFastRender
```

Expected: 输出 `Web Server is available at http://localhost:4173/`。

- [ ] **Step 4: 验收首页首次进入**

在无痕标签页打开 `http://localhost:4173/`：确认黑场稳定、Logo 单次呼吸、粒子柔和汇聚、镜头归位、热力图点亮、最近更新出现、侧栏最后显现；约 2.2 秒后构图与当前首页一致，无白闪或整页透明度跳变。

- [ ] **Step 5: 验收导航和侧栏**

点击两个不同文章再返回首页：确认文章切换不播放首页开场、整个画面不闪、侧栏不重绘、触摸板能连续上下滚动知识树、单行条目内部没有滚动容器。

- [ ] **Step 6: 验收移动端和减少动态效果**

使用 390×844 视口确认动画更短、粒子更淡且无横向滚动；启用 reduced-motion 后刷新，确认最终页面立即出现，Logo、光环、粒子和侧栏均不播放入场动画。

- [ ] **Step 7: 检查最终提交状态**

Run:

```bash
git log --oneline -4
git status --short
```

Expected: 最近提交包含两项动画实现提交；原有文章草稿仍未暂存，三个动画相关文件没有未提交修改。
