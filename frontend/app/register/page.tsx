'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import styles from '../auth-form.module.css'

export default function RegisterPage() {
  const supabase = createClient()
  const router = useRouter()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmationSent, setConfirmationSent] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      })
      if (signUpError) throw signUpError

      if (data.session) {
        // Conferma email disattivata sul progetto: l'utente è già loggato.
        router.push('/')
        router.refresh()
      } else {
        setConfirmationSent(true)
      }
    } catch {
      setError("Non è stato possibile creare l'account. Controlla i dati inseriti.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.form}>
      <h1>Registrati</h1>
      {!confirmationSent ? (
        <form onSubmit={submit}>
          <label>
            Nome
            <input
              type="text"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
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
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Creazione account…' : 'Crea account'}
          </button>
        </form>
      ) : (
        <p>
          Controlla la tua casella email per confermare l&apos;account, poi{' '}
          <Link href="/login">accedi</Link>.
        </p>
      )}
      {!confirmationSent && (
        <p className={styles.switch}>
          Hai già un account? <Link href="/login">Accedi</Link>
        </p>
      )}
    </div>
  )
}
