import {
  createEmptyMatchContext,
  resolveEmptyNegatedObjectsAt,
  resolveEmptyRuleTargetsAt,
} from './empty.js'
import { resolveRuleTargets } from './helpers.js'
import { isLetterName } from './letter-words.js'
import { GROUP_NOUNS, matchesRuleSubject } from './rule-match.js'

import type { RuleRuntime } from './rule-runtime.js'
import {
  isDirectionWord,
  isPropertyWord,
  isSpecialNounWord,
  RULE_SYNTAX_WORDS,
} from './types.js'

import type { LevelItem, Rule } from './types.js'

const toTransformed = (item: LevelItem, target: string): LevelItem | null => {
  if (target === 'empty') return null

  if (target === 'text') {
    const transformed: LevelItem = {
      ...item,
      name: item.isText ? 'text' : item.name,
      isText: true,
      originName: item.originName ?? item.name,
      converted: true,
    }
    // A transform yields a fresh unit id officially — `objectdata`
    // resets with it, so tele exhaustion does not carry over.
    delete transformed.teleported
    // `addunit`→`statusblock` latches the new unit's float from live
    // rules — the source's turn-start latch doesn't carry over.
    delete transformed.floatLatch
    return transformed
  }

  const transformed: LevelItem = {
    ...item,
    name: target,
    isText: false,
    // The official `ogname` is the unit's birth name — the first rename
    // records it so `x is revert` can transform back. Once set it stays
    // sticky across further transforms.
    originName: item.originName ?? item.name,
    converted: true,
  }
  delete transformed.teleported
  delete transformed.floatLatch
  return transformed
}

// `x is revert` converts the entity back to the kind it originally was
// (official `ogname`); entities never transformed revert to themselves.
const resolveTransformTarget = (item: LevelItem, target: string): string =>
  target === 'revert' ? (item.originName ?? item.name) : target

const transformVariants = (
  item: LevelItem,
  target: string,
): LevelItem[] => {
  const transformed = toTransformed(item, target)
  if (!transformed) return []
  return [transformed]
}

const createFromEmpty = (
  id: number,
  x: number,
  y: number,
  target: string,
): LevelItem | null => {
  if (target === 'empty') return null
  if (target === 'text') {
    return {
      id,
      name: 'empty',
      x,
      y,
      isText: true,
      converted: true,
      spawned: true,
    }
  }

  return {
    id,
    name: target,
    x,
    y,
    isText: false,
    converted: true,
    spawned: true,
  }
}

export const applyTransforms = (
  items: LevelItem[],
  runtime: RuleRuntime,
  // Official `emptydata[tileid].conv` — cells that already fired an
  // empty conversion never fire again. Callers that persist the set pass
  // it in; it is read for gating and written when an empty cell spawns
  // or an entity converts to `empty`.
  emptyConverted?: Set<number>,
): {
  items: LevelItem[]
  changed: boolean
} => {
  const { context, height, width } = runtime
  const transformRules = runtime.buckets.isTransform
  if (!transformRules.length) return { items, changed: false }
  // The official `objectlist` backing `x is all` registers every placed
  // non-text unit plus the noun each type-0 `text_X` word refers to —
  // so `rock is all` can spawn `love` even when no love unit exists.
  const allTargets = Array.from(
    new Set(
      items
        .map((item) => item.name)
        .filter(
          (name) =>
            !isPropertyWord(name) &&
            !isSpecialNounWord(name) &&
            !isDirectionWord(name) &&
            !isLetterName(name) &&
            !RULE_SYNTAX_WORDS.has(name),
        ),
    ),
  )

  const next: LevelItem[] = []
  let nextId = items.reduce((max, item) => Math.max(max, item.id), 0) + 1
  let changed = false

  // `become` shares the transform pipeline but is resolved separately:
  // only `x is x`-style identity targets veto the whole transform set —
  // `x become x` (or a `revert` that resolves to the current kind) is a
  // silent no-op, matching the official convert() where same-name become
  // still fires without suppressing other transforms.
  const isTransformRules = transformRules.filter(
    (rule) => rule.kind === 'is-transform',
  )
  const becomeRules = transformRules.filter(
    (rule) => rule.kind === 'become',
  )

  // Candidate prefilter by subject kind: negated and `all`/`group*`
  // subjects are wildcards the matcher must see; concrete subjects can
  // only match a same-named non-text item, `text` subject only text.
  // Filtering in source order matters — the first collected variant
  // becomes the source's new identity.
  const couldBeSubjectOf = (item: LevelItem, rule: Rule): boolean => {
    if (
      rule.subjectNegated === true ||
      rule.subject === 'all' ||
      GROUP_NOUNS.has(rule.subject)
    )
      return true
    if (item.isText) return rule.subject === 'text'
    return rule.subject === item.name
  }
  const isCandidatesFor = (item: LevelItem): Rule[] =>
    isTransformRules.filter((rule) => couldBeSubjectOf(item, rule))
  const becomeCandidatesFor = (item: LevelItem): Rule[] =>
    becomeRules.filter((rule) => couldBeSubjectOf(item, rule))
  // Only object-negated rules can self-delete or protect an `x is all`
  // spawn — precompute so items without any skip the scans outright.
  const negatedIsRules = isTransformRules.filter(
    (rule) => rule.objectNegated === true,
  )
  const negatedBecomeRules = becomeRules.filter(
    (rule) => rule.objectNegated === true,
  )
  // `x is all` materialized lazily: `x is not b` protects object b from
  // the spawn (official createall_single), and co-occupant names are
  // skipped — both only matter once an `all` target actually resolves.
  let namesByCellCache: Map<number, Set<string>> | undefined
  const namesAtCell = (item: LevelItem): Set<string> | undefined => {
    if (!namesByCellCache) {
      namesByCellCache = new Map()
      for (const unit of items) {
        if (unit.isText) continue
        const key = unit.y * width + unit.x
        const list = namesByCellCache.get(key) ?? new Set()
        list.add(unit.name)
        namesByCellCache.set(key, list)
      }
    }
    // The source's own name is skipped by the `all` loop anyway, so the
    // cell set can include it without changing the verdict.
    return namesByCellCache.get(item.y * width + item.x)
  }

  for (const item of items) {
    // Official `flags[CONVERTED]`: units the engine spawned (has/more/
    // make/write drops, earlier transforms) can never be a transform
    // source — `conversion()` skips them outright.
    if (item.converted) {
      next.push(item)
      continue
    }

    // `x is not x` is the official `error` conversion (convert.lua): the
    // unit deletes itself outright — a paradox, not a veto like `x is not
    // y`, and `x is x` cannot suppress it (rules.lua's protect pass only
    // rewrites rules whose object passes getmat, which `not x` fails).
    // `empty`/`level`/`all`/`group` subjects take different official
    // branches (destroylevel / no unitlist) and stay unmodelled; `text is
    // not text` wipes every text unit via the shared unitlists["text"].
    const selfDeleted = (rules: Rule[]) =>
      rules.some((rule) => {
        if (!matchesRuleSubject(item, rule, context)) return false
        // `not s is not o` expands officially (rules.lua addoption) into
        // one `i is not o` rule per objectlist name i ≠ s — the i === o
        // member is the same error conversion, so every o-typed unit
        // paradoxes. `not o is not o` omits o from the expansion, so o
        // survives; special-noun subjects (all/text/empty/…) never
        // expand. Text units can't match a negated subject at all.
        if (rule.subjectNegated === true)
          return (
            !isSpecialNounWord(rule.subject) &&
            item.name === rule.object &&
            item.name !== rule.subject
          )
        return (
          (rule.object as string) === (rule.subject as string) &&
          (!isSpecialNounWord(rule.subject) || rule.subject === 'text')
        )
      })
    if (
      (negatedIsRules.length || negatedBecomeRules.length) &&
      (selfDeleted(negatedIsRules) || selfDeleted(negatedBecomeRules))
    ) {
      changed = true
      continue
    }

    const isCandidates = isCandidatesFor(item)
    const becomeCandidates = becomeCandidatesFor(item)
    const isTargets = resolveRuleTargets(
      item,
      isCandidates,
      (candidate, rule) => matchesRuleSubject(candidate, rule, context),
    )
    const becomeTargets = resolveRuleTargets(
      item,
      becomeCandidates,
      (candidate, rule) => matchesRuleSubject(candidate, rule, context),
    )
    if (!isTargets.length && !becomeTargets.length) {
      next.push(item)
      continue
    }

    const transformedByKey = new Map<string, LevelItem>()
    const spawnedByKey = new Map<string, LevelItem>()
    let vetoed = false
    // `x is not b` rules protecting the `all` spawn are per-item (the
    // matcher can gate on conditions) — resolved on first `all` target.
    let negated: Set<string> | undefined
    const collectVariants = (targets: string[], vetoOnIdentity: boolean) => {
      for (const target of targets) {
        const resolved = resolveTransformTarget(item, target)
        // `x is all` keeps the source and stacks one of every other
        // object name at the cell — it is additive, not a transform,
        // so it never participates in the identity veto below.
        if (resolved === 'all') {
          if (!negated) {
            negated = new Set()
            for (const rule of negatedIsRules)
              if (matchesRuleSubject(item, rule, context))
                negated.add(rule.object)
          }
          const coOccupants = namesAtCell(item)
          for (const name of allTargets) {
            if (name === item.name || negated.has(name)) continue
            if (coOccupants?.has(name)) continue
            const variant = toTransformed(item, name)
            if (variant) spawnedByKey.set(`0:${name}`, variant)
          }
          continue
        }
        const variants = transformVariants(item, resolved)
        for (const variant of variants) {
          const identity =
            variant.name === item.name && variant.isText === item.isText
          if (identity) {
            if (vetoOnIdentity) vetoed = true
            continue
          }
          transformedByKey.set(
            `${variant.isText ? '1' : '0'}:${variant.name}`,
            variant,
          )
        }
      }
    }
    collectVariants(isTargets, true)
    collectVariants(becomeTargets, false)

    const spawned = Array.from(spawnedByKey.values())
    // `x is all` stack-mates are official `createall_single` products —
    // they go through create(), so they carry `new` like any drop.
    const pushSpawned = () => {
      for (const variant of spawned)
        next.push({ ...variant, id: nextId++, spawned: true })
      if (spawned.length) changed = true
    }

    // `x is x` vetoes every transform for x (predecessor `is_noun` returns
    // no targets when the entity itself is among them), e.g.
    // `flag is flag` + `flag is jelly` leaves flag unchanged.
    if (vetoed) {
      next.push(item)
      pushSpawned()
      continue
    }

    // `x is empty` deletes the unit and conv-marks its cell — an
    // `empty is …` spawn can never fire there again (official
    // convert.lua marks `emptydata[tileid].conv` on empty targets).
    if (
      emptyConverted !== undefined &&
      [...isTargets, ...becomeTargets].some(
        (target) => resolveTransformTarget(item, target) === 'empty',
      )
    ) {
      emptyConverted.add(item.y * width + item.x)
    }

    const transformed = Array.from(transformedByKey.values())
    const resolvedTargets = [...isTargets, ...becomeTargets].map((target) =>
      resolveTransformTarget(item, target),
    )
    const keepsSource =
      resolvedTargets.includes('all') && !resolvedTargets.includes('empty')
    if (!transformed.length) {
      // Pure `x is all` leaves the source in place; `x is empty`
      // still deletes it.
      if (keepsSource) {
        next.push(item)
        pushSpawned()
      } else {
        changed = true
      }
      continue
    }

    changed = true
    const first = transformed[0]
    if (!first) continue
    next.push({ ...first, id: item.id })
    for (const rest of transformed.slice(1))
      next.push({ ...rest, id: nextId++ })
    pushSpawned()
  }

  const emptyTransformRules = transformRules.filter(
    (rule) => rule.subject === 'empty' && !rule.subjectNegated,
  )
  if (emptyTransformRules.length) {
    const emptyContext = createEmptyMatchContext(next, runtime.rules, width, height)
    const occupied = new Set<number>()
    for (const item of next) occupied.add(item.y * width + item.x)

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cellKey = y * width + x
        if (occupied.has(cellKey)) continue
        // One-shot per cell: the official `conv` flag makes a converted
        // empty cell permanently ineligible, even if it empties again.
        if (emptyConverted?.has(cellKey)) continue
        const emptyTargets = [
          ...resolveEmptyRuleTargetsAt(
            emptyTransformRules,
            emptyContext,
            x,
            y,
            'is-transform',
          ),
          ...resolveEmptyRuleTargetsAt(
            emptyTransformRules,
            emptyContext,
            x,
            y,
            'become',
          ),
        ]
        if (!emptyTargets.length) continue

        for (const target of emptyTargets) {
          // `empty is all` stacks one of every object name at the cell
          // (respecting `empty is not b` protection). Officially the
          // createall branch never sets the `conv` flag — the cell is
          // occupied afterwards, so it cannot refire until emptied.
          if (target === 'all') {
            const emptyNegated = new Set<string>([
              ...resolveEmptyNegatedObjectsAt(
                emptyTransformRules,
                emptyContext,
                x,
                y,
                'is-transform',
              ),
              ...resolveEmptyNegatedObjectsAt(
                emptyTransformRules,
                emptyContext,
                x,
                y,
                'become',
              ),
            ])
            for (const name of allTargets) {
              if (emptyNegated.has(name)) continue
              next.push({
                id: nextId,
                name,
                x,
                y,
                isText: false,
                converted: true,
                spawned: true,
              })
              nextId += 1
              changed = true
            }
            continue
          }
          const spawned = createFromEmpty(nextId, x, y, target)
          if (!spawned) continue
          next.push(spawned)
          nextId += 1
          changed = true
          emptyConverted?.add(cellKey)
        }
      }
    }
  }

  return { items: next, changed }
}
