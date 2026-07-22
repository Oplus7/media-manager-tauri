# Media Manager / 媒体管理器

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tauri 2](https://img.shields.io/badge/Tauri-2.0-FFC131?logo=tauri)](https://v2.tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-edition2021-orange?logo=rust)](https://www.rust-lang.org/)

一款基于 Tauri 2.0 构建的本地媒体文件管理桌面应用。支持导入、标记、搜索和播放本地的漫画/音声/影视文件，数据与程序同目录存放，解压即用。

A portable, offline media library manager built with Tauri 2.0. Import, organize, tag, and play your local media collection — all in one lightweight desktop app.

> **v0.4.0 已接入 AI 知识库**：支持语义搜索、导入即入库、批量索引，通过 [local-rag](https://github.com/Oplus7/local-rag) 实现自然语言检索你的媒体库。详见下方"AI 知识库"章节。
> **v0.4.0**: AI-powered semantic search is here. Auto-index on import, natural language media search via [local-rag](https://github.com/Oplus7/local-rag). See "AI Knowledge Base" below.

---

## 功能概览 / Features

| 功能 Feature | 说明 Description |
|-------------|-----------------|
| 导入扫描 Import & Scan | 拖拽文件/文件夹导入，支持递归扫描子目录 |
| 媒体库浏览 Library | 按媒体类型、标签、文本搜索组合筛选，支持分页 |
| 漫画阅读 Comic Reader | 内建图片阅读器，支持缩放/翻页/缩略图导航 |
| 音频播放 Audio Player | 内建音频播放，自动识别目录内多个文件组成播放列表 |
| 视频播放 Video Player | 内建视频播放，支持选集切换 |
| 标签系统 Tag System | 增删改查标签，相似度检测，批量标记 |
| 系列/合集 Series | 按系列归类管理媒体 |
| 缩略图 Thumbnails | 通过 FFmpeg 自动生成视频关键帧和音频封面缩略图 |
| 主题自定义 Theme | 支持自定义背景图片、模糊度、多套主题配色 |
| 导入导出 Import/Export | 完整 JSON 格式的媒体库导入与导出 |
| 自动备份 Auto Backup | SQLite 数据库每 30 秒自动备份，WAL 模式 |
| 便携部署 Portable | 单文件可执行，数据存于程序所在目录 |
| AI 知识库 AI Knowledge Base | 接入 local-rag，语义搜索/导入即索引/全量批量入库 |

## 截图 / Screenshots

<!-- TODO: 补充截图 -->

## 前提条件 / Prerequisites

| 依赖 | 说明 |
|------|------|
| [Node.js](https://nodejs.org/) >= 18 | 前端构建 |
| [pnpm](https://pnpm.io/)（推荐）或 npm | 包管理器 |
| [Rust](https://www.rust-lang.org/tools/install)（最新稳定版） | 后端编译 |
| [FFmpeg](https://ffmpeg.org/) | 缩略图生成（详见下方配置） |

## 快速开始 / Quick Start

```bash
# 安装前端依赖
pnpm install

# 开发模式运行（前端热重载 + Rust 重编译）
pnpm tauri dev

# 构建正式安装包
pnpm tauri build
```

## 使用说明 / Usage Guide

### 导入媒体 / Importing Media

- **拖拽导入**：直接将文件或文件夹拖入应用窗口，弹出导入确认对话框
- **按钮导入**：点击顶部工具栏"导入"按钮，选择文件或文件夹
- 导入时会自动扫描目录内所有支持的媒体文件（图片/音频/视频），并尝试生成缩略图

### 浏览与搜索 / Browsing & Searching

- **分类筛选**：左侧栏按"全部 / 漫画 / 音声 / 影视"切换
- **二级筛选**：音声和影视分类下可进一步筛选"系列"还是"单作"
- **搜索**：顶部搜索框支持文本搜索，可匹配文件名、作者、标签
- **排序**：支持按最近更新、名称排序，每页数量可调 (20/50/100/200)

### 播放媒体 / Playing Media

- 点击封面进入详情弹窗 → 点击"播放"按钮
- 播放模式可在设置中切换：**内置播放器** / **系统默认程序打开**
- 漫画：翻页支持方向键和缩略图导航
- 音频：自动识别目录内多个音频文件组成连续播放列表
- 视频：自带完整播放控件，多集作品支持选集切换

### AI 知识库 / AI Knowledge Base

> **架构说明**：Media Manager 本身不嵌入 AI 引擎。所有 RAG 功能由独立的 [local-rag](https://github.com/Oplus7/local-rag) 服务通过 HTTP 提供。
>
> ```
> Media Manager ──HTTP──→ local-rag (port 8100) ──→ Ollama / 阿里云百炼 API
> ```
>
> **你需要先安装并运行 local-rag。** 详细步骤见 [local-rag](https://github.com/Oplus7/local-rag) 仓库。两种 AI 后端可选：
> - **方式一：本地 Ollama**（离线免费，需 GPU）：`ollama pull qwen3:8b bge-m3` → 启动 local-rag
> - **方式二：云端 API**（无需 GPU，需 API Key）：编辑 `.env` 填入阿里云百炼或任意 OpenAI 兼容端点

- **配置**：设置 → RAG → 服务端点填 `http://localhost:8100` → 保存并测试连接
- **批量索引**：点击「索引全部媒体库」一次入库所有存量媒体，分页进度 X/N 实时显示
- **单条索引**：详情页点击「加入知识库」按钮，将该媒体元数据送入向量库（幂等写入）
- **自动索引**：导入新媒体时自动入库，无需手动操作
- **语义搜索**：工具栏「知识库」按钮 → 输入自然语言问题 → 检索匹配媒体 → 点击「→ 来源」跳转详情
- **删除同步**：删除媒体时自动清除知识库对应向量，不留鬼影

> **Architecture**: Media Manager does NOT bundle any AI engine. All RAG features are provided by the standalone [local-rag](https://github.com/Oplus7/local-rag) service over HTTP REST API:
>
> ```
> Media Manager ──HTTP──→ local-rag (port 8100) ──→ Ollama / Alibaba Cloud Bailian
> ```
>
> **You must install and run local-rag separately.** See [local-rag](https://github.com/Oplus7/local-rag) for setup instructions. Two AI backend options:
> - **Option 1 — Local Ollama** (offline, free, needs GPU): `ollama pull qwen3:8b bge-m3` then start local-rag
> - **Option 2 — Cloud API** (no local GPU, needs API key): configure `.env` with Aliyun Bailian or any OpenAI-compatible endpoint

- 点击卡片进入详情页，可添加/删除标签
- 标签输入支持自动补全（根据已有标签匹配）
- 在导入时可直接指定归属系列，也可在详情页修改
- 标签可跨作品使用，方便按主题检索

### 主题与外观 / Theme & Appearance

- 设置 → 外观 → 选择主题配色（暗色/亮色/护眼等 5+ 套方案）
- 支持自定义背景图片，可调整模糊度
- 封面透明效果可开关

### 数据备份 / Data Backup

- 数据库每 30 秒自动备份一次，备份文件与主数据库同目录
- 可通过"设置 → 数据 → 导出"将整个媒体库导出为 JSON 文件
- 换电脑或重装后，通过"设置 → 数据 → 导入"恢复
- JSON 导入会自动合并标签和系列数据
- **所有数据（数据库、封面、缩略图、配置）存放在 `SaveData/` 目录下，安装版与便携版通用。** 安装新版不会覆盖已有数据；可将旧版 SaveData 目录直接复制到新版程序所在目录，即可载入全部媒体库。

### 便携版使用 / Portable Mode

- **解压即用**：将整个程序目录（含 `tools/ffmpeg/ffmpeg.exe`）放入任意位置即可运行
- **数据随程序走**：所有数据（数据库、缩略图、配置）存在程序所在目录的 `SaveData/` 下
- **安装版**：默认安装到 `C:\Users\<用户名>\AppData\Local\MediaManager\`，数据也在该目录下

### 应用内数据目录结构 / Data Directory Layout

```
SaveData/
├── media_data.db          # 主数据库（SQLite, WAL 模式）
├── media_data_backup.db   # 自动备份（每 30 秒更新）
├── thumbs/                # 缩略图缓存
├── covers/                # 封面图缓存
└── config/                # 用户设置
```

## FFmpeg 配置 / FFmpeg Setup

Media Manager 使用 FFmpeg 生成视频和音频缩略图。`ffmpeg.exe`（或 macOS/Linux 下的 `ffmpeg`）放在以下位置之一即可（运行时自动按顺序查找）：

1. `tools/ffmpeg/ffmpeg.exe` — 与程序同目录（便携版推荐）
2. `tools/ffmpeg/bin/ffmpeg.exe` — 备选路径
3. 系统 PATH 环境变量中全局安装的 `ffmpeg`

FFmpeg 是 GPL 协议软件，需单独下载：https://ffmpeg.org/download.html

Media Manager uses FFmpeg for thumbnail generation. It auto-detects `ffmpeg` from:
1. `tools/ffmpeg/ffmpeg.exe` (alongside the program — recommended for portable)
2. `tools/ffmpeg/bin/ffmpeg.exe` (alternate)
3. System PATH

FFmpeg is distributed separately under GPL: https://ffmpeg.org/download.html

## 技术栈 / Tech Stack

| 层级 Layer | 技术 Technology |
|-----------|----------------|
| 桌面框架 Desktop Framework | Tauri 2.0 |
| 前端 Frontend | React 19 + TypeScript + Vite 7 |
| 后端 Backend | Rust (edition 2021) |
| 数据库 Database | SQLite via rusqlite (bundled, WAL mode) |
| 状态管理 State | React Context + @tanstack/react-query |
| 虚拟滚动 Virtual Scroll | @tanstack/react-virtual |
| 测试 Testing | Vitest (frontend) + Rust unit tests |
| 缩略图 Thumbnails | FFmpeg |

## 项目结构 / Project Structure

```
media-manager-tauri/
├── src/                    # React 前端
│   ├── components/         # UI 组件（Library/Players/Settings/Import/Detail/RagPanel）
│   │   ├── common/         # 共用基础组件
│   │   ├── library/        # 媒体库网格/筛选/搜索
│   │   ├── player/         # 播放器组件
│   │   ├── modal/          # 详情弹窗
│   │   ├── settings/       # 设置面板
│   │   └── tags/           # 标签输入与管理
│   ├── context/            # React Context 状态管理（App/Player/Query）
│   ├── hooks/              # 自定义 Hooks（useLibrary/useTags/useTheme 等）
│   ├── api/                # Tauri IPC 调用封装
│   ├── types/              # TypeScript 类型定义
│   └── styles/             # CSS 模块与全局样式
├── src-tauri/              # Rust 后端
│   ├── src/
│   │   ├── main.rs         # 入口
│   │   ├── lib.rs          # 应用构建、DB Schema、缩略图生成、备份
│   │   └── commands.rs     # ~35 个 Tauri IPC 命令（导入/查询/增删改/导出）
│   ├── Cargo.toml
│   └── tauri.conf.json     # 窗口/打包/安全配置
├── tools/ffmpeg/           # FFmpeg 二进制（不入 git）
├── package.json
└── vite.config.ts          # Vite 构建配置 + Vitest 测试配置
```

## 构建安装包 / Building Installers

```bash
# 构建 NSIS 安装包（Windows）
pnpm tauri build

# 输出位置
# src-tauri/target/release/bundle/nsis/MediaManager_0.4.0_x64-setup.exe
```

安装包默认安装到当前用户目录，所有数据（SQLite 数据库、缩略图、配置）存储在用户选择的数据目录中。如需纯便携版（zip 压缩包解压即用），修改 `src-tauri/tauri.conf.json`：

The installer installs per-user by default. For a pure portable zip archive, modify `src-tauri/tauri.conf.json`:

```json
"targets": ["nsis", "zip"]
```

## 许可证 / License

MIT © 2026 Oplus7

FFmpeg 如随附分发则遵循 GPL 协议：[ffmpeg.org](https://ffmpeg.org/legal.html)
FFmpeg (if bundled) is distributed under GPL: [ffmpeg.org](https://ffmpeg.org/legal.html)
