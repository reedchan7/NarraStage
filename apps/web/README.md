# NarraStage Web

NarraStage 的仓库内置 Web 客户端。它与 `apps/server`、`apps/desktop` 和 `packages/contracts` 共用一个 Bun workspace、TypeScript 版本和依赖锁，不再依赖外部前端仓库。

## 技术栈

- React 19、React DOM 19
- React Router 7
- TanStack Query 5 管理服务端状态
- Zustand 5 管理最小化、本地持久化的会话与语言偏好
- Vite 8 单文件生产构建
- TypeScript 7
- Vitest 4、Testing Library

模型服务密钥不进入 HTTP API、Web storage 或 Query cache。桌面客户端通过 Electron preload 的 `narrastageCredentials` 能力将密钥写入操作系统安全存储；普通浏览器只显示脱敏状态。

## 开发

所有命令从仓库根目录执行：

```bash
make install
make dev
make web-dev
```

打开 `http://localhost:50188`。开发服务器将 `/api`、`/oss` 和 Socket.IO 代理到 `http://localhost:10588`。

```bash
make web-check
make web-build
make web-package
```

`make web-package` 会从当前仓库源码构建单文件渲染器，记录契约与源码摘要，并原子更新 `data/web/index.html` 和 `data/contracts/web-build.json`。运行 `make` 或 `make help` 可查看全部常用命令。

## 目录

```text
src/
├── api/          # 类型化 HTTP 边界
├── components/   # 应用外壳与错误边界
├── features/     # 实时对话、图像与视频生成工作流
├── i18n/         # 七语言字典与 React hook
├── pages/        # 登录、项目、制作台、模型服务
├── state/        # 会话和非敏感偏好
├── test/         # 浏览器测试环境
├── App.tsx       # 路由与 Query 客户端
├── main.tsx      # React 入口
└── styles.css    # 产品界面设计系统
```

项目遵循仓库根目录的 Apache-2.0 许可证和发布门禁。
