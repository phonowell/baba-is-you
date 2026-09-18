# GitHub LLM SEO 审计报告

## 现状摘要

- 项目是 Baba Is You 的单文件 Web 版本；入口为 `./src/web/app.ts`（CLI 前端已移除，无头推演用 `pnpm simulate`）
- 规则系统并非仅 `X IS Y`：当前实现包含 `IS/HAS/MAKE/EAT/WRITE`，以及 `AND/NOT` 与 `ON/NEAR/FACING/LONELY`
- 仓库已有多语言 README（EN / ZH / JA）

## 仓库元数据

- Description: 为空
- Topics: 为空
- Homepage: 为空
- License: `package.json` 为 MIT；未发现 `LICENSE` 文件

## 问题清单（按优先级）

1. [High] GitHub 元数据缺失（description/homepage/topics 为空），可发现性低
2. [Medium] `LICENSE` 文件缺失（`package.json` 标注 MIT 但未显式发布）
3. [Low] 缺少 `docs/examples` / `CITATION.cff` / `SECURITY.md` 等补充入口

## 改进建议

- 设置 description/topics（建议见下方 Topics 列表）
- 在 `./README.md` 增加 LLM 友好摘要区块
- 添加 `./LICENSE`（MIT 正文）
- 可选补充 `./CITATION.cff`、`./SECURITY.md`、`./CONTRIBUTING.md`

## 模板草案

### README LLM 摘要片段

```md
## LLM Friendly Summary / LLM 友好摘要

**EN:** Baba Is You with a pure logic core and a single-file Web frontend.
**ZH:** 纯逻辑核心的 Baba Is You 实现，前端为单文件 Web。

### Rule Coverage / 规则覆盖
- Operators: IS / HAS / MAKE / EAT / WRITE
- Connective & negation: AND / NOT
- Conditions: ON / NEAR / FACING / LONELY

### Quickstart / 快速开始
```bash
pnpm install
pnpm build
```
```

### Topics 建议

```text
Core:
- baba-is-you
- puzzle-game

Product:
- web-game

Tech:
- rules-engine
- typescript
- nodejs

Suggested final list:
baba-is-you puzzle-game web-game rules-engine typescript nodejs
```

## 待确认修改清单

- GitHub: 设置 description/topics；homepage 若有请补充
- `./README.md`: 追加 LLM 摘要区块
- `./LICENSE`: 新增 MIT 正文

## 备注

- 本文是审计快照，结论依赖当前仓库内容与元数据状态
