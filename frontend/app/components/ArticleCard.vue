<template>
  <article class="article-card">
    <img
      v-if="article.image_url"
      :src="article.image_url"
      :alt="article.title"
      class="article-image"
      loading="lazy"
    >
    <div v-else class="article-image article-image--placeholder" />

    <div class="article-body">
      <div class="article-source">
        <img
          v-if="article.source.logo_url"
          :src="article.source.logo_url"
          :alt="article.source.name"
          class="source-logo"
        >
        <span>{{ article.source.name }}</span>
      </div>

      <h2 class="article-title">{{ article.title }}</h2>
      <p class="article-excerpt">{{ article.summary_text || article.excerpt }}</p>

      <a
        :href="article.original_url"
        target="_blank"
        rel="noopener noreferrer"
        class="read-original"
        @click="markAsRead"
      >
        Leggi l'originale →
      </a>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { Article } from '~/types'

const props = defineProps<{ article: Article }>()

const supabase = useSupabaseClient()
const user = useSupabaseUser()

function markAsRead() {
  if (!user.value) {
    return
  }

  supabase
    .from('user_reading_history')
    .upsert(
      { user_id: user.value.id, article_id: props.article.id, read_at: new Date().toISOString() },
      { onConflict: 'user_id,article_id' },
    )
    .then(() => {
      // Best-effort: non blocchiamo l'apertura dell'articolo se la chiamata fallisce.
    })
}
</script>

<style scoped>
.article-card {
  display: flex;
  gap: 1rem;
  padding: 1.25rem 0;
  border-bottom: 1px solid var(--border-color);
}

.article-image {
  width: 120px;
  height: 90px;
  object-fit: cover;
  border-radius: 8px;
  flex-shrink: 0;
  background: var(--border-color);
}

.article-image--placeholder {
  background: linear-gradient(135deg, var(--border-color), transparent);
}

.article-body {
  flex: 1;
  min-width: 0;
}

.article-source {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: var(--muted-text);
  margin-bottom: 0.35rem;
}

.source-logo {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  object-fit: cover;
}

.article-title {
  font-size: 1.05rem;
  margin: 0 0 0.4rem;
  line-height: 1.35;
}

.article-excerpt {
  margin: 0 0 0.5rem;
  color: var(--muted-text);
  font-size: 0.92rem;
  line-height: 1.5;
}

.read-original {
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
}
</style>
