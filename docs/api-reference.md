# OpenAI Router API 参考

## 概述

OpenAI Router 提供与 OpenAI API 完全兼容的接口，同时支持多个 AI 提供商。所有请求都需要有效的 API Key 进行身份验证。

## 基础信息

- **Base URL**: `http://localhost:3000`
- **认证方式**: Bearer Token (API Key)
- **内容类型**: `application/json`
- **字符编码**: UTF-8

## 认证

### 获取 API Key

1. 注册用户账户
2. 登录获取 JWT Token
3. 使用 JWT Token 创建 API Key
4. 使用 API Key 调用 AI 接口

```bash
# 1. 注册
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123", "name": "User"}'

# 2. 创建 API Key
curl -X POST http://localhost:3000/auth/api-keys \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "My API Key"}'
```

## OpenAI 兼容 API

### Chat Completions

创建聊天完成，支持 Function Calling 和多模态输入。

**端点**: `POST /v1/chat/completions`

**请求参数**:

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `messages` | array | 是 | 对话消息数组 |
| `model` | string | 否 | 模型名称，默认 gpt-3.5-turbo |
| `max_tokens` | integer | 否 | 最大生成 token 数 |
| `temperature` | number | 否 | 0-2，控制随机性 |
| `top_p` | number | 否 | 0-1，核采样参数 |
| `tools` | array | 否 | 可用的工具/函数列表 |
| `tool_choice` | string/object | 否 | 工具选择策略 |

**示例请求**:

```json
{
  "model": "gpt-3.5-turbo",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ],
  "max_tokens": 150,
  "temperature": 0.7
}
```

**示例响应**:

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gpt-3.5-turbo",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 10,
    "total_tokens": 30
  }
}
```

### Function Calling

支持 OpenAI 的 Function Calling 功能，可以透传到支持的提供商。

**示例请求**:

```json
{
  "model": "gpt-3.5-turbo",
  "messages": [
    {"role": "user", "content": "What's the weather like in Beijing?"}
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get weather information for a city",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {"type": "string", "description": "City name"}
          },
          "required": ["city"]
        }
      }
    }
  ],
  "tool_choice": "auto"
}
```

### 模型列表

获取所有可用的模型。

**端点**: `GET /v1/models`

**示例响应**:

```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-3.5-turbo",
      "object": "model",
      "created": 1677610602,
      "owned_by": "openai"
    },
    {
      "id": "claude-3-sonnet-20240229",
      "object": "model",
      "created": 1677610602,
      "owned_by": "anthropic"
    }
  ]
}
```

### 模型信息

获取特定模型的详细信息。

**端点**: `GET /v1/models/{model_id}`

**示例响应**:

```json
{
  "id": "gpt-3.5-turbo",
  "object": "model",
  "created": 1677610602,
  "owned_by": "openai",
  "context_length": 4096,
  "supports_functions": true,
  "supports_vision": false
}
```

## 用户管理 API

### 用户注册

**端点**: `POST /auth/register`

**请求参数**:

```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "User Name"
}
```

**响应**:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-123",
      "email": "user@example.com",
      "name": "User Name",
      "plan": "free",
      "credits": 100
    },
    "token": "jwt-token",
    "expiresIn": "7d"
  }
}
```

### 用户登录

**端点**: `POST /auth/login`

**请求参数**:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

### API Key 管理

#### 创建 API Key

**端点**: `POST /auth/api-keys`
**认证**: 需要 JWT Token

**请求参数**:

```json
{
  "name": "My API Key",
  "permissions": ["chat"],
  "rateLimitRpm": 60,
  "rateLimitTpm": 10000
}
```

**响应**:

```json
{
  "success": true,
  "data": {
    "id": "key-123",
    "name": "My API Key",
    "key": "oar_1234567890abcdef",
    "permissions": ["chat"],
    "rateLimitRpm": 60,
    "rateLimitTpm": 10000,
    "isActive": true,
    "createdAt": "2023-01-01T00:00:00.000Z"
  }
}
```

#### 列出 API Keys

**端点**: `GET /auth/api-keys`
**认证**: 需要 JWT Token

#### 删除 API Key

**端点**: `DELETE /auth/api-keys/{key_id}`
**认证**: 需要 JWT Token

## 使用统计 API

### 获取使用统计

**端点**: `GET /v1/usage`
**认证**: 需要 API Key

**查询参数**:
- `days`: 统计天数 (1-365，默认 30)
- `apiKeyId`: 特定 API Key 的统计

**响应**:

```json
{
  "success": true,
  "data": {
    "totalRequests": 150,
    "totalTokens": 45000,
    "totalCost": 0.67,
    "averageLatency": 1200,
    "successRate": 98.5,
    "topModels": [
      {"model": "gpt-3.5-turbo", "requests": 100, "tokens": 30000},
      {"model": "claude-3-sonnet", "requests": 50, "tokens": 15000}
    ],
    "dailyUsage": [
      {"date": "2023-01-01", "requests": 10, "tokens": 3000, "cost": 0.045}
    ]
  }
}
```

## 健康检查 API

### 基础健康检查

**端点**: `GET /health`

**响应**:

```json
{
  "status": "healthy",
  "timestamp": "2023-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "environment": "production",
  "uptime": 86400,
  "responseTime": "15ms",
  "database": {
    "status": "healthy",
    "latency": "5ms"
  }
}
```

### 详细健康检查

**端点**: `GET /health/detailed`

包含提供商状态、系统资源使用等详细信息。

## 错误处理

所有错误响应都遵循统一格式：

```json
{
  "error": {
    "message": "Error description",
    "type": "error_type",
    "code": "error_code",
    "details": {}
  },
  "timestamp": "2023-01-01T00:00:00.000Z",
  "path": "/v1/chat/completions",
  "method": "POST"
}
```

### 常见错误码

| HTTP状态码 | 错误类型 | 描述 |
|------------|----------|------|
| 400 | validation_error | 请求参数验证失败 |
| 401 | authentication_error | 身份验证失败 |
| 403 | authorization_error | 权限不足 |
| 404 | not_found_error | 资源不存在 |
| 429 | rate_limit_error | 速率限制 |
| 500 | internal_error | 服务器内部错误 |
| 502 | provider_error | 提供商 API 错误 |

## 速率限制

每个 API Key 都有独立的速率限制：

- **RPM**: 每分钟请求数限制
- **TPM**: 每分钟 Token 数限制

限制信息通过响应头返回：

```
X-RateLimit-Limit-RPM: 60
X-RateLimit-Limit-TPM: 10000
X-RateLimit-Remaining-RPM: 45
X-RateLimit-Remaining-TPM: 8500
X-RateLimit-Reset: 2023-01-01T00:01:00.000Z
```

## 支持的模型

### OpenAI 模型
- `gpt-4`
- `gpt-4-turbo`
- `gpt-3.5-turbo`
- `gpt-3.5-turbo-16k`

### Anthropic 模型
- `claude-3-opus-20240229`
- `claude-3-sonnet-20240229`
- `claude-3-haiku-20240307`
- `claude-2.1`
- `claude-2.0`

## SDK 和集成

OpenAI Router 完全兼容 OpenAI 的官方 SDK，只需修改 base URL：

### Python

```python
from openai import OpenAI

client = OpenAI(
    api_key="your-api-key",
    base_url="http://localhost:3000/v1"
)

response = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### Node.js

```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: 'your-api-key',
  baseURL: 'http://localhost:3000/v1'
});

const response = await openai.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

## 最佳实践

1. **错误处理**: 始终处理 API 错误和网络异常
2. **速率限制**: 监控响应头中的速率限制信息
3. **成本控制**: 设置合理的 `max_tokens` 限制
4. **安全**: 妥善保管 API Key，不要在客户端暴露
5. **监控**: 定期检查使用统计和成本

---

更多信息请参考 [快速开始指南](./getting-started.md) 和 [开发文档](./development-plan.md)。
