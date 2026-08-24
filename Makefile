.DEFAULT_GOAL := help

BUN ?= bun
DOCKER ?= docker
DOCKER_IMAGE ?= narrastage
PORT ?= 10588
DATA_DIR ?= $(CURDIR)/data

.PHONY: \
	help \
	install \
	deps-check \
	hooks \
	workspace-check \
	contracts-check \
	dev \
	server-test \
	web-dev \
	web-check \
	web-build \
	web-package \
	desktop-dev \
	dev-gui \
	dev-gui-vite \
	start \
	format \
	format-check \
	lint \
	lint-fix \
	runtime-check \
	modules-check \
	typecheck \
	test \
	test-watch \
	check \
	ci \
	build \
	pack \
	pack-local \
	dist \
	dist-win \
	dist-mac \
	dist-linux \
	debug-ai \
	license \
	vendor-json \
	docker-build \
	docker-run \
	clean

help: ## 显示可用命令
	@awk 'BEGIN {FS = ":.*## "; printf "用法: make <target>\n\n可用命令:\n"} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## 按锁文件安装依赖
	$(BUN) install --frozen-lockfile

deps-check: ## 检查依赖是否有可用更新
	$(BUN) outdated --latest

hooks: ## 安装 Lefthook Git hooks
	$(BUN) run hooks

workspace-check: ## 检查多端工作区、锁文件和 TypeScript 版本策略
	$(BUN) run workspace:check

contracts-check: ## 检查共享 API 契约是否与服务端一致
	$(BUN) run contracts:check

dev: ## 启动后端开发服务
	$(BUN) run dev

server-test: ## 运行服务端测试
	$(BUN) run test:server

web-dev: ## 启动 Web 客户端开发环境
	$(BUN) run web:dev

web-check: ## 检查 Web 客户端
	$(BUN) run web:check

web-build: ## 构建 Web 客户端
	$(BUN) run web:build

web-package: ## 构建并嵌入仓库内 Web 客户端
	$(BUN) run web:package

desktop-dev: ## 启动桌面客户端开发环境
	$(BUN) run dev:gui

dev-gui: ## 启动 Electron 桌面开发环境
	$(BUN) run dev:gui

dev-gui-vite: ## 连接 Vite 前端启动 Electron
	$(BUN) run dev:gui-vite

start: ## 启动已构建的生产服务
	$(BUN) run start

format: ## 使用 Oxfmt 格式化代码
	$(BUN) run format

format-check: ## 检查代码格式
	$(BUN) run format:check

lint: ## 使用 Oxlint 检查代码
	$(BUN) run lint

lint-fix: ## 自动修复可安全修复的 lint 问题
	$(BUN) run lint:fix

runtime-check: ## 检查 Bun 运行时版本
	$(BUN) run runtime:check

modules-check: ## 检查 ESM、无扩展名导入与 @ 别名边界
	$(BUN) run modules:check

typecheck: ## 运行 TypeScript 类型检查
	$(BUN) run typecheck

test: ## 运行测试
	$(BUN) run test

test-watch: ## 监听并运行测试
	$(BUN) run test:watch

check: ## 运行格式、lint、类型和测试检查
	$(BUN) run check

ci: ## 运行完整 CI 检查和构建
	$(BUN) run ci

build: ## 构建后端和 Electron 主进程
	$(BUN) run build

pack: ## 生成未打包的 Electron 应用目录
	$(BUN) run pack

pack-local: ## 跳过签名发布证据，生成本机验收用 Electron 应用目录
	$(BUN) run pack:local

dist: ## 构建当前平台安装包
	$(BUN) run dist

dist-win: ## 构建 Windows 安装包
	$(BUN) run dist:win

dist-mac: ## 构建 macOS 安装包
	$(BUN) run dist:mac

dist-linux: ## 构建 Linux 安装包
	$(BUN) run dist:linux

debug-ai: ## 启动 AI SDK 调试面板
	$(BUN) run debug:ai

license: ## 生成依赖许可证清单
	$(BUN) run license

vendor-json: ## 将供应商定义转换为 JSON
	$(BUN) run vendor2json

docker-build: ## 构建本地 Docker 镜像
	$(DOCKER) build -t $(DOCKER_IMAGE) .

docker-run: ## 运行本地 Docker 镜像
	$(DOCKER) run --rm -p $(PORT):10588 -v "$(DATA_DIR):/app/data" $(DOCKER_IMAGE)

clean: ## 清理可再生成的输出
	rm -rf ./build ./dist ./coverage
