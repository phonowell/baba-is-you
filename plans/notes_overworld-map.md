# Overworld 官方地图格式调研笔记

调研对象：`data/baba/`（官方关卡 dump，gitignored，本地存在）。结论已用
`parseLevelBinary`/`parseLd`/`buildLevelTileMap` 实跑验证。

## 地图文件识别

- `*.ld` `[general] leveltype=1` → 地图（共 15 个：`106level`(主图, name=map)、
  `177level`湖、`207level`岛、`206level`遗迹、`16level`秋、`169level`深林、
  `87level`火箭、`179level`火山洞、`180level`花园、`182level`深坑、
  `200level`???、`232level`山顶、`304level`center、`264level`depths、
  `283level`meta）
- 地图 `.l` 与普通关同二进制格式（`ACHTUNG!`/`LAYR`/`MAIN`/`DATA`），3 层；
  现有 `parseLevelBinary` 直接可读。装饰物经 tileMap+DEFAULT_ASSIGNMENTS
  解析成常规名（tree/star/algae/hedge/dust/cloud/rocket/baba/is/you/flag/win…）。
  `*_map` 图像是地图专用变体（door_map 等），`_image` 字段不进 tileMap 名字。
- `tile_0_0`（每图 ~106 格）= 边界填充；`tile_8_8` → object103 = `text_level`。

## `.ld` 地图专属段（`parseLd` 目前只读 general/currobjlist/tiles，需要扩展）

`[general]`：`selectorX/selectorY`（光标初始格）、`customparent`（父图文件，
106→200level）、`palette`、`notcompleteable`。
`[images]`：`N=name` 背景图名（island/island_decor…）。
`[icons]`：`Nfile=icon_<name>_1` 世界图标 sprite 名（仅 106level 有，
lake/island/ruins/forest/abstract/space/cave/garden/mountain/fall/dust/level）。
`[levels]`（图标，`N`=序号）：`file=NNNlevel` 目标文件、`X/Y/Z` 坐标、
`colour=cx,cy` 调色板格、`state`（0/1/2 进度态，不锁可忽略）、`number`、`style`。
`[paths]`（路径点）：`object=objectNNN`（object117=line、object061=door 等）、
`X/Y`、`dir`（0-3）、`style`。**paths 不在 .l 网格里**，是 .ld 覆盖层，导入时必须注入。

## style/number 语义（用 ASCII 树对照验证）

- `style=0`：数字点图标，`number` = 地图上显示的关卡序号（0level→0、1level→1…）
- `style=1`：字母关图标，`number` = 字母序（0=a…4=e；fall 图 a-e 验证通过）
- `style=2`：特殊/extra 图标，`number` = extra 序（0=extra-1…，fall extras 验证）；
  也用于地图回链（106 回链 number=10）与特殊入口（center/? number=10/11）
- `style=-1`：世界入口，`number` = `[icons]` 索引 → `icon_<name>_1`
- 同一 file 可出现多个图标（78level "?" ×2、269level ×2），如实保留

## 坐标系

`.ld` 的 X/Y 与 `.l` 网格同一坐标空间（含 1 格边框），`convertOneLevel`
输出裁剪 (1,1) 边框 —— 图标/路径/selector 坐标同样要 -1。

## 可行走网络（连通性实测）

可行走格 = icon ∪ path(line)。子图基本全连通：177=22/22、87=29/29、
169=45/48；主图 comp0=133 节点大连通 + comp1=12 相邻图标簇（0-7 数字区）
+ 4 个孤立图标（center/depths/meta/?，终局入口）。孤立图标走不到 = 可接受，
与官方行为接近（它们本来就有解锁门槛）。

## 移动与进入（沿用 ../baba 模型）

- cursor 非规则实体：方向输入在含 line/level 实体格上走一格（step 内
  `cursor-move` 阶段，player-move 后、auto-move 前）；无 cursor 不 lose
- Enter：光标所在格有 level 图标 → 进入（map→下钻/回父图；level→进关）
- 返回：胜利或 Esc → 回父图，光标落在刚完成的图标上（栈帧存 returnToFile）

## 目标解析

图标 `file=NNNlevel` → leveltype=1 为地图链（kind=map，按 mapFile 下钻；
栈中已有该图=回退弹栈），leveltype=0/被过滤/缺失为关链（kind=level，
import 时解析成 levels 数组下标；解析不了 → unresolved 置灰不可进）。

## Sprites

dump 的 `Sprites/`、`Sprites_fi/` 为空 —— 无 icon_*.png、无调色板 png。
世界图标需手绘 ~12 个；`colour` 暂无调色板可解，先用固定徽标配色。
