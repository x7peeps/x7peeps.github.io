---
title: "SBOM软件物料清单与开源组件供应链安全取证深度分析"
date: 2026-08-12T14:00:00+08:00
draft: false
weight: 1230
description: "系统分析SBOM标准体系(CycloneDX/SPDX/SWID)安全机制、开源组件供应链攻击取证方法，涵盖依赖混淆攻击、Typosquatting恶意包投毒、SBOM篡改检测、包管理器安全审计，结合Log4Shell、Event-Stream、xz-utils后门等真实案例，构建软件物料清单驱动的供应链安全取证体系"
categories: ["应急响应", "取证分析"]
tags: ["SBOM", "软件供应链安全", "CycloneDX", "SPDX", "依赖混淆", "Typosquatting", "开源组件安全", "Log4Shell", "供应链投毒", "NIST"]
---

# SBOM软件物料清单与开源组件供应链安全取证深度分析

现代软件系统几乎无一例外地建立在开源组件之上。一个典型的 Web 应用可能包含数百甚至数千个直接和间接依赖，而开发者对这些依赖的了解往往止步于 `package.json` 或 `requirements.txt` 中显式声明的几十个直接依赖。这种"信任但不验证"的模式为供应链攻击创造了巨大的攻击面。当 Log4Shell 在 2021 年底爆发时，全球安全团队面临的首要难题不是漏洞本身——而是在浩如烟海的依赖关系中找到所有受影响的系统。这正是 Software Bill of Materials（SBOM，软件物料清单）的核心价值所在。

然而，SBOM 本身也并非万无一失。从 SBOM 标准的格式漏洞、生成工具的准确性局限，到恶意攻击者对 SBOM 数据本身的篡改，供应链安全取证面临的是一个多层次、多维度的复杂挑战。本文将从 SBOM 标准体系出发，深入剖析开源组件供应链攻击的取证分析方法，涵盖依赖混淆、Typosquatting、恶意维护者投毒、构建系统篡改等多种攻击向量，并通过 Log4Shell、Event-Stream、xz-utils 后门等真实案例构建完整的取证分析框架。

---

## 0x01 技术基础与取证概述

### SBOM 定义与核心概念

Software Bill of Materials（软件物料清单）是一种结构化的元数据描述，用于记录软件产品中包含的所有组件、库、模块及其版本信息、许可证和依赖关系。类比于制造业的物料清单（BOM），SBOM 为软件提供了"成分清单"，使组织能够了解其软件资产的真实组成。

SBOM 的核心价值在安全取证场景中体现为三个维度：

| 维度 | 传统软件管理 | SBOM 驱动管理 |
|------|-------------|--------------|
| 可见性 | 仅了解直接依赖 | 完整的传递依赖图谱 |
| 响应速度 | CVE 公告后人工排查 | 自动化关联与影响面评估 |
| 取证深度 | 行为层面分析 | 组件级溯源与变更追踪 |

### SBOM 与传统软件供应链安全的差异

传统软件供应链安全侧重于网络边界防护、漏洞扫描和签名验证，而 SBOM 驱动的安全范式强调的是**透明度和可审计性**。两者的本质区别在于：

| 对比维度 | 传统供应链安全 | SBOM 驱动供应链安全 |
|---------|--------------|-------------------|
| 检测时机 | 部署后扫描 | 开发/构建时生成清单 |
| 覆盖范围 | 已知 CVE 匹配 | 全组件谱系审计 |
| 取证能力 | 事后行为分析 | 组件级变更时间线 |
| 合规要求 | 自选框架 | NIST/EO 14028/EU CRA 强制 |
| 依赖关系 | 扁平化列表 | 有向无环图（DAG） |
| 信任模型 | 仓库签名验证 | 端到端供应链签名链 |

### 供应链攻击威胁模型

基于 SBOM 视角的供应链攻击威胁模型可以映射到 MITRE ATT&CK 框架的多个技术点：

| 威胁向量 | MITRE ATT&CK 技术 | SBOM 相关性 | 取证要点 |
|---------|-------------------|------------|---------|
| Dependency Confusion | T1195.002 | SBOM 无法区分公共/私有包来源 | 检查包仓库注册记录与解析优先级 |
| Typosquatting | T1195.002 | SBOM 中记录的组件名是否为恶意仿冒 | 比对包名注册信息与发布者 |
| 恶意维护者投毒 | T1195.002 | SBOM 中版本号和哈希是否匹配已知恶意版本 | 对比 SBOM 版本与 NVD 数据库 |
| 构建系统篡改 | T1195.001 | SBOM 生成过程是否被污染 | 验证 SBOM 签名与构建日志 |
| SBOM 篡改 | T1565.001 | 恶意修改 SBOM 以隐藏真实依赖 | 验证 SBOM 完整性哈希 |

### 取证工具链全景

构建 SBOM 驱动的供应链安全取证体系需要一套完整的工具链：

| 工具类别 | 工具名称 | 功能定位 | 适用场景 |
|---------|---------|---------|---------|
| SBOM 生成 | Syft | 多生态 SBOM 生成（SPDX/CycloneDX） | 容器镜像、文件系统、项目目录 |
| SBOM 生成 | CycloneDX CLI | CycloneDX 格式专用生成器 | OWASP 生态集成 |
| SBOM 生成 | SPDX-tools | SPDX 格式生成与验证 | Linux Foundation 合规 |
| SBOM 生成 | Tern | 容器镜像组件分析 | Docker 镜像成分审计 |
| 漏洞匹配 | Grype | 基于 SBOM 的漏洞扫描 | Syft 输出直接对接 |
| 漏洞匹配 | Trivy | 容器/项目漏洞扫描 | 多目标扫描 |
| 漏洞匹配 | OWASP Dependency-Track | 持续漏洞监控平台 | 企业级 SBOM 管理 |
| 完整性验证 | sigstore/cosign | 供应链签名验证 | 包签名与验证 |
| 完整性验证 | npm audit / pip-audit | 包管理器原生审计 | 开发阶段安全检查 |
| 恶意包检测 | Socket.dev | 包行为分析 | npm/PyPI 恶意行为检测 |
| 依赖分析 | npm-check-updates | 依赖版本分析与更新 | 过时依赖识别 |

---

## 0x02 SBOM 标准体系深度解析

### 三大标准概览

当前 SBOM 领域存在三大主流标准，各自面向不同的应用场景和生态系统：

| 标准 | 维护组织 | 当前版本 | 格式支持 | 主要特点 |
|------|---------|---------|---------|---------|
| CycloneDX | OWASP | 1.6 | JSON/XML/YAML/Protocol Buffers | 安全导向，内置漏洞、许可证、服务资产声明 |
| SPDX | Linux Foundation | 3.0 | JSON/XML/Tag-Value/RDF | 法律合规导向，侧重许可证与版权信息 |
| SWID | ISO/IEC | 19770-2:2015 | XML | 软件识别标签，面向资产管理和合规审计 |

### CycloneDX 安全机制

CycloneDX 是目前安全取证领域最具优势的 SBOM 标准，其设计哲学以安全为核心。CycloneDX 的数据模型包含以下关键组件：

**组件（Component）描述结构：**

```json
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.6",
  "version": 1,
  "components": [
    {
      "type": "library",
      "supplier": {
        "name": "Apache Software Foundation",
        "url": ["https://www.apache.org/"]
      },
      "author": "Apache Logging Team",
      "name": "log4j-core",
      "version": "2.14.1",
      "purl": "pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1",
      "externalReferences": [
        {
          "type": "website",
          "url": "https://logging.apache.org/log4j/2.x/"
        },
        {
          "type": "license",
          "url": "https://www.apache.org/licenses/LICENSE-2.0"
        }
      ],
      "properties": [
        {
          "name": "syft:package:metadataType",
          "value": "java-archive"
        }
      ]
    }
  ]
}
```

CycloneDX 在安全取证中的独特优势包括：

| 特性 | 安全取证价值 | 使用场景 |
|------|------------|---------|
| Vulnerability（漏洞声明） | 可直接嵌入 CVE 信息，避免跨库查询 | 漏洞影响面评估 |
| Service（服务声明） | 记录运行时服务依赖，揭示隐性攻击面 | 微服务架构审计 |
| Evidence（证据声明） | 记录组件发现的证据来源和置信度 | 取证分析可信度评估 |
| Property（属性扩展） | 自定义元数据字段，支持私有安全标签 | 企业安全策略集成 |
| Reference Integrity | 组件哈希与签名的完整性验证 | 防篡改检测 |

### SPDX 标准结构

SPDX 3.0 作为 Linux Foundation 维护的标准，在法律合规领域具有更广泛的认可度：

```json
{
  "spdxVersion": "SPDX-3.0",
  "name": "example-project",
  "creationInfo": {
    "specVersion": "3.0.0",
    "created": "2026-08-12T06:00:00Z",
    "creators": [
      {
        "type": "Tool",
        "name": "syft",
        "version": "1.2.0"
      }
    ]
  },
  "element": [
    {
      "type": "Component",
      "name": "log4j-core",
      "version": "2.14.1",
      "softwareHydration": {
        "packageVerificationCode": "a]1b2c3d4e5f6..."
      }
    }
  ]
}
```

SPDX 在取证中的价值侧重于：

| 特性 | 取证价值 | 局限性 |
|------|---------|--------|
| Relationship 声明 | 精确记录组件间依赖关系 | 不支持运行时依赖发现 |
| Snippet 信息 | 代码片段级别的归属追溯 | 粒度过细，大规模审计效率低 |
| Annotation 机制 | 支持人工审计标注 | 不适合自动化流水线 |
| 哈希算法支持 | SHA-1/SHA-256/MD5 多算法覆盖 | SHA-1 在新标准中已不再推荐 |

### SWID 标签标准

SWID（Software Identification Tags）作为 ISO/IEC 19770-2 标准，主要用于软件资产识别和合规管理：

| SWID 标签字段 | 描述 | 取证用途 |
|--------------|------|---------|
| tagId | 全局唯一标识符 | 软件实例精确定位 |
| softwareName | 软件名称 | 快速关联已知恶意软件 |
| softwareVersion | 版本号 | 受影响版本范围确定 |
| patchLevel | 补丁级别 | 修复状态追踪 |
| softwareLifecycle | 生命周期阶段 | 潜伏期分析 |
| entitlementId | 授权标识 | 许可合规审计 |

### 标准选型对比

| 选型维度 | CycloneDX | SPDX | SWID |
|---------|-----------|------|------|
| 安全特性 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| 法律合规 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| 资产管理 | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 工具生态 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| 取证深度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 实施复杂度 | 中等 | 中等 | 低 |
| 政府合规认可 | EO 14028 认可 | EO 14028 认可 | ISO 标准 |

---

## 0x03 依赖混淆攻击取证分析

### Dependency Confusion 攻击原理

Dependency Confusion（依赖混淆）攻击由安全研究员 Alex Birsan 在 2021 年公开披露，利用了包管理器在解析同名包时的命名空间优先级差异。当企业使用私有仓库的同时，包管理器默认优先从公共仓库拉取依赖时，攻击者可以在公共仓库注册同名包，劫持企业构建流程。

| 包管理器 | 默认解析优先级 | 混淆风险等级 | 防御机制 |
|---------|--------------|------------|---------|
| npm | 公共 > 本地（默认） | 🔴 高 | scope 约束、registry 配置 |
| pip | 源码 > PyPI | 🟡 中 | --extra-index-url 需显式配置 |
| Maven | 本地 > 远程 | 🟢 低 | 本地仓库优先，但可被配置覆盖 |
| RubyGems | 本地 > 公共 | 🟢 低 | 默认安全 |
| Go Modules | 私有 > 公共（GOPRIVATE） | 🟡 中 | GOPRIVATE 配置 |

### Dependency Confusion 取证分析方法

Dependency Confusion 攻击的取证需要从多个层面收集和分析证据：

**第一步：识别私有包信息**

```bash
find / -name "package.json" -not -path "*/node_modules/*" 2>/dev/null | head -20
find / -name "requirements.txt" -o -name "pyproject.toml" -o -name "setup.py" 2>/dev/null | head -20
find / -name "pom.xml" -o -name "build.gradle" 2>/dev/null | head -20
```

**第二步：检查包解析历史**

```bash
grep -r "resolved" package-lock.json | grep -v "registry.npmjs.org"
pip show <package_name> | grep -i "location\|version\|source"
mvn dependency:tree | grep -v "central"
```

**第三步：对比包来源与签名**

```bash
npm view <package_name> repository.url maintainers
pip show <package_name> | grep -i "author\|home-page\|location"
```

### Dependency Confusion 证据分类

| 证据类型 | 证据等级 | 描述 | 检测方法 |
|---------|---------|------|---------|
| 公共仓库中存在同名私有包 | 🔴 确认恶意 | 直接证据，攻击已成功 | 比对公共仓库与内部包列表 |
| 构建日志显示从公共源安装了同名包 | 🔴 确认恶意 | 安装行为已发生 | 分析构建日志 |
| 包解析优先级配置被修改 | 🟡 高度可疑 | 可能是攻击者修改以降低防御 | 检查 .npmrc / pip.conf 变更历史 |
| 新引入的私有包在公共仓库有同名版本 | 🟡 高度可疑 | 潜在的混淆向量 | 自动化包名比对 |
| 私有包命名使用通用名称 | 🟢 需要关注 | 命名不当增加混淆风险 | 命名规范审计 |

### 自动化 Dependency Confusion 检测

```bash
#!/bin/bash
echo "[*] Dependency Confusion Scanner"
echo "================================"

if [ -f "package.json" ]; then
    echo "[+] Scanning npm dependencies..."
    deps=$(python3 -c "
import json
with open('package.json') as f:
    pkg = json.load(f)
deps = {**pkg.get('dependencies', {}), **pkg.get('devDependencies', {})}
for name, ver in deps.items():
    print(f'{name}@{ver}')
")
    echo "$deps" | while read dep; do
        name=$(echo "$dep" | cut -d'@' -f1)
        result=$(npm view "$name" _npmUser.name 2>/dev/null)
        if [ -n "$result" ]; then
            echo "[!] PUBLIC: $name maintained by: $result"
        fi
    done
fi

if [ -f "requirements.txt" ] || [ -f "pyproject.toml" ]; then
    echo "[+] Scanning Python dependencies..."
    pip list --format=json 2>/dev/null | python3 -c "
import json, sys
packages = json.load(sys.stdin)
for pkg in packages:
    name = pkg['name']
    version = pkg['version']
    print(f'  {name}=={version}')
"
fi
```

---

## 0x04 Typosquatting 恶意包投毒取证

### Typosquatting 攻击机制

Typosquatting（域名仿冒在包管理领域的延伸）是供应链攻击中历史最悠久、持续性最强的攻击方式之一。攻击者注册与流行开源包名称拼写极为相似的恶意包，利用开发者的拼写错误或自动补全误导来传播恶意代码。

MITRE ATT&CK 将 Typosquatting 归类为 T1195.002（Supply Chain Compromise: Software Supply Chain）。其变体包括：

| 攻击变体 | MITRE ATT&CK | 原理 | 检测难度 |
|---------|-------------|------|---------|
| 字符替换 | T1195.002 | 将 l 替换为 1，o 替换为 0 | 低 |
| 字符遗漏 | T1195.002 | 删除包名中的一个字符 | 中 |
| 字符添加 | T1195.002 | 在包名中插入额外字符 | 中 |
| 前后缀变体 | T1195.002 | 添加 js/py/utils 等后缀 | 高 |
| 词汇替换 | T1195.002 | 使用同义词替换（color→colour） | 高 |
| 版本仿冒 | T1195.002 | 仿冒流行包的下一个大版本号 | 高 |

### Typosquatting 取证分析框架

Typosquatting 事件的取证分析需要建立从包注册到恶意行为的完整证据链：

**第一层：包注册信息审计**

```bash
npm view <suspect_package> time
npm view <suspect_package> maintainers
npm view <suspect_package> repository.url
npm view <suspect_package> _npmUser
```

**第二层：包内容分析**

```bash
npm pack <suspect_package> --dry-run
tar -tzf <suspect_package>-*.tgz | head -50
cat package/preinstall.js
cat package/install.js
cat package/postinstall.js
```

**第三层：恶意代码检测**

```bash
grep -rn "eval(" <extracted_package>/
grep -rn "require('child_process')" <extracted_package>/
grep -rn "https\?://" <extracted_package>/
grep -rn "process\.env" <extracted_package>/
```

### Typosquatting 恶意行为特征

| 恶意行为 | 证据等级 | 特征描述 | 检测方法 |
|---------|---------|---------|---------|
| postinstall 脚本执行外部命令 | 🔴 确认恶意 | 在安装后自动执行任意代码 | 检查 scripts 字段 |
| 窃取环境变量中的敏感信息 | 🔴 确认恶意 | 访问 process.env 或 os.environ | 静态代码分析 |
| 植入反向 Shell | 🔴 确认恶意 | 建立到外部服务器的连接 | 网络流量分析 |
| 下载并执行远程载荷 | 🔴 确认恶意 | 动态加载外部代码 | 网络流量 + 文件监控 |
| 信息收集并上报 | 🟡 高度可疑 | 收集系统信息发送到外部 | 网络流量分析 |
| 发布时间与流行包更新高度同步 | 🟡 高度可疑 | 利用流行包更新窗口投放 | 时间线分析 |
| 包 README 与原始包高度相似 | 🟢 需要关注 | 可能为合法的变体包 | 内容对比 |

### 包名相似度计算

在取证分析中，量化两个包名的相似度有助于快速识别 Typosquatting 候选：

```python
import sys
from difflib import SequenceMatcher

def levenshtein_distance(s1, s2):
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    prev_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        curr_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = prev_row[j + 1] + 1
            deletions = curr_row[j] + 1
            substitutions = prev_row[j] + (c1 != c2)
            curr_row.append(min(insertions, deletions, substitutions))
        prev_row = curr_row
    return prev_row[-1]

def similarity_score(name1, name2):
    seq_ratio = SequenceMatcher(None, name1, name2).ratio()
    lev_dist = levenshtein_distance(name1, name2)
    max_len = max(len(name1), len(name2))
    lev_ratio = 1 - (lev_dist / max_len) if max_len > 0 else 0
    return (seq_ratio + lev_ratio) / 2

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: typosquat_check.py <package_name> <suspect_package>")
        sys.exit(1)
    score = similarity_score(sys.argv[1], sys.argv[2])
    print(f"Similarity: {sys.argv[1]} vs {sys.argv[2]} = {score:.4f}")
    if score > 0.8:
        print("[!] HIGH SIMILARITY - Potential Typosquatting detected")
    elif score > 0.6:
        print("[?] MEDIUM SIMILARITY - Worth investigating")
    else:
        print("[*] LOW SIMILARITY - Unlikely to be Typosquatting")
```

---

## 0x05 开源组件依赖链投毒取证

### 依赖链投毒攻击拓扑

开源组件的依赖链投毒是最具隐蔽性的供应链攻击方式之一。攻击者不直接攻击目标包，而是污染目标包的间接依赖（transitive dependency），从而绕过开发者的直接依赖审查。

| 攻击拓扑 | 描述 | 取证难度 | 代表案例 |
|---------|------|---------|---------|
| 直接依赖投毒 | 攻击目标包本身 | 低 | ua-parser-js |
| 传递依赖投毒 | 攻击目标包的子依赖 | 高 | event-stream |
| 依赖锁定文件篡改 | 修改 lockfile 指向恶意版本 | 中 | pip.conf 篡改 |
| Git 依赖 URL 投毒 | 指向恶意 Git 仓库 | 高 | npm git 协议利用 |
| 可选依赖投毒 | 通过 optionalDependencies 投毒 | 中 | npm 可选依赖利用 |

### Event-Stream 深度剖析

event-stream 是依赖链投毒的经典案例。2018 年，攻击者通过社工手段获取了流行 npm 包 event-stream 的维护权限，然后在传递依赖 flatmap-stream 中植入针对 Copay 钱包的窃密代码。

**攻击链还原：**

| 阶段 | 时间线 | 操作 | 取证证据 |
|------|--------|------|---------|
| 权限获取 | 2018-09 | 攻击者以"帮忙维护"为由获得 npm 发布权限 | npm 权限变更日志 |
| 依赖添加 | 2018-09 | 向 event-stream 添加 flatmap-stream 依赖 | package.json git diff |
| 恶意注入 | 2018-10 | flatmap-stream 发布包含窃密代码的版本 | npm publish 时间戳 |
| 定向窃取 | 2018-10-25 | 恶意代码针对 Copay 钱包窃取私钥 | 恶意代码静态分析 |
| 暴露 | 2018-11-26 | 安全研究员发现并公开披露 | GitHub Issue #582 |
| 响应 | 2018-11-27 | event-stream 3.9.0 发布移除恶意依赖 | npm 版本发布记录 |

**SBOM 取证分析要点：**

```bash
npm ls event-stream --all
npm ls flatmap-stream --all

node -e "
const pkg = require('event-stream/package.json');
console.log('Version:', pkg.version);
console.log('Dependencies:', JSON.stringify(pkg.dependencies, null, 2));
"
```

### 依赖链投毒的 SBOM 检测

SBOM 在依赖链投毒检测中发挥关键作用，因为它能够提供完整的传递依赖视图：

```bash
syft dir:. -o cyclonedx-json > sbom.json

cat sbom.json | python3 -c "
import json, sys
sbom = json.load(sys.stdin)
components = sbom.get('components', [])
suspicious = []
for comp in components:
    name = comp.get('name', '')
    version = comp.get('version', '')
    supplier = comp.get('supplier', {}).get('name', 'Unknown')
    hashes = comp.get('hashes', [])
    if not hashes:
        suspicious.append(f'{name}@{version} - NO INTEGRITY HASH')
    if supplier == 'Unknown':
        suspicious.append(f'{name}@{version} - UNKNOWN SUPPLIER')
if suspicious:
    print('[!] Suspicious components found:')
    for s in suspicious:
        print(f'  - {s}')
else:
    print('[*] No suspicious components detected')
"
```

### 依赖链投毒证据分类

| 证据类型 | 证据等级 | 描述 | 验证方法 |
|---------|---------|------|---------|
| 传递依赖中包含已知恶意包 | 🔴 确认恶意 | 恶意包已在 NVD/OSV 标记 | CVE 数据库比对 |
| 新增传递依赖无完整性哈希 | 🟡 高度可疑 | 缺少完整性校验 | SBOM hash 字段检查 |
| 依赖包供应商信息为空 | 🟡 高度可疑 | 无法追溯组件来源 | SBOM supplier 字段审计 |
| 依赖包发布时间异常集中 | 🟡 高度可疑 | 批量注册包 | 时间线分析 |
| 传递依赖与直接依赖功能重叠 | 🟢 需要关注 | 可能为冗余依赖 | 功能分析 |
| 依赖图深度异常（>10层） | 🟢 需要关注 | 过深的依赖链增加风险 | 依赖深度分析 |

---

## 0x06 包管理器安全审计与检测

### npm 生态安全审计

npm 生态因其庞大的包数量和宽松的发布机制，是供应链攻击的重灾区。npm 安全审计需要覆盖多个层面：

**npm lockfile 完整性审计：**

```bash
node -e "
const fs = require('fs');
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const packages = lock.packages || lock.dependencies || {};
const issues = [];
for (const [name, info] of Object.entries(packages)) {
    if (!info.integrity && name !== '') {
        issues.push({ name, version: info.version, issue: 'NO_INTEGRITY_HASH' });
    }
    if (info.resolved && info.resolved.includes('git+')) {
        issues.push({ name, version: info.version, issue: 'GIT_DEPENDENCY' });
    }
}
if (issues.length > 0) {
    console.log('[!] Integrity issues found:');
    issues.forEach(i => console.log('  ' + i.name + '@' + i.version + ': ' + i.issue));
} else {
    console.log('[*] All packages have integrity hashes');
}
"
```

**npm scripts 安全审计：**

```bash
find . -name "package.json" -not -path "*/node_modules/*" -exec grep -l "preinstall\|postinstall\|install" {} \; | while read f; do
    echo "=== $f ==="
    python3 -c "
import json
with open('$f') as fh:
    pkg = json.load(fh)
scripts = pkg.get('scripts', {})
for hook in ['preinstall', 'install', 'postinstall']:
    if hook in scripts:
        print(f'  [!] {hook}: {scripts[hook]}')
"
done
```

### PyPI 生态安全审计

Python 生态的供应链安全审计重点关注以下方面：

```bash
pip-audit --require-hashes -r requirements.txt

pip list --format=json | python3 -c "
import json, sys
packages = json.load(sys.stdin)
for pkg in packages:
    name = pkg['name']
    version = pkg['version']
    home = pkg.get('home-page', '')
    author = pkg.get('author', '')
    if not home or home == 'UNKNOWN':
        print(f'[!] {name}=={version}: No homepage')
    if not author or author == 'UNKNOWN':
        print(f'[?] {name}=={version}: No author info')
"
```

### Maven 生态安全审计

```bash
mvn dependency:tree -DoutputType=dot > dep_tree.dot

mvn org.owasp:dependency-check-maven:check \
    -DfailBuildOnCVSS=7 \
    -DsuppressionFile=dependency-check-suppressions.xml

mvn versions:display-dependency-updates | grep -i "available"
```

### 包管理器安全对比

| 安全维度 | npm | PyPI | Maven Central | RubyGems | Go Modules |
|---------|-----|------|--------------|----------|------------|
| 命名空间隔离 | scope 机制 | 无 | groupId 前缀 | 无 | 模块路径 |
| 版本不可变性 | ✅ 已发布不可改 | ✅ 已发布不可改 | ✅ 已发布不可改 | ✅ 已发布不可改 | 依赖 sum 校验 |
| 多因素认证 | 可选 | 2FA 强制 | GPG 签名 | 2FA | N/A |
| 签名验证 | npm provenance | 无原生 | GPG 签名 | 无原生 | go.sum 哈希 |
| 私有包优先 | 需配置 | 需配置 | 本地仓库优先 | 需配置 | GOPRIVATE |
| 恶意包检测 | npm audit | pip-audit | OWASP DC | bundle-audit | govulncheck |
| 已发布修改 | 禁止 | 禁止 | 禁止 | 禁止 | N/A |
| 下架机制 | 完全下架 | 完全下架 | 标记废弃 | 完全下架 | N/A |

---

## 0x07 SBOM 篡改检测与完整性验证

### SBOM 篡改攻击向量

SBOM 作为供应链安全的信任基础，其自身也面临被篡改的风险。攻击者可能通过多种方式操纵 SBOM 数据以隐藏恶意组件的存在：

| 篡改向量 | MITRE ATT&CK | 攻击手法 | 检测难度 |
|---------|-------------|---------|---------|
| SBOM 生成工具投毒 | T1195.002 | 在 Syft/CycloneDX CLI 中植入过滤逻辑 | 高 |
| SBOM 数据后处理 | T1565.001 | 在生成后删除特定组件条目 | 中 |
| 组件哈希伪造 | T1565.001 | 用合法组件哈希替换恶意组件哈希 | 中 |
| 构建环境篡改 | T1195.001 | 在 CI/CD 中篡改 SBOM 生成过程 | 高 |
| SBOM 存储篡改 | T1565.001 | 修改已存储的 SBOM 文件 | 低 |

### SBOM 完整性验证方法

**方法一：签名验证**

```bash
cosign verify-blob \
    --certificate cosign.pub \
    --signature sbom.json.sig \
    sbom.json

cosign verify \
    --certificate-identity "https://github.com/org/repo/.github/workflows/sbom.yml@refs/heads/main" \
    --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
    sbom-image:tag
```

**方法二：哈希比对**

```bash
sha256sum sbom.json > sbom.json.sha256
sha256sum -c sbom.json.sha256

python3 -c "
import hashlib, json, sys

with open('sbom.json') as f:
    sbom = json.load(f)

components = sbom.get('components', [])
for comp in components:
    name = comp.get('name', 'unknown')
    version = comp.get('version', 'unknown')
    hashes = comp.get('hashes', [])
    if not hashes:
        print(f'[!] {name}@{version}: Missing integrity hash')
        continue
    for h in hashes:
        algo = h.get('algorithm', '').lower().replace('-', '')
        value = h.get('value', '')
        if algo in ['sha256', 'sha512']:
            print(f'[*] {name}@{version}: {algo}={value[:16]}...')
"
```

**方法三：构建来源溯源（SLSA）**

SLSA（Supply chain Levels for Software Artifacts）框架提供了从源码到交付物的端到端完整性保障：

| SLSA 级别 | 保障内容 | 取证能力 |
|-----------|---------|---------|
| SLSA 1 | 构建过程有文档记录 | 基础溯源 |
| SLSA 2 | 使用托管构建服务 | 防止本地篡改 |
| SLSA 3 | 构建平台实施审计日志 | 防止内部威胁 |
| SLSA 4 | 双人审查 + 可重现构建 | 最高完整性保障 |

### SBOM 验证自动化脚本

```python
import json
import hashlib
import sys

def validate_sbom(sbom_path):
    with open(sbom_path) as f:
        sbom = json.load(f)

    spec_version = sbom.get('specVersion', 'unknown')
    print(f"[*] SBOM Specification: {spec_version}")

    components = sbom.get('components', [])
    total = len(components)
    print(f"[*] Total components: {total}")

    findings = {
        "no_hash": [],
        "no_purl": [],
        "no_supplier": [],
        "no_license": [],
        "duplicate_versions": {}
    }

    for comp in components:
        name = comp.get('name', 'unknown')
        version = comp.get('version', 'unknown')

        if not comp.get('hashes'):
            findings["no_hash"].append(f"{name}@{version}")

        if not comp.get('purl'):
            findings["no_purl"].append(f"{name}@{version}")

        if not comp.get('supplier'):
            findings["no_supplier"].append(f"{name}@{version}")

        if not comp.get('licenses'):
            findings["no_license"].append(f"{name}@{version}")

        key = f"{name}@{version}"
        findings["duplicate_versions"].setdefault(name, []).append(version)

    print(f"\n[!] Components without integrity hash: {len(findings['no_hash'])}")
    for item in findings["no_hash"][:10]:
        print(f"    {item}")

    print(f"\n[!] Components without purl: {len(findings['no_purl'])}")
    for item in findings["no_purl"][:10]:
        print(f"    {item}")

    print(f"\n[!] Components without supplier: {len(findings['no_supplier'])}")
    for item in findings["no_supplier"][:10]:
        print(f"    {item}")

    suspicious = {k: v for k, v in findings["duplicate_versions"].items() if len(v) > 1}
    if suspicious:
        print(f"\n[?] Multiple versions of same component: {len(suspicious)}")
        for name, versions in suspicious.items():
            print(f"    {name}: {', '.join(versions)}")

    return findings

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "sbom.json"
    validate_sbom(path)
```

---

## 0x08 开源维护者社工与构建系统投毒取证

### 开源维护者社工攻击

xz-utils 后门事件（CVE-2024-3094）是开源软件供应链安全史上最令人震惊的案例之一。攻击者 Jia Tan 花费近两年时间，通过系统性的社会工程学手段获取了 xz-utils 的维护权限，最终在构建系统中植入了针对 SSH 认证的后门。

| 阶段 | 时间线 | 操作 | 取证证据 |
|------|--------|------|---------|
| 身份构建 | 2021-2022 | 创建 GitHub 账号，贡献代码 | GitHub 历史 |
| 信任建立 | 2022-2023 | 持续提交高质量 PR | Git commit 历史 |
| 施压维护者 | 2023-2024 | 多次向原始维护者施压移交权限 | 邮件列表/Issue 记录 |
| 获取权限 | 2024-01 | 获得 xz-utils 维护权限 | npm/GitHub 权限变更 |
| 植入后门 | 2024-02 | 在构建脚本中注入恶意测试数据 | Makefile / .github/workflows 变更 |
| 发布投毒版本 | 2024-02-24 | 发布 xz 5.6.0 和 5.6.1 | 版本发布记录 |
| 被发现 | 2024-03-29 | Microsoft 工程师 Andres Freund 发现异常 | SSH 性能异常分析 |

### 构建系统投毒检测

构建系统（CI/CD）是供应链攻击的高价值目标。常见的构建系统投毒手法包括：

| 投毒手法 | 检测方法 | 证据等级 |
|---------|---------|---------|
| 篡改构建脚本（Makefile/CMakeLists） | diff 历史版本与当前版本 | 🔴 确认恶意 |
| 注入恶意测试数据 | 检查测试文件中的可执行内容 | 🔴 确认恶意 |
| 修改 CI/CD workflow | GitHub Actions 审计 | 🔴 硡认恶意 |
| 替换构建工具链 | 二进制完整性校验 | 🟡 高度可疑 |
| 环境变量注入 | CI/CD 环境配置审计 | 🟡 高度可疑 |

**构建产物哈希验证：**

```bash
git log --oneline -20 -- Makefile CMakeLists.txt configure.ac
git diff HEAD~10 -- Makefile CMakeLists.txt configure.ac .github/

find . -name "*.yml" -path "*/.github/workflows/*" -exec diff <(git show HEAD~5:{} 2>/dev/null) {} \; 2>/dev/null
```

### 恶意构建脚本检测

```bash
grep -rn "curl\|wget" Makefile* CMakeLists.txt configure* 2>/dev/null
grep -rn "base64\|eval\|exec" Makefile* CMakeLists.txt configure* 2>/dev/null
grep -rn "LD_PRELOAD\|LD_LIBRARY_PATH" Makefile* configure* 2>/dev/null

find . -name "Makefile.in" -o -name "configure" | while read f; do
    if grep -q "curl.*|.*sh\|wget.*|.*bash\|eval.*\$(curl" "$f" 2>/dev/null; then
        echo "[!] CRITICAL: Remote code execution pattern in $f"
    fi
done
```

---

## 0x09 证据强度分层与案例关联

### 三级证据分类体系

在 SBOM 和供应链安全取证中，建立标准化的证据强度分层是确保分析结论可信度的关键：

| 证据等级 | 标记 | 定义 | 可采信条件 | 对应操作 |
|---------|------|------|-----------|---------|
| 确认恶意 | 🔴 | 有明确恶意意图和行为的证据 | 多源交叉验证 + 技术分析 | 立即响应、事件上报 |
| 高度可疑 | 🟡 | 强烈暗示恶意活动但需进一步验证 | 单源证据 + 行为异常 | 深入调查、增强监控 |
| 需要关注 | 🟢 | 可能为正常行为但需结合上下文判断 | 需要关联其他证据 | 持续监控、记录归档 |

### SBOM 证据强度矩阵

| 证据类型 | 证据等级 | 证据来源 | 关联场景 |
|---------|---------|---------|---------|
| SBOM 中包含已知恶意组件 | 🔴 | NVD/OSV 数据库 | Log4Shell 受影响组件 |
| postinstall 脚本执行远程代码 | 🔴 | npm scripts 审计 | Typosquatting/Dependency Confusion |
| 组件签名与官方不匹配 | 🔴 | Sigstore/Cosign 验证 | 构建系统投毒 |
| 包发布者与官方维护者不一致 | 🟡 | npm/PyPI 发布记录 | 维护者账号被盗 |
| SBOM 中缺少完整性哈希 | 🟡 | SBOM 字段审计 | SBOM 篡改风险 |
| 新增传递依赖无公开仓库记录 | 🟡 | 包仓库查询 | 依赖链投毒 |
| 构建日志中存在异常步骤 | 🟡 | CI/CD 日志分析 | 构建系统篡改 |
| 依赖版本在 SBOM 与 lockfile 间不一致 | 🟡 | 交叉比对 | SBOM 更新滞后 |
| 包许可证从开源变为商业 | 🟢 | SBOM 许可证字段 | 许可合规风险 |
| 依赖图深度超过阈值 | 🟢 | 依赖分析 | 依赖复杂度管理 |

### 证据关联与攻击链重建

在实际取证中，单一证据往往不足以得出结论，需要通过多源证据关联来构建完整的攻击链：

```python
import json
from datetime import datetime

evidence_chain = [
    {
        "id": "E001",
        "level": "HIGH",
        "type": "sbom_malicious_component",
        "component": "malicious-lib@1.0.0",
        "timestamp": "2026-08-01T10:00:00Z",
        "source": "SBOM scan"
    },
    {
        "id": "E002",
        "level": "HIGH",
        "type": "postinstall_execution",
        "component": "malicious-lib@1.0.0",
        "timestamp": "2026-08-01T10:05:00Z",
        "source": "build_log"
    },
    {
        "id": "E003",
        "level": "MEDIUM",
        "type": "external_connection",
        "component": "malicious-lib@1.0.0",
        "timestamp": "2026-08-01T10:06:00Z",
        "source": "network_monitor"
    }
]

def analyze_chain(evidence_list):
    print("[*] Evidence Chain Analysis")
    print("=" * 60)

    high_count = sum(1 for e in evidence_list if e["level"] == "HIGH")
    medium_count = sum(1 for e in evidence_list if e["level"] == "MEDIUM")

    print(f"[+] High confidence evidence: {high_count}")
    print(f"[+] Medium confidence evidence: {medium_count}")

    timeline = sorted(evidence_list, key=lambda x: x["timestamp"])
    print(f"\n[*] Attack Timeline:")
    for e in timeline:
        print(f"  {e['timestamp']} [{e['level']}] {e['type']}: {e['component']}")

    if high_count >= 2:
        print(f"\n[!] CONCLUSION: CONFIRMED MALICIOUS - {high_count} high confidence indicators")
    elif high_count >= 1:
        print(f"\n[?] CONCLUSION: HIGHLY SUSPICIOUS - Requires additional verification")
    else:
        print(f"\n[*] CONCLUSION: NEEDS ATTENTION - Insufficient evidence")

analyze_chain(evidence_chain)
```

---

## 0x0A 自动化检测与狩猎

### Sigma 规则：SBOM 异常活动检测

```yaml
title: Suspicious SBOM Generation or Modification Activity
id: 7a4b8c3d-2e1f-4d5a-b6c7-8e9f0a1b2c3d
status: experimental
description: Detects suspicious activity related to SBOM generation tools that may indicate supply chain tampering
references:
  - https://cyclonedx.org
  - https://spdx.org
author: Security Forensics Team
date: 2026/08/12
tags:
  - attack.supply_chain
  - attack.t1195.002
logsource:
  category: process_creation
  product: linux
detection:
  selection_1:
    CommandLine|contains:
      - 'syft'
      - 'cyclonedx'
      - 'tern'
    CommandLine|contains:
      - '--output'
      - '-o'
  selection_2:
    CommandLine|contains|all:
      - 'sbom'
      - 'curl'
  selection_3:
    CommandLine|contains|all:
      - 'sbom'
      - 'rm'
      - '-rf'
  selection_4:
    CommandLine|contains|all:
      - 'jq'
      - 'components'
      - 'del'
  condition: selection_1 or selection_2 or selection_3 or selection_4
level: suspicious
falsepositives:
  - Legitimate SBOM generation in CI/CD pipelines
  - Security scanning tools

---

title: Dependency Confusion Attack Indicator
id: 9c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f
status: experimental
description: Detects package installation from public registry when private package name matches
references:
  - https://research.nccgroup.com/2021/05/27/dependency-confusion-how-i-compromised-packages-of-microsoft-apple-and-35-others/
author: Security Forensics Team
date: 2026/08/12
tags:
  - attack.supply_chain
  - attack.t1195.002
logsource:
  category: process_creation
  product: linux
detection:
  selection_npm:
    CommandLine|contains|all:
      - 'npm'
      - 'install'
    CommandLine|contains:
      - 'registry.npmjs.org'
  selection_pip:
    CommandLine|contains|all:
      - 'pip'
      - 'install'
    CommandLine|contains:
      - 'pypi.org'
  selection_maven:
    CommandLine|contains|all:
      - 'mvn'
      - 'dependency'
      - 'resolve'
  condition: selection_npm or selection_pip or selection_maven
level: medium
falsepositives:
  - Normal package installation from public registries
  - CI/CD build processes
```

### Bash 脚本：供应链安全自动化狩猎

```bash
#!/bin/bash
echo "[*] Supply Chain Security Hunting Script"
echo "========================================="
echo ""

PROJECT_ROOT="${1:-.}"
RESULTS_FILE="supply_chain_hunt_$(date +%Y%m%d_%H%M%S).txt"

echo "[Phase 1] Scanning for dependency files..."
find "$PROJECT_ROOT" -name "package.json" -not -path "*/node_modules/*" | while read f; do
    echo "[+] Found: $f"
    python3 -c "
import json
with open('$f') as fh:
    pkg = json.load(fh)
scripts = pkg.get('scripts', {})
for hook in ['preinstall', 'install', 'postinstall']:
    if hook in scripts:
        print(f'  [!!!] {hook}: {scripts[hook]}')
" 2>/dev/null
done

echo ""
echo "[Phase 2] Checking for git dependencies..."
find "$PROJECT_ROOT" -name "package.json" -not -path "*/node_modules/*" | while read f; do
    python3 -c "
import json
with open('$f') as fh:
    pkg = json.load(fh)
deps = {**pkg.get('dependencies', {}), **pkg.get('devDependencies', {})}
for name, version in deps.items():
    if version.startswith('git') or version.startswith('github'):
        print(f'  [!] Git dependency: {name} -> {version}')
" 2>/dev/null
done

echo ""
echo "[Phase 3] Checking for known malicious packages..."
MALICIOUS_PKGS="flatmap-stream ua-parser-js coa rc colors event-stream"
for pkg in $MALICIOUS_PKGS; do
    if [ -d "$PROJECT_ROOT/node_modules/$pkg" ]; then
        echo "[!!!] KNOWN MALICIOUS PACKAGE FOUND: $pkg"
        find "$PROJECT_ROOT/node_modules/$pkg" -type f | head -20
    fi
done

echo ""
echo "[Phase 4] Checking npm registry integrity..."
if [ -f "$PROJECT_ROOT/package-lock.json" ]; then
    python3 -c "
import json
with open('$PROJECT_ROOT/package-lock.json') as f:
    lock = json.load(f)
packages = lock.get('packages', {})
issues = 0
for name, info in packages.items():
    if not info.get('integrity') and name:
        print(f'  [!] Missing integrity: {name}')
        issues += 1
print(f'  Total integrity issues: {issues}')
" 2>/dev/null
fi

echo ""
echo "[Phase 5] Scanning for suspicious URLs in dependencies..."
find "$PROJECT_ROOT/node_modules" -name "*.js" -not -path "*/.cache/*" 2>/dev/null | head -500 | xargs grep -l "atob\|Buffer.from.*base64\|child_process\|execSync" 2>/dev/null | head -20

echo ""
echo "[*] Hunting complete. Results saved to $RESULTS_FILE"
```

### Python 脚本：SBOM 组件异常检测

```python
import json
import sys
import os
from datetime import datetime, timedelta

KNOWN_MALICIOUS = {
    "flatmap-stream": {"cve": "N/A", "event": "event-stream backdoor 2018"},
    "ua-parser-js": {"cve": "CVE-2021-47174", "event": "Typosquatting crypto miner"},
    "coa": {"cve": "CVE-2021-37701", "event": "Typosquatting DoS"},
    "rc": {"cve": "CVE-2021-3807", "event": "Typosquatting DoS"},
    "colors": {"cve": "N/A", "event": "Protestware v1.4.44-liberty-2"},
}

SUSPICIOUS_PATTERNS = [
    "eval(",
    "Function(",
    "child_process",
    "require('http')",
    "process.env",
    "crypto.createCipher",
    "Buffer.from(",
    "atob(",
    "String.fromCharCode",
]

def scan_sbom(sbom_path):
    with open(sbom_path) as f:
        sbom = json.load(f)

    components = sbom.get('components', [])
    findings = []

    for comp in components:
        name = comp.get('name', '')
        version = comp.get('version', '')

        if name.lower() in KNOWN_MALICIOUS:
            findings.append({
                "severity": "CRITICAL",
                "component": f"{name}@{version}",
                "reason": f"Known malicious package - {KNOWN_MALICIOUS[name.lower()]['event']}",
                "cve": KNOWN_MALICIOUS[name.lower()]['cve']
            })

        if not comp.get('hashes'):
            findings.append({
                "severity": "MEDIUM",
                "component": f"{name}@{version}",
                "reason": "Missing integrity hash - cannot verify component integrity",
                "cve": "N/A"
            })

        supplier = comp.get('supplier', {})
        if not supplier or not supplier.get('name'):
            findings.append({
                "severity": "MEDIUM",
                "component": f"{name}@{version}",
                "reason": "No supplier information - cannot verify component origin",
                "cve": "N/A"
            })

        ext_refs = comp.get('externalReferences', [])
        has_website = any(r.get('type') == 'website' for r in ext_refs)
        if not has_website and name:
            findings.append({
                "severity": "LOW",
                "component": f"{name}@{version}",
                "reason": "No website reference - limited provenance information",
                "cve": "N/A"
            })

    return findings

def scan_project_deps(project_path):
    findings = []
    pkg_json = os.path.join(project_path, 'package.json')
    if os.path.exists(pkg_json):
        with open(pkg_json) as f:
            pkg = json.load(f)

        scripts = pkg.get('scripts', {})
        for hook in ['preinstall', 'install', 'postinstall']:
            if hook in scripts:
                script_val = scripts[hook]
                for pattern in SUSPICIOUS_PATTERNS:
                    if pattern in script_val:
                        findings.append({
                            "severity": "CRITICAL",
                            "component": f"scripts.{hook}",
                            "reason": f"Suspicious pattern '{pattern}' in {hook} script: {script_val}",
                            "cve": "N/A"
                        })
                        break

        deps = {**pkg.get('dependencies', {}), **pkg.get('devDependencies', {})}
        for name, version in deps.items():
            if version.startswith('git') or version.startswith('github'):
                findings.append({
                    "severity": "HIGH",
                    "component": f"{name}@{version}",
                    "reason": "Git/URL dependency - may bypass registry security checks",
                    "cve": "N/A"
                })

    return findings

def print_report(sbom_findings, project_findings):
    all_findings = sbom_findings + project_findings
    severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    all_findings.sort(key=lambda x: severity_order.get(x['severity'], 99))

    print("=" * 70)
    print("  SUPPLY CHAIN SECURITY AUDIT REPORT")
    print(f"  Generated: {datetime.now().isoformat()}")
    print("=" * 70)

    critical = sum(1 for f in all_findings if f['severity'] == 'CRITICAL')
    high = sum(1 for f in all_findings if f['severity'] == 'HIGH')
    medium = sum(1 for f in all_findings if f['severity'] == 'MEDIUM')
    low = sum(1 for f in all_findings if f['severity'] == 'LOW')

    print(f"\n  Summary: {critical} CRITICAL | {high} HIGH | {medium} MEDIUM | {low} LOW")
    print("-" * 70)

    for f in all_findings:
        icon = "🔴" if f['severity'] == 'CRITICAL' else "🟡" if f['severity'] in ['HIGH', 'MEDIUM'] else "🟢"
        print(f"\n  {icon} [{f['severity']}] {f['component']}")
        print(f"     Reason: {f['reason']}")
        if f['cve'] != 'N/A':
            print(f"     CVE: {f['cve']}")

    print("\n" + "=" * 70)

if __name__ == "__main__":
    sbom_path = sys.argv[1] if len(sys.argv) > 1 else "sbom.json"
    project_path = sys.argv[2] if len(sys.argv) > 2 else "."

    sbom_findings = []
    if os.path.exists(sbom_path):
        print(f"[*] Scanning SBOM: {sbom_path}")
        sbom_findings = scan_sbom(sbom_path)
    else:
        print(f"[!] SBOM not found: {sbom_path}")

    print(f"[*] Scanning project: {project_path}")
    project_findings = scan_project_deps(project_path)

    print_report(sbom_findings, project_findings)
```

### YARA 规则：供应链恶意包检测

```yara
rule supply_chain_npm_postinstall_backdoor {
    meta:
        description = "Detects npm packages with malicious postinstall scripts"
        author = "Security Forensics Team"
        date = "2026-08-12"
        reference = "Supply Chain Security Forensics"
        severity = "high"
    strings:
        $s1 = "preinstall" ascii
        $s2 = "postinstall" ascii
        $m1 = "curl" ascii
        $m2 = "wget" ascii
        $m3 = "fetch(" ascii
        $m4 = "child_process" ascii
        $m5 = "require('http')" ascii
    condition:
        ($s1 or $s2) and any of ($m*)
}

rule supply_chain_dependency_confusion_indicator {
    meta:
        description = "Detects files associated with dependency confusion attacks"
        author = "Security Forensics Team"
        date = "2026-08-12"
        severity = "critical"
    strings:
        $npm1 = ".npmrc" ascii
        $npm2 = "registry=" ascii
        $pip1 = "pip.conf" ascii
        $pip2 = "extra-index-url" ascii
        $maven1 = "settings.xml" ascii
        $maven2 = "mirrorOf" ascii
        $mal1 = "process.env" ascii
        $mal2 = "os.environ" ascii
        $mal3 = "atob(" ascii
        $mal4 = "Buffer.from" ascii
    condition:
        filesize