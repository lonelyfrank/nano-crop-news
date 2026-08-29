'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './NavLinks.module.css'

const TABS = [
  { href: '/', label: 'Feed' },
  { href: '/trends', label: 'Tendenze' },
  { href: '/map', label: 'Mappa' },
]

export default function NavLinks() {
  const pathname = usePathname()

  return (
    <nav className={styles.tabs}>
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`${styles.tab} ${pathname === tab.href ? styles.tabActive : ''}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
