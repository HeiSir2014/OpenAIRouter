# OpenRouter DeepSeek 配置指南

## 配置概述

已成功配置 OpenRouter 作为默认的 OpenAI 提供商，使用 DeepSeek Chat v3.1 免费模型。

## 环境变量配置

在 `.env` 文件中添加以下配置：

```bash
# API Providers - Using OpenRouter with DeepSeek as default
OPENAI_API_KEY=sk-your-openrouter-key
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_DEFAULT_MODEL=deepseek/deepseek-chat-v3.1:free
```

## 支持的模型

### DeepSeek 模型 (通过 OpenRouter)
- `deepseek/deepseek-chat-v3.1:free` - 免费版本 (默认)
- `deepseek/deepseek-chat` - 付费版本

### OpenRouter 上的其他模型
- `openai/gpt-4o`
- `openai/gpt-4o-mini`
- `anthropic/claude-3.5-sonnet`

### 原生 OpenAI 模型 (如果使用原生 API)
- `gpt-4`
- `gpt-4-turbo`
- `gpt-4-turbo-preview`
- `gpt-3.5-turbo`
- `gpt-3.5-turbo-16k`

## 配置特性

### ✅ 自动 Base URL 切换
- 当设置 `OPENAI_BASE_URL` 时，自动使用 OpenRouter API
- 未设置时，默认使用 OpenAI 官方 API

### ✅ 默认模型配置
- 通过 `OPENAI_DEFAULT_MODEL` 环境变量设置默认模型
- 支持 OpenRouter 的模型命名格式 (如 `deepseek/deepseek-chat-v3.1:free`)

### ✅ 模型路由
- 自动将模型请求路由到正确的提供商
- 支持模糊匹配 (如包含 `gpt` 的模型自动路由到 OpenAI 提供商)

### ✅ 兼容性
- 完全兼容 OpenAI API 格式
- 透明代理，客户端无需修改

## API 使用示例

### 使用默认模型 (DeepSeek)

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Hello, how are you?"
      }
    ]
  }'
```

### 指定特定模型

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "deepseek/deepseek-chat-v3.1:free",
    "messages": [
      {
        "role": "user",
        "content": "Explain quantum computing"
      }
    ]
  }'
```

## 验证配置

### 1. 检查可用模型

```bash
curl http://localhost:3000/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### 2. 健康检查

```bash
curl http://localhost:3000/health
```

### 3. 提供商状态

```bash
curl http://localhost:3000/health/providers
```

## 配置文件修改

### 提供商配置 (`src/config/providers.config.ts`)

```typescript
const openaiConfig: ProviderConfig = {
  name: 'openai',
  displayName: 'OpenAI',
  baseUrl: process.env['OPENAI_BASE_URL'] || 'https://api.openai.com/v1',
  apiKey: process.env['OPENAI_API_KEY'] || '',
  models: [
    // Support for OpenRouter models
    'deepseek/deepseek-chat-v3.1:free',
    'deepseek/deepseek-chat',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'anthropic/claude-3.5-sonnet',
    // Original OpenAI models
    'gpt-4',
    'gpt-4-turbo',
    // ...
  ],
  // ...
};
```

### 默认模型函数

```typescript
export const getDefaultModel = (): string => {
  const envDefault = process.env['OPENAI_DEFAULT_MODEL'];
  if (envDefault) {
    return envDefault;
  }
  
  // Fallback to first available model from active providers
  const availableModels = getAllAvailableModels();
  return availableModels.length > 0 ? availableModels[0] : 'gpt-3.5-turbo';
};
```

## 成本优势

### DeepSeek Chat v3.1 免费版本
- ✅ **完全免费** - 无需付费
- ✅ **高性能** - 接近 GPT-4 级别的能力
- ✅ **无限制** - 通过 OpenRouter 提供稳定服务
- ✅ **中文友好** - 对中文理解和生成优秀

### 与其他模型对比
| 模型 | 成本 | 性能 | 中文支持 |
|------|------|------|----------|
| DeepSeek Chat v3.1 Free | 免费 | 高 | 优秀 |
| GPT-4o | $5/1M tokens | 最高 | 良好 |
| GPT-3.5 Turbo | $0.5/1M tokens | 中等 | 良好 |
| Claude 3.5 Sonnet | $3/1M tokens | 高 | 良好 |

## 故障排除

### 常见问题

1. **API Key 无效**
   - 确认 OpenRouter API Key 格式正确
   - 检查 API Key 是否有效且未过期

2. **模型不可用**
   - 确认模型名称正确 (`deepseek/deepseek-chat-v3.1:free`)
   - 检查 OpenRouter 上该模型是否可用

3. **连接失败**
   - 确认网络连接正常
   - 检查 `OPENAI_BASE_URL` 设置是否正确

### 调试命令

```bash
# 检查环境变量
node -e "console.log(process.env.OPENAI_API_KEY?.substring(0,20) + '...')"
node -e "console.log(process.env.OPENAI_BASE_URL)"
node -e "console.log(process.env.OPENAI_DEFAULT_MODEL)"

# 测试配置
npm run build && node -e "
import('./dist/config/providers.config.js').then(config => {
  console.log('Default model:', config.getDefaultModel());
  console.log('Available models:', config.getAllAvailableModels());
});
"
```

## 总结

✅ **配置完成**: OpenRouter DeepSeek 已成功配置为默认提供商  
✅ **测试通过**: 应用程序启动和 API 调用正常  
✅ **成本优化**: 使用免费的高性能模型  
✅ **兼容性**: 完全兼容 OpenAI API 标准  

现在您可以使用免费的 DeepSeek Chat v3.1 模型进行 AI 对话，享受高质量的中文和英文理解能力！
