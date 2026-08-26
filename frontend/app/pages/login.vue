<template>
  <div class="auth-form">
    <h1>Accedi</h1>
    <form @submit.prevent="submit">
      <label>
        Email
        <input v-model="email" type="email" required autocomplete="email">
      </label>
      <label>
        Password
        <input v-model="password" type="password" required autocomplete="current-password">
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit" :disabled="loading">{{ loading ? 'Accesso…' : 'Accedi' }}</button>
    </form>
    <p class="switch">Non hai un account? <NuxtLink to="/register">Registrati</NuxtLink></p>
  </div>
</template>

<script setup lang="ts">
const supabase = useSupabaseClient()
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  loading.value = true
  error.value = ''
  try {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })
    if (signInError) throw signInError
    await navigateTo('/')
  } catch {
    error.value = 'Credenziali non valide.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-form {
  max-width: 360px;
  margin: 0 auto;
}

form {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.9rem;
}

input {
  padding: 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--text);
}

button {
  padding: 0.6rem;
  border-radius: 6px;
  border: none;
  background: var(--accent);
  color: white;
  cursor: pointer;
}

.error {
  color: #dc2626;
  font-size: 0.85rem;
}

.switch {
  margin-top: 1rem;
  font-size: 0.9rem;
}
</style>
