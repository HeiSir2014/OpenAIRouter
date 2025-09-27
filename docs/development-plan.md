# OpenAI Chat Router 开发方案

## 项目概述

实现一个 **OpenAI API 兼容的路由服务器**，核心功能：
- 透传用户请求到不同 AI 提供商（OpenAI、Anthropic、Google 等）
- API Key 鉴权和用户管理
- 请求/响应日志和使用统计
- 支持 Function Calling 透传
- 优先实现非流式响应

## 技术栈

- **后端**: Node.js + Express + TypeScript
- **数据库**: SQLite (第一阶段) → SQLite + Redis (第二阶段)
- **HTTP 客户端**: Axios
- **验证**: Zod
- **日志**: Winston
- **测试**: Jest + Supertest
- **代码规范**: ESLint + Prettier (Google Style)

## 第一阶段：基础 OpenAI Chat Router (SQLite)

### 阶段目标
- 实现完整的 OpenAI API 兼容接口
- 基础鉴权和用户管理
- SQLite 数据库存储
- 支持多提供商路由
- Function Calling 透传
- 非流式响应优先

### 项目结构

```
openai-router/
├── src/
│   ├── controllers/          # API 控制器
│   │   ├── auth.controller.ts
│   │   ├── chat.controller.ts
│   │   └── admin.controller.ts
│   ├── services/            # 业务逻辑
│   │   ├── auth.service.ts
│   │   ├── chat.service.ts
│   │   ├── provider.service.ts
│   │   └── usage.service.ts
│   ├── database/            # 数据库层 (简化版)
│   │   ├── connection.ts
│   │   ├── models/
│   │   │   ├── user.model.ts
│   │   │   ├── api-key.model.ts
│   │   │   └── usage.model.ts
│   │   └── migrations.ts
│   ├── providers/           # 提供商适配器
│   │   ├── base.provider.ts
│   │   ├── openai.provider.ts
│   │   ├── anthropic.provider.ts
│   │   └── factory.ts
│   ├── middleware/          # 中间件
│   │   ├── auth.middleware.ts
│   │   ├── validation.middleware.ts
│   │   ├── rate-limit.middleware.ts
│   │   └── error.middleware.ts
│   ├── types/              # 类型定义
│   │   ├── openai.types.ts
│   │   ├── auth.types.ts
│   │   └── provider.types.ts
│   ├── utils/              # 工具函数
│   │   ├── crypto.util.ts
│   │   ├── validation.util.ts
│   │   └── logger.util.ts
│   ├── config/             # 配置
│   │   ├── app.config.ts
│   │   └── providers.config.ts
│   ├── routes/             # 路由
│   │   ├── auth.routes.ts
│   │   ├── chat.routes.ts
│   │   └── admin.routes.ts
│   └── app.ts
├── database/
│   └── app.db              # SQLite 数据库文件
├── docs/                   # 文档
│   └── development-plan.md
├── tests/
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### 数据库设计

```sql
-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  plan TEXT DEFAULT 'free',
  credits REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- API Keys table
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  permissions TEXT DEFAULT '[]',
  rate_limit_rpm INTEGER DEFAULT 60,
  rate_limit_tpm INTEGER DEFAULT 10000,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Usage logs table
CREATE TABLE usage_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  api_key_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

-- Indexes
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_usage_logs_user_id ON usage_logs(user_id);
```

### API 端点设计

#### 核心 OpenAI 兼容端点
- `POST /v1/chat/completions` - 主要聊天完成端点
- `GET /v1/models` - 获取可用模型列表

#### 管理端点
- `POST /auth/register` - 用户注册
- `POST /auth/login` - 用户登录
- `GET /auth/profile` - 获取用户信息
- `POST /api-keys` - 创建 API Key
- `GET /api-keys` - 获取 API Key 列表
- `DELETE /api-keys/:id` - 删除 API Key
- `GET /usage` - 获取使用统计

### 第一阶段开发任务 (3-4 天)

1. **项目初始化** (0.5 天)
   - 创建项目结构
   - 配置 TypeScript、ESLint、Prettier
   - 设置基础依赖

2. **数据库层** (1 天)
   - SQLite 连接和初始化
   - 数据模型实现
   - 基础 CRUD 操作

3. **鉴权系统** (1 天)
   - 用户注册/登录
   - API Key 生成和验证
   - 鉴权中间件

4. **核心 API** (1.5 天)
   - OpenAI 提供商适配器
   - Chat Completions 端点
   - Function Calling 支持
   - 错误处理

## 第二阶段：集成 Redis 缓存层

### 阶段目标
- 集成 Redis 缓存系统
- 实现缓存策略和失效机制
- 添加速率限制缓存
- 性能优化和监控

### 升级架构

```
openai-router/
├── src/
│   ├── cache/              # 新增缓存层
│   │   ├── redis.client.ts
│   │   ├── cache.service.ts
│   │   └── strategies/
│   │       ├── user.cache.ts
│   │       ├── api-key.cache.ts
│   │       └── rate-limit.cache.ts
│   ├── database/
│   │   ├── repositories/   # 新增仓储层
│   │   │   ├── user.repository.ts
│   │   │   ├── api-key.repository.ts
│   │   │   └── usage.repository.ts
│   │   └── ... (existing)
│   └── ... (existing)
```

### 第二阶段开发任务 (2-3 天)

1. **Redis 集成** (1 天)
   - Redis 客户端配置
   - 缓存服务实现
   - 缓存策略设计

2. **性能优化** (1 天)
   - 仓储层重构
   - 缓存集成
   - 速率限制优化

3. **监控和完善** (1 天)
   - 日志系统完善
   - 性能监控
   - 测试覆盖

## Google 代码规范要求

### 命名规范
- **文件名**: kebab-case (例: `user.model.ts`)
- **类名**: PascalCase (例: `UserModel`)
- **方法/变量**: camelCase (例: `createUser`)
- **常量**: UPPER_SNAKE_CASE (例: `DEFAULT_RATE_LIMIT`)
- **接口**: PascalCase with 'I' prefix (例: `IUserRepository`)

### 代码格式
- **缩进**: 2 个空格，严禁使用 Tab
- **行长度**: 最大 100 字符
- **分号**: 必须使用分号结尾
- **引号**: 优先使用单引号

### 模块设计原则
- **单一职责**: 每个类/模块只负责一个功能
- **依赖注入**: 通过构造函数注入依赖
- **接口分离**: 定义清晰的接口边界
- **开闭原则**: 对扩展开放，对修改关闭

### 注释规范
- **类注释**: 使用 JSDoc 格式
- **方法注释**: 描述参数、返回值、异常
- **行内注释**: 使用简单英文，解释复杂逻辑

### 错误处理
- **统一错误格式**: 使用标准错误响应格式
- **错误分类**: 区分业务错误和系统错误
- **日志记录**: 记录详细的错误信息和堆栈

## 环境配置

### 开发环境变量
```env
# Server
NODE_ENV=development
PORT=3000

# Database
DB_PATH=./database/app.db

# JWT
JWT_SECRET=your-jwt-secret-key
JWT_EXPIRES_IN=7d

# Providers
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key

# Redis (Phase 2)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

### 生产环境注意事项
- 使用环境变量管理敏感信息
- 启用 HTTPS
- 配置适当的 CORS 策略
- 设置合理的速率限制
- 启用请求日志和监控

## 测试策略

### 单元测试
- 覆盖所有业务逻辑
- 模拟外部依赖
- 测试边界条件

### 集成测试
- API 端点完整流程测试
- 数据库操作测试
- 提供商集成测试

### 性能测试
- 并发请求测试
- 内存使用监控
- 响应时间基准

## 部署方案

### Docker 部署
- 创建 Dockerfile
- 配置 docker-compose
- 环境变量管理

### 监控和日志
- 结构化日志输出
- 性能指标收集
- 错误追踪和报警

---

**严格遵循此文档进行开发，确保代码质量和架构一致性。**
