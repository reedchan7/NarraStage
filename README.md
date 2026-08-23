<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=200&section=header&text=Toonflow&fontSize=90&fontColor=ffffff&animation=fadeIn&fontAlignY=50" width="100%"/>

<p>
  <a href="https://github.com/reedchan7/Toonflow-app">
    <img src="https://img.shields.io/badge/GitHub-181717?style=flat-square&logo=github&logoColor=white" alt="GitHub" />
  </a>
</p>

<p align="center">
  <strong>简体中文</strong> | 
  <a href="./docs/README.zhtw.md">繁體中文</a> | 
  <a href="./docs/README.en.md">English</a> | 
  <a href="./docs/README.th.md">ไทย</a> | 
  <a href="./docs/README.vi.md">Tiếng Việt</a> | 
  <a href="./docs/README.ja.md">日本語</a> | 
  <a href="./docs/README.ru.md">Русский</a>
</p>

<div align="center">

<img src="./docs/logo.png" alt="Toonflow Logo" height="120"/>

[![Typing SVG](https://readme-typing-svg.demolab.com?font=Fira+Code&size=40&duration=3000&pause=1000&color=000000&center=true&vCenter=true&width=600&lines=Toonflow;AI%E7%9F%AD%E5%89%A7%E5%B7%A5%E5%8E%82;%E5%8A%A8%E5%8A%A8%E6%89%8B%E6%8C%87%EF%BC%8C%E5%B0%8F%E8%AF%B4%E7%A7%92%E5%8F%98%E5%89%A7%E9%9B%86%EF%BC%81)](https://git.io/typing-svg)

  <p align="center">
    <a href="https://github.com/reedchan7/Toonflow-app/stargazers">
      <img src="https://img.shields.io/github/stars/reedchan7/Toonflow-app?style=for-the-badge&logo=github" alt="Stars Badge" />
    </a>
    <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank">
      <img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=for-the-badge" alt="Apache-2.0 License Badge" />
    </a>
    <a href="https://github.com/reedchan7/Toonflow-app/releases">
      <img alt="release" src="https://img.shields.io/github/v/release/reedchan7/Toonflow-app?style=for-the-badge" />
    </a>
  </p>
  <p align="center">
    <a href="https://github.com/reedchan7/Toonflow-app/network/members">
      <img src="https://img.shields.io/github/forks/reedchan7/Toonflow-app?style=for-the-badge&logo=github&color=orange" alt="Forks Badge" />
    </a>
  </p>
  <p align="center">
    <a href="https://github.com/reedchan7/Toonflow-app/issues">
      <img src="https://img.shields.io/github/issues/reedchan7/Toonflow-app?style=for-the-badge&color=F48D73" alt="Issues" />
    </a>
    <a href="https://github.com/reedchan7/Toonflow-app/graphs/contributors">
      <img src="https://img.shields.io/github/contributors/reedchan7/Toonflow-app?style=for-the-badge&color=2088FF" alt="Contributors" />
    </a>
    <a href="https://github.com/reedchan7/Toonflow-app/commits">
      <img src="https://img.shields.io/github/last-commit/reedchan7/Toonflow-app?style=for-the-badge&color=blueviolet" alt="Last Commit" />
    </a>
  </p>
  <p align="center">
    <img src="https://ziadoua.github.io/m3-Markdown-Badges/badges/TypeScript/typescript2.svg" alt="TypeScript" />&nbsp;
    <img src="https://ziadoua.github.io/m3-Markdown-Badges/badges/Bun/bun2.svg" alt="Bun" />&nbsp;
    <img src="https://ziadoua.github.io/m3-Markdown-Badges/badges/Docker/docker2.svg" alt="Docker" />&nbsp;
    <img src="https://ziadoua.github.io/m3-Markdown-Badges/badges/Electron/electron2.svg" alt="Electron" />
  </p>

> **Toonflow 2**：基于 Bun 1.4、TypeScript 7 和 Electron 43 的 AI 短剧工作台，覆盖策划、编剧、分镜与出片。

</div>

---

# 🌐 多语言支持

Toonflow 支持以下语言界面：

| 语言       | Language              |
| ---------- | --------------------- |
| 简体中文   | Chinese (Simplified)  |
| 繁體中文   | Chinese (Traditional) |
| English    | English               |
| ไทย        | Thai                  |
| Tiếng Việt | Vietnamese            |
| 日本語     | Japanese              |
| Русский    | Russian               |

> 💡 更多语言适配中，欢迎贡献翻译！

---

# 🌟 主要功能

Toonflow 是面向短剧生产的 AI 工作台，围绕“策划 → 编剧 → 分镜 → 出片”构建完整闭环，并支持本地化、可编程、可持续迭代的生产流程。

- ✅ **无限画布生产工作台**  
  以类无限画布形式组织剧本、角色、分镜、素材与视频节点，支持自由编排、回溯与并行生产，不受线性步骤限制。
- ✅ **三层 Agent 协作体系**  
  决策层、执行层、监督层协同工作，覆盖任务拆解、内容生成、质量审阅与修订反馈，提升稳定性与成片一致性。
- ✅ **持久化 Agent 记忆**  
  基于本地 ONNX 向量检索的跨会话记忆系统，支持短期消息、长期摘要和语义召回，确保多轮创作连续性。
- ✅ **可编程供应商系统**  
  支持在设置中心直接编写供应商 TypeScript 逻辑并即时生效，无需改源码或重启，便于私有化和多模型接入。
- ✅ **章节事件图谱驱动改编**  
  自动提取原著章节事件并结构化存储，剧本改编按事件图谱精准调用上下文，减少长文本信息丢失。
- ✅ **Skill 文件化配置**  
  ScriptAgent 与 ProductionAgent 的核心提示词外化为 Markdown Skill 文件，支持在线编辑与快速调优。

---

# 📦 应用场景

- 短视频内容创作
- 小说影视化实验
- AI 文学改编工具
- 剧本开发与快速原型
- 视频素材生成

---

# 🔰 使用指南

## 快速上手

1. 启动应用并登录（默认账号：`admin` / `admin123`）。
2. 在设置中心完成模型供应商配置（文本/图像/视频模型）。
3. 新建项目并导入原著，执行章节事件提取。
4. 进入 ScriptAgent 生成故事骨架、改编策略与结构化剧本。
5. 切换到 ProductionAgent，在无限画布中组织分镜、素材与视频节点。
6. 对分镜图进行节点化精调后回流工作台，完成视频拼接与导出。

## 📺 视频教程

https://www.bilibili.com/video/BV1oXD7BqEqJ
[![Toonflow 12 分钟快速上手 AI 视频](./docs/videoCover.jpg)](https://www.bilibili.com/video/BV1oXD7BqEqJ)

**Toonflow 12 分钟快速上手 AI 视频**
👉 [点击观看](https://www.bilibili.com/video/BV1oXD7BqEqJ)

📱 手机微信扫码观看

<img src="./docs/videoQR.png" alt="微信扫码观看" width="150"/>

---

# 📸 演示截图与视频

以下截图及视频来自使用 Toonflow 制作的一段 AI 短剧 Demo，全程约 2 小时完成，涵盖剧本生成、分镜制作及剪辑环节。

<div align="center">
<table>
  <tr>
    <td width="50%"><a href="./docs/screenshot/1.png" target="_blank"><img src="./docs/screenshot/1.png" width="100%"/></a></td>
    <td width="50%"><a href="./docs/screenshot/2.png" target="_blank"><img src="./docs/screenshot/2.png" width="100%"/></a></td>
  </tr>
  <tr>
    <td width="50%"><a href="./docs/screenshot/3.png" target="_blank"><img src="./docs/screenshot/3.png" width="100%"/></a></td>
    <td width="50%"><a href="./docs/screenshot/4.png" target="_blank"><img src="./docs/screenshot/4.png" width="100%"/></a></td>
  </tr>
  <tr>
    <td width="50%"><a href="./docs/screenshot/5.png" target="_blank"><img src="./docs/screenshot/5.png" width="100%"/></a></td>
    <td width="50%"><a href="./docs/screenshot/6.png" target="_blank"><img src="./docs/screenshot/6.png" width="100%"/></a></td>
  </tr>
  <tr>
    <td width="50%"><a href="./docs/screenshot/7.png" target="_blank"><img src="./docs/screenshot/7.png" width="100%"/></a></td>
    <td width="50%"><a href="./docs/screenshot/8.png" target="_blank"><img src="./docs/screenshot/8.png" width="100%"/></a></td>
  </tr>
  <tr>
    <td width="50%"><a href="./docs/screenshot/9.png" target="_blank"><img src="./docs/screenshot/9.png" width="100%"/></a></td>
    <td width="50%"><a href="./docs/screenshot/10.png" target="_blank"><img src="./docs/screenshot/10.png" width="100%"/></a></td>
  </tr>
</table>
</div>

## 🎬 Demo 视频

<div align="center">

https://github.com/user-attachments/assets/2d9fddac-dfdf-4640-b030-b09d7f7287e9

如无法播放，请[点击下载视频](./docs/screenshot/demo.mp4)

</div>

## Demo 信息

| 项目       | 详情                                            |
| :--------- | :---------------------------------------------- |
| 制作周期   | 约 2 小时                                       |
| 视频模型   | Seedance 2.0                                    |
| 图片模型   | GPT Image 2                                     |
| 语言模型   | Claude Opus 4.6                                 |
| 成片总时长 | 约 2 分钟（原始素材 3 分钟，剪除废片约 1 分钟） |

## 成本明细

| 模型类型             | 费用        |
| :------------------- | :---------- |
| 语言模型             | 约 ¥10      |
| 视频模型（全量生成） | 约 ¥120     |
| 图片模型             | 不足 ¥1     |
| **合计**             | **约 ¥130** |

> **声明**：Demo 原始分辨率为 1080×1882，发布版本已压缩至 480p。如涉及版权问题，请联系我们删除处理。

---

# 🚀 安装

## 前置条件

在安装和使用本软件之前，请准备以下内容：

- ✅ 大语言模型 AI 服务接口地址
- ✅ Sora 或豆包视频服务接口地址
- ✅ Nano Banana Pro 图片生成模型服务接口

## 本机安装

### 1. 下载与安装

| 操作系统 | GitHub                                                        | 说明           |
| :------: | :------------------------------------------------------------ | :------------- |
| Windows  | [Release](https://github.com/reedchan7/Toonflow-app/releases) | 官方发布安装包 |
|  Linux   | [Release](https://github.com/reedchan7/Toonflow-app/releases) | 官方发布安装包 |
|  macOS   | [Release](https://github.com/reedchan7/Toonflow-app/releases) | 官方发布安装包 |

> [!CAUTION]
> MacOS 系统请到 设置-隐私与安全性 配置安全性否则可能因证书问题无法正常打开
>
> 参考知乎文档：[https://www.zhihu.com/question/433389276](https://www.zhihu.com/question/433389276)

### 2. 启动服务

安装完成后，启动程序即可开始使用本服务。

> ⚠️ **首次登录**  
> 账号：`admin`  
> 密码：`admin123`

## Docker 部署

### 前置条件

- 已安装 [Docker](https://docs.docker.com/get-docker/)（版本 20.10+）

### 方式一：在线部署

待完善，暂时使用本地构建。

### 方式二：本地构建

使用本地已有的源码直接构建，适合开发者或已克隆仓库的用户，这需要你在本地安装 git：

```shell
# 先克隆项目（如已有则跳过）
git clone https://github.com/reedchan7/Toonflow-app.git
cd Toonflow-app

# 使用 Makefile 本地构建并启动
make docker-build
make docker-run

# 或者手动构建
docker build -t toonflow .
docker run -d -p <本地端口>:10588 -v <本地数据路径>:/app/data toonflow

# 此时在相应端口的 /web/index.html 路径即可访问页面
# 例如 http://localhost:10588/web/index.html
```

### 服务端口说明

| 端口    | 用途     | 部署映射      |
| ------- | -------- | ------------- |
| `10588` | 软件界面 | `10588:10588` |

**环境变量说明：**

| 变量       | 说明                               |
| ---------- | ---------------------------------- |
| `NODE_ENV` | 运行环境，`prod` 表示生产环境      |
| `PORT`     | 服务监听端口（默认 10588）         |
| `OSSURL`   | 文件存储访问地址，用于静态资源访问 |

---

## 云端部署

### 云服务器部署

#### 一、服务器环境要求

- **系统**：Ubuntu 20.04+ / CentOS 7+
- **Bun**：1.4.1（最低 1.4.0）
- **内存**：2GB+

#### 二、服务器部署

##### 1. 安装环境

```bash
# Install Bun 1.4.1
curl -fsSL https://bun.com/install | bash
source ~/.bashrc
bun --version
# Install PM2
bun add --global pm2
```

##### 2. 部署项目

**从 GitHub 克隆：**

```bash
cd /opt
git clone https://github.com/reedchan7/Toonflow-app.git
cd Toonflow-app
make install
make build
```

##### 3. 配置 PM2

创建 `pm2.json` 文件：

```json
{
  "name": "toonflow-app",
  "script": "data/serve/app.js",
  "interpreter": "bun",
  "instances": "max",
  "exec_mode": "cluster",
  "env": {
    "NODE_ENV": "prod",
    "PORT": 10588,
    "OSSURL": "http://127.0.0.1:10588/"
  }
}
```

**环境变量说明：**

| 变量       | 说明                               |
| ---------- | ---------------------------------- |
| `NODE_ENV` | 运行环境，`prod` 表示生产环境      |
| `PORT`     | 服务监听端口                       |
| `OSSURL`   | 文件存储访问地址，用于静态资源访问 |

---

##### 4. 启动服务

```bash
pm2 start pm2.json
pm2 startup
pm2 save
```

##### 5. 常用命令

```bash
pm2 list              # 查看进程
pm2 logs toonflow-app # 查看日志
pm2 restart all       # 重启服务
pm2 monit             # 监控面板
```

> ⚠️ **首次登录**  
> 账号：`admin`  
> 密码：`admin123`

---

# 🔧 开发流程指南

## 🛠️ 技术栈

| 类别       | 技术                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------- |
| 运行时     | Bun 1.4.1                                                                                 |
| 语言       | TypeScript 7.0.2                                                                          |
| 后端框架   | Express 5                                                                                 |
| 数据库     | SQLite（better-sqlite3 / knex）                                                           |
| AI 集成    | Vercel AI SDK（OpenAI / Anthropic / Google / DeepSeek / 智谱 / MiniMax / 通义千问 / xAI） |
| 本地推理   | @huggingface/transformers（ONNX）                                                         |
| 实时通信   | Socket.IO                                                                                 |
| 桌面客户端 | Electron 43                                                                               |
| 图像处理   | Sharp                                                                                     |
| 容器化     | Docker                                                                                    |

## 开发环境准备

- **Bun**：最低版本 1.4.0，推荐 1.4.1
- **包管理器**：Bun 1.4.1

## 快速启动项目

1. **克隆项目**

   **从 GitHub 克隆：**

   ```bash
   git clone https://github.com/reedchan7/Toonflow-app.git
   cd Toonflow-app
   ```

2. **安装依赖**

   请先在项目根目录下执行以下命令以安装依赖项：

   ```bash
   make install
   ```

   运行 `make` 或 `make help` 可查看全部常用命令。

3. **启动开发环境**

   本项目包含 **后端 API 服务** 和 **前端页面** 两部分，请根据需要选择启动方式：
   - **方式一：仅启动后端服务**

     ```bash
     make dev
     ```

     > ⚠️ 此命令仅启动后端 API 服务（端口 10588），**不包含前端页面**。如需完整界面，请使用下方的 GUI 模式。

   - **方式二：启动 Electron 桌面客户端**

     ```bash
     make dev-gui
     ```

     > 此命令会同时启动后端服务和 Electron 桌面窗口，自带内置前端页面，开箱即用，无需额外配置。适合想要完整体验所有功能的开发者。

   - **方式三：生产模式启动**

     ```bash
     make start
     ```

     > 以生产模式直接运行编译后的服务（需先执行 `make build`）。

4. **项目打包**
   - 编译并生成 TypeScript 文件：

     ```bash
     make build
     ```

   - 打包为 Windows 平台可执行程序：

     ```bash
     make dist-win
     ```

   - 打包为 Mac 平台可执行程序：

     ```bash
     make dist-mac
     ```

   - 打包为 Linux 平台可执行程序：

     ```bash
     make dist-linux
     ```

5. **代码质量检查**
   - 进行全局语法和规范检查：

     ```bash
     make check
     ```

6. **AI 调试面板（可选）**

   启动 AI SDK 的可视化调试工具，方便调试 AI 调用：

   ```bash
   make debug-ai
   ```

## 项目结构

```
📂 build/                    # 编译产物
📂 data/                     # 运行时数据
│  ├─ 📂 models/            # 本地推理模型（ONNX）
│  ├─ 📂 oss/               # 对象存储（素材/角色/场景）
│  ├─ 📂 serve/             # 生产环境入口
│  ├─ 📂 skills/            # Agent 技能提示词
│  └─ 📂 web/               # 前端编译产物（内置）
📂 docs/                     # 文档资源
📂 env/                      # 环境配置
📂 scripts/                  # 构建与辅助脚本
📂 src/
├─ 📂 agents/               # AI Agent 模块
│  ├─ 📂 productionAgent/   # 生产 Agent
│  └─ 📂 scriptAgent/       # 剧本 Agent
├─ 📂 lib/                  # 公共库（数据库初始化、响应格式）
├─ 📂 middleware/            # 中间件
├─ 📂 routes/               # 路由模块
│  ├─ 📂 agents/            # Agent 记忆管理
│  ├─ 📂 artStyle/          # 画风管理
│  ├─ 📂 assets/            # 素材管理
│  ├─ 📂 assetsGenerate/    # 素材生成
│  ├─ 📂 cornerScape/       # 分镜管理
│  ├─ 📂 general/           # 通用接口
│  ├─ 📂 login/             # 登录认证
│  ├─ 📂 migrate/           # 数据迁移
│  ├─ 📂 modelSelect/       # 模型选择
│  ├─ 📂 novel/             # 小说管理
│  ├─ 📂 other/             # 其他功能
│  ├─ 📂 production/        # 制作管理
│  ├─ 📂 project/           # 项目管理
│  ├─ 📂 script/            # 剧本生成
│  ├─ 📂 scriptAgent/       # 剧本 Agent 接口
│  ├─ 📂 setting/           # 系统设置
│  ├─ 📂 task/              # 任务管理
│  └─ 📂 test/              # 测试接口
├─ 📂 socket/               # WebSocket 实时通信
├─ 📂 types/                # TypeScript 类型声明
├─ 📂 utils/                # 工具函数
├─ 📄 app.ts                # 应用入口
├─ 📄 core.ts               # 核心初始化
├─ 📄 env.ts                # 环境变量处理
├─ 📄 err.ts                # 错误处理
├─ 📄 logger.ts             # 日志模块
├─ 📄 router.ts             # 路由注册
└─ 📄 utils.ts              # 通用工具
📄 Dockerfile                # Docker 构建文件
📄 electron-builder.yml      # Electron 打包配置
📄 skillList.json            # 技能清单
📄 LICENSE                   # 许可证（Apache-2.0）
📄 NOTICES.txt               # 第三方依赖声明
📄 package.json              # 项目配置
📄 tsconfig.json             # TypeScript 配置
```

---

# 🔗 仓库与维护

- 当前仓库：[reedchan7/Toonflow-app](https://github.com/reedchan7/Toonflow-app)
- 问题反馈：[GitHub Issues](https://github.com/reedchan7/Toonflow-app/issues)
- 上游项目：[HBAI-Ltd/Toonflow-app](https://github.com/HBAI-Ltd/Toonflow-app)

本仓库是 Toonflow 的独立维护 fork。下载、问题反馈和贡献请以当前仓库为准。

---

# 📜 许可证

本项目按 [Apache License 2.0](./LICENSE) 授权，不附加额外商业许可条款。第三方依赖及其许可证见 [NOTICES.txt](./NOTICES.txt)。

---

# 🙏 致谢

感谢 [Toonflow 上游项目](https://github.com/HBAI-Ltd/Toonflow-app) 及所有开源依赖的作者与贡献者。上游代码版权归其原始版权方所有，本 fork 的新增修改由各贡献者保留版权。

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=100&section=footer" width="100%"/>
