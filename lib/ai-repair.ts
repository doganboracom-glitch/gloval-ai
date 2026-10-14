import type { z } from 'zod'

/**
 * Deterministic, schema-guided repair of a model's JSON answer.
 *
 * It runs only AFTER a model answer failed validation, and only ever applies
 * mechanical fixes that need no guessing about the owner's content: trimming
 * oversize arrays/strings, filling a missing required string with a neutral
 * default, wrapping a lone object in a collection, dropping items or keys that
 * cannot be valid, and removing unknown keys. Whatever it cannot fix is
 * reported back as a failure; callers then retry once or fall back.
 *
 * Repair records carry a CODE and a normalized field path (`sections[].title`)
 * only. They never include values, so they are safe to log.
 */

export type RepairCode =
  | 'json_extracted'
  | 'sections_trimmed'
  | 'section_dropped'
  | 'pages_trimmed'
  | 'array_trimmed'
  | 'string_trimmed'
  | 'field_defaulted'
  | 'value_coerced'
  | 'enum_normalized'
  | 'collection_wrapped'
  | 'collection_dropped'
  | 'item_dropped'
  | 'value_dropped'
  | 'unknown_key_removed'

export type RepairStep = { code: RepairCode; path: string }

export type IssueSummary = { path: string; code: string; message: string }

export type FieldPath = ReadonlyArray<string | number>

export type RepairOptions = {
  /** Runs once before the generic pass; may reshape the value (e.g. trim sections). */
  preprocess?: (value: unknown, record: (code: RepairCode, path?: string) => void) => unknown
  /** Value for a required field the model left out; `undefined` = generic default. */
  defaultFor?: (path: FieldPath, root: unknown) => unknown
  maxPasses?: number
}

export type RepairResult<T> =
  | { ok: true; value: T; steps: RepairStep[] }
  | { ok: false; steps: RepairStep[]; issues: IssueSummary[] }

type Container = Record<string | number, unknown>

export function normalizePath(path: FieldPath): string {
  return path.reduce<string>((acc, part) => (typeof part === 'number' ? `${acc}[]` : acc ? `${acc}.${part}` : String(part)), '')
}

function isContainer(value: unknown): value is Container {
  return typeof value === 'object' && value !== null
}

export function getAt(root: unknown, path: FieldPath): unknown {
  let node: unknown = root
  for (const part of path) {
    if (!isContainer(node)) return undefined
    node = node[part]
  }
  return node
}

function parentOf(root: unknown, path: FieldPath): Container | null {
  const parent = getAt(root, path.slice(0, -1))
  return isContainer(parent) ? parent : null
}

/** Pulls a JSON object out of text that has fences or chatter around it. */
export function extractJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end <= start) throw new Error('no_json_object')
    return JSON.parse(text.slice(start, end + 1))
  }
}

export function summarizeIssues(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; code: string; message: string }>, limit = 8): IssueSummary[] {
  return issues.slice(0, limit).map((issue) => ({
    path: normalizePath(issue.path.map((p) => (typeof p === 'symbol' ? String(p.description) : p))),
    code: issue.code,
    message: issue.message.slice(0, 120),
  }))
}

type ZodIssueLike = {
  code: string
  path: ReadonlyArray<PropertyKey>
  message: string
  expected?: string
  maximum?: number | bigint
  origin?: string
  keys?: string[]
  values?: unknown[]
}

const MAX_PASSES = 8

export function repairToSchema<T>(raw: unknown, schema: z.ZodType<T>, options: RepairOptions = {}): RepairResult<T> {
  const steps: RepairStep[] = []
  const record = (code: RepairCode, path = '') => {
    steps.push({ code, path })
  }

  let value: unknown
  try {
    value = structuredClone(raw)
  } catch {
    return { ok: false, steps, issues: [{ path: '', code: 'not_cloneable', message: 'Value is not plain JSON' }] }
  }
  if (options.preprocess) value = options.preprocess(value, record)

  const maxPasses = options.maxPasses ?? MAX_PASSES
  let lastIssues: IssueSummary[] = []

  for (let pass = 0; pass < maxPasses; pass++) {
    const parsed = schema.safeParse(value)
    if (parsed.success) return { ok: true, value: parsed.data, steps }

    const issues = parsed.error.issues as unknown as ZodIssueLike[]
    lastIssues = summarizeIssues(issues)

    // Items are removed after all other fixes so earlier indices stay valid.
    const removals = new Map<string, { parent: unknown[]; indices: Set<number>; path: string }>()
    const queueItemRemoval = (path: FieldPath): boolean => {
      const parent = getAt(value, path.slice(0, -1))
      const index = path[path.length - 1]
      if (!Array.isArray(parent) || typeof index !== 'number') return false
      const key = JSON.stringify(path.slice(0, -1))
      const entry = removals.get(key) ?? { parent, indices: new Set<number>(), path: normalizePath(path) }
      entry.indices.add(index)
      removals.set(key, entry)
      return true
    }

    let changed = false
    for (const issue of issues) {
      const path = issue.path.filter((p): p is string | number => typeof p !== 'symbol')
      if (fixIssue(issue, path)) changed = true
    }

    for (const { parent, indices, path } of removals.values()) {
      for (const index of [...indices].sort((a, b) => b - a)) {
        parent.splice(index, 1)
        record('item_dropped', path)
        changed = true
      }
    }
    if (!changed) return { ok: false, steps, issues: lastIssues }

    function setValue(path: FieldPath, next: unknown): boolean {
      const parent = parentOf(value, path)
      if (!parent) return false
      parent[path[path.length - 1]] = next
      return true
    }
    function deleteKey(path: FieldPath): boolean {
      const parent = parentOf(value, path)
      if (!parent || Array.isArray(parent)) return false
      delete parent[path[path.length - 1]]
      return true
    }
    function dropValue(path: FieldPath, code: RepairCode): boolean {
      const last = path[path.length - 1]
      if (typeof last === 'number') return queueItemRemoval(path)
      const ok = deleteKey(path)
      if (ok) record(code, normalizePath(path))
      return ok
    }
    function fillMissing(path: FieldPath, expected: string | undefined): boolean {
      const custom = options.defaultFor?.(path, value)
      let next: unknown = custom
      if (next === undefined) {
        if (expected === 'string') next = ''
        else if (expected === 'array') next = []
        else if (expected === 'boolean') next = false
        else if (expected === 'object') next = {}
        else return false
      }
      const ok = setValue(path, next)
      if (ok) record('field_defaulted', normalizePath(path))
      return ok
    }

    function fixIssue(issue: ZodIssueLike, path: Array<string | number>): boolean {
      const current = getAt(value, path)
      switch (issue.code) {
        case 'unrecognized_keys': {
          const target = path.length ? current : value
          if (!isContainer(target)) return false
          for (const key of issue.keys ?? []) delete target[key]
          record('unknown_key_removed', normalizePath(path))
          return true
        }
        case 'too_big': {
          const max = Number(issue.maximum)
          if (Array.isArray(current) && Number.isFinite(max)) {
            current.length = max
            record(path.length === 1 && path[0] === 'pages' ? 'pages_trimmed' : 'array_trimmed', normalizePath(path))
            return true
          }
          if (typeof current === 'string' && Number.isFinite(max)) {
            if (!setValue(path, current.slice(0, max).trimEnd())) return false
            record('string_trimmed', normalizePath(path))
            return true
          }
          return false
        }
        case 'too_small': {
          if (typeof current === 'string' || current === undefined) return fillMissing(path, 'string')
          if (Array.isArray(current)) return dropValue(path, 'collection_dropped')
          return false
        }
        case 'invalid_type': {
          const expected = issue.expected
          if (current === undefined) {
            if (path.length === 0) return false
            return typeof path[path.length - 1] === 'number' ? queueItemRemoval(path) : fillMissing(path, expected)
          }
          if (current === null) {
            return expected === 'string' ? fillMissing(path, expected) : dropValue(path, 'value_dropped')
          }
          if (expected === 'string' && (typeof current === 'number' || typeof current === 'boolean')) {
            if (!setValue(path, String(current))) return false
            record('value_coerced', normalizePath(path))
            return true
          }
          if (expected === 'number' && typeof current === 'string' && current.trim() !== '' && Number.isFinite(Number(current))) {
            if (!setValue(path, Number(current))) return false
            record('value_coerced', normalizePath(path))
            return true
          }
          if (expected === 'boolean' && (current === 'true' || current === 'false')) {
            if (!setValue(path, current === 'true')) return false
            record('value_coerced', normalizePath(path))
            return true
          }
          if (expected === 'array') {
            if (typeof current === 'string' || (isContainer(current) && !Array.isArray(current))) {
              if (!setValue(path, [current])) return false
              record('collection_wrapped', normalizePath(path))
              return true
            }
            return dropValue(path, 'collection_dropped')
          }
          return dropValue(path, 'value_dropped')
        }
        case 'invalid_value': {
          if (typeof current === 'string' && Array.isArray(issue.values)) {
            const wanted = current.trim().toLowerCase()
            const match = issue.values.find((v) => typeof v === 'string' && v.toLowerCase() === wanted)
            if (match !== undefined && setValue(path, match)) {
              record('enum_normalized', normalizePath(path))
              return true
            }
          }
          return dropValue(path, 'value_dropped')
        }
        case 'invalid_union':
          return dropValue(path, 'value_dropped')
        default:
          return false
      }
    }
  }

  return { ok: false, steps, issues: lastIssues }
}

export function countCodes(steps: ReadonlyArray<RepairStep>): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const step of steps) counts[step.code] = (counts[step.code] ?? 0) + 1
  return counts
}
