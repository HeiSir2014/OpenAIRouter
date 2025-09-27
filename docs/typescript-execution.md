# TypeScript 直接执行配置

## 概述

项目已配置为直接执行 TypeScript 源码，无需预编译。这提供了更快的开发体验和更简单的部署流程。

## 脚本说明

### 开发和生产脚本

```json
{
  "scripts": {
    "dev": "nodemon --exec \"node --loader ts-node/esm\" src/app.ts",
    "start": "node --loader ts-node/esm src/app.ts",
    "build": "tsc",
    "build:prod": "tsc && node dist/app.js",
    "type-check": "tsc --noEmit"
  }
}
```

### 脚本详解

#### 🚀 `npm run dev`
- **用途**: 开发环境启动
- **功能**: 使用 nodemon 监听文件变化，自动重启
- **执行**: 直接运行 TypeScript 源码
- **热重载**: ✅ 支持

#### 🏃 `npm start`
- **用途**: 生产环境启动
- **功能**: 直接运行 TypeScript 源码
- **性能**: 首次启动稍慢（需要编译），后续运行正常
- **部署**: 无需预编译步骤

#### 🔨 `npm run build`
- **用途**: 编译 TypeScript 到 JavaScript
- **输出**: `dist/` 目录
- **场景**: 发布到 NPM 或需要 JS 文件的环境

#### 🚀 `npm run build:prod`
- **用途**: 编译并运行编译后的 JavaScript
- **场景**: 生产环境需要最佳性能时
- **优势**: 启动速度最快

#### ✅ `npm run type-check`
- **用途**: 仅进行类型检查，不生成文件
- **场景**: CI/CD 流水线中的类型验证
- **速度**: 快速类型验证

## 配置详情

### tsconfig.json 配置

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true
  },
  "ts-node": {
    "esm": true,
    "experimentalSpecifierResolution": "node"
  }
}
```

### 关键配置说明

- **`"type": "module"`**: 启用 ES 模块支持
- **`ts-node.esm: true`**: 启用 ts-node 的 ES 模块支持
- **`--loader ts-node/esm`**: Node.js 加载器，支持 TypeScript ES 模块

## 优势

### ✅ 开发体验
- **无需编译步骤**: 直接运行 TypeScript
- **快速迭代**: 修改代码立即生效
- **类型安全**: 运行时类型检查
- **调试友好**: 源码级调试支持

### ✅ 部署简化
- **单步部署**: 无需构建步骤
- **环境一致性**: 开发和生产使用相同代码
- **容器友好**: Docker 部署更简单

### ✅ 维护性
- **源码即真相**: 避免编译产物不一致
- **依赖简化**: 减少构建工具复杂性
- **错误追踪**: 直接定位到 TypeScript 源码

## 性能考虑

### 启动性能
- **首次启动**: 稍慢（需要 JIT 编译）
- **后续请求**: 正常性能
- **内存使用**: 略高于预编译版本

### 生产环境建议
- **小型应用**: 直接使用 TypeScript 执行
- **高性能需求**: 使用 `npm run build:prod`
- **容器部署**: 可选择预编译或运行时编译

## 故障排除

### 常见问题

#### 1. ES 模块导入错误
```bash
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
```
**解决方案**: 确保所有导入都包含 `.js` 扩展名

#### 2. ts-node 版本兼容性
```bash
TypeError: Unknown file extension ".ts"
```
**解决方案**: 确保使用 ts-node 10.9+ 版本

#### 3. 实验性警告
```bash
ExperimentalWarning: `--experimental-loader` may be removed
```
**说明**: 这是 Node.js 的实验性功能警告，不影响功能

### 调试技巧

#### 启用详细日志
```bash
NODE_OPTIONS="--loader ts-node/esm --trace-warnings" npm start
```

#### 类型检查
```bash
npm run type-check
```

#### 性能分析
```bash
NODE_OPTIONS="--loader ts-node/esm --prof" npm start
```

## 迁移指南

### 从编译模式迁移

1. **更新脚本**: 使用新的 npm scripts
2. **检查导入**: 确保所有相对导入包含 `.js` 扩展名
3. **测试启动**: 验证应用正常启动
4. **性能测试**: 确认性能满足需求

### 回退到编译模式

如果需要回退到预编译模式：

```json
{
  "scripts": {
    "dev": "nodemon dist/app.js",
    "start": "node dist/app.js",
    "prebuild": "npm run type-check",
    "build": "tsc"
  }
}
```

## 最佳实践

### 开发环境
- 使用 `npm run dev` 进行开发
- 定期运行 `npm run type-check` 验证类型
- 使用 IDE 的 TypeScript 支持

### 生产环境
- 小型应用: `npm start`
- 高性能需求: `npm run build:prod`
- 容器部署: 根据需求选择

### CI/CD
- 类型检查: `npm run type-check`
- 测试: `npm test`
- 构建验证: `npm run build`

## 总结

TypeScript 直接执行配置提供了：

- 🚀 **更快的开发体验**
- 🔧 **简化的部署流程**
- 🛡️ **类型安全保障**
- 🔄 **现代化的工具链**

这种配置特别适合现代 Node.js 应用，提供了开发效率和运行时性能的良好平衡。
