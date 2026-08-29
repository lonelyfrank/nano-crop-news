'use client'

import { useEffect, useRef, useState } from 'react'
import ArticleCard from '@/components/ArticleCard'
import CheckboxGroup from '@/components/CheckboxGroup'
import SkeletonCard from '@/components/SkeletonCard'
import TimeRangeFilter, { rangeForPreset } from '@/components/TimeRangeFilter'
import { createClient } from '@/lib/supabase/client'
import type { Article, Source, Tag } from '@/types'
import styles from './page.module.css'

const PAGE_SIZE = 20

export default function HomePage() {
  const supabase = createClient()

  const [articles, setArticles] = useState<Article[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [selectedSourceIds, setSelectedSourceIds] = useState<number[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [timeRangeKey, setTimeRangeKey] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [pending, setPending] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const cursorRef = useRef<string | null>(null)
  const pendingRef = useRef(false)
  const hasMoreRef = useRef(true)
  const selectedSourceIdsRef = useRef<number[]>([])
  const selectedTagIdsRef = useRef<number[]>([])
  const timeRangeKeyRef = useRef('all')
  const searchRef = useRef('')
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  async function fetchMainFeedPage(): Promise<Article[]> {
    // "tags!inner" forza il join a restringere anche le righe di articles
    // quando si filtra per tag (con "tags" semplice, PostgREST filtra solo
    // l'array annidato, non le righe genitore).
    const tagsEmbed = selectedTagIdsRef.current.length ? 'tags!inner(id, name)' : 'tags(id, name)'
    // Colonne esplicite invece di "*": esclude search_vector (colonna
    // generata dello Step 5a), che non serve al client e non è pensata per
    // essere serializzata come testo nel payload.
    const articleColumns =
      'id, title, original_url, excerpt, summary_type, summary_text, author, image_url, published_at, cluster_id'

    let query = supabase
      .from('articles')
      .select(`${articleColumns}, source:sources(*), ${tagsEmbed}`)
      .order('published_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (selectedSourceIdsRef.current.length) {
      query = query.in('source_id', selectedSourceIdsRef.current)
    }
    if (selectedTagIdsRef.current.length) {
      query = query.in('tags.id', selectedTagIdsRef.current)
    }
    if (cursorRef.current) {
      query = query.lt('published_at', cursorRef.current)
    }
    if (searchRef.current) {
      query = query.textSearch('search_vector', searchRef.current, { type: 'websearch', config: 'simple' })
    }

    const { from, to } = rangeForPreset(timeRangeKeyRef.current)
    if (from) query = query.gte('published_at', from)
    if (to) query = query.lte('published_at', to)

    const { data, error } = await query
    if (error) throw error

    return (data ?? []) as unknown as Article[]
  }

  async function loadPage() {
    if (pendingRef.current || !hasMoreRef.current) return

    pendingRef.current = true
    setPending(true)
    try {
      const page = await fetchMainFeedPage()

      setArticles((prev) => [...prev, ...page])
      const more = page.length === PAGE_SIZE
      hasMoreRef.current = more
      setHasMore(more)
      if (page.length > 0) {
        cursorRef.current = page[page.length - 1].published_at
      }
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  function resetAndReload() {
    setArticles([])
    cursorRef.current = null
    hasMoreRef.current = true
    setHasMore(true)
    loadPage()
  }

  function updateSourceIds(next: number[]) {
    selectedSourceIdsRef.current = next
    setSelectedSourceIds(next)
    resetAndReload()
  }

  function updateTagIds(next: number[]) {
    selectedTagIdsRef.current = next
    setSelectedTagIds(next)
    resetAndReload()
  }

  function updateTimeRange(key: string) {
    timeRangeKeyRef.current = key
    setTimeRangeKey(key)
    resetAndReload()
  }

  function updateSearch(value: string) {
    setSearchInput(value)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      searchRef.current = value.trim()
      resetAndReload()
    }, 400)
  }

  function resetFilters() {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    setSearchInput('')
    searchRef.current = ''
    setSelectedSourceIds([])
    selectedSourceIdsRef.current = []
    setSelectedTagIds([])
    selectedTagIdsRef.current = []
    setTimeRangeKey('all')
    timeRangeKeyRef.current = 'all'
    resetAndReload()
  }

  function toggleSourceChip(id: number) {
    const next = selectedSourceIds.includes(id)
      ? selectedSourceIds.filter((existing) => existing !== id)
      : [...selectedSourceIds, id]
    updateSourceIds(next)
  }

  useEffect(() => {
    async function init() {
      const [sourcesResponse, tagsResponse] = await Promise.all([
        supabase.from('sources').select('id, name, website_url, category, logo_url').order('name'),
        supabase.from('tags').select('id, name').order('name'),
      ])
      setSources(sourcesResponse.data ?? [])
      setTags(tagsResponse.data ?? [])
      await loadPage()
    }

    init()

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        loadPage()
      }
    })

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current)
    }

    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [])

  const quickSources = sources.slice(0, 5)

  return (
    <div className={styles.container}>
      <div className={styles.homeLayout}>
        <div className={styles.feedColumn}>
          <div className={styles.searchBar}>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Cerca negli articoli…"
              value={searchInput}
              onChange={(e) => updateSearch(e.target.value)}
            />
          </div>

          <div className={styles.controlsBar}>
            <button className={styles.filtersToggle} onClick={() => setShowFilters(true)}>
              Filtri
            </button>
            <TimeRangeFilter value={timeRangeKey} onChange={updateTimeRange} />
          </div>

          {sources.length > 0 && (
            <div className={styles.sourceChips}>
              {quickSources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  className={`${styles.chip} ${selectedSourceIds.includes(source.id) ? styles.chipActive : ''}`}
                  onClick={() => toggleSourceChip(source.id)}
                >
                  {source.name}
                </button>
              ))}
              <button type="button" className={styles.chip} onClick={() => setShowFilters(true)}>
                Tutte le {sources.length} fonti →
              </button>
            </div>
          )}

          {!articles.length && pending && (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          )}

          {!articles.length && !pending && (
            <div className={styles.emptyState}>
              <p>Nessun articolo trovato.</p>
              <button type="button" className={styles.resetButton} onClick={resetFilters}>
                Reimposta filtri
              </button>
            </div>
          )}

          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}

          <div ref={sentinelRef} className={styles.sentinel} />
          {pending && articles.length > 0 && <p className={styles.loading}>Caricamento…</p>}
          {!hasMore && articles.length > 0 && !pending && (
            <p className={styles.loading}>Non ci sono altri articoli.</p>
          )}
        </div>

        {showFilters && <div className={styles.backdrop} onClick={() => setShowFilters(false)} />}

        <aside className={`${styles.sidebar} ${showFilters ? styles.sidebarOpen : ''}`}>
          <div className={styles.sidebarHeader}>
            <h2>Filtri</h2>
            <button
              className={styles.sidebarClose}
              aria-label="Chiudi filtri"
              onClick={() => setShowFilters(false)}
            >
              ×
            </button>
          </div>

          <CheckboxGroup items={sources} value={selectedSourceIds} onChange={updateSourceIds} label="Fonti" />
          <CheckboxGroup
            items={tags}
            value={selectedTagIds}
            onChange={updateTagIds}
            label="Tag"
            hint="Nessun articolo ha ancora tag assegnati automaticamente: il classificatore non esiste ancora, questo filtro è disattivato."
            disabled
          />
        </aside>
      </div>
    </div>
  )
}
