import type { Article } from '@/types'
import { estimateReadingMinutes, formatPublishedDate } from '@/lib/format'
import styles from './ArticleCard.module.css'

export default function ArticleCard({ article, badge }: { article: Article; badge?: string }) {
  return (
    <article className={styles.card}>
      {article.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- immagini da domini arbitrari (fonti RSS esterne), Next/Image richiederebbe un allowlist statico
        <img src={article.image_url} alt={article.title} className={styles.image} loading="lazy" />
      ) : (
        <div className={`${styles.image} ${styles.imagePlaceholder}`} />
      )}

      <div className={styles.body}>
        <div className={styles.meta}>
          <span className={styles.source}>
            {article.source.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={article.source.logo_url} alt={article.source.name} className={styles.sourceLogo} />
            )}
            {article.source.name}
          </span>
          <span>·</span>
          <span>{formatPublishedDate(article.published_at)}</span>
          <span>·</span>
          <span title="Stima basata sull'anteprima, non sull'articolo completo">
            {estimateReadingMinutes(article.summary_text || article.excerpt)} min di lettura
          </span>
          {badge && <span className={styles.badge}>{badge}</span>}
        </div>

        <h2 className={styles.title}>{article.title}</h2>

        <p className={styles.excerpt}>{article.summary_text || article.excerpt}</p>

        <a href={article.original_url} target="_blank" rel="noopener noreferrer" className={styles.readOriginal}>
          Leggi l&apos;originale →
        </a>
      </div>
    </article>
  )
}
