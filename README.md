# Media Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tauri 2](https://img.shields.io/badge/Tauri-2.0-FFC131?logo=tauri)](https://v2.tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-edition2021-orange?logo=rust)](https://www.rust-lang.org/)

A portable, offline media library manager built with Tauri 2.0. Import, organize, tag, and play your local media collection — comics, audio, and video — all in one lightweight desktop app.

> **AI-Native Roadmap**: Smart tagging with multimodal LLMs, natural language search, voice control, and intelligent recommendations are planned. See [AI Iteration Roadmap](#ai-iteration-roadmap).

## Features

| Feature | Description |
|---------|-------------|
| Import & Scan | Drag-and-drop files/folders, file picker, recursive directory scanning |
| Media Library | Browse, search, and filter by media type, tags, and text |
| Comic Reader | Image viewer with navigation controls |
| Audio Player | Built-in audio playback with playlist support |
| Video Player | Built-in video player with full controls |
| Tag System | CRUD tags, similarity checking, batch tagging |
| Series / Collections | Group related media into series |
| Thumbnails | Auto-generated via FFmpeg (video keyframes, audio cover art) |
| Theme Customization | Background image, blur level, theme switching |
| Import / Export | JSON-based full library export and restore |
| Auto Backup | SQLite database auto-backup every 30s with WAL mode |
| Portable | Single executable, data stored alongside the app |

## Screenshots

<!-- TODO: add screenshots -->

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Framework | Tauri 2.0 |
| Frontend | React 19 + TypeScript + Vite 7 |
| Backend | Rust (edition 2021) |
| Database | SQLite via rusqlite (bundled, WAL mode) |
| State Management | React Context + @tanstack/react-query |
| Virtual Scrolling | @tanstack/react-virtual |
| Testing | Vitest (frontend) + Rust unit tests |
| Thumbnail Generation | FFmpeg |

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) (recommended) or npm
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [FFmpeg](https://ffmpeg.org/) (for thumbnail generation; see [FFmpeg Setup](#ffmpeg-setup))

## Quick Start

```bash
# Install frontend dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build for production
pnpm tauri build
```

## FFmpeg Setup

Media Manager uses FFmpeg to generate thumbnails. Place `ffmpeg.exe` (or `ffmpeg` on macOS/Linux) in one of:

1. `tools/ffmpeg/ffmpeg.exe` (bundled with portable version)
2. System PATH

FFmpeg is distributed separately under the GPL license. You can download it from [ffmpeg.org](https://ffmpeg.org/download.html).

## Project Structure

```
media-manager-tauri/
├── src/                    # React frontend
│   ├── components/         # UI components (Library, Players, Settings, Import, Detail)
│   │   ├── common/         # Shared UI primitives
│   │   ├── library/        # Library grid, filters, search
│   │   ├── player/         # Player components
│   │   ├── modal/          # Detail modal
│   │   ├── settings/       # Settings panel
│   │   └── tags/           # Tag input and management
│   ├── context/            # React Context providers (App, Player, Query)
│   ├── hooks/              # Custom hooks (useLibrary, useTags, useTheme, etc.)
│   ├── api/                # Tauri IPC call wrappers
│   ├── types/              # TypeScript type definitions
│   └── styles/             # CSS modules and global styles
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs         # Entry point
│   │   ├── lib.rs          # App builder, DB schema, thumbnail generation, backup
│   │   └── commands.rs     # ~35 Tauri IPC commands (import, query, CRUD, export)
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri configuration (window, bundle, security)
├── tools/
│   └── ffmpeg/             # FFmpeg binary (not tracked in git)
├── package.json            # Node.js dependencies
└── vite.config.ts          # Vite configuration + Vitest
```

## Building Installers

```bash
# Build NSIS installer (Windows)
pnpm tauri build

# Output
# src-tauri/target/release/bundle/nsis/MediaManager_0.3.0_x64-setup.exe
```

The app installs per-user and stores all data (SQLite database, thumbnails, config) in the user-chosen data directory, making it fully portable.

## AI Iteration Roadmap

| Phase | Feature | Tech Path |
|-------|---------|-----------|
| 1 | Smart Tagging | Multimodal LLM (ollama / Moondream) analyzes media content → auto-generates tags and descriptions |
| 2 | Natural Language Search | SQLite + vector extension / Qdrant for semantic media search |
| 3 | Voice Control | Whisper.cpp local inference for voice commands |
| 4 | Intelligent Recommendations | Embedding similarity-based "you might also like" |

## License

MIT © 2026 Oplus7

FFmpeg binary (if bundled) is distributed under GPL. See [ffmpeg.org](https://ffmpeg.org/legal.html).
