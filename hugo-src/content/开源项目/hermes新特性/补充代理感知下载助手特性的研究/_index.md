---
title: "补充代理感知下载助手特性的研究"
weight: 21
tags: ["Hermes", "网络", "代理", "开源贡献", "PR研究"]
menu:
  main:
    parent: "开源项目"
---

> **PR 地址**：[NousResearch/hermes-agent#81883](https://github.com/NousResearch/hermes-agent/pull/81883) · 为 cua-driver 安装器增加代理感知 + 镜像回退 + 抗 DNS 污染下载助手

## 研究摘要

之前，`hermes computer-use install --upgrade` 在两类网络上必然失败：系统代理开启（Surge/Clash 配置在 macOS 系统设置里）但从未导出环境变量时，子进程 curl 拿不到代理，安装脚本拉取挂满整个超时；GitHub 被墙或限速时，单 URL 单尝试直接失败，用户只看到一行 "installer download failed"，没有任何前进路径。现在，安装器会自动读取系统代理并注入子进程，官方 URL 优先、失败快速报明细，并在 DNS 污染网络（中国大陆实测）上通过 DoH 重解析拿到真实 IP 后重试同一官方 URL。

整个特性分两个阶段落地：先实现代理感知与镜像回退的下载助手（新模块 `hermes_cli/net_download.py`），再针对中国大陆网络的 DNS 污染补上 DoH 重解析回退。健康网络的用户行为零变化——回退只在直接失败后激活，修复随代码生效、无需任何配置改动。

## 一、问题背景

### 1.1 代理盲区与单点失败

Hermes 原有下载代码有两个结构性缺口：只读用户显式导出的环境变量，从不读 macOS 系统代理（`scutil --proxy`），系统设置里开着的代理永远到不了子进程 curl；没有镜像回退，一个 URL 一次尝试一种失败模式。真实场景是：开着 Surge 的 Mac 上安装 cua-driver，`install.sh` 从 raw.githubusercontent.com 拉取、release 包从 github.com 拉取，全部挂在 curl 超时上，唯一症状是一行无法行动的报错。

### 1.2 DNS 污染的实测证据

2026-08-13 迭代补上的场景来自中国大陆网络实测：系统解析器对 huggingface.co / hf-mirror.com 返回被污染的 A 记录——实测值包括 Dropbox（162.125.x）、Verizon（128.242.x）、NTT（160.16.x）的 IP。直接拉取报 `Could not resolve host` 或连接错误，而站点本身可达。Surge 代理规则把 HF 域名走 DIRECT（超时），`mirror_candidates()` 又只包 github.com 的 URL，HF 相关下载（模型元数据、权重、安装脚本）完全无解。

## 二、特性设计

### 2.1 net_download.py：三个函数构成的下载助手

- `detect_proxy()`：显式 `HTTPS_PROXY`/`HTTP_PROXY` 环境变量优先；macOS 上回退读系统代理（`scutil --proxy`），解析对键顺序不设假设——端口行可能出现在 host 行之前，逐行稳健解析；
- `curl_download()`：argv 列表方式调用 curl（全程无 `shell=True`），`--connect-timeout 10` + `--max-time`；代理只注入子进程环境，父进程环境永不改动；
- `mirror_candidates()` / `fetch_with_fallback()`：官方 URL 优先（走代理），仅在调用方显式 `allow_mirrors=True` 时回退到社区镜像前缀（ghfast.top、gh-proxy.com）包装同一 URL；默认 `allow_mirrors=False`，执行类/固定内容永不落到第三方镜像；不可达主机快速失败，官方端点宕机只损失秒级而非完整超时。

接线到 `_run_cua_driver_installer`：安装脚本改用 `fetch_with_fallback` 拉取；检测到的代理环境在**执行安装器时复用**，脚本内部拉 release 包的自带 curl 同样走代理；Windows 保持 irm 路径但传入检测到的代理环境。

### 2.2 安全设计的三条主线

执行内容永不走镜像——安装脚本经 `/bin/bash` 执行，第三方镜像不得提供可执行代码，因此镜像回退对 executed 类内容永久关闭；代理环境仅注入子进程、父环境不被改动、无 `shell=True`；下载走 mkstemp + 0600 临时文件，镜像 URL 是固定的硬编码社区前缀，无用户可控的 URL 重写面。

### 2.3 DoH 重解析回退（DNS 污染迭代）

直接失败（或目标命中已知污染主机集合）时，通过 DNSPod 的 DoH 端点（doh.pub——中国大陆可直接访问，Cloudflare/Google DoH 不可达）重新解析，用 `curl --resolve <host>:<port>:<ip>` 重试**同一个官方 URL**。关键性质：只替换解析出的 IP，URL、TLS 主机名校验、内容来源全部保持官方——因此与镜像（第三方字节、需 opt-in、对 executed 内容永久禁用）不同，DNS 回退对执行内容同样供应链安全。实现要点：`resolve_dns_doh()` 严格过滤 IPv4 A 记录（格式与数值范围双重校验，拒绝 999.x.x.x 这类脏值），不注入代理；`_retry_with_doh_resolve()` 按 IP 逐个重试、最多 4 个；`dns_fallback` 默认开启，可传参整体禁用。

安全不变量在配套的 SECURITY-AUDIT.md / DECISION-RECORD.md / SECURITY-BASELINE.md 中固化为契约：内容来源不变（恶意 DoH 应答无法注入第三方字节，TLS 会失败）；成功路径零成本（DoH 只在直接失败后查询）；不掩盖根因（DoH 失败或全部 IP 失败时返回原始 curl 错误明细）；重试有界（≤4 IP、5s DoH 超时）；非中国大陆网络零影响（doh.pub 不可达时 `resolve_dns_doh()` 返回空列表）。

## 三、实测结果

| 阶段 | 结果 |
|---|---|
| `tests/hermes_cli/test_net_download.py` | 22 passed（3.24s） |
| `tests/hermes_cli/test_install_cua_driver.py` | 45 passed, 2 skipped |
| 覆盖点 | 环境变量代理优先级、大小写不敏感、系统代理解析（端口在前/禁用代理/非 Darwin）、子进程注入不改父环境、镜像 URL 构造（GitHub vs 非 GitHub）、curl 成败、官方→镜像回退（opt-in 时）、镜像默认关闭安全契约（`test_official_fails_no_mirror_by_default`） |
| E2E（Surge 开启、raw.githubusercontent.com 被墙的 Mac） | 检测到代理 http://127.0.0.1:6152；`fetch_with_fallback(install.sh)` ok=True，0.9s（此前为 31s 超时 + 失败） |
| DNS 阶段单测（追加 14 个） | 40 passed；ruff 全绿 |
| DNS 阶段真实验证 | `resolve_dns_doh("huggingface.co")` 返回 CloudFront 真实 IP（52.222.x），同期 `dig +short` 返回被污染的 Verizon IP（128.242.240.253） |
| 真实失败路径 | CloudFront IP 段被墙时 ok=False、保留原始错误 `curl: (28) SSL connection timeout`，不伪造成功 |

## 四、平台兼容性与能力边界

| 平台 | 系统代理检测 | DoH 回退 |
|---|---|---|
| macOS | ✅ 目标平台（`scutil --proxy`） | ✅ curl 内置 `--resolve` |
| Linux | ✅ 沿用既有环境变量契约（无系统代理检测） | ✅ 同 curl 标志 |
| Windows | ✅ irm 路径不变 + 传递检测到的代理环境 | ✅ curl.exe 支持 `--resolve` |

边界与局限：镜像对执行内容永久关闭，意味着"无代理 + 被墙"的用户仍拿不到镜像兜底，只能走可用代理或直连——这是供应链安全的有意取舍；DoH 回退只能换 IP，不能绕过 IP 段级封锁（如 CloudFront 被墙时保留原始 SSL 超时错误）；`doh.pub` 不可达时回退静默失效、行为与旧版一致；受限网络可传 `dns_fallback=False` 整体禁用。

## 五、PR 信息

- **PR 地址**：https://github.com/NousResearch/hermes-agent/pull/81883
- **改动规模**：+1552 / -43，9 个文件
- **状态**：open
- **提交时间**：2026-08-08（DNS 污染迭代 2026-08-13）

---

*本文记录 x7peeps 向 Hermes Agent 上游贡献的特性研究，所有数据来自 PR 实测记录。*
