import styles from './SkeletonCard.module.css'

export default function SkeletonCard() {
  return (
    <div className={styles.card} aria-hidden="true">
      <div className={styles.image} />
      <div className={styles.body}>
        <div className={`${styles.line} ${styles.short}`} />
        <div className={`${styles.line} ${styles.title}`} />
        <div className={styles.line} />
        <div className={styles.line} />
      </div>
    </div>
  )
}
