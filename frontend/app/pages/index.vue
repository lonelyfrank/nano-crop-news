<template>
  <div class="home-layout">
    <div class="feed-column">
      <div class="mobile-filters-bar">
        <button class="filters-toggle" @click="showFilters = true">
          Filtri
        </button>
      </div>

      <p v-if="!articles.length && !pending">Nessun articolo trovato.</p>

      <ArticleCard v-for="article in articles" :key="article.id" :article="article" />

      <div ref="sentinel" class="sentinel" />
      <p v-if="pending" class="loading">Caricamento…</p>
      <p v-if="!hasMore && articles.length && !pending" class="loading">
        Non ci sono altri articoli.
      </p>
    </div>

    <div v-if="showFilters" class="backdrop" @click="showFilters = false" />

    <aside class="sidebar" :class="{ open: showFilters }">
      <div class="sidebar-header">
        <h2>Filtri</h2>
        <button class="sidebar-close" aria-label="Chiudi filtri" @click="showFilters = false">×</button>
      </div>

      <button
        v-if="user"
        class="toggle-mine"
        :class="{ active: onlyMine }"
        @click="toggleMine"
      >
        I miei interessi
      </button>

      <template v-if="!onlyMine">
        <CheckboxGroup v-model="selectedSourceIds" :items="sources" label="Fonti" />
        <CheckboxGroup
          v-model="selectedTagIds"
          :items="tags"
          label="Tag"
          hint="Nessun articolo ha ancora tag assegnati automaticamente: questo filtro può non restituire risultati."
        />
      </template>
      <p v-else class="mine-note">
        I filtri manuali sono disattivi con "I miei interessi" attivo: qui vedi il
        feed basato sulle fonti/tag salvati in Impostazioni.
      </p>
    </aside>
  </div>
</template>

<script setup lang="ts">
import type { Article, Source, Tag } from '~/types'

const PAGE_SIZE = 20

const supabase = useSupabaseClient()
const user = useSupabaseUser()

const articles = ref<Article[]>([])
const cursor = ref<string | null>(null)
const hasMore = ref(true)
const pending = ref(false)
const onlyMine = ref(false)
const selectedSourceIds = ref<number[]>([])
const selectedTagIds = ref<number[]>([])
const showFilters = ref(false)

const sources = ref<Source[]>([])
const tags = ref<Tag[]>([])

const sentinel = ref<HTMLElement | null>(null)

async function loadFilters() {
  const [sourcesResponse, tagsResponse] = await Promise.all([
    supabase.from('sources').select('id, name, website_url, category, logo_url').order('name'),
    supabase.from('tags').select('id, name').order('name'),
  ])
  sources.value = sourcesResponse.data ?? []
  tags.value = tagsResponse.data ?? []
}

async function fetchMainFeedPage(): Promise<Article[]> {
  // "tags!inner" forza il join a restringere anche le righe di articles
  // quando si filtra per tag (con "tags" semplice, PostgREST filtra solo
  // l'array annidato, non le righe genitore).
  const tagsEmbed = selectedTagIds.value.length ? 'tags!inner(id, name)' : 'tags(id, name)'

  let query = supabase
    .from('articles')
    .select(`*, source:sources(*), ${tagsEmbed}`)
    .order('published_at', { ascending: false })
    .limit(PAGE_SIZE)

  if (selectedSourceIds.value.length) {
    query = query.in('source_id', selectedSourceIds.value)
  }
  if (selectedTagIds.value.length) {
    query = query.in('tags.id', selectedTagIds.value)
  }
  if (cursor.value) {
    query = query.lt('published_at', cursor.value)
  }

  const { data, error } = await query
  if (error) throw error

  return (data ?? []) as unknown as Article[]
}

async function fetchMyFeedPage(): Promise<Article[]> {
  const { data, error } = await supabase.rpc('get_my_feed', {
    p_cursor: cursor.value,
    p_limit: PAGE_SIZE,
  })
  if (error) throw error

  return ((data ?? []) as { article: Article }[]).map((row) => row.article)
}

async function loadPage() {
  if (pending.value || !hasMore.value) return

  pending.value = true
  try {
    const page = onlyMine.value ? await fetchMyFeedPage() : await fetchMainFeedPage()

    articles.value = [...articles.value, ...page]
    hasMore.value = page.length === PAGE_SIZE
    if (page.length > 0) {
      cursor.value = page[page.length - 1].published_at
    }
  } finally {
    pending.value = false
  }
}

function resetAndReload() {
  articles.value = []
  cursor.value = null
  hasMore.value = true
  loadPage()
}

function toggleMine() {
  onlyMine.value = !onlyMine.value
  resetAndReload()
}

// I filtri manuali sono nascosti (non distrutti) quando "onlyMine" è attivo,
// quindi non serve guardia extra qui: l'utente non può cambiarli in quello
// stato.
watch([selectedSourceIds, selectedTagIds], resetAndReload, { deep: true })

let observer: IntersectionObserver | null = null

onMounted(async () => {
  await Promise.all([loadFilters(), loadPage()])

  observer = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) {
      loadPage()
    }
  })

  if (sentinel.value) {
    observer.observe(sentinel.value)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
})
</script>

<style scoped>
.home-layout {
  display: flex;
  align-items: flex-start;
  gap: 2rem;
}

.feed-column {
  flex: 1;
  min-width: 0;
}

.mobile-filters-bar {
  display: none;
  margin-bottom: 1rem;
}

.filters-toggle {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--text);
  cursor: pointer;
}

.sidebar {
  width: 260px;
  flex-shrink: 0;
  position: sticky;
  top: 4.5rem;
  max-height: calc(100vh - 5.5rem);
  overflow-y: auto;
}

.sidebar-header {
  display: none;
}

.toggle-mine {
  display: block;
  width: 100%;
  margin-bottom: 1.25rem;
  padding: 0.5rem 0.6rem;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--text);
  cursor: pointer;
}

.toggle-mine.active {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

.mine-note {
  font-size: 0.85rem;
  color: var(--muted-text);
  line-height: 1.4;
}

.backdrop {
  display: none;
}

.loading {
  text-align: center;
  color: var(--muted-text);
  padding: 1rem 0;
}

.sentinel {
  height: 1px;
}

@media (max-width: 768px) {
  .home-layout {
    flex-direction: column;
  }

  .mobile-filters-bar {
    display: block;
  }

  .sidebar {
    position: fixed;
    top: 0;
    right: -100%;
    height: 100vh;
    width: min(320px, 85vw);
    z-index: 40;
    margin: 0;
    padding: 1.25rem;
    background: var(--card-bg);
    box-shadow: -6px 0 20px rgba(0, 0, 0, 0.25);
    transition: right 0.25s ease;
    overflow-y: auto;
  }

  .sidebar.open {
    right: 0;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .sidebar-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    color: inherit;
  }

  .backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 30;
  }
}
</style>
