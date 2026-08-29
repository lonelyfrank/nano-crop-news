import styles from './CheckboxGroup.module.css'

interface Item {
  id: number
  name: string
}

interface Props {
  items: Item[]
  value: number[]
  onChange: (next: number[]) => void
  label?: string
  hint?: string
  disabled?: boolean
}

export default function CheckboxGroup({ items, value, onChange, label, hint, disabled }: Props) {
  function toggle(id: number) {
    const next = value.includes(id) ? value.filter((existing) => existing !== id) : [...value, id]
    onChange(next)
  }

  return (
    <fieldset className={styles.group}>
      {label && <legend>{label}</legend>}
      {hint && <p className={styles.hint}>{hint}</p>}
      {items.map((item) => (
        <label key={item.id} className={`${styles.row} ${disabled ? styles.rowDisabled : ''}`}>
          <input
            type="checkbox"
            checked={value.includes(item.id)}
            disabled={disabled}
            onChange={() => toggle(item.id)}
          />
          {item.name}
        </label>
      ))}
      {items.length === 0 && <p className={styles.empty}>Nessuna opzione disponibile.</p>}
    </fieldset>
  )
}
