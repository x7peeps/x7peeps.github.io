---
title: "勒索组织"
weight: 1
---

本目录收录各类勒索软件组织的威胁情报跟踪文章，涵盖组织画像、归因分析、TTPs、IOC、解密工具及缓解建议等内容。

### 收录组织

| 组织名称 | 别名/追踪代号 | 威胁等级 | 活跃状态 | 说明 |
|----------|--------------|----------|----------|------|
| [LockBit](LockBit/) | G0154 | 🔴 极高 | 活跃 | 全球最活跃 RaaS 之一，数千受害者，AES-256-GCM + RSA-4096，执法打击中 |
| [Qilin（麒麟）](Qilin/) | Agenda / S1242 | 🔴 极高 | 活跃 | 全球最活跃 RaaS，1,888+ 受害者，5000万美元+年收入，Go→Rust 重写 |
| [The Gentlemen](TheGentlemen/) | Storm-2697 / LARVA-368 | 🔴 极高 | 活跃 | 俄罗斯 RaaS 组织，483+ 受害者，66+ 国家，支持蠕虫式自传播 |
| [Black Basta](BlackBasta/) | UNC4393 / Vengeful Mantis | 🔴 高 | 已停止 | Conti 重组，500+ 受害者，1.07亿美元+收入，2025年品牌崩溃 |
| [Akira](Akira/) | Storm-1567 / Howling Scorpius | 🔴 极高 | 活跃 | 1,400+ 受害者，2.44亿美元+收入，最短1小时完成加密，四阶段洗钱演化 |
| [Cl0p](Cl0p/) | TA505 / FIN11 / G0092 | 🔴 极高 | 活跃 | 11,000+ 受害组织，5亿美元+收入，MFT 零日专家，四重勒索模型 |
| [RansomHub](RansomHub/) | Greenbottle / Water Bakunawa / Knight | 🔴 极高 | 已停止 | 2024年最活跃RaaS，534+受害者，90/10附属分成，2025.04被DragonForce接管 |
| [Play](Play/) | G1040 / Playcrypt / Balloonfly | 🟠 高 | 活跃 | 900+ 受害者（FBI确认），间歇性加密，封闭式RaaS，Conti生态关联 |
| [Hive](Hive/) | DEV-0237 / Pistachio Tempest | 🔴 极高 | 已瓦解 | 1,500+ 受害者，80+国家，$1亿+赎金，2023.01被FBI秘密渗透瓦解 |
| [Royal](Royal/) | DEV-0569 / Ignoble Scorpius / S1073 | 🔴 极高 | 疑似活跃 | Conti直系继承，450+美国受害者，$3.7亿+赎金，六阶段品牌演化（Conti→Chaos），Operation Checkmate后以Chaos品牌重建 |
| [INC Ransom](INCRansom/) | G1032 / GOLD IONIC / S1139 | 🔴 极高 | 活跃 | 800+受害者，Rust重写，源码出售催生Lynx/Sinobi，GootLoader供应链入口，无道德底线（医疗/教育/政府均攻击） |
| [Rhysida](Rhysida/) | G1039 / S1147 / DEV-0832 | 🟠 高 | 活跃 | 200+受害者，Vice Society演化品牌，ChaCha20+RSA-4096，CleanUpLoader恶意广告分发，无解密器，教育/医疗/政府重点目标 |
| [Cactus](Cactus/) | GOLD VILLAGE / TA2101 / Storm-0216 | 🔴 极高 | 活跃 | 248+受害者，自加密二进制逃避检测，24小时漏洞武器化，Black Basta成员2025年转入融合，ESXi+Hyper-V双平台 |
| [Medusa](Medusa/) | G1051 / Storm-1175 / Spearwing | 🔴 极高 | 活跃 | 500+受害者，45+国家，三重勒索（加密+泄露+DDoS），RMM工具大规模滥用，朝鲜Lazarus介入，CISA/FBI AA25-071A |
| [ALPHV / BlackCat](ALPHV/) | S1068 / Noberus | 🔴 极高 | 活跃 | 1,000+攻击，首个Rust编写RaaS，跨平台（Win/Linux/ESXi），三重勒索，Change Healthcare事件（1亿+数据泄露，$2200万赎金），美国国务院悬赏$1000万 |
| [BianLian](BianLian/) | — | 🔴 极高 | 活跃 | 553+受害者，2024年起完全放弃加密转向纯数据勒索，SAP零日（CVE-2025-31324），USPS实体勒索信，医疗行业Top3威胁，CISA AA23-136A |
| [NoEscape](NoEscape/) | Avaddon 继承者 | 🟠 高 | 活跃 | Avaddon后继组织，ChaCha20+RSA-2048，Safe Mode加密，DDoS/电话/垃圾邮件附加服务（$500K+），美国为主要目标 |
| [DragonForce](DragonForce/) | Water Tambanakua / Hackledorb | 🔴 极高 | 活跃 | 579+受害者，LockBit+Conti双代码库，卡特尔模式，BYOVD多驱动，首个Teams TURN中继C2（Backdoor.Turn），英国零售高调攻击，吞并RansomHub |
| [Lynx](Lynx/) | Water Lalawag | 🔴 极高 | 活跃 | 414+受害者/48国，INC Ransom源码衍生（50%+函数重叠），AES-128 CTR+Curve25519，单日20家峰值，RaaS 80/20分成 |
| [SafePay](SafePay/) | — | 🔴 极高 | 活跃 | 403+受害者，集中化封闭运营（非RaaS），24小时攻击周期，AES-256-CBC+RSA-4096，单月70次攻击峰值，Ingram Micro供应链级影响 |

---

> 持续收集中，后续将补充更多勒索组织情报...
