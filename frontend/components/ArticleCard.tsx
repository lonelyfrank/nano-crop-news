'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Article } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { estimateReadingMinutes, formatPublishedDate } from '@/lib/format'
import styles from './ArticleCard.module.css'

export default function ArticleCard({ article, badge }: { article: Article; badge?: string }) {
  const [user, setUser] = useState<User | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function markAsRead() {
    if (!user) return

    supabase
      .from('user_reading_history')
      .upsert(
        { user_id: user.id, article_id: article.id, read_at: new Date().toISOString() },
        { onConflict: 'user_id,article_id' },
      )
      .then(() => {
        // Best-effort: non blocchiamo l'apertura dell'articolo se la chiamata fallisce.
      })
  }

  return (
    <article className={styles.card}>
      {article.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- immagini da domini arbitrari (fonti RSS esterne), Next/Image richiederebbe un allowlist statico
        <img src={article.image_url} alt={article.title} className={styles.image} loading="lazy" />
      ) : (
        <div className={`${styles.image} ${styles.imagePlaceholder}`} />
      )}

      <div className={styles.body}>
        <div className={styles.source}>
          {article.source.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={article.source.logo_url} alt={article.source.name} className={styles.sourceLogo} />
          )}
          <span>{article.source.name}</span>
          {badge && <span className={styles.badge}>{badge}</span>}
        </div>

        <h2 className={styles.title}>{article.title}</h2>

        <p className={styles.meta}>
          {formatPublishedDate(article.published_at)}
          <span className={styles.metaSeparator}>·</span>
          <span title="Stima basata sull'anteprima, non sull'articolo completo">
            {estimateReadingMinutes(article.summary_text || article.excerpt)} min di lettura
          </span>
        </p>

        <p className={styles.excerpt}>{article.summary_text || article.excerpt}</p>

        <a
          href={article.original_url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.readOriginal}
          onClick={markAsRead}
        >
          Leggi l&apos;originale →
        </a>
      </div>
    </article>
  )
}
