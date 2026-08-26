<template>
  <div>
    <div class="filters">
      <select v-model="selectedSourceId" @change="resetAndReload">
        <option value="">Tutte le fonti</option>
        <option v-for="source in sources" :key="source.id" :value="source.id">
          {{ source.name }}
        </option>
      </select>

      <select v-model="selectedTagId" @change="resetAndReload">
        <option value="">Tutti i tag</option>
        <option v-for="tag in tags" :key="tag.id" :value="tag.id">
          {{ tag.name }}
        </option>
      </select>

      <button
        v-if="user"
        class="toggle-mine"
        :class="{ active: onlyMine }"
        @click="toggleMine"
      >
        I miei interessi
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
const selectedSourceId = ref<number | ''>('')
const selectedTagId = ref<number | ''>('')

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
  // quando si filtra per tag_id (con "tags" semplice, PostgREST filtra solo
  // l'array annidato, non le righe genitore).
  const tagsEmbed = selectedTagId.value ? 'tags!inner(id, name)' : 'tags(id, name)'

  let query = supabase
    .from('articles')
    .select(`*, source:sources(*), ${tagsEmbed}`)
    .order('published_at', { ascending: false })
    .limit(PAGE_SIZE)

  if (selectedSourceId.value) {
    query = query.eq('source_id', selectedSourceId.value)
  }
  if (selectedTagId.value) {
    query = query.eq('tags.id', selectedTagId.value)
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
.filters {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.filters select,
.toggle-mine {
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--text);
}

.toggle-mine {
  cursor: pointer;
}

.toggle-mine.active {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

.loading {
  text-align: center;
  color: var(--muted-text);
  padding: 1rem 0;
}

.sentinel {
  height: 1px;
}
</style>
