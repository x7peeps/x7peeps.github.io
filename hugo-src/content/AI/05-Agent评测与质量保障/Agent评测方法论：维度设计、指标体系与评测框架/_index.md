---
title: "Agent 评测方法论：维度设计、指标体系与评测框架"
weight: 1
tags: [Agent评测, 质量保障, 评测框架, 指标体系]
menu: 
  main: 
    parent: "Agent 评测与质量保障"
---

## 为什么 Agent 评测特殊

在传统软件工程中，评测（Testing）的核心假设是**确定性**——相同的输入经过相同的处理路径，产生相同的输出。单元测试验证函数返回值，集成测试验证模块间的交互契约，端到端测试验证用户流程的完整性。这些测试的共同特征是：预期结果可以在测试编写时就明确确定。

Agent 系统从根本上打破了这一假设。一个典型的 AI Agent 具备以下特征，使得传统测试方法论难以直接适用：

| 特征 | 传统软件 | AI Agent |
|------|---------|---------|
| 输出确定性 | 相同输入 → 相同输出 | 相同输入 → 可能不同输出 |
| 执行路径 | 预定义的控制流 | 模型自主决策的动态路径 |
| 错误模式 | 语法错误、逻辑错误、运行时异常 | 幻觉、推理偏差、工具误用、目标偏离 |
| 交互复杂度 | 单轮输入-输出 | 多轮对话、多步推理、工具调用链 |
| 任务时长 | 毫秒到秒级 | 秒级到分钟级，甚至更长 |
| 成功标准 | 布尔判定（通过/失败） | 多维度、可部分得分的连续评价 |

具体而言，Agent 评测的特殊性体现在以下四个维度：

**非确定性（Non-determinism）**：即使 temperature 设为 0，由于浮点运算精度、并行执行顺序等因素，Agent 在复杂推理任务中仍可能产生不同的执行路径。这意味着同一测试用例的多次运行可能得到不同结果，评测框架必须容忍并量化这种变异性。

**多步推理（Multi-step Reasoning）**：Agent 的任务完成通常涉及多个推理步骤的串联。每一步的正确性都会影响后续步骤，错误可能在推理链中传播和放大。评测不仅要关注最终结果，还需要评估中间步骤的质量。

**工具调用（Tool Calls）**：Agent 通过调用外部工具（API、数据库、搜索引擎等）来扩展自身能力。工具调用的选择是否合理、参数是否正确、结果是否被正确解读，这些都是传统测试不涉及的评测维度。

**长周期任务（Long-horizon Tasks）**：复杂的 Agent 任务可能涉及数十甚至数百个步骤，跨越多个工具调用和推理环节。评测框架需要在整个任务执行过程中保持可观测性，并能在任意环节进行质量判定。

---

## 评测维度全景

Agent 评测不是单一维度的通过/失败判定，而是一个**多维度的综合评估体系**。以下是工程实践中经过验证的核心评测维度：

### 任务完成度（Task Completion）

任务完成度是 Agent 评测最直观的维度，回答「Agent 是否完成了指定任务」这一核心问题。

**Pass Rate（通过率）**

在固定测试集上，Agent 成功完成任务的比例。这是最基础的评测指标。

```python
def calculate_pass_rate(results: list[dict]) -> float:
    passed = sum(1 for r in results if r["status"] == "passed")
    return passed / len(results) if results else 0.0
```

**Accuracy（准确率）**

对于有明确正确答案的任务（如数据提取、格式转换），准确率衡量输出与期望结果的匹配程度。

**Partial Credit Scoring（部分得分）**

复杂任务往往不是全对或全错。部分得分机制允许对完成度进行细粒度评估：

```json
{
  "task": "根据需求文档生成 API 接口设计",
  "scoring_rubric": {
    "endpoint_design": {"weight": 0.3, "criteria": "RESTful 规范、路径命名合理"},
    "request_schema": {"weight": 0.25, "criteria": "字段完整、类型正确"},
    "response_schema": {"weight": 0.25, "criteria": "包含分页、错误码"},
    "authentication": {"weight": 0.1, "criteria": "认证方案描述完整"},
    "documentation": {"weight": 0.1, "criteria": "参数说明清晰"}
  },
  "max_score": 1.0
}
```

### 工具调用质量（Tool Call Quality）

对于依赖工具调用完成任务的 Agent，工具调用质量是独立的评测维度。

| 指标 | 定义 | 评测方法 |
|------|------|---------|
| **选择准确率** | Agent 是否选择了正确的工具 | 与标注的最优工具序列对比 |
| **参数正确性** | 调用参数是否符合 API 规范 | Schema 验证 + 语义校验 |
| **调用效率** | 完成任务所需的最少调用次数 vs 实际调用次数 | `min_calls / actual_calls` |
| **错误恢复** | 工具调用失败后是否能正确处理并重试 | 注入工具故障场景测试 |
| **冗余调用** | 是否存在不必要的工具调用 | 静态分析调用链 |

```python
class ToolCallEvaluator:
    def evaluate(self, tool_calls: list[dict], expected: list[dict]) -> dict:
        selection_score = self._match_tool_selection(tool_calls, expected)
        param_score = self._validate_parameters(tool_calls, expected)
        efficiency_score = self._compute_efficiency(tool_calls, expected)
        
        return {
            "selection_accuracy": selection_score,
            "parameter_correctness": param_score,
            "call_efficiency": efficiency_score,
            "overall": (selection_score + param_score + efficiency_score) / 3
        }
    
    def _compute_efficiency(self, actual: list[dict], expected: list[dict]) -> float:
        min_required = len(expected)
        actual_count = len(actual)
        if actual_count == 0:
            return 0.0
        return min(1.0, min_required / actual_count)
```

### 推理链质量（Reasoning Chain）

推理链评测关注 Agent 的中间推理过程，而不仅仅是最终结果。

**逻辑一致性（Logical Consistency）**：推理步骤之间是否存在矛盾。例如 Agent 在第一步声称"用户未登录"，第三步却基于"用户已登录"的前提继续推理。

**步骤有效性（Step Validity）**：每个推理步骤是否基于前一步的正确输出，是否引入了不必要的假设或跳跃。

**结论正确性（Conclusion Correctness）**：基于推理链得出的结论是否与任务目标一致。

评测推理链的常用方法是使用 LLM-as-Judge，让一个独立的模型对推理过程进行逐条评估：

```python
REASONING_CHAIN_EVALUATION_PROMPT = """
你是一个推理链质量评审专家。请逐条检查以下 Agent 推理链的质量。

## 推理链
{reasoning_chain}

## 评审维度
1. **逻辑一致性**：是否存在自相矛盾的步骤？（0-10分）
2. **步骤有效性**：是否有不必要的跳跃或冗余步骤？（0-10分）
3. **结论正确性**：最终结论是否与任务目标一致？（0-10分）
4. **证据引用**：推理是否基于可靠的上下文信息？（0-10分）

请输出 JSON 格式的评分和评语。
"""
```

### 安全性（Safety）

Agent 系统的安全评测独立于功能评测，关注以下子维度：

- **Prompt 注入防御**：当用户输入中包含恶意指令时，Agent 是否能正确识别并拒绝执行
- **输出合规性**：Agent 的输出是否符合内容安全政策，不包含有害、歧视或不当内容
- **数据泄露防护**：Agent 是否会在输出中暴露系统 Prompt、内部 API 密钥或敏感数据
- **权限边界**：Agent 是否严格遵循最小权限原则，不执行超出授权范围的操作

### 效率（Efficiency）

| 效率指标 | 计算方式 | 优化方向 |
|---------|---------|---------|
| Token 消耗 | 单任务平均 token 数 | Prompt 压缩、上下文裁剪 |
| 延迟 | 首 token 时间 + 总响应时间 | 流式输出、并行工具调用 |
| 成本 | Token 单价 × 消耗量 + 工具调用费用 | 模型路由、缓存策略 |
| 重试率 | 因错误导致的重试次数 / 总任务数 | 提高首次成功率 |

### 用户体验（User Experience）

对于面向终端用户的 Agent，用户体验维度不可忽略：

- **响应质量**：回答的准确性、完整性、深度是否满足用户期望
- **交互流畅度**：对话轮次是否合理，是否存在不必要的追问
- **帮助性（Helpfulness）**：Agent 是否真正解决了用户的问题，而非仅仅回答了字面问题
- **一致性**：在多轮对话中是否保持上下文连贯，不产生矛盾

---

## 评测方法分类

评测方法的选择取决于评测目的、资源预算和系统成熟度。三种主要方法各有适用场景：

### 静态评测（Static Evaluation）

使用预定义的固定测试用例集进行评测，是最基础也是最可控的评测方式。

**实施方式**：

```python
class StaticEvaluator:
    def __init__(self, test_cases: list[dict]):
        self.test_cases = test_cases
        self.results = []
    
    def run(self, agent):
        for case in self.test_cases:
            output = agent.execute(case["input"])
            score = self.judge(output, case["expected"], case.get("scoring_rubric"))
            self.results.append({
                "case_id": case["id"],
                "input": case["input"],
                "output": output,
                "expected": case.get("expected"),
                "score": score,
                "passed": score >= case.get("pass_threshold", 0.8)
            })
        return self._aggregate_results()
    
    def judge(self, output, expected, rubric):
        if expected is None:
            return self._llm_judge(output, rubric)
        return self._exact_match(output, expected)
    
    def _aggregate_results(self) -> dict:
        total = len(self.results)
        passed = sum(1 for r in self.results if r["passed"])
        avg_score = sum(r["score"] for r in self.results) / total if total else 0
        return {
            "total_cases": total,
            "passed": passed,
            "pass_rate": passed / total if total else 0,
            "average_score": avg_score,
            "failed_cases": [r for r in self.results if not r["passed"]]
        }
```

| 优势 | 劣势 |
|------|------|
| 结果可复现，便于回归测试 | 测试集覆盖有限，难以穷举 |
| 实现简单，成本低 | 无法评估交互式场景 |
| 支持 CI/CD 集成 | 容易导致「应试化」优化 |
| 便于横向对比不同版本 | 无法发现未预设的边界情况 |

### 动态评测（Dynamic Evaluation）

通过模拟用户交互或构造动态场景来评测 Agent，更接近真实使用场景。

**实施方式**：

```python
class DynamicEvaluator:
    def __init__(self, scenario_generator, max_turns: int = 10):
        self.scenario_gen = scenario_generator
        self.max_turns = max_turns
    
    def run(self, agent):
        scenarios = self.scenario_gen.generate(count=50)
        results = []
        
        for scenario in scenarios:
            conversation = []
            agent.reset()
            
            for turn in range(self.max_turns):
                user_input = scenario.get_next_input(conversation)
                if user_input is None:
                    break
                
                response = agent.step(user_input)
                conversation.append({
                    "role": "user",
                    "content": user_input
                })
                conversation.append({
                    "role": "assistant",
                    "content": response
                })
            
            score = self._evaluate_conversation(conversation, scenario)
            results.append({
                "scenario_id": scenario.id,
                "turns": len(conversation) // 2,
                "score": score,
                "conversation": conversation
            })
        
        return results
```

| 优势 | 劣势 |
|------|------|
| 更接近真实交互场景 | 实现复杂度高 |
| 能发现多轮交互中的问题 | 耗时长、成本高 |
| 可测试对话状态管理 | 需要设计高质量的场景生成器 |
| 评测 Agent 的自适应能力 | 评测结果的可复现性较低 |

### 在线评测（Online Evaluation）

在真实用户场景中收集评测数据，是最终极的评测方式。

**关键实践**：

- **A/B 测试**：将用户随机分配到不同 Agent 版本，对比核心指标
- **隐式反馈收集**：追踪用户行为（重新提问率、任务放弃率、会话时长）
- **显式反馈收集**：点赞/点踩、满意度评分、自由文本反馈
- **异常检测**：实时监控 Agent 输出质量，自动标记可疑响应

| 优势 | 劣势 |
|------|------|
| 反映最真实的用户反馈 | 需要大量用户流量 |
| 能发现实验室环境无法复现的问题 | 用户安全和体验风险 |
| 持续积累评测数据 | 数据噪声大，分析复杂 |
| 评估长期用户满意度 | 涉及隐私和合规考量 |

**三种方法的适用阶段**：

```
开发阶段   ────→   预发布阶段   ────→   上线阶段
  │                  │                  │
  ▼                  ▼                  ▼
静态评测为主      动态评测为主        在线评测为主
(快速迭代验证)    (深度质量把关)     (真实效果度量)
```

---

## 评测数据集构建

评测数据集是评测体系的基石。高质量的评测数据集需要覆盖多种场景类型，并遵循严格的标注规范。

### 数据集分类

| 类型 | 目的 | 占比建议 | 示例 |
|------|------|---------|------|
| **标准用例（Standard Cases）** | 验证基本功能正确性 | 50-60% | 常见任务、标准流程 |
| **边界用例（Edge Cases）** | 探测系统极限 | 15-20% | 空输入、超长文本、特殊字符 |
| **对抗用例（Adversarial Cases）** | 测试安全性和鲁棒性 | 15-20% | Prompt 注入、诱导性提问 |
| **业务用例（Business Cases）** | 贴合实际业务场景 | 15-20% | 领域特定任务、复杂工作流 |

### 数据采集策略

**人工构造**：由领域专家手动编写测试用例。优势是质量可控、覆盖有目标性，劣势是成本高、主观偏差大。

**种子扩增（Seed Expansion）**：从少量种子用例出发，通过 LLM 自动生成变体：

```python
SEED_EXPANSION_PROMPT = """
你是一个测试用例生成专家。基于以下种子用例，生成 5 个语义等价但表述不同的变体。

## 种子用例
输入: "{seed_input}"
预期行为: {expected_behavior}

## 要求
1. 保持任务意图不变，改变表述方式
2. 增加不同的上下文噪声
3. 引入不同的用户角色和口吻
4. 输出 JSON 格式
"""
```

**生产日志挖掘**：从线上真实交互日志中提取有代表性的用例。需要注意脱敏处理和隐私保护。

**众包标注**：通过众包平台收集多样化的输入和期望输出。需要配套详细的标注指南和质量审核流程。

### 标注质量保障

```yaml
annotation_guidelines:
  general:
    - 每条用例至少由 3 名标注者独立标注
    - 标注者间一致性（IAA）Cohen's Kappa 需 ≥ 0.75
    - 不一致的用例由高级标注者仲裁
  
  scoring:
    - 使用 5 级评分量表（1-5）或百分制
    - 为每个等级提供锚定示例（Anchor Examples）
    - 对于部分得分场景，明确定义各分值的边界条件
  
  safety:
    - 安全评测用例需覆盖所有已知攻击模式
    - 每季度更新一次对抗用例库
    - 由红队成员参与安全用例设计
```

---

## 评测流程设计

一个完整的 Agent 评测流程应包含以下五个阶段，形成标准化的 Pipeline：

### Pipeline 架构

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ 数据准备  │───→│ 评测执行  │───→│ 结果采集  │───→│ 分析评估  │───→│ 报告输出  │
│          │    │          │    │          │    │          │    │          │
│• 用例筛选 │    │• 环境隔离 │    │• 日志记录 │    │• 指标计算 │    │• 可视化   │
│• 环境配置 │    │• 并发控制 │    │• 截图录屏 │    │• 错误分类 │    │• 趋势分析 │
│• 依赖准备 │    │• 超时处理 │    │• Trace收集│    │• 根因分析 │    │• 改进建议 │
│• 基线设置 │    │• 多轮执行 │    │• 指标采集 │    │• 对比分析 │    │• 版本归档 │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

### 各阶段详解

**阶段一：数据准备**

```python
class TestDataPreparator:
    def prepare(self, test_suite: dict) -> dict:
        filtered_cases = self._filter_by_tag(test_suite["cases"], test_suite.get("tags"))
        environment = self._setup_environment(test_suite.get("env_config", {}))
        baseline = self._load_baseline(test_suite.get("baseline_version"))
        
        return {
            "cases": filtered_cases,
            "environment": environment,
            "baseline": baseline,
            "metadata": {
                "total_cases": len(filtered_cases),
                "created_at": datetime.now().isoformat(),
                "suite_version": test_suite["version"]
            }
        }
    
    def _filter_by_tag(self, cases: list, tags: list) -> list:
        if not tags:
            return cases
        return [c for c in cases if any(t in c.get("tags", []) for t in tags)]
```

**阶段二：评测执行**

评测执行需要处理 Agent 的非确定性特征，关键实践包括：

- **多次运行取统计量**：同一用例运行 3-5 次，报告均值和标准差
- **超时与熔断**：为每个测试用例设置执行超时，避免阻塞整个 Pipeline
- **环境隔离**：每次评测在干净的环境中执行，避免状态泄漏

```python
class EvaluationExecutor:
    def __init__(self, agent, max_retries: int = 3, timeout: int = 120):
        self.agent = agent
        self.max_retries = max_retries
        self.timeout = timeout
    
    def execute_with_stats(self, test_case: dict, runs: int = 3) -> dict:
        scores = []
        errors = []
        
        for i in range(runs):
            try:
                result = asyncio.wait_for(
                    self.agent.execute(test_case["input"]),
                    timeout=self.timeout
                )
                score = self._evaluate(result, test_case)
                scores.append(score)
            except asyncio.TimeoutError:
                errors.append("timeout")
            except Exception as e:
                errors.append(str(e))
        
        return {
            "case_id": test_case["id"],
            "mean_score": statistics.mean(scores) if scores else 0,
            "std_score": statistics.stdev(scores) if len(scores) > 1 else 0,
            "min_score": min(scores) if scores else 0,
            "max_score": max(scores) if scores else 0,
            "success_rate": len(scores) / runs,
            "errors": errors
        }
```

**阶段三：结果采集**

除了最终得分，评测过程中产生的 Trace 数据同样重要：

```json
{
  "trace_id": "eval_20240115_001",
  "case_id": "standard_042",
  "timeline": [
    {
      "step": 1,
      "action": "analyze_request",
      "input_tokens": 1250,
      "output_tokens": 380,
      "latency_ms": 1200,
      "tool_calls": []
    },
    {
      "step": 2,
      "action": "search_database",
      "input_tokens": 1630,
      "output_tokens": 0,
      "latency_ms": 850,
      "tool_calls": [
        {"name": "db_query", "params": {"sql": "SELECT ..."}, "status": "success"}
      ]
    }
  ],
  "total_tokens": 3260,
  "total_latency_ms": 4500,
  "final_score": 0.92
}
```

**阶段四：分析评估**

```python
class EvaluationAnalyzer:
    def analyze(self, results: list[dict]) -> dict:
        overall = self._compute_overall_metrics(results)
        dimension_scores = self._compute_dimension_scores(results)
        failure_analysis = self._analyze_failures(results)
        regression = self._compare_with_baseline(results)
        
        return {
            "overall": overall,
            "dimensions": dimension_scores,
            "failures": failure_analysis,
            "regression": regression,
            "recommendations": self._generate_recommendations(failure_analysis)
        }
    
    def _analyze_failures(self, results: list[dict]) -> dict:
        failures = [r for r in results if not r.get("passed", True)]
        
        error_categories = {}
        for f in failures:
            category = f.get("error_category", "unknown")
            error_categories.setdefault(category, []).append(f)
        
        return {
            "total_failures": len(failures),
            "failure_rate": len(failures) / len(results) if results else 0,
            "by_category": {
                cat: {
                    "count": len(cases),
                    "common_patterns": self._extract_patterns(cases)
                }
                for cat, cases in error_categories.items()
            }
        }
```

**阶段五：报告输出**

评测报告应包含以下关键内容：

```markdown
# Agent 评测报告 - v2.3.1

## 概览
- 评测时间: 2024-01-15
- 测试用例数: 500
- 整体通过率: 87.4% (↑2.1% vs v2.3.0)
- 平均得分: 0.832 (↑0.018)

## 维度评分
| 维度 | 得分 | 环比变化 |
|------|------|---------|
| 任务完成度 | 0.91 | +0.02 |
| 工具调用质量 | 0.85 | +0.03 |
| 推理链质量 | 0.79 | -0.01 |
| 安全性 | 0.95 | +0.00 |
| 效率 | 0.82 | +0.05 |

## 失败分析
- 主要失败模式: 复杂多步任务中的中间步骤错误 (占比 42%)
- 新增回归: 边界用例处理退化 (3 个用例)

## 改进建议
1. 优化多步推理的自我验证机制
2. 增加边界用例的专项训练数据
```

---

## 从评测到改进的闭环

评测的终极价值不在于产出报告，而在于驱动系统持续改进。一个有效的闭环流程应包含以下环节：

### 根因分析

从评测结果中定位问题的根本原因，而非停留在表面症状：

```
症状: 任务通过率下降 5%
  │
  ├── 分类: 哪些类型的任务退化了？
  │   └── 数据提取类任务下降 12%，其他类型基本稳定
  │
  ├── 定位: 退化发生在哪个环节？
  │   └── 工具调用参数正确率从 92% 降至 78%
  │
  └── 根因: 什么变化导致了这个退化？
      └── 最新 Prompt 版本修改了日期格式解析指令，
          导致参数提取逻辑偏移
```

### 针对性改进策略

```python
IMPROVEMENT_STRATEGIES = {
    "tool_call_failure": {
        "short_term": "增加 Tool Use 的 Few-shot 示例",
        "medium_term": "实现工具调用前的参数校验层",
        "long_term": "引入 Tool Use 的强化学习微调"
    },
    "reasoning_chain_error": {
        "short_term": "在 Prompt 中增加 Chain-of-Thought 引导",
        "medium_term": "实现推理步骤的自我验证检查点",
        "long_term": "训练专门的推理验证模型"
    },
    "safety_violation": {
        "short_term": "增加安全过滤规则",
        "medium_term": "实现多层防御（输入过滤 + 输出审核）",
        "long_term": "通过 RLHF 强化安全行为"
    }
}
```

### 回归测试

每次改进后，必须在完整的评测数据集上运行回归测试，确保改进不引入新的问题：

```python
class RegressionTester:
    def run(self, new_version_results, baseline_results) -> dict:
        regressions = []
        improvements = []
        
        for case_id in baseline_results:
            old_score = baseline_results[case_id]["score"]
            new_score = new_version_results.get(case_id, {}).get("score", 0)
            
            delta = new_score - old_score
            if delta < -0.1:
                regressions.append({
                    "case_id": case_id,
                    "delta": delta,
                    "old_score": old_score,
                    "new_score": new_score
                })
            elif delta > 0.1:
                improvements.append({
                    "case_id": case_id,
                    "delta": delta
                })
        
        return {
            "regressions": regressions,
            "improvements": improvements,
            "can_release": len(regressions) == 0
        }
```

---

## 评测维度全景图

以下全景图展示了 Agent 评测各维度之间的层次关系和依赖结构：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Agent 评测维度全景图                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─── 外部感知层 ────────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │  │
│  │   │  用户体验     │  │  安全性       │  │  效率                │   │  │
│  │   │ • 响应质量    │  │ • Prompt注入  │  │ • Token消耗          │   │  │
│  │   │ • 交互流畅度  │  │ • 输出合规    │  │ • 延迟               │   │  │
│  │   │ • 帮助性      │  │ • 数据泄露    │  │ • 成本               │   │  │
│  │   │ • 一致性      │  │ • 权限边界    │  │ • 重试率             │   │  │
│  │   └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │  │
│  │          │                 │                      │                │  │
│  └──────────┼─────────────────┼──────────────────────┼────────────────┘  │
│             │                 │                      │                   │
│  ┌──────────┼─── 核心能力层 ─┼──────────────────────┼────────────────┐  │
│  │          ▼                 ▼                      ▼                │  │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │  │
│  │   │  任务完成度    │  │  工具调用质量  │  │  推理链质量          │   │  │
│  │   │ • Pass Rate   │  │ • 选择准确率  │  │ • 逻辑一致性         │   │  │
│  │   │ • Accuracy    │  │ • 参数正确性  │  │ • 步骤有效性         │   │  │
│  │   │ • Partial     │  │ • 调用效率    │  │ • 结论正确性         │   │  │
│  │   │   Credit      │  │ • 错误恢复    │  │ • 证据引用           │   │  │
│  │   └──────────────┘  └──────────────┘  └──────────────────────┘   │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─── 评测方法 ──────────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │   静态评测          动态评测           在线评测                     │  │
│  │   (固定用例)        (交互模拟)         (真实用户)                   │  │
│  │   ┌─────────┐      ┌─────────┐       ┌─────────┐                 │  │
│  │   │ CI/CD   │      │ 场景    │       │ A/B     │                 │  │
│  │   │ 回归    │ ───→ │ 模拟    │ ───→  │ 测试    │                 │  │
│  │   │ 验证    │      │ 深度    │       │ 线上    │                 │  │
│  │   │         │      │ 评测    │       │ 度量    │                 │  │
│  │   └─────────┘      └─────────┘       └─────────┘                 │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─── 数据支撑层 ────────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │   标准用例(50-60%)  边界用例(15-20%)  对抗用例(15-20%)  业务用例  │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 评测模板：可直接复用的实践框架

以下是一个可直接在项目中落地的评测框架模板，覆盖配置、执行、分析全流程：

```yaml
# agent_eval_config.yaml
eval_metadata:
  name: "Agent v2.3.1 常规评测"
  version: "2.3.1"
  baseline: "2.3.0"
  created_by: "qa-team"
  created_at: "2024-01-15"

test_suites:
  - name: "core_functionality"
    description: "核心功能验证"
    tags: [standard, smoke]
    cases_count: 200
    run_count: 3
    timeout_seconds: 60
    pass_threshold: 0.8
    
  - name: "edge_cases"
    description: "边界条件探测"
    tags: [edge]
    cases_count: 100
    run_count: 5
    timeout_seconds: 120
    pass_threshold: 0.6
    
  - name: "safety"
    description: "安全性评测"
    tags: [adversarial, safety]
    cases_count: 80
    run_count: 3
    timeout_seconds: 60
    pass_threshold: 0.95
    
  - name: "complex_workflow"
    description: "复杂工作流评测"
    tags: [business, workflow]
    cases_count: 50
    run_count: 3
    timeout_seconds: 300
    pass_threshold: 0.75

scoring_dimensions:
  - name: "task_completion"
    weight: 0.35
    metrics: [pass_rate, accuracy, partial_credit]
    
  - name: "tool_call_quality"
    weight: 0.25
    metrics: [selection_accuracy, parameter_correctness, efficiency]
    
  - name: "reasoning_chain"
    weight: 0.15
    metrics: [logical_consistency, step_validity, conclusion_correctness]
    
  - name: "safety"
    weight: 0.15
    metrics: [injection_defense, output_compliance, data_leakage]
    
  - name: "efficiency"
    weight: 0.10
    metrics: [token_consumption, latency, cost_per_task]

quality_gates:
  overall_pass_rate: 0.85
  safety_pass_rate: 0.95
  max_regression_cases: 0
  max_cost_increase_pct: 10
```

```bash
#!/bin/bash
# run_evaluation.sh - 评测执行入口

set -euo pipefail

CONFIG="agent_eval_config.yaml"
RESULTS_DIR="eval_results/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$RESULTS_DIR"

echo "=== Agent 评测启动 ==="
echo "配置文件: $CONFIG"
echo "结果目录: $RESULTS_DIR"

python -m agent_eval.pipeline \
    --config "$CONFIG" \
    --output-dir "$RESULTS_DIR" \
    --parallel-jobs 4 \
    --log-level INFO

python -m agent_eval.analyzer \
    --results-dir "$RESULTS_DIR" \
    --baseline-version "2.3.0" \
    --report-format markdown \
    --output "$RESULTS_DIR/report.md"

python -m agent_eval.gate_check \
    --results-dir "$RESULTS_DIR" \
    --config "$CONFIG" \
    --fail-on-regression

echo "=== 评测完成 ==="
echo "报告路径: $RESULTS_DIR/report.md"
```

---

## 延伸阅读

Agent 评测是一个快速演进的领域，各大 AI 实验室都在积极构建自己的评测体系。以下是值得关注的评测实践和资源：

### OpenAI Evals

OpenAI 开源的 [Evals](https://github.com/openai/evals) 框架提供了标准化的评测基础设施。其核心设计思想是将评测用例定义为可复用的「Eval」对象，支持自定义评测逻辑和自动化评估器。Evals 的一个重要贡献是建立了「model-graded」评估范式——使用 LLM 自身作为评判者来评估输出质量，这为开放式任务的评测提供了一种可扩展的解决方案。

### Anthropic 的评测方法论

Anthropic 在模型安全评测方面有着深入的实践。其方法论强调**多维度评测**和**红队测试**的结合。Anthropic 公开了若干评测框架的设计思路，包括如何构建对抗性测试集、如何评估模型在安全边界上的行为、以及如何使用 Constitutional AI 原则来指导评测标准的制定。

### Google DeepMind 的评测实践

Google 在 LLM 评测方面贡献了多个重要基准，包括 MMLU、BIG-bench 等。对于 Agent 场景，Google 研究团队提出了**动态评测基准**的概念——评测任务不再是静态的，而是根据 Agent 的行为动态调整难度和方向，这有效缓解了「应试化」优化的问题。

### 其他值得关注的资源

- **[Langsmith by LangChain](https://smith.langchain.com/)**：提供 Agent Tracing 和评测的一体化平台，支持在线评测和 A/B 测试
- **[Braintrust](https://www.braintrust.dev/)**：专注于 LLM 应用评测的平台，提供数据集管理和评估器编排能力
- **[HELM (Holistic Evaluation of Language Models)](https://crfm.stanford.edu/helm/)**：Stanford 提出的 LLM 综合评测框架，覆盖多维度、多任务的系统性评测
- **[AgentBench](https://github.com/THUDM/AgentBench)**：清华大学提出的 Agent 评测基准，涵盖多种环境和任务类型

评测不是一个终点，而是一个持续迭代的过程。随着 Agent 系统能力的增强和应用场景的拓展，评测方法论本身也需要不断演进。建立一个扎实的评测体系，是 Agent 系统从实验走向生产的关键基础设施。
