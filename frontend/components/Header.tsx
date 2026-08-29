import Link from 'next/link'
import AppearanceMenu from './AppearanceMenu'
import NavLinks from './NavLinks'
import styles from './Header.module.css'

export default function Header() {
  return (
    <header className={styles.topBar}>
      <Link href="/" className={styles.brand}>
        Nano Crop News
      </Link>
      <NavLinks />
      <div className={styles.appearanceSlot}>
        <AppearanceMenu />
      </div>
    </header>
  )
}
