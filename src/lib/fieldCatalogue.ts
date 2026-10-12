export type FieldDefinition = {
  dictionary: string
  entity: string
  field: string
  shortName: string
  fullName: string
  indexed: string
  mandatory: string
  type: string
  unicode: string
  length: string
  caseFlag: string
  inDatabase: string
  tooltip: string
  webHelp: string
}

export type ImportResult = {
  fields: FieldDefinition[]
  rejectedRows: number
}

const EXPECTED_HEADER = [
  'Dictionary code',
  'Entity code',
  'Field code',
  'Short name',
  'Full name',
  'Indexed Field',
  'Mandatory?',
  'Field Type',
  'Unicode?',
  'Field length',
  'Case Flag',
  'Field in Database?',
  'Tool tip',
  'Web help',
]

function cleanTooltip(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:b|u)>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .trim()
}

export function parseFieldBar(text: string): ImportResult {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0)
  const header = lines.shift()?.split('|').slice(0, 14) ?? []

  if (header.join('|') !== EXPECTED_HEADER.join('|')) {
    throw new Error('This is not a recognised FLD BAR export.')
  }

  const fields: FieldDefinition[] = []
  let rejectedRows = 0

  for (const line of lines) {
    const parts = line.split('|')
    if (parts.length < 15) {
      rejectedRows += 1
      continue
    }

    // The first 12 columns are fixed. Tooltips can contain the BAR pipe
    // character, so rebuild that column from the remaining middle values.
    const finalEmpty = parts.at(-1) === ''
    const webHelpIndex = finalEmpty ? parts.length - 2 : parts.length - 1
    const tooltip = parts.slice(12, webHelpIndex).join('|')

    fields.push({
      dictionary: parts[0],
      entity: parts[1],
      field: parts[2],
      shortName: parts[3],
      fullName: parts[4],
      indexed: parts[5],
      mandatory: parts[6],
      type: parts[7],
      unicode: parts[8],
      length: parts[9],
      caseFlag: parts[10],
      inDatabase: parts[11],
      tooltip: cleanTooltip(tooltip),
      webHelp: parts[webHelpIndex] ?? '',
    })
  }

  return { fields, rejectedRows }
}

export function mergeFields(
  current: FieldDefinition[],
  incoming: FieldDefinition[],
) {
  const byKey = new Map(
    current.map((field) => [
      `${field.dictionary}.${field.entity}.${field.field}`,
      field,
    ]),
  )

  for (const field of incoming) {
    byKey.set(`${field.dictionary}.${field.entity}.${field.field}`, field)
  }

  return [...byKey.values()].sort((a, b) =>
    `${a.entity}.${a.field}.${a.dictionary}`.localeCompare(
      `${b.entity}.${b.field}.${b.dictionary}`,
    ),
  )
}

