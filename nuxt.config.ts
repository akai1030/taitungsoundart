// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: true },
  modules: ['@tresjs/nuxt'],
  ssr: true,
  css: ['~/assets/css/main.scss'],
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
        },
      },
    },
  },
  build: {
    transpile: ['three', 'gsap'],
  },
  routeRules: {
    '/**': { headers: { 'cache-control': 'no-store, no-cache, must-revalidate' } },
  },
})
