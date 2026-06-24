# Checklist

## 文章格式检查
- [ ] YAML frontmatter 包含 title, date, draft:false, weight (递增), description, categories, tags
- [ ] 文章包含攻击面总览表格
- [ ] 文章包含服务识别与版本探测章节
- [ ] 文章包含至少 3 个 CVE 漏洞分析
- [ ] 文章包含具体的 PoC 代码示例
- [ ] 文章包含历史 CVE 漏洞时间线表格
- [ ] 文章包含蓝队检测与应急响应章节
- [ ] 文章包含安全审计清单
- [ ] 文章包含总结章节
- [ ] 代码示例保持英文，章节标题和技术术语保持中文

## 工作流检查
- [ ] 每篇文章 Grep 检查去重后才开始编写
- [ ] 每篇文章 Task 子代理研究后才开始编写
- [ ] 每篇文章 Hugo 构建验证通过 (exit code 0)
- [ ] 每篇文章 Git commit --only 只提交单个文件
- [ ] 每篇文章 Git push 成功推送到远程

## Hugo 构建检查
- [ ] Hugo 构建无错误
- [ ] 页面数持续递增
- [ ] 无 broken links 或 missing content 错误

## Git 提交检查
- [ ] 只使用 git commit --only 提交单个文件
- [ ] 不提交其他未跟踪或修改的文件
- [ ] commit message 格式: "新增 <文章标题>文章"
- [ ] push 成功到 origin/master

## 主题去重检查
- [ ] Palo Alto PAN-OS 主题未在现有文章中出现
- [ ] Cisco IOS/ASA/FTD 主题未在现有文章中出现
- [ ] Ivanti Connect Secure 主题未在现有文章中出现
- [ ] VMware vSphere/ESXi 主题未在现有文章中出现
- [ ] Citrix NetScaler ADC/Gateway 主题未在现有文章中出现
