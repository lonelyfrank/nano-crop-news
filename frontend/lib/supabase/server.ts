import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Client Supabase per Server Component / Route Handler / middleware. Legge e
 * scrive i cookie di sessione: va creato per ogni richiesta (non va tenuto
 * come singleton a livello di modulo).
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // set() chiamato da un Server Component: ignorabile se c'è il
            // middleware a rinfrescare la sessione (vedi middleware.ts).
          }
        },
      },
    },
  )
}
