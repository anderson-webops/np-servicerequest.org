import process from 'node:process'

import { appDescription } from './src/constants/index'

export default defineNuxtConfig({
  modules: [
    '@vueuse/nuxt',
    '@unocss/nuxt',
    '@pinia/nuxt',
    '@nuxtjs/color-mode',
  ],

  devtools: {
    enabled: process.env.NODE_ENV === 'development',
  },

  app: {
    head: {
      viewport: 'width=device-width,initial-scale=1',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'alternate icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: appDescription },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: '#294635' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#294635' },
      ],
    },
  },

  colorMode: {
    classSuffix: '',
  },
  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL || 'http://localhost:3006/api',
    },
  },

  srcDir: 'src',
  sourcemap: {
    client: false,
    server: false,
  },

  future: {
    compatibilityVersion: 4,
  },

  experimental: {
    payloadExtraction: true,
    renderJsonPayloads: true,
    serverAppConfig: false,
    typedPages: true,
  },

  compatibilityDate: '2024-08-14',

  nitro: {
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
    prerender: {
      crawlLinks: false,
      routes: ['/', '/service-request', '/item-request', '/item-lending'],
      ignore: ['/hi'],
    },
  },
  vite: {
    build: {
      modulePreload: {
        polyfill: false,
      },
    },
  },
})
