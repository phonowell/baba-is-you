# GitHub LLM SEO 审计报告

## 现状摘要
- 终端版 Baba Is You CLI，规则简化为 X IS Y；入口 ./src/cli.ts；多语言 README
- 未发现 docs/examples/CHANGELOG/CONTRIBUTING/SECURITY/CITATION 文件

## 仓库元数据
- Description: 为空
- Topics: 为空
- Homepage: 为空
- License: package.json 为 MIT；未发现 LICENSE 文件

## 问题清单（按优先级）
1. [High] GitHub 元数据缺失（description/homepage/topics 为空），可发现性低
2. [Medium] llms.txt 与 llms.md 缺失，LLM 快速抓取入口缺失
3. [Medium] LICENSE 文件缺失（package.json 标注 MIT 但未显式发布）
4. [Low] 缺少 docs/examples/citation 等引用入口

## 改进建议
- 设置 description/topics（建议见 Topics 列表）
- 添加 ./llms.txt、./llms.md，并在 ./README.md 增加 LLM 友好摘要区块
- 添加 ./LICENSE（MIT 正文）
- 可选补充 ./CITATION.cff 或 README 引用说明

## 模板草案
### llms.txt
```text
Project: Baba Is You CLI
Repository: https://github.com/phonowell/baba-is-you
Homepage: none

Summary (EN): Terminal Baba Is You clone with simplified X IS Y rules, pure logic core, stateless renderer.
摘要 (ZH): 终端版 Baba Is You，规则简化为 X IS Y，逻辑纯函数、渲染无状态。

Primary use cases (EN):
- Play a simplified Baba Is You puzzle game in the terminal
- Explore rule-based puzzle mechanics in a minimal CLI
主要用途 (ZH):
- 在终端体验简化版 Baba Is You 解谜
- 研究最小化规则引擎与玩法

Keywords (EN): baba-is-you, terminal-game, puzzle-game
关键词 (ZH): baba-is-you, 终端游戏, 规则解谜

Install (EN): pnpm install
安装 (ZH): pnpm install

Quick usage (EN):
- pnpm start
快速使用 (ZH):
- pnpm start

API/Docs: none
Examples: none
License: MIT
Citation: none
Contact: https://github.com/phonowell/baba-is-you/issues
```

### llms.md
```md
# LLM Quick Card

## Project
- Name: Baba Is You CLI
- Repo: https://github.com/phonowell/baba-is-you
- Homepage: none

## Summary
- EN: Terminal Baba Is You clone with simplified X IS Y rules, pure logic core, stateless renderer.
- ZH: 终端版 Baba Is You，规则简化为 X IS Y，逻辑纯函数、渲染无状态。

## What it does / 主要用途
- EN: Play a simplified Baba Is You puzzle game in the terminal; Explore rule-based puzzle mechanics in a minimal CLI
- ZH: 在终端体验简化版 Baba Is You 解谜；研究最小化规则引擎与玩法

## Keywords / 关键词
- EN: baba-is-you, terminal-game, puzzle-game
- ZH: baba-is-you, 终端游戏, 规则解谜

## Install / 安装
- EN: pnpm install
- ZH: pnpm install

## Quickstart / 快速开始
```bash
pnpm install
pnpm start
```

## Docs & API
- Docs: none
- API: none

## Examples
- none

## License / Citation / Contact
- License: MIT
- Citation: none
- Contact: https://github.com/phonowell/baba-is-you/issues
```

### README LLM 摘要片段
```md
## LLM Friendly Summary / LLM 友好摘要

**EN:** Terminal Baba Is You clone with simplified X IS Y rules, pure logic core, stateless renderer.
**ZH:** 终端版 Baba Is You，规则简化为 X IS Y，逻辑纯函数、渲染无状态。

### Quickstart / 快速开始
```bash
pnpm install
pnpm start
```

### Key Capabilities / 核心能力
- EN: Simplified X IS Y rules; Pure logic core; Stateless renderer
- ZH: 简化 X IS Y 规则；逻辑纯函数；渲染无状态

### Typical Use Cases / 典型场景
- EN: Play a simplified Baba Is You puzzle game in the terminal
- ZH: 在终端体验简化版 Baba Is You 解谜

### Keywords / 关键词
- EN: baba-is-you, terminal-game, puzzle-game
- ZH: baba-is-you, 终端游戏, 规则解谜

### Docs & API / 文档与 API
- Docs: none
- API: none
- Examples: none
```

### Topics 建议
```text
Core topics:
- baba-is-you
- puzzle-game

Domain:
- terminal-game
- cli-game

Task:
- rules-engine
- rule-based-game

Language:
- typescript
- nodejs

Format:
- cli

Suggested final list:
baba-is-you puzzle-game terminal-game cli-game rules-engine typescript nodejs cli
```

## 待确认修改清单
- GitHub: 设置 description/topics；homepage 若有请补充
- ./llms.txt: 新增
- ./llms.md: 新增
- ./README.md: 追加 LLM 摘要区块
- ./README.zh-CN.md: 是否同步
- ./LICENSE: 新增 MIT

## 备注
- gh 获取元数据返回空字段；未获取 releases/CHANGELOG 等文件
