<template>
  <p>Conferma in corso…</p>
</template>

<script setup lang="ts">
// Pagina di callback dopo la conferma email o un eventuale login OAuth
// futuro: il modulo @nuxtjs/supabase legge la sessione dall'URL in
// automatico, qui basta reindirizzare una volta pronta.
const user = useSupabaseUser()

watch(
  user,
  (value) => {
    if (value) {
      navigateTo('/')
    }
  },
  { immediate: true },
)
</script>
