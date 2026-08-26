import { createClient } from 'npm:@supabase/supabase-js@2'

/**
 * SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono iniettate automaticamente da
 * Supabase in ogni Edge Function deployata: non vanno impostate a mano.
 * La service role key bypassa la RLS: è l'unico modo in cui questa function
 * può scrivere su `articles`/`article_clusters` (tabelle altrimenti di sola
 * lettura per anon/authenticated).
 */
export function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY mancanti nell'ambiente della function.")
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  })
}
