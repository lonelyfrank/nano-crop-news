import Link from 'next/link'
import AppearanceMenu from './AppearanceMenu'
import styles from './Header.module.css'

export default function Header() {
  return (
    <header className={styles.topBar}>
      <Link href="/" className={styles.brand}>
        Nano Crop News
      </Link>
      <nav className={styles.topNav}>
        <Link href="/trends">Tendenze</Link>
        <Link href="/map">Mappa</Link>
        <AppearanceMenu />
      </nav>
    </header>
  )
}
