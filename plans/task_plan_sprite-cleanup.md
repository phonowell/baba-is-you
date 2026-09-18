# 2D sprite 复查与重绘

来源：全量 sprite preview 目检结论（moon 读成 Pac-Man 等）。

## 重绘（辨识度问题）

- [x] moon — 改为真正的月牙（深缺口 + 'l' 外缘 + 'd' 陨坑），去掉底部暗色底座
- [x] pipe — 改为带管口沿的竖管（不再是蓝框黑芯"显示器"）
- [x] key — 齿移到杆末端、圆形钥匙头带孔
- [x] spike — 加宽三角刺（l/g 双面 + 'd' 底板），不再像芦苇
- [x] hand — 分出四指 + 拇指 + 'd' 腕口，不再是白团
- [x] skull — 明确双眼窝洞 + 鼻洞 + 齿列，不再是红脸恶魔
- [x] ice — 去掉阶梯状大白斑，改两条斜向高光 + 'l' 底棱
- [x] bug — 头/眼/触角 + 背甲中线 + 侧腿，不再是土豆
- [x] belt — 锯齿改为实心 '▶' 链纹 + 帧间 1px 滚动动画（整卡旋转联动方向）
- [x] seastar — 启用未用的 d/l/f：左上 'l' 高光、右下 'd' 暗边、中心 'f'
- [x] rock — 加 's' 裂纹 + 'd' 底坡，棱角化（原读成土豆）
- [x] leaf — 中脉 + 交替侧脉 + 叶柄 + 尖端收束（原读成羽毛/香蕉片）
- [x] door — 门框内阴影 + 上下两块凹陷门板 + 黄铜把手（原读成红色平板）

## 数据卫生

- [x] 清理全部声明但未使用的 palette key（baba/ghost/crab/bird/wall/brick/water/lava/bog/flag/star/sun/love/stump/reed/algae/bolt/cog/rocket/hand/cursor）
- [x] 修正重绘引入的行宽不齐；husk 的 23 宽行为合法右补透明，保持原样

## 复核

- [x] `pnpm tsx scripts/sprite-zoom.ts` 逐个放大复核重绘项（belt 第一轮仍偏弱，二次改为实心三角链后通过）
- [x] `pnpm tsx scripts/sprite-preview.ts` 全量复查（release/sprite-preview.png 1536x1536）
- [x] `pnpm check`（lint 0 警告 + tsc noEmit + 331 tests 全过，含 leaf/door 二次重绘后复跑）

## 遗留物

- `scripts/sprite-zoom.ts`：按名放大渲染的复查工具，已保留（untracked）
- `release/`：preview/zoom 输出目录，untracked
