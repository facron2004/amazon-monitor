# Amazon Monitor 运行检查清单

按照此清单逐步检查，确保项目能够正常运行。

## 1. 环境检查

### 1.1 检查 Node.js 版本

```bash
node -v
```

**要求：**
- ✅ Node.js >= 22.12.0（必须）
- ❌ Node.js < 22.12.0（不支持，因为使用了 `node:sqlite` 内置模块）

如果版本过低，请升级 Node.js：
- [Node.js 官网下载](https://nodejs.org/)
- 推荐使用 Node.js 24 LTS

### 1.2 检查 npm 版本

```bash
npm -v
```

**要求：**
- ✅ npm >= 10.0.0

### 1.3 检查 Git（可选）

如果需要版本控制：

```bash
git --version
```

## 2. 项目初始化

### 2.1 安装依赖

```bash
npm install
```

**预期输出：**
- 成功安装所有依赖
- 如果 Node 版本不符合要求，会显示错误提示

**可能的问题：**
- ❌ `npm ERR! engine Unsupported engine` → Node 版本过低，请升级
- ❌ 网络错误 → 检查网络连接或配置 npm 镜像

### 2.2 安装 Playwright 浏览器

```bash
npx playwright install chromium
```

**预期输出：**
- 下载并安装 Chromium 浏览器（约 200MB）
- 显示安装成功信息

**可能的问题：**
- ❌ 下载速度慢 → 配置代理或使用国内镜像
- ❌ 磁盘空间不足 → 清理磁盘空间

### 2.3 检查环境变量（可选）

如果需要配置 SMTP 或其他功能：

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填写实际配置
```

**需要配置的关键变量：**
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` - 邮件通知
- `AMAZON_COLLECT_*` - 采集参数调优
- `ENABLE_CRON` - 是否启用定时任务

## 3. 构建项目

### 3.1 构建共享包

```bash
npm run build:shared
```

**预期输出：**
- 编译 TypeScript 成功
- 在 `packages/shared/dist` 生成文件

### 3.2 构建完整项目

```bash
npm run build
```

**预期输出：**
- 构建 shared、api、web 三个包
- 在 `apps/web/dist` 生成前端静态文件
- 在 `apps/api/dist` 生成后端文件

**可能的问题：**
- ❌ TypeScript 编译错误 → 检查代码语法
- ❌ 依赖缺失 → 重新运行 `npm install`

## 4. 启动服务

### 4.1 启动开发服务（推荐）

```bash
npm run dev
```

**预期输出：**
```
> @amazon-monitor/shared@0.1.0 build
> tsc -p tsconfig.json

  VITE v7.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5188/
  
Amazon monitor API listening on http://localhost:4000
```

### 4.2 验证前端服务

打开浏览器访问：

```
http://localhost:5188
```

**预期结果：**
- ✅ 页面正常加载
- ✅ 显示 "Amazon 监控系统" 标题
- ✅ 可以看到类目情报、关键词等标签页

**可能的问题：**
- ❌ 空白页面 → 检查浏览器控制台错误
- ❌ 端口被占用 → 关闭占用端口的程序或修改端口

### 4.3 验证 API 服务

在新终端窗口运行：

```bash
curl http://localhost:4000/api/categories
```

或在浏览器打开：

```
http://localhost:4000/api/categories
```

**预期结果：**
- ✅ 返回 JSON 数据（可能是空数组 `[]`）
- ✅ 没有 404 或 500 错误

### 4.4 验证数据库初始化

检查数据库文件是否创建：

```bash
# Windows PowerShell
ls data/amazon-monitor.sqlite

# macOS/Linux
ls -lh data/amazon-monitor.sqlite
```

**预期结果：**
- ✅ 文件存在
- ✅ 文件大小 > 0KB

## 5. 功能测试

### 5.1 添加测试关键词

在前端界面（http://localhost:5188）：

1. 切换到"关键词"标签页
2. 点击"新增关键词"
3. 填写：
   - 关键词：`wireless mouse`
   - 域名：`amazon.com`
   - 最大采集数：`10`
4. 点击"保存"

**预期结果：**
- ✅ 显示成功提示
- ✅ 关键词列表中出现新记录

### 5.2 测试采集功能（Web 界面）

在关键词列表中：

1. 找到刚添加的关键词
2. 点击"采集"按钮

**预期行为：**
- ✅ 显示"采集中..."
- ✅ Playwright 会打开浏览器（如果是无头模式则看不到）
- ✅ 10-30秒后显示采集结果
- ✅ 查看"竞品池"标签页，应该有新数据

**可能的问题：**
- ❌ 超时错误 → 增加 `AMAZON_COLLECT_TIMEOUT_MS`
- ❌ Amazon 验证码 → 检查 `data/collector-screenshots/` 截图
- ❌ 空结果 → 检查网络连接和 Amazon 可访问性

### 5.3 测试 CLI 采集（可选）

停止开发服务（Ctrl+C），然后运行：

```bash
npm run collect:keyword
```

**预期输出：**
```
开始采集关键词...
✓ wireless mouse 采集成功（10 个商品）
采集完成：成功 1，失败 0，耗时 25s
```

## 6. 测试运行（可选）

运行自动化测试：

```bash
npm run test
```

**预期输出：**
- ✅ 所有测试通过
- ✅ 显示测试覆盖率统计

## 7. 常见问题排查

### 问题 1：Node 版本过低

**症状：**
```
Error: Cannot find module 'node:sqlite'
```

**解决方案：**
升级 Node.js 到 22.12.0 或更高版本。

### 问题 2：端口被占用

**症状：**
```
Error: listen EADDRINUSE: address already in use :::4000
```

**解决方案：**

Windows PowerShell：
```powershell
# 查找占用端口的进程
netstat -ano | findstr :4000

# 终止进程（替换 PID）
taskkill /PID <PID> /F
```

macOS/Linux：
```bash
# 查找并终止占用端口的进程
lsof -ti:4000 | xargs kill -9
```

### 问题 3：Playwright 浏览器未安装

**症状：**
```
browserType.launch: Executable doesn't exist
```

**解决方案：**
```bash
npx playwright install chromium
```

### 问题 4：数据库文件权限问题

**症状：**
```
Error: SQLITE_CANTOPEN: unable to open database file
```

**解决方案：**
- 检查 `data/` 目录是否存在
- 检查文件权限
- 创建目录：`mkdir -p data`

### 问题 5：前端空白页面

**症状：**
浏览器显示空白，控制台报错

**解决方案：**
1. 清除浏览器缓存
2. 检查浏览器控制台（F12）查看具体错误
3. 重新构建：`npm run build`
4. 重启开发服务：`npm run dev`

## 8. 完成检查

全部步骤完成后，确认：

- ✅ 前端页面正常访问（http://localhost:5188）
- ✅ API 接口正常响应（http://localhost:4000/api/categories）
- ✅ 数据库文件已创建（`data/amazon-monitor.sqlite`）
- ✅ 采集功能正常工作
- ✅ 测试通过（可选）

## 9. 下一步

项目运行正常后，可以：

1. 阅读 [DEVELOPMENT.md](DEVELOPMENT.md) 了解开发指南
2. 阅读 [项目说明.md](项目说明.md) 了解详细功能
3. 配置 `.env` 启用邮件通知和飞书推送
4. 添加更多关键词和类目进行监控
5. 查看 `data/collector-screenshots/` 了解采集详情

## 10. 获取帮助

如果遇到问题：

1. 检查 `data/collector-screenshots/` 目录的截图
2. 查看终端输出的错误信息
3. 查看 `.env.example` 确认环境变量配置
4. 参考 [README.md](README.md) 的故障排查章节
