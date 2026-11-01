const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function formatCents(cents: number): string {
  return formatter.format(cents / 100)
}

/** Turns "12", "12.5" or "12.50" into cents using string math, never float math. */
export function parseDollars(input: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim())
  if (!match) return null
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null
}
