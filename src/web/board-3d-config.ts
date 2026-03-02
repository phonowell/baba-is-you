import type { Property } from '../logic/types.js'

export const BOARD3D_LAYOUT_CONFIG = {
  /** 布局与材质：卡片世界尺寸。建议使用非负值，计数场景优先整数；用于微调整体观感和稳定性。 */
  CARD_WORLD_SIZE: 0.88,
  /** 布局与材质：卡片堆叠深度。会影响对象位置或作用范围。 */
  CARD_STACK_DEPTH: 0.05,
  /** 布局与材质：卡片堆叠横向扩散。用于微调整体观感和稳定性。 */
  CARD_STACK_LATERAL_SPREAD: 0.06,
  /** 布局与材质：卡片堆叠深度扩散。会影响对象位置或作用范围。 */
  CARD_STACK_DEPTH_SPREAD: 0.06,
  /** 布局与材质：卡片基准Z。会影响对象位置或作用范围。 */
  CARD_BASE_Z: 0.09,
  /** 布局与材质：卡片层深度。会影响对象位置或作用范围。 */
  CARD_LAYER_DEPTH: 0.045,
  /** 布局与材质：地面表面Z。用于微调整体观感和稳定性。 */
  GROUND_SURFACE_Z: -0.22,
  /** 布局与材质：地面激活填充Z。用于微调整体观感和稳定性。 */
  GROUND_ACTIVE_FILL_Z: -0.2192,
  /** 布局与材质：地面贴地基准Z。会影响对象位置或作用范围。 */
  GROUND_HUG_BASE_Z: -0.219,
  /** 布局与材质：地面贴地堆叠深度。会影响对象位置或作用范围。 */
  GROUND_HUG_STACK_DEPTH: 0.001,
  /** 布局与材质：浮空对象抬升Z。用于微调整体观感和稳定性。 */
  FLOAT_ITEM_LIFT_Z: 0.14,
  /** 布局与材质：地面扩展最小尺寸。建议使用非负值，计数场景优先整数；用于限制边界，避免极端值导致画面异常。 */
  GROUND_EXPANDED_MIN_SIZE: 220,
  /** 布局与材质：可玩区域描边Z。用于微调整体观感和稳定性。 */
  PLAY_AREA_OUTLINE_Z: -0.065,
  /** 布局与材质：可玩区域描边半径。会影响对象位置或作用范围。 */
  PLAY_AREA_OUTLINE_RADIUS: 0.34,
  /** 布局与材质：可玩区域描边透明度。通常取值 0~1；用于微调整体观感和稳定性。 */
  PLAY_AREA_OUTLINE_OPACITY: 0.88,
  /** 布局与材质：卡片直立旋转X。用于微调整体观感和稳定性。 */
  CARD_UPRIGHT_ROT_X: Math.PI / 2,
  /** 布局与材质：卡片后仰倾斜弧度值。单位为弧度；会直接影响镜头构图和空间透视。 */
  CARD_BACK_TILT_RAD: Math.PI / 4,
  /** 布局与材质：卡片平放旋转X。用于微调整体观感和稳定性。 */
  CARD_FLAT_ROT_X: 0,
  /** 布局与材质：纹理各向异性上限。会影响纹理清晰度和视觉可读性。 */
  TEXTURE_ANISOTROPY_CAP: 8,
  /** 布局与材质：卡片材质Alpha裁剪阈值。通常取值 0~1；用于微调整体观感和稳定性。 */
  CARD_MATERIAL_ALPHA_TEST: 0.08,
  /** 布局与材质：卡片材质粗糙度。用于微调整体观感和稳定性。 */
  CARD_MATERIAL_ROUGHNESS: 0.78,
  /** 布局与材质：卡片材质金属度。用于微调整体观感和稳定性。 */
  CARD_MATERIAL_METALNESS: 0.02,
  /** 布局与材质：卡片材质自发光颜色。使用 CSS 颜色字符串；用于微调整体观感和稳定性。 */
  CARD_MATERIAL_EMISSIVE_COLOR: '#101019',
  /** 布局与材质：地面扩展留白。会影响对象位置或作用范围。 */
  GROUND_EXPANDED_PADDING: 0.65,
  /** 布局与材质：地面基础色。使用 CSS 颜色字符串；用于微调整体观感和稳定性。 */
  GROUND_BASE_COLOR: '#e9eef3',
  /** 布局与材质：地面材质粗糙度。用于微调整体观感和稳定性。 */
  GROUND_MATERIAL_ROUGHNESS: 0.66,
  /** 布局与材质：地面材质金属度。用于微调整体观感和稳定性。 */
  GROUND_MATERIAL_METALNESS: 0,
  /** 布局与材质：可玩区域填充颜色。使用 CSS 颜色字符串；用于微调整体观感和稳定性。 */
  PLAY_AREA_FILL_COLOR: '#f8fbff',
  /** 布局与材质：可玩区域填充粗糙度。用于微调整体观感和稳定性。 */
  PLAY_AREA_FILL_ROUGHNESS: 0.68,
  /** 布局与材质：可玩区域填充金属度。用于微调整体观感和稳定性。 */
  PLAY_AREA_FILL_METALNESS: 0,
  /** 布局与材质：可玩区域描边颜色。使用 CSS 颜色字符串；用于微调整体观感和稳定性。 */
  PLAY_AREA_OUTLINE_COLOR: '#a6b3c1',
  /** 布局与材质：实体静止阴影缩放。会影响光照层次、阴影稳定性和性能。 */
  ENTITY_IDLE_SHADOW_SCALE: 0.62,
  /** 布局与材质：位置容差。用于微调整体观感和稳定性。 */
  POSITION_EPSILON: 0.0001,
  /** 布局与材质：可玩区域描边采样数最小值。建议使用非负值，计数场景优先整数；用于限制边界，避免极端值导致画面异常。 */
  PLAY_AREA_OUTLINE_SAMPLES_MIN: 24,
  /** 布局与材质：可玩区域描边采样数密度。建议使用非负值，计数场景优先整数；用于微调整体观感和稳定性。 */
  PLAY_AREA_OUTLINE_SAMPLES_DENSITY: 8,
  /** 布局与材质：可玩区域半径约束比率。会影响对象位置或作用范围。 */
  PLAY_AREA_RADIUS_CLAMP_RATIO: 0.35,
} as const

export const BOARD3D_CAMERA_CONFIG = {
  /** 相机：相机卡片朝向面角度弧度值。单位为弧度；会直接影响镜头构图和空间透视。 */
  CAMERA_CARD_FACE_ANGLE_RAD: Math.PI / 4,
  /** 相机：相机俯仰弧度值。单位为弧度；会直接影响镜头构图和空间透视。 */
  CAMERA_PITCH_RAD: (75 * Math.PI) / 180,
  /** 相机：相机距离缩放。会直接影响镜头构图和空间透视。 */
  CAMERA_DISTANCE_SCALE: 0.28,
  /** 相机：相机距离最小值。会直接影响镜头构图和空间透视。 */
  CAMERA_DISTANCE_MIN: 1.45,
  /** 相机：相机观察点 Y 偏移。会直接影响镜头构图和空间透视。 */
  CAMERA_LOOK_AT_OFFSET_Y: -0.58,
  /** 相机：相机观察点深度偏置。会直接影响镜头构图和空间透视。 */
  CAMERA_LOOK_AT_DEPTH_BIAS: 0.14,
  /** 相机：相机近裁剪面。会直接影响镜头构图和空间透视。 */
  CAMERA_NEAR: 0.1,
  /** 相机：相机远裁剪面。会直接影响镜头构图和空间透视。 */
  CAMERA_FAR: 180,
  /** 相机：世界旋转 X。会直接影响镜头构图和空间透视。 */
  WORLD_ROTATION_X: -Math.PI / 2,
} as const

export const BOARD3D_LIGHTING_CONFIG = {
  /** 灯光：光源高度Y基准。会影响光照层次、阴影稳定性和性能。 */
  LIGHT_HEIGHT_Y_BASE: 9.2,
  /** 灯光：光源高度Y跨度倍率。会影响光照层次、阴影稳定性和性能。 */
  LIGHT_HEIGHT_Y_SPAN_MUL: 0.84,
  /** 灯光：侧向光源偏移X基准。会影响光照层次、阴影稳定性和性能。 */
  SIDE_LIGHT_OFFSET_X_BASE: 3.4,
  /** 灯光：侧向光源偏移X倍率。会影响光照层次、阴影稳定性和性能。 */
  SIDE_LIGHT_OFFSET_X_MUL: 0.36,
  /** 灯光：侧向光源偏移Z基准。会影响光照层次、阴影稳定性和性能。 */
  SIDE_LIGHT_OFFSET_Z_BASE: 2.4,
  /** 灯光：侧向光源偏移Z倍率。会影响光照层次、阴影稳定性和性能。 */
  SIDE_LIGHT_OFFSET_Z_MUL: 0.28,
  /** 灯光：光源相机侧向倾斜弧度值。单位为弧度；会直接影响镜头构图和空间透视。 */
  LIGHT_CAMERA_SIDE_TILT_RAD: Math.PI / 4,
  /** 灯光：环境光光源颜色。使用 CSS 颜色字符串；会影响光照层次、阴影稳定性和性能。 */
  AMBIENT_LIGHT_COLOR: '#f3f5ff',
  /** 灯光：环境光光源强度倍率。会影响光照层次、阴影稳定性和性能。 */
  AMBIENT_LIGHT_INTENSITY_MUL: 1.135,
  /** 灯光：侧向光源强度最小值。会影响光照层次、阴影稳定性和性能。 */
  SIDE_LIGHT_INTENSITY_MIN: 0.67,
  /** 灯光：侧向光源强度倍率。会影响光照层次、阴影稳定性和性能。 */
  SIDE_LIGHT_INTENSITY_MUL: 0.9125,
  /** 灯光：侧向光源初始值Y。会影响光照层次、阴影稳定性和性能。 */
  SIDE_LIGHT_INITIAL_Y: 10,
  /** 灯光：侧向光源初始值Z。会影响光照层次、阴影稳定性和性能。 */
  SIDE_LIGHT_INITIAL_Z: 6,
  /** 灯光：光源阴影相机近裁剪面。会直接影响镜头构图和空间透视。 */
  LIGHT_SHADOW_CAMERA_NEAR: 0.1,
  /** 灯光：光源阴影偏置。会影响光照层次、阴影稳定性和性能。 */
  LIGHT_SHADOW_BIAS: -0.00006,
  /** 灯光：阴影法线偏置。会影响光照层次、阴影稳定性和性能。 */
  LIGHT_SHADOW_NORMAL_BIAS: 0.04,
  /** 灯光：光源高度Y额外。会影响光照层次、阴影稳定性和性能。 */
  LIGHT_HEIGHT_Y_EXTRA: 4.6,
  /** 灯光：光源下落Y最小值。会影响光照层次、阴影稳定性和性能。 */
  LIGHT_DROP_Y_MIN: 0.5,
  /** 灯光：光源下落Y减量。会影响光照层次、阴影稳定性和性能。 */
  LIGHT_DROP_Y_SUB: 0.08,
  /** 灯光：光源目标Y。会影响光照层次、阴影稳定性和性能。 */
  LIGHT_TARGET_Y: 0.08,
} as const

export const BOARD3D_SHADOW_CONFIG = {
  /** 实体阴影：阴影基准Z。会影响光照层次、阴影稳定性和性能。 */
  SHADOW_BASE_Z: -0.08,
  /** 实体阴影：阴影贴图尺寸缩放。会影响光照层次、阴影稳定性和性能。 */
  SHADOW_MAP_SIZE_SCALE: 1.25,
  /** 实体阴影：阴影半径。会影响光照层次、阴影稳定性和性能。 */
  SHADOW_RADIUS: 1.0,
  /** 实体阴影：阴影视锥基准。会影响光照层次、阴影稳定性和性能。 */
  SHADOW_FRUSTUM_BASE: 2.1,
  /** 实体阴影：阴影视锥跨度倍率。会影响光照层次、阴影稳定性和性能。 */
  SHADOW_FRUSTUM_SPAN_MUL: 0.62,
  /** 实体阴影：阴影远裁剪面留白。会影响光照层次、阴影稳定性和性能。 */
  SHADOW_FAR_PADDING: 8,
  /** 实体阴影：阴影视锥距离缩放。会影响光照层次、阴影稳定性和性能。 */
  SHADOW_FRUSTUM_DISTANCE_SCALE: 2,
  /** 实体阴影：阴影角度跨度增强。会直接影响镜头构图和空间透视。 */
  SHADOW_ANGLE_SPAN_BOOST: 0.35,
  /** 实体阴影：阴影几何尺寸。建议使用非负值，计数场景优先整数；会影响光照层次、阴影稳定性和性能。 */
  SHADOW_GEOMETRY_SIZE: 1,
  /** 实体阴影：实体阴影颜色。使用 CSS 颜色字符串；会影响光照层次、阴影稳定性和性能。 */
  ENTITY_SHADOW_COLOR: '#102038',
  /** 实体阴影：实体阴影透明度。通常取值 0~1；会影响光照层次、阴影稳定性和性能。 */
  ENTITY_SHADOW_OPACITY: 0.16,
  /** 实体阴影：实体阴影Alpha裁剪阈值。通常取值 0~1；会影响光照层次、阴影稳定性和性能。 */
  ENTITY_SHADOW_ALPHA_TEST: 0.01,
  /** 实体阴影：阴影缩放基准。会影响光照层次、阴影稳定性和性能。 */
  SHADOW_SCALE_BASE: 0.54,
  /** 实体阴影：阴影缩放跳跃倍率。数值越大，动效越明显。 */
  SHADOW_SCALE_JUMP_MUL: 1.25,
  /** 实体阴影：阴影缩放落地倍率。会影响光照层次、阴影稳定性和性能。 */
  SHADOW_SCALE_LANDING_MUL: 0.62,
  /** 实体阴影：阴影透明度最小值。通常取值 0~1；会影响光照层次、阴影稳定性和性能。 */
  SHADOW_OPACITY_MIN: 0.05,
  /** 实体阴影：阴影透明度基准。通常取值 0~1；会影响光照层次、阴影稳定性和性能。 */
  SHADOW_OPACITY_BASE: 0.16,
  /** 实体阴影：阴影透明度跳跃倍率。通常取值 0~1；数值越大，动效越明显。 */
  SHADOW_OPACITY_JUMP_MUL: 0.42,
  /** 实体阴影：阴影透明度落地倍率。通常取值 0~1；会影响光照层次、阴影稳定性和性能。 */
  SHADOW_OPACITY_LANDING_MUL: 0.2,
} as const

export const BOARD3D_POSTFX_CONFIG = {
  /** 后处理：设备像素比上限。会在画质和性能之间形成权衡。 */
  MAX_DEVICE_PIXEL_RATIO: 1.4,
  /** 后处理：后处理像素比缩放。会在画质和性能之间形成权衡。 */
  POSTFX_PIXEL_RATIO_SCALE: 1,
  /** 后处理：泛光分辨率缩放。会在画质和性能之间形成权衡。 */
  BLOOM_RESOLUTION_SCALE: 0.65,
  /** 后处理：泛光高密度文字分辨率缩放。会在画质和性能之间形成权衡。 */
  BLOOM_DENSE_TEXT_RESOLUTION_SCALE: 0.84,
  /** 后处理：景深启用阈值余量。会在画质和性能之间形成权衡。 */
  BOKEH_ENABLE_MARGIN: 1.12,
  /** 后处理：泛光初始分辨率X。会在画质和性能之间形成权衡。 */
  BLOOM_INITIAL_RESOLUTION_X: 1,
  /** 后处理：泛光初始分辨率Y。会在画质和性能之间形成权衡。 */
  BLOOM_INITIAL_RESOLUTION_Y: 1,
  /** 后处理：景深初始焦点距离。会在画质和性能之间形成权衡。 */
  BOKEH_INITIAL_FOCUS: 10,
  /** 后处理：景深焦点距离最小值。会在画质和性能之间形成权衡。 */
  BOKEH_FOCUS_MIN: 4,
} as const

export const BOARD3D_ANIMATION_CONFIG = {
  /** 动画：移动动画时长。单位为毫秒；数值越大，动效越明显。 */
  MOVE_ANIM_MS: 170,
  /** 动画：生成动画时长。单位为毫秒；数值越大，动效越明显。 */
  SPAWN_ANIM_MS: 140,
  /** 动画：消失动画时长。单位为毫秒；数值越大，动效越明显。 */
  DESPAWN_ANIM_MS: 120,
  /** 动画：生成缩放起始。数值越大，动效越明显。 */
  SPAWN_SCALE_FROM: 0.66,
  /** 动画：消失缩放目标。数值越大，动效越明显。 */
  DESPAWN_SCALE_TO: 0.12,
  /** 动画：着地脉冲时长。单位为毫秒；数值越大，动效越明显。 */
  LAND_PULSE_MS: 125,
  /** 动画：跳跃高度。数值越大，动效越明显。 */
  JUMP_HEIGHT: 0.17,
  /** 动画：Emoji 微动拉伸周期。单位为毫秒；数值越大，动效越明显。 */
  EMOJI_MICRO_STRETCH_CYCLE_MS: 1000,
  /** 动画：Emoji微动拉伸Y幅度。数值越大，动效越明显。 */
  EMOJI_MICRO_STRETCH_Y_AMP: 0.035,
  /** 动画：Emoji微动拉伸X幅度。数值越大，动效越明显。 */
  EMOJI_MICRO_STRETCH_X_AMP: 0.014,
  /** 动画：移动拉伸系数。数值越大，动效越明显。 */
  MOVE_STRETCH_FACTOR: 0.17,
  /** 动画：移动压缩系数。数值越大，动效越明显。 */
  MOVE_SQUASH_FACTOR: 0.14,
  /** 动画：落地脉冲高度。数值越大，动效越明显。 */
  LANDING_PULSE_HEIGHT: 0.04,
  /** 动画：生成竖向偏移。数值越大，动效越明显。 */
  SPAWN_VERTICAL_OFFSET: 0.16,
  /** 动画：消失竖向偏移。数值越大，动效越明显。 */
  DESPAWN_VERTICAL_OFFSET: 0.12,
  /** 动画：移动翻滚振幅。数值越大，动效越明显。 */
  MOVE_ROLL_AMPLITUDE: 0.18,
} as const

export const BOARD3D_RULE_VISUAL_CONFIG = {
  /** 规则可视化：传送带方向符号上。仅影响规则提示表现，不影响核心逻辑。 */
  BELT_DIRECTION_GLYPH_UP: '\u2b06\ufe0f',
  /** 规则可视化：传送带方向符号右。仅影响规则提示表现，不影响核心逻辑。 */
  BELT_DIRECTION_GLYPH_RIGHT: '\u27a1\ufe0f',
  /** 规则可视化：传送带方向符号下。仅影响规则提示表现，不影响核心逻辑。 */
  BELT_DIRECTION_GLYPH_DOWN: '\u2b07\ufe0f',
  /** 规则可视化：传送带方向符号左。仅影响规则提示表现，不影响核心逻辑。 */
  BELT_DIRECTION_GLYPH_LEFT: '\u2b05\ufe0f',
  /** 规则可视化：朝向箭头属性集合。仅影响规则提示表现，不影响核心逻辑。 */
  FACING_ARROW_PROPS: new Set<Property>(['you', 'move', 'shift']),
  /** 规则可视化：匹配Emoji。仅影响规则提示表现，不影响核心逻辑。 */
  HAS_EMOJI: /\p{Extended_Pictographic}/u,
} as const

export const BOARD3D_TEXT_CARD_STYLE_CONFIG = {
  /** 文字卡片配色：文字卡片语法词背景色。用于微调整体观感和稳定性。 */
  TEXT_CARD_SYNTAX_BACKGROUND: '#f2dca8',
  /** 文字卡片配色：文字卡片语法词文字色。用于微调整体观感和稳定性。 */
  TEXT_CARD_SYNTAX_TEXT: '#513c0c',
  /** 文字卡片配色：文字卡片语法词描边色。用于微调整体观感和稳定性。 */
  TEXT_CARD_SYNTAX_OUTLINE: '#fff9eb',
  /** 文字卡片配色：文字卡片普通词背景色。用于微调整体观感和稳定性。 */
  TEXT_CARD_NORMAL_BACKGROUND: '#bfd8f6',
  /** 文字卡片配色：文字卡片普通词文字色。用于微调整体观感和稳定性。 */
  TEXT_CARD_NORMAL_TEXT: '#19324f',
  /** 文字卡片配色：文字卡片普通词描边色。用于微调整体观感和稳定性。 */
  TEXT_CARD_NORMAL_OUTLINE: '#f4f8ff',
} as const

export const BOARD3D_CARD_TEXTURE_CONFIG = {
  /** 卡片纹理：卡片纹理尺寸。建议使用非负值，计数场景优先整数；会影响纹理清晰度和视觉可读性。 */
  CARD_TEXTURE_SIZE: 256,
  /** 卡片纹理：Emoji卡片纹理尺寸。建议使用非负值，计数场景优先整数；会影响纹理清晰度和视觉可读性。 */
  EMOJI_CARD_TEXTURE_SIZE: 512,
  /** 卡片纹理：卡片纹理内边距比率。会影响纹理清晰度和视觉可读性。 */
  CARD_TEXTURE_PAD_RATIO: 0.08,
  /** 卡片纹理：卡片纹理圆角半径比率。会影响纹理清晰度和视觉可读性。 */
  CARD_TEXTURE_CORNER_RADIUS_RATIO: 0.14,
  /** 卡片纹理：卡片纹理Emoji字体比率。会影响纹理清晰度和视觉可读性。 */
  CARD_TEXTURE_EMOJI_FONT_RATIO: 0.9,
  /** 卡片纹理：卡片纹理文字长词阈值。会影响纹理清晰度和视觉可读性。 */
  CARD_TEXTURE_TEXT_LONG_THRESHOLD: 5,
  /** 卡片纹理：卡片纹理文字中词阈值。会影响纹理清晰度和视觉可读性。 */
  CARD_TEXTURE_TEXT_MEDIUM_THRESHOLD: 3,
  /** 卡片纹理：卡片纹理文字长词字体尺寸。建议使用非负值，计数场景优先整数；会影响纹理清晰度和视觉可读性。 */
  CARD_TEXTURE_TEXT_LONG_FONT_SIZE: 56,
  /** 卡片纹理：卡片纹理文字中词字体尺寸。建议使用非负值，计数场景优先整数；会影响纹理清晰度和视觉可读性。 */
  CARD_TEXTURE_TEXT_MEDIUM_FONT_SIZE: 72,
  /** 卡片纹理：卡片纹理文字短词字体尺寸。建议使用非负值，计数场景优先整数；会影响纹理清晰度和视觉可读性。 */
  CARD_TEXTURE_TEXT_SHORT_FONT_SIZE: 96,
  /** 卡片纹理：卡片纹理标签偏移Y。会影响纹理清晰度和视觉可读性。 */
  CARD_TEXTURE_LABEL_OFFSET_Y: 4,
  /** 卡片纹理：卡片纹理文字笔触宽度比率。会影响纹理清晰度和视觉可读性。 */
  CARD_TEXTURE_TEXT_STROKE_WIDTH_RATIO: 0.05,
  /** 卡片纹理：卡片纹理Emoji字体族。使用合法 CSS 字体族；会影响纹理清晰度和视觉可读性。 */
  CARD_TEXTURE_EMOJI_FONT_FAMILY: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif',
  /** 卡片纹理：卡片纹理文字字体族。使用合法 CSS 字体族；会影响纹理清晰度和视觉可读性。 */
  CARD_TEXTURE_TEXT_FONT_FAMILY: '"Trebuchet MS","Arial Rounded MT Bold","Segoe UI Emoji",sans-serif',
  /** 卡片纹理：卡片纹理方向字体比率。会影响纹理清晰度和视觉可读性。 */
  CARD_TEXTURE_DIRECTION_FONT_RATIO: 0.36,
  /** 卡片纹理：卡片纹理方向边缘内缩比率。会影响纹理清晰度和视觉可读性。 */
  CARD_TEXTURE_DIRECTION_EDGE_INSET_RATIO: 0.12,
  /** 卡片纹理：卡片纹理方向偏移Y。会影响纹理清晰度和视觉可读性。 */
  CARD_TEXTURE_DIRECTION_OFFSET_Y: 1,
} as const

export const BOARD3D_SHADOW_TEXTURE_CONFIG = {
  /** 阴影纹理：阴影纹理尺寸。建议使用非负值，计数场景优先整数；会影响光照层次、阴影稳定性和性能。 */
  SHADOW_TEXTURE_SIZE: 128,
  /** 阴影纹理：阴影纹理中心。会影响光照层次、阴影稳定性和性能。 */
  SHADOW_TEXTURE_CENTER: 64,
  /** 阴影纹理：阴影纹理内圈半径。会影响光照层次、阴影稳定性和性能。 */
  SHADOW_TEXTURE_INNER_RADIUS: 17,
  /** 阴影纹理：阴影纹理外圈半径。会影响光照层次、阴影稳定性和性能。 */
  SHADOW_TEXTURE_OUTER_RADIUS: 50,
  /** 阴影纹理：阴影纹理渐变点0。会影响光照层次、阴影稳定性和性能。 */
  SHADOW_TEXTURE_STOP_0: 'rgba(0, 0, 0, 0.25)',
  /** 阴影纹理：阴影纹理渐变点1。会影响光照层次、阴影稳定性和性能。 */
  SHADOW_TEXTURE_STOP_1: 'rgba(0, 0, 0, 0.09)',
  /** 阴影纹理：阴影纹理渐变点2。会影响光照层次、阴影稳定性和性能。 */
  SHADOW_TEXTURE_STOP_2: 'rgba(0, 0, 0, 0)',
  /** 阴影纹理：阴影纹理渐变点1位置。会影响光照层次、阴影稳定性和性能。 */
  SHADOW_TEXTURE_STOP_1_AT: 0.48,
} as const
