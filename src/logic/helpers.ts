import type { Rule } from './types.js'

export const keyFor = (x: number, y: number, width: number): number =>
  y * width + x

export const inBounds = (
  x: number,
  y: number,
  width: number,
  height: number,
): boolean => x >= 0 && y >= 0 && x < width && y < height

export const keyForLayer = (
  x: number,
  y: number,
  width: number,
  floating: boolean,
): number => keyFor(x, y, width) * 2 + (floating ? 1 : 0)

export const resolveRuleTargets = <T>(
  item: T,
  rules: Rule[],
  matchesRule: (item: T, rule: Rule) => boolean,
): string[] => {
  const yes = new Set<string>()
  const no = new Set<string>()

  for (const rule of rules) {
    if (!matchesRule(item, rule)) continue
    if (rule.objectNegated) no.add(rule.object)
    else yes.add(rule.object)
  }

  return Array.from(yes).filter((target) => !no.has(target))
}
