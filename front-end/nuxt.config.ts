import process from 'node:process'

import {
  appDescription,
  centralAnalyticsDomain,
  centralAnalyticsWebsiteId,
  dedicatedAnalyticsDomain,
  dedicatedAnalyticsWebsiteId,
} from './src/constants/index'

const isDev = process.env.NODE_ENV === 'development'
const analyticsDisabled = process.env.DISABLE_ANALYTICS === 'true'
const privateLinkScrubber = `(()=>{try{
const u=new URL(window.location.href);
const h=new URLSearchParams(u.hash.slice(1));
let changed=false;
let hash=u.hash;
const i=h.get("manageItem")||u.searchParams.get("manageItem");
const t=h.get("manageToken")||u.searchParams.get("manageToken");
if(i&&t){
  try{
    sessionStorage.setItem("np_sr_pending_management_claim",JSON.stringify({issuedAt:Date.now(),itemId:i,managementToken:t}));
    if(h.has("manageItem")||h.has("manageToken")){
      h.delete("manageItem");h.delete("manageToken");
      hash=h.toString()?"#"+h.toString():"";
    }
    u.searchParams.delete("manageItem");u.searchParams.delete("manageToken");
    changed=true;
  }catch{}
}
if(u.pathname==="/"||u.pathname==="/index.html"){
  if(u.searchParams.has("lat")||u.searchParams.has("lng")){
    u.searchParams.delete("lat");u.searchParams.delete("lng");changed=true;
  }
}
if(changed){
  history.replaceState(history.state,"",u.pathname+u.search+hash);
}
}catch{}})();`

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
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: appDescription },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: '#f5f0e5' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#0d1510' },
      ],
      script: [
        {
          innerHTML: privateLinkScrubber,
          tagPosition: 'bodyClose',
        },
        ...(isDev || analyticsDisabled
          ? []
          : [
            {
              'defer': true,
              'src': `https://${dedicatedAnalyticsDomain}/script.js`,
              'data-website-id': dedicatedAnalyticsWebsiteId,
            },
            {
              'defer': true,
              'src': `https://${centralAnalyticsDomain}/script.js`,
              'data-website-id': centralAnalyticsWebsiteId,
            },
          ]),
      ],
    },
  },

  colorMode: {
    classSuffix: '',
    preference: 'system',
  },
  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL || (isDev ? 'http://localhost:3006/api' : '/api'),
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
    payloadExtraction: 'client',
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
      routes: ['/', '/account', '/admin', '/help', '/service-directory', '/service-search', '/post', '/service-request', '/item-request', '/item-lending'],
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
  hooks: {
    'pages:extend': (pages) => {
      const compatibilityPage = pages.find(page => page.name === 'post')

      if (compatibilityPage) {
        pages.push({
          file: compatibilityPage.file,
          name: 'posts-id',
          path: '/posts/:id',
        })
      }
    },
  },

})
