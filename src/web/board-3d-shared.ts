export type { CardSpec, EntityView } from './board-3d-shared-types.js'

export {
  clamp01,
  lerp,
  easeOutCubic,
  emojiBottomAnchorOffset,
  emojiMicroStretch,
} from './board-3d-shared-math.js'

export {
  BELT_DIRECTION_GLYPHS,
  cardRotXForItem,
  cardRollForItemStep,
  cardSpecForItem,
  emojiPhaseOffsetMsForItem,
  emojiStretchEnabledForItem,
  isEmojiItem,
} from './board-3d-shared-item.js'

export {
  buildEntityViews,
  computeEntityBaseTarget,
} from './board-3d-shared-layout.js'
