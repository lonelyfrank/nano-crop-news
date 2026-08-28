'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import styles from './Header.module.css'

export default function Header() {
  const [user, setUser] = useState<User | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <header className={styles.topBar}>
      <Link href="/" className={styles.brand}>
        Nano Crop News
      </Link>
      <nav className={styles.topNav}>
        <Link href="/map">Mappa</Link>
        <Link href="/settings">Impostazioni</Link>
        {user ? (
          <>
            <span className={styles.userEmail}>{user.email}</span>
            <button className={styles.linkButton} onClick={handleLogout}>
              Esci
            </button>
          </>
        ) : (
          <Link href="/login">Accedi</Link>
        )}
      </nav>
    </header>
  )
}
