import type { FieldDefinition } from './fieldCatalogue'

export type Diagnostic = {
  level: 'error' | 'warning' | 'note'
  message: string
  detail: string
}

const PAIRS = [
  ['<<', '>>', 'SRL variable'],
  ['[[', ']]', 'list'],
  ['{{', '}}', 'conditional text'],
] as const

function occurrences(text: string, token: string) {
  return text.split(token).length - 1
}

function containsNestedPair(text: string, open: string, close: string) {
  let depth = 0
  let position = 0

  while (position < text.length) {
    const nextOpen = text.indexOf(open, position)
    const nextClose = text.indexOf(close, position)

    if (nextOpen === -1 && nextClose === -1) return false

    if (nextOpen !== -1 && (nextClose === -1 || nextOpen < nextClose)) {
      depth += 1
      if (depth > 1) return true
      position = nextOpen + open.length
    } else {
      depth = Math.max(0, depth - 1)
      position = nextClose + close.length
    }
  }

  return false
}

export function validateSrl(
  text: string,
  fields: FieldDefinition[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  if (!text.trim()) {
    return [
      {
        level: 'note',
        message: 'Start with text or insert a syntax block.',
        detail: 'Static checks will appear here as the SRL is written.',
      },
    ]
  }

  for (const [open, close, label] of PAIRS) {
    const openCount = occurrences(text, open)
    const closeCount = occurrences(text, close)
    if (openCount !== closeCount) {
      diagnostics.push({
        level: 'error',
        message: `Unbalanced ${label}`,
        detail: `${openCount} opening ${open} and ${closeCount} closing ${close}.`,
      })
    }
  }

  if (/\{\{\s*SEL\s*:\s*<</i.test(text)) {
    diagnostics.push({
      level: 'warning',
      message: 'Possible old-style condition',
      detail: 'Prefer new-style conditions with the expression inside brackets.',
    })
  }

  if (/=\s*'\*'/.test(text)) {
    diagnostics.push({
      level: 'warning',
      message: "The '*' profile also matches blank values",
      detail: 'Use != "" when the intention is to check for a populated field.',
    })
  }

  if (containsNestedPair(text, '[[', ']]')) {
    diagnostics.push({
      level: 'error',
      message: 'Nested lists are not supported',
      detail: 'Move the inner retrieval to an SLP or restructure the list.',
    })
  }

  if (containsNestedPair(text, '{{', '}}')) {
    diagnostics.push({
      level: 'error',
      message: 'Nested conditional text is not supported',
      detail: 'Use an SLP or combine the checks into one new-style condition.',
    })
  }

  if (text.includes('MEN_YDMU.ACTION')) {
    const actionLines = text
      .split(/\r?\n/)
      .filter((line) => line.includes('MEN_YDMU.ACTION'))
    if (actionLines.some((line) => !line.includes('&P'))) {
      diagnostics.push({
        level: 'warning',
        message: 'Review the MEN_YDMU.ACTION packet',
        detail: 'Keep the complete action packet on one physical line before import.',
      })
    }
  }

  if (fields.length > 0) {
    const knownFields = new Set(fields.map((field) => field.field.toUpperCase()))
    const fieldPattern = /<<\s*([A-Z][A-Z0-9_]{2,})(?:\.[A-Z0-9_]+)?(?:\.[A-Z0-9_]+)?(?:&[^>]*)?\s*>>/gi
    const unknown = new Set<string>()
    for (const match of text.matchAll(fieldPattern)) {
      const field = match[1].toUpperCase()
      if (!knownFields.has(field) && !field.startsWith('GSL_')) {
        unknown.add(field)
      }
    }
    if (unknown.size > 0) {
      diagnostics.push({
        level: 'warning',
        message: 'Fields not found in the imported catalogue',
        detail: [...unknown].join(', '),
      })
    }
  }

  if (diagnostics.length === 0) {
    diagnostics.push({
      level: 'note',
      message: 'No static issues found',
      detail: 'SITS retrieval context and runtime behaviour still require a TEST run.',
    })
  }

  return diagnostics
}

