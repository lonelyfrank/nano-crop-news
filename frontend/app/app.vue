<template>
  <div class="app-shell">
    <header class="top-bar">
      <NuxtLink to="/" class="brand">Nano Crop News</NuxtLink>
      <nav class="top-nav">
        <NuxtLink to="/settings">Impostazioni</NuxtLink>
        <template v-if="user">
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
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
  max-width: 760px;
  margin: 0 auto;
  padding: 1.5rem;
}
</style>
