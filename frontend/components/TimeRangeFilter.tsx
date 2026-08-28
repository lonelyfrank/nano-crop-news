import styles from './TimeRangeFilter.module.css'

export interface TimeRange {
  from: string | null
  to: string | null
}

interface Preset {
  key: string
  label: string
  hours: number | null // null = "Sempre" (nessun filtro)
}

const PRESETS: Preset[] = [
  { key: '24h', label: 'Ultime 24h', hours: 24 },
  { key: '3d', label: 'Ultimi 3 giorni', hours: 72 },
  { key: '7d', label: 'Ultima settimana', hours: 24 * 7 },
  { key: 'all', label: 'Sempre', hours: null },
]

export function rangeForPreset(key: string): TimeRange {
  const preset = PRESETS.find((p) => p.key === key) ?? PRESETS[3]
  if (preset.hours === null) return { from: null, to: null }
  return { from: new Date(Date.now() - preset.hours * 60 * 60 * 1000).toISOString(), to: null }
}

interface Props {
  value: string
  onChange: (key: string) => void
}

/**
 * Bottoni preset invece di un vero slider trascinabile: stesso risultato
 * funzionale (filtrare per intervallo di date) senza introdurre una
 * libreria di slider o una gestione drag non banale.
 */
export default function TimeRangeFilter({ value, onChange }: Props) {
  return (
    <div className={styles.group}>
      {PRESETS.map((preset) => (
        <button
          key={preset.key}
          type="button"
          className={`${styles.button} ${value === preset.key ? styles.active : ''}`}
          onClick={() => onChange(preset.key)}
        >
          {preset.label}
        </button>
      ))}
    </div>
  )
}
