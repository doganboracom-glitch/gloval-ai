export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  let text = value == null ? '' : String(value)
  // A leading tab or carriage return is itself a spreadsheet injection vector (OWASP), even when no formula character follows.
  if (/^[\t\r]|^\s*[=+\-@]/u.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function serializeCsv(rows: ReadonlyArray<ReadonlyArray<string | number | boolean | null | undefined>>): string {
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`
}
