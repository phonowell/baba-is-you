# GitHub LLM SEO 审计报告

## 现状摘要

- 项目是 Baba Is You 的终端 + 单文件 Web 版本；入口分别为 `./src/cli.ts` 与 `./src/web/app.ts`
- 规则系统并非仅 `X IS Y`：当前实现包含 `IS/HAS/MAKE/EAT/WRITE`，以及 `AND/NOT` 与 `ON/NEAR/FACING/LONELY`
- 仓库已有多语言 README（EN / ZH / JA）

## 仓库元数据

- Description: 为空
- Topics: 为空
- Homepage: 为空
- License: `package.json` 为 MIT；未发现 `LICENSE` 文件

## 问题清单（按优先级）

1. [High] GitHub 元数据缺失（description/homepage/topics 为空），可发现性低
2. [Medium] `llms.txt` 与 `llms.md` 缺失，LLM 快速抓取入口缺失
3. [Medium] `LICENSE` 文件缺失（`package.json` 标注 MIT 但未显式发布）
4. [Low] 缺少 `docs/examples` / `CITATION.cff` / `SECURITY.md` 等补充入口

## 改进建议

- 设置 description/topics（建议见下方 Topics 列表）
- 添加 `./llms.txt`、`./llms.md`，并在 `./README.md` 增加 LLM 友好摘要区块
- 添加 `./LICENSE`（MIT 正文）
- 可选补充 `./CITATION.cff`、`./SECURITY.md`、`./CONTRIBUTING.md`

## 模板草案

### llms.txt

```text
Project: Baba Is You CLI
Repository: https://github.com/phonowell/baba-is-you
Homepage: none

Summary (EN): Terminal-first Baba Is You with a pure logic core, plus CLI and single-file Web frontends.
摘要 (ZH): 以终端为主的 Baba Is You 实现，纯逻辑核心，提供 CLI 与单文件 Web 两套前端。

Core rules (EN): IS/HAS/MAKE/EAT/WRITE + AND/NOT + ON/NEAR/FACING/LONELY
核心规则 (ZH): IS/HAS/MAKE/EAT/WRITE + AND/NOT + ON/NEAR/FACING/LONELY

Primary use cases (EN):
- Play Baba Is You in terminal
- Explore a rule-driven puzzle engine in TypeScript
- Export and run a single-file offline Web build
主要用途 (ZH):
- 在终端体验 Baba Is You
- 研究 TypeScript 规则驱动解谜引擎
- 构建并离线运行单文件 Web 版本

Keywords (EN): baba-is-you, terminal-game, web-game, puzzle-game, rules-engine
关键词 (ZH): baba-is-you, 终端游戏, 网页游戏, 规则解谜

Install (EN): pnpm install
安装 (ZH): pnpm install

Quick usage (EN):
- pnpm start
- pnpm build
快速使用 (ZH):
- pnpm start
- pnpm build

Docs:
- README.md
- README.zh-CN.md
- README.ja.md

License: MIT (package.json)
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
- EN: Terminal-first Baba Is You with a pure logic core, plus CLI and single-file Web frontends.
- ZH: 以终端为主的 Baba Is You 实现，纯逻辑核心，提供 CLI 与单文件 Web 两套前端。

## Rules
- Operators: IS / HAS / MAKE / EAT / WRITE
- Connective & negation: AND / NOT
- Conditions: ON / NEAR / FACING / LONELY

## Keywords / 关键词
- EN: baba-is-you, terminal-game, web-game, puzzle-game, rules-engine
- ZH: baba-is-you, 终端游戏, 网页游戏, 规则解谜

## Install / 使用
```bash
pnpm install
pnpm start
pnpm build
```

## Docs
- README.md
- README.zh-CN.md
- README.ja.md

## License / Citation / Contact
- License: MIT (declared in package.json)
- Citation: none
- Contact: https://github.com/phonowell/baba-is-you/issues
```

### README LLM 摘要片段

```md
## LLM Friendly Summary / LLM 友好摘要

**EN:** Terminal-first Baba Is You with a pure logic core, plus CLI and single-file Web frontends.
**ZH:** 以终端为主的 Baba Is You 实现，纯逻辑核心，提供 CLI 与单文件 Web 两套前端。

### Rule Coverage / 规则覆盖
- Operators: IS / HAS / MAKE / EAT / WRITE
- Connective & negation: AND / NOT
- Conditions: ON / NEAR / FACING / LONELY

### Quickstart / 快速开始
```bash
pnpm install
pnpm start
pnpm build
```
```

### Topics 建议

```text
Core:
- baba-is-you
- puzzle-game

Product:
- terminal-game
- web-game
- cli-game

Tech:
- rules-engine
- typescript
- nodejs

Suggested final list:
baba-is-you puzzle-game terminal-game web-game cli-game rules-engine typescript nodejs
```

## 待确认修改清单

- GitHub: 设置 description/topics；homepage 若有请补充
- `./llms.txt`: 新增
- `./llms.md`: 新增
- `./README.md`: 追加 LLM 摘要区块
- `./LICENSE`: 新增 MIT 正文

## 备注

- 本文是审计快照，结论依赖当前仓库内容与元数据状态
