'use client'

import { useEffect, useState } from 'react'
import {
  applyDensity,
  applyTheme,
  getDensity,
  getTheme,
  setDensity as persistDensity,
  setTheme as persistTheme,
  type Density,
  type Theme,
} from '@/lib/appearance'
import styles from './AppearanceMenu.module.css'

const THEME_OPTIONS: { key: Theme; label: string }[] = [
  { key: 'light', label: 'Chiaro' },
  { key: 'dark', label: 'Scuro' },
  { key: 'auto', label: 'Auto' },
]

const DENSITY_OPTIONS: { key: Density; label: string }[] = [
  { key: 'comfortable', label: 'Comoda' },
  { key: 'compact', label: 'Compatta' },
]

export default function AppearanceMenu() {
  const [open, setOpen] = useState(false)
  // Default coerente col rendering server (nessuna preferenza salvata
  // ancora letta): sincronizzato col valore reale in localStorage subito
  // dopo il mount, per non disallineare l'idratazione.
  const [theme, setThemeState] = useState<Theme>('auto')
  const [density, setDensityState] = useState<Density>('comfortable')

  useEffect(() => {
    async function syncFromStorage() {
      await Promise.resolve()
      setThemeState(getTheme())
      setDensityState(getDensity())
    }
    syncFromStorage()
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    applyDensity(density)
  }, [density])

  function chooseTheme(next: Theme) {
    setThemeState(next)
    persistTheme(next)
  }

  function chooseDensity(next: Density) {
    setDensityState(next)
    persistDensity(next)
  }

  return (
    <div className={styles.wrapper}>
      <button type="button" className={styles.trigger} onClick={() => setOpen((v) => !v)}>
        Aspetto
      </button>

      {open && (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} />
          <div className={styles.panel}>
            <div className={styles.group}>
              <span className={styles.groupLabel}>Tema</span>
              <div className={styles.buttonRow}>
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`${styles.option} ${theme === option.key ? styles.optionActive : ''}`}
                    onClick={() => chooseTheme(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.group}>
              <span className={styles.groupLabel}>Densità</span>
              <div className={styles.buttonRow}>
                {DENSITY_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`${styles.option} ${density === option.key ? styles.optionActive : ''}`}
                    onClick={() => chooseDensity(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
