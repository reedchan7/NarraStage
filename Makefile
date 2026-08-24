.DEFAULT_GOAL := help

BUN ?= bun
DOCKER ?= docker
DOCKER_IMAGE ?= narrastage
PORT ?= 10588
DATA_DIR ?= $(CURDIR)/data
APP_BUNDLE ?= NarraStage.app
APPLICATIONS_DIR ?= /Applications
UNAME_S := $(shell uname -s)
UNAME_M := $(shell uname -m)

ifeq ($(UNAME_M),arm64)
MAC_PACK_DIR := dist/mac-arm64
else
MAC_PACK_DIR := dist/mac
endif

# 分组约定：
#   ##@ 标题     — 出现在 `make help` 里的分组名
#   target: ## 说明 — 出现在对应分组下

##@ 帮助
.PHONY: help
help: ## 显示可用命令
	@awk 'BEGIN {FS = ":.*## "; printf "用法: make <target>\n"} \
		/^##@/ { printf "\n%s\n", substr($$0, 5) } \
		/^[a-zA-Z0-9_-]+:.*## / { printf "  %-20s %s\n", $$1, $$2 } \
		END { printf "\n" }' $(MAKEFILE_LIST)

##@ 环境
.PHONY: install deps-check hooks
install: ## 按锁文件安装依赖
	$(BUN) install --frozen-lockfile

deps-check: ## 检查依赖是否有可用更新
	$(BUN) outdated --latest

hooks: ## 安装 Lefthook Git hooks
	$(BUN) run hooks

##@ 开发
.PHONY: dev web-dev desktop-dev dev-gui dev-gui-vite start debug-ai
dev: ## 启动后端开发服务
	$(BUN) run dev

web-dev: ## 启动 Web 客户端开发环境
	$(BUN) run web:dev

desktop-dev: ## 启动桌面客户端开发环境
	$(BUN) run dev:gui

dev-gui: ## 启动 Electron 桌面开发环境
	$(BUN) run dev:gui

dev-gui-vite: ## 连接 Vite 前端启动 Electron
	$(BUN) run dev:gui-vite

start: ## 启动已构建的生产服务
	$(BUN) run start

debug-ai: ## 启动 AI SDK 调试面板
	$(BUN) run debug:ai

##@ 质量
.PHONY: \
	workspace-check \
	contracts-check \
	runtime-check \
	modules-check \
	format \
	format-check \
	lint \
	lint-fix \
	typecheck \
	web-check \
	server-test \
	test \
	test-watch \
	check \
	ci
workspace-check: ## 检查多端工作区、锁文件和 TypeScript 版本策略
	$(BUN) run workspace:check

contracts-check: ## 检查共享 API 契约是否与服务端一致
	$(BUN) run contracts:check

runtime-check: ## 检查 Bun 运行时版本
	$(BUN) run runtime:check

modules-check: ## 检查 ESM、无扩展名导入与 @ 别名边界
	$(BUN) run modules:check

format: ## 使用 Oxfmt 格式化代码
	$(BUN) run format

format-check: ## 检查代码格式
	$(BUN) run format:check

lint: ## 使用 Oxlint 检查代码
	$(BUN) run lint

lint-fix: ## 自动修复可安全修复的 lint 问题
	$(BUN) run lint:fix

typecheck: ## 运行 TypeScript 类型检查
	$(BUN) run typecheck

web-check: ## 检查 Web 客户端
	$(BUN) run web:check

server-test: ## 运行服务端测试
	$(BUN) run test:server

test: ## 运行测试
	$(BUN) run test

test-watch: ## 监听并运行测试
	$(BUN) run test:watch

check: ## 运行格式、lint、类型和测试检查
	$(BUN) run check

ci: ## 运行完整 CI 检查和构建
	$(BUN) run ci

##@ 构建
.PHONY: web-build web-package build pack pack-local install-app dist dist-win dist-mac dist-linux
web-build: ## 构建 Web 客户端
	$(BUN) run web:build

web-package: ## 构建并嵌入仓库内 Web 客户端
	$(BUN) run web:package

build: ## 构建后端和 Electron 主进程
	$(BUN) run build

pack: ## 生成未打包的 Electron 应用目录
	$(BUN) run pack

pack-local: ## 跳过签名发布证据，生成本机验收用 Electron 应用目录
	$(BUN) run pack:local

install-app: ## 将本机桌面应用安装到 /Applications（仅 macOS；缺包时先 pack-local）
	@if [ "$(UNAME_S)" != "Darwin" ]; then echo "install-app 仅支持 macOS" >&2; exit 1; fi
	@if pgrep -x NarraStage >/dev/null; then echo "请先退出正在运行的 NarraStage，再执行 make install-app" >&2; exit 1; fi
	@if [ ! -d "$(MAC_PACK_DIR)/$(APP_BUNDLE)" ]; then $(MAKE) pack-local; fi
	@test -d "$(MAC_PACK_DIR)/$(APP_BUNDLE)" || { echo "未找到 $(MAC_PACK_DIR)/$(APP_BUNDLE)" >&2; exit 1; }
	rm -rf "$(APPLICATIONS_DIR)/$(APP_BUNDLE)"
	ditto "$(MAC_PACK_DIR)/$(APP_BUNDLE)" "$(APPLICATIONS_DIR)/$(APP_BUNDLE)"
	-xattr -cr "$(APPLICATIONS_DIR)/$(APP_BUNDLE)"
	@echo "已安装到 $(APPLICATIONS_DIR)/$(APP_BUNDLE)"

dist: ## 构建当前平台安装包
	$(BUN) run dist

dist-win: ## 构建 Windows 安装包
	$(BUN) run dist:win

dist-mac: ## 构建 macOS 安装包
	$(BUN) run dist:mac

dist-linux: ## 构建 Linux 安装包
	$(BUN) run dist:linux

##@ 工具
.PHONY: license vendor-json
license: ## 生成依赖许可证清单
	$(BUN) run license

vendor-json: ## 将供应商定义转换为 JSON
	$(BUN) run vendor2json

##@ Docker
.PHONY: docker-build docker-run
docker-build: ## 构建本地 Docker 镜像
	$(DOCKER) build -t $(DOCKER_IMAGE) .

docker-run: ## 运行本地 Docker 镜像
	$(DOCKER) run --rm -p $(PORT):10588 -v "$(DATA_DIR):/app/data" $(DOCKER_IMAGE)

##@ 清理
.PHONY: clean
clean: ## 清理可再生成的输出
	rm -rf ./build ./dist ./coverage
