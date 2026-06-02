---
name: "vuln-report-generator"
description: "Generate standardized vulnerability analysis articles (CVE details, principles, POC, logs, references). Invoke when the user asks to write/collect vulnerability information or create a CVE article."
---

# Vulnerability Report Generator

This skill standardizes the process of gathering and writing vulnerability (CVE) analysis articles.

## When to Use
Invoke this skill when the user requests to:
- Research a specific CVE or vulnerability
- Collect vulnerability details, principles, POCs, and exploit cases
- Generate an article or report about a vulnerability
- Analyze emergency response and log traces for a CVE

## Process
1. **Information Gathering**: Automatically use the `search` sub-agent to collect comprehensive details about the vulnerability. Focus on:
   - Vulnerability principle (漏洞原理)
   - Detailed description (漏洞详情)
   - Proof of Concept (POC)
   - Real-world exploit cases (利用案例)
   - **Advanced exploitation techniques (高级利用姿势)**: Focus on memory web shells, WAF bypass, echo techniques, network evasion, and variant payloads. Do not just stop at vulnerability verification; elaborate on weaponization.
   - Emergency response and log trace analysis (应急排查日志痕迹分析)
   - References (参考材料)
2. **Article Generation**: Format the gathered information into a well-structured Markdown article.
3. **Storage**: Save the generated article into the specified or existing vulnerability analysis directory (e.g., `hugo-src/content/安全/渗透测试/03 漏洞分析/`).
4. **Link format**: Always provide the final Code Reference to the generated file using standard Markdown links.
