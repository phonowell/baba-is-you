type Rgb = {
  r: number
  g: number
  b: number
}

export type ClayPreset = {
  sceneBackground: string
  sky: {
    top: string
    horizon: string
  }
  fog: {
    density: number
  }
  bloom: {
    strength: number
    radius: number
    threshold: number
  }
  ao: {
    radius: number
    intensity: number
    distanceFalloff: number
    halfRes: boolean
    samples: number
  }
  grade: {
    vignetteStrength: number
    vignetteOffset: number
    contrast: number
    saturation: number
  }
  lighting: {
    ambientIntensity: number
    topLightIntensity: number
    topLightColor: string
    topLightShadowFar: number
    topLightShadowMapSize: number
    groundEmissiveIntensity: number
  }
  materials: {
    textEmissiveIntensity: number
    objectEmissiveIntensity: number
  }
  readability: {
    minContrastRatio: number
    textDensitySoftCap: number
    bloomStrengthFloor: number
  }
}

export type ClayCameraTier = {
  name: 'tight' | 'standard' | 'wide'
  maxSpan: number
  fov: number
  spanPadding: number
  distancePadding: number
  cameraY: number
  lookAtY: number
}

export type ClayObjectPalette = {
  background: string
  border: string
  textColor: string
  outlineColor: string
  contrastRatio: number
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

const hslCss = (h: number, s: number, l: number): string =>
  `hsl(${Math.round(h)}deg ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`

const toSrgb = (channel: number): number => {
  if (channel <= 0.04045) return channel / 12.92
  return ((channel + 0.055) / 1.055) ** 2.4
}

const luminance = (rgb: Rgb): number => {
  const r = toSrgb(rgb.r / 255)
  const g = toSrgb(rgb.g / 255)
  const b = toSrgb(rgb.b / 255)
  return r * 0.2126 + g * 0.7152 + b * 0.0722
}

const contrastRatio = (left: Rgb, right: Rgb): number => {
  const l1 = luminance(left)
  const l2 = luminance(right)
  const bright = Math.max(l1, l2)
  const dark = Math.min(l1, l2)
  return (bright + 0.05) / (dark + 0.05)
}

const hslToRgb = (h: number, s: number, l: number): Rgb => {
  const hue = ((h % 360) + 360) % 360
  const saturation = clamp01(s)
  const lightness = clamp01(l)

  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const hPrime = hue / 60
  const x = chroma * (1 - Math.abs((hPrime % 2) - 1))

  const [r1, g1, b1] =
    hPrime < 1
      ? [chroma, x, 0]
      : hPrime < 2
        ? [x, chroma, 0]
        : hPrime < 3
          ? [0, chroma, x]
          : hPrime < 4
            ? [0, x, chroma]
            : hPrime < 5
              ? [x, 0, chroma]
              : [chroma, 0, x]

  const m = lightness - chroma / 2
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  }
}

const toHex = (channel: number): string =>
  Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')

const rgbHex = (rgb: Rgb): string => `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`

const DARK_TEXT: Rgb = { r: 16, g: 32, b: 54 }
const LIGHT_TEXT: Rgb = { r: 245, g: 248, b: 255 }
const DARK_OUTLINE = '#f2f6ff'
const LIGHT_OUTLINE = '#0a1320'

export const CLAY_PRESET: ClayPreset = {
  // Pale blue-lavender: doubles as the fog tint so the board's far edge
  // dissolves into aerial-perspective haze.
  sceneBackground: '#b4d4ea',
  // Genshin-style sky backdrop: saturated azure zenith fading to a pale
  // hazy horizon.
  sky: {
    top: '#2f9be8',
    horizon: '#dcedf8',
  },
  fog: {
    density: 0.0075,
  },
  bloom: {
    // The Ghibli-like ethereal glow is a signature — aggressive by neutral
    // standards, still keyed to highlights only.
    strength: 0.34,
    radius: 0.5,
    threshold: 0.82,
  },
  ao: {
    radius: 0.5,
    intensity: 3.0,
    distanceFalloff: 0.6,
    halfRes: true,
    samples: 8,
  },
  grade: {
    vignetteStrength: 0.08,
    vignetteOffset: 0.35,
    contrast: 1.05,
    saturation: 1.12,
  },
  lighting: {
    ambientIntensity: 1.05,
    topLightIntensity: 1.8,
    topLightColor: '#ffedc8',
    topLightShadowFar: 46,
    topLightShadowMapSize: 1024,
    groundEmissiveIntensity: 0.05,
  },
  materials: {
    textEmissiveIntensity: 0.1,
    objectEmissiveIntensity: 0.05,
  },
  readability: {
    minContrastRatio: 4.8,
    textDensitySoftCap: 0.22,
    bloomStrengthFloor: 0.08,
  },
}

const CAMERA_TIERS: readonly ClayCameraTier[] = [
  {
    name: 'tight',
    maxSpan: 8,
    fov: 33,
    spanPadding: 2.1,
    distancePadding: 1.16,
    cameraY: 0,
    lookAtY: 0.16,
  },
  {
    name: 'standard',
    maxSpan: 13,
    fov: 34,
    spanPadding: 2.4,
    distancePadding: 1.34,
    cameraY: 0,
    lookAtY: 0.18,
  },
  {
    name: 'wide',
    maxSpan: Number.POSITIVE_INFINITY,
    fov: 36,
    spanPadding: 2.7,
    distancePadding: 1.56,
    cameraY: 0,
    lookAtY: 0.22,
  },
]

export const selectClayCameraTier = (
  boardWidth: number,
  boardHeight: number,
): ClayCameraTier => {
  const span = Math.max(1, boardWidth, boardHeight)
  const matched = CAMERA_TIERS.find((tier) => span <= tier.maxSpan)
  if (matched) return matched
  const fallback = CAMERA_TIERS[CAMERA_TIERS.length - 1]
  if (!fallback) throw new Error('Missing clay camera tiers.')
  return fallback
}

export const readabilityMix = (
  textTileCount: number,
  boardCellCount: number,
  softCap: number,
): number => {
  if (textTileCount <= 0 || boardCellCount <= 0 || softCap <= 0) return 0
  const density = textTileCount / boardCellCount
  return clamp01(density / softCap)
}

export const createClayObjectPalette = (
  hue: number,
  minContrastRatio: number,
): ClayObjectPalette => {
  const background = hslToRgb(hue, 0.52, 0.7)

  const darkContrast = contrastRatio(background, DARK_TEXT)
  const lightContrast = contrastRatio(background, LIGHT_TEXT)

  const useDark = darkContrast >= lightContrast
  const textRgb = useDark ? DARK_TEXT : LIGHT_TEXT
  const contrast = useDark ? darkContrast : lightContrast

  if (contrast >= minContrastRatio) {
    return {
      background: hslCss(hue, 0.52, 0.7),
      border: hslCss(hue, 0.47, 0.48),
      textColor: rgbHex(textRgb),
      outlineColor: useDark ? DARK_OUTLINE : LIGHT_OUTLINE,
      contrastRatio: contrast,
    }
  }

  const fallbackText = luminance(background) > 0.4 ? DARK_TEXT : LIGHT_TEXT
  const fallbackUseDark = fallbackText === DARK_TEXT
  return {
    background: hslCss(hue, 0.52, 0.7),
    border: hslCss(hue, 0.47, 0.48),
    textColor: rgbHex(fallbackText),
    outlineColor: fallbackUseDark ? DARK_OUTLINE : LIGHT_OUTLINE,
    contrastRatio: contrastRatio(background, fallbackText),
  }
}
