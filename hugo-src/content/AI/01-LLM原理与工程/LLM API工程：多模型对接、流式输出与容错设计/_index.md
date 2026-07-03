---
title: "LLM API 工程：多模型对接、流式输出与容错设计"
weight: 3
tags: [LLM API, 流式输出, SSE, 容错, FastAPI, 工程化]
menu: 
  main: 
    parent: "LLM 原理与工程"
---

# LLM API 工程：多模型对接、流式输出与容错设计

在生产环境中对接 LLM API，远不只是调用一个 HTTP 接口那么简单。开发者需要面对的是：**多家模型供应商 API 规范不统一、流式输出协议存在差异、调用失败率高于传统 REST 服务、Token 计费模型复杂、速率限制策略各异**。本文从后端工程视角出发，系统梳理多模型对接、流式输出、容错设计三个核心问题，提供可直接落地的工程方案。

---

## 1. 各大 LLM API 规范对比

尽管 OpenAI 的 API 格式已成为事实标准，但 Anthropic、DeepSeek、Qwen 等模型在请求/响应格式、认证方式、流式协议和错误码上仍有显著差异。以下是关键维度的对比：

### 1.1 综合对比表

| 维度 | OpenAI | Anthropic | DeepSeek | Qwen (DashScope) |
|------|--------|-----------|----------|------------------|
| **Endpoint** | `api.openai.com/v1/chat/completions` | `api.anthropic.com/v1/messages` | `api.deepseek.com/chat/completions` | `dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` |
| **认证方式** | `Authorization: Bearer <key>` | `x-api-key: <key>` + `anthropic-version: 2023-06-01` | `Authorization: Bearer <key>` | `Authorization: Bearer <key>` |
| **模型参数位置** | `model` 字段 | `model` 字段 | `model` 字段 | `model` 字段 |
| **系统提示词** | `messages` 首条 `role: system` | 顶级 `system` 字段 | `messages` 首条 `role: system` | `messages` 首条 `role: system` |
| **流式传输** | SSE (`stream: true`) | SSE (`stream: true`) | SSE (`stream: true`) | SSE (`stream: true`) |
| **流式事件类型** | `chat.completion.chunk` | `message_start` / `content_block_delta` / `message_stop` | `chat.completion.chunk` | `chat.completion.chunk` |
| **最大上下文** | 128K (GPT-4o) | 200K (Claude 4) | 64K (DeepSeek-V3) | 128K (Qwen-Max) |
| **错误码格式** | `{"error": {"type": "...", "message": "..."}}` | `{"type": "error", "error": {"type": "...", "message": "..."}}` | 同 OpenAI | 同 OpenAI |

### 1.2 请求体格式差异

OpenAI 与 DeepSeek 的请求格式高度兼容：

```json
{
  "model": "deepseek-chat",
  "messages": [
    {"role": "system", "content": "你是一个有帮助的助手"},
    {"role": "user", "content": "你好"}
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 2048
}
```

Anthropic 的请求格式则有显著不同——系统提示词被提升为顶级参数，`max_tokens` 为必填字段：

```json
{
  "model": "claude-sonnet-4-20250514",
  "system": "你是一个有帮助的助手",
  "messages": [
    {"role": "user", "content": "你好"}
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 2048
}
```

### 1.3 流式响应格式差异

OpenAI/DeepSeek/Qwen 共用同一流式格式，每个 SSE 事件的数据块为：

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"你"},"finish_reason":null}]}

data: [DONE]
```

Anthropic 的流式格式则采用了更细粒度的事件类型：

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_xxx","role":"assistant","content":[],"model":"claude-sonnet-4-20250514"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你"}}

event: message_stop
data: {"type":"message_stop"}
```

这种差异意味着，**直接使用 OpenAI 官方 SDK 无法调用 Anthropic API**，需要针对不同供应商进行适配。这也是统一 API 网关存在的核心理由。

---

## 2. 统一 API 网关设计

面对多家 API 规范不统一的现状，工程上的最佳实践是引入**适配器模式（Adapter Pattern）**，通过统一的接口抽象屏蔽各家差异。

### 2.1 核心抽象设计

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import AsyncIterator
import httpx


@dataclass
class LLMMessage:
    role: str
    content: str


@dataclass
class LLMResponse:
    content: str
    model: str
    usage: dict = field(default_factory=dict)
    finish_reason: str = ""


@dataclass
class LLMStreamChunk:
    delta: str
    finish_reason: str | None = None


class BaseLLMAdapter(ABC):
    @abstractmethod
    def build_headers(self, api_key: str) -> dict:
        ...

    @abstractmethod
    def build_request_body(
        self, messages: list[LLMMessage], model: str, **kwargs
    ) -> dict:
        ...

    @abstractmethod
    async def parse_response(self, resp: httpx.Response) -> LLMResponse:
        ...

    @abstractmethod
    async def parse_stream(self, resp: httpx.Response) -> AsyncIterator[LLMStreamChunk]:
        ...
```

### 2.2 OpenAI 适配器实现

```python
import json


class OpenAIAdapter(BaseLLMAdapter):
    API_BASE = "https://api.openai.com/v1"

    def build_headers(self, api_key: str) -> dict:
        return {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    def build_request_body(
        self, messages: list[LLMMessage], model: str, **kwargs
    ) -> dict:
        return {
            "model": model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": kwargs.get("stream", False),
            "temperature": kwargs.get("temperature", 0.7),
            "max_tokens": kwargs.get("max_tokens", 4096),
        }

    async def parse_response(self, resp: httpx.Response) -> LLMResponse:
        data = resp.json()
        choice = data["choices"][0]
        return LLMResponse(
            content=choice["message"]["content"],
            model=data["model"],
            usage=data.get("usage", {}),
            finish_reason=choice.get("finish_reason", ""),
        )

    async def parse_stream(self, resp: httpx.Response) -> AsyncIterator[LLMStreamChunk]:
        async for line in resp.aiter_lines():
            if not line.startswith("data: "):
                continue
            payload = line[6:]
            if payload.strip() == "[DONE]":
                return
            chunk = json.loads(payload)
            delta = chunk["choices"][0]["delta"]
            yield LLMStreamChunk(
                delta=delta.get("content", ""),
                finish_reason=chunk["choices"][0].get("finish_reason"),
            )
```

### 2.3 Anthropic 适配器实现

```python
class AnthropicAdapter(BaseLLMAdapter):
    API_BASE = "https://api.anthropic.com/v1"

    def build_headers(self, api_key: str) -> dict:
        return {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }

    def build_request_body(
        self, messages: list[LLMMessage], model: str, **kwargs
    ) -> dict:
        system_msg = ""
        user_messages = []
        for m in messages:
            if m.role == "system":
                system_msg = m.content
            else:
                user_messages.append({"role": m.role, "content": m.content})

        body: dict = {
            "model": model,
            "messages": user_messages,
            "stream": kwargs.get("stream", False),
            "temperature": kwargs.get("temperature", 0.7),
            "max_tokens": kwargs.get("max_tokens", 4096),
        }
        if system_msg:
            body["system"] = system_msg
        return body

    async def parse_response(self, resp: httpx.Response) -> LLMResponse:
        data = resp.json()
        content = "".join(
            block["text"] for block in data["content"] if block["type"] == "text"
        )
        return LLMResponse(
            content=content,
            model=data["model"],
            usage=data.get("usage", {}),
            finish_reason=data.get("stop_reason", ""),
        )

    async def parse_stream(self, resp: httpx.Response) -> AsyncIterator[LLMStreamChunk]:
        async for line in resp.aiter_lines():
            if not line.startswith("data: "):
                continue
            event = json.loads(line[6:])
            if event["type"] == "content_block_delta":
                yield LLMStreamChunk(delta=event["delta"].get("text", ""))
            elif event["type"] == "message_stop":
                yield LLMStreamChunk(delta="", finish_reason="stop")
                return
```

### 2.4 统一 LLMClient

```python
class LLMClient:
    def __init__(self, adapter: BaseLLMAdapter, api_key: str):
        self.adapter = adapter
        self.api_key = api_key
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0))

    async def chat(
        self, messages: list[LLMMessage], model: str, **kwargs
    ) -> LLMResponse:
        headers = self.adapter.build_headers(self.api_key)
        body = self.adapter.build_request_body(messages, model, **kwargs)
        url = f"{self.adapter.API_BASE}/chat/completions"
        resp = await self._client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        return await self.adapter.parse_response(resp)

    async def chat_stream(
        self, messages: list[LLMMessage], model: str, **kwargs
    ) -> AsyncIterator[LLMStreamChunk]:
        kwargs["stream"] = True
        headers = self.adapter.build_headers(self.api_key)
        body = self.adapter.build_request_body(messages, model, **kwargs)
        url = f"{self.adapter.API_BASE}/chat/completions"
        async with self._client.stream("POST", url, json=body, headers=headers) as resp:
            resp.raise_for_status()
            async for chunk in self.adapter.parse_stream(resp):
                yield chunk
```

使用方式完全统一：

```python
client = LLMClient(OpenAIAdapter(), api_key="sk-xxx")
# 切换到 Anthropic 只需替换适配器
# client = LLMClient(AnthropicAdapter(), api_key="sk-ant-xxx")

resp = await client.chat(
    messages=[LLMMessage(role="user", content="解释量子纠缠")],
    model="gpt-4o",
)
print(resp.content)
```

---

## 3. Fallback 策略

生产环境中，单一模型的可用性不足以保障服务质量。Fallback 策略的核心目标是在主模型不可用时，自动切换到备选模型，最大限度保证用户请求被成功处理。

### 3.1 策略分类

| 策略 | 触发条件 | 适用场景 |
|------|----------|----------|
| **错误触发** | 主模型返回 5xx / 超时 | 基础容错 |
| **延迟触发** | 响应时间超过阈值 | 实时对话场景 |
| **成本路由** | 按 Token 价格选择模型 | 批量处理、成本敏感场景 |
| **配额触发** | 主模型 Rate Limit 耗尽 | 高并发场景 |

### 3.2 实现：错误触发 Fallback

```python
import asyncio
from enum import Enum


class ModelTier(Enum):
    PRIMARY = "primary"
    SECONDARY = "secondary"
    TERTIARY = "tertiary"


@dataclass
class ModelConfig:
    adapter: BaseLLMAdapter
    api_key: str
    model: str
    tier: ModelTier
    max_latency_ms: float = 10000


class FallbackLLMClient:
    def __init__(self, models: list[ModelConfig]):
        self.models = sorted(models, key=lambda m: m.tier.value)
        self._clients = [
            LLMClient(m.adapter, m.api_key) for m in self.models
        ]

    async def chat(
        self, messages: list[LLMMessage], **kwargs
    ) -> LLMResponse:
        last_error = None
        for client, config in zip(self._clients, self.models):
            try:
                response = await asyncio.wait_for(
                    client.chat(messages, config.model, **kwargs),
                    timeout=config.max_latency_ms / 1000,
                )
                return response
            except (httpx.HTTPStatusError, httpx.TimeoutException, asyncio.TimeoutError) as e:
                last_error = e
                continue
        raise RuntimeError(
            f"所有模型均不可用，最后一个错误: {last_error}"
        )
```

### 3.3 成本感知路由

```python
@dataclass
class PricingConfig:
    input_per_1k: float
    output_per_1k: float


PRICING_TABLE = {
    "gpt-4o": PricingConfig(0.0025, 0.01),
    "claude-sonnet-4-20250514": PricingConfig(0.003, 0.015),
    "deepseek-chat": PricingConfig(0.00014, 0.00028),
    "qwen-max": PricingConfig(0.002, 0.006),
}


class CostAwareRouter:
    def __init__(self, clients: dict[str, LLMClient]):
        self.clients = clients

    def estimate_cost(self, model: str, input_tokens: int, output_tokens: int) -> float:
        pricing = PRICING_TABLE.get(model)
        if not pricing:
            return float("inf")
        return (input_tokens / 1000 * pricing.input_per_1k
                + output_tokens / 1000 * pricing.output_per_1k)

    async def chat_cheapest(
        self, messages: list[LLMMessage], estimated_tokens: int = 500, **kwargs
    ) -> LLMResponse:
        candidates = []
        for model, client in self.clients.items():
            cost = self.estimate_cost(model, estimated_tokens, estimated_tokens * 2)
            candidates.append((cost, model, client))

        candidates.sort(key=lambda x: x[0])

        for cost, model, client in candidates:
            try:
                return await client.chat(messages, model=model, **kwargs)
            except Exception:
                continue
        raise RuntimeError("所有模型均调用失败")
```

---

## 4. 流式输出（Streaming）

流式输出是 LLM 应用的核心体验之一——用户不需要等待完整响应生成完毕，而是逐字看到模型输出。这需要后端正确处理 SSE（Server-Sent Events）协议，并在前端配合渲染。

### 4.1 SSE 协议要点

SSE 是一种基于 HTTP 的单向推送协议，其核心特征：

- **基于 HTTP/1.1 长连接**：服务端通过 `Content-Type: text/event-stream` 声明
- **事件格式**：每条事件以 `data:` 前缀，多个 `\n\n` 分隔
- **结束标识**：OpenAI 以 `data: [DONE]` 标识流结束
- **自动重连**：浏览器 `EventSource` API 内置断线重连机制

### 4.2 FastAPI 流式端点

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import json

app = FastAPI()


@app.post("/v1/chat/completions")
async def chat_completions(request: ChatRequest):
    if request.stream:
        return StreamingResponse(
            stream_chat_response(request),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    response = await llm_client.chat(
        messages=request.messages,
        model=request.model,
        temperature=request.temperature,
        max_tokens=request.max_tokens,
    )
    return {"content": response.content, "usage": response.usage}


async def stream_chat_response(request: ChatRequest):
    try:
        async for chunk in llm_client.chat_stream(
            messages=request.messages,
            model=request.model,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        ):
            event_data = {
                "id": "chatcmpl-stream",
                "object": "chat.completion.chunk",
                "choices": [{
                    "index": 0,
                    "delta": {"content": chunk.delta},
                    "finish_reason": chunk.finish_reason,
                }],
            }
            yield f"data: {json.dumps(event_data, ensure_ascii=False)}\n\n"

            if chunk.finish_reason:
                break

        yield "data: [DONE]\n\n"
    except Exception as e:
        error_data = {
            "error": {
                "type": "server_error",
                "message": str(e),
            }
        }
        yield f"data: {json.dumps(error_data)}\n\n"
```

### 4.3 前端 EventSource 接入

```html
<div id="output" style="font-family: monospace; white-space: pre-wrap;"></div>

<script>
async function streamChat(messages) {
  const output = document.getElementById('output');
  output.textContent = '';

  const resp = await fetch('/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: messages,
      stream: true,
    }),
  });

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);
      if (payload === '[DONE]') return;

      try {
        const chunk = JSON.parse(payload);
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          output.textContent += content;
        }
      } catch (e) {
        // skip malformed JSON
      }
    }
  }
}
</script>
```

> **性能提示**：在 Nginx 反向代理场景下，必须禁用响应缓冲（`X-Accel-Buffering: no` 和 `proxy_buffering off`），否则 SSE 数据会被缓冲，导致前端感知延迟显著增加。

---

## 5. 错误处理与容错

LLM API 的错误处理比传统 REST API 更复杂。除了常规的网络错误和 5xx 错误外，还必须处理 Token 速率限制、上下文超长、模型过载等特定错误。

### 5.1 指数退避重试

```python
import random
import time
from functools import wraps


def retry_with_backoff(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    retryable_status: tuple = (429, 500, 502, 503),
):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except httpx.HTTPStatusError as e:
                    last_exception = e
                    status = e.response.status_code

                    if status == 429:
                        retry_after = e.response.headers.get("retry-after")
                        if retry_after:
                            delay = float(retry_after)
                        else:
                            delay = min(
                                base_delay * (2 ** attempt) + random.uniform(0, 1),
                                max_delay,
                            )
                    elif status in retryable_status:
                        delay = min(
                            base_delay * (2 ** attempt) + random.uniform(0, 1),
                            max_delay,
                        )
                    else:
                        raise

                    await asyncio.sleep(delay)

            raise last_exception
        return wrapper
    return decorator
```

### 5.2 断路器模式（Circuit Breaker）

断路器模式在 LLM API 场景中尤为重要——当某个模型持续返回错误时，继续尝试只会浪费时间并可能加剧供应商负载。

```python
import time
from enum import Enum


class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
        success_threshold: int = 3,
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.success_threshold = success_threshold
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time = 0.0

    def record_success(self):
        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1
            if self.success_count >= self.success_threshold:
                self.state = CircuitState.CLOSED
                self.failure_count = 0
                self.success_count = 0
        else:
            self.failure_count = 0

    def record_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.monotonic()
        if self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN

    @property
    def allow_request(self) -> bool:
        if self.state == CircuitState.CLOSED:
            return True
        if self.state == CircuitState.OPEN:
            elapsed = time.monotonic() - self.last_failure_time
            if elapsed >= self.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
                self.success_count = 0
                return True
            return False
        return True


class ResilientLLMClient:
    def __init__(self, models: list[ModelConfig]):
        self.circuit_breakers = {
            m.model: CircuitBreaker() for m in models
        }
        self.fallback_client = FallbackLLMClient(models)

    async def chat(self, messages: list[LLMMessage], **kwargs) -> LLMResponse:
        for model_config in self.fallback_client.models:
            cb = self.circuit_breakers[model_config.model]
            if not cb.allow_request:
                continue
            try:
                client = LLMClient(model_config.adapter, model_config.api_key)
                response = await asyncio.wait_for(
                    client.chat(messages, model_config.model, **kwargs),
                    timeout=model_config.max_latency_ms / 1000,
                )
                cb.record_success()
                return response
            except Exception:
                cb.record_failure()
                continue

        raise RuntimeError("所有模型均不可用，断路器已全部打开")
```

### 5.3 超时管理

LLM API 调用涉及多层超时，需要分别设置：

```python
TIMEOUT_CONFIG = httpx.Timeout(
    connect=5.0,
    read=120.0,
    write=10.0,
    pool=5.0,
)

class TimeoutConfig:
    def __init__(self):
        self.total_timeout = 120.0
        self.first_token_timeout = 10.0
        self.connect_timeout = 5.0
```

在 FastAPI 端，还需配合 Uvicorn 的 keep-alive 配置，确保长连接不被中间件提前关闭：

```bash
uvicorn app:app --timeout-keep-alive 150
```

---

## 6. 异步并发调用

在需要同时调用多个模型（如 A/B 测试、多模型投票、并行对比）的场景中，`asyncio` 的并发能力至关重要。

### 6.1 基础并行调用

```python
async def parallel_model_calls(
    messages: list[LLMMessage],
    clients: dict[str, LLMClient],
    **kwargs,
) -> dict[str, LLMResponse]:
    tasks = {
        name: asyncio.create_task(
            client.chat(messages, model=name, **kwargs)
        )
        for name, client in clients.items()
    }

    results = {}
    for name, task in tasks.items():
        try:
            results[name] = await task
        except Exception as e:
            results[name] = e

    return results
```

### 6.2 基于信号量的并发控制

并发调用数不受限会导致两个问题：**超出自身连接池容量**和**触发供应商速率限制**。使用 `asyncio.Semaphore` 控制并发度：

```python
class ConcurrentLLMRouter:
    def __init__(self, max_concurrent: int = 10):
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self._client = httpx.AsyncClient(
            limits=httpx.Limits(
                max_connections=50,
                max_keepalive_connections=20,
                keepalive_expiry=30,
            ),
        )

    async def _call_with_semaphore(
        self, client: LLMClient, model: str, messages: list[LLMMessage], **kwargs
    ) -> LLMResponse:
        async with self.semaphore:
            return await client.chat(messages, model=model, **kwargs)

    async def batch_call(
        self,
        messages_list: list[list[LLMMessage]],
        client: LLMClient,
        model: str,
        **kwargs,
    ) -> list[LLMResponse | Exception]:
        tasks = [
            self._call_with_semaphore(client, model, msgs, **kwargs)
            for msgs in messages_list
        ]
        return await asyncio.gather(*tasks, return_exceptions=True)
```

### 6.3 连接池管理

对于高并发场景，`httpx.AsyncClient` 的连接池配置直接影响性能：

```python
def create_optimized_client() -> httpx.AsyncClient:
    transport = httpx.AsyncHTTPTransport(
        retries=2,
        limits=httpx.Limits(
            max_connections=100,
            max_keepalive_connections=30,
            keepalive_expiry=30,
        ),
    )
    return httpx.AsyncClient(
        transport=transport,
        timeout=httpx.Timeout(60.0, connect=5.0),
        http2=True,
    )
```

> **实践建议**：生产环境建议为每个供应商维护独立的 `httpx.AsyncClient` 实例，避免不同供应商的连接池互相干扰。HTTP/2 支持多路复用，能显著减少连接建立开销。

---

## 7. 安全视角

LLM API 调用涉及敏感数据传输和费用消耗，安全设计是工程化的必要环节。

### 7.1 API Key 管理

绝对禁止在代码中硬编码 API Key。推荐方案：

```python
from pydantic_settings import BaseSettings


class LLMSettings(BaseSettings):
    openai_api_key: str
    anthropic_api_key: str
    deepseek_api_key: str

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }
```

在生产环境，建议使用 Vault 或云服务商的密钥管理服务（如 AWS Secrets Manager、阿里云 KMS），通过环境变量注入，避免密钥出现在版本控制系统中。

### 7.2 请求签名与审计日志

对于内部 API 网关，建议对所有 LLM 请求进行审计日志记录：

```python
import hashlib
import logging
from datetime import datetime, timezone

audit_logger = logging.getLogger("llm.audit")


async def audit_log_middleware(request: ChatRequest, response: LLMResponse, model: str):
    log_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "model": model,
        "input_tokens": response.usage.get("prompt_tokens", 0),
        "output_tokens": response.usage.get("completion_tokens", 0),
        "message_hash": hashlib.sha256(
            "".join(m.content for m in request.messages).encode()
        ).hexdigest()[:16],
        "finish_reason": response.finish_reason,
        "latency_ms": 0,
    }
    audit_logger.info("LLM API call", extra=log_entry)
```

### 7.3 PII 过滤

在将用户输入发送给 LLM API 之前，可能需要过滤或脱敏个人身份信息（PII），尤其是涉及欧盟 GDPR 或中国《个人信息保护法》的场景：

```python
import re


class PIIFilter:
    PATTERNS = {
        "email": re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"),
        "phone_cn": re.compile(r"1[3-9]\d{9}"),
        "id_card_cn": re.compile(r"\d{17}[\dXx]"),
        "bank_card": re.compile(r"\d{16,19}"),
    }

    def filter(self, text: str) -> tuple[str, list[str]]:
        found_pii = []
        filtered = text
        for pii_type, pattern in self.PATTERNS.items():
            matches = pattern.findall(filtered)
            if matches:
                found_pii.extend([f"{pii_type}:{m}" for m in matches])
                filtered = pattern.sub(f"[{pii_type.upper()}]", filtered)
        return filtered, found_pii


class SanitizedLLMClient:
    def __init__(self, client: LLMClient):
        self.client = client
        self.pii_filter = PIIFilter()

    async def chat(self, messages: list[LLMMessage], model: str, **kwargs) -> LLMResponse:
        sanitized_messages = []
        all_pii = []
        for msg in messages:
            filtered, pii = self.pii_filter.filter(msg.content)
            sanitized_messages.append(LLMMessage(role=msg.role, content=filtered))
            all_pii.extend(pii)

        if all_pii:
            logging.warning(f"PII detected and redacted: {all_pii}")

        return await self.client.chat(sanitized_messages, model=model, **kwargs)
```

---

## 8. 延伸阅读

- [OpenAI API 文档](https://platform.openai.com/docs/api-reference) — OpenAI 官方 API 参考
- [Anthropic API 文档](https://docs.anthropic.com/en/api) — Claude 系列模型 API 文档
- [DeepSeek API 文档](https://platform.deepseek.com/api-docs) — DeepSeek 开放平台 API
- [DashScope API 文档](https://help.aliyun.com/zh/model-studio/developer-reference/api-reference) — 通义千问模型服务 API
- [Server-Sent Events 规范 (W3C)](https://html.spec.whatwg.org/multipage/server-sent-events.html) — SSE 协议标准
- [httpx 文档](https://www.python-httpx.org/) — Python 异步 HTTP 客户端
- [Martin Fowler - Circuit Breaker](https://martinfowler.com/bliki/CircuitBreaker.html) — 断路器模式经典解读
- [OpenAI Cookbook - Rate Limiting](https://cookbook.openai.com/examples/how_to_handle_rate_limits) — 速率限制处理最佳实践

---

> **总结**：LLM API 工程化的核心挑战在于**异构性**——不同供应商的 API 规范、错误处理方式、计费模型各不相同。通过适配器模式统一接口、通过断路器和 Fallback 策略保障可用性、通过 SSE 流式协议优化用户体验，才能构建出真正可用的生产级 AI 应用。这些方案不是理论设计，而是在面对真实流量时反复验证后的工程实践。
