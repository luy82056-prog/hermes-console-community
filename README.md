# Hermes Console

Hermes Agent 的 macOS 桌面工作台，将会话、模型、任务、权限、知识库和日志集中到一个界面。

## 快速开始

先在目标 Mac 安装并配置 Hermes Agent，确认终端可运行 `hermes --version`。再执行：

```sh
npm ci
npm run typecheck
npm run dev
```

`npm run build` 构建前端与 Electron 主进程。`npm run dist` 还需 uv、Python 及本机打包工具，用于构建观测台的 Python worker 和 macOS 产物。

## 使用示例

进入「我的 Agent」，选择已配置的本地 Agent，输入一条普通任务。需要人工授权时从权限窗口核对操作。可在模型配置中心更换自己配置的模型，从知识库整理经确认的条目，在观测台查看可用的运行信息。登录、账号和资料均使用你自己的本机环境。

## 代码结构

- `src/main/` 负责 Electron 主进程、运行时适配、模型与本地数据。
- `src/renderer/` 是 React 界面，`src/preload/` 暴露受控桥接接口。
- `scripts/` 包含本机工具与观测台 worker，`tests/` 包含回归测试。
- `vendor/orbit-data/` 保存引用的数据引擎及其来源信息。

## 开发过程

[查看开发历程](DEVELOPMENT.md)

## 许可与使用范围

控制台原创代码采用 MIT。BabyReader、Orbit 数据引擎与 Hermes Agent 分别遵循原许可。见 [第三方声明](THIRD_PARTY_NOTICES.md)。
