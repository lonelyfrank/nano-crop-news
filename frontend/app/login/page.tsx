'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import styles from '../auth-form.module.css'

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError
      router.push('/')
      router.refresh()
    } catch {
      setError('Credenziali non valide.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.form}>
      <h1>Accedi</h1>
      <form onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Accesso…' : 'Accedi'}
        </button>
      </form>
      <p className={styles.switch}>
        Non hai un account? <Link href="/register">Registrati</Link>
      </p>
    </div>
  )
}
