<template>
  <div class="app-shell">
    <header class="top-bar">
      <NuxtLink to="/" class="brand">Nano Crop News</NuxtLink>
      <nav class="top-nav">
        <NuxtLink to="/settings">Impostazioni</NuxtLink>
        <template v-if="user">
          <span class="user-email">{{ user.email }}</span>
          <button class="link-button" @click="handleLogout">Esci</button>
        </template>
        <template v-else>
          <NuxtLink to="/login">Accedi</NuxtLink>
        </template>
      </nav>
    </header>

    <main class="page-container">
      <NuxtPage />
    </main>
  </div>
</template>

<script setup lang="ts">
const user = useSupabaseUser()
const supabase = useSupabaseClient()

async function handleLogout() {
  await supabase.auth.signOut()
  await navigateTo('/')
}
</script>

<style>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.top-bar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 1.5rem;
  background: var(--bg);
  border-bottom: 1px solid var(--border-color);
}

@media (max-width: 480px) {
  .top-bar {
    padding: 0.75rem 1rem;
  }

  .top-nav {
    gap: 0.75rem;
    font-size: 0.9rem;
  }
}

.brand {
  font-weight: 700;
  font-size: 1.1rem;
  text-decoration: none;
  color: inherit;
}

.top-nav {
  display: flex;
  gap: 1.25rem;
  align-items: center;
}

.top-nav a {
  text-decoration: none;
  color: inherit;
}

.user-email {
  color: var(--muted-text);
  font-size: 0.85rem;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-button {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  cursor: pointer;
  color: inherit;
}

.page-container {
  flex: 1;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 1.5rem;
}

@media (max-width: 480px) {
  .page-container {
    padding: 1rem;
  }

  .user-email {
    display: none;
  }
}
</style>
