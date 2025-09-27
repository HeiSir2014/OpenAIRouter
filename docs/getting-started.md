# OpenAI Router - 快速开始指南

## 环境要求

- Node.js 18+
- npm 或 yarn
- 至少一个 AI 提供商的 API Key (OpenAI 或 Anthropic)

## 安装步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 环境配置

复制环境变量模板：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置必要的环境变量：

```env
# 必须配置
NODE_ENV=development
PORT=3000
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-must-be-at-least-32-characters-long

# 至少配置一个提供商
OPENAI_API_KEY=sk-your-openai-api-key-here
# 或者
ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key-here
```

### 3. 启动服务

开发模式：
```bash
npm run dev
```

生产模式：
```bash
npm run build
npm start
```

## 使用指南

### 1. 用户注册

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "name": "Test User"
  }'
```

### 2. 创建 API Key

使用注册时返回的 JWT token：

```bash
curl -X POST http://localhost:3000/auth/api-keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "My API Key"
  }'
```

### 3. 使用 Chat Completions API

使用创建的 API Key：

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [
      {"role": "user", "content": "Hello, world!"}
    ]
  }'
```

### 4. 查看可用模型

```bash
curl -X GET http://localhost:3000/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## API 端点

### 认证相关
- `POST /auth/register` - 用户注册
- `POST /auth/login` - 用户登录
- `GET /auth/profile` - 获取用户信息
- `POST /auth/api-keys` - 创建 API Key
- `GET /auth/api-keys` - 列出 API Keys

### OpenAI 兼容 API
- `POST /v1/chat/completions` - 聊天完成
- `GET /v1/models` - 获取模型列表
- `GET /v1/health` - 健康检查

### 系统监控
- `GET /health` - 基础健康检查
- `GET /health/detailed` - 详细健康检查

## 功能特性

### ✅ 已实现 (第一阶段)
- OpenAI API 兼容接口
- 用户注册和认证
- API Key 管理
- 多提供商支持 (OpenAI, Anthropic)
- Function Calling 透传
- 使用统计和计费
- 速率限制
- 请求日志
- 健康检查

### 🚧 计划中 (第二阶段)
- 流式响应 (Server-Sent Events)
- Redis 缓存集成
- 高级速率限制
- 性能监控
- 管理面板

## 开发

### 运行测试

```bash
npm test
```

### 代码检查

```bash
npm run lint
npm run format
```

### 构建

```bash
npm run build
```

## 故障排除

### 常见问题

1. **数据库连接失败**
   - 检查 `DB_PATH` 环境变量
   - 确保数据库目录存在且有写权限

2. **提供商 API 调用失败**
   - 检查 API Key 是否正确
   - 确认 API Key 有足够的配额
   - 检查网络连接

3. **JWT Token 错误**
   - 确保 `JWT_SECRET` 至少 32 字符
   - 检查 token 是否过期

### 日志查看

开发环境下，日志会输出到控制台。生产环境可以配置日志文件：

```env
LOG_FILE=./logs/app.log
```

### 数据库管理

查看数据库统计：
```bash
curl http://localhost:3000/health/database
```

## 生产部署

### 环境变量

生产环境必须配置：
- `NODE_ENV=production`
- 强密码的 `JWT_SECRET`
- 有效的提供商 API Keys
- 适当的 `CORS_ORIGINS`

### 安全建议

1. 使用 HTTPS
2. 配置防火墙
3. 定期更新依赖
4. 监控日志和错误
5. 备份数据库

### Docker 部署 (可选)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/app.js"]
```

## 支持

如有问题，请查看：
- [开发文档](./development-plan.md)
- [API 文档](./api-reference.md)
- GitHub Issues

---

**注意**: 这是第一阶段的实现，专注于核心功能。第二阶段将添加流式响应和 Redis 缓存等高级功能。
