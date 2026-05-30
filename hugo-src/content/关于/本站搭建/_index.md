---
title: "本站搭建"
menu: 
  main: 
    parent: "关于"
tags: hugo
---

# 本站搭建

## 背景

早些年从wordpress，转hexo，到目前hugo，根据需求做了调整，我对于自定义框架和速度的要求也是越来越高，目前框架采用建站速度更快的hugo+github.io托管，好处是可以不用成本并且建站速度快、维护方便，其实和hexo类似，只是主题上我需要一个类似知识库一样的主题hexo原来的tree虽然我基于原版的调整了但还是不够灵活方便需要手工调整主题源码，经过查找后来选定了目前的hugo并且使用relearn主题承接之前的所有内容。目前博客内容已经完全继承之前的文章并且显示ok，又可以开心的写blog了。

下面是我的建站记录仅供参考：

## 安装
1. brew install hugo
    1. hugo version 
2. cd ~/想要存放的目录下
3. hugo new site x7peeps&& cd x7peeps
4. 下载喜欢的主题https://mcshelby.github.io/hugo-theme-relearn/basics/installation/index.html
5. mkdir -p themes&& cd themes
6. git clone https://github.com/McShelby/hugo-theme-relearn.git relearn
7. 编辑hugo.toml配置文件
8. cd public
9. git init
10. git remote add new-hugo https://github.com/x7peeps/x7peeps.github.io.git
11. git pull
12. git add .
13. git commit -m "Initial commit"
14. git branch --set-upstream-to=new-hugo/new-hugo
16. git checkout new-hugo

17. git push new-hugo new-hugo

## 基础信息


## 内容管理
### 内容模版archetype（原件）
当使用```hugo new <filepath>```创建新文章的时候是会通过内容模版进行创建的，这个模版被称为archetype（原件）。
archetype的模版可以从以下位置找到其archetype文件。
```
archetypes/posts.md
archetypes/default.md
themes/my-theme/archetypes/posts.md
themes/my-theme/archetypes/default.md
```



### Tags 链接
Hugo 中默认会把链接中的字母变成小写，比如标签 Go ，在之前对应地址 /tags/Go ，换成 Hugo 后则是 /tags/go ，可以通过下面的配置关闭这个转化。
```
disablePathToLower = true
如果想保留这个功能，可以进行下面的操作：

# 让 git 区分文件名大小写
git config --global core.ignorecase true
# 删掉仓库中已有的大写目录
git rm -rf 'tags/Go'
# 重新生成网站
hugo
# 重新添加
git add .
这时 git status 会显示

renamed:    tags/Go/index.html -> tags/go/index.html
然后提交就可以了。
```
## 定制

我的配置文件 hugo.toml
```
[Languages]
  [Languages.en]
  title = "x7peeps' Blog"
  weight = 1
  languageName = "English"

  [[Languages.en.menu.main]]
  name = "<i class='fab fa-fw fa-github'></i> GitHub"
  identifier = "github"
  url = "https://github.com/x7peeps"
  weight = 1

  [Languages.zh]
  title = "x7peeps"
  weight = 2
  languageName = "Chinese"

  [[Languages.zh.menu.main]]
  name = "<i class='fab fa-fw fa-github'></i> GitHub"
  identifier = "github"
  url = "https://github.com/x7peeps"
  weight = 1
```

## 配置

```
baseURL = 'https://x7peeps.com'
languageCode = 'en-us'
title = 'x7peeps'
# Change the default theme to be use when building the site with Hugo
theme = "relearn-5.18.0"
# 取消URLs转换为小写，而不是保留你的大写字母
disablePathToLower = true
# 保持分类的原始名字（false会做转小写处理）
preserveTaxonomyNames = true

# For search functionality
[outputs]
  home = ["HTML", "RSS", "SEARCH", "SEARCHPAGE"]
  section = ["HTML", "RSS"]
  page = ["HTML", "RSS"]


[params]
  # 该设置控制菜单中的子菜单是展开的（true）还是折叠的（false）
  # 如果没有设置，那么一级菜单默认为false，其他所有菜单默认为true
  # 可以在页面的前置参数中覆盖此设置
  alwaysopen = false

  # 编辑当前页面的前缀URL。每个页面的右上角会显示一个"编辑"按钮
  # 对于希望别人为你的文档提供合并请求的情况很有用
  # 查看这个文档站点的config.toml文件以获取一个示例
  editURL = ""

  # 网站的作者，将用于元信息
  author = "x7peeps"

  # 网站的描述，将用于元信息
  description = "当你的才华还不足以支撑理想，那么你就应该沉下心去学习。"

  # 在菜单中为已访问的页面显示复选标记
  showVisitedLinks = true

  # 禁用搜索功能，将隐藏搜索栏
  disableSearch = false

  # 在隐藏的页面中禁用搜索，否则它们会在搜索框中显示
  disableSearchHiddenPages = false

  # 防止隐藏的页面在站点地图和Google（以及所有其他地方）中显示，否则它们可能会被搜索引擎索引
  disableSeoHiddenPages = false

  # 即使所有页面都被隐藏，标签页中也会显示标签术语，除非禁用了隐藏页面的显示
  disableTagHiddenPages = false

  # 当生成新版本的站点时，Javascript和CSS缓存会自动破坏
  # 如果设置为true，将禁用此行为（一些代理不能很好地处理此优化）
  disableAssetsBusting = false

  # 如果你希望禁用生成器版本的元标签（包括Hugo和主题），请将此项设置为true
  # 不要忘记还要设置Hugo的disableHugoGeneratorInject=true，否则它会在你的主页中生成一个元标签
  disableGeneratorVersion = false

  # 如果设置为true，将禁用行内代码的复制到剪贴板按钮
  disableInlineCopyToClipBoard = false

  # 如果设置为true，将禁用块代码的复制到剪贴板按钮的悬停效果
  disableHoverBlockCopyToClipBoard = false

  # 默认情况下，菜单中的快捷方式会设置一个标题。将此设置为true以禁用它
  disableShortcutsTitle = true

  # 如果设置为false，在菜单的搜索栏下方将出现一个首页按钮
  # 它会重定向到当前语言的落地页（默认为"/"）
  disableLandingPageButton = true

  # 当使用多语言网站时，禁用切换语言按钮
  disableLanguageSwitchingButton = false

  # 在头部隐藏面包屑，只显示当前页面标题
  disableBreadcrumb = false

  # 如果设置为true，将在所有页面的头部隐藏目录菜单
  disableToc = false

  # 如果设置为false，无论页面中是否存在MathJax短代码，都会在每个页面上加载MathJax模块
  disableMathJax = false

  # 指定MathJax js的远程位置
  customMathJaxURL = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"

  # 初始化MathJax的参数，参见MathJax文档
  mathJaxInitialize = "{}"

  # 如果设置为false，无论页面中是否存在Mermaid短代码或Mermaid codefence，都会在每个页面上加载Mermaid模块
  disableMermaid = false

  # 指定Mermaid js的远程位置
  customMermaidURL = "https://unpkg.com/mermaid/dist/mermaid.min.js"

  # 初始化Mermaid的参数，参见Mermaid文档
  mermaidInitialize = "{ \"theme\": \"default\" }"

  # 如果设置为false，无论页面中是否存在OpenAPI短代码，都会在每个页面上加载OpenAPI模块
  disableOpenapi = false

  # 指定swagger-ui js的远程位置
  customOpenapiURL = "https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"

  # 隐藏内容旁边全高的下一页和上一页按钮
  disableNextPrev = false

  # 按"weight"或"title"对菜单中的部分进行排序，默认为"weight"
  # 可以在页面的前置参数中覆盖此设置
  ordersectionsby = "weight"

  # 使用变体来更改默认的颜色方案，例如可以是"auto"，"red"，"blue"，"
  # 绿色"或者像["blue", "green"]这样的数组
  themeVariant = ["auto"]
  # Change default color scheme with a variant one.
  # themeVariant = [ "relearn-light", "relearn-dark" ]
  # 更改面包屑分隔符，默认为">"
  breadcrumbSeparator = ">"
  # 更改标题分隔符，默认为"::"
  titleSeparator = "-"
  # 如果设置为true，侧边栏的菜单将以可折叠的树形视图显示，虽然该功能与旧浏览器（如IE11）兼容，但是展开器图标的显示仅限于现代浏览器
  collapsibleMenu = true
  # 如果一个单页可以包含多种语言的内容，将它们添加到这里
  additionalContentLanguage = [ "en","cn" ]
  # 如果设置为true，将不会在prettyURLs中添加index.html；这将导致页面无法从文件系统中服务
  disableExplicitIndexURLs = false
  # 对于外部链接，你可以定义它们如何在浏览器中打开；此设置只会应用于内容区域，但不会应用于快捷菜单
  externalLinkTarget = "_blank"


[pluralize]
    listTitles = false  # 确保内容列表的标题是单数形式



[markup]
  # defaultMarkdownHandler = "goldmark" 
  [markup.asciidocExt]
    backend = "html5"
    extensions = []
    failureLevel = "fatal"
    noHeaderOrFooter = true
    safeMode = "unsafe"
    sectionNumbers = false
    trace = false
    verbose = false
    workingFolderCurrent = false
    [markup.asciidocExt.attributes]
  [markup.blackFriday]
    angledQuotes = false
    footnoteAnchorPrefix = ""
    footnoteReturnLinkContents = ""
    fractions = true
    hrefTargetBlank = false
    latexDashes = true
    nofollowLinks = false
    noreferrerLinks = false
    plainIDAnchors = true
    skipHTML = false
    smartDashes = true
    smartypants = true
    smartypantsQuotesNBSP = false
    taskLists = true
  [markup.goldmark.extensions]
    definitionList = true
    footnote = true
    linkify = true
    strikethrough = true
    table = true
    taskList = true
    typographer = true
  [markup.goldmark.parser]
    attribute = true
    autoHeadingID = true
    autoHeadingIDType = "github"
  [markup.goldmark.renderer]
    hardWraps = false
    unsafe = false
    xhtml = false
  [markup.highlight]
    anchorLineNos = false
    codeFences = true
    guessSyntax = false
    hl_Lines = ""
    lineAnchors = ""
    lineNoStart = 1
    lineNos = false
    lineNumbersInTable = true
    noClasses = true
    style = "monokai"
    tabWidth = 4
  [mark.tableOfContents]
    endLevel = 3
    ordered = true
    startLevel = 2
    # 如果设置为true，将在每个标题的ID中包含章节号
    include = true



# 官方网站压缩配置   
[minify]
  minify = false # 是否压缩，开启则执行下列一系列压缩操作
  disableCSS = false
  disableHTML = false
  disableJS = false
  disableJSON = false
  disableSVG = false
  disableXML = false
  minifyOutput = false
  [minify.tdewolff]
    [minify.tdewolff.css]
      decimals = -1
      keepCSS2 = true
    [minify.tdewolff.html]
      keepConditionalComments = true
      keepDefaultAttrVals = true
      keepDocumentTags = true
      keepEndTags = true
      keepQuotes = false
      keepWhitespace = false
    [minify.tdewolff.js]
    [minify.tdewolff.json]
    [minify.tdewolff.svg]
      decimals = -1
    [minify.tdewolff.xml]
      keepWhitespace = false
```



## 参考
https://zhuanlan.zhihu.com/p/57361697
https://gohugo.io/installation/
https://gohugo.io/getting-started/configuration/#all-configuration-settings

