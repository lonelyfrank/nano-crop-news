export type Theme = 'light' | 'dark' | 'auto'
export type Density = 'comfortable' | 'compact'

const THEME_KEY = 'nc-theme'
const DENSITY_KEY = 'nc-density'

export function getTheme(): Theme {
  if (typeof window === 'undefined') return 'auto'
  const stored = window.localStorage.getItem(THEME_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'auto'
}

export function getDensity(): Density {
  if (typeof window === 'undefined') return 'comfortable'
  return window.localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable'
}

// "auto" e "comfortable" sono i default impliciti nel CSS: applicarli
// significa rimuovere l'attributo, non scriverlo esplicitamente.
export function applyTheme(theme: Theme) {
  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

export function applyDensity(density: Density) {
  if (density === 'compact') {
    document.documentElement.setAttribute('data-density', 'compact')
  } else {
    document.documentElement.removeAttribute('data-density')
  }
}

export function setTheme(theme: Theme) {
  window.localStorage.setItem(THEME_KEY, theme)
  applyTheme(theme)
}

export function setDensity(density: Density) {
  window.localStorage.setItem(DENSITY_KEY, density)
  applyDensity(density)
}
