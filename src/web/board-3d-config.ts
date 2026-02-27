import type { Property } from '../logic/types.js'

export const BOARD3D_LAYOUT_CONFIG = {
  /** 用途: 控制棋盘布局与材质中的 CARD_WORLD_SIZE; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 大于等于 0 的有限实数采样或计数场景建议使用整数. */
  CARD_WORLD_SIZE: 0.88,
  /** 用途: 控制棋盘布局与材质中的 CARD_STACK_DEPTH; 效果: 影响渲染表现与运行成本; 可用值范围: 有限实数. */
  CARD_STACK_DEPTH: 0.05,
  /** 用途: 控制棋盘布局与材质中的 CARD_STACK_LATERAL_SPREAD; 效果: 影响渲染表现与运行成本; 可用值范围: 有限实数. */
  CARD_STACK_LATERAL_SPREAD: 0.06,
  /** 用途: 控制棋盘布局与材质中的 CARD_STACK_DEPTH_SPREAD; 效果: 影响渲染表现与运行成本; 可用值范围: 有限实数. */
  CARD_STACK_DEPTH_SPREAD: 0.06,
  /** 用途: 控制棋盘布局与材质中的 CARD_BASE_Z; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  CARD_BASE_Z: 0.09,
  /** 用途: 控制棋盘布局与材质中的 CARD_LAYER_DEPTH; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  CARD_LAYER_DEPTH: 0.045,
  /** 用途: 控制棋盘布局与材质中的 GROUND_SURFACE_Z; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  GROUND_SURFACE_Z: -0.22,
  /** 用途: 控制棋盘布局与材质中的 GROUND_ACTIVE_FILL_Z; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  GROUND_ACTIVE_FILL_Z: -0.2192,
  /** 用途: 控制棋盘布局与材质中的 GROUND_HUG_BASE_Z; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  GROUND_HUG_BASE_Z: -0.219,
  /** 用途: 控制棋盘布局与材质中的 GROUND_HUG_STACK_DEPTH; 效果: 影响渲染表现与运行成本; 可用值范围: 有限实数. */
  GROUND_HUG_STACK_DEPTH: 0.001,
  /** 用途: 控制棋盘布局与材质中的 FLOAT_ITEM_LIFT_Z; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  FLOAT_ITEM_LIFT_Z: 0.14,
  /** 用途: 控制棋盘布局与材质中的 GROUND_EXPANDED_MIN_SIZE; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 大于等于 0 的有限实数采样或计数场景建议使用整数. */
  GROUND_EXPANDED_MIN_SIZE: 220,
  /** 用途: 控制棋盘布局与材质中的 PLAY_AREA_OUTLINE_Z; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  PLAY_AREA_OUTLINE_Z: -0.065,
  /** 用途: 控制棋盘布局与材质中的 PLAY_AREA_OUTLINE_RADIUS; 效果: 影响配色层次材质气质与可读性; 可用值范围: 弧度值有限实数. */
  PLAY_AREA_OUTLINE_RADIUS: 0.34,
  /** 用途: 控制棋盘布局与材质中的 PLAY_AREA_OUTLINE_OPACITY; 效果: 影响配色层次材质气质与可读性; 可用值范围: 通常为 0 到 1 的有限实数. */
  PLAY_AREA_OUTLINE_OPACITY: 0.88,
  /** 用途: 控制棋盘布局与材质中的 CARD_UPRIGHT_ROT_X; 效果: 影响朝向关系透视感与空间构图; 可用值范围: 弧度值有限实数. */
  CARD_UPRIGHT_ROT_X: Math.PI / 2,
  /** 用途: 控制棋盘布局与材质中的 CARD_BACK_TILT_RAD; 效果: 影响朝向关系透视感与空间构图; 可用值范围: 弧度值有限实数. */
  CARD_BACK_TILT_RAD: Math.PI / 4,
  /** 用途: 控制棋盘布局与材质中的 CARD_FLAT_ROT_X; 效果: 影响朝向关系透视感与空间构图; 可用值范围: 弧度值有限实数. */
  CARD_FLAT_ROT_X: 0,
  /** 用途: 控制棋盘布局与材质中的 TEXTURE_ANISOTROPY_CAP; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  TEXTURE_ANISOTROPY_CAP: 8,
  /** 用途: 控制棋盘布局与材质中的 CARD_MATERIAL_ALPHA_TEST; 效果: 影响透明度边缘裁剪与叠加观感; 可用值范围: 通常为 0 到 1 的有限实数. */
  CARD_MATERIAL_ALPHA_TEST: 0.08,
  /** 用途: 控制棋盘布局与材质中的 CARD_MATERIAL_ROUGHNESS; 效果: 影响渲染表现与运行成本; 可用值范围: 有限实数. */
  CARD_MATERIAL_ROUGHNESS: 0.78,
  /** 用途: 控制棋盘布局与材质中的 CARD_MATERIAL_METALNESS; 效果: 影响渲染表现与运行成本; 可用值范围: 有限实数. */
  CARD_MATERIAL_METALNESS: 0.02,
  /** 用途: 控制棋盘布局与材质中的 CARD_MATERIAL_EMISSIVE_COLOR; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  CARD_MATERIAL_EMISSIVE_COLOR: '#101019',
  /** 用途: 控制棋盘布局与材质中的 GROUND_EXPANDED_PADDING; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  GROUND_EXPANDED_PADDING: 0.65,
  /** 用途: 控制棋盘布局与材质中的 GROUND_MATERIAL_ROUGHNESS; 效果: 影响渲染表现与运行成本; 可用值范围: 有限实数. */
  GROUND_MATERIAL_ROUGHNESS: 0.66,
  /** 用途: 控制棋盘布局与材质中的 GROUND_MATERIAL_METALNESS; 效果: 影响渲染表现与运行成本; 可用值范围: 有限实数. */
  GROUND_MATERIAL_METALNESS: 0,
  /** 用途: 控制棋盘布局与材质中的 PLAY_AREA_FILL_COLOR; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  PLAY_AREA_FILL_COLOR: '#f8fbff',
  /** 用途: 控制棋盘布局与材质中的 PLAY_AREA_FILL_ROUGHNESS; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  PLAY_AREA_FILL_ROUGHNESS: 0.68,
  /** 用途: 控制棋盘布局与材质中的 PLAY_AREA_FILL_METALNESS; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  PLAY_AREA_FILL_METALNESS: 0,
  /** 用途: 控制棋盘布局与材质中的 PLAY_AREA_OUTLINE_COLOR; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  PLAY_AREA_OUTLINE_COLOR: '#a6b3c1',
  /** 用途: 控制棋盘布局与材质中的 ENTITY_IDLE_SHADOW_SCALE; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  ENTITY_IDLE_SHADOW_SCALE: 0.62,
  /** 用途: 控制棋盘布局与材质中的 POSITION_EPSILON; 效果: 影响阈值判定边界行为与数值稳定性; 可用值范围: 大于 0 且足够小的有限实数. */
  POSITION_EPSILON: 0.0001,
  /** 用途: 控制棋盘布局与材质中的 PLAY_AREA_OUTLINE_SAMPLES_MIN; 效果: 影响配色层次材质气质与可读性; 可用值范围: 大于等于 0 的有限实数采样或计数场景建议使用整数. */
  PLAY_AREA_OUTLINE_SAMPLES_MIN: 24,
  /** 用途: 控制棋盘布局与材质中的 PLAY_AREA_OUTLINE_SAMPLES_DENSITY; 效果: 影响配色层次材质气质与可读性; 可用值范围: 大于等于 0 的有限实数采样或计数场景建议使用整数. */
  PLAY_AREA_OUTLINE_SAMPLES_DENSITY: 8,
  /** 用途: 控制棋盘布局与材质中的 PLAY_AREA_RADIUS_CLAMP_RATIO; 效果: 影响朝向关系透视感与空间构图; 可用值范围: 弧度值有限实数. */
  PLAY_AREA_RADIUS_CLAMP_RATIO: 0.35,
} as const

export const BOARD3D_CAMERA_CONFIG = {
  /** 用途: 控制相机取景中的 CAMERA_CARD_FACE_ANGLE_RAD; 效果: 影响朝向关系透视感与空间构图; 可用值范围: 弧度值有限实数. */
  CAMERA_CARD_FACE_ANGLE_RAD: Math.PI / 4,
  /** 用途: 控制相机取景中的 CAMERA_PITCH_RAD; 效果: 影响朝向关系透视感与空间构图; 可用值范围: 弧度值有限实数. */
  CAMERA_PITCH_RAD: Math.PI / 4,
  /** 用途: 控制相机取景中的 CAMERA_DISTANCE_SCALE; 效果: 影响细节密度画面清晰度与性能开销; 可用值范围: 有限实数. */
  CAMERA_DISTANCE_SCALE: 0.56,
  /** 用途: 控制相机取景中的 CAMERA_DISTANCE_MIN; 效果: 影响细节密度画面清晰度与性能开销; 可用值范围: 有限实数需与对应上下界语义保持一致. */
  CAMERA_DISTANCE_MIN: 1.45,
  /** 用途: 控制相机取景中的 CAMERA_LOOK_AT_OFFSET_Y; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  CAMERA_LOOK_AT_OFFSET_Y: -0.58,
  /** 用途: 控制相机取景中的 CAMERA_LOOK_AT_DEPTH_BIAS; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  CAMERA_LOOK_AT_DEPTH_BIAS: 0.14,
  /** 用途: 控制相机取景中的 CAMERA_NEAR; 效果: 影响渲染表现与运行成本; 可用值范围: 有限实数. */
  CAMERA_NEAR: 0.1,
  /** 用途: 控制相机取景中的 CAMERA_FAR; 效果: 影响渲染表现与运行成本; 可用值范围: 有限实数. */
  CAMERA_FAR: 180,
  /** 用途: 控制相机取景中的 WORLD_ROTATION_X; 效果: 影响朝向关系透视感与空间构图; 可用值范围: 弧度值有限实数. */
  WORLD_ROTATION_X: -Math.PI / 2,
} as const

export const BOARD3D_LIGHTING_CONFIG = {
  /** 用途: 控制灯光布局中的 LIGHT_HEIGHT_Y_BASE; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  LIGHT_HEIGHT_Y_BASE: 9.2,
  /** 用途: 控制灯光布局中的 LIGHT_HEIGHT_Y_SPAN_MUL; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  LIGHT_HEIGHT_Y_SPAN_MUL: 0.84,
  /** 用途: 控制灯光布局中的 SIDE_LIGHT_OFFSET_X_BASE; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  SIDE_LIGHT_OFFSET_X_BASE: 3.4,
  /** 用途: 控制灯光布局中的 SIDE_LIGHT_OFFSET_X_MUL; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  SIDE_LIGHT_OFFSET_X_MUL: 0.36,
  /** 用途: 控制灯光布局中的 SIDE_LIGHT_OFFSET_Z_BASE; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  SIDE_LIGHT_OFFSET_Z_BASE: 2.4,
  /** 用途: 控制灯光布局中的 SIDE_LIGHT_OFFSET_Z_MUL; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  SIDE_LIGHT_OFFSET_Z_MUL: 0.28,
  /** 用途: 控制灯光布局中的 LIGHT_CAMERA_SIDE_TILT_RAD; 效果: 影响朝向关系透视感与空间构图; 可用值范围: 弧度值有限实数. */
  LIGHT_CAMERA_SIDE_TILT_RAD: Math.PI / 4,
  /** 用途: 控制灯光布局中的 AMBIENT_LIGHT_COLOR; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  AMBIENT_LIGHT_COLOR: '#f3f5ff',
  /** 用途: 控制灯光布局中的 AMBIENT_LIGHT_INTENSITY_MUL; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  AMBIENT_LIGHT_INTENSITY_MUL: 1.135,
  /** 用途: 控制灯光布局中的 SIDE_LIGHT_INTENSITY_MIN; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数需与对应上下界语义保持一致. */
  SIDE_LIGHT_INTENSITY_MIN: 0.67,
  /** 用途: 控制灯光布局中的 SIDE_LIGHT_INTENSITY_MUL; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  SIDE_LIGHT_INTENSITY_MUL: 0.9125,
  /** 用途: 控制灯光布局中的 SIDE_LIGHT_INITIAL_Y; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  SIDE_LIGHT_INITIAL_Y: 10,
  /** 用途: 控制灯光布局中的 SIDE_LIGHT_INITIAL_Z; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  SIDE_LIGHT_INITIAL_Z: 6,
  /** 用途: 控制灯光布局中的 LIGHT_SHADOW_CAMERA_NEAR; 效果: 影响渲染表现与运行成本; 可用值范围: 有限实数. */
  LIGHT_SHADOW_CAMERA_NEAR: 0.1,
  /** 用途: 控制灯光布局中的 LIGHT_SHADOW_BIAS; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  LIGHT_SHADOW_BIAS: -0.00006,
  /** 用途: 控制灯光布局中的 LIGHT_SHADOW_NORMAL_BIAS; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  LIGHT_SHADOW_NORMAL_BIAS: 0.04,
  /** 用途: 控制灯光布局中的 LIGHT_HEIGHT_Y_EXTRA; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  LIGHT_HEIGHT_Y_EXTRA: 4.6,
  /** 用途: 控制灯光布局中的 LIGHT_DROP_Y_MIN; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数需与对应上下界语义保持一致. */
  LIGHT_DROP_Y_MIN: 0.5,
  /** 用途: 控制灯光布局中的 LIGHT_DROP_Y_SUB; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  LIGHT_DROP_Y_SUB: 0.08,
  /** 用途: 控制灯光布局中的 LIGHT_TARGET_Y; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  LIGHT_TARGET_Y: 0.08,
} as const

export const BOARD3D_SHADOW_CONFIG = {
  /** 用途: 控制阴影表现中的 SHADOW_BASE_Z; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  SHADOW_BASE_Z: -0.08,
  /** 用途: 控制阴影表现中的 SHADOW_MAP_SIZE_SCALE; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 大于等于 0 的有限实数采样或计数场景建议使用整数. */
  SHADOW_MAP_SIZE_SCALE: 1.25,
  /** 用途: 控制阴影表现中的 SHADOW_RADIUS; 效果: 影响朝向关系透视感与空间构图; 可用值范围: 弧度值有限实数. */
  SHADOW_RADIUS: 1.0,
  /** 用途: 控制阴影表现中的 SHADOW_FRUSTUM_BASE; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  SHADOW_FRUSTUM_BASE: 2.1,
  /** 用途: 控制阴影表现中的 SHADOW_FRUSTUM_SPAN_MUL; 效果: 影响效果强度分布层次过渡与整体观感; 可用值范围: 有限实数. */
  SHADOW_FRUSTUM_SPAN_MUL: 0.62,
  /** 用途: 控制阴影表现中的 SHADOW_FAR_PADDING; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  SHADOW_FAR_PADDING: 8,
  /** 用途: 控制阴影表现中的 SHADOW_FRUSTUM_DISTANCE_SCALE; 效果: 影响细节密度画面清晰度与性能开销; 可用值范围: 有限实数. */
  SHADOW_FRUSTUM_DISTANCE_SCALE: 2,
  /** 用途: 控制阴影表现中的 SHADOW_ANGLE_SPAN_BOOST; 效果: 影响朝向关系透视感与空间构图; 可用值范围: 弧度值有限实数. */
  SHADOW_ANGLE_SPAN_BOOST: 0.35,
  /** 用途: 控制阴影表现中的 SHADOW_GEOMETRY_SIZE; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 大于等于 0 的有限实数采样或计数场景建议使用整数. */
  SHADOW_GEOMETRY_SIZE: 1,
  /** 用途: 控制阴影表现中的 ENTITY_SHADOW_COLOR; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  ENTITY_SHADOW_COLOR: '#102038',
  /** 用途: 控制阴影表现中的 ENTITY_SHADOW_OPACITY; 效果: 影响透明度边缘裁剪与叠加观感; 可用值范围: 通常为 0 到 1 的有限实数. */
  ENTITY_SHADOW_OPACITY: 0.16,
  /** 用途: 控制阴影表现中的 ENTITY_SHADOW_ALPHA_TEST; 效果: 影响透明度边缘裁剪与叠加观感; 可用值范围: 通常为 0 到 1 的有限实数. */
  ENTITY_SHADOW_ALPHA_TEST: 0.01,
  /** 用途: 控制阴影表现中的 SHADOW_SCALE_BASE; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  SHADOW_SCALE_BASE: 0.54,
  /** 用途: 控制阴影表现中的 SHADOW_SCALE_JUMP_MUL; 效果: 影响动画节奏反馈时机与运动手感; 可用值范围: 有限实数. */
  SHADOW_SCALE_JUMP_MUL: 1.25,
  /** 用途: 控制阴影表现中的 SHADOW_SCALE_LANDING_MUL; 效果: 影响效果强度分布层次过渡与整体观感; 可用值范围: 有限实数. */
  SHADOW_SCALE_LANDING_MUL: 0.62,
  /** 用途: 控制阴影表现中的 SHADOW_OPACITY_MIN; 效果: 影响透明度边缘裁剪与叠加观感; 可用值范围: 通常为 0 到 1 的有限实数. */
  SHADOW_OPACITY_MIN: 0.05,
  /** 用途: 控制阴影表现中的 SHADOW_OPACITY_BASE; 效果: 影响透明度边缘裁剪与叠加观感; 可用值范围: 通常为 0 到 1 的有限实数. */
  SHADOW_OPACITY_BASE: 0.16,
  /** 用途: 控制阴影表现中的 SHADOW_OPACITY_JUMP_MUL; 效果: 影响透明度边缘裁剪与叠加观感; 可用值范围: 通常为 0 到 1 的有限实数. */
  SHADOW_OPACITY_JUMP_MUL: 0.42,
  /** 用途: 控制阴影表现中的 SHADOW_OPACITY_LANDING_MUL; 效果: 影响透明度边缘裁剪与叠加观感; 可用值范围: 通常为 0 到 1 的有限实数. */
  SHADOW_OPACITY_LANDING_MUL: 0.2,
} as const

export const BOARD3D_POSTFX_CONFIG = {
  /** 用途: 控制后处理中的 MAX_DEVICE_PIXEL_RATIO; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 通常为 0 到 1 的有限实数. */
  MAX_DEVICE_PIXEL_RATIO: 1.4,
  /** 用途: 控制后处理中的 POSTFX_PIXEL_RATIO_SCALE; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 通常为 0 到 1 的有限实数. */
  POSTFX_PIXEL_RATIO_SCALE: 1,
  /** 用途: 控制后处理中的 BLOOM_RESOLUTION_SCALE; 效果: 影响效果强度分布层次过渡与整体观感; 可用值范围: 有限实数. */
  BLOOM_RESOLUTION_SCALE: 0.65,
  /** 用途: 控制后处理中的 BLOOM_DENSE_TEXT_RESOLUTION_SCALE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  BLOOM_DENSE_TEXT_RESOLUTION_SCALE: 0.84,
  /** 用途: 控制后处理中的 BOKEH_ENABLE_MARGIN; 效果: 影响渲染表现与运行成本; 可用值范围: 有限实数. */
  BOKEH_ENABLE_MARGIN: 1.12,
  /** 用途: 控制后处理中的 BLOOM_INITIAL_RESOLUTION_X; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  BLOOM_INITIAL_RESOLUTION_X: 1,
  /** 用途: 控制后处理中的 BLOOM_INITIAL_RESOLUTION_Y; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  BLOOM_INITIAL_RESOLUTION_Y: 1,
  /** 用途: 控制后处理中的 BOKEH_INITIAL_FOCUS; 效果: 影响渲染表现与运行成本; 可用值范围: 有限实数. */
  BOKEH_INITIAL_FOCUS: 10,
  /** 用途: 控制后处理中的 BOKEH_FOCUS_MIN; 效果: 影响阈值判定边界行为与数值稳定性; 可用值范围: 有限实数需与对应上下界语义保持一致. */
  BOKEH_FOCUS_MIN: 4,
} as const

export const BOARD3D_ANIMATION_CONFIG = {
  /** 用途: 控制动画与动效中的 EMOJI_CARD_TEXTURE_SIZE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 大于等于 0 的有限实数采样或计数场景建议使用整数. */
  EMOJI_CARD_TEXTURE_SIZE: 512,
  /** 用途: 控制动画与动效中的 MOVE_ANIM_MS; 效果: 影响动画节奏反馈时机与运动手感; 可用值范围: 有限实数. */
  MOVE_ANIM_MS: 170,
  /** 用途: 控制动画与动效中的 SPAWN_ANIM_MS; 效果: 影响动画节奏反馈时机与运动手感; 可用值范围: 有限实数. */
  SPAWN_ANIM_MS: 140,
  /** 用途: 控制动画与动效中的 DESPAWN_ANIM_MS; 效果: 影响动画节奏反馈时机与运动手感; 可用值范围: 有限实数. */
  DESPAWN_ANIM_MS: 120,
  /** 用途: 控制动画与动效中的 SPAWN_SCALE_FROM; 效果: 影响动画节奏反馈时机与运动手感; 可用值范围: 有限实数. */
  SPAWN_SCALE_FROM: 0.66,
  /** 用途: 控制动画与动效中的 DESPAWN_SCALE_TO; 效果: 影响动画节奏反馈时机与运动手感; 可用值范围: 有限实数. */
  DESPAWN_SCALE_TO: 0.12,
  /** 用途: 控制动画与动效中的 LAND_PULSE_MS; 效果: 影响动画节奏反馈时机与运动手感; 可用值范围: 有限实数. */
  LAND_PULSE_MS: 125,
  /** 用途: 控制动画与动效中的 JUMP_HEIGHT; 效果: 影响动画节奏反馈时机与运动手感; 可用值范围: 有限实数. */
  JUMP_HEIGHT: 0.17,
  /** 用途: 控制动画与动效中的 EMOJI_MICRO_STRETCH_CYCLE_MS; 效果: 影响动画节奏反馈时机与运动手感; 可用值范围: 有限实数. */
  EMOJI_MICRO_STRETCH_CYCLE_MS: 1000,
  /** 用途: 控制动画与动效中的 EMOJI_MICRO_STRETCH_Y_AMP; 效果: 影响动画节奏反馈时机与运动手感; 可用值范围: 有限实数. */
  EMOJI_MICRO_STRETCH_Y_AMP: 0.035,
  /** 用途: 控制动画与动效中的 EMOJI_MICRO_STRETCH_X_AMP; 效果: 影响动画节奏反馈时机与运动手感; 可用值范围: 有限实数. */
  EMOJI_MICRO_STRETCH_X_AMP: 0.014,
  /** 用途: 控制动画与动效中的 MOVE_STRETCH_FACTOR; 效果: 影响动画节奏反馈时机与运动手感; 可用值范围: 有限实数. */
  MOVE_STRETCH_FACTOR: 0.17,
  /** 用途: 控制动画与动效中的 MOVE_SQUASH_FACTOR; 效果: 影响动画节奏反馈时机与运动手感; 可用值范围: 有限实数. */
  MOVE_SQUASH_FACTOR: 0.14,
  /** 用途: 控制动画与动效中的 LANDING_PULSE_HEIGHT; 效果: 影响动画节奏反馈时机与运动手感; 可用值范围: 有限实数. */
  LANDING_PULSE_HEIGHT: 0.04,
  /** 用途: 控制动画与动效中的 SPAWN_VERTICAL_OFFSET; 效果: 影响动画节奏反馈时机与运动手感; 可用值范围: 有限实数. */
  SPAWN_VERTICAL_OFFSET: 0.16,
  /** 用途: 控制动画与动效中的 DESPAWN_VERTICAL_OFFSET; 效果: 影响动画节奏反馈时机与运动手感; 可用值范围: 有限实数. */
  DESPAWN_VERTICAL_OFFSET: 0.12,
  /** 用途: 控制动画与动效中的 MOVE_ROLL_AMPLITUDE; 效果: 影响动画节奏反馈时机与运动手感; 可用值范围: 有限实数. */
  MOVE_ROLL_AMPLITUDE: 0.18,
} as const

export const BOARD3D_RULE_VISUAL_CONFIG = {
  /** 用途: 控制规则可视化中的 BELT_DIRECTION_GLYPH_UP; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 合法的字符串. */
  BELT_DIRECTION_GLYPH_UP: '\u2b06\ufe0f',
  /** 用途: 控制规则可视化中的 BELT_DIRECTION_GLYPH_RIGHT; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 合法的字符串. */
  BELT_DIRECTION_GLYPH_RIGHT: '\u27a1\ufe0f',
  /** 用途: 控制规则可视化中的 BELT_DIRECTION_GLYPH_DOWN; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 合法的字符串. */
  BELT_DIRECTION_GLYPH_DOWN: '\u2b07\ufe0f',
  /** 用途: 控制规则可视化中的 BELT_DIRECTION_GLYPH_LEFT; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 合法的字符串. */
  BELT_DIRECTION_GLYPH_LEFT: '\u2b05\ufe0f',
  /** 用途: 控制规则可视化中的 FACING_ARROW_PROPS; 效果: 影响渲染表现与运行成本; 可用值范围: 由 Property 枚举值组成的去重集合. */
  FACING_ARROW_PROPS: new Set<Property>(['you', 'move', 'shift']),
  /** 用途: 控制规则可视化中的 HAS_EMOJI; 效果: 影响符号映射文本识别与信息表达; 可用值范围: 合法的正则表达式. */
  HAS_EMOJI: /\p{Extended_Pictographic}/u,
} as const

export const BOARD3D_TEXT_CARD_STYLE_CONFIG = {
  /** 用途: 控制文字卡片配色中的 TEXT_CARD_SYNTAX_BACKGROUND; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  TEXT_CARD_SYNTAX_BACKGROUND: '#f2dca8',
  /** 用途: 控制文字卡片配色中的 TEXT_CARD_SYNTAX_BORDER; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  TEXT_CARD_SYNTAX_BORDER: '#c5a24c',
  /** 用途: 控制文字卡片配色中的 TEXT_CARD_SYNTAX_TEXT; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  TEXT_CARD_SYNTAX_TEXT: '#513c0c',
  /** 用途: 控制文字卡片配色中的 TEXT_CARD_SYNTAX_OUTLINE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  TEXT_CARD_SYNTAX_OUTLINE: '#fff9eb',
  /** 用途: 控制文字卡片配色中的 TEXT_CARD_NORMAL_BACKGROUND; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  TEXT_CARD_NORMAL_BACKGROUND: '#bfd8f6',
  /** 用途: 控制文字卡片配色中的 TEXT_CARD_NORMAL_BORDER; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  TEXT_CARD_NORMAL_BORDER: '#6c94c8',
  /** 用途: 控制文字卡片配色中的 TEXT_CARD_NORMAL_TEXT; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  TEXT_CARD_NORMAL_TEXT: '#19324f',
  /** 用途: 控制文字卡片配色中的 TEXT_CARD_NORMAL_OUTLINE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  TEXT_CARD_NORMAL_OUTLINE: '#f4f8ff',
} as const

export const BOARD3D_CARD_TEXTURE_CONFIG = {
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_SIZE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 大于等于 0 的有限实数采样或计数场景建议使用整数. */
  CARD_TEXTURE_SIZE: 256,
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_PAD_RATIO; 效果: 影响配色层次材质气质与可读性; 可用值范围: 通常为 0 到 1 的有限实数. */
  CARD_TEXTURE_PAD_RATIO: 0.08,
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_SHADOW_OFFSET_X; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  CARD_TEXTURE_SHADOW_OFFSET_X: 5,
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_SHADOW_OFFSET_Y; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  CARD_TEXTURE_SHADOW_OFFSET_Y: 8,
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_CORNER_RADIUS_RATIO; 效果: 影响配色层次材质气质与可读性; 可用值范围: 弧度值有限实数. */
  CARD_TEXTURE_CORNER_RADIUS_RATIO: 0.14,
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_SHADOW_COLOR; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  CARD_TEXTURE_SHADOW_COLOR: 'rgba(0, 0, 0, 0.2)',
  /** 用途: 控制卡片纹理绘制中的 TRANSPARENT_COLOR; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  TRANSPARENT_COLOR: 'rgba(0,0,0,0)',
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_BORDER_WIDTH_RATIO; 效果: 影响配色层次材质气质与可读性; 可用值范围: 通常为 0 到 1 的有限实数. */
  CARD_TEXTURE_BORDER_WIDTH_RATIO: 0.03,
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_BORDER_INSET; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  CARD_TEXTURE_BORDER_INSET: 2,
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_BORDER_RADIUS_RATIO; 效果: 影响配色层次材质气质与可读性; 可用值范围: 弧度值有限实数. */
  CARD_TEXTURE_BORDER_RADIUS_RATIO: 0.13,
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_EMOJI_FONT_RATIO; 效果: 影响配色层次材质气质与可读性; 可用值范围: 通常为 0 到 1 的有限实数. */
  CARD_TEXTURE_EMOJI_FONT_RATIO: 0.9,
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_TEXT_LONG_THRESHOLD; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  CARD_TEXTURE_TEXT_LONG_THRESHOLD: 5,
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_TEXT_MEDIUM_THRESHOLD; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  CARD_TEXTURE_TEXT_MEDIUM_THRESHOLD: 3,
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_TEXT_LONG_FONT_SIZE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 大于等于 0 的有限实数采样或计数场景建议使用整数. */
  CARD_TEXTURE_TEXT_LONG_FONT_SIZE: 56,
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_TEXT_MEDIUM_FONT_SIZE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 大于等于 0 的有限实数采样或计数场景建议使用整数. */
  CARD_TEXTURE_TEXT_MEDIUM_FONT_SIZE: 72,
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_TEXT_SHORT_FONT_SIZE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 大于等于 0 的有限实数采样或计数场景建议使用整数. */
  CARD_TEXTURE_TEXT_SHORT_FONT_SIZE: 96,
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_LABEL_OFFSET_Y; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  CARD_TEXTURE_LABEL_OFFSET_Y: 4,
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_TEXT_STROKE_WIDTH_RATIO; 效果: 影响配色层次材质气质与可读性; 可用值范围: 通常为 0 到 1 的有限实数. */
  CARD_TEXTURE_TEXT_STROKE_WIDTH_RATIO: 0.05,
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_LABEL_SHADOW_BLUR; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  CARD_TEXTURE_LABEL_SHADOW_BLUR: 7,
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_LABEL_SHADOW_COLOR; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  CARD_TEXTURE_LABEL_SHADOW_COLOR: 'rgba(0,0,0,0.25)',
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_NO_SHADOW_COLOR; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  CARD_TEXTURE_NO_SHADOW_COLOR: 'rgba(0,0,0,0)',
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_EMOJI_FONT_FAMILY; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 字体族字符串. */
  CARD_TEXTURE_EMOJI_FONT_FAMILY: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif',
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_TEXT_FONT_FAMILY; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 字体族字符串. */
  CARD_TEXTURE_TEXT_FONT_FAMILY: '"Trebuchet MS","Arial Rounded MT Bold","Segoe UI Emoji",sans-serif',
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_DIRECTION_FONT_RATIO; 效果: 影响配色层次材质气质与可读性; 可用值范围: 通常为 0 到 1 的有限实数. */
  CARD_TEXTURE_DIRECTION_FONT_RATIO: 0.36,
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_DIRECTION_EDGE_INSET_RATIO; 效果: 影响配色层次材质气质与可读性; 可用值范围: 通常为 0 到 1 的有限实数. */
  CARD_TEXTURE_DIRECTION_EDGE_INSET_RATIO: 0.12,
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_DIRECTION_SHADOW_BLUR; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  CARD_TEXTURE_DIRECTION_SHADOW_BLUR: 6,
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_DIRECTION_SHADOW_COLOR; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  CARD_TEXTURE_DIRECTION_SHADOW_COLOR: 'rgba(255,255,255,0.8)',
  /** 用途: 控制卡片纹理绘制中的 CARD_TEXTURE_DIRECTION_OFFSET_Y; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  CARD_TEXTURE_DIRECTION_OFFSET_Y: 1,
} as const

export const BOARD3D_GROUND_TEXTURE_CONFIG = {
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_TILE_SIZE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 大于等于 0 的有限实数采样或计数场景建议使用整数. */
  GROUND_TEXTURE_TILE_SIZE: 16,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_CANVAS_SIZE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 大于等于 0 的有限实数采样或计数场景建议使用整数. */
  GROUND_TEXTURE_CANVAS_SIZE: 192,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_BASE_COLOR; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  GROUND_TEXTURE_BASE_COLOR: '#e9eef3',
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_WASH_START; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  GROUND_TEXTURE_WASH_START: 'rgba(255,255,255,0.1)',
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_WASH_MIDDLE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  GROUND_TEXTURE_WASH_MIDDLE: 'rgba(236,243,248,0.2)',
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_WASH_END; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  GROUND_TEXTURE_WASH_END: 'rgba(211,221,230,0.14)',
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_WASH_MIDDLE_AT; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_WASH_MIDDLE_AT: 0.5,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_GRAIN_AMP; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_GRAIN_AMP: 16,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_CLOUD_AMP; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_CLOUD_AMP: 11,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_WARM_AMP; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_WARM_AMP: 6,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_CLOUD_FREQ; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_CLOUD_FREQ: 0.27,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_WARM_FREQ; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_WARM_FREQ: 0.16,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_CLOUD_SEED_X; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_CLOUD_SEED_X: 13,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_CLOUD_SEED_Y; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_CLOUD_SEED_Y: 23,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_WARM_SEED_X; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_WARM_SEED_X: 41,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_WARM_SEED_Y; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_WARM_SEED_Y: 7,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_GREEN_GRAIN_WEIGHT; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_GREEN_GRAIN_WEIGHT: 0.85,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_GREEN_CLOUD_WEIGHT; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_GREEN_CLOUD_WEIGHT: 0.6,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_BLUE_GRAIN_WEIGHT; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_BLUE_GRAIN_WEIGHT: 0.65,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_SPECKLE_COUNT; 效果: 影响配色层次材质气质与可读性; 可用值范围: 大于等于 0 的有限实数采样或计数场景建议使用整数. */
  GROUND_TEXTURE_SPECKLE_COUNT: 220,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_SPECKLE_RADIUS_BASE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 弧度值有限实数. */
  GROUND_TEXTURE_SPECKLE_RADIUS_BASE: 0.45,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_SPECKLE_RADIUS_RANGE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 弧度值有限实数. */
  GROUND_TEXTURE_SPECKLE_RADIUS_RANGE: 1.8,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_SPECKLE_ALPHA_BASE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 通常为 0 到 1 的有限实数. */
  GROUND_TEXTURE_SPECKLE_ALPHA_BASE: 0.01,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_SPECKLE_ALPHA_RANGE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 通常为 0 到 1 的有限实数. */
  GROUND_TEXTURE_SPECKLE_ALPHA_RANGE: 0.025,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_SPECKLE_SEED_X; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_SPECKLE_SEED_X: 17.1,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_SPECKLE_SEED_Y; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_SPECKLE_SEED_Y: 31.7,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_SPECKLE_SEED_RADIUS; 效果: 影响配色层次材质气质与可读性; 可用值范围: 弧度值有限实数. */
  GROUND_TEXTURE_SPECKLE_SEED_RADIUS: 5.3,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_SPECKLE_SEED_ALPHA; 效果: 影响配色层次材质气质与可读性; 可用值范围: 通常为 0 到 1 的有限实数. */
  GROUND_TEXTURE_SPECKLE_SEED_ALPHA: 9.2,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_STROKE_COUNT; 效果: 影响配色层次材质气质与可读性; 可用值范围: 大于等于 0 的有限实数采样或计数场景建议使用整数. */
  GROUND_TEXTURE_STROKE_COUNT: 120,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_STROKE_LENGTH_BASE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_STROKE_LENGTH_BASE: 5,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_STROKE_LENGTH_RANGE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_STROKE_LENGTH_RANGE: 11,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_STROKE_ALPHA_BASE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 通常为 0 到 1 的有限实数. */
  GROUND_TEXTURE_STROKE_ALPHA_BASE: 0.018,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_STROKE_ALPHA_RANGE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 通常为 0 到 1 的有限实数. */
  GROUND_TEXTURE_STROKE_ALPHA_RANGE: 0.022,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_STROKE_WIDTH_BASE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_STROKE_WIDTH_BASE: 0.5,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_STROKE_WIDTH_RANGE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_STROKE_WIDTH_RANGE: 0.7,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_STROKE_RGB; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  GROUND_TEXTURE_STROKE_RGB: '132,148,164',
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_STROKE_SEED_X; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_STROKE_SEED_X: 63.2,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_STROKE_SEED_Y; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_STROKE_SEED_Y: 27.4,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_STROKE_SEED_LENGTH; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_STROKE_SEED_LENGTH: 11.8,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_STROKE_SEED_ANGLE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 弧度值有限实数. */
  GROUND_TEXTURE_STROKE_SEED_ANGLE: 3.6,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_STROKE_SEED_ALPHA; 效果: 影响配色层次材质气质与可读性; 可用值范围: 通常为 0 到 1 的有限实数. */
  GROUND_TEXTURE_STROKE_SEED_ALPHA: 7.9,
  /** 用途: 控制地面纹理生成中的 GROUND_TEXTURE_STROKE_SEED_WIDTH; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  GROUND_TEXTURE_STROKE_SEED_WIDTH: 19.3,
} as const

export const BOARD3D_DUST_TEXTURE_CONFIG = {
  /** 用途: 控制尘埃纹理生成中的 DUST_TEXTURE_SIZE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 大于等于 0 的有限实数采样或计数场景建议使用整数. */
  DUST_TEXTURE_SIZE: 64,
  /** 用途: 控制尘埃纹理生成中的 DUST_TEXTURE_CENTER; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  DUST_TEXTURE_CENTER: 32,
  /** 用途: 控制尘埃纹理生成中的 DUST_TEXTURE_INNER_RADIUS; 效果: 影响配色层次材质气质与可读性; 可用值范围: 弧度值有限实数. */
  DUST_TEXTURE_INNER_RADIUS: 4,
  /** 用途: 控制尘埃纹理生成中的 DUST_TEXTURE_OUTER_RADIUS; 效果: 影响配色层次材质气质与可读性; 可用值范围: 弧度值有限实数. */
  DUST_TEXTURE_OUTER_RADIUS: 31,
  /** 用途: 控制尘埃纹理生成中的 DUST_TEXTURE_STOP_0; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  DUST_TEXTURE_STOP_0: 'rgba(255,255,255,0.92)',
  /** 用途: 控制尘埃纹理生成中的 DUST_TEXTURE_STOP_1; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  DUST_TEXTURE_STOP_1: 'rgba(248,245,236,0.5)',
  /** 用途: 控制尘埃纹理生成中的 DUST_TEXTURE_STOP_2; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  DUST_TEXTURE_STOP_2: 'rgba(248,245,236,0)',
  /** 用途: 控制尘埃纹理生成中的 DUST_TEXTURE_STOP_1_AT; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  DUST_TEXTURE_STOP_1_AT: 0.4,
} as const

export const BOARD3D_SHADOW_TEXTURE_CONFIG = {
  /** 用途: 控制阴影纹理生成中的 SHADOW_TEXTURE_SIZE; 效果: 影响配色层次材质气质与可读性; 可用值范围: 大于等于 0 的有限实数采样或计数场景建议使用整数. */
  SHADOW_TEXTURE_SIZE: 128,
  /** 用途: 控制阴影纹理生成中的 SHADOW_TEXTURE_CENTER; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  SHADOW_TEXTURE_CENTER: 64,
  /** 用途: 控制阴影纹理生成中的 SHADOW_TEXTURE_INNER_RADIUS; 效果: 影响配色层次材质气质与可读性; 可用值范围: 弧度值有限实数. */
  SHADOW_TEXTURE_INNER_RADIUS: 17,
  /** 用途: 控制阴影纹理生成中的 SHADOW_TEXTURE_OUTER_RADIUS; 效果: 影响配色层次材质气质与可读性; 可用值范围: 弧度值有限实数. */
  SHADOW_TEXTURE_OUTER_RADIUS: 50,
  /** 用途: 控制阴影纹理生成中的 SHADOW_TEXTURE_STOP_0; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  SHADOW_TEXTURE_STOP_0: 'rgba(0, 0, 0, 0.25)',
  /** 用途: 控制阴影纹理生成中的 SHADOW_TEXTURE_STOP_1; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  SHADOW_TEXTURE_STOP_1: 'rgba(0, 0, 0, 0.09)',
  /** 用途: 控制阴影纹理生成中的 SHADOW_TEXTURE_STOP_2; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  SHADOW_TEXTURE_STOP_2: 'rgba(0, 0, 0, 0)',
  /** 用途: 控制阴影纹理生成中的 SHADOW_TEXTURE_STOP_1_AT; 效果: 影响配色层次材质气质与可读性; 可用值范围: 有限实数. */
  SHADOW_TEXTURE_STOP_1_AT: 0.48,
} as const

export const BOARD3D_ATMOSPHERE_CONFIG = {
  /** 用途: 控制氛围与尘埃层中的 ATMOSPHERE_FOG_COLOR; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  ATMOSPHERE_FOG_COLOR: '#e8ecea',
  /** 用途: 控制氛围与尘埃层中的 ATMOSPHERE_FOG_DENSITY; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  ATMOSPHERE_FOG_DENSITY: 0.022,
  /** 用途: 控制氛围与尘埃层中的 DUST_PARTICLE_COUNT; 效果: 影响细节密度画面清晰度与性能开销; 可用值范围: 大于等于 0 的有限实数采样或计数场景建议使用整数. */
  DUST_PARTICLE_COUNT: 260,
  /** 用途: 控制氛围与尘埃层中的 DUST_SPREAD_BASE; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  DUST_SPREAD_BASE: 4.4,
  /** 用途: 控制氛围与尘埃层中的 DUST_SPREAD_MUL; 效果: 影响效果强度分布层次过渡与整体观感; 可用值范围: 有限实数. */
  DUST_SPREAD_MUL: 0.62,
  /** 用途: 控制氛围与尘埃层中的 DUST_HEIGHT_BASE; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  DUST_HEIGHT_BASE: 1.9,
  /** 用途: 控制氛围与尘埃层中的 DUST_HEIGHT_MUL; 效果: 影响细节密度画面清晰度与性能开销; 可用值范围: 有限实数. */
  DUST_HEIGHT_MUL: 0.24,
  /** 用途: 控制氛围与尘埃层中的 DUST_LAYER_DEPTH_SCALE; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  DUST_LAYER_DEPTH_SCALE: 0.8,
  /** 用途: 控制氛围与尘埃层中的 DUST_PARTICLE_SIZE; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 大于等于 0 的有限实数采样或计数场景建议使用整数. */
  DUST_PARTICLE_SIZE: 0.18,
  /** 用途: 控制氛围与尘埃层中的 DUST_PARTICLE_OPACITY; 效果: 影响透明度边缘裁剪与叠加观感; 可用值范围: 通常为 0 到 1 的有限实数. */
  DUST_PARTICLE_OPACITY: 0.2,
  /** 用途: 控制氛围与尘埃层中的 DUST_PARTICLE_ALPHA_TEST; 效果: 影响透明度边缘裁剪与叠加观感; 可用值范围: 通常为 0 到 1 的有限实数. */
  DUST_PARTICLE_ALPHA_TEST: 0.01,
  /** 用途: 控制氛围与尘埃层中的 DUST_PARTICLE_COLOR; 效果: 影响配色层次材质气质与可读性; 可用值范围: 合法的 CSS 颜色或颜色函数字符串. */
  DUST_PARTICLE_COLOR: '#f8f2e6',
  /** 用途: 控制氛围与尘埃层中的 DUST_LAYER_BASE_Y; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  DUST_LAYER_BASE_Y: 0.32,
  /** 用途: 控制氛围与尘埃层中的 DUST_HEIGHT_EXPONENT; 效果: 影响空间定位基准对齐关系与镜头稳定性; 可用值范围: 有限实数. */
  DUST_HEIGHT_EXPONENT: 0.72,
  /** 用途: 控制氛围与尘埃层中的 DUST_SEED_ANGLE; 效果: 影响朝向关系透视感与空间构图; 可用值范围: 弧度值有限实数. */
  DUST_SEED_ANGLE: 11.3,
  /** 用途: 控制氛围与尘埃层中的 DUST_SEED_RADIUS; 效果: 影响朝向关系透视感与空间构图; 可用值范围: 弧度值有限实数. */
  DUST_SEED_RADIUS: 37.7,
  /** 用途: 控制氛围与尘埃层中的 DUST_SEED_HEIGHT; 效果: 影响细节密度画面清晰度与性能开销; 可用值范围: 有限实数. */
  DUST_SEED_HEIGHT: 71.9,
} as const
