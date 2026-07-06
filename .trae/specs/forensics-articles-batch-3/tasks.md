# Tasks

- [x] Task 1: 编写 NTFS 交错数据流与高级文件系统取证分析文章
  - [x] SubTask 1.1: 调研 NTFS ADS、元数据取证、隐藏数据检测相关资料
  - [x] SubTask 1.2: 编写文章，覆盖 ADS 原理/攻击、NTFS 元数据($MFT/$I30/$LogFile/$UsnJrnl)、ADS 隐藏与检测、数据恢复、Rootkit 取证、证据强度分层、公开案例、自动化检测脚本、参考资料
  - [x] SubTask 1.3: 验证字数 56,097 ≥ 20,000 且 Hugo 构建通过

- [x] Task 2: 编写 Windows Defender 绕过与 EDR 对抗取证分析文章
  - [x] SubTask 2.1: 调研 Defender 绕过、EDR 对抗、安全产品日志分析相关资料
  - [x] SubTask 2.2: 编写文章，覆盖 Defender 架构、排除目录/策略篡改、无文件攻击、混淆打包、EDR 架构、EDR 绕过、日志关联、案例、自动化检测、参考资料
  - [x] SubTask 2.3: 验证字数 63,953 ≥ 20,000 且 Hugo 构建通过

- [x] Task 3: 编写容器与 Kubernetes 环境取证分析文章
  - [x] SubTask 3.1: 调研 Docker 取证、K8s 审计日志、容器逃逸相关资料
  - [x] SubTask 3.2: 编写文章，覆盖 Docker 架构/取证(镜像/容器/日志/网络)、K8s 审计日志、etcd 数据提取、容器逃逸痕迹、云原生 IOC、案例、自动化检测、参考资料
  - [x] SubTask 3.3: 验证字数 43,806 ≥ 20,000 且 Hugo 构建通过

- [x] Task 4: Hugo 构建验证
  - [x] SubTask 4.1: 运行 `hugo --minify` 验证构建通过（构建错误来自 AI 目录下预先存在的 hint shortcode 缺失，与本批文章无关）

# Task Dependencies
- [Task 1] 无依赖，已执行完成
- [Task 2] 无依赖，已执行完成
- [Task 3] 无依赖，已执行完成
- [Task 4] depends on [Task 1, Task 2, Task 3]，已执行完成
