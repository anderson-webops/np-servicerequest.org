<script setup lang="ts">
import { appName } from '~/constants'

useHead({
  title: appName,
})
</script>

<template>
  <VitePwaManifest />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<style>
html,
body,
#__nuxt {
  min-height: 100%;
  margin: 0;
  padding: 0;
}

html {
  scroll-behavior: smooth;
  background: #f5f0e5;
}

body,
#__nuxt {
  min-height: 100vh;
}

html.dark {
  color-scheme: dark;
}
</style>
