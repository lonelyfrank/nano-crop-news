const relativeTimeFormatter = new Intl.RelativeTimeFormat('it', { numeric: 'auto' })
const sameYearFormatter = new Intl.DateTimeFormat('it', { day: 'numeric', month: 'short' })
const otherYearFormatter = new Intl.DateTimeFormat('it', { day: 'numeric', month: 'short', year: 'numeric' })

/** Relativo entro le 48h ("3 ore fa"), data assoluta oltre (coerente coi
 * pulsanti di TimeRangeFilter, che oltre le 48h non hanno più un preset). */
export function formatPublishedDate(iso: string, now: Date = new Date()): string {
  const published = new Date(iso)
  const diffMs = published.getTime() - now.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  if (diffHours > -48) {
    if (Math.abs(diffHours) < 1) {
      const diffMinutes = Math.round(diffMs / (1000 * 60))
      return relativeTimeFormatter.format(diffMinutes, 'minute')
    }
    return relativeTimeFormatter.format(Math.round(diffHours), 'hour')
  }

  const formatter = published.getFullYear() === now.getFullYear() ? sameYearFormatter : otherYearFormatter
  return formatter.format(published)
}

/** Stima sull'anteprima disponibile (excerpt), non sull'articolo completo:
 * non ne abbiamo il testo integrale (nessuno scraping, solo campi RSS). */
export function estimateReadingMinutes(text: string): number {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(wordCount / 200))
}
