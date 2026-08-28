import type { Metadata } from 'next'
import Header from '@/components/Header'
import './globals.css'
import styles from './layout.module.css'

export const metadata: Metadata = {
  title: 'Nano Crop News',
  description: 'Aggregatore di notizie da feed RSS pubblici, ispirato a Column.news.',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
}

// Legge tema/densità da localStorage e li applica al <html> prima
// dell'idratazione, per evitare un flash del tema/spaziatura sbagliati al
// reload. Duplica volutamente la logica di lib/appearance.ts: qui deve
// essere testo puro eseguito prima che qualsiasi modulo React sia caricato.
const noFlashScript = `
(function () {
  try {
    var theme = localStorage.getItem('nc-theme');
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    if (localStorage.getItem('nc-density') === 'compact') {
      document.documentElement.setAttribute('data-density', 'compact');
    }
  } catch (e) {}
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className={styles.appShell}>
        <Header />
        <main className={styles.pageContainer}>{children}</main>
      </body>
    </html>
  )
}
