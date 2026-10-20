title: "Rhysida"
weight: 12title: "Rhysida"
weight: 12
date: 2026-06-24T10:35:38+08:00
---

**报告编号**: TIR-2026-0624-012 | **分类等级**: TLP:AMBER | **发布日期**: 2026年6月24日 | **情报来源**: 多源交叉验证（OSINT + 执法通报 + 厂商报告）

---

## 一、执行摘要

**Rhysida** 是一个于2023年5月首次活跃的勒索软件即服务（RaaS）组织，以蜈蚣属（*Rhysida*）命名并使用蜈蚣标志。该组织与 **Vice Society（DEV-0832/Vanilla Tempest）** 存在高度技术关联，多家安全厂商和执法机构评估认为 Rhysida 是 Vice Society 的演化品牌或关联载荷。截至2026年6月，Rhysida 已攻击全球超过 **200个组织**，重点目标涵盖教育、医疗、制造业、信息技术和政府部门的"机会性目标"。

<!--more-->

### 关键发现

| 维度 | 关键指标 |
|------|----------|
| **组织规模** | 200+ 受害者（含 Interlock 生态约 80+ 受害者/2025年），全球影响 |
| **攻击速度** | 从横向移动到勒索部署最短仅需 **8天** |
| **加密强度** | ChaCha20 + RSA-4096，**无公开解密器** |
| **首要入口** | VPN 凭证利用（无MFA）、恶意广告（Malvertising）、漏洞利用 |
| **商业模式** | RaaS，利润分成模式，仅接受比特币支付 |
| **核心载荷** | Rhysida 加密器（Windows/Linux）、CleanUpLoader/OysterLoader、Supper 后门 |
| **多平台支持** | Windows、Linux |
| **关联组织** | Vice Society（DEV-0832）、Interlock、TAG-124（Landupdate808） |
| **解密可能性** | **不存在**（截至2026年6月无公开解密工具） |

### 威胁等级评估

| 评估维度 | 等级 | 说明 |
|----------|------|------|
| **技术能力** | 🟠 高 | 多平台加密、CleanUpLoader 持久化、代码签名证书滥用、Tomb 加密器 |
| **运营成熟度** | 🟠 高 | RaaS 平台、多层基础设施、恶意广告分发网络 |
| **攻击规模** | 🟠 高 | 200+ 受害者，教育/医疗/政府跨部门攻击 |
| **目标针对性** | 🔴 极高 | 主动攻击学校和医院，突破传统勒索软件"道德底线" |
| **数据泄露风险** | 🔴 极高 | 双重勒索 + 泄露网站公开羞辱 + 7天快速发布期限 |

---

## 二、威胁行为者画像

### 2.1 组织标识

| 属性 | 值 |
|------|-----|
| **官方名称** | Rhysida |
| **别名** | DEV-0832（Microsoft）、Vanilla Tempest（Microsoft）、TAC5279（Sophos） |
| **追踪编号** | G1039（MITRE）、S1147 |
| **组织类型** | 勒索软件即服务（RaaS） |
| **活跃周期** | 2023年5月 → 至今 |
| **主要语言** | 英语（泄露站）、俄语（推断，CIS地区活动） |
| **地理归属** | 独联体地区（CIS），可能位于俄罗斯（中置信度） |
| **攻击目标** | 教育、医疗、制造、IT、政府（"机会性目标"） |
| **动机** | 经济利益 |
| **标志** | 蜈蚣（Centipede） |

### 2.2 组织演化时间线

```
2021年夏季    Vice Society 首次活跃
              主要目标：美国教育部门
              使用多种商品化勒索载荷
    ↓
2022.11       Sophos 首次观测到 TAC5279 活动集群
              针对政府/物流部门部署 Vice Society
    ↓
2023.02       Vice Society 攻击物流部门
              驻留时间长达112天
    ↓
2023.04       Vice Society 攻击教育部门
              开始使用 SystemBC
    ↓
2023.05       Rhysida 首次出现
              智利军队遭攻击
              Vice Society 活动开始减少
    ↓
2023.06       同一 TAC5279 集群切换至 Rhysida
              物流和教育部门受害
    ↓
2023.07       攻击 Prospect Medical Holdings
              影响美国17家医院和166家诊所
              美国 HHS 定义为医疗 sector 重大威胁
    ↓
2023.10       英国图书馆遭攻击
              英王爱德华七世医院数据泄露
              声称窃取英国王室成员信息
    ↓
2023.11       CISA/FBI/MS-ISAC 联合发布警报（AA23-319A）
    ↓
2023.12       Insomniac Games 遭攻击
              Marvel's Wolverine 游戏细节泄露
    ↓
2024.05       恶意广告活动启动（Google/Bing）
              CleanUpLoader 伪装 Microsoft Teams 下载
    ↓
2024.07       美国哥伦布市遭攻击
              3TB 数据泄露，勒索30 BTC（170万美元）
    ↓
2024.08       西雅图-塔科马国际机场遭攻击
    ↓
2025.01       IBM X-Force 发现 Tomb 加密器用于加载 Broomstick/Rhysida
    ↓
2025.03       恶意广告活动升级（Bing 搜索 + Windows 11 开始菜单）
              使用40+ 代码签名证书（vs 2024年仅7个）
              滥用 Microsoft Trusted Signing 系统
    ↓
2025.04       CISA 更新通告（新增 IOC）
    ↓
2025.06       IBM X-Force 披露 Rhysida-Interlock 生态关联
              Endico 下载器、Supper 后门、Tomb 加密器
    ↓
2025.09       Microsoft  disrupt Vanilla Tempest 活动
              撤销200+ 关联代码签名证书
    ↓
2026          持续活跃，约80受害者（2025年数据）
              Interlock 生态可能从 Rhysida 分裂
```

### 2.3 关联团伙

| 代号 | 说明 |
|------|------|
| **Vice Society / DEV-0832** | 前身/关联组织，TTPs 高度一致，2023年5月后活动减少与 Rhysida 出现时间吻合 |
| **Vanilla Tempest** | Microsoft 对 Vice Society/Rhysida 关联集群的追踪名称 |
| **TAC5279** | Sophos 对同一攻击者行为集群的追踪编号 |
| **Interlock** | 2024年9月出现的勒索组织，Cisco Talos 评估可能从 Rhysida 运营者/开发者分裂 |
| **TAG-124 / Landupdate808 / KongTuke** | IBM X-Force 发现的与 Interlock 关联的活动集群 |

### 2.4 附属成员体系

| 指标 | 数据 |
|------|------|
| **分成比例** | 利润分成模式（RaaS），具体比例未公开 |
| **沟通渠道** | 泄露网站谈判、比特币支付 |
| **准入门槛** | 通过 IAB（初始访问经纪人）获取访问权限 |
| **专业分工** | 基础设施管理、恶意广告运营、CleanUpLoader 开发、谈判 |

---

## 三、归因分析

### 3.1 归属评估

| 字段 | 信息 | 置信度 |
|------|------|--------|
| **语言归属** | 英语（泄露站）、俄语（推断） | 中 |
| **地理归属** | 独联体地区（CIS），可能位于俄罗斯 | 中 |
| **Vice Society 关联** | TTPs 完全一致（PortStarter、SystemBC、temp_l0gs 目录、ZeroLogon、RDP+PsEx