# 2D sprite 画风统一：官方剪影彩色化 + 过小 sprite 放大

来源：sprite-preview 全量目检 —— 官方导入集（`objects-official.ts`，59 个灰白剪影）
与手绘集（2–5 色、饱和、定向光影）画风割裂；内容尺寸 9–24px 不等导致有效分辨率差 2.7×。

美术方向（用户确认）：不沿用官方配色，用项目自己的风格 —— 高辨识度、细腻、高饱和、可爱。
手绘基准：饱和主色 + 左上亮/右下暗定向光影 + 底部暗带，无描边，24×24 画布内容 ~15–20px。

## 基础设施

- [x] `pixel-sprites/recolor.ts`：`recolorSprite(sprite, spec)` —— `map` key 重映射 +
      `bands` 行带（可选 x 列夹）+ `fill` 洞内填充 + `shade` 对角光影 + `set` 逐帧像素覆盖；同步处理 volumes
- [x] `pixel-sprites/index.ts`：OFFICIAL 在前、手绘文件在后 —— `objects.ts` 写同名 sprite 即晋升覆盖
- [x] 试画 5 个样例（gem/bee/burger/fish/clock）：gem/burger/clock 用 recolor 成立；
      fish/bee 剪影太差改直接重画（已验收）

## 官方剪影重绘（59 个，全部完成，在 objects.ts 晋升）

- [x] 3–4 key（9）：burger bucket car cart cat donut lamp tower train
      —— car 需 `bands` 的 x 列夹分出温室玻璃
- [x] 2 key（22）：banana bee blob dog dreamwall drum fofo guitar it jiji lock
      monster pants ring road sax seed sprout track turnip vine worm
      —— bee/seed 后改为手绘帧；drum 复核中（鼓面偏宽，可再修）
- [x] 1 key（26）：arrow book circle crystal egg eye foot hihat house lever lift
      lizard piano pixel plane planet potato pumpkin selector shell sign square
      teeth triangle wind —— cursor 本就是手绘
      —— eye/house/book 用 `fill`+`set` 做眼球/窗洞/书页效果

## 过小 sprite 放大（14 个，全部完成）

seed(9×9→11×15 手绘) husk(→11×15) jelly(→14×14) fungus(→17×14) orb(→16×14)
skull(→14×14) stump(→12×15) fire(→15×17, 3 帧) rock(→18×12) fungi(→17×13)
bubble(→17×15, 2 帧) cake(→17×13 加托盘) bird(→13×14) husks(→19×12)

瘦长形保持原状（形状本身）：line worm belt dust grass spike bat foliage algae
rubble foliage flag key moon statue rocket robot。

## 验证

- [x] `scripts/sprite-preview.ts` 全量 sheet（normalized 渲染 + 名称标签）

## 第三轮：用户点名的 13 个不可读 sprite（全部重画）

标准：zoom 里能看清 ≠ 实际尺寸能认出；sprite = 物体的完整呈现而非截取。

- [x] bat —— 大翼展扇贝翼 + 尖耳 + 小脸，2 帧（平展/上扬扇翅）
- [x] bee —— 圆胖蜂身 + 大白翅 + 大眼 + 触角 + 尾针
- [x] belt —— 加宽：8 行带面 + 上下辊轴纹理 + chevron 箭头（官方滚轴构图）
- [x] book —— 打开的书：双页 + 书脊凹槽 + 墨线 + 红封面 + 书签带
- [x] box —— 木箱：边框 + X 对角撑板 + 角钉
- [x] cliff —— 岩石露头：草顶檐口外挑 + 岩柱收窄 + 游走裂纹
- [x] cog —— 8 齿齿轮 + 中心孔，2 帧错半齿
- [x] dust —— 扬尘云团 + 拖尾颗粒（官方稀疏尘点不可读），2 帧漂移
- [x] foot —— 侧视裸脚：脚踝 + 足弓 + 前沿脚趾阶梯（爪印两次均被否）
- [x] hand —— 手指加粗 2px + 独立拇指（1px 细指读成流苏）
- [x] rock —— 形状不变，棕褐 → 青灰岩石色（棕色读成土豆）
- [x] seastar —— 对称五角海星 + 臂上斑点（原不对称糊团）
- [x] selector —— 鼠标指针光标（指向手套两次均被否，编辑器语义最直白）

验证：`pnpm check` 全绿（891 tests），zoom + 实际 sheet 尺寸双重目检通过。

## 第四轮：用户反馈修正（belt 厚度方向 / box 侧面 / foot·hand 仍差 / 整体太平色数少）

- [x] belt —— "窄"指垂直方向：带面加厚到 11 行，金属辊轴 + 脊纹 + 粗箭头，palette 4→6 色
- [x] box —— 改 3/4 侧视纸箱：顶面 + 正面 + 右侧面 + 胶带边，不再是正面平涂木箱
- [x] foot —— 再重画：脚踝上收 + 脚背下斜 + 前上缘 3 个 2px 浅色脚趾凸点 + 深色脚底渐收
        （前版 1px 同色凸点在实际尺寸融入轮廓读成楔块）
- [x] hand —— 指缝根部加 'dd' 凹影，指间隙可读，不再是梳状流苏
- [x] 深度/色数加强（不被官方平涂诱导）：
        bat 翼膜加 'd' 翼骨线 + 'l' 受光翼尖（palette 4→5）
        bee 下半身 'o' 橙色渐变；book 页外侧 'd' 书边阴影
        cliff 岩面 'l' 受光岩块；cog 左上 'l' 受光缘 + 右下 'D' 重影（palette 2→4）
        dust 云团 'w' 高光点；seastar 下臂外缘 'd' 阴影
- [x] 验证：891 tests 全绿 + zoom/实际 sheet 双重目检；foot 帧 25 行越界已修

## 第五轮：全库深度/细腻 pass（用户要求"所有的都要过一次，精致细腻但不要太脏"）

方法：盘点全库 128 个的实际用色数 → ≤2 色的逐个加**成区**明暗（受光缘/背光缘/AO），
不搞碎点噪声；3 色以上已带 l/d 分区的保留；最后整 sheet 逐 strip 目检。

- [x] bolt —— 1→3 色：'l' 受光左缘 + 'd' 右下缘/尾部
- [x] star —— 2→3 色：'d' 右臂 + 右下臂缘
- [x] love —— 2→3 色：'d' 右下心缘
- [x] hand —— 2→3 色：'s' 中调右缘（指侧+掌侧）
- [x] cursor —— 2→3 色：'d' 深粉底角（选框两帧同步）
- [x] selector —— 2→3 色：'m' 中调箭头底缘
- [x] husks —— 帧原本全 'd' 单色：改 'b' 枝干 + 'l' 枯梢 + 'd' 基部
- [x] baba —— 3→4 色：'d' 柔和灰紫右下缘（白身体的定向光影）
- [x] ghost —— 3→4 色：'d' 深粉右缘（2 帧同步）
- [x] 修复 sun 帧 23 行 → 24 行（前一轮遗留）
- [x] 全 sheet 9 strip 逐行目检：无平脸残留

验证：sprite tests 16/16、lint 0 errors、sprite 文件 tsc 干净
（`src/logic/step/*` 的 3 个 tsc 错误是工作区他人未提交改动，与 sprite 无关）

- [x] `scripts/sprite-zoom.ts` 分批抽查每批改动
- [x] `pnpm check`：lint 0 errors、type-check 过、891 tests 全绿（第四轮时点）
- [ ] 遗留复核点：drum 鼓面可读性、fire/bubble 帧间一致性（wobble 由 ensureFrames 补齐，手绘多帧已逐帧验收）
