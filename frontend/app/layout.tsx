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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className={styles.appShell}>
        <Header />
        <main className={styles.pageContainer}>{children}</main>
      </body>
    </html>
  )
}
