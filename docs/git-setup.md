# Git 设置指南

## .gitignore 配置

已为项目配置了完整的 `.gitignore` 文件，确保以下文件和目录不会被提交到版本控制：

### 🔒 敏感文件 (已忽略)
- `.env` - 环境变量文件 (包含 API 密钥)
- `.env.*` - 所有环境变量文件
- `*.key`, `*.pem` - 密钥文件
- `secrets/` - 密钥目录

### 📁 构建和缓存文件 (已忽略)
- `node_modules/` - NPM 依赖
- `dist/` - TypeScript 编译输出
- `database/` - SQLite 数据库文件
- `logs/` - 日志文件
- `.eslintcache` - ESLint 缓存

### 💻 IDE 和系统文件 (已忽略)
- `.vscode/` - VS Code 设置
- `.idea/` - IntelliJ IDEA 设置
- `.DS_Store` - macOS 系统文件
- `Thumbs.db` - Windows 系统文件

## Git 初始化步骤

### 1. 初始化 Git 仓库

```bash
git init
```

### 2. 配置 Git 用户信息 (如果尚未配置)

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### 3. 添加所有文件到暂存区

```bash
git add .
```

### 4. 创建初始提交

```bash
git commit -m "Initial commit: OpenAI Router with ES Modules and OpenRouter integration

- Implemented OpenAI API compatible router server
- Added support for multiple AI providers (OpenAI, Anthropic)
- Configured OpenRouter with DeepSeek Chat v3.1 free model as default
- Migrated to ES Modules (ESNext) from CommonJS
- Updated all dependencies to latest versions
- Added SQLite database with user management and API key system
- Implemented authentication, rate limiting, and usage tracking
- Added comprehensive error handling and logging
- Created cross-platform compatible ESM entry detection
- Added complete documentation and configuration guides"
```

### 5. 添加远程仓库 (可选)

```bash
# 添加 GitHub 远程仓库
git remote add origin https://github.com/yourusername/openai-router.git

# 推送到远程仓库
git branch -M main
git push -u origin main
```

## 验证 .gitignore 工作

### 检查被忽略的文件

```bash
# 查看所有被忽略的文件
git status --ignored

# 检查特定文件是否被忽略
git check-ignore .env
git check-ignore database/app.db
git check-ignore dist/app.js
```

### 测试敏感文件保护

```bash
# 创建测试 .env 文件 (应该被忽略)
echo "TEST_SECRET=secret" > .env

# 检查是否被忽略
git status  # .env 不应该出现在未跟踪文件列表中
```

## 分支策略建议

### 主要分支
- `main` - 生产就绪代码
- `develop` - 开发分支

### 功能分支
- `feature/redis-integration` - Redis 集成 (第二阶段)
- `feature/streaming-support` - 流式响应支持
- `feature/new-provider` - 新提供商支持

### 示例工作流

```bash
# 创建功能分支
git checkout -b feature/redis-integration

# 开发完成后合并
git checkout develop
git merge feature/redis-integration

# 发布到主分支
git checkout main
git merge develop
git tag v1.0.0
```

## 提交消息规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### 示例提交消息

```bash
# 新功能
git commit -m "feat(providers): add support for Claude 3.5 Sonnet model"

# 修复 Bug
git commit -m "fix(auth): resolve JWT token expiration issue"

# 文档更新
git commit -m "docs: update API reference with new endpoints"

# 重构
git commit -m "refactor(database): optimize user query performance"

# 配置更新
git commit -m "chore(deps): update dependencies to latest versions"
```

## 文件结构概览

### 📂 会被提交的重要文件

```
openai-router/
├── 📁 src/                    # TypeScript 源代码
├── 📁 docs/                   # 项目文档
├── 📁 tests/                  # 测试文件
├── 📄 package.json            # 项目依赖和脚本
├── 📄 tsconfig.json           # TypeScript 配置
├── 📄 eslint.config.js        # ESLint 配置
├── 📄 jest.config.js          # Jest 测试配置
├── 📄 .prettierrc             # Prettier 格式化配置
├── 📄 .gitignore              # Git 忽略规则
├── 📄 .env.example            # 环境变量示例
└── 📄 README.md               # 项目说明
```

### 🚫 不会被提交的文件

```
openai-router/
├── 📁 node_modules/           # NPM 依赖 (忽略)
├── 📁 dist/                   # 编译输出 (忽略)
├── 📁 database/               # 数据库文件 (忽略)
├── 📁 logs/                   # 日志文件 (忽略)
├── 📄 .env                    # 环境变量 (忽略)
└── 📄 *.log                   # 日志文件 (忽略)
```

## 安全检查清单

在提交前确保：

- [ ] ✅ `.env` 文件不在 Git 跟踪中
- [ ] ✅ API 密钥没有硬编码在源代码中
- [ ] ✅ 数据库文件被正确忽略
- [ ] ✅ 构建输出目录被忽略
- [ ] ✅ 日志文件被忽略
- [ ] ✅ IDE 配置文件被忽略

## 故障排除

### 如果敏感文件已被提交

```bash
# 从 Git 历史中移除敏感文件
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch .env' \
  --prune-empty --tag-name-filter cat -- --all

# 强制推送更新历史
git push origin --force --all
```

### 如果 .gitignore 不工作

```bash
# 清除 Git 缓存
git rm -r --cached .
git add .
git commit -m "fix: update .gitignore rules"
```

## 总结

✅ **Git 配置完成**: `.gitignore` 已配置，保护敏感文件  
✅ **安全保护**: API 密钥和数据库文件不会被提交  
✅ **构建优化**: 编译输出和依赖文件被正确忽略  
✅ **跨平台**: 支持 Windows、macOS、Linux 的系统文件忽略  

现在您可以安全地将项目提交到 Git 仓库，不用担心泄露敏感信息！
