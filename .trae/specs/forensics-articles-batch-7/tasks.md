# 取证分析深度文章第七批 — 任务列表

## 文章一：供应链攻击取证深度分析
- [x] 创建文章文件 `hugo-src/content/安全/应急响应/0x03取证分析/供应链攻击取证深度分析.md`
- [x] 编写 front matter（weight: 550，日期、标签、描述）
- [x] 编写 0x01 技术基础与取证概述（供应链攻击分类、与传统恶意软件差异、工具链）
- [x] 编写 0x02 软件依赖投毒取证（npm/PyPI/Maven 仓库投毒、typosquatting、依赖混淆）
- [x] 编写 0x03 CI/CD 流水线污染取证（GitHub Actions/Travis CI/Jenkins 污染、构建环境入侵）
- [x] 编写 0x04 开发者账号与签名链取证（代码签名验证、Sigstore/SSDF、commit 篡改检测）
- [x] 编写 0x05 SolarWinds 式高级持续性供应链攻击取证（DLL 侧加载、更新机制利用）
- [x] 编写 0x06 操作系统与固件供应链取证（UEFI/BIOS 篡改、驱动签名伪造、OTA 更新劫持）
- [x] 编写 0x07 证据强度分层与案例关联
- [x] 编写 0x08 自动化检测与狩猎（Sigma 规则 + Bash 脚本 + Python 工具 + SBOM 生成）
- [x] 编写 0x09 公开案例分析（SolarWinds、XZ Utils、event-stream 等 >= 2 个案例）
- [x] 编写 0x0A 参考资料（>= 8 条）
- [x] 验证字符数 >= 20,000（实际 41,425 字符）

## 文章二：物联网(IoT)取证深度分析
- [x] 创建文章文件 `hugo-src/content/安全/应急响应/0x03取证分析/物联网IoT取证深度分析.md`
- [x] 编写 front matter（weight: 560，日期、标签、描述）
- [x] 编写 0x01 技术基础与取证概述（IoT 架构、攻击面、取证挑战）
- [x] 编写 0x02 智能家居设备取证（摄像头/DVR/NVR、智能音箱、智能门锁）
- [x] 编写 0x03 IoT 网关与通信协议取证（MQTT/CoAP/AMQP、Zigbee/Z-Wave/BLE）
- [x] 编写 0x04 固件提取与逆向分析取证（Flash Dump、JTAG/UART、Binwalk/Firmware Analysis Toolkit）
- [x] 编写 0x05 工业 IoT 与 SCADA 边缘取证（Modbus TCP/RTU、OPC UA、边缘计算节点）
- [x] 编写 0x06 IoT 恶意软件与僵尸网络取证（Mirai 变种、Mozi、BotenaGo）
- [x] 编写 0x07 证据强度分层与案例关联
- [x] 编写 0x08 自动化检测与狩猎（Sigma 规则 + Bash 脚本 + Python 工具）
- [x] 编写 0x09 公开案例分析（Mirai、BrickerBot、Hajime 等 >= 2 个案例）
- [x] 编写 0x0A 参考资料（>= 8 条）
- [x] 验证字符数 >= 20,000（实际 57,998 字符）

## 文章三：数据库深度取证分析
- [x] 创建文章文件 `hugo-src/content/安全/应急响应/0x03取证分析/数据库深度取证分析.md`
- [x] 编写 front matter（weight: 570，日期、标签、描述）
- [x] 编写 0x01 技术基础与取证概述（数据库类型、日志体系、取证与传统 DBA 差异）
- [x] 编写 0x02 MySQL/PostgreSQL 注入痕迹取证（慢查询日志、general log、binlog/WAL 分析）
- [x] 编写 0x03 NoSQL 数据库取证（MongoDB 注入检测、Redis 未授权访问取证、CouchDB 攻击痕迹）
- [x] 编写 0x04 数据库持久化与提权取证（存储过程滥用、UDF 提权、 xp_cmdshell）
- [x] 编写 0x05 数据泄露与外传取证（数据脱库痕迹、外联检测、数据水印追踪）
- [x] 编写 0x06 云数据库与 RDS 取证（AWS RDS/Azure SQL/Cloud SQL 日志、审计策略）
- [x] 编写 0x07 证据强度分层与案例关联
- [x] 编写 0x08 自动化检测与狩猎（Sigma 规则 + Bash 脚本 + Python 工具）
- [x] 编写 0x09 公开案例分析（>= 2 个真实案例）
- [x] 编写 0x0A 参考资料（>= 8 条）
- [x] 验证字符数 >= 20,000（实际 58,092 字符）

## 构建验证
- [x] 运行 `hugo --minify` 验证构建通过（4149 Pages，无 ERROR）
