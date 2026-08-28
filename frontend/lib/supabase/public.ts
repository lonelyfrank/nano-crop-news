import { createClient } from '@supabase/supabase-js'

/**
 * Client Supabase per i Route Handler che leggono solo dati pubblici (RLS
 * anon), senza bisogno della sessione utente — niente cookie da gestire,
 * a differenza di server.ts.
 */
export function createPublicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}
