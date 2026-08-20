+++
title = "memshell-auditor"
weight = 10
tags = ["内存马", "应急响应", "Java", "安全工具"]
date = "2026-08-13 15:37:37 +0800"

+++

<div class="x7-theme-hero">
  <div class="x7-theme-hero-copy">
    <span class="x7-theme-kicker">Java Memory Shell Auditor</span>
    <h1>memshell-auditor</h1>
    <p>Java 内存马（Memory Shell）运行时审计 Agent：attach 到目标 JVM，检测容器层（Filter / Servlet / Listener / Valve）与 JVM 层（defineClass 注入 / Agent 型）内存马。零依赖、纯反射、JSON 与控制台双输出，JDK 8 编译兼容 JDK 8-21+ 目标环境。</p>
    <div class="x7-theme-actions">
      <a class="x7-theme-button x7-theme-button-primary" href="https://github.com/x7peeps/memshell-auditor" target="_blank" rel="noopener">GitHub 仓库</a>
      <a class="x7-theme-button" href="https://github.com/x7peeps/memshell-auditor/blob/main/README.md" target="_blank" rel="noopener">README</a>
    </div>
  </div>
  <div class="x7-theme-meta-full">
    <p><strong>检测信号：</strong>A1 磁盘无 class 强信号 / A3 非系统 ClassLoader / A4 Agent 参数 / B1-B2 辅助特征</p>
    <p><strong>实测成绩：</strong>JMG v1.0.9 真实内存马（冰蝎/哥斯拉/蚁剑/Suo5）7/7 检出 100%</p>
    <p><strong>技术栈：</strong>Java Agent（Instrumentation）+ Attach API + 纯反射，无第三方依赖</p>
  </div>
</div>

## 项目亮点

<div class="x7-theme-grid">
  <section class="x7-theme-panel">
    <h3>直击内存马的本质</h3>
    <p>不靠类名关键词、不靠文件扫描，而是审计"容器里注册的组件，磁盘上到底存不存在这个 class"。无论攻击者把类名伪装成 org.springframework.* 还是随机字符串，磁盘上不存在就是不存在——A1 强信号一锤定音。</p>
  </section>
  <section class="x7-theme-panel">
    <h3>真实载荷 7/7 检出</h3>
    <p>用开源主流生成器 java-memshell-generator (JMG) v1.0.9 生成冰蝎、哥斯拉、蚁剑、Suo5 共 7 种内存马载荷（Filter/Listener/Valve 三种形态），注入 Tomcat 9/10 靶场实测，全部以 HIGH 级命中。</p>
  </section>
  <section class="x7-theme-panel">
    <h3>容器内部透视</h3>
    <p>通过 WebappClassLoader.resources 字段反射定位 StandardContext，遍历 filterDefs（内存马注入第一落点）、filterConfigs、Servlet、Listener、Valve 全链路组件注册表——不依赖线程上下文、不依赖 JMX。</p>
  </section>
  <section class="x7-theme-panel">
    <h3>零依赖纯反射</h3>
    <p>不引入任何第三方库，不依赖具体中间件类（编译期不引用 Tomcat/Spring），JDK 8 编译，目标 JVM 兼容 JDK 8-21+。attach 无侵入，不重启应用。</p>
  </section>
  <section class="x7-theme-panel">
    <h3>判断标准体系化</h3>
    <p>与应急响应方法论对齐：A 系强信号（磁盘无 class / Agent 注入）直接判高危，B 系辅助信号（类名特征 / 可疑关键字）提示人工复核，降低误报与漏报的平衡成本。</p>
  </section>
  <section class="x7-theme-panel">
    <h3>证据友好输出</h3>
    <p>JSON 报告包含级别、信号编号、类名、ClassLoader、判定原因与处置建议，可直接接入应急响应流程与工单系统；控制台同时输出人类可读摘要。</p>
  </section>
</div>

## 快速开始

```bash
# 1. 构建（JDK 8+）
mvn clean package -DskipTests

# 2. 列出本机 Java 进程
java -jar target/memshell-auditor.jar --list

# 3. attach 到目标 JVM 审计（JDK 9+ 需要 --add-modules jdk.attach）
java --add-modules jdk.attach -jar target/memshell-auditor.jar <PID> /tmp/report.json
```

示例输出：

```text
[01] [HIGH  ] Filter
     信号: A1
     类  : org.springframework.ServletRequestAujFilter
     Loader: ParallelWebappClassLoader (context: ROOT)
     原因: FilterDef 注册的类在磁盘无对应 class 文件（动态加载），高度疑似内存马
```

## 实测检测结果（JMG 真实载荷）

| 载荷 | 工具 | 内存马类型 | 真实类名（伪装） | 容器 | 结果 |
|---|---|---|---|---|---|
| behinder-filter | 冰蝎 Behinder | JakartaFilter | `org.springframework.ServletRequestAujFilter` | Tomcat 10.1 | ✅ HIGH |
| godzilla-filter | 哥斯拉 Godzilla | JakartaFilter | `org.springframework.WhiteBlackListGbyfbdFilter` | Tomcat 10.1 | ✅ HIGH |
| antsword-filter | 蚁剑 AntSword | JakartaFilter | `org.springframework.AbstractMatcherVyjFilter` | Tomcat 10.1 | ✅ HIGH |
| suo5-filter | Suo5 隧道 | Filter | `org.springframework.SessionKqvcFilter` | Tomcat 9.0 | ✅ HIGH |
| behinder-listener | 冰蝎 Behinder | JakartaListener | `org.apache.logging.Log4jConfigEaeListener` | Tomcat 10.1 | ✅ HIGH |
| godzilla-valve | 哥斯拉 Godzilla | Valve | `org.apache.AbstractMatcherGbValve` | Tomcat 10.1 | ✅ HIGH |
| behinder-listener2 | 冰蝎 Behinder | Listener | `org.springframework.ContextLoaderDmasjListener` | Tomcat 9.0 | ✅ HIGH |

**7/7 检出（100%）**。完整测试记录见仓库 [evidence/00-test-log.md](https://github.com/x7peeps/memshell-auditor/blob/main/evidence/00-test-log.md)。

## 项目结构

```
src/main/java/com/memshellauditor/
├── AgentMain.java           # agent 入口（premain / agentmain 双支持）
├── AuditorMain.java         # CLI 启动器（attach）
├── detect/
│   ├── ContainerAuditor.java    # 容器组件审计（Filter/Servlet/Listener/Valve）
│   ├── AgentAuditor.java        # 启动参数 / Agent 型检测
│   ├── ClassLoaderAuditor.java  # ClassLoader 血缘分析
│   └── ClassFeatureAuditor.java # 类特征 + defineClass 检测
├── report/
│   ├── Finding.java         # 发现项（level / signal / category）
│   └── Report.java          # 报告聚合（控制台 / JSON）
└── util/
    └── ReflectUtil.java     # 零依赖反射工具
```

## License

MIT
