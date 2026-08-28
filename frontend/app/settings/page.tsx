'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import CheckboxGroup from '@/components/CheckboxGroup'
import { createClient } from '@/lib/supabase/client'
import type { Source, Tag } from '@/types'
import styles from './page.module.css'

export default function SettingsPage() {
  const supabase = createClient()

  const [user, setUser] = useState<User | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [selectedSourceIds, setSelectedSourceIds] = useState<number[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: userData } = await supabase.auth.getUser()
      setUser(userData.user)

      const [sourcesResponse, tagsResponse, preferencesResponse] = await Promise.all([
        supabase.from('sources').select('id, name, website_url, category, logo_url').order('name'),
        supabase.from('tags').select('id, name').order('name'),
        supabase.from('user_preferences').select('tag_id, source_id'),
      ])

      setSources(sourcesResponse.data ?? [])
      setTags(tagsResponse.data ?? [])

      const preferences = preferencesResponse.data ?? []
      setSelectedSourceIds(preferences.filter((p) => p.source_id).map((p) => p.source_id as number))
      setSelectedTagIds(preferences.filter((p) => p.tag_id).map((p) => p.tag_id as number))
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    if (!user) return
    const uid = user.id

    setSaving(true)
    setSaved(false)
    try {
      await supabase.from('user_preferences').delete().eq('user_id', uid)

      const rows = [
        ...selectedSourceIds.map((source_id) => ({ user_id: uid, source_id })),
        ...selectedTagIds.map((tag_id) => ({ user_id: uid, tag_id })),
      ]

      if (rows.length > 0) {
        await supabase.from('user_preferences').insert(rows)
      }

      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1>Impostazioni</h1>
      <p className={styles.hint}>
        Scegli le fonti e i tag che vuoi seguire: verranno usati nella scheda &quot;I miei
        interessi&quot; del feed.
      </p>

      <CheckboxGroup items={sources} value={selectedSourceIds} onChange={setSelectedSourceIds} label="Fonti" />
      <CheckboxGroup items={tags} value={selectedTagIds} onChange={setSelectedTagIds} label="Tag" />

      <button className={styles.saveButton} disabled={saving} onClick={save}>
        {saving ? 'Salvataggio…' : 'Salva preferenze'}
      </button>
      {saved && <p className={styles.savedMessage}>Preferenze salvate.</p>}
    </div>
  )
}
