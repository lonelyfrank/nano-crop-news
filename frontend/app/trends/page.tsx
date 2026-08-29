'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ArticleCard from '@/components/ArticleCard'
import SkeletonCard from '@/components/SkeletonCard'
import TimeRangeFilter, { rangeForPreset } from '@/components/TimeRangeFilter'
import { createClient } from '@/lib/supabase/client'
import type { Article } from '@/types'
import styles from './page.module.css'

interface TrendingCluster {
  cluster_id: number
  source_count: number
  article_count: number
  article: Article
}

interface TrendingRegion {
  id: number
  name: string
  level: string
  article_count: number
}

export default function TrendsPage() {
  const supabase = createClient()
  // Default "Ultimi 3 giorni", non "Sempre": una vista tendenze senza
  // finestra temporale non avrebbe senso (mostrerebbe sempre le stesse
  // storie più vecchie e più coperte).
  const [timeRangeKey, setTimeRangeKey] = useState('3d')
  const [clusters, setClusters] = useState<TrendingCluster[] | null>(null)
  const [regions, setRegions] = useState<TrendingRegion[] | null>(null)

  useEffect(() => {
    async function load() {
      const { from, to } = rangeForPreset(timeRangeKey)

      const [clustersResponse, regionsResponse] = await Promise.all([
        supabase.rpc('get_trending_clusters', { p_from: from, p_to: to, p_limit: 20 }),
        supabase.rpc('get_region_article_counts', { p_from: from, p_to: to }),
      ])

      setClusters((clustersResponse.data ?? []) as TrendingCluster[])
      setRegions(((regionsResponse.data ?? []) as TrendingRegion[]).slice(0, 15))
    }

    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRangeKey])

  const maxRegionCount = regions?.length ? Math.max(...regions.map((r) => r.article_count)) : 1

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1>Tendenze</h1>
        <TimeRangeFilter value={timeRangeKey} onChange={setTimeRangeKey} />
      </div>

      <div className={styles.layout}>
        <section className={styles.stories}>
          <h2>Storie di tendenza</h2>
          <p className={styles.hint}>Notizie riprese da più fonti diverse nell&apos;intervallo scelto.</p>
          {clusters === null && (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          )}
          {clusters?.length === 0 && (
            <p className={styles.hint}>Nessuna storia multi-fonte in questo intervallo.</p>
          )}
          {clusters?.map((cluster) => (
            <ArticleCard
              key={cluster.cluster_id}
              article={cluster.article}
              badge={`${cluster.source_count} fonti`}
            />
          ))}
        </section>

        <aside className={styles.regionsPanel}>
          <div className={styles.regionsHeader}>
            <h2>Zone di tendenza</h2>
            <Link href="/map" className={styles.mapLink}>
              Apri la mappa →
            </Link>
          </div>
          {regions === null && <p className={styles.hint}>Caricamento…</p>}
          {regions?.length === 0 && <p className={styles.hint}>Nessun dato geografico in questo intervallo.</p>}
          <ol className={styles.regionList}>
            {regions?.map((region, index) => (
              <li key={region.id}>
                <Link href={`/map?region=${region.id}`} className={styles.regionRow}>
                  <span className={styles.regionMain}>
                    <span className={styles.rank}>{index + 1}.</span>
                    <span className={styles.regionName}>{region.name}</span>
                    <span className={styles.count}>{region.article_count}</span>
                  </span>
                  <span className={styles.volumeTrack}>
                    <span
                      className={styles.volumeBar}
                      style={{ width: `${(region.article_count / maxRegionCount) * 100}%` }}
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  )
}
