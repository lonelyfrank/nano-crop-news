'use client'

import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import ArticleCard from '@/components/ArticleCard'
import CheckboxGroup from '@/components/CheckboxGroup'
import TimeRangeFilter, { rangeForPreset } from '@/components/TimeRangeFilter'
import { createClient } from '@/lib/supabase/client'
import type { Article, Source, Tag } from '@/types'
import styles from './page.module.css'

const PAGE_SIZE = 20

export default function HomePage() {
  const supabase = createClient()

  const [user, setUser] = useState<User | null>(null)
  const [articles, setArticles] = useState<Article[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [selectedSourceIds, setSelectedSourceIds] = useState<number[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [timeRangeKey, setTimeRangeKey] = useState('all')
  const [onlyMine, setOnlyMine] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [pending, setPending] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const cursorRef = useRef<string | null>(null)
  const pendingRef = useRef(false)
  const hasMoreRef = useRef(true)
  const onlyMineRef = useRef(false)
  const selectedSourceIdsRef = useRef<number[]>([])
  const selectedTagIdsRef = useRef<number[]>([])
  const timeRangeKeyRef = useRef('all')
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchMainFeedPage(): Promise<Article[]> {
    // "tags!inner" forza il join a restringere anche le righe di articles
    // quando si filtra per tag (con "tags" semplice, PostgREST filtra solo
    // l'array annidato, non le righe genitore).
    const tagsEmbed = selectedTagIdsRef.current.length ? 'tags!inner(id, name)' : 'tags(id, name)'

    let query = supabase
      .from('articles')
      .select(`*, source:sources(*), ${tagsEmbed}`)
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

    const { from, to } = rangeForPreset(timeRangeKeyRef.current)
    if (from) query = query.gte('published_at', from)
    if (to) query = query.lte('published_at', to)

    const { data, error } = await query
    if (error) throw error

    return (data ?? []) as unknown as Article[]
  }

  async function fetchMyFeedPage(): Promise<Article[]> {
    const { from, to } = rangeForPreset(timeRangeKeyRef.current)
    const { data, error } = await supabase.rpc('get_my_feed', {
      p_cursor: cursorRef.current,
      p_limit: PAGE_SIZE,
      p_from: from,
      p_to: to,
    })
    if (error) throw error

    return ((data ?? []) as { article: Article }[]).map((row) => row.article)
  }

  async function loadPage() {
    if (pendingRef.current || !hasMoreRef.current) return

    pendingRef.current = true
    setPending(true)
    try {
      const page = onlyMineRef.current ? await fetchMyFeedPage() : await fetchMainFeedPage()

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

  function toggleMine() {
    const next = !onlyMineRef.current
    onlyMineRef.current = next
    setOnlyMine(next)
    resetAndReload()
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

  return (
    <div className={styles.homeLayout}>
      <div className={styles.feedColumn}>
        <div className={styles.mobileFiltersBar}>
          <button className={styles.filtersToggle} onClick={() => setShowFilters(true)}>
            Filtri
          </button>
        </div>

        {!articles.length && !pending && <p>Nessun articolo trovato.</p>}

        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}

        <div ref={sentinelRef} className={styles.sentinel} />
        {pending && <p className={styles.loading}>Caricamento…</p>}
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

        <TimeRangeFilter value={timeRangeKey} onChange={updateTimeRange} />

        {user && (
          <button
            className={`${styles.toggleMine} ${onlyMine ? styles.toggleMineActive : ''}`}
            onClick={toggleMine}
          >
            I miei interessi
          </button>
        )}

        {!onlyMine ? (
          <>
            <CheckboxGroup items={sources} value={selectedSourceIds} onChange={updateSourceIds} label="Fonti" />
            <CheckboxGroup
              items={tags}
              value={selectedTagIds}
              onChange={updateTagIds}
              label="Tag"
              hint="Nessun articolo ha ancora tag assegnati automaticamente: questo filtro può non restituire risultati."
            />
          </>
        ) : (
          <p className={styles.mineNote}>
            I filtri manuali sono disattivi con &quot;I miei interessi&quot; attivo: qui vedi il feed basato
            sulle fonti/tag salvati in Impostazioni.
          </p>
        )}
      </aside>
    </div>
  )
}
