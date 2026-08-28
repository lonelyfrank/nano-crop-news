import { createBrowserClient } from '@supabase/ssr'

/**
 * Client Supabase per i Client Component (browser). Usa la anon/publishable
 * key: le regole di accesso restano quelle imposte dalla RLS lato database.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
