# HD-2D 特征调研与本项目落地

## 调研范围与方法

- 时间：2026-02-27
- 工具：`agent-browser`
- 目标：提炼 HD-2D 的主要视觉特征，并映射到当前仓库（终端 + Web 渲染）
- 说明：Unreal Engine 官方访谈页被 Cloudflare challenge 拦截，本文未将其作为直接证据

## 可证据化的 HD-2D 核心特征

### 1) 2D 像素元素 + 3D 场景融合（核心定义）

- 官方商品描述（Nintendo / Square Enix）都将 HD-2D 明确为“复古像素艺术 + 3DCG 的融合”
- 这说明 HD-2D 不是纯像素放大，也不是纯 3D，而是“角色表现与空间表现分层处理”

### 2) 通过现代光照与后处理制造“模型场景感”

- Polygon 对风格拆解提到：平滑镜头移动、先进光照、氛围效果、夸张景深
- Wikipedia 的风格条目总结了常见组合：动态光照、景深、tilt-shift、bloom、体积雾、粒子、视差
- 这两类来源共同支持“diorama（微缩景观）观感”是 HD-2D 的视觉目标之一

### 3) 复古语义保持 + 现代可读性增强

- Polygon 的观点可归纳为：保留经典像素角色语义，同时用现代渲染增强空间层次与质感
- 对玩法类项目的启发是：优先保护可读性和符号语义，再叠加视觉层

## 与当前仓库的映射

### 现状（已具备）

- Web 端已经具备 HD-2D 的一部分关键基建：
- 透视相机、阴影、后处理（Bloom + Bokeh）已存在（`src/web/board-3d.ts`）
- 顶光 + 环境光、落地阴影、移动插值与落地反馈已存在（`src/web/board-3d.ts`）
- 棋盘与实体已有分层深度、材质与发光参数（`src/web/board-3d.ts`）

### 差距（还不够“HD-2D”）

- 当前实体主要是“卡片化平面 + 字符”，不是“像素 sprite 语义优先”的视觉系统
- 缺少稳定的“镜头语言模板”（例如固定轻 tilt + 可控焦平面策略）
- 缺少“氛围层可配置系统”（雾、粒子、色调映射的统一控制）
- 终端渲染路径还没有“HD-2D 等价表达规范”（只能做风格映射，不能做真实 3D）

## 终端与 Web 的双路径落地建议

### P0（先做，低风险，高收益）

- 建立单一 `HD2D preset` 配置层：统一管理 Bloom / DOF / 光照 / 阴影参数
- 固化镜头策略：按棋盘尺寸选择有限几档镜头而非连续漂移，降低晕眩和调参成本
- 增加“可读性保护阈值”：文字块与规则区在任何后处理中都保持对比度下限

### P1（中期，风格成型）

- 将 Web 实体纹理从“卡片字面”升级为“像素 sprite + 受光 billboard”模式
- 增加轻量氛围层：粒子尘埃、远景雾、色偏 LUT（可一键开关）
- 设计“语义优先”规则：`you/win/stop/...` 相关对象优先清晰，背景特效让位

### P2（终端等价风格，不追求伪 3D）

- 终端新增“HD2D-ANSI 主题”：
- 主体层：高对比符号色
- 空间层：弱阴影/弱渐变背景（ANSI）
- 交互层：移动/落地短暂高亮脉冲
- 保持现有约束：2 字母文本块、`IS` 特殊色、规则与字典持续可见

## 验收标准（针对本仓库）

- Web：固定 preset 下，仍能稳定辨识文本规则与可推动对象
- Web：`pnpm type-check` 通过，交互帧率无明显退化（主观无卡顿）
- 终端：开启 ANSI 主题后，规则可读性不低于默认主题
- 两端：不改动 `src/logic` 语义，只改 `src/view` / `src/web`

## 当前实现备注（2026-02-27）

- Web 端已收敛为单一固定 `HD2D_PRESET`，不提供多 preset 切换。
- 不支持通过 URL 参数（如 `?hd2d=`）切换视觉 preset。

## 参考来源

- Nintendo Store - OCTOPATH TRAVELER II  
  https://www.nintendo.com/us/store/products/octopath-traveler-ii-switch/
- Square Enix - OCTOPATH TRAVELER II  
  https://www.square-enix-games.com/en_US/games/octopath-traveler-ii
- Polygon - Live A Live HD-2D 分析  
  https://www.polygon.com/23278977/live-a-live-hd-2d-remake-square-enix-jrpg/
- Wikipedia - HD-2D（用于风格特征汇总，非官方一手）  
  https://en.wikipedia.org/wiki/HD-2D
