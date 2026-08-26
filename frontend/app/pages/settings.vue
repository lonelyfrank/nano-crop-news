<template>
  <div>
    <h1>Impostazioni</h1>
    <p class="hint">Scegli le fonti e i tag che vuoi seguire: verranno usati nella scheda "I miei interessi" del feed.</p>

    <section class="pref-section">
      <h2>Fonti</h2>
      <label v-for="source in sources" :key="source.id" class="pref-row">
        <input v-model="selectedSourceIds" type="checkbox" :value="source.id">
        {{ source.name }}
      </label>
    </section>

    <section class="pref-section">
      <h2>Tag</h2>
      <label v-for="tag in tags" :key="tag.id" class="pref-row">
        <input v-model="selectedTagIds" type="checkbox" :value="tag.id">
        {{ tag.name }}
      </label>
    </section>

    <button class="save-button" :disabled="saving" @click="save">
      {{ saving ? 'Salvataggio…' : 'Salva preferenze' }}
    </button>
    <p v-if="saved" class="saved-message">Preferenze salvate.</p>
  </div>
</template>

<script setup lang="ts">
import type { Source, Tag } from '~/types'

// Nessun middleware esplicito: questa pagina non è nella lista `exclude` di
// nuxt.config.ts, quindi il modulo @nuxtjs/supabase la protegge già da solo
// (redirect a /login se non autenticato).

const supabase = useSupabaseClient()
const user = useSupabaseUser()

const sources = ref<Source[]>([])
const tags = ref<Tag[]>([])
const selectedSourceIds = ref<number[]>([])
const selectedTagIds = ref<number[]>([])
const saving = ref(false)
const saved = ref(false)

onMounted(async () => {
  const [sourcesResponse, tagsResponse, preferencesResponse] = await Promise.all([
    supabase.from('sources').select('id, name, website_url, category, logo_url').order('name'),
    supabase.from('tags').select('id, name').order('name'),
    supabase.from('user_preferences').select('tag_id, source_id'),
  ])

  sources.value = sourcesResponse.data ?? []
  tags.value = tagsResponse.data ?? []

  const preferences = preferencesResponse.data ?? []
  selectedSourceIds.value = preferences.filter((p) => p.source_id).map((p) => p.source_id as number)
  selectedTagIds.value = preferences.filter((p) => p.tag_id).map((p) => p.tag_id as number)
})

async function save() {
  if (!user.value) return
  const uid = user.value.id

  saving.value = true
  saved.value = false
  try {
    await supabase.from('user_preferences').delete().eq('user_id', uid)

    const rows = [
      ...selectedSourceIds.value.map((source_id) => ({ user_id: uid, source_id })),
      ...selectedTagIds.value.map((tag_id) => ({ user_id: uid, tag_id })),
    ]

    if (rows.length > 0) {
      await supabase.from('user_preferences').insert(rows)
    }

    saved.value = true
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.hint {
  color: var(--muted-text);
}

.pref-section {
  margin-bottom: 1.5rem;
}

.pref-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0;
}

.save-button {
  padding: 0.6rem 1.2rem;
  border-radius: 6px;
  border: none;
  background: var(--accent);
  color: white;
  cursor: pointer;
}

.save-button:disabled {
  opacity: 0.6;
  cursor: default;
}

.saved-message {
  color: var(--muted-text);
  margin-top: 0.5rem;
}
</style>
