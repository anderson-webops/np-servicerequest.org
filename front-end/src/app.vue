<script setup lang="ts">
import { appName } from '~/constants'
import { isDarkThemeValue, themeSchemeStyleContent } from '~/utils/theme'

const colorMode = useColorMode()
const { activeScheme, scheme } = useThemeScheme()

useHead(() => ({
  htmlAttrs: {
    'data-theme-scheme': scheme.value,
  },
  title: appName,
  meta: [{
    id: 'theme-color-active',
    name: 'theme-color',
    content: () => isDarkThemeValue(colorMode.value)
      ? activeScheme.value.swatches.dark.surface
      : activeScheme.value.swatches.light.surface,
  }],
  style: [{
    key: 'np-service-request-theme-schemes',
    innerHTML: themeSchemeStyleContent,
  }],
}))
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<style>
:root {
  --page-inline: clamp(1.25rem, 4vw, 5rem);
  --page-inline-start: max(var(--page-inline), env(safe-area-inset-left));
  --page-inline-end: max(var(--page-inline), env(safe-area-inset-right));
  --page-block-start: max(0px, env(safe-area-inset-top));
  --page-block-end: max(0px, env(safe-area-inset-bottom));
}

html,
body,
#__nuxt {
  min-height: 100%;
  margin: 0;
  padding: 0;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

img,
svg,
video {
  display: block;
  max-width: 100%;
  height: auto;
}

html {
  scroll-behavior: smooth;
  scroll-padding-top: 6rem;
  background: var(--site-bg-start);
}

body,
#__nuxt {
  min-height: 100vh;
}

body {
  background: var(--site-bg-start);
  color: var(--site-text);
  overflow-x: hidden;
  transition:
    background-color 220ms ease,
    color 220ms ease;
  -webkit-tap-highlight-color: rgba(41, 70, 53, 0.12);
}

html.dark {
  color-scheme: dark;
}
</style>
