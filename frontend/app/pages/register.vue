<template>
  <div class="auth-form">
    <h1>Registrati</h1>
    <form v-if="!confirmationSent" @submit.prevent="submit">
      <label>
        Nome
        <input v-model="name" type="text" required autocomplete="name">
      </label>
      <label>
        Email
        <input v-model="email" type="email" required autocomplete="email">
      </label>
      <label>
        Password
        <input v-model="password" type="password" required minlength="8" autocomplete="new-password">
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit" :disabled="loading">{{ loading ? 'Creazione account…' : 'Crea account' }}</button>
    </form>
    <p v-else>
      Controlla la tua casella email per confermare l'account, poi
      <NuxtLink to="/login">accedi</NuxtLink>.
    </p>
    <p v-if="!confirmationSent" class="switch">Hai già un account? <NuxtLink to="/login">Accedi</NuxtLink></p>
  </div>
</template>

<script setup lang="ts">
const supabase = useSupabaseClient()
const name = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const confirmationSent = ref(false)

async function submit() {
  loading.value = true
  error.value = ''
  try {
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.value,
      password: password.value,
      options: { data: { name: name.value } },
    })
    if (signUpError) throw signUpError

    if (data.session) {
      // Conferma email disattivata sul progetto: l'utente è già loggato.
      await navigateTo('/')
    } else {
      confirmationSent.value = true
    }
  } catch {
    error.value = 'Non è stato possibile creare l\'account. Controlla i dati inseriti.'
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
