// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  modules: ['@nuxtjs/supabase'],

  supabase: {
    // Legge SUPABASE_URL / SUPABASE_KEY dall'ambiente (vedi .env.example).
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      // Pagine pubbliche: niente redirect automatico al login. /settings non
      // è in questa lista, quindi resta protetta dal middleware globale del
      // modulo (redirect a /login se non autenticato).
      exclude: ['/', '/login', '/register'],
    },
  },
})
